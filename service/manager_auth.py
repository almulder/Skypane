"""The Manager page's logins (accounts; several admins and an owner: v2.7.0): the first account made on the
first visit to /manage is the **owner** (an admin); admins add the other logins, choose what each may do, and may make
another login an admin.

  DATA_DIR/private/manager-users.json   {"v": 2, "users": [{"user", "role" ("admin" | "user"), "salt", "hash" (scrypt;
                                         null = the password was reset: a sign-in code waits), "kdf", "lid", "created",
                                         "pwAt" (when the password was last set), "perms" (role "user" only),
                                         "admin": true (an admin who isn't the owner — see below), "reset" (while a
                                         one-time sign-in code waits), "notices" (e.g. "your password was reset by …")}]}

Owner and admins (v2.7.0): the owner is users[0] with role "admin" — always an admin, never removed
or demoted by anyone; it may hand ownership to another admin. Every other admin is stored as role "user" with
"admin": true (its perms kept): an older release, which allows exactly one role "admin", then still reads the file and
sees them as plain users (a rollback never locks everyone out). The rules (who may do what to whom) are all in here:
  add a login, give / take admin rights   any admin (never on the owner)
  remove a login                          any admin (never the owner; itself: yes)
  rename                                  any admin (the owner only by the owner)
  a user's new password                   any admin types it (4+)
  an admin's / the owner's password       any other admin makes a one-time sign-in code (12 letters, an hour, 5 tries);
                                          the old password and every cookie stop at once; the person sets a new one
                                          on the sign-in page — nobody else ever knows an admin's password
  unlock                                  any admin (an admin's lockout too)
  hand over ownership                     the owner, to another admin
Acting on an admin (rights, password code, unlock), removing a login and handing over ownership need the acting
admin's own password again ("confirm it's you"): it opens a 10-minute window for that cookie (memory only).
  DATA_DIR/private/manager-lock.json    wrong-password counts per login name {"v": 2, "by": {sha256 of the name: …}}
  DATA_DIR/private/manager-secret       32 random bytes that sign the login cookies — all three mode 0600
  DATA_DIR/private/manager-login.json   the single login from before accounts: copied into manager-users.json on the
                                         first start (same name, password and cookies) and then left alone (an older
                                         release still finds it after a rollback)

A login cookie = "<payload>.<signature>": payload {"u": user, "l": lid, "e": expiry}, HMAC-SHA256 with the secret. It
survives a restart of Skypane (nothing kept in memory) and is refused once that login's password was changed or
reset (another "lid"), the login was removed, or after IDLE seconds without use (the server hands out a fresh one while
it's in use).
Wrong passwords (counted on disk, per login name, from any device): 5 in a row → locked 5 minutes; 5 more → 10 minutes;
5 more → locked until an admin unlocks it (another admin for an admin) or the reset command below. Names that don't exist are
counted the same way, so the answers never tell which names are real. A right password clears the count.
Signing out also blocks that cookie on the server (memory; a restart forgets it, the cookie still runs out in 30 min).
Forgot the password and no other admin can help (Unraid terminal): `docker exec -it skypane python
service/reset_login.py [--user NAME]` — clears only that login's password (default: the owner; the names, the other
logins and every setting stay) and either asks for a new one right there or prints a one-time code to set it on the
sign-in page.
Permissions: PERMISSIONS below (add more there); an admin may do everything. Caller.can(perm, panel) answers.
"""
import base64
import hashlib
import hmac
import json
import os
import pathlib
import re
import secrets
import threading
import time

USERS = "manager-users.json"
LOGIN_V1 = "manager-login.json"
SECRET = "manager-secret"
LOCKFILE = "manager-lock.json"
IDLE = 30 * 60
USER_RE = re.compile(r"[A-Za-z0-9._@-]{1,40}")
PANEL_RE = re.compile(r"[a-z][a-z0-9_-]{0,31}")   # (server.py's panel names, kept lower case)
MIN_PASSWORD = {"admin": 8, "user": 4}           #
MAX_PASSWORD = 128
MAX_USERS = 50
MAX_PANELS = 64
TRIES = 5                 # wrong passwords in a row (any device) before each lockout
LOCKS = (5 * 60, 10 * 60)  # the 1st and 2nd lockout; the 3rd lasts until the admin / the reset command
QUIET_RESET = 24 * 3600    # a day without a wrong password: the count (not the last lock) starts again
MAX_UNKNOWN = 300          # names that aren't logins kept in the lock file (the oldest are forgotten first)
SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1}
CODE_TTL = 3600            # a reset code works for an hour
CODE_TRIES = 5             # wrong codes before it stops working (run the reset command again)
CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # (no 0/O, 1/I)
CONFIRM_TTL = 10 * 60      # "confirm it's you": the acting admin's own password opens this window for its sign-in
CODES_PER_HOUR = 5         # sign-in codes one admin may make in an hour (counted by its stable id: a rename doesn't reset it)
CODE_TRIES_ALL = 20        # wrong tries of one code (all devices) before it dies — CODE_TRIES per device
CODE_CLIENT = (10, 10 * 60)   # wrong codes from one address in that many seconds: that address waits
CODE_FLOOD = (200, 10 * 60)   # wrong codes from everywhere: codes refused a while — never the reset command's own
OWNER_HOLD = 24 * 3600     # a login that signed in with a code can't hand over ownership for this long
NOTICES_MAX = 5

# What a user may be allowed (the admin always may). Add new ones here: the Manager lists them with these words.
# A user gets its own panel and nothing else until the admin ticks more. kind "panel": one panel
# name or "" (none yet); "bool": yes / no; a tuple: one of those choices (the first = the default).
PERMISSIONS = {
    "panel": ("panel", "Their panel"),
    "guest_wifi": ("bool", "Guest Wi-Fi settings"),
    "backgrounds": (("none", "upload", "full"), "Manage backgrounds"),
    "icons": ("bool", "Manage icons"),
    "cards": ("bool", "Manage cards"),
    "devices": ("bool", "Manage devices"),
    "cameras": ("bool", "Manage cameras"),
    "panels": (("own", "all"), "Manage panels"),
    # (v2.9.1) switching devices from the Manager — off until an admin ticks it; admins always may
    "switch": ("bool", "Switch devices from the Manager"),
}
CHOICE_WORDS = {"own": "Their own panel", "all": "All panels", "none": "No",
                "upload": "Upload only (and rename / remove their own)", "full": "Full"}
OLD_PERMS = ("upload_pictures", "edit_devices", "edit_settings")   # (before v2.3: read as the new ones)


def default_perms():
    """A new user: no panel yet, nothing else (safer)."""
    return {k: ("" if kind == "panel" else False if kind == "bool" else kind[0]) for k, (kind, _) in PERMISSIONS.items()}


def upgrade_perms(raw):
    """The permissions from before v2.3 ("panels": a list or "all", upload_pictures, edit_devices,
    edit_settings) in the new words; new ones come back as they are. Never more than the old ones allowed (a list of
    several panels keeps the first one)."""
    if not isinstance(raw, dict) or not (any(k in raw for k in OLD_PERMS) or isinstance(raw.get("panels"), list)):
        return raw
    out = {k: v for k, v in raw.items() if k not in OLD_PERMS and k != "panels"}
    old = raw.get("panels")
    if old == "all":
        out["panels"] = "all"
    elif isinstance(old, list) and old and isinstance(old[0], str):
        out["panel"] = old[0]
    if raw.get("upload_pictures") is True:
        out["backgrounds"], out["icons"] = "full", True
    if raw.get("edit_devices") is True:
        out["devices"] = out["cameras"] = True
    return out


def clean_perms(raw, base=None):
    """(perms, None) or (None, reason): only known permissions, each of the right kind; `base` = the current ones
    (a change may send only some)."""
    raw = upgrade_perms(raw)
    if not isinstance(raw, dict):
        return None, "permissions: an object"
    out = default_perms()
    for k, v in (upgrade_perms(base) if isinstance(base, dict) else {}).items():
        if k in out:
            out[k] = v
    for k, v in raw.items():
        if k not in PERMISSIONS:
            return None, f"unknown permission {str(k)[:40]!r}"
        kind = PERMISSIONS[k][0]
        if kind == "bool":
            if not isinstance(v, bool):
                return None, f"{k}: yes or no"
            out[k] = v
        elif kind == "panel":
            if not isinstance(v, str) or not (v == "" or PANEL_RE.fullmatch(v.lower())):
                return None, f"{k}: a panel name"
            out[k] = v.lower()
        else:
            if v not in kind:
                return None, f"{k}: " + " or ".join(kind)
            out[k] = v
    return out, None


class Caller:
    """Who is calling a Manager API: the login's name, its role ("admin" for every admin, the owner too), whether it is
    the owner, and what it may do."""
    __slots__ = ("user", "role", "perms", "owner")

    def __init__(self, user, role, perms, owner=False):
        self.user, self.role, self.owner = user, role, bool(owner) and role == "admin"
        self.perms = {} if role == "admin" else (clean_perms(perms)[0] or default_perms())

    @property
    def admin(self):
        return self.role == "admin"

    def level(self, perm):
        """A choice permission's value (the last choice — "all" / "full" — for the admin)."""
        if self.admin:
            return PERMISSIONS[perm][0][-1]
        return self.perms.get(perm)

    def can(self, perm=None, panel=None):
        """perm "admin" = the admin only; a yes / no permission of PERMISSIONS; "backgrounds": upload only or full;
        "panels": it sees at least one panel; with `panel`: it sees that panel too (its own, or "all"). Anything
        unknown is refused."""
        if self.admin:
            return True
        if perm == "admin":
            return False
        if perm == "backgrounds":
            if self.perms.get("backgrounds") not in ("upload", "full"):
                return False
        elif perm == "panels":
            if panel is None:
                return self.perms.get("panels") == "all" or bool(self.perms.get("panel"))
        elif perm is not None:
            if PERMISSIONS.get(perm, ("",))[0] != "bool" or self.perms.get(perm) is not True:
                return False
        if panel is not None:
            return self.sees(panel)
        return True

    def sees(self, panel):
        if self.admin or self.perms.get("panels") == "all":
            return True
        return isinstance(panel, str) and bool(self.perms.get("panel")) and panel.lower() == self.perms["panel"]

    def panels(self, ids):
        """Only the panels (of `ids`) this login sees."""
        return [p for p in ids if self.sees(p)]

    def public(self):
        if self.admin:
            perms = {k: ("" if kind == "panel" else True if kind == "bool" else kind[-1]) for k, (kind, _) in PERMISSIONS.items()}
        else:
            perms = dict(self.perms)
        return {"user": self.user, "role": self.role, "admin": self.admin, "owner": self.owner, "perms": perms}


def _is_admin(r):
    """An account record that is an admin: the owner (role "admin") or a login with "admin": true."""
    return r["role"] == "admin" or (r["role"] == "user" and r.get("admin") is True)


def _caller_of(users, r):
    adm = _is_admin(r)
    return Caller(r["user"], "admin" if adm else "user", {} if adm else dict(r.get("perms") or {}), owner=bool(users) and r is users[0])


def _write_private(path, data, exclusive=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    if exclusive:   # the first login: only one browser can create it
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        return
    tmp = path.with_name(f".{path.name}.{secrets.token_hex(6)}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


def _hash(password, salt, kdf=None):
    k = kdf or SCRYPT
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, maxmem=64 * 1024 * 1024, dklen=32,
                          n=int(k["n"]), r=int(k["r"]), p=int(k["p"]))


def _key(name):
    """A login name's place in the lock file (not the typed text itself: that might be a password typed in the
    wrong box)."""
    n = name.lower() if isinstance(name, str) and len(name) <= 200 else ""
    return hashlib.sha256(("lock:" + n).encode("utf-8")).hexdigest()[:32]


def check_new(user, password, role="admin"):
    """None when acceptable, else the reason."""
    if not isinstance(user, str) or not USER_RE.fullmatch(user):
        return "username: 1-40 letters, digits or . _ @ -"
    low = MIN_PASSWORD.get(role, MIN_PASSWORD["admin"])
    if not isinstance(password, str) or not low <= len(password) <= MAX_PASSWORD or not password.strip():
        return f"password: {low} to {MAX_PASSWORD} characters"
    return None


def _norm_code(code):
    return re.sub(r"[\s-]", "", code).upper() if isinstance(code, str) and len(code) <= 64 else ""


class Damaged(Exception):
    """The accounts file can't be read: nobody signs in until it's fixed (never "no login yet")."""


class ManagerAuth:
    def __init__(self, private_dir, now=time.time, warn=lambda msg: None):
        self.dir = pathlib.Path(private_dir)
        self.now, self.warn = now, warn
        self.lock = threading.RLock()
        self.verify_mutex = threading.Lock()   # one password check / lock change at a time (verify)
        self.revoked = {}     # signature of a signed-out cookie -> its expiry (memory: until it would run out anyway)
        self._dummy = (secrets.token_bytes(16), secrets.token_bytes(32))   # (an unknown name costs a hash too)
        self._warned = False
        self.stepped = {}     # "login:lid:sign-in id" -> until when "confirm it's you" holds (memory only)
        self.revoked_sids = {}   # "login:lid:sign-in id" of signed-out sign-ins -> until when (memory only)
        self._codes_made = {}   # an admin's stable id -> times it made a sign-in code (memory only)
        self._code_fails = {}   # client address -> times of its wrong sign-in codes
        self._code_all = []     # times of wrong sign-in codes from everywhere (the safety cap)
        self.on_event = lambda kind, target, **data: None   # (server.py: the activity log)

    # ---- the accounts file ----
    @staticmethod
    def _good_record(r):
        if not isinstance(r, dict) or r.get("role") not in ("admin", "user"):
            return False
        if not isinstance(r.get("user"), str) or not USER_RE.fullmatch(r["user"]):
            return False
        if not all(isinstance(r.get(k), str) for k in ("salt", "lid")) or not (r.get("hash") is None or isinstance(r.get("hash"), str)):
            return False
        try:
            bytes.fromhex(r["salt"]), bytes.fromhex(r["hash"] or "")
        except ValueError:
            return False
        if "kdf" in r and not (isinstance(r["kdf"], dict) and all(isinstance(r["kdf"].get(k), int) and 0 < r["kdf"][k] <= 2 ** 20 for k in ("n", "r", "p"))):
            return False
        if r["role"] == "user" and clean_perms(r.get("perms"))[0] is None:
            return False
        if "admin" in r and (r["role"] != "user" or not isinstance(r["admin"], bool)):
            return False
        return True

    def _users(self):
        """The accounts (the admin first), [] = none yet. Raises Damaged when the file can't be trusted."""
        with self.lock:
            p = self.dir / USERS
            try:
                raw = p.read_text(encoding="utf-8")
            except FileNotFoundError:
                return self._migrate()
            except OSError:
                raise Damaged()
            try:
                d = json.loads(raw)
                users = d["users"] if isinstance(d, dict) and d.get("v") == 2 else None
                if not isinstance(users, list) or not all(self._good_record(r) for r in users):
                    raise ValueError("bad record")
                if users and (users[0]["role"] != "admin" or sum(r["role"] == "admin" for r in users) != 1):
                    raise ValueError("not one admin")
                if len({r["user"].lower() for r in users}) != len(users):
                    raise ValueError("same name twice")
                return users
            except (ValueError, KeyError, TypeError):
                if not self._warned:
                    self._warned = True
                    self.warn(f"manager: {USERS} can't be read — nobody can sign in until it's fixed or removed")
                raise Damaged()

    def _migrate(self):
        """Before accounts there was one login (manager-login.json): it becomes the admin — same name, password and
        cookies (its lid). That file stays as it was (a rollback to an older release still finds it)."""
        try:
            raw = (self.dir / LOGIN_V1).read_text(encoding="utf-8")
        except FileNotFoundError:
            return []
        except OSError:
            raise Damaged()
        try:
            d = json.loads(raw)
            rec = {"user": d["user"], "role": "admin", "salt": d["salt"], "hash": d["hash"], "lid": d["lid"],
                   "created": int(d.get("created") or 0)}
            if not self._good_record(rec) or not rec["hash"]:
                raise ValueError("bad")
        except (ValueError, KeyError, TypeError):
            raise Damaged()   # (a damaged old login must not turn into "make a new one")
        rec["kdf"] = {"n": 2 ** 14, "r": 8, "p": 1}   # (what the single login always used)
        try:
            _write_private(self.dir / USERS, json.dumps({"v": 2, "users": [rec]}).encode(), exclusive=True)
        except FileExistsError:
            return self._users()
        self.warn(f"manager: the login {rec['user']!r} is now the admin account ({USERS})")
        return [rec]

    def _save_users(self, users):
        # ("w": a fresh value each time, so every save writes new content — a save for a name that isn't a login costs the
        # same as one that changed something, also where a virus scanner rereads changed files; older releases ignore it)
        _write_private(self.dir / USERS, json.dumps({"v": 2, "users": users, "w": secrets.token_hex(4)}).encode())

    @staticmethod
    def _find(users, name):
        """The account with this name (any upper / lower case), or None. Looks at every one (same time for any name)."""
        found = None
        if isinstance(name, str) and len(name) <= 200:
            n = name.lower().encode("utf-8")
            for r in users:
                if hmac.compare_digest(r["user"].lower().encode("utf-8"), n):
                    found = r
        return found

    def _record(self, user, password, role, **extra):
        salt = secrets.token_bytes(16)
        return {"user": user, "role": role, "salt": salt.hex(), "hash": _hash(password, salt).hex(), "kdf": dict(SCRYPT),
                "lid": secrets.token_hex(8), "created": int(self.now()), "pwAt": int(self.now()), "uid": secrets.token_hex(6), **extra}

    @staticmethod
    def _still_admin(users, by):
        """(lock held) The acting login is (still) an admin in the file as it is now."""
        for r in users:
            if r["user"].lower() == by.user.lower():
                return _is_admin(r)
        return False

    def _uid(self, name):
        """A login's stable id (kept through renames; logins from before v2.7.0 get one now)."""
        out = []

        def put(users, r):
            if not isinstance(r.get("uid"), str):
                r["uid"] = secrets.token_hex(6)
            out.append(r["uid"])
        self._modify(name, put)
        return out[0] if out else "?"

    def _attempt(self, r):
        """(lock held) A wrong sign-in code typed for this login: it is told at its next sign-in (one notice an hour,
        counted)."""
        now = int(self.now())
        for n in r.get("notices") or []:
            if isinstance(n, dict) and n.get("kind") == "code-wrong" and n.get("at", 0) > now - 3600:
                n["count"] = int(n.get("count") or 1) + 1
                return
        self._notice(r, "code-wrong", None)
        r["notices"][-1]["count"] = 1

    def _fresh_password(self, r, fresh):
        """(lock held) A record takes a new password: new salt / hash / lid (every cookie stops), no code waiting."""
        r.update({k: fresh[k] for k in ("salt", "hash", "kdf", "lid", "pwAt")})
        r.pop("reset", None)

    def _notice(self, r, kind, by):
        """(lock held) Something the login is told at its next sign-in (who reset its password…)."""
        n = [x for x in (r.get("notices") or []) if isinstance(x, dict)][-(NOTICES_MAX - 1):]
        n.append({"id": secrets.token_hex(4), "kind": kind, "by": by, "at": int(self.now())})
        r["notices"] = n

    def exists(self):
        """A login exists (also when the file is damaged: then nobody may make "the first" one)."""
        try:
            return bool(self._users())
        except Damaged:
            return True

    def user(self):
        """The owner's name (None before the first login)."""
        try:
            users = self._users()
        except Damaged:
            return None
        return users[0]["user"] if users else None

    def caller(self, name):
        """A Caller for this account, or None."""
        try:
            users = self._users()
        except Damaged:
            return None
        r = self._find(users, name)
        if not r:
            return None
        return _caller_of(users, r)

    def _secret(self):
        """The cookie-signing key: never shorter than 32 bytes (a short / empty file — a crash halfway — is replaced,
        which signs everyone out once; written atomically, so a reader never sees half of it)."""
        p = self.dir / SECRET
        with self.lock:
            try:
                s = p.read_bytes()
                if len(s) >= 32:
                    return s
            except OSError:
                pass
            s = secrets.token_bytes(32)
            _write_private(p, s)
            return s

    def create(self, user, password):
        """The first login = the admin. Returns (token, None) or (None, reason); "exists" when there is one already."""
        bad = check_new(user, password, "admin")
        if bad:
            return None, bad
        if self.exists():   # (answered before any hashing: a flood of these costs nothing)
            return None, "exists"
        record = self._record(user, password, "admin")   # (the slow part, outside the lock)
        with self.lock:
            try:
                if self._users():
                    return None, "exists"
                _write_private(self.dir / USERS, json.dumps({"v": 2, "users": [record]}).encode(), exclusive=True)
            except (FileExistsError, Damaged):
                return None, "exists"
        return self.token(user), None

    def _modify(self, name, fn):
        """Change one account under the lock: fn(users, record) → reason or None. (True, None) or (False, reason)."""
        with self.lock:
            try:
                users = self._users()
            except Damaged:
                return False, "damaged"
            r = self._find(users, name)
            if not r:
                return False, "no-such-user"
            why = fn(users, r)
            if why:
                return False, why
            self._save_users(users)
            return True, None

    def change(self, old, new, client, user=None):
        """A login's own new password (the old one first; it counts as a sign-in try). user None = the admin.
        Returns (token, None) or (None, reason)."""
        name = user if user is not None else self.user()
        if name is None:
            return None, "no-login"
        ok, why = self.verify(name, old, client)
        if not ok:
            return None, why
        who = self.caller(name)
        if not who:
            return None, "no-login"
        bad = check_new(who.user, new, who.role)
        if bad:
            return None, bad
        fresh = self._record(who.user, new, who.role)

        def put(users, r):
            self._fresh_password(r, fresh)
        ok, why = self._modify(who.user, put)
        return (self.token(who.user), None) if ok else (None, why)

    # ---- the admin's account page ----
    @staticmethod
    def _admin_only(by):
        return isinstance(by, Caller) and by.admin

    def list_users(self, by):
        if not self._admin_only(by):
            return None
        out = []
        users = self._users()
        for i, r in enumerate(users):
            adm = _is_admin(r)
            pend = r.get("reset") if isinstance(r.get("reset"), dict) else None
            out.append({"user": r["user"], "role": "admin" if adm else "user", "admin": adm, "owner": i == 0,
                        "created": r.get("created"), "pwAt": r.get("pwAt"),
                        "codeUntil": int(pend.get("until") or 0) if pend and pend.get("until", 0) > self.now() else None,
                        "perms": (clean_perms(r.get("perms"))[0] or default_perms()) if not adm else None,
                        **self.lock_status(r["user"])})
        return out

    def add_user(self, by, user, password, perms=None):
        """(True, None) or (False, reason). A new user: at least MIN_PASSWORD["user"] characters."""
        if not self._admin_only(by):
            return False, "not-allowed"
        bad = check_new(user, password, "user")
        if bad:
            return False, bad
        clean, bad = clean_perms(perms or {})
        if bad:
            return False, bad
        try:
            if self._find(self._users(), user):
                return False, "taken"
        except Damaged:
            return False, "damaged"
        rec = self._record(user, password, "user", perms=clean)   # (slow: outside the lock)
        with self.lock:
            users = self._users()
            if self._find(users, user):
                return False, "taken"
            if len(users) >= MAX_USERS:
                return False, f"at most {MAX_USERS} logins"
            users.append(rec)
            self._save_users(users)
        self._clear_lock(user)   # (wrong tries on that name before it existed don't count)
        return True, None

    def remove_user(self, by, user, step=False):
        """Any admin removes a login (itself too) — never the owner. Needs "confirm it's you" (step)."""
        if not self._admin_only(by):
            return False, "not-allowed"
        with self.lock:
            try:
                users = self._users()
            except Damaged:
                return False, "damaged"
            r = self._find(users, user)
            if not r:
                return False, "no-such-user"
            if r is users[0]:
                return False, "owner"   # (the owner stays; only a hand-over makes it an ordinary admin)
            if not step:
                return False, "need-confirm"
            if not self._still_admin(users, by):
                return False, "not-allowed"
            users.remove(r)
            self._save_users(users)
        self._clear_lock(user)
        return True, None

    def set_password(self, by, user, password):
        """The admin gives a user a new password (signs that user out, clears its lockout). The admin's own: change()."""
        if not self._admin_only(by):
            return False, "not-allowed"
        target = self.caller(user)
        if not target:
            return False, "no-such-user"
        if target.user.lower() == by.user.lower():
            return False, "self"
        if target.admin:
            return False, "admin"   # (an admin's: a one-time sign-in code — make_code)
        bad = check_new(target.user, password, "user")
        if bad:
            return False, bad
        fresh = self._record(target.user, password, "user")

        def put(users, r):
            if _is_admin(r):
                return "admin"
            self._fresh_password(r, fresh)
            self._notice(r, "password-set", by.user)
        ok, why = self._modify(target.user, put)
        if ok:
            self._clear_lock(target.user)
        return ok, why

    def set_perms(self, by, user, perms):
        if not self._admin_only(by):
            return False, "not-allowed"

        def put(users, r):
            if _is_admin(r):
                return "admin"
            clean, bad = clean_perms(perms, r.get("perms"))
            if bad:
                return bad
            r["perms"] = clean
        return self._modify(user, put)

    def rename(self, by, user, new):
        """The admin gives a login (also its own) a new name: (True, None) or (False, reason). That login's cookies stop
        working (they carry the name: it signs in again with the new one); its lockout goes with it."""
        if not self._admin_only(by):
            return False, "not-allowed"
        if not isinstance(new, str) or not USER_RE.fullmatch(new):
            return False, "username: 1-40 letters, digits or . _ @ -"
        old = []

        def put(users, r):
            if r is users[0] and not by.owner:
                return "owner"   # (only the owner renames the owner)
            other = self._find(users, new)
            if other is not None and other is not r:
                return "taken"
            old.append(r["user"])
            r["user"] = new
        ok, why = self._modify(user, put)
        if ok and old and old[0].lower() != new.lower():
            with self.verify_mutex, self.lock:
                locks = self._locks()
                if locks is not None:
                    st = locks.pop(_key(old[0]), None)
                    locks.pop(_key(new), None)   # (wrong tries on that name before it was a login don't count)
                    if st is not None:
                        locks[_key(new)] = st
                    self._save_locks(locks)
        return ok, why

    def forget_panel(self, panel):
        """A panel removed in the Manager: no login has it as its own panel any more ("all" stays all), so adding the
        same address again never hands it back to someone by itself. True when one changed."""
        panel = str(panel).lower()
        with self.lock:
            try:
                users = self._users()
            except Damaged:
                return False
            changed = False
            for r in users:
                if r["role"] == "user":   # (extra admins keep their stored perms too: a rollback reads them)
                    mine = clean_perms(r.get("perms"))[0] or default_perms()
                    if mine["panel"] == panel:
                        r["perms"] = dict(mine, panel="")
                        changed = True
            if changed:
                self._save_users(users)
            return changed

    def unlock(self, by, user, step=False):
        """An admin opens another login's lockout (also the last one). An admin's (the owner's too) needs "confirm it's
        you" (step); one's own can't be (signed in: not locked)."""
        if not self._admin_only(by):
            return False, "not-allowed"
        target = self.caller(user)
        if not target:
            return False, "no-such-user"
        if target.user.lower() == by.user.lower():
            return False, "self"
        if target.admin and not step:
            return False, "need-confirm"
        self._clear_lock(target.user)
        return True, None

    # ---- several admins (v2.7.0) ----
    def set_role(self, by, user, role, password=None, step=False):
        """An admin makes another login an admin (with a new password of 8+: the server can't know how long the old
        one is) or an ordinary user again (its old rights come back). Never the owner. Needs step. That login is signed
        out either way (its lid changes)."""
        if not self._admin_only(by):
            return False, "not-allowed"
        if role not in ("admin", "user"):
            return False, "role: admin or user"
        if not step:   # (before any hashing: a refused request costs nothing)
            return False, "need-confirm"
        fresh = None
        if role == "admin":
            bad = check_new(user if isinstance(user, str) else "", password, "admin")
            if bad:
                return False, bad
            fresh = self._record(user, password, "user")

        def put(users, r):
            if not self._still_admin(users, by):
                return "not-allowed"
            if r is users[0]:
                return "owner"
            if role == "admin":
                if _is_admin(r):
                    return "already"
                r["admin"] = True
                self._fresh_password(r, fresh)
                self._notice(r, "made-admin", by.user)
            else:
                if not _is_admin(r):
                    return "already"
                r.pop("admin", None)
                r["perms"] = clean_perms(r.get("perms"))[0] or default_perms()
                r["lid"] = secrets.token_hex(8)
        return self._modify(user, put)

    def transfer_owner(self, by, user, step=False):
        """The owner hands ownership to another admin: that one becomes users[0]; the old owner stays an admin."""
        if not self._admin_only(by) or not by.owner:
            return False, "owner"
        if not step:
            return False, "need-confirm"
        with self.lock:
            try:
                users = self._users()
            except Damaged:
                return False, "damaged"
            r = self._find(users, user)
            if not r:
                return False, "no-such-user"
            if r is users[0]:
                return False, "self"
            if not _is_admin(r):
                return False, "not-admin"
            old = users[0]
            if old["user"] != by.user:
                return False, "owner"
            if self.now() - float(old.get("codeAt") or 0) < OWNER_HOLD:
                return False, "too-soon"   # (signed in with a sign-in code lately: not yet — defence in depth)
            users.remove(r)
            r.pop("admin", None)
            r.pop("perms", None)
            r["role"] = "admin"
            old["role"], old["admin"] = "user", True
            old["perms"] = default_perms()
            users.insert(0, r)
            self._save_users(users)
        return True, None

    def make_code(self, by, user, step=False, ttl=CODE_TTL):
        """Any admin makes a one-time sign-in code for another login (an admin's or the owner's password is only ever
        reset this way): the old password and every cookie stop at once, its lockout opens; the code (shown once, never
        stored or logged — only its HMAC) works on the sign-in page for an hour, 5 tries. An admin as the target needs
        step. Returns ((code, until), None) or (None, reason)."""
        if not self._admin_only(by):
            return None, "not-allowed"
        target = self.caller(user)
        if not target:
            return None, "no-such-user"
        if target.user.lower() == by.user.lower():
            return None, "self"
        if target.owner:
            return None, "owner"   # (the owner's password: only the reset command —; else an admin could take over)
        if target.admin and not step:
            return None, "need-confirm"
        now = self.now()
        key = self._uid(by.user)
        with self.lock:
            made = [t for t in self._codes_made.get(key, []) if t > now - 3600]
            if len(made) >= CODES_PER_HOUR:
                return None, "too-many-codes"
            made.append(now)
            self._codes_made[key] = made
        code = "".join(secrets.choice(CODE_LETTERS) for _ in range(12))   # (60 bits)
        salt = secrets.token_bytes(16)
        until = int(now) + ttl

        def put(users, r):
            if not self._still_admin(users, by):
                return "not-allowed"
            if r is users[0]:
                return "owner"
            r.update({"hash": None, "lid": secrets.token_hex(8),
                      "reset": {"salt": salt.hex(), "code": hmac.new(salt, code.encode(), hashlib.sha256).hexdigest(),
                                "until": until, "tries": 0, "by": by.user}})
            self._notice(r, "code", by.user)
        with self.verify_mutex:
            ok, why = self._modify(target.user, put)
            if ok:
                self._open_admin_lock(target.user)
        if not ok:
            return None, why
        return ("-".join(code[i:i + 4] for i in (0, 4, 8)), until), None

    def signout_others(self, by):
        """Sign out on every other browser: this login's lid changes (every cookie of it stops); the browser that
        asked gets the fresh cookie this returns."""
        if not isinstance(by, Caller):
            return None

        def put(users, r):
            r["lid"] = secrets.token_hex(8)
        ok, _ = self._modify(by.user, put)
        return self.token(by.user) if ok else None

    def confirm(self, by, password, token, client):
        """"Confirm it's you": the caller's own password (a sign-in try: wrong ones count toward its lockout) opens a
        CONFIRM_TTL window for this cookie. (True, None) or (False, reason)."""
        if not isinstance(by, Caller) or not isinstance(token, str) or token.count(".") != 1:
            return False, "not-allowed"
        ok, why = self.verify(by.user, password, client)
        if not ok:
            return False, why
        key = self._session(token)
        if not key:
            return False, "not-allowed"
        with self.lock:
            now = self.now()
            self.stepped = {k: v for k, v in self.stepped.items() if v > now}
            self.stepped[key] = now + CONFIRM_TTL
        return True, None

    def confirmed(self, token):
        """This sign-in confirmed its login's password within CONFIRM_TTL. Keyed on the login, its lid and the sign-in's
        own id — which a renewed cookie keeps (renew), and a sign-out, a new password or a rename ends."""
        key = self._session(token)
        if not key:
            return False
        with self.lock:
            return self.stepped.get(key, 0) > self.now()

    def _payload(self, token):
        """The checked payload of a good cookie, or None."""
        if self.who(token)[0] is None:
            return None
        try:
            p = token.split(".")[0]
            return json.loads(base64.urlsafe_b64decode(p + "=" * (-len(p) % 4)))
        except ValueError:
            return None

    def _session(self, token):
        p = self._payload(token)
        if not p:
            return None
        return f"{p['u'].lower()}:{p['l']}:{p.get('i') or token.split('.')[1]}"

    def renew(self, token):
        """A fresh cookie for the same sign-in (the same id: "confirm it's you" carries over)."""
        p = self._payload(token)
        return self.token(p["u"], sid=p.get("i")) if p else None

    def info(self, user):
        """{"pwAt", "created"} of a login (Your account), or {}."""
        try:
            r = self._find(self._users(), user)
        except Damaged:
            return {}
        return {"pwAt": r.get("pwAt"), "created": r.get("created")} if r else {}

    def notices(self, user):
        try:
            r = self._find(self._users(), user)
        except Damaged:
            return []
        return [dict(n) for n in (r.get("notices") or []) if isinstance(n, dict)] if r else []

    def notice_seen(self, by, nid):
        def put(users, r):
            r["notices"] = [n for n in (r.get("notices") or []) if isinstance(n, dict) and n.get("id") != nid]
        return self._modify(by.user, put)[0] if isinstance(by, Caller) else False

    # ---- the lock file (wrong-password counts per name) ----
    CLEAR = {"fails": 0, "level": 0, "until": 0.0, "hard": False, "last": 0.0}

    @staticmethod
    def _one(s):
        out = {"fails": int(s.get("fails", 0)), "level": int(s.get("level", 0)),
               "until": float(s.get("until", 0)), "hard": s.get("hard") is True, "last": float(s.get("last", 0))}
        if not (0 <= out["fails"] < 1000 and 0 <= out["level"] < 100 and 0 <= out["until"] < 4e9 and 0 <= out["last"] < 4e9):
            raise ValueError("out of range")
        return out

    def _locks(self):
        """{key: state}, or None when the file can't be read (damaged, odd values) = every name locked until the reset
        (a broken lock must never open). The file from before accounts (one count for the house) is the admin's."""
        p = self.dir / LOCKFILE
        try:
            raw = p.read_text(encoding="utf-8")
        except FileNotFoundError:
            return {}
        except OSError:
            return None
        try:
            s = json.loads(raw)
            if isinstance(s, dict) and s.get("v") == 2 and isinstance(s.get("by"), dict):
                by = {}
                for k, v in s["by"].items():
                    if not isinstance(v, dict):
                        raise ValueError("bad entry")
                    by[k] = self._one(v)
                return by
            one = self._one(s)
            admin = self.user()
            return {_key(admin): one} if admin else {}
        except (ValueError, TypeError, AttributeError, OverflowError):
            return None

    def _save_locks(self, by):
        if len(by) > MAX_UNKNOWN:   # forget the oldest names that aren't logins (never a real login's count)
            try:
                real = {_key(r["user"]) for r in self._users()}
            except Damaged:
                real = set()
            extra = sorted((v["last"], k) for k, v in by.items() if k not in real)
            for _, k in extra[:len(by) - MAX_UNKNOWN]:
                del by[k]
        _write_private(self.dir / LOCKFILE, json.dumps({"v": 2, "by": by}).encode())

    def _clear_lock(self, name):
        with self.verify_mutex, self.lock:
            by = self._locks()
            if by is None:   # (damaged: only the reset command clears it — it removes the file)
                return
            if by.pop(_key(name), None) is not None:
                self._save_locks(by)

    def lock_status(self, user=None):
        """{"lockedFor": seconds (0 = not locked), "resetNeeded": the last lockout — only the admin (a user) or the
        reset command (the admin) opens it, "triesLeft": wrong passwords before the next lockout, "nextLock": how long
        that one lasts (seconds; null = until it's opened)}. Without a name: nothing locked (the sign-in page asks
        for the name first; it must not tell anything about logins it wasn't asked about)."""
        if user is None:
            return {"lockedFor": 0, "resetNeeded": False, "triesLeft": TRIES, "nextLock": LOCKS[0]}
        with self.lock:
            by = self._locks()
        s = dict(self.CLEAR, hard=True) if by is None else by.get(_key(user), dict(self.CLEAR))
        if s["last"] and self.now() - s["last"] > QUIET_RESET and not s["hard"] and self._until(s, self.now()) <= self.now():
            s = dict(self.CLEAR)
        nxt = LOCKS[s["level"]] if s["level"] < len(LOCKS) else None
        return {"lockedFor": 0 if s["hard"] else max(0, int(self._until(s, self.now()) - self.now())), "resetNeeded": s["hard"],
                "triesLeft": 0 if s["hard"] else max(0, TRIES - s["fails"]), "nextLock": nxt}

    @staticmethod
    def _until(s, now):
        """The end of a timed lock — never more than that lock's length from now (the clock jumped back)."""
        return min(s["until"], now + LOCKS[min(max(s["level"], 1), len(LOCKS)) - 1])

    def locked_for(self, client=None, user=None):
        return self.lock_status(user)["lockedFor"]

    def verify(self, user, password, client):
        """(True, None) or (False, "wrong" | "locked" | "reset-needed").
        Per login name (real or not — the answers are the same): TRIES wrong in a row (from any device) → locked
        LOCKS[0] seconds; TRIES more → LOCKS[1]; TRIES more → locked until the admin unlocks it / the reset command —
        kept on disk, so a restart doesn't open it. A right one clears it. A name that isn't a login costs a password
        hash too (same time). One check at a time, from the lock check to the saved result: many sign-ins sent at
        once can't all get past the check before a lockout is written (and only one hash uses memory at a time)."""
        with self.verify_mutex:
            now = self.now()
            with self.lock:
                by = self._locks()
            if by is None:
                return False, "reset-needed"
            k = _key(user)
            s = dict(by.get(k) or self.CLEAR)
            if s["hard"]:
                return False, "reset-needed"
            if self._until(s, now) > now:
                return False, "locked"
            if s["last"] and now - s["last"] > QUIET_RESET:   # a day without a wrong password: start counting anew
                s = dict(self.CLEAR)
            try:
                rec = self._find(self._users(), user)
            except Damaged:
                rec = None
            fine = isinstance(password, str) and len(password) <= MAX_PASSWORD
            if rec and rec.get("hash") and fine:
                good = hmac.compare_digest(_hash(password, bytes.fromhex(rec["salt"]), rec.get("kdf")), bytes.fromhex(rec["hash"]))
            else:   # (no such login / no password set: the same work, never right)
                hmac.compare_digest(_hash(password if fine else "", self._dummy[0]), self._dummy[1])
                good = False
            with self.lock:
                try:
                    if good:
                        if k in by:
                            del by[k]
                            self._save_locks(by)
                        return True, None
                    s["fails"] += 1
                    s["last"] = now
                    why = "wrong"
                    who = (f"the admin {rec['user']!r}" if _is_admin(rec) else f"the user {rec['user']!r}") if rec else "a name that isn't a login"
                    if s["fails"] >= TRIES:
                        s["fails"], s["level"] = 0, s["level"] + 1
                        if s["level"] > len(LOCKS):
                            s["hard"], why = True, "reset-needed"
                            if rec:
                                self.warn(f"manager: {who} locked after {TRIES * s['level']} wrong passwords (last from {client}) — " +
                                          ("another admin can unlock it (Manager → Accounts), or the reset command "
                                           "(docker exec -it skypane python service/reset_login.py --user NAME)"
                                           if _is_admin(rec) else "an admin can unlock it (Manager → Accounts)"))
                        else:
                            s["until"], why = now + LOCKS[s["level"] - 1], "locked"
                            if rec:
                                self.warn(f"manager: {TRIES} wrong passwords for {who} (last from {client}) — locked for "
                                          f"{LOCKS[s['level'] - 1] // 60} minutes")
                    by[k] = s
                    self._save_locks(by)
                except OSError:   # the count can't be saved: refuse rather than allow unlimited guessing
                    self.warn("manager: the lock state can't be saved (private/ not writable?) — sign-ins refused")
                    return False, "locked"
            return False, why

    # ---- the reset command (Unraid terminal only: nothing on the network calls these two) ----
    def reset_admin_password(self, ttl=CODE_TTL, user=None):
        """The reset command: clears one login's password (user None = the owner; the names, the other logins and every
        setting stay), signs it out, opens its lockout. Returns (its name, one-time code for the sign-in page), or
        (None, None) with no login yet / no such login."""
        with self.verify_mutex, self.lock:
            users = self._users()
            if not users:
                return None, None
            admin = users[0] if user is None else self._find(users, user)
            if admin is None:
                return None, None
            code = "".join(secrets.choice(CODE_LETTERS) for _ in range(12))   # (60 bits)
            salt = secrets.token_bytes(16)
            admin.update({"hash": None, "lid": secrets.token_hex(8),
                          "reset": {"salt": salt.hex(), "code": hmac.new(salt, code.encode(), hashlib.sha256).hexdigest(),
                                    "until": int(self.now()) + ttl, "tries": 0, "cmd": True}})
            self._save_users(users)
            self._open_admin_lock(admin["user"])
        return admin["user"], "-".join(code[i:i + 4] for i in (0, 4, 8))

    def set_admin_password_here(self, password, user=None):
        """The reset command's other way: the new password typed in the terminal (user None = the owner; 8+ for an
        admin, 4+ for a user). (True, None) / (False, reason)."""
        who = self.caller(user) if user is not None else self.caller(self.user() or "")
        if not who:
            return False, "no-login"
        name = who.user
        bad = check_new(name, password, who.role)
        if bad:
            return False, bad
        fresh = self._record(name, password, "user")
        with self.verify_mutex:
            def put(users, r):
                self._fresh_password(r, fresh)
            ok, why = self._modify(name, put)
            if ok:
                self._open_admin_lock(name)
        return ok, why

    def _open_admin_lock(self, name):
        """(verify_mutex held) The admin's lockout goes; a damaged lock file goes as a whole (the reset is the way out)."""
        with self.lock:
            by = self._locks()
            if by is None:
                (self.dir / LOCKFILE).unlink(missing_ok=True)
            elif by.pop(_key(name), None) is not None:
                self._save_locks(by)

    def finish_reset(self, code, password, client, user=None):
        """The sign-in page: a one-time code (the reset command's, or one an admin made) + the new password; user None =
        the owner. Returns (token, None) or (None, reason): "wrong" for any code that doesn't work (none waiting, too
        old, used up, another login's: the same answer); "slow-down" while too many wrong codes came in (any login)."""
        # (every name — real or not — takes the same path: the same hash, the same counters, the same answers; the new
        # password's length is checked only once the code was right, so no answer tells an admin's name from a user's)
        name = user if isinstance(user, str) else (self.user() or "")
        typed = _norm_code(code)
        salt_new = secrets.token_bytes(16)
        pw = password if isinstance(password, str) and len(password) <= MAX_PASSWORD else ""
        client = str(client or "?")[:64]
        with self.verify_mutex:   # (one at a time, like sign-ins; the hash first: the same work, right code or not)
            now = self.now()
            self._code_fails = {c: [t for t in ts if t > now - CODE_CLIENT[1]] for c, ts in self._code_fails.items()}
            self._code_fails = {c: ts for c, ts in self._code_fails.items() if ts}
            self._code_all = [t for t in self._code_all if t > now - CODE_FLOOD[1]]
            mine = len(self._code_fails.get(client, []))
            flood = len(self._code_all) >= CODE_FLOOD[0] and not self._cmd_code(name)
            hashed = _hash(pw, salt_new)
            if mine >= CODE_CLIENT[0] or flood:
                return None, "slow-down"
            with self.lock:
                done, why = self._use_code(typed, salt_new, hashed, client, name, password)
            if not done and not why:
                self._code_fails.setdefault(client, []).append(now)
                self._code_all.append(now)
        if why:
            return None, why
        if not done:
            return None, "wrong"
        name = done
        self.warn(f"manager: a new password for {name!r} was set with a one-time code (from {client})")
        return self.token(name), None

    def _cmd_code(self, name):
        """The reset command's own code waits for this login (a flood of wrong codes never blocks the way back in)."""
        try:
            r = self._find(self._users(), name)
        except Damaged:
            return False
        return bool(r and isinstance(r.get("reset"), dict) and r["reset"].get("cmd") is True)

    def _code_dead(self, users, r, why, client):
        """(lock held) A code that can't be used any more (too many wrong tries, too old): the login has no password
        until a new code — never silently: its maker and the login are told, the activity log gets it."""
        pend = r.pop("reset", None) or {}
        self.warn(f"manager: the one-time code for {r['user']!r} stopped working ({why}; last from {client}) — make a new one")
        self._notice(r, "code-dead", pend.get("by"))
        maker = self._find(users, pend.get("by")) if pend.get("by") else None
        if maker is not None:
            self._notice(maker, "code-dead-made", r["user"])
        try:
            self.on_event("account.code-dead", r["user"], what=why, by=pend.get("by"))
        except Exception:   # (the log is a bonus here: never lose the change itself)
            pass

    def _use_code(self, typed, salt_new, hashed, client, name, password):
        """(verify_mutex + lock held) (the login's name, None) when the code worked (the new password is saved);
        (None, reason) when the code was right but the new password isn't acceptable (the code stays); (None, None)
        for any code that doesn't work."""
        try:
            users = self._users()
        except Damaged:
            return None, None
        admin = self._find(users, name) if name else None
        pend = admin.get("reset") if admin else None
        if not isinstance(pend, dict) or not isinstance(pend.get("salt"), str) or not isinstance(pend.get("code"), str):
            if admin is not None:   # (a code typed for a real login that has none waiting: it is told)
                self._attempt(admin)
            if users:   # (a name that isn't a login: the same file write — no timing difference tells them apart)
                self._save_users(users)
            return None, None
        try:
            good = hmac.compare_digest(hmac.new(bytes.fromhex(pend["salt"]), typed.encode(), hashlib.sha256).hexdigest(), pend["code"])
        except ValueError:
            good = False
        fails = pend.get("fails") if isinstance(pend.get("fails"), dict) else {}
        until = int(pend.get("until") or 0)
        if until <= self.now():
            self._code_dead(users, admin, "too old", client)
            self._save_users(users)
            return None, None
        if fails.get(client, 0) >= CODE_TRIES:   # (this device used its tries; the code stays for the real person)
            return None, None
        if not good:
            fails[client] = fails.get(client, 0) + 1
            pend["fails"] = dict(list(fails.items())[-50:])
            pend["tries"] = int(pend.get("tries") or 0) + 1
            self._attempt(admin)
            if pend["tries"] >= CODE_TRIES_ALL:
                self._code_dead(users, admin, "too many wrong tries", client)
            self._save_users(users)
            return None, None
        bad = check_new(admin["user"], password, "admin" if _is_admin(admin) else "user")
        if bad:
            return None, bad
        admin.update({"salt": salt_new.hex(), "hash": hashed.hex(), "kdf": dict(SCRYPT), "lid": secrets.token_hex(8),
                      "pwAt": int(self.now()), "codeAt": int(self.now())})
        admin.pop("reset", None)
        self._save_users(users)
        self._open_admin_lock(admin["user"])
        return admin["user"], None

    # ---- cookies ----
    def token(self, user=None, sid=None):
        """A login cookie for this account (None = the owner). sid: the sign-in's id (renew keeps it; a new sign-in
        gets a new one)."""
        try:
            users = self._users()
        except Damaged:
            return None
        d = self._find(users, user) if user is not None else (users[0] if users else None)
        if not d:
            return None
        sid = sid if isinstance(sid, str) and re.fullmatch(r"[0-9a-f]{12}", sid) else secrets.token_hex(6)
        payload = base64.urlsafe_b64encode(json.dumps({"u": d["user"], "l": d["lid"], "e": int(self.now()) + IDLE, "i": sid},
                                                      separators=(",", ":")).encode()).decode().rstrip("=")
        sig = hmac.new(self._secret(), payload.encode(), hashlib.sha256).hexdigest()
        return f"{payload}.{sig}"

    def who(self, token):
        """(Caller, renew) for a good cookie, else (None, False). renew = hand out a fresh cookie (more than half of the
        idle time used). Read from the accounts file every time: a removed user / changed permissions count at once."""
        if not isinstance(token, str) or len(token) > 400 or token.count(".") != 1:
            return None, False
        payload, sig = token.split(".")
        good = hmac.new(self._secret(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, good):
            return None, False
        try:
            p = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        except ValueError:
            return None, False
        if not isinstance(p, dict) or not isinstance(p.get("u"), str) or not isinstance(p.get("l"), str):
            return None, False
        try:
            users = self._users()
        except Damaged:
            return None, False
        d = next((r for r in users if r["user"] == p["u"]), None)
        now = self.now()
        if not d or not hmac.compare_digest(p["l"], d["lid"]) or not isinstance(p.get("e"), int) or p["e"] <= now:
            return None, False
        with self.lock:
            if sig in self.revoked or f"{d['user'].lower()}:{p['l']}:{p.get('i')}" in self.revoked_sids:
                return None, False
        return _caller_of(users, d), p["e"] - now < IDLE / 2

    def valid(self, token):
        """(ok, renew) — see who()."""
        c, renew = self.who(token)
        return c is not None, renew

    def revoke(self, token):
        """Sign out: this cookie stops working on the server too (not only in the browser) — and so does every renewed
        copy of the same sign-in (its id), and its "confirm it's you" window ends."""
        key = self._session(token) if isinstance(token, str) and token.count(".") == 1 else None
        if isinstance(token, str) and token.count(".") == 1:
            with self.lock:
                now = self.now()
                self.revoked = {s: e for s, e in self.revoked.items() if e > now}
                self.revoked_sids = {s: e for s, e in self.revoked_sids.items() if e > now}
                if len(self.revoked) < 1000:
                    self.revoked[token.split(".")[1]] = now + IDLE
                if key and len(self.revoked_sids) < 1000:   # (a copy lives at most IDLE after its last renewal)
                    self.revoked_sids[key] = now + IDLE
                    self.stepped.pop(key, None)

    def uid_of(self, name):
        """A login's stable id, or None (read only: a login from before v2.7.0 may have none yet)."""
        try:
            r = self._find(self._users(), name)
        except Damaged:
            return None
        return r.get("uid") if r and isinstance(r.get("uid"), str) else None

    def reset(self):
        """Start over (tests): every login, every cookie (a new secret) and every lockout go; the other settings stay.
        (The reset command uses reset_admin_password: only the admin's password.)"""
        for name in (USERS, LOGIN_V1, SECRET, LOCKFILE):
            try:
                (self.dir / name).unlink()
            except FileNotFoundError:
                pass
        self._warned = False
