"""Cards people make and share (release 2; research: the research notes, upload-security.md §2).

A card is a small package — a manifest plus HTML, CSS and (for "script" cards) JavaScript:

  {"id": "ev-battery", "name": "EV battery", "version": "1.0.0", "author": "…", "description": "…",
   "tier": "template" | "script",
   "slots": [{"key": "car", "label": "Car", "attributes": ["battery", "range"], "commands": ["on", "off"]}],
   "settings": [{"key": "title", "label": "Title", "type": "text" | "number" | "bool" | "select" | "color",
                 "default": …, "options": [...]}],
   "size": {"w": 3, "h": 2},
   "html": "…", "css": "…", "js": "…"}

How it is kept harmless (the sandbox doesn't depend on anyone judging the code):
- Every card runs in its own sandboxed iframe (`sandbox="allow-scripts"`, no same-origin: an opaque origin with no
  cookies, storage or access to the panel page), served by /card-frame/<id> with a strict Content-Security-Policy:
  only scripts whose SHA-256 is listed may run (our bridge, and a script card's own code), no network of any kind
  (connect-src 'none'), no frames, forms or workers, pictures only as data: URLs.
- A template card has no code of its own at all: only our bridge runs in its frame (filling in {{slot.attr}},
  data-if / data-on / data-cmd). Its HTML is cleaned with an allow-list too (no script, no on… handlers, no links,
  forms, frames, meta, base), and its CSS can't load anything.
- The card only ever hears about the devices the owner bound to its slots, only the attributes the slot lists; it
  may only send the commands its slots list — the panel checks every one (grid.js / cards.js) and then the usual
  checks apply (the PIN, "only some panels", the bridge's lists).
- scan() lists what the owner should know before installing (network attempts, hidden code, risky commands…) —
  advice, not a gate. It reads the card as it was SENT too, and says what the cleaning took out ("removed": scripts,
  on… handlers, outside addresses…) — an attempt shows intent even when it can't work. The Manager also offers the
  "check it with an AI" prompt (with the code as sent).
"""
import base64
import hashlib
import html
import html.parser
import json
import os
import pathlib
import re
import secrets
import threading
import time

try:
    from service import house_model, layouts
except ImportError:  # pragma: no cover
    import house_model
    import layouts


class Invalid(ValueError):
    pass


MAX_HTML, MAX_CSS, MAX_JS, MAX_CARDS = 64_000, 32_000, 96_000, 100
ID = re.compile(r"[a-z0-9-]{1,40}")
KEY = re.compile(r"[a-zA-Z][a-zA-Z0-9_]{0,23}")
ATTR = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,39}")
VERSION = re.compile(r"\d{1,4}(\.\d{1,4}){0,3}([-+][0-9A-Za-z.-]{1,20})?")
SETTING_TYPES = ("text", "number", "bool", "select", "color")
RISKY = {"unlock": "unlock a lock", "open": "open a garage door or valve", "setThermostatMode": "change the thermostat's mode",
         "setHeatingSetpoint": "change the heating temperature", "setCoolingSetpoint": "change the cooling temperature"}

# ---------- the HTML allow-list (template and script cards alike) ----------
TAGS = {"div", "span", "p", "b", "i", "em", "strong", "small", "br", "hr", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
        "table", "thead", "tbody", "tr", "td", "th", "img", "button", "label", "section", "header", "footer", "figure",
        "figcaption", "progress", "meter", "sup", "sub", "u", "s", "mark", "code", "pre",
        "svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "text", "tspan", "defs",
        "lineargradient", "radialgradient", "stop", "clippath", "mask", "use", "symbol", "desc"}
VOID = {"br", "hr", "img"}
DROP_WITH_CONTENT = {"script", "style", "iframe", "object", "embed", "template", "noscript", "frame", "frameset", "applet",
                     "math", "foreignobject", "textarea", "select", "head", "title"}
ATTRS = {"class", "id", "title", "role", "alt", "width", "height", "colspan", "rowspan", "value", "max", "min", "low", "high",
         "optimum", "src", "style", "type",
         # SVG
         "viewbox", "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "points", "fill", "stroke",
         "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity",
         "fill-opacity", "fill-rule", "clip-rule", "opacity", "transform", "offset", "stop-color", "stop-opacity",
         "gradientunits", "gradienttransform", "font-size", "font-weight", "text-anchor", "dominant-baseline",
         "preserveaspectratio", "clip-path", "mask", "pathlength", "href", "xmlns", "fx", "fy"}
BAD_CSS = re.compile(r"@import|expression\s*\(|behavior\s*:|-moz-binding|javascript:|</|image-set\s*\(|\bimage\s*\(|\bsrc\s*\(|"
                     r"url\s*\(\s*(?!['\"]?data:image/(png|jpeg|webp|gif|svg\+xml);)", re.I)
SVG_URL = re.compile(r"url\s*\(\s*(?!['\"]?#[A-Za-z][\w-]{0,40}['\"]?\s*\))", re.I)
DATA_IMG = re.compile(r"data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]{1,400000}")


# what the cleaning took out, in plain words (the install box, the AI prompt); "danger" ones try to run code
_GONE_TAG = {"script": ("danger", "scripts (<script>)"), "style": ("warn", "a <style> block inside the HTML"),
             "iframe": ("danger", "embedded pages (<iframe>, <frame>, <object>, <embed>)"), "a": ("warn", "links (<a>)"),
             "form": ("warn", "forms or input boxes"), "input": ("warn", "forms or input boxes"), "meta": ("danger", "<meta>, <base> or <link> tags (they can load or redirect)"),
             "foreignobject": ("warn", "HTML hidden inside the SVG (<foreignObject>)")}
for _t in ("frame", "frameset", "object", "embed", "applet"):
    _GONE_TAG[_t] = _GONE_TAG["iframe"]
for _t in ("base", "link"):
    _GONE_TAG[_t] = _GONE_TAG["meta"]
for _t in ("textarea", "select", "option", "button"):
    _GONE_TAG.setdefault(_t, _GONE_TAG["input"])


class _Clean(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip, self.gone = [], 0, {}

    def _gone(self, level, what):
        if level == "danger" or self.gone.get(what) != "danger":
            self.gone[what] = level

    def handle_starttag(self, tag, attrs, closing=False):
        if self.skip or tag in DROP_WITH_CONTENT:
            if not self.skip or tag == "script":
                self._gone(*_GONE_TAG.get(tag, ("warn", f"<{tag}> parts")))
            if tag in DROP_WITH_CONTENT and tag not in VOID and not closing:
                self.skip += 1
            return
        if tag not in TAGS:
            self._gone(*_GONE_TAG.get(tag, ("warn", f"<{tag}> tags")))
            return
        keep = []
        for k, v in attrs:
            k = (k or "").lower()
            v = "" if v is None else v
            if k.startswith("data-") and re.fullmatch(r"data-[a-z0-9-]{1,30}", k):
                keep.append((k, v[:300]))
            elif k.startswith("aria-") and re.fullmatch(r"aria-[a-z]{1,20}", k):
                keep.append((k, v[:200]))
            elif k in ATTRS:
                if k == "src" and not (tag == "img" and DATA_IMG.fullmatch(v.strip())):
                    self._gone("warn", "pictures or sources from outside the card (src=…)")
                    continue
                if k == "href" and not re.fullmatch(r"#[A-Za-z][\w-]{0,40}", v.strip()):   # (an SVG <use> of its own symbol only)
                    self._gone("warn", "links to other addresses (href=…)")
                    continue
                if k == "style" and ("\\" in v or BAD_CSS.search(v)):
                    self._gone("warn", "styles that load something or hide it with escapes (url(), image-set(), \\…)")
                    continue
                if k in ("fill", "stroke", "mask", "clip-path") and SVG_URL.search(v):
                    self._gone("warn", "SVG paint from outside the card (url(…))")
                    continue
                if re.search(r"javascript:|data:text|vbscript:", v, re.I) and k != "src":
                    self._gone("danger", "javascript: / data:text addresses")
                    continue
                keep.append((k, v[:2000]))
            elif k.startswith("on"):
                self._gone("danger", "event handlers that run code (onclick=, onerror=, onload=…)")
            elif k in ("formaction", "action", "srcset", "srcdoc", "xlink:href", "background", "poster", "ping"):
                self._gone("warn", f"addresses in {k}=")
        a = "".join(f' {k}="{html.escape(v, quote=True)}"' for k, v in keep)
        self.out.append(f"<{tag}{a}{' /' if closing else ''}>")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs, closing=True)

    def handle_endtag(self, tag):
        if tag in DROP_WITH_CONTENT:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip or tag not in TAGS or tag in VOID:
            return
        self.out.append(f"</{tag}>")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(html.escape(data, quote=False))


def clean_html(s, report=None):
    """The card's HTML through the allow-list; `report` (a dict) gets {what was taken out: "danger" | "warn"}."""
    p = _Clean()
    p.feed(s)
    p.close()
    if report is not None:
        report.update(p.gone)
    return "".join(p.out)


def clean_css(s, report=None):
    """The card's CSS with anything that could load or run something taken out (the frame's CSP blocks it anyway)."""
    if report is not None:
        if BAD_CSS.search(s) or BAD_CSS.search(s.replace("\\", "")):
            report["CSS that loads or runs something (url() from outside, @import, expression()…)"] = "warn"
        elif "\\" in s:
            report["backslash escapes in the CSS"] = "warn"
    s = s.replace("\\", "")   # (no escapes: "u\\rl(" must not slip past the checks)
    return BAD_CSS.sub("/*removed*/", s)


# ---------- the manifest ----------
def _text(v, n, what, empty=False):
    if not isinstance(v, str) or (not empty and not v.strip()):
        raise Invalid(f"{what}: text")
    return house_model.safe_text(v, n)


def local_id(raw):
    """A card's id here (also its file name): lowercase letters, digits and -."""
    if not isinstance(raw, str):
        raise Invalid("id: text")
    s = re.sub(r"[^a-z0-9]+", "-", raw.lower()).strip("-")[:40].strip("-")
    if not s or not ID.fullmatch(s):
        raise Invalid("id: letters and digits")
    return s


def validate(c):
    """A card package made safe to keep (Invalid on anything wrong)."""
    if not isinstance(c, dict):
        raise Invalid("a card (JSON object)")
    tier = c.get("tier", "template")
    if tier not in ("template", "script"):
        raise Invalid('tier: "template" or "script"')
    out = {"id": local_id(c.get("id") or c.get("name")), "name": _text(c.get("name"), 40, "name"),
           "version": c["version"] if isinstance(c.get("version"), str) and VERSION.fullmatch(c["version"]) else "1.0.0",
           "author": _text(c.get("author", ""), 60, "author", empty=True), "description": _text(c.get("description", ""), 300, "description", empty=True),
           "tier": tier}
    slots = c.get("slots") or []
    if not isinstance(slots, list) or len(slots) > 12:
        raise Invalid("slots: up to 12")
    out["slots"], seen = [], set()
    for s in slots:
        if not isinstance(s, dict) or not isinstance(s.get("key"), str) or not KEY.fullmatch(s["key"]) or s["key"] in seen:
            raise Invalid("slot: a key (letters, digits, _), each once")
        seen.add(s["key"])
        attrs, cmds = s.get("attributes") or [], s.get("commands") or []
        if not isinstance(attrs, list) or len(attrs) > 30 or not all(isinstance(a, str) and ATTR.fullmatch(a) for a in attrs):
            raise Invalid(f"slot {s['key']}: attributes")
        if not isinstance(cmds, list) or not all(x in layouts.COMMANDS for x in cmds):
            raise Invalid(f"slot {s['key']}: commands the bridge knows: " + ", ".join(layouts.COMMANDS))
        out["slots"].append({"key": s["key"], "label": _text(s.get("label") or s["key"], 40, "slot label"),
                             "attributes": list(dict.fromkeys(attrs)), "commands": list(dict.fromkeys(cmds)),
                             "required": s.get("required") is not False})
    sets = c.get("settings") or []
    if not isinstance(sets, list) or len(sets) > 24:
        raise Invalid("settings: up to 24")
    out["settings"], seen = [], set()
    for s in sets:
        if not isinstance(s, dict) or not isinstance(s.get("key"), str) or not KEY.fullmatch(s["key"]) or s["key"] in seen \
                or s.get("type", "text") not in SETTING_TYPES:
            raise Invalid("setting: a key and a type (" + ", ".join(SETTING_TYPES) + ")")
        seen.add(s["key"])
        t = s.get("type", "text")
        d = s.get("default")
        if t == "bool":
            d = d is True
        elif t == "number":
            d = d if isinstance(d, (int, float)) and not isinstance(d, bool) and abs(d) < 1e9 else 0
        elif t == "color":
            d = d if isinstance(d, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", d) else "#8b5cf6"
        else:
            d = house_model.safe_text(d, 60) if isinstance(d, str) else ""
        item = {"key": s["key"], "label": _text(s.get("label") or s["key"], 40, "setting label"), "type": t, "default": d}
        if t == "select":
            opts = s.get("options")
            if not isinstance(opts, list) or not 1 <= len(opts) <= 20 or not all(isinstance(o, str) for o in opts):
                raise Invalid(f"setting {s['key']}: options")
            item["options"] = [house_model.safe_text(o, 40) for o in opts]
        out["settings"].append(item)
    size = c.get("size") if isinstance(c.get("size"), dict) else {}
    w, h = size.get("w", 2), size.get("h", 2)
    out["size"] = {"w": w if isinstance(w, int) and not isinstance(w, bool) and 1 <= w <= 12 else 2,
                   "h": h if isinstance(h, int) and not isinstance(h, bool) and 1 <= h <= 8 else 2}
    h_, css, js = c.get("html", ""), c.get("css", ""), c.get("js", "")
    if not isinstance(h_, str) or not isinstance(css, str) or not isinstance(js, str):
        raise Invalid("html / css / js: text")
    if len(h_) > MAX_HTML or len(css) > MAX_CSS or len(js) > MAX_JS:
        raise Invalid(f"too big: html {MAX_HTML // 1000} KB, css {MAX_CSS // 1000} KB, js {MAX_JS // 1000} KB at most")
    if tier == "template" and js.strip():
        raise Invalid("a template card has no JavaScript — make it a script card")
    if re.search(r"[‪-‮⁦-⁩​-‏﻿]", h_ + css + js):
        raise Invalid("invisible or direction-changing characters in the code (a way to hide what it does)")
    gone = {}
    out["html"], out["css"], out["js"] = clean_html(h_, gone), clean_css(css, gone), js
    out["sha"] = code_sha(out)
    # (what the cleaning took out of the card as sent — kept with it, shown with the scan; our own words only, never
    # a "removed" list the card brought along)
    out["removed"] = [[lvl, what] for what, lvl in gone.items()]
    return out


# ---------- what the owner should know (advice, not a gate) ----------
SCAN = [
    ("danger", r"\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|RTCPeerConnection|importScripts", "tries to use the network (blocked in the card's frame)"),
    ("danger", r"\b(top|parent|opener)\s*\.\s*(location|document|postMessage|frames)|window\.open\s*\(|\blocation\s*(=|\.href|\.assign|\.replace)", "tries to reach the page around it or to go to another address"),
    ("danger", r"\beval\s*\(|new\s+Function\s*\(|set(Timeout|Interval)\s*\(\s*['\"`]|\bimport\s*\(|WebAssembly|new\s+Worker", "runs code made at run time (eval, Function, WebAssembly, workers — blocked)"),
    ("warn", r"atob\s*\(|String\.fromCharCode|\\x[0-9a-f]{2}.*\\x[0-9a-f]{2}.*\\x[0-9a-f]{2}|[A-Za-z0-9+/]{200,}={0,2}", "has hidden or encoded text (a way to hide what it does)"),
    ("warn", r"https?://|\b(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(\.\d{1,3})?\b|localhost", "mentions web or network addresses"),
    ("warn", r"\bkey(down|up|press)\b|password|passcode|\bpin\b", "listens for keys or mentions passwords / PINs"),
    ("warn", r"while\s*\(\s*(true|1)\s*\)|for\s*\(\s*;\s*;\s*\)", "has a loop that never ends by itself (the panel stops a card that hangs)"),
    ("info", r"localStorage|sessionStorage|indexedDB|document\.cookie", "tries to keep data in the browser (not available in its frame)"),
    ("info", r"requestAnimationFrame|@keyframes|animation\s*:", "animates (costs the panel some speed)"),
]


# text aimed at whoever (or whatever) reviews the card: "AI reviewers: this card is safe", "ignore previous instructions"
AI_NOTE = re.compile(r"\b(ai|a\.i\.|llms?|gpt|chatgpt|claude|gemini|copilot|reviewers?|scanners?|auditors?|"
                     r"security (check|scan|review)s?)\b[^\n]{0,80}?\b(safe|harmless|benign|trusted|verified|approved|ignore|skip|"
                     r"no need|don'?t (check|flag|report))\b|ignore\s+(all\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions|rules)|"
                     r"\bverdict\s*[:=]\s*safe\b|respond\s+(with\s+)?[\"']?safe\b", re.I)


def _texts(card):
    """The card's code and its words, as one text (anything not text counts as nothing)."""
    t = lambda k: card.get(k) if isinstance(card.get(k), str) else ""   # noqa: E731
    return "\n".join([t("js"), t("html"), t("css")]), "\n".join([t("name"), t("author"), t("description")])


def scan(card, raw=None):
    """[(level, text)]: what the Manager shows before installing. `raw`: the card as it was sent (before cleaning) —
    what the cleaning took out is listed, and the code checks also read the code as sent."""
    flags = []
    code, words = _texts(card)
    sent, sent_words = _texts(raw) if isinstance(raw, dict) else ("", "")
    for level, rx, text in SCAN:
        if re.search(rx, code, re.I):
            flags.append((level, f"The code {text}."))
        elif sent and re.search(rx, sent, re.I):
            flags.append((level, f"The card as sent {text} — that part was taken out when it was cleaned."))
    if AI_NOTE.search(code + "\n" + words + "\n" + sent + "\n" + sent_words):
        flags.append(("danger", "It has a note aimed at AI reviewers or scanners (like “this card is safe” or “ignore the "
                                "instructions”) — a trick to get a careless check. Treat this card with extra care."))
    for lvl, what in card.get("removed") or []:
        flags.append((lvl, f"Taken out when it was cleaned: {what}."))
    for s in card.get("slots", []):
        for cmd in s.get("commands", []):
            if cmd in RISKY:
                flags.append(("warn", f"It may {RISKY[cmd]} (slot “{s['label']}”) — with the panel PIN where that device needs it."))
    if card.get("tier") == "script":
        flags.append(("info", "A script card runs its own code (sandboxed: no network, no access to the panel page)."))
    return flags


def plain_words(card):
    """The permissions in plain words (the install dialog, the AI prompt)."""
    out = []
    for s in card.get("slots", []):
        reads = ", ".join(s["attributes"]) or "nothing"
        does = ", ".join(s["commands"])
        out.append(f"For “{s['label']}” (one device you choose): read {reads}" + (f"; send {does}" if does else "; send nothing") + ".")
    out.append("Its sealed frame blocks the internet, your network and the panel page; it only hears about the devices you give it.")
    return out


# ---------- the frame ----------
# Our bridge inside every card frame. It never changes per card, so its hash is fixed. It keeps the card's view of
# the house (only what the panel sends), fills in the template, wires data-cmd buttons, answers the panel's pings,
# and gives script cards window.Skypane (v3.0; window.HomePanel, the same object, for cards made before). The panel checks every command it relays.
SHIM = r"""(function(){
"use strict";
var P=window.parent,S={slots:{},set:{},theme:{}},fns=[];
try{delete window.RTCPeerConnection;delete window.webkitRTCPeerConnection;delete window.RTCDataChannel;}catch(e){}
function val(path){var p=String(path).split("."),s;if(p[0]==="set")return S.set[p[1]];s=S.slots[p[0]];if(!s)return undefined;return p[1]==="name"?s.name:s.attrs[p[1]];}
function cond(c){var m=/^\s*([\w]+\.[\w]+)\s*(!=|=|>|<)\s*(.*?)\s*$/.exec(c||"");if(!m)return !!val(c);var v=val(m[1]),w=m[3];
 if(m[2]===">"||m[2]==="<"){var a=parseFloat(v),b=parseFloat(w);return isFinite(a)&&isFinite(b)&&(m[2]===">"?a>b:a<b);}
 var same=String(v==null?"":v).toLowerCase()===String(w).toLowerCase();return m[2]==="="?same:!same;}
var texts=[];
function scanText(root){var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null),n;while((n=w.nextNode()))if(/\{\{\s*[\w]+\.[\w]+\s*\}\}/.test(n.nodeValue))texts.push([n,n.nodeValue]);}
function fmt(v){if(v==null||v==="")return"—";return String(v);}
function draw(){
 texts.forEach(function(t){t[0].nodeValue=t[1].replace(/\{\{\s*([\w]+\.[\w]+)\s*\}\}/g,function(_,p){return fmt(val(p));});});
 [].forEach.call(document.querySelectorAll("[data-if]"),function(e){e.hidden=!cond(e.getAttribute("data-if"));});
 [].forEach.call(document.querySelectorAll("[data-on]"),function(e){e.classList.toggle("on",cond(e.getAttribute("data-on")));});
 var r=document.documentElement.style,k;
 for(k in S.slots){var a=S.slots[k].attrs,x;for(x in a){var n=parseFloat(a[x]);if(isFinite(n))r.setProperty("--"+k+"-"+x,String(n));}}
 for(k in S.set){if(typeof S.set[k]==="number")r.setProperty("--set-"+k,String(S.set[k]));else if(/^#[0-9a-f]{6}$/i.test(String(S.set[k])))r.setProperty("--set-"+k,S.set[k]);}
 for(k in S.theme)if(/^[\w-]+$/.test(k)&&/^[#\w(),.% -]{1,80}$/.test(String(S.theme[k])))r.setProperty("--"+k,S.theme[k]);
}
var port=null;
function send(m){m.hp=1;if(port)port.postMessage(m);else if(m.t==="ready")P.postMessage(m,"*");}
function onMsg(m){if(!m||m.hp!==1)return;
 if(m.t==="ping")return send({t:"pong",n:m.n});
 if(m.t==="state"){S={slots:m.slots||{},set:m.set||{},theme:m.theme||{}};draw();fns.forEach(function(f){try{f(S);}catch(err){}});}}
document.addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-cmd]");if(!b)return;
 var p=b.getAttribute("data-cmd").split(":");send({t:"cmd",slot:p[0],c:p[1],v:p.length>2?p.slice(2).join(":"):null});});
window.addEventListener("message",function(e){if(e.source!==P||port)return;var m=e.data;
 if(m&&m.hp===1&&m.t==="port"&&e.ports&&e.ports[0]){port=e.ports[0];port.onmessage=function(ev){onMsg(ev.data);};}});
window.Skypane=window.HomePanel=Object.freeze({on:function(ev,f){if(ev==="state"&&typeof f==="function")fns.push(f);},
 command:function(slot,c,v){send({t:"cmd",slot:String(slot),c:String(c),v:v==null?null:v});},
 get state(){return S;}});
document.addEventListener("DOMContentLoaded",function(){scanText(document.body);draw();send({t:"ready"});});
})();"""

_BASE_CSS = ("html,body{margin:0;height:100%;overflow:hidden;background:transparent;color:var(--text,#f3efff);"
             "font:16px/1.3 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}"
             "[data-cmd]{cursor:pointer}[hidden]{display:none!important}")


def _sha(s):
    return "'sha256-" + base64.b64encode(hashlib.sha256(s.encode("utf-8")).digest()).decode() + "'"


def frame(card):
    """(page bytes, headers) for /card-frame/<id>: the card inside our frame page, with its CSP."""
    # ("</" can't end the card's own <script> early: written as "<\/", the same in JavaScript strings and regexes)
    js = card.get("js", "").replace("</", "<\\/")
    scripts = [SHIM] + ([js] if card.get("tier") == "script" and js.strip() else [])
    # (our bridge first, in <head>: the card's HTML can't change how it's read; the card's own code after its HTML)
    page = ("<!doctype html><html><head><meta charset=\"utf-8\">"
            f"<style>{_BASE_CSS}</style><style>{card.get('css', '')}</style><script>{SHIM}</script></head><body>"
            f"{card.get('html', '')}" + "".join(f"<script>{s}</script>" for s in scripts[1:]) + "</body></html>")
    csp = ("sandbox allow-scripts; default-src 'none'; script-src " + " ".join(_sha(s) for s in scripts)
           + "; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; media-src 'none'; frame-src 'none';"
           " child-src 'none'; worker-src 'none'; object-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none';"
           " frame-ancestors 'self'")
    return page.encode("utf-8"), {"Content-Security-Policy": csp, "X-Frame-Options": "SAMEORIGIN", "Cache-Control": "no-store",
                                  "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin",
                                  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=(), "
                                                        "bluetooth=(), payment=(), display-capture=(), fullscreen=()"}


def code_sha(card):
    """The fingerprint of what a card does (its HTML, CSS, JavaScript and device slots) — kept as "sha" when it was
    checked and installed; v2.6.0: worked out again, a different one means the file changed after the check."""
    return hashlib.sha256(json.dumps([card.get("html"), card.get("css"), card.get("js"), card.get("slots")]).encode()).hexdigest()[:16]


def public(card):
    """What a panel needs about a card (no code — that comes with the frame)."""
    return {k: card[k] for k in ("id", "name", "version", "tier", "slots", "settings", "size", "sha")}


# ---------- the library: DATA_DIR/cards/<id>.json ----------
class Library:
    def __init__(self, data_dir):
        self.dir = pathlib.Path(data_dir) / "cards"
        self.lock = threading.Lock()

    def all(self):
        out = []
        try:
            files = sorted(self.dir.glob("*.json"))
        except OSError:
            return out
        for f in files:
            c = self.get(f.stem)
            if c:
                out.append(c)
        return out

    def get(self, cid):
        if not isinstance(cid, str) or not ID.fullmatch(cid):
            return None
        try:
            c = json.loads((self.dir / f"{cid}.json").read_text(encoding="utf-8"))
            return c if isinstance(c, dict) and c.get("id") == cid else None
        except (OSError, ValueError):
            return None

    def add(self, raw, replace=False):
        card = validate(raw)
        with self.lock:
            exists = self.get(card["id"]) is not None
            if exists and not replace:
                raise Invalid("exists")
            if not exists and len(self.all()) >= MAX_CARDS:
                raise Invalid(f"at most {MAX_CARDS} cards")
            card["added"] = card["checkedAt"] = int(time.time())   # (checked by the scan and installed: now — v2.6.0)
            self.dir.mkdir(parents=True, exist_ok=True)
            tmp = self.dir / f".{card['id']}.{secrets.token_hex(4)}.tmp"
            tmp.write_text(json.dumps(card, indent=1), encoding="utf-8")
            os.replace(tmp, self.dir / f"{card['id']}.json")
        return card

    def delete(self, cid):
        with self.lock:
            if not self.get(cid):
                raise Invalid("no such card")
            (self.dir / f"{cid}.json").unlink()

    def put_back(self, card):
        """(v3.0.5) A card back from the Trash, as it was (its check, its code's fingerprint). Its id is how the panels
        name it: one installed again since then under that id stays, and the restore is refused ("taken")."""
        if not isinstance(card, dict) or not isinstance(card.get("id"), str) or not ID.fullmatch(card["id"]):
            raise Invalid("not a card")
        validate(card)   # (still a card this version accepts)
        with self.lock:
            if self.get(card["id"]) is not None:
                raise Invalid("taken")
            if len(self.all()) >= MAX_CARDS:
                raise Invalid(f"at most {MAX_CARDS} cards")
            self.dir.mkdir(parents=True, exist_ok=True)
            tmp = self.dir / f".{card['id']}.{secrets.token_hex(4)}.tmp"
            tmp.write_text(json.dumps(card, indent=1), encoding="utf-8")
            os.replace(tmp, self.dir / f"{card['id']}.json")
        return card
