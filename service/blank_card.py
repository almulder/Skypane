"""(v3.0.5) The blank card does everything: the Devices card and the Text card are no longer offered — their items are
pieces of a blank card now (the format: service/layouts.py, its docstring; the design: mockups/prototypes/
blank-card-305.html). Here: an old card made into a blank card that looks the same, and the one-time move of every
saved layout on the first start of 3.0.5 (App.__init__ in server.py), as service/devices_card.py did for 3.0.4.

The card keeps its id, place, size, style (s), actions, show-when / highlight rules and colors. A Devices card's items
become device pieces ("t": "dev", everything an item had) where its look put them: List (one row each, the icon on the
left), Tiles (even tiles, its columns), Freeform (where they were) or one big item (the whole card; several: tiles —
the swipe from one to the next has no piece of its own). Its title becomes a small heading on top. The sizes keep the
look's own (icon and text size), "Grow and shrink with the card" starts off. A Text card becomes one text piece over
the whole card: the same words, alignment, heading and icon, at the Text card's 20 px.

What moved is written to DATA_DIR/house/layout-upgrade-v305.json for the Manager's "What changed" notice (the same
rows as 3.0.4's: {"where", "card", "from", "to": "blank", "title"}). Once: the marker DATA_DIR/house/.blank-v305 (a
crash before it: the next start goes on; Devices and Text cards only, so it's idempotent). Each panel is written with
Store.modify — the store keeps a backup of the file as it was; the saved cards' file is copied to
house/card-templates.v304.json first.
"""
import datetime
import json
import math
import pathlib
import shutil

try:
    from service import layouts
except ImportError:  # pragma: no cover  (run from inside service/)
    import layouts

OLD = ("devices", "text")
MARK, RECORD, TPL_BACKUP = ".blank-v305", "layout-upgrade-v305.json", "card-templates.v304.json"
F = 1000   # (a piece's place: thousandths of the card)
# (the Devices card's looks, theme.css .dv-*: the icon's and the words' size against a device piece's own — Freeform's)
IZ = {"list": 26 / 30, "tiles": 1.0, "free": 1.0, "single": 1.8}
TZ = {"list": 1.0, "tiles": 15 / 17, "free": 1.0, "single": 20 / 17}
TP = {"list": "right", "tiles": "bottom", "free": "bottom", "single": "bottom"}


def _cell(g):
    """One grid cell's size in px on the screen the layout was made for (scr, else 1280 × 800)."""
    scr = g.get("scr") if isinstance(g.get("scr"), dict) else {}
    w, h = scr.get("w") or 1280, scr.get("h") or 800
    cols, rows = g.get("cols") or 192, g.get("rows") or 128
    try:
        return max(0.5, w / cols), max(0.5, h / rows)
    except TypeError:
        return 1280 / 192, 800 / 128


def _box(x, y, w, h, W, H):
    """A box in px on a W × H card → thousandths of the card, inside it, at least 1 × 1."""
    fx = max(0, min(F - 1, round(x / W * F)))
    fy = max(0, min(F - 1, round(y / H * F)))
    fw = max(1, min(F - fx, round(w / W * F)))
    fh = max(1, min(F - fy, round(h / H * F)))
    return {"x": fx, "y": fy, "w": fw, "h": fh}


def _size(v, k):
    """An item's icon / text size % on its old look → the device piece's (50–250; 100 = no setting)."""
    return max(50, min(250, round(v * k)))


def _piece(it, look, single=False):
    """A Devices item → a device piece's settings (its place comes after). single: the card was "one big item" (3.0.4
    drew an item's kept old look, "st", only there)."""
    p = {k: v for k, v in it.items() if k not in ("x", "y", "w", "h", "sw", "sh")}
    p["t"] = "dev"
    if not single:   # (v3.0.5) List, Tiles and Freeform drew every item as an item in 3.0.4, "st" or not: it looks the same
        p.pop("st", None)
    if not p.get("st"):   # (an old card's look kept: it's drawn as it was, sizes and all)
        iz, tz = _size(it.get("iz") or 100, IZ[look]), _size(it.get("tz") or 100, TZ[look])
        p.pop("iz", None)
        p.pop("tz", None)
        if iz != 100:
            p["iz"] = iz
        if tz != 100:
            p["tz"] = tz
        if not p.get("tp"):
            p["tp"] = TP[look]
    if p.get("bg") == "none":   # (3.0.4's "no disc" is the icon background None now)
        p["shape"] = "none"
    p.pop("bg", None)
    return p


def _devices(c, o, cell):
    W, H = max(1, (c.get("w") or 1) * cell[0]), max(1, (c.get("h") or 1) * cell[1])
    items = [it for it in (o.get("items") if isinstance(o.get("items"), list) else []) if isinstance(it, dict)][:layouts.DEV_ITEMS]
    look = o.get("look") if o.get("look") in layouts.DEV_LOOKS else "list"
    title = o["title"].strip() if isinstance(o.get("title"), str) else ""
    parts, top = [], 0
    if title:   # (the title: a small heading on top, as the card had it — theme.css .gc-t)
        top = 12 + 26
        parts.append({"t": "text", **_box(16, 8, W - 32, 30, W, H), "text": "", "head": title})
    # (v3.0.5) "one big item" with several: tiles — a blank card has no piece that swipes from one item to the next, so
    # 3.0.4's one-at-a-time with dots can't be kept
    single = look == "single"
    if single and len(items) > 1:
        look = "tiles"
    n = len(items)
    if look == "list":
        px, py = 14, (6 if title else 12)
        y0, avail = top + py, H - top - py - 12
        row, gap = 60 * max(1.0, (items[0].get("iz") or 100) / 100 * 0.85) if items else 60, 6
        # (v3.0.5) too many for their own size (a 24-item list): closer together, and each marked "fit": "box" — its
        # icon disc and name sized to its row (theme.css .bk-p.fit-box .dv-pc), never cut off
        fit = bool(n and n * row + (n - 1) * gap > avail)
        if fit:
            gap = 2
            row = max(8, (avail - (n - 1) * gap) / n)
        for k, it in enumerate(items):
            parts.append({**_piece(it, look), **_box(px, y0 + k * (row + gap), W - 2 * px, row, W, H), **({"fit": "box"} if fit else {})})
    elif look == "tiles":
        px, py = 14, (6 if title else 12)
        aw, ah = W - 2 * px, H - top - py - 12
        cols = o.get("cols") if isinstance(o.get("cols"), int) and not isinstance(o.get("cols"), bool) else max(1, int((aw + 6) // 116))
        cols = max(1, min(cols, n or 1, 8))
        rows = max(1, math.ceil(n / cols))
        tw, th = (aw - (cols - 1) * 6) / cols, max(8, (ah - (rows - 1) * 6) / rows)
        for k, it in enumerate(items):
            r, q = divmod(k, cols)
            parts.append({**_piece(it, look, single), **_box(px + q * (tw + 6), top + py + r * (th + 6), tw, th, W, H)})
    elif look == "free":
        m, aw, ah = 8, W - 16, H - top - 16
        # (v3.0.5: by index — two items alike are still two)
        loose = [k for k, it in enumerate(items) if not all(isinstance(it.get(q), int) and not isinstance(it.get(q), bool) for q in ("x", "y", "w", "h"))]
        at = {k: j for j, k in enumerate(loose)}
        cols = max(1, min(len(loose) or 1, int(aw // 120) or 1))
        for k, it in enumerate(items):
            if k in at:   # (not placed yet: where the panel put it — side by side, in rows)
                r, q = divmod(at[k], cols)
                bx = (m + q * aw / cols, top + m + r * 110, aw / cols, 104)
            else:
                bx = (m + it["x"] / F * aw, top + m + it["y"] / F * ah, it["w"] / F * aw, it["h"] / F * ah)
            parts.append({**_piece(it, look), **_box(*bx, W, H)})
    else:   # (one big item: the whole card)
        for it in items:
            parts.append({**_piece(it, look, True), **_box(10, top + 10, W - 20, H - top - 20, W, H)})
    return parts


def convert(c, g=None):
    """A Devices or Text card → the blank card that looks the same; anything else → None. g: its grid (its cell size)."""
    if not isinstance(c, dict) or c.get("t") not in OLD:
        return None
    o = c.get("o") if isinstance(c.get("o"), dict) else {}
    new = {k: v for k, v in c.items() if k not in ("t", "o")}
    no = {"fr": 1}
    if isinstance(o.get("title"), str) and o["title"].strip():
        no["title"] = o["title"]   # (the card's name in the builder; not drawn on the panel)
    if c["t"] == "devices":
        no["parts"] = _devices(c, o, _cell(g if isinstance(g, dict) else {}))
    else:
        tp = {"t": "text", "x": 0, "y": 0, "w": F, "h": F, "text": o.get("text") if isinstance(o.get("text"), str) else "", "fs": 20}
        if o.get("align") in ("center", "right"):
            tp["align"] = o["align"]
        if isinstance(o.get("title"), str) and o["title"].strip():
            tp["head"] = o["title"]
        if isinstance(o.get("icon"), str):
            tp["icon"] = o["icon"]
        no["parts"] = [tp] if tp["text"] or tp.get("head") or tp.get("icon") else []
    new["t"], new["o"] = "blank", no
    return new


# (v3.0.5) the pieces that filled their box before 3.0.5 (theme.css sized them by the box: cqh / cqw); text and device
# pieces had their own size already
BOXED = ("icon", "light", "switch", "value", "door", "lock", "garage")


def box_old(c):
    """A blank card from before 3.0.5 → the same card with its pieces marked "fit": "box" (they keep filling their box,
    as they did); None when there's nothing to mark."""
    o = c.get("o") if isinstance(c, dict) and c.get("t") == "blank" and isinstance(c.get("o"), dict) else None
    parts = o.get("parts") if o and isinstance(o.get("parts"), list) else None
    if not parts or not any(isinstance(p, dict) and p.get("t") in BOXED and p.get("fit") != "box" for p in parts):
        return None
    return {**c, "o": {**o, "parts": [{**p, "fit": "box"} if isinstance(p, dict) and p.get("t") in BOXED else p for p in parts]}}


def title_of(c):
    o = c.get("o") if isinstance(c.get("o"), dict) else {}
    return o["title"] if isinstance(o.get("title"), str) else ""


def convert_grid(g, box=True):
    """A saved grid → (the grid with its Devices / Text cards made blank cards, checked by layouts.grid; [(card id,
    old type, title)]; [(card id, old type, title, error)]). (v3.0.5) Card by card: one that doesn't pass stays as it was
    (the third list) and the others still move. box: an older blank card's pieces are marked "fit": "box" (box_old).
    Nothing to change: (g, [], failed). layouts.Invalid when the grid itself doesn't pass — it stays as it was."""
    if not isinstance(g, dict) or not isinstance(g.get("cards"), list):
        return g, [], []
    moved, failed, cards, boxed = [], [], [], False
    for c in g["cards"]:
        n = convert(c, g)
        if n is None:
            b = box_old(c) if box else None
            boxed = boxed or b is not None
            cards.append(b or c)
            continue
        try:   # (checked on its own, on this grid: a card that can't move stays as it is)
            n = layouts.grid({**g, "cards": [n]})["cards"][0]
        except layouts.Invalid as e:
            failed.append((c.get("i"), c["t"], title_of(c), str(e)))
            cards.append(c)
            continue
        moved.append((c.get("i"), c["t"], title_of(c)))
        cards.append(n)
    if not moved and not boxed:
        return g, [], failed
    try:
        return layouts.grid({**g, "cards": cards}), moved, failed
    except layouts.Invalid:
        if not failed:
            raise
        # (the card that stayed doesn't pass on its own: it stays as it was saved, the others moved)
        layouts.grid({**g, "cards": [c for c in cards if c.get("t") not in OLD]})   # (the rest still has to pass)
        return {**g, "cards": cards}, moved, failed


def convert_settings(s, box=True):
    """A panel's settings → ({changed keys: new value}, [record rows], [failures]) for homeGrid and roomGrids."""
    s = s if isinstance(s, dict) else {}
    changes, rows, failed = {}, [], []

    def one(g, where):
        try:
            ng, moved, bad = convert_grid(g, box)
        except layouts.Invalid as e:
            failed.append({"where": where, "error": str(e)})
            return None
        rows.extend({"where": where, "card": i, "from": t, "to": "blank", "title": ti} for i, t, ti in moved)
        failed.extend({"where": where, "card": i, "from": t, "title": ti, "error": er} for i, t, ti, er in bad)
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


def migrate_v305(data_dir, store, log=None, now=None):
    """Once: every panel's layouts and the saved cards. `store`: server.Store (panel_ids, get, modify). Returns
    {"ran": False} when it ran before, else {"ran": True, "cards": how many moved, "panels": [pid], "failed": n,
    "retry": bool}. (v3.0.5) A panel that can't be read or written: no marker — the next start tries again (the record's
    "boxed": the panels whose older blank cards are marked already, so a blank card made since is never taken for an
    old one; "tplBoxed": the same for the saved cards)."""
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
    rec.setdefault("boxed", [])
    retry = False
    rec["at"] = (now or datetime.datetime.now(datetime.timezone.utc)).isoformat(timespec="seconds")
    rec.setdefault("firstAt", rec["at"])   # (v3.0.5: the first run's time — a retried start never moves it)
    n = 0
    run_panels, run_saved = set(), []   # (v3.0.5: this start's own moves — the log counts only these, not a retried run's earlier ones)

    def keep(pid, rows):   # (rows a crashed run already wrote are not added twice)
        have = rec["panels"].setdefault(pid, [])
        have.extend(r for r in rows if r not in have)

    def unkeep(pid, rows):   # (v3.0.5: the panel wasn't written after all — its rows leave the record again)
        have = [r for r in rec["panels"].get(pid, []) if r not in rows]
        if have:
            rec["panels"][pid] = have
        else:
            rec["panels"].pop(pid, None)

    def fail(rows):   # (v3.0.5: nor failures — a start that tries again finds the same ones)
        for r in rows:
            if r not in rec["failed"]:
                rec["failed"].append(r)

    def done(pid, box):   # (v3.0.5: the panel went through — an earlier start's "couldn't read / write it" is gone)
        rec["failed"] = [r for r in rec["failed"] if not (r.get("panel") == pid and r.get("where") == "" and "card" not in r and "from" not in r)]
        # (v3.0.5: "from" — notices_card.py's own rows in the same record are its to clear)
        if box and pid not in rec["boxed"]:
            rec["boxed"].append(pid)

    def write_rec():
        house.mkdir(parents=True, exist_ok=True)
        tmp = rec_path.with_name(f".{rec_path.name}.tmp")
        tmp.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(rec_path)
    for pid in store.panel_ids():
        out, added = {}, []

        box = pid not in rec["boxed"]

        def change(data):
            s = data.get("settings") if isinstance(data.get("settings"), dict) else {}
            ch, rows, failed = convert_settings(s, box)
            out.update(rows=rows, failed=failed)
            return {"settings": {**s, **ch}} if ch else {}

        try:
            doc = store.get(pid)
            first = convert_settings(doc["data"].get("settings"), box) if doc.get("exists", True) else ({}, [], [])
            if not first[0]:   # (nothing to move on it — or only cards that can't: not written, no backup)
                fail([{"panel": pid, **f} for f in first[2]])
                done(pid, box)
                continue
            added = first[1]   # (v3.0.5: rolled back below if the panel can't be written — it still has its old cards)
            keep(pid, added)   # (the record lands before the panel changes: a crash midway loses nothing)
            write_rec()
            store.modify(pid, change)   # (the store backs the old file up first)
        except Exception as e:   # (one panel that can't be read / written: the others still move; logged, tried again)
            unkeep(pid, added)   # (v3.0.5: it didn't move — the record doesn't say it did)
            fail([{"panel": pid, "where": "", "error": type(e).__name__}])
            retry = True
            continue
        done(pid, box)
        if out.get("rows"):
            keep(pid, out["rows"])
            n += len(out["rows"])
            run_panels.add(pid)
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
            # (a saved card has no grid of its own: the one it was saved on — "fine": its columns, 96 / 192; none: the
            # old 12 × 8 — on a 1280 × 800 screen)
            fine = t.get("fine") if isinstance(t, dict) else None
            cols = 96 if fine is True else fine if isinstance(fine, int) and not isinstance(fine, bool) and fine > 0 else 12
            g = {"cols": cols, "rows": max(1, round(cols * 2 / 3))}
            nc = convert({**c, "i": "tpl", "x": 0, "y": 0}, g) if isinstance(c, dict) else None
            if nc is None and isinstance(c, dict) and not rec.get("tplBoxed"):   # (v3.0.5: an older blank card saved: its pieces marked)
                nc = box_old({**c, "i": "tpl", "x": 0, "y": 0})
            if nc is None:
                continue
            try:
                ok = layouts.card(nc, 192, 128)
            except layouts.Invalid as e:
                fail([{"saved": t.get("id"), "where": "", "error": str(e)}])
                continue
            for k in ("i", "x", "y"):
                ok.pop(k, None)
            t["card"], changed = ok, True
            row = {"id": t.get("id"), "name": t.get("name") or "", "from": c.get("t"), "to": "blank"}
            if c.get("t") != "blank" and row not in rec["saved"]:
                rec["saved"].append(row)
            if c.get("t") != "blank":
                run_saved.append(row)
        if changed:
            backup = house / TPL_BACKUP
            if not backup.exists():
                shutil.copyfile(tpl, backup)
            write_rec()   # (v3.0.5: the record first — a crash before the file is replaced loses nothing)
            tmp = tpl.with_name(f".{tpl.name}.v305.tmp")
            tmp.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            tmp.replace(tpl)
    rec["tplBoxed"] = True
    write_rec()
    if not retry:   # (v3.0.5: a panel still to move — no marker yet, the next start tries again)
        mark.write_text("3.0.5\n", encoding="utf-8")
    # (v3.0.5: only this move's own rows — the same record holds notices_card.py's: "from": "alerts", "to": "notices")
    # (v3.0.5: and picture_card.py's — "from": "picture", "to": "photos")
    mine = lambda r: isinstance(r, dict) and r.get("from") not in ("alerts", "picture") and r.get("to") not in ("notices", "photos")   # noqa: E731
    panels = sorted(p for p, rows in rec["panels"].items() if any(mine(r) for r in rows))
    failed = [r for r in rec["failed"] if mine(r)]
    # (v3.0.5) the log: this start's moves only (a retry after a panel that couldn't be written counts that panel's,
    # not again the ones an earlier start moved); "could not move": what still can't, now
    run_saved = [r for r in run_saved if mine(r)]
    if log and (n or run_saved or failed):
        bad = f"; {len(failed)} could not move (kept as they were)" if failed else ""
        log(f"layouts (3.0.5): {n} card(s) on {len(run_panels)} panel(s) and {len(run_saved)} saved card(s) are now"
            f" blank cards{bad} - house/layout-upgrade-v305.json")
    return {"ran": True, "cards": n, "panels": panels, "failed": len(failed), "retry": retry}
