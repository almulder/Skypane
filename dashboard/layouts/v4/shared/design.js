// The layout builder's live canvas (Manager → Panels → Look & layout → Your own layout): this panel's real page, shown
// inside the Manager with ?design=1 (window.PANEL_DESIGN, set by the service). A demo: taps switch nothing for real
// (data.js), nothing is saved (store.js), no sound. The Manager sends the layout being edited; this page draws it with
// its own background, theme, weather and live values, and tells the Manager where the grid sits so the Manager's
// handles line up with the cards. Messages only from the Manager page that holds this frame (same origin).
(function () {
  if (window.PANEL_DESIGN !== true || window.parent === window) return;
  document.documentElement.classList.add("design");
  const send = (msg) => window.parent.postMessage(msg, location.origin);

  // where the grid's cells are (the content box of #main, in this page's own pixels)
  let last = "";
  function rect() {
    const main = document.getElementById("main"); if (!main) return;
    const r = main.getBoundingClientRect(), cs = getComputedStyle(main), px = (k) => parseFloat(cs[k]) || 0;
    const box = { x: r.left + px("paddingLeft") + px("borderLeftWidth"), y: r.top + px("paddingTop") + px("borderTopWidth"),
      w: r.width - px("paddingLeft") - px("paddingRight") - px("borderLeftWidth") - px("borderRightWidth"),
      h: r.height - px("paddingTop") - px("paddingBottom") - px("borderTopWidth") - px("borderBottomWidth"),
      vw: innerWidth, vh: innerHeight, home: main.classList.contains("lay-custom") && App.view === (show.view || "home") };
    const key = JSON.stringify(box);
    if (key !== last) { last = key; send({ t: "rect", ...box }); }
  }

  // the builder's unsaved changes, on top of this panel's saved settings (kept if the saved settings arrive again)
  // room: {key: a room id or "*" (every room), view: the room shown} when a room's grid is being edited, else Home
  const cur = {};
  function show(grid, room) {
    const saved = PanelStore.get("settings") || {};
    if (room && typeof room.key === "string" && typeof room.view === "string") {
      Object.assign(cur, { roomLayout: "custom", roomGrids: { ...(saved.roomGrids || {}), [room.key]: grid },
        roomLayouts: { ...(saved.roomLayouts || {}), [room.view]: "custom" } });
      show.view = room.view;
    } else {
      Object.assign(cur, { homeLayout: "custom", homeGrid: grid });
      show.view = "home";
    }
    PanelStore.setOverride("settings", { ...cur }, true);
    Object.assign(Settings.v, cur);
    if (App.view !== show.view && !show.trying) App.view = show.view;
    App.render();
    rect();
  }
  // the theme / background / room bar picked in the builder: the page takes it as if it had been saved (Settings redraws)
  function look(patch) {
    const ok = {};
    if (typeof patch.theme === "string" && /^[a-z0-9-]{1,30}$/.test(patch.theme)) ok.theme = patch.theme;
    if (typeof patch.background === "string" && /^([a-z0-9-]{1,30}|up:[0-9a-f]{16})$/.test(patch.background)) ok.background = patch.background;
    cur.look = { ...((PanelStore.get("settings") || {}).look || Settings.v.look), ...ok };
    // (the room bar's look: settings of their own, beside look)
    if (["pill", "rail", "segmented", "tabs", "chips", "split"].includes(patch.dockStyle)) cur.dockStyle = patch.dockStyle;
    for (const k of ["dockLabels", "dockAutoHide"]) if (typeof patch[k] === "boolean") cur[k] = patch[k];
    PanelStore.setOverride("settings", { ...cur });
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || e.origin !== location.origin) return;
    const m = e.data; if (!m || typeof m !== "object") return;
    if (m.t === "grid" && m.grid && typeof m.grid === "object") show(m.grid, m.room);
    else if (m.t === "look" && m.look && typeof m.look === "object") look(m.look);
    else if (m.t === "home") {   // back to arranging: the page being edited, nothing over it
      show.trying = false;
      if (window.Grid) { Grid.trying = false; App.render(); }   // (rule-hidden cards drawn again, faded: grid.js)
      if (window.Cameras && Cameras.closeFull) Cameras.closeFull();
      if (window.Grid && Grid.closeWheel) Grid.closeWheel();
      if (window.Settings && Settings.open && Settings.hide) Settings.hide();
      if (App.view !== (show.view || "home")) App.go(show.view || "home");
      rect();
    } else if (m.t === "try") {   // (as on the wall: a card whose rule doesn't match now is hidden — grid.js)
      show.trying = true;
      if (window.Grid) { Grid.trying = true; App.render(); }
    }
    else if (m.t === "bench" && window.Bench && Bench.mirror) Bench.mirror(m.p && typeof m.p === "object" ? m.p : null);   // (a run on the panel, copied here)
  });
  new ResizeObserver(rect).observe(document.documentElement);
  setInterval(rect, 500);   // (fonts, the room bar or an alert note moving the grid)
  send({ t: "ready" });
})();
