"""Dashboard service: serves the wall-panel dashboard pages and stores every panel's settings.

Design: docs/dashboard-service.md. Python 3.12 stdlib; paho-mqtt is optional (change notifications).

  /                        -> layouts/v4/layout1.html for panel "main" (with <base> + window.PANEL + PANEL_CONFIG)
  /<Panel>                 -> the same page for that panel id (^[A-Za-z][A-Za-z0-9_-]{0,31}$, case-insensitive)
                              ?live=1: the Manager's "Open live" (a Manager login only: the admin controls, others
                              view — no broker login in the page; GET /api/manage/panels/<id>/live feeds it)
  /layouts/v4/layout1.html -> the page as before (window.PANEL_CONFIG only; the page then uses "main")
  /<anything else>         -> static files under DASHBOARD_DIR only (Cache-Control: no-cache)
  /layouts/v4/shared/hubitat-data.js, protect-cameras.js -> DATA_DIR/house/<name> when present
  GET/PATCH /api/panel/<id>, GET /api/health   (sync protocol v2: docs/dashboard-service-sync.md; a panel the
                              Manager hasn't set up: 404 {"error": "not-set-up"} — only the Manager creates panels)
  GET/PATCH /api/pin       -> house-wide panel PIN (service/panel_pin.py): status (?purpose=alert|disarm: that
                              lock-out), verify, ticket (also [0, "alertAck", id]: dismissing a level 4–5 alert), set (limits per client IP); PATCH /api/panel/main changing settings.deviceOverrides / neverSwitch
                              needs "pin" in the body while a PIN is set
  GET /api/manage/overview -> the Manager's Overview (service/overview.py; live state: service/live_state.py)
  PATCH /api/manage/alerts -> the admin acknowledges alerts waiting on the panels (levels 4–5: the panel PIN)
  GET/PATCH /api/manage/weather -> (v3.0.0, admins) Integrations → Weather: the Hubitat weather device, its warnings on
                              the panels, the weather card (service/weather_device.py; the bridge reads the setting)

Environment: PORT (8088), BIND (0.0.0.0), DATA_DIR (<project>/data), DASHBOARD_DIR (<project>/dashboard),
MQTT_HOST (localhost; empty = no MQTT), MQTT_PORT (1883), MQTT_USER / MQTT_PASSWORD (optional, never logged),
VERSION ("dev"). Page config (non-secret only): MQTT_WS_URL / MQTT_WS_PORT (9001), GO2RTC_URL, SONOS_PANEL_URL.

Usage: python -m service.server   (from the project root; scripts/start-service.ps1 on the laptop)
"""
import atexit
import csv
import datetime
import faulthandler
import email.utils
import errno
import gzip
import hashlib
import hmac
import http.server
import io
import ipaddress
import math
import json
import os
import pathlib
import re
import secrets
import shutil
import signal
import socket
import sys
import threading
import time
import traceback
import urllib.parse
import uuid

try:  # `python -m service.server` / tests; or run from inside service/
    from service.panel_pin import PanelPin
    from service import feedback
    from service import geocode
    from service import activity_log, art_sources, calendars, camera_frames, cards, guest_wifi, health, house_devices, house_settings, layouts, lists, live_state, manager_auth, manager_prefs, overview, own_cameras, panel_settings, pictures, templates
    from service import weather_device
    from service import device_rules

except ImportError:  # pragma: no cover
    from panel_pin import PanelPin
    import activity_log
    import feedback
    import geocode
    import calendars
    import camera_frames
    import cards
    import layouts
    import lists
    import templates
    import art_sources
    import guest_wifi
    import health
    import own_cameras
    import house_devices
    import panel_settings
    import pictures
    import house_settings
    import manager_auth
    import manager_prefs
    import live_state
    import overview
    import device_rules
    import weather_device


GUEST_SETTINGS_LOCK = threading.Lock()
GUEST_LOCKDOWN_MODES = ("pin", "dark")   # v2.7.0: everything asks for the PIN / the screen stays off until touched


def _takes_gzip(accept):
    """The request's Accept-Encoding allows gzip (and doesn't say gzip;q=0)."""
    for part in str(accept or "").lower().split(","):
        name, _, q = part.strip().partition(";")
        if name.strip() in ("gzip", "*"):
            q = q.strip()
            return not (q.startswith("q=") and q[2:].strip() in ("0", "0.0", "0.00", "0.000"))
    return False


def read_json_file(path):
    try:
        v = json.loads(path.read_text(encoding="utf-8"))
        return v if isinstance(v, dict) else {}
    except (OSError, ValueError):
        return {}

try:  # optional
    import paho.mqtt.client as paho_mqtt
except Exception:  # pragma: no cover - depends on the environment
    paho_mqtt = None

PROJECT = pathlib.Path(__file__).resolve().parent.parent

PANEL_RE = re.compile(r"[A-Za-z][A-Za-z0-9_-]{0,31}")
KEY_RE = re.compile(r"[A-Za-z0-9_.-]{1,64}")
MAX_BODY = 1024 * 1024
DRAIN_MAX = 16 * 1024 * 1024  # refused bodies up to this size are read and discarded
KEEP_BACKUPS = 30       # newest N backups per panel ...
KEEP_DAILY_DAYS = 14    # ... plus the newest backup of each of the last N (UTC) days
MAX_PANELS = 50         # creating more panels is refused (409)
MAX_DATA = 2 * MAX_BODY  # a panel's whole saved data (JSON) may not grow beyond this (disk use; 413 otherwise)
MAX_KEYS = 64           # ... nor have more top-level keys
MAX_CONNECTIONS = 64    # open connections at once; more are closed right away (slow clients can't use up threads)
BODY_DEADLINE = 30.0    # seconds for a whole request body (a trickling client can't hold a thread forever)
DRAIN_DEADLINE = 10.0   # seconds spent discarding a refused body before the connection is closed
LENGTH_RE = re.compile(r"[0-9]{1,8}")
LAYOUT = "layouts/v4/layout1.html"
BASE_HREF = "/layouts/v4/"
HOUSE_FILES = {"/layouts/v4/shared/hubitat-data.js": "hubitat-data.js",
               "/layouts/v4/shared/protect-cameras.js": "protect-cameras.js"}
RESERVED_SEGMENTS = {"api", "manage"}
MANAGE_COOKIE = "hp_manage"    # the Manager page's login (service/manager_auth.py)
# the Manager's page (dashboard/manage/index.html, v2.3.0): only our own scripts run — no inline script, no handler in
# markup, no eval; styles may be inline (a page's own style attributes); frames only our own (the builder's canvas, cards)
# (v2.8.0: manifest-src — the phone's "Add to home screen", manage/manifest.webmanifest — this server only)
MANAGE_CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
              "font-src 'self' data:; connect-src 'self'; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; "
              "base-uri 'none'; form-action 'self'; frame-ancestors 'self'")
# the panel pages (v2.5.1): only this server's scripts run — no inline script, no handler in the markup (shared/acts.js
# delegates them), no eval (protect-cameras.js is loaded as a script); styles may be inline (style attributes).
# What a panel loads from elsewhere, so those stay open: the weather (Open-Meteo, https fetch); camera stills, video
# and its socket from go2rtc — usually plain http/ws on another port or host of the LAN (img-src, media-src with the
# player's blob:/data: streams, connect-src ws:); the MQTT broker's WebSocket (ws:/wss:); a speaker's album art (any
# http/https picture); the Music page's Sonos Panel and go2rtc pages in a frame (frame-src http/https). Those hosts are
# each house's own, so http:/https: are allowed for those four kinds — never for scripts. frame-ancestors comes with
# the design / live views ('self'); the plain panel page sends frame-ancestors 'none' (_send). The page's own settings
# come as data (_layout), not as an inline script.
PANEL_CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http: https:; "
             "media-src 'self' blob: data: http: https:; connect-src 'self' ws: wss: https:; frame-src 'self' http: https:; "
             "font-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'")
# (worker-src: mqtt.js runs its keep-alive timer in a blob: worker — without it the pings stop and every panel drops off
# the broker about every 95 s; v2.7.1)
LOCAL_HOSTS = {"", "localhost", "127.0.0.1", "::1"}
MAX_PANEL_EVENTS = 1500   # a panel's calendar answer: the soonest this many (a huge feed must not cost every poll 1 MB)
BLANK_GRID = {"v": 2, "cols": 192, "rows": 128, "gap": 14, "cards": []}   # a new panel's Home (builder.js FC × FR)
# /<panel>?live=1 without a Manager login that sees that panel (v2.5.0, "Open live"): a plain note, no panel page
LIVE_REFUSED = ("<!doctype html><meta charset=utf-8><title>Skypane</title><body style=\"margin:0;display:grid;place-items:center;"
                "min-height:100vh;background:#140b3a;color:#e9e5f7;font:15px system-ui,sans-serif;text-align:center\"><div>"
                "<b style=\"display:block;font-size:17px;margin-bottom:6px\">Open this panel live from the Manager</b>"
                "Sign in to the Manager with an account that may see this panel, then use Panels → Open live.</div></body>")
PIN_GUARDED_PANEL = "main"                           # its settings below change only with the panel PIN (when set)
# a panel's settings only the Manager's admin changes (accounts): unlocking there, its FreeKiosk name
# (where sounds / spoken alerts / camera pop-ups go), the music page and a separate go2rtc address — both pages the
# panel loads full screen. (Level 5 alerts always show now.) And every alert setting + the PIN windows.
ADMIN_PANEL_KEYS = ("allowUnlock", "kioskName", "music.url", "cameras.go2rtc") + panel_settings.ADMIN_ONLY
# (a path = nested key: the music page and a separate go2rtc are addresses the panel loads — a LAN device must not
# point them at its own page; the PIN window guards the PIN itself. Not childLock: "auto lock" turns it on without a PIN)
PIN_GUARDED_KEYS = ("deviceOverrides", "neverSwitch", ("music", "url"), ("cameras", "go2rtc"))
COMMAND_RE = re.compile(r"[A-Za-z]{1,40}")           # device command names a ticket may be issued for
VALUE_RE = re.compile(r"[A-Za-z0-9 .,\-]{1,32}")  # (same as the bridge's value check)
MAX_TICKETS = 20                                     # per request

MIME = {".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
        ".webp": "image/webp", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
        ".ttf": "font/ttf", ".otf": "font/otf", ".txt": "text/plain; charset=utf-8", ".map": "application/json",
        ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".mp4": "video/mp4", ".webm": "video/webm",
        ".webmanifest": "application/manifest+json"}   # (v2.8.0: the Manager's manifest, a phone's home screen)


def log(msg):
    sys.stderr.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    sys.stderr.flush()


class Config:
    def __init__(self, env=None):
        env = os.environ if env is None else env
        self.port = int(env.get("PORT") or 8088)
        self.bind = env.get("BIND") or "0.0.0.0"
        self.data_dir = pathlib.Path(env.get("DATA_DIR") or PROJECT / "data")
        self.dashboard_dir = pathlib.Path(env.get("DASHBOARD_DIR") or PROJECT / "dashboard")
        self.mqtt_host = env.get("MQTT_HOST", "localhost").strip()
        self.mqtt_port = int(env.get("MQTT_PORT") or 1883)
        self.mqtt_user = env.get("MQTT_USER") or None
        self.mqtt_password = env.get("MQTT_PASSWORD") or None
        self.version = env.get("VERSION") or "dev"
        self.release = release_number()   # (the numbered release, service/RELEASE: "2.0.0" — shown next to the version)
        # Host header check (DNS rebinding): IP addresses and localhost always work; names only when listed here
        self.allowed_hosts = {h.strip().lower() for h in (env.get("ALLOWED_HOSTS") or "").split(",") if h.strip()}
        # Page config: built ONLY from these non-secret variables (allowlist, never the whole environment).
        page = {}
        ws_url = (env.get("MQTT_WS_URL") or "").strip()
        if ws_url:
            page["mqttUrl"] = ws_url
        elif self.mqtt_host.lower() not in LOCAL_HOSTS:
            page["mqttUrl"] = f"ws://{self.mqtt_host}:{(env.get('MQTT_WS_PORT') or '9001').strip()}"
        # The pages' login for the broker's WebSocket listener. Deliberately sent to the page: it only keeps OTHER
        # websites (opened in a browser on the LAN) off the broker - they can't read this page (same-origin rule,
        # Host check against DNS rebinding). It is not the MQTT_PASSWORD of the bridge / server.
        if (env.get("MQTT_WS_USER") or "").strip():
            page["mqttUser"] = env["MQTT_WS_USER"].strip()
            page["mqttPass"] = (env.get("MQTT_WS_PASSWORD") or "").strip()
        for key, var in (("go2rtc", "GO2RTC_URL"), ("sonosPanelUrl", "SONOS_PANEL_URL")):
            if (env.get(var) or "").strip():
                page[key] = env[var].strip()
        # a separate go2rtc behind a login: the server keeps the whole address (its own picture requests sign in with
        # it); the pages — whose config anyone on the network can read — get it without "user:password@"
        self.go2rtc_url = page.get("go2rtc")
        if self.go2rtc_url:
            try:
                page["go2rtc"] = camera_frames.split_userinfo(self.go2rtc_url)[0]
            except ValueError:   # (e.g. a port that isn't a number: the server starts, without that go2rtc — said once)
                log("GO2RTC_URL can't be read (check its port) — the separate camera video server is left out until it's fixed in Integrations")
                page.pop("go2rtc", None)
                self.go2rtc_url = None
        # the image's own MQTT broker runs (service/broker.py): the pages use ws://<the address they came from>:9001 —
        # data.js's default when there's no mqttUrl; Settings → Panel can then show the LAN devices' login (PIN first)
        self.mqtt_builtin = env.get("MQTT_BUILTIN") == "1"
        if self.mqtt_builtin:
            page["mqttBuiltin"] = True
        # no broker at all (MQTT_HOST empty — MQTT off): the pages don't try one (data.js: an error on every load before)
        if not self.mqtt_host and not ws_url and not self.mqtt_builtin:
            page["mqttOff"] = True
        # the image's own go2rtc runs (service/run_all.py): the pages use port 1984 on the address they came from
        if env.get("GO2RTC_BUILTIN") == "1" and "go2rtc" not in page:
            page["go2rtcPort"] = 1984
        # guest Wi-Fi from a UniFi console (e.g. a UDM Pro) runs (service/guest_wifi.py): the card shows its QR code (/api/guest-wifi)
        self.guest_wifi = env.get("GUEST_WIFI") == "1"
        if self.guest_wifi:
            page["guestWifi"] = True
        page["version"] = self.version
        if self.release:
            page["release"] = self.release
        self.page_config = page


def release_number():
    """The numbered release (service/RELEASE, e.g. "2.0.0": raised with every release) — "" when
    missing or odd. The image tag (VERSION, sha-xxxxxxx) still says which build it is; this says how far along it is."""
    try:
        r = (PROJECT / "service" / "RELEASE").read_text(encoding="utf-8").strip()
    except OSError:
        return ""
    return r if re.fullmatch(r"\d{1,3}\.\d{1,3}\.\d{1,3}", r) else ""


def js_json(value):
    """JSON for inside a <script> element: no '<', '>', '&' or line separators can end the element."""
    s = json.dumps(value, ensure_ascii=True)
    return s.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def host_allowed(host, allowed):
    """A web page elsewhere can point its own DNS name at this server's IP (DNS rebinding) and then use the API with
    the visitor's browser. Real clients use the IP, localhost, or a name listed in ALLOWED_HOSTS - anything else is
    refused. (No Host header at all = not a browser: allowed.)"""
    h = (host or "").strip().lower()
    if not h:
        return True
    if h.startswith("["):                       # [ipv6]:port
        name = h[1:h.find("]")] if "]" in h else h
    elif h.count(":") == 1:                     # name:port / ipv4:port
        name = h.split(":", 1)[0]
    else:
        name = h
    if name in ("localhost",) or name in allowed:
        return True
    try:
        ipaddress.ip_address(name)
        return True
    except ValueError:
        return False


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc)


def _canon(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(",", ":"))


def pin_guarded_change(old_settings, new_settings):
    """Would replacing the stored settings by `new_settings` (None = deleted) change a PIN-guarded key?
    Missing keys / non-object settings count as None."""
    old = old_settings if isinstance(old_settings, dict) else {}
    new = new_settings if isinstance(new_settings, dict) else {}

    def at(d, k):
        for part in (k if isinstance(k, tuple) else (k,)):
            d = d.get(part) if isinstance(d, dict) else None
        return d
    return any(_canon(at(old, k)) != _canon(at(new, k)) for k in PIN_GUARDED_KEYS)


def parse_ticket_items(items):
    """[[id, command], or [id, command, value], ...] (1..MAX_TICKETS) -> [(id, command, value)]; ApiError 400 otherwise.
    value (signed into the ticket, so a sniffed ticket can't be raced with another value): none, a finite number or a
    short plain string."""
    if not isinstance(items, list) or not 1 <= len(items) <= MAX_TICKETS:
        raise ApiError(400, f'"items" must be a list of 1-{MAX_TICKETS} [id, command] pairs')
    out = []
    for it in items:
        if not (isinstance(it, list) and len(it) in (2, 3) and isinstance(it[0], int) and not isinstance(it[0], bool)
                and it[0] >= 0 and isinstance(it[1], str) and COMMAND_RE.fullmatch(it[1])):
            raise ApiError(400, '"items" must be [id, command] pairs (id >= 0, command letters only)')
        value = it[2] if len(it) == 3 else None
        if it[1] == "setMode":   # (a Hubitat mode, device 0: its name as the owner typed it — the bridge's own rule)
            if not (it[0] == 0 and isinstance(value, str) and 0 < len(value) <= 40 and value.isprintable() and value == value.strip()):
                raise ApiError(400, '"items": a mode name (printable, 1-40 characters)')
            out.append((0, "setMode", value))
            continue
        if not (value is None or (isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value))
                or (isinstance(value, str) and VALUE_RE.fullmatch(value))):
            raise ApiError(400, '"items" value must be a number or a short plain string')
        out.append((it[0], it[1], value))
    return out


class StoreError(Exception):
    """A refused write: HTTP status + JSON body."""

    def __init__(self, code, body):
        super().__init__(body.get("error"))
        self.code, self.body = code, body


class Store:
    """panels/<id>.json = {"rev", "data", "updated"}; atomic writes under one lock; backups/<id>-<ts>.json.
    Panel ids are case-insensitive: always stored / looked up lowercased."""

    def __init__(self, data_dir):
        self.panels = pathlib.Path(data_dir) / "panels"
        self.backups = pathlib.Path(data_dir) / "backups"
        self.lock = threading.Lock()
        # (v3.0.0) a data folder Skypane may not write to (an empty folder Docker made as root, a skipped chown): no
        # crash loop — the server still starts, /api/health answers 503 dataWritable false and the Manager shows the
        # data-folder page (writable() is False while panels/ can't be written)
        for d in (self.panels, self.backups):
            try:
                d.mkdir(parents=True, exist_ok=True)
            except OSError as e:
                log(f"data folder: can't make {d.name}/ ({type(e).__name__}) — give the folder to user 99:100 (Troubleshooting → data folder)")

    def _path(self, panel):
        assert PANEL_RE.fullmatch(panel) and panel == panel.lower()
        return self.panels / f"{panel}.json"

    def _adopt_legacy(self, panel):
        """A file saved before ids were case-insensitive (e.g. K_Office.json) is renamed to the lowercase name."""
        for f in self.panels.glob("*.json"):
            if f.stem != panel and f.stem.lower() == panel and PANEL_RE.fullmatch(f.stem):
                try:
                    os.replace(f, self._path(panel))
                    log(f"store: renamed panel file {f.name} -> {panel}.json")
                except OSError:
                    pass
                return

    def _read(self, panel):
        p = self._path(panel)
        try:
            raw = p.read_text(encoding="utf-8")
        except FileNotFoundError:
            self._adopt_legacy(panel)
            try:
                raw = p.read_text(encoding="utf-8")
            except FileNotFoundError:
                return None
        doc = self._parse(raw)
        if doc is None:
            doc = self._recover(panel)
        return doc

    @staticmethod
    def _parse(raw):
        try:
            doc = json.loads(raw)
        except ValueError:
            return None
        if not isinstance(doc, dict) or not isinstance(doc.get("data"), dict) or not isinstance(doc.get("rev"), int):
            return None
        return doc

    def _recover(self, panel):
        """A damaged panel file (disk trouble, edited by hand): set it aside as <id>.json.bad-<time> and put the
        newest good backup back, so the panel keeps working. Raises ValueError only when no backup is good either."""
        p = self._path(panel)
        bad = p.with_name(f"{p.name}.bad-{utc_now().strftime('%Y%m%dT%H%M%SZ')}")
        try:
            os.replace(p, bad)
        except OSError:
            pass
        pat = re.compile(re.escape(panel) + r"-(\d{8}T\d{12}Z)(?:-(\d+))?\.json", re.IGNORECASE)
        found = sorted(((m.group(1), int(m.group(2) or 0)), f) for f in self.backups.iterdir() if (m := pat.fullmatch(f.name)))
        for _, f in reversed(found):
            try:
                doc = self._parse(f.read_text(encoding="utf-8"))
            except OSError:
                doc = None
            if doc is not None:
                shutil.copyfile(f, p)
                log(f"store: panel file {panel}.json was damaged - kept as {bad.name}, restored backup {f.name} (rev {doc['rev']})")
                return doc
        log(f"store: panel file {panel}.json was damaged and no backup is readable - kept as {bad.name}")
        raise ValueError("corrupt panel file")

    def get(self, panel):
        panel = panel.lower()
        with self.lock:
            doc = self._read(panel)
        if doc is None:
            return {"panel": panel, "rev": 0, "exists": False, "data": {}}
        return {"panel": panel, "rev": doc["rev"], "exists": True, "data": doc["data"]}

    def patch(self, panel, changes, base_rev=None, create=True, guard=None):
        """Merge `changes`; returns the new rev. Raises StoreError (409) on a rev conflict, when the panel doesn't
        exist and `create` is false, or when it would be panel number MAX_PANELS + 1. `guard(stored_data)` (optional)
        runs under the lock with exactly the data the changes will be merged into, and may raise StoreError."""
        panel = panel.lower()
        with self.lock:
            doc = self._read(panel)
            if doc is not None and base_rev is not None and base_rev != doc["rev"]:
                raise StoreError(409, {"error": "conflict", "rev": doc["rev"], "data": doc["data"]})
            if doc is None:
                if not create:
                    raise StoreError(409, {"error": "not-created", "rev": 0, "data": {}})
                if len(self.panel_ids()) >= MAX_PANELS:
                    raise StoreError(409, {"error": f"too many panels (max {MAX_PANELS})"})
            if guard is not None:
                guard(doc["data"] if doc else {})
            data = dict(doc["data"]) if doc else {}
            rev = doc["rev"] if doc else 0
            for k, v in changes.items():
                if v is None:
                    data.pop(k, None)
                else:
                    data[k] = v
            if len(data) > MAX_KEYS or len(json.dumps(data, ensure_ascii=True, separators=(",", ":"))) > MAX_DATA:
                raise StoreError(413, {"error": f"panel data too large (max {MAX_KEYS} keys, {MAX_DATA // 1048576} MB)"})
            rev += 1
            # (a panel's own fps measurements alone — app.js "perf" — don't need a backup: it would push the useful ones out)
            if doc is not None and set(changes) != {"perf"}:
                self._backup(panel)
            new = {"rev": rev, "data": data, "updated": utc_now().isoformat(timespec="seconds")}
            target = self._path(panel)
            tmp = target.with_name(f".{panel}.{uuid.uuid4().hex}.tmp")
            try:
                with open(tmp, "w", encoding="utf-8") as f:
                    json.dump(new, f, ensure_ascii=True, separators=(",", ":"))  # ASCII: a lone surrogate can't fail the write
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp, target)
            finally:
                if tmp.exists():
                    tmp.unlink()
            return rev

    def modify(self, panel, fn, create=False):
        """fn(data) → {key: new value or None}, computed from the current data and written only if nothing was saved in
        between (the rev check; else computed again) — the Manager changes single settings of a panel this way, no
        lost update. Returns the new rev."""
        panel = panel.lower()
        for attempt in range(5):   # (the panel saved in between: compute again from its new data)
            with self.lock:
                doc = self._read(panel)
            if doc is None and not create:
                raise StoreError(404, {"error": "no such panel"})
            changes = fn(json.loads(json.dumps(doc["data"])) if doc else {})
            try:
                return self.patch(panel, changes, base_rev=doc["rev"] if doc else 0, create=create)   # (0: still absent)
            except StoreError as e:
                if e.code != 409 or e.body.get("error") != "conflict" or attempt == 4:
                    raise

    def _backup(self, panel):
        now = utc_now()
        ts = now.strftime("%Y%m%dT%H%M%S%fZ")
        dest = self.backups / f"{panel}-{ts}.json"
        n = 0
        while dest.exists():
            n += 1
            dest = self.backups / f"{panel}-{ts}-{n}.json"
        shutil.copyfile(self._path(panel), dest)
        self.prune_backups(panel, now)

    def prune_backups(self, panel, now=None):
        """Keep the newest KEEP_BACKUPS backups plus the newest one of each of the last KEEP_DAILY_DAYS UTC days."""
        now = now or utc_now()
        pat = re.compile(re.escape(panel) + r"-(\d{8}T\d{12}Z)(?:-(\d+))?\.json", re.IGNORECASE)
        mine = []
        for f in self.backups.iterdir():
            m = pat.fullmatch(f.name)
            if m:
                mine.append(((m.group(1), int(m.group(2) or 0)), f))
        mine.sort()
        keep = {f for _, f in mine[-KEEP_BACKUPS:]}
        days = {(now.date() - datetime.timedelta(days=i)).strftime("%Y%m%d") for i in range(KEEP_DAILY_DAYS)}
        newest_of_day = {}
        for (ts, _n), f in mine:  # ascending: the last one seen per day is that day's newest
            if ts[:8] in days:
                newest_of_day[ts[:8]] = f
        keep.update(newest_of_day.values())
        for _, f in mine:
            if f not in keep:
                try:
                    f.unlink()
                except OSError:
                    pass

    def writable(self):
        """Can settings be saved? (e.g. appdata owned by the wrong user → every save would fail)"""
        t = self.panels / f".health-{uuid.uuid4().hex}.tmp"
        try:
            t.write_text("ok", encoding="ascii")
            t.unlink()
            return True
        except OSError:
            return False

    def remove(self, panel):
        """A panel removed (Manager → Panels): its settings file goes, a last backup of it is kept (with the others,
        so it can be put back by hand). False when there was nothing to remove."""
        panel = panel.lower()
        with self.lock:
            if self._read(panel) is None:
                return False
            self._backup(panel)
            self._path(panel).unlink()
            return True

    def panel_ids(self):
        ids = set()
        for f in self.panels.glob("*.json"):
            if PANEL_RE.fullmatch(f.stem):
                ids.add(f.stem.lower())
        return sorted(ids)


def parse_alert_levels(payload):
    """The bridge's hubitat/alerts message → [(level, expiry)] of its alerts (anything odd → [])."""
    try:
        m = json.loads(payload.decode("utf-8") if isinstance(payload, bytes) else payload)
        out = []
        for a in m.get("alerts") or [] if isinstance(m, dict) and m.get("v") == 1 else []:
            lvl, exp = (a.get("lvl"), a.get("exp") or 0) if isinstance(a, dict) else (None, 0)
            if isinstance(lvl, int) and not isinstance(lvl, bool) and 1 <= lvl <= 5 and isinstance(exp, (int, float)) and not isinstance(exp, bool):
                out.append((lvl, exp))
        return out[:100]
    except (ValueError, UnicodeDecodeError, AttributeError, TypeError, RecursionError):
        return []


def weather_status(payload):
    """(v3.0.0) The bridge's hubitat/weather → what the Manager shows: {active, reason, updatedAt, device, place, temp,
    units, warnings: [{id, lvl, title}]} — None when it isn't the bridge's shape."""
    try:
        m = json.loads(payload.decode("utf-8") if isinstance(payload, (bytes, bytearray)) else payload)
    except (ValueError, UnicodeDecodeError, RecursionError):
        return None
    if not isinstance(m, dict) or m.get("v") != 1:
        return None
    num = lambda v: v if isinstance(v, (int, float)) and not isinstance(v, bool) and abs(v) < 1e11 else None   # noqa: E731
    dev = m.get("device") if isinstance(m.get("device"), dict) else {}
    cur = m.get("current") if isinstance(m.get("current"), dict) else {}
    un = m.get("units") if isinstance(m.get("units"), dict) else {}
    warn = []
    for w in (m.get("warnings") if isinstance(m.get("warnings"), list) else [])[:weather_device.MAX_ALERTS]:
        if isinstance(w, dict) and isinstance(w.get("id"), str) and live_state.ALERT_ID.fullmatch(w["id"]) and isinstance(w.get("lvl"), int):
            warn.append({"id": w["id"], "lvl": max(1, min(5, w["lvl"])), "title": weather_device.clean_text(w.get("title"), 60)})
    reason = m.get("reason") if m.get("reason") in ("off", "card-off", "no-data", "stale") else None
    return {"active": m.get("active") is True, "reason": reason, "updatedAt": num(m.get("updatedAt")),
            "device": {"id": num(dev.get("id")), "name": weather_device.clean_text(dev.get("name"), 60)} if dev else None,
            "place": weather_device.clean_text(m.get("place"), 60) or None, "temp": num(cur.get("temp")),
            "units": {"temp": "C" if un.get("temp") == "C" else "F", "wind": "km/h" if un.get("wind") == "km/h" else "mph"},
            "forecastDays": len(m["forecast"]) if isinstance(m.get("forecast"), list) else 0, "warnings": warn}


# (v2.9.1,–) the Manager switches a device: on its own topics, which only the broker's internal login may read
# or write (service/broker.py ACL — the panels' WebSocket login and the devices' login can neither read nor write
# manager/#). The bridge checks every command again exactly as for a panel (service/device_rules.py) and answers on
# MANAGER_CMD_RESULT with the request's rid.
MANAGER_CMD_TOPIC = "manager/cmd"
MANAGER_CMD_RESULT = "manager/cmd/result"
DEFAULT_KIOSK = "skypane"       # (v3.0.0) the main panel's FreeKiosk name when none is set (data.js: the same)
OLD_KIOSK = "poe_panel"         # (before 3.0 — an install from then keeps it: App._keep_old_kiosk_name)
REVEAL_MAX = 300                # (v2.9.3) a revealed calendar: the panel's general PIN window, at most 5 minutes
MANAGER_CMD_WAIT = 5.0          # seconds the server waits for the bridge's answer (the bridge drops a command after 10)
MANAGER_CMD_LOGIN_RATE = 30     # device commands a minute per Manager login
MANAGER_CMD_RATE = 60           # … and for all the Manager's logins that aren't admins together (an admin is never shut out
                                # by others; the bridge keeps separate budgets for admins' and others' commands)
MANAGER_CMD_WAITERS = 4         # requests waiting for the bridge at once (each holds a server thread); more: 429 busy
MANAGER_CMD_DEVICE_GAP = 1.0    # seconds between two commands to the same device (a double tap is one)
RID_RE = re.compile(r"[0-9a-f]{24}")
MANAGER_ACK_RATE = 20   # Manager acknowledgements a minute (the bridge's own budget for them is larger: 30)
MANAGER_ACK_TOPIC = "hubitat/alerts/ack/manager"   # only the internal broker login may write it (service/broker.py ACL)


def manager_panel(user):
    """The name a Manager acknowledgement carries ("by" on MANAGER_ACK_TOPIC): "manager-<login>" — Hubitat hears it
    came from the Manager, and who (the notifier's ackPanel). Only [a-z0-9_-], at most 40 (the bridge's PANEL_NAME).
    The bridge refuses this prefix on the panels' hubitat/alerts/ack, and no panel id may start with "manager"."""
    return "manager-" + (re.sub(r"[^a-z0-9_-]", "-", str(user or "").lower())[:32] or "admin")


class Notifier:
    """Publishes dashboard/panel/<id>/changed after a save. Silent no-op without paho-mqtt or a broker. Follows the
    bridge's hubitat/state, hubitat/event and hubitat/alerts into `live` (service/live_state.py) for the Overview."""

    def __init__(self, cfg, live=None):
        self.client = None
        self.live = live
        self._waits = {}                 # (v2.9.1) rid → [Event, answer] — the Manager's device commands waiting
        self._wlock = threading.Lock()
        self.bridge_status = None   # the Hubitat bridge's retained hubitat/bridge/status: "online" / "offline" (None = not heard)
        self.alerts = []            # the bridge's retained hubitat/alerts: [(level, expiry)] — only for alert_up()
        self._modes, self._mode, self._hsm = [], None, None   # (v2.9.3) retained hubitat/modes and hubitat/hsm (house())
        self.weather = None         # (v3.0.0) the bridge's retained hubitat/weather, in short (weather_status) — Integrations
        if not cfg.mqtt_host or paho_mqtt is None:
            log(f"mqtt: {'disabled (MQTT_HOST empty)' if not cfg.mqtt_host else 'paho-mqtt not installed'}"
                " - no change notifications")
            return
        try:
            cid = f"poe-dashboard-{uuid.uuid4().hex[:8]}"
            if hasattr(paho_mqtt, "CallbackAPIVersion"):
                c = paho_mqtt.Client(paho_mqtt.CallbackAPIVersion.VERSION2, client_id=cid)
            else:  # paho 1.x
                c = paho_mqtt.Client(client_id=cid)
            if cfg.mqtt_user:
                c.username_pw_set(cfg.mqtt_user, cfg.mqtt_password)
            c.reconnect_delay_set(1, 30)

            def on_connect(client, *_a):   # (paho 1.x and 2.x call it with different arguments)
                try:
                    client.subscribe("hubitat/bridge/status", qos=0)
                    client.subscribe("hubitat/alerts", qos=0)
                    client.subscribe(MANAGER_CMD_RESULT, qos=1)   # (v2.9.1: the bridge's answers to the Manager's commands)
                    client.subscribe("hubitat/modes", qos=0)      # (v2.9.3: the Manager's Mode & alarm — retained)
                    client.subscribe("hubitat/hsm", qos=0)
                    client.subscribe(weather_device.TOPIC, qos=0)   # (v3.0.0: the weather device, as the bridge sees it)
                    if self.live is not None:   # (the Overview: device values, batteries, last activity)
                        client.subscribe("hubitat/state", qos=0)
                        client.subscribe("hubitat/event", qos=0)
                except Exception:
                    pass

            def on_message(_c, _u, msg):
                if msg.topic == "hubitat/bridge/status":
                    v = msg.payload.decode("utf-8", "replace").strip()
                    self.bridge_status = v if v in ("online", "offline") else None
                elif msg.topic == "hubitat/alerts":
                    self.alerts = parse_alert_levels(msg.payload[:256 * 1024])
                elif msg.topic == MANAGER_CMD_RESULT and not msg.retain:
                    self._command_answer(msg.payload[:4096])
                elif msg.topic in ("hubitat/modes", "hubitat/hsm"):
                    self.on_house(msg.topic, msg.payload[:16 * 1024])
                elif msg.topic == weather_device.TOPIC:
                    self.weather = weather_status(msg.payload[:64 * 1024])
                    if callable(getattr(self, "after_weather", None)):   # (the activity log: warnings up / ended)
                        try:
                            self.after_weather(self.weather)
                        except Exception as e:
                            log(f"weather: not logged ({type(e).__name__})")
                if self.live is not None and msg.topic in live_state.TOPICS:
                    try:
                        self.live.on_message(msg.topic, msg.payload)
                        if callable(getattr(self, "after_live", None)):   # (v2.9.3: the guest switch going on revokes reveal tickets)
                            self.after_live()
                    except Exception as e:   # (a strange message must never stop the client's loop)
                        log(f"live state: {msg.topic} not read ({type(e).__name__})")
            c.on_connect, c.on_message = on_connect, on_message
            c.connect_async(cfg.mqtt_host, cfg.mqtt_port, keepalive=30)
            c.loop_start()
            self.client = c
            log(f"mqtt: notifications to {cfg.mqtt_host}:{cfg.mqtt_port}")
        except Exception as e:
            log(f"mqtt: not available ({type(e).__name__}) - no change notifications")
            self.client = None

    def perftest(self, panel):
        """Ask the panel to run its performance test (Manager → Panels → Weather effects). False without a broker."""
        c = self.client
        try:
            if c is None or not c.is_connected():
                return False
            c.publish(f"dashboard/panel/{panel.lower()}/perftest", "{}", qos=0, retain=False)
            return True
        except Exception:
            return False

    def bench(self, panel, mode="thorough", stop=False):
        """Ask the panel to run the full benchmark (bench.js; Manager → Panels → Weather effects), or to stop it (a touch
        on the panel doesn't: children, the kiosk's wake). False without a broker."""
        c = self.client
        try:
            if c is None or not c.is_connected():
                return False
            c.publish(f"dashboard/panel/{panel.lower()}/bench", json.dumps({"stop": True} if stop else {"mode": mode}), qos=0, retain=False)
            return True
        except Exception:
            return False

    def health(self, beat, changes=()):
        """The health monitor's heartbeat (service/health.py, every 30 s): MQTT dashboard/health, live, never retained —
        the bridge passes it to the Skypane Notifier on the hub (docs/hubitat-notifier.md). New / resolved problems are
        logged here too (titles only: the details may name addresses)."""
        for what, p in changes or ():
            log(f"health: {'problem' if what == 'problem' else 'resolved'}: {p.get('title')}")
        c = self.client
        try:
            if c is not None and c.is_connected():
                c.publish(health.HEALTH_TOPIC, json.dumps(beat, separators=(",", ":")), qos=0, retain=False)
        except Exception:
            pass

    def lists_changed(self):
        """A shared list or note changed: the panels fetch them again."""
        c = self.client
        try:
            if c is not None and c.is_connected():
                c.publish("dashboard/lists/changed", "{}", qos=0, retain=False)
        except Exception:
            pass

    def calendars_changed(self):
        """The house's calendars changed (Manager → Settings → Calendars): the panels fetch their events again."""
        c = self.client
        try:
            if c is not None and c.is_connected():
                c.publish("dashboard/calendars/changed", "{}", qos=0, retain=False)
        except Exception:
            pass

    def cards_changed(self):
        """A card was added, updated or deleted (Manager → Cards): the panels fetch the list again."""
        c = self.client
        try:
            if c is not None and c.is_connected():
                c.publish("dashboard/cards/changed", "{}", qos=0, retain=False)
        except Exception:
            pass

    def changed(self, panel, rev, keys, client):
        c = self.client
        if c is None:
            return
        try:
            if not c.is_connected():
                return
            # lowercase id's topic, plus the id as the request wrote it (the page subscribes with its URL's case)
            payload = json.dumps({"rev": rev, "keys": keys, "client": client})
            for pid in dict.fromkeys((panel.lower(), panel)):
                c.publish(f"dashboard/panel/{pid}/changed", payload, qos=0, retain=False)
        except Exception:
            pass

    def bridge(self):
        """Whether the Hubitat bridge runs (it rebuilds the house model the panels use after a Devices / Rooms change):
        "online", "offline" (it said so, or no broker to hear it on) or "unknown" (connected, nothing heard yet)."""
        if self.client is None or not self.connected():
            return "offline"
        return self.bridge_status or "unknown"

    def ack_alert(self, aid, level, by):
        """Tell the bridge the admin acknowledged an alert in the Manager: MANAGER_ACK_TOPIC {"id", "by", "level"} (by =
        manager_panel(login)) — a topic only the server's internal login may write, so a panel page can't fake it. The
        bridge clears it on every panel at any level and Hubitat hears who. False without a broker."""
        c = self.client
        try:
            if c is None or not c.is_connected():
                return False
            c.publish(MANAGER_ACK_TOPIC, json.dumps({"id": aid, "by": by, "level": level}, separators=(",", ":")), qos=1, retain=False)
            return True
        except Exception:
            return False

    def device_command(self, msg, timeout=None):
        """(v2.9.1) Send one Manager device command to the bridge on MANAGER_CMD_TOPIC and wait for its answer:
        {"ok", "reason"?} — None when nothing came back in time, False when there's no broker to send it on. msg has
        its own "rid" (the answer carries it back); the ticket in it is single-use and bound to that command."""
        timeout = MANAGER_CMD_WAIT if timeout is None else timeout
        c = self.client
        rid = msg.get("rid")
        if c is None or not c.is_connected() or not isinstance(rid, str):
            return False
        ev = threading.Event()
        with self._wlock:
            self._waits[rid] = [ev, None]
        try:
            info = c.publish(MANAGER_CMD_TOPIC, json.dumps(msg, separators=(",", ":")), qos=1, retain=False)
            if getattr(info, "rc", 0) not in (0, None):
                return False
            ev.wait(timeout)
            with self._wlock:
                return self._waits.get(rid, [None, None])[1]
        except Exception:
            return False
        finally:
            with self._wlock:
                self._waits.pop(rid, None)

    def _command_answer(self, payload):
        """The bridge's answer on MANAGER_CMD_RESULT: {"rid", "ok", "reason"?} — handed to the request waiting for it."""
        try:
            m = json.loads(payload)
        except ValueError:
            return
        if not isinstance(m, dict) or not isinstance(m.get("rid"), str) or not RID_RE.fullmatch(m["rid"]):
            return
        key = self.result_key() if callable(getattr(self, "result_key", None)) else None
        if not device_rules.signed_ok(key, m):   # (only the bridge, which has the house key, can answer)
            return
        with self._wlock:
            w = self._waits.get(m["rid"])
            if w is None:
                return
            reason = m.get("reason") if isinstance(m.get("reason"), str) else None
            w[1] = {"ok": m.get("ok") is True, **({"reason": reason[:40]} if reason else {})}
            w[0].set()

    HSM_STATUSES = {"armedAway", "armedHome", "armedNight", "armingAway", "armingHome", "armingNight", "disarmed", "allDisarmed"}
    HSM_ALERTS = {"intrusion", "intrusion-home", "intrusion-night", "smoke", "water", "rule", "arming"}

    def on_house(self, topic, payload):
        """(v2.9.3) The bridge's retained hubitat/modes {"modes": [names], "mode"} and hubitat/hsm {"status", "alert"},
        kept only when they look exactly like the bridge's (names: short plain text; statuses: the bridge's words)."""
        try:
            m = json.loads(payload)
        except (ValueError, UnicodeDecodeError):
            return
        if not isinstance(m, dict):
            return
        if topic == "hubitat/modes":
            names = m.get("modes")
            if isinstance(names, list) and len(names) <= 40:
                ok = [x for x in names if isinstance(x, str) and device_rules.MODE_NAME_RE.fullmatch(x)]
                self._modes = list(dict.fromkeys(ok))
            cur = m.get("mode")
            self._mode = cur if isinstance(cur, str) and device_rules.MODE_NAME_RE.fullmatch(cur) else None
        else:
            st = m.get("status")
            if isinstance(st, str) and st in self.HSM_STATUSES:
                al = m.get("alert")
                self._hsm = {"status": st, "alert": al if isinstance(al, str) and al in self.HSM_ALERTS else None}

    def house(self):
        """{modes, mode, hsm} as last heard (empty / None before the bridge said)."""
        return {"modes": list(self._modes), "mode": self._mode, "hsm": dict(self._hsm) if self._hsm else None}

    def alert_up(self):
        """Whether a level 4–5 alert from Hubitat is up now (the bridge's list): only then does a PIN for dismissing an
        alert count on its own, shorter-locking counter (service/panel_pin.py "alert")."""
        now = time.time()
        return any(lvl >= 4 and (not exp or exp > now) for lvl, exp in self.alerts)

    def connected(self):
        """None = no MQTT configured; else whether the broker connection is up."""
        try:
            return None if self.client is None else bool(self.client.is_connected())
        except Exception:
            return False

    def stop(self):
        if self.client is not None:
            try:
                self.client.disconnect()
                self.client.loop_stop()
            except Exception:
                pass


class ApiError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code, self.message = code, message


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "skypane"
    sys_version = ""
    protocol_version = "HTTP/1.1"
    timeout = 30  # seconds per socket read (slow / truncated bodies)

    # ---- plumbing -------------------------------------------------------------------------------------------
    @property
    def app(self):
        return self.server.app

    def log_message(self, fmt, *args):  # base-class messages (errors); never contain bodies
        log(f"{self.client_address[0]} {fmt % args}")

    def log_request(self, code="-", size="-"):
        ms = (time.monotonic() - getattr(self, "_t0", time.monotonic())) * 1000
        code = getattr(code, "value", code)
        path = getattr(self, "path", "-")
        if path.split("?", 1)[0] == "/api/manage/geocode":   # (v3.0.0: the place typed is never logged)
            path = "/api/manage/geocode?…"
        log(f"{self.client_address[0]} {self.command or '-'} {path[:300]!s} {code} {size} {ms:.0f}ms")

    def send_error(self, code, message=None, explain=None):
        # Used by the base class for malformed requests: generic JSON, never echoing the request.
        try:
            short = self.responses[code][0]
        except KeyError:
            short = "Error"
        self.close_connection = True
        self._json(code, {"error": short})

    def _send(self, code, body, ctype, extra=None, frameable=False):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        if not frameable:   # (a card's frame page brings its own: shown inside our panel page only)
            self.send_header("Referrer-Policy", "same-origin")   # (no addresses leak in Referer headers)
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Content-Security-Policy", "frame-ancestors 'none'")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        renew = getattr(self, "_set_cookie", None)
        if renew and not any(k.lower() == "set-cookie" for k in (extra or {})):
            self.send_header("Set-Cookie", f"{MANAGE_COOKIE}={renew}; Path=/; HttpOnly; SameSite=Strict")
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()
        if self.command != "HEAD" and code >= 200 and code not in (204, 304):
            self.wfile.write(body)

    def _json(self, code, obj, extra=None):
        headers = {"Cache-Control": "no-store"}
        headers.update(extra or {})
        body = json.dumps(obj).encode("utf-8")
        # (v2.7.2) a JSON answer over 1 KB goes gzipped when the browser takes it (the device list, the timeline…);
        # JSON answers carry no ETag, so the two forms never meet in a cache (Vary says which one it is)
        if len(body) > 1024 and self.command != "HEAD" and _takes_gzip(self.headers.get("Accept-Encoding")):
            body = gzip.compress(body, 6)
            vary = [v.strip() for v in str(headers.get("Vary") or "").split(",") if v.strip()]
            headers.update({"Content-Encoding": "gzip", "Vary": ", ".join(vary + (["Accept-Encoding"] if "accept-encoding" not in [v.lower() for v in vary] else []))})
        self._send(code, body, "application/json", headers)

    # ---- dispatch -------------------------------------------------------------------------------------------
    def do_GET(self):
        self._dispatch()

    def do_HEAD(self):
        self._dispatch()

    def do_PATCH(self):
        self._dispatch()

    def _drain(self):
        """After answering, read and discard a request body we refused (up to DRAIN_MAX) and close, so the socket
        close doesn't reset the connection before the client has read our error answer."""
        if self._body_read or not self.headers:
            return
        self._body_read = True
        self.close_connection = True
        if self.headers.get("Transfer-Encoding"):
            return  # not parsed: just close
        value = (self.headers.get("Content-Length") or "0").strip()
        if not LENGTH_RE.fullmatch(value):
            return
        length = int(value)
        if length <= 0 or length > DRAIN_MAX:
            return
        try:
            self._read_body(length, DRAIN_DEADLINE, keep=False)
        except OSError:
            pass

    def _read_body(self, length, deadline, keep=True):
        """Read exactly `length` bytes within `deadline` seconds in total (TimeoutError otherwise); b"" if not kept.
        Returns fewer bytes when the client closes early."""
        end = time.monotonic() + deadline
        parts, left = [], length
        try:
            while left > 0:
                remaining = end - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("body read deadline")
                self.connection.settimeout(min(remaining, self.timeout))
                chunk = self.rfile.read1(min(left, 65536))
                if not chunk:
                    break
                left -= len(chunk)
                if keep:
                    parts.append(chunk)
        finally:
            try:
                self.connection.settimeout(self.timeout)
            except OSError:
                pass
        return b"".join(parts)

    UNKNOWN_HOST = ("This address isn't one Skypane knows. Open Skypane by its IP address, or add this name in the "
                    "Manager: Integrations → General → Other names for this server, then Save and restart.")

    def _unknown_host(self):
        """421: the page was opened by a name that isn't this server's (DNS rebinding guard, host_allowed). A browser
        gets a readable page, an API caller JSON; both name the Manager setting (never the Host sent: not echoed)."""
        bare = self.path.split("?", 1)[0]
        if not bare.startswith("/api/") and "text/html" in (self.headers.get("Accept") or ""):
            page = ("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" "
                    "content=\"width=device-width,initial-scale=1\"><title>Skypane: unknown address</title><style>"
                    "body{font:16px/1.5 system-ui,sans-serif;background:#14112b;color:#eee;margin:0;padding:16px}"
                    "main{max-width:560px;margin:10vh auto}h1{font-size:22px}</style></head><body><main>"
                    "<h1>Skypane doesn't know this address</h1><p>" + self.UNKNOWN_HOST.replace("→", "&rarr;") +
                    "</p></main></body></html>").encode("utf-8")
            return self._send(421, page, "text/html; charset=utf-8", {"Cache-Control": "no-store"})
        return self._json(421, {"error": "unknown host name", "fix": self.UNKNOWN_HOST})

    def _not_allowed(self):
        self._t0 = time.monotonic()
        self._body_read = False
        self.close_connection = True
        self._json(405, {"error": "Method not allowed"}, {"Allow": "GET, HEAD, PATCH"})
        self._drain()

    do_POST = do_PUT = do_DELETE = do_OPTIONS = do_TRACE = do_CONNECT = _not_allowed

    def _dispatch(self):
        self._t0 = time.monotonic()
        self._set_cookie = None   # a renewed Manager login cookie for this response (_manage_ok)
        self.manager = None       # who is calling a Manager API (manager_auth.Caller; set by _manage_ok)
        self._body_read = self.command != "PATCH"
        if self.command in ("GET", "HEAD") and (self.headers.get("Transfer-Encoding") or
                                                (self.headers.get("Content-Length") or "0").strip() != "0"):
            # unexpected body: answer, then discard it (_drain, bounded) and close - it must never be parsed as
            # the next request on this connection
            self._body_read = False
            self.close_connection = True
        if not host_allowed(self.headers.get("Host"), self.app.cfg.allowed_hosts):
            self.close_connection = True
            self._unknown_host()
            self._drain()
            return
        try:
            path = self._clean_path()
            if path == "/api" or path.startswith("/api/"):
                self._api(path)
            else:
                if self.command not in ("GET", "HEAD"):
                    if self.command == "PATCH":
                        self.close_connection = True
                    raise ApiError(405, "Method not allowed")
                self._page_or_file(path)
        except ApiError as e:
            bare = self.path.split("?", 1)[0]
            # (v2.5.1: the read-only routes under the panels' prefixes — the live feed, a benchmark's progress view — GET only)
            patchable = (bare.startswith(("/api/panel/", "/api/manage/panels")) and not re.fullmatch(r"/api/manage/panels/[^/]+/(live|bench)", bare)) \
                or re.fullmatch(r"/api/manage/devices/\d{1,9}/command", bare) is not None or bare in (
                "/api/pin", "/api/guest-wifi", "/api/manage/login", "/api/manage/users", "/api/manage/devices", "/api/manage/settings",
                "/api/manage/never", "/api/manage/guest-wifi", "/api/manage/pictures", "/api/manage/cameras", "/api/manage/groups", "/api/manage/rooms",
                "/api/manage/cards", "/api/manage/templates", "/api/manage/calendars", "/api/manage/prefs", "/api/lists",
                "/api/manage/health", "/api/manage/guest-lockdown", "/api/manage/house/command", "/api/manage/activity/retention", "/api/manage/feedback",
                "/api/manage/weather")
            extra = {"Allow": "GET, HEAD, PATCH" if patchable else "GET, HEAD"} if e.code == 405 else None
            self._json(e.code, {"error": e.message}, extra)
        except (ConnectionError, TimeoutError):
            self.close_connection = True
        except Exception:
            log("internal error:\n" + traceback.format_exc())
            self.close_connection = True
            try:
                self._json(500, {"error": "Internal error"})
            except Exception:
                pass
        self._drain()

    def _clean_path(self):
        raw = self.path
        if not raw.startswith("/") or raw.startswith("//"):
            raise ApiError(400, "Bad path")
        raw = raw.split("?", 1)[0].split("#", 1)[0]
        try:
            path = urllib.parse.unquote(raw, errors="strict")
        except UnicodeDecodeError:
            raise ApiError(400, "Bad path")
        if "\\" in path or "\x00" in path or ":" in path or "//" in path:
            raise ApiError(400, "Bad path")
        if any(ch < " " or ch == "\x7f" for ch in path):
            raise ApiError(400, "Bad path")
        segments = path.split("/")[1:]
        if any(s in (".", "..") for s in segments):
            raise ApiError(400, "Bad path")
        return path

    # ---- pages and static files ------------------------------------------------------------------------------
    def _safe_file(self, rel):
        """Resolve `rel` (URL path without leading "/") inside DASHBOARD_DIR, following symlinks; None if not."""
        root = self.app.dashboard_root
        try:
            p = (root / rel).resolve(strict=True)
        except (OSError, RuntimeError, ValueError):
            return None
        if p != root and not p.is_relative_to(root):
            return None
        return p

    def _page_or_file(self, path):
        if path == "/":
            return self._panel_page("main")
        if path == "/hubitat/SkypaneNotifier.groovy":   # (v3.0.0: the hub imports the driver from here — plain text, no login)
            f = pathlib.Path(__file__).resolve().parent.parent / "hubitat" / "SkypaneNotifier.groovy"
            if not f.is_file():
                raise ApiError(404, "Not found")
            return self._send(200, f.read_bytes(), "text/plain; charset=utf-8", {"Cache-Control": "no-cache",
                                                                                "Content-Security-Policy": "default-src 'none'"})
        m = re.fullmatch(r"/pictures/([0-9a-f]{16})", path)
        if m:   # the owner's own pictures (service/pictures.py) — the panels show them
            found = self.app.pictures.file(m.group(1))
            if not found:
                raise ApiError(404, "Not found")
            f, mime = found
            return self._send(200, f.read_bytes(), mime, {"Cache-Control": "public, max-age=86400",
                                                          "Content-Security-Policy": "default-src 'none'"})
        m = re.fullmatch(r"/card-frame/([a-z0-9-]{1,40})", path)
        if m:   # a card people made, in its sandboxed frame (service/cards.py: its own strict CSP)
            card = self.app.cards.get(m.group(1))
            if not card:
                raise ApiError(404, "Not found")
            body, headers = cards.frame(card)
            return self._send(200, body, "text/html; charset=utf-8", headers, frameable=True)
        segments = path.split("/")[1:]
        if len(segments) == 1 and PANEL_RE.fullmatch(segments[0]) and segments[0] not in RESERVED_SEGMENTS \
                and self._safe_file(segments[0]) is None:
            return self._panel_page(segments[0])
        overlay = path in HOUSE_FILES
        if overlay:
            house = self.app.data_dir / "house" / HOUSE_FILES[path]
            if house.is_file():
                return self._file(house, overlay=True)
        f = self._safe_file(path[1:])
        if overlay and HOUSE_FILES[path] == "protect-cameras.js" and (f is None or not f.is_file()):
            # (a house without Protect: an empty camera file instead of a 404 on every panel load)
            return self._send(200, b"window.PROTECT_LIVEVIEWS = window.PROTECT_LIVEVIEWS || [];\n",
                              "text/javascript; charset=utf-8", {"Cache-Control": "no-cache"})
        if f is None:
            raise ApiError(404, "Not found")
        if f.is_dir():
            if not path.endswith("/"):
                loc = urllib.parse.quote(path) + "/"
                return self._send(301, b"", "text/plain", {"Location": loc, "Cache-Control": "no-cache"})
            f = self._safe_file(path[1:] + "index.html")
            if f is None or not f.is_file():
                raise ApiError(404, "Not found")
        if not f.is_file():
            raise ApiError(404, "Not found")
        if f == self.app.layout_path():
            return self._layout(panel=None)
        return self._file(f, overlay=overlay)

    def _panel_page(self, panel):
        self._layout(panel)

    def _layout(self, panel):
        layout = self.app.layout_path()
        if layout is None:
            raise ApiError(404, "Not found")
        html = layout.read_text(encoding="utf-8")
        inject, boot = "", {}
        if panel is not None:
            inject += f'\n<base href="{BASE_HREF}">'
            boot["PANEL"] = panel
        page = self.app.cfg.page_config
        if not page.get("guestWifi") and self.app.manual_guest():   # a guest network typed in the Manager (no UniFi)
            page = {**page, "guestWifi": True}
        # ?design=1: the layout builder's live canvas (Manager → Your own layout) — the same page in demo mode (it
        # switches nothing, saves nothing, makes no sound: data.js / store.js), shown only inside our own Manager
        query = self.path.split("#", 1)[0]
        design = panel is not None and re.search(r"[?&]design=1(?:&|$)", query) is not None
        # ?live=1 (v2.5.0): the Manager's "Open live" — the real page for that panel, for a Manager login only (its
        # cookie; the page is same-origin inside the Manager). The admin controls it as that panel would (its groups
        # and "may switch" rules, the PIN asked as on the wall — the PIN goes to /api/pin, never over MQTT); any other
        # login that sees the panel gets it view only: no broker login in the page at all (it reads the house's state
        # from /api/manage/panels/<id>/live instead), and the page refuses every change (shared/live.js).
        live = None
        if panel is not None and not design and re.search(r"[?&]live=1(?:&|$)", query):
            who, _ = self.app.auth.who(self._manage_token())
            pid = panel.lower()
            if not who or not who.sees(pid) or not PANEL_RE.fullmatch(pid) or (pid not in self.app.store.panel_ids() and pid != PIN_GUARDED_PANEL):
                return self._send(403, LIVE_REFUSED.encode("utf-8"), "text/html; charset=utf-8",
                                  {"Cache-Control": "no-store", "X-Frame-Options": "SAMEORIGIN",
                                   "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
                                   "Referrer-Policy": "same-origin"}, frameable=True)
            live = {"mode": "control" if who.admin else "view", "by": who.user}
            if live["mode"] == "view":   # (no way onto the broker from this page)
                page = {k: v for k, v in page.items() if k not in ("mqttUser", "mqttPass", "mqttUrl", "mqttBuiltin")}
            log(f"manager: {who.user} opened the panel {pid} live ({live['mode']}) from {self.client_address[0]}")
            self._act("panel.live", target=pid, who=who.user, mode=live["mode"])
        boot["PANEL_CONFIG"] = page
        # (v3.0.0) the panel's language — its settings "language" (panel_settings.PANEL_LANGS), else English; the page
        # loads shared/strings/<code>.js with English for anything missing
        lang = "en"
        if panel is not None:
            try:
                v = (self.app.store.get(panel)["data"].get("settings") or {}).get("language")
                lang = v if v in panel_settings.PANEL_LANGS else "en"
            except (OSError, ValueError, StoreError):
                pass
        boot["PANEL_LANG"] = lang
        # v2.7.0 guest lockdown: the panels the admin picked follow the chosen switch (layouts/v4 acts on it)
        if panel is not None and not design:
            lock = self.app.lockdown_for(panel)   # (v2.9.3: with "blur" — the calendar hidden while guests stay)
            if lock:
                boot["PANEL_LOCKDOWN"] = lock
        if design:
            boot["PANEL_DESIGN"] = True
        if live:
            boot["PANEL_LIVE"] = live
        # (v2.4.1) as data, never run: <script type="application/json"> (js_json: no "<" can end it), read by
        # /assets/panel-boot.js before every other script — the page has no inline script (PANEL_CSP)
        inject += (f'\n<script type="application/json" id="panel-boot">{js_json(boot)}</script>'
                   '\n<script src="/assets/panel-boot.js"></script>')
        m = re.search(r"<head\b[^>]*>", html, re.IGNORECASE)
        html = html[:m.end()] + inject + html[m.end():] if m else inject + "\n" + html
        headers = {"Cache-Control": "no-store" if live else "no-cache", "Content-Security-Policy": PANEL_CSP}
        if design or live:
            headers.update({"X-Frame-Options": "SAMEORIGIN", "Content-Security-Policy": PANEL_CSP + "; frame-ancestors 'self'", "Referrer-Policy": "same-origin"})
        self._send(200, html.encode("utf-8"), "text/html; charset=utf-8", headers, frameable=bool(design or live))

    def _not_modified(self, etag, mtime, ims_allowed):
        """304 rules: with If-None-Match only an exact ETag match counts (If-Modified-Since is then ignored);
        without it, If-Modified-Since is used except for the house-file overlay URLs (`ims_allowed` False), where
        the file behind the URL can change to one with an OLDER mtime (placeholder -> house file)."""
        inm = self.headers.get("If-None-Match")
        if inm is not None:
            return etag in [t.strip() for t in inm.split(",")]
        ims = self.headers.get("If-Modified-Since")
        if not ims or not ims_allowed:
            return False
        try:
            since = email.utils.parsedate_to_datetime(ims)
            if since.tzinfo is None:
                since = since.replace(tzinfo=datetime.timezone.utc)
            return mtime <= int(since.timestamp())
        except (TypeError, ValueError, IndexError, OverflowError):
            return False

    def _file(self, f, overlay=False):
        st = f.stat()
        mtime = int(st.st_mtime)
        # the ETag identifies which file (path), which version (mtime_ns) and size - hashed, so no path leaks
        # (v2.6.0: the Manager page's ETag also covers its CSP — a cached copy with the CSP of before isn't kept by a 304:
        # a 304 carries no new CSP, and the Cameras page's live video needs the one for this host)
        csp = self._manage_csp() if f.name == "index.html" and f.parent == self.app.dashboard_root / "manage" else ""
        tag = hashlib.sha256(f"{f.resolve()}\0{st.st_mtime_ns}\0{st.st_size}\0{csp}".encode("utf-8", "surrogatepass"))
        etag = f'"{tag.hexdigest()[:32]}"'
        # (v2.4.1) text files gzip-compressed when the browser takes it (the Manager's first load: ~1.7 MB → ~0.4 MB):
        # their own ETag (a different body), Vary: Accept-Encoding; compressed once per version of the file, in memory
        ctype = MIME.get(f.suffix.lower(), "application/octet-stream")
        squeezable = ctype.startswith(("text/", "application/json", "application/manifest", "image/svg")) and st.st_size > 1024
        gz = squeezable and "gzip" in (self.headers.get("Accept-Encoding") or "").lower()
        if gz:
            etag = etag[:-1] + '-gz"'
        if self._not_modified(etag, mtime, ims_allowed=not overlay):
            self.send_response(304)
            self.send_header("Cache-Control", "no-cache")
            self.send_header("ETag", etag)
            self.send_header("Last-Modified", email.utils.formatdate(mtime, usegmt=True))
            if squeezable:
                self.send_header("Vary", "Accept-Encoding")
            if self.close_connection:
                self.send_header("Connection", "close")
            self.end_headers()
            return
        body = None
        if gz:
            # (v2.5.1) one entry per file — its newest version only (the house overlay's hubitat-data.js changes often);
            # the bytes read are checked against the stat the ETag came from: changed in between → the ETag of what was
            # really read, and not cached
            cache = self.app.__dict__.setdefault("gz_cache", {})
            key = str(f)
            hit = cache.get(key)
            if hit and hit[0] == etag:
                body = hit[1]
            else:
                data = f.read_bytes()
                st2 = f.stat()
                body = gzip.compress(data, 6)
                if len(data) == st.st_size and (st2.st_mtime_ns, st2.st_size) == (st.st_mtime_ns, st.st_size):
                    if len(cache) > 400 and key not in cache:
                        cache.clear()
                    cache[key] = (etag, body)
                else:
                    etag = f'"{hashlib.sha256(data).hexdigest()[:32]}-gz"'
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body) if body is not None else st.st_size))
        if body is not None:
            self.send_header("Content-Encoding", "gzip")
        if squeezable:
            self.send_header("Vary", "Accept-Encoding")
        self.send_header("ETag", etag)
        self.send_header("Last-Modified", email.utils.formatdate(mtime, usegmt=True))
        self.send_header("Cache-Control", "no-cache")
        if self.close_connection:
            self.send_header("Connection", "close")
        self.send_header("X-Content-Type-Options", "nosniff")
        # never inside another site's frame (clickjacking the Manager or a panel); no addresses leak in Referer headers
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "same-origin")
        if f.name == "index.html" and f.parent == self.app.dashboard_root / "manage":
            self.send_header("Content-Security-Policy", self._manage_csp())
        self.end_headers()
        if self.command != "HEAD":
            if body is not None:
                self.wfile.write(body)
            else:
                with open(f, "rb") as fh:
                    shutil.copyfileobj(fh, self.wfile)

    # ---- API ------------------------------------------------------------------------------------------------
    def _api(self, path):
        if path == "/api/health":
            if self.command not in ("GET", "HEAD"):
                self.close_connection = True
                raise ApiError(405, "Method not allowed")
            writable = self.app.store.writable()
            return self._json(200 if writable else 503, {"ok": writable, "version": self.app.cfg.version,
                                                         **({"release": self.app.cfg.release} if self.app.cfg.release else {}), "panels": self.app.store.panel_ids(),
                                                         "dataWritable": writable, "mqtt": self.app.notifier.connected(), "boot": BOOT_ID})
        if path == "/api/pin":
            return self._pin()
        if path == "/api/manage/login":
            return self._manage_login()
        if path == "/api/manage/users":
            return self._manage_users()
        if path == "/api/manage/prefs":
            return self._manage_prefs()
        if path == "/api/manage/activity":       # v2.7.0: Health → Timeline, the sign-ins (service/activity_log.py)
            return self._manage_activity()
        if path == "/api/manage/activity.csv":
            return self._manage_activity(csv_out=True)
        if path == "/api/manage/activity/retention":   # v2.9.2 : how long the activity log is kept
            return self._manage_activity_retention()
        if path == "/api/manage/guest-lockdown":  # v2.7.0: the panels the admin picks lock down while a switch is on
            return self._manage_guest_lockdown()
        if path == "/api/manage/devices":
            return self._manage_devices()
        if path == "/api/manage/devices/live":
            return self._manage_devices_live()
        if path == "/api/manage/feedback":   # (v3.0.0: Send feedback — every login)
            return self._manage_feedback()
        if path == "/api/manage/geocode":   # (v3.0.0: the builder's weather card — a place search, from the server)
            return self._manage_geocode()
        if path == "/api/manage/house/command":   # (v2.9.3: a Hubitat mode, Hubitat Safety Monitor)
            return self._manage_house_command()
        m = re.fullmatch(r"/api/manage/devices/(\d{1,9})/(events|panels|command)", path)
        if m:
            if m[2] == "command":   # (v2.9.1: the Manager switches a device)
                return self._manage_device_command(int(m[1]))
            return self._manage_device_events(int(m[1])) if m[2] == "events" else self._manage_device_panels(int(m[1]))
        if path == "/api/manage/settings":
            return self._manage_settings()
        if path == "/api/manage/mqtt":
            return self._manage_mqtt()
        if path == "/api/manage/never":
            return self._manage_never()
        if path == "/api/manage/pictures":
            return self._manage_pictures()
        if path == "/api/manage/guest-wifi":
            return self._manage_guest_wifi()
        if path == "/api/manage/cameras":
            return self._manage_cameras()
        if path == "/api/manage/cameras/motion":   # v2.6.0: when each camera last saw motion (the hub's events)
            return self._manage_camera_motion()
        m = re.fullmatch(r"/api/manage/cameras/(\d{1,9})/frame\.jpg", path)
        if m:   # v2.6.0: a camera's picture now, through the server (never its stream address)
            return self._manage_camera_frame(int(m[1]))
        m = re.fullmatch(r"/api/manage/cameras/(\d{1,9})/live", path)
        if m:   # v2.6.0: live video for the Live view's spotlight (the built-in go2rtc on the home network;)
            return self._manage_camera_live(int(m[1]))
        if path == "/api/manage/groups":
            return self._manage_groups()
        if path == "/api/manage/rooms":
            return self._manage_rooms()
        if path == "/api/manage/panels":
            return self._manage_panels()
        if path == "/api/manage/cards":
            return self._manage_cards()
        if path == "/api/manage/art-sources":   # where the animated drawings came from; ?check=1: changes since (GitHub)
            check = "check=1" in (self.path.split("?", 1)[1] if "?" in self.path else "")
            self._manage_need("admin" if check else None)   # (asking GitHub: the admin only)
            if self.command not in ("GET", "HEAD"):
                raise ApiError(405, "Method not allowed")
            return self._json(200, {"sources": art_sources.public(), **({"updates": art_sources.check()} if check else {})})
        if path == "/api/manage/templates":
            return self._manage_templates()
        if path == "/api/manage/health":
            return self._manage_health()
        if path == "/api/manage/overview":
            return self._manage_overview()
        if path == "/api/manage/alerts":
            return self._manage_alerts()
        if path == "/api/manage/calendars":
            return self._manage_calendars()
        if path == "/api/manage/weather":   # (v3.0.0: Integrations → Weather, the admin)
            return self._manage_weather()
        if path == "/api/lists":   # the shared lists and notes (lists.py): every panel reads and changes them
            return self._lists()
        if path == "/api/cards":   # the panels: which cards there are (no code: that comes with each card's frame)
            if self.command not in ("GET", "HEAD"):
                raise ApiError(405, "Method not allowed")
            return self._json(200, {"cards": [cards.public(c) for c in self.app.cards.all()]})
        m = re.fullmatch(r"/api/manage/panels/([^/]+)/bench", path)
        if m:   # the Manager's live view of a running benchmark
            self._manage_need(None, m.group(1).lower())
            if self.command not in ("GET", "HEAD"):
                raise ApiError(405, "Method not allowed")
            live = dict(self.app.bench_live.get(m.group(1).lower()) or {})
            live.pop("asked", None)
            if "at" in live:
                live["age"] = round(time.time() - live["at"])   # (seconds since the panel last reported: it may have gone away)
            return self._json(200, live or {"state": "none"}, extra={"Cache-Control": "no-store"})
        m = re.fullmatch(r"/api/panel/([^/]+)/bench", path)
        if m:   # a panel running the benchmark says how far it is (memory only; only while one was asked for)
            pid = m.group(1).lower()
            if self.command != "PATCH" or not PANEL_RE.fullmatch(pid):
                raise ApiError(405 if self.command != "PATCH" else 400, "Not allowed")
            live = self.app.bench_live.get(pid)
            if not live or time.monotonic() - live["asked"] > 900:
                raise ApiError(409, "No benchmark was asked for")
            p = panel_settings.bench_progress(self._json_body())
            if p is None:
                raise ApiError(400, "Invalid progress")
            live.update(p, at=time.time())
            return self._json(200, {"ok": True})
        m = re.fullmatch(r"/api/panel/([^/]+)/health", path)
        if m:
            return self._panel_health(m.group(1))
        m = re.fullmatch(r"/api/panel/([^/]+)/events", path)
        if m:
            return self._panel_events(m.group(1))
        m = re.fullmatch(r"/api/manage/panels/([^/]+)/live", path)
        if m:   # v2.5.0: "Open live" for a login that may only view — the house now, read only
            return self._manage_panel_live(m.group(1))
        m = re.fullmatch(r"/api/manage/panels/([^/]+)", path)
        if m:
            return self._manage_panel(m.group(1))
        if path == "/api/guest-wifi":
            return self._guest_wifi()
        if path == "/api/guest-wifi/qr.svg":
            return self._guest_qr()
        m = re.fullmatch(r"/api/panel/([^/]*)", path)
        if not m:
            raise ApiError(404, "Not found")
        panel = m.group(1)
        if not PANEL_RE.fullmatch(panel):
            if self.command == "PATCH":
                self.close_connection = True
            raise ApiError(400, "Invalid panel id")
        if self.command in ("GET", "HEAD"):
            doc = self.app.store.get(panel)
            if not doc["exists"] and doc["panel"] != PIN_GUARDED_PANEL:
                # only the Manager (the admin) sets panels up: a tablet at an unknown address shows "not set up"
                raise ApiError(404, "not-set-up")
            return self._json(200, doc)
        if self.command == "PATCH":
            return self._patch(panel)
        raise ApiError(405, "Method not allowed")

    def _json_body(self):
        """Read and parse the PATCH body (length / deadline / JSON object checks); never logged."""
        if self.headers.get("Transfer-Encoding"):
            self.close_connection = True
            raise ApiError(400, "Content-Length required")
        length = (self.headers.get("Content-Length") or "").strip()
        if not LENGTH_RE.fullmatch(length):  # ASCII digits only ("²".isdigit() is True but int() fails)
            self.close_connection = True
            if re.fullmatch(r"[0-9]+", length):
                raise ApiError(413, "Body too large (max 1 MB)")
            raise ApiError(400, "Content-Length required")
        length = int(length)
        if length > MAX_BODY:
            self.close_connection = True
            raise ApiError(413, "Body too large (max 1 MB)")
        self._body_read = True
        try:
            body = self._read_body(length, BODY_DEADLINE)
        except TimeoutError:
            self.close_connection = True
            raise ApiError(408, "Body not received in time")
        if len(body) != length:
            self.close_connection = True
            raise ApiError(400, "Incomplete body")

        def bad_constant(name):
            raise ValueError("non-finite number")

        try:
            req = json.loads(body.decode("utf-8"), parse_constant=bad_constant)
        except (UnicodeDecodeError, ValueError, RecursionError):
            raise ApiError(400, "Body must be JSON")
        if not isinstance(req, dict):
            raise ApiError(400, "Body must be a JSON object")
        return req

    def _patch(self, panel):
        req = self._json_body()
        data = req.get("data")
        if not isinstance(data, dict) or not data:
            raise ApiError(400, '"data" must be a non-empty JSON object')
        for k in data:
            if not KEY_RE.fullmatch(k):
                raise ApiError(400, "Invalid key")
        client = req.get("client", "")
        if client is None:
            client = ""
        if not isinstance(client, str) or len(client) > 64:
            raise ApiError(400, '"client" must be a string (max 64)')
        base_rev = req.get("baseRev")
        if base_rev is not None and (not isinstance(base_rev, int) or isinstance(base_rev, bool) or base_rev < 0):
            raise ApiError(400, '"baseRev" must be a non-negative integer')
        create = req.get("create", False)
        if not isinstance(create, bool):
            raise ApiError(400, '"create" must be true or false')
        if panel.lower() != PIN_GUARDED_PANEL:
            create = False   # (only the Manager creates panels — the main one is always there;)
        pin_guard = self._pin_guard(req) if panel.lower() == PIN_GUARDED_PANEL and "settings" in data else None

        def guard(stored):
            # the settings the Manager owns (service/panel_settings.py) aren't changed through this open route once
            # they're set — only the Manager (its login) changes them: the stored values are kept, the rest of the
            # save goes through (a panel with an older copy loses nothing of its own). Not set yet = the panel's
            # defaults may arrive.
            if isinstance(data.get("settings"), dict):
                old = panel_settings.managed(stored.get("settings"))
                keep = {p: old[p] for p in panel_settings.PANEL_LOCKED if old[p] is not None}
                if old["allowUnlock"] is not True:   # (only the Manager ever turns unlocking on)
                    data["settings"] = {k: v for k, v in data["settings"].items() if k != "allowUnlock"}


                # not set yet: what the panel sends must pass the Manager's own checks (else it's dropped)
                data["settings"] = panel_settings.screen_unset(data["settings"], stored.get("settings"))
                if keep:   # (as stored, whole — not merged with what was sent)
                    data["settings"] = panel_settings.put(data["settings"], keep)
            if pin_guard:
                pin_guard(stored)
        try:
            rev = self.app.store.patch(panel, data, base_rev=base_rev, create=create, guard=guard)
        except StoreError as e:
            if e.body.get("error") == "not-created" and panel.lower() != PIN_GUARDED_PANEL:
                raise ApiError(404, "not-set-up")   # (never set up in the Manager, or removed there: nothing saved)
            return self._json(e.code, e.body)
        self._json(200, {"rev": rev})
        self.app.notifier.changed(panel, rev, sorted(data), client)

    def _pin_guard(self, req):
        """For PATCH /api/panel/main: changing a PIN_GUARDED_KEYS setting (device choices, addresses) needs the panel PIN
        (top-level body field "pin"; never stored, logged or echoed) while one is set. Runs inside the store lock
        against the very data the change is merged into (no check-then-write gap)."""
        pin, who, new_settings = self.app.pin, self.client_address[0], req["data"]["settings"]

        def guard(stored):
            if not pin.is_set() or not pin_guarded_change(stored.get("settings"), new_settings):
                return
            supplied = req.get("pin")
            if supplied is None:  # not asked yet: not a failed attempt
                raise StoreError(403, {"error": "pin-required"})
            result = pin.verify(supplied, who)
            if result in ("ok", "unset"):
                return
            if result == "locked":
                raise StoreError(423, {"error": "locked", "lockedFor": pin.locked_for(who)})
            raise StoreError(403, {"error": "pin-required"})

        return guard

    def _pin(self):
        # The PIN is checked here, never in the page. PATCH on purpose: a cross-site page can't send it without a
        # CORS preflight, which this server refuses. The body (the PIN) is never logged. Guessing is limited per
        # client IP, so someone guessing on the LAN locks out only themselves.
        pin, who = self.app.pin, self.client_address[0]
        if self.command in ("GET", "HEAD"):
            # ?purpose=alert|disarm: a PIN pad just opened for that — it counts down a running lock-out at once. Only
            # the seconds this client would be told after its next wrong PIN anyway; "alert" as verify decides it
            q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "", max_num_fields=8)
            want = (q.get("purpose") or [""])[0]
            purpose = "disarm" if want == "disarm" else "alert" if want == "alert" and self.app.notifier.alert_up() else "general"
            return self._json(200, {"set": pin.is_set(), "lockedFor": pin.locked_for(who, purpose)})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        action = req.get("action")
        # (security review) a PIN that isn't text is a bad request — never counted as a wrong guess
        if any(req.get(k) is not None and not isinstance(req.get(k), str) for k in ("pin", "old")):
            return self._json(400, {"ok": False, "error": "bad-request"})
        if action == "ticket" and req.get("purpose") == "reveal":
            # (v2.9.3) the calendar blurred while guests stay: {action: "ticket", purpose: "reveal", panel, pin} — the
            # right PIN on THIS panel → {ok, ticket, seconds}: /api/panel/<id>/events accepts it in the X-Skypane-Reveal
            # header (never in the address) for the panel's general PIN window (never longer than 5 min)
            pid = str(req.get("panel") or "").lower()
            if not PANEL_RE.fullmatch(pid) or (pid not in self.app.store.panel_ids() and pid != PIN_GUARDED_PANEL):
                raise ApiError(400, '"panel": a panel that exists')
            if req.get("pin") is None:   # (not asked yet: never a wrong guess)
                return self._json(403 if pin.is_set() else 409, {"ok": False, "error": "pin-required" if pin.is_set() else "unset"})
            result = pin.verify(req.get("pin"), who, "general")
            if result != "ok":
                return self._verify_answer(pin, result, who, "general")
            secs = (self.app.store.get(pid)["data"].get("settings") or {}).get("pinGeneralSeconds")
            secs = secs if isinstance(secs, int) and not isinstance(secs, bool) and 0 < secs <= REVEAL_MAX else REVEAL_MAX
            ticket = self.app.reveal_ticket(pid, secs)
            if not ticket:
                return self._json(503, {"ok": False, "error": "no-key"})
            return self._json(200, {"ok": True, "ticket": ticket, "seconds": secs})
        if action == "verify":
            # {"purpose": "alert"} (dismissing a level 4–5 alert) has its own, short lock-out — only while Hubitat
            # really has a level 4–5 alert up; otherwise (and for anything else) the general counter
            purpose = "alert" if req.get("purpose") == "alert" and self.app.notifier.alert_up() else "general"
            return self._verify_answer(pin, pin.verify(req.get("pin"), who, purpose), who, purpose)
        if action == "ticket":
            items = parse_ticket_items(req.get("items"))
            if any(c == "unlock" for _, c, _ in items):
                why = self._unlock_refused(req.get("panel"), [i for i, c, _ in items if c == "unlock"])
                if why:
                    return self._json(403, {"ok": False, "error": why})
            # dismissing level 4–5 alerts (v2.3.2): [0, "alertAck", "<alert id>"] — one ticket per alert, which the bridge
            # wants with the panel's dismissal on hubitat/alerts/ack (scripts/hubitat_bridge.py on_ack). Never mixed with
            # device commands. The "alert" lock-out as for verify (only while Hubitat really has a level 4–5 up). No PIN
            # set: tickets without one (the bridge needs none then either). The page's alarm window (pinpad.js) sends
            # the PIN it remembers — the server checks it again every time; it never hands out a ticket without it.
            acks = [v for i, c, v in items if c == "alertAck"]
            if acks:
                if len(acks) != len(items) or any(i != 0 or not isinstance(v, str) or not live_state.ALERT_ID.fullmatch(v) for i, c, v in items):
                    raise ApiError(400, '"items": [0, "alertAck", "<alert id>"] only, not mixed with other commands')
                if not pin.is_set():
                    return self._json(200, {"ok": True, "tickets": [pin.ticket(0, "alertAck", v) for v in acks], "pin": False})
                if req.get("pin") is None:   # (the page tries its alarm window first; no PIN yet is not a wrong guess)
                    return self._json(403, {"ok": False, "error": "pin-required"})
                purpose = "alert" if self.app.notifier.alert_up() else "general"
                result = pin.verify(req.get("pin"), who, purpose)
                if result != "ok":
                    return self._verify_answer(pin, result, who, purpose)
                return self._json(200, {"ok": True, "tickets": [pin.ticket(0, "alertAck", v) for v in acks]})
            # disarming (or cancelling HSM's alarm) — decided by what the ticket is for: its own, growing lock-out
            disarm = bool(items) and all(i == 0 and c == "setHsm" and v in ("disarm", "cancelAlerts") for i, c, v in items)
            purpose = "disarm" if disarm else "general"
            result = pin.verify(req.get("pin"), who, purpose)
            if result != "ok":
                return self._verify_answer(pin, result, who, purpose)

            return self._json(200, {"ok": True, "tickets": [pin.ticket(i, c, v) for i, c, v in items]})
        if action == "set":
            ok, err = pin.set(req.get("pin"), req.get("old"), who)
            if ok:
                return self._json(200, {"ok": True})
            if err == "locked":
                return self._json(423, {"ok": False, "error": "locked", "lockedFor": pin.locked_for(who)})
            return self._json(400 if err == "bad-format" else 403, {"ok": False, "error": err})
        if action == "mqtt-login":
            # the built-in broker's login for LAN devices (FreeKiosk, the panel agent): only for the right PIN, and
            # only when a PIN is set (a fresh install shows it once the owner set one)
            if not self.app.cfg.mqtt_builtin:
                return self._json(404, {"ok": False, "error": "not-builtin"})
            if not pin.is_set():
                return self._json(403, {"ok": False, "error": "unset"})
            result = pin.verify(req.get("pin"), who)
            if result != "ok":
                return self._verify_answer(pin, result, who)
            try:
                lg = json.loads((self.app.cfg.data_dir / "private" / "mqtt-logins.json").read_text(encoding="utf-8"))["devices"]
            except (OSError, ValueError, KeyError, TypeError):
                return self._json(503, {"ok": False, "error": "no-login"})
            return self._json(200, {"ok": True, "user": lg["user"], "pass": lg["pass"], "port": 1883},
                              extra={"Cache-Control": "no-store"})
        raise ApiError(400, '"action" must be "verify", "ticket", "set" or "mqtt-login"')

    def _unlock_refused(self, panel, ids):
        """Unlocking: only a lock the owner allowed (house model "unlockable" — the lock's own
        choice or a device group), only from a panel whose settings allow unlocking, and only a panel a group doesn't
        leave out. None = allowed (the PIN is still checked after this), else the reason."""
        if not isinstance(panel, str) or not PANEL_RE.fullmatch(panel):
            return "unlock-panel"
        settings = self.app.store.get(panel.lower())["data"].get("settings") or {}
        if settings.get("allowUnlock") is not True:
            return "unlock-panel"
        model = self.app.house_model() or {}
        only = model.get("onlyPanels") or {}
        for i in ids:
            if i not in (model.get("unlockable") or []):
                return "unlock-device"
            if str(i) in only and panel.lower() not in only[str(i)]:
                return "unlock-panel"
        return None

    # ---- Manager page (/manage, stage 4): device types / rooms / pictures for the whole house -----------------

    def _manage_token(self):
        for part in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = part.strip().partition("=")
            if k == MANAGE_COOKIE:
                return v
        return None

    @staticmethod
    def _cookie(token):
        if token is None:
            return {"Set-Cookie": f"{MANAGE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"}
        return {"Set-Cookie": f"{MANAGE_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict"}

    def _act(self, kind, target=None, who=None, **data):
        """One line in the activity log (service/activity_log.py): what happened, who did it (this Manager login unless
        `who` says), from which address and browser (in words). Never a secret: callers pass names, ids and counts."""
        me = self.manager
        who = who if who is not None else (me.user if me else None)
        auth = self.app.auth
        # (the logins' stable ids too: a later login with the same name never sees a removed one's history)
        tuid = auth.uid_of(target) if isinstance(target, str) and kind.split(".")[0] in ("account", "signin") else None
        self.app.activity.add(kind, who=who, client=self.client_address[0], agent=self.headers.get("User-Agent"), target=target,
                              wuid=auth.uid_of(who) if who else None, tuid=tuid, **data)

    def _query(self, n=10):
        return urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "", max_num_fields=n)

    def _manage_ok(self):
        """A good Manager login cookie, else 401. Returns who is calling (manager_auth.Caller; also self.manager)."""
        who, renew = self.app.auth.who(self._manage_token())
        if not who:
            raise ApiError(401, "login")
        # in use: a fresh cookie with the next response (30 minutes from now) — but not for a page's background poll
        # (X-Skypane-Poll: 1 — the health pill, the Overview, the Devices live values): an open tab nobody uses still
        # signs out after 30 idle minutes (v2.4.1)
        if renew and self.headers.get("X-Skypane-Poll") != "1":
            self._set_cookie = self.app.auth.renew(self._manage_token())   # (the same sign-in: "confirm it's you" carries over)
        self.manager = who
        return who

    def _manage_need(self, perm=None, panel=None):
        """_manage_ok + this login may do `perm` (manager_auth.PERMISSIONS, or "admin") — on `panel` when given;
        else 403 "not-allowed". Returns the Caller."""
        who = self._manage_ok()
        if not who.can(perm, panel):
            raise ApiError(403, "not-allowed")
        return who

    def _manage_read(self, *perms):
        """_manage_ok + reading the house's lists (devices, rooms, cards, pictures, saved cards): a login with at least
        one panel, or one of `perms` (the edit permission that goes with it); the admin always. Else 403."""
        who = self._manage_ok()
        if not (who.can("panels") or any(who.can(p) for p in perms)):
            raise ApiError(403, "not-allowed")
        return who

    def _manage_login(self):
        """The Manager's logins (service/manager_auth.py).
        GET: {"in", "setup" (no login yet: create the admin), "user"; signed in also "role", "admin", "perms" and
             "permissions" (what each one means); lockedFor / resetNeeded / triesLeft / nextLock say nothing is locked
             (the sign-in answer tells it for the name typed)}.
        PATCH {action: "setup", user, password} → only while no login exists: the admin; then sign in with it.
              {action: "login", user, password} → the login cookie (a refusal: the lock state for that name).
              {action: "logout"}.
              {action: "password", old, new} (signed in) → this login's new password (users 4+, the admin 8+).
              {action: "reset", code, password} → a new admin password with the reset command's one-time code."""
        auth, who = self.app.auth, self.client_address[0]
        if self.command in ("GET", "HEAD"):
            me, _ = auth.who(self._manage_token())
            # (v3.0.0) dataWritable false: the data folder can't be saved to — the sign-in page shows the setup error
            # (Troubleshooting → data folder), not a sign-in form whose answers would only say "locked"
            out = {"in": me is not None, "setup": not auth.exists(), "user": me.user if me else None, **auth.lock_status(),
                   "dataWritable": self.app.store.writable()}
            if me:
                out.update(me.public(), permissions=self._permission_list(), notices=auth.notices(me.user),
                           pwAt=auth.info(me.user).get("pwAt"), confirmed=auth.confirmed(self._manage_token()))
            return self._json(200, out, extra={"Cache-Control": "no-store"})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        action = req.get("action")
        if action in ("setup", "login", "reset") and not self.app.store.writable():
            # nothing can be saved: no login made, no wrong try counted, no lockout — the folder's owner is the problem
            return self._json(503, {"ok": False, "error": "data-folder"})
        if action == "logout":
            me, _ = auth.who(self._manage_token())
            auth.revoke(self._manage_token())   # (blocked on the server too, not only forgotten by this browser)
            if me:
                self._act("signin.out", who=me.user)
            return self._json(200, {"ok": True}, self._cookie(None))
        if action == "signout-others":   # (v2.7.0: the login's lid changes — every other browser's cookie stops)
            me = self._manage_ok()
            token = auth.signout_others(me)
            if not token:
                return self._json(503, {"ok": False, "error": "damaged"})
            self._act("signin.out-others")
            return self._json(200, {"ok": True}, self._cookie(token))
        if action == "seen":   # a notice ("your password was reset by …") read
            me = self._manage_ok()
            auth.notice_seen(me, req.get("id"))
            return self._json(200, {"ok": True})
        if action == "confirm":   # "confirm it's you": the own password opens 10 minutes for acting on admins
            me = self._manage_ok()
            self._set_cookie = None   # (never a renewed cookie in the confirm answer itself)
            ok, why = auth.confirm(me, req.get("password"), self._manage_token(), who)
            if not ok:
                if why == "wrong":
                    self._act("signin.wrong", who=None, target=me.user, what="confirm")
                return self._json(423 if why in ("locked", "reset-needed") else 403, {"ok": False, "error": why})
            return self._json(200, {"ok": True})
        if action == "setup":
            token, why = auth.create(req.get("user"), req.get("password"))
            if not token:
                return self._json(409 if why == "exists" else 400, {"ok": False, "error": why})
            log(f"manager: admin login created from {who}")
            return self._json(200, {"ok": True})   # (then sign in with it once)
        if action == "login":
            ok, why = auth.verify(req.get("user"), req.get("password"), who)
            # (the activity log names a login only when it is one: a name typed that isn't may be a password)
            known = auth.caller(req.get("user")) if isinstance(req.get("user"), str) else None
            if not ok:   # (the same answers for a name that isn't a login: nobody learns which names exist)
                name = req.get("user") if isinstance(req.get("user"), str) else ""
                if known:
                    self._act("signin.locked" if why in ("locked", "reset-needed") else "signin.wrong", who=None, target=known.user)
                else:
                    self._act("signin.unknown", who=None)
                return self._json(423 if why in ("locked", "reset-needed") else 403,
                                  {"ok": False, "error": why, **auth.lock_status(name), "askAdmin": why != "wrong"})
            self._act("signin.ok", who=known.user if known else None)
            return self._json(200, {"ok": True}, self._cookie(auth.token(req.get("user"))))
        if action == "password":
            me = self._manage_ok()
            token, why = auth.change(req.get("old"), req.get("new"), who, user=me.user)
            if not token:
                return self._json(423 if why in ("locked", "reset-needed") else 403 if why == "wrong" else 400, {"ok": False, "error": why})
            log(f"manager: {me.role} {me.user!r} changed its password (from {who})")
            self._act("account.password", target=me.user)
            return self._json(200, {"ok": True}, self._cookie(token))
        if action == "reset":
            # a one-time code: the reset command's (no name = the owner) or one an admin made for this login
            # (every name takes the same path in manager_auth — the same work and answers for one that isn't a login)
            name = req.get("user") if isinstance(req.get("user"), str) and req.get("user") else None
            known = auth.caller(name) if name else None
            token, why = auth.finish_reset(req.get("code"), req.get("password"), who, user=name)
            if not token:
                if why in ("wrong", "slow-down"):
                    self._act("signin.code-wrong", who=None, target=known.user if known else None)
                return self._json(403 if why == "wrong" else 429 if why == "slow-down" else 400, {"ok": False, "error": why})
            c, _ = auth.who(token)
            self._act("signin.code-used", who=c.user if c else None)
            return self._json(200, {"ok": True}, self._cookie(token))
        raise ApiError(400, '"action" must be "setup", "login", "logout", "password", "reset", "signout-others", "seen" or "confirm"')

    @staticmethod
    def _permission_list():
        return [{"id": k, "kind": kind if isinstance(kind, str) else "choice", "text": text,
                 **({} if isinstance(kind, str) else {"choices": [[c, manager_auth.CHOICE_WORDS.get(c, c)] for c in kind]})}
                for k, (kind, text) in manager_auth.PERMISSIONS.items()]

    def _manage_users(self):
        """The admin's accounts page. GET: {"users": [{user, role, created, perms, lockedFor, resetNeeded, …}],
        "permissions": [{id, kind, text}], "panels": every panel's name}.
        PATCH {action: "add", user, password, perms?} | {action: "remove", user} | {action: "password", user, password}
              (a user's new password: signs it out, opens its lockout) | {action: "perms", user, perms} (only the ones
              sent change) | {action: "unlock", user} | {action: "rename", user, name} (any login, the admin's too: it
              signs in again with the new name; the admin renaming itself gets a fresh cookie). The admin only; the
              admin's own password: /api/manage/login "password"."""
        me = self._manage_need("admin")
        auth = self.app.auth
        step = auth.confirmed(self._manage_token())   # ("confirm it's you" within 10 minutes — acting on admins)
        if self.command in ("GET", "HEAD"):
            return self._json(200, self._users_out(me, step), extra={"Cache-Control": "no-store"})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        action, name = req.get("action"), req.get("user")
        before = {u["user"].lower(): u for u in auth.list_users(me) or []}
        extra = {}
        # (a login's panel must be there now: a panel added later at that address isn't given to it by accident)
        want = (req.get("perms") or {}).get("panel") if isinstance(req.get("perms"), dict) else None
        if (action in ("add", "perms") and isinstance(want, str) and want
                and want.lower() not in set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL}):
            return self._json(400, {"ok": False, "error": "no such panel"})
        if action == "add":
            ok, why = auth.add_user(me, name, req.get("password"), req.get("perms"))
        elif action == "remove":
            ok, why = auth.remove_user(me, name, step)
            if ok:
                self.app.pictures.rename_owner(name, "")   # (its uploads: nobody's — a later login with that name doesn't get them)
                self.app.prefs.remove(name)                # (its theme, sidebar, views: a later login with that name starts fresh)
        elif action == "password":
            ok, why = auth.set_password(me, name, req.get("password"))
        elif action == "perms":
            ok, why = auth.set_perms(me, name, req.get("perms"))
        elif action == "unlock":
            ok, why = auth.unlock(me, name, step)
        elif action == "role":
            ok, why = auth.set_role(me, name, req.get("role"), req.get("password"), step)
        elif action == "owner":
            ok, why = auth.transfer_owner(me, name, step)
        elif action == "code":   # a one-time sign-in code: shown once to this admin, never stored or logged as it is
            made, why = auth.make_code(me, name, step)
            ok = made is not None
            if ok:
                extra = {"code": made[0], "until": made[1]}
        elif action == "rename":
            ok, why = auth.rename(me, name, req.get("name"))
            if ok:
                self.app.pictures.rename_owner(name, req.get("name"))   # (upload-only logins: their own uploads stay theirs)
                self.app.prefs.rename(name, req.get("name"))           # (and its look: theme, sidebar, views)
                if isinstance(name, str) and name.lower() == me.user.lower():
                    log(f"manager: the admin {me.user!r} is now {req['name']!r} (from {self.client_address[0]})")
                    self._act("account.rename", who=req["name"], target=req["name"], old=name, new=req["name"])
                    return self._json(200, {"ok": True, "users": auth.list_users(auth.caller(req["name"])), "me": req["name"]},
                                      self._cookie(auth.token(req["name"])))
        else:
            raise ApiError(400, '"action" must be "add", "remove", "password", "perms", "unlock", "rename", "role", "owner" or "code"')
        if not ok:
            code = {"no-such-user": 404, "taken": 409, "admin": 409, "already": 409, "not-admin": 409, "too-soon": 409, "not-allowed": 403,
                    "need-confirm": 403, "owner": 403, "too-many-codes": 429, "damaged": 503}.get(why, 400)
            return self._json(code, {"ok": False, "error": why})
        log(f"manager: the admin {me.user!r}: {action} {str(name)[:40]!r} (from {self.client_address[0]})")
        target = (auth.caller(req.get("name") if action == "rename" else name) or me).user if action != "remove" else str(name)
        if action == "perms":
            sent = req.get("perms") if isinstance(req.get("perms"), dict) else {}
            old = (before.get(target.lower()) or {}).get("perms") or {}
            for k in sorted(sent)[:10]:
                if old.get(k) != sent[k]:
                    self._act("account.perms", target=target, perm=k, old=old.get(k), new=sent[k])
        elif action == "role":
            self._act("account.admin" if req.get("role") == "admin" else "account.user", target=target)
        elif action == "rename":
            self._act("account.rename", target=target, old=name, new=req.get("name"))
        else:
            self._act({"add": "account.add", "remove": "account.remove", "password": "account.password-set", "unlock": "account.unlock",
                       "owner": "account.owner", "code": "account.code"}[action], target=target)
        if action in ("remove", "role") and isinstance(name, str) and name.lower() == me.user.lower():
            return self._json(200, {"ok": True, "self": True}, self._cookie(None))   # (itself removed / no admin now: signed out)
        return self._json(200, {"ok": True, **extra, **self._users_out(auth.caller(me.user) or me, step)},
                          extra={"Cache-Control": "no-store"})

    def _users_out(self, me, step):
        """The Accounts page's data: every login with its last sign-in (the activity log), the permissions in words,
        the panels, who is asking (owner?) and whether "confirm it's you" holds now."""
        last = self.app.activity.last_by("signin.ok")
        users = self.app.auth.list_users(me) or []
        for u in users:
            e = last.get(u["user"].lower())
            u["lastSignIn"] = {"at": e["at"], "agent": e.get("agent"), "from": e.get("from")} if e else None
        return {"users": users, "permissions": self._permission_list(), "you": me.user, "owner": me.owner, "confirmed": step,
                "panels": sorted(set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL})}

    def _manage_prefs(self):
        """This login's own look in the Manager (service/manager_prefs.py): GET → {theme, pinned, views, defaultView};
        PATCH {theme?, pinned?, views?: {page: view | null}, defaultView?} → {ok, prefs} (only the fields sent change).
        Any login, for itself only."""
        me = self._manage_ok()
        if self.command in ("GET", "HEAD"):
            return self._json(200, self.app.prefs.get(me.user))
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        prefs, why = self.app.prefs.update(me.user, self._json_body())
        if not prefs:
            return self._json(400, {"ok": False, "error": why})
        return self._json(200, {"ok": True, "prefs": prefs})

    def _manage_activity(self, csv_out=False):
        """GET /api/manage/activity?since=&before=&kinds=a,b&who=&q=&limit= → {events, more, now} newest first
        (service/activity_log.py). An admin sees everything; any other login only what it did or what was done to it
        (its sign-ins, its rights). /api/manage/activity.csv: the admins' export (at most every 10 s)."""
        me = self._manage_ok()
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        q = self._query(8)

        def one(k):
            return (q.get(k) or [""])[0][:200]

        def num(k):
            return float(one(k)) if re.fullmatch(r"\d{1,12}(\.\d{1,6})?", one(k)) else None
        kinds = [k for k in one("kinds").split(",") if k][:16]
        allow = None
        if not me.admin:
            # what it did itself, and its own sign-ins / account changes — since the login was made (an older login
            # with the same name isn't its history)
            mine, born, uid = me.user.lower(), float(self.app.auth.info(me.user).get("created") or 0), self.app.auth.uid_of(me.user)

            def allow(e):
                if e["at"] < born:
                    return False
                # by its stable id where the event has one (a renamed login taking a removed one's name isn't it), else the name
                by_me = e.get("wuid") == uid if uid and e.get("wuid") else str(e.get("who") or "").lower() == mine
                if by_me:
                    return True
                about = e.get("tuid") == uid if uid and e.get("tuid") else str(e.get("target") or "").lower() == mine
                return about and activity_log.KINDS.get(e["kind"]) in ("signins", "accounts")
        who = one("who") or None
        if csv_out:
            if not me.admin:
                raise ApiError(403, "not-allowed")
            if time.monotonic() - self.app.last_export < 10:
                return self._json(429, {"ok": False, "error": "Exported a moment ago — try again in a few seconds"})
            self.app.last_export = time.monotonic()
            events, _ = self.app.activity.read(since=num("since"), before=num("before"), kinds=kinds, who=who, q=one("q") or None,
                                               limit=None, export=True)
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["time (UTC)", "area", "kind", "by", "about", "from", "browser", "details"])
            safe = lambda v: ("'" + v) if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r") else v  # noqa: E731
            for e in events:
                w.writerow([safe(x) for x in (time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(e["at"])), activity_log.KINDS.get(e["kind"], ""),
                                              e["kind"], e.get("who") or "", e.get("target") or "", e.get("from") or "", e.get("agent") or "",
                                              json.dumps(e.get("data") or {}, ensure_ascii=False))])
            self._act("settings.change", what="export", count=len(events))
            return self._send(200, buf.getvalue().encode("utf-8"), "text/csv; charset=utf-8",
                              {"Content-Disposition": 'attachment; filename="skypane-activity.csv"', "Cache-Control": "no-store"})
        lim = one("limit")
        events, more = self.app.activity.read(since=num("since"), before=num("before"), kinds=kinds, who=who, q=one("q") or None,
                                              limit=int(lim) if lim.isdecimal() else 200, allow=allow)
        return self._json(200, {"events": events, "more": more, "now": time.time()}, extra={"Cache-Control": "no-store"})

    def _manage_activity_retention(self):
        """(v2.9.2) GET → {days, maxBytes, choices} (any login: the Timeline's ranges go as far back as
        this); PATCH {days: 30 | 90 | 365} (admins only) → saved and applied at once — a shorter one deletes the older
        events now (the Manager asks first; 403 need-confirm until this sign-in confirmed its password) → {ok, days,
        removed}. The change itself is logged."""
        if self.command in ("GET", "HEAD"):
            self._manage_ok()
            return self._json(200, self.app.activity.info(), extra={"Cache-Control": "no-store"})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        self._manage_need("admin")
        req = self._json_body()
        days = req.get("days")
        # (gate 1: a shorter time deletes history — only after "confirm it's you", as the account changes)
        if type(days) is not int or days not in activity_log.CHOICES:
            raise ApiError(400, "days must be 30, 90 or 365")
        if days < self.app.activity.keep_days and not self.app.auth.confirmed(self._manage_token()):
            return self._json(403, {"ok": False, "error": "need-confirm"})
        try:
            r = self.app.activity.set_retention(days)
        except ValueError:
            raise ApiError(400, "days must be 30, 90 or 365") from None
        except OSError:
            raise ApiError(503, "The setting can't be saved right now") from None
        if r["old"] != r["new"]:
            self._act("settings.change", what="activity-retention", old=r["old"], new=r["new"], removed=r["removed"])
        return self._json(200, {"ok": True, "days": r["new"], "removed": r["removed"], "maxBytes": self.app.activity.max_bytes})

    def _manage_guest_lockdown(self):
        """v2.7.0 guest lockdown (admins only): GET → {lockdown: {switch, panels, mode, idle, blurCalendar}, switches: [{id,
        label, room, guestMode}], panels: [{id, name}]}; PATCH {switch?: id | null, panels?: [ids], mode?: "pin" | "dark",
        idle?: seconds, blurCalendar?: [ids] (v2.9.3: the panels whose calendar is blurred while the switch is on —
        a choice of its own, independent of panels)} → saved (house/guest-lockdown.json). The chosen panels hear it in
        their page config and their status answer (App.lockdown_for)."""
        self._manage_need("admin")
        model = self.app.house_model() or {}
        guests = {int(i) for i in model.get("guestModes") or [] if str(i).isdecimal()}
        # (v3.0.0) likely: a guest mode, a virtual switch or one named "guest" — listed first; lights and plugs after
        likely = lambda d: (d["id"] in guests or "guest" in str(d.get("label") or "").lower()
                            or "virtual" in str(d.get("type") or d.get("driver") or "").lower())   # noqa: E731
        sw = [{"id": d["id"], "label": d.get("label"), "room": d.get("room") or "", "guestMode": d["id"] in guests, "likely": likely(d)}
              for d in model.get("devices") or [] if isinstance(d, dict) and isinstance(d.get("id"), int)
              and ("switch" in (d.get("attrs") or []) or d["id"] in guests)]
        if self.command in ("GET", "HEAD"):
            sw.sort(key=lambda d: (not d["guestMode"], not d["likely"], str(d["label"]).lower()))
            return self._json(200, {"lockdown": self.app.guest_lockdown(), "switches": sw,
                                    "panels": [{"id": p, "name": n} for p, n in self.app.panel_names()]})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        cur = self.app.guest_lockdown()
        if set(req) - {"switch", "panels", "mode", "idle", "blurCalendar"}:
            raise ApiError(400, 'send "switch", "panels", "mode", "idle" and / or "blurCalendar"')
        if "switch" in req:
            if req["switch"] is not None and not (isinstance(req["switch"], int) and not isinstance(req["switch"], bool) and 0 < req["switch"] < 10 ** 9):
                raise ApiError(400, '"switch": a device id or null')
            # (only a switch the hub has — one that turns on and off — or one of its guest modes; never any number)
            if req["switch"] is not None and req["switch"] not in {d["id"] for d in sw}:
                raise ApiError(400, "That isn't one of the hub's switches — pick one from the list")
            cur["switch"] = req["switch"]
        if "panels" in req:
            known = {p for p, _ in self.app.panel_names()}
            if not isinstance(req["panels"], list) or not all(isinstance(p, str) and p.lower() in known for p in req["panels"]):
                raise ApiError(400, '"panels": the ids of panels that exist')
            cur["panels"] = sorted({p.lower() for p in req["panels"]})
        if "blurCalendar" in req:   # (v2.9.3)
            known = {p for p, _ in self.app.panel_names()}
            if not isinstance(req["blurCalendar"], list) or len(req["blurCalendar"]) > 100 or \
                    not all(isinstance(p, str) and p.lower() in known for p in req["blurCalendar"]):
                raise ApiError(400, '"blurCalendar": the ids of panels that exist')
            cur["blurCalendar"] = sorted({p.lower() for p in req["blurCalendar"]})
        if "mode" in req:
            if req["mode"] not in GUEST_LOCKDOWN_MODES:
                raise ApiError(400, '"mode": "pin" or "dark"')
            cur["mode"] = req["mode"]
        if "idle" in req:
            if not (isinstance(req["idle"], int) and not isinstance(req["idle"], bool) and 10 <= req["idle"] <= 600):
                raise ApiError(400, '"idle": 10 to 600 seconds')
            cur["idle"] = req["idle"]
        target = self.app.data_dir / "house" / "guest-lockdown.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(f".{target.name}.{os.getpid()}.tmp")
        tmp.write_text(json.dumps(cur, indent=1), encoding="utf-8")
        os.replace(tmp, target)
        self._act("settings.lockdown", mode=cur["mode"], count=len(cur["panels"]), on=bool(cur["switch"]), added=len(cur["blurCalendar"]))
        return self._json(200, {"ok": True, "lockdown": cur})

    def _manage_settings(self):
        """GET: the house settings (secrets only as set / not set). PATCH {set: {KEY: value or null}} → saved; run_all
        restarts the services with them within a few seconds. The admin only."""
        self._manage_need("admin")
        hs = self.app.settings
        if self.command in ("GET", "HEAD"):
            return self._json(200, {"fields": hs.public(), "status": self._settings_status(),
                                    "checkedAt": self.app.health.checked_at})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        try:
            hs.change(req.get("set"))
        except house_settings.Invalid as e:
            raise ApiError(400, str(e))
        log(f"manager: settings changed ({', '.join(sorted(req['set']))}) from {self.client_address[0]}")
        self._act("settings.change", keys=sorted(req["set"]))   # (which ones — never their values)
        # (restarting: run_all notices the file and starts everything again; a server run on its own — a laptop test —
        # keeps running, so the Manager doesn't wait for a restart that never comes)
        return self._json(200, {"ok": True, "restarting": os.environ.get("SKYPANE_SUPERVISED") == "1"})

    # (v2.7.0) which health problems belong to which group of the Integrations page
    SETTINGS_PROBLEMS = {"Hubitat": ("hubitat",), "UniFi Protect": ("protect",), "Guest Wi-Fi": ("unifi", "guestwifi", "guest"),
                         "MQTT broker": ("mqtt",), "Cameras": ("go2rtc", "camera", "cameras", "video"), "Calendars": ("calendar",)}

    def _settings_status(self):
        """{group: {"state": "ok" | "problem" | "off", "words", "since"}} — from the health monitor (words only)."""
        parts = self.app.health_parts()
        st = self.app.settings.load()
        # (the same parts as the health pill: a broker the server doesn't use, no calendar at all → "off", never "working")
        on = {"Hubitat": parts["hub"], "MQTT broker": parts["broker"], "Cameras": parts["cameras"],
              "UniFi Protect": bool((st.get("PROTECT_HOST") or "").strip()), "Guest Wi-Fi": bool((st.get("UNIFI_HOST") or "").strip()),
              "Calendars": bool(self.app.calendars.house())}
        probs = self.app.health.current()
        out = {}
        for group, kinds in self.SETTINGS_PROBLEMS.items():
            mine = [p for p in probs if re.split(r"[:.]", p["id"])[0] in kinds]
            if mine:
                out[group] = {"state": "problem", "words": mine[0]["title"], "since": mine[0].get("first"), "count": len(mine)}
            else:
                out[group] = {"state": "ok" if on.get(group) else "off", "words": "", "since": None}
        # (v3.0.0) the weather device, as the bridge last said (the page words it: reason, device, last change)
        cfg, wst = self.app.weather_setting(), self.app.notifier.weather or {}
        if not (cfg.get("on") and cfg.get("device")):
            out["Weather"] = {"state": "off", "words": "", "since": None}
        else:
            bad = wst.get("reason") in ("stale", "no-data") or not wst
            out["Weather"] = {"state": "problem" if bad else "ok", "words": "", "since": None, "reason": wst.get("reason") if wst else "waiting",
                              "device": ((wst.get("device") or {}).get("name") or "") if wst else "", "updatedAt": wst.get("updatedAt") if wst else None}
        return out

    # ---- Manager: what the panels may switch (house-wide; kept in the main panel's settings.neverSwitch) ---------
    def _never_now(self, settings, model):
        """The effective "never switch" ids: an old explicit list (neverSwitch, from the panel's former popup) as it
        is; otherwise the name rule (sprinklers, freezer… — also for devices added later) with the owner's exceptions
        (switchRule {"allow": {id: true}, "never": {id: true}}, what the Manager saves)."""
        hm = house_devices.house_model
        s = settings or {}
        never = s.get("neverSwitch")
        if isinstance(never, dict):
            return {int(k) for k, v in never.items() if v and str(k).isdecimal()}
        rule = s.get("switchRule") if isinstance(s.get("switchRule"), dict) else {}
        ids = lambda d: {int(k) for k, v in (d if isinstance(d, dict) else {}).items() if v and str(k).isdecimal()}  # noqa: E731
        try:
            default = hm.switchable(model, []) - hm.switchable(model, None)
        except (KeyError, TypeError):
            default = set()
        return (default - ids(rule.get("allow"))) | ids(rule.get("never"))

    def _manage_never(self):
        """GET: {"switchable": ids a panel could switch, "never": ids no panel may}. PATCH {id, allowed: bool}. The admin
        only (what no panel may switch: the sprinklers, the freezer…)."""
        self._manage_need("admin")
        model = self.app.house_model() or {"rooms": [], "locks": [], "things": []}
        hm = house_devices.house_model
        try:
            switchable = hm.switchable(model, [])
        except (KeyError, TypeError):
            switchable = set()
        if self.command in ("GET", "HEAD"):
            main = self.app.store.get(PIN_GUARDED_PANEL)["data"].get("settings") or {}
            # (byName: what "automatic" is — the name rule alone, without the owner's exceptions)
            return self._json(200, {"switchable": sorted(switchable), "never": sorted(self._never_now(main, model)),
                                    "byName": sorted(self._never_now({}, model))})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        did, allowed = req.get("id"), req.get("allowed")
        if not isinstance(did, int) or isinstance(did, bool) or did not in switchable or not isinstance(allowed, bool):
            raise ApiError(400, '"id" (a switchable device) and "allowed" (true / false)')
        try:
            self._set_allowed(model, [did], allowed)
        except StoreError as e:
            return self._json(e.code, e.body)
        return self._json(200, {"ok": True})

    def _set_allowed(self, model, ids, allowed):
        """The panels may (allowed) or may not switch these devices (checked switchable before): one change to the main
        panel's switch rule, the panels told. StoreError when it can't be saved."""
        def fn(data):
            settings = dict(data.get("settings") or {})
            by_name = self._never_now({}, model)
            if isinstance(settings.get("neverSwitch"), dict):   # an old explicit list: edit it as it is
                never = self._never_now(settings, model)
                for did in ids:
                    (never.discard if allowed else never.add)(did)
                settings["neverSwitch"] = {str(i): True for i in sorted(never)}
            else:   # only the exceptions to the name rule
                rule = settings.get("switchRule") if isinstance(settings.get("switchRule"), dict) else {}
                allow = {k: True for k, v in (rule.get("allow") or {}).items() if v}
                nev = {k: True for k, v in (rule.get("never") or {}).items() if v}
                for did in ids:
                    allow.pop(str(did), None)
                    nev.pop(str(did), None)
                    if allowed and did in by_name:
                        allow[str(did)] = True   # the name rule says never: allowed by the owner
                    elif not allowed and did not in by_name:
                        nev[str(did)] = True
                settings["switchRule"] = {"allow": allow, "never": nev}
            return {"settings": settings}
        rev = self.app.store.modify(PIN_GUARDED_PANEL, fn, create=True)
        self.app.notifier.changed(PIN_GUARDED_PANEL, rev, ["settings"], "manager")

    # ---- Manager: the owner's pictures (service/pictures.py) -----------------------------------------------------
    def _picture_users(self, pid):
        """[(device id, label)] of the devices whose picture is this upload."""
        ov = self.app.devices.load()["overrides"]
        labels = {d.get("id"): d.get("label") for d in (self.app.house_model() or {}).get("devices") or [] if isinstance(d, dict)}
        return [(int(k), labels.get(int(k)) or f"#{k}") for k, o in ov.items()
                if str(k).isdecimal() and isinstance(o, dict) and o.get("icon") == f"up:{pid}"]

    def _picture_panels(self, pid):
        """[(panel id, its name)] of the panels whose background is this upload."""
        out = []
        for p in sorted(set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL}):
            s = self.app.store.get(p)["data"].get("settings") or {}
            if isinstance(s.get("look"), dict) and s["look"].get("background") == f"up:{pid}":
                out.append((p, s.get("panelName") or ("Main panel" if p == PIN_GUARDED_PANEL else p)))
        return out

    def _picture_on_people(self, p, icon):
        """A person or a calendar on panel p has this picture ("up:<id>") as its icon."""
        s = self.app.store.get(p)["data"].get("settings") or {}
        return any(isinstance(x, dict) and x.get("icon") == icon for k in ("people", "calendars")
                   for x in (s.get(k) if isinstance(s.get(k), list) else []))

    OTHER_PANEL = {"kind": "otherPanel"}   # (v3.0.0: the uses are structured — the Manager says them in its language)

    def _picture_uses(self, who=None):
        """{upload id: [what uses it]} - device pictures, panel backgrounds, cards on every panel's Home and room layouts
        (an icon, a picture, list items, picture rows, photos...), people and calendar icons, saved cards. (Room icons are
        line icons only.) v3.0.0: each use is structured — {kind: "device", name} | {kind: "background", panel, main} |
        {kind: "cards", n, panel, main, where: "home" | "rooms" | "room", room?} | {kind: "person" | "calendar", name, panel,
        main} | {kind: "savedCard", name} | {kind: "otherPanel"} — and the Manager puts it in words (pictures.js useWords).
        who (a Caller): a panel it doesn't see is only {kind: "otherPanel"} (still counted: never its name)."""
        up = re.compile(r"up:([0-9a-f]{16})")
        uses = {}
        hidden = False

        def add(pid, text):
            if hidden:
                if self.OTHER_PANEL not in uses.get(pid, []):
                    uses.setdefault(pid, []).append(self.OTHER_PANEL)
            else:
                uses.setdefault(pid, []).append(text)

        def found(v, out):   # every own picture anywhere inside a card
            if isinstance(v, str):
                m = up.fullmatch(v)
                if m:
                    out.add(m[1])
            elif isinstance(v, dict):
                for x in v.values():
                    found(x, out)
            elif isinstance(v, list):
                for x in v:
                    found(x, out)
            return out
        model = self.app.house_model() or {}
        labels = {d.get("id"): d.get("label") for d in model.get("devices") or [] if isinstance(d, dict)}
        rooms = {r.get("id"): r.get("name") for r in model.get("rooms") or [] if isinstance(r, dict)}
        for k, o in self.app.devices.load()["overrides"].items():
            if str(k).isdecimal() and isinstance(o, dict) and isinstance(o.get("icon"), str) and up.fullmatch(o["icon"]):
                add(o["icon"][3:], {"kind": "device", "name": labels.get(int(k)) or "#" + str(k)})
        for p in sorted(set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL}):
            hidden = who is not None and not who.sees(p)
            s = self.app.store.get(p)["data"].get("settings") or {}
            pn = {"panel": s.get("panelName") or (None if p == PIN_GUARDED_PANEL else p), "main": p == PIN_GUARDED_PANEL}
            bg = s["look"].get("background") if isinstance(s.get("look"), dict) else None
            if isinstance(bg, str) and up.fullmatch(bg):
                add(bg[3:], {"kind": "background", **pn})
            grids = s.get("roomGrids") if isinstance(s.get("roomGrids"), dict) else {}
            places = [({"where": "home"}, s.get("homeGrid"))] + [({"where": "rooms"} if r == "*" else {"where": "room", "room": str(rooms.get(r) or r)}, g)
                                                               for r, g in grids.items()]
            for where, grid in places:
                n = {}
                for c in (grid.get("cards") if isinstance(grid, dict) and isinstance(grid.get("cards"), list) else []):
                    for i in found(c, set()):
                        n[i] = n.get(i, 0) + 1
                for i, cnt in n.items():
                    add(i, {"kind": "cards", "n": cnt, **pn, **where})
            for key, kind in (("people", "person"), ("calendars", "calendar")):
                for x in s.get(key) if isinstance(s.get(key), list) else []:
                    if isinstance(x, dict) and isinstance(x.get("icon"), str) and up.fullmatch(x["icon"]):
                        add(x["icon"][3:], {"kind": kind, "name": x.get("name") or x.get("id"), **pn})
        hidden = False
        for t in self.app.templates.all():
            for i in found(t.get("card"), set()):
                add(i, {"kind": "savedCard", "name": t.get("name")})
        return uses

    def _manage_cards(self):
        """GET: the cards people made (full, with what the scan found and the permissions in plain words, and which
        panels use each). PATCH {action: "check", card} (what installing it would mean — nothing saved) |
        {action: "add", card, replace?} | {action: "delete", id} — the changes need the "cards" permission; the panels
        a card is used on: only those this login sees. Reading: a login with a panel, or "cards"."""
        me = self._manage_read("cards")
        lib = self.app.cards
        if self.command in ("GET", "HEAD"):
            used = {}
            for p in me.panels(sorted(set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL})):
                st_ = self.app.store.get(p)["data"].get("settings") or {}
                rooms_ = st_.get("roomGrids") if isinstance(st_.get("roomGrids"), dict) else {}
                for grid in [st_.get("homeGrid"), *rooms_.values()]:   # (Home and every room's own grid)
                    cards_ = grid.get("cards") if isinstance(grid, dict) else None
                    for c in cards_ if isinstance(cards_, list) else []:
                        if isinstance(c, dict) and str(c.get("t", "")).startswith("card:"):
                            used.setdefault(c["t"][5:], set()).add(p)
            # (v2.6.0) when it was checked and installed, and whether what it does changed since (its file edited on disk)
            return self._json(200, {"cards": [{**c, "flags": cards.scan(c), "words": cards.plain_words(c), "used": sorted(used.get(c["id"], ())),
                                               "checkedAt": c.get("checkedAt") or c.get("added"), "changed": cards.code_sha(c) != c.get("sha")}
                                              for c in lib.all()]})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        self._manage_need("cards")
        req = self._json_body()
        action = req.get("action")
        try:
            if action == "check":
                # (the scan reads the card as sent too: what the cleaning takes out is an attempt worth knowing about)
                c = cards.validate(req.get("card"))
                old = lib.get(c["id"])
                return self._json(200, {"ok": True, "card": c, "flags": cards.scan(c, req.get("card")), "words": cards.plain_words(c),
                                        "exists": old is not None,
                                        **({"existing": {k: old.get(k) for k in ("name", "author", "version", "tier")}} if old else {})})
            if action == "add":
                c = lib.add(req.get("card"), replace=req.get("replace") is True)
                log(f"manager: card {c['id']} {c['version']} ({c['tier']}) added from {self.client_address[0]}")
                self._act("library.card", target=c.get("name"), id=c["id"])
                self.app.notifier.cards_changed()
                return self._json(200, {"ok": True, "card": c})
            if action == "delete":
                lib.delete(req.get("id"))
                log(f"manager: card {req.get('id')} deleted from {self.client_address[0]}")
                self._act("library.card-remove", id=req.get("id"))
                self.app.notifier.cards_changed()
                return self._json(200, {"ok": True})
        except cards.Invalid as e:
            return self._json(400 if str(e) != "exists" else 409, {"ok": False, "error": str(e)})
        raise ApiError(400, "unknown action")

    def _manage_pictures(self):
        """GET: the uploads (+ which devices use each), the styles with their sizes, the device types.
        PATCH {action: "upload", name, style, types, data (base64)} | {action: "edit", id, name?, types?} |
              {action: "delete", id, password?} — a picture in use needs the Manager password again (and then the
              devices go back to their automatic picture). Backgrounds need "backgrounds" (upload only: uploading, and
              renaming / removing its own uploads while nothing uses them; full: everything), the other styles "icons";
              removing one that changes a panel (its background, a person's or calendar's icon) also needs that panel.
        Reading: a login with a panel, "backgrounds", "icons" or "devices" (a device's picture is picked from them)."""
        me = self._manage_read("backgrounds", "icons", "devices")
        lib = self.app.pictures
        if self.command in ("GET", "HEAD"):
            # (v2.6.0) per upload: its size and dimensions, and the panels this login sees that use it as their background
            sees = set(me.panels(sorted(set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL})))
            ups = [dict(u, panels=[{"id": p, "name": n} for p, n in self._picture_panels(u["id"]) if p in sees] if u.get("style") == "background" else [])
                   for u in lib.detailed()]
            return self._json(200, {"uploads": ups, "used": self._picture_uses(me), **lib.info()})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        action = req.get("action")
        target = lib.get(req.get("id")) if action in ("edit", "delete") and isinstance(req.get("id"), str) else None
        style = target["style"] if target else req.get("style")
        if style == "background":
            if not me.can("backgrounds"):
                raise ApiError(403, "not-allowed")
            if target and me.level("backgrounds") != "full":   # (upload only: its own, while nothing uses it)
                if str(target.get("by") or "").lower() != me.user.lower():
                    raise ApiError(403, "not-allowed")
                if self._picture_uses().get(target["id"]):   # (renaming too: the owner's rule, the account page says so)
                    return self._json(409, {"ok": False, "error": "in-use-own", "uses": self._picture_uses(me).get(target["id"]) or []})
        elif not me.can("icons"):
            raise ApiError(403, "not-allowed")
        try:
            if action == "upload":
                item = lib.add(req.get("name"), req.get("style"), req.get("types"), req.get("data"), by=me.user)
                log(f"manager: picture {item['id']} added ({item['w']}x{item['h']} {item['ext']}) from {self.client_address[0]}")
                self._act("library.upload", target=item.get("name"), what=item.get("style"))
                return self._json(200, {"ok": True, "picture": item})
            if action == "edit":
                return self._json(200, {"ok": True, "picture": lib.edit(req.get("id"), req.get("name"), req.get("types"))})
            if action == "delete":
                pid = req.get("id")
                if not lib.get(pid):
                    raise ApiError(404, "no such picture")
                users, panels = self._picture_users(pid), self._picture_panels(pid)
                uses = self._picture_uses().get(pid) or []
                gone = f"up:{pid}"
                # the panels it changes: its background, or a person's / calendar's icon there
                changes = {p for p, _ in panels} | {p for p in set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL}
                                                     if self._picture_on_people(p, gone)}
                if uses:
                    if any(not me.sees(p) for p in changes):
                        raise ApiError(403, "not-allowed")   # (it would change a panel this login may not change)
                    if req.get("password") is None:
                        return self._json(409, {"ok": False, "error": "in-use", "uses": self._picture_uses(me).get(pid) or uses})
                    # (the caller's own password: a user's wrong tries count for that user, never lock the admin)
                    ok, why = self.app.auth.verify(me.user, req.get("password"), self.client_address[0])
                    if not ok:
                        return self._json(423 if why in ("locked", "reset-needed") else 403, {"ok": False, "error": why})
                    model = self.app.house_model() or {}
                    for did, _ in users:   # those devices go back to their automatic picture
                        entry = next((d for d in model.get("devices") or [] if isinstance(d, dict) and d.get("id") == did), {"options": []})
                        self.app.devices.change(did, {"icon": None}, entry)
                    for p, _ in panels:   # those panels go back to the built-in landscape
                        rev = self.app.store.modify(p, lambda data: {"settings": panel_settings.apply(data.get("settings"), {"look.background": "mountains"})})
                        self.app.notifier.changed(p, rev, ["settings"], "manager")
                    # people and calendars with it as their icon go back to their colour (cards using it show no picture
                    # until another is picked)
                    for p in sorted(set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL}):
                        if not self._picture_on_people(p, gone):
                            continue

                        def unicon(data):
                            st_ = dict(data.get("settings") or {})
                            for k in ("people", "calendars"):
                                if isinstance(st_.get(k), list):
                                    st_[k] = [{kk: vv for kk, vv in x.items() if not (kk == "icon" and vv == gone)}
                                              if isinstance(x, dict) else x for x in st_[k]]
                            return {"settings": st_}
                        rev = self.app.store.modify(p, unicon)
                        self.app.notifier.changed(p, rev, ["settings"], "manager")
                lib.delete(pid)
                log(f"manager: picture {pid} deleted from {self.client_address[0]}")
                self._act("library.remove", id=pid)
                return self._json(200, {"ok": True, "cleared": len(uses)})
        except pictures.Invalid as e:
            raise ApiError(400, str(e))
        raise ApiError(400, '"action" must be "upload", "edit" or "delete"')

    # ---- Manager: the guest Wi-Fi (house-wide; the same files as /api/guest-wifi, without the panel PIN) ---------
    def _manage_health(self):
        """GET /api/manage/health (any login): {ok, checkedAt, problems, log, panels, parts, history} (health.Monitor.api;
        ?log=N: up to health.LOG_MAX log events — the Timeline). PATCH {action: "check"} (admins, at most every 10 s):
        every check runs now ("Check now" on Integrations / Health)."""
        who = self._manage_need()
        if self.command == "PATCH":
            if not who.admin:
                raise ApiError(403, "not-allowed")
            if self._json_body().get("action") != "check":
                raise ApiError(400, '"action" must be "check"')
            if time.monotonic() - self.app.last_check_now < 10:
                return self._json(429, {"ok": False, "error": "Checked a moment ago — try again in a few seconds"})
            self.app.last_check_now = time.monotonic()
            self.app.health.run_once(manual=True)
            self._act("settings.check")
            return self._json(200, {"ok": True, **self._health_for(who)}, extra={"Cache-Control": "no-store"})
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        n = self._query(4).get("log", ["100"])[0]
        n = max(1, min(health.LOG_MAX, int(n))) if n.isdecimal() else 100
        return self._json(200, self._health_for(who, n), extra={"Cache-Control": "no-store"})

    def _health_for(self, who, log_n=100):
        """The health monitor's answer as `who` may see it (the Health page, the pill, the Overview). A user who isn't
        the admin sees only its own panels, and no details of the other problems (they may name addresses)."""
        out = self.app.health.api([(p, n) for p, n in self.app.panel_names() if who.sees(p)], log_n=log_n)
        out["history"] = self.app.health.history_api()
        out["parts"] = self.app.health_parts()   # (what is set up at all: the Manager's pill shows the rest as "not set up")
        # which page a panel shows, in words ("room:living-room" → "Living Room"); where it checked in from:
        # the admin only (an address)
        names = self._page_words()
        for p in out["panels"]:
            info = p.get("info")
            if isinstance(info, dict):
                if info.get("page"):
                    info["page"] = names.get(info["page"]) or ("a room page" if info["page"].startswith("room:") else info["page"])
                if not who.admin:
                    info.pop("from", None)
        if not who.admin:
            def mine(e):
                return not e["id"].startswith("panel:") or who.sees(e["id"][6:])

            def hide(e):
                return e if e["id"].startswith("panel:") else {**e, "details": ""}
            out["problems"] = [hide(e) for e in out["problems"] if mine(e)]
            out["log"] = [hide(e) for e in out["log"] if mine(e)]
            out["ok"] = not out["problems"]
        return out

    def _manage_overview(self):
        """GET /api/manage/overview (any login): the house at a glance (service/overview.py) — the health as this login
        sees it (_health_for), the alerts waiting on its panels, what needs a look; device counts only for a login that
        may read devices (a panel or "devices", as GET /api/manage/devices); Acknowledge (canAck) and the PIN state for
        the admin only."""
        who = self._manage_need()
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        live = getattr(self.app, "live", None)
        seen = live.seen() if live is not None else {}
        catalog = None
        if who.can("panels") or who.can("devices"):
            catalog = [d for d in ((self.app.house_model() or {}).get("devices") or []) if isinstance(d, dict)]
        out = overview.build(self._health_for(who), time.time(), alerts=live.alerts() if live is not None else None,
                             alerts_heard=seen.get("alerts") is not None, catalog=catalog,
                             live=live.devices() if live is not None and catalog is not None else None,
                             state_heard=seen.get("state") is not None, admin=who.admin,
                             pin_set=who.admin and self.app.pin.is_set(), sees=who.sees,
                             has_panels=who.can("panels"))
        out["broker"] = self.app.notifier.connected()   # (None: no broker set up · True / False: connected or not)
        out["bridge"] = self.app.notifier.bridge() if out["broker"] is not None else None   # online / offline / unknown
        out["heard"] = seen   # (when the live state last heard each topic: the page says how old it is when one is down)
        return self._json(200, out, extra={"Cache-Control": "no-store"})

    def _manage_alerts(self):
        """PATCH /api/manage/alerts {action: "ack", id | tag | all: true, pin?} — the admin acknowledges alerts waiting
        on the panels (the owner, the design notes decision 1: every level, the admin only). A level 4–5 needs the
        panel PIN (when one is set) — checked as a panel's Dismiss is: the same PanelPin, this address's "alert" counter
        and lock-outs (403 pin-required / wrong-pin, 423 locked, with lockedFor). Then the same message a panel's Dismiss
        sends goes to the bridge on its own topic (MANAGER_ACK_TOPIC, by "manager-<login>"): Hubitat hears it was the
        Manager, and who. At most MANAGER_ACK_RATE a minute (the bridge's own budget, never the panels'): the rest are
        left for the next press. A level 4–5 with no panel PIN set needs {"confirm": true} (409 confirm-no-pin first).
        → {ok, acked: [ids], left: n, by}; 404 not-waiting; 429 too-many {retryIn}; 503 no-broker / no-bridge (checked
        before the PIN: no try is used up)."""
        me = self._manage_need("admin")
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        if req.get("action") != "ack":
            raise ApiError(400, '"action" must be "ack"')
        live = getattr(self.app, "live", None)
        waiting = live.alerts() if live is not None else []
        if req.get("all") is True:
            targets = waiting
        elif isinstance(req.get("id"), str) and live_state.ALERT_ID.fullmatch(req["id"]):
            targets = [a for a in waiting if a["id"] == req["id"]]
        elif isinstance(req.get("tag"), str) and live_state.TAG_RE.fullmatch(req["tag"]):
            targets = [a for a in waiting if a["tag"] == req["tag"]]
        else:
            raise ApiError(400, 'say which: "id", "tag" or "all": true')
        if not targets:
            return self._json(404, {"ok": False, "error": "not-waiting"})
        send = getattr(self.app.notifier, "ack_alert", None)
        if send is None or not self.app.notifier.connected():
            return self._json(503, {"ok": False, "error": "no-broker"})
        if self.app.notifier.bridge() == "offline":   # (it said so: nobody would hear the acknowledgement)
            return self._json(503, {"ok": False, "error": "no-bridge"})
        now = time.monotonic()
        sent = self.app.manager_acks = [t for t in self.app.manager_acks if now - t < 60]
        room = MANAGER_ACK_RATE - len(sent)
        if room <= 0:
            return self._json(429, {"ok": False, "error": "too-many", "retryIn": max(1, math.ceil(60 - (now - sent[0])))})
        pin, ip = self.app.pin, self.client_address[0]
        if any(a["lvl"] >= 4 for a in targets):
            if pin.is_set():
                if req.get("pin") is None:   # (not asked yet: not a wrong try)
                    return self._json(403, {"ok": False, "error": "pin-required", "lockedFor": pin.locked_for(ip, "alert")})
                result = pin.verify(req.get("pin"), ip, "alert")
                if result not in ("ok", "unset"):
                    return self._verify_answer(pin, result, ip, "alert")
            elif req.get("confirm") is not True:   # (no PIN set — as on a panel — but the admin says so once)
                return self._json(409, {"ok": False, "error": "confirm-no-pin"})
        by = manager_panel(me.user)
        acked = []
        for a in targets[:room]:
            if not send(a["id"], a["lvl"], by):
                break
            acked.append(a["id"])
            self.app.manager_acks.append(now)
        if live is not None:
            live.forget_alerts(acked)
        log(f"manager: {len(acked)} alert(s) acknowledged by {me.user} from {ip}")
        if acked:
            self._act("panel.ack", count=len(acked))
        if not acked:
            return self._json(503, {"ok": False, "error": "no-broker"})
        return self._json(200, {"ok": True, "acked": acked, "left": len(targets) - len(acked), "by": by})

    def _panel_health(self, panel):
        """GET /api/panel/<id>/health — the panel's status bars (status.js): {"v": 1, "n", "lvl", "titles", "kinds",
        "mqtt"}: the warnings / alerts up (short titles only, never details: anyone at a panel can read it; other
        panels being offline left out) and whether the server has a broker.
        ?checkin=1[&version=…&page=…] = the panel itself says it's there (the Manager's Health page) — only for a panel
        that is set up. (A laptop viewing the page asks without checkin: it doesn't make a missing tablet look fine.)
        No login (the tablets have none yet): the Health page shows the address each check-in came from."""
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        pid = panel.lower()
        if not PANEL_RE.fullmatch(pid):
            raise ApiError(400, "Invalid panel id")
        try:
            q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "", max_num_fields=8)
        except ValueError:   # (more than 8 fields: no check-in)
            q = {}
        if q.get("checkin") == ["1"] and pid in {p for p, _ in self.app.panel_names()}:
            self.app.health.checkin(pid, {**{k: v[0] for k, v in q.items() if k in ("version", "page") and v},
                                          "from": self.client_address[0]})
        # (v2.7.2: this panel's guest lockdown as now set — an open panel follows a change on Guest Wi-Fi within its next
        # poll, without a reload: layouts/v4/shared/guestlock.js; null = it doesn't lock down)
        lock = self.app.lockdown_for(pid)   # (v2.9.3: {switch, mode: "pin" | "dark" | "none", idle, blur})
        return self._json(200, {**self.app.health.panel_status(panel=pid), "mqtt": self.app.notifier.connected(), "lockdown": lock},
                          extra={"Cache-Control": "no-store"})

    def _qr_logo_choice(self):
        """The admin's picture in the middle of the guest QR code (a library id), "" = the Skypane icon."""
        v = read_json_file(self.app.data_dir / "house" / guest_wifi.LOGO_CHOICE).get("picture")
        return v if isinstance(v, str) and self.app.pictures.file(v) else ""

    def _guest_panels(self, me):
        """(v2.7.0) The Guest Wi-Fi page's "On the panels": each panel this login sees, its card setting, and whether this
        login may change that panel."""
        out = []
        for pid, name in self.app.panel_names():
            if not me.sees(pid):
                continue
            try:
                s = self.app.store.get(pid)["data"].get("settings") or {}
            except (OSError, ValueError, KeyError, StoreError):
                s = {}
            out.append({"id": pid, "name": name, "show": panel_settings.managed(s).get("guest.show") or "always",
                        "mayEdit": me.can("panels", pid)})
        return out

    def _manage_guest_wifi(self):
        me = self._manage_need("guest_wifi")   # (its password, the UniFi console's network: the admin, or a login allowed it)
        if self.command in ("GET", "HEAD"):
            if not self.app.cfg.guest_wifi and not self.app.manual_guest():
                return self._json(200, {"enabled": False, "manualPossible": True, "panels": self._guest_panels(me)})
            return self._guest_wifi({"qrLogo": self._qr_logo_choice(), "panels": self._guest_panels(me)})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        if "qrLogo" in req:
            # {qrLogo: "<picture id>" | ""}: the picture in the middle of the code (the admin's; "" = the Skypane icon)
            if not me.admin:
                raise ApiError(403, "not-allowed")
            pid = req["qrLogo"]
            if pid not in ("", None) and not (isinstance(pid, str) and self.app.pictures.file(pid)
                                              and (self.app.pictures.get(pid) or {}).get("style") != "background"):
                raise ApiError(400, "Pick one of your pictures (Manage → Icons), or the Skypane icon")
            target = self.app.data_dir / "house" / guest_wifi.LOGO_CHOICE
            if pid:
                target.parent.mkdir(parents=True, exist_ok=True)
                tmp = target.with_name(f".{target.name}.{os.getpid()}.tmp")
                tmp.write_text(json.dumps({"picture": pid}), encoding="utf-8")
                os.replace(tmp, target)
            else:
                target.unlink(missing_ok=True)
            m = self.app.manual_guest()
            if m:   # (a typed network: its code made again now; the UniFi child makes its own on its next step)
                try:
                    self.app.set_manual_guest({"ssid": m["ssid"], "password": m["password"], "open": m["open"]})
                except (ValueError, OSError):
                    pass
            return self._json(200, {"ok": True, "qrLogo": self._qr_logo_choice()})
        if not self.app.cfg.guest_wifi:
            # no UniFi console: the owner types the guest network ({manual: {ssid, password, open}}, or null = none)
            if "manual" not in req:
                return self._json(404, {"ok": False, "error": "not-enabled"})
            try:
                self.app.set_manual_guest(req["manual"])
            except ValueError as e:
                raise ApiError(400, str(e))
            self._act("settings.guest", what="network" if req["manual"] else "removed")
            return self._json(200, {"ok": True})
        new, change_now = req.get("settings"), req.get("changeNow", False)
        priv = self.app.cfg.data_dir / "private"
        if new is not None:
            if not isinstance(new, dict) or set(new) - set(guest_wifi.DEFAULT_SETTINGS) or \
                    guest_wifi.clean_settings({**guest_wifi.DEFAULT_SETTINGS, **new}) != {**guest_wifi.DEFAULT_SETTINGS, **new}:
                raise ApiError(400, '"ssid" (text, max 64), "afterGuests" (true / false), "days" (0, 1, 3, 7, 14 or 30)')
        if not isinstance(change_now, bool) or (new is None and not change_now):
            raise ApiError(400, 'send "settings" and / or "changeNow": true')
        if new is not None:
            with GUEST_SETTINGS_LOCK:
                cur = guest_wifi.clean_settings(read_json_file(priv / guest_wifi.SETTINGS))
                guest_wifi.write_private(priv / guest_wifi.SETTINGS, json.dumps({**cur, **new}, indent=1))
        if change_now:
            guest_wifi.write_private(priv / guest_wifi.REQUEST, json.dumps({"changeNow": time.time()}))
        if new is not None:
            self._act("settings.guest", keys=sorted(new))
        if change_now:
            self._act("settings.guest-now")
        return self._json(200, {"ok": True})

    # ---- the house's calendars (service/calendars.py; docs/calendars.md) -----------------------------------------
    def _weather_answer(self):
        """GET /api/manage/weather: the setting, the devices that look like weather devices (the Maker API's list, through
        the house model), the panels, and the bridge's view of the device now."""
        cfg = self.app.weather_setting()
        catalog = [d for d in ((self.app.house_model() or {}).get("devices") or []) if isinstance(d, dict) and isinstance(d.get("id"), int)]
        devices = []
        for d in catalog:
            wx, al = weather_device.looks_like_weather((d.get("attrs") or {}).keys())
            if wx or al or d["id"] == cfg.get("device"):
                devices.append({"id": d["id"], "label": d.get("label") or str(d["id"]), "type": d.get("type") or "",
                                "weather": wx, "alerts": al})
        devices.sort(key=lambda d: (not (d["weather"] and d["alerts"]), not d["weather"], d["label"].lower()))
        st = self.app.notifier.weather
        broker = self.app.notifier.connected()
        return {"setting": cfg, "devices": devices, "deviceListKnown": bool(catalog),
                "panels": [{"id": pid.lower(), "name": name} for pid, name in self.app.panel_names()],
                "defaults": {"levels": dict(weather_device.DEFAULT_LEVELS), "extreme": list(weather_device.DEFAULT_EXTREME)},
                "status": st, "broker": broker, "bridge": self.app.notifier.bridge() if broker is not None else None,
                "staleAfter": weather_device.STALE_S}

    def _manage_weather(self):
        """(v3.0.0) GET → _weather_answer. PATCH {set: {on?, device?, card?, warnings?, panels?,
        levels?, extreme?, units?, attrs?}} — the admin only; checked (weather_device.clean_config strict: 400 with what's
        wrong), the device must be one Hubitat's Maker API shares (when the list is known), saved to
        house/weather-device.json (the bridge picks it up within seconds) → the answer as GET. The activity log says
        which parts changed."""
        me = self._manage_need("admin")
        if self.command in ("GET", "HEAD"):
            return self._json(200, self._weather_answer(), extra={"Cache-Control": "no-store"})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        change = req.get("set")
        if not isinstance(change, dict) or not change:
            raise ApiError(400, '"set": the parts to change')
        unknown = set(change) - {"on", "device", "card", "warnings", "panels", "levels", "extreme", "units", "attrs"}
        if unknown:
            return self._json(400, {"ok": False, "error": f"unknown: {', '.join(sorted(unknown))[:80]}"})
        old = self.app.weather_setting()
        merged = {**old, **change}
        for k in ("levels", "units", "attrs"):   # (a part of these: merged into the saved ones)
            if isinstance(change.get(k), dict) and isinstance(old.get(k), dict):
                merged[k] = {**old[k], **change[k]}
        try:
            cfg = weather_device.clean_config(merged, strict=True)
        except weather_device.Invalid as e:
            return self._json(400, {"ok": False, "error": str(e)[:120]})
        if "device" in change and cfg.get("device") and cfg["device"] != old.get("device"):
            ids = {d.get("id") for d in ((self.app.house_model() or {}).get("devices") or []) if isinstance(d, dict)}
            if ids and cfg["device"] not in ids:
                return self._json(400, {"ok": False, "error": "not-in-maker-api"})
        if cfg.get("on") and not cfg.get("device"):
            return self._json(400, {"ok": False, "error": "no-device"})
        keys = sorted(k for k in cfg if cfg.get(k) != old.get(k))
        if keys:
            try:
                self.app.save_weather_setting(cfg)
            except OSError as e:
                log(f"weather: setting not saved ({type(e).__name__})")
                raise ApiError(503, "The setting couldn't be saved on the server")
            log(f"manager: weather setting ({', '.join(keys)}) changed by {me.user} from {self.client_address[0]}")
            self._act("settings.weather", keys=keys, on=cfg.get("on"))
        return self._json(200, {"ok": True, "changed": keys, **self._weather_answer()})

    def _manage_calendars(self):
        """GET: the house's calendars [{id, name, color, linkSet, status}] — never a link. PATCH {action: "add", name, link,
        color} | {action: "change", id, name?, color?, link?} (link: Replace) | {action: "remove", id} |
        {action: "refresh", id?} (Check now). The admin only. A link is a secret: kept in private/calendars.json, never
        sent back, never logged (the request log has the path only)."""
        self._manage_need("admin")
        cals = self.app.calendars
        if self.command in ("GET", "HEAD"):
            return self._json(200, {"calendars": cals.public(), "max": calendars.MAX_CALENDARS})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        action, cid = req.get("action"), req.get("id")
        try:
            if action == "add":
                cid = cals.add(req.get("name"), req.get("link"), req.get("color"))
                cals.refresh_soon(cid)
            elif action == "change":
                if not any(k in req for k in ("name", "color", "link")):
                    raise ApiError(400, "Nothing to change")
                cals.change(cid, name=req.get("name"), color=req.get("color"), link=req.get("link"))
                if req.get("link") is not None:
                    cals.last_asked.pop(cid, None)
                    cals.refresh_soon(cid)
            elif action == "remove":
                cals.remove(cid)
            elif action == "refresh":
                if cid is not None and not (isinstance(cid, str) and cals.exists(cid)):
                    raise ApiError(404, "There's no such calendar")
                if not cals.refresh_soon(cid if isinstance(cid, str) else None):
                    return self._json(429, {"ok": False, "error": "Checked a moment ago — wait a few seconds"})
            else:
                raise ApiError(400, '"action" must be "add", "change", "remove" or "refresh"')
        except calendars.Invalid as e:
            return self._json(400, {"ok": False, "error": str(e)})
        except (KeyError, TypeError):
            raise ApiError(404, "There's no such calendar")
        except OSError as e:
            log(f"calendars: not saved ({type(e).__name__})")
            raise ApiError(503, "The calendars couldn't be saved on the server")
        log(f"manager: calendar {action} {str(cid)[:40]!r} from {self.client_address[0]}")
        self.app.notifier.calendars_changed()
        return self._json(200, {"ok": True, "id": cid, "calendars": cals.public()})

    def _panel_events(self, panel):
        """GET /api/panel/<id>/events — the panel's calendar card: {"configured": false} while the house has no calendar
        (the panel shows its sample events), else {"configured": true, "calendars": [{id, name, color, icon?}] (the ones
        this panel shows), "events": [{cal, title, start, end, allDay, where?}]}. Never a link."""
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        pid = panel.lower()
        if not PANEL_RE.fullmatch(panel):
            raise ApiError(400, "Invalid panel id")
        if pid not in self.app.store.panel_ids() and pid != PIN_GUARDED_PANEL:
            raise ApiError(404, "no such panel")
        house = self.app.calendars.house()
        if not house:
            return self._json(200, {"configured": False, "calendars": [], "events": []})
        own = (self.app.store.get(pid)["data"].get("settings") or {}).get("calendars")
        shown = calendars.panel_view(house, own if isinstance(own, list) else None)
        # (v2.9.3 — security review) while this panel's calendar is blurred for guests (the switch on, or not known:
        # closed, as the panel), no event leaves the server unless the X-Skypane-Reveal header carries a ticket from
        # /api/pin {action: "ticket", purpose: "reveal"} for this panel (data.js loadEvents)
        if self.app.calendar_hidden(pid):
            if not self.app.reveal_ok(pid, (self.headers.get("X-Skypane-Reveal") or "")[:200]):
                return self._json(200, {"configured": True, "calendars": [], "events": [], "hidden": True},   # (not even the names)
                                  extra={"Cache-Control": "no-store"})
        events = self.app.calendars.events([c["id"] for c in shown])   # (soonest first)
        return self._json(200, {"configured": True, "calendars": shown, "events": events[:MAX_PANEL_EVENTS],
                                **({"more": True} if len(events) > MAX_PANEL_EVENTS else {})})

    # ---- Manager: the panels (stage 5) ---------------------------------------------------------------------------
    def _manage_panels(self):
        """GET: every panel (id, name, FreeKiosk name, address, last saved). PATCH {action: "add", id, name}: a new panel
        (its address http://<this server>/<id>; open that on the new tablet — it starts blank: an empty Home) |
        {action: "remove", id}: its settings go (backups kept; never the main panel, never the only one) and it leaves
        every login's panel list. Only here are panels created (a tablet at an unknown address: "not set up"). The list: only the panels this login sees; adding
        and removing: the admin only."""
        me = self._manage_ok()
        if self.command in ("GET", "HEAD"):
            out = []
            ids = me.panels(sorted(set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL}, key=lambda p: (p != "main", p)))
            docs = {pid: self.app.store.get(pid) for pid in ids}
            names = [(pid, (docs[pid]["data"].get("settings") or {}).get("panelName") or ("Main panel" if pid == "main" else pid)) for pid in ids]
            # (v2.5.0, Panels → Status: online / offline and the last check-in, the screen, the benchmark, a drawn map)
            health = {h["id"]: h for h in self.app.health.panels(names)}
            words = self._page_words()
            for pid, name in names:
                doc = docs[pid]
                s = doc["data"].get("settings") or {}
                out.append({"id": pid, "exists": doc["exists"], "rev": doc["rev"], "name": name,
                            "kiosk": s.get("kioskName") or (DEFAULT_KIOSK if pid == "main" else pid),
                            "address": "/" if pid == "main" else "/" + pid,
                            "status": self._panel_status(health.get(pid), words, me.admin),
                            "map": panel_settings.thumbnail(s),
                            "perf": panel_settings.perf(doc["data"].get("perf"))})
            return self._json(200, {"panels": out, "max": MAX_PANELS}, extra={"Cache-Control": "no-store"})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        self._manage_need("admin")
        req = self._json_body()
        if req.get("action") == "remove":
            pid = req.get("id")
            if not isinstance(pid, str) or not PANEL_RE.fullmatch(pid) or pid.lower() not in self.app.store.panel_ids():
                raise ApiError(404, "There's no such panel")
            pid = pid.lower()
            if pid == PIN_GUARDED_PANEL:
                raise ApiError(400, "The main panel can't be removed")
            # (the main panel always counts: it has its page at "/" before anything is saved on it)
            if len(set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL}) <= 1:
                raise ApiError(400, "It's the only panel — add another one before removing this one")
            self.app.store.remove(pid)
            self.app.auth.forget_panel(pid)   # (gone from every login's panels: adding it again starts afresh)
            self.app.perftests.pop(pid, None)
            self.app.bench_live.pop(pid, None)
            log(f"manager: panel {pid} removed from {self.client_address[0]} (its backups are kept)")
            self._act("panel.remove", target=pid)
            return self._json(200, {"ok": True})
        if req.get("action") != "add":
            raise ApiError(400, '"action" must be "add" or "remove"')
        pid = req.get("id")
        if not isinstance(pid, str) or not pid:
            raise ApiError(400, "Type an address for the new panel")
        if any(ch in pid for ch in ".:/\\"):   # (v3.0.0: the tablet's IP or a URL typed — a real name never has these)
            raise ApiError(400, "That looks like the tablet's address — Skypane doesn't need it. Type a short name such as "
                           "kitchen; then open the address shown on the tablet.")
        if not PANEL_RE.fullmatch(pid):   # (what's wrong with it, in plain words)
            raise ApiError(400, "The address must start with a letter" if not pid[0].isascii() or not pid[0].isalpha()
                           else "The address can be at most 32 characters" if len(pid) > 32
                           else "The address may only have letters, digits, _ and - (no spaces)")
        if pid.lower() in RESERVED_SEGMENTS or pid.lower() == "main" or self._safe_file(pid) is not None:
            raise ApiError(400, "That address is already used by the pages — pick another")
        if pid.lower().startswith("manager"):   # (v2.3.1: "manager-<login>" names the Manager in Hubitat's ackPanel)
            raise ApiError(400, "Addresses starting with “manager” are kept for the Manager — pick another")
        if pid.lower() in self.app.store.panel_ids() or self._safe_file(pid.lower()) is not None:
            return self._json(409, {"ok": False, "error": "exists"})
        try:
            name = panel_settings.PATHS["panelName"](req.get("name") or pid)
        except panel_settings.Invalid:
            name = pid
        kiosk = base = re.sub(r"[^a-z0-9_-]", "_", pid.lower())[:36]
        n = 2
        while kiosk in self._kiosk_names():   # (each tablet needs its own FreeKiosk name)
            kiosk, n = f"{base}_{n}", n + 1
        try:
            # (base_rev 0: refused if it was created meanwhile — never replaces an existing panel's settings)
            # a new panel starts completely blank: an empty Home layout (only its settings gear shows) and no LED strip
            # until the owner says so
            rev = self.app.store.patch(pid, {"settings": {"panelName": name, "kioskName": kiosk, "ledStrip": False, "dockOff": True,
                                                          "homeLayout": "custom", "homeGrid": dict(BLANK_GRID, cards=[])}},
                                       base_rev=0, create=True)
        except StoreError as e:
            return self._json(e.code, e.body)
        log(f"manager: panel {pid} added from {self.client_address[0]}")
        self._act("panel.add", target=pid.lower())
        return self._json(200, {"ok": True, "id": pid.lower(), "rev": rev})

    @staticmethod
    def _panel_status(h, words, admin):
        """One panel's line of the health monitor for Panels → Status: {state: "online" | "offline" | "never",
        lastSeen (epoch s or None), version, page (in words)} — "from" (an address) never: not needed there."""
        h = h or {}
        info = h.get("info") if isinstance(h.get("info"), dict) else {}
        seen = h.get("lastSeen")
        page = info.get("page") or ""
        return {"state": "never" if seen is None else "online" if h.get("state") == "connected" else "offline",
                "lastSeen": seen, "version": info.get("version") or "",
                "page": words.get(page) or ("a room page" if page.startswith("room:") else page)}

    def _page_words(self):
        """Which page a panel shows, in words: {"room:<id>": its name, "home": "Home", …} (the health monitor's page)."""
        names = {f"room:{r.get('id')}": r.get("name") for r in (self.app.house_model() or {}).get("rooms") or []
                 if isinstance(r, dict) and r.get("id") and r.get("name")}
        names.update({"home": "Home", "cameras": "Cameras", "music": "Music"})
        return names

    def _manage_panel_live(self, pid):
        """GET /api/manage/panels/<id>/live (v2.5.0, the Manager's "Open live" for a login that may only view): what the
        house is doing now, for that panel's page without a broker login — {"state": {id: {attr: value}}, "alerts":
        {"v": 1, "alerts": […]}, "bridge"} (service/live_state.py; read only, nothing here switches anything)."""
        pid = pid.lower()
        self._manage_need(None, pid)
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        if not PANEL_RE.fullmatch(pid) or (pid not in self.app.store.panel_ids() and pid != PIN_GUARDED_PANEL):
            raise ApiError(404, "no such panel")
        live = getattr(self.app, "live", None)
        devs = live.devices() if live is not None else {}
        return self._json(200, {"state": {str(d): v["values"] for d, v in devs.items()},
                                "alerts": {"v": 1, "alerts": live.alerts() if live is not None else []},
                                "bridge": self.app.notifier.bridge(), "heard": live.seen() if live is not None else {}},
                          extra={"Cache-Control": "no-store"})

    def _kiosk_names(self, but=None):
        """{FreeKiosk name: panel name} of every panel (but `but`)."""
        out = {}
        for p in sorted(set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL}):
            if p != but:
                s = self.app.store.get(p)["data"].get("settings") or {}
                out[s.get("kioskName") or (DEFAULT_KIOSK if p == PIN_GUARDED_PANEL else p)] = s.get("panelName") or ("Main panel" if p == PIN_GUARDED_PANEL else p)
        return out

    def _manage_panel(self, pid):
        """GET: one panel's Manager settings + what to choose from (rooms with their devices, presence, camera views).
        PATCH {set: {path: value}} (service/panel_settings.py) → written into the panel's settings; the panel takes it.
        Reading, changes and tests: a login that sees this panel (its own, or "all"); ADMIN_PANEL_KEYS: the admin."""
        pid = pid.lower()
        me = self._manage_need(None, pid)   # (before "no such panel": a panel it doesn't see is never told apart)
        if not PANEL_RE.fullmatch(pid) or (pid not in self.app.store.panel_ids() and pid != PIN_GUARDED_PANEL):
            raise ApiError(404, "no such panel")
        if self.command in ("GET", "HEAD"):
            doc = self.app.store.get(pid)
            model = self.app.house_model() or {}
            rooms = [{"id": r.get("id"), "name": r.get("name"), "custom": bool(r.get("custom")), "members": r.get("members") or [],
                      "devices": [{"id": d.get("id"), "name": d.get("name"), "full": d.get("full"), "kind": d.get("kind"),
                                   "group": bool(d.get("group"))}
                                  for d in r.get("devices") or [] if isinstance(d, dict)]}
                     for r in model.get("rooms") or [] if isinstance(r, dict)]

            sensors = [{"id": s.get("id"), "kind": s.get("kind"), "where": s.get("where")} for s in model.get("sensors") or []
                       if isinstance(s, dict)]
            presence = [{"id": p.get("id"), "label": p.get("label"), "type": p.get("type")} for p in model.get("presence") or []
                        if isinstance(p, dict)]
            # (v2.7.0: the Safety tab says when this panel locks down — set on Guest Wi-Fi; v2.9.3: or blurs its calendar)
            lock = self.app.lockdown_for(pid)
            if lock:
                dev = next((d for d in (self.app.house_model() or {}).get("devices") or [] if isinstance(d, dict) and d.get("id") == lock["switch"]), None)
                lock = dict(lock, switch=(dev or {}).get("label") or f"#{lock['switch']}")
            return self._json(200, {"id": pid, "managed": panel_settings.managed(doc["data"].get("settings")), "lockdown": lock,
                                    "languages": list(panel_settings.PANEL_LANGS),   # (v3.0.0: what "language" may be)
                                    "rooms": rooms, "sensors": sensors, "presence": presence,
                                    "views": self._protect_views(), "perf": panel_settings.perf(doc["data"].get("perf")),
                                    "houseCalendars": self.app.calendars.house()})   # (names / colours only: never a link)
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        self._manage_need(None, pid)
        req = self._json_body()
        if req.get("action") == "benchstop":   # stop a benchmark / performance test running on the panel
            ok = self.app.notifier.bench(pid, stop=True)
            return self._json(200 if ok else 503, {"ok": ok, **({} if ok else {"error": "The panels can't be reached (no MQTT connection)"})})
        if req.get("action") in ("perftest", "bench"):   # (the panel runs it and saves its numbers like its own measurements)
            # a benchmark that already ended — done, interrupted (the screen went off…), refused, or silent for 25 s —
            # never makes you wait: only one that's still alive does
            cur = self.app.bench_live.get(pid.lower()) or {}
            over = req["action"] == "bench" and (cur.get("state") in ("done", "stopped", "refused")
                                                  or time.time() - cur.get("at", 0) > 25)
            if not over and time.monotonic() - self.app.perftests.get(pid, -120) < (120 if req["action"] == "bench" else 60):
                return self._json(429, {"ok": False, "error": "A test is still running — wait a minute or two"})
            if req["action"] == "bench":
                cur = self.app.bench_live.get(pid.lower()) or {}
                if cur.get("state") == "running" and time.time() - cur.get("at", 0) < 30:
                    return self._json(429, {"ok": False, "error": "The benchmark is running on the panel right now"})
                mode = "quick" if req.get("mode") == "quick" else "thorough"
                ok = self.app.notifier.bench(pid, mode)
                if ok:
                    self.app.bench_live[pid.lower()] = {"asked": time.monotonic(), "at": time.time(), "state": "asked", "mode": mode}
            else:
                ok = self.app.notifier.perftest(pid)
            if ok:
                self.app.perftests[pid] = time.monotonic()
            return self._json(200 if ok else 503, {"ok": ok, **({} if ok else {"error": "The panels can't be reached (no MQTT connection)"})})
        try:
            clean = panel_settings.check(req.get("set"))

        except panel_settings.Invalid as e:
            raise ApiError(400, str(e))
        if not me.admin and set(clean) & set(ADMIN_PANEL_KEYS):
            raise ApiError(403, "not-allowed")   # (unlocking, the tablet's identity: the admin's)
        taken = self._kiosk_names(but=pid) if "kioskName" in clean else {}
        if clean.get("kioskName") in taken:
            raise ApiError(400, f"FreeKiosk device name: the panel “{taken[clean['kioskName']]}” already uses it — each tablet needs its own")
        # v2.5.0: "was" = {path: the value as this page loaded it} (the layout builder's layouts) — saved only while the
        # stored value is still that one; changed meanwhile (another tab or person saved it): 409 {"error": "changed",
        # "paths"}, nothing written (the builder then offers to reload or to overwrite). Other settings: the last change wins.
        was = req.get("was")
        if was is not None and (not isinstance(was, dict) or not set(was) <= set(clean)):
            raise ApiError(400, '"was" must name settings that are being set')

        def change(data):
            if was:
                now = panel_settings.managed(data.get("settings"))
                moved = sorted(p for p, v in was.items() if json.dumps(now.get(p), sort_keys=True) != json.dumps(v, sort_keys=True))
                if moved:
                    raise StoreError(409, {"ok": False, "error": "changed", "paths": moved})
            written = panel_settings.apply(data.get("settings"), clean)
            saved["managed"] = panel_settings.managed(written)   # (what this save wrote: the page's next "was")
            return {"settings": written}
        saved = {}
        try:
            rev = self.app.store.modify(pid, change, create=pid == PIN_GUARDED_PANEL)
        except StoreError as e:
            return self._json(e.code, e.body)
        self.app.notifier.changed(pid, rev, ["settings"], "manager")
        self.app.write_card_devices()
        keys = sorted(clean)
        lay = [k for k in keys if k.startswith("layouts")]
        self._act("panel.layout" if lay and len(lay) == len(keys) else "panel.setup", target=pid.lower(), keys=keys)
        return self._json(200, {"ok": True, "rev": rev, "managed": saved["managed"]})

    def _manage_rooms(self):
        """GET: the rooms the panels show (Hubitat's + the owner's own, with their devices) and the owner's rooms /
        pictures. PATCH {action: "room", id?, room: {name, icon, devices} | null} — a room of your own (add / change /
        remove); {action: "icon", name, icon | null} — a room's picture. Changes: "devices" (reading: a panel too)."""
        self._manage_read("devices")
        if self.command in ("GET", "HEAD"):
            model = self.app.house_model() or {}
            mine, icons = self.app.devices.rooms()
            rooms = [{"id": r.get("id"), "name": r.get("name"), "icon": r.get("icon"), "custom": bool(r.get("custom")),
                      "members": r.get("members") or [],
                      "devices": [{"id": d.get("id"), "name": d.get("name"), "full": d.get("full"), "kind": d.get("kind")}
                                  for d in r.get("devices") or [] if isinstance(d, dict)]}
                     for r in model.get("rooms") or [] if isinstance(r, dict)]
            return self._json(200, {"rooms": rooms, "mine": mine, "icons": icons, "bridge": self.app.notifier.bridge()})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        self._manage_need("devices")
        req = self._json_body()
        try:
            if req.get("action") == "room":
                rid = req.get("id")
                if rid is not None and not (isinstance(rid, str) and re.fullmatch(r"r\d{1,6}", rid)):
                    raise house_devices.Invalid("no such room")
                room = req.get("room")
                st = house_devices.house_model.safe_text
                hub_rooms = {st(str(r.get("name") or ""), 60).lower() for r in (self.app.house_model() or {}).get("rooms") or []
                             if isinstance(r, dict) and not r.get("custom")}
                before = next((r.get("name") for r in self.app.devices.rooms()[0] if r.get("id") == rid), None) if rid else None
                new = st(room["name"], 40) if isinstance(room, dict) and isinstance(room.get("name"), str) else None
                if new and new != before and new.lower() in hub_rooms:   # (a room kept under its old name stays editable)

                    # (the panels find a room's doors, sensors and appliances by its name: it would show the Hubitat room's)
                    raise house_devices.Invalid("Hubitat already has a room with that name — pick another name")

                self.app.devices.set_room(rid, req.get("room"))
            elif req.get("action") == "icon":
                self.app.devices.set_room_icon(req.get("name"), req.get("icon") or None)
            else:
                raise house_devices.Invalid('action: "room" or "icon"')
        except house_devices.Invalid as e:
            raise ApiError(400, str(e))
        mine, icons = self.app.devices.rooms()
        return self._json(200, {"ok": True, "mine": mine, "icons": icons})

    def _manage_groups(self):

        """PATCH {id?: "g3", group: {name, devices, pin, unlock, panels} | null}: add (no id), change or remove a device
        group (service/house_devices.py); the bridge rebuilds the house model with its rules. GET: the groups. The admin
        only (a group's rules: the PIN, unlocking, which panels)."""
        self._manage_need("admin")
        if self.command in ("GET", "HEAD"):
            return self._json(200, {"groups": self.app.devices.groups()})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        gid = req.get("id")
        if gid is not None and not (isinstance(gid, str) and re.fullmatch(r"g\d{1,6}", gid)):
            raise ApiError(400, "no such group")
        try:
            rev, groups = self.app.devices.set_group(gid, req.get("group"))
        except house_devices.Invalid as e:
            raise ApiError(400, str(e))
        return self._json(200, {"ok": True, "rev": rev, "groups": groups})

    def _manage_cameras(self):

        """GET: the cameras the panels know (Protect's + your own) and your own views — never a stream address or a
        password; your own cameras' "host" (rtsp://192.168.1.20:554: where it is, no login) the admin only.
        PATCH {action, …} (service/own_cameras.py): add / edit / remove a camera or a view of your own; the camera
        sync picks it up within seconds (go2rtc restarts with the new streams). Reading: "cameras", or a login with a
        panel (the layout builder's camera cards); changes: "cameras"."""
        me = self._manage_ok()
        if not (me.can("cameras") or me.can("panels")):
            raise ApiError(403, "not-allowed")

        def public(doc):
            out = own_cameras.public(doc)
            if not me.admin:
                out["cameras"] = [{k: v for k, v in c.items() if k != "host"} for c in out["cameras"]]
            return out
        priv = self.app.data_dir / "private"
        cams = self._camera_list()
        if self.command in ("GET", "HEAD"):
            model = self.app.house_model() or {}
            rooms = sorted({r.get("name") for r in model.get("rooms") or [] if isinstance(r, dict) and r.get("name")})
            # (v2.6.0) the panels this login sees, which cameras each shows and the views it hides (Setup → Show on panels);
            # "pictures": this login may see the camera's picture
            views = self._views_cams()
            ids = self._cameras_for(me, cams)
            panels_ = []
            for p in me.panels(sorted(set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL}, key=lambda x: (x != PIN_GUARDED_PANEL, x))):
                s_ = self.app.store.get(p)["data"].get("settings") or {}
                hv = ((s_.get("cameras") or {}).get("hiddenViews") or {}) if isinstance(s_.get("cameras"), dict) else {}
                panels_.append({"id": p, "name": s_.get("panelName") or ("Main panel" if p == PIN_GUARDED_PANEL else p),
                                "mayEdit": me.can("panels", p), "shows": sorted(self._panel_cameras(p, views, cams)),
                                "hiddenViews": sorted(k for k, v in hv.items() if v is True) if isinstance(hv, dict) else []})
            return self._json(200, {**public(own_cameras.load(priv)), "all": [dict(c, pictures=c["id"] in ids) for c in cams], "rooms": rooms,
                                    "panels": panels_, "viewCams": views,
                                    "builtin": bool(self.app.cfg.page_config.get("go2rtcPort")),
                                    "separate": bool(self.app.cfg.page_config.get("go2rtc")),
                                    "protectViews": self._protect_views(), "viewMax": own_cameras.VIEW_MAX})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        self._manage_need("cameras")
        req = self._json_body()
        if req.get("action") in ("add", "edit", "remove"):
            # cameras of your own hand go2rtc a stream address: the admins' (as the Manager shows it) — a login with
            # "cameras" keeps the views and the names of Protect's
            self._manage_need("admin")
        if req.get("action") in ("add", "edit") and not self.app.cfg.page_config.get("go2rtcPort"):
            # a separate go2rtc (GO2RTC_URL) never reads our config: the camera would show without video
            why = ("clear the separate go2rtc address in Integrations → Cameras" if self.app.cfg.page_config.get("go2rtc")
                   else "it isn't running on this server")
            return self._json(409, {"ok": False, "error": f"Cameras of your own need the built-in camera video ({why})"})
        try:
            doc = own_cameras.change(priv, req, known_ids=[c["id"] for c in cams if not c.get("own")])

        except own_cameras.Invalid as e:
            raise ApiError(400, str(e))
        log(f"cameras: own cameras / views changed ({req.get('action')})")
        self._act("camera.change", what=req.get("action") if isinstance(req.get("action"), str) else None,
                  name=(req.get("camera") or {}).get("name") if isinstance(req.get("camera"), dict) else None)
        # (a name that lost characters it can't keep — < > & " ' ` \ —: the page says what it became)
        sent = req.get("name") if req.get("action") in ("add", "edit") and isinstance(req.get("name"), str) else None
        try:
            clean = own_cameras._name(sent, "name") if sent is not None else None
        except own_cameras.Invalid:
            clean = None
        kept = next((c["name"] for c in doc["cameras"] if clean is not None and (c["id"] == req.get("id") or req.get("action") == "add")
                     and c["name"] == clean), None)
        return self._json(200, {"ok": True, **public(doc), **({"nameCleaned": kept} if kept is not None and kept != sent.strip() else {})})

    def _camera_list(self, internal=False):
        """The panels' camera list from house/protect-cameras.js: [{id, name, room, own, online, doorbell}] (names only).
        internal: also each camera's go2rtc stream name ("stream") — for the frame route here, never sent anywhere."""
        try:
            text = (self.app.data_dir / "house" / "protect-cameras.js").read_text(encoding="utf-8")
            m = re.search(r"HUBITAT\.cameras\s*=\s*(\[.*?\]);\s*\n", text, re.S)
            cams = json.loads(m.group(1)) if m else []
        except (OSError, ValueError):
            cams = []
        return [{"id": c["id"], "name": str(c.get("name") or ""), "room": c.get("room") or "", "own": bool(c.get("own")),
                 "online": c.get("online") is not False, "doorbell": c.get("doorbell") is True, "video": c.get("video") is not False,
                 **({"stream": c["stream"]} if internal and isinstance(c.get("stream"), str) and re.fullmatch(r"[a-z0-9_-]{1,80}", c["stream"]) else {})}
                for c in cams if isinstance(c, dict) and isinstance(c.get("id"), int)]

    def _views_cams(self):
        """{view id: [camera ids]} of every camera view — Protect's (house/protect-cameras.js) and your own."""
        out = {}
        try:
            text = (self.app.data_dir / "house" / "protect-cameras.js").read_text(encoding="utf-8")
            m = re.search(r"window\.PROTECT_LIVEVIEWS\s*=\s*(\[.*\]);\s*$", text, re.S)
            for v in json.loads(m.group(1)) if m else []:
                if isinstance(v, dict) and v.get("id"):
                    out[str(v["id"])] = [c for sl in v.get("slots") or [] if isinstance(sl, dict) for c in sl.get("cameras") or [] if isinstance(c, int)]
        except (OSError, ValueError):
            pass
        for v in own_cameras.public(own_cameras.load(self.app.data_dir / "private")).get("views") or []:
            out[str(v.get("id"))] = [c for c in v.get("cameras") or [] if isinstance(c, int)]
        return out

    def _panel_cameras(self, pid, views=None, cams=None):
        """The cameras panel `pid` shows (v2.6.0, who may see a camera's picture): every camera in a view it
        doesn't hide, and the cameras its camera cards name (a camera, or a view). No views at all: every camera."""
        views = self._views_cams() if views is None else views
        cams = self._camera_list() if cams is None else cams
        s = self.app.store.get(pid)["data"].get("settings") or {}
        hidden = ((s.get("cameras") or {}).get("hiddenViews") or {}) if isinstance(s.get("cameras"), dict) else {}
        out = set() if views else {c["id"] for c in cams}
        for vid, ids in views.items():
            if not (isinstance(hidden, dict) and hidden.get(vid) is True):
                out.update(ids)
        rooms_ = s.get("roomGrids") if isinstance(s.get("roomGrids"), dict) else {}
        for grid in [s.get("homeGrid"), *rooms_.values()]:
            for c in (grid.get("cards") if isinstance(grid, dict) and isinstance(grid.get("cards"), list) else []):
                cam = (c.get("o") or {}).get("cam") if isinstance(c, dict) and isinstance(c.get("o"), dict) else None
                if isinstance(cam, str) and cam.isdecimal():   # (a camera card: a camera's id, or a view's)
                    out.add(int(cam))
                elif isinstance(cam, str):
                    out.update(views.get(cam, []))
        return out

    def _cameras_for(self, who, cams=None):
        """The camera ids this login may see pictures of: "cameras" → every one; else the cameras its panels show."""
        cams = self._camera_list() if cams is None else cams
        if who.can("cameras"):
            return {c["id"] for c in cams}
        views = self._views_cams()
        out = set()
        for p in who.panels(sorted(set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL})):
            out |= self._panel_cameras(p, views, cams)
        return out

    def _manage_camera_frame(self, cid):
        """GET /api/manage/cameras/<id>/frame.jpg (v2.6.0): the camera's picture now (service/camera_frames.py) — a login
        with "cameras", or one whose panel shows that camera; any other camera is "not found" (never told apart)."""
        who = self._manage_ok()
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        cams = self._camera_list(internal=True)
        cam = next((c for c in cams if c["id"] == cid), None)
        if cam is None or cid not in self._cameras_for(who, cams):
            raise ApiError(404, "no such camera")
        if not cam.get("stream") or not cam.get("video"):   # (no video in Protect / no stream yet: nothing to ask go2rtc for)
            raise ApiError(503, "This camera has no video right now")
        try:
            data = self.app.frames.get(who.user, cid, cam["stream"])
        except camera_frames.FrameError as e:
            raise ApiError(e.code, e.words)
        return self._send(200, data, "image/jpeg", {"Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'"})

    def _manage_csp(self):
        """The Manager page's CSP. v2.6.0: with the built-in camera video, the Cameras page's spotlight connects to its
        guard on the address the page came from (ws / wss on go2rtcPort) and plays what it sends (MSE: blob: media) —
        only that host and port; everything else as MANAGE_CSP. A Host header that isn't a plain name or IP: no extra."""
        port = self.app.cfg.page_config.get("go2rtcPort")
        h = (self.headers.get("Host") or "").strip().lower()
        if h.startswith("["):
            name = h[1:h.find("]")] if "]" in h else ""
        else:
            name = h.rsplit(":", 1)[0] if h.count(":") == 1 else h
        if not isinstance(port, int) or not name or not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?|[0-9a-f:]{2,39}", name) \
                or not host_allowed(h, self.app.cfg.allowed_hosts):
            return MANAGE_CSP
        at = f"[{name}]:{port}" if ":" in name else f"{name}:{port}"
        return MANAGE_CSP.replace("connect-src 'self';", f"connect-src 'self' ws://{at} wss://{at};") \
                         .replace("worker-src 'self';", "worker-src 'self'; media-src 'self' blob:;")

    def _manage_camera_live(self, cid):
        """GET /api/manage/cameras/<id>/live (v2.6.0): what the Live view's spotlight needs to play the camera
        itself — {"port": 1984, "src": its go2rtc stream name} (the guard in front of the built-in go2rtc takes only
        stream names from its own config: never an address). The same rule as the pictures ; without the built-in
        camera video: 409 (the page stays with pictures)."""
        who = self._manage_ok()
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        cams = self._camera_list(internal=True)
        cam = next((c for c in cams if c["id"] == cid), None)
        if cam is None or cid not in self._cameras_for(who, cams):
            raise ApiError(404, "no such camera")
        if not self.app.cfg.page_config.get("go2rtcPort") or not cam.get("stream") or not cam.get("video"):
            return self._json(409, {"ok": False, "error": "Live video isn't available here — the pictures stay"})
        return self._json(200, {"port": self.app.cfg.page_config["go2rtcPort"], "src": cam["stream"]}, extra={"Cache-Control": "no-store"})

    def _manage_camera_motion(self):
        """GET /api/manage/cameras/motion[?limit=12] (v2.6.0, Cameras → Recent motion; Q-V2): the cameras' motion events
        the hub sent since the server started (live_state: the camera devices are Hubitat devices), newest first —
        {"events": [{camera, name, t}], "heard": when the server last heard any hub event, or null}; only the cameras this login
        may see."""
        who = self._manage_ok()
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        if not (who.can("cameras") or who.can("panels")):
            raise ApiError(403, "not-allowed")
        q = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "", max_num_fields=4)
        try:
            limit = max(1, min(50, int((q.get("limit") or ["12"])[0])))
        except ValueError:
            limit = 12
        cams = self._camera_list()
        names = {c["id"]: c["name"] for c in cams}
        live = getattr(self.app, "live", None)
        events = []
        for cid in self._cameras_for(who, cams):
            for e in live.events(cid) if live is not None else []:
                if e.get("name") == "motion" and e.get("value") == "active":
                    events.append({"camera": cid, "name": names.get(cid, ""), "t": e["t"]})
        events.sort(key=lambda e: -e["t"])
        return self._json(200, {"events": events[:limit], "heard": (live.seen() if live is not None else {}).get("event")},
                          extra={"Cache-Control": "no-store"})

    def _protect_views(self):

        """Protect's live views ({id, name}) from house/protect-cameras.js (written by the camera sync)."""
        try:
            text = (self.app.data_dir / "house" / "protect-cameras.js").read_text(encoding="utf-8")
        except OSError:
            return []
        m = re.search(r"window\.PROTECT_LIVEVIEWS\s*=\s*(\[.*\]);\s*$", text, re.S)
        try:
            views = json.loads(m.group(1)) if m else []
        except ValueError:
            return []
        out = [{"id": str(v.get("id")), "name": str(v.get("name") or ""), "isDefault": bool(v.get("isDefault")),
                "cameras": sum(len(s.get("cameras") or []) for s in v.get("slots") or [] if isinstance(s, dict))}
               for v in views if isinstance(v, dict) and v.get("id")]
        return [v for v in out if v["isDefault"]] + [v for v in out if not v["isDefault"]]

    def _manage_mqtt(self):
        """GET: the built-in broker's login for LAN devices (FreeKiosk, the panel agent) — the admin only."""
        self._manage_need("admin")
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        if not self.app.cfg.mqtt_builtin:
            return self._json(200, {"builtin": False})
        try:
            lg = json.loads((self.app.cfg.data_dir / "private" / "mqtt-logins.json").read_text(encoding="utf-8"))["devices"]
        except (OSError, ValueError, KeyError, TypeError):
            return self._json(503, {"error": "no-login"})
        return self._json(200, {"builtin": True, "user": lg["user"], "pass": lg["pass"], "port": 1883})

    def _live_of(self, catalog):
        """v2.4.0: what each catalogue device is doing now (service/live_state.py) — {id: {lastAt, battery, health,
        values}} for the ones heard of — and when the live state last heard each topic."""
        live = getattr(self.app, "live", None)
        if live is None:
            return {}, {}
        ids = {d["id"] for d in catalog}
        out = {str(i): {"lastAt": v["last"], "battery": v["battery"], "health": v["health"], "values": v["values"]}
               for i, v in live.devices().items() if i in ids}
        return out, live.seen()

    def _manage_devices_live(self):
        """GET /api/manage/devices/live (v2.4.0; the Devices page asks every 15 s): {"live": {id: {lastAt, battery,
        health, values}}, "heard": {state, event, alerts}, "modelVersion", "ids" (the house model's devices now),
        "newIds", "sig"}; ?sig=<the last one> and nothing changed → {"same": true, "sig", "heard"} (the page then draws
        nothing). The whole house's devices — so the "devices" permission (a panel login alone gets 403)."""
        self._manage_need("devices")
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        model = self.app.house_model() or {}
        catalog = [d for d in (model.get("devices") or []) if isinstance(d, dict) and isinstance(d.get("id"), int)]
        live, heard = self._live_of(catalog)
        fs = getattr(self.app, "first_seen", None)
        seen = fs.update([d["id"] for d in catalog]) if fs is not None and catalog else {"new": []}
        # (modelVersion / ids: the page reads the whole list again when a device came or went)
        out = {"live": live, "modelVersion": model.get("version"), "ids": sorted(d["id"] for d in catalog), "newIds": seen["new"]}
        sig = hashlib.sha1(json.dumps(out, sort_keys=True, default=str).encode()).hexdigest()[:16]
        q = urllib.parse.parse_qs(self.path.split("?", 1)[1]) if "?" in self.path else {}
        if (q.get("sig") or [""])[0] == sig:
            return self._json(200, {"same": True, "sig": sig, "heard": heard}, extra={"Cache-Control": "no-store"})
        return self._json(200, {**out, "heard": heard, "sig": sig}, extra={"Cache-Control": "no-store"})

    def _catalog_entry(self, did):
        """(the house model, the device's catalogue line) — 404 when the model has no such device."""
        model = self.app.house_model() or {}
        entry = next((d for d in (model.get("devices") or []) if isinstance(d, dict) and d.get("id") == did), None)
        if entry is None:
            raise ApiError(404, "no such device in the house model")
        return model, entry

    def _manage_device_events(self, did):
        """GET /api/manage/devices/<id>/events (v2.4.0): its last events (live_state.EVENTS_KEPT, newest first; memory
        only — since the server started) {"id", "events": [{t, name, value}], "heard": when any event was last heard}.
        The "devices" permission."""
        self._manage_need("devices")
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        self._catalog_entry(did)
        live = getattr(self.app, "live", None)
        return self._json(200, {"id": did, "events": live.events(did) if live is not None else [],
                                "heard": (live.seen() if live is not None else {}).get("event")}, extra={"Cache-Control": "no-store"})

    def _manage_device_panels(self, did):
        """GET /api/manage/devices/<id>/panels (v2.4.0): the panels this login sees that show the device —
        {"panels": [{id, name, via: ["room" (a house-model room it is in — Hubitat's or one of the owner's own — is
        shown there), "extra" (added to a room that is shown there), "cards" (cards on its Home or room layouts name it:
        a device, value, button… — anything with its id)], cards: n, hidden: taken off that panel}]}. A guide, not
        the panel's exact drawing (e.g. a room page the panel never opens still counts). The "devices" permission."""
        who = self._manage_need("devices")
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        model, _ = self._catalog_entry(did)
        out = self._panels_showing(did, model, who)
        return self._json(200, {"id": did, "panels": out}, extra={"Cache-Control": "no-store"})

    def _panels_showing(self, did, model, who):
        """The panels `who` sees that show device `did` (or had it taken off): [{id, name, via, cards, hidden}] — see
        _manage_device_panels. (v2.9.1: also the Manager's command route — a login that isn't an admin may switch only
        what a panel of its own shows.)"""
        rooms = [r.get("id") for r in model.get("rooms") or [] if isinstance(r, dict)
                 and any(isinstance(x, dict) and x.get("id") == did for x in (r.get("devices") if isinstance(r.get("devices"), list) else []))]
        out = []
        for p in sorted(set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL}):
            if not who.sees(p):
                continue
            s = self.app.store.get(p)["data"].get("settings") or {}
            hidden_rooms = s.get("hiddenRooms") if isinstance(s.get("hiddenRooms"), dict) else {}
            hidden = bool((s.get("hiddenDevices") if isinstance(s.get("hiddenDevices"), dict) else {}).get(str(did)))
            extra = s.get("extraDevices") if isinstance(s.get("extraDevices"), dict) else {}
            via = []
            if any(r and not hidden_rooms.get(r) for r in rooms):
                via.append("room")
            if any(isinstance(v, list) and did in v and not hidden_rooms.get(r) for r, v in extra.items()):
                via.append("extra")
            grids = [s.get("homeGrid"), *(s["roomGrids"].values() if isinstance(s.get("roomGrids"), dict) else [])]

            # (v2.9.1: only the card types' own device fields — layouts.card_refs — never any number under an "id")
            cards = sum(did in layouts.card_refs(c) for g in grids if isinstance(g, dict) and isinstance(g.get("cards"), list) for c in g["cards"])
            if cards:
                via.append("cards")
            th = model.get("thermostat")
            if isinstance(th, dict) and th.get("id") == did:   # (v2.9.3: every panel has the thermostat's own page)
                via.append("thermostat")
            if via or hidden:
                out.append({"id": p, "name": s.get("panelName") or ("Main panel" if p == PIN_GUARDED_PANEL else p),
                            "via": via, "cards": cards, "hidden": hidden})
        return out

    def _manage_controls(self, who, model):
        """(v2.9.1) {"<id>": [commands]} — the devices this login may switch from the Manager and what each may be sent:
        the same rules as the command route's steps 1–3 (it decides again on every command). {} without the right."""
        if not who.can("switch") or not model:
            return {}
        main = self.app.store.get(PIN_GUARDED_PANEL)["data"].get("settings") or {}
        try:
            ids = self._manager_switchable(model) - self._never_now(main, model)   # (v2.9.3: the card devices too)
        except (KeyError, TypeError):
            return {}
        out = {}
        for did in sorted(ids):
            cmds = device_rules.manager_commands(model, did)
            if not cmds:
                continue
            if not who.admin:
                only = (model.get("onlyPanels") or {}).get(str(did))
                if not any(x["via"] and not x["hidden"] and (not isinstance(only, list) or x["id"] in only) for x in self._panels_showing(did, model, who)):
                    continue
            out[str(did)] = sorted(cmds)
        return out

    def _manage_controls_pin(self, model, controls):
        """(v2.9.2 gate 1) {"<id>": [commands that ask for the panel PIN now]} for the controls above — the same rule
        as the command route's step 6 (the door's state now for a garage door's close). A hint for the Manager only: it
        goes to the PIN pad first and never shows a PIN command's state early; the route and the bridge still decide."""
        relays, doors = device_rules.garage_sets(model)
        live = getattr(self.app, "live", None)
        out = {}
        for sid, cmds in controls.items():
            did = int(sid)
            door = (((live.device(did) or {}).get("values")) or {}).get("door") if did in doors and live is not None else None
            need = [c for c in cmds if device_rules.needs_pin(did, c, garage_relays=relays, garage_doors=doors, model=model, door=door)]
            if need:
                out[sid] = need
        return out

    def _manage_device_command(self, did):
        """PATCH /api/manage/devices/<id>/command {command, value?, pin?} (v2.9.1; the design notesQ40–) —
        the Manager switches one device. Checked in this order; nothing reaches the hub unless every check passes, and
        the Hubitat bridge then checks it all again (service/device_rules.py):
          1. who — an admin, or a login with "Switch devices from the Manager" (403 not-allowed); never the demo
          2. which device — one the panels may switch (switchable, not on the never list: 403 never-switch /
             not-switchable); a login that isn't an admin: only a device a panel it sees shows, within the device's
             group's panels (403 not-yours)
          3. which command — the Manager's short list for what the device is (400 command-not-allowed), the value
             checked as the bridge does (400 bad-value)
          4. the broker and the bridge must be there (503 no-broker / no-bridge — before the PIN: no try used up)
          5. rate — 1 a second per device, 30 a minute per login, 60 a minute for the Manager (429 too-many {retryIn})
          6. the panel PIN, exactly when the bridge would ask (garage, valves, guest modes, confirm devices, a group's
             PIN): 409 pin-unset, 403 pin-required / wrong-pin, 423 locked {lockedFor} — counted on this login AND
             this address; then a one-time ticket for exactly this device + command + value (panel_pin, 30 s)
          7. sent on manager/cmd (internal topic) with "by": "manager-<login>" and a rid; the bridge's answer within 5 s
        → 200 {ok: true}; 409 refused {reason} (the bridge said no); 502 hub-error; 504 timeout; 429 busy (too many waiting).
        The activity log gets every command sent (with the bridge's answer or "timeout"), every refusal at steps 1–3,
        every wrong PIN and lock-out, and a send that found no broker — the device, the command word, the result (a value
        only for a command sent); never the PIN or the ticket. The message on manager/cmd is signed (device_rules.sign,
        a key derived from the house ticket key) and carries its deadline and the sender's role; the bridge's answer is
        signed too — unsigned ones are ignored (a broker without Skypane's access lists can't forge either)."""
        who = self._manage_ok()
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        command, value = req.get("command"), req.get("value")
        word = command[:40] if isinstance(command, str) else None
        model = self.app.house_model()
        entry = next((d for d in (model.get("devices") or []) if isinstance(d, dict) and d.get("id") == did), None) if model else None
        label = str((entry or {}).get("label") or f"#{did}")[:60]

        def refuse(code, error, **extra):   # (a refusal that is logged: device, command word, result — never a value or PIN)
            # (its own kind and shelf in the activity log, folded per login + device + result a minute: a login looping
            # requests can never push the account, settings or panel history out — service/activity_log.py)
            self._act("device.refused", target=label, device=did, **({"command": word} if word else {}), result=error)
            return self._json(code, {"ok": False, "error": error, **extra})
        # 1. who
        if not who.can("switch") or getattr(who, "demo", False) or getattr(self.app.cfg, "demo", False):
            return refuse(403, "not-allowed")
        if not model:
            return self._json(503, {"ok": False, "error": "no-model"})
        if entry is None:
            raise ApiError(404, "no such device in the house model")
        # 2. which device
        main = self.app.store.get(PIN_GUARDED_PANEL)["data"].get("settings") or {}
        switchable = self._manager_switchable(model)
        if did not in switchable:
            return refuse(403, "not-switchable")
        if did in self._never_now(main, model):
            return refuse(403, "never-switch")
        if not who.admin:
            only = (model.get("onlyPanels") or {}).get(str(did))
            if not any(x["via"] and not x["hidden"] and (not isinstance(only, list) or x["id"] in only) for x in self._panels_showing(did, model, who)):
                return refuse(403, "not-yours")
        # 3. which command — the Manager's list for what the device is, the value as the bridge checks it AND the
        # Manager's own stricter check (v2.9.3: the device's own modes / speeds, its scene buttons, colour as "h,s")
        if not isinstance(command, str) or command not in device_rules.MANAGER_COMMANDS or command not in device_rules.manager_commands(model, did):
            return refuse(400, "command-not-allowed")
        if not device_rules.manager_value_ok(model, did, command, value) or not device_rules.command_arg(command, value)[0]:
            return refuse(400, "bad-value")
        relays, doors = device_rules.garage_sets(model)
        live = getattr(self.app, "live", None)
        door = None
        if did in doors and live is not None:
            door = (((live.device(did) or {}).get("values")) or {}).get("door")
        need = device_rules.needs_pin(did, command, garage_relays=relays, garage_doors=doors, model=model, door=door)
        return self._manager_send(who, did, command, value, req, need, refuse, label, "device.command")

    def _manager_switchable(self, model):
        """(v2.9.3) What a panel may switch, as the bridge's allowlist has it: the house model's switchable devices and
        the devices on the panels' layout cards (house/card-devices.json — a media player, a scene button); the never
        list is taken off by the caller (it always wins)."""
        hm = house_devices.house_model
        try:
            ids = hm.switchable(model, [])
        except (KeyError, TypeError):
            ids = set()
        try:
            doc = json.loads((self.app.data_dir / "house" / "card-devices.json").read_text(encoding="utf-8"))
            cards = {i for i in doc.get("ids") or [] if isinstance(i, int) and not isinstance(i, bool) and 0 < i < 10 ** 9} if doc.get("v") == 1 else set()
        except (OSError, ValueError, AttributeError, TypeError):
            cards = set()
        return ids | cards

    def _manager_send(self, who, did, command, value, req, need, refuse, label, kind):
        """Steps 4–7 of the Manager's commands (a device's — _manage_device_command — or the house's: a mode, HSM —
        _manage_house_command, device id 0, always `need`): the broker and the bridge, the rate slots, the panel PIN
        and its one-time ticket, the signed message and the bridge's answer. `kind`: the activity log's kind."""
        n = self.app.notifier
        if getattr(n, "device_command", None) is None or not n.connected():
            return self._json(503, {"ok": False, "error": "no-broker"})
        if n.bridge() == "offline":
            return self._json(503, {"ok": False, "error": "no-bridge"})
        pin, ip = self.app.pin, self.client_address[0]
        if req.get("pin") is not None and not isinstance(req.get("pin"), str):   # (security review: a bad request, not a wrong guess)
            return self._json(400, {"ok": False, "error": "bad-request"})
        cmd_key = pin.purpose_key(device_rules.MGR_CMD_LABEL, create=True)
        if not cmd_key:
            return self._json(503, {"ok": False, "error": "no-key"})
        # 5. rate — the device's, the login's and (not for an admin) the Manager's slots are RESERVED here, in one locked
        # step, before the slow PIN check; given back when nothing is sent (a refused PIN, no broker). (v2.9.3) A
        # light's colour goes as two commands (setHue, then setSaturation — as on a panel): each has its own 1 s slot.
        tok, user = object(), who.user.lower()
        app = self.app
        gap_key = f"{did}:{command}" if command in ("setHue", "setSaturation") else did
        with app.cmd_lock:
            now = app.cmd_clock()   # (read under the lock: a request that waited for it never holds an older time)
            prev = app.cmd_device.get(gap_key)
            if prev and now - prev[0] < MANAGER_CMD_DEVICE_GAP:
                return self._json(429, {"ok": False, "error": "too-many", "retryIn": 1})
            mine = [x for x in app.cmd_login.get(user, []) if now - x[0] < 60]
            every = [x for x in app.cmd_all if now - x[0] < 60]
            full = [lst[0][0] for lst, cap in ((mine, MANAGER_CMD_LOGIN_RATE), (every, None if who.admin else MANAGER_CMD_RATE)) if cap and len(lst) >= cap]
            if full:
                app.cmd_login[user], app.cmd_all = mine, every
                return self._json(429, {"ok": False, "error": "too-many", "retryIn": max(1, math.ceil(60 - (now - min(full))))})
            app.cmd_device[gap_key] = (now, tok)
            app.cmd_login[user] = mine + [(now, tok)]
            app.cmd_all = every + [(now, tok)]

        def give_back():
            with app.cmd_lock:
                cur = app.cmd_device.get(gap_key)
                if cur and cur[1] is tok:
                    if prev:
                        app.cmd_device[gap_key] = prev
                    else:
                        app.cmd_device.pop(gap_key, None)
                app.cmd_login[user] = [x for x in app.cmd_login.get(user, []) if x[1] is not tok]
                app.cmd_all = [x for x in app.cmd_all if x[1] is not tok]
        # 6. the panel PIN, when the bridge would ask for it — counted on this login and this address
        keys = [ip, "manager:" + user]
        ticket = None
        if need or req.get("pin") is not None:
            if not pin.is_set():
                if need:
                    give_back()
                    return self._json(409, {"ok": False, "error": "pin-unset"})
            elif req.get("pin") is None:   # (not asked yet: not a wrong try)
                give_back()
                return self._json(403, {"ok": False, "error": "pin-required", "lockedFor": pin.locked_for_keys(keys)})
            else:
                result = pin.verify_keys(req.get("pin"), keys)
                if result != "ok":
                    give_back()
                    if result == "wrong":
                        left = pin.locked_for_keys(keys)
                        return refuse(403, "wrong-pin", **({"lockedFor": left} if left else {}))
                    return refuse(423, "locked", lockedFor=pin.locked_for_keys(keys))
                ticket = pin.ticket(did, command, value)
        # 7. send — at most MANAGER_CMD_WAITERS requests waiting for the bridge at once (each holds a server thread up to
        # MANAGER_CMD_WAIT); the message signed, with its deadline (the bridge drops it after) and the sender's role
        if not app.cmd_waiters.acquire(blocking=False):
            give_back()
            return self._json(429, {"ok": False, "error": "busy", "retryIn": 2})
        try:
            msg = {"id": did, "command": command, "by": manager_panel(who.user), "rid": secrets.token_hex(12),
                   "role": "admin" if who.admin else "user", "exp": int(time.time() + MANAGER_CMD_WAIT)}
            if value is not None:
                msg["value"] = value
            if ticket:
                msg["ticket"] = ticket
            msg["sig"] = device_rules.sign(cmd_key, msg)
            answer = n.device_command(msg)
        finally:
            app.cmd_waiters.release()
        shown = {"device": did, "command": command, **({"value": value} if value is not None else {})}
        if answer is False:
            give_back()
            return refuse(503, "no-broker")
        if answer is None:
            self._act(kind, target=label, result="timeout", **shown)
            log(f"manager: {command} for device {did} by {who.user}: no answer from the bridge")
            return self._json(504, {"ok": False, "error": "timeout"})
        reason = answer.get("reason") or ""
        self._act(kind, target=label, result="ok" if answer["ok"] else reason or "refused", **shown)
        log(f"manager: {command} for device {did} by {who.user} from {ip}: {'sent' if answer['ok'] else reason or 'refused'}")
        if answer["ok"]:
            return self._json(200, {"ok": True})
        if reason in ("pin-expired", "pin-missing", "no-ticket", "bad-ticket"):   # (the bridge wanted a PIN the server didn't ask: ask now)
            return self._json(403, {"ok": False, "error": "pin-required", "lockedFor": pin.locked_for_keys(keys)})
        if reason == "pin-unset":
            return self._json(409, {"ok": False, "error": "pin-unset"})
        if reason in ("hub error", "hub-error", "stale", "expired"):
            return self._json(502, {"ok": False, "error": "hub-error", "reason": reason})
        if reason in ("busy", "too-many", "rate"):
            return self._json(429, {"ok": False, "error": "too-many", "retryIn": 5})
        return self._json(409, {"ok": False, "error": "refused", "reason": reason or "refused"})

    GEOCODE_PER_MIN = 20

    def _manage_geocode(self):
        """GET /api/manage/geocode?q=<place>&lang=<code> (logins that may edit a panel's layout) → {ok, places: [{name,
        admin1?, country_code?, latitude, longitude}]} (at most 6; [] = no place by that name), or 502 "unreachable"
        (the weather service didn't answer). Asked from here because the Manager's page may only reach this server.
        20 a minute per login; the name typed is never logged."""
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        who = self._manage_need("panels")
        q = self._query(4)
        name, lang = (q.get("q") or [""])[0], (q.get("lang") or ["en"])[0]
        if not name.strip() or len(name) > geocode.MAX_Q:
            raise ApiError(400, "Type a place name (at most 60 characters)")
        now = time.monotonic()
        with self.app.lock_geocode:
            hits = [t for t in self.app.geocode_hits.get(who.user, []) if now - t < 60]
            if len(hits) >= self.GEOCODE_PER_MIN:
                self.app.geocode_hits[who.user] = hits
                return self._json(429, {"ok": False, "error": "slow-down"}, {"Retry-After": "60"})
            self.app.geocode_hits[who.user] = hits + [now]
        status, places = geocode.lookup(name, lang)
        if status != "ok":
            log("manager: place search — the weather service didn't answer")
            return self._json(502, {"ok": False, "error": "unreachable"})
        return self._json(200, {"ok": True, "places": places})

    def _manage_feedback(self):
        """(v3.0.0) Send feedback — any signed-in login, never the demo (its own relay form).
        GET → {about: {version, build, panels, devices, cameras, logins, broker, bridge} (counts and yes / no only), relay:
        the host it goes to}; PATCH {kind, title?, what, expected?, steps?, severity?, about?} — exactly what the tester
        saw and kept — → checked (service/feedback.py: the relay's schema), counted (per login 3 / 10 min, the install
        10 / day), sent to the relay → 200 {ok, issue, url} | 400 {error} | 429 {error, retry} | 502 / 503 {error}.
        Logged as feedback.send with the issue number or the result — never the words."""
        who = self._manage_ok()
        if getattr(who, "demo", False) or getattr(self.app.cfg, "demo", False):
            raise ApiError(403, "not-allowed")
        if self.command in ("GET", "HEAD"):
            return self._json(200, {"about": self.app.feedback_about(), "relay": feedback.RELAY_HOST,
                                    "limits": {"text": feedback.TEXT}}, extra={"Cache-Control": "no-store"})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        try:
            report = feedback.check(req, feedback.install_id(self.app.data_dir / "private"))
        except feedback.Refused as e:
            return self._json(400, {"ok": False, "error": str(e)})
        wait, tok = self.app.feedback_limits.take(who.user.lower(), admin=bool(who.admin))
        if wait is not None:
            return self._json(429, {"ok": False, "error": "too-many", "retry": wait})
        status, ans = self.app.feedback_send(report, self.app.cfg.release or self.app.cfg.version)
        if not ans.get("ok") and (status == 0 or 500 <= status <= 599):
            self.app.feedback_limits.release(tok)   # (it never reached GitHub: not counted)
        self._act("feedback.send", what=report["kind"], result="ok" if ans.get("ok") else str(status or "unreachable"),
                  **({"id": str(ans["issue"])} if ans.get("ok") and ans.get("issue") else {}))
        if ans.get("ok"):
            return self._json(200, {"ok": True, "issue": ans.get("issue"), "url": ans.get("url")})
        if status == 0:
            return self._json(502, {"ok": False, "error": "unreachable"})
        if status == 429:
            return self._json(429, {"ok": False, "error": ans.get("error") or "too-many", **({"retry": ans["retry"]} if ans.get("retry") else {})})
        if status == 503:
            return self._json(503, {"ok": False, "error": "not-set-up"})
        if status in (400, 413, 415):
            return self._json(400, {"ok": False, "error": ans.get("error") or "refused"})
        return self._json(502, {"ok": False, "error": "github" if status == 502 else "relay", "status": status})

    def _manage_house_command(self):
        """(v2.9.3) The house from the Manager: GET → {modes: [names], mode, hsm: {status, alert} | null,
        can: bool, pinSet} (what the bridge last said — retained hubitat/modes and hubitat/hsm); PATCH {command:
        "setMode", value: a mode the hub has} | {command: "setHsm", value: one of HSM_ACTIONS} with the panel PIN — always,
        as on a panel (disarm too). Who: an admin, or a login with "Switch devices" and at least one panel; never the
        demo. Then the same steps 4–7 as a device (device id 0 on the signed topic; the bridge checks the ticket for
        (0, the command, the value) and its own mode / HSM budgets). Logged as house.mode / house.hsm."""
        who = self._manage_ok()
        can = bool(who.can("switch") and not getattr(who, "demo", False) and not getattr(self.app.cfg, "demo", False)
                   and (who.admin or any(who.sees(p) for p in set(self.app.store.panel_ids()) | {PIN_GUARDED_PANEL})))
        n = self.app.notifier
        if self.command in ("GET", "HEAD"):
            if not can:   # (security review: a login that can't change them doesn't learn the mode or whether the house is armed)
                return self._json(200, {"can": False}, extra={"Cache-Control": "no-store"})
            house = n.house() if callable(getattr(n, "house", None)) else {"modes": [], "mode": None, "hsm": None}
            # (v3.0.0) broker: True / False / None (none set up) — the Manager says "can't reach the message broker"
            # before it asks for the PIN, not "Nothing was sent." after
            return self._json(200, {**house, "can": can, "pinSet": self.app.pin.is_set(), "hsmActions": list(device_rules.HSM_ACTIONS),
                                    "broker": n.connected() if callable(getattr(n, "connected", None)) else None},
                              extra={"Cache-Control": "no-store"})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        command, value = req.get("command"), req.get("value")
        kind = "house.hsm" if command == "setHsm" else "house.mode"
        label = "Alarm (HSM)" if command == "setHsm" else "Hubitat mode"

        def refuse(code, error, **extra):   # (as a device's: the refused shelf, folded per login + result a minute — never flooding the log)
            self._act("device.refused", target=label, device=0, **({"command": command} if isinstance(command, str) and command in device_rules.HOUSE_COMMANDS else {}), result=error)
            return self._json(code, {"ok": False, "error": error, **extra})
        if not can:
            return refuse(403, "not-allowed")
        if command not in device_rules.HOUSE_COMMANDS:
            return refuse(400, "command-not-allowed")
        if command == "setHsm":
            if not isinstance(value, str) or value not in device_rules.HSM_ACTIONS:
                return refuse(400, "bad-value")
        else:
            modes = (n.house() if callable(getattr(n, "house", None)) else {}).get("modes") or []
            if not isinstance(value, str) or not device_rules.MODE_NAME_RE.fullmatch(value) or value not in modes:
                return refuse(400, "bad-value")
        return self._manager_send(who, 0, command, value, req, True, refuse, label, kind)

    def _manage_devices(self):
        """GET: every Hubitat device (the house model's catalogue) with the owner's choices, the rooms, the roles;
        v2.4.0 also "live" (what each is doing now: lastAt, battery, health, values — service/live_state.py), "heard",
        "firstSeen" {id: epoch s} and "newIds" (turned up since the owner last reviewed the new ones).
        PATCH {id, set: {as | room | confirm | fanType | icon: value or null}}: change one device (house-wide; the
        bridge rebuilds the house model and the panels reload).
        PATCH {ids: [...], set: {...}} (v2.4.0, the bulk edit): the same change to every one of them — all checked first,
        nothing saved when one can't be that (400 names it), then one new rev; set.allowed (true / false: the panels may
        switch them) the admin only, for switchable devices only.
        PATCH {action: "reviewed"} (v2.4.0): the new devices were looked at — none is new any more.
        Reading: a login with a panel, or "devices"; changing: "devices"."""
        who = self._manage_read("devices")
        model = self.app.house_model() or {}
        catalog = [d for d in (model.get("devices") or []) if isinstance(d, dict) and isinstance(d.get("id"), int)]
        if self.command in ("GET", "HEAD"):
            # (what the whole house is doing: the "devices" permission — a panel login reads the list for its layouts)
            live, heard = self._live_of(catalog) if who.can("devices") else ({}, {})
            fs = getattr(self.app, "first_seen", None)
            # (no house model yet: nothing is marked known — the first real one is then the starting point)
            seen = fs.update([d["id"] for d in catalog]) if fs is not None and catalog else {"seen": {}, "new": []}
            hm = house_devices.house_model
            rooms = sorted(({r.get("name") for r in model.get("rooms") or [] if isinstance(r, dict) and r.get("name")}
                            | {d.get("hubRoom") for d in catalog if d.get("hubRoom")}) - set(hm.NO_ROOM))
            doc = self.app.devices.load()
            sensors = [{k: s.get(k) for k in ("id", "kind", "name", "where", "room", "temp")}
                       for s in model.get("sensors") or [] if isinstance(s, dict) and isinstance(s.get("id"), int)]
            return self._json(200, {"devices": catalog, "overrides": doc["overrides"], "rev": doc["rev"], "rooms": rooms, "sensors": sensors,
                                    "controls": (ctl := self._manage_controls(who, model)),   # (v2.9.1: what this login may switch here)
                                    "controlsPin": self._manage_controls_pin(model, ctl),   # (v2.9.2: …and which of it asks for the PIN)
                                    # (v2.9.3: the words each choice may be — a thermostat's modes, a fan's speeds — as the route checks them)
                                    "controlValues": {sid: {c: device_rules.manager_values(model, int(sid), c) for c in cmds
                                                            if device_rules.manager_values(model, int(sid), c) is not None} for sid, cmds in ctl.items()},
                                    "groups": self.app.devices.groups(), "unlockable": model.get("unlockable") or [],

                                    "roles": model.get("roles") or {}, "fanTypes": list(hm.FAN_TYPES),
                                    # (v2.8.0: each room's own icon from the house model — the phone's room tiles; a short name only)
                                    "roomIcons": {r["name"]: r["icon"] for r in model.get("rooms") or [] if isinstance(r, dict)
                                                  and isinstance(r.get("name"), str) and isinstance(r.get("icon"), str) and re.fullmatch(r"[a-z0-9-]{1,32}", r["icon"])},
                                    "noRoom": list(hm.NO_ROOM), "modelVersion": model.get("version"),
                                    "bridge": self.app.notifier.bridge(), "live": live, "heard": heard,
                                    "firstSeen": {str(k): v for k, v in seen["seen"].items()}, "newIds": seen["new"]})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        who = self._manage_need("devices")   # (a login without it can't change anything)
        req = self._json_body()
        if req.get("action") == "reviewed":
            fs = getattr(self.app, "first_seen", None)
            return self._json(200, {"ok": True, "reviewed": fs.reviewed() if fs is not None else None})
        if "ids" in req:
            return self._manage_devices_bulk(who, model, catalog, req)
        did = req.get("id")
        entry = next((d for d in catalog if d["id"] == did), None) if isinstance(did, int) and not isinstance(did, bool) else None
        if entry is None:
            raise ApiError(404, "no such device in the house model")
        icon = (req.get("set") or {}).get("icon") if isinstance(req.get("set"), dict) else None
        if isinstance(icon, str) and icon.startswith("up:") and not self.app.pictures.get(icon[3:]):
            raise ApiError(400, "no such picture")
        try:
            rev = self.app.devices.change(did, req.get("set"), entry)
        except house_devices.Invalid as e:
            raise ApiError(400, str(e))
        self._act("device.change", target=(entry.get("label") or entry.get("name")) if isinstance(entry, dict) else None, device=did,   # (v2.8.0: the catalogue's name is "label")
                  keys=sorted(req.get("set") or {}) if isinstance(req.get("set"), dict) else None)
        return self._json(200, {"ok": True, "rev": rev, "overrides": self.app.devices.load()["overrides"].get(str(did), {})})

    def _manage_devices_bulk(self, who, model, catalog, req):
        """PATCH /api/manage/devices {ids, set} (v2.4.0): one change to many devices — every device checked first, all
        or nothing (see _manage_devices). → {ok, rev, changed, overrides: {id: its choices now}}."""
        ids, change = req.get("ids"), req.get("set")
        if (not isinstance(ids, list) or not 1 <= len(ids) <= house_devices.BULK_MAX
                or not all(isinstance(i, int) and not isinstance(i, bool) for i in ids) or len(set(ids)) != len(ids)):
            raise ApiError(400, f"ids: 1 to {house_devices.BULK_MAX} different device ids")
        if not isinstance(change, dict) or not change or set(change) - set(house_devices.FIELDS) - {"allowed"}:
            raise ApiError(400, "set: " + ", ".join(house_devices.FIELDS + ("allowed",)))
        by_id = {d["id"]: d for d in catalog}
        missing = [i for i in ids if i not in by_id]
        if missing:
            raise ApiError(404, f"no such device in the house model: {missing[0]}")
        fields = {k: v for k, v in change.items() if k != "allowed"}
        if "allowed" in change:
            if not isinstance(change["allowed"], bool):
                raise ApiError(400, "allowed: true / false")
            if not who.admin:   # (what no panel may switch: the admin's, as PATCH /api/manage/never)
                raise ApiError(403, "not-allowed")
            try:
                switchable = house_devices.house_model.switchable(model, [])
            except (KeyError, TypeError):
                switchable = set()
            no = next((i for i in ids if i not in switchable), None)
            if no is not None:
                raise ApiError(400, f"{by_id[no].get('label') or no}: the panels can't switch it")
        icon = fields.get("icon")
        if isinstance(icon, str) and icon.startswith("up:") and not self.app.pictures.get(icon[3:]):
            raise ApiError(400, "no such picture")
        rev, clean = None, None
        if fields:   # (every device checked before anything is saved)
            try:
                clean = self.app.devices.check_many({i: (fields, by_id[i]) for i in ids})
            except house_devices.Invalid as e:
                raise ApiError(400, str(e))
        before = None
        if "allowed" in change:   # (the switch rule first: when it can't be saved, nothing is)
            s0 = self.app.store.get(PIN_GUARDED_PANEL)["data"].get("settings") or {}
            before = {k: s0.get(k) for k in ("neverSwitch", "switchRule")}
            try:
                self._set_allowed(model, ids, change["allowed"])
            except StoreError as e:
                return self._json(e.code, e.body)
        if clean:
            try:
                rev = self.app.devices.write_many(clean)
            except OSError:
                if before is not None:   # (the fields couldn't be saved: the switch rule goes back as it was)
                    def undo(data):
                        st = dict(data.get("settings") or {})
                        for k, v in before.items():
                            if v is None:
                                st.pop(k, None)
                            else:
                                st[k] = v
                        return {"settings": st}
                    try:
                        r2 = self.app.store.modify(PIN_GUARDED_PANEL, undo, create=True)
                        self.app.notifier.changed(PIN_GUARDED_PANEL, r2, ["settings"], "manager")
                    except StoreError:
                        pass
                raise ApiError(503, "not saved — the server couldn't write the device settings")
        ov = self.app.devices.load()["overrides"]
        self._act("device.change", count=len(ids))
        return self._json(200, {"ok": True, "rev": rev, "changed": len(ids), "overrides": {str(i): ov.get(str(i), {}) for i in ids}})

    # ---- guest Wi-Fi (service/guest_wifi.py does the UniFi work; these only read / write its files) ----------
    def _manage_templates(self):
        """GET: the saved cards (the layout builder's "Saved" list). PATCH {action: "add", name, card} | "rename"
        {id, name} | "remove" {id} (templates.Templates.change). Reading: a login with a panel, or "cards"."""
        self._manage_read("cards")
        if self.command in ("GET", "HEAD"):
            return self._json(200, {"templates": self.app.templates.all()})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        self._manage_need("cards")
        try:
            tpls = self.app.templates.change(self._json_body())
        except templates.Invalid as e:
            raise ApiError(400, str(e))
        return self._json(200, {"ok": True, "templates": tpls})

    def _lists(self):
        """GET: the shared lists and notes. PATCH {action, …} (lists.Lists.change): one change; the panels hear
        dashboard/lists/changed. At most 60 changes a minute from one address."""
        if self.command in ("GET", "HEAD"):
            return self._json(200, self.app.lists.get(), extra={"Cache-Control": "no-store"})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        who, now = self.client_address[0], time.monotonic()
        hits = [t for t in self.app.list_hits.get(who, []) if now - t < 60]
        if len(hits) >= 60:
            raise ApiError(429, "Too many changes — wait a minute")
        self.app.list_hits[who] = hits + [now]
        if len(self.app.list_hits) > 500:
            self.app.list_hits = {k: v for k, v in self.app.list_hits.items() if v and now - v[-1] < 60}
        try:
            doc = self.app.lists.change(req)
        except lists.Invalid as e:
            raise ApiError(400, str(e))
        self.app.notifier.lists_changed()
        return self._json(200, doc)

    def _guest_wifi(self, extra=None):
        """GET: the guest Wi-Fi status for the card and Settings (network name, its password for Settings — the QR
        code holds it anyway —, last / next change, guest modes, problems). PATCH {pin, settings?: {ssid, afterGuests, days}, changeNow?: true}: the owner's
        choices / "Change now", only with the panel PIN (set and right)."""
        priv = self.app.cfg.data_dir / "private"
        if self.command in ("GET", "HEAD"):
            if not self.app.cfg.guest_wifi:
                m = self.app.manual_guest()
                if not m:
                    return self._json(200, {"enabled": False})
                # typed in the Manager: no rotation, no networks to choose from (the password: Settings only)
                return self._json(200, {"enabled": True, "manual": True, "ok": True, "ssid": m["ssid"],
                                        "password": None if m["open"] else m["password"], "open": m["open"], "qr": m["key"],
                                        "networks": [], "settings": {}, "error": None, **(extra or {})})
            try:
                st = json.loads((priv / guest_wifi.STATUS).read_text(encoding="utf-8"))
            except (OSError, ValueError):
                st = {"ok": False, "error": "Starting — asking your UniFi console…"}
            return self._json(200, {"enabled": True, **(st if isinstance(st, dict) else {}), **(extra or {})})
        if self.command != "PATCH":
            raise ApiError(405, "Method not allowed")
        req = self._json_body()
        if not self.app.cfg.guest_wifi:
            return self._json(404, {"ok": False, "error": "not-enabled"})
        new, change_now = req.get("settings"), req.get("changeNow", False)
        if new is not None:
            if not isinstance(new, dict) or set(new) - set(guest_wifi.DEFAULT_SETTINGS):
                raise ApiError(400, '"settings" may only have "ssid", "afterGuests" and "days"')
            if guest_wifi.clean_settings({**guest_wifi.DEFAULT_SETTINGS, **new}) != {**guest_wifi.DEFAULT_SETTINGS, **new}:
                raise ApiError(400, '"ssid" (text, max 64), "afterGuests" (true / false), "days" (0, 1, 3, 7, 14 or 30)')
        if not isinstance(change_now, bool) or (new is None and not change_now):
            raise ApiError(400, 'send "settings" and / or "changeNow": true')
        pin, who = self.app.pin, self.client_address[0]
        if not pin.is_set():
            return self._json(403, {"ok": False, "error": "unset"})
        result = pin.verify(req.get("pin"), who)
        if result != "ok":
            return self._verify_answer(pin, result, who)
        if new is not None:
            with GUEST_SETTINGS_LOCK:   # two panels saving at once: neither change is lost
                cur = guest_wifi.clean_settings(read_json_file(priv / guest_wifi.SETTINGS))
                guest_wifi.write_private(priv / guest_wifi.SETTINGS, json.dumps({**cur, **new}, indent=1))
        if change_now:
            guest_wifi.write_private(priv / guest_wifi.REQUEST, json.dumps({"changeNow": time.time()}))
        return self._json(200, {"ok": True})

    def _guest_qr(self):
        """The guest network's QR code (an SVG made by service/guest_wifi.py). It holds the guest password, like the
        card on the wall that shows it — guests are meant to have it; never cached."""
        if self.command not in ("GET", "HEAD"):
            raise ApiError(405, "Method not allowed")
        if not self.app.cfg.guest_wifi and not self.app.manual_guest():
            raise ApiError(404, "Not found")
        m = None if self.app.cfg.guest_wifi else self.app.manual_guest()
        qr = self.app.cfg.data_dir / "private" / (guest_wifi.QR if self.app.cfg.guest_wifi else self.app.GUEST_MANUAL_QR)
        if m and not qr.exists():   # (its code went missing, e.g. a copied data folder: made again)
            try:
                self.app.set_manual_guest({"ssid": m["ssid"], "password": m["password"], "open": m["open"]})
            except (ValueError, OSError):
                pass
        try:
            body = qr.read_bytes()

        except OSError:
            raise ApiError(404, "No QR code yet")
        self._send(200, body, "image/svg+xml", {"Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'"})

    def _verify_answer(self, pin, result, who, purpose="general"):
        if result == "ok":
            return self._json(200, {"ok": True})
        if result == "unset":
            return self._json(409, {"ok": False, "error": "unset"})
        if result == "locked":   # (lockedFor: the seconds left — the PIN pad counts them down)
            return self._json(423, {"ok": False, "error": "locked", "lockedFor": pin.locked_for(who, purpose)})
        left = pin.locked_for(who, purpose)   # (this wrong one started a lock-out: the pad counts down at once)
        return self._json(403, {"ok": False, "error": "wrong-pin", **({"lockedFor": left} if left else {})})


class App:
    def __init__(self, cfg):
        self.cfg = cfg
        self.dashboard_root = cfg.dashboard_dir.resolve()
        self.data_dir = cfg.data_dir
        try:
            self.data_dir.mkdir(parents=True, exist_ok=True)
        except OSError as e:   # (v3.0.0: served anyway — the data-folder page says what to do)
            log(f"data folder: can't make it ({type(e).__name__})")
        self._pre_v3 = self._first_look()   # (v3.0.0: before anything of this start is written)
        self.store = Store(cfg.data_dir)
        self.pin = PanelPin(cfg.data_dir / "house")
        self.live = live_state.LiveState()   # what the house is doing now, from MQTT (the Overview; memory only)
        self.manager_acks = []               # when the Manager's last acknowledgements went out (MANAGER_ACK_RATE)
        # (v2.9.1) the Manager's device commands: when each went out — per device, per login, all of them
        self.cmd_lock = threading.Lock()
        self.cmd_device, self.cmd_login, self.cmd_all = {}, {}, []   # (device → (t, token); login → [(t, token)]; [(t, token)])
        self.cmd_waiters = threading.BoundedSemaphore(MANAGER_CMD_WAITERS)
        self.cmd_clock = time.monotonic   # (the rate slots' clock; the tests give it a hand-turned one)
        self._reveal_n, self._sw_last, self._ld_cache, self._ld_at = {}, {}, {}, -10.0   # (per guest switch: times it went on; its last value)
        self.feedback_limits = feedback.Limits()   # (v3.0.0: Send feedback — our own budget before the relay's)
        self.notifier = Notifier(cfg, self.live)
        self.notifier.after_live = self.watch_guest_switch   # (v2.9.3: reveal tickets end when the guest switch goes on)
        self.notifier.after_weather = self.log_weather_warnings   # (v3.0.0: the activity log — weather warnings up / ended)
        self._wx_logged = None   # (the weather warnings last seen: {id: title}; None until the first message after a start)
        # (v2.9.1: the bridge's answers to the Manager's device commands are signed with a key from the house ticket key)
        self.notifier.result_key = lambda: self.pin.purpose_key(device_rules.MGR_RESULT_LABEL, create=True)
        self.devices = house_devices.DeviceSettings(cfg.data_dir)
        self.first_seen = house_devices.FirstSeen(cfg.data_dir)   # when each device turned up (v2.4.0, "new devices found")
        self.auth = manager_auth.ManagerAuth(cfg.data_dir / "private", warn=lambda m: log(m))
        self.activity = activity_log.ActivityLog(cfg.data_dir / "private")   # what happened in the Manager (v2.7.0)
        self.auth.on_event = lambda kind, target, **data: self.activity.add(kind, target=target, **data)
        self.last_check_now = -60.0   # (Check now: at most every 10 s)
        self.last_export = -60.0      # (the activity CSV: at most every 10 s)
        self.prefs = manager_prefs.Prefs(cfg.data_dir / "private")   # each login's look in the Manager (v2.3.0)
        self.settings = house_settings.HouseSettings(cfg.data_dir / "private")
        self.pictures = pictures.Library(cfg.data_dir)
        self.cards = cards.Library(cfg.data_dir)
        # (v2.6.0) the Manager's camera pictures: from the built-in go2rtc inside the container, or the separate one set
        self.frames = camera_frames.Frames(camera_frames.http_fetch(
            "http://127.0.0.1:1985" if cfg.page_config.get("go2rtcPort") else getattr(cfg, "go2rtc_url", None) or cfg.page_config.get("go2rtc")))
        self.lists = lists.Lists(cfg.data_dir)
        self.templates = templates.Templates(cfg.data_dir)
        self.list_hits = {}                 # client address → recent changes (a rate limit for the shared lists)
        self.geocode_hits, self.lock_geocode = {}, threading.Lock()   # login → its recent place searches (20 a minute)
        self._manual_guest = (None, None)   # (file signature, its content) — read again only when the file changes
        self.perftests = {}                 # panel → when its last performance test was asked for (one a minute)
        self.bench_live = {}                # panel → its running benchmark's progress (bench.js report; memory only)
        self.health = health.Monitor(cfg.data_dir / "private" / "health.json", self.health_checks())
        # the house's calendars (iCal links: secrets in private/calendars.json; service/calendars.py)
        self.calendars = calendars.Calendars(cfg.data_dir / "private", log=lambda m: log(m))
        self.calendars.on_change = self.notifier.calendars_changed


        # stage 4: the device choices move from the main panel's settings to house/device-settings.json (once)
        try:
            old = (self.store.get(PIN_GUARDED_PANEL)["data"].get("settings") or {}).get("deviceOverrides")
            if self.devices.migrate(old if isinstance(old, dict) else {}) and old:   # (a new install: nothing moved, nothing said)
                log("devices: the device choices moved from the main panel's settings to house/device-settings.json")
        except (OSError, ValueError) as e:
            log(f"devices: could not move the device choices ({type(e).__name__})")
        # v2.2.0: the one PIN window (pinUnlockSeconds) becomes the general window; the alarm window starts at 30 s
        for pid in sorted(set(self.store.panel_ids()) | {PIN_GUARDED_PANEL}):
            try:
                if panel_settings.migrate_pin_window(self.store.get(pid)["data"].get("settings")) is not None:
                    self.store.modify(pid, lambda data: {"settings": panel_settings.migrate_pin_window(data.get("settings")) or data.get("settings")})
                    log(f"panel {pid}: its PIN window became the general PIN window (Manager → Panels → Safety)")
            except (OSError, ValueError, StoreError) as e:
                log(f"panel {pid}: could not move its PIN window ({type(e).__name__})")
        self._keep_old_kiosk_name()
        self.write_card_devices()

    KIOSK_MARK = pathlib.Path("house") / ".kiosk-default-v3"

    def _first_look(self):
        """(v3.0.0, the very first thing at a start) Whether this data folder is an install from before 3.0: the mark is
        missing and the server's own data is there — a login, a saved panel, the panel PIN, device choices (what run_all
        writes before the server starts — the broker's logins, the settings — doesn't count). A fresh folder gets the
        mark at once, so a later start never takes the data it made since for an old install."""
        mark = self.data_dir / self.KIOSK_MARK
        if mark.exists():
            return False
        d = self.data_dir
        pre = (d / "private" / "manager-users.json").exists() or any((d / "panels").glob("*.json")) \
            or (d / "house" / "panel-pin.json").exists() or (d / "house" / "device-settings.json").exists()
        if not pre:
            try:
                mark.parent.mkdir(parents=True, exist_ok=True)
                mark.write_text("3.0.0\n", encoding="utf-8")
            except OSError as e:
                log(f"could not write {mark.name} ({type(e).__name__})")
        return pre

    def _keep_old_kiosk_name(self):
        """(v3.0.0) New installs: the main panel's FreeKiosk name defaults to "skypane". An install from before 3.0
        (_first_look) whose main panel never set one kept the old default (OLD_KIOSK) — its tablet still uses that name
        for MQTT, so it is written into the panel's settings once, then the mark."""
        mark = self.data_dir / self.KIOSK_MARK
        if mark.exists() or not self._pre_v3:
            return
        try:
            doc = self.store.get(PIN_GUARDED_PANEL)
            if not (doc["data"].get("settings") or {}).get("kioskName"):
                self.store.modify(PIN_GUARDED_PANEL, lambda data: {"settings": {**(data.get("settings") or {}), "kioskName": OLD_KIOSK}}, create=True)
                log(f"panel {PIN_GUARDED_PANEL}: kept its FreeKiosk name {OLD_KIOSK!r} (new installs use {DEFAULT_KIOSK!r})")
            mark.parent.mkdir(parents=True, exist_ok=True)
            mark.write_text("3.0.0\n", encoding="utf-8")
        except (OSError, ValueError, StoreError) as e:
            log(f"panel {PIN_GUARDED_PANEL}: could not check its FreeKiosk name ({type(e).__name__})")

    def feedback_about(self):
        """(v3.0.0) The server's part of a feedback report's "About this install": counts and yes / no only — never a
        name, an address or a setting's value."""
        model = self.house_model() or {}
        try:
            logins = len(self.auth._users())
        except Exception:   # noqa: BLE001 (no login file yet)
            logins = 0
        out = {"version": (self.cfg.release or "dev")[:60], "panels": len(self.panel_names()),
               "devices": len([d for d in model.get("devices") or [] if isinstance(d, dict)]),
               "cameras": len([c for c in model.get("cameras") or [] if isinstance(c, dict)]),
               "logins": logins, "bridge": self.notifier.bridge() == "online"}
        # (v3.0.0) the broker: built-in or own — none at all (no MQTT host) leaves the line out (the relay knows only
        # "built-in" / "own")
        if self.cfg.mqtt_builtin:
            out["broker"] = "built-in"
        elif self.cfg.mqtt_host:
            out["broker"] = "own"
        build = re.sub(r"[^A-Za-z0-9 ._:/#()+,-]", "", str(self.cfg.version or ""))[:60]
        if build and build != out["version"]:
            out["build"] = build
        return {k: min(v, 100000) if isinstance(v, int) and not isinstance(v, bool) else v for k, v in out.items()}

    def feedback_send(self, report, version):
        return feedback.send(report, version)   # (the tests put their own relay here)

    def guest_lockdown(self):
        """house/guest-lockdown.json, checked: {switch: device id or None, panels: [ids], mode: "pin" | "dark", idle: s}."""
        d = read_json_file(self.data_dir / "house" / "guest-lockdown.json")
        d = d if isinstance(d, dict) else {}
        sw = d.get("switch")
        return {"switch": sw if isinstance(sw, int) and not isinstance(sw, bool) and sw > 0 else None,
                "panels": sorted({p for p in d.get("panels") or [] if isinstance(p, str) and PANEL_RE.fullmatch(p)}),
                "mode": d.get("mode") if d.get("mode") in GUEST_LOCKDOWN_MODES else "pin",
                "idle": d.get("idle") if isinstance(d.get("idle"), int) and 10 <= d.get("idle") <= 600 else 30,
                # (v2.9.3) the panels whose calendar is blurred while the switch is on (independent of "panels")
                "blurCalendar": sorted({p for p in d.get("blurCalendar") or [] if isinstance(p, str) and PANEL_RE.fullmatch(p)})}

    REVEAL_LABEL = "panel reveal v1"
    _boot = secrets.token_hex(4)                       # (this run's: a ticket from an earlier run never matches)

    def calendar_hidden(self, pid):
        """(v2.9.3) Whether this panel's calendar is blurred now: chosen for it, a switch picked, and the switch on
        or its state not known (no broker, not heard yet — closed, as the panel does)."""
        lock = self.lockdown_for(pid)
        if not lock or not lock["blur"]:
            return False
        live = getattr(self, "live", None)
        val = (((live.device(lock["switch"]) or {}).get("values")) or {}).get("switch") if live is not None else None
        return val != "off"

    def reveal_epoch(self, pid):
        """(security re-check) The panel's reveal epoch: this run's boot id + how often its guest switch went on since —
        a ticket from before (or from an earlier run) no longer matches."""
        lock = self.lockdown_for(pid)
        n = self._reveal_n.get(lock["switch"], 0) if lock else 0
        return f"{self._boot}{n:x}"

    def log_weather_warnings(self, st):
        """(Notifier.after_weather, v3.0.0) A weather warning the device starts reporting → "weather.alert" in the
        activity log (its level and event name), one it stops reporting → "weather.clear". The first message after a
        start only says what is up (no entries: they were logged before). Never a description or the device's data."""
        now = {w["id"]: (w["lvl"], w["title"]) for w in ((st or {}).get("warnings") or [])}
        before, self._wx_logged = self._wx_logged, now
        if before is None:
            return
        for i, (lvl, title) in now.items():
            if i not in before:
                self.activity.add("weather.alert", id=i, level=lvl, title=title)
        for i, (lvl, title) in before.items():
            if i not in now:
                self.activity.add("weather.clear", id=i, level=lvl, title=title)

    def weather_file(self):
        return self.data_dir / "house" / weather_device.FILE

    def weather_setting(self):
        """(v3.0.0) The weather device setting as saved (weather_device.clean_config: defaults when there's none)."""
        p = self.weather_file()
        try:
            return weather_device.clean_config(json.loads(p.read_text(encoding="utf-8")) if p.stat().st_size < 64 * 1024 else None)
        except (OSError, ValueError):
            return weather_device.clean_config(None)

    def save_weather_setting(self, cfg):
        p = self.weather_file()
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_name(f".{p.name}.{secrets.token_hex(6)}.tmp")
        tmp.write_text(json.dumps({**cfg, "updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")},
                                  indent=1, sort_keys=True), encoding="utf-8")
        os.replace(tmp, p)

    def watch_guest_switch(self):
        """(Notifier.after_live) After each hub message: the guest switch going on (from off or not known) bumps its
        epoch — every reveal ticket issued for its panels ends at once."""
        now = time.monotonic()
        if now - self._ld_at > 2:   # (the lockdown file read at most every 2 s)
            self._ld_cache, self._ld_at = self.guest_lockdown(), now
        sw = self._ld_cache.get("switch")
        if not sw or self.live is None:
            return
        val = (((self.live.device(sw) or {}).get("values")) or {}).get("switch")
        if val == "on" and self._sw_last.get(sw) != "on":
            self._reveal_n[sw] = self._reveal_n.get(sw, 0) + 1
        self._sw_last[sw] = val

    def reveal_ticket(self, pid, secs):
        """A ticket for /api/panel/<pid>/events while its calendar is blurred: "<exp>.<nonce>.<epoch>.<sig>" (HMAC with a
        key of its own from the house ticket key, bound to the panel and its reveal epoch), valid `secs` (≤ REVEAL_MAX).
        None without a key."""
        key = self.pin.purpose_key(self.REVEAL_LABEL, create=True)
        if not key:
            return None
        body = f"{int(time.time()) + int(secs)}.{secrets.token_hex(8)}.{self.reveal_epoch(pid)}"
        return f"{body}.{hmac.new(key, f'{body}|{pid}'.encode(), 'sha256').hexdigest()}"

    def reveal_ok(self, pid, ticket):
        key = self.pin.purpose_key(self.REVEAL_LABEL)
        try:
            exp, nonce, epoch, sig = ticket.split(".")
            if not (key and exp.isdecimal() and len(exp) <= 12 and re.fullmatch(r"[0-9a-f]{16}", nonce) and re.fullmatch(r"[0-9a-f]{1,32}", epoch)
                    and re.fullmatch(r"[0-9a-f]{64}", sig)):
                return False
        except (AttributeError, ValueError):
            return False
        now = time.time()
        if not now <= int(exp) <= now + REVEAL_MAX or epoch != self.reveal_epoch(pid):
            return False
        return hmac.compare_digest(sig, hmac.new(key, f"{exp}.{nonce}.{epoch}|{pid}".encode(), "sha256").hexdigest())

    def lockdown_for(self, pid):
        """(v2.9.3 — the shape agreed with the panels' side) What ONE panel does while the guest switch is on:
        {switch, mode: "pin" | "dark" | "none", idle, blur: bool} — in "panels": its mode, blur when it is also in
        "blurCalendar"; only in "blurCalendar": mode "none", blur true; in neither (or no switch): None."""
        ld = self.guest_lockdown()
        p = str(pid or "").lower()
        locks, blur = p in ld["panels"], p in ld["blurCalendar"]
        if not ld["switch"] or not (locks or blur):
            return None
        return {"switch": ld["switch"], "mode": ld["mode"] if locks else "none", "idle": ld["idle"], "blur": blur}

    def panel_names(self):
        """[(panel id, its name)…] of every panel set up (the main panel first) — the health monitor's panel list."""
        out = []
        for pid in sorted(set(self.store.panel_ids()) | {PIN_GUARDED_PANEL}, key=lambda p: (p != PIN_GUARDED_PANEL, p)):
            try:
                s = self.store.get(pid)["data"].get("settings") or {}
            except (OSError, ValueError, KeyError):
                s = {}
            out.append((pid, s.get("panelName") or ("Main panel" if pid == PIN_GUARDED_PANEL else pid)))
        return out

    def health_checks(self):
        """What the health monitor checks (service/health.py). Addresses are read at every check (the Manager's
        settings may change them); a part this house doesn't use is never a problem."""
        setting = lambda key: lambda: (self.settings.load().get(key) or "").strip()   # noqa: E731
        priv = self.data_dir / "private"
        checks = [health.mqtt_check(self.notifier.connected),
                  health.service_check("hubitat.hub", "Hubitat hub not reachable", health.tcp_probe(setting("HUBITAT_HOST"), 80), 4),
                  health.service_check("protect", "UniFi Protect not reachable", health.tcp_probe(setting("PROTECT_HOST"), 443), 3),
                  # (a Protect API key without the console's address — no default address since v2.2.0: the sync waits)
                  health.service_check("protect.host", "UniFi Protect: no console address",
                                       lambda: "The Protect cameras wait until the Protect console address is set (Integrations → UniFi Protect)"
                                       if setting("PROTECT_API_KEY")() and not setting("PROTECT_HOST")() else None, 3),
                  health.panels_check(self.panel_names), self._calendar_check]
        if self.cfg.mqtt_host:   # (no broker = a test setup: no bridge to expect)
            checks.insert(0, health.bridge_check(self.notifier.bridge, enabled=lambda: self.health_parts()["hub"]))
        if self.cfg.page_config.get("go2rtcPort"):   # the image's own go2rtc (once the camera sync wrote its config)
            cams = lambda probe: lambda: probe() if (priv / "go2rtc.yaml").exists() else None   # noqa: E731
            checks.append(health.service_check("go2rtc", "Camera video (go2rtc) is not running", cams(health.tcp_probe("127.0.0.1", 1985)), 3))
            checks.append(health.service_check("go2rtc.guard", "Camera video for the panels (port 1984) is not running",
                                               cams(health.tcp_probe("127.0.0.1", 1984)), 3))
        elif self.cfg.page_config.get("go2rtc"):    # a separate go2rtc (GO2RTC_URL)
            checks.append(health.service_check("go2rtc", "Camera video (go2rtc) not reachable", health.url_probe(self.cfg.page_config["go2rtc"]), 3))
        if self.cfg.guest_wifi:
            checks.append(health.service_check("unifi", "Guest Wi-Fi (UniFi) has a problem",
                                               health.status_file_probe(priv / guest_wifi.STATUS, max_age=1800), 3))
            checks.append(health.service_check("unifi.host", "UniFi console not reachable", health.tcp_probe(setting("UNIFI_HOST"), 443), 3))
        return checks

    def health_parts(self):
        """Which parts this house has set up at all (yes / no only, never an address): the hub (its address), the
        broker (MQTT_HOST), camera video / Protect (a Protect address or key, or a go2rtc of its own / separate). A part
        that isn't set up has no problem — the Manager's pill shows it grey ("not set up"), not green."""
        st = self.settings.load()
        has = lambda key: bool((st.get(key) or "").strip())   # noqa: E731
        cams = has("PROTECT_HOST") or has("PROTECT_API_KEY") or bool(self.cfg.page_config.get("go2rtc"))             or (bool(self.cfg.page_config.get("go2rtcPort")) and (self.data_dir / "private" / "go2rtc.yaml").exists())
        return {"hub": has("HUBITAT_HOST"), "broker": bool(self.cfg.mqtt_host), "cameras": cams}

    def _calendar_check(self, _m):
        """A calendar that can't be read: a notice on the Health page (the panels keep its last good copy)."""
        return [health.problem(f"calendar:{cid}"[:80], f"Calendar “{name}” can't be read", err or "", 2)
                for cid, name, err in self.calendars.problems()]

    def write_card_devices(self):
        """house/card-devices.json: every device the panels' layouts use (layouts.card_devices) — the bridge allows
        these to be switched too. Written after a Manager save and at start; only when it changed."""
        ids = set()
        for p in sorted(set(self.store.panel_ids()) | {PIN_GUARDED_PANEL}):
            try:
                ids |= layouts.card_devices(self.store.get(p)["data"].get("settings"))
            except (OSError, ValueError, KeyError, TypeError):
                continue
        target = self.data_dir / "house" / "card-devices.json"
        body = json.dumps({"v": 1, "ids": sorted(ids)[:2000]}, separators=(",", ":"))
        try:
            if target.exists() and target.read_text(encoding="utf-8") == body:
                return
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_name(f".{target.name}.{os.getpid()}.tmp")
            tmp.write_text(body, encoding="utf-8")
            os.replace(tmp, target)
        except OSError as e:
            log(f"card devices: not written ({type(e).__name__})")

    def house_model(self):
        """The house model the bridge wrote (house/hubitat-data.js), or None."""
        try:
            text = (self.data_dir / "house" / "hubitat-data.js").read_text(encoding="utf-8")
            m = json.loads(text[text.index("{"):text.rindex("}") + 1])
            return m if isinstance(m, dict) else None
        except (OSError, ValueError):
            return None

    # ---- a guest network typed in the Manager (houses without a UniFi console): private/guest-wifi-manual.json ----
    GUEST_MANUAL = "guest-wifi-manual.json"
    GUEST_MANUAL_QR = "guest-wifi-manual-qr.svg"   # (its own file: the UniFi child writes guest_wifi.QR)

    def manual_guest(self):
        """{ssid, password, open, key} or None. Only used while UniFi guest Wi-Fi isn't set up."""
        if self.cfg.guest_wifi:
            return None
        p = self.data_dir / "private" / self.GUEST_MANUAL
        try:
            st = p.stat()
            sig = (st.st_mtime_ns, st.st_size)
        except OSError:
            return None
        if self._manual_guest[0] != sig:
            m = read_json_file(p)
            ok = isinstance(m, dict) and isinstance(m.get("ssid"), str) and m["ssid"] and isinstance(m.get("password"), str)
            self._manual_guest = (sig, {"ssid": m["ssid"], "password": m["password"], "open": m.get("open") is True,
                                        "key": str(m.get("key") or "")[:16]} if ok else None)
        return self._manual_guest[1]

    def set_manual_guest(self, m):
        """Save (or with None remove) the typed guest network and make its QR code. ValueError on a bad value."""
        priv = self.data_dir / "private"
        if m is None:
            for name in (self.GUEST_MANUAL, self.GUEST_MANUAL_QR):
                try:
                    (priv / name).unlink()
                except OSError:
                    pass
            return
        if not isinstance(m, dict) or set(m) - {"ssid", "password", "open"}:
            raise ValueError('"manual": {ssid, password, open}')
        ssid, pw, is_open = m.get("ssid"), m.get("password") or "", m.get("open") is True
        if not isinstance(ssid, str) or not 1 <= len(ssid.encode("utf-8")) <= 32 or re.search(r"[\x00-\x1f\x7f]", ssid):
            raise ValueError("Network name: 1 to 32 characters (letters with accents and emoji count as 2 to 4 each)")   # (32 bytes: Wi-Fi's limit)
        if not isinstance(pw, str) or (not is_open and not re.fullmatch(r"[\x20-\x7e]{8,63}", pw)):   # (WPA: 8–63 plain ASCII characters)
            raise ValueError("Password: 8 to 63 characters — letters, digits and plain punctuation (or an open network)")
        if is_open:
            pw = ""
        logo, mime, _ = guest_wifi.qr_logo(self.data_dir)   # (the admin's picture, else the Skypane icon)
        svg = guest_wifi.qr_svg(guest_wifi.wifi_payload(ssid, pw, "nopass" if is_open else "wpa"), logo, mime)
        key = hashlib.sha256(svg.encode("utf-8")).hexdigest()[:16]
        guest_wifi.write_private(priv / self.GUEST_MANUAL_QR, svg)
        guest_wifi.write_private(priv / self.GUEST_MANUAL, json.dumps({"ssid": ssid, "password": pw, "open": is_open, "key": key}, indent=1))

    def layout_path(self):
        p = self.dashboard_root / LAYOUT

        try:
            p = p.resolve(strict=True)
        except OSError:
            return None
        return p if p.is_relative_to(self.dashboard_root) and p.is_file() else None


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    # (v3.0.0) Linux / macOS: SO_REUSEADDR, so "Save and restart" binds again at once — without it the browsers'
    # connections the old server closed (TIME_WAIT) kept the port busy for one to two minutes. It never lets two
    # running servers share the port there. Windows: SO_REUSEADDR WOULD let two servers share 8088, so it stays off and
    # the port is taken exclusively (SO_EXCLUSIVEADDRUSE) — TIME_WAIT doesn't block a new bind on Windows.
    allow_reuse_address = os.name != "nt"
    _slots = threading.BoundedSemaphore(MAX_CONNECTIONS)

    def server_bind(self):
        if os.name == "nt" and hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

    def process_request(self, request, client_address):
        # at most MAX_CONNECTIONS handler threads; beyond that the connection is closed at once
        if not self._slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._slots.release()

    def handle_error(self, request, client_address):
        # a browser closing a kept-alive connection (Windows: ConnectionResetError while the next request is read)
        # is normal — no traceback in the log for that; anything else still is logged as before
        if isinstance(sys.exc_info()[1], (ConnectionError, TimeoutError)):
            return
        super().handle_error(request, client_address)


BOOT_ID = uuid.uuid4().hex[:12]   # (v3.0.0) this server process: a new one after a restart (/api/health "boot"; the
                                   # Manager's "Restarting…" waits for it to change)
BIND_WAIT = 20   # seconds a restart waits for the port (the old server still closing) before it gives up


def build_server(cfg, wait=BIND_WAIT):
    """The server on cfg.bind:cfg.port. The port still busy (the old process of a restart not gone yet): tried again
    every half second for `wait` seconds — a quick restart, not run_all's backoff (1, 2, 4 … 60 s)."""
    deadline = time.monotonic() + wait
    while True:
        try:
            srv = Server((cfg.bind, cfg.port), Handler)
            break
        except OSError as e:
            if e.errno not in (errno.EADDRINUSE, getattr(errno, "WSAEADDRINUSE", -1)) or time.monotonic() >= deadline:
                raise
            time.sleep(0.5)
    srv.app = App(cfg)
    return srv


def _crash_logging():
    """(v2.7.2) Nothing ends quietly: a crashed thread logs its traceback (threading.excepthook), so does an uncaught
    error in the main thread (sys.excepthook), a native crash dumps every thread's stack (faulthandler), and the last
    line says how the process ended."""
    def thread_hook(a):
        if a.exc_type is SystemExit:
            return
        log(f"a thread crashed ({getattr(a.thread, 'name', '?')}):\n" + "".join(traceback.format_exception(a.exc_type, a.exc_value, a.exc_traceback)))
    threading.excepthook = thread_hook

    def main_hook(t, v, tb):
        log("the server crashed:\n" + "".join(traceback.format_exception(t, v, tb)))
    sys.excepthook = main_hook
    try:
        faulthandler.enable(file=sys.stderr, all_threads=True)
    except (OSError, ValueError, AttributeError):
        pass
    atexit.register(lambda: log("process exiting"))


def main():
    _crash_logging()
    cfg = Config()
    srv = build_server(cfg)
    stopping = threading.Event()

    def on_signal(signum, frame):
        if not stopping.is_set():
            stopping.set()
            log(f"got {signal.Signals(signum).name} - shutting down")
            threading.Thread(target=srv.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)
    if hasattr(signal, "SIGBREAK"):   # (Windows: Ctrl+Break / a console closing — logged, not a silent end)
        signal.signal(signal.SIGBREAK, on_signal)
    srv.app.health.start(publish=srv.app.notifier.health)   # (every 30 s; the heartbeat goes to Hubitat)
    srv.app.calendars.start()                                # (every 10 minutes: each calendar's link fetched again)
    host, port = srv.server_address[:2]
    log(f"dashboard service {cfg.version} on {host}:{port} - dashboard {cfg.dashboard_dir}, data {cfg.data_dir}")
    try:
        srv.serve_forever(poll_interval=0.5)
    finally:
        srv.server_close()
        srv.app.notifier.stop()
        log("stopped")


if __name__ == "__main__":
    main()
