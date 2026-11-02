"""The owner's own pictures for devices (stage 4b): uploaded on the Manager page, shown on the panels.

  DATA_DIR/pictures/<id>.<ext>      the files (PNG / JPEG / WebP / GIF — recognised by their content, never SVG:
                                    an SVG can carry script)
  DATA_DIR/pictures/index.json      [{id, name, style, types, w, h, bytes, ext, animated, added, by}]
                                    (by: the Manager login that uploaded it — an upload-only login changes only its own)

Each has a style (how it's drawn: an icon in a row / orb, or a big appliance card picture, still or animated) and the
device types it fits (fans, lights, washer…) — the picker on the Manager asks for the type first. A device's picture
is "up:<id>" in house/device-settings.json (service/house_devices.py); the panels load /pictures/<id>.
"""
import base64
import json
import os
import pathlib
import re
import secrets
import struct
import threading
import time

try:
    from service import reencode
except ImportError:  # pragma: no cover  (run from inside service/)
    import reencode

STYLES = {   # style: (label, min side, max side, max bytes, recommended, may be animated)
    "icon": ("Icons", 48, 512, 300_000, "128 × 128 px, PNG or WebP with a transparent background", False),
    "anim-icon": ("Animated icons", 48, 512, 600_000, "128 × 128 px, an animated GIF or WebP (or APNG)", True),
    "appliance": ("Appliances", 128, 1024, 700_000, "256 × 256 px (square), PNG or WebP", False),
    "anim-appliance": ("Animated appliances", 128, 1024, 700_000, "256 × 256 px (square), an animated GIF or WebP", True),
    # a whole-screen picture behind the cards (the Manager makes it a WebP of at most 2560 px first, which also drops the
    # photo's hidden data — where it was taken…); a transparent sky lets the panel's animated sky show through
    "background": ("Backgrounds", 640, 2560, 740_000, "your panel's screen size (e.g. 1920 × 1080); a PNG / WebP with a transparent sky shows the animated sky", False),
}

TYPES = ["light", "fan", "outlet", "switch", "shade", "valve", "garage", "purifier", "air", "washer", "dryer", "dishwasher",
         "fridge", "oven", "microwave", "speaker", "tv", "vacuum", "sensor", "door", "window", "lock", "camera", "other"]
MIME = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp", "gif": "image/gif"}
ID_RE = re.compile(r"[0-9a-f]{16}")
MAX_PICTURES = 300


class Invalid(ValueError):
    pass


def _gif_frames(b):
    """How many images a GIF holds (walks its blocks — the same bytes inside the picture data don't count)."""
    i = 13
    if b[10] & 0x80:   # global colour table
        i += 3 * (2 << (b[10] & 7))
    frames = 0
    while i < len(b) and frames < 2:
        block = b[i]
        if block == 0x3B:      # trailer
            break
        if block == 0x21:      # extension: label, then sub-blocks
            i += 2
        elif block == 0x2C:    # image: descriptor, local colour table, LZW size, sub-blocks
            frames += 1
            flags = b[i + 9]
            i += 10 + (3 * (2 << (flags & 7)) if flags & 0x80 else 0) + 1
        else:
            break
        while i < len(b) and b[i]:   # sub-blocks until the empty one
            i += 1 + b[i]
        i += 1
    return frames


def sniff(b):
    """(ext, width, height, animated) from the file's bytes; Invalid when it isn't a PNG / JPEG / WebP / GIF."""
    try:
        if b[:8] == b"\x89PNG\r\n\x1a\n" and b[12:16] == b"IHDR":
            w, h = struct.unpack(">II", b[16:24])
            return "png", w, h, b.find(b"acTL", 0, b.find(b"IDAT")) > 0
        if b[:6] in (b"GIF87a", b"GIF89a"):
            w, h = struct.unpack("<HH", b[6:10])
            return "gif", w, h, _gif_frames(b) > 1
        if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
            kind = b[12:16]
            if kind == b"VP8X":
                flags = b[20]
                w = 1 + int.from_bytes(b[24:27], "little")
                h = 1 + int.from_bytes(b[27:30], "little")
                return "webp", w, h, bool(flags & 0x02)
            if kind == b"VP8L":
                bits = int.from_bytes(b[21:25], "little")
                return "webp", (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1, False
            if kind == b"VP8 ":
                w, h = struct.unpack("<HH", b[26:30])
                return "webp", w & 0x3FFF, h & 0x3FFF, False
        if b[:2] == b"\xff\xd8":
            i = 2
            while i + 9 < len(b):
                if b[i] != 0xFF:
                    i += 1
                    continue
                marker = b[i + 1]
                if marker == 0xFF:   # padding before a marker
                    i += 1
                    continue
                if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                    h, w = struct.unpack(">HH", b[i + 5:i + 9])
                    return "jpg", w, h, False
                if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                    i += 2
                    continue
                i += 2 + struct.unpack(">H", b[i + 2:i + 4])[0]
    except (struct.error, IndexError):
        pass
    raise Invalid("not a PNG, JPEG, WebP or GIF picture")


class Library:
    def __init__(self, data_dir):
        self.dir = pathlib.Path(data_dir) / "pictures"
        self.lock = threading.Lock()

    def _index(self):
        try:
            v = json.loads((self.dir / "index.json").read_text(encoding="utf-8"))
            return [p for p in v if isinstance(p, dict) and isinstance(p.get("id"), str) and ID_RE.fullmatch(p["id"])
                    and p.get("ext") in MIME] if isinstance(v, list) else []   # (ext checked: it becomes part of a path)
        except (OSError, ValueError):
            return []

    def _save(self, items):
        self.dir.mkdir(parents=True, exist_ok=True)
        tmp = self.dir / f".index.{secrets.token_hex(4)}.tmp"
        tmp.write_text(json.dumps(items, indent=1), encoding="utf-8")
        os.replace(tmp, self.dir / "index.json")

    def all(self):
        return self._index()

    def detailed(self):
        """Every upload with its size and dimensions (v2.6.0, the List views): uploads from before the index kept
        them (or a file changed meanwhile) are measured from the file now — and written back once; a file that can't be
        read says so ("missing": true) instead of failing the list."""
        with self.lock:
            items, changed = self._index(), False
            for p in items:
                f = self.dir / f"{p['id']}.{p['ext']}"
                try:
                    size = f.stat().st_size
                except OSError:
                    p["missing"] = True
                    continue
                p.pop("missing", None)
                if p.get("bytes") == size and (p.get("unmeasured") or (isinstance(p.get("w"), int) and isinstance(p.get("h"), int))):
                    continue
                try:   # (only the file's start: the size is in its header)
                    with open(f, "rb") as fh:
                        _, w, h, _ = sniff(fh.read(256 * 1024))
                    p.update(w=w, h=h, bytes=size)
                    p.pop("unmeasured", None)
                except (OSError, Invalid):   # (measured once: not read again on every list while it stays the same)
                    p.update(bytes=size, unmeasured=True)
                changed = True
            if changed:
                self._save([{k: v for k, v in p.items() if k != "missing"} for p in items])
            return items

    def get(self, pid):
        return next((p for p in self._index() if p["id"] == pid), None) if isinstance(pid, str) else None

    def file(self, pid):
        """(path, mime) of a picture, or None."""
        p = self.get(pid)
        if not p or p.get("ext") not in MIME:
            return None
        f = self.dir / f"{p['id']}.{p['ext']}"
        return (f, MIME[p["ext"]]) if f.is_file() else None

    @staticmethod
    def _clean(name, style, types):
        try:
            from service.house_model import safe_text
        except ImportError:  # pragma: no cover  (run from inside service/)
            from house_model import safe_text
        if style not in STYLES:
            raise Invalid("style: " + ", ".join(STYLES))
        if not isinstance(types, list) or not types or len(types) > len(TYPES) or any(t not in TYPES for t in types):
            raise Invalid("pick at least one device type it fits")
        if not isinstance(name, str):
            raise Invalid("name: text")
        return safe_text(name, 40) or "Picture", style, sorted(set(types), key=TYPES.index)

    def add(self, name, style, types, data_b64, by=None):
        name, style, types = self._clean(name, style, types)
        if not isinstance(data_b64, str) or len(data_b64) > 1_000_000:   # (base64 of up to 750 KB; each style has its own limit too)
            raise Invalid("the picture is too big (max 740 KB)")
        try:
            raw = base64.b64decode(data_b64, validate=True)
        except ValueError:
            raise Invalid("not a picture file") from None
        label, lo, hi, max_bytes, rec, may_move = STYLES[style]
        if len(raw) > max_bytes:
            raise Invalid(f"too big for {label.lower()}: max {max_bytes // 1000} KB")
        ext, w, h, animated = sniff(raw)
        if not (lo <= w <= hi and lo <= h <= hi):
            raise Invalid(f"{w} × {h} px — {label.lower()} need {lo} to {hi} px a side (best: {rec})")
        if animated and not may_move:
            raise Invalid(f"that picture moves — use the animated style for it")
        # drawn again by the server (service/reencode.py): only pixels Pillow wrote reach the panels
        try:
            raw = reencode.reencode(raw, ext, animated, max_bytes)
        except reencode.Invalid as e:
            raise Invalid(str(e)) from None
        ext, w, h, animated = sniff(raw)   # (measured again: a turned photo swaps width and height)
        if len(raw) > max_bytes * 3 // 2:   # (drawn again it may grow a little; never far past the style's limit)
            raise Invalid(f"too big for {label.lower()} once checked: save it smaller (max {max_bytes // 1000} KB)")
        with self.lock:
            items = self._index()
            if len(items) >= MAX_PICTURES:
                raise Invalid(f"at most {MAX_PICTURES} pictures — delete some first")
            pid = secrets.token_hex(8)
            self.dir.mkdir(parents=True, exist_ok=True)
            tmp = self.dir / f".{pid}.tmp"
            tmp.write_bytes(raw)
            os.replace(tmp, self.dir / f"{pid}.{ext}")
            item = {"id": pid, "name": name, "style": style, "types": types, "w": w, "h": h, "bytes": len(raw),
                    "ext": ext, "animated": animated, "added": int(time.time()), **({"by": by} if by else {})}
            items.append(item)
            self._save(items)
        return item

    def edit(self, pid, name=None, types=None):
        with self.lock:
            items = self._index()
            p = next((x for x in items if x["id"] == pid), None)
            if not p:
                raise Invalid("no such picture")
            n, _, t = self._clean(p["name"] if name is None else name, p["style"], p["types"] if types is None else types)
            p.update(name=n, types=t)
            self._save(items)
            return p

    def delete(self, pid):
        with self.lock:
            items = self._index()
            p = next((x for x in items if x["id"] == pid), None)
            if not p:
                raise Invalid("no such picture")
            self._save([x for x in items if x["id"] != pid])
            try:
                (self.dir / f"{pid}.{p['ext']}").unlink()
            except OSError:
                pass

    def rename_owner(self, old, new):
        """A Manager login got a new name: its uploads stay its own."""
        if not (isinstance(old, str) and isinstance(new, str)):
            return
        with self.lock:
            items = self._index()
            hit = [x for x in items if isinstance(x.get("by"), str) and x["by"].lower() == old.lower()]
            for x in hit:
                x["by"] = new
            if hit:
                self._save(items)

    def info(self):
        return {"styles": {k: {"label": v[0], "min": v[1], "max": v[2], "maxBytes": v[3], "recommended": v[4], "animated": v[5]}
                           for k, v in STYLES.items()}, "types": TYPES}
