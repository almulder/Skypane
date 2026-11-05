"""Weather from a Hubitat weather device (v3.0.0): its warnings join the panels' alerts, its
current weather and forecast feed the weather card's first ("Home") tab instead of Open-Meteo.

Made for the community "OpenWeatherMap-Alerts Weather Driver" (Matthew / Scottma61, namespace "Matthew"; HPM or
https://raw.githubusercontent.com/HubitatCommunity/OpenWeatherMap-Alerts-Weather-Driver/master/…), but generic: every
attribute name it reads can be changed (ATTRS, the setting "attrs"). What that driver sends (read from its source,
v0.7.3, 2026-03-19):
  alert          the FIRST alert's event name, plus " +N" when N more are up ("Tornado Warning +2"); none:
                 "No current weather alerts for this area". (No start, end or severity: the driver doesn't send them.)
  alertDescr     the first alert's description (≤ 1024 characters, newlines made spaces); none: the same no-alert text
  alertSender    the first alert's sender ("NWS Tulsa OK"); none: " "
  temperature, feelsLike, humidity      always; the unit is the driver's setting (°F / °C — the events say which)
  wind / windSpeed                      "Wind Speed" / "Dash - Hubitat and OpenWeatherMap" (MPH, KPH, knots or m/s)
  condition_code, forecast_code        "Condition Code" / "Forecast Code": clear, partlycloudy, mostlycloudy, cloudy,
                                        rain, chancetstorms, snow, flurries, sleet, unknown — "nt_…" at night
  condition_text                       "Condition Text": OpenWeatherMap's words, e.g. "Light rain"
  weatherIcons                         "Dash - Hubitat and OpenWeatherMap": OpenWeatherMap's icon code, e.g. "10d"
  forecastHigh/Low, forecastHigh1/Low1, forecastHigh2/Low2   "Forecast High/Low Temperatures" (today, +1, +2 days)
  forecast_text1/2, condition_icon_url1/2                    "Forecast Text" / "Condition Icon URL" (days +1, +2)
  percentPrecip, PoP1, PoP2            "Today's Precipitation Probability" / "Precipitation Forecast" (%)
  sunriseTime, sunsetTime              "Local SunRise and SunSet" ("HH:mm", the hub's time); localSunrise/Set as text
  is_day, city, last_poll_Forecast     "Is daytime", "City", "Observation time" (changes every poll: freshness)
A driver that has its alerts as JSON (a list of {event, severity, sender, start, end, description, area}) can name
that attribute as "alertsJson": every alert is then read, with its times.

The setting (DATA_DIR/house/weather-device.json, written by the Manager — Integrations → Weather, read by the bridge):
  {"v": 1, "on": bool, "device": id | null, "card": bool (v3.0.4: only the default of "Automatic" cards), "warnings": bool, "panels": ["all"] | [panel names],
   "levels": {"extreme": 5, "warning": 4, "watch": 3, "advisory": 2} (0 = not shown), "extreme": [words],
   "units": {"temp": "auto"|"F"|"C", "wind": "auto"|"mph"|"kmh"|"knots"|"ms"}, "attrs": {role: attribute name}}

What the bridge publishes (scripts/hubitat_bridge.py):
  hubitat/alerts   each warning as one more alert: {id: "0e" + 18 hex (stable: event + start), lvl, to, tag: "weather",
                   kind: "weather", title (the event, ≤ 60), text (the description, ≤ 300), exp, expires, count: 1,
                   at (first seen), place?, sender?, more?} — gone when the device stops reporting it; a dismissed one
                   (level 3–5, or any level from the Manager) stays dismissed while the device still reports it (one
                   missed poll included) — re-issued after that, it is a new alert with a new id (GONE_S)
  hubitat/weather  (retained) WEATHER below: the panels use it for the Home tab while "active" and fresh
(v3.0.4) The house's OpenWeatherMap key: the server's One Call fetches (weather_sources.py) carry the place's warnings;
the server publishes them (OWM_TOPIC, retained: {"v": 1, "at": s, "alerts": [{event, sender, start, end, text}]}) and
the bridge hands them to on_owm(): they join the device's as more warnings — the same levels, panels, ids, dismissals
(one the device reports too is shown once). Shown while "warnings" is on (the default), also without a device; the
server's last word older than ALERT_STALE_S: none.
"""
import datetime
import hashlib
import html
import json
import os
import pathlib
import re
import secrets
import threading
import unicodedata
import time

FILE = "weather-device.json"        # the setting (house dir)
STATE_FILE = "weather-state.json"   # the bridge's memory: dismissed warnings, first seen, the units heard, freshness
TOPIC = "hubitat/weather"
OWM_TOPIC = "dashboard/weather/alerts"   # (v3.0.4) the server's OpenWeatherMap warnings, for the bridge
STALE_S = 2 * 3600          # data older than this: the panels go back to Open-Meteo
ALERT_STALE_S = 12 * 3600   # warnings from a device not heard this long are dropped (it may have stopped polling)
# A warning the device stops reporting ends its "episode" — and its dismissal — once a later poll still lacks it, or
# after GONE_S at most: a re-issued warning (the same name hours later) is a NEW alert, shown and sounded again. Only a
# warning missing from a single poll (a flaky poll) keeps its id and its dismissal. Drivers without a start time (the
# OpenWeatherMap-Alerts driver) get the episode's first-seen time in the id.
# (v3.0.0, the security review) "Gone" = missing from 2 polls (a poll is one burst of the driver's events; the next one
# is at least BURST_S later) AND for at least POLL_GAP_S, whichever comes later — only polls that don't report a warning
# end it. A gap the bridge can't vouch for — the bridge down, the hub or driver silent — longer than the device's own
# window (window(): GONE_S, or 2.5 × its learned update interval for a slow poller) makes every episode "unvouched":
# reported again with the SAME text (description and sender), it is the same warning (no new sound, a dismissal stays);
# with other text, it is a new alert (shown and sounded, any level) — towards showing.
GONE_S = 60 * 60
INTERVAL_MIN, INTERVAL_MAX = 60, 6 * 3600   # the learned update interval's bounds
GAPS_KEPT = 12              # the last gaps between polls the interval is learned from (their median)
POLL_GAP_S = 90
BURST_S = 20
KEY_RE = re.compile(r".{0,180}\|[0-9]{1,13}", re.S)
MAX_ALERTS = 10
TITLE_MAX, TEXT_MAX, SHORT_MAX = 60, 300, 60
RAW_MAX = 20000             # longer attribute text is cut before it is read (an endless description costs nothing)
NAME_RE = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,39}")
PANEL_NAME = re.compile(r"[a-z0-9_-]{1,40}")
ID_PREFIX = "0e"            # (a notifier's ids are a time in hex: never a leading 0 — the two never meet)

# role → the attribute (or attributes, first one with a value wins) of the OpenWeatherMap-Alerts driver
ATTRS = {
    "temp": ["temperature"], "feelsLike": ["feelsLike"], "humidity": ["humidity"], "wind": ["wind", "windSpeed"],
    "code": ["condition_code", "weatherIcons", "weatherIcon", "forecastIcon"], "text": ["condition_text", "weather"],
    "isDay": ["is_day"], "place": ["city"],
    "high": ["forecastHigh"], "low": ["forecastLow"], "code0": ["forecast_code"], "rain": ["percentPrecip"],
    "high1": ["forecastHigh1"], "low1": ["forecastLow1"], "code1": ["forecast_text1", "condition_icon_url1"], "rain1": ["PoP1"],
    "high2": ["forecastHigh2"], "low2": ["forecastLow2"], "code2": ["forecast_text2", "condition_icon_url2"], "rain2": ["PoP2"],
    "sunrise": ["sunriseTime", "localSunrise"], "sunset": ["sunsetTime", "localSunset"],
    "alert": ["alert"], "alertText": ["alertDescr"], "alertSender": ["alertSender"], "alertsJson": [],
    "poll": ["last_poll_Forecast", "last_observation_Forecast"],
}
FRESH_ONLY = {"poll"}   # read only to know the data is new
LEVEL_KEYS = ("extreme", "warning", "watch", "advisory")
DEFAULT_LEVELS = {"extreme": 5, "warning": 4, "watch": 3, "advisory": 2}
DEFAULT_EXTREME = ["extreme", "tornado", "flash flood", "hurricane"]
TEMP_UNITS, WIND_UNITS = ("auto", "F", "C"), ("auto", "mph", "kmh", "knots", "ms")
DEFAULT = {"v": 1, "on": False, "device": None, "card": True, "warnings": True, "panels": ["all"],
           "levels": dict(DEFAULT_LEVELS), "extreme": list(DEFAULT_EXTREME), "units": {"temp": "auto", "wind": "auto"}, "attrs": {}}
# "no alert" as drivers say it (casefolded, start of the text)
NO_ALERT = ("no current weather alerts", "no weather alerts", "no alerts", "none", "null", "n/a")

# ---------- condition codes → WMO weather codes (what the panels' weather card and sky effects use) ----------
# the driver's condition_code / forecast_code (SmartThings-style words; "nt_" = night)
DRIVER_CODES = {"clear": 0, "sunny": 0, "mostlysunny": 1, "partlycloudy": 2, "partlysunny": 2, "mostlycloudy": 3, "cloudy": 3,
                "fog": 45, "hazy": 45, "rain": 61, "chancerain": 61, "drizzle": 51, "sleet": 66, "chancesleet": 66,
                "flurries": 71, "chanceflurries": 71, "snow": 73, "chancesnow": 71, "tstorms": 95, "chancetstorms": 95}
# OpenWeatherMap's icon codes (weatherIcons, "10d", or a file name "10n.png")
OWM_ICONS = {"01": 0, "02": 1, "03": 2, "04": 3, "09": 80, "10": 61, "11": 95, "13": 73, "50": 45}
# the driver's own picture files (condition_icon_url1/2 → ".../38.png"): the numbered weather icon set it uses
ICON_FILES = {"38": 95, "9": 53, "39": 61, "13": 71, "14": 73, "16": 75, "8": 66, "42": 75, "23": 45, "32": 0, "31": 0,
              "34": 1, "33": 1, "30": 2, "29": 2, "28": 3, "27": 3, "26": 3}
# OpenWeatherMap condition ids (200–804) by group
def _owm_id(n):
    if 200 <= n < 300:
        return 95
    if 300 <= n < 400:
        return 53
    if n in (500, 520):
        return 61 if n == 500 else 80
    if n in (501, 521, 531):
        return 63 if n == 501 else 81
    if 502 <= n <= 504 or n == 522:
        return 65 if n < 510 else 82
    if n == 511:
        return 66
    if 600 <= n < 700:
        return {600: 71, 601: 73, 602: 75, 611: 66, 612: 66, 613: 66, 615: 66, 616: 66, 620: 85, 621: 85, 622: 86}.get(n, 73)
    if 700 <= n < 800:
        return 45
    return {800: 0, 801: 1, 802: 2, 803: 3, 804: 3}.get(n)


# words → WMO (OpenWeatherMap's descriptions, forecast_text1/2, any driver's condition text) — the first match wins
TEXT_WORDS = [("thunder", 95), ("freezing", 66), ("sleet", 66), ("hail", 96), ("heavy snow", 75), ("snow shower", 85),
              ("snow", 73), ("flurr", 71), ("heavy rain", 65), ("shower", 80), ("drizzle", 51), ("rain", 61), ("fog", 45),
              ("mist", 45), ("haze", 45), ("smoke", 45), ("dust", 45), ("overcast", 3), ("broken clouds", 3),
              ("mostly cloudy", 3), ("cloudy", 3), ("scattered clouds", 2), ("partly", 2), ("few clouds", 1),
              ("mostly clear", 1), ("mostly sunny", 1), ("clear", 0), ("sunny", 0), ("fair", 0)]


def to_wmo(value):
    """A driver's condition (its code word, OpenWeatherMap's icon code or id, an icon file / URL, or words) → (WMO
    code or None, is it night: True / False / None)."""
    if isinstance(value, bool) or value is None:
        return None, None
    if isinstance(value, (int, float)):
        return (_owm_id(int(value)) if 200 <= value <= 804 else None), None
    s = str(value)[:300].strip().lower()
    if not s:
        return None, None
    night = None
    m = re.search(r"([0-9]{2})([dn])(?:@2x)?(?:\.png)?(?:\?.*)?$", s)
    if m and m[1] in OWM_ICONS:
        return OWM_ICONS[m[1]], m[2] == "n"
    m = re.search(r"/([0-9]{1,2})\.png(?:\?.*)?$", s)
    if m:
        return ICON_FILES.get(m[1]), None
    if s.isdecimal():
        n = int(s)
        return (_owm_id(n) if 200 <= n <= 804 else None), None
    word = s
    if word.startswith("nt_"):
        word, night = word[3:], True
    word = re.sub(r"[^a-z]", "", word)
    if word in DRIVER_CODES:
        return DRIVER_CODES[word], night
    for w, code in TEXT_WORDS:
        if w in s:
            return code, night
    return None, night


# ---------- text ----------
def clean_text(v, n):
    """A driver's text made plain: no HTML (tags removed, entities read), no control characters, spaces collapsed,
    at most n characters (cut at a word, with "…")."""
    if v is None or isinstance(v, (dict, list, bool)):
        return ""
    s = str(v)[:RAW_MAX]
    s = re.sub(r"<(script|style)\b[^>]{0,200}>.*?</\1\s*>", " ", s, flags=re.I | re.S)
    s = re.sub(r"<[^>]{0,500}>", " ", s)
    s = html.unescape(s)
    s = re.sub(r"[\x00-\x1f\x7f<>  ]", " ", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Cf" or c in "\u200c\u200d")   # (no bidi overrides, zero-width or other
    # format characters — but the joiners stay: emoji sequences, Persian and Indic words need them)
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= n:
        return s
    cut = s[:n - 1]
    sp = cut.rfind(" ")
    return (cut[:sp] if sp > n // 2 else cut).rstrip(" ,;:.-") + "…"


def _num(v):
    """A number from a driver's value (72, "72.4", "72 °F") or None."""
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        f = float(v)
    else:
        m = re.match(r"\s*(-?[0-9]{1,6}(?:\.[0-9]{1,6})?)", str(v)[:40])
        if not m:
            return None
        f = float(m[1])
    return f if f == f and abs(f) < 1e6 else None


def _time(v):
    """A time from a driver (epoch s or ms, or ISO 8601) → epoch s (int) or 0."""
    if isinstance(v, bool) or v is None:
        return 0
    if isinstance(v, (int, float)):
        t = float(v) / (1000 if v > 1e11 else 1)
        return int(t) if 0 < t < 1e11 else 0
    s = str(v).strip()[:40]
    if re.fullmatch(r"[0-9]{9,13}", s):
        return _time(int(s))
    try:
        d = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.astimezone()
        return int(d.timestamp())
    except (ValueError, OverflowError, OSError):
        return 0


def hhmm(v):
    """"06:41", "6:41 AM", "2026-11-01T06:41:00-05:00" → "06:41" (24 h), else None."""
    s = str(v or "").strip()[:40]
    m = re.search(r"(?:T|^|\s)([0-9]{1,2}):([0-9]{2})(?::[0-9]{2})?\s*([AaPp][Mm])?", s)
    if not m:
        return None
    h, mi = int(m[1]), int(m[2])
    if m[3]:
        if not 1 <= h <= 12:
            return None
        h = (h % 12) + (12 if m[3].lower() == "pm" else 0)
    return f"{h:02d}:{mi:02d}" if h < 24 and mi < 60 else None


# ---------- the setting ----------
class Invalid(ValueError):
    pass


def clean_config(doc, strict=False):
    """The setting made safe: every field checked, anything odd → its default (strict: Invalid instead — the Manager's
    save says what's wrong)."""
    def bad(why):
        if strict:
            raise Invalid(why)
    d = doc if isinstance(doc, dict) else {}
    out = json.loads(json.dumps(DEFAULT))
    for k in ("on", "card", "warnings"):
        if k in d:
            if isinstance(d[k], bool):
                out[k] = d[k]
            else:
                bad(f"{k}: true or false")
    dev = d.get("device")
    if isinstance(dev, int) and not isinstance(dev, bool) and 0 < dev < 10 ** 9:
        out["device"] = dev
    elif isinstance(dev, str) and dev.isdecimal() and 0 < int(dev) < 10 ** 9:
        out["device"] = int(dev)
    elif dev not in (None, ""):
        bad("device: a Hubitat device number")
    if "panels" in d:
        p = d["panels"]
        if isinstance(p, list) and p and len(p) <= 50 and all(isinstance(x, str) and PANEL_NAME.fullmatch(x.lower()) for x in p):
            p = list(dict.fromkeys(x.lower() for x in p))
            out["panels"] = ["all"] if "all" in p else p
        else:
            bad("panels: a list of panel names, or [\"all\"]")
    lv = d.get("levels")
    if isinstance(lv, dict):
        for k in LEVEL_KEYS:
            if k in lv:
                v = lv[k]
                if isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= 5:
                    out["levels"][k] = v
                else:
                    bad(f"levels.{k}: 0 to 5")
    elif lv is not None:
        bad("levels: an object")
    ex = d.get("extreme")
    if isinstance(ex, list):
        words = []
        for w in ex[:40]:
            w = re.sub(r"\s+", " ", w).strip().lower() if isinstance(w, str) else None
            if w is None or (w and (len(w) > 40 or not re.fullmatch(r"[a-z0-9 '&/.-]+", w))):
                bad("extreme: short words (letters, digits, spaces)")
                continue
            if w:
                words.append(w)
        if len(ex) > 20:
            bad("extreme: at most 20 words")
        out["extreme"] = list(dict.fromkeys(words))[:20]
    elif ex is not None:
        bad("extreme: a list of words")
    un = d.get("units")
    if isinstance(un, dict):
        if un.get("temp") in TEMP_UNITS:
            out["units"]["temp"] = un["temp"]
        elif "temp" in un:
            bad("units.temp: auto, F or C")
        if un.get("wind") in WIND_UNITS:
            out["units"]["wind"] = un["wind"]
        elif "wind" in un:
            bad("units.wind: auto, mph, kmh, knots or ms")
    at = d.get("attrs")
    if isinstance(at, dict):
        for k, v in at.items():
            if k not in ATTRS:
                bad(f"attrs.{k}: unknown")
                continue
            if v in (None, ""):
                continue
            if isinstance(v, str) and NAME_RE.fullmatch(v):
                out["attrs"][k] = v
            else:
                bad(f"attrs.{k}: an attribute name")
    return out


def attrs_for(cfg):
    """role → the attribute names read for it (the setting's own first)."""
    own = (cfg or {}).get("attrs") or {}
    return {role: ([own[role]] if own.get(role) else []) + [a for a in names if a != own.get(role)] for role, names in ATTRS.items()}


def watched(cfg):
    return {a for names in attrs_for(cfg).values() for a in names}


def looks_like_weather(attrs):
    """For the Manager's device list: (has weather values, has alerts) from a device's attribute names."""
    names = set(attrs or ())
    weather = bool(names & {"forecastHigh", "condition_code", "condition_text", "forecast_code", "weatherIcons", "weather",
                            "feelsLike", "forecastIcon", "weatherSummary", "wind_string", "percentPrecip"})
    alerts = bool(names & {"alert", "alertDescr", "alertSender", "alertTile", "alerts", "weatherAlert", "weatherAlerts"})
    return weather, alerts


# ---------- warnings ----------
def classify(event, severity, cfg):
    """A warning's level (0 = not shown) by its event name: extreme ones (the "extreme" words, an Extreme severity, an
    Emergency) → levels.extreme, other warnings → levels.warning, watches → levels.watch, the rest (advisories,
    statements, outlooks) → levels.advisory."""
    e = (event or "").casefold()
    sev = (severity or "").casefold()
    lv = (cfg or {}).get("levels") or DEFAULT_LEVELS
    words = (cfg or {}).get("extreme") if isinstance((cfg or {}).get("extreme"), list) else DEFAULT_EXTREME
    hot = sev == "extreme" or any(w and w in e for w in words)
    if "emergency" in e or ("warning" in e and hot) or (sev == "extreme" and "watch" not in e):
        cat = "extreme"
    elif "warning" in e:
        cat = "warning"
    elif "watch" in e:
        cat = "watch"
    else:
        cat = "advisory"
    v = lv.get(cat, DEFAULT_LEVELS[cat])
    return v if isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= 5 else DEFAULT_LEVELS[cat]


def alert_id(event, start):
    """Stable for one warning: its event name and start (not its text — an updated description is the same warning)."""
    key = f"{re.sub(r'[^a-z0-9]+', ' ', (event or '').casefold()).strip()}|{int(start or 0)}"
    return ID_PREFIX + hashlib.sha256(key.encode("utf-8")).hexdigest()[:18]


def _first(attrs, names):
    for a in names:
        v = attrs.get(a)
        if v is not None and not (isinstance(v, str) and not v.strip()):
            return v
    return None


def _is_none(text):
    t = (text or "").strip().casefold()
    return not t or t.startswith(NO_ALERT)


def read_alerts(attrs, cfg):
    """The warnings a device reports now: [{event, severity, sender, start, end, description, place, more}] (raw, made
    plain). Its alertsJson attribute (a JSON list) when it has one, else the OpenWeatherMap-Alerts driver's alert /
    alertDescr / alertSender (the first warning and how many more)."""
    names = attrs_for(cfg)
    out = []
    raw = _first(attrs, names["alertsJson"]) if names["alertsJson"] else None
    if raw is not None:
        try:
            doc = json.loads(raw) if isinstance(raw, str) else raw
        except (ValueError, RecursionError):
            doc = None
        if isinstance(doc, dict):
            doc = doc.get("alerts") if isinstance(doc.get("alerts"), list) else doc.get("features")
        for a in (doc if isinstance(doc, list) else [])[:40]:
            if isinstance(a, dict) and isinstance(a.get("properties"), dict):   # (weather.gov's GeoJSON)
                a = a["properties"]
            if not isinstance(a, dict):
                continue
            ev = clean_text(a.get("event") or a.get("title") or a.get("headline"), TITLE_MAX)
            if _is_none(ev):
                continue
            out.append({"event": ev, "severity": clean_text(a.get("severity"), 20),
                        "sender": clean_text(a.get("sender") or a.get("senderName") or a.get("sender_name"), SHORT_MAX),
                        "start": _time(a.get("start") or a.get("onset") or a.get("effective")),
                        "end": _time(a.get("end") or a.get("ends") or a.get("expires")),
                        "description": clean_text(a.get("description") or a.get("desc"), TEXT_MAX),
                        "place": clean_text(a.get("area") or a.get("areaDesc"), SHORT_MAX), "more": 0})
        return out
    ev = _first(attrs, names["alert"])
    ev = clean_text(ev, 200) if ev is not None else ""
    if _is_none(ev):
        return []
    more = 0
    m = re.fullmatch(r"(.*?)\s*\+\s*([0-9]{1,2})", ev)
    if m and m[1]:
        ev, more = m[1], int(m[2])
    ev = clean_text(ev, TITLE_MAX)
    desc = clean_text(_first(attrs, names["alertText"]), TEXT_MAX)
    if _is_none(desc):
        desc = ""
    sender = clean_text(_first(attrs, names["alertSender"]), SHORT_MAX)
    return [{"event": ev, "severity": "", "sender": sender, "start": 0, "end": 0, "description": desc, "place": "", "more": more}]


# ---------- the weather object ----------
def _unit_temp(cfg, heard):
    u = ((cfg or {}).get("units") or {}).get("temp", "auto")
    if u in ("F", "C"):
        return u
    h = str((heard or {}).get("temp") or "").upper()
    return "C" if "C" in h else "F"


def _unit_wind(cfg, heard):
    """(the unit the driver sends, the unit the panels get: "mph" or "km/h")."""
    u = ((cfg or {}).get("units") or {}).get("wind", "auto")
    if u == "auto":
        h = str((heard or {}).get("wind") or "").lower().replace(" ", "")
        u = "kmh" if h in ("kph", "km/h", "kmh") else "knots" if h in ("knots", "kn", "kt") else "ms" if h in ("m/s", "ms", "mps") \
            else "mph" if h else ("kmh" if _unit_temp(cfg, heard) == "C" else "mph")
    return u, ("km/h" if u in ("kmh", "ms") else "mph")


def build_weather(attrs, cfg, heard_units, updated_at, now, device_name=""):
    """The Home tab's weather (TOPIC) from a device's values. "active": the panels may use it (on, a device, a
    temperature, fresh; v3.0.4: whatever the house switch says — "card" carries it, for cards set to Automatic); otherwise "reason" says why not and they keep Open-Meteo."""
    cfg = cfg or DEFAULT
    base = {"v": 1, "source": "hubitat", "replaces": None, "active": False, "updatedAt": int(updated_at) if updated_at else None}
    if not cfg.get("on") or not cfg.get("device"):
        return {**base, "reason": "off"}
    # (v3.0.4) each weather card picks its source: the device's weather is published whatever the house switch says;
    # "card" (the switch as stored, no longer on the Integrations page) is what a card set to "Automatic" follows
    base["card"] = bool(cfg.get("card"))
    names = attrs_for(cfg)
    get = lambda role: _first(attrs or {}, names[role])   # noqa: E731
    tu = _unit_temp(cfg, heard_units)
    wu_in, wu_out = _unit_wind(cfg, heard_units)
    rnd = lambda v: None if v is None else int(round(v))   # noqa: E731
    temp = _num(get("temp"))
    wind = _num(get("wind"))
    if wind is not None:
        wind = wind * 1.150779 if wu_in == "knots" else wind * 3.6 if wu_in == "ms" else wind
    code, night = to_wmo(get("code"))
    text = clean_text(get("text"), SHORT_MAX)
    if code is None and text:
        code, _ = to_wmo(text)
    hum = _num(get("humidity"))
    sunrise, sunset = hhmm(get("sunrise")), hhmm(get("sunset"))
    d = get("isDay")
    is_day = (str(d).strip().lower() in ("true", "1", "yes", "day")) if d is not None else (not night if night is not None else None)
    if is_day is None and sunrise and sunset:
        t = time.localtime(now)
        is_day = sunrise <= f"{t.tm_hour:02d}:{t.tm_min:02d}" < sunset
    days = []
    today = datetime.date.fromtimestamp(now)
    for i, (h, lo, c, r) in enumerate((("high", "low", "code0", "rain"), ("high1", "low1", "code1", "rain1"), ("high2", "low2", "code2", "rain2"))):
        high, low = _num(get(h)), _num(get(lo))
        if high is None and low is None:
            continue
        wmo, _ = to_wmo(get(c))
        if wmo is None and i == 0:
            wmo = code
        rain = _num(get(r))
        days.append({"date": (today + datetime.timedelta(days=i)).isoformat(), "high": rnd(high), "low": rnd(low), "wmo": wmo,
                     "rainPct": None if rain is None else max(0, min(100, rnd(rain)))})
    out = {**base, "device": {"id": cfg["device"], "name": clean_text(device_name, SHORT_MAX)},
           "current": {"temp": rnd(temp), "feelsLike": rnd(_num(get("feelsLike"))), "humidity": None if hum is None else max(0, min(100, rnd(hum))),
                       "wind": rnd(wind), "wmo": code, "text": text, "isDay": is_day},
           "forecast": days, "units": {"temp": tu, "wind": wu_out}, "sunrise": sunrise, "sunset": sunset,
           "place": clean_text(get("place"), SHORT_MAX) or None, "staleAfter": STALE_S}
    if temp is None:
        return {**out, "reason": "no-data"}
    if not updated_at or now - updated_at > STALE_S:
        return {**out, "reason": "stale"}
    return {**out, "replaces": "home", "active": True, "reason": None}


# ---------- what the bridge keeps ----------
class Watch:
    """The chosen weather device as the bridge sees it: its values (from the Maker API's device list and the event
    socket), when they last changed, the warnings it reports and which of them were dismissed. Thread safe.
    house_dir None: no setting can exist — always off."""

    def __init__(self, house_dir, clock=time.time, log=None):
        self.dir = pathlib.Path(house_dir) if house_dir else None
        self.clock, self.log = clock, log or (lambda *a: None)
        self.lock = threading.RLock()
        self.cfg, self.sig = clean_config(None), None
        self.attrs, self.label = {}, ""
        self.units = {}            # role → the unit the driver's events said ("°F", "MPH", …)
        self.updated, self.fp = None, None
        self.gaps, self.poll_at = [], None   # the device's own update rhythm: gaps between its polls, its last poll
        self.episodes = {}         # warning key (event | start) → {"t": first seen, "gone": when first missing, "upd": the data then}
        self.dismissed = {}        # alert id → when dismissed
        self.owm, self.owm_at = [], None   # (v3.0.4) the server's OpenWeatherMap warnings (raw, as read_alerts) and when it sent them
        self.reload()
        self._load_state()

    # --- files ---
    def _path(self, name):
        return self.dir / name if self.dir else None

    def reload(self):
        """Re-read the setting when its file changed; True when it did (the caller publishes again)."""
        p = self._path(FILE)
        try:
            st = p.stat() if p else None
            sig = (st.st_mtime_ns, st.st_size) if st else None
        except OSError:
            sig = None
        with self.lock:
            if sig == self.sig:
                return False
            self.sig = sig
            if sig is None:
                cfg = clean_config(None)
            else:
                try:
                    if p.stat().st_size > 64 * 1024:
                        raise ValueError("too big")
                    cfg = clean_config(json.loads(p.read_text(encoding="utf-8")))
                except (OSError, ValueError):
                    self.sig = None   # (being replaced: read again next time; the last good setting stays)
                    return False
            if cfg.get("device") != self.cfg.get("device"):
                self.attrs, self.label, self.updated, self.fp = {}, "", None, None
            changed = cfg != self.cfg
            self.cfg = cfg
            return changed

    def _load_state(self):
        p = self._path(STATE_FILE)
        try:
            doc = json.loads(p.read_text(encoding="utf-8")) if p and p.stat().st_size < 64 * 1024 else {}
        except (OSError, ValueError):
            doc = {}
        if not isinstance(doc, dict):
            return
        ok_id = lambda i: isinstance(i, str) and re.fullmatch(ID_PREFIX + r"[0-9a-f]{18}", i)   # noqa: E731
        num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool) and 0 < v < 1e11   # noqa: E731
        self.dismissed = {i: t for i, t in (doc.get("dismissed") or {}).items() if ok_id(i) and num(t)} if isinstance(doc.get("dismissed"), dict) else {}
        eps = doc.get("episodes") if isinstance(doc.get("episodes"), dict) else {}
        now = self.clock()
        gaps = doc.get("gaps") if isinstance(doc.get("gaps"), list) else []
        self.gaps = [g for g in gaps if num(g) and INTERVAL_MIN / 2 <= g <= INTERVAL_MAX * 2][-GAPS_KEPT:]
        self.poll_at = doc.get("pollAt") if num(doc.get("pollAt")) else None
        win = self.window()
        self.episodes = {k: {"t": e["t"], "seen": e["seen"], "gone": e.get("gone") if num(e.get("gone")) else None,
                             "upd": e.get("upd") if num(e.get("upd")) else None,
                             "th": e["th"][:16] if isinstance(e.get("th"), str) else "",
                             **({"missed2": True} if e.get("missed2") is True else {}),
                             # (last reported longer ago than the window: not vouched for — the next report's text decides)
                             **({"unv": True} if e.get("unv") is True or now - e["seen"] > win else {})}
                         for k, e in list(eps.items())[:100]
                         if isinstance(k, str) and KEY_RE.fullmatch(k) and isinstance(e, dict) and num(e.get("t")) and num(e.get("seen"))}
        un = doc.get("units") if isinstance(doc.get("units"), dict) else {}
        self.units = {k: v[:12] for k, v in un.items() if k in ("temp", "wind") and isinstance(v, str)}
        if num(doc.get("updated")) and isinstance(doc.get("fp"), str) and doc.get("device") == self.cfg.get("device"):
            self.updated, self.fp = doc["updated"], doc["fp"][:64]   # (the same device: "changed when" carries over a restart)

    def _save_state(self):
        p = self._path(STATE_FILE)
        if not p:
            return
        doc = {"v": 1, "device": self.cfg.get("device"), "updated": self.updated, "fp": self.fp, "units": self.units,
               "dismissed": self.dismissed, "episodes": self.episodes, "gaps": self.gaps, "pollAt": self.poll_at}
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            tmp = p.with_name(f".{p.name}.{secrets.token_hex(4)}.tmp")
            tmp.write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
            os.replace(tmp, p)
        except OSError as e:
            self.log(f"weather: state not saved ({type(e).__name__})")

    # --- what arrives ---
    def device_id(self):
        with self.lock:
            return self.cfg.get("device") if self.cfg.get("on") else None

    def _fingerprint(self):
        return hashlib.sha256(json.dumps(self.attrs, sort_keys=True, default=str).encode()).hexdigest()[:24]

    def interval(self):
        """The device's own update interval: the median of its last gaps between polls (None until 3 are known)."""
        g = sorted(self.gaps)
        return max(INTERVAL_MIN, min(INTERVAL_MAX, g[len(g) // 2])) if len(g) >= 3 else None

    def window(self):
        """How long a gap the bridge vouches for: GONE_S, or 2.5 polls of a slower device."""
        i = self.interval()
        return max(GONE_S, 2.5 * i) if i else GONE_S

    def _changed(self):
        fp = self._fingerprint()
        if fp != self.fp:
            now = self.clock()
            if self.updated and now - self.updated > self.window():   # (the window as known before this gap)
                for ep in self.episodes.values():   # (silent longer than that: what comes next decides by its text)
                    ep["unv"] = True
            if self.updated is None or now - self.updated > BURST_S:   # (a new poll: its gap teaches the rhythm)
                if self.poll_at and BURST_S < now - self.poll_at <= INTERVAL_MAX * 2:
                    self.gaps = (self.gaps + [now - self.poll_at])[-GAPS_KEPT:]
                self.poll_at = now
            self.fp, self.updated = fp, now
            return True
        return False

    def on_devices(self, devices):
        """The Maker API's device list (every resync): the chosen device's values. True when something changed."""
        did = self.device_id()
        if did is None:
            return False
        d = next((x for x in devices or [] if isinstance(x, dict) and str(x.get("id", "")) == str(did)), None)
        if d is None:
            return False
        a = d.get("attributes")
        if isinstance(a, list):   # (the Maker API's single-device shape: [{name, currentValue}])
            a = {x.get("name"): x.get("currentValue") for x in a if isinstance(x, dict)}
        if not isinstance(a, dict):
            return False
        with self.lock:
            names = watched(self.cfg)
            vals = {k: self._keep(v) for k, v in a.items() if k in names}
            self.label = clean_text(d.get("label") or d.get("name"), SHORT_MAX)
            if vals == self.attrs and self.updated:
                return False
            self.attrs = vals
            first_since_start = self.updated is None
            changed = self._changed()
            if changed or first_since_start:
                self._save_state()
            return changed or first_since_start

    @staticmethod
    def _keep(v):
        if v is None or isinstance(v, (bool, int, float)):
            return v
        return str(v)[:RAW_MAX] if not isinstance(v, (dict, list)) else json.dumps(v)[:RAW_MAX]

    def on_event(self, did, name, value, unit=None):
        """One event from the hub's event socket. True when it was the weather device's and changed something."""
        if did != self.device_id():
            return False
        with self.lock:
            if name not in watched(self.cfg):
                return False
            names = attrs_for(self.cfg)
            if isinstance(unit, str) and unit.strip():
                for role in ("temp", "wind"):
                    if name in names[role] and self.units.get(role) != unit.strip()[:12]:
                        self.units[role] = unit.strip()[:12]
            v = self._keep(value)
            if self.attrs.get(name) == v and name in self.attrs:
                return False
            self.attrs[name] = v
            self._changed()
            return True

    def on_owm(self, doc, now=None):
        """(v3.0.4) The server's OpenWeatherMap warnings (OWM_TOPIC; bytes, text or the parsed doc), checked field by
        field. True when they changed."""
        now = self.clock() if now is None else now
        try:
            if isinstance(doc, (bytes, str)):
                doc = json.loads(doc[:64 * 1024])
        except (ValueError, UnicodeDecodeError, RecursionError):
            doc = None
        if not isinstance(doc, dict) or doc.get("v") != 1 or not isinstance(doc.get("alerts"), list):
            return False
        at = _time(doc.get("at"))
        out = []
        for a in doc["alerts"][:MAX_ALERTS]:
            ev = clean_text(a.get("event"), TITLE_MAX) if isinstance(a, dict) else ""
            if _is_none(ev):
                continue
            out.append({"event": ev, "severity": "", "sender": clean_text(a.get("sender"), SHORT_MAX), "start": _time(a.get("start")),
                        "end": _time(a.get("end")), "description": clean_text(a.get("text"), TEXT_MAX), "place": "", "more": 0, "owm": True})
        with self.lock:
            changed = out != self.owm
            self.owm, self.owm_at = out, (min(at, now) if at else now)
            return changed

    def save(self):
        with self.lock:
            self._save_state()

    # --- what goes out ---
    @staticmethod
    def _key(event, start):
        return f"{re.sub(r'[^a-z0-9]+', ' ', (event or '').casefold()).strip()}|{int(start or 0)}"

    def _current(self, now):
        """Every warning the device reports now (dismissed or not), checked and levelled: [alert…]."""
        cfg = self.cfg
        if not cfg.get("warnings"):
            return []
        dev = cfg.get("on") and cfg.get("device") and self.updated and now - self.updated <= ALERT_STALE_S
        raw = read_alerts(self.attrs, cfg) if dev else []
        if self.owm_at and now - self.owm_at <= ALERT_STALE_S:   # (v3.0.4: OpenWeatherMap's — one the device has too: once)
            evs = {re.sub(r"[^a-z0-9]+", " ", a["event"].casefold()).strip() for a in raw}
            raw += [a for a in self.owm if re.sub(r"[^a-z0-9]+", " ", a["event"].casefold()).strip() not in evs]
        out, seen = [], set()
        place = clean_text(_first(self.attrs, attrs_for(cfg)["place"]), SHORT_MAX) if dev else ""
        for a in raw:
            if a["end"] and a["end"] <= now:
                continue
            lvl = classify(a["event"], a["severity"], cfg)
            if lvl < 1:
                continue
            key = self._key(a["event"], a["start"])
            if key in seen:
                continue
            seen.add(key)
            ep = self.episodes.get(key)
            th = hashlib.sha256(f"{a['description']}|{a['sender']}".encode("utf-8")).hexdigest()[:16]
            win = self.window()
            ended = ep is not None and ep["gone"] is not None and (now - ep["gone"] > win or (ep.get("missed2") and now - ep["gone"] >= POLL_GAP_S))
            # (not vouched for — a gap longer than the window: the same text is the same warning, other text a new one)
            doubt = ep is not None and (ep.get("unv") or now - ep["seen"] > win)
            if ep is None or ended or (doubt and ep.get("th") != th):
                ep = self.episodes[key] = {"t": int(now), "seen": now, "gone": None, "upd": None, "th": th}
            elif doubt or ep.get("th") != th:
                ep.pop("unv", None)
                ep["th"] = th   # (vouched for: an updated description is the same warning)
            if a.get("owm") and self.owm_at > ep["seen"]:   # (the server's last word vouches for it, as a poll does)
                ep["seen"] = self.owm_at
            first = ep["t"]
            aid = alert_id(a["event"], a["start"] or first)   # (no start from the driver: this episode's own id)
            text = a["description"] or a["event"]
            item = {"id": aid, "key": key, "lvl": lvl, "to": list(cfg.get("panels") or ["all"]), "tag": "weather", "kind": "weather",
                    "title": a["event"], "text": text, "exp": a["end"], "expires": a["end"], "count": 1, "at": int(first)}
            if a["place"] or place:
                item["place"] = a["place"] or place
            if a["sender"]:
                item["sender"] = a["sender"]
            if a["more"]:
                item["more"] = a["more"]
            out.append(item)
            if len(out) >= MAX_ALERTS:
                break
        return out

    def alerts(self, now=None, everything=False):
        """The warnings for hubitat/alerts — the dismissed ones left out (everything: with them). A warning no longer
        reported ends (its episode and its dismissal are forgotten) once a later poll still lacks it, or after window():
        reported again after that, it is a new alert. Missing from one poll only, it stays as it was."""
        now = self.clock() if now is None else now
        with self.lock:
            cur = self._current(now)
            keys = {a["key"] for a in cur}
            dirty = False
            for k, ep in list(self.episodes.items()):
                if k in keys:
                    if ep["gone"] is not None:
                        ep["gone"] = ep["upd"] = None
                        ep.pop("missed2", None)
                        dirty = True
                    if self.updated and self.updated > ep["seen"]:   # (fresh data reported it: the data's own time —
                        dirty = dirty or self.updated - ep["seen"] > 60   # a silent hub never refreshes it)
                        ep["seen"] = self.updated
                elif ep["gone"] is None:
                    ep["gone"], ep["upd"] = now, self.updated
                    dirty = True
                else:
                    if not ep.get("missed2") and self.updated and ep["upd"] and self.updated - ep["upd"] > BURST_S:
                        ep["missed2"] = True   # (a second poll without it)
                        dirty = True
                    if now - ep["gone"] > self.window() or (ep.get("missed2") and now - ep["gone"] >= POLL_GAP_S):
                        del self.episodes[k]   # (missing from 2 polls and for POLL_GAP_S, or for GONE_S: it ended)
                        dirty = True
            live = {a["id"] for a in cur}
            for k, ep in self.episodes.items():
                ev, _, st = k.rpartition("|")
                live.add(alert_id(ev, (int(st) if st.isdecimal() else 0) or ep["t"]))
            for i in [i for i in self.dismissed if i not in live]:
                del self.dismissed[i]
                dirty = True
            if dirty:
                self._save_state()
            out = [{k: v for k, v in a.items() if k != "key"} for a in cur]
            return out if everything else [a for a in out if a["id"] not in self.dismissed]

    def find(self, aid, now=None):
        """The warning with this id that the device reports now (dismissed or not), or None."""
        if not isinstance(aid, str) or not aid.startswith(ID_PREFIX):
            return None
        return next((a for a in self.alerts(now, everything=True) if a["id"] == aid), None)

    def dismiss(self, aid, now=None):
        """Gone on every panel until the device stops reporting it (or reports a changed one: another id)."""
        now = self.clock() if now is None else now
        with self.lock:
            if aid in self.dismissed:
                return False
            self.dismissed[aid] = now
            self._save_state()
            return True

    def weather(self, now=None):
        now = self.clock() if now is None else now
        with self.lock:
            out = build_weather(self.attrs, self.cfg, self.units, self.updated, now, self.label)
            if out.get("device"):
                out["warnings"] = [{"id": a["id"], "lvl": a["lvl"], "title": a["title"], "to": a["to"]} for a in self._current(now)]
            return out
