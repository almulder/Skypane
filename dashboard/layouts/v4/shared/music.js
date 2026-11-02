// Music: a music page (e.g. a Sonos Panel web app; its address: Manager → Panels → General → Music page, or the house's
// Integrations → Music), shown inside the dashboard. No address set = no Music button (v2.2.0: no default address). A test-view style module (see app.js "test views") with `fixed: true`, so its button sits
// next to Cameras in the dock. The frame is made once and kept (only hidden) when you leave, so coming back is
// instant and the panel keeps its tab, room and queue.
(function () {
  const url = () => (window.Settings && Settings.v.music && Settings.v.music.url) || "";
  let frame = null, shownUrl = "", note = null, blocked = "";

  function css() {
    if (document.getElementById("music-css")) return;
    const s = document.createElement("style");
    s.id = "music-css";
    s.textContent = `
      /* same area as the camera page: clear of the Rounds bar (top) and the dock (bottom) */
      .music-frame { position: fixed; left: calc(32px + var(--dock-l, 0px)); top: calc(46px + var(--dock-t, 0px));
        width: calc(100% - 64px - var(--dock-l, 0px) - var(--dock-r, 0px)); height: calc(100% - 46px - 12px - var(--dock-t, 0px) - var(--dock-b, 112px));
        border: 0; border-radius: 18px; background: #000; z-index: 6; visibility: hidden; }
      .music-frame.show { visibility: visible; }
      /* the address can't be shown here: one line over the frame instead of a grey "blocked" page */
      .music-note { position: fixed; left: 50%; top: 45%; transform: translate(-50%, -50%); z-index: 7; max-width: min(620px, 86vw); padding: 22px 26px;
        border-radius: 18px; background: rgba(20, 14, 44, .94); border: 1px solid var(--glass-line); color: var(--text); font-size: 18px; line-height: 1.45; text-align: center; }
      .music-note[hidden] { display: none; }
      .music-frame.blocked { visibility: hidden; }   /* (the note sits on the page's own background, not on the grey frame) */
      body.child-locked .music-frame { pointer-events: none; }   /* it sits outside <main>, which child lock covers */`;
    document.head.appendChild(s);
  }

  function ensure() {
    css();
    if (!frame) {
      frame = document.createElement("iframe");
      frame.className = "music-frame";
      frame.title = "Sonos Panel";
      frame.allow = "autoplay; fullscreen";
      // no allow-top-navigation: a link inside the Sonos Panel can't take the kiosk away from the dashboard
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-modals");
      document.body.appendChild(frame);
    }
    if (shownUrl !== url()) { blocked = ""; shownUrl = url(); if (shownUrl) frame.src = shownUrl; else frame.removeAttribute("src"); } // first open, or the address changed
    return frame;
  }
  // The page's own security rules (the public demo's: only its own address in a frame) block the music address: say so,
  // with the address, instead of a blank "blocked" frame. (An address that doesn't answer still shows the browser's page.)
  function showNote(on) {
    if (!note) { note = document.createElement("div"); note.className = "music-note"; note.hidden = true; document.body.appendChild(note); }
    const none = !url();
    note.textContent = none ? T("music.noPage") : blocked ? T("music.blocked", { url: blocked }) : "";
    note.hidden = !(on && (blocked || none));
    if (frame) frame.classList.toggle("blocked", !!blocked || none);
  }
  document.addEventListener("securitypolicyviolation", (e) => {
    if (!frame || !/^(frame|child|default)-src/.test(e.effectiveDirective || e.violatedDirective || "")) return;
    let a = ""; try { a = new URL(shownUrl).origin; } catch { return; }
    if (!String(e.blockedURI || "").startsWith(a)) return;
    blocked = a.slice(0, 80);
    showNote(frame.classList.contains("show"));
  });

  (window.TestViews ||= {}).music = {
    name: "Music", icon: "music", fixed: true,
    hidden: () => !url(),   // (no address set: no button in the dock)
    // while the Sonos Panel covers the screen the sky behind it is held still: every sky frame made the panel
    // re-composite the whole screen, iframe included (measured: taps in the Sonos Panel compete with it)
    mount() { ensure().classList.add("show"); showNote(true); if (window.App && App.sky) App.sky.hold = true; },
    update() { if (frame && shownUrl !== url()) ensure(); showNote(true); },
    unmount() { if (frame) frame.classList.remove("show"); showNote(false); if (window.App && App.sky) App.sky.hold = false; },
  };
})();
