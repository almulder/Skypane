// Guest lockdown (v2.7.2; the settings: Manager → Guest Wi-Fi → "When guests stay", v2.7.0). While the Hubitat switch
// the admin picked (e.g. "Guest mode all") is on, the panels the admin picked lock. The server hands each of them
// { switch: <device id>, mode: "pin" | "dark" | "none", idle: <seconds>, blur: true | false } — in its page
// (window.PANEL_LOCKDOWN) and, when the admin changes it, in the next answer to the status bars' poll (status.js →
// GuestLock.config: no reload needed). mode "none": no lock layer — a panel only in the "blur the calendar" list.
//   blur  (v2.9.3) every calendar card on the panel is blurred while the switch is on (ui.js UI.calendar:
//         the content blurred, inert and hidden from screen readers; the card stays where it is, with "Hidden while
//         guests stay" on it). Really hidden: no event on the page or in memory (data.js hideEvents), and the service
//         hands this panel's events out only with a "reveal" ticket. A tap on the card asks the panel PIN, which gets
//         that ticket (/api/pin {action: "ticket", purpose: "reveal", panel, pin} → {ok, ticket, seconds}); the events
//         come with it (data.js revealEvents) and stay for the same time an unlock lasts (below, ≤ 5 min), then
//         they're dropped and it's blurred again. Same switch, same fail-closed rule as the lock; with the lock too,
//         the lock's own Unlock shows the calendar as well (one PIN, one ticket). Never alerts; never the builder's canvas.
//   pin   a calm full-screen layer — the clock, "Guest mode — please ask the owner", Unlock (the panel PIN). Nothing
//         under it can be switched or opened.
//   dark  the screen stays black (the sky stops drawing) until someone touches it; then the same layer; black again
//         after `idle` seconds without a touch. A wake from the tablet itself (FreeKiosk: motion, a presence rule) is no
//         touch on the page, so it shows nothing; a doorbell / camera pop-up isn't shown either while it's locked.
// The PIN unlocks for as long as the panel's general PIN window stays open (pinpad.js: until nobody touched the screen
// for pinGeneralSeconds — Manager → Panels → Safety; "never" is capped at 5 minutes here), then it locks again.
// Level 4–5 alerts stay above it (alarm.js's layer, z-index 102) and are dismissed with the PIN as always. The
// switch's state is the hub's live one (data.js keeps every attribute the bridge sends) — read every 400 ms, so the
// lock follows the switch within a second. Never in the builder's canvas. In the Manager's "Open live" view the lock
// shows too, with a line saying so.
(function () {
  const H = window.Home;
  if (!H || window.PANEL_DESIGN === true) return;
  const NEVER_CAP_MS = 5 * 60 * 1000;   // (a general PIN window that never relocks: here 5 minutes without a touch)
  const esc = (s) => (window.UI && UI.esc ? UI.esc(s) : String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
  const G = { on: false, locked: false, blurred: false, awake: false, cfg: null, known: null };
  let el = null, lastTouch = 0, wokeAt = 0, asking = false, skyHeld = false;

  // the settings, checked (anything else: no lockdown)
  const clean = (c) => (c && typeof c === "object" && Number.isInteger(c.switch) && c.switch > 0
    ? { switch: c.switch, mode: c.mode === "dark" ? "dark" : c.mode === "none" ? "none" : "pin",   // (anything else: the lock — fail closed)
      idle: Number.isInteger(c.idle) && c.idle >= 10 && c.idle <= 600 ? c.idle : 30, blur: c.blur === true } : null);
  G.cfg = clean(window.PANEL_LOCKDOWN);
  G.config = (c) => { const n = clean(c); if (JSON.stringify(n) !== JSON.stringify(G.cfg)) { if (!n || !G.cfg || n.switch !== G.cfg.switch) G.known = null; G.cfg = n; G.awake = false; tick(); } };

  // Is the switch on? Only the hub's own value counts (its whole state arrived and the bridge / broker is still there —
  // data.js hubLive); each one it gives is remembered for this panel (localStorage). Until the hub says — after a
  // reload, a reboot, a Wi-Fi blip — the panel stays locked: fail closed. A last known "on" keeps it locked for as long
  // as the hub is silent or disconnected; a last known "off" lets it open after FIRST_WAIT_MS without news (a hub that
  // was off for good mustn't keep a panel locked forever — so a panel that was offline when guest mode was switched on
  // may open after 2 minutes without the hub; help: Guest lockdown); with nothing known it stays locked until the hub says.
  const FIRST_WAIT_MS = 120 * 1000, loadedAt = Date.now();
  const pid = () => String((window.PanelStore && PanelStore.id) || window.PANEL || "main").toLowerCase();
  const key = () => `skypane.guestlock.${pid()}.${G.cfg.switch}`;
  const remembered = () => { try { return localStorage.getItem(key()); } catch { return null; } };
  const remember = (v) => { try { if (localStorage.getItem(key()) !== v) localStorage.setItem(key(), v); } catch { /* (private mode: memory only) */ } };
  function switchOn() {
    if (!G.cfg) return false;
    const v = H.hubLive && H.hubLive() ? String(H.attr(G.cfg.switch, "switch") ?? "").toLowerCase() : "";
    if (v === "on" || v === "off") { G.known = v; G.state = `hub: ${v}`; remember(v); return v === "on"; }
    const last = G.known || remembered();
    G.state = `unknown (last ${last || "never"})`;
    if (last === "off") return Date.now() - loadedAt < FIRST_WAIT_MS && !G.known;   // (just loaded: wait for the hub)
    return true;   // last known "on", or never known: locked
  }
  const generalSecs = () => { const v = window.Settings && Settings.v ? Settings.v.pinGeneralSeconds : undefined; return Number.isInteger(v) ? v : 60; };
  // Unlocked: only by the PIN typed on this lock (Unlock) after guest mode came on — not a PIN window that was open
  // before it (forgotten when it comes on: PinPad.lock), not a PIN typed for something else (an alert, a door). It lasts
  // a fixed time from that PIN entry — the panel's general PIN window, at most 5 minutes ("never" = 5 minutes);
  // touches don't stretch it — and ends sooner when the general window closes (nobody touched the screen). Then the
  // PIN is forgotten (PinPad.lock) and it locks again; a tap on the lock never counts as a touch that keeps it open.
  let unlockedAt = 0, revealAt = 0, revealMs = 0;
  const unlockMs = () => { const g = generalSecs(); return Math.min(g > 0 ? g * 1000 : NEVER_CAP_MS, NEVER_CAP_MS); };
  // the calendar shown: from the PIN on the card (or the lock's), for the unlock's time or the ticket's, whichever is shorter
  const revealed = () => {
    if (!revealAt) return false;
    // (while the pad is still up — the PIN not yet remembered — the reveal it just got counts)
    if (Date.now() - revealAt < Math.min(unlockMs(), revealMs) && (asking || (window.PinPad && PinPad.unlocked()))) return true;
    revealAt = 0;
    return false;
  };
  const unlocked = () => {
    if (!unlockedAt) return false;
    if (Date.now() - unlockedAt < unlockMs() && window.PinPad && PinPad.unlocked()) return true;
    unlockedAt = 0;
    if (window.PinPad && PinPad.unlocked()) PinPad.lock();
    return false;
  };

  function html() {
    const c = G.cfg, name = (H.devName && H.devName(c.switch)) || T("guest.theSwitch");
    return `<div class="gl-card">
        <div class="gl-clock num">${esc(H.time())}<small>${esc(H.ampm())}</small></div>
        <div class="gl-date">${esc(H.date())}</div>
        <div class="gl-t">${icon("lock", 26)}<span>${esc(T("guest.title"))}</span></div>
        <p class="gl-s">${esc(T("guest.locked"))}</p>
        <button class="bigbtn primary gl-unlock"${Acts.on("gl.unlock")}>${icon("lock", 22)} ${esc(T("guest.unlock"))}</button>
        ${window.PANEL_LIVE ? `<p class="gl-live">${esc(T(c.mode === "dark" ? "guest.liveDark" : "guest.livePin", { name }))}</p>` : ""}
      </div>`;
  }
  function show(on) {
    if (on && !el) {
      el = document.createElement("div");
      el.id = "guest-lock";
      el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", T("guest.lockedAria"));
      document.body.appendChild(el);
    }
    if (!el) return;
    el.hidden = !on;
    if (!on) { holdSky(false); return; }
    const darkMode = G.cfg.mode === "dark", off = darkMode && !G.awake;
    el.className = `gl ${darkMode ? "gl-dark" : "gl-pin"}${off ? " gl-off" : ""}`;
    const inner = html();
    if (el.dataset.html !== inner) { el.innerHTML = inner; el.dataset.html = inner; }
    holdSky(off);
  }
  // (black: the sky and its effects stop drawing — nothing to see, and the tablet stays cool)
  function holdSky(on) {
    const sky = window.App && App.sky; if (!sky) return;
    if (on && !skyHeld) { skyHeld = true; sky.glHeld = sky.hold; sky.hold = true; }
    else if (!on && skyHeld) { skyHeld = false; sky.hold = !!sky.glHeld; }
  }
  // the moment it locks: nothing left open above the page — a pop-up (a PIN pad or an "Are you sure?" too: they sit
  // above the lock; only the lock's own PIN pad stays), Settings, a full-screen camera
  function closeAll() {
    if (window.Settings && Settings.open) Settings.hide();
    if (window.UI && UI.close && UI.isOpen && UI.isOpen() && !asking) UI.close();
    if (window.Cameras && Cameras.closeFull) Cameras.closeFull();
  }
  // while locked nothing under the lock can be reached by keyboard either: every other part of the page is inert —
  // but the lock, a level 4–5 alert (#alerts, its announcement) and the pop-ups (the lock's PIN pad)
  const KEEP = new Set(["guest-lock", "alerts", "alert-live"]);
  function inert(on) {
    for (const n of document.body.children) {
      if (KEEP.has(n.id) || n.classList.contains("popup-host") || n.tagName === "SCRIPT") continue;
      if (on && !n.inert) { n.inert = true; n.dataset.glInert = "1"; }
      else if (!on && n.dataset.glInert) { n.inert = false; delete n.dataset.glInert; }
    }
  }
  function tick() {
    const on = switchOn();
    if (on !== G.on) {
      G.on = on; if (!on) G.awake = false;
      // (guest mode came on: a PIN window open from before is forgotten — only the PIN typed on the lock unlocks)
      if (on) { unlockedAt = revealAt = 0; if (window.PinPad && PinPad.unlocked()) PinPad.lock(); }
    }
    if (G.cfg && G.cfg.mode === "dark" && G.awake && !asking && Date.now() - Math.max(wokeAt, lastTouch) > G.cfg.idle * 1000) G.awake = false;
    const open = unlocked();
    const locked = on && G.cfg.mode !== "none" && !open;
    if (locked && !G.locked) { closeAll(); G.awake = false; }
    G.locked = locked;
    // the calendar cards: blurred while it's on (and not shown with a ticket) — drawn so by UI.calendar, so a change
    // redraws the page; the events themselves dropped while blurred (data.js), loaded as usual once guest mode is off
    const blurred = on && !!G.cfg.blur && !revealed();
    if (H.hideEvents) { if (blurred) H.hideEvents(true); else if (!(on && G.cfg.blur)) H.hideEvents(false); }
    if (blurred !== G.blurred) { G.blurred = blurred; document.documentElement.classList.toggle("guest-blur", blurred); if (H.refresh) H.refresh(); }
    document.documentElement.classList.toggle("guest-locked", locked);
    show(locked);
    inert(locked);
  }
  // a touch: keeps an unlock open (pinpad.js does too) and, on the black screen, wakes the lock layer — that first
  // touch only wakes it (the layer is on top: nothing under it is pressed)
  addEventListener("pointerdown", (e) => {
    if (!(el && el.contains(e.target))) lastTouch = Date.now();
    else if (G.awake) wokeAt = Date.now();   // (on the woken lock: keeps it from going black while someone is at it)
    if (G.locked && G.cfg && G.cfg.mode === "dark" && !G.awake && el && el.contains(e.target)) { G.awake = true; wokeAt = Date.now(); e.preventDefault(); tick(); }
  }, true);

  const pinApi = async (body) => {
    const r = await fetch("/api/pin", body ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  };
  const PIN_ERR = { "wrong-pin": "pin.wrong", "bad-format": "pin.badFormat", unset: "pin.unset" };
  async function unlock() {
    if ((!G.locked && !G.blurred) || asking || !window.PinPad) return;
    const why = T(G.locked ? "guest.pinUnlock" : "guest.pinCalendar");
    asking = true;
    try {
      let st; try { st = await pinApi(); } catch { st = { status: 0 }; }
      if (st.status === 200 && st.set) {
        // (a panel with the calendar blurred: the PIN asks the reveal ticket — that checks the PIN too; else just the check)
        const wantCal = !!(G.cfg && G.cfg.blur);
        // (the events are fetched while the pad is still up: a reveal that fails says so on the pad — never a silent
        // "nothing happened"; on a locked panel the right PIN still unlocks, and a note says the calendar didn't come)
        let calFailed = false;
        const CAL_ERR = T("guest.calFailed");
        const pin = await PinPad.ask({ title: T("guest.title"), text: why, check: async (p) => {
          let r; try { r = await pinApi(wantCal ? { action: "ticket", purpose: "reveal", panel: pid(), pin: p } : { action: "verify", pin: p }); } catch { return { ok: false, msg: T("pin.serviceDown") }; }
          if (!r.ok) return r.error === "locked" || +r.lockedFor > 0 ? PinPad.refusal(r) : { ok: false, msg: T(PIN_ERR[r.error] || "pin.cantCheck") };
          if (!wantCal) return { ok: true };
          const ticket = typeof r.ticket === "string" ? r.ticket : Array.isArray(r.tickets) ? r.tickets[0] : null;
          const secs = Math.min(Math.max(+r.seconds || +r.ttl || unlockMs() / 1000, 1), 300);
          revealAt = Date.now(); revealMs = secs * 1000;   // (before the fetch: the 400 ms check mustn't drop it meanwhile)
          if (ticket && H.revealEvents && (await H.revealEvents(ticket, secs))) return { ok: true };
          revealAt = 0; if (H.hideEvents) H.hideEvents(true);
          if (G.locked) { calFailed = true; return { ok: true }; }
          return { ok: false, msg: CAL_ERR };
        } });
        if (pin) {
          lastTouch = Date.now();
          if (G.locked) unlockedAt = lastTouch;
          PinPad.remember(pin); if (window.PanelStore && PanelStore.setPin) PanelStore.setPin(pin);
          if (calFailed) { asking = false; tick(); await PinPad.confirm({ title: T("guest.title"), yes: T("common.ok"), text: T("guest.unlockedNoCal") }); }
        }
      } else {
        // (no panel PIN set — or the service can't be reached: say so; with no PIN there is nothing to unlock with)
        await PinPad.confirm({ title: T("guest.title"), yes: T("common.ok"),
          text: T(st.status === 200 || st.status === 404 ? "guest.noPin" : "guest.serviceDown") });
      }
    } finally { asking = false; wokeAt = Date.now(); tick(); }
  }

  // the doorbell's / an alert's camera pop-up: not while locked (a guest would see the cameras; on the black screen it
  // would wake it) — the alert itself still shows
  const wrapCameras = () => {
    if (!window.Cameras || !Cameras.onShow || Cameras.onShow.glWrapped) return;
    const orig = Cameras.onShow;
    Cameras.onShow = (msg) => (G.locked ? undefined : orig(msg));
    Cameras.onShow.glWrapped = true;
  };

  Acts.add({ "gl.unlock": () => unlock(), "gl.showCal": () => unlock() });
  // (every 400 ms: the switch, the PIN window, the black screen's idle time; the clock with it)
  // (the switch's event itself locks at once — the lock and inert in the same moment, data.js onHubSaid; the 400 ms check
  // stays as the backstop: the PIN window, the black screen's idle time, the clock)
  if (H.onHubSaid) H.onHubSaid((id) => { if (G.cfg && (id == null || id === G.cfg.switch)) tick(); });
  const start = () => { wrapCameras(); tick(); setInterval(tick, 400); };
  if (document.body) start(); else addEventListener("DOMContentLoaded", start);
  G.tick = tick;
  window.GuestLock = G;
})();
