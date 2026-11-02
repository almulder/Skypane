// Hubitat modes on the panel (release 2): the hub's modes and the current one (the bridge publishes retained
// hubitat/modes {modes, mode}), and changing it — always "Are you sure?" + the panel PIN: the dashboard service checks
// the PIN over HTTP and gives a one-time ticket for exactly this mode (device 0, "setMode", name); only the ticket goes
// over MQTT (hubitat/mode/set), the bridge answers on hubitat/mode/result. The builder's demo canvas just shows it.
(function () {
  const H = Home;
  const M = { list: [], cur: null, busy: false };
  const clean = (s) => (typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 40) : "");
  H.subscribe("hubitat/modes", (msg) => {
    try {
      const m = JSON.parse(msg);
      if (m && Array.isArray(m.modes)) M.list = m.modes.map(clean).filter(Boolean).slice(0, 20);
      if (m && typeof m.mode === "string") M.cur = clean(m.mode);
      H.refresh();
    } catch {}
  });
  H.subscribe("hubitat/mode", (msg) => { try { const m = JSON.parse(msg); if (m && typeof m.mode === "string") { M.cur = clean(m.mode); H.refresh(); } } catch {} });
  let waiting = null;
  H.subscribe("hubitat/mode/result", (msg) => { try { const r = JSON.parse(msg); if (waiting && r && r.mode === waiting.mode) waiting.done(r); } catch {} });
  const MSG_KEY = { "unknown-mode": "mode.err.unknown", "no-ticket": "alarm.err.noTicket", "bad-ticket": "alarm.err.badTicket",
    rate: "alarm.err.rate", "hub-error": "alarm.err.hub", timeout: "alarm.err.timeout" };
  const MSG = new Proxy({}, { get: (o, k) => (MSG_KEY[k] ? T(MSG_KEY[k]) : undefined) });

  M.set = async (name) => {
    name = clean(name);
    if (!name || name === M.cur || M.busy) return;
    if (window.PANEL_DESIGN === true) { M.cur = name; H.refresh(); return; }   // (the demo: nothing sent)
    if (!window.PinPad) return;
    M.busy = true;
    try {
      if (!(await PinPad.confirm({ title: T("mode.ask", { name }), text: T("mode.askText"), yes: T("mode.changeIt") }))) return;
      await PinPad.ask({ title: T("pin.title"), text: T("mode.pinText", { name }), window: "general", check: async (pin) => {
        let j = {};
        try {
          const r = await fetch("/api/pin", { method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "ticket", pin, panel: ((window.PanelStore && PanelStore.id) || "main").toLowerCase(), items: [[0, "setMode", name]] }) });
          j = await r.json().catch(() => ({}));
        } catch { return { ok: false, msg: T("pin.serviceDown") }; }
        if (!j.ok || !Array.isArray(j.tickets)) return PinPad.refusal(j);
        const res = await new Promise((resolve) => {
          const t = setTimeout(() => { waiting = null; resolve({ ok: false, reason: "timeout" }); }, 12000);
          waiting = { mode: name, done: (r) => { clearTimeout(t); waiting = null; resolve(r); } };
          H.publish("hubitat/mode/set", { mode: name, ticket: j.tickets[0], panel: ((window.PanelStore && PanelStore.id) || "main").toLowerCase() });
        });
        if (res.ok) { M.cur = name; H.refresh(); return { ok: true }; }
        return { ok: false, msg: MSG[res.reason] || T("mode.notChanged"), done: res.reason === "timeout" };
      } });
    } finally { M.busy = false; }
  };

  // the card (grid.js): style "segmented" (every mode, the current one lit) or "chip" (the current one; a tap lists them)
  const icon_ = (m) => (/night|sleep/i.test(m) ? "moon" : /away|vacation/i.test(m) ? "away" : /evening/i.test(m) ? "sunset" : /morning|day/i.test(m) ? "sun" : /party/i.test(m) ? "party" : "home");
  const esc = (s) => UI.esc(s);
  M.card = (o) => {
    const list = M.list.length ? M.list : M.cur ? [M.cur] : [];
    if (!list.length) return `<div class="gc-empty">${esc(T("mode.none"))}</div>`;
    const btn = (m) => `<button class="${m === M.cur ? "cur" : ""}" ${Acts.on("modes.set", m)}>${icon(icon_(m), 20)}<span>${esc(m)}</span></button>`;
    if (o.style === "chip") return `<div class="md-chip">${icon(icon_(M.cur || ""), 24)}<b>${esc(M.cur || "—")}</b><details><summary>${esc(T("mode.change"))}</summary><div class="md-seg">${list.map(btn).join("")}</div></details></div>`;
    return `${o.title ? `<div class="gc-t">${esc(o.title)}</div>` : ""}<div class="md-seg">${list.map(btn).join("")}</div>`;
  };
  Acts.add({ "modes.set": (m) => M.set(m) });   // (the card's buttons: acts.js)
  window.Modes = M;
})();
