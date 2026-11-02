"""Cameras that aren't UniFi Protect, and camera views of your own: any camera with an RTSP (or
RTMP / HTTP MJPEG) stream, added on the Manager page (Cameras tab). The built-in go2rtc plays them like Protect's.

    DATA_DIR/private/own-cameras.json   {"next": 800001, "cameras": [{id, name, room, main, sub}], "views": [{id, name, cameras}]}

`main` / `sub` are the stream addresses (they usually hold the camera's user + password: the file is private, mode
0600, never sent to a browser — the Manager only learns the host and whether a sub stream is set). `sub` (optional)
= the smaller stream for grids. A view holds up to 4 cameras (Protect's or your own, by the panels' camera ids).
service/protect_sync.py adds them to the panels' camera list (house/protect-cameras.js) and to go2rtc's config.
"""
import ipaddress
import json
import os
import pathlib
import re
import socket
import threading
import urllib.parse

FILE = "own-cameras.json"
FIRST_ID = 800001                 # the panels' camera ids for own cameras (Protect's: Hubitat ids / 900000+)
MAX_CAMERAS, MAX_VIEWS, VIEW_MAX = 64, 32, 4
URL_RE = re.compile(r"(rtsps?|rtmps?|https?)://[^\s\"'<>\\`\x00-\x1f\x7f]{3,500}")   # (a control character would break go2rtc.yaml)
VIEW_ID = re.compile(r"own-v\d{1,6}")
_lock = threading.Lock()


class Invalid(ValueError):
    pass


def _path(private_dir):
    return pathlib.Path(private_dir) / FILE


def load(private_dir):
    try:
        doc = json.loads(_path(private_dir).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        doc = None
    if not isinstance(doc, dict):
        doc = {}
    cams = [c for c in doc.get("cameras") or [] if isinstance(c, dict) and isinstance(c.get("id"), int)
            and isinstance(c.get("name"), str) and isinstance(c.get("main"), str) and URL_RE.fullmatch(c["main"])]
    ids = {c["id"] for c in cams}
    views = [{"id": v["id"], "name": v["name"], "cameras": [i for i in v.get("cameras") or [] if isinstance(i, int)][:VIEW_MAX]}
             for v in doc.get("views") or [] if isinstance(v, dict) and isinstance(v.get("id"), str) and VIEW_ID.fullmatch(v["id"])
             and isinstance(v.get("name"), str)]
    nxt = doc.get("next") if isinstance(doc.get("next"), int) else FIRST_ID
    return {"next": max([nxt, FIRST_ID] + [i + 1 for i in ids]), "cameras": cams, "views": views}


def _save(private_dir, doc):
    p = _path(private_dir)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(f".{p.name}.{os.getpid()}.tmp")
    try:
        tmp.unlink()
    except OSError:
        pass
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1)
    os.replace(tmp, p)


def host_of(url):
    """Only the host (and port) of a stream address, for showing — never the user / password / path."""
    try:
        u = urllib.parse.urlsplit(url)
        return f"{u.scheme}://{u.hostname}{f':{u.port}' if u.port else ''}" if u.hostname else u.scheme + "://…"
    except ValueError:
        return "…"


def public(doc):
    """What the Manager may see: never a stream address or password — only "host" (rtsp://192.168.1.20:554, no login;
    server.py shows it to the admin only)."""
    return {"cameras": [{"id": c["id"], "name": c["name"], "room": c.get("room") or "", "host": host_of(c["main"]),
                         "sub": bool(c.get("sub"))} for c in doc["cameras"]],
            "views": doc["views"]}


def _name(v, what):
    if not isinstance(v, str):
        raise Invalid(f"{what}: text")
    # (shown on the panels: the house model's safe text rules — no characters that could end HTML)
    v = re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f<>&\"'`\\]", "", v)).strip()[:40]
    if not v:
        raise Invalid(f"{what}: missing")
    return v


RESOLVE_TIMEOUT = 1.0   # seconds for looking a camera's name up (not found in time: let through — only a forbidden answer refuses)


def _bad_ip(ip):
    ip = getattr(ip, "ipv4_mapped", None) or ip   # (::ffff:127.0.0.1 is 127.0.0.1)
    return ip.is_loopback or ip.is_link_local or ip.is_unspecified or ip.is_multicast or ip.is_reserved


def _resolve(host):
    """Every address a name stands for, or None when it can't be looked up within RESOLVE_TIMEOUT."""
    out, done = [], threading.Event()

    def look():
        try:
            out.extend({a[4][0] for a in socket.getaddrinfo(host, None)})
        except (OSError, UnicodeError):
            pass
        finally:
            done.set()
    threading.Thread(target=look, daemon=True).start()
    return out if done.wait(RESOLVE_TIMEOUT) and out else None


def _host_ok(url, resolve=True):
    """A camera is a device on the network: never this machine itself (loopback — go2rtc, the server's own ports),
    link-local (169.254.x: the cloud metadata address) or an unspecified / multicast / reserved address — however it
    is written: an address only in its plain form (127.1, 2130706433, 0x7f000001 and 0177.0.0.1 are refused, they
    are other spellings of 127.0.0.1), a name only when every address it looks up to is a fine one (a name pointing at
    this machine, like localtest.me, is refused; one that can't be looked up from here is let through — adding own
    cameras is the admins' only)."""
    try:
        host = (urllib.parse.urlsplit(url).hostname or "").strip("[]").lower().rstrip(".")
    except ValueError:
        return False
    if not host or host == "localhost" or host.endswith(".localhost"):
        return False
    try:
        return not _bad_ip(ipaddress.ip_address(host))   # (a plain dotted quad or an IPv6 address)
    except ValueError:
        pass
    # something the system would still read as an IPv4 address (a number, hex, octal, 127.1): never accepted
    num = r"(0x[0-9a-f]*|[0-9]+)"   # (decimal, octal with a leading 0, hex 0x…)
    if re.fullmatch(num + r"(\." + num + r")*", host):
        return False
    try:
        socket.inet_aton(host)
        return False
    except (OSError, UnicodeError):
        pass
    if not re.fullmatch(r"[a-z0-9_-]+(\.[a-z0-9_-]+)*", host):
        return False
    if not resolve:
        return True
    found = _resolve(host)
    if not found:
        return True   # (not found from here — a camera's .local name often isn't, inside a container: go2rtc may still)
    try:
        return not any(_bad_ip(ipaddress.ip_address(a.split("%")[0])) for a in found)
    except ValueError:
        return False


def _url(v, what, optional=False):
    if optional and (v is None or v == ""):
        return ""
    if not isinstance(v, str) or not URL_RE.fullmatch(v.strip()):
        raise Invalid(f"{what}: an address like rtsp://user:password@192.168.1.20:554/stream1")
    if not _host_ok(v.strip()):
        raise Invalid(f"{what}: a camera on your network — not this machine itself (localhost / 127.x) or a 169.254.x address")
    return v.strip()


def change(private_dir, req, known_ids=()):
    """One change from the Manager; returns the new doc. req = {action: add | edit | remove | add-view | edit-view |
    remove-view, …}. known_ids = the panels' ids of Protect's cameras (a view may hold those too)."""
    if not isinstance(req, dict):
        raise Invalid("a change")
    a = req.get("action")
    with _lock:
        doc = load(private_dir)
        cams, views = doc["cameras"], doc["views"]
        own = {c["id"] for c in cams}
        if a == "add":
            if len(cams) >= MAX_CAMERAS:
                raise Invalid(f"at most {MAX_CAMERAS} cameras")
            name = _name(req.get("name"), "name")
            if any(c["name"].lower() == name.lower() for c in cams):
                raise Invalid("there is already a camera with that name")
            cams.append({"id": doc["next"], "name": name, "room": _name(req["room"], "room") if req.get("room") else "",
                         "main": _url(req.get("main"), "main stream"), "sub": _url(req.get("sub"), "sub stream", True)})
            doc["next"] += 1
        elif a == "edit":
            c = next((x for x in cams if x["id"] == req.get("id")), None)
            if not c:
                raise Invalid("no such camera")
            if "name" in req:
                name = _name(req["name"], "name")
                if any(x is not c and x["name"].lower() == name.lower() for x in cams):
                    raise Invalid("there is already a camera with that name")
                c["name"] = name
            if "room" in req:
                c["room"] = _name(req["room"], "room") if req["room"] else ""
            if req.get("main"):   # (empty = keep: the Manager never sees the stored address)
                c["main"] = _url(req["main"], "main stream")
            if "sub" in req and req["sub"] is not None:
                c["sub"] = _url(req["sub"], "sub stream", True)
        elif a == "remove":
            if req.get("id") not in own:
                raise Invalid("no such camera")
            doc["cameras"] = [x for x in cams if x["id"] != req["id"]]
            for v in views:
                v["cameras"] = [i for i in v["cameras"] if i != req["id"]]
        elif a in ("add-view", "edit-view"):
            ids = req.get("cameras")
            ok = set(known_ids) | own
            if not isinstance(ids, list) or not 1 <= len(ids) <= VIEW_MAX or not all(isinstance(i, int) and not isinstance(i, bool) and i in ok for i in ids):
                raise Invalid(f"a view: 1 to {VIEW_MAX} cameras")
            ids = list(dict.fromkeys(ids))
            if a == "add-view":
                if len(views) >= MAX_VIEWS:
                    raise Invalid(f"at most {MAX_VIEWS} views")
                n = max([int(v["id"][5:]) for v in views if v["id"][5:].isdecimal()] + [0]) + 1   # ("own-v12" → 12)
                views.append({"id": f"own-v{n}", "name": _name(req.get("name"), "name"), "cameras": ids})
            else:
                v = next((x for x in views if x["id"] == req.get("id")), None)
                if not v:
                    raise Invalid("no such view")
                v["cameras"] = ids
                if "name" in req:
                    v["name"] = _name(req["name"], "name")
        elif a == "remove-view":
            if not any(v["id"] == req.get("id") for v in views):
                raise Invalid("no such view")
            doc["views"] = [v for v in views if v["id"] != req["id"]]
        else:
            raise Invalid("action: add, edit, remove, add-view, edit-view or remove-view")
        _save(private_dir, doc)
        return doc


def slug(name):
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", name.lower())) or "camera"


def for_sync(doc, used=()):
    """(camera entries for the panels' list, go2rtc streams [(name, url)], views like Protect's live views with the
    panels' camera ids). Stream names start with "own-" so they never meet Protect's."""
    entries, streams, taken = [], [], set(used)
    for c in doc["cameras"]:
        s = "own-" + slug(c["name"])
        if s in taken or f"{s}-hd" in taken:
            s = f"{s}-{c['id']}"
        taken.update((s, f"{s}-hd"))
        entries.append({"id": f"own{c['id']}", "num": c["id"], "name": c["name"], "slug": s, "online": True, "video": True,
                        "room": c.get("room") or None, "own": True})
        streams += [(s, c.get("sub") or c["main"]), (f"{s}-hd", c["main"])]
    views = [{"id": v["id"], "name": v["name"], "layout": len(v["cameras"]), "isDefault": False, "isGlobal": True,
              "slots": [{"cameras": [i], "cycleMode": "time", "cycleInterval": 10} for i in v["cameras"]]}
             for v in doc["views"] if v["cameras"]]
    return entries, streams, views
