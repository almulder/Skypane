"""What happened in the Manager, and who did it (v2.7.0): the activity log behind Health → Timeline, the sign-ins on
Accounts and Your account.

  DATA_DIR/private/activity/YYYY-MM.jsonl     one event per line (mode 0600; private: login names and addresses)
  DATA_DIR/private/activity/s-YYYY-MM.jsonl   the sign-ins, on their own shelf with their own budget
  DATA_DIR/private/activity/r-YYYY-MM.jsonl   (v2.9.1) the Manager's refused device commands, on a shelf of their own

An event = {"at": epoch s (float), "kind": a slug of KINDS, "who": the login that did it (or null: a panel, the
server), "from": the client address, "agent": "Edge · Windows" (never the browser's whole user-agent text),
"target": the login / panel / device it was about, "data": small fields}. The server writes them where the change
happens (never the browser), and the Manager makes the sentence from kind + fields (one place to translate later).

Never in here: a password, PIN, sign-in code, token, API key, a camera's stream, the value of any secret setting
(only which settings changed), or a name typed at sign-in that isn't a login (it may be a password typed in the
wrong box). add() only takes the data keys in DATA_KEYS, and each value is a short plain string, a number, a yes / no
or a short list of those.

Retention: events older than KEEP_DAYS are dropped (whole month files once all of it is older; reads skip the rest);
all files together stay under MAX_BYTES (the oldest month goes first), the sign-ins within their own SIGNIN_SHARE of it —
a flood of sign-in tries never pushes out the account, settings or panel history. The same for the Manager's refused
device commands (REFUSED_SHARE; any signed-in login can cause them): their own shelf, and one event per login +
device + result a minute with a count. Checked at the start, once a day and
whenever a shelf runs over.

(v2.9.2) How long is an admin setting: 30 / 90 (the default) / 365 days, in
DATA_DIR/private/activity/retention.json; the size cap goes with it (CHOICES: 2 / 5 / 15 MB; the sign-ins' and the
refused commands' shares of it stay the same), so the disk stays bounded. Shortening it deletes the older events at
once (set_retention); every prune also trims the month the cut falls in, so nothing older than the setting is kept.
"""
import json
import os
import pathlib
import re
import threading
import time

KEEP_DAYS = 90
MAX_BYTES = 5 * 1024 * 1024
CHOICES = {30: 2 * 1024 * 1024, 90: MAX_BYTES, 365: 15 * 1024 * 1024}   # (v2.9.2) days kept → the size cap
SETTINGS = "retention.json"
TEXT_MAX = 80
LIST_MAX = 20
PAGE_MAX = 500
FOLD = 60                # wrong sign-ins from one address within this many seconds: one event and a count
FOLD_KINDS = {"signin.unknown", "signin.wrong", "signin.locked", "signin.code-wrong",   # (what an unauthenticated client can cause)
              "panel.pair", "panel.blocked"}   # (v3.0.2: a tablet asking to pair, a refused panel visit)
DIR = "activity"
FILE_RE = re.compile(r"(s-|r-)?(\d{4})-(\d{2})\.jsonl")   # (s-: the sign-ins' own shelf; r-: refused device commands)
SIGNIN_SHARE = 0.3       # the sign-ins' share of MAX_BYTES: anyone can cause them, so they get their own budget
REFUSED_SHARE = 0.1      # (v2.9.1) the refused device commands' share: any signed-in login can cause them
REFUSED_KINDS = {"device.refused"}   # (folded per login + device + result, FOLD seconds)
SHELF_PREFIX = {"s": "s-", "r": "r-", "": ""}
NAME_RE = re.compile(r"[A-Za-z0-9._@:-]{1,80}")

# kind → the area the Timeline files it under
KINDS = {
    "signin.ok": "signins", "signin.wrong": "signins", "signin.unknown": "signins", "signin.locked": "signins",
    "signin.out": "signins", "signin.out-others": "signins", "signin.code-used": "signins", "signin.code-wrong": "signins",
    "account.add": "accounts", "account.remove": "accounts", "account.rename": "accounts", "account.perms": "accounts",
    "account.admin": "accounts", "account.user": "accounts", "account.owner": "accounts", "account.password": "accounts",
    "account.password-set": "accounts", "account.code": "accounts", "account.code-dead": "accounts", "account.unlock": "accounts", "account.reset-command": "accounts",
    "settings.change": "settings", "settings.guest": "settings", "settings.guest-now": "settings", "settings.guest-mode": "settings",
    "settings.lockdown": "settings", "settings.check": "settings", "settings.weather": "settings", "settings.event-icons": "settings", "settings.display": "settings",
    "weather.alert": "alerts", "weather.clear": "alerts",   # (v3.0.0: a weather device's warnings — the event name, never its text)
    "panel.add": "panels", "panel.remove": "panels", "panel.setup": "panels", "panel.layout": "panels", "panel.pin": "panels",
    "panel.pin-locked": "panels", "panel.live": "panels", "panel.ack": "alerts",
    # (v3.0.2: panel pairing — a tablet's request, the admin's answers, the device key's alarms; never a key or a code)
    "panel.pair": "panels", "panel.approve": "panels", "panel.reject": "panels", "panel.wrong-code": "panels",
    "panel.cancelled": "panels", "panel.unlink": "panels", "panel.move": "panels", "panel.rename": "panels",
    "panel.retrust": "panels", "panel.pin-admin": "panels", "panel.adopt": "panels", "panel.copy": "panels",
    "panel.blocked": "panels", "panel.profile": "panels", "panel.accept": "panels", "panel.lock-on-copy": "panels",
    "panel.lock-now": "panels",
    "library.upload": "library", "library.remove": "library", "library.card": "library", "library.card-remove": "library",
    "folders.add": "library", "folders.remove": "library",   # (v3.0.5) a picture folder added / removed (its name, never its path)
    # (v3.0.5) the Trash: an item in, back out, deleted for good, emptied, how long it keeps things
    "trash.put": "library", "trash.restore": "library", "trash.erase": "library", "trash.empty": "library", "trash.keep": "library",
    # (v3.0.5) a list command — a Hubitat rule's, or the Manager's "Run" — done or refused (its kind and why, never the words)
    "lists.command": "devices", "lists.command_failed": "devices",
    # (v3.0.5) the Skypane Helper app: a link code made, the app linked / unlinked, an update asked for and its result
    "helper.code": "settings", "helper.link": "settings", "helper.unlink": "settings", "helper.ask": "settings", "helper.update": "settings",
    "helper.cancelCode": "settings",   # (v3.0.5, tester: the link code canceled)
    "device.change": "devices", "device.command": "devices", "device.refused": "devices", "house.mode": "devices", "house.hsm": "devices", "feedback.send": "settings", "camera.add": "cameras", "camera.remove": "cameras", "camera.change": "cameras",
}
DATA_KEYS = {"perm", "old", "new", "keys", "panel", "tab", "count", "added", "moved", "removed", "level", "device",
             "command", "name", "role", "what", "mode", "id", "title", "choice", "on", "until", "tries", "camera", "by",
             "value", "result"}   # (v2.9.1: a Manager device command — its value and the bridge's answer; never a PIN)


def _plain(v):
    return "".join(c for c in str(v) if c.isprintable())[:TEXT_MAX]


def _value(v):
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, (int, float)):
        return v if abs(v) < 1e12 else None
    if isinstance(v, (list, tuple)):
        return [_value(x) for x in list(v)[:LIST_MAX] if not isinstance(x, (list, tuple, dict))]
    return _plain(v)


def agent_words(ua):
    """"Edge · Windows" from a browser's user-agent text (the rest of it is never kept)."""
    ua = ua if isinstance(ua, str) else ""
    browser = ("Edge" if "Edg/" in ua else "Opera" if "OPR/" in ua else "Firefox" if "Firefox/" in ua
               else "Chrome" if "Chrome/" in ua or "CriOS/" in ua else "Safari" if "Safari/" in ua else "")
    system = ("iPhone" if "iPhone" in ua else "iPad" if "iPad" in ua else "Android" if "Android" in ua
              else "Windows" if "Windows" in ua else "Mac" if "Mac OS X" in ua or "Macintosh" in ua
              else "Chrome OS" if "CrOS" in ua else "Linux" if "Linux" in ua else "")
    return " · ".join(w for w in (browser, system) if w) or "A browser"


class ActivityLog:
    """Two shelves, each with its own budget: the sign-ins (s-YYYY-MM.jsonl, SIGNIN_SHARE of max_bytes — anyone on the
    network can cause those) and everything else (YYYY-MM.jsonl): a flood of sign-in tries can never push out account,
    settings or panel history."""

    def __init__(self, private_dir, clock=time.time, keep_days=None, max_bytes=None):
        """keep_days / max_bytes: fixed (the tests); left out, the admin's choice (retention.json) or 90 days / 5 MB."""
        self.dir = pathlib.Path(private_dir) / DIR
        self.clock = clock
        self._fixed_bytes = max_bytes
        self._apply(keep_days if keep_days is not None else self.saved_days())
        self.lock = threading.RLock()
        self._pruned = 0.0
        self._bytes = {"s": 0, "r": 0, "": 0}   # per shelf, kept up to date by add (prune counts them again)
        self._folds = {}         # (kind, address, target) -> {"first": at, "n": more of them since, "ev": the event}
        self._last_cache = (None, {})
        self.prune()

    def _apply(self, days):
        self.keep_days = days
        self.max_bytes = self._fixed_bytes if self._fixed_bytes is not None else CHOICES.get(days, MAX_BYTES)

    def saved_days(self):
        """The admin's choice (retention.json), else KEEP_DAYS."""
        try:
            d = json.loads((self.dir / SETTINGS).read_text(encoding="utf-8")).get("days")
        except (OSError, ValueError, AttributeError):
            return KEEP_DAYS
        return d if type(d) is int and d in CHOICES else KEEP_DAYS   # (an int only: never 30.0 or true)

    def set_retention(self, days):
        """(v2.9.2) The admin's choice: saved, and applied at once — a shorter one deletes the older events now.
        Returns {"old", "new", "removed": events deleted}; ValueError when `days` isn't one of CHOICES."""
        if type(days) is not int or days not in CHOICES:   # (an int only: 30.0 == 30 and True == 1 in Python)
            raise ValueError("days")
        with self.lock:
            old = self.keep_days
            self.dir.mkdir(parents=True, exist_ok=True)
            tmp = self.dir / f".{SETTINGS}.tmp"
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
                json.dump({"days": days}, f)
            os.replace(tmp, self.dir / SETTINGS)
            self._apply(days)
            removed = self.prune()
        return {"old": old, "new": days, "removed": removed}

    def info(self):
        return {"days": self.keep_days, "maxBytes": self.max_bytes, "choices": sorted(CHOICES)}

    def _budget(self, shelf):
        s, r = int(self.max_bytes * SIGNIN_SHARE), int(self.max_bytes * REFUSED_SHARE)
        return s if shelf == "s" else r if shelf == "r" else self.max_bytes - s - r

    @staticmethod
    def _shelf_of(kind):
        return "s" if KINDS.get(kind) == "signins" else "r" if kind in REFUSED_KINDS else ""

    # ---- writing ----
    def _write(self, ev):
        shelf = self._shelf_of(ev["kind"])
        line = json.dumps(ev, ensure_ascii=False, separators=(",", ":")) + "\n"
        try:
            self.dir.mkdir(parents=True, exist_ok=True)
            name = SHELF_PREFIX[shelf] + time.strftime("%Y-%m.jsonl", time.gmtime(ev["at"]))
            fd = os.open(self.dir / name, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            with os.fdopen(fd, "a", encoding="utf-8", newline="\n") as f:
                f.write(line)
        except OSError:
            return False
        self._bytes[shelf] += len(line.encode("utf-8"))
        return True

    def _flush(self, key):
        """(lock held) A folded run of wrong sign-ins: written as one event "and n more within a minute"."""
        f = self._folds.pop(key, None)
        if f and f["n"]:
            ev = dict(f["ev"], at=round(f["last"], 3), data={**(f["ev"].get("data") or {}), "count": f["n"]})
            self._write(ev)

    def flush(self):
        """Every folded run so far, written (a read shows the counts)."""
        with self.lock:
            for key in list(self._folds):
                self._flush(key)

    def add(self, kind, who=None, client=None, agent=None, target=None, wuid=None, tuid=None, **data):
        """One event (False for an unknown kind). Unknown data keys are dropped, values made short and plain. What an
        unauthenticated client can cause (FOLD_KINDS) from one address (about one login) within FOLD seconds becomes one
        event and a count. wuid / tuid: the stable ids of the login that did it / it was about (a later login with the
        same name isn't them)."""
        if kind not in KINDS:
            return False
        ev = {"at": round(self.clock(), 3), "kind": kind}
        if isinstance(who, str) and NAME_RE.fullmatch(who):
            ev["who"] = who
        if isinstance(client, str) and client:
            ev["from"] = _plain(client)[:45]
        if agent:
            ev["agent"] = agent_words(agent)
        if target is not None:
            ev["target"] = _plain(target)
        for k, v in (("wuid", wuid), ("tuid", tuid)):
            if isinstance(v, str) and re.fullmatch(r"[0-9a-f]{1,32}", v):
                ev[k] = v
        clean = {k: _value(v) for k, v in data.items() if k in DATA_KEYS}
        if clean:
            ev["data"] = clean
        with self.lock:
            now = ev["at"]
            for key in [k for k, f in self._folds.items() if now - f["first"] >= FOLD]:   # (runs that ended)
                self._flush(key)
            if kind in FOLD_KINDS or kind in REFUSED_KINDS:
                # (a refused device command: one per login + device + result a minute — never a flood in the log)
                key = (kind, ev.get("who"), ev.get("target"), (ev.get("data") or {}).get("result")) if kind in REFUSED_KINDS \
                    else (kind, ev.get("from"), ev.get("target"))
                f = self._folds.get(key)
                if f:
                    f["n"] += 1
                    f["last"] = now
                    return True
                self._folds[key] = {"first": now, "last": now, "n": 0, "ev": ev}
            if len(self._folds) > 500:   # (many addresses at once: written now rather than kept)
                for key in list(self._folds)[:250]:
                    self._flush(key)
            ok = self._write(ev)
            over = any(self._bytes[s] > self._budget(s) for s in self._bytes)
        if over or self.clock() - self._pruned > 86400:
            self.prune()
        return ok

    # ---- retention ----
    def _files(self):
        try:
            return sorted((p for p in self.dir.iterdir() if FILE_RE.fullmatch(p.name)), key=lambda p: FILE_RE.fullmatch(p.name).groups()[1:])
        except OSError:
            return []

    @staticmethod
    def _shelf(p):
        g = FILE_RE.fullmatch(p.name).group(1)
        return "s" if g == "s-" else "r" if g == "r-" else ""

    @staticmethod
    def _count(p):
        try:
            with open(p, "rb") as f:
                return sum(1 for _ in f)
        except OSError:
            return 0

    def prune(self):
        """Month files wholly older than KEEP_DAYS go, and the month the cut falls in loses its older events (v2.9.2);
        then, per shelf, the oldest until it is under its budget (its newest month is cut to its newest half if it alone
        is too big). Runs at the start, once a day, whenever add finds a shelf over its budget, and when the admin
        shortens the setting. Returns how many events it deleted for their age."""
        removed = 0
        with self.lock:
            self._pruned = self.clock()
            oldest = self.clock() - self.keep_days * 86400
            cut = time.gmtime(oldest)
            for p in self._files():
                y, m = map(int, FILE_RE.fullmatch(p.name).groups()[1:])
                if (y, m) < (cut.tm_year, cut.tm_mon):
                    removed += self._count(p)
                    p.unlink(missing_ok=True)
                elif (y, m) == (cut.tm_year, cut.tm_mon):
                    removed += self._trim(p, oldest)
            for shelf in ("s", "r", ""):
                files = [p for p in self._files() if self._shelf(p) == shelf]
                sizes = {p: p.stat().st_size for p in files}
                while files and sum(sizes.values()) > self._budget(shelf):
                    p = files.pop(0)
                    if not files:   # (only this month: keep its newest half)
                        try:
                            lines = p.read_text(encoding="utf-8").splitlines(True)
                            tmp = p.with_name(f".{p.name}.tmp")
                            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
                                f.writelines(lines[len(lines) // 2:])
                            os.replace(tmp, p)
                            sizes[p] = p.stat().st_size
                        except OSError:
                            pass
                        break
                    p.unlink(missing_ok=True)
                    sizes.pop(p, None)
                self._bytes[shelf] = sum(sizes.values())
        return removed

    @staticmethod
    def _trim(p, oldest):
        """(lock held) The month the cut falls in: its events older than `oldest` deleted (rewritten only if any)."""
        try:
            lines = p.read_text(encoding="utf-8").splitlines(True)
        except OSError:
            return 0

        def keep(ln):
            try:
                e = json.loads(ln)
            except ValueError:
                return False
            return isinstance(e, dict) and isinstance(e.get("at"), (int, float)) and e["at"] >= oldest
        kept = [ln for ln in lines if keep(ln)]
        if len(kept) == len(lines):
            return 0
        try:
            if not kept:
                p.unlink(missing_ok=True)
            else:
                tmp = p.with_name(f".{p.name}.tmp")
                fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
                    f.writelines(kept)
                os.replace(tmp, p)
        except OSError:
            return 0
        return len(lines) - len(kept)

    # ---- reading ----
    def _iter(self, since=None):
        """Events newest first, a month at a time (both shelves of it), stopping at `since` or KEEP_DAYS — a view reads
        only as far back as it shows."""
        oldest = self.clock() - self.keep_days * 86400
        stop = max(oldest, since) if since is not None else oldest
        with self.lock:
            months = {}
            for p in self._files():
                months.setdefault(tuple(map(int, FILE_RE.fullmatch(p.name).groups()[1:])), []).append(p)
        for (y, m) in sorted(months, reverse=True):
            month_end = time.mktime((y + (m == 12), m % 12 + 1, 1, 0, 0, 0, 0, 0, 0)) + 86400   # (a day of slack for time zones)
            if month_end < stop:
                return
            evs = []
            for p in months[(y, m)]:
                try:
                    lines = p.read_text(encoding="utf-8").splitlines()
                except OSError:
                    continue
                for ln in lines:
                    try:
                        e = json.loads(ln)
                    except ValueError:
                        continue
                    if isinstance(e, dict) and isinstance(e.get("at"), (int, float)) and e.get("kind") in KINDS:
                        evs.append(e)
            evs.sort(key=lambda e: -e["at"])
            for e in evs:
                if e["at"] < oldest or (since is not None and e["at"] <= since):
                    return
                yield e

    def read(self, since=None, before=None, kinds=None, who=None, q=None, limit=200, allow=None, export=False):
        """Events newest first: since / before (epoch s, exclusive), kinds (areas or kinds), who (a login: done by it or
        about it), q (words anywhere in it), allow (a function: event → may this login see it). (events, more).
        At most PAGE_MAX a page; export: every one kept."""
        self.flush()
        limit = 10 ** 6 if export else max(1, min(PAGE_MAX, int(limit or 200)))
        want = set(kinds or ())
        words = [w for w in str(q or "").lower().split() if w][:8]
        out, more = [], False
        for e in self._iter(since):
            if before is not None and e["at"] >= before:
                continue
            if want and e["kind"] not in want and KINDS[e["kind"]] not in want:
                continue
            if who and who.lower() not in (str(e.get("who") or "").lower(), str(e.get("target") or "").lower()):
                continue
            if words:
                text = json.dumps(e, ensure_ascii=False).lower()
                if not all(w in text for w in words):
                    continue
            if allow is not None and not allow(e):
                continue
            if len(out) >= limit:
                more = True
                break
            out.append(e)
        return out, more

    def last_by(self, kind):
        """{login (small letters): its newest event of this kind (done by it)} — the Accounts page; read again only when
        a file changed."""
        with self.lock:
            stamp = tuple((p.name, p.stat().st_size) for p in self._files())
            if self._last_cache[0] == (kind, stamp):
                return dict(self._last_cache[1])
        out = {}
        for e in self._iter():
            if e["kind"] == kind and e.get("who") and e["who"].lower() not in out:
                out[e["who"].lower()] = e
        with self.lock:
            self._last_cache = ((kind, stamp), out)
        return dict(out)

    def last(self, kind, who):
        """The newest event of this kind done by / about this login (e.g. its last sign-in), or None."""
        ev, _ = self.read(kinds=[kind], who=who, limit=1)
        return ev[0] if ev else None
