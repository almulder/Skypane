"""The rules for switching a Hubitat device — one copy, used by the Hubitat bridge (scripts/hubitat_bridge.py: the last
word, it re-checks everything before anything reaches the hub) and by the dashboard service (service/server.py: the
Manager's PATCH /api/manage/devices/<id>/command, v2.9.1 — the same checks first, so a refusal can be explained).

Moved here unchanged from the bridge in v2.9.1 (service/test_device_rules.py compares them with the bridge's code of
before): which commands are ever forwarded, the value checks, and when a command needs the panel PIN (a one-time
ticket from service/panel_pin.py). Nothing here touches the network or the hub. Plain standard library.
"""
import hashlib
import hmac
import json
import math
import re

# commands the bridge will ever forward (and only for allowlisted ids).
# "unlock": only for a lock the owner allowed (house model "unlockable"), always with a panel PIN ticket
COMMANDS = {"on", "off", "setLevel", "setSpeed", "setPosition", "open", "close", "lock", "unlock", "refresh",
            "setHeatingSetpoint", "setCoolingSetpoint", "setThermostatMode", "setThermostatFanMode",
            "setColor", "setColorTemperature", "setHue", "setSaturation",
            # air purifier (Dyson HP02 driver): on, auto mode, speed 1–10
            "fanOn", "auto", "setFanSpeed",
            # a scene / virtual button (PushableButton): push(buttonNumber), the number an integer 1–20
            "push"}
# a media player (Hubitat MusicPlayer / AudioVolume / MediaTransport: Sonos …): each one only for a device whose own
# raw Maker API "commands" list names it (Bridge.media_cmds) — a light never gets "play"; never needs the panel PIN
MEDIA = {"play", "pause", "stop", "nextTrack", "previousTrack", "setVolume", "mute", "unmute"}
COMMANDS |= MEDIA
# commands only for devices whose own command list names them (the purifier) - never for a light / outlet / …
ONLY_LISTED = {"fanOn", "auto", "setFanSpeed", "unlock"}   # (unlock: only a lock whose list has it)

# value checks per command (the panel limits these too, but the broker is open on the LAN): setpoints stay in the
# dial's 50–90 °F, modes are the ones the panel offers, levels 0–100
RANGES = {"setHeatingSetpoint": (50, 90), "setCoolingSetpoint": (50, 90), "setLevel": (0, 100), "setPosition": (0, 100),
          "setColorTemperature": (1500, 9000), "setHue": (0, 100), "setSaturation": (0, 100), "push": (1, 20),
          "setVolume": (0, 100)}
INT_ONLY = {"push", "setVolume"}   # a whole number sent as a JSON number: never "3" / 2.5 / true
# commands that take no value at all (a value would become an extra path segment on the Maker API URL)
NO_VALUE = {"on", "off", "open", "close", "lock", "unlock", "refresh", "fanOn", "auto",
            "play", "pause", "stop", "nextTrack", "previousTrack", "mute", "unmute"}
# commands that never need the panel PIN, even for a "confirm" device (closing the water, closing the garage, off;
# a media player's play / volume …)
NO_PIN = {"off", "close", "lock", "refresh"} | MEDIA
CHOICES = {"setThermostatMode": {"heat", "cool", "off", "auto", "emergency heat"}, "setThermostatFanMode": {"on", "auto", "circulate"},
           "setSpeed": {"off", "low", "medium-low", "medium", "medium-high", "high", "auto", "on"},
           # the Dyson driver's speeds are exactly "1".."10" — anything else it silently turns into Auto mode
           "setFanSpeed": {str(i) for i in range(1, 11)}}
VALUE_RE = re.compile(r"[A-Za-z0-9 .\-]{1,32}")
COLOR_RE = re.compile(r"(\d{1,3}),(\d{1,3})(?:,(\d{1,3}))?", re.ASCII)

# (v2.9.1) the Manager's own topics are signed (HMAC-SHA256, keys derived from the house ticket key with these labels:
# panel_pin.purpose_key) — so even on a broker without Skypane's access lists only the server can ask and only the
# bridge can answer
MGR_CMD_LABEL = "manager/cmd v1"
MGR_RESULT_LABEL = "manager/cmd/result v1"


def canon(obj):
    """The message as signed: every field but "sig", keys sorted, no spaces."""
    return json.dumps({k: v for k, v in obj.items() if k != "sig"}, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def sign(key, obj):
    return hmac.new(key, canon(obj).encode("ascii"), hashlib.sha256).hexdigest()


def signed_ok(key, obj):
    """True only for a message signed with this key (never without a key or a "sig")."""
    return bool(key) and isinstance(obj, dict) and isinstance(obj.get("sig"), str) and hmac.compare_digest(obj["sig"], sign(key, obj))


# (v2.9.1) what the Manager may send at all. v2.9.1: on / off / setLevel / open / close / lock / setPosition;
# v2.9.3 : everything the panels send but unlock — the thermostat, colour, fan speeds, the air purifier,
# scene buttons, media players. Never "unlock" (nor "refresh", which the panels send on their own), whatever the
# device or the login: listed here one by one, never derived from COMMANDS.
MANAGER_COMMANDS = {"on", "off", "setLevel", "open", "close", "lock", "setPosition",
                    "setHeatingSetpoint", "setCoolingSetpoint", "setThermostatMode", "setThermostatFanMode",
                    "setColor", "setHue", "setSaturation", "setColorTemperature", "setSpeed",
                    "fanOn", "auto", "setFanSpeed", "push",
                    "play", "pause", "stop", "nextTrack", "previousTrack", "setVolume", "mute", "unmute"}
assert "unlock" not in MANAGER_COMMANDS and "refresh" not in MANAGER_COMMANDS
# (v2.9.3) the house, not a device (device id 0 on the signed Manager topic): a Hubitat mode by its name, and Hubitat
# Safety Monitor — both ALWAYS with a one-time panel PIN ticket for (0, the command, the value), as on a panel
HOUSE_COMMANDS = {"setMode", "setHsm"}
HSM_ACTIONS = ("armAway", "armHome", "armNight", "disarm", "cancelAlerts")   # (the bridge's own list: Maker API hsm/<action>)
MODE_NAME_RE = re.compile(r"[^\x00-\x1f\x7f]{1,40}")


def value_ok(command, value):
    if command in INT_ONLY and (not isinstance(value, int) or isinstance(value, bool)):
        return False
    if command in RANGES:
        try:
            v = float(value)
        except (TypeError, ValueError, OverflowError):   # (v2.9.3 security review: a huge whole number from JSON — refused, never a 500)
            return False
        lo, hi = RANGES[command]
        return math.isfinite(v) and lo <= v <= hi
    if command in CHOICES:
        return str(value) in CHOICES[command]
    return True


def command_arg(command, value):
    """The value as it goes to the Maker API, or None when it's refused ("bad value"). A command without a value: its
    `value` is None and so is the answer's second item — (ok, arg)."""
    if command == "setColor":
        # the panel sends "hue,saturation[,level]" (each 0–100); Hubitat wants a map — built here, never passed through
        cm = COLOR_RE.fullmatch(str(value or ""))
        if not cm or any(int(x) > 100 for x in cm.groups() if x):
            return False, None
        return True, json.dumps({"hue": int(cm[1]), "saturation": int(cm[2]), **({"level": int(cm[3])} if cm[3] else {})}, separators=(",", ":"))
    if (command in NO_VALUE and value is not None) or (value is not None and (not VALUE_RE.fullmatch(str(value))
            or str(value).strip(". ") == "")) or not value_ok(command, value):
        return False, None
    return True, value


def needs_pin(cid, command, *, garage_relays=(), garage_doors=(), risky=(), model=None, door=None):
    """A valve / garage controller (by what it is — also when allowed by BRIDGE_ALLOW or an old allow file) or a
    device in the model's confirm list: every command except off / close / lock / refresh needs a ticket.
    Garage openers are stricter (many relays toggle the door on ANY command): a relay needs one for everything but
    refresh; a door controller may "close" without one only while the door is open / opening (`door`: its "door"
    attribute now). Guest modes: on AND off. Unlock: always."""
    if command == "refresh":
        return False
    if command == "unlock":   # always, whatever else is set
        return True
    if cid in garage_relays:
        return True
    if model and (cid in model.get("guestPin", ()) or cid in model.get("guestModes", ())):   # guest modes: on AND off
        return True
    if cid in garage_doors and command == "close":
        return door not in ("open", "opening")
    if command in NO_PIN:
        return False
    return cid in risky or cid in garage_doors or (bool(model) and cid in model.get("confirm", ()))


# ---------- (v2.9.1) the Manager: what a device in the house model can be sent, from what the model says it is ----------
def model_device(model, cid):
    """(kind, entry) for a device the panels show — ("light" | "fan" | "switch" | "outlet" | "shade" | "valve" | "garage",
    its room entry) from the rooms, ("lock", entry) from the locks, ("guest", entry) for a guest mode — or (None, None)."""
    for r in (model or {}).get("rooms") or []:
        for d in r.get("devices") or [] if isinstance(r, dict) else []:
            if isinstance(d, dict) and d.get("id") == cid:
                return d.get("kind"), d
    for lk in (model or {}).get("locks") or []:
        if isinstance(lk, dict) and lk.get("id") == cid:
            return "lock", lk
    for t in (model or {}).get("things") or []:
        if isinstance(t, dict) and t.get("id") == cid and t.get("kind") == "guest":
            return "guest", t
    return None, None


def catalog_entry(model, cid):
    """The house model's device catalogue entry (its "cmds": the panel-relevant commands the device itself lists, its
    "modes" / "fanModes" / "speeds", "buttons"), or {}."""
    for d in (model or {}).get("devices") or []:
        if isinstance(d, dict) and d.get("id") == cid:
            return d
    return {}


THERMOSTAT_MODES = ("heat", "cool", "auto", "off")   # (what a panel offers when the thermostat doesn't list its own)
FAN_MODES = ("auto", "on", "circulate")
FAN_SPEEDS = ("low", "medium", "high")


def manager_values(model, cid, command):
    """(v2.9.3) For a command with a choice of words: the ones the Manager offers for this device — the device's own
    list where it has one (∩ CHOICES), else what a panel offers. None for other commands."""
    e = catalog_entry(model, cid)
    own = {"setThermostatMode": e.get("modes"), "setThermostatFanMode": e.get("fanModes"), "setSpeed": e.get("speeds")}.get(command)
    base = {"setThermostatMode": THERMOSTAT_MODES, "setThermostatFanMode": FAN_MODES, "setSpeed": FAN_SPEEDS,
            "setFanSpeed": tuple(str(i) for i in range(1, 11))}.get(command)
    if base is None:
        return None
    words = [w for w in own if isinstance(w, str)] if isinstance(own, list) and own else list(base)
    return [w for w in words if w in CHOICES.get(command, ())]


def manager_value_ok(model, cid, command, value):
    """(v2.9.3) The Manager's own value check on top of command_arg (the bridge's): a word from manager_values, a
    scene button that exists, a colour as "hue,saturation" (each 0–100), whole-degree-or-half setpoints."""
    words = manager_values(model, cid, command)
    if words is not None:
        return isinstance(value, str) and value in words
    if command == "push":
        n = catalog_entry(model, cid).get("buttons")
        return isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= (n if isinstance(n, int) else 1)
    if command in ("setHeatingSetpoint", "setCoolingSetpoint"):
        lo, hi = RANGES[command]   # (the range first: a huge number never reaches int() — no OverflowError)
        return isinstance(value, (int, float)) and not isinstance(value, bool) and lo <= value <= hi and math.isfinite(value) \
            and (value * 2) == int(value * 2)
    if command in ("setColorTemperature", "setHue", "setSaturation", "setVolume", "setLevel", "setPosition"):
        return isinstance(value, int) and not isinstance(value, bool)
    if command == "setColor":
        return isinstance(value, str) and COLOR_RE.fullmatch(value) is not None and value.count(",") == 1
    return value is None


def manager_commands(model, cid):
    """The commands the Manager offers for this device (a subset of MANAGER_COMMANDS), by what the house model says it
    is: a light on / off (+ setLevel when it dims, setColorTemperature when it is tunable white, its colour command(s)
    when it has colour), a fan on / off + setSpeed, a switch / outlet / guest mode on / off, a shade open / close /
    setPosition, a valve or garage opener open / close (a real valve / door controller) or on / off (a relay), a lock
    "lock" only; (v2.9.3) the thermostat (setpoints, its mode, its fan mode), the air purifier, and any device whose
    own command list names media commands or that has scene buttons (push). Anything else: none."""
    kind, d = model_device(model, cid)
    t = (model or {}).get("thermostat")
    if isinstance(t, dict) and t.get("id") == cid:
        e = catalog_entry(model, cid)
        out = {"setHeatingSetpoint", "setCoolingSetpoint", "setThermostatMode"}
        return out | ({"setThermostatFanMode"} if manager_values(model, cid, "setThermostatFanMode") and
                      ("setThermostatFanMode" in (e.get("cmds") or []) or not e.get("cmds")) else set())
    for th in (model or {}).get("things") or []:
        if isinstance(th, dict) and th.get("id") == cid and th.get("kind") == "purifier":
            return {"fanOn", "off", "auto", "setFanSpeed"}
    if kind == "light":
        color = ({"setColor"} if d.get("colorCmd") == "setColor" else {"setHue", "setSaturation"}) if d.get("rgb") else set()
        return {"on", "off"} | ({"setLevel"} if d.get("dim") else set()) | ({"setColorTemperature"} if d.get("white") else set()) | color
    if kind == "fan":
        return {"on", "off", "setSpeed"}
    if kind in ("switch", "outlet", "guest"):
        return {"on", "off"}
    if kind == "shade":
        return {"open", "close", "setPosition"}
    if kind in ("valve", "garage"):
        return {"open", "close"} if d.get("cmd") == "openclose" else {"on", "off"}
    if kind == "lock":
        return {"lock"}
    if kind is None:   # (a device on a layout card only: a media player, a scene button — by its own command list)
        e = catalog_entry(model, cid)
        cmds = set(e.get("cmds") or [])
        return (cmds & MEDIA) | ({"push"} if "push" in cmds and isinstance(e.get("buttons"), int) else set())
    return set()


def garage_sets(model):
    """(relays, doors) from the house model the way the bridge sorts them by capability: a garage opener with open /
    close (a door controller) is a door, else a relay that pulses."""
    relays, doors = set(), set()
    for r in (model or {}).get("rooms") or []:
        for d in r.get("devices") or [] if isinstance(r, dict) else []:
            if isinstance(d, dict) and d.get("kind") == "garage" and isinstance(d.get("id"), int):
                (doors if d.get("cmd") == "openclose" else relays).add(d["id"])
    return relays, doors
