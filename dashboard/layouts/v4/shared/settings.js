// Settings page (small gear). Saved per panel on the dashboard service (store.js, cached in this browser); the
// settings PIN will come from Hubitat.
// "Look" changes are applied with a safety net: Apply → 5 s preview of the home screen → 10 s countdown →
// reverts automatically unless "Keep" is tapped (like Windows does after a resolution change).
(function () {
  const KEY = "panel.settings.v4";
  const H = Home;
  const TINTS = { theme: { name: "Match theme" }, charcoal: { name: "Charcoal", rgb: "28,28,34" }, navy: { name: "Navy", rgb: "14,24,52" },
    black: { name: "Black", rgb: "6,6,10" }, plum: { name: "Plum", rgb: "48,18,52" }, slate: { name: "Slate", rgb: "40,48,62" } };
  const LOOK_DEFAULTS = { theme: "purple", background: "mountains", cardAlpha: 0.72, cardTint: "theme",
    clockStyle: "thin", clockFont: "system", clockScale: 1.12, uiFont: "system", uiScale: 1,
    sky: "on", skyColors: "theme" };   // the animated sky (off behind an own picture without a sky); theme / realistic colours
  const DEFAULTS = {
    look: LOOK_DEFAULTS,
    volume: { speech: 0.8, sounds: 0.5, alerts: 0.9 },
    chime: { on: false, every: "hour", style: "westminster", quietOn: true, quietFrom: 22, quietTo: 7 },
    // live weather + the real day/night (demo: random effects, 30 s day/night); offUntil = paused until (ms);
    // disabled = {weather code: true} for conditions that should never show with live weather
    effects: { mode: "live", cycle: false, offUntil: 0, disabled: {}, maxLoad: 0, place: "front" },   // place: in front of / behind the Home cards
    ledBrightness: 0.8, childLock: false, autoLock: { on: false, minutes: 15 },
    ledStrip: false,         // this tablet has our LED strip (panel agent); false = never send it anything (round 2: a new
                             // panel starts without — the kitchen panel "main", saved before, keeps it: load() below)
    insideSensor: "panel",   // inside temperature / humidity: "panel" (this tablet's sensors), a Hubitat device id, "none"

    alertBeeps: true, allowUnlock: false,
    // alerts from Hubitat rules — the only alerts (hubalerts.js; Manager → Panels → Alerts, the admin only): the lowest
    // level shown (a level 5 always), quiet hours (-1 = none) or Hubitat modes (the mode wins), a level 4 sounding in
    // quiet hours too, "Silence" without the PIN on the full-screen card
    alertMinLevel: 1, quietFrom: -1, quietTo: -1, quietModes: [], quietLevel4: true, alertSilence: false,

    notifyLight: 0,          // a Hubitat light / light group that pulses during an alert (alarm.js; set in the Manager)
    people: [], calendars: [{ id: "john", name: "Calendar 1", color: "#8b5cf6", on: true },
                            { id: "jane", name: "Calendar 2", color: "#ec4899", on: true }],
    hiddenRooms: {}, hiddenDevices: {},
    extraDevices: {},        // {room id: [device ids]} — devices from other rooms this panel also shows there (Manager)
    deviceOrder: {},         // {room id: [device ids]} — this panel's order (press and hold on the room page)
    homeAfter: 0,            // s without a touch before a room / camera page goes back to Home (0 = never; not Music)
    pinGeneralSeconds: 60,   // the panel PIN stays unlocked this long after the last touch (pinpad.js; 0 = never relocks)
    pinAlarmSeconds: 30,     // … for arm / disarm / dismissing a level 4–5: this long after the PIN (0 = never relocks)
    arrangeOnPanel: false,   // press and hold on the panel to arrange rooms / devices (else only on the Manager page)
    roomOrder: [],
           // this panel's order of the room buttons (room ids; rooms not listed follow in Hubitat's order)
    roomLayout: "G",         // room pages: a RoomLayouts key (only loaded ones count; "classic" = the original room(), "list")
    roomLayouts: {},         // {room id: layout} — a room's own (Manager → Panels → Look & layout)
    homeLayout: "classic",   // app.js HOME_LAYOUTS ("classic" = the kitchen panel's, built in)
    homeGrid: null,          // homeLayout "custom": the owner's grid of cards (Manager; grid.js, service/layouts.py)
    dockAt: "bottom",        // the room bar: bottom / top / left / right
    dockOff: false,          // true = no room bar at all (a new panel, set by the Manager): only the settings gear
    dockStyle: "pill",       // how it's drawn (Manager → Look & layout): pill / rail / segmented / tabs / chips / split
    dockLabels: null,        // its names shown (true / false; null = the style's own: a rail has none)
    dockAutoHide: false,     // folded to a small handle (alarm, the page, alerts waiting) until tapped

    // go2rtc: only for a separate go2rtc (Settings → Cameras); the built-in one (stage 3) needs nothing here
    cameras: { go2rtc: "", autoSeconds: 60 },
    music: { url: "" },                                                // a music page, e.g. a Sonos Panel (the Music button; none = no button)
  };
  const merge = (d, s) => { const o = structuredClone(d); if (s) for (const k of Object.keys(s)) o[k] = d[k] && typeof d[k] === "object" && !Array.isArray(d[k]) ? merge(d[k], s[k]) : s[k]; return o; };
  // the server can supply this install's defaults (Manager page settings: GO2RTC_URL, SONOS_PANEL_URL) — window.PANEL_CONFIG
  const PC = window.PANEL_CONFIG || {};
  if (PC.go2rtc) DEFAULTS.cameras.go2rtc = PC.go2rtc;
  if (PC.sonosPanelUrl) DEFAULTS.music.url = PC.sonosPanelUrl;
  // the dashboard service runs go2rtc itself (stage 3): video from the address this page came from, port go2rtcPort
  const BUILTIN_GO2RTC = PC.go2rtcPort ? `http://${location.hostname}:${+PC.go2rtcPort}` : null;
  const OLD_KEYS = ["alertsOff", "freezerMax", "alertsShow", "alertLevel5", "pinUnlockSeconds"];
  // saved in this panel's store on the dashboard service (store.js; cached in the browser); KEY = the old browser key
  // a presence device's label → the person: "Phone - Jane's" → "Jane" (a "<app or device> - " prefix, a trailing 's)
  const personName = (label) => String(label || "").replace(/^[^-]{1,24}\s-\s*/, "").replace(/['’]s$/i, "").trim() || String(label || "");
  const load = () => {
    let v; try { v = merge(DEFAULTS, window.PanelStore ? PanelStore.get("settings") : null); } catch { v = structuredClone(DEFAULTS); }
    // (the panel's own alert rules are gone — Hubitat makes them: their old saved settings are dropped quietly)
    for (const k of OLD_KEYS) delete v[k];
    // (the LED strip was "on" by default until round 2: the kitchen panel's saved settings without the word keep it)
    try { const s = window.PanelStore && PanelStore.get("settings"); if (s && typeof s === "object" && !("ledStrip" in s) && PanelStore.id.toLowerCase() === "main") v.ledStrip = true; } catch {}
    // first run: show the house's presence people (a location app's device per person: "Phone - John" → "John") — not the
    // room-presence sensors that report "present" too (mmWave, motion / occupancy)
    const NOT_PERSON = /presence sensor|mm-?wave|motion|occupan|radar|fp[12]/i;
    if (!v.people.length) v.people = (window.HUBITAT?.presence || []).filter((p) => !NOT_PERSON.test(`${p.label} ${p.type}`)).slice(0, 8)
      .map((p, i) => ({ id: p.id, name: personName(p.label), color: ["#8b5cf6", "#ec4899", "#22d3ee", "#f59e0b"][i % 4], image: null }));
    return v;
  };

  const St = { v: load(), TINTS, LOOK_DEFAULTS, open: false, unlocked: false, tab: "look", draft: null };
  // while a look is being previewed (not yet kept) the saved copy keeps the previous look, so a crash or
  // reload during the countdown can never leave an unconfirmed look behind
  let pending = null;
  // path = the setting that changed (the store then merges only that part with other screens' edits);
  // none = the whole settings object
  const save = (path) => { if (window.PanelStore) PanelStore.set("settings", structuredClone(pending ? { ...St.v, look: pending.prev } : St.v), path ? [path] : undefined); };
  const applyAll = () => { St.applyLook(); window.Sound && Sound.applyVolumes(); window.Alarm && Alarm.updateLed(); window.App && App.settingsChanged("all"); };
  // the service's copy arrived, or another screen changed this panel's settings: take it (unless a look preview is
  // running here — keeping/reverting it takes the store's copy then). While a text field in Settings has focus the
  // page isn't redrawn under the user's fingers: that waits until the field is left.
  if (window.PanelStore) PanelStore.onChange((keys) => {
    if (!keys.includes("settings") || pending) return;
    const kioskBefore = window.Home && Home.kiosk ? Home.kiosk() : null;
    St.v = load();
    // a new FreeKiosk name (Manager → Panels, or a new tablet's first copy arriving): the MQTT subscriptions use it,
    // so start again with it (once — the name is then the same). Only on the panel itself: the builder's canvas
    // (?design=1) keeps no copy of its settings, so every load would start from the default name again and reload
    // forever (v2.7.2 milestone); neither it nor "Open live" (?live=1) listens as the tablet
    if (kioskBefore && Home.kiosk() !== kioskBefore && window.PANEL_DESIGN !== true && !window.PANEL_LIVE) { location.reload(); return; }
    applyAll();
    if (!St.open) return;
    const a = document.activeElement;
    if (a && layer.contains(a) && a.matches("textarea, input:not([type=range])")) a.addEventListener("blur", () => St.render(), { once: true });
    else St.render();
  });

  const theme = () => (window.THEMES || {})[St.v.look.theme] || { led: [139, 92, 246] };
  St.ledColor = () => theme().led;
  St.go2rtc = () => BUILTIN_GO2RTC || St.v.cameras.go2rtc || "";

  // ---------- applying the look ----------
  // the sky behind the cards is light (sky.js, when that changes): the cards' glass follows — applyLook
  St.lightSky = false;
  St.skyLight = (on) => { if (St.lightSky === !!on) return; St.lightSky = !!on; St.applyLook(St.draft && St.open ? St.draft : St.v.look); };
  St.applyLook = (look = St.v.look) => {
    const t = (window.THEMES || {})[look.theme];
    if (t && window.applyThemeVars) applyThemeVars(t);
    const root = document.documentElement.style;
    const rgb = look.cardTint === "theme" ? (t ? t.glass.join(",") : "30,20,64") : TINTS[look.cardTint].rgb;
    // (v2.7.2: a light sky — by day, around sunrise / sunset, or no sky behind the owner's picture: sky.js → St.skyLight —
    // makes the cards at least DAY_GLASS opaque, and the muted / faint text is set to read 4.5 : 1 on them then:
    // themes.js textOnGlass. At night the chosen transparency as it is.)
    const day = window.DAY_GLASS || 0.88, alpha = St.lightSky ? Math.max(look.cardAlpha, day) : look.cardAlpha;
    root.setProperty("--glass", `rgba(${rgb},${alpha})`);
    root.setProperty("--glass-strong", `rgba(${rgb},${Math.min(0.97, alpha + 0.22)})`);
    const tx = t && window.textOnGlass ? textOnGlass(t, rgb.split(",").map(Number), Math.max(look.cardAlpha, day)) : null;
    if (tx) { root.setProperty("--muted", tx.muted); root.setProperty("--faint", tx.faint); }
    root.setProperty("--glass-solid", `rgba(${rgb},0.94)`);   // (whatever the transparency: Home's alert lines)
    root.setProperty("--glass-opaque", `rgb(${rgb})`);          // (pop-ups, the PIN pad, Settings, the light dock over the orbs)
    const font = (window.UI_FONTS || []).find((f) => f.id === look.uiFont);
    document.body.style.fontFamily = font ? font.family : "";
    root.setProperty("--ui-scale", look.uiScale);
    document.body.classList.toggle("child-locked", !!St.v.childLock);
    window.App && App.lookChanged(look, t);
  };

  St.set = (path, value) => {
    const keys = path.split("."); let o = St.v;
    keys.slice(0, -1).forEach((k) => (o = o[k])); o[keys.at(-1)] = value;
    save(path); St.applyLook(); Sound.applyVolumes(); Alarm.updateLed();
    // redraw after the current tap finishes, so a field the user just tapped into keeps its focus (see render)
    setTimeout(St.render, 0);
    window.App && App.settingsChanged(path);
  };
  St.setDraft = (k, v) => { St.draft[k] = v; St.render(); };

  // Apply look with automatic revert. Only one preview at a time: applying again during a preview replaces it
  // but still reverts to the look from before the FIRST apply.
  St.applyDraft = (draft = St.draft) => {
    const prev = pending ? pending.prev : structuredClone(St.v.look);
    if (pending) { clearTimeout(pending.timeout); clearInterval(pending.interval); pending.layer.remove(); }
    const p = (pending = { prev, timeout: null, interval: null, layer: document.createElement("div") });
    St.v.look = structuredClone(draft); St.applyLook(); St.hide();
    p.layer.className = "confirm-layer";
    const done = (keep) => {
      if (pending !== p) return;
      clearTimeout(p.timeout); clearInterval(p.interval); p.layer.remove(); pending = null;
      // other screens may have changed settings meanwhile: start from the store's copy, the kept/previous look on top
      const look = keep ? St.v.look : p.prev;
      St.v = load(); St.v.look = look;
      applyAll();
      save("look"); // only the look: a whole-settings save would overwrite what other screens changed meanwhile
    };
    p.done = done;
    p.timeout = setTimeout(() => {
      // built once; only the number changes, so a tap on Keep can't land on a button that is being replaced
      p.layer.innerHTML = `<div class="confirm glass"><h2>${escH(T("set.keep.title"))}</h2><p>${T.html("set.keep.text", { n: '<b class="num">10</b>' })}</p>
        <div class="row"><button class="bigbtn" data-a="revert">${escH(T("set.keep.revert"))}</button><button class="bigbtn primary" data-a="keep">${escH(T("set.keep.keep"))}</button></div></div>`;
      p.layer.querySelector('[data-a="keep"]').onclick = () => done(true);
      p.layer.querySelector('[data-a="revert"]').onclick = () => done(false);
      document.body.appendChild(p.layer);
      let n = 10;
      p.interval = setInterval(() => { n--; if (n <= 0) done(false); else p.layer.querySelector("b").textContent = n; }, 1000);
    }, 5000);
  };
  St.resetLook = () => { St.draft = structuredClone(LOOK_DEFAULTS); St.applyDraft(); };

  // ---------- auto child lock ----------
  let lastTouch = Date.now();
  addEventListener("pointerdown", () => (lastTouch = Date.now()), true);
  setInterval(() => {
    const a = St.v.autoLock;
    if (a.on && !St.v.childLock && Date.now() - lastTouch > a.minutes * 60000) St.set("childLock", true);
  }, 15000);

  // ---------- page ----------
  const layer = document.createElement("div");
  layer.className = "settings-layer";
  document.addEventListener("DOMContentLoaded", () => { document.body.appendChild(layer); St.applyLook(); });

  // opening Settings again while a look is being previewed means "I can work with it": keep it (the owner's request)
  St.show = () => {
    if (pending) pending.done(true);
    St.open = true; St.pinState = null; St.draft = structuredClone(St.v.look);
    // still within the unlock window (pinpad.js): no PIN again
    const pin = PinPad.unlocked();
    St.unlocked = !!pin;
    if (pin && window.PanelStore) PanelStore.setPin(pin);
    St.render(); St.gate();
  };
  // the unlock window ran out (nobody touched the screen): Settings locks — it closes and asks again next time
  // ("after no input … it would then relock and return to home screen")
  PinPad.onLock(() => { if (St.open && St.unlocked) { St.hide(); if (window.App) App.go("home"); } });
  // The panel PIN (one for the whole house, set on the main panel) guards Settings. It's checked by the dashboard
  // service (/api/pin), never here. No PIN set yet → Settings open as before, with a hint to set one.
  const pinApi = async (body) => {
    const r = await fetch("/api/pin", body ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    return { status: r.status, ...(await r.json().catch(() => ({}))) };
  };
  const PIN_ERR = { "wrong-pin": "pin.wrong", "bad-format": "pin.badFormat", unset: "pin.unset" };
  // the PIN pad's answer to a refusal: a lock-out counts down there (lockedFor), anything else is one line
  const pinNo = (r, fallback) => (r.error === "locked" || +r.lockedFor > 0 ? PinPad.refusal(r) : { ok: false, msg: (PIN_ERR[r.error] && T(PIN_ERR[r.error])) || fallback || T("pin.cantCheck") });
  St.gate = async () => {
    try { St.pinState = await pinApi(); } catch { St.pinState = { status: 0 }; }
    if (!St.open || St.unlocked) return;
    if (St.pinState.status === 200 && St.pinState.set) {
      St.render();
      const pin = await PinPad.ask({ title: T("set.title"), text: T("set.enterPin"), check: async (p) => {
        const r = await pinApi({ action: "verify", pin: p });
        return r.ok ? { ok: true } : pinNo(r);
      } });
      // the PIN stays in this page's memory (never stored) so saving device choices can prove it to the service
      if (pin && St.open) { St.unlocked = true; PinPad.remember(pin); if (window.PanelStore) PanelStore.setPin(pin); St.render(); } else St.hide();
    } else St.render();
  };
  // for other pages that are PIN-guarded (rearranging the room buttons, Room options): true when allowed — no PIN set
  // yet, still in the unlock window, or the PIN was just entered (then it's remembered for the windows); false when
  // cancelled / no service. alert: true = dismissing a level 4–5 alert — the alarm window (from the PIN entry, touches
  // don't extend it) and the service's own, short lock-out for it
  St.unlockWithPin = async (title, { alert } = {}) => {
    if (alert ? PinPad.alarmUnlocked() : PinPad.unlocked()) return true;
    const down = () => PinPad.confirm({ title, text: T("set.pinDown"), yes: T("common.ok") }).then(() => false);
    let st; try { st = await pinApi(); } catch { return down(); }
    if (st.status !== 200) return down();
    if (!st.set) return true;
    const pin = await PinPad.ask({ title, text: T("set.enterPin"), purpose: alert ? "alert" : "general", check: async (p) => {
      const r = await pinApi({ action: "verify", pin: p, ...(alert ? { purpose: "alert" } : {}) });
      return r.ok ? { ok: true } : pinNo(r);
    } });
    if (!pin) return false;
    PinPad.remember(pin);
    return true;
  };
  // the built-in MQTT broker's login for LAN devices (FreeKiosk, the panel agent): the service hands it out only for
  // the right panel PIN (this window's PIN when still unlocked, else asked); shown once, never kept in the page
  // Each value has a Copy button (the password is too long to type: paste it into FreeKiosk on this panel). The login
  // lives only in this pop-up's closure and is dropped when it closes.
  let mqttShown = null;
  const copyText = async (text) => {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall back */ }
    // the panels load over http (not a "secure context"), so the old way: a hidden text box, select, copy
    const t = document.createElement("textarea");
    t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(t); t.select(); t.setSelectionRange(0, text.length);
    let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; }
    t.remove();
    return ok;
  };
  St.copyMqtt = async (key, btn) => {
    if (!mqttShown || !(key in mqttShown.vals)) return;
    const ok = await copyText(String(mqttShown.vals[key]));
    if (btn && btn.isConnected) {
      btn.textContent = T(ok ? "set.copied" : "set.copyFailed");
      setTimeout(() => { if (btn.isConnected) btn.textContent = T("set.copy"); }, 2500);
    }
  };
  St.mqttLogin = async () => {
    const e = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const show = (r) => {
      if (!St.open) return;                       // Settings closed / locked while the login was being fetched
      const vals = { host: location.hostname, port: r.port, user: r.user, pass: r.pass };
      const mine = { vals };
      const row = (key, label) => `<div class="mq-row"><span class="mq-l">${label}</span>
        <input class="mq-v" readonly value="${e(vals[key])}"${Acts.attr("focus", "set.selectAll")}>
        <button class="chip"${Acts.on("set.copyMqtt", key)}>${e(T("set.copy"))}</button></div>`;
      UI.popup(() => ({ title: T("set.mqttTitle"), body: `<div class="mq">
        ${row("host", e(T("set.mqttBroker")))}${row("port", e(T("set.mqttPort")))}${row("user", e(T("set.mqttUser")))}${row("pass", e(T("set.mqttPassword")))}
        <p class="mq-note">${e(T("set.mqttNote"))}</p>
        <div class="row"><button class="bigbtn primary"${Acts.on("ui.close")}>${e(T("set.done"))}</button></div></div>` }),
        () => { if (mqttShown === mine) mqttShown = null; });
      mqttShown = mine;                           // after UI.popup: it ran the previous pop-up's onClose first
    };
    const ask = async (p) => { try { return await pinApi({ action: "mqtt-login", pin: p }); } catch { return { ok: false, error: "down" }; } };
    const p0 = PinPad.unlocked();
    let r = p0 ? await ask(p0) : null;
    if (r && r.ok) return show(r);
    if (r && r.error === "unset") return PinPad.confirm({ title: T("set.mqttLogin"), text: T("set.mqttNeedPin"), yes: T("common.ok") });
    let got = null;
    await PinPad.ask({ title: T("set.mqttTitle"), text: T("set.enterPin"), check: async (p) => {
      const a = await ask(p);
      if (a.ok) { got = a; return { ok: true }; }
      if (a.error === "no-login" || a.error === "not-builtin") return { ok: false, done: true, msg: T(a.error === "no-login" ? "set.mqttNotReady" : "set.mqttNotBuiltin") };
      return a.error === "down" ? { ok: false, msg: T("pin.serviceDown") } : a.error === "unset" ? { ok: false, msg: T("set.pinFirst") } : pinNo(a);
    } });
    if (got) show(got);
  };
  // set / change the panel PIN (main panel): current PIN (if set), then the new one twice
  St.changePin = async () => {
    const st = await pinApi().catch(() => null);
    if (!st || st.status !== 200) return PinPad.confirm({ title: T("set.pinTitle"), text: T("set.serviceDownShort"), yes: T("common.ok") });
    let old;
    if (st.set) {
      old = await PinPad.ask({ title: T("set.changePinTitle"), text: T("set.currentPin"), check: async (p) => {
        const r = await pinApi({ action: "verify", pin: p });
        return r.ok ? { ok: true } : pinNo(r);
      } });
      if (!old) return;
    }
    const first = await PinPad.ask({ title: T(st.set ? "set.newPin" : "set.setPinTitle"), text: T("pin.badFormat") });
    if (!first) return;
    let saved = false;
    await PinPad.ask({ title: T("set.repeatPin"), check: async (p) => {
      if (p !== first) return { ok: false, msg: T("set.notSame") };
      const r = await pinApi({ action: "set", pin: p, ...(old ? { old } : {}) });
      saved = !!r.ok;
      return r.ok ? { ok: true } : pinNo(r, T("set.cantSave"));
    } });
    if (saved) { St.pinState = { status: 200, set: true }; PinPad.remember(first); if (window.PanelStore) PanelStore.setPin(first); St.render(); }
  };
  St.hide = () => {
    St.open = false; St.ovSaved = false; layer.innerHTML = ""; layer.classList.remove("show");
    if (mqttShown) UI.close();   // the MQTT login closes with Settings (also when it locks): never left on the wall
    // the PIN stays for the unlock window (opening Settings again soon needs no PIN); pinpad.js forgets it after that
    if (!PinPad.unlocked()) { PinPad.lock(); if (window.PanelStore && PanelStore.dropPin) PanelStore.dropPin(); }
    if (window.App) { App.endPreview(); if (App.reloadIfNewModel) App.reloadIfNewModel(); }
  };
  // Esc closes Settings (a pop-up in front of it closes first: pinpad / ui.js)
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && St.open && !document.querySelector(".popup-host.show")) St.hide(); });
  St.go = (tab) => { St.tab = tab; if (tab !== "fx" && window.App) App.endPreview(); St.render(); };

  const seg = (path, cur, opts, draft) => `<div class="seg">${opts.map(([v, l]) => `<button class="${cur === v ? "cur" : ""}" ${Acts.on(draft ? "set.draft" : "set.set", path, v)}>${escH(l)}</button>`).join("")}</div>`;
  const sw = (path, on) => `<button class="switch ${on ? "on" : ""}"${Acts.on("set.set", path, !on)}></button>`;
  const slider = (path, val, min, max, step, draft, live) =>
    `<input type="range" min="${min}" max="${max}" step="${step}" value="${val}"${live ? Acts.attr("input", "set.volLive") : ""}${Acts.attr("change", draft ? "set.draftNum" : "set.setNum", path)}>`;

  // (stage 5: People & calendars, Rooms, Alerts, Cameras and the guest Wi-Fi settings are set per
  // panel on the Manager page now — the "Manager" tab says where; guest mode switches, effects and Test stay here)
  const TABS = [["look", "grid"], ["sound", "music"], ["panel", "settings"], ["guest", "pin"], ["fx", "sun"], ["test", "bulb"], ["manager", "home"]];   // (names: "set.tab.<id>")
  function managerTab() {
    const url = `http://${location.host}/manage`;
    const b = (k) => `<b>${escH(T(k))}</b>`;
    return `<div class="set-grid one"><section><h3>${escH(T("set.mgr.title"))}</h3>
      <p>${T.html("set.mgr.text", { url: `<b>${escH(url)}</b>`, panels: b("set.mgr.panels"), devices: b("set.mgr.devices"), guest: b("set.mgr.guest"), integrations: b("set.mgr.integrations") })}</p>
      <small class="muted">${escH(T("set.mgr.thisPanel", { id: window.PanelStore ? PanelStore.id : "main", kiosk: H.kiosk ? H.kiosk() : "" }))}</small>
      </section></div>`;
  }

  function lookTab() {
    const d = St.draft, themes = window.THEMES || {}, bgs = window.BACKGROUNDS || [{ id: "mountains", name: "Mountains" }];
    return `<div class="set-grid three">
      <section><h3>${escH(T("set.look.colours"))}</h3>
        <div class="set-row col">${escH(T("set.look.theme"))} <div class="swatches">${Object.entries(themes).map(([k, t]) => `<button class="sw ${d.theme === k ? "cur" : ""}" style="background:linear-gradient(135deg,${t.grad[0]},${t.grad[1]})" ${Acts.on("set.draft", "theme", k)}>${escH(T.named("theme", k, t.name))}</button>`).join("")}</div></div>
        <div class="set-row col">${escH(T("set.look.background"))} <div class="bgs">${bgs.map((b) => `<button class="bg ${d.background === b.id ? "cur" : ""}" ${Acts.on("set.draft", "background", b.id)}>${escH(T.named("bg", b.id, b.name))}</button>`).join("")}</div></div>
        <div class="set-row">${escH(T("set.look.cardAlpha"))} ${slider("cardAlpha", d.cardAlpha, 0.3, 0.95, 0.05, true)}</div>
        <div class="set-row col">${escH(T("set.look.cardTint"))} ${seg("cardTint", d.cardTint, Object.entries(TINTS).map(([k, t]) => [k, T.named("tint", k, t.name)]), true)}</div>
      </section>
      <section><h3>${escH(T("set.look.clock"))}</h3>
        <div class="clock-preview">${window.renderClock ? renderClock({ style: d.clockStyle, fontId: d.clockFont, scale: 0.55 }) : ""}</div>
        <div class="set-row col">${escH(T("set.look.style"))} ${seg("clockStyle", d.clockStyle, (window.CLOCK_STYLES || []).map((s) => [s.id, T.named("clockStyle", s.id, s.name)]), true)}</div>
        <div class="set-row col">${escH(T("set.look.font"))} <div class="fontgrid">${(window.CLOCK_FONTS || []).map((f) => `<button class="${d.clockFont === f.id ? "cur" : ""}" style="font-family:${f.family}" ${Acts.on("set.draft", "clockFont", f.id)}>${escH(T.named("font", f.id, f.name))}</button>`).join("")}</div></div>
        <div class="set-row">${escH(T("set.look.clockSize"))} ${slider("clockScale", d.clockScale, 0.8, 1.4, 0.04, true)}</div>
      </section>
      <section><h3>${escH(T("set.look.text"))}</h3>
        <div class="set-row col">${escH(T("set.look.font"))} <div class="fontgrid">${(window.UI_FONTS || []).map((f) => `<button class="${d.uiFont === f.id ? "cur" : ""}" style="font-family:${f.family}" ${Acts.on("set.draft", "uiFont", f.id)}>${escH(T.named("font", f.id, f.name))}</button>`).join("")}</div></div>
        <div class="set-row">${escH(T("set.look.textSize"))} ${slider("uiScale", d.uiScale, 0.9, 1.1, 0.05, true)}</div>
        <div class="apply-box"><button class="bigbtn"${Acts.on("set.resetLook")}>${escH(T("set.look.reset"))}</button>
          <button class="bigbtn primary"${Acts.on("set.applyDraft")}>${icon("chevron", 20)} ${escH(T("set.look.apply"))}</button></div>
        <small class="muted">${escH(T("set.look.applyHint"))}</small>
      </section></div>`;
  }

  function soundTab() {
    const v = St.v.volume, c = St.v.chime, sp = window.PanelSpeech ? PanelSpeech.get() : null;
    // (Speaking: the panel's one speech volume — the Hubitat Notifier's setVolume moves it too, status.js PanelSpeech)
    const vrow = (k, label) => `<div class="set-row">${label} ${slider(`volume.${k}`, k === "speech" && sp ? sp.volume / 100 : v[k], 0, 1, 0.05, false,
      true)}
      <button class="chip"${Acts.on("set.soundTest", k)}>${escH(T("set.snd.test"))}</button></div>`;
    return `<div class="set-grid two">
      <section><h3>${escH(T("set.snd.volume"))}</h3>
        ${vrow("speech", escH(T("set.snd.speech")))}${vrow("sounds", escH(T("set.snd.sounds")))}${vrow("alerts", escH(T("set.snd.alerts")))}
        <small class="muted">${escH(T("set.snd.hint"))}</small>
        ${sp && sp.muted ? `<small class="muted">${icon("bell", 14)} ${escH(T("set.snd.muted"))}</small>` : ""}
      </section>
      ${alertInfo()}
      <section><h3>${escH(T("set.snd.chime"))}</h3>
        <div class="set-row">${escH(T("set.snd.grandfather"))} ${sw("chime.on", c.on)}</div>
        <div class="set-row">${escH(T("set.snd.every"))} ${seg("chime.every", c.every, [["quarter", T("set.snd.15")], ["half", T("set.snd.30")], ["hour", T("set.snd.hour")]])}</div>
        <div class="set-row col">${escH(T("set.snd.sound"))} ${seg("chime.style", c.style, Object.keys(Chime.STYLES).map((k) => [k, Chime.STYLES[k]]))}</div>
        <div class="set-row">${escH(T("set.snd.quiet"))} ${sw("chime.quietOn", c.quietOn)}</div>
        <div class="set-row small">${escH(T("set.snd.from"))} ${seg("chime.quietFrom", c.quietFrom, [20, 21, 22, 23].map((h) => [h, T.hour(h)]))}</div>
        <div class="set-row small">${escH(T("set.snd.until"))} ${seg("chime.quietTo", c.quietTo, [5, 6, 7, 8, 9].map((h) => [h, T.hour(h)]))}</div>
        <div class="set-row">${escH(T("set.snd.try"))} ${["quarter", "half", "hour"].map((k) => `<button class="chip"${Acts.on("set.chimePlay", k)}>${escH({ quarter: ":15", half: ":30", hour: T("set.snd.hour") }[k])}</button>`).join("")}
          <button class="chip bad"${Acts.on("set.chimeStop")}>${icon("x", 14)} ${escH(T("set.snd.stop"))}</button></div>
      </section></div>`;
  }

  St.togglePerson = (id) => {
    const i = St.v.people.findIndex((p) => p.id === id);
    if (i >= 0) St.v.people.splice(i, 1);
    else {
      // "Phone - Jane's" / "Tracker - Jane" → "Jane"
      const p = H.state.presence.find((x) => x.id === id), name = personName(p.label);
      St.v.people.push({ id, name: name || p.label, color: "#22d3ee", image: null });
    }
    St.set("people", St.v.people);
  };
  St.personName = (id, name) => { St.v.people.find((p) => p.id === id).name = name; St.set("people", St.v.people); };
  St.personColor = (id) => { const cs = ["#8b5cf6", "#ec4899", "#22d3ee", "#f59e0b", "#34d399", "#f43f5e"], p = St.v.people.find((x) => x.id === id); p.color = cs[(cs.indexOf(p.color) + 1) % cs.length]; St.set("people", St.v.people); };

  // Devices no panel may switch (the Hubitat bridge refuses them). Saved in the MAIN panel's settings as neverSwitch
  // {id: true}; the bridge reads it from there. Until it's first changed, devices named like the sprinklers, a freezer,
  // the server… are on it (the same names as house_model.KEEP_ON).
  const isMain = () => !window.PanelStore || PanelStore.id.toLowerCase() === "main";
  const KEEP_ON = /rainbird|sprinkler|irrigation|freezer|fridge|server|router|modem|aquarium|sump|valve|water main|shut-?off|garage door|garage opener|gate opener/i;
  const switchables = () => [
    ...H.state.rooms.flatMap((r) => r.devices.map((d) => ({ id: d.id, name: d.full, group: r.name, kind: d.kind }))),
    ...H.state.locks.map((l) => ({ id: l.id, name: T("set.never.lock", { name: l.name }), group: T("set.never.locks") })),
    ...(H.state.thermostat && H.state.thermostat.id != null ? [{ id: H.state.thermostat.id, name: H.state.thermostat.name, group: T("set.never.thermo") }] : [])];
  const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const neverList = () => St.v.neverSwitch ||
    // (the name rule only for plain room devices — not locks, the thermostat, or a valve / garage opener set up on purpose)
    Object.fromEntries(switchables().filter((d) => d.kind && !["valve", "garage"].includes(d.kind) && KEEP_ON.test(d.name) && !/light/i.test(d.name)).map((d) => [d.id, true]));
  St.toggleNever = (id) => { const n = { ...neverList() }; if (n[id]) delete n[id]; else n[id] = true; St.set("neverSwitch", n); UI.refreshPopup(); };
  St.neverPopup = () => UI.popup(() => {
    const never = neverList(), groups = new Map();
    for (const d of switchables()) { if (!groups.has(d.group)) groups.set(d.group, []); groups.get(d.group).push(d); }
    return { title: T("set.never.title"), body: `<div class="sensor-list">${[...groups].map(([g, ds]) => `<div class="label" style="margin-top:8px">${escH(g)}</div>
      ${ds.map((d) => `<div class="set-row small">${escH(d.name)}<button class="switch ${never[d.id] ? "" : "on"}" ${Acts.on("set.toggleNever", d.id)}></button></div>`).join("")}`).join("")}</div>` };
  });
  // a room page's "Room options" (list style): which of the room's devices this panel shows — behind the panel PIN
  // like Settings (the general window); closes when that window relocks
  let roomOpts = false;
  St.roomOptions = async (roomId) => {
    if (!(await St.unlockWithPin(T("set.roomOptions")))) return;
    St.devicesPopup(roomId, () => { roomOpts = false; });
    roomOpts = true;
  };
  PinPad.onLock(() => { if (roomOpts) { roomOpts = false; UI.close(); } });
  St.devicesPopup = (roomId, onClose) => UI.popup(() => {
    const r = roomId ? H.room(roomId) : null, name = r ? r.name : "";
    const show = r && r.devices.length ? `<div class="label">${escH(T("set.dev.show"))}</div><div class="pgrid">${r.devices.map((d) => `<div class="prow ok">${icon({ fan: "fan", outlet: "plug", shade: "shade", switch: "power", valve: "drop", garage: "car" }[d.kind] || "bulb", 22)}
      <span class="pn">${escH(d.name)}<br><small class="muted">${escH(d.full)}</small></span><button class="switch ${St.v.hiddenDevices[d.id] ? "" : "on"}" ${Acts.on("set.toggleDevice", d.id)}></button></div>`).join("")}</div>` : "";
    // what each device IS (type, room, PIN rule, fan type, picture) is set for the whole house on the Manager page
    // (stage 4: /manage, from a laptop or phone); here only what this panel shows
    const manage = isMain() ? `<small class="muted" style="display:block;margin-top:12px">${T.html("set.dev.manage", { url: `<b>http://${escH(location.host)}/manage</b>` })}</small>` : "";   // i18n-ok (the address)
    return { title: r ? T("set.dev.title", { room: name }) : T("set.dev.noRoom"), body: `${show}${manage}` };
  }, onClose);
  // only "which devices are shown" is saved — never the rest of this page's settings (a look being tried, an edit not
  // saved yet): the store's copy with just hiddenDevices changed
  St.toggleDevice = (id) => {
    if (!St.open && roomOpts && !PinPad.unlocked()) { roomOpts = false; UI.close(); return; }   // (the window relocked)
    St.v.hiddenDevices[id] = !St.v.hiddenDevices[id];
    if (window.PanelStore) {
      const cur = PanelStore.get("settings");
      PanelStore.set("settings", { ...(cur && typeof cur === "object" ? structuredClone(cur) : {}), hiddenDevices: structuredClone(St.v.hiddenDevices) }, ["hiddenDevices"]);
    }
    if (window.App) App.settingsChanged("hiddenDevices");
    UI.refreshPopup();
  };

  function panelTab() {
    const v = St.v, led = Alarm.ledState();
    return `<div class="set-grid three">
      <section><h3>${escH(T("set.pnl.led"))}</h3>
        <div class="set-row">${escH(T("set.pnl.brightness"))} ${slider("ledBrightness", v.ledBrightness, 0.1, 1, 0.1)}</div>
        <div class="set-row col">${escH(T("set.pnl.now"))} <span class="chip"><i class="ledpip" style="background:rgb(${led.rgb})"></i>${escH(H.isPanel ? led.name : T("set.pnl.onlyPanel", { name: led.name }))}</span></div>
        <small class="muted">${escH(T("set.pnl.ledNext"))}</small></section>
      <section><h3>${escH(T("set.pnl.childLock"))}</h3>
        <div class="set-row">${escH(T("set.pnl.childLockNow"))} ${sw("childLock", v.childLock)}</div>
        <div class="set-row">${escH(T("set.pnl.autoLock"))} ${sw("autoLock.on", v.autoLock.on)}</div>
        <div class="set-row">${escH(T("set.pnl.after"))} ${seg("autoLock.minutes", v.autoLock.minutes, [5, 10, 15, 30, 60].map((n) => [n, T("set.pnl.min", { n })]))}</div>
        <small class="muted">${escH(T("set.pnl.childLockHint"))}</small></section>
      ${isMain() ? `<section><h3>${escH(T("set.pnl.pin"))}</h3>
        <div class="set-row">${escH(T(St.pinState && St.pinState.set ? "set.pnl.pinSet" : "set.pnl.pinNotSet"))} <button class="chip"${Acts.on("set.changePin")}>${icon("lock", 16)} ${escH(T(St.pinState && St.pinState.set ? "set.pnl.changePin" : "set.pnl.setPin"))}</button></div>
        <small class="muted">${escH(T("set.pnl.pinHint"))}</small></section>` : ""}
      ${isMain() && PC.mqttBuiltin ? `<section><h3>${escH(T("set.pnl.mqtt"))}</h3>
        <div class="set-row">${escH(T("set.pnl.mqttBuiltin"))} <button class="chip"${Acts.on("set.mqttLogin")}>${icon("lock", 16)} ${escH(T("set.pnl.showLogin"))}</button></div>
        <small class="muted">${escH(T("set.pnl.mqttHint"))}</small></section>` : ""}
      <section><h3>${escH(T("set.pnl.screen"))}</h3>
        <div class="set-row">${escH(T("set.pnl.homeAfter"))} <span class="num-in"><input class="txt" type="number" min="0" max="3600" step="5" value="${+v.homeAfter || 0}"
         ${Acts.attr("change", "set.homeAfter")}> ${escH(T("set.pnl.secondsUnit"))}</span></div>
        <small class="muted">${escH(T("set.pnl.homeAfterHint"))}</small>
        <div class="set-row">${escH(T("set.pnl.pinStays"))} <span class="muted">${escH(winText(v.pinGeneralSeconds, 60, "set.win.noTouch"))}</span></div>
        <div class="set-row">${escH(T("set.pnl.alarmWindow"))} <span class="muted">${escH(winText(v.pinAlarmSeconds, 30, "set.win.afterPin"))}</span></div>
        <small class="muted">${escH(T("set.pnl.windowsHint"))}</small></section></div>`;
  }

  // a PIN window as words (Manager → Panels → Safety sets it)
  const winText = (v, d, how) => { const n = Number.isInteger(v) && v >= 0 ? v : d;
    return !n ? T("set.win.never") : T(how, { time: n < 60 ? T("set.win.s", { n }) : n % 60 ? T("set.win.minS", { m: Math.floor(n / 60), s: n % 60 }) : T("set.win.min", { n: n / 60 }) }); };
  // this panel's alert settings — shown, not changed here: the admin sets them in the Manager (Panels → Alerts)
  function alertInfo() {
    const v = St.v, hr = (h) => T.hour(h);
    const lvl = T(`set.al.lvl${[1, 2, 3, 4, 5].includes(+v.alertMinLevel) ? +v.alertMinLevel : 1}`);
    const quiet = (v.quietModes || []).length ? T("set.al.inModes", { n: v.quietModes.length, modes: T.list(v.quietModes) })
      : v.quietFrom >= 0 && v.quietTo >= 0 && v.quietFrom !== v.quietTo ? T("set.al.fromTo", { from: hr(v.quietFrom), to: hr(v.quietTo) }) : T("set.al.none");
    const light = +v.notifyLight ? (H.devName ? H.devName(+v.notifyLight) : `#${+v.notifyLight}`) : T("set.al.none");
    const row = (l, t) => `<div class="set-row">${escH(T(l))} <span class="muted">${escH(t)}</span></div>`;
    const onOff = (b) => T(b ? "set.al.on" : "set.al.off");
    return `<section><h3>${escH(T("set.al.title"))}</h3>
      ${row("set.al.lowest", lvl)}${row("set.al.beep", onOff(v.alertBeeps !== false))}
      ${row("set.al.quiet", quiet)}${row("set.al.lvl4Quiet", T(v.quietLevel4 !== false ? "set.al.yes" : "set.al.onlyLvl5"))}
      ${row("set.al.silence", onOff(v.alertSilence === true))}${row("set.al.light", light)}
      <small class="muted">${escH(T("set.al.hint"))}</small></section>`;
  }

  // ---------- weather effects ----------
  // pause: hours, or "morning" = until 7 AM; 0 = resume now
  St.pauseEffects = (hours) => {
    let until = 0;
    if (hours === "morning") { const d = new Date(); d.setHours(7, 0, 0, 0); if (d - Date.now() < 30 * 60000) d.setDate(d.getDate() + 1); until = +d; }
    else if (hours) until = Date.now() + hours * 3600000;
    St.set("effects.offUntil", until);
  };
  St.fxSwitch = (id, on) => { const d = { ...(St.v.effects.disabled || {}) }; if (on) delete d[id]; else d[id] = true; St.set("effects.disabled", d); };
  function fxTab() {
    const e = St.v.effects, paused = window.App && App.effectsPaused(), test = window.App ? App.fxTest : null;
    const now = window.App && App.sky && App.sky.cond, hm = (ms) => T.time(new Date(ms));
    const conds = window.Sky ? Sky.CONDITIONS : [], cats = window.Sky ? Sky.CATEGORIES : [];
    const cap = window.App && App.effectCap ? App.effectCap() : 4, L = window.Sky ? Sky.LOAD_NAMES : [""];
    const row = (c) => `<div class="set-row fx-row ${Sky.load(c) > cap ? "fx-heavy" : ""}"><button class="fx-name ${test != null && String(test) === String(c.id) ? "cur" : ""}" ${Acts.on("set.previewEffect", c.id)}>${escH(c.name)}<small>${escH(typeof c.id === "number" ? T("set.fx.loadCode", { load: L[Sky.load(c)] || "", code: c.id }) : L[Sky.load(c)] || "")}</small></button>
      <button class="switch ${e.disabled && e.disabled[c.id] ? "" : "on"}" ${Acts.on("set.fxSwitch", c.id, !!(e.disabled && e.disabled[c.id]))}></button></div>`;
    return `<div class="set-grid two">
      <section><h3>${escH(T("set.fx.how"))}</h3>
        <div class="set-row col">${escH(T("set.fx.mode"))} ${seg("effects.mode", e.mode, [["live", T("set.fx.live")], ["demo", T("set.fx.demo")], ["off", T("set.fx.off")]])}</div>
        <div class="set-row">${escH(T("set.fx.cycle"))} ${sw("effects.cycle", e.cycle)}</div>
        ${e.mode === "demo" ? `<div class="set-row">${escH(T("set.fx.change"))} <button class="chip"${Acts.on("set.nextEffect")}>${icon("chevron", 16)} ${escH(T("set.fx.next"))}</button></div>` : ""}</section>
      <section><h3>${escH(T("set.fx.pause"))}</h3>
        <div class="set-row">${paused ? `<b>${escH(T("set.fx.pausedUntil", { time: hm(e.offUntil) }))}</b> <button class="chip"${Acts.on("set.pauseEffects", 0)}>${escH(T("set.fx.resume"))}</button>` : `<span class="muted">${escH(T("set.fx.running"))}</span>`}</div>
        <div class="set-row col">${escH(T("set.fx.offFor"))} <div class="seg">${[[1, "set.fx.1h"], [4, "set.fx.4h"], ["morning", "set.fx.morning"], [24, "set.fx.24h"]].map(([h, l]) => `<button${Acts.on("set.pauseEffects", h)}>${escH(T(l))}</button>`).join("")}</div></div></section>
      <section><h3>${escH(T("set.fx.now"))}</h3>
        <div class="set-row"><b>${escH(now ? (now.id === "none" ? T("fx.noEffect") : now.name) : "—")}</b>${test != null ? `<button class="chip"${Acts.on("set.endPreview")}>${escH(T("set.fx.stopTest"))}</button>` : ""}</div>
        <small class="muted">${escH(T("set.fx.nowHint"))}</small></section>
      <section><h3>${escH(T("set.fx.heaviest"))}</h3>
        <div class="set-row col">${seg("effects.maxLoad", e.maxLoad || 0, [[0, T("set.fx.auto")], [1, L[1]], [2, L[2]], [3, L[3]], [4, L[4]]])}</div>
        <small class="muted">${window.App && App.perfText ? escH(App.perfText()) : ""}</small>
        <small class="muted">${escH(T("set.fx.heaviestHint"))}</small>
        ${window.App && App.perf && App.perf.autoCap && H.isPanel && !(e.maxLoad >= 1) ? `<button class="chip"${Acts.on("set.resetPerf")}>${escH(T("set.fx.measureAgain", { level: L[4] }))}</button>` : ""}</section></div>
      <div class="set-grid fx-grid">${cats.map(([k, emo, label]) => `<section><h3>${emo} ${escH(label)}</h3>${conds.filter((c) => c.cat === k).map(row).join("")}</section>`).join("")}</div>`;
  }

  // Protect live views: tick the ones this panel shows (others may be for other screens) and give them a panel name.
  // Without Protect views: the panel's own view editor.
  St.showView = (id, on) => { const h = { ...(St.v.cameras.hiddenViews || {}) }; if (on) delete h[id]; else h[id] = true; St.set("cameras.hiddenViews", h); };
  St.nameView = (id, name) => { const n = { ...(St.v.cameras.viewNames || {}) }; if (name) n[id] = name; else delete n[id]; St.set("cameras.viewNames", n); };
  // move a view up (-1) or down (+1); the whole current order is saved so new Protect views simply go to the end
  St.moveView = (id, dir) => {
    const ids = (window.Cameras ? Cameras.allProtectViews() : []).map((v) => v.id), i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    St.set("cameras.viewOrder", ids);
  };
  function testTab() {
    const s = (act, arg, ic, l) => `<button class="chip"${Acts.on(act, arg)}>${icon(ic, 16)} ${escH(l)}</button>`;   // (each closes Settings first)
    // (alerts are made by Hubitat rules: these are made-up ones on this panel only, as if a rule sent them — hubalerts.js)
    return `<div class="set-grid one"><section><h3>${escH(T(window.PANEL_CONFIG && PANEL_CONFIG.demo === true ? "set.test.title" : "set.test.titleReal"))}</h3><div class="set-row wrap">
      ${[[1, "bell"], [2, "bell"], [3, "warning"], [4, "warning"], [5, "siren"]]
        .map(([l, ic]) => s("set.testAlert", l, ic, T("set.test.alert", { level: T(`set.test.l${l}`) }))).join("")}
      ${s("set.testDoorbell", null, "film", T("set.test.doorbell"))}
      ${H.state.presence.map((p) => `<button class="chip"${Acts.on("set.testPresence", p.id)}>${icon("user", 16)} ${UI.esc(T(p.home ? "set.test.presence" : "set.test.presenceAway", { name: p.label }))}</button>`).join("")}
    </div><small class="muted">${escH(T("set.test.hint"))}</small></section></div>`;
  }

  St.render = () => {
    if (!St.open) return;
    layer.classList.add("show");
    if (!St.unlocked) {
      const ps = St.pinState;
      const msg = escH(T(!ps ? "set.checking" : ps.status === 200 && ps.set ? "set.gateEnter" : ps.status === 200 ? "set.gateNoPin" : ps.status === 404 ? "set.gate404" : "set.gateDown"));
      const go = ps && ((ps.status === 200 && !ps.set) || ps.status === 404);
      layer.innerHTML = `<div class="set-pin glass" role="dialog" aria-modal="true" aria-label="${escH(T("set.title"))}"><h2>${icon("settings", 30)} ${escH(T("set.title"))}</h2><p>${msg}</p>
        <div class="row"><button class="bigbtn"${Acts.on("set.hide")}>${escH(T("common.cancel"))}</button>${go ? `<button class="bigbtn primary"${Acts.on("set.unlock")}>${escH(T("set.continue"))}</button>` : ""}</div></div>`;
      return;
    }
    // a redraw (after a field is saved) must not steal focus from the field the user just tapped into
    const act = document.activeElement, inputs = [...layer.querySelectorAll("input, textarea")];
    const focusIdx = act && layer.contains(act) ? inputs.indexOf(act) : -1;
    const caret = focusIdx >= 0 && act.selectionStart != null ? [act.selectionStart, act.selectionEnd] : null;
    const guestTab = () => (window.GuestWifi ? GuestWifi.settingsTab() : "");
    if (!TABS.some(([id]) => id === St.tab)) St.tab = "look";   // (a tab that moved to the Manager)
    const body = { look: lookTab, sound: soundTab, panel: panelTab, guest: guestTab, fx: fxTab, test: testTab, manager: managerTab }[St.tab]();
    layer.innerHTML = `<div class="set-page glass" role="dialog" aria-modal="true" aria-labelledby="set-title">
      <div class="set-head"><h2 id="set-title">${icon("settings", 30)} ${escH(T("set.title"))}</h2><button class="popup-x" aria-label="${escH(T("set.close"))}"${Acts.on("set.hide")}>${icon("x", 26)}</button>
      <div class="set-tabs">${TABS.map(([id, ic]) => `<button class="${St.tab === id ? "cur" : ""}" ${Acts.on("set.go", id)}>${icon(ic, 18)}${escH(T(`set.tab.${id}`))}</button>`).join("")}</div></div>
      ${body}</div>`;
    UI.a11y(layer);   // (v2.7.2: the switches, sliders and choices named for a screen reader — ui.js)
    if (focusIdx >= 0) {
      const el = layer.querySelectorAll("input, textarea")[focusIdx];
      if (el) { el.focus(); if (caret) try { el.setSelectionRange(...caret); } catch {} }
    }
  };

  // what the Settings screens' buttons and fields do (acts.js — v2.5.1: no handler in the markup). Each runs only while
  // Settings is open and unlocked — as its buttons are only shown then — so markup alone (a name from the hub that got
  // into the page) can't change a setting; Cancel / ✕ and Continue (it checks for itself) always may
  const unlockedOnly = (table) => Object.fromEntries(Object.entries(table).map(([k, f]) =>
    [k, k === "set.hide" || k === "set.unlock" ? f : (...a) => {
      // (a room's device switches also live in Room options — its own PIN, Settings closed: St.roomOptions / toggleDevice)
      if ((St.open && St.unlocked) || (k === "set.toggleDevice" && roomOpts)) f(...a);
    }]));
  Acts.add(unlockedOnly({
    "set.set": (path, v) => St.set(path, v), "set.draft": (path, v) => St.setDraft(path, v),
    "set.setNum": (path, el) => St.set(path, +el.value), "set.draftNum": (path, el) => St.setDraft(path, +el.value),
    "set.setTrim": (path, el) => St.set(path, el.value.trim()),
    // (a volume slider while it moves: heard at once — the speech volume is the Notifier's too, status.js PanelSpeech)
    "set.volLive": (path, el) => {
      const k = String(path).replace(/^volume\./, "");
      St.v.volume[k] = +el.value; Sound.applyVolumes();
      if (k === "speech" && window.PanelSpeech) PanelSpeech.setVolume(+el.value * 100);
    },
    "set.selectAll": (el) => el.select(), "set.copyMqtt": (key, el) => St.copyMqtt(key, el),
    "set.soundTest": (k) => Sound.test(k), "set.chimePlay": (k) => Chime.play(k), "set.chimeStop": () => Chime.stop(),
    "set.resetLook": () => St.resetLook(), "set.applyDraft": () => St.applyDraft(),
    "set.togglePerson": (id) => St.togglePerson(id), "set.personName": (id, el) => St.personName(id, el.value), "set.personColor": (id) => St.personColor(id),
    "set.calToggle": (i) => { St.v.calendars[i].on = !St.v.calendars[i].on; St.set("calendars", St.v.calendars); },
    "set.roomToggle": (rid) => { St.v.hiddenRooms[rid] = !St.v.hiddenRooms[rid]; St.set("hiddenRooms", St.v.hiddenRooms); },
    "set.devicesPopup": (rid) => St.devicesPopup(rid), "set.neverPopup": () => St.neverPopup(),
    "set.toggleNever": (id) => St.toggleNever(id), "set.toggleDevice": (id) => St.toggleDevice(id),
    "set.changePin": () => St.changePin(), "set.mqttLogin": () => St.mqttLogin(),
    "set.homeAfter": (el) => St.set("homeAfter", Math.max(0, Math.min(3600, Math.round(+el.value) || 0))),
    "set.previewEffect": (id) => { App.previewEffect(id); St.render(); }, "set.fxSwitch": (id, on) => St.fxSwitch(id, on),
    "set.nextEffect": () => App.nextEffect(), "set.pauseEffects": (h) => St.pauseEffects(h),
    "set.endPreview": () => { App.endPreview(); St.render(); }, "set.resetPerf": () => { App.resetPerf(); St.render(); },
    "set.camEditor": () => { St.hide(); if (window.Cameras) Cameras.editor(); },
    "set.moveView": (id, dir) => St.moveView(id, dir), "set.showView": (id, on) => St.showView(id, on),
    "set.nameView": (id, el) => St.nameView(id, el.value.trim()),
    "set.testAlert": (l) => { St.hide(); HubAlerts.test(l); },
    "set.testDoorbell": () => { St.hide(); if (window.Cameras) Cameras.onShow({ view: "Doors", seconds: St.v.cameras.autoSeconds }); },
    "set.testPresence": (id) => { const p = Home.state.presence.find((x) => x.id === id); if (p) p.home = !p.home; Home.refresh(); St.render(); },
    "set.hide": () => St.hide(), // (Continue: only when no PIN is set — the same test that showed the button; markup alone never unlocks Settings)
    "set.unlock": () => {
      const ps = St.pinState;
      if (!St.open || !ps || !((ps.status === 200 && !ps.set) || ps.status === 404)) return;
      St.unlocked = true; St.render();
    }, "set.go": (tab) => St.go(tab),
  }));

  window.Settings = St;
})();
