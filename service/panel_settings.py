"""The panel settings the Manager page changes per panel (stage 5): its name and FreeKiosk name, the
rooms and devices it shows, its cameras / views, its people and calendars, its alerts, the guest Wi-Fi card.

Each is a path inside the panel's "settings" (the same places the panel's own Settings used, so nothing on the panel
had to move): the Manager sends {path: value}, `check()` makes it safe, the server writes just those paths
(Store.modify) and tells the panel, which takes them (store.js merges by path — its own unsaved changes stay).
Anything not listed here can't be changed from the Manager.
"""
import re

try:
    from service import house_model, layouts
except ImportError:  # pragma: no cover
    import house_model
    import layouts


class Invalid(ValueError):
    pass


def _text(n):
    def f(v):
        if not isinstance(v, str):
            raise Invalid("text")
        v = house_model.safe_text(v, n)
        return v
    return f


def _pattern(rx, what):
    def f(v):
        if not isinstance(v, str) or not re.fullmatch(rx, v):
            raise Invalid(what)
        return v
    return f


def _one_of(*opts):
    def f(v):
        if v not in opts or isinstance(v, bool):
            raise Invalid("one of " + ", ".join(map(str, opts)))
        return v
    return f


def _bool(v):
    if not isinstance(v, bool):
        raise Invalid("true / false")
    return v


def _int(lo, hi):
    def f(v):
        if not isinstance(v, int) or isinstance(v, bool) or not lo <= v <= hi:
            raise Invalid(f"a whole number {lo}..{hi}")
        return v
    return f


def _flags(key_rx, limit):
    """A change to a list of switches: {key: true / false} (merged into the stored list by apply(): false = taken out,
    so the Manager and the panel each changing one switch never undo each other)."""
    def f(v):
        if not isinstance(v, dict) or len(v) > limit:
            raise Invalid("a list of switches")
        for k, on in v.items():
            if not isinstance(k, str) or not re.fullmatch(key_rx, k) or not isinstance(on, bool):
                raise Invalid("a list of switches")
        return dict(v)
    f.merge = True
    return f


COLOR = r"#[0-9a-fA-F]{6}"
# the colour themes (dashboard/layouts/v4/shared/themes.js)
THEMES = ("purple", "blue", "teal", "rose", "amber", "green", "midnight", "ocean", "sunset", "forest", "graphite", "crimson")
# (v3.0.2) "custom": the owner's own colour — Purple turned to look.hue (0–359; themes.js themeFromHue, CUSTOM_HUE there too)
CUSTOM_HUE = 200
VIEW_ID = r"[A-Za-z0-9_.:-]{1,80}"


def _names(v):
    """A change to the view names: {view id: name} ("" = back to Protect's name), merged like _flags."""
    if not isinstance(v, dict) or len(v) > 200:
        raise Invalid("names")
    out = {}
    for k, n in v.items():
        if not isinstance(k, str) or not re.fullmatch(VIEW_ID, k) or not isinstance(n, str):
            raise Invalid("names")
        out[k] = house_model.safe_text(n, 40)
    return out


_names.merge = True


def _room_lists(v):
    """A change to {room id: [device ids]} ([] = that room's list removed), merged like _flags."""
    if not isinstance(v, dict) or len(v) > 100:
        raise Invalid("rooms with device lists")
    out = {}
    for k, ids in v.items():
        if not isinstance(k, str) or not re.fullmatch(r"[a-z0-9-]{1,60}", k) or not isinstance(ids, list) or len(ids) > 50 \
                or not all(isinstance(i, int) and not isinstance(i, bool) and 0 <= i < 10 ** 9 for i in ids):
            raise Invalid("rooms with device lists")
        out[k] = list(dict.fromkeys(ids))
    return out


_room_lists.merge = True


def _device_order(v):
    """{room id: [device ids]} like _room_lists, but a whole room's order (a room of your own may hold 200)."""
    if not isinstance(v, dict) or len(v) > 100:
        raise Invalid("rooms with device orders")
    out = {}
    for k, ids in v.items():
        if not isinstance(k, str) or not re.fullmatch(r"[a-z0-9-]{1,60}", k) or not isinstance(ids, list) or len(ids) > 300 \
                or not all(isinstance(i, int) and not isinstance(i, bool) and 0 <= i < 10 ** 9 for i in ids):
            raise Invalid("rooms with device orders")
        out[k] = list(dict.fromkeys(ids))
    return out


_device_order.merge = True


def _room_order(v):
    if not isinstance(v, list) or len(v) > 300 or not all(isinstance(x, str) and re.fullmatch(r"[a-z0-9-]{1,60}", x) for x in v):
        raise Invalid("an order of rooms")
    return list(dict.fromkeys(v))


def _room_layouts(v):
    """A change to {room id: layout} ("" = back to the panel's), merged like _flags."""
    if not isinstance(v, dict) or len(v) > 300:
        raise Invalid("rooms with layouts")
    for k, lay in v.items():
        if not isinstance(k, str) or not re.fullmatch(r"[a-z0-9-]{1,60}", k) or lay not in ("", "G", "classic", "list", "custom"):
            raise Invalid("rooms with layouts")
    return dict(v)


_room_layouts.merge = True


def _grid(v):
    """The Home page's own grid of cards (the layout builder, service/layouts.py)."""
    try:
        return layouts.grid(v)
    except layouts.Invalid as e:
        raise Invalid(str(e)) from None


def _room_grids(v):
    """A change to the rooms' own grids of cards: {room id or "*" (every room without its own): grid, or "" = gone},
    merged like _flags. Each grid is checked like the Home page's."""
    if not isinstance(v, dict) or len(v) > 80:
        raise Invalid("rooms with their own layout")
    out = {}
    for k, g in v.items():
        if not isinstance(k, str) or not re.fullmatch(r"\*|[a-z0-9-]{1,60}", k):
            raise Invalid("a room")
        out[k] = "" if g in ("", None) else _grid(g)
    return out


_room_grids.merge = True


def _modes(v):
    """Hubitat modes (names) that make this panel quiet (Hubitat alerts: no sound below level 5)."""
    if not isinstance(v, list) or len(v) > 12 or not all(isinstance(x, str) and 0 < len(x.strip()) <= 40 for x in v):
        raise Invalid("up to 12 Hubitat mode names, each at most 40 characters, with commas between them")
    return list(dict.fromkeys(house_model.safe_text(x.strip(), 40) for x in v))


def _inside(v):
    if v in ("panel", "none") or (isinstance(v, int) and not isinstance(v, bool) and 0 < v < 10 ** 9):
        return v
    raise Invalid('"panel", "none" or a sensor id')


def _url(v):
    if isinstance(v, str):   # (v3.0.2: "192.168.1.20" was refused — a bare address gets its http://)
        v = v.strip()
        if v and not re.match(r"[A-Za-z][A-Za-z0-9+.-]*://", v) and re.fullmatch(r"[A-Za-z0-9.\[\]:-]{1,253}(/[^\s\"'<>\\`]*)?", v):
            v = "http://" + v
    if not isinstance(v, str) or (v and not re.fullmatch(r"""https?://[^\s"'<>\\`]{1,300}""", v)):
        raise Invalid("an address like http://192.168.1.50/ (or empty)")
    return v


def _order(v):
    if not isinstance(v, list) or len(v) > 200 or not all(isinstance(x, str) and re.fullmatch(VIEW_ID, x) for x in v):
        raise Invalid("an order of views")
    return list(dict.fromkeys(v))


ICON_CHOICE = re.compile(r"ic:[A-Za-z0-9]{1,40}|up:[0-9a-f]{16}")   # a built-in line icon (takes the colour) or an own picture


def _icon(v):
    return v if isinstance(v, str) and ICON_CHOICE.fullmatch(v) else None


def _people(v):
    if not isinstance(v, list) or len(v) > 20:
        raise Invalid("people")
    out = []
    for p in v:
        if not isinstance(p, dict) or not isinstance(p.get("id"), int) or isinstance(p.get("id"), bool):
            raise Invalid("people")
        out.append({"id": p["id"], "name": house_model.safe_text(str(p.get("name") or ""), 40) or "?",
                    "color": p["color"] if isinstance(p.get("color"), str) and re.fullmatch(COLOR, p["color"]) else "#8b5cf6",
                    "image": None, **({"icon": _icon(p.get("icon"))} if _icon(p.get("icon")) else {})})
    return out


def _calendars(v):
    if not isinstance(v, list) or len(v) > 20:
        raise Invalid("calendars")
    out = []
    for c in v:
        if not isinstance(c, dict) or not isinstance(c.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", c["id"]):
            raise Invalid("calendars")
        # (a house calendar's entry — Manager → Settings → Calendars, linked by id — may leave out its colour: the
        # house's default colour is used then, and follows a change of it)
        out.append({"id": c["id"], "name": house_model.safe_text(str(c.get("name") or ""), 60) or c["id"],
                    **({"color": c["color"]} if isinstance(c.get("color"), str) and re.fullmatch(COLOR, c["color"]) else {}),
                    "on": c.get("on") is not False, **({"icon": _icon(c.get("icon"))} if _icon(c.get("icon")) else {})})
    return out


# (v3.0.0) the languages a panel can be set to (BCP 47; a translation adds its code here and its file
# dashboard/layouts/v4/shared/strings/<code>.js) — English only in 3.0
PANEL_LANGS = ("en",)

PATHS = {
    "panelName": _text(40),
    "language": _one_of(*PANEL_LANGS),            # (v3.0.0) the panel's language (PANEL_LANG in its page; default "en")
    "kioskName": _pattern(r"[a-z0-9_-]{1,40}", "use lowercase letters, digits, _ and - (at most 40)"),
    "hiddenRooms": _flags(r"[a-z0-9-]{1,60}", 500),
    "hiddenDevices": _flags(r"\d{1,9}", 3000),
    "extraDevices": _room_lists,
    "deviceOrder": _device_order,                 # {room id: [device ids]}: the order on that room's page

    "roomOrder": _room_order,                     # the room buttons' order (room ids)
    "arrangeOnPanel": _bool,                      # also press-and-hold arranging on the panel itself
    "ledStrip": _bool,                            # the tablet has our LED strip (panel agent)
    "look.theme": _one_of(*THEMES, "custom"),
    "look.hue": _int(0, 359),                     # (v3.0.2) theme "custom"'s colour on the colour wheel
    "look.background": _pattern(r"mountains|lake|desert|forest|coast|city|hills|peaks|canyon|tropical|dunes|up:[0-9a-f]{16}", "a background"),
    "look.sky": _one_of("on", "still", "off"),
    "look.skyColors": _one_of("theme", "real"),
    "effects.place": _one_of("front", "behind"),
    "homeLayout": _one_of("classic", "agenda", "duo", "security", "minimal", "custom"),
    "homeGrid": _grid,                            # "custom": the owner's grid of cards (the layout builder)
    "roomLayout": _one_of("G", "classic", "list", "custom"),
    "roomGrids": _room_grids,                     # "custom": each room's own grid of cards (the layout builder)
    "roomLayouts": _room_layouts,
    "dockAt": _one_of("bottom", "top", "left", "right"),
    "dockOff": _bool,                             # no room bar at all (a new panel: nothing but the settings gear)
    "dockStyle": _one_of("pill", "rail", "segmented", "tabs", "chips", "split"),   # how the room bar is drawn (theme.css)
    "dockLabels": _bool,                          # its names under / beside the icons (unset: the style's own — a rail has none)
    "dockAutoHide": _bool,                        # folded to a small handle until tapped
    "homeAfter": _int(0, 3600),                   # s untouched before a room / camera page goes back to Home (0 = never)
    "insideSensor": _inside,                      # "panel" | "none" | a Hubitat sensor's id

    "people": _people,
    "calendars": _calendars,
    "alertBeeps": _bool,
    "allowUnlock": _bool,                         # locks the owner allowed may be unlocked here (with the panel PIN)
    # alerts from Hubitat rules — the only alerts (the Skypane Notifier, release 2: hubalerts.js). The panel's own alert
    # rules went in v2.3 (alertsShow, alertLevel5, alertsOff, freezerMax: OLD_KEYS — still in old saves, ignored)
    "alertMinLevel": _one_of(1, 2, 3, 4, 5),      # the lowest level shown here (a level 5 always)
    "quietFrom": _int(-1, 23),                    # quiet hours (-1 = none): no sound below level 5
    "quietTo": _int(-1, 23),
    "quietModes": _modes,                         # … or while Hubitat is in one of these modes (the mode wins)
    "quietLevel4": _bool,                         # a level 4 sounds in quiet hours too (unset = yes); a level 5 always
    "alertSilence": _bool,                        # level 4–5 full screen: "Silence" without the PIN (unset = no)
    "pinAlarmSeconds": _int(0, 3600),             # the PIN window for arm / disarm / dismissing 4–5: s from the PIN (0 = never relocks)
    "pinGeneralSeconds": _int(0, 3600),           # … for everything else: s without a touch (0 = never relocks)

    "notifyLight": _int(0, 10 ** 9 - 1),          # a light / light group that pulses during alerts (0 = none)
    "cameras.hiddenViews": _flags(VIEW_ID, 200),
    "cameras.viewNames": _names,
    "cameras.viewOrder": _order,
    "cameras.autoSeconds": _one_of(30, 60, 120),
    "cameras.liveMax": _one_of(4, 6, 9, 16),
    "cameras.snapEvery": _one_of(2, 3, 5, 10),
    "cameras.audioTimeout": _one_of(30, 60, 120),
    "guest.show": _one_of("always", "off", "guestMode"),
    "music.url": _url,
    "cameras.go2rtc": _url,
    "effects.maxLoad": _one_of(0, 1, 2, 3, 4),   # the heaviest weather effect (0 = auto, measured on the tablet)
    "units.temp": _one_of("F", "C"),              # (v3.0.0) how this panel shows temperatures (unset: °F)
    "units.wind": _one_of("mph", "km/h"),         # … and wind speeds (unset: mph)
}


# settings that no longer exist (a panel's old save may still have them): never read, never an error
OLD_KEYS = ("alertsShow", "alertLevel5", "alertsOff", "freezerMax", "pinUnlockSeconds")

# every alert setting of a panel and its PIN windows: only the admin, in the Manager — a panel's
# own save never sets them (not even before they're set: the panel's defaults apply), a non-admin login neither
ADMIN_ONLY = ("alertMinLevel", "quietFrom", "quietTo", "quietModes", "quietLevel4", "alertBeeps", "notifyLight",
              "alertSilence", "pinAlarmSeconds", "pinGeneralSeconds")


# the ones a panel's own save may not change once set (server.py _patch): all but the guest card's show / hide, which
# a house without a UniFi console still sets on the panel itself
# (the room page hides devices too; the weather effects stay the panel's own too)
# (the order of rooms / devices too: the panel can still arrange on the wall)
PANEL_LOCKED = tuple(p for p in PATHS if p not in ("guest.show", "hiddenDevices", "effects.maxLoad", "deviceOrder", "roomOrder",
                                                   "look.theme", "look.hue", "roomLayout", "look.background", "look.sky", "look.skyColors",
                                                   "effects.place", "homeAfter"))   # (the panel's own Settings set these too)




# what each setting is called on the Manager's pages (refusals name it like this, never by its id)
LABELS = {"panelName": "Name", "language": "Language", "kioskName": "FreeKiosk device name", "hiddenRooms": "Hidden rooms", "hiddenDevices": "Hidden devices",
          "extraDevices": "Devices from other rooms", "deviceOrder": "Device order", "roomOrder": "Room order",
          "arrangeOnPanel": "Arrange on the panel", "ledStrip": "LED strip", "look.theme": "Theme", "look.hue": "Custom colour", "look.background": "Background",
          "look.sky": "Animated sky", "look.skyColors": "Sky colours", "effects.place": "Weather effects", "homeLayout": "Home layout",
          "homeGrid": "Home layout", "roomLayout": "Room layout", "roomGrids": "Room layouts", "roomLayouts": "Room layouts",
          "dockAt": "Room bar", "dockOff": "Room bar hidden", "dockStyle": "Room bar style",
          "dockLabels": "Room bar names", "dockAutoHide": "Room bar auto-hide", "homeAfter": "Back to Home after", "insideSensor": "Inside temperature from", "people": "People",
          "calendars": "Calendars", "alertBeeps": "Alert beeps", "allowUnlock": "Unlocking",
          "alertMinLevel": "Lowest alert level", "quietFrom": "Quiet hours", "quietTo": "Quiet hours",
          "quietModes": "Quiet in these modes", "quietLevel4": "Level 4 sounds in quiet hours", "alertSilence": "Silence without the PIN",
          "pinAlarmSeconds": "Alarm PIN window", "pinGeneralSeconds": "PIN window for everything else",
          "notifyLight": "Notification light", "cameras.hiddenViews": "Hidden camera views", "cameras.viewNames": "Camera view names",
          "cameras.viewOrder": "Camera view order", "cameras.autoSeconds": "Camera pop-up time", "cameras.liveMax": "Live cameras",
          "cameras.snapEvery": "Snapshot time", "cameras.audioTimeout": "Camera sound time", "guest.show": "Guest Wi-Fi card",
          "music.url": "Music page", "cameras.go2rtc": "Separate go2rtc", "effects.maxLoad": "Heaviest weather effect",
          "units.temp": "Temperature unit", "units.wind": "Wind speed unit"}


def check(changes):
    """{path: value} → {path: safe value}; Invalid on an unknown path or a bad value (nothing is saved then)."""
    if not isinstance(changes, dict) or not changes or len(changes) > 20:
        raise Invalid("nothing to change")
    out = {}
    for path, value in changes.items():
        if path not in PATHS:
            raise Invalid("That setting can't be changed here")
        try:
            out[path] = PATHS[path](value)
        except Invalid as e:
            raise Invalid(f"{LABELS.get(path, 'This setting')}: {e}") from None
    return out


def apply(settings, changes):
    """The panel's settings with the (checked) changes put in at their paths."""
    s = dict(settings) if isinstance(settings, dict) else {}
    for path, value in changes.items():
        keys = path.split(".")
        node = s
        for k in keys[:-1]:
            node[k] = dict(node[k]) if isinstance(node.get(k), dict) else {}
            node = node[k]
        if getattr(PATHS[path], "merge", False):   # a change to a list: merged into what's stored
            cur = dict(node.get(keys[-1]) or {}) if isinstance(node.get(keys[-1]), dict) else {}
            for k, v in value.items():
                if v is False or v == "" or v == []:
                    cur.pop(k, None)
                else:
                    cur[k] = v
            node[keys[-1]] = cur
        else:
            node[keys[-1]] = value
    return s


def put(settings, values):
    """The settings with each path set to exactly the given value (no merging) — for keeping stored values."""
    s = dict(settings) if isinstance(settings, dict) else {}
    for path, value in values.items():
        keys = path.split(".")
        node = s
        for k in keys[:-1]:
            node[k] = dict(node[k]) if isinstance(node.get(k), dict) else {}
            node = node[k]
        node[keys[-1]] = value
    return s


def screen_unset(sent, stored):
    """A panel's own save (the open route) for the Manager's paths not set yet: each value sent is checked like a Manager
    change, kept made-safe, or dropped when it isn't valid — the open route can't store what the Manager would refuse
    (e.g. a layout grid the panel draws as HTML)."""
    old = managed(stored)
    out = dict(sent) if isinstance(sent, dict) else {}
    for k in OLD_KEYS:   # (an old save's settings that no longer exist: dropped, never refused)
        out.pop(k, None)
    cur = managed(out)
    for path in PANEL_LOCKED:
        if old[path] is not None or cur[path] is None:
            continue
        if path in ("homeGrid", "roomGrids") or path in ADMIN_ONLY:   # (layouts: the Manager only — the bridge allows
            # what's on them; the alert settings and PIN windows: the admin's only)
            keys = path.split(".")
            node = out
            for k in keys[:-1]:
                node = node.get(k) if isinstance(node.get(k), dict) else {}
            node.pop(keys[-1], None)
            continue
        try:
            good = PATHS[path](cur[path])
        except (Invalid, TypeError, ValueError):
            good = None
        keys = path.split(".")
        node = out
        for k in keys[:-1]:
            node[k] = dict(node[k]) if isinstance(node.get(k), dict) else {}
            node = node[k]
        if good is None:
            node.pop(keys[-1], None)
        else:
            node[keys[-1]] = good
    return out


def migrate_pin_window(settings):
    """The old single PIN window (pinUnlockSeconds: s without a touch, 0 = ask every time — until v2.2.0) → the general
    window (pinGeneralSeconds; 0 now means "never relocks", so an old 0 becomes 15 s, the shortest choice). The settings
    with it moved, or None when there's nothing to move."""
    if not isinstance(settings, dict) or "pinUnlockSeconds" not in settings:
        return None
    s = {k: v for k, v in settings.items() if k != "pinUnlockSeconds"}
    old = settings["pinUnlockSeconds"]
    if "pinGeneralSeconds" not in s and isinstance(old, int) and not isinstance(old, bool) and 0 <= old <= 3600:
        s["pinGeneralSeconds"] = old or 15
    return s


def managed(settings):
    """The Manager's view of a panel: the values of every path (None = the panel's default)."""
    s = settings if isinstance(settings, dict) else {}
    out = {}
    for path in PATHS:
        node = s
        for k in path.split("."):
            node = node.get(k) if isinstance(node, dict) else None
        out[path] = node
    return out


THUMB_CARDS = 60   # (a page holds at most 60 cards: layouts.py)


def thumbnail(settings):
    """What the Manager draws a panel's small map from (v2.5.0, Panels → Status: the cards as blocks in the panel's
    theme, the room bar on its edge — the decision 3, no screenshots): {theme, hue (v3.0.2: theme "custom"'s), background, layout, dockAt,
    dockOff, dockStyle, grid: {cols, rows, scr: {w, h}?, cards: [[x, y, w, h, type, flags]…]} or None} — flags: "s" a
    camera as a still, "i" as an icon, "a" an animated drawing (the load estimate). Only shapes and names of kinds —
    nothing a card shows (no device, no text, no picture)."""
    m = managed(settings)
    pick = lambda v, ok, d: v if v in ok else d  # noqa: E731
    out = {"theme": pick(m["look.theme"], THEMES + ("custom",), "purple"),
           "hue": m["look.hue"] if isinstance(m["look.hue"], int) and not isinstance(m["look.hue"], bool) and 0 <= m["look.hue"] <= 359 else CUSTOM_HUE,
           "background": m["look.background"] if isinstance(m["look.background"], str)
           and re.fullmatch(r"[a-z]{1,20}|up:[0-9a-f]{16}", m["look.background"]) else "mountains",
           "layout": pick(m["homeLayout"], ("classic", "agenda", "duo", "security", "minimal", "custom"), "classic"),
           "dockAt": pick(m["dockAt"], ("bottom", "top", "left", "right"), "bottom"),
           "dockOff": m["dockOff"] is True,
           "dockStyle": pick(m["dockStyle"], ("pill", "rail", "segmented", "tabs", "chips", "split"), "pill"),
           "maxLoad": m["effects.maxLoad"] if m["effects.maxLoad"] in (1, 2, 3, 4) and not isinstance(m["effects.maxLoad"], bool) else 0,
           "grid": None}
    g = m["homeGrid"]
    if isinstance(g, dict) and isinstance(g.get("cards"), list):
        whole = lambda v, hi: isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= hi  # noqa: E731
        cols = g.get("cols") if whole(g.get("cols"), 400) and g.get("cols") else 12
        rows = g.get("rows") if whole(g.get("rows"), 400) and g.get("rows") else 8
        cards = []
        for c in g["cards"][:THUMB_CARDS]:
            if isinstance(c, dict) and all(whole(c.get(k), 400) for k in ("x", "y", "w", "h")):
                t = c.get("t") if isinstance(c.get("t"), str) and re.fullmatch(r"[a-z]{1,16}|card:[a-z0-9-]{1,40}|tpl:[a-z0-9]{1,24}", c.get("t")) else ""
                o = c.get("o") if isinstance(c.get("o"), dict) else {}
                # (what the load estimate needs: a camera shown as a still or an icon, an animated drawing)
                flags = ("s" if o.get("view") == "still" else "i" if o.get("view") == "icon" else "") \
                    + ("a" if isinstance(o.get("icon"), str) and o["icon"].startswith("art:") else "")
                cards.append([c["x"], c["y"], c["w"], c["h"], t, flags])
        scr = g.get("scr")
        out["grid"] = {"cols": cols, "rows": rows, "cards": cards,
                       **({"scr": {"w": scr["w"], "h": scr["h"]}} if isinstance(scr, dict) and whole(scr.get("w"), 8192) and whole(scr.get("h"), 8192)
                          and scr["w"] >= 240 and scr["h"] >= 240 else {})}
    return out


def _perf_test(t):
    """The last performance test's numbers (app.js App.perfTest), made safe: fps per level, cameras, the advice."""
    if not isinstance(t, dict):
        return None
    num = lambda v, lo, hi: round(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi else None  # noqa: E731
    fx = t.get("fx") if isinstance(t.get("fx"), dict) else {}
    cams = []
    for c in (t.get("cams") if isinstance(t.get("cams"), list) else [])[:4]:
        if isinstance(c, dict) and num(c.get("n"), 1, 16):
            cams.append({"n": num(c.get("n"), 1, 16), "fps": num(c.get("fps"), 0, 1000), "dropped": num(c.get("dropped"), 0, 100),
                         "view": house_model.safe_text(c["view"], 40) if isinstance(c.get("view"), str) else ""})
    return {"at": num(t.get("at"), 0, 1e14), "fx": {k: num(fx[k], 0, 1000) for k in ("1", "2", "3", "4") if num(fx.get(k), 0, 1000) is not None},
            "best": num(t.get("best"), 0, 4) or 0, "cams": cams, "stopped": t.get("stopped") is True}


def _bench(b):
    """The full benchmark's numbers (bench.js, version 2: costs in ms of average frame time), made safe: only numbers,
    each within its range. Version 1 (costs from the slowest frames, wrong on 60 Hz screens) is
    dropped — the Manager asks for a new run."""
    if not isinstance(b, dict) or b.get("v") != 2:
        return None
    def num(v, lo, hi, nd=0):
        if isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi:
            return round(v, nd) if nd else round(v)
        return None
    def rows(v, n, cols):
        out = []
        for r in (v if isinstance(v, list) else [])[:n]:
            if isinstance(r, list) and len(r) == len(cols):
                vals = [num(x, lo, hi, nd) for x, (lo, hi, nd) in zip(r, cols)]
                if None not in vals:
                    out.append(vals)
        return out
    costs = b.get("costs") if isinstance(b.get("costs"), dict) else {}
    codecs = b.get("codecs") if isinstance(b.get("codecs"), dict) else {}
    base = b.get("base") if isinstance(b.get("base"), dict) else {}
    fx = b.get("fxMs") if isinstance(b.get("fxMs"), list) and len(b["fxMs"]) == 5 else []
    out = {"v": 2, "at": num(b.get("at"), 0, 1e14), "refresh": num(b.get("refresh"), 1, 500), "limit": num(b.get("limit"), 1, 1000, 2),
           "mode": b["mode"] if b.get("mode") in ("quick", "thorough") else "quick",
           "iv": num(b.get("iv"), 1, 1000, 2), "empty": num(b.get("empty"), 0, 10000, 2), "budgetMs": num(b.get("budgetMs"), 0, 1000, 3),
           "fxMs": [num(x, 0, 10000, 3) or 0 for x in fx] if fx else [0, 0, 0, 0, 0], "capped": num(b.get("capped"), 0, 1) or 0,
           "cores": num(b.get("cores"), 0, 256), "mem": num(b.get("mem"), 0, 1024, 2),
           "screen": house_model.safe_text(b["screen"], 40) if isinstance(b.get("screen"), str) else "",
           "frameScore": num(b.get("frameScore"), 0, 100000), "frameBudget": num(b.get("frameBudget"), 0, 100000),
           "thermal": num(b.get("thermal"), 0.5, 1, 2), "best": num(b.get("best"), 1, 4) or 1,
           "liveMax": num(b.get("liveMax"), 0, 16) or 0, "full": num(b.get("full"), 0, 1),
           "noVideo": b.get("noVideo") is True, "bound": b["bound"] if b.get("bound") in ("main", "gpu") else "",
           "base": {k: num(base.get(k), 0, 10000, 2) for k in ("p50", "p95", "mean") if num(base.get(k), 0, 10000, 2) is not None},
           "costs": {k: num(costs.get(k), 0, 10000, 3) for k in ("card", "upd", "art", "css", "tile", "full") if num(costs.get(k), 0, 10000, 3) is not None},
           "codecs": {k: num(codecs.get(k), 0, 2) for k in ("h264", "h265", "h265_4k") if num(codecs.get(k), 0, 2) is not None},
           "sky": rows(b.get("sky"), 12, [(0, 100000, 0), (0, 10000, 1), (0, 100, 1), (0, 10000, 2)]),
           "cams": rows(b.get("cams"), 8, [(1, 16, 0), (0, 10000, 2), (-1, 100, 0), (-1, 1000, 0)])}
    return out if None not in (out["frameScore"], out["frameBudget"], out["budgetMs"], out["iv"]) else None


def _bench_fail(f):
    """A benchmark that was interrupted (nothing of it kept): when, how far, why."""
    if not isinstance(f, dict) or not isinstance(f.get("at"), (int, float)) or isinstance(f.get("at"), bool):
        return None
    pct = f.get("pct")
    return {"at": round(f["at"]), "pct": round(pct) if isinstance(pct, (int, float)) and not isinstance(pct, bool) and 0 <= pct <= 100 else 0,
            "why": house_model.safe_text(f["why"], 80) if isinstance(f.get("why"), str) else ""}


BENCH_STEPS = ("screen", "cards", "busy", "weather", "drawings", "anim", "cams", "full", "soak", "warm")


def bench_progress(p):
    """What a running benchmark reports for the Manager's live view (bench.js report), made safe; None = refused."""
    if not isinstance(p, dict) or p.get("state") not in ("starting", "running", "done", "stopped", "refused") or p.get("step") not in BENCH_STEPS:
        return None
    num = lambda v, lo, hi: round(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi else None  # noqa: E731
    out = {"state": p["state"], "step": p["step"], "pct": num(p.get("pct"), 0, 100) or 0,
           "text": house_model.safe_text(p["text"], 80) if isinstance(p.get("text"), str) else "",
           "fps": num(p.get("fps"), 0, 1000), "n": num(p.get("n"), 0, 16) or 0}
    fx = p.get("fx")   # (the weather effect on screen: a sky.js condition id)
    if (isinstance(fx, int) and not isinstance(fx, bool) and 0 <= fx <= 999) or (isinstance(fx, str) and re.fullmatch(r"[a-z]{1,12}", fx)):
        out["fx"] = fx
    if p["state"] in ("stopped", "refused"):
        out["why"] = house_model.safe_text(p["why"], 80) if isinstance(p.get("why"), str) else ""
    if p["state"] == "done":
        out.update({"score": num(p.get("score"), 0, 100000), "best": num(p.get("best"), 1, 4), "liveMax": num(p.get("liveMax"), 0, 16) or 0,
                    "noVideo": p.get("noVideo") is True})
    return out


def perf(p):

    """What the panel measured about its weather effects (app.js App.perf, saved as the panel's "perf": one entry per
    device that opened the panel page, {device key: numbers}), made safe to show, newest first (at most 4): frames per
    second per load level 1..4, its own auto limit, its screen and browser."""
    p = p if isinstance(p, dict) else {}
    num = lambda v, lo, hi: v if isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi else None
    out = []
    for dev, e in p.items():
        if not isinstance(dev, str) or not re.fullmatch(r"[a-z0-9]{8}", dev) or not isinstance(e, dict):
            continue
        fps = e.get("fps") if isinstance(e.get("fps"), dict) else {}
        out.append({"dev": dev,
                    "fps": {k: round(fps[k]) for k in ("1", "2", "3", "4") if num(fps.get(k), 0, 1000) is not None},
                    "autoCap": e["autoCap"] if e.get("autoCap") in (1, 2, 3, 4) and not isinstance(e["autoCap"], bool) else 0,
                    "screen": house_model.safe_text(e["screen"], 40) if isinstance(e.get("screen"), str) else "",
                    "ua": house_model.safe_text(e["ua"], 160) if isinstance(e.get("ua"), str) else "",
                    "at": num(e.get("at"), 0, 1e14), "test": _perf_test(e.get("test")), "bench": _bench(e.get("bench")),
                    "benchFail": _bench_fail(e.get("benchFail")),
                    **({"vw": round(e["vw"]), "vh": round(e["vh"])} if num(e.get("vw"), 240, 8192) and num(e.get("vh"), 240, 8192) else {})})

    return sorted(out, key=lambda e: -(e["at"] or 0))[:4]
