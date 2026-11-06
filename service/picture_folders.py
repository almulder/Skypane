"""(v3.0.5) Picture folders: pictures read from a folder mapped into the container, besides the uploads (TESTING-NOTES
"Picture sources in the Manager"; the design: mockups/prototypes/settings-and-pages.html → Pictures → Picture sources).

Skypane never mounts anything itself (SMB / NFS inside the container needs extra rights). The owner maps a host folder
or a NAS share the host mounted (Unraid: Unassigned Devices) into the container, read-only, under one fixed media root:

  PICTURES_DIR=/pictures   (the container variable; unset or not a folder = the feature is off)
  -v /mnt/user/Photos:/pictures:ro

Under that root the admin picks folders (Manager → Picture folders); each is a source "fs:<12 hex>" a Slide show /
Picture card, a rotating background or the screensaver plays (service/layouts.py show_opts). Kept in
DATA_DIR/house/picture-folders.json: {"v": 1, "sources": [{"id", "name", "path" (relative to the root, "/" separated)}]}.

Safety (security first — a folder is outside Skypane's own data):
  - a path is relative, "/" separated, no "." / ".." / empty / hidden parts, no NUL or backslash; every part on the
    way is checked with lstat: a symlink (file or folder) is never followed — not even one that points inside;
  - the real path (os.path.realpath) must stay inside the root's real path (a bind mount within is fine, a link out
    isn't), checked again each time a picture is served;
  - only .jpg / .jpeg / .png / .webp / .gif files, recognised by their content too (pictures.sniff — never SVG), at
    most MAX_FILE bytes and MAX_PIXELS pixels, at most MAX_ITEMS per source and MAX_DEPTH folders deep; hidden files
    and NAS helper folders (@eaDir, #recycle…) are skipped;
  - the panels and the Manager only ever see a picture's key (a hash of its path), never the path;
  - read-only: nothing under the root is ever written, renamed or removed.

The panels get resized copies, never the full-size photo: Pillow (already in the image for service/reencode.py) draws
each at S / M / L (SIZES, the longest side) in a child process with limits, as a JPEG (a WebP when it has
transparency), cached in DATA_DIR/cache/picture-folders/ (keyed by the path, its size and time — a changed photo is
drawn again; (v3.0.5) the least recently used go past MAX_CACHE copies or MAX_CACHE_BYTES, and a removed source's copies
go with it). Without Pillow (a laptop test run) the original is served when it's at most RAW_MAX bytes. A folder is
listed again every RESCAN seconds (or when the admin asks).
(v3.0.5) A picture is opened once and read from that same open file: on POSIX part by part with O_NOFOLLOW (dir_fd),
so a folder or file swapped for a link after the checks is never followed; on Windows the open file is compared with
the checked path. The resize child gets the bytes on stdin, never a path. A picture's key includes its size and time,
so an edited photo gets a new address (never a stale copy in a tablet's cache).
"""
import hashlib
import json
import os
import pathlib
import re
import secrets
import stat
import subprocess
import sys
import threading
import time
import unicodedata   # (v3.0.5: _name)

try:
    from service import pictures, reencode
except ImportError:  # pragma: no cover  (run from inside service/)
    import pictures
    import reencode

ENV = "PICTURES_DIR"
CONF = "picture-folders.json"
EXTS = {".jpg": "jpg", ".jpeg": "jpg", ".png": "png", ".webp": "webp", ".gif": "gif"}
SKIP = {"@eadir", "#recycle", "#snapshot", "$recycle.bin", "lost+found", ".trash", "@recycle", "system volume information"}
MAX_FILE = 40 << 20          # a picture file at most 40 MB
MAX_PIXELS = 60_000_000       # … and 60 megapixels
RAW_MAX = 8 << 20             # without Pillow: the original only up to 8 MB
MAX_ITEMS = 5000              # pictures per source
MAX_DEPTH = 6                 # folders deep (the source itself is 0)
MAX_SOURCES = 24
MAX_LIST = 400                # folders in one Browse answer
RESCAN = 600                  # s between listings of a source
SIZES = {"s": 360, "m": 1280, "l": 1920}
MAX_CACHE = 3000              # resized copies kept
MAX_CACHE_BYTES = 500 << 20   # (v3.0.5) … taking at most about 500 MB
TIMEOUT = 25
SRC_ID = re.compile(r"[0-9a-f]{12}")
KEY = re.compile(r"[0-9a-f]{20}")
PART = re.compile(r"[^\x00-\x1f/\\:]{1,255}")   # (v3.0.5: no ":" either — a drive or a Windows stream)


# (v3.0.5) as lists.py's _HIDDEN: control characters (C0, DEL, C1), zero-width and direction marks, the line and
# paragraph separators, the byte-order mark, the bidi embeddings and isolates — never in a folder's name
_HIDDEN = re.compile("[\x00-\x1f\x7f-\x9f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]")


def _name(v, n=40):
    """(v3.0.5) A picture folder's name as it is kept: NFC, the hidden characters out (house_model.safe_text after)."""
    try:
        from service.house_model import safe_text
    except ImportError:  # pragma: no cover
        from house_model import safe_text
    return safe_text(_HIDDEN.sub(" ", unicodedata.normalize("NFC", v)), n) if isinstance(v, str) else ""


class Invalid(ValueError):
    pass


# (v3.0.5) what the Manager is told: a short code (folders.js shows its own words for each — strings/en.js folders.err.*)
CODES = {"a folder": "bad-path", "picture folders are off": "off", "not found": "not-found", "a link: not followed": "link",
         "not a folder": "not-a-folder", "not a file": "not-a-folder", "outside the picture folders": "outside",
         "can't be read": "unreadable", "name: text": "name", "that folder is a source already": "already",
         "no such picture folder": "not-found"}


def code(e):
    msg = str(e)
    return "too-many" if msg.startswith("at most") else CODES.get(msg, "invalid")


def clean_rel(rel):
    """A folder path relative to the root, made safe: "" (the root itself) or "a/b/c". Invalid on anything that could
    leave it (absolute, "..", ".", a hidden part, a backslash, NUL, control characters)."""
    if rel is None:
        return ""
    if not isinstance(rel, str) or len(rel) > 1000:
        raise Invalid("a folder")
    rel = rel.strip("/")   # (never trimmed of spaces: " Family" is another folder, and refused)
    if not rel:
        return ""
    parts = rel.split("/")
    for p in parts:
        if not PART.fullmatch(p) or p in (".", "..") or p.startswith(".") or p.strip() != p:
            raise Invalid("a folder")
    return "/".join(parts)


# the child that draws a smaller copy: (v3.0.5) the picture's bytes on stdin (never a path), the copy on stdout
# ("jpg\n" / "webp\n" + bytes); exit 2 = not a picture. Limits like reencode.py's.
_CHILD = r"""
import io, sys
try:
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (1536 << 20, 1536 << 20))
    resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
except Exception:
    pass
from PIL import Image, ImageOps
side, fmt, maxpx = int(sys.argv[1]), sys.argv[2], int(sys.argv[3])
Image.MAX_IMAGE_PIXELS = maxpx
try:
    im = Image.open(io.BytesIO(sys.stdin.buffer.read()), formats=[{"png": "PNG", "jpg": "JPEG", "webp": "WEBP", "gif": "GIF"}[fmt]])
    if im.width * im.height > maxpx:
        raise ValueError("too big")
    if fmt == "jpg":
        im.draft("RGB", (side, side))   # (decoded at a fraction of its size: far less work for a big photo)
    im.load()
    turned = ImageOps.exif_transpose(im)
    im = turned if turned is not None else im
    alpha = im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info)
    im = im.convert("RGBA" if alpha else "RGB")
    im.thumbnail((side, side), Image.LANCZOS)
    out = io.BytesIO()
    if alpha:
        im.save(out, "WEBP", quality=82, method=4)
        sys.stdout.buffer.write(b"webp\n")
    else:
        im.save(out, "JPEG", quality=82, optimize=True, progressive=True)
        sys.stdout.buffer.write(b"jpg\n")
    sys.stdout.buffer.write(out.getvalue())
except Exception as e:
    sys.stderr.write(type(e).__name__)
    sys.exit(2)
"""


class Folders:
    def __init__(self, data_dir, root=None):
        self.data_dir = pathlib.Path(data_dir)
        self.conf = self.data_dir / "house" / CONF
        self.cache = self.data_dir / "cache" / "picture-folders"
        self.lock = threading.Lock()
        self.draw = threading.Semaphore(2)   # (two copies drawn at a time: a wall of panels starting at once waits)
        self.scans = {}   # source id → (monotonic time, [(key, rel, size, mtime)], error, path)
        self.walking = {}   # (v3.0.5) source id → its lock: one listing at a time, the others get the last list meanwhile
        root = os.environ.get(ENV, "") if root is None else root
        self.root = None
        if root:
            try:
                real = os.path.realpath(root)
                if os.path.isdir(real):
                    self.root = real
            except (OSError, ValueError):
                self.root = None
        self.shown_root = root if self.root else ""   # (the container path the owner set — never a host path)

    @property
    def enabled(self):
        return self.root is not None

    # ---- paths ------------------------------------------------------------------------------------------------
    def _inside(self, real):
        return real == self.root or real.startswith(self.root.rstrip(os.sep) + os.sep)

    def resolve(self, rel, want_dir=True):
        """The real path of `rel` under the root — every part checked with lstat (never a symlink), the real path
        inside the root. Invalid otherwise (a missing folder too)."""
        if not self.root:
            raise Invalid("picture folders are off")
        rel = clean_rel(rel)
        cur = self.root
        for p in rel.split("/") if rel else []:
            cur = os.path.join(cur, p)
            try:
                st = os.lstat(cur)
            except OSError:
                raise Invalid("not found") from None
            if stat.S_ISLNK(st.st_mode):
                raise Invalid("a link: not followed")
        try:
            st = os.lstat(cur)
        except OSError:
            raise Invalid("not found") from None
        if want_dir and not stat.S_ISDIR(st.st_mode):
            raise Invalid("not a folder")
        if not want_dir and not stat.S_ISREG(st.st_mode):
            raise Invalid("not a file")
        real = os.path.realpath(cur)
        if not self._inside(real):
            raise Invalid("outside the picture folders")
        return real

    @staticmethod
    def _skip(name):
        return name.startswith(".") or name.strip() != name or name.lower() in SKIP or not PART.fullmatch(name)

    def browse(self, rel=""):
        """The folders in one folder (the admin's Browse…): {"path", "folders": [{name, path, pictures (right in it, up to
        999), more (it has folders of its own)}], "pictures": right in this one, "cut": more folders than listed}."""
        real = self.resolve(rel)
        rel = clean_rel(rel)
        folders, n = [], 0
        try:
            with os.scandir(real) as it:
                ents = sorted(it, key=lambda e: e.name.lower())
        except OSError:
            raise Invalid("can't be read") from None
        for e in ents:
            if self._skip(e.name):
                continue
            try:
                if e.is_symlink():
                    continue
                if e.is_dir(follow_symlinks=False):
                    if len(folders) < MAX_LIST:
                        folders.append(e.name)
                elif e.is_file(follow_symlinks=False) and os.path.splitext(e.name)[1].lower() in EXTS:
                    n += 1
            except OSError:
                continue
        out = []
        for name in folders:
            p = f"{rel}/{name}" if rel else name
            pics, more = 0, False
            try:
                with os.scandir(os.path.join(real, name)) as it:
                    for e in it:
                        if self._skip(e.name) or e.is_symlink():
                            continue
                        if e.is_dir(follow_symlinks=False):
                            more = True
                        elif pics < 999 and e.is_file(follow_symlinks=False) and os.path.splitext(e.name)[1].lower() in EXTS:
                            pics += 1
            except OSError:
                pass
            out.append({"name": name, "path": p, "pictures": pics, "more": more})
        return {"path": rel, "folders": out, "pictures": n, "cut": len(folders) >= MAX_LIST}

    # ---- the sources ------------------------------------------------------------------------------------------
    def sources(self):
        try:
            v = json.loads(self.conf.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []
        out = []
        for s in v.get("sources") or [] if isinstance(v, dict) else []:
            try:
                if isinstance(s, dict) and isinstance(s.get("id"), str) and SRC_ID.fullmatch(s["id"]) and isinstance(s.get("name"), str):
                    out.append({"id": s["id"], "name": s["name"][:60], "path": clean_rel(s.get("path"))})
            except Invalid:
                continue
        return out[:MAX_SOURCES]

    def source(self, sid):
        return next((s for s in self.sources() if s["id"] == sid), None) if isinstance(sid, str) else None

    def _save(self, items):
        self.conf.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.conf.with_name(f".{CONF}.{secrets.token_hex(4)}.tmp")
        tmp.write_text(json.dumps({"v": 1, "sources": items}, ensure_ascii=False, indent=1), encoding="utf-8")
        os.replace(tmp, self.conf)

    def add(self, rel, name):
        rel = clean_rel(rel)
        self.resolve(rel)   # (it must be there, inside, and not a link)
        if not isinstance(name, str):
            raise Invalid("name: text")
        # (v3.0.5) the invisible and direction characters out — of the folder's own name too
        name = _name(name) or _name(rel.rsplit("/", 1)[-1] if rel else "") or "Pictures"
        with self.lock:
            items = self.sources()
            if any(s["path"] == rel for s in items):
                raise Invalid("that folder is a source already")
            if len(items) >= MAX_SOURCES:
                raise Invalid(f"at most {MAX_SOURCES} picture folders")
            item = {"id": secrets.token_hex(6), "name": name, "path": rel}
            self._save(items + [item])
        return item

    def rename(self, sid, name):
        if not isinstance(name, str) or not _name(name):   # (v3.0.5: _name — the invisible characters out)
            raise Invalid("name: text")
        with self.lock:
            items = self.sources()
            hit = next((s for s in items if s["id"] == sid), None)
            if not hit:
                raise Invalid("no such picture folder")
            hit["name"] = _name(name)   # (v3.0.5)
            self._save(items)
        return hit

    def remove(self, sid):
        with self.lock:
            items = self.sources()
            if not any(s["id"] == sid for s in items):
                raise Invalid("no such picture folder")
            self._save([s for s in items if s["id"] != sid])
            self.scans.pop(sid, None)
        self._purge(sid)   # (v3.0.5) its resized copies go too

    def _purge(self, sid):
        """(v3.0.5) A removed source's resized copies (named "<source id>-…")."""
        try:
            with os.scandir(self.cache) as it:
                for e in it:
                    if e.name.startswith(sid + "-") and e.is_file(follow_symlinks=False):
                        try:
                            os.unlink(e.path)
                        except OSError:
                            pass
        except OSError:
            pass

    # ---- a source's pictures ----------------------------------------------------------------------------------
    @staticmethod
    def key(sid, rel, size=0, mtime=0):
        # (v3.0.5) its size and time in the key: an edited photo gets a new address, never a stale cached copy
        return hashlib.sha256(f"{sid}\0{rel}\0{size}\0{mtime}".encode("utf-8", "surrogatepass")).hexdigest()[:20]

    def _walk(self, sid, rel):
        real = self.resolve(rel)
        found = []

        def walk(path, sub, depth):
            try:
                with os.scandir(path) as it:
                    ents = sorted(it, key=lambda e: e.name.lower())
            except OSError:
                return
            dirs = []
            for e in ents:
                if len(found) >= MAX_ITEMS:
                    return
                if self._skip(e.name):
                    continue
                try:
                    if e.is_symlink():   # (never followed: not a file, not a folder)
                        continue
                    if e.is_dir(follow_symlinks=False):
                        dirs.append(e)
                        continue
                    if not e.is_file(follow_symlinks=False) or os.path.splitext(e.name)[1].lower() not in EXTS:
                        continue
                    st = e.stat(follow_symlinks=False)
                except OSError:
                    continue
                if not 0 < st.st_size <= MAX_FILE:
                    continue
                r = f"{sub}/{e.name}" if sub else e.name
                found.append((self.key(sid, r, st.st_size, int(st.st_mtime)), r, st.st_size, int(st.st_mtime)))
            if depth < MAX_DEPTH:
                for e in dirs:
                    walk(os.path.join(path, e.name), f"{sub}/{e.name}" if sub else e.name, depth + 1)

        walk(real, "", 0)
        return found

    def scan(self, sid, fresh=False):
        """(source, [(key, rel within the source, bytes, mtime)], error or None) — listed again after RESCAN s."""
        src = self.source(sid)
        if not src:
            raise Invalid("no such picture folder")
        hit = self.scans.get(sid)
        if hit and not fresh and time.monotonic() - hit[0] < RESCAN and hit[3] == src["path"]:
            return src, hit[1], hit[2]
        # (v3.0.5) one listing per source at a time: while one runs, the others get the last list (with none yet: they
        # wait for that one's)
        with self.lock:
            lk = self.walking.setdefault(sid, threading.Lock())
        if not lk.acquire(blocking=False):
            if hit and hit[3] == src["path"]:
                return src, hit[1], hit[2]
            with lk:
                pass
            hit = self.scans.get(sid)
            if hit and hit[3] == src["path"]:
                return src, hit[1], hit[2]
            lk.acquire()
        try:
            try:
                found, err = self._walk(sid, src["path"]), None
            except Invalid as e:   # (a share that's offline: the last list stays, "not reachable" said)
                found, err = (hit[1] if hit else []), str(e)
            self.scans[sid] = (time.monotonic(), found, err, src["path"])
        finally:
            lk.release()
        return src, found, err

    def items(self, sid, names=False):
        """{"id", "name", "items": [key] (or [{k, n}] with the file names, for the Manager), "count", "error"}."""
        src, found, err = self.scan(sid)
        its = [{"k": k, "n": r.rsplit("/", 1)[-1][:80]} for k, r, _, _ in found] if names else [k for k, _, _, _ in found]
        return {"id": src["id"], "name": src["name"], "items": its, "count": len(found), "error": err}

    def _open(self, real, rel):
        """(v3.0.5) The picture at `rel` (under the root; `real`: its checked real path) opened once, never through a
        link: on POSIX each part with O_NOFOLLOW from the folder before it (dir_fd), so a part swapped for a link since
        the checks doesn't open; on Windows the open file must be the very one checked (the same file id, its real path
        still inside the root). Returns the open file (binary)."""
        cloexec = getattr(os, "O_CLOEXEC", 0)
        if os.name == "posix" and hasattr(os, "O_NOFOLLOW") and hasattr(os, "O_DIRECTORY") and os.open in os.supports_dir_fd:
            parts = clean_rel(rel).split("/")
            try:
                d = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | cloexec)
            except OSError:
                raise Invalid("not found") from None
            try:
                for p in parts[:-1]:
                    nd = os.open(p, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | cloexec, dir_fd=d)
                    os.close(d)
                    d = nd
                # (O_NONBLOCK: a FIFO put there never hangs the open — it's refused below as not a file)
                fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | cloexec | getattr(os, "O_NONBLOCK", 0), dir_fd=d)
            except OSError:
                raise Invalid("not found") from None
            finally:
                os.close(d)
            return os.fdopen(fd, "rb")
        try:
            fd = os.open(real, os.O_RDONLY | getattr(os, "O_BINARY", 0) | cloexec)
        except OSError:
            raise Invalid("not found") from None
        try:
            a, b = os.fstat(fd), os.lstat(real)
            same = (a.st_ino, a.st_dev) == (b.st_ino, b.st_dev) and not stat.S_ISLNK(b.st_mode)
            if not same or not self._inside(os.path.realpath(real)):
                raise Invalid("not found")
        except (OSError, Invalid):
            os.close(fd)
            raise Invalid("not found") from None
        return os.fdopen(fd, "rb")

    def _file(self, sid, key):
        """(open file, bytes, mtime, ext, its first bytes) of a picture — re-checked now: still there, not a link, inside
        the root and the source, a picture by its content, within the caps. (v3.0.5) The size and the content are
        checked on the open file itself (fstat, sniff) and the caller reads that same file; the caller closes it."""
        if not isinstance(key, str) or not KEY.fullmatch(key):
            raise Invalid("not found")
        src, found, _ = self.scan(sid)
        hit = next((x for x in found if x[0] == key), None)
        if not hit:
            raise Invalid("not found")
        rel = f"{src['path']}/{hit[1]}" if src["path"] else hit[1]
        real = self.resolve(rel, want_dir=False)
        base = self.resolve(src["path"])
        if not (real.startswith(base.rstrip(os.sep) + os.sep)):
            raise Invalid("outside the picture folder")
        fh = self._open(real, rel)
        try:
            st = os.fstat(fh.fileno())
            if not stat.S_ISREG(st.st_mode):
                raise Invalid("not a file")
            if not 0 < st.st_size <= MAX_FILE:
                raise Invalid("too big")
            head = fh.read(256 * 1024)
            try:
                ext, w, h, _ = pictures.sniff(head)
            except pictures.Invalid:
                raise Invalid("not a picture") from None
            if EXTS.get(os.path.splitext(real)[1].lower()) != ext:   # (a .png that is really something else: not served)
                raise Invalid("not a picture")
            if w * h > MAX_PIXELS:
                raise Invalid("too big")
        except BaseException:
            fh.close()
            raise
        return fh, st.st_size, int(st.st_mtime), ext, head

    def image(self, sid, key, size="m"):
        """(bytes, mime) of a picture at size "s" | "m" | "l" (its longest side SIZES[size] px, never bigger than it
        is). Invalid when it isn't there or isn't a picture."""
        if size not in SIZES:
            raise Invalid("size")
        fh, nbytes, mtime, ext, head = self._file(sid, key)
        with fh:
            if not reencode.available():   # (no Pillow: the original, when it's small enough)
                if nbytes > RAW_MAX:
                    raise Invalid("too big without Pillow")
                body = head + fh.read(RAW_MAX + 1 - len(head))
                if len(body) > RAW_MAX:
                    raise Invalid("too big without Pillow")
                return body, pictures.MIME[ext]
            # (v3.0.5) "<source id>-…": a removed source's copies go with it (_purge)
            tag = hashlib.sha256(f"{sid}\0{key}\0{nbytes}\0{mtime}\0{size}".encode("utf-8", "surrogatepass")).hexdigest()[:32]
            for e2, mime in (("jpg", "image/jpeg"), ("webp", "image/webp")):
                f = self.cache / f"{sid}-{tag}.{e2}"
                try:
                    body = f.read_bytes()
                except OSError:
                    continue
                try:
                    os.utime(f)   # (v3.0.5: used now — the pruning goes by the least recently used)
                except OSError:
                    pass
                return body, mime
            data = head + fh.read(MAX_FILE + 1 - len(head))   # (the same open file the checks ran on)
        if len(data) > MAX_FILE:
            raise Invalid("too big")
        with self.draw:
            try:   # (v3.0.5: the bytes on stdin — the child never opens a path)
                r = subprocess.run([sys.executable, "-I", "-c", _CHILD, str(SIZES[size]), ext, str(MAX_PIXELS)],
                                   input=data, capture_output=True, timeout=TIMEOUT)
            except subprocess.TimeoutExpired:
                raise Invalid("took too long") from None
        if r.returncode != 0 or b"\n" not in r.stdout[:6]:
            raise Invalid("can't be read")
        kind, body = r.stdout.split(b"\n", 1)
        kind = "webp" if kind == b"webp" else "jpg"
        try:
            self.cache.mkdir(parents=True, exist_ok=True)
            tmp = self.cache / f".{tag}.{secrets.token_hex(3)}.tmp"
            tmp.write_bytes(body)
            os.replace(tmp, self.cache / f"{sid}-{tag}.{kind}")
            self._prune()
        except OSError:
            pass
        return body, "image/webp" if kind == "webp" else "image/jpeg"

    def _prune(self, force=False):
        """(v3.0.5) Now and then (or `force`): the least recently used copies go once there are more than MAX_CACHE or
        they take more than MAX_CACHE_BYTES; a half-written copy (.tmp) older than TIMEOUT goes too."""
        if not force and secrets.randbelow(20):
            return
        now, files, total = time.time(), [], 0
        try:
            with os.scandir(self.cache) as it:
                for e in it:
                    try:
                        if not e.is_file(follow_symlinks=False):
                            continue
                        st = e.stat(follow_symlinks=False)
                        if e.name.endswith(".tmp"):
                            if now - st.st_mtime > TIMEOUT:
                                os.unlink(e.path)
                        elif e.name.endswith((".jpg", ".webp")):
                            files.append((st.st_mtime, st.st_size, e.path))
                            total += st.st_size
                    except OSError:
                        continue
        except OSError:
            return
        files.sort()   # (the least recently used first: a hit touches its copy)
        n = len(files)
        for _, size, path in files:
            if n <= MAX_CACHE and total <= MAX_CACHE_BYTES:
                break
            try:
                os.unlink(path)
            except OSError:
                pass
            n, total = n - 1, total - size

    def info(self):
        """For the Manager: {enabled, root (the container path set — "" when off), sources: [{id, name, path, count,
        error}]} (count: the last listing's, without listing again)."""
        out = []
        for s in self.sources() if self.enabled else []:
            hit = self.scans.get(s["id"])
            out.append({**s, "count": len(hit[1]) if hit else None, "error": hit[2] if hit else None})
        return {"enabled": self.enabled, "root": self.shown_root, "sources": out, "max": MAX_SOURCES}
