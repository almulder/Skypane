// Skypane Manager — Display settings (v3.0.4, the admin; service/house_settings.py DISPLAY): one set of units and
// date formats for the whole house — every panel follows it; a panel may keep its own temperature and wind units
// ("this panel only": its settings units.temp / units.wind, "" = follows the house).
// Saved at once: GET / PATCH /api/manage/display {set: {…}}; a panel's own units: PATCH /api/manage/panels/<id>.
// The examples use the panels' own formatter (../layouts/v4/shared/fmt.js, Fmt.source = the settings on screen).
// Drawn with DOM calls + textContent; every word from strings/en.js (Kit.t). On a phone: read only (desktop-first).
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast } = M;
  let D = null, busy = false;
  const phone = () => S.isPhone();
  const NOW = () => new Date();
  // (the Manager's own dates and times — Health → Timeline — follow the house too: every login gets it with its sign-in)
  if (window.Fmt) Fmt.source = () => (D && D.display) || (M.me() && M.me().display) || {};

  async function load() {
    try { D = await api("/api/manage/display"); } catch (e) { if (e.message !== "login") D = { failed: true }; }
    draw();
  }
  async function save(set) {
    if (busy) return;
    busy = true;
    try {
      const r = await api("/api/manage/display", { set });
      if (!r.ok) { toast(r.error || K.t("display.notSaved"), true); return; }
      D = r; toast(K.t("display.saved"));
    } catch (e) { if (e.message !== "login") toast(K.t("display.unreachable"), true); } finally { busy = false; draw(); }
  }
  async function savePanel(p, set) {
    try {
      const r = await api(`/api/manage/panels/${encodeURIComponent(p.id)}`, { set });
      if (!r.ok) { toast(r.error || K.t("display.notSaved"), true); return load(); }
      toast(K.t("display.panelSaved", { name: p.name }));
      load();
    } catch (e) { if (e.message !== "login") toast(K.t("display.unreachable"), true); }
  }

  // a row of buttons, one on: [[value, "Name", "small"]…]
  function seg(label, opts, cur, pick) {
    return el("div.seg", { role: "group", "aria-label": label }, opts.map(([v, n, sm]) =>
      el("button" + (String(v) === String(cur) ? ".on" : ""), { type: "button", "aria-pressed": String(String(v) === String(cur)), disabled: phone() || busy,
        onclick: () => { if (String(v) !== String(cur)) pick(v); } }, n, sm ? el("small", {}, sm) : null)));
  }
  const one = (key, opts) => seg(K.t(`display.${key}`), opts, D.display[key], (v) => save({ [key]: v }));
  const ex = (text) => el("span.ex", {}, text);
  const dtName = (f) => (f === "auto" ? K.t("display.dtAuto") : K.t(f.endsWith(" 12") ? "display.dtTwelve" : "display.dtTwentyFour", { d: f.slice(0, -3) }));

  function draw() {
    if (S.route().page !== "display") return;
    if (!D) { M.$main.replaceChildren(el("p.muted", {}, K.t("common.loading"))); return; }
    if (D.failed || !D.display) { M.$main.replaceChildren(el("p.gf.bad", {}, K.t("display.unreachable"))); return; }
    const d = D.display, F = window.Fmt, now = NOW();
    const units = K.group(K.t("display.units"), [
      K.row(K.t("display.temp"), K.t("display.tempHint"), one("temp", [["F", K.t("display.tempF"), "°F"], ["C", K.t("display.tempC"), "°C"]])),
      K.row(K.t("display.hubT"), K.t("display.hubTHint"), one("hubT", [["F", K.t("display.tempF"), "°F"], ["C", K.t("display.tempC"), "°C"]])),   // (v3.0.4)
      K.row(K.t("display.dist"), K.t("display.distHint"), one("dist", [["mi", K.t("display.distMi"), "mi, mph"], ["km", K.t("display.distKm"), "km, km/h"],   // i18n-ok (units)
        ["kn", K.t("display.distKn"), "nmi, kn"], ["m", K.t("display.distM"), "m, m/s"]])),   // i18n-ok (units)
      K.row(K.t("display.pres"), K.t("display.presHint"), one("pres", [["inHg", K.t("display.presIn"), "inHg"], ["hPa", K.t("display.presHpa"), ""]])),
      K.row(K.t("display.prec"), K.t("display.precHint"), one("prec", [["in", K.t("display.precIn"), "in"], ["mm", K.t("display.precMm"), "mm"]])),
    ], K.t("display.convertNote"));
    const dtSel = el("select", { "aria-label": K.t("display.dt"), disabled: phone() || busy, onchange: (e) => save({ dt: e.target.value }) },
      D.choices.dt.map((f) => el("option", { value: f, selected: f === d.dt }, dtName(f))));
    const dates = K.group(K.t("display.dates"), [
      K.row(K.t("display.dt"), K.t("display.dtHint"), el("div", {}, dtSel, F ? ex(`${F.dateTime(now)}  ·  ${F.longDate(now)}`) : null)),
      K.row(K.t("display.week"), K.t("display.weekHint"), one("week", [[0, K.t("display.weekSun")], [1, K.t("display.weekMon")]])),
    ]);
    const dec = K.group(K.t("display.decimals"), [
      K.row(K.t("display.dT"), "", el("div", {}, one("dT", [[0, "0"], [1, "1"]]), F ? ex(`${F.tempText(72.4, "F")} · ${F.speedText(8.3, "mph")}`) : null)),
      K.row(K.t("display.dP"), "", el("div", {}, one("dP", [[0, "0"], [1, "1"], [2, "2"]]), F ? ex(F.rain(0.25)) : null)),
      K.row(K.t("display.dPr"), "", el("div", {}, one("dPr", [[0, "0"], [1, "1"], [2, "2"]]), F ? ex(F.pressure(29.92)) : null)),
    ]);
    // the panels: each follows the house, or keeps its own temperature and wind units
    const houseWind = { mi: "mph", km: "km/h", kn: "kn", m: "m/s" }[d.dist];   // i18n-ok (units)
    const panelRows = (D.panels || []).map((p) => {
      const own = !!(p.temp || p.wind);
      const sw = K.sw(own, (on) => savePanel(p, on ? { "units.temp": d.temp, "units.wind": houseWind } : { "units.temp": "", "units.wind": "" }),
        K.t("display.panelOwn", { name: p.name }));
      if (phone()) sw.disabled = true;
      const rows = [K.row(p.name, own ? K.t("display.panelOwnHint") : K.t("display.panelFollows"), sw)];
      if (own) rows.push(K.row(K.t("display.panelUses", { name: p.name }), "", el("div", {},
        seg(K.t("display.temp"), [["F", "°F"], ["C", "°C"]], p.temp || d.temp, (v) => savePanel(p, { "units.temp": v })),   // i18n-ok (units)
        seg(K.t("display.wind"), [["mph", "mph"], ["km/h", "km/h"], ["m/s", "m/s"], ["kn", "kn"]], p.wind || houseWind, (v) => savePanel(p, { "units.wind": v })))));   // i18n-ok (units)
      return rows;
    }).flat();
    const panels = K.group(K.t("display.panels"), panelRows.length ? panelRows : [K.row(K.t("display.noPanels"), "", null)], K.t("display.panelsNote"));
    M.swap(M.$main, el("div.ds-page", {}, el("div.ph", {}, el("div", {}, el("h1", {}, K.t("display.title"), " ", el("span.pill.acc", {}, K.t("display.pill"))),
      el("p", {}, K.t("display.intro")))),
    phone() ? el("p.pn-info", {}, K.t("display.phoneInfo")) : null,
    el("div.ds-main", {}, ...units, ...dates, ...dec, ...panels)));
  }

  S.page("display", { title: K.t("display.title"), group: "admin", icon: "gauge", allowed: () => M.isAdmin(),
    words: "units temperature celsius fahrenheit wind mph km/h pressure rain date time format 12 24 hour week monday decimals",
    render: () => { D = null; draw(); load(); } });
})();
