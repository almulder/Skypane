"""Shared lists (to-do, shopping…) and the family note board (release 2): every panel shows and changes the same ones.

Kept in DATA_DIR/house/lists.json:
  {"v": 1, "lists": {"<list id>": [{"id", "text", "done", "at"}]}, "notes": [{"id", "text", "color", "at"}]}
A list exists as soon as a card names it (shopping, todo, chores…). Texts are kept as typed, made plain (no control
characters, at most 120 / 300 characters); the panels escape them. Anyone on the home network can change them, like a
paper list on the fridge — so everything is capped (items per list, lists, notes) and a change is a small action.
"""
import json
import os
import re
import secrets
import threading
import time

LIST_ID = re.compile(r"[a-z0-9-]{1,30}")
ITEM_ID = re.compile(r"[0-9a-f]{8}")
COLORS = ("yellow", "pink", "blue", "green", "purple")
MAX_LISTS, MAX_ITEMS, MAX_NOTES, ITEM_LEN, NOTE_LEN = 20, 200, 30, 120, 300


class Invalid(ValueError):
    pass


def _plain(v, n):
    if not isinstance(v, str):
        raise Invalid("text")
    t = re.sub(r"[\x00-\x1f\x7f‪-‮⁦-⁩]", " ", v).strip()[:n].strip()
    if not t:
        raise Invalid("empty")
    return t


class Lists:
    def __init__(self, data_dir):
        self.path = data_dir / "house" / "lists.json"
        self.lock = threading.Lock()

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

    def change(self, req):
        """One action: {action: "add", list, text} | "toggle" / "remove" {list, id} | "clear" {list} (the done ones) |
        "note" {text, color} | "unnote" {id}. Returns the new document; Invalid when it can't be done."""
        if not isinstance(req, dict):
            raise Invalid("an action")
        a = req.get("action")
        with self.lock:
            d = self._load()
            now = int(time.time())
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
                    if len(items) >= MAX_ITEMS:
                        raise Invalid("the list is full")
                    items.append({"id": secrets.token_hex(4), "text": _plain(req.get("text"), ITEM_LEN), "done": False, "at": now})
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
                d["notes"].append({"id": secrets.token_hex(4), "text": _plain(req.get("text"), NOTE_LEN), "color": color, "at": now})
            elif a == "unnote":
                iid = req.get("id")
                if not isinstance(iid, str) or not ITEM_ID.fullmatch(iid):
                    raise Invalid("which note")
                before = len(d["notes"])
                d["notes"] = [n for n in d["notes"] if n.get("id") != iid]
                if len(d["notes"]) == before:
                    raise Invalid("no such note")
            else:
                raise Invalid("an action: add, toggle, remove, clear, note, unnote")
            self._save(d)
            return d
