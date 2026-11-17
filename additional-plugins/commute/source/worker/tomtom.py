"""TomTom's web services, as the commute card uses them: find an address (Search, geocode), a drive with live traffic
(Routing, calculateRoute) and map squares (Map Display raster tiles, Traffic flow raster tiles). Standard library only.

Never log a URL from here: it carries the key and map points."""
import json
import socket
import ssl
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.tomtom.com"
UA = "Skypane-Commute/1.0"
PNG = b"\x89PNG\r\n\x1a\n"
_CTX = ssl.create_default_context()


class TTError(Exception):
    """kind: "badkey" (401 / 403), "busy" (429), "notfound" (no such address / no drive), "offline" (no answer),
    "failed" (anything else)."""

    def __init__(self, kind):
        super().__init__(kind)
        self.kind = kind


def _get(base, path, params, timeout, binary=False):
    url = base + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/png" if binary else "application/json"})
    try:
        kw = {"context": _CTX} if url.startswith("https:") else {}
        with urllib.request.urlopen(req, timeout=timeout, **kw) as r:
            body = r.read(4 * 1024 * 1024)
    except urllib.error.HTTPError as e:
        code = e.code
        e.close()
        if code in (401, 403):
            raise TTError("badkey") from None
        if code == 429:
            raise TTError("busy") from None
        if code in (400, 404):
            raise TTError("notfound") from None
        raise TTError("failed") from None
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError):
        raise TTError("offline") from None
    if binary:
        if not body.startswith(PNG):
            raise TTError("failed")
        return body
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise TTError("failed") from None


def geocode(base, key, text, timeout=8):
    """An address → (lat, lon). TTError("notfound") if TomTom finds nothing."""
    q = " ".join(str(text).split())[:200]
    if not q:
        raise TTError("notfound")
    got = _get(base, "/search/2/geocode/" + urllib.parse.quote(q, safe="") + ".json", {"key": key, "limit": 1}, timeout)
    try:
        pos = got["results"][0]["position"]
        lat, lon = float(pos["lat"]), float(pos["lon"])
    except (KeyError, IndexError, TypeError, ValueError):
        raise TTError("notfound") from None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise TTError("notfound")
    return lat, lon


MODES = {"car": "car", "bike": "bicycle", "walk": "pedestrian"}


def route(base, key, a, b, arrive_at=None, timeout=10, how="car"):
    """The trip a → b: by car with traffic, or (how "bike" / "walk") TomTom's bicycle or pedestrian route. arrive_at: an RFC 3339 time to arrive by (TomTom's usual traffic for then);
    None: leaving now (live traffic). Answers {"travel", "normal", "delay", "meters", "points": [(lat, lon), ...],
    "sections": [the route's traffic sections: where, what kind (simpleCategory, tec causes), how much delay]}."""
    path = "/routing/1/calculateRoute/%.6f,%.6f:%.6f,%.6f/json" % (a[0], a[1], b[0], b[1])
    car = how not in ("bike", "walk")
    params = {"key": key, "traffic": "true" if car else "false", "travelMode": MODES.get(how, "car"), "routeType": "fastest"}
    if car:
        params["computeTravelTimeFor"] = "all"
        params["sectionType"] = "traffic"
    if arrive_at:
        params["arriveAt"] = arrive_at
    else:
        params["departAt"] = "now"
    got = _get(base, path, params, timeout)
    try:
        r = got["routes"][0]
        s = r["summary"]
        travel = int(s["travelTimeInSeconds"])
        normal = int(s.get("noTrafficTravelTimeInSeconds") or s.get("historicTrafficTravelTimeInSeconds") or travel)
        delay = int(s.get("trafficDelayInSeconds") or 0)
        meters = int(s.get("lengthInMeters") or 0)
        sections = []
        for sec in r.get("sections") or []:
            if isinstance(sec, dict) and sec.get("sectionType") == "TRAFFIC":
                sections.append({k: sec.get(k) for k in ("startPointIndex", "endPointIndex", "simpleCategory", "delayInSeconds",
                                                          "magnitudeOfDelay", "effectiveSpeedInKmh", "tec")})
        points = []
        for leg in r.get("legs") or []:
            for p in leg.get("points") or []:
                points.append((float(p["latitude"]), float(p["longitude"])))
    except (KeyError, IndexError, TypeError, ValueError):
        raise TTError("notfound") from None
    if travel < 0 or travel > 3 * 86400:
        raise TTError("failed")
    if not points:
        points = [tuple(a), tuple(b)]
    return {"travel": travel, "normal": normal, "delay": max(0, delay), "meters": meters, "points": points, "sections": sections}


def map_tile(base, key, look, z, x, y, timeout=8):
    """One 256 px square of TomTom's street map (PNG bytes). look: "day" | "night"."""
    style = "night" if look == "night" else "main"
    return _get(base, "/map/1/tile/basic/%s/%d/%d/%d.png" % (style, z, x, y), {"key": key, "tileSize": 256}, timeout, True)


def traffic_tile(base, key, look, z, x, y, timeout=8):
    """One 256 px see-through square of live traffic colours (PNG bytes), to lay over the street map."""
    style = "relative0-dark" if look == "night" else "relative0"
    return _get(base, "/traffic/map/4/tile/flow/%s/%d/%d/%d.png" % (style, z, x, y), {"key": key, "tileSize": 256}, timeout, True)
