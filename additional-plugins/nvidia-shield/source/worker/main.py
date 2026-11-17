"""NVIDIA Shield plugin for Skypane: the worker.

One loop owns every connection to every Shield (NVIDIA's protocol on 8987, Google Cast on 8009). Routes put jobs on a
queue and wait for the loop's answer. A Shield's connection stays open while its cards are being looked at (keys feel
instant) and closes when nobody asked for a while.

The app list is pulled once, from Integrations (Sync apps), with its icons, and kept (apps-<item>.json); the panels use
that kept list, filtered and ordered by the item's "apps" setting (a tick list of packages, Skypane 3.0.52; a comma list
of names from 1.0.x still works until it's ticked again). Nothing on a panel refreshes it.

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
import pngthumb

lock = threading.RLock()
jobs = queue.Queue()
stop = threading.Event()
WORDS = {}

ACTIVE_SEC = 90          # a Shield with a card asking within this long is "active"
IDLE_CLOSE_SEC = 120     # an open connection nobody used for this long closes
STATUS_SEC = 12          # Cast status, while active
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
                             "port": int(it.get("port") or sc.PORT), "castPort": int(it.get("castPort") or sc.CAST_PORT),
                             "apps": picks_of(it)}
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


# ---------- the kept app list ----------
def _apps_file(key):
    return "apps-%s.json" % re.sub(r"[^A-Za-z0-9_.-]", "_", str(key))[:80]


def kept_apps(iid, ip):
    """[{pkg, name, cat, icon}] from the last Sync (by the item's id, else its address); None when never synced."""
    for key in (iid, "ip-" + str(ip).lower()):
        if key:
            d = sp.read_private(_apps_file(key), None)
            if isinstance(d, dict) and isinstance(d.get("apps"), list):
                return d["apps"]
    return None


def keep_apps(iid, ip, apps):
    for key in (iid, "ip-" + str(ip).lower()):
        if key:
            sp.write_private(_apps_file(key), {"apps": apps, "when": int(time.time())})


def picks_of(it):
    """An item's picks: its tick list ("showApps", packages), else 1.0.x's comma list of names ("apps")."""
    return it.get("showApps") if isinstance(it.get("showApps"), list) else it.get("apps")


def picked_names(v):
    """The "apps" setting, in the order shown: the ticked packages (a list), or 1.0.x's names separated by commas."""
    if isinstance(v, list):
        return [x.strip() for x in v if isinstance(x, str) and x.strip()]
    return [x.strip() for x in re.split(r"[,\n]", str(v or "")) if x.strip()]


def _index(apps):
    by = {}
    for a in apps:
        by.setdefault(a["pkg"].lower(), a)
        by.setdefault(a["name"].lower(), a)
    return by


def shown_apps(sh):
    """The kept apps this Shield's cards show: the ones named in its "apps" setting, in that order."""
    by = _index(kept_apps(sh["id"], sh["ip"]) or [])
    out, seen = [], set()
    for n in picked_names(sh.get("apps")):
        a = by.get(n.lower())
        if a and a["pkg"] not in seen:
            seen.add(a["pkg"])
            out.append(a)
    return out


def apps_version(sh):
    shown = shown_apps(sh)
    return "%08x" % (hash(json.dumps([[a["pkg"], a["name"], bool(a.get("tile"))] for a in shown])) & 0xFFFFFFFF)


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
        name, times = arg
        with_session(sh, lambda s: [s.key(name) for _ in range(times)])
        return {"ok": True}
    if kind == "text":
        if arg.get("key"):
            with_session(sh, lambda s: s.text_key(arg["key"], arg["n"]))
        else:
            with_session(sh, lambda s: s.type_text(arg["text"]))
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
    if kind in ("sync", "sync-icons"):
        ip, port, iid = arg
        cr = creds_for(iid, ip)
        if not cr:
            return {"ok": False, "result": "unpaired"}
        s = sc.Session(ip, port, cr["cert"], cr["key"], str(sp.data_dir()))
        try:
            apps = s.apps(icons=kind == "sync-icons")
        finally:
            s.close()
        if kind == "sync":
            old = {a["pkg"]: a for a in (kept_apps(iid, ip) or [])}
            for a in apps:                             # (the icons from before, until the new ones come)
                a["icon"] = old.get(a["pkg"], {}).get("icon")
                a["thumb"] = old.get(a["pkg"], {}).get("thumb")
            for a in apps:
                a["tile"] = old.get(a["pkg"], {}).get("tile")
        else:
            for a in apps:
                a["thumb"] = small_icon(a.get("icon"))
                a["tile"] = small_icon(a.get("icon"), TILE, TILE_MAX)
        keep_apps(iid, ip, apps)
        return {"ok": True, "apps": apps}
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
    if not wait:
        return None                      # (queued: nobody waits for it)
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
            "appsVersion": apps_version(sh)}


@sp.route("apps")
def apps(req):
    sh, _ = card_shield(req)
    st(sh["id"])["asked"] = time.monotonic()
    fill_tiles(sh)
    ver = apps_version(sh)
    v = (req.get("query") or {}).get("v")
    if v and v == ver:
        return {"same": True, "version": v}
    # (icons come one by one from the "icon" route: all of them at once can pass the 2 MB answer limit)
    return {"version": ver, "synced": kept_apps(sh["id"], sh["ip"]) is not None,
            "apps": apps_with_icons(shown_apps(sh))}


def fill_tiles(sh):
    """Apps kept by an older version (or before the icons came) have no card icon yet: make the missing ones once, from
    the icon kept at the last Sync, and keep them."""
    kept = kept_apps(sh["id"], sh["ip"])
    if not kept:
        return
    todo = [a for a in kept if "tile" not in a or (a.get("tile") is None and a.get("icon") and "tileTried" not in a)]
    if not todo:
        return
    for a in todo:
        a["tile"] = small_icon(a.get("icon"), TILE, TILE_MAX)
        a["tileTried"] = True
    keep_apps(sh["id"], sh["ip"], kept)


def apps_with_icons(shown):
    """The card's apps, each with its tile icon inside (a data: URL, or None), up to the answer's size limit."""
    out, used = [], 0
    for a in shown:
        ic = a.get("tile") if isinstance(a.get("tile"), str) else None
        if ic and used + len(ic) > APPS_ANSWER_MAX:
            ic = None
        used += len(ic or "")
        out.append({"pkg": a["pkg"], "name": a["name"], "cat": a["cat"], "icon": ic})
    return out


@sp.route("icon")
def icon(req):
    sh, _ = card_shield(req)
    pkg = (req.get("query") or {}).get("pkg")
    for a in kept_apps(sh["id"], sh["ip"]) or []:
        if a["pkg"] == pkg:
            return {"pkg": pkg, "icon": a.get("icon")}
    raise sp.Error("no such app", 404)


@sp.route("key")
def key(req):
    sh, _ = card_shield(req)
    body = req.get("body") or {}
    k, n = body.get("key"), body.get("times", 1)
    if k not in sc.KEYS:
        raise sp.Error("unknown key", 400)
    if not isinstance(n, int) or isinstance(n, bool) or not 1 <= n <= 10:   # (a held button: a few presses a call)
        raise sp.Error("bad times", 400)
    st(sh["id"])["asked"] = time.monotonic()
    return answer(run_job("key", sh, (k, n)))


@sp.route("text")
def text(req):
    """Type on the Shield: {"text": "..."} (up to 100 characters), or {"key": "backspace" | "enter", "n": times}."""
    sh, _ = card_shield(req)
    body = req.get("body") or {}
    k, t = body.get("key"), body.get("text")
    if k is not None:
        if k not in sc.TEXT_KEYS:
            raise sp.Error("unknown key", 400)
        n = body.get("n", 1)
        if not isinstance(n, int) or isinstance(n, bool) or not 1 <= n <= sc.TEXT_MAX:
            raise sp.Error("bad count", 400)
        arg = {"key": k, "n": n}
    elif isinstance(t, str) and sc.TEXT_OK.fullmatch(t):
        arg = {"text": t}
    else:
        raise sp.Error("bad text", 400)
    st(sh["id"])["asked"] = time.monotonic()
    return answer(run_job("text", sh, arg, wait=30))


@sp.route("launch")
def launch(req):
    sh, o = card_shield(req)
    body = req.get("body") or {}
    pkg, name = body.get("pkg"), body.get("name")
    if pkg is None and isinstance(name, str) and name.strip():
        # (the card's own button, by name: looked up in every app the Shield has, picked or not)
        if name.strip() != str(o.get("btnApp") or "").strip():
            raise sp.Error("not this card's button", 400)
        kept = kept_apps(sh["id"], sh["ip"]) or []
        a = _index(kept).get(name.strip().lower()) or next((x for x in kept if x["name"].lower().startswith(name.strip().lower())), None)
        if a is None:
            return {"ok": False, "result": "noApp", "text": w("msg.noApp", app=name.strip()[:60])}
        pkg = a["pkg"]
    if not isinstance(pkg, str) or not re.fullmatch(r"[A-Za-z0-9_.]{1,150}", pkg):
        raise sp.Error("bad app", 400)
    known = {a["pkg"] for a in (kept_apps(sh["id"], sh["ip"]) or [])}
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


@sp.manage("sync")
def sync(req):
    """Pull the app list once and keep it. The "apps" setting holds the user's picks: a first sync lists every app
    (the user deletes the ones they don't use); later syncs keep the picks, drop apps no longer on the Shield and name
    the new ones."""
    it, ip, port = item_from(req)
    if not ip:
        return {"ok": False, "text": w("pair.noIp")}
    old = kept_apps(it.get("id"), ip)
    first = old is None and not picked_names(picks_of(it))
    res = run_job("sync", None, (ip, port, it.get("id")), wait=18)
    if not res.get("ok"):
        why = res.get("result")
        if why == "unpaired":
            return {"ok": False, "text": w("test.unpaired")}
        return {"ok": False, "text": w("test.reach") if why in ("reach", "timeout") else w("test.failed")}
    apps = res["apps"]
    run_job("sync-icons", None, (ip, port, it.get("id")), wait=0)
    by = _index(apps)
    if first:                                    # (every app ticked but the system ones; the owner unticks)
        return {"ok": True, "text": w("sync.first", n=len(apps)), "save": {"showApps": [a["pkg"] for a in apps if a["cat"] != "system"][:200]}}
    picks = picked_names(picks_of(it))
    gone = [n for n in picks if n.lower() not in by]
    before = {a["pkg"] for a in (old or [])}
    new = [a["name"] for a in apps if old is not None and a["pkg"] not in before]
    text = w("sync.again", n=len(apps))
    if gone:
        text += " " + w("sync.gone", names=", ".join(gone[:12]))
    if new:
        text += " " + w("sync.new", names=", ".join(new[:12]))
    out = {"ok": True, "text": text}
    if not isinstance(it.get("showApps"), list):     # (1.0.x's names: turned into ticks, once)
        ticks = []
        for n in picks:
            a = by.get(n.lower())
            if a and a["pkg"] not in ticks:
                ticks.append(a["pkg"])
        out["save"] = {"showApps": ticks[:200]}
    return out


ICON_MAX = 11000         # (a tick list's icon: a data: URL this long at most)
THUMB = 48               # (every tick list icon the same size: 48 x 48, the app's icon fitted in the middle)


TILE, TILE_MAX = 160, 60000     # (the card's copy: up to 160 px, so the biggest tiles stay sharp)
APPS_ANSWER_MAX = 1500000       # (the apps answer, icons inside, stays under the 2 MB answer limit)


def small_icon(url, size=THUMB, most=ICON_MAX):
    """A smaller copy of an app icon (a data: URL): size x size, the icon fitted in the middle; None if it can't."""
    import base64
    if not isinstance(url, str) or not url.startswith("data:image/png;base64,"):
        return None
    try:
        t = pngthumb.thumb(base64.b64decode(url.split(",", 1)[1]), size)
    except (ValueError, MemoryError):
        return None
    out = "data:image/png;base64," + base64.b64encode(t).decode() if t else None
    return out if out and len(out) <= most else None


@sp.manage("choices")
def choices(req):
    """The tick list's choices (Skypane 3.0.52): every app of the last Sync, with its icon when it's small enough."""
    it, ip, _ = item_from(req)
    out = []
    for a in kept_apps(it.get("id"), ip) or []:
        o = {"value": a["pkg"][:200], "label": a["name"][:120]}
        if a.get("thumb"):
            o["icon"] = a["thumb"]
        out.append(o)
    return {"ok": True, "options": out[:500]}


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
