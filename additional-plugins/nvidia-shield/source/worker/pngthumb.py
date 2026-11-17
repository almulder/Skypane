"""A small PNG thumbnail in plain Python (Skypane's compiled build has no image library).

thumb(png_bytes, size) -> a size x size PNG with the picture fitted in the middle (aspect kept), or None for a PNG it doesn't read.
Reads 8-bit greyscale / RGB / palette / grey+alpha / RGBA (palette also at 1, 2 or 4 bits), not interlaced.
The picture is shrunk by averaging each block of pixels (alpha-weighted), then written as 8-bit RGBA.
"""
import struct
import zlib

SIG = b"\x89PNG\r\n\x1a\n"
CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}


def _chunks(data):
    i = 8
    while i + 8 <= len(data):
        n, kind = struct.unpack(">I4s", data[i:i + 8])
        yield kind, data[i + 8:i + 8 + n]
        i += 12 + n


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else b if pb <= pc else c


def _rows(raw, w, h, bpp, stride):
    """Unfiltered scanlines (bytes)."""
    out, prev, i = [], bytearray(stride), 0
    for _ in range(h):
        f = raw[i]
        line = bytearray(raw[i + 1:i + 1 + stride])
        i += 1 + stride
        if f == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                line[x] = (line[x] + ((line[x - bpp] if x >= bpp else 0) + prev[x]) // 2) & 255
        elif f == 4:
            for x in range(stride):
                line[x] = (line[x] + _paeth(line[x - bpp] if x >= bpp else 0, prev[x], prev[x - bpp] if x >= bpp else 0)) & 255
        elif f != 0:
            raise ValueError("filter")
        out.append(line)
        prev = line
    return out


def decode(data):
    """(w, h, [rows of (r, g, b, a) tuples]) or None."""
    if not data.startswith(SIG):
        return None
    ihdr, plte, trns, idat = None, b"", b"", []
    for kind, body in _chunks(data):
        if kind == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body[:13])
        elif kind == b"PLTE":
            plte = body
        elif kind == b"tRNS":
            trns = body
        elif kind == b"IDAT":
            idat.append(body)
    if not ihdr:
        return None
    w, h, depth, ctype, _, _, interlace = ihdr
    if interlace or ctype not in CHANNELS or not (depth == 8 or (ctype == 3 and depth in (1, 2, 4))) or w * h > 4_000_000:
        return None
    ch = CHANNELS[ctype]
    stride = (w * ch * depth + 7) // 8
    rows = _rows(zlib.decompress(b"".join(idat)), w, h, max(1, ch * depth // 8), stride)
    pal = [tuple(plte[i:i + 3]) + (trns[i // 3] if i // 3 < len(trns) else 255,) for i in range(0, len(plte) - 2, 3)]
    out = []
    for line in rows:
        if ctype == 3:
            if depth < 8:
                per, mask = 8 // depth, (1 << depth) - 1
                idx = [(line[x // per] >> (8 - depth * (x % per + 1))) & mask for x in range(w)]
            else:
                idx = line[:w]
            out.append([pal[k] if k < len(pal) else (0, 0, 0, 0) for k in idx])
        elif ctype == 0:
            out.append([(v, v, v, 255) for v in line[:w]])
        elif ctype == 4:
            out.append([(line[2 * x], line[2 * x], line[2 * x], line[2 * x + 1]) for x in range(w)])
        elif ctype == 2:
            out.append([(line[3 * x], line[3 * x + 1], line[3 * x + 2], 255) for x in range(w)])
        else:
            out.append([tuple(line[4 * x:4 * x + 4]) for x in range(w)])
    return w, h, out


def encode(w, h, rows):
    raw = b"".join(b"\x00" + bytes(v for px in r for v in px) for r in rows)

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
    return SIG + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def thumb(data, size=40):
    try:
        got = decode(data)
    except (ValueError, zlib.error, struct.error, IndexError):
        return None
    if not got:
        return None
    w, h, px = got
    k = max(max(w, h) / float(size), 1e-9)
    tw, th = max(1, min(size, round(w / k))), max(1, min(size, round(h / k)))
    out = []
    for ty in range(th):
        y0, y1 = int(ty * h / th), max(int(ty * h / th) + 1, int((ty + 1) * h / th))
        row = []
        for tx in range(tw):
            x0, x1 = int(tx * w / tw), max(int(tx * w / tw) + 1, int((tx + 1) * w / tw))
            r = g = b = a = n = 0
            for y in range(y0, y1):
                line = px[y]
                for x in range(x0, x1):
                    pr, pg, pb, pa = line[x]
                    r += pr * pa
                    g += pg * pa
                    b += pb * pa
                    a += pa
                    n += 1
            row.append((r // a, g // a, b // a, a // n) if a else (0, 0, 0, 0))
        out.append(row)
    # every thumbnail the same size: size x size, the picture centred, the rest see-through
    clear = (0, 0, 0, 0)
    left, top = (size - tw) // 2, (size - th) // 2
    full = [[clear] * size for _ in range(top)]
    full += [[clear] * left + r + [clear] * (size - tw - left) for r in out]
    full += [[clear] * size for _ in range(size - th - top)]
    return encode(size, size, full)
