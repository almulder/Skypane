"""The commute card's own logic, with no network and no Skypane in it (so it can move into Skypane's built-in
integrations later): reading the owner's times, which trip the card shows now, how often to ask TomTom, when to leave,
and the map's tile grid and route line in pixels (Web Mercator, 256 px tiles)."""
import math
import re

TILE = 256
FIT_W, FIT_H = 600, 420        # the route is fitted into about this many pixels at the chosen zoom
MAX_TILES = 30                 # tiles in the mosaic at most (incl. one tile of margin all round)
MAX_POINTS = 600               # route points sent to a card at most

# ---------- times ----------
_TIME = re.compile(r"^\s*(\d{1,2})(?:[:.h](\d{2}))?\s*([ap])?\.?\s*m?\.?\s*$", re.I)


def parse_time(text):
    """"8:30", "8.30", "8:30 am", "5:45pm", "17:45", "8", "8 am" → minutes after midnight; None if not a time."""
    if not isinstance(text, str):
        return None
    t = text.strip()
    if not t:
        return None
    m = _TIME.match(t)
    if not m:
        m2 = re.match(r"^\s*(\d{3,4})\s*$", t)          # 830, 1745
        if not m2:
            return None
        s = m2.group(1)
        h, mi, ap = int(s[:-2]), int(s[-2:]), None
    else:
        h, mi, ap = int(m.group(1)), int(m.group(2) or 0), (m.group(3) or "").lower() or None
    if mi > 59:
        return None
    if ap:
        if not 1 <= h <= 12:
            return None
        h = h % 12 + (12 if ap == "p" else 0)
    elif h > 23:
        return None
    return h * 60 + mi


def is_work_day(days, weekday):
    """weekday: 0 = Monday … 6 = Sunday."""
    if days == "all":
        return True
    if days == "monsat":
        return weekday <= 5
    return weekday <= 4


def clock(minutes, h12=True):
    minutes = int(minutes) % 1440
    h, m = divmod(minutes, 60)
    if not h12:
        return "%d:%02d" % (h, m)
    return "%d:%02d %s" % (h % 12 or 12, m, "am" if h < 12 else "pm")


# ---------- which trip, and how often ----------
SHOW_BEFORE_MIN = 60      # the drive to work shows from this long before the time to leave …
SHOW_HOME_MIN = 60        # … and the drive home for this long from "show the drive home from"
WARM_MIN = 10             # live traffic starts this long before the card shows it (so it's ready)
ESTIMATE_MIN = 180        # from this long before the usual time to leave: TomTom's usual drive, to know when to show
ESTIMATE_SEC = 30 * 60    # … every 30 minutes
IDLE_SEC = 5 * 60         # otherwise nothing is asked; the plan is looked at again this often
REFRESH_CHOICES = (2, 5, 10, 15)   # minutes between live checks (route and traffic picture), the owner's pick
DEFAULT_TRAVEL_SEC = 45 * 60       # a guess until TomTom has answered once
DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


def show(trip, now_min, weekday, work_travel_sec=None):
    """What the card shows now: {"mode": "work" | "home" | "rest", ...}.

    work: the drive to work, from an hour before the time to leave until the arrival time.
    home: the drive home, for an hour from "show the drive home from".
    rest: nothing to drive now; "kind" says what comes next: "today" (the drive to work, "at" minutes),
    "home" (the drive home, "at" minutes), "next" (tomorrow's or the next work day's drive, "day" 0–6)."""
    arrive = trip["arriveBy"]
    home_after = trip.get("homeAfter")
    travel = work_travel_sec or DEFAULT_TRAVEL_SEC
    if is_work_day(trip.get("days"), weekday):
        lb = leave_by(arrive, travel, trip.get("margin"))
        if now_min < arrive:
            if now_min >= lb - SHOW_BEFORE_MIN:
                return {"mode": "work", "leaveBy": lb}
            return {"mode": "rest", "kind": "today", "at": lb - SHOW_BEFORE_MIN, "known": bool(work_travel_sec)}
        if home_after is not None and home_after >= arrive:
            if home_after <= now_min < home_after + SHOW_HOME_MIN:
                return {"mode": "home"}
            if now_min < home_after:
                return {"mode": "rest", "kind": "home", "at": home_after}
    nxt = next_work_day(trip.get("days"), weekday)
    return {"mode": "rest", "kind": "next", "day": nxt, "tomorrow": nxt == (weekday + 1) % 7}


def next_work_day(days, weekday):
    for i in range(1, 8):
        d = (weekday + i) % 7
        if is_work_day(days, d):
            return d
    return (weekday + 1) % 7


def plan(trip, now_min, weekday, work_travel_sec=None, refresh_min=5):
    """How to ask TomTom now: {"ask": "live" | "typical" | None, "to": "work" | "home", "every": seconds}.
    Live checks only while the card shows a drive (and a few minutes before); none at all when it rests."""
    live = max(60, int(refresh_min or 5) * 60)
    if not is_work_day(trip.get("days"), weekday):
        return {"ask": None, "to": "work", "every": IDLE_SEC}
    arrive = trip["arriveBy"]
    home_after = trip.get("homeAfter")
    if now_min < arrive:
        lb = leave_by(arrive, work_travel_sec or DEFAULT_TRAVEL_SEC, trip.get("margin"))
        if now_min >= lb - SHOW_BEFORE_MIN - WARM_MIN:
            return {"ask": "live", "to": "work", "every": live}
        if now_min >= lb - ESTIMATE_MIN or not work_travel_sec:
            return {"ask": "typical", "to": "work", "every": ESTIMATE_SEC}
        return {"ask": None, "to": "work", "every": IDLE_SEC}
    if home_after is not None and home_after >= arrive and home_after - WARM_MIN <= now_min < home_after + SHOW_HOME_MIN:
        return {"ask": "live", "to": "home", "every": live}
    return {"ask": None, "to": "work", "every": IDLE_SEC}


def leave_by(arrive_min, travel_sec, margin_min):
    """Minutes after midnight to leave by (may be negative or past now: the caller says "late")."""
    return arrive_min - int(math.ceil(travel_sec / 60.0)) - int(margin_min or 0)


def level(travel_sec, normal_sec):
    """"clear" | "slow" | "heavy", from how much traffic adds to the empty-road time."""
    if not normal_sec or travel_sec is None:
        return "clear"
    extra = (travel_sec - normal_sec) / float(normal_sec)
    if extra < 0.10:
        return "clear"
    if extra < 0.30:
        return "slow"
    return "heavy"


# ---------- why it's slower ----------
# TPEG2-TEC main cause codes (tec002), the ones worth saying; anything else falls back to TomTom's simple category
CAUSES = {1: "jam", 2: "accident", 3: "roadworks", 4: "lanes", 5: "closed", 6: "slippery", 8: "fire", 9: "hazard",
          10: "object", 11: "animals", 13: "breakdown", 15: "rescue", 17: "weather", 23: "event"}
SIMPLE = {"JAM": "jam", "ROAD_WORK": "roadworks", "ROAD_CLOSURE": "closed", "OTHER": "other"}


def rush_hour(now_min, weekday):
    return weekday <= 4 and (390 <= now_min < 570 or 930 <= now_min < 1110)     # 6:30–9:30 and 15:30–18:30


def reasons(sections, cum_m, now_min, weekday, limit=3):
    """The traffic sections of a route → up to `limit` reasons, biggest delay first:
    [{"kind": "accident" | "jam" | "rush" | "roadworks" | ..., "min": delay minutes, "atMeters": how far along it starts}].
    cum_m: the distance along the route at each route point (for "how far in")."""
    out = []
    for sec in sections or []:
        try:
            delay = int(sec.get("delayInSeconds") or 0)
        except (TypeError, ValueError):
            delay = 0
        if delay < 60 and sec.get("simpleCategory") != "ROAD_CLOSURE":
            continue
        kind = None
        for c in ((sec.get("tec") or {}).get("causes") or []):
            kind = CAUSES.get(c.get("mainCauseCode") if isinstance(c, dict) else None)
            if kind:
                break
        kind = kind or SIMPLE.get(sec.get("simpleCategory"), "other")
        if kind == "jam" and rush_hour(now_min, weekday):
            kind = "rush"
        at = None
        i = sec.get("startPointIndex")
        if isinstance(i, int) and 0 <= i < len(cum_m):
            at = int(round(cum_m[i]))
        out.append({"kind": kind, "min": int(round(delay / 60.0)), "atMeters": at, "_d": delay})
    out.sort(key=lambda r: -r["_d"])
    for r in out:
        r.pop("_d")
    return out[:limit]


def along(points):
    """The distance in metres along the route at each point."""
    out, total = [], 0.0
    for i, (la, lo) in enumerate(points):
        if i:
            pla, plo = points[i - 1]
            x = math.radians(lo - plo) * math.cos(math.radians((la + pla) / 2))
            y = math.radians(la - pla)
            total += 6371000.0 * math.hypot(x, y)
        out.append(total)
    return out


def distance_text(meters, units):
    if units == "km":
        km = meters / 1000.0
        return ("%.1f km" % km) if km < 10 else ("%d km" % round(km))
    mi = meters / 1609.344
    return ("%.1f mi" % mi) if mi < 10 else ("%d mi" % round(mi))


# ---------- the map ----------
def world_px(lat, lon, z):
    """A point's pixel position in the whole world map at zoom z."""
    lat = max(-85.05112878, min(85.05112878, lat))
    n = TILE * (2 ** z)
    x = (lon + 180.0) / 360.0 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def grid_for(points):
    """The tile mosaic that shows the route with a margin: {"z", "x0", "y0", "nx", "ny"}. points: [(lat, lon), ...]."""
    lats = [p[0] for p in points]
    lons = [p[1] for p in points]
    box = (min(lats), min(lons), max(lats), max(lons))
    for z in range(16, 2, -1):
        x1, y1 = world_px(box[2], box[1], z)      # top left (north west)
        x2, y2 = world_px(box[0], box[3], z)      # bottom right
        if x2 - x1 > FIT_W or y2 - y1 > FIT_H:
            continue
        g = _mosaic(z, x1, y1, x2, y2)
        if g["nx"] * g["ny"] <= MAX_TILES:
            return g
    x1, y1 = world_px(box[2], box[1], 3)
    x2, y2 = world_px(box[0], box[3], 3)
    return _mosaic(3, x1, y1, x2, y2)


def _mosaic(z, x1, y1, x2, y2):
    pad = TILE * 0.75                      # (room round the route, so a card wider or taller than the route still fills)
    n = 2 ** z
    tx1 = max(0, int(math.floor((x1 - pad) / TILE)))
    ty1 = max(0, int(math.floor((y1 - pad) / TILE)))
    tx2 = min(n - 1, int(math.floor((x2 + pad) / TILE)))
    ty2 = min(n - 1, int(math.floor((y2 + pad) / TILE)))
    return {"z": z, "x0": tx1, "y0": ty1, "nx": tx2 - tx1 + 1, "ny": ty2 - ty1 + 1}


def tiles_of(grid):
    """[(z, x, y), ...] row by row."""
    return [(grid["z"], grid["x0"] + i, grid["y0"] + j) for j in range(grid["ny"]) for i in range(grid["nx"])]


def to_mosaic(grid, lat, lon):
    x, y = world_px(lat, lon, grid["z"])
    return x - grid["x0"] * TILE, y - grid["y0"] * TILE


def _dp(pts, tol):
    """Douglas–Peucker, without recursion (long routes)."""
    if len(pts) < 3:
        return pts[:]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    tol2 = tol * tol
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        d2 = dx * dx + dy * dy
        best, bi = -1.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            if d2 == 0:
                e = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / d2))
                e = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
            if e > best:
                best, bi = e, i
        if bi > 0 and best > tol2:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def route_line(grid, points):
    """The route in the mosaic's pixels, simplified, as a flat list [x, y, x, y, ...] of numbers with one decimal."""
    px = [to_mosaic(grid, la, lo) for la, lo in points]
    tol = 0.8
    out = _dp(px, tol)
    while len(out) > MAX_POINTS:
        tol *= 1.6
        out = _dp(px, tol)
    flat = []
    for x, y in out:
        flat.append(round(x, 1))
        flat.append(round(y, 1))
    return flat


# ---------- the state a card (or, later, a built-in panel card) draws ----------
def trip_state(trip, sh, r, now_min, weekday, err=None, units="mi", clock="12", ago_min=0):
    """One commute's whole state as plain data, the same shape whoever draws it. Times are minutes after midnight,
    distances metres; "units" and "clock" say how the owner wants them shown.

    trip: as the worker reads it (arriveBy, margin, how, name); sh: show(...) for now; r: the last fitting TomTom answer
    ({"travel", "normal", "meters", "sections", "cum"}) or None; err: the last problem asking TomTom, or None."""
    how = trip.get("how") or "car"
    out = {"state": "ok", "err": err, "name": trip.get("name") or "", "how": how, "mode": sh["mode"], "units": units,
           "clock": clock}
    if sh["mode"] == "rest":
        rest = {"kind": sh["kind"]}
        if (sh["kind"] == "today" and sh.get("known")) or sh["kind"] == "home":
            rest["at"] = sh["at"] % 1440
        if sh["kind"] == "next":
            rest["tomorrow"] = sh["tomorrow"]
            rest["day"] = sh["day"]
        out["rest"] = rest
        return out
    if not r:
        out["state"] = "error" if err and err != "setup" else "loading"
        return out
    car = how == "car"
    travel = r["travel"]
    normal = r["normal"] if car else travel
    mins = int(round(travel / 60.0))
    out.update(min=mins, normalMin=int(round(normal / 60.0)), delayMin=int(round(max(0, travel - normal) / 60.0)),
               meters=int(r.get("meters") or 0), level=level(travel, normal) if car else "clear",
               why=reasons(r.get("sections"), r.get("cum") or [], now_min, weekday) if car else [],
               updated=(now_min - int(ago_min)) % 1440, arrive=(now_min + mins) % 1440)
    if sh["mode"] == "work":
        lb = leave_by(trip["arriveBy"], travel, trip.get("margin"))
        out.update(leaveBy=lb % 1440, arriveBy=trip["arriveBy"], late=max(0, now_min - lb), leaveIn=lb - now_min)
    return out
