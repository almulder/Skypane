"""Guest Wi-Fi from a UniFi console (e.g. a UDM Pro) (stage 3): the guest network's QR code for the panels, and a new password after guests.

Run by service/run_all.py as the "guestwifi" child when UNIFI_API_KEY is set. It
  - asks UniFi Network (the official Integration API on the console at UNIFI_HOST, header X-API-KEY) for the Wi-Fi
    networks every 5 minutes and keeps the chosen guest network's name + password;
  - makes the QR code (segno, error correction H, a picture in the middle: the Skypane icon, or the one the admin chose in
    Manager → Guest Wi-Fi — house/guest-qr-logo.json, a picture from the library) into <private>/guest-wifi-qr.svg — the
    dashboard server serves it at /api/guest-wifi/qr.svg; the password is never logged and never on the home-screen
    card, only in Settings → Guest Wi-Fi (the status has it: guests are meant to have it, the code holds it too);
  - follows the house's guest modes (Hubitat switches "Guest Mode, <who>", house model "guestModes", their states from
    the bridge over MQTT) and gives the guest network a NEW password
      * when the last guest mode turns off (the guests are gone) — "afterGuests", after GUESTS_GONE_DELAY seconds, and
      * every N days ("days", 0 = never) — but never while a guest mode is on, and
      * when the owner presses "Change now" on the panel (PIN checked by the dashboard server);
    guests still on the network are dropped by a change and rescan the code.
Files (all in DATA_DIR/private, mode 0600):
  guest-wifi-settings.json  {"ssid", "afterGuests", "days"} — written by the dashboard server (PIN-checked)
  guest-wifi-request.json   {"changeNow": <time>} — "Change now" from the panel; removed once handled
  guest-wifi-state.json     this program's memory: the password it set last (UniFi may not show it), when, …
  guest-wifi-status.json    for the panels: network, its password (Settings only), networks, last / next change, error
  guest-wifi-qr.svg         the QR code (it holds the password, like any Wi-Fi code)
Usage: python -I -u service/guest_wifi.py --data-dir /data [--once]
"""
import argparse
import base64
import hashlib
import json
import os
import pathlib
import secrets
import re
import ssl
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
REFRESH_EVERY = 300          # s between reading the networks from UniFi
GUESTS_GONE_DELAY = 60       # s after the last guest mode turned off (a quick off / on is not "gone")
RETRY_AFTER_FAIL = 600       # s before trying a failed password change again
DAY = 86400
PASS_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"   # no 0/O, 1/l/I: some guests type it
PASS_LEN = 16
DEFAULT_SETTINGS = {"ssid": "", "afterGuests": True, "days": 0}
DAYS_CHOICES = (0, 1, 3, 7, 14, 30)

SETTINGS = "guest-wifi-settings.json"
# (v3.0.4) a dropped, cut-off or timed-out answer, in plain words: nearly always the console busy or restarting
QUIET = "The UniFi console didn't answer — it may be restarting. Try again in a minute."
REQUEST = "guest-wifi-request.json"
STATE = "guest-wifi-state.json"
STATUS = "guest-wifi-status.json"
QR = "guest-wifi-qr.svg"
LOGO_CHOICE = "guest-qr-logo.json"   # (in DATA_DIR/house: {"picture": "<library id>"} — not secret; none = the Skypane icon)
LOGO_DEFAULT = ROOT / "dashboard" / "assets" / "icon-192.png"
LOGO_MIME = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp", "gif": "image/gif"}   # (service/pictures.py MIME)


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def clean_settings(s):
    """The settings with only known keys and sane values (the server checks them too)."""
    out = dict(DEFAULT_SETTINGS)
    if isinstance(s, dict):
        if isinstance(s.get("ssid"), str) and len(s["ssid"]) <= 64:
            out["ssid"] = s["ssid"]
        if isinstance(s.get("afterGuests"), bool):
            out["afterGuests"] = s["afterGuests"]
        if isinstance(s.get("days"), int) and not isinstance(s.get("days"), bool) and s["days"] in DAYS_CHOICES:
            out["days"] = s["days"]
    return out


def write_private(path, text):
    """Atomic, mode 0600 from the start; a temp file of its own (two writers at once never share one)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")   # (mkstemp: mode 0600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def read_json(path, default=None):
    try:
        v = json.loads(path.read_text(encoding="utf-8"))
        return v if isinstance(v, dict) else default
    except (OSError, ValueError):
        return default


def new_password():
    return "".join(secrets.choice(PASS_ALPHABET) for _ in range(PASS_LEN))


# ---------- QR code ----------
def wifi_payload(ssid, password, security):
    esc = lambda s: "".join("\\" + c if c in '\\;,:"' else c for c in s)   # noqa: E731
    if security == "nopass" or not password:
        return f"WIFI:T:nopass;S:{esc(ssid)};;"
    return f"WIFI:T:WPA;S:{esc(ssid)};P:{esc(password)};;"


def qr_logo(data_dir):
    """The picture in the middle of the code: (bytes, mime, key) — the admin's choice from the picture library
    (house/LOGO_CHOICE; read here without importing pictures.py: this runs isolated), else the Skypane icon, else
    (None, None, "none")."""
    data_dir = pathlib.Path(data_dir)
    pid = (read_json(data_dir / "house" / LOGO_CHOICE, {}) or {}).get("picture")
    if isinstance(pid, str) and re.fullmatch(r"[0-9a-f]{16}", pid):
        try:
            index = json.loads((data_dir / "pictures" / "index.json").read_text(encoding="utf-8"))
            p = next((x for x in index if isinstance(x, dict) and x.get("id") == pid), None) if isinstance(index, list) else None
            if p and p.get("ext") in LOGO_MIME:
                return (data_dir / "pictures" / f"{pid}.{p['ext']}").read_bytes(), LOGO_MIME[p["ext"]], pid
        except (OSError, ValueError):
            pass
    try:
        return LOGO_DEFAULT.read_bytes(), "image/png", "skypane"
    except OSError:
        return None, None, "none"


def qr_svg(payload, logo_png=None, mime="image/png"):
    """The QR code as SVG (black on white, 2-module quiet zone), with the logo on a white rounded square in the middle.
    Error correction H (30 %): the logo covers about 7 % of the code, so phones still read it."""
    import segno   # (only here: the server imports this module for its file names and doesn't need segno)
    q = segno.make(payload, error="h", boost_error=False, micro=False)
    rows = [[bool(v) for v in r] for r in q.matrix]
    n, quiet = len(rows), 2
    size = n + 2 * quiet
    hole = None
    if logo_png:
        w = round(n * 0.26) | 1                      # an odd number of modules, centred
        a = (n - w) // 2
        hole = (a, a + w)
    path = []
    for y, r in enumerate(rows):
        x = 0
        while x < n:
            if r[x] and not (hole and hole[0] <= x < hole[1] and hole[0] <= y < hole[1]):
                start = x
                while x < n and r[x] and not (hole and hole[0] <= x < hole[1] and hole[0] <= y < hole[1]):
                    x += 1
                path.append(f"M{start + quiet} {y + quiet}h{x - start}v1h{start - x}z")
            else:
                x += 1
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" shape-rendering="crispEdges">',
             f'<rect width="{size}" height="{size}" fill="#fff"/>', f'<path fill="#000" d="{"".join(path)}"/>']
    if hole:
        a, b = hole[0] + quiet, hole[1] + quiet
        w = b - a
        pad = w * 0.08
        data = base64.b64encode(logo_png).decode("ascii")
        parts.append(f'<rect x="{a}" y="{a}" width="{w}" height="{w}" rx="{w * 0.18:.2f}" fill="#fff" shape-rendering="geometricPrecision"/>')
        parts.append(f'<image x="{a + pad:.2f}" y="{a + pad:.2f}" width="{w - 2 * pad:.2f}" height="{w - 2 * pad:.2f}" '
                     f'preserveAspectRatio="xMidYMid meet" href="data:{mime if mime in LOGO_MIME.values() else 'image/png'};base64,{data}"/>')
    parts.append("</svg>")
    return "".join(parts) + "\n"


# ---------- UniFi Network (Integration API) ----------
class Fail(Exception):
    """Something the owner should see (status "error"); never contains the key or a password. unsure = the request
    may have reached UniFi (no answer): a password change may or may not have happened."""

    def __init__(self, msg, unsure=False):
        super().__init__(msg)
        self.unsure = unsure


KEY_OK = re.compile(r"[A-Za-z0-9._~+/=-]{8,256}")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise Fail(f"UniFi answered with a redirect (HTTP {code}); refusing to send the API key elsewhere. Check the UniFi console address (Manager → Integrations).")


class UniFi:
    """GET / PUT on https://<host>/proxy/network/integration/v1 with the X-API-KEY header. The console's certificate
    is self-signed: not verified (LAN only, like the Protect client); redirects are never followed (the key stays)."""

    max_bytes = 4_000_000   # (v3.0.4: service/unifi_net.py reads bigger lists)

    def __init__(self, host, key, timeout=15):
        self.host, self.key, self.timeout = host, key, timeout
        self.base = f"https://{host}/proxy/network/integration/v1"
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        self.opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx), NoRedirect())
        self.site = None

    def _req(self, method, path, body=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"X-API-KEY": self.key, "Accept": "application/json",
                                              **({"Content-Type": "application/json"} if data else {})})
        try:
            with self.opener.open(req, timeout=self.timeout) as r:
                raw = r.read(self.max_bytes)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                # (v3.0.3: shown on Integrations itself — it no longer sends people to the page they're on)
                raise Fail(f"UniFi refused the API key (HTTP {e.code}). Check that the UniFi Network API key is right and complete; changing the guest "
                           "password needs a key from an admin with full UniFi Network management.") from None
            if e.code == 404:
                raise Fail("UniFi Network has no Wi-Fi API here (HTTP 404) — it needs UniFi Network 10 or newer "
                           "on the console, and the UniFi console address (Manager → Integrations) must be the console.") from None
            raise Fail(f"UniFi answered HTTP {e.code} to {method} {path.split('/wifi')[0].split('/sites')[0] or '/'}") from None
        except urllib.error.URLError as e:
            reason = getattr(e, "reason", None)
            raise Fail(f"Can't reach UniFi at {self.host} ({type(reason).__name__ if isinstance(reason, BaseException) else 'no answer'}). "
                       "Is the UniFi console address (Manager → Integrations) right?", unsure=method != "GET") from None
        except Exception as e:   # timeouts, cut-off answers, anything else: never a traceback (it could show the key)
            raise Fail(QUIET, unsure=method != "GET") from None
        try:
            v = json.loads(raw) if raw else {}
        except ValueError:
            raise Fail("UniFi sent something that isn't JSON — is the UniFi console address right?") from None
        if not isinstance(v, dict):
            raise Fail("UniFi sent an unexpected answer")
        return v

    def _site(self):
        if self.site:
            return self.site
        sites = (self._req("GET", "/sites?limit=200") or {}).get("data") or []
        if not sites:
            raise Fail("UniFi shows no sites for this API key")
        pick = next((s for s in sites if (s.get("internalReference") == "default")), sites[0])
        self.site = pick.get("id")
        return self.site

    def networks(self):
        """[{id, name, enabled, security, passphrase-or-None}] (a broadcast whose passphrase UniFi hides → None)."""
        site = self._site()
        out, offset = [], 0
        while True:
            page = self._req("GET", f"/sites/{site}/wifi/broadcasts?offset={offset}&limit=200") or {}
            data = page.get("data") if isinstance(page.get("data"), list) else []
            out += data
            offset += len(data)
            total = page.get("totalCount")
            if not data or not isinstance(total, int) or offset >= total or offset >= 2000:
                break
        return [summary(b) for b in out if isinstance(b, dict) and b.get("id")]

    def broadcast(self, bid):
        return self._req("GET", f"/sites/{self._site()}/wifi/broadcasts/{bid}")

    def set_passphrase(self, bid, password):
        """PUT the whole broadcast back (the API replaces it) with only the passphrase changed."""
        b = self.broadcast(bid)
        sc = b.get("securityConfiguration")
        if not isinstance(sc, dict) or not str(sc.get("type") or "").endswith("_PERSONAL"):
            raise Fail("The guest network isn't WPA personal (a password network) — nothing to change")
        body = {k: v for k, v in b.items() if k not in ("id", "metadata")}
        body["securityConfiguration"] = dict(sc, passphrase=password)
        self._req("PUT", f"/sites/{self._site()}/wifi/broadcasts/{bid}", body)


def summary(b):
    sc = b.get("securityConfiguration") if isinstance(b.get("securityConfiguration"), dict) else {}
    t = str(sc.get("type") or "")
    p = sc.get("passphrase")
    readable = isinstance(p, str) and 8 <= len(p) <= 63 and "REDACTED" not in p.upper() and set(p) != {"*"}
    return {"id": str(b["id"]), "name": str(b.get("name") or ""), "enabled": b.get("enabled") is not False,
            "security": "nopass" if t == "OPEN" else ("wpa" if t.endswith("_PERSONAL") else "other"),
            "passphrase": p if readable else None}


# ---------- the guest modes (Hubitat, through the bridge) ----------
class Guests:
    """Which guest modes exist (house model) and whether any is on (bridge state over MQTT). known = both arrived."""

    def __init__(self, house_dir):
        self.model_file = pathlib.Path(house_dir) / "hubitat-data.js"
        self.model_sig, self.ids, self.names = None, [], {}
        self.state, self.got_state = {}, False
        self.list_version = 0   # +1 whenever the list of guest modes changes (one removed is not "the guests left")
        self.lock = threading.Lock()

    def load_model(self):
        try:
            st = self.model_file.stat()
            sig = (st.st_mtime_ns, st.st_size)
        except OSError:
            return
        if sig == self.model_sig:
            return
        try:
            text = self.model_file.read_text(encoding="utf-8")
            model = json.loads(text[text.index("{"):text.rindex("}") + 1])
        except (OSError, ValueError):
            return
        self.model_sig = sig
        ids = [int(i) for i in model.get("guestModes") or [] if str(i).isdecimal()]
        names = {t["id"]: t.get("name") or "" for t in model.get("things") or [] if isinstance(t, dict) and t.get("id") in ids}
        with self.lock:
            if ids != self.ids:
                self.list_version += 1
            self.ids, self.names = ids, names

    def on_state(self, payload):
        try:
            st = json.loads(payload)
        except ValueError:
            return
        if isinstance(st, dict):
            with self.lock:
                self.state = {str(k): v for k, v in st.items() if isinstance(v, dict)}
                self.got_state = True

    def on_event(self, payload):
        try:
            ev = json.loads(payload)
        except ValueError:
            return
        if isinstance(ev, dict) and ev.get("name") == "switch":
            with self.lock:
                self.state.setdefault(str(ev.get("id")), {})["switch"] = ev.get("value")

    def snapshot(self):
        """(known, any_on, [{id, name, on}])"""
        with self.lock:
            modes = [{"id": i, "name": self.names.get(i, ""), "on": (self.state.get(str(i)) or {}).get("switch") == "on"}
                     for i in self.ids]
            known = self.got_state and bool(self.ids) and all(str(i) in self.state for i in self.ids)
        return known, any(m["on"] for m in modes), modes


# ---------- the main loop ----------
class GuestWifi:
    def __init__(self, api, data_dir, guests, logo_png="auto", now=time.time):
        # logo_png "auto": the admin's choice / the Skypane icon (qr_logo), read again at every step — a new choice
        # makes the code again
        self.api, self.guests, self.logo, self.now = api, guests, logo_png, now
        self.data_dir = pathlib.Path(data_dir)
        self.private = pathlib.Path(data_dir) / "private"
        self.state = read_json(self.private / STATE, {}) or {}
        self.nets, self.net, self.error, self.read_at = [], None, None, 0
        # guests here at the last look (kept across restarts: guests leaving while it restarted still count)
        self.prev_any = self.state.get("anyOn") if isinstance(self.state.get("anyOn"), bool) else None
        self.list_seen = None
        self.settings_seen = None
        self.failed_at = 0
        self.last_qr_key = None   # the code on disk (None = unknown, False = none)

    def settings(self):
        return clean_settings(read_json(self.private / SETTINGS, {}))

    def save_state(self):
        write_private(self.private / STATE, json.dumps(self.state, indent=1))

    def refresh(self):
        s = self.settings()
        try:
            self.nets = self.api.networks()
            self.error = None
        except Fail as e:
            self.error = str(e)
            return
        finally:
            self.read_at = self.now()
        wifi = [n for n in self.nets if n["security"] in ("wpa", "nopass")]
        if s["ssid"]:
            self.net = next((n for n in wifi if n["name"] == s["ssid"]), None)
            if not self.net:
                # (v3.0.3 review) a chosen network that's gone (renamed / deleted) is a real problem: Trouble + a
                # health problem, not "still to be set up"
                self.error = f'The guest network "{s["ssid"]}" isn\'t on the UniFi console any more — pick it again'
        else:   # not chosen yet: the one with "guest" in its name, if there's exactly one
            g = [n for n in wifi if "guest" in n["name"].lower()]
            self.net = g[0] if len(g) == 1 else None
        if self.net and self.state.get("netId") != self.net["id"]:
            # another network than the one this program set a password for: forget that one (not the guests)
            keep = {k: self.state[k] for k in ("anyOn", "guestsGoneAt") if k in self.state}
            self.state = {"netId": self.net["id"], "since": self.now(), **keep}
            self.save_state()

    def password(self):
        """The guest network's password: UniFi's, or (when UniFi hides it) the one this program set."""
        if not self.net:
            return None
        if self.net["security"] == "nopass":
            return ""
        return self.net["passphrase"] or (self.state.get("pass") if self.state.get("netId") == self.net["id"] else None)

    def change(self, why):
        if not self.net or self.net["security"] != "wpa":
            self.error = "No guest network with a password chosen — nothing to change"
            return False
        new = new_password()
        old = dict(self.state)
        self.state.update(netId=self.net["id"], pending=True)   # if this stops halfway, the next start knows
        self.save_state()
        try:
            self.api.set_passphrase(self.net["id"], new)
        except Fail as e:
            if e.unsure:
                # no answer: UniFi may have taken the new password. Neither is certain → no code until UniFi shows its
                # password or the next change (the "pending" recovery in step())
                self.state = dict(old, netId=self.net["id"], pending=True)
                self.state.pop("pass", None)
                self.last_qr_key = None
            else:
                self.state = old
            self.save_state()
            self.error = f"Couldn't change the guest password: {e}"
            self.failed_at = self.now()
            log(f"guest Wi-Fi: password change ({why}) FAILED: {e}")
            return False
        self.state = {"netId": self.net["id"], "pass": new, "changedAt": self.now(), "why": why, "since": old.get("since", self.now()),
                      **({"anyOn": old["anyOn"]} if "anyOn" in old else {})}
        self.save_state()
        self.net = dict(self.net, passphrase=None)  # until the next read
        self.error = None
        log(f"guest Wi-Fi: new password for \"{self.net['name']}\" ({why})")
        self.refresh()
        return True

    def step(self):
        """One pass (every few seconds)."""
        now = self.now()
        self.guests.load_model()
        s = self.settings()
        # new settings (another network chosen on the panel): read UniFi now, before a "Change now" that may follow
        if not self.read_at or now - self.read_at >= REFRESH_EVERY or s != self.settings_seen:
            self.settings_seen = s
            self.refresh()
        known, any_on, modes = self.guests.snapshot()
        if self.guests.list_version != self.list_seen:
            # a guest mode added / removed / hidden: start from what's on now (one going away isn't "guests left") —
            # not on the first look, where the saved value from before a restart still counts
            first, self.list_seen = self.list_seen is None, self.guests.list_version
            if not first and self.prev_any is not None and known:
                self.prev_any = any_on
        no_modes = not modes   # no guest modes in Hubitat (yet): only the days rule and "Change now" apply

        # a change cut off halfway (restart): UniFi's own password decides; if UniFi hides it, ours may be wrong
        if self.state.get("pending") and self.net:
            if self.net.get("passphrase"):
                self.state.pop("pending")
                self.save_state()
            else:
                self.state.pop("pass", None)   # unknown now: no QR until the next change
                self.state.pop("pending")
                self.save_state()

        req = read_json(self.private / REQUEST)
        if req is not None:
            try:
                (self.private / REQUEST).unlink()
            except OSError:
                pass
            if req.get("changeNow"):
                # (v3.0.3: the Manager's "Change password now" writes "from": "manager" — the log said "from the panel")
                self.change("changed from the Manager" if req.get("from") == "manager" else "changed from the panel")

        if known or no_modes:
            if known:
                dirty = self.state.get("anyOn") != any_on
                if self.prev_any and not any_on:                       # the last guest mode just turned off
                    self.state["guestsGoneAt"] = now
                    dirty = True
                elif any_on and self.state.get("guestsGoneAt"):         # back on before the change: not gone after all
                    self.state.pop("guestsGoneAt")
                    dirty = True
                self.prev_any = any_on
                self.state["anyOn"] = any_on
                if dirty:
                    self.save_state()
            wpa = bool(self.net) and self.net["security"] == "wpa"
            retry_ok = now - self.failed_at >= RETRY_AFTER_FAIL
            gone = self.state.get("guestsGoneAt")
            if gone and not any_on and now - gone >= GUESTS_GONE_DELAY:
                if not s["afterGuests"] or (self.net and not wpa):   # off, or an open network: nothing to change
                    self.state.pop("guestsGoneAt")
                    self.save_state()
                elif retry_ok and self.net:
                    self.change("guests left")
            elif s["days"] and not any_on and retry_ok and wpa:
                since = self.state.get("changedAt") or self.state.get("since")
                if since is None:
                    self.state["since"] = now
                    self.save_state()
                elif now - since >= s["days"] * DAY:
                    self.change(f"every {s['days']} days")
        self.write_outputs(s, known, any_on, modes)

    def next_change(self, s, any_on):
        if not s["days"] or not self.net or self.net["security"] != "wpa":
            return None
        since = self.state.get("changedAt") or self.state.get("since")
        return None if since is None else since + s["days"] * DAY

    def write_outputs(self, s, known, any_on, modes):
        pw = self.password()
        qr_ok = bool(self.net) and pw is not None
        if qr_ok:
            logo, mime, which = qr_logo(self.data_dir) if self.logo == "auto" else (self.logo, "image/png", "given")
            key = hashlib.sha256(f"{self.net['name']}\0{pw}\0{self.net['security']}\0{which}".encode()).hexdigest()[:16]
            if key != self.last_qr_key:
                write_private(self.private / QR, qr_svg(wifi_payload(self.net["name"], pw, self.net["security"]), logo, mime))
                self.last_qr_key = key
        else:
            key = None
            if self.last_qr_key is not False:   # no valid code now: don't leave an old one to be served
                try:
                    (self.private / QR).unlink()
                except OSError:
                    pass
                self.last_qr_key = False
        problem = self.error
        if not problem and not self.net:
            problem = "Choose the guest network (Manager → Integrations → Guest Wi-Fi)"
        elif not problem and not qr_ok:
            problem = "UniFi doesn't show this network's password — press \"Change password now\" once, then the code follows"
        status = {
            "ok": qr_ok and not self.error, "ssid": self.net["name"] if self.net else None,
            # (v3.0.3) the console answered with this key, only the guest network isn't set up yet (none chosen, its
            # password unknown until "Change password now"): the Manager says Connected + "Open → set up", not Trouble.
            # Any error (the console not answering, the chosen network gone from it) is Trouble.
            "needsSetup": not qr_ok and not self.error,
            # for Settings → Guest Wi-Fi (to see it changed; anyone who scans the code has it anyway).
            # The home-screen card never shows it.
            "password": pw if qr_ok and pw else None,
            "open": bool(self.net) and self.net["security"] == "nopass", "qr": key,
            "networks": [n["name"] for n in self.nets if n["security"] in ("wpa", "nopass")],
            "settings": s, "error": problem,
            "changedAt": self.state.get("changedAt") if self.net and self.state.get("netId") == self.net["id"] else None,
            "why": self.state.get("why"), "nextChange": self.next_change(s, any_on), "guestsGoneAt": self.state.get("guestsGoneAt"),
            "guestModes": modes, "guestsKnown": known, "guestsHere": any_on, "readAt": self.read_at,
        }
        text = json.dumps(status, indent=1)
        if read_text(self.private / STATUS) != text:
            write_private(self.private / STATUS, text)


def read_text(p):
    try:
        return p.read_text(encoding="utf-8")
    except OSError:
        return None


def mqtt_follow(guests):
    """The bridge's device states (retained hubitat/state) and switch events, with the internal broker login."""
    import paho.mqtt.client as mqtt
    host = (os.environ.get("MQTT_HOST") or "").strip()
    if not host:
        log("guest Wi-Fi: no MQTT — the guest modes can't be followed (no automatic password changes)")
        return None
    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"guestwifi-{os.getpid()}")
    if os.environ.get("MQTT_USER"):
        c.username_pw_set(os.environ["MQTT_USER"], os.environ.get("MQTT_PASSWORD") or None)

    def on_connect(client, userdata, flags, rc, props=None):
        client.subscribe([("hubitat/state", 1), ("hubitat/event", 0)])

    def on_message(client, userdata, msg):
        (guests.on_state if msg.topic == "hubitat/state" else guests.on_event)(msg.payload.decode("utf-8", "replace"))

    c.on_connect, c.on_message = on_connect, on_message
    c.reconnect_delay_set(1, 30)
    c.connect_async(host, int(os.environ.get("MQTT_PORT") or 1883), keepalive=60)
    c.loop_start()
    return c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    key = (os.environ.get("UNIFI_API_KEY") or "").strip()
    host = (os.environ.get("UNIFI_HOST") or "").strip()
    if not key or not host:
        log("guest Wi-Fi: the UniFi console address and API key (Manager → Integrations) are both needed — not running")
        return 2
    if not KEY_OK.fullmatch(key):   # (a bad paste: spaces, line breaks … — never print it)
        log("guest Wi-Fi: the UniFi API key looks malformed (only letters, digits and . _ ~ + / = - expected) — not running")
        return 2
    if not re.fullmatch(r"[A-Za-z0-9.:\[\]-]{1,253}", host):
        log("guest Wi-Fi: the UniFi console address must be just the console's address (e.g. 192.168.1.1) — not running")
        return 2
    data = pathlib.Path(a.data_dir)
    guests = Guests(data / "house")
    stop = threading.Event()
    client = None if a.once else mqtt_follow(guests)
    gw = GuestWifi(UniFi(host, key), data, guests)
    shown = None
    try:
        while True:
            gw.step()
            if gw.error != shown:
                shown = gw.error
                log(f"guest Wi-Fi: {shown}" if shown else f"guest Wi-Fi: OK — {gw.net['name'] if gw.net else 'no network chosen'}")
            if a.once or stop.wait(5):
                break
    except KeyboardInterrupt:
        pass
    finally:
        if client:
            client.loop_stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
