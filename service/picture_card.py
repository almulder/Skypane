"""(v3.0.5) One Slide show / Picture card: the Picture card ("picture" — one of your pictures) and the Photo frame
("photos" — a slide show of up to 12) are one card now. One picture picked: it stays; several: a slide show with its
interval, order, transition and fit (the format: service/layouts.py show_opts; the design: mockups/prototypes/
settings-and-pages.html, its Pictures tab; TESTING-NOTES "Picture + Photo frame → one Slide show / Picture card").
Here: a Picture card made into a Slide show / Picture card with that one picture, and the one-time move of every saved
layout on the first start of 3.0.5 (App.__init__ in server.py, after notices_card's). A Photo frame needs nothing: it
is the same card ("photos"), its options as they were (no transition set: Cross dissolve, the old fade).

The card keeps its id, place, size, style (s — the Picture card's "no surface" too), actions, show-when / highlight rules
and colors; its picture becomes the only one in "pics", its fit stays. One picture draws as the Picture card did: the
picture over the whole card, nothing behind it.

What moved is added to DATA_DIR/house/layout-upgrade-v305.json (blank_card.py's record: the same rows, {"where",
"card", "from": "picture", "to": "photos", "title"}). Once: the marker DATA_DIR/house/.pictures-v305 — written only
when every panel went through (one that can't be read or written: the next start tries again; Picture cards only, so
it's idempotent). Card by card: one that doesn't pass stays as it was and the others still move. A panel's rows are
written to the record only after its Store.modify went through (the store backs the old file up first); a failure is
recorded once, and only this move's own failure rows are ever cleared. The saved cards' file is copied to
house/card-templates.v305b.json, and the record is written, before that file is replaced.
"""
import datetime
import json
import pathlib
import shutil

try:
    from service import layouts
except ImportError:  # pragma: no cover  (run from inside service/)
    import layouts

OLD, NEW = "picture", "photos"
MARK, RECORD, TPL_BACKUP = ".pictures-v305", "layout-upgrade-v305.json", "card-templates.v305b.json"


def convert(c):
    """A Picture card → the Slide show / Picture card with its one picture; anything else → None."""
    if not isinstance(c, dict) or c.get("t") != OLD:
        return None
    o = c.get("o") if isinstance(c.get("o"), dict) else {}
    no = {"pics": [o["pic"]] if isinstance(o.get("pic"), str) else []}
    if o.get("fit") in ("cover", "contain"):
        no["fit"] = o["fit"]
    if isinstance(o.get("title"), str):
        no["title"] = o["title"]
    return {**{k: v for k, v in c.items() if k not in ("t", "o")}, "t": NEW, "o": no}


def title_of(c):
    o = c.get("o") if isinstance(c.get("o"), dict) else {}
    return o["title"] if isinstance(o.get("title"), str) else ""


def convert_grid(g):
    """A saved grid → (the grid with its Picture cards moved, checked by layouts.grid; [(card id, title)]; [(card id,
    title, error)]). Card by card: one that doesn't pass stays as it was. layouts.Invalid when the grid itself doesn't
    pass — it stays as it was."""
    if not isinstance(g, dict) or not isinstance(g.get("cards"), list):
        return g, [], []
    moved, failed, cards = [], [], []
    for c in g["cards"]:
        n = convert(c)
        if n is None:
            cards.append(c)
            continue
        try:   # (checked on its own, on this grid)
            n = layouts.grid({**{k: v for k, v in g.items() if k != "bg"}, "cards": [n]})["cards"][0]
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


def mine(r):
    """A record row this move wrote (the same record holds blank_card.py's and notices_card.py's)."""
    return isinstance(r, dict) and (r.get("from") == OLD or r.get("to") == NEW)


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

    def keep(pid, rows):   # (rows an earlier run already wrote are not added twice)
        have = rec["panels"].setdefault(pid, [])
        have.extend(r for r in rows if r not in have)

    def fail(rows):   # (nor failures: a start that tries again finds the same ones)
        for r in rows:
            if r not in rec["failed"]:
                rec["failed"].append(r)

    def done(pid):   # (the panel went through: this move's "couldn't read / write it" for it is gone — never another move's)
        rec["failed"] = [r for r in rec["failed"] if not (r.get("panel") == pid and r.get("from") == OLD and r.get("where") == "" and "card" not in r)]

    def write_rec():
        house.mkdir(parents=True, exist_ok=True)
        tmp = rec_path.with_name(f".{rec_path.name}.pc.tmp")
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
            if not first[0]:   # (nothing to move on it, or only cards that can't: not written, no backup)
                fail([{"panel": pid, **f} for f in first[2]])
                done(pid)
                continue
            store.modify(pid, change)   # (the store backs the old file up first)
        except Exception as e:   # (one panel that can't be read / written: the others still move; tried again)
            fail([{"panel": pid, "where": "", "from": OLD, "error": type(e).__name__}])
            retry = True
            continue
        done(pid)
        if out.get("rows"):   # (only now: the panel was written — the record never says a card moved that didn't)
            keep(pid, out["rows"])
            n += len(out["rows"])
            moved_on.add(pid)
        fail([{"panel": pid, **f} for f in out.get("failed") or []])
        write_rec()
    # the saved cards (the builder's "Save card": house/card-templates.json)
    tpl = house / "card-templates.json"
    try:
        doc = json.loads(tpl.read_text(encoding="utf-8")) if tpl.exists() else None
    except (OSError, ValueError):
        doc = None
    if isinstance(doc, dict) and isinstance(doc.get("templates"), list):
        changed, rows = False, []
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
            rows.append({"id": t.get("id"), "name": t.get("name") or "", "from": OLD, "to": NEW})
        if changed:
            backup = house / TPL_BACKUP
            if not backup.exists():
                shutil.copyfile(tpl, backup)
            for row in rows:
                if row not in rec["saved"]:
                    rec["saved"].append(row)
            write_rec()   # (the record first — a crash before the file is replaced loses nothing)
            tmp = tpl.with_name(f".{tpl.name}.pc.tmp")
            tmp.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            tmp.replace(tpl)
    write_rec()
    if not retry:   # (a panel still to move: no marker yet, the next start tries again)
        mark.write_text("3.0.5\n", encoding="utf-8")
    failed = [r for r in rec["failed"] if mine(r)]
    if log and n:
        log(f"layouts (3.0.5): {n} Picture card(s) on {len(moved_on)} panel(s) are now Slide show / Picture cards"
            f" - house/layout-upgrade-v305.json")
    return {"ran": True, "cards": n, "panels": sorted(moved_on), "failed": len(failed), "retry": retry}
