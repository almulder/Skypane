"""(v3.0.4) The Bins / Trash card's house-wide part: the holidays the admin keeps, and which bins were taken out.

Kept in DATA_DIR/house/bins.json:
  {"v": 1, "holidays": [{"d": "YYYY-MM-DD", "name"}], "out": {"<bin name, lower case>@<pickup day>": {"at", "panel"}}}
A bin's schedule is the card's (service/layouts.py, the "trash" card); each panel works out its pickups itself
(dashboard/layouts/v4/shared/trash.js), the holidays moving them. "Taken out" (or Emptied / At the curb) on any panel
marks that bin for that pickup on every panel: a bin is known by its name, so the house's "Trash" is the same bin on
the kitchen's card and the hall's. Marks older than two weeks are dropped. The holidays: a short list the admin edits
in the builder (the card's settings), no calendar — the mockup left that open; a holiday calendar can feed it later.
"""
import datetime
import json
import os
import re
import threading
import time

DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
MAX_HOLIDAYS, MAX_OUT, NAME_LEN, KEEP_DAYS, AHEAD_DAYS = 40, 300, 24, 14, 60


class Invalid(ValueError):
    pass


def _day(v, what="a day"):
    if not isinstance(v, str) or not DAY.fullmatch(v):
        raise Invalid(what)
    try:
        datetime.date.fromisoformat(v)
    except ValueError:
        raise Invalid(what) from None
    return v


def _name(v, n=NAME_LEN):
    if not isinstance(v, str):
        raise Invalid("a name")
    t = re.sub(r"[\x00-\x1f\x7f‪-‮⁦-⁩]", " ", v).strip()[:n].strip()
    if not t:
        raise Invalid("a name")
    return t


def key(name, day):
    """The mark's key: the bin's name (as the panels compare it) and its pickup day."""
    return f"{_name(name).lower()}@{_day(day)}"


def clean_holidays(v):
    """The admin's list → [{"d", "name"}] by date, each day once. Invalid when it isn't one."""
    if not isinstance(v, list) or len(v) > MAX_HOLIDAYS:
        raise Invalid(f"holidays: up to {MAX_HOLIDAYS}")
    out = {}
    for h in v:
        if not isinstance(h, dict):
            raise Invalid("a holiday")
        out[_day(h.get("d"), "a holiday's day")] = _name(h.get("name") or "Holiday", 40)
    return [{"d": d, "name": n} for d, n in sorted(out.items())]


class Bins:
    def __init__(self, data_dir):
        self.path = data_dir / "house" / "bins.json"
        self.lock = threading.Lock()

    def _load(self):
        try:
            d = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(d, dict) and isinstance(d.get("holidays"), list) and isinstance(d.get("out"), dict):
                return d
        except (OSError, ValueError):
            pass
        return {"v": 1, "holidays": [], "out": {}}

    def _save(self, d):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(f".{self.path.name}.{os.getpid()}.tmp")
        tmp.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        os.replace(tmp, self.path)

    def get(self):
        with self.lock:
            return self._load()

    def change(self, req, panel="", today=None):
        """A panel's press: {action: "out", bin: name, day: pickup day} (marked everywhere) | "undo" {bin, day}.
        Returns the new document; Invalid when it can't be done."""
        if not isinstance(req, dict):
            raise Invalid("an action")
        a = req.get("action")
        if a not in ("out", "undo"):
            raise Invalid("an action: out, undo")
        k = key(req.get("bin"), req.get("day"))
        today = today or datetime.date.today()
        if a == "out" and not (today - datetime.timedelta(days=KEEP_DAYS)).isoformat() <= k.rsplit("@", 1)[-1]                 <= (today + datetime.timedelta(days=AHEAD_DAYS)).isoformat():
            raise Invalid(f"a pickup day from {KEEP_DAYS} days ago to {AHEAD_DAYS} days ahead")
        with self.lock:
            d = self._load()
            cut = (today - datetime.timedelta(days=KEEP_DAYS)).isoformat()
            d["out"] = {x: v for x, v in d["out"].items() if x.rsplit("@", 1)[-1] >= cut}
            if a == "out":
                if k not in d["out"] and len(d["out"]) >= MAX_OUT:
                    raise Invalid("too many marks")
                d["out"][k] = {"at": int(time.time()), "panel": str(panel or "")[:40]}
            else:
                d["out"].pop(k, None)
            self._save(d)
            return d

    def set_holidays(self, v):
        """The admin's list (the builder) → the new document."""
        hol = clean_holidays(v)
        with self.lock:
            d = self._load()
            d["holidays"] = hol
            self._save(d)
            return d
