"""The house's "may switch" rule (v3.0.2): which devices no panel may switch — the sprinklers, the freezer…

Until 3.0.2 it lived in the main panel's settings (panels/main.json data.settings.switchRule / neverSwitch); the main
panel goes with pairing (panel_devices.migrate_v302 moves the rule here first). Kept in DATA_DIR/house/switch-rule.json
in the very same shape as those settings keys, so server.py's _never_now(rule.load(), model) reads it unchanged:

  {"switchRule": {"allow": {"<id>": true}, "never": {"<id>": true}},   the Manager's exceptions to the name rule
   "neverSwitch": {"<id>": true}}                                       an old explicit list (wins when present)

Written by the server (Manager → Devices), read by the Hubitat bridge (--rule-file). Not a secret, but written like
one: atomic (tmp + os.replace), mode 0600 where the OS allows.

Usage:
    rule = SwitchRule(pathlib.Path(DATA_DIR) / "house")
    rule.load()                      -> {"switchRule": {...}} (only the keys present; {} when there's no file)
    rule.modify(lambda s: {**s, "switchRule": {...}})   -> the saved dict (fn gets a copy, under one lock)
(v3.0.2) A file that is there but can't be read / is damaged raises Unreadable (an OSError: the server answers 503) —
never {}: a failed read never widens what the panels may switch, and nothing is written over the owner's rule.
"""
import json
import os
import pathlib
import secrets
import threading

FILE = "switch-rule.json"
KEYS = ("switchRule", "neverSwitch")


class Unreadable(OSError):
    """house/switch-rule.json is there but can't be read or is damaged (like the bridge's read_rule → False)."""


def clean(settings):
    """Only the rule's keys, each a dict of {"<id>": true} (switchRule: its allow / never maps). Anything else goes."""
    out = {}
    ids = lambda d: {str(k): True for k, v in (d if isinstance(d, dict) else {}).items() if v and str(k).isdecimal()}  # noqa: E731
    s = settings if isinstance(settings, dict) else {}
    if isinstance(s.get("switchRule"), dict):
        out["switchRule"] = {"allow": ids(s["switchRule"].get("allow")), "never": ids(s["switchRule"].get("never"))}
    if isinstance(s.get("neverSwitch"), dict):
        out["neverSwitch"] = ids(s["neverSwitch"])
    return out


class SwitchRule:
    def __init__(self, house_dir):
        self.path = pathlib.Path(house_dir) / FILE
        self.lock = threading.Lock()

    def exists(self):
        return self.path.is_file()

    def load(self):
        """The rule as {"switchRule"?, "neverSwitch"?}; {} when there's no file (= the name rule). Unreadable when it is
        there but can't be read or isn't a JSON object."""
        try:
            doc = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return {}
        except (OSError, ValueError, RecursionError) as e:
            raise Unreadable(f"{FILE} can't be read ({type(e).__name__})") from None
        if not isinstance(doc, dict):
            raise Unreadable(f"{FILE} is damaged")
        return clean(doc)

    def save(self, settings):
        """Writes the rule's keys of `settings` (a panel's settings dict will do); returns what was saved. OSError when
        the house dir can't be written."""
        with self.lock:
            return self._save(clean(settings))

    def modify(self, fn):
        """fn(current rule copy) -> the new rule, saved under the lock (no lost update between two Manager saves)."""
        with self.lock:
            return self._save(clean(fn(json.loads(json.dumps(self.load())))))

    def _save(self, rule):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(f".{self.path.name}.{secrets.token_hex(6)}.tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
                json.dump(rule, f, indent=1, sort_keys=True)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
        return rule
