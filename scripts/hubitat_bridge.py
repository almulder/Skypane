"""Hubitat <-> MQTT bridge for the wall panel (keeps the Maker API token away from the browser).

  - On start (and every --resync seconds) reads all devices from the Maker API and publishes a compact
    retained map on `hubitat/state`:  {"<id>": {"switch": "on", "level": 99, ...}, ...}
  - Live events from the hub's local event socket (ws://HOST/eventsocket, no token) are published on
    `hubitat/event`:  {"id": 5, "name": "switch", "value": "on", "t": 1729850000.1}
  - Commands arrive on `hubitat/cmd`:  {"id": 5, "command": "on"} / {"id": 5, "command": "setLevel", "value": 40}
    ONLY device ids in the allowlist (--allow or HUBITAT_BRIDGE_ALLOW; default EMPTY = reject everything)
    are sent to the hub. Every command gets a reply on `hubitat/cmd/result` {id, command, ok, reason?}.
    Rejected commands never touch the hub. "unlock" only for a lock the owner allowed (Manager), always with a PIN ticket.
  - `hubitat/modes` (retained) {"modes": [names], "mode": current}; a panel asks on `hubitat/mode/set`
    {"mode", "ticket", "panel"?} (a PIN ticket for id 0 / "setMode" / the name) → `hubitat/mode/result` {ok, mode, reason?}.
  - `hubitat/hsm` (retained) {"status", "alert" (or null), "at"} — Hubitat Safety Monitor; a panel asks on `hubitat/hsm/set`
    {"action", "ticket", "panel"?} (a PIN ticket for id 0 / "setHsm" / the action) → `hubitat/hsm/result` {ok, action, reason?}.
  - Devices on the owner's layout cards (house/card-devices.json) may be switched too (the never list still wins).
  - `hubitat/bridge/status` = online / offline (retained, LWT).
  - (v3.0.0) A Hubitat weather device (Manager → Integrations → Weather; service/weather_device.py): its warnings join
    `hubitat/alerts` (kind "weather", ids "0e…"; dismissed here — no notifier owns them), its weather → `hubitat/weather`
    (retained) for the panels' weather card.
  - The Skypane Notifier (release 2, docs/hubitat-notifier.md): its alerts → `hubitat/alerts` (retained), camera pop-ups →
    `hubitat/show`, speech → `hubitat/say`, volume → `hubitat/volume`; the server's health heartbeat (`dashboard/health`,
    every ~30 s) → the notifier's serverHeartbeat(n, level, text) through the Maker API. A panel's dismissal
    (`hubitat/alerts/ack`) of a level 4–5 alert needs a one-time PIN ticket (id 0 / "alertAck" / the alert id; v2.3.2,
    ACK_TICKETS=off only logs it); a refusal → `hubitat/alerts/ack/result` {id, panel, ok: false, reason}.

Secrets: HUBITAT_HOST / HUBITAT_APP_ID / HUBITAT_TOKEN (and optional MQTT_USER / MQTT_PASSWORD) come from ../.env,
or from environment variables when there is no .env (the Docker container) — never printed. The token is sent
as an Authorization header, never in a URL, and every log line is scrubbed of the token and query strings.

Usage:
  python -I scripts/hubitat_bridge.py --allow 5            # run (Ctrl+C to stop)
  python -I scripts/hubitat_bridge.py --once               # print a state summary and exit
  python -I scripts/hubitat_bridge.py --dry-run --allow 5  # never send commands to the hub
"""
import argparse
import base64
import json
import logging
import math
import os
import queue
import pathlib
import re
import socket
import struct
import sys
import threading
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "service"))
import house_model  # noqa: E402  (service/house_model.py: rooms, devices, locks… from Hubitat's device list)
import panel_pin  # noqa: E402  (service/panel_pin.py: the house's panel PIN, kept as a hash in the house dir)
import weather_device  # noqa: E402  (service/weather_device.py, v3.0.0: a Hubitat weather device's warnings and weather)

# attributes the panel cares about (everything else is left out of hubitat/state and hubitat/event)
KEEP = {
    "switch", "level", "speed", "position", "windowShade", "contact", "motion", "temperature", "humidity",
    "illuminance", "lock", "presence", "battery", "water", "smoke", "carbonMonoxide", "power", "powerSource", "valve",
    "door", "thermostatMode", "thermostatOperatingState", "thermostatFanMode", "heatingSetpoint",
    "coolingSetpoint", "thermostatSetpoint", "status", "volume", "mute", "trackDescription",
    # appliances, speakers, purifier, air quality, garage door, sensors ("things" in service/house_model.py)
    "naturalGas", "acceleration", "moving", "energy", "machineState", "operatingState", "running", "progressPercent",
    "progress", "timeRemaining", "remainingTime", "completionTime", "cycle", "washerJobState", "dryerJobState",
    "jobState", "ovenTemperature", "ovenSetpoint", "ovenMode", "activeBurners", "cookingMode", "hoodFanSpeed",
    "coolerTemperature", "freezerTemperature", "doorFreezerOpen", "fanSpeed", "fanState", "fanMode", "oscillation",
    "airQualityIndex", "pm25", "sensirionVOCindex", "voc", "co2", "alarm", "nightlight", "outlet1", "outlet2",
    "healthStatus",
    # light colour: hue/saturation (0–100), colour temperature (K), colorMode CT/RGB
    "hue", "saturation", "colorTemperature", "colorMode", "colorName",
    # a media player card (Sonos …): trackData is the driver's JSON text — passed on as text (capped), never parsed
    "trackData",
}
TEXT_CAP = {"trackData": 2000}   # longer text caps than compact()'s 200 characters
NUMERIC = {"level", "position", "temperature", "humidity", "illuminance", "battery", "power", "heatingSetpoint",
           "coolingSetpoint", "thermostatSetpoint", "volume", "energy", "progressPercent", "progress", "remainingTime",
           "ovenTemperature", "ovenSetpoint", "activeBurners", "hoodFanSpeed", "coolerTemperature", "freezerTemperature",
           "airQualityIndex", "pm25", "sensirionVOCindex", "voc", "co2", "hue", "saturation", "colorTemperature"}
# the command rules — which commands are ever forwarded, the value checks, when the panel PIN is needed — live in
# service/device_rules.py since v2.9.1, one copy shared with the dashboard service (the Manager's own switching checks
# the same first). The names stay here for this file and its tests.
from device_rules import (COMMANDS, MEDIA, ONLY_LISTED, RANGES, INT_ONLY, NO_VALUE, NO_PIN, CHOICES,  # noqa: E402,F401
                          value_ok, command_arg)
import device_rules  # noqa: E402
STALE_S = 10  # a command still waiting this long (hub slow / down) is dropped - a light must not switch minutes later


T_STATE, T_EVENT, T_CMD, T_RESULT, T_STATUS = "hubitat/state", "hubitat/event", "hubitat/cmd", "hubitat/cmd/result", "hubitat/bridge/status"
# the Skypane Notifier (hubitat/SkypaneNotifier.groovy, release 2): its alerts (retained, checked field by field),
# its camera pop-ups (one-shot), the hub's mode (retained; quiet hours), and every dismissal on a panel (any level)
T_ALERTS, T_SHOW, T_MODE, T_ACK = "hubitat/alerts", "hubitat/show", "hubitat/mode", "hubitat/alerts/ack"
EVERYWHERE = 3   # a dismissed alert of this level or higher is gone on every panel (levels 3–5)
# the admin acknowledged an alert in the Manager (v2.3.1): the server sends {"id", "by": "manager-<login>", "level"} on
# its own topic — only the internal broker login may write it (service/broker.py), so a panel page can't fake it. Gone
# on every panel at any level; Hubitat hears who (ackPanel). The panels' hubitat/alerts/ack refuses a "manager…" name.
T_ACK_MGR = "hubitat/alerts/ack/manager"
# (v2.9.1) the Manager switches a device: {"id", "command", "value"?, "ticket"?, "by": "manager-<login>", "rid", "role",
# "exp", "sig"} on its own topic — only the broker's internal login (the dashboard service, this bridge) may read or
# write manager/# (service/broker.py ACL), and the message is signed with a key from the house ticket key
# (device_rules.MGR_CMD_LABEL), so a broker without those access lists can't forge one either. Exactly the panels'
# checks (on_cmd); the answer {rid, id, command, ok, reason?, sig} — signed too — goes to T_MGR_CMD_RESULT.
# Its own rate budgets, one for admins' commands and one for everyone else's (MANAGER_CMD_RATE each): an admin is
# never shut out by others. It shares the hub queue (20 places) with the panels, but holds at most MGR_QUEUE_MAX of
# them at once, so the panels always keep the rest. A command past its deadline ("exp", the server's 5 s wait) is
# dropped, never sent late — a retry after a timeout can't switch twice. (v2.9.3) Everything the panels send but
# unlock (device_rules.MANAGER_COMMANDS), and the house as device 0: "setMode" / "setHsm" go exactly the panels' way
# (on_mode_set / on_hsm_set: a mode the hub has / HSM_ACTIONS, the one-time ticket for (0, command, value), MODE_RATE /
# HSM_RATE), the answer on T_MGR_CMD_RESULT — never on the panels' result topics.
T_MGR_CMD, T_MGR_CMD_RESULT = "manager/cmd", "manager/cmd/result"
MANAGER_CMD_RATE = 60          # Manager device commands a minute, per budget (admins' / everyone else's)
MGR_QUEUE_MAX = 5              # Manager commands waiting for the hub at once
MGR_CMD_MAX_BYTES = 800        # a command is ~350 bytes with its ticket and signature
MGR_BY = re.compile(r"manager-[a-z0-9_-]{1,32}")
MGR_RID = re.compile(r"[0-9a-f]{24}")
MANAGER = "manager"
MANAGER_BY = re.compile(r"manager-[a-z0-9_-]{1,32}")
MANAGER_ACK_RATE = 30   # Manager acknowledgements a minute — their own budget, never the panels' ACK_RATE
# Dismissing a level 4–5 alert from a panel needs the panel PIN (the owner, the design notes) — proven to the bridge
# with a one-time ticket (v2.3.2): the page gets it from the server (PATCH /api/pin {"action": "ticket", items:
# [[0, "alertAck", "<alert id>"]], pin}) and sends {"id", "panel", "level", "ticket"}; the ticket is for device 0 /
# "alertAck" / that alert id, single use, ~30 s. Which level counts is the hub's (never the message's). A refusal is
# answered on T_ACK_RESULT {"id", "panel", "ok": false, "reason"} (the panel puts the alert back) — every dismissal the
# bridge drops gets one: "no-ticket" | "bad-ticket" | "too-many" | "not-up" ({"all": true, "panel", …} for a dropped
# "all"). ACK_TICKETS=off (the container's environment) turns the check off: then a missing ticket is only logged.
T_ACK_RESULT = "hubitat/alerts/ack/result"
ACK_GUARDED = 4         # this level and higher: a panel's dismissal needs a ticket (levels 1–3 and a Silence don't)
ACK_TICKET = re.compile(r"[0-9]{1,12}\.[0-9a-f]{16}\.[0-9a-f]{64}")   # (panel_pin.ticket's shape)
# (its driver name)
NOTIFIER_TYPES = {"Skypane Notifier"}
ALERT_ID = re.compile(r"[0-9a-f]{6,24}")
PANEL_NAME = re.compile(r"[a-z0-9_-]{1,40}")
# the notifier as a speaker (SpeechSynthesis / AudioVolume): one-shot {"to", "text", "volume", "voice", "id"} and
# {"to", "volume", "muted"} — the panels speak it / set their own volume (docs/hubitat-notifier.md)
T_SAY, T_VOLUME = "hubitat/say", "hubitat/volume"
SAY_RATE = 10          # spoken messages per minute, all notifiers together
# the server's health heartbeat (service/health.py, written by the internal login only): {"v": 1, "n", "lvl", "text"};
# passed on to every notifier (serverHeartbeat) so Hubitat knows the server is alive and what's wrong
T_HEALTH = "dashboard/health"
HEALTH_MAX_BYTES = 400
HEALTH_EVERY = 20      # seconds: the same heartbeat is passed on at most this often (a changed one at most every 5 s)
T_WEATHER = weather_device.TOPIC   # (v3.0.0) retained: the weather device's weather for the panels' Home tab
WX_DEBOUNCE = 3.0      # seconds: a weather driver's poll is a burst of events — one publish after it
T_MODEL = "hubitat/model"  # retained {"version": …}: a panel whose house model is older reloads (when nobody uses it)
# the hub's modes: retained {"modes": [names…], "mode": current}; a panel asks for a change on hubitat/mode/set
# {"mode", "ticket", "panel"?} (a one-time PIN ticket for id 0 / "setMode" / the name) and hears hubitat/mode/result
T_MODES, T_MODE_SET, T_MODE_RESULT = "hubitat/modes", "hubitat/mode/set", "hubitat/mode/result"
MODE_SET_MAX_BYTES = 300
MODE_RATE = 6          # mode changes per minute, all panels together
MAX_MODES = 20
# Hubitat Safety Monitor: retained {"status", "alert" (or null), "at": epoch s of the last change}; a panel asks on
# hubitat/hsm/set {"action", "ticket", "panel"?} (a one-time PIN ticket for id 0 / "setHsm" / the action, for EVERY
# action — disarm included) and hears hubitat/hsm/result {"ok", "action", "reason"?}
T_HSM, T_HSM_SET, T_HSM_RESULT = "hubitat/hsm", "hubitat/hsm/set", "hubitat/hsm/result"
HSM_SET_MAX_BYTES = 300
HSM_RATE = 6           # HSM changes per minute, all panels together
HSM_STATUSES = {"armedAway", "armedHome", "armedNight", "armingAway", "armingHome", "armingNight", "disarmed", "allDisarmed"}
HSM_ALERTS = {"intrusion", "intrusion-home", "intrusion-night", "smoke", "water", "rule", "cancel", "arming"}
HSM_ACTIONS = ("armAway", "armHome", "armNight", "disarm", "cancelAlerts")   # → Maker API GET hsm/<action>
CARD_FILE = "card-devices.json"   # {"v": 1, "ids": [...]}: devices the owner put on layout cards (the service writes it)
MAX_CARD_IDS = 2000


# ---------- secrets + safe logging ----------
ENV_KEYS = ("HUBITAT_HOST", "HUBITAT_APP_ID", "HUBITAT_TOKEN", "MQTT_USER", "MQTT_PASSWORD")


def load_env():
    env = {}
    if not (ROOT / ".env").exists():  # Docker: settings come from the container environment
        return {k: os.environ[k].strip() for k in ENV_KEYS if os.environ.get(k, "").strip()}  # (a pasted newline would break the header)
    for line in (ROOT / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


class Scrub(logging.Filter):
    """Removes the token and any URL query string from every log record."""
    def __init__(self, secrets):
        super().__init__()
        self.secrets = [s for s in secrets if s]

    def filter(self, record):
        msg = record.getMessage()
        for s in self.secrets:
            msg = msg.replace(s, "***")
        msg = re.sub(r"\?[^\s'\"]*", "?[query removed]", msg)            # strip query strings
        msg = re.sub(r"access_token=[^\s&'\"]*", "access_token=***", msg)
        record.msg, record.args = msg, ()
        return True


log = logging.getLogger("bridge")


def safe_err(e):
    """Short description of an exception without URLs/tokens (scrubbed again by the log filter)."""
    code = getattr(e, "code", None)
    reason = getattr(e, "reason", None)
    if code:
        return f"HTTP {code}"
    if reason is not None:
        return f"{type(e).__name__}: {reason}"
    if isinstance(e, OSError):
        return type(e).__name__ + (f": {e.strerror}" if e.strerror else "")
    return type(e).__name__  # other errors' text can quote the request (e.g. the Authorization header) - never logged


# ---------- Maker API ----------
class Maker:
    def __init__(self, env):
        self.host, self.app, self.token = env["HUBITAT_HOST"], env["HUBITAT_APP_ID"], env["HUBITAT_TOKEN"]

    def get(self, path, timeout=30):
        url = f"http://{self.host}/apps/api/{self.app}/{path}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self.token}"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
        except Exception as e:  # never let the exception text (which may hold the URL) escape
            raise RuntimeError(f"GET {path.split('?')[0]} failed: {safe_err(e)}") from None
        return json.loads(body) if body.strip() else None


def compact(v, name):
    if v is None:
        return None
    if name in TEXT_CAP and not isinstance(v, str):
        return None           # (trackData is JSON text from the driver; anything else is dropped, never passed on)
    cap = TEXT_CAP.get(name, 200)
    if isinstance(v, str) and len(v) > cap:
        return v[:cap] + "…"  # e.g. a Sonos trackDescription built from long metadata
    if name in NUMERIC:
        try:
            f = float(v)
            if not math.isfinite(f):
                return None  # "NaN"/"Infinity" from a sensor would make the whole state invalid JSON
            return int(f) if f.is_integer() else round(f, 2)
        except (TypeError, ValueError):
            return v
    return v


def _short(v, n):
    if not isinstance(v, str):
        return ""
    v = re.sub(r"[\x00-\x1f\x7f]", " ", v).strip()
    return v[:n]


def clean_alert(m):
    """A notifier's alert (panelCommand op "notify"), made safe for the panels — or None. The pages escape every text
    too; here only what's well-formed gets through."""
    if not isinstance(m, dict) or not isinstance(m.get("id"), str) or not ALERT_ID.fullmatch(m["id"]):
        return None
    lvl = m.get("lvl")
    if not isinstance(lvl, int) or isinstance(lvl, bool) or not 1 <= lvl <= 5:
        return None
    to = [t for t in (m.get("to") if isinstance(m.get("to"), list) else ["all"]) if isinstance(t, str) and PANEL_NAME.fullmatch(t)][:20] or ["all"]
    text = _short(m.get("text"), 300)
    if not text:
        return None
    num = lambda v: v if isinstance(v, int) and not isinstance(v, bool) and 0 <= v < 10 ** 11 else 0  # noqa: E731
    tag = m.get("tag") if isinstance(m.get("tag"), str) and re.fullmatch(r"[a-z0-9_-]{1,32}", m.get("tag") or "") else ""
    return {"id": m["id"], "lvl": lvl, "to": to, "tag": tag, "title": _short(m.get("title"), 60), "text": text,
            "exp": num(m.get("exp")), "count": max(1, min(num(m.get("count")) or 1, 999)), "at": int(time.time())}


def clean_say(m):
    """A notifier's speech (panelCommand op "say") → the message for the panels, or None."""
    text = _short(m.get("text"), 300)
    if not text:
        return None
    vol = m.get("vol")
    out = {"to": _targets(m.get("to")), "text": text,
           "volume": vol if isinstance(vol, int) and not isinstance(vol, bool) and 0 <= vol <= 100 else None,
           "voice": re.sub(r"[^A-Za-z0-9 ._()-]", "", _short(m.get("voice"), 40)).strip()}
    if isinstance(m.get("id"), str) and ALERT_ID.fullmatch(m["id"]):
        out["id"] = m["id"]   # (the alert it also shows: a panel speaks it once)
    return out


def clean_volume(m):
    """A notifier's volume (panelCommand op "volume") → {"to", "volume" (0–100 or None), "muted" (bool or None)}, or None."""
    vol, muted = m.get("vol"), m.get("muted")
    vol = vol if isinstance(vol, int) and not isinstance(vol, bool) and 0 <= vol <= 100 else None
    muted = muted if isinstance(muted, bool) else None
    if vol is None and muted is None:
        return None
    return {"to": _targets(m.get("to")), "volume": vol, "muted": muted}


def _targets(to):
    return [t for t in (to if isinstance(to, list) else []) if isinstance(t, str) and PANEL_NAME.fullmatch(t)][:20] or ["all"]


def parse_health(payload):
    """The server's heartbeat on dashboard/health → {"n", "lvl", "text"} or None. The text goes into a Maker API URL:
    only plain letters, digits and a little punctuation get through (no commas — the Maker API splits at them — and no
    slashes), at most 120 characters."""
    if isinstance(payload, bytes):
        if len(payload) > HEALTH_MAX_BYTES:
            return None
        payload = payload.decode("utf-8", "replace")
    if not isinstance(payload, str) or len(payload) > HEALTH_MAX_BYTES:
        return None
    try:
        m = json.loads(payload)
    except ValueError:
        return None
    if not isinstance(m, dict) or m.get("v") != 1:
        return None
    n, lvl = m.get("n"), m.get("lvl")
    if not (isinstance(n, int) and not isinstance(n, bool) and 0 <= n <= 999) or not (isinstance(lvl, int) and not isinstance(lvl, bool) and 0 <= lvl <= 5):
        return None
    text = re.sub(r"\s+", " ", re.sub(r"[^A-Za-z0-9 .:;'()!?+_-]", " ", m.get("text") if isinstance(m.get("text"), str) else "")).strip()[:120].strip()
    return {"n": n, "lvl": lvl, "text": text or ("OK" if n == 0 else "A problem")}


def active_ids(value):
    """A notifier's activeAlerts ({"v": 1, "ids": [[id, level, expiry]…]}) → {id: (level, expiry)}."""
    try:
        v = json.loads(value) if isinstance(value, str) else value
    except ValueError:
        return {}
    out = {}
    for row in (v.get("ids") if isinstance(v, dict) and isinstance(v.get("ids"), list) else [])[:40]:
        if isinstance(row, list) and len(row) == 3 and isinstance(row[0], str) and ALERT_ID.fullmatch(row[0]) \
                and isinstance(row[1], int) and not isinstance(row[1], bool) and 1 <= row[1] <= 5 \
                and isinstance(row[2], int) and not isinstance(row[2], bool):
            out[row[0]] = (row[1], row[2])
    return out


ACK_MAX_BYTES = 300   # a dismissal is ~80 bytes; anything bigger is not from a panel
ACK_RATE = 20         # plain dismissals (no PIN ticket) a minute per panel name
ACK_ALL_RATE = 60     # plain dismissals a minute, all panel names together (a flood never reaches the hub)
TICKET_ACK_RATE = 30  # PIN-checked level 4–5 dismissals a minute: their own budget, never starved by plain ones


def parse_ack(payload):
    """A panel's dismissal on hubitat/alerts/ack, checked strictly → {"id", "panel", "level", "ticket"} or {"all", "panel"}
    — or None. The level may be missing (a page from before levels were sent): the bridge then uses the hub's level.
    "ticket" (v2.3.2; None when not sent): the one-time PIN ticket a level 4–5 dismissal needs (ACK_GUARDED).
    {"id", "panel", "level", "silenced": true}: not a dismissal — the panel only stopped the sound of a level 4–5
    ("Silence without the PIN", v2.2.0) → {"id", "panel", "level", "silenced": True}."""
    if isinstance(payload, bytes):
        if len(payload) > ACK_MAX_BYTES:
            return None
        try:
            payload = payload.decode("utf-8")
        except UnicodeDecodeError:
            return None
    if not isinstance(payload, str) or len(payload) > ACK_MAX_BYTES:
        return None
    try:
        m = json.loads(payload)
    except ValueError:
        return None
    if not isinstance(m, dict) or not isinstance(m.get("panel"), str):
        return None
    panel = m["panel"].lower()
    if not PANEL_NAME.fullmatch(panel) or panel.startswith(MANAGER):   # ("manager-…" only on T_ACK_MGR, from the server)
        return None
    if "all" in m:
        if m["all"] is not True or set(m) - {"all", "panel"}:
            return None
        return {"all": True, "panel": panel}
    if set(m) - {"id", "panel", "level", "silenced", "ticket"} or not isinstance(m.get("id"), str) or not ALERT_ID.fullmatch(m["id"]):
        return None
    ticket = m.get("ticket")
    if ticket is not None and (not isinstance(ticket, str) or not ACK_TICKET.fullmatch(ticket) or "silenced" in m):
        return None
    lvl = m.get("level")
    if lvl is not None and (not isinstance(lvl, int) or isinstance(lvl, bool) or not 1 <= lvl <= 5):
        return None
    if "silenced" in m:
        if m["silenced"] is not True or lvl not in (4, 5):
            return None
        return {"id": m["id"], "panel": panel, "level": lvl, "silenced": True}
    return {"id": m["id"], "panel": panel, "level": lvl, "ticket": ticket}


def parse_manager_ack(payload):
    """The server's Manager acknowledgement on T_ACK_MGR, checked strictly → {"id", "by", "level"} or None."""
    if isinstance(payload, bytes):
        if len(payload) > ACK_MAX_BYTES:
            return None
        try:
            payload = payload.decode("utf-8")
        except UnicodeDecodeError:
            return None
    if not isinstance(payload, str) or len(payload) > ACK_MAX_BYTES:
        return None
    try:
        m = json.loads(payload)
    except ValueError:
        return None
    if not isinstance(m, dict) or set(m) != {"id", "by", "level"}:
        return None
    lvl = m["level"]
    if not isinstance(m["id"], str) or not ALERT_ID.fullmatch(m["id"]) or not isinstance(m["by"], str) or not MANAGER_BY.fullmatch(m["by"]) \
            or not isinstance(lvl, int) or isinstance(lvl, bool) or not 1 <= lvl <= 5:
        return None
    return {"id": m["id"], "by": m["by"], "level": lvl}


def parse_modes(modes):
    """The Maker API's modes ([{"id", "name", "active"}…]) → ({name: id} in hub order, the active name or None), or
    None when it isn't a list. Bad entries are dropped; at most MAX_MODES kept. The names go into a retained topic
    and are matched against the panels' requests, the id into a Maker API URL: only well-formed ones get through."""
    if not isinstance(modes, list):
        return None
    out, active = {}, None
    for m in modes:
        if len(out) >= MAX_MODES:
            break
        if not isinstance(m, dict):
            continue
        name, mid = m.get("name"), m.get("id")
        if not isinstance(name, str) or not 0 < len(name) <= 40 or not name.isprintable() or name != name.strip():
            continue
        if m.get("active") is True and active is None:   # (the current mode is shown even if it can't be chosen)
            active = name
        if not isinstance(mid, int) or isinstance(mid, bool) or not 0 < mid < 10 ** 9 or name in out:
            continue
        out[name] = mid
    return out, active


def parse_mode_set(payload):
    """A panel's mode change request, checked strictly → {"mode", "ticket" (or None), "panel" (or None)} or None."""
    if isinstance(payload, (bytes, bytearray)):
        if len(payload) > MODE_SET_MAX_BYTES:
            return None
        try:
            payload = bytes(payload).decode("utf-8")
        except UnicodeDecodeError:
            return None
    if not isinstance(payload, str) or len(payload.encode("utf-8", errors="replace")) > MODE_SET_MAX_BYTES:
        return None
    try:
        m = json.loads(payload)
    except ValueError:
        return None
    if not isinstance(m, dict) or set(m) - {"mode", "ticket", "panel"}:
        return None
    mode, ticket, panel = m.get("mode"), m.get("ticket"), m.get("panel")
    if not isinstance(mode, str) or not 0 < len(mode) <= 40:
        return None
    if ticket is not None and (not isinstance(ticket, str) or len(ticket) > 200):
        return None
    if panel is not None and (not isinstance(panel, str) or not PANEL_NAME.fullmatch(panel)):
        return None
    return {"mode": mode, "ticket": ticket or None, "panel": panel}


def hsm_status(value):
    """An HSM status word (Maker API "hsm" or a LOCATION hsmStatus event) → the panel's status, or None if unknown."""
    if not isinstance(value, str) or value not in HSM_STATUSES:
        return None
    return "disarmed" if value == "allDisarmed" else value


def parse_hsm_set(payload):
    """A panel's HSM request, checked strictly → {"action" (any short string — the caller checks it against
    HSM_ACTIONS), "ticket" (or None), "panel" (or None)} or None."""
    if isinstance(payload, (bytes, bytearray)):
        if len(payload) > HSM_SET_MAX_BYTES:
            return None
        try:
            payload = bytes(payload).decode("utf-8")
        except UnicodeDecodeError:
            return None
    if not isinstance(payload, str) or len(payload.encode("utf-8", errors="replace")) > HSM_SET_MAX_BYTES:
        return None
    try:
        m = json.loads(payload)
    except ValueError:
        return None
    if not isinstance(m, dict) or set(m) - {"action", "ticket", "panel"}:
        return None
    action, ticket, panel = m.get("action"), m.get("ticket"), m.get("panel")
    if not isinstance(action, str) or not 0 < len(action) <= 40:
        return None
    if ticket is not None and (not isinstance(ticket, str) or len(ticket) > 200):
        return None
    if panel is not None and (not isinstance(panel, str) or not PANEL_NAME.fullmatch(panel)):
        return None
    return {"action": action, "ticket": ticket or None, "panel": panel}


def media_cmds(devices):
    """id → the media commands (MEDIA) the device's own raw Maker API "commands" list names (strings, or
    {"command": name} maps on older firmware). A device without them gets none."""
    out = {}
    for d in devices if isinstance(devices, list) else []:
        try:
            if not isinstance(d, dict) or not str(d.get("id", "")).isdecimal():
                continue
            cl = d.get("commands")
            names = {c.get("command") if isinstance(c, dict) else c for c in cl} if isinstance(cl, list) else set()
            have = {c for c in names if isinstance(c, str)} & MEDIA
            if have:
                out[int(d["id"])] = have
        except (TypeError, ValueError, AttributeError):
            continue
    return out


def build_state(devices):
    st = {}
    for d in devices:
        a = d.get("attributes") or {}
        keep = {k: compact(v, k) for k, v in a.items() if k in KEEP and v is not None}
        if keep:
            st[str(d["id"])] = keep
    return st


# ---------- tiny RFC 6455 client (text frames, ping/pong, close) ----------
class WS:
    def __init__(self, host, path, timeout=10):
        h, _, p = host.partition(":")
        self.sock = socket.create_connection((h, int(p or 80)), timeout=timeout)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET {path} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                           f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = self.sock.recv(1024)
            if not chunk:
                raise ConnectionError("closed during handshake")
            head += chunk
        head, self.buf = head.split(b"\r\n\r\n", 1)
        if b" 101 " not in head.split(b"\r\n")[0]:
            raise ConnectionError("handshake refused: " + head.split(b"\r\n")[0].decode(errors="replace"))
        self.sock.settimeout(None)

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("socket closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, opcode, data=b""):
        mask = os.urandom(4)
        n = len(data)
        hdr = bytes([0x80 | opcode])
        hdr += bytes([0x80 | n]) if n < 126 else (bytes([0x80 | 126]) + struct.pack(">H", n) if n < 65536 else bytes([0x80 | 127]) + struct.pack(">Q", n))
        self.sock.sendall(hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def recv_text(self):
        """Returns the next text message (handles fragments, answers pings). Raises on close."""
        parts = []
        while True:
            b1, b2 = self._read(2)
            fin, op, n = b1 & 0x80, b1 & 0x0F, b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            mask = self._read(4) if b2 & 0x80 else None
            data = self._read(n)
            if mask:
                data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
            if op == 0x9:
                self.send(0xA, data)
            elif op == 0x8:
                raise ConnectionError("server closed websocket")
            elif op in (0x1, 0x0, 0x2):
                parts.append(data)
                if fin:
                    return b"".join(parts).decode("utf-8", errors="replace")

    def close(self):
        try:
            self.send(0x8)
        except OSError:
            pass
        try:
            self.sock.close()
        except OSError:
            pass


# ---------- bridge ----------
class Bridge:
    def __init__(self, args, env):
        self.args, self.maker = args, Maker(env)
        self.host = env["HUBITAT_HOST"]
        self.mqtt_user, self.mqtt_password = env.get("MQTT_USER"), env.get("MQTT_PASSWORD")
        self.extra_allow = set(args.allow)  # --allow / BRIDGE_ALLOW / --allow-file: always allowed on top
        self.allow = set(args.allow)        # with a house model: + everything the panel shows (house_model.switchable)
        self.model, self.model_version, self.never_sig = None, None, None
        self.devices = None                 # the last device list from the hub (an overrides change rebuilds from it)
        self.never, self.overrides = None, {}   # from the main panel's settings (last good read kept)
        self.switch_rule = (set(), set())       # (allowed, never) exceptions to the name rule (Manager)
        self.allow_lock = threading.Lock()  # the allowlist is used on the MQTT thread (commands) and set on others
        self.model_lock = threading.RLock()     # one model rebuild at a time (resync thread / settings watcher)
        self.pin = panel_pin.PanelPin(pathlib.Path(args.house_dir)) if args.house_dir else None
        self.risky = set()       # devices that open something (Valve / garage controller), by capability — always PIN
        self.used_tickets = {}   # ticket → expiry: each one-time ticket is accepted once
        # a panel's level 4–5 dismissal needs a PIN ticket (T_ACK_RESULT above); False = only logged (ACK_TICKETS=off)
        self.ack_tickets = getattr(args, "ack_tickets", True)
        self.started = time.time()  # tickets issued before this bridge started are refused (no replay after a restart)
        self.kind_cmds = {}      # id → the only commands it accepts (locks, valves, garage openers)
        self.media = {}          # id → the MEDIA commands its own Hubitat command list names (media_cmds; every resync)
        self.garage_relays = set()  # garage openers that are plain relays: every command except refresh needs a ticket
        self.garage_doors = set()   # real garage door controllers: "close" without a ticket only while open
        self.state, self.lock = {}, threading.Lock()
        self._state_timer = None   # pub_state_soon()
        # events count up `seq`; `touched` remembers the seq of the last event per (device, attribute) so a resync
        # that started earlier keeps the newer event value instead of the older snapshot
        self.seq, self.touched, self.resync_lock = 0, {}, threading.Lock()
        self.cmds = queue.Queue(maxsize=20)  # commands go to the hub one at a time (worker thread)
        self.mqtt = None
        self.stop = threading.Event()
        # the notifier(s): their ids, which alerts are up ({notifier: {alert id: (level, expiry)}}), the texts we have
        # (alert id → clean_alert + "nid"), the hub's mode, recent dismissals (rate limit), replay requests
        self.notifiers, self.active, self.alert_text, self.mode = set(), {}, {}, None
        self.note_lock = threading.Lock()
        self.acks, self.replayed = {}, {}   # (plain dismissals: panel name → when, for ACK_RATE / ACK_ALL_RATE)
        self.ticket_acks = []               # (PIN-checked level 4–5 dismissals: TICKET_ACK_RATE)
        self.mgr_acks = []   # (the Manager's acknowledgements: their own budget)
        self.says = []                      # recent spoken messages (rate limit)
        self.health_sent = (None, 0.0)      # the last heartbeat passed on to the hub, and when
        # the hub's modes (name → id, hub order; the last good list kept), recent mode changes (rate limit)
        self.modes, self.mode_lock, self.mode_sets, self._mode_thread = {}, threading.Lock(), [], None
        # Hubitat Safety Monitor: status (None until known), last alert (or None), when either last changed;
        # recent HSM changes (rate limit)
        self.hsm, self.hsm_alert, self.hsm_at = None, None, None
        self.hsm_lock, self.hsm_sets, self._hsm_thread = threading.Lock(), [], None
        self.card_ids = set()    # devices on the owner's layout cards (house/card-devices.json; last good read kept)
        # (v3.0.0) the weather device (Integrations → Weather): its values, warnings, dismissals — service/weather_device.py
        try:
            self.wx = weather_device.Watch(getattr(args, "house_dir", "") or None, log=log.warning)
        except Exception as e:   # (a damaged weather memory never stops the bridge: no weather until it's fixed)
            log.warning("weather device: not started (%s)", type(e).__name__)
            self.wx = weather_device.Watch(None, log=log.warning)
        self._wx_failed = set()
        self.wx_devices = None            # the last device list (a changed setting is applied to it at once)
        self.wx_sent, self.wx_sig = None, None   # the last hubitat/weather payload, the last warnings published
        self.wx_lock, self._wx_timer = threading.Lock(), None

    # --- state ---
    def resync(self, announce_changes=True):
        with self.resync_lock:
            return self._resync(announce_changes)

    def _resync(self, announce_changes):
        with self.lock:
            start = self.seq
        devices = self.maker.get("devices/all", timeout=60)
        new = build_state(devices)
        if isinstance(devices, list):
            media = media_cmds(devices)
            with self.allow_lock:
                self.media = media
        changes = 0
        with self.lock:
            old = self.state
            for (did, k), seq in self.touched.items():  # newer than the snapshot: keep the event's value
                if seq > start and k in old.get(did, {}):
                    new.setdefault(did, {})[k] = old[did][k]
            self.touched = {key: seq for key, seq in self.touched.items() if seq > start}
            if announce_changes and old:
                for did, attrs in new.items():
                    for k, v in attrs.items():
                        if old.get(did, {}).get(k) != v:
                            changes += 1
                            self.pub_event(int(did), k, v)
            self.state = new
        self.pub_state()
        log.info("resync: %d devices with panel attributes (%d changes caught up)", len(new), changes)
        self.update_model(devices)
        self.wx_devices = devices if isinstance(devices, list) else self.wx_devices
        self._wx("on_devices", devices)
        self.resync_notifiers(devices)   # (publishes the alerts — the weather warnings with them)
        self.wx_flush(alerts=False)
        return devices

    # --- the Skypane Notifier (release 2) ---
    def resync_notifiers(self, devices):
        found = {int(d["id"]): (d.get("attributes") or {}).get("activeAlerts") for d in devices or []
                 if isinstance(d, dict) and d.get("type") in NOTIFIER_TYPES and str(d.get("id", "")).isdigit()}
        with self.note_lock:
            if set(found) != self.notifiers:
                log.info("notifier devices: %s", sorted(found) or "none")
            self.notifiers = set(found)
            self.active = {nid: active_ids(v) for nid, v in found.items()}
            missing = [nid for nid, ids in self.active.items() if any(i not in self.alert_text for i in ids)]
        self.pub_alerts()
        for nid in missing:   # (texts not known — e.g. after a restart: the driver sends them again)
            if time.time() - self.replayed.get(nid, 0) > 300:
                self.replayed[nid] = time.time()
                threading.Thread(target=self._maker_quiet, args=(f"devices/{nid}/refresh", "replay"), daemon=True).start()
        self.refresh_modes()
        self.refresh_hsm()

    def refresh_modes(self):
        """The hub's modes (at start and every resync): a failed / odd answer keeps the last list."""
        try:
            parsed = parse_modes(self.maker.get("modes", timeout=10))
        except Exception as e:
            log.debug("modes: %s", safe_err(e))
            return
        if parsed is None:
            log.warning("modes: the hub's answer was not a list — the last list kept")
            return
        modes, cur = parsed
        with self.mode_lock:
            changed = list(modes.items()) != list(self.modes.items())
            self.modes = modes
        if cur:
            self.set_mode(cur, force_pub=changed)
        elif changed:
            self.pub_modes()

    def _maker_quiet(self, path, what):
        try:
            self.maker.get(path, timeout=10)
        except Exception as e:
            log.warning("notifier %s failed: %s (is the notifier in the Maker API app?)", what, safe_err(e))

    def set_mode(self, name, force_pub=False):
        name = _short(name, 40)
        if name and name != self.mode:
            self.mode = name
            if self.mqtt:
                self.mqtt.publish(T_MODE, json.dumps({"mode": name}), qos=1, retain=True)
            self.pub_modes()
        elif force_pub:
            self.pub_modes()

    def pub_modes(self):
        if self.mqtt:
            with self.mode_lock:
                names = list(self.modes)
            self.mqtt.publish(T_MODES, json.dumps({"modes": names, "mode": self.mode}), qos=1, retain=True)

    def mode_result(self, ok, mode, reason=None):
        msg = {"ok": ok, "mode": mode}
        if reason:
            msg["reason"] = reason
        if self.mqtt:
            self.mqtt.publish(T_MODE_RESULT, json.dumps(msg), qos=1)

    def on_mode_set(self, payload, answer=None):
        """A panel asks for a hub mode: only a mode the hub has, only with a one-time PIN ticket for exactly this
        change (device 0, "setMode", the name), at most MODE_RATE a minute. The ticket is never logged.
        (v2.9.3) `answer(ok, mode, reason)`: where the answer goes — the panels' T_MODE_RESULT, or the Manager's."""
        answer = answer or self.mode_result
        m = parse_mode_set(payload)
        if m is None:
            log.warning("REJECTED mode change: bad message")
            answer(False, None, "malformed")
            return
        name, panel = m["mode"], m["panel"] or "?"
        with self.mode_lock:
            mid = self.modes.get(name)
        if mid is None:
            log.warning("REJECTED mode change from panel %s: not a known mode", panel)
            answer(False, None, "unknown-mode")
            return
        if not m["ticket"]:
            log.warning("REJECTED mode change to %s from panel %s: no PIN ticket", name, panel)
            answer(False, name, "no-ticket")
            return
        now = time.time()
        with self.mode_lock:   # (checked before the ticket: a refused change doesn't use it up)
            self.mode_sets = [t for t in self.mode_sets if now - t < 60]
            limited = len(self.mode_sets) >= MODE_RATE
        if limited:
            log.warning("REJECTED mode change to %s from panel %s: too many", name, panel)
            answer(False, name, "rate")
            return
        if not self.pin or not self.pin.is_set() or not self.ticket_ok(m["ticket"], 0, "setMode", name):
            log.warning("REJECTED mode change to %s from panel %s: no valid PIN ticket", name, panel)
            answer(False, name, "bad-ticket")
            return
        with self.mode_lock:
            self.mode_sets.append(now)
        if self.args.dry_run:
            log.info("DRY-RUN: would set the mode to %s (panel %s)", name, panel)
            answer(False, name, "dry-run")
            return
        log.info("mode change to %s from panel %s", name, panel)
        self._mode_thread = t = threading.Thread(target=self._send_mode, args=(name, mid, answer), daemon=True)
        t.start()   # (not on paho's network thread: the hub may be slow)

    def _send_mode(self, name, mid, answer=None):
        answer = answer or self.mode_result
        try:
            self.maker.get(f"modes/{int(mid)}", timeout=8)
        except Exception as e:
            log.warning("mode change to %s failed: %s", name, safe_err(e))
            answer(False, name, "hub-error")
            return
        self.set_mode(name)
        answer(True, name)

    # --- Hubitat Safety Monitor ---
    def refresh_hsm(self):
        """HSM's status (at start and every resync): a failed / odd answer keeps the last one."""
        try:
            ans = self.maker.get("hsm", timeout=10)
        except Exception as e:
            log.debug("hsm: %s", safe_err(e))
            return
        status = hsm_status(ans.get("hsm")) if isinstance(ans, dict) else None
        if status is None:
            log.warning("hsm: the hub's answer was not a known status — the last one kept")
            return
        self.update_hsm(status=status)

    def update_hsm(self, status=None, alert=None):
        """A new status and / or alert word (already checked): "cancel" clears the alert. Publishes (retained) only on
        a change, and only once the status is known."""
        with self.hsm_lock:
            old = (self.hsm, self.hsm_alert)
            if status is not None:
                self.hsm = status
            if alert is not None:
                self.hsm_alert = None if alert == "cancel" else alert
            now = (self.hsm, self.hsm_alert)
            changed = now != old
            if changed:
                self.hsm_at = int(time.time())
        if changed:
            log.info("hsm: %s%s", now[0], f" (alert {now[1]})" if now[1] else "")
            self.pub_hsm()

    def pub_hsm(self):
        with self.hsm_lock:
            if self.hsm is None:
                return
            msg = {"status": self.hsm, "alert": self.hsm_alert, "at": self.hsm_at}
        if self.mqtt:
            self.mqtt.publish(T_HSM, json.dumps(msg), qos=1, retain=True)

    def hsm_result(self, ok, action, reason=None):
        msg = {"ok": ok, "action": action}
        if reason:
            msg["reason"] = reason
        if self.mqtt:
            self.mqtt.publish(T_HSM_RESULT, json.dumps(msg), qos=1)

    def on_hsm_set(self, payload, answer=None):
        """A panel asks HSM to arm / disarm / cancel alerts: only HSM_ACTIONS, only with a one-time PIN ticket for
        exactly this action (device 0, "setHsm", the action), at most HSM_RATE a minute. The ticket is never logged.
        (v2.9.3) `answer(ok, action, reason)`: the panels' T_HSM_RESULT, or the Manager's."""
        answer = answer or self.hsm_result
        m = parse_hsm_set(payload)
        if m is None:
            log.warning("REJECTED hsm change: bad message")
            answer(False, None, "malformed")
            return
        action, panel = m["action"], m["panel"] or "?"
        if action not in HSM_ACTIONS:
            log.warning("REJECTED hsm change from panel %s: not a known action", panel)
            answer(False, None, "unknown-action")
            return
        if not m["ticket"]:
            log.warning("REJECTED hsm %s from panel %s: no PIN ticket", action, panel)
            answer(False, action, "no-ticket")
            return
        now = time.time()
        with self.hsm_lock:   # (checked before the ticket: a refused change doesn't use it up)
            self.hsm_sets = [t for t in self.hsm_sets if now - t < 60]
            limited = len(self.hsm_sets) >= HSM_RATE
        if limited:
            log.warning("REJECTED hsm %s from panel %s: too many", action, panel)
            answer(False, action, "rate")
            return
        if not self.pin or not self.pin.is_set() or not self.ticket_ok(m["ticket"], 0, "setHsm", action):
            log.warning("REJECTED hsm %s from panel %s: no valid PIN ticket", action, panel)
            answer(False, action, "bad-ticket")
            return
        with self.hsm_lock:
            self.hsm_sets.append(now)
        if self.args.dry_run:
            log.info("DRY-RUN: would send hsm %s (panel %s)", action, panel)
            answer(False, action, "dry-run")
            return
        log.info("hsm %s from panel %s", action, panel)
        self._hsm_thread = t = threading.Thread(target=self._send_hsm, args=(action, answer), daemon=True)
        t.start()   # (not on paho's network thread: the hub may be slow)

    def _send_hsm(self, action, answer=None):
        answer = answer or self.hsm_result
        if action not in HSM_ACTIONS:   # (never anything else in the URL)
            return
        try:
            self.maker.get(f"hsm/{action}", timeout=8)
        except Exception as e:
            log.warning("hsm %s failed: %s", action, safe_err(e))
            answer(False, action, "hub-error")
            return
        if action == "disarm":   # (arming has an exit delay: the hub's hsmStatus event tells the real state)
            self.update_hsm(status="disarmed")
        answer(True, action)

    def pub_alerts(self):
        now = int(time.time())
        with self.note_lock:
            out = []
            for nid, ids in self.active.items():
                for i, (lvl, exp) in ids.items():
                    if exp and exp <= now:
                        continue
                    a = self.alert_text.get(i)
                    out.append({k: v for k, v in a.items() if k != "nid"} if a else
                               {"id": i, "lvl": lvl, "to": ["all"], "tag": "", "title": "", "text": "An alert from Hubitat", "exp": exp, "count": 1, "at": now})
            keep = {i for ids in self.active.values() for i in ids}
            self.alert_text = {i: a for i, a in self.alert_text.items() if i in keep or now - a["at"] < 120}
        wx = self._wx("alerts", now)   # (v3.0.0: the weather device's warnings, the dismissed ones left out)
        with self.wx_lock:
            self.wx_sig = self._wx_sig(wx)
        out.extend(wx)
        out.sort(key=lambda a: (-a["lvl"], -a["at"]))
        if self.mqtt:
            self.mqtt.publish(T_ALERTS, json.dumps({"v": 1, "alerts": out[:40]}, separators=(",", ":")), qos=1, retain=True)

    def on_notifier(self, nid, name, value):
        if name == "activeAlerts":
            with self.note_lock:
                self.active[nid] = active_ids(value)
            self.pub_alerts()
            return
        try:
            m = json.loads(value) if isinstance(value, str) else None
        except ValueError:
            m = None
        if not isinstance(m, dict) or m.get("v") != 1:
            log.warning("notifier %s: a command in a format this bridge doesn't know — update the driver or the bridge", nid)
            return
        op = m.get("op")
        if op == "notify":
            a = clean_alert(m)
            if not a:
                log.warning("notifier %s: REJECTED an alert (bad fields)", nid)
                return
            with self.note_lock:
                self.alert_text[a["id"]] = {**a, "nid": nid}
                shown = a["id"] in self.active.get(nid, {})
            if shown:
                self.pub_alerts()
        elif op == "dismiss" and isinstance(m.get("id"), str):
            with self.note_lock:
                self.active.get(nid, {}).pop(m["id"], None)
            self.pub_alerts()
        elif op == "say":
            msg = clean_say(m)
            now = time.time()
            self.says = [t for t in self.says if now - t < 60]
            if not msg or len(self.says) >= SAY_RATE:
                log.warning("notifier %s: speech %s", nid, "too often — dropped" if msg else "REJECTED (bad fields)")
                return
            self.says.append(now)
            if self.mqtt:
                self.mqtt.publish(T_SAY, json.dumps(msg), qos=0)
        elif op == "volume":
            msg = clean_volume(m)
            if msg and self.mqtt:
                self.mqtt.publish(T_VOLUME, json.dumps(msg), qos=1)
        elif op in ("camera", "view"):
            to = [t for t in (m.get("to") if isinstance(m.get("to"), list) else []) if isinstance(t, str) and PANEL_NAME.fullmatch(t)][:20] or ["all"]
            msg = {"to": to}
            # (no time from the rule: left out, so each panel uses its own "Auto-show a camera for")
            if isinstance(m.get("secs"), int) and not isinstance(m.get("secs"), bool) and 5 <= m["secs"] <= 3600:
                msg["seconds"] = m["secs"]
            if op == "camera":
                cams = [_short(c, 60) for c in m.get("cams") or [] if isinstance(c, str)][:4]
                if not cams or not all(cams):
                    return
                msg["camera"], msg["cameras"] = cams[0], cams
            else:
                msg["view"] = _short(m.get("view"), 60)
                if not msg["view"]:
                    return
            if self.mqtt:
                self.mqtt.publish(T_SHOW, json.dumps(msg), qos=0)

    def acks_guarded(self):
        """Whether a panel's level 4–5 dismissal is checked for a PIN ticket: a panel PIN is set in the house (none set:
        the panels don't ask one, so there is nothing to prove; no house dir: nothing to check against — said at start).
        With ACK_TICKETS off it is still checked, but a missing / bad ticket is only logged."""
        return bool(self.pin and self.pin.is_set())

    def ack_result(self, panel, why, aid=None):
        """A dismissal dropped: the panel hears it (T_ACK_RESULT) so it never hides an alert that is still up."""
        if self.mqtt:
            msg = {"id": aid} if aid else {"all": True}
            self.mqtt.publish(T_ACK_RESULT, json.dumps({**msg, "panel": panel, "ok": False, "reason": why}), qos=1)

    def _ack_budget(self, panel, ticketed, now):
        """True (and counted) when this dismissal is within its budget: PIN-checked level 4–5 ones their own
        (TICKET_ACK_RATE); plain ones per panel name (ACK_RATE) and all together (ACK_ALL_RATE)."""
        if ticketed:
            self.ticket_acks = [t for t in self.ticket_acks if now - t < 60]
            if len(self.ticket_acks) >= TICKET_ACK_RATE:
                return False
            self.ticket_acks.append(now)
            return True
        self.acks = {p: k for p, k in ((p, [t for t in k if now - t < 60]) for p, k in self.acks.items()) if k}
        if len(self.acks.get(panel, ())) >= ACK_RATE or sum(map(len, self.acks.values())) >= ACK_ALL_RATE:
            return False
        self.acks.setdefault(panel, []).append(now)
        return True

    def _ack_ticket(self, m):
        """None when the dismissal's ticket is good for that alert (and now used up), else why not."""
        if not m.get("ticket"):
            return "no-ticket"
        return None if self.ticket_ok(m["ticket"], 0, "alertAck", m["id"]) else "bad-ticket"

    def _panel_ack(self, nid, aid, panel, lvl):
        arg = urllib.parse.quote(f"{aid},{panel},{lvl}", safe=",")   # (only [0-9a-z_,-] get here; Maker API splits at the commas)
        threading.Thread(target=self._maker_quiet, args=(f"devices/{int(nid)}/panelAck/{arg}", "dismiss"), daemon=True).start()

    def on_ack(self, payload):
        """A panel dismissed an alert (any level) — Hubitat hears every dismissal, e.g. so a rule can silence a siren.
        {"id": alert id, "panel": panel, "level": 1..5, "ticket"?} → the owning notifier's panelAck("<id>,<panel>,<level>");
        a level 3–5 alert is also gone on every panel at once. Levels 1–2 stay dismissed on that panel only (the panel
        keeps that itself). A panel name starting with "manager" is refused (that's the Manager's, on_manager_ack).
        Everything is checked strictly: the parts end up in a Maker API URL path.
        Levels 4–5 (v2.3.2, acks_guarded): only with a one-time PIN ticket for that alert id — the hub's level counts,
        never the message's; an alert the bridge doesn't know is up: a level 4–5 (or no level) needs the ticket, a level
        1–3 goes on as before (driver 1.8 won't let a lower level clear its level 4–5).
        {"all": true, "panel": panel} ("Dismiss all"): never the driver's panelAckAll (it would also clear a level 4–5 the
        bridge hasn't heard of yet) — one panelAck per level 1–3 alert the bridge knows is up for that panel, then every
        notifier's panelDismissedAll("<panel>,<highest level cleared>,<count>") (driver 1.8: clears nothing, only
        acknowledged = "all" + button 6 for rules); a level 4–5 stays up (the page sends each with its own ticket first)
        and the panel is told (no-ticket). Every dismissal
        dropped is answered on T_ACK_RESULT."""
        m = parse_ack(payload)
        if m is None:
            log.warning("REJECTED alert dismiss: bad message")
            return
        now = time.time()
        panel = m["panel"]
        guarded = self.acks_guarded()
        if m.get("silenced"):   # only the sound stopped on that panel: the alert stays up everywhere
            with self.note_lock:
                nid = next((n for n, ids in self.active.items() if m["id"] in ids), None)
            if nid is None or not self._ack_budget(panel, False, now):
                return
            log.info("alert %s silenced on panel %s", m["id"], panel)
            arg = urllib.parse.quote(f"{m['id']},{panel},{m['level']}", safe=",")
            threading.Thread(target=self._maker_quiet, args=(f"devices/{int(nid)}/panelSilence/{arg}", "silence"), daemon=True).start()
            return
        if m.get("all"):
            if not self._ack_budget(panel, False, now):
                log.warning("REJECTED Dismiss all on panel %s: too many", panel)
                self.ack_result(panel, "too-many")
                return
            hold = guarded and self.ack_tickets
            with self.note_lock:
                nids = sorted(self.notifiers)
                mine = sorted((lvl, i, n) for n, ids in self.active.items() for i, (lvl, exp) in ids.items()
                              if (not exp or exp > now) and self._alert_for(i, panel))
                gone = [(lvl, i, n) for lvl, i, n in mine if lvl < ACK_GUARDED or not hold]
                left = [i for lvl, i, n in mine if lvl >= ACK_GUARDED and hold]
                for lvl, i, n in gone:
                    if lvl >= EVERYWHERE:
                        self.active[n].pop(i, None)
            # (v3.0.0: the weather warnings shown on this panel — the same rules; they're the bridge's own, no hub call)
            wx_mine = [(a["lvl"], a["id"]) for a in self._wx("alerts", now) if "all" in a["to"] or panel in a["to"]]
            wx_gone = [i for lvl, i in wx_mine if (lvl < ACK_GUARDED or not hold) and lvl >= EVERYWHERE]
            left += [i for lvl, i in wx_mine if lvl >= ACK_GUARDED and hold]
            wx_out = [self._wx("dismiss", i, now) for i in wx_gone]
            if any(lvl >= EVERYWHERE for lvl, _, _ in gone) or any(wx_out):
                self.pub_alerts()
            for i in left:
                self.ack_result(panel, "no-ticket", i)
            if left:
                log.warning("REJECTED Dismiss all on panel %s for level 4–5 alert(s) %s: they need the PIN (a ticket each)", panel, ", ".join(left))
            big = [i for lvl, i, _ in gone if lvl >= ACK_GUARDED]
            if big and guarded:   # (ACK_TICKETS off)
                log.warning("Dismiss all on panel %s cleared level 4–5 alert(s) %s without PIN tickets — let through: ACK_TICKETS is off",
                            panel, ", ".join(big))
            log.info("Dismiss all on panel %s: %d alert(s) dismissed%s", panel, len(gone), f", {len(left)} left up" if left else "")
            # one after the other on one thread: each alert's panelAck first (buttons 1–5), then every notifier's
            # panelDismissedAll (driver 1.8: clears nothing — acknowledged = "all", ackPanel, button 6, as Dismiss all
            # always told rules)
            top = max((lvl for lvl, _, _ in gone), default=0)
            calls = [(f"devices/{int(n)}/panelAck/{urllib.parse.quote(f'{i},{panel},{lvl}', safe=',')}", "dismiss") for lvl, i, n in gone]
            calls += [(f"devices/{int(n)}/panelDismissedAll/{urllib.parse.quote(f'{panel},{top},{len(gone)}', safe=',')}", "dismiss all")
                      for n in nids]

            def run():
                for path, what in calls:
                    self._maker_quiet(path, what)
            if calls:
                threading.Thread(target=run, daemon=True).start()
            return
        aid = m["id"]
        w = self._wx("find", aid, now)   # (v3.0.0: a weather warning — the bridge's own)
        if w is not None:
            return self._weather_ack(m, w, panel, guarded, now)
        with self.note_lock:
            nid = next((n for n, ids in self.active.items() if aid in ids), None)
            known = self.active[nid][aid][0] if nid is not None else None
        claimed = known if known is not None else m.get("level")
        ticketed = False
        if guarded and (claimed is None or claimed >= ACK_GUARDED):   # (the ticket is checked outside note_lock)
            why = self._ack_ticket(m)
            if why and self.ack_tickets:
                log.warning("REJECTED alert dismiss: %s (level %s) on panel %s — %s", aid, known if known is not None else "?", panel,
                            "no PIN ticket" if why == "no-ticket" else "no valid PIN ticket")
                self.ack_result(panel, why, aid)
                return
            if why:
                log.warning("alert %s (level %s) dismissed on panel %s WITHOUT a valid PIN ticket (%s) — let through: ACK_TICKETS is off",
                            aid, claimed, panel, why)
            ticketed = not why
        if not self._ack_budget(panel, ticketed, now):
            log.warning("REJECTED alert dismiss: %s on panel %s — too many", aid, panel)
            self.ack_result(panel, "too-many", aid)
            return
        with self.note_lock:
            nid = next((n for n, ids in self.active.items() if aid in ids), None)
            if nid is not None:
                known = self.active[nid][aid][0]
                if m.get("level") not in (None, known):
                    log.info("alert %s: the panel said level %s, the hub has %s — the hub's level used", aid, m["level"], known)
                lvl = known
                if lvl >= EVERYWHERE:   # (gone on every panel)
                    self.active[nid].pop(aid, None)
                nids = [nid]
            else:   # (not known here — e.g. just expired, or the bridge restarted: the driver decides)
                lvl, nids = m.get("level"), sorted(self.notifiers)
        if lvl is None or not nids:
            log.info("alert %s dismissed on panel %s: not up here — not sent", aid, panel)
            self.ack_result(panel, "not-up", aid)
            return
        if lvl >= EVERYWHERE and nid is not None:
            self.pub_alerts()
        log.info("alert %s (level %d) dismissed on panel %s", aid, lvl, panel)
        for n in nids:
            self._panel_ack(n, aid, panel, lvl)

    def on_manager_ack(self, payload):
        """The admin acknowledged an alert in the Manager (T_ACK_MGR, only the server can write it): gone on every panel
        at any level, and the owning notifier's panelAck("<id>,manager-<login>,<level>") — Hubitat hears who (driver
        1.7 clears any level too). Its own budget (MANAGER_ACK_RATE): it never uses up the panels' dismissals."""
        m = parse_manager_ack(payload)
        if m is None:
            log.warning("REJECTED Manager acknowledgement: bad message")
            return False
        now = time.time()
        self.mgr_acks = [t for t in self.mgr_acks if now - t < 60]
        if len(self.mgr_acks) >= MANAGER_ACK_RATE:
            log.warning("REJECTED Manager acknowledgement: too many")
            return False
        aid = m["id"]
        w = self._wx("find", aid, now)
        if w is not None:   # (v3.0.0: a weather warning — gone on every panel, at any level; no notifier has it)
            self.mgr_acks.append(now)
            log.info("weather warning %s (level %d) acknowledged in the Manager by %s", aid, w["lvl"], m["by"])
            if self._wx("dismiss", aid, now):
                self.pub_alerts()
            return True
        with self.note_lock:
            nid = next((n for n, ids in self.active.items() if aid in ids), None)
            if nid is not None:
                lvl = self.active[nid].pop(aid)[0]   # (the hub's level)
                nids = [nid]
            else:   # (not known here: the driver decides)
                lvl, nids = m["level"], sorted(self.notifiers)
        if not nids:
            return False
        self.mgr_acks.append(now)
        if nid is not None:
            self.pub_alerts()
        log.info("alert %s (level %d) acknowledged in the Manager by %s", aid, lvl, m["by"])
        arg = urllib.parse.quote(f"{aid},{m['by']},{lvl}", safe=",")
        for n in nids:
            threading.Thread(target=self._maker_quiet, args=(f"devices/{int(n)}/panelAck/{arg}", "dismiss"), daemon=True).start()
        return True

    def on_health(self, payload):
        """The server's heartbeat (service/health.py): passed on to every notifier as serverHeartbeat("<n>,<lvl>,<text>")
        — the same one at most every HEALTH_EVERY s, a changed one at most every 5 s. No notifier: nothing to do."""
        h = parse_health(payload)
        if h is None:
            log.warning("REJECTED health heartbeat: bad message")
            return False
        now = time.time()
        last, at = self.health_sent
        if now - at < (5 if h != last else HEALTH_EVERY):
            return False
        with self.note_lock:
            nids = sorted(self.notifiers)
        if not nids:
            return False
        self.health_sent = (h, now)
        arg = urllib.parse.quote(f"{h['n']},{h['lvl']},{h['text']}", safe=",")   # (parse_health let no comma into the text)
        for nid in nids:
            threading.Thread(target=self._maker_quiet, args=(f"devices/{int(nid)}/serverHeartbeat/{arg}", "heartbeat"), daemon=True).start()
        return True

    def _alert_for(self, aid, panel):
        """Is this alert shown on that panel (its "to")? Unknown text = to all (as published)."""
        a = self.alert_text.get(aid)
        to = a.get("to") if a else ["all"]
        return "all" in to or panel in to

    # --- house model (stage 3) ---
    # Rebuilt from every resync. The page file (house dir / hubitat-data.js) is rewritten only when the model's shape
    # changes (a device added, renamed, moved; not a light switching), and the new version is announced on T_MODEL.
    def update_model(self, devices):
        if not self.args.house_dir:
            return
        with self.model_lock:
            self.devices = devices
            try:
                self.risky = {int(d["id"]) for d in devices if isinstance(d, dict) and str(d.get("id", "")).isdecimal()
                              and house_model.RISKY_CAPS & house_model.caps(d)}
            except Exception:  # keep the last set
                pass
            if self.never_sig is None:      # first build: read the owner's settings (overrides, never list) first
                self.check_owner(rebuild=False)
            try:
                model = house_model.build(devices, self.overrides)
            except Exception as e:  # a strange device must never stop the bridge: keep the last model
                log.warning("house model not rebuilt: %s", safe_err(e))
                return
            with self.allow_lock:
                self.model = model
                # what each device may receive at all: a lock only locks; a valve / garage controller opens / closes
                kc, relays, doors = {}, set(), set()
                unlockable = set(model.get("unlockable", ()))
                for lk in model.get("locks", []):
                    kc[lk["id"]] = {"lock", "refresh"} | ({"unlock"} if lk["id"] in unlockable else set())
                for r in model.get("rooms", []):
                    for d in r.get("devices", []):
                        if d.get("kind") in ("valve", "garage"):
                            kc[d["id"]] = {"open", "close", "refresh"} if d.get("cmd") == "openclose" else {"on", "off", "refresh"}
                            if d["kind"] == "garage":
                                (doors if d.get("cmd") == "openclose" else relays).add(d["id"])
                for d in devices if isinstance(devices, list) else []:
                    try:
                        c = house_model.caps(d)
                        if c & {"GarageDoorControl", "DoorControl"}:
                            doors.add(int(d["id"]))
                            kc.setdefault(int(d["id"]), {"open", "close", "refresh"})
                        elif "Valve" in c:
                            kc.setdefault(int(d["id"]), {"open", "close", "refresh"})
                        if "Lock" in c:   # any lock (also one let through by BRIDGE_ALLOW): lock / refresh (+ unlock if allowed)
                            kc[int(d["id"])] = {"lock", "refresh"} | ({"unlock"} if int(d["id"]) in unlockable else set())
                    except (TypeError, ValueError, KeyError):
                        continue
                # an air purifier: only its own commands (it has no "on"; "auto" / speeds are its modes)
                for t in model.get("things", []):
                    if t.get("kind") == "purifier":
                        kc[t["id"]] = {"fanOn", "off", "auto", "setFanSpeed"}
                    elif t.get("kind") == "guest":   # a guest mode: on / off (always with the PIN, needs_pin)
                        kc[t["id"]] = {"on", "off"}
                self.kind_cmds, self.garage_relays, self.garage_doors = kc, relays, doors
            self.compute_allow()
            out = pathlib.Path(self.args.house_dir) / "hubitat-data.js"
            if model["version"] == self.model_version and out.exists():
                return
            try:
                out.parent.mkdir(parents=True, exist_ok=True)
                tmp = out.with_name(f".{out.name}.{os.getpid()}.tmp")
                tmp.write_text(house_model.to_js(model), encoding="utf-8")
                os.replace(tmp, out)
            except OSError as e:
                log.warning("house model not written to %s: %s", out, safe_err(e))
                return
            self.model_version = model["version"]
            log.info("house model %s: %d rooms, %d room devices, %d locks, %d windows, %d doors, %d other devices, %d need the PIN -> %s",
                     model["version"], len(model["rooms"]), sum(len(r["devices"]) for r in model["rooms"]), len(model["locks"]),
                     len(model["windows"]), len(model["doors"]), len(model["things"]), len(model["confirm"]), out)
            self.pub_model()

    def pub_model(self):
        if self.mqtt and self.model_version:
            self.mqtt.publish(T_MODEL, json.dumps({"version": self.model_version}), qos=1, retain=True)

    def read_owner(self):
        """The owner's choices in the main panel's settings: neverSwitch ({id: true} — ids no panel may switch; None =
        never set, then house_model's KEEP_ON names are left out) and deviceOverrides ({id: {as, room, confirm}}).
        If the file can't be read right now (being replaced, damaged), the last good values stay — a failed read never
        widens what may be switched."""
        self.read_cards()
        settings = None
        try:
            doc = json.loads(pathlib.Path(self.args.panel_file).read_text(encoding="utf-8")) if self.args.panel_file else None
            if doc is not None:
                settings = (doc.get("data") or {}).get("settings") or {}
                if not isinstance(settings, dict):
                    raise ValueError("settings")
        except (OSError, ValueError, AttributeError, TypeError):
            settings = False   # can't be read right now: keep the last values
        if settings:
            never = settings.get("neverSwitch")
            if never is None:
                self.never = None
            elif isinstance(never, dict):
                try:
                    self.never = [int(k) for k, v in never.items() if v and str(k).isdecimal()]
                except (ValueError, TypeError):
                    pass
            # the Manager's exceptions to the name rule (used while there's no explicit neverSwitch list)
            rule = settings.get("switchRule")
            ids = lambda d: {int(k) for k, v in (d if isinstance(d, dict) else {}).items() if v and str(k).isdecimal()}  # noqa: E731
            self.switch_rule = (ids(rule.get("allow")), ids(rule.get("never"))) if isinstance(rule, dict) else (set(), set())
        # the device choices (stage 4: house/device-settings.json from the Manager page; before that the main panel's
        # settings.deviceOverrides — used only until the new file exists)
        dev_file = self.device_file()
        if not (dev_file and dev_file.exists()) and settings is False:
            return
        ov = settings.get("deviceOverrides") if settings else None
        if isinstance(ov, dict):   # (the old place, writable with the panel PIN alone: never the Manager-only choices)
            ov = {k: {f: v for f, v in o.items() if f not in ("unlock",)} if isinstance(o, dict) else o for k, o in ov.items()}

        groups, rooms = None, {}
        if dev_file and dev_file.exists():

            try:
                doc = json.loads(dev_file.read_text(encoding="utf-8"))
                ov = doc.get("overrides") if isinstance(doc, dict) else None
                if not isinstance(ov, dict):
                    raise ValueError("overrides")
                groups = doc.get("groups") if isinstance(doc.get("groups"), list) else None
                rooms = {k: doc[k] for k in ("rooms", "roomIcons") if isinstance(doc.get(k), (list, dict))}
            except (OSError, ValueError):
                return   # being replaced / damaged: keep the last good choices
        if ov is None:
            self.overrides = {}
        elif isinstance(ov, dict):
            self.overrides = {str(k): v for k, v in ov.items() if str(k).isdecimal() and isinstance(v, dict)}
            if groups:   # the device groups' rules (PIN, unlock, which panels) — house_model.groups_of
                self.overrides["_groups"] = groups
            if rooms.get("rooms"):   # rooms of the owner's own and room pictures — house_model.rooms_of_owner
                self.overrides["_rooms"] = rooms["rooms"]
            if rooms.get("roomIcons"):
                self.overrides["_roomIcons"] = rooms["roomIcons"]

    def device_file(self):
        return pathlib.Path(self.args.house_dir) / "device-settings.json" if self.args.house_dir else None

    def card_file(self):
        return pathlib.Path(self.args.house_dir) / CARD_FILE if self.args.house_dir else None

    def read_cards(self):
        """house/card-devices.json {"v": 1, "ids": [positive ints, ≤ MAX_CARD_IDS]}: the devices on the owner's layout
        cards may be switched too. A missing / damaged / odd file keeps the last good set (empty at start)."""
        p = self.card_file()
        try:
            if not p or p.stat().st_size > 64 * 1024:
                return
            doc = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        ids = doc.get("ids") if isinstance(doc, dict) and doc.get("v") == 1 else None
        if not isinstance(ids, list) or len(ids) > MAX_CARD_IDS or \
                not all(isinstance(i, int) and not isinstance(i, bool) and 0 < i < 10 ** 9 for i in ids):
            log.warning("%s: not in the expected format — the last card devices kept", CARD_FILE)
            return
        if set(ids) != self.card_ids:
            log.info("card devices: %d", len(set(ids)))
        self.card_ids = set(ids)

    def check_owner(self, rebuild=True):
        """Called for every command and every few seconds: when the main panel's settings file was saved, re-read the
        owner's choices; overrides changed → rebuild the model from the last device list, else just the allowlist."""
        sig = []
        for p in (pathlib.Path(self.args.panel_file) if self.args.panel_file else None, self.device_file(), self.card_file()):
            try:
                st = p.stat() if p else None
                sig.append((st.st_ino, st.st_mtime_ns, st.st_size) if st else ("none",))   # every save = a new file
            except OSError:
                sig.append(("none",))
        sig = tuple(sig)
        with self.allow_lock:
            if sig == self.never_sig:
                return
            self.never_sig = sig
            before = self.overrides
            if self.args.panel_file or self.args.house_dir:
                self.read_owner()
            changed = self.overrides != before
        if changed and rebuild and self.devices is not None:
            self.update_model(self.devices)
        else:
            self.compute_allow()

    def compute_allow(self):
        """Allowlist = every device the panels show (switchable) + extra ids + the devices on the owner's layout cards,
        minus the never list (it always wins; with no list, the KEEP_ON name rule keeps card devices out too)."""
        with self.allow_lock:
            if self.model is None:
                return
            never = self.never
            allowed, extra_never = getattr(self, "switch_rule", (set(), set()))
            if never is None and (allowed or extra_never):
                # the name rule (sprinklers, freezer… — also devices added later) minus / plus the owner's exceptions
                default = house_model.switchable(self.model, []) - house_model.switchable(self.model, None)
                never = sorted((default - allowed) | extra_never)
            name_never = set()
            if never is None:   # (the name rule — sprinklers, freezer…: a card doesn't widen it)
                name_never = house_model.switchable(self.model, []) - house_model.switchable(self.model, None)
            cards = set(getattr(self, "card_ids", ())) - name_never
            allow = (house_model.switchable(self.model, never) | self.extra_allow | cards) - set(never or [])
            if allow != self.allow:
                log.info("allowlist: %d devices may be switched from the panels", len(allow))
            self.allow = allow

    def watch_owner(self):
        n = 0
        while not self.stop.wait(3):
            n += 1
            try:
                self.check_owner()
            except Exception as e:  # never let the watcher die
                log.warning("settings check failed: %s", safe_err(e))
            try:   # (v3.0.0: the weather setting saved in the Manager; once a minute: stale data, ended warnings)
                if self._wx("reload"):
                    self.wx_setting_changed()
                elif n % 20 == 0:
                    self.wx_flush()
            except Exception as e:
                log.warning("weather check failed: %s", safe_err(e))

    # --- the weather device (v3.0.0, service/weather_device.py) ---
    WX_DEFAULT = {"alerts": [], "dismiss": False, "on_event": False, "reload": False, "on_devices": False}

    def _wx(self, name, *args):
        """Every call into the weather device goes through here: whatever goes wrong in it (a damaged state file, an odd
        driver value) is logged once and answered with nothing — the Notifier's alerts, their dismissals and everything
        else in the bridge go on as if there were no weather device."""
        try:
            return getattr(self.wx, name)(*args)
        except Exception as e:
            if (name, type(e).__name__) not in self._wx_failed:
                self._wx_failed.add((name, type(e).__name__))
                log.warning("weather device: %s failed (%s) — left out", name, type(e).__name__)
            return self.WX_DEFAULT.get(name)

    @staticmethod
    def _wx_sig(alerts):
        return tuple((a["id"], a["lvl"], a["title"]) for a in alerts)

    def wx_setting_changed(self):
        cfg = self.wx.cfg
        log.info("weather device: %s", f"device {cfg['device']} (weather card {'on' if cfg['card'] else 'off'}, "
                 f"warnings {'on' if cfg['warnings'] else 'off'})" if cfg.get("on") and cfg.get("device") else "off")
        if self.wx_devices is not None:
            self._wx("on_devices", self.wx_devices)
        self.pub_alerts()
        self.wx_flush(alerts=False)

    def wx_soon(self):
        """An event from the weather device: publish once its burst is over."""
        with self.wx_lock:
            if self._wx_timer:
                return
            self._wx_timer = t = threading.Timer(WX_DEBOUNCE, self._wx_fire)
        t.daemon = True
        t.start()

    def _wx_fire(self):
        with self.wx_lock:
            self._wx_timer = None
        self._wx("save")
        try:
            self.wx_flush()
        except Exception as e:   # (a timer thread: never dies silently)
            log.warning("weather publish failed: %s", type(e).__name__)

    def wx_flush(self, alerts=True):
        """hubitat/weather when it changed; hubitat/alerts when the weather warnings did (new, gone, another level) —
        never just because the driver polled again."""
        if alerts:
            cur = self._wx_sig(self._wx("alerts"))
            with self.wx_lock:
                before = self.wx_sig
            if cur != before:
                for i, lvl, title in cur:
                    if not any(i == b[0] for b in before or ()):
                        log.info("weather warning up: level %d %s", lvl, title)
                for b in before or ():
                    if not any(b[0] == i for i, _, _ in cur):
                        log.info("weather warning cleared: %s", b[2])
                self.pub_alerts()
        self.pub_weather()

    def pub_weather(self, force=False):
        w = self._wx("weather")
        if not isinstance(w, dict):
            return
        payload = json.dumps(w, separators=(",", ":"), allow_nan=False)
        with self.wx_lock:
            if payload == self.wx_sent and not force:
                return
            self.wx_sent = payload
        if self.mqtt:
            self.mqtt.publish(T_WEATHER, payload, qos=1, retain=True)

    def _weather_ack(self, m, w, panel, guarded, now):
        """A panel dismissed a weather warning: the bridge's own (no notifier has it, nothing goes to the hub). Its level
        is the bridge's, never the message's; levels 4–5 need the PIN ticket as any alert's; a level 3–5 is gone on every
        panel until the device stops reporting it (a changed warning is a new id), a level 1–2 only on that panel."""
        aid, lvl = w["id"], w["lvl"]
        ticketed = False
        if guarded and lvl >= ACK_GUARDED:
            why = self._ack_ticket(m)
            if why and self.ack_tickets:
                log.warning("REJECTED weather warning dismiss: %s (level %d) on panel %s — %s", aid, lvl, panel,
                            "no PIN ticket" if why == "no-ticket" else "no valid PIN ticket")
                self.ack_result(panel, why, aid)
                return
            if why:
                log.warning("weather warning %s (level %d) dismissed on panel %s WITHOUT a valid PIN ticket (%s) — let through: ACK_TICKETS is off",
                            aid, lvl, panel, why)
            ticketed = not why
        if not self._ack_budget(panel, ticketed, now):
            log.warning("REJECTED weather warning dismiss: %s on panel %s — too many", aid, panel)
            self.ack_result(panel, "too-many", aid)
            return
        log.info("weather warning %s (level %d) dismissed on panel %s", aid, lvl, panel)
        if lvl >= EVERYWHERE and self._wx("dismiss", aid, now):
            self.pub_alerts()

    def needs_pin(self, cid, command):
        """A valve / garage controller (by what it is — also when allowed by BRIDGE_ALLOW or an old allow file) or a
        device in the model's confirm list: every command except off / close / lock / refresh needs a ticket.
        Garage openers are stricter (many relays toggle the door on ANY command): a relay needs one for everything but
        refresh; a door controller may "close" without one only while the door is open / opening."""
        door = None
        if cid in self.garage_doors and command == "close":
            with self.lock:
                door = (self.state.get(str(cid)) or {}).get("door")
        # (the rule itself: service/device_rules.needs_pin — the same one the Manager's switching asks first)
        return device_rules.needs_pin(cid, command, garage_relays=self.garage_relays, garage_doors=self.garage_doors,
                                      risky=self.risky, model=self.model, door=door)

    def ticket_ok(self, ticket, cid, command, value=None):
        """A one-time ticket from the dashboard service (it checked the PIN over HTTP; the PIN never comes over MQTT):
        genuine, not expired, for this device + command, and not used before."""
        now = time.time()
        with self.allow_lock:
            for t, exp in list(self.used_tickets.items()):
                if exp < now:
                    del self.used_tickets[t]
            if not isinstance(ticket, str) or len(ticket) > 200 or ticket in self.used_tickets:
                return False
            issued = self.pin.issued_at(ticket)
            if issued is None or issued < self.started - 1:  # from before a restart: it could be a replay
                return False
            if not self.pin.check_ticket(ticket, cid, command, value):  # (the value is signed too)
                return False
            self.used_tickets[ticket] = now + panel_pin.TICKET_SECONDS + 10
            return True

    def pub_state(self):
        if self.mqtt:
            with self.lock:
                payload = json.dumps(self.state, separators=(",", ":"), allow_nan=False)
            self.mqtt.publish(T_STATE, payload, qos=1, retain=True)

    def pub_event(self, did, name, value):
        if self.mqtt:
            self.mqtt.publish(T_EVENT, json.dumps({"id": did, "name": name, "value": value, "t": round(time.time(), 1)}), qos=0)

    def on_ws_message(self, text):
        try:
            m = json.loads(text)
        except ValueError:
            return
        if isinstance(m, dict) and m.get("source") == "LOCATION" and m.get("name") == "mode" and isinstance(m.get("value"), str):
            self.set_mode(m["value"])
            return
        if isinstance(m, dict) and m.get("source") == "LOCATION" and m.get("name") in ("hsmStatus", "hsmAlert"):
            v = m.get("value")
            if m["name"] == "hsmStatus":
                status = hsm_status(v)
                if status:
                    self.update_hsm(status=status)
            elif isinstance(v, str) and v in HSM_ALERTS:
                self.update_hsm(alert=v)
            return
        if isinstance(m, dict) and m.get("source") == "DEVICE" and m.get("name") in ("activeAlerts", "panelCommand"):
            try:
                nid = int(m.get("deviceId"))
            except (TypeError, ValueError):
                return
            if nid in self.notifiers:
                self.on_notifier(nid, m["name"], m.get("value"))
            return
        if isinstance(m, dict) and m.get("source") == "DEVICE" and isinstance(m.get("name"), str):
            try:   # (v3.0.0: the weather device — every attribute it reads, also those the panels' state leaves out)
                wid = self._wx("device_id")
                if wid is not None and int(m.get("deviceId")) == wid and self._wx("on_event", wid, m["name"], m.get("value"), m.get("unit")):
                    self.wx_soon()
            except Exception:   # (TypeError / ValueError: an odd deviceId; anything else: never the panels' events)
                pass
        if not isinstance(m, dict) or m.get("source") != "DEVICE" or not isinstance(m.get("name"), str) or m["name"] not in KEEP:
            return
        try:
            did = int(m.get("deviceId"))
        except (TypeError, ValueError):
            return
        name, value = m["name"], compact(m.get("value"), m["name"])
        with self.lock:
            self.state.setdefault(str(did), {})[name] = value
            self.seq += 1
            self.touched[(str(did), name)] = self.seq
        self.pub_event(did, name, value)
        self.pub_state_soon()
        if self.args.verbose:
            log.info("event %s %s=%s", did, name, value)

    def pub_state_soon(self, delay=2.0):
        """The retained state follows events (one republish per burst): a page or the guest Wi-Fi child that
        (re)connects never starts from a snapshot minutes old (e.g. a guest mode shown off that is on)."""
        with self.lock:
            if self._state_timer:
                return
            self._state_timer = t = threading.Timer(delay, self._pub_state_now)
        t.daemon = True
        t.start()

    def _pub_state_now(self):
        with self.lock:
            self._state_timer = None
        self.pub_state()

    def ws_loop(self):
        backoff = 1
        while not self.stop.is_set():
            ws = None
            try:
                ws = WS(self.host, "/eventsocket")
                log.info("event socket connected")
                backoff = 1
                try:  # catch up on anything missed while disconnected
                    self.resync()
                except Exception as e:
                    log.warning("resync after connect failed: %s", safe_err(e))
                ws.sock.settimeout(120)  # hub is quiet sometimes; a timeout just means "reconnect"
                while not self.stop.is_set():
                    self.on_ws_message(ws.recv_text())
            except Exception as e:
                log.warning("event socket: %s — reconnecting in %ds", safe_err(e) if not isinstance(e, ConnectionError) else e, backoff)
            finally:
                if ws:
                    ws.close()
            self.stop.wait(backoff)
            backoff = min(backoff * 2, 60)

    def periodic(self):
        while not self.stop.wait(self.args.resync):
            try:
                self.resync()
            except Exception as e:
                log.warning("periodic resync failed: %s", safe_err(e))

    # --- commands ---
    def result(self, cid, command, ok, reason=None):
        msg = {"id": cid, "command": command, "ok": ok}
        if reason:
            msg["reason"] = reason
        if self.mqtt:
            self.mqtt.publish(T_RESULT, json.dumps(msg), qos=1)

    def on_cmd(self, payload, reply=None, deadline=None):
        # reply(cid, command, ok, reason=None): where the answer goes — the panels' T_RESULT, or (v2.9.1) the Manager's
        reply = reply or self.result
        try:
            m = json.loads(payload)
            cid, command, value = int(m["id"]), str(m["command"])[:40], m.get("value")
        except Exception:
            log.warning("REJECTED malformed command (%d bytes)", len(payload))
            reply(None, None, False, "malformed")
            return
        try:
            self.check_owner()  # the "never switch" list / overrides may just have been changed in Settings
        except Exception as e:  # never stop command handling over it: the current allowlist stays
            log.warning("allowlist not refreshed: %s", safe_err(e))
        if cid not in self.allow:
            log.warning("REJECTED command %r for device %s: not in allowlist", command, cid)
            reply(cid, command, False, "not allowed")
            return
        if command not in COMMANDS or (cid in self.kind_cmds and command not in self.kind_cmds[cid]) or                 (command in ONLY_LISTED and command not in self.kind_cmds.get(cid, ())) or \
                (command in MEDIA and command not in self.media.get(cid, ())):
            log.warning("REJECTED command %r for device %s: command not supported", command, cid)
            reply(cid, command, False, "command not allowed")
            return
        if self.needs_pin(cid, command):
            # a valve, garage opener or a device the owner marked: opening / turning on needs the panel PIN. The page
            # gets a one-time ticket for exactly this command from the dashboard service (which checks the PIN over
            # HTTP); only the ticket comes over MQTT, and it's never logged.
            if not self.pin or not self.pin.is_set():
                res = "unset"                      # no panel PIN yet: refused, the panel says to set one
            else:
                res = "ok" if self.ticket_ok(m.get("ticket"), cid, command, value) else "expired"
            if res != "ok":
                log.warning("REJECTED command %r for device %s: no valid PIN ticket (%s)", command, cid, res)
                reply(cid, command, False, "pin-" + res)
                return
        # (setColor: "hue,saturation[,level]" → the map Hubitat wants, built in device_rules — never passed through)
        ok, arg = command_arg(command, value)
        if not ok:
            log.warning("REJECTED command %r for device %s: bad value", command, cid)
            reply(cid, command, False, "bad value")
            return
        if self.args.dry_run:
            log.info("DRY-RUN: would send %s%s to device %s", command, f" {value}" if value is not None else "", cid)
            reply(cid, command, False, "dry-run")
            return
        path = f"devices/{cid}/{command}" + (f"/{urllib.parse.quote(str(arg), safe='')}" if arg is not None else "")
        try:
            self.cmds.put_nowait((cid, command, value, path, time.monotonic(), reply, deadline))
        except queue.Full:
            log.warning("REJECTED command %r for device %s: too many queued", command, cid)
            reply(cid, command, False, "busy")

    def cmd_worker(self):
        while not self.stop.is_set():
            try:
                job = self.cmds.get(timeout=1)
            except queue.Empty:
                continue
            self._send(*job)
            time.sleep(0.2)  # at most ~5 commands a second to the hub

    def _send(self, cid, command, value, path, queued, reply=None, deadline=None):
        reply = reply or self.result
        if deadline is not None and time.time() > deadline:   # (a Manager command past its deadline: never sent late)
            log.warning("DROPPED %s for device %s: past the Manager's deadline", command, cid)
            reply(cid, command, False, "expired")
            return
        if time.monotonic() - queued > STALE_S:
            log.warning("DROPPED %s for device %s: waited over %d s for the hub", command, cid, STALE_S)
            reply(cid, command, False, "stale")
            return
        try:
            self.maker.get(path, timeout=8)
            log.info("SENT %s%s to device %s", command, f" {value}" if value is not None else "", cid)
            reply(cid, command, True)
        except Exception as e:
            log.warning("command %s to device %s failed: %s", command, cid, safe_err(e))
            reply(cid, command, False, "hub error")

    def mgr_key(self, label):
        """The key for the Manager's signed topics (device_rules labels), from the house ticket key — None without one."""
        return self.pin.purpose_key(label) if self.pin else None

    def on_manager_cmd(self, payload):
        """(v2.9.1) A device command from the Manager (T_MGR_CMD): checked strictly — {"id", "command", "value"?,
        "ticket"?, "by", "rid", "role", "exp", "sig"} and nothing else, signed with the Manager key, not past its deadline,
        one of the Manager's commands, within its role's budget and the queue share — then exactly the panels' checks
        (on_cmd: the allowlist and never list, the device's own commands, the value, the PIN ticket for what needs one);
        the answer goes to T_MGR_CMD_RESULT with the rid. The ticket is never logged; "by" is. (v2.9.3) A mode / HSM: device
        0 only (and device 0 only for them), then the panels' own path (on_mode_set / on_hsm_set)."""
        if len(payload) > MGR_CMD_MAX_BYTES:
            log.warning("REJECTED Manager command: too long")
            return False
        try:
            m = json.loads(payload)
        except ValueError:
            m = None
        rid = m.get("rid") if isinstance(m, dict) and isinstance(m.get("rid"), str) and MGR_RID.fullmatch(m["rid"]) else None
        if not isinstance(m, dict) or set(m) - {"id", "command", "value", "ticket", "by", "rid", "role", "exp", "sig"} or rid is None \
                or not isinstance(m.get("by"), str) or not MGR_BY.fullmatch(m["by"]) or m.get("role") not in ("admin", "user") \
                or not isinstance(m.get("id"), int) or isinstance(m.get("id"), bool) or not isinstance(m.get("command"), str) \
                or not isinstance(m.get("exp"), int) or isinstance(m.get("exp"), bool):
            log.warning("REJECTED Manager command: bad message")
            if rid:
                self.manager_result(rid, None, None, False, "malformed")
            return False
        if not device_rules.signed_ok(self.mgr_key(device_rules.MGR_CMD_LABEL), m):
            log.warning("REJECTED Manager command: not signed by the dashboard service")
            self.manager_result(rid, m["id"], m["command"][:40], False, "bad-signature")
            return False
        by, now = m["by"], time.time()
        if not now <= m["exp"] <= now + 60:   # (past its deadline — or one too far ahead to be the server's)
            log.warning("REJECTED Manager command from %s: past its deadline", by)
            self.manager_result(rid, m["id"], m["command"][:40], False, "expired")
            return False
        with self.allow_lock:   # (each signed message once: a replay before its deadline is refused — rids kept until then)
            seen = self.__dict__.setdefault("mgr_rids", {})
            for r_old in [r for r, e in seen.items() if e < now]:
                del seen[r_old]
            replayed = rid in seen
            if not replayed:
                if len(seen) >= 5000:   # (bounded: the oldest deadlines go first)
                    for r_old in sorted(seen, key=seen.get)[:1000]:
                        del seen[r_old]
                seen[rid] = m["exp"]
        if replayed:
            log.warning("REJECTED Manager command from %s: already handled", by)
            self.manager_result(rid, m["id"], m["command"][:40], False, "replayed")
            return False
        house = m["command"] in device_rules.HOUSE_COMMANDS   # (v2.9.3: a mode / HSM — device 0 only)
        if (m["command"] not in device_rules.MANAGER_COMMANDS and not house) or (house and m["id"] != 0) or (m["id"] == 0 and not house):
            # (the Manager's list only — never unlock, never refresh; a mode / HSM only as device 0, device 0 only for them)
            log.warning("REJECTED Manager command %r from %s: not one the Manager sends", m["command"][:40], by)
            self.manager_result(rid, m["id"], m["command"][:40], False, "command not allowed")
            return False
        with self.allow_lock:
            budgets = self.__dict__.setdefault("mgr_cmds", {})
            sent = budgets[m["role"]] = [t for t in budgets.get(m["role"], []) if now - t < 60]
            if len(sent) >= MANAGER_CMD_RATE:
                too_many = True
            else:
                too_many = False
                in_flight = self.__dict__.setdefault("mgr_in_flight", [0])
                if in_flight[0] >= MGR_QUEUE_MAX:
                    busy = True
                else:
                    busy = False
                    in_flight[0] += 1
                    sent.append(now)
        if too_many:
            log.warning("REJECTED Manager command from %s: too many", by)
            self.manager_result(rid, m["id"], m["command"], False, "too-many")
            return False
        if busy:
            log.warning("REJECTED Manager command from %s: the hub queue's Manager share is full", by)
            self.manager_result(rid, m["id"], m["command"], False, "busy")
            return False
        done = [False]

        def reply(cid, command, ok, reason=None):   # (once: the share given back with the answer)
            if not done[0]:
                done[0] = True
                with self.allow_lock:
                    self.mgr_in_flight[0] = max(0, self.mgr_in_flight[0] - 1)
            self.manager_result(rid, cid, command, ok, reason)
        log.info("Manager command %s for device %s from %s", m["command"][:40], m["id"], by)
        if house:   # (v2.9.3) exactly the panels' mode / HSM path — the hub's modes, the ticket, MODE_RATE / HSM_RATE
            word = m.get("value") if isinstance(m.get("value"), str) else ""
            ticket = m.get("ticket") if isinstance(m.get("ticket"), str) else None
            panel = by if PANEL_NAME.fullmatch(by) else None
            if m["command"] == "setMode":
                self.on_mode_set(json.dumps({"mode": word, "ticket": ticket, **({"panel": panel} if panel else {})}),
                                 answer=lambda ok, _v, reason=None: reply(0, "setMode", ok, reason))
            else:
                self.on_hsm_set(json.dumps({"action": word, "ticket": ticket, **({"panel": panel} if panel else {})}),
                                answer=lambda ok, _v, reason=None: reply(0, "setHsm", ok, reason))
            return True
        self.on_cmd(json.dumps({k: v for k, v in m.items() if k in ("id", "command", "value", "ticket")}), reply=reply, deadline=m["exp"])
        return True

    def manager_result(self, rid, cid, command, ok, reason=None):
        msg = {"rid": rid, "id": cid, "command": command, "ok": ok}
        if reason:
            msg["reason"] = reason
        key = self.mgr_key(device_rules.MGR_RESULT_LABEL)
        if key:
            msg["sig"] = device_rules.sign(key, msg)
        if self.mqtt:
            self.mqtt.publish(T_MGR_CMD_RESULT, json.dumps(msg), qos=1)

    # --- MQTT ---
    def start_mqtt(self):
        import paho.mqtt.client as mqtt
        c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"hubitat-bridge-{os.getpid()}")
        c.will_set(T_STATUS, "offline", qos=1, retain=True)
        if self.mqtt_user:  # empty = anonymous broker
            c.username_pw_set(self.mqtt_user, self.mqtt_password or None)

        where = f"{self.args.mqtt_host}:{self.args.mqtt_port}"
        fails = [0]  # failed attempts since the last good connect (logged at 1, 10, 100, ... so the log stays short)

        def failed(why):
            fails[0] += 1
            if fails[0] in (1, 10, 100) or fails[0] % 1000 == 0:
                log.warning("MQTT broker %s not reachable (%s) — attempt %d, retrying every 1-30 s", where, why, fails[0])

        def on_connect(client, userdata, flags, rc, props=None):
            if rc.is_failure:
                failed(f"refused: {rc}")
                return
            fails[0] = 0
            log.info("MQTT connected to %s (rc=%s)", where, rc)
            client.publish(T_STATUS, "online", qos=1, retain=True)
            client.subscribe(T_CMD, qos=1)
            client.subscribe(T_ACK, qos=1)
            client.subscribe(T_ACK_MGR, qos=1)
            client.subscribe(T_MGR_CMD, qos=1)   # (v2.9.1: the Manager's device commands)
            client.subscribe(T_MODE_SET, qos=1)
            client.subscribe(T_HSM_SET, qos=1)
            client.subscribe(T_HEALTH, qos=0)
            if self.state:
                self.pub_state()
            if self.notifiers or self._wx("device_id") is not None:
                self.pub_alerts()
            self.pub_weather(force=True)   # (v3.0.0; retained: the panels know at once whether to use it)
            if self.mode:
                client.publish(T_MODE, json.dumps({"mode": self.mode}), qos=1, retain=True)
            if self.modes:
                self.pub_modes()
            self.pub_hsm()   # (only once the status is known)
            self.pub_model()

        def on_message(client, userdata, msg):
            # a retained command would run again on every (re)connect: commands must be live messages
            # (an empty payload is just someone clearing a retained message)
            if msg.topic == T_CMD and not msg.retain and msg.payload:
                try:
                    self.on_cmd(msg.payload.decode("utf-8", errors="replace")[:2000])
                except Exception as e:  # never let one message kill paho's network thread
                    log.warning("command handling failed: %s", type(e).__name__)
            elif msg.topic == T_ACK and not msg.retain and msg.payload:
                try:
                    self.on_ack(bytes(msg.payload[:ACK_MAX_BYTES + 1]))   # (parse_ack refuses anything longer)
                except Exception as e:
                    log.warning("alert dismiss handling failed: %s", type(e).__name__)
            elif msg.topic == T_MGR_CMD and not msg.retain and msg.payload:
                try:
                    self.on_manager_cmd(bytes(msg.payload[:MGR_CMD_MAX_BYTES + 1]).decode("utf-8", errors="replace"))
                except Exception as e:   # never let one message kill paho's network thread
                    log.warning("Manager command handling failed: %s", type(e).__name__)
            elif msg.topic == T_ACK_MGR and not msg.retain and msg.payload:
                try:
                    self.on_manager_ack(bytes(msg.payload[:ACK_MAX_BYTES + 1]))
                except Exception as e:
                    log.warning("Manager acknowledgement handling failed: %s", type(e).__name__)
            elif msg.topic == T_MODE_SET and not msg.retain and msg.payload:
                try:
                    self.on_mode_set(bytes(msg.payload[:MODE_SET_MAX_BYTES + 1]))   # (parse_mode_set refuses anything longer)
                except Exception as e:
                    log.warning("mode change handling failed: %s", type(e).__name__)
            elif msg.topic == T_HEALTH and not msg.retain and msg.payload:   # (a retained heartbeat would say "alive" for a dead server)
                try:
                    self.on_health(bytes(msg.payload[:HEALTH_MAX_BYTES + 1]))   # (parse_health refuses anything longer)
                except Exception as e:
                    log.warning("health heartbeat handling failed: %s", type(e).__name__)
            elif msg.topic == T_HSM_SET and not msg.retain and msg.payload:
                try:
                    self.on_hsm_set(bytes(msg.payload[:HSM_SET_MAX_BYTES + 1]))   # (parse_hsm_set refuses anything longer)
                except Exception as e:
                    log.warning("hsm change handling failed: %s", type(e).__name__)

        def on_disconnect(client, userdata, flags, rc, props=None):
            if rc.is_failure:
                log.warning("MQTT connection to %s lost (%s) — reconnecting", where, rc)

        c.on_connect, c.on_message, c.on_disconnect = on_connect, on_message, on_disconnect
        c.on_connect_fail = lambda client, userdata: failed("no connection")
        c.reconnect_delay_set(1, 30)
        c.connect_async(self.args.mqtt_host, self.args.mqtt_port, keepalive=30)
        c.loop_start()
        self.mqtt = c

    def run(self):
        log.info("allowlist: %s%s", sorted(self.allow) or "EMPTY (all commands rejected)", " · DRY-RUN" if self.args.dry_run else "")
        if not self.pin:
            log.warning("alert dismissals: PIN tickets NOT checked — no house dir (--house-dir / DATA_DIR): a level 4–5 is dismissed "
                        "from a panel without proof of the PIN")
        else:
            log.info("alert dismissals: level 4–5 need a PIN ticket%s", "" if self.ack_tickets else
                     " — NOT enforced (ACK_TICKETS=off): one without is only logged")
        self.start_mqtt()
        while not self.stop.is_set():
            try:
                self.resync(announce_changes=False)
                break
            except Exception as e:
                log.warning("initial fetch failed: %s — retrying in 10 s", safe_err(e))
                self.stop.wait(10)
        threading.Thread(target=self.periodic, daemon=True).start()
        threading.Thread(target=self.watch_owner, daemon=True).start()
        threading.Thread(target=self.cmd_worker, daemon=True).start()
        threading.Thread(target=self.ws_loop, daemon=True).start()
        try:
            while not self.stop.wait(1):
                pass
        except KeyboardInterrupt:
            pass
        finally:
            self.stop.set()
            if self.mqtt:
                if self.mqtt.is_connected():
                    self.mqtt.publish(T_STATUS, "offline", qos=1, retain=True).wait_for_publish(2)
                self.mqtt.loop_stop()
                self.mqtt.disconnect()
            log.info("stopped")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--allow", default=os.environ.get("HUBITAT_BRIDGE_ALLOW", ""),
                    help="comma list of device ids that may receive commands (default: none)")
    ap.add_argument("--allow-file", help="file with allowed device ids, one per line, # comments "
                                         "(e.g. an old house/bridge-allow.txt); adds to --allow. The house model normally decides")
    data_dir = os.environ.get("DATA_DIR")
    ap.add_argument("--house-dir", default=os.environ.get("HOUSE_DIR") or (str(pathlib.Path(data_dir) / "house") if data_dir else ""),
                    help="write the house model (hubitat-data.js) here and allow every device it shows (default: $DATA_DIR/house)")
    ap.add_argument("--panel-file", default=str(pathlib.Path(data_dir) / "panels" / "main.json") if data_dir else "",
                    help="the main panel's saved settings (its neverSwitch list); default $DATA_DIR/panels/main.json")
    ap.add_argument("--dry-run", action="store_true", help="never send commands to the hub")
    ap.add_argument("--once", action="store_true", help="fetch state, print a summary and exit")
    ap.add_argument("--mqtt-host", default="localhost")
    ap.add_argument("--mqtt-port", type=int, default=1883)
    ap.add_argument("--resync", type=int, default=300, help="seconds between full refresh + retained republish")
    ap.add_argument("--verbose", action="store_true", help="log every event")
    ap.add_argument("--ack-tickets", choices=("on", "off"),
                    default="off" if os.environ.get("ACK_TICKETS", "").strip().lower() in ("0", "off", "false", "no") else "on",
                    help="a panel's level 4–5 dismissal needs a one-time PIN ticket (default on; ACK_TICKETS=off in the "
                         "environment turns it off — then a dismissal without one is only logged)")
    args = ap.parse_args()
    args.ack_tickets = args.ack_tickets == "on"
    args.allow = {int(x) for x in re.split(r"[,\s]+", args.allow.strip()) if x}
    bad_lines = []
    if args.allow_file:  # utf-8-sig: a BOM (Notepad / PowerShell) must not break the first line
        for n, line in enumerate(pathlib.Path(args.allow_file).read_text(encoding="utf-8-sig").splitlines(), 1):
            first = line.split("#", 1)[0].strip().rstrip(",")
            if first:
                try:
                    args.allow.add(int(first))
                except ValueError:
                    bad_lines.append(n)  # logged once logging is set up; a typo never stops the bridge

    env = load_env()
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(Scrub([env.get("HUBITAT_TOKEN"), env.get("MQTT_PASSWORD")]))
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s", "%H:%M:%S"))
    log.addHandler(handler)
    log.setLevel(logging.INFO)
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    if bad_lines:
        log.warning("allow file: ignored line(s) %s (not a device id)", ", ".join(map(str, bad_lines)))

    bridge = Bridge(args, env)
    if args.once:
        devices = bridge.maker.get("devices/all", timeout=60)
        st = build_state(devices)
        size = len(json.dumps(st, separators=(",", ":")))
        print(f"{len(devices)} devices, {len(st)} with panel attributes, hubitat/state = {size / 1024:.1f} KB")
        print(f"allowlist: {sorted(args.allow) or 'EMPTY'}")
        for did in sorted(args.allow):
            d = next((x for x in devices if str(x["id"]) == str(did)), None)
            print(f"  [{did}] {d['label'] if d else '?'} room={d.get('room') if d else '?'} {st.get(str(did))}")
        return
    bridge.run()


if __name__ == "__main__":
    main()
