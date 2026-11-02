// Skypane Manager — Cameras (v2.6.0; the design notes "CAMERAS", the design notes). Two views,
// remembered per login (shell.js):
//   Live   every camera this login may see at once: Spotlight (one big, the rest beside it) or Side by side. The tiles
//          show the camera's picture now — from the server (GET /api/manage/cameras/<id>/frame.jpg: every 2 s, the
//          spotlight every second, at most 9 tiles and 3 requests at a time, only while the page is on screen). The
//          spotlight plays live video when the browser reaches the built-in camera video on the home network
//          (…/<id>/live, go2rtc's own player); else it stays with pictures . Recent motion: the hub's motion
//          events with each camera's picture from now .
//   Setup  a table of every camera and a side card: its picture, name and room (your own cameras), which panels show
//          it (each panel's camera views it is in — a switch per panel and view where this login may change that
//          panel:), pop-ups (today's rules, in words), test picture, remove; the views; adding a camera.
// Who may see a camera's picture: a login with "cameras", or one whose panel shows that camera — the server
// decides; changes need "cameras". Never a stream address or password: the server sends names, rooms and kinds only.
// A phone: Live only (pictures, a tap opens one full screen). DOM calls + textContent only.
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast } = M, ic = K.icon;
  const ago = (t) => K.ago(t, "short");   // (kit.js: one "time ago" for every page)
  const phone = () => S.isPhone();
  const t = K.t;   // (v2.9.0: the new words through the string table — strings/en.js)
  const LKEY = "skypane.cameras.layout";

  // ================================================================== state
  let C = null, motion = [], cur = null, spot = null, room = "", banner = "", $page = null, tick = null;
  let layout = (() => { try { return localStorage.getItem(LKEY) === "even" ? "even" : "spot"; } catch { return "spot"; } })();
  M.onReset(() => { C = null; motion = []; cur = null; spot = null; room = ""; banner = ""; stopFrames(); });
  const onPage = () => S.route().page === "cameras" && document.body.classList.contains("signed-in");
  const viewNow = () => (phone() ? "live" : S.view("cameras") || "live");
  const camById = (id) => (C ? C.all.find((c) => c.id === id) : null);
  const ownById = (id) => (C ? C.cameras.find((c) => c.id === id) : null);
  const visible = () => (C ? C.all.filter((c) => c.pictures) : []);
  const mayChange = () => M.can("cameras");

  let follow = null;
  function followUp() {
    clearInterval(follow);
    const until = Date.now() + 60000;
    follow = setInterval(() => {
      if (Date.now() > until || S.route().page !== "cameras") { clearInterval(follow); return; }
      if (!sending && !document.querySelector(".modal-bg")) render();
    }, 5000);
  }
  async function load() {
    const [r, m] = await Promise.all([api("/api/manage/cameras"), api("/api/manage/cameras/motion?limit=12").catch(() => ({ events: [] }))]);
    if (!r || !Array.isArray(r.all)) throw new Error(r && r.error ? r.error : "cameras");
    C = r; motion = Array.isArray(m.events) ? m.events : [];
  }

  // ================================================================== the pictures (the server's frame route)
  // frames: id → {url (an object URL), at (ms), err (words)}; asked: id → when last asked (ms)
  const frames = new Map(), asked = new Map(), inFlight = new Set();
  const MAX_TILES = 9, MAX_FLIGHT = 3, MAX_PHONE = 4;   // (a phone: pictures for at most 4 tiles on screen at once)
  function paint(id) {
    const f = frames.get(id);
    for (const img of document.querySelectorAll(`img.cm-img[data-cam="${id}"]`)) {
      if (f && f.url && img.src !== f.url) img.src = f.url;
      img.closest(".cm-media")?.classList.toggle("has", !!(f && f.url));
    }
    for (const n of document.querySelectorAll(`[data-age="${id}"]`)) n.textContent = f && f.at ? new Date(f.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
    for (const n of document.querySelectorAll(`[data-err="${id}"]`)) { n.textContent = f && f.err ? f.err : ""; n.hidden = !(f && f.err && !f.url); }
  }
  // after an error (offline, no picture, the camera video down) a camera is asked again only after BACKOFF ms
  const BACKOFF = 30000, notBefore = new Map();
  async function pull(id) {
    if (inFlight.has(id) || inFlight.size >= MAX_FLIGHT || Date.now() < (notBefore.get(id) || 0)) return;
    inFlight.add(id); asked.set(id, Date.now());
    try {
      // (a background poll: X-Skypane-Poll — an open Cameras tab nobody uses still signs out; Manage.poll)
      const r = await M.poll(`/api/manage/cameras/${id}/frame.jpg`);   // i18n-ok (API path)
      if (!r) return;
      if (r.ok) {
        const url = URL.createObjectURL(await r.blob()), old = frames.get(id);
        frames.set(id, { url, at: Date.now(), err: "" });
        notBefore.delete(id);
        if (old && old.url) setTimeout(() => URL.revokeObjectURL(old.url), 2000);   // (the tile may still be drawing it)
        if (banner) { banner = ""; drawBanner(); }
      } else if (r.status !== 429) {   // (429: this login asked for too many at once — next time)
        let words = K.t("cameras.noPicture");
        try { words = (await r.json()).error || words; } catch {}
        const old = frames.get(id) || {};
        frames.set(id, { ...old, err: words });
        notBefore.set(id, Date.now() + BACKOFF);
        if (r.status === 503 && /isn't running|isn't answering/.test(words) && !banner) { banner = words; drawBanner(); }
      }
    } catch { /* (the server unreachable a moment: next time) */ }
    finally { inFlight.delete(id); paint(id); }
  }
  // which tiles want pictures now: the ones on screen (the spotlight first), at most MAX_TILES
  const seen = new Set();
  const io = window.IntersectionObserver ? new IntersectionObserver((es) => { for (const e of es) { const id = +e.target.dataset.cam; if (e.isIntersecting) seen.add(id); else seen.delete(id); } }) : null;
  function startFrames() {
    clearInterval(tick);
    tick = setInterval(() => {
      if (!onPage() || document.visibilityState !== "visible" || !$page || !$page.isConnected) return;
      // (v2.9.0, a phone: the camera open full screen is the only one asked for — once a second)
      if (viewerCam != null) { if (Date.now() - (asked.get(viewerCam) || 0) >= 1000) pull(viewerCam); return; }
      // (an offline camera: one picture, then again every 30 s — Protect keeps its last one)
      const want = [...$page.querySelectorAll(".cm-media[data-cam]:not(.novideo)")].map((n) => [+n.dataset.cam, n.classList.contains("big"), n.classList.contains("off")])
        .filter(([id]) => !io || seen.has(id)).slice(0, phone() ? MAX_PHONE : MAX_TILES);
      const now = Date.now();
      for (const [id, big, off] of want.sort((a, b) => b[1] - a[1])) if (now - (asked.get(id) || 0) >= (off ? BACKOFF : big ? 1000 : 2000)) pull(id);
      if (viewNow() === "live" && now - motionAt > 30000) pollMotion();   // (Recent motion: read again every 30 s)
    }, 250);
  }
  function stopFrames() { clearInterval(tick); tick = null; stopLive(); }
  let motionAt = Date.now();
  async function pollMotion() {
    motionAt = Date.now();
    try {
      const r = await M.poll("/api/manage/cameras/motion?limit=12");   // i18n-ok (API path)
      if (!r || !r.ok) return;
      const j = await r.json(), next = Array.isArray(j.events) ? j.events : [];
      if (JSON.stringify(next) === JSON.stringify(motion)) return;
      motion = next;
      const old = $page && $page.querySelector(".cm-motion");
      if (old) old.replaceWith(motionStrip());
    } catch { /* (next time) */ }
  }
  const media = (c, big, extra, noWatch) => {   // (noWatch: the phone's viewer — not one of the page's tiles)
    // (a camera without video now — Protect says so: no picture to ask for, said once instead of asked every 2 s)
    const nov = c.video === false;
    const n = el("div.cm-media" + (big ? ".big" : "") + (c.online ? "" : ".off") + (nov ? ".novideo" : ""), { "data-cam": String(c.id) },
      el("img.cm-img", { "data-cam": String(c.id), alt: K.t("cameras.pictureNow", { name: c.name }) }),
      nov ? el("span.cm-nov", {}, ic("camera", 22), c.online ? K.t("cameras.noVideo") : K.t("cameras.offlineNoPicture"))
        : [el("span.cm-ph", {}, ic("camera", 22)), el("span.cm-err", { "data-err": String(c.id), hidden: true })], extra || null);
    if (io && !noWatch) io.observe(n);
    queueMicrotask(() => paint(c.id));
    return n;
  };

  // ---------- live video in the spotlight (go2rtc's own player, the built-in camera video on the home network) ----------
  let liveFor = null, liveEl = null, liveTimer = null, PlayerClass = null;
  function stopLive() { clearTimeout(liveTimer); if (liveEl) { try { liveEl.remove(); } catch {} } liveEl = null; liveFor = null; }
  async function startLive(id, box) {
    if (phone() || liveFor === id) return;
    const tag0 = (box.closest(".cm-tile") || box).querySelector(".cm-mode");
    // (an https Manager — a proxy, away from home: the camera video's guard speaks plain ws only; not tried: said at once)
    if (location.protocol === "https:") { if (tag0) tag0.textContent = K.t("cameras.live.httpsOnly"); return; }
    stopLive(); liveFor = id;
    let r;
    try { r = await api(`/api/manage/cameras/${id}/live`); } catch { return; }
    if (!r || !r.src || liveFor !== id || !box.isConnected) return;
    try {
      if (!PlayerClass) {
        const { VideoRTC } = await import("/layouts/v4/shared/go2rtc-video-rtc.js");   // i18n-ok (module path)
        PlayerClass = class extends VideoRTC { constructor() { super(); this.mode = "webrtc,mse"; this.media = "video"; this.visibilityCheck = false; }   // i18n-ok (player mode)
          oninit() { super.oninit(); this.video.muted = true; this.video.controls = false; this.video.playsInline = true; this.video.style.objectFit = "contain"; } };
        if (!customElements.get("cm-video")) customElements.define("cm-video", PlayerClass);
      }
    } catch { return; }
    if (liveFor !== id || !box.isConnected) return;
    liveEl = document.createElement("cm-video");
    liveEl.className = "cm-video";
    liveEl.src = `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:${r.port}/api/ws?src=${encodeURIComponent(r.src)}`;   // i18n-ok (URL)
    box.append(liveEl);
    const tag = (box.closest(".cm-tile") || box).querySelector(".cm-mode");
    // (no moving picture within 8 s — the camera video isn't reachable from here: the pictures stay, said in words)
    liveTimer = setTimeout(() => {
      const v = liveEl && liveEl.video;
      if (v && v.readyState >= 2 && v.videoWidth) { box.classList.add("playing"); if (tag) tag.textContent = K.t("cameras.live.video"); return; }
      stopLive(); if (tag) tag.textContent = K.t("cameras.live.homeOnly");
    }, 8000);
  }

  // ================================================================== the page
  function header() {
    const acts = el("div.acts", {},
      mayChange() && M.isAdmin() && !phone() && C && C.builtin ? el("button.btn.pri", { type: "button", onclick: addCamera }, ic("plus", 16), el("span.bl", {}, K.t("cameras.addCamera"))) : null);
    return el("div.ph", {}, el("div", {}, el("h1", {}, K.t("cameras.shared.aboutcameras")),
      el("p", {}, phone() ? K.t("cameras.intro.phone") : K.t("cameras.intro"))),
    el("span.sp"), acts.childElementCount ? acts : null, phone() || !acts.childElementCount ? null : el("span.vr"), phone() ? null : S.viewSwitch("cameras"));
  }
  const bannerBox = el("div.cm-banner", { role: "status" });
  // the cameras' state in one chip: the camera video down says so first (amber) — never "all online" beside the
  // banner; else how many of them Protect says are online
  function onlineChip(online, total) {
    const warn = !!banner || online < total;
    return el("span.pill.cm-chip" + (warn ? ".warn" : ""), { "data-online": String(online), "data-total": String(total) }, el("span.dot" + (warn ? ".warn" : "")),
      banner ? K.t("cameras.chip.notAnswering") : online === total ? K.t("cameras.chip.allOnline", { n: online })
        : K.t("cameras.chip.someOnline", { online, n: total }));
  }
  function drawBanner() {
    bannerBox.replaceChildren(...(banner ? [el("p.pn-warn", {}, ic("alert", 15), K.t("cameras.banner", { problem: banner }))] : []));
    if ($page) {
      $page.classList.toggle("cm-down", !!banner);
      for (const t of $page.querySelectorAll(".cm-tile.big .cm-mode")) if (!t.closest(".playing")) t.textContent = banner ? K.t("cameras.live.waiting") : modeWords();
      const chip = $page.querySelector(".cm-chip");
      if (chip) chip.replaceWith(onlineChip(+chip.dataset.online, +chip.dataset.total));
      for (const b of $page.querySelectorAll(".cm-live:not(.off)")) b.textContent = banner ? K.t("cameras.tag.noVideo") : K.t("cameras.tag.live");
      const pill = $page.querySelector(".cm-vpill");
      if (pill) { pill.classList.toggle("warn", !!banner); pill.textContent = banner ? K.t("cameras.every.notAnswering", { name: pill.dataset.name }) : pill.dataset.name; }
    }
  }
  const modeWords = () => K.t("cameras.live.mode");
  function frame(...kids) {
    drawBanner();
    $page = el("div.cm-page" + (banner ? ".cm-down" : ""), { "data-view": viewNow() }, header(), bannerBox, ...kids);
    M.swap(M.$main, $page);
  }
  async function render() {
    stopFrames();
    if (!C) M.$main.replaceChildren(S.isPhone() ? el("div.p-skel", { role: "status", "aria-label": K.t("common.loading") }, el("i"), el("i"), el("i")) : el("p.muted", {}, K.t("common.loading")));   // (v2.9.0: a phone, skeleton rows)
    try { await load(); } catch (e) { if (e.message !== "login") M.$main.replaceChildren(K.empty("camera", K.t("cameras.cantRead"), K.t("cameras.cantReadWhy"))); return; }
    if (!onPage()) return;
    if (viewNow() === "setup") drawSetup(); else drawLive();
  }
  function noCameras() {
    const why = C.builtin ? K.t("cameras.none.builtin")
      : C.separate ? K.t("cameras.none.separate")
        : K.t("cameras.none.noVideo");
    const add = mayChange() && M.isAdmin() && C.builtin && !phone() ? el("button.btn.pri", { type: "button", onclick: addCamera }, ic("plus", 15), K.t("cameras.addCamera")) : null;
    const integ = M.isAdmin() ? el("button.btn" + (add ? "" : ".pri"), { type: "button", onclick: () => M.go("integrations") }, K.t("cameras.openIntegrations")) : null;
    return K.empty("camera", K.t("cameras.none.title"), why, add || integ ? el("div.cm-eacts", {}, integ, add) : null);
  }

  // ================================================================== Live
  function drawLive() {
    const all = visible();
    if (!all.length) { frame(C.all.length ? K.empty("camera", K.t("cameras.none.here"), K.t("cameras.none.hereWhy")) : noCameras()); return; }
    const rooms = [...new Set(all.map((c) => c.room).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (room && !rooms.includes(room)) room = "";
    const list = all.filter((c) => !room || c.room === room);
    if (!spot || !list.some((c) => c.id === spot)) spot = (list.find((c) => c.doorbell && c.online) || list.find((c) => c.online) || list[0] || {}).id;
    const online = all.filter((c) => c.online).length;
    const lastMotion = new Map(); for (const e of motion) if (!lastMotion.has(e.camera)) lastMotion.set(e.camera, e.t);
    // a tile: the picture, its name and state over it (the mockup), the actions over it on hover / focus;
    // a phone: a tap opens it full screen
    const tile = (c, big) => {
      const m = lastMotion.get(c.id);
      const acts = phone() ? null : el("span.cm-acts2", {},
        !big && layout === "spot" ? el("button.cm-ib", { type: "button", "aria-label": K.t("cameras.tile.spotlightFor", { name: c.name }), "data-tip": K.t("cameras.tile.spotlight"), onclick: () => { spot = c.id; drawLive(); } }, ic("maximize", 14)) : null,
        el("button.cm-ib", { type: "button", "aria-label": K.t("cameras.tile.bigFor", { name: c.name }), "data-tip": K.t("cameras.tile.big"), onclick: () => bigPicture(c) }, ic("image", 14)),
        el("button.cm-ib", { type: "button", "aria-label": K.t("cameras.tile.fullFor", { name: c.name }), "data-tip": K.t("cameras.tile.full"), onclick: (e) => fullScreen(e.currentTarget.closest(".cm-tile")) }, ic("full", 14)));
      return el("div.cm-tile" + (big ? ".big" : ""), { role: phone() ? "button" : "group", "aria-label": phone() ? t("cameras.open", { name: c.name }) : c.name, tabindex: phone() ? "0" : null,
        onclick: phone() ? () => openViewer(c.id) : null, onkeydown: phone() ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openViewer(c.id); } } : null },
        phone() ? media(c, big, [el("span.cm-ov", {}, el("span.cm-live" + (c.online ? "" : ".off"), {}, !c.online ? K.t("cameras.tag.offline") : banner ? K.t("cameras.tag.noVideo") : K.t("cameras.tag.live"))),   // (v2.9.0 gate 2: a phone)
          el("span.cm-ov2.cmp", {}, el("b.cmp-n", {}, c.name), m ? el("small.cmp-r", {}, K.t("cameras.motionAgo", { ago: ago(m) })) : c.room && c.room.toLowerCase() !== c.name.toLowerCase() ? el("small.cmp-r", {}, c.room) : null)])
          : media(c, big, [el("span.cm-ov", {}, el("span.cm-live" + (c.online ? "" : ".off"), {}, !c.online ? K.t("cameras.tag.offline") : banner ? K.t("cameras.tag.noVideo") : K.t("cameras.tag.live")), el("b", {}, c.name),
          el("span.cm-ts", { "data-age": String(c.id) })),
        el("span.cm-ov2", {}, el("span.cm-mode", {}, big && !phone() ? (banner ? K.t("cameras.live.waiting") : modeWords()) : m ? K.t("cameras.motionAgo", { ago: ago(m) }) : c.room || ""), acts)]));
    };
    const ordered = layout === "spot" ? [list.find((c) => c.id === spot), ...list.filter((c) => c.id !== spot)].filter(Boolean) : list;
    viewList = ordered.map((c) => c.id);   // (the phone's viewer swipes through these — the grid's own order)
    const wall = layout === "spot" && !phone()
      ? el("div.cm-wall", {}, tile(ordered[0], true), ordered.length > 1 ? el("div.cm-rest", { role: "list", "aria-label": K.t("cameras.live.others") }, ordered.slice(1).map((c) => tile(c, false))) : null)
      : el("div.cm-wall.even", {}, ordered.map((c) => tile(c, false)));
    const lay = el("div.seg", { role: "group", "aria-label": K.t("cameras.layout.label") }, [["spot", K.t("cameras.layout.spot")], ["even", K.t("cameras.layout.even")]].map(([k, n]) =>
      el("button" + (layout === k ? ".on" : ""), { type: "button", "aria-pressed": String(layout === k), onclick: () => { layout = k; try { localStorage.setItem(LKEY, k); } catch {} drawLive(); } }, n)));
    const roomSel = rooms.length > 1 ? el("select.cm-room", { "aria-label": K.t("cameras.room"), onchange: (e) => { room = e.target.value; drawLive(); } },
      el("option", { value: "" }, K.t("cameras.everyRoom")), rooms.map((r) => el("option", { value: r, selected: r === room }, r))) : null;
    const tools = el("div.cm-tools", {}, phone() ? null : lay, roomSel, onlineChip(online, all.length),
    el("span.sp"), phone() ? null : list.length > MAX_TILES ? el("small.muted", {}, K.t("cameras.live.firstTiles", { n: MAX_TILES })) : null);
    stopLive();
    frame(tools, wall, motionStrip());
    fitRest();
    startFrames();
    const big = $page.querySelector(".cm-media.big");
    if (big && layout === "spot" && C.builtin && !phone()) startLive(spot, big);
  }
  // the column beside the spotlight is as tall as the spotlight (it scrolls when there are more cameras)
  // (v2.9.0 gate 2: watched once per spotlight tile — observing it again from inside the observer's own answer started a
  // "ResizeObserver loop" — and set on the next frame, only when the height really changes)
  let roFor = null, fitQ = 0;
  const restRO = window.ResizeObserver ? new ResizeObserver(() => { cancelAnimationFrame(fitQ); fitQ = requestAnimationFrame(() => fitRest()); }) : null;
  function fitRest() {
    const big = $page && $page.querySelector(".cm-wall > .cm-tile.big"), rest = $page && $page.querySelector(".cm-rest");
    if (!big || !rest) return;
    if (restRO && roFor !== big) { restRO.disconnect(); restRO.observe(big); roFor = big; }
    const want = getComputedStyle(rest).display === "grid" ? "" : `${big.offsetHeight}px`;
    if (rest.style.height !== want) rest.style.height = want;
  }
  function motionStrip() {
    const ok = new Set(visible().map((c) => c.id));
    const ev = motion.filter((e) => ok.has(e.camera)).slice(0, 12);
    return el("section.cm-motion", {}, el("div.gh", {}, K.t("cameras.motion.title"), el("span.r", {}, ev.length ? K.t("cameras.motion.note") : "")),
      ev.length ? el("div.cm-mstrip", {}, ev.map((e) => { const c = camById(e.camera);
        return el("button.cm-shot", { type: "button", "aria-label": K.t("cameras.motion.shot", { name: e.name, ago: ago(e.t) }), onclick: () => { if (layout === "spot") { spot = e.camera; drawLive(); } else if (c) bigPicture(c); } },
          c ? media(c, false) : el("div.cm-media"), el("span.cm-shot-t", {}, el("b", {}, e.name), el("small", {}, ago(e.t)))); }))
        : el("p.pn-info", {}, K.t("cameras.motion.none")));
  }
  // the picture, big: the newest one, or the camera's trouble in words — Save only once there is a picture (never a
  // link that would save this page)
  function bigPicture(c) {
    let close = null;
    const img = el("img.cm-bigimg", { alt: K.t("cameras.pictureNow", { name: c.name }), hidden: true });
    const say = el("small.muted", {}, K.t("cameras.big.loading"));
    const none = el("div.cm-bignone", { hidden: true }, ic("camera", 26), el("span"));
    const save = el("button.btn.cm-save", { type: "button", disabled: true }, ic("download", 15), K.t("cameras.save"));
    const show = () => {
      const g = frames.get(c.id);
      if (g && g.url) {
        img.src = g.url; img.hidden = false; none.hidden = true;
        say.textContent = K.t("cameras.big.at", { time: new Date(g.at).toLocaleTimeString() });
        save.disabled = false;
        save.onclick = () => { const a = el("a", { href: g.url, download: `${c.name}.jpg` }); document.body.append(a); a.click(); a.remove(); };
        return true;
      }
      if (g && g.err) { img.hidden = true; none.hidden = false; none.lastChild.textContent = g.err; say.textContent = K.t("cameras.noPicture"); save.disabled = true; return true; }
      return false;
    };
    const shade = el("div.modal-bg", { onclick: (e) => { if (e.target === shade) close(); } },
      el("div.modal.cm-modal", { role: "dialog", "aria-modal": "true", "aria-label": c.name },
        el("div.ehead", {}, el("div", {}, el("h2", {}, c.name), say),
          el("button.btn.ghost.sm", { type: "button", "aria-label": K.t("common.close"), onclick: () => close() }, "✕")),
        el("div.cm-bigbox", {}, img, none), el("div.pn-ask-acts", {}, save)));
    close = M.dialog(shade);
    if (c.video === false) { frames.set(c.id, { ...(frames.get(c.id) || {}), err: c.online ? K.t("cameras.noVideo") : K.t("cameras.offlineNoPicture") }); }
    if (show() && frames.get(c.id).url) return;
    // (asked now — a camera already being asked or waiting out its pause: its answer when it comes, at most 8 s)
    notBefore.delete(c.id);
    const t0 = Date.now();
    const wait = () => {
      if (!shade.isConnected) return;
      pull(c.id).then(() => {
        const g = frames.get(c.id);
        if ((g && g.url && g.at >= t0 - 1500) || (g && g.err && !inFlight.has(c.id))) return show();
        if (Date.now() - t0 > 8000) { show() || (none.hidden = false, none.lastChild.textContent = K.t("cameras.big.late"), say.textContent = K.t("cameras.noPicture")); return; }
        setTimeout(wait, 400);
      });
    };
    wait();
  }
  // ================================================================== a phone: one camera full screen (v2.9.0)
  // A tap on a tile: the camera alone, full screen; swipe (or ‹ ›) for the next one, Back / ✕ closes. Only that camera
  // is asked for pictures (every second) while it's open; Save picture when there is one.
  let viewerCam = null, viewList = [], viewerClose = null;
  function openViewer(id) {
    if (!viewList.includes(id)) viewList = visible().map((c) => c.id);
    const title = el("b.cmv-name"), sub = el("small.cmv-sub", { "aria-live": "polite" });
    const stage = el("div.cmv-stage");
    const prev = el("button.ib.cmv-nb", { type: "button", "aria-label": t("cameras.prev") }, ic("chevL", 22));
    const next = el("button.ib.cmv-nb", { type: "button", "aria-label": t("cameras.next") }, ic("chevR", 22));
    const save = el("button.btn.cmv-save", { type: "button", disabled: true }, ic("download", 16), t("cameras.save"));
    const xB = el("button.ib.cmv-x", { type: "button", "aria-label": t("common.close") }, ic("x", 22));
    const box = el("section.modal.cmv", { role: "dialog", "aria-modal": "true", "aria-labelledby": "cmv-h" },
      el("header.cmv-h", {}, el("div", { id: "cmv-h" }, title, sub), xB), stage, el("div.cmv-nav", {}, prev, save, next));
    const shade = el("div.modal-bg.top.cmv-bg", {}, box);
    let i = Math.max(0, viewList.indexOf(id)), closeD = null;
    const show = () => {
      const c = camById(viewList[i]); if (!c) return close();
      viewerCam = c.id;
      title.textContent = c.name;
      sub.textContent = viewList.length > 1 ? t("cameras.of", { n: i + 1, total: viewList.length }) : c.room || "";
      box.setAttribute("aria-label", c.name);
      stage.replaceChildren(media(c, true, el("span.cm-ov", {}, el("span.cm-live" + (c.online ? "" : ".off"), {}, !c.online ? K.t("cameras.tag.offline") : banner ? K.t("cameras.tag.noVideo") : K.t("cameras.tag.live")),
        el("span.cm-ts", { "data-age": String(c.id) })), true));
      prev.disabled = i === 0; next.disabled = i >= viewList.length - 1;
      notBefore.delete(c.id); asked.delete(c.id); pull(c.id);
    };
    const go = (d) => { const j = i + d; if (j < 0 || j >= viewList.length) return; i = j; show(); };
    prev.addEventListener("click", () => go(-1)); next.addEventListener("click", () => go(1));
    box.addEventListener("keydown", (e) => { const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (d) { e.preventDefault(); go(d); } });
    // (a swipe sideways on the picture: the next / the one before; up and down still scroll nothing — the stage fits)
    let x0 = null, y0 = 0;
    stage.addEventListener("pointerdown", (e) => { x0 = e.clientX; y0 = e.clientY; });
    stage.addEventListener("pointerup", (e) => { if (x0 == null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1); });
    stage.addEventListener("pointercancel", () => { x0 = null; });
    save.addEventListener("click", () => { const g = frames.get(viewerCam); const c = camById(viewerCam);
      if (!g || !g.url || !c) return; const a = el("a", { href: g.url, download: `${c.name}.jpg` }); document.body.append(a); a.click(); a.remove(); });
    const watch = setInterval(() => { const g = frames.get(viewerCam); save.disabled = !(g && g.url); if (!shade.isConnected) clearInterval(watch); }, 500);
    function close() { viewerCam = null; viewerClose = null; clearInterval(watch); if (closeD) { const f = closeD; closeD = null; f(); } }
    xB.addEventListener("click", () => close());
    closeD = M.dialog(shade, xB, () => close());
    if (window.Phone && Phone.asSheet) Phone.asSheet(shade, () => close());   // (gate 1: closed and settled before a route change)
    viewerClose = close;
    show();
  }

  function fullScreen(node) { if (node && node.requestFullscreen) node.requestFullscreen().catch(() => toast(K.t("cameras.fullRefused"), true)); }

  // ================================================================== Setup
  function drawSetup() {
    if (!C.all.length && !C.cameras.length) { frame(noCameras(), viewsGroup()); return; }
    const list = C.all;
    if (!cur || !list.some((c) => c.id === cur)) cur = (list[0] || {}).id;
    const shownOn = (id) => C.panels.filter((p) => p.shows.includes(id));
    const rows = list.map((c) => {
      const own = ownById(c.id), n = shownOn(c.id).length;
      return { id: c.id, cells: {
        name: el("span.cm-nm", {}, ic("camera", 15), el("b", {}, c.name), el("span.pill" + (c.own ? ".acc" : ".idle"), {}, c.own ? K.t("cameras.setup.own") : K.t("cameras.setup.protect"))),
        room: c.room || "—",
        stream: c.own ? (own && own.sub ? K.t("cameras.setup.mainSub") : K.t("cameras.setup.mainOnly")) : K.t("cameras.setup.fromProtect"),
        shown: C.panels.length ? K.t("cameras.setup.shownOf", { shown: n, n: C.panels.length }) : "—",
        status: el("span.cm-st", {}, el("span.dot" + (c.online ? "" : ".bad")), c.online ? K.t("cameras.setup.online") : K.t("cameras.setup.offline")) } };
    });
    const tbl = K.table({ label: K.t("cameras.shared.aboutcameras"), cols: [["name", K.t("cameras.col.camera")], ["room", K.t("cameras.room"), { cls: "c-mid" }], ["stream", K.t("cameras.col.stream"), { cls: "c-wide" }], ["shown", K.t("cameras.col.shown")], ["status", K.t("cameras.shared.status")]],
      rows, cur, onPick: (id) => { cur = id; drawSetup(); const r = M.$main.querySelector(`.k-tbl tr[data-id="${id}"]`); if (r) r.focus({ preventScroll: true }); } });
    const online = list.filter((c) => c.online).length;
    const foot = el("p.gf", {}, K.t("cameras.setup.foot", { n: list.length, online, video: C.builtin ? K.t("cameras.setup.footBuiltin") : C.separate ? K.t("cameras.setup.footSeparate") : K.t("cameras.setup.footNone") }));
    // (a narrow window: one column — the camera's card right under the table)
    if (window.innerWidth < 900) frame(el("div.cm-one", {}, tbl, foot, side(camById(cur)), viewsGroup(), everyGroup()));
    else frame(K.sideLayout(el("div", {}, tbl, foot, viewsGroup(), everyGroup()), side(camById(cur))));
    startFrames();
  }
  function side(c) {
    if (!c) return null;
    const own = ownById(c.id), may = mayChange();
    const parts = [];
    parts.push(c.pictures ? media(c, false, el("span.cm-ov", {}, el("b", {}, c.name), el("span.cm-ts", { "data-age": String(c.id) }))) : el("div.cm-media.none", {}, el("span", {}, K.t("cameras.side.noPicture"))));
    parts.push(el("div.cm-sh", {}, el("b", {}, c.name), el("span.pill" + (c.own ? ".acc" : ".idle"), {}, c.own ? K.t("cameras.setup.own") : K.t("cameras.setup.protect")),
      el("small", {}, c.own ? K.t("cameras.side.ownNote") : K.t("cameras.side.protectNote"))));
    // its name and room (your own cameras), its stream (typed again to change it — the stored one never comes back)
    if (own) {
      const name = el("input", { type: "text", value: own.name, maxlength: "40", "aria-label": K.t("cameras.name"), disabled: !may });
      const rooms = [...new Set([...(C.rooms || []), ...(own.room ? [own.room] : [])])].sort((a, b) => a.localeCompare(b));   // (its own room, even one the hub doesn't have)
      const roomSel = el("select", { "aria-label": K.t("cameras.room"), disabled: !may }, el("option", { value: "" }, K.t("cameras.noRoom")), rooms.map((r) => el("option", { value: r, selected: r === own.room }, r)));
      const mainIn = el("input", { type: "password", autocomplete: "off", "aria-label": K.t("cameras.mainStream"), disabled: !may, placeholder: own.host ? K.t("cameras.side.setHost", { host: own.host }) : K.t("cameras.side.set") });
      const subIn = el("input", { type: "password", autocomplete: "off", "aria-label": K.t("cameras.subStream"), disabled: !may, placeholder: own.sub ? K.t("cameras.side.set") : K.t("cameras.side.optional") });
      parts.push(el("div.cm-sec", { "data-unsaved": K.t("cameras.side.unsaved", { name: own.name }) }, el("h4", {}, K.t("cameras.side.this")),
        el("label.cm-fld", {}, el("span", {}, K.t("cameras.name")), name), el("label.cm-fld", {}, el("span", {}, K.t("cameras.room")), roomSel),
        el("label.cm-fld", {}, el("span", {}, K.t("cameras.side.mainHd")), mainIn), el("label.cm-fld", {}, el("span", {}, K.t("cameras.subStreamSmall")), subIn),
        may ? el("div.cm-acts", {}, el("button.btn.sm.pri", { type: "button", onclick: () => send({ action: "edit", id: own.id, name: name.value, room: roomSel.value,
          main: mainIn.value.trim(), ...(subIn.value.trim() ? { sub: subIn.value.trim() } : {}) }) }, K.t("cameras.saveButton")),
        own.sub ? el("button.btn.sm", { type: "button", onclick: () => send({ action: "edit", id: own.id, sub: "" }, K.t("cameras.side.subRemoved")) }, K.t("cameras.side.noSub")) : null) : null));
    }
    // which panels show it: per panel, the views it is in — a switch for each. Only the panels this login may change
    // (v2.9.2: the others aren't listed at all; none: one line instead)
    const inViews = Object.entries(C.viewCams || {}).filter(([, ids]) => ids.includes(c.id)).map(([v]) => v);
    const viewName = (v) => ((C.protectViews || []).find((x) => x.id === v) || C.views.find((x) => x.id === v) || {}).name || v;
    const mine = C.panels.filter((p) => p.mayEdit);
    const panelRows = mine.map((p) => {
      const shows = p.shows.includes(c.id);
      const sws = inViews.map((v) => {
        const on = !p.hiddenViews.includes(v);
        return el("div.cm-pv", {}, el("span", {}, viewName(v)), K.sw(on, (x) => setView(p.id, v, x), K.t("cameras.side.viewSwitch", { panel: p.name, view: viewName(v) })));
      });
      return el("div.cm-panel", {}, el("div.cm-pn", {}, el("span.dot" + (shows ? "" : ".idle")), el("b", {}, p.name), el("small", {}, shows ? K.t("cameras.side.shows") : K.t("cameras.side.notShows"))), ...sws);
    });
    parts.push(el("div.cm-sec", {}, el("h4", {}, K.t("cameras.side.showOn")),
      inViews.length ? null : el("p.pn-info", {}, K.t("cameras.side.noView")),
      ...(!C.panels.length ? [el("p.pn-info", {}, K.t("cameras.side.noPanels"))] : mine.length ? panelRows : [el("p.pn-info", {}, K.t("cameras.noPanelsToChange"))]),
      inViews.length && mine.length ? el("small.gf", {}, K.t("cameras.side.switchNote")) : null));
    // pop-ups (today's behaviour, in words) — rules per camera come later (the design notes)
    parts.push(el("div.cm-sec", {}, el("h4", {}, K.t("cameras.side.popUp")),
      el("p.pn-info", {}, c.doorbell ? K.t("cameras.side.doorbell")
        : K.t("cameras.side.rule")),
      el("div.cm-pv.dis", {}, el("span", {}, K.t("cameras.side.whenDoor")), el("small.muted", {}, K.t("cameras.side.coming")))));
    parts.push(el("div.cm-acts.foot", {},
      c.pictures ? el("button.btn.sm", { type: "button", onclick: () => bigPicture(c) }, ic("image", 14), K.t("cameras.side.test")) : null,
      el("span.sp"),
      own && may ? el("button.btn.sm.pn-danger", { type: "button", onclick: async () => {
        if (await K.ask({ title: K.t("cameras.remove.ask", { name: own.name }), text: K.t("cameras.remove.text"), yes: K.t("cameras.remove.yes"), danger: true }))
          send({ action: "remove", id: own.id }, K.t("cameras.remove.done"));
      } }, ic("trash", 14), K.t("cameras.remove.button")) : null));
    return el("section.card.flush.cm-side", { "aria-label": c.name }, ...parts);
  }
  async function setView(pid, vid, on) {
    try {
      const r = await api(`/api/manage/panels/${encodeURIComponent(pid)}`, { set: { "cameras.hiddenViews": { [vid]: !on } } });
      if (!r.ok) { toast(r.error === "not-allowed" ? K.t("cameras.panel.adminOnly") : r.error || K.t("cameras.notSaved"), true); return render(); }
      toast(K.t("cameras.panel.saved"));
      await render();
    } catch (e) { if (e.message !== "login") toast(K.t("cameras.unreachable"), true); }
  }
  let sending = false;   // (a double tap doesn't add a camera / view twice)
  async function send(body, msg) {
    if (sending) return false;
    sending = true;
    try {
      const r = await api("/api/manage/cameras", body);
      if (!r.ok) { const w = String(r.error || K.t("cameras.notSaved")); toast(w.charAt(0).toUpperCase() + w.slice(1), true); return false; }   // ("main stream: …" → "Main stream: …")
      toast(r.nameCleaned != null ? K.t("cameras.savedCleaned", { name: r.nameCleaned }) : msg || K.t("cameras.saved"));
      await render();
      // (a camera of your own reaches the list once the camera sync ran — a few seconds: the page reads it again
      // every 5 s for a minute, so it shows up without a reload)
      if (body.action === "add" || body.action === "edit") followUp();
      return true;
    } catch (e) { if (e.message !== "login") toast(K.t("cameras.unreachable"), true); return false; }
    finally { sending = false; }
  }
  // the views: Protect's (from Protect, read only) and your own (a name and up to 4 cameras)
  function viewsGroup() {
    const nameOf = (id) => (camById(id) || {}).name || `#${id}`;
    const may = mayChange();
    const pick = (chosen) => el("div.cm-pick", {}, C.all.map((c) => el("label.cm-chip", {}, el("input", { type: "checkbox", value: String(c.id), checked: chosen.includes(c.id) }), c.name)));
    const picked = (box) => [...box.querySelectorAll("input:checked")].map((i) => +i.value);
    const ownRow = (v) => {
      const name = el("input", { type: "text", value: v.name, maxlength: "40", "aria-label": K.t("cameras.view.nameFor", { name: v.name }) }), box = pick(v.cameras);
      return el("details.cm-view", { "data-unsaved": K.t("cameras.view.unsaved", { name: v.name }) }, el("summary", {}, ic("grid", 15), el("b", {}, v.name), el("small", {}, v.cameras.map(nameOf).join(", "))),
        el("label.cm-fld", {}, el("span", {}, K.t("cameras.name")), name), box,
        may ? el("div.cm-acts", {}, el("button.btn.sm.pri", { type: "button", onclick: () => {
          const ids = picked(box); if (ids.length < 1 || ids.length > C.viewMax) return toast(K.t("cameras.view.pick", { n: C.viewMax }), true);
          send({ action: "edit-view", id: v.id, name: name.value, cameras: ids });
        } }, K.t("cameras.saveButton")), el("button.btn.sm.pn-danger", { type: "button", onclick: async () => {
          if (await K.ask({ title: K.t("cameras.view.removeAsk", { name: v.name }), text: K.t("cameras.view.removeText"), yes: K.t("cameras.view.removeYes"), danger: true })) send({ action: "remove-view", id: v.id }, K.t("cameras.view.removed"));
        } }, K.t("cameras.remove.button"))) : null);
    };
    const prot = (C.protectViews || []).map((v) => el("div.cm-view.ro", {}, ic("grid", 15), el("b", {}, v.name), el("small", {}, K.t("cameras.view.fromProtect", { n: v.cameras }))));
    const vName = el("input", { type: "text", maxlength: "40", placeholder: K.t("cameras.view.example"), "aria-label": K.t("cameras.view.newName") }), vBox = pick([]);
    const add = may && C.all.length ? el("details.cm-view.add", {}, el("summary", {}, ic("plus", 15), el("b", {}, K.t("cameras.view.add"))),
      el("p.pn-info", {}, K.t("cameras.view.addNote", { n: C.viewMax })), el("label.cm-fld", {}, el("span", {}, K.t("cameras.name")), vName), vBox,
      el("div.cm-acts", {}, el("button.btn.sm.pri", { type: "button", onclick: () => {
        const ids = picked(vBox); if (ids.length < 1 || ids.length > C.viewMax) return toast(K.t("cameras.view.pick", { n: C.viewMax }), true);
        send({ action: "add-view", name: vName.value, cameras: ids }, K.t("cameras.view.added"));
      } }, K.t("cameras.view.addButton")))) : null;
    const items = [...prot, ...C.views.map(ownRow), add].filter(Boolean);
    return el("div.cm-later", {}, ...K.group(K.t("cameras.views.title"), items.length ? items : [el("p.pn-info.cm-pad", {}, K.t("cameras.views.none"))],
      K.t("cameras.views.note")));
  }
  function everyGroup() {
    const state = C.builtin ? [K.t("cameras.every.builtin"), K.t("cameras.every.builtinNote")] : C.separate ? [K.t("cameras.every.separate"), M.isAdmin() ? K.t("cameras.every.separateNote") : K.t("cameras.every.byAdmin")]
      : [K.t("cameras.every.notRunning"), K.t("cameras.every.notRunningNote")];
    return el("div.cm-later", {}, ...K.group(K.t("cameras.every.title"), [
      K.row(K.t("cameras.every.video"), state[1], el("span.pill.cm-vpill" + (C.builtin || C.separate ? (banner ? ".warn" : "") : ".bad"), { "data-name": state[0] },
        C.builtin || C.separate ? (banner ? K.t("cameras.every.notAnswering", { name: state[0] }) : state[0]) : state[0])),
      K.row(K.t("cameras.every.smaller"), K.t("cameras.every.smallerNote"), el("span.pill.idle", {}, K.t("cameras.every.always"))),
      M.isAdmin() ? K.row("UniFi Protect", K.t("cameras.every.protectNote"), el("button.btn.sm", { type: "button", onclick: () => M.go("integrations") }, K.t("cameras.openIntegrations"))) : null].filter(Boolean)));   // i18n-ok (product name)
  }
  // Add camera: any camera with an RTSP stream (or RTMP / HTTP MJPEG) — the addresses stay on the server
  function addCamera() {
    if (!C) return;
    if (!C.builtin) return toast(C.separate ? K.t("cameras.add.needBuiltinSeparate") : K.t("cameras.add.needBuiltin"), true);
    const name = el("input", { type: "text", maxlength: "40", placeholder: K.t("cameras.add.example"), id: "cm-add-name" });
    const roomSel = el("select", { id: "cm-add-room" }, el("option", { value: "" }, K.t("cameras.noRoom")), (C.rooms || []).map((r) => el("option", { value: r }, r)));
    const mainIn = el("input", { type: "text", placeholder: "rtsp://user:password@192.168.1.20:554/stream1", autocomplete: "off", spellcheck: "false", id: "cm-add-main" });   // i18n-ok (example address)
    const subIn = el("input", { type: "text", placeholder: K.t("cameras.add.subExample"), autocomplete: "off", spellcheck: "false", id: "cm-add-sub" });
    let close = null;
    const go = el("button.btn.pri", { type: "submit" }, K.t("cameras.addCamera"));
    const form = el("form.modal.small.pn-ask", { role: "dialog", "aria-labelledby": "cm-add-h", onsubmit: async (e) => {
      e.preventDefault(); go.disabled = true;
      const ok = await send({ action: "add", name: name.value, room: roomSel.value, main: mainIn.value.trim(), sub: subIn.value.trim() }, K.t("cameras.add.done"));
      go.disabled = false;
      if (ok) close();
    } }, el("h2", { id: "cm-add-h" }, K.t("cameras.add.title")),
      el("p", {}, K.t("cameras.add.intro")),
      el("label.pn-fld", { for: "cm-add-name" }, el("b", {}, K.t("cameras.name")), name), el("label.pn-fld", { for: "cm-add-room" }, el("b", {}, K.t("cameras.room")), roomSel),
      el("label.pn-fld", { for: "cm-add-main" }, el("b", {}, K.t("cameras.mainStream")), mainIn), el("label.pn-fld", { for: "cm-add-sub" }, el("b", {}, K.t("cameras.subStreamSmall")), subIn),
      el("div.pn-ask-acts", {}, el("button.btn", { type: "button", onclick: () => close() }, K.t("control.cancel")), go));
    const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) close(); } }, form);
    close = M.dialog(shade, name);
  }

  // ================================================================== in the shell
  document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") stopLive(); });
  window.addEventListener("hashchange", () => { if (!onPage()) stopFrames(); if (viewerClose) viewerClose(); });
  S.page("cameras", { title: K.t("cameras.shared.aboutcameras"), group: "manage", icon: "camera", demoHidden: true, allowed: () => M.can("cameras") || M.can("panels"),
    words: "camera live video motion protect rtsp stream view doorbell snapshot",
    views: [["live", K.t("cameras.view.live"), "camera", K.t("cameras.view.liveHint")], ["setup", K.t("cameras.view.setup"), "settings", K.t("cameras.view.setupHint")]],
    render: () => render() });
  M.renderCameras = () => { if (S.route().page === "cameras") render(); };
  M.camerasTopic = () => ($page && $page.isConnected && $page.dataset.view === "setup" ? "cameras" : "cameras-live");
})();
