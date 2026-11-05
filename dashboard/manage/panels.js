// Skypane Manager — Panels (v2.5.0; the design notes "panels" + "panels status (option 3 grid)",
// the design notes decision 3). Two views, remembered per login (shell.js):
//   Status  every panel this login sees at once: a drawn map of its Home page (the cards as blocks in the panel's
//           theme, the room bar on its edge — built from its layout, no screenshots), online / offline and the last
//           check-in, its screen, the version it runs, its load (the builder's meter, against its benchmark); filters;
//           Benchmark all; Add a panel (the admin).
//   Setup   one panel at a time: the panel list, its settings in tabs (General, Look & layout, Rooms & devices,
//           Cameras, People & calendars, Alerts, Safety, Guest Wi-Fi card, Weather effects) and beside them its map —
//           a live preview of the look as it will be — and its status. (v3.0.2: the owner — "nothing seems to update":
//           the changes wait in a bar at the bottom, "3 changes waiting — Discard / Save", and Save sends them in one
//           PATCH /api/manage/panels/<id> {set}, service/panel_settings.py; the panel takes it.)
// (v3.0.2) Pairing (pairing.js): the requests, unclaimed panels, notices and each panel's tablet; there is no built-in
// "main" panel any more — every panel can be removed, and a tablet opens the Skypane address and is approved by code.
// "Open live": the panel's real page in a large window (/<panel>?live=1 — the service decides: the admin controls it as
// that panel would, any other login gets it view only; shared/live.js). Look & layout → the layout builder
// (builder.js, #panels/<id>/layout). Routes: #panels/status, #panels/setup/<id>[/<tab>], #panels/<id>/layout.
// A phone: the Status tiles, a panel's settings stacked under them; the builder opens on a computer only.
// Built with DOM calls + textContent only: names from the server are never parsed as HTML (the maps are SVG made with
// createElementNS; the icons are our own constant drawings).
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast, iconEl } = M, ic = K.icon;
  const SVGNS = "http://www.w3.org/2000/svg";
  // a sentence from the table with page elements in its {placeholders} (a link, a code) — never glued pieces
  const withEls = (key, nodes) => K.t(key).split(/(\{\w+\})/).filter(Boolean).map((x) => { const m = /^\{(\w+)\}$/.exec(x); return m && nodes[m[1]] ? nodes[m[1]] : x; });
  const ago = (t) => K.ago(t, "short");   // (kit.js: one "time ago" for every page)
  const phone = () => S.isPhone();
  const day = (t) => K.when(t / 1000, "date");   // (milliseconds here; kit.js: one date formatter)
  const TABS = [["general", K.t("panels.tab.general"), "settings"], ["look", K.t("panels.tab.look"), "layout"], ["rooms", K.t("panels.tab.rooms"), "home"], ["cameras", K.t("panels.shared.aboutcameras"), "camera"],
    ["people", K.t("panels.tab.people"), "users"], ["alerts", K.t("panels.tab.alerts"), "bell"], ["safety", K.t("panels.tab.safety"), "shield"], ["guest", K.t("panels.tab.guest"), "wifi"],
    ["effects", K.t("panels.tab.effects"), "sparkles"]];
  const TOPIC = { general: "panel-general", look: "look-layout", rooms: "panel-rooms", cameras: "panel-cameras", people: "people-calendars",
    alerts: "panel-alerts", safety: "panel-safety", guest: "guest-card", effects: "weather-effects" };
  // (every alert setting, the PIN windows, unlocking, the tablet's identity: the admin's — server.py ADMIN_PANEL_KEYS)
  const ADMIN_KEYS = new Set(["allowUnlock", "kioskName", "music.url", "cameras.go2rtc", "alertMinLevel", "quietFrom", "quietTo", "quietModes", "quietLevel4",
    "alertBeeps", "notifyLight", "alertSilence", "pinAlarmSeconds", "pinGeneralSeconds"]);
  const LOADS = ["", K.t("panels.load.minimal"), K.t("panels.load.light"), K.t("panels.load.medium"), K.t("panels.load.heavy")];   // (sky.js Sky.LOAD_NAMES)
  const CAL_DEFAULTS = [{ id: "john", name: "Calendar 1", color: "#8b5cf6", on: true }, { id: "jane", name: "Calendar 2", color: "#ec4899", on: true }];   // (settings.js DEFAULTS) i18n-ok
  const COLORS = ["#8b5cf6", "#ec4899", "#22d3ee", "#f59e0b", "#34d399", "#f43f5e"];

  // ================================================================== state
  let list = null, listAt = 0, cur = null, data = null, tab = "general", roomPick = null, myPics = null, pollT = null;
  const filt = { st: "all", q: "" };
  M.onReset(() => { list = null; listAt = 0; cur = null; data = null; tab = "general"; roomPick = null; myPics = null; filt.st = "all"; filt.q = ""; clearTimeout(pollT); dropPending(); pinSet = null; });
  const onPage = () => S.route().page === "panels" && document.body.classList.contains("signed-in") && !document.body.classList.contains("bld-open");
  const viewNow = () => S.view("panels") || "status";
  const shown = (id) => (list || []).find((p) => p.id === id);
  const address = (p) => `${location.host}${p.address}`;
  const rootAddress = () => `${location.protocol}//${location.host}/`;   // (v3.0.2: where every new tablet starts — the pairing page)
  const liveUrl = (p) => `${p.address}?live=1`;   // (v3.0.2: no "main" at / any more — / is the pairing page)
  M.panelsKnown = () => list || [];   // (pairing.js: the approve dialog's live hint)

  // ================================================================== changes waiting (v3.0.2, the owner: a real Save)
  // pend = {path: value} for the open panel (pendPid); a list's change ({room id: …}) is merged like the server's
  // panel_settings.apply (false / "" / [] = taken out). The tabs, the preview and the map read view() = saved + waiting.
  const MERGED = new Set(["hiddenRooms", "hiddenDevices", "extraDevices", "deviceOrder", "roomGrids", "roomLayouts", "cameras.hiddenViews", "cameras.viewNames"]);
  let pend = {}, pendPid = null, pinSet = null, saving = false;
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const gone = (v) => v === false || v === "" || (Array.isArray(v) && !v.length) || v == null;
  // (v3.0.2) what a setting that isn't saved means — what the tabs show for it (and the panel does): put back to it, a
  // change leaves the list ("Celsius" and back to "Fahrenheit" on a panel that never had one is no change)
  const DEF = { "units.temp": "F", "units.wind": "mph", ledStrip: false, arrangeOnPanel: false, pinSound: true, showVersion: true, homeAfter: 0, insideSensor: "panel", notifyLight: 0,
    alertBeeps: true, alertSilence: false, alertMinLevel: 1, quietLevel4: true, quietFrom: -1, quietTo: -1 };
  const isSaved = (k, v, saved) => (saved[k] == null ? (k in DEF ? same(v, DEF[k]) : v == null || v === "" || (Array.isArray(v) && !v.length)) : same(v, saved[k]));
  function dropPending() { pend = {}; pendPid = null; }
  // ("This tablet's own light" is two settings — ledStrip on, notifyLight 0 —, one change: counted once)
  const pendN = () => Object.entries(pend).reduce((n, [k, v]) => n + (MERGED.has(k) ? Object.keys(v).length : k === "ledStrip" && "notifyLight" in pend && !pend.notifyLight ? 0 : 1), 0);
  function view() {
    if (!data) return {};
    if (pendPid !== cur || !pendN()) return data.managed;
    const m = { ...data.managed };
    for (const [k, v] of Object.entries(pend)) {
      if (!MERGED.has(k)) { m[k] = v; continue; }
      const o = { ...(m[k] && typeof m[k] === "object" ? m[k] : {}) };
      for (const [x, y] of Object.entries(v)) { if (gone(y)) delete o[x]; else o[x] = y; }
      m[k] = o;
    }
    return m;
  }
  // a change kept for Save; one put back to what's saved leaves the list. redraw: the tab drawn again from view()
  function stage(set, redraw = true) {
    if (!data) return;
    if (pendPid !== cur) { pend = {}; pendPid = cur; }
    const saved = data.managed;
    for (const [k, v] of Object.entries(set)) {
      if (!MERGED.has(k)) { if (isSaved(k, v, saved)) delete pend[k]; else pend[k] = v; continue; }
      const now = { ...(pend[k] || {}) }, was = saved[k] && typeof saved[k] === "object" ? saved[k] : {};
      for (const [x, y] of Object.entries(v)) { if (gone(y) ? gone(was[x]) : same(y, was[x])) delete now[x]; else now[x] = y; }
      if (Object.keys(now).length) pend[k] = now; else delete pend[k];
    }
    if (redraw) drawSetup(); else { drawBar(); livePreview(); }
  }
  // Save: every change waiting in one PATCH (as save() sends one: {set}); the toast says where it went
  async function saveAll() {
    const pid = pendPid, set = { ...pend };
    if (!pid || !Object.keys(set).length) return true;
    const p = shown(pid) || { name: pid }, nm = (pid === cur && data && data.managed.panelName) || p.name;
    if (saving) return false;
    saving = true; drawBar();
    try {
      const r = await api(`/api/manage/panels/${encodeURIComponent(pid)}`, { set });
      saving = false;
      if (!r.ok) { toast(r.error === "not-allowed" ? K.t("panels.save.adminOnly") : r.error || K.t("panels.save.notSaved"), true); drawBar(); return false; }
      if (pendPid === pid) {   // (v3.0.2: only what was sent — a change made while the PATCH was on its way stays waiting)
        for (const [k, v] of Object.entries(set)) {
          if (!(k in pend)) continue;
          if (!MERGED.has(k)) { if (same(pend[k], v)) delete pend[k]; continue; }
          const now = { ...pend[k] };
          for (const [x, y] of Object.entries(v)) if (x in now && same(now[x], y)) delete now[x];
          if (Object.keys(now).length) pend[k] = now; else delete pend[k];
        }
        if (!pendN()) dropPending();
      }
      if (pid === cur && data) data.managed = r.managed || data.managed;
      listAt = 0;
      const nm2 = (set.panelName || nm);
      toast(stateOf(p) === "online" ? K.t("panels.save.sentOnline", { name: nm2 }) : K.t("panels.save.sent", { name: nm2 }));
      if ("panelName" in set || "kioskName" in set) await loadList(true).catch(() => {});
      drawSetup();
      return true;
    } catch (e) { saving = false; if (e.message !== "login") toast(K.t("panels.save.offline"), true); drawBar(); return false; }
    finally { if (saving) { saving = false; drawBar(); } }
  }
  // the bar at the bottom (Integrations' drawBar); the marker in the page's data-unsaved box: the Manager's own
  // "Leave without saving?" (another page, Back, closing the tab) knows about the changes
  const marker = el("input.sr-hide", { type: "text", tabindex: "-1", "aria-hidden": "true", value: "" });
  const bar = el("div.in-bar.pn-bar", { role: "region", "aria-label": K.t("panels.bar.label"), hidden: true });
  // (v3.0.2: the buttons are made once and only switched on / off — a field's change on leaving it redrew them under
  // the pressed mouse, and Save never got its click; while a save is on its way, both wait for its answer)
  const barText = el("span"), barBtns = [el("button.btn", { type: "button", onclick: () => { if (saving) return; dropPending(); drawSetup(); } }, K.t("panels.bar.discard")),
    el("button.btn.pri", { type: "button", onclick: () => { if (!saving) saveAll(); } }, K.t("panels.bar.save"))];
  bar.append(barText, el("span.sp"), ...barBtns);
  function drawBar() {
    const n = pendPid === cur ? pendN() : 0;
    marker.value = n ? String(n) : "";
    bar.hidden = !n;
    barText.textContent = K.t("panels.bar.waiting", { n });
    for (const b of barBtns) b.disabled = saving;
  }
  // the preview and this panel's map in the list follow what's waiting (no redraw — a text field keeps its caret)
  function livePreview() {
    const map = mapOf(view());
    for (const box of M.$main.querySelectorAll(".pn-prevbox, .pn-li.cur .th")) {
      const old = box.querySelector("svg.pn-map"); box.style.background = mapBg(map);
      if (old) old.replaceWith(drawMap(map, data.perf, old.getAttribute("aria-label") || ""));
    }
  }
  // leaving this panel's Setup inside the page (another panel, Status, the builder): the Manager's own question first;
  // "Leave" drops the changes. (The router asks by itself before another page — M.leaveOk below drops them then too.)
  async function leavePending() {
    if (!pendN() || pendPid !== cur) return true;
    if (!(await M.leaveOk())) return false;
    dropPending(); return true;
  }
  const leaveOk0 = M.leaveOk;
  if (leaveOk0) M.leaveOk = async () => { const ok = await leaveOk0(); if (ok) { if (pendN()) { dropPending(); marker.value = ""; } } return ok; };

  // bg: the Status view's 30 s refresh — a background poll (Manage.poll) that never keeps the session alive
  window.addEventListener("manage:refresh", () => { listAt = 0; });   // (v2.9.2: a pull to refresh reads the panels' status again)
  async function loadList(force, bg) {
    if (list && !force && Date.now() - listAt < 15000) return list;
    let r;
    if (bg) {
      const res = await M.poll("/api/manage/panels");
      if (!res) throw new Error("login");
      if (!res.ok) throw new Error("poll");
      r = await res.json();
    } else r = await api("/api/manage/panels");
    list = Array.isArray(r.panels) ? r.panels : [];
    listAt = Date.now();
    if (M.refreshHealth) M.refreshHealth();   // (v3.0.0: the top bar's "Panels n/m" follows the list)
    return list;
  }
  async function loadPanel(id) {
    const d = await api(`/api/manage/panels/${encodeURIComponent(id)}`);
    if (!d || d.refused || !d.managed) return null;
    return d;
  }

  // ================================================================== saving one setting
  const mark = (box, why) => { if (!box) return;
    box.classList.toggle("pn-bad", !!why); box.title = why ? K.t("panels.save.notSavedWhy", { why }) : ""; box.setAttribute("aria-invalid", why ? "true" : "false"); };
  // opts.was = {path: value as loaded}: the builder's layouts — refused when someone saved them meanwhile → "changed"
  // opts.pid: the panel the change is about, taken when it was asked for — never whichever panel is open by the time an
  // answer comes back (a question left open over Back must not change another panel)
  async function save(set, box, opts = {}) {
    const pid = opts.pid || cur;
    try {
      const r = await api(`/api/manage/panels/${encodeURIComponent(pid)}`, { set, ...(opts.was ? { was: opts.was } : {}) });
      if (!r.ok && r.error === "changed") return "changed";
      if (!r.ok) {   // (a layout the server refused: the builder's plain words for it, when it has them)
        const msg = (M.plainLayoutError && r.error ? M.plainLayoutError(r.error) : r.error === "not-allowed" ? K.t("panels.save.adminOnly") : r.error) || K.t("panels.save.notSaved");
        toast(msg, true); mark(box, msg); return false;
      }
      if (pid === cur) data.managed = r.managed;
      listAt = 0;   // (the Status view reads the maps again)
      mark(box, "");
      toast(K.t("panels.save.saved"));
      return true;
    } catch (e) { if (e.message !== "login") toast(K.t("panels.save.offline"), true); mark(box, K.t("panels.save.notSent")); return false; }
  }
  // (the layout builder open over the page: the page redrawing underneath — a poll, a save — leaves the address alone)
  const builderUp = () => document.body.classList.contains("bld-open");
  // (v3.0.2: the setup tabs' controls keep their change for Save — stage(); save() above stays for the builder's layouts)
  const saveDraw = (set) => stage(set, true);
  const keep = (set) => stage(set, false);
  // a question first, then the change — to the panel that was open when it was asked; the page moved on meanwhile: no change
  async function askThenSave(q, set) {
    const pid = cur;
    if (!(await ask(q)) || pid !== cur) return drawSetup();
    saveDraw(set);
  }

  // a small question in the Manager's own look (not the browser's): resolves true / false
  const ask = (o) => K.ask(o);   // (kit.js: the Manager's own question, named buttons)

  // ================================================================== the drawn map of a panel (the decision 3)
  // map = {theme, background, layout, dockAt, dockOff, dockStyle, grid: {cols, rows, scr?, cards: [[x, y, w, h, type, flags]…]}}
  // (the server's panel_settings.thumbnail; mapOf: the same from a panel's settings here, for the live preview)
  function mapOf(m) {
    const one = (v, ok, d) => (ok.includes(v) ? v : d);
    const g = m.homeGrid && Array.isArray(m.homeGrid.cards) ? m.homeGrid : null;
    return { theme: (window.THEMES || {})[m["look.theme"]] || m["look.theme"] === "custom" ? m["look.theme"] : "purple", hue: m["look.hue"], background: m["look.background"] || "mountains",
      layout: one(m.homeLayout, ["classic", "agenda", "duo", "security", "minimal", "custom"], "classic"),
      dockAt: one(m.dockAt, ["bottom", "top", "left", "right"], "bottom"), dockOff: m.dockOff === true, dockStyle: m.dockStyle || "pill", maxLoad: m["effects.maxLoad"] || 0,
      grid: g ? { cols: g.cols || 12, rows: g.rows || 8, scr: g.scr, cards: g.cards.slice(0, 60).map((c) => [c.x, c.y, c.w, c.h, c.t,
        `${c.o && c.o.view === "still" ? "s" : c.o && c.o.view === "icon" ? "i" : ""}${c.o && /^art:/.test(c.o.icon || "") ? "a" : ""}`]) } : null };
  }
  // the page the map shows: its own grid ("Your own layout"), else the built-in layout's cards (builder.js presets)
  function pageOf(map) {
    if (map.layout === "custom" && map.grid) return { cols: map.grid.cols, rows: map.grid.rows, cards: map.grid.cards, own: true };
    const pre = M.layoutPresets ? M.layoutPresets()[map.layout === "custom" ? "classic" : map.layout] : null;
    return { cols: 12, rows: 8, cards: pre ? pre[1].map((c) => [c.x, c.y, c.w, c.h, c.t, ""]) : [], own: false };
  }
  // its screen: the layout's own size, else what the panel measured, else a 10" wall tablet
  function screenOf(map, perf) {
    const g = map && map.grid, meas = (perf || []).find((p) => p.vw && p.vh);
    if (map && map.layout === "custom" && g && g.scr) return { w: g.scr.w, h: g.scr.h };
    return meas ? { w: meas.vw, h: meas.vh } : { w: 1280, h: 800 };
  }
  const svg = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v)); return n; };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  let mapN = 0;
  const DARK_T = new Set(["camera", "roomcams", "photos", "picture"]);
  // the colours around a map whose screen isn't the box's shape (a 16:9 panel in a 16:10 tile): the theme's own sky and
  // land, never plain navy bands
  // (v3.0.2: themes.js themeOf — "custom" is Purple turned to the map's hue)
  const themeOfMap = (map) => (window.themeOf ? themeOf(map.theme, map.hue) : (window.THEMES || {})[map.theme] || (window.THEMES || {}).purple);
  function mapBg(map) {
    const T = themeOfMap(map);
    if (!T) return "#0b0820";
    const sky = (T.sky && (T.sky.night || T.sky.day)) || ["#0b0820", "#1d1145", "#3a1d6e"], land = T.land || [["#5a3399", "#2a1757"]];
    return `linear-gradient(180deg, ${sky[0]}, ${sky[sky.length - 1]} 58%, ${(land[land.length - 1] || land[0])[1] || "#140b30"})`;   // i18n-ok (CSS)
  }
  // drawMap(map, perf) → an <svg> (the screen's proportions; scales to its box)
  function drawMap(map, perf, label) {
    const T = themeOfMap(map) || { sky: { night: ["#0b0820", "#1d1145", "#3a1d6e"] }, land: [["#5a3399", "#2a1757"], ["#29165a", "#140b30"]], glass: [30, 20, 64], accent: "#8b5cf6" };
    const scr = screenOf(map, perf), W = 320, H = Math.round((W * scr.h) / scr.w), id = `pnm${++mapN}`;
    const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": label || K.t("panels.map.label"), class: "pn-map" });   // i18n-ok (CSS)
    const defs = svg("defs", {}), grad = svg("linearGradient", { id: `${id}s`, x1: 0, y1: 0, x2: 0, y2: 1 });
    const sky = (T.sky && (T.sky.night || T.sky.day)) || ["#0b0820", "#1d1145", "#3a1d6e"];
    sky.forEach((c, i) => grad.append(svg("stop", { offset: `${(i / Math.max(1, sky.length - 1)) * 100}%`, "stop-color": c })));
    defs.append(grad); s.append(defs);
    s.append(svg("rect", { x: 0, y: 0, width: W, height: H, fill: `url(#${id}s)` }));
    // (the landscape: two ridges in the theme's colours — not the picture itself)
    const land = T.land || [["#5a3399", "#2a1757"], ["#29165a", "#140b30"]];
    s.append(svg("path", { d: `M0 ${H * 0.62} L${W * 0.18} ${H * 0.5} L${W * 0.36} ${H * 0.6} L${W * 0.58} ${H * 0.44} L${W * 0.78} ${H * 0.58} L${W} ${H * 0.5} L${W} ${H} L0 ${H}Z`, fill: land[0][1] || land[0][0], opacity: 0.85 }));
    s.append(svg("path", { d: `M0 ${H * 0.78} L${W * 0.26} ${H * 0.68} L${W * 0.5} ${H * 0.76} L${W * 0.74} ${H * 0.66} L${W} ${H * 0.74} L${W} ${H} L0 ${H}Z`, fill: (land[2] || land[1] || land[0])[1] || "#140b30" }));
    // the room bar on its edge (its style, roughly), and the room it leaves for the cards
    const side = map.dockAt === "left" || map.dockAt === "right", pad = Math.round(W * 0.025), bar = map.dockOff ? 0 : Math.round(Math.min(W, H) * (map.dockStyle === "chips" ? 0.075 : 0.1));
    const box = { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };
    if (bar) {
      if (map.dockAt === "bottom") box.h -= bar + pad / 2; else if (map.dockAt === "top") { box.y += bar + pad / 2; box.h -= bar + pad / 2; }
      else if (map.dockAt === "left") { box.x += bar + pad / 2; box.w -= bar + pad / 2; } else box.w -= bar + pad / 2;
      const full = map.dockStyle === "rail" || map.dockStyle === "tabs";
      const len = full ? (side ? H : W) : (side ? H : W) * (map.dockStyle === "split" ? 0.92 : 0.58), t = full ? bar : bar * 0.78;
      const along = full ? 0 : ((side ? H : W) - len) / 2, edge = full ? 0 : pad * 0.6;
      const r = { bottom: [along, H - edge - t, len, t], top: [along, edge, len, t], left: [edge, along, t, len], right: [W - edge - t, along, t, len] }[map.dockAt];
      s.append(svg("rect", { x: r[0], y: r[1], width: r[2], height: r[3], rx: full ? 0 : t / 2, fill: "rgba(255,255,255,.16)", stroke: "rgba(255,255,255,.22)", "stroke-width": 0.8 }));
      const n = map.dockStyle === "split" ? 7 : 6, step = len / (n + 1);
      for (let i = 1; i <= n; i++) {
        if (map.dockStyle === "split" && i === 3) continue;
        const cx = side ? r[0] + r[2] / 2 : r[0] + i * step, cy = side ? r[1] + i * step : r[1] + r[3] / 2;
        s.append(svg("circle", { cx, cy, r: Math.max(1.6, t * 0.16), fill: i === 1 ? T.accent || "#8b5cf6" : "rgba(255,255,255,.55)" }));
      }
    }
    // the cards
    const pg = pageOf(map), kx = box.w / pg.cols, ky = box.h / pg.rows, glass = T.glass || [30, 20, 64];
    if (!pg.cards.length) {
      s.append(svg("rect", { x: box.x + 1, y: box.y + 1, width: box.w - 2, height: box.h - 2, rx: 6, fill: "none", stroke: "rgba(255,255,255,.35)", "stroke-dasharray": "4 4" }));
      const t = svg("text", { x: W / 2, y: box.y + box.h / 2 + 4, "text-anchor": "middle", fill: "rgba(255,255,255,.75)", "font-size": 12, "font-family": "Inter, sans-serif" });   // i18n-ok (CSS)
      t.textContent = K.t("panels.map.noCards");
      s.append(t);
    }
    const gap = pg.own ? 0.6 : 2.2;
    for (const [x, y, w, h, t] of pg.cards) {
      const rx = box.x + x * kx + gap / 2, ry = box.y + y * ky + gap / 2, rw = Math.max(2, w * kx - gap), rh = Math.max(2, h * ky - gap);
      s.append(svg("rect", { x: rx, y: ry, width: rw, height: rh, rx: Math.min(6, rw / 4, rh / 4), fill: DARK_T.has(t) ? "rgba(8,6,20,.62)" : rgba(glass, 0.58), stroke: "rgba(255,255,255,.16)", "stroke-width": 0.7 }));
      // (a clock: its big time in the middle, not a title line — a line at the top left would read as part of the address tag)
      if (t === "clock" && rw > 20 && rh > 12) s.append(svg("rect", { x: rx + rw * 0.18, y: ry + rh * 0.38, width: rw * 0.5, height: Math.max(2, rh * 0.22), rx: 2, fill: "rgba(255,255,255,.7)" }));
      else if (rw > 14 && rh > 9) s.append(svg("rect", { x: rx + Math.min(5, rw * 0.12), y: ry + Math.min(5, rh * 0.2), width: Math.min(rw * 0.42, 34), height: Math.max(1.6, Math.min(3, rh * 0.12)), rx: 1, fill: T.accent || "#8b5cf6", opacity: 0.85 }));
    }
    return s;
  }

  // ================================================================== a panel's state in words
  // (v3.0.2) "unclaimed": no tablet linked (just added, or its tablet unlinked) — waiting for a tablet to be approved
  const stateOf = (p) => (p.claim && p.claim.state === "unclaimed" ? "unclaimed" : (p.status && p.status.state) || "never");
  const DOT = { online: "", offline: "bad", never: "idle", unclaimed: "idle" };
  const ST_NAME = { online: K.t("panels.state.online"), offline: K.t("panels.state.offline"), never: K.t("panels.state.never"), unclaimed: K.t("panels.state.unclaimed") };
  const stName = (st) => ST_NAME[st] || ST_NAME.never;
  function stateWords(p) {
    const s = p.status || {}, st = stateOf(p);
    return st === "online" ? K.t("panels.state.onlineAgo", { ago: ago(s.lastSeen) }) : st === "offline" ? K.t("panels.state.offlineAgo", { ago: ago(s.lastSeen) })
      : st === "unclaimed" ? K.t("panels.state.unclaimedLong") : K.t("panels.state.never");
  }
  const sizeWords = (p, map) => { const meas = (p.perf || []).find((x) => x.vw && x.vh); return meas ? `${meas.vw} × ${meas.vh}` : map && map.grid && map.grid.scr ? K.t("panels.screen.layoutSize", { w: map.grid.scr.w, h: map.grid.scr.h }) : K.t("panels.screen.notMeasured"); };
  // (the tile's short form: 1280×800, or — when not measured)
  const sizeShort = (p, map) => { const meas = (p.perf || []).find((x) => x.vw && x.vh); return meas ? `${meas.vw}×${meas.vh}` : map && map.grid && map.grid.scr ? `${map.grid.scr.w}×${map.grid.scr.h}` : "—"; };
  // the Home page's load against the panel's benchmark (the builder's meter); null = can't be worked out
  function loadOf(p, map, extra) {
    if (!M.pageLoad) return null;
    const pg = pageOf(map);
    const cards = pg.cards.map(([x, y, w, h, t, f]) => ({ i: "", t, x, y, w, h, s: {}, o: { ...(String(f).includes("s") ? { view: "still" } : String(f).includes("i") ? { view: "icon" } : {}),
      ...(String(f).includes("a") ? { icon: "art:x" } : {}) } }));
    try { return M.pageLoad({ cards }, { perf: p.perf, managed: { "effects.maxLoad": map.maxLoad || 0 }, views: (extra && extra.views) || [] }); } catch { return null; }
  }
  const loadColour = (pct) => (pct > 100 ? "var(--bad)" : pct > 80 ? "var(--warn)" : "var(--ok)");

  // ================================================================== the page
  let $page = null;
  function header() {
    const admin = M.isAdmin();
    const acts = phone() ? null : el("div.acts", {},   // (v2.8.0: a phone looks — adding and benchmarking are on a computer)
      // (v3.0.0) "Benchmark all": an admin or a login that manages every panel — not a family login with its own panel
      viewNow() === "status" && (M.isAdmin() || ((M.me() || {}).perms || {}).panels === "all") ? el("button.btn", { type: "button", "aria-label": K.t("panels.head.benchAll"), "data-tip": K.t("panels.head.benchAllTip"), onclick: benchAll },
        ic("activity", 16), el("span.bl", {}, K.t("panels.head.benchAll"))) : null,
      admin ? el("button.btn.pri", { type: "button", "aria-label": K.t("panels.add.title"), onclick: () => addPanel() }, ic("plus", 16), el("span.bl", {}, K.t("panels.add.short"))) : null);
    return el("div.ph", {}, el("div", {}, el("h1", {}, K.t("panels.shared.aboutpanels")),
      el("p", {}, K.t("panels.head.intro"))),
    el("span.sp"), acts, phone() ? null : el("span.vr"), phone() ? null : S.viewSwitch("panels"));
  }
  // (v3.0.2) under the header, the admin's pairing box (pairing.js): requests, the grace period, unclaimed panels,
  // notices — in full on Status, only the waiting tablets on Setup, read only on a phone. The same node every time:
  // its 3 s poll draws only itself
  function frame(...kids) {
    const pair = M.pairingBox ? M.pairingBox(phone() ? "phone" : viewNow() === "setup" && cur ? "compact" : "full") : null;
    $page = el("div.pn-page", { "data-view": viewNow() }, header(), pair, ...kids);
    M.swap(M.$main, $page);
  }

  // where the router sends us (shell.js): [] | ["status"] | ["setup", id?, tab?] | [id] (old links) | [id, "layout"]
  async function route(rest) {
    await route1(rest);
    if (M.focusAddPanel && S.route().page === "panels") { M.focusAddPanel = false; if (M.isAdmin()) addPanel(); }   // (search → Add a panel)
  }
  async function route1(rest) {
    clearTimeout(pollT);
    if (!list) M.$main.replaceChildren(phone() ? el("div.p-skel", { role: "status", "aria-label": K.t("panels.loading") }, el("i"), el("i"), el("i")) : el("p.muted", {}, K.t("common.loading")));   // (a phone: skeleton rows)
    try { await loadList(); } catch { return; }
    if (S.route().page !== "panels") return;
    if (phone()) return showCarousel(rest);   // (v2.8.0: the phone's carousel — below)
    const views = ["status", "setup"];
    if (rest[0] && !views.includes(rest[0])) {   // (#panels/<id>, #panels/<id>/layout)
      const p = shown(String(rest[0]).toLowerCase());
      if (!p) { toast(K.t("panels.route.notThere"), true); return showStatus(); }
      if (rest[1] === "layout") { await openSetup(p.id, "look"); if (data && cur === p.id && onPage()) openBuilder(); return; }
      return openSetup(p.id, TABS.some(([k]) => k === rest[1]) ? rest[1] : null);
    }
    if (rest[0] === "setup" || (!rest[0] && viewNow() === "setup")) {
      const id = rest[0] === "setup" && rest[1] ? String(rest[1]).toLowerCase() : cur;
      return openSetup(id && shown(id) ? id : (list[0] || {}).id, rest[2] && TABS.some(([k]) => k === rest[2]) ? rest[2] : null);
    }
    return showStatus();
  }

  // ================================================================== Status
  function showStatus() {
    // (v3.0.2: changes waiting on a panel's Setup — the view switch, ‹ All panels: the Manager's question first; Stay =
    // back to that Setup, its changes still waiting)
    if (pendN() && pendPid === cur && M.$main.querySelector(".pn-setup")) {
      leavePending().then((ok) => (ok ? showStatus() : S.setView("panels", "setup")));
      return;
    }
    if (!list.length) return frame(empty());
    if (S.route().page !== "panels") return;
    if (S.view("panels") !== "status" && !phone()) S.setView("panels", "status", false);
    if (M.routeSync && !builderUp()) M.routeSync(["status"]);
    drawStatus();
    poll();
  }
  function empty() {
    return el("div.pn-empty", {}, el("span.ei", {}, ic("tablet", 22)), el("b", {}, K.t("panels.empty.title")),
      el("p", {}, M.isAdmin() && phone() ? K.t("panels.empty.adminPhone")
        : M.isAdmin() ? K.t("panels.empty.admin")
        : K.t("panels.empty.user")));
  }
  function drawStatus() {
    const all = list, on = all.filter((p) => stateOf(p) === "online"), off = all.filter((p) => stateOf(p) === "offline"), never = all.filter((p) => stateOf(p) === "never");
    const maps = new Map(all.map((p) => [p.id, p.map || mapOf({})]));
    const loads = all.map((p) => [p, loadOf(p, maps.get(p.id))]).filter(([, l]) => l && l.measured);
    const benched = all.map((p) => [p, M.benchOf ? M.benchOf(p.perf) : null]).filter(([, b]) => b).sort((a, b) => b[1].at - a[1].at);
    const kpi = (cls, small, big, sub) => el("div.kpi" + (cls ? `.${cls}` : ""), {}, el("small", {}, small), el("b", {}, big, sub ? el("span", {}, sub) : null));
    const free = all.filter((p) => stateOf(p) === "unclaimed");
    const needs = [...off, ...never, ...free];
    const kpis = el("div.pn-kpis", {},
      kpi(needs.length ? "warn" : "ok", K.t("panels.state.online"), `${on.length}`, K.t("panels.kpi.ofAll", { n: all.length })),
      kpi(needs.length ? "bad" : "", K.t("panels.kpi.needs"), `${needs.length}`, needs.length > 2 ? K.t("panels.kpi.needsMore", { names: needs.slice(0, 2).map((p) => p.name).join(", "), n: needs.length - 2 })
        : needs.length ? needs.map((p) => p.name).join(", ") : K.t("panels.kpi.allIn")),
      kpi("", K.t("panels.kpi.avgLoad"), loads.length ? `${Math.round(loads.reduce((n, [, l]) => n + l.pct, 0) / loads.length)} %` : "—", loads.length ? K.t("panels.kpi.ofSmooth") : K.t("panels.kpi.notBenched")),
      kpi("", K.t("panels.kpi.benched"), `${benched.length}`, benched.length ? K.t("panels.kpi.lastBench", { name: benched[0][0].name, date: day(benched[0][1].at) }) : K.t("panels.kpi.ofPanels", { n: all.length })));
    const counts = { all: all.length, online: on.length, offline: off.length, never: never.length, unclaimed: free.length };
    if (filt.st === "unclaimed" && !free.length) filt.st = "all";
    const fseg = el("div.seg.pn-fseg", { role: "group", "aria-label": K.t("panels.filter.label") }, [["all", K.t("panels.filter.all")], ["online", K.t("panels.state.online")], ["offline", K.t("panels.state.offline")], ["never", K.t("panels.state.never")],
      ...(free.length ? [["unclaimed", K.t("panels.state.unclaimed")]] : [])].map(([k, n]) =>
      el("button" + (filt.st === k ? ".on" : ""), { type: "button", "aria-pressed": String(filt.st === k), onclick: () => { filt.st = k; drawStatus(); } }, n, el("span.n", {}, String(counts[k])))));
    const q = el("input.pn-q", { type: "search", placeholder: K.t("panels.find.ph"), value: filt.q, "aria-label": K.t("panels.find.label"), "data-fk": "pn-q",
      oninput: (e) => { filt.q = e.target.value; drawWall(); } });
    const wall = el("div.pn-wall");
    const drawWall = () => {
      const qq = filt.q.trim().toLowerCase();
      const hits = all.filter((p) => (filt.st === "all" || stateOf(p) === filt.st) && (!qq || `${p.name} ${p.address} ${p.id}`.toLowerCase().includes(qq)));
      wall.replaceChildren(...[...hits.map((p) => tile(p, maps.get(p.id))),   // (replaceChildren would write a null as "null")
        hits.length ? null : el("div.pn-none", {}, K.t(qq ? (filt.st !== "all" ? "panels.find.noneQFilter" : "panels.find.noneQ") : filt.st !== "all" ? "panels.find.noneFilter" : "panels.find.none", { q: filt.q.trim() })),
        M.isAdmin() && filt.st === "all" && !qq ? el("button.pn-addt", { type: "button", onclick: () => addPanel() }, el("span.ei", {}, ic("plus", 20)), el("b", {}, K.t("panels.add.title")),
          el("span", {}, K.t("panels.add.tileHint"))) : null].filter(Boolean));
    };
    drawWall();
    frame(kpis, el("div.pn-tools", {}, fseg, el("label.pn-qbox", {}, ic("search", 15), q), el("span.sp"),
      el("small.pn-cnt", {}, K.t("panels.count.checked", { n: all.length, ago: ago(listAt / 1000) }))), wall);
  }
  function tile(p, map) {
    const st = stateOf(p), s = p.status || {}, l = loadOf(p, map), mayEdit = M.can("panels", p.id);
    const nv = st === "never" || (st === "unclaimed" && !s.lastSeen);   // (v3.0.2: no tablet has checked in for it yet)
    const thumb = el("button.pn-thumb", { type: "button", "aria-label": K.t("panels.tile.openSettings", { name: p.name }), onclick: () => openSetup(p.id), style: `background:${mapBg(map)}` },
      drawMap(map, p.perf, K.t("panels.map.labelOf", { name: p.name })),
      el("span.pn-tag", {}, el("span.dot" + (DOT[st] ? `.${DOT[st]}` : "")), p.address),
      st === "unclaimed" ? el("span.pn-over", {}, el("b", {}, K.t("panels.state.unclaimed")), M.graceUntil && M.graceUntil(p) ? K.t("panels.tile.graceHint", { time: M.graceUntil(p) }) : K.t("panels.tile.pairHint", { address: rootAddress() }))
        : st === "never" ? el("span.pn-over", {}, el("b", {}, K.t("panels.state.never")), K.t("panels.tile.finishSetup", { address: address(p) }))
        : st === "offline" ? el("span.pn-over.off", {}, el("b", {}, K.t("panels.state.offline")), s.page ? K.t("panels.tile.lastSeenOn", { ago: ago(s.lastSeen), page: s.page }) : K.t("panels.tile.lastSeen", { ago: ago(s.lastSeen) })) : null);
    return el(`article.pn-tile.st-${st}` + (p.id === cur ? ".cur" : ""), { "data-id": p.id },
      thumb,
      el("div.pn-ft", {}, el("div.pn-nm", {}, el("b", {}, p.name), el("small", { title: stateWords(p) }, stateWords(p))),
        el("div.pn-acts", {},
          el("button.btn.sm", { type: "button", "aria-label": K.t("panels.tile.setupLabel", { name: p.name }), "data-tip": K.t("panels.tile.setupTip"), onclick: () => openSetup(p.id) }, ic("settings", 14), el("span.bl", {}, K.t("panels.view.setup"))),
          mayEdit && !phone() ? el("button.btn.sm", { type: "button", "aria-label": K.t("panels.tile.layoutLabel", { name: p.name }), "data-tip": K.t("panels.tile.layoutTip"), onclick: () => openSetup(p.id, "look").then(() => openBuilder()) }, ic("layout", 14), el("span.bl", {}, K.t("panels.tile.layout"))) : null,
          el("button.btn.sm", { type: "button", "aria-label": K.t("panels.tile.liveLabel", { name: p.name }), "data-tip": M.isAdmin() ? K.t("panels.tile.liveTipAdmin") : K.t("panels.tile.liveTipView"), onclick: () => openLive(p) }, ic("window", 14), el("span.bl", {}, K.t("panels.tile.live"))))),
      el("div.pn-mt", {},
        el("div", {}, el("small", {}, K.t("panels.tile.load")), l && !(nv && !l.measured) ? el("b", { style: `color:${l.measured ? loadColour(l.pct) : "var(--t2)"}`, title: l.measured ? K.t("panels.tile.loadTip") : K.t("panels.tile.loadEstimate") }, `${l.measured ? "" : "≈ "}${l.pct} %`) : el("b", { title: nv ? K.t("panels.kv.notMeasured") : null }, nv ? K.t("panels.tile.notYet") : "—")),   // (v3.0.0: a panel never opened isn't measured)
        el("div", {}, el("small", {}, K.t("panels.tile.checkIn")), el("b", { title: nv ? "" : ago(s.lastSeen) }, nv ? K.t("panels.tile.never") : K.ago(s.lastSeen, "bare") || "—")),   // (how long, without "ago": its own words)
        el("div", {}, el("small", {}, K.t("panels.kv.screen")), el("b", { title: sizeWords(p, map) }, sizeShort(p, map))),
        el("div", {}, el("small", {}, K.t("panels.kv.version")), el("b", { title: s.version || "" }, s.version || "—"))));
  }
  // every 30 s while Status is open: the check-ins; (v3.0.2) Setup too — every 5 s while its panel never checked in
  // (just added: the tablet's first check-in shows without a refresh), redrawn only when that panel's state changed
  const polled = () => phone() || viewNow() === "status" || (viewNow() === "setup" && !!cur);
  // fn after the mouse / finger that's down now is lifted (its click done), at once when none is
  let down = false;
  document.addEventListener("pointerdown", () => { down = true; }, true);
  document.addEventListener("pointerup", () => setTimeout(() => { down = false; }), true);
  document.addEventListener("pointercancel", () => { down = false; }, true);
  const afterPress = (fn) => {
    if (!down) return setTimeout(fn);
    let done = false;
    const go = () => { if (done) return; done = true; document.removeEventListener("pointerup", go, true); document.removeEventListener("pointercancel", go, true); setTimeout(fn, 30); };
    document.addEventListener("pointerup", go, true); document.addEventListener("pointercancel", go, true);
    setTimeout(go, 3000);
  };
  function poll() {
    clearTimeout(pollT);
    const setupNever = !phone() && viewNow() === "setup" && cur && ["never", "unclaimed"].includes(stateOf(shown(cur) || {}));
    pollT = setTimeout(async () => {
      if (!onPage() || !polled()) return;
      if (document.visibilityState === "hidden") return;   // (v2.8.0: a hidden tab asks nothing — visibilitychange starts it again)
      const busy = (document.activeElement && document.activeElement.classList.contains("pn-q") && filt.q) || (phone() && touching);
      const was = cur ? stateOf(shown(cur) || {}) : null;
      try { await loadList(true, true); } catch (e) { if (e.message === "login") return; }
      if (onPage() && polled() && !document.querySelector(".modal-bg, .pn-live") && !busy) {
        if (phone()) drawCarousel();
        else if (viewNow() === "status") drawStatus();
        else if (!builderUp() && stateOf(shown(cur) || {}) !== was) {   // (else a form being edited stays as it is)
          // (v3.0.2: a name being typed when the tablet checks in: drawn again once it leaves the field — never over the typing)
          const a = document.activeElement, pid = cur;
          // (v3.0.2: and only after the press that left it — a click on Save must land on Save, not on a bar drawn anew)
          if (a && a.closest(".pn-setup") && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && /^(text|search|number|email|url|tel|password)$/.test(a.type))))
            a.addEventListener("blur", () => afterPress(() => { if (onPage() && viewNow() === "setup" && cur === pid && !builderUp() && !document.querySelector(".modal-bg, .pn-live")) drawSetup(); }), { once: true });
          else drawSetup();
        }
      }
      poll();
    }, setupNever ? 5000 : 30000);
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && onPage() && polled()) poll(); });

  // ================================================================== the phone: the carousel (v2.8.0; V280-PLAN.md §5)
  // One card a screen (the next one peeking), each the panel's drawn map — the same drawing as Status (decision 3,
  //) — with its name and state; a swipe, the dots or ‹ › change panels, and the address follows (#panels/<id>).
  // Under it: the selected panel's details, its address to copy, and Open live (full screen; the admin may switch
  // things there, the others look —). Setup and the builder stay on a computer.
  let selP = null, touching = false;
  const STATE_WORD = { online: K.t("panels.state.onlineLow"), offline: K.t("panels.state.offlineLow"), never: K.t("panels.state.neverLow"), unclaimed: K.t("panels.state.unclaimedLow") };
  function showCarousel(rest) {
    if (!list.length) { frame(empty()); return; }
    const views = ["status", "setup"];
    let id = rest[0] && !views.includes(rest[0]) ? String(rest[0]).toLowerCase() : rest[0] === "setup" && rest[1] ? String(rest[1]).toLowerCase() : null;
    if (id && !shown(id)) { toast(K.t("panels.route.notThere"), true); id = null; }
    if (rest[1] === "layout" && id) toast(K.t("panels.carousel.noBuilder"));
    selP = id || (selP && shown(selP) ? selP : list[0].id);
    drawCarousel();
    poll();
  }
  function drawCarousel() {
    if (!list || S.route().page !== "panels") return;
    if (!list.length) { frame(empty()); return; }
    if (!shown(selP)) selP = list[0].id;
    let idx = Math.max(0, list.findIndex((p) => p.id === selP));
    const track = el("ul.pnc-track", { "aria-roledescription": "carousel", "aria-label": K.t("panels.shared.aboutpanels"), tabindex: "0" }, list.map((p, n) => {
      const map = p.map || mapOf({}), st = stateOf(p);
      return el("li.pnc-card", { "aria-roledescription": "slide", "aria-label": K.t("panels.carousel.slide", { name: p.name, state: STATE_WORD[st], n: n + 1, total: list.length }), "data-id": p.id },
        el("div.pnc-map", { style: `background:${mapBg(map)}` }, drawMap(map, p.perf, K.t("panels.map.labelOf", { name: p.name }))),
        el("div.pnc-ft", {}, el("b", {}, p.name), el("span.pill" + (st === "online" ? "" : st === "offline" ? ".bad" : ".idle"), {},
          el("span.dot" + (DOT[st] ? `.${DOT[st]}` : "")), stName(st))));
    }));
    const dots = el("div.pnc-dots", { role: "group", "aria-label": K.t("panels.carousel.pick") }, list.map((p, n) =>
      el("button", { type: "button", "aria-label": K.t("panels.carousel.show", { name: p.name }), onclick: () => go(n, true) }, el("i"))));
    const prev = el("button.ib", { type: "button", "aria-label": K.t("panels.carousel.prev"), onclick: () => go(idx - 1, true) }, ic("chevL", 20));
    const next = el("button.ib", { type: "button", "aria-label": K.t("panels.carousel.next"), onclick: () => go(idx + 1, true) }, ic("chevR", 20));
    const det = el("section.card.pnc-det", { "aria-live": "polite" });
    const nav = list.length > 1 ? el("div.pnc-nav", {}, prev, dots, next) : null;
    frame(el("div.pnc", {}, track), nav,
      el("p.pnc-note", {}, K.t("panels.carousel.note")), det);
    function upd() {
      const p = list[idx]; selP = p.id;
      [...dots.children].forEach((b, n) => b.setAttribute("aria-current", String(n === idx)));
      prev.disabled = idx === 0; next.disabled = idx === list.length - 1;
      det.replaceChildren(...details(p));
      if (M.routeSync) M.routeSync([p.id], p.name);
    }
    const left = (n) => { const c = track.children[n]; return c ? c.offsetLeft - (track.clientWidth - c.offsetWidth) / 2 : 0; };
    function go(n, scroll) {
      n = Math.max(0, Math.min(list.length - 1, n));
      if (n !== idx) { idx = n; upd(); }
      if (scroll) track.scrollTo({ left: left(n), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });   // i18n-ok (CSS)
    }
    let t = 0;
    track.addEventListener("scroll", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const mid = track.scrollLeft + track.clientWidth / 2;
        let best = 0, dist = Infinity;
        [...track.children].forEach((c, n) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < dist) { dist = d; best = n; } });
        go(best, false);
      }, 90);
    }, { passive: true });
    track.addEventListener("touchstart", () => { touching = true; }, { passive: true });
    for (const t2 of ["touchend", "touchcancel"]) track.addEventListener(t2, () => { touching = false; }, { passive: true });
    track.addEventListener("keydown", (e) => { const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (d) { e.preventDefault(); go(idx + d, true); } });
    upd();
    requestAnimationFrame(() => { track.scrollLeft = left(idx); });
  }
  function details(p) {
    const st = stateOf(p), s = p.status || {}, map = p.map || mapOf({}), bench = M.benchOf ? M.benchOf(p.perf) : null, pg = pageOf(map);
    const nv = st === "never" || (st === "unclaimed" && !s.lastSeen);
    const O = M.overview ? M.overview() : null;
    const waiting = O && O.alerts && Array.isArray(O.alerts.items) ? O.alerts.items.filter((a) => (a.panels || []).includes("all") || (a.panels || []).includes(p.name)).length : null;
    const kv = (k, v) => [el("span", {}, k), el("b", {}, v)];
    const copy = el("button.btn.sm", { type: "button", "aria-label": K.t("panels.copy.label", { address: address(p) }),
      onclick: async () => { if (await M.copyText(`${location.protocol}//${address(p)}`)) toast(K.t("panels.copy.done")); else toast(K.t("panels.copy.failed"), true); } }, ic("copy", 15), K.t("panels.copy.btn"));
    return [
      el("div.ps-kv", {},
        ...kv(K.t("panels.shared.status"), stateWords(p)),
        ...kv(K.t("panels.kv.lastCheckIn"), nv ? K.t("panels.shared.never") : K.when(s.lastSeen, "dayTime")),
        ...kv(K.t("panels.kv.screen"), sizeWords(p, map)),
        ...kv(K.t("panels.kv.showing"), s.page || "—"),
        ...kv(K.t("panels.kv.homePage"), pg.own ? K.t("panels.kv.ownCards", { n: pg.cards.length }) : (M.layoutPresets && (M.layoutPresets()[map.layout] || [])[0]) || K.t("panels.layout.classic")),
        ...(waiting == null ? [] : kv(K.t("panels.kv.alertsWaiting"), waiting ? K.t("panels.kv.alerts", { n: waiting }) : K.t("panels.none"))),
        ...kv(K.t("panels.kv.benchmark"), bench ? K.t("panels.kv.score", { score: `${bench.frameScore}${bench.capped ? "+" : ""}`, date: day(bench.at) }) : K.t("panels.kv.notRun")),
        ...kv(K.t("panels.kv.version"), s.version || "—")),
      el("div.pnc-addr", {}, el("code", {}, address(p)), copy),
      el("button.btn.pri.pnc-live", { type: "button", onclick: () => openLive(p) }, ic("window", 17), M.isAdmin() ? K.t("panels.carousel.liveAdmin") : K.t("panels.carousel.liveView")),
      el("p.pnc-comp", {}, ic("settings", 15), el("span", {}, K.t("panels.carousel.computer"))),
    ];
  }

  // Benchmark all: the online panels this login sees, one after another (each runs it itself; the numbers come back)
  async function benchAll() {
    const on = (list || []).filter((p) => stateOf(p) === "online");
    if (!on.length) return toast(K.t("panels.bench.noneOnline"), true);
    let mode = "thorough";   // (v2.9.2: Thorough by default — Quick still one tap away)
    const modes = el("div.seg", { role: "group", "aria-label": K.t("panels.bench.howLong") }, [["quick", K.t("panels.bench.quick")], ["thorough", K.t("panels.bench.thorough")]].map(([k, n]) =>
      el("button" + (k === mode ? ".on" : ""), { type: "button", onclick: (e) => { mode = k; for (const b of e.currentTarget.parentNode.children) b.classList.toggle("on", b === e.currentTarget); } }, n)));
    const ok = await ask({ title: K.t("panels.bench.askTitle", { n: on.length }), yes: K.t("panels.bench.start"),
      text: K.t("panels.bench.askText", { names: on.map((p) => p.name).join(", ") }),
      extra: el("div.pn-ask-opt", {}, modes) });
    if (!ok) return;
    let started = 0, why = "";
    for (const p of on) {
      try {
        const r = await api(`/api/manage/panels/${encodeURIComponent(p.id)}`, { action: "bench", mode });
        if (r.ok) started++; else why = r.error || why;
      } catch (e) { if (e.message === "login") return; why = K.t("panels.save.offline"); }
    }
    if (started) toast(K.t("panels.bench.started", { n: started }));
    if (started < on.length) toast(started ? K.t("panels.bench.notStarted", { count: on.length - started, why }) : why || K.t("panels.bench.couldntStart"), true);
  }

  // Add a panel (the admin), v3.0.0: ONE field — its name ("Kitchen panel"); the web address is made from it
  // (panelSlug: "kitchen", unique), shown live. "Change the web address" shows that field for another one; a typed IP
  // address or URL (the tablet's — Skypane doesn't need it) gets a friendly hint, never the bare rule.
  // slug>
  function panelSlug(name, taken) {
    let s = String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const words = s.split("-").filter(Boolean);
    while (words.length > 1 && /^(panel|tablet|screen|dashboard)$/.test(words[words.length - 1])) words.pop();   // i18n-ok (words dropped from an address)
    s = words.join("-").replace(/^[^a-z]+/, "") || "panel";   // i18n-ok (the fallback address)
    if (/^(manager|api$|manage$|admin$|connect$)/.test(s)) s = `panel-${s}`;   // i18n-ok (kept for the pages / the Manager)
    s = s.slice(0, 32).replace(/-+$/, "");
    const used = new Set([...(taken || [])].map((x) => String(x).toLowerCase()).concat("main"));   // (v3.0.2: no main panel any more, but the server still keeps its address back — LEGACY_MAIN)
    if (!used.has(s)) return s;
    for (let n = 2; ; n++) { const t = `${s.slice(0, 31 - String(n).length).replace(/-+$/, "")}-${n}`; if (!used.has(t)) return t; }
  }
  const looksLikeAddress = (v) => /:\/\/|^\s*www\.|^\s*\d{1,3}(\.\d{1,3}){1,3}(:\d+)?\s*$|^\s*\[?[0-9a-f]*:[0-9a-f:]+\]?\s*$/i.test(v);
  // <slug
  M.panelSlug = (name) => panelSlug(name, (list || []).flatMap((p) => [p.id, String(p.address || "").slice(1)]));   // (pairing.js: "Creates a new panel at /…")
  async function addPanel() {
    if (!M.isAdmin()) return;
    const taken = (list || []).flatMap((p) => [p.id, String(p.address || "").slice(1)]);   // (a moved panel's /admin-panel too)
    const nameIn = el("input", { type: "text", placeholder: K.t("panels.add.namePh"), maxlength: "40", "aria-label": K.t("panels.add.panelName"), id: "pn-add-name" });
    const idIn = el("input", { type: "text", placeholder: K.t("panels.add.idPh"), maxlength: "32", autocapitalize: "none", spellcheck: "false", "aria-label": K.t("panels.add.address"), id: "pn-add-id" });
    const base = `${location.protocol}//${location.host}/`;
    const preview = el("p.pn-hint.pn-add-url", { "aria-live": "polite" });
    const nameHint = el("small.pn-hint.warn", { hidden: true }, K.t("panels.add.nameLooksLikeAddress"));
    const idHint = el("small.pn-hint", {}, K.t("panels.add.hint"));
    const idRow = el("div.pn-add-idrow", { hidden: true }, el("label.pn-fld", { for: "pn-add-id" }, el("b", {}, K.t("panels.add.address")), idIn), idHint);
    let own = false;   // (the web address typed by hand: it no longer follows the name)
    const change = el("button.linkish", { type: "button", onclick: () => { idRow.hidden = false; change.hidden = true; if (!idIn.value) idIn.value = slug(); idIn.focus(); idIn.select(); } }, K.t("panels.add.change"));
    const slug = () => panelSlug(nameIn.value, taken);
    // → true when what's typed is an address, not a name (nothing is sent then)
    const paint = () => {
      const nAddr = looksLikeAddress(nameIn.value), v = idIn.value.trim(), iAddr = own && /[.:/\\]/.test(v);
      // (an IP typed into the name: the address made from the last real name stays — never back to the placeholder)
      if (!own && !nAddr) idIn.value = nameIn.value.trim() ? slug() : "";
      nameHint.hidden = !nAddr;
      idHint.textContent = iAddr ? K.t("panels.add.looksLikeAddress") : K.t("panels.add.hint");
      idHint.classList.toggle("warn", iAddr);
      const id = idIn.value.trim().toLowerCase();
      preview.textContent = iAddr ? K.t("panels.add.fixBelow") : id ? K.t("panels.add.page", { url: base + id }) : K.t("panels.add.pageThen", { url: `${base}kitchen` });
      return nAddr || iAddr;
    };
    nameIn.addEventListener("input", paint);
    idIn.addEventListener("input", () => { own = true; paint(); });
    paint();
    let close = null;
    const go = el("button.btn.pri", { type: "submit" }, K.t("panels.add.short"));
    const form = el("form.modal.small.pn-ask", { role: "dialog", "aria-labelledby": "pn-add-h", onsubmit: async (e) => {
      e.preventDefault();
      if (paint()) {   // (not sent — said where it shows and as a toast, so the press is never "nothing happened")
        const box = nameHint.hidden ? idIn : nameIn, why = nameHint.hidden ? K.t("panels.add.looksLikeAddress") : K.t("panels.add.nameLooksLikeAddress");
        mark(box, why); toast(why, true); box.focus(); return;
      }
      const id = idIn.value.trim(), name = nameIn.value.trim();
      if (!id) { nameIn.focus(); return; }
      go.disabled = true;
      try {
        // (v3.0.2: an unclaimed panel — no tablet yet; the address as typed or made from the name)
        const r = await api("/api/manage/panels", { action: "add", name: name || id, address: id });
        if (!r.ok) {
          const why = r.error === "exists" ? K.t("panels.add.exists") : r.error === "name-taken" ? K.t("panels.add.nameTaken") : r.error || K.t("panels.add.notAdded");
          idRow.hidden = false; change.hidden = true; mark(idIn, why); return toast(why, true);
        }
        toast(r.id && r.id !== id ? K.t("panels.add.savedAsPair", { id: r.id, url: rootAddress() }) : K.t("panels.add.addedPair", { url: rootAddress() }));
        close();
        await loadList(true);
        await openSetup(r.id, "general");
      } catch (e2) { if (e2.message !== "login") toast(K.t("panels.save.offline"), true); } finally { go.disabled = false; }
    } }, el("h2", { id: "pn-add-h" }, K.t("panels.add.title")),
      el("label.pn-fld", { for: "pn-add-name" }, el("b", {}, K.t("panels.add.panelName")), nameIn), preview, nameHint, change, idRow,
      el("small.pn-hint", {}, K.t("panels.add.blank")),
      el("div.pn-ask-acts", {}, el("button.btn", { type: "button", onclick: () => close() }, K.t("control.cancel")), go));
    const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) close(); } }, form);
    close = M.dialog(shade, nameIn);
  }

  // ================================================================== Setup
  async function openSetup(id, t) {
    if (!id) return showStatus();
    if (id !== cur && !(await leavePending())) return drawSetup();   // (v3.0.2: another panel — its changes waiting first)
    if (t) tab = t;
    let d;
    try { d = await loadPanel(id); } catch { return; }
    if (S.route().page !== "panels") return;
    if (!d) {   // (removed meanwhile, or this login may not see it any more)
      toast(K.t("panels.setup.gone"), true);
      if (pendPid === id) dropPending();
      await M.meAgain();
      if (!M.can("panels")) return M.go("panels");
      try { await loadList(true); } catch { return; }
      return showStatus();
    }
    try { await M.loadDevices(); } catch { /* (the pickers work without the house's devices) */ }
    if (builderUp()) return;   // (the builder opened meanwhile — a second render started by the view switch: leave it and its address be)
    cur = id; data = d;
    if (S.view("panels") !== "setup" && !phone()) S.setView("panels", "setup", false);
    drawSetup();
    if (phone()) clearTimeout(pollT); else poll();   // (v3.0.2: was clearTimeout — a tablet's first check-in showed only after a refresh; a phone's poll redraws the carousel)
  }
  function drawSetup() {
    if (!data || !onPage()) return;
    const p = shown(cur) || { id: cur, name: cur, address: `/${cur}`, status: {}, perf: data.perf };
    const name = data.managed.panelName || p.name;
    if (!TABS.some(([k]) => k === tab)) tab = "general";
    const mayEdit = M.can("panels", cur), admin = M.isAdmin();
    const body = { general, look, rooms, cameras, people, alerts, safety, guest, effects }[tab](p);
    const adminTab = tab === "alerts" || tab === "safety";
    if (!mayEdit || (adminTab && !admin)) for (const x of body.querySelectorAll("input, select, textarea, button:not([data-ro-ok])")) x.disabled = true;
    else if (!admin) for (const x of body.querySelectorAll("[data-key]")) if (ADMIN_KEYS.has(x.dataset.key)) { x.disabled = true; x.title = K.t("panels.save.adminOnly"); }
    const st = stateOf(p);
    const tabs = el("div.pn-tabs", { role: "tablist", "aria-label": K.t("panels.setup.tabsLabel") }, TABS.map(([k, n, i]) =>
      el("button" + (k === tab ? ".on" : ""), { type: "button", role: "tab", "aria-selected": String(k === tab), "data-tab": k,
        onclick: () => { tab = k; drawSetup(); const b = M.$main.querySelector(`.pn-tabs [data-tab="${k}"]`); if (b) b.focus({ preventScroll: true }); } }, ic(i, 15), n)));
    tabs.addEventListener("keydown", (e) => {   // (← → between the tabs)
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!d) return;
      const i = TABS.findIndex(([k]) => k === tab); tab = TABS[(i + d + TABS.length) % TABS.length][0]; e.preventDefault(); drawSetup();
      const b = M.$main.querySelector(`.pn-tabs [data-tab="${tab}"]`); if (b) b.focus();
    });
    const copy = el("button.pn-copy", { type: "button", "aria-label": K.t("panels.copy.label", { address: address(p) }), "data-tip": K.t("panels.copy.tip"),
      onclick: async () => { if (await M.copyText(`${location.protocol}//${address(p)}`)) toast(K.t("panels.copy.done")); else toast(K.t("panels.copy.failed"), true); } },
    address(p), ic("copy", 13));
    const head = el("div.pn-head", {},
      el("h2", {}, name), el("span.pill" + (st === "online" ? "" : st === "offline" ? ".bad" : ".idle"), {}, el("span.dot" + (DOT[st] ? `.${DOT[st]}` : "")), stateWords(p)),
      el("span.sp"),
      phone() ? null : el("button.btn", { type: "button", "aria-label": K.t("panels.openLive"), "data-tip": admin ? K.t("panels.setup.liveTipAdmin") : K.t("panels.setup.liveTipView"), onclick: () => openLive(p) },
        ic("window", 15), el("span.bl", {}, K.t("panels.openLive"))),
      mayEdit && !phone() ? el("button.btn.pri", { type: "button", onclick: () => { tab = "look"; openBuilder(); } }, ic("layout", 15), el("span.bl", {}, K.t("panels.setup.editLayout"))) : null);
    const notes = [];
    if (!mayEdit) notes.push(el("p.pn-note", {}, ic("lock", 15), K.t("panels.setup.noteReadOnly")));
    else if (adminTab && !admin) notes.push(el("p.pn-note", {}, ic("lock", 15), tab === "alerts" ? K.t("panels.setup.noteAlerts")
      : K.t("panels.setup.noteSafety")));
    const ptop = el("div.pn-top", {}, phone() ? el("button.btn.sm.ghost.pn-back", { type: "button", onclick: () => showStatus() }, ic("chevL", 14), K.t("panels.setup.allPanels")) : null, head, el("div.pn-addr", {}, el("span", {}, K.t("panels.add.address")), copy));
    const main = el("div.pn-main", {}, marker, tabs, ...notes, el("div.pn-body", { role: "tabpanel", "aria-label": TABS.find(([k]) => k === tab)[1] }, body));
    const plist = phone() ? null : el("nav.pn-list", { "aria-label": K.t("panels.shared.aboutpanels") }, el("div.gh", {}, K.t("panels.shared.aboutpanels"), el("span.r", {}, K.t("panels.list.online", { n: list.filter((x) => stateOf(x) === "online").length, total: list.length }))),
      el("div.grp", {}, list.map((x) => el("button.pn-li" + (x.id === cur ? ".cur" : ""), { type: "button", "aria-current": x.id === cur ? "true" : null, "data-fk": `pn-li:${x.id}`,
        onclick: () => openSetup(x.id) }, el("span.th", { style: `background:${mapBg(x.id === cur ? mapOf(view()) : x.map || mapOf({}))}` }, drawMap(x.id === cur ? mapOf(view()) : x.map || mapOf({}), x.perf, "")),
        el("span.tx", {}, el("b", {}, x.id === cur ? name : x.name), el("small", {}, el("span.dot" + (DOT[stateOf(x)] ? `.${DOT[stateOf(x)]}` : "")), stName(stateOf(x))))))));
    // (v3.0.2) data-unsaved + the marker: leaving with changes waiting asks; the bar sticks to the bottom — a phone's too
    // (Add a panel opens Setup there: its changes wait for Save as anywhere, and the leave question names that button)
    frame(el("div.pn-setup", { "data-unsaved": K.t("panels.bar.unsavedName", { name }), "data-save": K.t("panels.bar.save") }, plist, ptop, main, aside(p, name)), bar);
    drawBar();
    if (M.routeSync && !builderUp()) M.routeSync(["setup", cur, tab], name);   // (the builder open over it: its own address stays — #panels/<id>/layout)
  }
  // beside the settings: the map (as saved now — it follows each change) and the panel's status
  function aside(p, name) {
    const map = mapOf(view()), st = stateOf(p), s = p.status || {}, l = loadOf({ ...p, perf: data.perf }, map, { views: data.views });
    const nv = st === "never" || (st === "unclaimed" && !s.lastSeen);
    const meas = (data.perf || []).find((x) => x.vw && x.vh), bench = M.benchOf ? M.benchOf(data.perf) : null;
    const pg = pageOf(map);
    const kv = (k, v, style) => [el("span", {}, k), el("b", style ? { style } : {}, v)];
    return el("aside.pn-aside", {},
      el("section.card.flush.pn-prev", {}, el("h3.ch", {}, K.t("panels.prev.title"), el("small", {}, meas ? `${meas.vw} × ${meas.vh}` : "1280 × 800")),
        el("div.pn-prevbox", { style: `background:${mapBg(map)}` }, drawMap(map, data.perf, K.t("panels.map.labelOf", { name })),
          st === "unclaimed" ? el("span.pn-over", {}, el("b", {}, K.t("panels.prev.waiting")), K.t("panels.prev.finishSetup", { address: rootAddress() }))
          : nv ? el("span.pn-over", {}, el("b", {}, K.t("panels.prev.waiting")), K.t("panels.prev.pairedWaiting")) : null),   // (v3.0.2: approved, not opened yet)
        el("div.pn-prevft", {}, el("small", {}, pg.own ? K.t("panels.prev.own") : K.t("panels.prev.builtIn")),
          el("button.btn.sm", { type: "button", "data-ro-ok": "", onclick: () => openLive(p) }, ic("window", 14), K.t("panels.openLive")))),
      el("section.card.flush", {}, el("h3.ch", {}, K.t("panels.shared.status")),
        el("div.pn-kv", {},
          ...kv(K.t("panels.kv.lastCheckIn"), nv ? K.t("panels.shared.never") : ago(s.lastSeen)),
          ...kv(K.t("panels.kv.showing"), s.page || "—"),
          ...kv(K.t("panels.kv.version"), s.version || "—"),
          ...kv(K.t("panels.kv.screen"), meas ? `${meas.vw} × ${meas.vh}` : K.t("panels.kv.notMeasured")),
          ...kv(pg.own ? K.t("panels.kv.cardsOnHome") : K.t("panels.kv.homePage"), pg.own ? String(pg.cards.length) : (M.layoutPresets && (M.layoutPresets()[map.layout] || [])[0]) || K.t("panels.layout.classic")),
          ...kv(K.t("panels.kv.drawingLoad"), nv && !(l && l.measured) ? K.t("panels.kv.notMeasured") : l ? K.t(l.measured ? "panels.kv.loadPct" : "panels.kv.loadPctEst", { pct: l.pct }) : "—", l && l.measured ? `color:${loadColour(l.pct)}` : ""),
          ...kv(K.t("panels.kv.benchmark"), bench ? K.t("panels.kv.scoreLow", { score: `${bench.frameScore}${bench.capped ? "+" : ""}`, date: day(bench.at) }) : K.t("panels.kv.notRun")))),
      // (v3.0.2) its tablet: the device, last IP, paired; Unlink / Move / Rename / Re-trust — actions, at once (pairing.js)
      M.panelDevice ? M.panelDevice(p) : null);
  }

  // ---------- the controls (each has data-key = the setting it changes: the admin's are locked for the others) ----------
  const keyed = (n, key) => { if (key) n.dataset.key = key; return n; };
  const text = (key, value, opts = {}) => keyed(el("input", { type: "text", value: value || "", maxlength: String(opts.max || 40), placeholder: opts.ph || "",
    autocapitalize: opts.lower ? "none" : null, spellcheck: opts.lower ? "false" : null, "aria-label": opts.label || null, "data-fk": `pn:${key}`,
    onchange: opts.onchange || ((e) => { const v = opts.lower ? e.target.value.trim().toLowerCase() : e.target.value.trim(); keep({ [key]: v }); }) }), key);
  const select = (key, opts, curv, pick, label) => keyed(el("select", { "aria-label": label || null, "data-fk": `pn:${key}`, onchange: (e) => pick(e.target.value, e.target) },
    opts.map(([v, l]) => (Array.isArray(l) ? el("optgroup", { label: v }, l.map(([v2, l2]) => el("option", { value: String(v2), selected: String(curv) === String(v2) }, l2)))
      : el("option", { value: String(v), selected: String(curv) === String(v) }, l)))), key);
  const seg = (key, opts, curv, pick, label) => keyed(el("div.seg", { role: "group", "aria-label": label || null }, opts.map(([v, l]) =>
    keyed(el("button" + (String(curv) === String(v) ? ".on" : ""), { type: "button", "aria-pressed": String(String(curv) === String(v)), onclick: () => pick(v) }, l), key))), key);
  const swi = (key, on, pick, label) => keyed(K.sw(on, pick, label), key);
  const R = (label, hint, control, attrs) => K.row(label, hint, control, attrs);
  const G = (title, rows, foot) => K.group(title, rows.filter(Boolean), foot);
  const block = (...kids) => el("div.pn-block", {}, ...kids);
  const warn = (t) => el("p.pn-warn", {}, ic("alert", 15), t);
  const info = (t) => el("p.pn-info", {}, t);

  // ================================================================== General
  function general(p) {
    const g = view();
    const url = rootAddress();   // (v3.0.2: a tablet starts at the Skypane address and is approved by its code)
    const secs = (n) => K.t("panels.time.seconds", { n }), mins = (n) => K.t("panels.time.minutes", { n });
    const HOME_AFTER = [[0, K.t("panels.shared.never")], [30, secs(30)], [60, mins(1)], [120, mins(2)], [300, mins(5)], [600, mins(10)], [1800, mins(30)]];
    const ha = +g.homeAfter || 0;
    return el("div", {},
      ...G("Panel", [
        R(K.t("panels.add.name"), K.t("panels.gen.nameHint"), text("panelName", g.panelName || p.name, { label: K.t("panels.add.name") })),
        // (v3.0.0) the panel's own language (settings.language → PANEL_LANG); one language so far: said in words
        R(K.t("panels.gen.language"), K.t("panels.gen.languageHint"), (data.languages || ["en"]).length > 1
          ? select("language", data.languages.map((c) => [c, K.t(`lang.${c}`)]), g.language || "en", (v) => keep({ language: v }), K.t("panels.gen.language"))
          : el("span.ac-lang", {}, el("b", {}, K.t("lang.en")), " " + K.t("account.lang.more"))),
        // (v3.0.0) how this panel shows the weather: settings.units {temp, wind} (unset: °F and mph, as the panel does)
        R(K.t("panels.gen.unitTemp"), K.t("panels.gen.unitTempHint"), select("units.temp", [["F", K.t("panels.gen.unitF")], ["C", K.t("panels.gen.unitC")]],
          g["units.temp"] || "F", (v) => keep({ "units.temp": v }), K.t("panels.gen.unitTemp"))),
        R(K.t("panels.gen.unitWind"), K.t("panels.gen.unitWindHint"), select("units.wind", [["mph", K.t("panels.gen.unitMph")], ["km/h", K.t("panels.gen.unitKmh")]],
          g["units.wind"] || "mph", (v) => keep({ "units.wind": v }), K.t("panels.gen.unitWind"))),
        R(K.t("panels.gen.kiosk"), K.t("panels.gen.kioskHint"),
          text("kioskName", g.kioskName || p.kiosk, { lower: true, label: K.t("panels.gen.kiosk") })),
        R(K.t("panels.gen.music"), K.t("panels.gen.musicHint"), text("music.url", g["music.url"], { max: 300, ph: "http://…", label: K.t("panels.gen.music") })),
      ]),
      ...G(K.t("panels.gen.thisTablet"), [
        R(K.t("panels.gen.led"), K.t("panels.gen.ledHint"),
          swi("ledStrip", g.ledStrip === true, (on) => keep({ ledStrip: on }), K.t("panels.gen.led"))),   // (v3.0.2: unset = off, as the panel reads it — settings.js; was shown on)
        R(K.t("panels.gen.inside"), K.t("panels.gen.insideHint"), insideSel(g)),
        R(K.t("panels.gen.homeAfter"), K.t("panels.gen.homeAfterHint"),
          select("homeAfter", HOME_AFTER.concat(HOME_AFTER.some(([v]) => v === ha) ? [] : [[ha, secs(ha)]]), ha, (v) => keep({ homeAfter: +v }), K.t("panels.gen.homeAfter"))),
        R(K.t("panels.gen.arrange"), K.t("panels.gen.arrangeHint"),
          swi("arrangeOnPanel", g.arrangeOnPanel === true, (on) => keep({ arrangeOnPanel: on }), K.t("panels.gen.arrange"))),
        // (v3.0.3) a soft tick on the PIN pad's keys, the version in the corner (unset = on, as the panel reads them — settings.js)
        R(K.t("panels.gen.pinSound"), K.t("panels.gen.pinSoundHint"),
          swi("pinSound", g.pinSound !== false, (on) => keep({ pinSound: on }), K.t("panels.gen.pinSound"))),
        R(K.t("panels.gen.showVersion"), K.t("panels.gen.showVersionHint"),
          swi("showVersion", g.showVersion !== false, (on) => keep({ showVersion: on }), K.t("panels.gen.showVersion"))),
        R(K.t("panels.gen.goRtc"), K.t("panels.gen.goRtcHint"), text("cameras.go2rtc", g["cameras.go2rtc"], { max: 300, ph: K.t("panels.gen.goRtcPh"), label: K.t("panels.gen.goRtc") })),
      ], K.t("panels.gen.tabletFoot")),
      ...G(K.t("panels.gen.setUp"), [block(el("ol.pn-steps", {},
        el("li", {}, ...withEls("panels.gen.stepStart", { url: el("code", {}, url) })),
        el("li", {}, ...withEls("panels.gen.stepMqtt", { broker: el("code", {}, `${location.hostname}:1883`), name: el("code", {}, g.kioskName || p.kiosk) })),
        el("li", {}, K.t("panels.gen.stepOpen"))))]),
      !M.isAdmin() ? null :   // (v3.0.2: no built-in main panel — any panel may go, the last one too)
 el("div.pn-later", {}, ...G(K.t("panels.remove"), [R(K.t("panels.gen.removeRow"), K.t("panels.gen.removeHint"),
        el("button.btn.pn-danger", { type: "button", onclick: async () => {
          if (!(await ask({ title: K.t("panels.gen.removeAsk", { name: p.name }), text: K.t("panels.gen.removeText", { address: address(p) }), yes: K.t("panels.gen.removeYes"), danger: true }))) return;
          const r = await api("/api/manage/panels", { action: "remove", id: p.id }).catch(() => ({}));
          if (!r.ok) return toast(r.error || K.t("panels.gen.notRemoved"), true);
          toast(K.t("panels.gen.removed", { name: p.name }));
          dropPending(); cur = null; data = null; await loadList(true); showStatus();
        } }, ic("x", 15), K.t("panels.gen.removeBtn")))])));
  }
  // where the Home page's "Inside" temperature comes from: this tablet's sensors, a Hubitat sensor, or the thermostat
  function insideSel(g) {
    const D = M.devices && M.devices();
    const temps = ((D && D.devices) || []).filter((c) => ["climate", "thermostat", "outside-temp"].includes(c.is)).sort((a, b) => a.label.localeCompare(b.label));   // (what the panels get readings of)
    const now = g.insideSensor ?? "panel";
    return select("insideSensor", [["panel", K.t("panels.gen.insidePanel")], ["none", K.t("panels.gen.insideNone")],
      ...(temps.length ? [[K.t("panels.gen.insideHubitat"), temps.map((c) => [c.id, c.room ? K.t("panels.withDetail", { name: c.label, detail: c.room }) : c.label])]] : [])], now,
    (v) => keep({ insideSensor: /^\d+$/.test(v) ? +v : v }), K.t("panels.gen.inside"));
  }

  // ================================================================== Look & layout
  // (the tiny pictures' card names)
  const MP = { clock: K.t("panels.mini.clock"), weather: K.t("panels.mini.weather"), guest: K.t("panels.mini.guest"), calendar: K.t("panels.mini.calendar"),
    thermostat: K.t("panels.mini.thermostat"), locks: K.t("panels.mini.locks"), doors: K.t("panels.mini.doors"), temps: K.t("panels.mini.temps") };
  const HOME_LAYOUTS = [
    ["classic", K.t("panels.layout.classic"), K.t("panels.layout.classicDesc"), [["1.08", [MP.clock, MP.weather, MP.guest]], ["1", [MP.calendar]], [".95", [MP.thermostat, MP.locks, MP.doors]]], true],
    ["agenda", K.t("panels.layout.agenda"), K.t("panels.layout.agendaDesc"), [["1", [MP.calendar]], ["1.08", [MP.clock, MP.weather, MP.guest]], [".95", [MP.thermostat, MP.locks, MP.doors]]]],
    ["duo", K.t("panels.layout.duo"), K.t("panels.layout.duoDesc"), [["1.15", [MP.clock, MP.weather, MP.guest]], ["1", [MP.calendar, MP.temps, MP.locks, MP.doors]]]],
    ["security", K.t("panels.layout.security"), K.t("panels.layout.securityDesc"), [["1.08", [MP.clock, MP.locks, MP.doors]], ["1", [MP.calendar]], [".95", [MP.weather, MP.guest, MP.thermostat]]]],
    ["minimal", K.t("panels.layout.minimal"), K.t("panels.layout.minimalDesc"), [["1", [MP.clock, MP.weather, MP.guest]]]],
  ];
  const ROOM_LAYOUTS = [["G", K.t("panels.roomLayout.cards"), K.t("panels.roomLayout.cardsDesc")], ["classic", K.t("panels.roomLayout.tiles"), K.t("panels.roomLayout.tilesDesc")],
    ["list", K.t("panels.roomLayout.list"), K.t("panels.roomLayout.listDesc")], ["custom", K.t("panels.roomLayout.own"), K.t("panels.roomLayout.ownDesc")]];
  // the room bar's styles (theme.css html.dock-style-*; the builder offers them too)
  const DOCK_STYLES = M.DOCK_STYLES = [["pill", K.t("panels.dock.pill"), K.t("panels.dock.pillDesc")],
    ["rail", K.t("panels.dock.rail"), K.t("panels.dock.railDesc")], ["segmented", K.t("panels.dock.segmented"), K.t("panels.dock.segmentedDesc")],
    ["tabs", K.t("panels.dock.tabs"), K.t("panels.dock.tabsDesc")], ["chips", K.t("panels.dock.chips"), K.t("panels.dock.chipsDesc")],
    ["split", K.t("panels.dock.split"), K.t("panels.dock.splitDesc")]];
  // (a tiny picture of a style on its edge: the bar, its buttons, the page on screen lit)
  const dockMini = (k, at, v = at === "left" || at === "right") => el(`span.dmini.dm-${k}.dm-${at}`, {}, (k === "split" ? (v ? [2, 2] : [3, 5]) : [v ? 4 : 7]).map((n, j, all) =>
    el("span.dbar", {}, Array.from({ length: n }, (_, i) => el("i" + (j === all.length - 1 && i === n - 2 ? ".c" : ""))))));
  const mini = (cols) => el("span.lmini", {}, cols.map(([w, parts]) => el("span.lcol", { style: `flex:${w}` }, parts.map((x) => el("i", {}, x)))));
  const pickTile = (on, onclick, ...kids) => el("button.pn-pick" + (on ? ".on" : ""), { type: "button", "aria-pressed": String(on), onclick }, ...kids);
  // (v3.0.2) the owner's own colour, after the 12: a rainbow button (the chosen colour once it's in use) → a hue slider
  // under it, the preview beside following the drag; saved on release (an arrow key: each step), the slider kept open
  const hueOf = (m) => (Number.isInteger(m["look.hue"]) && m["look.hue"] >= 0 && m["look.hue"] <= 359 ? m["look.hue"] : window.CUSTOM_HUE || 200);
  const hueBg = (h) => { const g = window.themeFromHue ? themeFromHue(h).grad : ["#a78bfa", "#7c3aed"]; return `linear-gradient(135deg,${g[0]},${g[1]})`; };   // i18n-ok (CSS)
  const RAINBOW = "conic-gradient(#f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";   // i18n-ok (CSS)
  const customSwatch = (on, h) => keyed(el("button.pn-hue" + (on ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(on), "aria-haspopup": "dialog",
    "aria-label": K.t("panels.look.custom"), "data-tip": K.t("panels.look.custom"), style: `background:${on ? hueBg(h) : RAINBOW}`,
    onclick: (e) => hueOpen(e.currentTarget) }), "look.theme");
  function hueOpen(anchor) {
    const pid = cur, h0 = hueOf(view()), wasOn = view()["look.theme"] === "custom";
    const swatch = el("i.hue-prev", { style: `background:${hueBg(h0)}` });
    const live = (h, on = true) => {   // (the button, the slider's thumb, the preview and this panel's map in the list)
      anchor.style.background = on ? hueBg(h) : RAINBOW; swatch.style.background = hueBg(h); range.style.setProperty("--thumb", window.hueColour ? hueColour(h) : "#8b5cf6");
      const map = mapOf(on ? { ...view(), "look.theme": "custom", "look.hue": h } : view());
      for (const box of M.$main.querySelectorAll(".pn-prevbox, .pn-li.cur .th")) {
        const old = box.querySelector("svg.pn-map"); box.style.background = mapBg(map);
        if (old) old.replaceWith(drawMap(map, data.perf, old.getAttribute("aria-label") || ""));
      }
    };
    const range = el("input.hue-range", { type: "range", min: "0", max: "359", step: "1", value: String(h0), "aria-label": K.t("panels.look.hue"),
      oninput: (e) => live(+e.target.value),
      onchange: async (e) => {
        const h = +e.target.value, focused = document.activeElement === e.target;
        await saveDraw({ "look.theme": "custom", "look.hue": h }, null, pid);
        const nb = pop.isConnected && pid === cur && M.$main.querySelector(".pn-swatches .pn-hue");
        if (nb) { hueOpen(nb); if (!focused) nb.focus({ preventScroll: true }); }   // (the redrawn button: the slider stays open)
      } });
    const pop = popover(anchor, el("b", {}, K.t("panels.look.custom")), el("div.hue-row", {}, swatch, range), el("small.muted", {}, K.t("panels.look.customHint")));
    pop.classList.add("pn-huepop");
    pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", K.t("panels.look.custom"));
    live(h0, wasOn);
    // (closed without a change — Esc, a click outside: the preview goes back to what is saved)
    new MutationObserver((_, ob) => { if (!pop.isConnected) { ob.disconnect(); if (pid === cur && view()["look.theme"] !== "custom" && anchor.isConnected) live(h0, false); } }).observe(document.body, { childList: true });
  }
  function look() {
    const m = view(), theme = m["look.theme"] || "purple", home = m.homeLayout || "classic", roomDef = m.roomLayout || "G";
    const per = m.roomLayouts || {}, dock = m.dockAt || "bottom";
    const dockStyle = DOCK_STYLES.some(([k]) => k === m.dockStyle) ? m.dockStyle : "pill", dockLabels = typeof m.dockLabels === "boolean" ? m.dockLabels : dockStyle !== "rail";
    const pick = (set) => saveDraw(set);
    const themes = Object.entries(window.THEMES || {});
    const ownN = (m.homeGrid && (m.homeGrid.cards || []).length) || 0, roomsN = Object.keys(m.roomGrids || {}).length;
    const noBuild = phone() ? K.t("panels.look.noBuild") : null;
    return el("div", {},
      noBuild ? el("div.phone-note", {}, ic("layout", 20), el("span", {}, noBuild)) : null,
      ...G(K.t("panels.look.theme"), [R(K.t("panels.shared.abouttheme"), theme === "custom" ? K.t("panels.look.custom") : ((window.THEMES || {})[theme] || {}).name || theme,
        keyed(el("div.pn-swatches", { role: "radiogroup", "aria-label": K.t("panels.look.theme") }, ...themes.map(([k, t]) => keyed(el("button" + (k === theme ? ".on" : ""), {
          type: "button", role: "radio", "aria-checked": String(k === theme), "aria-label": t.name, "data-tip": t.name, style: `background:linear-gradient(135deg,${t.grad[0]},${t.grad[1]})`,   // i18n-ok (CSS)
          onclick: () => pick({ "look.theme": k }) }), "look.theme")), customSwatch(theme === "custom", hueOf(m))), "look.theme"))],
      K.t("panels.look.themeFoot")),
      ...G(K.t("panels.kv.homePage"), [
        block(el("div.pn-picks.pn-homes", {}, HOME_LAYOUTS.map(([k, n, d, cols, built]) => keyed(pickTile(k === home, () => pick({ homeLayout: k }), mini(cols),
          el("b", {}, n, built ? el("small.pn-badge", {}, K.t("panels.look.builtIn")) : null), el("small", {}, d)), "homeLayout")))),
        R(K.t("panels.look.own"), ownN ? K.t("panels.look.ownHintN", { n: ownN }) : K.t("panels.look.ownHint"),
          el("div.pn-btns", {}, m.homeGrid && home !== "custom" ? keyed(el("button.btn.sm", { type: "button", onclick: () => pick({ homeLayout: "custom" }) }, K.t("panels.useIt")), "homeLayout") : null,
            home === "custom" ? el("span.pill.acc", {}, K.t("panels.inUse")) : null,
            el("button.btn.sm" + (home === "custom" ? ".pri" : ""), { type: "button", disabled: phone(), onclick: () => openBuilder() }, ic("layout", 14), m.homeGrid ? K.t("panels.edit") : K.t("panels.buildOne")))),
      ], K.t("panels.look.homeFoot")),
      ...G(K.t("panels.look.roomPages"), [
        R(K.t("panels.look.everyRoom"), K.t("panels.look.everyRoomHint"), seg("roomLayout", ROOM_LAYOUTS.map(([k, n]) => [k, n]), roomDef, (v) => pick({ roomLayout: v }), K.t("panels.look.everyRoom"))),
        R(K.t("panels.look.ownRooms"), roomsN ? K.t("panels.look.ownRoomsHintN", { n: roomsN }) : K.t("panels.look.ownRoomsHint"),
          el("button.btn.sm", { type: "button", disabled: phone(), onclick: () => roomBuild() }, ic("layout", 14), roomsN ? K.t("panels.edit") : K.t("panels.buildOne"))),
        // (v3.0.2: a room with its own page: its row opens that page in the builder straight away)
        ...data.rooms.map((r) => R(r.name, null, el("div.pn-btns", {}, select("roomLayouts", [["", K.t("panels.look.sameAsEvery")], ...ROOM_LAYOUTS.map(([k, n]) => [k, n])], per[r.id] || "",
          (v) => pick({ roomLayouts: { [r.id]: v } }), K.t("panels.look.roomPage", { name: r.name })),
          ownRoom(m, r.id) ? el("button.btn.sm", { type: "button", disabled: phone(), "aria-label": K.t("panels.roomBuild.editOwn", { room: r.name }),
            onclick: () => openBuilder({ room: true, key: r.id }) }, ic("layout", 14), K.t("panels.edit")) : null))),
      ], ROOM_LAYOUTS.map(([, n, d]) => K.t("panels.look.roomLayoutLine", { name: n, desc: d })).join(" · ")),
      ...skyGroup(m, pick),
      ...G(K.t("panels.look.roomBar"), [
        R(K.t("panels.look.showBar"), K.t("panels.look.showBarHint"), seg("dockOff", [["on", K.t("panels.show")], ["off", K.t("panels.hide")]], m.dockOff ? "off" : "on", (v) => pick({ dockOff: v === "off" }), K.t("panels.look.showBar"))),
        R(K.t("panels.look.where"), null, seg("dockAt", [["bottom", K.t("panels.look.bottom")], ["top", K.t("panels.look.top")], ["left", K.t("panels.look.left")], ["right", K.t("panels.look.right")]], dock, (v) => pick({ dockAt: v }), K.t("panels.look.whereLabel"))),
        block(el("div.pn-picks.pn-docks", {}, DOCK_STYLES.map(([k, n, d]) => keyed(pickTile(k === dockStyle, () => pick({ dockStyle: k, dockLabels: k !== "rail" }), dockMini(k, dock), el("b", {}, n), el("small", {}, d)), "dockStyle")))),
        R(K.t("panels.look.names"), K.t("panels.look.namesHint"), seg("dockLabels", [["on", K.t("panels.show")], ["off", K.t("panels.hide")]], dockLabels ? "on" : "off", (v) => pick({ dockLabels: v === "on" }), K.t("panels.look.names"))),
        R(K.t("panels.look.autoHide"), K.t("panels.look.autoHideHint"), seg("dockAutoHide", [["off", K.t("control.off")], ["on", K.t("control.on")]], m.dockAutoHide ? "on" : "off", (v) => pick({ dockAutoHide: v === "on" }), K.t("panels.look.autoHide"))),
      ], K.t("panels.look.dockFoot")));
  }
  // the background (built in, or the owner's own picture), the animated sky above it, its colours, where the effects go
  const BUILT_BG = (window.BACKGROUNDS || [{ id: "mountains", name: "Mountains" }]).map((b) => [b.id, b.name]);
  function skyGroup(m, pick) {
    const bg = m["look.background"] || "mountains", own = el("div.pn-bgs");
    const tile = (v, label, kid) => keyed(pickTile(v === bg, () => pick({ "look.background": v }), kid, el("small", {}, label)), "look.background");
    api("/api/manage/pictures").then((r) => {
      const ups = (r.uploads || []).filter((u) => u.style === "background");
      own.replaceChildren(...ups.map((u) => tile("up:" + u.id, u.name, K.scene("up:" + u.id))));
      own.hidden = !ups.length;
      if (!M.can("panels", cur)) for (const x of own.querySelectorAll("button")) x.disabled = true;
    }).catch(() => {});
    own.hidden = true;
    // (backgrounds.js renderBackground: our own drawing of the scene — never user text)
    const scene = (k) => K.scene(k);   // (kit.js: an own picture that fails to load shows the mountains — v2.6.0)
    return G(K.t("panels.sky.group"), [
      block(el("div.pn-bgs", {}, BUILT_BG.map(([k, n]) => tile(k, n, scene(k)))), own,
        el("small.pn-hint", {}, K.t("panels.sky.ownHint"))),
      R(K.t("panels.sky.sky"), K.t("panels.sky.skyHint"),
        select("look.sky", [["on", K.t("panels.sky.animated")], ["still", K.t("panels.sky.still")], ["off", K.t("panels.sky.none")]], m["look.sky"] || "on", (v) => pick({ "look.sky": v }), K.t("panels.sky.sky"))),
      R(K.t("panels.sky.colours"), null, seg("look.skyColors", [["theme", K.t("panels.sky.themes")], ["real", K.t("panels.sky.real")]], m["look.skyColors"] || "theme", (v) => pick({ "look.skyColors": v }), K.t("panels.sky.colours"))),
      R(K.t("panels.sky.fxHome"), K.t("panels.sky.fxHomeHint"),
        seg("effects.place", [["front", K.t("panels.sky.front")], ["behind", K.t("panels.sky.behind")]], m["effects.place"] || "front", (v) => pick({ "effects.place": v }), K.t("panels.sky.fxHome"))),
    ]);
  }

  // (v3.0.2) Room pages' Build one / Edit: it used to open every room's page with the first room on it — it looked like
  // that room was picked. Now first: which page (every room's, or one room's own) and from what (empty, or as it is now)
  const ownRoom = (m, k) => !!((m.roomGrids || {})[k] && Array.isArray(m.roomGrids[k].cards));
  async function roomBuild() {
    if (phone() || !data) return openBuilder({ room: true });
    const m = data.managed, rooms = data.rooms || [];
    const RP = (window.LayoutMaps || {}).ROOM_PRESETS || {}, builtIn = (RP.rclassic || [K.t("layoutmaps.room.classic")])[0];
    // (what the builder starts that page from: its own, else every room's own, else the built-in room layout)
    const nowName = (k) => (k !== "*" && ownRoom(m, k) ? K.t("panels.roomBuild.itsOwn") : ownRoom(m, "*") ? K.t("panels.roomBuild.everyOwn") : builtIn);
    const forSel = el("select", { "aria-label": K.t("panels.roomBuild.for"), onchange: () => { curT.textContent = K.t("panels.roomBuild.fromNow", { name: nowName(forSel.value) }); } },
      el("option", { value: "*" }, K.t("panels.roomBuild.every")),
      rooms.length ? el("optgroup", { label: K.t("panels.roomBuild.oneRoom") }, rooms.map((r) => el("option", { value: r.id }, ownRoom(m, r.id) ? K.t("panels.roomBuild.hasOwn", { room: r.name }) : r.name))) : null);
    const radio = (v, on, kid) => el("label.pn-radio", {}, el("input", { type: "radio", name: "pn-rb-start", value: v, checked: on }), kid);
    const curT = el("span", {}, K.t("panels.roomBuild.fromNow", { name: nowName("*") }));
    const starts = el("div.pn-radios", { role: "radiogroup", "aria-label": K.t("panels.roomBuild.start") },
      radio("empty", false, el("span", {}, K.t("panels.roomBuild.fromEmpty"))), radio("now", true, curT));
    const ok = await ask({ title: K.t("panels.roomBuild.title"), yes: K.t("panels.roomBuild.open"),
      extra: el("div.pn-ask-opt.pn-rb", {}, el("label.pn-rb-f", {}, el("b", {}, K.t("panels.roomBuild.for")), forSel),
        el("div.pn-rb-f", {}, el("b", {}, K.t("panels.roomBuild.start")), starts)) });
    if (!ok) return;
    const empty = !!starts.querySelector('input[value="empty"]:checked');   // i18n-ok (a selector)
    openBuilder({ room: true, key: forSel.value, start: empty ? "empty" : "" });
  }
  // the layout builder (builder.js) in place of the page; Done → this panel's Look & layout again
  // room: true = the rooms' own grids (one for every room, and any room's own) instead of Home
  // (v3.0.2) key: the room page to open ("*" every room's, else a room's id), start: "empty" = no cards
  async function openBuilder(opts = {}) {
    // (a phone: no red error — the Look & layout tab with its "open this on a computer" note)
    if (phone()) { tab = "look"; drawSetup(); return toast(K.t("panels.builder.needsBig")); }
    if (!data) return;
    // (v3.0.2) changes waiting: the builder works on what's saved — Save them first, or stay
    if (pendN() && pendPid === cur) {
      if (!(await ask({ title: K.t("panels.bar.builderAsk"), text: K.t("panels.bar.builderText", { n: pendN() }), yes: K.t("panels.bar.builderYes") }))) return;
      if (!(await saveAll())) return;
    }
    // (the panel as saved now: the builder's save is checked against what it opened with — another tab's save is noticed)
    const fresh = await loadPanel(cur).catch(() => null);
    if (fresh && fresh.id === data.id) data = fresh;
    if (!data || !onPage()) return;
    const p = shown(cur) || { id: cur, name: cur };
    const name = data.managed.panelName || p.name;
    if (!M.openBuilder) { toast(K.t("panels.builder.notLoaded"), true); return; }   // (a lazily loaded script that failed)
    M.openBuilder({ panel: { id: p.id, name, address: p.address }, managed: data.managed, rooms: data.rooms, views: data.views, perf: data.perf, room: !!opts.room,
      key: opts.key || "*", start: opts.start || "", panels: list.map((x) => ({ id: x.id, name: x.name })), save, latest: () => data.managed, back: () => { tab = "look"; listAt = 0; drawSetup(); } });
    if (M.routeSync) M.routeSync([p.id, "layout"], K.t(opts.room ? "panels.builder.titleRooms" : "panels.builder.titleHome", { name }));
  }

  // ================================================================== Rooms & devices
  // a list the owner puts in order: drag a row (mouse) or ▲ ▼ (keyboard, touch); onOrder(ids) after each move
  function orderList(items, onOrder, label) {   // items: [{id, label, sub, extra}]
    const box = el("div.pn-olist", { role: "list", "aria-label": label || null });
    let from = null;
    const commit = (focusId, dir) => { draw(); onOrder(items.map((x) => x.id)); if (focusId != null) { const b = box.querySelector(`[data-fk="${dir}:${focusId}"]`) || box.querySelector(`[data-fk="${dir === "up" ? "down" : "up"}:${focusId}"]`); if (b) b.focus(); } };
    const move = (i, d) => { const j = i + d; if (j < 0 || j >= items.length) return; const id = items[i].id; [items[i], items[j]] = [items[j], items[i]]; commit(id, d < 0 ? "up" : "down"); };
    function draw() {
      box.replaceChildren(...items.map((it, i) => el("div.pn-orow", { role: "listitem", draggable: "true",
        ondragstart: (e) => { from = i; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(it.id)); } catch {} },
        ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add("over"); },
        ondragleave: (e) => e.currentTarget.classList.remove("over"),
        ondrop: (e) => { e.preventDefault(); e.currentTarget.classList.remove("over"); if (from == null || from === i) return;
          const [mv] = items.splice(from, 1); items.splice(i, 0, mv); from = null; commit(); },
        ondragend: () => { from = null; } },
        el("span.grip", { "aria-hidden": "true" }, "⠿"), el("span.tx", {}, el("b", {}, it.label), it.sub ? el("small", {}, it.sub) : null), it.extra || null,
        el("span.arrows", {}, el("button.pn-ar", { type: "button", disabled: i === 0, onclick: () => move(i, -1), "aria-label": K.t("panels.order.up", { name: it.label }), "data-fk": `up:${it.id}` }, ic("chevU", 14)),
          el("button.pn-ar", { type: "button", disabled: i === items.length - 1, onclick: () => move(i, 1), "aria-label": K.t("panels.order.down", { name: it.label }), "data-fk": `down:${it.id}` }, ic("chevD", 14))))));
    }
    draw();
    return box;
  }
  function rooms() {
    const m = view(), hiddenRooms = m.hiddenRooms || {}, hiddenDevices = m.hiddenDevices || {};
    const order = m.roomOrder || [];
    const rank = (r, i) => { const k = order.indexOf(r.id); return k < 0 ? order.length + i : k; };
    const ordered = data.rooms.map((r, i) => [r, rank(r, i)]).sort((a, b) => a[1] - b[1]).map(([r]) => r);
    const byId = new Map(data.rooms.flatMap((x) => x.devices.map((d) => [d.id, { ...d, room: x.name }])));
    const devN = (r) => r.devices.length + (r.members || []).length;
    const roomList = ordered.length ? orderList(ordered.map((r) => ({ id: r.id, label: r.name, sub: K.t(r.custom ? "panels.rooms.devicesYours" : "search.roomDevices", { n: devN(r) }),
      extra: swi("hiddenRooms", !hiddenRooms[r.id], (on) => saveDraw({ hiddenRooms: { [r.id]: !on } }), K.t("panels.shownHere", { name: r.name })) })),
    (ids) => keep({ roomOrder: ids }), K.t("panels.rooms.group")) : el("p.pn-info", {}, K.t("panels.rooms.none"));

    if (!roomPick || !data.rooms.some((r) => r.id === roomPick)) roomPick = ordered[0] && ordered[0].id;
    const r = data.rooms.find((x) => x.id === roomPick);
    let devBox = el("p.pn-info", {}, K.t("panels.rooms.noneShort"));
    if (r) {
      const extra = (m.extraDevices || {})[r.id] || [];
      const ids = [...r.devices.map((d) => d.id), ...(r.members || []), ...extra].filter((id, i, a) => a.indexOf(id) === i);
      const dorder = (m.deviceOrder || {})[r.id] || [];
      const drank = (id, i) => { const k = dorder.indexOf(id); return k < 0 ? 1e6 + i : k; };
      const sorted = ids.map((id, i) => [id, drank(id, i)]).sort((a, b) => a[1] - b[1]).map(([id]) => id);
      const setExtra = (next) => saveDraw({ extraDevices: { [r.id]: next } });
      const items = sorted.map((id) => { const d = byId.get(id) || { name: `#${id}`, kind: "?" };
        const fromElsewhere = extra.includes(id);
        return { id, label: r.custom ? d.full || d.name : d.name, sub: d.room && d.room !== r.name ? K.t("panels.rooms.kindFrom", { kind: d.kind, room: d.room }) : d.kind,
          extra: el("span.pn-btns", {}, fromElsewhere ? keyed(el("button.btn.sm.ghost", { type: "button", onclick: () => setExtra(extra.filter((x) => x !== id)) }, K.t("panels.remove")), "extraDevices") : null,
            swi("hiddenDevices", !hiddenDevices[id], (on) => keep({ hiddenDevices: { [id]: !on } }), r.custom ? K.t("panels.rooms.shownCustom", { name: d.name }) : K.t("panels.shownHere", { name: d.name }))) }; });
      const add = select("extraDevices", [["", K.t("panels.rooms.addPh")], ...data.rooms.filter((x) => x.id !== r.id && !x.custom).map((x) => [x.name,
        x.devices.filter((d) => !ids.includes(d.id)).map((d) => [d.id, K.t("panels.withDetail", { name: d.name, detail: d.kind })])]).filter(([, l]) => l.length)], "",
      (v) => { if (v) setExtra([...extra, +v]); }, K.t("panels.rooms.addLabel", { name: r.name }));
      devBox = el("div", {}, items.length ? orderList(items, (next) => keep({ deviceOrder: { [r.id]: next } }), K.t("panels.rooms.devicesIn", { name: r.name }))
        : el("p.pn-info", {}, K.t("panels.rooms.noDevices")), el("div.pn-addrow", {}, add));
    }
    return el("div", {},
      ...G(K.t("panels.rooms.group"), [block(roomList)], K.t("panels.rooms.foot")),
      ...(!ordered.length ? [] : G(K.t("panels.rooms.devGroup"), [R(K.t("panels.rooms.room"), null, select("", ordered.map((x) => [x.id, x.name]), roomPick, (v) => { roomPick = v; drawSetup(); }, K.t("panels.rooms.room"))), block(devBox)],
        K.t("panels.rooms.devFoot"))));
  }

  // ================================================================== Cameras
  function cameras() {
    const m = view(), hidden = m["cameras.hiddenViews"] || {}, names = m["cameras.viewNames"] || {};
    const order = m["cameras.viewOrder"] || [];
    const rank = (v, i) => { const k = order.indexOf(v.id); return k < 0 ? order.length + i : k; };
    const views = data.views.map((v, i) => [v, rank(v, i)]).sort((a, b) => a[1] - b[1]).map(([v]) => v);
    const list2 = views.length ? orderList(views.map((v) => ({ id: v.id, label: names[v.id] || v.name, sub: names[v.id] ? K.t("panels.cams.countProtect", { n: v.cameras, name: v.name }) : K.t("panels.cams.count", { n: v.cameras }),
      extra: el("span.pn-btns", {}, keyed(el("input.pn-vname", { type: "text", value: names[v.id] || "", placeholder: K.t("panels.cams.namePh"), maxlength: "40", "aria-label": K.t("panels.cams.nameLabel", { name: v.name }),
        onchange: (e) => saveDraw({ "cameras.viewNames": { [v.id]: e.target.value.trim() } }, e.target) }), "cameras.viewNames"),
      swi("cameras.hiddenViews", !hidden[v.id], (on) => keep({ "cameras.hiddenViews": { [v.id]: !on } }), K.t("panels.shownHere", { name: v.name }))) })),
    (ids) => keep({ "cameras.viewOrder": ids }), K.t("panels.cams.views")) : el("p.pn-info", {}, K.t("panels.cams.none"));
    const sec = (n) => K.t("panels.time.s", { n }), min = (n) => K.t("panels.time.min", { n });
    const opt = (label, hint, path, opts, def) => R(label, hint, seg(path, opts, m[path] ?? def, (v) => saveDraw({ [path]: v }), label));
    return el("div", {},
      ...G(K.t("panels.cams.group"), [block(list2)], K.t("panels.cams.foot")),
      ...G(K.t("panels.cams.options"), [
        opt(K.t("panels.cams.auto"), K.t("panels.cams.autoHint"), "cameras.autoSeconds", [[30, sec(30)], [60, sec(60)], [120, min(2)]], 60),
        opt(K.t("panels.cams.liveMax"), K.t("panels.cams.liveMaxHint"), "cameras.liveMax", [[4, K.t("panels.cams.tiles", { n: 4 })], [6, "6"], [9, "9"], [16, "16"]], 9),
        opt(K.t("panels.cams.snap"), null, "cameras.snapEvery", [[2, sec(2)], [3, sec(3)], [5, sec(5)], [10, sec(10)]], 3),
        opt(K.t("panels.cams.audio"), null, "cameras.audioTimeout", [[30, sec(30)], [60, sec(60)], [120, min(2)]], 60),
      ]));
  }

  // ================================================================== People & calendars
  // a colour: a hue slider (any hue, kept bright enough for the dark panels) with a live preview, and quick picks
  const hex2h = (hx) => {
    const n = parseInt(String(hx || "#8b5cf6").slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return Math.round((h * 60 + 360) % 360);
  };
  const h2hex = (h, sat = 0.75, l = 0.6) => {
    const k = (n) => (n + h / 30) % 12, a = sat * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, "0");
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  function popover(anchor, ...kids) {
    document.querySelectorAll(".pick-pop").forEach((x) => x.remove());
    const pop = el("div.pick-pop", {}, ...kids), r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(innerWidth - 300, r.left + scrollX))}px`; pop.style.top = `${r.bottom + scrollY + 6}px`;
    document.body.append(pop);
    const off = (e) => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); document.removeEventListener("pointerdown", off, true); } };
    setTimeout(() => document.addEventListener("pointerdown", off, true), 0);
    const f = pop.querySelector("input, button"); if (f) f.focus();
    pop.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); pop.remove(); anchor.focus(); } });
    return pop;
  }
  function huePick(anchor, now, onPick) {
    const prev = el("i.hue-prev", { style: `background:${now}` }), code = el("small.muted", {}, now);
    const range = el("input.hue-range", { type: "range", min: "0", max: "359", value: String(hex2h(now)), "aria-label": K.t("control.colour"),
      oninput: (e) => { const c = h2hex(+e.target.value); prev.style.background = c; code.textContent = c; },
      onchange: (e) => onPick(h2hex(+e.target.value)) });
    popover(anchor, el("b", {}, K.t("control.colour")), el("div.hue-row", {}, prev, range), code,
      el("div.hue-sw", {}, COLORS.map((c) => el("button.dot", { type: "button", style: `background:${c}`, "aria-label": c, onclick: () => onPick(c) }))));
  }
  // an icon: none (a person's initial), a built-in one (drawn white on their colour — it follows the hue), or one of
  // your pictures (as it is: no colour then)
  const PERSON_ICONS = ["user", "users", "baby", "heart", "star", "dog", "cat", "paw", "bird", "fish", "home", "car", "briefcase", "dumbbell", "plane", "music", "gamepad", "cake"];
  const CAL_ICONS = ["calendar", "users", "user", "baby", "briefcase", "home", "heart", "star", "cake", "party", "dumbbell", "utensils", "plane", "car", "church", "stethoscope", "tooth", "dog"];
  async function iconPick(anchor, now, color, choices, noneLabel, onPick) {
    if (!myPics) { try { const r = await api("/api/manage/pictures"); myPics = (r.uploads || []).filter((u) => u.style === "icon" || u.style === "anim-icon"); } catch { myPics = []; } }
    const chip = (v, body, label) => el("button.ipick" + (now === v ? ".cur" : ""), { type: "button", "aria-label": label, onclick: () => onPick(v) }, body);
    popover(anchor, el("b", {}, K.t("panels.icon")),
      el("div.ipick-grid", {}, chip(null, el("span.ipick-none", {}, noneLabel), K.t("panels.noIcon")),
        ...choices.map((n) => chip(`ic:${n}`, el("span.ipick-c", { style: `background:${color}` }, iconEl(n, 18)), n))),
      myPics.length ? el("b", {}, K.t("panels.icon.yours")) : el("small.muted", {}, K.t("panels.icon.ownHint")),
      myPics.length ? el("div.ipick-grid", {}, myPics.map((u) => chip(`up:${u.id}`, el("img", { src: `/pictures/${u.id}`, alt: u.name, title: u.name }), u.name))) : null);
  }
  // what a person / calendar looks like now (its icon on its colour, a picture, or the initial)
  const faceOf = (o, initial) => {
    const up = /^up:([0-9a-f]{16})$/.exec(o.icon || ""), icn = /^ic:(\w+)$/.exec(o.icon || "");
    if (up) return el("img.ilook", { src: `/pictures/${up[1]}`, alt: "" });
    return el("span.ilook", { style: `background:${o.color}` }, icn ? iconEl(icn[1], 16) : initial || "");
  };
  const faceBtn = (key, o, initial, label, onclick) => keyed(el("button.pn-face", { type: "button", "aria-label": label, "data-tip": K.t("panels.icon.tip"), onclick }, faceOf(o, initial)), key);
  const colourBtn = (key, color, label, onclick) => keyed(el("button.dot.pn-col", { type: "button", style: `background:${color}`, "aria-label": label, "data-tip": K.t("panels.colour.tip"), onclick }), key);
  // a presence device's label → the person: "Phone - Jane's" → "Jane" (the same as the panel's settings.js)
  const personName = (label) => String(label || "").replace(/^[^-]{1,24}\s-\s*/, "").replace(/['’]s$/i, "").trim() || String(label || "");
  function people() {
    const m = view();
    // (v3.0.2: a saved list — even an empty one, everyone switched off — is the list; null = never saved)
    const fromPanel = Array.isArray(m.people);
    const clean = (l) => (l || "").replace(/^(owntracks|phone)\s*-\s*/i, "");
    // (no list saved yet: the panel's own first-run rule — settings.js — so the switches show who the panel really shows.
    // Before v3.0.2 only OwnTracks devices started on here while the panel showed every presence person: switching
    // someone off needed on, then off)
    const NOT_PERSON = /presence sensor|mm-?wave|motion|occupan|radar|\bfp[12]\b/i;   // (v3.0.2: settings.js had backspace characters instead of its word boundaries)
    const lst = fromPanel ? m.people : data.presence.filter((p) => !NOT_PERSON.test(`${p.label} ${p.type || ""}`)).slice(0, 8)
      .map((p, i) => ({ id: p.id, name: personName(p.label), color: COLORS[i % 4], image: null }));
    const chosen = new Map(lst.map((p) => [p.id, p]));
    const setPeople = (next) => saveDraw({ people: next });
    const rows = data.presence.map((p) => {
      const c = chosen.get(p.id), ini = c ? (c.name || "?")[0].toUpperCase() : "";
      return R(p.label, p.type || K.t("panels.people.presence"), el("div.pn-btns", {},
        c ? keyed(el("input.pn-pname", { type: "text", value: c.name, maxlength: "40", "aria-label": K.t("panels.people.nameLabel", { name: p.label }), onchange: (e) => setPeople(lst.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x))) }), "people") : null,
        c ? faceBtn("people", c, ini, K.t("panels.iconOf", { name: c.name }), (e) => iconPick(e.currentTarget, c.icon || null, c.color, PERSON_ICONS, ini, (v) => setPeople(lst.map((x) => (x.id === p.id ? { ...x, icon: v || undefined } : x))))) : null,
        c && !/^up:/.test(c.icon || "") ? colourBtn("people", c.color, K.t("panels.colourOf", { name: c.name }), (e) => huePick(e.currentTarget, c.color, (v) => setPeople(lst.map((x) => (x.id === p.id ? { ...x, color: v } : x))))) : null,
        swi("people", !!c, (on) => setPeople(on ? [...lst, { id: p.id, name: clean(p.label).replace(/['’]s$/i, "").trim() || p.label, color: COLORS[lst.length % COLORS.length], image: null }]
          : lst.filter((x) => x.id !== p.id)), K.t("panels.shownHere", { name: p.label }))));
    });
    return el("div", {},
      ...G(K.t("panels.people.group"), rows.length ? rows : [block(el("p.pn-info", {}, K.t("panels.people.none")))],
        K.t("panels.people.foot")),
      ...calendarGroup(m));
  }
  // the house's calendars (Integrations → Calendars, the admin) — this panel shows each one or not, with its own colour
  // / icon if you like (saved in its settings.calendars, linked by id; no own colour = the house's). None set up yet:
  // the panel's sample calendars, as before.
  function calendarGroup(m) {
    const house = Array.isArray(data.houseCalendars) ? data.houseCalendars : [];
    const saved = Array.isArray(m.calendars) ? m.calendars : [];
    const admin = M.isAdmin();
    if (house.length) {
      const own = new Map(saved.map((c) => [c.id, c]));
      const view = house.map((h) => { const o = own.get(h.id) || {};
        return { id: h.id, name: h.name, color: o.color || h.color, houseColor: h.color, ownColor: !!o.color, icon: o.icon, on: o.on !== false }; });
      const setCals = (next) => saveDraw({ calendars: next.map((c) => ({ id: c.id, name: c.name, on: c.on,
        ...(c.ownColor && c.color !== c.houseColor ? { color: c.color } : {}), ...(c.icon ? { icon: c.icon } : {}) })) });
      const upd = (id, f) => setCals(view.map((x) => (x.id === id ? { ...x, ...f } : x)));
      return G(K.t("panels.cal.group"), view.map((c) => R(c.name, c.ownColor ? K.t("panels.cal.ownColour") : K.t("panels.cal.houseColour"), el("div.pn-btns", {},
        c.ownColor ? keyed(el("button.btn.sm.ghost", { type: "button", onclick: () => upd(c.id, { ownColor: false, color: c.houseColor }) }, K.t("panels.cal.defaultColour")), "calendars") : null,
        faceBtn("calendars", c, "", K.t("panels.iconOf", { name: c.name }), (e) => iconPick(e.currentTarget, c.icon || null, c.color, CAL_ICONS, K.t("panels.none"), (v) => upd(c.id, { icon: v || undefined }))),
        !/^up:/.test(c.icon || "") ? colourBtn("calendars", c.color, K.t("panels.colourOf", { name: c.name }), (e) => huePick(e.currentTarget, c.color, (v) => upd(c.id, { color: v, ownColor: true }))) : null,
        swi("calendars", c.on, (on) => upd(c.id, { on }), K.t("panels.shownHere", { name: c.name }))))),
      K.t(admin ? "panels.cal.footAdmin" : "panels.cal.footUser"));
    }
    const cals = saved.length ? saved : CAL_DEFAULTS;
    const setCals = (next) => saveDraw({ calendars: next });
    return G(K.t("panels.cal.group"), [block(warn(K.t(admin ? "panels.cal.noneAdmin" : "panels.cal.noneUser"))),
      ...cals.map((c) => R(c.name, K.t("panels.cal.sample"), el("div.pn-btns", {},
        keyed(el("input.pn-pname", { type: "text", value: c.name, maxlength: "60", "aria-label": K.t("panels.cal.nameLabel", { name: c.name }), onchange: (e) => setCals(cals.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x))) }), "calendars"),
        faceBtn("calendars", c, "", K.t("panels.iconOf", { name: c.name }), (e) => iconPick(e.currentTarget, c.icon || null, c.color, CAL_ICONS, K.t("panels.none"), (v) => setCals(cals.map((x) => (x.id === c.id ? { ...x, icon: v || undefined } : x))))),
        !/^up:/.test(c.icon || "") ? colourBtn("calendars", c.color || "#8b5cf6", K.t("panels.colourOf", { name: c.name }), (e) => huePick(e.currentTarget, c.color || "#8b5cf6", (v) => setCals(cals.map((x) => (x.id === c.id ? { ...x, color: v } : x))))) : null,
        swi("calendars", c.on, (on) => setCals(cals.map((x) => (x.id === c.id ? { ...x, on } : x))), K.t("panels.shownHere", { name: c.name })))))]);
  }

  // ================================================================== Alerts (the admin's:)
  // Every alert rule lives in Hubitat: a rule sends it with the Skypane Notifier, the panels show it and tell Hubitat
  // when it's dismissed. Here only how THIS panel shows them: levels, beeps, quiet hours, its light.
  const LEVELS_TXT = [[1, K.t("panels.alerts.levelReminder")], [2, K.t("panels.alerts.levelFinished")], [3, K.t("panels.alerts.levelAction")], [4, K.t("panels.alerts.levelDamage")],
    [5, K.t("panels.alerts.levelLife")]];
  const hourName = (h) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });
  const HOURS = [[-1, "—"], ...Array.from({ length: 24 }, (_, h) => [h, hourName(h)])];
  async function quiet(path, v) {
    const m = view(), other = path === "quietFrom" ? m.quietTo : m.quietFrom;
    if (v >= 0 && v === other) { toast(K.t("panels.alerts.sameHourToast"), true); return drawSetup(); }
    await saveDraw({ [path]: v });
  }
  function alerts(p) {   // (v3.0.0: p — its name in the Silence question)
    const m = view();
    const qf = m.quietFrom ?? -1, qt = m.quietTo ?? -1;
    const modes = text("quietModes", (m.quietModes || []).join(", "), { max: 200, ph: K.t("panels.alerts.modesPh"), label: K.t("panels.alerts.modesLabel"), onchange: (e) => {
      const l = e.target.value.split(",").map((x) => x.trim()).filter(Boolean);
      if (l.length > 12 || l.some((x) => x.length > 40)) { mark(e.target, K.t("panels.alerts.modesMax")); return toast(K.t("panels.alerts.modesMaxToast"), true); }
      keep({ quietModes: l }, e.target);
    } });
    const notes = [];
    if (qf >= 0 && qf === qt) notes.push(warn(K.t("panels.alerts.sameHour")));
    if ((qf >= 0) !== (qt >= 0)) notes.push(warn(K.t("panels.alerts.bothTimes")));
    return el("div", {},
      block(info(K.t("panels.alerts.info"))),
      ...G(K.t("panels.alerts.onPanel"), [
        R(K.t("panels.alerts.beep"), K.t("panels.alerts.levelsHigh"), swi("alertBeeps", m.alertBeeps !== false, (on) => keep({ alertBeeps: on }), K.t("panels.alerts.beep"))),
        R(K.t("panels.alerts.silence"), K.t("panels.alerts.silenceHint"),
          swi("alertSilence", m.alertSilence === true, async (on) => {
            if (!on) return saveDraw({ alertSilence: false }, null, cur);
            await askThenSave({ title: K.t("panels.alerts.silenceAsk", { name: p.name }), text: K.t("panels.alerts.silenceText"), yes: K.t("panels.alerts.allowIt") }, { alertSilence: true });
          }, K.t("panels.alerts.silence"))),
      ]),
      ...G(K.t("panels.alerts.levelsGroup"), [
        R(K.t("panels.alerts.minLevel"), K.t("panels.alerts.minLevelHint"), select("alertMinLevel", LEVELS_TXT, m.alertMinLevel || 1, (v) => keep({ alertMinLevel: +v }), K.t("panels.alerts.minLevel"))),
        R(K.t("panels.alerts.quiet"), K.t("panels.alerts.quietHint"), el("div.pn-btns", {}, select("quietFrom", HOURS, qf, (v) => quiet("quietFrom", +v), K.t("panels.alerts.quietFrom")), el("span.pn-to", {}, K.t("panels.alerts.to")),
          select("quietTo", HOURS, qt, (v) => quiet("quietTo", +v), K.t("panels.alerts.quietUntil")))),
        notes.length ? block(...notes) : null,
        R(K.t("panels.alerts.orMode"), K.t("panels.alerts.orModeHint"), modes),
        R(K.t("panels.alerts.quietDamage"), K.t("panels.alerts.quietDamageHint"),
          swi("quietLevel4", m.quietLevel4 !== false, (on) => keep({ quietLevel4: on }), K.t("panels.alerts.quietDamage"))),
      ], K.t("panels.alerts.levelsFoot")),
      ...G(K.t("panels.alerts.light"), [R(K.t("panels.alerts.pulses"), K.t("panels.alerts.pulsesHintOwn"), notifySel(m)),
        // (the panel doesn't say yet whether it has a light of its own: a check-in's led=1 — status.led — once it does)
        (p.status || {}).led === true ? null : block(info(K.t("panels.alerts.ownNotReported")))],
        K.t("panels.alerts.lightFoot")));
  }
  // (v3.0.2, the owner: the tablet's own light first) "This tablet's own light" is its LED strip (the panel agent,
  // panelagent/<kiosk>/led/set): alarm.js flashes it red during a level 4–5 alert whenever settings.ledStrip is on —
  // so it is stored as {ledStrip: true, notifyLight: 0}, nothing new for the panel. None switches the strip off too
  // (never sent anything then); a Hubitat light leaves the strip as it is (both pulse). (v3.0.2: with the strip on, None
  // says that it switches the strip off — the same switch as General's LED strip)
  function notifySel(m) {
    const now = +m.notifyLight || 0, own = m.ledStrip === true;
    const lights = data.rooms.map((r) => [r, r.devices.filter((d) => d.kind === "light")]).filter(([, ds]) => ds.length);
    const known = lights.some(([, ds]) => ds.some((d) => d.id === now));
    return select("notifyLight", [["own", K.t("panels.alerts.ownLight")], [0, own ? K.t("panels.alerts.noneStripOff") : K.t("panels.none")], ...(now && !known ? [[now, K.t("panels.alerts.lightGone", { id: now })]] : []),
      ...lights.map(([r, ds]) => [r.name, ds.map((d) => [d.id, d.group ? K.t("panels.alerts.lightGroup", { name: d.full || d.name }) : d.full || d.name])])], now || (own ? "own" : 0),
    (v) => saveDraw(v === "own" ? { notifyLight: 0, ledStrip: true } : +v ? { notifyLight: +v } : { notifyLight: 0, ledStrip: false }), K.t("panels.alerts.light"));
  }

  // ================================================================== Safety (the admin's)
  // the panel PIN's two unlock windows (pinpad.js): the alarm one counts from the PIN entry, the
  // general one from the last touch; 0 = never relocks. The Manager warns when the alarm one is off or over 60 s.
  const tSec = (n) => K.t("panels.time.seconds", { n }), tMin = (n) => K.t("panels.time.minutes", { n });
  const WIN_ALARM = [[0, K.t("panels.safety.never")], [15, tSec(15)], [30, K.t("panels.time.secondsRec", { n: 30 })], [60, tMin(1)], [120, tMin(2)], [300, tMin(5)]];
  const WIN_GENERAL = [[0, K.t("panels.safety.never")], [15, tSec(15)], [30, tSec(30)], [60, K.t("panels.time.minutesRec", { n: 1 })], [120, tMin(2)], [300, tMin(5)], [600, tMin(10)]];
  // (v3.0.2) the panel PIN from the Manager (the admin; PATCH /api/manage/pin): set / change and clear, each with the
  // admin's own Manager password — no old PIN needed. The PIN lives only in its two fields and the one request's body:
  // never in a variable here, never logged; the fields are emptied once the answer is in.
  let pinAsking = false;
  function pinGroup() {
    if (pinSet === null && !pinAsking) {
      pinAsking = true;
      api("/api/manage/pin").then((r) => { pinSet = r && typeof r.set === "boolean" ? r.set : "unknown"; }).catch(() => { pinSet = "unknown"; })
        .finally(() => { pinAsking = false; if (onPage() && tab === "safety") drawSetup(); });
    }
    const state = pinSet === true ? el("span.pill.acc", {}, K.t("panels.pin.isSet")) : pinSet === false ? el("span.pill.idle", {}, K.t("panels.pin.notSet"))
      : el("span.pill.idle", {}, pinSet === null ? K.t("common.loading") : K.t("panels.pin.unknown"));
    return G(K.t("panels.pin.group"), [R(K.t("panels.pin.row"), K.t("panels.pin.rowHint"), el("div.pn-btns", {}, state,
      el("button.btn.sm", { type: "button", "data-fk": "pn-pin-set", disabled: pinSet === null, onclick: () => pinDialog(true) }, ic("key", 14), pinSet === true ? K.t("panels.pin.change") : K.t("panels.pin.set")),
      pinSet === true ? el("button.btn.sm.ghost", { type: "button", "data-fk": "pn-pin-clear", onclick: () => pinDialog(false) }, K.t("panels.pin.clear")) : null))],
    K.t("panels.pin.foot"));
  }
  function pinDialog(setting) {
    const field = (id, label, attrs) => el("label.pn-fld", { for: id }, el("b", {}, label), el("input", { id, type: "password", spellcheck: "false", ...attrs }));
    const digits = { inputmode: "numeric", autocomplete: "new-password", maxlength: "8", pattern: "[0-9]*" };
    const one = setting ? field("pn-pin-a", K.t("panels.pin.new"), digits) : null, two = setting ? field("pn-pin-b", K.t("panels.pin.again"), digits) : null;
    const pw = field("pn-pin-pw", K.t("panels.pin.password"), { autocomplete: "current-password", maxlength: "200" });
    const err = el("p.pn-warn", { role: "alert", hidden: true });
    const inA = one && one.querySelector("input"), inB = two && two.querySelector("input"), inP = pw.querySelector("input");
    const wipe = () => { for (const i of [inA, inB, inP]) if (i) i.value = ""; };
    const say = (msg, box) => { err.hidden = false; err.replaceChildren(ic("alert", 15), msg); if (box) { box.focus(); box.select(); } };
    let close = null;
    const go = el("button.btn" + (setting ? ".pri" : ".pn-danger"), { type: "submit" }, setting ? K.t("panels.pin.save") : K.t("panels.pin.clearYes"));
    const form = el("form.modal.small.pn-ask", { role: "dialog", "aria-labelledby": "pn-pin-h", autocomplete: "off", onsubmit: async (e) => {
      e.preventDefault();
      if (setting && !/^\d{4,8}$/.test(inA.value)) return say(K.t("panels.pin.digits"), inA);
      if (setting && inA.value !== inB.value) return say(K.t("panels.pin.mismatch"), inB);
      if (!inP.value) return say(K.t("panels.pin.needPassword"), inP);
      go.disabled = true;
      try {
        const r = await api("/api/manage/pin", setting ? { action: "set", pin: inA.value, password: inP.value } : { action: "clear", password: inP.value });
        if (!r.ok) {
          inP.value = "";
          const why = r.status === 429 || r.status === 423 ? K.t("panels.pin.tooMany") : /password/.test(r.error || "") || r.status === 403 ? K.t("panels.pin.wrongPassword") : r.error || K.t("panels.pin.notSaved");
          return say(why, inP);
        }
        wipe(); close();
        pinSet = setting;
        toast(setting ? K.t("panels.pin.saved") : K.t("panels.pin.cleared"));
        if (onPage() && tab === "safety") drawSetup();
      } catch (e2) { if (e2.message !== "login") say(K.t("panels.save.offline")); } finally { go.disabled = false; }
    } }, el("h2", { id: "pn-pin-h" }, setting ? (pinSet === true ? K.t("panels.pin.changeTitle") : K.t("panels.pin.setTitle")) : K.t("panels.pin.clearTitle")),
      el("p.pn-hint", {}, setting ? K.t("panels.pin.dialogHint") : K.t("panels.pin.clearHint")), one, two, pw, err,
      el("div.pn-ask-acts", {}, el("button.btn", { type: "button", onclick: () => { wipe(); close(); } }, K.t("control.cancel")), go));
    const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) { wipe(); close(); } } }, form);
    close = M.dialog(shade, inA || inP, () => { wipe(); close(); });
  }
  function safety(p) {
    const m = view(), a = Number.isInteger(m.pinAlarmSeconds) ? m.pinAlarmSeconds : 30, g = Number.isInteger(m.pinGeneralSeconds) ? m.pinGeneralSeconds : 60;
    const win = (opts, v, key, label) => select(key, opts.concat(opts.some(([x]) => x === v) ? [] : [[v, tSec(v)]]), v, (x) => saveDraw({ [key]: +x }), label);
    const on = m.allowUnlock === true;
    const D = M.devices && M.devices(), names = new Map(((D && D.devices) || []).map((c) => [c.id, c.label]));
    const locks = ((D && D.unlockable) || []).map((id) => names.get(id) || `#${id}`);
    return el("div", {},
      ...(M.isAdmin() ? pinGroup() : []),
      ...G(K.t("panels.safety.group"), [
        R(K.t("panels.shared.alarm"), K.t("panels.safety.alarmHint"), win(WIN_ALARM, a, "pinAlarmSeconds", K.t("panels.safety.alarmLabel"))),
        a === 0 || a > 60 ? block(warn(a === 0 ? K.t("panels.safety.alarmOff")
          : K.t("panels.safety.alarmLong"))) : null,
        R(K.t("panels.safety.general"), K.t("panels.safety.generalHint"), win(WIN_GENERAL, g, "pinGeneralSeconds", K.t("panels.safety.generalLabel"))),
        g === 0 || g > 60 ? block(warn(g === 0 ? K.t("panels.safety.generalOff")
          : K.t("panels.safety.generalLong"))) : null,
      ], K.t("panels.safety.foot")),
      ...G(K.t("panels.safety.unlockGroup"), [
        R(K.t("panels.safety.allow"), K.t("panels.safety.allowHint"), swi("allowUnlock", on, async (v) => {
          if (!v) return saveDraw({ allowUnlock: false }, null, cur);
          await askThenSave({ title: K.t("panels.safety.allowAsk", { name: p.name }), text: K.t("panels.safety.allowText"), yes: K.t("panels.safety.allowYes") }, { allowUnlock: true });
        }, K.t("panels.safety.allow"))),
        block(info(locks.length ? K.t("panels.safety.locks", { locks: locks.join(", ") })
          : K.t("panels.safety.noLocks")),
        warn(K.t("panels.safety.pairingWarn"))),
      ], K.t("panels.safety.unlockFoot")),
      // (v2.7.0) guest lockdown is set for the whole house on Guest Wi-Fi; here only what it does to this panel
      // (v2.9.3: mode "none" = only the calendar blurred; blur = the calendar too)
      ...G(K.t("panels.safety.guests"), [R(K.t("panels.safety.lockdown"), data.lockdown && data.lockdown.mode !== "none" ? K.t(data.lockdown.mode === "dark" ? "panels.safety.lockdownDark" : "panels.safety.lockdownPin", { name: data.lockdown.switch })
        : K.t("panels.safety.noLockdown"), el("span.pill" + (data.lockdown && data.lockdown.mode !== "none" ? ".acc" : ".idle"), {}, data.lockdown && data.lockdown.mode !== "none" ? K.t("panels.safety.locksDown") : K.t("control.off"))),
        R(K.t("guest.blurTitle"), data.lockdown && data.lockdown.blur ? K.t("panels.blurOn", { name: data.lockdown.switch }) : K.t("panels.blurOff"),
          el("span.pill" + (data.lockdown && data.lockdown.blur ? ".acc" : ".idle"), {}, data.lockdown && data.lockdown.blur ? K.t("panels.blurPill") : K.t("control.off")))],
      M.isAdmin() ? el("span", {}, ...withEls("panels.safety.guestFoot", { link: el("button.linkish", { type: "button", onclick: () => M.go("guest") }, K.t("panels.safety.guestLink")) }))
        : K.t("panels.safety.guestFootUser")));
  }

  // ================================================================== Guest Wi-Fi card
  function guest() {
    const show = view()["guest.show"] || "always";
    return el("div", {}, ...G(K.t("panels.guest.group"), [R(K.t("panels.guest.home"), K.t("panels.guest.homeHint"),
      seg("guest.show", [["always", K.t("panels.show")], ["off", K.t("panels.hide")], ...(show === "guestMode" ? [["guestMode", K.t("panels.guest.onlyGuest")]] : [])], show, (v) => saveDraw({ "guest.show": v }), K.t("panels.tab.guest")))],
    K.t("panels.guest.foot")));
  }

  // ================================================================== Weather effects, the test, the benchmark
  function effects() {
    const m = view(), devs = Array.isArray(data.perf) ? data.perf : [];
    const now = m["effects.maxLoad"] || 0;
    const useIt = (lvl) => (now === lvl ? el("span.pill.acc", {}, K.t("panels.inUse")) : keyed(el("button.btn.sm", { type: "button", onclick: () => saveDraw({ "effects.maxLoad": lvl }) }, K.t("panels.useIt")), "effects.maxLoad"));
    const line = (l, ...v) => el("div.pn-mline", {}, el("span", {}, l), el("span.v", {}, ...v));
    const CODEC = [K.t("panels.shared.no"), K.t("panels.shared.yes"), K.t("panels.fx.codecHw")];
    const pctOf = (ms, b) => `${Math.round((100 * ms) / b.budgetMs)} %`;
    const benchResult = (b) => el("div.pn-msub", {},
      el("h5", {}, K.t(b.capped ? "panels.fx.benchTitleCapped" : "panels.fx.benchTitle", { score: b.frameScore }), el("small", {}, `${b.mode} · ${b.at ? new Date(b.at).toLocaleString() : ""}`)),
      line(K.t("panels.fx.budget"), el("b", {}, `${b.budgetMs} ms`), b.thermal < 0.95 ? ` · ${K.t("panels.fx.slowerWarm", { pct: Math.round(100 - b.thermal * 100) })}` : ""),
      line(K.t("panels.fx.fits", { level: LOADS[b.best] }), useIt(b.best)),
      line(K.t("panels.fx.share"), [1, 2, 3, 4].map((l) => `${LOADS[l]} ${pctOf(b.fxMs[l], b)}`).join(" · ")),
      line(K.t("panels.fx.liveCams"), el("b", {}, b.noVideo ? K.t("panels.fx.notMeasured") : String(b.liveMax)), b.full === 0 ? el("span.pn-w", {}, ` · ${K.t("panels.fx.hdStutters")}`) : b.full === 1 ? ` · ${K.t("panels.fx.hdSmooth")}` : ""),
      line(K.t("panels.kv.screen"), `${b.screen || ""} · ${b.refresh || "?"} Hz${b.refresh && b.refresh < 50 ? ` ${K.t("panels.fx.battery")}` : ""}${b.bound ? ` · ${K.t(b.bound === "main" ? "panels.fx.boundMain" : "panels.fx.boundDraw")}` : ""}`),
      Object.keys(b.codecs || {}).length ? line(K.t("panels.fx.decodes"), Object.entries(b.codecs).map(([k, v]) => `${k.replace("_4k", " 4K").toUpperCase()}: ${CODEC[v]}`).join(" · ")) : null,
      el("small", {}, b.costs.tile != null ? K.t("panels.fx.costsCam", { card: pctOf(b.costs.card || 0, b), art: pctOf(b.costs.art || 0, b), cam: pctOf(b.costs.tile, b) })
        : K.t("panels.fx.costs", { card: pctOf(b.costs.card || 0, b), art: pctOf(b.costs.art || 0, b) })),
      (b.sky || []).length ? el("small", {}, K.t("panels.fx.skySteps", { steps: b.sky.map(([sc, , j, mn]) => `${sc} → ${mn} ms${j >= 1 ? ` ${K.t("panels.fx.jerky")}` : ""}`).join(" · ") })) : null,
      (b.cams || []).length ? el("small", {}, K.t("panels.fx.camSteps", { steps: b.cams.map(([n, mn, d]) => `${n} → ${mn} ms${d > 0 ? `, ${K.t("panels.fx.dropped", { pct: d })}` : ""}`).join(" · ") })) : null);
    const testResult = (t) => el("div.pn-msub", {},
      el("h5", {}, t.stopped ? K.t("panels.fx.testStopped") : K.t("panels.fx.test"), el("small", {}, t.at ? new Date(t.at).toLocaleString() : "")),
      ...Object.keys(t.fx || {}).sort().map((l) => line(K.t("panels.fx.levelEffects", { level: LOADS[l] }), el("b", {}, `${t.fx[l]} fps`), t.fx[l] < 24 ? el("span.pn-w", {}, ` ${K.t("panels.fx.stutters")}`) : t.fx[l] < 30 ? ` ${K.t("panels.fx.justOk")}` : "")),
      ...(t.cams || []).map((c) => line(c.n === 1 ? K.t("panels.fx.oneCam") : c.view ? K.t("panels.fx.nCamsView", { count: c.n, view: c.view }) : K.t("panels.fx.nCams", { count: c.n }), el("b", {}, `${c.fps} fps`),
        c.dropped != null ? ` · ${K.t("panels.fx.framesDropped", { pct: c.dropped })}` : "", c.fps < 24 || c.dropped > 15 ? el("span.pn-w", {}, ` — ${K.t("panels.fx.tooMuch")}`) : "")),
      t.best ? line(K.t("panels.fx.recommended", { level: LOADS[t.best] }), useIt(t.best)) : null);
    const dev = (pf) => {
      const lv = Object.keys(pf.fps || {}).sort();
      return el("div.pn-mdev", {},
        el("h4", {}, pf.screen || K.t("panels.fx.aDevice"), pf.vw ? el("small", {}, ` · ${K.t("panels.fx.pageSize", { w: pf.vw, h: pf.vh })}`) : null, el("small.r", {}, pf.at ? new Date(pf.at).toLocaleString() : "")),
        lv.length ? lv.map((l) => line(LOADS[l] || l, el("b", {}, `${pf.fps[l]} fps`), +pf.fps[l] < 24 ? el("span.pn-w", {}, ` ${K.t("panels.fx.stutters")}`) : "")) : el("small", {}, K.t("panels.fx.noNumbers")),
        pf.autoCap ? el("small", {}, K.t(now ? "panels.fx.autoCapFixed" : "panels.fx.autoCap", { level: LOADS[pf.autoCap] })) : null,
        pf.bench ? benchResult(pf.bench) : null, pf.test ? testResult(pf.test) : null, pf.ua ? el("small.pn-ua", {}, pf.ua) : null);
    };
    const reread = async () => { if (onPage() && tab === "effects" && cur) { const d = await loadPanel(cur).catch(() => null); if (d) { data = d; drawSetup(); } } };
    const runTest = keyed(el("button.btn", { type: "button", onclick: async () => {
      runTest.disabled = true;
      try {
        const r = await api(`/api/manage/panels/${encodeURIComponent(data.id)}`, { action: "perftest" });
        if (!r.ok) return toast(r.error || K.t("panels.bench.couldntStart"), true);
        toast(K.t("panels.fx.testStarted"));
        setTimeout(reread, 75000);
      } catch (e) { if (e.message !== "login") toast(K.t("panels.save.offline"), true); }
      finally { setTimeout(() => { runTest.disabled = false; }, 60000); }
    } }, ic("activity", 15), K.t("panels.fx.runTest")), "");
    return el("div", {},
      ...G(K.t("panels.fx.group"), [R(K.t("panels.fx.heaviest"), K.t("panels.fx.heaviestHint"),
        seg("effects.maxLoad", [[0, K.t("control.auto")], [1, LOADS[1]], [2, LOADS[2]], [3, LOADS[3]], [4, LOADS[4]]], now, (v) => saveDraw({ "effects.maxLoad": +v }), K.t("panels.fx.heaviest")))],
      K.t("panels.fx.levelsFoot")),
      ...G(K.t("panels.fx.test"), [R(K.t("panels.fx.quickTest"), K.t("panels.fx.quickTestHint"), runTest)]),
      ...G(K.t("panels.kv.benchmark"), [block(M.benchBox({ id: data.id }, data.perf, reread))],
        K.t("panels.fx.benchFoot")),
      ...G(K.t("panels.fx.measured"), [block(...(devs.length ? devs.map(dev) : [el("p.pn-info", {}, K.t("panels.fx.nothingYet"))]))]));
  }

  // ================================================================== Open live (the decision 3)
  // The real page for that panel, in a large window over the Manager. The service decides what it may do (the page's
  // window.PANEL_LIVE): the admin controls it as that panel would; any other login gets it view only.
  const SIZES = [["1280x800", K.t("panels.live.sizeTablet")], ["800x1280", K.t("panels.live.sizePortrait")], ["1920x1080", K.t("panels.live.sizeTv")], ["1024x768", "1024 × 768"], ["1920x1200", "1920 × 1200"]];
  function openLive(p) {
    const admin = M.isAdmin();
    const meas = (p.perf || (cur === p.id && data ? data.perf : []) || []).find((x) => x.vw && x.vh);
    let size = meas ? `${meas.vw}x${meas.vh}` : "1280x800";
    const tabletSize = size;
    if (phone()) size = "fit";   // (v2.8.0: a phone runs the panel at its own size — the panel's phone layout; "Tablet size" for its real look)
    const sizes = SIZES.slice();
    if (meas && !sizes.some(([k]) => k === size)) sizes.unshift([size, K.t("panels.live.thisPanel", { size: `${meas.vw} × ${meas.vh}` })]);
    else if (meas) sizes.forEach((x, i) => { if (x[0] === size) sizes[i] = [x[0], K.t("panels.live.thisPanel", { size: x[0].replace("x", " × ") })]; });   // (the size from its value, never from the words)
    const src = liveUrl(p);
    const frm = el("iframe.pn-lframe", { src, title: K.t(admin ? "panels.live.frameTitle" : "panels.live.frameTitleView", { name: p.name }), allow: "fullscreen" });
    const screen = el("div.pn-lscreen", {}, frm, el("div.pn-lwait", {}, K.t("panels.live.loading")));
    // (v2.9.2) silent by default; "Sound on" in the bar plays this panel's sounds here — remembered per login
    // for this browser session. The page itself (layouts/v4/shared/chime.js) asks window.PANEL_LIVE.sound.
    const SKEY = `skypane.live.sound:${((M.me() || {}).user || "").toLowerCase()}`;
    let soundOn = false;
    try { soundOn = sessionStorage.getItem(SKEY) === "1"; } catch { /* (silent) */ }
    const applySound = () => { try { const w = frm.contentWindow; if (w && w.Chime && w.Chime.setLiveSound) w.Chime.setLiveSound(soundOn); } catch { /* (not ready yet: on load) */ } };
    const soundSw = K.sw(soundOn, (v) => { soundOn = v; try { sessionStorage.setItem(SKEY, v ? "1" : "0"); } catch {} applySound(); }, K.t("live.sound"));
    const soundBox = el("label.pn-lsound", { "data-tip": K.t("live.soundHint") }, el("span", {}, K.t("live.soundLabel")), soundSw);
    frm.addEventListener("load", () => { const w = screen.querySelector(".pn-lwait"); if (w) w.remove(); applySound(); });
    const stage = el("div.pn-lstage", {}, screen);
    const fit = () => {
      if (size === "fit") {
        frm.style.width = `${stage.clientWidth}px`; frm.style.height = `${stage.clientHeight}px`; frm.style.transform = "";
        screen.style.width = `${stage.clientWidth}px`; screen.style.height = `${stage.clientHeight}px`;
        return;
      }
      const [w, h] = size.split("x").map(Number);
      const k = Math.min((stage.clientWidth - 24) / w, (stage.clientHeight - 24) / h, 1.5);
      frm.style.width = `${w}px`; frm.style.height = `${h}px`; frm.style.transform = `scale(${k})`;
      screen.style.width = `${Math.round(w * k)}px`; screen.style.height = `${Math.round(h * k)}px`;
    };
    const sizeSel = el("select.pn-lsize", { "aria-label": K.t("panels.live.sizeLabel"), onchange: (e) => { size = e.target.value; fit(); } },
      sizes.map(([k, n]) => el("option", { value: k, selected: k === size }, n)));
    let closeD = null;
    const closeB = el("button.btn.ghost.pn-lclose", { type: "button", "aria-label": K.t("panels.live.close"), "data-tip": K.t("panels.live.closeTip"), onclick: () => close() }, ic("x", 18));
    const mode = admin ? el("span.pill.acc", { "data-tip": K.t("panels.live.switchTip") }, ic("zap", 13), K.t("panels.live.canSwitch"))
      : el("span.pill.idle", { "data-tip": K.t("panels.live.viewTip") }, ic("eyeoff", 13), K.t("panels.live.viewOnly"));
    const tog = phone() ? el("button.btn.pn-ltog", { type: "button", "aria-pressed": "false", onclick: () => {
      size = size === "fit" ? tabletSize : "fit"; tog.setAttribute("aria-pressed", String(size !== "fit")); tog.textContent = size === "fit" ? K.t("panels.live.tabletSize") : K.t("panels.live.phoneSize"); fit(); } }, K.t("panels.live.tabletSize")) : null;
    const bar = el("div.pn-lbar", {}, el("span.pn-lic", {}, ic("tablet", 18)), el("div.pn-lt", {}, el("b", {}, p.name), el("small", {}, K.t("panels.live.addrLive", { address: address(p) }))), mode,
      el("span.sp"), soundBox, sizeSel, tog,
      el("button.btn", { type: "button", "aria-label": K.t("panels.live.reload"), "data-tip": K.t("panels.live.reloadTip"), onclick: () => { frm.src = src; } }, ic("refresh", 15)),
      el("a.btn", { href: src, target: "_blank", rel: "noopener", "aria-label": K.t("panels.live.newTabLabel"), "data-tip": K.t("panels.live.newTabTip") }, ic("arrowR", 15), el("span.bl", {}, K.t("panels.live.newTab"))),
      closeB);
    const foot = el("div.pn-lfoot", {}, admin
      ? K.t("live.footControl")
      : K.t("live.footView"));
    const shade = el("div.pn-live", { role: "dialog", "aria-modal": "true", "aria-label": K.t("panels.live.frameTitle", { name: p.name }) }, bar, stage, foot);
    const ro = window.ResizeObserver ? new ResizeObserver(fit) : null;
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (ro) ro.disconnect();
      window.removeEventListener("resize", fit); window.removeEventListener("hashchange", close);
      document.documentElement.classList.remove("pn-live-open"); frm.src = "about:blank"; if (closeD) closeD();
    }
    closeD = M.dialog(shade, closeB, close);
    window.addEventListener("hashchange", close);   // (Back, a link, search → another page: the live window goes too)
    document.documentElement.classList.add("pn-live-open");
    if (ro) ro.observe(stage); else window.addEventListener("resize", fit);
    fit();
  }

  // ================================================================== in the shell
  S.page("panels", { title: K.t("panels.shared.aboutpanels"), group: "main", icon: "tablet", allowed: () => M.can("panels"), words: "tablet wall screen status online offline benchmark setup layout live",
    views: [["status", K.t("panels.shared.status"), "grid", K.t("panels.view.statusDesc")], ["setup", K.t("panels.view.setup"), "settings", K.t("panels.view.setupDesc")]],
    render: (rest) => route(rest || []) });
  // (the others' way in: search → a panel, Health / Overview / Devices → Open)
  M.openPanel = (id, layout) => (layout ? M.go(`panels/${id}/layout`) : M.go(`panels/setup/${id}`));
  M.renderPanels = () => { if (S.route().page === "panels") route(S.route().rest); };
  // (v3.0.2, pairing.js) a tablet approved, unlinked, moved; a panel renamed or removed: the list read again and the
  // view drawn again where it is (gone: the panel that was removed)
  M.panelsAfter = async (o = {}) => {
    try { await loadList(true); } catch { return; }
    if (S.route().page !== "panels" || builderUp()) return;
    if (o.gone && o.gone === cur) { dropPending(); cur = null; data = null; }
    if (phone()) return drawCarousel();
    if (viewNow() === "setup" && cur && shown(cur)) { const d = await loadPanel(cur).catch(() => null); if (d && cur === d.id) { data = d; drawSetup(); } return; }
    if (viewNow() === "status" || !cur) showStatus();
  };
  M.panelsTopic = () => (!$page || !$page.isConnected ? "panels-status" : $page.dataset.view === "setup" ? TOPIC[tab] || "panel-general" : "panels-status");
})();
