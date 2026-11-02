"""A camera's current picture for the Manager (v2.6.0, Cameras → Live / Setup): GET /api/manage/cameras/<id>/frame.jpg.

The server asks the go2rtc it already knows — the built-in one inside the container (127.0.0.1:1985, behind no guard:
only this process reaches it) or the separate GO2RTC_URL the owner set — for `/api/frame.jpeg?src=<stream name>`. The
stream name comes from the camera list the camera sync wrote (house/protect-cameras.js), looked up by the camera's id:
never taken from a request, never sent to a browser, never logged (it isn't secret, but the go2rtc address and the
camera's own stream URL — with its password — stay on the server: go2rtc has those, this file never sees them).

Limits (the Manager's Live view asks every 1–2 s per tile):
  - at most PER_LOGIN requests in flight per login, and TOTAL across every login (more → 429, the page waits);
  - one fetch per camera at a time: a second asker waits for that answer instead of asking go2rtc again;
  - one answer per camera per CACHE_S seconds, shared by every login; answers older than KEEP_S are dropped;
  - DEADLINE_S for the whole answer (connect, headers and body: a camera trickling bytes → 504), MAX_BYTES at most,
    and it must be a JPEG; a redirect is refused (go2rtc never sends one — nothing may send this server elsewhere).
Errors are FrameError(code, words): 503 no camera video / go2rtc didn't answer, 504 too slow, 502 not a picture.

Usage: frames = Frames(http_fetch("http://127.0.0.1:1985")); frames.get(login, camera_id, stream) -> bytes
(tests: Frames(fake_fetch, clock=…) — nothing ever talks to a real camera or go2rtc)."""
import base64
import http.client
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

PER_LOGIN = 4
TOTAL = 12
CACHE_S = 1.0
KEEP_S = 10.0
DEADLINE_S = 5.0
MAX_BYTES = 4 * 1024 * 1024
CHUNK = 64 * 1024
JPEG = b"\xff\xd8"


class FrameError(Exception):
    def __init__(self, code, words):
        super().__init__(words)
        self.code = code
        self.words = words


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """go2rtc answers a picture or an error — never a redirect; one is refused (an HTTPError, a 503 below)."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def split_userinfo(url):
    """(the address without "user:password@", an Authorization header value or None). A separate go2rtc may sit behind
    a login: the server sends it as Basic auth — the page config and every log only ever see the address without it."""
    p = urllib.parse.urlsplit(url or "")
    if not p.username and not p.password:
        return url, None
    host = p.hostname or ""
    if ":" in host:
        host = f"[{host}]"
    clean = urllib.parse.urlunsplit((p.scheme, host + (f":{p.port}" if p.port else ""), p.path, p.query, p.fragment))
    cred = f"{urllib.parse.unquote(p.username or '')}:{urllib.parse.unquote(p.password or '')}"
    return clean, "Basic " + base64.b64encode(cred.encode("utf-8")).decode("ascii")


def _sock(r):
    """The socket under an http.client answer (to give each read only the time left), or None."""
    raw = getattr(getattr(r, "fp", None), "raw", None)
    return getattr(raw, "_sock", None)


def http_fetch(base):
    """fetch(stream, deadline) → bytes from <base>/api/frame.jpeg?src=<stream>: no proxy, no redirect followed, read in
    pieces until `deadline` (time.monotonic()) — TimeoutError past it, enforced for the whole answer: each read gets only
    the time left (read1: whatever has arrived, never waiting for a full piece), and a timer closes the connection at the
    deadline (a camera dripping a byte at a time can't hold a slot). base None → no camera video here."""
    if not base:
        return None
    base, auth = split_userinfo(base.rstrip("/"))
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())
    headers = {"User-Agent": "skypane-manager", **({"Authorization": auth} if auth else {})}

    def fetch(stream, deadline):
        url = f"{base}/api/frame.jpeg?{urllib.parse.urlencode({'src': stream})}"
        left = deadline - time.monotonic()
        if left <= 0:
            raise TimeoutError("frame")
        with opener.open(urllib.request.Request(url, headers=headers), timeout=left) as r:
            def cut():   # (the deadline: the connection goes, a blocked read ends)
                s = _sock(r)
                try:
                    if s is not None:
                        s.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
            timer = threading.Timer(max(0.0, deadline - time.monotonic()), cut)
            timer.daemon = True
            timer.start()
            try:
                out = bytearray()
                while True:
                    left = deadline - time.monotonic()
                    if left <= 0:
                        raise TimeoutError("frame")
                    s = _sock(r)
                    if s is not None:
                        s.settimeout(max(0.01, left))
                    try:
                        b = r.read1(CHUNK) if hasattr(r, "read1") else r.read(CHUNK)
                    except (OSError, ValueError, http.client.HTTPException):
                        if time.monotonic() >= deadline - 0.01:
                            raise TimeoutError("frame") from None
                        raise
                    if not b:
                        if time.monotonic() >= deadline - 0.01:
                            raise TimeoutError("frame")   # (cut at the deadline: not a whole picture)
                        return bytes(out)
                    out += b
                    if len(out) > MAX_BYTES:
                        return bytes(out)   # (too big: refused as "not a picture" by the caller)
            finally:
                timer.cancel()
    return fetch


class Frames:
    def __init__(self, fetch, clock=time.monotonic, per_login=PER_LOGIN, total=TOTAL, cache_s=CACHE_S, deadline=DEADLINE_S):
        self.fetch = fetch
        self.clock = clock
        self.per_login = per_login
        self.total = total
        self.cache_s = cache_s
        self.deadline = deadline
        self.lock = threading.Lock()
        self.busy = {}      # login → requests in flight
        self.cache = {}     # camera id → (when, bytes)
        self.flight = {}    # camera id → threading.Event of the fetch going on now
        self.failed = {}    # camera id → (when, FrameError) of its last fetch that failed (its waiters get the same)

    def _fresh(self, camera, now):
        hit = self.cache.get(camera)
        return hit[1] if hit and now - hit[0] < self.cache_s else None

    def get(self, login, camera, stream):
        if self.fetch is None:
            raise FrameError(503, "Camera video isn't running on this server")
        with self.lock:
            now = self.clock()
            data = self._fresh(camera, now)
            if data is not None:
                return data
            if self.busy.get(login, 0) >= self.per_login or sum(self.busy.values()) >= self.total:
                raise FrameError(429, "Too many pictures asked for at once — wait a moment")
            self.busy[login] = self.busy.get(login, 0) + 1
            wait = self.flight.get(camera)
            if wait is None:
                self.flight[camera] = threading.Event()
        try:
            if wait is not None:   # (another asker is fetching this camera: its answer, not a second request)
                wait.wait(self.deadline + 1)
                with self.lock:
                    now = self.clock()
                    data = self._fresh(camera, now)
                    err = self.failed.get(camera)
                if data is None:
                    if err and now - err[0] < self.deadline + 2:   # (the fetcher's own answer: 504 too slow, 502…)
                        raise FrameError(err[1].code, err[1].words)
                    raise FrameError(503, "The camera has no picture right now")
                return data
            return self._fetch(camera, stream)
        finally:
            with self.lock:
                n = self.busy.get(login, 1) - 1
                if n > 0:
                    self.busy[login] = n
                else:
                    self.busy.pop(login, None)
                if wait is None:
                    ev = self.flight.pop(camera, None)
                    if ev:
                        ev.set()

    def _fetch(self, camera, stream):
        try:
            return self._fetch1(camera, stream)
        except FrameError as e:
            with self.lock:
                self.failed[camera] = (self.clock(), e)
                if len(self.failed) > 200:
                    self.failed.pop(next(iter(self.failed)))
            raise

    def _fetch1(self, camera, stream):
        try:
            data = self.fetch(stream, time.monotonic() + self.deadline)
        except (socket.timeout, TimeoutError):
            raise FrameError(504, "The camera didn't send a picture in time") from None
        except urllib.error.HTTPError:
            raise FrameError(503, "The camera has no picture right now (offline, or no stream yet)") from None
        except urllib.error.URLError as e:
            if isinstance(e.reason, (socket.timeout, TimeoutError)):
                raise FrameError(504, "The camera didn't send a picture in time") from None
            raise FrameError(503, "Camera video isn't answering on this server") from None
        except (OSError, ValueError, http.client.HTTPException):
            raise FrameError(503, "Camera video isn't answering on this server") from None
        if not isinstance(data, (bytes, bytearray)) or len(data) > MAX_BYTES or not bytes(data[:2]) == JPEG:
            raise FrameError(502, "The camera sent something that isn't a picture")
        data = bytes(data)
        with self.lock:
            now = self.clock()
            self.cache[camera] = (now, data)
            for k in [k for k, (t, _) in self.cache.items() if now - t > KEEP_S]:   # (old answers go)
                self.cache.pop(k, None)
        return data
