"""The house's settings (stage 4): set on the Manager page, kept in DATA_DIR/private/settings.json (mode 0600).

Before stage 4 they were the Unraid template's variables; the first start copies whatever the template still has
(`import_env`), after that this file wins and the template only needs the port and the /data folder. run_all.py turns
the file into each child's environment (same names as before, so the children didn't change) and restarts them when
it changes. Secrets are never sent back to a browser: the Manager only learns whether one is set.
"""
import json
import os
import pathlib
import re
import secrets

FILE = "settings.json"
HOST = r"[A-Za-z0-9.:\[\]-]{1,253}"
TOKEN = r"[A-Za-z0-9._~+/=-]{1,256}"
URL = r"(https?|wss?)://[^\s\"'<>\\]{1,300}"
NAME = r"[A-Za-z0-9._-]{1,64}"

# key: (group, label, pattern, secret, help) — the keys are the old template variables' names
FIELDS = {
    # (v3.0.7) Maker API is optional: the Skypane Helper app (Integrations → Hubitat) is the hub link without these
    "HUBITAT_HOST": ("Hubitat", "Hub address", HOST, False, "Maker API only: the Hubitat hub's IP, e.g. 192.168.1.10. Not needed with the Skypane Helper"),
    "HUBITAT_APP_ID": ("Hubitat", "Maker API app number", r"\d{1,6}", False, "Maker API only: the number in the Maker API app's address"),
    "HUBITAT_TOKEN": ("Hubitat", "Maker API token", TOKEN, True, "Maker API only: from the Maker API app"),
    "PROTECT_HOST": ("UniFi Protect", "Protect console address", HOST, False, "The UNVR / console running Protect"),
    "PROTECT_API_KEY": ("UniFi Protect", "Protect API key", TOKEN, True, "Live camera list + camera video"),
    "UNIFI_HOST": ("Guest Wi-Fi", "UniFi console address", HOST, False, "UniFi Network 10 or newer (e.g. a UDM Pro)"),
    "UNIFI_API_KEY": ("Guest Wi-Fi", "UniFi Network API key", TOKEN, True, "From an admin with full Network management"),
    "MQTT_HOST": ("MQTT broker", "Separate broker address", HOST, False, "EMPTY = the built-in broker (recommended)"),
    "MQTT_PORT": ("MQTT broker", "Separate broker port", r"\d{1,5}", False, "1883"),
    "MQTT_USER": ("MQTT broker", "Separate broker user", NAME, False, "Empty = no login"),
    "MQTT_PASSWORD": ("MQTT broker", "Separate broker password", r"[^\s]{1,128}", True, ""),
    "MQTT_WS_PORT": ("MQTT broker", "Separate broker WebSocket port", r"\d{1,5}", False, "9001"),
    "MQTT_WS_URL": ("MQTT broker", "Separate broker WebSocket address", URL, False, "Optional, e.g. ws://192.168.1.5:9001"),
    "MQTT_WS_USER": ("MQTT broker", "Separate broker: pages' user", NAME, False, ""),
    "MQTT_WS_PASSWORD": ("MQTT broker", "Separate broker: pages' password", r"[^\s]{1,128}", True, ""),
    "GO2RTC_URL": ("Cameras", "Separate go2rtc address", URL, False, "EMPTY = the built-in go2rtc (recommended)"),
    "TILE_MEDIUM_MODELS": ("Cameras", "Cameras using the medium stream in grids", r"[A-Za-z0-9 |()\\._-]{0,100}", False,
                           "A pattern on Protect's camera type; default: older G3 cameras"),
    # (v3.0.4) optional: One Call 3.0 — fetched by the server once for the house (service/weather_sources.py)
    "OWM_API_KEY": ("Weather", "OpenWeatherMap key", r"[A-Za-z0-9]{16,64}", True, "Optional: 8 days, 48 hours and alerts in one call"),
    # (v3.0.5) the UPS / battery backup card from a NUT server (service/nut_ups.py: read-only questions only)
    "NUT_HOST": ("UPS", "NUT server address", HOST, False, "The machine running NUT, e.g. your Unraid server (Settings → UPS Settings)"),
    "NUT_PORT": ("UPS", "NUT server port", r"\d{1,5}", False, "3493"),
    "NUT_USER": ("UPS", "NUT user", NAME, False, "Empty = no login (most NUT servers let anyone read)"),
    # (v3.0.5) printable ASCII only, never " or \ (the NUT line can't carry them; a non-ASCII one crashed the child)
    "NUT_PASSWORD": ("UPS", "NUT password", r"[!#-\[\]-~]{1,128}", True, "Only if your NUT server needs a login"),
    "SONOS_PANEL_URL": ("Music", "Music page (Sonos Panel)", URL, False, "The page the Music button opens"),
    "TZ": ("General", "Time zone", r"[A-Za-z_]{1,32}(/[A-Za-z0-9_+-]{1,32}){0,2}", False,
           "UTC — the default; set yours, e.g. America/New_York"),
    "ALLOWED_HOSTS": ("General", "Extra host names for the pages", r"[A-Za-z0-9.,\s-]{0,300}", False,
                      "Names (not IPs) the pages may be opened with, comma separated"),
    "BRIDGE_ALLOW": ("General", "Extra device ids the bridge may switch", r"[0-9,\s]{0,300}", False, "Comma separated"),
}
SECRETS = {k for k, f in FIELDS.items() if f[3]}
# (v3.0.3) no longer on the Manager page (the owner: two optional fields nobody needs). The container variable of the
# same name is the way to set them from now on (run_all.hidden_value): a non-empty container value wins over one saved
# in settings.json before 3.0.3, "none" means empty (clears an old saved value without editing files), and with no
# container value the old saved value keeps working. HouseSettings.change refuses them (no Manager field to save from).
HIDDEN = {"ALLOWED_HOSTS", "BRIDGE_ALLOW"}
# the Dockerfile's ENV defaults: present in every container — never copied as if a template had set them
IMAGE_DEFAULTS = {"MQTT_PORT": "1883", "TZ": "UTC"}
# an address and the secret that is sent to it
HOST_SECRET = {"HUBITAT_HOST": "HUBITAT_TOKEN", "PROTECT_HOST": "PROTECT_API_KEY", "UNIFI_HOST": "UNIFI_API_KEY",
               "MQTT_HOST": "MQTT_PASSWORD", "NUT_HOST": "NUT_PASSWORD"}


class Invalid(ValueError):
    pass


def ip_ok(host):
    """(v3.0.2) False for digits and dots that aren't an IPv4 address: "192.168.1" (for 192.168.1.1) was read as a public
    address and timed out. Names and IPv6 are left to the pattern."""
    if not re.fullmatch(r"[0-9.]+", host):
        return True
    parts = host.split(".")
    return len(parts) == 4 and all(p and len(p) <= 3 and int(p) <= 255 for p in parts)


def check(key, value):
    """The value to store ("" = not set); Invalid when it isn't acceptable."""
    if key not in FIELDS:
        raise Invalid(f"unknown setting {key}")
    if value is None:
        return ""
    if not isinstance(value, str):
        raise Invalid(f"{FIELDS[key][1]}: text")
    value = value.strip()
    if FIELDS[key][2] == URL and value and not re.match(r"[A-Za-z][A-Za-z0-9+.-]*://", value) \
            and re.fullmatch(HOST + r"(/[^\s\"'<>\\]*)?", value):
        # (v3.0.2: "192.168.1.20" for the Music page was "not a valid value" — a bare address gets its http:// / ws://)
        value = ("ws://" if key == "MQTT_WS_URL" else "http://") + value
    if value and not re.fullmatch(FIELDS[key][2], value):
        raise Invalid(f"{FIELDS[key][1]}: not a valid web address (e.g. http://192.168.1.20:8080)" if FIELDS[key][2] == URL
                      else f"{FIELDS[key][1]}: not a valid value")
    host = value if FIELDS[key][2] == HOST else re.sub(r"^[A-Za-z]+://([^/:?#]*).*$", r"\1", value) if FIELDS[key][2] == URL else ""
    if host and not ip_ok(host.split(":")[0] if host.count(":") == 1 else host):
        raise Invalid(f"{FIELDS[key][1]}: not a valid IP address (four numbers 0–255, e.g. 192.168.1.10)")
    if key in ("MQTT_PORT", "MQTT_WS_PORT", "NUT_PORT") and value and not 1 <= int(value) <= 65535:
        raise Invalid(f"{FIELDS[key][1]}: 1-65535")
    if key == "TILE_MEDIUM_MODELS" and value:   # compiled by protect_sync.py: must be a valid pattern
        try:
            re.compile(value)
        except re.error:
            raise Invalid(f"{FIELDS[key][1]}: not a valid pattern (e.g. \\bG3\\b)") from None
    return value


class HouseSettings:
    def __init__(self, private_dir):
        self.path = pathlib.Path(private_dir) / FILE

    def exists(self):
        return self.path.is_file()

    def load(self):
        try:
            d = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(d, dict):
                return {k: v for k, v in d.items() if k in FIELDS and isinstance(v, str)}
        except (OSError, ValueError):
            pass
        return {}

    def _save(self, values):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(f".{self.path.name}.{secrets.token_hex(6)}.tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            json.dump({k: v for k, v in values.items() if v}, f, indent=1, sort_keys=True)
        os.replace(tmp, self.path)

    def change(self, changes):
        """{key: value or None (= clear)} → saved. Invalid on any bad key / value (nothing saved then).
        A new address for something with a stored secret needs that secret entered again in the same save — so a
        login on the Manager can't send the stored token / key to another machine."""
        if not isinstance(changes, dict) or not changes:
            raise Invalid("nothing to change")
        hidden = sorted(k for k in changes if k in HIDDEN)
        if hidden:
            raise Invalid(f"{', '.join(hidden)} can't be set on the Manager page any more — set the container variable of "
                          "the same name instead (\"none\" clears it) and re-create the container")
        clean = {k: check(k, v) for k, v in changes.items()}
        values = self.load()
        for host, secret in HOST_SECRET.items():
            # (a host emptied — the integration switched off — needs no secret again: there's nobody to send it to)
            if host in clean and clean[host] and clean[host] != values.get(host, "") and values.get(secret) and not clean.get(secret):
                raise Invalid(f"{FIELDS[host][1]} changed: enter the {FIELDS[secret][1]} again too")
        values.update(clean)
        self._save(values)

    def public(self, env=None):
        """For the Manager: every field with its value — secrets only as set / not set. The time zone also says which
        one is in effect when none is set (the image's TZ, UTC; `env` = this process's environment, run_all set it)."""
        v = self.load()
        out = [{"key": k, "group": g, "label": label, "help": hint, "secret": sec,
                **({"set": bool(v.get(k))} if sec else {"value": v.get(k, "")})}
               for k, (g, label, _pat, sec, hint) in FIELDS.items() if k not in HIDDEN]
        tz = ((os.environ if env is None else env).get("TZ") or "").strip()
        for f in out:
            if f["key"] == "TZ" and not f["value"]:
                if tz and tz != "UTC":   # (a time zone from outside the settings, e.g. a developer's own)
                    f["help"] = f"{tz} — the server's; set yours, e.g. America/New_York"
                elif not tz:
                    f["help"] = "The server machine's own — set yours, e.g. America/New_York"
                f["placeholder"] = ("UTC (default)" if tz == "UTC" else tz or "The machine's own") + " — in use now"
        return out

    def import_env(self, env):
        """Once (no file yet): the template's values become the settings. Returns (keys copied, keys left out because
        their value isn't valid — the Manager shows them empty)."""
        if self.exists():
            return [], []
        found, bad = {}, []
        for k in FIELDS:
            val = (env.get(k) or "").strip()
            if k in HIDDEN:   # (v3.0.3: read from the container variable at every start — never copied into the file)
                continue
            if val and IMAGE_DEFAULTS.get(k) == val:   # (v3.0.0: the image's own defaults aren't a template's values)
                continue
            if val:
                try:
                    found[k] = check(k, val)
                except Invalid:
                    bad.append(k)
        self._save(found)
        return sorted(found), bad


# ---------- (v3.0.4) house-wide units and date formats: Manager → Display settings (the admin) ----------
# Kept in DATA_DIR/house/display.json (no secrets: every panel gets it with its own data, GET /api/panel/<id> "house").
# The defaults are today's look: °F, mph, inHg, inches, the language's own date and time ("auto"), weeks from Sunday,
# whole degrees. A panel's settings units.temp / units.wind stay as its own "this panel only" override ("" or unset:
# it follows the house).
DISPLAY_FILE = "display.json"
DATE_FORMATS = ("auto", "m/d/yyyy 12", "m/d/yyyy 24", "mm/dd/yyyy 12", "mm/dd/yyyy 24", "d/m/yyyy 12", "d/m/yyyy 24",
                "dd/mm/yyyy 12", "dd/mm/yyyy 24", "yyyy/mm/dd 24")
DISPLAY = {   # key: (the choices, the default)
    "temp": (("F", "C"), "F"),
    "dist": (("mi", "km", "kn", "m"), "mi"),       # distance and speed: mi + mph, km + km/h, nmi + kn, m + m/s
    "pres": (("inHg", "hPa"), "inHg"),
    "prec": (("in", "mm"), "in"),                  # (snow depth: in / cm)
    "dt": (DATE_FORMATS, "auto"),
    "week": ((0, 1), 0),                           # the first day of the week: Sunday / Monday
    "dT": ((0, 1), 0),                             # decimals: temperature and wind speed
    "dP": ((0, 1, 2), 2),                          # … precipitation
    "dPr": ((0, 1, 2), 2),                         # … pressure
    # (v3.0.4) the unit the Hubitat hub reports in — readings are converted from it, set points go back in it; none
    # saved: the house's temperature unit (as the panels showed the hub's numbers before 3.0.4 — display_clean)
    "hubT": (("F", "C"), "F"),
}
WIND_OF = {"mi": "mph", "km": "km/h", "kn": "kn", "m": "m/s"}   # a panel's units.wind for the house's distance unit
DIST_OF = {v: k for k, v in WIND_OF.items()}


def display_check(changes):
    """{key: value} → the checked values; Invalid on an unknown key or a value that isn't one of its choices."""
    if not isinstance(changes, dict) or not changes:
        raise Invalid("nothing to change")
    out = {}
    for k, v in changes.items():
        if k not in DISPLAY:
            raise Invalid(f"unknown display setting {k}")
        if isinstance(v, bool) or v not in DISPLAY[k][0]:
            raise Invalid(f"{k}: one of " + ", ".join(map(str, DISPLAY[k][0])))
        out[k] = v
    return out


def display_clean(d):
    """Whatever is stored → every key with a valid value (a bad or missing one: its default)."""
    d = d if isinstance(d, dict) else {}
    out = {k: (d[k] if k in d and not isinstance(d[k], bool) and d[k] in opts else dflt) for k, (opts, dflt) in DISPLAY.items()}
    if d.get("hubT") not in DISPLAY["hubT"][0]:
        out["hubT"] = out["temp"]
    return out


def display_migrate(panel_units):
    """(once, no display.json yet) The panels' own units today → (the house's settings, {panel: {path: value}} the
    changes to the panels). panel_units = {panel: {"temp": "F"|"C"|None, "wind": …}} (None = never set: °F / mph).
    The house takes the unit most panels show (a tie: °F / mph); a panel showing the house's unit follows it ("");
    one showing another keeps it as its own — set even where it was never set — so no panel looks different."""
    def most(vals, first):
        return max(dict.fromkeys([first] + vals), key=lambda u: (vals.count(u), u == first)) if vals else first
    temps = {p: (u.get("temp") if u.get("temp") in ("F", "C") else "F") for p, u in panel_units.items()}
    winds = {p: (u.get("wind") if u.get("wind") in DIST_OF else "mph") for p, u in panel_units.items()}
    # ("" = already follows the house — a run that stopped half-way: not a vote, and it follows the result)
    t = most([v for p, v in temps.items() if panel_units[p].get("temp") != ""], "F")
    w = most([v for p, v in winds.items() if panel_units[p].get("wind") != ""], "mph")
    temps.update({p: t for p, u in panel_units.items() if u.get("temp") == ""})
    winds.update({p: w for p, u in panel_units.items() if u.get("wind") == ""})
    changes = {}
    for p, u in panel_units.items():
        c = {}
        for path, key, mine, house in (("units.temp", "temp", temps[p], t), ("units.wind", "wind", winds[p], w)):
            want = "" if mine == house else mine
            if (u.get(key) or "") != want:
                c[path] = want
        if c:
            changes[p] = c
    return display_clean({"temp": t, "dist": DIST_OF[w], "hubT": t}), changes


class Display:
    def __init__(self, house_dir):
        self.path = pathlib.Path(house_dir) / DISPLAY_FILE

    def exists(self):
        return self.path.is_file()

    def load(self):
        try:
            return display_clean(json.loads(self.path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            return display_clean({})

    def save(self, values):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(f".{self.path.name}.{secrets.token_hex(6)}.tmp")
        with open(tmp, "w", encoding="utf-8", newline="\n") as f:
            json.dump(display_clean(values), f, indent=1, sort_keys=True)
        os.replace(tmp, self.path)

    def change(self, changes):
        """{key: value} → saved; returns the new settings. Invalid: nothing saved."""
        values = {**self.load(), **display_check(changes)}
        self.save(values)
        return values
