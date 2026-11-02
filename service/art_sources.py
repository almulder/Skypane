"""Where the animated drawings came from, and whether their authors have changed anything since (release 2).

The drawings in dashboard/layouts/v4/shared/art-extra.js and roomlayoutG.js are adapted from MIT-licensed Home
Assistant cards (CREDITS.md). Their drawings sit inside each card's code and every one had to be reworked for the
panels (re-coloured, animation rebuilt to transform / opacity), so new ones can't be installed automatically. The
Manager's picture picker shows the credits and can ask GitHub what changed in each repo since the version we adapted
from (public API, no key; at most one look every 6 hours, kept in memory — 5 minutes when GitHub didn't answer for
one) — then they're adapted on request.
"""
import datetime
import json
import re
import threading
import time
import urllib.error
import urllib.request

# (repo, author, licence, what we took, adapted from: the repo as of this time, UTC)
SOURCES = (
    ("skyrotter/ha-appliance-electromenager-cards", "skyrotter (Nicolas)", "MIT",
     "61 drawings: freezers, coffee makers, air fryer, robot vacuum, AC, heat pump, solar, battery, EV charger, "
     "AV receiver, PC, cooktop, 3D printer, radiator, server rack, gates, aquarium, boilers, hot tub, sauna, lights, "
     "pumps, robot mower, shutters, UPS…",
     "2026-10-29T20:09:07Z"),
    ("sionetta/wm_animated_ha_card", "sionetta", "MIT", "the dishwasher's racks and dishes, the washer and dryer drum layout",
     "2026-10-26T03:48:53Z"),
    ("ADNPolymerase/ha-appliance-card", "ADNPolymerase", "MIT",
     "16 drawings redrawn from his (kettle, toaster, iron, pet feeder, dehumidifier, router, camera, mailbox…); "
     "ideas for each appliance's motion",
     "2026-10-29T20:41:10Z"),
    ("Anashost/HA-Animated-cards", "Anashost", "CC BY-NC-SA 4.0 (the idea only — nothing copied)",
     "the idea of icons that move per device (our own motions: motions.js)", "2026-10-29T18:00:00Z"),
)
CACHE_SECONDS = 6 * 3600
RETRY_SECONDS = 5 * 60   # (a failed look is tried again after this, not after 6 hours)
_cache = {"at": 0.0, "data": None}
_lock = threading.Lock()


def public():
    """The credits (no network)."""
    return [{"repo": r, "url": f"https://github.com/{r}", "author": a, "licence": lic, "what": w, "since": s}
            for r, a, lic, w, s in SOURCES]


def _plain(v, n):
    return re.sub(r"[\x00-\x1f\x7f<>]", " ", str(v)).strip()[:n]


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "skypane-art-check", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=10) as r:   # nosec: fixed api.github.com URLs only
        return json.loads(r.read(512 * 1024).decode("utf-8"))


def _after(iso):
    """The moment just after our version's commit (GitHub's since= includes the commit at that very second)."""
    t = datetime.datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ") + datetime.timedelta(seconds=1)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def _why(e):
    """Why GitHub didn't answer, in plain words."""
    if isinstance(e, urllib.error.HTTPError):
        if e.code in (403, 429):
            return "GitHub's limit for checks is used up for now — try again in an hour"
        if e.code == 404:
            return "GitHub doesn't know this project any more (renamed or removed?)"
        return f"GitHub had a problem (error {e.code}) — try again later"
    if isinstance(e, (urllib.error.URLError, OSError, TimeoutError)):
        return "GitHub couldn't be reached — is this server online?"
    return "GitHub's answer couldn't be read — try again later"


def check(fetch=_get, now=time.time):
    """For each source: how many changes since our version, the newest few (date + first line), the compare link.
    A repo GitHub can't answer for says so; the whole answer is kept for 6 hours (5 minutes when one failed)."""
    with _lock:
        d = _cache["data"]
        if d is not None and now() - _cache["at"] < (RETRY_SECONDS if d.get("failed") else CACHE_SECONDS):
            return d
        out = []
        for src in public():
            item = {"repo": src["repo"], "url": src["url"]}
            try:
                commits = fetch(f"https://api.github.com/repos/{src['repo']}/commits?since={_after(src['since'])}&per_page=30")
                if not isinstance(commits, list):
                    raise ValueError("not a list")
                news = []
                for c in commits:
                    cm = (c or {}).get("commit") or {}
                    msg = str(cm.get("message") or "").splitlines()
                    if msg and msg[0].startswith("Merge "):
                        continue   # (merges repeat the change under them)
                    news.append({"date": _plain(((cm.get("committer") or {}).get("date") or "")[:10], 10), "title": _plain(msg[0] if msg else "", 100)})
                item.update(changes=len(news), latest=news[:5], compare=f"{src['url']}/commits")
            except Exception as e:   # (offline, rate limit, renamed repo)
                item.update(changes=None, error=_why(e))
            out.append(item)
        _cache.update(at=now(), data={"checked": int(now()), "sources": out, "failed": any(i["changes"] is None for i in out)})
        return _cache["data"]
