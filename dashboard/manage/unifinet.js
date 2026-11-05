// Skypane Manager — Integrations → UniFi Network (v3.0.4, the admin; service/unifi_net.py reads the console, the server
// keeps the owner's settings in house/unifi-net.json). What the panels' UniFi cards show: each internet line's name (the
// one UniFi gives it as the main label, "WAN 1 / 2" small; no name: "Internet 1 / 2"; always editable — cleared, it goes
// back) and its connection-type icon, the "new device joined" notice and where it shows, guests hidden on the panels, the
// PoE warning, the client log (on / off, how long; the log itself: Health → Timeline → Network).
// Saved at once (no restart): GET / PATCH /api/manage/unifi {settings: {…}} — the panels see it at their next read.
// Drawn with DOM calls + textContent; every word from strings/en.js (Kit.t). On a phone: read only (desktop-first).
(function () {
  const M = window.Manage, K = window.Kit; if (!M || !K) return;
  const { el, api, toast } = M, ic = K.icon;
  const POE = [50, 60, 70, 75, 80, 85, 90, 95, 100];
  let D = null, PANELS = null, box = null, busy = false, choose = false, waitT = 0;

  const phone = () => window.Shell && Shell.isPhone();
  const S = () => (D && D.settings) || {};
  async function load() {
    try {
      D = await api("/api/manage/unifi");
      if (D.status === 403) D = { failed: true };
      if (!PANELS) PANELS = ((await api("/api/manage/panels").catch(() => ({}))).panels || []).map((p) => ({ id: p.id, name: p.name || p.id }));
    } catch (e) { if (e.message !== "login") D = { failed: true }; }
    draw();
  }
  async function save(settings, okText) {
    if (busy) return false;
    busy = true;
    try {
      const r = await api("/api/manage/unifi", { settings });
      if (!r.ok) { toast(r.error || K.t("unifi.notSaved"), true); draw(); return false; }
      D = { ...D, settings: r.settings };
      if (okText) toast(okText);
      // (the line names: the server puts them on — read again so the main label shows what the panels show)
      if (settings.wans) { busy = false; await load(); } else draw();
      return true;
    } catch (e) { if (e.message !== "login") toast(K.t("unifi.unreachable"), true); draw(); return false; } finally { busy = false; }
  }

  // ---------- the internet lines ----------
  // the name the panels show when nobody typed one: UniFi's, else "Internet 1 / 2" (unifi_net.apply_settings: the same)
  const autoName = (w, i) => w.uniFiName || K.t("unifi.wan.fallback", { n: i + 1 });
  const typeWord = (t) => K.t(`unifi.icon.${t}`);
  function wanRows(may) {
    const wans = D.wans || [];
    if (!wans.length) return [K.row(K.t("unifi.wan.title"), D.ok ? K.t("unifi.wan.none") : K.t("unifi.wan.notYet"), null)];
    return wans.map((w, i) => {
      const own = (S().wans || {})[w.key] || {}, auto = autoName(w, i);
      const hint = [w.slot || K.t("unifi.wan.slot", { n: i + 1 }), w.uniFiName ? K.t(own.label ? "unifi.wan.uniFiCallsRenamed" : "unifi.wan.uniFiCalls", { name: w.uniFiName })
        : K.t("unifi.wan.noName", { name: auto }), w.isp && w.isp !== w.uniFiName ? w.isp : null].filter(Boolean).join(" · ");
      if (!may) return K.row(w.name || auto, hint, el("span.muted", {}, typeWord(own.icon && own.icon !== "auto" ? own.icon : w.iconAuto || "wired")));
      const name = el("input", { type: "text", value: own.label || "", placeholder: auto, maxlength: "40", spellcheck: "false", "aria-label": K.t("unifi.wan.nameFor", { slot: w.slot || i + 1 }),
        onchange: (e) => save({ wans: { [w.key]: { label: e.target.value.trim(), icon: own.icon || "auto" } } }, e.target.value.trim() ? K.t("unifi.saved.name") : K.t("unifi.saved.nameBack", { name: auto })) });
      const icons = (D.choices && D.choices.icons) || ["auto"];
      const type = el("select", { "aria-label": K.t("unifi.wan.typeFor", { slot: w.slot || i + 1 }),
        onchange: (e) => save({ wans: { [w.key]: { label: own.label || "", icon: e.target.value } } }, K.t("unifi.saved.icon")) },
      icons.map((t) => el("option", { value: t, selected: (own.icon || "auto") === t }, t === "auto" ? K.t("unifi.icon.autoIs", { type: typeWord(w.iconAuto || "wired") }) : typeWord(t))));
      return K.row(w.name || auto, hint, el("div.un-wan", {}, name, type));
    });
  }

  // ---------- who sees what ----------
  const swRow = (key, title, hint, may, onWords, offWords) => K.row(title, hint,
    may ? K.sw(S()[key] === true, (v) => save({ [key]: v }, v ? onWords : offWords), title) : el("span.pill" + (S()[key] ? "" : ".idle"), {}, S()[key] ? K.t("control.on") : K.t("control.off")));
  function panelsRow(may) {
    const p = S().newDevicePanels, all = p === "all" || !Array.isArray(p), pick = new Set(all ? [] : p), list = PANELS || [];
    if (!may || !list.length) return K.row(K.t("unifi.notice.where"), K.t("unifi.notice.whereHint"),
      el("b", {}, all ? K.t("unifi.notice.everyPanel") : list.filter((x) => pick.has(x.id)).map((x) => x.name).join(", ") || K.t("unifi.notice.noPanel")));
    const changed = () => {
      const chosen = [...box.querySelectorAll("input[data-unp]:checked")].map((x) => x.dataset.unp);
      save({ newDevicePanels: chosen.length ? chosen : "all" }, K.t("unifi.saved.where"));
    };
    const allBox = el("input", { type: "checkbox", checked: all && !choose, onchange: (e) => { choose = !e.target.checked; if (e.target.checked) save({ newDevicePanels: "all" }, K.t("unifi.saved.where")); else draw(); } });
    const each = list.map((x) => el("label.wx-pn", {}, el("input", { type: "checkbox", "data-unp": x.id, checked: pick.has(x.id), disabled: all && !choose, onchange: changed }), ` ${x.name}`));
    return K.row(K.t("unifi.notice.where"), K.t("unifi.notice.whereHint"), el("div.wx-pns", {}, el("label.wx-pn", {}, allBox, ` ${K.t("unifi.notice.everyPanel")}`), ...each));
  }
  function poeRow(may) {
    const v = S().poeWarn || 80;
    return K.row(K.t("unifi.poe.label"), K.t("unifi.poe.hint"), el("select", { "aria-label": K.t("unifi.poe.label"), disabled: !may,
      onchange: (e) => save({ poeWarn: Number(e.target.value) }, K.t("unifi.saved.poe", { n: e.target.value })) },
    POE.map((n) => el("option", { value: String(n), selected: n === v }, K.t("unifi.poe.at", { n })))));
  }
  function logRows(may) {
    const s = S(), days = (D.choices && D.choices.logDays) || [1, 7];
    const rows = [swRow("clientLog", K.t("unifi.log.label"), K.t("unifi.log.hint"), may, K.t("unifi.saved.logOn"), K.t("unifi.saved.logOff"))];
    if (s.clientLog) rows.push(K.row(K.t("unifi.log.keep"), K.t("unifi.log.keepHint"), el("div.un-wan", {},
      el("select", { "aria-label": K.t("unifi.log.keep"), disabled: !may, onchange: (e) => save({ logDays: Number(e.target.value) }, K.t("unifi.saved.logDays")) },
        days.map((n) => el("option", { value: String(n), selected: s.logDays === n }, K.t("unifi.log.days", { n })))),
      el("button.btn.sm", { type: "button", onclick: () => { M.timelineChip = "network"; M.go("health/timeline"); } }, ic("clock", 13), K.t("unifi.log.open")))));
    return rows;
  }
  // how the reads go (the Integrations side card has the same Connected / Trouble): when, how many clients
  function statusLine() {
    if (D.error) return el("p.gf.bad", {}, D.error);
    if (!D.readAt) return el("p.gf", {}, K.t("unifi.status.waiting"));
    const c = D.counts || {};
    return el("p.gf", {}, K.t("unifi.status.read", { ago: K.ago(D.readAt, "mid"), n: c.clients || 0, guests: c.guests || 0 }));
  }

  function draw() {
    if (!box) return;
    if (!D) { box.replaceChildren(el("div.grp", {}, K.row(K.t("unifi.title"), K.t("common.loading"), null))); return; }
    if (D.failed) { box.replaceChildren(el("div.grp", {}, K.row(K.t("unifi.title"), K.t("unifi.loadFailed"), el("button.btn.sm", { type: "button", onclick: load }, K.t("weather.tryAgain"))))); return; }
    if (!D.enabled) { box.replaceChildren(el("div.grp", {}, K.row(K.t("unifi.off.label"), K.t("unifi.off.hint"), null))); return; }
    const may = !phone(), s = S(), rows = wanRows(may);
    rows.push(swRow("newDevice", K.t("unifi.notice.label"), K.t("unifi.notice.hint"), may, K.t("unifi.saved.noticeOn"), K.t("unifi.saved.noticeOff")));
    if (s.newDevice) rows.push(panelsRow(may));
    rows.push(swRow("hideGuests", K.t("unifi.guests.label"), K.t("unifi.guests.hint"), may, K.t("unifi.saved.guestsHidden"), K.t("unifi.saved.guestsShown")),
      poeRow(may), ...logRows(may));
    box.replaceChildren(el("div.grp", {}, rows), statusLine());
    // (v3.0.4) right after Connect: read again every 5 s until the first read is in (Manage.poll: no sign-in kept alive)
    clearTimeout(waitT);
    if (!D.readAt && !D.error) waitT = setTimeout(async () => {
      if (!box || !box.isConnected || busy) return;
      const r = await M.poll("/api/manage/unifi").catch(() => null);
      if (r && r.ok) { D = await r.json().catch(() => D); draw(); }
    }, 5000);
  }

  // the group on Integrations (integrations.js puts it after Guest Wi-Fi); filled when the answer arrives
  M.unifiGroup = () => {
    box = el("div.wx-box.un-box", {});
    D = null; PANELS = null; choose = false; draw(); load();
    return el("section.in-group", { "aria-label": K.t("unifi.title") }, el("div.gh", {}, ic("wifi", 15), ` ${K.t("unifi.title")}`),
      box, el("p.gf", {}, K.t("unifi.what")));
  };
  // (Health → Timeline → Network: the client log — the whole log, newest first; null when UniFi Network isn't set up)
  // (poll: the Timeline's 30 s read — Manage.poll, it never keeps the sign-in alive)
  M.unifiLog = async (poll) => {
    const r = poll ? await M.poll("/api/manage/unifi").then((x) => (x && x.ok ? x.json() : null)) : await api("/api/manage/unifi");
    return r && r.enabled ? (Array.isArray(r.log) ? r.log : []) : null;
  };
})();
