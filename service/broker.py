"""The built-in MQTT broker (stage 3): Mosquitto inside the Skypane container, so nobody sets up a broker by hand.

Used by service/run_all.py when MQTT_HOST is empty (or "builtin"). Three listeners, each with its own login and its
own access list (what that login may read / write — anything else is refused):
  127.0.0.1:1884   login "internal" — the Hubitat bridge and the dashboard server (everything; inside the container
                   only, and with a login so other processes in the container — go2rtc — can't use it); also login
                   "observer" — the guest Wi-Fi child: only reads the device states (which guest modes are on)
  0.0.0.0:1883     login "devices" — FreeKiosk, the panel agent (LEDs), Hubitat rules showing a camera: their own
                   topics, Home Assistant discovery, reading the house state
  0.0.0.0:9001     WebSocket, login "panel" — the panels' pages. This login is handed to every page (window.PANEL_CONFIG)
                   — it keeps other web pages off the broker, not LAN users — so it may only do what a page does:
                   send hubitat/cmd (the bridge checks every command), FreeKiosk volume / speech, the LED strip; read
                   the house state. It can't overwrite the retained house model / state, fake results or read $SYS.
Passwords are generated once (DATA_DIR/private/mqtt-logins.json, mode 0600) and kept; a login added by a newer version
is added without changing the others. Mosquitto gets hashed password files (mosquitto_passwd -U, so a password never
appears on a command line). The devices login is shown on the main panel (Settings → Panel), only after the dashboard
service checked the panel PIN. Retained messages are kept in DATA_DIR/mosquitto/ (survive restarts).
"""
import json
import os
import pathlib
import secrets
import subprocess


def _port(var, default):
    """(v3.0.2) A listener's port from the environment (testers running several copies side by side), else the default.
    Only for test runs: the pages expect the WebSocket on 9001 and the devices are told 1883."""
    v = (os.environ.get(var) or "").strip()
    return int(v) if v.isascii() and v.isdecimal() and 1 <= int(v) <= 65535 else default


INTERNAL_PORT = _port("SKYPANE_MQTT_INTERNAL_PORT", 1884)
LAN_PORT = _port("SKYPANE_MQTT_LAN_PORT", 1883)
WS_PORT = _port("SKYPANE_MQTT_WS_PORT", 9001)
USERS = {"internal": "internal", "devices": "devices", "ws": "panel", "observer": "observer"}
# which logins each listener takes (its password file / access list): the internal port also has the read-only
# "observer" (the guest Wi-Fi child: it only watches which guest modes are on)
LISTENERS = {"internal": ("internal", "observer"), "devices": ("devices",), "ws": ("ws",)}

# access lists (Mosquitto acl_file syntax; "+" = any panel name, for several panels later)
ACL = {
    # (the dashboard service and the Hubitat bridge — also the only login under manager/: the Manager's device commands
    # with their PIN tickets and the bridge's answers, v2.9.1; no other login below names manager/ at all)
    "internal": ["topic readwrite #"],
    "observer": ["topic read hubitat/state", "topic read hubitat/event"],
    "devices": [
        "topic readwrite freekiosk/#", "topic readwrite panelagent/#", "topic readwrite homeassistant/#",
        "topic readwrite panel/#",                       # e.g. a Hubitat rule: panel/skypane/show {"camera": …}
        "topic read hubitat/state", "topic read hubitat/event", "topic read hubitat/bridge/status", "topic read hubitat/model",
    ],
    "ws": [
        "topic write hubitat/cmd", "topic write hubitat/alerts/ack",   # (any dismissed alert, or "all": the bridge checks it)
        "topic write hubitat/mode/set",   # (a hub mode, with a one-time PIN ticket: the bridge checks it; reads below)
        "topic write hubitat/hsm/set",    # (arm / disarm Hubitat Safety Monitor, always with a one-time PIN ticket)
        "topic write freekiosk/+/set/volume", "topic write freekiosk/+/set/tts", "topic write freekiosk/+/set/wake", "topic write panelagent/+/led/set",
        "topic read hubitat/#", "topic read freekiosk/+/state", "topic read panelagent/#", "topic read panel/+/show",
        "topic read dashboard/panel/+/changed",
        # (the service's other announcements: cards added / changed, a performance test, the shared lists)
        "topic read dashboard/cards/changed", "topic read dashboard/panel/+/perftest", "topic read dashboard/panel/+/bench", "topic read dashboard/lists/changed",
        "topic read dashboard/bins/changed", "topic read dashboard/timers/changed",   # (v3.0.4: a bin taken out, a timer pressed)
        "topic read dashboard/calendars/changed",   # (the house's calendars changed / new events fetched: data.js loads them again)
    ],
}


def _write_private(path, text):
    """0600 from the start (no window where it's readable), atomic."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    try:
        tmp.unlink()
    except OSError:
        pass
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    os.replace(tmp, path)


def logins(private_dir, note=lambda msg: None):
    """{"internal" | "devices" | "ws": {"user", "pass"}} — each made once, then always the same. A missing / damaged
    one is made new (and noted when it's the devices login: devices that used it need the new one)."""
    p = pathlib.Path(private_dir) / "mqtt-logins.json"
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    existed = p.exists()
    if not isinstance(data, dict):
        data = {}
    made = []
    for k, u in USERS.items():
        v = data.get(k)
        if not (isinstance(v, dict) and v.get("user") == u and isinstance(v.get("pass"), str) and len(v["pass"]) >= 20):
            data[k] = {"user": u, "pass": secrets.token_urlsafe(24)}
            made.append(k)
    if made:
        _write_private(p, json.dumps(data, indent=1))
        if existed and "devices" in made:
            note("MQTT: the devices login was missing or damaged and has been made new — enter the new one (Settings → "
                 "Panel → MQTT for devices) in FreeKiosk and the panel agent")
    return data


def _hashed(path, users, passwd_bin):
    """A Mosquitto password file ({user: password}), hashed by mosquitto_passwd -U (plain text only in a 0600 file)."""
    _write_private(path, "".join(f"{u}:{p}\n" for u, p in users.items()))
    subprocess.run([passwd_bin, "-U", str(path)], check=True, stdin=subprocess.DEVNULL,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20)
    os.chmod(path, 0o600)


def _listener(head, private_dir, key):
    return [*head, "allow_anonymous false", f"password_file {private_dir / f'mqtt-{key}.passwd'}",
            f"acl_file {private_dir / f'mqtt-{key}.acl'}", ""]


def config_text(private_dir, data_dir):
    private_dir, data_dir = pathlib.Path(private_dir), pathlib.Path(data_dir)
    return "\n".join([
        "# written by service/broker.py at every start - edit the code, not this file",
        "per_listener_settings true",
        "persistence true",
        f"persistence_location {data_dir / 'mosquitto'}/",
        "log_dest stdout",
        "log_type error",
        "log_type warning",
        "connection_messages false",
        # (no listener options up here: Mosquitto would open an extra, login-free default listener on 1883 for them)
        "",
        "# the bridge and the dashboard server, inside the container",
        *_listener([f"listener {INTERNAL_PORT} 127.0.0.1", "max_connections 20"], private_dir, "internal"),
        "# FreeKiosk, the panel agent, other devices on the LAN",
        *_listener([f"listener {LAN_PORT}", "socket_domain ipv4", "max_connections 100"], private_dir, "devices"),
        "# the panels' pages (browser WebSocket)",
        *_listener([f"listener {WS_PORT}", "protocol websockets", "socket_domain ipv4", "max_connections 100"], private_dir, "ws"),
    ])


def prepare(private_dir, data_dir, passwd_bin="mosquitto_passwd", note=lambda msg: None):
    """Write the password files, access lists and the config; returns (config path, logins)."""
    private_dir, data_dir = pathlib.Path(private_dir), pathlib.Path(data_dir)
    (data_dir / "mosquitto").mkdir(parents=True, exist_ok=True)
    lg = logins(private_dir, note)
    for listener, keys in LISTENERS.items():
        _hashed(private_dir / f"mqtt-{listener}.passwd", {USERS[k]: lg[k]["pass"] for k in keys}, passwd_bin)
        _write_private(private_dir / f"mqtt-{listener}.acl",
                       "\n".join(f"user {USERS[k]}\n" + "\n".join(ACL[k]) + "\n" for k in keys))
    conf = private_dir / "mosquitto.conf"
    _write_private(conf, config_text(private_dir, data_dir))
    return conf, lg
