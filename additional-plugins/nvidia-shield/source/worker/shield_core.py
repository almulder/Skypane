"""NVIDIA Shield: the local protocols, standard library only.

- NVIDIA's own protocol, TLS on TCP 8987 (what NVIDIA's phone app uses): pairing with a code shown on the TV (the Shield
  then issues this client its own certificate and key), remote keys, opening apps, the app list with icons, find my
  remote. Message shapes learned from the MIT-licensed obnauticus/ha-nvidia-shield-remote and checked against a real
  Shield; written here from scratch.
- Google Cast, TLS on TCP 8009 (no pairing): the open app, the volume, standby.

Messages are protobuf, encoded by hand. Outer message: {1 service, 2 payload, 3 service number, 4 size, 5 time}.
"""
import json
import os
import re
import socket
import ssl
import struct
import time
import urllib.request

import selfcert

PORT = 8987
CAST_PORT = 8009

# services (outer field 1)
HANDSHAKE, AUTH, INPUT, VOLUME, LAUNCHER, LOCATOR = 1, 10, 1001, 1008, 1009, 1011
# remote keys: a Linux input key code, sent zigzag-encoded (code × 2). Volume as keys reaches a receiver over HDMI
# (CEC / ARC), the way the Shield's own remote does.
KEYS = {"up": 206, "down": 216, "left": 210, "right": 212, "ok": 706, "home": 344, "back": 316, "menu": 278,
        "playpause": 630, "rewind": 336, "ff": 416, "volup": 230, "voldown": 228, "mute": 226, "search": 434}
POWER_SLEEP = bytes.fromhex("08e907120808141005201e401e")
POWER_WAKE = bytes.fromhex("08e907120808141005201e4010")
PIN_STARTED = bytes.fromhex("080a120308cf08")
CERT_REPLY = bytes.fromhex("08b510")
CATEGORIES = {0: "video", 1: "music", 2: "games", 6: "system", 8: "video"}


class ShieldError(Exception):
    """why: "reach" (no answer), "unpaired" (the Shield refused this client), "protocol" (an answer we can't read)."""

    def __init__(self, why, text=""):
        super().__init__(text or why)
        self.why = why


# ---------- protobuf ----------
def varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def f_int(no, v):
    return varint(no << 3) + varint(v)


def f_bytes(no, v):
    v = v.encode() if isinstance(v, str) else v
    return varint(no << 3 | 2) + varint(len(v)) + v


def read_varint(b, i):
    v = s = 0
    while True:
        if i >= len(b):
            raise ValueError("truncated varint")
        c = b[i]
        i += 1
        v |= (c & 0x7F) << s
        s += 7
        if not c & 0x80:
            return v, i


def fields(b):
    """[(field, wiretype, value)] of one message."""
    out, i = [], 0
    while i < len(b):
        k, i = read_varint(b, i)
        no, wt = k >> 3, k & 7
        if wt == 0:
            v, i = read_varint(b, i)
        elif wt == 2:
            n, i = read_varint(b, i)
            if i + n > len(b):
                raise ValueError("truncated field")
            v = b[i:i + n]
            i += n
        elif wt == 5:
            v, i = b[i:i + 4], i + 4
        elif wt == 1:
            v, i = b[i:i + 8], i + 8
        else:
            raise ValueError("wire type %d" % wt)
        out.append((no, wt, v))
    return out


def split_messages(buf):
    """The outer messages in a buffer of back-to-back messages (each starts at field 1); (messages, rest)."""
    msgs, i = [], 0
    while i < len(buf):
        j, start, seen = i, i, set()
        try:
            while j < len(buf):
                k, nj = read_varint(buf, j)
                no, wt = k >> 3, k & 7
                if no == 1 and 1 in seen:
                    break
                if wt == 0:
                    _, nj = read_varint(buf, nj)
                elif wt == 2:
                    n, nj = read_varint(buf, nj)
                    if nj + n > len(buf):
                        return msgs, buf[start:]
                    nj += n
                else:
                    return msgs, b""
                seen.add(no)
                j = nj
        except ValueError:
            return msgs, buf[start:]
        msgs.append(buf[start:j])
        i = j
    return msgs, b""


def outer(service, payload):
    return f_int(1, service) + f_bytes(2, payload)


# ---------- messages ----------
def hello(name="Skypane"):
    # capability mask: the one NVIDIA's app sends (keys, launcher, volume, locator…)
    return outer(HANDSHAKE, f_int(1, 1) + f_bytes(2, name) + f_int(3, 1) + f_int(5, 81915))


def key_message(code, down):
    """One key change (down or up). The Shield reads one message per write, so each goes on its own."""
    return outer(INPUT, f_int(1, 20) + f_int(2, 1) + f_int(4, 10) + f_int(5, 1 if down else 2) + f_bytes(6, varint(code)))


def key_messages(code):
    """(down, up) for a key: send them as two writes, never joined."""
    return key_message(code, True), key_message(code, False)


# typing: the text itself, as NVIDIA's app sends it (virtual input: a command from a keyboard, an ASCII string in field
# 7; checked on a real Shield). Delete and Enter are key presses (Linux keys 14 and 28, × 2 like KEYS).
TEXT_MAX = 100
TEXT_OK = re.compile(r"[ -~]{1,%d}" % TEXT_MAX)          # (printable ASCII: what an ASCII string carries)
TEXT_KEYS = {"backspace": 14 * 2, "enter": 28 * 2}


def text_message(text):
    return outer(INPUT, f_int(1, 20) + f_int(2, 1) + f_int(4, 12) + f_bytes(7, text))


def launch_message(package):
    return outer(LAUNCHER, f_int(1, 2) + f_bytes(2, f_bytes(1, package)))


APP_LIST_REQUEST = outer(LAUNCHER, f_int(1, 0))
FIND_REMOTE = outer(LOCATOR, f_int(1, 1))
PAIRING_REQUEST = outer(AUTH, f_int(1, 1101))


def pin_message(pin, client_id):
    return outer(AUTH, f_int(1, 1105) + f_bytes(2, f_bytes(1, pin) + f_bytes(2, client_id)))


def parse_app_list(msg):
    """[{"pkg", "name", "cat", "url"}] from a launcher reply, or None when it isn't one."""
    try:
        top = dict((no, v) for no, _, v in fields(msg))
        if top.get(1) != LAUNCHER or not isinstance(top.get(2), (bytes, bytearray)):
            return None
        body = fields(top[2])
        if dict((no, v) for no, _, v in body).get(1) != 1:
            return None
        out = []
        for no, wt, v in body:
            if no != 2 or wt != 2:
                continue
            for no2, wt2, app in fields(v):
                if no2 != 1 or wt2 != 2:
                    continue
                d = {}
                for no3, wt3, val in fields(app):
                    d[no3] = val
                pkg = d.get(1, b"").decode("utf-8", "replace")
                if re.fullmatch(r"[A-Za-z0-9_.]{1,150}", pkg):
                    out.append({"pkg": pkg, "name": d.get(2, b"").decode("utf-8", "replace")[:60] or pkg,
                                "cat": CATEGORIES.get(d.get(3, 0) if isinstance(d.get(3, 0), int) else 0, "other"),
                                "url": d.get(4, b"").decode("utf-8", "replace")})
        return out
    except (ValueError, UnicodeDecodeError):
        return None


def hello_name(buf):
    """The Shield's own name from its hello (auth service, command 1000: {2: name})."""
    msgs, _ = split_messages(buf)
    for m in msgs:
        try:
            top = dict((no, v) for no, _, v in fields(m))
            if top.get(1) != AUTH or not isinstance(top.get(2), (bytes, bytearray)):
                continue
            body = dict((no, v) for no, _, v in fields(top[2]))
            inner = body.get(2)
            if body.get(1) == 1000 and isinstance(inner, (bytes, bytearray)):
                name = dict((no, v) for no, _, v in fields(inner)).get(2)
                if isinstance(name, (bytes, bytearray)):
                    return name.decode("utf-8", "replace")[:48]
        except ValueError:
            continue
    return None


# ---------- TLS ----------
def _context(cert_pem, key_pem, workdir):
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE   # (the Shield's certificate is its own, self-signed)
    os.makedirs(workdir, exist_ok=True)
    c, k = os.path.join(workdir, ".c.pem"), os.path.join(workdir, ".k.pem")
    for path, text in ((c, cert_pem), (k, key_pem)):
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(text)
    try:
        ctx.load_cert_chain(c, k)
    finally:
        for p in (c, k):
            try:
                os.remove(p)
            except OSError:
                pass
    return ctx


def _connect(host, port, ctx, timeout=5):
    try:
        raw = socket.create_connection((host, port), timeout=timeout)
    except OSError as e:
        raise ShieldError("reach", str(e))
    try:
        return ctx.wrap_socket(raw, server_hostname=host)
    except (ssl.SSLError, OSError) as e:
        raw.close()
        raise ShieldError("unpaired" if isinstance(e, ssl.SSLError) else "reach", str(e))


def _read_for(s, seconds, until=None):
    s.settimeout(0.3)
    end, buf = time.monotonic() + seconds, bytearray()
    while time.monotonic() < end:
        try:
            c = s.recv(65536)
        except socket.timeout:
            continue
        except (OSError, ssl.SSLError):
            break
        if not c:
            break
        buf += c
        if until and until(bytes(buf)):
            break
    return bytes(buf)


def _der_len(b, i):
    n = b[i + 1]
    if n < 0x80:
        return 2 + n
    c = n & 0x7F
    return 2 + c + int.from_bytes(b[i + 2:i + 2 + c], "big")


def _pem(kind, der):
    import base64
    t = base64.b64encode(der).decode()
    return "-----BEGIN %s-----\n%s\n-----END %s-----\n" % (kind, "\n".join(t[i:i + 64] for i in range(0, len(t), 64)), kind)


def credentials_from(payload):
    """(cert_pem, key_pem) from the Shield's pairing reply: after b"Success", field 3 is the key (DER), then the
    certificate (DER)."""
    at = payload.find(b"Success")
    f = payload.find(b"\x1a", at + 7)
    if at < 0 or f < 0:
        raise ShieldError("protocol", "no credentials in the reply")
    n, i = read_varint(payload, f + 1)
    key_der = payload[i:i + n]
    j = i + n
    while j < len(payload) and payload[j] != 0x30:
        j += 1
    if j >= len(payload) or len(key_der) != n:
        raise ShieldError("protocol", "credentials cut short")
    cert_der = payload[j:j + _der_len(payload, j)]
    pkcs8 = key_der[4:7] == b"\x02\x01\x00" and b"\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01" in key_der[:30]
    return _pem("CERTIFICATE", cert_der), _pem("PRIVATE KEY" if pkcs8 else "RSA PRIVATE KEY", key_der)


# ---------- pairing ----------
class Pairing:
    """Step 1 (start): asks the Shield for a code on the TV and keeps the connection open. Step 2 (finish): sends the
    code; the Shield answers with this client's own certificate and key."""

    def __init__(self, host, port, workdir):
        self.host, self.port, self.workdir = host, port, workdir
        self.started = time.monotonic()
        cert, key = selfcert.make("Skypane")
        self.sock = _connect(host, port, _context(cert, key, workdir))
        self.sock.sendall(hello())
        _read_for(self.sock, 2.5)
        self.sock.sendall(PAIRING_REQUEST)
        r = _read_for(self.sock, 8, until=lambda b: PIN_STARTED in b)
        if PIN_STARTED not in r:
            self.close()
            raise ShieldError("protocol", "the Shield didn't start pairing")

    def finish(self, pin):
        try:
            self.sock.sendall(pin_message(pin, os.urandom(8).hex()))
            # (the answer to a code is the pairing result, command 2101, with or without "Success")
            r = _read_for(self.sock, 10, until=lambda b: CERT_REPLY in b and (b"Success" in b or len(b) > 6))
            if CERT_REPLY in r and b"Success" in r:
                r += _read_for(self.sock, 0.6)    # (the key and certificate may still be on their way)
        except (OSError, ssl.SSLError) as e:
            raise ShieldError("reach", str(e))
        finally:
            self.close()
        if b"Success" not in r:
            raise ShieldError("pin", "the Shield didn't accept the code")
        return credentials_from(r)

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


# ---------- a paired session ----------
class Session:
    """One open connection to a paired Shield: send keys, open apps, read the app list."""

    def __init__(self, host, port, cert_pem, key_pem, workdir):
        self.host = host
        self.sock = _connect(host, port, _context(cert_pem, key_pem, workdir))
        self.sock.sendall(hello())
        # a paired client gets the Shield's hello AND its service messages (volume set-up, the remote locator); an unknown
        # client gets the hello alone (seen on a real Shield: 25 bytes unpaired, 56 paired)
        r = _read_for(self.sock, 3, until=lambda b: b"\x08\xe8\x07" in b and (b"\x08\xf0\x07" in b or b"\x08\xf3\x07" in b))
        if b"\x08\xe8\x07" not in r:
            self.close()
            raise ShieldError("reach", "no hello")
        if b"\x08\xf0\x07" not in r and b"\x08\xf3\x07" not in r:
            self.close()
            raise ShieldError("unpaired", "the Shield doesn't know this client")
        self.opened = self.used = time.monotonic()
        self.name = "SHIELD"
        m = re.search(rb"\x12\x06SHIELD|\x12([\x01-\x3f])([ -~]{1,63})", r)
        if m and m.group(2):
            self.name = m.group(2).decode("ascii", "replace")

    def send(self, data):
        try:
            self.sock.sendall(data)
            self.used = time.monotonic()
            _read_for(self.sock, 0.05)   # (drain whatever it says back)
        except (OSError, ssl.SSLError) as e:
            raise ShieldError("reach", str(e))

    def key(self, name):
        down, up = key_messages(KEYS[name])
        self.send(down)          # (send() waits a moment for the Shield's reply: the press has a length)
        self.send(up)

    def write(self, data, gap=0.03):
        try:
            self.sock.sendall(data)
            self.used = time.monotonic()
            time.sleep(gap)
        except (OSError, ssl.SSLError) as e:
            raise ShieldError("reach", str(e))

    def type_text(self, text):
        self.send(text_message(text[:TEXT_MAX]))

    def text_key(self, name, times=1):
        down, up = key_messages(TEXT_KEYS[name])
        for _ in range(times):
            self.write(down)
            self.write(up)
        _read_for(self.sock, 0.05)

    def power(self, wake):
        self.send(POWER_WAKE if wake else POWER_SLEEP)

    def launch(self, package):
        self.send(launch_message(package))

    def find_remote(self):
        self.send(FIND_REMOTE)

    def apps(self, icons=True, icon_max=200000):
        """The installed apps (each once), with each icon as a data: URL (the Shield serves them only while a
        session is open)."""
        try:
            self.sock.sendall(APP_LIST_REQUEST)
            self.used = time.monotonic()
        except (OSError, ssl.SSLError) as e:
            raise ShieldError("reach", str(e))
        buf, got = b"", None
        end = time.monotonic() + 8
        while time.monotonic() < end and got is None:
            buf += _read_for(self.sock, 0.6)
            msgs, buf = split_messages(buf)
            for m in msgs:
                a = parse_app_list(m)
                if a is not None:
                    got = a
        if got is None:
            raise ShieldError("protocol", "no app list")
        seen, out = set(), []
        for a in got:
            if a["pkg"] in seen:
                continue
            seen.add(a["pkg"])
            icon = None
            if icons and re.fullmatch(r"http://[0-9.]+:\d{2,5}/[A-Za-z0-9_.]+", a["url"] or "") and a["url"].startswith("http://" + self.host + ":"):
                try:
                    with urllib.request.urlopen(a["url"], timeout=4) as h:
                        data = h.read(icon_max + 1)
                    if len(data) <= icon_max and data[:8] == b"\x89PNG\r\n\x1a\n":
                        import base64
                        icon = "data:image/png;base64," + base64.b64encode(data).decode()
                except OSError:
                    pass
            out.append({"pkg": a["pkg"], "name": a["name"], "cat": a["cat"], "icon": icon})
        return out

    def close(self):
        try:
            self.sock.close()
        except OSError:
            pass


# ---------- Google Cast: what's on ----------
def _cast_msg(ns, payload, dst="receiver-0"):
    m = f_int(1, 0) + f_bytes(2, "sender-0") + f_bytes(3, dst) + f_bytes(4, ns) + f_int(5, 0) + f_bytes(6, json.dumps(payload))
    return struct.pack(">I", len(m)) + m


def cast_status(host, port=CAST_PORT, timeout=4):
    """{"app": name or None, "volume": 0–100 or None, "standby": bool or None}; raises ShieldError("reach")."""
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    s = _connect(host, port, ctx, timeout)
    try:
        s.sendall(_cast_msg("urn:x-cast:com.google.cast.tp.connection", {"type": "CONNECT"}))
        s.sendall(_cast_msg("urn:x-cast:com.google.cast.receiver", {"type": "GET_STATUS", "requestId": 1}))
        s.settimeout(timeout)
        buf, end = b"", time.monotonic() + timeout
        while time.monotonic() < end:
            while len(buf) < 4:
                c = s.recv(4096)
                if not c:
                    raise ShieldError("reach", "closed")
                buf += c
            n = struct.unpack(">I", buf[:4])[0]
            if n > 65536:
                raise ShieldError("protocol", "cast message too big")
            while len(buf) < 4 + n:
                c = s.recv(4096)
                if not c:
                    raise ShieldError("reach", "closed")
                buf += c
            msg, buf = buf[4:4 + n], buf[4 + n:]
            data = dict((no, v) for no, _, v in fields(msg)).get(6, b"{}")
            try:
                d = json.loads(data)
            except ValueError:
                continue
            if d.get("type") == "RECEIVER_STATUS":
                st = d.get("status") or {}
                apps = st.get("applications") or []
                vol = (st.get("volume") or {}).get("level")
                name = apps[0].get("displayName") if apps and isinstance(apps[0], dict) else None
                return {"app": str(name)[:60] if name else None,
                        "volume": round(float(vol) * 100) if isinstance(vol, (int, float)) else None,
                        "standby": st.get("isStandBy") if isinstance(st.get("isStandBy"), bool) else None}
        raise ShieldError("protocol", "no status")
    except (OSError, ssl.SSLError) as e:
        raise ShieldError("reach", str(e))
    finally:
        try:
            s.sendall(_cast_msg("urn:x-cast:com.google.cast.tp.connection", {"type": "CLOSE"}))
        except (OSError, ssl.SSLError):
            pass
        s.close()
