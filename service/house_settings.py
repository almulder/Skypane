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
    "HUBITAT_HOST": ("Hubitat", "Hub address", HOST, False, "The Hubitat hub's IP, e.g. 192.168.1.10"),
    "HUBITAT_APP_ID": ("Hubitat", "Maker API app number", r"\d{1,6}", False, "The number in the Maker API app's address"),
    "HUBITAT_TOKEN": ("Hubitat", "Maker API token", TOKEN, True, "From the Maker API app"),
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
    "SONOS_PANEL_URL": ("Music", "Music page (Sonos Panel)", URL, False, "The page the Music button opens"),
    "TZ": ("General", "Time zone", r"[A-Za-z_]{1,32}(/[A-Za-z0-9_+-]{1,32}){0,2}", False,
           "UTC — the default; set yours, e.g. America/New_York"),
    "ALLOWED_HOSTS": ("General", "Extra host names for the pages", r"[A-Za-z0-9.,\s-]{0,300}", False,
                      "Names (not IPs) the pages may be opened with, comma separated"),
    "BRIDGE_ALLOW": ("General", "Extra device ids the bridge may switch", r"[0-9,\s]{0,300}", False, "Comma separated"),
}
SECRETS = {k for k, f in FIELDS.items() if f[3]}
# the Dockerfile's ENV defaults: present in every container — never copied as if a template had set them
IMAGE_DEFAULTS = {"MQTT_PORT": "1883", "TZ": "UTC"}
# an address and the secret that is sent to it
HOST_SECRET = {"HUBITAT_HOST": "HUBITAT_TOKEN", "PROTECT_HOST": "PROTECT_API_KEY", "UNIFI_HOST": "UNIFI_API_KEY",
               "MQTT_HOST": "MQTT_PASSWORD"}


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
    if key in ("MQTT_PORT", "MQTT_WS_PORT") and value and not 1 <= int(value) <= 65535:
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
               for k, (g, label, _pat, sec, hint) in FIELDS.items()]
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
            if val and IMAGE_DEFAULTS.get(k) == val:   # (v3.0.0: the image's own defaults aren't a template's values)
                continue
            if val:
                try:
                    found[k] = check(k, val)
                except Invalid:
                    bad.append(k)
        self._save(found)
        return sorted(found), bad
