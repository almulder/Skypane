"""The NVIDIA Shield plugin end to end, the way Skypane's service/test_plugins_api.py tests hello-counter: packed by the
kit's pack.py, inspected and installed through the Manager routes (after "confirm it's you"), started by Skypane's
plugin_host, its Manager and panel routes called through Skypane's proxy, against a stand-in Shield on 127.0.0.1
(tests/fake_shield.py). Never a real Shield.

Needs a Skypane checkout (3.0.46+): set SKYPANE_REPO to it. Run from tests/:
    python -B test_plugin_e2e.py
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
SKY = pathlib.Path(os.environ.get("SKYPANE_REPO", ""))
PLUGIN = HERE.parent / "source"
if not (SKY / "service" / "plugins.py").exists():
    raise unittest.SkipTest("set SKYPANE_REPO to a Skypane checkout (3.0.46+)")
sys.path.insert(0, str(SKY))
sys.path.insert(0, str(HERE))

from service import plugin_host, plugins  # noqa: E402
from service import test_server as ts  # noqa: E402
from service.test_plugins_package import kit_pack  # noqa: E402

import fake_shield as fs  # noqa: E402

plugin_host.say = lambda line: None
# (Skypane 3.0.52.1 writes a four-part RELEASE, which its own check reads as 3.0.46 and so refuses plugins needing
# 3.0.52: worked around here until Skypane reads it)
KIT_ARGS = []
if plugins.vkey(plugins.current_release()) < plugins.vkey("3.0.52"):
    plugins.HOST_RELEASE = "3.0.52"
    import tempfile
    _fixed = pathlib.Path(tempfile.mkdtemp(prefix="kit-")) / "plugins.py"
    _fixed.write_text((SKY / "service" / "plugins.py").read_text(encoding="utf-8").replace('HOST_RELEASE = "3.0.46"', 'HOST_RELEASE = "3.0.52"'), encoding="utf-8")
    KIT_ARGS = ["--plugins", str(_fixed)]
PID = "nvidia-shield"


def card(i, shield=None, **o):
    opts = {"plugin": PID, "type": "remote"}
    if shield:
        opts["shield"] = shield
    opts.update(o)
    return {"i": i, "t": "plugin", "x": 0, "y": 0, "w": 40, "h": 60, "s": {}, "o": opts}


class ShieldPluginE2E(ts.PinCase):
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
        self.shield = fs.FakeShield()
        self.addCleanup(self.shield.close)

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
        return self.j(method, f"/api/panel/tablet/plugin/{PID}/{route}{query}", body, h)

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
        out = self.tmp / "shield.skyplugin"
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(pack.main([str(PLUGIN), "-o", str(out)] + KIT_ARGS + (["--draft"] if hasattr(pack, "catalog_problems") else [])), 0)
        st, got = self.j("POST", "/api/manage/plugins/inspect", out.read_bytes(), {**self.h, "Content-Type": "application/octet-stream"})
        self.assertEqual(st, 200, got)
        self.assertIn("TCP port 8987", " ".join(got["plugin"]["network"]))
        st, _, b = self.request("PATCH", "/api/manage/login", {"action": "confirm", "password": "correct horse"}, self.h)
        self.assertEqual(st, 200, b)
        st, inst = self.j("POST", "/api/manage/plugins/install", {"upload": got["upload"], "confirm": True}, self.h)
        self.assertEqual(st, 200, inst)

    def point_at_fake(self):
        """The owner types a Shield address (the Manager refuses 127.x as a "host"); the test then points that saved
        item at the stand-in's address and ports (the hidden "port" / "castPort" keys exist for tests only)."""
        st, got = self.j("PATCH", f"/api/manage/plugins/{PID}/settings", {"values": {"shields": [{"name": "Living room", "ip": "192.168.1.60"}]}}, self.h)
        self.assertEqual(st, 200, got)
        iid = got["values"]["shields"][0]["id"]
        f = self.data / "plugins-data" / PID / "settings.json"
        doc = json.loads(f.read_text(encoding="utf-8"))
        holder = doc.get("values", doc)
        holder["shields"][0].update(ip="127.0.0.1", port=self.shield.port, castPort=self.shield.cast_port)
        f.write_text(json.dumps(doc), encoding="utf-8")
        return iid

    def start_host(self):
        host = plugin_host.Host(self.data)
        self.addCleanup(host.stop_all, 3)

        def running():
            host.step()
            w = host.workers.get(PID)
            return w is not None and w.state == "running"
        self.wait(running, 25, 0.1, "the worker to run")
        return host

    def test_pair_status_apps_keys_power_end_to_end(self):
        self.install()
        iid = self.point_at_fake()
        self.panel("tablet", [card("c1", iid, btnApp="com.example.sideloaded"), card("c2", iid, pin=True), card("c3", iid, btnApp="Pandora")])
        host = self.start_host()

        # not paired yet: Test says so, and so does the card's status
        st, res = self.do("test", iid)
        self.assertEqual((st, res["ok"]), (200, False), res)
        self.assertIn("Not paired", res["text"])
        stat = self.wait(lambda: (lambda r: r[1] if r[0] == 200 and r[1].get("online") else None)(self.call("status")), 25, 0.3, "online")
        self.assertFalse(stat["paired"])

        # Pair: a code appears on the TV; a wrong code is refused; Pair again + the right code pairs
        st, res = self.do("pair", iid)
        self.assertEqual((st, res["ok"]), (200, True), res)
        self.assertIn("code is now on your TV", res["text"])
        self.assertEqual(self.shield.code, "A1B2C3")
        st, res = self.do("pair", iid, {"code": "FFFFFF"})
        self.assertEqual((st, res["ok"]), (200, False), res)
        self.assertIn("didn't accept", res["text"])
        self.assertFalse(self.shield.paired)
        self.do("pair", iid)
        st, res = self.do("pair", iid, {"code": "a1b2 c3"})              # (spaces and lower case are fine)
        self.assertEqual((st, res["ok"]), (200, True), res)
        self.assertTrue(self.shield.paired)
        self.assertEqual(res.get("values", {}).get("shields", [{}])[0].get("code", ""), "")    # (the code field is cleared)
        st, res = self.do("test", iid)
        self.assertEqual((st, res["ok"]), (200, True), res)
        self.assertIn("4 apps", res["text"])

        # the card: what's on, then the apps (each once) and their icons one by one
        stat = self.wait(lambda: (lambda r: r[1] if r[0] == 200 and r[1].get("paired") and r[1].get("appsVersion") else None)(self.call("status")),
                         30, 0.3, "a paired status with apps")
        self.assertEqual((stat["app"], stat["volume"], stat["standby"], stat["name"]), ("Plex", 47, False, "Living room"))
        self.assertNotIn("127.0.0.1", json.dumps(stat))
        st, ap = self.call("apps")                                        # (nothing synced yet: no apps on the card)
        self.assertEqual((st, ap["synced"], ap["apps"]), (200, False, []), ap)

        # Sync apps (Integrations): the list is pulled once and kept; the first sync ticks every app; the tick list's
        # choices come from the "choices" route (each app, its icon once the icons came)
        self.assertEqual(self.do("choices", iid)[1]["options"], [])
        st, res = self.do("sync", iid)
        self.assertEqual((st, res["ok"]), (200, True), res)
        self.assertIn("Got 4 apps", res["text"])
        self.assertEqual(res["values"]["shields"][0]["showApps"], ["com.plexapp.android", "com.netflix.ninja", "com.pandora.android.atv", "com.android.tv.settings"])
        ch = self.wait(lambda: (lambda r: r[1] if r[0] == 200 and len(r[1].get("options", [])) == 4 and all("icon" in o for o in r[1]["options"]) else None)(self.do("choices", iid)),
                       20, 0.3, "the choices with icons")
        self.assertEqual(ch["options"][1]["value"], "com.netflix.ninja")
        self.assertEqual(ch["options"][1]["label"], "Netflix")
        # the owner ticks two, in their own order, and saves (one tick is an app since removed); a re-sync keeps them
        f = self.data / "plugins-data" / PID / "settings.json"
        doc = json.loads(f.read_text(encoding="utf-8"))
        (doc.get("values", doc))["shields"][0]["showApps"] = ["com.netflix.ninja", "com.gone.app", "com.plexapp.android"]
        f.write_text(json.dumps(doc), encoding="utf-8")
        st, res = self.do("sync", iid)
        self.assertEqual((st, res["ok"]), (200, True), res)
        self.assertIn("Your ticks are kept", res["text"])
        self.assertIn("No longer on the Shield: com.gone.app", res["text"])
        self.assertNotIn("save", res)
        doc = json.loads(f.read_text(encoding="utf-8"))
        self.assertEqual(doc.get("values", doc)["shields"][0]["showApps"], ["com.netflix.ninja", "com.gone.app", "com.plexapp.android"])
        # an upgrade from 1.0.x: its comma list of names (kept by Skypane as an undeclared key) becomes ticks, once
        doc = json.loads(f.read_text(encoding="utf-8"))
        item = doc.get("values", doc)["shields"][0]
        item.pop("showApps")
        item["apps"] = "Netflix, Gone App, Plex"
        f.write_text(json.dumps(doc), encoding="utf-8")
        st, res = self.do("sync", iid)
        self.assertEqual((st, res["ok"]), (200, True), res)
        self.assertEqual(res["values"]["shields"][0]["showApps"], ["com.netflix.ninja", "com.plexapp.android"])
        ap = self.wait(lambda: (lambda r: r[1] if r[0] == 200 and len(r[1].get("apps", [])) == 2 and all(a["icon"] for a in r[1]["apps"]) else None)(self.call("apps")),
                       20, 0.3, "the picked apps with their icons")
        self.assertEqual([a["name"] for a in ap["apps"]], ["Netflix", "Plex"])
        self.assertTrue(all(a["icon"].startswith("data:image/png;base64,") for a in ap["apps"]))    # (icons inside: one call)
        self.assertTrue(ap["synced"])
        self.assertEqual(self.call("apps", query="?v=" + ap["version"])[1], {"same": True, "version": ap["version"]})
        # apps kept by 1.1.2 have no card icon ("tile"): the card's next ask makes them from the kept icons, once
        kept = list(self.data.rglob("apps-*.json"))
        self.assertTrue(kept)
        for kf in kept:
            d = json.loads(kf.read_text(encoding="utf-8"))
            for a in d["apps"]:
                a.pop("tile", None)
                a.pop("tileTried", None)
            kf.write_text(json.dumps(d), encoding="utf-8")
        st, old = self.call("apps")
        self.assertEqual(st, 200, old)
        self.assertTrue(all(a["icon"] and a["icon"].startswith("data:image/png;base64,") for a in old["apps"]), old)
        self.assertTrue(all("tile" in a for a in json.loads(kept[0].read_text(encoding="utf-8"))["apps"]))
        self.assertEqual(self.call("icon", query="?pkg=com.netflix.ninja")[0], 404)     # (1.2.0: icons come with the apps only)

        # keys, apps, find: through the worker's one connection
        self.shield.got.clear()
        self.assertEqual(self.call("command", "POST", {"command": "key", "value": {"key": "up"}})[1]["ok"], True)
        self.assertEqual(self.call("command", "POST", {"command": "key", "value": {"key": "volup"}})[1]["ok"], True)
        self.assertEqual(self.call("command", "POST", {"command": "key", "value": {"key": "reboot"}})[0], 400)
        self.assertEqual(self.call("command", "POST", {"command": "launch", "value": {"pkg": "com.netflix.ninja"}})[1]["ok"], True)
        self.assertEqual(self.call("command", "POST", {"command": "launch", "value": {"pkg": "com.evil.app"}})[0], 400)                   # not on the Shield
        self.assertEqual(self.call("command", "POST", {"command": "launch", "value": {"pkg": "com.example.sideloaded"}})[1]["ok"], True)  # c1's own button
        self.assertEqual(self.call("command", "POST", {"command": "find", "value": {}})[1]["ok"], True)
        self.assertEqual(self.call("command", "POST", {"command": "reboot"})[0], 400)
        self.assertEqual(self.call("command", "POST", {"command": "key", "value": "up"})[0], 400)
        self.assertEqual(self.call("command", "POST", {"command": "launch", "value": {"name": "Nope"}}, card_id="home/c3")[0], 400)
        self.wait(lambda: len(self.shield.got) >= 5, 5, 0.1, "the commands to arrive")
        self.assertEqual(self.shield.got[:5], [("key", 206), ("key", 230), ("launch", "com.netflix.ninja"),
                                               ("launch", "com.example.sideloaded"), ("find",)])
        # a card's own button opens its app by name, even one not picked for the row; only its own name
        self.shield.got.clear()
        self.assertEqual(self.call("command", "POST", {"command": "launch", "value": {"name": "Pandora"}}, card_id="home/c3")[1]["ok"], True)
        self.assertEqual(self.call("command", "POST", {"command": "launch", "value": {"name": "Plex"}}, card_id="home/c3")[0], 400)
        self.wait(lambda: ("launch", "com.pandora.android.atv") in self.shield.got, 5, 0.1, "the launch by name")

        # every key is a full press (down then up), each its own message: nothing came joined
        self.assertEqual(self.shield.presses[:4], [("down", 206), ("up", 206), ("down", 230), ("up", 230)])
        self.assertEqual(self.shield.dropped, 0)

        # a held button: a few presses in one call (Skypane allows a panel 120 calls a minute to a plugin)
        self.shield.presses.clear()
        self.assertEqual(self.call("command", "POST", {"command": "key", "value": {"key": "volup", "times": 3}})[1]["ok"], True)
        self.assertEqual(self.call("command", "POST", {"command": "key", "value": {"key": "volup", "times": 11}})[0], 400)
        self.wait(lambda: len(self.shield.presses) >= 6, 5, 0.1, "three presses")
        self.assertEqual(self.shield.presses, [("down", 230), ("up", 230)] * 3)

        # typing: the text itself (as NVIDIA's app sends it); Backspace and Enter as key presses
        self.shield.presses.clear()
        self.assertEqual(self.call("command", "POST", {"command": "text", "value": {"text": "Hi!"}})[1]["ok"], True)
        self.assertEqual(self.call("command", "POST", {"command": "text", "value": {"key": "enter"}})[1]["ok"], True)
        self.assertEqual(self.call("command", "POST", {"command": "text", "value": {"key": "backspace", "n": 2}})[1]["ok"], True)
        self.assertEqual(self.call("command", "POST", {"command": "text", "value": {"key": "reboot"}})[0], 400)
        self.assertEqual(self.call("command", "POST", {"command": "text", "value": {"text": ""}})[0], 400)
        self.assertEqual(self.call("command", "POST", {"command": "text", "value": {"text": "x" * 101}})[0], 400)
        self.assertEqual(self.call("command", "POST", {"command": "text", "value": {"text": "caf\u00e9"}})[0], 400)       # (ASCII only)
        ent, bs = 56, 28
        want = [("text", "Hi!"), ("down", ent), ("up", ent), ("down", bs), ("up", bs), ("down", bs), ("up", bs)]
        self.wait(lambda: len(self.shield.presses) >= len(want), 5, 0.1, "the typing to arrive")
        self.assertEqual(self.shield.presses, want)
        self.assertEqual(self.shield.dropped, 0)

        # power: the PIN card needs a ticket once the panel has a PIN; it's awake, so power puts it to sleep
        self.assertEqual(self.pin({"action": "set", "pin": "1234"}), (200, {"ok": True}))
        self.assertEqual(self.call("power", "POST", {}, card_id="home/c2"), (403, {"error": "pin-required"}))
        st, res = self.call("power", "POST", {})
        self.assertEqual((st, res["ok"], res["result"]), (200, True, "off"), res)
        self.wait(lambda: ("power", "sleep") in self.shield.got, 5, 0.1, "power")
        self.shield.standby = True
        st, res = self.call("power", "POST", {})
        self.assertEqual((st, res["result"]), (200, "on"), res)
        self.wait(lambda: ("power", "wake") in self.shield.got, 5, 0.1, "wake")

        # the Shield forgets Skypane: the next key fails as "not paired", and Test says to pair again
        self.shield.forget()
        host_drop = self.do("forget", iid)
        self.assertEqual(host_drop[1]["ok"], True)
        st, res = self.call("command", "POST", {"command": "key", "value": {"key": "home"}})
        self.assertEqual((st, res["ok"], res["result"]), (200, False, "unpaired"), res)
        self.assertNotIn("text", res)                                    # (plain data: the card picks the words)
        self.assertIn("Not paired", self.do("test", iid)[1]["text"])

        # the card's files come through the card frame
        st, _, page = self.request("GET", f"/api/panel/tablet/plugin/{PID}/card/remote/index.html")
        self.assertEqual(st, 200)
        self.assertIn(b"card.js", page)
        host.stop_all(3)


if __name__ == "__main__":
    unittest.main()
