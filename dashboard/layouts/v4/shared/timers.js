// Kitchen timers (release 2): several at once, each with a name, on this panel. The "Timers" card of a custom grid
// (grid.js) shows them with preset buttons; done = a chime and a note on top of everything until it's dismissed.
// Later the voice timers use the same calls (the wishlist: "make a timer for spaghetti 10 minutes"):
//   Timers.start(seconds, name) · Timers.cancel(id) · Timers.add(id, seconds) · Timers.reset(id) · Timers.byName(name)
// Kept in this browser (localStorage) so a reload doesn't lose a running timer. (v3.0.4: the old Timers card — the new
// "Countdown & timers" card is TimerCards, below; service/time_cards.py moved the saved ones over)
(function () {
  const KEY = "panel.timers", MAX = 8;
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter((t) => t && Number.isFinite(t.end) && Number.isFinite(t.total)) : []; } catch { return []; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} };
  let list = load();   // [{id, name, end (ms), total (s), done}]
  const changed = () => { save(); if (window.App && App.render) App.render(); };
  const esc = (s) => (window.UI && UI.esc ? UI.esc(s) : String(s));
  const mmss = (s) => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(x).padStart(2, "0")}`; };
  const left = (t) => (t.end - Date.now()) / 1000;

  const TM = {
    list: () => list.slice(),
    start(seconds, name) {
      seconds = Math.round(+seconds);
      if (!(seconds > 0 && seconds <= 24 * 3600)) return null;
      if (list.length >= MAX) list.shift();
      const t = { id: Math.random().toString(36).slice(2, 9), name: String(name || mmss(seconds)).slice(0, 40), end: Date.now() + seconds * 1000, total: seconds };
      list.push(t); changed(); return t.id;
    },
    cancel(id) { list = list.filter((t) => t.id !== id); if (!list.some((t) => t.done)) quiet(); changed(); },
    add(id, seconds) { const t = list.find((x) => x.id === id); if (!t) return; if (t.done) { t.done = false; t.end = Date.now(); } t.end += seconds * 1000; t.total += seconds; if (!list.some((x) => x.done)) quiet(); changed(); },
    reset(id) { const t = list.find((x) => x.id === id); if (!t) return; t.done = false; t.end = Date.now() + t.total * 1000; if (!list.some((x) => x.done)) quiet(); changed(); },
    byName: (name) => list.find((t) => t.name.toLowerCase() === String(name).toLowerCase()) || null,
  };

  // the card (grid.js): running timers, then the preset buttons (minutes)
  TM.card = (o) => {
    const presets = Array.isArray(o.presets) && o.presets.length ? o.presets : [1, 5, 10, 15, 30];
    const rows = list.map((t) => `<div class="tm-row${t.done ? " done" : ""}"><span class="tm-n">${esc(t.name)}</span><b class="num" data-tend="${t.end}">${t.done ? esc(T("tm.done")) : mmss(left(t))}</b>
      <i class="tm-bar"><i data-tend="${t.end}" data-ttot="${t.total}" style="transform:scaleX(${t.done ? 0 : Math.max(0, Math.min(1, left(t) / t.total)).toFixed(3)})"></i></i>
      <button${Acts.on("tm.add", t.id, 60)}>+1</button><button${Acts.on("tm.reset", t.id)} aria-label="${esc(T("tm.again"))}">↺</button><button${Acts.on("tm.cancel", t.id)} aria-label="${esc(T("tm.stop"))}">✕</button></div>`).join("");
    return `<div class="tm">${o.title ? `<div class="gc-t">${esc(o.title)}</div>` : ""}<div class="tm-list">${rows || `<div class="gc-empty">${esc(T("tm.none"))}</div>`}</div>
      <div class="tm-pre">${presets.map((m) => `<button${Acts.on("tm.start", +m * 60)}>${esc(T("tm.minutes", { n: +m }))}</button>`).join("")}</div></div>`;
  };

  // every second: the numbers and bars only (no redraw); a timer reaching zero rings
  let ringing = null, note = null;
  function quiet() { clearInterval(ringing); ringing = null; if (note) { note.remove(); note = null; } }
  function ring(t) {
    if (window.Sound && !(window.PANEL_DESIGN === true)) { try { Sound.play("quarter"); } catch {} }
    clearInterval(ringing);
    let n = 0;
    ringing = setInterval(() => { if (++n > 12) return quiet(); try { if (window.Sound) Sound.play("quarter"); } catch {} }, 10000);   // (2 minutes at most)
    if (!note) {
      note = document.createElement("div");
      note.className = "tm-note";
      note.addEventListener("click", () => { list.filter((x) => x.done).forEach((x) => TM.cancel(x.id)); quiet(); });
      document.body.appendChild(note);
    }
    note.innerHTML = `<b>${esc(T("tm.isDone", { name: t.name }))}</b><span>${esc(T("tm.tapDismiss"))}</span>`;
  }
  setInterval(() => {
    let hit = false;
    for (const t of list) if (!t.done && left(t) <= 0) { t.done = true; hit = true; ring(t); }
    if (hit) changed();
    for (const el of document.querySelectorAll("[data-tend]")) {
      const end = +el.dataset.tend, s = (end - Date.now()) / 1000;
      if (el.dataset.ttot) el.style.transform = `scaleX(${Math.max(0, Math.min(1, s / +el.dataset.ttot)).toFixed(3)})`;
      else if (s > 0) el.textContent = mmss(s);
    }
  }, 1000);

  // the card's buttons (acts.js)
  Acts.add({ "tm.add": (id, s) => TM.add(id, s), "tm.reset": (id) => TM.reset(id), "tm.cancel": (id) => TM.cancel(id), "tm.start": (s) => TM.start(s) });
  window.Timers = TM;
})();

// (v3.0.4) The "Countdown & timers" card (replaces Countdown and Timers; the format: service/layouts.py "timers"; the
// design: mockups/prototypes/garage-bins-timers.html, the Countdown & timers tab). Each item is a countdown to a date
// and time, or a timer (one per kid, say) that starts from the house's presets (service/timers.py: shared by every
// timer; the ticked ones are buttons on an idle timer) — then +1 min, Pause / Resume, Stop. Each shows the mix of
// Days · HH · MM · SS its settings pick. A timer's run is kept by the service (/api/timers), so a timer connected to
// other panels is the same on each: "Linked" shows it on their card with its buttons (or runs with their own timer of
// the same name), "Notification only" shows it there counting down. When one runs out, each panel it's on shows
// "Timer up": full screen in the timer's color, like a level 5 but not one — no PIN, no alert level, it closes itself
// after its seconds — with its sound (the chime, chime.js, or its words spoken).
// (v3.0.4, the mockup's extras) "PIN-protect timers on this panel" (the card's o.pin): +1 min, Pause, Resume and Stop
// ask for the panel PIN (Settings.unlockWithPin: the unlock window counts; no PIN set — nothing asked), a preset
// still starts without it unless o.pinFree is false. "Timer up" can flash the timer's own lights (item.lights, none
// by default): on / off twice, then back as they were — only lights this panel may switch without the PIN
// (Home.sendQuiet: never a pop-up), and the bridge's own checks as for any tap. A Hubitat rule can start timers by
// name (service/timers.py parse_command: "Timer: Emma, Free time").
(function () {
  const H = Home, esc = (s) => UI.esc(s);
  const DESIGN = window.PANEL_DESIGN === true;
  const TC = { presets: [], runs: {}, shared: [], skew: 0 };
  const now = () => Date.now() + TC.skew;   // (the service's clock: every panel ends a timer at the same moment)
  const pad = (n) => String(n).padStart(2, "0");
  const UNIT = { h: (n) => T("tc.h", { n }), m: (n) => T("tc.m", { n }), s: (n) => T("tc.s", { n }) };
  // seconds → the item's mix ("dhms" subset): "3 days 02:19:10", "3 days", "74 h", "45:10"…
  const fmtMix = TC.fmt = (sec, mix) => {
    sec = Math.max(0, Math.floor(sec));
    const U = [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]].filter(([k]) => String(mix || "hms").includes(k));
    if (!U.length) U.push(["s", 1]);
    let rem = sec; const v = {};
    for (const [k, z] of U) { v[k] = Math.floor(rem / z); rem -= v[k] * z; }
    const tp = U.map(([k]) => k).filter((k) => k !== "d"), days = "d" in v ? T("tc.days", { n: v.d }) : "";
    if (!tp.length) return days;
    if (tp.length === 1) { const one = UNIT[tp[0]](v[tp[0]]); return days && v.d ? T("tc.daysTime", { days, time: one }) : one; }
    const time = tp.map((k) => pad(v[k])).join(":");
    return days && v.d ? T("tc.daysTime", { days, time }) : time;
  };
  // (a preset under a minute in seconds — 20 s is not "1 min")
  const durText = (s) => (s >= 3600 ? (s % 3600 ? T("tc.durHm", { h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60) }) : T("tc.durH", { n: s / 3600 }))
    : s < 60 ? T("tc.durS", { n: Math.max(1, Math.round(s)) }) : s % 60 ? T("tc.durMs", { m: Math.floor(s / 60), s: Math.round(s % 60) }) : T("tc.durM", { n: s / 60 }));
  const left = (r) => (!r ? 0 : r.state === "running" ? Math.max(0, (r.end - now()) / 1000) : r.state === "paused" ? r.left || 0 : 0);
  const run = (id) => TC.runs[id] || { state: "idle", total: 0 };
  // (L: a card's own presets — an old Timers card's buttons, moved over in 3.0.4 — else the house's)
  const listOf = (L) => (Array.isArray(L) && L.length ? L : TC.presets);
  const preset = (id, L) => listOf(L).find((p) => p.id === id) || listOf(L)[0] || { id: "", name: "", sec: 600 };

  async function load() {   // (the builder's canvas too: a Manager login reads them)
    try {
      const pid = (window.PanelStore && PanelStore.id) || "";
      const r = await fetch(`/api/timers?panel=${encodeURIComponent(pid)}`, { cache: "no-store" });
      if (r.ok) { const d = await r.json(); if (d && Array.isArray(d.presets) && d.runs) take(d); }
    } catch {}
  }
  function take(d) {
    TC.presets = d.presets; TC.runs = d.runs;
    if (Array.isArray(d.shared)) TC.shared = d.shared;
    if (Number.isFinite(d.now)) TC.skew = d.now - Date.now();
    for (const [id, r] of Object.entries(TC.runs)) if (r.rang && now() - r.rang < 60000) due(id, r.rang);   // (it ran out a moment ago)
    H.refresh();
  }
  // (v3.0.4) a press the service refused for the PIN: a short note at the bottom (the page's own toast look)
  let pinToldAt = 0;
  function pinNote() {
    if (Date.now() - pinToldAt < 3000 || !document.body) return;
    pinToldAt = Date.now();
    const n = document.createElement("div");
    n.className = "hub-off-toast"; n.textContent = T("tc.pinNeeded");
    document.body.append(n);
    setTimeout(() => n.remove(), 3200);
  }
  TC.pinNote = pinNote;
  const said = (res, d) => { if (res.status === 403 && d && d.error === "pin-required") pinNote(); };   // (said, never a silent undo)

  // a press (acts.js): here at once, then the service's answer (every panel hears dashboard/timers/changed)
  TC.press = async (action, id, sec, ticket) => {
    const r = { ...run(id) }, t = now();
    if (action === "start") Object.assign(r, { state: "running", total: sec, end: t + sec * 1000 });
    if (action === "add") { if (r.state === "running") r.end += sec * 1000; else if (r.state === "paused") r.left += sec; else Object.assign(r, { state: "running", end: t + sec * 1000 }); r.total = (r.total || 0) + sec; }
    if (action === "pause" && r.state === "running") Object.assign(r, { state: "paused", left: Math.round((r.end - t) / 1000) });
    if (action === "resume" && r.state === "paused") Object.assign(r, { state: "running", end: t + r.left * 1000 });
    if (action === "stop") Object.assign(r, { state: "idle" });
    TC.runs = { ...TC.runs, [id]: r }; H.refresh();
    if (DESIGN) return;
    try {
      const pid = (window.PanelStore && PanelStore.id) || "";
      const res = await fetch(`/api/timers?panel=${encodeURIComponent(pid)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id, ...(sec ? { sec } : {}), ...(ticket ? { ticket } : {}) }) });
      const d = await res.json().catch(() => null);
      if (res.ok && d && d.runs) return take(d);
      said(res, d);
      load();   // (refused — not this panel's, or the PIN: back as it is)
    } catch {}
  };

  // the items a card shows: its own, then the timers other panels linked or connected here (a linked one with the name
  // of one of ours: ours runs with it — our own color and sound)
  const itemsOf = (o) => {
    const own = (Array.isArray(o.items) ? o.items : []).map((it) => ({ ...it, run: it.id, pl: o.presets }));
    for (const s of TC.shared) {
      const twin = s.mode === "linked" && own.find((it) => it.k === "timer" && it.name.toLowerCase() === String(s.name).toLowerCase() && it.run === it.id);
      if (twin) { twin.run = s.id; twin.from = s.fromName; twin.shared = true; continue; }
      own.push({ id: s.id, run: s.id, k: "timer", name: s.name, col: s.col, mix: s.mix, preset: s.preset, pl: s.presets, from: s.fromName, view: s.mode === "notify", shared: true });
    }
    return own;
  };
  const RING_C = 2 * Math.PI * 16, dash = (frac) => `${(RING_C * frac).toFixed(1)} ${RING_C.toFixed(1)}`;
  const ring = (frac, col, idle) => { return `<svg class="tc-ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="4.5"/><circle cx="20" cy="20" r="16" fill="none" stroke="${col}" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="${dash(frac)}" transform="rotate(-90 20 20)" opacity="${idle ? 0.35 : 1}"/></svg>`; };
  const colOf = (it) => (/^#[0-9a-fA-F]{6}$/.test(it.col || "") ? it.col : "#8b5cf6");
  // (lk: the card's PIN lock — "" none, "more" all but the presets, "all" the presets too)
  function row(it, lk) {
    const col = colOf(it), pin = (pre) => (lk === "all" || (lk && !pre) ? 1 : 0);
    if (it.k === "count") {
      const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(it.at || ""), at = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
      const s = at ? (at - now()) / 1000 : 0;
      return `<div class="tc-i count"><span class="tc-ic" style="color:${col}">${icon(it.icon && window.ICON_NAMES && ICON_NAMES.includes(it.icon) ? it.icon : "calendar", 24)}</span>
        <div class="tc-n"><b>${esc(it.name)}</b><small>${at ? esc(T.dateTime(at)) : ""}</small></div>
        <span class="tc-big num" style="color:${col}" ${at ? `data-tc-at="${+at}" data-tc-mix="${esc(it.mix || "d")}"` : ""}>${esc(!at ? "—" : s <= 0 ? T("tc.now") : fmtMix(s, it.mix || "d"))}</span></div>`;
    }
    const r = run(it.run), p = preset(it.preset, it.pl), idle = r.state === "idle", l = left(r);
    const frac = idle ? 1 : Math.max(0, Math.min(1, l / (r.total || 1)));
    const sub = it.from ? T(it.view ? "tc.fromNotify" : "tc.fromLinked", { panel: it.from }) : idle ? T("tc.ready", { preset: p.name }) : r.state === "paused" ? T("tc.paused") : T("tc.running", { len: durText(r.total || 0) });
    const id = esc(it.run);
    const ctl = it.view ? "" : idle ? listOf(it.pl).filter((x) => x.btn).map((x) => `<button class="tc-chip${x.id === p.id ? " pr" : ""}"${Acts.on("tc.press", "start", it.run, x.sec, pin(true))}>${esc(x.name === durText(x.sec) ? x.name : T("tc.preset", { name: x.name, len: durText(x.sec) }))}</button>`).join("")
      : `<button class="tc-chip"${Acts.on("tc.press", "add", it.run, 60, pin())}>${esc(T("tc.plus1"))}</button>`
        + (r.state === "running" ? `<button class="tc-chip"${Acts.on("tc.press", "pause", it.run, 0, pin())}>${esc(T("tc.pause"))}</button>` : `<button class="tc-chip"${Acts.on("tc.press", "resume", it.run, 0, pin())}>${esc(T("tc.resume"))}</button>`)
        + `<button class="tc-chip"${Acts.on("tc.press", "stop", it.run, 0, pin())}>${esc(T("tc.stop"))}</button>`;
    return `<div class="tc-i ${r.state}"><span class="tc-rw" data-tc-ring="${id}">${ring(frac, col, idle)}</span><div class="tc-n"><b>${esc(it.name)}</b><small>${esc(sub)}</small></div>
      <span class="tc-big num" data-tc-run="${id}" data-tc-mix="${esc(it.mix || "hms")}">${esc(fmtMix(idle ? p.sec : l, it.mix || "hms"))}</span>${ctl ? `<div class="tc-ctl">${ctl}</div>` : ""}</div>`;
  }
  // (lk: a card's PIN lock; a timer linked from another panel shows on every Countdown & timers card here, so it takes
  // the strictest of them — as the service does, timers.py press_lock)
  const LOCKS = ["", "more", "all"];
  const lockOf = (o) => (o && o.pin === true ? (o.pinFree === false ? "all" : "more") : "");
  const strictest = (lk) => cardsHere().map((c) => lockOf(c.o)).reduce((a, b) => (LOCKS.indexOf(b) > LOCKS.indexOf(a) ? b : a), lk);
  TC.card = (c) => {
    const o = c.o || {}, items = itemsOf(o), lk = lockOf(o), slk = items.some((it) => it.shared) ? strictest(lk) : lk;
    const lock = lk ? `<span class="tc-pin" title="${esc(T("tc.pinLocked"))}">${icon("lock", 14)}</span>` : "";
    return { html: `<div class="tc">${o.title || lock ? `<div class="gc-t">${esc(o.title || "")}${lock}</div>` : ""}<div class="tc-list">${items.map((it) => row(it, it.shared ? slk : lk)).join("") || `<div class="gc-empty">${esc(T("tc.none"))}</div>`}</div></div>` };
  };
  // (v3.0.4) a press on a PIN-protected card: the panel PIN first (no PIN set, or still unlocked: at once); the service
  // checks it again — a one-time ticket for this press on this timer (/api/pin), never the PIN itself on /api/timers
  TC.pressPin = async (action, id, sec, lk) => {
    if (!lk || DESIGN) return TC.press(action, id, sec);
    if (!window.Settings || !Settings.unlockWithPin || !(await Settings.unlockWithPin(T("tc.pinTitle")))) return;
    const pin = window.PinPad && PinPad.unlocked();
    let ticket = null;
    if (pin) {
      try {
        const r = await fetch("/api/pin", { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ticket", pin, panel: ((window.PanelStore && PanelStore.id) || "").toLowerCase(), items: [[0, "timerPress", `${action} ${id}`]] }) });
        const j = await r.json().catch(() => ({}));
        if (j.ok && Array.isArray(j.tickets)) ticket = j.tickets[0];
      } catch {}
    }
    return TC.press(action, id, sec, ticket);
  };

  // ---------- "Timer up" ----------
  const cardsHere = () => {
    const v = (window.Settings && Settings.v) || {}, out = [];
    for (const g of [v.homeGrid, ...Object.values(v.roomGrids || {})]) for (const c of (g && Array.isArray(g.cards) ? g.cards : [])) if (c && c.t === "timers" && c.o) out.push(c);
    return out;
  };
  // what rings here for a run: our own timer's settings, else the connected one's (its color, the chime, 12 s)
  const ringsHere = (id) => {
    for (const c of cardsHere()) for (const it of itemsOf(c.o)) if (it.k === "timer" && it.run === id) return it;
    return null;
  };
  const FIRED = "panel.timers.fired";
  const fired = (() => { try { const v = JSON.parse(localStorage.getItem(FIRED) || "[]"); return new Set(Array.isArray(v) ? v.slice(-50) : []); } catch { return new Set(); } })();
  const queue = [];
  let shown = null, beep = null, back = null;   // (back: what had the focus before the first "Timer up")
  function due(id, end) {
    const k = `${id}@${end}`;
    if (DESIGN || fired.has(k)) return;
    const it = ringsHere(id); if (!it) return;
    fired.add(k); try { localStorage.setItem(FIRED, JSON.stringify([...fired].slice(-50))); } catch {}
    queue.push({ name: it.name, col: colOf(it), snd: it.snd || "chime", say: it.say || "", secs: it.view || !it.dismiss ? 12 : it.dismiss, from: it.from || "",
      lights: Array.isArray(it.lights) && !it.view ? it.lights.slice(0, 4) : [] });
    if (!shown) next();
  }
  function close() {
    clearInterval(beep); beep = null; if (shown) shown.el.remove(); shown = null; next();
    if (!shown && back) { try { if (back.isConnected) back.focus(); } catch {} back = null; }
  }
  TC.dismiss = close;
  function next() {
    const a = queue.shift(); if (!a) return;
    const el = document.createElement("div");
    el.className = "tc-up"; el.style.setProperty("--c", a.col); el.setAttribute("role", "alertdialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = `<div class="tc-up-in"><div class="tc-up-ic">${icon("clock", 54)}</div><div class="tc-up-k">${esc(T("tc.upTitle"))}</div><h2>${esc(a.name)}</h2>
      ${a.from ? `<div class="tc-up-from">${esc(T("tc.upFrom", { panel: a.from }))}</div>` : ""}<div class="tc-up-bar"><i></i></div><div class="tc-up-not" data-tc-close></div>
      <button type="button"${Acts.on("tc.dismiss")}>${esc(T("tc.dismiss"))}</button></div>`;
    if (!back) back = document.activeElement;
    document.body.append(el);
    try { el.querySelector("button").focus(); } catch {}
    shown = { el, until: Date.now() + a.secs * 1000, secs: a.secs };
    if (a.snd === "speak" && window.PanelSpeech) PanelSpeech.alert(a.say || T("tc.say", { name: a.name }), 1);
    flash(a.lights);
    if (a.snd === "chime") {   // (the chime, again every 5 s while it's up)
      const play = () => { try { if (window.Sound) Sound.play("quarter"); } catch {} };
      play();
      beep = setInterval(play, 5000);
    }
    tickUp();
  }
  // (v3.0.4) the timer's lights: on / off twice, 1.2 s apart, then as they were (a light switched meanwhile: left so)
  const FLASH_MS = 1200;
  function flash(ids) {
    for (const id of ids) {
      const d = H.device(id), was = d ? !!d.on : null;
      if (was == null || d.kind !== "light") continue;   // (a light only — never a plug, a fan, a garage)
      const steps = [!was, was, !was, was];
      steps.forEach((on, n) => setTimeout(() => { const now = H.device(id); if (now && !!now.on === !on) H.sendQuiet(id, on ? "on" : "off"); }, n * FLASH_MS));
    }
  }
  TC.flash = flash;
  function tickUp() {
    if (!shown) return;
    const s = (shown.until - Date.now()) / 1000;
    if (s <= 0) return close();
    shown.el.querySelector(".tc-up-bar i").style.transform = `scaleX(${(s / shown.secs).toFixed(3)})`;
    shown.el.querySelector("[data-tc-close]").textContent = T("tc.upNot", { n: Math.ceil(s) });
  }

  // every second: the numbers and rings (no redraw); a run reaching its end rings here
  setInterval(() => {
    const t = now();
    let ended = false;
    for (const [id, r] of Object.entries(TC.runs)) if (r.state === "running" && r.end <= t) { TC.runs[id] = { ...r, state: "idle", rang: r.end }; due(id, r.end); ended = true; }
    if (ended) H.refresh();
    for (const el of document.querySelectorAll("[data-tc-run]")) { const r = run(el.dataset.tcRun); if (r.state === "running") el.textContent = fmtMix(left(r), el.dataset.tcMix); }
    for (const el of document.querySelectorAll("[data-tc-ring]")) {   // (the ring shrinks with the time left)
      const r = run(el.dataset.tcRing), c = r.state === "running" && el.querySelector("circle:last-child");
      if (c) c.setAttribute("stroke-dasharray", dash(Math.max(0, Math.min(1, left(r) / (r.total || 1)))));
    }
    for (const el of document.querySelectorAll("[data-tc-at]")) { const s = (+el.dataset.tcAt - t) / 1000; el.textContent = s <= 0 ? T("tc.now") : fmtMix(s, el.dataset.tcMix); }
    tickUp();
  }, 1000);
  load();
  if (!DESIGN) {
    H.subscribe("dashboard/timers/changed", load);
    setInterval(load, 60000);   // (a missed announcement: never stale for long)
  }
  Acts.add({ "tc.press": (a, id, sec, lk) => TC.pressPin(String(a), String(id), +sec || 0, +lk === 1), "tc.dismiss": () => close() });
  TC.take = take; TC.due = due;
  window.TimerCards = TC;
})();
