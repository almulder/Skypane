"""The house-wide choices per Hubitat device (stage 4): what it is, which room, PIN rule, fan type, picture.

Kept in DATA_DIR/house/device-settings.json = {"rev": n, "overrides": {"<id>": {...}}, "updated": "<iso>"}, edited on
the Manager page (/manage, service/server.py) and read by the Hubitat bridge, which rebuilds the house model from it
(service/house_model.py apply_overrides) — every panel then shows the same. Until stage 4 these lived in the main
panel's settings (settings.deviceOverrides); `migrate()` copies them over once.

Fields per device (anything else is refused):
  as        a role the device can be (house_model.options) or "hidden"
  room      another room (a room name, made safe like Hubitat's names)
  confirm   true = turning it on needs the panel PIN
  fanType   ceiling / box / pedestal / desk / tower
  icon      the picture (stage 4b): "line:<name>", "art:<name>" or "up:<id>"
  alert     "off" = this alert sensor never alerts on any panel (house-wide, Manager → Alerts)
  alertAbove  a freezer sensor shows as a warning on the panels above this many °F (-40..120; display only — the alerts
              are Hubitat rules)
  lightType one of house_model.LIGHT_TYPES the device can do (entry["lightTypes"]): on/off, dim, white tones, colour…
  colorCmd  "setColor" = a colour goes as one setColor (default: setHue + setSaturation)
  unlock    "pin" = a lock the panels may unlock (always with the panel PIN, only on panels that allow unlocking)

Device groups (doc["groups"], Manager → Devices → Groups): [{id, name, devices: [ids], pin, unlock, panels}] — rules for
every device in the group: pin = the panel PIN to turn on / open; unlock = its locks may be unlocked (with the PIN);
panels = only these panels may control them (None = every panel).

v2.4.0: change_many() — one change to many devices at once (the Devices page's bulk edit: all or nothing, one rev), and
FirstSeen — when each device was first in the house model (DATA_DIR/house/first-seen.json), for "new devices found".
"""
import datetime
import json
import os
import pathlib
import re
import threading
import time

try:
    from service import house_model
except ImportError:  # pragma: no cover  (run from inside service/)
    import house_model

FILE = "device-settings.json"
KEEP_BACKUPS = 20
ICON_RE = re.compile(r"(line|art|up):[A-Za-z0-9_-]{1,40}")


class Invalid(ValueError):
    pass


def check(field, value, entry):
    """The stored value for `field` (None = back to automatic); Invalid when not allowed for this device.
    `entry` = the device's line in the house model's catalogue ({"options": [...], ...})."""
    if value is None or value == "" or value is False:
        return None
    if field == "as":
        if not isinstance(value, str) or (value != "hidden" and value not in (entry.get("options") or [])):
            raise Invalid("this device can't be that")
        return value
    if field == "room":
        if not isinstance(value, str):
            raise Invalid("room: text")
        v = house_model.safe_text(value, 60)
        if not v or v in house_model.NO_ROOM or v.casefold() == "no room":   # (v2.4.1: "No room" is what the page shows for none)
            raise Invalid("not a room")
        return v
    if field == "confirm":
        if value is not True:
            raise Invalid("confirm: true / false")
        return True
    if field == "fanType":
        if value not in house_model.FAN_TYPES:
            raise Invalid("fan type: " + " / ".join(house_model.FAN_TYPES))
        return value
    if field == "icon":
        if not isinstance(value, str) or not ICON_RE.fullmatch(value):
            raise Invalid("not a picture")
        return value
    if field == "lightType":
        if value not in (entry.get("lightTypes") or []):
            raise Invalid("this light can't be that")
        return value
    if field == "colorCmd":
        if value not in house_model.COLOR_CMDS:
            raise Invalid("colorCmd: " + " / ".join(house_model.COLOR_CMDS))
        return None if value == "hueSat" else value
    if field == "unlock":
        if value != "pin" or "lock" not in (entry.get("options") or []):
            raise Invalid('unlock: "pin", for a lock only')
        return value
    if field == "alert":
        if value != "off":
            raise Invalid('alert: "off" (or none = on)')
        return value
    if field == "alertAbove":
        if not isinstance(value, int) or isinstance(value, bool) or not -40 <= value <= 120:
            raise Invalid("alertAbove: a whole number of °F, -40..120")
        return value
    raise Invalid("unknown field")


# what can never be switched from a panel, so never needs the panel PIN (v2.4.1: the page doesn't offer it there)
NO_PIN = ("motion", "contact", "window", "door-in", "door-out", "presence", "camera", "temp-alert", "climate", "outside-temp")


def pin_fits(clean, entry, current):
    """The panel PIN ("confirm") not for a sensor — by the role it will have after this change."""
    if not clean.get("confirm"):
        return
    role = (clean["as"] if "as" in clean else current.get("as")) or entry.get("is") or ""
    if role in NO_PIN or role.startswith("sensor:"):
        raise Invalid("the panel PIN is for what can be switched, not a sensor")


FIELDS = ("as", "room", "confirm", "fanType", "icon", "alert", "alertAbove", "lightType", "colorCmd", "unlock")
BULK_MAX = 500   # devices in one bulk change (v2.4.0)
MAX_GROUPS, GROUP_SIZE = 30, 200
PANEL_ID = re.compile(r"[A-Za-z0-9_-]{1,40}")


def check_group(g):
    """A device group from the Manager, made safe (Invalid when it can't be)."""
    if not isinstance(g, dict) or set(g) - {"id", "name", "devices", "pin", "unlock", "panels"}:
        raise Invalid("a group: name, devices, pin, unlock, panels")
    name = house_model.safe_text(g.get("name") if isinstance(g.get("name"), str) else "", 40)
    if not name:
        raise Invalid("a group needs a name")
    devs = g.get("devices")
    if not isinstance(devs, list) or len(devs) > GROUP_SIZE or not all(isinstance(i, int) and not isinstance(i, bool) and 0 <= i < 10 ** 9 for i in devs):
        raise Invalid(f"a group's devices: up to {GROUP_SIZE} device ids")
    panels = g.get("panels")
    if panels is not None and (not isinstance(panels, list) or not 1 <= len(panels) <= 50 or not all(isinstance(p, str) and PANEL_ID.fullmatch(p) for p in panels)):

        raise Invalid("a group's panels: a list of panel ids, or none = every panel")
    return {"name": name, "devices": list(dict.fromkeys(devs)), "pin": g.get("pin") is True, "unlock": g.get("unlock") is True,
            "panels": sorted({p.lower() for p in panels}) if panels is not None else None}




class DeviceSettings:
    def __init__(self, data_dir):
        self.path = pathlib.Path(data_dir) / "house" / FILE
        self.backups = pathlib.Path(data_dir) / "backups"
        self.lock = threading.Lock()

    def exists(self):
        return self.path.is_file()

    def load(self):
        try:
            doc = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(doc, dict) and isinstance(doc.get("overrides"), dict) and isinstance(doc.get("rev"), int):
                return doc
        except (OSError, ValueError):
            pass
        return {"rev": 0, "overrides": {}}

    def _write(self, doc):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            self.backups.mkdir(parents=True, exist_ok=True)
            stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            try:
                (self.backups / f"device-settings-{stamp}.json").write_bytes(self.path.read_bytes())
            except OSError:
                pass
            old = sorted(self.backups.glob("device-settings-*.json"))
            for f in old[:-KEEP_BACKUPS]:
                try:
                    f.unlink()
                except OSError:
                    pass
        doc["updated"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
        tmp = self.path.with_name(f".{self.path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=True, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.path)

    def change(self, device_id, changes, entry):
        """Set / clear fields of one device; returns the new rev. Invalid on a bad field or value."""
        if not isinstance(changes, dict) or not changes or set(changes) - set(FIELDS):
            raise Invalid("fields: " + ", ".join(FIELDS))
        clean = {f: check(f, v, entry) for f, v in changes.items()}
        pin_fits(clean, entry, (self.load()["overrides"].get(str(device_id)) or {}))
        with self.lock:
            doc = self.load()
            ov = doc["overrides"]
            o = dict(ov.get(str(device_id)) or {})
            for f, v in clean.items():
                if v is None:
                    o.pop(f, None)
                else:
                    o[f] = v
            if o:
                ov[str(device_id)] = o
            else:
                ov.pop(str(device_id), None)
            doc["rev"] += 1
            self._write(doc)
            return doc["rev"]

    def change_many(self, changes_by_id):
        """{device id: (changes, entry)} — every device's change checked first (Invalid names the device: nothing is
        written then), then all of them saved at once as one new rev; returns it."""
        return self.write_many(self.check_many(changes_by_id))

    def check_many(self, changes_by_id):
        """The checking half of change_many: {device id: {field: stored value or None}}, or Invalid (naming the device)."""
        if not isinstance(changes_by_id, dict) or not changes_by_id or len(changes_by_id) > BULK_MAX:
            raise Invalid(f"ids: 1 to {BULK_MAX} devices")
        clean = {}
        for did, (changes, entry) in changes_by_id.items():
            if not isinstance(changes, dict) or not changes or set(changes) - set(FIELDS):
                raise Invalid("fields: " + ", ".join(FIELDS))
            try:
                clean[did] = {f: check(f, v, entry) for f, v in changes.items()}
                pin_fits(clean[did], entry, (self.load()["overrides"].get(str(did)) or {}))
            except Invalid as e:
                raise Invalid(f"{entry.get('label') or did}: {e}")
        return clean

    def write_many(self, clean):
        """The saving half of change_many (values from check_many): one new rev; returns it."""
        with self.lock:
            doc = self.load()
            ov = doc["overrides"]
            for did, fields in clean.items():
                o = dict(ov.get(str(did)) or {})
                for f, v in fields.items():
                    if v is None:
                        o.pop(f, None)
                    else:
                        o[f] = v
                if o:
                    ov[str(did)] = o
                else:
                    ov.pop(str(did), None)
            doc["rev"] += 1
            self._write(doc)
            return doc["rev"]

    def set_group(self, group_id, group):
        """Add (group_id None), change or (group None) remove a device group; returns (rev, the groups)."""
        clean = check_group(group) if group is not None else None
        with self.lock:
            doc = self.load()
            gs = [g for g in (doc.get("groups") if isinstance(doc.get("groups"), list) else []) if isinstance(g, dict) and isinstance(g.get("id"), str)]
            if group_id is None:
                if clean is None:
                    raise Invalid("nothing to add")
                if len(gs) >= MAX_GROUPS:
                    raise Invalid(f"at most {MAX_GROUPS} groups")
                n = max([int(g["id"][1:]) for g in gs if re.fullmatch(r"g\d{1,6}", g["id"])] + [0]) + 1
                gs.append({"id": f"g{n}", **clean})
            else:
                if not any(g["id"] == group_id for g in gs):
                    raise Invalid("no such group")
                gs = [({"id": g["id"], **clean} if clean else None) if g["id"] == group_id else g for g in gs]
                gs = [g for g in gs if g]
            doc["groups"] = gs
            doc["rev"] += 1
            self._write(doc)
            return doc["rev"], gs

    def set_room(self, room_id, room):
        """Add (room_id None), change or (room None) remove a room of the owner's own ({name, icon, devices}); returns
        (rev, the rooms). Its devices also stay in their own room."""
        clean = None
        if room is not None:
            if not isinstance(room, dict) or set(room) - {"name", "icon", "devices"}:
                raise Invalid("a room: name, icon, devices")
            name = house_model.safe_text(room.get("name") if isinstance(room.get("name"), str) else "", 40)
            devs = room.get("devices")
            if not name or not house_model.slug(name):
                raise Invalid("a room needs a name with letters or digits")
            if not isinstance(devs, list) or len(devs) > GROUP_SIZE or not all(isinstance(i, int) and not isinstance(i, bool) and 0 <= i < 10 ** 9 for i in devs):
                raise Invalid(f"a room's devices: up to {GROUP_SIZE} device ids")
            icon = room.get("icon") or "grid"
            if not isinstance(icon, str) or not house_model.ICON_RE.fullmatch(icon):
                raise Invalid("not an icon")
            clean = {"name": name, "icon": icon, "devices": list(dict.fromkeys(devs))}
        with self.lock:
            doc = self.load()
            rs = [r for r in (doc.get("rooms") if isinstance(doc.get("rooms"), list) else []) if isinstance(r, dict) and isinstance(r.get("id"), str)]
            if clean and any(r["id"] != room_id and house_model.slug(str(r.get("name") or "")) == house_model.slug(clean["name"]) for r in rs):
                raise Invalid("there is already a room of yours with that name")
            if room_id is None:
                if clean is None:
                    raise Invalid("nothing to add")
                if len(rs) >= MAX_GROUPS:
                    raise Invalid(f"at most {MAX_GROUPS} rooms of your own")
                n = max([int(r["id"][1:]) for r in rs if re.fullmatch(r"r\d{1,6}", r["id"])] + [0]) + 1
                rs.append({"id": f"r{n}", **clean})
            else:
                if not any(r["id"] == room_id for r in rs):
                    raise Invalid("no such room")
                rs = [r for r in ([({"id": r["id"], **clean} if clean else None) if r["id"] == room_id else r for r in rs]) if r]
            doc["rooms"] = rs
            doc["rev"] += 1
            self._write(doc)
            return doc["rev"], rs

    def set_room_icon(self, name, icon):
        """A picture (line icon name) for a room — Hubitat's or the owner's — by its name; None = automatic."""
        if not isinstance(name, str) or not house_model.safe_text(name, 60):
            raise Invalid("a room name")
        if icon is not None and (not isinstance(icon, str) or not house_model.ICON_RE.fullmatch(icon)):
            raise Invalid("not an icon")
        with self.lock:
            doc = self.load()
            icons = dict(doc.get("roomIcons") or {}) if isinstance(doc.get("roomIcons"), dict) else {}
            key = house_model.safe_text(name, 60)
            if icon:
                if len(icons) >= 200 and key not in icons:
                    raise Invalid("too many room pictures")
                icons[key] = icon
            else:
                icons.pop(key, None)
            doc["roomIcons"] = icons
            doc["rev"] += 1
            self._write(doc)
            return doc["rev"]

    def rooms(self):
        doc = self.load()
        return ([r for r in (doc.get("rooms") if isinstance(doc.get("rooms"), list) else []) if isinstance(r, dict) and isinstance(r.get("id"), str)],
                dict(doc.get("roomIcons") or {}) if isinstance(doc.get("roomIcons"), dict) else {})

    def groups(self):

        gs = self.load().get("groups")
        return [g for g in (gs if isinstance(gs, list) else []) if isinstance(g, dict) and isinstance(g.get("id"), str)]


    def migrate(self, old_overrides):

        """Once: the main panel's settings.deviceOverrides (before stage 4) become this file. True when copied."""
        with self.lock:
            if self.exists() or not isinstance(old_overrides, dict):
                return False
            ov = {str(k): {f: v for f, v in o.items() if f in FIELDS}
                  for k, o in old_overrides.items() if str(k).isdecimal() and isinstance(o, dict)}
            self._write({"rev": 1, "overrides": {k: o for k, o in ov.items() if o}})
            return True


FIRST_SEEN_FILE = "first-seen.json"
FIRST_SEEN_MAX = 5000


class FirstSeen:
    """When each device was first in the house model (v2.4.0, "new devices found" on the Devices page).

    DATA_DIR/house/first-seen.json = {"since": t0, "reviewed": t, "seen": {"<id>": t}}. The first look (no file yet)
    takes every device there as known (its time = since: nothing is "new" on an upgrade); a device that turns up later
    gets the time it was first seen, and is new until the owner marks the new ones reviewed. Written only when a device
    turns up. Devices gone from the hub keep their time (a device paired again isn't new), at most FIRST_SEEN_MAX."""

    def __init__(self, data_dir, clock=None):
        self.path = pathlib.Path(data_dir) / "house" / FIRST_SEEN_FILE
        self.clock = clock or time.time
        self.lock = threading.Lock()

    def _load(self):
        try:
            doc = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(doc, dict) and isinstance(doc.get("seen"), dict) and isinstance(doc.get("since"), (int, float)):
                seen = {k: v for k, v in doc["seen"].items() if str(k).isdecimal() and isinstance(v, (int, float)) and not isinstance(v, bool)}
                rev = doc.get("reviewed")
                return {"since": doc["since"], "reviewed": rev if isinstance(rev, (int, float)) and not isinstance(rev, bool) else doc["since"], "seen": seen}
        except (OSError, ValueError):
            pass
        return None

    def _save(self, doc):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_name(f".{self.path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=True)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, self.path)

    def update(self, ids):
        """The house model's device ids now → {"seen": {id: t}, "since", "reviewed", "new": [ids new since the last review]}."""
        ids = [i for i in ids if isinstance(i, int) and not isinstance(i, bool) and 0 < i < 10 ** 9]
        with self.lock:
            now = self.clock()
            doc = self._load()
            # (the first look — no file, or one that never saw a device: every device there is known, none is "new")
            first = changed = doc is None or not doc["seen"]
            if doc is None:
                doc = {"since": now, "reviewed": now, "seen": {}}
            for i in ids:
                if str(i) not in doc["seen"]:
                    doc["seen"][str(i)] = doc["since"] if first else now
                    changed = True
            if len(doc["seen"]) > FIRST_SEEN_MAX:   # (the oldest of those gone from the hub go first)
                here = {str(i) for i in ids}
                gone = sorted((t, k) for k, t in doc["seen"].items() if k not in here)
                for _, k in gone[:len(doc["seen"]) - FIRST_SEEN_MAX]:
                    del doc["seen"][k]
                changed = True
            if changed:
                try:
                    self._save(doc)
                except OSError:
                    pass
            here = {str(i) for i in ids}
            return {"seen": {int(k): t for k, t in doc["seen"].items() if k in here}, "since": doc["since"], "reviewed": doc["reviewed"],
                    "new": sorted(int(k) for k, t in doc["seen"].items() if k in here and t > doc["reviewed"])}

    def reviewed(self):
        """The owner looked at the new devices: none is new any more (until the next one turns up). Returns the time."""
        with self.lock:
            now = self.clock()
            doc = self._load()
            if doc is None:   # (nothing seen yet: nothing to review — the first look marks every device known anyway)
                return now
            doc["reviewed"] = max(now, doc.get("reviewed") or 0)
            try:
                self._save(doc)
            except OSError:
                pass
            return doc["reviewed"]
