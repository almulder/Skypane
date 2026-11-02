// The panel's status bars and the panel as a speaker (release 2).
//
// Status bars: a full-width bar across the top when the panel has lost the Skypane server
// ("Lost connection to Skypane — reconnecting…"), and a small centred "⚠ Issues detected" bar when the server's health
// monitor (service/health.py) has a warning or alert up — both go away by themselves when it's fine again.
//   - lost = the server doesn't answer (two health asks in a row failed), or the broker connection is down for more
//     than a few seconds on a page that has a broker (data.js Home.link)
//   - issues = GET /api/panel/<id>/health → {"v": 1, "n", "lvl", "titles", "kinds", "mqtt"} every 30 s (every 5 s
//     while lost; the server leaves out other panels being offline and notices). A tap on the bar lists the titles. The
//     panel itself (Home.isPanel) adds ?checkin=1: that's its "I'm here" for the Manager's Health page.
//     An older server without that route (404): no issues bar, nothing else changes.
//
// Speech (the Skypane Notifier's speak / setVolume / mute, docs/hubitat-notifier.md → "The panels as speakers"):
// data.js passes hubitat/say and hubitat/volume here. Spoken with the browser's own voices (speechSynthesis); a
// WebView without voices → FreeKiosk's text-to-speech (freekiosk/<name>/set/tts). Volume and mute are kept per panel
// in localStorage. A muted panel still says a level 5 (critical) alert. A message with an "id" is said once only.
// Only the panel itself speaks (a laptop viewing the page doesn't); the builder's canvas never.
// ONE speaking path (round 2): the Notifier's speak, the alerts (hubalerts.js → Alarm.say) and the alarm's own words
// (chime.js Sound.speak) all come here — muted = silent except a level 5 (always, at 60 % or more), and the one
// speech volume (the Notifier's setVolume, or else Settings → Sound → Speech) for all of them. An id counts as "said"
// only when it really was spoken, so a level 5 that comes after an unspoken say with the same id is still said.
(function () {
  const H = window.Home, DESIGN = window.PANEL_DESIGN === true;
  if (!H || DESIGN) return;
  const PID = () => ((window.PanelStore && PanelStore.id) || "main").toLowerCase();
  const me = () => [PID(), H.kiosk()];
  const forMe = (to) => Array.isArray(to) && to.some((t) => typeof t === "string" && (t.toLowerCase() === "all" || me().includes(t.toLowerCase())));

  // ---------- status bars ----------
  const LOST_AFTER = 8000;     // ms the broker may be gone before the bar shows (a reconnect blip shows nothing)
  const st = { fails: 0, issues: 0, lvl: 0, titles: [], mqtt: !!(window.PANEL_CONFIG && PANEL_CONFIG.mqttUrl), timer: null };
  let lostBar = null, issueBar = null;
  function bars() {
    if (lostBar || !document.body) return;
    lostBar = document.createElement("div");
    lostBar.className = "st-bar st-lost"; lostBar.setAttribute("role", "status"); lostBar.hidden = true;
    lostBar.innerHTML = '<i class="st-dot"></i><span></span>'; lostBar.lastChild.textContent = T("status.lost");
    issueBar = document.createElement("button");
    issueBar.type = "button"; issueBar.className = "st-bar st-issues"; issueBar.hidden = true;
    issueBar.textContent = T("status.issues");
    issueBar.addEventListener("click", (e) => { e.stopPropagation(); list(); });
    document.body.append(lostBar, issueBar);
  }
  const lost = () => st.fails >= 2 || (st.mqtt && H.link && H.link.mqtt === false && Date.now() - H.link.since > LOST_AFTER);
  function show() {
    bars(); if (!lostBar) return;
    const l = lost();
    lostBar.hidden = !l;
    issueBar.hidden = l || st.issues <= 0;   // (while lost the server's last word may be old: only the big bar)
    issueBar.classList.toggle("alert", st.lvl >= 4);
    // (the page moves down under a bar instead of being covered: theme.css → status.css)
    document.documentElement.classList.toggle("st-lost-on", l);
    document.documentElement.classList.toggle("st-issues-on", !issueBar.hidden);
  }
  // a tap on "Issues detected": what's wrong, in the server's short titles (the details are on the Manager's Health page)
  function list() {
    if (!window.UI || !UI.popup) return;
    const esc = (t) => (UI.esc ? UI.esc(t) : String(t));
    UI.popup(() => ({ title: T("status.issuesTitle"), body: `<ul class="st-list">${(st.titles.length ? st.titles : [T("status.somethingNeedsLook")]).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      ${st.issues > st.titles.length && st.titles.length ? `<p class="phint">${esc(T("status.andMore", { n: st.issues - st.titles.length }))}</p>` : ""}
      <p class="phint">${esc(T("status.details"))}</p>` }));
  }
  async function poll() {
    clearTimeout(st.timer);
    let q = "";
    if (H.isPanel) {   // (its check-in: the version it runs and the page it shows — short words only)
      const v = String((window.PANEL_CONFIG && PANEL_CONFIG.version) || "").slice(0, 40), page = String((window.App && App.view) || "").slice(0, 40);
      q = `?checkin=1${v ? `&version=${encodeURIComponent(v)}` : ""}${page ? `&page=${encodeURIComponent(page)}` : ""}`;
    }
    const ctl = window.AbortController ? new AbortController() : null, cut = ctl && setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(`/api/panel/${encodeURIComponent(PID())}/health${q}`, { cache: "no-store", signal: ctl && ctl.signal });
      st.fails = 0;   // (any answer: the server is there)
      const j = r.ok ? await r.json().catch(() => null) : null;
      if (j && j.v === 1 && Number.isInteger(j.n)) {
        // (the panel itself never shows its OWN "disconnected / never checked in": it's talking to the server right now —
        // the only "panel" problem the server sends a panel is its own; the Manager's Open live still shows it)
        const kinds = Array.isArray(j.kinds) ? j.kinds : [], own = (i) => H.isPanel && kinds[i] === "panel";
        const titles = Array.isArray(j.titles) ? j.titles : [], dropped = titles.filter((t, i) => own(i)).length;
        st.issues = Math.max(0, j.n - dropped); st.lvl = st.issues ? (Number.isInteger(j.lvl) ? j.lvl : 0) : 0;
        st.titles = titles.filter((t, i) => typeof t === "string" && !own(i)).map((t) => t.slice(0, 80)).slice(0, 10);
        if ("mqtt" in j) st.mqtt = j.mqtt !== null;   // (the server has a broker → this page should reach it too)
        // (v2.7.2: guest lockdown as set now on the Manager's Guest Wi-Fi page — guestlock.js follows it without a reload)
        if ("lockdown" in j && window.GuestLock && GuestLock.config) GuestLock.config(j.lockdown);
      } else { st.issues = 0; st.lvl = 0; st.titles = []; }          // (an older server, or a refusal: no issues bar)
    } catch {
      st.fails++;
    } finally { if (cut) clearTimeout(cut); }
    show();
    st.timer = setTimeout(poll, st.fails ? 5000 : 30000);
  }
  if (H.onLink) H.onLink(() => { show(); setTimeout(show, LOST_AFTER + 100); });
  setInterval(show, 2000);
  addEventListener("online", () => poll());
  setTimeout(poll, 1500);   // (after App.start: the page it shows is known)

  // ---------- speech ----------
  const KEY = () => `panel.speech.${PID()}`;
  const pct = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null);
  // (no volume from the Notifier yet: the Settings speech slider's)
  const setVol = () => { const v = window.Settings && Settings.v && Settings.v.volume && Settings.v.volume.speech; return typeof v === "number" ? pct(v * 100) : null; };
  function load() {
    let v = null; try { v = JSON.parse(localStorage.getItem(KEY()) || "null"); } catch {}
    return { volume: pct(v && v.volume) ?? setVol() ?? 80, muted: !!(v && v.muted === true) };
  }
  const save = (v) => { try { localStorage.setItem(KEY(), JSON.stringify(v)); } catch {} };
  const said = new Set();   // ids already said (newest 100)
  const markSaid = (id) => { said.add(id); if (said.size > 100) said.delete(said.values().next().value); };
  const synth = window.speechSynthesis;
  const voices = () => { try { return synth ? synth.getVoices() : []; } catch { return []; } };
  // the browser loads its voices late (Chrome: after "voiceschanged"); none after a moment = this WebView has none
  async function voiceList() {
    if (!synth) return [];
    let v = voices(); if (v.length) return v;
    await new Promise((res) => { const t = setTimeout(res, 1500); try { synth.addEventListener("voiceschanged", () => { clearTimeout(t); res(); }, { once: true }); } catch { /* old WebView */ } });
    return voices();
  }
  // "voice" from the driver: a voice's name ("Google UK English Female") or a language ("en-US", "nl")
  function pick(list, want) {
    const w = String(want || "").trim().toLowerCase(); if (!w) return null;
    const lang = (v) => String(v.lang || "").toLowerCase().replace("_", "-");
    return list.find((v) => String(v.name).toLowerCase() === w) || list.find((v) => lang(v) === w)
      || list.find((v) => lang(v).split("-")[0] === w.split("-")[0] && /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(w))
      || list.find((v) => String(v.name).toLowerCase().includes(w)) || null;
  }
  let restore = null;
  async function speak(text, vol, voice) {
    const list = await voiceList();
    if (list.length && window.SpeechSynthesisUtterance) {
      const u = new SpeechSynthesisUtterance(text), v = pick(list, voice);
      u.volume = vol / 100;
      if (v) { u.voice = v; u.lang = v.lang; } else if (/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(String(voice || ""))) u.lang = voice;
      synth.speak(u);
      PanelSpeech.last = { text, vol, voice: v ? v.name : "", how: "browser" };
      return;
    }
    // (Open live on the laptop: its own browser's voice only — never FreeKiosk, that would be the real panel talking)
    if (window.PANEL_LIVE) { PanelSpeech.last = { text, vol, voice: "", how: "none" }; return; }
    // no voices here: FreeKiosk says it, at this volume, then the panel goes back to 100 % (as chime.js does)
    const k = H.kiosk();
    clearTimeout(restore);
    H.publish(`freekiosk/${k}/set/volume`, String(vol));
    setTimeout(() => H.publish(`freekiosk/${k}/set/tts`, text), 150);
    restore = setTimeout(() => H.publish(`freekiosk/${k}/set/volume`, "100"), 1500 + text.length * 80);
    PanelSpeech.last = { text, vol, voice: "", how: "freekiosk" };
  }
  const alertOf = (id) => (window.HubAlerts && Array.isArray(HubAlerts.list) ? HubAlerts.list.find((a) => a.id === id) : null);
  const cleanText = (t) => String(typeof t === "string" ? t : "").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 400);
  const cleanId = (i) => (typeof i === "string" && /^[0-9a-z]{4,32}$/i.test(i) ? i.toLowerCase() : null);
  // the one place that decides: muted → only a level 5; the id marked said only here, just before it's spoken
  // (synchronously, so two paths racing for the same id can't both say it)
  // who speaks: the panel itself — and the Manager's "Open live" view only while its "Sound on" switch is on (chime.js
  // setLiveSound, v2.9.2 the chimes and beeps already followed it, the voice now too); never the builder's canvas
  const mayTalk = () => !!H.isPanel || (window.PANEL_DESIGN !== true && !!window.PANEL_LIVE && window.PANEL_LIVE.sound === true);
  function decide(text, lvl, id, volume, voice) {
    if (!mayTalk() || !text) return false;
    if (id && said.has(id)) return false;
    const crit = lvl === 5, s = load();
    if (s.muted && !crit) return false;
    let vol = pct(volume) ?? s.volume;
    if (crit) vol = Math.max(vol, 60);
    if (id) markSaid(id);
    speak(text, vol, typeof voice === "string" ? voice.slice(0, 80) : "");
    return true;
  }
  const PanelSpeech = {
    last: null,
    get: load,
    said: (id) => said.has(String(id || "").toLowerCase()),   // (hubalerts.js: don't say an alert again that came with its own speech)
    // hubitat/say {to, text, volume (0–100 or null), voice ("" = the default), id (only when it's also an alert)}
    async say(m) {
      if (!mayTalk() || !m || !forMe(m.to)) return false;
      const text = cleanText(m.text);
      if (!text) return false;
      const id = cleanId(m.id);
      if (id && said.has(id)) return false;
      // the alert it belongs to: already here = hubalerts.js had its say when it came (a level 4 it chose not to say —
      // muted / quiet hours — stays unsaid; a level 5 is said here if it wasn't); not yet = wait up to 2 s for it (the
      // bridge sends both about together), so a level 5 is said as one: on a muted panel too, at 60 % or more
      let a = id ? alertOf(id) : null;
      for (let t = 0; id && !a && !said.has(id) && t < 20; t++) { await new Promise((r) => setTimeout(r, 100)); a = alertOf(id); }
      if (id && a && a.lvl === 4) return false;
      return decide(text, a ? a.lvl : 0, id, m.volume, m.voice);
    },
    // an alert's or the alarm's own words (hubalerts.js / alarm.js / chime.js): lvl 5 = said even on a muted panel
    alert(text, lvl, id) { return decide(cleanText(text), lvl, cleanId(id), null, ""); },
    // Settings → Sound → Speech "Test": the speech volume, said even when the Notifier muted the panel (a person asked)
    test(text) { if (!mayTalk()) return false; speak(cleanText(text), load().volume, ""); return true; },
    // Settings → Sound → Speaking slider (0–100): the same volume the Notifier sets
    setVolume(v) { const s = load(), p = pct(v); if (p == null) return false; s.volume = p; save(s); return true; },
    // hubitat/volume {to, volume (0–100 or null = leave it), muted (true / false / null = leave it)}
    volume(m) {
      if (!m || !forMe(m.to)) return false;
      const s = load(), v = pct(m.volume);
      if (v != null) s.volume = v;
      if (typeof m.muted === "boolean") s.muted = m.muted;
      save(s);
      return true;
    },
  };
  window.PanelSpeech = PanelSpeech;
  window.PanelStatus = { poll, show, state: () => ({ ...st, lost: lost() }) };
})();
