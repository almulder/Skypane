"""narwal_core: the Narwal robot's local protocol, model, map and commands (the plugin's copy of
skypane-narwal/service/narwal.py, without its file queue and reader: the plugin's worker/main.py runs the visits).
Standard library only (modules Skypane ships)."""
import base64
import json
import math
import os
import pathlib
import socket
import struct
import sys
import threading
import time
import zlib

import re as _re


class vlist:   # (the plugin keeps its robots in the plugin's settings; only the id formats are needed here)
    KEY = _re.compile(r"[0-9A-Za-z]{6,16}")
    DEVICE = _re.compile(r"[0-9a-f]{16,40}")
    ID = _re.compile(r"[0-9a-f]{8}")

PORT = 9002
STATUS = "vacuums-status.json"
MAP = "vacuums-map-{}.json"
CMDS, RESULTS = "vacuum-cmds", "vacuum-results"
POLL_IDLE = 60          # s between status visits while docked / idle
POLL_ACTIVE = 15        # s while it's out on a job
MAP_EVERY = 30 * 60     # s: fetch the map again while it sits on the dock (room edits in the Narwal app keep the same
                        #    map id, so the id alone can't tell us); also right after every job and on "refreshMap"
MAP_EVERY_BUSY = 6 * 3600   # s: during a job, only this often (visits stay short)
RETRY = (30, 60, 120, 300)
CMD_MAX_AGE = 30        # s: a queued command older than this is dropped (the panel has given up)

# Product keys seen on robots with local control first (any key works for a first "who are you" message).
# Narwal product keys (one per model / firmware family). A robot answers only messages addressed with its own key AND
# its device id, so with a known id the key is found by asking under all of them at once. Sources: a live Flow on
# fw v01.09.07.06 (7a6PKfDdqz) and the MIT-licensed sytchi/NarwalIntegration list (from the app's own files).
KNOWN_KEYS = ["7a6PKfDdqz", "QoEsI5qYXO", "QxMSPG6VSO", "DrzDKQ0MU8", "CNbforyZWI", "BYWBPqSxeC", "LnugwMG9ss", "5OMbqk58Sc",
              "tPQJmoIbEC", "HgArZ7KuJL", "Uuug39n0fD", "E9Q8aDzUbp", "jI5rHi4mKa", "UuTSLsMce4", "qV6BujoYLz", "88OLXLpkjT",
              "3rIGshGNAj", "7sSZZ4XfTI", "OlkUn3oUCu", "mvlduyye85", "pcbfh2ldvx", "EHf6cRNRGT", "6NjIDYxBXb", "hEA7OEshlx",
              "cUlfJN5JYP"]


def log(msg):
    print(msg, flush=True)


# ---------------------------------------------------------------- a minimal WebSocket client, stdlib only
class WS:
    def __init__(self, host, port=PORT, timeout=5.0):
        self.sock = socket.create_connection((host, port), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET / HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                           f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("closed during handshake")
            buf += chunk
        head, _, self.buf = buf.partition(b"\r\n\r\n")
        if b" 101 " not in head.split(b"\r\n")[0]:
            raise ConnectionError("not a WebSocket")

    def send(self, payload):
        mask, n = os.urandom(4), len(payload)
        hdr = (struct.pack(">BB", 0x82, 0x80 | n) if n < 126 else
               struct.pack(">BBH", 0x82, 0x80 | 126, n) if n < 65536 else struct.pack(">BBQ", 0x82, 0x80 | 127, n))
        self.sock.sendall(hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))

    def frames(self, wait):
        out = []
        self.sock.settimeout(max(wait, 0.05))
        try:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("robot closed the connection")
            self.buf += chunk
        except socket.timeout:
            pass
        while len(self.buf) >= 2:
            b0, b1 = self.buf[0], self.buf[1]
            ln, off = b1 & 0x7F, 2
            if ln == 126:
                if len(self.buf) < 4:
                    break
                ln, off = struct.unpack(">H", self.buf[2:4])[0], 4
            elif ln == 127:
                if len(self.buf) < 10:
                    break
                ln, off = struct.unpack(">Q", self.buf[2:10])[0], 10
            if b1 & 0x80:
                off += 4
            if len(self.buf) < off + ln:
                break
            payload, self.buf = self.buf[off:off + ln], self.buf[off + ln:]
            if b0 & 0x0F in (1, 2):
                out.append(payload)
            elif b0 & 0x0F == 9:
                mask = os.urandom(4)
                self.sock.sendall(struct.pack(">BB", 0x8A, 0x80 | len(payload)) + mask +
                                  bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))
        return out

    def close(self):
        try:
            self.sock.sendall(struct.pack(">BB", 0x88, 0x80) + os.urandom(4))
        except OSError:
            pass
        self.sock.close()


# ---------------------------------------------------------------- frames and protobuf
def parse_frame(data):
    """-> (topic, payload, is_response) or None. Responses (tag 0x2A) come back with an empty topic."""
    if len(data) < 4 or data[0] != 0x01 or data[2] not in (0x22, 0x2A):
        return None
    tl = data[3]
    return data[4:4 + tl].decode("utf-8", "replace"), data[4 + tl:], data[2] == 0x2A


def build_frame(topic, payload=b""):
    t = topic.encode()
    return bytes([0x01, (len(t) + 2) & 0xFF, 0x22, len(t)]) + t + payload


def short_topic(topic):
    parts = topic.split("/")
    return "/".join(parts[3:]) if len(parts) >= 4 else topic


def varint(b, i):
    shift = result = 0
    while True:
        if i >= len(b):
            raise ValueError("truncated varint")
        c = b[i]
        i += 1
        result |= (c & 0x7F) << shift
        if not c & 0x80:
            return result, i
        shift += 7
        if shift > 63:
            raise ValueError("varint too long")


def enc_varint(v):
    out = bytearray()
    while True:
        b, v = v & 0x7F, v >> 7
        out.append(b | (0x80 if v else 0))
        if not v:
            return bytes(out)


def pb_int(n, v):
    return enc_varint(n << 3) + enc_varint(v)


def pb_msg(n, body):
    return enc_varint((n << 3) | 2) + enc_varint(len(body)) + body


def fields(b):
    """(field, wire type, value) at one level; nested bytes stay raw."""
    i = 0
    while i < len(b):
        key, i = varint(b, i)
        f, wt = key >> 3, key & 7
        if f == 0:
            raise ValueError("field 0")
        if wt == 0:
            v, i = varint(b, i)
        elif wt == 1:
            if i + 8 > len(b):
                raise ValueError("truncated")
            v, i = struct.unpack("<Q", b[i:i + 8])[0], i + 8
        elif wt == 5:
            if i + 4 > len(b):
                raise ValueError("truncated")
            v, i = struct.unpack("<I", b[i:i + 4])[0], i + 4
        elif wt == 2:
            ln, i = varint(b, i)
            if i + ln > len(b):
                raise ValueError("truncated")
            v, i = b[i:i + ln], i + ln
        else:
            raise ValueError("wire type")
        yield f, wt, v


def get(b, f, default=None):
    if not isinstance(b, (bytes, bytearray)):
        return default
    try:
        for ff, _, v in fields(b):
            if ff == f:
                return v
    except ValueError:
        pass
    return default


def get_all(b, f):
    if not isinstance(b, (bytes, bytearray)):
        return []
    try:
        return [v for ff, _, v in fields(b) if ff == f]
    except ValueError:
        return []


def f32(v):
    return struct.unpack("<f", struct.pack("<I", v & 0xFFFFFFFF))[0] if isinstance(v, int) else None


def signed(v):
    return v - (1 << 64) if isinstance(v, int) and v >= 1 << 63 else v


def text(v):
    return v.decode("utf-8", "replace") if isinstance(v, (bytes, bytearray)) else ""


def ints(b):
    """A message's plain number fields {field: value} (nested messages left out)."""
    try:
        return {f: v for f, wt, v in fields(b) if wt == 0} if isinstance(b, (bytes, bytearray)) else {}
    except ValueError:
        return {}


# ---------------------------------------------------------------- what the robot says → the panel-safe model
WORKING = {1: "standby", 2: "docked", 3: "job", 4: "cleaning", 5: "cleaning", 10: "docked", 14: "docked", 19: "returning"}

# Fault codes seen live, in the panel's strings (dashboard/.../strings/en.js "vac.fault.<code>"); others show the level.
KNOWN_FAULTS = ("0x01010072", "0x02310027")
TRANSIENT_FAULTS = ("0x01010072",)   # station water tank refilling (plumbed docks): clears by itself, not an alert

# Observed on a Flow, fw v01.09.07.06, one full mop job (status code field 3.1 stays 3 for the whole job):
#   off dock (f11=1 and f47=2)  3.5=7 or 9            mopping                       -> "cleaning"
#                               3.2=1                 paused (fault may say why)    -> "paused" / "error"
#                               3.5=2, 3.13=1/2       back to wash the mop          -> "returning" (reason "mop")
#                               3.5=1, 3.10=1/2       job over, going home          -> "returning" (reason "done")
#   on dock                     3.5=4 or 12           washing / wetting the mop     -> "washing"
#   3.1=14 (+ mop-drying flag)                        job done                      -> "docked"
STATES = ("cleaning", "paused", "error", "returning", "washing", "docked", "idle", "unknown")


def fault_of(base):
    """base status → {code, level, returnsToBase} or None. Two channels: 48.1.*.2 = {1 severity, 2 code, 3 text},
    field 1 = {1 code, 2 severity, 3 text}. The robot's own text is Chinese; only its level / return flag are kept."""
    err = None
    f48 = get(base, 48)
    for e in get_all(f48, 1):
        e2 = get(e, 2)
        if isinstance(e2, bytes) and e2:
            err = (get(e2, 2, 0), get(e2, 1, 0), text(get(e2, 3)))
            break
    if err is None:
        f1 = get(base, 1)
        if isinstance(f1, bytes) and f1:
            err = (get(f1, 1, 0), get(f1, 2, 0), text(get(f1, 3)))
    if err is None:
        return None
    code, sev, msg = err
    level = "warning" if "Warn" in msg or sev == 1 else ("pause" if not code and not msg else "error")
    return {"code": "0x%08X" % (code or 0), "level": level, "returnsToBase": "自动召回基站:是" in msg}


def station_flags(base):
    flags = {"dust": False, "mopDrying": False}
    for e in get_all(get(base, 48), 1):
        if isinstance(e, bytes):
            fl = {f for f, _, _ in fields(e)} if e else set()
            flags["dust"] = flags["dust"] or 10 in fl
            flags["mopDrying"] = flags["mopDrying"] or 15 in fl
    return flags


def activity(base):
    """(state, reason) from a base status message."""
    f3 = ints(get(base, 3, b""))
    ws = f3.get(1)
    off_dock = get(base, 11) == 1 and get(base, 47) == 2
    fault = fault_of(base)
    paused = bool(f3.get(2))
    if fault and fault["level"] == "error":
        return "error", ""
    if ws in (4, 5, 3, 2, 10, 14, 1) and off_dock:
        if paused:
            return "paused", ""
        if f3.get(5) == 2 and f3.get(13) in (1, 2):
            return "returning", "mop"
        if f3.get(5) == 1 and f3.get(10) in (1, 2):
            return "returning", "done"
        if ws in (1,):
            return "idle", ""
        return "cleaning", ""
    if ws == 19:
        return "returning", "done"
    if ws == 3:
        return "washing", ""
    if ws in (2, 10, 14):
        return "docked", ""
    if ws == 1:
        return "docked", ""
    return "unknown", ""


def base_model(base):
    """The panel-safe part of a base status."""
    bat = f32(get(base, 2))
    st, why = activity(base)
    fault = fault_of(base)
    if fault and fault["code"] in TRANSIENT_FAULTS:
        fault["transient"] = True
    return {"state": st, "reason": why, "battery": round(bat) if bat is not None and 0 <= bat <= 100.5 else None,
            "onDock": not (get(base, 11) == 1 and get(base, 47) == 2), "fault": fault, "station": station_flags(base),
            "dustBag": get(base, 41)}


def work_model(work):
    """working_status: area cleaned (m², field 2 float) and elapsed seconds (field 3). Field 1 is NOT a reliable
    percent on newer firmware (it sat at 98 for a whole job), so it isn't used."""
    a = f32(get(work, 2))
    return {"areaM2": round(a, 1) if a is not None and 0 <= a < 10000 else None, "elapsed": get(work, 3)}


def position(dmap, mp):
    """display_map field 1 = {1: {1: x, 2: y}, 2: heading rad}; same frame as the map's dock, so map cell = raw - origin
    (checked live: display_map's dock (field 5) equals get_map's dock (field 8) exactly)."""
    f1 = get(dmap, 1, b"")
    pos = get(f1, 1, b"")
    x, y = f32(get(pos, 1)), f32(get(pos, 2))
    if x is None or y is None or not (math.isfinite(x) and math.isfinite(y)) or (x == 0 and y == 0) or not mp:
        return None
    h = f32(get(f1, 2))
    gx, gy = x - mp["originX"], y - mp["originY"]
    return {"x": round(gx, 1), "y": round(gy, 1), "heading": round(math.degrees(h)) if h is not None and math.isfinite(h) else None,
            "room": room_at(mp, gx, gy)}


def room_at(mp, gx, gy):
    """The room id under (or within 3 cells of) a map cell, or None."""
    w, h, cells = mp["width"], mp["height"], mp["_cells"]
    ix, iy = int(gx), int(gy)
    for r in range(4):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                jx, jy = ix + dx, iy + dy
                if 0 <= jx < w and 0 <= jy < h:
                    v = cells[jy * w + jx]
                    if 0 < v < 250:
                        return v
    return None


# ---------------------------------------------------------------- the map
ROOM_TYPES = ("room", "primaryBedroom", "secondaryBedroom", "livingRoom", "kitchen", "study", "bathroom", "diningRoom",
              "corridor", "balcony", "utilityRoom", "cloakRoom", "nursery", "recreationRoom", "showerRoom", "other")
UNASSIGNED = 250     # floor the robot knows but no room claims


def map_model(reply):
    """map/get_map reply → the panel-safe map, or None:
    {mapId, width, height, cellMm, dock: [x, y] | None, rooms: [{id, name, type, n, areaM2, label: [x, y]}],
     rle: run-length cells (see rle(); row 0 = map y 0, i.e. the BOTTOM; 0 = outside, 1–249 = room id,
     250 = floor without a room)}. name is the user's own name or "" (the panel then uses the type's word + n)."""
    m = get(reply, 2)
    if not isinstance(m, bytes) or not get(m, 17):
        return None
    width, height, res = get(m, 4, 0), get(m, 5, 0), get(m, 3, 0)
    if not (0 < width <= 2000 and 0 < height <= 2000):
        return None
    f6 = get(m, 6, b"")
    ox, oy = signed(get(f6, 3, 0)), signed(get(f6, 1, 0))
    try:
        data = zlib.decompress(get(m, 17), 47)
    except zlib.error:
        return None
    body = get(data, 1) if data[:1] == b"\x0a" else data
    cells = bytearray(width * height)
    i = n = 0
    try:
        while i < len(body) and n < len(cells):
            v, i = varint(body, i)
            if v:
                cells[n] = UNASSIGNED if v in (0x20, 0x28) else min((v >> 8) & 0xFF, 249) or UNASSIGNED
            n += 1
    except ValueError:
        return None
    rooms = []
    for r in get_all(m, 12):
        rid = get(r, 1, 0)
        if not 0 < rid < 250:
            continue
        sub = get(r, 2, 0)
        rooms.append({"id": rid, "name": text(get(r, 3))[:40], "type": ROOM_TYPES[sub] if 0 <= sub < len(ROOM_TYPES) else "room",
                      "n": get(r, 8, 0)})
    cell_m2 = (res / 1000.0) ** 2 if res else 0.0036
    labels = label_spots(cells, width, height)
    for r in rooms:
        cnt, spot = labels.get(r["id"], (0, None))
        r["areaM2"] = round(cnt * cell_m2, 1)
        r["label"] = spot
    dock = None
    pos = get(get(m, 8, b""), 1, b"")
    dx, dy = f32(get(pos, 1)), f32(get(pos, 2))
    if dx is not None and dy is not None and math.isfinite(dx) and math.isfinite(dy):
        dock = [round(dx - ox, 1), round(dy - oy, 1)]
    return {"mapId": get(m, 1, 0), "width": width, "height": height, "cellMm": res or 60, "originX": ox, "originY": oy,
            "dock": dock, "rooms": rooms, "rle": rle(cells)}


def rle(cells):
    """[value, count, value, count, …] — a real home's map: ~90 000 cells → ~1 500 runs (≈9 KB of JSON)."""
    out, prev, n = [], cells[0] if cells else 0, 0
    for c in cells:
        if c == prev:
            n += 1
        else:
            out += [prev, n]
            prev, n = c, 1
    if n:
        out += [prev, n]
    return out


def unrle(runs, size):
    cells = bytearray()
    for i in range(0, len(runs) - 1, 2):
        cells += bytes([runs[i] & 0xFF]) * runs[i + 1]
    return bytes(cells[:size]).ljust(size, b"\0")


def label_spots(cells, w, h):
    """For each room: (cell count, the cell deepest inside it) — where a name fits best (two-pass chamfer distance)."""
    INF = 1 << 20
    d = [0 if not (0 < c < 250) else INF for c in cells]
    for y in range(h):
        row = y * w
        for x in range(w):
            i = row + x
            if d[i]:
                c = cells[i]
                up = d[i - w] + 1 if y and cells[i - w] == c else 1
                lf = d[i - 1] + 1 if x and cells[i - 1] == c else 1
                d[i] = min(d[i], up, lf)
    best = {}
    for y in range(h - 1, -1, -1):
        row = y * w
        for x in range(w - 1, -1, -1):
            i = row + x
            if d[i]:
                c = cells[i]
                dn = d[i + w] + 1 if y < h - 1 and cells[i + w] == c else 1
                rt = d[i + 1] + 1 if x < w - 1 and cells[i + 1] == c else 1
                d[i] = min(d[i], dn, rt)
                cnt, spot, depth = best.get(c, (0, None, -1))
                best[c] = (cnt + 1, [x, y] if d[i] > depth else spot, max(depth, d[i]))
    return {c: (v[0], v[1]) for c, v in best.items()}


ACTIVE = ("cleaning", "paused", "returning", "error", "washing")


def map_version(mp):
    """A short content hash of what the panel draws (rooms, names, outlines, dock): changes when the owner edits rooms."""
    import hashlib
    raw = json.dumps([mp.get("mapId"), mp.get("rooms"), mp.get("rle"), mp.get("dock")], separators=(",", ":"), sort_keys=True)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]


def map_internal(mp):
    """The panel-safe map + decoded cells for room lookups."""
    if not mp or not isinstance(mp.get("rle"), list):
        return None
    return dict(mp, _cells=unrle(mp["rle"], mp["width"] * mp["height"]))


# ---------------------------------------------------------------- commands (the allowlist)
MODES = {   # mode: (CleanParam mode, CleanTask task type, passes field)
    "vacuum": (2, 1, 5), "mop": (3, 2, 6), "both": (4, 4, 7), "vacuumThenMop": (5, 3, 7)}
SIMPLE = {"pause": "task/pause", "resume": "task/resume", "cancel": "task/cancel", "dock": "supply/recall",
          "washMop": "supply/wash_mop", "dryMop": "supply/dry_mop", "emptyDust": "supply/dust_gathering",
          "locate": "common/yell"}
COMMANDS = ("start",) + tuple(SIMPLE)
RESULTS_WORDS = {1: "ok", 2: "notNow", 3: "already", 4: "notReady"}


def clean_payload(rooms, mode, passes=1):
    """clean/plan/start: {1: {1: 1, 2: [{1: {1: 1, 2: room}, 2: {1: mode, 2: fan, 3: strength, 4: water,
    <passes field>: n}, 3: order}], 3: {}, 5: task type}}  (the v2 shape validated by sytchi/NarwalIntegration).

    LIVE NOTE (2026-11-15, fw v01.09.07.06): the same payload with field 3 = {1: 1} (copied from the app's task as the
    robot reported it) was accepted but the robot re-ran its last saved plan (room 1) instead of the rooms sent:
    field 3 = {1: 1} probably means "run saved plan 1". Field 3 is now empty as in the reference; NOT yet re-tested."""
    code, task_type, passes_tag = MODES[mode]
    param = pb_int(1, code) + pb_int(2, 3) + pb_int(3, 1) + pb_int(passes_tag, passes)
    entries = b"".join(pb_msg(2, pb_msg(1, pb_int(1, 1) + pb_int(2, int(r))) + pb_msg(2, param) + pb_int(3, i + 1))
                       for i, r in enumerate(rooms))
    return pb_msg(1, pb_int(1, 1) + entries + pb_msg(3, b"") + pb_int(5, task_type))


def check_command(cmd, args, room_ids=()):
    """A queued command → (topic short name, payload) or ValueError. Rooms must be on the robot's map; none = all."""
    if cmd not in COMMANDS:
        raise ValueError("unknown command")
    if cmd != "start":
        return SIMPLE[cmd], b""
    args = args if isinstance(args, dict) else {}
    mode = args.get("mode") if args.get("mode") in MODES else "both"
    rooms = args.get("rooms") or []
    if not isinstance(rooms, list) or not all(isinstance(r, int) and not isinstance(r, bool) for r in rooms):
        raise ValueError("rooms")
    known = set(room_ids)
    if rooms and known and not set(rooms) <= known:
        raise ValueError("unknown room")
    rooms = rooms or sorted(known)
    if not rooms:
        raise ValueError("no rooms")
    passes = args.get("passes") if args.get("passes") in (1, 2, 3) else 1
    return "clean/plan/start", clean_payload(rooms, mode, passes)


# ---------------------------------------------------------------- one visit to a robot
class Visit:
    """One short connection to a robot."""

    def __init__(self, entry, port=PORT, timeout=5.0):
        self.e, self.ws = entry, WS(entry["ip"], port, timeout)
        self.base = self.work = self.dmap = None
        self.ids = (entry.get("productKey") or "", entry.get("deviceId") or "")

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.ws.close()

    def topic(self, name):
        return f"/{self.ids[0]}/{self.ids[1]}/{name}"

    def _take(self, frame):
        p = parse_frame(frame)
        if not p:
            return None
        topic, payload, resp = p
        parts = topic.split("/")
        if not resp and len(parts) >= 4 and parts[1] and parts[2]:
            self.ids = (parts[1], parts[2])
        st = short_topic(topic)
        if not resp:
            if st == "status/robot_base_status":
                self.base = payload
            elif st == "status/working_status":
                self.work = payload
            elif st == "map/display_map":
                self.dmap = payload
            return None
        return payload

    def ask(self, name, payload=b"", wait=6.0, accept=None):
        """Send one request, return the response payload (or None). Responses carry no topic, so `accept` checks a
        response has the expected shape (a late answer to an earlier request is skipped)."""
        self.ws.send(build_frame(self.topic(name), payload))
        end = time.time() + wait
        while time.time() < end:
            for fr in self.ws.frames(0.3):
                r = self._take(fr)
                if r is not None and (accept is None or accept(r)):
                    return r
        return None

    def drain(self, wait=0.6):
        end = time.time() + wait
        while time.time() < end:
            for fr in self.ws.frames(0.2):
                self._take(fr)

    def _info(self, keys, dev, wait=3.0):
        """get_device_info for a device id under each of `keys` (sent together; the robot answers ONLY the one with its
        own key and id — checked live on a Flow, fw v01.09.07.06: an empty, wildcard or wrong id or key gets no answer
        at all). The answer is flat: {1: product key, 2: device id, 3: firmware}. → the robot's key, or None."""
        for k in keys:
            self.ws.send(build_frame(f"/{k}/{dev}/common/get_device_info"))
        end = time.time() + wait
        while time.time() < end:
            for fr in self.ws.frames(0.3):
                r = self._take(fr)
                if r is not None:
                    k, d = text(get(r, 1)).strip(), text(get(r, 2)).strip()
                    if d == dev and k in keys:
                        self.firmware = text(get(r, 3)).strip()
                        return k
        return None

    def discover(self, wait=8.0, listen=6.0):
        """The robot's product key and device id.
        - device id known (learned before, or typed by the owner): find its product key (each known key once).
        - unknown: a docked, idle robot sends nothing and answers nothing without its id, so the only way is to
          listen: an awake robot (cleaning, or right after one) broadcasts topics that carry both.
        Returns True when both are known and the robot confirmed them (or broadcast them)."""
        key, dev = self.ids
        if dev:
            k = self._info([key], dev, 1.5) if key else None      # (the key learned before: one quick question)
            k = k or self._info([x for x in KNOWN_KEYS if x != key], dev)
            if k:
                self.ids = (k, dev)
                self.drain(0.3)
                return True
            return False
        end = time.time() + listen
        while time.time() < end:
            for fr in self.ws.frames(0.3):
                self._take(fr)
            if all(self.ids):
                return True
        return False

    def status(self, mp=None, active_wait=6.0):
        """One status read → the panel-safe live model (no name, no ids)."""
        r = self.ask("status/get_device_base_status", wait=6.0,
                     accept=lambda x: isinstance(get(x, 2), bytes) and isinstance(get(get(x, 2), 3), bytes))
        if r is not None:
            self.base = self.base or get(r, 2)
        if self.base is None:
            return None
        model = base_model(self.base)
        if not model["onDock"] or model["state"] in ("cleaning", "paused", "returning", "error"):
            sub = b"".join(pb_msg(1, pb_msg(1, t.encode()) + pb_int(2, 15))
                           for t in ("map/display_map", "status/working_status", "status/robot_base_status"))
            self.ws.send(build_frame(self.topic("common/active_robot_publish"), sub))
            end = time.time() + active_wait
            while time.time() < end and (self.dmap is None or self.work is None):
                for fr in self.ws.frames(0.3):
                    self._take(fr)
            model = base_model(self.base)   # (a fresher broadcast may have arrived)
        if self.work is not None:
            model["job"] = work_model(self.work)
        if self.dmap is not None:
            model["position"] = position(self.dmap, map_internal(mp) if mp and "_cells" not in mp else mp)
        return model

    def get_map(self):
        r = self.ask("map/get_map", wait=15.0, accept=lambda x: isinstance(get(get(x, 2), 17), bytes))
        return map_model(r) if r is not None else None

    def command(self, cmd, args, room_ids=()):
        name, payload = check_command(cmd, args, room_ids)
        self.drain(0.3)
        r = self.ask(name, payload, wait=10.0, accept=lambda x: get(x, 2) is None or not isinstance(get(get(x, 2), 3), bytes))
        if r is None:
            return {"ok": False, "result": "noAnswer"}
        code = get(r, 1)
        return {"ok": code == 1, "result": RESULTS_WORDS.get(code, "unknown")}


def test(ip, port=PORT, device_id="", product_key=""):
    """For the Manager's Test: works (with the robot's ids, firmware, battery and state) / reach (no connection) /
    needsId (a robot answered the connection but hasn't told us its id: asleep, and no id typed) / wrongId."""
    try:
        with Visit({"ip": ip, "productKey": product_key, "deviceId": device_id}, port, timeout=4.0) as v:
            if not v.discover(listen=6.0):
                return {"ok": False, "why": "wrongId" if device_id else "needsId"}
            if not getattr(v, "firmware", ""):
                v._info([v.ids[0]], v.ids[1], 1.5)
            st = v.status()
            return {"ok": True, "productKey": v.ids[0], "deviceId": v.ids[1], "firmware": getattr(v, "firmware", ""),
                    "battery": (st or {}).get("battery"), "state": (st or {}).get("state")}
    except (socket.timeout, TimeoutError, ConnectionRefusedError, OSError, ConnectionError):
        return {"ok": False, "why": "reach"}


