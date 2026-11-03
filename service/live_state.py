"""What the house is doing right now (v2.3.1, the Manager's Overview): the server follows the Hubitat bridge's MQTT
topics in memory — nothing is written to disk, a restart starts empty and fills from the retained topics at once.

  hubitat/state   (retained) {"<id>": {attr: value, …}, …} — every device's current values (the bridge's KEEP list)
  hubitat/event   {"id": 5, "name": "switch", "value": "on", "t": 1729850000.1} — one change, as it happens
  hubitat/alerts  (retained) {"v": 1, "alerts": [{id, lvl, to, tag, title, text, exp, count, at}…]} — the alerts
                  waiting on the panels (scripts/hubitat_bridge.py pub_alerts); a weather device's warning (v3.0.0) also
                  has kind "weather" and maybe place, sender, expires, more

Per device: its current values, the last time it did something (an event; the state map has no times, so a device
not heard since the server started has none yet), its battery, its healthStatus (v2.4.0) and its last EVENTS_KEPT
events (v2.4.0, the Devices page's Events tab: a ring per device, memory only). The waiting alerts as the bridge last said, minus
the ones expired since and the ones the Manager just acknowledged (until the bridge's next list).

Everything that arrives is checked and capped (a LAN device could publish anything on a broker without logins): only
well-formed ids, names and values are kept, at most MAX_DEVICES devices and MAX_ATTRS values each.

Usage (service/server.py: the Notifier's MQTT client passes every message on):
  live = LiveState()
  live.on_message("hubitat/state", payload_bytes)
  live.device(5) -> {"values": {...}, "last": epoch s or None, "battery": 0–100 or None, "health": "online"|"offline"|None} | None
  live.events(5)  -> [{"t", "name", "value"}…] newest first (at most EVENTS_KEPT)
  live.alerts()  -> [alert…] worst first, then newest
"""
import collections
import json
import re
import threading
import time

TOPICS = ("hubitat/state", "hubitat/event", "hubitat/alerts")
MAX_STATE_BYTES = 4 * 1024 * 1024   # the whole state map (a big house: a few hundred KB)
MAX_EVENT_BYTES = 4096
MAX_ALERT_BYTES = 256 * 1024
MAX_DEVICES = 2000
MAX_ATTRS = 80
MAX_ALERTS = 100
TEXT_MAX = 200
EVENTS_KEPT = 50    # v2.4.0: the last events kept per device (the Devices page's Events tab)
HIDE_SECONDS = 10   # an alert the Manager acknowledged stays hidden this long, or until the bridge's list leaves it out
NAME_RE = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,39}")
ALERT_ID = re.compile(r"[0-9a-f]{6,24}")       # (the bridge's ALERT_ID)
PANEL_NAME = re.compile(r"[a-z0-9_-]{1,40}")   # (the bridge's PANEL_NAME)
TAG_RE = re.compile(r"[a-z0-9_-]{1,32}")


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) < 1e15


def _text(v, n=TEXT_MAX):
    return re.sub(r"[\x00-\x1f\x7f]", " ", v)[:n] if isinstance(v, str) else ""


def _value(v):
    """A device value as kept: a number, a short text, true / false or None; anything else → (False, None)."""
    if v is None or isinstance(v, bool) or _num(v):
        return True, v
    if isinstance(v, str):
        return True, _text(v)
    return False, None


def _device_id(v):
    """5, "5" → 5; anything else → None."""
    if isinstance(v, int) and not isinstance(v, bool) and 0 < v < 10 ** 9:
        return v
    if isinstance(v, str) and v.isdecimal() and len(v) <= 9 and int(v) > 0:
        return int(v)
    return None


def _decode(payload, cap):
    if isinstance(payload, (bytes, bytearray)):
        if len(payload) > cap:
            return None
        try:
            payload = bytes(payload).decode("utf-8")
        except UnicodeDecodeError:
            return None
    if not isinstance(payload, str) or len(payload) > cap:
        return None
    try:
        return json.loads(payload)
    except (ValueError, RecursionError):
        return None


def battery_of(values):
    """A device's battery (0–100) from its values, or None."""
    b = (values or {}).get("battery")
    return round(b) if _num(b) and 0 <= b <= 100 else None


def health_of(values):
    """A device's healthStatus ("online" / "offline", Hubitat's Device Health) from its values, or None."""
    h = (values or {}).get("healthStatus")
    return h if h in ("online", "offline") else None


def _live(vals, last):
    return {"values": dict(vals), "last": last, "battery": battery_of(vals), "health": health_of(vals)}


def clean_alert(a):
    """One alert of the bridge's list, made safe (the same fields and checks as the bridge's clean_alert) — or None."""
    if not isinstance(a, dict) or not isinstance(a.get("id"), str) or not ALERT_ID.fullmatch(a["id"]):
        return None
    lvl = a.get("lvl")
    if not isinstance(lvl, int) or isinstance(lvl, bool) or not 1 <= lvl <= 5:
        return None
    to = [t for t in (a.get("to") if isinstance(a.get("to"), list) else ["all"]) if isinstance(t, str) and PANEL_NAME.fullmatch(t)][:20] or ["all"]
    tag = a.get("tag") if isinstance(a.get("tag"), str) and TAG_RE.fullmatch(a.get("tag") or "") else ""
    num = lambda v: v if _num(v) and 0 <= v < 10 ** 11 else 0   # noqa: E731
    count = num(a.get("count"))
    out = {"id": a["id"], "lvl": lvl, "to": to, "tag": tag, "title": _text(a.get("title"), 60), "text": _text(a.get("text"), 300),
           "exp": num(a.get("exp")), "count": max(1, min(int(count) or 1, 999)), "at": num(a.get("at"))}
    if a.get("kind") == "weather":   # (v3.0.0: a weather device's warning — service/weather_device.py)
        out["kind"] = "weather"
        for k in ("place", "sender"):
            if isinstance(a.get(k), str) and a[k]:
                out[k] = _text(a[k], 60)
        if num(a.get("expires")):
            out["expires"] = num(a["expires"])
        more = a.get("more")
        if isinstance(more, int) and not isinstance(more, bool) and 0 < more < 100:
            out["more"] = more
    return out


class LiveState:
    def __init__(self, clock=time.time):
        self.clock = clock
        self.lock = threading.Lock()
        self.values = {}      # id → {attr: value}
        self.last = {}        # id → epoch s of its last event
        self.ring = {}        # id → deque of its last EVENTS_KEPT events (v2.4.0)
        self._alerts = []     # the bridge's last list (cleaned)
        self.gone = {}        # alert id → when the Manager acknowledged it (hidden until the bridge's next list)
        self.newest = None    # (v3.0.2) the newest alert heard since the server started — Integrations → Hubitat shows it
        self.heard = {"state": None, "event": None, "alerts": None}   # when each topic was last heard (epoch s)

    # --- what arrives ---
    def on_message(self, topic, payload):
        """One MQTT message; False when it isn't one of TOPICS or was refused."""
        if topic == "hubitat/state":
            return self.on_state(payload)
        if topic == "hubitat/event":
            return self.on_event(payload)
        if topic == "hubitat/alerts":
            return self.on_alerts(payload)
        return False

    def on_state(self, payload):
        """The whole state map: replaces every device's values (devices gone from the hub go); their times stay."""
        m = _decode(payload, MAX_STATE_BYTES)
        if not isinstance(m, dict):
            return False
        out = {}
        for k, attrs in m.items():
            did = _device_id(k)
            if did is None or not isinstance(attrs, dict) or len(out) >= MAX_DEVICES:
                continue
            vals = {}
            for name, v in attrs.items():
                ok, v = _value(v)
                if ok and isinstance(name, str) and NAME_RE.fullmatch(name) and len(vals) < MAX_ATTRS:
                    vals[name] = v
            out[did] = vals
        with self.lock:
            self.values = out
            self.last = {d: t for d, t in self.last.items() if d in out}
            self.ring = {d: r for d, r in self.ring.items() if d in out}
            self.heard["state"] = self.clock()
        return True

    def on_event(self, payload):
        """One change: {"id", "name", "value", "t"} — that value now, and the device's last activity."""
        m = _decode(payload, MAX_EVENT_BYTES)
        if not isinstance(m, dict):
            return False
        did, name = _device_id(m.get("id")), m.get("name")
        ok, v = _value(m.get("value"))
        if did is None or not ok or not isinstance(name, str) or not NAME_RE.fullmatch(name):
            return False
        now = self.clock()
        t = m.get("t")
        t = t if _num(t) and 0 < t <= now + 300 else now   # (a hub clock far ahead: our own time)
        with self.lock:
            vals = self.values.get(did)
            if vals is None:
                if len(self.values) >= MAX_DEVICES:
                    return False
                vals = self.values[did] = {}
            if name in vals or len(vals) < MAX_ATTRS:
                vals[name] = v
            self.last[did] = max(t, self.last.get(did) or 0)
            r = self.ring.get(did)
            if r is None:
                r = self.ring[did] = collections.deque(maxlen=EVENTS_KEPT)
            r.append({"t": t, "name": name, "value": v})
            self.heard["event"] = now
        return True

    def on_alerts(self, payload):
        """The bridge's list of the alerts waiting on the panels (it replaces the last one)."""
        m = _decode(payload, MAX_ALERT_BYTES)
        if not isinstance(m, dict) or m.get("v") != 1 or not isinstance(m.get("alerts"), list):
            return False
        out = [a for a in (clean_alert(x) for x in m["alerts"][:MAX_ALERTS]) if a]
        with self.lock:
            self._alerts = out
            now = self.clock()
            # (acknowledged here a moment ago: still hidden if the bridge's list is from before it heard the ack)
            self.gone = {i: t for i, t in self.gone.items() if now - t < HIDE_SECONDS and any(a["id"] == i for a in out)}
            self.heard["alerts"] = now
            top = max(out, key=lambda x: x["at"], default=None)
            if top and (not self.newest or top["at"] >= self.newest["at"]):
                self.newest = {k: top[k] for k in ("title", "text", "lvl", "at")}
        return True

    def last_alert(self):
        """(v3.0.2) {"title", "text", "lvl", "at"} of the newest alert since the server started (expired or not) — so the
        Notifier's "Test" can be checked on the Manager before any panel is set up. None = none yet."""
        with self.lock:
            return dict(self.newest) if self.newest else None

    # --- what the Manager reads ---
    def device(self, did):
        did = _device_id(did)
        with self.lock:
            if did is None or did not in self.values:
                return None
            return _live(self.values[did], self.last.get(did))

    def devices(self):
        """{id: {"values", "last", "battery", "health"}} for every device heard of."""
        with self.lock:
            return {d: _live(v, self.last.get(d)) for d, v in self.values.items()}

    def events(self, did, limit=EVENTS_KEPT):
        """A device's last events, newest first: [{"t", "name", "value"}…] (at most `limit`, EVENTS_KEPT kept)."""
        did = _device_id(did)
        with self.lock:
            r = list(self.ring.get(did) or ()) if did is not None else []
        # (newest first by the hub's time — a late, back-dated event goes where it belongs; the same time: the later one first)
        return [dict(e) for e in sorted(reversed(r), key=lambda e: -e["t"])][:max(0, int(limit))]

    def alerts(self):
        """The alerts waiting now: not expired, not just acknowledged here; worst first, then newest."""
        now = self.clock()
        with self.lock:
            out = [dict(a, to=list(a["to"])) for a in self._alerts if not (a["exp"] and a["exp"] <= now)
                   and not now - self.gone.get(a["id"], -1e18) < HIDE_SECONDS]   # (an ack the bridge never acted on: back after 10 s)
        return sorted(out, key=lambda a: (-a["lvl"], -a["at"], a["id"]))

    def forget_alerts(self, ids):
        """The Manager acknowledged these: hidden until the bridge sends a list without them — at most HIDE_SECONDS (an
        acknowledgement the bridge never acted on shows the alert again)."""
        now = self.clock()
        with self.lock:
            for i in ids:
                self.gone[i] = now

    def seen(self):
        """{"state", "event", "alerts"}: when each topic was last heard (None = not since the server started)."""
        with self.lock:
            return dict(self.heard)
