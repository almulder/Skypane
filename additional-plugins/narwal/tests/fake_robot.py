"""A stand-in Narwal robot on 127.0.0.1 for the plugin tests (same as service/test_v350_vacuums.py's), built on the
plugin's own copy of the protocol (plugin/narwal/worker/narwal_core.py). Never a real robot."""
import base64
import hashlib
import importlib.util
import pathlib
import socket
import struct
import threading
import zlib

_core = pathlib.Path(__file__).resolve().parent.parent / "source" / "worker" / "narwal_core.py"
_spec = importlib.util.spec_from_file_location("narwal_core_for_tests", str(_core))
nw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(nw)

KEY, DEV = "QxMSPG6VSO", "0123456789abcdef0123456789abcdef"


# ---------------------------------------------------------------- building robot messages (the robot's own shapes)
def f32_bits(x):
    return struct.unpack("<I", struct.pack("<f", x))[0]


def pb_f32(n, x):
    return nw.enc_varint((n << 3) | 5) + struct.pack("<f", x)


def base_msg(ws=14, f3=None, battery=80.0, f11=3, f47=1, fault=None, warn=False, drying=False):
    """A robot_base_status. fault: (code, severity, text) on channel 48.1.*.2."""
    f3b = nw.pb_int(1, ws) + b"".join(nw.pb_int(k, v) for k, v in (f3 or {}).items())
    b = pb_f32(2, battery) + nw.pb_msg(3, f3b) + nw.pb_int(11, f11) + nw.pb_int(41, 100) + nw.pb_int(47, f47)
    entry = b""
    if fault:
        code, sev, txt = fault
        entry += nw.pb_msg(2, nw.pb_int(1, sev) + nw.pb_int(2, code) + nw.pb_msg(3, txt.encode()))
    if drying:
        entry += nw.pb_msg(15, b"")
    if entry:
        b += nw.pb_msg(48, nw.pb_msg(1, entry))
    return b


def map_reply(w=12, h=10, name2="Snack Bar"):
    """A get_map reply: room 1 (left), room 2 (right, user-named), a wall column between, dock at (2, 2)."""
    vals = []
    for y in range(h):
        for x in range(w):
            if x == 0 or y == 0 or x == w - 1 or y == h - 1:
                vals.append(0)
            elif x == 6:
                vals.append(0x28)                       # unassigned obstacle
            elif x < 6:
                vals.append((0x2001 << 8) | 0x01)       # room 1 with the high flag a real robot sets
            else:
                vals.append((2 << 8) | 0x11)            # room 2, an edge flag
    packed = b"".join(nw.enc_varint(v) for v in vals)
    grid = zlib.compress(nw.pb_msg(1, packed))
    rooms = (nw.pb_msg(12, nw.pb_int(1, 1) + nw.pb_int(2, 3) + nw.pb_int(8, 1)) +
             nw.pb_msg(12, nw.pb_int(1, 2) + nw.pb_int(2, 4) + nw.pb_msg(3, name2.encode())))
    origin = nw.pb_int(1, (1 << 64) - 5) + nw.pb_int(3, (1 << 64) - 3)      # signed -5 (y), -3 (x)
    dock = nw.pb_msg(8, nw.pb_msg(1, pb_f32(1, -1.0) + pb_f32(2, -3.0)))     # -> cell (2, 2)
    m = (nw.pb_int(1, 7) + nw.pb_int(3, 60) + nw.pb_int(4, w) + nw.pb_int(5, h) + nw.pb_msg(6, origin) + dock +
         rooms + nw.pb_msg(17, grid))
    return nw.pb_int(1, 1) + nw.pb_msg(2, m)


def dmap_msg(x, y, heading=0.5):
    return nw.pb_msg(1, nw.pb_msg(1, pb_f32(1, x) + pb_f32(2, y)) + pb_f32(2, heading))


def work_msg(area=12.5, elapsed=600):
    return pb_f32(1, 98.0) + pb_f32(2, area) + nw.pb_int(3, elapsed)


# ---------------------------------------------------------------- a fake Narwal robot on 127.0.0.1
class FakeRobot:
    """Answers like a Narwal: device info, base status, map, the broadcast request and commands (one client at a time)."""

    def __init__(self, base=None, accept_commands=True):
        self.base = base or base_msg(ws=3, f3={5: 7}, f11=1, f47=2, battery=61.0)
        self.map = map_reply()
        self.awake = False          # like a real robot: docked and idle it broadcasts nothing
        self.accept, self.got = accept_commands, []
        self.srv = socket.socket()
        self.srv.bind(("127.0.0.1", 0))
        self.srv.listen(4)
        self.port = self.srv.getsockname()[1]
        self.stop = False
        threading.Thread(target=self._serve, daemon=True).start()

    def close(self):
        self.stop = True
        self.srv.close()

    def _serve(self):
        while not self.stop:
            try:
                c, _ = self.srv.accept()
            except OSError:
                return
            threading.Thread(target=self._client, args=(c,), daemon=True).start()

    @staticmethod
    def _send(c, payload):
        n = len(payload)
        hdr = struct.pack(">BB", 0x82, n) if n < 126 else (struct.pack(">BBH", 0x82, 126, n) if n < 65536 else struct.pack(">BBQ", 0x82, 127, n))
        c.sendall(hdr + payload)

    def _resp(self, c, payload):
        self._send(c, bytes([0x01, 2, 0x2A, 0]) + payload)

    def _bcast(self, c, name, payload):
        self._send(c, nw.build_frame(f"/{KEY}/{DEV}/{name}", payload))

    def _client(self, c):
        try:
            buf = b""
            while b"\r\n\r\n" not in buf:
                buf += c.recv(4096)
            key = [ln.split(b":", 1)[1].strip() for ln in buf.split(b"\r\n") if ln.lower().startswith(b"sec-websocket-key")][0]
            acc = base64.b64encode(hashlib.sha1(key + b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest())
            c.sendall(b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + acc + b"\r\n\r\n")
            if self.awake:          # an awake robot (cleaning) broadcasts its status: the topic carries key and id
                self._bcast(c, "status/robot_base_status", self.base)
            while True:
                h = self._exact(c, 2)
                op, ln = h[0] & 0x0F, h[1] & 0x7F
                if ln == 126:
                    ln = struct.unpack(">H", self._exact(c, 2))[0]
                elif ln == 127:
                    ln = struct.unpack(">Q", self._exact(c, 8))[0]
                mask = self._exact(c, 4)
                data = bytes(b ^ mask[i % 4] for i, b in enumerate(self._exact(c, ln)))
                if op == 8:
                    return
                p = nw.parse_frame(data)
                if not p:
                    continue
                parts = p[0].split("/")
                if len(parts) < 4 or parts[1] != KEY or parts[2] != DEV:
                    self.got.append(("(ignored) " + p[0], p[1]))   # a real robot answers only its own key + id
                    continue
                name = nw.short_topic(p[0])
                self.got.append((name, p[1]))
                if name == "common/get_device_info":     # flat {1: key, 2: id, 3: firmware}, as the real robot answers
                    self._resp(c, nw.pb_msg(1, KEY.encode()) + nw.pb_msg(2, DEV.encode()) + nw.pb_msg(3, b"v01.09.07.06\n"))
                elif name == "status/get_device_base_status":
                    self._resp(c, nw.pb_int(1, 1) + nw.pb_msg(2, self.base))
                elif name == "map/get_map":
                    self._resp(c, self.map)
                elif name == "common/active_robot_publish":
                    self._bcast(c, "status/working_status", work_msg())
                    self._bcast(c, "map/display_map", dmap_msg(5.0, -1.0))
                else:
                    self._resp(c, nw.pb_int(1, 1 if self.accept else 2))
        except (OSError, IndexError, ConnectionError):
            pass
        finally:
            c.close()

    @staticmethod
    def _exact(c, n):
        b = b""
        while len(b) < n:
            chunk = c.recv(n - len(b))
            if not chunk:
                raise ConnectionError
            b += chunk
        return b


