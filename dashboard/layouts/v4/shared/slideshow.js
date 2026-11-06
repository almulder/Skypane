// (v3.0.5) The slide-show engine: one for the Slide show / Picture card, the rotating background and the screensaver
// (the design: mockups/prototypes/settings-and-pages.html → Pictures; TESTING-NOTES "Picture + Photo frame → one Slide
// show / Picture card", "More transitions", "Tablet screensaver"). The options are service/layouts.py show_opts:
//   pics ["up:<id>"…] or src "fs:<id>" (a picture folder: /api/panel/<id>/folder/<src>, resized by the server),
//   every (s), order ("random": a shuffled round, none twice before all were shown), trans, speed, dir, dip, shape, fit.
// Wall tablets are weak, so:
//   - at most two pictures in the page per show: the one showing and the next (decoded off-screen first, then put in);
//     the old one leaves when the transition ends;
//   - transitions animate only transform and opacity (the compositor's work, no repaint per frame) — "will-change" is
//     set only while one plays; overlays (a glow, a dip, a color) are plain layers that fade or slide;
//   - prefers-reduced-motion and an "Old & slow" tablet (look.gentle, or measured: few cores / a weak performance test)
//     play every transition as Cross dissolve;
//   - nothing runs while the page is hidden, a PIN pad is open or the panel is paused (FreeKiosk's screensaver) — the
//     screensaver's own show runs while it's up, and the cards and the background under it wait.
// 10 transitions plus Mix: Cross dissolve, Whip (left / right / up / down), Punch zoom, Match (try) — a dissolve through
// the two pictures' average colors, left out of Mix —, Light leak, Page turn, Cube spin, Speed ramp, Dip to black /
// white, Shape reveal (circle / star / diagonal). Mix: a different one (and direction, color, shape) each time.
(function () {
  const TRANS = ["fade", "whip", "punch", "match", "leak", "page", "cube", "ramp", "dip", "shape"];
  const MIX = TRANS.filter((t) => t !== "match");   // (Mix leaves out Match: a guess at a match cut, still to decide)
  const SPEED = { slow: 1600, normal: 1000, fast: 600 };
  const SIZE_L = 1600;   // (px on the screen: past this the large copy, else the medium one — the server's S / M / L)
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const reduced = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const pid = () => (window.PanelStore && PanelStore.id ? String(PanelStore.id).toLowerCase() : "");
  const UP = /^up:([0-9a-f]{16})$/, FS = /^fs:([0-9a-f]{12})$/, KEY = /^[0-9a-f]{20}$/;
  // (the Manager loads this file too, for its previews: no screensaver there, and its own routes for a folder — folders.js)
  const PANEL = !window.Manage;
  const API = {
    list: (id) => `/api/panel/${encodeURIComponent(pid())}/folder/${id}`,
    img: (id, k, size) => `/api/panel/${encodeURIComponent(pid())}/folder/${id}/${k}/${size}`,
  };

  // ---------- "Old & slow": every transition as Cross dissolve ----------
  function gentle() {
    if (reduced.matches) return true;
    const g = window.Settings && Settings.v && Settings.v.look ? Settings.v.look.gentle : "auto";
    if (g === "yes") return true;
    if (g === "no") return false;
    const best = window.App && App.perf && App.perf.test ? App.perf.test.best : null;   // (the performance test: 1 = only the lightest effects ran smoothly)
    return (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) || best === 1;
  }

  // ---------- where the pictures come from ----------
  const lists = new Map();   // folder id → { at, items, error, wait }
  function folderList(id) {
    const hit = lists.get(id), now = Date.now();
    if (hit && (hit.wait || now - hit.at < 600000)) return hit.wait || Promise.resolve(hit);
    if (PANEL && !pid()) return Promise.resolve({ items: [], error: "no panel" });
    const w = fetch(window.Slides.api.list(id), { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => ({ at: Date.now(), items: (Array.isArray(j.items) ? j.items : []).filter((k) => typeof k === "string" && KEY.test(k)), error: j.error || null }))
      .catch(() => ({ at: Date.now(), items: hit ? hit.items : [], error: "unreachable" }))   // (a share that's offline: the last list stays)
      .then((v) => { lists.set(id, v); return v; });
    lists.set(id, { ...(hit || { items: [] }), wait: w });
    return w;
  }
  // the pictures' addresses for a box this big (a folder's: the server's resized copy, never the full-size photo)
  async function urls(o, px) {
    const m = typeof o.src === "string" ? FS.exec(o.src) : null;
    if (m) {
      const l = await folderList(m[1]), size = px > SIZE_L ? "l" : px > 240 ? "m" : "s";   // (s: the Manager's small tiles)
      return { list: l.items.map((k) => window.Slides.api.img(m[1], k, size)), error: l.error };
    }
    return { list: (Array.isArray(o.pics) ? o.pics : []).map((v) => UP.exec(v)).filter(Boolean).map((x) => `/pictures/${x[1]}`), error: null };
  }

  // a picture's average color (Match): an 8 × 8 copy, once per picture
  const avg = new Map();
  function avgOf(img) {
    if (avg.has(img.src)) return avg.get(img.src);
    let c = [40, 40, 50];
    try {
      const cv = document.createElement("canvas"); cv.width = cv.height = 8;
      const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, 8, 8);
      const d = g.getImageData(0, 0, 8, 8).data; let r = 0, gg = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
      c = [r / 64, gg / 64, b / 64].map((v) => Math.round(v * 0.85));
    } catch {}
    if (avg.size >= 100) avg.delete(avg.keys().next().value);   // (v3.0.5: about 100 kept — the oldest goes first)
    avg.set(img.src, c);
    return c;
  }
  // (v3.0.5) a layer that leaves lets its picture go at once (a weak tablet keeps no decoded copy of it)
  function release(ly) {
    for (const im of ly.querySelectorAll("img")) im.removeAttribute("src");
    for (const bb of ly.querySelectorAll(".ss-bb")) bb.style.backgroundImage = "";
  }

  // ---------- one show in a box ----------
  const memory = new Map();   // a show's key → where it was (a card drawn again goes on from there)
  class Show {
    constructor(box, o, opts = {}) {
      this.box = box; this.o = o || {}; this.key = opts.key || ""; this.saver = !!opts.saver; this.onState = opts.onState || null;
      this.list = []; this.k = 0; this.bag = []; this.timer = 0; this.anims = []; this.busy = false; this.dead = false; this.error = null;
      box.classList.add("ss-box");
      box.style.setProperty("--ss-fit", this.o.fit === "contain" ? "contain" : "cover");
      // (v3.0.5) a card scrolled out of sight waits (no next picture loaded or played until it's back)
      this.seen = true;
      if (!this.saver && window.IntersectionObserver) { this.io = new IntersectionObserver((es) => { for (const e of es) this.seen = e.isIntersecting; }); this.io.observe(box); }
      this.start();
    }
    async start() {
      const r = this.box.getBoundingClientRect(), px = Math.max(r.width, r.height) * (window.devicePixelRatio || 1);
      const got = await urls(this.o, px);
      if (this.dead) return;
      this.list = got.list; this.error = got.error;
      if (this.onState) this.onState(this);
      if (!this.list.length) return;
      const was = memory.get(this.key);
      this.k = was && was.n === this.list.length ? was.k % this.list.length : this.o.order === "random" ? Math.floor(Math.random() * this.list.length) : 0;
      if (!this.box.querySelector(".ss-ly")) { const ly = await this.layer(this.list[this.k]); if (this.dead || !ly) { if (ly) release(ly); return; } this.box.append(ly); }
      this.schedule();
    }
    every() { const e = Math.round(Number(this.o.every)); return (Number.isFinite(e) && e >= 3 && e <= 3600 ? e : 10) * 1000; }
    schedule() { clearTimeout(this.timer); if (!this.dead && this.list.length > 1) this.timer = setTimeout(() => this.next(), this.every()); }
    paused() {
      if (document.hidden) return true;
      const h = document.documentElement.classList;
      if (h.contains("pin-open")) return true;
      if (this.seen === false) return true;   // (v3.0.5: off screen)
      if (this.saver) return !!(window.App && App.kioskIdle);   // (v3.0.5: FreeKiosk's own screensaver up, or the screen off)
      return h.contains("anim-paused") || h.contains("ss-on");   // (under the screensaver: they wait)
    }
    nextIndex() {
      const n = this.list.length;
      if (this.o.order !== "random") return (this.k + 1) % n;
      if (!this.bag.length) { this.bag = [...Array(n).keys()].filter((i) => i !== this.k); for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; } }
      return this.bag.pop();
    }
    // a layer with its picture, decoded before it goes in (null: it didn't load — that one is skipped)
    async layer(src) {
      const img = new Image(); img.alt = ""; img.draggable = false; img.decoding = "async"; img.src = src;
      try { await (img.decode ? img.decode() : new Promise((ok, no) => { img.onload = ok; img.onerror = no; })); } catch { img.removeAttribute("src"); return null; }
      const ly = document.createElement("div"); ly.className = "ss-ly";
      if (this.o.fit === "contain" && !gentle()) { const bb = document.createElement("div"); bb.className = "ss-bb"; bb.style.backgroundImage = `url("${src.replace(/["\\]/g, "")}")`; ly.append(bb); }
      ly.append(img);
      return ly;
    }
    async next() {
      if (this.dead) return;
      if (!this.box.isConnected) return this.stop();
      if (this.paused() || this.busy) { this.timer = setTimeout(() => this.next(), 2000); return; }
      this.busy = true;
      const k = this.nextIndex(), nl = await this.layer(this.list[k]);
      if (this.dead) { if (nl) release(nl); return; }
      this.busy = false;
      if (nl) { this.k = k; memory.set(this.key, { k, n: this.list.length }); this.play(nl); }
      this.schedule();
    }
    // what plays this time: the one picked, Mix's pick, or Cross dissolve (reduced motion, an old & slow tablet)
    pickT() {
      const o = this.o;
      let t = TRANS.includes(o.trans) || o.trans === "none" ? o.trans : o.trans === "mix" ? "mix" : "fade";
      const R = { t, dir: o.dir || "left", dip: o.dip || "black", shape: o.shape || "circle" };
      if (t === "mix") Object.assign(R, { t: pick(MIX), dir: pick(["left", "right", "up", "down"]), dip: pick(["black", "white"]), shape: pick(["circle", "star", "diagonal"]) });
      if (R.t !== "none" && (this.demo ? reduced.matches : gentle())) R.t = "fade";   // (a Manager preview plays what was picked)
      return R;
    }
    play(nl) {
      const box = this.box;
      this.finish();
      const old = box.querySelector(".ss-ly");
      box.append(nl);
      const R = this.pickT(), D = SPEED[this.o.speed] || SPEED.normal;
      if (!old || R.t === "none" || !nl.animate) { if (old) { release(old); old.remove(); } return; }
      const fxs = [], an = this.anims = [];
      const E = "cubic-bezier(.65,0,.35,1)";
      const A = (el, kf, opt) => { el.style.willChange = "transform, opacity"; an.push(el.animate(kf, { duration: D, easing: E, fill: "both", ...(opt || {}) })); };
      const fx = (cls, css, inside) => { const d = document.createElement("div"); d.className = "ss-fx " + cls; if (css) d.style.cssText = css; (inside || box).append(d); fxs.push(d); return d; };
      const W = box.clientWidth || 1, H = box.clientHeight || 1;
      switch (R.t) {
        case "fade": A(nl, [{ opacity: 0 }, { opacity: 1 }], { easing: "ease" }); break;
        case "whip": {
          const s = R.dir === "left" || R.dir === "up" ? -1 : 1, X = R.dir === "left" || R.dir === "right", T = (p) => (X ? `translate3d(${p}%,0,0)` : `translate3d(0,${p}%,0)`);
          A(old, [{ transform: T(0) }, { transform: T(s * 100) }], { easing: "cubic-bezier(.8,0,.2,1)" });
          A(nl, [{ transform: T(-s * 100) }, { transform: T(0) }], { easing: "cubic-bezier(.8,0,.2,1)" });
          break;
        }
        case "punch":
          A(old, [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(2.2)", opacity: 1, offset: 0.5 }, { transform: "scale(3)", opacity: 0 }], { easing: "cubic-bezier(.55,0,.45,1)" });
          A(nl, [{ transform: "scale(1.8)", opacity: 0 }, { transform: "scale(1.5)", opacity: 0, offset: 0.42 }, { transform: "scale(1)", opacity: 1 }], { easing: "cubic-bezier(.55,0,.45,1)" });
          break;
        case "match": {   // ("smart" try: a dissolve through the two pictures' average colors)
          const a = avgOf(old.querySelector("img")), b = avgOf(nl.querySelector("img")), m = a.map((v, i) => Math.round((v + b[i]) / 2));
          const f = fx("", `background:radial-gradient(120% 120% at 50% 50%, rgb(${m}) 0%, rgb(${a}) 55%, rgb(${b}) 100%)`);
          A(f, [{ opacity: 0 }, { opacity: 0.92, offset: 0.5 }, { opacity: 0 }], { easing: "ease-in-out" });
          A(nl, [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }]);
          break;
        }
        case "leak": {   // (a warm glow sweeps across; the next picture comes up under its brightest part)
          const f = fx("ss-leak");
          A(f, [{ transform: "translate3d(-70%,0,0)", opacity: 0 }, { transform: "translate3d(-15%,0,0)", opacity: 1, offset: 0.45 }, { transform: "translate3d(15%,0,0)", opacity: 1, offset: 0.58 }, { transform: "translate3d(70%,0,0)", opacity: 0 }], { easing: "linear" });
          A(nl, [{ opacity: 0 }, { opacity: 0, offset: 0.42 }, { opacity: 1, offset: 0.6 }, { opacity: 1 }], { easing: "linear" });
          break;
        }
        case "page": {   // (the old picture turns away like a page; its shade darkens as it turns)
          box.classList.add("ss-3d"); old.style.zIndex = 2; old.style.transformOrigin = "0% 50%";
          A(old, [{ transform: "perspective(1400px) rotateY(0deg)" }, { transform: "perspective(1400px) rotateY(-100deg)" }], { easing: "cubic-bezier(.45,0,.55,1)" });
          A(fx("ss-shade", "", old), [{ opacity: 0 }, { opacity: 0.55 }]);
          A(fx("ss-shade", "", nl), [{ opacity: 0.55 }, { opacity: 0 }], { easing: "ease-in" });
          break;
        }
        case "cube":
          box.classList.add("ss-3d"); old.style.transformOrigin = "100% 50%"; nl.style.transformOrigin = "0% 50%";
          A(old, [{ transform: "perspective(1100px) translate3d(0,0,0) rotateY(0deg)" }, { transform: "perspective(1100px) translate3d(-100%,0,0) rotateY(-90deg)" }]);
          A(nl, [{ transform: "perspective(1100px) translate3d(100%,0,0) rotateY(90deg)" }, { transform: "perspective(1100px) translate3d(0,0,0) rotateY(0deg)" }]);
          A(fx("ss-shade", "", old), [{ opacity: 0 }, { opacity: 0.6 }]);
          A(fx("ss-shade", "", nl), [{ opacity: 0.6 }, { opacity: 0 }]);
          break;
        case "ramp":   // (it speeds up and stretches, then snaps onto the next)
          old.style.zIndex = 2;
          A(old, [{ transform: "translate3d(0,0,0) scaleX(1)", opacity: 1, easing: "cubic-bezier(.7,0,1,1)" }, { transform: "translate3d(-9%,0,0) scaleX(1.12)", opacity: 1, offset: 0.62 },
            { transform: "translate3d(-9%,0,0) scaleX(1.12)", opacity: 0, offset: 0.63 }, { transform: "translate3d(-9%,0,0) scaleX(1.12)", opacity: 0 }], { easing: "linear" });
          A(nl, [{ transform: "translate3d(10%,0,0) scaleX(1.1)", opacity: 0 }, { transform: "translate3d(10%,0,0) scaleX(1.1)", opacity: 0, offset: 0.6 },
            { transform: "translate3d(10%,0,0) scaleX(1.1)", opacity: 1, offset: 0.62, easing: "cubic-bezier(0,0,.2,1)" }, { transform: "translate3d(0,0,0) scaleX(1)", opacity: 1 }], { easing: "linear" });
          break;
        case "dip": {
          const f = fx(R.dip === "white" ? "ss-white" : "ss-black");
          A(f, [{ opacity: 0 }, { opacity: 1, offset: 0.45 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { easing: "ease-in-out" });
          A(nl, [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.501 }, { opacity: 1 }], { easing: "linear" });
          break;
        }
        case "shape": {   // (the next picture grows out of a circle / star, or sweeps in along a diagonal — a mask layer
          // that scales or slides, the picture in it moving back the other way so it stays put: transforms only)
          const img = nl.querySelector("img"), Dg = Math.ceil(Math.hypot(W, H));
          const bb = nl.querySelector(".ss-bb"); if (bb) bb.style.display = "none";   // (the mask moves the picture alone; back after)
          if (R.shape === "diagonal") {
            const S = 2 * Dg;
            nl.classList.add("ss-mask"); Object.assign(nl.style, { width: `${S}px`, height: `${S}px`, left: `${(W - S) / 2}px`, top: `${(H - S) / 2}px` });
            Object.assign(img.style, { width: `${W}px`, height: `${H}px`, left: `${(S - W) / 2}px`, top: `${(S - H) / 2}px` });
            A(nl, [{ transform: `rotate(45deg) translate3d(${-S}px,0,0)` }, { transform: "rotate(45deg) translate3d(0,0,0)" }]);
            A(img, [{ transform: `translate3d(${S}px,0,0) rotate(-45deg)` }, { transform: "translate3d(0,0,0) rotate(-45deg)" }]);
            img.style.transformOrigin = "50% 50%";
          } else {
            nl.classList.add("ss-mask", R.shape === "star" ? "ss-star" : "ss-circle");
            const S = R.shape === "star" ? Dg * 2.7 : Dg;   // (the star's inner corners must clear the box once it's full size)
            Object.assign(nl.style, { width: `${S}px`, height: `${S}px`, left: `${(W - S) / 2}px`, top: `${(H - S) / 2}px` });
            Object.assign(img.style, { width: `${W}px`, height: `${H}px`, left: `${(S - W) / 2}px`, top: `${(S - H) / 2}px` });
            const N = 8, kfo = [], kfi = [];
            for (let i = 0; i <= N; i++) { const t = i / N, e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, s = Math.max(0.04, e);
              kfo.push({ transform: `scale(${s.toFixed(4)})`, offset: t }); kfi.push({ transform: `scale(${(1 / s).toFixed(4)})`, offset: t }); }
            A(nl, kfo, { easing: "linear" }); A(img, kfi, { easing: "linear" });
          }
          break;
        }
        default: A(nl, [{ opacity: 0 }, { opacity: 1 }]);
      }
      this.fxs = fxs;
      const mine = an;
      Promise.all(an.map((a) => a.finished)).then(() => { if (this.anims === mine) this.finish(); }, () => {});
    }
    // the transition that plays is done (or cut short by the next one): the old picture goes, the new one stays as it is
    finish() {
      const an = this.anims; this.anims = [];
      for (const x of this.fxs || []) x.remove();
      this.fxs = [];
      const lys = [...this.box.querySelectorAll(":scope > .ss-ly")];
      for (const ly of lys.slice(0, -1)) { release(ly); ly.remove(); }   // (v3.0.5: its picture let go)
      for (const a of an) { try { a.cancel(); } catch {} }
      const top = lys[lys.length - 1];
      if (top) { top.className = "ss-ly"; top.removeAttribute("style"); const img = top.querySelector("img"); if (img) img.removeAttribute("style"); const bb = top.querySelector(".ss-bb"); if (bb) bb.style.display = ""; }
      this.box.classList.remove("ss-3d");
    }
    // (v3.0.5) stopped: every layer lets its picture go, and the off-screen watch ends
    stop() {
      this.dead = true; clearTimeout(this.timer); this.finish();
      if (this.io) { this.io.disconnect(); this.io = null; }
      for (const ly of this.box.querySelectorAll(":scope > .ss-ly")) { release(ly); ly.remove(); }
    }
  }

  // ---------- the cards and the background: mounted on what the page draws ----------
  // <div class="gc-ph" data-ss="<key>" data-o="<the options as JSON>"> — grid.js draws it; mounted here once it's in
  // the page (a card drawn again: the old show stops, the new one goes on from the same picture)
  const shows = new Set();
  function mountAll() {
    for (const s of [...shows]) if (s.dead || !s.box.isConnected) { s.stop(); shows.delete(s); }
    for (const box of document.querySelectorAll("[data-ss]:not(.ss-box)")) {
      let o; try { o = JSON.parse(box.dataset.o || "{}"); } catch { o = {}; }
      shows.add(new Show(box, o, { key: box.dataset.ss, onState: (s) => {
        const note = box.parentElement && box.parentElement.querySelector(":scope > .ss-note");
        if (note) note.hidden = !s.error;
      } }));
    }
  }
  if (PANEL && window.MutationObserver) new MutationObserver(() => { clearTimeout(mountAll.t); mountAll.t = setTimeout(mountAll, 60); }).observe(document.documentElement, { childList: true, subtree: true });

  // ---------- the screensaver ----------
  // Manager → Panels → Screensaver (settings "saver": on, after s untouched, the clock, the show's options). Only on the
  // panel itself (a laptop viewing the page, the builder's canvas, Open live: never). A tap wakes the panel and the tap
  // itself is not passed on to a button. FreeKiosk's own screensaver is best switched off then (it would cover this).
  const SS = { on: false, el: null, show: null, touched: Date.now(), clockT: 0 };
  const cfg = () => (window.Settings && Settings.v && Settings.v.saver && typeof Settings.v.saver === "object" ? Settings.v.saver : null);
  const blocked = () => (window.Settings && Settings.open) || window.PANEL_DESIGN === true || window.PANEL_LIVE
    || (window.App && (App.perfTesting || App.dragging)) || (window.Bench && Bench.running)
    || (window.HubAlerts && HubAlerts.top && HubAlerts.top()) || document.documentElement.classList.contains("pin-open")
    || !!document.querySelector(".cam-full, .popup-host.show, .gwheel");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function clockHtml() {
    const H = window.HubitatData || window.H;
    const t = window.H && H.time ? H.time() : new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const ap = window.H && H.ampm ? H.ampm() : "";
    return `${esc(t)}${ap ? `<small>${esc(ap)}</small>` : ""}`;
  }
  function saverStart(force) {
    const c = cfg();
    if (SS.on || !c || (!force && (c.on !== true || blocked()))) return false;
    const el = document.createElement("div");
    el.className = "ss-saver"; el.setAttribute("role", "button"); el.setAttribute("aria-label", window.T ? T("ss.wake") : "Tap to wake");
    const box = document.createElement("div"); box.className = "ss-full";
    el.append(box);
    if (c.clock === "corner" || c.clock === "big") { const k = document.createElement("div"); k.className = "ss-clock num " + c.clock; k.innerHTML = clockHtml(); el.append(k);
      SS.clockT = setInterval(() => { k.innerHTML = clockHtml(); }, 15000); }
    document.body.append(el);
    document.documentElement.classList.add("ss-on");
    SS.on = true; SS.el = el;
    SS.show = new Show(box, c, { key: "saver", saver: true });
    // (the sky and the cards' motions stop under it — v3.0.5: its own reason, so FreeKiosk's state never restarts them)
    if (window.App && App.animPause) App.animPause(true, "show");
    return true;
  }
  function saverEnd() {
    if (!SS.on) return;
    SS.on = false; clearInterval(SS.clockT);
    if (SS.show) SS.show.stop();
    if (SS.el) SS.el.remove();
    SS.el = SS.show = null;
    document.documentElement.classList.remove("ss-on");
    if (window.App && App.animPause) App.animPause(false, "show");
  }
  // a touch: the panel is in use. While the screensaver is up it only wakes the panel — (v3.0.5) this touch is held
  // here from its start until it ends (every pointer, touch, mouse, click and long-press event, however long the finger
  // stays down), and the click the browser makes right after it too, so nothing under it is ever pressed or held
  const DOWNS = ["pointerdown", "touchstart", "mousedown"];
  const ENDS = ["pointerup", "pointercancel", "touchend", "touchcancel", "mouseup", "click", "dblclick", "auxclick", "contextmenu", "lostpointercapture"];
  const MOVES = ["pointermove", "touchmove", "mousemove", "gotpointercapture"];   // (listened to only while a hold is on: scrolling stays smooth)
  const opt = { capture: true, passive: false };
  const hold = { on: false, ids: new Set(), after: 0 };
  const stopIt = (e) => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); };
  const holdOn = (on) => { if (hold.on === on) return; hold.on = on; for (const ev of MOVES) (on ? window.addEventListener : window.removeEventListener).call(window, ev, swallow, opt); };
  function swallow(e) {
    if (hold.on) {
      // (a first finger down means no other is: a pointer whose end never came is forgotten — the hold always ends)
      if (e.type === "pointerdown") { if (e.isPrimary) hold.ids.clear(); hold.ids.add(e.pointerId); }
      if (e.type === "pointerup" || e.type === "pointercancel") hold.ids.delete(e.pointerId);
      // (the touch is over once no finger is left down: then only the click and mouse events it makes still come, at once)
      if (/up$|cancel$|end$/.test(e.type) && !hold.ids.size && !(e.touches && e.touches.length)) { holdOn(false); hold.after = Date.now() + 400; }
      stopIt(e);
      return true;
    }
    if (Date.now() < hold.after && e.type !== "pointerdown" && e.type !== "touchstart") { stopIt(e); return true; }
    return false;
  }
  const wake = (e) => {
    SS.touched = Date.now();
    if (swallow(e)) return;
    if (!SS.on) return;
    stopIt(e);
    if (e.type !== "keydown") { hold.ids.clear(); if (e.type === "pointerdown") hold.ids.add(e.pointerId); holdOn(true); }
    if (window.App) { App.kioskIdle = false; if (App.animPause) App.animPause(false); }   // (someone is looking: FreeKiosk's gate goes too)
    saverEnd();
  };
  // (on the window, in the capture phase: before any of the page's own handlers — a long press never reaches a device)
  if (PANEL) for (const ev of [...DOWNS, "keydown"]) window.addEventListener(ev, wake, opt);
  if (PANEL) for (const ev of ENDS) window.addEventListener(ev, swallow, opt);
  // (a touch whose end never comes — the page hidden meanwhile: the hold goes then)
  if (PANEL) document.addEventListener("visibilitychange", () => { if (document.hidden) { holdOn(false); hold.ids.clear(); } });
  if (PANEL) setInterval(() => {
    const c = cfg();
    if (SS.on) { if (!c || c.on !== true || (window.HubAlerts && HubAlerts.top && HubAlerts.top())) saverEnd(); return; }   // (an alert: awake at once)
    if (!c || c.on !== true || !(window.H && H.isPanel)) return;
    const after = Math.max(60, Math.min(3600, Math.round(Number(c.after)) || 300)) * 1000;
    if (Date.now() - SS.touched >= after) saverStart();
  }, 5000);

  window.Slides = {
    Show, TRANS, MIX, gentle,
    // the options as the card's data-o (only the engine's keys; numbers and words — never HTML)
    opts: (o) => JSON.stringify(o ? { pics: Array.isArray(o.pics) ? o.pics.filter((v) => typeof v === "string" && UP.test(v)).slice(0, 50) : [],
      src: typeof o.src === "string" && FS.test(o.src) ? o.src : undefined, every: o.every, order: o.order, trans: o.trans, speed: o.speed, dir: o.dir, dip: o.dip, shape: o.shape, fit: o.fit } : {}),
    mountAll, saverStart: () => saverStart(true), saverEnd, saverOn: () => SS.on,
    // (the Manager's tile preview: picture a, then the transition in o to picture b, once — stop() ends it)
    demo: async (box, a, b, o) => {
      const s = Object.create(Show.prototype);
      Object.assign(s, { box, o: o || {}, key: "", saver: true, demo: true, list: [a, b], k: 0, bag: [], anims: [], fxs: [], timer: 0, dead: false });
      box.classList.add("ss-box");
      if (!box.querySelector(".ss-ly")) { const l = await s.layer(a); if (l) box.append(l); }
      const nl = await s.layer(b);
      if (nl && box.isConnected) s.play(nl);
      return s;
    },
    // where a folder's list and pictures come from (the Manager sets its own: folders.js)
    api: API,
  };
})();
