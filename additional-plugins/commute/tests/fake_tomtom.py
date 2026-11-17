"""A stand-in for TomTom's web services on 127.0.0.1 (a random port), for tests only: Search geocode, calculateRoute,
Map Display raster tiles and Traffic flow raster tiles, answering the shapes TomTom documents. Made-up places only.

Strict like the real one: a wrong key is 403, an unknown address finds nothing, a bad route request is 400, tiles are
PNG. Switch it to "busy" (429) or "down" (closes the connection) to test failures. It records every path it was asked."""
import json
import re
import struct
import threading
import urllib.parse
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KEY = "test-key-0000"
PLACES = {                       # made-up addresses → made-up points (an empty patch of a test map)
    "1 example road, testville": (40.0100, -100.0100),
    "99 sample avenue, demotown": (40.0900, -99.9000),
}


def png(r, g, b, a=255, n=4):
    raw = b"".join(b"\x00" + bytes((r, g, b, a)) * n for _ in range(n))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


class FakeTomTom:
    def __init__(self):
        self.mode = "ok"            # ok | busy | down
        self.travel = 1680          # seconds with traffic
        self.normal = 1320          # with empty roads
        self.got = []               # (kind, path, query) of each request
        fake = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                u = urllib.parse.urlsplit(self.path)
                q = dict(urllib.parse.parse_qsl(u.query))
                path = urllib.parse.unquote(u.path)
                kind = ("geocode" if path.startswith("/search/2/geocode/") else "route" if path.startswith("/routing/1/calculateRoute/")
                        else "map" if path.startswith("/map/1/tile/") else "traffic" if path.startswith("/traffic/map/4/tile/flow/") else "?")
                fake.got.append((kind, path, q))
                if fake.mode == "down":
                    self.close_connection = True
                    self.connection.close()
                    return
                if fake.mode == "busy":
                    return self.send(429, {"error": "Too many requests"})
                if q.get("key") != KEY:
                    return self.send(403, {"detailedError": {"code": "Forbidden"}})
                if kind == "geocode":
                    m = re.match(r"^/search/2/geocode/(.+)\.json$", path)
                    p = PLACES.get(" ".join(m.group(1).lower().split())) if m else None
                    res = [{"type": "Point Address", "position": {"lat": p[0], "lon": p[1]}}] if p else []
                    return self.send(200, {"summary": {"numResults": len(res)}, "results": res})
                if kind == "route":
                    m = re.match(r"^/routing/1/calculateRoute/(-?[\d.]+),(-?[\d.]+):(-?[\d.]+),(-?[\d.]+)/json$", path)
                    mode = q.get("travelMode")
                    if (not m or mode not in ("car", "bicycle", "pedestrian") or q.get("traffic") != ("true" if mode == "car" else "false")
                            or ("arriveAt" in q) == ("departAt" in q)):
                        return self.send(400, {"error": {"description": "Bad request"}})
                    a, b = (float(m.group(1)), float(m.group(2))), (float(m.group(3)), float(m.group(4)))
                    if abs(a[0] - b[0]) < 1e-6 and abs(a[1] - b[1]) < 1e-6:
                        return self.send(400, {"error": {"description": "Engine error while executing route request: NO_ROUTE_FOUND"}})
                    pts = []
                    for i in range(201):       # an L-shaped drive, finely sampled
                        t = i / 200.0
                        if t < 0.5:
                            pts.append({"latitude": a[0], "longitude": a[1] + (b[1] - a[1]) * t * 2})
                        else:
                            pts.append({"latitude": a[0] + (b[0] - a[0]) * (t - 0.5) * 2, "longitude": b[1]})
                    travel = {"car": fake.travel, "bicycle": 3720, "pedestrian": 13300}[mode]
                    normal = fake.normal if mode == "car" else travel
                    s = {"lengthInMeters": 18400, "travelTimeInSeconds": travel, "trafficDelayInSeconds": max(0, travel - normal),
                         "noTrafficTravelTimeInSeconds": normal, "historicTrafficTravelTimeInSeconds": normal + 60,
                         "departureTime": "2026-01-05T07:30:00-07:00", "arrivalTime": "2026-01-05T07:58:00-07:00"}
                    secs = [{"startPointIndex": 0, "endPointIndex": 200, "sectionType": "TRAVEL_MODE", "travelMode": "car"}]
                    if q.get("sectionType") == "traffic" and fake.travel > fake.normal:
                        secs += [{"startPointIndex": 60, "endPointIndex": 80, "sectionType": "TRAFFIC", "simpleCategory": "JAM",
                                  "effectiveSpeedInKmh": 22, "delayInSeconds": 240, "magnitudeOfDelay": 2,
                                  "tec": {"effectCode": 4, "causes": [{"mainCauseCode": 1}]}},
                                 {"startPointIndex": 120, "endPointIndex": 130, "sectionType": "TRAFFIC", "simpleCategory": "OTHER",
                                  "effectiveSpeedInKmh": 9, "delayInSeconds": 120, "magnitudeOfDelay": 3,
                                  "tec": {"effectCode": 3, "causes": [{"mainCauseCode": 2, "subCauseCode": 1}]}},
                                 {"startPointIndex": 150, "endPointIndex": 151, "sectionType": "TRAFFIC", "simpleCategory": "JAM",
                                  "delayInSeconds": 20, "magnitudeOfDelay": 1}]
                    return self.send(200, {"formatVersion": "0.0.12", "routes": [{"summary": s, "sections": secs,
                                                                                    "legs": [{"summary": s, "points": pts}]}]})
                if kind in ("map", "traffic"):
                    if not re.match(r"^/(map/1/tile/basic/(main|night)|traffic/map/4/tile/flow/(relative0|relative0-dark))/\d+/\d+/\d+\.png$", path):
                        return self.send(400, {"error": "bad tile"})
                    body = png(230, 230, 220) if kind == "map" else png(0, 200, 0, 120)
                    self.send_response(200)
                    self.send_header("Content-Type", "image/png")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return
                self.send(404, {"error": "not found"})

            def send(self, code, obj):
                body = json.dumps(obj).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.srv.daemon_threads = True
        self.port = self.srv.server_address[1]
        self.base = "http://127.0.0.1:%d" % self.port
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def count(self, kind):
        return sum(1 for k, _, _ in self.got if k == kind)

    def close(self):
        self.srv.shutdown()
        self.srv.server_close()
