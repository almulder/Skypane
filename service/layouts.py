"""The layout builder's saved format (release 2, research: the research notes) — checked here before it's
kept, because a panel draws whatever is stored.

A panel's own Home page (Manager → Panels → Look & layout → "Custom") is a grid of cards:

  {"v": 1, "cols": 12, "rows": 8, "gap": 14, "scr": {"w": 1280, "h": 800},
   "cards": [{"i": "c1", "t": "clock", "x": 0, "y": 0, "w": 4, "h": 3,
              "s": {"r": 24, "e": 1, "a": 55, "b": true, "ic": 100, "tx": 100},     style: corner radius px, elevation
                                                                                   0–3, surface 0–100 % (0 = none),
                                                                                   border, icon / text size %
              "o": {...},                                                          the card type's own options
              "tap": {...}, "hold": {...}, "dbl": {...},                           actions
              "show": [rule…], "hi": [rule…], "hic": "#rrggbb"}]}                  show-when / highlight-when

An action: {"do": "toggle" | "on" | "off" | "lock" | "unlock" | "cmd" | "room" | "camera" | "page" | "none",
            "id": device, "c": command, "v": value, "room": room id, "cam": camera id, "page": "home"|"cameras"|…}
A rule:    {"id": device, "at": attribute, "op": "eq" | "ne" | "gt" | "lt", "v": text or number}  (all must match)
A blank card's piece (o.parts, up to 16): {"t": "icon" | "light" | "switch" | "value" | "door" | "lock" | "garage" | "text",
            "x", "y", "w", "h": cells of the card's own 24 × 24 grid, "id": device, "label", "icon", "at", "unit",
            "doors": [{"id", "contact", "travel", "label"}], "text", "size": "s"|"m"|"l"|"xl", "align", "bold", "wheel": [action…]}

Every command still goes through the panel's own checks (the PIN, "only some panels") and the bridge's (its allow
list, the command list per device) — the layout can't widen what a panel may do.
"""
import re

try:
    from service import house_model
except ImportError:  # pragma: no cover
    import house_model


class Invalid(ValueError):
    pass


# the built-in cards (dashboard/layouts/v4/shared/grid.js draws them)
BUILTIN = ("clock", "weather", "calendar", "thermostat", "locks", "openings", "people", "temps", "guest", "alerts",
           "device", "value", "text", "button", "room", "camera", "picture", "group",
           # a room's own page (the room it's on fills them in): its header, devices, doors / locks, cameras, appliances
           "roomhead", "roomdevs", "roomopen", "roomcams", "roomthings",
           "timer",   # kitchen timers
           "scenes", "modes", "safety", "notices", "countdown", "bins",
           "alarm", "lock", "garage", "spot",   # (spot: a picture with live values, or a garage of 1-3 doors)
           "status", "photos", "batteries", "power", "player", "fan", "energy",
           "todo", "notes",   # the shared lists (to-do, shopping…) and the note board (service/lists.py)   # health, a slideshow, low batteries, what uses power   # Hubitat Safety Monitor (the PIN), one lock (slide to unlock), a garage door
           "blank")   # a blank card: the owner's own pieces (pictures, lights, switches, values, a lock, a garage, text) inside it
USER_CARD = re.compile(r"card:[a-z0-9-]{1,40}")       # an uploaded card (service/cards.py)
ACTIONS = ("none", "toggle", "on", "off", "lock", "unlock", "cmd", "room", "camera", "page", "nudge")
# "nudge": a setpoint or level a little up / down from where it is now (the press-and-hold wheel's warmer / cooler)
NUDGE = {"setHeatingSetpoint": 5, "setCoolingSetpoint": 5, "setLevel": 50}
WHEEL_MAX = 8
# the looks a card type comes in (research: the research notes) — the first is the default
MOTIONS = ("auto", "spin", "rock", "twist", "swing", "sonar", "rumble", "hop", "steam", "shake", "tumble", "glow", "flicker", "heat",
           "drip", "ring", "waves", "slide", "lift", "charge", "breathe", "roam", "blink")   # (motions.js)
STYLES = {"thermostat": ("dial", "big", "compact", "arc"), "device": ("row", "square", "icon", "slider", "bar"), "value": ("big", "gauge", "chip"),
          "people": ("pills", "avatars", "count"), "alarm": ("full", "buttons", "badge"), "player": ("row", "big", "volume")}
OPS = ("eq", "ne", "gt", "lt")
# a thermostat card's buttons: its modes ("fan" = off with the fan on, as the dial has it) and its fan's modes
THERMO_MODES = ("heat", "cool", "auto", "off", "fan", "emergency heat")
FAN_MODES = ("auto", "on", "circulate")
# a thermostat card's look (dashboard/layouts/v4/shared/thermo-looks.js; the pictures: the design notes) —
# none: the card's style as before (the dial unless another style is set)
THERMO_LOOKS = ("halo", "knob", "slider", "mercury", "bignum", "stepper", "range", "today", "oneline", "orb", "gauge", "rings")
# the commands a card may send (scripts/hubitat_bridge.py COMMANDS — the bridge checks them again per device)
COMMANDS = ("on", "off", "setLevel", "setSpeed", "setPosition", "open", "close", "lock", "unlock", "refresh",
            "setHeatingSetpoint", "setCoolingSetpoint", "setThermostatMode", "setThermostatFanMode",
            "setColor", "setColorTemperature", "setHue", "setSaturation", "fanOn", "auto", "setFanSpeed",
            "push",   # (a Hubitat button: push(1..20) — scenes, virtual buttons for rules)
            "play", "pause", "stop", "nextTrack", "previousTrack", "setVolume", "mute", "unmute")   # (a music player)
ID = re.compile(r"[a-z0-9]{1,12}")
ATTR = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,39}")
ROOM = re.compile(r"[a-z0-9-]{1,60}")
CAM = re.compile(r"[A-Za-z0-9_.:-]{1,80}")
PAGE = re.compile(r"home|cameras|music|[a-z0-9-]{1,60}")
# a line icon, an animated drawing (roomlayoutG.js) or one of the owner's pictures
ICON = re.compile(r"[a-zA-Z][a-zA-Z0-9]{0,30}|art:[a-z0-9-]{1,30}|up:[0-9a-f]{16}")
COLOR = re.compile(r"#[0-9a-fA-F]{6}")
PIC = re.compile(r"up:[0-9a-f]{16}")
MAX_CARDS = 60
# a blank card's pieces sit on its own small grid: 24 × 24 cells whatever the card's size (positions are shares of
# the card, so the pieces move and grow with it)
PIECES = {"icon": "picture", "light": "light", "switch": "switch", "value": "value", "door": "door", "lock": "lock",
          "garage": "garage", "text": "text"}
INNER = 24
MAX_PIECES = 16


def _int(v, lo, hi, what):
    if not isinstance(v, int) or isinstance(v, bool) or not lo <= v <= hi:
        raise Invalid(f"{what}: a whole number {lo}..{hi}")
    return v


def _dev(v, what="device"):
    return _int(v, 1, 10 ** 9 - 1, what)


def _text(v, n, what):
    if not isinstance(v, str):
        raise Invalid(f"{what}: text")
    return house_model.safe_text(v, n)


def _plain(v, n, lines=False):
    """Text as typed (the panel escapes it): control characters out (new lines kept when asked), at most n."""
    v = re.sub(r"[\x00-\x09\x0b-\x1f\x7f\u202a-\u202e\u2066-\u2069]" if lines else r"[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]", " ", v)
    return "\n".join(x.strip() for x in v.replace("\r", "").split("\n"))[:n].strip() if lines else v.strip()[:n]


def _value(v):
    if isinstance(v, bool):
        raise Invalid("a value: text or a number")
    if isinstance(v, (int, float)):
        if v != v or v in (float("inf"), float("-inf")):
            raise Invalid("a value: a number")
        return v
    if not isinstance(v, str):
        raise Invalid("a value: text or a number")
    return _plain(v, 60)


def action(a):
    if a is None:
        return None
    if not isinstance(a, dict) or a.get("do") not in ACTIONS:
        raise Invalid("an action: " + ", ".join(ACTIONS))
    do = a["do"]
    out = {"do": do}
    if do in ("toggle", "on", "off", "lock", "unlock", "cmd", "nudge"):
        out["id"] = _dev(a.get("id"))
    if do == "nudge":
        if a.get("c") not in NUDGE:
            raise Invalid("nudge: " + ", ".join(NUDGE))
        out["c"] = a["c"]
        lim = NUDGE[a["c"]]
        out["v"] = _int(a.get("v"), -lim, lim, "nudge by")
    if do == "cmd":
        if a.get("c") not in COMMANDS:
            raise Invalid("a command the bridge knows: " + ", ".join(COMMANDS))
        out["c"] = a["c"]
        if a["c"] == "push":   # (a Hubitat button number)
            out["v"] = _int(a.get("v"), 1, 20, "button number")
        elif a["c"] == "setVolume":
            out["v"] = _int(a.get("v"), 0, 100, "volume")
        elif a["c"] in ("play", "pause", "stop", "nextTrack", "previousTrack", "mute", "unmute"):
            pass   # (no value)
        elif a.get("v") is not None:
            out["v"] = _value(a["v"])
    if do == "room":
        if not isinstance(a.get("room"), str) or not ROOM.fullmatch(a["room"]):
            raise Invalid("a room")
        out["room"] = a["room"]
    if do == "camera":
        if not isinstance(a.get("cam"), str) or not CAM.fullmatch(a["cam"]):
            raise Invalid("a camera or view")
        out["cam"] = a["cam"]
    if do == "page":
        if not isinstance(a.get("page"), str) or not PAGE.fullmatch(a["page"]):
            raise Invalid("a page")
        out["page"] = a["page"]
    return out


def wheel(v):
    """The press-and-hold wheel: up to 8 actions, each with its own short label, icon and (a colour) swatch."""
    if v is None or v == []:
        return None
    if not isinstance(v, list) or len(v) > WHEEL_MAX:
        raise Invalid(f"the wheel: up to {WHEEL_MAX} actions")
    out = []
    for w in v:
        a = action(w)
        if not a or a["do"] == "none":
            raise Invalid("a wheel action")
        if isinstance(w.get("label"), str) and w["label"].strip():
            a["label"] = _text(w["label"], 24, "label")
        if w.get("icon") is not None:
            if not isinstance(w["icon"], str) or not ICON.fullmatch(w["icon"]):
                raise Invalid("icon")
            a["icon"] = w["icon"]
        if w.get("col") is not None:
            if not isinstance(w["col"], str) or not COLOR.fullmatch(w["col"]):
                raise Invalid("a wheel colour")
            a["col"] = w["col"]
        out.append(a)
    return out


def rules(v):
    if v is None or v == []:
        return None
    if not isinstance(v, list) or len(v) > 4:
        raise Invalid("up to 4 rules")
    out = []
    for r in v:
        if not isinstance(r, dict) or r.get("op") not in OPS or not isinstance(r.get("at"), str) or not ATTR.fullmatch(r["at"]):
            raise Invalid("a rule: device, attribute, eq / ne / gt / lt, value")
        out.append({"id": _dev(r.get("id")), "at": r["at"], "op": r["op"], "v": _value(r.get("v", ""))})
    return out


def style(s):
    s = s if isinstance(s, dict) else {}
    out = {}
    for k, lo, hi in (("r", 0, 48), ("e", 0, 3), ("a", 0, 100), ("ic", 50, 250), ("tx", 50, 250)):
        if s.get(k) is not None:
            out[k] = _int(s[k], lo, hi, "style " + k)
    if s.get("b") is not None:   # b = border
        if not isinstance(s["b"], bool):
            raise Invalid("style b: true / false")
        out["b"] = s["b"]
    # fit: what's inside follows the card's size — "scale" (bigger and smaller, the default on the fine grid),
    # "scroll" (scaled to the width; lists scroll, the title stays put); true = the old "shrink to fit", false = scroll
    if s.get("fit") is not None:
        if s["fit"] not in (True, False, "scale", "scroll"):
            raise Invalid("style fit: scale / scroll")
        out["fit"] = s["fit"]
    if s.get("c") is not None:   # the card's own accent colour
        if not isinstance(s["c"], str) or not COLOR.fullmatch(s["c"]):
            raise Invalid("style c: a colour")
        out["c"] = s["c"]
    return out


def options(t, o):
    """The card type's own options (unknown keys dropped)."""
    o = o if isinstance(o, dict) else {}
    out = {}
    if isinstance(o.get("title"), str):
        out["title"] = _text(o["title"], 40, "title")
    if o.get("icon") is not None:
        if not isinstance(o["icon"], str) or not ICON.fullmatch(o["icon"]):
            raise Invalid("icon")
        out["icon"] = o["icon"]
    if t in ("device", "value", "lock", "garage", "player", "fan") or (t == "button" and o.get("id") is not None):
        out["id"] = _dev(o.get("id"))
    if t == "value":
        if not isinstance(o.get("at"), str) or not ATTR.fullmatch(o["at"]):
            raise Invalid("value: an attribute")
        out["at"] = o["at"]
        if isinstance(o.get("unit"), str):
            out["unit"] = _text(o["unit"], 8, "unit")
        if o.get("dec") is not None:
            out["dec"] = _int(o["dec"], 0, 2, "decimals")
    if t == "text":
        if not isinstance(o.get("text", ""), str):
            raise Invalid("text: text")
        out["text"] = _plain(o.get("text", ""), 400, lines=True)
        if o.get("align") in ("left", "center", "right"):
            out["align"] = o["align"]
    if t == "room":
        if not isinstance(o.get("room"), str) or not ROOM.fullmatch(o["room"]):
            raise Invalid("room: which room")
        out["room"] = o["room"]
    if t == "camera":
        if not isinstance(o.get("cam"), str) or not CAM.fullmatch(o["cam"]):
            raise Invalid("camera: which camera or view")
        out["cam"] = o["cam"]
    if t == "picture":
        if not isinstance(o.get("pic"), str) or not PIC.fullmatch(o["pic"]):
            raise Invalid("picture: one of your pictures")
        out["pic"] = o["pic"]
        if o.get("fit") in ("cover", "contain"):
            out["fit"] = o["fit"]
    if t in STYLES and o.get("style") in STYLES[t]:
        out["style"] = o["style"]
    if t == "device":
        if o.get("motion") in MOTIONS:   # the icon's motion while it's on (motions.js)
            out["motion"] = o["motion"]
        if o.get("runW") is not None:    # a plug-in appliance: running only above this many watts
            out["runW"] = _int(o["runW"], 1, 10000, "running above (W)")
    if t in ("device", "garage"):
        if o.get("contact") is not None:  # a garage opener (a relay / button): the door's contact sensor
            out["contact"] = _dev(o["contact"], "door contact")
        if o.get("travel") is not None:   # how long the door takes to open / close (s)
            out["travel"] = _int(o["travel"], 3, 60, "travel time (s)")
    if t == "value":   # (the gauge's ends)
        for k in ("min", "max"):
            if o.get(k) is not None:
                if isinstance(o[k], bool) or not isinstance(o[k], (int, float)) or o[k] != o[k] or abs(o[k]) > 1e9:
                    raise Invalid(f"value {k}: a number")
                out[k] = o[k]
    if t in ("device", "button"):
        wh = wheel(o.get("wheel"))
        if wh:
            out["wheel"] = wh
    if t == "calendar" and o.get("days") is not None:
        out["days"] = _int(o["days"], 1, 7, "days")
    if t == "weather" and o.get("days") is not None:
        out["days"] = _int(o["days"], 0, 7, "days")
    if t == "weather" and o.get("locs") is not None:   # its places (the first is home: it drives the sky), set in the builder
        locs = o["locs"]
        if not isinstance(locs, list) or len(locs) > 6:
            raise Invalid("weather: up to 6 places")
        out["locs"] = []
        for p in locs:
            if not isinstance(p, dict):
                raise Invalid("a weather place")
            if not isinstance(p.get("name"), str) or not p["name"].strip():
                raise Invalid("place name")
            x = {"name": _text(p["name"], 40, "place name")}
            for k, lim in (("lat", 90), ("lon", 180)):
                v = p.get(k)
                if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or abs(v) > lim:
                    raise Invalid(f"place {k}")
                x[k] = round(float(v), 4)
            if isinstance(p.get("region"), str) and p["region"].strip():
                x["region"] = _text(p["region"], 60, "place region")
            out["locs"].append(x)
    if t == "scenes":   # buttons, each with its own action
        items = o.get("items", [])
        if not isinstance(items, list) or len(items) > 8:
            raise Invalid("scene buttons: up to 8")
        out["items"] = []
        for it in items:
            if not isinstance(it, dict):
                raise Invalid("a scene button")
            a = action(it.get("a"))
            if not a or a["do"] == "none":
                raise Invalid("a scene button needs its action")
            x = {"a": a, "label": _text(it.get("label") or "Scene", 24, "label")}
            if it.get("icon") is not None:
                if not isinstance(it["icon"], str) or not ICON.fullmatch(it["icon"]):
                    raise Invalid("icon")
                x["icon"] = it["icon"]
            out["items"].append(x)
        if o.get("look") in ("row", "list"):
            out["look"] = o["look"]
    if t == "todo":
        lid = o.get("list", "shopping")
        if not isinstance(lid, str) or not re.fullmatch(r"[a-z0-9-]{1,30}", lid):
            raise Invalid("which list: letters, digits and -")
        out["list"] = lid
        if isinstance(o.get("hideDone"), bool):
            out["hideDone"] = o["hideDone"]
    if t == "energy":   # which device reports each power (W); flips for drivers that count the other way
        for k in ("solar", "grid", "battery", "home"):
            if o.get(k) is not None:
                out[k] = _dev(o[k])
        for k in ("gridFlip", "batFlip"):
            if isinstance(o.get(k), bool):
                out[k] = o[k]
    if t == "player" and isinstance(o.get("art"), bool):
        out["art"] = o["art"]
    if t == "photos":
        pics = o.get("pics", [])
        if not isinstance(pics, list) or len(pics) > 12 or not all(isinstance(x, str) and PIC.fullmatch(x) for x in pics):
            raise Invalid("photos: up to 12 of your pictures")
        out["pics"] = list(dict.fromkeys(pics))
        if o.get("every") is not None:
            out["every"] = _int(o["every"], 3, 600, "seconds")
        if o.get("fit") in ("cover", "contain"):
            out["fit"] = o["fit"]
    if t == "batteries" and o.get("below") is not None:
        out["below"] = _int(o["below"], 1, 100, "below")
    if t == "power":
        if o.get("top") is not None:
            out["top"] = _int(o["top"], 3, 20, "how many")
        if o.get("ids") is not None:
            if not isinstance(o["ids"], list) or len(o["ids"]) > 30:
                raise Invalid("which devices: up to 30")
            out["ids"] = list(dict.fromkeys(_dev(x) for x in o["ids"]))
    if t == "modes" and o.get("style") in ("segmented", "chip"):
        out["style"] = o["style"]
    if t == "countdown" and o.get("date") is not None:
        if not isinstance(o["date"], str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", o["date"]):
            raise Invalid("countdown: a date")
        out["date"] = o["date"]
    if t == "bins":
        items = o.get("items", [])
        if not isinstance(items, list) or len(items) > 6:
            raise Invalid("bins: up to 6")
        out["items"] = []
        for b in items:
            if not isinstance(b, dict):
                raise Invalid("a bin")
            x = {"name": _text(b.get("name") or "Bin", 24, "bin name"), "day": _int(b.get("day"), 0, 6, "weekday"), "every": _int(b.get("every", 1), 1, 2, "every")}
            if isinstance(b.get("color"), str) and COLOR.fullmatch(b["color"]):
                x["color"] = b["color"]
            if b.get("from") is not None:
                if not isinstance(b["from"], str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", b["from"]):
                    raise Invalid("bins: a first date")
                x["from"] = b["from"]
            out["items"].append(x)
    if t == "timer" and o.get("presets") is not None:   # minutes
        if not isinstance(o["presets"], list) or not 1 <= len(o["presets"]) <= 6:
            raise Invalid("timer presets: 1 to 6")
        out["presets"] = [_int(m, 1, 240, "minutes") for m in o["presets"]]
    if t == "roomcams" and o.get("view") == "still":
        out["view"] = "still"
    if t == "camera" and o.get("view") in ("live", "still", "icon"):
        out["view"] = o["view"]
    if t == "roomdevs":
        if o.get("show") in ("lights", "switches", "fans", "shades", "all"):
            out["show"] = o["show"]
        if o.get("look") in ("list", "tiles"):
            out["look"] = o["look"]
    if t == "roomhead" and isinstance(o.get("allOff"), bool):
        out["allOff"] = o["allOff"]
    if t == "openings" and o.get("show") in ("both", "windows", "doors"):
        out["show"] = o["show"]
    if t == "temps" and o.get("show") in ("both", "inside", "outside"):
        out["show"] = o["show"]
    if t == "temps":   # its own sensors (none set: the panel's inside one and the house's outside one), or "none"
        for k, name in (("inside", "inside"), ("outside", "outside")):
            v = o.get(k)
            if v is None:
                continue
            if v != "none" and (not isinstance(v, int) or isinstance(v, bool) or not 0 < v < 10 ** 9):
                raise Invalid(f"the {name} temperature: pick its sensor again")
            out[k] = v
    if t == "thermostat":   # which thermostat (none: the house's), and the mode / fan buttons the owner ticked
        if o.get("id") is not None:
            if not isinstance(o["id"], int) or isinstance(o["id"], bool) or not 0 < o["id"] < 10 ** 9:
                raise Invalid("the thermostat card: pick its thermostat again")
            out["id"] = o["id"]
        for k, allowed, what in (("modes", THERMO_MODES, "modes"), ("fans", FAN_MODES, "fan modes")):
            v = o.get(k)
            if v is None:
                continue
            if not isinstance(v, list) or len(v) > len(allowed) or any(not isinstance(m, str) or m not in allowed for m in v):
                raise Invalid(f"the thermostat card's {what}: tick them again from the list")
            out[k] = list(dict.fromkeys(v))
        if o.get("look") in THERMO_LOOKS:   # (anything else: left out — the card keeps its style, like an unknown style)
            out["look"] = o["look"]
    if t in ("locks", "people") and o.get("ids") is not None:   # (only these; none = all of them)
        if not isinstance(o["ids"], list) or len(o["ids"]) > 30:
            raise Invalid("which ones: up to 30")
        out["ids"] = list(dict.fromkeys(_dev(x) for x in o["ids"]))
    if t == "spot":   # a picture with live values (when it moves, what a tap does, its rows) or a garage of 1-3 doors
        pic = o.get("pic")
        if pic is not None:
            if not isinstance(pic, str) or not (pic == "garage" or ICON.fullmatch(pic)):
                raise Invalid("picture")
            out["pic"] = pic
        if o.get("anim") in ("always", "on", "above", "is", "never"):
            out["anim"] = o["anim"]
            if o["anim"] in ("on", "above", "is"):
                out["aid"] = _dev(o.get("aid"), "moves when: device")
            if o["anim"] in ("above", "is"):
                if not isinstance(o.get("aat"), str) or not ATTR.fullmatch(o["aat"]):
                    raise Invalid("moves when: which value")
                out["aat"] = o["aat"]
            v = o.get("av")
            if o["anim"] == "above":
                if isinstance(v, bool) or not isinstance(v, (int, float)) or v != v or abs(v) > 1e9:
                    raise Invalid("moves when: above a number")
                out["av"] = v
            if o["anim"] == "is":
                if not isinstance(v, str) or not v.strip():
                    raise Invalid("moves when: equals")
                out["av"] = _text(v, 40, "moves when: equals")
        if o.get("tapdo") in ("none", "toggle", "values"):
            out["tapdo"] = o["tapdo"]
            if o["tapdo"] == "toggle":
                out["tid"] = _dev(o.get("tid"), "tap: which switch")
        if o.get("vpos") in ("beside", "below", "tap", "none"):
            out["vpos"] = o["vpos"]
        rows = o.get("rows", [])
        if not isinstance(rows, list) or len(rows) > 12:
            raise Invalid("values: up to 12")
        out["rows"] = []
        for r in rows:
            if not isinstance(r, dict):
                raise Invalid("a value row")
            x = {"id": _dev(r.get("id"), "value: device"), "as": r.get("as") if r.get("as") in ("value", "switch", "lock", "door") else "value"}
            if x["as"] == "value":
                if not isinstance(r.get("at"), str) or not ATTR.fullmatch(r["at"]):
                    raise Invalid("value: which reading")
                x["at"] = r["at"]
            if isinstance(r.get("label"), str) and r["label"].strip():
                x["label"] = _text(r["label"], 30, "value: name")
            out["rows"].append(x)
        if out.get("pic") == "garage":
            doors = o.get("doors", [])
            if not isinstance(doors, list) or len(doors) > 3:
                raise Invalid("garage: 1 to 3 doors")
            out["doors"] = []
            for d in doors:
                if not isinstance(d, dict):
                    raise Invalid("a garage door")
                x = {"id": _dev(d.get("id"), "garage door: opener")}
                if d.get("contact") is not None:
                    x["contact"] = _dev(d["contact"], "garage door: contact")
                if d.get("travel") is not None:
                    x["travel"] = _int(d["travel"], 3, 60, "garage door: travel time (s)")
                if d.get("label") is not None and _text(d["label"], 30, "garage door: name"):   # (optional: the PIN question names it)
                    x["label"] = _text(d["label"], 30, "garage door: name")
                out["doors"].append(x)
    if t == "group":   # several devices on one card, each with its own icon / name
        items = o.get("items", [])
        if not isinstance(items, list) or len(items) > 12:
            raise Invalid("devices: up to 12")
        out["items"] = []
        for it in items:
            if not isinstance(it, dict):
                raise Invalid("a device on the card")
            x = {"id": _dev(it.get("id"))}
            wh = wheel(it.get("wheel"))
            if wh:
                x["wheel"] = wh
            if it.get("icon") is not None:
                if not isinstance(it["icon"], str) or not ICON.fullmatch(it["icon"]):
                    raise Invalid("icon")
                x["icon"] = it["icon"]
            if isinstance(it.get("title"), str) and it["title"].strip():
                x["title"] = _text(it["title"], 40, "name")
            out["items"].append(x)
        if o.get("look") in ("list", "tiles"):
            out["look"] = o["look"]
    if t == "blank":   # the owner's own pieces, arranged on the card (later ones in front)
        parts = o.get("parts", [])
        if not isinstance(parts, list) or len(parts) > MAX_PIECES:
            raise Invalid(f"blank card: at most {MAX_PIECES} pieces")
        out["parts"] = [piece(p, n + 1) for n, p in enumerate(parts)]
    if USER_CARD.fullmatch(t):
        bind, sets = o.get("bind"), o.get("set")
        if bind is not None:
            if not isinstance(bind, dict) or len(bind) > 12:
                raise Invalid("card devices")
            out["bind"] = {}
            for k, v in bind.items():
                if not isinstance(k, str) or not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]{0,23}", k):
                    raise Invalid("card devices")
                out["bind"][k] = _dev(v)
        if sets is not None:
            if not isinstance(sets, dict) or len(sets) > 24:
                raise Invalid("card settings")
            out["set"] = {}
            for k, v in sets.items():
                if not isinstance(k, str) or not re.fullmatch(r"[a-zA-Z][a-zA-Z0-9_]{0,23}", k):
                    raise Invalid("card settings")
                out["set"][k] = v if isinstance(v, bool) else _value(v)
    return out


def piece(p, n):
    """One piece of a blank card: its kind, where it sits on the card's own 24 × 24 grid, and its settings."""
    if not isinstance(p, dict) or p.get("t") not in PIECES:
        raise Invalid(f"blank card: piece {n} is not a kind it knows")
    t, name = p["t"], PIECES[p["t"]]
    x, y = _int(p.get("x"), 0, INNER - 1, "blank card: a piece's place"), _int(p.get("y"), 0, INNER - 1, "blank card: a piece's place")
    out = {"t": t, "x": x, "y": y, "w": _int(p.get("w"), 1, INNER - x, "blank card: a piece's size"), "h": _int(p.get("h"), 1, INNER - y, "blank card: a piece's size")}
    if t in ("light", "switch", "value", "door", "lock") or (t == "icon" and p.get("id") is not None):
        if not isinstance(p.get("id"), int) or isinstance(p.get("id"), bool) or not 0 < p["id"] < 10 ** 9:
            raise Invalid(f"blank card: the {name} needs its device")
        out["id"] = p["id"]
    if t == "value":
        if not isinstance(p.get("at"), str) or not ATTR.fullmatch(p["at"]):
            raise Invalid("blank card: the value needs the reading to show")
        out["at"] = p["at"]
        if isinstance(p.get("unit"), str) and p["unit"].strip():
            out["unit"] = _text(p["unit"], 8, "unit")
    if t != "text" and isinstance(p.get("label"), str) and p["label"].strip():
        out["label"] = _text(p["label"], 30, "a piece's name")
    if t in ("icon", "light") and p.get("icon") is not None:
        if not isinstance(p["icon"], str) or not ICON.fullmatch(p["icon"]):
            raise Invalid("blank card: a piece's picture")
        out["icon"] = p["icon"]
    if t in ("icon", "light", "switch") and out.get("id"):
        wh = wheel(p.get("wheel"))
        if wh:
            out["wheel"] = wh
    if t == "garage":
        doors = p.get("doors", [])
        if not isinstance(doors, list) or not 1 <= len(doors) <= 3:
            raise Invalid("blank card: a garage has 1 to 3 doors")
        out["doors"] = []
        for d in doors:
            if not isinstance(d, dict) or not isinstance(d.get("id"), int) or isinstance(d.get("id"), bool) or not 0 < d["id"] < 10 ** 9:
                raise Invalid("blank card: a garage door needs its opener")
            x2 = {"id": d["id"]}
            if d.get("contact") is not None:
                x2["contact"] = _dev(d["contact"], "garage door: contact")
            if d.get("travel") is not None:
                x2["travel"] = _int(d["travel"], 3, 60, "garage door: travel time (s)")
            if d.get("label") is not None and _text(d["label"], 30, "garage door: name"):   # (optional: the PIN question names it)
                x2["label"] = _text(d["label"], 30, "garage door: name")
            out["doors"].append(x2)
    if t == "text":
        if not isinstance(p.get("text", ""), str):
            raise Invalid("blank card: the text")
        out["text"] = _plain(p.get("text", ""), 200, lines=True)
        if p.get("size") in ("s", "m", "l", "xl"):
            out["size"] = p["size"]
        if p.get("align") in ("left", "center", "right"):
            out["align"] = p["align"]
        if p.get("bold") is True:
            out["bold"] = True
    return out


def card(c, cols, rows):
    if not isinstance(c, dict):
        raise Invalid("a card")
    if not isinstance(c.get("i"), str) or not ID.fullmatch(c["i"]):
        raise Invalid("card id")
    t = c.get("t")
    if not isinstance(t, str) or not (t in BUILTIN or USER_CARD.fullmatch(t)):
        raise Invalid("card type")
    x, y = _int(c.get("x"), 0, cols - 1, "x"), _int(c.get("y"), 0, rows - 1, "y")
    w, h = _int(c.get("w"), 1, cols - x, "width"), _int(c.get("h"), 1, rows - y, "height")
    out = {"i": c["i"], "t": t, "x": x, "y": y, "w": w, "h": h, "s": style(c.get("s")), "o": options(t, c.get("o"))}
    if c.get("z") is not None:   # stacking (a grid that allows overlap): higher = in front
        out["z"] = _int(c["z"], 0, 99, "stacking")
    for k in ("tap", "hold", "dbl"):
        a = action(c.get(k))
        if a:
            out[k] = a
    for k in ("show", "hi"):
        r = rules(c.get(k))
        if r:
            out[k] = r
    if out.get("hi") and isinstance(c.get("hic"), str) and COLOR.fullmatch(c["hic"]):
        out["hic"] = c["hic"]
    return out


def card_devices(settings):
    """The device ids a panel's layouts may send commands to (its Home grid and its rooms' grids, as the Manager saved
    them): tap / hold / double-tap and wheel actions, a device card's own device, a "Devices" card's devices. The bridge
    allows these too (card-devices.json) — the owner put them there; its never-switch list still wins."""
    s = settings if isinstance(settings, dict) else {}
    rooms = s.get("roomGrids") if isinstance(s.get("roomGrids"), dict) else {}
    out = set()
    def acts(x):
        for k in ("tap", "hold", "dbl"):
            a = x.get(k)
            if isinstance(a, dict) and isinstance(a.get("id"), int) and not isinstance(a.get("id"), bool):
                out.add(a["id"])
        for w in x.get("wheel") or [] if isinstance(x.get("wheel"), list) else []:
            if isinstance(w, dict) and isinstance(w.get("id"), int) and not isinstance(w.get("id"), bool):
                out.add(w["id"])
    for g in [s.get("homeGrid"), *rooms.values()]:
        if not isinstance(g, dict) or not isinstance(g.get("cards"), list):
            continue
        for c in g["cards"]:
            if not isinstance(c, dict):
                continue
            o = c.get("o") if isinstance(c.get("o"), dict) else {}
            acts(c)
            acts(o)
            if c.get("t") in ("device", "button", "lock", "garage", "player", "fan", "thermostat") and isinstance(o.get("id"), int) and not isinstance(o.get("id"), bool):
                out.add(o["id"])
            for it in o.get("items") or [] if isinstance(o.get("items"), list) else []:
                if isinstance(it, dict) and isinstance(it.get("id"), int) and not isinstance(it.get("id"), bool):
                    out.add(it["id"])
                    acts(it)
                if isinstance(it, dict) and isinstance(it.get("a"), dict):   # (a scene button's action)
                    acts({"tap": it["a"]})
            # a Picture & values card's switches / locks / garage doors / tap switch, a blank card's pieces
            ids = [o.get("tid")]
            for r in o.get("rows") or [] if isinstance(o.get("rows"), list) else []:
                if isinstance(r, dict) and r.get("as") in ("switch", "lock"):
                    ids.append(r.get("id"))
            for p in [o, *(o.get("parts") or [] if isinstance(o.get("parts"), list) else [])]:
                if not isinstance(p, dict):
                    continue
                if p is not o and p.get("t") in ("icon", "light", "switch", "lock"):
                    ids.append(p.get("id"))
                    acts(p)
                ids += [d.get("id") for d in p.get("doors") or [] if isinstance(d, dict)] if isinstance(p.get("doors"), list) else []
            out.update(i for i in ids if isinstance(i, int) and not isinstance(i, bool))
    return {i for i in out if 0 < i < 10 ** 9}


def card_refs(c):
    """(v2.9.1) The devices ONE card shows or switches — read from its type's own device fields only (as options()
    and piece() store them): its device (device / value / lock / garage / player / fan / button), the tap / hold /
    double-tap and wheel actions, a group's items, Picture & values' rows, moving-when device, tap switch and garage
    doors (opener and contact), the power / locks / people lists, the energy flow's meters, a blank card's pieces and
    their bindings. Never just any number that happens to sit under an "id" (a rule's condition, a list, a camera…)."""
    out = set()
    if not isinstance(c, dict):
        return out
    def take(v):
        if isinstance(v, int) and not isinstance(v, bool) and 0 < v < 10 ** 9:
            out.add(v)
    def acts(x):
        for k in ("tap", "hold", "dbl"):
            if isinstance(x.get(k), dict):
                take(x[k].get("id"))
        for w in x.get("wheel") or [] if isinstance(x.get("wheel"), list) else []:
            if isinstance(w, dict):
                take(w.get("id"))
    t = c.get("t")
    o = c.get("o") if isinstance(c.get("o"), dict) else {}
    acts(c)
    acts(o)
    if t in ("device", "value", "lock", "garage", "player", "fan", "button", "thermostat"):
        take(o.get("id"))
    if t in ("power", "locks", "people") and isinstance(o.get("ids"), list):
        for x in o["ids"]:
            take(x)
    if t == "energy":
        for k in ("solar", "grid", "battery", "home"):
            take(o.get(k))
    if t == "spot":
        take(o.get("aid"))
        take(o.get("tid"))
        for r in o.get("rows") or [] if isinstance(o.get("rows"), list) else []:
            if isinstance(r, dict):
                take(r.get("id"))
    for it in o.get("items") or [] if isinstance(o.get("items"), list) else []:
        if not isinstance(it, dict):
            continue
        if t == "group":
            take(it.get("id"))
            acts(it)
        if isinstance(it.get("a"), dict):   # (a scene button's action: {do, id})
            take(it["a"].get("id"))
    for p in [o, *(o.get("parts") or [] if isinstance(o.get("parts"), list) else [])]:
        if not isinstance(p, dict):
            continue
        if p is not o and p.get("t") in ("icon", "light", "switch", "lock", "value"):
            take(p.get("id"))
            acts(p)
        for d in p.get("doors") or [] if isinstance(p.get("doors"), list) else []:
            if isinstance(d, dict):
                take(d.get("id"))
                take(d.get("contact"))
        if isinstance(p.get("bind"), dict):
            for v in p["bind"].values():
                take(v)
    return out


def grid(v):
    """A whole grid layout, made safe (Invalid on anything wrong — nothing is saved then)."""
    if not isinstance(v, dict):
        raise Invalid("a grid layout")
    # version 2: a fine grid (192 × 128; the first builds used 96 × 64) with no gaps between cells, each card inset by half the gap — cards
    # move almost freely (the builder's "Snap to grid" steps by 4); version 1: the old columns × rows with gaps
    fine = v.get("v") == 2
    cols, rows = _int(v.get("cols", 12), 4, 192 if fine else 24, "columns"), _int(v.get("rows", 8), 3, 128 if fine else 16, "rows")
    gap = _int(v.get("gap", 14), 0, 40, "gap")
    cards = v.get("cards", [])
    if not isinstance(cards, list) or len(cards) > MAX_CARDS:
        raise Invalid(f"at most {MAX_CARDS} cards")
    out, seen = [], set()
    for c in cards:
        c = card(c, cols, rows)
        if c["i"] in seen:
            raise Invalid("two cards with the same id")
        seen.add(c["i"])
        out.append(c)
    g = {"v": 2 if fine else 1, "cols": cols, "rows": rows, "gap": gap, "cards": out}
    for k in ("ov", "join", "sp"):   # ov: may overlap; join: overlapping edges look like one; sp: the gap is spacing, not an inset
        if v.get(k) is True:
            g[k] = True
    scr = v.get("scr")
    if scr is not None:   # the screen the owner designed it for (the editor's canvas; the panel fills its own)
        if not isinstance(scr, dict):
            raise Invalid("screen size")
        g["scr"] = {"w": _int(scr.get("w"), 240, 4096, "screen width"), "h": _int(scr.get("h"), 240, 4096, "screen height")}
    return g

