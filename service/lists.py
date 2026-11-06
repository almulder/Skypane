"""Shared lists (to-do, shopping…) and the family note board (release 2): every panel shows and changes the same ones.

Kept in DATA_DIR/house/lists.json:
  {"v": 1, "lists": {"<list id>": [{"id", "text", "done", "at"}]}, "notes": [{"id", "text", "color", "at"}]}
A list exists as soon as a card names it (shopping, todo, chores…). Texts are kept as typed, made plain (no control
characters, at most 120 / 300 characters); the panels escape them. Anyone on the home network can change them, like a
paper list on the fridge — so everything is capped (items per list, lists, notes) and a change is a small action.
(v3.0.5, the Manager's Lists & notes page — mockups/prototypes/settings-and-pages.html, Lists & notes):
  "chips": {"<list id>": ["Milk", …]} the quick-add chips (on the Manager page and the panel's List card; a tap adds it),
  "names": {"<list id>": "Hardware store"} a list made in the Manager keeps the name it was given,
  an item's / a note's "by": "panel" | "manager" | "hubitat" (who added it — a kind, never a login),
  a note's "pin": false — written in the Manager and not pinned: only the pinned ones (no "pin", or true) show on the
  panels. A Hubitat rule (parse_command, through the Skypane Notifier's notify — the bridge takes it, as the timers):
  "add to list: Shopping, milk" | "remove from list: Shopping, milk" | "tick: Shopping, milk" | "pin note: <text>".
(v3.0.5, review) A chip only for a list that exists or a List card names; a chip's tap ({action: "add", chip: true})
only while it is still one of that list's chips; an "add" that repeats an unticked item added within DUP_SECS is
ignored (a double tap). Undo puts a removed item / note back as it was ("restore" / "restorenote"). The Manager may
rename a list ("renamelist": its id stays — the cards name the id) and delete an empty one ("deletelist"; the server
blocks it while a List card names it). Texts are NFC and lose invisible characters, so names compare as they read.
"""
import json
import os
import re
import secrets
import threading
import time
import unicodedata

LIST_ID = re.compile(r"[a-z0-9-]{1,30}")
ITEM_ID = re.compile(r"[0-9a-f]{8}")
COLORS = ("yellow", "pink", "blue", "green", "purple")
MAX_LISTS, MAX_ITEMS, MAX_NOTES, ITEM_LEN, NOTE_LEN = 20, 200, 30, 120, 300
# (v3.0.5) quick-add chips (per list), a list's name; who added an item / a note
MAX_CHIPS, CHIP_LEN, NAME_LEN = 12, 40, 40
BY = ("panel", "manager", "hubitat")
# (v3.0.5) a Hubitat rule's list command: the bridge → the server on TOPIC (only the internal login writes it); at most
# COMMAND_LEN characters, a list's name at most NAME_LEN
TOPIC = "hubitat/list"
# (v3.0.5) the server's answer for the bridge {"v": 1, "id": the alert's id, "ok"}: only a done command's alert stays off
# the panels (dashboard/#: only the internal login writes it, and no panel login reads it)
RESULT_TOPIC = "dashboard/lists/result"
COMMAND_LEN = 320
COMMAND = re.compile(r"\s*(add to list|remove from list|tick)\s*:\s*([^,]{1,40}?)\s*,\s*(.{1,120}?)\s*", re.I | re.S)
NOTE_COMMAND = re.compile(r"\s*pin note\s*:\s*(.{1,300}?)\s*", re.I | re.S)
VERBS = {"add to list": "add", "remove from list": "remove", "tick": "tick"}


class Invalid(ValueError):
    pass


# (v3.0.5) what never stays in a text: control characters (C0, DEL, C1), zero-width and direction marks, the line and
# paragraph separators, the byte-order mark, the bidi embeddings and isolates
_HIDDEN = re.compile("[\x00-\x1f\x7f-\x9f​-‏  ‪-‮⁦-⁩﻿]")
DUP_SECS = 2   # (v3.0.5) the same unticked item added again within this long: a double tap, ignored


def _plain(v, n):
    if not isinstance(v, str):
        raise Invalid("text")
    t = _HIDDEN.sub(" ", unicodedata.normalize("NFC", v)).strip()[:n].strip()   # (v3.0.5: NFC, the invisible ones out)
    if not t:
        raise Invalid("empty")
    return t


def _fold(v):
    """(v3.0.5) A text for comparing: NFC, any case ("Café" typed two ways is one name)."""
    return unicodedata.normalize("NFC", str(v or "")).casefold()


def slug(name):
    """(v3.0.5) A list's name → its id: "Hardware store" → "hardware-store" ("" when nothing is left)."""
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", str(name or "").lower())).strip("-")[:30].strip("-")


def parse_command(text):
    """(v3.0.5) A Hubitat rule's notify text → {"op": "add" | "remove" | "tick", "list": the name as written, "text"} or
    {"op": "note", "text"}; None when it isn't one (then it's an ordinary alert)."""
    if not isinstance(text, str) or len(text) > COMMAND_LEN or re.search(r"[\x00-\x1f\x7f]", text):
        return None
    m = NOTE_COMMAND.fullmatch(text)
    if m:
        try:
            return {"op": "note", "text": _plain(m[1], NOTE_LEN)}
        except Invalid:
            return None
    m = COMMAND.fullmatch(text)
    if not m:
        return None
    try:
        return {"op": VERBS[m[1].lower()], "list": _plain(m[2], NAME_LEN), "text": _plain(m[3], ITEM_LEN)}
    except Invalid:
        return None


def list_name(d, lid):
    """(v3.0.5) A list's name: the one it was given in the Manager, else its id in words ("hardware-store" → "Hardware store")."""
    n = d.get("names").get(lid) if isinstance(d.get("names"), dict) else None
    return n if isinstance(n, str) and n else lid.replace("-", " ").capitalize()


class Lists:
    def __init__(self, data_dir):
        self.path = data_dir / "house" / "lists.json"
        self.lock = threading.RLock()   # (v3.0.5: re-entrant — command() finds and changes under one hold)
        self._recent = {}   # (v3.0.5) (list id, text) → when it was last added (time.monotonic): DUP_SECS

    def _load(self):
        try:
            d = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(d, dict) and isinstance(d.get("lists"), dict) and isinstance(d.get("notes"), list):
                return d
        except (OSError, ValueError):
            pass
        return {"v": 1, "lists": {}, "notes": []}

    def _save(self, d):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(f".{self.path.name}.{os.getpid()}.tmp")
        tmp.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        os.replace(tmp, self.path)

    def get(self):
        with self.lock:
            return self._load()

    def change(self, req, by=None, known=()):
        """One action: {action: "add", list, text} | "toggle" / "remove" {list, id} | "clear" {list} (the done ones) |
        "note" {text, color} | "unnote" {id}; (v3.0.5) "pin" {id, pin: bool} | "editnote" {id, text} | "chip" / "unchip"
        {list, text} | "newlist" {name} | "renamelist" {list, name} | "deletelist" {list} (an empty one) | "restore"
        {list, item, at?} | "restorenote" {note, at?} (Undo: as it was). by: who adds (BY — the server says, never the
        request); known: the list ids the List cards name (a chip needs its list). Returns the new document; Invalid
        when it can't be done."""
        if not isinstance(req, dict):
            raise Invalid("an action")
        a = req.get("action")
        who = {"by": by} if by in BY else {}
        known = {k for k in known or () if isinstance(k, str) and LIST_ID.fullmatch(k)}
        with self.lock:
            d = self._load()
            now = int(time.time())
            if a in ("renamelist", "deletelist"):   # (v3.0.5) the Manager: a list's name; an empty list away
                lid = req.get("list")
                if not isinstance(lid, str) or not LIST_ID.fullmatch(lid):
                    raise Invalid("which list")
                names = d["names"] if isinstance(d.get("names"), dict) else {}
                chips = d["chips"] if isinstance(d.get("chips"), dict) else {}
                if lid not in d["lists"] and lid not in known and lid not in names and lid not in chips:
                    raise Invalid("no such list")
                if a == "renamelist":
                    name = _plain(req.get("name"), NAME_LEN)
                    if not slug(name):
                        raise Invalid("a name with a letter or a digit")
                    others = [k for k in {*d["lists"], *known, *names} if k != lid]
                    if any(_fold(list_name(d, k)) == _fold(name) or k == slug(name) for k in others):
                        raise Invalid("name-taken")
                    names[lid] = name
                    d["names"] = names
                else:
                    if d["lists"].get(lid):
                        raise Invalid("not-empty")
                    d["lists"].pop(lid, None)
                    names.pop(lid, None)
                    chips.pop(lid, None)
                    d["names"], d["chips"] = names, chips
                self._save(d)
                return d
            if a in ("restore", "restorenote"):   # (v3.0.5) Undo: a removed item / note back, as it was
                return self._restore(d, a, req, now)
            if a == "restorelist":   # (v3.0.5, tester) Undo of "deletelist": the empty list back, its name and its chips
                lid = req.get("list")
                if not isinstance(lid, str) or not LIST_ID.fullmatch(lid):
                    raise Invalid("which list")
                names = d["names"] if isinstance(d.get("names"), dict) else {}
                chips = d["chips"] if isinstance(d.get("chips"), dict) else {}
                name = _plain(req["name"], NAME_LEN) if isinstance(req.get("name"), str) and req["name"].strip() else None
                if name and any(_fold(list_name(d, k)) == _fold(name) for k in {*d["lists"], *known, *names} if k != lid):
                    raise Invalid("name-taken")
                want = [_plain(c, CHIP_LEN) for c in req.get("chips") or [] if isinstance(c, str) and c.strip()] if isinstance(req.get("chips"), list) else []
                have = [c for c in chips.get(lid) or [] if isinstance(c, str)]
                for c in want:
                    if len(have) < MAX_CHIPS and not any(_fold(x) == _fold(c) for x in have):
                        have.append(c)
                if lid not in d["lists"]:
                    if len(d["lists"]) >= MAX_LISTS:
                        raise Invalid("too many lists")
                    d["lists"][lid] = []
                if have:
                    if lid not in chips and len(chips) >= MAX_LISTS:
                        raise Invalid("too many lists")
                    chips[lid] = have
                if name:
                    names[lid] = name
                d["names"], d["chips"] = names, chips
                self._save(d)
                return d
            if a == "newlist":   # (v3.0.5: the Manager's "New list" — its id from the name)
                name = _plain(req.get("name"), NAME_LEN)
                lid = slug(name)
                if not lid:
                    raise Invalid("a name with a letter or a digit")
                if lid not in d["lists"]:
                    if len(d["lists"]) >= MAX_LISTS:
                        raise Invalid("too many lists")
                    d["lists"][lid] = []
                names = d["names"] if isinstance(d.get("names"), dict) else {}
                names[lid] = name
                d["names"] = names
                self._save(d)
                return d
            if a in ("chip", "unchip"):   # (v3.0.5) a list's quick-add chips
                lid = req.get("list")
                if not isinstance(lid, str) or not LIST_ID.fullmatch(lid):
                    raise Invalid("which list")
                text = _plain(req.get("text"), CHIP_LEN)
                chips = d["chips"] if isinstance(d.get("chips"), dict) else {}
                have = [c for c in chips.get(lid) or [] if isinstance(c, str)]
                if a == "chip":
                    if lid not in d["lists"] and lid not in known:   # (v3.0.5: only a list there is, or a card names)
                        raise Invalid("no such list")
                    if any(_fold(c) == _fold(text) for c in have):
                        raise Invalid("that chip is there already")
                    if len(have) >= MAX_CHIPS:
                        raise Invalid(f"at most {MAX_CHIPS} chips")
                    if lid not in chips and len(chips) >= MAX_LISTS:
                        raise Invalid("too many lists")
                    chips[lid] = have + [text]
                else:
                    left = [c for c in have if _fold(c) != _fold(text)]
                    if len(left) == len(have):
                        raise Invalid("no such chip")
                    chips[lid] = left
                    if not left:
                        chips.pop(lid, None)
                d["chips"] = chips
                self._save(d)
                return d
            if a in ("add", "toggle", "remove", "clear"):
                lid = req.get("list")
                if not isinstance(lid, str) or not LIST_ID.fullmatch(lid):
                    raise Invalid("which list")
                items = d["lists"].get(lid)
                if items is None:
                    if a != "add":
                        raise Invalid("no such list")
                    if len(d["lists"]) >= MAX_LISTS:
                        raise Invalid("too many lists")
                    items = d["lists"][lid] = []
                if a == "add":
                    text = _plain(req.get("text"), ITEM_LEN)
                    if req.get("chip") is True:   # (v3.0.5: a chip's tap — only while it is still one of this list's chips)
                        chips = d["chips"].get(lid) if isinstance(d.get("chips"), dict) else None
                        if not isinstance(chips, list) or text not in chips:
                            raise Invalid("no such chip")
                    # (v3.0.5) the same unticked item again within DUP_SECS: a double tap — nothing added
                    mono, key = time.monotonic(), (lid, text)
                    self._recent = {k: t for k, t in self._recent.items() if mono - t < DUP_SECS}
                    if len(items) >= MAX_ITEMS:
                        raise Invalid("the list is full")
                    if key in self._recent and any(i.get("text") == text and not i.get("done") for i in items):
                        return d
                    items.append({"id": secrets.token_hex(4), "text": text, "done": False, "at": now, **who})
                    self._recent[key] = mono
                elif a == "clear":
                    d["lists"][lid] = [i for i in items if not i.get("done")]
                else:
                    iid = req.get("id")
                    if not isinstance(iid, str) or not ITEM_ID.fullmatch(iid):
                        raise Invalid("which item")
                    hit = next((i for i in items if i.get("id") == iid), None)
                    if hit is None:
                        raise Invalid("no such item")
                    if a == "toggle":
                        hit["done"] = not hit.get("done")
                    else:
                        items.remove(hit)
            elif a == "note":
                if len(d["notes"]) >= MAX_NOTES:
                    raise Invalid("the board is full")
                color = req.get("color") if req.get("color") in COLORS else "yellow"
                # (v3.0.5: written in the Manager, a note starts unpinned — as the mockup — unless it says pin: true)
                pin = {"pin": False} if by == "manager" and req.get("pin") is not True else {}
                d["notes"].append({"id": secrets.token_hex(4), "text": _plain(req.get("text"), NOTE_LEN), "color": color, "at": now, **who, **pin})
            elif a in ("pin", "editnote"):   # (v3.0.5) pin / unpin a note, or change its words
                iid = req.get("id")
                if not isinstance(iid, str) or not ITEM_ID.fullmatch(iid):
                    raise Invalid("which note")
                hit = next((n for n in d["notes"] if n.get("id") == iid), None)
                if hit is None:
                    raise Invalid("no such note")
                if a == "pin":
                    if not isinstance(req.get("pin"), bool):
                        raise Invalid("pin: true or false")
                    if req["pin"]:
                        hit.pop("pin", None)
                    else:
                        hit["pin"] = False
                else:
                    hit["text"] = _plain(req.get("text"), NOTE_LEN)
            elif a == "unnote":
                iid = req.get("id")
                if not isinstance(iid, str) or not ITEM_ID.fullmatch(iid):
                    raise Invalid("which note")
                before = len(d["notes"])
                d["notes"] = [n for n in d["notes"] if n.get("id") != iid]
                if len(d["notes"]) == before:
                    raise Invalid("no such note")
            else:
                raise Invalid("an action: add, toggle, remove, clear, note, unnote, pin, editnote, chip, unchip, newlist, "
                              "renamelist, deletelist, restorelist, restore, restorenote")   # (v3.0.5: restorelist)
            self._save(d)
            return d

    def _restore(self, d, a, req, now):
        """(v3.0.5, under the lock) Undo: {action: "restore", list, item, at?} | {action: "restorenote", note, at?} — the
        removed item / note back with its own id, words, tick, time and who added it, at its old place (at: its index)."""
        x = req.get("item" if a == "restore" else "note")
        if not isinstance(x, dict) or not isinstance(x.get("id"), str) or not ITEM_ID.fullmatch(x["id"]):
            raise Invalid("which item")
        at = x.get("at") if isinstance(x.get("at"), int) and not isinstance(x.get("at"), bool) and 0 < x["at"] <= now + 60 else now
        keep = {"by": x["by"]} if x.get("by") in BY else {}
        pos = req.get("at") if isinstance(req.get("at"), int) and not isinstance(req.get("at"), bool) else None
        if a == "restore":
            lid = req.get("list")
            if not isinstance(lid, str) or not LIST_ID.fullmatch(lid):
                raise Invalid("which list")
            items = d["lists"].get(lid)
            if items is None:
                if len(d["lists"]) >= MAX_LISTS:
                    raise Invalid("too many lists")
                items = d["lists"][lid] = []
            if any(i.get("id") == x["id"] for i in items):
                raise Invalid("it's back already")
            if len(items) >= MAX_ITEMS:
                raise Invalid("the list is full")
            row = {"id": x["id"], "text": _plain(x.get("text"), ITEM_LEN), "done": x.get("done") is True, "at": at, **keep}
        else:
            items = d["notes"]
            if any(n.get("id") == x["id"] for n in items):
                raise Invalid("it's back already")
            if len(items) >= MAX_NOTES:
                raise Invalid("the board is full")
            row = {"id": x["id"], "text": _plain(x.get("text"), NOTE_LEN), "color": x.get("color") if x.get("color") in COLORS else "yellow",
                   "at": at, **keep, **({"pin": False} if x.get("pin") is False else {})}
        items.insert(len(items) if pos is None else max(0, min(pos, len(items))), row)
        self._save(d)
        return d

    def command(self, cmd, known=(), by="hubitat"):
        """(v3.0.5) parse_command's answer, from a Hubitat rule (or the Manager's "Run": by "manager") → (the new
        document, what was done: "added" | "removed" | "ticked" | "pinned"). The list must exist — in the file, or named
        by a card (known: list ids) — by its id or its name (any case, NFC); add never makes a new list. remove / tick:
        the first item of that text (any case); tick sets it ticked (a ticked one stays ticked). Found and changed under
        one hold of the lock. Invalid when it can't be done."""
        if not isinstance(cmd, dict) or cmd.get("op") not in ("add", "remove", "tick", "note"):
            raise Invalid("a command")
        by = by if by in BY else "hubitat"
        if cmd["op"] == "note":   # (pinned: it shows on the panels)
            return self.change({"action": "note", "text": cmd.get("text"), "pin": True}, by=by), "pinned"
        want = _fold(cmd.get("list"))
        with self.lock:
            d = self._load()
            ids = list(dict.fromkeys([*d["lists"], *(k for k in known if isinstance(k, str) and LIST_ID.fullmatch(k))]))
            lid = next((k for k in ids if want and (k == want or k == slug(want) or _fold(list_name(d, k)) == want)), None)
            if lid is None:
                raise Invalid("no such list")
            if cmd["op"] == "add":
                return self.change({"action": "add", "list": lid, "text": cmd.get("text")}, by=by, known=known), "added"
            text = _fold(cmd.get("text"))
            hit = next((i for i in d["lists"].get(lid) or [] if _fold(i.get("text", "")) == text), None)
            if hit is None:
                raise Invalid("no such item")
            if cmd["op"] == "tick":
                if not hit.get("done"):
                    hit["done"] = True
                    self._save(d)
                return d, "ticked"
            d["lists"][lid] = [i for i in d["lists"][lid] if i is not hit]
            self._save(d)
            return d, "removed"
