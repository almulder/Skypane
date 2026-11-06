"""(v3.0.5) The Trash: what the Manager deletes waits here for a while before it's gone for good
(mockups/CR-trash-and-in-use.md, mockups/prototypes/in-use-305.html).

Kept in DATA_DIR/house/trash/ — inside the house's data folder, never anywhere else:
  <id>/note.json      {"id", "kind", "name", "what", "by", "at", "payload", "files": [file name…]}
  <id>/<file>         the item's own files (a picture's file), moved here as they were
  settings.json       {"keep": 7 | 14 | 30}   how many days deleted things are kept (7 by default)
An id is 16 hex characters; a file name is plain (letters, digits, "._-", never starting with a dot). Nothing here
follows a link: a folder or file that turns out to be a symbolic link is removed as a link, never followed, and the
Trash folder itself must really be inside the data folder (else nothing is read or erased).

What goes in: pictures (backgrounds, icons), cards people made, saved cards, panels. What never does: accounts and
sign-in codes (removed for real), and secrets (a calendar's link, a camera's address with its password). Each item's
"payload" is what the server needs to put it back (service/server.py restores each kind its own way).
Old items go at the first Trash call after their time is up, at the service's start and once an hour (v3.0.5); when
the disk is nearly full (less than LOW_DISK free) or the Trash holds more than MAX_BYTES, the oldest go first — only as
many as needed, and never the newest (its Undo still works).
(v3.0.5) A restore first claims its item: the folder is renamed "<id>.restoring" under the lock, so a second Undo (or
the Trash page's Restore at once) finds nothing; it's removed once the item is back, or renamed back when that fails.
"""
import json
import os
import pathlib
import re
import secrets
import shutil
import stat
import threading
import time

ID_RE = re.compile(r"[0-9a-f]{16}")
FILE_RE = re.compile(r"[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}")
KIND_RE = re.compile(r"[a-z][a-zA-Z]{0,23}")
KEEP_DAYS = (7, 14, 30)
DEFAULT_KEEP = 7
MAX_ITEMS = 500                 # (the oldest go first past this)
LOW_DISK = 1024 ** 3            # (v3.0.5) less free than this (1 GB, whatever the disk's size): the oldest go first
MAX_BYTES = 2 * 1024 ** 3       # (v3.0.5) the whole Trash at most this (2 GB): the oldest go first
NOTE = "note.json"
CLAIM = ".restoring"            # (v3.0.5) an item being restored: "<id>.restoring" (never listed, never restored twice)
CLAIM_RE = re.compile(r"[0-9a-f]{16}\.restoring")
USERINFO_RE = re.compile(r"\b([a-zA-Z][a-zA-Z0-9+.-]{0,15}://)[^\s/?#@]*@")   # (v3.0.5) a URL's "user:pass@"


class Invalid(ValueError):
    pass


def _private_dir(path):
    """(v3.0.5) The Trash's folders: only the service's own user may look in (0700)."""
    try:
        os.chmod(path, 0o700)
    except OSError:
        pass


def strip_userinfo(value):
    """(v3.0.5) Every URL in a payload without its "user:pass@" (a camera's go2rtc, a music page): what goes in the
    Trash never holds a password. Dicts and lists are walked; a copy is returned."""
    if isinstance(value, str):
        return USERINFO_RE.sub(lambda m: m.group(1), value)
    if isinstance(value, dict):
        return {k: strip_userinfo(v) for k, v in value.items()}
    if isinstance(value, list):
        return [strip_userinfo(v) for v in value]
    return value


def _write_json(path, value):
    tmp = path.with_name(f".{path.name}.{secrets.token_hex(4)}.tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    try:
        os.chmod(tmp, 0o600)   # (private stays private in the Trash)
    except OSError:
        pass
    os.replace(tmp, path)


class Trash:
    def __init__(self, data_dir, now=time.time, disk=shutil.disk_usage):
        self.base = pathlib.Path(data_dir)
        self.root = self.base / "house" / "trash"
        self.now = now
        self.disk = disk
        self.lock = threading.RLock()
        self.low_notice = None   # (when the disk was nearly full and old items went early: the Manager shows it)

    # ---------- where things are (always inside the data folder) ----------
    def _safe_root(self):
        """The Trash folder, made if needed — only when it is really inside the data folder (no link out of it)."""
        r = self.root
        if r.is_symlink() or (r.parent.exists() and r.parent.is_symlink()):
            raise Invalid("the Trash folder is a link")
        r.mkdir(parents=True, exist_ok=True)
        _private_dir(r)   # (v3.0.5)
        real, base = os.path.realpath(r), os.path.realpath(self.base)
        if os.path.commonpath([real, base]) != base or real == base:
            raise Invalid("the Trash folder isn't inside the data folder")
        return r

    def _item_dir(self, tid):
        if not isinstance(tid, str) or not ID_RE.fullmatch(tid):
            raise Invalid("which item")
        return self._safe_root() / tid

    @staticmethod
    def _remove(path):
        """Remove a file, a link (the link itself) or a folder of plain files and folders — never following a link."""
        try:
            st = os.lstat(path)
        except FileNotFoundError:
            return
        if not stat.S_ISDIR(st.st_mode):   # (a file or a link: unlinked; a link's target is never touched)
            os.unlink(path)
            return
        for e in os.scandir(path):
            if e.is_dir(follow_symlinks=False):
                Trash._remove(e.path)
            else:
                os.unlink(e.path)
        os.rmdir(path)

    # ---------- the setting ----------
    def keep(self):
        try:
            v = json.loads((self.root / "settings.json").read_text(encoding="utf-8")).get("keep")
        except (OSError, ValueError, AttributeError):
            return DEFAULT_KEEP
        return v if v in KEEP_DAYS and not isinstance(v, bool) else DEFAULT_KEEP

    def set_keep(self, days):
        if days not in KEEP_DAYS or isinstance(days, bool):
            raise Invalid("keep: 7, 14 or 30 days")
        with self.lock:
            _write_json(self._safe_root() / "settings.json", {"keep": days})
            self.purge()
        return days

    # ---------- in and out ----------
    def put(self, kind, name, payload, by=None, what=None, files=()):
        """Move an item in: its payload (JSON) and its files [(path now, file name here)] — moved, not copied, when
        they're on the same disk. Returns the item's note (without the payload)."""
        if not isinstance(kind, str) or not KIND_RE.fullmatch(kind):
            raise Invalid("kind")
        with self.lock:
            root = self._safe_root()
            tid = secrets.token_hex(8)
            d = root / tid
            d.mkdir(mode=0o700)
            _private_dir(d)   # (v3.0.5: 0700 — the mode above isn't kept everywhere, so set again)
            names, moved = [], []
            try:
                for src, fname in files:
                    if not FILE_RE.fullmatch(fname) or fname == NOTE:
                        raise Invalid("file name")
                    src = pathlib.Path(src)
                    if src.is_symlink() or not src.is_file():
                        continue   # (a file already gone: the item still goes in, without it)
                    try:
                        os.replace(src, d / fname)
                    except OSError:   # (another disk: copied, then the original removed)
                        shutil.copyfile(src, d / fname)
                        os.unlink(src)
                    moved.append((d / fname, src))
                    try:
                        os.chmod(d / fname, 0o600)
                    except OSError:
                        pass
                    names.append(fname)
                note = {"id": tid, "kind": kind, "name": str(name or "")[:80], "what": str(what or "")[:80] or None,
                        "by": str(by)[:64] if by else None, "at": int(self.now()), "payload": payload, "files": names}
                _write_json(d / NOTE, note)
            except Exception:
                stuck = False
                for here, src in moved:   # (what was moved in goes back where it was: nothing is lost)
                    try:
                        shutil.move(str(here), str(src))
                    except OSError:
                        stuck = True
                if not stuck:   # (v3.0.5: a file that couldn't go back keeps its folder — never erased with it)
                    self._remove(d)
                raise
            self.purge()
            return self._public(note)

    def _read(self, d):
        try:
            if d.is_symlink():
                return None
            n = json.loads((d / NOTE).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        if not isinstance(n, dict) or n.get("id") != d.name or not isinstance(n.get("kind"), str) or not isinstance(n.get("at"), int):
            return None
        n["files"] = [f for f in n.get("files") or [] if isinstance(f, str) and FILE_RE.fullmatch(f) and f != NOTE]
        return n

    def _size(self, d):
        total = 0
        try:
            for e in os.scandir(d):
                if e.is_file(follow_symlinks=False):
                    total += e.stat(follow_symlinks=False).st_size
        except OSError:
            pass
        return total

    def _public(self, n, size=None):
        keep = self.keep()
        left = max(0, keep * 86400 - (int(self.now()) - n["at"]))
        return {k: n.get(k) for k in ("id", "kind", "name", "what", "by", "at")} | {
            "days": max(1, -(-left // 86400)) if left else 0, "bytes": size}

    def _all(self):
        try:
            root = self._safe_root()
        except (Invalid, OSError):
            return []
        out = []
        for d in root.iterdir():
            if ID_RE.fullmatch(d.name):
                n = self._read(d)
                if n:
                    out.append((n, d))
        return sorted(out, key=lambda x: -x[0]["at"])

    def items(self):
        """[{id, kind, name, what, by, at, days (left), bytes}], newest first."""
        with self.lock:
            self.purge()
            return [self._public(n, self._size(d)) for n, d in self._all()]

    def size(self):
        with self.lock:
            return sum(self._size(d) for _, d in self._all())

    def get(self, tid):
        """The whole note of one item (with its payload), or None."""
        with self.lock:
            d = self._item_dir(tid)
            return self._read(d) if d.is_dir() else None

    def file(self, tid, fname):
        """The path of one of an item's files (inside its folder — v3.0.5: or its claimed folder while it's being
        restored — never a link), or None."""
        d = self._item_dir(tid)
        if not isinstance(fname, str) or not FILE_RE.fullmatch(fname) or fname == NOTE:
            return None
        for folder in (d.with_name(tid + CLAIM), d):
            p = folder / fname
            if not folder.is_symlink() and p.is_file() and not p.is_symlink():
                return p
        return None

    def claim(self, tid):
        """(v3.0.5) A restore's first step, under the lock: the item's folder renamed "<id>.restoring" → its note (with
        the payload), or None when it isn't there (already restored, erased, or being restored right now)."""
        with self.lock:
            d = self._item_dir(tid)
            if d.is_symlink() or not d.is_dir():
                return None
            n = self._read(d)
            c = d.with_name(tid + CLAIM)
            if not n or os.path.lexists(c):
                return None
            os.replace(d, c)
            return n

    def unclaim(self, tid):
        """(v3.0.5) The restore failed: the item back in the Trash as it was."""
        with self.lock:
            d = self._item_dir(tid)
            c = d.with_name(tid + CLAIM)
            if c.is_dir() and not c.is_symlink() and not os.path.lexists(d):
                os.replace(c, d)

    def forget(self, tid):
        """An item put back where it was: its folder goes (what it held was moved back first) — v3.0.5: the claimed
        folder, else the item's own."""
        with self.lock:
            d = self._item_dir(tid)
            c = d.with_name(tid + CLAIM)
            self._remove(c if os.path.lexists(c) else d)

    def erase(self, tid):
        """Delete now: gone for good. False when there was no such item."""
        with self.lock:
            d = self._item_dir(tid)
            if not d.is_dir() or d.is_symlink():
                if d.is_symlink():
                    os.unlink(d)
                return False
            self._remove(d)
            return True

    def empty(self):
        with self.lock:
            n = 0
            for _, d in self._all():
                self._remove(d)
                n += 1
            return n

    def _stale_claims(self, limit, now):
        """(v3.0.5) A restore that never finished (the service stopped half way): its "<id>.restoring" folder goes when
        the item's time is up, as the item would have — it's never restored again (it may be back already)."""
        try:
            ds = [d for d in self._safe_root().iterdir() if CLAIM_RE.fullmatch(d.name)]
        except (Invalid, OSError):
            return
        for d in ds:
            try:
                n = {} if d.is_symlink() else json.loads((d / NOTE).read_text(encoding="utf-8"))
            except (OSError, ValueError):
                n = {}
            try:
                at = n.get("at") if isinstance(n, dict) and isinstance(n.get("at"), int) else int(os.lstat(d).st_mtime)
                if now - at >= limit:
                    self._remove(d)
            except OSError:
                pass

    def purge(self):
        """Erase what's past its time, past MAX_ITEMS or MAX_BYTES, and — the disk nearly full — the oldest first.
        (v3.0.5) Only as many as needed, each one's size counted; the newest always stays. → how many went."""
        with self.lock:
            limit = self.keep() * 86400
            now = int(self.now())
            self._stale_claims(limit, now)
            items = self._all()
            if not items:
                return 0
            gone = 0
            keep = []
            for n, d in items:
                if now - n["at"] >= limit:
                    self._remove(d)
                    gone += 1
                else:
                    keep.append((n, d))
            while len(keep) > MAX_ITEMS:
                self._remove(keep.pop()[1])
                gone += 1
            # (v3.0.5) room: the Trash past MAX_BYTES, or the disk with less than LOW_DISK free — the oldest go first
            # until what they held covers it (never the whole Trash: the newest stays, so its Undo still works)
            sizes = [self._size(d) for _, d in keep]
            need_total = sum(sizes) - MAX_BYTES
            try:
                need_disk = LOW_DISK - self.disk(str(self.root)).free
            except OSError:
                need_disk = 0
            freed = 0
            while len(keep) > 1 and (freed < need_total or freed < need_disk):
                if freed < need_disk:
                    self.low_notice = now
                self._remove(keep.pop()[1])   # (the oldest first)
                freed += sizes.pop()
                gone += 1
            return gone
