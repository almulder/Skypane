"""(v3.0.5) The UPS / battery backup card's readings from a NUT server (Network UPS Tools: a Minuteman on Unraid's NUT,
or any UPS NUT supports) — mockups/prototypes/unifi-v2.html "UPS / battery backup", TESTING-NOTES 2026-11-04.

Run by service/run_all.py as the "nutups" child when NUT_HOST is set (Manager → Integrations → UPS). It is the only
child that gets NUT_PASSWORD. Read only, always: the only words it ever sends are USERNAME, PASSWORD, LIST UPS,
LIST VAR <ups> and LOGOUT (ALLOWED below) — never INSTCMD, SET, LOGIN, FSD or anything else that could switch a UPS off,
test it or shut a computer down.
  - only while someone looks: a panel with a UPS card or the Manager asked the dashboard server within DEMAND_FRESH s
    (the server touches private/nut-ups-demand.json), then every POLL_EVERY s; nobody looking = no connection at all;
  - writes private/nut-ups-status.json for the server: {ok, readAt, error, upses: [ups…]} — never the address, the
    login or the password (an error is said in our own words);
  - keeps private/nut-ups-state.json (mode 0600): each UPS's last state, for the power events (on battery, battery
    low, back on mains — power_events(), shared with service/unifi_net.py's UniFi UPS).
A ups: {id: "nut:<name>", name, model, src: "nut", online, state: "mains" | "battery" | "low", charge (%), runtime (s),
load (%), vin, vout (V), watts, charging, last: {kind, at} | None}.
Usage: python -I -u service/nut_ups.py --data-dir /data [--once]
"""
import argparse
import json
import os
import pathlib
import re
import socket
import sys
import threading
import time

try:   # (the server imports it as service.nut_ups; run_all runs it isolated, from its own folder)
    from service import guest_wifi
except ImportError:  # pragma: no cover
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    import guest_wifi

read_json, write_private = guest_wifi.read_json, guest_wifi.write_private

PORT = 3493
POLL_EVERY = 30
DEMAND_FRESH = 120
STALE_AFTER = 3 * POLL_EVERY + 15
MAX_UPS = 8
MAX_LINES = 2000
MAX_LINE = 1024
EVENTS_KEPT = 50
LOW_CHARGE = 25        # % — below this on battery is "battery low" even when the UPS doesn't say LB

STATUS = "nut-ups-status.json"
STATE = "nut-ups-state.json"
DEMAND = "nut-ups-demand.json"

NAME = re.compile(r"[A-Za-z0-9._-]{1,64}")
# (v3.0.5) the password: printable ASCII ([!-~]) minus " and \ — as house_settings' NUT_PASSWORD
SECRET = re.compile(r"[!#-\[\]-~]{1,128}")
# the only words this file ever sends (each line is checked against it before it goes)
ALLOWED = re.compile(r"(USERNAME [A-Za-z0-9._-]{1,64}|PASSWORD [!#-\[\]-~]{1,128}|LIST UPS|LIST VAR [A-Za-z0-9._-]{1,64}|LOGOUT)")
READ_DEADLINE = 15     # (v3.0.5) s — one whole read (connect, login, every list), however slowly the server trickles
# (v3.0.5) NUT's own error codes (docs/net-protocol.txt, "Error responses") — the only words after ERR ever shown
ERR_CODES = frozenset((
    "ACCESS-DENIED", "UNKNOWN-UPS", "VAR-NOT-SUPPORTED", "CMD-NOT-SUPPORTED", "INVALID-ARGUMENT", "INSTCMD-FAILED",
    "SET-FAILED", "READONLY", "TOO-LONG", "FEATURE-NOT-SUPPORTED", "FEATURE-NOT-CONFIGURED", "ALREADY-SSL-MODE",
    "DRIVER-NOT-CONNECTED", "DATA-STALE", "ALREADY-LOGGED-IN", "INVALID-PASSWORD", "ALREADY-SET-PASSWORD",
    "INVALID-USERNAME", "ALREADY-SET-USERNAME", "USERNAME-REQUIRED", "PASSWORD-REQUIRED", "UNKNOWN-COMMAND",
    "INVALID-VALUE"))
ADDR = re.compile(r"\b\d{1,3}(\.\d{1,3}){3}\b|\b([0-9a-f]{2}[:-]){2,}[0-9a-f]{2}\b|https?://", re.I)


class Fail(Exception):
    """A read that didn't work, in our own words (never the address or the login)."""


def log(msg, secret=""):
    print(time.strftime("%H:%M:%S"), scrub(msg, secret), flush=True)   # (v3.0.5: never the password)


def scrub(v, secret):
    """(v3.0.5) v with the password's text taken out (each place it appears: "***", plain ASCII for any console) —
    before anything is written to the status file or the log. (v3.0.5) Only a password of 4 or more characters: a
    shorter one would star out ordinary words and numbers."""
    return v.replace(secret, "***") if isinstance(v, str) and secret and len(secret) >= 4 else v


def text(v, n=64):
    if not isinstance(v, str):
        return None
    v = " ".join(v.split())[:n]
    return v if v and not ADDR.search(v) else None


def num(v, nd=1):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, nd) if f == f and abs(f) != float("inf") else None


# ---------- the NUT server ----------
class Nut:
    """A read-only NUT client: one connection per read, ALLOWED words only."""

    def __init__(self, host, port=PORT, user="", password="", timeout=6):
        self.host, self.port, self.user, self.password, self.timeout = host, int(port or PORT), user or "", password or "", timeout
        self._sock, self._deadline = None, None   # (v3.0.5) this read's socket and its monotonic deadline (READ_DEADLINE)
        self._buf = b""   # (v3.0.5) what was received and not yet read as a line (_line)

    def _send(self, f, line):
        """f: this read's socket (v3.0.5: sendall — the reading side is _line's own buffer, not a file)."""
        if not ALLOWED.fullmatch(line):   # (never anything that could switch a UPS: a bug here fails, it doesn't send)
            raise Fail("not a read-only NUT question")
        try:   # (v3.0.5 ALLOWED is ASCII only; never an error that quotes the line — it may be the password)
            data = (line + "\n").encode("ascii")
        except UnicodeError:
            raise Fail("not a read-only NUT question") from None
        f.sendall(data)

    def _line(self, f):
        """One line from the server. (v3.0.5) recv into our own buffer with the socket's timeout set to what is left of
        the read's deadline before every recv — a server sending one byte a second can't hold a line (or the read)
        past READ_DEADLINE, as a blocking readline could."""
        while b"\n" not in self._buf:
            if len(self._buf) > MAX_LINE:
                raise Fail("The NUT server sent a line that is too long.")
            left = (self._deadline - time.monotonic()) if self._deadline is not None else self.timeout
            if left <= 0:
                raise Fail("The NUT server is answering too slowly (timeout).")
            f.settimeout(min(self.timeout, left))
            chunk = f.recv(4096)
            if not chunk:
                raise Fail("The NUT server closed the connection.")
            self._buf += chunk
        raw, self._buf = self._buf.split(b"\n", 1)
        if len(raw) > MAX_LINE:
            raise Fail("The NUT server sent a line that is too long.")
        line = raw.decode("utf-8", "replace").rstrip("\r")
        if line.startswith("ERR "):
            # (v3.0.5) only NUT's own error codes are ever named: anything else after ERR (a server that echoes the
            # password, say) is "an unexpected reply" — none of its words reach the status file, the Manager or the log
            words = line[4:].split()
            code = words[0] if words and words[0] in ERR_CODES else None
            if code in ("ACCESS-DENIED", "USERNAME-REQUIRED", "PASSWORD-REQUIRED", "INVALID-PASSWORD", "INVALID-USERNAME"):
                raise Fail(f"The NUT server refused the login ({code}). Check the NUT user and password (Manager → Integrations → UPS).")
            if code == "UNKNOWN-UPS":
                raise Fail("The NUT server doesn't know that UPS (UNKNOWN-UPS).")
            if code == "DATA-STALE":
                raise Fail("The NUT server has no fresh readings from the UPS (DATA-STALE) — is its USB cable in?")
            if code:
                raise Fail(f"The NUT server said ERR {code}.")
            raise Fail("The NUT server sent an unexpected reply.")
        return line

    def _list(self, f, what):
        self._send(f, f"LIST {what}")
        first = self._line(f)
        if first != f"BEGIN LIST {what}":
            raise Fail("The NUT server's answer wasn't a list.")
        out = []
        for _ in range(MAX_LINES):
            line = self._line(f)
            if line == f"END LIST {what}":
                return out
            out.append(line)
        raise Fail("The NUT server's list is too long.")

    def read(self):
        """{ups name: {"desc": text, "vars": {name: value}}} for up to MAX_UPS UPSes."""
        self._deadline, self._sock, self._buf = time.monotonic() + READ_DEADLINE, None, b""   # (v3.0.5)
        try:
            s = socket.create_connection((self.host, self.port), timeout=self.timeout)
        except socket.timeout:
            raise Fail("The NUT server didn't answer (timeout). Check its address and that NUT is on (port 3493).") from None
        except OSError:
            raise Fail("Can't reach the NUT server. Check its address and that NUT is on and listening on the network (port 3493).") from None
        try:
            s.settimeout(self.timeout)
            self._sock = s
            f = s   # (v3.0.5: the socket itself — _line recv's with the deadline's timeout, no blocking readline)
            if self.user:
                self._send(f, f"USERNAME {self.user}")
                self._line(f)
                if self.password:
                    self._send(f, f"PASSWORD {self.password}")
                    self._line(f)
            names = []
            for line in self._list(f, "UPS"):
                m = re.fullmatch(r'UPS (\S+) "(.*)"', line)
                if m and NAME.fullmatch(m.group(1)):
                    names.append((m.group(1), m.group(2)))
            out = {}
            for name, desc in names[:MAX_UPS]:
                vars_ = {}
                for line in self._list(f, f"VAR {name}"):
                    m = re.fullmatch(r'VAR \S+ ([A-Za-z0-9._-]{1,64}) "(.*)"', line)
                    if m and len(vars_) < 300:
                        vars_[m.group(1)] = scrub(m.group(2), self.password)[:200]   # (v3.0.5: never the password)
                out[name] = {"desc": scrub(desc, self.password), "vars": vars_}   # (v3.0.5: scrubbed)
            try:
                self._send(f, "LOGOUT")
            except (OSError, Fail):
                pass
            return out
        except socket.timeout:
            if time.monotonic() >= self._deadline:   # (v3.0.5 the whole read's deadline, not one quiet line)
                raise Fail("The NUT server is answering too slowly (timeout).") from None
            raise Fail("The NUT server stopped answering (timeout).") from None
        except OSError:
            raise Fail("The connection to the NUT server broke off.") from None
        finally:
            self._sock = None
            try:
                s.close()
            except OSError:
                pass


# ---------- the model ----------
def from_nut(name, desc, v):
    """One UPS as the card shows it, from NUT's variables (battery.charge, battery.runtime, ups.load, ups.status …)."""
    status = set(str(v.get("ups.status") or "").upper().split())
    charge, runtime = num(v.get("battery.charge"), 0), num(v.get("battery.runtime"), 0)
    load, watts = num(v.get("ups.load"), 0), num(v.get("ups.realpower"), 0)
    nominal = num(v.get("ups.realpower.nominal"), 0)
    if watts is None and load is not None and nominal:
        watts = round(load * nominal / 100)
    if load is None and watts is not None and nominal:
        load = round(watts * 100 / nominal)
    on_batt = "OB" in status
    low = "LB" in status or (on_batt and charge is not None and charge <= LOW_CHARGE)
    model = " ".join(x for x in (text(v.get("device.mfr") or v.get("ups.mfr"), 32), text(v.get("device.model") or v.get("ups.model"), 48)) if x) or None
    return {"id": f"nut:{name}", "name": text(desc, 48) or text(name, 48) or "UPS", "model": model, "src": "nut",
            "online": bool(status) and "OFF" not in status, "state": "low" if low else "battery" if on_batt else "mains",
            "charge": charge, "runtime": runtime, "load": load, "vin": num(v.get("input.voltage")), "vout": num(v.get("output.voltage")),
            "watts": watts, "charging": "CHRG" in status}


def power_events(last, upses, now):
    """(shared with unifi_net) The power events since the last read: a UPS that went on battery ("battery"), whose
    battery got low ("low") or that is back on mains ("mains"). last: {ups id: state} (changed in place). A UPS seen for
    the first time says something only when it isn't on mains."""
    out = []
    for u in upses:
        if not u.get("online"):
            continue
        was, now_st = last.get(u["id"]), u.get("state")
        if now_st not in ("mains", "battery", "low") or was == now_st:
            continue
        if was is None and now_st == "mains":
            last[u["id"]] = now_st
            continue
        kind = "low" if now_st == "low" else "battery" if now_st == "battery" and was != "low" else "mains" if now_st == "mains" else None
        if kind:
            out.append({"at": round(now), "ups": u["id"], "name": u.get("name") or "UPS", "kind": kind})
        last[u["id"]] = now_st
    return out


def put_last(upses, events):
    """Each UPS's last power event ({kind, at}) from the events list (newest last)."""
    for u in upses:
        e = next((e for e in reversed(events) if e.get("ups") == u["id"]), None)
        u["last"] = {"kind": e["kind"], "at": e["at"]} if e else None
    return upses


# ---------- the child ----------
class Watcher:
    def __init__(self, nut, data_dir, now=time.time):
        self.nut, self.now = nut, now
        self.private = pathlib.Path(data_dir) / "private"
        st = read_json(self.private / STATE, {}) or {}
        self.last = st.get("last") if isinstance(st.get("last"), dict) else {}
        self.events = [e for e in st.get("events") or [] if isinstance(e, dict)][-EVENTS_KEPT:]
        self.polled_at = 0

    def wanted(self, now):
        at = (read_json(self.private / DEMAND, {}) or {}).get("at")
        return isinstance(at, (int, float)) and now - at < DEMAND_FRESH

    def step(self):
        now = self.now()
        if not self.wanted(now) or now - self.polled_at < POLL_EVERY:
            return False
        self.polled_at = now
        self.poll(now)
        return True

    def poll(self, now):
        try:
            raw = self.nut.read()
        except Fail as e:
            old = read_json(self.private / STATUS, {}) or {}
            # (v3.0.5) scrub: the password's text out of the words, whatever they are
            write_private(self.private / STATUS, json.dumps({"ok": False, "readAt": now, "error": scrub(str(e), self.nut.password),
                                                             "upses": [dict(u, online=False) for u in old.get("upses") or [] if isinstance(u, dict)]}))
            return
        upses = [from_nut(n, x["desc"], x["vars"]) for n, x in raw.items()]
        self.events = (self.events + power_events(self.last, upses, now))[-EVENTS_KEPT:]
        put_last(upses, self.events)
        write_private(self.private / STATUS, json.dumps({"ok": True, "readAt": now, "error": None if upses else "The NUT server lists no UPS.",
                                                         "upses": upses}, separators=(",", ":"), ensure_ascii=False))
        write_private(self.private / STATE, json.dumps({"last": self.last, "events": self.events}, separators=(",", ":")))


def public(st, now, since=None):
    """(the server) The status as the panels may see it: the UPSes, and whether NUT works — never an address.
    (v3.0.5) since: when the panels started asking again (the server's nut_since, as unifi_net.mark_stale) — after a quiet
    spell the child reads only once it's asked, so an old read isn't "every UPS offline" until STALE_AFTER has passed
    since then too."""
    st = st if isinstance(st, dict) else {}
    upses = [u for u in st.get("upses") or [] if isinstance(u, dict) and isinstance(u.get("id"), str)]
    at = st.get("readAt")
    stale = isinstance(at, (int, float)) and now - at > STALE_AFTER and (since is None or now - since > STALE_AFTER)
    return {"ok": st.get("ok") is True and not stale, "readAt": at, "upses": [dict(u, online=False) if stale else u for u in upses]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--once", action="store_true")
    a = ap.parse_args()
    host = (os.environ.get("NUT_HOST") or "").strip()
    port = (os.environ.get("NUT_PORT") or "").strip() or str(PORT)
    user = (os.environ.get("NUT_USER") or "").strip()
    password = os.environ.get("NUT_PASSWORD") or ""
    if not host or not re.fullmatch(r"[A-Za-z0-9.:\[\]-]{1,253}", host):
        log("UPS (NUT): the NUT server's address (Manager → Integrations → UPS) is needed — not running")
        return 2
    if not port.isdigit() or not 1 <= int(port) <= 65535 or (user and not NAME.fullmatch(user)) or (password and not SECRET.fullmatch(password)):
        log("UPS (NUT): the NUT port, user or password isn't a valid value — not running")   # (never print them)
        return 2
    w = Watcher(Nut(host, int(port), user, password), a.data_dir)
    stop, shown = threading.Event(), None
    try:
        while True:
            if w.step():
                err = (read_json(w.private / STATUS, {}) or {}).get("error")
                if err != shown:
                    shown = err
                    log(f"UPS (NUT): {err}" if err else "UPS (NUT): OK", password)   # (v3.0.5: scrubbed)
            if a.once or stop.wait(5):
                break
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
