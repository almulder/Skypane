// Skypane Manager — the panel benchmark's controls and live view (release 2; the test itself: layouts/v4/shared/bench.js).
// One box, used on Panels → Weather effects and under the layout builder:
//   - a note: not measured yet (run it once), or the last run was interrupted (nothing saved — run it again)
//   - Thorough (about 5 minutes, the default) or Quick (about 1½), and "Run benchmark" / "Rerun benchmark" — always there
//   - while it runs: a small picture of what the panel is doing right now, the steps (done / now / to come), its bar and
//     live frame rate (the panel reports to the service, memory only: GET /api/manage/panels/<id>/bench)
// Everything is drawn with DOM calls + textContent.
(function () {
  const M = window.Manage, K = window.Kit;
  const { el, api, toast, iconEl } = M;
  const STEPS = [["screen", K.t("bench.step.screen")], ["cards", K.t("bench.step.cards")], ["busy", K.t("bench.step.busy")], ["weather", K.t("bench.step.weather")], ["drawings", K.t("bench.step.drawings")],
    ["anim", K.t("bench.step.anim")], ["cams", K.t("bench.shared.aboutcameras")], ["full", K.t("bench.step.full")], ["soak", K.t("bench.step.soak")], ["warm", K.t("bench.step.warm")]];
  const LOADS = ["", K.t("bench.load.minimal"), K.t("bench.load.light"), K.t("bench.load.medium"), K.t("bench.load.heavy")];

  // the newest result and the newest interruption among the panel's devices (newest first from the service)
  M.benchOf = (perf) => (perf || []).map((p) => p.bench).find((b) => b && b.v === 2 && b.budgetMs > 0) || null;
  const failOf = (perf) => (perf || []).map((p) => p.benchFail).find(Boolean) || null;

  // a small drawing of the panel's screen for a step (what the panel shows at that moment)
  function screenOf(step, n) {
    const scr = el("div.bm-scr.s-" + step);
    if (["cards", "busy", "soak"].includes(step)) scr.append(el("div.bm-cards", {}, ...Array.from({ length: 12 }, () => el("i"))));
    if (["weather", "warm", "soak"].includes(step)) scr.append(el("div.bm-rain", {}, ...Array.from({ length: 24 }, (_, i) => el("i", { style: `left:${(i * 37) % 100}%;animation-delay:${-(i % 7) * 0.13}s` }))));
    if (step === "drawings") scr.append(el("div.bm-art", {}, ...["fan", "bulb", "thermo", "door"].map((k) => iconEl(k, 26))));
    if (step === "anim") scr.append(el("div.bm-anim", {}, ...Array.from({ length: 6 }, (_, i) => el("i", { style: `top:${10 + i * 14}%;animation-delay:${-i * 0.3}s` }))));
    if (step === "cams" || step === "full") {
      const k = step === "full" ? 1 : Math.max(1, n || 1), cols = Math.ceil(Math.sqrt(k));
      scr.append(el("div.bm-cams", { style: `grid-template-columns:repeat(${cols},1fr)` }, ...Array.from({ length: k }, () => el("i", {}, step === "full" ? "HD" : "▶"))));   // i18n-ok
    }
    if (step === "screen") scr.append(el("span.bm-cap", {}, K.t("bench.emptyScreen")));
    return scr;
  }

  // the box. panel = {id}; perf = the panel's measurements (service); onDone = reload them (a new result is in)
  // mirror: the layout builder shows the run on its own canvas (onProgress gets every report), so no small drawing here
  M.benchBox = (panel, perf, onDone, { compact = false, mirror = false, onProgress = null } = {}) => {
    const b = M.benchOf(perf), f = failOf(perf), failNewer = f && (!b || f.at > b.at);
    let mode = "thorough", timer = null;
    const live = el("div.bm-live", { hidden: true });
    const modes = el("div.seg.bm-modes", {});
    const drawModes = () => modes.replaceChildren(...[["quick", K.t("bench.mode.quick")], ["thorough", K.t("bench.mode.thorough")]].map(([v, l]) =>
      el("button" + (mode === v ? ".cur" : ""), { type: "button", onclick: () => { mode = v; drawModes(); } }, l)));
    drawModes();
    const btn = el("button.btn", { type: "button", onclick: () => start() }, b ? K.t("bench.rerun") : K.t("bench.run"));   // (secondary: the page's one primary is Save)
    // while it runs: Stop (a touch on the panel doesn't stop it)
    const stopBtn = el("button.ghost.bad", { type: "button", hidden: true, onclick: async () => {
      stopBtn.disabled = true;
      try { const r = await api(`/api/manage/panels/${encodeURIComponent(panel.id)}`, { action: "benchstop" }); if (!r.ok) toast(r.error || K.t("bench.noPanel"), true); }
      catch (e) { if (e.message !== "login") toast(K.t("manage.noService"), true); }
      setTimeout(() => { stopBtn.disabled = false; }, 4000);
    } }, K.t("control.act.stop"));
    const note = failNewer
      ? el("div.bm-warn", {}, el("b", {}, K.t("bench.note.interrupted", { pct: f.pct })), el("span", {}, " " + K.t("bench.note.interruptedWhy", { why: f.why || K.t("control.stStopped") })))
      : !b ? el("div.bm-rec", {}, el("b", {}, K.t("bench.note.notYet") + " "), el("span", {}, K.t("bench.note.notYetHint")))
      : compact ? el("small.muted", {}, K.t("bench.note.lastRun", { date: new Date(b.at).toLocaleDateString(), mode: b.mode, score: `${b.frameScore}${b.capped ? "+" : ""}` })) : null;

    async function start() {
      btn.disabled = true;
      try {
        const r = await api(`/api/manage/panels/${encodeURIComponent(panel.id)}`, { action: "bench", mode });
        if (!r.ok) { btn.disabled = false; return toast(r.error || K.t("bench.cantStart"), true); }
        live.hidden = false;
        watch(Date.now());
      } catch (e) { btn.disabled = false; if (e.message !== "login") toast(K.t("manage.noService"), true); }
    }
    // follow it: every 1.2 s until it's done, stopped, or clearly not happening
    function watch(t0) {
      clearInterval(timer);
      const tick = async () => {
        if (!document.body.contains(live)) return clearInterval(timer);   // (the page moved on)
        let p;
        try { p = await api(`/api/manage/panels/${encodeURIComponent(panel.id)}/bench`); } catch { return; }
        // (running, but no word from the panel for 25 s: it reloaded, slept or lost its connection — the run is lost)
        if (["running", "starting"].includes(p.state) && p.age > 25) p = { ...p, state: "lost" };
        draw(p, Date.now() - t0);
        if (onProgress) onProgress(p);
        stopBtn.hidden = !["running", "starting"].includes(p.state);
        const end = ["done", "stopped", "refused", "lost"].includes(p.state);
        if (end || Date.now() - t0 > 9 * 60000) {
          clearInterval(timer); btn.disabled = false;
          if (onProgress) onProgress(null);
          if (p.state === "done" || p.state === "stopped") setTimeout(() => onDone && onDone(), p.state === "done" ? 2500 : 6000);
        }
      };
      timer = setInterval(tick, 1200); tick();
    }
    function draw(p, since) {
      const pic = (step, n) => (mirror ? null : screenOf(step, n));
      if (p.state === "asked" || p.state === "none" || p.state === "starting") {
        live.replaceChildren(...[pic("screen"), el("div.bm-side", {}, el("b", {}, p.state === "starting" ? K.t("bench.live.gotIt") : K.t("bench.live.asking")),
          p.state !== "starting" && since > 20000 ? el("p.bm-warn", {}, K.t("bench.live.noAnswer")) : null)].filter(Boolean));
        return;
      }
      if (p.state === "lost") {
        live.replaceChildren(el("div.bm-side", {}, el("p.bm-warn", {}, el("b", {}, K.t("bench.live.lost")), " " + K.t("bench.live.lostMore", { pct: p.pct }))));
        return;
      }
      if (p.state === "refused") {
        live.replaceChildren(el("div.bm-side", {}, el("p.bm-warn", {}, el("b", {}, K.t("bench.live.refused") + " "), K.t("bench.live.refusedWhy", { why: p.why || K.t("bench.live.refusedNoWhy") }))));
        return;
      }
      const steps = STEPS.filter(([k]) => k !== "soak" || mode !== "quick"), at = steps.findIndex(([k]) => k === p.step);
      const list = el("ol.bm-steps", {}, ...steps.map(([k, l], i) => el("li" + (p.state === "done" || i < at ? ".done" : i === at ? (p.state === "stopped" ? ".bad" : ".now") : ""), {},
        p.state === "done" || i < at ? "✓ " : i === at ? (p.state === "stopped" ? "✕ " : "● ") : "○ ", l)));
      const head = p.state === "done" ? (p.noVideo ? K.t("bench.live.doneNoVideo", { score: p.score, load: LOADS[p.best] || "?" })
          : K.t("bench.live.done", { score: p.score, load: LOADS[p.best] || "?", n: p.liveMax }))
        : p.state === "stopped" ? K.t("bench.live.stopped", { pct: p.pct, why: p.why || K.t("control.stStopped") })
        : p.text || K.t("bench.live.running");
      live.replaceChildren(...[pic(p.state === "running" ? p.step : p.state === "done" ? "screen" : p.step, p.n),
        el("div.bm-side", {},
          el("b", {}, head),
          el("div.bar", {}, el("i", { style: `width:${p.state === "done" ? 100 : p.pct}%;background:${p.state === "stopped" ? "var(--bad)" : "var(--accent-grad, var(--ok))"}` })),
          p.state === "running" ? el("small.muted", {}, [K.t("bench.live.pct", { pct: p.pct }), p.fps ? K.t("bench.live.fps", { fps: p.fps }) : null, K.t("bench.live.noTouch"),
            mirror ? K.t("bench.live.mirror") : null].filter(Boolean).join(" · ")) : null,
          list)].filter(Boolean));
    }

    return el("div.bm" + (compact ? ".compact" : ""), {}, note, el("div.bm-row", {}, btn, stopBtn, modes), live);
  };
})();
