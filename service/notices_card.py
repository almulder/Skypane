"""(v3.0.5) One Notifications card: the Alert note ("alerts" — a "🔔 N notifications ›" button, only while Hubitat
alerts wait) and Notifications ("notices" — the full list) are one card with a style now: Compact (the button) or List
(the format: service/layouts.py, its docstring; the design: mockups/prototypes/cards-editor.html, its Notifications tab,
and upgrade-and-notices.html — "Alert note → Notifications, Compact style: the same button"). Here: an Alert note card
made into a Notifications card in the Compact style, and the one-time move of every saved layout on the first start of
3.0.5 (App.__init__ in server.py, after blank_card's). A Notifications card from before needs nothing: no style is List.

The card keeps its id, place, size, style (s), actions, show-when / highlight rules, colors and title (the builder's
name for it; Compact draws no title, as the Alert note didn't).

What moved is added to DATA_DIR/house/layout-upgrade-v305.json (blank_card.py's record: the same rows, {"where",
"card", "from": "alerts", "to": "notices", "title"}). Once: the marker DATA_DIR/house/.notices-v305 — written only when
every panel went through (one that can't be read or written: the next start tries again; Alert note cards only, so it's
idempotent). Card by card: one that doesn't pass stays as it was and the others still move. A failure is recorded once
(a start that tries again finds the same one). Each panel is written with Store.modify (its backup first); the saved
cards' file is copied to house/card-templates.v305a.json first.
"""
import datetime
import json
import pathlib
import shutil

try:
    from service import layouts
except ImportError:  # pragma: no cover  (run from inside service/)
    import layouts

OLD, NEW = "alerts", "notices"
MARK, RECORD, TPL_BACKUP = ".notices-v305", "layout-upgrade-v305.json", "card-templates.v305a.json"


def convert(c):
    """An Alert note card → the Notifications card in the Compact style that looks the same; anything else → None."""
    if not isinstance(c, dict) or c.get("t") != OLD:
        return None
    o = c.get("o") if isinstance(c.get("o"), dict) else {}
    no = {k: o[k] for k in ("title", "icon") if k in o}
    no["style"] = "compact"
    return {**{k: v for k, v in c.items() if k not in ("t", "o")}, "t": NEW, "o": no}


def title_of(c):
    o = c.get("o") if isinstance(c.get("o"), dict) else {}
    return o["title"] if isinstance(o.get("title"), str) else ""


def convert_grid(g):
    """A saved grid → (the grid with its Alert note cards made Notifications cards, checked by layouts.grid; [(card id,
    title)]; [(card id, title, error)]). Card by card: one that doesn't pass stays as it was. Nothing to change: (g, [],
    failed). layouts.Invalid when the grid itself doesn't pass — it stays as it was."""
    if not isinstance(g, dict) or not isinstance(g.get("cards"), list):
        return g, [], []
    moved, failed, cards = [], [], []
    for c in g["cards"]:
        n = convert(c)
        if n is None:
            cards.append(c)
            continue
        try:   # (checked on its own, on this grid)
            n = layouts.grid({**g, "cards": [n]})["cards"][0]
        except layouts.Invalid as e:
            failed.append((c.get("i"), title_of(c), str(e)))
            cards.append(c)
            continue
        moved.append((c.get("i"), title_of(c)))
        cards.append(n)
    if not moved:
        return g, [], failed
    try:
        return layouts.grid({**g, "cards": cards}), moved, failed
    except layouts.Invalid:
        if not failed:
            raise
        # (the card that stayed doesn't pass on its own: it stays as it was saved, the others moved)
        layouts.grid({**g, "cards": [c for c in cards if c.get("t") != OLD]})
        return {**g, "cards": cards}, moved, failed


def convert_settings(s):
    """A panel's settings → ({changed keys: new value}, [record rows], [failures]) for homeGrid and roomGrids."""
    s = s if isinstance(s, dict) else {}
    changes, rows, failed = {}, [], []

    def one(g, where):
        try:
            ng, moved, bad = convert_grid(g)
        except layouts.Invalid as e:
            failed.append({"where": where, "from": OLD, "error": str(e)})
            return None
        rows.extend({"where": where, "card": i, "from": OLD, "to": NEW, "title": ti} for i, ti in moved)
        failed.extend({"where": where, "card": i, "from": OLD, "title": ti, "error": er} for i, ti, er in bad)
        return ng if ng is not g else None

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


def migrate(data_dir, store, log=None, now=None):
    """Once: every panel's layouts and the saved cards. `store`: server.Store (panel_ids, get, modify). Returns
    {"ran": False} when it ran before, else {"ran": True, "cards": how many moved, "panels": [pid], "failed": n,
    "retry": bool}."""
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
    rec = rec or {"v": 1, "panels": {}, "saved": [], "failed": []}   # (blank_card.py's record, or a new one)
    for k in ("saved", "failed"):
        if not isinstance(rec.get(k), list):
            rec[k] = []
    rec["at"] = (now or datetime.datetime.now(datetime.timezone.utc)).isoformat(timespec="seconds")
    n, moved_on, retry = 0, set(), False

    def keep(pid, rows):   # (rows a crashed run already wrote are not added twice)
        have = rec["panels"].setdefault(pid, [])
        have.extend(r for r in rows if r not in have)

    def unkeep(pid, rows):   # (v3.0.5: the panel wasn't written after all — its rows leave the record again)
        have = [r for r in rec["panels"].get(pid, []) if r not in rows]
        if have:
            rec["panels"][pid] = have
        else:
            rec["panels"].pop(pid, None)

    def fail(rows):   # (nor failures: a start that tries again finds the same ones)
        for r in rows:
            if r not in rec["failed"]:
                rec["failed"].append(r)

    def done(pid):   # (the panel went through: an earlier start's "couldn't read / write it" is gone)
        rec["failed"] = [r for r in rec["failed"] if not (r.get("panel") == pid and r.get("from") == OLD and r.get("where") == "" and "card" not in r)]

    def write_rec():
        house.mkdir(parents=True, exist_ok=True)
        tmp = rec_path.with_name(f".{rec_path.name}.nc.tmp")
        tmp.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(rec_path)
    for pid in store.panel_ids():
        out, added = {}, []

        def change(data):
            s = data.get("settings") if isinstance(data.get("settings"), dict) else {}
            ch, rows, failed = convert_settings(s)
            out.update(rows=rows, failed=failed)
            return {"settings": {**s, **ch}} if ch else {}

        try:
            doc = store.get(pid)
            first = convert_settings(doc["data"].get("settings")) if doc.get("exists", True) else ({}, [], [])
            if not first[0]:   # (nothing to move on it, or only cards that can't: not written, no backup)
                fail([{"panel": pid, **f} for f in first[2]])
                done(pid)
                continue
            added = first[1]   # (v3.0.5: rolled back below if the panel can't be written — it still has its old cards)
            keep(pid, added)   # (the record lands before the panel changes: a crash midway loses nothing)
            write_rec()
            store.modify(pid, change)   # (the store backs the old file up first)
        except Exception as e:   # (one panel that can't be read / written: the others still move; tried again)
            unkeep(pid, added)   # (v3.0.5: it didn't move — the record doesn't say it did)
            fail([{"panel": pid, "where": "", "from": OLD, "error": type(e).__name__}])
            retry = True
            continue
        done(pid)
        if out.get("rows"):
            keep(pid, out["rows"])
            n += len(out["rows"])
            moved_on.add(pid)
        fail([{"panel": pid, **f} for f in out.get("failed") or []])
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
                fail([{"saved": t.get("id"), "where": "", "from": OLD, "error": str(e)}])
                continue
            for k in ("i", "x", "y"):
                ok.pop(k, None)
            t["card"], changed = ok, True
            row = {"id": t.get("id"), "name": t.get("name") or "", "from": OLD, "to": NEW}
            if row not in rec["saved"]:
                rec["saved"].append(row)
        if changed:
            backup = house / TPL_BACKUP
            if not backup.exists():
                shutil.copyfile(tpl, backup)
            write_rec()   # (v3.0.5: the record first — a crash before the file is replaced loses nothing)
            tmp = tpl.with_name(f".{tpl.name}.nc.tmp")
            tmp.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            tmp.replace(tpl)
    write_rec()
    if not retry:   # (a panel still to move: no marker yet, the next start tries again)
        mark.write_text("3.0.5\n", encoding="utf-8")
    if log and n:
        log(f"layouts (3.0.5): {n} Alert note card(s) on {len(moved_on)} panel(s) are now Notifications cards (Compact)"
            f" - house/layout-upgrade-v305.json")
    return {"ran": True, "cards": n, "panels": sorted(moved_on), "failed": len(rec["failed"]), "retry": retry}
