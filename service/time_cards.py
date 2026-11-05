"""(v3.0.4) Bin day → "Bins / Trash", Countdown and Timers → "Countdown & timers" (the format: service/layouts.py, its
docstring; the design: mockups/prototypes/garage-bins-timers.html). Here: an old card made into its new one, and the
one-time move of every saved layout on the first start of 3.0.4 (App.__init__ in server.py, after devices_card's).

What each keeps:
  - Bin day: its title and bins — each bin's name, its weekday, every week or every 2 weeks from its day (an "every 2
    weeks" without a day: every week, as the old card drew it), its color (the nearest of the 10). The new parts get
    the mockup's defaults, but still (not animated) and no alarm sound: it looked and sounded the same before.
  - Countdown: one countdown item to its date (midnight), Days only, its title as the name, its icon.
  - Timers: one timer, its card's title as the name; its minute buttons become that card's own presets ("<n> min",
    the old card's lengths — not the house's presets), the first is the timer's.
What moved is added to DATA_DIR/house/layout-upgrade-v304.json (devices_card.py's record; each row also has "to").
Once: the marker DATA_DIR/house/.timecards-v304 (old cards only, so a start that stopped half-way just goes on).
Each panel is written with Store.modify (its backup first); the saved cards' file is copied to card-templates.v303.json
first (when devices_card.py didn't already).
"""
import datetime
import hashlib
import json
import pathlib
import shutil

try:
    from service import layouts, timers
except ImportError:  # pragma: no cover  (run from inside service/)
    import layouts
    import timers

OLD = {"bins": "trash", "countdown": "timers", "timer": "timers"}
MARK, RECORD, TPL_BACKUP = ".timecards-v304", "layout-upgrade-v304.json", "card-templates.v303.json"
# the 10 bin colors (layouts.BIN_COLORS) as the panel draws them: an old bin's color → the nearest
BIN_HEX = {"gray": "#7a808c", "black": "#2e3038", "yellow": "#f2c230", "green": "#3f9460", "blue": "#3373d6", "brown": "#8f5d3d",
           "red": "#d64545", "purple": "#9b5bd6", "burgundy": "#8c2740", "lime": "#8cc63f"}


def nearest(hexc):
    try:
        r, g, b = (int(hexc[i:i + 2], 16) for i in (1, 3, 5))
    except (TypeError, ValueError):
        return "green"   # (the old card's default, #22c55e)
    return min(BIN_HEX, key=lambda k: sum((x - int(BIN_HEX[k][i:i + 2], 16)) ** 2 for x, i in zip((r, g, b), (1, 3, 5))))


def _id(*parts):
    return hashlib.sha1("|".join(map(str, parts)).encode("utf-8")).hexdigest()[:6]


def convert(c, salt=()):
    """An old card → its new one; anything else → None.
    salt: (panel id, grid) — card ids like "c3" repeat across panels and grids, the new item ids must not."""
    if not isinstance(c, dict) or c.get("t") not in OLD:
        return None
    t, o = c["t"], c.get("o") if isinstance(c.get("o"), dict) else {}
    new = {k: v for k, v in c.items() if k not in ("t", "o")}
    no = {}
    title = o["title"].strip() if isinstance(o.get("title"), str) else ""
    if t == "bins":
        if title:
            no["title"] = title
        items = []
        for n, b in enumerate(o.get("items") if isinstance(o.get("items"), list) else []):
            if not isinstance(b, dict):
                continue
            day = b.get("day") if isinstance(b.get("day"), int) and 0 <= b["day"] <= 6 else 1
            sch = {"k": "weekly", "days": [day]}
            if b.get("every") == 2 and isinstance(b.get("from"), str):
                sch = {"k": "every", "days": [day], "every": 2, "from": b["from"]}
            name = b.get("name") if isinstance(b.get("name"), str) and b["name"].strip() else "Bin"
            items.append({"id": _id(*salt, c.get("i"), n, name), "name": name, "icon": "wheelie", "color": nearest(b.get("color", "#22c55e")),
                          "btn": "out", "truck": "07:00", "hol": "none", "sch": sch})
        no.update(rem={"when": "before", "at": "19:30"}, items=items)
    elif t == "countdown":
        if not isinstance(o.get("date"), str):
            return None   # (no date yet: nothing to count to — it stays as it was and still draws "Pick a date")
        it = {"id": _id(*salt, c.get("i"), "count"), "k": "count", "name": title or "Countdown", "mix": "d", "at": o["date"] + "T00:00"}
        if isinstance(o.get("icon"), str):
            it["icon"] = o["icon"]
        no["items"] = [it]
    else:
        mins = [m for m in (o.get("presets") if isinstance(o.get("presets"), list) else [])
                if isinstance(m, int) and not isinstance(m, bool) and 1 <= m <= 240]
        mins = list(dict.fromkeys(mins))[:timers.MAX_PRESETS] or [1, 5, 10, 15, 30]   # (the old card's own default)
        it = {"id": _id(*salt, c.get("i"), "timer"), "k": "timer", "name": title or "Timer", "mix": "hms", "snd": "chime", "dismiss": 15}
        no["presets"] = [{"id": f"m{m}", "name": f"{m} min", "sec": m * 60, "btn": True} for m in mins]
        it["preset"] = no["presets"][0]["id"]
        no["items"] = [it]
    new["t"], new["o"] = OLD[t], no
    return new


def convert_settings(s, pid=""):
    """A panel's settings → ({changed keys: new value}, [record rows], [failures]) for homeGrid and roomGrids."""
    s = s if isinstance(s, dict) else {}
    changes, rows, failed = {}, [], []

    def one(g, where):
        if not isinstance(g, dict) or not isinstance(g.get("cards"), list):
            return None
        moved, cards = [], []
        for c in g["cards"]:
            n = convert(c, (pid, where))
            if n is not None:
                moved.append({"where": where, "card": c.get("i"), "from": c["t"], "to": n["t"],
                              "title": (c.get("o") or {}).get("title") if isinstance((c.get("o") or {}).get("title"), str) else ""})
            cards.append(n if n is not None else c)
        if not moved:
            return None
        try:
            ng = layouts.grid({**g, "cards": cards})
        except layouts.Invalid as e:
            failed.append({"where": where, "error": str(e)})
            return None
        rows.extend(moved)
        return ng

    hg = one(s.get("homeGrid"), "home")
    if hg is not None:
        changes["homeGrid"] = hg
    rooms = s.get("roomGrids") if isinstance(s.get("roomGrids"), dict) else {}
    new_rooms, any_room = dict(rooms), False
    for r, g in rooms.items():
        ng = one(g, "rooms" if r == "*" else f"room:{r}")
        if ng is not None:
            new_rooms[r], any_room = ng, True
    if any_room:
        changes["roomGrids"] = new_rooms
    return changes, rows, failed


def migrate_v304(data_dir, store, log=None, now=None):
    """Once: every panel's layouts and the saved cards. `store`: server.Store (panel_ids, get, modify). Returns
    {"ran": False} when it ran before, else {"ran": True, "cards": how many moved, "panels": [pid], "failed": n}."""
    house = pathlib.Path(data_dir) / "house"
    mark = house / MARK
    if mark.exists():
        return {"ran": False}
    rec_path = house / RECORD
    try:
        rec = json.loads(rec_path.read_text(encoding="utf-8"))
        rec = rec if isinstance(rec, dict) and isinstance(rec.get("panels"), dict) else None
    except (OSError, ValueError):
        rec = None
    rec = rec or {"v": 1, "panels": {}, "saved": [], "failed": []}
    rec.setdefault("saved", []), rec.setdefault("failed", [])
    rec["at"] = (now or datetime.datetime.now(datetime.timezone.utc)).isoformat(timespec="seconds")
    n, panels, before = 0, [], len(rec["failed"])

    def keep(pid, rows):   # (rows a crashed run already wrote are not added twice)
        have = rec["panels"].setdefault(pid, [])
        have.extend(r for r in rows if r not in have)

    def write_rec():
        house.mkdir(parents=True, exist_ok=True)
        tmp = rec_path.with_name(f".{rec_path.name}.tc.tmp")
        tmp.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(rec_path)
    for pid in store.panel_ids():
        out = {}

        def change(data):
            s = data.get("settings") if isinstance(data.get("settings"), dict) else {}
            ch, rows, failed = convert_settings(s, pid)
            out.update(rows=rows, failed=failed)
            return {"settings": {**s, **ch}} if ch else {}

        try:
            doc = store.get(pid)
            first = convert_settings(doc["data"].get("settings"), pid) if doc.get("exists", True) else ({}, [], [])
            if not first[0]:
                rec["failed"].extend({"panel": pid, **f} for f in first[2])
                continue
            keep(pid, first[1])   # (the record lands before the panel changes: a crash midway loses nothing)
            write_rec()
            store.modify(pid, change)   # (the store backs the old file up first)
        except Exception as e:   # (one panel that can't be read / written: the others still move)
            rec["failed"].append({"panel": pid, "where": "", "error": type(e).__name__})
            continue
        if out.get("rows"):
            keep(pid, out["rows"])
            n += len(out["rows"])
            panels.append(pid)
        rec["failed"].extend({"panel": pid, **f} for f in out.get("failed") or [])
    tpl = house / "card-templates.json"
    try:
        doc = json.loads(tpl.read_text(encoding="utf-8")) if tpl.exists() else None
    except (OSError, ValueError):
        doc = None
    if isinstance(doc, dict) and isinstance(doc.get("templates"), list):
        changed = False
        for t in doc["templates"]:
            c = t.get("card") if isinstance(t, dict) else None
            nc = convert({**c, "i": c.get("i") or "tpl", "x": 0, "y": 0}, ("tpl", t.get("id"))) if isinstance(c, dict) else None
            if nc is None:
                continue
            try:
                ok = layouts.card(nc, 192, 128)
            except layouts.Invalid as e:
                rec["failed"].append({"saved": t.get("id"), "where": "", "error": str(e)})
                continue
            for k in ("i", "x", "y"):
                ok.pop(k, None)
            t["card"], changed = ok, True
            rec["saved"].append({"id": t.get("id"), "name": t.get("name") or "", "from": c.get("t"), "to": nc["t"]})
        if changed:
            backup = house / TPL_BACKUP
            if not backup.exists():
                shutil.copyfile(tpl, backup)
            tmp = tpl.with_name(f".{tpl.name}.tc304.tmp")
            tmp.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            tmp.replace(tpl)
    write_rec()
    mark.write_text("3.0.4\n", encoding="utf-8")
    if log and n:
        log(f"layouts (3.0.4): {n} Bin day / Countdown / Timers card(s) on {len(panels)} panel(s) are now Bins / Trash and"
            f" Countdown & timers - house/layout-upgrade-v304.json")
    return {"ran": True, "cards": n, "panels": sorted(panels), "failed": len(rec["failed"]) - before}
