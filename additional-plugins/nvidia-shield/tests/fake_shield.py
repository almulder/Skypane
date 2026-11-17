"""A stand-in NVIDIA Shield on 127.0.0.1 for tests (never a real Shield). As strict as the real one where it matters:

- NVIDIA's protocol over TLS: it answers every client's hello, but only a PAIRED client gets the service messages after
  it, and only a paired client's keys / launches / find are acted on (others are ignored, as the real Shield does).
- Pairing: request → "code started" + a code (self.code, as if shown on the TV); the right code → "Success" with a
  client key (PKCS#8 DER) and certificate (DER), as the real reply carries them; a wrong code → no Success.
- The app list (service 1009, request 0) with icon addresses on its own small web server, which serves only while a
  paired session is open (like the real one).
- Google Cast on a second TLS port: RECEIVER_STATUS with the open app, the volume and standby.
"""
import base64
import http.server
import json
import os
import pathlib
import socket
import ssl
import struct
import sys
import tempfile
import threading

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "source" / "worker"))
import selfcert  # noqa: E402
import shield_core as sc  # noqa: E402

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
APPS = [("com.plexapp.android", "Plex", 0), ("com.netflix.ninja", "Netflix", 0), ("com.pandora.android.atv", "Pandora", 1),
        ("com.android.tv.settings", "Settings", 0)]


def _der(pem):
    return base64.b64decode("".join(line for line in pem.splitlines() if not line.startswith("-----")))


def _tlv(tag, body):
    return selfcert._tlv(tag, body)


def pkcs8(pkcs1_der):
    alg = selfcert._seq(selfcert._oid(selfcert.RSA_ENC), b"\x05\x00")
    return selfcert._seq(selfcert._int(0), alg, _tlv(0x04, pkcs1_der))


class FakeShield:
    def __init__(self, standby=False):
        self.dir = tempfile.mkdtemp(prefix="fake-shield-")
        cert, key = selfcert.make("SHIELD Android TV")
        c, k = os.path.join(self.dir, "s.crt"), os.path.join(self.dir, "s.key")
        pathlib.Path(c).write_text(cert)
        pathlib.Path(k).write_text(key)
        self.ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.ctx.load_cert_chain(c, k)
        self.ctx.verify_mode = ssl.CERT_NONE   # (it accepts any client certificate, as the real one does for pairing)
        self.paired = False
        self.code = None
        self.got = []            # ("key", code) / ("launch", pkg) / ("find",) / ("power", "wake" | "sleep")
        self.standby = standby
        self.app, self.volume = "Plex", 0.47
        self.open_sessions = 0
        self.presses = []        # every key change in order: ("down" | "up", code)
        self.dropped = 0        # messages that came joined to another in one write (the real Shield ignores them)
        self.stopping = False
        self.srv = self._listen(self._nv)
        self.cast = self._listen(self._cast)
        self.port, self.cast_port = self.srv.getsockname()[1], self.cast.getsockname()[1]
        fake = self

        class Icons(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                if fake.open_sessions <= 0 or not any(self.path == "/" + p for p, _, _ in APPS):
                    self.send_response(404)
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("Content-Type", "image/png")
                self.end_headers()
                self.wfile.write(PNG)

            def log_message(self, *a):
                pass

        self.http = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Icons)
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
        self.http_port = self.http.server_address[1]

    def _listen(self, handler):
        s = socket.socket()
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("127.0.0.1", 0))
        s.listen(8)

        def accept():
            while not self.stopping:
                try:
                    c, _ = s.accept()
                except OSError:
                    return
                threading.Thread(target=self._wrap, args=(c, handler), daemon=True).start()
        threading.Thread(target=accept, daemon=True).start()
        return s

    def _wrap(self, c, handler):
        try:
            t = self.ctx.wrap_socket(c, server_side=True)
        except (ssl.SSLError, OSError):
            c.close()
            return
        try:
            handler(t)
        except (OSError, ssl.SSLError, ValueError):
            pass
        finally:
            try:
                t.close()
            except OSError:
                pass

    # ---- NVIDIA's protocol ----
    def _nv(self, t):
        buf, session_paired, counted = b"", False, False
        t.settimeout(0.5)
        try:
            while not self.stopping:
                try:
                    c = t.recv(65536)
                except socket.timeout:
                    continue
                if not c:
                    return
                msgs, buf = sc.split_messages(buf + c)
                if len(msgs) > 1:                     # (the real Shield acts on the first message of a write only)
                    self.dropped += len(msgs) - 1
                    msgs = msgs[:1]
                for m in msgs:
                    top = dict((no, v) for no, _, v in sc.fields(m))
                    svc, body = top.get(1), top.get(2, b"")
                    bd = dict((no, v) for no, _, v in sc.fields(body)) if body else {}
                    if svc == sc.HANDSHAKE:
                        session_paired = self.paired
                        out = sc.outer(sc.AUTH, sc.f_int(1, 1000) + sc.f_bytes(2, sc.f_int(1, 1000) + sc.f_bytes(2, "SHIELD") + sc.f_int(3, 81623))) + sc.f_int(3, 10)
                        if session_paired:
                            out += sc.outer(sc.VOLUME, sc.f_int(1, 4) + sc.f_bytes(2, sc.f_bytes(1, sc.f_int(1, 3) + sc.f_int(2, 8) + sc.f_int(4, 15)))) + sc.f_int(3, 1008)
                            out += sc.outer(sc.LOCATOR, sc.f_int(1, 3)) + sc.f_int(3, 1011)
                            if not counted:
                                self.open_sessions += 1
                                counted = True
                        t.sendall(out)
                    elif svc == sc.AUTH and bd.get(1) == 1101:
                        self.code = "A1B2C3"
                        t.sendall(sc.PIN_STARTED + sc.f_int(3, 10))
                    elif svc == sc.AUTH and bd.get(1) == 1105:
                        sent = dict((no, v) for no, _, v in sc.fields(bd.get(2, b""))).get(1, b"").decode()
                        if self.code and sent == self.code:
                            cert, key = selfcert.make("nvbeyonder/SHIELD Android TV")
                            inner = sc.f_int(1, 1) + sc.f_bytes(2, "Success") + sc.f_bytes(3, pkcs8(_der(key))) + _der(cert)
                            t.sendall(sc.f_int(4, len(inner)) + sc.outer(sc.AUTH, sc.f_int(1, 2101) + sc.f_bytes(2, inner)))
                            self.paired = True
                        else:
                            t.sendall(sc.outer(sc.AUTH, sc.f_int(1, 2101) + sc.f_bytes(2, sc.f_int(1, 2) + sc.f_bytes(2, "Failed"))))
                        self.code = None
                    elif not session_paired:
                        continue                                         # (an unknown client: ignored)
                    elif svc == sc.INPUT:
                        if bd.get(4) == 12 and isinstance(bd.get(7), (bytes, bytearray)):
                            self.presses.append(("text", bytes(bd[7]).decode()))
                        elif bd.get(5) in (1, 2) and isinstance(bd.get(6), (bytes, bytearray)):
                            code = sc.read_varint(bd[6], 0)[0]
                            if bd[5] == 1:
                                self.got.append(("key", code))
                            self.presses.append(("down" if bd[5] == 1 else "up", code))
                        elif bd.get(1) == 20 and bd.get(4) == 30:
                            self.got.append(("power", "wake" if bytes(body).endswith(b"\x40\x10") else "sleep"))
                    elif svc == sc.LAUNCHER and bd.get(1) == 0:
                        lst = b"".join(sc.f_bytes(1, sc.f_bytes(1, p) + sc.f_bytes(2, n) + sc.f_int(3, cat) +
                                                  sc.f_bytes(4, "http://127.0.0.1:%d/%s" % (self.http_port, p)) + sc.f_int(5, 1) + sc.f_int(6, 1))
                                       for p, n, cat in APPS + APPS[:1])      # (the real list repeats some apps)
                        inner = sc.f_int(1, 1) + sc.f_bytes(2, lst)
                        t.sendall(sc.f_int(4, len(inner)) + sc.outer(sc.LAUNCHER, inner) + sc.f_int(3, 1009))
                    elif svc == sc.LAUNCHER and bd.get(1) == 2:
                        pkg = dict((no, v) for no, _, v in sc.fields(bd.get(2, b""))).get(1, b"").decode()
                        self.got.append(("launch", pkg))
                    elif svc == sc.LOCATOR and bd.get(1) == 1:
                        self.got.append(("find",))
        finally:
            if counted:
                self.open_sessions -= 1

    def forget(self):
        self.paired = False

    # ---- Google Cast ----
    def _cast(self, t):
        t.settimeout(3)
        buf = b""
        while not self.stopping:
            while len(buf) < 4:
                c = t.recv(4096)
                if not c:
                    return
                buf += c
            n = struct.unpack(">I", buf[:4])[0]
            while len(buf) < 4 + n:
                c = t.recv(4096)
                if not c:
                    return
                buf += c
            msg, buf = buf[4:4 + n], buf[4 + n:]
            d = json.loads(dict((no, v) for no, _, v in sc.fields(msg)).get(6, b"{}"))
            if d.get("type") == "GET_STATUS":
                st = {"volume": {"level": self.volume, "muted": False}, "isStandBy": self.standby, "isActiveInput": not self.standby,
                      "applications": [] if self.standby else [{"displayName": self.app, "appId": "AndroidNativeApp"}]}
                t.sendall(sc._cast_msg("urn:x-cast:com.google.cast.receiver", {"type": "RECEIVER_STATUS", "requestId": 1, "status": st}, "sender-0"))

    def close(self):
        self.stopping = True
        for s in (self.srv, self.cast):
            try:
                s.close()
            except OSError:
                pass
        self.http.shutdown()
