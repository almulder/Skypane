"""(v3.0.4) The Countdown & timers card's house-wide part: the timer presets every timer shares, and the timers' runs —
kept here, not in a browser, so a timer linked to other panels is the same timer on each of them.

Kept in DATA_DIR/house/timers.json:
  {"v": 1, "presets": [{"id", "name", "sec", "btn"}],
   "runs": {"<run id>": {"state": "idle" | "running" | "paused", "total": s, "end": ms (running), "left": s (paused),
            "rang": ms (when it last ran out), "at": s (last change)}}}
A run's id is its timer's id (the card's item, service/layouts.py "timers"). A timer on panel A can be connected to
panel B (its "links": {"B": "notify" | "linked"}): "linked" shows it on B's Countdown & timers card too, with its
buttons (or B's own timer of the same name runs with it); "notify" shows it there counting down, without buttons. Both
go off on B. shared_for(pid) finds the ones connected to a panel in the saved layouts.
A running timer that reached its end is idle the next time it's read ("rang" = its end): each panel rings it once.
(v3.0.4) A Hubitat rule starts timers through the Skypane Notifier, with no driver change: its notify text
"Timer: <name>, <preset>" or "Timer: <name>, <d>d<HH>:<MM>" (parse_command) is taken by the bridge — not shown as an
alert, dismissed on the hub — and sent on TOPIC {"v": 1, "name", "len"}; the server starts every timer of that name
(start_named; a linked one follows).
(v3.0.4) "Timer up" on house speakers: a timer's "speakers" (service/layouts.py; none by default) — the server, not a
panel, watches the runs' ends (Timers.ends) and asks the bridge to speak the timer's words on each (speak_jobs), on
its own signed topic SPEAK_TOPIC; the bridge sends "speak" only from there, only to a device with SpeechSynthesis and
"speak" in its own command list, through the same allowlist / never list as the lights.
"""
import json
import os
import re
import secrets
import threading
import time

RUN_ID = re.compile(r"[0-9a-f]{6,12}")
SPEAK_TOPIC, SPEAK_LABEL = "manager/timer/speak", "manager/timer/speak v1"   # (v3.0.4: the server → the bridge, signed)
SAY = "{name}, time is up"   # (the panel's "tc.say": the words when the timer has none of its own)
TOPIC = "hubitat/timer"   # (v3.0.4) the bridge → the server: a Hubitat rule's "Timer:" (only the internal login writes it)
COMMAND = re.compile(r"\s*timer\s*:\s*([^,]{1,24}?)\s*,\s*([^,]{1,24}?)\s*", re.I)
LENGTH = re.compile(r"(\d{1,2})\s*d\s*(\d{1,2}):([0-5]\d)", re.I)
MAX_PRESETS, MAX_RUNS, NAME_LEN, MAX_SEC = 12, 120, 24, 7 * 86400
# the mockup's presets (mockups/prototypes/garage-bins-timers.html): the first four are buttons
DEFAULT_PRESETS = [("Free time", 2700, True), ("Reading", 3600, True), ("Screen time", 1800, True), ("Pizza", 720, True),
                   ("Tea", 240, False), ("Focus", 1500, False)]


class Invalid(ValueError):
    pass


def _name(v):
    if not isinstance(v, str):
        raise Invalid("a name")
    t = re.sub(r"[\x00-\x1f\x7f‪-‮⁦-⁩]", " ", v).strip()[:NAME_LEN].strip()
    if not t:
        raise Invalid("a name")
    return t


def _sec(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not 1 <= v <= MAX_SEC:
        raise Invalid("a length: 1 s to 7 days")
    return int(v)


def defaults():
    return [{"id": f"p{n}", "name": a, "sec": s, "btn": b} for n, (a, s, b) in enumerate(DEFAULT_PRESETS, 1)]


def clean_presets(v):
    """The builder's list → [{"id", "name", "sec", "btn"}]; Invalid when it isn't one."""
    if not isinstance(v, list) or not 1 <= len(v) <= MAX_PRESETS:
        raise Invalid(f"presets: 1 to {MAX_PRESETS}")
    out, ids = [], set()
    for p in v:
        if not isinstance(p, dict):
            raise Invalid("a preset")
        pid = p.get("id") if isinstance(p.get("id"), str) and re.fullmatch(r"[a-z0-9]{1,12}", p["id"]) else None
        while pid is None or pid in ids:
            pid = "p" + secrets.token_hex(3)
        ids.add(pid)
        out.append({"id": pid, "name": _name(p.get("name")), "sec": _sec(p.get("sec")), "btn": p.get("btn") is not False})
    return out


def parse_command(text):
    """(v3.0.4) "Timer: Emma, Free time" / "Timer: Pizza, 0d00:02" → {"name", "len": as written, "preset": a preset's
    name | "sec": the length}; None when it isn't one."""
    m = COMMAND.fullmatch(text) if isinstance(text, str) and len(text) <= 80 else None
    if not m:
        return None
    try:
        name = _name(m[1])
    except Invalid:
        return None
    ln = LENGTH.fullmatch(m[2])
    if ln:
        sec = int(ln[1]) * 86400 + int(ln[2]) * 3600 + int(ln[3]) * 60
        return {"name": name, "len": m[2], "sec": sec} if 1 <= sec <= MAX_SEC and int(ln[2]) < 24 else None
    try:
        return {"name": name, "len": m[2], "preset": _name(m[2])}
    except Invalid:
        return None


def settled(r, now_ms):
    """A run as it is now: a running one past its end is idle, "rang" at its end."""
    if r.get("state") == "running" and r.get("end", 0) <= now_ms:
        return {**r, "state": "idle", "rang": r.get("end", 0), "left": 0}
    return r


class Timers:
    def __init__(self, data_dir):
        self.path = data_dir / "house" / "timers.json"
        self.lock = threading.Lock()
        self._ends, self._ends_sig = {}, None

    def _load(self):
        try:
            d = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(d, dict) and isinstance(d.get("presets"), list) and isinstance(d.get("runs"), dict):
                return d
        except (OSError, ValueError):
            pass
        return {"v": 1, "presets": defaults(), "runs": {}}

    def _save(self, d):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(f".{self.path.name}.{os.getpid()}.tmp")
        tmp.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        os.replace(tmp, self.path)

    def get(self, now_ms=None):
        now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
        with self.lock:
            d = self._load()
        return {**d, "runs": {k: settled(r, now_ms) for k, r in d["runs"].items() if isinstance(r, dict)}, "now": now_ms}

    def change(self, req, now_ms=None, known=None):
        """One press on a timer: {action: "start" {id, sec} | "add" {id, sec} | "pause" | "resume" | "stop", id}.
        known: the timer ids in the saved layouts (run_ids) — only those run; the runs of removed ones go.
        Returns the new document (as get); Invalid when it can't be done."""
        if not isinstance(req, dict):
            raise Invalid("an action")
        a, rid = req.get("action"), req.get("id")
        if a not in ("start", "add", "pause", "resume", "stop"):
            raise Invalid("an action: start, add, pause, resume, stop")
        if not isinstance(rid, str) or not RUN_ID.fullmatch(rid) or (known is not None and rid not in known):
            raise Invalid("which timer")
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        with self.lock:
            d = self._load()
            runs = {k: settled(r, now) for k, r in d["runs"].items() if isinstance(r, dict) and (known is None or k in known)}
            r = dict(runs.get(rid) or {"state": "idle", "total": 0})
            st = r.get("state")
            if a == "start":
                s = _sec(req.get("sec"))
                r.update(state="running", total=s, end=now + s * 1000, left=0)
            elif a == "add":
                s = _sec(req.get("sec"))
                if st == "running":
                    r["end"] = r["end"] + s * 1000
                elif st == "paused":
                    r["left"] = r.get("left", 0) + s
                else:   # (an idle one: +1 min starts it for a minute)
                    r.update(state="running", end=now + s * 1000, total=0, left=0)
                r["total"] = min(MAX_SEC, r.get("total", 0) + s)
            elif a == "pause" and st == "running":
                r.update(state="paused", left=max(0, round((r["end"] - now) / 1000)))
            elif a == "resume" and st == "paused":
                r.update(state="running", end=now + r.get("left", 0) * 1000)
            elif a == "stop":
                r.update(state="idle", left=0)
                r.pop("rang", None)
            r["at"] = now // 1000
            runs[rid] = r
            if len(runs) > MAX_RUNS:   # (the oldest idle ones go first)
                for k in sorted((k for k, x in runs.items() if x.get("state") == "idle" and k != rid), key=lambda k: runs[k].get("at", 0)):
                    if len(runs) <= MAX_RUNS:
                        break
                    runs.pop(k)
            d["runs"] = runs
            self._save(d)
        return {**d, "now": now}

    def start_named(self, cmd, panels, now_ms=None):
        """(v3.0.4) parse_command's answer: every timer of that name on every panel (panels: as shared_for) starts, for
        the preset's length (by its name) or the length given. → the run ids started ([] when none: no such timer or
        preset)."""
        sec = cmd.get("sec")
        if sec is None:
            sec = next((p["sec"] for p in self.get(now_ms)["presets"] if p["name"].casefold() == cmd.get("preset", "").casefold()), None)
        ids = sorted({it["id"] for _, settings in panels.values() for c in _cards(settings) for it in c["o"].get("items") or []
                      if isinstance(it, dict) and it.get("k") == "timer" and isinstance(it.get("id"), str) and RUN_ID.fullmatch(it["id"])
                      and str(it.get("name") or "").casefold() == cmd["name"].casefold()}) if sec else []
        for rid in ids:
            self.change({"action": "start", "id": rid, "sec": sec}, now_ms)
        return ids

    def ends(self):
        """(v3.0.4) {run id: its end (ms)} of the running timers — the file read again only when it was saved."""
        try:
            st = self.path.stat()
            sig = (st.st_ino, st.st_mtime_ns, st.st_size)
        except OSError:
            sig = None
        if sig != self._ends_sig:
            with self.lock:
                d = self._load()
            self._ends = {k: r["end"] for k, r in d["runs"].items() if isinstance(r, dict) and r.get("state") == "running"
                          and isinstance(r.get("end"), int) and not isinstance(r.get("end"), bool)}
            self._ends_sig = sig
        return self._ends

    def set_presets(self, v):
        p = clean_presets(v)
        with self.lock:
            d = self._load()
            d["presets"] = p
            self._save(d)
        return d


def run_ids(panels):
    """(v3.0.4) Every timer's id in the saved layouts (panels: as shared_for) — the only runs change() keeps."""
    return {it["id"] for _, settings in panels.values() for c in _cards(settings) for it in c["o"].get("items") or []
            if isinstance(it, dict) and it.get("k") == "timer" and isinstance(it.get("id"), str)}


def press_lock(pid, rid, panels):
    """(v3.0.4, security) May panel `pid` press timer `rid` — its own card's, or one another panel linked to it ("notify"
    only shows it)? panels: as shared_for → None (no), else the PIN lock of the card it is on: "" none, "more" (all
    but a preset's start), "all" (a linked one shows on every Countdown & timers card there: the strictest)."""
    lock = lambda c: ("all" if c["o"].get("pinFree") is False else "more") if c["o"].get("pin") is True else ""
    own = list(_cards((panels.get(pid) or ("", {}))[1])) if isinstance(rid, str) and pid else []
    for c in own:
        if any(isinstance(it, dict) and it.get("k") == "timer" and it.get("id") == rid for it in c["o"].get("items") or []):
            return lock(c)
    linked = any(isinstance(it, dict) and it.get("k") == "timer" and it.get("id") == rid and isinstance(it.get("links"), dict)
                 and it["links"].get(pid) == "linked" for other, (_, s) in panels.items() if other != pid for c in _cards(s)
                 for it in c["o"].get("items") or [])
    return max((lock(c) for c in own), key=["", "more", "all"].index) if linked and own else None


def _cards(settings):
    s = settings if isinstance(settings, dict) else {}
    grids = [s.get("homeGrid")] + list((s.get("roomGrids") or {}).values() if isinstance(s.get("roomGrids"), dict) else [])
    for g in grids:
        for c in (g.get("cards") or []) if isinstance(g, dict) and isinstance(g.get("cards"), list) else []:
            if isinstance(c, dict) and c.get("t") == "timers" and isinstance(c.get("o"), dict):
                yield c


def speak_jobs(ids, panels):
    """(v3.0.4) The runs that just ran out → [(speaker id, the words, volume | None)] from their timers' "speakers"
    (each speaker once per timer; the timer's own words, else SAY; commas left out)."""
    out = []
    for _, settings in panels.values():
        for c in _cards(settings):
            for it in c["o"].get("items") or []:
                if not isinstance(it, dict) or it.get("k") != "timer" or it.get("id") not in ids or not isinstance(it.get("speakers"), list):
                    continue
                words = it.get("say") if isinstance(it.get("say"), str) and it["say"].strip() else SAY.format(name=it.get("name") or "Timer")
                vol = it.get("spkVol") if isinstance(it.get("spkVol"), int) and not isinstance(it.get("spkVol"), bool) and 1 <= it["spkVol"] <= 100 else None
                for d in dict.fromkeys(it["speakers"][:3]):
                    if isinstance(d, int) and not isinstance(d, bool) and d > 0:
                        out.append((d, re.sub(r"\s+", " ", words.replace(",", " ")).strip()[:80], vol))   # (no commas: the Maker API)
    return out


def shared_for(pid, panels):
    """The timers other panels connected to `pid`. panels: {panel id: (its name, its settings)} → [{"id", "name",
    "col", "mix", "preset", "mode", "from", "fromName"}, + "presets": its card's own when it has them] (each once)."""
    out, seen = [], set()
    for other, (name, settings) in panels.items():
        if other == pid:
            continue
        for c in _cards(settings):
            for it in c["o"].get("items") or []:
                mode = (it.get("links") or {}).get(pid) if isinstance(it, dict) and it.get("k") == "timer" and isinstance(it.get("links"), dict) else None
                if mode not in ("notify", "linked") or it.get("id") in seen:
                    continue
                seen.add(it.get("id"))
                out.append({"id": it.get("id"), "name": it.get("name") or "", "col": it.get("col"), "mix": it.get("mix"),
                            "preset": it.get("preset"), "mode": mode, "from": other, "fromName": name or other,
                            **({"presets": c["o"]["presets"]} if isinstance(c["o"].get("presets"), list) else {})})
    return out
