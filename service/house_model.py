"""The house model: what the panels show, built from Hubitat's own device list (Maker API `devices/all`).

Rooms with their lights / fans / switches / outlets / shades, people (presence), cameras, alert sensors, door locks,
windows, doors and gates, the thermostat, the outside temperature sensor and every other useful device ("things":
appliances, speakers, purifier, garage door, motion, …) — all found by capability, type and name, and placed in the
room Hubitat puts them in. Add, rename or move a device in Hubitat and the panels follow (stage 3, docs/roadmap.md).

Used by the Hubitat bridge (scripts/hubitat_bridge.py: rebuilt on every resync, written to DATA_DIR/house/hubitat-data.js
when its *shape* changes) and by scripts/build_panel_data.py (from a saved dump, for the laptop).

    model = build(devices, overrides)  # dict, also has "version" (changes only when devices / rooms / names change)
                                       # overrides = the owner's choices per device (Settings, main panel):
                                       # {"<id>": {"as": "light" | "valve" | "window" | … | "hidden", "room": "…", "confirm": bool}}
    js = to_js(model)                  # the hubitat-data.js file the page loads (window.HUBITAT = …)
    ids = switchable(model, never)     # device ids the panel may command (the bridge's allowlist)
"""
import hashlib
import json
import re

SKIP_TYPES = re.compile(r"Virtual Switch|OwnTracks|Dome Siren|LeakSmart|Samsung|SAS -|UnifiConnect|UniFi Protect (Chime|Viewer|Controller)|"
                        r"Notification|Listener|File Manager|Mobile App|Twilio|Gmail|Weather|Replica", re.I)
NO_ROOM = ("Hub", "Home")   # (Hubitat rooms that are no room on a panel)
# a room's picture by its name (the room templates, then common names; case doesn't matter) — any other room: "home"
ROOM_ICONS = {"kitchen": "kitchen", "laundry room": "drop", "dining room": "utensils", "primary bedroom": "bed", "primary bathroom": "bath",
              "bedroom": "bed", "bathroom": "bath", "living room": "sofa", "family room": "sofa", "office": "desk", "garage": "car",
              "hallway": "door", "entry": "door", "stairs": "stairs", "basement": "stairs", "driveway": "car", "patio": "sun",
              "back yard": "sun", "front yard": "sun", "porch": "sun", "garden": "tree"}
def room_icon(name):
    return ROOM_ICONS.get(str(name or "").strip().lower(), "home")


# a door / gate counts as "outside" (the Home screen's "doors open" card) by its room or its name
OUTSIDE_ROOM = re.compile(r"porch|yard|garage|back door|front door|driveway|patio|deck|shed|garden|outside|outdoor", re.I)
OUTSIDE_NAME = re.compile(r"\bgate\b|shed|front door|back door|porch|garage", re.I)
# outlets / switches that power something that must keep running: never switched from the panel unless allowed
# (+ relays named like a valve / garage / gate opener: not switchable until the owner sets their role in Settings)
KEEP_ON = re.compile(r"rainbird|sprinkler|irrigation|freezer|fridge|server|router|modem|aquarium|sump|valve|water main|shut-?off|garage door|garage opener|gate opener", re.I)
THING_ATTRS = {
    "switch", "level", "battery", "temperature", "humidity", "illuminance", "motion", "contact", "water", "smoke",
    "naturalGas", "carbonMonoxide", "acceleration", "presence", "door", "moving", "power", "energy",
    "machineState", "operatingState", "running", "progressPercent", "progress", "timeRemaining", "remainingTime",
    "completionTime", "cycle", "washerJobState", "dryerJobState", "jobState", "ovenTemperature", "ovenSetpoint",
    "ovenMode", "activeBurners", "cookingMode", "hoodFanSpeed", "coolerTemperature", "freezerTemperature",
    "doorFreezerOpen", "fanSpeed", "fanState", "fanMode", "oscillation", "airQualityIndex", "pm25",
    "sensirionVOCindex", "voc", "co2", "alarm", "status", "mute", "volume", "trackDescription", "nightlight",
    "outlet1", "outlet2", "healthStatus",
}
THING_SKIP = re.compile(r"UniFi Protect|UnifiProtect|Unifi(Connect|Protect)|Notification|Listener|Twilio|Gmail|Email|"
                        r"OwnTracks|Mobile App|Hub Information|Weather|File Manager|hueBridge|Replica|Samsung Appliance Listener|"
                        r"Scene Switch|Sound Remote|Keypad|LeakSmart", re.I)
# values that change all the time; left out of the version, so only a change of devices / names / rooms reloads panels
VOLATILE = {"on", "level", "hue", "sat", "ct", "mode", "speed", "lock", "battery", "open", "home", "state", "temp", "attrs",
            "heat", "cool", "humidity", "rgb"}
# devices that also claim on/off but must never be a plain switch on the panel (valves, garage door relays, locks)
# — unless the owner says what they are (overrides: "valve", "garage", or e.g. "light" for a relay)
NOT_A_SWITCH = {"Valve", "GarageDoorControl", "DoorControl", "Lock"}
ROOM_KINDS = ("light", "fan", "switch", "outlet", "shade", "valve", "garage")   # their order in a room
# what a light can do, as the owner sets it (Manager → Devices → Light type; e.g. an Inovelli dimmer
# set up as on / off still reports SwitchLevel). Only what Hubitat says the device can do can be chosen.
LIGHT_TYPES = ("onoff", "dim", "ct", "rgb", "rgbct")
COLOR_CMDS = ("hueSat", "setColor")   # how a colour is sent: setHue + setSaturation (default) or one setColor
# what a fan looks like on the room page (Settings → Rooms → a fan's "Fan type"); default: ceiling for a fan with
# speeds (FanControl), pedestal for a plug / relay the owner made a fan
FAN_TYPES = ("ceiling", "box", "pedestal", "desk", "tower")
# devices that open something (water, the garage): opening always needs the panel PIN — by what the device IS, so no
# role chosen in Settings (which anyone on the LAN could change) can take that away
RISKY_CAPS = {"Valve", "GarageDoorControl", "DoorControl"}
PROTECT = re.compile(r"UniFi Protect|UnifiProtect", re.I)
THING_ROLES = {"contact": "contact", "climate": "climate", "motion": "motion"}
# the house's guest modes: a guest-mode switch such as "Guest Mode, <who> - XX"; the panel
# lists them, switches them only with the panel PIN (on AND off), and the guest Wi-Fi password follows them
GUEST_MODE = re.compile(r"^\s*Guest\s+Mode\b[\s,:-]*", re.I)
GUEST_SUFFIX = re.compile(r"\s+-\s+[A-Z]{1,3}\s*$")
ROLE_NAMES = {"light": "Light", "fan": "Fan", "switch": "Switch", "outlet": "Outlet", "shade": "Shade",
              "valve": "Valve (water)", "garage": "Garage door opener", "lock": "Door lock", "window": "Window",
              "door-in": "Door (inside)", "door-out": "Door (outside)", "thermostat": "Thermostat",
              "outside-temp": "Outside temperature", "climate": "Temperature / humidity", "contact": "Contact sensor",
              "motion": "Motion sensor", "temp-alert": "Temperature alert (freezer, fridge…)", "hidden": "Hidden"}


def options(d):
    """What a device can be shown as, from what Hubitat says it can do (the owner picks one in Settings)."""
    c, o = caps(d), []
    if PROTECT.search(d.get("type") or "") or is_guest_mode(d):  # cameras (from Protect), guest modes: only hidden
        return ["hidden"]
    # a plain on/off device can be anything that switches; a valve / garage controller / lock that also claims on/off
    # stays what it is (it must never become a "light" that opens the water without the PIN)
    if "Switch" in c and not (NOT_A_SWITCH & c):
        o += ["light", "fan", "outlet", "switch", "valve", "garage"]
    if "WindowShade" in c:
        o.append("shade")
    if "Valve" in c and "valve" not in o:
        o.append("valve")
    if ("GarageDoorControl" in c or "DoorControl" in c) and "garage" not in o:
        o.append("garage")
    if "Lock" in c:
        o.append("lock")
    if "ContactSensor" in c:
        o += ["window", "door-in", "door-out", "contact"]
    if "Thermostat" in c:
        o.append("thermostat")
    if "TemperatureMeasurement" in c or "RelativeHumidityMeasurement" in c:
        o += ["outside-temp", "climate"]
    if "TemperatureMeasurement" in c:
        o.append("temp-alert")
    if "MotionSensor" in c:
        o.append("motion")
    return o + ["hidden"]


def caps(d):
    out = set()
    for c in d.get("capabilities") or []:
        if isinstance(c, str) and c:
            out.add(c)
        elif isinstance(c, dict) and c:
            out.add(str(next(iter(c))))
    return out


def is_speaker(d):
    """(v3.0.4) SpeechSynthesis, and "speak" in the device's own command list (strings or {"command"} maps)."""
    cl = d.get("commands") if isinstance(d.get("commands"), list) else []
    return "SpeechSynthesis" in caps(d) and "speak" in {c.get("command") if isinstance(c, dict) else c for c in cl}


def attr(d, k):
    return (d.get("attributes") or {}).get(k)


# what a device can do, for the layout builder's press-and-hold wheel (Manager): its capabilities, the commands the
# bridge would send it, and the modes / speeds its driver lists — only known names, never the driver's free text
WHEEL_CAPS = {"Switch", "SwitchLevel", "ColorControl", "ColorTemperature", "WindowShade", "WindowBlind", "Thermostat",
              "ThermostatMode", "ThermostatFanMode", "ThermostatHeatingSetpoint", "ThermostatCoolingSetpoint", "FanControl",
              "Lock", "Valve", "GarageDoorControl", "DoorControl", "Refresh", "AudioVolume", "MusicPlayer", "PushableButton"}
WHEEL_CMDS = {"on", "off", "setLevel", "setSpeed", "setPosition", "open", "close", "lock", "refresh", "setHeatingSetpoint",
              "setCoolingSetpoint", "setThermostatMode", "setThermostatFanMode", "setColor", "setColorTemperature", "setHue", "setSaturation", "push",
              "play", "pause", "stop", "nextTrack", "previousTrack", "setVolume", "mute", "unmute"}
MODE_WORDS = {"off", "heat", "cool", "auto", "emergency heat", "on", "circulate", "low", "medium-low", "medium", "medium-high", "high"}


ATTR_NAME = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,39}")

# (v3.0.5, moved here from scripts/hubitat_bridge.py's KEEP — the bridge uses this one) the attributes the panel cares
# about: the bridge passes on only these; attr_list keeps them before its 60-attribute cap
PANEL_ATTRS = frozenset({
    "switch", "level", "speed", "position", "windowShade", "contact", "motion", "temperature", "humidity",
    "illuminance", "lock", "presence", "battery", "water", "smoke", "carbonMonoxide", "power", "powerSource", "valve",
    "door", "thermostatMode", "thermostatOperatingState", "thermostatFanMode", "heatingSetpoint",
    "coolingSetpoint", "thermostatSetpoint", "status", "volume", "mute", "trackDescription",
    # appliances, speakers, purifier, air quality, garage door, sensors ("things" below)
    "naturalGas", "acceleration", "moving", "energy", "machineState", "operatingState", "running", "progressPercent",
    "progress", "timeRemaining", "remainingTime", "completionTime", "cycle", "washerJobState", "dryerJobState",
    "jobState", "ovenTemperature", "ovenSetpoint", "ovenMode", "activeBurners", "cookingMode", "hoodFanSpeed",
    "coolerTemperature", "freezerTemperature", "doorFreezerOpen", "fanSpeed", "fanState", "fanMode", "oscillation",
    "airQualityIndex", "pm25", "sensirionVOCindex", "voc", "co2", "alarm", "nightlight", "outlet1", "outlet2",
    "healthStatus",
    # light color: hue/saturation (0–100), color temperature (K), colorMode CT/RGB
    "hue", "saturation", "colorTemperature", "colorMode", "colorName",
    # a media player card (Sonos …): trackData is the driver's JSON text — passed on as text (capped), never parsed
    "trackData",
})


def attr_list(d):
    """Every attribute Hubitat sends for the device, with its value as it was (short plain text) — the layout
    builder lists them for a picture card's values; the panel shows the live ones. (v3.0.5) At most 60: the panel's
    own (PANEL_ATTRS — power, battery…) first, so a device with many never loses them."""
    out = {}
    a = d.get("attributes") or {}
    for k, v in sorted(a.items(), key=lambda kv: kv[0] not in PANEL_ATTRS) if isinstance(a, dict) else ():
        if len(out) >= 60 or not isinstance(k, str) or not ATTR_NAME.fullmatch(k) or isinstance(v, (dict, list)):
            continue
        out[k] = re.sub(r"[\x00-\x1f\x7f<>]", " ", "" if v is None else str(v)).strip()[:40]
    return out


def can_do(d):
    def listed(k):
        v = attr(d, k)
        if isinstance(v, str):
            try:
                v = json.loads(v)
            except ValueError:
                v = [x.strip(" []\"'") for x in v.split(",")]
        return [x for x in v if isinstance(x, str) and x in MODE_WORDS][:12] if isinstance(v, list) else []
    cmds = {c.get("command") if isinstance(c, dict) else c for c in d.get("commands") or []}
    out = {"caps": sorted(caps(d) & WHEEL_CAPS), "cmds": sorted(c for c in cmds if c in WHEEL_CMDS)}
    if is_speaker(d):   # (v3.0.4) a speaker a timer may speak on ("Timer up": the server asks, the bridge checks it again)
        out["speak"] = True
    try:   # a button device: how many buttons (1..20)
        n = int(float(attr(d, "numberOfButtons")))
        if 1 <= n <= 20 and "PushableButton" in out["caps"]:
            out["buttons"] = n
    except (TypeError, ValueError):
        pass
    for key, a in (("modes", "supportedThermostatModes"), ("fanModes", "supportedThermostatFanModes"), ("speeds", "supportedFanSpeeds")):
        if listed(a):
            out[key] = listed(a)
    return out


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def retired(d):
    return d["label"].startswith(("Z -", "Z-", "#"))


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def short(label, room):
    """'Living Room Light Stand' -> 'Light Stand' (keep the full name if nothing is left)."""
    s = re.sub(rf"^{re.escape(room)}\s*[-–]?\s*", "", label, flags=re.I).strip() if room else label
    return s or label


def kind(d):
    """What a room device is: light / fan / outlet / switch / shade, or None (not a room device)."""
    if is_guest_mode(d):   # a guest mode is never a room device, whatever its room or role (the owner)
        return None
    if d.get("_as"):  # the owner said what it is
        return d["_as"] if d["_as"] in ROOM_KINDS else None
    t, c, name = (d.get("type") or ""), caps(d), d["label"].lower()
    if "UniFi Protect" in t or SKIP_TYPES.search(t) or retired(d):
        return None
    if "(LED Color)" in d["label"]:   # the LED indicator bar of an Inovelli switch, not a room light
        return None
    if NOT_A_SWITCH & c:
        return None
    if "WindowShade" in c:
        return "shade"
    if "fan" in t.lower() and "Switch" in c:
        return "fan"
    if re.search(r"outlet|plug", t + " " + name, re.I) and "Switch" in c:
        return "outlet"
    if "Switch" not in c:
        return None
    if {"ColorControl", "ColorTemperature", "SwitchLevel"} & c or re.search(r"bulb|light|lamp|hue|wled|magichome|dimmer", t + " " + name, re.I):
        return "light"
    return "switch"


def room_device(d, k, room):
    # a retired-looking name ("Z - …") the owner brought back: shown without that prefix
    label = re.sub(r"^(?:Z ?- ?|#\s*)", "", d["label"]).strip() or d["label"]
    dev = {"id": int(d["id"]), "name": short(label, room), "full": label, "kind": k, "on": attr(d, "switch") == "on"}
    c = caps(d)
    if k == "valve":   # on = open; commands open / close when it's a real valve, else on / off (a relay)
        dev["cmd"] = "openclose" if "Valve" in c else "onoff"
        dev["on"] = attr(d, "valve") == "open" if "Valve" in c else dev["on"]
    if k == "garage":  # on = open; open / close for a garage door controller, else on / off (a relay that pulses)
        dev["cmd"] = "openclose" if {"GarageDoorControl", "DoorControl"} & c else "onoff"
        dev["on"] = attr(d, "door") in ("open", "opening") if dev["cmd"] == "openclose" else dev["on"]
    if num(attr(d, "level")) is not None:
        dev["level"] = int(num(attr(d, "level")))
    if k == "light":
        # what the light can do: dim (SwitchLevel), white = tunable white (ColorTemperature), rgb (ColorControl)
        c = caps(d)
        dev["dim"] = "SwitchLevel" in c
        dev["white"] = "ColorTemperature" in c
        # a group claims ColorControl even when its bulbs are white-only: trust it only when it reports a hue
        dev["rgb"] = "ColorControl" in c and ("Group" not in (d.get("type") or "") or attr(d, "hue") not in (None, ""))
        for a, key in (("hue", "hue"), ("saturation", "sat"), ("colorTemperature", "ct")):
            if dev["white" if a == "colorTemperature" else "rgb"] and num(attr(d, a)) is not None:
                dev[key] = round(num(attr(d, a)))
        lt = d.get("_lightType")
        if lt:   # the owner's light type: only what the device can do (light_types)
            dev["dim"] = lt != "onoff" and "SwitchLevel" in c
            dev["white"] = lt in ("ct", "rgbct") and "ColorTemperature" in c
            dev["rgb"] = lt in ("rgb", "rgbct") and "ColorControl" in c
            for k, need in (("hue", "rgb"), ("sat", "rgb"), ("ct", "white")):
                if not dev[need]:
                    dev.pop(k, None)
        if d.get("_colorCmd") == "setColor":
            dev["colorCmd"] = "setColor"
        if 0 < dev.get("ct", 0) < 1000:
            dev["ct"] = round(1e6 / dev["ct"])   # some Zigbee bulbs report mireds (153 ≈ 6536 K), not Kelvin
        if attr(d, "colorMode"):
            dev["mode"] = attr(d, "colorMode")   # "CT" (white) or "RGB" (colour)
    if k == "fan" and d.get("_as") == "fan" and "FanControl" not in c:
        # a relay / outlet the owner calls a fan (e.g. a box fan): on / off only, no speeds — shown with the outlets
        # and taking part in the fan scenes
        dev["kind"], dev["fan"] = "outlet", True
        dev["fanType"] = d.get("_fanType") or "pedestal"
    elif k == "fan":
        dev["speed"] = attr(d, "speed") or "off"
        dev["fanType"] = d.get("_fanType") or "ceiling"
    if k == "shade":
        dev["level"] = int(num(attr(d, "position")) or num(attr(d, "level")) or 0)
    if "group" in (d.get("type") or "").lower():
        dev["group"] = True
    if d.get("_icon"):
        dev["icon"] = d["_icon"]   # the owner's picture: "line:<icon>" | "art:<drawing>" | "up:<upload id>"
    return dev


def light_types(d):
    """The light types this device can be set to (from its Hubitat capabilities)."""
    c = caps(d)
    if "Switch" not in c:
        return []
    out = ["onoff"]
    if "SwitchLevel" in c:
        out.append("dim")
        if "ColorTemperature" in c:
            out.append("ct")
    if "ColorControl" in c:
        out.append("rgb")
        if "ColorTemperature" in c:
            out.append("rgbct")
    return out


ICON_RE = re.compile(r"[A-Za-z0-9]{1,30}")


def rooms_of_owner(room_list, overrides):
    """The owner's rooms (Manager → Devices → Rooms): a picture (line icon) for any room, and rooms of their own —
    e.g. "All lights" — whose devices also stay in their own room (room "members"; the panels show the same device in
    both). Custom rooms come after Hubitat's (each panel can reorder)."""
    ov = overrides if isinstance(overrides, dict) else {}
    icons = ov.get("_roomIcons") if isinstance(ov.get("_roomIcons"), dict) else {}
    for r in room_list:
        if isinstance(icons.get(r["name"]), str) and ICON_RE.fullmatch(icons[r["name"]]):
            r["icon"] = icons[r["name"]]
    shown = {d["id"] for r in room_list for d in r["devices"]}
    taken = {r["id"] for r in room_list}
    for c in ov.get("_rooms") if isinstance(ov.get("_rooms"), list) else []:
        if not isinstance(c, dict) or not isinstance(c.get("name"), str) or not isinstance(c.get("devices"), list):
            continue
        name = safe_text(c["name"], 40)
        if not name:
            continue
        # (the stable id "r3" → "my-r3": a renamed room keeps each panel's choices — shown / hidden, order, scenes)
        rid = base = "my-" + (c["id"] if isinstance(c.get("id"), str) and re.fullmatch(r"r\d{1,6}", c["id"]) else slug(name) or "room")

        n = 2
        while rid in taken:   # (never dropped: "My Kitchen" from Hubitat and a room of yours "Kitchen" both get a page)
            rid, n = f"{base}-{n}", n + 1
        taken.add(rid)
        members = list(dict.fromkeys(i for i in c["devices"] if isinstance(i, int) and not isinstance(i, bool) and i in shown))[:200]

        icon = c["icon"] if isinstance(c.get("icon"), str) and ICON_RE.fullmatch(c["icon"]) else "grid"
        room_list.append({"id": rid, "name": name, "icon": icon, "devices": [], "members": members, "custom": True})


def groups_of(overrides):

    """The owner's device groups (Manager → Devices → Groups): [{id, name, devices: [ids], pin, unlock, panels}]."""
    gs = (overrides or {}).get("_groups") if isinstance(overrides, dict) else None
    out = []
    for g in gs if isinstance(gs, list) else []:
        if isinstance(g, dict) and isinstance(g.get("devices"), list):
            out.append({"devices": {i for i in g["devices"] if isinstance(i, int) and not isinstance(i, bool)},
                        "pin": g.get("pin") is True, "unlock": g.get("unlock") is True,
                        "panels": [p for p in g["panels"] if isinstance(p, str)] if isinstance(g.get("panels"), list) else None})
    return out


def is_guest_mode(d):

    return bool(GUEST_MODE.match(d.get("label") or "")) and "Switch" in caps(d)


def guest_name(label):
    """ "Guest Mode, Jane - GM" -> "Jane"; "Guest Mode" -> "Guest mode" (who / what each guest mode is for)."""
    n = GUEST_SUFFIX.sub("", GUEST_MODE.sub("", label)).strip(" ,:-")
    return n or "Guest mode"


def thing_kind(d):
    t, c, label = d.get("type") or "", caps(d), d["label"]
    if is_guest_mode(d):
        return "guest"
    for word, k in (("Washer", "washer"), ("Dryer", "dryer"), ("Dishwasher", "dishwasher"), ("Refrigerator", "fridge"),
                    ("Microwave", "microwave"), ("Range", "oven"), ("Sonos", "speaker"), ("Dyson", "purifier"), ("Siren", "siren")):
        if word in t:
            return k
    if "Virtual Switch" in t:
        return "mode" if label.startswith("V - ") else None
    if "GarageDoorControl" in c:
        return "garage"
    if "InvisOutlet" in t:
        return "smart-outlet"
    if "AirQuality" in c:
        return "air"
    if "WaterSensor" in c:
        return "leak"
    if "GasDetector" in c:
        return "gas"
    if "AccelerationSensor" in c:
        return "vibration"
    if "MotionSensor" in c:
        return "motion"
    if "ContactSensor" in c:
        return "contact"
    if "TemperatureMeasurement" in c or "RelativeHumidityMeasurement" in c:
        return "climate"
    return None


def alert_sensor(d):
    t, label, room = d.get("type") or "", d["label"], d.get("room") or ""
    s = None
    if d.get("_as") == "temp-alert" and not retired(d):   # the owner made a temperature sensor an alert (a fridge, a wine cooler…)

        s = {"kind": "freezer", "name": "Too warm", "where": label.replace("Temp Sensor", "").replace("Temp", "").strip() or label,
             "temp": num(attr(d, "temperature"))}
    elif retired(d) or "LeakSmart" in t or d.get("_as"):   # retired / water valves (they report "wet") / owner chose a role
        return None
    elif "GasDetector" in caps(d):
        s = {"kind": "gas", "name": "Gas", "where": short(label.replace("Gas Detector", "").strip(" -"), "") or room}
    elif "Smoke" in t:
        s = {"kind": "smoke", "name": "Smoke / CO", "where": room}
    elif ("Moisture" in t or "WaterSensor" in caps(d)) and "Soil" not in label:   # leak sensors of any brand, not plant sensors
        s = {"kind": "water", "name": "Water leak", "where": short(re.sub(r"Water Leak|Leak Sensor", "", label).strip(" -"), "") or room}
    elif "PowerFailure" in t:
        s = {"kind": "power", "name": "Freezer power failure", "where": label.replace("Power Failure", "").strip()}
    elif "freezer" in label.lower() and "TemperatureMeasurement" in caps(d):  # by capability: the reading may be missing
        s = {"kind": "freezer", "name": "Freezer too warm", "where": label.replace("Temp Sensor", "").replace("Temp", "").strip(),
             "temp": num(attr(d, "temperature"))}
    if s:
        s.update(id=int(d["id"]), state="clear", room=room)
        if s["kind"] == "freezer":   # °F: "Show as a warning above" (Manager → Devices; display only, none = no limit)
            s["max"] = d.get("_alertAbove")
        if d.get("_alertOff"):
            s["off"] = True          # never alerts (Manager → Alerts); still listed there
    return s



# Names from Hubitat end up in the pages' HTML (and some in onclick="…"): characters that could end a tag, an attribute
# or a script string become harmless look-alikes ("Jane's" → "Jane’s", "A & B" → "A ＆ B"), control characters go.
SAFE_TEXT = str.maketrans({"<": "‹", ">": "›", "&": "＆", '"': "”", "'": "’", "`": "‘", "\\": "∖"})


def safe_text(s, limit=80):
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f]", "", s.translate(SAFE_TEXT))).strip()[:limit]


def clean(d):
    """One device in a safe shape (odd values from a driver must never stop the model from being built; names never
    carry page code)."""
    if not isinstance(d, dict) or not str(d.get("id", "")).isdecimal() or not isinstance(d.get("label"), str) or not d["label"]:
        return None
    label = safe_text(d["label"])
    if not label:
        return None
    room = safe_text(d["room"], 60) if isinstance(d.get("room"), str) else None
    return {**d, "id": str(int(d["id"])), "label": label, "room": room or None,
            "type": d.get("type") if isinstance(d.get("type"), str) else "",
            "attributes": d.get("attributes") if isinstance(d.get("attributes"), dict) else {},
            "capabilities": d.get("capabilities") if isinstance(d.get("capabilities"), list) else []}


def apply_overrides(devs, overrides):
    """The owner's choices: another room, a role the device supports, or hidden. Unknown / unsupported choices are
    ignored (a device keeps its automatic role)."""
    ov = overrides if isinstance(overrides, dict) else {}
    out, hidden, confirm = [], set(), set()
    for d in devs:
        o = ov.get(d["id"]) or ov.get(int(d["id"])) or {}
        if not isinstance(o, dict):
            o = {}
        d = dict(d, _hubRoom=d.get("room"))
        room = safe_text(o["room"], 60) if isinstance(o.get("room"), str) else ""
        if room and room not in NO_ROOM:
            d["room"] = room
        role = o.get("as")
        if role == "hidden":
            hidden.add(int(d["id"]))
        elif isinstance(role, str) and role in options(d):
            d["_as"] = role
        if o.get("confirm") is True:
            confirm.add(int(d["id"]))
        if o.get("fanType") in FAN_TYPES:
            d["_fanType"] = o["fanType"]
        if isinstance(o.get("icon"), str) and re.fullmatch(r"(line|art|up):[A-Za-z0-9_-]{1,40}", o["icon"]):
            d["_icon"] = o["icon"]   # the owner's picture (Manager → Devices; house_devices.ICON_RE)
        if o.get("lightType") in LIGHT_TYPES:
            d["_lightType"] = o["lightType"]
        if o.get("colorCmd") in COLOR_CMDS:
            d["_colorCmd"] = o["colorCmd"]
        if o.get("unlock") == "pin":
            d["_unlock"] = True      # a lock the panels may unlock — with the panel PIN, on panels that allow it
        if o.get("alert") == "off":
            d["_alertOff"] = True    # an alert sensor that never alerts (Manager → Alerts)
        if isinstance(o.get("alertAbove"), int) and not isinstance(o["alertAbove"], bool) and -40 <= o["alertAbove"] <= 120:
            d["_alertAbove"] = o["alertAbove"]
        out.append(d)
    return out, hidden, confirm


def build(devs, overrides=None):
    devs = [c for c in (clean(d) for d in (devs if isinstance(devs, list) else [])) if c]
    devs, hidden, confirm_ids = apply_overrides(devs, overrides)
    every = devs                                   # for the device catalogue (Settings)
    devs = [d for d in devs if int(d["id"]) not in hidden]
    rooms = {}
    for d in devs:
        k, room = kind(d), d.get("room")
        if k and room and room not in NO_ROOM:
            rooms.setdefault(room, []).append(room_device(d, k, room))
    order = list(ROOM_KINDS)
    room_list = [{"id": slug(name), "name": name, "icon": room_icon(name),
                  "devices": sorted(ds, key=lambda x: (order.index(x["kind"]), x["name"]))} for name, ds in rooms.items()]

    presence = [{"id": int(d["id"]), "label": d["label"].lstrip("# ").strip(), "type": d.get("type"), "home": attr(d, "presence") == "present"}
                for d in devs if "PresenceSensor" in caps(d) and re.search(r"OwnTracks|Mobile App", d.get("type") or "")]

    # A Protect doorbell IS a camera: Hubitat shows it twice ("Front Door Camera" + "Front Door Doorbell"), Protect once.
    cameras = [{"id": int(d["id"]), "name": d["label"].replace(" Camera", "").strip() or d["label"], "room": d.get("room"), "doorbell": False}
               for d in devs if "UniFi Protect Camera" in (d.get("type") or "") and d.get("room")]
    for d in devs:
        if "UniFi Protect Doorbell" in (d.get("type") or ""):
            base = d["label"].replace(" Doorbell", "").strip()
            cam = next((c for c in cameras if c["name"] == base), None)
            if cam:
                cam["doorbell"], cam["doorbellDevice"] = True, int(d["id"])
            elif d.get("room"):
                cameras.append({"id": int(d["id"]), "name": base, "room": d.get("room"), "doorbell": True})

    sensors = [s for s in (alert_sensor(d) for d in devs) if s]

    # door locks, windows, doors / gates, thermostat, outside temperature (were fixed lists in data.js)
    locks = [{"id": int(d["id"]), "name": d["label"].replace(" Lock", "").strip() or d["label"], "lock": attr(d, "lock") or "unknown",
              "battery": int(num(attr(d, "battery"))) if num(attr(d, "battery")) is not None else None}
             for d in devs if (d.get("_as") == "lock") or (not d.get("_as") and "Lock" in caps(d) and not retired(d))]
    contacts = [d for d in devs if "ContactSensor" in caps(d) and (d.get("_as") in ("window", "door-in", "door-out") or
                                                                   (not d.get("_as") and not retired(d)))]
    windows = [{"id": int(d["id"]), "name": re.sub(r"\s+", " ", re.sub(r"\bwindows?\b", "", d["label"], flags=re.I)).strip() or d["label"],
                "room": d.get("room"), "open": attr(d, "contact") == "open"}
               for d in contacts if d.get("_as") == "window" or (not d.get("_as") and re.search(r"window", d["label"], re.I))]
    windows.sort(key=lambda w: (w["name"].lower(), w["id"]))
    window_ids = {w["id"] for w in windows}
    doors = []
    for d in contacts:
        # (a garage door *opener* that also reports open/closed is a "thing", not a door sensor)
        if int(d["id"]) in window_ids:
            continue
        if d.get("_as") in ("door-in", "door-out"):
            outside = d["_as"] == "door-out"
        elif d.get("_as") or "GarageDoorControl" in caps(d) or "Finger" in (d.get("type") or "") or \
                not re.search(r"\bdoor\b|\bgate\b", d["label"], re.I):
            continue
        else:
            outside = bool(OUTSIDE_ROOM.search(d.get("room") or "") or OUTSIDE_NAME.search(d["label"]))
        doors.append({"id": int(d["id"]), "name": re.sub(r"\s*Door\s*$", "", d["label"]).strip() if not outside else d["label"],
                      "where": "outside" if outside else "inside", "room": d.get("room"), "open": attr(d, "contact") == "open"})
    locks.sort(key=lambda x: (x["name"].lower(), x["id"]))
    doors.sort(key=lambda x: (x["where"] != "outside", x["name"].lower(), x["id"]))
    therms = [d for d in devs if d.get("_as") == "thermostat" or (not d.get("_as") and "Thermostat" in caps(d) and not retired(d)
              and not re.search(r"fan|dyson|purifier", (d.get("type") or "") + d["label"], re.I))]
    # the owner's choice first, then by what it has (not its value)
    therms.sort(key=lambda d: (d.get("_as") != "thermostat", "heatingSetpoint" not in d["attributes"], int(d["id"])))
    for extra in therms[1:]:
        if extra.get("_as") == "thermostat":
            extra["_as"] = "climate"
    thermostat = None
    if therms:
        t = therms[0]
        thermostat = {"id": int(t["id"]), "name": t["label"], "room": t.get("room") or "",
                      "temp": num(attr(t, "temperature")), "heat": num(attr(t, "heatingSetpoint")), "cool": num(attr(t, "coolingSetpoint"))}
    # a temperature sensor named porch / outside / …; not a door or window sensor that happens to measure it too
    outs = [d for d in devs if d.get("_as") == "outside-temp" or (not d.get("_as") and "TemperatureMeasurement" in caps(d)
            and "ContactSensor" not in caps(d) and not retired(d) and re.search(r"porch|outside|outdoor|exterior", d["label"], re.I))]
    outs.sort(key=lambda d: (d.get("_as") != "outside-temp", not re.search(r"temp", d["label"], re.I), int(d["id"])))
    for extra in outs[1:]:
        if extra.get("_as") == "outside-temp":
            extra["_as"] = "climate"
    outside_temp = {"id": int(outs[0]["id"]), "name": outs[0]["label"].replace(" Temp", "").strip(),
                    "temp": num(attr(outs[0], "temperature")), "humidity": num(attr(outs[0], "humidity"))} if outs else None

    # every other useful device ("things"): appliances, speakers, climate, sensors, garage door, modes
    in_rooms = {dev["id"] for r in room_list for dev in r["devices"]}
    taken = in_rooms | {p["id"] for p in presence} | {s["id"] for s in sensors} | {x["id"] for x in locks + windows + doors} | \
        ({thermostat["id"]} if thermostat else set())
    things = []
    for d in devs:
        did, label = int(d["id"]), d["label"]
        role = d.get("_as")
        if role == "outside-temp":   # the outside sensor also gets its climate tile (as when found automatically)
            role = "climate"
        if is_guest_mode(d) and role != "hidden":
            role = None              # a guest mode stays one, whatever role it was given
        if did in taken or (role and role not in THING_ROLES):
            continue
        if not role and (THING_SKIP.search(d.get("type") or "") or retired(d)):
            continue
        k = THING_ROLES[role] if role else thing_kind(d)
        if not k:
            continue
        room = d.get("room") or ""
        if room in NO_ROOM + ("None",):
            room = "" if k != "mode" else "Home"
        a = {n: v for n, v in (d.get("attributes") or {}).items() if n in THING_ATTRS and v not in (None, "", "null")}
        if k == "guest":   # only in Settings → Guest Wi-Fi, never on a room page (the owner), whatever room Hubitat says
            things.append({"id": did, "kind": k, "name": guest_name(label), "full": label, "room": "", "attrs": a})
            continue
        things.append({"id": did, "kind": k, "name": short(label.replace("V - ", "").replace("SAS - ", ""), room),
                       "full": label, "room": room or "Unassigned", "attrs": a, **({"icon": d["_icon"]} if d.get("_icon") else {})})
    things.sort(key=lambda x: (x["room"], x["kind"], x["name"]))

    # rooms with only things, or only doors / windows / locks / cameras (Hubitat's "Back Door") still get a page
    placed = {d.get("room") for d in devs if int(d["id"]) in {x["id"] for x in locks + windows + doors}} | {c.get("room") for c in cameras}
    extra = ({t["room"] for t in things} | placed) - {None, "", "Unassigned", *NO_ROOM}
    for name in extra - {r["name"] for r in room_list}:
        room_list.append({"id": slug(name), "name": name, "icon": room_icon(name), "devices": []})
    room_list.sort(key=lambda r: r["name"])
    rooms_of_owner(room_list, overrides)


    # every device's Hubitat room (doors, gates, windows, locks, sensors, cameras… show in the room Hubitat puts them in)
    room_of = {int(d["id"]): d["room"] for d in devs if d.get("room") and d["room"] not in NO_ROOM and not is_guest_mode(d)}

    # devices whose "turn on / open" needs the panel PIN (the bridge checks it): valves, garage openers, and any device
    # the owner marked
    shown = {d["id"] for r in room_list for d in r["devices"]} | {x["id"] for x in things}
    risky = {d["id"] for r in room_list for d in r["devices"] if d["kind"] in ("valve", "garage")} | \
        {int(d["id"]) for d in devs if RISKY_CAPS & caps(d) and int(d["id"]) in shown}
    # guest modes: the PIN for on AND off (turning one off changes the guest Wi-Fi password)
    guest_modes = sorted(x["id"] for x in things if x["kind"] == "guest")
    # (every guest mode needs the PIN — also one hidden in Settings that BRIDGE_ALLOW still lets through)
    guest_pin = sorted({int(d["id"]) for d in every if is_guest_mode(d)} | set(guest_modes))
    # the owner's device groups: "PIN to turn on / open", "may unlock (with the PIN)", "only these panels"
    groups = groups_of(overrides)
    group_pin = set().union(*[g["devices"] for g in groups if g["pin"]])
    confirm = sorted(risky | ((confirm_ids | group_pin) & shown) | set(guest_modes))
    own_unlock = {int(d["id"]) for d in devs if d.get("_unlock")}
    unlockable = sorted({x["id"] for x in locks} & (own_unlock | set().union(*[g["devices"] for g in groups if g["unlock"]])))

    for x in locks:
        if x["id"] in unlockable:
            x["unlock"] = True
    only = {}
    for g in groups:
        if g["panels"] is not None:
            for i in g["devices"]:
                # in several groups: only the panels every one of them allows
                only[i] = sorted(set(only[i]) & set(g["panels"])) if i in only else sorted(set(g["panels"]))


    # the device catalogue for Settings: every device, its rooms, what it is now, and what it could be
    role_of = {}
    for r in room_list:
        for x in r["devices"]:
            role_of[x["id"]] = x["kind"]
    role_of.update({x["id"]: "lock" for x in locks})
    role_of.update({x["id"]: "window" for x in windows})
    role_of.update({x["id"]: "door-out" if x["where"] == "outside" else "door-in" for x in doors})
    role_of.update({x["id"]: THING_ROLES.get(x["kind"], "thing:" + x["kind"]) for x in things})
    role_of.update({x["id"]: "sensor:" + x["kind"] for x in sensors})
    role_of.update({x["id"]: "presence" for x in presence})
    role_of.update({x["id"]: "camera" for x in cameras})
    role_of.update({x.get("doorbellDevice"): "camera" for x in cameras if x.get("doorbellDevice")})
    if thermostat:
        role_of[thermostat["id"]] = "thermostat"
    if outside_temp:
        role_of[outside_temp["id"]] = "outside-temp"
    catalog = sorted(({"id": int(d["id"]), "label": d["label"], "room": d.get("room") or "", "hubRoom": d.get("_hubRoom") or "",
                       "type": d.get("type") or "", "is": "hidden" if int(d["id"]) in hidden else role_of.get(int(d["id"]), ""),
                       "options": options(d), **({"lightTypes": light_types(d)} if "Switch" in caps(d) else {}), **can_do(d),
                       "attrs": attr_list(d)}
                      for d in every), key=lambda x: (x["room"], x["label"].lower()))

    model = {"rooms": room_list, "presence": presence, "cameras": cameras, "sensors": sensors, "things": things, "roomOf": room_of,
             "locks": locks, "windows": windows, "doors": doors, "thermostat": thermostat, "outside": outside_temp,
             "confirm": confirm, "guestModes": guest_modes, "guestPin": guest_pin, "devices": catalog, "roles": ROLE_NAMES,
             "unlockable": unlockable, "onlyPanels": {str(k): v for k, v in sorted(only.items())}}

    model["version"] = version(model)
    return model


def _shape(v):
    """The model without the values that change all the time (on/off, levels, locks, temperatures…)."""
    if isinstance(v, dict):
        return {k: _shape(x) for k, x in v.items() if k not in VOLATILE}
    if isinstance(v, list):
        return [_shape(x) for x in v]
    return v


def version(model):
    shape = _shape({k: v for k, v in model.items() if k != "version"})
    return hashlib.sha256(json.dumps(shape, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:12]


def to_js(model, source="the Hubitat bridge (service/house_model.py)"):
    return (f"// Generated by {source} from Hubitat's device list — do not edit by hand.\n"
            f"window.HUBITAT = {json.dumps(model, indent=1, ensure_ascii=True)};\n")


def switchable(model, never=None):
    """Device ids the panel may send commands to: every light / switch / outlet / fan / shade in a room, the door
    locks (the bridge only ever sends "lock") and the thermostat — minus `never` (ids the owner switched off in
    Settings). Without a `never` list, devices named like KEEP_ON (rainbird, freezer, server…) are left out."""
    ids, by_name = set(), set()   # by_name: plain room devices the KEEP_ON name rule applies to
    for r in model["rooms"]:
        for d in r["devices"]:
            ids.add(d["id"])
            # (a valve / garage opener the owner set up is meant to be used — the panel PIN guards it; locks and the
            # thermostat are never caught by a name either: "Garage Door" lock stays lockable)
            if d["kind"] not in ("valve", "garage") and KEEP_ON.search(d["full"]) and "light" not in d["full"].lower():
                by_name.add(d["id"])
    ids |= {lk["id"] for lk in model["locks"]}
    # an air purifier (Dyson): fanOn / off / auto / speed only (the bridge's per-device command list)
    ids |= {t["id"] for t in model.get("things", []) if t.get("kind") == "purifier"}
    # guest modes: on / off only, always with the panel PIN (the bridge's needs_pin)
    ids |= set(model.get("guestModes", ()))
    if model.get("thermostat"):
        ids.add(model["thermostat"]["id"])
    if never is None:
        return ids - by_name
    return ids - {int(i) for i in never}
