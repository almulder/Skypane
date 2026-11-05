// Panel PIN pad + "Are you sure?" step — for opening Settings and for devices that need a confirm (valves, garage
// openers, devices marked in Settings → Rooms). The PIN is only typed here: the dashboard service checks it for
// Settings (/api/pin) and the Hubitat bridge checks it for device commands. This page never knows the right PIN.
//   await PinPad.confirm({ title, text, yes })          → true / false
//   await PinPad.ask({ title, text, check, window, purpose })  → the PIN once check(pin) said ok, else null (cancelled)
//       check(pin) → Promise<{ ok: true } | { ok: false, msg }>  (shown under the dots; the pad stays open)
//                    | { ok: false, msg, done: true }                 (shown, then the pad closes: no second try)
//                    | { ok: false, lockedFor: s }                     (too many wrong PINs: "Try again in 0:24", counted down)
//       window: "general" | "alarm" — still inside that unlock window (below): the remembered PIN is tried first, no pad
//       purpose: "general" (the default with a check) | "alert" | "disarm" — which of the service's lock-outs this pad
//                is for: one already running is counted down as soon as the pad opens (GET /api/pin?purpose=…)
//   PinPad.refusal(answer, fallback) → the check result for the service's refusal (wrong PIN, locked + seconds left)
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let cur = null; // { kind, title, text, yes, resolve, digits, msg, busy, check }
  const MAX = 8;

  function body() {
    const c = cur; if (!c) return { title: "", body: "" };
    if (c.kind === "confirm") {
      return { title: c.title, body: `<div class="pp-confirm"><p>${esc(c.text)}</p>
        <div class="row"><button class="bigbtn"${Acts.on("pp.end", false)}>${esc(T("common.cancel"))}</button>
        <button class="bigbtn primary"${Acts.on("pp.end", true)}>${esc(c.yes || T("common.yes"))}</button></div></div>` };
    }
    const dots = Array.from({ length: Math.max(4, c.digits.length) }, (_, i) => `<i class="${i < c.digits.length ? "on" : ""}"></i>`).join("");
    const wait = left(c), off = c.busy || wait > 0;
    const key = (k, label = k, cls = "") => `<button class="pp-k ${cls}" ${off ? "disabled" : ""}${Acts.on("pp.key", k)}>${label}</button>`;
    const msg = wait > 0 ? T("pin.tooMany", { time: mmss(wait) }) : c.msg || (c.busy ? T("pin.checking") : "");
    return { title: c.title, body: `<div class="pp">${c.text ? `<p class="pp-text">${esc(c.text)}</p>` : ""}
      <div class="pp-dots">${dots}</div><div class="pp-msg${wait > 0 ? " pp-wait" : ""}" role="status">${esc(msg)}</div>
      <div class="pp-keys">${"123456789".split("").map((k) => key(k)).join("")}${key("back", `<span aria-hidden="true">⌫</span><span class="sr-only">${esc(T("pin.back"))}</span>`, "fn")}${key("0")}${key("ok", esc(T("common.ok")), "ok")}</div>
      <button class="pp-cancel" ${c.busy ? "disabled" : ""}${Acts.on("pp.end", null)}>${esc(T("common.cancel"))}</button></div>` };
  }
  // ---------- (v3.0.3) everything on screen holds still while the PIN pad is open ----------
  // so no tap lands on a moving frame: <html class="pin-open"> (theme.css: every CSS animation paused, the pad itself
  // and a level 4–5 alert excepted), the app's animation gate (App.animPause(…, "pin"): html.anim-paused, which the room
  // layouts and icon motions already obey, and the sky / weather canvas loop stops drawing), the photo cards stop
  // turning (grid.js), and script animations (Element.animate) are paused here and played on again. Back to normal as
  // soon as no PIN pad is open — OK, Cancel, ×, another pop-up, a time-out (the 1 s check below catches any other way).
  let held = null;
  const outside = (a) => { const el = a && a.effect && a.effect.target; return !(el && el.closest && el.closest(".popup-host, #alerts")); };
  const hold = (on) => {
    const root = document.documentElement;
    if (on === root.classList.contains("pin-open")) return;
    root.classList.toggle("pin-open", on);
    if (window.App && App.animPause) { try { App.animPause(on, "pin"); } catch (e) { console.warn(e); } }
    if (on) {
      held = [];
      try {
        for (const a of document.getAnimations ? document.getAnimations() : []) {
          if (a.playState !== "running" || (window.CSSAnimation && a instanceof CSSAnimation) || (window.CSSTransition && a instanceof CSSTransition) || !outside(a)) continue;
          a.pause(); held.push(a);
        }
      } catch { /* (an old WebView without getAnimations: the CSS and the loops still hold) */ }
    } else {
      for (const a of held || []) { try { if (a.playState === "paused") a.play(); } catch {} }
      held = null;
    }
  };
  const sync = () => hold(!!(cur && cur.kind === "pin" && UI.isOpen()));
  // closed some other way (another popup, the alarm…): a confirm counts as "no", a PIN pad as cancelled. Each close
  // callback holds its own prompt and only acts while that one is still the open one — a second ask / confirm opened
  // over this one (UI.popup runs the old callback first) must not cancel the new prompt.
  const show = (c) => {
    UI.popup(body, () => { if (cur === c) { cur = null; c.resolve(c.kind === "confirm" ? false : null); } sync(); });
    sync();
  };

  // a lock-out from the service (lockedFor: seconds left): counted down live under the dots, the keys wait meanwhile
  const left = (c) => (c && c.until ? Math.max(0, Math.ceil((c.until - Date.now()) / 1000)) : 0);
  const mmss = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
  let tick = null;
  const countdown = (c, secs) => {
    c.until = Date.now() + Math.max(1, Math.min(3600, Math.round(+secs) || 60)) * 1000; c.msg = ""; c.digits = "";
    clearInterval(tick);
    tick = setInterval(() => {
      if (cur !== c) { clearInterval(tick); tick = null; return; }
      if (!left(c)) { c.until = 0; clearInterval(tick); tick = null; }
      UI.refreshPopup();
    }, 1000);
  };

  // a lock-out already running for this purpose (seconds left; 0 = none, or the service can't be reached)
  const lockedNow = async (purpose) => {
    try {
      const r = await fetch(`/api/pin${purpose === "general" ? "" : `?purpose=${encodeURIComponent(purpose)}`}`, { cache: "no-store" });
      return r.ok ? +(await r.json()).lockedFor || 0 : 0;
    } catch { return 0; }
  };
  // a new prompt while one is open: the open one counts as cancelled (its promise always settles). close: also take its
  // pop-up away now (when no new pop-up follows at once — the unlock-window try below; otherwise the new prompt's
  // UI.popup simply replaces it, without the screen resuming for a moment in between)
  const drop = (close) => {
    if (!cur) return;
    const c = cur; cur = null; c.resolve(c.kind === "confirm" ? false : null);
    if (close) UI.close();   // (its callback finds cur !== c: only sync() — the screen moves again until a pad opens)
  };
  const PinPad = {
    confirm({ title, text, yes } = {}) {
      drop(false);
      return new Promise((resolve) => { const c = cur = { kind: "confirm", title: title || T("common.areYouSure"), text, yes, resolve }; show(c); });
    },
    async ask({ title, text, check, window: win, purpose = "general" } = {}) {
      // still inside this action's unlock window: the PIN entered a moment ago, without the pad
      const p0 = win === "alarm" ? PinPad.alarmUnlocked() : win === "general" ? PinPad.unlocked() : null;
      drop(!!(p0 && check));
      let first = null;
      if (p0 && check) {
        try { first = await check(p0); } catch { first = null; }
        if (first && first.ok) return p0;
        if (first && first.done) return PinPad.confirm({ title: title || T("pin.title"), text: first.msg, yes: T("common.ok") }).then(() => null);
      }
      return new Promise((resolve) => {
        const c = cur = { kind: "pin", title: title || T("pin.title"), text, check, resolve, digits: "", msg: "", win };
        if (first && first.lockedFor) countdown(c, first.lockedFor);
        else if (check && purpose) lockedNow(purpose).then((s) => { if (s > 0 && cur === c && !c.busy && !left(c)) { countdown(c, s); UI.refreshPopup(); } });
        show(c);
      });
    },
    refusal(j, fallback) {
      j = j || {};
      if (j.error === "locked" || +j.lockedFor > 0) return { ok: false, lockedFor: +j.lockedFor || 60 };   // (a wrong one that started it, too)
      if (j.error === "wrong-pin") return { ok: false, msg: T("pin.wrong") };
      return { ok: false, msg: fallback || T("pin.cantCheck") };
    },
    async _key(k) {
      const c = cur; if (!c || c.kind !== "pin" || c.busy || left(c)) return;
      // (v3.0.3) the key tick — first, the same for every key, before anything depends on which one it was
      if (window.Sound && Sound.pinTick) { try { Sound.pinTick(); } catch {} }
      if (k === "back") c.digits = c.digits.slice(0, -1);
      else if (k === "ok") {
        if (c.digits.length < 4) { c.msg = T("pin.badFormat"); UI.refreshPopup(); return; }
        c.busy = true; c.msg = ""; UI.refreshPopup();
        let r;
        try { r = c.check ? await c.check(c.digits) : { ok: true }; } catch { r = { ok: false, msg: T("pin.cantCheckRetry") }; }
        if (cur !== c) return; // closed meanwhile
        c.busy = false;
        if (r && r.ok) { const pin = c.digits; cur = null; UI.close(); if (c.win) PinPad.remember(pin); c.resolve(pin); return; }
        if (r && r.done) { // e.g. the hub didn't answer: it may still have happened — say so, then close (no retry)
          c.busy = true; c.msg = r.msg; UI.refreshPopup();
          setTimeout(() => { if (cur === c) PinPad._end(null); }, 3500);
          return;
        }
        c.digits = "";
        if (r && r.lockedFor) countdown(c, r.lockedFor);
        else c.msg = (r && r.msg) || T("pin.wrong");
      } else if (/^[0-9]$/.test(k) && c.digits.length < MAX) { c.digits += k; c.msg = ""; }
      UI.refreshPopup();
    },
    _end(v) { const c = cur; if (!c) return; cur = null; UI.close(); c.resolve(v); },
  };

  // ---------- unlock windows (two timers, both set by the admin in Manager → Panels → Safety) ----------
  // Once the panel PIN was accepted it isn't asked again for a while:
  //   general (Settings, Room options, rearranging, doors, the garage, guest mode…): until nobody has touched the
  //            screen for pinGeneralSeconds (default 60; touches restart it). Then every listener hears onLock
  //            (Settings closes) and the PIN is forgotten.
  //   alarm   (arm / disarm, dismissing a level 4–5 alert): pinAlarmSeconds (default 30) from the PIN entry — touches
  //            don't extend it.
  // 0 = that window never relocks (the Manager warns). The PIN only ever lives in this page's memory; the service
  // checks it again for every action.
  let session = null, alarm = null; // { pin, last } / { pin, at }
  const locks = [];
  const secs = (k, d) => { const v = window.Settings && Settings.v ? Settings.v[k] : undefined; return Number.isInteger(v) && v >= 0 && v <= 3600 ? v : d; };
  const generalMs = () => secs("pinGeneralSeconds", 60) * 1000, alarmMs = () => secs("pinAlarmSeconds", 30) * 1000;
  // a touch — or typing on the on-screen keyboard (no pointer events) — keeps the general window open; an expired one stays expired
  const touched = () => { if (PinPad.unlocked()) session.last = Date.now(); };
  for (const ev of ["pointerdown", "keydown", "input"]) addEventListener(ev, touched, true);
  PinPad.remember = (pin) => {
    if (typeof pin !== "string") { session = alarm = null; return; }
    session = { pin, last: Date.now() }; alarm = { pin, at: Date.now() };
  };
  PinPad.unlocked = () => (session && (!generalMs() || Date.now() - session.last < generalMs()) ? session.pin : null);
  PinPad.alarmUnlocked = () => (alarm && (!alarmMs() || Date.now() - alarm.at < alarmMs()) ? alarm.pin : null);
  PinPad.onLock = (fn) => locks.push(fn);
  PinPad.lock = () => {
    if (!session) return;
    session = null;
    if (window.PanelStore && PanelStore.dropPin) PanelStore.dropPin();
    locks.forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
  };
  setInterval(() => {
    if (session && !PinPad.unlocked()) PinPad.lock();
    if (alarm && !PinPad.alarmUnlocked()) alarm = null;
    sync();   // (the screen holding still: never left on once no PIN pad is open)
  }, 1000);
  // its keys, Cancel / Yes (acts.js)
  Acts.add({ "pp.key": (k) => PinPad._key(k), "pp.end": (v) => PinPad._end(v) });
  window.PinPad = PinPad;
})();
