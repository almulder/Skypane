// The full benchmark (release 2). The Manager asks over MQTT
// (dashboard/panel/<id>/bench, Panels → Weather effects → "Run the full benchmark"); only the real panel runs it.
// About 5 minutes ("thorough", the default) or 1½ ("quick") on a test stage over the page. A touch doesn't stop it
// (children, FreeKiosk's wake acting like a tap) — the Manager's Stop does (MQTT {"stop": true}):
//   0 checks       refresh rate on an empty screen (a 30 Hz battery saver shows up here), which video it can decode
//   1 baseline     12 static cards
//   2 UI work      the same cards changing 20 times a second
//   3 sky ramp     the real weather effects, lightest to heaviest, until frames run late → the panel's score, in the
//                  same points as sky.js loadScore (so the weather levels fit straight into the budget)
//   4 drawings     4 animated drawings, then 12 CSS animations
//   5 cameras      go2rtc's test video (bench-360: no camera is touched) 1 → 2 → 4 → 6 → 9 → 12 → 16 tiles until
//                  it can't keep up, then one 1080p tile
//   6 warm repeat  (thorough: 2 minutes under load first) the heaviest smooth effect again: slower once warm?
// "Smooth" = the average frame time at most 1.25 × the refresh interval and under 1 % of frames over 50 ms. Each
// element's cost is its share of the average frame time (ms) on this panel; the page budget is the room between the
// empty screen and "smooth". The layout builder's load meter uses them (builder.js). Saved with this device's numbers
// (App.perf.bench); a run that was interrupted saves nothing but why (App.perf.benchFail: the Manager asks for a
// new run). While it runs the Manager shows each step live (report → the service, in memory only).
(function () {
  const H = Home;
  const B = { running: false, stop: false };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const r1 = (v) => Math.round(v * 10) / 10;
  const LOAF = window.PerformanceObserver && (PerformanceObserver.supportedEntryTypes || []).includes("long-animation-frame") ? "long-animation-frame"
    : window.PerformanceObserver && (PerformanceObserver.supportedEntryTypes || []).includes("longtask") ? "longtask" : null;

  // every frame's time for `ms` (after the caller's warm-up): median, p95, p99, the worst, % over 50 ms; with videos
  // also their dropped frames and the slowest one's real frame rate (requestVideoFrameCallback where there is one)
  function sample(ms, videos = []) {
    return new Promise((resolve) => {
      const d = [], q0 = videos.map((v) => (v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null)), vf = videos.map(() => 0);
      let t0 = 0, last = 0, done = false, block = 0, obs = null;
      videos.forEach((v, i) => { if (v.requestVideoFrameCallback) { const cb = () => { if (done) return; vf[i]++; v.requestVideoFrameCallback(cb); }; v.requestVideoFrameCallback(cb); } });
      if (LOAF) try {
        obs = new PerformanceObserver((l) => l.getEntries().forEach((e) => { block += e.blockingDuration != null ? e.blockingDuration : Math.max(0, e.duration - 50); }));
        obs.observe({ type: LOAF, buffered: false });
      } catch { obs = null; }
      const guard = setTimeout(() => finish(true), ms + 3000);   // (no frames: the screen went off)
      function finish(hidden) {
        if (done) return; done = true; clearTimeout(guard); if (obs) obs.disconnect();
        if (hidden || d.length < 10) return resolve(null);
        const s = d.slice().sort((a, b) => a - b), p = (q) => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
        const secs = (last - t0) / 1000, out = { p50: r1(p(0.5)), p95: r1(p(0.95)), p99: r1(p(0.99)), max: Math.round(s[s.length - 1]),
          jank: r1((100 * d.filter((x) => x > 50).length) / d.length), fps: Math.round(d.length / secs), block: Math.round(block),
          mean: Math.round((100 * d.reduce((a, b) => a + b, 0)) / d.length) / 100 };
        if (videos.length) {
          let tot = 0, drop = 0;
          videos.forEach((v, i) => { const a = q0[i], b = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
            if (a && b) { tot += b.totalVideoFrames - a.totalVideoFrames; drop += b.droppedVideoFrames - a.droppedVideoFrames; } });
          out.dropped = tot > 0 ? Math.round((100 * drop) / tot) : null;
          out.vfps = videos.some((v) => v.requestVideoFrameCallback) ? Math.round(Math.min(...vf) / secs) : null;
        }
        resolve(out);
      }
      const tick = (t) => {
        if (done) return;
        if (!t0) { t0 = last = t; } else { d.push(t - last); last = t; }
        if ((t - t0 < ms) && !B.stop) requestAnimationFrame(tick); else finish(B.stop);
      };
      requestAnimationFrame(tick);
    });
  }

  // which video it can decode (MediaCapabilities): 2 = smoothly in hardware, 1 = yes, 0 = no
  async function codecs() {
    const mc = navigator.mediaCapabilities, out = {};
    const ask = async (k, contentType, width, height) => {
      try {
        const r = await mc.decodingInfo({ type: "media-source", video: { contentType, width, height, bitrate: width > 2000 ? 16e6 : 4e6, framerate: 25 } });
        out[k] = !r.supported ? 0 : r.smooth && r.powerEfficient ? 2 : 1;
      } catch { /* (unknown) */ }
    };
    if (!mc || !mc.decodingInfo) return out;
    await Promise.all([ask("h264", 'video/mp4; codecs="avc1.640028"', 1920, 1080), ask("h265", 'video/mp4; codecs="hvc1.1.6.L120.90"', 1920, 1080),
      ask("h265_4k", 'video/mp4; codecs="hvc1.1.6.L153.90"', 3840, 2160)]);
    return out;
  }

  // the test stage (over the page; see-through so the sky shows) and its pieces
  let stage = null;
  const say = (t, pct) => { if (!stage) return; stage.querySelector(".bn-what").textContent = t; if (pct != null) stage.querySelector(".bn-bar i").style.width = `${Math.round(pct)}%`; };
  const show = (html) => { if (stage) stage.querySelector(".bn-stage").innerHTML = html; };
  const cardsHtml = (n) => `<div class="bn-grid">${Array.from({ length: n }, (_, i) => `<div class="bn-card"><span class="bn-ic">${window.icon ? icon(["bulb", "lock", "fan", "thermo", "door", "plug"][i % 6], 30) : ""}</span>`
    + `<b>${UI.esc(T("bn.card", { n: i + 1 }))}</b><small class="bn-v">${UI.esc(T("thing.off"))}</small></div>`).join("")}<div class="bn-card bn-clock"><b class="bn-t">12:00</b></div></div>`;
  function churn() {   // 20 small changes a second, like busy live values
    let n = 0;
    return setInterval(() => {
      const cards = stage ? stage.querySelectorAll(".bn-card:not(.bn-clock)") : [];
      if (!cards.length) return;
      const c = cards[n++ % cards.length];
      c.classList.toggle("on"); c.querySelector(".bn-v").textContent = c.classList.contains("on") ? T("bn.onPct", { n: n % 100 }) : T("thing.off");
      const t = stage.querySelector(".bn-t"); if (t) t.textContent = `12:${String(n % 60).padStart(2, "0")}`;
    }, 50);
  }
  const artHtml = () => {
    const G = window.RoomLayouts && RoomLayouts.G, keys = G && G.artKeys ? G.artKeys.slice(0, 4) : [];
    return `<div class="bn-art">${keys.map((k) => `<div class="bn-artbox">${G.artPreview(k)}</div>`).join("")}</div>`;
  };
  const cssHtml = () => `<div class="bn-anim">${Array.from({ length: 12 }, (_, i) => `<i style="animation-delay:${-i * 0.25}s"></i>`).join("")}</div>`;
  const fx = (id) => { App.fxTest = id; App.syncSky(); App.applyEffects(false); };

  // the weather effects to step through: one near each of these scores (lightest first)
  function skySteps() {
    const all = Sky.CONDITIONS.filter((c) => c.id !== "none").map((c) => [c, Sky.loadScore(c)]).sort((a, b) => a[1] - b[1]);
    const picked = [];
    for (const target of [40, 150, 300, 500, 700, 900, 1200, 99999]) {
      const best = all.reduce((m, x) => (Math.abs(x[1] - target) < Math.abs(m[1] - target) ? x : m), all[0]);
      if (!picked.includes(best)) picked.push(best);
    }
    return picked;
  }

  // video tiles of the test stream, waiting until each shows frames (or `wait` ms)
  async function tiles(n, stream, wait = 6000) {
    show(`<div class="bn-cams" style="--n:${Math.ceil(Math.sqrt(n))}">${Array.from({ length: n }, () => `<div class="bn-cam">${Cameras.testTile(stream)}</div>`).join("")}</div>`);
    const t0 = Date.now();
    for (;;) {
      const vids = stage ? [...stage.querySelectorAll(".bn-cams video")] : [];
      if (vids.length === n && vids.every((v) => v.readyState >= 2 && v.currentTime > 0)) return vids;
      if (Date.now() - t0 > wait || B.stop) return vids.filter((v) => v.readyState >= 2 && v.currentTime > 0);
      await sleep(250);
    }
  }

  // why a test can't start right now ("" = it can): never over something that matters (the alarm keypad, an alert, a
  // camera — e.g. the doorbell) and not while nothing is drawn (screen off, the kiosk's screensaver). Said on the
  // panel, so a test that doesn't start isn't a mystery.
  B.blocked = () => (!H.isPanel ? "" : B.running || (window.App && App.perfTesting) ? T("bn.why.running")
    : document.hidden ? T("bn.why.hidden") : Alarm.keypadOpen ? T("bn.why.keypad") : Alarm.alerts.length ? T("bn.why.alert")
    : window.Settings && Settings.open ? T("bn.why.settings") : document.querySelector(".cam-full") ? T("bn.why.camera") : "");
  B.refused = (what, why) => {
    document.querySelectorAll(".bn").forEach((n) => n.remove());
    const n = document.createElement("div");
    n.className = "bn done";
    n.innerHTML = `<div class="bn-top"><b>${UI.esc(T("bn.didntStart", { what }))}</b><span>${UI.esc(T("bn.whyDot", { why }))}</span><small>${UI.esc(T("bn.tapRetry"))}</small></div>`;
    n.addEventListener("click", () => n.remove());
    document.body.append(n);
    setTimeout(() => n.remove(), 30000);
  };
  // keep the screen awake for a test: the kiosk's screensaver (FreeKiosk, after a minute untouched) would cover the
  // page and pause the animations. Woken now (if it's up) and every 15 s; a "screensaver on" report meanwhile is
  // answered with another wake (app.js animPause).
  let awakeTimer = null;
  B.awake = (on) => {
    clearInterval(awakeTimer); awakeTimer = null;
    if (!on || !H.isPanel) return;
    App.wakeKiosk(); App.animPause(false);
    awakeTimer = setInterval(App.wakeKiosk, 15000);
  };
  // what the Manager shows while it runs (the service keeps it in memory only: PATCH /api/panel/<id>/bench) — the
  // step, how far, a live frame rate — and at the end what happened
  let lastSent = 0, pendingT = null;
  function report(o, now) {
    if (!window.PanelStore) return;
    const send = () => {
      lastSent = Date.now(); pendingT = null;
      fetch(`/api/panel/${encodeURIComponent(PanelStore.id)}/bench`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }).catch(() => {});
    };
    clearTimeout(pendingT);
    if (now || Date.now() - lastSent > 700) send(); else pendingT = setTimeout(send, 700);
  }
  // the heaviest weather effect of each level (sky.js): what "effects up to Medium" can cost at most
  const levelTop = () => [0, 1, 2, 3, 4].map((l) => (l ? Math.max(0, ...Sky.CONDITIONS.filter((c) => Sky.load(c) === l).map((c) => Sky.loadScore(c))) : 0));

  // mode "thorough" (the default, about 5 minutes): every measurement twice as long, and 2 minutes under a heavy
  // load before the warm check (a tablet that throttles when hot shows it); "quick": about a minute and a half
  B.run = async (mode) => {
    const REP = mode === "quick" ? 1 : 2, SOAK = mode === "quick" ? 0 : 120000;
    if (!H.isPanel) return;
    const why = B.blocked();
    if (why) {
      console.warn("[bench] not started:", why);
      report({ state: "refused", step: "screen", pct: 0, why }, true);   // (the Manager says why too)
      if (!document.hidden) B.refused(T("bn.theBenchmark"), why);
      return;
    }
    report({ state: "starting", step: "screen", pct: 0, text: T("bn.gettingReady") }, true);
    B.running = true; B.stop = false;
    B.awake(true);
    App.endPreview();
    if (window.UI && UI.close) UI.close();
    App.go("home");
    let wake = null;
    try { wake = navigator.wakeLock ? await navigator.wakeLock.request("screen") : null; } catch {}
    document.querySelectorAll(".bn, .perf-note").forEach((n) => n.remove());
    stage = document.createElement("div");
    stage.className = "bn";
    stage.innerHTML = `<div class="bn-top"><b>${UI.esc(T("bn.title"))}</b><span class="bn-what">${UI.esc(T("bn.starting"))}</span><span class="bn-bar"><i></i></span>`
      + `<small class="bn-hint">${UI.esc(T(REP > 1 ? "bn.about5" : "bn.about90"))}</small></div><div class="bn-stage"></div>`;
    document.body.append(stage);
    document.body.classList.add("benching");
    // touches land on the test screen and do nothing (nothing underneath reacts either); a short note says so
    stage.classList.add("running");
    stage.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const h = stage.querySelector(".bn-hint"); if (h) { h.textContent = T("bn.running"); h.classList.add("flash"); }
    });
    const out = { v: 2, mode: REP > 1 ? "thorough" : "quick", at: Date.now(), screen: `${screen.width}×${screen.height} @${devicePixelRatio}`, cores: navigator.hardwareConcurrency || 0,
      mem: navigator.deviceMemory || 0, costs: {}, sky: [], cams: [] };
    // where it is (for the panel's own bar and the Manager's live view)
    const P = { step: "screen", pct: 0, text: "", fps: null, n: 0, fx: null };
    // (fx: the weather effect on screen, so the layout builder's copy shows the same one)
    const step = (key, text, pct, n = 0, fxId = null) => { Object.assign(P, { step: key, text, pct, n, fps: null, fx: fxId }); say(text, pct); report({ state: "running", ...P }); };
    const live = (r) => { if (r && r.mean) { P.fps = Math.round(1000 / r.mean); report({ state: "running", ...P }); } return r; };
    // why it can't go on ("" = it can): any of these and nothing is saved — the Manager says to run it again
    const gone = () => (B.stop ? T("bn.why.fromManager") : document.hidden ? T("bn.why.screenOff")
      // (v3.0.3: the sky also pauses while a PIN pad is open — that is not the screensaver)
      : document.documentElement.classList.contains("pin-open") ? T("bn.why.pinOpen") : App.sky && App.sky.paused ? T("bn.why.saver")
      : Alarm.alerts.length ? T("bn.why.alertUp") : "");
    let stopWhy = "";
    const check = (r) => { const g = gone(); if (g || !r) { stopWhy = g || T("bn.why.screenStopped"); throw new Error("stopped"); } return live(r); };
    let timer = null;
    try {
      // 0: the empty screen
      step("screen", T("bn.step.screen"), 2);
      fx("none"); show("");
      await sleep(1200);
      const [e0, cod] = await Promise.all([sample(REP * 2500), codecs()]);
      const empty = check(e0);
      const iv = empty.p50, m0 = empty.mean;   // the refresh interval; the empty screen's average frame time
      B.iv = iv;
      out.refresh = Math.round(1000 / iv); out.iv = Math.round(iv * 100) / 100; out.empty = Math.round(m0 * 100) / 100;
      out.codecs = cod;
      // smooth = on average at most a quarter of a frame late (≈ 48 fps on a 60 Hz screen) and no big hitches —
      // averages, not the slowest frames: a 60 Hz screen only shows 16.7 or 33.3 ms, so the slowest 5 % jump straight
      // from one to the other while the average grows smoothly with the work
      const LIMIT = 1.25 * iv;
      out.limit = Math.round(LIMIT * 100) / 100;
      const ok = (r) => r && r.mean <= LIMIT && r.jank < 1;
      const ms = (a, n) => Math.max(0, Math.round((1000 * a) / n) / 1000);   // ms of average frame time, per item

      // 1 + 2: cards, still and busy
      step("cards", "12 cards", 6);
      show(cardsHtml(12));
      await sleep(600);
      const base = check(await sample(REP * 3000));
      step("busy", T("bn.step.busy"), 11);
      timer = churn();
      await sleep(400);
      const ui = check(await sample(REP * 3000)); clearInterval(timer); timer = null;
      out.base = { p50: base.p50, p95: base.p95, mean: base.mean }; out.ui = { p95: ui.p95, mean: ui.mean };
      out.costs.card = ms(base.mean - m0, 12);
      out.costs.upd = ms(ui.mean - base.mean, 20);   // (per change a second)

      // 3: the weather effects, lighter to heavier, until frames run late (a late step is measured twice: one hiccup
      // isn't the limit)
      show("");
      const steps = skySteps();
      let pass = null, fail = null, knee = null;
      for (let i = 0; i < steps.length; i++) {
        const [c, score] = steps[i];
        step("weather", T("bn.step.weather", { name: c.name }), 16 + (34 * i) / steps.length, 0, c.id);
        fx(c.id);
        await sleep(900);
        let r = check(await sample(REP * 2200));
        if (!ok(r)) { await sleep(300); const again = check(await sample(REP * 2200)); if (again.mean < r.mean) r = again; }
        out.sky.push([Math.round(score), r.p95, r.jank, r.mean]);
        if (ok(r)) { pass = [score, r]; knee = c; } else { fail = [score, r]; break; }
      }
      // what each weather level costs here (ms of average frame time at its heaviest effect; between measured steps
      // linear, past the last one along the last slope)
      const pts = [[0, m0], ...out.sky.map((x) => [x[0], x[3]])];
      const at = (x) => {
        for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [a, b] = [pts[i - 1], pts[i]]; return a[1] + ((b[1] - a[1]) * (x - a[0])) / Math.max(1, b[0] - a[0]); }
        const [a, b] = pts.length > 1 ? pts.slice(-2) : [[0, m0], [1, m0]];
        return b[1] + Math.max(0, (b[1] - a[1]) / Math.max(1, b[0] - a[0])) * (x - b[0]);
      };
      out.fxMs = levelTop().map((x) => ms(at(x) - m0, 1));
      // the score: the weather load (sky.js points) where it stops being smooth — interpolated, or past the heaviest
      // effect when everything was smooth (along the slope; at most 3 × the heaviest)
      const slopeAll = pass ? Math.max(0, (pass[1].mean - m0) / pass[0]) : 0;
      if (!pass) out.frameScore = fail ? Math.round(fail[0] * Math.max(0, Math.min(1, (LIMIT - m0) / Math.max(0.01, fail[1].mean - m0)))) : 0;
      else if (fail) out.frameScore = Math.round(pass[0] + (fail[0] - pass[0]) * Math.min(1, Math.max(0, (LIMIT - pass[1].mean) / Math.max(0.01, fail[1].mean - pass[1].mean))));
      else out.frameScore = Math.round(slopeAll > 0.00005 ? Math.min(3 * pass[0], pass[0] + (LIMIT - pass[1].mean) / slopeAll) : 3 * pass[0]);
      out.capped = !fail && out.frameScore >= 3 * (pass ? pass[0] : 0) ? 1 : 0;
      out.bound = !LOAF || !fail ? "" : fail[1].block / (REP * 2200) > 0.25 ? "main" : "gpu";   // (busy script and layout, or drawing)

      // 4: drawings and CSS animations, over the still sky
      fx("none");
      step("drawings", "4 animated drawings", 52);
      show(artHtml()); await sleep(800);
      const art = check(await sample(REP * 2500));
      step("anim", "12 moving shapes", 56);
      show(cssHtml()); await sleep(600);
      const css = check(await sample(REP * 2500));
      out.costs.art = ms(art.mean - m0, 4);
      out.costs.css = ms(css.mean - m0, 12);

      // 5: cameras (go2rtc's test picture)
      if (window.Cameras && Cameras.go2rtc && Cameras.testTile && Cameras.testTile("bench-360")) {
        let firstFps = null, lastOk = null;
        for (const n of [1, 2, 4, 6, 9, 12, 16]) {
          step("cams", T("bn.step.cams", { n }), 60 + n * 2, n);
          const vids = await tiles(n, "bench-360");
          if (gone()) check(null);
          if (vids.length < n) { if (n === 1) out.noVideo = true; break; }
          await sleep(500);
          const r = check(await sample(REP * 2500, vids));
          if (firstFps == null) firstFps = r.vfps || 25;
          const good = ok(r) && (r.dropped == null || r.dropped < 5) && (r.vfps == null || r.vfps >= 0.8 * firstFps);
          out.cams.push([n, r.mean, r.dropped == null ? -1 : r.dropped, r.vfps == null ? -1 : r.vfps]);
          if (!good) break;
          lastOk = [n, r];
        }
        show("");
        out.liveMax = lastOk ? lastOk[0] : 0;
        if (lastOk) out.costs.tile = ms(lastOk[1].mean - m0, lastOk[0]);
        if (!out.noVideo) {
          step("full", T("bn.step.full"), 92, 1);
          const vids = await tiles(1, "bench-1080", 8000);
          if (gone()) check(null);
          if (vids.length) {
            await sleep(500);
            const r = check(await sample(REP * 2500, vids));
            out.full = ok(r) && (r.dropped == null || r.dropped < 5) ? 1 : 0; out.costs.full = ms(r.mean - m0, 1);
          }
          show("");
        }
      } else out.noVideo = true;

      // 6: the heaviest smooth effect again, now warm (thorough: after 2 minutes of cards changing over that effect)
      const knr = knee ? out.sky.find((x) => x[0] === Math.round(Sky.loadScore(knee))) : null;
      if (knee && knr && SOAK) {
        fx(knee.id); show(cardsHtml(12)); timer = churn();
        for (let t = 0; t < SOAK; t += 1000) {
          step("soak", T("bn.step.soak", { n: Math.ceil((SOAK - t) / 60000) }), 94 + (2 * t) / SOAK, 0, knee.id);
          await sleep(1000);
          if (gone()) check(null);
        }
        clearInterval(timer); timer = null; show("");
      }
      if (knee && knr) {
        step("warm", T("bn.step.warm"), 96, 0, knee.id);
        fx(knee.id); await sleep(700);
        const r = check(await sample(REP * 2500));
        out.thermal = Math.round(100 * Math.min(1, Math.max(0.75, knr[3] / Math.max(0.1, r.mean)))) / 100;
      }
      if (out.thermal == null) out.thermal = 1;
      // the budget for a page: the room between the empty screen and "smooth", less a little once warm
      out.budgetMs = Math.round(1000 * Math.max(0.5, LIMIT - m0) * out.thermal) / 1000;
      out.frameBudget = Math.round(out.frameScore * 0.8 * out.thermal);
      // the heaviest weather level that fits on its own
      out.best = [1, 2, 3, 4].filter((l) => out.fxMs[l] <= out.budgetMs).pop() || 1;
    } catch (e) {
      if (String(e && e.message) !== "stopped") { console.warn("[bench] failed:", e); stopWhy = stopWhy || T("bn.why.wrong"); }
      out.stopped = true;
    } finally {
      if (timer) clearInterval(timer);
      fx(null);
      show("");
      document.body.classList.remove("benching");
      if (wake) wake.release().catch(() => {});
      B.running = false;
      B.awake(false);
    }
    const L = Sky.LOAD_NAMES;
    if (out.stopped) {
      // nothing from a part of a run is kept (it would be wrong); what stopped it is, so the Manager can say
      const pct = Math.round(P.pct);
      App.saveBenchFail({ at: Date.now(), pct, why: stopWhy || T("bn.why.stopped") });
      report({ state: "stopped", step: P.step, pct, why: stopWhy || T("bn.why.stopped") }, true);
    } else {
      App.saveBench(out);
      report({ state: "done", step: "warm", pct: 100, score: out.frameScore, best: out.best, liveMax: out.liveMax || 0, noVideo: !!out.noVideo }, true);
    }
    stage.classList.remove("running"); stage.classList.add("done");
    const esc = UI.esc;
    stage.innerHTML = `<div class="bn-top"><b>${esc(out.stopped ? T("bn.interrupted", { pct: Math.round(P.pct) }) : T("bn.done", { score: `${out.frameScore}${out.capped ? "+" : ""}` }))}</b>`
      + (out.stopped ? `<span>${esc(T("bn.nothingSaved", { why: stopWhy || T("bn.why.stopped") }))}</span>`
        : `<span>${T.html(out.thermal < 0.95 ? "bn.fxUpToWarm" : "bn.fxUpTo", { level: `<b>${esc(L[out.best])}</b>` }, { pct: Math.round(100 - out.thermal * 100) })}`
        + ` ${out.noVideo ? esc(T("bn.noVideo")) : T.html(out.full === 0 ? "bn.liveCamsHd" : "bn.liveCams", { n: `<b>${esc(out.liveMax || T("bn.noneSmoothly"))}</b>` })}</span>`
        + `<span>${esc(T("bn.builderNow"))}</span>`)
      + `<small>${esc(T("bn.tapClose"))}</small></div>`;
    stage.addEventListener("click", () => stage.remove());
    setTimeout(() => stage && stage.remove(), 60000);
  };

  // the layout builder's canvas (design mode, design.js): the same stage as on the panel, following the panel's reports
  // — nothing is measured here, and camera tiles are colour bars (no video in the editor)
  let mirrorTimer = null, mirrorKey = "";
  B.mirror = (p) => {
    if (!p || p.state !== "running") {
      clearInterval(mirrorTimer); mirrorTimer = null; mirrorKey = "";
      if (stage) { stage.remove(); stage = null; }
      document.body.classList.remove("benching");
      if (App.fxTest != null) fx(null);
      return;
    }
    if (!stage) {
      stage = document.createElement("div");
      stage.className = "bn";
      stage.innerHTML = `<div class="bn-top"><b>${UI.esc(T("bn.liveTitle"))}</b><span class="bn-what"></span><span class="bn-bar"><i></i></span>`
        + `<small>${UI.esc(T("bn.liveCopy"))}</small></div><div class="bn-stage"></div>`;
      document.body.append(stage);
      document.body.classList.add("benching");
    }
    say(`${p.text || ""}${p.fps ? ` · ${p.fps} fps` : ""}`, p.pct);
    const key = `${p.step}|${p.n || 0}|${p.fx == null ? "" : p.fx}`;
    if (key === mirrorKey) return;
    mirrorKey = key;
    clearInterval(mirrorTimer); mirrorTimer = null;
    fx(["weather", "warm", "soak"].includes(p.step) && p.fx != null && Sky.condition(p.fx) ? p.fx : "none");
    if (["cards", "busy", "soak"].includes(p.step)) { show(cardsHtml(12)); if (p.step !== "cards") mirrorTimer = churn(); }
    else if (p.step === "drawings") show(artHtml());
    else if (p.step === "anim") show(cssHtml());
    else if (p.step === "cams" || p.step === "full") {
      const n = p.step === "full" ? 1 : Math.max(1, Math.min(16, p.n || 1));
      show(`<div class="bn-cams" style="--n:${Math.ceil(Math.sqrt(n))}">${'<div class="bn-cam bn-bars"></div>'.repeat(n)}</div>`);
    } else show("");
  };

  if (window.PanelStore) H.subscribe(`dashboard/panel/${PanelStore.id.toLowerCase()}/bench`, (msg) => {
    let m = {}; try { m = JSON.parse(msg) || {}; } catch {}
    if (m.stop === true) { if (B.running) B.stop = true; if (App.perfTesting) App.perfTestStop = true; return; }   // (the Manager's Stop)
    B.run(m.mode === "quick" ? "quick" : "thorough");
  });
  window.Bench = B;
})();
