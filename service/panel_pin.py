"""House-wide panel PIN: guards opening Settings on the panels and confirming risky device commands.

Not the alarm code (that stays in Hubitat). Python 3.12 stdlib only. Used by the dashboard server AND, in another
process, the Hubitat bridge - so all state lives in files under the house dir (DATA_DIR/house):

  panel-pin.json           {"v": 1, "salt": hex, "iter": N, "hash": hex}   PBKDF2-HMAC-SHA256, mode 0600
  panel-pin-attempts.json  guess limiting:
                           "<who>":    {"fails": n, "until": lock-out end, "last": last wrong guess}  per client (IP)
                           "*":        {"fails": n, "until": end of the hour window}  house-wide wrong guesses
                           "ok:<who>": {"fails": 0, "until": last correct PIN}  clients that knew the PIN ("trusted")
                           "alert:<who>", "disarm:<who>": the same as "<who>", own counters (PURPOSES below)
                           "hour:<who>": {"fails": n, "until": lock-out end, "last": start of the hour window}  every
                                     wrong PIN of this client in the hour, all purposes (CLIENT_HOUR_MAX)
                           Someone guessing on the LAN locks out themselves (5 wrong → 5 minutes, then every further
                           wrong one locks again); all untrusted clients together get GLOBAL_MAX wrong guesses an hour
                           (more IPs don't help); the owner's panels (trusted) are never locked by strangers' guesses.
                           A client's wrong guesses are remembered for DECAY_SECONDS — never forgotten earlier to make
                           room (a full table locks NEW clients instead).
  panel-pin-ticket.key     32 random bytes (hex), mode 0600: signs one-time tickets (below)

Tickets: the PIN itself never travels over MQTT (the broker's plain port is anonymous on the LAN). The page sends
the PIN to the dashboard service over HTTP; the service checks it and answers with a ticket — HMAC-signed, valid
for TICKET_SECONDS, for ONE device id + command — which goes with the command to the Hubitat bridge. The bridge
checks the signature, the expiry and the id/command, and accepts each ticket only once.
(Dismissing a level 4-5 alert from a panel, v2.3.2: device 0, command "alertAck", value = the alert id.)

Rules:
  - The PIN is 4-8 ASCII digits. Only a salted hash is stored; the PIN and hash are never logged or returned.
  - MAX_FAILS wrong attempts in a row -> locked for LOCK_SECONDS (verify/set answer "locked" without checking).
    After a lock-out ends the run is NOT forgotten: every further wrong PIN locks again at once, so guessing is
    held to one try per LOCK_SECONDS until a correct PIN resets the count.
  - Purposes: a child guessing on the Settings gear must not block the house's emergency path.
    Dismissing a level 4-5 alert ("alert") and disarming ("disarm") count their wrong PINs separately: both lock
    for 30 s after MAX_FAILS (a fumble on the emergency path waits only briefly), then 1, 2, 5 minutes for each
    further wrong one (ALERT_LOCKS / DISARM_LOCKS). Their runs are forgotten after QUIET_SECONDS without a wrong PIN.
    Everything else ("general") keeps the rule above. A right PIN (any purpose) resets all of that client's counters.
    The house-wide hourly budget for untrusted clients counts every purpose together; every client (the owner's
    trusted panels too) also gets at most CLIENT_HOUR_MAX wrong PINs an hour over all purposes — then every purpose
    is locked LOCK_SECONDS, again after each further wrong one in that hour — so the separate counters never add up
    to a fast guessing path. Which purpose applies is decided by the server (server.py), never taken from the page
    on trust.
  - A forgotten PIN is reset only on the server: delete panel-pin.json (and panel-pin-attempts.json to clear a
    lock-out). There is deliberately no way to do it from a panel.
  - A damaged / missing attempts file counts as "no fails" (it holds nothing secret).
  - A panel-pin.json that is present but unreadable / damaged is NOT treated as "no PIN": verify answers "wrong"
    (and counts the attempt) and set refuses with "wrong-pin", so a corrupted file never opens things up.
  - Two processes share the files best effort: read-modify-write with atomic replace; within one process a lock
    serializes checks so parallel guesses can't slip past the fail count.

Usage:
    pin = PanelPin(pathlib.Path(DATA_DIR) / "house")
    pin.verify("1234")  -> "ok" | "wrong" | "locked" | "unset"
    pin.verify("1234", ip, "disarm"); pin.locked_for(ip, "disarm")  -> seconds left (0 = not locked)
"""
import hashlib
import hmac
import json
import math
import os
import pathlib
import re
import tempfile
import threading
import time

PIN_RE = re.compile(r"[0-9]{4,8}")
ITERATIONS = 200_000   # ~0.06 s on the laptop; a few times that on a modest NAS CPU, still well under 0.5 s
MAX_FAILS = 5
LOCK_SECONDS = 300
TICKET_SECONDS = 30
MAX_CLIENTS = 200      # clients with recent wrong guesses kept; beyond this NEW clients count as locked
GLOBAL_MAX = 10        # wrong guesses per hour from all untrusted clients together
GLOBAL_WINDOW = 3600
DECAY_SECONDS = 24 * 3600   # a client's wrong guesses are forgotten after this long without another one
TRUST_SECONDS = 30 * 24 * 3600  # a client that entered the right PIN is "trusted" this long
PURPOSES = ("general", "alert", "disarm")
ALERT_LOCKS = (30, 60, 120, 300)    # s: dismissing a level 4-5 alert — the 1st lock-out, the 2nd, … (then the last)
DISARM_LOCKS = (30, 60, 120, 300)   # s: disarming — the 1st lock-out, the 2nd, … (then the last one each time)
QUIET_SECONDS = 15 * 60         # "alert" / "disarm" wrong guesses are forgotten after this long without another
CLIENT_HOUR_MAX = 30            # wrong PINs an hour from one client, all purposes together (trusted panels too)
KEY_FILE = "panel-pin-ticket.key"
PIN_FILE = "panel-pin.json"
ATTEMPTS_FILE = "panel-pin-attempts.json"

_lock = threading.Lock()  # one check at a time per process (PBKDF2 is CPU-heavy; fail counting stays exact)
_key_lock = threading.Lock()   # (v2.9.2) the ticket key: read / made by one thread at a time (two first uses at once made two keys)


def valid_format(pin):
    return isinstance(pin, str) and PIN_RE.fullmatch(pin) is not None


class _Damaged(Exception):
    pass


class PanelPin:
    def __init__(self, house_dir, iterations=None):
        self.dir = pathlib.Path(house_dir)
        # for NEW hashes (None = module ITERATIONS, read at set time so tests can lower it); verify uses the
        # count stored in the file
        self.iterations = iterations
        self.pin_path = self.dir / PIN_FILE
        self.attempts_path = self.dir / ATTEMPTS_FILE

    # ---- public -------------------------------------------------------------------------------------------------
    def is_set(self):
        """True when a PIN file exists (even a damaged one - that one still guards, see module doc)."""
        return self.pin_path.exists()

    def locked_for(self, who="local", purpose="general"):
        """Seconds left in this client's lock-out for this purpose (0 = not locked)."""
        with _lock:
            return self._locked_for(self._attempts(), who, purpose)

    def verify(self, pin, who="local", purpose="general"):
        with _lock:
            att = self._attempts()
            if self._locked_for(att, who, purpose):
                return "locked"
            try:
                rec = self._record()
            except _Damaged:
                rec = False
            if rec is None:
                return "unset"
            if rec and valid_format(pin) and self._matches(rec, pin):
                self._reset(att, who)
                return "ok"
            self._failed(att, who, purpose)
            return "wrong"

    def verify_keys(self, pin, keys, purpose="general"):
        """(v2.9.1) One PIN check counted against several clients at once — the Manager's device commands use the login
        ("manager:<login>") and the address: locked while either one is; a wrong PIN counts on each of them (and once
        on the house-wide budget); a right one ends every run. "ok" | "wrong" | "locked" | "unset"."""
        keys = [k for k in dict.fromkeys(keys) if isinstance(k, str) and k]
        if not keys:
            return "locked"
        with _lock:
            att = self._attempts()
            if any(self._locked_for(att, k, purpose) for k in keys):
                return "locked"
            try:
                rec = self._record()
            except _Damaged:
                rec = False
            if rec is None:
                return "unset"
            if rec and valid_format(pin) and self._matches(rec, pin):
                for k in keys:
                    self._reset(att, k)
                return "ok"
            self._failed(att, keys[0], purpose)
            for k in keys[1:]:   # (the others' own counters too — the house-wide budget only once)
                g = att.get("*")
                self._failed(att, k, purpose)
                if g is None:
                    att.pop("*", None)
                else:
                    att["*"] = g
            self._save_attempts(att)
            return "wrong"

    def purpose_key(self, label, create=False):
        """(v2.9.1) A key for one purpose, derived from the house's ticket key (HMAC-SHA256 with "skypane:<label>") —
        never the ticket key itself, and a different key for each label. None when there is no ticket key yet (and
        create is False) or it can't be read."""
        try:
            key = self._key(create)
        except (_Damaged, OSError):
            return None
        return hmac.new(key, ("skypane:" + str(label)).encode("utf-8"), "sha256").digest()

    def locked_for_keys(self, keys, purpose="general"):
        """(v2.9.1) The longest lock-out of these clients now (seconds; 0 = none)."""
        with _lock:
            att = self._attempts()
            return max([self._locked_for(att, k, purpose) for k in keys if isinstance(k, str) and k] or [0])

    def set(self, new, old=None, who="local"):
        """(True, None) or (False, "bad-format" | "wrong-pin" | "locked"). With a PIN already set, `old` must be
        right (a wrong one counts as a failed attempt); with none set, any valid `new` is accepted."""
        with _lock:
            att = self._attempts()
            if self._locked_for(att, who):
                return False, "locked"
            if not valid_format(new):
                return False, "bad-format"
            try:
                rec = self._record()
            except _Damaged:
                rec = False
            if rec is not None:
                if not (rec and valid_format(old) and self._matches(rec, old)):
                    self._failed(att, who)
                    return False, "wrong-pin"
            n = self.iterations or ITERATIONS
            salt = os.urandom(16)
            digest = hashlib.pbkdf2_hmac("sha256", new.encode("ascii"), salt, n)
            self._write(self.pin_path, {"v": 1, "salt": salt.hex(), "iter": n, "hash": digest.hex()})
            self._reset(att, who)
            return True, None

    # ---- one-time tickets (the PIN never goes over MQTT) ---------------------------------------------------------
    def ticket(self, device_id, command, value=None):
        """A signed ticket for ONE command (with this value) to ONE device, valid TICKET_SECONDS. Only call after
        verify() said ok."""
        exp = int(time.time()) + TICKET_SECONDS
        nonce = os.urandom(8).hex()
        body = f"{exp}.{nonce}"
        return f"{body}.{self._sign(body, device_id, command, value)}"

    @staticmethod
    def issued_at(ticket):
        """When a ticket was issued (epoch seconds), or None."""
        try:
            return int(ticket.split(".")[0]) - TICKET_SECONDS
        except (AttributeError, ValueError, TypeError, OverflowError):
            return None

    def check_ticket(self, ticket, device_id, command, value=None):
        """True when the ticket is genuine, not expired and for this device + command (single use: the caller keeps
        the tickets it has accepted until they expire)."""
        try:
            exp, nonce, sig = ticket.split(".")
            if not (exp.isdecimal() and len(nonce) == 16 and len(sig) == 64):
                return False
            if not 0 <= int(exp) - time.time() <= TICKET_SECONDS + 5:
                return False
            return hmac.compare_digest(sig, self._sign(f"{exp}.{nonce}", device_id, command, value, create=False))
        except (AttributeError, ValueError, TypeError, OverflowError, OSError, _Damaged):  # anything odd from MQTT → no
            return False

    @staticmethod
    def _canon(value):
        """The command's value as signed: none, a number (40 and 40.0 alike) or a short string."""
        if value is None:
            return ""
        if isinstance(value, bool):
            raise ValueError("value")
        if isinstance(value, (int, float)):
            if not math.isfinite(value):
                raise ValueError("value")
            return str(int(value)) if float(value).is_integer() else repr(float(value))
        return "s:" + str(value)

    def _sign(self, body, device_id, command, value=None, create=True):
        key = self._key(create)
        return hmac.new(key, f"{body}|{int(device_id)}|{command}|{self._canon(value)}".encode(), "sha256").hexdigest()

    def _key(self, create):
        path = self.dir / KEY_FILE
        with _key_lock:   # (v2.9.2: requests arriving together on a fresh house each made a key — the bridge then saw "bad-signature")
            try:
                key = bytes.fromhex(path.read_text(encoding="ascii").strip())
                if len(key) >= 32:
                    return key
            except (OSError, ValueError):
                pass
            if not create:
                raise _Damaged()
            key = os.urandom(32)
            self._write_text(path, key.hex())
            return key

    # ---- internals ----------------------------------------------------------------------------------------------
    def _record(self):
        """The stored record, None when no file, _Damaged when present but not usable."""
        try:
            raw = self.pin_path.read_bytes()
        except FileNotFoundError:
            return None
        except OSError:
            raise _Damaged()
        try:
            rec = json.loads(raw.decode("utf-8"))
            salt, digest, n = bytes.fromhex(rec["salt"]), bytes.fromhex(rec["hash"]), rec["iter"]
        except (ValueError, KeyError, TypeError, UnicodeDecodeError, RecursionError):
            raise _Damaged()
        if rec.get("v") != 1 or not isinstance(n, int) or isinstance(n, bool) or not 1 <= n <= 10_000_000 \
                or len(salt) < 8 or len(digest) != 32:
            raise _Damaged()
        return {"salt": salt, "hash": digest, "iter": n}

    @staticmethod
    def _matches(rec, pin):
        digest = hashlib.pbkdf2_hmac("sha256", pin.encode("ascii"), rec["salt"], rec["iter"])
        return hmac.compare_digest(digest, rec["hash"])

    def _attempts(self):
        """The attempts table (see the module doc); anything odd counts as no fails."""
        try:
            raw = json.loads(self.attempts_path.read_text(encoding="utf-8"))
        except (OSError, ValueError, RecursionError):
            return {}
        out = {}
        if isinstance(raw, dict):
            for who, a in raw.items():
                try:
                    fails, until = a["fails"], a["until"]
                    last = a.get("last", until)
                    if any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in (fails, until, last)) \
                            or not isinstance(fails, int) or fails < 0:
                        continue
                    out[str(who)[:80]] = {"fails": fails, "until": until, "last": last}
                except (KeyError, TypeError, AttributeError):
                    continue
        return out

    @staticmethod
    def _clients(att):
        return [k for k in att if k != "*" and not k.startswith(("ok:", "hour:"))]

    @staticmethod
    def _slot(who, purpose):
        """The attempts table's key for this client's counter of this purpose (unknown purposes count as general)."""
        return f"{purpose}:{who}" if purpose in PURPOSES and purpose != "general" else who

    @staticmethod
    def _lock_seconds(purpose, fails):
        """How long a client is locked out after its `fails`-th wrong PIN in a row (0 = not yet)."""
        if fails < MAX_FAILS:
            return 0
        steps = ALERT_LOCKS if purpose == "alert" else DISARM_LOCKS if purpose == "disarm" else None
        if steps:
            return steps[min(fails - MAX_FAILS, len(steps) - 1)]
        return LOCK_SECONDS

    def _trusted(self, att, who):
        ok = att.get("ok:" + who)
        return bool(ok) and time.time() - ok["until"] < TRUST_SECONDS

    def _locked_for(self, att, who, purpose="general"):
        now = time.time()
        slot = self._slot(who, purpose)
        a = att.get(slot)
        decay = DECAY_SECONDS if slot == who else QUIET_SECONDS
        if a and now - a["last"] > decay and a["until"] <= now:  # old wrong guesses are forgotten
            del att[slot]
            self._save_attempts(att)
            a = None
        if a:
            left = a["until"] - now
            if left > LOCK_SECONDS:  # clock went backwards (or a bad value): never lock longer than one lock-out
                a["until"] = now + LOCK_SECONDS
                self._save_attempts(att)
                left = LOCK_SECONDS
            if left > 0:
                return max(1, math.ceil(left))
        h = att.get("hour:" + who)   # this client's wrong PINs in the hour, every purpose (trusted panels too)
        if h and h["until"] > now:
            return max(1, math.ceil(min(h["until"] - now, LOCK_SECONDS)))
        if self._trusted(att, who):
            return 0
        if not a and len(self._clients(att)) >= MAX_CLIENTS:  # table full of recent guessers: new clients wait
            return LOCK_SECONDS
        g = att.get("*")
        if g and g["until"] > now and g["fails"] >= GLOBAL_MAX:  # the house-wide hourly budget is used up
            return max(1, math.ceil(min(g["until"] - now, GLOBAL_WINDOW)))
        return 0

    def _failed(self, att, who, purpose="general"):
        now = time.time()
        slot = self._slot(who, purpose)
        a = att.get(slot) or {"fails": 0, "until": 0, "last": now}
        a = {"fails": a["fails"] + 1, "until": a["until"], "last": now}
        if a["fails"] >= MAX_FAILS:
            a["until"] = now + self._lock_seconds(purpose, a["fails"])
        att[slot] = a
        hk = "hour:" + who
        h = att.get(hk)
        if not h or not 0 <= now - h["last"] < GLOBAL_WINDOW:   # (a new hour; or the clock went backwards)
            h = {"fails": 0, "until": 0, "last": now}
        h = {"fails": h["fails"] + 1, "until": h["until"], "last": h["last"]}
        if h["fails"] >= CLIENT_HOUR_MAX:
            h["until"] = now + LOCK_SECONDS
        att[hk] = h
        if not self._trusted(att, who):
            g = att.get("*")
            if not g or g["until"] <= now:
                g = {"fails": 0, "until": now + GLOBAL_WINDOW, "last": now}
            g = {"fails": g["fails"] + 1, "until": g["until"], "last": now}
            att["*"] = g
        # keep the file small: only clients whose guesses are already forgotten (DECAY) and not locked may go
        for k in self._clients(att):
            if k != slot and now - att[k]["last"] > DECAY_SECONDS and att[k]["until"] <= now:
                del att[k]
        for k in [k for k in att if k.startswith("hour:") and k != hk]:   # (hours that are over)
            if now - att[k]["last"] >= GLOBAL_WINDOW and att[k]["until"] <= now:
                del att[k]
        self._save_attempts(att)

    def _reset(self, att, who):
        for p in PURPOSES:   # (a right PIN, for any purpose, ends every run of this client)
            att.pop(self._slot(who, p), None)
        att.pop("hour:" + who, None)
        now = time.time()
        att["ok:" + who] = {"fails": 0, "until": now, "last": now}
        oks = sorted((k for k in att if k.startswith("ok:")), key=lambda k: att[k]["until"])
        for k in oks[:-50]:  # remember at most 50 trusted clients
            del att[k]
        self._save_attempts(att)

    def _save_attempts(self, att):
        try:
            self._write(self.attempts_path, att)
        except OSError:
            pass  # best effort: a read-only house dir must not turn every check into an error

    def _write_text(self, path, text):
        self.dir.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix="." + path.name + ".", suffix=".tmp", dir=self.dir)
        try:
            with os.fdopen(fd, "w", encoding="ascii") as f:
                f.write(text)
            try:
                os.chmod(tmp, 0o600)
            except OSError:
                pass
            os.replace(tmp, path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    def _write(self, path, obj):
        """Atomic write (temp file in the same dir + os.replace); mkstemp creates it 0600 where the OS allows."""
        self.dir.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix="." + path.name + ".", suffix=".tmp", dir=self.dir)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(obj, f)
                f.flush()
                os.fsync(f.fileno())
            try:
                os.chmod(tmp, 0o600)
            except OSError:
                pass
            os.replace(tmp, path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
