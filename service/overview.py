"""The Manager's Overview (v2.3.1, GET /api/manage/overview): the house at a glance, built from what the server already
knows — the health monitor (service/health.py, already filtered for the caller by server.py), the live state from MQTT
(service/live_state.py: device values, batteries, the alerts waiting on the panels) and the house model's device list.

build(...) is a plain function (no I/O), so the tests feed it anything:

  {"at": now,
   "health":  {"ok", "problems": n, "worst": 0|2|3|4, "checkedAt", "parts": {hub|broker|cameras|panels: "ok"|"warn"|"bad"|"unset"|"none"},
               "partsOk": n, "partsSet": n},
   "panels":  {"online": n, "total": n},
   "alerts":  {"heard": bool (the bridge's list arrived since the server started), "items": [{id, level, title, text, tag,
               since, count, panels: [names] (["all"] = every panel)}…], "canAck": admin, "pinSet": bool (admins only)},
   "look":    [{sev: "bad"|"warn", kind: "problem"|"panel"|"battery"|"offline", title, detail, panel?, device?}…],
   "devices": null (this login may not read devices) | {"total", "lights", "lightsOn", "open", "unlocked", "offline",
               "heard": bool (the bridge's state arrived)},
   "activity": [{at, what: "problem"|"resolved", title, lvl}…] (the health log for now, newest first)}

Who sees what is decided by the caller (server.py): a login that isn't the admin gets the health already filtered
(its own panels, no details), no alert actions, no PIN state; devices only for a login that may read them.
"""
import re

BATTERY_LOW = 15          # % — below this a battery "needs a look"
LOOK_MAX = 30             # rows in "Needs a look"
ACTIVITY_MAX = 8
CAMERA_KINDS = ("protect", "go2rtc", "camera", "cameras", "video")
OPEN_ROLES = ("window", "door-in", "door-out", "contact")


def kind(problem_id):
    """What a problem is about: the part of its id before ":" / "." (as the Manager's pill does)."""
    return re.split(r"[:.]", str(problem_id or ""), 1)[0]


def part_of(problem_id):
    k = kind(problem_id)
    return "hub" if k == "hubitat" else "broker" if k == "mqtt" else "cameras" if k in CAMERA_KINDS else "panels" if k == "panel" else None


def parts_status(problems, parts, panels, has_panels=True):
    """{hub, broker, cameras, panels: "ok" | "warn" | "bad" | "unset" | "none"} — "unset" = not set up and no problem;
    "none" = panels, for a login that has no panel of its own (they may well be set up)."""
    out = {}
    for name in ("hub", "broker", "cameras", "panels"):
        ps = [p for p in problems if part_of(p.get("id")) == name]
        worst = max((p.get("lvl", 3) for p in ps), default=0)
        if name == "panels":
            off = [p for p in panels if p.get("state") != "connected"]
            if not panels and not ps:
                out[name] = "unset" if has_panels else "none"
                continue
            out[name] = "bad" if worst >= 4 else "warn" if ps or off else "ok"
            continue
        if not ps and (parts or {}).get(name) is False:
            out[name] = "unset"
        else:
            out[name] = "bad" if worst >= 4 else "warn" if ps else "ok"
    return out


def _panel_names(panels):
    return {str(p.get("id")): p.get("name") or str(p.get("id")) for p in panels}


def build(health, now, alerts=None, alerts_heard=False, catalog=None, live=None, state_heard=False, admin=False, pin_set=False,
          sees=lambda _p: True, has_panels=True):
    """The Overview (see the module's docstring). health: the caller's GET /api/manage/health answer; alerts: the live
    state's waiting alerts (None = no live state); catalog: the house model's devices (None = the caller may not read
    devices); live: {id: {"values", "last", "battery"}}; sees(panel id): whether the caller sees that panel."""
    health = health or {}
    problems = [p for p in health.get("problems") or [] if isinstance(p, dict)]
    panels = [p for p in health.get("panels") or [] if isinstance(p, dict)]
    parts = parts_status(problems, health.get("parts") or {}, panels, has_panels)
    set_up = [k for k, v in parts.items() if v not in ("unset", "none")]
    names = _panel_names(panels)

    # ---------- alerts waiting (a login that isn't the admin: only the ones its panels show) ----------
    items = []
    for a in alerts or []:
        to = a.get("to") or ["all"]
        if "all" not in to and not any(sees(t) for t in to):
            continue
        shown = ["all"] if "all" in to else [names.get(t, t) for t in to if sees(t)]
        items.append({"id": a["id"], "level": a["lvl"], "title": a.get("title") or "", "text": a.get("text") or "", "tag": a.get("tag") or "",
                      "since": a.get("at") or None, "count": a.get("count") or 1, "panels": shown,
                      **({"kind": "weather", "sender": a.get("sender") or ""} if a.get("kind") == "weather" else {})})   # (v3.0.0: a weather device's warning)

    # ---------- needs a look ----------
    look = []
    for p in problems:
        pid = str(p.get("id") or "")
        row = {"sev": "bad" if p.get("lvl", 3) >= 4 else "warn", "kind": "problem", "title": p.get("title") or pid,
               "detail": p.get("details") or "", "since": p.get("first")}
        if kind(pid) == "panel":
            row.update(kind="panel", panel=pid.split(":", 1)[1])
        look.append(row)
    up = {r.get("panel") for r in look if r.get("panel")}
    for p in panels:   # (a panel that never checked in, before the monitor calls it a problem — a few minutes after a start)
        if p.get("lastSeen") is None and p.get("id") not in up:
            look.append({"sev": "warn", "kind": "panel", "panel": p.get("id"), "title": f"{p.get('name') or p.get('id')} never checked in",
                         "detail": "Open its address on the tablet (Panels)", "since": None})

    devices = None
    if catalog is not None:
        live = live or {}
        counts = {"total": 0, "lights": 0, "lightsOn": 0, "open": 0, "unlocked": 0, "offline": 0, "heard": bool(state_heard)}
        for d in catalog:
            if not isinstance(d, dict) or not isinstance(d.get("id"), int) or d.get("is") == "hidden":
                continue
            counts["total"] += 1
            st = live.get(d["id"]) or {}
            vals = st.get("values") or {}
            role = d.get("is") or ""
            label, room = str(d.get("label") or d["id"]), str(d.get("room") or d.get("hubRoom") or "")
            if role == "light":
                counts["lights"] += 1
                counts["lightsOn"] += vals.get("switch") == "on"
            if role in OPEN_ROLES and vals.get("contact") == "open":
                counts["open"] += 1
            if role == "lock" and vals.get("lock") == "unlocked":
                counts["unlocked"] += 1
            if vals.get("healthStatus") == "offline":
                counts["offline"] += 1
                look.append({"sev": "bad", "kind": "offline", "device": d["id"], "title": f"{label} is offline",
                             "detail": " · ".join(x for x in (room, "the hub can't reach it") if x), "since": st.get("last")})
            b = st.get("battery")
            if isinstance(b, int) and b < BATTERY_LOW:
                look.append({"sev": "bad" if b < 5 else "warn", "kind": "battery", "device": d["id"], "title": f"{label} battery at {b}%",
                             "detail": " · ".join(x for x in (room, "replace soon") if x), "since": None})
        devices = counts
    rank = {"bad": 0, "warn": 1}
    look.sort(key=lambda r: rank.get(r["sev"], 2))   # (stable: the problems first within a level, as the monitor sorts them)

    activity = [{"at": e.get("at"), "what": e.get("what"), "title": e.get("title") or "", "lvl": 0 if e.get("what") == "resolved" else e.get("lvl", 3)}
                for e in (health.get("log") or [])[:ACTIVITY_MAX] if isinstance(e, dict)]

    out = {"at": now,
           "health": {"ok": not problems, "problems": len(problems), "worst": max((p.get("lvl", 3) for p in problems), default=0),
                      "checkedAt": health.get("checkedAt"), "parts": parts, "partsOk": sum(1 for k in set_up if parts[k] == "ok"),
                      "partsSet": len(set_up)},
           "panels": {"online": sum(1 for p in panels if p.get("state") == "connected"), "total": len(panels)},
           "alerts": {"heard": bool(alerts_heard), "items": items, "canAck": bool(admin)},
           "look": look[:LOOK_MAX], "lookTotal": len(look), "devices": devices, "activity": activity}
    if admin:
        out["alerts"]["pinSet"] = bool(pin_set)
    return out
