"""Place search for the layout builder's weather card (v3.0.0): GET /api/manage/geocode asks Open-Meteo's geocoding
service from the server — the Manager's page may not reach other sites (its CSP: connect-src 'self'), which is why a
search from the browser always found "no place".

Only HTTPS to geocoding-api.open-meteo.com (a fixed address, certificates checked, no redirects followed, no proxy from
the environment, 5 s), the name at most 60 characters, a plain language code; back come at most 6 places with only
name, admin1, country_code, latitude, longitude. The query itself is never logged. Python 3.12 stdlib only.
"""
import json
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://geocoding-api.open-meteo.com/v1/search"
TIMEOUT = 5
MAX_Q = 60
MAX_RESULTS = 6
LANG_RE = re.compile(r"[a-z]{2,3}")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):   # (never followed)
        return None


def _opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect(),
                                       urllib.request.HTTPSHandler(context=ssl.create_default_context()))


def clean_lang(lang):
    """"de-CH" → "de"; anything else → "en"."""
    base = str(lang or "").strip().lower().split("-", 1)[0].split("_", 1)[0]
    return base if LANG_RE.fullmatch(base) else "en"


def _text(v, n):
    return re.sub(r"[\x00-\x1f\x7f<>]", "", v)[:n] if isinstance(v, str) else None


def _num(v, lo, hi):
    return round(float(v), 4) if isinstance(v, (int, float)) and not isinstance(v, bool) and lo <= v <= hi else None


def lookup(q, lang="en", opener=None):
    """→ (status, places). status "ok" (places may be empty: no place by that name), "bad" (the name), or "unreachable"
    (no answer, an error, a redirect or something that isn't the answer we expect)."""
    q = (q or "").strip() if isinstance(q, str) else ""
    if not q or len(q) > MAX_Q:
        return "bad", []
    url = BASE + "?" + urllib.parse.urlencode({"name": q, "count": MAX_RESULTS, "language": clean_lang(lang), "format": "json"})
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Skypane"})
    try:
        with (opener or _opener()).open(req, timeout=TIMEOUT) as r:
            if r.status != 200:
                return "unreachable", []
            raw = r.read(256 * 1024)
    except (urllib.error.URLError, OSError, ValueError):   # (HTTPError — a redirect too — is a URLError)
        return "unreachable", []
    try:
        ans = json.loads(raw.decode("utf-8", "replace"))
    except ValueError:
        return "unreachable", []
    if not isinstance(ans, dict):
        return "unreachable", []
    out = []
    for p in ans.get("results") or []:
        if not isinstance(p, dict):
            continue
        name, lat, lon = _text(p.get("name"), 60), _num(p.get("latitude"), -90, 90), _num(p.get("longitude"), -180, 180)
        if not name or lat is None or lon is None:
            continue
        place = {"name": name, "latitude": lat, "longitude": lon}
        a1, cc = _text(p.get("admin1"), 60), _text(p.get("country_code"), 3)
        if a1:
            place["admin1"] = a1
        if cc and re.fullmatch(r"[A-Za-z]{2,3}", cc):
            place["country_code"] = cc.upper()
        out.append(place)
        if len(out) >= MAX_RESULTS:
            break
    return "ok", out
