// Sound for the panel: chimes, key beeps, alert beeps (Web Audio) and speech (FreeKiosk text-to-speech).
//
// Volumes (Settings.v.volume, 0–1), each overriding the panel's own volume:
//   speech  – spoken announcements (status.js PanelSpeech: until the Notifier sets a volume, this one). FreeKiosk
//             speaks at the Android media volume, so it's set just before speaking and put back to 100 % afterwards.
//   sounds  – chimes, key beeps (Web Audio gain; the Android media volume is kept at 100 % otherwise)
//   alerts  – alarm / safety alert beeps
// Note: Android WebView may block sound until the screen has been touched once after the page loads.
(function () {
  let ctx = null, bus = {};
  const audio = () => {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      for (const k of ["sounds", "alerts"]) { bus[k] = ctx.createGain(); bus[k].connect(ctx.destination); }
      applyVolumes();
    }
    return ctx;
  };
  // (made while the page is idle and resumed just after the first tap's own work: making it on the tap froze the page
  // for ~270 ms before the tap's pop-up drew)
  if (window.requestIdleCallback) requestIdleCallback(() => audio(), { timeout: 8000 });
  // (a touch only counts as a gesture on pointerup / touchend / click — not pointerdown — so each of those tries again
  // until the context is running; still just after the tap's own work, and nothing is played to unlock it)
  const UNLOCK = ["pointerup", "touchend", "click", "keydown"];
  const unlocked = () => { for (const t of UNLOCK) removeEventListener(t, unlock, true); };
  const unlock = () => setTimeout(() => {
    const a = audio();
    if (a.state === "running") return unlocked();
    a.resume().then(() => { if (a.state === "running") unlocked(); }, () => {});
  }, 0);
  for (const t of UNLOCK) addEventListener(t, unlock, true);
  // (the layout builder's demo canvas is silent — and the Manager's "Open live", v2.5.0: the wall panel sounds, not the
  // laptop — unless its "Sound on" switch is on, v2.9.2 the Manager sets PANEL_LIVE.sound through setLiveSound)
  const vol = () => (window.PANEL_DESIGN === true || (window.PANEL_LIVE && window.PANEL_LIVE.sound !== true) ? { speech: 0, sounds: 0, alerts: 0 }
    : (window.Settings && Settings.v.volume) || { speech: 0.8, sounds: 0.5, alerts: 0.9 });
  function applyVolumes() { if (!ctx) return; const v = vol(); bus.sounds.gain.setTargetAtTime(v.sounds, ctx.currentTime, 0.05); bus.alerts.gain.setTargetAtTime(v.alerts, ctx.currentTime, 0.05); }

  const NOTE = { B3: 246.94, E3: 164.81, E4: 329.63, "F#4": 369.99, "G#4": 415.3, A4: 440, B4: 493.88, "C#5": 554.37, D5: 587.33, E5: 659.25, "F#5": 739.99, "G#5": 830.61 };

  // everything scheduled by the current chime, so a new chime or Stop can silence it
  let playing = [];
  function bell(freq, at, { decay = 3.2, soft = false, out = "sounds", amp = 1 } = {}) {
    const a = audio(), g0 = a.createGain();
    g0.gain.value = amp; g0.connect(bus[out]);
    const partials = soft ? [[1, 1], [2, 0.25], [3, 0.08]] : [[0.5, 0.25], [1, 1], [2, 0.6], [2.4, 0.35], [3, 0.3], [4.2, 0.18], [5.4, 0.1]];
    for (const [mult, pa] of partials) {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(pa * 0.5, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decay / Math.sqrt(mult));
      o.connect(g); g.connect(g0); o.start(at); o.stop(at + decay + 0.1);
      if (out === "sounds") playing.push(o);
    }
  }
  function stopAll() { for (const o of playing) { try { o.stop(); } catch {} } playing = []; }

  const W = [["G#4", "F#4", "E4", "B3"], ["E4", "G#4", "F#4", "B3"], ["E4", "F#4", "G#4", "E4"], ["G#4", "E4", "F#4", "B3"], ["B3", "F#4", "G#4", "E4"]];
  const WEST = { quarter: [0], half: [1, 2], three: [3, 4, 0], hour: [1, 2, 3, 4] };
  const WH = [["G#5", "F#5", "E5", "D5", "C#5", "B4", "A4", "E4"], ["E5", "C#5", "G#5", "B4", "F#5", "A4", "D5", "E4"]];

  function sequence(kind, style) {
    stopAll();
    const a = audio(); let t = a.currentTime + 0.1;
    const play = (notes, gap) => notes.forEach((n) => { bell(NOTE[n], t, { soft: style === "soft", decay: style === "soft" ? 1.8 : 3.4 }); t += gap; });
    if (style === "westminster") WEST[kind].forEach((i) => { play(W[i], 0.75); t += 0.55; });
    else if (style === "whittington") { const n = { quarter: 1, half: 1, three: 2, hour: 2 }[kind]; for (let i = 0; i < n; i++) { play(WH[i % 2], 0.42); t += 0.5; } }
    else if (style === "soft") play({ quarter: ["E5"], half: ["E5", "B4"], three: ["E5", "B4", "G#4"], hour: ["E5", "B4", "G#4", "E4"] }[kind], 0.6);
    else play({ quarter: ["E4"], half: ["E4", "E4"], three: ["E4", "E4", "E4"], hour: [] }[kind], 1.0);
    if (kind === "hour") {
      t += 0.8;
      const hrs = new Date().getHours() % 12 || 12;
      for (let i = 0; i < hrs; i++) { bell(style === "soft" ? NOTE.E4 : NOTE.E3, t, { decay: 4, soft: style === "soft", amp: 1.1 }); t += style === "bell" ? 1.4 : 1.6; }
    }
  }

  // ---------- speech ----------
  // One speaking path (round 2): status.js PanelSpeech says it (the browser's voices, else FreeKiosk's text-to-speech),
  // at the panel's one speech volume, silent on a muted panel unless it's a level 5. (lvl: alarm.js; 2 = a remark)
  const setPanelVolume = (pct) => Home.isPanel && Home.publish(`freekiosk/${Home.kiosk()}/set/volume`, String(Math.round(pct)));
  const speak = (text, lvl = 2, id) => !!(window.PanelSpeech && text && PanelSpeech.alert(text, lvl, id));
  // keep the panel at 100 % so the per-category Web Audio volumes are what you hear
  setTimeout(() => setPanelVolume(100), 3000);

  // ---------- alert beeps (repeat until dismissed) ----------
  let alertTimer = null;
  function alertBeep() {
    const a = audio(), t = a.currentTime + 0.02;
    [0, 0.22, 0.44].forEach((d) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "square"; o.frequency.value = 2200;
      g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.18, t + d + 0.01); g.gain.setValueAtTime(0.18, t + d + 0.13); g.gain.linearRampToValueAtTime(0, t + d + 0.15);
      o.connect(g); g.connect(bus.alerts); o.start(t + d); o.stop(t + d + 0.16);
    });
  }

  const C = {
    STYLES: { get westminster() { return T("chime.westminster"); }, get whittington() { return T("chime.whittington"); }, get bell() { return T("chime.bell"); }, get soft() { return T("chime.soft"); } },
    play(kind = "hour", style) { sequence(kind, style || Settings.v.chime.style); },
    stop: stopAll,
    speak,
    applyVolumes,
    // a Hubitat alert's own sound (hubalerts.js): "reminder" (level 1) — two short soft notes; "attention" (level 3) — one
    // gentle bell, lower. Both on the sounds volume; nothing repeats.
    tone(kind) {
      const a = audio(), t = a.currentTime + 0.05;
      if (kind === "reminder") { bell(NOTE.E5, t, { soft: true, decay: 0.9 }); bell(NOTE.B4, t + 0.28, { soft: true, decay: 1.1 }); }
      else if (kind === "attention") { bell(NOTE["G#4"], t, { soft: true, decay: 1.6 }); bell(NOTE.E4, t + 0.45, { soft: true, decay: 2.0 }); }
    },
    key() { const a = audio(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime; o.frequency.value = 1400; g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08); o.connect(g); g.connect(bus.sounds); o.start(t); o.stop(t + 0.09); },
    alertsOn(on) {
      if (on && !alertTimer && Settings.v.alertBeeps) { alertBeep(); alertTimer = setInterval(alertBeep, 2500); }
      if (!on || !Settings.v.alertBeeps) { clearInterval(alertTimer); alertTimer = null; }
    },
    test(cat) { if (cat === "speech") { if (window.PanelSpeech) PanelSpeech.test(T("chime.speechTest")); } else if (cat === "alerts") alertBeep(); else sequence("quarter", Settings.v.chime.style); },
  };

  // scheduler: check every 10 s, chime once per slot
  let lastSlot = "";
  setInterval(() => {
    const s = window.Settings && Settings.v.chime; if (!s || !s.on) return;
    const d = new Date(), m = d.getMinutes(), h = d.getHours();
    if (![0, 15, 30, 45].includes(m)) return;
    const slot = `${h}:${m}`; if (slot === lastSlot) return; lastSlot = slot;
    const quiet = s.quietOn && (s.quietFrom > s.quietTo ? h >= s.quietFrom || h < s.quietTo : h >= s.quietFrom && h < s.quietTo);
    if (quiet) return;
    const kind = m === 0 ? "hour" : m === 30 ? "half" : m === 15 ? "quarter" : "three";
    if (s.every === "hour" && kind !== "hour") return;
    if (s.every === "half" && (kind === "quarter" || kind === "three")) return;
    sequence(kind, s.style);
  }, 10000);

  // (v2.9.2) the Manager's Open live window: its "Sound on" switch (a live page only; the switch's click lets it start)
  C.setLiveSound = (on) => {
    if (!window.PANEL_LIVE || typeof window.PANEL_LIVE !== "object") return;
    window.PANEL_LIVE.sound = on === true;
    const a = audio();
    applyVolumes();
    if (on === true && a.state !== "running") a.resume().catch(() => {});
  };
  window.Chime = C;
  window.Sound = C;
})();
