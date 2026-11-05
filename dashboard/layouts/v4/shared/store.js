// PanelStore — this panel's saved data (settings, camera views, weather places), kept by the dashboard service
// (service/server.py, docs/dashboard-service.md, sync protocol: docs/dashboard-service-sync.md) and cached in this
// browser so the page starts instantly and still works if the service is down.
//   PanelStore.get(key) / PanelStore.set(key, value, paths?) / PanelStore.onChange(fn(keys))
// Keys: "settings" (Settings.v), "cameraViews" (panel-made camera views), "weatherCustom" (added weather places);
// (v3.0.4) "house" — read only: the house's units, date formats and camera labels, sent with the panel's data (fmt.js).
// paths = the dotted sub-paths that changed (e.g. ["cameras.liveMax"]); none = the whole value changed.
// Start: the local cache is used at once; then the service's copy replaces it (onChange). (v3.0.2: a panel never
// creates itself on the service any more — the Manager makes it and a tablet is paired to it; no built-in "main".)
// Edits not yet on the service ("dirty") are kept in localStorage too, so they survive a reload while offline.
(function () {
  const id = typeof window.PANEL === "string" && window.PANEL ? window.PANEL : "";   // (v3.0.2: no "main" — without a panel, nothing is synced)
  const CACHE = `panelstore.${id}`, DIRTY = `panelstore.${id}.dirty`;
  // the layout builder's canvas (?design=1, design.js): reads this panel's data, never saves or caches anything;
  // override = the builder's unsaved changes on top ({settings: {homeLayout, homeGrid}})
  const DESIGN = window.PANEL_DESIGN === true;
  let override = {};
  // where the data lived before the service (imported once into the cache)
  const OLD = { settings: "panel.settings.v4", cameraViews: "panel.cameras.views", weatherCustom: "panel.weather.custom" };
  const client = Math.random().toString(36).slice(2, 10);
  const api = `/api/panel/${encodeURIComponent(id)}`;
  const listeners = [];
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const json = (v) => JSON.stringify(v);
  const isObj = (o) => o !== null && typeof o === "object";

  let data = parse(ls.get(CACHE));
  if (!isObj(data)) {
    data = {};
    for (const [key, old] of Object.entries(OLD)) { const v = parse(ls.get(old)); if (v != null) data[key] = v; }
  }
  // changed here, not yet on the service: {key: {paths: [sub-paths] | "all", n: edit count}}
  let dirty = parse(ls.get(DIRTY));
  if (!isObj(dirty)) dirty = {};
  const saveCache = () => { if (DESIGN) return; ls.set(CACHE, json(data)); ls.set(DIRTY, json(dirty)); };
  saveCache();

  let rev = 0, synced = false, timer = null, retry = null, busy = false, again = false, blocked = false, warned = false;
  // the panel PIN, once Settings was unlocked with it (memory only, never stored): sent with the changes, for a
  // service that asks for it (403 pin-required / 423)
  let pin = null, releasePin = false;
  let pullRetry = null;   // the one pending "try again in a minute" after a failed pull()
  const tell = (keys) => listeners.forEach((fn) => { try { fn(keys); } catch (e) { console.warn(e); } });

  // the service's value with only this browser's changed sub-paths put back on top ("all": keep the local value)
  function mergeKey(server, local, paths) {
    if (paths === "all" || !isObj(server) || !isObj(local)) return local;
    const out = structuredClone(server);
    for (const p of paths) {
      const ks = p.split("."), last = ks.pop();
      let s = out, l = local;
      for (const k of ks) { l = isObj(l) ? l[k] : undefined; if (!isObj(s[k])) s[k] = {}; s = s[k]; }
      if (isObj(l) && last in l) s[last] = structuredClone(l[last]); else delete s[last];
    }
    return out;
  }

  // take the service's data: keys not changed here are replaced, changed ones merged; listeners hear only real changes
  function take(r, server, house) {
    rev = r; server = server || {};
    const changed = [];
    // ("house" only from a pull that brought it: a save's answer has none, and an older service none at all)
    if (house !== undefined && json(house) !== json(data.house)) { data.house = house; changed.push("house"); }
    for (const k of new Set([...Object.keys(data), ...Object.keys(server)])) {
      if (k === "house") continue;
      const before = json(data[k]);
      const v = dirty[k] ? mergeKey(server[k], data[k], dirty[k].paths) : server[k];
      if (v === undefined) delete data[k]; else data[k] = v;
      if (json(data[k]) !== before) changed.push(k);
    }
    saveCache();
    if (changed.length) tell(changed);
  }

  // network trouble / service busy: one retry timer
  const later = (why) => {
    console.warn("[store] saving to the dashboard service failed, will retry in 30 s:", why);
    if (!retry) retry = setTimeout(() => { retry = null; push(); }, 30000);
  };

  // one PATCH per changed key, each based on the last rev this browser saw
  async function push() {
    timer = null;
    if (busy) { again = true; return; }
    if (!id || !synced || blocked || DESIGN) return;
    busy = true;
    let conflicts = 0, keys = Object.keys(dirty);
    try {
      while (keys.length) {
        const k = keys.shift(), n = dirty[k] ? dirty[k].n : null;
        if (n == null) continue;
        let r, res;
        try {
          r = await fetch(api, { method: "PATCH", headers: { "Content-Type": "application/json" },
            body: json({ data: { [k]: data[k] === undefined ? null : data[k] }, client, baseRev: rev, ...(pin ? { pin } : {}) }) });
          res = await r.json().catch(() => ({}));
        } catch (e) { later(e.message || e); return; }
        if (r.ok) {
          conflicts = 0; // "3 conflicts in a row"
          rev = res.rev || rev;
          if (dirty[k] && dirty[k].n === n) delete dirty[k];   // not edited again while it was on its way
          saveCache();
        } else if (r.status === 404 && res.error === "not-set-up") {
          // the Manager hasn't set this panel up (or removed it): nothing is saved — the edits made here are dropped,
          // nothing more is sent (app.js shows "not set up"; the next pull finds it once it's added)
          notSetUp(); return;
        } else if ((r.status === 403 && res.error === "pin-required") || r.status === 423) {
          // device choices changed without (the right) panel PIN: keep the edit here until Settings is unlocked again
          console.warn("[store] the service wants the panel PIN for this change — open Settings with the PIN to save it");
          blocked = true;
          return;
        } else if (r.status === 409 && res.error !== "conflict") {
          // not created yet, or the service refuses a new panel (too many): keep the edits here, try after the next pull
          blocked = true;
          if (!warned) { warned = true; console.warn(`[store] panel not saved on the service (${res.error || "refused"})`); }
          return;
        } else if (r.status === 409) {
          // someone else saved first: merge onto their copy and try again (3 times, then the 30 s retry)
          if (++conflicts >= 3) { later("conflicts"); return; }
          take(res.rev, res.data);
          keys = Object.keys(dirty);
        } else if (r.status >= 500 || r.status === 408 || r.status === 429) {
          later(`HTTP ${r.status}`); return;
        } else {
          console.warn(`[store] the service refused "${k}" (HTTP ${r.status}${res.error ? ": " + res.error : ""}) — not saved`);
          delete dirty[k]; saveCache();
        }
      }
    } finally {
      busy = false;
      if (again) { again = false; schedule(); }
      else if (releasePin && !Object.keys(dirty).length) { pin = null; releasePin = false; }
    }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(push, 500); };

  // a panel address the Manager hasn't set up: stop saving, forget this browser's unsaved edits (quietly)
  function notSetUp() {
    blocked = true; synced = false;
    if (Object.keys(dirty).length) { dirty = {}; saveCache(); }
    window.PanelStore.notSetUp = true;
  }
  async function pull() {
    if (!id) return;   // (no panel: this browser's copy only)
    try {
      const r = await fetch(api, { cache: "no-store" });
      if (r.status === 404) {
        const e = await r.json().catch(() => ({}));
        if (e && e.error === "not-set-up") {   // (looked at again by the 10-minute pull below, and by app.js every minute)
          notSetUp(); return;
        }
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const res = await r.json();
      if ((res.rev || 0) < rev) return;   // older than what this browser already saw
      synced = true; blocked = false; window.PanelStore.notSetUp = false;
      if (res.exists) take(res.rev, res.data, res.house);   // (v3.0.2: nothing there yet → nothing sent; no self-made panel)
      if (Object.keys(dirty).length) schedule();
    } catch (e) {
      // no service (e.g. the old test web server): keep working from the cache, try again in a minute
      console.warn("[store] dashboard service not reachable — using this browser's copy:", e.message || e);
      // one retry at a time (the 10-minute safety net below would otherwise start a new chain each time it fails)
      if (!pullRetry) pullRetry = setTimeout(() => { pullRetry = null; pull(); }, 60000);
    }
  }

  window.PanelStore = {
    id, client,
    get: (key) => (override[key] && isObj(data[key]) ? { ...data[key], ...override[key] } : override[key] ? { ...override[key] } : data[key]),
    design: DESIGN,
    // (design mode only) the builder's unsaved changes, shown on top of the saved data
    setOverride(key, value, quiet) { if (DESIGN) { override = { ...override, [key]: value }; if (!quiet) tell([key]); } },
    set(key, value, paths) {
      data[key] = value;
      const d = dirty[key], old = d ? d.paths : [];
      dirty[key] = { paths: !paths || old === "all" ? "all" : [...new Set([...old, ...paths])], n: (d ? d.n : 0) + 1 };
      saveCache(); schedule();
    },
    onChange(fn) { listeners.push(fn); },
    setPin(p) { pin = typeof p === "string" ? p : null; releasePin = false; if (pin && blocked) { blocked = false; schedule(); } },
    // Settings closed: forget the PIN once the changes made with it are saved (or at once if nothing is pending)
    dropPin() {
      if (!Object.keys(dirty).length && !busy && !timer) { pin = null; return; }
      releasePin = true;
      setTimeout(() => { if (releasePin) { pin = null; releasePin = false; } }, 120000); // (at most 2 minutes, even offline)
    },
    // another client saved this panel's data (MQTT dashboard/panel/<id>/changed, wired in app.js)
    remoteChanged(msg) { if (!msg || msg.client === client || (msg.rev && msg.rev <= rev)) return; pull(); },
    pull,
  };
  addEventListener("online", () => { if (Object.keys(dirty).length) schedule(); });
  setInterval(pull, 10 * 60000); // safety net: a missed "changed" message never leaves this screen stale for long
  pull();
})();
