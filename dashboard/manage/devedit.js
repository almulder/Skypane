// Skypane Manager — the Devices card's item editor, its own parts (v3.0.4; the design: mockups/prototypes/devices-card.html
// set b, the pick "B · Tabs"). builder.js puts them together on the right side for one item of a Devices card:
//   - the device picker: a combobox whose search is the list's first row (every word anywhere in the name, room or kind,
//     as builder.js devHit), grouped by room, each with its kind's icon; ↑ ↓ and Enter
//   - what a press / hold / double-tap does, from the device's own commands with friendly names — never another device
//     (the air purifier, the Dyson: Fan on, Fan off, Auto, Speed 1–10); the hold's fly-out ticks from the same list
//   - the icon picker (its search the first row; All · Animated · Drawings · Your pictures) and the full color picker
//     (hue, saturation, brightness and a hex code — the Manager's own hue slider, panels.js "Your own color", grown up)
//   - on the card itself: Freeform's move, and resize from every edge and corner (the cursor says which — no marks);
//     Tiles' span; List / Tiles order by drag with a drop line (a blank card's pieces use the same: thousandths of the
//     card, the old 24 × 24 grid moved over by from24, the faint alignment guides)
// Every pop-up is a dialog of its own: only it scrolls, the page behind is inert, Tab stays inside, Esc or a click
// outside closes it and the focus goes back to where it was. The plain logic comes first (headless:
// service/test_v304_devices_editor.py), then the DOM parts. Every word through Kit.t (strings/en.js "builder.dve.*").
(function () {
  const t = (k, v) => window.Kit.t(k, v);
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------- the search: every word somewhere in the name, room or kind, in any order, parts of words too ----------
  const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’‘`]/g, "");
  // what the house model filed it as → its icon and its name in words ("thing:purifier" → the air purifier)
  const KINDS = [[/purifier/, "airPurifier", "purifier"], [/^light|dimmer/, "bulb", "light"], [/fan/, "fan", "fan"], [/lock/, "lock", "lock"],
    [/garage/, "garage", "garage"], [/shade|blind/, "shade", "shade"], [/thermostat/, "thermo", "thermostat"], [/temp|climate|humid/, "thermo", "sensor"],
    [/door/, "door", "door"], [/window|contact/, "window", "window"], [/motion/, "motion", "motion"], [/presence/, "user", "presence"],
    [/leak|water|valve/, "drop", "water"], [/speaker|media|tv/, "speaker", "media"], [/washer|dryer|dish|fridge|oven|microwave/, "washer", "appliance"],
    [/camera/, "camera", "camera"], [/outlet|plug/, "plug", "plug"], [/switch|mode|guest/, "power", "switch"]];
  const kindOf = (k) => KINDS.find(([re]) => re.test(k || "")) || null;
  const kindIcon = (k) => (kindOf(k) || [, "gauge"])[1];
  const kindName = (k) => t(`builder.dve.kind.${(kindOf(k) || [, , "other"])[2]}`);
  const hit = (d, q) => {
    const hay = fold(`${d.label} ${d.room} ${String(d.kind || "").replace(/^\w+:/, "")} ${kindName(d.kind)}`);
    return fold(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  };
  // how well it fits (lower is better): the exact name, a name that starts with it, every word at the start of a word
  const rank = (d, q) => {
    const L = fold(d.label).trim(), Q = fold(q).trim().replace(/\s+/g, " ");
    if (L === Q) return 0;
    if (L.startsWith(Q)) return 1;
    const starts = fold(`${d.label} ${d.room}`).split(/[^a-z0-9]+/).filter(Boolean);
    return Q.split(" ").every((w) => starts.some((x) => x.startsWith(w))) ? 2 : 3;
  };
  // the list as the picker shows it: [{room, items}] — rooms A–Z ("no room" last), or while searching the best first
  function search(list, q) {
    const qs = String(q || "").trim(), r = (d) => (qs ? rank(d, qs) : 0);
    const hits = (qs ? list.filter((d) => hit(d, qs)) : list.slice()).sort((a, b) => r(a) - r(b) || a.label.localeCompare(b.label));
    const by = new Map();
    for (const d of hits) { const k = d.room || ""; if (!by.has(k)) by.set(k, []); by.get(k).push(d); }
    return [...by].map(([room, items]) => ({ room, items, best: Math.min(...items.map(r)) }))
      .sort((a, b) => (qs ? a.best - b.best : 0) || (!a.room) - (!b.room) || a.room.localeCompare(b.room));
  }

  // ---------- what an item does: the device's own commands, never another device ----------
  const isPurifier = (d) => /purifier/.test((d && d.kind) || "");
  const isLock = (d, raw) => !!d && (d.kind === "lock" || ((raw && raw.caps) || d.caps || []).includes("Lock"));
  // does it switch on and off: a light, a switch, a plug, a fan — the air purifier too (the panel sends fanOn / off)
  const canSwitch = (d, raw) => !!d && (isPurifier(d) || (d.caps || []).includes("Switch") || ((raw && raw.cmds) || []).includes("on"));
  // the air purifier's own: Fan on, Fan off, Auto, Speed 1–10 (grid.js run → H.purifier) — never a key of the lists'
  // own ("auto", "none", "fly", "other")
  function purifierChoices(id) {
    const a = (x) => ({ id, ...x });
    return [{ key: "fanOn", label: t("builder.dve.fanOn"), icon: "fan", a: a({ do: "on" }) }, { key: "fanOff", label: t("builder.dve.fanOff"), icon: "power", a: a({ do: "off" }) },
      { key: "fanAuto", label: t("builder.wheel.auto"), icon: "airPurifier", a: a({ do: "cmd", c: "auto" }) },
      ...Array.from({ length: 10 }, (_, k) => ({ key: `sp${k + 1}`, label: t("builder.dve.speed", { n: k + 1 }), icon: "fan", a: a({ do: "cmd", c: "setFanSpeed", v: k + 1 }) }))];
  }
  // what this device can be told, in words: the purifier's own, else the press-and-hold wheel's list (builder.js
  // wheelChoices: from its capabilities and commands) — never an unlock (only the slide and the PIN unlock)
  const choices = (d, wheel) => (!d ? [] : isPurifier(d) ? purifierChoices(d.id) : (wheel || []).filter((c) => c.a.do !== "unlock" && c.a.c !== "unlock"));
  const same = (x, y) => !!x && !!y && x.do === y.do && (x.c || "") === (y.c || "") && String(x.v ?? "") === String(y.v ?? "") && (x.id ?? null) === (y.id ?? null);
  // what the panel does with no press set (grid.js dvTap): a switch toggles (the purifier: Fan on / off), a lock only
  // locks, a value / button / scene nothing
  function pressAuto(it, d, raw) {
    if (!d || it.st === "fan" || ["value", "button", "scene"].includes(it.k)) return "nothing";
    if (isLock(d, raw)) return it.k && it.k !== "lock" ? "nothing" : "lock";
    return canSwitch(d, raw) ? (isPurifier(d) ? "fan" : "toggle") : "nothing";
  }
  // the press's choices: [key, words] — the first is the default; "other" = the old editor (another device, a room, a page)
  function pressOpts(it, d, raw, own) {
    const auto = pressAuto(it, d, raw);
    return [["auto", t(`builder.dve.press.${auto}`)], ...(auto !== "nothing" ? [["none", t("builder.dve.nothing")]] : []),
      ...own.map((c) => [c.key, c.label]), ["other", t("builder.dve.other")]];
  }
  // which choice an action is ("auto" = none set; an own toggle is the default's)
  function actKey(a, it, own) {
    if (!a) return "auto";
    if (a.do === "none") return "none";
    if (a.do === "toggle" && a.id != null && a.id === it.id) return "auto";
    const m = own.find((c) => same(c.a, a));
    return m ? m.key : "other";
  }
  const plain = (a) => { const o = { do: a.do }; for (const k of ["id", "c", "v"]) if (a[k] != null) o[k] = a[k]; return o; };
  // the hold: Automatic (the panel's own: a light's pop-up, the automatic wheel), nothing, a fly-out, or one command
  const holdOpts = (own) => [["auto", t("builder.dve.holdAuto")], ["none", t("builder.dve.nothing")], ...(own.length ? [["fly", t("builder.dve.holdFly")]] : []),
    ...own.map((c) => [c.key, c.label])];
  const holdKey = (it, own) => ((it.wheel || []).length ? "fly" : actKey(it.hold, it, own));
  const dblOpts = (own) => [["auto", t("builder.dve.nothing")], ...own.map((c) => [c.key, c.label]), ["other", t("builder.dve.other")]];
  // a new fly-out: a short set (the purifier: Auto, 2, 4, 6, 8, 10, Off), else the first six
  const FLY_MAX = 8;
  const flyDefault = (d, own) => (isPurifier(d) ? ["fanAuto", "sp2", "sp4", "sp6", "sp8", "sp10", "fanOff"] : own.slice(0, 6).map((c) => c.key));
  const flyItem = (c) => ({ ...plain(c.a), label: String(c.label).slice(0, 24), ...(c.icon ? { icon: c.icon } : {}), ...(c.col ? { col: c.col } : {}) });
  // the ticked ones, in the list's order with Off last, as the panel's own wheel has it (at most 8)
  const flyList = (own, keys) => own.filter((c) => keys.includes(c.key)).sort((x, y) => (x.a.do === "off") - (y.a.do === "off")).slice(0, FLY_MAX).map(flyItem);
  const flyKeys = (it, own) => own.filter((c) => (it.wheel || []).some((w) => same(plain(w), c.a))).map((c) => c.key);

  // ---------- Freeform: thousandths of the card; move, or resize from any edge or corner ----------
  const FREE = 1000, MIN = 40;
  // where a press is on an item's box (px inside it): an edge or a corner ("n", "se"…) within 8 px, else "move"
  function zone(px, py, w, h, edge = 8) {
    const e = Math.min(edge, w / 4, h / 4);
    return `${py <= e ? "n" : py >= h - e ? "s" : ""}${px <= e ? "w" : px >= w - e ? "e" : ""}` || "move";
  }
  const CURSOR = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize", move: "move" };
  // the box after a drag of dx, dy (thousandths): it stays on the card and never smaller than MIN
  function dragRect(r, z, dx, dy) {
    let { x, y, w, h } = r;
    if (z === "move") { x = cl(x + dx, 0, FREE - w); y = cl(y + dy, 0, FREE - h); }
    else {
      if (z.includes("w")) { const nx = cl(x + dx, 0, x + w - MIN); w += x - nx; x = nx; }
      if (z.includes("e")) w = cl(w + dx, MIN, FREE - x);
      if (z.includes("n")) { const ny = cl(y + dy, 0, y + h - MIN); h += y - ny; y = ny; }
      if (z.includes("s")) h = cl(h + dy, MIN, FREE - y);
    }
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }
  // the arrow keys: a step of 1 % of the card (Shift: 10 %)
  function nudge(r, key, shift) {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
    return d ? dragRect(r, "move", d[0] * (shift ? 100 : 10), d[1] * (shift ? 100 : 10)) : r;
  }
  const placed = (it) => ["x", "y", "w", "h"].every((k) => Number.isInteger(it[k]));
  // a typed X / Y / W / H (in %): kept on the card
  function fixRect(r) {
    const x = cl(Math.round(r.x), 0, FREE - MIN), y = cl(Math.round(r.y), 0, FREE - MIN);
    return { x, y, w: cl(Math.round(r.w), MIN, FREE - x), h: cl(Math.round(r.h), MIN, FREE - y) };
  }
  // items without a place yet (a card switched to Freeform): a tidy grid, the ones placed left where they are
  function autoPlace(items) {
    const todo = items.filter((it) => !placed(it)), n = todo.length; if (!n) return false;
    const cols = Math.ceil(Math.sqrt(items.length)), rows = Math.ceil(items.length / cols), cw = FREE / cols, ch = FREE / rows;
    items.forEach((it, k) => { if (!placed(it)) Object.assign(it, fixRect({ x: (k % cols) * cw + 10, y: Math.floor(k / cols) * ch + 10, w: cw - 20, h: ch - 20 })); });
    return true;
  }
  // (v3.0.4) a blank card's pieces sit in the same thousandths: one from before (a cell of the card's old 24 × 24 grid)
  // keeps its edges where they were (within half a thousandth — under a pixel on any panel)
  const of24 = (v) => Math.round((v * FREE) / 24);
  const from24 = (p) => { const x = of24(p.x), y = of24(p.y); return { ...p, x, y, w: Math.max(1, of24(p.x + p.w) - x), h: Math.max(1, of24(p.y + p.h) - y) }; };
  // the faint guides: where r's edges or middle line up with another's (within tx / ty) — or with the card's middle
  // (its edges always "line up"); only shown, nothing snaps → [["v" | "h", at, from, to]], in thousandths
  function aligned(r, others, tx, ty) {
    const out = [], seen = new Set(), all = [...others, { x: 0, y: 0, w: FREE, h: FREE, frame: true }];
    const xs = (q) => [q.x, q.x + q.w / 2, q.x + q.w], ys = (q) => [q.y, q.y + q.h / 2, q.y + q.h];
    for (const o of all) {
      for (const a of xs(r)) for (const b of xs(o)) if (Math.abs(a - b) <= tx && !(o.frame && b !== FREE / 2) && !seen.has(`v${Math.round(b)}`)) {
        seen.add(`v${Math.round(b)}`); out.push(["v", b, Math.min(r.y, o.y), Math.max(r.y + r.h, o.y + o.h)]);
      }
      for (const a of ys(r)) for (const b of ys(o)) if (Math.abs(a - b) <= ty && !(o.frame && b !== FREE / 2) && !seen.has(`h${Math.round(b)}`)) {
        seen.add(`h${Math.round(b)}`); out.push(["h", b, Math.min(r.x, o.x), Math.max(r.x + r.w, o.x + o.w)]);
      }
    }
    return out;
  }
  // Tiles: a tile's span from a resize (right edge, bottom edge, corner), in whole tiles 1–4
  const span = (s0, z, dx, dy, cw, ch) => ({ sw: z.includes("e") ? cl(Math.round(s0.sw + dx / cw), 1, 4) : s0.sw, sh: z.includes("s") ? cl(Math.round(s0.sh + dy / ch), 1, 4) : s0.sh });
  // List / Tiles: where a dragged item would go (rects in order; one column: above / below, else left / right of the
  // nearest) → {at: the place in the list without it, line: {x, y, w, h} — the drop line}
  function dropAt(rects, from, x, y) {
    let k = 0, best = Infinity;
    rects.forEach((r, i) => { const dd = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)); if (dd < best) { best = dd; k = i; } });
    const r = rects[k], col = rects.every((q) => Math.abs(q.left - rects[0].left) < 2), after = col ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
    let at = k + (after ? 1 : 0);
    const line = col ? { x: r.left, y: after ? r.top + r.height : r.top, w: r.width, h: 0 } : { x: after ? r.left + r.width : r.left, y: r.top, w: 0, h: r.height };
    if (at > from) at -= 1;
    return { at, line };
  }
  const move = (list, from, to) => { if (from === to || to < 0 || to >= list.length) return false; list.splice(to, 0, list.splice(from, 1)[0]); return true; };

  // ---------- colors: #rrggbb ↔ hue 0–360, saturation and brightness 0–100 ----------
  function hexToHsv(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "")); if (!m) return null;
    const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
    const h = !d ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: Math.round(h * 60) % 360, s: Math.round(mx ? (d / mx) * 100 : 0), v: Math.round(mx * 100) };
  }
  function hsvToHex(h, s, v) {
    const S = s / 100, V = v / 100, f = (n) => { const k = (n + h / 60) % 6; return V - V * S * Math.max(0, Math.min(k, 4 - k, 1)); };
    return "#" + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
  }

  // ---------- the DOM parts ----------
  const FOC = "input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])";   // i18n-ok (a selector)
  const mk = (tag, cls, attrs = {}, ...kids) => {
    const n = document.createElement(tag); if (cls) n.className = cls;
    // (a style through the CSSOM, never as an attribute: the Manager's CSP — as manage.js el)
    for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) { if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else if (k === "style") n.style.cssText = v; else n.setAttribute(k, v === true ? "" : String(v)); }
    n.append(...kids.flat().filter((x) => x != null));
    return n;
  };
  const icon = (name, size) => (window.Manage && window.Manage.iconEl ? window.Manage.iconEl(name, size) : mk("i", "ic"));
  let uid = 0;
  // a pop-up by anchor (opts: label, cls, width, first, onClose) → {close, box}: under (or over) the anchor, inside the
  // window; the page behind inert and not scrolling; Esc or a click outside closes it, the focus goes back
  function pop(anchor, content, opts = {}) {
    const prev = document.activeElement, shade = mk("div", "dve-shade");
    const box = mk("div", "dve-pop" + (opts.cls ? " " + opts.cls : ""), { role: "dialog", "aria-modal": "true", "aria-label": opts.label || null }, content);
    shade.append(box);
    const others = [...document.body.children].filter((n) => !n.inert);
    others.forEach((n) => { n.inert = true; });
    document.documentElement.classList.add("dve-lock");
    document.body.append(shade);
    const r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: innerWidth / 2 - 160, right: innerWidth / 2 + 160, top: 80, bottom: 80, width: 320 };
    const W = Math.min(innerWidth - 16, Math.max(opts.width || 320, r.width)), below = innerHeight - r.bottom - 12, above = r.top - 12;
    const up = below < 260 && above > below, room = Math.max(160, up ? above : below);
    Object.assign(box.style, { left: `${cl(r.left, 8, innerWidth - W - 8)}px`, width: `${W}px`, maxHeight: `${Math.min(room, opts.height || 460)}px`,
      ...(up ? { bottom: `${innerHeight - r.top + 4}px` } : { top: `${r.bottom + 4}px` }) });
    let done = false;
    function close() {
      if (done) return; done = true;
      shade.remove();
      others.forEach((n) => { n.inert = false; });
      if (!document.querySelector(".dve-shade")) document.documentElement.classList.remove("dve-lock");
      if (prev && prev.isConnected && prev.focus) prev.focus({ preventScroll: true });
      if (opts.onClose) opts.onClose();
    }
    shade.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== "Tab") return;
      const f = [...box.querySelectorAll(FOC)].filter((x) => !x.disabled && x.offsetParent !== null), i = f.indexOf(document.activeElement);
      if (f.length && (i < 0 || (e.shiftKey ? i === 0 : i === f.length - 1))) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
    });
    shade.addEventListener("pointerdown", (e) => { if (e.target === shade) { e.preventDefault(); close(); } });
    shade.addEventListener("wheel", (e) => { if (!box.contains(e.target)) e.preventDefault(); }, { passive: false });   // (only the pop-up scrolls)
    const f = opts.first || box.querySelector(FOC);
    if (f) f.focus({ preventScroll: true });
    return { close, box, shade };
  }

  // a list with its search as the first row (role combobox → listbox): q → [{label, items: [{key, name, sub, icon}]}];
  // pick(key). ↑ ↓ move, Enter picks, Home / End; a click picks. more: a last row ("Show every device") → its own pick
  function searchList(anchor, opts) {
    const id = `dve-l${++uid}`, q = mk("input", "dve-q", { type: "search", role: "combobox", "aria-expanded": "true", "aria-controls": id, "aria-autocomplete": "list",
      placeholder: opts.placeholder, "aria-label": opts.placeholder, autocomplete: "off" });
    const lb = mk("div", "dve-lb", { role: "listbox", id, "aria-label": opts.label }), note = mk("small", "dve-none muted");   // i18n-ok (class names, CSS)
    let flat = [], at = 0, p = null;
    const mark = () => {
      flat.forEach((o, k) => { o.n.classList.toggle("act", k === at); o.n.setAttribute("aria-selected", String(k === at)); });
      const o = flat[at];
      if (o) { q.setAttribute("aria-activedescendant", o.n.id); if (o.n.scrollIntoView) o.n.scrollIntoView({ block: "nearest" }); } else q.removeAttribute("aria-activedescendant");
    };
    const choose = (o) => { if (!o) return; p.close(); opts.pick(o.key); };
    const fill = () => {
      const groups = opts.groups(q.value);
      flat = [];
      lb.replaceChildren(...groups.map((g) => {
        const gid = `${id}-g${flat.length}`;
        return mk("div", "dve-grp", { role: "group", "aria-labelledby": g.label ? gid : null }, g.label ? mk("div", "dve-gh", { id: gid, role: "presentation" }, g.label) : null,
          g.items.map((x) => {
            const n = mk("div", "dve-opt" + (x.key === opts.cur ? " cur" : ""), { role: "option", id: `${id}-o${flat.length}`, "aria-selected": "false", "data-key": String(x.key),
              onpointerdown: (e) => e.preventDefault(), onclick: () => choose(o), onpointermove: () => { if (at !== flat.indexOf(o)) { at = flat.indexOf(o); mark(); } } },
              x.icon ? mk("span", "dve-oi", {}, icon(x.icon, 18)) : null, mk("span", "dve-ot", {}, mk("b", "", {}, x.name), x.sub ? mk("small", "", {}, x.sub) : null));
            const o = { key: x.key, n };
            flat.push(o);
            return n;
          }));
      }), ...(opts.more && opts.more() ? [mk("button", "ghost small dve-more", { type: "button", onclick: () => { opts.showMore(); fill(); q.focus(); } }, opts.more())] : []));   // i18n-ok (class names, CSS)
      note.textContent = flat.length ? "" : t("builder.dev.noneFound");
      const c = flat.findIndex((o) => o.key === opts.cur);
      at = q.value.trim() || c < 0 ? 0 : c;
      mark();
    };
    q.addEventListener("input", fill);
    q.addEventListener("keydown", (e) => {
      const n = flat.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (n) { at = (at + (e.key === "ArrowDown" ? 1 : n - 1)) % n; mark(); } }
      else if (e.key === "Home" && !q.value) { e.preventDefault(); at = 0; mark(); }
      else if (e.key === "End" && !q.value) { e.preventDefault(); at = n - 1; mark(); }
      else if (e.key === "Enter") { e.preventDefault(); choose(flat[at]); }
    });
    p = pop(anchor, [q, note, lb], { label: opts.label, cls: "dve-picker", width: opts.width || 340, first: q, onClose: opts.onClose });
    fill();
    return p;
  }

  // the device picker: devs [{id, label, room, kind}] (more: the hub's helpers, shown on request) → pick(id)
  function pickDevice(anchor, devs, cur, pickId, more = []) {
    let all = false;
    return searchList(anchor, { label: t("builder.dve.pickDevice"), placeholder: t("builder.dve.searchDevices"), cur,
      groups: (q) => search(all ? devs.concat(more) : devs, q).map((g) => ({ label: g.room || t("builder.dve.noRoom"),
        items: g.items.map((d) => ({ key: d.id, name: d.label, sub: kindName(d.kind), icon: kindIcon(d.kind) })) })),
      more: () => (!all && more.length ? t("builder.dev.showHelpers", { n: more.length }) : ""), showMore: () => { all = true; },
      pick: (k) => pickId(+k) });
  }

  // the icon picker: items [{v, name, group, cat, anim}] (builder.js iconItems + the owner's pictures as group "pics");
  // pic(v, size) draws one; pick(v | null) — null = automatic (the device's own)
  function pickIcon(anchor, items, cur, pick, pic, auto) {
    let f = "all";
    const q = mk("input", "dve-q", { type: "search", placeholder: t("builder.icon.find"), "aria-label": t("builder.icon.find"), autocomplete: "off" });
    const grid = mk("div", "dve-icons", { role: "listbox", "aria-label": t("builder.dve.icons") }), note = mk("small", "muted dve-inote");   // i18n-ok (class names, CSS)
    const chips = mk("div", "dve-chips", { role: "radiogroup", "aria-label": t("builder.dve.icons") });
    const FILTERS = [["all", t("builder.dve.allIcons")], ["anim", t("builder.icon.anim")], ["art", t("builder.dve.drawings")], ["pics", t("builder.icon.pictures")]];
    const SHOW = 240;
    let p = null;
    const fill = () => {
      chips.replaceChildren(...FILTERS.map(([k, n]) => mk("button", "chip" + (f === k ? " on" : ""), { type: "button", role: "radio", "aria-checked": String(f === k), onclick: () => { f = k; fill(); } }, n)));
      const s = fold(q.value).trim();
      const list = items.filter((it) => (f === "all" || (f === "anim" ? it.anim : f === "art" ? /^art:/.test(it.v) : it.group === "pics"))
        && (!s || s.split(/\s+/).every((w) => fold(`${it.name} ${it.v} ${it.cat || ""}`).includes(w))));
      const tile = (v, name, kid) => mk("button", "dve-ic" + ((cur || null) === v ? " cur" : ""), { type: "button", role: "option", "aria-selected": String((cur || null) === v), title: name, "aria-label": name,
        onclick: () => { p.close(); pick(v); } }, kid);
      grid.replaceChildren(...(f === "all" && !s ? [tile(null, auto, mk("span", "dve-auto", {}, auto))] : []), ...list.slice(0, SHOW).map((it) => tile(it.v, it.name, pic(it.v, /^art:/.test(it.v) ? 34 : 24))));
      note.textContent = !list.length ? t("builder.icon.nothing") : list.length > SHOW ? t("builder.dve.moreIcons", { n: SHOW, total: list.length }) : "";
    };
    q.addEventListener("input", fill);
    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); const b = grid.querySelector("button"); if (b) b.focus(); }
      if (e.key === "Enter") { e.preventDefault(); const b = grid.querySelector("button"); if (b) b.click(); }
    });
    // the arrows inside the grid: ← → one, ↑ ↓ a row (from where the tiles are)
    grid.addEventListener("keydown", (e) => {
      const bs = [...grid.querySelectorAll("button")], i = bs.indexOf(document.activeElement); if (i < 0) return;
      const per = Math.max(1, bs.filter((b) => b.offsetTop === bs[0].offsetTop).length);
      const j = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + per, ArrowUp: i - per }[e.key];
      if (j == null) return;
      e.preventDefault();
      if (j < 0 && e.key === "ArrowUp") return q.focus();
      if (bs[cl(j, 0, bs.length - 1)]) bs[cl(j, 0, bs.length - 1)].focus();
    });
    p = pop(anchor, [q, chips, note, grid], { label: t("builder.dve.icons"), cls: "dve-picker dve-iconpop", width: 380, height: 520, first: q });   // i18n-ok (class names, CSS)
    fill();
    return p;
  }

  // the color picker: hue (the Manager's rainbow slider), saturation, brightness, a hex code, the usual swatches;
  // pick(hex | null) as it changes (null = automatic: the device's own color); onClose once it's closed
  function pickColor(anchor, cur, pick, swatches = [], onClose = null) {
    let hsv = hexToHsv(cur) || { h: 270, s: 70, v: 95 };
    // (a hex typed in, a swatch or the color it had: kept exactly — the sliders only show it; HSV in whole steps would
    // round #22c55e to #21c45d. A slider moved: the color from the sliders)
    let exact = /^#[0-9a-f]{6}$/i.test(cur || "") ? cur.toLowerCase() : null;
    const prev = mk("i", "dve-cprev"), hex = mk("input", "dve-hex", { type: "text", maxlength: "7", spellcheck: "false", "aria-label": t("builder.dve.hex"), placeholder: "#rrggbb" });   // i18n-ok (a sample)
    const range = (cls, max, label) => mk("input", "dve-rng " + cls, { type: "range", min: "0", max: String(max), step: "1", "aria-label": label });
    const H = range("hue-range", 359, t("builder.dve.hue")), S = range("dve-sat", 100, t("builder.dve.saturation")), V = range("dve-bri", 100, t("builder.dve.brightness"));
    const show = (from) => {
      const c = exact || hsvToHex(hsv.h, hsv.s, hsv.v);
      H.value = String(hsv.h); S.value = String(hsv.s); V.value = String(hsv.v);
      S.style.background = `linear-gradient(to right, ${hsvToHex(hsv.h, 0, hsv.v)}, ${hsvToHex(hsv.h, 100, hsv.v)})`;   // i18n-ok (CSS)
      V.style.background = `linear-gradient(to right, #000, ${hsvToHex(hsv.h, hsv.s, 100)})`;   // i18n-ok (CSS)
      prev.style.background = c;
      if (from !== "hex") hex.value = c;
      return c;
    };
    const set = (from) => pick(show(from));
    H.addEventListener("input", () => { hsv.h = +H.value; exact = null; set(); });
    S.addEventListener("input", () => { hsv.s = +S.value; exact = null; set(); });
    V.addEventListener("input", () => { hsv.v = +V.value; exact = null; set(); });
    hex.addEventListener("input", () => { const v = hex.value.trim(), x = hexToHsv(v); hex.classList.toggle("bad", !x); if (x && /^#[0-9a-f]{6}$/i.test(v)) { hsv = x; exact = v.toLowerCase(); set("hex"); } });
    let p = null;
    const sw = mk("div", "dve-sws", {}, swatches.map(([name, c]) => mk("button", "dve-sw", { type: "button", title: name, "aria-label": name, style: `background:${c}`, onclick: () => { hsv = hexToHsv(c); exact = /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null; set(); } })));
    const row = (label, kid) => mk("label", "dve-crow", {}, mk("span", "", {}, label), kid);
    const body = [mk("div", "dve-chead", {}, prev, mk("b", "", {}, t("builder.dve.colorOn"))),
      mk("button", "ghost small dve-cauto", { type: "button", onclick: () => { p.close(); pick(null); } }, t("builder.dve.colorAuto")),   // i18n-ok (class names, CSS)
      sw, row(t("builder.dve.hue"), H), row(t("builder.dve.saturation"), S), row(t("builder.dve.brightness"), V), row(t("builder.dve.hex"), hex),
      mk("button", "primary small dve-cdone", { type: "button", onclick: () => p.close() }, t("builder.top.done"))];   // i18n-ok (class names, CSS)
    p = pop(anchor, body, { label: t("builder.dve.colorOn"), cls: "dve-colorpop", width: 300, first: H, onClose });
    show();
    return p;
  }

  window.DevEdit = { fold, hit, rank, search, kindIcon, kindName, isPurifier, isLock, canSwitch, purifierChoices, choices, same, pressAuto, pressOpts,
    actKey, plain, holdOpts, holdKey, dblOpts, FLY_MAX, flyDefault, flyList, flyKeys, FREE, MIN, zone, CURSOR, dragRect, nudge, placed, fixRect,
    autoPlace, from24, aligned, span, dropAt, move, hexToHsv, hsvToHex, pop, searchList, pickDevice, pickIcon, pickColor };
})();
