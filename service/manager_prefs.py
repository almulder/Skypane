"""Each Manager login's own look (v2.3.0, the new Manager shell): the theme, the sidebar kept open, the view each page
opens in — the same on every browser that login signs in on (the page keeps a copy in localStorage only to paint the
right colours before the server answers).

  DATA_DIR/private/manager-prefs.json   {"v": 1, "by": {"<login name, small letters>": {"theme", "pinned", "views",
                                         "defaultView"}}}   (mode 0600, like the logins)

  theme        "light" | "dark" | "night" (Skypane night)
  pinned       true = the sidebar stays open and pushes the page
  views        {page: view} — e.g. {"devices": "basic"}; small-letter slugs, at most MAX_VIEWS pages
  defaultView  "last" = a page opens in the view used last (a switch is remembered) | "fixed" = only Appearance →
               Default views changes it
  lang         the Manager's language for this login (v2.7.0: "en" only — translations add to LANGS later)
  display      the name shown in the avatar menu and the Timeline beside the login (plain text, at most 40; "" = none)
  color        the avatar's colour, one of COLORS

A login renamed or removed (server.py, PATCH /api/manage/users) moves or drops its entry with it. Unknown fields are
refused, so nothing but these few small values is ever stored.
"""
import json
import os
import re
import secrets
import threading

FILE = "manager-prefs.json"
THEMES = ("light", "dark", "night")
DEFAULT_VIEWS = ("last", "fixed")
SLUG = re.compile(r"[a-z][a-z0-9-]{0,31}")
MAX_VIEWS = 40
MAX_BYTES = 2048        # one login's entry, as stored (JSON)
MAX_LOGINS = 200        # entries kept (more than manager_auth.MAX_USERS: removed logins are dropped anyway)
LANGS = ("en",)
COLORS = ("violet", "teal", "amber", "red", "blue")
DISPLAY_MAX = 40
DEFAULTS = {"theme": "dark", "pinned": False, "views": {}, "defaultView": "last", "lang": "en", "display": "", "color": "violet"}
NEW_KEYS = ("lang", "display", "color")   # (v2.7.0's fields: kept in "ext" — older releases know only the others)


def _key(user):
    return user.lower() if isinstance(user, str) and 0 < len(user) <= 40 else None


def clean(raw, base=None):
    """(prefs, None) or (None, reason): `raw` is a change (only the fields sent change; a view set to null is
    forgotten), applied over `base` (the stored prefs)."""
    if not isinstance(raw, dict):
        return None, "prefs: an object"
    out = {**DEFAULTS, **(base or {}), "views": dict((base or {}).get("views") or {})}
    for k, v in raw.items():
        if k == "theme":
            if v not in THEMES:
                return None, "theme: " + ", ".join(THEMES)
            out["theme"] = v
        elif k == "pinned":
            if not isinstance(v, bool):
                return None, "pinned: true or false"
            out["pinned"] = v
        elif k == "defaultView":
            if v not in DEFAULT_VIEWS:
                return None, "defaultView: " + " or ".join(DEFAULT_VIEWS)
            out["defaultView"] = v
        elif k == "lang":
            if v not in LANGS:
                return None, "lang: " + ", ".join(LANGS)
            out["lang"] = v
        elif k == "color":
            if v not in COLORS:
                return None, "color: " + ", ".join(COLORS)
            out["color"] = v
        elif k == "display":
            if not isinstance(v, str) or len(v) > DISPLAY_MAX or any(ord(c) < 32 or 0x7f <= ord(c) < 0xa0 or ord(c) in (0x2028, 0x2029) for c in v):
                return None, f"display: plain text, at most {DISPLAY_MAX} characters"
            out["display"] = v.strip()
        elif k == "views":
            if not isinstance(v, dict) or len(v) > 4 * MAX_VIEWS:
                return None, "views: an object" if not isinstance(v, dict) else f"views: at most {MAX_VIEWS} pages"
            for page, view in v.items():
                if not isinstance(page, str) or not SLUG.fullmatch(page):
                    return None, "views: a page name in small letters"
                if view is None:
                    out["views"].pop(page, None)
                elif isinstance(view, str) and SLUG.fullmatch(view):
                    out["views"][page] = view
                else:
                    return None, "views: a view name in small letters"
        else:
            return None, f"unknown preference {str(k)[:40]!r}"
    if len(out["views"]) > MAX_VIEWS:
        return None, f"views: at most {MAX_VIEWS} pages"
    if len(json.dumps(out)) > MAX_BYTES:
        return None, "too large"
    return out, None


class Prefs:
    """The stored prefs of every login (one small file; read once, then kept in memory)."""

    def __init__(self, private_dir):
        self.path = private_dir / FILE
        self.lock = threading.Lock()
        self.by = None

    def _load(self):
        if self.by is None:
            self.by = {}
            try:
                doc = json.loads(self.path.read_text(encoding="utf-8"))
                ext = doc.get("ext") if isinstance(doc, dict) and isinstance(doc.get("ext"), dict) else {}
                for k, v in (doc.get("by") or {}).items() if isinstance(doc, dict) else ():
                    e = ext.get(k) if isinstance(ext.get(k), dict) else {}
                    p, _ = clean({**(v if isinstance(v, dict) else {}), **{x: e[x] for x in NEW_KEYS if x in e}})   # (damaged or unknown: the defaults)
                    if _key(k) and p:
                        self.by[_key(k)] = p
            except (OSError, ValueError, AttributeError):
                pass
        return self.by

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(f".{self.path.name}.{secrets.token_hex(6)}.tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        # (v2.7.2) "by" keeps only the fields every release knows; the newer ones live beside it in "ext" — an older
        # release refuses an entry with a field it doesn't know and would reset that login's look, but never reads "ext"
        by = {k: {x: v for x, v in p.items() if x not in NEW_KEYS} for k, p in self.by.items()}
        ext = {k: {x: p[x] for x in NEW_KEYS if x in p and p[x] != DEFAULTS[x]} for k, p in self.by.items()}
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            json.dump({"v": 1, "by": by, "ext": {k: v for k, v in ext.items() if v}}, f, indent=1, sort_keys=True)
        os.replace(tmp, self.path)

    def get(self, user):
        """This login's prefs (the defaults until it changes one)."""
        with self.lock:
            p = self._load().get(_key(user))
            return {**DEFAULTS, **(p or {}), "views": dict((p or {}).get("views") or {})}

    def update(self, user, change):
        """(prefs, None) — saved — or (None, reason)."""
        k = _key(user)
        if not k:
            return None, "no login"
        with self.lock:
            by = self._load()
            p, why = clean(change, by.get(k))
            if not p:
                return None, why
            if k not in by and len(by) >= MAX_LOGINS:
                return None, "too many logins"
            by[k] = p
            self._save()
            return {**p, "views": dict(p["views"])}, None

    def rename(self, old, new):
        """A login renamed: its prefs go with it (a name only changing its capitals keeps them as they are)."""
        a, b = _key(old), _key(new)
        if not a or not b or a == b:
            return
        with self.lock:
            by = self._load()
            if a in by:
                by[b] = by.pop(a)
                self._save()

    def remove(self, user):
        """A login removed: its prefs go too (a new login with that name starts fresh)."""
        k = _key(user)
        with self.lock:
            by = self._load()
            if k in by:
                del by[k]
                self._save()
