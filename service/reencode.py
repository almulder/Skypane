"""Every uploaded picture is drawn again by the server before it's kept (release 2, security first — research:
the research notes): the panels only ever get pixels Pillow wrote itself, so a crafted file aimed at a
tablet's picture decoder, hidden data after the image, or a photo's EXIF (where it was taken…) never reaches them.

The decoding runs in a child process with limits (memory, CPU time, a timeout): a picture made to blow up a decoder
can only take that child down, never the service. Without Pillow (a laptop test run) the bytes are kept as they are.
"""
import subprocess
import sys

TIMEOUT = 20

# the child: reads the picture on stdin, writes the new one on stdout ("ext\n" + bytes); exit 2 = not a picture
_CHILD = r"""
import io, sys
try:
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (768 << 20, 768 << 20))
    resource.setrlimit(resource.RLIMIT_CPU, (15, 15))
except Exception:
    pass
from PIL import Image, ImageOps, ImageSequence
Image.MAX_IMAGE_PIXELS = 2600 * 2600
raw = sys.stdin.buffer.read()
ext, animated = sys.argv[1], sys.argv[2] == "1"
limit = int(sys.argv[3]) if len(sys.argv) > 3 else 0
def lossy(save):
    # JPEG / WebP: quality 90, stepped down until it fits the style's limit (a noisy photo can grow when drawn again)
    for q in (90, 84, 78, 72, 66, 60):
        buf = io.BytesIO()
        save(buf, q)
        if not limit or buf.tell() <= limit:
            break
    return buf
try:
    fmt = {"png": "PNG", "jpg": "JPEG", "webp": "WEBP", "gif": "GIF"}[ext]
    im = Image.open(io.BytesIO(raw), formats=[fmt])
    im.load()
    out = io.BytesIO()
    if animated and getattr(im, "n_frames", 1) > 1:
        frames, durations = [], []
        for i, f in enumerate(ImageSequence.Iterator(im)):
            if i >= 600:
                break
            durations.append(f.info.get("duration", 100) or 100)
            g = f.convert("RGBA") if fmt != "GIF" else f.copy()
            g.info = {k: v for k, v in g.info.items() if k in ("transparency", "background")}   # (no comments / profiles)
            frames.append(g)
        kw = {"save_all": True, "append_images": frames[1:], "duration": durations, "loop": im.info.get("loop", 0)}
        if fmt == "WEBP":
            kw.update(quality=88, method=4)
        if fmt == "GIF":
            kw.update(disposal=2)
        frames[0].save(out, fmt, **kw)
    else:
        # a phone photo turned by its EXIF Orientation: turned for real first (the EXIF itself goes below)
        turned = ImageOps.exif_transpose(im)
        if turned is not None:
            im = turned
        # only pixels: comments, colour profiles and other metadata stay behind
        im.info = {k: v for k, v in im.info.items() if k in ("transparency",)}
        if fmt == "JPEG":
            rgb = im.convert("RGB")
            out = lossy(lambda b, q: rgb.save(b, "JPEG", quality=q, optimize=True))
        elif fmt == "WEBP":
            im = im.convert("RGBA") if im.mode in ("P", "LA", "PA") or "transparency" in im.info else im
            out = lossy(lambda b, q: im.save(b, "WEBP", quality=q, method=4))
        elif fmt == "GIF":
            im.save(out, "GIF")
        else:
            if im.mode not in ("RGB", "RGBA", "L", "LA", "P"):
                im = im.convert("RGBA")
            im.save(out, "PNG", optimize=True)
except Exception as e:
    sys.stderr.write(type(e).__name__)
    sys.exit(2)
sys.stdout.buffer.write(out.getvalue())
"""


class Invalid(ValueError):
    pass


def available():
    try:
        import PIL  # noqa: F401
        return True
    except ImportError:
        return False


def reencode(raw, ext, animated, max_bytes=0):
    """The picture drawn again in its own format (turned upright by its EXIF Orientation, then EXIF and anything after
    the image gone; JPEG / WebP stepped down in quality to fit max_bytes when given); Invalid when it can't be read.
    Without Pillow: the bytes unchanged."""
    if not available():
        return raw
    try:
        r = subprocess.run([sys.executable, "-I", "-c", _CHILD, ext, "1" if animated else "0", str(int(max_bytes or 0))], input=raw,
                           capture_output=True, timeout=TIMEOUT)
    except subprocess.TimeoutExpired:
        raise Invalid("the picture took too long to read") from None
    if r.returncode != 0 or not r.stdout:
        raise Invalid("the picture can't be read (damaged, or not really a picture)")
    return r.stdout
