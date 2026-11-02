// Cards people make (release 2: Manager → Cards; service/cards.py) on the panel. Each runs in its own sandboxed
// frame (/card-frame/<id>: an opaque origin with a strict CSP — no network, no access to this page). This page is
// the only way in or out:
// - a card hears ONLY about the devices the owner bound to its slots, and only the attributes those slots list;
// - a command from a card is passed on only when its slot lists that command, the device is bound, someone touched
//   that card in the last few seconds (a card can't switch things by itself), and not too often — then it goes
//   through the same checks as any tap (Home.send: the PIN, "only some panels"; then the bridge's own);
// - a card that stops answering (a loop that never ends…) or tries to load another page is stopped: "Card paused".
(function () {
  const H = Home, esc = (s) => UI.esc(s);
  const UC = { list: new Map(), paused: new Map() };   // id → manifest; "<instance>|<sha>" → why
  const TAP_MS = 4000, RATE = 6, RATE_MS = 10000, PING_MS = 5000, DEAD_MS = 15000;

  async function load() {
    try {
      const r = await fetch("/api/cards", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (!j || !Array.isArray(j.cards)) return;
      const before = JSON.stringify([...UC.list.values()].map((c) => c.sha));
      UC.list = new Map(j.cards.map((c) => [c.id, c]));
      // (a redraw replaces only the cards whose HTML changed — the other frames keep running)
      if (JSON.stringify([...UC.list.values()].map((c) => c.sha)) !== before && window.App) App.render();
    } catch { /* service restarting: the next change or reload */ }
  }
  load();
  H.subscribe("dashboard/cards/changed", load);

  const inst = (c) => `${c.i}|${(UC.list.get(c.t.slice(5)) || {}).sha || ""}`;
  // the grid's HTML for a card instance (grid.js): the frame, or why it isn't there
  UC.html = (c) => {
    const card = UC.list.get(c.t.slice(5));
    if (!card) return `<div class="uc-note">${UC.list.size ? esc(T("uc.notInstalled")) : ""}</div>`;
    const why = UC.paused.get(inst(c));
    if (why) return `<div class="uc-note"><b>${esc(T("uc.paused", { name: card.name }))}</b><span>${esc(why)}</span></div>`;
    return `<iframe class="uc-frame" data-uc="${esc(c.i)}" sandbox="allow-scripts" src="/card-frame/${esc(card.id)}?v=${esc(card.sha)}" referrerpolicy="no-referrer" allow="" title="${esc(card.name)}" scrolling="no"></iframe>`;
  };

  // ---------- what each frame is told ----------
  const frames = new Map();   // iframe element → {c, ready, sent, pong, born, taps: [], cmds: [], loads}
  const theme = () => {
    const cs = getComputedStyle(document.documentElement), v = (k) => cs.getPropertyValue(k).trim();
    return { accent: v("--accent"), "accent-2": v("--accent-2"), text: v("--text"), muted: v("--muted") };
  };
  function stateFor(c) {
    const card = UC.list.get(c.t.slice(5)), o = c.o || {}, bind = o.bind || {}, slots = {}, set = {};
    for (const s of card.slots || []) {
      const id = bind[s.key]; if (!id) continue;
      const all = H.attrs(id), attrs = {};
      for (const a of s.attributes) if (a in all) attrs[a] = all[a];
      slots[s.key] = { name: H.devName(id), attrs };
    }
    for (const s of card.settings || []) set[s.key] = o.set && s.key in o.set ? o.set[s.key] : s.default;
    return { slots, set, theme: theme() };
  }
  // after its first "ready" a card talks only through its own MessageChannel port: a page the frame navigates to
  // can't get it (a second "ready" stops the card), and nothing it's sent can reach another document
  const post = (f, msg) => { const F = frames.get(f); try { if (F && F.port) F.port.postMessage({ hp: 1, ...msg }); } catch {} };
  // after every Home redraw (grid.js): find the frames, send each its state if it changed
  UC.push = () => {
    const now = Date.now(), seen = new Set();
    for (const f of document.querySelectorAll("#main iframe.uc-frame[data-uc]")) {
      const c = window.Grid && Grid.byId.get(f.dataset.uc);
      if (!c || !UC.list.get(c.t.slice(5))) continue;
      seen.add(f);
      let F = frames.get(f);
      if (!F) frames.set(f, (F = { c, ready: false, sent: "", pong: now, born: now, taps: [], cmds: [], loads: 0 }));
      F.c = c;
      if (!F.ready) continue;
      const st = stateFor(c), key = JSON.stringify(st);
      if (key !== F.sent) { F.sent = key; post(f, { t: "state", ...st }); }
    }
    for (const f of [...frames.keys()]) if (!seen.has(f) && !document.contains(f)) frames.delete(f);
  };
  const pause = (F, why) => {
    try { F.port && F.port.close(); } catch {}
    UC.paused.set(inst(F.c), why);
    console.warn(`[cards] ${F.c.t} (${F.c.i}) paused: ${why}`);
    if (window.App) App.render();   // (only this card's place changes: the other frames keep running)
  };

  // ---------- messages from the frames ----------
  window.addEventListener("message", (e) => {
    let f = null, F = null;
    for (const [el, x] of frames) if (el.contentWindow === e.source) { f = el; F = x; break; }
    const m = e.data;
    if (!F || !m || typeof m !== "object" || m.hp !== 1 || m.t !== "ready") return;
    if (F.port) return pause(F, T("uc.otherPage"));
    const ch = new MessageChannel();
    F.port = ch.port1; F.ready = true; F.pong = Date.now(); F.sent = "";
    ch.port1.onmessage = (ev) => fromCard(f, F, ev.data);
    try { f.contentWindow.postMessage({ hp: 1, t: "port" }, "*", [ch.port2]); } catch {}
    UC.push();
  });
  function fromCard(f, F, m) {
    if (!m || typeof m !== "object" || m.hp !== 1 || !frames.has(f)) return;
    if (m.t === "pong") { F.pong = Date.now(); return; }
    if (m.t !== "cmd") return;
    const card = UC.list.get(F.c.t.slice(5)), slot = card && (card.slots || []).find((s) => s.key === m.slot);
    const id = slot && ((F.c.o || {}).bind || {})[slot.key], now = Date.now();
    const v = m.v == null ? null : typeof m.v === "number" && Number.isFinite(m.v) ? m.v : typeof m.v === "string" && m.v.length <= 64 ? m.v : undefined;
    if (!slot || !id || typeof m.c !== "string" || !slot.commands.includes(m.c) || v === undefined) return console.warn("[cards] refused a command the card didn't declare:", m.slot, m.c);
    if (!F.taps.some((t) => now - t < TAP_MS)) return console.warn("[cards] refused a command nobody tapped for:", m.slot, m.c);
    F.cmds = F.cmds.filter((t) => now - t < RATE_MS);
    if (F.cmds.length >= RATE) return console.warn("[cards] too many commands from one card — slowing it down");
    F.cmds.push(now);
    const d = H.device(id);
    if ((m.c === "on" || m.c === "off") && d) { if (!!d.on !== (m.c === "on")) H.toggle(id); return; }
    if (m.c === "lock" && H.state.locks.some((l) => l.id === id)) return H.lock(id);
    if (m.c === "unlock") return H.canUnlock(id) ? H.unlock(id) : window.PinPad && PinPad.confirm({ title: T("dev.notFromHere"), text: T("uc.noUnlock"), yes: T("common.ok") });
    H.send(id, m.c, v);
  }

  // a touch on a card: taps inside a frame don't reach this page, but the frame takes the focus (this page's
  // window "blur" with the frame as the active element) — noted, and the focus given back for the next touch
  window.addEventListener("blur", () => setTimeout(() => {
    const a = document.activeElement;
    if (!a || !a.matches || !a.matches("iframe.uc-frame")) return;
    const F = frames.get(a); if (F) F.taps.push(Date.now());
    if (F && F.taps.length > 10) F.taps = F.taps.slice(-10);
    setTimeout(() => { if (document.activeElement === a) { a.blur(); window.focus(); } }, 150);
  }, 0));
  // a frame that loads a second time navigated itself (to another address): stopped
  document.addEventListener("load", (e) => {
    const f = e.target; if (!f || !f.matches || !f.matches("iframe.uc-frame")) return;
    const F = frames.get(f) || (UC.push(), frames.get(f)); if (!F) return;
    if (++F.loads > 1) pause(F, T("uc.otherPage"));
  }, true);

  // ---------- the watchdog: a card that stops answering is stopped ----------
  let n = 0;
  setInterval(() => {
    if (document.hidden) { for (const F of frames.values()) F.pong = Date.now(); return; }   // (timers sleep with the screen)
    const now = Date.now();
    // (cards may share one browser process: a stuck card can hold up its neighbours, so every card that stopped
    // answering is stopped — a reload starts them again)
    for (const [f, F] of [...frames]) {
      if (!document.contains(f)) { frames.delete(f); continue; }
      if (!F.ready && now - F.born > DEAD_MS) { pause(F, T("uc.didntStart")); continue; }
      if (F.ready && now - F.pong > DEAD_MS) { pause(F, T("uc.stuck")); continue; }
      if (F.ready) post(f, { t: "ping", n: ++n });
    }
  }, PING_MS);

  window.UserCards = UC;
})();
