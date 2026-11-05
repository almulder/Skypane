"""(v3.0.4) Weather the server fetches for the panels: the house's own OpenWeatherMap key (One Call 3.0 — now, 48 h
hourly, 8 days, alerts in one call) and Open-Meteo (free, no key, up to 16 days) to fill what OWM doesn't have — the
14-day view and a day's hours (fetched only when a day is tapped, then remembered for that day). The panels still
fetch their own 7-day Open-Meteo weather (weather.js); the Hubitat device comes from the bridge (weather_device.py).

Each weather card picks its source (layouts.py: o.src; a built-in layout: the panel setting weather.src):
  "auto"  the Hubitat device when it's connected and the house switch (weather-device.json "card", no longer on the
          Integrations page) is on — its gaps from Open-Meteo; else OpenWeatherMap when a key is set; else Open-Meteo
  "om" | "hub" | "owm"   that one; one not connected (no device, no key) → Open-Meteo
resolve() is the order; weather.js has the same for the panel (it also knows whether the device's data is fresh).

The key: house_settings OWM_API_KEY (private/settings.json, a secret: the Manager only learns set / not set). It's
read when a call is made (key_fn), sent only to the OWM address, and never logged, returned or put in an error: a
failed call is logged by its kind only (the address holds the key). No proxy from the environment, no redirects
followed, 10 s. The calls: one per place at most every INTERVAL_S (longer with more places, so the day's calls stay
within the budget: DATA_DIR/house/owm-calls.json counts them per UTC day — OWM's own day — across restarts); a place
asked for by no panel in PLACE_IDLE_S is no longer fetched. Places are rounded to 2 decimals (about 1 km) — every
panel showing the same town shares one fetch.

What a forecast is (GET /api/weather/forecast; numbers in °C and km/h — the panel converts to its units):
  {ok, source: "owm"|"om", fallback: null|"no-key"|"budget"|"places"|"error", units: {temp: "C", wind: "km/h"},
   updatedAt, utcOffset, today: "YYYY-MM-DD" (the place's own), now: {temp, feels, humidity, wind, gusts, wmo, text,
   isDay}, days: [{ymd, wmo, high, low, rainPct, sunrise, sunset (epoch s), from: "owm"|"om"}] (up to 16),
   hoursTo: the last OWM hour (epoch s) | null, alerts: [{event, sender, start, end, text}]}
A day's hours (GET /api/weather/hours): {ok, ymd, source, units, hours: [{t, temp, wmo, rainPct, wind, isDay, from}]}.
"""
import datetime
import json
import math
import pathlib
import re
import secrets
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

try:
    from service import weather_device
except ImportError:  # pragma: no cover  (run from inside service/)
    import weather_device

OWM_BASE = "https://api.openweathermap.org/data/3.0/onecall"
OM_BASE = "https://api.open-meteo.com/v1/forecast"
SOURCES = ("auto", "om", "hub", "owm")
KEY_RE = re.compile(r"[A-Za-z0-9]{16,64}")   # (house_settings checks the same)
INTERVAL_S = 15 * 60        # the shortest time between two OWM calls for one place
DAILY_BUDGET = 800          # OWM calls a day (free up to 1,000; the owner can set a daily cap in the OWM account too)
MAX_PLACES = 4              # places fetched from OWM at once; more → Open-Meteo for those
PLACE_IDLE_S = 40 * 60      # a place no panel asked for this long: not fetched any more
OM_TTL = 15 * 60            # an Open-Meteo forecast is kept this long
OM_PER_MIN = 60             # Open-Meteo calls a minute at most (the cache answers the rest)
OM_RETRY_S = 5 * 60         # (v3.0.4) a place (or a day's hours) Open-Meteo failed for: not asked again before this
HOURS_MAX = 300             # days' hours kept (each until its day is over)
TIMEOUT = 10
COUNT_FILE = "owm-calls.json"
UNITS = {"temp": "C", "wind": "km/h"}
YMD = re.compile(r"\d{4}-\d{2}-\d{2}")


def resolve(src, hub=False, card=True, owm=False):
    """What a card's source shows now: "hub" | "owm" | "om". hub: a Hubitat weather device is connected (on, picked);
    card: the house switch as stored (the default for "auto"); owm: a key is set."""
    if src == "hub":
        return "hub" if hub else "om"
    if src == "owm":
        return "owm" if owm else "om"
    if src == "om":
        return "om"
    return "hub" if hub and card else "owm" if owm else "om"   # ("auto", or none: today's behavior)


def place_key(lat, lon):
    """(lat, lon) checked and rounded → "lat,lon", or None."""
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return None
    if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return f"{round(lat, 2):.2f},{round(lon, 2):.2f}"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):   # (never followed: the key stays where it was sent)
        return None


def _opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect(),
                                       urllib.request.HTTPSHandler(context=ssl.create_default_context()))


def _n(v, lo=-1e6, hi=1e6):
    return round(float(v), 1) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and lo <= v <= hi else None


def _at(a, i):
    return a[i] if isinstance(a, list) and 0 <= i < len(a) else None


def _owm_wmo(w):
    """OWM's weather list → a WMO code (weather_device's table)."""
    w = w[0] if isinstance(w, list) and w and isinstance(w[0], dict) else {}
    return weather_device._owm_id(w["id"]) if isinstance(w.get("id"), int) and not isinstance(w.get("id"), bool) else None


def _local_ymd(t, off):
    return datetime.datetime.fromtimestamp(t + off, datetime.timezone.utc).strftime("%Y-%m-%d")


def _epoch_local(s, off):
    """Open-Meteo's local "YYYY-MM-DDTHH:MM" (timezone=auto) → epoch s."""
    try:
        return int(datetime.datetime.fromisoformat(s).replace(tzinfo=datetime.timezone.utc).timestamp()) - off
    except (TypeError, ValueError):
        return None


def parse_owm(j):
    """One Call 3.0's answer → (forecast dict without "source" / "fallback", hours list) or None."""
    if not isinstance(j, dict) or not isinstance(j.get("current"), dict) or not isinstance(j.get("daily"), list):
        return None
    off = j.get("timezone_offset") if isinstance(j.get("timezone_offset"), int) and abs(j["timezone_offset"]) <= 14 * 3600 else 0
    c = j["current"]
    now_t = c.get("dt") if isinstance(c.get("dt"), int) else int(time.time())
    sr, ss = c.get("sunrise"), c.get("sunset")
    wmo = _owm_wmo(c.get("weather"))
    desc = (c.get("weather") or [{}])[0].get("description") if isinstance(c.get("weather"), list) and c["weather"] and isinstance(c["weather"][0], dict) else None
    kmh = lambda v: None if _n(v) is None else round(v * 3.6, 1)   # noqa: E731  (metric: m/s)
    now = {"temp": _n(c.get("temp")), "feels": _n(c.get("feels_like")), "humidity": _n(c.get("humidity"), 0, 100),
           "wind": kmh(c.get("wind_speed")), "gusts": kmh(c.get("wind_gust")), "wmo": wmo,
           "text": weather_device.clean_text(desc, 60) or None,
           "isDay": (sr <= now_t < ss) if isinstance(sr, int) and isinstance(ss, int) else None}
    days = []
    for d in j["daily"][:8]:
        if not isinstance(d, dict) or not isinstance(d.get("dt"), int):
            continue
        t = d.get("temp") if isinstance(d.get("temp"), dict) else {}
        pop = _n(d.get("pop"), 0, 1)
        days.append({"ymd": _local_ymd(d["dt"], off), "wmo": _owm_wmo(d.get("weather")), "high": _n(t.get("max")), "low": _n(t.get("min")),
                     "rainPct": None if pop is None else round(pop * 100), "sunrise": d.get("sunrise") if isinstance(d.get("sunrise"), int) else None,
                     "sunset": d.get("sunset") if isinstance(d.get("sunset"), int) else None, "from": "owm"})
    hours = []
    for h in (j.get("hourly") if isinstance(j.get("hourly"), list) else [])[:48]:
        if not isinstance(h, dict) or not isinstance(h.get("dt"), int):
            continue
        pop = _n(h.get("pop"), 0, 1)
        w = (h.get("weather") or [{}])[0] if isinstance(h.get("weather"), list) and h["weather"] else {}
        hours.append({"t": h["dt"], "temp": _n(h.get("temp")), "wmo": _owm_wmo(h.get("weather")), "rainPct": None if pop is None else round(pop * 100),
                      "wind": kmh(h.get("wind_speed")), "isDay": not str(w.get("icon", "")).endswith("n") if isinstance(w, dict) else None, "from": "owm"})
    alerts = []
    for a in (j.get("alerts") if isinstance(j.get("alerts"), list) else [])[:weather_device.MAX_ALERTS]:
        if isinstance(a, dict) and isinstance(a.get("event"), str):
            alerts.append({"event": weather_device.clean_text(a["event"], 60), "sender": weather_device.clean_text(a.get("sender_name"), 60) or None,
                           "start": a.get("start") if isinstance(a.get("start"), int) else None, "end": a.get("end") if isinstance(a.get("end"), int) else None,
                           "text": weather_device.clean_text(a.get("description"), 300) or None})
    return ({"units": dict(UNITS), "updatedAt": now_t, "utcOffset": off, "today": _local_ymd(now_t, off), "now": now, "days": days,
             "hoursTo": hours[-1]["t"] if hours else None, "alerts": alerts}, hours)


def parse_om(j):
    """Open-Meteo's daily + current answer → the forecast dict (from "om"), or None."""
    if not isinstance(j, dict) or not isinstance(j.get("daily"), dict) or not isinstance(j["daily"].get("time"), list):
        return None
    off = j.get("utc_offset_seconds") if isinstance(j.get("utc_offset_seconds"), int) and abs(j["utc_offset_seconds"]) <= 14 * 3600 else 0
    c, d = j.get("current") if isinstance(j.get("current"), dict) else {}, j["daily"]
    days = []
    for i, t in enumerate(d["time"][:16]):
        if not isinstance(t, str) or not YMD.fullmatch(t[:10]):
            continue
        rain = _n(_at(d.get("precipitation_probability_max"), i), 0, 100)
        days.append({"ymd": t[:10], "wmo": _at(d.get("weather_code"), i) if isinstance(_at(d.get("weather_code"), i), int) else None,
                     "high": _n(_at(d.get("temperature_2m_max"), i)), "low": _n(_at(d.get("temperature_2m_min"), i)),
                     "rainPct": None if rain is None else round(rain), "sunrise": _epoch_local(_at(d.get("sunrise"), i), off),
                     "sunset": _epoch_local(_at(d.get("sunset"), i), off), "from": "om"})
    now = {"temp": _n(c.get("temperature_2m")), "feels": _n(c.get("apparent_temperature")), "humidity": _n(c.get("relative_humidity_2m"), 0, 100),
           "wind": _n(c.get("wind_speed_10m")), "gusts": _n(c.get("wind_gusts_10m")),
           "wmo": c.get("weather_code") if isinstance(c.get("weather_code"), int) else None, "text": None,
           "isDay": bool(c["is_day"]) if isinstance(c.get("is_day"), int) else None}
    today = c["time"][:10] if isinstance(c.get("time"), str) and YMD.fullmatch(c["time"][:10]) else (days[0]["ymd"] if days else None)
    return {"units": dict(UNITS), "updatedAt": int(time.time()), "utcOffset": off, "today": today, "now": now, "days": days,
            "hoursTo": None, "alerts": []}


def parse_om_hours(j):
    if not isinstance(j, dict) or not isinstance(j.get("hourly"), dict) or not isinstance(j["hourly"].get("time"), list):
        return None
    off = j.get("utc_offset_seconds") if isinstance(j.get("utc_offset_seconds"), int) and abs(j["utc_offset_seconds"]) <= 14 * 3600 else 0
    h, out = j["hourly"], []
    for i, s in enumerate(h["time"][:48]):
        t = _epoch_local(s, off)
        if t is None:
            continue
        rain, day = _n(_at(h.get("precipitation_probability"), i), 0, 100), _at(h.get("is_day"), i)
        out.append({"t": t, "temp": _n(_at(h.get("temperature_2m"), i)), "wmo": _at(h.get("weather_code"), i) if isinstance(_at(h.get("weather_code"), i), int) else None,
                    "rainPct": None if rain is None else round(rain), "wind": _n(_at(h.get("wind_speed_10m"), i)),
                    "isDay": bool(day) if isinstance(day, int) else None, "from": "om"})
    return out, off


def merge_days(first, rest):
    """first's days (OWM's, or the device's), then rest's for the dates after them — one per date, in order."""
    out, had = [], set()
    for d in list(first or []) + list(rest or []):
        if isinstance(d, dict) and isinstance(d.get("ymd"), str) and d["ymd"] not in had and (not out or d["ymd"] > out[-1]["ymd"]):
            had.add(d["ymd"])
            out.append(d)
    return out


class Sources:
    """The server's weather fetches (one per server). key_fn() → the OWM key ("" = none), read at each call."""

    def __init__(self, house_dir, key_fn, clock=time.time, log=None, owm_base=OWM_BASE, om_base=OM_BASE,
                 budget=DAILY_BUDGET, interval=INTERVAL_S, opener=None):
        self.house = pathlib.Path(house_dir)
        self.key_fn, self.clock, self.log = key_fn, clock, log or (lambda m: None)
        self.owm_base, self.om_base, self.budget, self.interval_min = owm_base, om_base, max(1, int(budget)), interval
        self.opener = opener or _opener()
        self.lock, self.fetch_lock = threading.Lock(), threading.Lock()
        self.owm, self.om, self.hrs, self.asked = {}, {}, {}, {}   # place → {at, data, hours?} / (place, ymd) → {...} / place → last asked
        # (v3.0.4) om_failed: place or (place, ymd) → when Open-Meteo last failed for it (OM_RETRY_S); home: the places a
        # panel asked for as the house's own (a card's first place) → when — only their warnings go to the panels' alerts
        self.om_failed, self.home = {}, {}
        self.om_calls, self.last_error = [], None
        self.count = self._load_count()
        self.on_alerts = None   # (v3.0.4) on_alerts(doc) after each OWM forecast: its warnings for the panels' alerts (server.py)

    # ---------- the day's OWM calls ----------
    def _day(self):
        return datetime.datetime.fromtimestamp(self.clock(), datetime.timezone.utc).strftime("%Y-%m-%d")

    def _load_count(self):
        try:
            d = json.loads((self.house / COUNT_FILE).read_text(encoding="utf-8"))
            if isinstance(d, dict) and isinstance(d.get("day"), str) and isinstance(d.get("n"), int):
                return {"day": d["day"], "n": max(0, d["n"])}
        except (OSError, ValueError):
            pass
        return {"day": "", "n": 0}

    def calls_today(self):
        return self.count["n"] if self.count["day"] == self._day() else 0

    def _count_call(self):
        day = self._day()
        self.count = {"day": day, "n": (self.count["n"] if self.count["day"] == day else 0) + 1}
        try:
            self.house.mkdir(parents=True, exist_ok=True)
            p = self.house / COUNT_FILE
            tmp = p.with_name(f".{p.name}.{secrets.token_hex(4)}.tmp")
            tmp.write_text(json.dumps(self.count), encoding="utf-8")
            tmp.replace(p)
        except OSError:
            pass

    def has_key(self):
        k = (self.key_fn() or "").strip()
        return bool(KEY_RE.fullmatch(k))

    def _places(self, now):
        """The OWM places asked for lately, the longest-known first."""
        for p in [p for p, t in self.asked.items() if now - t > PLACE_IDLE_S]:
            self.asked.pop(p, None)
        return list(self.asked)

    def every(self, places=None):
        """Seconds between two calls for one place: at least INTERVAL_S, longer when the places would pass the budget."""
        n = max(1, min(MAX_PLACES, len(self._places(self.clock())) if places is None else places))
        return max(self.interval_min, math.ceil(n * 86400 / self.budget))

    def status(self):
        """For the Manager (never the key): {key, calls, budget, every, places, error}."""
        with self.lock:
            return {"key": self.has_key(), "calls": self.calls_today(), "budget": self.budget, "every": self.every(),
                    "places": len(self._places(self.clock())), "error": self.last_error}

    # ---------- fetching ----------
    def _get(self, url):
        req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Skypane"})
        with self.opener.open(req, timeout=TIMEOUT) as r:
            if r.status != 200:
                raise ValueError("status")
            return json.loads(r.read(2 * 1024 * 1024).decode("utf-8", "replace"))

    def _om_ok(self, now):
        self.om_calls = [t for t in self.om_calls if now - t < 60]
        if len(self.om_calls) >= OM_PER_MIN:
            return False
        self.om_calls.append(now)
        return True

    def _om_forecast(self, pk):
        now = self.clock()
        with self.lock:
            e = self.om.get(pk)
            if e and now - e["at"] < OM_TTL:
                return e["data"]
            if now - self.om_failed.get(pk, -OM_RETRY_S) < OM_RETRY_S or not self._om_ok(now):   # (failed lately: no retry loop)
                return e["data"] if e else None
        lat, lon = pk.split(",")
        url = self.om_base + "?" + urllib.parse.urlencode({
            "latitude": lat, "longitude": lon, "timezone": "auto", "forecast_days": 16,
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,is_day",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
            "temperature_unit": "celsius", "wind_speed_unit": "kmh"})
        try:
            data = parse_om(self._get(url))
        except Exception as ex:   # (an odd answer too: the kind only, and the last forecast stays)
            self.log(f"weather: Open-Meteo didn't answer ({type(ex).__name__})")
            data = None
        with self.lock:
            if data is None:
                self.om_failed[pk] = now
                return e["data"] if e else None
            self.om_failed.pop(pk, None)
            self.om[pk] = {"at": now, "data": data}
            if len(self.om) > 50:
                self.om.pop(min(self.om, key=lambda k: self.om[k]["at"]))
        return data

    def _owm_fetch(self, pk, key):
        """One One Call (counted, even when it fails). → (data, hours) or None. The error never holds the address."""
        lat, lon = pk.split(",")
        url = self.owm_base + "?" + urllib.parse.urlencode({"lat": lat, "lon": lon, "units": "metric", "appid": key})
        self._count_call()
        try:
            got = parse_owm(self._get(url))
            if got is None:
                raise ValueError("not a forecast")
            self.last_error = None
            return got
        except urllib.error.HTTPError as ex:
            self.last_error = "key" if ex.code in (401, 403) else "limit" if ex.code == 429 else "error"
        except (urllib.error.URLError, OSError, ValueError):
            self.last_error = "unreachable"
        except Exception as ex:   # (an odd answer the parser trips on: still a try — the caller sets "tried", no retry loop)
            self.last_error = "error"
            self.log(f"weather: OpenWeatherMap's answer not read ({type(ex).__name__})")
            return None
        self.log(f"weather: OpenWeatherMap didn't answer ({self.last_error})")
        return None

    def _owm(self, pk):
        """→ (entry {at, data, hours} | None, fallback | None). Fetched when due and the day's budget allows."""
        key = (self.key_fn() or "").strip()
        if not KEY_RE.fullmatch(key):
            return None, "no-key"
        now = self.clock()
        with self.lock:
            self.asked.setdefault(pk, now)
            self.asked[pk] = now
            places = self._places(now)
            if pk not in places[:MAX_PLACES]:
                return None, "places"
            e = self.owm.get(pk)
            due = not e or now - e["tried"] >= self.every(len(places))
            if due and self.calls_today() >= self.budget:
                return (e, None) if e else (None, "budget")
        got = None
        if due:
            with self.fetch_lock:   # (one call at a time: a second panel asking meanwhile gets this one's answer)
                with self.lock:
                    e = self.owm.get(pk)
                    due = not e or now - e["tried"] >= self.every(len(places))
                if due:
                    got = self._owm_fetch(pk, key)
                    with self.lock:
                        if got:
                            e = self.owm[pk] = {"at": now, "tried": now, "data": got[0], "hours": got[1]}
                        elif e:
                            e["tried"] = now
                        else:
                            self.owm[pk] = e = {"at": 0, "tried": now, "data": None, "hours": []}
            if got:
                self._tell_alerts(now)
        if not e or not e.get("data"):
            return None, "error"
        return e, None

    def alerts_doc(self, now=None):
        """(v3.0.4) The warnings of every place still fetched (weather_device.OWM_TOPIC's format): each once, the
        ended ones left out."""
        now = self.clock() if now is None else now
        out, seen = [], set()
        with self.lock:
            places = set(self._places(now))
            home = {p for p, t in self.home.items() if now - t < PLACE_IDLE_S}
            for pk, e in self.owm.items():   # (v3.0.4: the house's own places only — Tokyo's storm isn't the house's alert)
                for a in ((e.get("data") or {}).get("alerts") or []) if pk in places and pk in home else []:
                    k = (a["event"].casefold(), a.get("start"))
                    if k in seen or (a.get("end") and a["end"] <= now):
                        continue
                    seen.add(k)
                    out.append(dict(a))
        return {"v": 1, "at": int(now), "alerts": out[:weather_device.MAX_ALERTS]}

    def _tell_alerts(self, now):
        if callable(self.on_alerts):
            try:
                self.on_alerts(self.alerts_doc(now))
            except Exception as ex:   # (the forecast is answered whatever happens to the warnings)
                self.log(f"weather: OpenWeatherMap warnings not passed on ({type(ex).__name__})")

    def forecast(self, lat, lon, src="om", home=False):
        """The place's forecast from src ("owm" | "om"; OWM's days first, Open-Meteo's after them) — see the docstring.
        home: asked as the house's own place (its warnings may go to the panels' alerts — alerts_doc)."""
        pk = place_key(lat, lon)
        if pk is None:
            return {"ok": False, "error": "place"}
        if home:
            with self.lock:
                self.home[pk] = self.clock()
        fb = None
        if src == "owm":
            e, fb = self._owm(pk)
            if e:
                om = self._om_forecast(pk)
                d = dict(e["data"])
                d["days"] = merge_days(d["days"], om["days"] if om else [])
                return {"ok": True, "source": "owm", "fallback": None, **d}
        om = self._om_forecast(pk)
        if om is None:
            return {"ok": False, "error": "unreachable"}
        return {"ok": True, "source": "om", "fallback": fb, **om}

    def hours(self, lat, lon, ymd, src="om"):
        """One day's hours (the place's own date): OWM's (its 48 h) where it has them, Open-Meteo's for the rest. Open-
        Meteo's are fetched once per place and day and kept until that day is over (HOURS_MAX)."""
        pk = place_key(lat, lon)
        if pk is None or not isinstance(ymd, str) or not YMD.fullmatch(ymd):
            return {"ok": False, "error": "place" if pk is None else "date"}
        now = self.clock()
        utc_day = datetime.datetime.fromtimestamp(now, datetime.timezone.utc).date()
        try:
            day = datetime.date.fromisoformat(ymd)
        except ValueError:
            return {"ok": False, "error": "date"}
        if not -1 <= (day - utc_day).days <= 16:
            return {"ok": False, "error": "date"}
        owm_h, src_used = [], "om"
        if src == "owm":
            e, _fb = self._owm(pk)
            if e:
                off = e["data"].get("utcOffset") or 0
                owm_h = [h for h in e.get("hours") or [] if _local_ymd(h["t"], off) == ymd]
                src_used = "owm" if owm_h else "om"
        hk = (pk, ymd)
        with self.lock:
            got = self.hrs.get(hk)
        if got is None and len(owm_h) < 24:
            lat_s, lon_s = pk.split(",")
            url = self.om_base + "?" + urllib.parse.urlencode({
                "latitude": lat_s, "longitude": lon_s, "timezone": "auto", "start_date": ymd, "end_date": ymd,
                "hourly": "temperature_2m,weather_code,precipitation_probability,wind_speed_10m,is_day",
                "temperature_unit": "celsius", "wind_speed_unit": "kmh"})
            with self.lock:
                ok = now - self.om_failed.get(hk, -OM_RETRY_S) >= OM_RETRY_S and self._om_ok(now)
            parsed = None
            if ok:
                try:
                    parsed = parse_om_hours(self._get(url))
                except Exception as ex:   # (an odd answer too: the kind only)
                    self.log(f"weather: Open-Meteo's hours didn't come ({type(ex).__name__})")
                if parsed is None:
                    with self.lock:
                        self.om_failed[hk] = now
                        if len(self.om_failed) > 200:
                            self.om_failed.pop(min(self.om_failed, key=self.om_failed.get))
            if parsed is not None:
                with self.lock:
                    # (kept until the place's own date is past that day; the oldest go first past HOURS_MAX)
                    got = self.hrs[hk] = {"hours": parsed[0], "off": parsed[1], "at": now}
                    for k in [k for k, v in self.hrs.items() if _local_ymd(now, v["off"]) > k[1]]:
                        self.hrs.pop(k, None)
                    while len(self.hrs) > HOURS_MAX:
                        self.hrs.pop(min(self.hrs, key=lambda k: self.hrs[k]["at"]))
        have = {h["t"] for h in owm_h}
        hours = sorted(owm_h + [h for h in (got["hours"] if got else []) if h["t"] not in have], key=lambda h: h["t"])
        if not hours:
            return {"ok": False, "error": "unreachable"}
        return {"ok": True, "ymd": ymd, "source": src_used, "units": dict(UNITS), "hours": hours}


# ---------- (v3.0.4) once: every weather card gets the source it showed ----------
# Before 3.0.4 the house switch (weather-device.json "card", Integrations) decided for every card: the Hubitat device on
# the house's own place, else Open-Meteo. The first start of 3.0.4 writes that into each weather card that has no source
# yet — every panel's Home and room grids (o.src), the built-in layouts' weather (the panel setting weather.src) and the
# saved cards — so nothing looks different. Once: the marker DATA_DIR/house/.weather-v304 (a crash before it: the next
# start goes on; cards with a source are left alone, so it's idempotent). Each panel is written with Store.modify (the
# store backs the file up first: backups/); the saved cards' file is copied to house/card-templates.v304-weather.json.
MARK, TPL_BACKUP = ".weather-v304", "card-templates.v304-weather.json"


def old_source(cfg):
    """The source the cards used before 3.0.4: "hub" with the device on, picked and the house switch on, else "om"."""
    cfg = cfg if isinstance(cfg, dict) else {}
    return "hub" if cfg.get("on") and cfg.get("device") and cfg.get("card") else "om"


def _set_cards(g, src):
    """A grid with src written into its weather cards that have none → (new grid, how many) — (g, 0) when none."""
    if not isinstance(g, dict) or not isinstance(g.get("cards"), list):
        return g, 0
    n, cards = 0, []
    for c in g["cards"]:
        if isinstance(c, dict) and c.get("t") == "weather" and not (isinstance(c.get("o"), dict) and c["o"].get("src") in SOURCES):
            c = {**c, "o": {**(c.get("o") if isinstance(c.get("o"), dict) else {}), "src": src}}
            n += 1
        cards.append(c)
    return ({**g, "cards": cards}, n) if n else (g, 0)


def migrate_settings(s, src):
    """A panel's settings → ({changed keys: new value}, cards changed)."""
    s = s if isinstance(s, dict) else {}
    ch, n = {}, 0
    hg, k = _set_cards(s.get("homeGrid"), src)
    if k:
        ch["homeGrid"], n = hg, n + k
    rooms = s.get("roomGrids") if isinstance(s.get("roomGrids"), dict) else {}
    new_rooms = dict(rooms)
    for r, g in rooms.items():
        ng, k = _set_cards(g, src)
        if k:
            new_rooms[r], n = ng, n + k
    if new_rooms != rooms:
        ch["roomGrids"] = new_rooms
    w = s.get("weather") if isinstance(s.get("weather"), dict) else {}
    if w.get("src") not in SOURCES:   # (a built-in layout's weather — and the one shown after going back to one)
        ch["weather"] = {**w, "src": src}
    return ch, n


def migrate_v304(data_dir, store, cfg, log=None):
    """Once. cfg: the weather device setting as saved (weather_device.clean_config). → {"ran": False} when it ran
    before, else {"ran": True, "src", "panels": [pid changed], "cards": n, "saved": n, "failed": n}."""
    house = pathlib.Path(data_dir) / "house"
    mark = house / MARK
    if mark.exists():
        return {"ran": False}
    src, panels, cards, failed, built = old_source(cfg), [], 0, 0, 0
    for pid in store.panel_ids():
        got = {}

        def change(data):
            s = data.get("settings") if isinstance(data.get("settings"), dict) else {}
            ch, n = migrate_settings(s, src)
            got["n"], got["w"] = n, "weather" in ch
            return {"settings": {**s, **ch}} if ch else {}

        try:
            doc = store.get(pid)
            if not doc.get("exists", True) or not migrate_settings(doc["data"].get("settings"), src)[0]:
                continue   # (nothing to write: no backup either)
            store.modify(pid, change)
        except Exception as e:   # (one panel that can't be read / written: the others still move; logged)
            failed += 1
            if log:
                log(f"weather (3.0.4): panel {pid} kept as it was ({type(e).__name__}) - tried again at the next start")
            continue
        panels.append(pid)
        cards += got.get("n", 0)
        built += 1 if got.get("w") else 0   # (a panel's built-in layouts' weather: no card of its own)
    saved = 0
    tpl = house / "card-templates.json"
    try:
        doc = json.loads(tpl.read_text(encoding="utf-8")) if tpl.exists() else None
    except (OSError, ValueError):
        doc = None
    if isinstance(doc, dict) and isinstance(doc.get("templates"), list):
        for t in doc["templates"]:
            c = t.get("card") if isinstance(t, dict) else None
            if isinstance(c, dict):
                g, k = _set_cards({"cards": [c]}, src)
                if k:
                    t["card"], saved = g["cards"][0], saved + 1
        if saved:
            backup = house / TPL_BACKUP
            if not backup.exists():
                backup.write_bytes(tpl.read_bytes())
            tmp = tpl.with_name(f".{tpl.name}.wx304.tmp")
            tmp.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            tmp.replace(tpl)
    if failed:   # (no marker: the next start tries the ones left — the others already have their source)
        return {"ran": True, "src": src, "panels": panels, "cards": cards, "saved": saved, "failed": failed}
    house.mkdir(parents=True, exist_ok=True)
    mark.write_text("3.0.4\n", encoding="utf-8")
    if log and (panels or saved):
        words = "the Hubitat device" if src == "hub" else "Built-in (Open-Meteo)"
        # (tester 1 #7: a panel counts when only its built-in layouts' weather moved — "2 cards on 3 panels" said why not)
        log(f"weather (3.0.4): {cards} weather card(s), the built-in layouts' weather on {built} panel(s) and {saved} saved card(s)"
            f" now say {words} - as they showed ({len(panels)} panel(s) changed)")
    return {"ran": True, "src": src, "panels": panels, "cards": cards, "saved": saved, "failed": 0}
