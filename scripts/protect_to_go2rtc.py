"""UniFi Protect cameras -> go2rtc config for the wall panel.

Reads the Protect API key from the project folder's .env (PROTECT_API_KEY=..., PROTECT_HOST=192.168.1.2) -
or, when .env doesn't exist or lacks them (Docker), from environment variables of the same names -
asks Protect (official Integration API) for every camera's RTSPS streams, creating them if needed, and writes
private/go2rtc.yaml (in the project folder) with stream names the panel expects:
    <slug>     low quality  (camera grids)
    <slug>-hd  high quality (full screen)
slug = camera name without " Camera", lowercase, anything else -> "-"   ("Front Door Camera" -> "front-door").

The key and the stream URLs (they contain access tokens) are never printed.

Usage (from the project folder):
    python -I scripts/protect_to_go2rtc.py --dry-run     # list cameras + planned names, change nothing
    python -I scripts/protect_to_go2rtc.py               # create missing streams, write private/go2rtc.yaml
    python -I scripts/protect_to_go2rtc.py --mock protect_mock.json   # offline test with fake data
"""
import argparse
import json
import os
import pathlib
import re
import ssl
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"
OUT = ROOT / "private" / "go2rtc.yaml"
PANEL_DATA = ROOT / "dashboard" / "layouts" / "v4" / "shared" / "hubitat-data.js"
PANEL_CAMS = ROOT / "dashboard" / "layouts" / "v4" / "shared" / "protect-cameras.js"   # names only, no tokens
CANDIDATE_HOST = os.environ.get("GO2RTC_CANDIDATE") or "192.168.1.50"   # (the address the tablets reach go2rtc on: the WebRTC candidate)


class Fail(Exception):
    pass


def load_env():
    """.env wins; the Windows environment is only a fallback. Returns (values, where each came from)."""
    env, src = {}, {}
    if ENV.exists():
        for line in ENV.read_text(encoding="utf-8-sig", errors="replace").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
                src[k.strip()] = ".env"
    for k in ("PROTECT_API_KEY", "PROTECT_HOST"):
        if not env.get(k) and os.environ.get(k):
            env[k], src[k] = os.environ[k], "environment variable"
    return env, src


def display_name(name):
    return re.sub(r"\s*Camera\s*$", "", name.replace(" Camera ", " ")).strip() or name


def slug(name):
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))


def to_go2rtc(url):
    """rtsps://host:7441/token?enableSrtp -> rtspx://host:7441/token (go2rtc: RTSP over TLS, no cert check)."""
    return re.sub(r"\?enableSrtp$", "", re.sub(r"^rtsps://", "rtspx://", url))


# ---------------------------------------------------------------- Protect access
class Protect:
    def __init__(self, host, key):
        self.base = f"https://{host}/proxy/protect/integration/v1"
        self.key = key
        self.host = host
        ctx = ssl.create_default_context()   # self-signed console cert: skip verification for this host only
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        # never follow redirects: urllib would carry the X-API-Key header to wherever a 3xx points
        self.opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx), NoRedirect())

    def _req(self, method, path, body=None):
        # Protect rate-limits its API (HTTP 429). Wait and retry, honouring Retry-After, before giving up.
        for attempt in range(6):
            try:
                return self._once(method, path, body)
            except HttpError as e:
                if e.code != 429 or attempt == 5:
                    raise
                time.sleep(min(30, e.retry_after or 2 ** (attempt + 1)))

    def _once(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"X-API-Key": self.key, "Accept": "application/json", "Content-Type": "application/json"})
        try:
            with self.opener.open(req, timeout=20) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                ra = e.headers.get("Retry-After") if e.headers else None
                raise HttpError(429, float(ra) if ra and ra.replace(".", "", 1).isdigit() else None) from None
            if e.code in (401, 403):
                raise Fail(f"Protect refused the API key (HTTP {e.code}). Check the Protect API key (Manager → Integrations → UniFi Protect), and that the key was "
                           "created by an Owner/Super Admin on the Protect console.") from None
            if e.code == 404 and path == "/cameras":
                raise Fail("Protect's Integration API was not found (HTTP 404). Update UniFi Protect to 6.x or newer.") from None
            raise HttpError(e.code) from None
        except urllib.error.URLError as e:
            raise Fail(f"Can't reach Protect at {self.host} ({e.reason}). Is the UNVR on and the address right?") from None
        except TimeoutError:
            raise Fail(f"Protect at {self.host} did not answer in time.") from None

    def cameras(self):
        return self._req("GET", "/cameras")

    def streams(self, cam_id):
        return self._req("GET", f"/cameras/{cam_id}/rtsps-stream")

    def create(self, cam_id, qualities):
        return self._req("POST", f"/cameras/{cam_id}/rtsps-stream", {"qualities": qualities})

    def liveviews(self):
        return self._req("GET", "/liveviews")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Fail(f"Protect answered with a redirect (HTTP {code}); refusing to send the API key elsewhere. "
                   "Check PROTECT_HOST (the Protect console's address, e.g. 192.168.1.2).")


class HttpError(Exception):
    def __init__(self, code, retry_after=None):
        super().__init__(f"HTTP {code}")
        self.code = code
        self.retry_after = retry_after


class MockProtect:
    """Offline stand-in: {"cameras": [...], "streams": {id: {...}}, "noLow": [ids that can't make a low stream]}."""

    def __init__(self, path):
        self.d = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
        self.d.setdefault("streams", {})
        if self.d.get("fail"):
            raise Fail({"auth": "Protect refused the API key (HTTP 401). (mock)", "down": "Can't reach Protect (mock)."}[self.d["fail"]])

    def cameras(self):
        return self.d["cameras"]

    def streams(self, cam_id):
        s = self.d["streams"].get(cam_id, {})
        return {q: s.get(q) for q in ("high", "medium", "low", "package")}

    def liveviews(self):
        return self.d.get("liveviews", [])

    def create(self, cam_id, qualities):
        if "low" in qualities and cam_id in self.d.get("noLow", []):
            raise HttpError(400)
        s = self.d["streams"].setdefault(cam_id, {})
        for q in qualities:
            s[q] = s.get(q) or f"rtsps://192.168.1.2:7441/MOCKTOKEN{cam_id}{q}?enableSrtp"
        return {q: s.get(q) for q in ("high", "medium", "low", "package")}


# ---------------------------------------------------------------- main
def hubitat_data(path=None):
    try:
        t = (path or PANEL_DATA).read_text(encoding="utf-8")
        return json.loads(t[t.index("{"):t.rindex("}") + 1])
    except Exception:
        return {}


def panel_cameras():
    return [c["name"] for c in hubitat_data().get("cameras", [])]


def write_panel_cameras(entries, out, liveviews=()):
    text, cams, views = panel_cameras_js(entries, liveviews)
    out.write_text(text, encoding="utf-8")
    return cams, views


def panel_cameras_js(entries, liveviews=(), hub=None, own_views=()):
    """The panel's camera list comes from Protect (cameras don't go through Hubitat). Hubitat is only used to look up
    the room, the doorbell flag and a stable numeric id for cameras it also knows; others get an id from Protect's id.
    Protect's live views become the panel's camera views (camera ids translated to the panel's ids).
    Returns (the protect-cameras.js text, cameras, views); hub = the house model (default: the laptop's copy)."""
    hub = hubitat_data() if hub is None else hub
    by_slug = {slug(c["name"]): c for c in hub.get("cameras", [])}
    rooms = sorted({r["name"] for r in hub.get("rooms", [])} | {c.get("room") for c in hub.get("cameras", []) if c.get("room")}, key=len, reverse=True)
    cams, pid = [], {}
    for e in entries:
        if e.get("own"):   # a camera of your own (service/own_cameras.py): its own id and room
            pid[e["id"]] = e["num"]
            cams.append({"id": e["num"], "name": e["name"], "stream": e["slug"], "room": e.get("room"), "doorbell": False,
                         "online": True, "video": True, "own": True})
            continue
        h = by_slug.get(e["slug"])
        room = h["room"] if h else next((r for r in rooms if e["name"].lower().startswith(r.lower())), None)
        num = h["id"] if h else 900000 + int(e["id"][-5:], 16) if re.fullmatch(r"[0-9a-fA-F]{5}", e["id"][-5:]) else 900000 + len(cams)
        pid[e["id"]] = num
        # stream = go2rtc's stream name (differs from the name's slug for duplicate names / names without letters)
        cams.append({"id": num, "name": e["name"], "stream": e["slug"], "room": room, "doorbell": bool(h and h.get("doorbell")), "online": e["online"], "video": e["video"],
                     **({"tileHd": True} if e.get("tileHd") else {}),
                     # (v3.0.5) the doorbell's own Hubitat device (its "pushed" rings, its screen text) from the house model
                     **({"doorbellDevice": h["doorbellDevice"]} if h and h.get("doorbell") and isinstance(h.get("doorbellDevice"), int)
                        and not isinstance(h.get("doorbellDevice"), bool) else {})})
    views = []
    for lv in sorted(liveviews, key=lambda v: (not v.get("isDefault"), v.get("name", ""))):
        slots = [{"cameras": [pid[c] for c in (s.get("cameras") or []) if c in pid], "cycleMode": s.get("cycleMode") or "time",
                  "cycleInterval": s.get("cycleInterval") or 10} for s in (lv.get("slots") or [])]
        views.append({"id": str(lv.get("id", "")), "name": lv.get("name") or "View", "layout": lv.get("layout") or len(slots),
                      "isDefault": bool(lv.get("isDefault")), "isGlobal": bool(lv.get("isGlobal")), "slots": slots})
    known = {c["id"] for c in cams}
    for v in own_views:   # your own views (already in the panels' camera ids)
        slots = [s for s in v["slots"] if all(i in known for i in s["cameras"])]
        if slots:
            views.append({**v, "layout": len(slots), "slots": slots})

    text = ("// Generated from UniFi Protect (service/protect_sync.py, or scripts/protect_to_go2rtc.py) - names only, no tokens.\n"
            "// Cameras and camera views (Protect live views) come straight from Protect.\n"
            f"if (window.HUBITAT) HUBITAT.cameras = {json.dumps(cams, indent=1)};\n"
            f"window.PROTECT_LIVEVIEWS = {json.dumps(views, indent=1)};\n")
    return text, cams, views


def yaml_quote(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def write_yaml(streams, out, harden=False):
    # --harden: only the API paths the panel's player uses (no web UI, no config editor, no /api/config with the
    # tokens), and the RTSP re-stream only on Unraid itself. Without it the web UI + editor stay open for setup.
    # origin "*": the dashboard page is served from another address (laptop now, a Docker container later), and go2rtc
    # refuses player WebSockets from other origins without it.
    api = ['  listen: ":1984"', '  origin: "*"'] + (["  allow_paths: [/api/ws, /api/webrtc, /api/frame.jpeg]"] if harden else [])
    rtsp = '  listen: "127.0.0.1:8554"' if harden else '  listen: ":8554"'
    lines = ["# go2rtc config for the wall panel - generated by scripts/protect_to_go2rtc.py" + (" (hardened)" if harden else ""),
             "# PRIVATE: the stream URLs contain Protect access tokens. Don't share or post this file.",
             "api:", *api, "rtsp:", rtsp, "webrtc:", '  listen: ":8555"',
             "  candidates:", f"    - {CANDIDATE_HOST}:8555", "streams:"]
    for name, url in streams:
        lines.append(f"  {name}: {yaml_quote(url)}")
    out.parent.mkdir(exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="list cameras and planned names; create nothing, write nothing")
    ap.add_argument("--mock", metavar="JSON", help="use fake Protect data from a JSON file (offline test)")
    ap.add_argument("--harden", action="store_true",
                    help="locked-down config: only the panel's video API, no web UI/config editor, RTSP only on Unraid itself")
    a = ap.parse_args()

    if a.mock:
        api = MockProtect(a.mock)
    else:
        env, src = load_env()
        key = env.get("PROTECT_API_KEY")
        if not key:
            raise Fail(f"No PROTECT_API_KEY found. Add a line PROTECT_API_KEY=... to {ENV} (Notepad), or set the "
                       "PROTECT_API_KEY environment variable (Docker), then run this again.")
        host = env.get("PROTECT_HOST")
        if not host:
            raise Fail("No PROTECT_HOST found: add PROTECT_HOST=<your Protect console's address> next to the key, then run this again.")
        print(f"API key from {src['PROTECT_API_KEY']}; Protect host {host} ({src.get('PROTECT_HOST', 'default')}).")
        api = Protect(host, key)

    cams = api.cameras()
    if not isinstance(cams, list):
        raise Fail("Unexpected answer from Protect's camera list.")
    print(f"Protect reports {len(cams)} cameras.\n")

    streams, missing_low, offline, seen, used, panel_entries, no_video = [], [], [], {}, set(), [], []
    for c in sorted(cams, key=lambda c: (c.get("name", ""), c.get("id", ""))):
        name = c.get("name") or c.get("id", "?")
        disp = display_name(name)
        s = slug(disp) or f"camera-{str(c.get('id', 'x'))[-4:]}"   # names with no letters/digits
        if s in used or f"{s}-hd" in used:                           # two cameras with the same name, or "X" vs "X HD"
            s = f"{s}-{str(c.get('id', 'x'))[-4:]}"
            print(f"  note: duplicate name '{disp}' -> using '{s}'. Rename one in Protect so the panel shows the right one.")
        used.update((s, f"{s}-hd"))
        online = c.get("state") == "CONNECTED"
        if a.dry_run:
            print(f"  ?  {name:<34} -> {s}  /  {s}-hd{'' if online else '  (offline now)'}")
            seen[s] = disp
            continue
        try:
            have = {k: v for k, v in (api.streams(c["id"]) or {}).items() if v}
        except HttpError:
            have = {}
        if online:
            need = [q for q in ("high", "low") if not have.get(q)]
            if need:
                try:
                    have.update({k: v for k, v in (api.create(c["id"], need) or {}).items() if v})
                except HttpError as e:
                    if "high" in need and "low" in need:          # low not available on this camera -> try high alone
                        try:
                            have.update({k: v for k, v in (api.create(c["id"], ["high"]) or {}).items() if v})
                        except HttpError as e2:
                            print(f"  !  {name:<34} could not create streams ({e2})")
                    else:
                        print(f"  !  {name:<34} could not create the {need[0]} stream ({e})")
        hi, lo = have.get("high"), have.get("low")
        # every Protect camera goes on the panel; video=False until it has a stream
        panel_entries.append({"id": str(c.get("id", "")), "name": disp, "slug": s, "online": online, "video": bool(hi or lo)})
        seen[s] = disp
        if not online:
            offline.append(name)
        if not hi and not lo:
            no_video.append(name)
            print(f"  -  {name:<34} {'offline' if not online else 'no stream yet'} - shown on the panel without video; re-run later")
            continue
        if not lo:
            missing_low.append(name)
        streams += [(s, to_go2rtc(lo or hi)), (f"{s}-hd", to_go2rtc(hi or lo))]
        print(f"  ok {name:<34} -> {s}{'' if lo else ' (high only)'}  /  {s}-hd{'' if online else '  (offline now, kept stream)'}")
        if not a.mock:
            time.sleep(0.4)   # be gentle: Protect rate-limits its API

    if a.dry_run:
        print("\nDry run: nothing created, nothing written.")
        return

    print(f"\nPanel: {len(panel_entries)} cameras from Protect, {len(panel_entries) - len(no_video)} with video.")
    if no_video:
        print(f"{len(no_video)} without video yet (offline, or Protect was busy) - run this script again later:")
        for n in no_video:
            print(f"  {n}")
    if missing_low:
        print(f"{len(missing_low)} camera(s) have no Low stream; full quality is used for their grid tile too: {', '.join(missing_low)}")

    if not streams:
        raise Fail("No streams to write.")
    out = OUT.with_name("go2rtc.mock.yaml") if a.mock else OUT   # a test run never overwrites the real file
    write_yaml(streams, out, a.harden)
    print(f"\nWrote {out} ({len(streams)} streams).{'' if a.mock else ' It contains access tokens - keep it private.'}")

    # Protect's live views (layouts) -> the panel's camera views; manage them in Protect
    try:
        lvs = api.liveviews() or []
    except HttpError as e:
        lvs = []
        print(f"Could not read Protect's live views ({e}); the panel keeps its own views.")
    pc_out = PANEL_CAMS.with_name("protect-cameras.mock.js") if a.mock else PANEL_CAMS
    cams_out, views = write_panel_cameras(panel_entries, pc_out, lvs)
    print(f"Wrote the panel's camera list ({len(cams_out)} cameras) and {len(views)} live view(s) from Protect"
          f"{': ' + ', '.join(v['name'] for v in views) if views else ''} to {pc_out.name} (names only).")


if __name__ == "__main__":
    try:
        main()
    except Fail as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
