"""Live camera list from UniFi Protect + the built-in go2rtc's stream list (stage 3).

Run by service/run_all.py as the "cameras" child when PROTECT_API_KEY is set and GO2RTC_URL is empty (= use the
built-in go2rtc). Every minute it asks Protect for the cameras (every 5 minutes for the live views) and keeps two files
up to date — each written only when its content changes:
  - <house-dir>/protect-cameras.js   names, rooms, online/video flags and Protect's live views (no tokens); the
                                      dashboard server serves it to the pages, which re-read it every few minutes
  - <private-dir>/go2rtc.yaml        the built-in go2rtc's config: one low + one high stream per camera (the RTSPS
                                      URLs carry Protect access tokens: mode 0600, never logged, never served)
run_all.py restarts go2rtc when go2rtc.yaml changes (a new / renamed / removed camera).
Streams: Protect's existing RTSPS streams are used; missing high/low ones are created for online cameras.
Protect down or refusing the key: the files stay as they are (the panel keeps working), the error is logged once.

The API key comes from the environment only; it and the stream URLs are never printed.
Usage: python -I -u service/protect_sync.py --house-dir /data/house --private-dir /data/private [--once]
"""
import argparse
import os
import pathlib
import re
import socket
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import protect_to_go2rtc as pt  # noqa: E402  (Protect client, names → stream slugs, the panel's camera file)
sys.path.insert(0, str(ROOT / "service"))
import own_cameras  # noqa: E402  (cameras that aren't Protect's, added on the Manager page)

CAMERAS_EVERY = 60          # s between camera list checks (one small request)
VIEWS_EVERY = 300           # s between live view checks
STREAMS_EVERY = 1800        # s between re-reading every camera's stream URLs (someone may have deleted / recreated them)
RETRY_NO_VIDEO = 600        # s before trying again to get a stream for a camera that has none
# Older G3 cameras (G3 Flex / Instant / Bullet / Dome / Micro) send only 1–11 frames a second on Protect's low stream
# (their HD runs at 20–30 fps, measured): their grid tiles use Protect's medium (720p) stream instead.
# TILE_MEDIUM_MODELS (a regular expression on Protect's camera type, e.g. "UVC G3 Flex") changes the list; empty = none.
_TILE_MEDIUM = os.environ.get("TILE_MEDIUM_MODELS", r"\bG3\b")
TILE_MEDIUM_MODELS = re.compile(_TILE_MEDIUM) if _TILE_MEDIUM.strip() else None
QUALITIES = ("high", "medium", "low")
GO2RTC_INTERNAL_PORT = 1985   # go2rtc's API, inside the container only (the guard serves 1984)
GO2RTC_WEBRTC_PORT = 8555
BENCH_STREAMS = (("bench-360", "ffmpeg:virtual?video=testsrc2&size=640x360#video=h264"),
                 ("bench-1080", "ffmpeg:virtual?video=testsrc2&size=1080#video=h264"))


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def own_ip(towards):
    """The container's address on the LAN (what the panels reach go2rtc's WebRTC port at): the local end of a UDP
    'connection' towards Protect (nothing is sent)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect((towards, 9))
            return s.getsockname()[0]
    except OSError:
        return None


def go2rtc_config(streams, candidate):
    """The built-in go2rtc's config. Locked down: its API listens only inside the container (the panels reach it
    through service/go2rtc_guard.py on port 1984, which passes on only these streams) and answers only the player's
    paths (no web UI, no config editor, no /api/config with the tokens); RTSP on 127.0.0.1 only; no public STUN servers."""
    lines = ["# go2rtc config written by service/protect_sync.py - PRIVATE: the stream URLs contain Protect access tokens.",
             "api:", f'  listen: "127.0.0.1:{GO2RTC_INTERNAL_PORT}"',
             "  allow_paths: [/api/ws, /api/frame.jpeg]",
             # RTSP only inside the container: go2rtc's ffmpeg sources (the benchmark's test video) hand their picture
             # back through it — nothing outside the container can reach 127.0.0.1
             "rtsp:", '  listen: "127.0.0.1:8554"',
             "webrtc:", f'  listen: ":{GO2RTC_WEBRTC_PORT}"', "  ice_servers: []"]
    if candidate:
        lines += ["  candidates:", f"    - {candidate}:{GO2RTC_WEBRTC_PORT}"]
    # error only: go2rtc's warnings about a stream that won't start print its URL (with the token) to the log
    lines += ["log:", "  level: error", "streams:"]
    for name, url in streams:
        lines.append(f"  {name}: {pt.yaml_quote(url)}")
    # the panel benchmark's test video (app: bench.js): a moving test picture made by ffmpeg inside the container, only
    # while a panel plays it — no camera is touched. 360p for the live-tile ramp, 1080p for one full-screen tile.
    lines += [f"  {name}: {pt.yaml_quote(src)}" for name, src in BENCH_STREAMS]
    return "\n".join(lines) + "\n"


def write_if_changed(path, text, private=False):
    """Atomic write (temp file + rename) only when the content differs. Returns True when written."""
    try:
        if path.read_text(encoding="utf-8") == text:
            return False
    except OSError:
        pass
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    try:
        tmp.unlink()   # a left-over temp file would keep its old (maybe readable) mode
    except OSError:
        pass
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600 if private else 0o644)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    os.replace(tmp, path)
    return True


class Sync:
    def __init__(self, api, house_dir, private_dir, candidate):
        self.api, self.house, self.private, self.candidate = api, pathlib.Path(house_dir), pathlib.Path(private_dir), candidate
        self.streams = {}        # Protect camera id -> {"high": url, "low": url} (only non-empty)
        self.checked = {}        # Protect camera id -> monotonic time of the last stream read / create attempt
        self.views, self.views_at, self.streams_at = [], None, time.monotonic()
        self.problem = None      # the last error shown (each one logged once, until things work again)
        self.online = {}         # Protect camera id -> online at the last pass (back online: ask for streams at once)
        self.count = 0           # cameras in the last good list
        self.last_good = None    # Protect's last good (entries, streams, names): written with your own cameras

    def _streams_for(self, cam, online, force=False, tile="low"):
        cid = cam["id"]
        have = self.streams.get(cid)
        back_online = online and self.online.get(cid) is False
        due = force or have is None or (not have and (back_online or time.monotonic() - self.checked.get(cid, 0) > RETRY_NO_VIDEO))
        if not due:
            return have or {}
        self.checked[cid] = time.monotonic()
        try:
            have = {k: v for k, v in (self.api.streams(cid) or {}).items() if v and k in QUALITIES}
        except pt.HttpError:
            have = dict(have or {})
        need = [q for q in ("high", tile) if not have.get(q)] if online else []
        if need:
            try:
                have.update({k: v for k, v in (self.api.create(cid, need) or {}).items() if v and k in QUALITIES})
            except pt.HttpError:
                if len(need) == 2:   # some cameras can't make a low / medium stream: high alone
                    try:
                        have.update({k: v for k, v in (self.api.create(cid, ["high"]) or {}).items() if v and k == "high"})
                    except pt.HttpError:
                        pass
        self.streams[cid] = have
        time.sleep(0.4)  # Protect rate-limits its API
        return have

    def once(self):
        """One pass. Returns (camera file written, go2rtc config written). Protect failing: your own cameras still go
        in, next to Protect's last good list (on a fresh start without one, only when go2rtc has no config at all
        yet — an old config with Protect's streams is kept rather than replaced by one without them)."""
        try:
            entries, streams, used = self._protect_pass()
        except Exception:
            if self.last_good is not None:
                self._write(*self.last_good)
            elif not (self.private / "go2rtc.yaml").exists():
                self._write([], [], set())
            raise
        self.last_good = (entries, streams, used)
        return self._write(entries, streams, used)

    def _protect_pass(self):
        """Protect's cameras: (entries, go2rtc streams, stream names used)."""
        cams = self.api.cameras() if self.api else []   # (no Protect key: only your own cameras)
        if not isinstance(cams, list):
            raise pt.Fail("Unexpected answer from Protect's camera list.")
        if not cams and self.count:
            raise pt.Fail("Protect answered with no cameras at all (a hiccup?)")   # keep the last list and streams
        now = time.monotonic()
        refresh = now - self.streams_at > STREAMS_EVERY
        if self.api and (self.views_at is None or now - self.views_at > VIEWS_EVERY):
            try:
                self.views = self.api.liveviews() or []
            except pt.HttpError:
                pass  # keep the last ones
            self.views_at = now
        entries, streams, used = [], [], set()
        ids = set()
        for c in sorted((c for c in cams if isinstance(c, dict) and c.get("id")), key=lambda c: (c.get("name") or "", c["id"])):
            ids.add(c["id"])
            disp = pt.display_name(c.get("name") or c["id"])
            s = pt.slug(disp) or f"camera-{str(c['id'])[-4:]}"
            if s in used or f"{s}-hd" in used:
                s = f"{s}-{str(c['id'])[-4:]}"
            used.update((s, f"{s}-hd"))
            online = c.get("state") == "CONNECTED"
            tile = "medium" if TILE_MEDIUM_MODELS and TILE_MEDIUM_MODELS.search(str(c.get("type") or "")) else "low"
            have = self._streams_for(c, online, force=refresh, tile=tile)
            self.online[c["id"]] = online
            hi, lo = have.get("high"), have.get(tile) or have.get("low")
            entries.append({"id": str(c["id"]), "name": disp, "slug": s, "online": online, "video": bool(hi or lo),
                            "tileHd": tile == "medium" and bool(hi)})   # the page: HD tile in small views (cameras.js)
            if hi or lo:
                streams += [(s, pt.to_go2rtc(lo or hi)), (f"{s}-hd", pt.to_go2rtc(hi or lo))]
        for gone in set(self.streams) - ids:   # removed from Protect
            self.streams.pop(gone, None)
            self.checked.pop(gone, None)
            self.online.pop(gone, None)
        if refresh:
            self.streams_at = now   # only once the whole pass got through
        self.count = len(entries)
        return entries, streams, used

    def _write(self, entries, streams, used):
        own_entries, own_streams, own_views = own_cameras.for_sync(own_cameras.load(self.private), used)
        entries, streams = entries + own_entries, streams + own_streams
        hub = pt.hubitat_data(self.house / "hubitat-data.js")
        text, panel_cams, _ = pt.panel_cameras_js(entries, self.views, hub, own_views)
        wrote_js = write_if_changed(self.house / "protect-cameras.js", text)
        wrote_cfg = write_if_changed(self.private / "go2rtc.yaml", go2rtc_config(streams, self.candidate), private=True)
        if wrote_js or wrote_cfg:
            with_video = sum(1 for e in entries if e["video"] and not e.get("own"))
            log(f"cameras: {self.count} from Protect, {with_video} with video, {len(self.views)} live view(s), {len(own_entries)} of your own"
                f"{' - camera list updated' if wrote_js else ''}{' - go2rtc streams updated' if wrote_cfg else ''}")
        return wrote_js, wrote_cfg

    def run(self, stop=lambda: False):
        while not stop():
            try:
                self.once()
                if self.problem:
                    log("Protect answers again")
                    self.problem = None
            except pt.Fail as e:
                if str(e) != self.problem:
                    log(f"ERROR {e} - the panel keeps the last camera list; trying again every minute")
                    self.problem = str(e)
            except Exception as e:  # never print details that could contain a URL
                if type(e).__name__ != self.problem:
                    log(f"ERROR camera sync failed ({type(e).__name__}) - trying again in a minute")
                    self.problem = type(e).__name__
            own_was = self.own_sig()
            for _ in range(CAMERAS_EVERY):
                if stop():
                    return
                time.sleep(1)
                if self.own_sig() != own_was:   # a camera added / changed on the Manager page: at once
                    break

    def own_sig(self):
        try:
            st = (self.private / own_cameras.FILE).stat()
            return st.st_mtime_ns, st.st_size
        except OSError:
            return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--house-dir", required=True)
    ap.add_argument("--private-dir", required=True)
    ap.add_argument("--once", action="store_true", help="one pass, then exit")
    ap.add_argument("--mock", metavar="JSON", help="fake Protect data (offline test, scripts/protect_mock.json)")
    a = ap.parse_args()
    host = (os.environ.get("PROTECT_HOST") or "").strip()   # (no default address: v2.2.0)
    if a.mock:
        api = pt.MockProtect(a.mock)
    else:
        key = (os.environ.get("PROTECT_API_KEY") or "").strip()
        api = pt.Protect(host, key) if key and host else None
        if not key:
            log("no Protect API key - only your own cameras (Manager page, Cameras tab)")
        elif not host:   # (the Health page says so too: server.py health_checks)
            log("no Protect console address - the Protect cameras wait until it is set (Manager: Integrations, UniFi Protect)")
    candidate = (os.environ.get("GO2RTC_CANDIDATE") or "").strip() or own_ip(host if api else "192.0.2.1")
    log(f"camera sync: {'Protect at ' + host if api else 'no Protect'}; panels reach go2rtc's video at {candidate or '(unknown address)'}:{GO2RTC_WEBRTC_PORT}")

    sync = Sync(api, a.house_dir, a.private_dir, candidate)
    if a.once:
        sync.once()
        return 0
    sync.run()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
