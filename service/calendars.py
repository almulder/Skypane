"""The house's calendars: read-only iCal / ICS subscription links — Google's "Secret address in iCal format",
Outlook / Microsoft 365 published ICS, iCloud public (webcal) links, Yahoo, Proton, Fastmail, Nextcloud, school and
sports feeds. Owner's guide: docs/calendars.md.

The admin adds them in the Manager (Settings → Calendars: a name, the link, a default colour). A link is a SECRET —
anyone with it can read the calendar — so it is kept only in DATA_DIR/private/calendars.json (0600), never sent back
to any page, never logged, never put in the house model or the panels' data. This module fetches each link every
5 / 10 / 15 / 30 minutes (the house's setting "every", v3.0.2; and right after a save), with timeouts, a size cap,
https only (webcal:// → https://), at most MAX_REDIRECTS redirects (https only) and never to a private / loopback /
link-local address (SSRF: the address is checked after the name is looked up, and the connection goes to exactly that checked address). The ICS text is parsed
with the standard library only: VEVENT DTSTART / DTEND / DURATION (dates, UTC, TZID through zoneinfo or the file's own
VTIMEZONE), all-day events, SUMMARY, LOCATION, RRULE (DAILY / WEEKLY / MONTHLY / YEARLY with INTERVAL, COUNT, UNTIL,
BYDAY, BYMONTHDAY, BYMONTH, BYSETPOS, WKST), RDATE, EXDATE and RECURRENCE-ID overrides — kept for a window of
yesterday … +WINDOW_DAYS days. A failed fetch keeps the last good copy; the status (ok / the last error in plain words /
when) is shown in the Manager.

The panels read GET /api/panel/<id>/events (server.py): only the events of the house calendars that panel shows (its
settings.calendars entry with the same id may switch one off and give it its own colour / icon).
"""
import datetime
import hashlib
import http.client
import ipaddress
import json
import os
import re
import secrets
import socket
import ssl
import threading
import time
import urllib.parse
import zlib

try:
    import zoneinfo
except ImportError:  # pragma: no cover
    zoneinfo = None

try:
    from service import guest_wifi, house_model
except ImportError:  # pragma: no cover
    import guest_wifi
    import house_model

CONFIG = "calendars.json"         # private/: [{id, name, color, link}] — the links are secrets
CACHE = "calendar-cache.json"     # private/: {id: {events, fetched, okAt, error}} — the last good copy and its status
MAX_CALENDARS = 20                # (a panel's settings.calendars holds at most 20: panel_settings._calendars)
MAX_BYTES = 2 * 1024 * 1024       # one calendar's ICS text
TIMEOUT = 15                      # seconds per connect / read
DEADLINE = 40                     # seconds for a whole fetch (redirects included)
MAX_REDIRECTS = 3
REFRESH = 600                     # seconds between fetches (the default of the house's setting below)
EVERY_CHOICES = (5, 10, 15, 30)   # (v3.0.2: the admin's "check every … minutes"; never below 5 — Google & co. throttle)
DEFAULT_EVERY = 10
CHECK_ALL_GAP = 60                # (v3.0.2: "Check calendars now" at most once a minute)
CHECK_ALL_CAP = 45                # (v3.0.2: … and answered within this many seconds; slower ones go on behind)
CHECK_ALL_WORKERS = 4             # (… this many calendars fetched at once)
WINDOW_DAYS = 60                  # events kept: yesterday … today + this many days
MAX_EVENTS = 2000                 # per calendar, in the window
MAX_LINK = 2000
COLOR_RE = re.compile(r"#[0-9a-fA-F]{6}")
ID_RE = re.compile(r"[a-z0-9][a-z0-9_-]{0,39}")
DEFAULT_COLOR = "#8b5cf6"

# Tests only (service/test_calendars.py): a local http://127.0.0.1 test server may be fetched. Never set in
# production — nothing in the configuration or the environment turns it on.
_TEST_ALLOW_LOCAL = False


class Invalid(ValueError):
    """A refused change, in plain words (never containing the link)."""


class TooSoon(Exception):
    """(v3.0.2) "Check calendars now" again within CHECK_ALL_GAP: .wait — the seconds left."""
    def __init__(self, wait):
        super().__init__(f"wait {wait} s")
        self.wait = wait


class FetchError(Exception):
    """A fetch that failed, in plain words for the Manager (never containing the link)."""


# ---------------------------------------------------------------------------------------------------------------------
# the link: https only, webcal → https; the address it points to must be on the internet

def clean_link(link):
    """The link as it will be fetched (webcal:// and webcals:// → https://), or Invalid in plain words."""
    if not isinstance(link, str):
        raise Invalid("Paste the calendar's link")
    s = link.strip()
    if not s:
        raise Invalid("Paste the calendar's link")
    if len(s) > MAX_LINK or re.search(r"[\s\x00-\x1f\x7f]", s):
        raise Invalid("That doesn't look like a calendar link (too long, or it has spaces)")
    low = s.lower()
    for pre in ("webcals://", "webcal://"):
        if low.startswith(pre):
            s = "https://" + s[len(pre):]
            break
    try:
        u = urllib.parse.urlsplit(s)
        port = u.port
    except ValueError:
        raise Invalid("That doesn't look like a calendar link") from None
    allowed = ("https", "http") if _TEST_ALLOW_LOCAL else ("https",)
    if u.scheme.lower() not in allowed:
        raise Invalid("The link must start with https:// or webcal://")
    if not u.hostname:
        raise Invalid("That doesn't look like a calendar link (no server name)")
    if u.username is not None or u.password is not None:
        raise Invalid("Links with a user name and password in them aren't supported — use the calendar's public / secret iCal link")
    if port is not None and not 0 < port < 65536:
        raise Invalid("That doesn't look like a calendar link")
    return urllib.parse.urlunsplit((u.scheme.lower(), u.netloc, u.path or "/", u.query, ""))


def public_address(ip):
    """Is this address on the internet (not private, loopback, link-local, carrier-grade NAT, multicast, reserved…)?"""
    try:
        a = ipaddress.ip_address(ip.split("%", 1)[0] if isinstance(ip, str) else ip)
    except ValueError:
        return False
    if isinstance(a, ipaddress.IPv6Address):
        if a.ipv4_mapped is not None:
            a = a.ipv4_mapped
        elif a.sixtofour is not None:
            a = a.sixtofour
        elif a.teredo is not None:
            return False
    return bool(a.is_global and not (a.is_multicast or a.is_private or a.is_loopback or a.is_link_local
                                     or a.is_reserved or a.is_unspecified))


def _resolve(host, port):
    """The addresses to connect to — every address the name has must be public (a name that also points into the
    local network is refused as a whole)."""
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError):
        raise FetchError("The calendar's server name wasn't found — check the link") from None
    ips = list(dict.fromkeys(i[4][0] for i in infos))
    if not ips:
        raise FetchError("The calendar's server name wasn't found — check the link")
    if not _TEST_ALLOW_LOCAL and not all(public_address(ip) for ip in ips):
        raise FetchError("The link points into the local network — only calendars on the internet can be added")
    return ips


class _PinnedHTTPS(http.client.HTTPSConnection):
    """https to exactly the checked address; the certificate is still checked for the server's name (SNI)."""

    def __init__(self, host, ip, port, timeout, context):
        super().__init__(host, port, timeout=timeout, context=context)
        self._ip = ip

    def connect(self):
        sock = socket.create_connection((self._ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


class _PinnedHTTP(http.client.HTTPConnection):   # (tests only: a local http test server)
    def __init__(self, host, ip, port, timeout):
        super().__init__(host, port, timeout=timeout)
        self._ip = ip

    def connect(self):
        self.sock = socket.create_connection((self._ip, self.port), self.timeout)


def _status_words(code):
    if code in (401, 403):
        return f"The calendar's server refused the link ({code}) — it may have been reset; copy the link again"
    if code in (404, 410):
        return f"The calendar wasn't found at that link ({code}) — it may have been deleted or the link reset"
    if code == 429 or code >= 500:
        return f"The calendar's server had a problem ({code}) — trying again later"
    return f"The calendar's server answered {code} instead of the calendar"


def redirect_target(url, location):
    """Where a redirect goes (relative ones resolved; webcal → https) — FetchError unless it's https again."""
    loc = (location or "").strip()
    if not loc or len(loc) > MAX_LINK or re.search(r"[\s\x00-\x1f\x7f]", loc):
        raise FetchError("The calendar's server sent it on without saying where")
    nxt = urllib.parse.urljoin(url, loc)
    for pre in ("webcals://", "webcal://"):
        if nxt.lower().startswith(pre):
            nxt = "https://" + nxt[len(pre):]
    try:
        u = urllib.parse.urlsplit(nxt)
        u.port
    except ValueError:
        raise FetchError("The calendar's server sent it on to a broken address") from None
    if u.scheme.lower() != "https" and not (_TEST_ALLOW_LOCAL and u.scheme.lower() == "http"):
        raise FetchError("The calendar's server sent it on to an address that isn't https — not followed")
    if not u.hostname or u.username is not None:
        raise FetchError("The calendar's server sent it on to a broken address")
    return nxt


def fetch(link, max_bytes=MAX_BYTES, timeout=TIMEOUT, deadline=DEADLINE):
    """The calendar's ICS text (bytes). FetchError in plain words otherwise. The link is never part of an error."""
    try:
        url = clean_link(link)
    except Invalid as e:
        raise FetchError(str(e)) from None
    end = time.monotonic() + deadline
    ctx = ssl.create_default_context()
    for _hop in range(MAX_REDIRECTS + 1):
        u = urllib.parse.urlsplit(url)
        scheme = u.scheme.lower()
        if scheme != "https" and not (_TEST_ALLOW_LOCAL and scheme == "http"):
            raise FetchError("The calendar's server sent it on to an address that isn't https — not followed")
        host, port = u.hostname, u.port or (443 if scheme == "https" else 80)
        if not host:
            raise FetchError("The calendar's server sent it on to a broken address")
        ips = _resolve(host, port)
        target = (u.path or "/") + (f"?{u.query}" if u.query else "")
        resp = conn = None
        last = None
        for ip in ips[:4]:
            try:
                left = max(1.0, min(timeout, end - time.monotonic()))
                conn = _PinnedHTTPS(host, ip, port, left, ctx) if scheme == "https" else _PinnedHTTP(host, ip, port, left)
                conn.request("GET", target, headers={"User-Agent": "Skypane-calendar/1 (read-only)",
                                                     "Accept": "text/calendar, text/plain;q=0.8, */*;q=0.5",
                                                     "Accept-Encoding": "gzip, identity"})
                resp = conn.getresponse()
                break
            except ssl.SSLCertVerificationError:
                conn.close()
                raise FetchError("The calendar's server has a certificate that isn't valid") from None
            except ssl.SSLError:
                last = FetchError("A secure connection to the calendar's server failed")
            except (TimeoutError, socket.timeout):
                last = FetchError("The calendar's server took too long to answer")
            except (ConnectionError, OSError):
                last = FetchError("Couldn't connect to the calendar's server")
            except http.client.HTTPException:
                last = FetchError("The calendar's server sent a broken answer")
            if conn is not None:
                conn.close()
        if resp is None:
            raise last or FetchError("Couldn't connect to the calendar's server")
        try:
            if resp.status in (301, 302, 303, 307, 308):
                url = redirect_target(url, resp.getheader("Location"))
                continue
            if resp.status != 200:
                raise FetchError(_status_words(resp.status))
            length = resp.getheader("Content-Length")
            if length and length.strip().isdigit() and int(length) > max_bytes:
                raise FetchError(f"The calendar is too big (more than {max_bytes // 1048576} MB)")
            parts, size = [], 0
            while True:
                if time.monotonic() > end:
                    raise FetchError("The calendar's server took too long to answer")
                chunk = resp.read1(65536) if hasattr(resp, "read1") else resp.read(65536)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise FetchError(f"The calendar is too big (more than {max_bytes // 1048576} MB)")
                parts.append(chunk)
            body = b"".join(parts)
            if (resp.getheader("Content-Encoding") or "").strip().lower() == "gzip":
                d = zlib.decompressobj(16 + zlib.MAX_WBITS)
                try:
                    body = d.decompress(body, max_bytes + 1)
                except zlib.error:
                    raise FetchError("The calendar's server sent a broken answer") from None
                if len(body) > max_bytes or d.unconsumed_tail:
                    raise FetchError(f"The calendar is too big (more than {max_bytes // 1048576} MB)")
            return body
        except (TimeoutError, socket.timeout):
            raise FetchError("The calendar's server took too long to answer") from None
        except (ConnectionError, OSError, http.client.HTTPException):
            raise FetchError("The connection to the calendar's server broke off") from None
        finally:
            conn.close()
    raise FetchError("The calendar's server sent it on too many times")


# ---------------------------------------------------------------------------------------------------------------------
# time zones: zoneinfo (the server's tz database), Outlook's Windows names, the file's own VTIMEZONE, else the server's

UTC = datetime.timezone.utc
WINDOWS_ZONES = {
    "pacific standard time": "America/Los_Angeles", "mountain standard time": "America/Denver",
    "us mountain standard time": "America/Phoenix", "central standard time": "America/Chicago",
    "eastern standard time": "America/New_York", "us eastern standard time": "America/Indiana/Indianapolis",
    "alaskan standard time": "America/Anchorage", "hawaiian standard time": "Pacific/Honolulu",
    "atlantic standard time": "America/Halifax", "newfoundland standard time": "America/St_Johns",
    "canada central standard time": "America/Regina", "central standard time (mexico)": "America/Mexico_City",
    "mountain standard time (mexico)": "America/Mazatlan", "pacific standard time (mexico)": "America/Tijuana",
    "sa pacific standard time": "America/Bogota", "e. south america standard time": "America/Sao_Paulo",
    "argentina standard time": "America/Argentina/Buenos_Aires", "utc": "UTC", "coordinated universal time": "UTC",
    "gmt standard time": "Europe/London", "greenwich standard time": "Atlantic/Reykjavik",
    "w. europe standard time": "Europe/Berlin", "romance standard time": "Europe/Paris",
    "central europe standard time": "Europe/Budapest", "central european standard time": "Europe/Warsaw",
    "e. europe standard time": "Europe/Chisinau", "fle standard time": "Europe/Kiev", "gtb standard time": "Europe/Bucharest",
    "russian standard time": "Europe/Moscow", "israel standard time": "Asia/Jerusalem", "south africa standard time": "Africa/Johannesburg",
    "arabian standard time": "Asia/Dubai", "india standard time": "Asia/Kolkata", "china standard time": "Asia/Shanghai",
    "singapore standard time": "Asia/Singapore", "tokyo standard time": "Asia/Tokyo", "korea standard time": "Asia/Seoul",
    "aus eastern standard time": "Australia/Sydney", "e. australia standard time": "Australia/Brisbane",
    "cen. australia standard time": "Australia/Adelaide", "w. australia standard time": "Australia/Perth",
    "new zealand standard time": "Pacific/Auckland",
}


class LocalZone(datetime.tzinfo):
    """The machine's own time zone (with its DST rules) when there's no tz database for TZ (e.g. Windows)."""

    def _offset(self, dt):
        tt = (dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second, 0, 0, -1)
        try:
            stamp = time.mktime(tt)
        except (OverflowError, ValueError):
            return datetime.timedelta(seconds=-time.timezone)
        return datetime.timedelta(seconds=time.localtime(stamp).tm_gmtoff)

    def utcoffset(self, dt):
        return self._offset(dt)

    def dst(self, dt):
        return datetime.timedelta(0)

    def tzname(self, dt):
        return "local"

    def fromutc(self, dt):
        stamp = (dt.replace(tzinfo=None) - datetime.datetime(1970, 1, 1)).total_seconds()
        try:
            off = time.localtime(stamp).tm_gmtoff
        except (OverflowError, ValueError, OSError):
            off = -time.timezone
        return (dt + datetime.timedelta(seconds=off)).replace(tzinfo=self)


def _zone(key):
    if zoneinfo is None or not key or len(key) > 80:
        return None
    try:
        return zoneinfo.ZoneInfo(key)
    except Exception:   # (unknown key, no tz database, a strange key)
        return None


def server_zone():
    """The server's time zone: TZ (Manager → Integrations → Time zone; the image's UTC when none is set) through
    zoneinfo, else the machine's own."""
    return _zone((os.environ.get("TZ") or "").strip()) or LocalZone()


class VTimezone(datetime.tzinfo):
    """A time zone from the calendar file's own VTIMEZONE (STANDARD / DAYLIGHT parts with TZOFFSETTO and a yearly
    RRULE like BYMONTH=3;BYDAY=2SU) — used when the tz database doesn't know the TZID."""

    def __init__(self, tzid, parts):
        self.tzid = tzid
        self.parts = parts   # [(onset naive, offset to (timedelta), rule dict or None, rdates [naive], is_dst)]

    def _onsets(self, year):
        out = []
        for start, off, rule, rdates, is_dst in self.parts:
            out.append((start, off, is_dst))
            out.extend((r, off, is_dst) for r in rdates)
            if rule and rule.get("freq") == "YEARLY":
                until = rule.get("until")
                for y in (year - 1, year):
                    if y <= start.year:
                        continue
                    for m in rule.get("bymonth") or [start.month]:
                        days = _month_days(y, m, rule) if (rule.get("byday") or rule.get("bymonthday")) else [start.day]
                        for d in days:
                            try:
                                t = datetime.datetime(y, m, d, start.hour, start.minute, start.second)
                            except ValueError:
                                continue
                            if until is None or t <= _naive(until):
                                out.append((t, off, is_dst))
        return out

    def _find(self, dt):
        naive = dt.replace(tzinfo=None)
        best = None
        for t, off, is_dst in self._onsets(naive.year):
            if t <= naive and (best is None or t > best[0]):
                best = (t, off, is_dst)
        if best is None:   # (before every onset: the earliest part's offset)
            first = min(self.parts, key=lambda p: p[0])
            return first[1], first[4]
        return best[1], best[2]

    def utcoffset(self, dt):
        return self._find(dt)[0]

    def dst(self, dt):
        return datetime.timedelta(hours=1) if self._find(dt)[1] else datetime.timedelta(0)

    def tzname(self, dt):
        return self.tzid

    def fromutc(self, dt):
        naive = dt.replace(tzinfo=None)
        off = self.utcoffset(naive + self.utcoffset(naive))
        return (naive + off).replace(tzinfo=self)


def _naive(v):
    if isinstance(v, datetime.datetime):
        return v.replace(tzinfo=None) if v.tzinfo is None else v.astimezone(UTC).replace(tzinfo=None)
    return datetime.datetime(v.year, v.month, v.day, 23, 59, 59)


def _offset(s):
    m = re.fullmatch(r"([+-])(\d\d)(\d\d)(\d\d)?", (s or "").strip())
    if not m:
        return None
    td = datetime.timedelta(hours=int(m.group(2)), minutes=int(m.group(3)), seconds=int(m.group(4) or 0))
    return -td if m.group(1) == "-" else td


class Zones:
    """TZID → tzinfo for one calendar file."""

    def __init__(self, vtimezones, default):
        self.vt = vtimezones
        self.default = default
        self.cache = {}

    def get(self, tzid):
        if tzid is None:
            return self.default
        if tzid in self.cache:
            return self.cache[tzid]
        key = tzid.strip().strip('"')
        z = _zone(key)
        if z is None and "/" in key:   # "/mozilla.org/20050126_1/America/New_York", "/citadel.org/…/Europe/Paris"
            segs = [s for s in key.split("/") if s]
            for n in (3, 2, 1):
                if len(segs) >= n and (z := _zone("/".join(segs[-n:]))):
                    break
        if z is None and key.lower() in WINDOWS_ZONES:
            z = _zone(WINDOWS_ZONES[key.lower()])
        if z is None and key in self.vt:
            z = self.vt[key]
        if z is None:
            z = self.default
        self.cache[tzid] = z
        return z


# ---------------------------------------------------------------------------------------------------------------------
# ICS text → components

class Comp:
    __slots__ = ("name", "props", "subs")

    def __init__(self, name):
        self.name, self.props, self.subs = name, [], []

    def first(self, name):
        for p in self.props:
            if p[0] == name:
                return p
        return None

    def all(self, name):
        return [p for p in self.props if p[0] == name]


def unfold(text):
    out = []
    for line in re.split(r"\r\n|\n|\r", text):
        if line[:1] in (" ", "\t") and out:
            out[-1] += line[1:]
        elif line:
            out.append(line)
    return out


def parse_line(line):
    """'DTSTART;TZID="America/New_York";VALUE=DATE-TIME:20261029T090000' → ("DTSTART", {"TZID": …, "VALUE": …}, value)."""
    i, n, quoted = 0, len(line), False
    while i < n:
        c = line[i]
        if c == '"':
            quoted = not quoted
        elif c == ":" and not quoted:
            break
        i += 1
    if i >= n:
        return None
    head, value = line[:i], line[i + 1:]
    parts, cur, quoted = [], "", False
    for c in head:
        if c == '"':
            quoted = not quoted
            cur += c
        elif c == ";" and not quoted:
            parts.append(cur)
            cur = ""
        else:
            cur += c
    parts.append(cur)
    name = parts[0].strip().upper()
    if not name:
        return None
    params = {}
    for p in parts[1:]:
        k, _, v = p.partition("=")
        v = v.strip()
        if len(v) >= 2 and v[0] == '"' and v[-1] == '"':
            v = v[1:-1]
        params[k.strip().upper()] = v
    return name, params, value


def parse_components(text):
    """The VCALENDAR component (tree) of an ICS text; Invalid when it isn't one."""
    if text.startswith("﻿"):
        text = text[1:]
    root, stack = None, []
    for line in unfold(text):
        p = parse_line(line)
        if p is None:
            continue
        name, params, value = p
        if name == "BEGIN":
            c = Comp(value.strip().upper())
            if stack:
                stack[-1].subs.append(c)
            elif root is None:
                root = c
            else:
                continue
            stack.append(c)
        elif name == "END":
            v = value.strip().upper()
            while stack:   # (a missing END: close up to the matching one)
                if stack.pop().name == v:
                    break
        elif stack:
            stack[-1].props.append((name, params, value))
    if root is None or root.name != "VCALENDAR":
        raise Invalid("That link isn't a calendar (no iCal data) — copy the iCal / ICS link")
    return root


def unescape(v):
    return re.sub(r"\\(.)", lambda m: {"n": " ", "N": " "}.get(m.group(1), m.group(1)), v)


def clean_text(v, n=200):
    """An event's title / place as plain text (the panels escape it when they draw it)."""
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f]", " ", unescape(v or ""))).strip()[:n]


# ---------------------------------------------------------------------------------------------------------------------
# values

def parse_date_value(value, params, zones):
    """("date", date) or ("dt", naive wall time, tzinfo) — None when it can't be read."""
    v = (value or "").strip()
    m = re.fullmatch(r"(\d{4})(\d\d)(\d\d)", v)
    try:
        if m or (params.get("VALUE", "").upper() == "DATE" and re.match(r"\d{8}", v)):
            m = m or re.match(r"(\d{4})(\d\d)(\d\d)", v)
            return ("date", datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3))))
        m = re.fullmatch(r"(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)?(Z?)", v, re.IGNORECASE)
        if not m:
            return None
        naive = datetime.datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5)),
                                  min(int(m.group(6) or 0), 59))
    except ValueError:
        return None
    if m.group(7):
        return ("dt", naive, UTC)
    return ("dt", naive, zones.get(params.get("TZID")))


def parse_duration(v):
    m = re.fullmatch(r"([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?", (v or "").strip(), re.IGNORECASE)
    if not m or not any(m.group(i) for i in range(2, 7)):
        return None
    td = datetime.timedelta(weeks=int(m.group(2) or 0), days=int(m.group(3) or 0), hours=int(m.group(4) or 0),
                            minutes=int(m.group(5) or 0), seconds=int(m.group(6) or 0))
    return -td if m.group(1) == "-" else td


WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def parse_rrule(v, zones, tz):
    """RRULE text → {freq, interval, count, until, byday [(n|None, wd)], bymonthday, bymonth, bysetpos, wkst} or None."""
    parts = {}
    for item in (v or "").split(";"):
        k, _, val = item.partition("=")
        if k:
            parts[k.strip().upper()] = val.strip()
    freq = parts.get("FREQ", "").upper()
    if freq not in ("DAILY", "WEEKLY", "MONTHLY", "YEARLY"):
        return None

    def ints(key, lo, hi):
        out = []
        for x in (parts.get(key) or "").split(","):
            if re.fullmatch(r"[+-]?\d{1,3}", x.strip()) and lo <= abs(int(x)) <= hi:
                out.append(int(x))
        return out
    rule = {"freq": freq, "interval": 1, "count": None, "until": None, "byday": [], "wkst": 0,
            "bymonthday": ints("BYMONTHDAY", 1, 31), "bymonth": [m for m in ints("BYMONTH", 1, 12) if m > 0],
            "bysetpos": ints("BYSETPOS", 1, 366)}
    if re.fullmatch(r"\d{1,4}", parts.get("INTERVAL", "")):
        rule["interval"] = max(1, int(parts["INTERVAL"]))
    if re.fullmatch(r"\d{1,6}", parts.get("COUNT", "")):
        rule["count"] = int(parts["COUNT"])
    if parts.get("UNTIL"):
        u = parse_date_value(parts["UNTIL"], {}, zones)
        if u is not None:
            rule["until"] = u[1] if u[0] == "date" else u[1].replace(tzinfo=u[2])
    for d in (parts.get("BYDAY") or "").split(","):
        m = re.fullmatch(r"([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)", d.strip().upper())
        if m:
            rule["byday"].append((int(m.group(1)) if m.group(1) else None, WEEKDAYS[m.group(2)]))
    if parts.get("WKST", "").upper() in WEEKDAYS:
        rule["wkst"] = WEEKDAYS[parts["WKST"].upper()]
    return rule


def _month_days(y, m, rule):
    """The days of month m in year y the rule's BYDAY / BYMONTHDAY pick (sorted)."""
    first = datetime.date(y, m, 1)
    last = (datetime.date(y + (m == 12), m % 12 + 1, 1) - datetime.timedelta(days=1)).day
    days = set()
    for d in rule.get("bymonthday") or []:
        dd = d if d > 0 else last + d + 1
        if 1 <= dd <= last:
            days.add(dd)
    byday = rule.get("byday") or []
    if byday:
        picked = set()
        for n, wd in byday:
            all_wd = [d for d in range(1, last + 1) if (first.weekday() + d - 1) % 7 == wd]
            if n is None or n == 0:
                picked.update(all_wd)
            elif 1 <= abs(n) <= len(all_wd):
                picked.add(all_wd[n - 1] if n > 0 else all_wd[n])
        days = (days & picked) if rule.get("bymonthday") else picked
    return sorted(days)


def _setpos(cands, rule):
    sp = rule.get("bysetpos") or []
    if not sp:
        return cands
    out = []
    for p in sp:
        if 1 <= abs(p) <= len(cands):
            out.append(cands[p - 1] if p > 0 else cands[p])
    return sorted(set(out))


def expand(start, rule, until_naive, win_from, win_to, limit=MAX_EVENTS):
    """The occurrence starts (naive wall times, start included) of a rule up to win_to (naive, same zone), from about
    win_from on (earlier ones only while COUNT needs counting). `until_naive`: the rule's UNTIL as a wall time."""
    out = []
    freq, interval, count = rule["freq"], rule["interval"], rule["count"]
    tod = datetime.timedelta(hours=start.hour, minutes=start.minute, seconds=start.second)
    d0 = start.date()
    seen = 0

    def emit(t):
        nonlocal seen
        if t < start or (t == start and seen):
            return True
        if until_naive is not None and t > until_naive:
            return False
        seen += 1
        if count is not None and seen > count:
            return False
        if t >= win_from:
            out.append(t)
        return len(out) < limit

    # the first period to look at: with COUNT every one from the start (they count), else close to the window
    k0 = 0
    if count is None and win_from > start:
        gap = (win_from.date() - d0).days
        per = {"DAILY": 1, "WEEKLY": 7, "MONTHLY": 28, "YEARLY": 365}[freq]
        k0 = max(0, gap // (per * interval) - 2)
        if freq == "MONTHLY":
            k0 = max(0, ((win_from.year - d0.year) * 12 + win_from.month - d0.month) // interval - 1)
        elif freq == "YEARLY":
            k0 = max(0, (win_from.year - d0.year) // interval - 1)
    # DTSTART is always the first occurrence (it counts for COUNT, RFC 5545), also when the rule wouldn't pick it
    if not emit(start):
        return out
    for k in range(k0, k0 + 200000):
        if freq == "DAILY":
            day = d0 + datetime.timedelta(days=k * interval)
            if datetime.datetime.combine(day, datetime.time()) > win_to:
                break
            if rule["bymonth"] and day.month not in rule["bymonth"]:
                continue
            if rule["byday"] and day.weekday() not in {wd for _, wd in rule["byday"]}:
                continue
            if rule["bymonthday"] and day.day not in rule["bymonthday"]:
                continue
            cands = [day]
        elif freq == "WEEKLY":
            wk = d0 - datetime.timedelta(days=(d0.weekday() - rule["wkst"]) % 7) + datetime.timedelta(weeks=k * interval)
            if datetime.datetime.combine(wk, datetime.time()) > win_to:
                break
            wds = sorted({wd for _, wd in rule["byday"]} or {d0.weekday()}, key=lambda w: (w - rule["wkst"]) % 7)
            cands = [wk + datetime.timedelta(days=(wd - rule["wkst"]) % 7) for wd in wds]
            if rule["bymonth"]:
                cands = [c for c in cands if c.month in rule["bymonth"]]
            cands = _setpos(cands, rule)
        elif freq == "MONTHLY":
            mi = d0.month - 1 + k * interval
            y, m = d0.year + mi // 12, mi % 12 + 1
            if datetime.datetime(y, m, 1) > win_to:
                break
            if rule["bymonth"] and m not in rule["bymonth"]:
                continue
            days = _month_days(y, m, rule) if (rule["byday"] or rule["bymonthday"]) else [d0.day]
            cands = []
            for dd in days:
                try:
                    cands.append(datetime.date(y, m, dd))
                except ValueError:   # (the 31st in a 30-day month: skipped, as RFC 5545 says)
                    pass
            cands = _setpos(cands, rule)
        else:   # YEARLY
            y = d0.year + k * interval
            if datetime.datetime(y, 1, 1) > win_to:
                break
            cands = []
            for m in rule["bymonth"] or [d0.month]:
                if rule["byday"] or rule["bymonthday"]:
                    days = _month_days(y, m, rule)
                else:
                    days = [d0.day]
                for dd in days:
                    try:
                        cands.append(datetime.date(y, m, dd))
                    except ValueError:   # (Feb 29 in a year without one)
                        pass
            cands = _setpos(sorted(cands), rule)
        for c in cands:
            if not emit(datetime.datetime.combine(c, datetime.time()) + tod):
                return out
    return out


# ---------------------------------------------------------------------------------------------------------------------
# a calendar file → the events in the window

def _vtimezones(root):
    out = {}
    for tz in root.subs:
        if tz.name != "VTIMEZONE":
            continue
        tid = tz.first("TZID")
        if not tid:
            continue
        parts = []
        dummy = Zones({}, UTC)
        for sub in tz.subs:
            if sub.name not in ("STANDARD", "DAYLIGHT"):
                continue
            st, to = sub.first("DTSTART"), sub.first("TZOFFSETTO")
            off = _offset(to[2]) if to else None
            if not st or off is None:
                continue
            d = parse_date_value(st[2], {}, dummy)
            if not d or d[0] != "dt":
                continue
            rr = sub.first("RRULE")
            rule = parse_rrule(rr[2], dummy, UTC) if rr else None
            if rule and rule.get("until") is not None and isinstance(rule["until"], datetime.datetime) and rule["until"].tzinfo:
                rule["until"] = rule["until"].astimezone(UTC).replace(tzinfo=None) + off
            rdates = []
            for rd in sub.all("RDATE"):
                for x in rd[2].split(","):
                    v = parse_date_value(x, {}, dummy)
                    if v and v[0] == "dt":
                        rdates.append(v[1])
            parts.append((d[1], off, rule, rdates, sub.name == "DAYLIGHT"))
        if parts:
            out[tid[2].strip()] = VTimezone(tid[2].strip(), parts)
    return out


def _key(kind, naive_or_date, tz):
    """What identifies one occurrence (RECURRENCE-ID / EXDATE matching): a date, or the UTC instant."""
    if kind == "date":
        return naive_or_date if not isinstance(naive_or_date, datetime.datetime) else naive_or_date.date()
    return naive_or_date.replace(tzinfo=tz).astimezone(UTC).replace(tzinfo=None)


def _utc(naive, tz):
    return naive.replace(tzinfo=tz).astimezone(UTC)


def parse_events(text, cal_id="", now=None, zone=None, days=WINDOW_DAYS):
    """ICS text → [{cal, title, start, end, allDay, where?}] in the window (yesterday … today + days, in `zone` —
    the server's own by default), sorted by start. Invalid when the text isn't a calendar."""
    zone = zone or server_zone()
    now = (now or datetime.datetime.now(UTC)).astimezone(zone)
    day0 = now.date() - datetime.timedelta(days=1)
    day1 = now.date() + datetime.timedelta(days=days + 1)
    w_from = datetime.datetime.combine(day0, datetime.time(), tzinfo=zone).astimezone(UTC)
    w_to = datetime.datetime.combine(day1, datetime.time(), tzinfo=zone).astimezone(UTC)
    root = parse_components(text)
    cal_tz = None
    xw = root.first("X-WR-TIMEZONE")
    zones = Zones(_vtimezones(root), zone)
    if xw:
        cal_tz = zones.get(xw[2].strip())
        zones.default = cal_tz
    masters, overrides = [], {}
    for ev in root.subs:
        if ev.name != "VEVENT":
            continue
        rid = ev.first("RECURRENCE-ID")
        uid = (ev.first("UID") or ("", {}, ""))[2].strip()
        if rid:
            r = parse_date_value(rid[2], rid[1], zones)
            if r:
                key = _key(r[0], r[1], r[2] if r[0] == "dt" else None)
                overrides.setdefault(uid, {})[key] = ev
                continue
        masters.append((uid, ev))

    out = []

    def add(ev, kind, s, e, tz):
        status = (ev.first("STATUS") or ("", {}, ""))[2].strip().upper()
        if status == "CANCELLED":
            return
        title = clean_text((ev.first("SUMMARY") or ("", {}, ""))[2]) or "Busy"
        where = clean_text((ev.first("LOCATION") or ("", {}, ""))[2])
        if kind == "date":
            if not (e > day0 and s <= day1):
                return
            item = {"cal": cal_id, "title": title, "start": s.isoformat(), "end": e.isoformat(), "allDay": True}
        else:
            su, eu = _utc(s, tz), _utc(e, tz)
            if not ((eu > w_from or (eu == su and su >= w_from)) and su < w_to):
                return
            item = {"cal": cal_id, "title": title, "start": su.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "end": eu.strftime("%Y-%m-%dT%H:%M:%SZ"), "allDay": False}
        if where:
            item["where"] = where
        out.append(item)

    def times(ev):
        st = ev.first("DTSTART")
        if not st:
            return None
        s = parse_date_value(st[2], st[1], zones)
        if not s:
            return None
        en, du = ev.first("DTEND"), ev.first("DURATION")
        e = parse_date_value(en[2], en[1], zones) if en else None
        if s[0] == "date":
            if e and e[0] == "date" and e[1] > s[1]:
                dur = e[1] - s[1]
            elif du and parse_duration(du[2]):
                dur = datetime.timedelta(days=max(1, parse_duration(du[2]).days))
            else:
                dur = datetime.timedelta(days=1)
            return "date", datetime.datetime.combine(s[1], datetime.time()), dur, None
        naive, tz = s[1], s[2]
        if e and e[0] == "dt":
            # (an end in another zone: its instant, as a wall time in the start's zone)
            end_wall = e[1] if e[2] is tz else e[1].replace(tzinfo=e[2]).astimezone(tz).replace(tzinfo=None)
            dur = end_wall - naive
        elif du and parse_duration(du[2]) is not None:
            dur = parse_duration(du[2])
        else:
            dur = datetime.timedelta(0)
        if dur < datetime.timedelta(0):
            dur = datetime.timedelta(0)
        return "dt", naive, dur, tz

    def emit_one(ev, kind, start_naive, dur, tz):
        if kind == "date":
            s = start_naive.date()
            add(ev, kind, s, (start_naive + dur).date(), None)
        else:
            add(ev, kind, start_naive, start_naive + dur, tz)

    for uid, ev in masters:
        t = times(ev)
        if t is None:
            continue
        kind, start, dur, tz = t
        own = overrides.get(uid, {})
        exdates = set()
        for ex in ev.all("EXDATE"):
            for x in ex[2].split(","):
                v = parse_date_value(x, ex[1], zones)
                if v:
                    exdates.add(_key("date" if kind == "date" else v[0], v[1], v[2] if v[0] == "dt" else tz))
        rr = ev.first("RRULE")
        rule = parse_rrule(rr[2], zones, tz) if rr else None
        starts = [start]
        if rule:
            # the window as wall times in the event's zone (a day's margin; the exact check is in add())
            zt = tz or zone
            wf = w_from.astimezone(zt).replace(tzinfo=None) - dur - datetime.timedelta(days=1)
            wt = w_to.astimezone(zt).replace(tzinfo=None) + datetime.timedelta(days=1)
            until = rule["until"]
            if until is None:
                un = None
            elif isinstance(until, datetime.datetime):
                un = until.astimezone(zt).replace(tzinfo=None) if until.tzinfo else until
            else:
                un = datetime.datetime.combine(until, datetime.time(23, 59, 59))
            starts = expand(start, rule, un, wf, wt)
        for rd in ev.all("RDATE"):
            for x in rd[2].split(","):
                v = parse_date_value(x, rd[1], zones)
                if v and v[0] == ("date" if kind == "date" else "dt"):
                    starts.append(datetime.datetime.combine(v[1], datetime.time()) if v[0] == "date"
                                  else v[1].replace(tzinfo=v[2]).astimezone(tz).replace(tzinfo=None))
        for s in sorted(set(starts)):
            k = _key(kind, s, tz)
            if k in exdates or k in own:
                continue
            emit_one(ev, kind, s, dur, tz)
            if len(out) >= MAX_EVENTS * 2:
                break
    for uid, evs in overrides.items():   # (moved / changed single occurrences — also ones without their series)
        for ev in evs.values():
            t = times(ev)
            if t:
                emit_one(ev, t[0], t[1], t[2], t[3])
    out.sort(key=lambda e: (e["start"] if not e["allDay"] else e["start"] + "T00:00:00", e["title"]))
    return out[:MAX_EVENTS]


# ---------------------------------------------------------------------------------------------------------------------
# what a panel sees

def panel_view(house, own):
    """The house calendars a panel shows: [{id, name, color, icon?}]. `own` = the panel's settings.calendars (its
    entry with the same id may switch one off, or give it its own colour / icon)."""
    mine = {c["id"]: c for c in own or [] if isinstance(c, dict) and isinstance(c.get("id"), str)}
    out = []
    for h in house:
        o = mine.get(h["id"], {})
        if o.get("on") is False:
            continue
        item = {"id": h["id"], "name": h["name"],
                "color": o["color"] if isinstance(o.get("color"), str) and COLOR_RE.fullmatch(o["color"]) else h["color"]}
        if isinstance(o.get("icon"), str) and re.fullmatch(r"ic:[A-Za-z0-9]{1,40}|up:[0-9a-f]{16}", o["icon"]):
            item["icon"] = o["icon"]
        if h.get("broken"):   # (never worked: the panel can say so)
            item["broken"] = True
        out.append(item)
    return out


def _new_id(taken):
    """A random id for a new calendar (never from its name: a calendar removed and added again under the same name
    must not inherit the panels' old choices for it)."""
    while True:
        cid = "c" + secrets.token_hex(5)
        if cid not in taken:
            return cid


def _now_iso():
    return datetime.datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class Calendars:
    """The house's calendars: private/calendars.json (with the links) and private/calendar-cache.json (each one's
    last good events + status)."""

    def __init__(self, private_dir, log=None):
        self.dir = private_dir
        self.log = log or (lambda m: None)
        self.on_change = None   # called after a fetch changed a calendar's events (server.py: tell the panels)
        self.lock = threading.Lock()
        self.busy = set()
        self.last_asked = {}
        self.clock = time.monotonic   # (tests: a fake one)
        self.fetcher = None           # (tests: a stub in place of fetch() — never the internet)
        self.last_all = None          # (v3.0.2: clock() of the last fetch of them all — the refresher counts from it)
        self._every = DEFAULT_EVERY
        self._cfg = None
        self._cache = None

    # ---- files ----
    def _load(self):
        if self._cfg is None:
            cfg = guest_wifi.read_json(self.dir / CONFIG, {}) or {}
            cals = []
            for c in cfg.get("calendars") or []:
                if (isinstance(c, dict) and isinstance(c.get("id"), str) and ID_RE.fullmatch(c["id"]) and isinstance(c.get("link"), str)
                        and isinstance(c.get("name"), str)):
                    cals.append({"id": c["id"], "name": c["name"][:60] or c["id"],
                                 "color": c["color"] if isinstance(c.get("color"), str) and COLOR_RE.fullmatch(c["color"]) else DEFAULT_COLOR,
                                 "link": c["link"]})
            self._cfg = cals[:MAX_CALENDARS]
            ev = cfg.get("every")
            self._every = ev if type(ev) is int and ev in EVERY_CHOICES else DEFAULT_EVERY   # (v3.0.2: a bad file: the default)
            cache = guest_wifi.read_json(self.dir / CACHE, {}) or {}
            self._cache = {k: v for k, v in (cache.get("cals") or {}).items() if isinstance(v, dict)}
        return self._cfg

    def _save_cfg(self):
        guest_wifi.write_private(self.dir / CONFIG, json.dumps({"v": 1, "every": self._every, "calendars": self._cfg}, indent=1))

    def _save_cache(self):
        guest_wifi.write_private(self.dir / CACHE, json.dumps({"v": 1, "cals": self._cache}, separators=(",", ":")))

    # ---- the Manager ----
    def configured(self):
        with self.lock:
            return bool(self._load())

    def house(self):
        """[{id, name, color}] — never the links. "broken": true for one that never worked (checked, an error, and
        no good copy ever) — the panels can say so instead of showing nothing."""
        with self.lock:
            out = []
            for c in self._load():
                st = self._cache.get(c["id"]) or {}
                out.append({"id": c["id"], "name": c["name"], "color": c["color"],
                            **({"broken": True} if st.get("fetched") and st.get("error") and not st.get("okAt") else {})})
            return out

    def problems(self):
        """[(id, name, error)] of the calendars whose last check failed (the health monitor's notices)."""
        with self.lock:
            return [(c["id"], c["name"], (self._cache.get(c["id"]) or {}).get("error")) for c in self._load()
                    if (self._cache.get(c["id"]) or {}).get("error")]

    def every(self):
        """(v3.0.2) Minutes between the automatic checks (5 / 10 / 15 / 30)."""
        with self.lock:
            self._load()
            return self._every

    def set_every(self, minutes):
        """(v3.0.2) The house's "check every … minutes": exactly one of EVERY_CHOICES (Invalid otherwise); saved with the
        calendars; the refresher uses it at its next tick (no restart)."""
        if type(minutes) is not int or minutes not in EVERY_CHOICES:
            raise Invalid("Check every 5, 10, 15 or 30 minutes")
        with self.lock:
            self._load()
            old, self._every = self._every, minutes
            try:
                self._save_cfg()
            except OSError:
                self._every = old
                raise
        self.log(f"calendars: checked every {minutes} min")

    def last_checked(self):
        """(v3.0.2) The latest check of any calendar (ISO, UTC) or None."""
        with self.lock:
            self._load()
            return max((st.get("fetched") or "" for st in self._cache.values()), default="") or None

    def exists(self, cid):
        with self.lock:
            return any(c["id"] == cid for c in self._load())

    def public(self):
        """The Manager's list: [{id, name, color, linkSet, status: {state, error, fetched, okAt, events}}] — never the links."""
        with self.lock:
            out = []
            for c in self._load():
                st = self._cache.get(c["id"]) or {}
                state = "waiting" if not st.get("fetched") else "error" if st.get("error") else "ok"
                out.append({"id": c["id"], "name": c["name"], "color": c["color"], "linkSet": bool(c["link"]),
                            "status": {"state": state, "error": st.get("error"), "fetched": st.get("fetched"),
                                       "okAt": st.get("okAt"), "events": len(st.get("events") or [])}})
            return out

    @staticmethod
    def _name(v):
        if not isinstance(v, str) or not house_model.safe_text(v, 60):
            raise Invalid("Give the calendar a name")
        return house_model.safe_text(v, 60)

    @staticmethod
    def _color(v):
        if v is None:
            return DEFAULT_COLOR
        if not isinstance(v, str) or not COLOR_RE.fullmatch(v):
            raise Invalid("The color must look like #8b5cf6")
        return v.lower()

    @staticmethod
    def _fingerprint(link):
        # (the host in any upper / lower case is the same calendar: CALENDAR.google.com = calendar.google.com)
        try:
            u = urllib.parse.urlsplit(link)
            login, at, host = u.netloc.rpartition("@")
            link = urllib.parse.urlunsplit((u.scheme.lower(), login + at + host.lower(), u.path, u.query, u.fragment))
        except ValueError:
            pass
        return hashlib.sha256(link.encode("utf-8")).hexdigest()

    def _dupe(self, link, but=None):
        fp = self._fingerprint(link)
        for c in self._cfg:
            if c["id"] != but and self._fingerprint(c["link"]) == fp:
                return c["name"]
        return None

    def add(self, name, link, color=None):
        """A new calendar → its id. Invalid in plain words."""
        name, color, link = self._name(name), self._color(color), clean_link(link)
        with self.lock:
            cals = self._load()
            if len(cals) >= MAX_CALENDARS:
                raise Invalid(f"At most {MAX_CALENDARS} calendars")
            if (other := self._dupe(link)) is not None:
                raise Invalid(f"That calendar is already added (as “{other}”)")
            cid = _new_id({c["id"] for c in cals})
            cals.append({"id": cid, "name": name, "color": color, "link": link})
            self._save_cfg()
            self._cache.pop(cid, None)
            self._save_cache()
        self.log(f"calendars: added {cid}")
        return cid

    def change(self, cid, name=None, color=None, link=None):
        """Rename, a new default colour, or a new link (Replace). Invalid / KeyError (no such calendar)."""
        name = self._name(name) if name is not None else None
        color = self._color(color) if color is not None else None
        link = clean_link(link) if link is not None else None
        with self.lock:
            c = next((x for x in self._load() if x["id"] == cid), None)
            if c is None:
                raise KeyError(cid)
            if link is not None and (other := self._dupe(link, but=cid)) is not None:
                raise Invalid(f"That calendar is already added (as “{other}”)")
            if name is not None:
                c["name"] = name
            if color is not None:
                c["color"] = color
            if link is not None:
                c["link"] = link
                self._cache.pop(cid, None)   # (another calendar now: its events come with the next fetch)
                self._save_cache()
            self._save_cfg()
        self.log(f"calendars: changed {cid}" + (" (new link)" if link is not None else ""))

    def remove(self, cid):
        with self.lock:
            cals = self._load()
            if not any(c["id"] == cid for c in cals):
                raise KeyError(cid)
            self._cfg = [c for c in cals if c["id"] != cid]
            self._save_cfg()
            self._cache.pop(cid, None)
            self._save_cache()
        self.log(f"calendars: removed {cid}")

    # ---- fetching ----
    def refresh(self, cid=None, fetcher=None, now=None):
        """Fetch one calendar (cid) or all of them, one after another (the background refresher); each keeps its last
        good events when its fetch fails. One being fetched already (another thread) is skipped.
        → {checked, newEvents, changes, errors: [{id, name, error}]}."""
        fetcher = fetcher or self.fetcher or fetch
        if cid is None:
            self.last_all = self.clock()
        summary = {"checked": 0, "newEvents": 0, "changes": 0, "errors": []}
        with self.lock:
            todo = [(c["id"], c["name"], c["link"]) for c in self._load() if cid is None or c["id"] == cid]
            todo = [t for t in todo if t[0] not in self.busy]
            self.busy.update(t[0] for t in todo)
        changed = False
        try:
            for t in todo:
                try:
                    changed = self._fetch_one(*t, fetcher, now, summary) or changed
                finally:
                    with self.lock:   # (v3.0.2: let go one by one — "Check calendars now" waits for exactly these)
                        self.busy.discard(t[0])
        finally:
            with self.lock:
                self.busy.difference_update(t[0] for t in todo)
        if changed:
            self._changed()
        return summary

    def _changed(self):
        if self.on_change:
            try:
                self.on_change()
            except Exception:
                pass

    def _fetch_one(self, c_id, c_name, link, fetcher, now, summary):
        """One calendar fetched and its cache entry updated; adds to summary (under the lock). True when its events
        changed. (v3.0.2) newEvents: how many more events it has than before (an edited one isn't new); changes: the
        events that weren't there exactly like this before (new or edited)."""
        events, error = None, None
        try:
            body = fetcher(link)
            text = body.decode("utf-8", "replace") if isinstance(body, bytes) else str(body)
            events = parse_events(text, c_id, now=now)
        except (FetchError, Invalid) as e:
            error = str(e)
        except Exception as e:   # (a calendar file that trips the parser: never the whole refresh)
            error = "The calendar couldn't be read"
            self.log(f"calendars: {c_id}: unreadable ({type(e).__name__})")
        changed = False
        with self.lock:
            if not any(c["id"] == c_id and c["link"] == link for c in self._load()):
                return False   # (removed or given a new link meanwhile)
            st = self._cache.setdefault(c_id, {})
            st["fetched"] = _now_iso()
            summary["checked"] += 1
            if error is None:
                old = st.get("events") or []
                changed = old != events
                seen = {json.dumps(e, sort_keys=True) for e in old}
                summary["changes"] += sum(json.dumps(e, sort_keys=True) not in seen for e in events)
                summary["newEvents"] += max(0, len(events) - len(old))
                st.update(events=events, okAt=st["fetched"], error=None)
            else:
                st["error"] = error
                st.setdefault("events", [])
                summary["errors"].append({"id": c_id, "name": c_name, "error": error})
            try:
                self._save_cache()
            except OSError as e:
                self.log(f"calendars: cache not written ({type(e).__name__})")
        if error:
            self.log(f"calendars: {c_id}: {error}")
        return changed

    def check_all(self, fetcher=None, cap=None, workers=None):
        """(v3.0.2) The Manager's "Check calendars now": all of them, CHECK_ALL_WORKERS at a time, answered within
        CHECK_ALL_CAP seconds → {checked, stillChecking, failed, newEvents, changes, errors}. A calendar the refresher is
        fetching right now is waited for (up to the cap) and counted as it ended; one not done by then is "still
        checking" (it goes on behind — its events reach the panels when it's done). TooSoon within CHECK_ALL_GAP of the
        last one asked for (calendar services throttle)."""
        cap = CHECK_ALL_CAP if cap is None else cap
        workers = CHECK_ALL_WORKERS if workers is None else workers
        t, last = self.clock(), self.last_asked.get("all")
        if last is not None and t - last < CHECK_ALL_GAP:
            raise TooSoon(max(1, int(CHECK_ALL_GAP - (t - last) + 0.999)))
        self.last_asked["all"] = t
        self.last_all = t
        fetcher = fetcher or self.fetcher or fetch
        end = time.monotonic() + cap
        summary = {"checked": 0, "newEvents": 0, "changes": 0, "errors": []}
        with self.lock:
            cals = [(c["id"], c["name"], c["link"]) for c in self._load()]
            waiting = {c[0] for c in cals if c[0] in self.busy}   # (the refresher has them: their result is its)
            todo = [c for c in cals if c[0] not in waiting]
            self.busy.update(c[0] for c in todo)
        state = {"answered": False, "changed": False, "left": len(todo), "queue": list(todo)}
        done = threading.Event()

        def worker():
            while True:
                with self.lock:
                    if not state["queue"]:
                        return
                    c = state["queue"].pop(0)
                changed = False
                try:
                    changed = self._fetch_one(*c, fetcher, None, summary)
                except Exception as e:   # (never a calendar left marked busy)
                    self.log(f"calendars: {c[0]}: not checked ({type(e).__name__})")
                finally:
                    with self.lock:
                        self.busy.discard(c[0])
                        state["changed"] = state["changed"] or changed
                        late = state["answered"]
                        state["left"] -= 1
                        if not state["left"]:
                            done.set()
                if late and changed:   # (done after the answer: it tells the panels itself)
                    self._changed()

        for _ in range(min(max(1, workers), len(todo))):
            threading.Thread(target=worker, name="calendar-check", daemon=True).start()
        if todo:
            done.wait(max(0.0, end - time.monotonic()))
        while waiting:
            with self.lock:
                ended = {w for w in waiting if w not in self.busy}
                for w in ended:   # (the refresher finished it: counted as it ended)
                    st = (self._cache or {}).get(w) or {}
                    summary["checked"] += 1
                    if st.get("error"):
                        summary["errors"].append({"id": w, "name": next((c[1] for c in cals if c[0] == w), w), "error": st["error"]})
            waiting -= ended
            if not waiting or time.monotonic() >= end:
                break
            time.sleep(0.05)
        with self.lock:
            state["answered"] = True
            changed = state["changed"]
            out = {**summary, "errors": list(summary["errors"]), "stillChecking": state["left"] + len(waiting)}
            out["failed"] = len(out["errors"])
        if changed:
            self._changed()
        return out

    def due(self):
        """(v3.0.2) The refresher's question: is a fetch of them all due (never yet, or `every` minutes since the last)?"""
        return self.last_all is None or self.clock() - self.last_all >= self.every() * 60

    def refresh_soon(self, cid=None):
        """A refresh on its own thread (after a save; the Manager's "Check now" — once per 20 s per calendar)."""
        key = cid or "*"
        if time.monotonic() - self.last_asked.get(key, -1e9) < 20:
            return False
        self.last_asked[key] = time.monotonic()
        threading.Thread(target=self.refresh, args=(cid,), name="calendar-fetch", daemon=True).start()
        return True

    def start(self, stop=None, tick=5):
        # (v3.0.2: was a fixed REFRESH wait — now it looks every `tick` s whether the house's setting says it's due, so a
        # new "every" applies at once and a "Check now" postpones the next automatic check)
        stop = stop or threading.Event()

        def loop():
            while True:
                try:
                    if self.due():
                        self.refresh()
                except Exception:   # (never let the loop die)
                    pass
                if stop.wait(tick):
                    return
        t = threading.Thread(target=loop, name="calendars", daemon=True)
        t.start()
        return t, stop

    # ---- the panels ----
    def events(self, ids, now=None):
        """The cached events of these calendars, without the ones that already ended before yesterday."""
        zone = server_zone()
        now = (now or datetime.datetime.now(UTC)).astimezone(zone)
        day0 = (now.date() - datetime.timedelta(days=1)).isoformat()
        w_from = datetime.datetime.combine(now.date() - datetime.timedelta(days=1), datetime.time(), tzinfo=zone).astimezone(UTC)
        cut = w_from.strftime("%Y-%m-%dT%H:%M:%SZ")
        with self.lock:
            self._load()
            out = []
            for cid in ids:
                for e in (self._cache.get(cid) or {}).get("events") or []:
                    if isinstance(e, dict) and (e.get("end", "") > day0 if e.get("allDay") else e.get("end", "") > cut or e.get("start", "") >= cut):
                        out.append(e)
        out.sort(key=lambda e: (e["start"] if not e.get("allDay") else e["start"] + "T00:00:00", e.get("title", "")))
        return out
