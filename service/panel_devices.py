"""Panel pairing (v3.0.2, mockups/CR-3.1-panel-pairing.md): a tablet becomes a panel only after an admin approves it
with the code shown on that tablet; from then on the panel's page works only with that tablet's device key.

Python 3.12 stdlib only; used by the dashboard server alone (one process: the file is read once, then kept in memory).

  private/panel-devices.json   (mode 0600, atomic writes)
    {"v": 1, "accept": true,        new tablets may ask to pair ("Accept new panels")
     "lockOnCopy": false,           a copied key locks its panel until the admin re-trusts / unlinks it
     "graceUntil": t,               upgrade from before 3.0.2: until then a legacy panel's first visit is adopted
     "legacy": [pid],               the panels that existed at the upgrade (each adopted once, then gone from here)
     "legacyKiosk": name | null,    the old main panel's FreeKiosk name (offered when approving the first tablet)
     "agentPrev": {pid: str},       (3.0.2 re-test) an unlinked panel's last agent token, until it is paired again
                                    (then its device's prevAgentToken)
     "devices": {pid: {"cur": sha256 hex, "older": [hex ≤ MAX_OLDER], "late": [hex], "lateUntil": t,
                       "retired": [hex ≤ MAX_RETIRED], "rotatedAt": t, "profile": {model, browser, platform, screen "WxH", tz}, "pairedAt": t,
                       "lastSeen": t, "lastIp": ip, "adopted": bool, "locked": bool, "copyAt": t | null,
                       "fresh": bool  (older[0] was the newest key when presented: it may force a rotation — "prev"),
                       "agentToken": str  (3.0.2 rev. 2: the LED agent's secret for this tablet, plain — the page hands it
                                     to the agent; made on first ask, kept on re-pair / approve of the same panel,
                                     gone with the device on unlink),
                       "prevAgentToken": str  (3.0.2 re-test: the token an unlink replaced — the agent may still hold it
                                     and takes the new one with it as prevToken; kept until the next unlink),
                       "agentSeen": bool  (an LED agent answered on this tablet once: ok/off at a check-in; kept on
                                     re-pair unless the profile is clearly another tablet)}}}
  private/panel-notices.json   [{id, kind, panel, at, ip, agent, count, read}]  newest last, at most MAX_NOTICES

Device keys: secrets.token_urlsafe(24) (192 bits), only their SHA-256 on disk, compared with hmac.compare_digest. Each
good visit may rotate the key (rotate(): at most every ROTATE_SECONDS). (v3.0.2: a replaced key stays valid — "older",
check() → "prev" — until a NEWER key has been presented once: a lost answer, a sleeping tablet or a forced rotation
never locks the tablet out. Then the keys before it are "late" for PREV_SECONDS (requests already on their way) and
retired after that: a retired key used again — one older than a key the tablet has already used — is a copy.)
Pairing requests (PairingRequests) live in memory only: a request exists while its tablet's screen keeps polling.

Usage (server):
    dev = PanelDevices(DATA_DIR / "private");  reqs = PairingRequests();  notes = PanelNotices(DATA_DIR / "private")
    dev.check(pid, key) -> "ok" | "prev" | "late" | "copy" | "locked" | None   (GOOD: the three that are served)
"""
import hashlib
import hmac
import json
import os
import pathlib
import re
import secrets
import threading
import time

FILE = "panel-devices.json"
NOTICES_FILE = "panel-notices.json"
GUARD = ".pairing-v302"         # DATA_DIR/house/: the migration ran
SWITCH_KEYS = ("switchRule", "neverSwitch")
ROTATE_SECONDS = 600            # a new key at most this often per panel
PREV_SECONDS = 60               # keys older than one just presented the first time still work this long (in flight)
MAX_OLDER = 8                   # still-valid older keys per panel (the one last presented + those issued since, unseen)
MAX_RETIRED = 32                # replaced keys remembered per panel (copy detection)
GRACE_SECONDS = 24 * 3600       # upgrade: legacy panels are adopted on their first visit this long
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # no 0/O, 1/I
CODE_LEN = 6
CODE_SECONDS = 600              # a pairing code is renewed after this long
POLL_SECONDS = 15               # a request not polled this long is gone (the tablet left the screen)
MAX_REQUESTS = 20
MAX_PER_IP = 3
MAX_WRONG = 5                   # wrong codes before a request is cancelled
MAX_NOTICES = 100
RETRY_SECONDS = 30              # an unreadable panel-devices.json is read again at most this often
SEEN_WRITE = 300                # lastSeen alone is written at most this often (an IP change at once)
GOOD = ("ok", "prev", "late")   # check() results that are served ("late": never with a new key)


def _hash(key):
    return hashlib.sha256(key.encode("utf-8", "surrogatepass")).hexdigest() if isinstance(key, str) else None


def _eq(a, b):
    return isinstance(a, str) and isinstance(b, str) and hmac.compare_digest(a, b)


def _token_ok(t):
    return isinstance(t, str) and len(t) >= 43


def token_id(token):
    """(3.0.2 re-test) What may be said about an agent token: the first 12 hex digits of its SHA-256 (the agent's
    /status says the same of its stored one) — the page compares the two, neither ever reveals the token."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:12] if isinstance(token, str) and token else ""


def clean_profile(p):
    """What the browser says about itself, kept short and plain: {model, browser, platform, tz, screen "WxH"} (each only
    when given). Not secret and never trusted to block; it only tells tablets apart and spots a clear change."""
    p = p if isinstance(p, dict) else {}
    out = {}
    for k, n in (("model", 40), ("browser", 24), ("platform", 24), ("tz", 48)):
        v = p.get(k)
        if isinstance(v, str) and (v := re.sub(r"[^A-Za-z0-9 _.,()/+:-]", "", v).strip()[:n]):
            out[k] = v
    s = p.get("screen")
    if isinstance(s, str) and (m := re.fullmatch(r"\s*(\d{1,5})\s*[x×]\s*(\d{1,5})\s*", s)):
        s = [int(m.group(1)), int(m.group(2))]
    if isinstance(s, (list, tuple)) and len(s) == 2 and all(isinstance(x, int) and not isinstance(x, bool) and 0 < x <= 20000 for x in s):
        out["screen"] = f"{s[0]}x{s[1]}"
    return out


def describe(profile):
    """"Chrome on Android (SM-T500)" — for the log and the notices."""
    p = profile or {}
    s = " on ".join(x for x in (p.get("browser"), p.get("platform")) if x) or "unknown browser"
    return f"{s} ({p['model']})" if p.get("model") else s


def mismatch(old, new):
    """True when the profile is clearly another device: browser family, platform or model differ (each only when both
    report it). Browser versions never count — nor (v3.0.2) the screen: rotation, a new resolution or zoom, and the
    pairing screen measures it before the panel's page does (seen() keeps the latest instead)."""
    old, new = clean_profile(old), clean_profile(new)
    return any(old.get(k) and new.get(k) and old[k].lower() != new[k].lower() for k in ("browser", "platform", "model"))


def _write_json(path, obj):
    """Atomic (tmp + os.replace), created 0600 — like house_settings._save."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{secrets.token_hex(6)}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            json.dump(obj, f, indent=1, sort_keys=True)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _default():
    return {"v": 1, "accept": True, "lockOnCopy": False, "graceUntil": 0, "legacy": [], "legacyKiosk": None, "devices": {}, "agentPrev": {}}


class PanelDevices:
    """The paired tablets: one device per panel id (ids lowercased by the caller, like the Store's)."""

    def __init__(self, private_dir, clock=time.time):
        self.path = pathlib.Path(private_dir) / FILE
        self.clock = clock
        self.lock = threading.Lock()
        self.unreadable, self._tried = False, 0
        self.doc = self._load()

    # ---- file ---------------------------------------------------------------------------------------------------
    def _load(self):
        self._tried = self.clock()
        try:
            raw = self.path.read_bytes()   # (v3.0.2: bytes — text that isn't UTF-8 is a damaged file below, not a crash)
        except FileNotFoundError:
            self.unreadable = False
            return _default()
        except OSError:
            # (can't read it now: nobody new pairs, nobody's key passes — and (v3.0.2) nothing is saved over the real
            # file: _save refuses until a read succeeds again, so a passing disk hiccup never unpairs every panel)
            self.unreadable = True
            return {**_default(), "accept": False}
        self.unreadable = False
        try:
            d = json.loads(raw.decode("utf-8"))
            if not isinstance(d, dict) or not isinstance(d.get("devices"), dict):
                raise ValueError("doc")
        except (ValueError, RecursionError):   # (UnicodeDecodeError is a ValueError)
            # damaged (disk trouble, edited by hand): kept aside; every panel pairs again (fails closed)
            try:
                os.replace(self.path, self.path.with_name(f"{self.path.name}.bad-{int(self.clock())}"))
            except OSError:
                pass
            return _default()
        doc = _default()
        doc["accept"] = d.get("accept") is not False
        doc["lockOnCopy"] = d.get("lockOnCopy") is True
        g = d.get("graceUntil")
        doc["graceUntil"] = g if isinstance(g, (int, float)) and not isinstance(g, bool) else 0
        doc["legacy"] = [str(x) for x in d.get("legacy") or [] if isinstance(x, str)] if isinstance(d.get("legacy"), list) else []
        doc["legacyKiosk"] = d["legacyKiosk"] if isinstance(d.get("legacyKiosk"), str) else None
        ap = d.get("agentPrev")
        doc["agentPrev"] = {str(k): v for k, v in ap.items() if _token_ok(v)} if isinstance(ap, dict) else {}
        for pid, r in d["devices"].items():
            if isinstance(r, dict) and isinstance(r.get("cur"), str) and len(r["cur"]) == 64:
                hx = lambda v: [x for x in v if isinstance(x, str)] if isinstance(v, list) else []  # noqa: E731
                prev = r.pop("prev", None)   # (an early 3.0.2 file: "prev" + "prevUntil" → still valid as older)
                r.pop("prevUntil", None)
                r["older"] = hx(r.get("older")) or ([prev] if isinstance(prev, str) else [])
                r["late"], r["retired"] = hx(r.get("late")), hx(r.get("retired"))
                doc["devices"][str(pid)] = r
        return doc

    def _retry(self, now=False):
        """(v3.0.2) While the file can't be read: read it again (at most every RETRY_SECONDS unless now) — in place of
        the stand-in, whatever was changed on that is dropped. True when it is readable."""
        if self.unreadable and (now or self.clock() - self._tried >= RETRY_SECONDS):
            self.doc = self._load()
        return not self.unreadable

    def _save(self):
        if self.unreadable:   # (v3.0.2: never the empty stand-in over a file that's only unreadable; the change was
            self._retry(now=True)   # made on the stand-in, so it's refused even when the file reads again now)
            raise OSError(f"{FILE} can't be read: not saved")
        _write_json(self.path, self.doc)

    def readable(self):
        """(v3.0.2) Can panel-devices.json be read (tried again at most every RETRY_SECONDS)? While not, nothing about the
        panels' tablets is known: the Manager says so and changes nothing."""
        with self.lock:
            return self._retry()

    # ---- settings -----------------------------------------------------------------------------------------------
    def accept(self):
        """"Accept new panels": may a tablet ask to pair now?"""
        return self.doc["accept"]

    def set_accept(self, on):
        with self.lock:
            self.doc["accept"] = bool(on)
            self._save()

    def set_lock_on_copy(self, on):
        with self.lock:
            self.doc["lockOnCopy"] = bool(on)
            self._save()

    def status(self):
        """For the Manager: {accept, lockOnCopy, grace: bool, graceUntil, legacy: [pid], legacyKiosk}."""
        d = self.doc
        return {"accept": d["accept"], "lockOnCopy": d["lockOnCopy"], "grace": self.in_grace(), "graceUntil": d["graceUntil"],
                "legacy": list(d["legacy"]), "legacyKiosk": d["legacyKiosk"]}

    def forget_legacy_kiosk(self):
        with self.lock:
            if self.doc["legacyKiosk"] is not None:
                self.doc["legacyKiosk"] = None
                self._save()

    # ---- devices ------------------------------------------------------------------------------------------------
    def claimed(self, pid):
        return pid in self.doc["devices"]

    def devices(self):
        """{pid: {profile, pairedAt, lastSeen, lastIp, adopted, locked, copyAt}} — never a hash."""
        return {pid: {k: (dict(r.get("profile") or {}) if k == "profile" else r.get(k))
                      for k in ("profile", "pairedAt", "lastSeen", "lastIp", "adopted", "locked", "copyAt", "agentSeen")}
                for pid, r in self.doc["devices"].items()}

    def issue(self, pid, profile, ip, adopted=False):
        """A new device for this panel (an approved request, or an adoption); returns its key — the only time it is
        known. A device the panel had before is replaced (its keys count as copies from now on)."""
        key = secrets.token_urlsafe(24)
        now = self.clock()
        with self.lock:
            return self._issue(pid, key, now, profile, ip, adopted)

    def _issue(self, pid, key, now, profile, ip, adopted):
        old = self.doc["devices"].get(pid) or {}
        retired = [h for h in (old.get("retired") or []) + (old.get("late") or []) + (old.get("older") or []) + [old.get("cur")] if h]
        self.doc["devices"][pid] = {"cur": _hash(key), "older": [], "late": [], "lateUntil": 0, "retired": retired[-MAX_RETIRED:],
                                    "rotatedAt": now, "profile": clean_profile(profile), "pairedAt": now, "lastSeen": now,
                                    "lastIp": ip if isinstance(ip, str) else None, "adopted": bool(adopted),
                                    "locked": False, "copyAt": None}
        # (3.0.2 rev. 2 review: re-paired or re-approved without an unlink, the panel keeps its LED agent token — the
        # agent on its tablet stays pinned to it and isn't locked out with 403 token for the 2-minute re-pin window.
        # agentSeen stays too unless the new profile is clearly another tablet. Unlink drops both: a new token then.)
        t = old.get("agentToken")
        if _token_ok(t):
            self.doc["devices"][pid]["agentToken"] = t
        # (3.0.2 re-test: after an unlink, the token the agent may still hold — it takes the new one with this one)
        p = old.get("prevAgentToken") if old else self.doc["agentPrev"].get(pid)
        if _token_ok(p):
            self.doc["devices"][pid]["prevAgentToken"] = p
        self.doc["agentPrev"].pop(pid, None)
        if old.get("agentSeen") is True and not mismatch(old.get("profile"), profile):
            self.doc["devices"][pid]["agentSeen"] = True
        if pid in self.doc["legacy"]:
            self.doc["legacy"].remove(pid)
        self._save()
        return key

    def check(self, pid, key):
        """Is this the panel's device? "ok" (the current key), "prev" (the key last presented, while newer ones issued
        since are unseen: the tablet lost an answer — the caller forces a new key), "late" (served, but never a new key:
        a key superseded by a newer one already presented, within PREV_SECONDS — or an unseen key with a newer one issued
        after it), "copy" (a retired key — a late one past PREV_SECONDS too: copyAt recorded, the panel locked when
        lockOnCopy), "locked" (a known key of a locked panel), None (no device for this panel, or not one of its keys).
        (v3.0.2) The first time a newer key is presented, the keys before it become late, then retired."""
        h = _hash(key)
        if h is None:
            return None
        with self.lock:
            self._retry()
            r = self.doc["devices"].get(pid)
            if not r:
                return None
            now = self.clock()
            chain = (r.get("older") or []) + [r["cur"]]
            i = next((n for n, x in enumerate(chain) if _eq(h, x)), None)
            late = any(_eq(h, x) for x in r.get("late") or [])
            if i is None and not late and not any(_eq(h, x) for x in r.get("retired") or []):
                return None
            if r.get("locked"):
                return "locked"
            if i is not None:
                last = i == len(chain) - 1
                if i:   # (a newer key presented the first time: the ones before it are late; the late ones retired)
                    r.update(retired=((r.get("retired") or []) + (r.get("late") or []))[-MAX_RETIRED:], late=chain[:i],
                             lateUntil=now + PREV_SECONDS, older=chain[i:-1], fresh=last)
                    try:
                        self._save()
                    except OSError:
                        pass   # (in memory it holds; the next save writes it)
                if last:
                    return "ok"
                # (v3.0.2: only a key that was the newest when it was presented may ask for a new one at once — the
                # tablet lost the answer. One with a newer key issued after it, to whoever asked for that, is served
                # but gets none ("late") — else a copy checking in alongside the tablet would leapfrog it forever, each
                # one's key making the other's "prev" again. It may ask once ROTATE_SECONDS have passed with that newer
                # key never presented: a tablet whose parallel requests crossed answers isn't left on one key for good,
                # while a copy that is still checking in presents its key long before.)
                if i == 0 and r.get("fresh") is False and now - (r.get("rotatedAt") or 0) >= ROTATE_SECONDS:
                    r["fresh"] = True
                return "prev" if i == 0 and r.get("fresh") is not False else "late"
            if late and now < (r.get("lateUntil") or 0):
                return "late"   # (a request sent before the newer key reached the tablet: served, never a new key)
            r["copyAt"] = now
            if self.doc["lockOnCopy"]:
                r["locked"] = True
            try:
                self._save()
            except OSError:
                pass
            return "copy"

    def rotate(self, pid, force=False):
        """A new key for the panel after a good visit — never after "late" (the caller sends it in the cookie). The keys
        before it stay valid (check() → "prev") until it — or one issued after it — is presented. None when there's no device, it is locked,
        or (unless force) it rotated less than ROTATE_SECONDS ago — force: the tablet came back with "prev" (it lost
        the new key). (v3.0.2: a forced rotation retires nothing — the key just presented stays valid too.)"""
        now = self.clock()
        with self.lock:
            r = self.doc["devices"].get(pid)
            if not r or r.get("locked") or (not force and now - (r.get("rotatedAt") or 0) < ROTATE_SECONDS):
                return None
            key = secrets.token_urlsafe(24)
            if not r.get("older"):
                r["fresh"] = True   # (the current key was presented as the newest: it may ask again if this answer is lost)
            older = (r.get("older") or []) + [r["cur"]]
            while len(older) > MAX_OLDER:   # (forget — never retire — the oldest unseen one; [0] is the one last presented)
                del older[1]
            r.update(older=older, cur=_hash(key), rotatedAt=now)
            self._save()
        return key

    def seen(self, pid, ip, profile):
        """A good visit: remember when and from where. True when the profile is clearly another device than the one
        paired (log it + a notice; never blocks). A device adopted without a profile takes this one."""
        now = self.clock()
        with self.lock:
            r = self.doc["devices"].get(pid)
            if not r:
                return False
            p = clean_profile(profile)
            changed = ip != r.get("lastIp") or now - (r.get("lastSeen") or 0) >= SEEN_WRITE
            odd = bool(r.get("profile")) and mismatch(r["profile"], p)
            if not r.get("profile") and p:
                r["profile"], changed = p, True
            elif not odd and p.get("screen") and r["profile"].get("screen") != p["screen"]:
                # (v3.0.2: the screen as the panel's page measures it — the Manager's "Its tablet → Screen" = Status)
                r["profile"], changed = {**r["profile"], "screen": p["screen"]}, True
            r["lastSeen"], r["lastIp"] = now, ip if isinstance(ip, str) else None
            if changed:
                self._save()
            return odd

    def unlink(self, pid):
        """The device let go (Manager → Unlink device): its keys stop working, the panel keeps its settings and is
        unclaimed. False when it had none."""
        with self.lock:
            r = self.doc["devices"].pop(pid, None)
            if r is None:
                return False
            # (3.0.2 re-test: the agent token goes, but the one the agent holds is kept as the previous one — the
            # new token the re-paired panel gets is handed over together with it, so the agent takes it at once)
            p = r.get("agentToken") if _token_ok(r.get("agentToken")) else r.get("prevAgentToken")
            if _token_ok(p):
                self.doc["agentPrev"][pid] = p
            self._save()
            return True

    def agent_tokens(self, pid):
        """(3.0.2 re-test) (agent_token(pid), the token an unlink replaced or None). OSError as agent_token."""
        t = self.agent_token(pid)
        with self.lock:
            r = self.doc["devices"].get(pid) or {}
            p = r.get("prevAgentToken")
            return t, (p if t and _token_ok(p) and p != t else None)

    def agent_token(self, pid):
        """(v3.0.2 rev. 2, mockups/AGENT-AUTOCONFIG.md) The LED agent's token for this panel's tablet: a random 32-byte
        urlsafe secret, made (and saved) on the first ask, the same until the device is unlinked (a re-pair keeps it:
        issue() carries it over, so the agent stays pinned). None when the panel has no device. OSError when it can't be saved. Never logged."""
        with self.lock:
            r = self.doc["devices"].get(pid)
            if not r:
                return None
            t = r.get("agentToken")
            if not (isinstance(t, str) and len(t) >= 43):
                r["agentToken"] = t = secrets.token_urlsafe(32)
                try:
                    self._save()
                except OSError:
                    r.pop("agentToken", None)
                    raise
            return t

    def agent_seen(self, pid):
        """(v3.0.2 rev. 2) An LED agent answered on this panel's tablet (ok/off): remembered with the device (the Manager
        then says "Not found" when it stops answering). Saved once. False when the panel has no device."""
        with self.lock:
            r = self.doc["devices"].get(pid)
            if not r:
                return False
            if r.get("agentSeen") is not True:
                r["agentSeen"] = True
                try:
                    self._save()
                except OSError:
                    r.pop("agentSeen", None)
            return True

    def move(self, pid, to):
        """"Move this device to…": the device of `pid` now belongs to the unclaimed panel `to` (the caller deletes the
        empty panel left behind). False when pid has no device, `to` already has one, or they're the same."""
        with self.lock:
            d = self.doc["devices"]
            if pid == to or pid not in d or to in d:
                return False
            d[to] = d.pop(pid)
            self._save()
            return True

    def rename(self, pid, to):
        """A panel renamed (its id changed): its device goes along. Same rules as move."""
        return self.move(pid, to)

    def retrust(self, pid):
        """"Re-trust this device" after a copy alert: unlocked, the alert cleared; the tablet holding the current key
        goes on. False when the panel has no device."""
        with self.lock:
            r = self.doc["devices"].get(pid)
            if not r:
                return False
            r["locked"], r["copyAt"] = False, None
            self._save()
            return True

    # ---- the upgrade's grace period -----------------------------------------------------------------------------
    def in_grace(self):
        return self.clock() < (self.doc["graceUntil"] or 0)

    def adoptable(self, pid):
        """A panel from before 3.0.2 with no device yet, during the grace period."""
        return pid in self.doc["legacy"] and pid not in self.doc["devices"] and self.in_grace()

    def adopt(self, pid, profile, ip):
        """The first visit of a legacy panel during the grace period: it gets a device key (returned; log the
        adoption). None when not adoptable — (v3.0.2) decided under the lock: of two first visits at once, one wins."""
        key, now = secrets.token_urlsafe(24), self.clock()
        with self.lock:
            if not self.adoptable(pid):
                return None
            return self._issue(pid, key, now, profile, ip, True)

    def lock_now(self):
        """"Lock all panels now": the grace period ends; panels not adopted yet must pair."""
        with self.lock:
            self.doc["graceUntil"], self.doc["legacy"] = 0, []
            self._save()

    def start_grace(self, legacy, seconds=GRACE_SECONDS, kiosk=None):
        """(the migration) The panels that exist now are adopted on their first visit for `seconds`."""
        with self.lock:
            self.doc["legacy"] = sorted({str(p) for p in legacy})
            self.doc["graceUntil"] = self.clock() + seconds if seconds else 0
            if kiosk is not None:
                self.doc["legacyKiosk"] = kiosk
            self._save()


class PairingRequests:
    """The tablets on the "Connect this panel" screen right now (memory only).

    open → the tablet keeps {id, secret} and polls; the Manager lists the requests (never the secret or the code), the
    admin types the code shown on the tablet → approve. A request not polled for POLL_SECONDS is gone."""

    def __init__(self, clock=time.time):
        self.clock = clock
        self.lock = threading.Lock()
        self.reqs = {}

    @staticmethod
    def _code():
        return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LEN))

    def _prune(self, now):
        for rid in [rid for rid, r in self.reqs.items() if now - r["polled"] >= POLL_SECONDS]:
            del self.reqs[rid]

    def _renew(self, r, now):
        if now - r["codeAt"] >= CODE_SECONDS:
            r["code"], r["codeAt"] = self._code(), now   # (the wrong count stays: no fresh tries by waiting)

    def open(self, ip, profile):
        """A tablet opened the pairing screen: {id, secret, code, expiresIn}, or None when there are MAX_REQUESTS. (v3.0.2:
        an address that has MAX_PER_IP already — reloads — loses its oldest one instead of being refused.) The caller
        checks PanelDevices.accept() first."""
        now = self.clock()
        with self.lock:
            self._prune(now)
            mine = sorted((r for r in self.reqs.values() if r["ip"] == ip and r["result"] is None), key=lambda r: r["openedAt"])
            for r in mine[:max(0, len(mine) - MAX_PER_IP + 1)]:
                del self.reqs[r["id"]]
            if len(self.reqs) >= MAX_REQUESTS:
                return None
            rid, secret = secrets.token_hex(8), secrets.token_urlsafe(16)
            r = {"id": rid, "secret": _hash(secret), "ip": ip, "profile": clean_profile(profile), "openedAt": now,
                 "polled": now, "code": self._code(), "codeAt": now, "wrong": 0, "result": None}
            self.reqs[rid] = r
            return {"id": rid, "secret": secret, "code": r["code"], "expiresIn": CODE_SECONDS}

    def _mine(self, rid, secret):
        r = self.reqs.get(rid) if isinstance(rid, str) else None
        return r if r and _eq(_hash(secret), r["secret"]) else None

    def poll(self, rid, secret):
        """The tablet asks again (every few seconds): {"state": "waiting", "code", "expiresIn"} (the code renewed after
        CODE_SECONDS), {"state": "approved", "result": what approve stored} (once — the request is gone after), or
        {"state": "gone"} (dropped, rejected, cancelled, or not this tablet's)."""
        now = self.clock()
        with self.lock:
            self._prune(now)
            r = self._mine(rid, secret)
            if not r:
                return {"state": "gone"}
            if r["result"] is not None:
                del self.reqs[rid]
                return {"state": "approved", "result": r["result"]}
            r["polled"] = now
            self._renew(r, now)
            return {"state": "waiting", "code": r["code"], "expiresIn": max(1, int(CODE_SECONDS - (now - r["codeAt"])))}

    def leave(self, rid, secret):
        """The tablet left the screen. True when its request was there."""
        with self.lock:
            if self._mine(rid, secret):
                del self.reqs[rid]
                return True
            return False

    def approve(self, rid, code, result=None):
        """The admin typed the tablet's code: "ok" | "wrong" | "cancelled" (the MAX_WRONG-th wrong code: the request is
        gone — log it, a notice) | "empty" (no code: not counted) | "gone". On "ok" `result` is stored for the tablet's next poll; a callable is called
        first with the request (as list() shows it) and its return value stored — it may raise (e.g. the name is
        claimed), then nothing changes and the request waits on."""
        now = self.clock()
        with self.lock:
            self._prune(now)
            r = self.reqs.get(rid) if isinstance(rid, str) else None
            if not r or r["result"] is not None:
                return "gone"
            self._renew(r, now)
            if not isinstance(code, str) or not re.sub(r"[\s-]", "", code):
                return "empty"   # (v3.0.2: nothing typed is no try — the caller asks for the code)
            typed = re.sub(r"[\s-]", "", code).upper() if isinstance(code, str) else ""
            ok = len(typed) == CODE_LEN and all(c in CODE_ALPHABET for c in typed)   # (v3.0.2: else compare_digest raises on non-ASCII)
            if not (ok and _eq(typed, r["code"])):
                r["wrong"] += 1
                if r["wrong"] >= MAX_WRONG:
                    del self.reqs[rid]
                    return "cancelled"
                return "wrong"
            res = result(self._public(r)) if callable(result) else result
            r["result"] = res if res is not None else {}
            r["polled"] = now   # (the tablet has POLL_SECONDS from now to fetch it)
            return "ok"

    def reject(self, rid):
        """The admin turned it down: the tablet's next poll says gone. True when it was there."""
        with self.lock:
            return self.reqs.pop(rid, None) is not None if isinstance(rid, str) else False

    @staticmethod
    def _public(r):
        return {"id": r["id"], "ip": r["ip"], "profile": dict(r["profile"]), "openedAt": r["openedAt"], "wrong": r["wrong"]}

    def list(self):
        """For the Manager, oldest first: [{id, ip, profile, openedAt, wrong}] — never the secret or the code."""
        now = self.clock()
        with self.lock:
            self._prune(now)
            return [self._public(r) for r in sorted(self.reqs.values(), key=lambda r: r["openedAt"]) if r["result"] is None]

    def get(self, rid):
        with self.lock:
            r = self.reqs.get(rid) if isinstance(rid, str) else None
            return self._public(r) if r else None


class PanelNotices:
    """The Manager's pairing notices (copy detected, repeated blocked visits, profile mismatch, 5 wrong codes…): they
    stay until the admin marks them read. No pushes. An unread notice of the same kind and panel is counted up instead
    of added again."""

    def __init__(self, private_dir, clock=time.time):
        self.path = pathlib.Path(private_dir) / NOTICES_FILE
        self.clock = clock
        self.lock = threading.Lock()

    def _load(self):
        try:
            d = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError, RecursionError):
            return []
        return [n for n in d if isinstance(n, dict) and isinstance(n.get("id"), str)] if isinstance(d, list) else []

    def add(self, kind, panel=None, ip=None, agent=None):
        """A notice (or the same unread one counted up); returns it. OSError when private/ can't be written."""
        now = self.clock()
        with self.lock:
            ns = self._load()
            n = next((n for n in ns if not n.get("read") and n.get("kind") == kind and n.get("panel") == panel), None)
            if n:
                n.update(at=now, ip=ip, agent=agent, count=int(n.get("count") or 1) + 1)
                ns.remove(n)
            else:
                n = {"id": secrets.token_hex(6), "kind": str(kind)[:32], "panel": panel, "at": now, "ip": ip,
                     "agent": str(agent)[:120] if agent else None, "count": 1, "read": False}
            ns = (ns + [n])[-MAX_NOTICES:]
            _write_json(self.path, ns)
            return dict(n)

    def list(self):
        """Newest first."""
        with self.lock:
            return list(reversed(self._load()))

    def unread(self):
        """The badge's number."""
        return sum(not n.get("read") for n in self.list())

    def mark_read(self, nid=None):
        """One notice (nid) or all of them (None) read; returns how many changed."""
        with self.lock:
            ns, k = self._load(), 0
            for n in ns:
                if not n.get("read") and (nid is None or n["id"] == nid):
                    n["read"], k = True, k + 1
            if k:
                _write_json(self.path, ns)
            return k


def migrate_v302(data_dir, store, clock=time.time, default_kiosk="skypane", log=None):
    """Once (DATA_DIR/house/.pairing-v302): pairing replaces the built-in main panel.

    1. main's "may switch" rule (settings.switchRule / neverSwitch) → house/switch-rule.json, unless that exists;
    2. main's FreeKiosk name (default_kiosk when main had none) → panel-devices.json legacyKiosk;
    3. main's settings removed with store.remove("main") (server.Store: a last backup is kept in backups/);
    4. an upgrade (some panel file existed): the other panels are legacy, adopted on their first visit for
       GRACE_SECONDS; a fresh install: no grace period.
    `store` needs panel_ids(), get(pid) -> {"exists", "data"} and remove(pid) (server.Store). Run it after
    App._keep_old_kiosk_name. Returns a summary for the log: {"ran": False} when it ran before, else
    {"ran": True, "upgrade", "legacy": [pid], "ruleMoved", "mainRemoved", "legacyKiosk", "graceUntil"}."""
    try:
        from service import switch_rule
    except ImportError:  # pragma: no cover  (run from inside service/)
        import switch_rule
    data_dir = pathlib.Path(data_dir)
    guard = data_dir / "house" / GUARD
    if guard.exists():
        return {"ran": False}
    ids = list(store.panel_ids())
    main = store.get("main")
    settings = (main["data"].get("settings") or {}) if main.get("exists") else {}
    settings = settings if isinstance(settings, dict) else {}
    rule, moved = switch_rule.SwitchRule(data_dir / "house"), False
    if not rule.exists() and any(k in settings for k in SWITCH_KEYS):
        rule.save(settings)
        moved = True
    kiosk = (settings.get("kioskName") or default_kiosk) if main.get("exists") else None
    dev = PanelDevices(data_dir / "private", clock=clock)
    legacy = [p for p in ids if p != "main"]
    upgrade = bool(ids)
    # (v3.0.2: saved before main goes — a crash in between must not lose main's FreeKiosk name; a rerun keeps it)
    dev.start_grace(legacy if upgrade else [], GRACE_SECONDS if upgrade else 0, kiosk)
    removed = bool(main.get("exists")) and bool(store.remove("main"))
    guard.parent.mkdir(parents=True, exist_ok=True)
    guard.write_text("3.0.2\n", encoding="utf-8")
    out = {"ran": True, "upgrade": upgrade, "legacy": legacy, "ruleMoved": moved, "mainRemoved": removed,
           "legacyKiosk": kiosk, "graceUntil": dev.doc["graceUntil"]}
    if log:
        log(f"pairing (3.0.2): {'upgrade' if upgrade else 'fresh install'}; main panel {'removed' if removed else 'absent'}"
            f"{', its switch rule moved to house/switch-rule.json' if moved else ''}"
            f"{f'; {len(legacy)} panel(s) adopted on their first visit for 24 h' if upgrade else ''}")
    return out
