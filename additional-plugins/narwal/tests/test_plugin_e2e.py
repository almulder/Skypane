"""The Narwal plugin end to end, the way Skypane's service/test_plugins_api.py tests hello-counter: packed by the kit's
pack.py, inspected and installed through the Manager routes (after "confirm it's you"), started by Skypane's
plugin_host, its Manager and panel routes called through Skypane's proxy — against a stand-in Narwal robot on
127.0.0.1 (tests/fake_robot.py). Never the real robot.

Needs Skypane's source (3.0.46.1+: its server, plugin host and pack tool) in SKYPANE_REPO; skipped without it.
Run from this tests folder:
    SKYPANE_REPO=/path/to/skypane-source python -B -m unittest test_plugin_e2e
Nothing is written into the Skypane checkout (-B: no .pyc; the server runs on temp folders)."""
import contextlib
import io
import json
import os
import pathlib
import sys
import time
import unittest

HERE = pathlib.Path(__file__).resolve().parent
SKY = pathlib.Path(os.environ["SKYPANE_REPO"]) if os.environ.get("SKYPANE_REPO") else None
PLUGIN = HERE.parent / "source"
if SKY is None or not (SKY / "service" / "plugins.py").exists():
    raise unittest.SkipTest("set SKYPANE_REPO to Skypane's source (3.0.46.1+) to run the end-to-end test")
sys.path.insert(0, str(SKY))
sys.path.insert(0, str(HERE))

from service import plugin_host, plugins  # noqa: E402
from service import test_server as ts  # noqa: E402
from service.test_plugins_package import kit_pack  # noqa: E402

import fake_robot as fr  # noqa: E402

plugin_host.say = lambda line: None


def card(i, robot=None, **o):
    opts = {"plugin": "narwal", "type": "vacuum"}
    if robot:
        opts["robot"] = robot
    opts.update(o)
    return {"i": i, "t": "plugin", "x": 0, "y": 0, "w": 40, "h": 60, "s": {}, "o": opts}


class NarwalPluginE2E(ts.PinCase):
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
        self.robot = fr.FakeRobot()
        self.addCleanup(self.robot.close)

    # ---- helpers (as in Skypane's test_plugins_api.py) ----
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

    def call(self, route, method="GET", body=None, card_id="home/c1", query=""):
        h = {"X-Skypane-Card": card_id} if card_id else {}
        return self.j(method, f"/api/panel/tablet/plugin/narwal/{route}{query}", body, h)

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
        out = self.tmp / "narwal.skyplugin"
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(pack.main([str(PLUGIN), "-o", str(out)] + (["--draft"] if hasattr(pack, "catalog_problems") else [])), 0)
        st, got = self.j("POST", "/api/manage/plugins/inspect", out.read_bytes(), {**self.h, "Content-Type": "application/octet-stream"})
        self.assertEqual(st, 200, got)
        self.assertIn("TCP port 9002", " ".join(got["plugin"]["network"]))
        st, _, b = self.request("PATCH", "/api/manage/login", {"action": "confirm", "password": "correct horse"}, self.h)
        self.assertEqual(st, 200, b)
        st, inst = self.j("POST", "/api/manage/plugins/install", {"upload": got["upload"], "confirm": True}, self.h)
        self.assertEqual(st, 200, inst)

    def point_at_fake_robot(self):
        """The owner types a robot address (the Manager refuses 127.x as a "host"); the test then points that saved
        robot at the stand-in robot's address and port (the hidden "port" key exists for tests only)."""
        st, got = self.j("PATCH", "/api/manage/plugins/narwal/settings", {"values": {"robots": [{"name": "Downstairs", "ip": "192.168.1.50"}]}}, self.h)
        self.assertEqual(st, 200, got)
        iid = got["values"]["robots"][0]["id"]
        f = self.data / "plugins-data" / "narwal" / "settings.json"
        doc = json.loads(f.read_text(encoding="utf-8"))
        holder = doc.get("values", doc)
        holder["robots"][0].update(ip="127.0.0.1", port=self.robot.port)
        f.write_text(json.dumps(doc), encoding="utf-8")
        return iid

    def start_host(self):
        host = plugin_host.Host(self.data)
        self.addCleanup(host.stop_all, 3)

        def running():
            host.step()
            w = host.workers.get("narwal")
            return w is not None and w.state == "running"
        self.wait(running, 25, 0.1, "the worker to run")
        return host

    # ---- the test ----
    def test_install_settings_routes_commands_alerts_end_to_end(self):
        self.install()
        iid = self.point_at_fake_robot()
        self.panel("tablet", [card("c1", iid), card("c2", iid, pin=True)])
        host = self.start_host()

        # Manager: a docked, idle robot answers nothing without its id → Test says to start a clean (or paste the id)
        st, res = self.j("POST", "/api/manage/plugins/narwal/do/test", {"item": iid}, self.h)
        self.assertEqual((st, res["ok"]), (200, False), res)
        self.assertIn("start any clean", res["text"])
        self.assertIn("address is probably wrong", res["text"])
        # while it cleans it broadcasts → Test learns the id and fills in the Robot ID field
        self.robot.awake = True
        st, res = self.j("POST", "/api/manage/plugins/narwal/do/test", {"item": iid}, self.h)
        self.assertEqual((st, res["ok"]), (200, True), res)
        self.assertIn("v01.09.07.06", res["text"])
        self.assertEqual(res["values"]["robots"][0]["deviceId"], fr.DEV)
        self.robot.awake = False          # back on the dock: with the id known, everything still works

        # panel: live status through Skypane's proxy (the worker's loop has visited the robot)
        stat = self.wait(lambda: (lambda r: r[1] if r[0] == 200 and isinstance(r[1], dict) and r[1].get("online") else None)(self.call("status")),
                         25, 0.3, "an online status")
        self.assertEqual((stat["state"], stat["battery"], stat["name"]), ("cleaning", 61, "Downstairs"))
        self.assertEqual(stat["position"]["room"], 2)
        self.assertNotIn("127.0.0.1", json.dumps(stat))
        self.assertNotIn(fr.DEV, json.dumps(stat))

        # the map, then "same" when the card already has that version
        st, mp = self.call("map")
        self.assertEqual(st, 200, mp)
        self.assertEqual([r["name"] for r in mp["rooms"]], ["", "Snack Bar"])
        self.assertEqual(mp["version"], stat["mapVersion"])
        self.assertEqual(self.call("map", query="?v=" + mp["version"])[1], {"same": True, "version": mp["version"]})

        # commands go to the robot (one connection: the worker's loop runs them)
        st, res = self.call("command", "POST", {"command": "pause"})
        self.assertEqual((st, res["ok"]), (200, True), res)
        self.assertIn("task/pause", [n for n, _ in self.robot.got])
        self.assertEqual(self.call("command", "POST", {"command": "reboot"})[0], 400)
        self.assertEqual(self.call("command", "POST", {"cmd": "resume"})[0], 200)                        # (1.0.3 cards' shape)
        st, res = self.call("start", "POST", {"mode": "mop", "rooms": [2]})
        self.assertEqual((st, res["ok"]), (200, True), res)
        sent = [p for n, p in self.robot.got if n == "clean/plan/start"]
        self.assertEqual(len(sent), 1)
        self.assertEqual(fr.nw.get(fr.nw.get(fr.nw.get(fr.nw.get(sent[0], 1), 2), 1), 2), 2)          # room 2
        self.assertEqual(fr.nw.get(fr.nw.get(fr.nw.get(fr.nw.get(sent[0], 1), 2), 2), 1), 3)          # mop
        st, res = self.call("start", "POST", {"mode": "both", "rooms": [99]})
        self.assertEqual((st, res["ok"], res["result"]), (200, False, "refused"))                     # not on its map

        # the card with the PIN on: once the panel has a PIN, Start needs a PIN ticket (single use); commands don't
        self.assertEqual(self.pin({"action": "set", "pin": "1234"}), (200, {"ok": True}))
        self.assertEqual(self.call("start", "POST", {"mode": "vacuum"}, card_id="home/c2"), (403, {"error": "pin-required"}))
        self.assertEqual(self.call("start", "POST", {"mode": "vacuum"})[0], 200)                       # c1: PIN off
        st, t = self.pin({"action": "ticket", "items": [[0, "plugin", "home/c2 start"]], "pin": "1234"})
        self.assertEqual(st, 200, t)
        h = {"X-Skypane-Card": "home/c2", "X-Skypane-Ticket": t["tickets"][0]}
        st, res = self.j("POST", "/api/panel/tablet/plugin/narwal/start", {"mode": "vacuum"}, h)
        self.assertEqual((st, res["ok"]), (200, True), res)
        self.assertEqual(self.j("POST", "/api/panel/tablet/plugin/narwal/start", {"mode": "vacuum"}, h)[0], 403)   # (used up)
        self.assertEqual(self.call("command", "POST", {"command": "dock"}, card_id="home/c2")[0], 200)         # (not a PIN route)

        # a stuck robot raises a "needs help" alert on the panel; the water-refill warning doesn't
        self.robot.base = fr.base_msg(ws=3, f3={2: 1, 5: 7}, f11=1, f47=2, fault=(0x02310027, 2, "x"))
        self.assertTrue(self.j("POST", "/api/manage/plugins/narwal/do/refresh", {}, self.h)[1]["ok"])
        al = self.wait(lambda: self.j("GET", "/api/panel/tablet/plugins")[1].get("alerts"), 20, 0.3, "the stuck alert")
        self.assertEqual(len(al), 1)
        self.assertIn("wheel is stuck", al[0]["text"])
        self.robot.base = fr.base_msg(ws=3, f3={5: 4}, fault=(0x01010072, 1, "\nWarn\n自动召回基站:是"))
        self.j("POST", "/api/manage/plugins/narwal/do/refresh", {}, self.h)
        self.wait(lambda: not self.j("GET", "/api/panel/tablet/plugins")[1].get("alerts"), 20, 0.3, "the alert to clear")

        # the card's files come through the card frame
        st, _, page = self.request("GET", "/api/panel/tablet/plugin/narwal/card/vacuum/index.html")
        self.assertEqual(st, 200)
        self.assertIn(b"card.js", page)
        host.stop_all(3)

    def test_typed_robot_id_works_while_it_sleeps_and_a_wrong_one_says_so(self):
        self.install()
        iid = self.point_at_fake_robot()
        self.panel("tablet", [card("c1", iid)])
        f = self.data / "plugins-data" / "narwal" / "settings.json"
        doc = json.loads(f.read_text(encoding="utf-8"))
        holder = doc.get("values", doc)
        holder["robots"][0]["deviceId"] = "0123456789ABCDEF0123456789ABCDE0"           # wrong (and upper case)
        f.write_text(json.dumps(doc), encoding="utf-8")
        self.srv.app.plugins._cache.clear()
        self.start_host()
        st, res = self.j("POST", "/api/manage/plugins/narwal/do/test", {"item": iid}, self.h)
        self.assertEqual((st, res["ok"]), (200, False), res)
        self.assertIn("not to that Robot ID", res["text"])
        stat = self.wait(lambda: (lambda r: r[1] if r[0] == 200 and r[1].get("why") == "noId" else None)(self.call("status")), 25, 0.3, "noId")
        self.assertFalse(stat["online"])
        holder["robots"][0]["deviceId"] = fr.DEV.upper()                                 # the right one, typed by hand
        f.write_text(json.dumps(doc), encoding="utf-8")
        self.srv.app.plugins._cache.clear()          # (the file was edited behind the Manager's back)
        st, res = self.j("POST", "/api/manage/plugins/narwal/do/test", {"item": iid}, self.h)
        self.assertEqual((st, res["ok"]), (200, True), res)
        self.wait(lambda: (lambda r: r[0] == 200 and r[1].get("online"))(self.call("status")), 30, 0.3, "online with a typed id")

    def test_no_robot_set_up_yet(self):
        self.install()
        self.panel("tablet", [card("c1")])
        self.start_host()
        st, res = self.call("status")
        self.assertEqual(st, 404)
        self.assertIn("add one in Integrations", json.dumps(res))


if __name__ == "__main__":
    unittest.main()
