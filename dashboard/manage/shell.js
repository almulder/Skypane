// Skypane Manager — the shell (v2.3.0; the design notes, the choices in the design notes and
// the design notes): the sidebar (rail), the top bar (health pill, search, theme, avatar menu), the hash
// router with its unsaved-changes guard, the view-switch framework and each login's prefs (theme, pinned, views).
//
// The rail: collapsed by default; › expands it over the page, the pin keeps it open and pushes the page, ‹ collapses
// it; Esc, a click outside or picking a page closes an expand that isn't pinned. Nothing opens from hovering or from
// clicking an item. Collapsed, each item has a tooltip to its right (one tooltip on <body>, above everything).
// Routes: #overview (v2.3.1: where a login starts), #devices, #panels/status|setup/<id>[/<tab>], #panels/<id>/layout, #cameras, #backgrounds, #icons, #cards, #accounts, #integrations (old:
// #settings), #guest, #health, #account, #help/<topic> (Help opens over the page — the page under it stays as it is).
// Pages register with Shell.page(key, {title, group, icon, views, render, allowed}); a page with two views gets the
// view switch (v2.4.0: Devices — Basic / Detailed; v2.5.0: Panels — Status / Setup; the others come with the pages rebuilt
// in the next releases).
// Built with DOM calls + textContent only: names from the server are never parsed as HTML.
(function () {
  const M = window.Manage, K = window.Kit;
  const { el } = M, ic = K.icon;
  const html = document.documentElement;
  const $main = M.$main, $app = document.querySelector(".app");
  const typing = () => { const a = document.activeElement; return !!a && (/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) || a.isContentEditable); };

  // ================================================================== prefs (per login: /api/manage/prefs)
  // theme: light | dark | night; pinned; views {page: view}; defaultView: last (a switch is remembered) | fixed
  const PKEY = "skypane.manager.prefs", THEMES = [["light", "sun", K.t("shell.theme.light")], ["dark", "moon", K.t("shell.theme.dark")], ["night", "night", K.t("shell.theme.night")]];
  // (v2.7.0) lang (English only so far), display (the name shown), color (the avatar's)
  const COLORS = { violet: "#7c5cff", teal: "#14b8a6", amber: "#f59e0b", red: "#ef4444", blue: "#3b82f6" };
  const fresh = () => ({ theme: "dark", pinned: false, views: {}, defaultView: "last", lang: "en", display: "", color: "violet" });
  // (only what is known, of the right kind: the copy in localStorage may be from an older page or edited by hand)
  function cleanPrefs(p) {
    const out = fresh();
    if (!p || typeof p !== "object") return out;
    if (THEMES.some(([t]) => t === p.theme)) out.theme = p.theme;
    if (typeof p.pinned === "boolean") out.pinned = p.pinned;
    if (p.defaultView === "fixed") out.defaultView = "fixed";
    if (p.views && typeof p.views === "object") for (const [k, v] of Object.entries(p.views)) if (/^[a-z][a-z0-9-]{0,31}$/.test(k) && /^[a-z][a-z0-9-]{0,31}$/.test(v)) out.views[k] = v;
    // (v3.0.0) any language this Manager has: a code with its "lang.<code>" name in the table — the same list as the
    // server's manager_prefs.LANGS (docs/translating.md: adding a language adds both)
    if (typeof p.lang === "string" && /^[a-z]{2,3}(-[A-Z]{2})?$/.test(p.lang)
      && Object.prototype.hasOwnProperty.call((window.SKYPANE_STRINGS || {}).en || {}, `lang.${p.lang}`)) out.lang = p.lang;
    if (typeof p.display === "string") out.display = p.display.slice(0, 40);
    if (Object.prototype.hasOwnProperty.call(COLORS, p.color)) out.color = p.color;
    return out;
  }
  let prefs = fresh(), cachedFor = "";
  try { const c = JSON.parse(localStorage.getItem(PKEY) || "null"); prefs = cleanPrefs(c); cachedFor = (c && c.user) || ""; } catch {}
  const mirror = () => { try { localStorage.setItem(PKEY, JSON.stringify({ ...prefs, user: (M.me() || {}).user || "" })); } catch {} };
  let sendTimer = null, unsent = null;
  // a change: on screen at once, in this browser's copy, then to the server (a few changes in a row: one request)
  function savePrefs(change) {
    if (change.views) {
      const v = { ...prefs.views };
      for (const [k, x] of Object.entries(change.views)) { if (x == null) delete v[k]; else v[k] = x; }
      prefs = { ...prefs, ...change, views: v };
    } else prefs = { ...prefs, ...change };
    mirror();
    if (!M.me() || M.isDemo()) return;   // (the demo: this browser only)
    unsent = { ...(unsent || {}), ...change, ...(change.views ? { views: { ...((unsent || {}).views || {}), ...change.views } } : {}) };
    clearTimeout(sendTimer);
    sendTimer = setTimeout(async () => {
      const body = unsent; unsent = null;
      try { const r = await M.api("/api/manage/prefs", body); if (r && r.ok === false) M.toast(K.t("shell.prefs.notSaved", { what: r.error || K.t("shell.prefs.yours") }), true); }
      catch (e) {   // (the server out of reach: kept in this browser — sent again in 15 s, merged with any newer change)
        if (e.message === "login") return;
        const newer = unsent || {};
        unsent = { ...body, ...newer, ...(body.views || newer.views ? { views: { ...(body.views || {}), ...(newer.views || {}) } } : {}) };
        clearTimeout(sendTimer);
        sendTimer = setTimeout(() => savePrefs({}), 15000);
      }
    }, 400);
  }
  // what's still waiting to be sent, now (Sign out, leaving the page: keepalive outlives the page)
  function flushPrefs() {
    clearTimeout(sendTimer);
    const body = unsent; unsent = null;
    if (!body || !M.me() || M.isDemo()) return Promise.resolve();
    return fetch("/api/manage/prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true })
      .catch(() => {});
  }
  window.addEventListener("pagehide", () => { flushPrefs(); });
  // signed in: this browser's copy at once when it is this login's, then the server's (it wins)
  async function loadPrefs() {
    const me = (M.me() || {}).user || "";
    if (cachedFor !== me) { prefs = fresh(); applyPrefs(); }
    cachedFor = me;
    if (M.isDemo()) { mirror(); return; }
    try {
      const r = await M.api("/api/manage/prefs");
      if (r && r.status === 200 && ((M.me() || {}).user || "") === me) { prefs = cleanPrefs(r); mirror(); applyPrefs(); }
    } catch {}
  }
  function applyPrefs() { setTheme(prefs.theme, true); setPinned(prefs.pinned, true); drawViewSwitch(); drawAvatar(); }

  function setTheme(t, quiet) {
    if (!THEMES.some(([k]) => k === t)) t = "dark";
    html.dataset.theme = t;
    for (const b of document.querySelectorAll("[data-theme-pick]")) {
      const on = b.dataset.themePick === t;
      b.classList.toggle("on", on); b.setAttribute(b.getAttribute("role") === "radio" ? "aria-checked" : "aria-pressed", String(on));
    }
    if (!quiet && t !== prefs.theme) savePrefs({ theme: t });
  }

  // ================================================================== pages
  const PAGES = new Map();
  let railBuilt = false;   // (the rail is drawn once the built-in pages are in; a page added later draws it again)
  const GROUPS = { main: "", manage: K.t("shell.group.manage"), admin: K.t("shell.group.admin"), foot: "", none: "" };
  // Shell.page(key, {title, group: main|manage|admin|foot|none, icon, views: [[key, name, icon, what]…], render(rest), allowed(),
  // demoHidden, hidden (not in the rail)}) — a page added later (or rebuilt) replaces the one with that key
  function page(key, spec) { PAGES.set(key, { key, group: "none", views: [], allowed: () => true, ...spec }); if (railBuilt) drawRail(); }
  // (v2.7.0) a page's group may depend on who is signed in (Guest Wi-Fi: Admin for an admin, Manage for a login allowed it)
  const gOf = (p) => (typeof p.group === "function" ? p.group() : p.group);
  const isDemo = () => M.isDemo();
  const allowed = (k) => { const p = PAGES.get(k); return !!p && !(p.demoHidden && isDemo()) && p.allowed() !== false; };
  // where a login starts: the Overview (v2.3.1, every login), else Devices, its panel(s), the first page it may open
  const firstPage = () => ["overview", "devices", "panels", "backgrounds", "icons", "cards", "cameras", "guest"].find(allowed) || (allowed("account") ? "account" : "health");
  // the old page keys (Manage.go("settings"), Manage.tab() === "settings" in the files not rebuilt yet)
  const OLD = { settings: "integrations" }, NEWOLD = { integrations: "settings" };

  // ---------- the pages that are still the old ones: their bodies in the new shell ----------
  const legacy = (name, ...args) => () => { const f = M[name]; if (f) return f(...args); };
  page("overview", { title: K.t("shell.page.overview"), group: "main", icon: "dash", words: "home dashboard glance alerts acknowledge", render: legacy("renderOverview") });   // (overview.js)
  page("devices", { title: K.t("shell.shared.aboutdevices"), group: "main", icon: "devices", allowed: () => M.can("devices") });   // (v2.4.0: devices.js registers the page itself — Basic / Detailed)
  page("panels", { title: K.t("shell.shared.aboutpanels"), group: "main", icon: "tablet", allowed: () => M.can("panels") });   // (v2.5.0: panels.js registers the page itself — Status / Setup)
  // (v2.6.0: cameras.js and media.js register these pages themselves — Live / Setup, Gallery / List)
  page("cameras", { title: K.t("shell.shared.aboutcameras"), group: "manage", icon: "camera", allowed: () => M.can("cameras"), demoHidden: true });
  page("backgrounds", { title: K.t("shell.page.backgrounds"), group: "manage", icon: "image", allowed: () => M.can("backgrounds") });
  page("icons", { title: K.t("shell.page.icons"), group: "manage", icon: "shapes", allowed: () => M.can("icons") });
  page("cards", { title: K.t("shell.page.cards"), group: "manage", icon: "cards", allowed: () => M.can("cards") });
  page("accounts", { title: K.t("shell.page.accounts"), group: "admin", icon: "users", allowed: () => M.isAdmin(), demoHidden: true, words: "logins users permissions", render: legacy("renderAccounts") });
  page("integrations", { title: K.t("shell.page.integrations"), group: "admin", icon: "link", allowed: () => M.isAdmin(), words: "settings hubitat protect unifi mqtt calendars",
    render: legacy("renderSettings") });
  page("guest", { title: K.t("shell.page.guest"), group: "admin", icon: "wifi", allowed: () => M.can("guest_wifi"), demoHidden: true, words: "wifi network qr", render: legacy("renderGuest") });
  page("health", { title: K.t("shell.page.health"), group: "none", icon: "activity", words: "status hub broker cameras panels problems log", render: legacy("renderHealth") });
  page("account", { title: K.t("shell.page.account"), group: "none", icon: "user", demoHidden: true, words: "password theme appearance sidebar", render: legacy("renderAccount") });
  page("help", { title: K.t("shell.page.help"), group: "foot", icon: "help", key2: "F1" });

  // ================================================================== the router
  let cur = { page: null, rest: [] }, signedIn = false;
  const str = (r) => [r.page, ...r.rest].filter(Boolean).map(encodeURIComponent).join("/");
  function parse(target) {
    let s = String(target || "").replace(/^#\/?/, "");
    try { s = decodeURIComponent(s); } catch {}
    const parts = s.split("/").filter(Boolean).slice(0, 4);
    const pg = OLD[parts[0]] || parts[0] || "";
    return { page: pg, rest: parts.slice(1).filter((x) => /^[\w-]{1,40}$/.test(x)) };
  }
  // open a route (the rail, search, Manage.go): after the unsaved-changes question; true = opened
  async function go(target) {
    let r = typeof target === "string" ? parse(target) : target;
    if (r.page === "help") { if (M.help) M.help(r.rest[0]); return true; }
    if (!allowed(r.page)) r = { page: firstPage(), rest: [] };
    if (!(await M.leaveOk())) return false;
    show(r, true);
    return true;
  }
  function show(r, push) {
    // (v3.0.5) another page starts afresh: its Undo steps never act on a page that isn't on screen (the sidebar's
    // links use pushState, so no hashchange tells reorder.js)
    if ((!cur || cur.page !== r.page) && K.history && K.history.clear) K.history.clear();
    cur = { page: r.page, rest: r.rest.slice() }; crumbExtra = "";
    const h = `#${str(cur)}`;
    // (v2.8.0: never the phone's sheet guard copied into a page's own entry — phone.js)
    const st0 = history.state && history.state.help ? null : history.state;
    const st = st0 && st0.pguard ? (({ pguard, ...o }) => (Object.keys(o).length ? o : null))(st0) : st0;
    if (location.hash !== h) history[push ? "pushState" : "replaceState"](st, "", h);
    closeRail(); closePops(); hideTip();
    markRail(); crumb();
    $main.dataset.route = cur.page;
    delete $main.dataset.page;   // (opened, not drawn again: it starts at the top — Manage.swap)
    window.scrollTo(0, 0);
    const p = PAGES.get(cur.page);
    // (v2.9.0 gate 2: a phone shows skeleton rows at once — the page replaces them as soon as it has drawn)
    if (isPhone() && p && p.render) $main.replaceChildren(el("div.p-skel", { role: "status", "aria-label": K.t("common.loading") }, el("i"), el("i"), el("i"), el("i")));
    if (p && p.render) p.render(cur.rest);
    drawViewSwitch();
    if (window.DemoBar && window.DemoBar.page) window.DemoBar.page(K.t("shell.demo.page", { page: NEWOLD[cur.page] || cur.page }));   // (the demo's activity log)
    routed(true);
  }
  // (v2.9.2: the phone's pull to refresh) the page on screen read and drawn again where it is — no skeleton, no
  // jump to the top; resolves once its render has (a page whose render isn't async: at once)
  async function reload() {
    const p = cur.page && PAGES.get(cur.page);
    if (!p || !p.render) return false;
    if (!(await M.leaveOk())) return null;   // (gate 1: unsaved changes ask first, as leaving would — "no": nothing read)
    window.dispatchEvent(new Event("manage:refresh"));   // (a page's own short cache — the panels' list — is read again)
    await p.render(cur.rest.slice());
    return true;
  }
  // (v2.8.0) the phone shell's tabs and ‹ Back follow the route: Shell.onRoute(fn) — fn({page, rest}, opened)
  const routeFns = [];
  const routed = (opened) => { for (const f of routeFns) { try { f({ page: cur.page, rest: cur.rest.slice() }, opened); } catch {} } };
  // a page moved inside itself (a panel opened, the builder opened or closed): the address follows, no new history step
  function sync(rest, extra) {
    if (!signedIn || !cur.page) return;
    cur.rest = (rest || []).map(String).filter((x) => /^[\w-]{1,40}$/.test(x));
    crumbExtra = extra || "";
    const h = `#${str(cur)}`;
    if (location.hash !== h && !/^#help/.test(location.hash)) history.replaceState(history.state, "", h);
    crumb();
    routed(false);
  }
  // the address changed by itself (Back / Forward, a typed or pasted link)
  // (v2.8.0, gate 1: Back pressed again while the unsaved question is up — no second question: that step is undone
  // with Forward, and its own hashchange ignored; the first question decides)
  let leaving = false, undoing = 0;
  window.addEventListener("hashchange", async () => {
    if (leaving) { if (undoing) { undoing--; return; } undoing++; history.forward(); return; }
    const r = parse(location.hash);
    if (r.page === "help") { if (M.helpRoute) M.helpRoute(r.rest[0]); return; }   // (Help opens over the page)
    if (M.helpHide) M.helpHide();
    if (!signedIn) return;
    if (str(r) === str(cur)) return;
    const want = allowed(r.page) ? r : { page: firstPage(), rest: [] };
    const was = `#${str(cur)}`;
    leaving = true;
    let ok;
    try { ok = await M.leaveOk(); } finally { leaving = false; undoing = 0; }
    if (!ok) { history.replaceState(history.state, "", was); return; }   // ("Stay": the old address back)
    show(want, false);
  });

  // ================================================================== the night sky (Skypane night only; CSS shows it)
  const SVGNS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const sky = el("div.sky", { "aria-hidden": "true" }, el("div.moon"),
    Array.from({ length: 46 }, (_, i) => el("i", { style: `left:${(i * 37 + 11) % 100}%;top:${(i * 23) % 48}%;opacity:${(0.15 + ((i * 7) % 6) / 16).toFixed(2)}` })));
  const ridges = svgEl("svg", { viewBox: "0 0 1280 330", preserveAspectRatio: "none" });
  ridges.append(svgEl("path", { d: "M0 150 L180 50 L300 120 L460 20 L640 130 L780 70 L960 150 L1110 50 L1280 120 L1280 330 L0 330Z", fill: "#5b3cb8", opacity: ".7" }),
    svgEl("path", { d: "M0 220 L160 150 L360 210 L560 130 L760 220 L980 160 L1280 210 L1280 330 L0 330Z", fill: "#33207a" }),
    svgEl("path", { d: "M0 290 L240 240 L520 290 L820 250 L1280 290 L1280 330 L0 330Z", fill: "#1a0e48" }));
  sky.append(ridges);
  document.body.prepend(sky);

  // ================================================================== the rail
  const rail = el("nav.rail#rail", { "aria-label": K.t("shell.rail.main") });
  const pinB = el("button.rpin.fade", { type: "button", "aria-pressed": "false", "aria-label": K.t("shell.rail.pin"), "data-tip": K.t("shell.rail.pin"), "data-tip-pos": "b" }, ic("pin", 16));
  const colB = el("button.rcol.fade", { type: "button", "aria-label": K.t("shell.rail.collapseAria"), "data-tip": K.t("shell.rail.collapse"), "data-tip-pos": "b" }, ic("chevL", 16));
  const expB = el("button.rexp", { type: "button", "aria-label": K.t("shell.rail.expandAria"), "aria-expanded": "false", "data-tip": K.t("shell.rail.expand") }, ic("chevR", 14));
  const wsSub = el("small.ver", { title: K.t("shell.rail.version") });   // (manage.js fills every .ver)
  const railBody = el("div.rbody");
  rail.append(el("div.rhead", {}, el("span.lg", {}, el("img", { src: "../assets/skypane.svg", alt: "" })),   // i18n-ok
    el("div.wsn.fade", {}, el("b", {}, "Skypane"), wsSub), pinB, colB), expB, railBody);   // i18n-ok (the name)
  document.body.insertBefore(rail, $app);
  // (v2.4.1) "Skip to content": the first Tab stop — past the sidebar and the top bar to the page (a button, not a
  // #main link: the address is the router's)
  const skip = el("button.skip", { type: "button", onclick: () => { $main.setAttribute("tabindex", "-1"); $main.focus(); } }, K.t("shell.skip"));
  document.body.insertBefore(skip, rail);
  function drawRail() {
    railBuilt = true;
    const item = (p) => el("button.rn", { type: "button", "data-page": p.key, "aria-label": p.title }, ic(p.icon, 19), el("span.fade", {}, p.title),
      p.key2 ? el("kbd.fade", {}, p.key2) : null);
    setTimeout(paintBadges, 0);
    const grp = (g, cls, head) => {
      const its = [...PAGES.values()].filter((p) => gOf(p) === g && !p.hidden).map(item);
      return el("div.rgrp" + (cls || ""), { "data-group": g }, head, its);
    };
    railBody.replaceChildren(grp("main"),
      grp("manage", "", el("div.rgh", {}, el("span.fade", {}, K.t("shell.group.manage")))),
      grp("admin", ".radm", el("div.rgh", {}, el("span.adm", { "aria-hidden": "true" }, K.t("shell.rail.adminBadge")), el("span.fade", {}, K.t("shell.group.admin")), el("span.tag-a.fade", {}, K.t("shell.rail.adminOnly")))),
      el("div.sp"), el("div.rfoot", {}, [...PAGES.values()].filter((p) => p.group === "foot").map(item)));
    showNav();
  }
  // (v3.0.2) a count on a rail item — Panels: the unread pairing notices and the tablets waiting (pairing.js). badge(key,
  // n, words): 0 takes it away; the words are its name for a screen reader and its tooltip
  const badges = new Map();
  function badge(key, n, words) {
    if (n > 0) badges.set(key, [n, words || ""]); else badges.delete(key);
    paintBadges();
  }
  function paintBadges() {
    for (const b of rail.querySelectorAll(".rn[data-page]")) {
      const [n, words] = badges.get(b.dataset.page) || [0, ""], old = b.querySelector(".rbadge");
      if (old) old.remove();
      const page = PAGES.get(b.dataset.page);
      b.setAttribute("aria-label", n && page ? `${page.title} · ${words}` : page ? page.title : b.getAttribute("aria-label"));   // i18n-ok (two page words)
      if (n) b.append(el("span.rbadge", { "aria-hidden": "true", title: words }, n > 99 ? "99+" : String(n)));   // i18n-ok
    }
  }
  // only the pages this login may open (the server refuses the rest anyway); a group with none left goes too
  function showNav() {
    for (const b of rail.querySelectorAll(".rn[data-page]")) b.hidden = b.dataset.page !== "help" && !allowed(b.dataset.page);
    for (const g of rail.querySelectorAll(".rgrp")) g.hidden = !g.querySelector(".rn:not([hidden])");
    markRail();
  }
  function markRail() {
    for (const b of rail.querySelectorAll(".rn[data-page]")) {
      const on = b.dataset.page === cur.page;
      b.classList.toggle("cur", on);
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    }
  }
  const isPinned = () => html.classList.contains("pinned") && !isPhone();
  let scrim = null;
  // byKey: opened with the keyboard (Enter / Space on ›) — the focus goes into it (› itself is hidden then)
  function openRail(byKey) {
    if (isPinned()) return;
    rail.classList.add("open"); expB.setAttribute("aria-expanded", "true"); menuB.setAttribute("aria-expanded", "true");
    if (!scrim) { scrim = el("div.rscrim", { onclick: () => closeRail() }); document.body.append(scrim); }
    hideTip();
    const f = rail.querySelector(".rn.cur:not([hidden])") || rail.querySelector(".rn:not([hidden])");
    if ((isPhone() || byKey === true) && f) f.focus({ preventScroll: true });
  }
  // (Tab goes round inside an expand that isn't pinned: the page behind the scrim isn't reachable)
  rail.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !rail.classList.contains("open") || isPinned()) return;
    const f = [...rail.querySelectorAll("button")].filter((x) => !x.hidden && x.offsetParent !== null && getComputedStyle(x).visibility !== "hidden");
    const i = f.indexOf(document.activeElement);
    if (f.length && (i < 0 || (e.shiftKey ? i === 0 : i === f.length - 1))) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
  });
  function closeRail() {
    rail.classList.remove("open"); expB.setAttribute("aria-expanded", String(isPinned())); menuB.setAttribute("aria-expanded", "false");
    if (scrim) { scrim.remove(); scrim = null; }
  }
  // pinned: the rail stays open and the page moves over (the builder measures its room again once the slide is done)
  // (a window narrower than PIN_MIN: a pinned sidebar would leave no room for the page — it collapses there, the choice
  // stays and comes back on a wider window; v2.4.0)
  const PIN_MIN = 640;
  function setPinned(on, quiet) {
    html.classList.toggle("pinned", !!on && window.innerWidth >= PIN_MIN);
    closeRail();
    pinB.setAttribute("aria-pressed", String(!!on));
    pinB.dataset.tip = on ? K.t("shell.rail.unpin") : K.t("shell.rail.pin"); pinB.setAttribute("aria-label", pinB.dataset.tip);
    for (const s of document.querySelectorAll("[data-pin-switch]")) { s.classList.toggle("on", !!on); s.setAttribute("aria-checked", String(!!on)); }
    if (!quiet && !!on !== prefs.pinned) savePrefs({ pinned: !!on });
    setTimeout(() => window.dispatchEvent(new Event("resize")), 220);
  }
  expB.addEventListener("click", (e) => openRail(e.detail === 0));   // (detail 0: Enter / Space, not a click)
  colB.addEventListener("click", () => { if (html.classList.contains("pinned") && !isPhone()) setPinned(false); closeRail(); });
  pinB.addEventListener("click", () => setPinned(!html.classList.contains("pinned")));
  rail.addEventListener("click", (e) => {
    const b = e.target.closest(".rn[data-page]"); if (!b) return;
    if (!isPinned()) closeRail();   // (picking a page closes an expand that isn't pinned)
    if (b.dataset.page === "help") { if (M.help) M.help(); return; }
    go(b.dataset.page);
  });

  // ================================================================== the top bar
  const menuB = el("button.ib.menu-btn", { type: "button", "aria-label": K.t("shell.top.menu"), "aria-expanded": "false", "aria-controls": "rail" }, ic("menu", 20));
  menuB.addEventListener("click", (e) => { if (rail.classList.contains("open")) closeRail(); else openRail(e.detail === 0); });
  const $crumb = el("div.crumb#crumb");
  const healthSlot = el("span.hslot");
  const qin = el("input#qin", { type: "search", placeholder: K.t("shell.search.placeholder"), autocomplete: "off", spellcheck: "false",
    "aria-label": K.t("shell.search.aria"), role: "combobox", "aria-expanded": "false", "aria-controls": "qres", "aria-autocomplete": "list" });
  // (v2.8.0: Cancel — shown on a phone only, phone.css)
  const qcancel = el("button.qcancel", { type: "button", onmousedown: (e) => e.preventDefault(), onclick: () => closeQ(true) }, K.t("control.cancel"));
  const qs = el("div.qs#qs", {}, el("label.qbox", {}, ic("search", 15), qin, el("kbd", {}, K.t("shell.search.kbd"))), qcancel);
  const placeholder = () => { qin.placeholder = window.innerWidth < 1280 ? K.t("shell.search.placeholderShort") : K.t("shell.search.placeholder"); };
  placeholder(); window.addEventListener("resize", placeholder);
  const tsel = el("div.tsel", { role: "radiogroup", "aria-label": K.t("shell.shared.abouttheme") }, THEMES.map(([t, i, n]) =>
    el("button", { type: "button", role: "radio", "data-theme-pick": t, "aria-label": n, "data-tip": n, "aria-checked": "false" }, ic(i, 15))));
  const avInit = el("span.av", { "aria-hidden": "true" });
  const avb = el("button.avb#avb", { type: "button", "aria-haspopup": "menu", "aria-expanded": "false" }, avInit);
  // (topSlot: other files' own top-bar items — Shell.topItem; they fold into the avatar menu first when the bar is full)
  const topSlot = el("span.tslot");
  const topEnd = el("span.tslot.tend");   // (v2.9.3: Shell.topItem(node, {end: true}) — next to the health pill)
  const top = el("header.topbar#top", {}, menuB, $crumb, topSlot, el("span.sp"), topEnd, healthSlot, qs, tsel, avb);
  $app.insertBefore(top, $main);
  tsel.addEventListener("click", (e) => { const b = e.target.closest("[data-theme-pick]"); if (b) setTheme(b.dataset.themePick); });   // i18n-ok
  // (the top bar's real height: the device editor and the builder's bars stick just under it)
  if (window.ResizeObserver) new ResizeObserver(() => { if (top.offsetHeight) html.style.setProperty("--top-h", `${top.offsetHeight}px`); fitSoon(); }).observe(top);

  // ---------- the top bar fits its contents (v2.4.0): whenever they don't fit — a narrow window, the sidebar pinned,
  // a long page name, items another file added (the demo's buttons) — it steps down, one step at a time: the extra
  // items fold into the avatar menu, the search box becomes an icon (it opens over the bar), the theme buttons go
  // (they are in the avatar menu), the health pill shows one dot, the page's name goes. Measured, not guessed.
  const FIT = ["tb-fold", "tb-q", "tb-t", "tb-h", "tb-c"];
  let fitting = false;
  function fitTop() {
    if (fitting || !top.isConnected || qs.classList.contains("open")) return;
    fitting = true;
    // (measured with the search box's width transition off: its end width, not a frame of the animation)
    top.classList.add("tb-measure");
    top.classList.remove(...FIT);
    const fits = () => top.scrollWidth <= top.clientWidth + 1;
    for (const c of FIT) { if (fits()) break; if (c !== "tb-fold" || topSlot.querySelector("[data-tb-item]") || topEnd.querySelector("[data-tb-item]")) top.classList.add(c); }
    void top.offsetWidth;
    top.classList.remove("tb-measure");
    fitting = false;
  }
  // (a part of the bar redrawn or grown — the health pill every 30 s, the crumb, an item added, the web font arriving:
  // measured again; the steps it takes itself end where they started, so this settles at once)
  // (the observers only ask for a fit on the next frame — one pending at a time: fitTop changes the bar's classes, and
  // doing that inside a ResizeObserver callback would start "ResizeObserver loop" warnings)
  let fitQueued = false;
  function fitSoon() {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(() => { fitQueued = false; fitTop(); });
  }
  const partRO = window.ResizeObserver ? new ResizeObserver(fitSoon) : null;
  let watched = [];
  const watchParts = () => {   // (the bar's children now: new ones watched, removed ones let go)
    if (!partRO) return;
    const now = [...top.children];
    for (const c of watched) if (!now.includes(c)) partRO.unobserve(c);
    for (const c of now) if (!watched.includes(c)) partRO.observe(c);
    watched = now;
  };
  new MutationObserver(() => { watchParts(); fitSoon(); }).observe(top, { childList: true, subtree: true, characterData: true });
  watchParts();
  window.addEventListener("resize", fitSoon);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitSoon);
  // Shell.topItem(node, {label, icon, run}) — a top-bar item of another file's (e.g. the demo's buttons), put after the
  // page's name. When the bar is full it folds away first and shows in the avatar menu instead:
  //   label  the menu's words (default: the node's own text)
  //   icon   a Kit icon name for the menu (default "arrowR")
  //   run    what a click in the menu does (default: clicks the node)
  // The node gets data-tb-item (the shell's own mark — nothing a host page sets). Returns the node.
  const topItems = [];
  function topItem(node, opts = {}) {
    node.setAttribute("data-tb-item", "");
    topItems.push({ node, label: opts.label || node.textContent.trim(), icon: opts.icon || "arrowR", run: opts.run || (() => node.click()),
      group: opts.group || null, external: !!opts.external });   // (v2.9.3: the phone's More — its own group; an external link)
    (opts.end ? topEnd : topSlot).append(node);
    fitSoon();
    return node;
  }

  // where you are: Manage › Cameras, Panels › Office panel
  let crumbExtra = "";
  function crumb() {
    const p = PAGES.get(cur.page);
    const parts = [];
    if (p && GROUPS[gOf(p)]) parts.push(GROUPS[gOf(p)]);
    if (p) parts.push(p.title);
    if (crumbExtra) parts.push(crumbExtra);
    $crumb.replaceChildren(...parts.flatMap((x, i) => (i === parts.length - 1 ? [el("b", {}, x)] : [el("span", {}, x), ic("chevR", 14)])));
    document.title = p ? `${crumbExtra || p.title} · Skypane` : "Skypane";
  }

  // ---------- popovers (fixed, on <body>: above everything but a dialog and the tooltip) ----------
  const pops = new Set();
  function openPop(pop, anchor, onClose) {
    closePops(pop); hideTip();
    if (!pop.isConnected) document.body.append(pop);
    pop.hidden = false;
    pops.add(pop); pop._close = onClose;
    place(pop, anchor);
  }
  function place(pop, anchor) {
    const r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    pop.style.width = "";
    // (a phone: the search results the window's width under the box; anything else never wider than the window)
    if (pop.offsetWidth > vw - 16 || (isPhone() && pop === qres)) pop.style.width = `${vw - 16}px`;
    const w = Math.min(pop.offsetWidth, vw - 16);
    pop.style.top = `${Math.round(r.bottom + 8)}px`;
    pop.style.left = `${Math.round(isPhone() && pop === qres ? 8 : Math.max(8, Math.min(r.right - w, vw - w - 8)))}px`;
    pop.style.maxHeight = `${Math.max(160, Math.round(window.innerHeight - r.bottom - 18))}px`;
    pop.style.overflowY = "auto";
  }
  function closePops(except) {
    for (const p of [...pops]) {
      if (p === except) continue;
      p.hidden = true; pops.delete(p);
      if (p._close) p._close();
    }
  }
  document.addEventListener("pointerdown", (e) => {
    if (!pops.size) return;
    if ([...pops].some((p) => p.contains(e.target)) || e.target.closest(".avb, .hbtn, .qs")) return;
    closePops();
  });
  window.addEventListener("resize", () => {
    closePops(); hideTip();
    if (prefs.pinned && html.classList.contains("pinned") !== (window.innerWidth >= PIN_MIN)) html.classList.toggle("pinned", window.innerWidth >= PIN_MIN);   // (PIN_MIN: setPinned)
  });

  // ================================================================== the avatar menu
  const amenu = el("div.pop.amenu#amenu", { role: "menu", "aria-label": K.t("shell.page.account"), hidden: true });
  function drawAvatar() {
    const me = M.me() || {};
    avInit.textContent = (prefs.display || me.user || "?").slice(0, 1).toUpperCase();
    avInit.style.background = COLORS[prefs.color] || "";
    const label = K.t("shell.avatar.label", { user: me.user || "", role: me.owner ? K.t("shell.shared.owner") : me.admin ? K.t("shell.group.admin") : K.t("shell.avatar.user") });
    avb.setAttribute("aria-label", K.t("shell.avatar.aria", { label })); avb.dataset.tip = label;
  }
  function drawMenu() {
    const me = M.me() || {}, demo = isDemo();
    const item = (icon, words, onclick, extra) => el("button.mi", { type: "button", role: "menuitem", onclick: () => { closePops(); onclick(); } }, ic(icon, 16), words, extra || null);
    const pinS = el("button.sw" + (isPinned() ? ".on" : ""), { type: "button", role: "menuitemcheckbox", "data-pin-switch": "", "aria-checked": String(html.classList.contains("pinned")),
      "aria-label": K.t("shell.rail.pin"), onclick: () => setPinned(!html.classList.contains("pinned")) });
    const viewsN = [...PAGES.values()].filter((p) => p.views.length > 1 && allowed(p.key)).length;
    amenu.replaceChildren(...[
      el("div.mh", {}, el("span.av", { "aria-hidden": "true", style: `background:${COLORS[prefs.color] || ""}` }, (prefs.display || me.user || "?").slice(0, 1).toUpperCase()),
        el("div", {}, el("b", {}, prefs.display || me.user || ""), el("small", {}, me.owner ? K.t("shell.menu.roleOwner")
          : me.admin ? K.t("shell.menu.roleAdmin") : demo ? K.t("shell.menu.roleDemo") : K.t("shell.menu.roleUser")))),
      allowed("account") ? item("user", K.t("shell.page.account"), () => go("account")) : null,
      allowed("account") ? item("key", K.t("shell.menu.password"), () => { M.accountFocus = "password"; go("account"); }) : null,
      allowed("account") ? el("hr") : null,
      el("div.ml", {}, K.t("shell.menu.appearance")),
      el("div.tseg.seg", { role: "radiogroup", "aria-label": K.t("shell.shared.abouttheme") }, THEMES.map(([t, i, n]) =>
        el("button" + (prefs.theme === t ? ".on" : ""), { type: "button", role: "radio", "data-theme-pick": t, "aria-checked": String(prefs.theme === t),
          onclick: () => setTheme(t) }, ic(i, 15), t === "night" ? K.t("shell.theme.nightShort") : n))),
      isPhone() ? null : el("div.arow", {}, ic("pin", 16), el("span", {}, K.t("shell.rail.pin")), pinS),
      allowed("account") ? item("rows", K.t("shell.menu.views"), () => { M.accountFocus = "views"; go("account"); }, el("small", {}, viewsN ? K.t("shell.menu.viewsN", { n: viewsN }) : "")) : null,
      // (the top bar's own extra items, folded away while it is full)
      ...(top.classList.contains("tb-fold") ? topItems.filter((t) => t.node.isConnected).map((t) => item(t.icon, t.label, t.run)) : []),
      // (v2.9.3) the donation link — a plain link to the author's page, in a new tab
      el("hr"), M.coffeeLink ? M.coffeeLink("a.mi", { role: "menuitem", onclick: () => closePops() }) : null,
      demo ? null : el("hr"),
      demo ? null : item("logout", K.t("shell.signOut"), () => M.logout())].filter(Boolean));   // (replaceChildren would write a null as "null")
  }
  avb.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!amenu.hidden) return closePops();
    drawMenu();
    openPop(amenu, avb, () => { avb.classList.remove("open"); avb.setAttribute("aria-expanded", "false"); });
    avb.classList.add("open"); avb.setAttribute("aria-expanded", "true");
    const f = amenu.querySelector(".mi"); if (f) f.focus();
  });
  amenu.addEventListener("keydown", (e) => {
    const its = [...amenu.querySelectorAll(".mi, .seg button, .sw")], i = its.indexOf(document.activeElement);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: its.length - 1 }[e.key];
    if (to != null) { e.preventDefault(); its[(to + its.length) % its.length].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePops(); avb.focus(); }
    else if (e.key === "Tab") { e.preventDefault(); closePops(); avb.focus(); }   // (Tab leaves the menu: back on the avatar, not the sidebar)
  });

  // ================================================================== search (Ctrl K)
  const qres = el("div.pop.qres#qres", { role: "listbox", "aria-label": K.t("shell.search.results"), hidden: true });
  let qItems = [], qIdx = 0, panelsCache = null;
  // what this login may open: its pages, its panels, the devices it may change, a few commands
  async function panelList() {
    if (!M.can("panels")) return [];
    if (panelsCache && Date.now() - panelsCache.at < 30000) return panelsCache.list;
    try { const r = await M.api("/api/manage/panels"); panelsCache = { at: Date.now(), list: Array.isArray(r.panels) ? r.panels : [] }; } catch { return []; }
    return panelsCache.list;
  }
  M.onReset(() => { panelsCache = null; });
  // (c.g is the group's id; its heading on screen: QGROUP)
  const QGROUP = { Pages: K.t("shell.search.pages"), Panels: K.t("shell.shared.aboutpanels"), Devices: K.t("shell.shared.aboutdevices"), Commands: K.t("shell.search.commands") };
  function commands() {
    const out = THEMES.map(([t, i, n]) => ({ g: "Commands", t: K.t("shell.cmd.theme", { name: n }), i, run: () => setTheme(t) }));
    if (!isPhone()) out.push({ g: "Commands", t: html.classList.contains("pinned") ? K.t("shell.cmd.unpin") : K.t("shell.rail.pin"), i: "pin", run: () => setPinned(!html.classList.contains("pinned")) });
    if (M.isAdmin() && allowed("panels")) out.push({ g: "Commands", t: K.t("shell.cmd.addPanel"), s: K.t("shell.shared.aboutpanels"), i: "plus", run: async () => { if (await go("panels")) M.focusAddPanel = true; } });
    if (allowed("accounts")) out.push({ g: "Commands", t: K.t("shell.cmd.addLogin"), s: K.t("shell.page.accounts"), i: "users", run: () => go("accounts") });
    if (allowed("backgrounds")) out.push({ g: "Commands", t: K.t("shell.cmd.upload"), s: K.t("shell.page.backgrounds"), i: "upload", run: () => go("backgrounds") });
    out.push({ g: "Commands", t: K.t("shell.cmd.help"), s: "F1", i: "help", run: () => M.help && M.help() });
    if (!isDemo()) out.push({ g: "Commands", t: K.t("shell.signOut"), i: "logout", run: () => M.logout() });
    return out;
  }
  async function buildIndex() {
    const items = [];
    for (const p of PAGES.values()) {
      if (p.key === "help" || p.hidden || !allowed(p.key)) continue;
      items.push({ g: "Pages", t: p.title, s: GROUPS[gOf(p)] || "", w: p.words || "", i: p.icon, run: () => go(p.key) });
      for (const [v, n] of p.views.length > 1 ? p.views : []) items.push({ g: "Pages", t: `${p.title} · ${n}`, s: K.t("shell.search.view"), i: p.icon, deep: true, run: () => go(`${p.key}/${v}`) });
    }
    items.push({ g: "Pages", t: K.t("shell.page.help"), s: "F1", i: "help", run: () => M.help && M.help() });
    for (const p of await panelList()) items.push({ g: "Panels", t: p.name || p.id, s: `${location.host}${p.address || `/${p.id}`}`, i: "tablet", run: () => go(`panels/${p.id}`) });
    const D = allowed("devices") ? M.devices() : null;
    if (D && Array.isArray(D.devices)) {
      for (const c of D.devices) {
        const o = (D.overrides || {})[c.id] || {};
        items.push({ g: "Devices", t: c.label, s: `${o.room || c.room || c.hubRoom || K.t("shell.search.noRoom")} · ${M.roleName(o.as || c.is)}`, i: "devices",
          di: isPhone() && M.deviceIcon ? M.deviceIcon(o.as || c.is) : null,   // (v2.8.0: a phone shows each kind's own icon)
          run: async () => { if (await go("devices")) M.openDevice(c.id); } });
      }
    }
    // (v2.9.0, a phone: the rooms too — each opens its room screen on Devices)
    if (isPhone() && D && Array.isArray(D.devices) && M.roomSlug) {
      const rooms = new Map();
      for (const c of D.devices) { const o = (D.overrides || {})[c.id] || {}; if ((o.as || c.is) === "hidden") continue; const r = o.room || c.room || c.hubRoom || ""; rooms.set(r, (rooms.get(r) || 0) + 1); }   // ("": no room — the slug "none")
      for (const [r, n] of rooms) items.push({ g: "Rooms", t: r ? r : K.t("shell.search.noRoom"), s: K.t("search.roomDevices", { n }), i: "home", run: () => go(`devices/room/${r ? M.roomSlug(r) : "none"}`) });
    }
    return items.concat(commands());
  }
  // (v2.9.0, a phone) the last 8 searches that opened something — this browser, this login; never what was found
  const RKEY = () => `skypane.search.recent:${((M.me() || {}).user || "").toLowerCase()}`;
  const recents = () => { try { const a = JSON.parse(localStorage.getItem(RKEY()) || "[]"); return Array.isArray(a) ? a.filter((x) => typeof x === "string").slice(0, 8) : []; } catch { return []; } };
  const remember = (q) => { try { localStorage.setItem(RKEY(), JSON.stringify([q, ...recents().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8))); } catch {} };
  let index = [];
  async function openQ() {
    if (!qres.hidden) return;
    qs.classList.add("open"); qin.setAttribute("aria-expanded", "true");
    const box = qs.querySelector(".qbox");
    openPop(qres, box, () => { qs.classList.remove("open"); qin.setAttribute("aria-expanded", "false"); setTimeout(fitTop, 200); if (window.Phone && Phone.check) Phone.check(); });
    if (isPhone() && window.Phone && Phone.layer) Phone.layer(() => !qres.hidden, () => closeQ(true));   // (v2.9.0: Back closes it)
    // (the box grows — or opens over the bar — with a short transition: the results go under where it ends up)
    const again = () => { if (!qres.hidden) place(qres, box); };
    box.addEventListener("transitionend", again, { once: true });
    setTimeout(again, 220);
    index = commands(); drawQ();
    index = await buildIndex(); if (!qres.hidden) drawQ();
  }
  function closeQ(blur) { closePops(); qin.value = ""; if (blur) qin.blur(); }
  // the words found, marked (text nodes and <mark>: never parsed)
  function marked(s, q) {
    const i = q ? s.toLowerCase().indexOf(q) : -1;
    return i < 0 ? [s] : [s.slice(0, i), el("mark", {}, s.slice(i, i + q.length)), s.slice(i + q.length)];
  }
  function drawQ() {
    let q = qin.value.trim().toLowerCase();
    const onlyCmd = q.startsWith(">"); if (onlyCmd) q = q.slice(1).trim();
    const hit = (c) => !q || `${c.t} ${c.s || ""} ${c.w || ""}`.toLowerCase().includes(q);
    const counts = {};
    let res = [];
    const rec = !q && !onlyCmd && isPhone() ? recents() : [];
    if (rec.length) res = [...rec.map((x) => ({ g: "Recent", t: x, i: "clock", keep: true, run: () => { qin.value = x; drawQ(); } })),
      { g: "Recent", t: K.t("search.clearRecent"), i: "x", keep: true, run: () => { try { localStorage.removeItem(RKEY()); } catch {} drawQ(); } },
      ...index.filter((c) => c.g === "Pages" && !c.deep).slice(0, 5)];
    else if (!q && !onlyCmd) res = [...index.filter((c) => c.g === "Pages" && !c.deep).slice(0, 5), ...index.filter((c) => c.g === "Panels").slice(0, 3), ...index.filter((c) => c.g === "Commands").slice(0, 3)];
    else {
      for (const g of onlyCmd ? ["Commands"] : isPhone() ? ["Pages", "Devices", "Panels", "Rooms", "Commands"] : ["Pages", "Panels", "Devices", "Commands"]) {   // i18n-ok
        const all = index.filter((c) => c.g === g && hit(c) && !(c.deep && q.length < 3))
          .sort((a, b) => ((a.t.toLowerCase().indexOf(q) + 1 || 999) - (b.t.toLowerCase().indexOf(q) + 1 || 999)) || a.t.localeCompare(b.t));
        counts[g] = all.length;
        res.push(...(onlyCmd || g === "Rooms" ? all : all.slice(0, g === "Devices" ? 6 : 5)));   // (">": every command; every room that matches)
      }
    }
    qItems = res; qIdx = 0;
    if (!res.length) {
      qres.replaceChildren(el("div.qempty", {}, el("b", {}, K.t("shell.search.nothing", { q: qin.value.trim() })), K.t("shell.search.nothingHint")));
      return;
    }
    const kids = []; let g0 = "";
    res.forEach((c, n) => {
      if (c.g !== g0) {
        g0 = c.g;
        kids.push(el("h6", {}, !q && !onlyCmd && c.g === "Pages" ? K.t("shell.search.jump") : c.g === "Recent" ? K.t("search.recent") : c.g === "Rooms" ? K.t("search.rooms") : QGROUP[c.g] || c.g, counts[c.g] > 6 && c.g === "Devices" ? el("span", {}, K.t("shell.search.showingSix", { n: counts[c.g] })) : null));
      }
      kids.push(el("div.qo" + (n === 0 ? ".on" : ""), { role: "option", id: `qo-${n}`, "data-n": String(n), "aria-selected": n === 0 ? "true" : "false" },
        el("span.qi", {}, c.di ? M.iconEl(c.di, 16) : ic(c.i, 15)), el("span", {}, ...marked(c.t, q)), c.s ? el("small", {}, ...marked(c.s, q)) : null, el("kbd.k", { "aria-hidden": "true" }, "↵")));
    });
    kids.push(el("div.qf", {}, el("span", {}, K.t("shell.search.keyMove")), el("span", {}, K.t("shell.search.keyOpen")), el("span", {}, K.t("shell.search.keyClose")), el("span", {}, K.t("shell.search.keyCommands"))));
    qres.replaceChildren(...kids);
    qin.setAttribute("aria-activedescendant", "qo-0");
  }
  function hl() {
    for (const o of qres.querySelectorAll(".qo")) { const on = +o.dataset.n === qIdx; o.classList.toggle("on", on); o.setAttribute("aria-selected", String(on)); }
    const o = qres.querySelector(`.qo[data-n="${qIdx}"]`); if (o) { o.scrollIntoView({ block: "nearest" }); qin.setAttribute("aria-activedescendant", o.id); }
  }
  async function runQ(n) {
    const c = qItems[n]; if (!c) return;
    if (c.keep) { c.run(); qin.focus(); return; }   // (a recent search put back in the box; Clear)
    const typed = qin.value.trim();
    if (isPhone() && typed && !typed.startsWith(">")) remember(typed);
    closeQ(true);
    // (gate 1: a phone's search had a history entry — Back closes it; that entry is gone before anything opens, so Help,
    // a page or a sheet opened by the result is never popped by it)
    if (isPhone() && window.Phone && Phone.settled) await Phone.settled();
    c.run();
  }
  qin.addEventListener("focus", openQ);
  qin.addEventListener("input", () => { if (qres.hidden) openQ(); else drawQ(); });
  qin.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); qIdx = Math.min(qIdx + 1, qItems.length - 1); hl(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); qIdx = Math.max(qIdx - 1, 0); hl(); }
    else if (e.key === "Enter") { e.preventDefault(); runQ(qIdx); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeQ(false); }   // (the focus stays in the box)
    else if (e.key === "Tab") closeQ();
  });
  qres.addEventListener("mousemove", (e) => { const o = e.target.closest(".qo"); if (o && +o.dataset.n !== qIdx) { qIdx = +o.dataset.n; hl(); } });
  qres.addEventListener("mousedown", (e) => { e.preventDefault(); const o = e.target.closest(".qo"); if (o) runQ(+o.dataset.n); });

  // ================================================================== the one tooltip
  const gtip = el("div#gtip", { role: "tooltip" });
  document.body.append(gtip);
  let tipT = 0, tipEl = null;
  function hideTip() { clearTimeout(tipT); gtip.classList.remove("on"); tipEl = null; }
  const noHover = window.matchMedia("(hover: none)");   // i18n-ok
  function tipFor(n) {
    if (pops.size || n.closest('[aria-expanded="true"]')) return null;   // i18n-ok   // (nothing over an open menu, search or popover)
    if (n.classList.contains("rn")) {   // (a rail item: only while it shows icons only)
      if (rail.classList.contains("open") || isPinned() || isPhone()) return null;
      const p = PAGES.get(n.dataset.page);
      return p ? [p.title, gOf(p) === "admin" ? K.t("shell.rail.adminOnlyTip") : p.key2 || ""] : null;
    }
    return n.dataset.tip ? [n.dataset.tip, ""] : null;
  }
  function showTip(n) {
    const t = tipFor(n); if (!t || !n.isConnected) return;
    const pos = n.classList.contains("rn") ? "r" : n.dataset.tipPos || (n.closest(".rail") ? "r" : "b");
    tipEl = n;
    gtip.replaceChildren(t[0], t[1] ? el("small", {}, t[1]) : "");
    gtip.className = pos;
    const r = n.getBoundingClientRect(), g = gtip.getBoundingClientRect();
    let x, y;
    if (pos === "r") { x = r.right + 12; y = r.top + r.height / 2 - g.height / 2; }
    else if (pos === "t") { x = r.left + r.width / 2 - g.width / 2; y = r.top - g.height - 10; }
    else { x = r.left + r.width / 2 - g.width / 2; y = r.bottom + 10; }
    x = Math.max(8, Math.min(x, window.innerWidth - g.width - 8));
    gtip.style.left = `${Math.round(x)}px`; gtip.style.top = `${Math.round(y)}px`;
    gtip.classList.add("on");
  }
  document.addEventListener("mouseover", (e) => {
    const n = e.target.closest && e.target.closest(".rn, [data-tip]");
    if (n === tipEl) return;
    hideTip();
    if (noHover.matches) return;   // (a finger: no tooltips — a tap would leave one standing beside what it opened)
    if (n && (n.closest(".rail, .topbar, .pop") || n.dataset.tip)) { tipEl = n; tipT = setTimeout(() => showTip(n), n.classList.contains("rn") ? 60 : 350); }
  });
  document.addEventListener("focusin", (e) => { const n = e.target.closest && e.target.closest(".rn, [data-tip]"); if (n && n.matches(":focus-visible")) showTip(n); });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("pointerdown", hideTip);
  document.addEventListener("keydown", (e) => { if (e.key !== "Tab") hideTip(); }, true);
  window.addEventListener("scroll", hideTip, true);

  // ================================================================== the phone (narrow + a finger; never the user agent)
  // (v2.8.0: a phone on its side — lower than 500 px with a finger — is a phone too; a tablet on its side isn't)
  const phoneMq = window.matchMedia("(max-width: 699px) and (pointer: coarse), (max-height: 500px) and (pointer: coarse)");   // i18n-ok
  const isPhone = () => phoneMq.matches;
  const onPhone = () => { html.classList.toggle("phone", isPhone()); closeRail(); closePops(); setTimeout(() => window.dispatchEvent(new Event("resize")), 50); };
  if (phoneMq.addEventListener) phoneMq.addEventListener("change", onPhone); else if (phoneMq.addListener) phoneMq.addListener(onPhone);
  html.classList.toggle("phone", isPhone());
  // (and checked again on every resize / turn: a missed change event heals itself)
  const heal = () => { if (html.classList.contains("phone") !== isPhone()) onPhone(); };
  window.addEventListener("resize", heal); window.addEventListener("orientationchange", () => setTimeout(heal, 120));

  // ================================================================== keys
  // (a frame of ours with the focus — the builder's live panel: Ctrl K from there too)
  window.addEventListener("blur", () => setTimeout(() => {
    const f = document.activeElement;
    if (!f || f.tagName !== "IFRAME") return;
    try {
      const d = f.contentDocument;
      if (!d || d.skypaneKeys) return;
      d.skypaneKeys = true;
      d.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") { f.blur(); onKey(e); } });
    } catch { /* (another site's frame: not ours to listen to) */ }
  }, 0));
  document.addEventListener("keydown", onKey);
  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k" && signedIn) {
      if (document.querySelector(".modal-bg") || document.body.classList.contains("hp-open")) return;
      e.preventDefault();
      if (qres.hidden) qin.focus(); else closeQ(true);
    } else if (e.key === "Escape" && !e.defaultPrevented) {
      if (rail.classList.contains("open")) { e.preventDefault(); closeRail(); (isPhone() ? menuB : expB).focus({ preventScroll: true }); }
      else if (pops.size) { e.preventDefault(); closePops(); }
    } else if (e.key === "[" && !typing() && !e.ctrlKey && !e.metaKey && !e.altKey && signedIn && !isPhone() && !document.querySelector(".modal-bg")
      && !document.body.classList.contains("hp-open") && !document.body.classList.contains("bld-open")) {
      setPinned(!html.classList.contains("pinned"));
    } else if ((e.key === "v" || e.key === "V") && !typing() && !e.ctrlKey && !e.metaKey && !e.altKey && signedIn && !document.querySelector(".modal-bg")
      && !document.body.classList.contains("bld-open")) {
      const p = PAGES.get(cur.page);
      if (p && p.views.length > 1) { const i = p.views.findIndex(([k]) => k === view(p.key)); setView(p.key, p.views[(i + 1) % p.views.length][0]); }
    }
  }

  // ================================================================== the view switch (pages with two views)
  // view(page): the view it opens in (from the address, else the login's choice, else its first)
  function view(key) {
    const p = PAGES.get(key); if (!p || !p.views.length) return null;
    const fromHash = cur.page === key && cur.rest[0] && p.views.some(([k]) => k === cur.rest[0]) ? cur.rest[0] : null;
    const v = fromHash || prefs.views[key];
    return p.views.some(([k]) => k === v) ? v : p.views[0][0];
  }
  function setView(key, v, remember) {
    const p = PAGES.get(key); if (!p || !p.views.some(([k]) => k === v)) return;
    if (remember !== false && prefs.defaultView !== "fixed") savePrefs({ views: { [key]: v } });
    if (cur.page === key) { sync([v]); if (p.render) p.render([v]); drawViewSwitch(); }
  }
  // the switch itself, for a page's header (Shell.viewSwitch(key)): remembered for this login, V switches
  function viewSwitch(key) {
    const p = PAGES.get(key); if (!p || p.views.length < 2) return null;
    const v = view(key), me = (M.me() || {}).user || K.t("shell.shared.you");
    return el("div.vsw", { "data-shell": key, role: "tablist", "aria-label": K.t("shell.view.aria"), "data-tip": K.t("shell.view.tip", { user: me }), "data-tip-pos": "t" },
      p.views.map(([k, n, i, what]) => el("button" + (k === v ? ".on" : ""), { type: "button", role: "tab", "aria-selected": String(k === v), title: what || "",
        onclick: () => setView(key, k) }, i ? ic(i, 15) : null, n)));
  }
  function drawViewSwitch() {
    for (const w of document.querySelectorAll(".vsw[data-shell]")) w.replaceWith(viewSwitch(w.dataset.shell) || "");
  }

  // ================================================================== Appearance (Your account): theme, the sidebar, default views
  function appearance() {
    const themes = el("div.thc", { role: "radiogroup", "aria-label": K.t("shell.shared.abouttheme") }, THEMES.map(([t, i, n]) =>
      el("button" + (prefs.theme === t ? ".on" : ""), { type: "button", role: "radio", "data-theme-pick": t, "aria-checked": String(prefs.theme === t), onclick: () => setTheme(t) },
        el("span.sw3." + t, { "aria-hidden": "true" }, el("i.a"), el("i.b"), el("i.c")), el("span.l", {}, ic(i, 15), " ", n))));
    const pinS = K.sw(html.classList.contains("pinned"), (v) => setPinned(v), K.t("shell.rail.pin"));
    pinS.setAttribute("data-pin-switch", "");
    const withViews = [...PAGES.values()].filter((p) => p.views.length > 1 && allowed(p.key));
    const fixed = el("div.seg", { role: "group", "aria-label": K.t("shell.views.opening") }, [["last", K.t("shell.views.last")], ["fixed", K.t("shell.views.fixed")]].map(([k, n]) =>
      el("button" + (prefs.defaultView === k ? ".on" : ""), { type: "button", "aria-pressed": String(prefs.defaultView === k),
        onclick: (e) => { savePrefs({ defaultView: k }); for (const b of e.currentTarget.parentNode.children) { const on = b === e.currentTarget; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); } } }, n)));
    const views = el("div", { id: "appearance-views", tabindex: "-1" }, ...K.group(K.t("shell.views.title"), withViews.length
      ? [K.row(K.t("shell.views.opening"), K.t("shell.views.openingHint"), fixed),
        ...withViews.map((p) => K.row(p.title, null, el("div.seg", {}, p.views.map(([k, n]) => el("button" + (view(p.key) === k ? ".on" : ""), { type: "button",
          onclick: (e) => { savePrefs({ views: { [p.key]: k } }); for (const b of e.currentTarget.parentNode.children) b.classList.toggle("on", b === e.currentTarget); } }, n)))))]
      : [K.row(K.t("shell.views.none"), K.t("shell.views.noneHint"), null)],
      K.t("shell.views.kept")));
    return el("div.appearance", {}, ...K.group(K.t("shell.shared.abouttheme"), [themes]),
      ...(isPhone() ? [] : K.group(K.t("shell.views.sidebar"), [K.row(K.t("shell.rail.pin"), K.t("shell.views.pinHint"), pinS)])),
      views);
  }

  // ================================================================== sign-in / sign-out (manage.js calls these)
  function start() {
    signedIn = true;
    document.body.classList.add("signed-in");
    drawAvatar(); drawRail();   // (drawRail shows the pages this login may use; a page's group can depend on the login)
    if (!wsSub.textContent) wsSub.textContent = (M.version && M.version()) || K.t("shell.rail.manager");
    loadPrefs();
    const r = parse(location.hash);
    if (r.page === "help") {   // (a link to a help topic: its page under it, Help over it)
      show({ page: firstPage(), rest: [] }, false);
      history.replaceState(history.state, "", `#help${r.rest[0] ? `/${r.rest[0]}` : ""}`);
      if (M.helpRoute) M.helpRoute(r.rest[0]);
      return;
    }
    show(allowed(r.page) ? r : { page: firstPage(), rest: [] }, false);
  }
  function stop() {
    flushPrefs();
    signedIn = false;
    document.body.classList.remove("signed-in");
    closeRail(); closePops(); hideTip();
    cur = { page: null, rest: [] }; crumbExtra = "";
    clearTimeout(sendTimer); unsent = null;
  }
  // what this login may do changed (the admin, meanwhile): the rail and the menu offer only what's left; the page on
  // screen not allowed any more → this login's first page (what was typed there can't be saved anyway)
  function permsChanged() {
    showNav(); drawAvatar();
    if (signedIn && cur.page && !allowed(cur.page)) {
      M.discardUnsaved();
      show({ page: firstPage(), rest: [] }, false);
      M.toast(K.t("shell.permsChanged"), true);
    }
  }

  // ---------- what the other files use ----------
  M.go = (t) => go(t);
  M.tab = () => NEWOLD[cur.page] || cur.page;
  M.routeSync = sync;
  M.refreshMenu = () => { showNav(); drawAvatar(); };
  window.Shell = { page, go, reload, sync, start, stop, permsChanged, allowed, firstPage, isPhone, setTheme, setPinned, view, setView, viewSwitch, appearance,
    openPop, closePops, healthSlot, topItem, fitTop, flushPrefs, route: () => ({ page: cur.page, rest: cur.rest.slice() }), prefs: () => ({ ...prefs, views: { ...prefs.views } }),
    savePrefs, COLORS, badge,
    // (v2.8.0, phone.js) the route changes; the pages with their titles, groups and icons (the phone's More list)
    onRoute: (f) => routeFns.push(f),
    topItems: () => topItems.filter((t) => t.node.isConnected).map(({ label, icon, run, group, external }) => ({ label, icon, run, group, external })),   // (the phone's More lists them)
    pages: () => [...PAGES.values()].map((p) => ({ key: p.key, title: p.title, icon: p.icon, group: gOf(p), hidden: !!p.hidden })) };
  // (v2.9.3) ☕ next to the health pill — folds into the avatar menu when the bar is full, and is in the
  // phone's More list (Shell.topItem); a plain link to the author's page, in a new tab
  if (M.coffeeLink) {
    const cup = M.coffeeLink("a.ib.coffee-ib", { "aria-label": K.t("coffee.link"), "data-tip": K.t("coffee.link") });
    cup.replaceChildren(ic("coffee", 18));
    topItem(cup, { label: K.t("coffee.link"), icon: "coffee", end: true, group: K.t("coffee.group"), external: true, run: () => window.open(cup.href, "_blank", "noopener,noreferrer") });   // i18n-ok
  }
  drawRail();
  setTheme(prefs.theme, true); setPinned(prefs.pinned, true);
})();
