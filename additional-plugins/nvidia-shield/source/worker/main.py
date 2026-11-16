"""NVIDIA Shield plugin for Skypane: the worker.

One loop owns every connection to every Shield (NVIDIA's protocol on 8987, Google Cast on 8009). Routes put jobs on a
queue and wait for the loop's answer. A Shield's connection stays open while its cards are being looked at (keys feel
instant) and closes when nobody asked for a while.

Credentials the Shield issues at pairing are kept in the plugin's private data (creds.json, 0600), keyed by the
settings list item's id and by its address, never in settings and never sent to a card.
"""
import json
import queue
import re
import threading
import time

import skypane_plugin as sp
import shield_core as sc

lock = threading.RLock()
jobs = queue.Queue()
stop = threading.Event()
WORDS = {}

ACTIVE_SEC = 90          # a Shield with a card asking within this long is "active"
IDLE_CLOSE_SEC = 120     # an open connection nobody used for this long closes
STATUS_SEC = 12          # Cast status, while active
APPS_SEC = 15 * 60       # the app list, while active
PAIR_SEC = 180           # a started pairing waits this long for the code


def w(key, **kw):
    global WORDS
    if not WORDS:
        try:
            import os
            with open(os.path.join(os.environ.get("SKYPANE_PLUGIN_DIR", "."), "strings", "en.json"), encoding="utf-8") as f:
                WORDS = json.load(f)
        except (OSError, ValueError):
            WORDS = {}
    s = WORDS.get(key, key)
    for k, v in kw.items():
        s = s.replace("{" + k + "}", str(v))
    return s


# ---------- settings and credentials ----------
def shields():
    """{item id: {"id", "name", "ip", "port", "castPort"}} from the settings list."""
    out = {}
    for it in sp.settings().get("shields") or []:
        if isinstance(it, dict) and it.get("id") and it.get("ip"):
            out[it["id"]] = {"id": it["id"], "name": str(it.get("name") or "Shield")[:48], "ip": str(it["ip"]),
                             "port": int(it.get("port") or sc.PORT), "castPort": int(it.get("castPort") or sc.CAST_PORT)}
    return out


def creds_for(item_id, ip):
    c = sp.read_private("creds.json", {})
    return c.get("id:" + str(item_id)) or c.get("ip:" + str(ip).lower())


def save_creds(item_id, ip, cert, key):
    c = sp.read_private("creds.json", {})
    entry = {"cert": cert, "key": key, "when": int(time.time())}
    if item_id:
        c["id:" + str(item_id)] = entry
    c["ip:" + str(ip).lower()] = entry
    sp.write_private("creds.json", c)


def forget_creds(item_id, ip):
    c = sp.read_private("creds.json", {})
    c.pop("id:" + str(item_id), None)
    c.pop("ip:" + str(ip).lower(), None)
    sp.write_private("creds.json", c)


# ---------- the loop's state ----------
state = {}       # item id → {"asked", "status", "statusAt", "online", "why", "apps", "appsAt", "appsVersion"}
sessions = {}    # item id → sc.Session
pairings = {}    # address → sc.Pairing


def st(iid):
    return state.setdefault(iid, {"asked": 0, "status": None, "statusAt": 0, "online": None, "why": "starting",
                                  "apps": None, "appsAt": 0, "appsVersion": None, "name": None})


def session(sh):
    """The open connection to a paired Shield (opened if needed). Raises sc.ShieldError."""
    s = sessions.get(sh["id"])
    if s is not None:
        return s
    cr = creds_for(sh["id"], sh["ip"])
    if not cr:
        raise sc.ShieldError("unpaired", "not paired")
    s = sc.Session(sh["ip"], sh["port"], cr["cert"], cr["key"], str(sp.data_dir()))
    sessions[sh["id"]] = s
    st(sh["id"])["name"] = s.name
    return s


def drop(iid):
    s = sessions.pop(iid, None)
    if s:
        s.close()


def with_session(sh, fn):
    """fn(session), retried once on a fresh connection when the old one went away."""
    for attempt in (0, 1):
        try:
            return fn(session(sh))
        except sc.ShieldError as e:
            drop(sh["id"])
            if e.why != "reach" or attempt:
                raise


def refresh_apps(sh):
    apps = with_session(sh, lambda s: s.apps())
    s = st(sh["id"])
    s["apps"], s["appsAt"] = apps, time.monotonic()
    s["appsVersion"] = "%08x" % (hash(json.dumps([[a["pkg"], a["name"], bool(a["icon"])] for a in apps])) & 0xFFFFFFFF)
    sp.write_private("apps-%s.json" % sh["id"], {"apps": apps, "version": s["appsVersion"]})


def refresh_status(sh):
    s = st(sh["id"])
    try:
        s["status"] = sc.cast_status(sh["ip"], sh["castPort"])
        s["online"], s["why"] = True, ""
    except sc.ShieldError as e:
        s["status"], s["online"], s["why"] = None, False, e.why
    s["statusAt"] = time.monotonic()


# ---------- jobs (run by the loop) ----------
def do_job(job):
    kind, arg = job["kind"], job.get("arg")
    sh = job.get("shield")
    if kind == "key":
        with_session(sh, lambda s: s.key(arg))
        return {"ok": True}
    if kind == "launch":
        with_session(sh, lambda s: s.launch(arg))
        return {"ok": True}
    if kind == "find":
        with_session(sh, lambda s: s.find_remote())
        return {"ok": True}
    if kind == "power":
        refresh_status(sh)
        stat = st(sh["id"])["status"] or {}
        wake = stat.get("standby") is True or arg == "on"
        if arg == "off":
            wake = False
        with_session(sh, lambda s: s.power(wake))
        return {"ok": True, "result": "on" if wake else "off"}
    if kind == "apps":
        refresh_apps(sh)
        return {"ok": True, "count": len(st(sh["id"])["apps"] or [])}
    if kind == "pair-start":
        ip, port = arg
        old = pairings.pop(ip, None)
        if old:
            old.close()
        for iid, s in list(sessions.items()):     # (one connection at a time to that Shield)
            if s.host == ip:
                drop(iid)
        pairings[ip] = sc.Pairing(ip, port, str(sp.data_dir()))
        return {"ok": True}
    if kind == "pair-finish":
        ip, pin, iid = arg
        p = pairings.pop(ip, None)
        if p is None or time.monotonic() - p.started > PAIR_SEC:
            if p:
                p.close()
            return {"ok": False, "result": "expired"}
        cert, key = p.finish(pin)
        save_creds(iid, ip, cert, key)
        return {"ok": True}
    if kind == "test":
        ip, port, iid = arg
        cr = creds_for(iid, ip)
        if not cr:
            return {"ok": False, "result": "unpaired"}
        s = sc.Session(ip, port, cr["cert"], cr["key"], str(sp.data_dir()))
        try:
            apps = s.apps(icons=False)
        finally:
            s.close()
        return {"ok": True, "name": s.name, "count": len(apps)}
    raise ValueError(kind)


def run_job(kind, shield=None, arg=None, wait=15):
    holder = {"kind": kind, "shield": shield, "arg": arg, "done": threading.Event(), "res": None}
    jobs.put(holder)
    if not holder["done"].wait(wait):
        return {"ok": False, "result": "timeout"}
    return holder["res"]


def loop():
    while not stop.is_set():
        try:
            job = jobs.get(timeout=0.5)
        except queue.Empty:
            job = None
        if job:
            try:
                job["res"] = do_job(job)
            except sc.ShieldError as e:
                job["res"] = {"ok": False, "result": e.why}
            except Exception as e:  # noqa: BLE001 (never let one job stop the loop)
                sp.log("job %s failed: %s" % (job["kind"], type(e).__name__))
                job["res"] = {"ok": False, "result": "failed"}
            job["done"].set()
        now = time.monotonic()
        for iid, sh in shields().items():
            s = st(iid)
            active = now - s["asked"] < ACTIVE_SEC
            if active and now - s["statusAt"] > STATUS_SEC:
                refresh_status(sh)
            if active and s["online"] and creds_for(iid, sh["ip"]) and (s["apps"] is None or now - s["appsAt"] > APPS_SEC):
                try:
                    refresh_apps(sh)
                except sc.ShieldError as e:
                    s["appsAt"] = now - APPS_SEC + 60     # (try again in a minute)
                    if e.why == "unpaired":
                        s["why"] = "unpaired"
            ses = sessions.get(iid)
            if ses and now - ses.used > IDLE_CLOSE_SEC:
                drop(iid)
        for ip, p in list(pairings.items()):
            if now - p.started > PAIR_SEC:
                p.close()
                pairings.pop(ip, None)


# ---------- routes ----------
def card_shield(req):
    """The Shield the asking card is set to (its "shield" item setting); the only one when it has none."""
    all_ = shields()
    if not all_:
        raise sp.Error(w("err.noShields"), 404)
    me = None
    for c in req.get("cards") or []:
        if isinstance(c, dict) and c.get("card") == req.get("card"):
            me = c
    if me is None:
        raise sp.Error("unknown card", 403)
    o = me.get("o") or {}
    sid = o.get("shield")
    if sid not in all_:
        sid = sorted(all_)[0] if len(all_) == 1 else None
    if sid is None:
        raise sp.Error(w("err.noShield"), 404)
    return all_[sid], o


def answer(res):
    out = {"ok": bool(res.get("ok")), "result": res.get("result", "ok" if res.get("ok") else "failed")}
    if not out["ok"]:
        text = w("msg." + out["result"])
        out["text"] = text if text != "msg." + out["result"] else w("msg.failed")
    return out


@sp.route("status")
def status(req):
    sh, _ = card_shield(req)
    with lock:
        s = st(sh["id"])
        s["asked"] = time.monotonic()
    stat = s["status"] or {}
    paired = bool(creds_for(sh["id"], sh["ip"]))
    return {"name": sh["name"], "online": s["online"], "why": s["why"] if s["online"] is not True else "",
            "paired": paired, "app": stat.get("app"), "volume": stat.get("volume"), "standby": stat.get("standby"),
            "appsVersion": s["appsVersion"]}


@sp.route("apps")
def apps(req):
    sh, _ = card_shield(req)
    s = st(sh["id"])
    s["asked"] = time.monotonic()
    if s["apps"] is None:
        saved = sp.read_private("apps-%s.json" % sh["id"], {})
        if saved.get("apps"):
            s["apps"], s["appsVersion"] = saved["apps"], saved.get("version")
    v = (req.get("query") or {}).get("v")
    if v and v == s["appsVersion"]:
        return {"same": True, "version": v}
    # (icons come one by one from the "icon" route: all of them at once can pass the 2 MB answer limit)
    return {"version": s["appsVersion"], "apps": [{"pkg": a["pkg"], "name": a["name"], "cat": a["cat"], "icon": bool(a.get("icon"))}
                                                   for a in (s["apps"] or [])]}


@sp.route("icon")
def icon(req):
    sh, _ = card_shield(req)
    pkg = (req.get("query") or {}).get("pkg")
    for a in st(sh["id"])["apps"] or []:
        if a["pkg"] == pkg:
            return {"pkg": pkg, "icon": a.get("icon")}
    raise sp.Error("no such app", 404)


@sp.route("key")
def key(req):
    sh, _ = card_shield(req)
    k = (req.get("body") or {}).get("key")
    if k not in sc.KEYS:
        raise sp.Error("unknown key", 400)
    st(sh["id"])["asked"] = time.monotonic()
    return answer(run_job("key", sh, k))


@sp.route("launch")
def launch(req):
    sh, o = card_shield(req)
    pkg = (req.get("body") or {}).get("pkg")
    if not isinstance(pkg, str) or not re.fullmatch(r"[A-Za-z0-9_.]{1,150}", pkg):
        raise sp.Error("bad app", 400)
    known = {a["pkg"] for a in (st(sh["id"])["apps"] or [])}
    if pkg not in known and pkg != str(o.get("btnApp") or ""):
        raise sp.Error("not an app on this Shield", 400)
    st(sh["id"])["asked"] = time.monotonic()
    return answer(run_job("launch", sh, pkg))


@sp.route("find")
def find(req):
    sh, _ = card_shield(req)
    return answer(run_job("find", sh))


@sp.route("power")
def power(req):
    sh, _ = card_shield(req)
    want = (req.get("body") or {}).get("to")
    if want not in (None, "on", "off", "toggle"):
        raise sp.Error("bad power", 400)
    res = run_job("power", sh, want)
    out = answer(res)
    if res.get("ok"):
        out["result"] = res.get("result")
    return out


# ---------- the Manager's buttons ----------
def item_from(req):
    """The list item as typed in the form (unsaved values win), with its saved id."""
    it = dict(req.get("item") or {})
    vals = (req.get("body") or {}).get("values")
    if isinstance(vals, dict):
        it.update(vals)
    ip = str(it.get("ip") or "").strip()
    port = int(it.get("port") or sc.PORT)
    return it, ip, port


@sp.manage("pair")
def pair(req):
    it, ip, port = item_from(req)
    if not ip:
        return {"ok": False, "text": w("pair.noIp")}
    pin = re.sub(r"\s", "", str(it.get("code") or "")).upper()
    if not pin:
        res = run_job("pair-start", None, (ip, port), wait=18)
        if res.get("ok"):
            return {"ok": True, "text": w("pair.codeShown")}
        return {"ok": False, "text": w("pair.reach") if res.get("result") in ("reach", "timeout") else w("pair.failed")}
    if not re.fullmatch(r"[0-9A-F]{4,8}", pin):
        return {"ok": False, "text": w("pair.badCode")}
    res = run_job("pair-finish", None, (ip, pin, it.get("id")), wait=18)
    if res.get("ok"):
        return {"ok": True, "text": w("pair.ok"), "save": {"code": ""}}
    why = res.get("result")
    return {"ok": False, "text": w("pair.expired") if why == "expired" else w("pair.wrongCode") if why == "pin" else w("pair.failed")}


@sp.manage("test")
def test(req):
    it, ip, port = item_from(req)
    if not ip:
        return {"ok": False, "text": w("pair.noIp")}
    res = run_job("test", None, (ip, port, it.get("id")), wait=18)
    if res.get("ok"):
        return {"ok": True, "text": w("test.ok", name=res.get("name") or "SHIELD", n=res.get("count", 0))}
    why = res.get("result")
    if why == "unpaired":
        return {"ok": False, "text": w("test.unpaired")}
    return {"ok": False, "text": w("test.reach") if why in ("reach", "timeout") else w("test.failed")}


@sp.manage("forget")
def forget(req):
    it, ip, _ = item_from(req)
    forget_creds(it.get("id"), ip)
    drop(it.get("id"))
    return {"ok": True, "text": w("forget.ok")}


@sp.on_settings
def changed(settings):
    ids = set(shields())
    for iid in list(sessions):
        if iid not in ids:
            drop(iid)


if __name__ == "__main__":
    w("plugin.name")
    threading.Thread(target=loop, daemon=True).start()
    try:
        sp.run()
    finally:
        stop.set()
