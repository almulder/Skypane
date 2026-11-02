"""Front door for the built-in go2rtc (stage 3): the panels talk to this on port 1984, go2rtc itself only listens on
127.0.0.1:1985 inside the container.

Why: go2rtc's player paths (/api/ws, /api/frame.jpeg) accept ?src=<any URL> and then connect to it — any web page
opened on the LAN could make it fetch internal addresses (and has no setting to turn that off). This guard passes on
only:
  GET /api/ws?src=<camera>            the panels' live player (WebSocket; WebRTC media then goes to port 8555 directly)
  GET /api/frame.jpeg?src=<camera>&t=<digits>   snapshot tiles
where <camera> is a stream name from go2rtc's own config (private/go2rtc.yaml, re-read when it changes), and only
with a Host header that is an IP address, localhost or a name in ALLOWED_HOSTS (DNS rebinding, like the dashboard
server), and for browsers only from a page on this address (Origin). go2rtc never gets the client's bytes: the guard
sends it a request of its own built from the checked values (no smuggling through odd line endings, headers or a
body), one per connection; a WebSocket is only passed through after go2rtc accepted the upgrade (101).
Limits: request head 8 KB within 10 s, answer within 30 s, 64 connections at once, 32 per device.

Usage: python -u -m service.go2rtc_guard --config /data/private/go2rtc.yaml [--listen 0.0.0.0:1984] [--upstream 127.0.0.1:1985]
"""
import argparse
import errno
import os
import pathlib
import re
import socket
import threading
import time
from urllib.parse import parse_qsl, urlencode, urlsplit

from service.server import host_allowed

MAX_HEAD = 8192
HEAD_SECONDS = 10
MAX_CONNECTIONS = 64
MAX_PER_CLIENT = 32       # one device can't take every slot (a panel shows at most 16 live tiles + snapshots)
ANSWER_SECONDS = 30       # a snapshot / the WebSocket upgrade must be done within this
UPSTREAM_HOST = "127.0.0.1:1985"
WS_KEY = re.compile(r"[A-Za-z0-9+/]{22}==")
PATHS = {"/api/ws": {"src"}, "/api/frame.jpeg": {"src", "t"}}
STREAM_LINE = re.compile(r"^  ([a-z0-9][a-z0-9-]*):\s")


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


class Names:
    """The stream names in go2rtc's config, re-read when the file changes."""

    def __init__(self, path):
        self.path, self.sig, self.names, self.lock = pathlib.Path(path), None, frozenset(), threading.Lock()

    def get(self):
        try:
            st = self.path.stat()
            sig = (st.st_mtime_ns, st.st_size)
        except OSError:
            return frozenset()
        with self.lock:
            if sig != self.sig:
                names, in_streams = set(), False
                for line in self.path.read_text(encoding="utf-8").splitlines():
                    if not line.startswith(" "):
                        in_streams = line.rstrip() == "streams:"
                    elif in_streams and (m := STREAM_LINE.match(line)):
                        names.add(m.group(1))
                self.names, self.sig = frozenset(names), sig
            return self.names


def _hostname(host):
    """'192.168.1.40:1984' -> '192.168.1.40', '[::1]:80' -> '::1'."""
    h = (host or "").strip().lower()
    if h.startswith("["):
        return h[1:h.find("]")] if "]" in h else h
    return h.split(":", 1)[0] if h.count(":") == 1 else h


def check(head, names, allowed_hosts):
    """(None, the request go2rtc gets) if this request may pass, else (HTTP status, None).
    go2rtc never sees the client's bytes: the request it gets is built here from the checked values only (no
    smuggling through odd line endings, headers or bodies)."""
    if any(b < 0x20 or b > 0x7e for b in head.replace(b"\r\n", b"")):   # bare CR / LF, tabs, other control or 8-bit bytes
        return 400, None
    text = head.decode("ascii")
    line, *fields = text.split("\r\n")
    try:
        method, target, version = line.split(" ")
    except ValueError:
        return 400, None
    if method != "GET" or version not in ("HTTP/1.1", "HTTP/1.0"):
        return 400, None
    headers = {}
    for f in fields:
        k, sep, v = f.partition(":")
        if not sep or not k or k != k.strip() or not k.replace("-", "").isalnum():   # folding, "Host :", junk
            return 400, None
        k = k.lower()
        if k in headers:
            return 400, None   # duplicated: ambiguous, refuse
        headers[k] = v.strip()
    if "transfer-encoding" in headers or headers.get("content-length", "0") != "0":
        return 400, None       # a GET with a body: refuse
    if not host_allowed(headers.get("host", ""), allowed_hosts):
        return 403, None
    # a browser says which page opened the socket / image: only pages from this address (any port) or a listed name
    origin = headers.get("origin")
    if origin is not None:
        o = urlsplit(origin)
        oh = (o.hostname or "").lower()
        if o.scheme not in ("http", "https") or not oh or (oh != _hostname(headers.get("host", "")) and oh not in allowed_hosts):
            return 403, None
    parts = urlsplit(target)
    if parts.scheme or parts.netloc or parts.fragment or parts.path not in PATHS:
        return 404, None
    try:
        query = parse_qsl(parts.query, keep_blank_values=True, strict_parsing=bool(parts.query))
    except ValueError:
        return 400, None
    keys = [k for k, _ in query]
    if len(keys) != len(set(keys)) or not set(keys) <= PATHS[parts.path] or "src" not in keys:
        return 400, None
    q = dict(query)
    if q["src"] not in names or ("t" in q and not q["t"].isdigit()):
        return 403, None
    out = f"GET {parts.path}?{urlencode([(k, q[k]) for k in ('src', 't') if k in q])} HTTP/1.1\r\nHost: {UPSTREAM_HOST}\r\n"
    if parts.path != "/api/ws":
        return None, (out + "Connection: close\r\n\r\n").encode()
    key, version_ = headers.get("sec-websocket-key", ""), headers.get("sec-websocket-version", "")
    if (headers.get("upgrade", "").lower() != "websocket" or "upgrade" not in headers.get("connection", "").lower()
            or version_ != "13" or not WS_KEY.fullmatch(key)):
        return 400, None
    # no Origin for go2rtc: its own check (Origin host = Host, port included) passes without one; the browser's real
    # Origin was checked above
    return None, (out + "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                  f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode()


def refuse(conn, status):
    reason = {400: "Bad Request", 403: "Forbidden", 404: "Not Found", 502: "Bad Gateway"}.get(status, "Error")
    try:
        conn.sendall(f"HTTP/1.1 {status} {reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".encode())
    except OSError:
        pass


def read_head(conn):
    conn.settimeout(HEAD_SECONDS)
    deadline, buf = time.monotonic() + HEAD_SECONDS, b""
    while b"\r\n\r\n" not in buf:
        if len(buf) > MAX_HEAD or time.monotonic() > deadline:
            return None, None
        conn.settimeout(max(0.1, deadline - time.monotonic()))
        chunk = conn.recv(4096)
        if not chunk:
            return None, None
        buf += chunk
    head, _, rest = buf.partition(b"\r\n\r\n")
    return head, rest


def pump(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        for s in (src, dst):
            try:
                s.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass


def handle(conn, names, allowed, upstream):
    up = None
    try:
        head, rest = read_head(conn)
        if head is None:
            return
        status, request = check(head, names.get(), allowed)
        if status is None and rest:
            status = 400           # nothing may follow the head (one request per connection, no body)
        if status:
            refuse(conn, status)
            return
        try:
            up = socket.create_connection(upstream, timeout=5)
        except OSError:
            refuse(conn, 502)
            return
        conn.settimeout(ANSWER_SECONDS)
        up.settimeout(ANSWER_SECONDS)
        up.sendall(request)
        if b"Upgrade: websocket" not in request:
            pump(up, conn)         # snapshot: go2rtc answers and closes (Connection: close); nothing more from the client
            return
        # WebSocket: the client's bytes go through only once go2rtc switched protocols
        first = up.recv(65536)
        if not first:
            return
        conn.sendall(first)
        if not first.startswith(b"HTTP/1.1 101"):
            return
        conn.settimeout(None)      # live video / WebRTC signalling: stays open as long as the tile shows
        up.settimeout(None)
        t = threading.Thread(target=pump, args=(conn, up), daemon=True)
        t.start()
        pump(up, conn)
        t.join(5)
    except OSError:
        pass
    finally:
        for s_ in (conn, up):
            if s_ is not None:
                try:
                    s_.close()
                except OSError:
                    pass


BUSY_RETRY = 10   # seconds between tries while the port is taken


def bind_waiting(host, port, stop=None, retry=BUSY_RETRY):
    """The listening socket. The port taken by something else (v3.0.0, the installer's finding 22: go2rtc that couldn't
    read its settings — a data folder Skypane can't write — falls back to its own default port 1984): one log line,
    then a quiet try every `retry` seconds — never an exit and restart loop in the container's log."""
    said = False
    while True:
        try:
            srv = socket.create_server((host, port), reuse_port=False)
            if said:
                log(f"port {port} is free again")
            return srv
        except OSError as e:
            if e.errno not in (errno.EADDRINUSE, getattr(errno, "WSAEADDRINUSE", -1)):
                raise
            if not said:
                log(f"port {port} is taken by another program — waiting for it (often: the data folder isn't writable, "
                    "so camera video couldn't read its settings; see Troubleshooting → data folder)")
                said = True
            if stop is not None:
                if stop.wait(retry):
                    return None
            else:
                time.sleep(retry)


def serve(listen, upstream, names, allowed, stop=None):
    host, port = listen
    srv = bind_waiting(host, port, stop)
    if srv is None:
        return
    srv.settimeout(1)
    slots = threading.BoundedSemaphore(MAX_CONNECTIONS)
    log(f"go2rtc guard on {host}:{port} -> {upstream[0]}:{upstream[1]}")

    per_client, lock = {}, threading.Lock()

    def run(conn, who):
        try:
            handle(conn, names, allowed, upstream)
        finally:
            with lock:
                per_client[who] -= 1
                if not per_client[who]:
                    del per_client[who]
            slots.release()

    while not (stop and stop.is_set()):
        try:
            conn, peer = srv.accept()
        except socket.timeout:
            continue
        except OSError:
            if stop and stop.is_set():
                break
            continue
        who = peer[0]
        with lock:
            full = per_client.get(who, 0) >= MAX_PER_CLIENT
            if not full:
                per_client[who] = per_client.get(who, 0) + 1
        if full:
            conn.close()
            continue
        if not slots.acquire(blocking=False):
            with lock:
                per_client[who] -= 1
                if not per_client[who]:
                    del per_client[who]
            conn.close()
            continue
        try:
            threading.Thread(target=run, args=(conn, who), daemon=True).start()
        except RuntimeError:   # no thread to be had: give the slot back
            with lock:
                per_client[who] -= 1
                if not per_client[who]:
                    del per_client[who]
            slots.release()
            conn.close()
    srv.close()


def addr(s, default_host):
    h, _, p = s.rpartition(":")
    return (h or default_host, int(p))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", required=True)
    ap.add_argument("--listen", default="0.0.0.0:1984")
    ap.add_argument("--upstream", default="127.0.0.1:1985")
    a = ap.parse_args()
    allowed = {h.strip().lower() for h in (os.environ.get("ALLOWED_HOSTS") or "").split(",") if h.strip()}
    try:
        serve(addr(a.listen, "0.0.0.0"), addr(a.upstream, "127.0.0.1"), Names(a.config), allowed)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
