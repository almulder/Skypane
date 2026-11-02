// The panel's words (v3.0.0): one table per language (shared/strings/<lang>.js → window.PANEL_STRINGS[lang]),
// read through T(key, vars) — the same rules as the Manager's Kit.t (dashboard/manage/kit.js):
//   T("pin.wrong")                          → "Wrong PIN"
//   T("cal.more", { n: 3 })                 → "+3 more coming up"     ({name} = a value put in)
//   an entry {one, other, …}                → the plural form Intl.PluralRules picks for vars.n
// Whole sentences only, never pieces glued together; plain text (the caller escapes it for HTML as any value).
// A key missing from the table shows the key (and says so once on the console) — never an empty label.
//
// The language: per panel (Manager → Panels → the panel's language: settings "language"), handed to the page in its
// boot JSON as PANEL_LANG (so the first draw has it); "en" when nothing is set. For another language the panel loads
// shared/strings/<lang>.js itself and draws again when it arrives; every key that file lacks stays English. 3.0 ships
// English only — 3.1 adds the files, nothing else changes.
//
// Dates and times go through Intl with the panel's locale (T.time, T.date, T.hour…): the clock and the hour pickers
// follow it (12 or 24 hours). English keeps the tablet's own English (en-GB: 24 hours) — any other language its own.
(function () {
  const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
  const all = () => window.PANEL_STRINGS || (window.PANEL_STRINGS = {});
  const setting = () => {
    try { const s = window.PanelStore && PanelStore.get("settings"); return s && typeof s.language === "string" ? s.language : ""; } catch { return ""; }
  };
  const lang = () => {
    const l = String(window.PANEL_LANG || setting() || "en");
    return LANG_RE.test(l) ? l : "en";
  };
  // the locale for dates, times and numbers: the panel's language — for English the tablet's own English variant
  const locale = () => {
    const l = lang(), n = typeof navigator === "undefined" ? {} : navigator, nav = (n.languages && n.languages[0]) || n.language || "";
    return nav && nav.split("-")[0].toLowerCase() === l.split("-")[0] ? nav : l;
  };
  let pr = null, prLang = "";
  const plural = (n) => {
    if (!pr || prLang !== lang()) { prLang = lang(); try { pr = new Intl.PluralRules(prLang); } catch { pr = { select: (x) => (x === 1 ? "one" : "other") }; } }
    return pr.select(Number(n) || 0);
  };
  const missing = new Set();
  function T(key, vars) {
    const tabs = all(), l = lang(), base = l.split("-")[0];
    const pick = (tab) => (tab && Object.prototype.hasOwnProperty.call(tab, key) ? tab[key] : undefined);
    let s = pick(tabs[l]);
    if (s === undefined) s = pick(tabs[base]);
    if (s === undefined) s = pick(tabs.en);
    if (s == null) { if (!missing.has(key)) { missing.add(key); console.warn(`Skypane: no words for "${key}"`); } return key; }
    if (typeof s === "object") s = s[plural((vars || {}).n)] || s.other || "";
    return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m)) : String(s);
  }
  // a sentence with a few marked-up pieces in it ("Open {url} on a laptop", the url in bold): the sentence is escaped,
  // then each {name} gets the HTML given for it — the caller's own markup, already safe
  const escH = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  T.html = (key, html, vars) => escH(T(key, vars)).replace(/\{(\w+)\}/g, (m, k) => (html && Object.prototype.hasOwnProperty.call(html, k) ? String(html[k]) : m));
  // a built-in thing's name (a theme, a background, a clock style…): its words when the table has them, else the name it came with
  T.named = (prefix, id, fallback) => { const k = `${prefix}.${id}`; return T.has(k) ? T(k) : String(fallback ?? id); };
  T.lang = lang;
  T.locale = locale;
  T.has = (key) => Object.prototype.hasOwnProperty.call(all().en || {}, key);

  // ---------- dates and times (Intl, the panel's locale) ----------
  const fmt = (d, opts) => { try { return new Intl.DateTimeFormat(locale(), opts).format(d); } catch { return new Intl.DateTimeFormat("en", opts).format(d); } };
  const parts = (d, opts) => { try { return new Intl.DateTimeFormat(locale(), opts).formatToParts(d); } catch { return new Intl.DateTimeFormat("en", opts).formatToParts(d); } };
  T.time = (d = new Date()) => fmt(d, { hour: "numeric", minute: "2-digit" });               // "4:13 PM" / "16:13"
  T.date = (d = new Date(), opts) => fmt(d, opts || { weekday: "long", month: "long", day: "numeric" });
  T.weekday = (d, style = "short") => fmt(d, { weekday: style });                         // "Mon" / "Monday"
  T.dayShort = (d) => fmt(d, { month: "short", day: "numeric" });                           // "Nov 1"
  T.dateTime = (d) => fmt(d, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  T.month = (d) => fmt(d, { month: "long", year: "numeric" });                              // "November 2026"
  // the big clock: the time without its day period, and the day period apart ("4:13" + "PM"; "16:13" + "" in 24 h)
  T.clock = (d = new Date()) => {
    const p = parts(d, { hour: "numeric", minute: "2-digit" });
    const ampm = p.filter((x) => x.type === "dayPeriod").map((x) => x.value).join("");
    const time = p.filter((x) => x.type !== "dayPeriod").map((x) => x.value).join("").trim();
    return { time, ampm };
  };
  // the clock's pieces for its looks (clock.js): hours, minutes, the day period ("" in 24 hours)
  T.clockParts = (d = new Date()) => {
    const p = parts(d, { hour: "numeric", minute: "2-digit" }), get = (k) => p.filter((x) => x.type === k).map((x) => x.value).join("");
    return { h: get("hour"), m: get("minute"), ap: get("dayPeriod") };
  };
  // an hour for a picker: 7 → "7 AM" / "07:00"
  T.hour = (h) => { const d = new Date(2000, 0, 1, h, 0, 0); return T.clock(d).ampm ? fmt(d, { hour: "numeric" }) : fmt(d, { hour: "2-digit", minute: "2-digit" }); };
  // ["John", "Jane"] → "John and Jane" / "John & Jane"-like, as the language joins a list
  T.list = (items) => { try { return new Intl.ListFormat(lang(), { style: "short", type: "conjunction" }).format(items.map(String)); } catch { return items.join(", "); } };
  T.number = (n, opts) => { try { return new Intl.NumberFormat(locale(), opts).format(n); } catch { return String(n); } };

  // ---------- another language: its file, loaded once, then the page drawn again ----------
  const asked = new Set();
  T.load = (l = lang()) => {
    if (!LANG_RE.test(l) || l === "en" || asked.has(l) || all()[l]) return;
    asked.add(l);
    const s = document.createElement("script");
    s.src = `shared/strings/${l}.js`;
    s.onload = () => { pr = null; dispatchEvent(new Event("panel-strings")); if (window.App && App.render) App.render(); };
    s.onerror = () => { const b = l.split("-")[0]; if (b !== l) T.load(b); };   // ("nl-BE" missing: "nl", then English)
    document.head.appendChild(s);
  };
  window.T = T;
  T.load();
})();
