// Live weather from Open-Meteo (free, no key, works from the panel's browser).
// The places added on the panel (+ on the weather card; none until then — v2.2.0: no built-in places), kept in the
// panel's store. A grid weather card has its own places (the builder).
// Weather.onChange(fn) -> fn(Weather) whenever data or the selected location changes.
// (v3.0.0) A Hubitat weather device set up in the Manager (Integrations → Weather): its weather — the bridge's retained
// hubitat/weather — is the FIRST tab's ("Home") while it's active and fresh; the other places stay on Open-Meteo, and
// Open-Meteo is the Home tab's again when the device is off or its data is stale. Weather.get(id) / current() hand out
// whichever is shown, with .source "hubitat" | "open-meteo"; numbers in the panel's units (Weather.units()).
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
    data: {},          // id -> { now, days[], sunrise, sunset, updated }
    error: null,
    describe,
    hub: null,         // the Hubitat weather device's message (hubitat/weather), as it came
  };
  // the panel's units (settings units {temp: "F"|"C", wind: "mph"|"km/h"}; °F and mph as before when not set)
  W.units = () => { const u = (window.Settings && Settings.v && Settings.v.units) || {}; return { temp: u.temp === "C" ? "C" : "F", wind: u.wind === "km/h" ? "km/h" : "mph" }; };
  const toT = (v, from) => { if (v == null || !Number.isFinite(+v)) return null; const to = W.units().temp; v = +v; return Math.round(from === to ? v : to === "C" ? (v - 32) * 5 / 9 : v * 9 / 5 + 32); };
  const toW = (v, from) => { if (v == null || !Number.isFinite(+v)) return null; const to = W.units().wind; v = +v; return Math.round(from === to ? v : to === "km/h" ? v * 1.609344 : v / 1.609344); };

  // ---------- the Hubitat weather device (the Home tab) ----------
  W.hubActive = () => {
    const h = W.hub;
    return !!(h && h.active === true && h.replaces === "home" && Number.isFinite(+h.updatedAt) && Date.now() / 1000 - +h.updatedAt < (+h.staleAfter || 7200));
  };
  // stale (it stopped reporting): its last values still beat an empty card while Open-Meteo has nothing for Home
  W.hubStale = () => { const h = W.hub; return !!(h && h.current && Number.isFinite(+h.updatedAt) && !W.hubActive() && (h.reason === "stale" || h.active === true)); };
  const HUB_ID = "hub";   // (the Home tab when this panel has no place of its own yet)
  const homeId = () => (W.locations.length ? W.locations[0].id : HUB_ID);
  const hhmmToday = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "")); if (!m) return null; const d = new Date(); d.setHours(+m[1], +m[2], 0, 0); return d; };
  let hubMemo = null, hubKey = "";
  function hubData() {
    const h = W.hub, u = (h && h.units) || {}, ut = u.temp === "C" ? "C" : "F", uw = u.wind === "km/h" || u.wind === "kmh" ? "km/h" : "mph";
    const key = `${h.updatedAt}|${W.units().temp}|${W.units().wind}|${T.lang()}`;
    if (hubMemo && key === hubKey) return hubMemo;
    const c = h.current || {}, om = W.data[homeId()];
    const word = (wmo, text) => (W.describe(wmo)[1] !== "—" ? W.describe(wmo)[1] : String(text || "—"));
    const days = (Array.isArray(h.forecast) ? h.forecast : []).slice(0, 3).map((f, i) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(f.date || "") ? new Date(`${f.date}T12:00`) : new Date(Date.now() + i * 864e5);
      return { date, day: i === 0 ? T("wx.today") : T.weekday(date), kind: describe(+f.wmo)[0], text: word(+f.wmo),
               high: toT(f.high, ut), low: toT(f.low, ut), rain: Number.isFinite(+f.rainPct) ? Math.round(+f.rainPct) : null };
    });
    hubMemo = {
      source: "hubitat",
      now: { temp: toT(c.temp, ut), feels: toT(c.feelsLike, ut), humidity: c.humidity != null ? Math.round(+c.humidity) : null, wind: toW(c.wind, uw),
             gusts: null, code: Number.isFinite(+c.wmo) ? +c.wmo : 3, kind: describe(+c.wmo)[0], text: word(+c.wmo, c.text), isDay: c.isDay !== false },
      days,
      // (no times from the device: Open-Meteo's for the same place, else a plain day)
      sunrise: hhmmToday(h.sunrise) || (om && om.sunrise) || null, sunset: hhmmToday(h.sunset) || (om && om.sunset) || null,
      updated: new Date(+h.updatedAt * 1000), device: h.device || null,
    };
    hubKey = key;
    return hubMemo;
  }
  // what a place shows: the Hubitat weather for the Home tab (while active and fresh), else Open-Meteo's
  W.get = (id, cardHome) => {
    const home = id && (cardHome || id === homeId() || id === HUB_ID);
    if (home && W.hubActive()) return hubData();
    const d = id ? W.data[id] : null;
    if (d) return { ...d, source: "open-meteo" };
    return home && W.hubStale() ? { ...hubData(), stale: true } : null;   // (never a blank card when the device has values)
  };
  // the panel's tabs: its places — and "Home" from the device when it has none yet
  W.tabs = () => (!W.locations.length && (W.hubActive() || W.hubStale()) ? [{ id: HUB_ID, name: (W.hub && W.hub.place) || T("wx.home"), hub: true }] : W.locations);
  // the warnings for the weather card's ribbon (hubitat/weather "warnings": {id, lvl, title, to})
  W.warnings = () => (W.hub && Array.isArray(W.hub.warnings) ? W.hub.warnings.filter((x) => x && typeof x.id === "string" && Number.isInteger(x.lvl)) : []);
  const okHub = (m) => m && typeof m === "object" && m.v === 1 && m.source === "hubitat";
  if (window.Home && Home.subscribe) Home.subscribe("hubitat/weather", (msg) => {
    let m; try { m = JSON.parse(msg); } catch { return; }
    if (!okHub(m)) return;
    W.hub = m; hubMemo = null;
    if (!W.selected && (W.hubActive() || W.hubStale())) W.selected = HUB_ID;
    changed();
  });
  // (fresh → stale happens without a message: looked at every minute)
  let wasActive = false;
  setInterval(() => { const a = W.hubActive(); if (a !== wasActive) { wasActive = a; hubMemo = null; changed(); } }, 60000);
  const listeners = [];
  const changed = () => listeners.forEach((fn) => fn(W));
  if (W.locations.length) W.selected = W.locations[0].id;

  W.onChange = (fn) => { listeners.push(fn); fn(W); };
  W.current = () => W.get(W.selected || (W.hubActive() || W.hubStale() ? HUB_ID : null));
  W.location = () => W.locations.find((l) => l.id === W.selected);
  W.select = (id) => { W.selected = id; changed(); const l = W.location(); if (l && !W.data[id]) fetchOne(l); };
  W.isCustom = (id) => id !== HUB_ID && !FIXED.some((f) => f.id === id);   // (the device's Home tab has no ×)
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
    if (W.selected === id) W.selected = W.locations.length ? W.locations[0].id : null;
    changed();
  };
  W.search = async (q) => {
    // (place names in the panel's language: its base code — "de" from "de-AT" — English without strings.js)
    const geoLang = () => { const l = window.T && T.lang ? String(T.lang()).split("-")[0].toLowerCase() : "en"; return /^[a-z]{2,3}$/.test(l) ? l : "en"; };
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${encodeURIComponent(geoLang())}&format=json`);
    return ((await r.json()).results || []).map((p) => ({ ...p, label: [p.name, p.admin1, p.country_code].filter(Boolean).join(", ") }));
  };

  async function fetchOne(loc) {
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return;
    const url = "https://api.open-meteo.com/v1/forecast"
      + `?latitude=${loc.lat}&longitude=${loc.lon}`
      + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,is_day"
      + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset"
      + `&temperature_unit=${W.units().temp === "C" ? "celsius" : "fahrenheit"}&wind_speed_unit=${W.units().wind === "km/h" ? "kmh" : "mph"}&timezone=auto&forecast_days=5`;
    try {
      const j = await (await fetch(url)).json();
      const c = j.current, d = j.daily;
      const [kind, text] = describe(c.weather_code);
      W.data[loc.id] = {
        now: { temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), humidity: c.relative_humidity_2m,
               wind: Math.round(c.wind_speed_10m), gusts: Math.round(c.wind_gusts_10m), code: c.weather_code, kind, text, isDay: !!c.is_day },
        days: d.time.map((t, i) => {
          const [k, tx] = describe(d.weather_code[i]);
          const date = new Date(t + "T12:00");
          return { date, day: i === 0 ? T("wx.today") : T.weekday(date), kind: k, text: tx,
                   high: Math.round(d.temperature_2m_max[i]), low: Math.round(d.temperature_2m_min[i]), rain: d.precipitation_probability_max[i] };
        }),
        sunrise: new Date(d.sunrise[0]), sunset: new Date(d.sunset[0]), updated: new Date(),
      };
      W.error = null;
    } catch (e) {
      W.error = T("wx.unavailable", { why: e.message });
    }
    changed();
  }

  // A weather card's own places (builder → the card → Places): each card has its own list and its own selected tab
  // (cardSel: card key → place id); the panel's list above stays as it is (no swapping while the page draws — two
  // cards with different places once fought over one global list and redrew forever). Weather data is kept per place
  // id, so a place on two cards is fetched once. The first place of a card is its home (the sky: App.skyPlace).
  const cardSel = new Map(), seen = new Map(), asked = new Map();   // seen: place id → place (refreshed with the rest)
  W.placesOf = (list) => (Array.isArray(list) ? list : []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)).slice(0, 6)
    .map((p) => ({ id: `p${p.lat}_${p.lon}`.replace(/[^\w-]/g, "_"), name: String(p.name || T("wx.place")), lat: p.lat, lon: p.lon, region: p.region }));
  // fetch the places not fetched yet (each at most once every 5 minutes: a failed one doesn't loop the drawing)
  W.need = (places) => places.forEach((l) => {
    if (!l || !Number.isFinite(l.lat) || !Number.isFinite(l.lon)) return;   // (the device's Home tab has no coordinates: nothing to fetch)
    seen.set(l.id, l);
    if (W.data[l.id] || Date.now() - (asked.get(l.id) || 0) < 5 * 60 * 1000) return;
    asked.set(l.id, Date.now());
    setTimeout(() => fetchOne(l), 0);   // (not while the page is drawing)
  });
  // a card's places and its selected one: {places, sel, data}
  W.forCard = (key, list) => {
    const places = W.placesOf(list);
    W.need(places);
    let sel = cardSel.get(key);
    if (!places.some((l) => l.id === sel)) sel = places.length ? places[0].id : null;
    return { places, sel, data: sel ? W.get(sel, places.length > 0 && sel === places[0].id) : null };   // (a card's first place is its "Home": the device's weather there too)
  };
  W.cardSelect = (key, id) => { cardSel.set(key, id); changed(); };

  W.refresh = () => Promise.all([...new Map([...W.locations, ...seen.values()].map((l) => [l.id, l])).values()].map(fetchOne));
  W.refresh();
  setInterval(W.refresh, REFRESH_MS);
  // the service's copy arrived / another screen added or removed a place
  if (window.PanelStore) PanelStore.onChange((keys) => {
    if (!keys.includes("weatherCustom")) return;
    W.locations = [...FIXED, ...loadCustom()];
    if (!W.location()) W.selected = W.locations.length ? W.locations[0].id : null;
    W.locations.filter((l) => !W.data[l.id]).forEach(fetchOne);
    changed();
  });

  window.Weather = W;
})();
