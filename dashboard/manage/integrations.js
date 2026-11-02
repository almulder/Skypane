// Skypane Manager — Integrations (admins only; v2.7.0): how Skypane talks to the hub, the broker, cameras, the UniFi
// console, calendars and music — the house settings (service/house_settings.py) in groups, a secret only as "set" with
// Replace… / Clear (never shown again), one sticky "Save and restart" bar for every change, and a side card with each
// connection's state from the health monitor ("Check now" runs the checks at once). No per-field "Test": a server
// asking a just-typed address is a door to the rest of the network — save, and the checks tell.
// /api/manage/settings, /api/manage/mqtt, /api/manage/health. Everything is drawn with DOM calls + textContent.
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast } = M, ic = K.icon;
  const phone = () => S.isPhone();
  const ago = (t) => K.ago(t, "secs");   // (kit.js: one "time ago" for every page)
  // the page's groups: [id, icon, the settings groups in it (the server's names), its status name (the health monitor's)]
  const GROUPS = [
    ["hub", "server", ["Hubitat"], "Hubitat"],   // i18n-ok (the server's names)
    ["broker", "broker", ["MQTT broker"], "MQTT broker"],   // i18n-ok (the server's names)
    ["cameras", "camera", ["UniFi Protect", "Cameras"], "Cameras"],   // i18n-ok (the server's group names)
    ["guest", "wifi", ["Guest Wi-Fi"], "Guest Wi-Fi"],   // i18n-ok (the server's group and status names)
    ["music", "zap", ["Music"], "Music"],   // i18n-ok (the server's names)
    ["general", "settings", ["General"], "General"],   // i18n-ok (the server's names)
  ];
  // each group's title and what it's for
  const TITLE = { hub: K.t("integrations.group.hub"), broker: K.t("integrations.shared.aboutbroker"), cameras: K.t("integrations.shared.aboutcameras"),
    guest: K.t("integrations.group.guest"), music: K.t("integrations.group.music"), general: K.t("integrations.group.general"), calendars: K.t("integrations.group.calendars") };
  const WHAT = { hub: K.t("integrations.group.hubWhat"), broker: K.t("integrations.group.brokerWhat"), cameras: K.t("integrations.group.camerasWhat"),
    guest: K.t("integrations.group.guestWhat"), music: K.t("integrations.group.musicWhat"), general: K.t("integrations.group.generalWhat") };
  const LINKS = { cameras: [K.t("integrations.shared.aboutcameras"), K.t("integrations.link.cameras"), "cameras"],
    guest: [K.t("integrations.link.guestLabel"), K.t("integrations.link.guest"), "guest"] };

  let DATA = null, MQ = null, recent = [];
  const pending = {};   // key -> new value ("" = clear)
  async function load() {
    DATA = await api("/api/manage/settings");
    MQ = await api("/api/manage/mqtt").catch(() => null);
    const r = await api("/api/manage/activity?kinds=settings&limit=5").catch(() => ({}));
    recent = Array.isArray(r.events) ? r.events : [];
  }
  const fieldsOf = (g) => (DATA.fields || []).filter((f) => f.group === g);

  // each part's state as the health pill knows it (service/server.py _settings_status): a part this house doesn't use is
  // "off" — "Not set up" —, never "Working"
  const stateOf = (name) => (DATA.status && DATA.status[name]) || null;
  // (v2.7.0) the settings' words where the server's own are technical
  const WORDS = {
    GO2RTC_URL: [K.t("integrations.field.videoServer"), K.t("integrations.field.videoServerHint")],
    TILE_MEDIUM_MODELS: [K.t("integrations.field.tileModels"), K.t("integrations.field.tileModelsHint")],
    BRIDGE_ALLOW: [K.t("integrations.field.bridgeAllow"), K.t("integrations.field.bridgeAllowHint")],
    ALLOWED_HOSTS: [K.t("integrations.field.allowedHosts"), K.t("integrations.field.allowedHostsHint")],
    MQTT_HOST: [K.t("integrations.field.mqttHost"), K.t("integrations.field.mqttHostHint")],
    TZ: [K.t("integrations.field.tz"), K.t("integrations.field.tzHint")],
  };
  const labelOf = (f) => (WORDS[f.key] || [f.label, f.help]);
  const pill = (st) => (!st ? null : el("span.pill" + (st.state === "problem" ? ".bad" : st.state === "off" ? ".idle" : ""), {}, el("span.dot" + (st.state === "problem" ? ".bad" : st.state === "off" ? ".idle" : ""), { "aria-hidden": "true" }),
    st.state === "problem" ? K.t("integrations.pill.trouble") : st.state === "off" ? K.t("integrations.pill.notSetUp") : K.t("integrations.pill.working")));

  // ---------- the save bar ----------
  const marker = el("input.sr-hide", { type: "text", tabindex: "-1", "aria-hidden": "true", value: "" });   // (the unsaved guard reads it)
  const bar = el("div.in-bar", { role: "region", "aria-label": K.t("integrations.bar.label"), hidden: true });
  function drawBar() {
    const n = Object.keys(pending).length;
    marker.value = n ? String(n) : "";
    bar.hidden = !n;
    bar.replaceChildren(el("span", {}, K.t("integrations.bar.waiting", { n })), el("span.sp"),
      el("button.btn", { type: "button", onclick: () => { for (const k of Object.keys(pending)) delete pending[k]; draw(); } }, K.t("integrations.bar.discard")),
      el("button.btn.pri", { type: "button", onclick: saveAll }, K.t("integrations.bar.save")));
  }
  async function saveAll() {
    const body = { ...pending };
    try {
      const before = await M.bootId();
      const r = await api("/api/manage/settings", { set: body });
      if (!r.ok) return toast(r.error || K.t("integrations.notSaved"), true);
      for (const k of Object.keys(body)) delete pending[k];
      drawBar();
      if (M.markSaved) M.markSaved(document.querySelector(".in-main"));   // (saved: no "Leave site?" on the reload)
      if (r.restarting && M.waitRestart) return M.waitRestart(before);   // (v3.0.0: "Restarting…", then a reload)
      toast(K.t("integrations.saved"));
      setTimeout(() => { if (S.route().page === "integrations") render(); }, 8000);
      drawBar();
    } catch (e) { if (e.message !== "login") toast(K.t("integrations.unreachable"), true); }
  }
  const mark = (k, v, was) => { if (was !== undefined && v === was) delete pending[k]; else pending[k] = v; drawBar(); };

  // ---------- one setting ----------
  function replaceDialog(f, after) {
    let close = null;
    const input = el("input", { type: "password", autocomplete: "off", maxlength: "200", "aria-label": f.label });
    const form = el("form.modal.small.pn-ask", { role: "dialog", "aria-labelledby": "in-rp-h", onsubmit: (e) => {
      e.preventDefault(); if (!input.value) return; mark(f.key, input.value); close(); after();
    } }, el("h2", { id: "in-rp-h" }, f.set ? K.t("integrations.secret.replaceTitle", { label: f.label }) : K.t("integrations.secret.setTitle", { label: f.label })), el("p", {}, K.t("integrations.secret.text")),
    el("label.pn-fld", {}, el("b", {}, f.label), input),
    el("div.pn-ask-acts", {}, el("button.btn", { type: "button", onclick: () => close() }, K.t("control.cancel")), el("button.btn.pri", { type: "submit" }, K.t("integrations.secret.keep"))));
    const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) close(); } }, form);
    close = M.dialog(shade, input);
  }
  function settingRow(f) {
    const may = !phone();
    if (f.secret) {
      const st = el("span.in-secret");
      const paint = () => {
        const p = pending[f.key];
        st.replaceChildren(...[p === undefined ? (f.set ? el("code", {}, K.t("integrations.secret.isSet")) : el("span.muted", {}, K.t("integrations.notSet"))) : p === "" ? el("span.pill.warn", {}, K.t("integrations.secret.cleared"))
          : el("span.pill.acc", {}, f.set ? K.t("integrations.secret.replaced") : K.t("integrations.secret.setWhenSaved")),
          may ? el("button.btn.sm", { type: "button", onclick: () => replaceDialog(f, paint) }, f.set ? K.t("integrations.secret.replace") : K.t("integrations.secret.set")) : null,
          may && f.set && pending[f.key] === undefined ? el("button.btn.sm.ghost", { type: "button", onclick: () => { mark(f.key, ""); paint(); } }, K.t("control.clear")) : null,
          pending[f.key] !== undefined ? el("button.btn.sm.ghost", { type: "button", onclick: () => { delete pending[f.key]; drawBar(); paint(); } }, K.t("integrations.secret.undo")) : null].filter(Boolean));
      };
      paint();
      return K.row(...labelOf(f), st);
    }
    // (v2.9.0 gate 2: a phone reads the value as text — no form to fill in)
    if (!may) return K.row(...labelOf(f), f.value ? el("b.in-ro", {}, f.value) : el("span.muted", {}, K.t("integrations.notSet")));
    const id = `in-${String(f.key).replace(/[^\w-]/g, "-")}`;
    const input = el("input", { type: "text", id, value: pending[f.key] !== undefined ? pending[f.key] : f.value || "", autocomplete: "off", spellcheck: "false",
      placeholder: f.placeholder || "", disabled: !may, "aria-label": f.label, oninput: (e) => mark(f.key, e.target.value, f.value || "") });
    input.defaultValue = f.value || "";
    return K.row(...labelOf(f), input);
  }
  function mqttRows() {
    if (!MQ || !MQ.builtin) return [];
    const pw = el("code", {}, "••••••••••••");
    return [K.row(K.t("integrations.mqtt.login"), K.t("integrations.mqtt.loginHint"),
      el("div.in-mq", {}, el("code", {}, `${location.hostname}:${MQ.port}`), el("code", {}, MQ.user), pw,
        el("button.btn.sm.ghost", { type: "button", onclick: () => { pw.textContent = pw.textContent.startsWith("•") ? MQ.pass : "••••••••••••"; } }, ic("eye", 14), K.t("integrations.mqtt.show")),
        el("button.btn.sm.ghost", { type: "button", onclick: async () => toast((await M.copyText(MQ.user)) ? K.t("integrations.mqtt.copiedUser") : K.t("integrations.mqtt.copyFailed")) }, ic("copy", 14), K.t("integrations.mqtt.copyUser")),
        el("button.btn.sm.ghost", { type: "button", onclick: async () => toast((await M.copyText(MQ.pass)) ? K.t("integrations.mqtt.copied") : K.t("integrations.mqtt.copyFailed")) }, ic("copy", 14), K.t("integrations.mqtt.copyPassword"))))];
  }
  function statusRow(name) {
    const st = stateOf(name);
    return st ? K.row(K.t("integrations.shared.status"), st.state === "problem" ? (st.since ? K.t("integrations.status.since", { words: st.words, ago: ago(st.since) }) : st.words)
      : st.state === "off" ? K.t("integrations.status.off") : K.t("integrations.status.fine"), pill(st)) : null;
  }
  function group([id, icon, groups, statusName]) {
    const rows = [];
    const sr = statusRow(statusName);
    if (sr) rows.push(sr);
    if (id === "broker") {
      rows.push(...mqttRows());
      const sep = fieldsOf("MQTT broker");
      const open = sep.some((f) => f.key === "MQTT_HOST" && f.value) || sep.some((f) => pending[f.key] !== undefined);
      const det = el("details.in-sep", open ? { open: true } : {}, el("summary", {}, K.t("integrations.mqtt.separate")), el("div.grp", {}, sep.map(settingRow)));
      rows.push(el("div.grp-row.in-det", {}, det));
    } else for (const g of groups) rows.push(...fieldsOf(g).map(settingRow));
    if (LINKS[id]) rows.push(K.row(LINKS[id][0], LINKS[id][1], el("button.btn.sm", { type: "button", onclick: () => M.go(LINKS[id][2]) }, K.t("control.open"), ic("arrowR", 13))));
    return el("section.in-group", { "aria-label": TITLE[id] }, el("div.gh", {}, ic(icon, 15), ` ${TITLE[id]}`), el("div.grp", {}, rows), el("p.gf", {}, WHAT[id]));
  }
  function side() {
    const lines = [["server", TITLE.hub, "Hubitat"], ["broker", TITLE.broker, "MQTT broker"], ["camera", TITLE.cameras, "Cameras"], ["wifi", TITLE.guest, "Guest Wi-Fi"],   // i18n-ok (status names)
      ["calendar", TITLE.calendars, "Calendars"], ["sun", K.t("weather.title"), "Weather"]].map(([i, n, k]) => {   // i18n-ok (status names)
      const st = stateOf(k);
      // (v3.0.0: the weather device — its name and last change, or why the panels use Open-Meteo)
      const wx = k === "Weather" && st && st.state !== "off" ? (st.reason === "stale" ? K.t("weather.side.stale", { ago: st.updatedAt ? ago(st.updatedAt) : "—" })
        : st.reason === "no-data" ? K.t("weather.side.noData") : st.reason === "waiting" ? K.t("weather.side.waiting")
          : K.t("weather.side.ok", { name: st.device || K.t("weather.thisDevice"), ago: st.updatedAt ? ago(st.updatedAt) : "—" })) : null;
      return el("div.nl", {}, el("span.ni" + (st && st.state === "problem" ? ".bad" : st && st.state === "off" ? "" : ".ok"), {}, ic(i, 16)),
        el("div", {}, el("b", {}, n), el("small", {}, !st ? "" : wx || (st.state === "problem" ? st.words : st.state === "off" ? K.t("integrations.pill.notSetUp") : K.t("integrations.status.fineShort")))), pill(st));
    });
    const check = el("button.btn.sm", { type: "button", onclick: async () => {
      check.disabled = true;
      const r = await api("/api/manage/health", { action: "check" }).catch(() => ({}));
      check.disabled = false;
      if (!r.ok) return toast(r.error || K.t("integrations.notChecked"), true);
      toast(K.t("integrations.checkedNow")); render();
    } }, ic("refresh", 14), K.t("integrations.checkNow"));
    const words = { "settings.change": (e) => (e.data && e.data.keys ? K.t("integrations.recent.changedKeys", { keys: e.data.keys.join(", ") }) : K.t("integrations.recent.changed")),
      "settings.check": () => K.t("integrations.recent.checked"), "settings.guest": () => K.t("integrations.recent.guest"),
      "settings.guest-now": () => K.t("integrations.recent.guestNow"), "settings.lockdown": () => K.t("integrations.recent.lockdown"),
      "settings.weather": () => K.t("integrations.recent.weather") };
    return el("section.card.flush.in-side", { "aria-label": K.t("integrations.side.title") }, el("h3.ch", {}, K.t("integrations.side.title"),
      el("small", {}, DATA.checkedAt ? K.t("integrations.side.checkedAgo", { ago: ago(DATA.checkedAt) }) : K.t("integrations.side.notChecked"))),
      el("div.in-lines", {}, ...lines), el("div.cm-acts.foot", {}, check),
      recent.length ? el("h3.ch", {}, K.t("integrations.side.recent")) : null,
      recent.length ? el("div.in-recent", {}, recent.map((e) => el("div.nl", {}, el("div", {}, el("b", {}, (words[e.kind] || (() => K.t("integrations.recent.other")))(e)),
        el("small", {}, [new Date(e.at * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), e.who].filter(Boolean).join(" · ")))))) : null);
  }
  function draw() {
    if (!DATA || S.route().page !== "integrations") return;
    const cal = M.calendarsCard ? M.calendarsCard() : null;
    const main = el("div.in-main", { "data-unsaved": K.t("integrations.unsavedName"), "data-save": K.t("integrations.bar.save") }, marker,
      ...GROUPS.slice(0, 4).map(group),
      cal ? el("section.in-group", { "aria-label": TITLE.calendars }, el("div.gh", {}, ic("calendar", 15), ` ${TITLE.calendars}`),
        el("div.grp", {}, statusRow("Calendars"), el("div.grp-row.in-det", {}, cal)), el("p.gf", {}, K.t("integrations.group.calendarsWhat"))) : null,
      M.weatherGroup ? M.weatherGroup() : null,   // (v3.0.0: a Hubitat weather device — weatherdev.js)
      ...GROUPS.slice(4).map(group),
      el("p.gf", {}, K.t("integrations.footer")));
    drawBar();
    // (v2.9.0: read only on a phone — values as text rows, the calendars as a list; Check now stays)
    M.swap(M.$main, el("div.in-page", {}, el("div.ph", {}, el("div", {}, el("h1", {}, K.t("integrations.title")),
      el("p", {}, K.t("integrations.intro")))),
    phone() ? el("div.ac-narrow", {}, side(), el("p.pn-info", {}, K.t("integrations.phoneInfo")), main)
      : window.innerWidth < 900 ? el("div.ac-narrow", {}, main, side()) : K.sideLayout(main, side()), phone() ? null : bar));
  }
  async function render() {
    if (!DATA) M.$main.replaceChildren(S.isPhone() ? el("div.p-skel", { role: "status", "aria-label": K.t("common.loading") }, el("i"), el("i"), el("i")) : el("p.muted", {}, K.t("common.loading")));   // (v2.9.0: a phone, skeleton rows)
    try { await load(); } catch (e) { if (e.message !== "login") M.$main.replaceChildren(K.empty("link", K.t("integrations.loadFailed"), K.t("integrations.tryAgain"))); return; }
    draw();
  }
  M.onReset(() => { DATA = null; MQ = null; for (const k of Object.keys(pending)) delete pending[k]; });
  S.page("integrations", { title: K.t("integrations.title"), group: "admin", icon: "link", allowed: () => M.isAdmin(), words: "settings hubitat protect unifi mqtt calendars music time zone token",
    render: () => render() });
  M.renderSettings = () => { if (S.route().page === "integrations") render(); };
})();
