"""Health monitor (release 2): what is wrong with the house's Skypane setup right now, and what went wrong lately.

The server runs a Monitor: every CHECK_SECONDS it asks a list of checks (Hubitat bridge, MQTT broker, go2rtc, Protect,
UniFi, every panel's last check-in…) and keeps the problems they report. Each problem has an id (the same problem keeps
its id from check to check), a short title, details, a level (2 notice, 3 warning, 4 alert) and first-seen /
resolved times. A problem must be seen CONFIRM checks in a row before it counts (a one-off hiccup is not a problem);
it is resolved the first check it is gone.

Kept in DATA_DIR/private/health.json (private: the details may name addresses):
  {"v": 1, "open": {"<id>": problem}, "pending": {"<id>": count}, "seen": {"<panel>": epoch s}, "log": [event…],
   "history": [bucket…]}
  event = {"at", "what": "problem" | "resolved", "id", "title", "details", "lvl"} — at most LOG_MAX, newest last.
  bucket = {"t": the hour (epoch s), "p": {part: [worst level, checks fine, checks]}} — one per hour, HISTORY_HOURS
  kept (v2.7.0: the Health page's small bars per part: hub, broker, cameras, panels, other).
Panels' last check-ins are kept there too, so a restart doesn't forget when a panel was last heard.

Everything that talks to the network comes in as a probe (a plain function), so the tests need no network:
  monitor = Monitor(path, [bridge_check(app.notifier.bridge), mqtt_check(app.notifier.connected),
                           service_check("go2rtc", "Camera video (go2rtc) is not running", probe), …,
                           panels_check(panel_names)], clock=time.time)
A check is a function (monitor) → a list of problems (problem(...) dicts); an exception in a check is itself a
problem ("<check> could not be checked"), never a crash.

For Hubitat (docs/hubitat-notifier.md): heartbeat() is the short message the server publishes on HEALTH_TOPIC every
CHECK_SECONDS; the bridge relays it to the Skypane Notifier, which says "offline" when it stops.
"""
import json
import os
import re
import socket
import threading
import time

LOG_MAX = 500            # events kept in the log
HISTORY_HOURS = 48       # hourly buckets kept for the Health page's bars
PARTS = ("hub", "broker", "cameras", "panels", "other")
CHECK_SECONDS = 30       # how often the checks run (and the heartbeat goes to Hubitat)
CONFIRM = 2              # a problem counts after this many checks in a row
PANEL_MINUTES = 5        # a panel not heard from for this long is "disconnected" (still listed by its name)
HEALTH_TOPIC = "dashboard/health"   # (MQTT; only the internal login may write dashboard/#)
ID_RE = re.compile(r"[a-z0-9_.:-]{1,80}")
TEXT_MAX, DETAILS_MAX = 80, 300
LEVELS = (2, 3, 4)       # 2 notice, 3 warning, 4 alert (as the notifier's levels; 5 is for life safety only)
CHECKIN_FIELDS = {"version", "page", "agent", "from"}   # what a panel's check-in may tell (short strings; "from": the
# address it came from — set by the server, not the panel: check-ins need no login, so the Health page shows where one
# came from and a made-up one from another address shows up; real pairing of tablets is stage 6)


def _plain(v, n):
    t = re.sub(r"[\x00-\x1f\x7f]", " ", v if isinstance(v, str) else "").strip()
    return t[:n].strip()


def problem(pid, title, details="", level=3):
    """One problem: {"id", "title", "details", "lvl"}. ValueError on a bad id (a check's own bug)."""
    if not isinstance(pid, str) or not ID_RE.fullmatch(pid):
        raise ValueError(f"bad problem id {pid!r}")
    return {"id": pid, "title": _plain(title, TEXT_MAX) or pid, "details": _plain(details, DETAILS_MAX),
            "lvl": level if level in LEVELS else 3}


def part_of(pid):
    """Which part of the house a problem id is about (as the Manager's pill: hubitat → hub, mqtt → broker…)."""
    k = re.split(r"[:.]", str(pid or ""))[0]
    if k == "hubitat":
        return "hub"
    if k == "mqtt":
        return "broker"
    if k in ("protect", "go2rtc", "camera", "cameras", "video"):
        return "cameras"
    if k == "panel":
        return "panels"
    return "other"


def ago(seconds):
    """A plain "how long ago": "40 s", "12 min", "3 h", "2 days"."""
    s = max(0, int(seconds))
    if s < 90:
        return f"{s} s"
    if s < 90 * 60:
        return f"{round(s / 60)} min"
    if s < 36 * 3600:
        return f"{round(s / 3600)} h"
    return f"{round(s / 86400)} days"


# ---------- checks (each returns a function monitor → [problem…]) ----------
def bridge_check(status, enabled=None):
    """status() → "online" / "offline" / "unknown" (server.Notifier.bridge). enabled() false (v3.0.0: no hub address
    saved yet — a fresh install): nothing to expect, no problem (the Manager shows the hub "Not set up")."""
    def check(_m):
        if enabled is not None and not enabled():
            return []
        s = status()
        if s == "online":
            return []
        if s == "unknown":
            return [problem("hubitat.bridge", "Hubitat bridge not heard from yet",
                            "The bridge has not said it is running. Panels may not get device changes.", 3)]
        return [problem("hubitat.bridge", "Hubitat bridge not running",
                        "Switches and sensors on the panels don't follow the house until it's back.", 4)]
    return check


def mqtt_check(connected):
    """connected() → None (no broker set up: nothing to check), True or False (server.Notifier.connected)."""
    def check(_m):
        c = connected()
        if c is None or c:
            return []
        return [problem("mqtt", "Message broker (MQTT) not connected",
                        "Panels don't hear device changes or alerts, and Hubitat doesn't hear from the server.", 4)]
    return check


def service_check(pid, title, probe, level=3):
    """A thing that is up or down. probe() → None (not used in this house: no problem), True (fine), False or a
    string (down; the string is the details)."""
    def check(_m):
        r = probe()
        if r is None or r is True:
            return []
        return [problem(pid, title, r if isinstance(r, str) else "", level)]
    return check


def panels_check(panels, minutes=PANEL_MINUTES, level=3):
    """panels() → [(panel id, name)…] (every panel set up in the Manager). A panel not heard from for `minutes` is
    disconnected — counted from its last check-in, or from when the monitor started when it never checked in."""
    def check(m):
        out, now = [], m.clock()
        for pid, name in panels():
            pid = str(pid).lower()
            seen = m.last_seen(pid)
            since = seen if seen is not None else m.started
            if now - since < minutes * 60:
                continue
            label = _plain(name, 40) or pid
            # ("Main panel is disconnected", not "Panel Main panel …"; never checked in: most likely no tablet yet)
            label = label if re.search(r"\bpanel\b", label, re.IGNORECASE) else f"Panel {label}"
            out.append(problem(f"panel:{pid}"[:80], f"{label} is disconnected" if seen is not None else f"{label} never checked in",
                               f"Last check-in {ago(now - seen)} ago." if seen is not None
                               else "No check-in from its tablet yet — open its address on the tablet (Manager → Panels).", level))
        return out
    return check


# ---------- probes (helpers for service_check; the server picks which to use) ----------
def tcp_probe(host, port, timeout=3.0, down="not reachable"):
    """A probe: can we open a TCP connection to host:port? None when no host is set. host may be a function (read at
    every check: an address changed in the Manager counts at once)."""
    def probe():
        h = host() if callable(host) else host
        if not h:
            return None
        try:
            with socket.create_connection((h, int(port)), timeout=timeout):
                return True
        except OSError as e:
            return f"{down} ({type(e).__name__})"
    return probe


def url_probe(url, timeout=3.0, down="not reachable"):
    """A probe for an address like http://192.168.1.5:1984 (e.g. a separate go2rtc): TCP to its host and port (80 / 443
    by default). None when no address is set; "its address isn't valid" for a broken one. url may be a function."""
    def probe():
        u = (url() if callable(url) else url) or ""
        if not u.strip():
            return None
        m = re.fullmatch(r"(?:(https?|wss?)://)?([A-Za-z0-9.-]+|\[[0-9a-fA-F:]+\])(?::(\d{1,5}))?(?:[/?#].*)?", u.strip())
        if not m:
            return "its address isn't valid"
        port = int(m.group(3)) if m.group(3) else (443 if m.group(1) in ("https", "wss") else 80)
        return tcp_probe(m.group(2).strip("[]"), port, timeout, down)()
    return probe


def status_file_probe(path, max_age=None, clock=time.time):
    """A probe for a child's status file ({"ok": bool, "error": text, "readAt": epoch s}, e.g. guest Wi-Fi's): None
    when the file isn't there (the feature isn't used), its error text when not ok (unless "needsSetup": it answered
    fine, something is only still to be set up), "no news for …" when readAt is older than max_age seconds."""
    def probe():
        try:
            st = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        except (OSError, ValueError):
            return "its status file can't be read"
        if not isinstance(st, dict):
            return "its status file can't be read"
        at = st.get("readAt")
        if max_age and isinstance(at, (int, float)) and clock() - at > max_age:
            return f"no news for {ago(clock() - at)}"
        if st.get("ok") is False and st.get("needsSetup") is not True:   # (v3.0.3: still to be set up isn't a fault)
            return _plain(st.get("error"), DETAILS_MAX) or "it reports a problem"
        return True
    return probe


# ---------- the monitor ----------
class Monitor:
    def __init__(self, path, checks=(), clock=time.time, confirm=CONFIRM, log_max=LOG_MAX):
        self.path, self.checks, self.clock = path, list(checks), clock
        self.confirm, self.log_max = max(1, int(confirm)), int(log_max)
        self.lock = threading.Lock()
        self.run_lock = threading.Lock()
        self.started = clock()
        self.checked_at = None
        d = self._load()
        self.open, self.pending, self.seen, self.log = d["open"], d["pending"], d["seen"], d["log"]
        self.history = d["history"]
        self.info = {}     # panel → what its last check-in said (memory only)
        self._dirty = False

    # --- the file ---
    def _load(self):
        empty = {"open": {}, "pending": {}, "seen": {}, "log": [], "history": []}
        try:
            d = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return empty
        if not isinstance(d, dict):
            return empty
        num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)  # noqa: E731
        out = {
            "open": {k: v for k, v in (d.get("open") or {}).items() if isinstance(v, dict) and ID_RE.fullmatch(str(k)) and num(v.get("first"))}
            if isinstance(d.get("open"), dict) else {},
            "pending": {k: v for k, v in (d.get("pending") or {}).items() if ID_RE.fullmatch(str(k)) and isinstance(v, int)}
            if isinstance(d.get("pending"), dict) else {},
            "seen": {k: v for k, v in (d.get("seen") or {}).items() if isinstance(k, str) and num(v)}
            if isinstance(d.get("seen"), dict) else {},
            "log": [e for e in d.get("log") if isinstance(e, dict) and num(e.get("at"))][-self.log_max:]
            if isinstance(d.get("log"), list) else [],
            "history": [b for b in d.get("history") if isinstance(b, dict) and num(b.get("t")) and isinstance(b.get("p"), dict)][-HISTORY_HOURS:]
            if isinstance(d.get("history"), list) else [],
        }
        return out

    def _save(self):
        """Atomic; mode 0600 where the system has modes. A full disk only loses the newest events."""
        body = json.dumps({"v": 1, "open": self.open, "pending": self.pending, "seen": self.seen, "log": self.log,
                           "history": self.history}, ensure_ascii=False, separators=(",", ":"))
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_name(f".{self.path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(body)
            os.replace(tmp, self.path)
            self._dirty = False
        except OSError:
            pass

    # --- panels ---
    def checkin(self, panel, info=None):
        """A panel said "I'm here" (any panel API call, or its own check-in). False for a bad panel name. Saved with
        the next check (not on every call)."""
        p = str(panel or "").lower()
        if not re.fullmatch(r"[a-z][a-z0-9_-]{0,31}", p):
            return False
        with self.lock:
            self.seen[p] = self.clock()
            if isinstance(info, dict):
                self.info[p] = {k: _plain(v, 60) for k, v in info.items() if k in CHECKIN_FIELDS and isinstance(v, str)}
            if len(self.seen) > 200:   # (panels removed long ago go first)
                for k in sorted(self.seen, key=self.seen.get)[:len(self.seen) - 200]:
                    self.seen.pop(k, None)
            self._dirty = True
        return True

    def last_seen(self, panel):
        return self.seen.get(str(panel).lower())

    def panels(self, names, minutes=PANEL_MINUTES):
        """For the Manager: [{id, name, lastSeen (epoch s or None), state: "connected" / "disconnected"}…] for the
        panels set up ([(id, name)…]), in that order — a disconnected panel is still listed."""
        now = self.clock()
        out = []
        for pid, name in names:
            seen = self.last_seen(pid)
            since = seen if seen is not None else self.started
            out.append({"id": str(pid), "name": _plain(name, 40) or str(pid), "lastSeen": seen,
                        "state": "connected" if seen is not None and now - since < minutes * 60 else "disconnected",
                        **({"info": self.info[str(pid).lower()]} if str(pid).lower() in self.info else {})})
        return out

    # --- checking ---
    def _event(self, what, p, at):
        self.log.append({"at": at, "what": what, "id": p["id"], "title": p["title"], "details": p.get("details", ""), "lvl": p.get("lvl", 3)})
        if len(self.log) > self.log_max:
            del self.log[:len(self.log) - self.log_max]

    def run_once(self, manual=False):
        """Run every check once. Returns the changes: [("problem" | "resolved", problem)…]. One run at a time (the
        loop and "Check now" share a lock). manual ("Check now"): a problem not confirmed yet isn't counted again — two
        runs a moment apart must not make a one-off hiccup a problem; problems already up and fixed ones follow as usual."""
        with self.run_lock:
            return self._run(manual)

    def _run(self, manual):
        found = {}
        for i, check in enumerate(self.checks):
            # (its name for the log: "bridge_check" for bridge_check(...)'s check, a plain function's own name)
            name = ([w for w in getattr(check, "__qualname__", "check").split(".") if w not in ("<locals>", "check")] or ["check"])[-1]
            try:
                for p in check(self) or []:
                    found[p["id"]] = p
            except Exception as e:   # a check that breaks is a problem of its own, never a crash
                p = problem(f"check:{i}-{re.sub(r'[^a-z0-9_]', '', name.lower())[:60] or 'check'}", "A health check could not run",
                            f"{name}: {type(e).__name__}", 2)
                found[p["id"]] = p
        changes = []
        with self.lock:
            now = self.clock()
            self.checked_at = now
            for pid, p in found.items():
                if pid in self.open:   # still there: the newest wording, first-seen kept
                    o = self.open[pid]
                    if (o.get("title"), o.get("details"), o.get("lvl")) != (p["title"], p["details"], p["lvl"]):
                        o.update(p)
                        self._dirty = True
                    o["last"] = now
                    continue
                n = self.pending.get(pid, 0) + (0 if manual else 1)
                if manual and n == 0:
                    continue   # (first seen on a manual run: the next regular check counts it)
                if n < self.confirm:
                    self.pending[pid] = n
                    self._dirty = True
                    continue
                self.pending.pop(pid, None)
                self.open[pid] = {**p, "first": now, "last": now}
                self._event("problem", p, now)
                changes.append(("problem", self.open[pid]))
            for pid in [k for k in self.pending if k not in found and not manual]:
                del self.pending[pid]
                self._dirty = True
            for pid in [k for k in self.open if k not in found]:
                o = self.open.pop(pid)
                o["resolved"] = now
                self._event("resolved", o, now)
                changes.append(("resolved", o))
            if not manual:
                self._count(now)
            if changes or self._dirty:
                self._save()
        return changes

    def _count(self, now):
        """(lock held) This check in the hour's bucket: per part, the worst level up now and whether it was fine."""
        hour = int(now // 3600 * 3600)
        if not self.history or self.history[-1].get("t") != hour:
            self.history.append({"t": hour, "p": {}})
            del self.history[:-HISTORY_HOURS]
            self._dirty = True   # (a new hour: saved; the counts within an hour ride along with the next save)
        worst = {}
        for p in self.open.values():
            k = part_of(p.get("id"))
            worst[k] = max(worst.get(k, 0), int(p.get("lvl", 3)))
        b = self.history[-1]["p"]
        for k in PARTS:
            w, fine, n = (b.get(k) or [0, 0, 0])[:3]
            if worst.get(k, 0) > w:
                self._dirty = True
            b[k] = [max(w, worst.get(k, 0)), fine + (k not in worst), n + 1]

    def forget(self, pid):
        """(v3.0.3) A problem whose cause is gone for good (a removed calendar): resolved now, not at the next round."""
        with self.lock:
            had = self.pending.pop(pid, None) is not None
            o = self.open.pop(pid, None)
            if o is not None:
                now = self.clock()
                o["resolved"] = now
                self._event("resolved", o, now)
            if o is not None or had:
                self._save()
        return o is not None

    def history_api(self):
        """[{t, parts: {part: {worst, fine, checks}}}…] oldest first — the Health page's bars."""
        with self.lock:
            return [{"t": b["t"], "parts": {k: {"worst": v[0], "fine": v[1], "checks": v[2]} for k, v in b["p"].items()
                                            if isinstance(v, list) and len(v) >= 3}} for b in self.history]

    # --- what the API shows ---
    def current(self):
        """The problems up now, worst first, then oldest first: [{id, title, details, lvl, first, last}…]."""
        with self.lock:
            return sorted((dict(p) for p in self.open.values()), key=lambda p: (-p.get("lvl", 3), p.get("first", 0), p["id"]))

    def recent(self, n=100):
        """The newest n log events, newest first."""
        with self.lock:
            return [dict(e) for e in reversed(self.log[-max(0, int(n)):])] if n else []

    def api(self, panel_names=(), log_n=100):
        """GET /api/manage/health: {"ok", "checkedAt", "problems", "log", "panels"}."""
        probs = self.current()
        return {"ok": not probs, "checkedAt": self.checked_at, "problems": probs, "log": self.recent(log_n),
                "panels": self.panels(panel_names)}

    def heartbeat(self):
        """The message for Hubitat (HEALTH_TOPIC, every check): {"v": 1, "n": problems, "lvl": the worst level (0 =
        none), "text": the worst problems' titles, ≤ 120 characters, "OK" when none}. Short: the bridge passes it to the
        hub in a Maker API URL."""
        probs = self.current()
        text, more = "", 0
        for p in probs:
            t = p["title"] if not text else f"{text}; {p['title']}"
            if len(t) > 120:
                more += 1
            else:
                text = t
        if more:
            text = (text + f" (+{more} more)") if len(text) <= 108 else text
        return {"v": 1, "n": len(probs), "lvl": max((p.get("lvl", 3) for p in probs), default=0), "text": text or "OK"}

    def panel_status(self, min_level=3, panel=None):
        """What a panel shows (GET /api/panel/<id>/health): {"v": 1, "n": problems at min_level or worse, "lvl": the
        worst of those (0 = none), "titles": their short titles, "kinds": what each is ("panel", "hubitat", "mqtt",
        "calendar"… — the part of its id before ":" / ".")}, worst first. Another panel being offline isn't this
        panel's problem (`panel` = which panel asks: those are left out). Never the details (they may name addresses
        — a guest can read a panel); notices (below min_level) stay in the Manager."""
        mine = f"panel:{str(panel).lower()}" if panel else None
        probs = [p for p in self.current() if p.get("lvl", 3) >= min_level
                 and not (panel and p["id"].startswith("panel:") and p["id"] != mine)]
        return {"v": 1, "n": len(probs), "lvl": max((p.get("lvl", 3) for p in probs), default=0),
                "titles": [p["title"][:60] for p in probs][:10], "kinds": [re.split(r"[:.]", p["id"], 1)[0] for p in probs][:10]}

    # --- the thread ---
    def start(self, publish=None, interval=CHECK_SECONDS, stop=None):
        """Runs the checks every `interval` seconds on a daemon thread; after each run publish(heartbeat()) (the
        server sends it on HEALTH_TOPIC) and, with changes, publish gets them too: publish(beat, changes).
        Returns (thread, stop event)."""
        stop = stop or threading.Event()

        def loop():
            while True:
                try:
                    changes = self.run_once()
                    if publish:
                        publish(self.heartbeat(), changes)
                except Exception:   # (never let the monitor die; the next round tries again)
                    pass
                if stop.wait(interval):
                    return
        t = threading.Thread(target=loop, name="health", daemon=True)
        t.start()
        return t, stop
