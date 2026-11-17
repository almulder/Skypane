"""The Narwal robot vacuum plugin's worker (Skypane 3.0.46+, tools/plugin-kit/README.md).

One background loop owns every visit to every robot: a Narwal robot takes ONE local client at a time (the Narwal app
is another), so visits are short (~0.3–1 s) and never overlap. Panel commands are queued to that loop; the route waits
for the answer.

Panel routes (a card only ever reaches the robot ITS settings picked — the "robot" item setting — never another):
  GET  status   the card's robot: live state (+ mapVersion)
  GET  map      the card's robot's map (rooms, names, label spots, run-length room grid); ?v=<version> → {same: true}
  POST start    {mode, rooms[]}  (its own route so the panel PIN can cover starting a clean: "pin": "optional")
  POST command  {cmd}  pause | resume | cancel | dock | washMop | dryMop | emptyDust | locate
Manager routes:
  test     a robot in the list: finds its ids, model/firmware, battery → saved with the item
  refresh  fetch every robot's map now
Alerts: "needs help" faults (stuck wheel …) as level "help"; the water-tank refill on plumbed docks is not an alert.
"""
import json
import os
import pathlib
import queue
import threading
import time

import narwal_core as nw
import skypane_plugin as sp

POLL_IDLE = 60          # s between visits while docked / idle
POLL_ACTIVE = 15        # s while it's out on a job
MAP_EVERY = 30 * 60     # s while docked (room edits in the Narwal app keep the same map id)
MAP_EVERY_BUSY = 6 * 3600
RETRY = (20, 40, 90, 180, 300)
CMD_WAIT = 15.0         # s a panel waits for a queued command (Skypane's deadline is 20 s)
TRAIL = 120             # recent positions kept for the card's path line
ACTIVE = nw.ACTIVE

lock = threading.Lock()
jobs = queue.Queue()
stop = threading.Event()
models, next_at, fails, maps, map_at, trails = {}, {}, {}, {}, {}, {}


def words():
    try:
        p = pathlib.Path(os.environ.get("SKYPANE_PLUGIN_DIR", "")) / "strings" / "en.json"
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


W = words()


def w(key, **kv):
    s = W.get(key, key)
    for k, v in kv.items():
        s = s.replace("{" + k + "}", str(v))
    return s


# ---------------------------------------------------------------- the owner's robots (settings list "robots")
def robots():
    """{item id: robot} from the settings. A robot: {id, name, ip, productKey, deviceId, port}. ("port" is not a field
    the owner sees; only tests set it, to reach a stand-in robot.)"""
    out = {}
    for it in (sp.settings().get("robots") or []):
        if isinstance(it, dict) and isinstance(it.get("id"), str) and isinstance(it.get("ip"), str) and it["ip"].strip():
            ids = learned().get(it["id"]) or {}
            if ids.get("ip") != it["ip"]:
                ids = {}
            port = it.get("port") if isinstance(it.get("port"), int) and 0 < it["port"] < 65536 else nw.PORT
            typed = typed_id(it.get("deviceId"))
            key = it.get("productKey") if isinstance(it.get("productKey"), str) and nw.vlist.KEY.fullmatch(it["productKey"]) else ""
            dev = typed or ids.get("deviceId") or ""
            if ids.get("deviceId") == dev and not key:
                key = ids.get("productKey") or ""
            out[it["id"]] = {"id": it["id"], "name": str(it.get("name") or "Robot")[:48], "ip": it["ip"].strip(),
                             "productKey": key, "deviceId": dev, "port": port}
    return out


def typed_id(v):
    """The "Robot ID" field (optional): the robot's device id, 32 hex characters (spaces and dashes ignored)."""
    v = "".join(str(v or "").split()).replace("-", "").lower()
    return v if nw.vlist.DEVICE.fullmatch(v) else ""


def learned():
    d = sp.read_private("ids.json", {})
    return d if isinstance(d, dict) else {}


def learn(r, ids):
    if ids and all(ids) and (r["productKey"], r["deviceId"]) != tuple(ids):
        d = learned()
        d[r["id"]] = {"ip": r["ip"], "productKey": ids[0], "deviceId": ids[1]}
        sp.write_private("ids.json", d)


def saved_map(rid):
    d = sp.read_private("map-%s.json" % rid, None) if nw.vlist.ID.fullmatch(rid) else None
    return d if isinstance(d, dict) and isinstance(d.get("rle"), list) else None


# ---------------------------------------------------------------- one visit (only the loop thread calls this)
def refresh_map(rid, v, mp, now):
    map_at[rid] = now
    fresh = v.get_map()
    if not fresh:
        return mp
    fresh["version"] = nw.map_version(fresh)
    if not mp or mp.get("version") != fresh["version"]:
        sp.write_private("map-%s.json" % rid, fresh)
        return nw.map_internal(fresh)
    return mp


def visit(r, now, cmd=None):
    rid, res = r["id"], None
    try:
        with nw.Visit(r, r["port"]) as v:
            if not v.discover():
                raise ConnectionError("no ids")
            learn(r, v.ids)
            mp = maps.get(rid) or nw.map_internal(saved_map(rid))
            if cmd is not None:
                if cmd[0] == "refreshMap":
                    map_at[rid] = 0
                    res = {"ok": True, "result": "ok"}
                else:
                    room_ids = [x["id"] for x in (mp or {}).get("rooms", [])]
                    try:
                        res = v.command(cmd[0], cmd[1], room_ids)
                    except ValueError:
                        res = {"ok": False, "result": "refused"}
                    time.sleep(1.0)
            was_active = (models.get(rid) or {}).get("state") in ACTIVE
            if mp is None or now - map_at.get(rid, 0) > (MAP_EVERY_BUSY if was_active else MAP_EVERY):
                mp = refresh_map(rid, v, mp, now)
            st = v.status(mp)
            if st is not None and was_active and st["state"] in ("docked", "idle"):
                mp = refresh_map(rid, v, mp, now)
                trails[rid] = []
            maps[rid] = mp
        if st is None:
            raise ConnectionError("no status")
        st.update(online=True, why="", seenAt=now, mapVersion=(mp or {}).get("version"))
        pos = st.get("position")
        if pos:
            t = trails.setdefault(rid, [])
            if not t or (t[-1][0], t[-1][1]) != (pos["x"], pos["y"]):
                t.append([pos["x"], pos["y"]])
            del t[:-TRAIL]
        with lock:
            models[rid], fails[rid] = st, 0
        next_at[rid] = now + (POLL_ACTIVE if st["state"] in ACTIVE else POLL_IDLE)
    except (OSError, ConnectionError) as ex:
        n = fails.get(rid, 0)
        fails[rid] = n + 1
        why = "noId" if str(ex) == "no ids" else "busy" if "closed" in str(ex) else "reach"
        with lock:
            models[rid] = dict(models.get(rid) or {}, online=False, why=why)
        next_at[rid] = now + RETRY[min(n, len(RETRY) - 1)]
        if cmd is not None and res is None:
            res = {"ok": False, "result": "noAnswer"}
    return res


def raise_alerts(rs):
    out = []
    for rid, m in models.items():
        f = (m or {}).get("fault")
        if rid in rs and m.get("online") and f and f.get("level") == "error" and not f.get("transient"):
            key = "fault.%s" % f["code"]
            out.append({"key": "%s-%s" % (rid, f["code"]), "level": "help", "title": rs[rid]["name"],
                        "text": w(key) if key in W else w("fault.generic", code=f["code"])})
    sp.alerts(out[:20])


def loop():
    last = None
    while not stop.is_set():
        try:
            job = jobs.get(timeout=1.0)
        except queue.Empty:
            job = None
        rs = robots()
        now = time.time()
        if job is not None:
            rid, cmd, holder = job
            r = rs.get(rid)
            if r is None or now - holder["at"] > CMD_WAIT:
                holder["res"] = {"ok": False, "result": "stale" if r else "refused"}
            else:
                holder["res"] = visit(r, now, cmd) or {"ok": False, "result": "noAnswer"}
                next_at[rid] = now + 4          # look again soon: did it start?
            holder["done"].set()
        for rid, r in rs.items():
            if now >= next_at.get(rid, 0):
                visit(r, now)
        for rid in [x for x in models if x not in rs]:
            with lock:
                models.pop(rid, None)
        sig = json.dumps([[k, (models[k] or {}).get("fault")] for k in sorted(models)])
        if sig != last:
            raise_alerts(rs)
            last = sig


def run_command(rid, cmd, args):
    holder = {"at": time.time(), "done": threading.Event(), "res": None}
    jobs.put((rid, (cmd, args), holder))
    if not holder["done"].wait(CMD_WAIT + 3):
        return {"ok": False, "result": "timeout"}
    return holder["res"]


# ---------------------------------------------------------------- routes
def card_robot(req):
    """The robot the asking card is set to (its "robot" item setting); the first robot when it has none."""
    rs = robots()
    if not rs:
        raise sp.Error(w("err.noRobots"), 404)
    me = None
    for c in req.get("cards") or []:
        if isinstance(c, dict) and c.get("card") == req.get("card"):
            me = c
    if me is None:
        raise sp.Error("unknown card", 403)
    rid = (me.get("o") or {}).get("robot")
    if rid not in rs:
        rid = sorted(rs)[0] if len(rs) == 1 or not rid else None
    if rid is None:
        raise sp.Error(w("err.noRobot"), 404)
    return rs[rid]


@sp.route("status")
def status(req):
    r = card_robot(req)
    with lock:
        m = dict(models.get(r["id"]) or {"online": False, "why": "starting"})
    m["name"] = r["name"]
    m["trail"] = list(trails.get(r["id"]) or [])
    if m.get("mapVersion") is None:
        mp = saved_map(r["id"])
        m["mapVersion"] = mp.get("version") if mp else None
    return m


@sp.route("map")
def get_map(req):
    r = card_robot(req)
    mp = maps.get(r["id"]) or saved_map(r["id"])
    if not mp:
        return {"none": True}
    if (req.get("query") or {}).get("v") == mp.get("version"):
        return {"same": True, "version": mp.get("version")}
    return {k: v for k, v in mp.items() if not k.startswith("_")}


@sp.route("start")
def start(req):
    r = card_robot(req)
    body = req.get("body") if isinstance(req.get("body"), dict) else {}
    rooms = body.get("rooms") if isinstance(body.get("rooms"), list) else []
    args = {"mode": body.get("mode") if body.get("mode") in nw.MODES else "both",
            "rooms": [x for x in rooms if isinstance(x, int) and not isinstance(x, bool)][:40]}
    res = run_command(r["id"], "start", args)
    sp.log("start (%s, %d room(s)): %s" % (args["mode"], len(args["rooms"]), res.get("result")))
    return res


@sp.route("command")
def command(req):
    r = card_robot(req)
    body = req.get("body") if isinstance(req.get("body"), dict) else {}
    # {"command": name} (1.0.4); {"cmd": name} from cards of 1.0.3 and before still works
    cmd = body.get("command", body.get("cmd"))
    if cmd not in nw.SIMPLE:
        raise sp.Error("unknown command", 400)
    return run_command(r["id"], cmd, {})


@sp.manage("test")
def test(req):
    item = req.get("item") or {}
    ip = (item.get("ip") or "").strip()
    if not ip:
        return {"ok": False, "text": w("test.noIp")}
    port = item.get("port") if isinstance(item.get("port"), int) else nw.PORT
    raw = str(item.get("deviceId") or "").strip()
    dev = typed_id(raw)
    if raw and not dev:
        return {"ok": False, "text": w("test.badId")}
    key = item.get("productKey") if isinstance(item.get("productKey"), str) and nw.vlist.KEY.fullmatch(item["productKey"]) else ""
    got = nw.test(ip, port, device_id=dev, product_key=key)
    if not got.get("ok"):
        return {"ok": False, "text": w({"needsId": "test.needsId", "wrongId": "test.wrongId"}.get(got.get("why"), "test.reach"))}
    bat = got.get("battery")
    return {"ok": True, "text": w("test.ok", firmware=got.get("firmware") or "?", battery="%s%%" % bat if bat is not None else "?"),
            "save": {"productKey": got["productKey"], "deviceId": got["deviceId"], "firmware": got.get("firmware") or ""}}


@sp.manage("refresh")
def refresh(req):
    rs = robots()
    for rid in rs:
        map_at[rid] = 0
        next_at[rid] = 0
    return {"ok": True, "text": w("refresh.ok", n=len(rs))}


@sp.on_settings
def changed(settings):
    for rid in robots():
        next_at[rid] = 0


if __name__ == "__main__":
    threading.Thread(target=loop, name="robots", daemon=True).start()
    try:
        sp.run()
    finally:
        stop.set()
