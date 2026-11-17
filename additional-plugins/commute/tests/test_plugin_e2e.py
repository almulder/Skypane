"""The commute plugin end to end, the way Skypane's service/test_plugins_api.py tests hello-counter: packed by the kit's
pack.py, inspected and installed through the Manager routes (after "confirm it's you"), started by Skypane's
plugin_host, its Manager and panel routes called through Skypane's proxy, against a stand-in TomTom on 127.0.0.1
(tests/fake_tomtom.py). Never the real TomTom; made-up addresses only.

Needs a Skypane checkout (3.0.49+): set SKYPANE_REPO to it. Run from tests/:
    python -B test_plugin_e2e.py"""
import contextlib
import io
import json
import os
import pathlib
import sys
import time
import unittest

HERE = pathlib.Path(__file__).resolve().parent
SKY = pathlib.Path(os.environ.get("SKYPANE_REPO", ""))
PLUGIN = HERE.parent / "source"
if not (SKY / "service" / "plugins.py").exists():
    raise unittest.SkipTest("set SKYPANE_REPO to a Skypane checkout (3.0.49+)")
sys.path.insert(0, str(SKY))
sys.path.insert(0, str(HERE))

from service import plugin_host, plugins  # noqa: E402
from service import test_server as ts  # noqa: E402
from service.test_plugins_package import kit_pack  # noqa: E402

import fake_tomtom as ft  # noqa: E402

plugin_host.say = lambda line: None
KIT_ARGS = []
if plugins.vkey(plugins.current_release()) < plugins.vkey("3.0.49"):
    plugins.HOST_RELEASE = "3.0.52"
    import tempfile
    _fixed = pathlib.Path(tempfile.mkdtemp(prefix="kit-")) / "plugins.py"
    _fixed.write_text((SKY / "service" / "plugins.py").read_text(encoding="utf-8").replace('HOST_RELEASE = "3.0.46"', 'HOST_RELEASE = "3.0.52"'), encoding="utf-8")
    KIT_ARGS = ["--plugins", str(_fixed)]
PID = "commute"
HOME, WORK = "1 Example Road, Testville", "99 Sample Avenue, Demotown"


def card(i, trip=None, **o):
    opts = {"plugin": PID, "type": "commute"}
    if trip:
        opts["trip"] = trip
    opts.update(o)
    return {"i": i, "t": "plugin", "x": 0, "y": 0, "w": 40, "h": 40, "s": {}, "o": opts}


class CommutePluginE2E(ts.PinCase):
    manage, login, setup_login = ts.ManageTests.manage, ts.ManageTests.login, ts.ManageTests.setup_login

    def setUp(self):
        super().setUp()
        app = self.srv.app
        app.auth.reset()
        app.plugin_uploads.clear()
        app.rate_hits.clear()
        for d in ("plugins", "plugins-data"):
            plugins.rmtree(self.data / d)
        (self.data / "private" / plugins.RUNTIME_FILE).unlink(missing_ok=True)
        app.plugins._cache.clear()
        self.h = {"Cookie": self.setup_login()}
        self.tt = ft.FakeTomTom()
        self.addCleanup(self.tt.close)

    def j(self, method, path, body=None, headers=None):
        st, h, b = self.request(method, path, body, headers)
        try:
            return st, json.loads(b)
        except ValueError:
            return st, b

    def panel(self, pid, cards):
        grid = {"v": 2, "cols": 192, "rows": 128, "gap": 14, "cards": cards}
        (self.data / "panels" / f"{pid}.json").write_text(json.dumps({"rev": 0, "data": {"settings": {"homeGrid": grid}}, "updated": "x"}),
                                                          encoding="utf-8")

    def call(self, route, card_id="home/c1", query=""):
        return self.j("GET", f"/api/panel/tablet/plugin/{PID}/{route}{query}", None, {"X-Skypane-Card": card_id})

    def do(self, route, iid, values=None):
        return self.j("POST", f"/api/manage/plugins/{PID}/do/{route}", {"item": iid, "values": values or {}}, self.h)

    def wait(self, pred, secs=20, step=0.2, what="condition"):
        end = time.monotonic() + secs
        while time.monotonic() < end:
            got = pred()
            if got:
                return got
            time.sleep(step)
        self.fail("timed out waiting for " + what)

    def install(self):
        pack = kit_pack()
        out = self.tmp / "commute.skyplugin"
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(pack.main([str(PLUGIN), "-o", str(out)] + KIT_ARGS + (["--draft"] if hasattr(pack, "catalog_problems") else [])), 0)
        st, got = self.j("POST", "/api/manage/plugins/inspect", out.read_bytes(), {**self.h, "Content-Type": "application/octet-stream"})
        self.assertEqual(st, 200, got)
        self.assertIn("api.tomtom.com", " ".join(got["plugin"]["network"]))
        st, _, b = self.request("PATCH", "/api/manage/login", {"action": "confirm", "password": "correct horse"}, self.h)
        self.assertEqual(st, 200, b)
        st, inst = self.j("POST", "/api/manage/plugins/install", {"upload": got["upload"], "confirm": True}, self.h)
        self.assertEqual(st, 200, inst)

    def settle(self, key=ft.KEY):
        """The owner's settings through the Manager; then (tests only) the saved settings pointed at the stand-in."""
        st, got = self.j("PATCH", f"/api/manage/plugins/{PID}/settings",
                         {"values": {"apiKey": key, "units": "km", "clock": "24",
                                     "trips": [{"name": "Me", "home": HOME, "work": WORK, "arriveBy": "8:30", "days": "all",
                                                "margin": 5, "homeAfter": ""}]}}, self.h)
        self.assertEqual(st, 200, got)
        self.assertEqual(got["values"]["apiKey"], {"set": True})          # (the key never comes back to the Manager)
        iid = got["values"]["trips"][0]["id"]
        f = self.data / "plugins-data" / PID / "settings.json"
        doc = json.loads(f.read_text(encoding="utf-8"))
        (doc.get("values", doc))["baseUrl"] = self.tt.base
        (doc.get("values", doc))["testClock"] = "0 07:30"           # (Monday 7:30: the drive to work shows)
        f.write_text(json.dumps(doc), encoding="utf-8")
        self.srv.app.plugins._cache.clear()
        return iid

    def clock(self, when):
        f = self.data / "plugins-data" / PID / "settings.json"
        doc = json.loads(f.read_text(encoding="utf-8"))
        (doc.get("values", doc))["testClock"] = when
        f.write_text(json.dumps(doc), encoding="utf-8")
        self.srv.app.plugins._cache.clear()

    def start_host(self):
        host = plugin_host.Host(self.data)
        self.addCleanup(host.stop_all, 3)

        def running():
            host.step()
            w = host.workers.get(PID)
            return w is not None and w.state == "running"
        self.wait(running, 25, 0.1, "the worker to run")
        return host

    def test_test_status_map_traffic_end_to_end(self):
        self.install()
        iid = self.settle()
        self.panel("tablet", [card("c1", iid), card("c2", iid, mapLook="night", view="times"), card("c3"), card("c4", "ffffffff")])
        host = self.start_host()
        time.sleep(2.5)                          # (the worker reads the edited settings)

        # Test: both addresses found, the drive now; a wrong address or time says so in plain words
        st, res = self.do("test", iid)
        self.assertEqual((st, res["ok"]), (200, True), res)
        self.assertIn("28 min right now (18 km), 6 min of it from traffic", res["text"])
        st, res = self.do("test", iid, {"work": "Nowhere Lane"})
        self.assertEqual((res["ok"], res["text"][:40]), (False, "TomTom couldn't find the work address. A"))
        st, res = self.do("test", iid, {"arriveBy": "half eight"})
        self.assertIn("isn't a time", res["text"])
        geocodes = self.tt.count("geocode")
        self.do("test", iid)
        self.assertEqual(self.tt.count("geocode"), geocodes)    # (addresses are found once, then kept)

        # cards that aren't set up say so
        self.assertEqual(self.call("status", "home/c3")[1], {"state": "notrip"})
        self.assertEqual(self.call("status", "home/c4")[1], {"state": "gone"})

        # the card: the drive, the leave-by time, the map's area and route line (once), then the pictures
        stat = self.wait(lambda: (lambda r: r[1] if r[0] == 200 and r[1].get("state") == "ok" and r[1]["map"].get("mv") and r[1]["map"].get("tv") else None)(self.call("status")),
                         30, 0.3, "a status with the map")
        self.assertEqual((stat["min"], stat["normalMin"], stat["delayMin"], stat["meters"], stat["name"]), (28, 22, 6, 18400, "Me"))
        self.assertEqual((stat["mode"], stat["leaveBy"], stat["arriveBy"], stat["late"], stat["units"], stat["clock"]),
                         ("work", 477, 510, 0, "km", "24"))
        self.assertEqual([(r["kind"], r["min"]) for r in stat["why"]], [("rush", 4), ("accident", 2)])
        self.assertIsInstance(stat["why"][0]["atMeters"], int)
        m = stat["map"]
        self.assertEqual((m["w"], m["h"]), (m["nx"] * 256, m["ny"] * 256))
        self.assertTrue(len(m["line"]) >= 4 and len(m["line"]) % 2 == 0)
        text = json.dumps(stat)
        for secret in (ft.KEY, "Example Road", "Sample Avenue", "40.01", "-100.01", "127.0.0.1"):
            self.assertNotIn(secret, text)
        st, again = self.call("status", query=f"?rv={m['rv']}")
        self.assertNotIn("line", again["map"])                  # (the line only when it changed)

        st, mp = self.call("map")
        self.assertEqual(st, 200, mp)
        self.assertEqual(len(mp["imgs"]), m["nx"] * m["ny"])
        self.assertTrue(all(i.startswith("data:image/png;base64,") for i in mp["imgs"]))
        self.assertEqual(self.call("map", query=f"?v={mp['v']}")[1], {"same": True, "v": mp["v"]})
        st, tr = self.call("traffic")
        self.assertEqual(len(tr["imgs"]), m["nx"] * m["ny"])
        self.assertLess(len(json.dumps(mp)) + len(json.dumps(tr)), 2 * 1024 * 1024)
        self.assertTrue(any("/basic/main/" in p for k, p, q in self.tt.got if k == "map"))
        self.assertFalse(any("/basic/night/" in p for k, p, q in self.tt.got if k == "map"))   # (c2 has its map off)

        # many panel calls never mean more TomTom calls: the worker asks on its own schedule
        routes = self.tt.count("route")
        for _ in range(10):
            self.call("status")
        time.sleep(3)
        self.assertEqual(self.tt.count("route"), routes)

        # the one command a card has: "check now", at most once a minute; anything else is refused
        post = lambda body: self.j("POST", f"/api/panel/tablet/plugin/{PID}/command", body, {"X-Skypane-Card": "home/c1"})
        self.assertEqual(post({"command": "start"})[0], 400)
        routes = self.tt.count("route")
        self.assertEqual(post({"command": "refresh"}), (200, {"ok": True, "result": "soon"}))
        self.assertEqual(post({"command": "refresh"})[1]["result"], "wait")
        self.wait(lambda: self.tt.count("route") > routes, 10, 0.2, "the asked-for check")

        # outside the drive times the card rests and nothing is asked of TomTom
        self.clock("0 12:00")
        time.sleep(2.5)
        routes = self.tt.count("route")
        rest = self.wait(lambda: (lambda r: r[1] if r[1].get("mode") == "rest" else None)(self.call("status")), 10, 0.3, "rest")
        self.assertEqual(rest["rest"], {"kind": "next", "tomorrow": True, "day": 1})
        self.assertNotIn("map", rest)
        time.sleep(3)
        self.assertEqual(self.tt.count("route"), routes)
        self.assertEqual(post({"command": "refresh"})[1], {"ok": False, "result": "resting"})
        self.clock("0 07:30")
        time.sleep(2.5)

        # TomTom down: the last drive stays, with the problem floating over it
        self.tt.mode = "down"
        self.srv.app.rate_hits.clear()
        self.do("test", iid)                                    # (asks the loop to refresh soon)
        stat = self.wait(lambda: (lambda r: r[1] if r[1].get("err") == "offline" else None)(self.call("status")), 30, 0.5, "offline")
        self.assertEqual((stat["state"], stat["min"]), ("ok", 28))

        # the card's files come through the card frame
        st, _, page = self.request("GET", f"/api/panel/tablet/plugin/{PID}/card/commute/index.html")
        self.assertEqual(st, 200)
        self.assertIn(b"card.js", page)
        host.stop_all(3)

    def test_by_bike(self):
        self.install()
        iid = self.settle()
        f = self.data / "plugins-data" / PID / "settings.json"
        doc = json.loads(f.read_text(encoding="utf-8"))
        (doc.get("values", doc))["trips"][0]["how"] = "bike"
        (doc.get("values", doc))["testClock"] = "0 07:00"         # (62 min by bike + 5: leave by 7:23, shows from 6:23)
        f.write_text(json.dumps(doc), encoding="utf-8")
        self.srv.app.plugins._cache.clear()
        self.panel("tablet", [card("c1", iid)])
        self.start_host()
        time.sleep(2.5)
        st, res = self.do("test", iid)
        self.assertEqual(res["text"], "Found both addresses. By bike it takes 62 min (18 km).")
        stat = self.wait(lambda: (lambda r: r[1] if r[1].get("state") == "ok" and r[1].get("map", {}).get("mv") else None)(self.call("status")),
                         30, 0.3, "a bike status with its map")
        self.assertEqual((stat["how"], stat["min"], stat["delayMin"], stat["why"], stat["leaveBy"]), ("bike", 62, 0, [], 443))
        self.assertIsNone(stat["map"]["tv"])
        self.assertEqual(self.tt.count("traffic"), 0)
        self.assertTrue(all(q["travelMode"] == "bicycle" for k, p, q in self.tt.got if k == "route"))

    def test_wrong_key(self):
        self.install()
        iid = self.settle("not-the-key")
        self.start_host()
        time.sleep(2.5)
        st, res = self.do("test", iid)
        self.assertEqual(res["ok"], False)
        self.assertIn("didn't accept the key", res["text"])


if __name__ == "__main__":
    unittest.main()
