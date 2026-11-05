"""(v3.0.4) What each camera's name label shows (Manager → Cameras → a camera → Label): its room, its name, your own
text, any mix, or nothing. The same label on a camera tile, the Cameras page and full screen. Kept in
DATA_DIR/house/camera-labels.json — apart from own-cameras.json, so a label change never restarts the camera video.
A camera not in the file shows its name and room, as before 3.0.4. Every panel gets the labels with its own data
(GET /api/panel/<id> "house").
"""
import json
import os
import pathlib
import re
import secrets

FILE = "camera-labels.json"
DEFAULT = {"room": True, "name": True, "custom": False, "text": ""}   # (today's look: the name and the room)
MAX = 500


class Invalid(ValueError):
    pass


def clean_text(v):
    """Your own text: the house model's safe text rules (no characters that could end HTML), at most 40."""
    if not isinstance(v, str):
        raise Invalid("text: text")
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f<>&\"'`\\]", "", v)).strip()[:40]


def clean(d):
    """One stored label → every field valid (anything missing: today's look)."""
    d = d if isinstance(d, dict) else {}
    out = {k: d[k] if isinstance(d.get(k), bool) else v for k, v in DEFAULT.items() if k != "text"}
    try:
        out["text"] = clean_text(d.get("text", ""))
    except Invalid:
        out["text"] = ""
    return out


def load(house_dir):
    """{camera id (str): label} — only the cameras whose label was changed."""
    try:
        doc = json.loads((pathlib.Path(house_dir) / FILE).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {k: clean(v) for k, v in doc.items() if re.fullmatch(r"\d{1,9}", str(k))} if isinstance(doc, dict) else {}


def change(house_dir, cam_id, req, known_ids=()):
    """{room, name, custom: bool, text} for one camera → saved; returns all the labels. A label equal to today's look
    is taken out of the file."""
    if not isinstance(cam_id, int) or isinstance(cam_id, bool) or cam_id not in set(known_ids):
        raise Invalid("no such camera")
    if not isinstance(req, dict):
        raise Invalid("a label")
    labels = load(house_dir)
    cur = labels.get(str(cam_id), dict(DEFAULT))
    for k in ("room", "name", "custom"):
        if k in req:
            if not isinstance(req[k], bool):
                raise Invalid(f"{k}: true or false")
            cur[k] = req[k]
    if "text" in req:
        cur["text"] = clean_text(req["text"])
    if cur == DEFAULT:
        labels.pop(str(cam_id), None)
    else:
        labels[str(cam_id)] = cur
    if len(labels) > MAX:
        raise Invalid(f"at most {MAX} camera labels")
    p = pathlib.Path(house_dir) / FILE
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(f".{p.name}.{secrets.token_hex(6)}.tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(labels, f, indent=1, sort_keys=True)
    os.replace(tmp, p)
    return labels


def parts(label, name, room):
    """What a label shows, in order: [name, room, your text] (the same rule as the panels' Cameras.labelParts)."""
    lb = clean(label) if label else dict(DEFAULT)
    return [x for x, on in ((name, lb["name"]), (room, lb["room"]), (lb["text"], lb["custom"])) if on and x]
