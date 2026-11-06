"""UniFi Network for the panels' UniFi cards (v3.0.4): the internet lines, the gateway, the UniFi devices and how they
plug together (the network map), the clients, and a client log with a "new device" notice.

Run by service/run_all.py as the "unifinet" child when UNIFI_API_KEY and UNIFI_HOST are set (like guest_wifi.py, whose
connection it uses: header X-API-KEY, the console's self-signed certificate, redirects refused so the key stays). It
reads the console's Network API under /proxy/network/api/s/default — stat/device, stat/health, stat/sta, the calls
mockups/tools/unifi_snapshot.py found working (stat/event answers 404 there: the client log comes from comparing the
client list at each read) —
  - only while someone looks: a panel with a UniFi card or the Manager asked the dashboard server within DEMAND_FRESH s
    (the server touches private/unifi-net-demand.json), then every POLL_EVERY s; nobody looking = no requests at all;
  - writes private/unifi-net-status.json for the server: the model below, already scrubbed — no key, no IP address, no
    MAC address, no serial (names of clients allowed, as the snapshot); devices and clients go by `id`, a salted hash
    of the MAC (the salt never leaves this file's memory), so the map can keep its positions;
  - keeps its memory in private/unifi-net-state.json (mode 0600): the salt, the 24 h history, the last client list and
    every client ever seen — all by hash, never a MAC.
The model: {ok, readAt, error, wans, gateway, devices, protect, clients, topology, counts, log, notices, alerts}.
(v3.0.5) A UniFi UPS's device row has "ups" (its battery from stat/device's vbms_table — ups_of), and "alerts" are the
network's own events seen between reads (a UniFi device going offline / back, an internet line down / back, a UPS on
battery / back on mains) for the Activity feed — next to the client log (joins, leaves, guests). The line
labels, icons and who sees what are the owner's settings (house/unifi-net.json, written by the server, admin only),
put on by apply_settings() when the server answers — a renamed line shows at once.
Usage: python -I -u service/unifi_net.py --data-dir /data [--once]
"""
import argparse
import hashlib
import hmac
import json
import os
import pathlib
import re
import secrets
import sys
import threading
import time

try:   # (the server imports it as service.unifi_net; run_all runs it isolated, from its own folder)
    from service import guest_wifi, nut_ups
except ImportError:  # pragma: no cover
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    import guest_wifi
    import nut_ups

Fail, read_json, write_private = guest_wifi.Fail, guest_wifi.read_json, guest_wifi.write_private

POLL_EVERY = 30              # s between reads while someone looks
DEMAND_FRESH = 120           # s a panel's / the Manager's ask keeps the reads going
HISTORY_EVERY = 300          # s between the graph's samples (288 = 24 h per line)
HISTORY_KEEP = 288
BAR_SLOTS = 48               # the uptime bars: 30-minute slots over 24 h
DIFF_GAP = 600               # s: a longer pause between reads (nobody looked) starts the comparison afresh
SLOW_MS = 150                # latency above this = "slow" (yellow) on the uptime bars
LOG_MAX = 2000               # client log events kept
NOTICE_KEEP = 86400          # s a "new device" notice is offered to the panels
NOTICES_MAX = 20
ALERTS_MAX = 300             # (v3.0.5) the Activity feed's network events kept
SEEN_MAX = 20000
DAY = 86400

STATUS = "unifi-net-status.json"
STATE = "unifi-net-state.json"
DEMAND = "unifi-net-demand.json"
SETTINGS = "unifi-net.json"    # (in DATA_DIR/house: not secret)

ICONS = ("auto", "wired", "fiber", "cable", "dsl", "satellite", "cellular", "wireless")
LOG_DAYS = (1, 7)
DEFAULT_SETTINGS = {"wans": {}, "clientLog": True, "logDays": 7, "newDevice": True, "newDevicePanels": "all",
                    "hideGuests": True, "poeWarn": 80}


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


ADDR = re.compile(r"\b\d{1,3}(\.\d{1,3}){3}\b|\b([0-9a-f]{2}[:-]){2,}[0-9a-f]{2}\b|\b[0-9a-f]{12}\b|::|https?://", re.I)


def text(v, n=64):
    """A short plain name, or None (not text, empty, or really an address: an IP, a MAC, a link)."""
    if not isinstance(v, str):
        return None
    v = " ".join(v.split())[:n]
    return v if v and not ADDR.search(v) else None


def num(v, nd=2):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, nd) if f == f and abs(f) != float("inf") else None


def mbps(v):
    """Bytes a second → Mbps (None when it isn't a number)."""
    v = num(v, 6)
    return None if v is None else num(v * 8 / 1e6)


def version(v):
    return v if isinstance(v, str) and re.fullmatch(r"[0-9A-Za-z.+_-]{1,32}", v) else None


def count(v):
    return v if isinstance(v, int) and not isinstance(v, bool) and v >= 0 else None


def clean_settings(s):
    """The owner's settings with only known keys and sane values (the server checks them too)."""
    out = json.loads(json.dumps(DEFAULT_SETTINGS))
    if not isinstance(s, dict):
        return out
    for key, w in (s.get("wans") or {}).items() if isinstance(s.get("wans"), dict) else ():
        if key in ("WAN", "WAN2") and isinstance(w, dict):
            label = w.get("label") if isinstance(w.get("label"), str) else ""
            label = " ".join(label.split())[:40]
            out["wans"][key] = {"label": label if not label or text(label) else "",
                                "icon": w.get("icon") if w.get("icon") in ICONS else "auto"}
    for k in ("clientLog", "newDevice", "hideGuests"):
        if isinstance(s.get(k), bool):
            out[k] = s[k]
    if s.get("logDays") in LOG_DAYS and not isinstance(s.get("logDays"), bool):
        out["logDays"] = s["logDays"]
    p = s.get("newDevicePanels")
    if p == "all" or (isinstance(p, list) and len(p) <= 100 and all(isinstance(x, str) and re.fullmatch(r"[a-z0-9_-]{1,40}", x) for x in p)):
        out["newDevicePanels"] = p
    if isinstance(s.get("poeWarn"), int) and not isinstance(s.get("poeWarn"), bool) and 50 <= s["poeWarn"] <= 100:
        out["poeWarn"] = s["poeWarn"]
    return out


# ---------- the console ----------
class Network(guest_wifi.UniFi):
    """guest_wifi's connection, on the Network API's site paths. scheme: "http" only for the tests' own stub console."""
    max_bytes = 16_000_000   # (a 48-port switch's port table is big)

    def __init__(self, host, key, timeout=20, scheme="https"):
        super().__init__(host, key, timeout)
        self.base = f"{scheme}://{host}/proxy/network/api/s/default"

    def get(self, path):
        try:
            v = self._req("GET", path)
        except Fail as e:
            m = re.search(r"HTTP (\d{3})", str(e))
            if m and m.group(1) in ("401", "403"):
                raise Fail(f"UniFi refused the API key (HTTP {m.group(1)}). Check the UniFi Network API key (Manager → Integrations).") from None
            if m and m.group(1) == "404":
                raise Fail("The UniFi console doesn't answer these questions (HTTP 404) — the UniFi console address "
                           "(Manager → Integrations) must be the console itself.") from None
            raise
        data = v.get("data")
        return [x for x in data if isinstance(x, dict)] if isinstance(data, list) else []


# ---------- the model (pure: what the console said → what the panels may see) ----------
TYPES = {"udm": "gateway", "ugw": "gateway", "uxg": "gateway", "usw": "switch", "uap": "ap", "ubb": "bridge"}
BANDS = {"ng": "2.4 GHz", "na": "5 GHz", "6e": "6 GHz"}
MONITOR_NAMES = {"1.1.1.1": "Cloudflare", "1.0.0.1": "Cloudflare", "8.8.8.8": "Google", "8.8.4.4": "Google",
                 "9.9.9.9": "Quad9", "208.67.222.222": "OpenDNS"}


def device_kind(d):
    t, name = d.get("type") or "", f"{d.get('name') or ''} {d.get('model') or ''}"
    if d.get("vbms_table") or re.search(r"\bups\b", name, re.I):
        return "ups"
    if t == "usp" or re.search(r"\busp\b|pdu|power strip", name, re.I):
        return "power"
    return TYPES.get(t, "other")


def icon_of(k):
    """Our own icon set for a client, from UniFi's fingerprint words and the names (UniFi's icon numbers aren't copied)."""
    os_name = str(k.get("os_name") or "")
    words = " ".join(str(k.get(f) or "") for f in ("name", "hostname", "oui", "dev_vendor")).lower() + " " + os_name.lower()
    for icon, pat in (("tv", r"\btv\b|roku|chromecast|apple ?tv|shield|fire ?tv|bravia|vizio|webos|tizen"),
                      ("speaker", r"sonos|echo|alexa|homepod|google ?home|nest ?(mini|audio|hub)|speaker"),
                      ("game", r"xbox|playstation|\bps[345]\b|nintendo|switch ?console|steam ?deck"),
                      ("tablet", r"ipad|tablet|kindle|\bfire\b|galaxy ?tab|lenovo ?tab"),
                      ("watch", r"watch"),
                      ("phone", r"iphone|android|pixel|galaxy|oneplus|motorola|\bphone\b|ios\b"),
                      ("printer", r"printer|epson|brother|canon|laserjet|officejet|\bhp\b"),
                      ("camera", r"camera|\bcam\b|ring|wyze|arlo|blink|reolink"),
                      ("server", r"nas\b|unraid|synology|qnap|server|truenas|proxmox|raspberry|\bpi\b"),
                      ("computer", r"laptop|desktop|\bpc\b|macbook|imac|mac ?mini|windows|macos|mac os|linux|thinkpad|surface"),
                      ("smart-home", r"hubitat|hue|bulb|plug|tasmota|shelly|esp|tuya|ecobee|thermostat|nest|myq|lutron|smart")):
        if re.search(pat, words):
            return icon
    return "other"


def protect_kind(k):
    words = f"{k.get('name') or ''} {k.get('hostname') or ''}"
    if re.search(r"unvr|\bnvr\b|cloud ?key|\buck\b", words, re.I):
        return "nvr"
    if re.search(r"doorbell", words, re.I):
        return "doorbell"
    if re.search(r"camera|\bg[3-6]\b|g[3-6][ -]|\bai\b|bullet|dome|turret|flex|instant|\bcam\b", words, re.I):
        return "camera"
    return "other"


def client_name(k):
    return text(k.get("name")) or text(k.get("hostname")) or text(k.get("oui")) or "Unknown device"


def wan_rows(gw, health):
    """The gateway's lines: [{key, slot, uniFiName, isp, up, active, latency, availability, down, up Mbps, iconAuto, monitors}]."""
    gw = gw or {}
    stats = gw.get("uptime_stats") if isinstance(gw.get("uptime_stats"), dict) else {}
    geo = gw.get("geo_info") if isinstance(gw.get("geo_info"), dict) else {}
    wan_h = next((s for s in health if s.get("subsystem") == "wan"), {})
    www = next((s for s in health if s.get("subsystem") == "www"), {})
    out = []
    for i, (key, field) in enumerate((("WAN", "wan1"), ("WAN2", "wan2"))):
        w = gw.get(field) if isinstance(gw.get(field), dict) else None
        st = stats.get(key) if isinstance(stats.get(key), dict) else None
        if not w and not st:
            continue
        w, st = w or {}, st or {}
        isp = w.get("isp")
        g = geo.get(key) if isinstance(geo.get(key), dict) else {}
        raw = text(w.get("name"), 40)
        out.append({
            "key": key, "slot": f"WAN {i + 1}",
            # the name UniFi gives the line ("WAN" / "WAN2" on their own isn't a name: the server falls back to "Internet 1 / 2")
            "uniFiName": None if not raw or re.fullmatch(r"wan ?\d?", raw, re.I) else raw,
            "isp": text(w.get("isp_name")) or text(isp.get("name") if isinstance(isp, dict) else isp)
                   or text(g.get("isp_name")) or text(g.get("isp_organization")),
            "up": w.get("up") if isinstance(w.get("up"), bool) else None,
            "active": w.get("is_uplink") if isinstance(w.get("is_uplink"), bool) else None,
            "latency": num(w.get("latency")) or num(st.get("latency_average")),
            "availability": num(w.get("availability")) or num(st.get("availability")),
            "down": mbps(w.get("rx_bytes-r")), "upload": mbps(w.get("tx_bytes-r")),
            "monitors": [{"target": MONITOR_NAMES.get(m.get("target")) or text(m.get("target"), 40),
                          "latency": num(m.get("latency_average")), "availability": num(m.get("availability"))}
                         for m in st.get("monitors") or [] if isinstance(m, dict)
                         and (MONITOR_NAMES.get(m.get("target")) or text(m.get("target"), 40))][:6],
        })
        r = out[-1]
        words = f"{r['uniFiName'] or ''} {r['isp'] or ''} {w.get('type') or ''}".lower()
        r["iconAuto"] = ("satellite" if re.search(r"starlink|satellite|hughes|viasat", words) else
                         "cellular" if re.search(r"\blte\b|\b5g\b|\b4g\b|cellular|mobile|t-mobile|verizon wireless", words) else
                         "fiber" if re.search(r"fiber|fibre|ftth|gpon", words) else
                         "cable" if re.search(r"cable|docsis|comcast|xfinity|spectrum|\bcox\b", words) else
                         "dsl" if re.search(r"\bdsl\b|vdsl|adsl", words) else "wired")
    if out and not any(r["active"] for r in out):   # (no is_uplink: the line carrying the traffic is the one in use)
        best = max(out, key=lambda r: (r["down"] or 0) + (r["upload"] or 0))
        best["active"] = True if (best["down"] or 0) + (best["upload"] or 0) > 0 else (len(out) == 1 or None)
    for r in out:   # (one line, or no per-line rates: the gateway's own WAN numbers for the line in use)
        if r["active"] and r["down"] is None:
            r["down"], r["upload"] = mbps(wan_h.get("rx_bytes-r")), mbps(wan_h.get("tx_bytes-r"))
        if r["active"] and r["latency"] is None:
            r["latency"] = num(www.get("latency"))
        r["state"] = ("down" if r["up"] is False else "slow" if (r["latency"] or 0) > SLOW_MS
                      or (r["availability"] is not None and r["availability"] < 99) else "ok" if r["up"] or r["active"] else None)
    return out


def _flat(o, pre="", out=None, depth=0):
    """A nested dict → [("battpool.batteryLevel", 100), …] (numbers, booleans and short text only)."""
    out = [] if out is None else out
    if isinstance(o, dict) and depth <= 4:
        for k, v in list(o.items())[:200]:
            key = f"{pre}.{k}" if pre else str(k)
            if isinstance(v, dict):
                _flat(v, key, out, depth + 1)
            elif isinstance(v, (int, float, bool)) or (isinstance(v, str) and len(v) <= 40):
                out.append((key, v))
    return out


def ups_of(d):
    """(v3.0.5) A UniFi UPS's battery from stat/device (vbms_table, as mockups/tools/unifi_snapshot.py found it:
    battpool.batteryLevel, timeToRemain, device_total_power_output / _budget, device_input / output_voltage,
    is_battery_mode, ischarging) — the names are matched loosely, as the mockup does; what isn't there is None."""
    kv = _flat(d.get("vbms_table")) + [(k, v) for k, v in d.items() if isinstance(v, (int, float, bool)) and re.search(r"batt|ups_|load|runtime|charge|volt", k, re.I)
                                       and not re.search(r"mac|ip|serial", k, re.I)]
    last = lambda k: k.rsplit(".", 1)[-1]  # noqa: E731

    def find(pat, no=None):
        for k, v in kv:
            if re.search(pat, last(k), re.I) and not (no and re.search(no, last(k), re.I)) and not isinstance(v, bool):
                f = num(v)
                if f is not None:
                    return f, last(k)
        return None, None

    def flag(pat):
        return next((v for k, v in kv if isinstance(v, bool) and re.search(pat, last(k), re.I)), None)
    charge, _ = find(r"^(batterylevel|battery_?level|battery_?charge|charge|soc|battery_?percent)$")
    rt, rk = find(r"timetoremain|runtime|remain", r"shutdown|cycle|since")
    runtime = None if rt is None else rt * 60 if re.search(r"min", rk or "", re.I) else rt
    watts, _ = find(r"power_output|output_power")
    budget, _ = find(r"power_budget|max_power")
    load, _ = find(r"^(load|load_?percent|output_?load|ups_?load)$")
    if load is None and watts is not None and budget:
        load = round(watts * 100 / budget)
    on_batt = flag(r"is_battery_mode|on_?battery|battery_?mode")
    if charge is None and watts is None and on_batt is None:
        return None
    st = "low" if on_batt and charge is not None and charge <= nut_ups.LOW_CHARGE else "battery" if on_batt else "mains"
    return {"charge": None if charge is None else round(charge), "runtime": None if runtime is None else round(runtime),
            "load": None if load is None else round(load), "watts": None if watts is None else round(watts),
            "vin": num(find(r"input_?voltage|in_?volt")[0], 1), "vout": num(find(r"output_?voltage|out_?volt")[0], 1),
            "state": st, "charging": flag(r"is_?charging") is True}


def build(devices, health, stas, hid, now):
    """The scrubbed model from the console's three lists. hid(mac) → the id a device / client goes by (never the MAC)."""
    mac_ids = {d["mac"]: hid(d["mac"]) for d in devices if isinstance(d.get("mac"), str)}
    rows, by_id = [], {}
    # what is plugged into each switch port (by a client's sw_mac / sw_port): the PoE list names the device, not the port
    on_port = {}
    for k in stas:
        if k.get("is_wired") and k.get("sw_mac") in mac_ids and count(k.get("sw_port")) is not None:
            on_port[(mac_ids[k["sw_mac"]], k["sw_port"])] = client_name(k)
    for d in devices:
        if d.get("mac") not in mac_ids:
            continue
        did = mac_ids[d["mac"]]
        up = d.get("uplink") if isinstance(d.get("uplink"), dict) and d.get("uplink") else d.get("last_uplink") if isinstance(d.get("last_uplink"), dict) else {}
        ss = d.get("system-stats") if isinstance(d.get("system-stats"), dict) else {}
        ports = [p for p in d.get("port_table") or [] if isinstance(p, dict)]
        poe = sorted(({"port": count(p.get("port_idx")), "name": text(p.get("name"), 40), "watts": num(p.get("poe_power"))}
                      for p in ports if num(p.get("poe_power"))), key=lambda p: -(p["watts"] or 0))
        rows.append({
            "id": did, "name": text(d.get("name")) or text(d.get("model")) or "UniFi device", "model": text(d.get("model"), 32),
            "kind": device_kind(d), "online": d.get("state") == 1,
            "version": version(d.get("version")), "upToDate": not d.get("upgradable"),
            "uptime": count(d.get("uptime")), "cpu": num(ss.get("cpu")), "mem": num(ss.get("mem")),
            "temp": next((num(x.get("value")) for x in d.get("temperatures") or [] if isinstance(x, dict) and num(x.get("value")) is not None),
                         num(d.get("general_temperature"))),
            "clients": count(d.get("num_sta")),
            "portsUp": sum(1 for p in ports if p.get("up")) if ports else None, "portsTotal": len(ports) or None,
            "poeUsed": num(d.get("total_used_power")), "poeBudget": num(d.get("total_max_power")),
            "poeTop": [dict(p, device=on_port.get((did, p["port"]))) for p in poe[:8]],
            # the map: what this one plugs into, on which of its ports (the last known one while offline)
            "uplinkTo": mac_ids.get(up.get("uplink_mac")), "uplinkPort": count(up.get("uplink_remote_port")),
            "uplinkType": "wireless" if up.get("type") == "wireless" else "wire" if up else None,
            "uplinkSpeed": count(up.get("speed")),
        })
        if rows[-1]["kind"] == "ups":   # (v3.0.5: the UPS card — its battery, when the console says it)
            rows[-1]["ups"] = ups_of(d)
        by_id[did] = rows[-1]
    gw_raw = next((d for d in devices if TYPES.get(d.get("type")) == "gateway"), None)
    gw = by_id.get(mac_ids.get((gw_raw or {}).get("mac")))
    gateway = None if not gw else {
        "id": gw["id"], "name": gw["name"], "model": gw["model"], "online": gw["online"], "uptime": gw["uptime"],
        "cpu": gw["cpu"], "mem": gw["mem"], "temp": gw["temp"], "version": gw["version"], "upToDate": gw["upToDate"],
        "devicesToUpdate": sum(1 for r in rows if not r["upToDate"]),
    }
    clients, protect = [], []
    for k in stas:
        if not isinstance(k.get("mac"), str):
            continue
        wired = bool(k.get("is_wired"))
        to = mac_ids.get(k.get("sw_mac") if wired else k.get("ap_mac"))
        base = {"id": hid(k["mac"]), "name": client_name(k), "wired": wired, "connectedTo": to,
                "connectedToName": by_id[to]["name"] if to in by_id else None,
                "port": count(k.get("sw_port")) if wired else None}
        if "ubiquiti" in str(k.get("oui") or "").lower():
            # the UNVR, cameras, doorbells …: not network devices (stat/device doesn't list them) — on the map and in the
            # Protect room, never in the Clients list (the owner keeps them separate)
            protect.append(dict(base, kind=protect_kind(k), model=text(k.get("model"), 32)))
            continue
        clients.append(dict(base, named=bool(text(k.get("name"))), vendor=text(k.get("oui")),
                            network=text(k.get("network")), ssid=None if wired else text(k.get("essid")),
                            guest=bool(k.get("is_guest")), band=None if wired else BANDS.get(k.get("radio")),
                            signal=None if wired else num(k.get("signal"), 0), satisfaction=num(k.get("satisfaction"), 0),
                            uptime=count(k.get("uptime")), down=mbps(k.get("tx_bytes-r")),   # (the client's down = what the AP sends it)
                            upload=mbps(k.get("rx_bytes-r")),
                            traffic=count((k.get("rx_bytes") or 0) + (k.get("tx_bytes") or 0)) if isinstance(k.get("rx_bytes"), int) else None,
                            icon=icon_of(k)))
    wans = wan_rows(gw_raw, health)
    nodes = [{"id": "internet", "kind": "internet", "name": "Internet", "online": any(w["up"] is not False for w in wans) if wans else None}]
    links = []
    for r in rows:
        nodes.append({"id": r["id"], "kind": r["kind"], "name": r["name"], "online": r["online"]})
        if gw and r["id"] == gw["id"]:
            links.append({"from": r["id"], "to": "internet", "port": None, "type": "wan"})
        elif r["uplinkTo"]:
            links.append({"from": r["id"], "to": r["uplinkTo"], "port": r["uplinkPort"], "type": r["uplinkType"], "speed": r["uplinkSpeed"]})
    for p in protect:
        nodes.append({"id": p["id"], "kind": p["kind"], "name": p["name"], "online": True, "protect": True})
        if p["connectedTo"]:
            links.append({"from": p["id"], "to": p["connectedTo"], "port": p["port"], "type": "wire" if p["wired"] else "wireless"})
    kinds = {}
    for r in rows:
        c = kinds.setdefault(r["kind"], {"online": 0, "total": 0})
        c["total"] += 1
        c["online"] += r["online"]
    return {
        "ok": True, "readAt": now, "error": None, "wans": wans, "gateway": gateway, "devices": rows, "protect": protect,
        "clients": sorted(clients, key=lambda c: c["name"].lower()),
        "topology": {"nodes": nodes, "links": links},
        "counts": {"devices": kinds, "clients": len(clients), "wired": sum(c["wired"] for c in clients),
                   "wireless": sum(not c["wired"] for c in clients), "guests": sum(c["guest"] for c in clients),
                   "cameras": sum(p["kind"] in ("camera", "doorbell") for p in protect), "nvr": sum(p["kind"] == "nvr" for p in protect)},
    }


def diff(prev, cur, at):
    """Client log events between two client lists ({id: {name, network, ssid, wired, to, toName, icon}}): join / leave / move
    (a Wi-Fi client on another access point)."""
    out = []
    for cid in cur.keys() - prev.keys():
        out.append({"at": at, "kind": "join", "client": cid, **_ev(cur[cid])})
    for cid in prev.keys() - cur.keys():
        out.append({"at": at, "kind": "leave", "client": cid, **_ev(prev[cid])})
    for cid in cur.keys() & prev.keys():
        a, b = prev[cid], cur[cid]
        if not b["wired"] and a.get("to") and b.get("to") and a["to"] != b["to"]:
            out.append({"at": at, "kind": "move", "client": cid, **_ev(b), "from": a.get("toName")})
    return sorted(out, key=lambda e: (e["kind"], e["name"].lower()))


def _ev(c):
    return {"name": c["name"], "network": c.get("network"), "ssid": c.get("ssid"), "wired": c["wired"], "icon": c.get("icon"), "to": c.get("toName"),
            "guest": bool(c.get("guest"))}


# ---------- the child ----------
class Watcher:
    def __init__(self, api, data_dir, now=time.time):
        self.api, self.now = api, now
        self.data_dir = pathlib.Path(data_dir)
        self.private = self.data_dir / "private"
        st = read_json(self.private / STATE, {}) or {}
        self.salt = st.get("salt") if isinstance(st.get("salt"), str) and len(st["salt"]) == 32 else secrets.token_hex(16)
        self.seen = set(x for x in st.get("seen") or [] if isinstance(x, str))
        self.prev = st.get("prev") if isinstance(st.get("prev"), dict) else None
        self.prev_at = st.get("prevAt") if isinstance(st.get("prevAt"), (int, float)) else 0
        self.history = st.get("history") if isinstance(st.get("history"), dict) else {}
        self.log = [e for e in st.get("log") or [] if isinstance(e, dict)]
        self.notices = [n for n in st.get("notices") or [] if isinstance(n, dict)]
        # (v3.0.5) the Activity feed's network events, and what they're worked out from (by id: never a MAC)
        self.alerts = [e for e in st.get("alerts") or [] if isinstance(e, dict)][-ALERTS_MAX:]
        self.dev_on = st.get("devOn") if isinstance(st.get("devOn"), dict) else None
        self.wan_up = st.get("wanUp") if isinstance(st.get("wanUp"), dict) else None
        self.ups_last = st.get("upsLast") if isinstance(st.get("upsLast"), dict) else {}
        self.model, self.polled_at, self.reads = None, 0, 0

    def hid(self, mac):
        return hmac.new(self.salt.encode(), mac.strip().lower().encode(), hashlib.sha256).hexdigest()[:12]

    def settings(self):
        return clean_settings(read_json(self.data_dir / "house" / SETTINGS, {}))

    def wanted(self, now):
        at = (read_json(self.private / DEMAND, {}) or {}).get("at")
        return isinstance(at, (int, float)) and now - at < DEMAND_FRESH

    def step(self):
        """One look: reads the console when someone looks and POLL_EVERY s have passed. True = it read."""
        now = self.now()
        if not self.wanted(now) or now - self.polled_at < POLL_EVERY:
            return False
        self.polled_at = now
        self.poll(now)
        return True

    def poll(self, now):
        try:
            devices, health, stas = self.api.get("/stat/device"), self.api.get("/stat/health"), self.api.get("/stat/sta")
        except Fail as e:   # (its words name the console's address: never to the panels)
            host = str(getattr(self.api, "host", "") or "")
            words = str(e).replace(host, "the console") if host else str(e)
            self.write_status({**(self.model or {}), "ok": False, "error": words, "readAt": now})
            return
        self.reads += 1
        s = self.settings()
        model = build(devices, health, stas, self.hid, now)
        self.track_history(model, now)
        self.track_clients(model, now, s)
        self.track_alerts(model, now)
        self.model = model
        self.write_status(model)
        self.save_state()

    def track_history(self, model, now):
        for w in model["wans"]:
            ring = self.history.setdefault(w["key"], [])
            if not ring or now - ring[-1]["t"] >= HISTORY_EVERY - 5:
                ring.append({"t": round(now), "down": w["down"], "up": w["upload"], "lat": w["latency"], "s": w["state"]})
                del ring[:-HISTORY_KEEP]
        for key in list(self.history):   # (a line removed on the console: its history goes after a day)
            self.history[key] = [p for p in self.history[key] if isinstance(p, dict) and now - (p.get("t") or 0) < DAY]
            if not self.history[key]:
                del self.history[key]
        rank = {None: 0, "ok": 1, "slow": 2, "down": 3}
        for w in model["wans"]:
            ring = self.history.get(w["key"], [])
            w["history"] = ring
            bars = [None] * BAR_SLOTS   # oldest first; None = no reading in that half hour (nobody was looking)
            for p in ring:
                i = BAR_SLOTS - 1 - int((now - p["t"]) // (DAY / BAR_SLOTS))
                if 0 <= i < BAR_SLOTS and rank.get(p.get("s"), 0) > rank.get(bars[i], 0):
                    bars[i] = p["s"]
            w["bars"] = bars

    def track_clients(self, model, now, s):
        cur = {c["id"]: {"name": c["name"], "network": c["network"], "ssid": c["ssid"], "wired": c["wired"],
                         "to": c["connectedTo"], "toName": c["connectedToName"], "icon": c["icon"], "guest": c["guest"]} for c in model["clients"]}
        first_ever = not self.seen and self.prev is None
        if self.prev is not None and now - self.prev_at <= DIFF_GAP and s["clientLog"]:
            evs = diff(self.prev, cur, now)
            for e in evs:
                if e["kind"] == "join" and e["client"] not in self.seen:
                    e["new"] = True
            self.log += evs
        new = [cid for cid in cur if cid not in self.seen]
        if not first_ever and s["newDevice"]:   # (the very first read: everything is already here, no flood of notices)
            for cid in new:
                c = cur[cid]
                self.notices.append({"id": f"{int(now)}-{cid[:6]}", "at": now, "kind": "newDevice", "client": cid,
                                     "name": c["name"], "network": c["network"], "ssid": c["ssid"], "wired": c["wired"],
                                     "icon": c["icon"], "to": c["toName"], "guest": c["guest"],
                                     **({"hidden": True} if c["guest"] and s["hideGuests"] else {})})
        self.seen.update(new)
        if len(self.seen) > SEEN_MAX:   # (only a flood of random addresses gets here: start the list again from now)
            self.seen = set(cur)
        cut = now - s["logDays"] * DAY
        self.log = [e for e in self.log if (e.get("at") or 0) >= cut][-LOG_MAX:]
        self.notices = [n for n in self.notices if now - (n.get("at") or 0) < NOTICE_KEEP][-NOTICES_MAX:]
        self.prev, self.prev_at = cur, now
        model["log"], model["notices"] = self.log[-500:][::-1], self.notices[::-1]   # (newest first)

    def track_alerts(self, model, now):
        """(v3.0.5) The network's own events since the last read, for the Activity feed: a UniFi device offline / back
        ("devOff" / "devOn"), an internet line down / back ("wanDown" / "wanUp"), a UniFi UPS on battery, low or back on
        mains ("battery" / "low" / "mains", nut_ups.power_events). The first read only remembers how things are."""
        at, out = round(now), []
        on = {d["id"]: bool(d["online"]) for d in model["devices"]}
        if self.dev_on is not None:
            for d in model["devices"]:
                was = self.dev_on.get(d["id"])
                if was is not None and was != on[d["id"]]:
                    out.append({"at": at, "kind": "devOn" if on[d["id"]] else "devOff", "name": d["name"], "dev": d["kind"]})
        self.dev_on = on
        up = {w["key"]: w["up"] is not False for w in model["wans"]}
        if self.wan_up is not None:
            for w in model["wans"]:
                was = self.wan_up.get(w["key"])
                if was is not None and was != up[w["key"]]:
                    out.append({"at": at, "kind": "wanUp" if up[w["key"]] else "wanDown", "wan": w["key"], "name": w.get("uniFiName") or w["slot"]})
        self.wan_up = up
        upses = [{"id": d["id"], "name": d["name"], "online": d["online"], "state": d["ups"]["state"]} for d in model["devices"] if d.get("ups")]
        out += nut_ups.power_events(self.ups_last, upses, now)
        self.alerts = (self.alerts + out)[-ALERTS_MAX:]
        self.alerts = [e for e in self.alerts if now - (e.get("at") or 0) < 7 * DAY]
        for d in model["devices"]:   # (each UPS's last power event: the card's "last power event")
            if d.get("ups"):
                e = next((e for e in reversed(self.alerts) if e.get("ups") == d["id"]), None)
                d["ups"]["last"] = {"kind": e["kind"], "at": e["at"]} if e else None
        model["alerts"] = self.alerts[::-1]

    def write_status(self, model):
        model = dict(model)
        model.setdefault("alerts", self.alerts[::-1])
        model.setdefault("log", self.log[-500:][::-1])
        model.setdefault("notices", self.notices[::-1])
        write_private(self.private / STATUS, json.dumps(model, separators=(",", ":"), ensure_ascii=False))

    def save_state(self):
        write_private(self.private / STATE, json.dumps({"salt": self.salt, "seen": sorted(self.seen), "prev": self.prev,
                                                        "prevAt": self.prev_at, "history": self.history,
                                                        "log": self.log, "notices": self.notices, "alerts": self.alerts,
                                                        "devOn": self.dev_on, "wanUp": self.wan_up, "upsLast": self.ups_last}, separators=(",", ":")))


# TODO (Protect storage, the "Recordings & NVR" card): the UNVR's storage, days of recording left and its drives are
# only in Protect's private API (/proxy/protect/api/nvr: storageStats, systemInfo.storage), which wants a console
# login — the Protect integration (scripts/protect_to_go2rtc.py, the public integration/v1 API with PROTECT_API_KEY)
# has no way in. Needs an optional Protect login in Integrations (a secret like the others) first.

# ---------- for the dashboard server ----------
STALE_AFTER = 3 * POLL_EVERY + 15   # s: a read this old while someone has been asking all along = the child stopped


def mark_stale(st, now, since):
    """(v3.0.4) The child hung or stopped: its last good read would be shown forever. Old (STALE_AFTER) while the
    panels have kept asking since `since` → "stale": True (the cards say "not updating" and stop the flow)."""
    at = st.get("readAt")
    if st.get("ok") and isinstance(at, (int, float)) and since is not None and now - at > STALE_AFTER and now - since > STALE_AFTER:
        return dict(st, stale=True)
    return st

def apply_settings(model, settings, panel=None, alerts=True):
    """The model as one reader sees it: the lines' names (the owner's label, else UniFi's name, else "Internet 1 / 2";
    "WAN 1 / 2" stays the small label) and icons; for a panel (`panel` = its id) guests hidden when the owner says so,
    the log only when it's on, the new-device notices only for the panels chosen."""
    s = clean_settings(settings)
    m = dict(model)
    wans = []
    for i, w in enumerate(m.get("wans") or []):
        own = s["wans"].get(w.get("key")) or {}
        wans.append(dict(w, name=own.get("label") or w.get("uniFiName") or f"Internet {i + 1}", label=own.get("label") or "",
                         icon=own.get("icon") if own.get("icon") not in (None, "auto") else w.get("iconAuto") or "wired"))
    m["wans"] = wans
    m["devices"] = [dict(d, poeWarn=bool(d.get("poeBudget") and (d.get("poeUsed") or 0) * 100 >= d["poeBudget"] * s["poeWarn"]))
                    for d in m.get("devices") or []]
    if not s["clientLog"]:
        m["log"] = []
    else:
        cut = (m.get("readAt") or 0) - s["logDays"] * DAY
        m["log"] = [e for e in m.get("log") or [] if (e.get("at") or 0) >= cut]
    shown = s["newDevice"] and (panel is None or s["newDevicePanels"] == "all" or panel in s["newDevicePanels"])
    m["notices"] = list(m.get("notices") or []) if shown else []
    # (v3.0.5: the Activity feed) alerts=False: this panel has no Activity feed showing them — none sent
    m["alerts"] = [e for e in m.get("alerts") or [] if isinstance(e, dict)][:200] if alerts or panel is None else []
    if panel is not None:
        m["log"] = m["log"][:200]
        if s["hideGuests"]:
            m["clients"] = [c for c in m.get("clients") or [] if not c.get("guest")]
            m["log"] = [e for e in m["log"] if not e.get("guest")]
            m["notices"] = [n for n in m["notices"] if not n.get("guest")]
            if isinstance(m.get("counts"), dict):   # (v3.0.4: the counts without them too — no "Guest 8" while hidden)
                cs = m["clients"]
                m["counts"] = dict(m["counts"], clients=len(cs), wired=sum(bool(c.get("wired")) for c in cs),
                                   wireless=sum(not c.get("wired") for c in cs), guests=0)
        # (v3.0.4) a guest's notice made while guests were hidden stays unshown when they're shown again later
        m["notices"] = [n for n in m["notices"] if not (n.get("guest") and n.get("hidden"))]
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    key = (os.environ.get("UNIFI_API_KEY") or "").strip()
    host = (os.environ.get("UNIFI_HOST") or "").strip()
    if not key or not host:
        log("UniFi Network: the UniFi console address and API key (Manager → Integrations) are both needed — not running")
        return 2
    if not guest_wifi.KEY_OK.fullmatch(key):   # (never print it)
        log("UniFi Network: the UniFi API key looks malformed — not running")
        return 2
    if not re.fullmatch(r"[A-Za-z0-9.:\[\]-]{1,253}", host):
        log("UniFi Network: the UniFi console address must be just the console's address (e.g. 192.168.1.1) — not running")
        return 2
    w = Watcher(Network(host, key), a.data_dir)
    stop, shown = threading.Event(), None
    try:
        while True:
            if w.step():
                err = (read_json(w.private / STATUS, {}) or {}).get("error")
                if err != shown:
                    shown = err
                    log(f"UniFi Network: {err}" if err else "UniFi Network: OK")
            if a.once or stop.wait(5):
                break
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
