// Fmt — (v3.0.4) the house's units and date formats in one place (Manager → Display settings; the choices:
// service/house_settings.py DISPLAY). Every temperature, speed, distance, pressure, rain amount, date and time a panel
// shows goes through here. The house's settings come with the panel's data (PanelStore "house"); the panel's own
// units.temp / units.wind ("this panel only", Manager → Panels) win over the house's.
// The date format "auto" is the language's own (Intl, exactly as before 3.0.4). Fmt also takes over T.time, T.clock,
// T.clockParts, T.hour, T.dateTime, T.dayShort and T.date (strings.js), so everything that calls those follows too.
//   Fmt.units() {temp: "F"|"C", wind: "mph"|"km/h"|"kn"|"m/s"} · Fmt.temp(v, from) / Fmt.speed(v, from): numbers in them
//   Fmt.tempText(v, from, unit?) "72°F" · Fmt.speedText(v, from) "8 mph" · Fmt.dist(mi) · Fmt.pressure(inHg) · Fmt.rain(in) · Fmt.snow(in)
//   Fmt.time(d) · Fmt.timeParts(d) {h, m, ap} · Fmt.hour(h) · Fmt.date(d) "11/5/2026" · Fmt.longDate(d, opts) "Wed, Nov 5"
//   Fmt.dateTime(d) · Fmt.dayShort(d) "Nov 5" · Fmt.weekStart() 0 | 1
//   Fmt.hub() "F"|"C" the unit the Hubitat hub reports in (Display settings) · Fmt.hubTemp(v) a hub reading in the panel's
//   unit · Fmt.hubRange() {lo, hi, gap} a thermostat's set point range in the hub's unit (set points go back in it)
(function () {
  const DEF = { temp: "F", dist: "mi", pres: "inHg", prec: "in", dt: "auto", week: 0, dT: 0, dP: 2, dPr: 2 };
  const WIND = { mi: "mph", km: "km/h", kn: "kn", m: "m/s" };
  const PER_MPH = { mph: 1, "km/h": 1.609344, kn: 0.868976, "m/s": 0.44704 };
  // (a source's own spelling: Hubitat drivers, Open-Meteo, OpenWeatherMap)
  const ALIAS = { mph: "mph", "km/h": "km/h", kmh: "km/h", kph: "km/h", kn: "kn", knots: "kn", kt: "kn", "m/s": "m/s", ms: "m/s" };
  const speedUnit = (u) => ALIAS[String(u || "").toLowerCase()] || "mph";
  const isObj = (o) => o !== null && typeof o === "object";
  const F = {};

  // ---------- the settings ----------
  F.source = null;   // (the Manager's Display settings: the settings on its screen, for its examples)
  F.house = () => {
    const h = window.PanelStore && PanelStore.get ? PanelStore.get("house") : null;
    const d = F.source ? F.source() || {} : isObj(h) && isObj(h.display) ? h.display : {};
    return { ...DEF, ...d };
  };
  F.units = () => {
    const h = F.house(), own = (window.Settings && Settings.v && Settings.v.units) || {};
    return { temp: own.temp === "C" || own.temp === "F" ? own.temp : h.temp === "C" ? "C" : "F",
             wind: PER_MPH[own.wind] ? own.wind : WIND[h.dist] || "mph" };
  };
  F.speedUnit = speedUnit;
  // (v3.0.4) the hub's own unit: Display settings "Your hub reports temperatures in" (none saved: the house's)
  F.hub = () => { const h = F.house(); return (h.hubT === "C" || h.hubT === "F" ? h.hubT : h.temp) === "C" ? "C" : "F"; };
  F.weekStart = () => (F.house().week === 1 ? 1 : 0);
  // "m/d/yyyy 12" → {d: "m/d/yyyy", h: 12}; "auto" → {auto: true}
  F.format = () => { const m = /^([dmy/]+) (12|24)$/.exec(String(F.house().dt)); return m ? { d: m[1], h: +m[2] } : { auto: true }; };

  // ---------- numbers ----------
  const num = (v) => (v == null || v === "" || !Number.isFinite(+v) ? null : +v);
  F.round = (v, n = 0) => { v = num(v); return v == null ? null : +v.toFixed(n); };
  const show = (v, n) => (window.T && T.number ? T.number(v, { minimumFractionDigits: n, maximumFractionDigits: n, useGrouping: false }) : v.toFixed(n));
  F.temp = (v, from = "F") => {
    v = num(v); if (v == null) return null;
    const to = F.units().temp, f = from === "C" ? "C" : "F";
    return F.round(f === to ? v : to === "C" ? (v - 32) * 5 / 9 : v * 9 / 5 + 32, F.house().dT);
  };
  F.hubTemp = (v) => F.temp(v, F.hub());
  F.hubRange = () => (F.hub() === "C" ? { lo: 10, hi: 32, gap: 1 } : { lo: 50, hi: 90, gap: 2 });
  F.speed = (v, from = "mph") => { v = num(v); return v == null ? null : F.round(v / PER_MPH[speedUnit(from)] * PER_MPH[F.units().wind], F.house().dT); };
  F.tempText = (v, from, unit = true) => { const t = F.temp(v, from); return t == null ? "—" : `${show(t, F.house().dT)}°${unit ? F.units().temp : ""}`; };
  F.speedText = (v, from) => { const s = F.speed(v, from); return s == null ? "—" : `${show(s, F.house().dT)} ${F.units().wind}`; };
  // (distances follow the house's unit; a panel's own wind unit is for wind only)
  F.dist = (mi) => {
    const v = num(mi); if (v == null) return "—";
    const [k, u, n] = { mi: [1, "mi", 1], km: [1.609344, "km", 1], kn: [0.868976, "nmi", 1], m: [1609.344, "m", 0] }[F.house().dist] || [1, "mi", 1];
    return `${show(v * k, n)} ${u}`;
  };
  F.pressure = (v, from = "inHg") => {
    v = num(v); if (v == null) return "—";
    const h = F.house(), inHg = from === "hPa" ? v / 33.8639 : v;
    return h.pres === "hPa" ? `${show(inHg * 33.8639, h.dPr)} hPa` : `${show(inHg, h.dPr)} inHg`;
  };
  F.rain = (v, from = "in") => { v = num(v); if (v == null) return "—"; const h = F.house(), inch = from === "mm" ? v / 25.4 : v;
    return h.prec === "mm" ? `${show(inch * 25.4, h.dP)} mm` : `${show(inch, h.dP)} in`; };
  F.snow = (v, from = "in") => { v = num(v); if (v == null) return "—"; const h = F.house(), inch = from === "cm" ? v / 2.54 : v;
    return h.prec === "mm" ? `${show(inch * 2.54, h.dP)} cm` : `${show(inch, h.dP)} in`; };

  // ---------- dates and times ----------
  const loc = () => (window.T && T.locale ? T.locale() : undefined);
  const intl = (o) => { try { return new Intl.DateTimeFormat(loc(), o); } catch { return new Intl.DateTimeFormat("en", o); } };
  const fmt = (d, o) => intl(o).format(d);
  const parts = (d, o) => intl(o).formatToParts(d);
  const pick = (p, k) => p.filter((x) => x.type === k).map((x) => x.value).join("");
  const pad = (n) => String(n).padStart(2, "0");
  // the time's Intl options: "auto" the language's own; else 12 hours ("4:13 PM") or 24 ("16:13", "09:05")
  const timeOpts = () => { const f = F.format(); return f.auto ? { hour: "numeric", minute: "2-digit" } : { hour: f.h === 24 ? "2-digit" : "numeric", minute: "2-digit", hourCycle: f.h === 24 ? "h23" : "h12" }; };
  F.time = (d = new Date()) => fmt(d, timeOpts());
  F.timeParts = (d = new Date()) => { const p = parts(d, timeOpts()); return { h: pick(p, "hour"), m: pick(p, "minute"), ap: pick(p, "dayPeriod") }; };
  F.clock = (d = new Date()) => { const p = parts(d, timeOpts());
    return { time: p.filter((x) => x.type !== "dayPeriod").map((x) => x.value).join("").trim(), ampm: pick(p, "dayPeriod") }; };
  F.hour = (h) => { const d = new Date(2000, 0, 1, h, 0, 0); return F.clock(d).ampm ? fmt(d, { ...timeOpts(), minute: undefined }) : fmt(d, { ...timeOpts(), hour: "2-digit", minute: "2-digit" }); };
  // the numbers only: the chosen order ("11/5/2026", "05/11/2026", "2026/11/05"), or the language's own
  F.date = (d = new Date()) => {
    const f = F.format();
    if (f.auto) return fmt(d, { year: "numeric", month: "numeric", day: "numeric" });
    const v = { m: d.getMonth() + 1, mm: pad(d.getMonth() + 1), d: d.getDate(), dd: pad(d.getDate()), yyyy: d.getFullYear() };
    return f.d.split("/").map((t) => v[t]).join("/");
  };
  // written out ("Wednesday, November 5"): the day before the month when the chosen format starts with the day
  // ("Wednesday, 5 November"); the words are the language's. A numeric month: the numbers (Fmt.date).
  F.longDate = (d = new Date(), opts = { weekday: "long", month: "long", day: "numeric" }) => {
    const f = F.format();
    if (f.auto) return fmt(d, opts);
    if (opts.month === "numeric" || opts.month === "2-digit") return F.date(d);
    const p = parts(d, { weekday: opts.weekday, month: opts.month, day: opts.day, year: opts.year });
    const wd = pick(p, "weekday"), mo = pick(p, "month"), dy = pick(p, "day"), yr = pick(p, "year"), dFirst = f.d[0] === "d";
    const md = [dFirst ? dy : mo, dFirst ? mo : dy].filter(Boolean).join(" ");
    return [wd, md].filter(Boolean).join(", ") + (yr ? (dFirst ? " " : ", ") + yr : "");
  };
  F.dayShort = (d) => F.longDate(d, { month: "short", day: "numeric" });
  F.dateTime = (d) => (F.format().auto ? fmt(d, { month: "short", day: "numeric", ...timeOpts() }) : `${F.date(d)} ${F.time(d)}`);

  // strings.js's date and time words follow the format (callers everywhere: no change needed there)
  if (window.T) Object.assign(window.T, { time: F.time, clock: F.clock, clockParts: F.timeParts, hour: F.hour, dateTime: F.dateTime, dayShort: F.dayShort,
    date: (d = new Date(), opts) => F.longDate(d, opts || undefined) });
  // the house's settings changed (Manager → Display settings): the page drawn again in them
  if (window.PanelStore && PanelStore.onChange) PanelStore.onChange((keys) => {
    if (!keys.includes("house")) return;
    if (window.Weather && Weather.unitsCheck) Weather.unitsCheck();
    if (window.UI && UI.calRealign) UI.calRealign();
    if (window.App && App.render) App.render();
  });
  window.Fmt = F;
})();
