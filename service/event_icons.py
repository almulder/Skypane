"""Calendar event icons (v3.0.2): the house's list of which words in an event's title show which icon and colour —
Manager → Integrations → Calendars → Event icons (the admin), CR mockups/CR-event-icons.md, owner's guide
docs/calendar-icons.md.

  DATA_DIR/house/event-icons.json = {"v": 1, "lang": "en", "icons": [{id, name, icon, color, words: [...], on}],
                                     "edited": bool, "updated": iso}
Missing file = the house language's DEFAULTS. A damaged one: the defaults are used and the file is left alone until the
admin saves (so nothing of theirs is overwritten by a read). Written atomically.

Matching (the panel's data.js `wordRe`, the Manager's eventicons.js — the same line, test_event_icons.py checks):
lowercase title; a word counts on its own or with an everyday ending (s|es|er|ers|ing|ed|ist|ists; v3.0.2: a word
ending in y also as -ies, party → parties); the first icon from the top with a matching word wins; switched-off icons
are skipped. (v3.0.2) A word has at least 2 characters: letters (any script, their marks too), digits, spaces, .'-&.

The panels get the list with their events (/api/panel/<id>/events → "icons": the switched-on ones, {id, icon, color,
words}); until it arrives they use their built-in copy of DEFAULTS["en"] (data.js CATEGORIES — kept identical: the test).
"""
import datetime
import json
import os
import pathlib
import re
import secrets
import unicodedata

FILE = "event-icons.json"
MAX_ICONS, MAX_WORDS, MAX_WORD, MAX_NAME = 60, 30, 40, 40
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")
COLOR_RE = re.compile(r"^#[0-9a-f]{6}$")
WORD_PUNCT = " .'&-"   # (besides letters — any script's, their combining marks too — and digits: all a word may have)
ICONS_JS = pathlib.Path(__file__).resolve().parent.parent / "dashboard" / "layouts" / "v4" / "shared" / "icons.js"


def _i(id, name, icon, color, words):
    return {"id": id, "name": name, "icon": icon, "color": color, "words": words, "on": True}


# The defaults per language (a translation adds its own list: its words, its names). English: the CR's ~40, specific
# before general; the order matters — the first match wins. (v3.0.2: moved from the CR's order, so a word higher up
# doesn't take a title meant for one below — vet, groomer, spa, hair and car above Doctor ("appointment", "clinic",
# "checkup"; Car also above Church's "service"); Call above Work ("call"); Bills above Deadline ("due"); Shopping above
# Gym ("Costco run"); Games above Kids' sports ("game night"); Gym and Hobby above School ("yoga class", "painting
# class"); Church above Learning ("bible study"); Movie above Concert ("movie theater"). Merged: Date night into
# Anniversary (a bare "date" took "Rent due date"), Hotel into Travel, Reading into Learning; "lesson" left to Learning.)
DEFAULTS = {"en": [
    _i("surgery", "Surgery", "bandage", "#f43f5e", ["surgery", "operation", "procedure"]),
    _i("hospital", "Hospital", "hospital", "#ef4444", ["hospital", "er visit", "urgent care", "emergency room"]),
    _i("dentist", "Dentist", "tooth", "#22d3ee", ["dentist", "dental", "teeth", "orthodont", "cleaning appointment"]),
    _i("eyes", "Eyes", "eye", "#2dd4bf", ["eye", "eyes", "optometr", "ophthalmolog", "optician", "eye exam", "vision", "glasses", "contacts"]),
    _i("pain", "Pain clinic", "pill", "#fb7185", ["pain dr", "pain doctor", "pain clinic"]),
    _i("vet", "Pets: vet", "paw", "#f59e0b", ["vet", "vaccination", "vaccine", "shots"]),
    _i("groomer", "Pets: groomer", "dog", "#fbbf24", ["groom", "grooming", "dog walk", "kennel", "boarding"]),
    _i("spa", "Self-care & spa", "sparkles", "#f0abfc", ["spa", "massage", "facial", "nails", "manicure", "pedicure", "self-care", "relax", "mental health day"]),
    _i("hair", "Hair", "scissors", "#f472b6", ["hair", "salon", "barber", "haircut"]),
    _i("car", "Car", "car", "#94a3b8", ["oil change", "mechanic", "car service", "tires", "inspection", "registration", "car wash"]),
    _i("doctor", "Doctor", "stethoscope", "#38bdf8", ["doctor", "dr", "dr.", "checkup", "physical", "clinic", "appointment", "appt"]),
    _i("meds", "Medication", "pill", "#fda4af", ["medication", "meds", "pills", "prescription", "pharmacy", "refill", "vitamins", "supplements"]),
    _i("birthday", "Birthday", "cake", "#e879f9", ["birthday", "bday"]),
    _i("anniversary", "Anniversary & date night", "heart", "#ec4899", ["anniversary", "wedding", "date night"]),
    _i("holiday", "Holiday", "gift", "#f87171", ["holiday", "christmas", "thanksgiving", "easter", "halloween", "new year", "hanukkah", "diwali", "eid"]),
    _i("party", "Party", "party", "#c084fc", ["party", "get-together", "bbq", "barbecue", "celebration", "shower"]),
    _i("coffee", "Coffee & meetups", "coffee", "#d6a26b", ["coffee", "catch up", "catch-up", "meetup", "hang out"]),
    _i("meals", "Meals", "utensils", "#fb923c", ["dinner", "lunch", "breakfast", "brunch", "restaurant", "potluck"]),
    _i("try", "New place to try", "pin", "#fca5a5", ["try", "new place", "explore"]),
    _i("travel", "Travel & hotels", "plane", "#60a5fa", ["flight", "fly", "trip", "travel", "vacation", "airport", "getaway", "hotel", "check-in", "check-out", "airbnb", "stay"]),
    _i("phone", "Call / keep in touch", "phone", "#5eead4", ["call mom", "call dad", "check in", "facetime", "keep in touch"]),
    _i("work", "Work meeting", "briefcase", "#a78bfa", ["work", "meeting", "call", "conference", "zoom", "teams", "standup", "huddle", "client"]),
    _i("bills", "Bills", "receipt", "#facc15", ["bill", "bills", "rent", "mortgage", "payment", "utilities", "credit card", "due date"]),
    _i("deadline", "Deadline", "flag", "#fb923c", ["deadline", "due", "submit"]),
    _i("shopping", "Shopping", "cart", "#34d399", ["shopping", "costco", "groceries", "grocery", "store", "target", "walmart"]),
    _i("games", "Games", "gamepad", "#818cf8", ["game night", "video game", "release", "launch", "board game"]),
    _i("gym", "Gym & workout", "dumbbell", "#4ade80", ["gym", "workout", "yoga", "pilates", "run", "running", "crossfit", "training session", "spin"]),
    _i("hobby", "Hobby", "palette", "#f9a8d4", ["craft", "crafts", "hobby", "puzzle", "painting class", "guitar", "piano"]),
    _i("church", "Church & prayer", "church", "#c4b5fd", ["church", "temple", "mass", "service", "prayer", "mosque", "synagogue", "bible study", "meditation"]),
    _i("school", "School", "school", "#fde047", ["school", "class", "homework", "project", "exam", "parent-teacher", "pta"]),
    _i("sports", "Kids' sports", "trophy", "#22c55e", ["practice", "game", "match", "soccer", "baseball", "football", "basketball", "hockey", "swim", "tournament"]),
    _i("learning", "Learning & reading", "book", "#93c5fd", ["course", "study", "lesson", "training", "webinar", "lecture", "book club", "reading", "read"]),
    _i("community", "Community event", "users", "#fdba74", ["festival", "market", "farmers market", "fair", "parade", "fundraiser", "volunteer"]),
    _i("movie", "Movie & TV", "film", "#a5b4fc", ["movie", "film", "cinema", "premiere", "episode", "season", "finale"]),
    _i("concert", "Concert & show", "ticket", "#d946ef", ["concert", "show", "theater", "theatre", "play", "recital", "gig"]),
    _i("money", "Payday & money", "wallet", "#86efac", ["payday", "paycheck", "budget", "savings", "taxes", "tax"]),
    _i("subscription", "Subscription", "refresh", "#7dd3fc", ["subscription", "renewal", "renew", "membership", "trial ends"]),
    _i("cleaning", "Cleaning & chores", "broom", "#67e8f9", ["cleaning", "clean", "laundry", "chores", "vacuum"]),
    _i("trash", "Trash day", "trashBin", "#a3a3a3", ["trash", "garbage", "recycling", "bins", "bulk pickup"]),
    _i("garden", "Garden & plants", "plant", "#84cc16", ["water plants", "plants", "garden", "gardening", "mow", "lawn", "fertilize"]),
    _i("delivery", "Delivery", "package", "#fcd34d", ["delivery", "package", "parcel", "shipment", "pickup", "mail", "po box"]),
]}


class Invalid(ValueError):
    pass


def lang_of(lang):
    return lang if lang in DEFAULTS else "en"


def defaults(lang="en"):
    return json.loads(json.dumps(DEFAULTS[lang_of(lang)]))   # (a copy: callers may change it)


_avail = {"key": None, "names": ()}


def available(dashboard_dir=None):
    """The icon names a panel can draw: the keys of icons.js's P (the served dashboard's copy, else the repo's)."""
    for p in ([pathlib.Path(dashboard_dir) / "layouts" / "v4" / "shared" / "icons.js"] if dashboard_dir else []) + [ICONS_JS]:
        try:
            st = p.stat()
            key = (str(p), st.st_mtime_ns, st.st_size)
            if _avail["key"] != key:
                src = p.read_text(encoding="utf-8")
                body = src[src.index("const P = {"):src.index("};", src.index("const P = {"))]
                _avail.update(key=key, names=tuple(re.findall(r"^\s{4}([A-Za-z][A-Za-z0-9]*): '", body, re.M)))
            if _avail["names"]:
                return list(_avail["names"])
        except (OSError, ValueError):
            continue
    return sorted({i["icon"] for i in DEFAULTS["en"]} | {"calendar"})


def clean_word(w):
    """A word as kept: lowercase, trimmed, inner spaces one; refused (Invalid) when too long or with other characters."""
    if not isinstance(w, str):
        raise Invalid("a word must be text")
    w = " ".join(unicodedata.normalize("NFC", w).lower().split())
    if len(w) > MAX_WORD:
        raise Invalid(f"word too long (at most {MAX_WORD} characters): {w[:20]}…")
    # (v3.0.2: by Unicode category — L letters, M the marks of Hindi / Thai / Arabic… ("दिवाली"), N digits; \w leaves
    # the combining marks out)
    if w and (any(c not in WORD_PUNCT and unicodedata.category(c)[0] not in "LMN" for c in w)
              or not any(unicodedata.category(c)[0] in "LN" for c in w)):
        raise Invalid(f"only letters, digits, spaces and .'-& in a word: {w[:40]}")
    if len(w) == 1:   # (v3.0.2: "<b>" cleaned to "b" would match "Plan B")
        raise Invalid(f"a word needs at least 2 characters: {w}")
    return w


def clean_icons(icons, avail):
    """The list as the admin sent it → the list as kept; Invalid with what's wrong (the Manager says it)."""
    if not isinstance(icons, list):
        raise Invalid('"icons" must be a list')
    if len(icons) > MAX_ICONS:
        raise Invalid(f"at most {MAX_ICONS} icons")
    out, ids = [], set()
    for n, x in enumerate(icons, 1):
        if not isinstance(x, dict):
            raise Invalid(f"icon {n}: not an icon")
        extra = set(x) - {"id", "name", "icon", "color", "words", "on"}
        if extra:
            raise Invalid(f"icon {n}: unknown {', '.join(sorted(extra))[:40]}")
        iid = x.get("id")
        if not isinstance(iid, str) or not ID_RE.fullmatch(iid) or iid in ids:
            raise Invalid(f"icon {n}: a missing, odd or repeated id")
        ids.add(iid)
        name = x.get("name")
        name = " ".join(name.split()) if isinstance(name, str) else ""
        if not name or len(name) > MAX_NAME or any(unicodedata.category(c)[0] == "C" for c in name):
            raise Invalid(f"icon {n}: a name of 1–{MAX_NAME} characters")
        if x.get("icon") not in avail:
            raise Invalid(f"icon {n}: not an icon the panels have")
        color = x.get("color")
        if not isinstance(color, str) or not COLOR_RE.fullmatch(color.lower()):
            raise Invalid(f"icon {n}: the colour must be #rrggbb")
        words = x.get("words", [])
        if not isinstance(words, list):
            raise Invalid(f"icon {n}: words must be a list")
        kept = []
        for w in words:
            w = clean_word(w)
            if w and w not in kept:
                kept.append(w)
        if len(kept) > MAX_WORDS:
            raise Invalid(f"icon {n}: at most {MAX_WORDS} words")
        on = x.get("on", True)
        if not isinstance(on, bool):
            raise Invalid(f"icon {n}: on must be true or false")
        out.append({"id": iid, "name": name, "icon": x["icon"], "color": color.lower(), "words": kept, "on": on})
    return out


def path(house_dir):
    return pathlib.Path(house_dir) / FILE


def load(house_dir, avail=None):
    """→ {lang, icons, edited, damaged}: the saved list, or the defaults (no file; a damaged one — then damaged: True)."""
    p = path(house_dir)
    try:
        if p.stat().st_size > 256 * 1024:
            raise ValueError("too big")
        doc = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(doc, dict) or doc.get("v") != 1:
            raise ValueError("not a list of event icons")
        lang = lang_of(doc.get("lang"))
        # (an icon a later release no longer has: the plain calendar one, rather than the whole list refused)
        names = set(avail or available())
        icons = [dict(x, icon=x["icon"] if x.get("icon") in names else "calendar") if isinstance(x, dict) else x for x in doc.get("icons") or []]
        return {"lang": lang, "icons": clean_icons(icons, names | {"calendar"}), "edited": doc.get("edited") is True, "damaged": False}
    except FileNotFoundError:
        return {"lang": "en", "icons": defaults("en"), "edited": False, "damaged": False}
    except (OSError, ValueError, KeyError, TypeError):
        return {"lang": "en", "icons": defaults("en"), "edited": False, "damaged": True}


def save(house_dir, icons, lang="en", edited=True):
    p = path(house_dir)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(f".{p.name}.{secrets.token_hex(6)}.tmp")
    tmp.write_text(json.dumps({"v": 1, "lang": lang_of(lang), "icons": icons, "edited": bool(edited),
                               "updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")},
                              indent=1, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, p)


def for_panel(icons):
    """What the panels need: the switched-on icons with words, in order."""
    return [{"id": x["id"], "icon": x["icon"], "color": x["color"], "words": x["words"]} for x in icons if x.get("on") and x.get("words")]
