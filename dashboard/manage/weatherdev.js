// Skypane Manager — Integrations → Weather (v3.0.0, the admin; service/weather_device.py).
// A Hubitat weather device that carries warnings (e.g. the community OpenWeatherMap-Alerts driver), shared through Maker
// API: its warnings join the panels' alerts (levels by kind: tornado / flash-flood / hurricane / extreme warnings 5,
// other warnings 4, watches 3, advisories 2 — adjustable), and its weather feeds the weather card's Home tab instead of
// Open-Meteo (Open-Meteo stays the fallback: nothing set up, or the device's data older than 2 hours).
// Saved at once (no restart): GET / PATCH /api/manage/weather {set: {…}} — the bridge reads the setting within seconds.
// Drawn with DOM calls + textContent; every word from strings/en.js (Kit.t). On a phone: read only (desktop-first).
(function () {
  const M = window.Manage, K = window.Kit; if (!M || !K) return;
  const { el, api, toast } = M, ic = K.icon;
  const LEVELS = ["extreme", "warning", "watch", "advisory"];
  let D = null, box = null, busy = false, poll = null;

  const phone = () => window.Shell && Shell.isPhone();
  const S = () => (D && D.setting) || {};
  async function load() {
    try { D = await api("/api/manage/weather"); } catch (e) { if (e.message !== "login") D = { failed: true }; }
    draw();
  }
  async function save(set, okText) {
    if (busy) return false;
    busy = true;
    try {
      const r = await api("/api/manage/weather", { set });
      if (!r.ok) { toast(errorWords(r.error), true); draw(); return false; }
      D = r; draw();
      if (okText) toast(okText);
      // (the bridge picks the setting up within seconds: look again for its answer)
      clearTimeout(poll); poll = setTimeout(() => {
        if (!box || !box.isConnected) return;
        // (a device switched on / off or another one: the whole page again — the Connections card says it too)
        if (("device" in set || "on" in set) && M.renderSettings && !box.contains(document.activeElement)) M.renderSettings(); else load();
      }, 6000);
      return true;
    } catch (e) { if (e.message !== "login") toast(K.t("weather.unreachable"), true); draw(); return false; } finally { busy = false; }
  }
  const errorWords = (e) => (e === "no-device" ? K.t("weather.err.noDevice") : e === "not-in-maker-api" ? K.t("weather.err.notInMaker")
    : e ? K.t("weather.err.other", { why: e }) : K.t("weather.notSaved"));

  // ---------- what the bridge says now ----------
  function statusLine() {
    const s = S(), st = D.status, unit = (u) => (u === "C" ? "°C" : "°F");   // i18n-ok (units)
    if (D.broker === null) return el("p.gf.bad", {}, K.t("weather.status.noBroker"));
    if (D.bridge === "offline") return el("p.gf.bad", {}, K.t("weather.status.noBridge"));
    if (!s.on || !s.device) return el("p.gf", {}, K.t("weather.status.off"));
    if (!st) return el("p.gf", {}, K.t("weather.status.waiting"));
    const name = (st.device && st.device.name) || K.t("weather.thisDevice");
    if (st.reason === "card-off") return el("p.gf", {}, K.t("weather.status.cardOff", { name }));
    if (st.reason === "no-data") return el("p.gf.bad", {}, K.t("weather.status.noData", { name }));
    if (st.reason === "stale") return el("p.gf.bad", {}, st.updatedAt ? K.t("weather.status.stale", { name, ago: K.ago(st.updatedAt, "mid") }) : K.t("weather.status.staleNever", { name }));
    if (!st.active) return el("p.gf", {}, K.t("weather.status.waiting"));
    return el("p.gf", {}, K.t("weather.status.inUse", { name, temp: st.temp == null ? "—" : `${st.temp}${unit(st.units && st.units.temp)}`,
      ago: st.updatedAt ? K.ago(st.updatedAt, "mid") : "—", n: st.forecastDays || 0 }));
  }
  function warningsNow() {
    const w = (D.status && D.status.warnings) || [];
    if (!S().on || !S().warnings) return null;
    return K.row(K.t("weather.now.title"), w.length ? K.t("weather.now.hint") : K.t("weather.now.noneHint"),
      w.length ? el("div.wx-now", {}, w.map((x) => el("span.pill" + (x.lvl >= 4 ? ".bad" : x.lvl === 3 ? ".warn" : ""), {}, K.t("weather.now.item", { level: x.lvl, title: x.title }))))
        : el("span.muted", {}, K.t("weather.now.none")));
  }

  // ---------- the parts ----------
  function deviceRow(may) {
    const s = S(), list = D.devices || [];
    const label = (d) => (d.weather && d.alerts ? K.t("weather.device.both", { name: d.label }) : d.alerts ? K.t("weather.device.alertsOnly", { name: d.label })
      : d.weather ? K.t("weather.device.weatherOnly", { name: d.label }) : d.label);
    if (!list.length) return K.row(K.t("weather.device.label"), D.deviceListKnown ? K.t("weather.device.noneFound") : K.t("weather.device.noList"), el("span.muted", {}, K.t("weather.device.none")));
    if (!may) { const d = list.find((x) => x.id === s.device); return K.row(K.t("weather.device.label"), K.t("weather.device.hint"), el("b", {}, d ? d.label : K.t("weather.device.notChosen"))); }
    const sel = el("select", { "aria-label": K.t("weather.device.label"), onchange: (e) => {
      const v = e.target.value ? Number(e.target.value) : null;
      save(v ? { device: v, on: true } : { device: null, on: false }, v ? K.t("weather.saved.device") : K.t("weather.saved.off"));
    } }, el("option", { value: "", selected: !s.device }, K.t("weather.device.choose")),
    list.map((d) => el("option", { value: String(d.id), selected: d.id === s.device }, label(d))));
    return K.row(K.t("weather.device.label"), K.t("weather.device.hint"), sel);
  }
  const swRow = (key, title, hint, may, onWords, offWords) => K.row(title, hint,
    may ? K.sw(S()[key] === true, (v) => save({ [key]: v }, v ? onWords : offWords), title) : el("span.pill" + (S()[key] ? "" : ".idle"), {}, S()[key] ? K.t("control.on") : K.t("control.off")));

  function panelsRow(may) {
    const s = S(), all = (s.panels || ["all"]).includes("all"), pick = new Set(all ? [] : s.panels || []);
    if (!may) return K.row(K.t("weather.panels.label"), K.t("weather.panels.hint"),
      el("b", {}, all ? K.t("weather.panels.all") : (D.panels || []).filter((p) => pick.has(p.id)).map((p) => p.name).join(", ") || K.t("weather.panels.all")));
    const changed = () => {
      const chosen = [...box.querySelectorAll("input[data-wxp]:checked")].map((x) => x.dataset.wxp);
      save({ panels: chosen.length ? chosen : ["all"] }, K.t("weather.saved.panels"));
    };
    const allBox = el("input", { type: "checkbox", checked: all && !draw.openPanels, onchange: (e) => (e.target.checked ? save({ panels: ["all"] }, K.t("weather.saved.panels")) : draw(true)) });
    const each = (D.panels || []).map((p) => el("label.wx-pn", {}, el("input", { type: "checkbox", "data-wxp": p.id, checked: pick.has(p.id), disabled: all && !draw.openPanels, onchange: changed }), ` ${p.name}`));
    return K.row(K.t("weather.panels.label"), K.t("weather.panels.hint"), el("div.wx-pns", {}, el("label.wx-pn", {}, allBox, ` ${K.t("weather.panels.all")}`), ...each));
  }

  function levelsBlock(may) {
    const s = S(), lv = s.levels || {}, def = (D.defaults && D.defaults.levels) || {};
    const opt = (k) => el("select", { "aria-label": K.t(`weather.level.${k}`), disabled: !may, onchange: (e) => save({ levels: { [k]: Number(e.target.value) } }, K.t("weather.saved.levels")) },
      [5, 4, 3, 2, 1, 0].map((n) => el("option", { value: String(n), selected: lv[k] === n }, n ? K.t("weather.level.n", { n }) : K.t("weather.level.hidden"))));
    const rows = LEVELS.map((k) => K.row(K.t(`weather.level.${k}`), K.t(`weather.level.${k}Hint`, { n: def[k] }), opt(k)));
    const words = el("input", { type: "text", value: (s.extreme || []).join(", "), maxlength: "400", spellcheck: "false", disabled: !may, "aria-label": K.t("weather.extreme.label"),
      onchange: (e) => save({ extreme: e.target.value.split(",").map((w) => w.trim()).filter(Boolean) }, K.t("weather.saved.levels")) });
    rows.push(K.row(K.t("weather.extreme.label"), K.t("weather.extreme.hint"), words));
    if (may) rows.push(K.row(K.t("weather.levels.reset"), K.t("weather.levels.resetHint"), el("button.btn.sm", { type: "button",
      onclick: () => save({ levels: { ...def }, extreme: [...((D.defaults && D.defaults.extreme) || [])] }, K.t("weather.saved.reset")) }, K.t("weather.levels.resetButton"))));
    const open = LEVELS.some((k) => lv[k] !== def[k]);
    return el("div.grp-row.in-det", {}, el("details.in-sep", open ? { open: true } : {}, el("summary", {}, K.t("weather.levels.title")),
      el("p.gf", {}, K.t("weather.levels.intro")), el("div.grp", {}, rows)));
  }

  function moreBlock(may) {
    const s = S(), u = s.units || {}, at = s.attrs || {};
    const sel = (key, opts, cur) => el("select", { "aria-label": K.t(`weather.units.${key}`), disabled: !may, onchange: (e) => save({ units: { [key]: e.target.value } }, K.t("weather.saved.units")) },
      opts.map((v) => el("option", { value: v, selected: cur === v }, K.t(`weather.unitOpt.${key}.${v}`))));
    const attr = (role) => el("input", { type: "text", value: at[role] || "", placeholder: K.t(`weather.attr.${role}Default`), maxlength: "40", spellcheck: "false", disabled: !may,
      "aria-label": K.t(`weather.attr.${role}`), onchange: (e) => save({ attrs: { [role]: e.target.value.trim() } }, K.t("weather.saved.attrs")) });
    const rows = [K.row(K.t("weather.units.temp"), K.t("weather.units.tempHint"), sel("temp", ["auto", "F", "C"], u.temp || "auto")),
      K.row(K.t("weather.units.wind"), K.t("weather.units.windHint"), sel("wind", ["auto", "mph", "kmh", "knots", "ms"], u.wind || "auto")),
      ...["alert", "alertText", "alertsJson", "temp", "code"].map((r) => K.row(K.t(`weather.attr.${r}`), K.t(`weather.attr.${r}Hint`), attr(r)))];
    const open = (u.temp && u.temp !== "auto") || (u.wind && u.wind !== "auto") || Object.keys(at).length > 0;
    return el("div.grp-row.in-det", {}, el("details.in-sep", open ? { open: true } : {}, el("summary", {}, K.t("weather.more.title")),
      el("p.gf", {}, K.t("weather.more.intro")), el("div.grp", {}, rows)));
  }

  // (a poll: only the status line and Warnings now are drawn again — open sections and choices stay as they are)
  function refreshStatus() {
    if (!box || !D || D.failed) return;
    const old = box.querySelector(":scope > p.gf");
    if (old) old.replaceWith(statusLine());
    const now = warningsNow(), oldNow = box.querySelector("[data-wx-now]");
    if (now) now.dataset.wxNow = "1";
    if (oldNow && now) oldNow.replaceWith(now);
  }

  function draw(openPanels) {
    if (!box) return;
    draw.openPanels = openPanels === true;
    if (!D) { box.replaceChildren(el("div.grp", {}, K.row(K.t("weather.title"), K.t("common.loading"), null))); return; }
    if (D.failed) { box.replaceChildren(el("div.grp", {}, K.row(K.t("weather.title"), K.t("weather.loadFailed"), el("button.btn.sm", { type: "button", onclick: load }, K.t("weather.tryAgain"))))); return; }
    const may = !phone(), s = S();
    // ("Weather device on" governs the rest: first, once a device is chosen)
    const rows = s.device ? [swRow("on", K.t("weather.on.label"), K.t("weather.on.hint"), may, K.t("weather.saved.on"), K.t("weather.saved.off")), deviceRow(may)] : [deviceRow(may)];
    if (s.device) {
      rows.push(swRow("card", K.t("weather.card.label"), K.t("weather.card.hint"), may, K.t("weather.saved.cardOn"), K.t("weather.saved.cardOff")));
      rows.push(swRow("warnings", K.t("weather.warnings.label"), K.t("weather.warnings.hint"), may, K.t("weather.saved.warningsOn"), K.t("weather.saved.warningsOff")));
      if (s.warnings) rows.push(panelsRow(may));
      const now = warningsNow();
      if (now) { now.dataset.wxNow = "1"; rows.push(now); }
      if (s.warnings) rows.push(levelsBlock(may));
      rows.push(moreBlock(may));
    }
    rows.push(K.row(K.t("weather.help.label"), K.t("weather.help.hint"), el("button.btn.sm", { type: "button", onclick: () => M.help && M.help("weather") }, ic("help", 13), K.t("weather.help.button"))));
    box.replaceChildren(el("div.grp", {}, rows), statusLine());
  }

  // the group on Integrations (integrations.js puts it after Calendars); filled when the answer arrives
  M.weatherGroup = () => {
    box = el("div.wx-box", {});
    D = null; draw(); load();
    // (the bridge's answer and the device's freshness change on their own: look again every 15 s while the group is on
    // screen — not while something in it is being changed)
    clearInterval(M._wxPoll);
    M._wxPoll = setInterval(async () => {
      if (!box || !box.isConnected) { clearInterval(M._wxPoll); return; }
      if (busy || document.hidden || box.contains(document.activeElement)) return;
      try { const res = await M.poll("/api/manage/weather"), r = res && res.ok ? await res.json() : null; if (r && r.setting && !busy) { D = r; refreshStatus(); } } catch {}
    }, 15000);
    return el("section.in-group", { "aria-label": K.t("weather.title") }, el("div.gh", {}, ic("sun", 15), ` ${K.t("weather.title")}`),
      box, el("p.gf", {}, K.t("weather.what")));
  };
})();
