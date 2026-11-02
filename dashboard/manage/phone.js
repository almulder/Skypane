// Skypane Manager — the phone shell (v2.8.0; the design notes §6, §8–10; the owner's "Phone Manager: the mix" in
// the design notes: direction A's bottom tabs). Only on a phone — html.phone: a finger and narrower than 700 px, or
// a finger and lower than 500 px (a phone on its side) — shell.js; a computer or a tablet gets none of this (everything here checks Shell.isPhone()):
//   • the bottom tabs Overview · Devices · Panels · More (a tab the login may not use is left out — never fewer than
//     two), a red count of the alerts waiting on Overview, the current tab marked aria-current;
//   • the top bar: ‹ Back on a drilled-in screen (a room, Health, a More page), the page's name once the page has
//     scrolled under it, the health pill and search; no sidebar drawer, theme buttons or avatar (they are in More);
//   • #more: the other pages, grouped as the sidebar groups them, the theme, Your account, Help, Sign out;
//   • Kit.sheet({title, sub, body, actions, dirty, onClose}) — a bottom sheet; and on a phone every dialog (Manage.dialog:
//     the PIN pad, a question, Open live) gets a history entry, so Android's Back closes it instead of leaving the page
//     — a sheet with unsaved changes asks first;
//   • a slim "Can't reach Skypane" bar while the server doesn't answer; the theme colour for the browser's bar.
//   • (v2.9.2) pull to refresh at the top of every page.
// Built with DOM calls + textContent only.
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K || !S.onRoute) return;
  const { el } = M, ic = K.icon, html = document.documentElement;
  const phone = () => S.isPhone();

  // ================================================================== layers: Back closes the top sheet or dialog
  // One history entry (the "guard", the same address) while anything is open over the page: Back takes it away, the
  // top layer is asked to close (as Esc would — its own question first), and the guard comes back while something is
  // still open. Closed by its own buttons: the guard goes with history.back() (Manage.leaveOk waits for that, so a page
  // opened right after never races it).
  const layers = [];   // {shade, req (close, as Esc), force (close now), sheet}
  let guard = null, checkQ = false;
  // (each history.back() of ours, waiting for its popstate — or 700 ms, whichever comes first: never out of step)
  const backs = [], waiters = [];
  const settled = () => (backs.length ? new Promise((ok) => waiters.push(ok)) : Promise.resolve());
  function backDone(b) {
    const i = backs.indexOf(b);
    if (i >= 0) { backs.splice(i, 1); clearTimeout(b.t); }
    if (!backs.length) for (const f of waiters.splice(0)) f();
  }
  function guardUp() {
    if (guard || !phone()) return;
    guard = { tok: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, hash: location.hash };
    history.pushState({ ...(history.state || {}), pguard: guard.tok }, "", location.href);
  }
  function guardDown() {
    if (!guard) return;
    const g = guard; guard = null;
    if (history.state && history.state.pguard === g.tok && location.hash === g.hash) {
      const b = {}; backs.push(b); b.t = setTimeout(() => backDone(b), 700);
      history.back();
    }
  }
  function check() {
    for (let i = layers.length - 1; i >= 0; i--) if (!layers[i].shade.isConnected) layers.splice(i, 1);
    if (layers.length) guardUp(); else guardDown();
  }
  const checkSoon = () => { if (checkQ) return; checkQ = true; Promise.resolve().then(() => { checkQ = false; check(); }); };
  window.addEventListener("popstate", () => {
    if (backs.length) { backDone(backs[0]); return; }   // (ours: the guard going)
    if (!guard) return;
    guard = null;   // (Back took it)
    for (let i = layers.length - 1; i >= 0; i--) if (!layers[i].shade.isConnected) layers.splice(i, 1);
    const L = layers[layers.length - 1];
    if (L) { try { L.req(); } catch {} }
    setTimeout(check, 0);   // (still something open — the question it asked, the layer under it: the guard again)
  });
  // (a dialog removed any other way — its own close, Esc, a page drawn again: its layer goes)
  new MutationObserver(() => { if (layers.length) checkSoon(); }).observe(document.body, { childList: true });
  // (a sheet or dialog opening: a toast still showing goes — gate 2)
  const hideToast = () => { const t = document.getElementById("toast"); if (t) t.classList.remove("show"); };
  const dialog0 = M.dialog;
  M.dialog = function (shade, first, onEsc) {
    const close = dialog0(shade, first, onEsc);
    if (phone()) { layers.push({ shade, req: () => (onEsc ? onEsc() : close()), force: close }); check(); hideToast(); }
    return close;
  };
  const leave0 = M.leaveOk;
  // (gate 1: a page about to open — the sheets of this one close and their guard is gone from the history first, so the
  // new page's entry is never pushed on top of a guard; a question's own entry settles before the address is put back)
  M.leaveOk = async (...a) => {
    await settled();
    const ok = await leave0(...a);
    if (ok) closeSheets();
    await settled();
    return ok;
  };

  // ================================================================== Kit.sheet: the bottom sheet
  // Kit.sheet({title, sub, icon, body: [nodes], actions: [nodes], dirty: () => bool, onClose, label}) →
  //   {close() → a promise once Back's entry is gone, request() (asks first when dirty), box, msg(text, bad)}
  // A drag handle (a swipe down closes it), at most 90 % of the screen, its own scroll, the actions in a row that
  // stays at the bottom above the home bar. Esc, Back, a tap on the backdrop or ✕ close it — "Leave without saving?"
  // first while dirty() says so. Focus goes in and comes back (Manage.dialog).
  let sheetN = 0;
  function sheet(o = {}) {
    const id = `ps-${++sheetN}`;
    const msgEl = el("p.ps-msg", { role: "status", "aria-live": "polite", hidden: true });
    const xB = el("button.ib.ps-x", { type: "button", "aria-label": K.t("common.close") }, ic("x", 18));
    const head = el("header.ps-head", {}, o.icon || null, el("div.ps-ht", {}, el("h2", { id: `${id}-h` }, o.title || ""), o.sub ? el("small", {}, o.sub) : null), xB);
    const body = el("div.ps-body", { "data-keep-scroll": id }, ...(o.body || []));
    const acts = o.actions && o.actions.filter(Boolean).length ? el("div.ps-acts", {}, ...o.actions.filter(Boolean)) : null;
    const box = el("section.modal.psheet" + (o.cls ? `.${o.cls}` : ""), { role: "dialog", "aria-labelledby": `${id}-h`, "aria-label": o.label || null },
      el("div.ps-grab", { "aria-hidden": "true" }, el("i")), head, body, msgEl, acts);
    const shade = el("div.modal-bg.top.ps-bg", { onclick: (e) => { if (e.target === shade) request(); } }, box);
    let closeD = null, closed = false, asking = false;
    async function request() {
      if (closed || asking) return;
      if (o.dirty && o.dirty()) {
        asking = true;
        const ok = await K.ask({ title: K.t("manage.unsaved.leaveTitle"), text: K.t("phone.sheet.unsaved"), yes: K.t("manage.unsaved.leave"), no: K.t("phone.sheet.keepEditing"), danger: true });
        asking = false;
        if (!ok) return;
      }
      return close();
    }
    function close() {
      if (closed) return settled();
      closed = true;
      if (closeD) closeD();
      if (o.onClose) { try { o.onClose(); } catch {} }
      check();
      return settled();
    }
    xB.addEventListener("click", () => request());
    // (a swipe down on the handle or the heading: past a quarter of the sheet — or a quick flick — it closes)
    let y0 = null, t0 = 0, dy = 0;
    const down = (e) => { if (e.target.closest("button, input, select, a")) return; y0 = e.clientY; t0 = Date.now(); dy = 0; box.classList.add("drag"); try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} };   // i18n-ok
    const move = (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); box.style.transform = dy ? `translateY(${dy}px)` : ""; };
    const up = () => {
      if (y0 == null) return;
      const fast = dy > 40 && Date.now() - t0 < 220;
      y0 = null; box.classList.remove("drag"); box.style.transform = "";
      if (dy > Math.min(160, box.offsetHeight / 4) || fast) request();
    };
    for (const n of [box.querySelector(".ps-grab"), head]) {
      n.addEventListener("pointerdown", down); n.addEventListener("pointermove", move);
      n.addEventListener("pointerup", up); n.addEventListener("pointercancel", up);
    }
    closeD = M.dialog(shade, o.first || null, () => request());
    const L = layers.find((x) => x.shade === shade);
    if (L) { L.sheet = true; L.force = () => close(); }
    return { close, request, box, body,
      title(text) { head.querySelector("h2").textContent = text || ""; },   // (v2.9.0: the item renamed while its sheet is open)
      msg(text, bad) { msgEl.hidden = !text; msgEl.textContent = text || ""; msgEl.classList.toggle("bad", !!bad); } };
  }
  K.sheet = sheet;
  // (a page opened: a sheet left open belongs to the page that was — it goes, without asking)
  const closeSheets = () => { for (const L of layers.slice().reverse()) if (L.sheet) { try { L.force(); } catch {} } check(); };

  // ================================================================== the bottom tabs
  const TABS = [["overview", K.t("shell.page.overview"), "dash"], ["devices", K.t("phone.shared.aboutdevices"), "devices"], ["panels", K.t("phone.shared.aboutpanels"), "tablet"], ["more", K.t("phone.more"), "more"]];
  const ROOTS = ["overview", "devices", "panels", "more"];
  // (a page under a tab — Health, Cameras… — belongs to the tab it was opened from: Health from More lights More and
  // goes back there; opened directly, Health is the Overview's and the others More's — gate 2)
  let ctxParent = null, prevPage = null;
  const defParent = (page) => (page === "health" ? "overview" : "more");
  const tabOf = (page) => (ROOTS.includes(page) ? page : ctxParent || defParent(page));
  let alertsN = 0;
  const tabs = el("nav.ptabs", { "aria-label": K.t("shell.rail.main") }, TABS.map(([k, n, i]) => el("a.pt", { href: `#${k}`, "data-tab": k },
    ic(i, 22), el("span.ptl", {}, n), k === "overview" ? el("span.ptb", { "aria-hidden": "true", hidden: true }) : null)));
  document.body.append(tabs);
  function drawTabs() {
    const r = S.route(), on = tabOf(r.page);
    for (const a of tabs.querySelectorAll(".pt")) {
      const k = a.dataset.tab;
      a.hidden = (k === "devices" || k === "panels") && !S.allowed(k);
      if (k === on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
      const name = TABS.find(([x]) => x === k)[1];
      a.setAttribute("aria-label", k === "overview" && alertsN ? K.t("phone.tabs.alerts", { name, n: alertsN }) : name);
    }
    const b = tabs.querySelector(".ptb");
    b.hidden = !alertsN; b.textContent = alertsN > 99 ? "99+" : String(alertsN);
  }
  tabs.addEventListener("click", (e) => {
    const a = e.target.closest(".pt"); if (!a) return;
    e.preventDefault();
    const k = a.dataset.tab, r = S.route();
    badgePoll();   // (a background read at once: a server gone quiet shows its bar now, not at the next poll)
    if (r.page === k && !r.rest.length) {   // (the tab open now, again: back to its top, a sheet closed)
      closeSheets(); window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });   // i18n-ok
      return;
    }
    S.go(k);
  });

  // ================================================================== the top bar: ‹ Back, the title once scrolled
  const backB = el("button.pback", { type: "button" }, ic("chevL", 20), el("span", {}));
  const top = document.getElementById("top");
  if (top) top.prepend(backB);
  // where Back goes from here (null: a tab's own first screen)
  const NAMES = { overview: K.t("shell.page.overview"), devices: K.t("phone.shared.aboutdevices"), panels: K.t("phone.shared.aboutpanels"), more: K.t("phone.more") };
  const parentOf = (r) => {
    if (r.page === "devices" && r.rest[0] === "room") return ["devices", NAMES.devices];
    if (ROOTS.includes(r.page || "") || !r.page) return null;
    const k = tabOf(r.page);
    return [k, NAMES[k]];
  };
  const trail = [];   // (the addresses opened, oldest first: Back to the one before is the browser's own Back)
  function drawBack() {
    const p = parentOf(S.route());
    backB.classList.toggle("on", !!p);
    if (!p) return;
    backB.lastChild.textContent = p[1];
    backB.setAttribute("aria-label", K.t("phone.backTo", { name: p[1] }));
  }
  backB.addEventListener("click", () => {
    const p = parentOf(S.route()); if (!p) return;
    if (trail.length > 1 && trail[trail.length - 2] === `#${p[0]}`) history.back(); else S.go(p[0]);
  });
  // (the page's own big title at the top; once it has scrolled under the bar, the bar shows the name)
  const scrolled = () => html.classList.toggle("p-scrolled", window.scrollY > 48);
  window.addEventListener("scroll", () => { if (phone()) scrolled(); }, { passive: true });

  S.onRoute((r, opened) => {
    const h = location.hash.split("?")[0];
    if (opened && r.page !== prevPage) {
      // (the tab a page under a tab belongs to: where it was opened from)
      if (!ROOTS.includes(r.page)) ctxParent = ROOTS.includes(prevPage) && (prevPage === "overview" || prevPage === "more") ? prevPage
        : prevPage && !ROOTS.includes(prevPage) && ctxParent ? ctxParent : defParent(r.page);
      prevPage = r.page;
    }
    if (opened) {
      if (trail.length > 1 && trail[trail.length - 2] === h) trail.pop(); else if (trail[trail.length - 1] !== h) trail.push(h);
      if (trail.length > 40) trail.splice(0, trail.length - 40);
      closeSheets();
    } else if (trail.length) trail[trail.length - 1] = h;
    if (!phone()) return;
    drawTabs(); drawBack(); scrolled();
  });

  // ================================================================== More (#more: the phone's list of the other pages)
  const LISTED = new Set(["overview", "devices", "panels", "health", "account", "help", "more", "feedback"]);
  function renderMore() {
    if (!phone()) { history.replaceState(history.state, "", "#overview"); S.go("overview"); return; }   // (a computer: the sidebar has it all)
    const pages = S.pages().filter((p) => !p.hidden && !LISTED.has(p.key) && S.allowed(p.key));
    const row = (icon, title, sub, onclick, end) => el("button.pm-row", { type: "button", onclick }, el("span.pm-i", { "aria-hidden": "true" }, ic(icon, 19)),
      el("span.pm-t", {}, el("b", {}, title), sub ? el("small", {}, sub) : null), end === undefined ? el("span.pm-c", { "aria-hidden": "true" }, ic("chevR", 16)) : end);
    const group = (title, rows) => (rows.length ? [el("h2.pm-gh", {}, title), el("div.pm-grp", {}, rows)] : []);
    const SUB = { cameras: K.t("phone.sub.cameras"), backgrounds: K.t("phone.sub.backgrounds"), icons: K.t("phone.sub.icons"),
      cards: K.t("phone.sub.cards"), accounts: K.t("phone.sub.accounts"), integrations: K.t("phone.sub.integrations"),
      guest: K.t("phone.sub.guest") };
    const of = (g) => pages.filter((p) => p.group === g).map((p) => row(p.icon, p.title, SUB[p.key] || "", () => S.go(p.key)));
    const pref = S.prefs().theme;
    const themes = el("div.pm-theme.seg", { role: "radiogroup", "aria-label": K.t("phone.shared.abouttheme") }, [["light", "sun", K.t("shell.theme.light")], ["dark", "moon", K.t("shell.theme.dark")], ["night", "night", K.t("shell.theme.nightShort")]].map(([t, i, n]) =>
      el("button" + (pref === t ? ".on" : ""), { type: "button", role: "radio", "data-theme-pick": t, "aria-checked": String(pref === t), onclick: () => S.setTheme(t) }, ic(i, 16), n)));
    // (items another file put in the top bar; v2.9.3: an item with a group of its own — "Support Skypane" — gets it, an
    // external link shows the external-link mark instead of ›)
    const items = S.topItems ? S.topItems() : [];
    const tRow = (x) => row(x.icon, x.label, "", () => x.run(), x.external ? el("span.pm-c", { "aria-hidden": "true" }, ic("ext", 16)) : undefined);
    const extra = items.filter((x) => !x.group).map(tRow);
    const own = [...new Set(items.filter((x) => x.group).map((x) => x.group))].flatMap((g) => group(g, items.filter((x) => x.group === g).map(tRow)));
    const you = [
      S.allowed("account") ? row("user", K.t("shell.page.account"), (M.me() || {}).user || "", () => S.go("account")) : null,
      el("div.pm-row.pm-static", {}, el("span.pm-i", { "aria-hidden": "true" }, ic("moon", 19)), el("span.pm-t", {}, el("b", {}, K.t("phone.shared.abouttheme"))), themes),
      row("activity", K.t("shell.page.health"), K.t("phone.healthSub"), () => S.go("health")),
      row("help", K.t("shell.cmd.help"), K.t("phone.helpSub"), () => M.help && M.help()),
      M.isDemo() ? null : row("send", K.t("phone.shared.title"), K.t("phone.shared.moreSub"), () => S.go("feedback")),   // (v3.0.0)
    ].filter(Boolean);
    M.swap(M.$main, el("div.pm-page", {},
      el("div.ph", {}, el("div", {}, el("h1", {}, K.t("phone.more")), el("p", {}, K.t("phone.moreIntro")))),
      ...group(K.t("shell.group.manage"), of("manage")), ...group(K.t("shell.group.admin"), of("admin")), ...group(K.t("phone.you"), you), ...group(K.t("phone.fromServer"), extra), ...own,
      el("p.pm-note", {}, ic("window", 15), el("span", {}, K.t("phone.computerOnly"))),
      M.isDemo() ? null : el("button.btn.pm-out", { type: "button", onclick: () => M.logout() }, ic("logout", 16), K.t("shell.signOut")),
      el("small.pm-ver", {}, (M.version && M.version()) || "")));
  }
  S.page("more", { title: K.t("phone.more"), group: "none", icon: "more", hidden: true, render: renderMore });

  // ================================================================== the alerts count on the Overview tab
  // (overview.js tells it each time it reads the Overview; on the other tabs it is read once a minute, only while the
  // app is in front — a background poll, Manage.poll, that never keeps the session alive)
  M.alertsSeen = (O) => {
    const n = O && O.alerts && Array.isArray(O.alerts.items) ? O.alerts.items.length : 0;
    if (n !== alertsN) { alertsN = n; if (phone()) drawTabs(); }
  };
  let badgeT = null;
  async function badgePoll() {
    clearTimeout(badgeT);
    badgeT = setTimeout(badgePoll, 60000);
    if (!phone() || !M.me() || document.visibilityState === "hidden" || !document.body.classList.contains("signed-in") || S.route().page === "overview") return;
    try {
      const r = await M.poll("/api/manage/overview");
      if (r && r.ok) M.alertsSeen(await r.json());
    } catch {}
  }
  M.onSignIn(() => { alertsN = 0; setTimeout(badgePoll, 1500); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && phone() && M.me()) badgePoll(); });

  // ================================================================== offline / slow: one slim bar under the top bar
  const off = el("div.poff", { role: "status", "aria-live": "polite" }, ic("alert", 15), el("span", {}, K.t("phone.offline")));
  const app = document.querySelector(".app");
  if (app && top) app.insertBefore(off, top.nextSibling);
  // (gate 2: any of the Manager's own requests that gets no answer — a fetch that fails, a gateway's 502 / 504 — marks the
  // server as not answering at once; the next one answered clears it. health.js also sets it from its 30 s check.)
  const fetch0 = window.fetch.bind(window);
  window.fetch = async (u, o) => {
    const own = typeof u === "string" && u.startsWith("/api/");
    try {
      const r = await fetch0(u, o);
      if (own) html.classList.toggle("srv-down", r.status === 502 || r.status === 504);
      return r;
    } catch (e) {
      if (own && !(e && e.name === "AbortError")) html.classList.add("srv-down");
      throw e;
    }
  };
  M.serverDown = () => html.classList.contains("srv-down") || navigator.onLine === false;
  const net = () => html.classList.toggle("p-offline", navigator.onLine === false);
  window.addEventListener("online", net); window.addEventListener("offline", net); net();

  // ================================================================== the browser's bar in the theme's colour
  const BAR = { light: "#f6f6f8", dark: "#0e0e12", night: "#140b3a" };
  const meta = document.querySelector('meta[name="theme-color"]');
  const tint = () => { if (meta) meta.setAttribute("content", BAR[html.dataset.theme] || BAR.dark); };
  new MutationObserver(tint).observe(html, { attributes: true, attributeFilter: ["data-theme"] });
  tint();

  // ================================================================== pull to refresh (v2.9.2)
  // At the very top of a phone page, a pull down past PULL px (and let go) reads the page again where it is
  // (Shell.reload: its own requests — a user's action, so they keep the session alive), then a quiet "Updated" or that
  // the server can't be reached. Never while a sheet, a dialog, the camera viewer or the search is open; never from a
  // field, a sideways swipe (the panels' carousel, a camera), or a list that is itself scrolled down. The browser's own
  // pull-to-reload is off on a phone (phone.css: overscroll-behavior-y). Reduced motion: no spinning, the words only.
  const PULL = 64, MAX = 96;
  const still = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;   // i18n-ok
  const ptr = el("div.ptr", { role: "status", "aria-live": "polite" }, el("span.ptr-i", { "aria-hidden": "true" }, ic("refresh", 18)), el("span.ptr-t"));
  document.body.appendChild(ptr);
  let pt = null, busy = false;
  // (gate 2: the page moves down with the finger, and the pill sits in the gap that opens under the top bar)
  const barBottom = () => { const b = document.querySelector(".topbar"); return b ? Math.max(0, b.getBoundingClientRect().bottom) : 0; };
  const moveMain = (y, ease) => { M.$main.style.transition = ease && !still() ? "transform .2s ease" : ""; M.$main.style.transform = y > 0 ? `translateY(${Math.round(y)}px)` : ""; };
  const ptrShow = (y, words, spin) => {
    moveMain(y, false);
    ptr.style.top = `${barBottom()}px`;
    ptr.style.transform = `translate(-50%, ${Math.round(y / 2 - 18)}px)`;
    ptr.style.opacity = String(Math.max(0, Math.min(1, (y - 30) / 30)));
    ptr.classList.toggle("on", y > 0);
    ptr.classList.toggle("spin", !!spin && !still());
    ptr.querySelector(".ptr-i").style.transform = spin || still() ? "" : `rotate(${Math.round(y * 4)}deg)`;
    ptr.querySelector(".ptr-t").textContent = words || "";
  };
  const ptrHide = () => { moveMain(0, true); ptr.classList.remove("on", "spin"); ptr.style.opacity = "0"; ptr.style.transform = "translate(-50%, -60px)"; ptr.querySelector(".ptr-t").textContent = ""; };
  ptrHide();
  const covered = () => layers.some((L) => L.shade.isConnected) || !!document.querySelector(".modal-bg, .psheet");
  function innerScrolled(t) {
    for (let n = t; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n.closest && n.matches("input, textarea, select, [contenteditable], [data-no-ptr]")) return true;   // i18n-ok
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1 && n.scrollTop > 0) return true;
    }
    return false;
  }
  document.addEventListener("touchstart", (e) => {
    pt = null;
    if (busy || !phone() || !M.me() || e.touches.length !== 1 || window.scrollY > 0 || covered() || !M.$main.contains(e.target) || innerScrolled(e.target)) return;
    pt = { x: e.touches[0].clientX, y: e.touches[0].clientY, on: null, d: 0 };
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!pt) return;
    const dx = e.touches[0].clientX - pt.x, dy = e.touches[0].clientY - pt.y;
    if (pt.on === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      pt.on = dy > 0 && dy > Math.abs(dx) * 1.5;   // (down, clearly: else a sideways swipe or a scroll — not ours)
      if (!pt.on) { pt = null; return; }
    }
    if (window.scrollY > 0 || covered()) { pt = null; ptrHide(); return; }
    pt.d = Math.max(0, Math.min(MAX, dy * 0.5));
    ptrShow(pt.d, pt.d >= PULL ? K.t("ptr.release") : K.t("ptr.pull"));
  }, { passive: true });
  const ptrEnd = async () => {
    const p = pt; pt = null;
    if (!p || !p.on) return;
    if (p.d < PULL || covered()) { ptrHide(); return; }
    busy = true;
    ptrShow(PULL, K.t("ptr.updating"), true);
    let ok = true, kept = false;
    try {
      // (unsaved changes on the page: Shell.reload asks first, as leaving would — kept means nothing was read)
      kept = !(await M.leaveOk());
      if (!kept) {
        if (M.devices() && (M.can("devices") || M.can("panels"))) await M.loadDevices().catch(() => { ok = false; });
        kept = (await S.reload()) === null;
      }
    } catch { ok = false; }
    busy = false;
    ptrHide();
    if (kept) { M.toast(K.t("ptr.unsaved")); return; }
    if (S.isPhone()) M.toast(ok && !M.serverDown() ? K.t("ptr.updated") : K.t("ptr.failed"), !(ok && !M.serverDown()));
  };
  document.addEventListener("touchend", ptrEnd, { passive: true });
  document.addEventListener("touchcancel", () => { pt = null; if (!busy) ptrHide(); }, { passive: true });

  // ================================================================== a phone turned into a computer's layout (and back)
  // (followed through html.phone itself — shell.js sets it from the media query and heals it on every resize — so a
  // change seen either way redraws once)
  let wasPhone = phone();
  new MutationObserver(() => {
    const now = html.classList.contains("phone");
    if (now === wasPhone) return;
    wasPhone = now;
    onTurn();
  }).observe(html, { attributes: true, attributeFilter: ["class"] });
  function onTurn() {
    {
      closeSheets();
      if (!document.body.classList.contains("signed-in")) return;
      const r = S.route();
      if (!phone() && r.page === "more") { history.replaceState(history.state, "", "#overview"); S.go("overview"); return; }
      if (phone()) { drawTabs(); drawBack(); }
      if (r.page) S.go(location.hash.replace(/^#/, ""));   // (the page drawn again in the layout it has now)
    }
  }
  // (v2.9.0) another part over the page that Back should close — the phone's search: alive() while it's open
  function layer(alive, close) {
    layers.push({ shade: { get isConnected() { return alive(); } }, req: close, force: close });
    check();
  }
  // (v2.9.0) a dialog that belongs to the page like a sheet (the camera viewer): it closes, and its entry is gone,
  // before another page opens — as sheets do
  function asSheet(shade, force) { const L = layers.find((x) => x.shade === shade); if (L) { L.sheet = true; L.force = force; } }
  window.Phone = { settled, sheet, closeSheets, layer, check, asSheet };
})();
