// Room Layout G — Layout D refined with the owners's feedback (contract: docs/room-layout-brief.md,
// docs/room-layout-variations.md, docs/room-layout-G.md). Every room page: a header (name, climate, lights-on count,
// window chips, the room's cameras, All on / All off, clock), then a 60/40 split.
//  LEFT  "stage": the room's appliances / ceiling fans / purifier as Room Test 2 drawings on cards of ONE fixed size
//        (≈ 70 % of Layout D's kitchen card), then the lights as orbs of ONE fixed size (Layout D's Living Room orb).
//        Rows that don't fit scroll sideways (touch pan-x, no scrollbar, a static edge fade); a sideways swipe never
//        toggles or dims anything (Layout F's scroll guard). Orb: tap = on / off; press and slide up / down (or along
//        the ring while the row doesn't scroll) = brightness with a live % on the orb, sent on release.
//        The control dock (brightness / warm↔cool / colour) is hidden until a light's NAME is tapped; ✕, the same name
//        again, or 20 s without a touch close it. Scenes on the Lights header (Bright / Relax / Night light / Cozy) and,
//        with 2+ fans, on the appliances header (Off / Breeze / Sleep / Max): tap = recall (one Home.batch), press and
//        hold = "Save the room's lights as …?" (stores each light's current state in Settings.v.scenes[roomId]).
//  RIGHT "Room status" as Layout E's "At a glance" rows (icon · label · value coloured by state, attention first; doors,
//        gates, windows, locks — lock-only — and alert sensors placed by Hubitat's room via Home.placed()), modes,
//        outlets / switches / shades, and Layout D's "Recently" timeline below when it fits.
// mount() builds once; update() only patches text, classes and CSS variables (rebuild only when the room's set of
// devices changes; the dock when another light is picked), so running animations never restart. ?demo=1 fakes running
// machines, motion, an open window, a tripped trap, lit lights and a few timeline entries LOCALLY for screenshots —
// while demo is on, taps never send anything (the fake state follows the tap; scenes are saved on the page only).
// GPU rule (variations doc): every card / orb / glance row / device row / timeline row that holds moving or fading
// children has a permanent `will-change: transform`; animated glows / rings / edge fades have a permanent
// `will-change: opacity`; no opacity transitions on glow-like layers (they change instantly); nothing toggles
// will-change; the dock (no animated or composited children) is the only thing shown / hidden with display; toast and
// scene sheet own permanent layers and switch opacity instantly (never visibility); status rows / timeline rows are never
// removed or re-created while the page is open; nudges only run on elements with a permanent layer.
//
// Drawings: washer/dryer/dishwasher/range/fridge/microwave/Dyson/garage/trap art and the machine view models are
// copied from roomtest2.js (our own drawings; credits there: wm_animated_ha_card MIT © 2026 sionetta for the
// dishwasher rack line art and the drum + progress arc composition, ha-appliance-card MIT © 2026 ADNPolymerase for the
// "animate only under a state class" pattern — licences in dashboard/vendor/anim/). Status glyphs after roomtest3.js.
// The ceiling fan, light orbs, control dock and timeline are our own (orbs / fan from Layout A, dock controls after Layout C).
(function () {
  "use strict";
  // (the Manager loads this file too, for its drawings: there the panel's words come with strings.js when it loads them first;
  // without them a word shows as its key — never an error)
  const T = window.T || ((k) => k);
  // (a word list made from T(): read fresh each time it's used, so another language's words count too once they arrive)
  const fresh = (make) => new Proxy(Array.isArray(make()) ? [] : {}, {
    get: (t, k) => { const o = make(), v = o[k]; return typeof v === "function" ? v.bind(o) : v; },
    has: (t, k) => k in make(), ownKeys: () => Reflect.ownKeys(make()),
    getOwnPropertyDescriptor: (t, k) => { const d = Object.getOwnPropertyDescriptor(make(), k); return d && { ...d, configurable: true }; },
  });
  const P = "rlG";

  // ---------- small helpers ----------
  const num = (v) => { if (v == null || v === "") return null; const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const str = (v) => (v == null ? "" : String(v));
  const lc = (v) => str(v).toLowerCase();
  const cap = (s) => { s = str(s); return s ? s[0].toUpperCase() + s.slice(1) : ""; };
  const esc = (s) => str(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ic = (n, s) => (window.icon ? window.icon(n, s) : "");
  const list = (v) => (Array.isArray(v) ? v : []);
  const safe = (fn, dflt) => { try { const v = fn(); return v == null ? dflt : v; } catch (e) { return dflt; } };
  const sel = (v) => (window.CSS && CSS.escape ? CSS.escape(str(v)) : str(v).replace(/[^A-Za-z0-9_-]/g, ""));
  function txt(el, v) { v = v == null ? "" : String(v); if (el && el.textContent !== v) el.textContent = v; }
  function cls(el, name, on) { if (el && el.classList.contains(name) !== !!on) el.classList.toggle(name, !!on); }
  function prop(el, n, v) { v = String(v); if (el && el.style.getPropertyValue(n) !== v) el.style.setProperty(n, v); }
  function html(el, v) { if (el && el._h !== v) { el._h = v; el.innerHTML = v; } } // compare with what WE wrote (serialised SVG differs)
  function setState(el, st, all) { all.forEach((s) => cls(el, `${P}-${s}`, s === st)); }
  const ago = (t, now = Date.now()) => { const s = (now - t) / 1000; if (s < 45) return T("rg2.justNow"); if (s < 3600) return T("rg2.minAgo", { n: Math.max(1, Math.round(s / 60)) }); const h = Math.floor(s / 3600); return h < 24 ? T("rg2.hAgo", { n: h }) : T("rg2.dAgo", { n: Math.floor(h / 24) }); };
  const hhmm = (t) => (window.T && T.time ? T.time(new Date(t)) : new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  // "since …" for page-life times: just the time today; weekday + time within the last 6 days; else the date too
  const sinceAt = (t) => {
    const d = new Date(t), now = new Date();
    if (d.toDateString() === now.toDateString()) return hhmm(t);
    if (now - d < 6 * 864e5) return window.T && T.weekday ? `${T.weekday(d)} ${hhmm(t)}` : `${d.toLocaleDateString([], { weekday: "short" })} ${hhmm(t)}`;
    return window.T && T.dateTime ? T.dateTime(d) : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${hhmm(t)}`;
  };
  // tidy device names for display ("WLED-2) Accent Light" → "Accent Light"; "Living Room Lamp" in the Living Room → "Lamp")
  function nice(name, room) {
    let n = str(name).replace(/^WLED\s*-\s*\d+\)\s*/i, "").replace(/\s*\((LED Color)\)/i, ` ${T("rg2.colourWord")}`).trim();
    if (room && n.toLowerCase().startsWith(room.toLowerCase() + " ")) n = n.slice(room.length).trim();
    if (room && n.length > room.length + 4 && n.toLowerCase().endsWith(" " + room.toLowerCase())) n = n.slice(0, -room.length).trim();
    return n || str(name) || T("rg.device");
  }

  // ---------- demo (local fake states for screenshots; never sent anywhere) ----------
  const URL_DEMO = /[?&]demo=1\b/.test(location.search);
  let demo = false, demoStart = 0;
  const dT = () => (Date.now() - demoStart) / 1000;
  const DEMO_LIGHTS = [
    { on: true, level: 85, ct: 2700, mode: T("rg.ct") }, { on: true, level: 65, hue: 76, sat: 88, mode: "RGB" }, { on: false },
    { on: true, level: 40, ct: 4300, mode: T("rg.ct") }, { on: true, level: 100, hue: 52, sat: 75, mode: "RGB" }, { on: false },
    { on: true, level: 25, hue: 92, sat: 90, mode: "RGB" }, { on: true, level: 55, ct: 3200, mode: T("rg.ct") }];
  function demoDev(d, i) {
    if (d.kind === "fan") return { on: true, speed: "medium" };
    if (d.kind === "shade") return { level: 50 };
    if (d.kind !== "light") return null;
    const p = { ...DEMO_LIGHTS[i % DEMO_LIGHTS.length] };
    if (p.mode === "RGB" && !d.rgb) { delete p.hue; delete p.sat; delete p.mode; if (d.white) { p.ct = 2900; p.mode = T("rg.ct"); } }
    if (p.mode === "CT" && !d.white) { delete p.ct; delete p.mode; }
    if (!d.dim) delete p.level;
    return p;
  }
  function demoThing(t) {
    const e = dT(), n = t.name || "";
    switch (t.kind) {
      case "washer": { const left = Math.max(1, 23 - Math.floor(e / 20)); return { machineState: "run", washerJobState: "wash", cycle: "Normal", progressPercent: String(Math.min(99, 58 + Math.floor(e / 20) * 2)), timeRemaining: `00:${String(left).padStart(2, "0")}:00` }; }
      case "dryer": return { machineState: "run", dryerJobState: "drying", cycle: "Towels", progressPercent: "35", timeRemaining: "00:52:00" };
      case "dishwasher": return { operatingState: "running", running: "on", jobState: "washing", remainingTime: "74", progressPercent: "40" };
      case "oven": return { running: "on", ovenMode: "Bake", operatingState: "running", ovenSetpoint: "375", ovenTemperature: String(Math.min(375, 250 + Math.floor(e) * 4)), activeBurners: "2" };
      case "microwave": return { machineState: "finished", running: "off", cookingMode: "Reheat", _done: true };
      case "fridge": return { contact: e % 40 < 14 ? "open" : "closed" };
      case "purifier": return { fanState: "ON", fanMode: "FAN", fanSpeed: "0006", oscillation: "ON", airQualityIndex: "2" };
      case "vibration": return /#2/.test(n) ? { acceleration: "active" } : null;
      case "garage": return { door: e < 11 ? "opening" : "open", moving: e < 11 ? "true" : "false" };
      case "motion": return { motion: e % 90 < 50 ? "active" : "inactive" };
      default: return null;
    }
  }
  // demo: taps change only these local overrides (light / fan / shade / plug id → fields), never the house
  const demoOv = new Map();
  let rawAttrs = false; // the timeline tracker reads the REAL attributes, even while this page shows demo states
  const A = (t) => { if (!t) return {}; const a = t.attrs && typeof t.attrs === "object" ? t.attrs : {}; const d = demo && !rawAttrs ? demoThing(t) : null; return d ? { ...a, ...d } : a; };
  // Dyson: the driver reports upper-case values (fanState "OFF"/"FAN", fanMode "OFF"/"FAN"/"AUTO")
  const dysonOn = (a) => { const s = lc(a.fanState).trim(), m = str(a.fanMode).trim().toUpperCase(); return (s !== "" && s !== "off") || m === "FAN" || m === "AUTO"; };

  // ---------- "last motion": remembered for the whole page life (not only while this layout is showing) ----------
  const lastMotion = new Map(); // thing id → ms when last seen active
  const pageStart = Date.now();
  function trackMotion() {
    try { for (const t of list(Home.things({ kind: "motion" }))) if (t && t.attrs && lc(t.attrs.motion) === "active") lastMotion.set(String(t.id), Date.now()); } catch (e) { /* odd data */ }
  }
  if (window.Home && typeof Home.onChange === "function") Home.onChange(trackMotion);

  // ---------- colour ----------
  const WARM = [255, 206, 140];
  function k2rgb(k) { // Kelvin → sRGB (Tanner Helland's fit)
    const t = clamp(k, 1000, 12000) / 100;
    const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
    const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    return [r, g, b].map((v) => clamp(Math.round(v), 0, 255));
  }
  function hue2rgb(deg) { // fully saturated hue → sRGB
    const h = (((deg % 360) + 360) % 360) / 60, x = 1 - Math.abs((h % 2) - 1);
    const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
    return [r, g, b].map((v) => Math.round(v * 255));
  }
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (c) => `rgb(${c.join(",")})`;
  const colourOf = (hue, sat) => mix([255, 255, 255], hue2rgb(hue * 3.6), clamp(sat == null ? 100 : sat, 0, 100) / 100);
  // ct may come as Kelvin or (some drivers) as mireds
  const kelvin = (ct) => { ct = num(ct); if (ct == null || ct <= 0) return null; if (ct < 1000) ct = 1e6 / ct; return clamp(Math.round(ct), 2000, 6500); }; // the range data.js / the hub accept
  const HUE_NAMES = fresh(() => ([[4, T("rg.red")], [10, T("rg.orange")], [15, T("rg.amber")], [20, T("rg.yellow")], [30, T("rg.lime")], [40, T("rg.green")], [47, T("rg.teal")], [55, T("rg.cyan")], [64, T("rg.sky")], [70, T("rg.blue")], [77, T("rg.indigo")], [84, T("rg.purple")], [92, T("rg.magenta")], [97, T("rg.pink")], [101, T("rg.red")]]));
  const hueName = (h) => (HUE_NAMES.find(([lim]) => h < lim) || [0, T("rg.colour")])[1];
  const ctName = (k) => (k < 2500 ? T("rg.candle") : k < 3200 ? T("rg.warmWhite") : k < 4500 ? T("rg.neutralWhite") : k < 5800 ? T("rg.coolWhite") : T("rg.daylight"));
  // one light → everything the orb / dock needs
  function lightLook(d) {
    const on = !!d.on, level = d.dim ? clamp(Math.round(num(d.level) ?? 100), 1, 100) : 100;
    const hue = num(d.hue), sat = num(d.sat), K = d.white ? kelvin(d.ct) : null, mode = lc(d.mode);
    const colour = !!d.rgb && (mode === "rgb" || (mode !== "ct" && hue != null && (sat == null || sat > 5) && K == null));
    // cool whites get a touch of blue so daylight reads as daylight, not grey
    const c = colour ? colourOf(hue ?? 0, sat ?? 100) : K ? (K > 4800 ? mix(k2rgb(K), [196, 222, 255], clamp((K - 4800) / 1700, 0, 1) * 0.6) : k2rgb(K)) : WARM;
    return { on, level, lv: level / 100, colour, hue: hue ?? 0, sat: sat ?? 100, K: K || (d.white ? 2700 : null), c,
      kind: colour ? (sat != null && sat < 25 ? "Soft " + hueName(hue ?? 0).toLowerCase() : hueName(hue ?? 0)) : K ? ctName(K) : d.white ? T("rg.white") : "",
      caps: !!(d.dim || d.white || d.rgb) };
  }

  // ---------- time helpers + machine view models (from roomtest2.js) ----------
  function hmsMin(s) { // "00:44:00" → 44 (minutes)
    if (s == null || s === "") return null;
    const p = String(s).split(":").map(Number);
    if (p.some((x) => !Number.isFinite(x))) return null;
    return p.length === 3 ? p[0] * 60 + p[1] + p[2] / 60 : p.length === 2 ? p[0] * 60 + p[1] : p[0];
  }
  function fmtLeft(m) { if (m == null) return "—"; m = Math.max(0, Math.round(m)); const h = Math.floor(m / 60); return h ? `${h}:${String(m % 60).padStart(2, "0")}` : `${m} min`; }
  function fmtDisp(m) { if (m == null) return "--:--"; m = Math.max(0, Math.round(m)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; }
  const clock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const at = (m) => clock(new Date(Date.now() + m * 60000));

  const PHASE = fresh(() => ({ wash: T("rg.washing"), rinse: T("rg.rinsing"), spin: T("rg.spinning"), prewash: T("rg.preWash"), soak: T("rg.soaking"), weightsensing: T("rg.weighing"), airwash: T("rg.airWash"),
    drying: T("rg.drying"), cooling: T("rg.cooling"), wrinkleprevent: T("rg.wrinkleGuard"), delaywash: T("rg.delayedStart"), finish: T("rg.finished"), washing: T("rg.washing"), rinsing: T("rg.rinsing"), predrain: T("rg.draining"), sanitizing: T("rg.sanitizing") }));
  function laundryVM(t, kind) {
    const a = A(t), ms = lc(a.machineState), job = lc(a[kind + "JobState"]);
    const st = ms === "run" ? "run" : ms === "pause" ? "pause" : /finish|done|end/.test(job) ? "done" : "idle";
    const left = hmsMin(a.timeRemaining), pct = clamp(num(a.progressPercent) || 0, 0, 100), cycle = a.cycle || "";
    const phase = PHASE[job] || (job && job !== "none" ? job : "");
    return {
      st, spin: st === "run" && job === "spin", pct: st === "done" ? 100 : st === "idle" ? 0 : pct, left: st === "run" || st === "pause" ? left : null,
      big: st === "done" ? T("rg.done") : st === "idle" ? T("rg.idle") : fmtLeft(left), bigUnit: (st === "run" || st === "pause") && left != null ? T("rg2.left") : "",
      sub: st === "run" ? [cycle, phase].filter(Boolean).join(" · ") : st === "pause" ? T("rg2.pausedCycle", { cycle }) : st === "done" ? T("rg2.finishedUnload", { cycle: cycle || T("rg.cycle") }) : cycle ? T("rg2.lastCycle", { cycle }) : T("rg.ready"),
      disp: st === "done" ? T("rg.end") : st === "idle" ? "--:--" : fmtDisp(left), badge: { run: T("rg.running"), pause: T("rg.paused"), done: T("rg.done2"), idle: T("rg.idle") }[st],
      eta: st === "run" ? `${Math.round(pct)}% done${left != null ? ` · finishes ${at(left)}` : ""}` : st === "pause" ? `${Math.round(pct)}% done · waiting` : "",
    };
  }
  function dishVM(t) {
    const a = A(t), op = lc(a.operatingState), job = lc(a.jobState);
    const run = /run/.test(op) || a.running === "on", pause = /pause/.test(op);
    const st = run ? "run" : pause ? "pause" : /finish/.test(job) ? "done" : "idle";
    const left = num(a.remainingTime), pct = clamp(num(a.progressPercent) || 0, 0, 100);
    return { st, pct: st === "idle" ? 0 : st === "done" ? 100 : pct, left,
      big: st === "done" ? T("rg.done") : st === "idle" ? T("rg.idle") : fmtLeft(left), bigUnit: st === "run" || st === "pause" ? T("rg2.left") : "",
      sub: st === "run" ? (PHASE[job.replace(/[^a-z]/g, "")] || T("rg.washing")) + (left != null ? `\n${T("rg2.doneAt", { time: at(left) })}` : "") : st === "pause" ? T("rg.paused") : st === "done" ? T("rg.cleanDishes") : T("rg.ready"),
      disp: st === "done" ? T("rg.end") : st === "idle" ? "--:--" : fmtDisp(left), badge: { run: T("rg.running"), pause: T("rg.paused"), done: T("rg.done2"), idle: T("rg.idle") }[st] };
  }
  function ovenVM(t) {
    const a = A(t), mode = a.ovenMode || "";
    const on = a.running === "on" || (!!mode && !/no operation|^off$|none/i.test(mode));
    const temp = num(a.ovenTemperature), set = num(a.ovenSetpoint), burners = clamp(Math.round(num(a.activeBurners) || 0), 0, 4);
    const pre = on && temp != null && set != null && temp < set - 5;
    const st = on || burners ? "run" : "idle";
    return { st, on, temp, set, burners, pre, fill: on && set ? clamp((temp || 0) / set, 0, 1) : 0,
      big: on ? `${temp != null ? Math.round(temp) : "—"}°` : burners ? T("rg2.nOn", { n: burners }) : T("rg.off"),
      sub: on ? (pre ? T("rg2.preheatTo", { t: set }) : T("rg2.modeSet", { mode: mode || T("rg.oven"), t: set })) : burners ? T("rg2.burnersLit", { n: burners }) : T("rg.ovenAndCooktopOff"),
      burnTxt: burners ? T("rg2.burnersOn", { n: burners }) : "", disp: on ? `${temp != null ? Math.round(temp) : "--"}°` : "--",
      badge: pre ? T("rg.preheating") : on ? T("rg.baking") : burners ? T("rg.cooktop") : T("rg.off") };
  }
  function fridgeVM(t) {
    const a = A(t), cool = num(a.coolerTemperature), frz = num(a.freezerTemperature);
    const open = lc(a.contact) === "open", fOpen = lc(a.doorFreezerOpen) === "open";
    const warm = (cool != null && cool > 41) || (frz != null && frz > 5);
    return { open, fOpen, warm, cool, frz, power: num(a.power), st: open || fOpen || warm ? "warn" : "ok",
      badge: open ? T("rg.doorOpen") : fOpen ? T("rg.freezerOpen") : warm ? T("rg.tooWarm") : T("rg.ok") };
  }
  function microVM(t) {
    const a = A(t), ms = lc(a.machineState), run = ms === "run" || a.running === "on";
    const done = !run && (a._done || /finish|end/.test(ms));
    const st = run ? "run" : done ? "done" : "idle", mode = a.cookingMode && !/no operation/i.test(a.cookingMode) ? a.cookingMode : "";
    const pct = clamp(num(a.progressPercent) || 0, 0, 100), hood = num(a.hoodFanSpeed) || 0;
    return { st, pct, big: run ? `${Math.round(pct)}%` : done ? T("rg.done") : T("rg.idle"),
      sub: [run ? mode || T("rg.cooking") : done ? (mode ? T("rg2.modeFinished", { mode }) : T("rg.foodIsReady")) : T("rg.ready"), hood ? T("rg2.hoodFan", { n: hood }) : ""].filter(Boolean).join("\n"),
      disp: run ? T("rg.cook") : done ? T("rg.end") : "--:--", badge: { run: T("rg.cooking"), done: T("rg.done2"), idle: T("rg.idle") }[st] };
  }

  // ---------- "Recently": events recorded for the whole page life (every room), shown per room ----------
  // Each source gets a ref ("t<thing id>", "w<window>", "d<door>", "l<lock>", "s<sensor>"); the first value seen is the
  // baseline (no event), every later change may add an event. Real attributes only (rawAttrs), never demo states.
  const EVENTS = []; // newest first: { id, ref, kind, g, tone, text, sub, at }
  const prevSt = new Map();
  let evSeq = 0;
  function pushEv(ref, e) {
    const now = Date.now(), last = EVENTS.find((x) => x.ref === ref);
    // repeated motion from one sensor within 10 min: one entry that moves up ("× 3"), keeping its id
    if (e.merge && last && last.kind === e.kind && now - last.at < 10 * 60000) { last.at = now; last.n = (last.n || 1) + 1; EVENTS.splice(EVENTS.indexOf(last), 1); EVENTS.unshift(last); return; }
    EVENTS.unshift({ ...e, id: ++evSeq, ref, at: now });
    if (EVENTS.length > 300) EVENTS.length = 300;
  }
  function watch(ref, st, mk) { const p = prevSt.get(ref); prevSt.set(ref, st); if (p === undefined || p === st) return; const e = mk(st, p); if (e) pushEv(ref, e); }
  const MACH_NAME = fresh(() => ({ washer: T("rg.washer"), dryer: T("rg.dryer"), dishwasher: T("rg.dishwasher"), microwave: T("rg.microwave"), oven: T("rg.oven"), fridge: T("rg.fridge"), purifier: T("rg.airPurifier") }));
  let hubLive = null;
  function trackEvents() {
    const S = safe(() => Home.state, null); if (!S || typeof S !== "object") return;
    // the page starts on a static snapshot; when the live Hubitat state arrives every difference would look like an
    // event ("window opened just now") — so the first live state is a new baseline, not news
    const live = !!safe(() => Home.hub.live, false);
    if (live !== hubLive) { hubLive = live; prevSt.clear(); }
    rawAttrs = true;
    try {
      for (const t0 of list(S.things)) {
        if (!okObj(t0)) continue;
        const t = normThing(t0), a = t.attrs, ref = "t" + t.id, nm = MACH_NAME[t.kind] || nice(t.name, t.room);
        switch (t.kind) {
          case "motion": watch(ref, lc(a.motion) === "active" ? "on" : "off", (s) => (s === "on" ? { kind: "motion", g: "motion", tone: "live", text: T("rg.motionSeen"), sub: /^motion$/i.test(t.name) ? T("rg.motionSensor") : nice(t.name, t.room), merge: true } : null)); break;
          case "garage": watch(ref, lc(a.door || a.contact) || "unknown", (s) => (s === "open" ? { kind: "garage", g: "garage", tone: "warn", text: T("rg.garageDoorOpened") } : s === "closed" ? { kind: "garage", g: "garage", tone: "ok", text: T("rg.garageDoorClosed") } : null)); break;
          case "washer": case "dryer": case "dishwasher": case "microwave": {
            const vm = t.kind === "dishwasher" ? dishVM(t) : t.kind === "microwave" ? microVM(t) : laundryVM(t, t.kind);
            const cyc = str(a.cycle || a.cookingMode).replace(/no operation/i, "");
            watch(ref, vm.st === "pause" ? "run" : vm.st, (s) => (s === "run" ? { kind: "mach", g: "play", tone: "live", text: T("rg2.started", { name: nm }), sub: cyc } : s === "done" ? { kind: "mach", g: "check", tone: "ok", text: T("rg2.finished", { name: nm }), sub: t.kind === "microwave" ? T("rg.foodIsReady") : t.kind === "dishwasher" ? T("rg.cleanDishes") : T("rg.timeToUnload") } : null));
            break;
          }
          case "oven": { const ov = ovenVM(t); watch(ref, ov.on ? "on" : "off", (s) => (s === "on" ? { kind: "mach", g: "flame", tone: "live", text: T("rg.ovenOn"), sub: ov.set ? T("rg2.modeSet", { mode: a.ovenMode || T("rg.bake"), t: ov.set }) : "" } : { kind: "mach", g: "flame", tone: "idle", text: T("rg.ovenOff") })); break; }
          case "fridge": watch(ref, lc(a.contact) === "open" ? "open" : "closed", (s) => (s === "open" ? { kind: "door", g: "door", tone: "warn", text: T("rg.fridgeDoorOpened") } : { kind: "door", g: "door", tone: "ok", text: T("rg.fridgeDoorClosed") })); break;
          case "purifier": watch(ref, dysonOn(a) ? "on" : "off", (s) => ({ kind: "mach", g: "air", tone: s === "on" ? "live" : "idle", text: T(s === "on" ? "rg2.purifierOn" : "rg2.purifierOff") })); break;
          case "vibration": watch(ref, lc(a.acceleration) === "active" ? "on" : "off", (s) => (s === "on" ? { kind: "trap", g: "trap", tone: "bad", text: T("rg2.trapOff", { name: str(t.name).replace(/mouse trap\s*/i, T("rg.trap") + " ") }) } : null)); break;
          case "siren": watch(ref, /^(off|none|)$/i.test(str(a.alarm)) ? "off" : "on", (s) => (s === "on" ? { kind: "alert", g: "siren", tone: "bad", text: T("rg2.sounding", { name: nice(t.name, t.room) }) } : { kind: "alert", g: "siren", tone: "ok", text: T("rg2.quietAgain", { name: nice(t.name, t.room) }) })); break;
        }
      }
      for (const w of list(S.windows)) if (okObj(w)) watch("w" + w.id, w.open ? "open" : "closed", (s) => ({ kind: "win", g: "window", tone: s === "open" ? "warn" : "ok", text: `${winLabel(w, S)} ${s === "open" ? "opened" : "closed"}` }));
      for (const d of list(S.doors)) if (okObj(d)) watch("d" + d.id, d.open ? "open" : "closed", (s) => ({ kind: "door", g: "door", tone: s === "open" ? "warn" : "ok", text: T(s === "open" ? "rg2.doorOpened" : "rg2.doorClosed"), sub: str(d.name) }));
      for (const l of list(S.locks)) if (okObj(l)) watch("l" + l.id, str(l.lock), (s) => (s === "locked" || s === "unlocked" ? { kind: "lock", g: s === "locked" ? "lock" : "unlock", tone: s === "locked" ? "ok" : "warn", text: T(s === "locked" ? "rg2.lockLocked" : "rg2.lockUnlocked", { name: str(l.name) || T("rg.lock") }) } : null));
      for (const s0 of list(S.sensors)) if (okObj(s0)) watch("s" + s0.id, s0.state === "detected" ? "on" : "off", (s) => {
        const what = { smoke: T("rg.smokeCo"), water: T("rg.water"), gas: T("rg.gas"), freezer: T("rg.freezerTooWarm"), power: T("rg.freezerPowerLost") }[s0.kind] || cap(s0.kind) || T("rg.alert");
        return s === "on" ? { kind: "alert", g: { smoke: "smoke", water: "leak", gas: "gas", freezer: "freezer", power: "power" }[s0.kind] || "alert", tone: "bad", text: s0.kind === "freezer" || s0.kind === "power" ? what : T("rg2.detected", { what }), sub: str(s0.where) }
          : { kind: "alert", g: "check", tone: "ok", text: T("rg2.cleared", { what: s0.kind === "water" ? T("rg.leak") : cap(s0.kind) || T("rg.alert") }), sub: str(s0.where) };
      });
    } catch (e) { /* odd data: skip this round */ }
    rawAttrs = false;
  }
  function winLabel(w, S) {
    const rn = str((list(S.rooms).find((r) => r && list(r.windows).includes(w.id)) || {}).name), n = nice(w.name, rn);
    return !n || lc(n) === lc(rn) ? T("rg.window") : /window/i.test(n) ? n : T("rg2.windowOf", { name: n });
  }

  // ---------- drawings (our own SVG; viewBoxes noted per function) ----------
  const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <linearGradient id="${P}-enamel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f4ff"/><stop offset=".6" stop-color="#e3ddf5"/><stop offset="1" stop-color="#c9c1e3"/></linearGradient>
    <linearGradient id="${P}-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9c5da"/><stop offset=".45" stop-color="#eeebf7"/><stop offset="1" stop-color="#b8b3cc"/></linearGradient>
    <linearGradient id="${P}-chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#aaa3c6"/></linearGradient>
    <linearGradient id="${P}-panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d2552"/><stop offset="1" stop-color="#1c1737"/></linearGradient>
    <radialGradient id="${P}-glassW" cx=".38" cy=".3" r=".95"><stop offset="0" stop-color="#3a4c80"/><stop offset=".6" stop-color="#1f2a52"/><stop offset="1" stop-color="#121835"/></radialGradient>
    <radialGradient id="${P}-glassD" cx=".38" cy=".3" r=".95"><stop offset="0" stop-color="#4d3b4a"/><stop offset=".6" stop-color="#2b2030"/><stop offset="1" stop-color="#17111c"/></radialGradient>
    <radialGradient id="${P}-heat" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#ffb347" stop-opacity=".7"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
    <radialGradient id="${P}-ovglow" cx=".5" cy=".85" r=".9"><stop offset="0" stop-color="#ff9a3d" stop-opacity=".95"/><stop offset=".55" stop-color="#ff6a2b" stop-opacity=".45"/><stop offset="1" stop-color="#ff6a2b" stop-opacity="0"/></radialGradient>
    <linearGradient id="${P}-mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc" stop-opacity="0"/><stop offset=".6" stop-color="#7dd3fc" stop-opacity=".45"/><stop offset="1" stop-color="#7dd3fc" stop-opacity=".1"/></linearGradient>
    <clipPath id="${P}-cpDrum"><circle cx="110" cy="154" r="61"/></clipPath>
    <clipPath id="${P}-cpDish"><rect x="34" y="46" width="132" height="146" rx="10"/></clipPath>
    <clipPath id="${P}-cpOven"><rect x="36" y="112" width="128" height="88" rx="8"/></clipPath>
    <clipPath id="${P}-cpMicro"><rect x="20" y="78" width="114" height="86" rx="8"/></clipPath>
  </defs></svg>`;

  const doneBadge = (cx, cy, r) => `<g class="${P}-donebadge" style="transform-origin:${cx}px ${cy}px">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#34d399" stroke="#fff" stroke-width="3"/>
      <path d="M${cx - r * .45} ${cy + r * .02} l${r * .3} ${r * .32} l${r * .55} -${r * .62}" fill="none" stroke="#fff" stroke-width="${r * .22}" stroke-linecap="round" stroke-linejoin="round"/></g>`;

  // washer / dryer front loader — viewBox 0 0 220 270, door centre 110,154
  function laundryArt(kind) {
    const dry = kind === "dryer";
    return `<svg class="${P}-mach" viewBox="0 0 220 270" aria-hidden="true">
      <ellipse cx="110" cy="263" rx="90" ry="6" fill="#000" opacity=".28"/>
      <rect x="22" y="252" width="16" height="10" rx="3" fill="#8e86ad"/><rect x="182" y="252" width="16" height="10" rx="3" fill="#8e86ad"/>
      <rect x="12" y="6" width="196" height="250" rx="18" fill="url(#${P}-enamel)"/>
      <rect x="12.5" y="6.5" width="195" height="249" rx="17.5" fill="none" stroke="#fff" stroke-opacity=".7"/>
      <rect x="22" y="14" width="176" height="32" rx="11" fill="url(#${P}-panel)"/>
      ${dry ? "" : `<rect x="30" y="20" width="34" height="20" rx="5" fill="#3b335f"/><rect x="34" y="27" width="26" height="3" rx="1.5" fill="#6d64a0"/>`}
      <circle cx="${dry ? 46 : 82}" cy="30" r="10" fill="#e9e5f7" stroke="#8e86ad"/><rect x="${dry ? 45 : 81}" y="21" width="2" height="7" rx="1" fill="#2d2552"/>
      <rect x="104" y="19" width="66" height="22" rx="6" fill="#0c0920"/>
      <text class="${P}-disp" data-k="disp" x="137" y="35" text-anchor="middle">--:--</text>
      <circle class="${P}-led" cx="184" cy="30" r="4"/>
      <circle cx="110" cy="154" r="87" fill="none" stroke="#2d2552" stroke-opacity=".14" stroke-width="8"/>
      <circle class="${P}-ring" data-k="ring" cx="110" cy="154" r="87" pathLength="100" transform="rotate(-90 110 154)"/>
      <circle cx="110" cy="154" r="76" fill="url(#${P}-chrome)"/>
      <circle cx="110" cy="154" r="76" fill="none" stroke="#8e86ad" stroke-opacity=".6"/>
      <circle cx="110" cy="154" r="67" fill="#1b1636"/>
      <circle cx="110" cy="154" r="62" fill="url(#${P}-glass${dry ? "D" : "W"})"/>
      <g clip-path="url(#${P}-cpDrum)">
        ${dry ? `<circle class="${P}-heat" cx="110" cy="160" r="60" fill="url(#${P}-heat)"/>` : `<path class="${P}-water" d="M30 184 q15 -7 30 0 t30 0 t30 0 t30 0 t30 0 t30 0 V230 H30z" fill="#38bdf8" opacity=".32"/>`}
        <g class="${P}-drum">
          <circle cx="110" cy="154" r="55" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="3" stroke-dasharray="0 8.6" stroke-linecap="round"/>
          ${[0, 120, 240].map((r) => `<rect x="105" y="94" width="10" height="15" rx="4" fill="#fff" fill-opacity=".16" transform="rotate(${r} 110 154)"/>`).join("")}
        </g>
        <g class="${P}-clothes">
          <path d="M84 186 l10 -8 h13 l10 8 -5 7 -5 -3 v15 h-13 v-15 l-5 3z" fill="${dry ? "#f9a8d4" : "#f87171"}"/>
          <ellipse cx="128" cy="196" rx="17" ry="9" fill="${dry ? "#fde68a" : "#60a5fa"}" transform="rotate(14 128 196)"/>
          <ellipse cx="108" cy="207" rx="12" ry="6" fill="#34d399"/>
          <rect x="132" y="178" width="8" height="18" rx="4" fill="#fbbf24" transform="rotate(35 136 187)"/>
        </g>
      </g>
      <ellipse cx="88" cy="126" rx="24" ry="13" fill="#fff" opacity=".13" transform="rotate(-28 88 126)"/>
      <circle cx="110" cy="154" r="62" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2"/>
      <rect x="181" y="140" width="8" height="28" rx="4" fill="#cfc8e6" stroke="#8e86ad" stroke-opacity=".6"/>
      ${doneBadge(110, 154, 26)}
    </svg>`;
  }

  // dishwasher — viewBox 0 0 200 240; window clip 34..166 × 46..192
  function dishesArt() {
    // Rack + dish line art ported from wm_animated_ha_card _svgDishwasher (MIT © 2026 sionetta), rescaled to our window.
    return `<g transform="translate(-34.4 -29) scale(1.222 1.25)" fill="none" stroke-linecap="round">
      <line x1="64" y1="92" x2="156" y2="92" stroke="#8fa0b5" stroke-width="1.6" opacity=".75"/>
      <path d="M70 72 v14 c0 5 4 8 8 8 s8-3 8-8 V72 Z" stroke="#e8f0fa" stroke-width="1.8"/>
      <path d="M90 70 v16 c0 5 3.5 7.5 7 7.5 s7-2.5 7-7.5 V70 Z" stroke="#d7e3f4" stroke-width="1.8"/>
      <path d="M112 78 c0 8 5 12 12 12 s12-4 12-12" stroke="#c9d7ea" stroke-width="2"/>
      <ellipse cx="124" cy="78" rx="12" ry="3.2" stroke="#c9d7ea" stroke-width="1.7"/>
      <rect x="142" y="72" width="12" height="16" rx="2.5" stroke="#e8f0fa" stroke-width="1.8"/>
      <path d="M154 76 c4 0 5 3 5 5 s-1 5-5 5" stroke="#e8f0fa" stroke-width="1.7"/>
      <line x1="64" y1="138" x2="156" y2="138" stroke="#8fa0b5" stroke-width="1.6" opacity=".75"/>
      <ellipse cx="80" cy="124" rx="14" ry="5.5" stroke="#e8f0fa" stroke-width="2"/>
      <ellipse cx="80" cy="128" rx="14" ry="5.5" stroke="#d0dced" stroke-width="1.7" opacity=".85"/>
      <ellipse cx="80" cy="132" rx="14" ry="5.5" stroke="#b9c8dc" stroke-width="1.5" opacity=".7"/>
      <ellipse cx="112" cy="126" rx="15" ry="5.8" stroke="#e8f0fa" stroke-width="2"/>
      <ellipse cx="112" cy="130" rx="15" ry="5.8" stroke="#d0dced" stroke-width="1.7" opacity=".85"/>
      <path d="M132 120 c0 10 6 15 14 15 s14-5 14-15" stroke="#d7e3f4" stroke-width="2"/>
      <ellipse cx="146" cy="120" rx="14" ry="3.4" stroke="#d7e3f4" stroke-width="1.7"/></g>`;
  }
  function dishArt() {
    return `<svg class="${P}-mach" viewBox="0 0 200 240" aria-hidden="true">
      <ellipse cx="100" cy="234" rx="78" ry="5" fill="#000" opacity=".28"/>
      <rect x="20" y="6" width="160" height="226" rx="14" fill="url(#${P}-steel)"/>
      <rect x="20" y="6" width="160" height="30" rx="12" fill="url(#${P}-panel)"/>
      <rect x="76" y="11" width="56" height="20" rx="5" fill="#0c0920"/>
      <text class="${P}-disp" data-k="disp" x="104" y="26" text-anchor="middle">--:--</text>
      <circle class="${P}-led" cx="146" cy="21" r="4"/><circle cx="162" cy="21" r="5" fill="#e9e5f7"/><circle cx="38" cy="21" r="5" fill="#e9e5f7"/>
      <rect x="30" y="42" width="140" height="154" rx="12" fill="#1b1636"/>
      <rect x="34" y="46" width="132" height="146" rx="10" fill="url(#${P}-glassW)"/>
      <g clip-path="url(#${P}-cpDish)">
        ${dishesArt()}
        <rect class="${P}-mist" x="34" y="46" width="132" height="146" fill="url(#${P}-mist)"/>
        <g class="${P}-drops" fill="#a5e4ff">
          <circle cx="58" cy="100" r="2"/><circle cx="92" cy="86" r="2.2"/><circle cx="126" cy="104" r="1.8"/><circle cx="148" cy="90" r="2"/><circle cx="74" cy="132" r="1.8"/><circle cx="112" cy="128" r="2"/>
        </g>
        <g class="${P}-arm">
          <g stroke="#a5e4ff" stroke-width="1.6" stroke-linecap="round" class="${P}-jets"><line x1="66" y1="180" x2="60" y2="160"/><line x1="66" y1="180" x2="72" y2="158"/><line x1="134" y1="180" x2="128" y2="158"/><line x1="134" y1="180" x2="140" y2="160"/></g>
          <line x1="54" y1="180" x2="146" y2="180" stroke="#8ec8ff" stroke-width="4" stroke-linecap="round"/>
          <circle cx="100" cy="180" r="4" fill="#cde9ff"/>
        </g>
      </g>
      <rect x="40" y="52" width="40" height="18" rx="6" fill="#fff" opacity=".1" transform="rotate(-10 60 61)"/>
      <rect x="66" y="203" width="68" height="8" rx="4" fill="#d9d5e8" stroke="#8e86ad" stroke-opacity=".6"/>
      <rect x="20" y="218" width="160" height="14" rx="6" fill="#a8a2bf"/>
      ${doneBadge(100, 119, 24)}
    </svg>`;
  }
  // range: cooktop + oven — viewBox 0 0 200 240
  function rangeArt() {
    const bx = [44, 82, 118, 156];
    return `<svg class="${P}-mach" viewBox="0 0 200 240" aria-hidden="true">
      <ellipse cx="100" cy="234" rx="84" ry="5" fill="#000" opacity=".28"/>
      <rect x="12" y="8" width="176" height="30" rx="10" fill="url(#${P}-panel)"/>
      <rect x="72" y="13" width="56" height="20" rx="5" fill="#0c0920"/>
      <text class="${P}-disp" data-k="disp" x="100" y="28" text-anchor="middle">--</text>
      ${[28, 46, 154, 172].map((x) => `<circle cx="${x}" cy="23" r="6.5" fill="#e9e5f7"/><rect x="${x - 1}" y="17" width="2" height="5" rx="1" fill="#2d2552"/>`).join("")}
      <path d="M10 38 h180 l-6 28 H16z" fill="#1f1938"/>
      ${bx.map((x, i) => `<g class="${P}-burner" data-k="b${i}">
          <ellipse cx="${x}" cy="53" rx="15" ry="5.5" fill="#2a2348" stroke="#4a4170" stroke-width="1.5"/>
          <g class="${P}-flame" style="transform-origin:${x}px 53px"><ellipse cx="${x}" cy="53" rx="15" ry="5.5" fill="none" stroke="#fb923c" stroke-width="2.4"/><ellipse cx="${x}" cy="53" rx="9" ry="3" fill="#fdba74" opacity=".55"/></g>
        </g>`).join("")}
      <rect x="12" y="66" width="176" height="160" rx="12" fill="url(#${P}-steel)"/>
      <rect x="34" y="78" width="132" height="7" rx="3.5" fill="#d9d5e8" stroke="#8e86ad" stroke-opacity=".6"/>
      <rect x="30" y="106" width="140" height="100" rx="12" fill="#1b1636"/>
      <rect x="36" y="112" width="128" height="88" rx="8" fill="#17111c"/>
      <g clip-path="url(#${P}-cpOven)">
        <g stroke="#6f6188" stroke-width="1.5" opacity=".8"><line x1="40" y1="140" x2="160" y2="140"/><line x1="40" y1="172" x2="160" y2="172"/></g>
        <rect class="${P}-ovglow" x="36" y="112" width="128" height="88" fill="url(#${P}-ovglow)"/>
        <g><ellipse cx="100" cy="166" rx="30" ry="7" fill="#9a5a2a"/><ellipse cx="100" cy="163" rx="30" ry="7" fill="#e8a45a"/>
          <circle cx="88" cy="161" r="3.2" fill="#d4552a" opacity=".85"/><circle cx="106" cy="159" r="2.6" fill="#d4552a" opacity=".75"/><circle cx="114" cy="163" r="2.2" fill="#b83f1c" opacity=".7"/></g>
        <path class="${P}-element" d="M44 194 l8 -5 8 5 8 -5 8 5 8 -5 8 5 8 -5 8 5 8 -5 8 5 8 -5 8 5 8 -5 8 5" fill="none" stroke="#fb923c" stroke-width="2.4" stroke-linejoin="round"/>
      </g>
      <rect x="42" y="118" width="38" height="14" rx="5" fill="#fff" opacity=".09" transform="rotate(-8 61 125)"/>
      <rect x="12" y="214" width="176" height="12" rx="5" fill="#a8a2bf"/>
    </svg>`;
  }
  // French-door fridge — viewBox 0 0 200 240
  function fridgeArt() {
    return `<svg class="${P}-mach" viewBox="0 0 200 240" aria-hidden="true">
      <ellipse cx="100" cy="234" rx="76" ry="5" fill="#000" opacity=".28"/>
      <rect x="24" y="4" width="152" height="228" rx="14" fill="#1b1636"/>
      <g class="${P}-inside"><rect x="28" y="10" width="144" height="138" rx="6" fill="#fff4c9"/>
      <g opacity=".55" stroke="#d8c98f" stroke-width="2"><line x1="32" y1="56" x2="168" y2="56"/><line x1="32" y1="100" x2="168" y2="100"/></g>
      <rect x="40" y="70" width="18" height="28" rx="4" fill="#86efac"/><rect x="64" y="80" width="24" height="18" rx="4" fill="#fca5a5"/><rect x="120" y="36" width="14" height="18" rx="3" fill="#93c5fd"/></g>
      <g class="${P}-leafL"><rect x="24" y="4" width="75" height="146" rx="12" fill="url(#${P}-steel)"/><rect x="88" y="44" width="5" height="68" rx="2.5" fill="#8e86ad"/>
        <rect x="36" y="22" width="44" height="40" rx="7" fill="#0c0920"/>
        <text class="${P}-disp ${P}-dsm" data-k="dc" x="58" y="38" text-anchor="middle">--°</text><text class="${P}-disp ${P}-dsm ${P}-dfz" data-k="df" x="58" y="55" text-anchor="middle">--°</text></g>
      <g class="${P}-leafR"><rect x="101" y="4" width="75" height="146" rx="12" fill="url(#${P}-steel)"/><rect x="107" y="44" width="5" height="68" rx="2.5" fill="#8e86ad"/></g>
      <g class="${P}-drawer"><rect x="24" y="153" width="152" height="79" rx="12" fill="url(#${P}-steel)"/><rect x="60" y="164" width="80" height="6" rx="3" fill="#8e86ad"/>
        <g transform="translate(100 200)" stroke="#8fb8e8" stroke-width="2.2" stroke-linecap="round" opacity=".8"><line x1="0" y1="-12" x2="0" y2="12"/><line x1="-10.4" y1="-6" x2="10.4" y2="6"/><line x1="-10.4" y1="6" x2="10.4" y2="-6"/></g></g>
    </svg>`;
  }
  // over-the-range microwave — viewBox 0 0 200 240 (box sits in the middle)
  function microArt() {
    return `<svg class="${P}-mach" viewBox="0 0 200 240" aria-hidden="true">
      <ellipse cx="100" cy="190" rx="86" ry="5" fill="#000" opacity=".25"/>
      <rect x="8" y="58" width="184" height="126" rx="12" fill="url(#${P}-steel)"/>
      <g stroke="#8e86ad" stroke-width="2" stroke-linecap="round" opacity=".7">${[30, 46, 62, 78, 94, 110, 126].map((x) => `<line x1="${x}" y1="66" x2="${x + 8}" y2="66"/>`).join("")}</g>
      <rect x="16" y="74" width="122" height="94" rx="10" fill="#1b1636"/>
      <rect x="20" y="78" width="114" height="86" rx="8" fill="#17111c"/>
      <g clip-path="url(#${P}-cpMicro)">
        <rect class="${P}-mwlight" x="20" y="78" width="114" height="86" fill="#ffe7a3"/>
        <ellipse cx="77" cy="152" rx="44" ry="7" fill="#3a3157" stroke="#6f6188"/>
        <g class="${P}-bowl"><path d="M58 132 h38 c0 12 -8 18 -19 18 s-19 -6 -19 -18z" fill="#f0abfc"/><ellipse cx="77" cy="132" rx="19" ry="4" fill="#fde68a"/></g>
      </g>
      <rect x="26" y="84" width="36" height="14" rx="5" fill="#fff" opacity=".09" transform="rotate(-8 44 91)"/>
      <rect x="144" y="76" width="40" height="20" rx="5" fill="#0c0920"/>
      <text class="${P}-disp ${P}-dsm" data-k="disp" x="164" y="90" text-anchor="middle">--:--</text>
      <g fill="#cfc8e6">${[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => `<rect x="${146 + c * 12.5}" y="${104 + r * 13}" width="9" height="8" rx="2.5"/>`).join("")).join("")}</g>
      <circle class="${P}-led" cx="164" cy="164" r="4"/>
      ${doneBadge(77, 121, 22)}
    </svg>`;
  }
  // Dyson tower — viewBox 0 0 90 110
  const dysonArt = () => `<svg class="${P}-small" viewBox="0 0 90 110" aria-hidden="true">
      <rect x="20" y="4" width="38" height="70" rx="19" fill="none" stroke="url(#${P}-steel)" stroke-width="9"/>
      <rect x="25" y="70" width="28" height="36" rx="8" fill="#cfc8e6"/><g stroke="#8e86ad" stroke-width="1.6">${[78, 84, 90, 96].map((y) => `<line x1="30" y1="${y}" x2="48" y2="${y}"/>`).join("")}</g>
      <circle class="${P}-led" cx="39" cy="101" r="2.5"/>
      <g class="${P}-air" stroke="#7dd3fc" stroke-width="2.6" stroke-linecap="round" fill="none"><path d="M62 22 q8 -4 16 0 t12 0"/><path d="M62 38 q8 -4 16 0 t12 0"/><path d="M62 54 q8 -4 16 0 t12 0"/></g>
    </svg>`;
  // garage — viewBox 0 0 120 92
  const garageArt = () => `<svg class="${P}-small" viewBox="0 0 120 92" aria-hidden="true">
      <path d="M6 36 L60 8 L114 36" fill="none" stroke="#cfc8e6" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
      <rect x="16" y="34" width="88" height="54" fill="rgba(255,255,255,.08)" stroke="#8e86ad"/>
      <rect x="28" y="46" width="64" height="42" fill="#0c0920"/>
      <g fill="#6f6799"><rect x="38" y="68" width="44" height="12" rx="4"/><path d="M44 68 l5 -8 h22 l5 8z"/><circle cx="47" cy="81" r="4" fill="#2d2552"/><circle cx="73" cy="81" r="4" fill="#2d2552"/></g>
      <g class="${P}-gd" data-k="gd"><rect x="28" y="46" width="64" height="42" fill="#d9d4ec"/><g stroke="#8e86ad" stroke-width="1.4">${[54, 62, 70, 78].map((y) => `<line x1="28" y1="${y}" x2="92" y2="${y}"/>`).join("")}</g></g>
      <g class="${P}-gdarrow" data-k="gdarrow"><path d="M60 26 l-6 6 M60 26 l6 6" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/></g>
    </svg>`;
  // snap mouse trap — viewBox 0 0 64 40
  const trapArt = () => `<svg class="${P}-trapsvg" viewBox="0 0 64 40" aria-hidden="true">
      <rect x="4" y="24" width="56" height="12" rx="3" fill="#c08a5a"/><rect x="4" y="24" width="56" height="3" rx="1.5" fill="#d9a777"/>
      <circle cx="40" cy="25" r="3.5" fill="#fbbf24"/>
      <g class="${P}-bar"><path d="M18 24 v-2 h30 v2" fill="none" stroke="#d6d3e4" stroke-width="2.6" stroke-linejoin="round"/></g>
    </svg>`;

  // ---------- ceiling fan (own drawing) — viewBox 0 0 240 240, seen from below ----------
  const DEFS2 = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <linearGradient id="${P}-blade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9b48c"/><stop offset=".55" stop-color="#b48a63"/><stop offset="1" stop-color="#8a6446"/></linearGradient>
    <radialGradient id="${P}-motor" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#d9d4ec"/><stop offset="1" stop-color="#8e86ad"/></radialGradient>
  </defs></svg>`;
  function fanArt() {
    const blade = (r) => `<g transform="rotate(${r} 120 120)">
        <path d="M110 86 C102 62 98 34 105 14 C109 4 131 4 135 14 C142 34 138 62 130 86 Z" fill="url(#${P}-blade)" stroke="rgba(40,20,10,.35)" stroke-width="1.2"/>
        <path d="M115 78 C111 58 109 36 113 18" stroke="rgba(255,255,255,.28)" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <rect x="113" y="76" width="14" height="24" rx="3" fill="#5b5480"/></g>`;
    return `<svg class="${P}-mach ${P}-fanart" viewBox="0 0 240 240" aria-hidden="true">
      <circle cx="120" cy="120" r="117" fill="rgba(255,255,255,.035)" stroke="rgba(255,255,255,.08)" stroke-width="1.5"/>
      <circle class="${P}-breeze" cx="120" cy="120" r="104" fill="none" stroke="#67e8f9" stroke-width="2.4" stroke-dasharray="3 13" stroke-linecap="round"/>
      <circle class="${P}-breeze ${P}-b2" cx="120" cy="120" r="104" fill="none" stroke="#a5f3fc" stroke-width="2" stroke-dasharray="2 17" stroke-linecap="round"/>
      <g class="${P}-blades">${[0, 72, 144, 216, 288].map(blade).join("")}</g>
      <circle cx="120" cy="120" r="34" fill="url(#${P}-motor)" stroke="rgba(0,0,0,.25)"/>
      <circle cx="120" cy="120" r="21" fill="#efeaff" stroke="#8e86ad" stroke-opacity=".6"/>
      <circle class="${P}-led" cx="120" cy="120" r="5"/>
    </svg>`;
  }

  // ---------- fan types (Settings → Rooms → a fan's "Fan type"; d.fanType from the house model) ----------
  // Each is the same 240 × 240 card art; the turning part reuses the ceiling fan's blades and spin (.rlG-blades,
  // --spin) inside a nested <svg>, whose own viewport keeps the spin centred wherever the rotor sits.
  function rotor(x, y, size, n = 5) {
    const blade = (r) => `<g transform="rotate(${r} 120 120)"><path d="M110 86 C102 62 98 34 105 14 C109 4 131 4 135 14 C142 34 138 62 130 86 Z" fill="url(#${P}-blade)" stroke="rgba(40,20,10,.3)" stroke-width="1.6"/></g>`;
    return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 240 240" overflow="visible">
      <circle class="${P}-breeze" cx="120" cy="120" r="112" fill="none" stroke="#67e8f9" stroke-width="3" stroke-dasharray="3 13" stroke-linecap="round"/>
      <g class="${P}-blades">${Array.from({ length: n }, (_, i) => blade((360 / n) * i)).join("")}</g>
      <circle cx="120" cy="120" r="30" fill="url(#${P}-motor)" stroke="rgba(0,0,0,.25)"/><circle class="${P}-led" cx="120" cy="120" r="6"/></svg>`;
  }
  const cage = (cx, cy, r) => `<g fill="none" stroke="#c4bde6" stroke-opacity=".55" stroke-width="2.2">
      <circle cx="${cx}" cy="${cy}" r="${r}" stroke-width="5" stroke-opacity=".8"/><circle cx="${cx}" cy="${cy}" r="${r * 0.66}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.33}"/>
      ${[0, 30, 60, 90, 120, 150].map((a) => `<path d="M${cx - r * Math.cos(a * Math.PI / 180)} ${cy - r * Math.sin(a * Math.PI / 180)} L${cx + r * Math.cos(a * Math.PI / 180)} ${cy + r * Math.sin(a * Math.PI / 180)}"/>`).join("")}</g>`;
  function fanArtFor(type) {
    const svg = (body) => `<svg class="${P}-mach ${P}-fanart" viewBox="0 0 240 240" aria-hidden="true">${body}</svg>`;
    switch (type) {
      case "box": return svg(`<rect x="34" y="20" width="172" height="186" rx="20" fill="rgba(255,255,255,.05)" stroke="#8e86ad" stroke-width="6"/>
          <rect x="100" y="8" width="40" height="16" rx="7" fill="#5b5480"/>${rotor(48, 42, 144, 3)}
          <g stroke="#c4bde6" stroke-opacity=".45" stroke-width="2">${[56, 80, 104, 128, 152, 176].map((y) => `<path d="M46 ${y}H194"/>`).join("")}</g>
          <rect x="50" y="206" width="30" height="14" rx="5" fill="#5b5480"/><rect x="160" y="206" width="30" height="14" rx="5" fill="#5b5480"/>`);
      case "pedestal": return svg(`<rect x="113" y="160" width="14" height="56" rx="6" fill="#8e86ad"/><ellipse cx="120" cy="222" rx="54" ry="11" fill="#5b5480"/>
          ${rotor(52, 20, 136, 5)}${cage(120, 88, 72)}`);
      case "desk": return svg(`<path d="M104 170 L120 150 L136 170 Z" fill="#8e86ad"/><rect x="62" y="196" width="116" height="22" rx="10" fill="#5b5480"/><rect x="113" y="166" width="14" height="32" fill="#8e86ad"/>
          ${rotor(56, 30, 128, 5)}${cage(120, 94, 66)}`);
      case "tower": return svg(`<rect x="90" y="12" width="60" height="196" rx="28" fill="rgba(255,255,255,.07)" stroke="#8e86ad" stroke-width="6"/>
          <g stroke="#c4bde6" stroke-opacity=".5" stroke-width="3" stroke-linecap="round">${[104, 113, 122, 131].map((x) => `<path d="M${x} 46V176"/>`).join("")}</g>
          <circle class="${P}-led" cx="120" cy="30" r="6"/><ellipse cx="120" cy="220" rx="46" ry="10" fill="#5b5480"/>
          <g class="${P}-tair" fill="none" stroke="#67e8f9" stroke-width="3" stroke-linecap="round">${[70, 110, 150].map((y, i) => `<path style="animation-delay:${-i * 0.45}s" d="M158 ${y} q14 -8 28 0 t28 0"/>`).join("")}</g>`);
      default: return fanArt();
    }
  }

  // ---------- status glyphs (24 × 24 line drawings, after roomtest3.js) ----------
  const g24 = (body, s = 26) => `<svg class="${P}-g" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const GL = {
    motion: '<circle cx="13" cy="4" r="2"/><path d="M8 21l3-6 2 2v4"/><path d="M7 11l3-3 4 1 3 3"/><path d="M11 15l2-6"/>',
    climate: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
    air: '<path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 15h15a3 3 0 1 1-3 3"/>',
    door: `<path d="M3 21h18"/><path d="M6 21V3h12v18"/><path class="${P}-leaf" d="M6 3h10v18H6z" fill="currentColor" fill-opacity=".22"/>`,
    window: `<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M4 12h16"/><path class="${P}-sash" d="M4 3l7 4v14" opacity="0"/>`,
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
    siren: '<path d="M6 17v-5a6 6 0 0 1 12 0v5"/><path d="M4 17h16v3H4z"/><path d="M12 2v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4"/>',
    smoke: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M7 7.5c1.2-1 2.2-1 3.2 0M13.8 7.5c1.2-1 2.2-1 3.2 0"/>',
    leak: '<path d="M12 3s5.5 6 5.5 10a5.5 5.5 0 0 1-11 0C6.5 9 12 3 12 3z"/><path d="M3 21c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0"/>',
    gas: '<path d="M12 3c1 4 5.5 5.2 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.2 1-3.8 2.2-4.8 0 2 1 3.2 2.3 3.3-1-3.2 0-6.3 1-9z"/>',
    freezer: '<path d="M12 2v20M4 7l16 10M20 7L4 17"/><path d="M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5"/>',
    power: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    plug: '<path d="M9 2v6M15 2v6"/><path d="M6 8h12v3a6 6 0 0 1-12 0V8z"/><path d="M12 17v5"/>',
    switch: '<rect x="3" y="7" width="18" height="10" rx="5"/><circle class="' + P + '-knobg" cx="8" cy="12" r="3" fill="currentColor"/>',
    shade: `<path d="M3 4h18"/><rect class="${P}-fabric" x="5" y="4" width="14" height="15" rx="1" fill="currentColor" fill-opacity=".25"/><path d="M12 19v2"/>`,
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    guest: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    bed: '<path d="M3 18V7M3 13h18v5M21 13v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="10.5" r="1.5"/>',
    tune: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1v.5h5V16c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z" fill="currentColor"/>',
    flame: '<path d="M12 3c1 4 5.5 5.2 5.5 10.5a5.5 5.5 0 0 1-11 0c0-2.2 1-3.8 2.2-4.8 0 2 1 3.2 2.3 3.3-1-3.2 0-6.3 1-9z"/>',
    trap: '<rect x="2" y="14" width="20" height="6" rx="1.5"/><path class="' + P + '-gbar" d="M6 14V9h12v5"/><circle cx="15" cy="14" r="1.5" fill="currentColor"/>',
    garage: '<path d="M3 10l9-6 9 6"/><path d="M5 9v11h14V9"/><path d="M8 20v-8h8v8M8 15h8M8 18h8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pwr: '<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  };
  const glyph = (k, s) => g24(GL[k] || GL.check, s);
  // the window coverings' drawings that stop part-way (art-extra.js): "pos" follows the position, "tilt" the slats' tilt
  const wcKind = (icon) => ({ "art:venetian-lift": "pos", "art:venetian-blind": "pos", "art:drapes": "pos", "art:venetian-tilt": "tilt" })[icon] || "";
  // the owner's picture for a device (Manager → Devices → Picture): "line:<icon>" (icons.js), "art:<drawing>" (the
  // animated drawings below — only on the big cards) or "up:<id>" (an upload, /pictures/<id>); else `fallback`.
  // size 0 = fill the card's picture area.
  const ART = { washer: () => laundryArt("washer"), dryer: () => laundryArt("dryer"), dishwasher: () => dishArt(), oven: () => rangeArt(),
    fridge: () => fridgeArt(), microwave: () => microArt(), purifier: () => dysonArt(), garage: () => garageArt(), trap: () => trapArt(),
    "fan-ceiling": () => fanArtFor("ceiling"), "fan-box": () => fanArtFor("box"), "fan-pedestal": () => fanArtFor("pedestal"),
    "fan-desk": () => fanArtFor("desk"), "fan-tower": () => fanArtFor("tower") };
  function pic(choice, size, fallback, big) {
    const m = /^(line|art|up):([A-Za-z0-9_-]{1,40})$/.exec(typeof choice === "string" ? choice : "");
    if (!m) return fallback;
    if (m[1] === "up" && /^[0-9a-f]{16}$/.test(m[2])) {
      return `<img class="${P}-upic" src="/pictures/${m[2]}" alt="" draggable="false" style="${size ? `width:${size}px;height:${size}px` : "width:100%;height:100%"}">`;
    }
    if (m[1] === "art" && big && !Object.prototype.hasOwnProperty.call(ART, m[2]) && Object.prototype.hasOwnProperty.call(XA.items, m[2])) { xaCss(); return XA.items[m[2]].svg(); }
    if (m[1] === "art") return big && Object.prototype.hasOwnProperty.call(ART, m[2]) ? ART[m[2]]() : fallback;
    if (m[1] === "line" && window.icon && (window.ICON_NAMES || []).includes(m[2])) return window.icon(m[2], size || 64);
    return fallback;
  }
  const modeGlyph = (n) => (/guest/i.test(n) ? "guest" : /night/i.test(n) ? "moon" : /morning/i.test(n) ? "sun" : /nap/i.test(n) ? "bed" : "sparkle");

  GL.camera = '<path d="M3 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M16 10.5l5-3v9l-5-3"/>';
  GL.bell = '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>';
  GL.fan = '<circle cx="12" cy="12" r="2"/><path d="M12 10c-1-3 0-7 3-7 2 0 2 3-1 5M14 12c3-1 7 0 7 3 0 2-3 2-5-1M12 14c1 3 0 7-3 7-2 0-2-3 1-5M10 12c-3 1-7 0-7-3 0-2 3-2 5 1"/>';
  GL.cozy = '<path d="M4 20h16"/><path d="M8 20c-2-3-1-6 2-8 0 3 2 4 2 4s1-3-1-7c4 2 6 6 4 11"/>';

  // ---------- model ----------
  const MACH = ["purifier", "washer", "dryer", "oven", "dishwasher", "fridge", "microwave"];
  const normThing = (t) => ({ ...t, kind: str(t.kind), name: str(t.name), room: str(t.room), attrs: t.attrs && typeof t.attrs === "object" ? t.attrs : {} });
  const okObj = (x) => x && typeof x === "object" && x.id != null;
  const TOGGLE_KINDS = ["switch", "outlet", "valve", "garage"]; // plugs of any other (unknown) kind are shown read-only
  // valves and garage openers (the owner's choice in Settings): "Open" / "Closed"; opening asks for the panel PIN (data.js)
  const OPENS = ["valve", "garage"];
  const devGlyph = (k) => ({ switch: "switch", valve: "leak", garage: "garage" })[k] || "plug";
  // what Hubitat places in this room (doors incl. gates / garage overhead, windows, locks, alert sensors, cameras)
  function placedOf(name, room, S) {
    const p = safe(() => Home.placed(name), null);
    const out = p && typeof p === "object"
      ? { doors: list(p.doors), windows: list(p.windows), locks: list(p.locks), sensors: list(p.sensors), cameras: list(p.cameras) }
      // older data.js without Home.placed: only the windows the room lists itself
      : { doors: [], windows: list(room.windows).map((id) => list(S.windows).find((w) => w && w.id === id)).filter(Boolean), locks: [], sensors: [], cameras: [] };
    // fallback: leak sensors Hubitat didn't put in any room, matched by their "where" name
    const roomOf = (id) => safe(() => Home.roomOf(id), null);
    list(S.sensors).forEach((s) => { if (okObj(s) && s.kind === "water" && !roomOf(s.id) && lc(s.where).startsWith(lc(name)) && !out.sensors.includes(s)) out.sensors.push(s); });
    ["doors", "windows", "locks", "sensors", "cameras"].forEach((k) => { out[k] = out[k].filter(okObj); });
    return out;
  }
  function model(roomId) {
    const room = safe(() => Home.room(roomId), null);
    if (!room || typeof room !== "object") return null;
    const name = str(room.name) || str(roomId);
    // (a room of the owner's own, e.g. "All lights", holds devices from many rooms: their full names)
    const raw = list(safe(() => Home.devices(room), [])).filter(okObj)
      .map((d) => ({ ...d, kind: str(d.kind), name: room.custom ? str(d.full) || str(d.name) : str(d.name) })).filter((d) => d.kind !== "speaker");

    let li = 0;
    const devs = raw.map((d) => { const o = demo ? { ...(demoDev(d, d.kind === "light" ? li++ : 0) || {}), ...(demoOv.get(String(d.id)) || {}) } : null; return o ? { ...d, ...o } : d; });
    const things = list(safe(() => Home.things({ room: name }), [])).filter(okObj).map(normThing).filter((t) => t.kind !== "speaker");
    const lights = devs.filter((d) => d.kind === "light"), fans = devs.filter((d) => d.kind === "fan");
    const machines = [...fans.map((d) => ({ type: "fan", key: "f" + d.id, d })),
      ...MACH.flatMap((k) => things.filter((t) => t.kind === k).map((t) => ({ type: k, key: "t" + t.id, t })))];
    const S = safe(() => Home.state, {}) || {};
    const pl = placedOf(name, room, S);
    const garages = things.filter((t) => t.kind === "garage");
    // the garage opener thing and the overhead door's contact are one door: one row ("Overhead door")
    const overhead = garages.length ? pl.doors.find((d) => /overhead/i.test(str(d.name))) || null : null;
    const plugs = devs.filter((d) => !["light", "fan", "shade"].includes(d.kind));
    // fans for the fan scenes: ceiling fans + outlets marked as a fan (Settings.v.fanOutlets = { id: true }, set later)
    const fo = safe(() => Settings.v.fanOutlets, null) || {};
    // (+ a relay / outlet the owner made a "fan" in Settings → Rooms → Devices: d.fan, on / off only)
    const plugFans = plugs.filter((d) => ["switch", "outlet"].includes(d.kind) && (fo[d.id] || d.fan));
    const fanSet = [...fans, ...plugFans];
    // a plug the owner made a fan is a card on the "Fans & air" side (on / off), not a row with the outlets
    machines.splice(fans.length, 0, ...plugFans.map((d) => ({ type: "plugfan", key: "p" + d.id, d })));
    return { room, id: roomId, name, devs, lights, fans, fanSet, machines, things, S, garages, overhead,
      windows: pl.windows, doors: pl.doors.filter((d) => d !== overhead), locks: pl.locks, sensors: pl.sensors, cameras: pl.cameras,
      shades: devs.filter((d) => d.kind === "shade"), plugs: plugs.filter((d) => !plugFans.includes(d)),
      status: things.filter((t) => !MACH.includes(t.kind) && t.kind !== "mode" && t.kind !== "guest"), modes: things.filter((t) => t.kind === "mode"),
      outdoor: /yard|porch|driveway|gazebo|patio|deck|garden/i.test(name) };
  }
  const structKey = (m) => [m.id, m.name, demo, m.devs.map((d) => d.id + d.kind + (d.dim ? 1 : 0) + (d.white ? 1 : 0) + (d.rgb ? 1 : 0) + (d.group ? "g" : "")).join(","),
    m.things.map((t) => t.id + t.kind).join(","), m.windows.map((w) => w.id).join(","), m.doors.map((d) => d.id).join(","), m.overhead ? m.overhead.id : "",
    m.locks.map((l) => l.id).join(","), m.sensors.map((s) => s.id + s.kind).join(","), m.fanSet.map((d) => d.id + (d.fanType || "")).join(","),
    m.cameras.map((c) => `${c.id}:${str(c.name)}:${c.online === false ? 0 : 1}:${c.doorbell ? 1 : 0}`).join(",")].join("|");
  const winOpen = (w, i) => (demo && i === 0 ? true : !!w.open);

  function climateOf(m) {
    const pick = (t) => { const a = A(t); return { t: num(a.temperature), h: num(a.humidity) }; };
    for (const k of ["climate", "motion", "air"]) for (const t of m.things.filter((x) => x.kind === k)) { const c = pick(t); if (c.t != null) return c; }
    if (m.outdoor && m.S.outside) return { t: num(m.S.outside.temp), h: num(m.S.outside.humidity), out: true };
    return null;
  }

  // "since" memory for doors / garage (first time we saw the current state)
  const since = new Map();
  function seen(k, s) { const p = since.get(k); if (!p || p.s !== s) { since.set(k, { s, at: Date.now() }); return Date.now(); } return p.at; }
  const demoMotion = new Map();

  // ---------- "At a glance" (Layout E's style): one plain row per thing — icon · label · value coloured by state ----------
  // items: { key, cat (sort order), g (glyph), l (label), s (small line), v (value), tone ok|warn|bad|live|idle, grp?, ping?,
  // live?, ring?, open?, lockId? }. Rows: everything needing attention first (one row each), then the calm ones, where
  // 2+ calm items of one group (leak sensors, windows, traps, freezers…) share one row.
  // (where a sensor is, without the room's own name in front)
  function sensorWhere(s, room) { let w = str(s.where); if (w.toLowerCase().startsWith(room.toLowerCase())) w = w.slice(room.length).trim(); return w; }
  function sensorLabel(s, room) {
    const w = sensorWhere(s, room);
    if (s.kind === "water") return w ? T("rg2.leakOf", { where: w }) : T("rg.leakSensor");
    const k = { smoke: T("rg.smokeCo"), gas: T("rg.gas"), freezer: T("rg.freezer"), power: T("rg.freezerPower") }[s.kind] || cap(s.kind) || T("rg.sensor");
    if (s.kind === "freezer") return w ? w : k;
    return w ? `${k} · ${w}` : k;
  }
  function doorLabel(d, m) {
    const n = nice(d.name, m.name);
    if (!n || lc(n) === lc(m.name) || lc(n) === "door") return m.garages.length ? T("rg.entryDoor") : T("rg.door");
    return n;
  }
  function lockLabel(l, m) {
    const n = nice(l.name, m.name);
    if (!n || lc(n) === lc(m.name) || lc(n) === "door") return m.garages.length ? T("rg.entryDoorLock") : T("rg.doorLock");
    return /lock/i.test(n) ? n : T("rg2.lockOf", { name: n });
  }
  const GROUPS = {
    leak: [T("rg2.leakSensors"), "leak", (n) => T("rg2.allDry", { n }), (n) => T("rg2.othersDry", { n })],
    smoke: [T("rg.smokeCo"), "smoke", (n) => T("rg2.allClear", { n }), (n) => T("rg2.othersClear", { n })],
    gas: [T("rg2.gasSensors"), "gas", (n) => T("rg2.allClear", { n }), (n) => T("rg2.othersClear", { n })],
    freezer: [T("rg2.freezers"), "freezer", (n) => T("rg2.allCold", { n }), (n) => T("rg2.othersCold", { n })],
    power: [T("rg.freezerPower"), "power", (n) => T("rg2.allOn", { n }), (n) => T("rg2.othersOn", { n })],
    trap: [T("rg2.traps"), "trap", (n) => T("rg2.allSet", { n }), (n) => T("rg2.othersSet", { n })],
    win: [T("rg2.windows"), "window", (n) => T("rg2.allClosed", { n }), (n) => T("rg2.othersClosed", { n })],
  };
  function glanceItems(m) {
    const out = [], now = Date.now(), add = (o) => out.push(o);
    const bat = (a) => { const b = num(a.battery); return b != null && b <= 20 ? b : null; };
    m.garages.forEach((t) => {
      const a = A(t), c = m.overhead;
      let d = lc(a.door || a.contact);
      if ((!d || d === "unknown") && c) d = winOpenDoor(c) ? "open" : "closed";
      d = d || "unknown";
      const at = seen("g" + t.id, d), moving = d === "opening" || d === "closing";
      add({ key: "ga" + t.id, cat: 1, g: "garage", ping: true, l: T("rg.overheadDoor"), open: d === "open", act: `gar:${t.id}`,
        v: { open: T("rg.open"), closed: T("rg.closed"), opening: T("rg.opening"), closing: T("rg.closing") }[d] || cap(d),
        tone: moving ? "live" : d === "open" ? "warn" : d === "closed" ? "ok" : "idle", live: moving,
        s: moving ? T("rg2.movingNow") : d === "open" || d === "closed" ? (now - at > 60000 ? T("rg2.sinceAgo", { time: hhmm(at), ago: ago(at, now) }) : T("rg2.since", { time: hhmm(at) })) : "" });
    });
    m.doors.forEach((d) => {
      const o = winOpenDoor(d), at = seen("d" + d.id, o);
      add({ key: "do" + d.id, cat: 1, g: "door", l: doorLabel(d, m), open: o, tone: o ? "warn" : "ok", v: o ? T("rg.open") : T("rg.closed"), s: o ? T("rg2.since", { time: hhmm(at) }) : "", act: `info:${d.id}` });
    });
    m.locks.forEach((l) => {
      const st = str(l.lock), ok = st === "locked", b = num(l.battery);
      add({ key: "lo" + l.id, cat: 2, g: ok ? "lock" : "unlock", l: lockLabel(l, m), tone: ok ? "ok" : st === "unlocked" ? "warn" : "bad", v: ok ? T("rg.locked") : st === "unlocked" ? T("rg.unlocked") : T("rg.unknown"),
        s: b != null && b <= 20 ? T("rg2.batteryReplace", { n: b }) : "", lockId: ok ? null : l.id, act: `info:${l.id}` });
    });
    m.windows.forEach((w, i) => {
      const open = winOpen(w, i), at = seen("w" + w.id, open), n = nice(w.name, m.name);
      add({ key: "wi" + w.id, cat: 3, grp: "win", g: "window", l: lc(n) === lc(m.name) || !n ? T("rg.window") : /window/i.test(n) ? n : T("rg2.windowOf", { name: n }), short: n || T("rg.window"), open, tone: open ? "warn" : "ok", v: open ? T("rg.open") : T("rg.closed"), s: open ? T("rg2.since", { time: hhmm(at) }) : "", act: `info:${w.id}` });
    });
    for (const t of m.status.filter((x) => x.kind === "motion")) {
      const a = A(t), act = lc(a.motion) === "active";
      let lastAt = lastMotion.get(String(t.id));
      if (demo) { if (act) demoMotion.set(t.id, now); lastAt = demoMotion.get(t.id) || now - 6 * 60000; }
      const b = bat(a);
      add({ key: "mo" + t.id, cat: 4, g: "motion", ping: true, l: /^motion$/i.test(t.name) ? T("rg.motion") : nice(t.name, m.name),
        tone: act ? "live" : b != null ? "warn" : "idle", live: act, v: act ? T("rg.movementNow") : b != null ? T("rg2.battery", { n: b }) : T("rg.allStill"),
        s: act ? "" : lastAt ? T("rg2.lastSeen", { ago: ago(lastAt, now), time: hhmm(lastAt) }) : T("rg2.noneSince", { time: sinceAt(pageStart) }), act: `info:${t.id}` });
    }
    for (const t of m.status.filter((x) => x.kind === "vibration")) {
      const hit = lc(A(t).acceleration) === "active", n = str(t.name).replace(/mouse trap\s*/i, "Trap ").trim() || T("rg.trap");
      add({ key: "tr" + t.id, cat: 6, grp: "trap", g: "trap", ping: true, l: n, tone: hit ? "bad" : "ok", ring: hit, v: hit ? T("rg.wentOff") : T("rg.set"), s: hit ? T("rg2.checkTrap") : "" });
    }
    for (const t of m.status.filter((x) => x.kind === "climate")) {
      const a = A(t), tp = num(a.temperature), hu = num(a.humidity), b = bat(a);
      add({ key: "cl" + t.id, cat: 5, g: "climate", l: /^temp$/i.test(t.name) ? T("rg.temperature") : nice(t.name, m.name), tone: b != null ? "warn" : "idle",
        v: tp != null ? `${Math.round(tp)}°` : hu != null ? `${Math.round(hu)}%` : "—", s: [tp != null && hu != null ? T("rg2.humidity", { n: Math.round(hu) }) : "", b != null ? T("rg2.batteryL", { n: b }) : ""].filter(Boolean).join(" · "), act: `info:${t.id}` });
    }
    for (const t of m.status.filter((x) => x.kind === "air")) {
      const a = A(t), pm = num(a.pm25), voc = num(a.sensirionVOCindex), bad = (pm != null && pm > 35) || (voc != null && voc > 250);
      add({ key: "ai" + t.id, cat: 5, g: "air", l: T("rg.airQuality"), tone: bad ? "warn" : pm != null ? "ok" : "idle", v: pm == null ? "—" : bad ? T("rg.poor") : T("rg.good"),
        s: [pm != null ? `PM2.5 ${Math.round(pm)}` : "", voc != null ? `VOC ${Math.round(voc)}` : ""].filter(Boolean).join(" · ") });
    }
    for (const t of m.status.filter((x) => x.kind === "siren")) {
      const a = A(t), on = !/^(off|none|)$/i.test(str(a.alarm)), b = bat(a);
      add({ key: "si" + t.id, cat: 7, g: "siren", ping: true, l: nice(t.name, m.name), tone: on ? "bad" : b != null ? "warn" : "ok", ring: on, v: on ? T("rg.sounding") : b != null ? T("rg2.battery", { n: b }) : T("rg.ready"), s: on ? cap(a.alarm) : "" });
    }
    m.sensors.forEach((s) => {
      const bad = s.state === "detected", k = s.kind, tmp = num(s.temp);
      // (a freezer above its "Show as a warning above": amber, red 5 °F above — shown only, no sound, no alert)
      const warm = safe(() => Home.sensorWarn(s), null);
      const v = k === "smoke" ? (bad ? T("rg.smokeCo2") : T("rg.clear")) : k === "water" ? (bad ? T("rg.water2") : T("rg.dry")) : k === "gas" ? (bad ? T("rg.gas2") : T("rg.clear"))
        : k === "freezer" ? (bad ? (tmp != null ? T("rg2.tooWarmT", { t: tmp }) : T("rg2.tooWarm")) : tmp != null ? `${tmp}°` : T("rg.cold")) : k === "power" ? (bad ? T("rg.powerLost") : T("rg.on")) : bad ? T("rg.alert") : T("rg.ok");
      add({ key: "se" + s.id, cat: 8, grp: { water: "leak", smoke: "smoke", gas: "gas", freezer: "freezer", power: "power" }[k], ping: true,
        g: { smoke: "smoke", water: "leak", gas: "gas", freezer: "freezer", power: "power" }[k] || "check", l: sensorLabel(s, m.name), short: s.kind === "water" ? sensorWhere(s, m.name) || undefined : undefined,
        tone: bad || warm === "hot" ? "bad" : warm ? "warn" : "ok", ring: bad, v, s: bad ? "alert" : warm ? `above ${Math.round(num(s.max))}°` : "", act: `info:${s.id}` });
    });
    // the room's thermostat (the house's): a row — a tap opens its dial (app.js App.thermoPopup)
    const th = m.S.thermostat;
    if (th && th.id != null && str(th.room) === m.name && window.App && App.thermoPopup) {
      const t = safe(() => Home.thermo(null), null), tg = t && window.nestTarget ? nestTarget(t) : null, hu = t ? num(safe(() => Home.reading(t.id, "humidity"), null)) : null;
      if (t) add({ key: "th" + t.id, cat: 5, g: "climate", l: T("rg.thermostat"), tone: "idle", v: num(t.temp) != null ? `${Math.round(t.temp)}°` : "—", act: `therm:${t.id}`,
        s: [t.tmode === "auto" ? T("rg2.autoRange", { heat: Math.round(t.heat), cool: Math.round(t.cool) }) : tg ? T("rg2.toT", { mode: T(`thermo.mode.${tg}`), t: Math.round(t[tg]) }) : App.tWord(t), hu != null ? T("rg2.humidity", { n: Math.round(hu) }) : ""].filter(Boolean).join(" · ") });
    }
    // a speaker (Sonos): what it plays — a tap plays / pauses
    list(safe(() => Home.things({ room: m.name }), [])).filter((t) => okObj(t) && t.kind === "speaker").forEach((t) => {
      const a = A(t), playing = lc(a.status) === "playing", vol = num(a.volume);
      add({ key: "sp" + t.id, cat: 6, g: "music", ping: playing, l: nice(t.name, m.name) || T("rg.speaker"), tone: playing ? "live" : "idle", live: playing, act: `spk:${t.id}`,
        v: playing ? T("rg.playing") : cap(a.status || "stopped"), s: [str(a.trackDescription).slice(0, 60), vol != null ? T("rg2.volume", { n: Math.round(vol) }) : ""].filter(Boolean).join(" · ") });
    });
    for (const t of m.status.filter((x) => !["motion", "garage", "vibration", "climate", "air", "siren"].includes(x.kind))) {
      const a = A(t);
      add({ key: "ot" + t.id, cat: 9, g: t.kind === "smart-outlet" ? "plug" : t.kind === "leak" ? "leak" : t.kind === "gas" ? "gas" : "check", l: nice(t.name, m.name),
        tone: "idle", v: t.kind === "leak" ? (lc(a.water) === "wet" ? T("rg.water2") : T("rg.dry")) : t.kind === "gas" ? (lc(a.naturalGas) === "detected" ? T("rg.gas2") : T("rg.noGas")) : cap(a.switch || a.status || "—"), s: "preview" });
    }
    return out;
  }
  // a door's open state (demo: the first door of a room shows open, like the first window)
  const winOpenDoor = (d) => !!(d && d.open);
  const RANK = { bad: 0, warn: 1, live: 2 };
  function glanceRows(items) {
    const att = items.filter((it) => it.tone in RANK).sort((a, b) => RANK[a.tone] - RANK[b.tone] || a.cat - b.cat);
    const calm = items.filter((it) => !(it.tone in RANK));
    const rows = [...att], byG = new Map();
    calm.forEach((it) => { if (it.grp && GROUPS[it.grp]) { const g = byG.get(it.grp) || []; g.push(it); byG.set(it.grp, g); } });
    const done = new Set();
    calm.sort((a, b) => a.cat - b.cat).forEach((it) => {
      const g = it.grp && byG.get(it.grp);
      if (!g || g.length < 2) { rows.push(it); return; }
      if (done.has(it.grp)) return; done.add(it.grp);
      const [label, gl, all, others] = GROUPS[it.grp], hadAtt = att.some((x) => x.grp === it.grp);
      rows.push({ key: "grp:" + it.grp, cat: it.cat, g: gl, l: label, tone: "ok", v: hadAtt ? others(g.length) : all(g.length), s: g.length <= 4 ? g.map((x) => x.short || x.l).join(" · ") : "" });
    });
    return rows;
  }
  // ---------- CSS (machine rules from roomtest2.js — opacity transitions removed per the GPU rule — then Layout G) ----------
  const CSS = `
  .${P}-mc{border-radius:20px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.05);min-height:0;min-width:0;cursor:pointer}
  .${P}-mc.${P}-run{background:color-mix(in srgb,var(--mc) 13%,rgba(255,255,255,.04));border-color:color-mix(in srgb,var(--mc) 35%,transparent)}
  .${P}-mc.${P}-done{background:rgba(52,211,153,.12);border-color:rgba(52,211,153,.4)}
  .${P}-mc.${P}-warn{background:rgba(251,113,133,.13);border-color:rgba(251,113,133,.5)}
  .${P}-mach{width:100%;height:100%;display:block;overflow:visible}
  .${P}-idle .${P}-mach{opacity:.86}
  .${P}-mn{font-size:21px;font-weight:600;display:flex;align-items:center;gap:10px}
  .${P}-badge{font-size:12px;letter-spacing:1px;text-transform:uppercase;font-weight:700;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.1);color:var(--muted);white-space:nowrap}
  .${P}-run .${P}-badge{background:var(--mc);color:#140d2a}
  .${P}-pause .${P}-badge{background:var(--warn);color:#241a00}
  .${P}-done .${P}-badge{background:var(--ok);color:#052e1f}
  .${P}-warn .${P}-badge{background:var(--bad);color:#3b0712}
  .${P}-big{font-size:42px;font-weight:300;line-height:1.05;white-space:nowrap}
  .${P}-big small{font-size:18px;color:var(--muted)}
  .${P}-idle .${P}-big{color:var(--muted)}
  .${P}-done .${P}-big{color:var(--ok);font-weight:500}
  .${P}-sub{font-size:16px;color:var(--muted);line-height:1.3;white-space:pre-line}
  .${P}-disp{font:700 13px ui-monospace,Consolas,monospace;fill:#7dd3fc;letter-spacing:1px}
  .${P}-idle .${P}-disp{fill:#5b5480}
  .${P}-dsm{font-size:11px}.${P}-dfz{fill:#c4b5fd}
  .${P}-led{fill:#3b335f}
  .${P}-run .${P}-led{fill:var(--mc)} .${P}-done .${P}-led{fill:#34d399} .${P}-pause .${P}-led{fill:#fbbf24}
  /* laundry */
  .${P}-eta{font-size:16px;color:var(--text);opacity:.85}
  .${P}-eta:empty{display:none}
  .${P}-ring{fill:none;stroke:var(--mc);stroke-width:8;stroke-linecap:round;stroke-dasharray:100 100;stroke-dashoffset:100;transition:stroke-dashoffset 1.2s ease;opacity:0}
  .${P}-run .${P}-ring,.${P}-pause .${P}-ring,.${P}-done .${P}-ring{opacity:1}
  .${P}-pause .${P}-ring{stroke:var(--warn)} .${P}-done .${P}-ring{stroke:var(--ok)}
  .${P}-drum,.${P}-clothes{transform-box:view-box;transform-origin:110px 154px}
  .${P}-water{opacity:0}
  .${P}-run .${P}-water,.${P}-pause .${P}-water{opacity:.32}
  .${P}-heat{opacity:0}
  .${P}-run .${P}-heat{opacity:1}
  .${P}-run .${P}-drum{animation:${P}-spin 1.8s linear infinite}
  .${P}-run .${P}-clothes{animation:${P}-tumble 2.4s ease-in-out infinite}
  .${P}-run.${P}-spin .${P}-drum,.${P}-run.${P}-spin .${P}-clothes{animation:${P}-spin .5s linear infinite}
  /* "Done" badge: shown statically (no pop, no confetti — finite animations drop their layers when they end) */
  .${P}-donebadge{opacity:0;transform:scale(0)}
  .${P}-done .${P}-donebadge{opacity:1;transform:none}
  /* GPU rule: animated / transitioning SVG parts own a permanent layer (not only while they move) */
  .${P}-drum,.${P}-clothes,.${P}-arm,.${P}-bowl,.${P}-gdarrow,.${P}-leafL,.${P}-leafR,.${P}-drawer,.${P}-gd,.${P}-bar{will-change:transform}
  .${P}-drops,.${P}-flame,.${P}-air{will-change:transform,opacity}
  .${P}-tl{flex:none;padding:12px 14px 10px;border-radius:16px;background:rgba(255,255,255,.04)}
  .${P}-tlbar{position:relative;height:8px;border-radius:4px;background:rgba(255,255,255,.1);margin:10px 4px 12px}
  .${P}-now{position:absolute;left:0;top:-5px;width:4px;height:18px;border-radius:2px;background:#fff}
  .${P}-tm{position:absolute;top:-6px;width:20px;height:20px;margin-left:-10px;border-radius:50%;background:var(--mc);border:3px solid #1c1737;display:none}
  .${P}-tm.on{display:block}
  .${P}-tlt{font-size:16px;color:var(--muted);display:flex;gap:18px;flex-wrap:wrap}
  .${P}-tlt b{color:var(--text);font-weight:600}
  .${P}-tlt i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;background:var(--mc)}
  /* kitchen */
  .${P}-tbar{width:100%;height:8px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden}
  .${P}-tbar i{display:block;height:100%;width:100%;border-radius:4px;background:linear-gradient(90deg,#fbbf24,#fb923c,#ef4444);transform-origin:left;transform:scaleX(var(--f,0))} /* no transition: a transitioning child would get a short-lived layer */
  .${P}-burner .${P}-flame{opacity:0}
  .${P}-burner.lit .${P}-flame{opacity:1;animation:${P}-flick .55s ease-in-out infinite alternate}
  .${P}-burner.lit + .${P}-burner.lit .${P}-flame{animation-delay:-.3s}
  .${P}-ovglow,.${P}-element{opacity:0}
  .${P}-ovon .${P}-ovglow{opacity:1} .${P}-ovon .${P}-element{opacity:.9}
  .${P}-mist,.${P}-jets,.${P}-drops{opacity:0}
  .${P}-run .${P}-mist{opacity:1} .${P}-run .${P}-jets{opacity:1}
  .${P}-arm{transform-box:fill-box;transform-origin:center}
  .${P}-run .${P}-arm{animation:${P}-arm .9s ease-in-out infinite alternate}
  .${P}-run .${P}-drops{opacity:1;animation:${P}-drip 1.3s linear infinite}
  .${P}-temps{display:flex;gap:18px}
  .${P}-temps div{display:flex;flex-direction:column}
  .${P}-temps span{font-size:40px;font-weight:300;line-height:1.05}
  .${P}-temps small{font-size:14px;color:var(--muted)}
  .${P}-temps .bad{color:var(--bad)}
  .${P}-leafL{transform-box:fill-box;transform-origin:left;transition:transform .6s ease}
  .${P}-leafR{transform-box:fill-box;transform-origin:right;transition:transform .6s ease}
  .${P}-drawer{transition:transform .6s ease}
  .${P}-inside{opacity:0}.${P}-fopen .${P}-inside{opacity:1}
  .${P}-fopen .${P}-leafL{transform:scaleX(.42) skewY(6deg)}
  .${P}-ffopen .${P}-drawer{transform:translateY(8px)}
  .${P}-mwlight{opacity:0}
  .${P}-run .${P}-mwlight{opacity:.35}
  .${P}-run .${P}-bowl{animation:${P}-turn 3.2s ease-in-out infinite alternate}
  .${P}-small{display:block;overflow:hidden}
  .${P}-dyson .${P}-sart svg{width:78px;height:96px}
  .${P}-air{opacity:0}
  .${P}-on .${P}-air{opacity:1;animation:${P}-airf var(--air,1.6s) linear infinite}
  .${P}-on .${P}-led{fill:#7dd3fc}
  .${P}-aq{display:flex;align-items:baseline;gap:8px;margin-top:2px}
  .${P}-aqv{font-size:30px;font-weight:300}
  .${P}-aqt{font-size:14px;font-weight:700;padding:3px 10px;border-radius:999px;background:color-mix(in srgb,var(--aq,#34d399) 22%,transparent);color:var(--aq,#34d399)}
  .${P}-airline{font-size:14px;color:var(--faint)}
  .${P}-twin{display:grid;grid-template-columns:1fr 1.25fr;gap:12px}
  .${P}-twin .${P}-card{gap:4px}
  .${P}-twin .${P}-mn{font-size:18px}
  .${P}-gart svg{width:110px;height:84px}
  .${P}-gd{transform-box:fill-box;transform-origin:top;transform:scaleY(var(--gd,1));transition:transform 10s linear}
  .${P}-gdarrow{opacity:0;transform-box:fill-box;transform-origin:center}
  .${P}-moving .${P}-gdarrow{opacity:1;animation:${P}-nudge .7s ease-in-out infinite alternate}
  .${P}-closing .${P}-gdarrow{transform:rotate(180deg);animation-name:${P}-nudgedn}
  .${P}-gopen .${P}-sub{color:var(--warn)}
  .${P}-traprow{display:flex;gap:6px;flex:1;align-items:center}
  .${P}-trap{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:13px;color:var(--muted);padding:6px 2px;border-radius:12px}
  .${P}-trapsvg{width:58px;height:36px;will-change:transform} /* it shakes while a trap is tripped: permanent layer */
  .${P}-bar{transform-box:view-box;transform-origin:18px 23px;transform:rotate(-150deg);transition:transform .25s cubic-bezier(.5,1.8,.6,1)}
  .${P}-trap.hit{background:rgba(251,113,133,.18);color:#fecdd3}
  .${P}-trap.hit .${P}-bar{transform:none}
  .${P}-trap.hit .${P}-trapsvg{animation:${P}-snap 1.8s ease-in-out infinite;transform-origin:50% 90%}
  @keyframes ${P}-spin{to{transform:rotate(1turn)}}
  @keyframes ${P}-tumble{0%{transform:rotate(-8deg)}50%{transform:rotate(118deg)}66%{transform:rotate(-16deg)}78%{transform:rotate(6deg)}100%{transform:rotate(-8deg)}}
  @keyframes ${P}-flick{from{transform:scale(1,1);opacity:.85}to{transform:scale(1.07,.82);opacity:1}}
  @keyframes ${P}-arm{from{transform:scaleX(1)}to{transform:scaleX(-.85)}}
  @keyframes ${P}-drip{from{transform:translateY(-36px)}to{transform:translateY(48px)}}
  @keyframes ${P}-turn{from{transform:translateX(-16px) scaleX(.9)}to{transform:translateX(16px) scaleX(.9)}}
  @keyframes ${P}-eqa{to{transform:scaleY(1)}}
  @keyframes ${P}-airf{from{transform:translateX(-10px);opacity:0}35%{opacity:1}to{transform:translateX(14px);opacity:0}}
  @keyframes ${P}-nudge{from{transform:translateY(2px)}to{transform:translateY(-4px)}}
  @keyframes ${P}-nudgedn{from{transform:rotate(180deg) translateY(2px)}to{transform:rotate(180deg) translateY(-4px)}}
  @keyframes ${P}-snap{0%,55%,100%{transform:rotate(0)}62%{transform:rotate(-9deg)}72%{transform:rotate(8deg)}82%{transform:rotate(-4deg)}90%{transform:rotate(2deg)}}
  @keyframes ${P}-ring{from{transform:scale(1);opacity:.9}to{transform:scale(2.6);opacity:0}}


  /* ===== Layout G ===== */
  .rlG{height:100%;display:flex;flex-direction:column;gap:14px;position:relative}
  .rlG-g{display:block;flex:none;overflow:visible}
  /* header (as Layout D) + the room's cameras */
  .rlG-head{flex:none;display:flex;align-items:center;gap:16px;height:66px;min-width:0}
  .rlG-ricon{width:58px;height:58px;border-radius:18px;flex:none;display:grid;place-items:center;background:var(--accent-grad);color:#fff;box-shadow:var(--on-glow)}
  .rlG-head h1{margin:0;font-size:40px;font-weight:300;letter-spacing:-.4px;line-height:1;white-space:nowrap;text-shadow:0 2px 14px rgba(0,0,0,.4)}
  .rlG-head h1{min-width:0;max-width:42%;overflow:hidden;text-overflow:ellipsis;padding-bottom:4px} /* (a long room name gives way before the chips do) */
  .rlG-chips{display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;flex:1;margin-left:6px}
  .rlG-chip{flex:none;display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 15px;border-radius:999px;background:rgba(255,255,255,.08);font-size:17px;color:var(--text);white-space:nowrap}
  .rlG-chip .ic,.rlG-chip .rlG-g{color:var(--muted)}
  .rlG-chip.on{background:color-mix(in srgb,#fcd34d 18%,rgba(255,255,255,.06))} .rlG-chip.on .ic{color:#fcd34d}
  .rlG-chip.warn{background:rgba(251,191,36,.16);color:#fde68a} .rlG-chip.warn .rlG-g{color:var(--warn)}
  .rlG-chip.demo{background:linear-gradient(135deg,#fcd34d,#f97316);color:#2a1600;font-weight:700;font-size:14px;letter-spacing:1px}
  .rlG-chip[hidden]{display:none}
  .rlG-cams{flex:none;display:flex;align-items:center;gap:8px;min-width:0}
  .rlG-cam{display:inline-flex;align-items:center;gap:9px;height:56px;padding:0 18px 0 14px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid var(--glass-line);font-size:16px;font-weight:600;white-space:nowrap;max-width:240px;color:var(--text)}
  .rlG-cam > span{overflow:hidden;text-overflow:ellipsis}
  .rlG-cam .rlG-g{color:var(--accent-2)}
  .rlG-cam.bell .rlG-g{color:#fcd34d}
  .rlG-cam small{font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--faint)}
  .rlG-cam.off{opacity:.42;pointer-events:none;border-style:dashed}
  .rlG-cam.off .rlG-g{color:var(--faint)}
  .rlG-hr{flex:none;display:flex;align-items:center;gap:10px}
  .rlG-btn{display:inline-flex;align-items:center;gap:10px;height:60px;padding:0 24px;border-radius:999px;font-size:18px;font-weight:600;background:rgba(255,255,255,.09);border:1px solid var(--glass-line);white-space:nowrap}
  .rlG-btn.pri{background:var(--accent-grad);border-color:transparent;color:#fff;box-shadow:var(--on-glow)}
  .rlG-clock{font-size:40px;font-weight:200;margin-left:10px;text-shadow:0 2px 14px rgba(0,0,0,.4);white-space:nowrap}
  .rlG-clock small{font-size:17px;color:var(--muted);margin-left:3px}
  /* body */
  .rlG-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,60fr) minmax(0,40fr);gap:20px}
  .rlG-stage{position:relative;min-height:0;min-width:0;display:flex;flex-direction:column;gap:8px;padding:16px 20px 18px;overflow:hidden}
  /* (too low for its fans row and lights: smaller cards and buttons, the hint goes — and the rest scrolls: fitStage) */
  .rlG-stage.tight{overflow-y:auto;scrollbar-width:none}
  .rlG-stage.tight .rlG-mc{height:196px}
  .rlG-stage.tight .rlG-fan .rlG-seg button,.rlG-stage.tight .rlG-pseg button{height:42px}
  .rlG-stage.tight .rlG-lh,.rlG-stage.tight .rlG-mh{min-height:46px}
  .rlG-stage.tight .rlG-presets button{height:46px}
  .rlG-stage.tight .rlG-orbs .rlG-track{padding-top:20px}
  .rlG-stage.tight .rlG-lab{min-height:46px}
  .rlG-stage.tight .rlG-hint{display:none}
  /* portrait (800 × 1280): the stage on top, the room's status under it; the chips get a line of their own */
  @media (max-aspect-ratio:1/1){
    .rlG-body{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1.5fr) minmax(0,1fr)}
    .rlG-head{flex-wrap:wrap;height:auto;row-gap:10px}
    .rlG-chips{order:3;flex:1 1 100%;margin-left:0} .rlG-cams{order:4} .rlG-hr{margin-left:auto}
    .rlG-head h1{flex:1 1 0;max-width:none} /* (a long name ellipsises: every room keeps the same two lines) */
  }
  /* a phone (390 × 844): a smaller header — the name on a line of its own, All on / All off under it, no clock */
  @media (max-width:600px){
    .rlG-head{gap:10px}
    .rlG-ricon{width:44px;height:44px;border-radius:14px}
    .rlG-head h1{font-size:30px;flex:1 1 calc(100% - 60px)}
    .rlG-hr{margin-left:0} .rlG-clock{display:none}
    .rlG-btn{height:48px;padding:0 18px;font-size:16px}
    .rlG-chip{height:36px;padding:0 12px;font-size:15px}
  }
  .rlG-amb{position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:radial-gradient(ellipse 70% 55% at 50% 60%,rgba(var(--amb,252,211,77),.2),rgba(var(--amb,252,211,77),0) 70%);opacity:0}
  .rlG-stage.lit .rlG-amb{opacity:var(--ambo,1)}
  /* spacing: the orbs keep their place when the dock opens — it takes the free space at the bottom (the spacers above
     only shrink when that is used up) */
  .rlG-sp{flex:1 1 0;min-height:0}
  .rlG-sp.a{flex:0 1 16px} .rlG-sp.b{flex:0 1 22px} .rlG-sp.top{flex:0 1 150px}
  .rlG-sh{display:flex;align-items:center;gap:12px;flex:none;min-height:28px;position:relative}
  .rlG-sh .label{white-space:nowrap}
  .rlG-shs{font-size:15px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rlG-sh > .rlG-shs:last-child{margin-left:auto}
  .rlG-note{font-size:13px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .rlG-lh,.rlG-mh{min-height:56px}
  .rlG-mh.bare{min-height:34px}
  .rlG-lh .rlG-shs{margin-left:0}
  /* scenes (lights: Bright / Relax / Night light / Cozy; fans: Off / Breeze / Sleep / Max) — tap = recall, hold = save */
  .rlG-presets{margin-left:auto;flex:0 1 auto;min-width:0;display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;touch-action:pan-x;overscroll-behavior-x:contain}
  .rlG-presets::-webkit-scrollbar{display:none}
  .rlG-sh > .rlG-shs:has(~ .rlG-presets){flex-shrink:100} /* (the header's summary gives way first) */
  /* chips wider than the header scroll sideways; a fade at the cut edge says there are more (.ovf / .atend: presetEdges) */
  .rlG-presets.ovf:not(.atend){-webkit-mask-image:linear-gradient(270deg,transparent,#000 44px);mask-image:linear-gradient(270deg,transparent,#000 44px)}
  .rlG-presets button{position:relative;display:inline-flex;align-items:center;gap:8px;height:56px;padding:0 18px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid var(--glass-line);font-size:16px;font-weight:600;color:var(--muted);white-space:nowrap;touch-action:manipulation}
  .rlG-presets button .rlG-g{color:var(--accent-2)}
  .rlG-presets button.hold{background:color-mix(in srgb,var(--accent) 30%,rgba(255,255,255,.06));color:#fff}
  .rlG-presets button i{position:absolute;top:7px;right:9px;width:8px;height:8px;border-radius:50%;background:var(--accent-2);box-shadow:0 0 0 2px rgba(20,13,42,.9);display:none}
  .rlG-presets button.saved i{display:block}
  .rlG-mh .rlG-presets button{padding:0 16px}
  /* side-scrolling rows: touch pan-x, no scrollbar, a static fade at the edges (an overlay, not mask-image) */
  .rlG-rw{position:relative;flex:none;min-width:0;margin:0 -20px}
  .rlG-scr{overflow-x:auto;overflow-y:hidden;scrollbar-width:none;touch-action:pan-x;overscroll-behavior-x:contain}
  .rlG-scr::-webkit-scrollbar{display:none}
  .rlG-track{display:flex;width:max-content;margin:0 auto;padding:0 20px}
  .rlG-fade{position:absolute;top:0;bottom:0;width:96px;pointer-events:none;opacity:0;will-change:opacity;z-index:2}
  .rlG-fade.l{left:0;background:linear-gradient(90deg,var(--glass-strong) 18%,rgba(0,0,0,0))}
  .rlG-fade.r{right:0;background:linear-gradient(270deg,var(--glass-strong) 18%,rgba(0,0,0,0))}
  .rlG-rw.ovf:not(.atstart) .rlG-fade.l,.rlG-rw.ovf:not(.atend) .rlG-fade.r{opacity:1}
  /* machine cards: ONE fixed size (≈ 70 % of Layout D's kitchen card, 254 × 354) */
  .rlG-mrow .rlG-track{gap:14px;padding-top:2px;padding-bottom:2px}
  .rlG-mc{flex:none;width:180px;height:250px;display:flex;flex-direction:column;gap:4px;padding:10px 12px 12px;overflow:hidden}
  .rlG-art{position:relative;flex:1;min-height:0;min-width:0}
  .rlG-upic{display:block;object-fit:contain;pointer-events:none}
  .rlG-arranging [data-light], .rlG-arranging .rlG-dev[data-dev]{animation:rlG-wig .28s ease-in-out infinite alternate;touch-action:none}
  .rlG-arranging [data-light]:nth-child(2n), .rlG-arranging .rlG-dev[data-dev]:nth-child(2n){animation-delay:-.14s}
  .rlG-arranging .lifted{animation:none;transform:scale(1.08);z-index:3;filter:drop-shadow(0 8px 18px rgba(0,0,0,.5))}
  @keyframes rlG-wig{from{transform:rotate(-1.6deg)}to{transform:rotate(1.6deg)}}
  .rlG-arrdone{position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:50;padding:14px 36px;border-radius:999px;
    font:600 20px/1 inherit;color:#fff;background:linear-gradient(135deg,#a78bfa,#7c3aed);box-shadow:0 10px 30px rgba(0,0,0,.45)}
  .rlG-art > .rlG-upic{position:absolute;inset:0}
  .rlG-art > svg{position:absolute;inset:0;width:100%;height:100%;display:block}
  .rlG-solo > .rlG-art{align-self:stretch} /* (the trap's drawing on its own: .rlG-trap is also a room row's centred column — it was 0 px wide) */
  .rlG-mi{flex:none;display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:0;width:100%}
  .rlG-mc .rlG-mn{font-size:17px;font-weight:600;display:flex;align-items:center;gap:4px 8px;flex-wrap:wrap;line-height:1.2}
  .rlG-mc .rlG-badge{font-size:10px;letter-spacing:.8px;padding:3px 7px}
  .rlG-mc .rlG-big{font-size:28px}
  .rlG-mc .rlG-big small{font-size:14px}
  .rlG-mc .rlG-sub{font-size:13px;line-height:1.25;max-height:2.5em;overflow:hidden;width:100%}
  .rlG-mc .rlG-eta{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%}
  .rlG-mc .rlG-pbar{width:100%;height:6px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:2px;flex:none}
  .rlG-pbar i{display:block;height:100%;border-radius:3px;background:var(--mc);transform-origin:left;transform:scaleX(var(--p,0))}
  .rlG-idle .rlG-pbar{opacity:.35}
  .rlG-mc .rlG-temps{gap:12px} .rlG-mc .rlG-temps span{font-size:26px} .rlG-mc .rlG-temps small{font-size:12px}
  .rlG-mc .rlG-aqv{font-size:24px} .rlG-mc .rlG-aqt{font-size:12px}
  .rlG-mc .rlG-tbar{margin-top:2px}
  .rlG-fanart{overflow:visible}
  .rlG-blades{transform-box:view-box;transform-origin:120px 120px;will-change:transform}
  .rlG-run .rlG-blades{animation:rlG-spin var(--spin,1s) linear infinite}
  .rlG-breeze{opacity:0;transform-box:view-box;transform-origin:120px 120px;will-change:transform,opacity}
  .rlG-run .rlG-breeze{animation:rlG-breeze 2.6s ease-out infinite}
  .rlG-run .rlG-breeze.rlG-b2{animation-delay:-1.3s}
  .rlG-tair path{opacity:0;will-change:transform,opacity}
  .rlG-run .rlG-tair path{animation:rlG-airf 1.4s ease-in-out infinite}
  .rlG-fan.rlG-run .rlG-led,.rlG-plugfan.rlG-run .rlG-led{fill:#67e8f9}
  .rlG-plugfan .rlG-big,.rlG-plugfan .rlG-sub{display:none}
  .rlG-pseg{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:3px;width:100%;margin-top:6px}
  .rlG-pseg button{min-width:0;height:44px;padding:0;font-size:16px;border-radius:12px}
  .rlG-seg{display:flex;gap:6px;padding:5px;border-radius:999px;background:rgba(255,255,255,.07);max-width:100%}
  .rlG-seg button{min-width:72px;height:56px;padding:0 14px;border-radius:999px;font-size:17px;font-weight:600;color:var(--muted);white-space:nowrap}
  .rlG-seg button.cur{background:var(--accent-grad);color:#fff;box-shadow:var(--on-glow)}
  .rlG-fan .rlG-seg{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:4px;border-radius:18px;width:100%;margin-top:2px}
  .rlG-fan .rlG-seg button{min-width:0;height:56px;padding:0;font-size:15px;border-radius:14px}
  .rlG-fan .rlG-big,.rlG-fan .rlG-sub{display:none}
  .rlG-purifier .rlG-small{overflow:visible}
  .rlG-purifier .rlG-air{opacity:0}
  .rlG-purifier.rlG-on .rlG-air{opacity:1}
  /* ---- light orbs: ONE fixed size (Layout D's Living Room rail orb: 84 px, 170 px slot) ---- */
  /* GPU rule: every orb owns a permanent layer (will-change: transform); its glow has a permanent opacity layer and
     changes instantly (no opacity transitions on glows / lit fills / ring arcs) */
  .rlG-mc,.rlG-orb,.rlG-gr,.rlG-dev,.rlG-ev,.rlG-mode{will-change:transform}
  .rlG-orbs .rlG-track{gap:4px;padding-top:28px;padding-bottom:2px}
  .rlG-orb{--sz:84px;flex:none;width:170px;display:flex;flex-direction:column;align-items:center;gap:4px;position:relative;min-width:0}
  .rlG-ow{position:relative;width:var(--sz);height:var(--sz);cursor:pointer;flex:none;touch-action:pan-x}
  .rlG-rw:not(.ovf) .rlG-ow{touch-action:none}
  .rlG-glow{position:absolute;inset:-24%;border-radius:50%;pointer-events:none;background:radial-gradient(closest-side,rgba(var(--rgb),.62),rgba(var(--rgb),.2) 55%,rgba(var(--rgb),0));opacity:0;will-change:opacity}
  .rlG-orb.on .rlG-glow{opacity:calc(.22 + .78 * var(--lv))}
  .rlG-oring{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
  .rlG-rt,.rlG-rv{fill:none;stroke-width:6;stroke-linecap:round}
  .rlG-rt{stroke:rgba(255,255,255,.12);stroke-dasharray:75 100}
  .rlG-rv{stroke:rgb(var(--rgb));opacity:0}
  .rlG-orb.on .rlG-rv{opacity:1}
  .rlG-orb:not(.dim) .rlG-oring{display:none}
  .rlG-bulb{position:absolute;inset:13%;border-radius:50%;display:grid;place-items:center;overflow:hidden;border:1px solid rgba(255,255,255,.13);
    background:radial-gradient(circle at 35% 28%,rgba(255,255,255,.17),rgba(255,255,255,.03) 62%),var(--glass-opaque,#1d1542);color:var(--faint)} /* (off: the theme's own card colour) */
  .rlG-orb:not(.dim) .rlG-bulb{inset:6%}
  .rlG-lit{position:absolute;inset:0;border-radius:50%;opacity:0;background:radial-gradient(circle at 36% 30%,#fff 0%,rgba(var(--rgb),1) 40%,rgba(var(--rgbd),1) 100%)}
  .rlG-orb.on .rlG-lit{opacity:calc(.5 + .5 * var(--lv))}
  .rlG-bc{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;line-height:1}
  .rlG-orb.on .rlG-bc{color:var(--ink,#1a1033)}
  .rlG-pct{font-size:20px;font-weight:500}
  .rlG-orb:not(.on) .rlG-pct,.rlG-orb:not(.dim) .rlG-pct{display:none}
  .rlG-bc .rlG-g{width:24px;height:24px}
  .rlG-orb.on.dim .rlG-bc > :first-child{display:none}
  .rlG-grp{position:absolute;left:50%;top:-8px;transform:translateX(-50%);font-size:10px;font-weight:700;letter-spacing:1.1px;padding:2px 7px;border-radius:999px;background:rgba(20,13,42,.88);color:var(--muted);border:1px solid var(--glass-line)}
  /* live % while a finger dims the orb (inside the orb's own layer; shown instantly) */
  .rlG-bub{position:absolute;left:50%;top:-28px;transform:translateX(-50%);padding:1px 11px;border-radius:999px;background:rgba(20,13,42,.94);border:1px solid rgba(255,255,255,.22);font-size:18px;line-height:22px;font-weight:700;color:#fff;opacity:0;pointer-events:none;white-space:nowrap}
  .rlG-orb.drag .rlG-bub{opacity:1}
  .rlG-orb.drag .rlG-grp{opacity:0}
  .rlG-lab{position:relative;display:flex;flex-direction:column;align-items:center;min-height:56px;justify-content:center;max-width:100%;padding:3px 12px;border-radius:16px;text-align:center;border:1px solid transparent}
  .rlG-lab b{font-size:17px;font-weight:600;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rlG-lab small{font-size:14px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  .rlG-lab b::after{content:"";display:inline-block;width:6px;height:6px;margin:0 0 3px 6px;border-right:2px solid var(--faint);border-bottom:2px solid var(--faint);transform:rotate(45deg)}
  .rlG-orb.on .rlG-lab small{color:var(--text);opacity:.85}
  .rlG-orb.unk .rlG-lab small,.rlG-orb.unk .rlG-bc{color:var(--bad)} /* state unknown to the hub */
  .rlG-dev.unk small,.rlG-dev.unk .rlG-di,.rlG-mc.unk [data-k="badge"]{color:var(--bad)}
  .rlG-orb.sel .rlG-lab{background:color-mix(in srgb,var(--accent) 34%,rgba(255,255,255,.04));border-color:color-mix(in srgb,var(--accent-2) 60%,transparent)}
  .rlG-orb.sel .rlG-lab b::after{transform:rotate(225deg);margin-bottom:-1px;border-color:#fff}
  .rlG-hint{flex:none;text-align:center;font-size:15px;color:var(--faint);line-height:20px}
  .rlG-hint:empty{display:none}
  /* ---- the control dock (hidden until a light's NAME is tapped) ---- */
  .rlG-dock{flex:none;position:relative;display:grid;grid-template-columns:270px minmax(0,.85fr) minmax(0,1.4fr);gap:22px;padding:16px 84px 16px 20px;border-radius:24px;
    background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.04));border:1px solid var(--glass-line)}
  .rlG-dock[hidden]{display:none}
  .rlG-dock.slim{grid-template-columns:330px minmax(0,1fr) minmax(0,1.15fr);gap:20px;padding:10px 80px 10px 18px;align-items:end}
  .rlG-dock.plain{grid-template-columns:330px minmax(0,1fr)}
  /* no room under the orbs (a room with fans and lights): the dock lies over the stage's bottom instead of below it,
     out of sight (fitDock) */
  .rlG-dock.ovl{position:absolute;left:12px;right:12px;bottom:12px;z-index:4;background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.04)),var(--glass-opaque,var(--glass-strong));box-shadow:0 -10px 30px rgba(5,2,20,.45)}
  /* a narrower stage (the 1280 × 800 tablet, portrait): the light's name across the top, the sliders side by side under
     it (three columns squeezed the quick buttons and the white presets on top of each other) */
  .rlG-stage{container:rlgstage / inline-size}
  @container rlgstage (max-width:980px){
    .rlG-dock:not(.plain),.rlG-dock.slim{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px 18px;padding:12px 16px 14px;align-items:start}
    .rlG-dock:not(.plain) .rlG-did{grid-column:1 / -1;flex-direction:row;align-items:center;gap:16px;padding-right:62px}
    .rlG-dock .rlG-dx{top:10px;margin-top:0;width:52px;height:52px}
    .rlG-dock .rlG-cl span,.rlG-dock .rlG-dk{display:none}
    .rlG-dock .rlG-cl b{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}
    .rlG-dock .rlG-pwrow{margin-left:auto}
    .rlG-dock .rlG-pw,.rlG-dock.slim .rlG-pw{width:104px;height:54px} .rlG-dock .rlG-pw::after,.rlG-dock.slim .rlG-pw::after{width:42px;height:42px}
    .rlG-dock .rlG-pw.on::after,.rlG-dock.slim .rlG-pw.on::after{left:56px}
    .rlG-dock .rlG-pwrow .rlG-tabs button{height:50px}
    .rlG-dock .rlG-sl,.rlG-dock.slim .rlG-sl{height:52px} .rlG-dock .rlG-sl > b{width:44px}
    .rlG-dock .rlG-row{gap:5px} .rlG-dock .rlG-row button{height:46px;font-size:13px;gap:5px;padding:0 3px}
    .rlG-dock .rlG-wheel{width:116px;height:116px}
    .rlG-dock .rlG-cbox{gap:12px}
    .rlG-dock .rlG-sw{grid-template-columns:repeat(4,40px);gap:8px} .rlG-dock .rlG-sw button{width:40px;height:40px}
    .rlG-dock.plain{grid-template-columns:minmax(0,1fr);padding-right:76px}
  }
  .rlG-dock::before{content:"";position:absolute;left:24px;right:24px;top:-1px;height:3px;border-radius:0 0 3px 3px;background:rgb(var(--rgb,120,110,160));opacity:.25}
  .rlG-dock.on::before{opacity:1}
  .rlG-dx{position:absolute;top:50%;right:12px;margin-top:-28px;width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.09);color:var(--muted)}
  .rlG-did{display:flex;flex-direction:column;gap:10px;min-width:0}
  .rlG-dock.slim .rlG-did{flex-direction:row;align-items:center;gap:14px}
  .rlG-dt{display:flex;flex-direction:column;gap:2px;min-width:0}
  .rlG-dk{font-size:13px;letter-spacing:1.3px;text-transform:uppercase;color:var(--muted);font-weight:600;white-space:nowrap}
  .rlG-dn{font-size:26px;font-weight:500;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:10px}
  .rlG-dn i{width:14px;height:14px;border-radius:50%;flex:none;background:rgb(var(--rgb,120,110,160));box-shadow:0 0 0 3px rgba(255,255,255,.12)}
  .rlG-dock:not(.on) .rlG-dn i{background:#3b335f}
  .rlG-dock.slim .rlG-dn{font-size:21px}
  .rlG-ds{font-size:16px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rlG-dock.on .rlG-ds{color:var(--text)}
  .rlG-pw{flex:none;width:128px;height:68px;border-radius:999px;background:rgba(255,255,255,.12);position:relative}
  .rlG-pw::after{content:"";position:absolute;top:6px;left:6px;width:56px;height:56px;border-radius:50%;background:#d6ceff;transition:left .25s} /* left, not transform: no temporary layer */
  .rlG-pw.on{background:var(--accent-grad);box-shadow:var(--on-glow)}
  .rlG-pw.on::after{left:66px;background:#fff}
  .rlG-pw span{position:absolute;top:50%;transform:translateY(-50%);font-size:15px;font-weight:700;letter-spacing:1px}
  .rlG-pw .a{right:20px;color:var(--muted)} .rlG-pw .b{left:20px;color:#fff;visibility:hidden}
  .rlG-pw.on .a{visibility:hidden} .rlG-pw.on .b{visibility:visible}
  .rlG-dock.slim .rlG-pw{width:112px;height:60px}
  .rlG-dock.slim .rlG-pw::after{width:48px;height:48px}
  .rlG-dock.slim .rlG-pw.on::after{left:58px}
  .rlG-pwrow{display:flex;align-items:center;gap:12px}
  .rlG-dcol{display:flex;flex-direction:column;gap:8px;min-width:0}
  .rlG-cl{display:flex;align-items:baseline;gap:10px;font-size:15px;color:var(--muted);white-space:nowrap;min-height:24px}
  .rlG-cl b{flex:none;color:var(--text);font-size:19px;font-weight:600}
  .rlG-cl span{margin-left:auto;min-width:0;font-size:13px;color:var(--faint);overflow:hidden;text-overflow:ellipsis}
  .rlG-sl{position:relative;height:64px;border-radius:20px;background:rgba(255,255,255,.08);touch-action:none;cursor:pointer;overflow:hidden;flex:none}
  .rlG-dock.slim .rlG-sl{height:56px;border-radius:18px}
  .rlG-sl > i{position:absolute;inset:0;border-radius:inherit;transform-origin:left;transform:scaleX(var(--v,0));background:linear-gradient(90deg,rgba(var(--rgb),.35),rgba(var(--rgb),1))}
  .rlG-sl > b{position:absolute;top:5px;bottom:5px;width:52px;left:calc(5px + var(--v,0) * (100% - 62px));border-radius:15px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.35)}
  .rlG-sl.ct{background:var(--ctg)}
  .rlG-sl.hue{background:linear-gradient(90deg,#f00,#ff0 16.7%,#0f0 33.3%,#0ff 50%,#00f 66.7%,#f0f 83.3%,#f00)}
  .rlG-sl.ct > b,.rlG-sl.hue > b{background:rgb(var(--tc,255,255,255));border:4px solid #fff}
  .rlG-dock:not(.on) .rlG-sl.lvl > i{opacity:.35}
  .rlG-row{display:flex;gap:8px}
  .rlG-row button{flex:1;min-width:0;height:56px;border-radius:16px;background:rgba(255,255,255,.07);font-size:15px;font-weight:600;color:var(--muted);display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap;padding:0 6px}
  .rlG-row button.cur{background:rgba(255,255,255,.17);color:#fff;box-shadow:inset 0 0 0 2px rgba(255,255,255,.5)}
  .rlG-row i{width:16px;height:16px;border-radius:50%;background:var(--sw);display:inline-block;flex:none}
  .rlG-tabs{display:flex;gap:6px;padding:5px;border-radius:20px;background:rgba(255,255,255,.07)}
  .rlG-tabs button{flex:1;height:52px;border-radius:15px;font-size:16px;font-weight:600;color:var(--muted);display:flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;min-width:0}
  .rlG-tabs button.cur{background:var(--accent-grad);color:#fff;box-shadow:var(--on-glow)}
  .rlG-tabs button i{width:16px;height:16px;border-radius:50%;flex:none}
  .rlG-pwrow .rlG-tabs{flex:none;padding:4px;border-radius:18px}
  .rlG-pwrow .rlG-tabs button{width:64px;height:60px;flex:none;flex-direction:column;gap:3px;padding:0;border-radius:14px}
  .rlG-pwrow .rlG-tabs button i{width:22px;height:22px}
  .rlG-pwrow .rlG-tabs small{font-size:11px;font-weight:700;letter-spacing:.3px}
  .rlG-pwrow .rlG-pw{width:116px}
  .rlG-pwrow .rlG-pw.on::after{left:54px}
  .rlG-tabs .w i{background:var(--ctg)} .rlG-tabs .c i{background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)}
  .rlG-dock.slim .rlG-tabs{flex:none;padding:3px;border-radius:18px}
  .rlG-dock.slim .rlG-tabs button{width:58px;flex:none;height:52px;padding:0}
  .rlG-dock.slim .rlG-tabs button i{width:22px;height:22px}
  .rlG-tone{display:flex;gap:10px;align-items:center}
  .rlG-tone .rlG-sl{flex:1;min-width:0}
  .rlG-cbox{display:flex;gap:18px;align-items:center;min-width:0;padding-top:8px}
  .rlG-wheel{position:relative;width:144px;height:144px;border-radius:50%;flex:none;touch-action:none;cursor:pointer;
    background:radial-gradient(closest-side,#fff,rgba(255,255,255,0)),conic-gradient(#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00);box-shadow:0 0 0 5px rgba(255,255,255,.07)}
  .rlG-wt{position:absolute;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:4px solid #fff;background:rgb(var(--wc,255,255,255));box-shadow:0 2px 8px rgba(0,0,0,.45);
    left:calc(50% + var(--x,0) * 50%);top:calc(50% + var(--y,0) * 50%);pointer-events:none}
  .rlG-sw{flex:1;min-width:0;display:grid;grid-template-columns:repeat(4,56px);gap:10px;justify-content:start}
  .rlG-sw button{width:56px;height:56px;border-radius:50%;background:var(--sw);border:3px solid rgba(255,255,255,.22)}
  .rlG-sw button.cur{border-color:#fff}
  .rlG-dock [hidden]{display:none!important}
  .rlG-only{display:flex;align-items:center;gap:22px;font-size:17px;color:var(--muted);min-height:64px}
  .rlG-bigpw{flex:none;display:flex;align-items:center;gap:16px;height:96px;padding:0 40px 0 32px;border-radius:30px;font-size:24px;font-weight:500;background:rgba(255,255,255,.08);color:var(--muted)}
  .rlG-bigpw.on{background:var(--accent-grad);color:#fff;box-shadow:var(--on-glow)}
  .rlG-dock.slim .rlG-bigpw{height:64px;font-size:19px;padding:0 26px 0 20px;border-radius:22px}
  /* ---- right column: "At a glance" status rows (Layout E's style), outlets / modes, "Recently" ---- */
  .rlG-side{position:relative;min-height:0;min-width:0;display:flex;flex-direction:column;gap:12px;padding:18px 18px 16px;overflow-y:auto;scrollbar-width:none}
  .glass.rlG-side{box-shadow:none} /* GPU: the .glass shadow overlapping the rows' layers made the whole column a 2.6 MB layer */
  .rlG-side::-webkit-scrollbar{display:none}
  .rlG-gl{display:flex;flex-direction:column;gap:6px;flex:none}
  /* a row too narrow for name + state keeps the name whole and drops the state (and Lock) to a second line, right-aligned
     (the subline doesn't count: width 0 / min-width 100 % — it fills the name's width and ellipsizes) */
  .rlG-gr{--tone:var(--text);display:flex;flex-wrap:wrap;align-items:center;gap:4px 16px;min-height:66px;padding:6px 14px 6px 10px;border-radius:18px;background:rgba(255,255,255,.045);border:1px solid transparent;position:relative;min-width:0}
  .rlG-gr.t-ok{--tone:var(--ok)} .rlG-gr.t-warn{--tone:var(--warn)} .rlG-gr.t-bad{--tone:var(--bad)} .rlG-gr.t-live{--tone:var(--accent-2)}
  .rlG-gr.t-warn,.rlG-gr.t-bad{background:color-mix(in srgb,var(--tone) 13%,rgba(255,255,255,.03));border-color:color-mix(in srgb,var(--tone) 42%,transparent)}
  .rlG-gr.t-live{background:color-mix(in srgb,var(--accent) 17%,rgba(255,255,255,.04))}
  .rlG-gi{width:48px;height:48px;border-radius:15px;flex:none;display:grid;place-items:center;position:relative;color:var(--tone);background:color-mix(in srgb,var(--tone) 16%,transparent)}
  .rlG-gr.t-idle .rlG-gi{color:var(--muted);background:rgba(255,255,255,.07)}
  .rlG-gp{position:absolute;inset:0;border-radius:inherit;border:2px solid var(--tone);opacity:0;will-change:transform,opacity;pointer-events:none}
  .rlG-gr.live .rlG-gp{animation:rlG-ping 2.2s ease-out infinite}
  .rlG-gr.ring .rlG-gp{animation:rlG-alring 1.6s ease-out infinite}
  .rlG-gt{flex:1 1 auto;min-width:0;max-width:calc(100% - 64px);display:flex;flex-direction:column;line-height:1.2;gap:1px}
  .rlG-gt b{font-size:21px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rlG-gt small{width:0;min-width:100%;font-size:14px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rlG-gt small:empty{display:none}
  .rlG-gv{flex:none;max-width:100%;margin-left:auto;font-size:23px;font-weight:700;color:var(--tone);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right}
  .rlG-gr.t-idle .rlG-gv{font-weight:600}
  .rlG-glk{flex:none;margin-left:auto;display:inline-flex;align-items:center;gap:8px;height:56px;padding:0 20px 0 16px;border-radius:999px;background:var(--accent-grad);color:#fff;font-size:17px;font-weight:700;box-shadow:var(--on-glow)}
  .rlG-glk[hidden]{display:none}
  .rlG-leaf{transform-box:fill-box;transform-origin:0 50%;transition:transform .5s ease;will-change:transform}
  .rlG-gr.open .rlG-leaf{transform:scaleX(.45) skewY(-10deg)}
  .rlG-gr.open .rlG-sash{opacity:1}
  .rlG-gr .rlG-gbar{transform-box:fill-box;transform-origin:0 100%;transition:transform .25s;will-change:transform}
  .rlG-gr.ring .rlG-gbar{transform:rotate(-30deg)}
  .rlG-gl.dense .rlG-gr{min-height:58px;padding-top:4px;padding-bottom:4px}
  .rlG-gl.dense .rlG-gi{width:44px;height:44px}
  /* a status row that left the set stays in place (same node, same layer) at height 0 / opacity 0, moved last via order */
  .rlG-gl .rlG-gr.gone{min-height:0;height:0;padding-top:0;padding-bottom:0;border-width:0;margin-top:-6px;opacity:0;overflow:hidden;pointer-events:none}
  .rlG-gnone[hidden]{display:none}
  .rlG-gnone{display:flex;align-items:center;gap:16px;min-height:66px;padding:6px 14px 6px 10px;color:var(--muted);font-size:18px}
  .rlG-mode{cursor:pointer}
  .rlG-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;flex:none}
  .rlG-grid.modes4{grid-template-columns:repeat(4,minmax(0,1fr))}
  .rlG-pill{--tone:var(--muted);display:flex;align-items:center;gap:12px;min-height:66px;padding:9px 12px;border-radius:18px;background:rgba(255,255,255,.05);border:1px solid transparent;min-width:0;text-align:left;position:relative}
  .rlG-pi{width:46px;height:46px;border-radius:14px;flex:none;display:grid;place-items:center;position:relative;color:var(--tone);background:color-mix(in srgb,var(--tone) 17%,transparent)}
  .rlG-pt{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
  .rlG-pv{font-size:18px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rlG-grid.modes4 .rlG-mode{flex-direction:column;justify-content:center;gap:4px;min-height:84px;padding:8px 6px;text-align:center}
  .rlG-grid.modes4 .rlG-mode .rlG-pi{width:38px;height:38px;border-radius:12px}
  .rlG-grid.modes4 .rlG-mode .rlG-pt{flex:none;max-width:100%}
  .rlG-grid.modes4 .rlG-mode .rlG-pv{font-size:15px}
  .rlG-grid.modes4 .rlG-knob{position:absolute;top:8px;right:8px;width:30px;height:18px;margin:0}
  .rlG-grid.modes4 .rlG-knob::after{top:3px;left:3px;width:12px;height:12px}
  .rlG-grid.modes4 .rlG-mode.on .rlG-knob::after{left:15px}
  .rlG-knob{width:44px;height:26px;border-radius:13px;background:rgba(255,255,255,.15);position:relative;flex:none;margin-left:auto}
  .rlG-knob::after{content:"";position:absolute;top:4px;left:4px;width:18px;height:18px;border-radius:50%;background:#d6ceff;transition:left .25s}
  .rlG-mode.on .rlG-knob{background:var(--accent-grad)} .rlG-mode.on .rlG-knob::after{left:22px;background:#fff}
  .rlG-devs{display:flex;flex-direction:column;gap:8px;flex:none}
  .rlG-dev{display:flex;align-items:center;gap:12px;min-height:64px;padding:6px 12px;border-radius:18px;background:rgba(255,255,255,.05);width:100%;text-align:left}
  .rlG-di{width:46px;height:46px;border-radius:14px;flex:none;display:grid;place-items:center;color:var(--muted);background:rgba(255,255,255,.07);transition:background .3s,color .3s}
  .rlG-dev.on .rlG-di{color:var(--ok);background:rgba(52,211,153,.18)}
  .rlG-di.rlG-wc{padding:2px 4px;overflow:hidden} .rlG-wc .xa-svg{width:100%;height:100%}
  .rlG-dn2{flex:1 1 auto;min-width:0;max-width:calc(100% - 58px);display:flex;flex-direction:column;font-size:19px;font-weight:600}
  .rlG-dn2 span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rlG-dn2 small{font-size:14px;color:var(--muted);font-weight:400}
  .rlG-dev .rlG-seg{margin:0 0 0 auto;padding:4px}
  .rlG-dev:has(> .rlG-seg){flex-wrap:wrap;row-gap:4px} /* a shade's Close / Half / Open drop under its name when they don't fit beside it */
  .rlG-dev .rlG-seg button{min-width:62px;height:56px;font-size:15px}
  .rlG-fabric{transform-box:fill-box;transform-origin:top;transform:scaleY(var(--f,1));transition:transform 1.2s ease;will-change:transform}
  .rlG-knobg{transition:transform .25s;will-change:transform}
  .rlG-dev .switch{will-change:transform} /* its on-glow box-shadow must not create / drop a layer */
  .rlG-dev.on .rlG-knobg{transform:translateX(8px)}
  /* "Recently" timeline */
  .rlG-recent{flex:none;display:flex;flex-direction:column;gap:4px;margin-top:auto;padding:10px 14px 6px;border-radius:20px;background:rgba(255,255,255,.04);border:1px solid var(--glass-line)}
  .rlG-recent .rlG-sh{min-height:24px}
  .rlG-recent.off{visibility:hidden;position:absolute;left:18px;right:18px;bottom:16px;pointer-events:none}
  .rlG-tll{position:relative;display:flex;flex-direction:column}
  .rlG-tll::before{content:"";position:absolute;left:19px;top:24px;bottom:24px;width:2px;border-radius:1px;background:rgba(255,255,255,.1)}
  .rlG-ev{--tone:var(--muted);display:flex;align-items:center;gap:14px;height:48px;position:relative}
  .rlG-ev.t-ok{--tone:var(--ok)} .rlG-ev.t-warn{--tone:var(--warn)} .rlG-ev.t-bad{--tone:var(--bad)} .rlG-ev.t-live{--tone:var(--accent-2)}
  .rlG-evi{width:40px;height:40px;border-radius:50%;flex:none;display:grid;place-items:center;position:relative;color:var(--tone);background:color-mix(in srgb,var(--tone) 20%,#1b1440)}
  .rlG-evp{position:absolute;inset:0;border-radius:50%;border:2px solid var(--tone);opacity:0;will-change:transform,opacity}
  .rlG-ev.live .rlG-evp{animation:rlG-ping 2.4s ease-out infinite}
  .rlG-ev.live.t-bad .rlG-evp{animation-duration:1.6s}
  .rlG-evt{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.2}
  .rlG-evt b{font-size:17px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rlG-evt span{font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rlG-evt span:empty{display:none}
  .rlG-eva{flex:none;text-align:right;display:flex;flex-direction:column;line-height:1.2}
  .rlG-eva b{font-size:15px;font-weight:600;color:var(--text)} .rlG-eva span{font-size:12px;color:var(--faint)}
  .rlG-ev.first .rlG-evt b{font-size:18px}
  .rlG-ev .rlG-gbar{transform-box:fill-box;transform-origin:0 100%}
  .rlG-evg{transform-box:view-box;transform-origin:12px 12px;will-change:transform}
  .rlG-tll .rlG-ev.gone{height:0;opacity:0;overflow:hidden;pointer-events:none} /* unused slot of the fixed row pool */
  .rlG-ev.live .rlG-evg{animation:rlG-bob 1.1s ease-in-out infinite alternate}
  .rlG-ev.live.k-motion .rlG-evg{animation-name:rlG-walk}
  .rlG-ev.live.k-trap .rlG-evg,.rlG-ev.live.k-alert .rlG-evg{animation:rlG-shake 1.4s ease-in-out infinite}
  .rlG-quiet[hidden]{display:none}
  .rlG-quiet{display:flex;align-items:center;gap:14px;height:52px;color:var(--muted);font-size:16px}
  .rlG-quiet .rlG-evi{--tone:var(--muted)}
  /* toast + scene sheet: permanent layers that stay visible (visibility:hidden would drop them); hidden = opacity 0 and no
     pointer events, shown instantly (no transition) */
  .rlG-toast{position:absolute;left:50%;bottom:10px;transform:translate(-50%,0);z-index:9;padding:12px 22px;border-radius:14px;background:rgba(20,13,42,.95);border:1px solid var(--glass-line);font-size:17px;opacity:0;pointer-events:none;will-change:transform,opacity}
  .rlG-toast.show{opacity:1}
  .rlG-sheet{position:absolute;left:30%;top:46%;transform:translate(-50%,-50%);z-index:10;width:620px;max-width:56%;padding:24px 26px 22px;border-radius:26px;background:rgba(22,15,48,.98);
    border:2px solid color-mix(in srgb,var(--accent-2) 55%,transparent);opacity:0;pointer-events:none;will-change:transform,opacity;display:flex;flex-direction:column;gap:10px}
  .rlG-sheet.show{opacity:1;pointer-events:auto}
  .rlG-sheet h3{margin:0;font-size:26px;font-weight:500;display:flex;align-items:center;gap:12px}
  .rlG-sheet h3 .rlG-g{color:var(--accent-2)}
  .rlG-sheet p{margin:0;font-size:17px;color:var(--muted);line-height:1.35}
  .rlG-sheet .bt{display:flex;gap:10px;margin-top:8px}
  .rlG-sheet .bt button{display:inline-flex;align-items:center;gap:8px;height:60px;padding:0 26px;border-radius:999px;font-size:18px;font-weight:600;background:rgba(255,255,255,.09);border:1px solid var(--glass-line)}
  .rlG-sheet .bt .pri{background:var(--accent-grad);border-color:transparent;color:#fff}
  .rlG-sheet .bt .rst{margin-left:auto;color:var(--muted)}
  .rlG-sheet .bt [hidden]{display:none}
  .rlG-empty{flex:1;display:grid;place-items:center;color:var(--muted);font-size:20px;position:relative}
  .rlG-emptyin{display:flex;flex-direction:column;align-items:center;gap:18px;text-align:center;max-width:520px}
  .rlG-emptyin .rlG-ricon{width:140px;height:140px;border-radius:40px}
  .rlG-etemp{font-size:96px;font-weight:200;color:var(--text);line-height:1}
  .rlG-etemp small{font-size:28px;color:var(--muted);margin-left:12px}
  /* pause: page hidden / screensaver (html.anim-paused) / no-motion */
  .rlG.rlG-hidden *,.rlG.rlG-hidden *::before,.rlG.rlG-hidden *::after,
  html.anim-paused .rlG *,html.anim-paused .rlG *::before,html.anim-paused .rlG *::after{animation-play-state:paused!important}
  html.no-motion .rlG *,html.no-motion .rlG *::before,html.no-motion .rlG *::after{animation:none!important;transition:none!important}
  @media (prefers-reduced-motion:reduce){.rlG *,.rlG *::before,.rlG *::after{animation:none!important}}
  @keyframes rlG-breeze{from{transform:scale(.72) rotate(0);opacity:.7}to{transform:scale(1.08) rotate(40deg);opacity:0}}
  @keyframes rlG-alring{from{transform:scale(1);opacity:.85}to{transform:scale(1.45);opacity:0}}
  @keyframes rlG-ping{from{transform:scale(1);opacity:.8}to{transform:scale(1.42);opacity:0}}
  @keyframes rlG-bob{from{transform:translateY(1px)}to{transform:translateY(-2px)}}
  @keyframes rlG-walk{from{transform:translateX(-1.5px) rotate(-4deg)}to{transform:translateX(1.5px) rotate(4deg)}}
  @keyframes rlG-shake{0%,60%,100%{transform:rotate(0)}70%{transform:rotate(-12deg)}80%{transform:rotate(10deg)}90%{transform:rotate(-5deg)}}
  `;

  // ---------- markup ----------
  const K = (el, k) => el && el.querySelector(`[data-k="${k}"]`);
  const CT_PRESETS = [["Candle", 2200], ["Warm", 2700], ["Neutral", 4000], ["Daylight", 6500]];
  const SWATCHES = [[0, 100], [8, 100], [15, 100], [30, 90], [50, 100], [66, 100], [77, 85], [90, 80]];
  const QUICK = [25, 50, 75, 100];
  const CT_GRAD = `linear-gradient(90deg,${[2000, 2700, 3500, 4500, 5500, 6500].map((k) => rgb(k2rgb(k))).join(",")})`;
  const ST = ["run", "pause", "done", "idle", "warn", "ok"];
  const MCOL = { fan: "#67e8f9", purifier: "#7dd3fc", washer: "#38bdf8", dryer: "#fb923c", dishwasher: "#22d3ee", oven: "#fb923c", fridge: "#93c5fd", microwave: "#fbbf24" };
  const lightCaps = (d) => !!(d && (d.dim || d.white || d.rgb));
  const LSCENES = fresh(() => ([["bright", T("rg.bright"), () => glyph("sun", 22)], ["relax", T("rg.relax"), () => ic("sofa", 22)], ["night", T("rg.nightLight"), () => glyph("moon", 22)], ["cozy", T("rg.cozy"), () => glyph("cozy", 22)]]));
  const FSCENES = fresh(() => ([["off", T("rg.off"), () => glyph("pwr", 22)], ["breeze", T("rg.breeze"), () => glyph("air", 22)], ["sleep", T("rg.sleep"), () => glyph("bed", 22)], ["max", T("rg.max"), () => glyph("fan", 22)]]));

  // (solo: a card's orb — the custom grid's room card, grid.js — its name a plain label, no dock to open; fb: its icon)
  function orbHtml(d, m, solo, fb) {
    return `<div class="${P}-orb${d.dim ? " dim" : ""}" data-light="${esc(d.id)}">
      <div class="${P}-ow"><div class="${P}-glow"></div>
        <svg class="${P}-oring" viewBox="0 0 100 100" aria-hidden="true"><circle class="${P}-rt" cx="50" cy="50" r="45" pathLength="100" transform="rotate(135 50 50)"/><circle class="${P}-rv" cx="50" cy="50" r="45" pathLength="100" transform="rotate(135 50 50)"/></svg>
        <div class="${P}-bulb"><div class="${P}-lit"></div><div class="${P}-bc">${pic(d.icon, 24, fb || glyph("bulb", 24))}<span class="${P}-pct num" data-k="pct"></span></div></div>
        ${d.group ? `<span class="${P}-grp">GROUP</span>` : ""}<span class="${P}-bub num" data-k="bub"></span></div>
      ${solo ? `<span class="${P}-lab"><b>${esc(nice(d.name, m.name))}</b><small data-k="st"></small></span>` : `<button class="${P}-lab" data-act="name:${esc(d.id)}"><b>${esc(nice(d.name, m.name))}</b><small data-k="st"></small></button>`}</div>`;
  }
  const scenesHtml = (kind, defs) => `<div class="${P}-presets">${defs.map(([k, n, g]) => `<button data-scene="${kind}:${k}" data-name="${esc(n)}">${g()}${esc(n)}<i></i></button>`).join("")}</div>`;
  const rowWrap = (cls, inner) => `<div class="${P}-rw ${P}-${cls}"><div class="${P}-scr"><div class="${P}-track">${inner}</div></div><i class="${P}-fade l"></i><i class="${P}-fade r"></i></div>`;

  function machHtml(x, m) {
    let name = "", art = "", extra = "", big = true;
    switch (x.type) {
      case "fan": name = /^(ceiling )?fan$/i.test(nice(x.d.name, m.name)) ? T("rg2.fanOfType", { type: T.named ? T.named("rg2.fanType", x.d.fanType || "ceiling", cap(x.d.fanType || "ceiling")) : cap(x.d.fanType || "ceiling") }) : nice(x.d.name, m.name); art = fanArtFor(x.d.fanType || "ceiling");   // (its type's word: a tower fan isn't a "Ceiling fan")
        extra = `<div class="${P}-seg" data-k="seg">${["off", "low", "medium", "high"].map((s) => `<button data-act="fan:${esc(x.d.id)}:${s}" data-sp="${s}">${esc(s === "medium" ? T("rg.med") : T(`val.${s}`))}</button>`).join("")}</div>`; break;
      case "plugfan": name = nice(x.d.name, m.name); art = fanArtFor(x.d.fanType || "pedestal");
        extra = `<div class="${P}-seg" data-k="seg">${["off", "on"].map((s) => `<button data-act="pfan:${esc(x.d.id)}:${s}" data-sp="${s}">${esc(T(`val.${s}`))}</button>`).join("")}</div>`; break;
      case "purifier": name = T("rg.airPurifier"); art = dysonArt();
        extra = `<div class="${P}-aq"><span class="${P}-aqv num" data-k="aqv">—</span><span data-k="aqt" class="${P}-aqt"></span></div>
          <div class="${P}-seg ${P}-pseg">${[["off", T("rg.off")], ["auto", T("rg.auto")], ["minus", "−"], ["plus", "+"]].map(([k, n]) => `<button data-act="pur:${esc(x.t.id)}:${k}" data-pm="${k}">${n}</button>`).join("")}</div>`; break;
      case "washer": case "dryer": name = cap(x.type); art = laundryArt(x.type);
        extra = `<div class="${P}-eta" data-k="eta"></div><div class="${P}-pbar"><i data-k="pbar"></i></div>`; break;
      case "dishwasher": name = T("rg.dishwasher"); art = dishArt(); extra = `<div class="${P}-pbar"><i data-k="pbar"></i></div>`; break;
      case "oven": name = T("rg.range"); art = rangeArt(); extra = `<div class="${P}-tbar"><i data-k="tfill"></i></div>`; break;
      case "fridge": name = T("rg.fridge"); art = fridgeArt(); big = false;
        extra = `<div class="${P}-temps"><div><span class="num" data-k="cool">—</span><small>${esc(T("rg2.fridge"))}</small></div><div><span class="num" data-k="frz">—</span><small>${esc(T("rg2.freezer"))}</small></div></div>`; break;
      case "microwave": name = T("rg.microwave"); art = microArt(); break;
    }
    art = pic((x.d && x.d.icon) || (x.t && x.t.icon), 0, art, true);   // the owner's picture, if any
    return `<div class="${P}-mc ${P}-${x.type} ${P}-idle" data-m="${esc(x.key)}" data-w="${x.type}" data-name="${esc(name)}" style="--mc:${MCOL[x.type] || "#a78bfa"}">
      <div class="${P}-art">${art}</div>
      <div class="${P}-mi"><div class="${P}-mn">${esc(name)}<span class="${P}-badge" data-k="badge">${esc(T("rg2.idle"))}</span></div>
        ${big ? `<div class="${P}-big num"><span data-k="big">—</span> <small data-k="unit"></small></div>` : ""}
        ${x.type === "fridge" ? extra : ""}<div class="${P}-sub" data-k="sub"></div>${x.type === "fridge" ? "" : extra}</div></div>`;
  }

  // refs of everything in this room the "Recently" timeline can report on
  function roomRefs(m) {
    if (m._refs) return m._refs;
    const TRACK = ["motion", "garage", "washer", "dryer", "dishwasher", "microwave", "oven", "fridge", "purifier", "vibration", "siren"];
    return (m._refs = new Set([...m.things.filter((t) => TRACK.includes(t.kind)).map((t) => "t" + t.id), ...m.windows.map((w) => "w" + w.id),
      ...m.doors.map((d) => "d" + d.id), ...(m.overhead ? ["d" + m.overhead.id] : []), ...m.locks.map((l) => "l" + l.id), ...m.sensors.map((s) => "s" + s.id)]));
  }
  function sideHtml(m) {
    const modeName = (n) => str(n).replace(/([a-z])([A-Z])/g, "$1 $2");
    const modes = m.modes.length ? `<div class="${P}-sh"><span class="label">${esc(T("rg2.modes"))}</span><span class="${P}-note" style="margin-left:auto">${esc(T("rg2.preview"))}</span></div>
      <div class="${P}-grid${m.modes.length >= 3 ? " modes4" : ""}">${m.modes.map((t) => `<button class="${P}-pill ${P}-mode" data-act="mode:${esc(t.id)}" data-mode="${esc(t.id)}"><span class="${P}-pi">${glyph(modeGlyph(t.name), 24)}</span><span class="${P}-pt"><span class="${P}-pv">${esc(modeName(t.name))}</span></span><i class="${P}-knob"></i></button>`).join("")}</div>` : "";
    const devRows = [...m.plugs.map((d) => TOGGLE_KINDS.includes(d.kind) ? `<button class="${P}-dev" data-act="tog:${esc(d.id)}" data-dev="${esc(d.id)}"><span class="${P}-di">${pic(d.icon, 26, glyph(devGlyph(d.kind), 26))}</span>
        <span class="${P}-dn2"><span>${esc(nice(d.name, m.name))}</span><small data-k="st"></small></span><span class="switch"></span></button>`
        : `<div class="${P}-dev ro" data-dev="${esc(d.id)}"><span class="${P}-di">${pic(d.icon, 26, glyph("plug", 26))}</span><span class="${P}-dn2"><span>${esc(nice(d.name, m.name))}</span><small data-k="st"></small></span></div>`),
      // (a shade whose picture is a window covering's drawing: the drawing, standing where the shade is — patchSide)
      ...m.shades.map((d) => `<div class="${P}-dev" data-dev="${esc(d.id)}"${wcKind(d.icon) ? ` data-wct="${wcKind(d.icon)}"` : ""}>${wcKind(d.icon)
        ? `<span class="${P}-di ${P}-wc">${pic(d.icon, 0, glyph("shade", 26), true)}</span>` : `<span class="${P}-di">${pic(d.icon, 26, glyph("shade", 26))}</span>`}<span class="${P}-dn2"><span>${esc(nice(d.name, m.name))}</span><small data-k="st"></small></span>
        <div class="${P}-seg">${[[0, T("rg.close")], [50, T("rg.half")], [100, T("rg.open")]].map(([l, n]) => `<button data-act="shade:${esc(d.id)}:${l}" data-l="${l}">${n}</button>`).join("")}</div></div>`)];
    const devLabel = m.plugs.some((d) => OPENS.includes(d.kind)) ? T("rg.devices") : m.shades.length && m.plugs.length ? T("rg.outletsShades") : m.shades.length ? T("rg.shades") : m.plugs.some((d) => d.kind === "switch") ? T("rg.switchesOutlets") : T("rg.outlets");
    const recent = roomRefs(m).size ? `<div class="${P}-recent" data-k="recent"><div class="${P}-sh"><span class="label">${esc(T("rg2.recently"))}</span><span class="${P}-shs" data-k="rsince"></span></div><div class="${P}-tll" data-k="tll"></div></div>` : "";
    return `<aside class="glass ${P}-side" data-k="side">
      <div class="${P}-sh"><span class="label">${esc(T("rg2.roomStatus"))}</span><span class="${P}-shs" data-k="gsum"></span></div>
      <div class="${P}-gl" data-k="gl"></div>
      ${modes}
      ${devRows.length ? `<div class="${P}-sh"><span class="label">${devLabel}</span></div><div class="${P}-devs">${devRows.join("")}</div>` : ""}
      ${recent}
    </aside>`;
  }
  function camLabel(c, m) {
    const n = nice(c.name, m.name).replace(/^[\s\-–·:]+/, "").trim();
    return n || T("rg.camera");
  }
  function build(m) {
    const n = m.machines.length, nl = m.lights.length, anyDim = m.lights.some((d) => d.dim);
    const cams = m.cameras.length ? `<div class="${P}-cams">${m.cameras.map((c) => {
      const off = c.online === false;
      return `<button class="${P}-cam${c.doorbell ? " bell" : ""}${off ? " off" : ""}" data-act="cam:${esc(c.id)}"${off ? ' aria-disabled="true"' : ""}>${glyph(c.doorbell ? "bell" : "camera", 22)}<span>${esc(camLabel(c, m))}</span>${off ? `<small>${esc(T("rg2.offline"))}</small>` : ""}</button>`;
    }).join("")}</div>` : "";
    const head = `<header class="${P}-head">
      <div class="${P}-ricon">${ic(m.room.icon || "home", 32)}</div><h1>${esc(m.name)}</h1>
      <div class="${P}-chips">
        <span class="${P}-chip" data-k="clim" hidden></span>
        <span class="${P}-chip" data-k="lchip" hidden></span>
        ${m.windows.map((w) => `<span class="${P}-chip" data-win="${esc(w.id)}"></span>`).join("")}
        <span class="${P}-chip demo" data-k="demo" hidden>${esc(T("rg2.demo"))}</span>
      </div>${cams}
      <div class="${P}-hr">${nl ? `<button class="${P}-btn pri" data-act="all:1">${ic("bulb", 24)}${esc(T("rg2.allOnBtn"))}</button><button class="${P}-btn" data-act="all:0">${ic("power", 24)}${esc(T("rg2.allOffBtn"))}</button>` : ""}
        <span class="${P}-clock num" data-k="clock"></span></div></header>`;
    const lscenes = nl >= 2 || anyDim ? scenesHtml("lights", LSCENES) : "";
    const lights = nl ? `<div class="${P}-sh ${P}-lh"><span class="label">${nl > 1 ? T("rg.lights") : T("rg.light")}</span><span class="${P}-shs" data-k="lsum"></span>${lscenes}</div>
        ${rowWrap("orbs", m.lights.map((d) => orbHtml(d, m)).join(""))}
        <div class="${P}-hint" data-k="hint"></div>
        <div class="${P}-dock${n ? " slim" : ""}" data-k="dock" hidden></div>` : "";
    let stage;
    if (n) {
      const onlyAir = m.machines.every((x) => ["fan", "plugfan", "purifier"].includes(x.type));
      const preview = m.machines.some((x) => !["fan", "plugfan", "purifier"].includes(x.type));
      const fscenes = m.fanSet.length >= 2 ? scenesHtml("fans", FSCENES) : "";
      stage = `<div class="${P}-sh ${P}-mh${fscenes ? "" : " bare"}"><span class="label">${onlyAir ? T("rg.fansAir") : T("rg.appliances")}</span>${preview ? `<span class="${P}-note">${onlyAir ? "purifier" : "appliances"}: live status · controls preview — not connected yet</span>` : ""}<span class="${P}-shs" data-k="msum"></span>${fscenes}</div>
        <div class="${P}-sp a"></div>${rowWrap("mrow", m.machines.map((x) => machHtml(x, m)).join(""))}
        <div class="${P}-sp b"></div>${lights}<div class="${P}-sp"></div>`;
    } else if (nl) stage = lights.replace(`<div class="${P}-rw`, `<div class="${P}-sp top"></div><div class="${P}-rw`) + `<div class="${P}-sp"></div>`;
    else stage = `<div class="${P}-sh"><span class="label">${esc(m.name)}</span></div>
        <div class="${P}-empty"><div class="${P}-emptyin"><div class="${P}-ricon">${ic(m.room.icon || "home", 64)}</div><div class="${P}-etemp num" data-k="etemp"></div>
          <span>${esc(T("rg2.nothingHere"))}</span></div></div>`;
    const sheet = `<div class="${P}-sheet" data-k="sheet" role="dialog"><h3>${glyph("sparkle", 28)}<span data-k="shT"></span></h3><p data-k="shP"></p>
      <div class="bt"><button class="pri" data-act="sh:save">${glyph("check", 22)}${esc(T("rg2.save"))}</button><button data-act="sh:cancel">${esc(T("common.cancel"))}</button><button class="rst" data-act="sh:reset" data-k="shR">${esc(T("rg2.reset"))}</button></div></div>`;
    return `${DEFS}${DEFS2}${head}<div class="${P}-body"><section class="glass ${P}-stage" data-k="stage"><div class="${P}-amb"></div>${stage}</section>${sideHtml(m)}</div>
      <div class="${P}-toast" data-k="toast"></div>${sheet}`;
  }

  // the dock: controls of the light whose name was tapped (rebuilt only when another light is picked)
  function dockHtml(d, m, slim) {
    const id = esc(d.id), both = d.white && d.rgb, caps = lightCaps(d);
    const kind = d.rgb && d.white ? T("rg.colourWhiteLight") : d.rgb ? T("rg.colourLight") : d.white ? T("rg.tunableWhiteLight") : d.dim ? T("rg.dimmableLight") : T("rg.onOffLight");
    const pw = `<button class="${P}-pw" data-act="tog:${id}" data-k="pw" aria-label="${esc(T("rg2.onOff"))}"><span class="a">${esc(T("rg2.off"))}</span><span class="b">${esc(T("rg2.on"))}</span></button>`;
    const tabs = both ? `<div class="${P}-tabs" data-k="tabs"><button class="w" data-act="tab:${id}:ct" data-tab="ct" style="--ctg:${CT_GRAD}"><i></i>${slim ? "" : `<small>${esc(T("rg2.white"))}</small>`}</button><button class="c" data-act="tab:${id}:rgb" data-tab="rgb"><i></i>${slim ? "" : `<small>${esc(T("rg2.colour"))}</small>`}</button></div>` : "";
    const close = `<button class="${P}-dx" data-act="dock:close" aria-label="${esc(T("common.close"))}">${glyph("x", 26)}</button>`;
    const ident = `<div class="${P}-did">${slim && caps ? pw : ""}
        <div class="${P}-dt"><span class="${P}-dk">${slim ? kind : kind}</span><span class="${P}-dn"><i></i><span>${esc(nice(d.name, m.name))}</span></span><span class="${P}-ds" data-k="ds"></span></div>
        ${slim || !caps ? "" : `<div class="${P}-pwrow">${pw}${tabs}</div>`}</div>`;
    if (!caps) return { cls: "plain", html: `${ident}<div class="${P}-only"><button class="${P}-bigpw" data-act="tog:${id}" data-k="bigpw">${glyph("pwr", 34)}<span data-k="bpw">${esc(T("rg2.turnOn"))}</span></button><span>${esc(T("rg2.onOffOnly"))}</span></div>${close}` };
    const bright = d.dim ? `<div class="${P}-dcol"${!d.white && !d.rgb ? ' style="grid-column:span 2"' : ""}><div class="${P}-cl">${esc(T("rg2.brightness"))} <b data-k="lvv"></b><span>${esc(T("rg2.onRelease"))}</span></div>
        <div class="${P}-sl lvl" data-sl="lvl"><i></i><b></b></div>
        ${slim ? "" : `<div class="${P}-row">${QUICK.map((v) => `<button data-act="lvl:${id}:${v}" data-q="${v}">${v}%</button>`).join("")}</div>`}</div>` : "";
    const ctBox = d.white ? `<div class="${P}-dcol" data-k="ctbox"${!d.dim ? ' style="grid-column:span 2"' : ""}><div class="${P}-cl">${esc(T("rg2.warmCool"))} <b data-k="ctv"></b></div>
        ${slim ? `<div class="${P}-tone">${tabs}<div class="${P}-sl ct" data-sl="ct" style="--ctg:${CT_GRAD}"><b></b></div></div>`
          : `<div class="${P}-sl ct" data-sl="ct" style="--ctg:${CT_GRAD}"><b></b></div>
        <div class="${P}-row">${CT_PRESETS.map(([nm, k]) => `<button data-act="ct:${id}:${k}" data-k2="${k}"><i style="--sw:${rgb(k2rgb(k))}"></i>${nm}</button>`).join("")}</div>`}</div>` : "";
    const cBox = d.rgb ? `<div class="${P}-dcol" data-k="cbox"${!d.dim ? ' style="grid-column:span 2"' : ""}><div class="${P}-cl">${esc(T("rg2.colour"))} <b data-k="cv"></b>${slim ? "" : `<span>${esc(T("rg2.wheel"))}</span>`}</div>
        ${slim ? `<div class="${P}-tone">${tabs}<div class="${P}-sl hue" data-sl="hue"><b></b></div></div>`
          : `<div class="${P}-cbox"><div class="${P}-wheel" data-wheel="${id}"><span class="${P}-wt"></span></div>
          <div class="${P}-sw">${SWATCHES.map(([h, s]) => `<button data-act="col:${id}:${h}:${s}" data-h="${h}" data-sa="${s}" style="--sw:${rgb(colourOf(h, s))}" aria-label="${hueName(h)}"></button>`).join("")}</div></div>`}</div>` : "";
    return { cls: "", html: ident + bright + ctBox + cBox + close };
  }

  // ---------- view state ----------
  // The dock is closed by default (dockId = null). A tap on a light's NAME opens it for that light; the ✕, the same
  // name again, or DOCK_IDLE ms without a touch close it. Orb taps always toggle; vertical drags dim.
  const DOCK_IDLE = 20000;
  let root = null, curRoom = null, key = "", last = null, timers = {}, toastT = 0, drag = null, dockId = null, dockT = 0, ro = null, recentCap = 5;
  let refs = {};
  const lightUI = new Map(); // light id → { ui: "CT" | "RGB", at } — which half of a white+colour light's controls is showing
  function toast(msg) {
    const el = refs.toast; if (!el) return;
    txt(el, msg); el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => el && el.classList.remove("show"), 2600);
  }
  // one-shot wiggle on a real state change (Element.animate, transform only) — only on elements that already own a
  // permanent layer (orb, glance row, device row, timeline row), skipped while hidden / paused / reduced motion
  const NUDGE = [{ transform: "none" }, { transform: "scale(1.05)", offset: 0.35 }, { transform: "scale(.985)", offset: 0.7 }, { transform: "none" }];
  const SLIDE = [{ transform: "translateX(-18px)" }, { transform: "none" }];
  const reduceMQ = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  function nudge(el, frames = NUDGE, ms = 520) {
    if (!el || typeof el.animate !== "function" || document.hidden) return;
    const h = document.documentElement.classList;
    if (h.contains("anim-paused") || h.contains("no-motion") || (reduceMQ && reduceMQ.matches)) return;
    try { el.animate(frames, { duration: ms, easing: "ease-out" }); } catch (e) { /* old WebView */ }
  }
  const devById = (id) => (last ? last.devs.find((d) => String(d.id) === String(id)) : null);
  // demo: a command only changes local overrides — nothing is sent
  function demoApply(fn, id, a) {
    const d = devById(id); if (!d) return;
    const o = { ...(demoOv.get(String(d.id)) || {}) };
    const cur = { ...d, ...o };
    if (fn === "toggle") { o.on = !cur.on; if (d.kind === "fan") o.speed = o.on ? (cur.speed && cur.speed !== "off" ? cur.speed : "medium") : "off"; }
    else if (fn === "setLevel") { o.on = true; o.level = a[0]; }
    else if (fn === "setColorTemp") { o.on = true; o.mode = T("rg.ct"); o.ct = a[0]; }
    else if (fn === "setColor") { o.on = true; o.mode = "RGB"; o.hue = a[0]; o.sat = a[1]; }
    else if (fn === "setFan") { o.speed = a[0]; o.on = a[0] !== "off"; }
    else if (fn === "setShade") o.level = a[0];
    else return;
    demoOv.set(String(d.id), o);
  }
  // every real command goes through here (one place, never throws); in demo mode nothing reaches Home
  // values are clamped to what the hub accepts (Hubitat hue / saturation 0–100, 2000–6500 K, level 1–100)
  function fixArgs(fn, args) {
    const n = (v, a, b, d) => { const x = num(v); return Math.round(clamp(x == null ? d : x, a, b)); };
    if (fn === "setColor") return [n(args[0], 0, 100, 0), n(args[1], 0, 100, 100)];
    if (fn === "setColorTemp") return [n(args[0], 2000, 6500, 2700)];
    if (fn === "setLevel") return [n(args[0], 1, 100, 100)];
    if (fn === "setFan") return [["off", "low", "medium", "high"].includes(args[0]) ? args[0] : "medium"];
    return args;
  }
  function cmd(fn, id, ...args) {
    args = fixArgs(fn, args);
    if (demo) { demoApply(fn, id, args); return; }
    try { const h = window.Home; if (h && typeof h[fn] === "function") h[fn](id, ...args); } catch (e) { console.warn("rlG: command failed", e); }
  }
  function sent() { if (demo) { toast(T("rg.demoModeFakeStatesNothingWasSent")); safeUpdate(); } }
  function send(fn, id, ...args) { cmd(fn, id, ...args); sent(); }
  function allLights(on) {
    if (!last) return;
    if (demo) { last.lights.forEach((d) => demoOv.set(String(d.id), { ...(demoOv.get(String(d.id)) || {}), on })); sent(); return; }
    try { Home.roomAll(curRoom, on); } catch (e) { console.warn("rlG: command failed", e); }
  }
  // several commands → one Home.batch (listeners / re-render once at the end); demo: local only
  function sendBatch(cmds) {
    if (!cmds.length) return;
    const run = () => cmds.forEach((c) => cmd(...c));
    const h = window.Home;
    if (!demo && h && typeof h.batch === "function") { try { h.batch(run); } catch (e) { console.warn("rlG: scene failed", e); } } else run();
    sent();
  }

  // ---------- patch ----------
  function lookFor(d) { return lightLook(drag && drag.id === String(d.id) && drag.ov ? { ...d, ...drag.ov } : d); }
  const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  function lightText(d, L) { return L.on ? [d.dim ? `${L.level}%` : T("rg.on"), L.kind].filter(Boolean).join(" · ") : d.unknown ? T("rg.unknown") : T("rg.off"); }
  function paintOrb(el, d, L) {
    prop(el, "--rgb", L.c.join(",")); prop(el, "--rgbd", mix(L.c, [34, 18, 70], 0.55).join(",")); prop(el, "--lv", L.lv.toFixed(3));
    prop(el, "--ink", lum(L.c) < 0.5 ? "#fff" : "#1a1033");
    cls(el, "on", L.on); cls(el, "sel", String(d.id) === dockId); cls(el, "unk", !L.on && !!d.unknown); // hub doesn't know: red, a tap turns it on
    const dr = !!(drag && drag.type === "orb" && drag.id === String(d.id) && (drag.mode === "rel" || drag.mode === "ring"));
    cls(el, "drag", dr);
    if (!el._rv) el._rv = el.querySelector(`.${P}-rv`);
    prop(el._rv, "stroke-dasharray", `${(75 * L.lv).toFixed(2)} 100`);
    txt(K(el, "pct"), `${L.level}%`); txt(K(el, "st"), lightText(d, L));
    if (dr) txt(K(el, "bub"), `${L.level}%`);
  }
  function paintLights(m) {
    (refs.orbs || []).forEach((el) => { const d = m.devs.find((x) => String(x.id) === el.dataset.light); if (!d) return; const L = lookFor(d);
      if (el._on != null && el._on !== L.on && !el.classList.contains("drag")) nudge(el); el._on = L.on; paintOrb(el, d, L); });
    const lit = m.lights.map((d) => lookFor(d)).filter((L) => L.on);
    if (refs.stage) {
      cls(refs.stage, "lit", lit.length > 0);
      if (lit.length) {
        const w = lit.reduce((s, L) => s + L.lv + 0.2, 0), c = [0, 1, 2].map((i) => Math.round(lit.reduce((s, L) => s + L.c[i] * (L.lv + 0.2), 0) / w));
        prop(refs.stage, "--amb", c.join(",")); prop(refs.stage, "--ambo", clamp(0.35 + lit.length / Math.max(1, m.lights.length), 0.35, 1).toFixed(2));
      }
    }
    const on = lit.length, tot = m.lights.length;
    txt(K(root, "lsum"), tot ? (on ? `${on} of ${tot} on` : tot > 1 ? "all off" : "off") : "");
    const anyCtl = m.lights.some((d) => lightCaps(d));
    txt(refs.hint, dockId ? "" : T(`rg2.tapLight${m.lights.some((d) => d.dim) ? "Dim" : ""}${anyCtl ? "More" : ""}`));
    paintDock(m);
    paintScenes();
  }
  // keep showing the half the user just used while the hub confirms the command (or for a light that is off)
  const showUI = (id, ui) => lightUI.set(String(id), { ui, at: Date.now() });
  function uiOf(d, L) {
    if (!(d.white && d.rgb)) return d.rgb ? "RGB" : T("rg.ct");
    const u = lightUI.get(String(d.id));
    if (u && Date.now() - u.at < 20000) return u.ui;
    return L.colour ? "RGB" : T("rg.ct");
  }
  function paintDock(m) {
    const sh = refs.dock; if (!sh) return;
    const d = dockId ? m.devs.find((x) => String(x.id) === dockId) : null;
    if (!d) { if (!sh.hidden) sh.hidden = true; if (dockId) dockId = null; return; }
    if (sh.hidden) sh.hidden = false;
    if (sh._id !== dockId) { // another light picked: rebuild the dock (static controls, nothing animates in here)
      const r = dockHtml(d, m, sh.classList.contains("slim"));
      sh._id = dockId; sh.innerHTML = r.html;
      ["plain"].forEach((c) => cls(sh, c, r.cls === c));
      sh._wt = sh.querySelector(`.${P}-wt`);
    }
    const L = lookFor(d), ui = uiOf(d, L), both = d.white && d.rgb;
    prop(sh, "--rgb", L.c.join(",")); cls(sh, "on", L.on);
    cls(K(sh, "pw"), "on", L.on); cls(K(sh, "bigpw"), "on", L.on); txt(K(sh, "bpw"), L.on ? T("rg.turnOff") : T("rg.turnOn"));
    txt(K(sh, "ds"), L.on ? lightText(d, L) : d.unknown ? T("rg.unknownTapTurnOn") : L.kind ? T("rg2.offLast", { kind: L.kind.toLowerCase() }) : T("rg.off"));
    txt(K(sh, "lvv"), `${L.level}%`); prop(sh.querySelector(`[data-sl="lvl"]`), "--v", ((L.level - 1) / 99).toFixed(3));
    sh.querySelectorAll("[data-q]").forEach((b) => cls(b, "cur", L.on && Math.abs(+b.dataset.q - L.level) < 3));
    sh.querySelectorAll("[data-tab]").forEach((b) => cls(b, "cur", b.dataset.tab === (ui === "RGB" ? "rgb" : "ct")));
    const ctb = K(sh, "ctbox"), cb = K(sh, "cbox");
    if (ctb) ctb.hidden = both && ui === "RGB";
    if (cb) cb.hidden = both && ui !== "RGB";
    const Kv = L.K || 2700, ctSl = sh.querySelector(`[data-sl="ct"]`);
    txt(K(sh, "ctv"), `${Kv} K · ${ctName(Kv)}`);
    if (ctSl) { prop(ctSl, "--v", clamp((Kv - 2000) / 4500, 0, 1).toFixed(3)); prop(ctSl, "--tc", k2rgb(Kv).join(",")); }
    sh.querySelectorAll("[data-k2]").forEach((b) => cls(b, "cur", !L.colour && Math.abs(+b.dataset.k2 - Kv) < 150));
    txt(K(sh, "cv"), L.colour ? `${hueName(L.hue)} · ${Math.round(L.sat)}%` : "white now — pick a colour");
    const hs = sh.querySelector(`[data-sl="hue"]`);
    if (hs) { prop(hs, "--v", (clamp(L.hue, 0, 100) / 100).toFixed(3)); prop(hs, "--tc", colourOf(L.hue, 100).join(",")); }
    if (sh._wt) {
      const a = (L.hue * 3.6 * Math.PI) / 180, r = clamp(L.sat, 0, 100) / 100;
      prop(sh._wt, "--x", (r * Math.sin(a)).toFixed(3)); prop(sh._wt, "--y", (-r * Math.cos(a)).toFixed(3)); prop(sh._wt, "--wc", colourOf(L.hue, L.sat).join(","));
    }
    sh.querySelectorAll("[data-h]").forEach((b) => cls(b, "cur", L.colour && Math.abs(+b.dataset.h - L.hue) < 2 && Math.abs(+b.dataset.sa - L.sat) < 6));
  }
  function openDock(id) {
    dockId = id == null ? null : String(id);
    if (refs.dock && dockId == null) refs.dock._id = null;
    armDockTimer();
    if (last) { paintLights(last); fitRows(); fitRecent(); fitStage(); }
  }
  // a stage too low for what's on it (1024 × 768, a fans row above the lights): .tight draws it smaller (measured with
  // the dock closed, so opening it doesn't move the orbs) — and what still doesn't fit scrolls; the dock below the orbs
  // when there's room for it, else over the stage's bottom (.ovl) — never out of sight
  function fitStage() {
    const sh = refs.dock, st = refs.stage; if (!st) return;
    const open = sh && !sh.hidden;
    if (sh) { cls(sh, "ovl", false); sh.hidden = true; }
    cls(st, "tight", false);
    if (st.scrollHeight > st.clientHeight + 1) cls(st, "tight", true);
    if (sh) sh.hidden = !open;
    if (open && st.scrollHeight > st.clientHeight + 1) cls(sh, "ovl", true);
  }
  function armDockTimer() { clearTimeout(dockT); if (dockId) dockT = setTimeout(() => { if (drag) return armDockTimer(); openDock(null); }, DOCK_IDLE); }

  function patchMachine(el, vm) {
    setState(el, vm.st, ST);
    txt(K(el, "badge"), vm.badge); txt(K(el, "big"), vm.big); txt(K(el, "unit"), vm.bigUnit || ""); txt(K(el, "sub"), vm.sub); txt(K(el, "disp"), vm.disp);
    if (vm.eta != null) txt(K(el, "eta"), vm.eta);
    const ring = K(el, "ring"); if (ring) prop(ring, "stroke-dashoffset", `${100 - vm.pct}px`);
    const pb = K(el, "pbar"); if (pb) prop(pb, "--p", (clamp(vm.pct || 0, 0, 100) / 100).toFixed(3));
  }
  function patchMachines(m) {
    let run = 0; const extra = [];
    m.machines.forEach((x) => {
      const el = refs.mach.get(x.key); if (!el) return;
      switch (x.type) {
        case "fan": {
          const d = x.d, sp = lc(d.speed), on = !!d.on && sp !== "off";
          const spd = on ? (["low", "medium", "high"].includes(sp) ? sp : "medium") : "off";
          setState(el, on ? "run" : "idle", ST); prop(el, "--spin", { low: "1.8s", medium: "1s", high: ".55s" }[spd] || "1s");
          txt(K(el, "badge"), on ? (spd === "medium" ? T("rg.medium") : cap(spd)) : d.unknown ? T("rg.unknown") : T("rg.off")); cls(el, "unk", !on && !!d.unknown);
          el.querySelectorAll("[data-sp]").forEach((b) => cls(b, "cur", b.dataset.sp === spd));
          if (on) run++; break;
        }
        case "plugfan": {
          const d = x.d, on = !!d.on;
          setState(el, on ? "run" : "idle", ST); prop(el, "--spin", "0.8s");
          txt(K(el, "badge"), on ? T("rg.on") : d.unknown ? T("rg.unknown") : T("rg.off")); cls(el, "unk", !on && !!d.unknown);
          el.querySelectorAll("[data-sp]").forEach((b) => cls(b, "cur", b.dataset.sp === (on ? "on" : "off")));
          if (on) run++; break;
        }
        case "purifier": {
          const a = A(x.t), on = dysonOn(a), sp = parseInt(a.fanSpeed, 10), osc = lc(a.oscillation) === "on", aqi = num(a.airQualityIndex);
          setState(el, on ? "run" : "idle", ST); cls(el, `${P}-on`, on);
          txt(K(el, "badge"), on ? T("rg.on") : T("rg.off")); txt(K(el, "big"), on ? (Number.isFinite(sp) ? T("rg2.speed", { n: sp }) : T("rg.auto")) : T("rg.standby")); txt(K(el, "unit"), "");
          txt(K(el, "sub"), on ? T(osc ? "rg2.purifyingOsc" : "rg2.purifying") : T("rg.resting"));
          prop(el, "--air", `${on && Number.isFinite(sp) ? clamp(2.4 - sp * 0.18, 0.6, 2.4) : 1.6}s`);
          const band = aqi == null ? ["—", "#a99fd0"] : aqi <= 3 ? ["Good", "#34d399"] : aqi <= 6 ? ["Fair", "#fbbf24"] : ["Poor", "#fb7185"];
          txt(K(el, "aqv"), aqi != null ? Math.round(aqi) : "—"); txt(K(el, "aqt"), T("rg2.air", { band: band[0] })); prop(el, "--aq", band[1]);
          const auto = str(a.fanMode).trim().toUpperCase() === "AUTO";
          el.querySelectorAll("[data-pm]").forEach((b) => cls(b, "cur", b.dataset.pm === "off" ? !on : b.dataset.pm === "auto" ? on && auto : false));
          if (on) run++; break;
        }
        case "washer": case "dryer": { const vm = laundryVM(x.t, x.type); patchMachine(el, vm); cls(el, `${P}-spin`, vm.spin); if (vm.st === "run") run++; if (vm.st === "done") extra.push(`${x.type} done`); break; }
        case "dishwasher": { const vm = dishVM(x.t); patchMachine(el, vm); if (vm.st === "run") run++; break; }
        case "microwave": { const vm = microVM(x.t); patchMachine(el, vm); if (vm.st === "run") run++; if (vm.st === "done") extra.push("food ready"); break; }
        case "oven": {
          const ov = ovenVM(x.t);
          setState(el, ov.st, ST); cls(el, `${P}-ovon`, ov.on);
          txt(K(el, "badge"), ov.badge); txt(K(el, "big"), ov.big); txt(K(el, "sub"), ov.sub); txt(K(el, "disp"), ov.disp);
          prop(K(el, "tfill"), "--f", ov.fill.toFixed(3));
          for (let i = 0; i < 4; i++) cls(K(el, "b" + i), "lit", i < ov.burners);
          if (ov.st === "run") run++; break;
        }
        case "fridge": {
          const fr = fridgeVM(x.t);
          setState(el, fr.st, ST); cls(el, `${P}-fopen`, fr.open); cls(el, `${P}-ffopen`, fr.fOpen);
          txt(K(el, "badge"), fr.badge);
          const c = K(el, "cool"), f = K(el, "frz");
          txt(c, fr.cool != null ? `${Math.round(fr.cool)}°` : "—"); txt(f, fr.frz != null ? `${Math.round(fr.frz)}°` : "—");
          cls(c, "bad", fr.cool > 41); cls(f, "bad", fr.frz > 5);
          txt(K(el, "dc"), fr.cool != null ? `${Math.round(fr.cool)}°` : "--"); txt(K(el, "df"), fr.frz != null ? `${Math.round(fr.frz)}°` : "--");
          txt(K(el, "sub"), fr.open ? T("rg.doorIsOpenCloseIt") : fr.fOpen ? T("rg.freezerDrawerIsOpen") : fr.warm ? T("rg.warmerThanItShouldBe") : fr.power != null ? T("rg2.doorsClosedW", { w: Math.round(fr.power) }) : T("rg2.doorsClosed"));
          if (fr.open || fr.fOpen) extra.push("fridge open"); break;
        }
      }
    });
    txt(K(root, "msum"), [run ? T("rg2.nRunning", { n: run }) : T("rg.allIdle"), ...extra].join(" · "));
  }

  function patchHeader(m) {
    const c = climateOf(m), cl = K(root, "clim");
    if (cl) { cl.hidden = !c || c.t == null; if (c && c.t != null) html(cl, `${glyph("climate", 22)}<span class="num">${esc(T(`rg2.climate${c.h != null ? "Hum" : ""}${c.out ? "Out" : ""}`, { t: Math.round(c.t), h: c.h != null ? Math.round(c.h) : "" }))}</span>`); }
    const lit = m.lights.filter((d) => lookFor(d).on).length, lch = K(root, "lchip");
    if (lch) { lch.hidden = !m.lights.length; cls(lch, "on", lit > 0); html(lch, `${ic("bulb", 22)}<span>${esc(lit ? T("rg2.lightsOnOf", { lit, n: m.lights.length }) : T("rg2.lightsOff", { n: m.lights.length }))}</span>`); }
    m.windows.forEach((w, i) => {
      const el = root.querySelector(`[data-win="${sel(w.id)}"]`); if (!el) return;
      const open = winOpen(w, i), n = nice(w.name, m.name), label = lc(n) === lc(m.name) ? T("rg.window") : n;
      cls(el, "warn", open); html(el, `${glyph("window", 22).replace(`class="${P}-sash" d="M4 3l7 4v14" opacity="0"`, `class="${P}-sash" d="M4 3l7 4v14" opacity="${open ? 1 : 0}"`)}<span>${esc(T(open ? "rg2.windowOpen" : "rg2.windowClosed", { name: label }))}</span>`);
    });
    const dm = K(root, "demo"); if (dm) dm.hidden = !demo;
    const et = K(root, "etemp"); if (et) html(et, c && c.t != null ? `${Math.round(c.t)}°${c.h != null ? `<small>${Math.round(c.h)}%</small>` : ""}` : "");
    html(K(root, "clock"), `${esc(safe(() => Home.time(), ""))}<small>${esc(safe(() => Home.ampm(), ""))}</small>`);
    fitChips();
  }
  // a chip that doesn't fit the header is left out whole, and the ones after it (never cut through its text: "Window clo")
  function fitChips() {
    const box = root && root.querySelector(`.${P}-chips`); if (!box) return;
    const cs = [...box.children], end = box.getBoundingClientRect().right + 1; let gone = false;
    cs.forEach((c) => { c.style.visibility = ""; });
    cs.forEach((c) => { if (!c.hidden && (gone || c.getBoundingClientRect().right > end)) { c.style.visibility = "hidden"; gone = true; } });
  }

  // "At a glance": keyed rows, reconciled in place (rows that ping keep running; nothing is rebuilt on a text change)
  function glRow(r) {
    return `<div class="${P}-gr" data-g="${esc(r.key)}"${r.act ? ` data-act="${esc(r.act)}" role="button"` : ""}><span class="${P}-gi"><span data-k="gi"></span>${r.ping ? `<i class="${P}-gp"></i>` : ""}</span>
      <span class="${P}-gt"><b data-k="l"></b><small data-k="s"></small></span><b class="${P}-gv" data-k="v"></b>
      ${r.lockId != null || /^lo/.test(r.key) ? `<button class="${P}-glk" data-k="lk" data-act="lock:${esc(r.key.slice(2))}" hidden>${glyph("lock", 22)}${esc(T("rg2.lock"))}</button>` : ""}</div>`;
  }
  function patchGlance(m) {
    const box = refs.gl; if (!box) return;
    const items = glanceItems(m), rows = glanceRows(items);
    const att = items.filter((it) => it.tone === "bad" || it.tone === "warn").length;
    txt(K(root, "gsum"), !items.length ? "" : att ? T("rg2.toCheck", { n: att }) : T("rg2.allGood"));
    // GPU rule: rows are never removed or moved in the DOM (that drops / re-creates their layers). A row whose key leaves
    // the set stays in place as "gone" (height 0, opacity 0, no animation); the order comes from CSS `order`.
    if (!box._rows) { box._rows = new Map(); box.innerHTML = `<div class="${P}-gnone" data-k="gnone" hidden></div>`; box._none = box.firstElementChild; box._sig = null; }
    const none = box._none;
    none.hidden = rows.length > 0;
    if (!rows.length) html(none, `<span class="${P}-gi" style="--tone:var(--muted)">${glyph("check", 24)}</span><span>${esc(T(climateOf(m) ? "rg2.noSensorsTemp" : "rg2.noSensors", { room: m.name }))}</span>`);
    const sig = rows.map((r) => r.key).join(",");
    if (box._sig !== sig) {
      const first = box._sig == null;
      rows.forEach((r) => {
        let el = box._rows.get(r.key);
        if (!el) { const t = document.createElement("div"); t.innerHTML = glRow(r); el = t.firstElementChild; box.appendChild(el); box._rows.set(r.key, el); if (!first) requestAnimationFrame(() => nudge(el, SLIDE, 420)); }
        else if (el.classList.contains("gone") && !first) requestAnimationFrame(() => nudge(el, SLIDE, 420));
        if (r.ping && !el.querySelector(`.${P}-gp`)) { const gi = el.querySelector(`.${P}-gi`); if (gi) gi.insertAdjacentHTML("beforeend", `<i class="${P}-gp"></i>`); }
      });
      cls(box, "dense", rows.length >= 7);
      if (!first) requestAnimationFrame(() => { try { fitRecent(); } catch (e) { /* ignore */ } });
      box._sig = sig;
    }
    const keep = new Set(rows.map((r) => r.key));
    box._rows.forEach((el, k) => { if (!keep.has(k)) { const c = `${P}-gr gone`; if (el.className !== c) el.className = c; el._tone = null; prop(el, "order", 999); } });
    rows.forEach((r, i) => {
      const el = box._rows.get(r.key); if (!el) return;
      prop(el, "order", i);
      const c = `${P}-gr t-${r.tone}${r.live ? " live" : ""}${r.ring ? " ring" : ""}${r.open ? " open" : ""}`;
      if (el.className !== c) { const was = el._tone; el.className = c; if (was != null && was !== r.tone) nudge(el); }
      el._tone = r.tone;
      html(K(el, "gi"), glyph(r.g, 26)); txt(K(el, "l"), r.l); txt(K(el, "s"), r.s || ""); txt(K(el, "v"), r.v);
      const lk = K(el, "lk"); if (lk) lk.hidden = r.lockId == null;
    });
  }
  function patchSide(m) {
    patchGlance(m);
    m.modes.forEach((t) => cls(root.querySelector(`[data-mode="${sel(t.id)}"]`), "on", lc(A(t).switch) === "on"));
    [...m.plugs, ...m.shades].forEach((d) => {
      const el = root.querySelector(`[data-dev="${sel(d.id)}"]`); if (!el) return;
      if (d.kind === "shade") {
        const l = clamp(num(d.level) ?? 0, 0, 100);
        txt(K(el, "st"), l >= 100 ? T("rg.open") : l > 0 ? T("rg2.pctOpen", { n: Math.round(l) }) : T("rg.closed"));
        prop(el.querySelector(`.${P}-fabric`), "--f", (1 - l / 100 * 0.85).toFixed(2));
        // the window covering's drawing: --pos on its <svg> (0 closed … 1 open) from the position (the tilt blind: its
        // tilt, else the position), set on the drawing already there so it slides; unknown → off, it follows on / off
        const wsv = el.dataset.wct ? el.querySelector(".xa-svg") : null;
        if (wsv) {
          const tilt = el.dataset.wct === "tilt" && window.Home && Home.attr ? num(Home.attr(d.id, "tilt")) : null;
          const p = d.unknown ? null : tilt != null ? clamp(tilt, 0, 100) / 100 : num(d.level) != null ? l / 100 : null;
          if (p == null) wsv.style.removeProperty("--pos"); else prop(wsv, "--pos", p.toFixed(3));
          cls(el.querySelector(`.${P}-wc`), "xa-on", l > 0);
        }
        el.querySelectorAll("[data-l]").forEach((b) => cls(b, "cur", Math.abs(+b.dataset.l - l) < 17));
      } else {
        const on = !!d.on;
        if (el._on != null && el._on !== on) nudge(el); el._on = on;
        const fan = m.fanSet.includes(d);
        const st = OPENS.includes(d.kind) ? (on ? T("rg.open") : d.unknown ? T("rg.unknown") : T("rg.closed")) : on ? T("rg.on") : d.unknown ? T("rg.unknown") : T("rg.off"); cls(el, "unk", !on && !!d.unknown);
        // (an outlet that measures its power: the watts too — "is the washer still running?")
        const w = num(safe(() => Home.reading(d.id, "power"), null)), pw = w != null && (on || w > 0) ? ` · ${Math.round(w)} W` : "";
        cls(el, "on", on); cls(el.querySelector(".switch"), "on", on); txt(K(el, "st"), TOGGLE_KINDS.includes(d.kind) ? (fan ? T("rg2.withFan", { state: `${st}${pw}` }) : `${st}${pw}`) : T("rg2.statusOnly", { state: `${st}${pw}` }));
      }
    });
    patchRecent(m);
  }

  // ---------- "Recently" ----------
  function demoEvents(m) {
    const out = [], t0 = demoStart, add = (ref, mins, e) => out.push({ id: `demo${out.length}`, ref, at: t0 - mins * 60000, ...e });
    const th = (k) => m.things.filter((t) => t.kind === k);
    th("motion").forEach((t) => add("t" + t.id, 1.5, { kind: "motion", g: "motion", tone: "live", text: T("rg.motionSeen"), sub: T("rg.motionSensor") }));
    th("garage").forEach((t) => add("t" + t.id, 0, { kind: "garage", g: "garage", tone: "warn", text: T("rg.garageDoorOpened") }));
    th("fridge").forEach((t) => add("t" + t.id, 0.5, { kind: "door", g: "door", tone: "warn", text: T("rg.fridgeDoorOpened") }));
    if (m.windows[0]) { const w = m.windows[0], n = nice(w.name, m.name); add("w" + w.id, 4, { kind: "win", g: "window", tone: "warn", text: T("rg2.windowOpened", { name: lc(n) === lc(m.name) ? T("rg.window") : T("rg2.windowOf", { name: n }) }) }); }
    const traps = th("vibration"); const hit = traps.find((t) => /#2/.test(t.name)) || traps[1];
    if (hit) add("t" + hit.id, 3, { kind: "trap", g: "trap", tone: "bad", text: T("rg2.trapOff", { name: str(hit.name).replace(/mouse trap\s*/i, T("rg.trap") + " ") }) });
    th("oven").forEach((t) => add("t" + t.id, 6, { kind: "mach", g: "flame", tone: "live", text: T("rg.ovenOn"), sub: T("rg.bake375") }));
    th("microwave").forEach((t) => add("t" + t.id, 9, { kind: "mach", g: "check", tone: "ok", text: T("rg.microwaveFinished"), sub: T("rg.foodIsReady") }));
    th("dishwasher").forEach((t) => add("t" + t.id, 21, { kind: "mach", g: "play", tone: "live", text: T("rg.dishwasherStarted"), sub: "Normal" }));
    th("washer").forEach((t) => add("t" + t.id, 34, { kind: "mach", g: "play", tone: "live", text: T("rg.washerStarted"), sub: "Normal" }));
    th("dryer").forEach((t) => add("t" + t.id, 12, { kind: "mach", g: "play", tone: "live", text: T("rg.dryerStarted"), sub: "Towels" }));
    th("purifier").forEach((t) => add("t" + t.id, 45, { kind: "mach", g: "air", tone: "live", text: T("rg.airPurifierOn") }));
    if (m.doors[0]) { const d = m.doors[0], o = !!d.open; add("d" + d.id, o ? 7 : 15, { kind: "door", g: "door", tone: o ? "warn" : "ok", text: o ? T("rg.doorOpened") : T("rg.doorClosed"), sub: doorLabel(d, m) }); }
    if (m.locks[0]) { const l = m.locks[0]; add("l" + l.id, 26, { kind: "lock", g: "lock", tone: "ok", text: `${lockLabel(l, m)} locked` }); }
    return out;
  }
  function stillLive(e, m) {
    const id = e.ref.slice(1), t = e.ref[0] === "t" ? m.things.find((x) => String(x.id) === id) : null;
    switch (e.kind) {
      case "motion": return !!t && lc(A(t).motion) === "active";
      case "trap": return !!t && lc(A(t).acceleration) === "active";
      case "garage": return !!t && /open/.test(lc(A(t).door || A(t).contact)) && /opened/.test(e.text);
      case "win": { const i = m.windows.findIndex((w) => String(w.id) === id); return i >= 0 && winOpen(m.windows[i], i) && /opened/.test(e.text); }
      case "door": { if (t) return lc(A(t).contact) === "open" && /opened/.test(e.text); const d = [...m.doors, ...(m.overhead ? [m.overhead] : [])].find((x) => String(x.id) === id); return !!d && !!d.open && /opened/.test(e.text); }
      case "alert": { if (e.tone !== "bad") return false; if (t) return !/^(off|none|)$/i.test(str(A(t).alarm)); const s = m.sensors.find((x) => String(x.id) === id); return !!s && s.state === "detected"; }
      case "mach": {
        if (!t || e.tone !== "live") return false;
        if (t.kind === "oven") return ovenVM(t).on;
        if (t.kind === "purifier") return dysonOn(A(t));
        const vm = t.kind === "dishwasher" ? dishVM(t) : t.kind === "microwave" ? microVM(t) : laundryVM(t, t.kind);
        return vm.st === "run";
      }
      default: return false;
    }
  }
  // GPU rule: the timeline is a FIXED pool of rows (built once per rebuild) patched by position — a new or merged event
  // changes the rows' content, never adds / removes / moves a row node (that would drop and re-create its layer)
  const EV_POOL = 5;
  function evSlot() {
    return `<div class="${P}-ev gone"><span class="${P}-evi"><i class="${P}-evp"></i><svg class="${P}-g" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="${P}-evg"></g></svg></span>
      <span class="${P}-evt"><b data-k="et"></b><span data-k="es"></span></span><span class="${P}-eva"><b class="num" data-k="ea"></b><span class="num" data-k="eh"></span></span></div>`;
  }
  function patchRecent(m) {
    const box = refs.tll; if (!box) return;
    const R = roomRefs(m), now = Date.now();
    let evs = demo ? demoEvents(m).sort((a, b) => b.at - a.at) : EVENTS.filter((e) => R.has(e.ref));
    evs = evs.slice(0, clamp(recentCap, 1, EV_POOL));
    txt(refs.rsince, T("rg2.since", { time: sinceAt(demo ? demoStart - 60 * 60000 : pageStart) }));
    if (!box._pool) {
      box.innerHTML = `<div class="${P}-quiet" hidden><span class="${P}-evi">${glyph("clock", 24)}</span><span>${esc(T("rg2.quietRoom"))}</span></div>${Array.from({ length: EV_POOL }, evSlot).join("")}`;
      box._quiet = box.firstElementChild;
      box._pool = [...box.querySelectorAll(`.${P}-ev`)];
      box._pool.forEach((el) => { el._g = el.querySelector(`.${P}-evg`); el._id = null; });
      box._ids = null;
    }
    box._quiet.hidden = evs.length > 0;
    const first = box._ids == null, prevIds = new Set(box._ids || []);
    box._ids = evs.map((e) => String(e.id));
    const seenRef = new Set();
    box._pool.forEach((el, i) => {
      const e = evs[i];
      if (!e) { const c = `${P}-ev gone`; if (el.className !== c) el.className = c; el._id = null; return; }
      const id = String(e.id);
      if (el._id !== id) { if (i === 0 && !first && !prevIds.has(id)) requestAnimationFrame(() => nudge(el, SLIDE, 420)); el._id = id; }
      html(el._g, GL[e.g] || GL.check);
      const newest = !seenRef.has(e.ref); seenRef.add(e.ref);
      const live = newest && stillLive(e, m);
      const c = `${P}-ev t-${e.tone || "idle"} k-${e.kind}${live ? " live" : ""}${i === 0 ? " first" : ""}`;   // i18n-ok (class names)
      if (el.className !== c) el.className = c;
      txt(K(el, "et"), e.n > 1 ? `${e.text} · ${e.n}×` : e.text); txt(K(el, "es"), e.sub || "");
      txt(K(el, "ea"), ago(e.at, now)); txt(K(el, "eh"), hhmm(e.at));
    });
  }
  // show as many timeline rows as fit under the status rows without scrolling (1–5); none fit → the card steps aside
  // (visibility + absolute, so its rows keep their layers). Measured from the space between the block above it and the
  // column's bottom edge — re-run on rebuild / resize / when the number of status rows changes.
  const EV_H = 48, REC_FIXED = 50;
  function fitRecent() {
    const side = refs.side, box = refs.tll, rec = box && box.parentElement; if (!side || !box || !last || !rec) return;
    const prev = rec.previousElementSibling; if (!prev) return;
    const avail = side.getBoundingClientRect().bottom - 16 - (prev.getBoundingClientRect().bottom + 12);
    const n = Math.floor((avail - REC_FIXED) / EV_H);
    cls(rec, "off", n < 1);
    const cap = clamp(n, 1, 5);
    if (cap !== recentCap) { recentCap = cap; patchRecent(last); }
  }
  // side-scrolling rows: .ovf when the content is wider than the row (fades + touch pan-x), .atstart / .atend for the fades
  function rowEdges(rw) {
    const s = rw && rw._scr; if (!s) return;
    const ovf = s.scrollWidth > s.clientWidth + 2;
    cls(rw, "ovf", ovf); cls(rw, "atstart", s.scrollLeft <= 2); cls(rw, "atend", s.scrollLeft >= s.scrollWidth - s.clientWidth - 2);
  }
  // scene chips wider than their header: .ovf (scrolls, fade at the right), .atend once scrolled to the last chip
  function presetEdges(s) {
    const ovf = s.scrollWidth > s.clientWidth + 2;
    cls(s, "ovf", ovf); cls(s, "atend", s.scrollLeft >= s.scrollWidth - s.clientWidth - 2);
  }
  function fitRows() { (refs.rows || []).forEach(rowEdges); if (root) root.querySelectorAll(`.${P}-presets`).forEach(presetEdges); fitChips(); }

  // ---------- scenes (light scenes; fan scenes when the room has 2+ fans) ----------
  // Stored in Settings.v.scenes[roomId] = { lights: { bright: { at, lights: { id: { on, level, mode, ct, hue, sat } } }, … },
  // fans: { off: { at, fans: { id: { on, speed } } }, … } }. Demo: kept in memory only (never saved).
  const demoScenes = new Map();
  const sceneStore = () => (demo ? Object.fromEntries(demoScenes) : (safe(() => Settings.v.scenes, null) || {}));
  const savedScene = (kind, k) => { const r = sceneStore()[curRoom]; const s = r && r[kind] && r[kind][k]; return s && typeof s === "object" ? s : null; };
  function storeScene(kind, k, val) {
    const all = JSON.parse(JSON.stringify(sceneStore() || {}));
    const r = all[curRoom] && typeof all[curRoom] === "object" ? all[curRoom] : {};
    r[kind] = r[kind] && typeof r[kind] === "object" ? r[kind] : {};
    if (val) r[kind][k] = val; else delete r[kind][k];
    all[curRoom] = r;
    if (demo) { demoScenes.clear(); Object.entries(all).forEach(([a, b]) => demoScenes.set(a, b)); return true; }
    try { if (window.Settings && typeof Settings.set === "function") { Settings.set("scenes", all); return true; } } catch (e) { console.warn("rlG: saving the scene failed", e); }
    return false;
  }
  // lights a scene works on: groups are skipped when the room has member lights (as Layout D's presets)
  const sceneLights = (m) => (m.lights.filter((d) => !d.group).length ? m.lights.filter((d) => !d.group) : m.lights);
  // only values the light really reports are stored (lightLook's display defaults — level 100, 2700 K, hue 0 — never are)
  function snapLight(d) {
    const L = lightLook(d), o = { on: !!d.on }, lv = num(d.level), hue = num(d.hue), sat = num(d.sat), K = d.white ? kelvin(d.ct) : null;
    if (d.dim && lv != null) o.level = clamp(Math.round(lv), 1, 100);
    if (d.rgb && L.colour && hue != null) { o.mode = "RGB"; o.hue = Math.round(clamp(hue, 0, 100)); if (sat != null) o.sat = Math.round(clamp(sat, 0, 100)); }
    else if (d.white && !L.colour && K != null) { o.mode = T("rg.ct"); o.ct = K; }
    return o;
  }
  function snapFan(d) { return d.kind === "fan" ? { on: !!d.on && lc(d.speed) !== "off", speed: ["low", "medium", "high"].includes(lc(d.speed)) ? lc(d.speed) : "medium" } : { on: !!d.on }; }
  function lightSceneCmds(m, k) {
    const cmds = [], c = (...x) => cmds.push(x), s = savedScene("lights", k);
    sceneLights(m).forEach((d) => {
      const L = lightLook(d);
      if (s) {
        const v = s.lights && s.lights[String(d.id)]; if (!v || typeof v !== "object") return; // a light added after saving: left as is
        if (!v.on) { if (d.on) c("toggle", d.id); return; }
        if (d.dim && num(v.level) != null) c("setLevel", d.id, v.level); else if (!d.on) c("toggle", d.id);
        if (v.mode === "RGB" && d.rgb && num(v.hue) != null) c("setColor", d.id, v.hue, num(v.sat) ?? num(d.sat) ?? 100);
        else if (v.mode === "CT" && d.white && num(v.ct) != null) c("setColorTemp", d.id, v.ct);
        return;
      }
      // built-in defaults (Bright / Relax / Night light as Layout D; Cozy: warm and low)
      if (k === "bright") { if (d.dim) c("setLevel", d.id, 100); else if (!d.on) c("toggle", d.id); }
      else if (k === "relax") { if (d.dim) c("setLevel", d.id, 40); else if (!d.on) c("toggle", d.id); if (d.white && !L.colour) c("setColorTemp", d.id, 2700); }
      else if (k === "night") { if (d.dim) c("setLevel", d.id, 8); else if (d.on) c("toggle", d.id); if (d.white && !L.colour) c("setColorTemp", d.id, 2200); }
      else if (k === "cozy") { if (d.dim) c("setLevel", d.id, 55); else if (!d.on) c("toggle", d.id); if (d.white && !L.colour) c("setColorTemp", d.id, 2400); }
    });
    return cmds;
  }
  function fanSceneCmds(m, k) {
    const cmds = [], c = (...x) => cmds.push(x), s = savedScene("fans", k);
    m.fanSet.forEach((d) => {
      const isFan = d.kind === "fan", on = isFan ? !!d.on && lc(d.speed) !== "off" : !!d.on;
      let want;
      if (s) { const v = s.fans && s.fans[String(d.id)]; if (!v || typeof v !== "object") return; want = { on: !!v.on, speed: v.speed }; }
      else want = k === "off" ? { on: false } : k === "breeze" ? { on: true, speed: "low" } : k === "sleep" ? (isFan ? { on: true, speed: "low" } : { on: false }) : { on: true, speed: "high" };
      if (isFan) { const sp = want.on ? (["low", "medium", "high"].includes(want.speed) ? want.speed : "medium") : "off"; if (sp !== (on ? lc(d.speed) : "off")) c("setFan", d.id, sp); }
      else if (want.on !== on) c("toggle", d.id);
    });
    return cmds;
  }
  // a second scene tap within 1.5 s is ignored (no burst of repeated commands to the hub)
  const SCENE_GAP = 1500;
  let sceneAt = 0;
  function runScene(kind, k, name) {
    if (!last) return;
    const now = Date.now(); if (now - sceneAt < SCENE_GAP) return; sceneAt = now;
    const cmds = kind === "fans" ? fanSceneCmds(last, k) : lightSceneCmds(last, k);
    if (!cmds.length) { toast(T("rg2.alreadyLike", { name })); return; }
    sendBatch(cmds);
  }
  function paintScenes() {
    if (!root) return;
    root.querySelectorAll("[data-scene]").forEach((b) => { const [kind, k] = b.dataset.scene.split(":"); cls(b, "saved", !!savedScene(kind, k)); });
  }
  // the confirm sheet: "Save the room's lights as 'Cozy'?" — Save / Cancel / Reset to default (when customised)
  let sheetFor = null;
  function openSheet(kind, k, name) {
    const sh = refs.sheet; if (!sh || !last) return;
    sheetFor = { kind, k, name };
    const what = kind === "fans" ? last.fanSet : sceneLights(last);
    const onN = what.filter((d) => (d.kind === "fan" ? !!d.on && lc(d.speed) !== "off" : !!d.on)).length;
    txt(K(sh, "shT"), T(kind === "fans" ? "rg2.saveFans" : "rg2.saveLights", { name }));
    txt(K(sh, "shP"), T(kind === "fans" ? "rg2.storesFans" : "rg2.storesLights", { on: onN, off: what.length - onN, name }) + (demo ? ` ${T("rg2.demoPageOnly")}` : ""));
    K(sh, "shR").hidden = !savedScene(kind, k);
    sh.classList.add("show");
  }
  function closeSheet() { sheetFor = null; if (refs.sheet) refs.sheet.classList.remove("show"); }
  function sheetAct(a) {
    const f = sheetFor; if (!f || !last) { closeSheet(); return; }
    // never save before the live Hubitat state arrived: the static snapshot / defaults would be stored and sent on recall
    if (a === "save" && !demo && !safe(() => Home.hub.live, false)) { txt(K(refs.sheet, "shP"), T("rg.waitingForLiveDataFromHubitatTryAgainInA")); return; }
    closeSheet();
    if (a === "save") {
      const val = { at: Date.now() };
      if (f.kind === "fans") { val.fans = {}; last.fanSet.forEach((d) => { val.fans[String(d.id)] = snapFan(d); }); }
      else { val.lights = {}; sceneLights(last).forEach((d) => { val.lights[String(d.id)] = snapLight(d); }); }
      toast(storeScene(f.kind, f.k, val) ? T(demo ? "rg2.savedDemo" : "rg2.saved", { name: f.name }) : T("rg.couldntSaveTheScene"));
    } else if (a === "reset") { storeScene(f.kind, f.k, null); toast(T("rg2.backToDefault", { name: f.name })); }
    paintScenes();
  }

  function patch(m) {
    last = m;
    patchHeader(m); patchMachines(m); paintLights(m); patchSide(m);
  }
  function rebuild(m) {
    if (drag) endDrag(null, true);
    closeSheet();
    root.innerHTML = build(m);
    refs = { toast: K(root, "toast"), stage: K(root, "stage"), dock: K(root, "dock"), side: K(root, "side"), tll: K(root, "tll"), rsince: K(root, "rsince"),
      gl: K(root, "gl"), hint: K(root, "hint"), sheet: K(root, "sheet"),
      mach: new Map([...root.querySelectorAll("[data-m]")].map((el) => [el.dataset.m, el])) };
    refs.orbs = [...root.querySelectorAll("[data-light]")];
    refs.rows = [...root.querySelectorAll(`.${P}-rw`)];
    refs.rows.forEach((rw) => { rw._scr = rw.querySelector(`.${P}-scr`); });
    last = m;
    if (dockId && !m.lights.some((d) => String(d.id) === dockId)) dockId = null;
    patch(m);
    fitRows(); fitRecent(); fitStage(); observe();
  }
  // watch the page and each side-scrolling row (its width decides .ovf / the fades / touch-action)
  function observe() { if (!ro || !root) return; ro.disconnect(); ro.observe(root); (refs.rows || []).forEach((rw) => rw._scr && ro.observe(rw._scr)); }
  function safeUpdate() {
    if (!root) return;
    try {
      // no trackEvents() here: the page-life Home.onChange listener (registered before app.js's render) already ran it
      const m = model(curRoom);
      if (!m) { if (key !== "none") { key = "none"; root.innerHTML = `<div class="${P}-empty">${esc(T("rg2.unavailable"))}</div>`; refs = {}; } return; }
      const k = structKey(m);
      if (k !== key) { key = k; rebuild(m); } else patch(m);
    } catch (e) { console.warn("rlG: update failed", e); }
  }

  // ---------- touch ----------
  // Orbs: tap = on / off; press and slide up / down (dimmable lights) = brightness, live % on the orb, sent on release.
  // Along the ring like Layout A too, while the row doesn't scroll (in a scrolling row a sideways move is the row's).
  // A tap: released within TAP_MS and never more than TAP_SLOP from where it started, and the row did not scroll since
  // the press (or in the SCROLL_QUIET ms before it — a press that stops a fling) — Layout F's guard.
  const TAP_SLOP = 20, TAP_MS = 550, SCROLL_QUIET = 250, HOLD_SAVE = 800, EAT_FRESH = 300;
  let scrollAt = 0, downInfo = null, sceneHold = null, eatClick = 0;
  const onScroll = (e) => { const t = e.target; if (t && t.classList && t.classList.contains(`${P}-scr`)) { scrollAt = Date.now(); const rw = t.parentElement; if (rw) rowEdges(rw); } else if (t && t.classList && t.classList.contains(`${P}-presets`)) presetEdges(t); };
  function ringVal(g, x, y) {
    const a = (Math.atan2(y - g.cy, x - g.cx) * 180) / Math.PI;
    let t = (((a - 135) % 360) + 360) % 360;
    if (t > 270) t = t > 315 ? 0 : 270;
    return clamp(Math.round((t / 270) * 100), 1, 100);
  }
  function onRingBand(g, x, y) {
    const w = g.r.width, dist = Math.hypot(x - g.cx, y - g.cy);
    if (dist < w * 0.39 || dist > w * 0.56) return false;
    const t = (((((Math.atan2(y - g.cy, x - g.cx) * 180) / Math.PI) - 135) % 360) + 360) % 360;
    return t <= 274 || t >= 356;
  }
  const scrOf = (el) => el && el.closest && el.closest(`.${P}-scr`);
  function paintDrag() { if (last) paintLights(last); }
  // ---------- arranging this room's lights / devices (stage 4c): hold one still → panel PIN → they wiggle; drag
  // within its group; Done. The order is this panel's (Settings deviceOrder, data.js Home.devices). ----------
  const ARR_HOLD = 650, ARR_IDLE = 60000;
  let arrange = false, arrDrag = null, arrHold = null, arrHoldAt = null, arrTouched = 0, arrDone = null, arrLockHooked = false;
  const ARR_ITEM = `[data-light], .${P}-dev[data-dev]`;
  function saveArrange() {
    if (!root || !curRoom || !window.Settings) return;
    const ids = [...root.querySelectorAll(ARR_ITEM)].map((x) => Number(x.dataset.light || x.dataset.dev)).filter((n) => Number.isFinite(n));
    const all = { ...(Settings.v.deviceOrder || {}) };
    if (ids.length && JSON.stringify(all[curRoom] || []) !== JSON.stringify(ids)) { all[curRoom] = ids; Settings.set("deviceOrder", all); }
  }
  function endArrange(save = true) {
    clearTimeout(arrHold); arrHold = null;
    if (!arrange) return;
    if (save) saveArrange();
    arrange = false; arrDrag = null;
    if (root) root.classList.remove(`${P}-arranging`);
    if (arrDone) { arrDone.remove(); arrDone = null; }
    key = ""; safeUpdate();
  }
  async function startArrange() {
    if (arrange || !window.Settings || !Settings.unlockWithPin) return;
    if (!(await Settings.unlockWithPin(T("rg.arrangeThisRoom"))) || !root) return;
    if (!arrLockHooked && window.PinPad && PinPad.onLock) { arrLockHooked = true; PinPad.onLock(() => endArrange(true)); }
    arrange = true; arrTouched = Date.now();
    root.classList.add(`${P}-arranging`);
    arrDone = document.createElement("button");
    arrDone.className = `${P}-arrdone`; arrDone.textContent = T("rg.done2");
    arrDone.addEventListener("click", () => endArrange(true));
    document.body.appendChild(arrDone);
  }
  setInterval(() => { if (arrange && !arrDrag && Date.now() - arrTouched > ARR_IDLE) endArrange(true); }, 5000);
  // a finger let go anywhere (outside the room page too) ends a drag
  const arrRelease = (e) => { if (arrDrag && e.pointerId === arrDrag.pid) arrUp(e); };
  addEventListener("pointerup", arrRelease, true);
  addEventListener("pointercancel", arrRelease, true);
  // returns true when the press belongs to arranging (the normal handling is skipped)
  function arrDown(e) {
    const item = e.target.closest && e.target.closest(ARR_ITEM);
    clearTimeout(arrHold); arrHold = null;
    if (sheetFor || demo) return false;   // (a press that only closes the sheet; the demo saves nothing)
    if (arrange) {
      arrTouched = Date.now();
      if (!item || !root.contains(item)) return true;
      e.preventDefault();
      arrDrag = { el: item, pid: e.pointerId };
      item.classList.add("lifted");
      try { item.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      return true;
    }
    // (arranging is on the Manager page; on the wall only if that panel allows it)
    if (item && root.contains(item) && window.Settings && Settings.v.arrangeOnPanel === true) {
      const x0 = e.clientX, y0 = e.clientY, pid = e.pointerId;
      arrHold = setTimeout(() => {

        arrHold = null;
        if (drag && drag.pid === pid) drag = null;   // (a press that stayed still: no dimming, no toggle)
        eatClick = Date.now();
        startArrange();
      }, ARR_HOLD);
      arrHoldAt = { x0, y0, pid };
    }
    return false;
  }
  function arrMove(e) {
    if (arrHold && arrHoldAt && e.pointerId === arrHoldAt.pid && Math.hypot(e.clientX - arrHoldAt.x0, e.clientY - arrHoldAt.y0) > 12) {
      clearTimeout(arrHold); arrHold = null;
    }
    const g = arrDrag; if (!g || e.pointerId !== g.pid) return false;
    const box = g.el.parentElement;
    const over = [...box.children].find((x) => x !== g.el && x.matches(ARR_ITEM) && (() => {
      const q = x.getBoundingClientRect(); return e.clientX >= q.left && e.clientX <= q.right && e.clientY >= q.top && e.clientY <= q.bottom; })());
    if (over) {
      const q = over.getBoundingClientRect(), wide = q.width >= q.height * 1.6;   // a row (top / bottom half) or an orb (left / right)
      const before = wide ? e.clientY < q.top + q.height / 2 : e.clientX < q.left + q.width / 2;
      box.insertBefore(g.el, before ? over : over.nextSibling);
      try { g.el.setPointerCapture(g.pid); } catch (err) { /* moving it dropped the capture: take it again */ }
    }
    const scr = box.closest(`.${P}-scr`);
    if (scr) { const r = scr.getBoundingClientRect(); if (e.clientX < r.left + 50) scr.scrollLeft -= 12; else if (e.clientX > r.right - 50) scr.scrollLeft += 12; }
    return true;
  }
  function arrUp(e) {
    if (arrHold && arrHoldAt && e.pointerId === arrHoldAt.pid) { clearTimeout(arrHold); arrHold = null; }
    const g = arrDrag; if (!g || e.pointerId !== g.pid) return false;
    g.el.classList.remove("lifted"); arrDrag = null; arrTouched = Date.now();
    return true;
  }

  function onDown(e) {
    if (!root || (e.button != null && e.button > 0)) return;
    if (arrDown(e)) return;
    // (v3.0.2) hold an orb still = the light's pop-up (on / off, brightness, white, colour: grid.js), as on every room look;
    // a tap still switches it, a slide still dims it. Not where arranging is allowed on this panel: there a hold arranges.
    const ho = !arrHold && !sheetFor && window.Grid && Grid.longPress && e.target.closest && e.target.closest("[data-light]");
    // (v3.0.2: not on the ring band of a light that dims — there the press is the ring drag ("arm" below), a still finger included)
    const ow0 = ho && e.target.closest(`.${P}-ow`), rw0 = ow0 && ow0.closest(`.${P}-rw`), r0 = ow0 && ow0.getBoundingClientRect();
    const ring = !!(r0 && !(rw0 && rw0.classList.contains("ovf")) && onRingBand({ r: r0, cx: r0.left + r0.width / 2, cy: r0.top + r0.height / 2 }, e.clientX, e.clientY));
    if (ho && root.contains(ho)) { const hd = devById(ho.dataset.light); if (hd && Grid.holdable(hd.id) && !(ring && hd.dim)) Grid.longPress(e, ho, () => { drag = null; Grid.holdDev(ho, hd.id); }); }
    // a long press that opened the sheet may get no click on Android: a stale "eat the next click" must not swallow the
    // next real tap (e.g. Save) — a new press more than EAT_FRESH ms after it was armed clears it
    if (eatClick && Date.now() - eatClick > EAT_FRESH) eatClick = 0;
    if (dockId) armDockTimer();
    const t = e.target, scr = scrOf(t);
    // the scene sheet is open and this press is outside it: the press only cancels the sheet — no toggle, no dimming,
    // no slider / wheel drag, no scene hold; the click that follows is swallowed
    if (sheetFor && !(t.closest && t.closest(`.${P}-sheet`))) { closeSheet(); eatClick = Date.now(); downInfo = null; return; }
    downInfo = { scr, left: scr ? scr.scrollLeft : 0, fling: Date.now() - scrollAt < SCROLL_QUIET, x: e.clientX, y: e.clientY, pid: e.pointerId };
    // scenes: press and hold = save
    const sb = t.closest(`[data-scene]`);
    if (sb && root.contains(sb)) {
      clearTimeout(sceneHold && sceneHold.timer);
      const [kind, k] = sb.dataset.scene.split(":");
      sceneHold = { b: sb, pid: e.pointerId, x0: e.clientX, y0: e.clientY, timer: setTimeout(() => { if (!sceneHold) return; sb.classList.remove("hold"); sceneHold = null; eatClick = Date.now(); openSheet(kind, k, sb.dataset.name || k); }, HOLD_SAVE) };
      sb.classList.add("hold");
      return;
    }
    if (drag) return;
    const ow = t.closest(`.${P}-ow`), sl = t.closest(`.${P}-sl`), wh = t.closest(`.${P}-wheel`);
    if (!ow && !sl && !wh) return;
    const host = ow || sl || wh, r = host.getBoundingClientRect();
    const id = ow ? ow.closest("[data-light]").dataset.light : dockId, d = devById(id);
    if (!d) return;
    const L = lightLook(d);
    drag = { id: String(d.id), d, el: host, orb: ow ? ow.closest("[data-light]") : null, pid: e.pointerId, x0: e.clientX, y0: e.clientY, t0: Date.now(), r, cx: r.left + r.width / 2, cy: r.top + r.height / 2, moved: false, far: false };
    try { host.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (ow) {
      const rw = ow.closest(`.${P}-rw`), scrolls = !!(rw && rw.classList.contains("ovf"));
      drag.type = "orb"; drag.startLv = L.on ? L.level : 0; drag.val = L.level; drag.scr = scr; drag.left = scr ? scr.scrollLeft : 0; drag.fling = downInfo.fling;
      drag.mode = d.dim && !scrolls && onRingBand(drag, e.clientX, e.clientY) ? "arm" : "pending";
      if (!scrolls) e.preventDefault(); // a scrolling row keeps its native sideways pan
    } else { e.preventDefault(); if (sl) { drag.type = sl.dataset.sl; drag.sat = L.sat > 20 ? Math.round(L.sat) : 100; slMove(e); } else { drag.type = "wheel"; wheelMove(e); } }
  }
  function slMove(e) {
    const g = drag, t = clamp((e.clientX - g.r.left - 31) / Math.max(1, g.r.width - 62), 0, 1);
    if (g.type === "lvl") { g.val = Math.round(1 + t * 99); g.ov = { on: true, level: g.val }; }
    else if (g.type === "hue") { g.val = Math.min(99, Math.round(t * 100)); g.ov = { on: true, hue: g.val, sat: g.sat, mode: "RGB" }; }
    else { g.val = Math.round((2000 + t * 4500) / 50) * 50; g.ov = { on: true, ct: g.val, mode: T("rg.ct") }; }
    paintDrag();
  }
  function wheelMove(e) {
    const g = drag, dx = e.clientX - g.cx, dy = e.clientY - g.cy, R = g.r.width / 2;
    const deg = (((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360;
    g.hue = Math.round(deg / 3.6) % 100; g.sat = clamp(Math.round((Math.hypot(dx, dy) / R) * 100), 0, 100);
    g.ov = { on: true, hue: g.hue, sat: g.sat, mode: "RGB" };
    paintDrag();
  }
  function onMove(e) {
    if (arrMove(e)) return;
    if (sceneHold && e.pointerId === sceneHold.pid && Math.hypot(e.clientX - sceneHold.x0, e.clientY - sceneHold.y0) > TAP_SLOP) { clearTimeout(sceneHold.timer); sceneHold.b.classList.remove("hold"); sceneHold = null; }
    const g = drag; if (!g || e.pointerId !== g.pid) return;
    if (g.type === "orb") {
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (!g.moved && Math.hypot(dx, dy) > 10) g.moved = true;
      if (Math.hypot(dx, dy) > TAP_SLOP) g.far = true;
      if (g.mode === "pending" && g.d.dim && Math.abs(dy) > Math.abs(dx) * 1.2 && Math.abs(dy) > 20) g.mode = "rel"; // clearly vertical → dim
      else if (g.mode === "pending" && Math.abs(dx) > 20 && Math.abs(dx) >= Math.abs(dy)) g.mode = "side";          // sideways: never a tap, never a level
      else if (g.mode === "arm") { // clearly along the ring (tangential, not radial) → ring drag
        const a = Math.atan2(g.y0 - g.cy, g.x0 - g.cx), tan = -dx * Math.sin(a) + dy * Math.cos(a), rad = dx * Math.cos(a) + dy * Math.sin(a);
        if (Math.abs(tan) > 14 && Math.abs(tan) > Math.abs(rad)) g.mode = "ring";
      }
      if (g.mode === "ring") g.val = ringVal(g, e.clientX, e.clientY);
      else if (g.mode === "rel") { const v = Math.round(g.startLv + (-dy / 160) * 100); g.val = v < 1 ? 0 : Math.min(100, v); }   // (past the bottom: off, 0)
      else return;
      g.ov = { on: g.val > 0, level: Math.max(1, g.val) }; paintDrag();
    } else if (g.type === "wheel") wheelMove(e);
    else slMove(e);
  }
  function endDrag(e, cancelled) {
    const g = drag; if (!g || (e && e.pointerId !== g.pid)) return;
    drag = null;
    const d = devById(g.id) || g.d, L = lightLook(d);
    if (!cancelled && e) {
      if (g.type === "orb") {
        const scrolled = g.fling || (g.scr && g.scr.scrollLeft !== g.left) || Date.now() - scrollAt < SCROLL_QUIET;
        if ((g.mode === "pending" || g.mode === "arm") && !g.far && !scrolled && Date.now() - g.t0 <= TAP_MS && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) <= TAP_SLOP) send("toggle", d.id);
        else if (g.mode === "rel" && !L.on && e.clientY >= g.y0) { /* dragged down on an off light: stays off */ }
        else if (g.mode === "rel" && g.val === 0) { if (L.on && !scrolled) send("toggle", d.id); }   // (all the way down: off, not 1 %)
        else if ((g.mode === "ring" || g.mode === "rel") && !scrolled && (g.val !== L.level || !L.on)) send("setLevel", d.id, g.val);
      } else if (g.type === "lvl" && (g.val !== L.level || !L.on)) send("setLevel", d.id, g.val);
      else if (g.type === "ct" && g.val != null) { showUI(d.id, T("rg.ct")); send("setColorTemp", d.id, g.val); }
      else if (g.type === "hue" && g.val != null) { showUI(d.id, "RGB"); send("setColor", d.id, g.val, g.sat); }
      else if (g.type === "wheel" && g.hue != null) { showUI(d.id, "RGB"); send("setColor", d.id, g.hue, g.sat); }
    }
    if (last) paintLights(last);
  }
  function onUp(e) { if (arrUp(e)) return; if (sceneHold && e.pointerId === sceneHold.pid) { clearTimeout(sceneHold.timer); sceneHold.b.classList.remove("hold"); sceneHold = null; } endDrag(e, false); }
  function onCancel(e) { if (arrUp(e)) return; if (sceneHold && e.pointerId === sceneHold.pid) { clearTimeout(sceneHold.timer); sceneHold.b.classList.remove("hold"); sceneHold = null; } endDrag(e, true); }
  // a click inside a side-scrolling row that scrolled since the press (or was flinging) is not a tap
  function clickScrolled(t) {
    const scr = scrOf(t); if (!scr) return false;
    if (!downInfo || downInfo.scr !== scr) return Date.now() - scrollAt < SCROLL_QUIET;
    return downInfo.fling || scr.scrollLeft !== downInfo.left || Date.now() - scrollAt < SCROLL_QUIET;
  }
  function onClick(e) {
    if (!root) return;
    if (arrange) { e.preventDefault(); e.stopPropagation(); return; }   // (arranging: taps don't switch anything)
    if (eatClick) { const fresh = Date.now() - eatClick < 1500; eatClick = 0; if (fresh) return; } // the click that ends a hold-to-save press
    if (sheetFor && !e.target.closest(`.${P}-sheet`)) { closeSheet(); return; } // a tap outside the sheet = cancel
    if (clickScrolled(e.target)) return;
    const sb = e.target.closest("[data-scene]");
    if (sb && root.contains(sb)) { const [kind, k] = sb.dataset.scene.split(":"); runScene(kind, k, sb.dataset.name || k); return; }
    const b = e.target.closest("[data-act]");
    if (b && root.contains(b)) {
      const [act, a1, a2, a3] = b.dataset.act.split(":");
      const d = a1 != null ? devById(a1) : null;
      switch (act) {
        case "all": allLights(a1 === "1"); break;
        case "name": if (d) openDock(dockId === String(d.id) ? null : d.id); break;
        case "dock": openDock(null); break;
        case "sh": sheetAct(a1); break;
        case "tog": if (d) send("toggle", d.id); break;
        case "fan": if (d) send("setFan", d.id, a2); break;
        case "pfan": if (d && !!d.on !== (a2 === "on")) send("toggle", d.id); break;   // a plug fan: on / off
        case "pur": { // the air purifier: off / auto / one speed step down or up (1–10; from off, + starts at 5)
          const t = safe(() => Home.thing(+a1), null); if (!t) break;
          if (demo) { toast(T("rg.demoModeNothingWasSent")); break; }
          const a = A(t), on = dysonOn(a), sp = parseInt(a.fanSpeed, 10), cur = on && Number.isFinite(sp) ? sp : 4;
          if (a2 === "off" || a2 === "auto") Home.purifier(t.id, a2);
          else Home.purifier(t.id, "speed", on ? clamp(cur + (a2 === "plus" ? 1 : -1), 1, 10) : (Number.isFinite(sp) ? sp : 5));   // from off: + / − start it at its last speed
          break;
        }
        case "shade": if (d) send("setShade", d.id, +a2); break;
        case "lvl": if (d) send("setLevel", d.id, +a2); break;
        case "ct": if (d) { showUI(d.id, T("rg.ct")); send("setColorTemp", d.id, +a2); } break;
        case "col": if (d) { showUI(d.id, "RGB"); send("setColor", d.id, +a2, +a3); } break;
        case "tab": if (d) {
          const L = lightLook(d), want = a2 === "rgb" ? "RGB" : T("rg.ct");
          showUI(d.id, want);
          // White on a coloured light: back to its white. Colour on a white light: only switch the controls — the colour
          // is sent when one is picked (sending hue 0 would turn a never-coloured light red)
          if (L.on && want === "CT" && L.colour) send("setColorTemp", d.id, L.K || 2700);
          else if (last) paintLights(last);
          break;
        }
        case "lock": { // lock only — the panel never unlocks
          const l = last && last.locks.find((x) => String(x.id) === a1);
          if (!l) break;
          if (demo) { toast(T("rg.demoModeNothingWasSent")); break; }
          try { if (window.Home && typeof Home.lock === "function") Home.lock(l.id); } catch (err) { console.warn("rlG: lock failed", err); }
          break;
        }
        case "cam": {
          const c = last && last.cameras.find((x) => String(x.id) === a1);
          if (!c || c.online === false) break;
          try { if (window.Cameras && typeof Cameras.full === "function") Cameras.full(c.id, 120, { stay: true }); else toast(T("rg.camerasArentAvailable")); } catch (err) { console.warn("rlG: camera failed", err); }
          break;
        }
        case "mode": { const t = safe(() => Home.thing(+a1) || Home.thing(a1), null); toast(T("rg2.modePreview", { name: t ? t.name : T("rg.mode") })); break; }
        case "gar": { // the garage door: open / close — "Are you sure?" and the PIN come from data.js, as on a Garage card
          if (demo) { toast(T("rg.demoModeNothingWasSent")); break; }
          const dv = safe(() => Home.device(+a1), null);
          if (dv && window.Grid && Grid.garageTap) Grid.garageTap(dv.id, { contact: last && last.overhead ? last.overhead.id : null }, dv);
          break;
        }
        case "therm": if (window.App && App.thermoPopup) App.thermoPopup(+a1); break;
        case "spk": {
          if (demo) { toast(T("rg.demoModeNothingWasSent")); break; }
          const t = safe(() => Home.thing(+a1), null);
          if (t) Home.send(t.id, lc(A(t).status) === "playing" ? "pause" : "play");
          break;
        }
        case "info": infoSheet(+a1); break;
      }
      return;
    }
    const mc = e.target.closest("[data-w]");
    if (mc && root.contains(mc) && !["fan", "plugfan", "purifier"].includes(mc.dataset.w)) toast(T("rg2.liveOnly", { name: mc.dataset.name || T("rg.appliance") }));
  }
  // a status row's details (a tap on it): what the sensor reports besides its state — battery, temperature, humidity,
  // light, its last activity (the hub's own values; nothing here is guessed)
  function infoSheet(id) {
    if (!window.UI || !UI.popup) return;
    const name = safe(() => Home.devName(id) || Home.fullName(id), "") || T("rg.sensor");
    const when = (v) => { const t = new Date(v); return isNaN(t) ? str(v) : t.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }); };
    const n0 = (u) => (v) => `${Math.round(num(v))}${u}`;
    const ROWS = [["contact", T("rg.contact"), cap], ["motion", T("rg.motion"), cap], ["water", T("rg.water"), cap], ["smoke", T("rg.smoke"), cap], ["lock", T("rg.lock"), cap],
      ["battery", T("rg.battery"), n0("%")], ["temperature", T("rg.temperature"), n0("°")], ["humidity", T("rg.humidity"), n0("%")], ["illuminance", T("rg.light"), n0(" lux")], ["lastActivity", T("rg.lastActivity"), when]];
    UI.popup(() => {
      const rows = ROWS.map(([k, l, f]) => {
        const v = safe(() => Home.reading(id, k), null);
        return v == null || v === "" || (f !== cap && f !== when && num(v) == null) ? "" : `<div class="prow"><span class="pn">${esc(l)}</span><span class="ps">${esc(f(v))}</span></div>`;
      }).join("");
      return { title: name, body: rows || `<p class="phint">${esc(T("rg2.nothingMore"))}</p>` };
    });
  }
  function onVis() { if (root) cls(root, `${P}-hidden`, document.hidden); }
  const noMenu = (e) => e.preventDefault(); // long-press must not open a menu

  function mount(el, roomId) {
    if (!document.getElementById(`${P}-css`)) { const s = document.createElement("style"); s.id = `${P}-css`; s.textContent = CSS; document.head.appendChild(s); }
    root = document.createElement("div"); root.className = P; el.appendChild(root);
    curRoom = roomId; key = ""; drag = null; dockId = null; recentCap = 5; lightUI.clear(); sheetFor = null; sceneHold = null; eatClick = 0;
    demo = URL_DEMO; demoStart = Date.now(); demoMotion.clear(); demoOv.clear(); demoScenes.clear();
    root.addEventListener("pointerdown", onDown); root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerup", onUp); root.addEventListener("pointercancel", onCancel);
    root.addEventListener("lostpointercapture", onCancel);
    root.addEventListener("click", onClick);
    root.addEventListener("contextmenu", noMenu);
    root.addEventListener("scroll", onScroll, true); // the rows' scroll (scroll doesn't bubble: capture)
    document.addEventListener("visibilitychange", onVis); onVis();
    safeUpdate();
    if (window.ResizeObserver) { let h = 0; ro = new ResizeObserver(() => { try { fitRows(); fitStage(); const s = refs.side, nh = s ? s.clientHeight : 0; if (nh && nh !== h) { h = nh; fitRecent(); } } catch (e) { /* ignore */ } }); observe(); }
    timers.clock = setInterval(safeUpdate, 15000); // clock, "x min ago"
    if (demo) timers.demo = setInterval(safeUpdate, 1000); // demo progress (text + classes only)
  }
  // leaving the room while arranging: keep the order — saved once the page has switched (not inside the switch)
  function leaveArrange() {
    clearTimeout(arrHold); arrHold = null;
    if (!arrange) return;
    const room = curRoom, ids = root ? [...root.querySelectorAll(ARR_ITEM)].map((x) => Number(x.dataset.light || x.dataset.dev)).filter((n) => Number.isFinite(n)) : [];
    arrange = false; arrDrag = null;
    if (root) root.classList.remove(`${P}-arranging`);
    if (arrDone) { arrDone.remove(); arrDone = null; }
    if (room && ids.length && window.Settings) setTimeout(() => Settings.set("deviceOrder", { ...(Settings.v.deviceOrder || {}), [room]: ids }), 0);
  }
  function unmount() {
    leaveArrange();
    Object.values(timers).forEach((t) => clearInterval(t)); timers = {};
    clearTimeout(toastT); clearTimeout(dockT);
    if (sceneHold) clearTimeout(sceneHold.timer);
    if (ro) { ro.disconnect(); ro = null; }
    document.removeEventListener("visibilitychange", onVis);
    if (root) {
      root.removeEventListener("pointerdown", onDown); root.removeEventListener("pointermove", onMove); root.removeEventListener("pointerup", onUp);
      root.removeEventListener("pointercancel", onCancel); root.removeEventListener("lostpointercapture", onCancel); root.removeEventListener("click", onClick);
      root.removeEventListener("contextmenu", noMenu); root.removeEventListener("scroll", onScroll, true);
      root.remove();
    }
    root = null; refs = {}; key = ""; last = null; drag = null; curRoom = null; dockId = null; lightUI.clear(); sheetFor = null; sceneHold = null; downInfo = null;
    demo = false; demoMotion.clear(); demoOv.clear(); demoScenes.clear(); // demo / preview state never survives leaving the page
  }
  function update(roomId) {
    if (!root) return;
    if (roomId != null && roomId !== curRoom) { leaveArrange(); curRoom = roomId; key = ""; dockId = null; demoOv.clear(); demoScenes.clear(); closeSheet(); }
    if (drag || arrange) { try { const m = model(curRoom); if (m && structKey(m) === key) patch(m); } catch (e) { /* keep dragging */ } return; } // no rebuild under a finger / while arranging
    safeUpdate();
  }

  // the timeline listens for the whole page life (registered last: it uses the view models above)
  if (window.Home && typeof Home.onChange === "function") Home.onChange(trackEvents);

  // a drawing on its own, running (Manager → Pictures shows what each looks like): the card's picture area only
  // (more drawings: art-extra.js, loaded before this file — window.EXTRA_ART {css, items: {key: {name, fits, svg()}}})
  const XA = window.EXTRA_ART && typeof window.EXTRA_ART === "object" && window.EXTRA_ART.items ? window.EXTRA_ART : { css: "", items: {} };
  // their CSS once; their animations run under "xa-on" (a card / tile) or this layout's own running class (a room page)
  function xaCss() {
    if (document.getElementById("xa-css")) return;
    const s = document.createElement("style"); s.id = "xa-css";
    s.textContent = `${XA.css || ""}
${String(XA.css || "").split(".xa-on ").join(`.${P}-run `)}`;
    document.head.appendChild(s);
  }
  const ART_KEYS = [...Object.keys(ART), ...Object.keys(XA.items).filter((k) => !Object.prototype.hasOwnProperty.call(ART, k))];
  function artPreview(k) {
    if (!Object.prototype.hasOwnProperty.call(ART, k) && Object.prototype.hasOwnProperty.call(XA.items, k)) {
      xaCss();
      if (!document.getElementById(`${P}-css`)) { const s = document.createElement("style"); s.id = `${P}-css`; s.textContent = CSS; document.head.appendChild(s); }
      // ("xa-run xa-on": taken off while the device is off — grid.js — so it stands still)
      return `<div class="${P}-mc ${P}-x xa-run xa-on ${P}-solo xa-${k}" style="--mc:#a78bfa"><div class="${P}-art">${XA.items[k].svg()}</div></div>`;
    }
    if (!Object.prototype.hasOwnProperty.call(ART, k)) return "";
    if (!document.getElementById(`${P}-css`)) { const s = document.createElement("style"); s.id = `${P}-css`; s.textContent = CSS; document.head.appendChild(s); }
    if (!document.getElementById(`${P}-defs`)) { const d = document.createElement("div"); d.id = `${P}-defs`; d.innerHTML = DEFS + DEFS2; document.body.appendChild(d); }
    const type = k.startsWith("fan-") ? "fan" : k;
    return `<div class="${P}-mc ${P}-${type} ${P}-run ${P}-on ${P}-solo" style="--mc:${MCOL[type] || "#a78bfa"}"><div class="${P}-art">${ART[k]()}</div></div>`;
  }

  const artInfo = (k) => (XA.items[k] ? { name: XA.items[k].name, fits: XA.items[k].fits || [] } : null);
  // (v3.0.2) one orb on its own, drawn as this layout draws it (the room card's "Orbs" look: grid.js): its HTML with the
  // light's state already painted in (the card is redrawn on a change); orbPaint: the live level while a finger dims it
  // (ov {on, level}; null = as it is)
  function orbPaint(el, d, ov) {
    if (!el || !d) return;
    paintOrb(el, d, lightLook(ov ? { ...d, ...ov } : d)); cls(el, "sel", false); cls(el, "drag", !!ov);
    if (ov) txt(K(el, "bub"), ov.on ? `${ov.level}%` : T("rg.off"));
  }
  function orb(d, room, fb, st) {   // (st: a switch / fan / shade's own state words, in place of a light's)
    if (!document.getElementById(`${P}-css`)) { const s = document.createElement("style"); s.id = `${P}-css`; s.textContent = CSS; document.head.appendChild(s); }
    const t = document.createElement("template"); t.innerHTML = orbHtml(d, { name: str(room) }, true, fb);
    const el = t.content.firstElementChild; orbPaint(el, d, null); if (st != null) txt(K(el, "st"), st); return el.outerHTML;
  }
  (window.RoomLayouts ||= {}).G = { name: "Layout G", mount, update, unmount, artKeys: ART_KEYS, artPreview, artInfo, orb, orbPaint };
})();
