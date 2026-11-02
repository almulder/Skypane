"""Saved cards (release 2): a card set up in the layout builder, kept under a name to drop onto any page again.

Kept in DATA_DIR/house/card-templates.json:
  {"v": 1, "templates": [{"id", "name", "card": {t, w, h, s, o, tap?, hold?, dbl?, show?, hi?, hic?}, "at"}]}
The card is checked exactly as a card on a page is (layouts.card); where it sits (x, y, its id) isn't kept. A saved
card is only a starting point: its devices count for the bridge once the card is saved on a page (layouts.card_devices).
"""
import json
import os
import re
import secrets
import threading
import time

try:
    from service import layouts
except ImportError:  # pragma: no cover
    import layouts

TPL_ID = re.compile(r"[0-9a-f]{8}")
MAX_TEMPLATES, NAME_LEN = 60, 40


class Invalid(ValueError):
    pass


def _name(v):
    if not isinstance(v, str):
        raise Invalid("a name")
    n = re.sub(r"[\x00-\x1f\x7f‪-‮⁦-⁩]", " ", v).strip()[:NAME_LEN].strip()
    if not n:
        raise Invalid("a name")
    return n


def _card(c):
    """The card as the builder sent it, checked like any card on a page; kept without its place and id."""
    if not isinstance(c, dict):
        raise Invalid("a card")
    try:
        out = layouts.card({**c, "i": "tpl", "x": 0, "y": 0}, 192, 128)   # (a card from the fine grid: up to 192 × 128)
    except layouts.Invalid as e:
        raise Invalid(str(e))
    for k in ("i", "x", "y"):
        out.pop(k, None)
    return out


class Templates:
    def __init__(self, data_dir):
        self.path = data_dir / "house" / "card-templates.json"
        self.lock = threading.Lock()

    def _load(self):
        try:
            d = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(d, dict) and isinstance(d.get("templates"), list):
                return d
        except (OSError, ValueError):
            pass
        return {"v": 1, "templates": []}

    def _save(self, d):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(f".{self.path.name}.{os.getpid()}.tmp")
        tmp.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        os.replace(tmp, self.path)

    def all(self):
        with self.lock:
            return self._load()["templates"]

    def change(self, req):
        """{action: "add", name, card} | "rename" {id, name} | "remove" {id}. Returns every saved card."""
        if not isinstance(req, dict):
            raise Invalid("an action")
        act = req.get("action")
        with self.lock:
            d = self._load()
            tpls = d["templates"]
            if act == "add":
                if len(tpls) >= MAX_TEMPLATES:
                    raise Invalid(f"at most {MAX_TEMPLATES} saved cards — remove one first")
                tpls.append({"id": secrets.token_hex(4), "name": _name(req.get("name")), "card": _card(req.get("card")), "at": int(time.time()),
                             **({"fine": req["fine"]} if req.get("fine") in (96, 192) and not isinstance(req.get("fine"), bool) else {})})   # (its size: cells of a 96- or 192-wide grid)
            elif act in ("rename", "remove"):
                tid = req.get("id")
                if not isinstance(tid, str) or not TPL_ID.fullmatch(tid):
                    raise Invalid("which saved card")
                hit = next((t for t in tpls if t.get("id") == tid), None)
                if hit is None:
                    raise Invalid("no such saved card")
                if act == "rename":
                    hit["name"] = _name(req.get("name"))
                else:
                    d["templates"] = tpls = [t for t in tpls if t is not hit]
            else:
                raise Invalid("unknown action")
            self._save(d)
            return tpls
