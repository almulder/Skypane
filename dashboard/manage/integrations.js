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
    ["cameras", "camera", ["UniFi Protect", "Cameras"], ["UniFi Protect", "Cameras"]],   // i18n-ok (the server's group names; v3.0.2: Protect's own status too)
    ["guest", "wifi", ["Guest Wi-Fi"], "Guest Wi-Fi"],   // i18n-ok (the server's group and status names)
    ["music", "zap", ["Music"], "Music"],   // i18n-ok (the server's names)
    ["ups", "battery", ["UPS"], "UPS"],   // i18n-ok (the server's names; v3.0.5: the UPS card's NUT server)
    ["general", "settings", ["General"], "General"],   // i18n-ok (the server's names)
  ];
  const CONNECTS = { "Hubitat": 1, "UniFi Protect": 1, "Guest Wi-Fi": 1, "Music": 1, "MQTT broker": 1 };   // i18n-ok (the server's group names: the ones with a Connect)
  // each group's title and what it's for
  const TITLE = { hub: K.t("integrations.group.hub"), broker: K.t("integrations.shared.aboutbroker"), cameras: K.t("integrations.shared.aboutcameras"),
    guest: K.t("integrations.group.guest"), music: K.t("integrations.group.music"), ups: K.t("integrations.group.ups"), general: K.t("integrations.group.general"), calendars: K.t("integrations.group.calendars") };
  const WHAT = { hub: K.t("integrations.group.hubWhat"), broker: K.t("integrations.group.brokerWhat"), cameras: K.t("integrations.group.camerasWhat"),
    guest: K.t("integrations.group.guestWhat"), music: K.t("integrations.group.musicWhat"), ups: K.t("integrations.group.upsWhat"), general: K.t("integrations.group.generalWhat") };
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
    MQTT_HOST: [K.t("integrations.field.mqttHost"), K.t("integrations.field.mqttHostHint")],
    TZ: [K.t("integrations.field.tz"), K.t("integrations.field.tzHint")],
  };
  const labelOf = (f) => (WORDS[f.key] || [f.label, f.help]);
  // (v3.0.2: "waiting" — set up, but no answer since the last save yet: never "Working" before the hub / console really answered)
  const tone = (st) => (st.state === "problem" ? ".bad" : st.state === "off" ? ".idle" : st.state === "waiting" ? ".warn" : "");
  // (v3.0.3: the UniFi console says "Connected" whether or not its guest network is set up yet — the Guest Wi-Fi page
  // says Connected too; "Working" one moment and "Connected" the next read as two different states)
  const pill = (st, name) => (!st ? null : el("span.pill" + tone(st), {}, el("span.dot" + tone(st), { "aria-hidden": "true" }),
    st.state === "problem" ? K.t("integrations.pill.trouble") : st.state === "off" ? K.t("integrations.pill.notSetUp")
      : st.state === "waiting" ? K.t("integrations.pill.checking") : st.needsSetup || name === "Guest Wi-Fi" || name === "UniFi Network" ? K.t("guest.unifi.connected") : K.t("integrations.pill.working")));   // i18n-ok (status name)
  const fineWords = (st, short) => (st.state === "waiting" ? K.t("integrations.status.waiting")
    : st.needsSetup ? (short ? K.t("integrations.status.needsSetupShort") : K.t("integrations.status.needsSetup"))   // (v3.0.3: connected, the guest network still to set up)
      : short ? K.t("integrations.status.fineShort") : K.t("integrations.status.fine"));

  // ---------- the save bar ----------
  const marker = el("input.sr-hide", { type: "text", tabindex: "-1", "aria-hidden": "true", value: "" });   // (the unsaved guard reads it)
  const bar = el("div.in-bar", { role: "region", "aria-label": K.t("integrations.bar.label"), hidden: true });
  function drawBar() {
    const n = Object.keys(pending).length;
    marker.value = n ? String(n) : "";
    bar.hidden = !n;
    bar.replaceChildren(el("span", {}, K.t("integrations.bar.waiting", { n })), el("span.sp"),
      el("button.btn", { type: "button", onclick: () => { for (const k of Object.keys(pending)) delete pending[k]; draw(); } }, K.t("integrations.bar.discard")),
      el("button.btn.pri", { type: "button", onclick: () => saveAll() }, K.t("integrations.bar.save")));
    drawConnects();
  }
  // (v3.0.2) each section's Connect row follows the typing: it shows up as soon as the section has a change waiting (and
  // takes the place of "Try again" — that one only checks, it saves nothing), and goes when the change is taken back
  const slots = [];   // {groups, statusName, kind, node} — the sections drawn now
  const connectKind = (groups, statusName) => {
    if (phone() || !groups.some((g) => g in CONNECTS)) return null;
    if (Object.keys(pending).some((k) => groups.includes(groupOfKey(k)))) return "connect";
    const bad = [].concat(statusName).some((n) => { const st = stateOf(n); return st && st.state === "problem" && st.reason !== "nokey" && st.reason !== "noaddress"; });
    return bad ? "again" : null;   // (working, checking or not set up: nothing to press)
  };
  function connectRow(s) {
    s.kind = connectKind(s.groups, s.statusName);
    const btn = connectBtn(s.groups, s.kind);
    const n = K.row(K.t("integrations.connect.label"), K.t("integrations.connect.hint"), btn || el("span"));
    if (!btn) n.hidden = true;
    return n;
  }
  function drawConnects() {
    for (const s of slots) {
      if (connectKind(s.groups, s.statusName) === s.kind) continue;   // (the same button: left as it is)
      const n = connectRow(s); s.node.replaceWith(n); s.node = n;
    }
  }
  // (v3.0.2: a Connect per section — only its own changes; the same save, the same restart. The owner: "connect it right
  // away" instead of the bar at the bottom; the status then says Checking… until the hub / console really answered)
  const groupOfKey = (k) => { const f = (DATA.fields || []).find((x) => x.key === k); return f ? f.group : null; };
  // (v3.0.2: every save restarts Skypane and reloads the page — other sections' changes would be dropped without a word:
  // asked first, "save them too" or "only this section")
  async function connect(groups) {
    const mine = Object.keys(pending).filter((k) => groups.includes(groupOfKey(k))), rest = Object.keys(pending).filter((k) => !mine.includes(k));
    if (!mine.length) return;
    if (rest.length) {
      const pick = await K.choose({ title: K.t("integrations.connect.restTitle"), text: K.t("integrations.connect.restText", { n: rest.length }),
        buttons: [["only", K.t("integrations.connect.restOnly")], ["all", K.t("integrations.connect.restAll"), "pri"]] });
      if (!pick) return;
      if (pick === "all") return saveAll();
    }
    return saveAll(mine);
  }
  const idOf = (k) => `in-${String(k).replace(/[^\w-]/g, "-")}`;
  // (v3.0.2) a save restarts Skypane and reloads the page: another form on it with typed changes (Event icons, a calendar
  // being added) is asked about first — the event icons can be saved along, anything else would be lost
  const changedIn = (f) => [...f.querySelectorAll("input, select, textarea")].some((i) => (i.type === "checkbox" || i.type === "radio" ? i.checked !== i.defaultChecked
    : i.tagName === "SELECT" ? i.selectedIndex !== Math.max(0, [...i.options].findIndex((o) => o.defaultSelected)) : i.value !== i.defaultValue));   // (manage.js's own check)
  async function othersOk() {
    const main = M.$main.querySelector(".in-main");
    const forms = main ? [...main.querySelectorAll("[data-unsaved]")].filter(changedIn) : [];
    if (!forms.length) return true;
    const icons = forms.some((f) => f.classList.contains("ei-card")) && M.saveEventIcons;
    const pick = await K.choose({ title: K.t("integrations.restart.otherTitle"),
      text: K.t("integrations.restart.otherText", { what: forms.map((f) => f.dataset.unsaved).join(", ") }),
      buttons: [["go", K.t("integrations.restart.anyway"), icons ? "" : "pri"], icons ? ["save", K.t("integrations.restart.saveIcons"), "pri"] : null].filter(Boolean) });
    if (!pick) return false;
    if (pick === "save") return !!(await M.saveEventIcons());
    return true;
  }
  async function saveAll(keys) {
    const body = {};
    for (const k of Array.isArray(keys) ? keys : Object.keys(pending)) body[k] = pending[k];
    if (!Object.keys(body).length) return;
    if (!(await othersOk())) return;
    try {
      const before = await M.bootId();
      const r = await api("/api/manage/settings", { set: body });
      if (!r.ok) return toast(r.error || K.t("integrations.notSaved"), true);
      // (v3.0.2: only the saved fields count as saved — the marker keeps the rest's count, so the unsaved guard still sees them)
      for (const k of Object.keys(body)) { delete pending[k]; const i = document.getElementById(idOf(k)); if (i) i.defaultValue = i.value; }
      drawBar();
      if (r.restarting && M.waitRestart) return M.waitRestart(before);   // (v3.0.0: "Restarting…", then a reload)
      toast(K.t("integrations.saved"));
      setTimeout(() => { if (S.route().page === "integrations") refresh(); }, 8000);
    } catch (e) { if (e.message !== "login") toast(K.t("integrations.unreachable"), true); }
  }
  const mark = (k, v, was) => { if (was !== undefined && v === was) delete pending[k]; else pending[k] = v; drawBar(); };

  // ---------- one setting ----------
  function replaceDialog(f, after) {
    let close = null;
    const input = el("input", { type: "password", autocomplete: "off", maxlength: "200", "aria-label": f.label });
    const form = el("form.modal.small.pn-ask", { role: "dialog", "aria-labelledby": "in-rp-h", onsubmit: (e) => {
      e.preventDefault(); if (!input.value) return; mark(f.key, input.value); close(); after();
      connect([f.group]);   // (v3.0.2: "Save" saves it — and connects that section — at once; no "kept for saving" any more)
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
          : el("span.pill.acc", {}, f.set ? K.t("integrations.secret.replaced") : K.t("integrations.secret.setWhenSaved")),   // ("Set when saved": not in use before Save and restart)
          may ? el("button.btn.sm", { type: "button", onclick: () => replaceDialog(f, paint) }, f.set ? K.t("integrations.secret.replace") : K.t("integrations.secret.set")) : null,
          may && f.set && pending[f.key] === undefined ? el("button.btn.sm.ghost", { type: "button", onclick: () => { mark(f.key, ""); paint(); } }, K.t("control.clear")) : null,
          pending[f.key] !== undefined ? el("button.btn.sm.ghost", { type: "button", onclick: () => { delete pending[f.key]; drawBar(); paint(); } }, K.t("integrations.secret.undo")) : null].filter(Boolean));
      };
      paint();
      return K.row(...labelOf(f), st);
    }
    // (v2.9.0 gate 2: a phone reads the value as text — no form to fill in)
    if (!may) return K.row(...labelOf(f), f.value ? el("b.in-ro", {}, f.value) : el("span.muted", {}, K.t("integrations.notSet")));
    const id = idOf(f.key);
    const input = el("input", { type: "text", id, value: pending[f.key] !== undefined ? pending[f.key] : f.value || "", autocomplete: "off", spellcheck: "false",
      placeholder: f.placeholder || "", disabled: !may, "aria-label": f.label, oninput: (e) => mark(f.key, e.target.value, f.value || "") });
    input.defaultValue = f.value || "";
    return K.row(...labelOf(f), input);
  }
  // (v3.0.4) a group's settings as rows, for a group drawn elsewhere (weatherdev.js: the OpenWeatherMap key)
  M.settingRowsOf = (g) => (DATA ? fieldsOf(g).map(settingRow) : []);
  function mqttRows() {
    if (!MQ || !MQ.builtin) return [];
    const pw = el("code", {}, "••••••••••••");
    return [K.row(K.t("integrations.mqtt.login"), K.t("integrations.mqtt.loginHint"),
      el("div.in-mq", {}, el("code", {}, `${location.hostname}:${MQ.port}`), el("code", {}, MQ.user), pw,
        el("button.btn.sm.ghost", { type: "button", onclick: () => { pw.textContent = pw.textContent.startsWith("•") ? MQ.pass : "••••••••••••"; } }, ic("eye", 14), K.t("integrations.mqtt.show")),
        el("button.btn.sm.ghost", { type: "button", onclick: async () => toast((await M.copyText(MQ.user)) ? K.t("integrations.mqtt.copiedUser") : K.t("integrations.mqtt.copyFailed")) }, ic("copy", 14), K.t("integrations.mqtt.copyUser")),
        el("button.btn.sm.ghost", { type: "button", onclick: async () => toast((await M.copyText(MQ.pass)) ? K.t("integrations.mqtt.copied") : K.t("integrations.mqtt.copyFailed")) }, ic("copy", 14), K.t("integrations.mqtt.copyPassword"))))];
  }
  // (data-st: refresh() draws it again in place — the fields around it are never touched)
  function statusRow(name, label) {
    const st = stateOf(name);
    return st ? K.row(label || K.t("integrations.shared.status"), st.state === "problem" ? (st.since ? K.t("integrations.status.since", { words: String(st.words || "").replace(/[.!]\s*$/, ""), ago: ago(st.since) }) : st.words)
      : st.state === "off" ? K.t("integrations.status.off") : fineWords(st), pill(st, name), { "data-st": name, "data-stl": label || "" }) : null;
  }
  function lastAlertRow() {
    if (!stateOf("Hubitat") || stateOf("Hubitat").state === "off") return null;
    const la = stateOf("Hubitat").lastAlert;
    return K.row(K.t("integrations.hub.lastAlert"), K.t("integrations.hub.lastAlertHint"),
      la ? el("span", {}, el("b", {}, la.title || la.text || "—"), " ", el("small.muted", {}, ago(la.at))) : el("span.muted", {}, K.t("integrations.hub.noAlert")), { "data-la": "" });
  }
  // (v3.0.5) the Skypane Notifier driver (mockups/prototypes/upgrade-and-notices.html, "Notifier driver out of date"):
  // "Up to date", or "Out of date: install vX from <import address>" with the steps, Copy and "Check again" — the
  // server's word (status.Hubitat.notifier: notifier_driver.state), nothing while it can't tell. data-nt: refresh()
  // draws it again in place
  let ntOpen = null;
  const WORD = { ok: "ok", old: "old", unknown: "unknown", none: "none" };   // (v3.0.5) a state → its word's key
  const ntAddr = () => `${location.origin}/hubitat/SkypaneNotifier.groovy`;   // i18n-ok (an address)
  function notifierRows() {
    const st = stateOf("Hubitat"), n = st && st.state !== "off" && st.notifier;
    if (!n || !["ok", "old", "unknown", "none"].includes(n.state)) return el("div.in-nt", { "data-nt": "" });
    const warn = n.state === "old" || n.state === "unknown", open = n.state !== "ok" && (ntOpen ?? true);
    const P = { ok: ["", "ok"], old: [".warn", "old"], unknown: [".warn", "unknown"], none: [".idle", "none"] }[n.state];
    const line = K.t(`integrations.notifier.${n.state}Line`, { have: n.have || "", want: n.want || "" });
    const hint = warn ? `${line}. ${K.t("integrations.notifier.outOfDate", { want: n.want || "", address: ntAddr() })}` : line;
    const toggle = n.state === "ok" ? null : el("button.btn.sm" + (warn ? ".pri" : ""), { type: "button", "aria-expanded": open ? "true" : "false",
      onclick: () => { ntOpen = !open; const x = M.$main.querySelector(".in-main [data-nt]"); if (x) x.replaceWith(notifierRows()); } },
    K.t(n.state === "none" ? "integrations.notifier.install" : "integrations.notifier.update"));
    const addr = () => el("div.in-nt-addr", {}, el("code", {}, ntAddr()), el("button.btn.sm", { type: "button", onclick: async () => {
      toast(await M.copyText(ntAddr()) ? K.t("integrations.notifier.copied") : K.t("integrations.notifier.copyFailed"), false); } }, ic("copy", 14), K.t("integrations.notifier.copy")));
    const steps = n.state === "none"
      ? [K.t("integrations.notifier.installTitle"), [el("li", {}, K.t("integrations.notifier.instDriver"), addr()), el("li", {}, K.t("integrations.notifier.instDevice")), el("li", {}, K.t("integrations.notifier.instMaker")), el("li", {}, K.t("integrations.notifier.instTest"))]]
      : [K.t("integrations.notifier.updateTitle"), [el("li", {}, K.t("integrations.notifier.updOpen")), el("li", {}, K.t("integrations.notifier.updImport"), addr(), el("small.muted", {}, K.t("integrations.notifier.updImportHint"))),
          el("li", {}, K.t("integrations.notifier.updSave")), el("li", {}, K.t("integrations.notifier.updBack"))]];
    // (v3.0.5) "Check again" always there; after it, a toast with the state in words (and the hub's version when it
    // says one) — every time, so the press is never met with silence
    const check = el("button.btn.sm", { type: "button", onclick: async () => {
      check.disabled = true;
      await api("/api/manage/health", { action: "check" }).catch(() => ({}));
      await refresh();
      const now = ((stateOf("Hubitat") || {}).notifier) || null;
      const word = now && WORD[now.state] ? K.t(`integrations.notifier.${WORD[now.state]}`) : K.t("integrations.notifier.unknownState");
      toast(now && now.have ? K.t("integrations.notifier.checkedHave", { state: word, have: now.have }) : K.t("integrations.notifier.checkedState", { state: word }),
        !!now && (now.state === "old" || now.state === "unknown"));
      if (check.isConnected) check.disabled = false;
    } }, ic("refresh", 14), K.t("integrations.notifier.check"));
    const when = n.checkedAt ? el("small.muted", {}, K.t("integrations.notifier.lastChecked", { when: ago(n.checkedAt) })) : null;
    return el("div.in-nt", { "data-nt": "" },
      K.row(K.t("integrations.notifier.label"), hint, el("span.in-nt-c", {}, el("span.pill" + P[0], {}, el("span.dot" + P[0], { "aria-hidden": "true" }), K.t(`integrations.notifier.${P[1]}`)), toggle),
        warn ? { class: "grp-row in-nt-hot" } : null),   // i18n-ok (class names)
      open ? el("div.grp-row.in-det.in-nt-steps", {}, el("b", {}, steps[0]), el("ol", {}, steps[1]), el("p.gf", {}, ic("info", 14), " ", K.t("integrations.notifier.failed"))) : null,
      el("div.grp-row.in-nt-bar", {}, check, when));
  }
  // (v3.0.5) the Skypane Helper Hubitat app (service/hubitat_helper.py): linked or not, "Link the Helper" (a one-time
  // code, shown once), "Update the driver" / "Update the app" (the app picks it up within a minute and says how it
  // went), "Update required" + the import address when the hub refused the code, the protocols it reported. data-hp:
  // refresh() draws it again in place; the code stays shown until it runs out
  let hpCode = null;   // {code, until}
  const hpAddr = (p) => `${location.origin}${p || "/hubitat/SkypaneHelper.groovy"}`;   // i18n-ok (an address)
  const hpSend = async (body) => {
    const r = await api("/api/manage/helper", body).catch(() => null);
    if (!r || r.status !== 200) { toast(r && r.error === "not-linked" ? K.t("integrations.helper.err.notLinked") : K.t("integrations.helper.failed"), true); return null; }
    return r;
  };
  // (v3.0.7) Maker API set up (its address, app number and token): the Switch card is offered then
  const makerSet = () => ["HUBITAT_HOST", "HUBITAT_APP_ID", "HUBITAT_TOKEN"].every((k) => { const f = (DATA.fields || []).find((x) => x.key === k); return !!f && (f.secret ? f.set : !!f.value); });   // i18n-ok (setting keys)
  function helperRows() {
    // (v3.0.7: shown with no Maker API too — the Helper is the hub link now; "Set up with the Skypane Helper" opens the steps)
    const st = stateOf("Hubitat"), h = st && st.helper;
    if (!h) return el("div.in-hp", { "data-hp": "" });
    const setupBtn = (pri) => el("button.btn.sm" + (pri ? ".pri" : ""), { type: "button", onclick: () => M.go("hubhelper") }, ic("link", 14), K.t("integrations.helper.setUp"));
    const P = !h.linked ? [".idle", "notLinked"] : h.updateRequired ? [".warn", "required"] : !h.online ? [".warn", "offline"] : h.appState === "old" ? [".warn", "appOld"] : ["", "linked"];
    const pill = el("span.pill" + P[0], {}, el("span.dot" + P[0], { "aria-hidden": "true" }), K.t(`integrations.helper.${P[1]}`));
    const copyBtn = (text) => el("button.btn.sm", { type: "button", onclick: async () => {
      toast(await M.copyText(text) ? K.t("integrations.notifier.copied") : K.t("integrations.notifier.copyFailed"), false); } }, ic("copy", 14), K.t("integrations.notifier.copy"));
    const addr = (p) => el("div.in-nt-addr", {}, el("code", {}, hpAddr(p)), copyBtn(hpAddr(p)));
    const rows = [];
    if (!h.linked) {
      // (v3.0.7) the guided setup (#hubhelper: Package Manager or by hand, the link code, the live checks)
      rows.push(K.row(K.t("integrations.helper.label"), K.t("integrations.helper.notLinkedHub"), el("span.in-nt-c", {}, pill, phone() ? null : setupBtn(true))));
      return el("div.in-hp", { "data-hp": "" }, ...rows);
    }
    const line = [h.online ? K.t("integrations.helper.heard", { when: ago(h.lastPoll) }) : h.lastPoll ? K.t("integrations.helper.notHeard", { when: ago(h.lastPoll) }) : K.t("integrations.helper.neverHeard"),
      h.have ? K.t("integrations.helper.version", { have: h.have }) : ""].filter(Boolean).join(" · ");   // i18n-ok (a separator)
    rows.push(K.row(K.t("integrations.helper.label"), line, el("span.in-nt-c", {}, pill)));
    // (v3.0.7) the hub link: through the Helper, or still Maker API (the Switch card), OAuth off, devices not given
    const hl = h.hubLink || {}, viaHelper = hl.set && (hl.use || !makerSet());
    rows.push(K.row(K.t("integrations.helper.hubLink"), viaHelper ? K.t("integrations.helper.viaHelper") : hl.set ? K.t("integrations.helper.viaMaker") : K.t("integrations.helper.noHubLink"),
      el("span.in-nt-c", {}, phone() ? null : setupBtn(!viaHelper && !hl.set), !phone() && hl.set && makerSet() ? el("button.btn.sm" + (viaHelper ? "" : ".pri"), { type: "button", onclick: () => M.go("hubhelper/switch") }, K.t("integrations.helper.switch")) : null)));
    if (h.oauth === false) {
      rows.push(el("div.grp-row.in-det.in-nt-steps.in-nt-hot", {}, el("b", {}, K.t("integrations.helper.oauthOff")), el("p", {}, K.t("integrations.helper.oauthFix"))));
    }
    if (Array.isArray(h.missing) && h.missing.length) {
      rows.push(el("div.grp-row.in-det.in-nt-steps.in-nt-hot", {}, el("b", {}, K.t("integrations.helper.missing", { n: h.missing.length })),
        el("p", {}, K.t("integrations.helper.missingFix", { names: h.missing.slice(0, 3).map((m) => m.name).join(", ") }))));
    }
    const req = h.request, res = h.result;
    const ask = (what) => async (e) => {
      e.currentTarget.disabled = true;
      const r = await hpSend({ action: "update", what });
      if (r && r.ok) toast(K.t("integrations.helper.asked"), false);
      await refresh();
    };
    const bar = el("div.grp-row.in-nt-bar", {},
      el("button.btn.sm.pri", { type: "button", disabled: !!req, onclick: ask("driver") }, ic("download", 14), K.t("integrations.notifier.update")),
      h.appState === "old" ? el("button.btn.sm", { type: "button", disabled: !!req, onclick: ask("app") }, K.t("integrations.helper.updateApp", { want: h.want || "" })) : null,
      el("button.btn.sm", { type: "button", disabled: !!req, onclick: ask("notifier") }, K.t("integrations.helper.makeNotifier")),
      req ? el("small.muted", {}, K.t("integrations.helper.waiting")) : res ? el("small" + (res.ok ? ".muted" : ".bad"), {},
        res.ok ? K.t(`integrations.helper.done.${res.what}`, { version: res.version || "" }) : K.t(`integrations.helper.err.${res.error || "endpoint"}`)) : null);
    rows.push(bar);
    if (h.updateRequired) {
      rows.push(el("div.grp-row.in-det.in-nt-steps", {}, el("b", {}, K.t("integrations.helper.requiredTitle")),
        el("p", {}, K.t("integrations.helper.requiredLine")), addr(h.driverPath), h.appState === "old" ? addr(h.importPath) : null));
    }
    const pc = h.protocols || {}, ORDER = ["zigbee", "zwave", "matter", "lan", "app", "virtual", "unknown"];
    const counts = ORDER.filter((p) => pc[p]).map((p) => `${K.t(`devices.proto.${p}`)} ${pc[p]}`).join(" · ");   // i18n-ok (a separator)
    rows.push(K.row(K.t("integrations.helper.devices"), h.devices ? K.t("integrations.helper.devicesLine", { n: h.devices, when: h.lastReport ? ago(h.lastReport) : "—" }) : K.t("integrations.helper.noDevices"),
      el("span.muted", {}, counts || "—")));
    rows.push(el("div.grp-row.in-nt-bar", {}, el("small.muted", {}, h.login ? K.t("integrations.helper.loginOn") : K.t("integrations.helper.loginOff")), el("span.sp"),
      el("button.btn.sm", { type: "button", onclick: async () => {
        if (!(await K.ask({ title: K.t("integrations.helper.unlink"), text: K.t("integrations.helper.unlinkQ"), yes: K.t("integrations.helper.unlink"), danger: true }))) return;
        const r = await hpSend({ action: "unlink" });
        if (r && r.ok) { hpCode = null; await refresh(); }
      } }, K.t("integrations.helper.unlink"))));
    return el("div.in-hp", { "data-hp": "" }, ...rows);
  }
  function group([id, icon, groups, statusName]) {
    const rows = [];
    for (const n of [].concat(statusName)) {   // (cameras: Protect's and the camera video's, each with its name)
      const sr = statusRow(n, Array.isArray(statusName) ? (n === "UniFi Protect" ? K.t("integrations.status.protect") : K.t("integrations.status.video")) : null);   // i18n-ok (status name)
      if (sr) rows.push(sr);
    }
    if (id === "broker") {
      rows.push(...mqttRows());
      const sep = fieldsOf("MQTT broker");
      const open = sep.some((f) => f.key === "MQTT_HOST" && f.value) || sep.some((f) => pending[f.key] !== undefined);
      const det = el("details.in-sep", open ? { open: true } : {}, el("summary", {}, K.t("integrations.mqtt.separate")), el("div.grp", {}, sep.map(settingRow)));
      rows.push(el("div.grp-row.in-det", {}, det));
    } else for (const g of groups) rows.push(...fieldsOf(g).map(settingRow));
    if (id === "hub") rows.push(lastAlertRow() || el("div.grp-row", { "data-la": "", hidden: true }));   // (v3.0.2: the Notifier's "Test" shows up here — no panel needed)
    if (id === "hub") rows.push(notifierRows());   // (v3.0.5: the Notifier driver — up to date, or how to update it)
    if (id === "hub") rows.push(helperRows());   // (v3.0.5: the Skypane Helper app)
    if (!phone() && groups.some((g) => g in CONNECTS)) {
      const s = { groups, statusName, kind: null, node: null };
      s.node = connectRow(s); slots.push(s); rows.push(s.node);
    }
    if (LINKS[id]) rows.push(linkRow(id, statusName));
    return el("section.in-group", { "aria-label": TITLE[id] }, el("div.gh", {}, ic(icon, 15), ` ${TITLE[id]}`), el("div.grp", {}, rows), el("p.gf", {}, WHAT[id]));
  }
  // (v3.0.3) the "Open →" row of a section; "Open → set up" in orange while its status says something is still to be set
  // up there (Guest Wi-Fi: connected, but no guest network / password yet). data-lk: refresh() draws it again in place
  function linkRow(id, statusName) {
    const setup = [].concat(statusName).some((n) => { const st = stateOf(n); return !!(st && st.needsSetup); });
    return K.row(LINKS[id][0], LINKS[id][1], el("button.btn.sm" + (setup ? ".in-setup" : ""), { type: "button", onclick: () => M.go(LINKS[id][2]) },
      K.t("control.open"), ic("arrowR", 13), setup ? K.t("integrations.link.setUp") : null), { "data-lk": id });
  }
  function connectBtn(groups, kind) {
    if (kind === "connect") return el("button.btn.sm.pri", { type: "button", onclick: () => connect(groups) }, ic("link", 14), K.t("integrations.connect.now"));
    if (kind !== "again") return null;
    const b = el("button.btn.sm", { type: "button", onclick: async () => {
      b.disabled = true;
      const r = await api("/api/manage/health", { action: "check" }).catch(() => ({}));
      if (b.isConnected) b.disabled = false;
      if (!r.ok) toast(r.error || K.t("integrations.notChecked"), true);
      refresh();   // (v3.0.3: also after a refused check — what is known now still shows)
    } }, ic("refresh", 14), K.t("integrations.connect.again"));
    return b;
  }
  function side() {
    const lines = [["server", TITLE.hub, "Hubitat"], ["broker", TITLE.broker, "MQTT broker"], ["camera", K.t("integrations.status.protect"), "UniFi Protect"], ["camera", TITLE.cameras, "Cameras"], ["wifi", TITLE.guest, "Guest Wi-Fi"], ["activity", K.t("integrations.status.unifiNet"), "UniFi Network"],   // i18n-ok (status names; v3.0.4: the UniFi cards' reads)
      ["calendar", TITLE.calendars, "Calendars"], ["sun", K.t("weather.title"), "Weather"], ["zap", TITLE.music, "Music"], ["battery", TITLE.ups, "UPS"]].map(([i, n, k]) => {   // i18n-ok (status names; v3.0.5: UPS)
      const st = stateOf(k);
      // (v3.0.0: the weather device — its name and last change, or why the panels use Open-Meteo)
      const wx = k === "Weather" && st && st.state !== "off" ? (String(st.reason || "").startsWith("owm") ? K.t(st.reason === "owm" ? "weather.side.owm" : "weather.side.owmProblem") : st.reason === "stale" ? K.t("weather.side.stale", { ago: st.updatedAt ? ago(st.updatedAt) : "—" })
        : st.reason === "no-data" ? K.t("weather.side.noData") : st.reason === "waiting" ? K.t("weather.side.waiting")
          : K.t("weather.side.ok", { name: st.device || K.t("weather.thisDevice"), ago: st.updatedAt ? ago(st.updatedAt) : "—" })) : null;
      return el("div.nl", {}, el("span.ni" + (st && st.state === "problem" ? ".bad" : st && (st.state === "off" || st.state === "waiting") ? "" : ".ok"), {}, ic(i, 16)),
        el("div", {}, el("b", {}, n), el("small", {}, !st ? "" : wx || (st.state === "problem" ? st.words : st.state === "off" ? K.t("integrations.pill.notSetUp") : fineWords(st, true)))), pill(st, k));
    });
    const check = el("button.btn.sm", { type: "button", onclick: async () => {
      check.disabled = true;
      const r = await api("/api/manage/health", { action: "check" }).catch(() => ({}));
      check.disabled = false;
      if (!r.ok) toast(r.error || K.t("integrations.notChecked"), true);
      else toast(K.t("integrations.checkedNow"));
      refresh();   // (v3.0.3: also after a refused check — what is known now still shows)
    } }, ic("refresh", 14), K.t("integrations.checkNow"));
    const words = { "settings.change": (e) => (e.data && e.data.keys ? K.t("integrations.recent.changedKeys", { keys: M.keyWords ? M.keyWords(e.data.keys) : e.data.keys.join(", ") }) : K.t("integrations.recent.changed")),
      "settings.check": () => K.t("integrations.recent.checked"), "settings.guest": () => K.t("integrations.recent.guest"),
      "settings.guest-now": () => K.t("integrations.recent.guestNow"), "settings.lockdown": () => K.t("integrations.recent.lockdown"),
      "settings.weather": () => K.t("integrations.recent.weather"), "settings.event-icons": () => K.t("integrations.recent.eventIcons") };
    return el("section.card.flush.in-side", { "aria-label": K.t("integrations.side.title") }, el("h3.ch", {}, K.t("integrations.side.title"),
      el("small", {}, DATA.checkedAt ? K.t("integrations.side.checkedAgo", { ago: ago(DATA.checkedAt) }) : K.t("integrations.side.notChecked"))),
      el("div.in-lines", {}, ...lines), el("div.cm-acts.foot", {}, check),
      recent.length ? el("h3.ch", {}, K.t("integrations.side.recent")) : null,
      recent.length ? el("div.in-recent", {}, recent.map((e) => el("div.nl", {}, el("div", {}, el("b", {}, (words[e.kind] || (() => K.t("integrations.recent.other")))(e)),
        el("small", {}, [window.Fmt ? Fmt.dateTime(new Date(e.at * 1000)) : new Date(e.at * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), e.who].filter(Boolean).join(" · ")))))) : null);   // (v3.0.4: the house's format)
  }
  function draw() {
    if (!DATA || S.route().page !== "integrations") return;
    slots.length = 0;
    const cal = M.calendarsCard ? M.calendarsCard() : null;
    const main = el("div.in-main", { "data-unsaved": K.t("integrations.unsavedName"), "data-save": K.t("integrations.bar.save") }, marker,
      ...GROUPS.slice(0, 4).map(group),
      M.unifiGroup ? M.unifiGroup() : null,   // (v3.0.4: what the panels' UniFi cards show — unifinet.js)
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
  // (v3.0.2: a page that couldn't be read — mostly Skypane restarting — asks again by itself: every 5 s for a minute,
  // and when the tab is shown again)
  let retryT = null, retries = 0, failed = false;
  async function render() {
    clearTimeout(retryT); retryT = null;
    if (!DATA) M.$main.replaceChildren(S.isPhone() ? el("div.p-skel", { role: "status", "aria-label": K.t("common.loading") }, el("i"), el("i"), el("i")) : el("p.muted", {}, K.t("common.loading")));   // (v2.9.0: a phone, skeleton rows)
    try { await load(); } catch (e) {
      if (e.message === "login") return;
      DATA = null; failed = true;
      M.$main.replaceChildren(K.empty("link", K.t("integrations.loadFailed"), K.t("integrations.tryAgain")));
      if (retries++ < 12) retryT = setTimeout(() => { retryT = null; if (S.route().page === "integrations" && !document.hidden) render(); }, 5000);
      return;
    }
    failed = false; retries = 0;
    draw();
    arm();
  }
  // the states, read again and drawn in place: the status rows, Hubitat's last alert, the Connect rows and the side card —
  // never the fields, the calendars or the event icons (what's being typed there stays as it is)
  let busy = false, again = false;
  async function refresh() {
    if (!DATA || S.route().page !== "integrations" || !M.$main.querySelector(".in-main")) return;
    if (busy) { again = true; return; }   // (v3.0.3: asked while one is under way — e.g. a calendar just added: once more after it)
    busy = true;
    try {
      const d = await api("/api/manage/settings");
      const r = await api("/api/manage/activity?kinds=settings&limit=5").catch(() => ({}));
      if (!d || !Array.isArray(d.fields) || S.route().page !== "integrations") return;
      DATA = d; if (Array.isArray(r.events)) recent = r.events;
    } catch (e) { return; } finally { busy = false; if (again) { again = false; setTimeout(refresh, 0); } }
    const root = M.$main;
    for (const n of root.querySelectorAll(".in-main [data-st]")) { const x = statusRow(n.dataset.st, n.dataset.stl || null); if (x) n.replaceWith(x); }
    for (const n of root.querySelectorAll(".in-main [data-la]")) n.replaceWith(lastAlertRow() || el("div.grp-row", { "data-la": "", hidden: true }));
    for (const n of root.querySelectorAll(".in-main [data-nt]")) n.replaceWith(notifierRows());   // (v3.0.5)
    for (const n of root.querySelectorAll(".in-main [data-hp]")) n.replaceWith(helperRows());   // (v3.0.5)
    for (const n of root.querySelectorAll(".in-main [data-lk]")) { const g = GROUPS.find((x) => x[0] === n.dataset.lk); if (g) n.replaceWith(linkRow(g[0], g[3])); }
    drawConnects();
    const sd = root.querySelector(".in-side");
    if (sd) M.swap(sd, ...side().childNodes);   // (swap: a focused "Check now" keeps the focus)
    arm();
  }
  // (v3.0.2: "Checking…" turns into Working / Trouble by itself — asked again every 4 s for up to 2 min, drawn in place:
  // what's being typed anywhere on the page stays; a hidden tab asks again once it is shown)
  let waitT = null, waits = 0;
  const waiting = () => !!DATA && Object.values(DATA.status || {}).some((st) => st && st.state === "waiting");
  function arm() {
    clearTimeout(waitT); waitT = null;
    if (!waiting()) { waits = 0; return; }
    if (waits++ >= 30) return;
    waitT = setTimeout(() => { waitT = null;
      if (S.route().page !== "integrations" || document.hidden) return;
      refresh(); }, 4000);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || S.route().page !== "integrations") return;
    if (failed && !retryT) { retries = 0; render(); return; }
    if (!waitT && waits < 30 && waiting()) arm();
  });
  M.onReset(() => { DATA = null; MQ = null; clearTimeout(retryT); retryT = null; failed = false; for (const k of Object.keys(pending)) delete pending[k]; });
  S.page("integrations", { title: K.t("integrations.title"), group: "admin", icon: "link", allowed: () => M.isAdmin(), words: "settings hubitat protect unifi mqtt calendars music time zone token",
    render: () => { retries = 0; render(); } });
  M.renderSettings = () => { if (S.route().page === "integrations") render(); };
  // (v3.0.3) the statuses read again and drawn in place (never the fields): calendars.js after a calendar is added,
  // changed or removed — its row said "Not set up" until the page was reloaded
  M.refreshIntegrations = () => { if (S.route().page === "integrations") refresh(); };
})();
