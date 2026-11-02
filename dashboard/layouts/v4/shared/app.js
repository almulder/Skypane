// Round-4 panel (the chosen round-3 Layout 1, refined).
// Left = greeting, clock, date, who's home + temps, weather · centre = calendar · right = thermostat, locks,
// doors/windows. Bottom: Alarm · Home · Cameras fixed, rooms scroll sideways. Small gear = settings.
(function () {
  const H = Home, S = Home.state, WX = "glossy";
  window.H = Home; // (Home under its short name: the console, older notes; the generated HTML has no handlers — acts.js)
  const cap = (s) => { s = String(s ?? ""); return s ? s[0].toUpperCase() + s.slice(1) : ""; };
  const App = { view: "home", lastView: null, dragging: false, thermoEdit: false, editTimer: null, sky: null, bg: null };

  // ---------- weather effects ----------
  // Each Open-Meteo weather code has its own effect (Sky.CONDITIONS in sky.js, named like the weather app). Settings →
  // Weather effects: mode (live / random demo / off), pause for a while, switch single ones off, and preview each one.
  let demoTimer = null, demoPick = null;
  const autumn = () => [8, 9, 10].includes(new Date().getMonth());
  // what live weather shows: the code's own effect; windy autumn days with no rain → leaves
  const liveCondition = (now) => (autumn() && now.wind >= 15 && now.code <= 3 ? "leaves" : Sky.condition(now.code) ? now.code : 3);
  // the heaviest effect this panel shows (Sky.load 1..4): effects.maxLoad 1..4 = the owner's choice; 0 / unset = auto,
  // measured on this tablet (below) — starts at 4 and steps down when effects make the screen stutter
  // (only the real panel measures and uses "auto": a laptop viewing the same panel page keeps its own numbers to itself)
  const maxLoad = (e) => (e.maxLoad >= 1 && e.maxLoad <= 4 ? e.maxLoad : (H.isPanel && App.perf.autoCap) || 4);
  App.effectCap = () => maxLoad(Settings.v.effects);
  const enabled = (e, id) => !(e.disabled && e.disabled[id]) && (id === "none" || Sky.load(id) <= maxLoad(e));
  // switched off, or too heavy for this panel: the nearest lighter effect of the same kind (heavy snow → moderate →
  // light; a thunderstorm → heavy rain …) — the roadmap's "weather effect fallback"; none → no effect
  // Strictly lighter only; an icy one prefers another icy one (heavy freezing rain → light freezing rain, not plain
  // rain). Nothing lighter of the kind (e.g. a "Minimal" panel in a storm): the heaviest allowed cloudy sky, not sunshine.
  function fallback(e, id) {
    const c = Sky.condition(id); if (!c || c.cat === "clear") return null;   // (a sky one switched off: a plain sky, as before)
    const kin = { thunder: "rain", drizzle: "rain", rain: "drizzle" }[c.cat], score = Sky.loadScore(c);
    // one list over its own kind and the related one: icy first, then its own kind, then the heaviest
    const rank = (x) => (!!x.ice === !!c.ice ? 2e6 : 0) + (x.cat === c.cat ? 1e6 : 0) + Sky.loadScore(x);
    const near = (cats) => Sky.CONDITIONS.filter((x) => cats.includes(x.cat) && x.id !== id && enabled(e, x.id) && Sky.loadScore(x) < score)
      .sort((a, b) => rank(b) - rank(a) || Sky.CONDITIONS.indexOf(b) - Sky.CONDITIONS.indexOf(a))[0];   // (a tie: overcast before partly cloudy)
    return near(kin ? [c.cat, kin] : [c.cat]) || (c.cat === "extra" ? null : near(["clear"])) || null;
  }
  App.effectsPaused = () => { const e = Settings.v.effects; return !!e.offUntil && Date.now() < e.offUntil; };
  // the place the sky and the live effects follow: the first place of the first weather card (top-left first) on the
  // page shown; else the panel's home place — the first place of its Home weather card (remembered in this browser,
  // so a room page without a weather card keeps the home sky even before Home was drawn); else the panel's own list
  const firstWx = (g) => g && g.cards.filter((c) => c.t === "weather" && Weather.placesOf(c.o && c.o.locs).length).sort((a, b) => a.y - b.y || a.x - b.x)[0];
  const HOMEP = () => `panel.homePlace.${((window.PanelStore && PanelStore.id) || "main").toLowerCase()}`;
  const homePlace = () => {
    const c = firstWx(customGrid());
    if (c) {
      const p = Weather.placesOf(c.o.locs)[0];
      try { if (window.PANEL_DESIGN !== true) localStorage.setItem(HOMEP(), JSON.stringify(p)); } catch {}
      return p;
    }
    let p = null; try { p = JSON.parse(localStorage.getItem(HOMEP()) || "null"); } catch {}
    return p && typeof p.id === "string" && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? Weather.placesOf([p])[0] : null;
  };
  App.skyPlace = () => {
    const g = App.view === "home" ? customGrid() : App.view !== "cameras" && H.rooms().some((r) => r.id === App.view) ? roomGrid(App.view) : null;
    const c = firstWx(g);
    const p = c ? Weather.placesOf(c.o.locs)[0] : homePlace() || Weather.tabs()[0];
    if (p) Weather.need([p]);
    return p;
  };
  App.applyEffects = (force) => {
    if (!App.sky) return;
    const sp = App.skyPlace(), e = Settings.v.effects, d = sp && Weather.get(sp.id, true);   // (the sky's place is always a "Home" — a card's first place or the panel's: the Hubitat weather while it's shown)
    App.skyAt = sp && sp.id;
    App.sky.mode = e.cycle ? "demo" : "real";
    if (d) { App.sky.sunrise = d.sunrise; App.sky.sunset = d.sunset; }
    let want = "none", why;
    if (App.fxTest != null) { want = App.fxTest; why = T("fx.why.test"); }
    else if (e.mode === "off") why = T("fx.why.off");
    else if (App.effectsPaused()) why = T("fx.why.pausedUntil", { time: T.time(new Date(e.offUntil)) });
    else if (e.mode === "demo") {
      const pool = Sky.CONDITIONS.filter((c) => c.id !== "none" && enabled(e, c.id));
      if (force || demoPick == null || !enabled(e, demoPick)) demoPick = pool.length ? pool[Math.floor(Math.random() * pool.length)].id : "none";
      want = demoPick; why = T("fx.why.demo");
    } else if (!d) why = T("fx.why.waiting");
    else {
      const c = liveCondition(d.now);
      if (enabled(e, c)) { want = c; why = T("fx.why.live"); }
      else {
        const f = fallback(e, c), off = e.disabled && e.disabled[c];
        want = f ? f.id : "none";
        why = T(`fx.why.${off ? "switchedOff" : "tooHeavy"}${f ? "Showing" : ""}`, { name: Sky.condition(c).name, other: f ? f.name : "" });
      }
    }
    if (!App.sky.cond || String(App.sky.cond.id) !== String(want)) App.sky.setCondition(want);
    App.sky.wind = e.mode === "demo" && App.fxTest == null ? (App.demoWind ??= Math.round(Math.random() * 25)) : d ? d.now.wind : 8;
    if (force) { // (re)start the 2-minute demo rotation only when an effect was just chosen
      clearInterval(demoTimer); demoTimer = null;
      if (e.mode === "demo") demoTimer = setInterval(() => { App.demoWind = null; App.applyEffects(true); }, 120000);
    }
    const el = document.getElementById("fx-label");
    if (el) el.textContent = T("fx.label", { effect: App.sky.cond.id === "none" ? T("fx.noEffect") : App.sky.cond.name, why });
  };
  App.nextEffect = () => { demoPick = null; App.demoWind = null; App.applyEffects(true); Settings.render(); };

  // ---------- how well this tablet keeps up (no debug mode needed, works on any browser) ----------
  // Every few minutes while an effect runs, count the frames for 5 s: frames per second per load level (smoothed).
  // "Auto" (effects.maxLoad unset / 0): a level below 24 fps three times in a row caps this panel one level lower
  // (autoCap); a day later it tries one level higher again. (The kitchen panel draws 58 fps with nothing running.)
  // A sample with a gap of over half a second (the screen went off, the page was busy loading) is thrown away.
  // Measured only on the real panel (H.isPanel), on the Home page, with nothing else busy (live cameras, Music,
  // Settings, the screensaver) and not in the first 1½ minutes after loading, so the number is the effect's own cost.
  // Saved to the dashboard service as this panel's "perf" — one entry per device ({device key: numbers}, the newest
  // 4), so a phone opening the same panel page can't change the tablet's limit — when the limit changes, else at most
  // every 6 hours. The Manager shows them.
  const LEVELS = [1, 2, 3, 4], LOW_FPS = 24, LOWS = 3;
  const DEV = (() => { try { let k = localStorage.getItem("panel.devkey"); if (!/^[a-z0-9]{8}$/.test(k || "")) { k = Math.random().toString(36).slice(2, 10).padEnd(8, "0"); localStorage.setItem("panel.devkey", k); } return k; } catch { return "nostore0"; } })();
  const cleanPerf = (p) => {   // (the stored copy comes from the service: only numbers are kept)
    p = p && typeof p === "object" ? p : {};
    const fps = {}, f = p.fps && typeof p.fps === "object" ? p.fps : {};
    for (const l of LEVELS) if (typeof f[l] === "number" && Number.isFinite(f[l]) && f[l] >= 0 && f[l] < 1000) fps[l] = Math.round(f[l]);
    return { fps, low: {}, autoCap: LEVELS.includes(p.autoCap) ? p.autoCap : 0, capAt: Number.isFinite(p.capAt) ? p.capAt : 0,
      screen: "", ua: "", at: Number.isFinite(p.at) ? p.at : 0, vw: Number.isFinite(p.vw) ? p.vw : 0, vh: Number.isFinite(p.vh) ? p.vh : 0, ...(p.test && typeof p.test === "object" ? { test: p.test } : {}),
      ...(p.bench && typeof p.bench === "object" ? { bench: p.bench } : {}), ...(p.benchFail && typeof p.benchFail === "object" ? { benchFail: p.benchFail } : {}) };

  };
  const mine = () => { const all = window.PanelStore && PanelStore.get("perf"); return all && typeof all === "object" ? all[DEV] : null; };
  App.perf = cleanPerf(mine());
  if (window.PanelStore) PanelStore.onChange((keys) => {   // the service's copy (e.g. after the browser data was cleared)
    if (!keys.includes("perf")) return;
    const cap = App.perf.autoCap, got = cleanPerf(mine());
    if ((got.at || 0) <= (App.perf.at || 0) && got.capAt <= (App.perf.capAt || 0)) return;   // (not newer than what's here)
    App.perf = got;
    if (App.perf.autoCap !== cap) App.applyEffects();
  });
  let perfSaved = Date.now();
  const savePerf = () => {
    perfSaved = Date.now();
    if (!window.PanelStore) return;
    App.perf.vw = innerWidth; App.perf.vh = innerHeight;   // (the page's size: the layout builder designs for it)
    const { low, ...keep } = App.perf;   // ("in a row" only counts within one page load)
    const all = PanelStore.get("perf"), out = { [DEV]: { ...keep, fps: { ...keep.fps } } };
    const others = all && typeof all === "object" && !Array.isArray(all) ? Object.entries(all).filter(([k]) => k !== DEV) : [];
    // the other devices' entries: the 3 newest stay; only this device's entry (and the dropped ones) are sent as
    // changed paths, so two devices saving at once don't overwrite each other (store.js mergeKey)
    const keepOthers = others.filter(([k, v]) => /^[a-z0-9]{8}$/.test(k) && v && typeof v === "object")
      .sort((a, b) => (+b[1].at || 0) - (+a[1].at || 0)).slice(0, 3);
    keepOthers.forEach(([k, v]) => { out[k] = v; });
    const dropped = others.map(([k]) => k).filter((k) => !(k in out) && /^[A-Za-z0-9_-]{1,40}$/.test(k));
    PanelStore.set("perf", out, all && typeof all === "object" && !Array.isArray(all) ? [DEV, ...dropped] : undefined);
  };
  // the full benchmark's result (bench.js), kept with this device's numbers
  App.saveBench = (b) => {
    if (!H.isPanel) return;
    App.perf.bench = b; delete App.perf.benchFail;
    App.perf.screen = `${screen.width}×${screen.height} @${devicePixelRatio}`; App.perf.ua = navigator.userAgent.slice(0, 160); App.perf.at = Date.now();
    savePerf();
  };
  // the page's size, reported once it's settled (and again after a change, e.g. turned to portrait): the layout
  // builder starts with this panel's real screen
  if (H.isPanel) setTimeout(() => { if (App.perf.vw !== innerWidth || App.perf.vh !== innerHeight) { App.perf.at = App.perf.at || Date.now(); savePerf(); } }, 20000);
  // FreeKiosk's screensaver off (MQTT set/wake, like a touch) — the tests keep the screen awake with it
  App.wakeKiosk = () => { if (H.isPanel) H.publish(`freekiosk/${H.kiosk()}/set/wake`, "PRESS"); };
  // a benchmark that was interrupted: nothing of it is kept, only when / how far / why (the Manager asks for a new run)
  App.saveBenchFail = (f) => { if (!H.isPanel) return; App.perf.benchFail = f; App.perf.at = Date.now(); savePerf(); };
  App.resetPerf = () => { if (!H.isPanel) return; App.perf = { ...App.perf, fps: {}, low: {}, autoCap: 0, capAt: 0 }; savePerf(); App.applyEffects(); };
  App.perfText = () => {
    const P = App.perf, L = window.Sky ? Sky.LOAD_NAMES : ["", "Minimal", "Light", "Medium", "Heavy"], lv = LEVELS.filter((l) => l in P.fps);
    if (!H.isPanel) return T("perf.onlyPanel");
    return [lv.length ? T("perf.measured", { list: lv.map((l) => T("perf.fps", { level: L[l], fps: P.fps[l] })).join(" · ") }) : T("perf.notYet"), P.autoCap ? T("perf.autoLimit", { level: L[P.autoCap] }) : ""].filter(Boolean).join(" ");
  };
  const loadedAt = Date.now();
  const busy = () => document.hidden || !App.sky || App.sky.paused || App.sky.hold || App.sky.camHold || App.view !== "home"
    || Settings.open || !!document.querySelector(".cam-full, .popup-host.show");
  function measureFps() {
    const c = App.sky && App.sky.cond, P = App.perf;   // (the sample itself works on App.perf as it is at its end)
    if (!H.isPanel || !c || c.id === "none" || App.fxTest != null || busy() || Date.now() - loadedAt < 90000) return;
    if (P.autoCap && P.autoCap < 4 && Date.now() - (P.capAt || 0) > 86400000 && !(Settings.v.effects.maxLoad >= 1)) {
      P.autoCap++; P.capAt = Date.now(); savePerf(); App.applyEffects();   // a day later: one level higher again
      return;
    }
    const lvl = Sky.load(c), t0 = performance.now();
    let n = 0, last = t0;
    const tick = () => {
      const t = performance.now();
      if (t - last > 500 || busy() || !App.sky.cond || App.sky.cond.id !== c.id) return;   // (interrupted: don't count it)
      last = t; n++;
      if (t - t0 < 5000) return requestAnimationFrame(tick);
      const P = App.perf, fps = Math.round((n * 1000) / (t - t0)), prev = P.fps[lvl];
      P.fps[lvl] = prev ? Math.round(prev * 0.6 + fps * 0.4) : fps;
      P.low[lvl] = fps < LOW_FPS ? (P.low[lvl] || 0) + 1 : 0;
      P.screen = `${screen.width}×${screen.height} @${devicePixelRatio}`; P.ua = navigator.userAgent.slice(0, 160); P.at = Date.now();
      if (!(Settings.v.effects.maxLoad >= 1) && P.low[lvl] >= LOWS && lvl > 1 && (!P.autoCap || P.autoCap >= lvl)) {
        P.autoCap = lvl - 1; P.capAt = Date.now(); P.low[lvl] = 0;
        console.warn(`[perf] ${Sky.LOAD_NAMES[lvl]} effects make this panel stutter (${fps} fps): effects up to ${Sky.LOAD_NAMES[lvl - 1]} from now on`);
        savePerf(); App.applyEffects();
      } else if (Date.now() - perfSaved > 6 * 3600000) savePerf();
    };
    requestAnimationFrame(tick);
  }
  setInterval(measureFps, 180000);
  // Settings → Weather effects: show one condition now (in front of the settings window), until the tab is left
  // (ends by itself after 2 minutes, e.g. when Settings is left open on that tab)
  let previewTimer = null;
  App.previewEffect = (id) => {
    App.fxTest = App.fxTest != null && String(App.fxTest) === String(id) ? null : id;
    clearTimeout(previewTimer); if (App.fxTest != null) previewTimer = setTimeout(() => { App.endPreview(); Settings.render(); }, 120000);
    App.syncSky(); App.applyEffects(false);
  };
  App.endPreview = () => { clearTimeout(previewTimer); if (App.fxTest == null) return; App.fxTest = null; App.syncSky(); App.applyEffects(false); };

  // ---------- the performance test (Manager → Panels → Weather effects → "Test this panel now") ----------
  // The Manager asks over MQTT (dashboard/panel/<id>/perftest). Only the real panel (H.isPanel) runs it: Home, a note on
  // screen ("about a minute — don't touch"), the heaviest effect of each load level for 6 s each (in front, frames
  // counted), then — if there are cameras — one camera full screen and a camera view (up to 4) for 8 s each (frames
  // counted + the videos' dropped frames). It shows what it recommends (the heaviest smooth level, the effects to switch
  // off, how many live cameras) and saves the result with this device's numbers (App.perf.test → the Manager).
  // A touch doesn't stop it (children; FreeKiosk's wake acts like a tap): the Manager's Stop does (bench.js).
  const GOOD_FPS = 30;
  const heaviestOf = (lvl) => Sky.CONDITIONS.filter((c) => c.id !== "none" && Sky.load(c) === lvl).sort((a, b) => Sky.loadScore(b) - Sky.loadScore(a))[0];
  const countFrames = (ms, videos) => new Promise((resolve) => {
    const q0 = videos().map((v) => (v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null));
    const t0 = performance.now(); let n = 0, worst = 0, last = t0, done = false;
    // (no frames at all — the screen is off, the page hidden: it ends anyway, with what it counted)
    const guard = setTimeout(() => { if (!done) { done = true; App.perfTestGone = true; resolve({ hidden: true }); } }, ms + 3000);
    const tick = () => {
      if (done) return;
      const t = performance.now(); worst = Math.max(worst, t - last); last = t; n++;
      if (t - t0 < ms && !App.perfTestStop) return requestAnimationFrame(tick);
      done = true; clearTimeout(guard);

      const vs = videos(), q1 = vs.map((v) => (v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null));
      let tot = 0, drop = 0;
      q1.forEach((q, i) => { const a = q0[i]; if (q && a) { tot += q.totalVideoFrames - a.totalVideoFrames; drop += q.droppedVideoFrames - a.droppedVideoFrames; } });
      resolve({ fps: Math.round((n * 1000) / (t - t0)), worst: Math.round(worst), dropped: tot > 0 ? Math.round((100 * drop) / tot) : null, videos: vs.length });
    };
    requestAnimationFrame(tick);
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  App.perfTest = async () => {
    // (never over something that matters right now: the alarm keypad, an alert, Settings, a camera full screen — e.g. the
    // doorbell; not with the screen off or the screensaver up: nothing would be drawn)
    if (!H.isPanel) return;
    const why = window.Bench ? Bench.blocked() : "";
    if (why) { console.warn("[perf] not started:", why); if (!document.hidden) Bench.refused(T("bn.thePerfTest"), why); return; }
    App.perfTesting = true; App.perfTestStop = false; App.perfTestGone = false;
    Bench.awake(true);
    App.endPreview();
    document.querySelectorAll(".perf-note").forEach((n) => n.remove());
    const note = document.createElement("div");
    note.className = "perf-note";
    note.innerHTML = `<b>${UI.esc(T("perf.testTitle"))}</b><span>${UI.esc(T("perf.testMinute"))}</span><i></i>`;
    const say = (t) => { const i = note.querySelector("i"); if (i) i.textContent = t; };
    document.body.append(note);

    const out = { at: Date.now(), fx: {}, cams: [] };
    // (the test's own camera full screen only: a doorbell pop-up meanwhile ends the test instead of being closed)
    let mine = null;
    const openFull = (target) => { Cameras.full(target, 30, { sound: false }); mine = document.querySelector(".cam-full"); };
    const closeMine = () => { const f = document.querySelector(".cam-full"); if (f && f === mine) Cameras.closeFull(); else if (f) App.perfTestStop = true; mine = null; };
    const measure = async (ms, vids) => { const r = await countFrames(ms, vids); return r.hidden ? null : r; };
    try {
      if (window.UI && UI.close) UI.close();
      App.go("home");
      await sleep(1500);
      for (const lvl of LEVELS) {
        const c = heaviestOf(lvl); if (!c || App.perfTestStop) continue;
        say(T("perf.step", { level: Sky.LOAD_NAMES[lvl], name: c.name }));
        App.fxTest = c.id; App.syncSky(); App.applyEffects(false);
        await sleep(1500);   // (let it fill the screen)
        const r = await measure(6000, () => []);
        if (!r) break;   // (the screen went dark: no number rather than a wrong one)
        out.fx[lvl] = r.fps;
      }
      App.fxTest = null; App.syncSky(); App.applyEffects(false);
      const cams = window.Cameras && Cameras.go2rtc ? (Cameras.list || []).filter((c) => c.online !== false && c.video !== false) : [];
      if (cams.length && !App.perfTestStop && !App.perfTestGone) {
        const vids = () => [...document.querySelectorAll(".cam-full video")];
        say(T("perf.oneCamFull", { name: cams[0].name }));
        openFull(cams[0].id);
        await sleep(4000);   // (connecting)
        const one = !App.perfTestStop && await measure(8000, vids);
        if (one && one.videos) out.cams.push({ n: 1, ...one });
        closeMine();
        // a view with live tiles (cameras that exist; above the panel's live limit the rest are stills)
        const live = (v) => (v.slots || (v.cams || []).map((id) => ({ cameras: [id] }))).filter((sl) => (sl.cameras || []).some((id) => Cameras.cam(id))).length;
        const view = (Cameras.views || []).map((v) => [v, live(v)]).filter(([, n]) => n >= 2)
          .sort((a, b) => Math.abs(a[1] - 4) - Math.abs(b[1] - 4))[0];
        if (view && !App.perfTestStop && !App.perfTestGone) {
          say(T("perf.camView", { name: view[0].name }));
          openFull(view[0].id);
          await sleep(5000);
          const r = !App.perfTestStop && await measure(8000, vids);
          if (r && r.videos) out.cams.push({ n: r.videos, view: String(view[0].name).slice(0, 40), ...r });
          closeMine();
        }
      }
    } catch (e) {
      console.warn("[perf] test failed:", e);
      out.failed = true;
    } finally {
      App.fxTest = null; App.syncSky(); App.applyEffects(false);
      closeMine();
      App.perfTesting = false;
      Bench.awake(false);
    }
    // what it recommends: the heaviest level that stays smooth, the effects above it, the live cameras
    // (advice only from a complete run: a stopped / interrupted one could only say "Minimal")
    const lv = LEVELS.filter((l) => out.fx[l] != null);
    if (App.perfTestStop || App.perfTestGone || out.failed) out.stopped = true;
    out.best = out.stopped || lv.length < LEVELS.length ? 0 : lv.filter((l) => out.fx[l] >= GOOD_FPS).pop() || 1;
    App.perf.test = out;
    App.perf.screen = `${screen.width}×${screen.height} @${devicePixelRatio}`; App.perf.ua = navigator.userAgent.slice(0, 160); App.perf.at = Date.now();
    savePerf();
    const off = Sky.CONDITIONS.filter((c) => c.id !== "none" && Sky.load(c) > out.best).map((c) => c.name);
    const camTxt = out.cams.map((c) => { const t = T(c.dropped != null ? "perf.camsDropped" : "perf.cams", { n: c.n, fps: c.fps, dropped: c.dropped }); return c.fps < 24 || c.dropped > 15 ? T("perf.tooMuch", { text: t }) : t; });
    if (!document.body.contains(note)) document.body.append(note);
    const advice = [out.best ? T("perf.recommended", { level: Sky.LOAD_NAMES[out.best] }) : "",
      !out.best ? "" : off.length && out.best < 4 ? (off.length > 8 ? T("perf.switchOffMore", { list: T.list(off.slice(0, 8)), n: off.length - 8 }) : T("perf.switchOff", { list: T.list(off) })) : T("perf.allSmooth")].filter(Boolean).join(" ");
    note.innerHTML = `<b>${UI.esc(T(out.stopped ? "perf.stopped" : "perf.done"))}</b>
      <span>${UI.esc(lv.map((l) => T("perf.fps", { level: Sky.LOAD_NAMES[l], fps: out.fx[l] })).join(" · "))}</span>
      <span>${UI.esc(advice)}</span>
      ${camTxt.length ? `<span>${UI.esc(camTxt.join(" · "))}</span>` : ""}
      <span>${UI.esc(T("perf.numbersInManager"))}</span>`;
    note.classList.add("done");
    note.addEventListener("click", () => note.remove());
    setTimeout(() => note.remove(), 60000);
  };

  // ---------- look (theme, background, clock) ----------
  App.lookChanged = (look, theme) => {
    // the sky: the theme's colours or realistic ones. "on" animated, "still" redrawn once a minute (day / night still
    // change), "off" no sky at all (the owner's picture fills the screen; a built-in background gets a plain dark top)
    if (App.sky) {
      if (look.skyColors === "real") App.sky.pal = Sky.REAL; else if (theme) App.sky.setPalette(theme.sky);
      App.sky.noSky = look.sky === "off";
      App.sky.skyFps = look.sky === "still" ? 1 / 60 : 12;
    }
    document.documentElement.classList.toggle("no-sky", look.sky === "off");
    const land = document.getElementById("land");
    if (land && App.bg !== look.background) {
      App.bg = look.background;
      land.innerHTML = window.renderBackground ? renderBackground(look.background) : `<img src="shared/mountains.svg" alt="">`;
    }
    App.render();
  };
  // path "all" = the whole settings object was replaced (the dashboard service's copy, or another screen saved)
  App.settingsChanged = (path) => {
    if (path === "all" || path.startsWith("effects")) App.applyEffects(path === "effects.mode");
    if (window.Cameras) Cameras.go2rtc = Settings.go2rtc();
    if (path === "all" || path.startsWith("cameras")) App.camsDirty = true; // live/still limits changed → rebuild the camera grid
    App.render();
  };

  // ---------- pieces ----------
  function clockBlock() {
    const l = Settings.v.look;
    const clock = window.renderClock ? renderClock({ style: l.clockStyle, fontId: l.clockFont, scale: l.clockScale })
      : `<div class="bigclock num">${H.time()}<small>${H.ampm()}</small></div>`;
    return `<div class="clockbox"><div class="greet">${UI.esc(H.greetingFor(H.people().map((p) => p.name)))}</div>${clock}<div class="date">${UI.esc(H.date())}</div></div>`;
  }

  // (o = a custom grid card's options: o.ids = only these people / locks, o.show = which half — grid.js)
  const pick = (list, o) => (o && Array.isArray(o.ids) && o.ids.length ? list.filter((x) => o.ids.includes(x.id)) : list);
  const pills = (o) => {
    const ppl = pick(H.people(), o);
    return `<div class="pills">
      <div class="pill glass faces">${ppl.map((p) => UI.face(p, 44)).join("")}<div class="k">${UI.esc(!ppl.length ? T("people.nonePicked") : ppl.every((p) => p.home) ? T("people.everyoneHome") : T("people.someAway", { names: T.list(ppl.filter((p) => !p.home).map((p) => p.name)) }))}</div></div>
      </div>`;
  };
  // inside / outside temperatures: a row under the thermostat. A grid card may pick its own sensors
  // (builder: o.inside / o.outside = a device id, or "none"); else the panel's inside one and the house's outside one
  const deg = (v) => (v == null || isNaN(v) ? "—" : Math.round(v));
  const temps = (o) => {
    o = o || {};
    const esc = (x) => (UI.esc ? UI.esc(x) : String(x));
    const pill = (ic, v, k) => `<div class="pill glass">${icon(ic, 22)}<div><div class="v num">${deg(v)}${deg(v) === "—" ? "" : "<sup>°F</sup>"}</div><div class="k">${k}</div></div></div>`;
    const own = (id) => Number.isInteger(id) && id > 0;
    const inside = o.inside === "none" || o.show === "outside" ? ""
      : own(o.inside) ? pill("home", H.tempOf(o.inside), esc(T("temp.insideOf", { name: H.devName(o.inside) || H.fullName(o.inside) || T("temp.sensor") })))
      : pill("home", H.insideTemp(), `${esc(T("temp.inside"))} ${H.inside().live ? `<span class="live">${esc(T("temp.live"))}</span>` : ""}`);
    const outside = o.outside === "none" || o.show === "inside" ? ""
      : own(o.outside) ? pill("sun", H.tempOf(o.outside), esc(T("temp.outsideOf", { name: H.devName(o.outside) || H.fullName(o.outside) || T("temp.sensor") })))
      : S.outside.none ? "" : pill("sun", S.outside.temp, esc(S.outside.name ? T("temp.outsideOf", { name: S.outside.name }) : T("temp.outside")));
    return `<div class="twin temps">
      ${inside}
      ${outside}</div>`;
  };

  function weather(solo, o, key) {
    // a grid card shows only its own places (builder → Places → + Location), with its own tabs; none: the panel's own
    // weather, as the built-in layouts show it (a starting layout's card is never empty)
    const cw0 = o ? { key, ...Weather.forCard(key, o.locs) } : null, cw = cw0 && cw0.places.length ? cw0 : null;
    const d0 = cw ? cw.data : Weather.current(), cls = `card glass wx${solo ? " solo" : ""}`;
    // (a custom grid card may list fewer days, or none: o.days)
    const d = d0 && o && o.days != null ? { ...d0, days: d0.days.slice(0, o.days) } : d0;
    // (no place yet — a new install has none built in: one button to add the first)
    if (!d && !cw && !Weather.tabs().length) return `<section class="${cls}"><span class="label">${UI.esc(T("wx.title"))}</span><div class="loc"><button class="loc-t add"${Acts.on("ui.addPlace")}>${icon("plus", 16)} ${UI.esc(T("wx.addFirst"))}</button></div></section>`;
    if (!d) return `<section class="${cls}"><span class="label">${UI.esc(T("wx.title"))}</span>${UI.locTabs(cw)}<div class="muted">${UI.esc(Weather.error || T("common.loading"))}</div></section>`;
    const n = d.now, u = Weather.units ? Weather.units() : { temp: "F", wind: "mph" }, num = (v) => (v == null ? "—" : v);
    const ribbon = window.HubAlerts && HubAlerts.weatherRibbon ? HubAlerts.weatherRibbon() : "";
    const src = `<div class="wx-src${d.stale ? " stale" : ""}">${UI.esc(d.stale ? T("wx.staleSince", { time: d.updated && Date.now() - d.updated < 864e5 && new Date().toDateString() === d.updated.toDateString() ? T.time(d.updated) : T.dateTime(d.updated) })
      : T(d.source === "hubitat" ? "wx.fromHubitat" : "wx.fromOpenMeteo"))}</div>`;
    return `<section class="${cls}"><div class="card-head"><span class="label">${UI.esc(T("wx.title"))}</span>${UI.locTabs(cw)}${ribbon}</div>
      <div class="wx-now">${wxIcon(n.kind, 104, WX, !n.isDay)}<div><div class="t num">${num(n.temp)}<sup>°${u.temp}</sup></div><div class="muted">${UI.esc(n.text)}</div>${src}</div>
        <div class="wx-meta">${UI.esc(T("wx.feels", { t: num(n.feels) }))}<br>${UI.esc(T("wx.humidity", { n: num(n.humidity) }))}<br>${UI.esc(T("wx.windUnit", { n: num(n.wind), unit: u.wind }))}</div></div>
      <div class="wx-days">${d.days.map((x, i) => `<div class="wx-day ${i ? "" : "today"}"><span class="d">${UI.esc(x.day)}</span>${wxIcon(x.kind, 56, WX)}
        <div class="hl"><b class="num">${num(x.high)}°</b><span class="num">${num(x.low)}°</span></div><span class="rain">${UI.esc(T("wx.rain", { n: x.rain ?? 0 }))}</span></div>`).join("")}</div></section>`;
  }

  // the thermostat's mode buttons (and its fan's, when the card shows them): a grid card shows only the modes the
  // owner ticked (builder: o.modes / o.fans, from the device's own); else Heat / Cool / Fan / Off as always.
  // (only known words reach the page: the names below)
  const T_MODES = { heat: "thermo.mode.heat", cool: "thermo.mode.cool", auto: "thermo.mode.auto", fan: "thermo.mode.fan", off: "thermo.mode.off", "emergency heat": "thermo.mode.emergencyHeat" };
  const T_FANS = { auto: "thermo.fan.auto", on: "thermo.fan.on", circulate: "thermo.fan.circulate" };
  // the mode in plain words (grid.js arc / compact / big looks): its own mode when known ("Auto"), else the dial's
  App.tWord = (t) => T(T_MODES[t.tmode] || T_MODES[t.mode] || "thermo.mode.off");
  App.tModes = (t, o, cls) => {
    o = o || {};
    const id = Number.isInteger(o.id) && o.id > 0 ? o.id : "null";
    // ("Fan" = off with the fan on: not for a thermostat whose fan has no "on" mode — data.js Home.fanOn)
    // (not ticked in the builder: Heat, Cool, Fan, Off as always — and Auto where the thermostat has it, so a thermostat
    // in Auto lights a button)
    const auto = t.tmode === "auto" || /auto/.test(String(H.reading(t.id, "supportedThermostatModes") || ""));
    const list = (Array.isArray(o.modes) ? o.modes : ["heat", "cool", ...(auto ? ["auto"] : []), "fan", "off"]).filter((m) => Object.hasOwn(T_MODES, m) && (m !== "fan" || H.fanOn(t.id)));
    // (lit by the thermostat's own mode when it's known: "auto" lights Auto — or nothing, without an Auto button)
    // (emergency heat without its own button: Heat)
    const lit = (m) => (m === "fan" ? t.mode === "fan" : t.tmode == null ? t.mode === m
      : t.tmode === "emergency heat" && m === "heat" && !list.includes("emergency heat") ? true
      : t.tmode === m && (m !== "off" || t.mode !== "fan" || !list.includes("fan")));
    const fans = (Array.isArray(o.fans) ? o.fans : []).filter((m) => Object.hasOwn(T_FANS, m));
    return (list.length ? `<div class="${cls}">${list.map((m) => `<button class="${lit(m) ? `cur ${m === "emergency heat" ? "heat" : m}` : ""}"${Acts.on("app.mode", m, id)}>${UI.esc(T(T_MODES[m]))}</button>`).join("")}</div>` : "")
      + (fans.length ? `<div class="${cls} fans">${fans.map((m) => `<button class="${t.fan === m ? "cur fan" : ""}"${Acts.on("app.fan", m, id)}>${UI.esc(T(T_FANS[m]))}</button>`).join("")}</div>` : "");
  };
  // the dial: the house thermostat, or (a grid card) the one picked for it
  function thermostat(o) {
    // (H.thermo: with tmode / fan, so Auto / Emergency heat / the fan buttons light for the house thermostat too)
    const t = H.thermo(o && Number.isInteger(o.id) ? o.id : null);
    if (t.id == null) return ""; // no thermostat in this house (the part stays, empty, so the Home parts keep their places)
    const tgt = nestTarget(t), id = o && Number.isInteger(o.id) ? o.id : "null";
    // (the dial takes the card's room — theme.css .nest: a short card puts the buttons beside it)
    return `<section class="card glass nest"><div class="card-head" style="width:100%"><span class="label">${UI.esc(T("thermo.title"))}</span><span class="muted">${UI.esc ? UI.esc(t.room) : t.room}</span></div>
      <div class="nest-in"><div class="nest-dial" data-nest data-tid="${+t.id}"><div class="face">${nestFace(t)}</div>
        ${App.thermoEdit === t.id && tgt ? `<button class="nest-adj up"${Acts.on("app.bump", 1, id)} aria-label="${UI.esc(T("thermo.warmer"))}">${icon("chevron", 30)}</button><button class="nest-adj down"${Acts.on("app.bump", -1, id)} aria-label="${UI.esc(T("thermo.cooler"))}">${icon("chevron", 30)}</button>` : ""}</div>
      <div class="nest-ctl"><div class="nest-hint">${UI.esc(T(tgt ? "thermo.hint" : t.mode === "fan" ? (t.fan === "circulate" ? "thermo.circulating" : "thermo.fanOn") : "thermo.off"))}</div>
      ${App.tModes(t, o, "modes")}</div></div></section>`;
  }

  // a room page's thermostat row (roomlayoutG.js): its dial in a pop-up — the same dial, live, as on Home
  App.thermoPopup = (id) => UI.popup(() => ({ title: T("thermo.title"), body: thermostat(Number.isInteger(id) && id !== S.thermostat.id ? { id } : null) }));

  function locks(o) {
    const list = pick(S.locks, o), unlocked = list.filter((l) => l.lock !== "locked");
    return `<section class="card glass locks"><div class="card-head"><span class="label">${UI.esc(T("locks.title"))}</span>
      ${unlocked.length ? `<button class="chip bad"${Acts.on("app.lockAll", list === S.locks ? null : unlocked.map((l) => +l.id))}>${icon("lock", 16)}${UI.esc(T("locks.lockAll"))}</button>` : `<span class="chip ok">${icon("shield", 16)}${UI.esc(T("locks.allLocked"))}</span>`}</div>
      <div class="lock-list">${list.map((l) => {
        // the hub may not know (e.g. a bolt that didn't fully throw): red, "Unknown", and the whole row is a tap that
        // tries to lock it (then asks it to report if it stays quiet — data.js tryKnown)
        const st = l.lock === "locked" || l.lock === "unlocked" ? l.lock : "unknown";
        if (st === "unknown") return `<div class="lockrow unknown" role="button"${Acts.on("app.lock", l.id)}>${icon("unlock", 22)}<span class="n">${UI.esc(l.name)}</span><span class="state">${UI.esc(T("locks.unknownTap"))}</span></div>`;
        return `<div class="lockrow ${st}">${icon(st === "locked" ? "lock" : "unlock", 22)}<span class="n">${UI.esc(l.name)}</span>
        ${st === "locked" ? (H.canUnlock && H.canUnlock(l.id) ? `<span class="state">${UI.esc(T("state.locked"))}</span><button class="ghost"${Acts.on("app.unlock", l.id)}>${UI.esc(T("locks.unlock"))}</button>` : `<span class="state">${UI.esc(T("state.locked"))}</span>`)
          : `<button${Acts.on("app.lock", l.id)}>${UI.esc(T("locks.lock"))}</button>`}</div>`;

      }).join("")}</div></section>`;
  }

  function openings(o) {
    const ow = H.openWindows(), od = H.openDoors("outside"), show = (o && o.show) || "both";
    return `<div class="twin">
      ${show === "doors" ? "" : `<button class="card glass status ${ow.length ? "warn" : ""}"${Acts.on("app.windowsPopup")}><div class="big">${icon(ow.length ? "windowOpen" : "window", 26)}</div>
        <div><div class="t">${UI.esc(ow.length ? T("win.open", { n: ow.length }) : T("win.closedShort"))}</div><div class="s">${UI.esc(T("win.tapList"))}</div></div></button>`}
      ${show === "windows" ? "" : `<button class="card glass status ${od.length ? "warn" : ""}"${Acts.on("app.doorsPopup")}><div class="big">${icon(od.length ? "doorOpen" : "door", 26)}</div>
        <div><div class="t">${UI.esc(od.length ? T("doors.open", { n: od.length }) : T("doors.closedShort"))}</div><div class="s">${UI.esc(T("doors.tapAll"))}</div></div></button>`}</div>`;
  }

  // Home = three columns of parts. Each part sits in a fixed <div class="part"> (display: contents), so a re-render
  // replaces only the parts whose HTML changed (the clock every minute, a lock, a temperature…) instead of the whole
  // screen. The guest Wi-Fi card steps aside while a Hubitat alert line (level 2–3) needs the room in the left column.
  // Home layouts (Manager → Panels → Look & layout, per panel): which part sits in which column.
  // "classic" is the original built-in layout (never changed); the others rearrange the same parts. The drag-and-
  // drop card builder (a later release) will make these editable.
  const HOME_LAYOUTS = {
    classic: [["left", ["clock", "banner", "people", "weather", "guest"]], ["center", ["calendar"]], ["right", ["thermostat", "temps", "locks", "openings"]]],
    agenda: [["left", ["calendar"]], ["center", ["clock", "banner", "people", "weather", "guest"]], ["right", ["thermostat", "temps", "locks", "openings"]]],
    duo: [["left", ["clock", "banner", "people", "weather", "guest"]], ["right", ["calendar", "temps", "locks", "openings"]]],
    security: [["left", ["clock", "banner", "people", "locks", "openings"]], ["center", ["calendar"]], ["right", ["weather", "guest", "thermostat", "temps"]]],
    minimal: [["center", ["clock", "banner", "weather", "guest"]]],
  };
  App.HOME_LAYOUTS = HOME_LAYOUTS;
  // "custom" = the owner's own grid of cards (the layout builder: grid.js); without a usable grid → Classic
  const customGrid = () => (Settings.v.homeLayout === "custom" && window.Grid && Grid.valid(Settings.v.homeGrid) ? Settings.v.homeGrid : null);
  const homeLayout = () => (customGrid() ? "custom" : Object.hasOwn(HOME_LAYOUTS, Settings.v.homeLayout) ? Settings.v.homeLayout : "classic");
  const homeParts = () => {
    const banner = Alarm.banner(), lay = HOME_LAYOUTS[homeLayout()];
    const used = new Set(lay.flatMap(([, ps]) => ps));
    const guest = window.GuestWifi && !banner && used.has("guest") ? GuestWifi.card() : "";
    const P = { clock: clockBlock, banner: () => banner, people: pills, weather: () => weather(!guest), guest: () => guest,
      calendar: () => `<section class="card glass cal">${UI.calendar(3)}</section>`, thermostat, temps, locks, openings };
    return lay.map(([col, parts]) => [col, parts.map((k) => P[k]())]);
  };
  // the pieces a custom grid's cards can show (grid.js; o = the card's own options)
  const gridParts = () => {
    const banner = Alarm.banner();
    return { clock: clockBlock, alerts: () => banner, people: pills, weather: (o, c) => weather(true, o, `${Grid.room ? Grid.room.id : "home"}:${c ? c.i : ""}`),
      // (hidden on this panel: on the wall nothing, in the builder's canvas a note — not an empty box)
      guest: () => (!window.GuestWifi ? "" : GuestWifi.visible() || !H.design ? GuestWifi.card()
        : `<section class="card glass gw-card"><div class="gc-empty">${UI.esc(T(GuestWifi.cfg && !GuestWifi.cfg().ssid ? "guestwifi.hiddenNoNet" : "guestwifi.hiddenOff"))}</div></section>`), calendar: (o) => `<section class="card glass cal">${UI.calendar(o.days || 3)}</section>`,
      thermostat, temps, locks, openings };
  };
  // a room's own grid of cards (the layout builder, Manager → Your own layout for rooms): this room's, else the one for
  // every room ("*") — when this room (or the panel) is set to "custom"
  const roomGrid = (id) => {
    const S = Settings.v, choice = (S.roomLayouts && S.roomLayouts[id]) || S.roomLayout, grids = S.roomGrids || {};
    if (choice !== "custom" || !window.Grid) return null;
    const g = grids[id] || grids["*"];
    return Grid.valid(g) ? g : null;
  };
  App.roomGrid = roomGrid;
  // the pieces a room's grid can show besides grid.js's own: its appliances (as on its room page), and Home's pieces
  const roomParts = (r) => ({ ...gridParts(), roomthings: () => `<div class="gc-things">${things(r, true)}</div>` });
  const roomGridHtml = (r, g) => {
    nextParts = null; nextGrid = Grid.cards(g, roomParts(r), r);
    return nextGrid.map((c) => `${c.open}<div class="gc-in">${c.html}</div></div>`).join("");
  };
  let nextParts = null, shownParts = null, shownLayout = null, nextGrid = null, shownGrid = null;
  const home = () => {
    const g = customGrid();
    if (g) {
      nextParts = null; nextGrid = Grid.cards(g, gridParts());
      return nextGrid.map((c) => `${c.open}<div class="gc-in">${c.html}</div></div>`).join("");
    }
    nextGrid = null;
    H.watch([]);   // (no custom grid: no device's every reading redraws Home)
    nextParts = homeParts();
    return nextParts.map(([col, parts]) => `<div class="col ${col} fade-in">${parts.map((p) => `<div class="part">${p}</div>`).join("")}</div>`).join("");
  };

  function patchHome(main) {
    if (nextGrid) {   // a custom grid: the same cards in the same places → only the insides that changed
      if (!shownGrid || shownLayout !== "custom" || main.children.length !== nextGrid.length || nextGrid.some((c, i) => c.key !== shownGrid[i].key)) return false;
      nextGrid.forEach((c, i) => {
        const el = main.children[i], was = shownGrid[i];
        if (c.area !== was.area) el.style.gridArea = c.area;   // (moved: the builder's canvas while dragging)
        if (c.cls !== was.cls) el.className = c.cls;
        if (c.ghi !== was.ghi) { if (c.ghi) el.style.setProperty("--ghi", c.ghi); else el.style.removeProperty("--ghi"); }
        if (c.html !== was.html) el.firstElementChild.innerHTML = c.html;
      });
      return true;
    }
    if (!shownParts || shownLayout !== homeLayout() || main.children.length !== nextParts.length) return false;
    nextParts.forEach(([, parts], i) => parts.forEach((p, j) => {
      if (p !== shownParts[i][1][j]) main.children[i].children[j].innerHTML = p;
    }));
    return true;
  }

  // ---------- other devices in a room (appliances, speakers, sensors …: Home.things) ----------
  // A compact live status per device; the Room Test views try out richer, animated versions of these.
  const hm = (s) => { const m = /^(\d+):(\d\d)/.exec(s || ""); return m ? (+m[1] ? T("dur.hm", { h: +m[1], m: +m[2] }) : T("dur.m", { m: +m[2] })) : ""; };
  // a device's own word ("stopped", "open"…) in the panel's language when it's a known one, else as the hub says it
  const word = (v) => { const k = `val.${String(v).toLowerCase()}`; return T.has(k) ? T(k) : cap(v); };
  const THING_ICON = { washer: "drop", dryer: "wind", dishwasher: "drop", oven: "kitchen", microwave: "kitchen", fridge: "thermo",
    speaker: "music", purifier: "fan", air: "wind", garage: "car", leak: "drop", gas: "shield", vibration: "paw", motion: "motion",
    climate: "thermo", siren: "shield", mode: "power", "smart-outlet": "plug" };
  function thingStatus(t) {
    const a = t.attrs || {}, on = (v) => String(v).toLowerCase() === "on";
    switch (t.kind) {
      case "washer": case "dryer": {
        const left = hm(a.timeRemaining);
        return a.machineState === "run" ? [T(left ? "thing.runningPctLeft" : "thing.runningPct", { pct: a.progressPercent ?? 0, left })] : a.machineState === "pause" ? [T("thing.paused")] : [T("thing.idle")];
      }
      case "dishwasher": {
        const st = String(a.operatingState || "").toLowerCase();
        return on(a.running) || (st && !["ready", "idle", "finished", "off"].includes(st)) ? [+a.remainingTime ? T("thing.runningMinLeft", { n: a.remainingTime }) : T("thing.running")] : [T("thing.idle")];
      }
      case "oven": {
        // Samsung reports running "off" while the oven holds temperature, and ovenMode "No operation" while it bakes
        const mode = /no ?operation/i.test(a.ovenMode || "") ? "" : a.ovenMode, hot = +a.ovenTemperature >= 150;
        if (on(a.running) || (on(a.switch) && +a.ovenSetpoint > 0) || hot)
          return [T(+a.ovenSetpoint ? "thing.ovenTo" : "thing.oven", { mode: mode || T(hot ? "thing.hot" : "thing.heating"), t: a.ovenTemperature ?? "?", set: a.ovenSetpoint }), hot ? "warn" : ""];
        return +a.activeBurners ? [T("thing.burners", { n: +a.activeBurners }), "warn"] : [T("thing.off")];
      }
      case "microwave": return on(a.running) ? [T("thing.running")] : [T("thing.idle")];
      case "fridge": return [T(a.contact === "open" || a.doorFreezerOpen === "open" ? "thing.fridgeOpen" : "thing.fridge", { cool: a.coolerTemperature ?? "?", freeze: a.freezerTemperature ?? "?" }),
        a.contact === "open" || a.doorFreezerOpen === "open" ? "warn" : ""];
      case "speaker": return a.status === "playing" ? [a.trackDescription ? T("thing.playingWhat", { what: a.trackDescription }) : T("thing.playing")] : [word(a.status || "stopped")];
      case "purifier": { // Dyson: fanState "OFF" / "FAN", fanMode "OFF" / "FAN" / "AUTO" (same rule as the room page's dysonOn)
        const st = String(a.fanState || "").trim().toLowerCase(), md = String(a.fanMode || "").trim().toUpperCase();
        return (st && st !== "off") || md === "FAN" || md === "AUTO" ? [md === "AUTO" || !+a.fanSpeed ? T("thing.onAuto") : T("thing.onSpeed", { n: +a.fanSpeed })] : [T("thing.off")];
      }
      case "air": return [T("thing.air", { pm: a.pm25 ?? "?", voc: a.sensirionVOCindex ?? a.voc ?? "?" })];
      case "garage": return [word(a.door || "unknown"), a.door && a.door !== "closed" ? "warn" : ""];
      case "leak": return a.water === "wet" ? [T("thing.leak"), "bad"] : [T("thing.dry")];
      case "gas": return a.naturalGas === "detected" ? [T("thing.gas"), "bad"] : [T("thing.clear")];
      case "vibration": return a.acceleration === "active" ? [T("thing.triggered"), "warn"] : [T("thing.set")];
      case "motion": return a.motion === "active" ? [T("thing.motion")] : [T("thing.noMotion")];
      case "climate": return [[a.temperature != null && `${Math.round(a.temperature)}°`, a.humidity != null && `${a.humidity}%`].filter(Boolean).join(" · ") || "—"];
      case "siren": return a.alarm && a.alarm !== "off" ? [T("thing.sounding", { what: a.alarm }), "bad"] : [T("thing.quiet")];
      case "smart-outlet": return [T(on(a.nightlight) ? "thing.outletsNight" : "thing.outlets", { a: word(a.outlet1 || "?"), b: word(a.outlet2 || "?") })];
      default: return [a.switch ? word(a.switch) : "—"];
    }
  }
  // a safety sensor as a row: [icon, name, words, class] — a leak "Dry", a smoke detector "Clear", a freezer its temperature
  const sensorRow = (s) => {
    const bad = s.state === "detected", name = H.devName(s.id) || s.where || s.name;
    // (a freezer above its warning limit: amber, red 5 °F above — shown only, no sound, no alert)
    const warm = H.sensorWarn ? H.sensorWarn(s) : null;
    if (s.kind === "freezer") return ["thermo", name, bad ? T("thing.tooWarm") : s.temp != null ? T(warm ? "thing.freezerAbove" : "thing.freezer", { t: Math.round(s.temp), max: Math.round(s.max) }) : "—", bad || warm === "hot" ? "bad" : warm ? "warn" : ""];
    const [ic, ok, alarm] = { water: ["drop", "thing.dry", "thing.leak"], smoke: ["shield", "thing.clear", "thing.smoke"], gas: ["shield", "thing.clear", "thing.gas"] }[s.kind] || ["shield", "thing.ok", "thing.alert"];
    return [ic, name, T(bad ? alarm : ok), bad ? "bad" : ""];
  };
  // all: the "Appliances here" card — the room's safety sensors and its thermostat too, and a line when there's nothing
  const things = (r, all) => {
    const list = H.things({ room: r.name }), seen = new Set(list.map((t) => t.id));
    // (one naming rule in the card: without the room's name, as the appliances come — "Smoke Detector", not "Hallway Smoke Detector")
    const short = (n) => { const s = String(n || ""), p = `${r.name} `.toLowerCase(); return s.toLowerCase().startsWith(p) && s.length > p.length ? s.slice(p.length) : s; };
    const rows = list.map((t) => { const [st, cls] = thingStatus(t); return [THING_ICON[t.kind] || "power", t.name, st, cls]; });
    if (all) {
      for (const s of S.sensors || []) if ((s.room || H.roomOf(s.id)) === r.name && !seen.has(s.id)) { const x = sensorRow(s); x[1] = short(x[1]); rows.push(x); }
      const th = S.thermostat && S.thermostat.id != null && S.thermostat.room === r.name ? H.thermo(null) : null;
      if (th) rows.push(["thermo", short(th.name), th.temp != null ? T("thing.thermo", { t: Math.round(th.temp), mode: App.tWord(th) }) : App.tWord(th), ""]);
    }
    if (!rows.length) return all ? `<div class="things"><span class="label">${UI.esc(T("room.more"))}</span><div class="gc-empty">${UI.esc(T("room.nothingElse"))}</div></div>` : "";
    return `<div class="things"><span class="label">${UI.esc(T("room.more"))}</span>${rows.map(([ic, n, st, cls]) =>
      `<div class="thing glass ${cls || ""}">${icon(ic, 24)}<div><div class="n">${UI.esc(n)}</div><div class="st">${UI.esc(st)}</div></div></div>`).join("")}</div>`;
  };

  // ---------- room (tiles) ----------
  function room(r) {
    const devs = H.devices(r), ic = { outlet: "plug", switch: "power", light: "bulb" };
    const fans = devs.filter((d) => d.kind === "fan"), shades = devs.filter((d) => d.kind === "shade");
    const tiles = devs.filter((d) => ["light", "outlet", "switch"].includes(d.kind));
    const fanSeg = (d) => `<div class="seg">${["off", "low", "medium", "high"].map((s) => `<button class="${d.speed === s ? "cur" : ""}"${Acts.on("app.setFan", d.id, s)}>${UI.esc(word(s))}</button>`).join("")}</div>`;
    const shadeSeg = (d) => `<div class="seg">${[0, 50, 100].map((l) => `<button class="${d.level === l ? "cur" : ""}"${Acts.on("app.setShade", d.id, l)}>${UI.esc(T(l === 0 ? "shade.close" : l === 100 ? "shade.open" : "shade.half"))}</button>`).join("")}</div>`;
    return `<section class="room fade-in">
      <div class="room-head"><h1>${UI.esc(r.name)}</h1><span class="chip">${icon("bulb", 18)}${UI.esc(T("room.lightsOn", { on: H.lightsOn(r), total: H.lightsTotal(r) }))}</span>
        ${r.windows.map((id) => { const w = S.windows.find((x) => x.id === id) || {};
          return `<span class="chip ${w.open ? "warn" : "ok"}">${icon(w.open ? "windowOpen" : "window", 18)}${UI.esc(T(w.open ? "room.windowOpen" : "room.windowClosed", { name: H.windowName(id).replace(r.name, "").trim() || T("room.window") }))}</span>`; }).join("")}
        <button class="chip"${Acts.on("app.roomOptions", r.id)}>${icon("settings", 16)} ${UI.esc(T("room.options"))}</button>
        <span class="room-clock num">${H.time()}<small>${H.ampm()}</small></span></div>
      ${H.lightsTotal(r) ? `<div class="allbtns"><button class="bigbtn primary"${Acts.on("gr.roomAll", r.id, true)}>${icon("bulb", 22)}${UI.esc(T("room.allOn"))}</button><button class="bigbtn"${Acts.on("gr.roomAll", r.id, false)}>${icon("power", 22)}${UI.esc(T("room.allOff"))}</button></div>` : ""}
      <div class="tiles">${tiles.map((d) => `<button class="tile glass ${d.on ? "on" : ""}${d.unknown ? " unk" : ""}" data-dev="${+d.id}"${Acts.on("app.toggle", d.id)}><div class="top"><div class="icn">${icon(ic[d.kind], 32)}</div><div class="switch ${d.on ? "on" : ""}"></div></div>
        <div><div class="n">${UI.esc(d.name)}</div><div class="st">${UI.esc(d.on ? (d.level ? T("room.onLevel", { n: d.level }) : T("thing.on")) : d.unknown ? T("room.unknownTap") : T("thing.off"))}</div></div></button>`).join("")}</div>
      ${fans.length || shades.length ? `<div class="rowctl">${fans.map((f) => `<div class="rc glass ${f.on ? "on" : ""}${f.unknown ? " unk" : ""}">${icon("fan", 34)}<div class="grow"><div class="n">${UI.esc(f.name)}</div><div class="st">${UI.esc(f.on ? word(f.speed) : f.unknown ? T("room.unknown") : T("thing.off"))}</div></div>${fanSeg(f)}</div>`).join("")}
        ${shades.map((s) => `<div class="rc glass">${icon("shade", 34)}<div class="grow"><div class="n">${UI.esc(s.name)}</div><div class="st">${UI.esc(((l) => (l <= 0 ? T("state.closed") : l >= 100 ? T("state.open") : T("shade.openPct", { n: l })))(Math.max(0, Math.min(100, Math.round(+s.level || 0)))))}</div></div>${shadeSeg(s)}</div>`).join("")}</div>` : ""}
      ${things(r)}
    </section>`;
  }

  // ---------- rooms in this panel's order (Settings → roomOrder; rooms not in it follow in Hubitat's order) ----------
  App.rooms = () => {
    const order = Settings.v.roomOrder || [], rs = H.rooms();
    const pos = (r, i) => { const k = order.indexOf(r.id); return k < 0 ? order.length + i : k; };
    return rs.map((r, i) => [pos(r, i), r]).sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  };

  // ---------- rearranging the room buttons: press and hold one → panel PIN → they wiggle; drag; Done ----------
  let reorder = false, reorderDrag = null, holdTimer = null, eatClickUntil = 0, reorderTouched = 0;
  // left alone (no PIN set / "Ask every time" means no unlock window to end it): stop wiggling after 60 s untouched
  setInterval(() => { if (reorder && !reorderDrag && Date.now() - reorderTouched > 60000) App.endReorder(); }, 5000);
  App.endReorder = () => {
    if (!reorder) return;
    reorder = false; reorderDrag = null;
    const el = document.getElementById("dock"); el.classList.remove("reorder");
    dockHtml = ""; dock();
  };
  async function startReorder() {
    if (reorder || !(await Settings.unlockWithPin(T("dock.arrange")))) return;
    reorder = true; reorderTouched = Date.now();
    document.getElementById("dock").classList.add("reorder");
    dockHtml = ""; dock();
  }
  const saveOrder = () => {
    const ids = [...document.querySelectorAll("#dock .dock-rooms button[data-room]")].map((b) => b.dataset.room);
    // rooms hidden in Settings aren't on the dock: they keep their old place
    (Settings.v.roomOrder || []).forEach((id, i) => { if (!ids.includes(id) && H.state.rooms.some((r) => r.id === id)) ids.splice(Math.min(i, ids.length), 0, id); });
    if (ids.length && JSON.stringify(ids) !== JSON.stringify(Settings.v.roomOrder || [])) Settings.set("roomOrder", ids);
  };
  document.addEventListener("pointerdown", (e) => {
    eatClickUntil = 0; // a new touch: whatever click follows is its own
    const b = e.target.closest && e.target.closest("#dock .dock-rooms button[data-room]");
    clearTimeout(holdTimer);
    if (reorder) reorderTouched = Date.now();
    if (!b) return;
    if (reorder) {   // pick the button up: it follows the finger along the row
      e.preventDefault();
      reorderDrag = { b, id: e.pointerId, x: e.clientX, y: e.clientY };
      b.classList.add("lifted");
      try { b.setPointerCapture(e.pointerId); } catch {}
      return;
    }
    if (Settings.v.arrangeOnPanel !== true) return;   // (arranging: Manager → Panels → Rooms & devices; on the wall only if allowed)
    const x0 = e.clientX, y0 = e.clientY;
    const cancel = (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 12) { clearTimeout(holdTimer); off(); } };

    const off = () => { removeEventListener("pointermove", cancel, true); removeEventListener("pointerup", cancelAll, true); removeEventListener("pointercancel", cancelAll, true); };
    const cancelAll = () => { clearTimeout(holdTimer); off(); };
    addEventListener("pointermove", cancel, true); addEventListener("pointerup", cancelAll, true); addEventListener("pointercancel", cancelAll, true);
    holdTimer = setTimeout(() => { off(); eatClickUntil = Date.now() + 1500; startReorder(); }, 650);
  }, true);
  document.addEventListener("pointermove", (e) => {
    const g = reorderDrag; if (!g || e.pointerId !== g.id) return;
    const row = g.b.parentElement, r = row.getBoundingClientRect();
    // (a room bar on the left / right is a column: up and down instead of left and right)
    const vert = document.documentElement.classList.contains("dock-left") || document.documentElement.classList.contains("dock-right");
    if (vert) { if (e.clientY < r.top + 60) row.scrollTop -= 14; else if (e.clientY > r.bottom - 60) row.scrollTop += 14; }
    else if (e.clientX < r.left + 60) row.scrollLeft -= 14; else if (e.clientX > r.right - 60) row.scrollLeft += 14;
    // the button under the finger: put the dragged one before / after it
    const over = [...row.querySelectorAll("button[data-room]")].find((x) => { const q = x.getBoundingClientRect();
      return x !== g.b && (vert ? e.clientY >= q.top && e.clientY <= q.bottom : e.clientX >= q.left && e.clientX <= q.right); });
    if (over) { const q = over.getBoundingClientRect(); row.insertBefore(g.b, (vert ? e.clientY < q.top + q.height / 2 : e.clientX < q.left + q.width / 2) ? over : over.nextSibling); }
  }, true);
  const drop = (e) => {
    const g = reorderDrag; if (!g || e.pointerId !== g.id) return;
    g.b.classList.remove("lifted"); reorderDrag = null; saveOrder();
  };
  document.addEventListener("pointerup", drop, true);
  document.addEventListener("pointercancel", drop, true);
  // the tap that ended a press-and-hold or a swipe must not also press what's under the finger
  document.addEventListener("click", (e) => { if (Date.now() < eatClickUntil) { e.stopPropagation(); e.preventDefault(); eatClickUntil = 0; } }, true);
  // a room page's light / switch tile (the list style): press and hold → its wheel — on / off, brightness, white, colour
  // (grid.js, as a room's device list does); a tap still switches it
  let tileHold = null;
  document.addEventListener("pointerdown", (e) => {
    clearTimeout(tileHold);
    const t = e.target.closest && e.target.closest("main.roomview .tile[data-dev]"); if (!t || !window.Grid || !Grid.autoWheel) return;
    const w = Grid.autoWheel(+t.dataset.dev); if (!w) return;
    const x0 = e.clientX, y0 = e.clientY;
    const off = () => { clearTimeout(tileHold); removeEventListener("pointermove", mv, true); removeEventListener("pointerup", off, true); removeEventListener("pointercancel", off, true); };
    const mv = (ev) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 12) off(); };
    addEventListener("pointermove", mv, true); addEventListener("pointerup", off, true); addEventListener("pointercancel", off, true);
    tileHold = setTimeout(() => { off(); eatClickUntil = Date.now() + 1500; Grid.openWheel(t, w, null, null); }, 550);
  }, true);
  PinPad.onLock(() => App.endReorder());

  // ---------- swipe left / right on a room page = next / previous room (the dock's order) ----------
  // Not when the swipe starts on something that drags itself (dimmer orb, sliders, colour wheel, scene buttons, a
  // scrolling row, the thermostat dial) or while a sheet / popup is open.
  const OWN_DRAG = ".rlG-ow, .rlG-sl, .rlG-wheel, .rlG-scr, .rlG-sheet, [data-scene], [data-nest], input, select, textarea, #dock";
  let swipe = null;
  document.addEventListener("pointerdown", (e) => {
    swipe = null;
    if (!H.rooms().some((r) => r.id === App.view) || reorder || !e.isPrimary) return;
    if (e.target.closest && e.target.closest(OWN_DRAG)) return;
    if (document.querySelector(".popup-host.show, .cam-full") || (window.Settings && Settings.open)) return;
    swipe = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
  }, true);
  document.addEventListener("pointerup", (e) => {
    const s = swipe; swipe = null;
    if (!s || e.pointerId !== s.id || App.dragging) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) < 90 || Math.abs(dy) > Math.abs(dx) * 0.5 || Date.now() - s.t > 800) return;
    const rs = App.rooms(), i = rs.findIndex((r) => r.id === App.view);
    if (i < 0 || rs.length < 2) return;
    eatClickUntil = Date.now() + 400;
    App.go(rs[(i + (dx < 0 ? 1 : -1) + rs.length) % rs.length].id);   // swipe left = next room (like turning a page)
  }, true);

  // ---------- dock: Alarm · Home · Cameras fixed, rooms scroll ----------
  // How it's drawn (Manager → Look & layout → Room bar; App.render sets the classes, theme.css draws them):
  // html.dock-style-<style>, dock-nolabels (icons only: each name stays in its button for screen readers, a tap shows it),
  // dock-autohide (folded to a handle until tapped — App.dockOpen). The page keeps clear of it: dockSafe.
  let dockScroll = 0, dockHtml = "", dockKey = "";
  // the room bar's edge as drawn: the panel's choice — but a side bar on a screen under 500 px wide (a phone) goes along
  // the bottom: on the side it left the page ~180 px ("Farme / marke")
  function dockAtNow() {
    const a = Settings.v.dockAt;
    return (a === "left" || a === "right") && innerWidth < 500 ? "bottom" : ["top", "left", "right"].includes(a) ? a : "bottom";
  }
  function dock() {
    const el = document.getElementById("dock"), info = Alarm.info(), armed = Alarm.isArmed(), a = H.state.alarm;
    const vert = dockAtNow() === "left" || dockAtNow() === "right", rc = document.documentElement.classList;
    const bare = rc.contains("dock-nolabels"), auto = rc.contains("dock-autohide");
    const tip = (n) => (bare ? ` title="${UI.esc(n)}"` : "");   // (icons only: the name as a tooltip too)
    // the alarm by shape as well as colour: a shield (disarmed), a shield with a house (armed home / night), a padlock
    // (armed away, arming), a siren (HSM's alert while armed)
    const alert = armed && !!a.alert, away = a.status === "armedAway";
    const aIc = alert ? "siren" : armed ? (/^armed(Home|Night)/.test(a.status) ? "shieldHome" : "lock") : Alarm.live ? "shield" : "shieldOff";
    const aName = alert ? T("dock.alarm") : armed ? (/^arming/.test(a.status) ? T("dock.arming") : T("dock.armed", { mode: info.short })) : Alarm.live ? T("dock.disarmed") : T("dock.alarm");
    const nav = (id, ic, name) => `<button class="${App.view === id ? "cur" : ""}"${Acts.on("app.go", id)}${tip(name)}>${icon(ic, 28)}<span class="dl">${UI.esc(name)}</span></button>`;
    const html = `<div class="dock-fixed">
        <button class="alarm-btn ${armed ? `armed${away ? " away" : ""}${alert ? " alert" : ""}` : Alarm.live ? "disarmed" : "unknown"}"${Acts.on("alarm.open")}${tip(aName)}>${icon(aIc, 28)}<span class="dl">${UI.esc(aName)}</span></button>
        ${nav("home", "home", T("dock.home"))}${nav("cameras", "film", T("dock.cameras"))}
        ${testViews().filter(([, t]) => t.fixed).map(([id, t]) => nav(id, t.icon, t.name)).join("")}</div>
      <span class="sep"></span>
      <div class="dock-end">
      ${reorder ? `<button class="reorder-done"${Acts.on("app.endReorder")}${tip(T("dock.done"))}>${icon("check", 28)}<span class="dl">${UI.esc(T("dock.done"))}</span></button>` : ""}
      <div class="dock-rail">${dockMore("prev", vert)}<div class="dock-rooms">${reorder ? "" : testViews().filter(([, t]) => !t.fixed).map(([id, t]) => `<button class="test ${App.view === id ? "cur" : ""}"${Acts.on("app.go", id)}${tip(t.name)}>${icon(t.icon || "sun", 28)}<span class="dl">${t.name}</span></button>`).join("")}
        ${App.rooms().map((r) => `<button data-room="${r.id}" class="${App.view === r.id ? "cur" : ""}" ${reorder ? "" : Acts.on("app.go", r.id)}${tip(r.name)}>${icon(r.icon, 28)}<span class="dl">${UI.esc(r.name)}</span>
        ${H.lightsOn(r) ? `<span class="n">${H.lightsOn(r)}</span>` : ""}</button>`).join("")}</div>${dockMore("next", vert)}</div>
      ${dockBell()}<button class="dock-gear"${Acts.on("app.settings")} title="${UI.esc(T("dock.settings"))}" aria-label="${UI.esc(T("dock.settings"))}">${icon("settings", 22)}</button></div>
      ${auto ? dockHandle(alert ? "alarm" : away ? "bad2" : armed ? "bad" : Alarm.live ? "ok" : "unk", aIc, aName) : ""}`;
    if (!auto) dockOpen = false;
    el.classList.toggle("collapsed", auto && !dockOpen);
    // unchanged / a button being dragged / rearranging (a rebuild would restart every wiggle): leave it
    if (html === dockHtml || reorderDrag || (reorder && dockHtml)) { dockEdges(); dockAfter(el); return; }
    const scroller = el.querySelector(".dock-rooms"); if (scroller) dockScroll = [scroller.scrollLeft, scroller.scrollTop];
    el.innerHTML = dockHtml = html;
    { const sc = el.querySelector(".dock-rooms"); if (Array.isArray(dockScroll)) [sc.scrollLeft, sc.scrollTop] = dockScroll; }
    if (!dockRO && window.ResizeObserver) { dockRO = new ResizeObserver(() => { dockEdges(); dockSafe(); }); dockRO.observe(el); }
    dockEdges(); requestAnimationFrame(() => dockEdges());   // (again once fonts / icons have their size)
    dockAfter(el);
  }
  // a room opened any way (a dock tap, a swipe, a card, a rule) or the bar drawn another way: its button scrolled clear
  // of the arrows; the page's room for the bar measured again
  function dockAfter(el) {
    dockSafe();
    const key = [App.view, ...[...document.documentElement.classList].filter((c) => c.startsWith("dock-"))].join(" ");
    if (key !== dockKey) { dockKey = key; const b = el.querySelector(".dock-rooms button.cur"); if (b) dockShow(b); }
  }
  // the page keeps clear of the bar: --dock-t / r / b / l = what it takes at its edge, measured (each style has its own
  // size); folded away (auto-hide), its handle's — opened, it lies over the page, which doesn't move
  function dockSafe() {
    const el = document.getElementById("dock"), root = document.documentElement, s = root.style;
    if (!el || root.classList.contains("dock-off") || root.classList.contains("not-set-up")) { for (const k of "trbl") s.removeProperty(`--dock-${k}`); return; }
    if (dockOpen) return;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    const at = ["top", "left", "right"].find((k) => root.classList.contains(`dock-${k}`)) || "bottom";
    const st = parseFloat(getComputedStyle(root).getPropertyValue("--st-h")) || 0;   // (a status bar above a bar on top: status.css adds it)
    const px = { t: at === "top" ? r.bottom - st : 0, r: at === "right" ? innerWidth - r.left : 0, b: at === "bottom" ? innerHeight - r.top : 0, l: at === "left" ? r.right : 0 };
    for (const k of "trbl") { const v = `${Math.max(0, Math.round(px[k]))}px`; if (s.getPropertyValue(`--dock-${k}`) !== v) s.setProperty(`--dock-${k}`, v); }
  }
  // auto-hide: the handle — the alarm's state, the page on screen, how many alerts wait; a tap opens the bar
  function dockHandle(tone, aIc, aName) {
    const r = H.rooms().find((x) => x.id === App.view), t = window.TestViews && Object.hasOwn(TestViews, App.view) ? TestViews[App.view] : null;
    const [ic, name] = r ? [r.icon, r.name] : t ? [t.icon || "sun", t.name] : App.view === "cameras" ? ["film", T("dock.cameras")] : ["home", T("dock.home")];
    const w = window.HubAlerts ? HubAlerts.waiting() : [], hi = w.length ? Math.max(...w.map((x) => x.lvl)) : 0;
    const chev = { top: "chevronDown", left: "chevron", right: "chevronLeft" }[dockAtNow()] || "chevronUp";
    return `<button class="dock-handle t-${tone}"${Acts.on("app.dockOpen")} aria-expanded="false" aria-label="${UI.esc(w.length ? T("dock.openWaiting", { alarm: aName, page: name, n: w.length }) : T("dock.open", { alarm: aName, page: name }))}">`
      + `<span class="hs">${icon(aIc, 24)}</span><span class="hn">${icon(ic, 22)}<span class="hl">${UI.esc(name)}</span></span>`
      + `${w.length ? `<span class="hw${hi >= 4 ? " l4" : ""}">${w.length}</span>` : ""}<span class="hc">${icon(chev, 20)}</span></button>`;
  }
  // opened: it folds again 6 s after the last touch on it (1.5 s after a page was picked on it), or at a touch elsewhere
  let dockOpen = false, dockFold = null, dockTipTimer = null;
  const dockLater = (ms) => { clearTimeout(dockFold); dockFold = setTimeout(() => App.dockFold(), ms); };
  App.dockOpen = () => {
    const el = document.getElementById("dock"); if (!el || dockOpen) return;
    dockOpen = true; el.classList.remove("collapsed"); el.classList.add("opening");
    setTimeout(() => el.classList.remove("opening"), 300);
    const b = el.querySelector(".dock-rooms button.cur"); if (b) dockShow(b); else dockEdges();
    dockLater(6000);
  };
  App.dockFold = () => {
    clearTimeout(dockFold);
    if (!dockOpen) return;
    if (reorder || reorderDrag || dockDrag) { dockLater(6000); return; }   // (never while rearranging or dragging the rooms)
    dockOpen = false;
    const el = document.getElementById("dock");
    if (el && document.documentElement.classList.contains("dock-autohide")) el.classList.add("collapsed");
    dockSafe();
  };
  document.addEventListener("pointerdown", (e) => { if (dockOpen) { if (e.target.closest && e.target.closest("#dock")) dockLater(6000); else App.dockFold(); } }, true);
  document.addEventListener("click", (e) => {   // (before the button's own: a page picked redraws the bar)
    const b = dockOpen && e.target.closest && e.target.closest("#dock button");
    if (b && !b.matches(".dock-more, .dock-handle")) dockLater(1500);
  }, true);
  // icons only: a tap shows the button's name for a moment, beside the bar (measured before the tap redraws the bar)
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("#dock button[title]");
    if (!b || b.classList.contains("dock-more") || !document.documentElement.classList.contains("dock-nolabels")) return;
    let t = document.getElementById("dock-tip");
    if (!t) { t = document.createElement("div"); t.id = "dock-tip"; t.className = "dock-tip"; t.setAttribute("aria-hidden", "true"); document.body.appendChild(t); }
    t.textContent = b.title; t.classList.add("show");
    const r = b.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight, at = dockAtNow();
    const [x, y] = at === "top" ? [r.left + r.width / 2 - w / 2, r.bottom + 14] : at === "left" ? [r.right + 14, r.top + r.height / 2 - h / 2]
      : at === "right" ? [r.left - w - 14, r.top + r.height / 2 - h / 2] : [r.left + r.width / 2 - w / 2, r.top - h - 14];
    t.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, x))}px`; t.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, y))}px`;
    clearTimeout(dockTipTimer); dockTipTimer = setTimeout(() => t.classList.remove("show"), 1300);
  }, true);
  // (to a place the bar's snapping keeps: a button's start at the arrow's edge — the scroll-padding — never under it)
  function dockShow(b) {
    const sc = b.parentElement, v = dockVert(), cs = getComputedStyle(sc), pad = parseFloat(v ? cs.scrollPaddingTop : cs.scrollPaddingLeft) || 0;
    const s = sc.getBoundingClientRect(), r = b.getBoundingClientRect(), [lo, hi] = v ? ["top", "bottom"] : ["left", "right"];
    const at = (x) => x.getBoundingClientRect()[lo] - s[lo] - pad;   // (scrolling by this puts x's start at the arrow's edge)
    let by = 0;
    if (r[lo] < s[lo] + pad) by = at(b);
    else if (r[hi] > s[hi] - pad) { const need = r[hi] - s[hi] + pad; by = at(b); for (const x of sc.children) { const d = at(x); if (d >= need) { by = Math.min(by, d); break; } } }
    if (by) { if (v) sc.scrollTop += by; else sc.scrollLeft += by; }
    dockEdges();
  }

  // alerts waiting in the list (hubalerts.js): a bell that opens it — on every page without the Notifications line
  // (a custom Home without a Notifications card, the room pages, Cameras); red when a level 4–5 waits
  function dockBell() {
    const w = window.HubAlerts ? HubAlerts.waiting() : [];
    if (!w.length || (App.view === "home" && homeLayout() !== "custom")) return "";
    if (App.view === "home" && (customGrid().cards || []).some((c) => c.t === "alerts" || c.t === "notices")) return "";
    const hi = Math.max(...w.map((a) => a.lvl));
    return `<button class="dock-bell${hi >= 4 ? " l4" : ""}"${Acts.on("hub.openList")} title="${UI.esc(T("dock.notifications"))}" aria-label="${UI.esc(T("dock.notificationsN", { n: w.length }))}">${icon("bell", 24)}<span class="n">${w.length}</span></button>`;
  }

  // ---------- the room bar's scrolling: more rooms than fit ----------
  // A fade + a round arrow at each end that has more rooms past it (gone when every room fits); the arrow is a button
  // (a big target) that scrolls about one bar's width. With a mouse (the Manager's "Try it", a desktop browser) the
  // rooms can be dragged sideways like a finger does on the wall, and a mouse wheel scrolls them; a drag never also
  // opens the room it started on. Touch keeps the browser's own scrolling (with its momentum).
  // (a bar on the left / right: the same up and down)
  let dockRO = null, dockDrag = null;
  const dockVert = () => { const c = document.documentElement.classList; return c.contains("dock-left") || c.contains("dock-right"); };
  const noMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  function dockMore(dir, vert) {
    const ic = vert ? (dir === "prev" ? "chevronUp" : "chevronDown") : (dir === "prev" ? "chevronLeft" : "chevron");
    return `<button type="button" class="dock-more ${dir}" tabindex="-1" aria-hidden="true" data-more="${dir}" aria-label="${UI.esc(T(dir === "prev" ? "dock.earlier" : "dock.more"))}"><span>${icon(ic, 22)}</span></button>`;
  }
  function dockEdges() {
    const sc = document.querySelector("#dock .dock-rooms"), rail = sc && sc.parentElement; if (!rail) return;
    const v = dockVert(), pos = v ? sc.scrollTop : sc.scrollLeft, room = v ? sc.scrollHeight - sc.clientHeight : sc.scrollWidth - sc.clientWidth;
    const a = room > 2 && pos > 2, b = room > 2 && pos < room - 2;
    if (rail.classList.contains("more-prev") !== a) rail.classList.toggle("more-prev", a);
    if (rail.classList.contains("more-next") !== b) rail.classList.toggle("more-next", b);
    for (const [d, on] of [["prev", a], ["next", b]]) { const m = rail.querySelector(`.dock-more.${d}`); if (m) { m.tabIndex = on ? 0 : -1; m.setAttribute("aria-hidden", on ? "false" : "true"); } }
  }
  App.dockEdges = dockEdges;
  document.addEventListener("scroll", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("dock-rooms")) dockEdges();
    // (a page that scrolls — a phone: the version tag steps aside while it's scrolled, theme.css html.page-scrolled)
    else if (e.target && e.target.id === "main") document.documentElement.classList.toggle("page-scrolled", e.target.scrollTop > 8);
  }, true);
  addEventListener("resize", () => {
    // (a phone turned: a side bar moves to / from the bottom — dockAtNow)
    if (!document.documentElement.classList.contains(`dock-${dockAtNow()}`)) { App.render(); return; }
    dockEdges(); dockSafe(); if (App.view === "home") UI.fitCal(document.getElementById("main"));
  });
  // an arrow: about one bar's width, landing on a whole room — the next page starts with the first room that wasn't
  // whole (it lines up just past the fade, theme.css .dock-rooms scroll-padding); back: the room a bar's width earlier
  document.addEventListener("click", (e) => {
    const m = e.target.closest && e.target.closest("#dock .dock-more"); if (!m) return;
    const sc = m.parentElement.querySelector(".dock-rooms"); if (!sc) return;
    e.preventDefault(); e.stopPropagation();
    const v = dockVert(), cs = getComputedStyle(sc), size = v ? sc.clientHeight : sc.clientWidth, pos = v ? sc.scrollTop : sc.scrollLeft;
    const padA = parseFloat(v ? cs.scrollPaddingTop : cs.scrollPaddingLeft) || 0, padB = parseFloat(v ? cs.scrollPaddingBottom : cs.scrollPaddingRight) || 0;
    const box = sc.getBoundingClientRect(), view = size - padA - padB;
    // (each room: where it starts and ends along the bar, in scroll coordinates)
    const rooms = [...sc.children].filter((b) => b.offsetWidth).map((b) => { const r = b.getBoundingClientRect(); const a = (v ? r.top - box.top : r.left - box.left) + pos; return [a, a + (v ? r.height : r.width)]; });
    let to;
    if (m.dataset.more === "prev") { const r = rooms.find(([a]) => a >= pos - view - 1); to = r && r[0] - padA < pos - 1 ? r[0] - padA : pos - view; }
    else { const r = rooms.find(([a, b]) => b > pos + size - padB + 1); to = r && r[0] - padA > pos + 1 ? r[0] - padA : pos + Math.max(80, view); }
    sc.scrollTo({ [v ? "top" : "left"]: Math.max(0, to), behavior: noMotion() ? "auto" : "smooth" });
  });
  // drag with a mouse (touch and pen scroll by themselves)
  document.addEventListener("pointerdown", (e) => {
    dockDrag = null;
    if (reorder || e.pointerType !== "mouse" || e.button !== 0) return;
    const sc = e.target.closest && e.target.closest("#dock .dock-rooms"); if (!sc) return;
    dockDrag = { sc, id: e.pointerId, x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop, moved: false };
  });
  document.addEventListener("pointermove", (e) => {
    const g = dockDrag; if (!g || e.pointerId !== g.id) return;
    if (!(e.buttons & 1)) { dockDrag = null; g.sc.classList.remove("dragging"); return; }   // (the button came up outside the page)
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.moved) {
      if (Math.hypot(dx, dy) <= 6) return;
      g.moved = true; clearTimeout(holdTimer);   // a drag, not a press-and-hold
      g.sc.classList.add("dragging");
      try { g.sc.setPointerCapture(e.pointerId); } catch {}
    }
    if (dockVert()) g.sc.scrollTop = g.t - dy; else g.sc.scrollLeft = g.l - dx;
    e.preventDefault();
  });
  const dockDrop = (e) => {
    const g = dockDrag; if (!g || e.pointerId !== g.id) return;
    dockDrag = null;
    if (!g.moved) return;
    g.sc.classList.remove("dragging");
    eatClickUntil = Date.now() + 400;   // the click that ends a drag doesn't open a room
    dockEdges();
  };
  document.addEventListener("pointerup", dockDrop);
  document.addEventListener("pointercancel", dockDrop);
  // a mouse wheel (up / down) over a bar along the bottom / top: sideways
  document.addEventListener("wheel", (e) => {
    const sc = e.target.closest && e.target.closest("#dock .dock-rooms"); if (!sc || dockVert() || e.ctrlKey) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || sc.scrollWidth <= sc.clientWidth) return;
    const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? sc.clientWidth : 1;
    sc.scrollLeft += e.deltaY * k;
    e.preventDefault();
  }, { passive: false });

  // ---------- thermostat interaction ----------
  // (id: a grid card's own thermostat; null = the house's)
  App.mode = (m, id) => { App.thermoEdit = false; H.setMode(m, id); };
  App.fan = (m, id) => H.setFanMode(m, id);
  App.bump = (d, id) => { const tgt = nestTarget(H.thermo(id)); if (!tgt) return; App.keepEdit(); H.setpoint(tgt, d, id); };
  App.keepEdit = () => { clearTimeout(App.editTimer); App.editTimer = setTimeout(() => { App.thermoEdit = false; App.render(); }, 8000); };
  let down = null;
  const toView = (dial, e) => { const r = dial.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 300, ((e.clientY - r.top) / r.height) * 300]; };
  // While dragging only the dial face is redrawn (preview); the value is committed through Home.setTemp on release.
  document.addEventListener("pointerdown", (e) => {
    if (down) return; // a second finger doesn't start or steal a drag
    const dial = e.target.closest("[data-nest]"); if (!dial || e.target.closest(".nest-adj")) return;
    // (which thermostat: the dial says — the house's, or a grid card's own)
    const t = H.thermo(+dial.dataset.tid || null), [x, y] = toView(dial, e), tgt = nestTarget(t);
    // (Auto: a tap on "HEAT 68°" / "COOL 76°" picks the set point the ring and arrows edit — nest.js)
    const side = e.target.closest("[data-side]");
    down = { id: e.pointerId, dial, x: e.clientX, y: e.clientY, onRing: !side && nestTempAt(x, y) != null, side: side && side.dataset.side, tgt, t, value: tgt ? t[tgt] : null };
    if (down.onRing && tgt) {
      App.dragging = true;
      try { dial.setPointerCapture(e.pointerId); } catch {} // keep getting moves if the finger leaves the dial
      move(e);
    }
  });
  function move(e) {
    if (!App.dragging || !down || e.pointerId !== down.id) return;
    const [x, y] = toView(down.dial, e), v = nestTempAt(x, y);
    // (past an end of the ring the knob stays there, like a real dial — it never jumps across the gap, 90 → 50; once
    // stuck there only a finger back near that end moves it again, not one that came round the whole ring to 70)
    if (v != null && down.value != null && (down.stuck != null ? Math.abs(v - down.stuck) > 3 : Math.abs(v - down.value) > 20)) { if (down.stuck == null) down.stuck = down.value; return; }
    down.stuck = null;
    if (v != null && v !== down.value) { down.value = v; down.dial.querySelector(".face").innerHTML = nestFace({ ...down.t, ...H.tPair(down.t, down.tgt, v) }); }
  }
  function end(e, cancelled) {
    if (!down || e.pointerId !== down.id) return;
    const d = down; down = null; App.dragging = false;
    // (a tap on the number: that dial's ▲ ▼ — App.thermoEdit = the thermostat's id)
    if (!cancelled && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8 && d.side) { if (App.thermoEdit) App.keepEdit(); H.autoSide(d.side, d.t.id); }
    else if (!cancelled && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8 && !d.onRing && d.tgt) { App.thermoEdit = App.thermoEdit === d.t.id ? false : d.t.id; if (App.thermoEdit) App.keepEdit(); }
    if (!cancelled && d.onRing && d.tgt && d.value !== d.t[d.tgt]) H.setTemp(d.tgt, d.value, d.t.id); // commits + re-renders
    else { // redraw the dial (drops a cancelled preview): on home only its part, elsewhere a full redraw
      // (the dial's part — wherever this panel's Home layout puts it — is drawn again)
      const at = homeLayout() === "custom" ? [] : HOME_LAYOUTS[homeLayout()].map(([, ps]) => ps.indexOf("thermostat")), c = at.findIndex((i) => i >= 0);
      if (App.view === "home" && shownParts && c >= 0) { shownParts[c][1][at[c]] = null; App.mainHtml = null; }
      else if (App.view === "home" && shownGrid) { shownGrid = shownGrid.map((g) => (g.html.includes("data-nest") ? { ...g, html: null } : g)); App.mainHtml = null; }
      else App.mainHtml = "";
      App.render();
      if (UI.isOpen()) UI.refreshPopup();   // (the dial in a pop-up: a room page's thermostat)
    }
  }
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", (e) => end(e, false));
  document.addEventListener("pointercancel", (e) => end(e, true)); // e.g. an Android system gesture

  // ---------- test views (Room Test 1/2/3 …) ----------
  // A test view registers itself: window.TestViews = { rt1: { name, icon, mount(el), update(), unmount() } }
  // (`fixed: true` = button next to Cameras instead of at the front of the scrolling rooms, e.g. Music).
  // App.render mounts it once into #main when the view opens, calls update() on every data change (the view patches
  // its own DOM, so animations keep running), and unmount() when another view opens. Shown first in the dock.
  const testViews = () => Object.entries(window.TestViews || {}).filter(([, t]) => !(t.hidden && t.hidden()));   // (Music without an address: none)
  let mountedTest = null;
  function leaveTest() { if (mountedTest) { try { mountedTest.unmount && mountedTest.unmount(); } catch (e) { console.warn(e); } mountedTest = null; } }

  // ---------- room layouts (A/B/C …) ----------
  // window.RoomLayouts = { A: { name, mount(el, roomId), update(roomId), unmount() } } — draws ANY room page the same
  // way a test view draws itself (mount once, patch in update). Settings.v.roomLayout picks one ("classic" = room()).
  // A small switcher next to the Rounds bar flips between them on every room page.
  const roomLayouts = () => Object.entries(window.RoomLayouts || {});
  let urlLayout = new URLSearchParams(location.search).get("layout"); // ?layout=B: this page load only (screenshots)
  const failedLayouts = new Set(); // a layout that threw while mounting is skipped (Classic instead) until a reload
  // the saved choice if it's loaded and works; else the first loaded layout (old choices like "A" were retired);
  // "classic" (room()) only when no layout module is loaded
  // per room (Manager → Panels → Look & layout): this room's own choice, else the panel's; "classic" = tiles,
  // "list" = the same as a compact list (both drawn by room() below), else a RoomLayouts key ("G" = cards & orbs)
  const roomChoice = () => { const S = window.Settings && Settings.v; return (S && S.roomLayouts && S.roomLayouts[App.view]) || (S && S.roomLayout); };
  const roomStyle = () => (roomChoice() === "list" ? "list" : "tiles");
  const layoutKey = () => {
    const ok = (k) => k && Object.hasOwn(window.RoomLayouts || {}, k) && !failedLayouts.has(k);
    const k = urlLayout || roomChoice();
    if (k === "classic" || k === "list" || ok(k)) return k === "list" ? "classic" : k;

    return roomLayouts().map(([key]) => key).find(ok) || "classic";
  };
  let mountedLayout = null; // { key, room, impl }
  function leaveLayout() { if (mountedLayout) { try { mountedLayout.impl.unmount && mountedLayout.impl.unmount(); } catch (e) { console.warn(e); } mountedLayout = null; } }
  App.setRoomLayout = (k) => { urlLayout = null; Settings.set("roomLayout", k); };
  function layoutSwitch(show) {
    let el = document.getElementById("layout-switch");
    // (nothing to choose between — or this room has its own layout from the Manager)
    if (!show || roomLayouts().length < 2 || ((window.Settings && Settings.v.roomLayouts) || {})[App.view]) { if (el) el.hidden = true; return; }
    if (!el) { el = document.createElement("div"); el.id = "layout-switch"; document.body.appendChild(el); }
    const cur = layoutKey(), opts = roomLayouts().map(([k, l]) => [k, l.name || k]);
    const html = `<span>${UI.esc(T("rooms.switch"))}</span>${opts.map(([k, n]) => `<button class="${k === cur ? "cur" : ""}"${Acts.on("app.setRoomLayout", k)}>${UI.esc(n)}</button>`).join("")}`;
    if (el.innerHTML !== html) el.innerHTML = html;
    el.hidden = false;
  }

  // ---------- render ----------
  App.go = (v) => { if (v !== App.view) App.viewAt = Date.now(); App.view = v; App.thermoEdit = false; App.render(); };
  // Weather effects: in front of the cards on Home, behind them on every other page; always under overlays
  // (alarm, keypad, settings, popups, camera full screen). The sky stops on Cameras and while a camera is full screen
  // (cameras.js calls this too) — the video needs the panel's GPU; Music holds it itself (music.js).
  // While Settings → Weather effects previews one, the effects go above the settings window and nothing holds them.
  App.syncSky = () => {
    const root = document.documentElement, test = App.fxTest != null;
    // (in front of the Home cards unless this panel puts the effects behind them: Manager → Look & layout)
    root.classList.toggle("fx-front", App.view === "home" && Settings.v.effects.place !== "behind");
    root.classList.toggle("fx-test", test);
    if (App.sky) { App.sky.camHold = !test && (App.view === "cameras" || !!document.querySelector(".cam-full")); App.sky.preview = test; App.sky.front = !test && App.view === "home" && Settings.v.effects.place !== "behind"; }
  };
  App.render = () => {
    if (App.dragging || !document.getElementById("main")) return; // don't rebuild the dial under the finger
    // the room bar's place (Manager → Panels → Look & layout): bottom (default), top, left, right
    const at = dockAtNow(), root = document.documentElement;
    for (const k of ["bottom", "top", "left", "right"]) root.classList.toggle(`dock-${k}`, k === at);
    // a new panel (dockOff, set by the Manager): no room bar at all — only the settings gear (theme.css html.dock-off)
    root.classList.toggle("dock-off", Settings.v.dockOff === true);
    // how it's drawn (theme.css): its style, its names (unset: the style's own — a rail has none), auto-hide
    const ds = ["rail", "segmented", "tabs", "chips", "split"].includes(Settings.v.dockStyle) ? Settings.v.dockStyle : "pill";
    for (const k of ["pill", "rail", "segmented", "tabs", "chips", "split"]) root.classList.toggle(`dock-style-${k}`, k === ds);
    root.classList.toggle("dock-nolabels", typeof Settings.v.dockLabels === "boolean" ? !Settings.v.dockLabels : ds === "rail");
    root.classList.toggle("dock-autohide", Settings.v.dockAutoHide === true);

    const test = window.TestViews && Object.hasOwn(TestViews, App.view) ? TestViews[App.view] : null;
    // alerts first (Hubitat's level 4–5, alarm.js): a view that fails below must never keep one off the screen
    const alerts = Alarm.overlay(), al = document.getElementById("alerts");
    if (al && alerts !== App.alertsHtml) { al.innerHTML = App.alertsHtml = alerts; if (Alarm.afterOverlay) Alarm.afterOverlay(al); }   // (#alerts comes with App.start)
    if (!test && App.view !== "home" && App.view !== "cameras" && !H.rooms().some((r) => r.id === App.view)) App.view = "home"; // room was hidden
    App.syncSky();
    if (App.sky) { const sp = App.skyPlace(); if ((sp && sp.id) !== App.skyAt) App.applyEffects(false); }   // (another page: maybe another place)
    dock();
    // Only replace what changed: keeps taps/swipes working and camera streams connected between data refreshes.
    const main = document.getElementById("main"), sameView = App.view === App.lastView;
    const isRoom = !test && App.view !== "home" && App.view !== "cameras";
    const rg = isRoom ? roomGrid(App.view) : null;   // (this room has its own grid of cards)
    layoutSwitch(isRoom && !rg);
    const lk = isRoom && !rg ? layoutKey() : "classic";
    let layoutOk = false;
    if (isRoom && lk !== "classic") {
      leaveTest();
      const impl = RoomLayouts[lk];
      try {
        if (!mountedLayout || mountedLayout.key !== lk || mountedLayout.room !== App.view) {
          leaveLayout(); main.innerHTML = ""; App.mainHtml = null; shownParts = null; main.className = `roomlayout layout-${lk}`;
          mountedLayout = { key: lk, room: App.view, impl }; impl.mount(main, App.view);
        } else if (impl.update) impl.update(App.view);
        layoutOk = true;
      } catch (e) {
        // a broken layout must never leave a blank room page: drop it (Classic until reload) and draw Classic now
        console.warn(`[app] room layout ${lk} failed — using Classic:`, e);
        failedLayouts.add(lk); leaveLayout(); main.innerHTML = ""; App.mainHtml = null;
      }
      if (layoutOk) { App.lastView = App.view; return; }
    }
    leaveLayout();
    if (test) {
      try {
        if (!sameView || mountedTest !== test) {
          leaveTest(); main.innerHTML = ""; App.mainHtml = null; shownParts = null; main.className = "testview";
          mountedTest = test; test.mount(main);
        } else if (test.update) test.update();
      } catch (e) {
        console.warn(`[app] view ${App.view} failed:`, e);
        if (mountedTest === test && !main.childElementCount) mountedTest = null; // mount failed: try again next render
      }
      App.lastView = App.view;
      return;
    }
    leaveTest();
    const keepCams = App.view === "cameras" && sameView && !App.camsDirty;
    if (!keepCams) {
      const isHome = App.view === "home";
      const html = isHome ? home() : App.view === "cameras" ? (window.Cameras ? Cameras.page() : "") : rg ? roomGridHtml(H.room(App.view), rg) : room(H.room(App.view));
      if (html !== App.mainHtml || !sameView) {
        // mainHtml "" = forced full redraw; null = re-check the parts (a part marked null is redrawn — the dial
        // after a drag changed it in place)
        if ((isHome || rg) && sameView && App.mainHtml !== "" && patchHome(main)) App.mainHtml = html;
        else { main.innerHTML = App.mainHtml = html; if (sameView) main.querySelectorAll(".fade-in").forEach((e) => e.classList.remove("fade-in")); }
      }
      shownParts = isHome ? nextParts : null; shownGrid = isHome || rg ? nextGrid : null; shownLayout = isHome ? homeLayout() : rg ? "custom" : null;
      const g = isHome ? customGrid() : rg;
      main.className = (App.view === "home" ? `home lay-${homeLayout()}`   // i18n-ok (class names)
        : App.view === "cameras" ? "camview"
        : rg ? "roomview lay-custom" : `roomview${roomStyle() === "list" ? " room-list" : ""}`) + (g && g.v === 2 ? " fine" : "") + (g && g.sp ? " sp" : "");
      if (window.Grid) { Grid.frame(main, g); if (g) Grid.fit(main); }
      if (isHome && !g) UI.fitCal(main);
    }
    App.camsDirty = false;
    App.lastView = App.view;
  };

  // Re-check the generated camera file (cameras + Protect live views, written by protect_to_go2rtc.py) every
  // 3 minutes and apply changes without a reload. Later the dashboard service pushes these over MQTT instead.
  let camFile = null;
  async function checkCameraFile() {
    try {
      const r = await fetch(`shared/protect-cameras.js?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) return;
      const text = await r.text();
      if (camFile !== null && text !== camFile) {
        // (run as a script of this page — no eval, the page's CSP: it sets HUBITAT.cameras and window.PROTECT_LIVEVIEWS)
        // (a load that failed — the file changing again meanwhile, a network blip: camFile isn't moved on, so the next
        // check tries again)
        const ran = await new Promise((done) => {
          const sc = document.createElement("script");
          sc.src = `shared/protect-cameras.js?t=${Date.now()}`;
          sc.onload = () => { sc.remove(); done(true); };
          sc.onerror = () => { sc.remove(); done(false); };
          document.head.appendChild(sc);
        });
        if (!ran) return;
        S.cameras = window.HUBITAT.cameras;
        if (window.Cameras && App.view === "cameras") Cameras.rerender();
      }
      camFile = text;
    } catch {} // offline / file missing: keep what we have
  }

  // what the generated HTML's buttons do (acts.js — v2.5.1: no handler in the markup, the page's CSP)
  Acts.add({
    "app.mode": (m, id) => App.mode(m, id), "app.fan": (m, id) => App.fan(m, id), "app.bump": (d, id) => App.bump(d, id),
    "app.lockAll": (ids) => (ids == null ? H.lockAll() : ids.forEach((i) => H.lock(i))),
    "app.lock": (id) => H.lock(id), "app.unlock": (id) => H.unlock(id), "app.toggle": (id) => H.toggle(id),
    "app.windowsPopup": () => UI.windowsPopup(), "app.doorsPopup": () => UI.doorsPopup(),
    "app.setFan": (id, s) => H.setFan(id, s), "app.setShade": (id, l) => H.setShade(id, l), "app.roomOptions": (rid) => Settings.roomOptions(rid),
    "app.go": (id) => App.go(id), "app.endReorder": () => App.endReorder(), "app.settings": () => Settings.show(),
    "app.dockOpen": () => App.dockOpen(), "app.setRoomLayout": (k) => App.setRoomLayout(k),
  });
  App.checkCameraFile = checkCameraFile;

  // the version running (the container's image tag), small in the lower-left corner — to check a panel got an update
  function versionTag() {
    const v = window.PANEL_CONFIG && PANEL_CONFIG.version;
    if (!v || window.PANEL_DESIGN === true || document.getElementById("ver-tag")) return;
    const t = document.createElement("div");
    const rel = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(String(PANEL_CONFIG.release || "")) ? `v${PANEL_CONFIG.release} · ` : "";
    t.id = "ver-tag"; t.textContent = rel + String(v).slice(0, 40);
    document.body.append(t);
  }
  // A panel address the Manager hasn't set up (round 2): only the Manager creates panels, so the service answers
  // GET /api/panel/<id> with 404 {"error": "not-set-up"} (service/server.py). The page then stays blank — only the
  // settings gear and one line saying where to add it; it looks again every minute and reloads once it's there.
  // (Any other trouble — the service down, an older service — changes nothing: the page works from its copy.)
  async function checkSetUp() {
    if (window.PANEL_DESIGN === true || !window.PanelStore) return;
    let gone = false;
    try {
      const r = await fetch(`/api/panel/${encodeURIComponent(PanelStore.id)}`, { cache: "no-store" });
      if (r.status === 404) gone = ((await r.json().catch(() => ({}))) || {}).error === "not-set-up";
    } catch { return; }
    if (!gone) { if (App.notSetUp) location.reload(); return; }
    if (!App.notSetUp) {
      App.notSetUp = true;
      document.documentElement.classList.add("not-set-up");
      const n = document.createElement("div");
      n.id = "not-set-up";
      n.textContent = T("panel.notSetUp", { id: String(window.PANEL || PanelStore.id).slice(0, 32) });
      document.body.append(n);
      if (App.sky) App.sky.paused = true;
    }
  }
  App.start = () => {
    T.load();   // (the panel's language from its saved settings, when the page wasn't told: strings.js)
    checkSetUp();
    setInterval(checkSetUp, 60000);
    versionTag();
    checkCameraFile();
    setInterval(checkCameraFile, 3 * 60 * 1000);
    document.body.classList.add("sky-on");
    document.body.insertAdjacentHTML("afterbegin", `<canvas id="sky"></canvas><div class="land" id="land"></div><canvas id="fx"></canvas>`);
    document.body.insertAdjacentHTML("beforeend", `<div id="alerts"></div><span class="chip lock-badge">${icon("lock", 16)} ${UI.esc(T("panel.childLock"))}</span>
      <button class="gear"${Acts.on("app.settings")} title="${UI.esc(T("dock.settings"))}">${icon("settings", 22)}</button>`);
    App.sky = new Sky({ sky: document.getElementById("sky"), fx: document.getElementById("fx"), mountains: document.getElementById("land"), skyFps: 12, fxFps: 30 });
    if (window.Cameras) {
      Cameras.rerender = () => { App.camsDirty = true; App.render(); }; // camera view/tab changed → rebuild the grid
      Cameras.onTimeout = () => App.go("home");
      Cameras.go2rtc = Settings.go2rtc();
      // Hubitat rules: MQTT panel/skypane/show {"view":"Doors"} or {"camera":"Front Door Doorbell","seconds":60}
      H.subscribe(`panel/${H.kiosk()}/show`, (msg) => Cameras.onShow(msg)); // JSON or a plain view name; default time from Settings
    }
    UI.render = App.render;
    // (a font that loads later changes the calendar's row heights: whole rows again)
    if (document.fonts) document.fonts.addEventListener("loadingdone", () => { if (App.view === "home") UI.fitCal(document.getElementById("main")); });
    UI.cal.mode = "week";
    Settings.applyLook(); // background, theme sky palette, fonts
    H.onChange(App.render);
    Weather.onChange(() => { App.render(); App.applyEffects(false); }); // a new weather code → its effect
    setInterval(() => { App.applyEffects(false); if (Settings.open && Settings.tab === "fx") Settings.render(); }, 60000);
    App.applyEffects(true);
    Alarm.updateLed();
    // Animation gate: FreeKiosk's screensaver is only an overlay, so the page would keep animating (sky, Room Test
    // views) under it all night. While its state says screensaver up or screen off, <html class="anim-paused">
    // pauses every view's CSS animations and the sky stops drawing.
    // another screen saved this panel's settings/views/places on the dashboard service → fetch them (store.js)
    // (panel ids are case-insensitive on the service: /K_Office and /k_office are the same panel → lowercase topic)
    if (window.PanelStore) H.subscribe(`dashboard/panel/${PanelStore.id.toLowerCase()}/changed`, (msg) => { try { PanelStore.remoteChanged(JSON.parse(msg)); } catch {} });
    // the Manager's "Test this panel now" (only the panel itself runs it: App.perfTest checks H.isPanel)
    if (window.PanelStore) H.subscribe(`dashboard/panel/${PanelStore.id.toLowerCase()}/perftest`, () => App.perfTest());
    // (during a performance test / the benchmark the screensaver is woken instead: the test keeps the screen awake)
    const testing = () => App.perfTesting || (window.Bench && Bench.running);
    const animPause = (paused) => {
      if (paused && testing()) { App.wakeKiosk(); paused = false; }
      document.documentElement.classList.toggle("anim-paused", paused); if (App.sky) App.sky.paused = paused;
    };
    App.animPause = animPause;
    H.subscribe(`freekiosk/${H.kiosk()}/state`, (msg) => {  // FreeKiosk publishes this every ~20–30 s
      if (!H.isPanel) return; // it's the panel's screensaver: a laptop/phone viewing the page keeps animating
      let s; try { s = JSON.parse(msg); } catch { return; }
      const scr = s && s.screen; if (!scr) return;
      animPause(!!scr.screensaverActive || scr.on === false);
    });
    // a touch on the page means someone is looking: resume at once instead of waiting for the next state message
    document.addEventListener("pointerdown", () => animPause(false), true);
    // Reload by itself when (a) the dashboard service was updated (new version, an Unraid update) or (b) the house
    // model changed (devices added / renamed / moved in Hubitat: the bridge announces "hubitat/model") — (b) only once
    // nobody has touched the screen for 2 minutes ((a) sooner: below) (unsaved settings survive a reload — store.js keeps them). Checked
    // every minute. Never while the alarm is armed, has alerts or its keypad is open (that state lives only in this
    // page), nor while something is up on screen without a touch: a camera full screen (e.g. the doorbell), a popup, Music.
    const cfg = window.PANEL_CONFIG, mine = cfg && cfg.version, myModel = window.HUBITAT && HUBITAT.version;
    let touched = Date.now(), modelWanted = null;
    document.addEventListener("pointerdown", () => { touched = Date.now(); }, true);
    // Settings → Panel → "Back to Home after": a room / camera page left alone goes back to Home (never Music, and
    // not while Settings, a popup, a full-screen camera or a thermostat drag is up — those have their own endings)
    setInterval(() => {
      const after = +Settings.v.homeAfter || 0;
      if (!after || App.view === "home" || App.view === "music" || App.dragging || (window.Settings && Settings.open) || testing()) return;
      if (document.querySelector(".cam-full, .popup-host.show")) return;
      // (from the later of the last touch and when this page opened: a page opened by a rule or a swipe gets its time)
      if (Date.now() - Math.max(touched, App.viewAt || 0) >= after * 1000) { App.endReorder(); App.go("home"); }
    }, 1000);
    const reloadedFor = () => { try { return sessionStorage.getItem("panel.reloadedForModel"); } catch { return null; } };
    // an update is ready (a new version on the service, or devices changed in Hubitat): a "Refresh" button on screen at
    // once (like a Sonos panel) — and a reload by itself once nobody has touched it for 2 minutes
    let newVersion = null;
    const reloadNow = () => { if (modelWanted) try { sessionStorage.setItem("panel.reloadedForModel", modelWanted); } catch {} location.reload(); };
    const refreshPill = () => {
      if (window.PANEL_DESIGN === true || !(newVersion || modelWanted)) return;
      let b = document.getElementById("refresh-pill");
      if (!b) {
        b = document.createElement("button");
        b.id = "refresh-pill"; b.className = "refresh-pill glass"; b.type = "button";
        b.addEventListener("click", (e) => { e.stopPropagation(); if (!testing()) reloadNow(); });
        document.body.append(b);
      }
      b.innerHTML = `${icon("refresh", 18)}<span>${UI.esc(T(newVersion ? "panel.newVersion" : "panel.devicesChanged"))}</span><b>${UI.esc(T("panel.refresh"))}</b>`;
    };
    H.subscribe("hubitat/model", (msg) => {
      let v; try { v = JSON.parse(msg).version; } catch { return; }
      // at most one reload per new model: if the page still gets the old file after it, no reload loop
      if (typeof v === "string" && v !== myModel && v !== reloadedFor()) { modelWanted = v; refreshPill(); }
      // the owner just changed what a device is (Settings → Rooms → Devices): show it as soon as Settings is closed
      if (modelWanted && App.reloadForModel && !(window.Settings && Settings.open) && !testing()) location.reload();
    });
    App.reloadIfNewModel = () => { if (modelWanted && App.reloadForModel) location.reload(); };
    // a change that didn't alter the model must not make a much later, unrelated change reload mid-use
    setInterval(() => { if (App.reloadForModel && !(window.Settings && Settings.open)) App.reloadForModel = false; }, 90000);
    setInterval(async () => {
      // is there a new version? (every minute, touched or not: the button shows at once)
      if (mine && mine !== "dev" && !newVersion && window.PANEL_DESIGN !== true) {
        try {
          const r = await fetch("/api/health", { cache: "no-store" });
          const v = r.ok ? (await r.json()).version : null;
          if (v && v !== mine) { newVersion = v; console.log(`[app] dashboard updated ${mine} → ${v}: Refresh button up`); }
        } catch { /* service restarting: try again next minute */ }
      }
      refreshPill();
      const A = window.Alarm, busy = (!!A && (A.isArmed() || A.alerts.length > 0 || A.keypadOpen)) ||
        !!document.querySelector(".cam-full, .popup-host.show") || App.view === "music" || testing();   // (a reload would end a test)
      if (Date.now() - touched < 120000 || busy || !modelWanted) return;
      console.log(`[app] house model changed ${myModel} → ${modelWanted}: reloading`);
      reloadNow();
    }, 60000);
    // A new version of the dashboard service (v2.3.2): the page and the bridge must agree (e.g. the PIN tickets for
    // dismissing a level 4–5 alert), so don't wait for 2 untouched minutes — reload at the first quiet moment (10 s
    // without a touch), or after 5 minutes whatever happens. Never while a PIN pad, a dialog / pop-up, the alarm keypad,
    // Settings or a full-screen camera is up, nor during a test. Once per version (a page that still gets the old files
    // after the reload only shows the Refresh button). Not for VERSION "dev" (the check above skips it).
    const reloadedForVersion = () => { try { return sessionStorage.getItem("panel.reloadedForVersion"); } catch { return null; } };
    let newSince = 0;
    setInterval(() => {
      if (!newVersion || newVersion === reloadedForVersion() || testing()) return;
      if (!newSince) newSince = Date.now();
      const A = window.Alarm;
      if (document.querySelector(".popup-host.show, .cam-full, .pp, .pp-confirm") || (A && A.keypadOpen) || (window.Settings && Settings.open)) return;
      if (Date.now() - touched < 10000 && Date.now() - newSince < 300000) return;
      console.log(`[app] dashboard updated ${mine} → ${newVersion}: reloading`);
      try { sessionStorage.setItem("panel.reloadedForVersion", newVersion); } catch {}
      reloadNow();
    }, 2000);
    // ?view=rt1 (or a room id, "cameras") opens that view directly — handy for screenshots and testing
    const startView = new URLSearchParams(location.search).get("view");
    if (startView) App.go(startView);
  };

  window.App = App;
})();
