// The Manager's "Open live" (v2.5.0): this panel's real page in a large
// window of the Manager (/<panel>?live=1). The service only serves it to a Manager login that sees this panel and
// sets window.PANEL_LIVE = {mode, by}:
//   control  the admin — the page works as that panel's own: its groups and "may switch" rules apply, PIN-guarded
//            actions ask for the PIN (checked by the service at /api/pin, never sent over MQTT).
//   view     any other login — the service leaves the broker login out of this page; here a stand-in for mqtt.js
//            reads the house's state from the Manager (/api/manage/panels/<id>/live, every few seconds), and every
//            change is refused: taps, the PIN pad, anything the page would save.
// In both: not the panel itself (data.js isPanel: no check-in, LEDs, speech, measurements or benchmark) and silent.
// Loaded right after mqtt.min.js, before data.js. Text is set with textContent only.
(function () {
  const L = window.PANEL_LIVE;
  if (!L || typeof L !== "object") return;
  const VIEW = L.mode !== "control";
  document.documentElement.classList.add("live", VIEW ? "live-view" : "live-control");

  // a short note at the bottom of the screen (the page's own toast look), at most one every few seconds
  let toldAt = 0;
  function note(text) {
    if (Date.now() - toldAt < 3000 || !document.body) return;
    toldAt = Date.now();
    const n = document.createElement("div");
    n.className = "hub-off-toast live-note";
    n.textContent = text;
    document.body.append(n);
    setTimeout(() => n.remove(), 3200);
  }
  const REFUSED = "View only — your account can look at this panel but not change anything here";
  window.PanelLive = { mode: VIEW ? "view" : "control", refuse: () => note(REFUSED) };
  if (!VIEW) return;

  // ---------- nothing this page would change goes out ----------
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const method = String((init && init.method) || (input && typeof input === "object" && input.method) || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD") return realFetch(input, init);
    note(REFUSED);
    return Promise.resolve(new Response(JSON.stringify({ ok: false, error: "view-only" }), { status: 403, headers: { "Content-Type": "application/json" } }));
  };
  // (the PIN pad never opens: there is nothing it could unlock here)
  const wrapPin = () => {
    const P = window.PinPad; if (!P || P.liveWrapped) return;
    P.liveWrapped = true;
    P.ask = async () => { note(REFUSED); return null; };
    const confirm0 = P.confirm.bind(P);
    // (an "are you sure?" before a change: refused; a plain note with only OK — "Not from this panel" — still shows)
    P.confirm = (o = {}) => (o && o.yes === "OK" ? confirm0(o) : (note(REFUSED), Promise.resolve(false)));
  };
  document.addEventListener("DOMContentLoaded", wrapPin);
  window.addEventListener("load", wrapPin);
  // (v2.7.0) Settings never open here — also not by the "no panel PIN set yet … Continue" way in, which asks no PIN:
  // the Continue is refused before the page's own handler (acts.js listens to the bubbling click) sees it
  document.addEventListener("click", (e) => {
    const b = e.target && e.target.closest && e.target.closest('[data-click="set.unlock"]');
    if (!b) return;
    e.stopImmediatePropagation(); e.preventDefault();
    note(REFUSED);
    const x = document.querySelector('[data-click="set.hide"]');
    if (x) x.click();
  }, true);

  // ---------- a stand-in for the broker: the house's state from the Manager, read only ----------
  const pid = String(window.PANEL || "main").toLowerCase();
  const EVERY = 4000, AGAIN = 20000;   // (read every 4 s; the same state handed on again every 20 s: a refused tap's truth)
  function viewClient() {
    const handlers = {}, subs = new Set(), last = new Map(), sentAt = new Map();
    let up = false, stopped = false;
    const emit = (ev, ...a) => (handlers[ev] || []).forEach((f) => { try { f(...a); } catch (e) { console.warn("[live]", e); } });
    const deliver = (topic, text, force) => {
      const same = last.get(topic) === text;
      last.set(topic, text);
      if (!subs.has(topic) || (same && !force && Date.now() - (sentAt.get(topic) || 0) < AGAIN)) return;
      sentAt.set(topic, Date.now());
      emit("message", topic, text);
    };
    async function poll() {
      if (stopped) return;
      try {
        const r = await realFetch(`/api/manage/panels/${encodeURIComponent(pid)}/live`, { cache: "no-store", credentials: "same-origin", headers: { "X-Skypane-Poll": "1" } });  // never keeps the session alive
        if (r.status === 401 || r.status === 403) {   // (signed out of the Manager, or no longer allowed to see this panel)
          stopped = true;
          if (up) { up = false; emit("close"); }
          note("Signed out of the Manager — close this and open the panel live again");
          return;
        }
        const j = r.ok ? await r.json() : null;
        if (j) {
          if (!up) { up = true; emit("connect"); }
          if (typeof j.bridge === "string") deliver("hubitat/bridge/status", j.bridge === "unknown" ? "online" : j.bridge);
          if (j.state && typeof j.state === "object" && Object.keys(j.state).length) deliver("hubitat/state", JSON.stringify(j.state));
          if (j.alerts && typeof j.alerts === "object") deliver("hubitat/alerts", JSON.stringify(j.alerts));
        }
      } catch {
        if (up) { up = false; emit("close"); }
      }
      setTimeout(poll, EVERY);
    }
    setTimeout(poll, 0);
    return {
      on(ev, f) { (handlers[ev] = handlers[ev] || []).push(f); return this; },
      // (like a retained topic: a late subscriber gets what is known at once)
      subscribe(t) {
        for (const x of Array.isArray(t) ? t : [t]) {
          if (subs.has(x)) continue;
          subs.add(x);
          if (last.has(x)) setTimeout(() => deliver(x, last.get(x), true), 0);
        }
        return this;
      },
      publish() { note(REFUSED); return this; },
      end() { stopped = true; return this; },
    };
  }
  window.mqtt = { connect: () => viewClient() };
})();
