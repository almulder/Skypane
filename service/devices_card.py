"""(v3.0.4) One "Devices" card replaces Device, Devices, Value, Button, Lock, Fan and Scene buttons (the format:
service/layouts.py, its docstring). Here: an old card made into a Devices card, and the one-time move of every saved
layout on the first start of 3.0.4 (App.__init__ in server.py).

The card keeps its id, place, size, style (s), show-when / highlight rules and colors; its device, name, icon, motion,
wheel and actions go to its item. A one-device card becomes the "single" look and its item keeps the old card's look
("st": row, square, gauge, lock, fan…), so the panel looks the same; the builder's editor can drop "st" for the new
look. A Devices card (group) keeps List / Tiles; Scene buttons become Scene items (a row: Tiles, one column a button).

What moved is written to DATA_DIR/house/layout-upgrade-v304.json for the Manager's "What changed" notice:
  {"v": 1, "at": ISO time, "panels": {pid: [{"where": "home" | "rooms" | "room:<id>", "card": id, "from": old type,
   "title": its name or ""}]}, "saved": [{"id": saved card id, "name", "from"}], "failed": [{"panel"|"saved", "where", "error"}]}
Once: the marker DATA_DIR/house/.devices-v304 (a crash before it: the next start goes on; old cards only, so it's
idempotent). Each panel is written with Store.modify — the store keeps a backup of the file as it was (backups/); the
saved cards' file is copied to house/card-templates.v303.json first.
"""
import datetime
import json
import pathlib
import shutil

try:
    from service import layouts
except ImportError:  # pragma: no cover  (run from inside service/)
    import layouts

OLD = ("device", "group", "value", "button", "lock", "fan", "scenes")
MARK, RECORD, TPL_BACKUP = ".devices-v304", "layout-upgrade-v304.json", "card-templates.v303.json"
ACTS = ("tap", "hold", "dbl")
# what each one-device card's item is (a Device card: none — the panel decides from the device)
KIND = {"value": "value", "button": "button", "lock": "lock", "fan": "fan"}


def _keep(src, dst, keys):
    for k in keys:
        if src.get(k) is not None:
            dst[k] = src[k]


def convert(c):
    """An old card → the Devices card that looks and works the same; anything else → None."""
    if not isinstance(c, dict) or c.get("t") not in OLD:
        return None
    t, o = c["t"], c.get("o") if isinstance(c.get("o"), dict) else {}
    new = {k: v for k, v in c.items() if k not in ("t", "o")}
    no = {}
    if t in ("group", "scenes"):
        if isinstance(o.get("title"), str) and o["title"].strip():
            no["title"] = o["title"]
        items = []
        for it in o.get("items") or [] if isinstance(o.get("items"), list) else []:
            if not isinstance(it, dict):
                continue
            if t == "group":
                x = {"id": it.get("id")}
                _keep(it, x, ("icon", "wheel"))
                if isinstance(it.get("title"), str) and it["title"].strip():
                    x["label"] = it["title"]
            else:   # (a scene button: its action becomes the item's tap — a scene switch, a button pushed, a page…)
                x = {"k": "scene", "label": it.get("label") or "Scene", "icon": it.get("icon") or "sparkles"}
                if isinstance(it.get("a"), dict) and it["a"].get("do") not in (None, "none"):
                    x["tap"] = it["a"]
            items.append(x)
        no["items"] = items
        if t == "group":
            no["look"] = "tiles" if o.get("look") == "tiles" else "list"
        elif o.get("look") == "list":
            no["look"] = "list"
        else:   # (a row of buttons side by side: Tiles, one column a button)
            no.update(look="tiles", cols=max(1, min(8, len(items) or 1)))
    else:
        it = {}
        if t in KIND:
            it["k"] = KIND[t]
        _keep(o, it, ("id", "icon", "wheel"))
        if isinstance(o.get("title"), str) and o["title"].strip():
            it["label"] = o["title"]
        if t == "device":
            it["st"] = o.get("style") if o.get("style") in ("row", "square", "icon", "slider", "bar") else "row"
            _keep(o, it, ("motion", "runW", "contact", "travel"))
        elif t == "value":
            it["st"] = o.get("style") if o.get("style") in ("big", "gauge", "chip") else "big"
            if isinstance(o.get("at"), str):
                it["show"] = [o["at"]]
            _keep(o, it, ("unit", "dec", "min", "max"))
        else:
            it["st"] = t   # (button, lock, fan: as they were drawn)
        for k in ACTS:   # (the card's own tap / hold / double-tap: now its one item's)
            if isinstance(c.get(k), dict):
                it[k] = c[k]
                new.pop(k, None)
        no.update(look="single", items=[it])
    new["t"], new["o"] = "devices", no
    return new


def title_of(c):
    o = c.get("o") if isinstance(c.get("o"), dict) else {}
    return o["title"] if isinstance(o.get("title"), str) else ""


def convert_grid(g):
    """A saved grid → (the grid with its old cards made Devices cards, checked by layouts.grid; [(card id, old type,
    title)]). Nothing old in it: (g, []). layouts.Invalid when the result doesn't pass — the grid then stays as it was."""
    if not isinstance(g, dict) or not isinstance(g.get("cards"), list):
        return g, []
    moved, cards = [], []
    for c in g["cards"]:
        n = convert(c)
        if n is not None:
            moved.append((c.get("i"), c["t"], title_of(c)))
        cards.append(n if n is not None else c)
    if not moved:
        return g, []
    return layouts.grid({**g, "cards": cards}), moved


def convert_settings(s):
    """A panel's settings → ({changed keys: new value}, [record rows], [failures]) for homeGrid and roomGrids."""
    s = s if isinstance(s, dict) else {}
    changes, rows, failed = {}, [], []

    def one(g, where):
        try:
            ng, moved = convert_grid(g)
        except layouts.Invalid as e:
            failed.append({"where": where, "error": str(e)})
            return None
        rows.extend({"where": where, "card": i, "from": t, "title": ti} for i, t, ti in moved)
        return ng if moved else None

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
    rec = rec or {"v": 1, "panels": {}, "saved": [], "failed": []}   # (a start that stopped half-way: its record goes on)
    rec["at"] = (now or datetime.datetime.now(datetime.timezone.utc)).isoformat(timespec="seconds")
    n = 0

    def keep(pid, rows):   # (rows a crashed run already wrote are not added twice)
        have = rec["panels"].setdefault(pid, [])
        have.extend(r for r in rows if r not in have)

    def write_rec():
        house.mkdir(parents=True, exist_ok=True)
        tmp = rec_path.with_name(f".{rec_path.name}.tmp")
        tmp.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(rec_path)
    for pid in store.panel_ids():
        out = {}

        def change(data):
            s = data.get("settings") if isinstance(data.get("settings"), dict) else {}
            ch, rows, failed = convert_settings(s)
            out.update(rows=rows, failed=failed)
            return {"settings": {**s, **ch}} if ch else {}

        try:
            doc = store.get(pid)
            first = convert_settings(doc["data"].get("settings")) if doc.get("exists", True) else ({}, [], [])
            if not first[0]:   # (nothing old on it — or only cards that can't move: not written, no backup)
                rec["failed"].extend({"panel": pid, **f} for f in first[2])
                continue
            keep(pid, first[1])   # (the record lands before the panel changes: a crash midway loses nothing)
            write_rec()
            store.modify(pid, change)   # (the store backs the old file up first — backups/<pid>-<time>.json)
        except Exception as e:   # (one panel that can't be read / written: the others still move; logged)
            rec["failed"].append({"panel": pid, "where": "", "error": type(e).__name__})
            continue
        if out.get("rows"):
            keep(pid, out["rows"])
            n += len(out["rows"])
        rec["failed"].extend({"panel": pid, **f} for f in out.get("failed") or [])
    # the saved cards (the builder's "Save card": house/card-templates.json)
    tpl = house / "card-templates.json"
    try:
        doc = json.loads(tpl.read_text(encoding="utf-8")) if tpl.exists() else None
    except (OSError, ValueError):
        doc = None
    if isinstance(doc, dict) and isinstance(doc.get("templates"), list):
        changed = False
        for t in doc["templates"]:
            c = t.get("card") if isinstance(t, dict) else None
            nc = convert({**c, "i": "tpl", "x": 0, "y": 0}) if isinstance(c, dict) else None
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
            rec["saved"].append({"id": t.get("id"), "name": t.get("name") or "", "from": c.get("t")})
        if changed:
            backup = house / TPL_BACKUP
            if not backup.exists():
                shutil.copyfile(tpl, backup)
            tmp = tpl.with_name(f".{tpl.name}.v304.tmp")
            tmp.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            tmp.replace(tpl)
    write_rec()
    mark.write_text("3.0.4\n", encoding="utf-8")
    if log and (n or rec["saved"] or rec["failed"]):
        bad = f"; {len(rec['failed'])} could not move (kept as they were)" if rec["failed"] else ""
        log(f"layouts (3.0.4): {n} card(s) on {len(rec['panels'])} panel(s) and {len(rec['saved'])} saved card(s) are now"
            f" Devices cards{bad} - house/layout-upgrade-v304.json")
    return {"ran": True, "cards": n, "panels": sorted(rec["panels"]), "failed": len(rec["failed"])}
