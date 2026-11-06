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
exists anywhere: a new link makes a new key. So (3.0.5; (v3.0.7) the first two changed: see the end):
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

(v3.0.7) The Helper becomes the hub link, in place of Maker API (mockups/prototypes/helper-setup-307.html, helper-switch-307.html):
  - The app makes its own access token on the hub (createAccessToken: OAuth must be on for the app — the Package Manager
    manifest sets "oauth": true; by hand, Apps Code → Skypane Helper → OAuth) and serves Maker API's own paths at the
    hub's address: http://<hub>/apps/api/<app id>/devices/all, devices/<id>, devices/<id>/<command>[/<args>], modes,
    modes/<id>, hsm, hsm/<action>, ping — the same JSON shapes, so the bridge's Maker class reads them unchanged. Only the
    devices picked in the app (and its own child Notifier) are there; a command must be one the device lists.
  - The access token, the app id and the hub's address go to Skypane ONCE, at link time (or after OAuth is turned on),
    over the link: POST /api/hubitat/helper/hublink with the link's token, signed with the link's HMAC key
    (hublink_text). Skypane keeps them in private/hubitat-hublink.json (0600, as private/settings.json keeps the Maker
    API token); never logged, never in any answer (status() says only whether it has one).
  - Which link the bridge uses (hub_link): the Helper's once it has a hub link and either the admin switched to it or
    no Maker API is set up; else Maker API. Never a fallback: when the Helper stops answering, the bridge says so (its
    status file) and the Manager shows a problem — it never moves to Maker API by itself. (v3.0.7 review) The admin's
    switch is its own file (private/hubitat-hublink-use.json), so a new app id, an unreadable link file or an unlink
    leaves it on: "no hub link", never Maker API. The same hub link handed over again rewrites nothing.
  - (v3.0.7 review) The app's updated() sends a report with "resync": true; Skypane touches private/hubitat-resync.json
    (no secret in it) and the bridge, which watches it, reads the device list again.
  - Events: the bridge keeps the hub's own event socket (ws://<hub>/eventsocket), filtered to the Helper's devices.
    (Why: the socket is the hub's own push, already proven in the bridge, with reconnect + resync on every reconnect;
    subscriptions posting batches to Skypane would add a second path that loses events whenever Skypane restarts or the
    hub's async posts queue up, and would cost hub CPU for every event.)
  - The Notifier: right after the first report with no Notifier at all, Skypane asks the app once (a signed "notifier"
    offer, carrying the driver's sha256) to make the Skypane Notifier as its own child device; when the driver code is
    missing, the app saves it first (/driver/save, checked like an update). Without the hub login (Hub Login Security on)
    that fails with "login" and the Manager shows the steps by hand.
  - The hub's device count: the app reads the hub's own device list (/hub2/devicesList, read only, on 127.0.0.1 — with
    the hub login when one is typed) and reports how many devices the hub has and which ones it wasn't given (up to
    MAX_MISSING names). When that page can't be read (no login on a hub with Hub Login Security, or a hub update changed
    it), the count is left out and the Manager says it can't count. Nothing is ever added to the app by itself.
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
ERRORS = ("login", "endpoint", "sha", "download", "badRequest", "notfound",
          "dni", "child")   # (v3.0.7 review) the Notifier device: its network id taken / another addChildDevice error
# (the rate limits, per address / per minute — server.py uses App.rate)
LINK_RATE = 10
POLL_RATE = 12
REPORT_RATE = 6
RESULT_RATE = 10
HUBLINK_RATE = 6          # (v3.0.7)
# (v3.0.7) the hub link (private/hubitat-hublink.json): the app's access token, its app id, the hub's address
HUBLINK_FILE = "hubitat-hublink.json"
# (v3.0.7) the admin's "use the Helper" switch, kept apart from the link file: a new app id (a reinstall), an unreadable
# link file or an unlink never turns it off (never a fallback to Maker API: "no hub link" instead)
HUBLINK_USE_FILE = "hubitat-hublink-use.json"
# (v3.0.7) the Helper's updated() asks for a resync (its device list changed): the bridge watches this file's signature
RESYNC_FILE = "hubitat-resync.json"
HUBLINK_TAG = "skypane-helper-hublink-v1"         # the signed text starts with it (hublink_text; the app's hubLinkText)
HUB_TOKEN_RE = re.compile(r"[A-Za-z0-9-]{20,100}")   # (Hubitat's access tokens are UUIDs)
IPV4_RE = re.compile(r"(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})")
MAX_MISSING = 50          # (v3.0.7) the hub's devices the app wasn't given: at most this many names kept

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
                      # (v3.0.7) OAuth on: the app makes its own access token (Package Manager turns it on for it)
                      # (v3.0.7) required: the app is the hub link now (the per-component "version" keys are in HPM's schema)
                      "required": True, "oauth": True, "primary": True, "version": app["version"]}],
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


def hublink_text(app_id, host, token):
    """(v3.0.7) The exact text the hub link's signature covers (the app builds the same: SkypaneHelper.groovy
    hubLinkText): the tag, then the app id, the hub's address and the access token, one per line."""
    return "\n".join([HUBLINK_TAG, str(app_id), str(host), str(token)])


def sign_hublink(key, app_id, host, token):
    """(v3.0.7) HMAC-SHA256 of hublink_text under the link's key, lowercase hex (here for the tests and the check)."""
    return hmac.new(key.encode("utf-8"), hublink_text(app_id, host, token).encode("utf-8"), hashlib.sha256).hexdigest()


def hub_ip_ok(host):
    """(v3.0.7) The hub's address as the app reports it (location.hub.localIP): a plain IPv4 address, each part 0–255."""
    m = IPV4_RE.fullmatch(host) if isinstance(host, str) else None
    return bool(m) and all(int(x) <= 255 for x in m.groups())


def _write_private(path, doc):
    """(v3.0.7) A JSON file in private/: created 0600 and atomic (as Helper._save)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{secrets.token_hex(6)}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(doc, separators=(",", ":")))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def read_hublink(private_dir):
    """(v3.0.7) The hub link the app handed over — {"v", "appId", "host", "token", "at"} — or None (none, or not
    well-formed). The token is a secret: never logged, never sent to a browser. (The admin's switch: read_use.)"""
    try:
        d = json.loads((pathlib.Path(private_dir) / HUBLINK_FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return None
    if not isinstance(d, dict) or d.get("v") != 1 or not _int_id(d.get("appId")) or not hub_ip_ok(d.get("host")) \
            or not isinstance(d.get("token"), str) or not HUB_TOKEN_RE.fullmatch(d["token"]):
        return None
    return {"v": 1, "appId": d["appId"], "host": d["host"], "token": d["token"], "at": d.get("at") if isinstance(d.get("at"), int) else None}


def read_use(private_dir):
    """(v3.0.7) The admin's switch: True once "Switch to the Helper" was pressed (or the Helper became the link with no
    Maker API set up), until "Use Maker API again". Fails closed: a switch file that is there but can't be read is True
    (the bridge then reports "no hub link" rather than moving to Maker API)."""
    try:
        d = json.loads((pathlib.Path(private_dir) / HUBLINK_USE_FILE).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return False
    except (OSError, ValueError, TypeError):
        return True
    return not (isinstance(d, dict) and d.get("use") is False)


def maker_set(env):
    """(v3.0.7) Maker API is set up: its address, app number and token are all there (`env`: the house settings or the
    environment)."""
    return all((env.get(k) or "").strip() for k in ("HUBITAT_HOST", "HUBITAT_APP_ID", "HUBITAT_TOKEN"))


def hub_link(private_dir, env):
    """(v3.0.7) The hub link the bridge uses: {"via": "helper", "host", "app", "token"} — the Helper's, once it handed
    one over and either the admin switched to it (read_use) or no Maker API is set up —, {"via": "maker", …} from the
    Maker API settings, or {"via": None} ("reason": "no-hub-link" when the switch is on without a readable hub link).
    Never a fallback: once switched, a Helper that stops answering, a new app id, an unreadable link file or an unlink
    never puts the bridge back on Maker API — only "Use Maker API again" does."""
    hl = read_hublink(private_dir) if private_dir else None
    use = read_use(private_dir) if private_dir else False
    if use and not hl:
        return {"via": None, "reason": "no-hub-link"}
    if hl and (use or not maker_set(env)):
        return {"via": "helper", "host": hl["host"], "app": str(hl["appId"]), "token": hl["token"]}
    if maker_set(env):
        return {"via": "maker", "host": env["HUBITAT_HOST"].strip(), "app": env["HUBITAT_APP_ID"].strip(), "token": env["HUBITAT_TOKEN"].strip()}
    return {"via": None}


def _file_sig(path):
    try:
        st = path.stat()
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None


def hublink_sig(private_dir):
    """(v3.0.7) The hub link's signature: the link file's and the switch file's (run_all restarts the services when it
    changes; it reads it before they start, as the settings file's)."""
    d = pathlib.Path(private_dir)
    return (_file_sig(d / HUBLINK_FILE), _file_sig(d / HUBLINK_USE_FILE))


def resync_sig(private_dir):
    """(v3.0.7) The resync request's signature (the bridge resyncs when it changes) — None without one."""
    return _file_sig(pathlib.Path(private_dir) / RESYNC_FILE)


def _set_use(private_dir, use):
    """(v3.0.7) Switch from Maker API (True) or back (False) — call it under the Helper's lock (Helper.set_use). Switching
    to the Helper needs a hub link (False without one); going back to Maker API doesn't."""
    if use and not read_hublink(private_dir):
        return False
    _write_private(pathlib.Path(private_dir) / HUBLINK_USE_FILE, {"v": 1, "use": bool(use)})
    return True


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
            # (v3.0.7) child: the app's own child device (it made it)
            nts.append({"id": n["id"], "version": v if isinstance(v, str) and VERSION.fullmatch(v) else None,
                        **({"child": True} if n.get("child") is True else {})})
    text = lambda v, n: v[:n] if isinstance(v, str) and v.isprintable() else ""   # noqa: E731
    count = lambda v: v if isinstance(v, int) and not isinstance(v, bool) and 0 <= v < 100000 else None   # noqa: E731
    ver = body.get("version")
    # (v3.0.7) the hub's devices the app wasn't given ({id, name}, at most MAX_MISSING); None when the app couldn't count
    miss = None
    if isinstance(body.get("missing"), list):
        miss = [{"id": m["id"], "name": text(m.get("name"), 60) or f"#{m['id']}"} for m in body["missing"][:MAX_MISSING]
                if isinstance(m, dict) and _int_id(m.get("id"))]
    tri = lambda v: v if isinstance(v, bool) else None   # noqa: E731
    return {"devices": devs, "notifiers": nts, "appVersion": ver if isinstance(ver, str) and VERSION.fullmatch(ver) else None,
            "hub": text(body.get("hub"), 60), "firmware": text(body.get("firmware"), 30),
            "login": body.get("login") is True, "manual": body.get("manual") is True,
            # (v3.0.7) OAuth on for the app (it has its access token) · how many devices the hub has / the app was given ·
            # Hub Login Security on (None: unknown)
            "oauth": tri(body.get("oauth")), "hubCount": count(body.get("hubCount")) if miss is not None else None,
            "given": count(body.get("given")), "missing": miss, "secured": tri(body.get("secured"))}


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
            # (v3.0.7) and the hub link it handed over (its access token): a new link hands a new one. The admin's switch
            # (HUBLINK_USE_FILE) stays: with it on, the bridge reports "no hub link" — never Maker API.
            try:
                (self.path.parent / HUBLINK_FILE).unlink()
            except OSError:
                pass
            return had

    # ---- (v3.0.7) the hub link: the app's access token, app id and the hub's address, once, signed ----
    def hublink(self, body):
        """The app hands over its hub link {appId, host, token, sig} (sig: sign_hublink under this link's key) → None
        (kept) or an error word: "no-key" (a link made before 3.0.5's key: link again) | "bad" (not well-formed) |
        "bad-signature". Kept in private/hubitat-hublink.json (0600); the token is never logged or returned."""
        if not isinstance(body, dict):
            return "bad"
        app_id, host, token, sig = body.get("appId"), body.get("host"), body.get("token"), body.get("sig")
        if not _int_id(app_id) or not hub_ip_ok(host) or not isinstance(token, str) or not HUB_TOKEN_RE.fullmatch(token) \
                or not isinstance(sig, str) or not re.fullmatch(r"[0-9a-f]{64}", sig):
            return "bad"
        with self.lock:
            key = self.doc.get("key")
            if not (isinstance(key, str) and KEY_RE.fullmatch(key)):
                return "no-key"
            if not hmac.compare_digest(sign_hublink(key, app_id, host, token), sig):
                return "bad-signature"
            old = read_hublink(self.path.parent)
            # (v3.0.7) the same app id, address and token again: nothing is rewritten, so nothing restarts
            if old and old["appId"] == app_id and old["host"] == host and old["token"] == token:
                return None
            # (v3.0.7) the admin's switch is its own file: a new app id (a reinstall) keeps it — never back to Maker API
            _write_private(self.path.parent / HUBLINK_FILE, {"v": 1, "appId": app_id, "host": host, "token": token,
                                                              "at": int(self.clock())})
            self.doc["hubLinkAt"] = int(self.clock())
            self.doc.pop("switchTest", None)
            self._save()
        return None

    def set_use(self, use):
        """(v3.0.7) The admin's switch (_set_use), under this Helper's lock (as hublink and unlink)."""
        with self.lock:
            return _set_use(self.path.parent, use)

    def hublink_info(self):
        """(v3.0.7) What the Manager may know of the hub link: {"set", "at", "use", "host", "appId"}, never the token.
        "use": the admin's switch (read_use)."""
        hl = read_hublink(self.path.parent)
        return {"set": bool(hl), "at": hl["at"] if hl else None, "use": read_use(self.path.parent),
                "host": hl["host"] if hl else None, "appId": hl["appId"] if hl else None}

    def hub_linked_once(self):
        """(v3.0.7) This link's Helper handed over a hub link at some time (hubLinkAt) — an unlink forgets it."""
        with self.lock:
            return isinstance(self.doc.get("hubLinkAt"), int)

    def hide_new(self, ids):
        """(v3.0.7) "Don't show these": the warning about the hub's devices the Helper wasn't given leaves these out
        (it shows again for devices added after this)."""
        ids = sorted({i for i in ids if _int_id(i)})[:2000] if isinstance(ids, list) else []
        with self.lock:
            self.doc["hiddenNew"] = sorted(set(self.doc.get("hiddenNew") or []) | set(ids))[-2000:]
            self._save()
        return len(ids)

    def set_test(self, test):
        """(v3.0.7) The Switch card's one-device test: {"ok", "at", "device"}, or None (forgotten: a new switch)."""
        with self.lock:
            if test is None:
                self.doc.pop("switchTest", None)
            else:
                self.doc["switchTest"] = test
            self._save()

    def test(self):
        with self.lock:
            t = self.doc.get("switchTest")
        return dict(t) if isinstance(t, dict) else None

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
            # (v3.0.7) the app's updated() (its devices were picked again): the bridge reads the device list again
            if isinstance(body, dict) and body.get("resync") is True:
                _write_private(self.path.parent / RESYNC_FILE, {"v": 1, "at": int(self.clock()), "n": secrets.token_hex(4)})
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
            # (v3.0.7) automatic setup: the first report with no Notifier at all → once, "make the Notifier" (the app saves
            # the driver code first when it's missing). "Check again" in the Manager asks again (request("notifier")).
            if not req and self.doc.get("lastReport") and not self.doc.get("notifiers") and not self.doc.get("autoNotifier"):
                self.doc["autoNotifier"] = int(now)
                req = self.doc["request"] = {"id": secrets.token_hex(6), "what": "notifier", "at": int(now), "auto": True}
            self._save()
            key = self.doc.get("key")
            has_link = bool(read_hublink(self.path.parent))
        drv, ap = code_info("driver", app, driver), code_info("app", app, driver)
        offer = None
        if req and isinstance(key, str) and KEY_RE.fullmatch(key):   # (v3.0.5) signed
            # (v3.0.7) "notifier" carries the driver: the app installs it first when it's missing
            item = (ap if req["what"] == "app" else drv if req["what"] in ("driver", "notifier") else None) or {}
            offer = {"id": req["id"], "what": req["what"], "version": item.get("version") or "",
                     "sha256": item.get("sha256") or "", "path": item.get("path") or ""}
            offer["sig"] = sign_offer(key, offer)
        # (v3.0.7) hubLink: whether Skypane has the app's hub link (an app with its token sends it again when not)
        return {"v": 1, "driver": drv, "app": ap, "request": {"id": req["id"], "what": req["what"]} if req else None,
                "offer": offer, "hubLink": has_link, **({"relink": True} if req and not offer else {})}

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
            d = body.get("detail")   # (v3.0.7 review) the hub's own words for a failed Notifier device (printable, short)
            if isinstance(d, str) and d.isprintable() and d.strip() and self.doc["result"]["error"] in ("dni", "child"):
                self.doc["result"]["detail"] = d.strip()[:160]
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
        # (v3.0.7) the hub link (never its token), the Notifier the app made, the hub's devices it wasn't given
        nts = d.get("notifiers") if isinstance(d.get("notifiers"), list) else []
        hidden = set(d.get("hiddenNew") or [])
        miss = d.get("missing") if isinstance(d.get("missing"), list) else None
        return {"linked": True, "codeOpen": code_open, "linkedAt": d.get("linkedAt"), "linkedFrom": d.get("linkedFrom"),
                "hub": d.get("hub") or "", "firmware": d.get("firmware") or "",
                "online": bool(d.get("lastPoll") and now - d["lastPoll"] < ONLINE_SECONDS), "lastPoll": d.get("lastPoll"),
                "lastReport": d.get("lastReport"), "have": d.get("appVersion"), "want": want,
                "appState": app_state(want, d.get("appVersion")), "devices": len(d.get("devices") or {}), "protocols": counts,
                "login": d.get("login") is True, "request": d.get("request"), "result": res,
                # ("Update required": the hub refused the new code — the import address, to do it by hand)
                "updateRequired": bool((res and res.get("error") == "endpoint") or d.get("manual") is True),
                "importPath": APP_PATH, "driverPath": DRIVER_PATH,
                "hubLink": self.hublink_info(), "oauth": d.get("oauth"), "secured": d.get("secured"),
                "childNotifier": any(n.get("child") for n in nts if isinstance(n, dict)), "notifierCount": len(nts),
                "hubCount": d.get("hubCount"), "given": d.get("given"),
                "missing": None if miss is None else [m for m in miss if m.get("id") not in hidden],
                "hiddenNew": len(hidden), "autoNotifier": d.get("autoNotifier")}

    def notifiers(self):
        """The Notifier versions the app reported (as the bridge's report: [{id, version}]) — None when none came."""
        with self.lock:
            n = self.doc.get("notifiers")
        return n if isinstance(n, list) else None
