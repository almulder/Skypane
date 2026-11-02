// Cameras: UniFi Protect cameras straight from Protect via go2rtc (see docs/cameras.md) — not through Hubitat.
//
//   Cameras.page()                 -> HTML for the camera screen (view tabs, grid, "Edit views")
//   Cameras.full(idOrViewName, s)  -> full-screen overlay; a tap closes it, no touch for `s` seconds -> closes + Home
//   Cameras.closeFull()
//   Cameras.editor()               -> pop-up to create / rename / delete views, pick layout and cameras (local views only)
//   Cameras.onShow(msg)            -> MQTT panel/skypane/show {"view": "Doors"} or {"camera": "Front Door Doorbell"}, "seconds": 60
//   Cameras.go2rtc = "http://<server>:1984"   -> real streams (otherwise placeholders)
//   Cameras.rerender / Cameras.onTimeout       -> hooks the integrator can replace
//
// Views: if window.PROTECT_LIVEVIEWS has entries (written by scripts/protect_to_go2rtc.py from Protect's Live views),
// those are used as-is — layouts are managed in UniFi Protect, not here. Otherwise the local views below (editable
// in the panel) are used. A Protect view: { id, name, layout: <slot count>, isDefault, slots: [{ cameras: [panel ids],
// cycleMode: "time"|"motion", cycleInterval: s }] }. Cameras: HUBITAT.cameras { id, name, room, doorbell, online, video }.
(function () {
  const STORE = "panel.cameras.views";
  const L = () => (window.HUBITAT && HUBITAT.cameras) || [];  // read live: protect-cameras.js may replace the list
  const LAYOUTS = { "1": 1, "2x2": 4, "3x3": 9, "1+5": 6, "2+1": 3 };
  const LAYOUT_NAMES = { get "1"() { return T("cam.lay.single"); }, "2x2": "2 × 2", "3x3": "3 × 3", get "1+5"() { return T("cam.lay.1big5"); }, get "2+1"() { return T("cam.lay.1big2"); } };
  // Protect layouts by slot count → grid class + which slots are big (the first ones, as in Protect)
  const PROTECT_GRID = { 1: "1", 2: "2", 3: "2p1", 4: "2x2", 6: "1p5", 8: "1p7", 9: "3x3", 10: "2p8", 12: "4x3", 13: "1c12", 16: "4x4" };
  const PROTECT_BIG = { 3: [0], 6: [0], 8: [0], 10: [0, 1], 13: [0] };

  // "Front Door Doorbell" / "Front Door Camera" (Hubitat names, e.g. from a rule) find the "Front Door" camera
  const byName = (n) => { const k = String(n).toLowerCase().replace(/\s+(doorbell|camera)$/, "");
    return L().find((c) => c.name.toLowerCase() === k) || L().find((c) => c.name.toLowerCase() === String(n).toLowerCase()); };
  // (without views of its own: made from the cameras this house has — every camera, and its doorbells when it has any)
  const DEFAULT_VIEWS = (() => {
    const all = L().map((c) => c.id), bells = L().filter((c) => c.doorbell).map((c) => c.id);
    const lay = (n) => (n <= 1 ? "1" : n <= 4 ? "2x2" : "3x3");
    return [{ id: "all", name: T("cam.view.all"), layout: lay(all.length), cams: all.slice(0, 9) },
      ...(bells.length ? [{ id: "doors", name: T("cam.view.doorbells"), layout: lay(bells.length), cams: bells.slice(0, 4) }] : [])];
  })();

  // panel-made views live in the panel's store on the dashboard service (store.js); STORE = the old browser key
  const load = () => { const v = window.PanelStore ? PanelStore.get("cameraViews") : null; return Array.isArray(v) && v.length ? v : null; };
  const save = () => { if (window.PanelStore) PanelStore.set("cameraViews", C.localViews); };
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ic = (n, s) => (window.icon ? icon(n, s) : "");
  const CAM_SVG = (s = 28) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10l5-3v10l-5-3z"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>`;
  const SPK_OFF = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>`;
  const SPK_ON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>`;
  const BELL_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>`;

  // Protect live views (default one first), or [] when none were exported
  const allProtectViews = () => {
    const pv = Array.isArray(window.PROTECT_LIVEVIEWS) ? window.PROTECT_LIVEVIEWS.filter((v) => v && Array.isArray(v.slots)) : [];
    return [...pv.filter((v) => v.isDefault), ...pv.filter((v) => !v.isDefault)];
  };
  // the ones this panel shows: Settings → Cameras can hide views (made in Protect for other screens) and rename them
  const viewCfg = () => (window.Settings && Settings.v && Settings.v.cameras) || {};
  // ...in the order set in Settings (viewOrder: ids; views not in it keep Protect's order after the ordered ones)
  const orderedViews = () => {
    const order = viewCfg().viewOrder || [], all = allProtectViews();
    const rank = (v) => { const i = order.indexOf(v.id); return i < 0 ? order.length + all.indexOf(v) : i; };
    return [...all].sort((a, b) => rank(a) - rank(b));
  };
  const protectViews = () => {
    const { hiddenViews = {}, viewNames = {} } = viewCfg();
    return orderedViews().filter((v) => !hiddenViews[v.id]).map((v) => (viewNames[v.id] ? { ...v, name: viewNames[v.id] } : v));
  };

  const C = {
    LAYOUTS, LAYOUT_NAMES,
    localViews: load() || structuredClone(DEFAULT_VIEWS),
    current: null,
    go2rtc: null,        // the video address (Settings.go2rtc(): the built-in go2rtc on port 1984, or a separate one)
    hdSuffix: "-hd",     // full screen uses "<name>-hd" (main stream); "" = same stream as the grid
    rerender: () => (window.App && App.render ? App.render() : window.UI && UI.render && UI.render()),
    onTimeout: () => { if (window.App && App.go) App.go("home"); },
  };
  Object.defineProperty(C, "list", { get: L });
  // the service's copy arrived / another screen changed this panel's views
  if (window.PanelStore) PanelStore.onChange((keys) => { if (keys.includes("cameraViews")) { C.localViews = load() || structuredClone(DEFAULT_VIEWS); C.rerender(); } });
  // (views made on the Manager page come in the same list — but only Protect's own views replace this panel's views)
  C.fromProtect = () => allProtectViews().some((v) => !/^own-v/.test(String(v.id)));

  C.allProtectViews = orderedViews; // for Settings → Cameras (order / show / hide / rename)
  // the views shown: Protect's when there are any, else the local (panel-edited) ones
  // (no Protect views: the Manager's views first, then this panel's own)
  Object.defineProperty(C, "views", { get: () => (C.fromProtect() ? protectViews() : [...protectViews(), ...C.localViews]), set: (v) => { C.localViews = v; } });

  C.current = C.views[0] && C.views[0].id;

  // ---------- big grids: stills instead of live video ----------
  // With MSE, on a typical wall tablet: 9 live ≈ 26–28 fps per H.265 tile, UI ~48 ms/frame; 16 live
  // ≈ 24 fps per tile but UI ~57–73 ms. Views with more cameras than liveMax show snapshots refreshed every snapEvery s;
  // tapping a tile still opens it live. Settings.v.cameras.* override these.
  let liveMax = 9, snapEvery = 3;
  const cfg = (k) => window.Settings && Settings.v && Settings.v.cameras && +Settings.v.cameras[k];
  Object.defineProperty(C, "liveMax", { get: () => cfg("liveMax") || liveMax, set: (v) => { liveMax = +v || 9; } });
  Object.defineProperty(C, "snapEvery", { get: () => cfg("snapEvery") || snapEvery, set: (v) => { snapEvery = +v || 3; } });

  // ---------- live player: go2rtc's VideoRTC without its controls / mode badge ----------
  // Module: the copy next to this file (go2rtc-video-rtc.js = go2rtc 1.9.14's /video-rtc.js, MIT) — go2rtc sends no
  // CORS header, so a cross-origin import of ${go2rtc}/video-rtc.js only works if go2rtc allows our origin; tried second.
  // Talks to ${go2rtc}/api/ws?src=… (WebRTC, MSE fallback). If neither loads, tiles use go2rtc's stream.html iframe.
  let player = "none"; // none | loading | ready | failed
  const localPlayer = new URL("go2rtc-video-rtc.js", (document.currentScript && document.currentScript.src) || location.href).href;
  function loadPlayer() {
    if (player !== "none" || !C.go2rtc) return;
    player = "loading";
    import(localPlayer).catch(() => import(`${C.go2rtc}/video-rtc.js`)).then(({ VideoRTC }) => {
      class PanelVideo extends VideoRTC {
        constructor() {
          super();
          // MSE for grid tiles: on a wall tablet, WebRTC (H.265) dropped ~30% of frames with 4 tiles and froze every
          // tile of a 9-camera view after ~30 s; MSE showed 26–28 fps per tile. Both use the
          // hardware decoder. Full screen picks WebRTC in connectedCallback (see modeFor).
          this.mode = "mse";
          this.media = "video";            // tiles are muted anyway: don't ask for (and decode) audio
          this.DISCONNECT_TIMEOUT = 0;     // free the stream as soon as a tile leaves the page
          // upstream adds a document visibilitychange listener per player and never removes it (every tile ever
          // made stayed in memory); one page-wide handler below pauses/resumes the players on screen instead
          this.visibilityCheck = false;
        }
        connectedCallback() {
          if (!this.wsURL && this.dataset.src) this.wsURL = this.dataset.src;
          const sound = this.dataset.sound === "1";
          if (sound) this.media = "video,audio";
          this.mode = modeFor(this, sound);
          super.connectedCallback();
          if (sound) checkAudio(this);
        }
        oninit() {
          super.oninit();
          const v = this.video;
          v.controls = false; v.muted = this.dataset.sound !== "1"; v.playsInline = true;
          v.disablePictureInPicture = true; v.style.objectFit = "contain";
          // HD: see-through until the first frame, so the still underneath (.cam-poster) shows instead of black
          const poster = this.classList.contains("hd") && this.previousElementSibling && this.previousElementSibling.classList.contains("cam-poster") ? this.previousElementSibling : null;
          v.style.background = poster ? "transparent" : "#000";
          if (poster) v.addEventListener("playing", () => { v.style.background = "#000"; poster.remove(); }, { once: true });
        }
        // VideoRTC mutes silently when the browser blocks sound; tell the page so it can offer "Tap for sound"
        play() {
          this.video.play().catch((e) => {
            if (this.video.muted || !e || e.name !== "NotAllowedError") return; // AbortError etc.: a new source is loading, play() comes again
            this.video.muted = true;
            this.dispatchEvent(new Event("soundblocked", { bubbles: true }));
            this.video.play().catch(() => {});
          });
        }
        onopen() { wsOk = true; return super.onopen(); }
        // go2rtc refuses WebSockets from another origin (403) unless its config has `api: origin: "*"`:
        // the first socket closing before any ever opened → stream.html iframes everywhere
        onclose() {
          // a reconnect (sound on/off) closes the old socket while the new one is already in this.ws — VideoRTC would
          // then drop the new socket and wait RECONNECT_TIMEOUT (15 s): ignore closes of sockets that aren't current
          if (this.ws && this.ws.readyState <= WebSocket.OPEN) return false;
          if (!wsOk && this.wsState !== WebSocket.CLOSED && player === "ready") { fallback(); return false; }
          return super.onclose();
        }
        ondisconnect() {
          super.ondisconnect();
          if (this.video) { this.video.removeAttribute("src"); try { this.video.load(); } catch {} } // release the hardware decoder
        }
      }
      if (!customElements.get("panel-video")) customElements.define("panel-video", PanelVideo); // upgrades tiles already on screen
      player = "ready";
    }).catch((e) => {
      player = "failed";
      console.warn("[cameras] go2rtc player didn't load — stills until it does:", e && e.message);
      retryLater("none");
      C.rerender();
    });
  }
  let wsOk = false;
  // Player unavailable (go2rtc down when the page loaded, or refusing our origin): show silent stills and try the
  // player again in a minute. (Not go2rtc's stream.html: its player plays sound and can't be muted from this page.)
  const still = (stream) => `<img class="cam-media cam-snap" data-snap="${esc(stream)}" alt="">`;
  let retryTimer = null;
  function retryLater(next) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { player = next; wsOk = false; if (document.querySelector(".cam-snap")) C.rerender(); }, 60000);
  }
  // swap every player on the page (grid and full screen) for a still, in place
  function fallback() {
    player = "failed";
    console.warn("[cameras] go2rtc refused the player's WebSocket (down, or `api: origin: \"*\"` missing in go2rtc.yaml) — stills for now");
    C.muteAll();
    for (const pv of document.querySelectorAll("panel-video")) { pv.ondisconnect(); pv.outerHTML = still(pv.dataset.stream); }
    for (const b of document.querySelectorAll(".cam-spk[data-spk=live], .cam-sound")) b.remove();
    retryLater("ready");
  }
  // screen off / page hidden: stop every player's stream; back on: reconnect them (and nothing keeps playing sound)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) C.muteAll();
    for (const pv of document.querySelectorAll("panel-video")) {
      if (!pv.video) continue;
      if (document.hidden) pv.ondisconnect(); else { pv._wd = null; pv.onconnect(); }
    }
  });
  const wsUrl = (stream) => `${C.go2rtc.replace(/^http/, "ws")}/api/ws?src=${encodeURIComponent(stream)}`;

  // ---------- watchdog: a tile whose picture hasn't moved for STALL ms is reconnected ----------
  // (MSE tiles sometimes never start, or stop after a network hiccup; the player itself only retries on a closed socket)
  // A camera that keeps failing is retried less often: 8 s, 16 s, 32 s … up to 2 min, back to 8 s once frames flow.
  const STALL = 8000;
  C.stats = { restarts: 0 };
  setInterval(() => {
    if (document.hidden || player !== "ready") return;
    const now = Date.now();
    for (const pv of document.querySelectorAll("panel-video")) {
      const v = pv.video;
      if (!v || !v.getVideoPlaybackQuality) continue;
      const frames = v.getVideoPlaybackQuality().totalVideoFrames;
      const wd = pv._wd;
      if (!wd || frames !== wd.frames) { pv._wd = { frames, since: now, n: wd && wd.frames === -1 ? wd.n : 0 }; continue; }
      if (now - wd.since < Math.min(STALL * 2 ** wd.n, 120000)) continue;
      pv._wd = { frames: -1, since: now, n: wd.n + 1 }; // give the new connection a full wait to start
      C.stats.restarts++;
      pv.ondisconnect(); pv.onconnect();
    }
  }, 2000);

  // ---------- audio: everything muted; at most ONE camera with sound on the whole page ----------
  // Players start video only; turning sound on reconnects the one player with video+audio (see modeFor).
  // In a multi-camera view, sound turns itself off after
  // audioTimeout s; leaving the view / closing full screen / switching views mutes everything.
  let audioTimeout = 60;
  Object.defineProperty(C, "audioTimeout", { get: () => cfg("audioTimeout") || audioTimeout, set: (v) => { audioTimeout = +v || 60; } });
  const audio = { pv: null, timer: null, left: 0 };
  function setSound(pv, on) {
    if (!pv || !pv.video) return;
    // single camera full screen keeps its stream with audio: muting is instant, and so is "Tap for sound" again
    if (!on && pv.closest(".cam-full .l-1")) { pv.video.muted = true; return; }
    const mode = modeFor(pv, on), media = on ? "video,audio" : "video";
    pv.dataset.sound = on ? "1" : "0";
    const reconnect = pv.mode !== mode || pv.media !== media;
    if (reconnect) { pv.mode = mode; pv.media = media; pv.ondisconnect(); pv.onconnect(); }
    pv.video.muted = !on;
    if (on && !reconnect) pv.play(); // after a reconnect the player calls play() itself once data arrives
    if (on && reconnect) checkAudio(pv);
  }
  // Grids: MSE (steady at 9–16 tiles). Single camera full screen: WebRTC, which keeps HD at 30 fps where MSE managed
  // ~12; MSE stays the fallback. Protect's HD streams carry Opus sound, which WebRTC plays as is (checked on 4
  // cameras). A camera without Opus would arrive silent over WebRTC, so if no audio packets come within
  // 5 s that player switches to MSE — only if MSE offers audio for it — and that stream uses MSE for sound from then on.
  const noOpus = new Set(); // streams whose WebRTC picture came without sound
  function modeFor(pv, sound) {
    return pv.closest(".cam-full .l-1") && !(sound && noOpus.has(pv.dataset.stream)) ? "webrtc,mse" : "mse";
  }
  function checkAudio(pv) {
    setTimeout(() => {
      if (!pv.isConnected || pv.dataset.sound !== "1" || pv.mode === "mse" || !pv.video) return;
      if (!pv.video.srcObject || !pv.pc) return; // MSE won the race: it carries the sound itself
      // the WebRTC stream always has an audio track (the player asks for one); only packets prove there's sound
      pv.pc.getStats().then((stats) => {
        let packets = 0;
        stats.forEach((r) => { if (r.type === "inbound-rtp" && r.kind === "audio") packets += r.packetsReceived || 0; });
        if (packets > 0 || !pv.isConnected || pv.dataset.sound !== "1") return;
        // mseCodecs comes from the MSE leg that raced WebRTC; if it named no audio codec, MSE has no sound either
        if (pv.mseCodecs && !/mp4a|opus|flac/.test(pv.mseCodecs)) return;
        noOpus.add(pv.dataset.stream);
        pv.mode = "mse"; pv.ondisconnect(); pv.onconnect();
      }).catch(() => {});
    }, 5000);
  }
  function updateSpk() {
    for (const t of document.querySelectorAll(".cam-tile.audio-on")) if (!audio.pv || !t.contains(audio.pv)) t.classList.remove("audio-on");
    const t = audio.pv && audio.pv.closest(".cam-tile");
    if (t) { t.classList.add("audio-on"); const b = t.querySelector(".cam-spk"); if (b) b.dataset.left = audio.left > 0 ? T("cam.secondsLeft", { n: audio.left }) : ""; }
    for (const b of document.querySelectorAll(".cam-spk")) b.innerHTML = b.closest(".audio-on") ? SPK_ON + `<span>${b.dataset.left || ""}</span>` : b.classList.contains("snap") ? SPK_OFF + `<span>${esc(T("cam.liveSound"))}</span>` : SPK_OFF;
  }
  C.muteAll = () => {
    clearInterval(audio.timer); audio.timer = null;
    if (audio.pv) setSound(audio.pv, false);
    for (const pv of document.querySelectorAll("panel-video")) if (pv.video) pv.video.muted = true;
    audio.pv = null; updateSpk(); syncSoundBtn();
  };
  // unmute one tile (muting any other); timed only in multi-camera views
  C.soundOn = (pv, timed = true) => {
    if (!pv) return;
    C.muteAll();
    audio.pv = pv; setSound(pv, true);
    if (timed) {
      audio.left = C.audioTimeout;
      audio.timer = setInterval(() => {
        if (!audio.pv || !audio.pv.isConnected) return C.muteAll();
        if (--audio.left <= 0) C.muteAll(); else updateSpk();
      }, 1000);
    }
    updateSpk();
  };

  C.stream = (cam) => cam.stream || slug(cam.name);   // stream: go2rtc's name from the camera file (duplicate names)
  // the benchmark's test video (bench.js; go2rtc's bench-360 / bench-1080, no camera): a live tile, or "" without a player
  C.testTile = (stream) => {
    if (!C.go2rtc || !/^bench-\d+$/.test(stream)) return "";
    loadPlayer();
    return player === "failed" ? "" : `<panel-video class="cam-media" data-stream="${esc(stream)}" data-src="${esc(wsUrl(stream))}"></panel-video>`;
  };
  C.snapshot = (cam) => (C.go2rtc ? `${C.go2rtc}/api/frame.jpeg?src=${encodeURIComponent(C.stream(cam))}` : null);
  C.cam = (id) => L().find((c) => c.id === +id);
  // the views shown here (with this panel's names) first; then every Protect view by id or its Protect name, so a
  // Hubitat rule asking for {"view":"Back Door"} still works if this panel hides or renamed that view
  C.view = (key) => {
    const k = String(key).toLowerCase(), hit = (v) => v.id === key || String(v.name).toLowerCase() === k;
    return C.views.find(hit) || allProtectViews().find(hit);
  };

  // ---------- tiles ----------
  // live = true: video (our player; a still while it's unavailable); live = false: refreshed snapshot (see snapLoop)
  function media(cam, hd, live) {
    const stream = C.stream(cam) + (hd ? C.hdSuffix : "");
    if (!live) return still(C.stream(cam));
    loadPlayer();
    if (player === "failed") return still(stream);
    // HD takes a few seconds to start (a fresh connection to the camera, then its next key frame): until its first
    // frame the camera's current picture from the low stream shows instead of a black screen
    const poster = hd ? `<img class="cam-media cam-poster" src="${esc(`${C.go2rtc}/api/frame.jpeg?src=${encodeURIComponent(C.stream(cam))}&t=${Date.now()}`)}" alt="">` : "";
    return `${poster}<panel-video class="cam-media${hd ? " hd" : ""}" data-stream="${esc(stream)}" data-src="${esc(wsUrl(stream))}"></panel-video>`;
  }
  // room only when it adds something: not "Kitchen"/"Kitchen", "Patio Light"/"Patio", "Front Door"/"Front door"
  const roomOf = (cam) => {
    const r = String(cam.room || "").trim(), n = String(cam.name || "").toLowerCase();
    return r && !n.includes(r.toLowerCase()) ? r : "";
  };
  function tile(cam, { hd = false, big = false, live = true, spk = true, attrs = "" } = {}) {
    if (!cam) return "";
    // hd "g3": HD only for cameras whose small streams are slow (tileHd, older G3s — see grid())
    hd = hd === true || (hd === "g3" && !!cam.tileHd);
    const ph = (text, cls = "") => `<div class="cam-ph ${cls}"><div class="cam-scan"></div>${CAM_SVG(big ? 64 : 34)}<span>${text}</span></div>`;
    const playable = C.go2rtc && cam.online !== false && cam.video !== false;
    const media_ = cam.online === false ? ph(esc(T("cam.offline")), "off")
      : cam.video === false ? ph(esc(T("cam.noVideo")), "novid")
      : C.go2rtc ? media(cam, hd, live)
      : ph(esc(T("cam.noStream")));
    const preview = !C.go2rtc && cam.online !== false && cam.video !== false;
    // speaker: live tile → sound on this tile only; snapshot tile → open live full screen with sound
    const speaker = playable && spk && player !== "failed"
      ? (live ? `<button class="cam-spk" data-spk="live" aria-label="${esc(T("cam.sound"))}">${SPK_OFF}</button>`
              : `<button class="cam-spk snap" data-spk="snap" aria-label="${esc(T("cam.liveWithSound"))}">${SPK_OFF}<span>${esc(T("cam.liveSound"))}</span></button>`) : "";
    return `<div class="cam-tile ${big ? "big" : ""}" data-cam="${cam.id}" ${attrs}>${media_}
      <div class="cam-cap">${cam.doorbell ? BELL_SVG : ""}<b>${esc(cam.name)}</b>${roomOf(cam) ? `<span>${esc(roomOf(cam))}</span>` : ""}</div>
      ${speaker}${preview ? `<span class="cam-live">${esc(T("cam.preview"))}</span>` : ""}</div>`;
  }

  // a view as slots (Protect: as given; local: one camera per slot)
  const slotsOf = (view) => (view.slots ? view.slots : (view.cams || []).map((id) => ({ cameras: [id] })));
  function layoutOf(view) {
    if (!view.slots) { const k = view.layout; return { cls: `l-${k.replace("+", "p")}`, n: LAYOUTS[k] || 9, big: k === "1+5" || k === "2+1" ? [0] : [], pad: false }; }
    const n = Math.max(1, +view.layout || view.slots.length);
    if (PROTECT_GRID[n]) return { cls: `l-${PROTECT_GRID[n]}`, n, big: PROTECT_BIG[n] || [], pad: true };
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    return { cls: "l-gen", style: `grid-template: repeat(${rows}, 1fr) / repeat(${cols}, 1fr)`, n, big: [], pad: true };
  }
  const cycleIdx = new Map(); // "<viewId>:<slot>" -> index of the camera currently shown in a cycling slot
  function slotTile(view, slot, i, opts) {
    const cams = (slot.cameras || []).map(C.cam).filter(Boolean);
    if (!cams.length) return `<div class="cam-tile empty ${opts.big ? "big" : ""}"></div>`;
    if (cams.length === 1) return tile(cams[0], opts);
    const key = `${view.id}:${i}`, idx = (cycleIdx.get(key) || 0) % cams.length;
    const attrs = `data-cycle="${esc(key)}" data-cams="${cams.map((c) => c.id).join(",")}" data-mode="${esc(slot.cycleMode || "time")}"` +
      ` data-int="${+slot.cycleInterval || 10}" data-hd="${opts.hd === true ? 1 : opts.hd === "g3" ? "g3" : 0}" data-big="${opts.big ? 1 : 0}" data-live="${opts.live === false ? 0 : 1}"`;
    return tile(cams[idx], { ...opts, attrs });
  }
  // live video when the view has at most liveMax cameras, else refreshed stills
  const isLive = (view) => viewCount(view) <= C.liveMax;
  function grid(view, opts = {}) {
    const lay = layoutOf(view);
    // a one-camera view fills the screen, so it gets the HD (main) stream like full screen does
    opts = { live: isLive(view), ...opts, ...(lay.n === 1 ? { hd: true } : {}) };
    // older G3 cameras send only ~10 fps on their low / medium streams; in views of up to 4 cameras their tiles get HD
    // (no cost there; with 6 tiles a tablet slowed down without any gain)
    if (!opts.hd && viewCount(view) <= 4) opts.hd = "g3";
    let slots = slotsOf(view).slice(0, lay.n);
    if (!lay.pad && !slots.length) return `<div class="cam-empty">${esc(T("cam.emptyView"))}</div>`;
    if (lay.pad) while (slots.length < lay.n) slots.push({ cameras: [] }); // empty Protect slots show as dim tiles
    // every tile of a multi-camera view uses the low stream, big ones too: HD only for a one-camera
    // view and full screen
    return `<div class="cam-grid ${lay.cls}" ${lay.style ? `style="${lay.style}"` : ""}>${slots.map((s, i) => slotTile(view, s, i, { ...opts, big: lay.big.includes(i) })).join("")}</div>`;
  }
  const viewCount = (v) => slotsOf(v).filter((s) => (s.cameras || []).some((id) => C.cam(id))).length;
  // a camera card on a custom Home grid (grid.js): one camera or a whole view, live or as a refreshed still; a tap
  // opens it full screen (the card's action). "" = not found.
  C.cardHtml = (target, still) => {
    css();
    const isId = typeof target === "number" || /^\d+$/.test(String(target));
    const view = isId ? null : C.view(target), cam = view ? null : isId ? C.cam(target) : byName(String(target));
    // (the same HTML on every redraw — a poster's time stamp would restart the video each time)
    const html = cam ? `<div class="cam-grid l-1">${tile(cam, { live: !still, spk: false })}</div>` : view ? grid(view, still ? { live: false, spk: false } : { spk: false }) : "";
    return html.replace(/(&amp;t=)\d+/g, "$10");
  };

  // Cycling slots: one 1 s ticker swaps only the tile whose turn it is (other tiles' video stays connected).
  // cycleMode "motion" stays on its first camera for now — switching on motion needs Protect motion events later.
  const nextAt = new Map();
  setInterval(() => {
    const now = Date.now(), due = new Set();
    for (const el of document.querySelectorAll(".cam-tile[data-cycle]")) {
      const key = el.dataset.cycle;
      if (el.dataset.mode === "motion") continue;
      if (!nextAt.has(key)) { nextAt.set(key, now + el.dataset.int * 1000); continue; }
      if (now >= nextAt.get(key)) due.add(key);
    }
    for (const key of due) {
      cycleIdx.set(key, (cycleIdx.get(key) || 0) + 1);
      for (const el of document.querySelectorAll(`.cam-tile[data-cycle="${CSS.escape(key)}"]`)) {
        const cams = el.dataset.cams.split(",").map(C.cam).filter(Boolean); if (!cams.length) continue;
        const cam = cams[cycleIdx.get(key) % cams.length];
        if (audio.pv && el.contains(audio.pv)) { nextAt.set(key, now + el.dataset.int * 1000); continue; } // don't rotate away from a tile with sound
        const live = el.dataset.live !== "0";
        const attrs = `data-cycle="${esc(key)}" data-cams="${el.dataset.cams}" data-mode="${el.dataset.mode}" data-int="${el.dataset.int}" data-hd="${el.dataset.hd}" data-big="${el.dataset.big}" data-live="${live ? 1 : 0}"`;
        el.outerHTML = tile(cam, { hd: el.dataset.hd === "1" ? true : el.dataset.hd === "g3" ? "g3" : false, big: el.dataset.big === "1", live, attrs });
        nextAt.set(key, now + el.dataset.int * 1000);
      }
    }
  }, 1000);

  // Snapshot tiles: each still refreshes every snapEvery s, staggered across the view, only while the page is visible
  // and the tile is on screen; the new frame replaces the old one only once it has loaded (no blank flashes).
  const snaps = new WeakMap(); // img -> { at, busy }
  setInterval(() => {
    if (document.hidden || !C.go2rtc) return;
    const imgs = [...document.querySelectorAll("img.cam-snap")].filter((i) => i.isConnected && i.offsetParent);
    const every = C.snapEvery * 1000, now = Date.now();
    imgs.forEach((img, i) => {
      let s = snaps.get(img);
      if (!s) snaps.set(img, (s = { at: img.src ? now + every : now + (i * Math.min(every, 2000)) / imgs.length, busy: false }));
      if (s.busy || now < s.at) return;
      s.busy = true;
      const next = new Image();
      next.onload = () => { img.src = next.src; s.busy = false; s.at = Date.now() + every; };
      next.onerror = () => { s.busy = false; s.at = Date.now() + every; };
      next.src = `${C.go2rtc}/api/frame.jpeg?src=${encodeURIComponent(img.dataset.snap)}&t=${now}`;
    });
  }, 250);

  // ---------- camera screen ----------
  C.select = (id) => { C.muteAll(); C.current = id; C.rerender(); };
  C.page = () => {
    css();
    const view = C.view(C.current) || C.views[0];
    if (view) C.current = view.id;
    const edit = C.fromProtect()
      ? `<span class="cam-edit pv">${ic("settings", 18)}${esc(T("cam.fromProtect"))}</span>`
      : `<button class="cam-edit"${Acts.on("cam.editor")}>${ic("settings", 20)}${esc(T("cam.editViews"))}</button>`;
    const mode = view && C.go2rtc ? (isLive(view) ? `<span class="cam-mode live">${esc(T("cam.live"))}</span>` : `<span class="cam-mode">${esc(T("cam.still", { n: C.snapEvery }))}</span>`) : "";
    return `<section class="cam-page">
      <div class="cam-head"><div class="cam-tabs">${C.views.map((v) => `<button class="${v.id === view.id ? "cur" : ""}" ${Acts.on("cam.select", String(v.id))}>${esc(v.name)}<small>${viewCount(v)}</small></button>`).join("")}</div>
        ${mode}${edit}</div>
      ${view ? grid(view) : `<div class="cam-empty">${esc(T("cam.noViews"))}</div>`}
      <div class="cam-note">${esc(T(C.go2rtc ? "cam.tapFull" : "cam.notSetUp"))}</div>
    </section>`;
  };
  // tap a tile → full screen; tap its speaker → sound on/off for that tile only (event delegation survives re-renders)
  document.addEventListener("click", (e) => {
    const spk = e.target.closest(".cam-spk");
    if (spk) {
      e.stopPropagation(); e.preventDefault();
      const t = spk.closest(".cam-tile");
      if (spk.dataset.spk === "snap") return C.full(+t.dataset.cam, undefined, { sound: true });
      const pv = t.querySelector("panel-video");
      if (audio.pv === pv) C.muteAll(); else C.soundOn(pv, !t.closest(".cam-full") || !!t.closest(".cam-grid:not(.l-1)"));
      return;
    }
    const t = e.target.closest(".cam-page .cam-tile[data-cam]"); if (t) C.full(+t.dataset.cam);
  }, true);
  // (hiding the panel mutes everything: see the visibilitychange handler next to the player)
  // the browser blocked sound (no tap first, e.g. a doorbell pop-up): the player plays muted → drop the highlight,
  // full screen shows "Tap for sound"
  document.addEventListener("soundblocked", (e) => {
    if (audio.pv !== e.target) return;
    clearInterval(audio.timer); audio.timer = null; audio.pv = null;
    updateSpk(); syncSoundBtn();
  });

  // ---------- full screen ----------
  let fullEl = null, timer = null, left = 0;
  // full screen: one camera always live (HD), silent until "Tap for sound" (sound off by default —
  // also for doorbell pop-ups; only the speaker button on a tile opens it with sound: sound: true);
  // a view follows the live/still rule of grids and starts muted.
  // stay: true = opened from a room page — closing or timing out leaves you in that room (no jump to Home)
  C.full = (target, seconds = 60, { sound = false, stay = false } = {}) => {
    css();
    seconds = +seconds || 60;
    const isId = typeof target === "number" || /^\d+$/.test(String(target));
    const view = isId ? null : C.view(target);
    const cam = view ? null : isId ? C.cam(target) : byName(String(target));
    if (!cam && !view) return;
    // already full screen (a camera's detection pushing it again): keep the video running, only the timer starts over
    // with the new time — no reload, no flicker
    const key = cam ? `c${cam.id}` : `v${view.id}`;
    if (fullEl && fullEl.dataset.show === key) {
      left = seconds;
      const el = fullEl.querySelector(".cam-count"); if (el) el.textContent = left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : `${left}s`;
      return;
    }
    if (window.PANEL_DESIGN === true) sound = false;   // (the layout builder's demo canvas is silent)
    C.closeFull(true);
    C.muteAll();
    fullEl = document.createElement("div");
    fullEl.className = "cam-full";
    fullEl.dataset.show = key;
    // opened by a tap (a card on Home): on a touch screen that same tap's click arrives after this — it must not close it
    const opened = Date.now();
    let single = cam ? tile(cam, { hd: true, big: true, live: true, spk: false }) : "";
    if (sound) single = single.replace("<panel-video ", `<panel-video data-sound="1" `); // connects with audio from the start
    fullEl.innerHTML = `${cam ? `<div class="cam-grid l-1">${single}</div>` : grid(view, { hd: false })}
      <div class="cam-full-bar"><b>${esc(cam ? cam.name : view.name)}</b><span class="cam-count"></span>
        ${cam && C.go2rtc && player !== "failed" && cam.online !== false && cam.video !== false ? `<button class="cam-sound">${SPK_OFF}<span>${esc(T("cam.tapSound"))}</span></button>` : ""}
        <span class="cam-hint">${esc(T("cam.tapClose"))}</span></div>`;
    // close on the completed tap and swallow it (so it can't press whatever is underneath) — except on sound buttons
    fullEl.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.target.closest(".cam-sound")) { const pv = fullEl.querySelector("panel-video"); audio.pv === pv ? C.muteAll() : C.soundOn(pv, false); left = Math.max(left, seconds); return syncSoundBtn(); }
      if (e.target.closest(".cam-spk")) return; // handled by the page listener (multi-camera view in full screen)
      if (Date.now() - opened < 500) return;
      C.closeFull();
    });
    // the tile that was tapped shows this camera live already: its current frame is the full-screen picture at once
    // (instead of waiting for even the snapshot) until the HD video's first frame arrives
    const posterEl = cam && fullEl.querySelector(".cam-poster");
    const from = posterEl && [...document.querySelectorAll(`.cam-tile[data-cam="${cam.id}"] panel-video`)].map((p) => p.video).find((v) => v && v.videoWidth);
    if (from) try {
      const c = document.createElement("canvas");
      c.width = from.videoWidth; c.height = from.videoHeight;
      c.getContext("2d").drawImage(from, 0, 0);
      posterEl.src = c.toDataURL("image/jpeg", 0.85);
    } catch {} // keep the snapshot
    // (a doorbell / rule opening it over an open pop-up — a PIN pad: the camera in front, not behind it)
    if (document.querySelector(".popup-host.show")) fullEl.style.zIndex = "101";
    document.body.appendChild(fullEl);
    if (window.App && App.syncSky) App.syncSky(); // the sky stops while a camera is full screen
    const pv = cam && fullEl.querySelector("panel-video");
    if (pv && sound) {
      if (pv.video) C.soundOn(pv, false); // player defined: already MSE+audio, this only unmutes
      else audio.pv = pv;                 // not upgraded yet: it starts with sound itself (connectedCallback)
    }
    syncSoundBtn();
    left = seconds;
    const tick = () => {
      const el = fullEl && fullEl.querySelector(".cam-count"); if (el) el.textContent = left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : `${left}s`;   // (60:00 … 1:00, then 59s)
      if (left-- <= 0) { C.closeFull(); if (!stay) C.onTimeout(); }
    };
    tick(); timer = setInterval(tick, 1000);
  };
  function syncSoundBtn() {
    const b = fullEl && fullEl.querySelector(".cam-sound"); if (!b) return;
    const pv = fullEl.querySelector("panel-video"), on = !!pv && audio.pv === pv && !(pv.video && pv.video.muted);
    b.classList.toggle("on", on);
    b.innerHTML = on ? `${SPK_ON}<span>${esc(T("cam.soundOn"))}</span>` : `${SPK_OFF}<span>${esc(T("cam.tapSound"))}</span>`;
  }
  C.closeFull = () => { clearInterval(timer); timer = null; if (fullEl) { C.muteAll(); fullEl.remove(); fullEl = null; if (window.App && App.syncSky) App.syncSky(); } };
  C.isFull = () => !!fullEl;

  // ---------- MQTT trigger (Hubitat rule → panel/skypane/show) ----------
  // A view name that doesn't exist (e.g. "Doors" when Protect has no live view of that name) falls back to a view
  // holding a doorbell camera, then to the first doorbell camera full screen.
  C.onShow = (msg) => {
    try { if (typeof msg === "string") msg = JSON.parse(msg); } catch { msg = { view: msg }; }
    if (typeof msg !== "object" || msg === null) msg = { view: String(msg) };
    const seconds = +msg.seconds || (window.Settings && Settings.v.cameras.autoSeconds) || 60;
    if (msg.camera) return C.full(byName(msg.camera) ? byName(msg.camera).id : msg.camera, seconds);
    if (!msg.view) return;
    if (C.view(msg.view)) return C.full(C.view(msg.view).id, seconds);
    const bells = L().filter((c) => c.doorbell).map((c) => c.id);
    const withBell = C.views.find((v) => slotsOf(v).some((s) => (s.cameras || []).some((id) => bells.includes(+id))));
    if (withBell) return C.full(withBell.id, seconds);
    if (bells.length) C.full(bells[0], seconds);
  };

  // ---------- view editor (local views only) ----------
  let ed = null; // id of the view being edited
  C.editor = () => {
    if (C.fromProtect()) {
      UI.popup(() => ({ title: T("cam.viewsTitle"), body: `<p class="phint" style="font-size:17px">${esc(T("cam.protectHint"))}</p>` }));
      return;
    }
    ed = C.current || (C.localViews[0] && C.localViews[0].id); UI.popup(editorBody);
  };
  const edView = (id) => C.localViews.find((v) => v.id === id);
  function editorBody() {
    const v = edView(ed);
    const cap = v ? LAYOUTS[v.layout] : 0;
    const rooms = [...new Set(L().map((c) => c.room))];
    return { title: T("cam.viewsTitle"), wide: true, body: `
      <div class="cam-ed">
        <div class="cam-ed-views">${C.localViews.map((x) => `<button class="${x.id === ed ? "cur" : ""}" ${Acts.on("cam.edPick", x.id)}>${esc(x.name)}<small>${x.cams.length}</small></button>`).join("")}
          <button class="add"${Acts.on("cam.edAdd")}>${ic("plus", 18)} ${esc(T("cam.newView"))}</button></div>
        ${v ? `<div class="cam-ed-main">
          <div class="cam-ed-row"><input class="cam-ed-name" value="${esc(v.name)}"${Acts.attr("change", "cam.edRename")}>
            <button class="cam-ed-del"${Acts.on("cam.edDel")}>${ic("x", 18)} ${esc(T("cam.deleteView"))}</button></div>
          <div class="cam-ed-row">${Object.keys(LAYOUTS).map((l) => `<button class="cam-lay ${v.layout === l ? "cur" : ""}" ${Acts.on("cam.edLayout", l)}>${esc(LAYOUT_NAMES[l])}<small>${LAYOUTS[l]}</small></button>`).join("")}</div>
          <div class="cam-ed-count">${esc(T(v.cams.length > cap ? "cam.selectedFirst" : "cam.selected", { n: v.cams.length, cap }))}</div>
          <div class="cam-ed-cams">${rooms.map((r) => L().filter((c) => c.room === r).map((c) => {
            const on = v.cams.includes(c.id);
            return `<button class="cam-pick ${on ? "on" : ""}" ${Acts.on("cam.edToggle", c.id)}><i>${on ? "✓" : ""}</i>${esc(c.name)}${roomOf(c) ? `<small>${esc(roomOf(c))}</small>` : ""}</button>`;
          }).join("")).join("")}</div>
        </div>` : ""}
      </div>` };
  }
  const changed = () => { save(); UI.refreshPopup(); C.rerender(); };
  C.ed = {
    pick: (id) => { ed = id; UI.refreshPopup(); },
    add: () => { const id = `v${Date.now()}`; C.localViews.push({ id, name: T("cam.view.new"), layout: "2x2", cams: [] }); ed = id; changed(); },
    del: () => { C.localViews = C.localViews.filter((v) => v.id !== ed); if (!C.localViews.length) C.localViews = structuredClone(DEFAULT_VIEWS); ed = C.localViews[0].id; if (!C.view(C.current)) C.current = ed; changed(); },
    rename: (name) => { const v = edView(ed); if (v && name.trim()) { v.name = name.trim(); changed(); } },
    layout: (l) => { const v = edView(ed); if (v) { v.layout = l; changed(); } },
    toggle: (id) => { const v = edView(ed); if (!v) return; v.cams = v.cams.includes(id) ? v.cams.filter((x) => x !== id) : [...v.cams, id]; changed(); },
    reset: () => { C.localViews = structuredClone(DEFAULT_VIEWS); ed = C.localViews[0].id; changed(); },
  };

  // ---------- styles ----------
  function css() {
    if (document.getElementById("cam-css")) return;
    const s = document.createElement("style"); s.id = "cam-css";
    s.textContent = `
      .cam-page { height: 100%; display: flex; flex-direction: column; gap: 14px; }
      .cam-head { display: flex; align-items: center; gap: 14px; }
      .cam-tabs { display: flex; gap: 8px; flex: 1; flex-wrap: wrap; }
      .cam-tabs button, .cam-edit { padding: 12px 20px; border-radius: 16px; background: var(--glass); border: 1px solid var(--glass-line); color: var(--muted); font-size: 17px; display: flex; align-items: center; gap: 10px; }
      .cam-edit.pv { font-size: 14px; padding: 10px 16px; color: var(--faint); }
      .cam-tabs button small { font-size: 12px; opacity: .7; background: rgba(255,255,255,.12); padding: 1px 7px; border-radius: 8px; }
      .cam-tabs button.cur { background: var(--accent-grad); color: #fff; border-color: transparent; box-shadow: var(--on-glow); }
      .cam-grid { flex: 1; display: grid; gap: 10px; min-height: 0; }
      .cam-grid.l-1 { grid-template: 1fr / 1fr; }
      .cam-grid.l-2 { grid-template: 1fr / repeat(2, 1fr); }
      .cam-grid.l-2x2 { grid-template: repeat(2, 1fr) / repeat(2, 1fr); }
      .cam-grid.l-3x3 { grid-template: repeat(3, 1fr) / repeat(3, 1fr); }
      .cam-grid.l-4x3 { grid-template: repeat(3, 1fr) / repeat(4, 1fr); }
      .cam-grid.l-4x4 { grid-template: repeat(4, 1fr) / repeat(4, 1fr); }
      .cam-grid.l-1p5 { grid-template: repeat(3, 1fr) / repeat(3, 1fr); }
      .cam-grid.l-1p5 .cam-tile.big { grid-column: span 2; grid-row: span 2; }
      .cam-grid.l-2p1 { grid-template: repeat(2, 1fr) / 2fr 1fr; }
      .cam-grid.l-2p1 .cam-tile.big { grid-row: span 2; }
      /* portrait: one big over two small (side by side the 16:9 pictures were cut into tall slivers) */
      @media (max-aspect-ratio: 1/1) { .cam-grid.l-2p1 { grid-template: 2fr 1fr / 1fr 1fr; } .cam-grid.l-2p1 .cam-tile.big { grid-row: auto; grid-column: span 2; } }
      /* (the tiles at the pictures' own 16:9, from the top: square ones letterboxed or cut every picture) */
      @media (max-aspect-ratio: 1/1) { .cam-grid.l-2p1 { grid-template: auto auto / 1fr 1fr; align-content: start; } .cam-grid.l-2p1 .cam-tile { aspect-ratio: 16 / 9; } }
      .cam-grid.l-1p7 { grid-template: repeat(4, 1fr) / repeat(4, 1fr); }
      .cam-grid.l-1p7 .cam-tile.big { grid-column: span 3; grid-row: span 3; }
      .cam-grid.l-2p8 { grid-template: repeat(4, 1fr) / repeat(4, 1fr); }
      .cam-grid.l-2p8 .cam-tile.big { grid-column: span 2; grid-row: span 2; }
      .cam-grid.l-1c12 { grid-template: repeat(4, 1fr) / repeat(4, 1fr); grid-auto-flow: dense; }
      .cam-grid.l-1c12 .cam-tile.big { grid-column: 2 / span 2; grid-row: 2 / span 2; }
      .cam-tile { position: relative; border-radius: 16px; overflow: hidden; background: #0c0818; border: 1px solid var(--glass-line); min-height: 0; cursor: pointer; }
      .cam-tile.empty { background: rgba(12,8,24,.35); border-style: dashed; cursor: default; }
      .cam-media { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: #000; pointer-events: none; }
      .cam-ph { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: rgba(255,255,255,.28); font-size: 13px; letter-spacing: 1px;
        background: radial-gradient(ellipse at 30% 20%, rgba(167,139,250,.16), transparent 60%), linear-gradient(160deg, #1a1236, #090614); }
      .cam-ph.off { color: rgba(251,113,133,.6); background: linear-gradient(160deg, #1f1020, #0a0610); }
      .cam-ph.off .cam-scan, .cam-ph.novid .cam-scan { display: none; }
      .cam-ph.novid { color: rgba(251,191,36,.55); }
      .cam-scan { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 0%, rgba(255,255,255,.05) 50%, transparent 100%); background-size: 100% 40%; background-repeat: no-repeat; animation: camscan 4s linear infinite; }
      @keyframes camscan { from { background-position: 0 -60%; } to { background-position: 0 160%; } }
      .cam-cap { position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 14px 10px; display: flex; align-items: baseline; gap: 8px; background: linear-gradient(transparent, rgba(0,0,0,.65)); color: #fff; }
      .cam-cap b { font-size: 16px; font-weight: 600; } .cam-cap span { font-size: 13px; color: rgba(255,255,255,.6); }
      .cam-tile.big .cam-cap b { font-size: 22px; }
      .cam-live { position: absolute; top: 10px; left: 10px; font-size: 11px; letter-spacing: 1.5px; padding: 3px 8px; border-radius: 6px; background: rgba(255,255,255,.12); color: rgba(255,255,255,.6); }
      panel-video.cam-media { display: block; }
      panel-video.cam-media.hd { background: transparent; }
      .cam-poster { object-fit: contain; }
      .cam-media * { pointer-events: none; }
      panel-video video { display: block; width: 100%; height: 100%; object-fit: contain; background: #000; }
      panel-video video::-webkit-media-controls, panel-video video::-webkit-media-controls-enclosure,
      panel-video video::-webkit-media-controls-panel, panel-video video::-webkit-media-controls-overlay-play-button,
      panel-video video::-webkit-media-controls-start-playback-button { display: none !important; -webkit-appearance: none; }
      .cam-snap { object-fit: contain; }
      .cam-spk { position: absolute; top: 8px; right: 8px; z-index: 2; height: 40px; min-width: 40px; padding: 0 10px; border-radius: 20px; display: flex; align-items: center; gap: 6px;
        justify-content: center; background: rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.18); color: rgba(255,255,255,.85); font-size: 13px; pointer-events: auto; }
      .cam-spk svg { width: 20px; height: 20px; flex: none; }
      .cam-spk span { display: none; font-size: 12px; font-variant-numeric: tabular-nums; }
      .cam-tile.audio-on { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent), var(--on-glow); }
      .cam-tile.audio-on .cam-spk { background: var(--accent-grad); border-color: transparent; color: #fff; }
      .cam-tile.audio-on .cam-spk span { display: inline; opacity: .85; }
      .cam-mode { font-size: 14px; letter-spacing: .5px; color: var(--muted); padding: 6px 10px; white-space: nowrap; }
      .cam-mode.live { color: #fb7185; }
      .cam-sound { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px; background: rgba(255,255,255,.12); color: #fff; font-size: 15px; }
      .cam-sound svg { width: 20px; height: 20px; } .cam-sound.on { background: var(--accent-grad); }
      .cam-empty, .cam-note { color: var(--muted); font-size: 15px; } .cam-empty { flex: 1; display: grid; place-items: center; font-size: 20px; }
      .cam-full { position: fixed; inset: 0; z-index: 85; background: #000; display: flex; flex-direction: column; padding: 12px; gap: 10px; }
      .cam-full .cam-tile { cursor: default; border-radius: 12px; }
      .cam-full .cam-grid.l-1 .cam-cap { display: none; }   /* (one camera: its name is in the bar under it, not twice) */
      .cam-full-bar { display: flex; align-items: center; gap: 14px; color: #fff; font-size: 20px; padding: 0 6px 4px; }
      .cam-count { padding: 4px 12px; border-radius: 999px; background: var(--accent-grad); font-size: 15px; font-weight: 700; }
      .cam-hint { margin-left: auto; color: rgba(255,255,255,.5); font-size: 15px; }
      .cam-ed { display: grid; grid-template-columns: 240px 1fr; gap: 18px; min-height: 520px; }
      .cam-ed-views { display: flex; flex-direction: column; gap: 6px; }
      .cam-ed-views button { padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,.06); text-align: left; display: flex; justify-content: space-between; font-size: 16px; }
      .cam-ed-views button.cur { background: var(--accent-grad); } .cam-ed-views button.add { color: var(--muted); justify-content: flex-start; gap: 8px; }
      .cam-ed-main { display: flex; flex-direction: column; gap: 12px; }
      .cam-ed-row { display: flex; gap: 8px; align-items: center; }
      .cam-ed-name { flex: 1; padding: 12px 16px; border-radius: 14px; border: 1px solid var(--glass-line); background: rgba(255,255,255,.07); color: var(--text); font: inherit; font-size: 20px; outline: none; }
      .cam-ed-del { padding: 12px 16px; border-radius: 14px; background: rgba(251,113,133,.15); color: #fecdd3; display: flex; gap: 6px; align-items: center; }
      .cam-lay { flex: 1; padding: 10px; border-radius: 12px; background: rgba(255,255,255,.06); color: var(--muted); display: flex; flex-direction: column; align-items: center; font-size: 15px; }
      .cam-lay small { font-size: 12px; opacity: .7; } .cam-lay.cur { background: var(--accent-grad); color: #fff; }
      .cam-ed-count { color: var(--muted); font-size: 14px; }
      .cam-ed-cams { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; max-height: 46vh; overflow: auto; }
      .cam-pick { padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,.05); text-align: left; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 15px; }
      .cam-pick i { width: 22px; height: 22px; border-radius: 7px; border: 2px solid var(--glass-line); display: grid; place-items: center; font-style: normal; font-size: 14px; }
      .cam-pick small { flex-basis: 100%; padding-left: 32px; color: var(--faint); font-size: 12px; }
      .cam-pick.on { background: color-mix(in srgb, var(--accent) 30%, transparent); } .cam-pick.on i { background: var(--accent-grad); border-color: transparent; color: #fff; }
    `;
    document.head.appendChild(s);
  }

  // the page's view tabs and the views editor (acts.js)
  Acts.add({
    "cam.editor": () => C.editor(), "cam.select": (id) => C.select(id),
    "cam.edPick": (id) => C.ed.pick(id), "cam.edAdd": () => C.ed.add(), "cam.edRename": (el) => C.ed.rename(el.value),
    "cam.edDel": () => C.ed.del(), "cam.edLayout": (l) => C.ed.layout(l), "cam.edToggle": (id) => C.ed.toggle(id),
  });
  window.Cameras = C;
})();
