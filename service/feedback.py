"""Send feedback (v3.0.0): a tester's report, filed as a GitHub issue through the feedback relay on
the demo server — the tester needs no GitHub account. Every login may send one.

  1. The Manager shows the form and an "About this install" block (about(): the Skypane version and build, how many
     panels / devices / cameras / logins, whether the broker is the built-in one and the bridge is up — plus, added by
     the browser: the page, browser, system, phone / tablet / desktop, theme, language). The tester sees all of it,
     can take any line out, and presses Send — nothing leaves before that.
  2. The server checks the report against the relay's schema (check(): the same rules as the relay — the demo's
     service/demo_relay.py — v 1) and POSTs it, with this install's random id, to RELAY_URL: HTTPS to that one host only,
     no redirects followed, no Origin header, 10 s at most.
  3. The relay files the issue and answers {ok, issue, url}; any other answer is told in plain words, and the Manager
     offers Copy report (the same words as text) for every failure.

Never in a report: device / room / panel / login names, addresses, host names, tokens, PINs, settings values or the
activity log — about() only counts, and the words are the tester's own (they see them before sending).
The install id: DATA_DIR/private/install-id, 32 random URL-safe characters made once; it lets the relay rate-limit one
install and group its reports (the issue shows only a hash of it).
"""
import json
import os
import re
import secrets
import ssl
import threading
import time
import unicodedata
import urllib.error
import urllib.request

# (the one place the server ever calls out to the demo host — exactly this URL, never configurable)
RELAY_URL = "https://skypane.huskyserver.us/api/feedback/report"
RELAY_HOST = "skypane.huskyserver.us"
TIMEOUT = 10
MAX_BODY = 16 * 1024
SCHEMA = 1
KINDS = ("bug", "idea", "confusing")
SEVERITY = ("blocks", "annoying", "cosmetic")
TEXT = {"title": 120, "what": 4000, "expected": 2000, "steps": 3000}
FIELDS = {"v", "install", "kind", "severity", "about", *TEXT}
ABOUT_WORDS = ("version", "build", "page", "browser", "os", "theme", "language")
ABOUT_CHOICE = {"device": ("phone", "tablet", "desktop"), "broker": ("built-in", "own")}
ABOUT_NUMBERS = ("panels", "devices", "cameras", "logins")
ABOUT_ORDER = ("version", "build", "page", "device", "browser", "os", "theme", "language", "panels", "devices", "cameras",
               "logins", "broker", "bridge")
ABOUT_WORD_RE = re.compile(r"[A-Za-z0-9 ._:/#()+,-]{1,60}")
INSTALL_RE = re.compile(r"[A-Za-z0-9_-]{16,64}")
HTML_RE = re.compile(r"</?[A-Za-z!?]|&#?[A-Za-z0-9]{1,32};")   # (a tag or an entity; "a < b" is fine)
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
# (our own, before the relay's: per login 3 in 10 minutes, the install 10 a day — of those the logins that aren't admins
# together at most 5, so an admin can always still report; a send that never reached GitHub — no answer, a 5xx — gives
# its place back. The relay has its own limits too.)
PER_LOGIN = (3, 600)
PER_INSTALL_DAY = 10
NON_ADMIN_DAY = 5


class Refused(ValueError):
    def __init__(self, msg, status=400, retry=None):
        super().__init__(msg)
        self.status, self.retry = status, retry


def _plain(v):
    return "".join(ch for ch in CONTROL.sub("", v) if unicodedata.category(ch) != "Cf")


def _text(v, limit, what, multiline):
    if v is None:
        return ""
    if not isinstance(v, str):
        raise Refused(f"{what} must be text")
    v = _plain(v.replace("\r\n", "\n").replace("\r", "\n"))
    v = v.strip() if multiline else re.sub(r"\s+", " ", v).strip()
    if len(v) > limit:
        raise Refused(f"{what}: at most {limit} characters")
    if HTML_RE.search(v):
        raise Refused(f"{what}: no HTML, please (plain words only — leave out tags like <b> and codes like &amp;)")
    return v


def _about(v):
    if v is None:
        return {}
    if not isinstance(v, dict):
        raise Refused("about must be an object")
    out = {}
    for k, x in v.items():
        if k in ABOUT_WORDS:
            if not isinstance(x, str) or not ABOUT_WORD_RE.fullmatch(x.strip() or "-"):
                raise Refused(f"about.{k}: short plain words only (at most 60)")
            out[k] = x.strip()
        elif k in ABOUT_CHOICE:
            if x not in ABOUT_CHOICE[k]:
                raise Refused(f"about.{k}: one of " + ", ".join(ABOUT_CHOICE[k]))
            out[k] = x
        elif k in ABOUT_NUMBERS:
            if isinstance(x, bool) or not isinstance(x, int) or not 0 <= x <= 100000:
                raise Refused(f"about.{k}: a whole number 0-100000")
            out[k] = x
        elif k == "bridge":
            if not isinstance(x, bool):
                raise Refused("about.bridge: true or false")
            out[k] = x
        else:
            raise Refused(f"about: unknown field {str(k)[:40]!r}")
    return {k: out[k] for k in ABOUT_ORDER if k in out}


def check(req, install):
    """The report as it will be sent (the relay's schema v1), cleaned — or Refused. `req` is the Manager's form: kind,
    title, what, expected, steps, severity, about — nothing else; the install id is added here."""
    if not isinstance(req, dict):
        raise Refused("the report must be a JSON object")
    extra = sorted(str(k)[:40] for k in req if k not in FIELDS - {"v", "install"})
    if extra:
        raise Refused("unknown field: " + ", ".join(extra))
    if req.get("kind") not in KINDS:
        raise Refused("pick what it is: a bug, an idea or something confusing")
    sev = req.get("severity")
    if sev is not None and sev not in SEVERITY:
        raise Refused("how bad: blocks, annoying or cosmetic")
    out = {"v": SCHEMA, "install": install, "kind": req["kind"]}
    for k, n in TEXT.items():
        t = _text(req.get(k), n, k, k != "title")
        if t:
            out[k] = t
    if not out.get("what"):
        raise Refused("please say what happened")
    if sev:
        out["severity"] = sev
    ab = _about(req.get("about"))
    if ab:
        out["about"] = ab
    if len(json.dumps(out, ensure_ascii=False).encode("utf-8")) > MAX_BODY:
        raise Refused("the report is too long — shorten it a little", 413)
    return out


def install_id(private_dir):
    """This install's random id (made once; 0600)."""
    p = private_dir / "install-id"
    try:
        v = p.read_text(encoding="ascii").strip()
        if INSTALL_RE.fullmatch(v):
            return v
    except (OSError, UnicodeDecodeError):
        pass
    v = secrets.token_urlsafe(24)   # (32 characters of A-Z a-z 0-9 _ -)
    private_dir.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(".install-id.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="ascii") as f:
        f.write(v + "\n")
    os.replace(tmp, p)
    return v


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):   # (never followed: the relay answers itself)
        return None


def _opener():
    # (a direct connection: no proxy from the environment — the report goes to the relay and nowhere else)
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context()))


def send(report, version="", url=RELAY_URL, opener=None):
    """POST the checked report to the relay → (status, answer dict). Never raises for the network: (0, {...}) when it
    can't be reached. HTTPS to RELAY_HOST only (a test passes its own `opener`, never another URL in use)."""
    if not url.startswith("https://" + RELAY_HOST + "/") and opener is None:
        return 0, {"ok": False, "error": "not the feedback relay"}
    body = json.dumps(report, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json", "Accept": "application/json", "User-Agent": f"Skypane/{version or 'dev'}"})
    try:
        with (opener or _opener()).open(req, timeout=TIMEOUT) as r:
            status, raw = r.status, r.read(8192)
            retry_after = r.headers.get("Retry-After")
    except urllib.error.HTTPError as e:
        status, retry_after = e.code, e.headers.get("Retry-After") if e.headers else None
        try:
            raw = e.read(8192)
        except OSError:
            raw = b""
    except (urllib.error.URLError, OSError, ValueError):
        return 0, {"ok": False, "error": "unreachable"}
    try:
        ans = json.loads(raw.decode("utf-8", "replace")) if raw else {}
    except ValueError:
        ans = {}
    if not isinstance(ans, dict):
        ans = {}
    if status in (301, 302, 303, 307, 308):
        return status, {"ok": False, "error": "the relay answered with a redirect"}
    out = {"ok": status == 201 and ans.get("ok") is True}
    if out["ok"]:
        n = ans.get("issue")
        out["issue"] = n if isinstance(n, int) and not isinstance(n, bool) and 0 < n < 10 ** 9 else None
        u = ans.get("url")
        out["url"] = u if isinstance(u, str) and re.fullmatch(r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/issues/\d{1,9}", u) else None
    else:
        err = ans.get("error")
        out["error"] = re.sub(r"[\x00-\x1f<>]", "", err)[:200] if isinstance(err, str) else ""
        retry = ans.get("retry")
        if not (isinstance(retry, int) and not isinstance(retry, bool)):
            try:
                retry = int(retry_after) if retry_after else None
            except ValueError:
                retry = None
        if isinstance(retry, int) and 0 < retry < 7 * 86400:
            out["retry"] = retry
    return status, out


class Limits:
    """Our own budget before the relay's: per login PER_LOGIN, the install PER_INSTALL_DAY a day, the logins that aren't
    admins together NON_ADMIN_DAY of it (in memory)."""

    def __init__(self, clock=time.time):
        self.clock, self.lock, self.by_login, self.all = clock, threading.Lock(), {}, []   # all: [(t, admin, token)]

    def take(self, login, admin=True):
        """(None, token) — go ahead, counted (release(token) gives it back) — or (seconds to wait, None)."""
        now = self.clock()
        with self.lock:
            mine = [x for x in self.by_login.get(login, []) if now - x[0] < PER_LOGIN[1]]
            day = [x for x in self.all if now - x[0] < 86400]
            others = [x for x in day if not x[1]]
            if len(mine) >= PER_LOGIN[0]:
                return max(1, int(PER_LOGIN[1] - (now - mine[0][0]))), None
            if len(day) >= PER_INSTALL_DAY:
                return max(1, int(86400 - (now - day[0][0]))), None
            if not admin and len(others) >= NON_ADMIN_DAY:
                return max(1, int(86400 - (now - others[0][0]))), None
            tok = object()
            self.by_login[login] = mine + [(now, admin, tok)]
            self.all = day + [(now, admin, tok)]
            return None, tok

    def release(self, tok):
        """A send that never reached GitHub (no answer, a 5xx): its place back."""
        with self.lock:
            self.all = [x for x in self.all if x[2] is not tok]
            for k, v in self.by_login.items():
                self.by_login[k] = [x for x in v if x[2] is not tok]
