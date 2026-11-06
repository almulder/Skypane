// Alarm (Hubitat Safety Monitor) + the alert overlay + LED strip colours + spoken announcements.
//
// Every alert RULE lives in Hubitat: a rule pushes a level 1–5 alert with the Skypane Notifier
// (hubalerts.js); the panel only shows it, sounds it and sends every dismissal back (panelAck / panelAckAll). The
// panel raises nothing itself — not from a leak / smoke / freezer sensor, not from HSM's intrusion (a Hubitat rule
// pushes a level 4–5 for that too).
// The alarm is Hubitat's own (HSM): the bridge publishes its status (retained hubitat/hsm {status, alert, at});
// arming / disarming from a panel always asks the panel PIN — the dashboard service checks it over HTTP and gives a
// one-time ticket for exactly this action (device 0, "setHsm", action); only the ticket goes over MQTT
// (hubitat/hsm/set), the bridge answers on hubitat/hsm/result. No code ever lives in the page. The builder's demo
// canvas just shows a change.
//
// LED rules:
//   a Hubitat level 4–5 alert not yet dismissed → flashing red
//   a level 3 alert up → orange
//   armed (home or away) → red
//   just disarmed → green for 1 minute
//   otherwise → theme colour (purple by default)
(function () {
  const H = Home, S = Home.state;
  const LED_TOPIC = () => `panelagent/${Home.kiosk()}/led/set`;   // (this panel's own name: data.js Home.kiosk)
  const TTS_TOPIC = () => `freekiosk/${Home.kiosk()}/set/tts`;
  const STATUS = {
    // (the words in the panel's language when asked: strings/en.js "alarm.st.*" / "alarm.short.*")
    disarmed: { get text() { return T("alarm.st.disarmed"); }, color: "var(--ok)", icon: "shield" },
    armedHome: { get text() { return T("alarm.st.armedHome"); }, get short() { return T("alarm.short.home"); }, color: "var(--bad)", icon: "lock" },
    armedNight: { get text() { return T("alarm.st.armedNight"); }, get short() { return T("alarm.short.night"); }, color: "var(--bad)", icon: "lock" },
    armedAway: { get text() { return T("alarm.st.armedAway"); }, get short() { return T("alarm.short.away"); }, color: "var(--bad)", icon: "lock" },
    armingHome: { get text() { return T("alarm.st.armingHome"); }, get short() { return T("alarm.short.arming"); }, color: "var(--warn)", icon: "lock" },
    armingNight: { get text() { return T("alarm.st.armingNight"); }, get short() { return T("alarm.short.arming"); }, color: "var(--warn)", icon: "lock" },
    armingAway: { get text() { return T("alarm.st.armingAway"); }, get short() { return T("alarm.short.arming"); }, color: "var(--warn)", icon: "lock" },
    unknown: { get text() { return T("alarm.st.unknown"); }, color: "var(--muted)", icon: "shieldOff" },
  };
  const SAY = { armedAway: "alarm.say.armedAway", armedHome: "alarm.say.armedHome", armedNight: "alarm.say.armedNight", disarmed: "alarm.say.disarmed" };
  // what a panel may ask HSM to do (the bridge accepts exactly these)
  // ([label, icon, class] — the label in the panel's language when it's read: strings/en.js "alarm.act.*")
  const act = (key, ic, cls) => { const a = [null, ic, cls]; Object.defineProperty(a, 0, { get: () => T(key), enumerable: true }); return a; };
  const ACTIONS = { armAway: act("alarm.act.armAway", "away", "bad"), armHome: act("alarm.act.armHome", "home", "warn"), armNight: act("alarm.act.armNight", "moon", "warn"),
    disarm: act("alarm.act.disarm", "shield", "ok"), cancelAlerts: act("alarm.act.cancelAlerts", "x", "ok") };

  const A = { STATUS, ACTIONS, disarmedAt: 0, keypadOpen: false, pinOpen: false, live: false, busy: false };
  try { sessionStorage.removeItem("panel.alerts.acked"); } catch {}   // (the old local sensor alerts' dismissals)
  // the full-screen alert up now: Hubitat's front alert when it's a level 4–5 (hubalerts.js; one at a time) — app.js /
  // bench.js ask "is an alert showing?"
  const hubBig = () => (window.HubAlerts ? HubAlerts.big() : []);
  Object.defineProperty(A, "alerts", { get: hubBig, enumerable: true });

  // everything the panel says goes through status.js PanelSpeech (one volume; muted = only a level 5): a Hubitat alert
  // at its own level (hubalerts.js), the alarm's own words ("Alarm armed") at 2.
  A.say = (text, lvl = 2, id) => !!(window.PanelSpeech && PanelSpeech.alert(text, lvl, id));
  // (until the bridge has told us, the alarm's state isn't known; alert = HSM's own alert, e.g. "intrusion")
  S.alarm = { status: "unknown", by: null, source: null, at: null, log: [], alert: "" };
  if (window.PANEL_DESIGN === true) { S.alarm.status = "disarmed"; A.live = true; }   // (the builder's demo: try it)
  A.info = () => STATUS[S.alarm.status] || STATUS.unknown;
  A.isArmed = () => /^arm/.test(S.alarm.status);

  // ---------- HSM's status, from the bridge ----------
  const KNOWN = new Set(["disarmed", "armedAway", "armedHome", "armedNight", "armingAway", "armingHome", "armingNight"]);
  H.subscribe("hubitat/hsm", (msg) => {
    let m; try { m = JSON.parse(msg); } catch { return; }
    if (!m || typeof m !== "object" || !KNOWN.has(m.status)) return;
    const was = S.alarm.status, at = Number.isFinite(m.at) ? new Date(m.at * 1000) : new Date();
    A.live = true;
    if (m.status !== was) {
      S.alarm = { ...S.alarm, status: m.status, by: "Hubitat", source: null, at };   // i18n-ok (the hub's name)
      S.alarm.log = [{ status: m.status, at }, ...(S.alarm.log || [])].slice(0, 20);
      if (m.status === "disarmed" && was !== "unknown") { A.disarmedAt = Date.now(); A.say(T("alarm.say.disarmed")); }
      else if (SAY[m.status] && was !== "unknown") A.say(T(SAY[m.status]));
    }
    // HSM's own alert (e.g. "intrusion…"): no overlay of its own here (a Hubitat rule pushes a level 4–5 for it) —
    // only the keypad's "Cancel the alarm" while it's up
    S.alarm.alert = typeof m.alert === "string" && /^intrusion/.test(m.alert) && A.isArmed() ? m.alert.slice(0, 40) : "";
    H.refresh(); A.updateLed();
  });
  let waiting = null;
  H.subscribe("hubitat/hsm/result", (msg) => { try { const r = JSON.parse(msg); if (waiting && r && r.action === waiting.action) waiting.done(r); } catch {} });
  const MSG_KEY = { "unknown-action": "alarm.err.unknownAction", "no-ticket": "alarm.err.noTicket", "bad-ticket": "alarm.err.badTicket",
    rate: "alarm.err.rate", "hub-error": "alarm.err.hub", timeout: "alarm.err.timeout", malformed: "alarm.err.malformed" };
  const MSG = new Proxy({}, { get: (o, k) => (MSG_KEY[k] ? T(MSG_KEY[k]) : undefined) });
  const panelId = () => ((window.PanelStore && PanelStore.id) || "main").toLowerCase();

  // arm / disarm / cancel: "Are you sure?" (arming only) + the panel PIN → a ticket → the bridge → HSM
  A.request = async (action) => {
    if (!ACTIONS[action] || A.busy) return;
    if (window.PANEL_DESIGN === true) {   // (the demo: shown, nothing sent)
      S.alarm = { ...S.alarm, status: action === "disarm" || action === "cancelAlerts" ? "disarmed" : action.replace("arm", "armed") };
      UI.close(); H.refresh(); return;
    }
    if (!A.live) return window.PinPad && PinPad.confirm({ title: T("alarm.notConnected"), text: T("alarm.notConnectedText"), yes: T("common.ok") });
    if (!window.PinPad) return;
    A.busy = true;
    try {
      const [label] = ACTIONS[action];
      // (the alarm window: within pinAlarmSeconds of a PIN entry, no pad — Manager → Panels → Safety)
      await PinPad.ask({ title: T("pin.title"), text: label, window: "alarm", purpose: action === "disarm" || action === "cancelAlerts" ? "disarm" : "general", check: async (pin) => {
        let j = {};
        try {
          const r = await fetch("/api/pin", { method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "ticket", pin, panel: panelId(), items: [[0, "setHsm", action]] }) });
          j = await r.json().catch(() => ({}));
        } catch { return { ok: false, msg: T("pin.serviceDown") }; }
        if (!j.ok || !Array.isArray(j.tickets)) return PinPad.refusal(j);
        const res = await new Promise((resolve) => {
          const t = setTimeout(() => { waiting = null; resolve({ ok: false, reason: "timeout" }); }, 12000);
          waiting = { action, done: (r) => { clearTimeout(t); waiting = null; resolve(r); } };
          H.publish("hubitat/hsm/set", { action, ticket: j.tickets[0], panel: panelId() });
        });
        return res.ok ? { ok: true } : { ok: false, msg: MSG[res.reason] || T("alarm.err.notDone"), done: res.reason === "timeout" };
      } });
      UI.close();
    } finally { A.busy = false; H.refresh(); }
  };

  // ---------- the keypad: the alarm's state and what can be done now (each asks the PIN) ----------
  // While the keypad is open any alert overlay is hidden behind it; closing it re-renders, so an alert that is still
  // up shows again.
  A.open = () => {
    A.keypadOpen = true; H.refresh(); A.updateLed(); // beeps pause while the keypad is up
    UI.popup(keypad, () => { A.keypadOpen = false; H.refresh(); A.updateLed(); });
  };
  A.choices = () => (A.isArmed() ? ["disarm", ...["armAway", "armHome", "armNight"].filter((a) => a.replace("arm", "armed") !== S.alarm.status && a.replace("arm", "arming") !== S.alarm.status)]
    : ["armAway", "armHome", "armNight"]).concat(S.alarm.alert ? ["cancelAlerts"] : []);
  function keypad() {
    const info = A.info(), hsm = S.alarm.at ? T("alarm.hsmAt", { time: T.time(S.alarm.at) }) : T("alarm.hsm");
    return { title: T("alarm.title"), body: `
      <div class="kp-status" style="color:${info.color}">${icon(info.icon, 26)}${UI.esc(info.text)}<small>${S.alarm.status !== "unknown" ? UI.esc(hsm) : ""}</small></div>
      <div class="kp-opts">${A.choices().map((a) => { const [label, ic, cls] = ACTIONS[a]; return `<button class="kp-opt ${cls || ""}"${Acts.on("alarm.request", a)}>${icon(ic, 34)}${UI.esc(label)}</button>`; }).join("")}</div>
      <p class="phint">${UI.esc(T("alarm.eachAsksPin"))}</p>` };
  }
  // (old name, used by the room pages' alarm chip)
  A.set = (status) => A.request(status === "disarmed" ? "disarm" : status.replace("armed", "arm"));

  // ---------- the overlay: Hubitat's level 4–5 alerts (hubalerts.js) ----------
  // Dismiss = "we know, we're on it": it asks for the panel PIN, then clears the alert shown on
  // EVERY panel and tells Hubitat (panelAck — a rule may silence the sirens with it); the next one, if any, comes up.
  // "Dismiss all" (2+ up): every alert this panel shows, one panelAckAll. (No PIN set yet, or still in the alarm window:
  // no pad — hubalerts.js tickets; the bridge wants a one-time PIN ticket with every level 4–5 dismissal.)
  // (the PIN pad is a pop-up under the overlay: the overlay steps aside while it asks, like for the keypad)
  // (hubalerts.js asks the PIN and gets the bridge's one-time ticket for each level 4–5 alert, v2.3.2)
  const stepAside = async (fn) => {
    if (!window.HubAlerts) return false;
    A.pinOpen = true; H.refresh();
    try { return await fn(); } finally { A.pinOpen = false; H.refresh(); }
  };
  A.dismiss = async () => {
    if (!(await stepAside(() => HubAlerts.dismissTop()))) return;
    A.say(T("alarm.say.dismissed"));
    H.refresh(); A.updateLed();
  };
  A.dismissHub = () => A.dismiss();   // (old name)
  A.dismissAll = async () => {
    if (!(await stepAside(() => HubAlerts.dismissAll()))) return;
    A.say(T("alarm.say.dismissedAll"));
    H.refresh(); A.updateLed();
  };

  // (every text is escaped in hubalerts.js: Hubitat alerts come from rules)
  A.overlay = () => {
    const hub = hubBig();
    if (!hub.length || A.keypadOpen || A.pinOpen || !window.HubAlerts) return "";
    // (one alert: the front one — hubalerts.js; the rest wait in the notification list. The icon: a siren for a level 5
    // — life safety — and a warning triangle for a 4 — damage)
    const ghost = "background:transparent;color:#fff;border:2px solid rgba(255,255,255,.65)";
    const all = HubAlerts.shown().length >= 2 ? `<button class="alert-btn alert-all" style="${ghost}"${Acts.on("alarm.dismissAll")}>${icon("x", 26)}${UI.esc(T("alert.dismissAll"))}</button>` : "";
    // (armed: the keypad one tap away — disarming asks the PIN there)
    const kp = A.isArmed() ? `<button class="alert-btn" style="${ghost}"${Acts.on("alarm.open")}>${icon("lock", 26)}${UI.esc(T("alert.alarm"))}</button>` : "";
    // ("Silence without the PIN", the admin's: the sound stops here, the alert stays — hubalerts.js)
    const hush = HubAlerts.canSilence() ? `<button class="alert-btn alert-silence" style="${ghost}"${Acts.on("hub.silence")}>${icon("volumeOff", 26)}${UI.esc(T("alert.silence"))}</button>` : "";
    const quietNow = (HubAlerts.refusal && HubAlerts.refusal(hub[0]) ? `<div class="alert-hint alert-refused" role="status"><b>${UI.esc(HubAlerts.refusal(hub[0]))}</b></div>` : "")
      + (HubAlerts.silenced(hub[0]) ? `<div class="alert-hint">${UI.esc(T("alert.silenced"))}</div>` : "");
    // (v2.7.2, screen readers: an alert dialog named by its title — afterOverlay announces it and moves the focus)
    return `<div class="alert-layer${hub[0].lvl < 5 ? " l4" : ""}"><div class="alert-card" role="alertdialog" aria-modal="true" aria-labelledby="alert-t" aria-describedby="alert-w">
      <div class="alert-icon">${HubAlerts.icon ? HubAlerts.icon(hub[0], 64) : icon(hub[0].lvl === 5 ? "siren" : "warning", 64)}</div>
      ${HubAlerts.overlayRows()}
      <div class="alert-btns" style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center"><button class="alert-btn"${Acts.on("alarm.dismiss")}>${icon("x", 26)}${UI.esc(T("alert.dismiss"))}</button>${hush}${all}${kp}</div>
      ${quietNow}<div class="alert-hint">${UI.esc(T(HubAlerts.isWeather && HubAlerts.isWeather(hub[0]) ? "alert.clearsWeather" : "alert.clearsEverywhere"))}</div>
    </div></div>`;
  };
  // after #alerts was redrawn (app.js): a new level 4–5 alert is said at once (an assertive live region: its level,
  // title and text) and the focus goes to "Dismiss — we're on it", so a keyboard / switch user is on it first
  let said = "";
  A.afterOverlay = (root) => {
    let live = document.getElementById("alert-live");
    if (!live) {
      live = document.createElement("div"); live.id = "alert-live"; live.className = "sr-only";
      live.setAttribute("aria-live", "assertive"); live.setAttribute("role", "alert");
      document.body.appendChild(live);
    }
    const card = root && root.querySelector(".alert-card");
    if (!card) { said = ""; return; }
    const words = [".alert-lvl", "#alert-t", "#alert-w"].map((s) => (card.querySelector(s) || {}).textContent || "").map((t) => t.trim()).filter(Boolean).join(". ");
    if (words !== said) { said = words; live.textContent = words; }
    const first = card.querySelector(".alert-btn");
    if (first && !card.contains(document.activeElement)) first.focus({ preventScroll: true });
  };
  // (and Tab stays in it — a modal alert dialog, over a pop-up too: ui.js leaves the keyboard to it)
  document.addEventListener("keydown", (e) => {
    const card = e.key === "Tab" && document.querySelector(".alert-card"); if (!card) return;
    const f = [...card.querySelectorAll("button:not([disabled])")]; if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    e.preventDefault(); e.stopPropagation();
    f[e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === -1 || i === f.length - 1 ? 0 : i + 1)].focus();
  }, true);
  // Home's alert lines: Hubitat's levels 2–3 (hubalerts.js)
  A.banner = () => (window.HubAlerts ? HubAlerts.bannerHtml() : "");

  // ---------- LED strip ----------
  let ledLast = "", flashTimer = null, flashOn = false;
  const send = (state) => {
    // (a tablet without our LED strip / panel agent: Manager → Panels → General → LED strip off)
    if (!H.isPanel || (window.Settings && Settings.v.ledStrip === false)) { ledLast = ""; return; }
    const key = JSON.stringify(state); if (key === ledLast) return; ledLast = key;
    H.publish(LED_TOPIC(), state);

  };
  // (v3.0.2 rev. 2) the LED agent (re)connected — agentlink.js: led/set isn't retained and send() skips repeats, so the
  // state now is sent again
  A.resendLed = () => { ledLast = ""; A.updateLed(); };
  A.ledState = () => {
    // (orange while anything that needs doing is up — a level 3+, on screen or waiting in the list)
    const warn = window.HubAlerts && HubAlerts.shown().some((a) => a.lvl >= 3);
    if (hubBig().length) return { name: T("led.alert"), rgb: [255, 0, 0], flash: true };
    if (warn) return { name: T("led.warning"), rgb: [255, 90, 0] };
    if (A.isArmed()) return { name: T("led.armed"), rgb: [255, 0, 0] };
    if (Date.now() - A.disarmedAt < 60000) return { name: T("led.disarmed"), rgb: [0, 255, 40] };
    return { name: T("led.normal"), rgb: (window.Settings && Settings.ledColor()) || [139, 92, 246] };
  };
  A.updateLed = () => {
    // (after every settings change and every new alert list. The beeps: hubalerts.js loud — while a level 4–5 is on
    // screen, also in quiet hours; paused while the keypad is up)
    Sound.alertsOn(!!window.HubAlerts && HubAlerts.loud() && !A.keypadOpen);
    A.notifyLight();
    const st = A.ledState(), bri = Math.round(255 * ((window.Settings && Settings.v.ledBrightness) ?? 0.8));
    const on = { state: "ON", color: { r: st.rgb[0], g: st.rgb[1], b: st.rgb[2] }, brightness: bri };
    A.led = st;
    if (st.flash) {
      if (!flashTimer) flashTimer = setInterval(() => { flashOn = !flashOn; send(flashOn ? on : { state: "OFF" }); }, 600);
    } else {
      clearInterval(flashTimer); flashTimer = null;
      send(on);
    }
  };
  setInterval(A.updateLed, 5000); // green → purple after a minute

  // ---------- notification light (any tablet) ----------
  // A panel without the LED strip can use any Hubitat light or light group instead (Manager → Panels → Alerts:
  // settings "notifyLight" = its device id). While an alert is up it pulses (red if it's a colour light) — a light for
  // 3 minutes, a group (every member gets each command) slower and for 1 minute —, then stays on; when the alerts are
  // dismissed it goes back to how it was. Only the panel itself switches it (a laptop viewing the page doesn't; an
  // Android phone opening the panel's page counts as the panel). What it was is kept in localStorage until the
  // restore has really gone out, so a reload or a hub / MQTT drop mid-alert still puts it back (within an hour).
  // A light that needs the panel PIN to switch on (Manager → Devices) can't be used: it's left alone.
  const NL_KEY = () => `notifylight.${(window.PanelStore && PanelStore.id) || "none"}`;   // (v3.0.5: no "main" — this browser's own, with no panel)
  let nl = null, nlTimer = null;   // nl = { id, was: {on, level, hue, sat, ct, mode, unknown}, rgb, dim, group, started }
  let nlPending = null;            // a restore still to send (the hub was away when the alerts ended)
  const nlFind = (id) => { for (const r of S.rooms) for (const d of r.devices) if (d.id === id) return d; return null; };
  const nlSend = (id, command, value) => H.publish("hubitat/cmd", value == null ? { id, command } : { id, command, value });
  const nlStore = (v) => { try { if (v) localStorage.setItem(NL_KEY(), JSON.stringify(v)); else localStorage.removeItem(NL_KEY()); } catch {} };
  const nlLoad = () => {
    let v = null; try { v = JSON.parse(localStorage.getItem(NL_KEY())); } catch {}
    return v && typeof v === "object" && Number.isFinite(v.id) && v.was && Date.now() - (+v.started || 0) < 3600000 ? v : null;
  };
  function nlStart(id) {
    const d = nlFind(id);
    if (!d || d.kind !== "light" || !H.hub.live || H.hub.pending.has(id)) return;   // (a tap on it still on its way: next tick)
    if (H.mayControl && !H.mayControl(id)) return;   // (a group's rule: not from this panel)
    if (H.needsPin && H.needsPin(id, "on")) { if (!nlStart.warned) { nlStart.warned = true; console.warn("[alarm] the notification light needs the panel PIN to switch on — not used"); } return; }
    // a restore not sent yet (or left from before a reload) for this light: that's still what it really was
    const left = nlPending && nlPending.id === id ? nlPending : (nlLoad() || {}).id === id ? nlLoad() : null;
    nl = left ? { ...left, started: Date.now() }
      : { id, was: { on: !!d.on, level: d.level, hue: d.hue, sat: d.sat, ct: d.ct, mode: d.mode, unknown: !!d.unknown },
          rgb: !!d.rgb, dim: !!d.dim, group: !!d.group, setColor: d.colorCmd === "setColor", started: Date.now() };
    nlPending = null;
    nlStore(nl);
    if (nl.rgb) nlColor(nl, 0, 100);
    nlSend(id, nl.dim ? "setLevel" : "on", nl.dim ? 100 : null);
    let bright = true;
    const every = nl.group ? 4000 : 2000, until = nl.group ? 60000 : 180000;
    nlTimer = setInterval(() => {
      if (Date.now() - nl.started > until) { clearInterval(nlTimer); nlTimer = null; nlSend(id, nl.dim ? "setLevel" : "on", nl.dim ? 100 : null); return; }
      bright = !bright;   // a dimmable light pulses 100 % ↔ 15 % (gentler on the bulbs and the mesh than on/off)
      if (nl.dim) nlSend(id, "setLevel", bright ? 100 : 15); else nlSend(id, bright ? "on" : "off");
    }, every);
  }
  // a colour the way the light wants it (Manager → Devices → Colour command)
  const nlColor = (n, hue, sat) => { if (n.setColor) nlSend(n.id, "setColor", `${Math.round(hue)},${Math.round(sat)}`); else { nlSend(n.id, "setHue", hue); nlSend(n.id, "setSaturation", sat); } };
  // send the restore; false = the hub isn't there (kept for later)
  function nlRestore(n) {
    if (!H.hub.live) return false;
    const w = n.was || {}, id = n.id;
    if (n.rgb && w.mode === "RGB" && w.hue != null) nlColor(n, w.hue, w.sat ?? 100);

    else if (w.ct >= 1500 && w.ct <= 9000) { if (n.rgb) nlSend(id, "setSaturation", 0); nlSend(id, "setColorTemperature", w.ct); }
    else if (n.rgb) nlSend(id, "setSaturation", 0);   // (no colour known before: at least not red any more)
    if (n.dim && w.level >= 1 && w.level <= 100) nlSend(id, "setLevel", w.level);
    if (!w.unknown) nlSend(id, w.on ? "on" : "off");   // (unknown before: left on rather than guessed off)
    return true;
  }
  function nlStop() {
    clearInterval(nlTimer); nlTimer = null;
    if (nl && !nlRestore(nl)) nlPending = nl;   // (still in localStorage too)
    else nlStore(null);
    nl = null;
  }
  A.notifyLight = () => {
    const id = window.Settings && +(Settings.v.notifyLight || 0);
    const want = H.isPanel && !!id && hubBig().length > 0;
    if (want && (!nl || nl.id !== id)) { if (nl) nlStop(); nlStart(id); }
    else if (!want && nl) nlStop();
    // a restore that couldn't go out yet (hub away, or left from before a reload): send it once the hub is back
    if (!nl && H.isPanel && H.hub.live) {
      const left = nlPending || nlLoad();
      if (left && !(want && left.id === id)) { if (nlRestore(left)) { nlPending = null; nlStore(null); } }
    }
  };

  // the keypad's and the full-screen alert's buttons (acts.js)
  Acts.add({ "alarm.request": (a) => Alarm.request(a), "alarm.dismissAll": () => Alarm.dismissAll(), "alarm.open": () => Alarm.open(),
    "alarm.dismiss": () => Alarm.dismiss(), "hub.silence": () => HubAlerts.silence() });
  window.Alarm = A;
})();
