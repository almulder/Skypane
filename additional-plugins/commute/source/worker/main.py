"""Commute plugin for Skypane: the worker.

One loop owns every call to TomTom. It asks only for commutes a card looked at in the last 15 minutes, on a schedule
set by the time of day (commute_core.plan): every 5 minutes in the two hours before it's time to leave, less often the
rest of the time. The panels only ever read what the loop last got, so more panels never mean more TomTom calls.

Addresses are found once (TomTom Search) and only their map points are kept, in the plugin's private data (geo.json,
0600, keyed by a hash of the address). Addresses, map points and the key never go to a card or the log.

The map reaches the sealed card as data: PNGs inside JSON: the street map squares (map route, sent again only when the
area or look changes) and the see-through traffic squares (traffic route, every 10 minutes at most). The card stacks
them and draws the route line from points in the mosaic's pixels (status route).
"""
import base64
import datetime
import hashlib
import json
import os
import threading
import time

import skypane_plugin as sp
import commute_core as cc
import tomtom as tt

lock = threading.RLock()
stop = threading.Event()
wake = threading.Event()
WORDS = {}

ACTIVE_SEC = 15 * 60          # a commute a card asked about within this long is kept up to date
RETRY_SEC = (60, 120, 300, 600, 1800)   # after TomTom failures
MAP_REFRESH_SEC = 24 * 3600   # street map squares fetched again at least this often
LOOKS = ("day", "night")

S = {}            # trip id → its state (below)
asked = {}        # trip id → when a card last asked
wanted = {}       # trip id → {look: when a card with the map on, in that look, last asked}


def w(key, **kw):
    global WORDS
    if not WORDS:
        try:
            with open(os.path.join(os.environ.get("SKYPANE_PLUGIN_DIR", "."), "strings", "en.json"), encoding="utf-8") as f:
                WORDS = json.load(f)
        except (OSError, ValueError):
            WORDS = {}
    s = WORDS.get(key, key)
    for k, v in kw.items():
        s = s.replace("{" + k + "}", str(v))
    return s


# ---------- settings ----------
def base_url(settings):
    """TomTom, or (tests only, by editing settings.json by hand) a stand-in on this machine."""
    b = settings.get("baseUrl")
    if isinstance(b, str) and b.startswith("http://127.0.0.1:") and len(b) < 40:
        return b.rstrip("/")
    return tt.BASE


def api_key(settings):
    k = settings.get("apiKey")
    return k.strip() if isinstance(k, str) else ""


def trip_of(item):
    """A settings list item → the trip as the loop uses it, or (None, word key of the problem)."""
    if not isinstance(item, dict):
        return None, "c.setup"
    home, work = str(item.get("home") or "").strip(), str(item.get("work") or "").strip()
    if not home or not work:
        return None, "c.setup"
    arrive = cc.parse_time(item.get("arriveBy"))
    if arrive is None:
        return None, "test.badTime"
    ha_text = str(item.get("homeAfter") or "").strip()
    home_after = cc.parse_time(ha_text) if ha_text else None
    if ha_text and home_after is None:
        return None, "test.badHomeAfter"
    try:
        margin = max(0, min(60, int(item.get("margin") or 0)))
    except (TypeError, ValueError):
        margin = 0
    how = item.get("how") if item.get("how") in ("car", "bike", "walk") else "car"
    return {"id": item.get("id"), "name": str(item.get("name") or "")[:40], "home": home, "work": work, "arriveBy": arrive, "how": how,
            "homeAfter": home_after, "days": item.get("days") or "weekdays", "margin": margin}, None


def trips(settings=None):
    settings = settings if settings is not None else sp.settings()
    out = {}
    for it in settings.get("trips") or []:
        if isinstance(it, dict) and it.get("id"):
            out[it["id"]] = it
    return out


def addr_key(text):
    return hashlib.sha256(" ".join(text.lower().split()).encode("utf-8")).hexdigest()[:32]


def where(base, key, text, timeout=8):
    """An address's map point, from geo.json or (once) from TomTom."""
    k = addr_key(text)
    geo = sp.read_private("geo.json", {})
    hit = geo.get(k)
    if isinstance(hit, list) and len(hit) == 2:
        return float(hit[0]), float(hit[1])
    lat, lon = tt.geocode(base, key, text, timeout)
    geo = sp.read_private("geo.json", {})
    geo[k] = [round(lat, 6), round(lon, 6)]
    if len(geo) > 40:                      # (old addresses drop off)
        for old in list(geo)[: len(geo) - 40]:
            geo.pop(old, None)
    sp.write_private("geo.json", geo)
    return lat, lon


# ---------- time ----------
def now_local(settings=None):
    """Now, here. (Tests only, with the stand-in TomTom: a hidden "testClock" of "<weekday 0-6> HH:MM" sets the day
    and time, so the schedule can be tested at any hour.)"""
    now = datetime.datetime.now().astimezone()
    tc = (settings or {}).get("testClock")
    if isinstance(tc, str) and base_url(settings) != tt.BASE:
        try:
            d, hm = tc.split()
            h, m = hm.split(":")
            now = now.replace(hour=int(h), minute=int(m), second=0, microsecond=0)
            now = now + datetime.timedelta(days=(int(d) - now.weekday()) % 7)
        except (ValueError, TypeError):
            pass
    return now


def rfc3339(dt):
    s = dt.strftime("%Y-%m-%dT%H:%M:%S%z")
    return s[:-2] + ":" + s[-2:]


def arrive_dt(now, minutes):
    return now.replace(hour=minutes // 60, minute=minutes % 60, second=0, microsecond=0)


# ---------- the loop ----------
def state(tid):
    st = S.get(tid)
    if st is None:
        st = S[tid] = {"next": 0, "fails": 0, "err": None, "r": None, "plan": None, "mode": None, "when": 0, "sig": None,
                       "grid": None, "rv": 0, "line": None, "home": None, "work": None,
                       "maps": {}, "traffic": {}}
    return st


def png_url(b):
    return "data:image/png;base64," + base64.b64encode(b).decode("ascii")


def refresh_min(settings):
    try:
        n = int(settings.get("refresh") or 5)
    except (TypeError, ValueError):
        n = 5
    return n if n in cc.REFRESH_CHOICES else 5


def refresh(tid, item, settings, now=None, timeout=10):
    """Ask TomTom for one commute's drive, when the schedule says so (commute_core.plan), and the map squares a card
    wants. Returns the error kind or None."""
    trip, bad = trip_of(item)
    st = state(tid)
    if trip is None or not api_key(settings):
        st["err"] = "setup"
        return "setup"
    key = api_key(settings)
    base = base_url(settings)
    now = now or now_local(settings)
    now_min = now.hour * 60 + now.minute
    p = cc.plan(trip, now_min, now.weekday(), st.get("workTravel"), refresh_min(settings))
    if not p["ask"]:                                  # (resting: nothing to ask TomTom)
        with lock:
            st.update(plan=p, next=time.time() + p["every"], trip=trip)
        return None
    sig = addr_key(trip["home"] + "|" + trip["work"])
    try:
        home = where(base, key, trip["home"], timeout)
        work = where(base, key, trip["work"], timeout)
        a, b = (work, home) if p["to"] == "home" else (home, work)
        car = trip["how"] == "car"
        if not car and p["ask"] == "typical":
            p = dict(p, ask="estimate")             # (a bike or walk takes the same time whenever: ask it plainly)
        arrive_at = rfc3339(arrive_dt(now, trip["arriveBy"])) if p["ask"] == "typical" else None
        try:
            r = tt.route(base, key, a, b, arrive_at, timeout, trip["how"])
        except tt.TTError as e:
            if not (arrive_at and e.kind == "notfound"):
                raise
            p = dict(p, ask="live")                  # (TomTom refused an arrival time: the drive now instead)
            r = tt.route(base, key, a, b, None, timeout, trip["how"])
    except tt.TTError as e:
        with lock:
            st["err"] = e.kind
            st["fails"] += 1
            st["next"] = time.time() + RETRY_SEC[min(st["fails"], len(RETRY_SEC)) - 1]
        return e.kind
    r["to"] = p["to"]
    r["typical"] = p["ask"] in ("typical", "estimate")
    r["how"] = trip["how"]
    r["cum"] = cc.along(r["points"])
    grid = cc.grid_for(r["points"] + [home, work])
    line = cc.route_line(grid, r["points"])
    with lock:
        if st["grid"] != grid or st["sig"] != sig:
            st["maps"] = {}
            st["traffic"] = {}
        if st["line"] != line or st["grid"] != grid:
            st["rv"] += 1
        st.update(err=None, fails=0, r=r, plan=p, when=time.time(), sig=sig, grid=grid, line=line,
                  home=cc.to_mosaic(grid, home[0], home[1]), work=cc.to_mosaic(grid, work[0], work[1]),
                  trip=trip, next=time.time() + p["every"])
        if p["to"] == "work":
            st["workTravel"] = r["travel"]
    if p["ask"] == "live":
        pictures(tid, settings)
    return None


def pictures(tid, settings):
    """Fetch the street map and traffic squares for the looks a card showing the map asked for lately (only while a
    drive is shown: the traffic picture as often as the owner's live checks, the street map once a day)."""
    st = state(tid)
    grid = st.get("grid")
    key = api_key(settings)
    if not grid or not key or (st.get("plan") or {}).get("ask") != "live":
        return
    base = base_url(settings)
    now = time.time()
    every = refresh_min(settings) * 60
    for look in LOOKS:
        if now - (wanted.get(tid) or {}).get(look, 0) > ACTIVE_SEC:
            continue
        m = st["maps"].get(look)
        if not m or now - m["when"] > MAP_REFRESH_SEC or (m.get("missing") and now - m["when"] > 600):
            imgs, missing = [], 0
            for z, x, y in cc.tiles_of(grid):
                try:
                    imgs.append(png_url(tt.map_tile(base, key, look, z, x, y)))
                except tt.TTError as e:
                    imgs.append(None)
                    missing += 1
                    if e.kind in ("offline", "badkey", "busy"):
                        break
            with lock:
                if st.get("grid") == grid:
                    st["maps"][look] = {"v": "%d-%s" % (int(now), look[0]), "when": now, "imgs": imgs, "missing": missing}
        if (st.get("trip") or {}).get("how", "car") != "car":
            continue                                   # (bike / walk: no traffic picture)
        t = st["traffic"].get(look)
        if not t or now - t["when"] >= every - 5:
            imgs = []
            for z, x, y in cc.tiles_of(grid):
                try:
                    imgs.append(png_url(tt.traffic_tile(base, key, look, z, x, y)))
                except tt.TTError as e:
                    imgs.append(None)
                    if e.kind in ("offline", "badkey", "busy"):
                        break
            with lock:
                if st.get("grid") == grid:
                    st["traffic"][look] = {"v": "%d-%s" % (int(now), look[0]), "when": now, "imgs": imgs}


def loop():
    while not stop.is_set():
        wake.wait(2.0)
        wake.clear()
        try:
            settings = sp.settings()
            items = trips(settings)
            now = time.time()
            for tid, item in items.items():
                if now - asked.get(tid, 0) > ACTIVE_SEC:
                    continue
                st = state(tid)
                if now >= st["next"]:
                    refresh(tid, item, settings)
                else:
                    pictures(tid, settings)        # (a card switched the map on, or to the other look)
            for tid in list(S):
                if tid not in items:
                    S.pop(tid, None)
        except Exception as e:  # noqa: BLE001 (the loop must keep going)
            sp.log("loop error: " + type(e).__name__)
            time.sleep(5)


@sp.on_settings
def changed(settings):
    with lock:
        for st in S.values():
            st["next"] = 0
    wake.set()


# ---------- panel routes ----------
def card_of(req):
    me = req.get("card")
    for c in req.get("cards") or []:
        if c.get("card") == me:
            return c.get("o") or {}
    return None


def mine(req):
    """The asking card's commute id, its item and options; sp.Error if none."""
    o = card_of(req)
    if o is None:
        raise sp.Error("not-mine", 404)
    tid = o.get("trip")
    items = trips()
    if not tid:
        return None, None, o, "notrip"
    if tid not in items:
        return tid, None, o, "gone"
    return tid, items[tid], o, None


def note(tid, o):
    now = time.time()
    first = now - asked.get(tid, 0) > ACTIVE_SEC
    asked[tid] = now
    look = "night" if o.get("mapLook") == "night" else "day"
    if o.get("view", "map") != "times":
        had = (wanted.get(tid) or {}).get(look, 0)
        wanted.setdefault(tid, {})[look] = now
        if now - had > ACTIVE_SEC:
            first = True
    if first:
        wake.set()


@sp.route("status")
def status(req):
    tid, item, o, why = mine(req)
    if why:
        return {"state": why}
    note(tid, o)
    settings = sp.settings()
    trip, bad = trip_of(item)
    if trip is None or not api_key(settings):
        return {"state": "setup"}
    clock = "24" if settings.get("clock") == "24" else "12"
    units = "km" if settings.get("units") == "km" else "mi"
    look = "night" if o.get("mapLook") == "night" else "day"
    now = now_local(settings)
    now_min = now.hour * 60 + now.minute
    with lock:
        st = state(tid)
        r = st["r"]
        sh = cc.show(trip, now_min, now.weekday(), st.get("workTravel"))
        fresh = (sh["mode"] != "rest" and r and r.get("to") == sh["mode"] and not r.get("typical")
                 and r.get("how", "car") == trip["how"] and time.time() - st["when"] < 45 * 60)
        if sh["mode"] != "rest" and not fresh:
            st["next"] = min(st["next"], time.time())      # (the card shows a trip: get it now)
            wake.set()
        out = cc.trip_state(trip, sh, r if fresh else None, now_min, now.weekday(), st["err"], units, clock,
                            int((time.time() - st["when"]) / 60))
        if out["state"] != "ok" or out["mode"] == "rest":
            return out
        g = st["grid"]
        out["map"] = {"g": "%d.%d.%d.%d.%d" % (g["z"], g["x0"], g["y0"], g["nx"], g["ny"]), "w": g["nx"] * cc.TILE,
                      "h": g["ny"] * cc.TILE, "nx": g["nx"], "ny": g["ny"], "rv": st["rv"],
                      "mv": (st["maps"].get(look) or {}).get("v"), "tv": (st["traffic"].get(look) or {}).get("v"),
                      "home": [round(st["home"][0], 1), round(st["home"][1], 1)],
                      "work": [round(st["work"][0], 1), round(st["work"][1], 1)]}
        q = req.get("query") or {}
        if str(q.get("rv", "")) != str(st["rv"]):
            out["map"]["line"] = st["line"]
    return out


def _pictures(req, which):
    tid, item, o, why = mine(req)
    if why:
        return {"none": True}
    note(tid, o)
    look = "night" if o.get("mapLook") == "night" else "day"
    with lock:
        got = state(tid)[which].get(look)
        if not got:
            return {"none": True}
        if str((req.get("query") or {}).get("v", "")) == got["v"]:
            return {"same": True, "v": got["v"]}
        return {"v": got["v"], "imgs": got["imgs"]}


@sp.route("map")
def map_(req):
    return _pictures(req, "maps")


@sp.route("traffic")
def traffic(req):
    return _pictures(req, "traffic")


# ---------- commands from a card ----------
COMMANDS = ("refresh",)          # the whole list: a card can only ask for a fresh look now
REFRESH_GAP_SEC = 60             # at most one asked-for refresh a minute for each commute


@sp.route("command")
def command(req):
    """{"command": "refresh"} → {"ok", "result"}: "soon" (asked), "wait" (asked within the last minute), "resting"
    (no trip shows now, so nothing to ask)."""
    body = req.get("body") if isinstance(req.get("body"), dict) else {}
    name = body.get("command")
    if name not in COMMANDS:
        raise sp.Error("unknown command", 400)
    tid, item, o, why = mine(req)
    if why:
        raise sp.Error(why, 409)
    settings = sp.settings()
    trip, bad = trip_of(item)
    if trip is None or not api_key(settings):
        return {"ok": False, "result": "setup"}
    now = now_local(settings)
    with lock:
        st = state(tid)
        if cc.show(trip, now.hour * 60 + now.minute, now.weekday(), st.get("workTravel"))["mode"] == "rest":
            return {"ok": False, "result": "resting"}
        if time.time() - st.get("asked", 0) < REFRESH_GAP_SEC:
            return {"ok": True, "result": "wait"}
        st["asked"] = time.time()
        st["next"] = 0
        for v in st["traffic"].values():
            v["when"] = 0                          # (the traffic picture too)
    note(tid, o)
    wake.set()
    return {"ok": True, "result": "soon"}


# ---------- the Manager's Test ----------
@sp.manage("test")
def test(req):
    settings = req.get("settings") or {}
    item = req.get("item") or {}
    key = api_key(settings)
    if not key:
        return {"ok": False, "text": w("test.noKey")}
    trip, bad = trip_of(item)
    if trip is None:
        return {"ok": False, "text": w(bad if bad != "c.setup" else "c.setup")}
    if item.get("id"):
        with lock:
            state(item["id"])["next"] = 0          # (whatever Test finds, the cards get a fresh look soon)
        wake.set()
    base = base_url(settings)
    units = settings.get("units") or "mi"
    try:
        try:
            home = where(base, key, trip["home"], 5)
        except tt.TTError as e:
            if e.kind == "notfound":
                return {"ok": False, "text": w("test.noHome")}
            raise
        try:
            work = where(base, key, trip["work"], 5)
        except tt.TTError as e:
            if e.kind == "notfound":
                return {"ok": False, "text": w("test.noWork")}
            raise
        try:
            r = tt.route(base, key, home, work, None, 7, trip["how"])
        except tt.TTError as e:
            if e.kind == "notfound":
                return {"ok": False, "text": w("test.noRoute")}
            raise
    except tt.TTError as e:
        return {"ok": False, "text": w({"badkey": "test.badKey", "busy": "test.busy", "offline": "test.offline"}.get(e.kind, "test.offline"))}
    if trip["how"] != "car":
        return {"ok": True, "text": w("test.okBike" if trip["how"] == "bike" else "test.okWalk", min=int(round(r["travel"] / 60.0)),
                                      dist=cc.distance_text(r["meters"], units))}
    delay = int(round(max(0, r["travel"] - r["normal"]) / 60.0))
    return {"ok": True, "text": w("test.ok", min=int(round(r["travel"] / 60.0)), dist=cc.distance_text(r["meters"], units),
                                  delay=w("test.okDelay", n=delay) if delay else w("test.okClear"))}


if __name__ == "__main__":
    threading.Thread(target=loop, daemon=True).start()
    sp.run()
