// Skypane "/" (v3.0.2): the status and "Connect this panel" page (mockups/PAIRING-API.md, CR-3.1 §1, §5).
//   - the status: GET /api/status → the version and the services, working / not reachable / not set up only (never an address of the house)
//   - this browser is a panel already (its cookie): the server sends it on with a 302; if not, a link here
//   - a key in localStorage but no cookie (the cookie cleared): PATCH /api/pair {action:"restore"} once, first
//   - else "Connect this panel": {action:"open"} → a 6-character code for the Manager (Panels → New panel requests),
//     {action:"poll"} every 2 s (the code renews itself: a new one comes with the poll), {action:"leave"} on pagehide
//   - approved: the device key kept as "skypane.dk" = "<pid>.<key>" (the localStorage copy of the HttpOnly cookie), then
//     "Connected as …" and on to the panel's address after ~4 s
// The words: the panel's table (/layouts/v4/shared/strings/en.js, T()). Built with textContent only: nothing the server
// sends is ever parsed as HTML. Plain ES2017 (async / await, no ?. or ??): old Android WebViews (FreeKiosk) and iPad Safari.
(function () {
  "use strict";
  const DK = "skypane.dk", POLL_MS = 2000, GO_MS = 4000;
  const $status = document.getElementById("status"), $pair = document.getElementById("pair");
  const SVC = [["hubitat", "connect.svc.hubitat"], ["mqtt", "connect.svc.mqtt"], ["cameras", "connect.svc.cameras"],
    ["calendars", "connect.svc.calendars"], ["music", "connect.svc.music"]];
  const ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  // a tiny element maker: h("p.note", "text", child…) — text only, never HTML
  function h(sel, ...kids) {
    const p = sel.split("."), n = document.createElement(p[0] || "div");
    if (p.length > 1) n.className = p.slice(1).join(" ");
    for (const k of kids) if (k != null && k !== false) n.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
    return n;
  }
  const show = (...kids) => { while ($pair.firstChild) $pair.removeChild($pair.firstChild); for (const k of kids) if (k) $pair.appendChild(k); };
  async function call(method, url, body, extra) {
    const init = { method: method, cache: "no-store", credentials: "same-origin" };
    if (body) { init.headers = { "Content-Type": "application/json" }; init.body = JSON.stringify(body); }
    if (extra) for (const k in extra) init[k] = extra[k];
    const r = await fetch(url, init);
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, ok: r.ok, j: j && typeof j === "object" ? j : {} };
  }
  const pair = (body, extra) => call("PATCH", "/api/pair", body, extra);
  // the key as kept here: "<pid>.<key>" (a bare key from the server gets its panel in front)
  const fullKey = (k, pid) => { k = String(k || ""); return !k ? "" : k.indexOf(".") > 0 ? k : pid ? pid + "." + k : ""; };

  // ---------- what Skypane can tell about this device (the admin tells tablets apart by it) ----------
  function device() {
    const ua = navigator.userAgent || "", touch = (navigator.maxTouchPoints || 0) > 1;
    let model = "";
    const paren = /\(([^)]*)\)/.exec(ua), parts = paren ? paren[1].split(";").map((s) => s.trim()) : [];
    const ai = parts.findIndex((s) => /^Android\b/.test(s));
    if (ai >= 0) for (let i = ai + 1; i < parts.length; i++) {   // ("Linux; U; Android 4.4; en-us; SM-T230 Build/…": skip the locale, wv)
      const s = parts[i].replace(/\s+Build\/.*$/, "").trim();
      if (!s || /^(K|wv|U|[a-z]{2}([-_][a-z]{2})?)$/i.test(s)) continue;   // ("K": Chrome's reduced user agent — no model)
      model = s; break;
    }
    const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch);
    if (!model && ipad) model = "iPad"; else if (!model && /iPhone/.test(ua)) model = "iPhone";   // i18n-ok (a product name)
    const browser = /FullyKiosk|Fully Kiosk/i.test(ua) ? "Fully Kiosk" : /FreeKiosk/i.test(ua) ? "FreeKiosk"   // i18n-ok (product names)
      : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /EdgA?\/|EdgiOS/.test(ua) ? "Edge" : /Firefox|FxiOS/.test(ua) ? "Firefox"   // i18n-ok
      : /OPR\/|Opera/.test(ua) ? "Opera" : /CriOS/.test(ua) ? "Chrome" : /;\s*wv\)/.test(ua) ? "Android WebView" : /Chrome\//.test(ua) ? "Chrome"   // i18n-ok
      : /Safari\//.test(ua) && /Version\//.test(ua) ? "Safari" : "";   // i18n-ok
    const platform = ai >= 0 || /Android/.test(ua) ? "Android" : ipad ? "iPadOS" : /iPhone|iPod/.test(ua) ? "iOS" : /CrOS/.test(ua) ? "ChromeOS"   // i18n-ok
      : /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";   // i18n-ok
    let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    const w = window.screen ? screen.width : 0, ht = window.screen ? screen.height : 0;
    return { model: model, browser: browser, platform: platform, screen: w && ht ? w + "x" + ht : "", shown: w && ht ? w + " × " + ht : "", tz: tz };
  }
  const DEV = device();
  function deviceBox() {
    const dl = h("dl"), row = (k, v) => { dl.appendChild(h("dt", T(k))); dl.appendChild(h("dd", v || T("connect.unknown"))); };
    if (DEV.model) row("connect.model", DEV.model);
    row("connect.browser", DEV.browser && DEV.platform ? T("connect.browserOn", { browser: DEV.browser, platform: DEV.platform }) : DEV.browser || DEV.platform);
    row("connect.screen", DEV.shown);
    return h("div.dev", h("h2", T("connect.thisDevice")), dl);
  }

  // ---------- the status: version and services ----------
  function drawStatus(s) {
    while ($status.firstChild) $status.removeChild($status.firstChild);
    const v = [s.version, s.release && s.release !== s.version ? s.release : ""].filter(Boolean).join(" · ");
    if (v) $status.appendChild(h("p.ver", T("connect.version", { version: v })));
    // (v3.0.2: servicesState — "ok" | "trouble" (set up, not reachable now) | "off" (not set up); an older server has only
    // the yes / no of services, where a service in trouble looked "not set up")
    const ul = h("ul"), svc = s.services && typeof s.services === "object" ? s.services : {};
    const sst = s.servicesState && typeof s.servicesState === "object" ? s.servicesState : null;
    for (const [k, key] of SVC) {
      const v = sst && (sst[k] === "ok" || sst[k] === "trouble" || sst[k] === "off") ? sst[k] : svc[k] === true ? "ok" : "off";
      const words = v === "ok" ? "connect.svcOn" : v === "trouble" ? "connect.notReachable" : "connect.notSetUp";
      const li = h("li." + (v === "ok" ? "on" : v === "trouble" ? "bad" : "off"), h("b", v === "ok" ? "✓" : v === "trouble" ? "!" : "–"), v === "ok" ? T(key) : T(words, { name: T(key) }));   // i18n-ok (signs)
      li.setAttribute("aria-label", T(words, { name: T(key) }));
      ul.appendChild(li);
    }
    $status.appendChild(ul);
    $status.hidden = false;
  }
  async function status() {
    try { const r = await call("GET", "/api/status"); if (r.ok) { drawStatus(r.j); return r.j; } } catch (e) {}
    return null;
  }

  // ---------- connected: on to the panel's address ----------
  let goTimer = null;
  function connected(p, already) {
    stopPair();
    let url = null;
    try { url = new URL(String(p.address || "/" + (p.panel || "")), location.href); } catch (e) {}
    if (url && url.origin !== location.origin) url = new URL(url.pathname + url.search, location.href);   // (only ever this server)
    const name = String(p.name || p.panel || "");
    const link = h("a.btn", T("connect.openNow"));
    if (url) link.href = url.href;
    show(h("div.msg",
      h("p.big", h("span.ok", "✓ "), T(already ? "connect.alreadyAs" : "connect.connectedAs", { name: name })),
      url ? h("p.note", T("connect.address")) : null, url ? h("p.addr", url.href) : null,
      url ? h("p.note", T("connect.goingSoon")) : null, url ? link : null));
    clearTimeout(goTimer);
    if (url) goTimer = setTimeout(() => { location.replace(url.href); }, GO_MS);
  }

  // ---------- the cookie is gone but the backup is here: restore once ----------
  async function restore(saved) {
    const i = saved.indexOf("."), panel = i > 0 ? saved.slice(0, i) : "", key = i > 0 ? saved.slice(i + 1) : "";
    if (!panel || !key) { ls.del(DK); return false; }
    show(h("div.msg", h("p.note", T("connect.restoring"))));
    try {
      const r = await pair({ action: "restore", panel: panel, key: key });
      if (r.ok && r.j.ok) { const k = fullKey(r.j.deviceKey, panel); if (k) ls.set(DK, k); return true; }
      if (r.status === 401) ls.del(DK);   // (unlinked, moved or a copy: this key opens nothing any more)
    } catch (e) {}
    return false;
  }

  // ---------- "Connect this panel": open, poll every 2 s, leave ----------
  let req = null, pollTimer = null, tickTimer = null, retryTimer = null, expiresAt = 0, code = "";
  function stopPair() { clearTimeout(pollTimer); clearInterval(tickTimer); clearTimeout(retryTimer); pollTimer = tickTimer = retryTimer = null; }
  const retry = (fn, ms) => { clearTimeout(retryTimer); retryTimer = setTimeout(fn, ms); };
  // the code on screen in two halves ("K7M Q2X": letter-spaced in the CSS), read out letter by letter
  const halves = (c) => { c = String(c || ""); return c.length > 4 ? c.slice(0, 3) + " " + c.slice(3) : c; };
  const spaced = (c) => String(c || "").split("").join(" ");
  function mmss(s) { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), r = s % 60; return m + ":" + (r < 10 ? "0" : "") + r; }
  let $code = null, $left = null;
  function drawCode() {
    $code = h("div.code", halves(code));
    $code.setAttribute("aria-label", T("connect.codeAria", { code: spaced(code) }));
    $left = h("p.left");
    show(h("h1", T("connect.title")), h("p.lead", T("connect.enter")), $code, $left,
      h("div.wait", h("i"), T("connect.waiting")), deviceBox());
    tick();
  }
  function tick() {
    if (!$left) return;
    const s = (expiresAt - Date.now()) / 1000;
    $left.textContent = s > 0 ? T("connect.newCodeIn", { time: mmss(s) }) : T("connect.newCodeSoon");
    if ($code) $code.className = s > 0 ? "code" : "code dim";
  }
  function trouble(key, ms, fn) {
    stopPair(); req = null; $code = $left = null;
    show(h("h1", T("connect.title")), h("div.msg", h("p.big", T(key))), deviceBox());
    retry(fn || start, ms);
  }
  async function open() {
    stopPair();
    let r;
    try { r = await pair({ action: "open", screen: DEV.screen, tz: DEV.tz }); } catch (e) { return trouble("connect.noService", 5000); }
    if (r.j.closed) return trouble("connect.closed", 15000, open);   // (the admin turned "Accept new panels" off)
    if (r.status === 429) return trouble("connect.busy", 15000, open);
    if (!r.ok || !r.j.id || !r.j.secret) return trouble("connect.noService", 5000);
    req = { id: r.j.id, secret: r.j.secret };
    code = String(r.j.code || ""); expiresAt = Date.now() + (+r.j.expiresIn || 600) * 1000;
    drawCode();
    tickTimer = setInterval(tick, 1000);
    pollTimer = setTimeout(poll, POLL_MS);
  }
  async function poll() {
    if (!req) return;
    const mine = req;
    let r = null;
    try { r = await pair({ action: "poll", id: mine.id, secret: mine.secret }); } catch (e) {}
    if (req !== mine) return;   // (left or reopened meanwhile)
    const j = r ? r.j : {};
    if (r && r.ok && j.state === "approved") {
      req = null;
      const k = fullKey(j.deviceKey, j.panel); if (k) ls.set(DK, k);
      return connected(j, false);
    }
    if (r && r.ok && j.state === "gone") { req = null; return open(); }   // (dropped: a new request, a new code)
    if (r && r.ok && j.state === "waiting") {
      const c = String(j.code || code);
      if (+j.expiresIn > 0) expiresAt = Date.now() + j.expiresIn * 1000;
      if (c !== code) { code = c; drawCode(); } else tick();
    }
    // (no answer, 429, a 5xx: keep the code on screen and ask again — a request lives 15 s without a poll)
    pollTimer = setTimeout(poll, r && r.status === 429 ? 5000 : POLL_MS);
  }
  function leave() {
    if (!req) return;
    const mine = req; req = null; stopPair();
    try { pair({ action: "leave", id: mine.id, secret: mine.secret }, { keepalive: true }).catch(function () {}); } catch (e) {}
  }
  addEventListener("pagehide", leave);
  // (back from the browser's page cache: the request was left — start again)
  addEventListener("pageshow", (e) => { if (e.persisted) start(); });

  // ---------- start ----------
  let restored = false;
  async function start() {
    stopPair(); clearTimeout(goTimer);
    const s = await status();
    if (!s) return trouble("connect.noService", 5000);
    if (s.paired && (s.paired.address || s.paired.panel)) return connected(s.paired, true);
    const saved = ls.get(DK);
    if (saved && !restored) {
      restored = true;
      if (await restore(saved)) {
        const s2 = await status();
        if (s2 && s2.paired) return connected(s2.paired, true);
      }
    }
    open();
  }
  start();
})();
