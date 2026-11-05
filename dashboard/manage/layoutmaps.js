// Skypane Manager — the layout grid and the built-in layouts (v2.8.0, out of builder.js:). The Panels page's drawn
// maps (desktop Status, the phone carousel) and the layout builder both use them; a phone never loads the builder.
// window.LayoutMaps = {FC, FR, F, SNAP, toFine, card, CLOCK, HEAD, PRESETS, ROOM_PRESETS}; Manage.layoutPresets().
// Plain data and pure functions: nothing here touches the page.
(function () {
  const K = window.Kit;
  // ---------- the fine grid (version 2): 192 × 128 cells (about 10 px on a 1920-wide panel), no gaps between them ----------
  // "Snap to grid" steps by SNAP cells. Card types, presets and saved cards from before come in the old 12 × 8 grid's
  // cells (F fine cells each); a fine grid of the first builds (96 × 64) is scaled up too.
  const FC = 192, FR = 128, F = 16, SNAP = 4;
  function toFine(g) {
    if (!g || (g.v === 2 && g.cols === FC && g.rows === FR && g.sp)) return g;
    const fx = FC / (g.cols || 12), fy = FR / (g.rows || 8);
    // (sp: cards are drawn at their true size and the gap is only the spacing kept when cards snap next to each other —
    // before, every card was inset by half the gap: shrink each by that much once, so it looks the same; ~8 px a cell)
    const k = g.sp ? 0 : Math.max(0, Math.round((g.gap ?? 14) / 2 / 8));
    const cards = (g.cards || []).map((c) => {
      let w = Math.max(1, Math.min(FC, Math.round(c.w * fx))), h = Math.max(1, Math.min(FR, Math.round(c.h * fy)));
      let x = Math.min(FC - w, Math.round(c.x * fx)), y = Math.min(FR - h, Math.round(c.y * fy));
      const tw = k && w > 2 * k + 1, th = k && h > 2 * k + 1;
      if (tw) { x += k; w -= 2 * k; }
      if (th) { y += k; h -= 2 * k; }
      // (v3.0.3: "Grow and shrink with the card" keeps the box it had then, in the same cells — scaled with it, and
      // trimmed by the same inset as the card, or the content would jump the moment an older layout is opened)
      const r = c.s && c.s.grow;
      if (r && typeof r === "object" && r.w > 0 && r.h > 0) {
        let gw = Math.max(1, Math.min(FC, Math.round(r.w * fx))), gh = Math.max(1, Math.min(FR, Math.round(r.h * fy)));
        if (tw) gw = Math.max(1, gw - 2 * k);
        if (th) gh = Math.max(1, gh - 2 * k);
        return { ...c, x, y, w, h, s: { ...c.s, grow: { w: gw, h: gh } } };
      }
      return { ...c, x, y, w, h };
    });
    return { ...g, v: 2, cols: FC, rows: FR, sp: true, cards };
  }

  // a room's starting layouts (research: the research notes §4), on a 12 × 8 grid
  const HEAD = { a: 0, b: false, e: 0 };
  const ROOM_PRESETS = {
    rclassic: [K.t("layoutmaps.room.classic"), () => [card("c1", "roomhead", 0, 0, 12, 1, HEAD), card("c2", "roomdevs", 0, 1, 8, 4, {}, { show: "lights", look: "tiles" }),
      card("c3", "roomopen", 8, 1, 4, 4), card("c4", "roomdevs", 0, 5, 4, 3, {}, { show: "fans", look: "list" }), card("c5", "roomdevs", 4, 5, 4, 3, {}, { show: "switches", look: "list" }),
      card("c6", "roomthings", 8, 5, 4, 3)]],
    rhero: [K.t("layoutmaps.room.hero"), () => [card("c1", "roomhead", 0, 0, 12, 1, HEAD), card("c2", "roomcams", 0, 1, 7, 7, { r: 18 }), card("c3", "roomdevs", 7, 1, 5, 4, {}, { show: "lights", look: "tiles" }),
      card("c4", "roomopen", 7, 5, 5, 3)]],
    rentry: [K.t("layoutmaps.room.entry"), () => [card("c1", "roomhead", 0, 0, 12, 1, HEAD), card("c2", "roomcams", 0, 1, 7, 5, { r: 18 }), card("c3", "roomopen", 7, 1, 5, 5),
      card("c4", "roomdevs", 0, 6, 7, 2, {}, { show: "lights", look: "tiles" }), card("c5", "people", 7, 6, 5, 2)]],
    rbed: [K.t("layoutmaps.room.bedroom"), () => [card("c1", "roomhead", 0, 0, 12, 1, HEAD), card("c2", "clock", 0, 1, 4, 3, CLOCK), card("c3", "roomdevs", 4, 1, 8, 4, {}, { show: "lights", look: "tiles" }),
      card("c4", "roomdevs", 0, 4, 4, 4, {}, { show: "fans", look: "list" }), card("c5", "roomopen", 4, 5, 4, 3), card("c6", "roomthings", 8, 5, 4, 3)]],
    rcompact: [K.t("layoutmaps.room.compact"), () => [card("c1", "roomhead", 0, 0, 12, 1, HEAD), card("c2", "roomdevs", 0, 1, 8, 7, {}, { show: "all", look: "list" }), card("c3", "roomopen", 8, 1, 4, 7)]],
    rhead: [K.t("layoutmaps.room.headerOnly"), () => [card("c1", "roomhead", 0, 0, 12, 1, HEAD)]],
    empty: [K.t("layoutmaps.empty"), () => []],
  };

  // the built-in layouts as starting points (read-only; app.js HOME_LAYOUTS), on a 12 × 8 grid
  const card = (i, t, x, y, w, h, s, o) => ({ i, t, x, y, w, h, s: s || {}, o: o || {} });
  const CLOCK = { a: 0, b: false, e: 0 };
  const PRESETS = {
    classic: [K.t("layoutmaps.home.classic"), () => [card("c1", "clock", 0, 0, 4, 2, CLOCK), card("c2", "people", 0, 2, 4, 1), card("c3", "weather", 0, 3, 4, 3),
      card("c4", "guest", 0, 6, 4, 2), card("c5", "calendar", 4, 0, 4, 8, {}, { days: 3 }), card("c6", "thermostat", 8, 0, 4, 4), card("c7", "temps", 8, 4, 4, 1),
      card("c8", "locks", 8, 5, 4, 2), card("c9", "openings", 8, 7, 4, 1)]],
    agenda: [K.t("layoutmaps.home.agenda"), () => [card("c1", "calendar", 0, 0, 4, 8, {}, { days: 3 }), card("c2", "clock", 4, 0, 4, 2, CLOCK), card("c3", "people", 4, 2, 4, 1),
      card("c4", "weather", 4, 3, 4, 3), card("c5", "guest", 4, 6, 4, 2), card("c6", "thermostat", 8, 0, 4, 4), card("c7", "temps", 8, 4, 4, 1),
      card("c8", "locks", 8, 5, 4, 2), card("c9", "openings", 8, 7, 4, 1)]],
    duo: [K.t("layoutmaps.home.duo"), () => [card("c1", "clock", 0, 0, 6, 2, CLOCK), card("c2", "people", 0, 2, 6, 1), card("c3", "weather", 0, 3, 6, 3), card("c4", "guest", 0, 6, 6, 2),
      card("c5", "calendar", 6, 0, 6, 4, {}, { days: 3 }), card("c6", "temps", 6, 4, 6, 1), card("c7", "locks", 6, 5, 6, 2), card("c8", "openings", 6, 7, 6, 1)]],
    // (as the built-in Security page lays them out: a tall clock, the locks and the doors & windows under it; the
    // thermostat big on the right, weather and the guest card small above it)
    security: [K.t("layoutmaps.home.security"), () => [card("c1", "clock", 0, 0, 4, 4, CLOCK), card("c2", "people", 0, 4, 4, 1), card("c3", "locks", 0, 5, 4, 2), card("c4", "openings", 0, 7, 4, 1),
      card("c5", "calendar", 4, 0, 4, 8, {}, { days: 3 }), card("c6", "weather", 8, 0, 4, 2), card("c7", "guest", 8, 2, 4, 1), card("c8", "thermostat", 8, 3, 4, 5)]],
    minimal: [K.t("layoutmaps.home.minimal"), () => [card("c1", "clock", 3, 0, 6, 3, CLOCK), card("c2", "weather", 3, 3, 6, 4), card("c3", "guest", 3, 7, 6, 1)]],
    empty: [K.t("layoutmaps.empty"), () => []],
  };

  window.LayoutMaps = { FC, FR, F, SNAP, toFine, card, CLOCK, HEAD, PRESETS, ROOM_PRESETS };
  if (window.Manage) window.Manage.layoutPresets = () => Object.fromEntries(Object.entries(PRESETS).map(([k, [n, f]]) => [k, [n, f()]]));
})();
