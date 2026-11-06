"""(v3.0.5) The Skypane Notifier driver's version check (mockups/prototypes/upgrade-and-notices.html, "Notifier driver
out of date"; TESTING-NOTES "Notifier driver version check").

Skypane serves the driver itself (hubitat/SkypaneNotifier.groovy, /hubitat/SkypaneNotifier.groovy); bundled() reads
its DRIVER_VERSION. Since 3.0.5 the driver reports its own version in the `driverVersion` attribute; the bridge reads it
(the Maker API's device list, and the hub's events) and publishes, retained, on TOPIC:
  {"v": 1, "notifiers": [{"id": <device id>, "version": "3.0.5" | null (an older driver: it doesn't say)}]}
(only the internal login writes hubitat/#). state() compares: "ok" | "old" | "unknown" (a Notifier that doesn't say
its version: from before 3.0.5) | "none" (no Notifier on the hub — optional, so never a problem) | None (not known:
no hub set up, or the bridge hasn't said yet). check() is the health monitor's: "hubitat.notifier" (a notice, level 2) for
"old" and "unknown" — Integrations → Hubitat has the steps; alerts keep working with an older driver.
"""
import json
import pathlib
import re

try:
    from service import health
except ImportError:  # pragma: no cover  (run from inside service/, or the bridge)
    import health

DRIVER = pathlib.Path(__file__).resolve().parent.parent / "hubitat" / "SkypaneNotifier.groovy"
TOPIC = "hubitat/notifier"
VERSION = re.compile(r"\d{1,3}(?:\.\d{1,4}){1,3}")
_IN_FILE = re.compile(r'DRIVER_VERSION\s*=\s*"(\d{1,3}(?:\.\d{1,4}){1,3})"')
PROBLEM = "hubitat.notifier"
# (v3.0.5, review) "old" and "unknown" are a notice (level 2): the Manager's only — never a panel's pill (panel_status
# shows level 3 and up), never the hub's healthLevel / healthAlert (health.MANAGER_ONLY keeps it out of the heartbeat)
LEVEL = 2
health.MANAGER_ONLY.add(PROBLEM)
_cache = {}


def bundled(path=DRIVER):
    """The version of the driver Skypane serves (its DRIVER_VERSION) — None when the file can't be read. Read again
    only when the file changed."""
    try:
        st = path.stat()
        sig = (str(path), st.st_mtime_ns, st.st_size)
        if _cache.get("sig") != sig:
            m = _IN_FILE.search(path.read_text(encoding="utf-8", errors="replace"))
            _cache.update(sig=sig, v=m[1] if m else None)
        return _cache["v"]
    except OSError:
        return None


def parse_report(payload):
    """The bridge's TOPIC message → [{"id": int, "version": str | None}] (at most 10), or None when it isn't one."""
    try:
        m = json.loads(payload)
    except (ValueError, UnicodeDecodeError, TypeError):
        return None
    if not isinstance(m, dict) or m.get("v") != 1 or not isinstance(m.get("notifiers"), list):
        return None
    out = []
    for n in m["notifiers"][:10]:
        if not isinstance(n, dict) or isinstance(n.get("id"), bool) or not isinstance(n.get("id"), int) or n["id"] <= 0:
            continue
        v = n.get("version")
        out.append({"id": n["id"], "version": v if isinstance(v, str) and VERSION.fullmatch(v) else None})
    return out


def _key(v):
    return tuple(int(x) for x in v.split("."))


def state(want, notifiers, hub_on=True):
    """{"state": "ok" | "old" | "unknown" | "none", "have": the hub's (the oldest when there are several) | None,
    "want": Skypane's} — or None when it can't be told (no hub, no report yet, no bundled driver)."""
    if not hub_on or notifiers is None or not want:
        return None
    if not notifiers:
        return {"state": "none", "have": None, "want": want}
    vs = [n.get("version") for n in notifiers]
    if any(v is None for v in vs):
        return {"state": "unknown", "have": None, "want": want}
    have = min(vs, key=_key)
    return {"state": "old" if _key(have) < _key(want) else "ok", "have": have, "want": want}


def check(status):
    """The health monitor's check: status() → state()'s answer."""
    def run(_m):
        s = status()
        if not s or s["state"] not in ("old", "unknown"):
            return []
        return [_problem(s)]
    return run


def _problem(s):
    if s["state"] == "old":
        return health.problem(PROBLEM, "The Notifier driver on your hub is out of date",
                              f"The hub has {s['have']}; Skypane comes with {s['want']}. Alerts still work; Integrations → "
                              "Hubitat has the steps.", LEVEL)
    return health.problem(PROBLEM, "The Notifier driver on your hub is an older version",
                          f"It doesn't say its version, so it's from before 3.0.5; Skypane comes with {s['want']}. Alerts "
                          "still work; Integrations → Hubitat has the steps.", LEVEL)
