// Skypane Manager — Guest Wi-Fi (permission guest_wifi; v2.7.0 in the new look): the network guests join — from your
// UniFi console (its guest network, the password and when it changes, "Change password now") or typed here (the
// service makes the QR code) —, the house's guest modes (Hubitat switches; switched on the panels behind the PIN), the
// card on each panel (Show / Hide / only in guest mode) and the picture in the middle of the code. The side card: the
// card as the panels show it, who may change this. Admins also get "When guests stay": guest lockdown (a switch they
// pick, the panels that lock down and how — layouts/v4/shared/guestlock.js, v2.7.2).
// /api/manage/guest-wifi, /api/manage/guest-lockdown, /api/manage/panels/<id>. DOM calls + textContent only.
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast } = M, ic = K.icon;
  const phone = () => S.isPhone();
  const when = (t) => K.when(t);   // (kit.js: one date formatter)
  let G = null, LD = null, LIB = null, who = null;

  async function load() {
    G = await api("/api/manage/guest-wifi");
    LD = M.isAdmin() ? await api("/api/manage/guest-lockdown").catch(() => null) : null;
    LIB = M.isAdmin() ? await api("/api/manage/pictures").catch(() => null) : null;
    who = M.isAdmin() ? await api("/api/manage/users").catch(() => null) : null;
  }
  async function send(body, words) {
    try {
      const r = await api("/api/manage/guest-wifi", body);
      if (!r.ok) { toast(r.error || K.t("guest.notSaved"), true); return false; }
      if (words) toast(words);
      setTimeout(() => { if (S.route().page === "guest") render(); }, 1200);
      return true;
    } catch (e) { if (e.message !== "login") toast(K.t("guest.unreachable"), true); return false; }
  }
  const seg = (label, opts, cur, pick, may = true) => el("div.seg", { role: "group", "aria-label": label }, opts.map(([v, n]) =>
    el("button" + (cur === v ? ".on" : ""), { type: "button", "aria-pressed": String(cur === v), disabled: !may, onclick: () => cur !== v && pick(v) }, n)));

  // ---------- the network ----------
  function passwordCtl(pw) {
    if (!pw) return el("span.muted", {}, K.t("guest.pw.none"));
    const box = el("code.gw-pw", {}, "••••••••");
    return el("div.ac-two", {}, box,
      el("button.btn.sm.ghost", { type: "button", "aria-label": K.t("guest.pw.showTip"), onclick: (e) => { const hid = box.textContent.startsWith("•"); box.textContent = hid ? pw : "••••••••";
        e.currentTarget.replaceChildren(ic(hid ? "eyeoff" : "eye", 14), hid ? K.t("guest.pw.hide") : K.t("guest.pw.show")); } }, ic("eye", 14), K.t("guest.pw.show")),
      el("button.btn.sm.ghost", { type: "button", onclick: async () => toast((await M.copyText(pw)) ? K.t("guest.pw.copied") : K.t("guest.pw.copyFailed")) }, ic("copy", 14), K.t("guest.pw.copy")));
  }
  function unifiNetwork() {
    const set = G.settings || {}, may = !phone();
    const rows = [
      K.row(K.t("guest.unifi.console"), G.error ? G.error : K.t("guest.unifi.connectedHint"), el("span.pill" + (G.error ? ".bad" : ""), {}, G.error ? K.t("guest.unifi.trouble") : K.t("guest.unifi.connected"))),
      K.row(K.t("guest.unifi.network"), K.t("guest.unifi.networkHint"), (G.networks || []).length > 1 || !G.ssid
        ? el("select", { "aria-label": K.t("guest.unifi.network"), disabled: !may, onchange: (e) => send({ settings: { ssid: e.target.value } }, K.t("guest.savedCode")) },
          !G.ssid ? el("option", { value: "" }, K.t("guest.unifi.choose")) : null, (G.networks || []).map((n) => el("option", { value: n, selected: n === G.ssid }, n)))
        : el("b", {}, G.ssid)),
    ];
    if (G.ssid) rows.push(K.row(K.t("guest.password"), K.t("guest.unifi.passwordHint"), passwordCtl(G.open ? null : G.password)));
    return [...K.group(K.t("guest.network"), rows), ...K.group(K.t("guest.newPw.title"), [
      K.row(K.t("guest.newPw.afterGuests"), K.t("guest.newPw.afterGuestsHint"), seg(K.t("guest.newPw.afterGuests"), [[true, K.t("guest.on")], [false, K.t("guest.off")]], set.afterGuests !== false, (v) => send({ settings: { afterGuests: v } }, K.t("guest.saved")), may)),
      K.row(K.t("guest.newPw.every"), K.t("guest.newPw.everyHint"), seg(K.t("guest.newPw.everyLabel"), [[0, K.t("guest.newPw.never")], ...[1, 3, 7, 14, 30].map((n) => [n, K.t("guest.newPw.days", { n })])], set.days || 0, (v) => send({ settings: { days: v } }, K.t("guest.saved")), may)),
      K.row(K.t("guest.newPw.lastChanged"), G.changedAt ? (G.why ? K.t("guest.newPw.changedWhy", { when: when(G.changedAt), why: G.why }) : when(G.changedAt)) : K.t("guest.newPw.notYet"),
        el("button.btn.sm", { type: "button", onclick: async () => {   // (v2.9.0: on a phone too — the server decides who may)
          if (await K.ask({ title: K.t("guest.newPw.ask"), yes: K.t("guest.newPw.askYes"), text: K.t("guest.newPw.askText") })) send({ changeNow: true }, K.t("guest.newPw.changing"));
        } }, ic("refresh", 14), K.t("guest.newPw.changeNow"))),
    ], G.nextChange ? (G.guestsHere ? K.t("guest.newPw.nextAfterGuests") : K.t("guest.newPw.nextAt", { when: when(G.nextChange) })) : null)];
  }
  function typedNetwork() {
    // (v2.9.0 gate 2: a phone shows the network as rows to read — the password hidden, with Show and Copy)
    if (phone()) return K.group(K.t("guest.network"), [
      K.row(K.t("guest.name"), null, G.ssid ? el("b", {}, G.ssid) : el("span.muted", {}, K.t("guest.notSetUp"))),
      ...(G.ssid ? [K.row(K.t("guest.password"), K.t("guest.passwordHint"), passwordCtl(G.open ? null : G.password))] : []),
    ]);
    const may = !phone();
    const ssid = el("input", { type: "text", maxlength: "32", value: G.ssid || "", placeholder: K.t("guest.manual.namePlaceholder"), autocomplete: "off", disabled: !may, "aria-label": K.t("guest.name") });
    const pw = el("input", { type: "text", maxlength: "63", value: G.password || "", placeholder: K.t("guest.manual.passwordPlaceholder"), autocomplete: "off", spellcheck: "false", disabled: !may || !!G.open, "aria-label": K.t("guest.password") });
    const open = K.sw(!!G.open, (v) => { pw.disabled = v; }, K.t("guest.manual.openLabel"));
    const save = el("button.btn.pri", { type: "submit", disabled: !may }, G.manual ? K.t("guest.manual.save") : K.t("guest.manual.showIt"));
    const form = el("form", { "data-unsaved": K.t("guest.manual.unsaved"), onsubmit: async (e) => {
      e.preventDefault();
      const bytes = new TextEncoder().encode(ssid.value.trim()).length;
      if (bytes > 32) return toast(K.t("guest.manual.tooLong", { n: bytes }), true);
      save.disabled = true;
      await send({ manual: { ssid: ssid.value.trim(), password: pw.value, open: open.getAttribute("aria-checked") === "true" } }, K.t("guest.savedCode"));
      save.disabled = false;
    } }, el("div.grp", {},
      K.row(K.t("guest.name"), K.t("guest.manual.nameHint"), ssid),
      K.row(K.t("guest.password"), K.t("guest.manual.passwordHint"), pw),
      K.row(K.t("guest.manual.open"), K.t("guest.manual.openHint"), open),
      el("div.grp-row.gw-acts", {}, save, G.manual && may ? el("button.btn.pn-danger", { type: "button", onclick: async () => {
        if (await K.ask({ title: K.t("guest.manual.removeAsk"), yes: K.t("guest.manual.remove"), danger: true, text: K.t("guest.manual.removeText") })) send({ manual: null }, K.t("guest.manual.removed"));
      } }, K.t("guest.manual.remove")) : null)));
    return [el("div.gh", {}, K.t("guest.network")), form, el("p.gf", {}, K.t("guest.manual.foot"))];
  }
  // ---------- guest modes, the panels, the code's picture ----------
  function modes() {
    const ms = G.guestModes || [];
    if (!ms.length) return [];
    return K.group(K.t("guest.modes.title"), ms.map((m) => K.row(m.name || `#${m.id}`, null, el("span.pill" + (m.on ? ".acc" : ".idle"), {}, m.on ? K.t("guest.on") : K.t("guest.off")))),
      K.t("guest.modes.foot"));
  }
  function panels() {
    const ps = G.panels || [];
    if (!ps.length) return [];
    return K.group(K.t("guest.panels.title"), ps.map((p) => K.row(p.name, p.show === "off" ? K.t("guest.panels.hidden") : p.show === "guestMode" ? K.t("guest.panels.guestMode") : K.t("guest.panels.shows"),
      seg(K.t("guest.panels.cardOf", { name: p.name }), [["always", K.t("guest.pw.show")], ["off", K.t("guest.pw.hide")], ["guestMode", phone() ? K.t("guest.guestsShort") : K.t("guest.panels.inGuestMode")]], p.show, async (v) => {   // (v2.9.0: one row on a phone)
        const r = await api(`/api/manage/panels/${encodeURIComponent(p.id)}`, { set: { "guest.show": v } }).catch(() => ({}));
        if (!r.ok) return toast(r.error || K.t("guest.notSaved"), true);
        toast(K.t("guest.panels.saved")); render();
      }, p.mayEdit))), phone() ? K.t("guest.panelsPhone") : K.t("guest.panels.foot"));   // (v2.9.0: Show / Hide on a phone too)
  }
  function logo() {
    if (!M.isAdmin() || (!G.manual && !G.ssid)) return [];
    const ups = ((LIB && LIB.uploads) || []).filter((u) => u.style !== "background");
    const cur = G.qrLogo || "";
    const sel = el("select", { "aria-label": K.t("guest.logo.label"), disabled: phone(), onchange: async (e) => {
      const r = await api("/api/manage/guest-wifi", { qrLogo: e.target.value }).catch(() => ({}));
      if (!r.ok) return toast(r.error || K.t("guest.notSaved"), true);
      toast(K.t("guest.savedCode")); setTimeout(render, 1500);
    } }, el("option", { value: "", selected: !cur }, K.t("guest.logo.skypane")), ups.map((u) => el("option", { value: u.id, selected: u.id === cur }, u.name || u.id)));
    return K.group(K.t("guest.logo.title"), [K.row(K.t("guest.logo.row"), ups.length ? K.t("guest.logo.hint") : K.t("guest.logo.hintNone"),
      el("div.ac-two", {}, el("img.gw-logo", { src: cur ? `/pictures/${cur}` : "/assets/icon-192.png", alt: "" }), sel))]);
  }
  // ---------- guest lockdown (admins) ----------
  function lockdown() {
    if (!LD) return [];
    const L = LD.lockdown, may = !phone();
    const save = async (change, words) => {
      const r = await api("/api/manage/guest-lockdown", change).catch(() => ({}));
      if (!r.ok) return toast(r.error || K.t("guest.notSaved"), true);
      toast(words || K.t("guest.saved")); render();
    };
    const sw = el("select", { "aria-label": K.t("guest.lockdown.switch"), disabled: !may, onchange: (e) => save({ switch: e.target.value ? +e.target.value : null }) },
      el("option", { value: "" }, K.t("guest.lockdown.noSwitch")),
      // (v3.0.0) guest modes, virtual switches and ones named "guest" first; every light and plug under "Other switches"
      ...[[K.t("guest.lockdown.likelySwitches"), (LD.switches || []).filter((d) => d.guestMode || d.likely)],
        [K.t("guest.lockdown.otherSwitches"), (LD.switches || []).filter((d) => !(d.guestMode || d.likely))]].filter(([, list]) => list.length).map(([label, list]) =>
        el("optgroup", { label }, list.map((d) => el("option", { value: String(d.id), selected: d.id === L.switch },
          ((s) => (d.guestMode ? K.t("guest.lockdown.switchGuestMode", { name: s }) : s))(d.room ? K.t("guest.lockdown.switchInRoom", { label: d.label, room: d.room }) : d.label))))));
    const rows = [K.row(K.t("guest.lockdown.whileOn"), K.t("guest.lockdown.whileOnHint"), sw)];
    if (L.switch) {
      rows.push(K.row(K.t("guest.lockdown.what"), K.t("guest.lockdown.whatHint"),
        seg(K.t("guest.lockdown.what"), phone() ? [["pin", K.t("guest.modePinShort")], ["dark", K.t("guest.modeDarkShort")]] : [["pin", K.t("guest.lockdown.modePin")], ["dark", K.t("guest.lockdown.modeDark")]], L.mode, (v) => save({ mode: v }), may)));   // (gate 2: short words on a phone)
      if (L.mode === "dark") rows.push(K.row(K.t("guest.lockdown.offAfter"), K.t("guest.lockdown.offAfterHint"),
        seg(K.t("guest.lockdown.offAfter"), [[15, K.t("guest.lockdown.seconds", { n: 15 })], [30, K.t("guest.lockdown.seconds", { n: 30 })], [60, K.t("guest.lockdown.minutes", { n: 1 })], [120, K.t("guest.lockdown.minutes", { n: 2 })]], L.idle, (v) => save({ idle: v }), may)));
      rows.push(...(LD.panels || []).map((p) => K.row(p.name, null, K.sw(L.panels.includes(p.id), (v) => save({ panels: v ? [...L.panels, p.id] : L.panels.filter((x) => x !== p.id) }), K.t("guest.lockdown.panelLocks", { name: p.name })))));
    }
    // (v2.9.3) "Blur the calendar": its own choice of panels, apart from the lock / screen off above
    const blur = L.blurCalendar || [];
    const blurRows = L.switch ? (LD.panels || []).map((p) => K.row(p.name, null, K.sw(blur.includes(p.id),
      (v) => save({ blurCalendar: v ? [...blur, p.id] : blur.filter((x) => x !== p.id) }), K.t("guest.blurOn", { name: p.name })))) : [];
    return [el("div.gh", {}, K.t("guest.lockdown.title"), el("span.pill.idle.gw-admin", {}, K.t("guest.lockdown.admins"))), el("div.grp", {}, rows),
      ...(L.switch ? [el("div.gh", {}, K.t("guest.blurTitle")), el("div.grp", {}, blurRows), el("p.gf", {}, K.t("guest.blurHint", { n: blur.length }))] : []),
      el("p.gf", {}, L.switch ? K.t("guest.lockdown.panelsLock", { n: L.panels.length })
        : K.t("guest.lockdown.intro"))];
  }
  // ---------- the side card ----------
  function side() {
    const has = G.enabled && G.ssid;
    const qr = has && G.qr ? el("img.gw-qr", { src: `/api/guest-wifi/qr.svg?v=${encodeURIComponent(G.qr)}`, alt: K.t("guest.side.qrAlt") }) : el("span.gw-noqr", {}, ic("wifi", 28));   // i18n-ok (the code's address)
    const admins = who && Array.isArray(who.users) ? who.users.filter((u) => u.admin).map((u) => u.user) : [];
    const allowed = who && Array.isArray(who.users) ? who.users.filter((u) => !u.admin && u.perms && u.perms.guest_wifi).map((u) => u.user) : [];
    return [el("section.card.flush.gw-side", { "aria-label": K.t("guest.side.onPanel") }, el("h3.ch", {}, K.t("guest.side.onPanel"), el("small", {}, K.t("guest.side.card"))),
      el("div.gw-card", {}, qr, el("div", {}, el("small", {}, K.t("guest.title")), el("b", {}, has ? G.ssid : K.t("guest.notSetUp")), el("span", {}, has ? K.t("guest.side.join") : K.t("guest.side.setUp")))),
      el("p.gf.pad", {}, K.t("guest.side.foot"))),
    who ? el("section.card.flush.gw-side", { "aria-label": K.t("guest.side.who") }, el("h3.ch", {}, K.t("guest.side.who")),
      el("div.pn-kv", {}, el("span", {}, K.t("guest.side.admins", { n: admins.length })), el("b", {}, admins.join(", ") || "—"), el("span", {}, K.t("guest.side.alsoAllowed")), el("b", {}, allowed.join(", ") || K.t("guest.side.nobody"))),
      el("div.cm-acts.foot", {}, el("button.btn.sm", { type: "button", onclick: () => M.go("accounts") }, ic("users", 14), K.t("guest.side.openAccounts")))) : null].filter(Boolean);
  }
  function draw() {
    if (!G || S.route().page !== "guest") return;
    const net = !G.enabled ? typedNetwork() : G.manual ? typedNetwork() : unifiNetwork();
    const main = el("div.gw-main", {}, ...net, ...modes(), ...panels(), ...logo(), ...lockdown());
    M.swap(M.$main, el("div.gw-page", {}, el("div.ph", {}, el("div", {}, el("h1", {}, K.t("guest.title")),
      el("p", {}, K.t("guest.intro")))),
    phone() ? el("div.ac-narrow", {}, side()[0], main, el("p.pm-note", {}, ic("window", 15), el("span", {}, K.t("guest.onComputer"))))   // (v2.9.0)
      : window.innerWidth < 900 ? el("div.ac-narrow", {}, ...side(), main) : K.sideLayout(main, side())));
  }
  async function render() {
    if (!M.can("guest_wifi")) return M.$main.replaceChildren(K.empty("wifi", K.t("guest.noRight"), K.t("guest.noRightHint")));
    if (!G) M.$main.replaceChildren(S.isPhone() ? el("div.p-skel", { role: "status", "aria-label": K.t("common.loading") }, el("i"), el("i"), el("i")) : el("p.muted", {}, K.t("common.loading")));   // (v2.9.0: a phone, skeleton rows)
    try { await load(); } catch (e) { if (e.message !== "login") M.$main.replaceChildren(K.empty("wifi", K.t("guest.cantRead"), K.t("guest.tryAgain"))); return; }
    draw();
  }
  M.onReset(() => { G = null; LD = null; LIB = null; who = null; });
  S.page("guest", { title: K.t("guest.title"), group: () => (M.isAdmin() ? "admin" : "manage"), icon: "wifi", allowed: () => M.can("guest_wifi"), demoHidden: true, words: "wifi network qr password guest mode lockdown",
    render: () => render() });
  M.renderGuest = () => { if (S.route().page === "guest") render(); };
})();
