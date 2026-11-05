// Live weather from Open-Meteo (free, no key, works from the panel's browser).
// The places added on the panel (+ on the weather card; none until then — v2.2.0: no built-in places), kept in the
// panel's store. A grid weather card has its own places (the builder).
// Weather.onChange(fn) -> fn(Weather) whenever data or the selected location changes.
// (v3.0.0) A Hubitat weather device set up in the Manager (Integrations → Weather): its weather — the bridge's retained
// hubitat/weather — is the HOUSE's own place's while it's active and fresh (v3.0.3: the house tab named after the
// device's place, or a place with that name — never Tokyo just because it's a card's first place); the other places
// stay on Open-Meteo, and Open-Meteo is the house's again when the device is off or its data is stale. Weather.get(id) / current() hand out
// whichever is shown, with .source "hubitat" | "open-meteo" | "owm"; numbers in the panel's units (Weather.units()).
// (v3.0.4) Each weather card picks its source (o.src; a built-in layout: the panel setting weather.src): "auto" (or
// none) | "om" | "hub" | "owm" — Weather.get(id, src), forCard(key, list, src), current(src). OpenWeatherMap (the
// house's own key) and a day's hours come from the server (/api/weather/forecast, /api/weather/hours —
// service/weather_sources.py: one fetch for the house, every panel shares it); Open-Meteo's 16 days stay the panel's own.
(function () {
  const FIXED = [];
  const MAX_CUSTOM = 3;
  const REFRESH_MS = 15 * 60 * 1000;
  const STORE = "panel.weather.custom";

  // WMO weather code -> icon kind + text + effect (used by the weather lab)
  const WMO = {
    0: ["clear", "Clear"], 1: ["mostly-clear", "Mostly clear"], 2: ["partly", "Partly cloudy"], 3: ["cloudy", "Overcast"],
    45: ["fog", "Fog"], 48: ["fog", "Freezing fog"],
    51: ["drizzle", "Light drizzle"], 53: ["drizzle", "Drizzle"], 55: ["drizzle", "Heavy drizzle"],
    56: ["sleet", "Freezing drizzle"], 57: ["sleet", "Freezing drizzle"],
    61: ["rain", "Light rain"], 63: ["rain", "Rain"], 65: ["heavy-rain", "Heavy rain"],
    66: ["sleet", "Freezing rain"], 67: ["sleet", "Freezing rain"],
    71: ["snow", "Light snow"], 73: ["snow", "Snow"], 75: ["heavy-snow", "Heavy snow"], 77: ["snow", "Snow grains"],
    80: ["rain", "Rain showers"], 81: ["rain", "Rain showers"], 82: ["heavy-rain", "Violent showers"],
    85: ["snow", "Snow showers"], 86: ["heavy-snow", "Snow showers"],
    95: ["thunder", "Thunderstorm"], 96: ["thunder", "Thunder & hail"], 99: ["thunder", "Thunder & hail"],
  };
  const describe = (code) => (WMO[code] ? [WMO[code][0], T(`wx.code.${code}`)] : ["cloudy", "—"]);   // (the words: strings/en.js "wx.code.N")

  // added places live in the panel's store on the dashboard service (store.js); STORE = the old browser key
  const loadCustom = () => { const v = window.PanelStore ? PanelStore.get("weatherCustom") : null; return Array.isArray(v) ? v.slice(0, MAX_CUSTOM) : []; };
  const saveCustom = (list) => { if (window.PanelStore) PanelStore.set("weatherCustom", list); };

  const W = {
    locations: [...FIXED, ...loadCustom()],
    selected: null,
    data: {},          // id -> { now, days[], sunrise, sunset, updated, units } (Weather.errorOf(id): why a place has none)
    describe,
    hub: null,         // the Hubitat weather device's message (hubitat/weather), as it came
  };
  // the panel's units {temp: "F"|"C", wind: "mph"|"km/h"|"kn"|"m/s"} — (v3.0.4) the house's (Manager → Display
  // settings) unless the panel has its own (fmt.js); numbers with the house's decimals for temperature and wind
  // (without fmt.js — a page that doesn't load it: the panel's own units, else °F and mph, whole numbers, as before)
  const FX = () => window.Fmt || null;
  W.units = () => { if (FX()) return Fmt.units(); const u = (window.Settings && Settings.v && Settings.v.units) || {}; return { temp: u.temp === "C" ? "C" : "F", wind: u.wind === "km/h" ? "km/h" : "mph" }; };
  const toT = (v, from) => { if (FX()) return Fmt.temp(v, from); if (v == null || !Number.isFinite(+v)) return null; const to = W.units().temp; v = +v; return Math.round(from === to ? v : to === "C" ? (v - 32) * 5 / 9 : v * 9 / 5 + 32); };
  const toW = (v, from) => { if (FX()) return Fmt.speed(v, from); if (v == null || !Number.isFinite(+v)) return null; const to = W.units().wind; v = +v; return Math.round(from === to ? v : to === "km/h" ? v * 1.609344 : v / 1.609344); };

  const unitsKey = () => { const u = W.units(); return `${u.temp}|${u.wind}|${FX() ? Fmt.house().dT : 0}`; };

  // ---------- the days of a forecast ----------
  // (v3.0.3) from today on (by default the local date — "Today" moves on at midnight even when nothing new arrives), one
  // per date (the first one given wins: the device's own over Open-Meteo's), in order, labelled again. today: the date
  // ("YYYY-MM-DD") the days start from — an Open-Meteo place's own (its days are dated in its time zone: New York keeps
  // its Today while it's already tomorrow on a panel in Amsterdam); "" keeps every day given
  const ymd = (t) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const localDay = () => ymd(new Date());
  const dayKey = (d) => (typeof d.ymd === "string" ? d.ymd : ymd(new Date(d.date)));
  const fromToday = (list, today = localDay()) => {
    const had = new Set();
    return (list || []).filter((d) => {
      if (!d || !Number.isFinite(+new Date(d.date))) return false;
      const k = dayKey(d);
      if (k < today || had.has(k)) return false;
      had.add(k); return true;
    }).sort((a, b) => (dayKey(a) < dayKey(b) ? -1 : dayKey(a) > dayKey(b) ? 1 : 0))
      .map((d, i) => ({ ...d, day: i === 0 ? T("wx.today") : T.weekday(new Date(d.date)) }));
  };
  // an Open-Meteo place's own date now: from its UTC offset (it moves on with the clock), else the date its last
  // forecast was made on, else the panel's
  const placeDay = (d) => (Number.isFinite(d.utcOffset) ? new Date(Date.now() + d.utcOffset * 1000).toISOString().slice(0, 10)
    : typeof d.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.today) ? d.today : localDay());

  // ---------- the places ----------
  // A weather card's own places (builder → the card → Places): each card has its own list and its own selected tab
  // (cardSel: card key → place id); the panel's list stays as it is (no swapping while the page draws — two cards with
  // different places once fought over one global list and redrew forever). Weather data is kept per place id, so a
  // place on two cards is fetched once.
  const cardSel = new Map(), seen = new Map(), asked = new Map();   // seen: place id → place (refreshed with the rest)
  // (v3.0.3) a card's place counts (fetched, and in the System card's status) while something still asks for it: one
  // taken off its card — or a card removed — drops out once nothing has asked for it in SEEN_MS (longer than the
  // refresh, whose redraw asks again for every place still shown)
  const SEEN_MS = REFRESH_MS + 5 * 60 * 1000, seenAt = new Map();
  const liveSeen = () => {
    const now = Date.now();
    for (const [id, at] of seenAt) if (now - at > SEEN_MS) { seenAt.delete(id); seen.delete(id); }
    return [...seen.values()];
  };
  const errs = new Map();   // place id → what its card says when it couldn't be fetched (v3.0.3: per place)
  const placeById = (id) => W.locations.find((l) => l.id === id) || seen.get(id) || null;

  // ---------- the Hubitat weather device (the house's own place) ----------
  W.hubActive = () => {
    const h = W.hub;
    return !!(h && h.active === true && h.replaces === "home" && Number.isFinite(+h.updatedAt) && Date.now() / 1000 - +h.updatedAt < (+h.staleAfter || 7200));
  };
  // stale (it stopped reporting): its last values still beat an empty card while Open-Meteo has nothing for the house
  W.hubStale = () => { const h = W.hub; return !!(h && h.current && Number.isFinite(+h.updatedAt) && !W.hubActive() && (h.reason === "stale" || h.active === true)); };
  const hubShown = () => W.hubActive() || W.hubStale();
  const HUB_ID = "hub";   // (the house's own tab, named after the device's place, when no place on the panel is the house's)
  // (v3.0.3) The device's weather is the HOUSE's: only the house tab, or a place (the panel's or a card's) with the
  // device's place name ("Springfield"), shows it. Any other place — Tokyo, Paris — always shows its own Open-Meteo
  // weather, first place of a card or not; the device's gaps are filled only from Open-Meteo for the same place.
  // (v3.0.4) …and a card's first place (the builder's 🏠) under another name when it really is the house: within
  // HOUSE_KM of the house's own coordinates (the device's lat/lon, when it reports them), else — none known — when it is
  // the panel's home place (W.homeOf, app.js: the home screen's first weather card's 🏠). "Home" in New York and the
  // device's "Springfield" are one house; a card for Grandma's town far away keeps that town's own weather
  const norm = (s) => String(s || "").split(",")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const HOUSE_KM = 30;
  const km = (a, b) => { const r = Math.PI / 180, s = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(s)); };
  const firstIds = new Set();   // (each card's first place, as forCard sees them)
  W.isHouse = (id) => {
    if (!id) return false;
    if (id === HUB_ID) return true;
    const hb = W.hub, h = hb && norm(hb.place), p = placeById(id);
    if (h && p && norm(p.name) === h) return true;
    if (!p || !firstIds.has(id)) return false;
    if (hb && Number.isFinite(hb.lat) && Number.isFinite(hb.lon)) return km(hb, p) <= HOUSE_KM;
    return typeof W.homeOf === "function" && W.homeOf() === id;
  };
  // the Open-Meteo place standing in for the device's gaps on the house tab: a place of the house's own, when one is loaded
  // (v3.0.4: the place named like the device's first, then a card's home place)
  const houseOmId = () => { const all = [...W.locations, ...liveSeen()].filter((l) => W.data[l.id]), h = W.hub && norm(W.hub.place);
    const l = (h && all.find((x) => norm(x.name) === h)) || all.find((x) => W.isHouse(x.id)); return l ? l.id : null; };
  const hhmmToday = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); if (!m) return null; const d = new Date(); d.setHours(+m[1], +m[2], 0, 0); return d; };

  // a place's Open-Meteo weather in the panel's units (v3.0.3: data fetched in other units is converted until the
  // refetch in the new ones arrives — °C never shows as °F), days from today on. (v3.0.4: the server's OpenWeatherMap
  // weather the same way — it comes in °C and km/h with decimals: rounded here)
  const round = (v) => (FX() ? Fmt.round(v, Fmt.house().dT) : v == null || !Number.isFinite(+v) ? null : Math.round(+v));
  function inUnits(d, source) {
    if (!d) return null;
    const u = W.units(), du = d.units || u, cT = du.temp !== u.temp, cW = du.wind !== u.wind;
    const t = (v) => (cT ? toT(v, du.temp) : round(v)), w = (v) => (cW ? toW(v, du.wind) : round(v));
    const days = fromToday((d.days || []).map((x) => ({ ...x, high: t(x.high), low: t(x.low) })), placeDay(d));   // (the place's own Today)
    const first = days[0] || {};
    return { ...d, source, now: { ...d.now, temp: t(d.now.temp), feels: t(d.now.feels), wind: w(d.now.wind), gusts: w(d.now.gusts) }, days,
             sunrise: first.sunrise || d.sunrise, sunset: first.sunset || d.sunset, ...(source === "owm" ? { mixed: days.some((x) => x.om) } : {}) };
  }
  const omData = (id) => inUnits(id ? W.data[id] : null, "open-meteo");

  const memo = new Map();   // Open-Meteo place id ("" for none) → {key, val}
  // the device's weather; omId: the same place's Open-Meteo data for its gaps (or none)
  function hubData(omId) {
    const h = W.hub, u = (h && h.units) || {}, ut = u.temp === "C" ? "C" : "F", uw = FX() ? Fmt.speedUnit(u.wind) : u.wind === "km/h" || u.wind === "kmh" ? "km/h" : "mph";
    const om = omData(omId);
    // (the place the fill-in came from and the local date are in the key: two places never share one memo, and
    // "Today" moves on at midnight)
    const key = `${h.updatedAt}|${unitsKey()}|${T.lang()}|${localDay()}|${om && om.updated ? +om.updated : 0}|${om && om.days[0] ? dayKey(om.days[0]) : ""}`;
    const m = memo.get(om ? omId : "");
    if (m && m.key === key) return m.val;
    const c = h.current || {};
    const word = (wmo, text) => (W.describe(wmo)[1] !== "—" ? W.describe(wmo)[1] : String(text || "—"));
    const own = (Array.isArray(h.forecast) ? h.forecast : []).slice(0, 7).map((f, i) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(f.date || "") ? new Date(`${f.date}T12:00`) : new Date(Date.now() + i * 864e5);
      return { date, ymd: /^\d{4}-\d{2}-\d{2}$/.test(f.date || "") ? f.date : undefined, kind: describe(+f.wmo)[0], text: word(+f.wmo),
               high: toT(f.high, ut), low: toT(f.low, ut), rain: f.rainPct != null && Number.isFinite(+f.rainPct) ? Math.round(+f.rainPct) : null };
    }).filter((d) => d.high != null || d.low != null);
    // (v3.0.2: a driver that sends one day or none — e.g. OpenWeatherMap's free tier — no longer leaves the card with
    // only "today": the days it doesn't send come from Open-Meteo for the same place; the device's own days win. v3.0.3:
    // days before today dropped, one per date — a stale forecast still starting yesterday showed two "Today"s)
    // (the device's days from the panel's today; Open-Meteo's already start from the place's own)
    const days = fromToday(fromToday(own).concat(om ? om.days.map((d) => ({ ...d, om: true })) : []), "");
    const on = (om && om.now) || {};
    const feels = toT(c.feelsLike, ut), hum = c.humidity != null && Number.isFinite(+c.humidity) ? Math.round(+c.humidity) : null, wind = toW(c.wind, uw);
    const val = {
      source: "hubitat",
      // (some of it from Open-Meteo: the card says so — "From your Hubitat weather and Open-Meteo")
      mixed: days.some((d) => d.om) || (feels == null && on.feels != null) || (hum == null && on.humidity != null) || (wind == null && on.wind != null),
      now: { temp: toT(c.temp, ut), feels: feels ?? on.feels ?? null, humidity: hum ?? on.humidity ?? null,
             wind: wind ?? on.wind ?? null, gusts: on.gusts ?? null, code: Number.isFinite(+c.wmo) ? +c.wmo : 3, kind: describe(+c.wmo)[0], text: word(+c.wmo, c.text), isDay: c.isDay !== false },
      days,
      // (no times from the device: Open-Meteo's for the same place, else a plain day)
      sunrise: hhmmToday(h.sunrise) || (om && om.sunrise) || null, sunset: hhmmToday(h.sunset) || (om && om.sunset) || null,
      updated: new Date(+h.updatedAt * 1000), device: h.device || null,
    };
    memo.set(om ? omId : "", { key, val });
    return val;
  }
  // what a place shows from the device: its weather for the house's own place (while active and fresh), else its own
  // Open-Meteo weather — never another place's
  const hubGet = (id) => {
    const house = W.isHouse(id), omId = id === HUB_ID ? houseOmId() : id;
    if (house && W.hubActive()) return hubData(omId);
    const d = omData(omId);
    if (d) return house && !W.hubStale() ? { ...d, why: "hubOff" } : d;   // (v3.0.4: the card says the device isn't reporting)
    return house && W.hubStale() ? { ...hubData(omId), stale: true } : null;   // (never a blank card when the device has values)
  };
  // (v3.0.4) what a card with source src shows (weather_sources.resolve, plus the device's freshness): "hub" as before
  // 3.0.4; "om" only Open-Meteo; "owm" the server's OpenWeatherMap weather (its days 9+ from Open-Meteo), Open-Meteo
  // while there's none (no key, the day's calls used up); "auto" — and no source — the device for the house's own place
  // while the house switch is on (as stored: hub.card), else OpenWeatherMap when there's a key, else Open-Meteo
  const SRCS = ["auto", "om", "hub", "owm"];
  W.srcOf = (src) => (SRCS.includes(src) ? src : (window.Settings && Settings.v && Settings.v.weather && SRCS.includes(Settings.v.weather.src) ? Settings.v.weather.src : "auto"));
  W.get = (id, src) => {
    if (!id) return null;
    const s = SRCS.includes(src) ? src : "auto", omId = id === HUB_ID ? houseOmId() : id;
    // (v3.0.4) "Hubitat device" on a place that isn't the home one: its own Open-Meteo weather, and the card says why
    if (s === "hub" && !W.isHouse(id)) { const d = omData(omId); return d ? { ...d, why: "hubHome" } : null; }
    if (s === "hub") return hubGet(id);
    const hubOk = s === "auto" && !(W.hub && W.hub.card === false) && W.isHouse(id);
    if (hubOk && W.hubActive()) return hubData(omId);
    if (s !== "om") { const o = owmData(omId); if (o) return o; }
    const d = omData(omId);
    if (d) return d;
    return hubOk && W.hubStale() ? { ...hubData(omId), stale: true } : null;
  };
  // the panel's tabs: its places — and the house's own tab first, from the device, while none of them is the house's
  // (v3.0.3: adding a place on a panel showing only the device's weather keeps that tab and adds the new one beside it)
  // (v3.0.4: only while the panel's own weather — weather.src — shows the device: "hub", or Automatic with the switch on)
  const hubForPanel = () => { const s = W.srcOf(); return s === "hub" || (s === "auto" && !(W.hub && W.hub.card === false)); };
  W.tabs = () => (hubShown() && hubForPanel() && !W.locations.some((l) => W.isHouse(l.id))
    ? [{ id: HUB_ID, name: (W.hub && W.hub.place) || T("wx.home"), hub: true }, ...W.locations] : W.locations);
  // the tab shown: the one picked, while it's still there; else the first
  W.shownId = () => { const t = W.tabs(); return t.some((x) => x.id === W.selected) ? W.selected : t.length ? t[0].id : null; };
  // the warnings (hubitat/weather "warnings": {id, lvl, title, to}) — (v3.0.4) per place, the sources kept apart:
  // Weather.warnings() the house's (the panels' alerts): the device's, and OpenWeatherMap's for the house's own places;
  // warnings(id, source) a card's place: the device's when it's the home place, plus that place's OpenWeatherMap ones
  // while the card shows OpenWeatherMap (source "owm") — Tokyo's storm stays on Tokyo's card; warnings("*") all
  W.warnings = (id, source) => {
    const ok = (x) => x && typeof x.id === "string" && Number.isInteger(x.lvl), had = new Set();
    const hub = W.hub && Array.isArray(W.hub.warnings) ? W.hub.warnings : [];
    const of = (pid) => (W.owm[pid] && Array.isArray(W.owm[pid].warnings) ? W.owm[pid].warnings : []);
    const owm = id === "*" ? Object.keys(W.owm) : !id ? Object.keys(W.owm).filter((pid) => W.isHouse(pid)) : source === "owm" ? [id] : [];
    return [...(id === "*" || !id || W.isHouse(id) ? hub : []), ...owm.flatMap(of)].filter((x) => ok(x) && !had.has(x.id) && had.add(x.id));
  };
  // why a place has nothing to show (plain words; the details are in the console), else null — loading
  W.errorOf = (id) => (id && errs.get(id)) || null;
  // the weather for the System card: some place has data (a panel's or a card's), and the error when none has
  W.status = () => {
    const ids = [...new Set([...W.locations, ...liveSeen()].map((l) => l.id))];
    const ok = W.hubActive() || ids.some((id) => W.data[id]);
    return { ok, places: ids.length + (hubShown() ? 1 : 0), failing: ids.filter((id) => errs.has(id)).length, error: ok ? null : ids.map((id) => errs.get(id)).find(Boolean) || null };
  };

  let picked = false;   // (a tab picked on this screen: the device's arrival doesn't move it)
  const okHub = (m) => m && typeof m === "object" && m.v === 1 && m.source === "hubitat";
  if (window.Home && Home.subscribe) Home.subscribe("hubitat/weather", (msg) => {
    let m; try { m = JSON.parse(msg); } catch { return; }
    if (!okHub(m)) return;
    W.hub = m; memo.clear();
    if (!picked) { const t = W.tabs(); if (t.length && t[0].hub) W.selected = HUB_ID; }
    changed();
  });
  // (fresh → stale happens without a message, and a new day starts without one: looked at every minute)
  let wasActive = false, lastDay = localDay();
  setInterval(() => {
    const a = W.hubActive(), day = localDay();
    if (a !== wasActive || day !== lastDay) {
      const newDay = day !== lastDay;
      wasActive = a; lastDay = day; memo.clear();
      if (newDay) { W.refresh(); dropOldHours(); }   // (the new day's forecast)
      changed();
    }
    W.unitsCheck();
  }, 60000);
  const listeners = [];
  const changed = () => listeners.forEach((fn) => fn(W));
  if (W.locations.length) W.selected = W.locations[0].id;

  W.onChange = (fn) => { listeners.push(fn); fn(W); };
  W.current = (src) => W.get(W.shownId(), W.srcOf(src));
  W.location = () => W.locations.find((l) => l.id === W.selected);
  W.select = (id) => { W.selected = id; picked = true; changed(); const l = W.location(); if (l && !W.data[id]) fetchOne(l); };
  W.isCustom = (id) => id !== HUB_ID && !FIXED.some((f) => f.id === id);   // (the house's own tab has no ×)
  W.canAdd = () => W.locations.length < FIXED.length + MAX_CUSTOM;

  W.add = (place) => {
    if (!W.canAdd()) return;
    const loc = { id: `c${Date.now()}`, name: place.name, lat: place.latitude, lon: place.longitude, region: place.admin1 };
    W.locations.push(loc);
    saveCustom(W.locations.filter((l) => W.isCustom(l.id)));
    W.select(loc.id);
  };
  W.remove = (id) => {
    W.locations = W.locations.filter((l) => l.id !== id);
    saveCustom(W.locations.filter((l) => W.isCustom(l.id)));
    if (W.selected === id) W.selected = null;   // (W.shownId: the first tab)
    changed();
  };
  W.search = async (q) => {
    // (place names in the panel's language: its base code — "de" from "de-AT" — English without strings.js)
    const geoLang = () => { const l = window.T && T.lang ? String(T.lang()).split("-")[0].toLowerCase() : "en"; return /^[a-z]{2,3}$/.test(l) ? l : "en"; };
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${encodeURIComponent(geoLang())}&format=json`);
    return ((await r.json()).results || []).map((p) => ({ ...p, label: [p.name, p.admin1, p.country_code].filter(Boolean).join(", ") }));
  };

  // (v3.0.3) 7 days — v3.0.4: 16 (the 14-day view; Open-Meteo's most) —, given up after 15 s (never "Loading…"
  // forever); a failure says so in plain words on that place's card — the details go to the console only
  const FETCH_TIMEOUT_MS = 15000;
  async function fetchOne(loc) {
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return;
    const units = W.units();
    const url = "https://api.open-meteo.com/v1/forecast"
      + `?latitude=${loc.lat}&longitude=${loc.lon}`
      + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,is_day"
      + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset"
      + `&temperature_unit=${units.temp === "C" ? "celsius" : "fahrenheit"}&wind_speed_unit=${{ "km/h": "kmh", "m/s": "ms", kn: "kn" }[units.wind] || "mph"}&timezone=auto&forecast_days=16`;
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS) : null;
    try {
      const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const c = j && j.current, d = j && j.daily;
      if (!c || !d || !Array.isArray(d.time)) throw new Error("not a forecast");
      const [kind, text] = describe(c.weather_code);
      const num = (v) => (v == null || !Number.isFinite(+v) ? null : Math.round(+v));
      const at = (a, i) => (Array.isArray(a) ? a[i] : null);
      const when = (s) => (s ? new Date(s) : null);
      W.data[loc.id] = {
        now: { temp: num(c.temperature_2m), feels: num(c.apparent_temperature), humidity: num(c.relative_humidity_2m),
               wind: num(c.wind_speed_10m), gusts: num(c.wind_gusts_10m), code: c.weather_code, kind, text, isDay: !!c.is_day },
        days: d.time.map((t, i) => {
          const [k, tx] = describe(at(d.weather_code, i));
          return { date: new Date(t + "T12:00"), ymd: String(t).slice(0, 10), kind: k, text: tx, high: num(at(d.temperature_2m_max, i)), low: num(at(d.temperature_2m_min, i)),
                   rain: num(at(d.precipitation_probability_max, i)), sunrise: when(at(d.sunrise, i)), sunset: when(at(d.sunset, i)) };
        }),
        sunrise: when(at(d.sunrise, 0)), sunset: when(at(d.sunset, 0)), updated: new Date(), units,
        // (the place's own date — timezone=auto dates its days in its time zone: placeDay)
        utcOffset: typeof j.utc_offset_seconds === "number" && Number.isFinite(j.utc_offset_seconds) ? j.utc_offset_seconds : null,
        today: typeof c.time === "string" ? c.time.slice(0, 10) : null,
      };
      errs.delete(loc.id);
    } catch (e) {
      try { console.warn(`[weather] ${loc.name || loc.id}: ${(e && e.name === "AbortError") ? "timed out" : (e && e.message) || e}`); } catch {}
      errs.set(loc.id, T("wx.unavailableNow"));
    } finally {
      if (timer != null && typeof clearTimeout === "function") clearTimeout(timer);
    }
    changed();
  }

  W.placesOf = (list) => (Array.isArray(list) ? list : []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)).slice(0, 6)
    .map((p) => ({ id: `p${p.lat}_${p.lon}`.replace(/[^\w-]/g, "_"), name: String(p.name || T("wx.place")), lat: p.lat, lon: p.lon, region: p.region }));
  // fetch the places not fetched yet — or not for a refresh's time: one that dropped out of seen comes back (each at most
  // once every 5 minutes: a failed one doesn't loop the drawing)
  W.need = (places) => places.forEach((l) => {
    if (!l || !Number.isFinite(l.lat) || !Number.isFinite(l.lon)) return;   // (the house tab has no coordinates: nothing to fetch)
    seen.set(l.id, l); seenAt.set(l.id, Date.now());
    const d = W.data[l.id];
    if ((d && !(Date.now() - +d.updated > REFRESH_MS)) || Date.now() - (asked.get(l.id) || 0) < 5 * 60 * 1000) return;
    asked.set(l.id, Date.now());
    setTimeout(() => fetchOne(l), 0);   // (not while the page is drawing)
  });
  // a card's places and its selected one: {places, sel, data, error} (its own place's weather only — v3.0.3: never
  // another place's while its own is loading or failed)
  // (v3.0.4: src — the card's source; data.source says what it shows now)
  W.forCard = (key, list, src) => {
    const places = W.placesOf(list), s = SRCS.includes(src) ? src : "auto";
    if (places[0]) firstIds.add(places[0].id);   // (the card's 🏠: the house's own when it is the house — W.isHouse)
    W.need(places);
    if (s === "owm" || s === "auto") places.forEach(owmNeed);
    let sel = cardSel.get(key);
    if (!places.some((l) => l.id === sel)) sel = places.length ? places[0].id : null;
    return { places, sel, src: s, data: sel ? W.get(sel, s) : null, error: W.errorOf(sel) };
  };
  W.cardSelect = (key, id) => { cardSel.set(key, id); changed(); };

  // ---------- (v3.0.4) from the server: OpenWeatherMap, a day's hours ----------
  // OpenWeatherMap: asked for a place at most every refresh (the server fetches once for every panel — its own budget);
  // an answer without it (no key, "budget", "places") keeps the place on Open-Meteo: asked again after the refresh time
  W.owm = {};   // place id → the server's answer as the panel keeps it (°C, km/h — inUnits converts)
  W.owmKey = null;   // (true: the house has a key; false: the last answer said none)
  const owmAsked = new Map();
  const serverDay = (x) => { const [kind, text] = describe(x.wmo); return { date: new Date(`${x.ymd}T12:00`), ymd: x.ymd, kind, text, high: x.high, low: x.low,
    rain: round(x.rainPct), sunrise: x.sunrise ? new Date(x.sunrise * 1000) : null, sunset: x.sunset ? new Date(x.sunset * 1000) : null, om: x.from === "om" }; };
  async function owmFetch(loc) {
    try {
      // (home=1: the house's own place — only its warnings join the panels' alerts, weather_sources.alerts_doc)
      const r = await fetch(`/api/weather/forecast?lat=${encodeURIComponent(loc.lat)}&lon=${encodeURIComponent(loc.lon)}&src=owm${W.isHouse(loc.id) ? "&home=1" : ""}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (!j || !j.ok) throw new Error(`HTTP ${r.status}`);
      if (j.source !== "owm") { if (j.fallback === "no-key") W.owmKey = false; delete W.owm[loc.id]; changed(); return; }
      W.owmKey = true;
      const n = j.now || {}, [kind, text] = describe(n.wmo);
      const days = (j.days || []).map(serverDay), first = days[0] || {};
      W.owm[loc.id] = { now: { temp: n.temp, feels: n.feels, humidity: round(n.humidity), wind: n.wind, gusts: n.gusts, code: n.wmo, kind, text, isDay: n.isDay !== false },
        days, sunrise: first.sunrise || null, sunset: first.sunset || null, updated: new Date((j.updatedAt || Date.now() / 1000) * 1000), units: j.units || { temp: "C", wind: "km/h" },
        utcOffset: Number.isFinite(j.utcOffset) ? j.utcOffset : null, today: j.today || null, hoursTo: j.hoursTo || null, warnings: Array.isArray(j.warnings) ? j.warnings : [] };
    } catch (e) {
      try { console.warn(`[weather] OpenWeatherMap for ${loc.name || loc.id}: ${(e && e.message) || e}`); } catch {}
    }
    changed();
  }
  const owmNeed = (l) => {
    if (!l || !Number.isFinite(l.lat) || !Number.isFinite(l.lon)) return;
    if (W.owmKey === false && Date.now() - (owmAsked.get("") || 0) < REFRESH_MS) return;   // (no key: one ask a refresh)
    if (Date.now() - (owmAsked.get(l.id) || 0) < REFRESH_MS) return;
    owmAsked.set(l.id, Date.now()); owmAsked.set("", Date.now());
    setTimeout(() => owmFetch(l), 0);   // (not while the page is drawing)
  };
  const owmData = (id) => (id && W.owm[id] ? inUnits(W.owm[id], "owm") : null);

  // A day's hours, fetched only when asked for (a day tapped) and kept until that day is over — the place's
  // OpenWeatherMap hours (its 48) when the card shows OpenWeatherMap, Open-Meteo's for the rest.
  // Weather.hoursOf(id, ymd, src) → null (being fetched: Weather.onChange tells when they're here) | {hours: [{at, temp,
  // kind, text, rain, wind, isDay, om}], source, error?} in the panel's units
  const hrs = new Map();   // `${place id}|${ymd}|${"owm"|"om"}` → {at, hours, source} | {asking: true} | {error, at}
  W.hoursOf = (id, ymd, src) => {
    const l = placeById(id === HUB_ID ? houseOmId() : id), shown = W.get(id, src);
    if (!l || !/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""))) return { hours: [], source: "open-meteo", error: T("wx.unavailableNow") };
    const s = shown && shown.source === "owm" ? "owm" : "om", k = `${l.id}|${ymd}|${s}`, h = hrs.get(k);
    if (h && h.hours) {
      const u = W.units(), cT = u.temp !== "C", cW = u.wind !== "km/h";
      return { source: h.source, hours: h.hours.map((x) => ({ ...x, temp: cT ? toT(x.temp, "C") : round(x.temp), wind: cW ? toW(x.wind, "km/h") : round(x.wind) })) };
    }
    if (h && h.error && Date.now() - h.at < 5 * 60 * 1000) return { hours: [], source: "open-meteo", error: h.error };
    if (!h || !h.asking) {
      hrs.set(k, { asking: true });
      setTimeout(async () => {
        try {
          const r = await fetch(`/api/weather/hours?lat=${encodeURIComponent(l.lat)}&lon=${encodeURIComponent(l.lon)}&date=${ymd}&src=${s}`, { cache: "no-store" });
          const j = r.ok ? await r.json() : null;
          if (!j || !j.ok || !Array.isArray(j.hours)) throw new Error(`HTTP ${r.status}`);
          hrs.set(k, { at: Date.now(), source: j.source === "owm" ? "owm" : "open-meteo", hours: j.hours.map((x) => {
            const [kind, text] = describe(x.wmo);
            return { at: new Date(x.t * 1000), temp: x.temp, kind, text, rain: round(x.rainPct), wind: x.wind, isDay: x.isDay !== false, om: x.from === "om" };
          }) });
        } catch (e) {
          try { console.warn(`[weather] hours for ${l.name || l.id}: ${(e && e.message) || e}`); } catch {}
          hrs.set(k, { error: T("wx.unavailableNow"), at: Date.now() });
        }
        changed();
      }, 0);
    }
    return null;
  };
  // (a new day: the days before it are forgotten)
  const dropOldHours = () => { const today = localDay(); for (const k of [...hrs.keys()]) if (k.split("|")[1] < today) hrs.delete(k); };

  W.refresh = () => Promise.all([...new Map([...W.locations, ...liveSeen()].map((l) => [l.id, l])).values()].map(fetchOne));
  // (v3.0.3) the panel's units changed (Manager → the panel's settings): fetched again at once in the new ones (until
  // then omData converts) — Settings calls this, and the minute timer looks too
  let unitsAt = unitsKey();
  W.unitsCheck = () => { const k = unitsKey(); if (k === unitsAt) return null; unitsAt = k; memo.clear(); asked.clear(); return W.refresh(); };
  W.refresh();
  setInterval(W.refresh, REFRESH_MS);
  // the service's copy arrived / another screen added or removed a place
  if (window.PanelStore) PanelStore.onChange((keys) => {
    if (!keys.includes("weatherCustom")) return;
    W.locations = [...FIXED, ...loadCustom()];
    if (W.selected && W.selected !== HUB_ID && !W.location()) W.selected = null;
    W.locations.filter((l) => !W.data[l.id]).forEach(fetchOne);
    changed();
  });

  window.Weather = W;
})();
