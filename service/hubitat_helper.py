"""(v3.0.5) The Skypane Helper Hubitat app (hubitat/SkypaneHelper.groovy) — Skypane's side.

docs/roadmap.md "build the Skypane Helper app anyway"; mockups/V305-PLAN.md M6.

The auth path (why this one): the app on the hub starts every connection, to the Skypane address the hub's admin typed
in its settings. It links once with a one-time code an admin makes in the Manager (Integrations → Hubitat → Link the
Helper: 8 characters, 10 minutes; (v3.0.5) an address is locked out after IP_WRONG wrong tries in IP_WINDOW,
and the code is cancelled after MAX_WRONG wrong tries in all) and gets a token of its own (32 random bytes);
Skypane keeps only the token's SHA-256 (private/hubitat-helper.json). Every later request carries it (Authorization:
Bearer). (v3.0.5) The link also hands the app a per-link HMAC key (32 random bytes, trust on first use): Skypane
keeps it the way it keeps the LED agents' tokens (plain in private/, 0600 — it has to sign with it), never logs it and
never shows it; every update offer in a poll ({id, what, version, sha256, path}) is signed with it (HMAC-SHA256,
sign_offer), and the app checks the signature (constant time) before it downloads anything. No long-lived signing key
exists anywhere: a new link makes a new key. So:
  - Skypane holds no hub credential at all: not the Maker API's (that stays the bridge's), no app OAuth token, never the
    hub login (that stays in the app's settings on the hub and is only sent to 127.0.0.1 there);
  - nothing new is opened on the hub (no OAuth endpoint to enable, nothing Skypane can call);
  - the Maker API path can't carry it: it can't hand a device list of this size (an attribute value is short), and
    "Update the driver" would need a command the bridge sends to a device of the app's — more parts, the same trust.
"Update the driver" is a request the app picks up on its next poll (every minute); the app checks the offer's signature,
fetches the code from the public /hubitat/*.groovy files, checks it against the signed sha256 and that it declares
namespace "skypane" and the expected name, and only then saves it. (v3.0.5) A 401 / 403 to a poll unlinks the
app (it then needs a new link code: docs/help.md).

Endpoints (server.py, POST — the hub's asynchttpPost — and GET):
  POST /api/hubitat/helper/link    {code, version, hub}           → {token, key}      (open, rate-limited per address)
  GET  /api/hubitat/helper/poll                                   → {v, driver, app, request, offer}   (token)
  POST /api/hubitat/helper/report  {v, version, devices, notifiers, …}  → {ok}         (token)
  POST /api/hubitat/helper/result  {id, what, ok, error, version}  → {ok}              (token)
State (private/hubitat-helper.json, 0600; the token only as its hash, (v3.0.5) the HMAC key plain): tokenHash, key, linkedAt, linkedFrom, appVersion, hub, firmware,
lastReport, lastPoll, devices {id: {p, src, last, health, disabled}}, notifiers, login, manual, request, result.
"""
import hashlib
import hmac
import json
import os
import pathlib
import re
import secrets
import threading
import time

HUBITAT = pathlib.Path(__file__).resolve().parent.parent / "hubitat"
APP = HUBITAT / "SkypaneHelper.groovy"
DRIVER = HUBITAT / "SkypaneNotifier.groovy"
APP_PATH = "/hubitat/SkypaneHelper.groovy"
DRIVER_PATH = "/hubitat/SkypaneNotifier.groovy"
_IN_APP = re.compile(r'APP_VERSION\s*=\s*"(\d{1,3}(?:\.\d{1,4}){1,3})"')
_IN_DRIVER = re.compile(r'DRIVER_VERSION\s*=\s*"(\d{1,3}(?:\.\d{1,4}){1,3})"')
VERSION = re.compile(r"\d{1,3}(?:\.\d{1,4}){1,3}")
CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"   # (no 0 O 1 I L: read off a screen, typed on another)
CODE_LEN = 8
CODE_SECONDS = 600
MAX_WRONG = 20            # (v3.0.5) wrong tries in all before the code is cancelled …
IP_WRONG = 5              # … but one address is locked out after this many …
IP_WINDOW = 600           # … within this many seconds (one address alone can't cancel the code for everyone)
KEY_RE = re.compile(r"[A-Za-z0-9_-]{43,100}")   # (v3.0.5) the per-link HMAC key (token_urlsafe(32))
OFFER_TAG = "skypane-helper-offer-v1"            # (v3.0.5) the signed text starts with it (offer_text)
TOKEN_RE = re.compile(r"[A-Za-z0-9_-]{40,100}")
PROTOCOLS = ("zigbee", "zwave", "matter", "lan", "app", "virtual", "unknown")
SOURCES = ("controllerType", "zigbeeId", "data", "dni", "type", "parent", "none")
HEALTH = ("online", "offline")
MAX_DEVICES = 500
ONLINE_SECONDS = 180       # a poll within this long: the app is running
REQUEST_SECONDS = 900      # an "Update the driver" not picked up within this long is dropped
WHATS = ("driver", "app", "notifier")
ERRORS = ("login", "endpoint", "sha", "download", "badRequest", "notfound")
# (the rate limits, per address / per minute — server.py uses App.rate)
LINK_RATE = 10
POLL_RATE = 12
REPORT_RATE = 6
RESULT_RATE = 10

_cache = {}


def _version_in(path, rx):
    try:
        st = path.stat()
        sig = (str(path), st.st_mtime_ns, st.st_size)
        if _cache.get(str(path), {}).get("sig") != sig:
            data = path.read_bytes()
            m = rx.search(data.decode("utf-8", errors="replace"))
            _cache[str(path)] = {"sig": sig, "v": m[1] if m else None, "sha": hashlib.sha256(data).hexdigest()}
        return _cache[str(path)]
    except OSError:
        return None


def bundled(path=APP):
    """The Helper app version Skypane serves (its APP_VERSION) — None when the file can't be read."""
    got = _version_in(path, _IN_APP)
    return got["v"] if got else None


def code_info(what, app=APP, driver=DRIVER):
    """{"version", "sha256", "path"} of the code Skypane serves for "app" or "driver" — None when missing. The sha256 is
    of the file's bytes as served (the app checks the text it downloads against it)."""
    got = _version_in(app, _IN_APP) if what == "app" else _version_in(driver, _IN_DRIVER)
    if not got or not got["v"]:
        return None
    return {"version": got["v"], "sha256": got["sha"], "path": APP_PATH if what == "app" else DRIVER_PATH}


# (v3.0.5) Hubitat Package Manager's manifest: fixed package ids (HPM tells packages apart by them), this Skypane's
# address in the locations (server.py fills it from the request's Host). hubitat/packageManifest.json is the same for
# the public repository.
HPM_APP_ID = "6d1c2f7e-5b8a-4f3e-9a51-3c0b2e7d9a11"
HPM_DRIVER_ID = "0b9e4c3a-2d71-4e8f-b6a5-7f1d0c9e8b22"


def release_date(release=None):
    """(v3.0.5) The manifest's dateReleased: the day service/RELEASE was last changed (it is raised with every
    release), else the app file's — never a date written in the code. "YYYY-MM-DD"."""
    for p in (pathlib.Path(release) if release else HUBITAT.parent / "service" / "RELEASE", APP):
        try:
            return time.strftime("%Y-%m-%d", time.gmtime(p.stat().st_mtime))
        except OSError:
            continue
    return time.strftime("%Y-%m-%d", time.gmtime())


def base_url(host, client_ip, headers, trusted=None):
    """(v3.0.5) The address the manifest's locations use: the request's own scheme (Skypane itself serves plain
    http), or X-Forwarded-Proto ("http" | "https" only) when the request came through a trusted proxy — one on this
    machine (a loopback address) or one listed in TRUSTED_PROXIES (comma-separated addresses). None for an odd Host."""
    host = str(host or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9.-]{1,253}(?::\d{1,5})?|\[[0-9A-Fa-f:.]{2,45}\](?::\d{1,5})?", host):
        return None
    if trusted is None:
        trusted = {t.strip() for t in os.environ.get("TRUSTED_PROXIES", "").split(",") if t.strip()}
    ip = str(client_ip or "")
    if ip.startswith("::ffff:"):
        ip = ip[7:]
    scheme = "http"
    fwd = str(headers.get("X-Forwarded-Proto") or "").split(",")[0].strip().lower()
    if fwd in ("http", "https") and (ip == "::1" or ip.startswith("127.") or ip in trusted):
        scheme = fwd
    return f"{scheme}://{host}"


def manifest(base, app, driver, released=None):
    return {"packageName": "Skypane", "author": "Skypane", "version": app["version"], "minimumHEVersion": "2.3.0",
            "dateReleased": released or release_date(), "documentationLink": base + "/", "licenseFile": "",
            "releaseNotes": "The Skypane Helper app and the Skypane Notifier driver, served by your Skypane.",
            "apps": [{"id": HPM_APP_ID, "name": "Skypane Helper", "namespace": "skypane", "location": base + app["path"],
                      "required": False, "oauth": False, "primary": True, "version": app["version"]}],
            "drivers": [{"id": HPM_DRIVER_ID, "name": "Skypane Notifier", "namespace": "skypane", "location": base + driver["path"],
                         "required": True, "version": driver["version"]}]}


def _key(v):
    return tuple(int(x) for x in v.split("."))


def app_state(want, have):
    """(like notifier_driver.state) "ok" | "old" | "unknown" (no report yet) — None when Skypane serves none."""
    if not want:
        return None
    if not have:
        return "unknown"
    return "old" if _key(have) < _key(want) else "ok"


def _hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def offer_text(offer):
    """(v3.0.5) The exact text an update offer's signature covers (the app builds the same: SkypaneHelper.groovy
    offerText): the tag, then id, what, version, sha256 and path, one per line ("" for a missing one)."""
    return "\n".join([OFFER_TAG] + [str(offer.get(k) or "") for k in ("id", "what", "version", "sha256", "path")])


def sign_offer(key, offer):
    """(v3.0.5) HMAC-SHA256 of offer_text under the link's key, lowercase hex."""
    return hmac.new(key.encode("utf-8"), offer_text(offer).encode("utf-8"), hashlib.sha256).hexdigest()


def verify_offer(key, offer, sig):
    """(v3.0.5) The app's check (constant time), here for the tests: the same rules."""
    return isinstance(sig, str) and isinstance(key, str) and hmac.compare_digest(sign_offer(key, offer), sig)


def _int_id(v):
    return v if isinstance(v, int) and not isinstance(v, bool) and 0 < v < 10 ** 9 else None


def clean_report(body):
    """A report body → the parts kept, or None when it isn't one. Unknown values become "unknown" / None."""
    if not isinstance(body, dict) or body.get("v") != 1 or not isinstance(body.get("devices"), list):
        return None
    devs = {}
    for d in body["devices"][:MAX_DEVICES]:
        if not isinstance(d, dict) or not _int_id(d.get("id")):
            continue
        last = d.get("last")
        devs[str(d["id"])] = {
            "p": d.get("p") if d.get("p") in PROTOCOLS else "unknown",
            "src": d.get("src") if d.get("src") in SOURCES else "none",
            "last": int(last // 1000) if isinstance(last, (int, float)) and not isinstance(last, bool) and 0 < last < 10 ** 14 else None,
            "health": d.get("health") if d.get("health") in HEALTH else None,
            "disabled": d.get("disabled") is True}
    nts = []
    for n in (body.get("notifiers") or [])[:10] if isinstance(body.get("notifiers"), list) else []:
        if isinstance(n, dict) and _int_id(n.get("id")):
            v = n.get("version")
            nts.append({"id": n["id"], "version": v if isinstance(v, str) and VERSION.fullmatch(v) else None})
    text = lambda v, n: v[:n] if isinstance(v, str) and v.isprintable() else ""   # noqa: E731
    ver = body.get("version")
    return {"devices": devs, "notifiers": nts, "appVersion": ver if isinstance(ver, str) and VERSION.fullmatch(ver) else None,
            "hub": text(body.get("hub"), 60), "firmware": text(body.get("firmware"), 30),
            "login": body.get("login") is True, "manual": body.get("manual") is True}


class Helper:
    """The link, the last report and the update request. Thread-safe; saved after each change."""

    def __init__(self, private_dir, clock=time.time):
        self.path = pathlib.Path(private_dir) / "hubitat-helper.json"
        self.clock = clock
        self.lock = threading.Lock()
        self.code = None          # {"hash", "until", "wrong"} — the one-time link code (memory only)
        self.wrong_at = {}        # (v3.0.5) {address: [times of its wrong tries]} — memory only
        self.doc = self._load()

    def _load(self):
        try:
            d = json.loads(self.path.read_text(encoding="utf-8"))
            return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            return {}

    def _save(self):
        # (v3.0.5: it holds the link's HMAC key — created 0600 and atomic, as panel_devices._write_json)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(f".{self.path.name}.{secrets.token_hex(6)}.tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(self.doc, separators=(",", ":")))
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    # ---- linking ----
    def new_code(self):
        """An admin asked to link: a new one-time code (the old one stops). Returned once, never stored in plain."""
        code = "".join(secrets.choice(CODE_CHARS) for _ in range(CODE_LEN))
        with self.lock:
            self.code = {"hash": _hash(code), "until": self.clock() + CODE_SECONDS, "wrong": 0}
        return code

    def cancel_code(self):
        """(v3.0.5, tester) The admin's Cancel: the link code stops now (unused) → whether one was open."""
        with self.lock:
            was = bool(self.code and self.clock() < self.code["until"])
            self.code = None
        return was

    def code_open(self):
        with self.lock:
            return bool(self.code and self.clock() < self.code["until"])

    def link(self, code, ip, version=None, hub=None):
        """The app's link request → (its new token, its HMAC key, None), or (None, None, an error word): "no-code" |
        "wrong" | "expired" | "locked" (v3.0.5: this address had IP_WRONG wrong tries within IP_WINDOW — the code
        stays open for the others; only MAX_WRONG wrong tries in all cancel it)."""
        code = re.sub(r"[\s-]", "", code).upper() if isinstance(code, str) else ""
        ip = str(ip)[:45]
        with self.lock:
            now = self.clock()
            c = self.code
            if not c:
                return None, None, "no-code"
            if now >= c["until"]:
                self.code = None
                return None, None, "expired"
            tries = [t for t in self.wrong_at.get(ip, []) if now - t < IP_WINDOW]
            if len(tries) >= IP_WRONG:
                self.wrong_at[ip] = tries
                return None, None, "locked"
            if not (len(code) == CODE_LEN and hmac.compare_digest(_hash(code), c["hash"])):
                c["wrong"] += 1
                self.wrong_at[ip] = tries + [now]
                if len(self.wrong_at) > 1000:   # (bounded: the addresses heard from longest ago go)
                    for k in sorted(self.wrong_at, key=lambda k: max(self.wrong_at[k] or [0]))[:500]:
                        self.wrong_at.pop(k, None)
                if c["wrong"] >= MAX_WRONG:
                    self.code = None
                return None, None, "wrong"
            self.code = None
            self.wrong_at = {}
            token, key = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
            self.doc = {"tokenHash": _hash(token), "key": key, "linkedAt": int(now), "linkedFrom": ip,
                        "appVersion": version if isinstance(version, str) and VERSION.fullmatch(version) else None,
                        "hub": hub[:60] if isinstance(hub, str) and hub.isprintable() else ""}
            self._save()
            return token, key, None

    def unlink(self):
        with self.lock:
            had = bool(self.doc.get("tokenHash"))
            self.doc, self.code = {}, None
            self._save()
            return had

    def auth(self, header):
        """The request's "Authorization: Bearer <token>" is this link's token."""
        m = re.fullmatch(r"Bearer ([A-Za-z0-9_-]{40,100})", (header or "").strip())
        with self.lock:
            h = self.doc.get("tokenHash")
        return bool(m and isinstance(h, str) and hmac.compare_digest(_hash(m[1]), h))

    def linked(self):
        with self.lock:
            return bool(self.doc.get("tokenHash"))

    # ---- what the app says ----
    def report(self, body):
        r = clean_report(body)
        if r is None:
            return False
        with self.lock:
            self.doc.update(r, lastReport=int(self.clock()))
            self._save()
        return True

    def poll(self, app=APP, driver=DRIVER):
        """The poll's answer: the newest code Skypane serves, and an update request (only once it's due). (v3.0.5
        review) offer: the request as the app acts on it — {id, what, version, sha256, path, sig}, signed with the link's
        key (sign_offer); None without a request, or for a link without a key (made before the key: relink — link again)."""
        now = self.clock()
        with self.lock:
            self.doc["lastPoll"] = int(now)
            req = self.doc.get("request")
            if req and now - req.get("at", 0) > REQUEST_SECONDS:
                self.doc.pop("request", None)
                self.doc["result"] = {"id": req["id"], "what": req["what"], "ok": False, "error": "timeout", "at": int(now)}
                req = None
            self._save()
            key = self.doc.get("key")
        drv, ap = code_info("driver", app, driver), code_info("app", app, driver)
        offer = None
        if req and isinstance(key, str) and KEY_RE.fullmatch(key):   # (v3.0.5) signed
            item = (ap if req["what"] == "app" else drv if req["what"] == "driver" else None) or {}
            offer = {"id": req["id"], "what": req["what"], "version": item.get("version") or "",
                     "sha256": item.get("sha256") or "", "path": item.get("path") or ""}
            offer["sig"] = sign_offer(key, offer)
        return {"v": 1, "driver": drv, "app": ap, "request": {"id": req["id"], "what": req["what"]} if req else None,
                "offer": offer, **({"relink": True} if req and not offer else {})}

    def result(self, body):
        if not isinstance(body, dict) or not isinstance(body.get("id"), str):
            return False
        with self.lock:
            req = self.doc.get("request")
            if not req or not hmac.compare_digest(body["id"], req["id"]):
                return False
            v = body.get("version")
            self.doc["result"] = {"id": req["id"], "what": req["what"], "ok": body.get("ok") is True,
                                  "error": body.get("error") if body.get("error") in ERRORS else (None if body.get("ok") is True else "endpoint"),
                                  "version": v if isinstance(v, str) and VERSION.fullmatch(v) else None, "at": int(self.clock())}
            self.doc.pop("request", None)
            self._save()
        return True

    # ---- the Manager ----
    def request(self, what):
        """An admin tapped "Update the driver" (or the app, or "Create the Notifier"). False when not linked."""
        if what not in WHATS:
            raise ValueError(what)
        with self.lock:
            if not self.doc.get("tokenHash"):
                return None
            rid = secrets.token_hex(6)
            self.doc["request"] = {"id": rid, "what": what, "at": int(self.clock())}
            self._save()
            return rid

    def protocols(self):
        """{device id: protocol} for Devices → Detailed (only what the app reported; "unknown" left out)."""
        with self.lock:
            return {k: v["p"] for k, v in (self.doc.get("devices") or {}).items() if isinstance(v, dict) and v.get("p") in PROTOCOLS and v["p"] != "unknown"}

    def status(self, app=APP, driver=DRIVER):
        """Integrations → Hubitat's Helper rows. Never the token, its hash or (v3.0.5) the key."""
        now = self.clock()
        with self.lock:
            d = dict(self.doc)
            code_open = bool(self.code and now < self.code["until"])
        want = bundled(app)
        if not d.get("tokenHash"):
            return {"linked": False, "codeOpen": code_open, "want": want, "importPath": APP_PATH}
        counts = {}
        for v in (d.get("devices") or {}).values():
            counts[v.get("p", "unknown")] = counts.get(v.get("p", "unknown"), 0) + 1
        res = d.get("result")
        return {"linked": True, "codeOpen": code_open, "linkedAt": d.get("linkedAt"), "linkedFrom": d.get("linkedFrom"),
                "hub": d.get("hub") or "", "firmware": d.get("firmware") or "",
                "online": bool(d.get("lastPoll") and now - d["lastPoll"] < ONLINE_SECONDS), "lastPoll": d.get("lastPoll"),
                "lastReport": d.get("lastReport"), "have": d.get("appVersion"), "want": want,
                "appState": app_state(want, d.get("appVersion")), "devices": len(d.get("devices") or {}), "protocols": counts,
                "login": d.get("login") is True, "request": d.get("request"), "result": res,
                # ("Update required": the hub refused the new code — the import address, to do it by hand)
                "updateRequired": bool((res and res.get("error") == "endpoint") or d.get("manual") is True),
                "importPath": APP_PATH, "driverPath": DRIVER_PATH}

    def notifiers(self):
        """The Notifier versions the app reported (as the bridge's report: [{id, version}]) — None when none came."""
        with self.lock:
            n = self.doc.get("notifiers")
        return n if isinstance(n, list) else None
