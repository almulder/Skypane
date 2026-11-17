"""The commute plugin's logic and its TomTom client, against the stand-in (tests/fake_tomtom.py). No Skypane needed.
Run from tests/:  python -B test_core.py"""
import pathlib
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "source" / "worker"))
sys.path.insert(0, str(HERE))

import commute_core as cc  # noqa: E402
import tomtom as tt  # noqa: E402
import fake_tomtom as ft  # noqa: E402

HOME, WORK = "1 Example Road, Testville", "99 Sample Avenue, Demotown"


class Times(unittest.TestCase):
    def test_parse_time(self):
        for text, want in (("8:30", 510), ("08:30", 510), ("8.30", 510), ("8:30 am", 510), ("8:30AM", 510), ("5:45pm", 1065),
                           ("5:45 p.m.", 1065), ("17:45", 1065), ("8", 480), ("8 am", 480), ("12 am", 0), ("12:15 pm", 735),
                           ("830", 510), ("1745", 1065), ("0:00", 0), ("23:59", 1439)):
            self.assertEqual(cc.parse_time(text), want, text)
        for bad in ("", "  ", "25:00", "8:75", "13 pm", "0 am", "noon", "8:3", None, 830):
            self.assertIsNone(cc.parse_time(bad), bad)

    def test_days(self):
        self.assertEqual([cc.is_work_day("weekdays", d) for d in range(7)], [True] * 5 + [False] * 2)
        self.assertEqual([cc.is_work_day("monsat", d) for d in range(7)], [True] * 6 + [False])
        self.assertEqual([cc.is_work_day("all", d) for d in range(7)], [True] * 7)

    def test_clock(self):
        self.assertEqual(cc.clock(462), "7:42 am")
        self.assertEqual(cc.clock(462, False), "7:42")
        self.assertEqual(cc.clock(0), "12:00 am")
        self.assertEqual(cc.clock(735), "12:15 pm")
        self.assertEqual(cc.clock(1065, False), "17:45")
        self.assertEqual(cc.clock(-10, False), "23:50")


class Plan(unittest.TestCase):
    trip = {"arriveBy": 510, "homeAfter": 900, "days": "weekdays", "margin": 5}     # 8:30, home at 15:00, 5 spare

    def test_what_the_card_shows_through_a_work_day(self):
        tr = 1680                                       # 28 min: leave by 7:57, so it shows from 6:57
        s = cc.show(self.trip, 400, 0, tr)              # 6:40: resting, says when today's drive shows
        self.assertEqual((s["mode"], s["kind"], s["at"], s["known"]), ("rest", "today", 417, True))
        self.assertEqual(cc.show(self.trip, 417, 0, tr), {"mode": "work", "leaveBy": 477})
        self.assertEqual(cc.show(self.trip, 509, 0, tr)["mode"], "work")      # (late, still before arrival)
        s = cc.show(self.trip, 600, 0, tr)              # 10:00: at work, the drive home comes at 15:00
        self.assertEqual((s["mode"], s["kind"], s["at"]), ("rest", "home", 900))
        self.assertEqual(cc.show(self.trip, 900, 0, tr)["mode"], "home")
        self.assertEqual(cc.show(self.trip, 959, 0, tr)["mode"], "home")
        s = cc.show(self.trip, 960, 0, tr)              # 16:00: an hour after, rests until tomorrow
        self.assertEqual((s["mode"], s["kind"], s["tomorrow"]), ("rest", "next", True))
        s = cc.show(self.trip, 960, 4, tr)              # Friday evening: next is Monday
        self.assertEqual((s["kind"], s["day"], s["tomorrow"]), ("next", 0, False))
        self.assertEqual(cc.show(self.trip, 420, 5, tr)["kind"], "next")      # Saturday
        s = cc.show(dict(self.trip, homeAfter=None), 600, 0, tr)             # no drive home: rests after arrival
        self.assertEqual((s["mode"], s["kind"]), ("rest", "next"))
        s = cc.show(self.trip, 300, 0, None)           # nothing known yet: "an hour before you need to leave"
        self.assertEqual((s["mode"], s["known"]), ("rest", False))

    def test_how_often_it_asks(self):
        tr = 1680
        self.assertEqual(cc.plan(self.trip, 120, 0, tr)["ask"], None)                  # 2:00: nothing
        p = cc.plan(self.trip, 300, 0, tr)                                             # 5:00: the usual drive, to know when to show
        self.assertEqual((p["ask"], p["every"]), ("typical", cc.ESTIMATE_SEC))
        self.assertEqual(cc.plan(self.trip, 120, 0, None)["ask"], "typical")           # (never asked yet: ask once)
        p = cc.plan(self.trip, 407, 0, tr, 2)                                          # 10 min before showing: live
        self.assertEqual((p["ask"], p["to"], p["every"]), ("live", "work", 120))
        self.assertEqual(cc.plan(self.trip, 600, 0, tr)["ask"], None)                  # at work
        p = cc.plan(self.trip, 895, 0, tr, 10)
        self.assertEqual((p["ask"], p["to"], p["every"]), ("live", "home", 600))
        self.assertEqual(cc.plan(self.trip, 960, 0, tr)["ask"], None)                  # after the drive home
        self.assertEqual(cc.plan(self.trip, 420, 6, tr)["ask"], None)                  # Sunday

    def test_leave_by_and_level(self):
        self.assertEqual(cc.leave_by(510, 1680, 5), 477)      # 8:30 - 28 min - 5 = 7:57
        self.assertEqual(cc.leave_by(510, 1681, 0), 481)      # (part minutes count as a whole one)
        self.assertEqual(cc.level(1300, 1250), "clear")
        self.assertEqual(cc.level(1500, 1250), "slow")
        self.assertEqual(cc.level(1800, 1250), "heavy")
        self.assertEqual(cc.distance_text(18400, "mi"), "11 mi")
        self.assertEqual(cc.distance_text(8000, "mi"), "5.0 mi")
        self.assertEqual(cc.distance_text(18400, "km"), "18 km")

    def test_reasons(self):
        secs = [{"startPointIndex": 1, "simpleCategory": "JAM", "delayInSeconds": 240, "tec": {"causes": [{"mainCauseCode": 1}]}},
                {"startPointIndex": 2, "simpleCategory": "OTHER", "delayInSeconds": 420, "tec": {"causes": [{"mainCauseCode": 2}]}},
                {"startPointIndex": 2, "simpleCategory": "ROAD_WORK", "delayInSeconds": 90},
                {"startPointIndex": 3, "simpleCategory": "JAM", "delayInSeconds": 30},          # (under a minute: left out)
                {"simpleCategory": "ROAD_CLOSURE", "delayInSeconds": 0},
                {"startPointIndex": 9, "simpleCategory": "OTHER", "delayInSeconds": 100, "tec": {"causes": [{"mainCauseCode": 99}]}}]
        cum = [0, 1609.344, 9656, 20000]
        r = cc.reasons(secs, cum, 480, 1, limit=6)                # Tuesday 8:00: a jam is rush hour
        self.assertEqual([x["kind"] for x in r], ["accident", "rush", "other", "roadworks", "closed"])
        self.assertEqual((r[0]["min"], r[0]["atMeters"]), (7, 9656))
        self.assertEqual((r[1]["atMeters"], r[3]["atMeters"], r[4]["atMeters"]), (1609, 9656, None))
        self.assertEqual(cc.reasons(secs, cum, 720, 1)[1]["kind"], "jam")    # noon: just heavy traffic
        self.assertEqual(cc.reasons(secs, cum, 480, 6)[1]["kind"], "jam")    # Sunday morning too
        self.assertEqual(len(cc.reasons(secs, cum, 480, 1)), 3)
        self.assertEqual(cc.reasons(None, [], 0, 0), [])

    def test_trip_state_is_plain_data(self):
        trip = dict(self.trip, name="Me", how="car")
        r = {"travel": 1680, "normal": 1320, "meters": 18400, "cum": [0, 5000, 9000],
             "sections": [{"startPointIndex": 1, "simpleCategory": "OTHER", "delayInSeconds": 300, "tec": {"causes": [{"mainCauseCode": 2}]}}]}
        st = cc.trip_state(trip, cc.show(trip, 450, 0, 1680), r, 450, 0, None, "km", "24", 2)
        self.assertEqual({k: st[k] for k in ("state", "mode", "how", "min", "normalMin", "delayMin", "meters", "level", "leaveBy",
                                             "arriveBy", "late", "leaveIn", "updated", "arrive", "units", "clock")},
                         {"state": "ok", "mode": "work", "how": "car", "min": 28, "normalMin": 22, "delayMin": 6, "meters": 18400,
                          "level": "slow", "leaveBy": 477, "arriveBy": 510, "late": 0, "leaveIn": 27, "updated": 448, "arrive": 478,
                          "units": "km", "clock": "24"})
        self.assertEqual(st["why"], [{"kind": "accident", "min": 5, "atMeters": 5000}])
        for v in st.values():                           # (numbers and words only: nothing formatted for show)
            self.assertNotIsInstance(v, float)
        rest = cc.trip_state(trip, cc.show(trip, 600, 0, 1680), r, 600, 0)
        self.assertEqual(rest["rest"], {"kind": "home", "at": 900})
        self.assertEqual(cc.trip_state(trip, cc.show(trip, 450, 0, 1680), None, 450, 0)["state"], "loading")
        self.assertEqual(cc.trip_state(trip, cc.show(trip, 450, 0, 1680), None, 450, 0, "offline")["state"], "error")
        bike = cc.trip_state(dict(trip, how="bike"), cc.show(trip, 450, 0, 1680), dict(r, travel=3720, normal=3000), 450, 0)
        self.assertEqual((bike["delayMin"], bike["why"], bike["level"]), (0, [], "clear"))
        d = cc.along([(40.0, -100.0), (40.0, -99.99), (40.01, -99.99)])
        self.assertAlmostEqual(d[1], 852, delta=5)
        self.assertAlmostEqual(d[2], 852 + 1112, delta=5)


class Map(unittest.TestCase):
    def test_grid_covers_route_and_fits_the_limits(self):
        pts = [(40.01, -100.01), (40.01, -99.90), (40.09, -99.90)]
        g = cc.grid_for(pts)
        self.assertLessEqual(g["nx"] * g["ny"], cc.MAX_TILES)
        for la, lo in pts:
            x, y = cc.to_mosaic(g, la, lo)
            self.assertTrue(cc.TILE * 0.5 < x < g["nx"] * cc.TILE - cc.TILE * 0.5, (x, g))
            self.assertTrue(cc.TILE * 0.5 < y < g["ny"] * cc.TILE - cc.TILE * 0.5, (y, g))
        self.assertEqual(len(cc.tiles_of(g)), g["nx"] * g["ny"])
        far = cc.grid_for([(30.0, -120.0), (47.0, -70.0)])       # a very long drive still fits, zoomed out
        self.assertLessEqual(far["nx"] * far["ny"], cc.MAX_TILES)
        near = cc.grid_for([(40.0, -100.0), (40.0005, -100.0005)])   # a very short one: the closest zoom
        self.assertEqual(near["z"], 16)

    def test_route_line_is_simplified(self):
        pts = [(40.0 + i * 0.0001, -100.0) for i in range(3000)]      # a straight road, 3000 points
        g = cc.grid_for(pts)
        line = cc.route_line(g, pts)
        self.assertEqual(len(line), 4)
        wiggly = [(40.0 + i * 0.0005, -100.0 + (0.002 if i % 2 else 0)) for i in range(3000)]
        line = cc.route_line(cc.grid_for(wiggly), wiggly)
        self.assertLessEqual(len(line), cc.MAX_POINTS * 2)


class TomTom(unittest.TestCase):
    def setUp(self):
        self.f = ft.FakeTomTom()
        self.addCleanup(self.f.close)

    def test_geocode_route_tiles(self):
        h = tt.geocode(self.f.base, ft.KEY, HOME)
        w = tt.geocode(self.f.base, ft.KEY, "  99 sample   avenue, DEMOTOWN ")
        self.assertEqual((h, w), ((40.01, -100.01), (40.09, -99.9)))
        r = tt.route(self.f.base, ft.KEY, h, w)
        self.assertEqual((r["travel"], r["normal"], r["delay"], r["meters"]), (1680, 1320, 360, 18400))
        self.assertEqual(len(r["points"]), 201)
        self.assertEqual([x["simpleCategory"] for x in r["sections"]], ["JAM", "OTHER", "JAM"])
        self.assertEqual(self.f.got[-1][2]["sectionType"], "traffic")
        q = self.f.got[-1][2]
        self.assertEqual((q["traffic"], q["departAt"], q["computeTravelTimeFor"], q["travelMode"]), ("true", "now", "all", "car"))
        tt.route(self.f.base, ft.KEY, h, w, "2026-01-05T08:30:00-07:00")
        self.assertEqual(self.f.got[-1][2]["arriveAt"], "2026-01-05T08:30:00-07:00")
        self.assertNotIn("departAt", self.f.got[-1][2])
        b = tt.route(self.f.base, ft.KEY, h, w, None, 10, "bike")
        q = self.f.got[-1][2]
        self.assertEqual((q["travelMode"], q["traffic"], "sectionType" in q), ("bicycle", "false", False))
        self.assertEqual((b["travel"], b["normal"], b["sections"]), (3720, 3720, []))
        tt.route(self.f.base, ft.KEY, h, w, None, 10, "walk")
        self.assertEqual(self.f.got[-1][2]["travelMode"], "pedestrian")
        self.assertTrue(tt.map_tile(self.f.base, ft.KEY, "day", 12, 1, 2).startswith(tt.PNG))
        self.assertTrue(tt.traffic_tile(self.f.base, ft.KEY, "night", 12, 1, 2).startswith(tt.PNG))
        self.assertIn("/relative0-dark/", self.f.got[-1][1])

    def test_failures(self):
        def kind(fn):
            try:
                fn()
            except tt.TTError as e:
                return e.kind
            return None
        self.assertEqual(kind(lambda: tt.geocode(self.f.base, "wrong", HOME)), "badkey")
        self.assertEqual(kind(lambda: tt.geocode(self.f.base, ft.KEY, "nowhere at all")), "notfound")
        self.assertEqual(kind(lambda: tt.geocode(self.f.base, ft.KEY, "   ")), "notfound")
        self.assertEqual(kind(lambda: tt.route(self.f.base, ft.KEY, (40.0, -100.0), (40.0, -100.0))), "notfound")
        self.f.mode = "busy"
        self.assertEqual(kind(lambda: tt.geocode(self.f.base, ft.KEY, HOME)), "busy")
        self.f.mode = "down"
        self.assertEqual(kind(lambda: tt.geocode(self.f.base, ft.KEY, HOME, 3)), "offline")
        self.assertEqual(kind(lambda: tt.geocode("http://127.0.0.1:9", ft.KEY, HOME, 3)), "offline")


if __name__ == "__main__":
    unittest.main()
