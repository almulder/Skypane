// Guest Wi-Fi QR card (home screen, left column under the weather) + its settings tab.
// Guests scan the code with a phone camera to join.
//  - With a UniFi console, e.g. a UDM Pro (PANEL_CONFIG.guestWifi: the dashboard service runs service/guest_wifi.py): the guest network
//    and its QR code come from the service (/api/guest-wifi, /api/guest-wifi/qr.svg). The password shows only in
//    Settings, never on the home-screen card; it changes after guests leave (the guest modes, from Hubitat), every N days.
//  - Without it: the network typed in Settings → Guest mode (made into a code here; needs ../../vendor/qrcode.js).
// Needs UI.esc from ui.js; Home (data.js) for the guest modes; PinPad for changes.
(function () {
  const DEFAULTS = { show: "always", ssid: "", password: "", security: "WPA", hidePassword: false, guestMode: false };
  const SAMPLE = { ssid: "Guest Wi-Fi (sample)", password: "sample-password" };   // i18n-ok (the name shown: T("gw.sampleSsid"))
  const PC = window.PANEL_CONFIG || {};
  // the service's guest network (a UniFi console's, or one typed in the Manager): from the page config, and from the status
  // (polled — a network typed / removed on the Manager reaches open panels without a reload)
  let UNIFI = !!PC.guestWifi;

  // ---------- styles (injected once) ----------
  function css() {
    if (document.getElementById("gw-css")) return;
    const s = document.createElement("style");
    s.id = "gw-css";
    s.textContent = `
      .gw-card { flex-direction: row !important; align-items: center; gap: 22px; min-height: 0; }
      .gw-qr { flex: none; width: 190px; height: 190px; padding: 12px; border-radius: 18px; background: #fff; box-shadow: 0 6px 24px rgba(0,0,0,.35); position: relative; }
      .gw-qr svg, .gw-qr img { display: block; width: 100%; height: 100%; }
      .gw-qr.gw-wait { display: flex; align-items: center; justify-content: center; color: #555; font-size: 14px; text-align: center; }
      .gw-qr.gw-sample::after { content: "SAMPLE"; position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%) rotate(-18deg);
        padding: 4px 12px; border-radius: 8px; background: rgba(244,63,94,.92); color: #fff; font: 700 15px/1.2 system-ui, sans-serif; letter-spacing: 2px; }
      .gw-txt { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .gw-ssid { font-size: 26px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      /* (v3.0.2: on a layout card narrowing the card first takes the empty space beside the words; then a name longer than
         20 characters wraps, keeping 20 of them a line (in its own type: ch), a shorter one stays whole on one line, the
         password and the hint wrap; only past that does the card scale down (Grid.fit). The code is as tall as the card
         allows, at most 190 px × Style's "Icons" (zoom: theme.css .gc.gsz .gz-i) — it never shrinks for the words) */
      .gc .gw-qr { width: auto; height: min(190px, 100%); aspect-ratio: 1; }
      .gc .gw-txt { flex: 0 1 auto; min-width: auto; }
      .gc .gw-ssid { line-height: 1.15; overflow: visible; text-overflow: clip; }
      .gc .gw-long { white-space: normal; overflow-wrap: anywhere; min-width: 20ch; }
      .gc .gw-pass, .gc .gw-hint { overflow-wrap: anywhere; }
      /* (v3.0.3) drawn much smaller than its own size (grid.js: g-small — a narrow or portrait screen): a long name keeps
         12 characters a line instead of 20, at most 3 lines (then "…"), and nothing runs out of the card */
      .gc.g-small .gw-card .gw-long { min-width: 12ch; }
      .gc.g-small .gw-card .gw-txt { overflow: hidden; }
      .gc.g-small .gw-card .gw-ssid { white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
      /* (v3.0.3) a card taller than wide, or about square (grid.js: gw-tall): the code above the words, both centered;
         the code is its own size (190 px + its white edge, × "Icons") and gets smaller with the card; the name wraps in
         the card's width */
      .gc.gw-tall .gw-card { flex-direction: column !important; justify-content: center; gap: 12px; }
      .gc.gw-tall .gw-card .gw-qr { box-sizing: border-box; height: auto; width: 214px; max-width: 100%; }
      .gc.gw-tall .gw-card .gw-txt { flex: none; align-items: center; text-align: center; max-width: 100%; min-width: 0; }
      .gc.gw-tall .gw-card .gw-long { min-width: 0; }
      .gw-pass { font-size: 20px; color: var(--text); font-variant-numeric: tabular-nums; letter-spacing: .5px; word-break: break-all; }
      .gw-pass small { display: block; font-size: 12px; color: var(--muted); letter-spacing: 1px; text-transform: uppercase; }
      .gw-hint { font-size: 14px; color: var(--muted); }
      .gw-badge { display: inline-block; margin-left: 6px; padding: 2px 8px; border-radius: 8px; background: var(--accent-grad); color: #fff; font-size: 11px; letter-spacing: 1px; }
      .gw-preview { display: flex; }
      .gw-preview .gw-card { width: 600px; }
      .gw-err { color: var(--warn, #fbbf24); font-size: 15px; }
      .gw-ok { color: var(--ok, #34d399); font-size: 15px; }
      .gw-pw { font: 600 20px/1.2 ui-monospace, Consolas, monospace; letter-spacing: .5px; user-select: text; -webkit-user-select: text; }`;
    document.head.appendChild(s);
  }

  // Wi-Fi QR format: WIFI:T:WPA;S:<ssid>;P:<password>;;   (\ ; , : " are backslash-escaped)
  const wifiEsc = (s) => String(s ?? "").replace(/([\\;,:"])/g, "\\$1");
  function payload(ssid, pass, security = "WPA") {
    return security === "nopass" || !pass
      ? `WIFI:T:nopass;S:${wifiEsc(ssid)};;`
      : `WIFI:T:WPA;S:${wifiEsc(ssid)};P:${wifiEsc(pass)};;`;
  }

  // the home screen redraws often; making the code took ~11 ms on the panel, so keep the last one
  let lastText = null, lastSvg = "";
  function qrSvg(text) {
    if (!window.qrcode) return "";
    if (text === lastText) return lastSvg;
    lastText = text;
    return (lastSvg = makeSvg(text));
  }
  function makeSvg(text) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"]; // non-ASCII names (é, emoji) encode correctly
    const qr = qrcode(0, "M");
    qr.addData(text, "Byte");
    qr.make();
    return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); // the white tile adds more quiet zone
  }

  const esc = (s) => (window.UI && UI.esc ? UI.esc(s) : String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
  // (v3.0.2) a layout card's name: up to 20 characters it stays on one line; longer, it wraps at 20 (css: .gc .gw-long)
  const ssidW = (name) => (Array.from(String(name || "")).length > 20 ? "gw-long" : "gw-short");

  // ---------- the service's guest Wi-Fi (a UniFi console) ----------
  let st = null, stText = "";     // the last status from /api/guest-wifi (its password: Settings only, never the card)
  async function poll() {
    try {
      const r = await fetch("/api/guest-wifi", { cache: "no-store" });
      const text = await r.text();
      if (text !== stText) {
        stText = text;
        try { st = JSON.parse(text); } catch { st = null; }
        if (st && typeof st.enabled === "boolean") UNIFI = st.enabled;
        redraw();
      }
    } catch { /* the service is down: keep showing the last code */ }
  }
  function redraw() {
    if (window.App && App.view === "home" && App.render) App.render();
    if (window.Settings && Settings.open && Settings.tab === "guest" && Settings.render) Settings.render();
  }
  // every minute; every 10 s while Settings → Guest mode is open (a change after guests left shows up quickly)
  const tabOpen = () => window.Settings && Settings.open && Settings.tab === "guest";
  if (window.location && /^https?:$/.test(location.protocol)) {   // (a page, not a test harness)
    poll(); setInterval(poll, 60000); setInterval(() => { if (UNIFI && tabOpen()) poll(); }, 10000);
  }



  const guestModes = () => (window.Home && Home.guestModes ? Home.guestModes() : []);
  const busy = new Set();   // guest modes being switched right now
  // the Settings tab follows a guest mode switching (the hub's event) at once, not at the next status poll
  let watching = false, modesSig = "";
  const sigOf = () => guestModes().map((t) => `${t.id}:${t.attrs && t.attrs.switch}`).join(",");
  function watchModes() {
    if (watching || !window.Home || !Home.onChange) return;
    watching = true;
    modesSig = sigOf();
    Home.onChange(() => {
      const now = sigOf();
      if (now === modesSig) return;
      modesSig = now;
      redraw();
      setTimeout(poll, 3000);   // the service's view (guests here / gone) follows
    });
  }
  const guestsHere = () => guestModes().some((t) => t.attrs && t.attrs.switch === "on");

  // PATCH /api/guest-wifi with the panel PIN: the one from this unlock window, else asked. → the answer, or null
  const PIN_KEY = { "wrong-pin": "gw.err.wrongPin", locked: "gw.err.locked", unset: "gw.err.unset", down: "pin.serviceDown", "not-enabled": "gw.err.notEnabled" };
  const PIN_ERR = new Proxy({}, { get: (o, k) => (PIN_KEY[k] ? T(PIN_KEY[k]) : undefined) });
  async function send(body, title) {
    const go = async (pin) => {
      try {
        const r = await fetch("/api/guest-wifi", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, pin }) });
        return { status: r.status, ...(await r.json().catch(() => ({}))) };
      } catch { return { ok: false, error: "down" }; }
    };
    const p0 = window.PinPad && PinPad.unlocked ? PinPad.unlocked() : null;
    if (p0) {
      const r = await go(p0);
      if (r.ok) return r;
      if (r.error !== "wrong-pin" && r.error !== "locked") { await PinPad.confirm({ title, text: PIN_ERR[r.error] || r.error || T("gw.notSaved"), yes: T("common.ok") }); return null; }
    }
    let got = null;
    await PinPad.ask({ title, text: T("alert.enterPin"), check: async (p) => {
      const r = await go(p);
      if (r.ok) { got = r; return { ok: true }; }
      const msg = PIN_ERR[r.error] || r.error || T("gw.notSaved");
      return r.error === "wrong-pin" || r.error === "locked" ? PinPad.refusal(r) : { ok: false, msg, done: true };
    } });
    return got;
  }

  const when = (t) => {
    if (!t) return "";
    const d = new Date(t * 1000), days = Math.round((Date.now() - d) / 86400000);
    const date = T.dayShort(d);
    return days === 0 ? T("gw.today", { time: T.time(d) }) : days === 1 ? T("gw.yesterday", { date }) : days > 1 ? T("gw.daysAgo", { n: days, date }) : date;
  };

  const G = {
    DEFAULTS,
    payload,
    cfg() { return { ...DEFAULTS, ...((window.Settings && Settings.v && Settings.v.guest) || {}) }; },
    set(key, value) {
      const g = G.cfg(); g[key] = value;
      if (window.Settings && Settings.set) Settings.set("guest", g);
    },
    // on the home screen only when there's a network to show (the UniFi console's code, or one typed in Settings) — never
    // the sample — and not switched off in Settings (e.g. hidden for a party). It also steps aside for an
    // alarm note (app.js).
    visible() {
      const g = G.cfg();
      if (g.show === "off") return false;
      if (UNIFI && st && st.qr) return true;
      if (!g.ssid) return false;
      return UNIFI || g.show === "always" || (g.show === "guestMode" && g.guestMode);
    },

    // force = render even when hidden (used by the settings preview)
    card(force = false) {
      if (!force && !G.visible()) return "";
      css();
      if (UNIFI && st && st.enabled && (st.qr || !G.cfg().ssid)) return G.unifiCard();
      const g = G.cfg(), sample = !g.ssid;
      const ssid = sample ? T("gw.sampleSsid") : g.ssid;
      const pass = sample ? SAMPLE.password : g.security === "nopass" ? "" : g.password;
      const sec = sample ? "WPA" : g.security;
      return `<section class="card glass gw-card">
        <div class="gw-qr gz-i ${sample ? "gw-sample" : ""}">${qrSvg(payload(ssid, pass, sec))}</div>
        <div class="gw-txt gz-t">
          <span class="label">${esc(T("gw.title"))}${g.guestMode ? `<span class="gw-badge">${esc(T("gw.badgeGuestMode"))}</span>` : ""}</span>
          <div class="gw-ssid ${ssidW(ssid)}">${esc(ssid)}</div>
          ${pass ? `<div class="gw-pass"><small>${esc(T("gw.password"))}</small>${g.hidePassword && !sample ? "••••••••" : esc(pass)}</div>`
                 : `<div class="gw-pass"><small>${esc(T("gw.password"))}</small>${esc(T("gw.openNet"))}</div>`}
          <div class="gw-hint">${esc(T(sample ? "gw.sampleHint" : "gw.pointPhone"))}</div>
        </div></section>`;
    },

    // the UniFi console's guest network: its code (from the service) and name — never the password
    unifiCard() {
      const s = st || {}, here = guestsHere();
      const code = s.qr ? `<img src="/api/guest-wifi/qr.svg?v=${encodeURIComponent(s.qr)}" alt="${esc(T("gw.qrAlt"))}">` : esc(T("gw.beingSetUp"));
      return `<section class="card glass gw-card">
        <div class="gw-qr gz-i ${s.qr ? "" : "gw-wait"}">${code}</div>
        <div class="gw-txt gz-t">
          <span class="label">${esc(T("gw.title"))}${here ? `<span class="gw-badge">${esc(T("gw.badgeGuests"))}</span>` : ""}</span>
          <div class="gw-ssid ${ssidW(s.ssid || T("gw.title"))}">${esc(s.ssid || T("gw.title"))}</div>
          <div class="gw-hint">${esc(T(s.qr ? (s.open ? "gw.scanOpen" : "gw.scan") : "gw.seeSettings"))}</div>
        </div></section>`;
    },

    async choose(ssid) {
      if (await send({ settings: { ssid } }, T("gw.guestNetwork"))) poll();
    },
    async setRule(key, value) {
      if (await send({ settings: { [key]: value } }, T("gw.passwordTitle"))) poll();
    },
    async changeNow() {
      const ok = await PinPad.confirm({ title: T("gw.newPassword"), yes: T("gw.changeIt"), text: T("gw.newPasswordText") });
      if (!ok) return;
      if (await send({ changeNow: true }, T("gw.newPasswordTitle"))) setTimeout(poll, 4000);
    },
    // Settings is already unlocked with the PIN (no "are you sure", no second PIN): the remembered PIN gets
    // a one-time ticket from the dashboard service for exactly this switch, and it switches at once. (The PIN window
    // ran out → Settings has closed anyway; without a remembered PIN it asks like any PIN device.)
    async guestMode(id, on) {
      if (!window.Home || !Home.guestMode || !Home.guestModes().some((t) => t.id === id)) return;   // guest modes only
      if (busy.has(id)) return;   // a second tap while the first is on its way: ignored
      busy.add(id);
      try { await G.switchGuest(id, on); } finally { busy.delete(id); }
    },
    async switchGuest(id, on) {
      const say = (text) => PinPad.confirm({ title: T("guest.title"), text, yes: T("common.ok") });
      if (!(Home.hub && Home.hub.live)) return say(T("gw.hubOff"));
      const pin = window.PinPad && PinPad.unlocked ? PinPad.unlocked() : null;
      if (!pin) return Home.guestMode(id, on);
      const command = on ? "on" : "off";
      let j = {};
      try {
        const r = await fetch("/api/pin", { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "ticket", pin, items: [[id, command]] }) });
        j = await r.json().catch(() => ({}));
      } catch { return say(T("pin.serviceDown")); }
      if (!j.ok || !Array.isArray(j.tickets)) return say(PIN_ERR[j.error] || T("gw.cantSwitch"));
      const done = Home.resultOf(id, command);
      if (!Home.guestMode(id, on, j.tickets[0])) return;
      const r = await done;
      if (!r.ok) say(r.reason === "timeout" ? T("gw.noAnswer") : T("gw.notSwitched", { reason: r.reason || T("dev.refused") }));
      setTimeout(poll, 2000);
    },

    settingsTab() {
      css();
      if (UNIFI) return G.unifiTab();
      const g = G.cfg();
      const seg = (key, cur, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${cur === v ? "cur" : ""}" ${Acts.on("gw.set", key, v)}>${esc(l)}</button>`).join("")}</div>`;
      const sw = (key, on) => `<button class="switch ${on ? "on" : ""}" ${Acts.on("gw.set", key, !on)}></button>`;
      return `<div class="set-grid two">
        <section><h3>${esc(T("gw.guestNetwork"))}</h3>
          <div class="set-row col">${esc(T("gw.ssidLabel"))} <input class="txt" value="${esc(g.ssid)}" placeholder="${esc(T("gw.ssidPlaceholder"))}" autocomplete="off"${Acts.attr("change", "gw.setText", "ssid")}></div>
          <div class="set-row col">${esc(T("gw.password"))} <input class="txt" value="${esc(g.password)}" placeholder="${esc(T("gw.passwordPlaceholder"))}" autocomplete="off"${Acts.attr("change", "gw.setText", "password")}></div>
          <div class="set-row">${esc(T("gw.security"))} ${seg("security", g.security, [["WPA", "WPA / WPA2 / WPA3"], ["nopass", T("gw.open")]])}</div>
          <div class="set-row">${esc(T("gw.hidePassword"))} ${sw("hidePassword", g.hidePassword)}</div>
          <small class="muted">${esc(T("gw.qrHasPassword"))}</small>
        </section>
        <section><h3>${esc(T("gw.whenShow"))}</h3>
          <div class="set-row col">${esc(T("gw.show"))} ${seg("show", g.show, [["always", T("gw.always")], ["guestMode", T("gw.onlyGuestMode")], ["off", T("gw.off")]])}</div>
          <div class="set-row">${esc(T("gw.guestMode"))} ${sw("guestMode", g.guestMode)}</div>
          <small class="muted">${esc(T("gw.unifiHint"))}</small>
          <div class="label" style="margin-top:6px">${esc(T("gw.preview"))}</div>
          <div class="gw-preview">${G.card(true)}</div>
        </section></div>`;
    },

    unifiTab() {
      watchModes();
      const s = st || {}, set = s.settings || {}, modes = guestModes();
      const modeRows = modes.length ? modes.map((t) => {
        const on = t.attrs && t.attrs.switch === "on";
        return `<div class="set-row">${esc(t.name)} <button class="switch ${on ? "on" : ""}" ${Acts.on("gw.guestMode", +t.id, !on)}></button></div>`;
      }).join("") : `<small class="muted">${esc(T("gw.noModes"))}</small>`;
      const nets = (s.networks || []).slice(0, 12);
      const status = !s.enabled ? `<div class="gw-err">${esc(T("gw.starting"))}</div>`
        : s.error ? `<div class="gw-err">${esc(s.error)}</div>` : `<div class="gw-ok">${esc(T(s.manual ? "gw.setInManager" : "gw.connected"))}</div>`;

      // (stage 5: the guest network, its password rules and the card's show / hide are on the Manager page)
      return `<div class="set-grid two">
        <section><h3>${esc(T("gw.modesTitle"))}</h3>
          ${modeRows}
          <small class="muted">${esc(T("gw.guestsGoneHint"))}</small>
          ${s.guestsGoneAt && !s.guestsHere && set.afterGuests !== false && !s.open
            ? `<div class="gw-ok">${esc(Date.now() / 1000 > s.guestsGoneAt + 60 ? T("gw.leftChanging") : T("gw.leftAt", { time: T.time(new Date((s.guestsGoneAt + 60) * 1000)) }))}</div>` : ""}
        </section>
        <section><h3>${esc(T("gw.cardTitle"))}</h3>
          ${status}
          <div class="gw-preview">${G.card(true)}</div>
          <small class="muted">${esc(T("gw.managerHint", { url: `http://${location.host}/admin` }))}</small>
        </section></div>`;
    },
    setShow(v) { G.set("show", v); },
    setAfter(v) { G.setRule("afterGuests", !!v); },
    setDays(v) { G.setRule("days", +v); },
  };

  // the Guest mode tab's buttons and fields (acts.js; a value as data — a network named `x");…` stays a name)
  if (window.Acts) Acts.add({   // (window.Acts: also read on its own — service/test_smoke.py makes the QR text with it)
    "gw.set": (key, v) => G.set(key, v), "gw.guestMode": (id, on) => G.guestMode(id, on),
    "gw.setText": (key, el) => G.set(key, key === "ssid" ? el.value.trim() : el.value),
  });
  window.GuestWifi = G;
})();
