// Skypane Manager — the layout builder (release 2; research: the research notes). Panels → Look & layout
// → "Your own layout": the panel's Home page as a grid of cards.
//   left:   the cards to add (drag one onto the screen, or click it) and the bin (drop a card on it to remove it)
//   middle: the panel itself, live (its page with ?design=1 — background, theme, weather, live values; a demo that
//           switches nothing for real: design.js), with gridstack.js's handles on top to move a card or resize it
//           from its bottom-right corner. "Try it" hides the handles so the page can be tapped (rooms, toggles…).
//   right:  what the selected card shows, its devices and icons, its style, what a tap / hold / double-tap does, and
//           when it's shown or highlighted.
// Saved as the panel's "homeGrid" (checked by service/layouts.py). Everything is drawn with DOM calls + textContent.
(function () {
  const M = window.Manage, Kit = window.Kit;
  const plural = (n, one, many) => window.Kit.plural(n, one, many);   // (kit.js: one plural for every page)
  const { el, api, toast, iconEl } = M;

  // [type, name, icon, what it is, default size, default style, default options, group]
  const TYPES = [
    ["clock", Kit.t("builder.type.clock.name"), "clock", Kit.t("builder.type.clock.desc"), 4, 2, { a: 0, b: false, e: 0 }, {}, "home"],
    ["weather", Kit.t("builder.type.weather.name"), "sun", Kit.t("builder.type.weather.desc"), 4, 3, {}, {}, "home"],
    ["calendar", Kit.t("builder.type.calendar.name"), "calendar", Kit.t("builder.type.calendar.desc"), 4, 5, {}, { days: 3 }, "home"],
    ["thermostat", Kit.t("builder.type.thermostat.name"), "thermo", Kit.t("builder.type.thermostat.desc"), 4, 4, {}, {}, "home"],
    ["locks", Kit.t("builder.type.locks.name"), "lock", Kit.t("builder.type.locks.desc"), 4, 2, {}, {}, "home"],
    ["openings", Kit.t("builder.type.openings.name"), "door", Kit.t("builder.type.openings.desc"), 4, 1, {}, {}, "home"],
    ["people", Kit.t("builder.type.people.name"), "user", Kit.t("builder.type.people.desc"), 4, 1, {}, {}, "home"],
    ["temps", Kit.t("builder.type.temps.name"), "thermo", Kit.t("builder.type.temps.desc"), 4, 1, {}, {}, "home"],
    ["guest", Kit.t("builder.type.guest.name"), "wifi", Kit.t("builder.type.guest.desc"), 4, 2, {}, {}, "home"],
    ["alerts", Kit.t("builder.type.alerts.name"), "shield", Kit.t("builder.type.alerts.desc"), 4, 1, {}, {}, "home"],
    ["blank", Kit.t("builder.type.blank.name"), "plus", Kit.t("builder.type.blank.desc"), 4, 3, {}, { parts: [] }, "dev"],
    ["device", Kit.t("builder.type.device.name"), "bulb", Kit.t("builder.type.device.desc"), 3, 1, {}, { motion: "auto" }, "dev"],
    ["group", Kit.t("builder.type.group.name"), "grid", Kit.t("builder.type.group.desc"), 3, 3, {}, { items: [] }, "dev"],
    ["value", Kit.t("builder.type.value.name"), "thermo", Kit.t("builder.type.value.desc"), 2, 2, {}, {}, "dev"],
    ["button", Kit.t("builder.type.button.name"), "power", Kit.t("builder.type.button.desc"), 2, 2, {}, {}, "dev"],
    ["room", Kit.t("builder.type.room.name"), "home", Kit.t("builder.type.room.desc"), 2, 2, {}, {}, "dev"],
    ["text", Kit.t("builder.type.text.name"), "edit", Kit.t("builder.type.text.desc"), 4, 2, {}, {}, "dev"],
    ["alarm", Kit.t("builder.type.alarm.name"), "shieldHome", Kit.t("builder.type.alarm.desc"), 4, 2, {}, {}, "home"],
    ["lock", Kit.t("builder.type.lock.name"), "lock", Kit.t("builder.type.lock.desc"), 3, 2, {}, {}, "home"],
    ["garage", Kit.t("builder.type.garage.name"), "garage", Kit.t("builder.type.garage.desc"), 3, 2, {}, {}, "home"],
    ["spot", Kit.t("builder.type.spot.name"), "server", Kit.t("builder.type.spot.desc"), 4, 3, {}, { anim: "always", vpos: "beside", rows: [] }, "dev"],
    ["todo", Kit.t("builder.type.todo.name"), "list", Kit.t("builder.type.todo.desc"), 4, 4, {}, { list: "shopping" }, "home"],
    ["notes", Kit.t("builder.type.notes.name"), "note", Kit.t("builder.type.notes.desc"), 5, 3, {}, {}, "home"],
    ["fan", Kit.t("builder.type.fan.name"), "fan", Kit.t("builder.type.fan.desc"), 4, 2, {}, {}, "home"],
    ["energy", Kit.t("builder.type.energy.name"), "bolt", Kit.t("builder.type.energy.desc"), 5, 4, {}, {}, "home"],
    ["player", Kit.t("builder.type.player.name"), "music", Kit.t("builder.type.player.desc"), 5, 2, {}, {}, "media"],
    ["status", Kit.t("builder.type.status.name"), "server", Kit.t("builder.type.status.desc"), 3, 2, {}, {}, "home"],
    ["photos", Kit.t("builder.type.photos.name"), "image", Kit.t("builder.type.photos.desc"), 4, 3, { a: 0, r: 18 }, { pics: [] }, "media"],
    ["batteries", Kit.t("builder.type.batteries.name"), "batteryLow", Kit.t("builder.type.batteries.desc"), 4, 3, {}, {}, "home"],
    ["power", Kit.t("builder.type.power.name"), "bolt", Kit.t("builder.type.power.desc"), 4, 3, {}, {}, "home"],
    ["scenes", Kit.t("builder.type.scenes.name"), "sparkles", Kit.t("builder.type.scenes.desc"), 6, 2, {}, { items: [] }, "home"],
    ["modes", Kit.t("builder.type.modes.name"), "moon", Kit.t("builder.type.modes.desc"), 6, 2, {}, {}, "home"],
    ["safety", Kit.t("builder.type.safety.name"), "shield", Kit.t("builder.type.safety.desc"), 4, 1, {}, {}, "home"],
    ["notices", Kit.t("builder.type.notices.name"), "bell", Kit.t("builder.type.notices.desc"), 4, 3, {}, {}, "home"],
    ["countdown", Kit.t("builder.type.countdown.name"), "hourglass", Kit.t("builder.type.countdown.desc"), 3, 2, {}, {}, "home"],
    ["bins", Kit.t("builder.type.bins.name"), "trashBin", Kit.t("builder.type.bins.desc"), 4, 1, {}, { items: [] }, "home"],
    ["timer", Kit.t("builder.type.timer.name"), "clock", Kit.t("builder.type.timer.desc"), 4, 3, {}, {}, "home"],
    ["camera", Kit.t("builder.type.camera.name"), "film", Kit.t("builder.type.camera.desc"), 4, 3, { r: 18 }, {}, "media"],
    ["picture", Kit.t("builder.type.picture.name"), "image", Kit.t("builder.type.picture.desc"), 3, 3, { a: 0 }, {}, "media"],
    // a room's own page: they fill themselves in for the room they're on (one layout can serve every room)
    ["roomhead", Kit.t("builder.type.roomhead.name"), "home", Kit.t("builder.type.roomhead.desc"), 12, 1, { a: 0, b: false, e: 0 }, {}, "room"],
    ["roomdevs", Kit.t("builder.type.roomdevs.name"), "bulb", Kit.t("builder.type.roomdevs.desc"), 6, 4, {}, { show: "lights", look: "tiles" }, "room"],
    ["roomopen", Kit.t("builder.type.roomopen.name"), "door", Kit.t("builder.type.roomopen.desc"), 4, 3, {}, {}, "room"],
    ["roomcams", Kit.t("builder.type.roomcams.name"), "film", Kit.t("builder.type.roomcams.desc"), 6, 4, { r: 18 }, {}, "room"],
    ["roomthings", Kit.t("builder.type.roomthings.name"), "kitchen", Kit.t("builder.type.roomthings.desc"), 4, 3, {}, {}, "room"],
  ];
  // the card picker's categories (research: the research notes §1); a card may sit in several
  const CATS = [["room", Kit.t("builder.cat.room"), "home"], ["devices", Kit.t("builder.cat.devices"), "bulb"], ["climate", Kit.t("builder.cat.climate"), "thermo"], ["security", Kit.t("builder.cat.security"), "shield"],
    ["people", Kit.t("builder.cat.people"), "user"], ["time", Kit.t("builder.cat.time"), "clock"], ["media", Kit.t("builder.cat.media"), "film"], ["info", Kit.t("builder.cat.info"), "edit"], ["yours", Kit.t("builder.cat.yours"), "grid"]];
  const CAT_OF = { roomhead: ["room"], roomdevs: ["room", "devices"], roomopen: ["room", "security"], roomcams: ["room", "security", "media"], roomthings: ["room", "devices"],
    timer: ["time"], clock: ["time"], scenes: ["devices", "time"], modes: ["security", "time"], safety: ["security"], notices: ["info", "security"],
    countdown: ["time"], bins: ["time"], alarm: ["security"], lock: ["security", "devices"], garage: ["security", "devices"], spot: ["devices", "security", "info"], status: ["info"], photos: ["media", "info"], player: ["media", "devices"], fan: ["climate", "devices"], energy: ["info", "climate"], todo: ["time"], notes: ["time", "info"],
    batteries: ["info", "devices"], power: ["info", "devices"], weather: ["climate", "time"], calendar: ["time"], thermostat: ["climate"], locks: ["security"], openings: ["security"], people: ["people"],
    temps: ["climate"], guest: ["info"], alerts: ["security", "info"], device: ["devices"], group: ["devices"], value: ["devices", "climate", "info"],
    button: ["devices"], room: ["devices"], text: ["info"], blank: ["devices", "security", "climate", "info"], camera: ["security", "media"], picture: ["media"] };
  const T = Object.fromEntries(TYPES.map((t) => [t[0], t]));
  // a card type: a built-in one, or "card:<id>" — one people made (Manager → Cards)
  const userCard = (type) => (/^card:/.test(type) && st ? (st.cards || []).find((c) => c.id === type.slice(5)) : null);
  // "tpl:<id>": a card saved from this editor (Save card) — dropped, it's a copy of that card
  // the fine grid, toFine, the card helper and the built-in layouts: layoutmaps.js (v2.8.0 — shared with the
  // Panels maps and the phone, which never loads this file)
  const { FC, FR, F, SNAP, toFine, card, CLOCK, HEAD, PRESETS, ROOM_PRESETS } = window.LayoutMaps;
  const tplOf = (type) => (/^tpl:/.test(type) && st ? (st.tpls || []).find((t) => t.id === type.slice(4)) : null);
  const tdef = (type) => {
    if (T[type]) return T[type];
    const sv = tplOf(type);
    if (sv) { const b = tdef(sv.card.t), k = sv.fine ? (sv.fine === true ? 96 : sv.fine) / 12 : 1; return [type, sv.name, b[2], Kit.t("builder.type.savedDesc", { type: b[1] }), Math.max(1, Math.round(sv.card.w / k)), Math.max(1, Math.round(sv.card.h / k)), {}, {}]; }
    const u = userCard(type);
    return u ? [type, u.name, "grid", u.description || "", u.size.w, u.size.h, {}, {}] : [type, type.replace(/^card:/, ""), "grid", Kit.t("builder.type.gone"), 2, 2];
  };
  // ---------- the load meter: what a page costs against what the panel can draw smoothly ----------
  // From the panel's benchmark (bench.js, version 2): what each thing adds to the average frame time there (ms), the
  // weather levels' share, and the room a page has (budgetMs). Until the panel has been measured: shares of a typical
  // wall tablet's room (from the research's reference table), shown as an estimate.
  const DEF_SHARE = { card: 0.01, live: 0.005, art: 0.06, css: 0.015, tile: 0.15, full: 0.35 };
  const DEF_FX = [0, 0.05, 0.15, 0.3, 0.55], DEF_LIVEMAX = 4;
  const LIVE_RATE = 0.3;   // a live card changes about once every 3 s (the benchmark measures 20 changes a second)
  const LIVE_T = new Set(["device", "group", "value", "thermostat", "people", "energy", "player", "timers", "status", "power", "batteries", "fan", "alarm",
    "lock", "garage", "modes", "scenes", "roomdevs", "roomhead", "roomopen", "roomthings", "locks", "openings", "temps", "todo", "notes", "clock", "notices",
    "safety", "countdown", "alerts", "blank"]);
  const presets = () => (st && st.ctx.room ? ROOM_PRESETS : PRESETS);


  const SCREENS = [["1280x800", "1280 × 800 (10″ tablet)"], ["1920x1200", "1920 × 1200"], ["1920x1080", "1920 × 1080 (TV, monitor)"], ["1024x600", "1024 × 600 (7″)"],
    ["2560x1600", "2560 × 1600"], ["800x1280", "800 × 1280 (portrait)"], ["1080x1920", "1080 × 1920 (portrait)"], ["390x844", "390 × 844 (phone)"]];
  const ATTRS = ["switch", "level", "temperature", "humidity", "battery", "power", "energy", "contact", "motion", "lock", "presence", "water",
    "illuminance", "door", "valve", "speed", "position", "thermostatMode", "thermostatOperatingState", "airQualityIndex", "pm25", "co2", "volume", "status"];
  const ACTIONS = [["none", Kit.t("builder.action.none")], ["toggle", Kit.t("builder.action.toggle")], ["on", Kit.t("builder.action.on")], ["off", Kit.t("builder.action.off")], ["lock", Kit.t("builder.action.lock")],
    ["unlock", Kit.t("builder.action.unlock")], ["cmd", Kit.t("builder.action.cmd")], ["room", Kit.t("builder.action.room")], ["page", Kit.t("builder.action.page")], ["camera", Kit.t("builder.action.camera")]];
  const COMMANDS = ["on", "off", "setLevel", "setSpeed", "setPosition", "open", "close", "lock", "unlock", "refresh", "setHeatingSetpoint", "setCoolingSetpoint",
    "setThermostatMode", "setThermostatFanMode", "setColorTemperature", "setHue", "setSaturation", "fanOn", "auto", "setFanSpeed", "push",
    "play", "pause", "stop", "nextTrack", "previousTrack", "setVolume", "mute", "unmute"];
  const OPS = [["eq", Kit.t("builder.op.eq")], ["ne", Kit.t("builder.op.ne")], ["gt", Kit.t("builder.op.gt")], ["lt", Kit.t("builder.op.lt")]];
  const DEV_ACTIONS = ["toggle", "on", "off", "lock", "unlock", "cmd"];

  // the open editor: {g, sel, ctx, gs, dirty, mode, rect, cams, pics, cards}
  let st = null;

  // ---------- what there is to pick from ----------
  const devices = () => {
    const D = M.devices && M.devices();
    return ((D && D.devices) || []).filter((d) => d.is !== "hidden").map((d) => ({ id: d.id, label: d.label, room: d.room || "", kind: (D.overrides && D.overrides[d.id] && D.overrides[d.id].as) || d.is || "",
      type: d.type || "", caps: d.caps || [] })).sort((a, b) => a.label.localeCompare(b.label));
  };
  const devName = (id) => (devices().find((d) => d.id === id) || {}).label || (id ? Kit.t("builder.dev.fallback", { id }) : "");
  const devKind = (id) => { for (const r of st.ctx.rooms) for (const d of r.devices || []) if (d.id === id) return d.kind; return ""; };
  const optList = (items, cur, empty) => [empty ? el("option", { value: "", selected: cur == null || cur === "" }, empty) : null,
    ...items.map(([v, l]) => el("option", { value: String(v), selected: String(cur) === String(v) }, l))];
  // not what a switch or sensor picker wants: the hub's own helpers (hub information, notifiers, listeners, bridges) and
  // cameras (they have their own cards) — anything that does nothing but refresh
  const NOTHING_CAPS = new Set(["Refresh", "Initialize", "Configuration", "Actuator", "Sensor", "Polling", "Notification", "Health Check"]);   // i18n-ok
  // never what a card wants, even where anything may give a value: the hub's own helpers — "# …" names (the owner's
  // way of marking them), notifiers, hub information, listeners, e-mail / SMS, phone trackers, the file manager
  const noiseDev = (d) => /^\s*#/.test(d.label) || /notif|hub information|listener|email|gmail|twilio|file manager|owntracks|mobile app|connectapi/i.test(d.type);
  // (only devices the house model didn't file as anything: a light whose driver is a "… Controller (RGBW)" is a light)
  const helperDev = (d) => d.kind === "camera" || noiseDev(d) || (!d.kind && (/controller|bridge|viewer/i.test(d.type)
    || !d.caps.some((c) => !NOTHING_CAPS.has(c))));
  // a garage door opener: filed as one (a door controller, or "as a garage" on the Devices tab), or a switch / relay named like one
  // (not the door's contact sensor or the lock on the garage door)
  const OPENER_CAPS = ["Switch", "GarageDoorControl", "DoorControl", "Momentary", "PushableButton"];   // i18n-ok
  const isGarage = (d) => /garage/.test(d.kind) || (/garage door|overhead door|garage opener/i.test(d.label) && !/lock|contact|door-|window/.test(d.kind)
    && d.caps.some((c) => OPENER_CAPS.includes(c)));
  // what can open a garage door at all: an opener, or a switch / relay / button — never a sensor (contact, leak,
  // temperature, motion…), a lock, a light or dimmer, a camera, an appliance, a siren or a water valve
  const canOpen = (d) => isGarage(d) || (d.caps.some((c) => OPENER_CAPS.includes(c))
    && !/^(door-|window|contact|sensor:|motion|climate|outside-temp|presence|lock|light|camera|shade|fan|thermostat)/.test(d.kind)
    && !/^thing:(?!garage|mode|smart-outlet)/.test(d.kind) && !/camera|protect|display|chime|siren|valve|samsung|replica/i.test(d.type) && !d.caps.some((c) => ["Valve", "SwitchLevel", "ColorControl", "ColorTemperature"].includes(c)));
  // does it switch on and off at all (a "+ As a switch" row, a Switch piece)
  // the panel's automatic press-and-hold wheel (grid.js Grid.autoWheel): fans, shades, dimmers, white and colour lights
  const autoWheels = (id) => { const d = devices().find((x) => x.id === id); if (!d || /lock|garage/.test(d.kind)) return false;
    return /^(fan|shade)$/.test(d.kind) || (rawDev(id).caps || d.caps).some((x) => ["SwitchLevel", "ColorTemperature", "ColorControl"].includes(x)); };
  const switches = (d) => d.caps.includes("Switch") || (rawDev(d.id).cmds || []).includes("on");
  // a search: every word somewhere in the name, room or kind, in any order, parts of words too ("light kit" →
  // "Kitchen Lights"; "v" → everything with a v); apostrophes and accents don't count
  const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’‘`]/g, "");
  const devHit = (d, q) => { const hay = fold(`${d.label} ${d.room} ${d.kind.replace(/^\w+:/, "")}`); return fold(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w)); };
  // how well a device fits a search (lower is better): its exact name, a name that starts with it, every word at the
  // start of a word, then the rest — what Enter picks and the order the list shows
  const devRank = (d, q) => {
    const L = fold(d.label).trim(), Q = fold(q).trim().replace(/\s+/g, " ");
    if (L === Q) return 0;
    if (L.startsWith(Q)) return 1;
    const starts = fold(`${d.label} ${d.room}`).split(/[^a-z0-9]+/).filter(Boolean);
    return Q.split(" ").every((w) => starts.some((x) => x.startsWith(w))) ? 2 : 3;
  };
  // a device picker: a search box over the list. opts: all (any device can give a value: only the hub's helpers are
  // left out), only (which devices at all), narrow (the ones that fit; the rest behind "Show every device"),
  // first (listed first, under firstLabel)
  function devSelect(cur, onpick, empty = Kit.t("builder.dev.pick"), opts = {}) {
    const every = devices().filter((d) => !opts.only || opts.only(d) || d.id === cur);
    let showAll = false, q = "", found = [];
    const sel = el("select", { onchange: (e) => {
      if (e.target.value === "*all") { showAll = true; fill(); sel.value = cur == null ? "" : String(cur); sel.focus(); return; }
      onpick(e.target.value ? +e.target.value : null);
    } });
    const name = (d) => `${d.label}${d.room ? ` · ${d.room}` : ""}`;
    const fits = (d) => (opts.all ? !noiseDev(d) : !helperDev(d)) && (!opts.narrow || opts.narrow(d));
    const fill = () => {
      const pool = every.filter((d) => showAll || fits(d) || d.id === cur), searching = !!q.trim();
      let hits = pool.filter((d) => !searching || devHit(d, q) || d.id === cur);
      if (searching) hits = hits.map((d, n) => [devRank(d, q), n, d]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
      const firsts = opts.first ? hits.filter(opts.first) : [], rest = opts.first ? hits.filter((d) => !opts.first(d)) : hits;
      found = [...firsts, ...rest].filter((d) => !searching || devHit(d, q));
      const n = found.length, hidden = every.length - pool.length;
      sel.replaceChildren(...[el("option", { value: "", selected: cur == null }, searching ? (n ? Kit.t("builder.dev.found", { n }) : Kit.t("builder.dev.noneFound")) : empty),
        firsts.length ? el("optgroup", { label: opts.firstLabel || Kit.t("builder.dev.first") }, optList(firsts.map((d) => [d.id, name(d)]), cur)) : null,
        rest.length ? (firsts.length ? el("optgroup", { label: opts.restLabel || Kit.t("builder.dev.rest") }, optList(rest.map((d) => [d.id, name(d)]), cur)) : optList(rest.map((d) => [d.id, name(d)]), cur)) : null,
        hidden && !showAll ? el("option", { value: "*all" }, opts.narrow ? Kit.t("builder.dev.showEvery", { n: hidden }) : Kit.t(opts.all ? "builder.dev.showHelpers" : "builder.dev.showHelpersCams", { n: hidden })) : null].flat().filter(Boolean));
    };
    const find = el("input.bld-dfind", { type: "search", placeholder: Kit.t("builder.dev.search"), "aria-label": Kit.t("builder.dev.searchAria"),
      title: Kit.t("builder.dev.searchTip"),
      oninput: (e) => { q = e.target.value; fill(); },
      onkeydown: (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); sel.focus(); }
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (!q.trim() || !found.length) return;   // (nothing typed: nothing picked)
        const best = found.reduce((b, d) => (devRank(d, q) < devRank(b, q) ? d : b), found[0]);
        sel.value = String(best.id); onpick(best.id);
      } });
    fill();
    return el("div.bld-dsel", {}, find, sel);
  }
  const GARAGE_FIRST = { narrow: canOpen, first: isGarage, firstLabel: Kit.t("builder.dev.garageFirst"), restLabel: Kit.t("builder.dev.garageRest") };
  const CONTACT_FIRST = { first: (d) => /door|contact/.test(d.kind) || /contact|door sensor|tilt/i.test(`${d.label} ${d.type}`), firstLabel: Kit.t("builder.dev.contactFirst") };
  // a row whose name explains itself on hover (the name is underlined with dots: there is a note)
  const tipRow = (label, tip, ...kids) => el("div.bld-row", { title: tip }, el("span.bld-l.bld-tip2", {}, label), ...kids);

  // ---------- warnings: what a card can do that the owner should know (they decide —) ----------
  function warnings(g) {
    const out = [];
    for (const c of g.cards) {   // a card people made, with risky commands on a device you gave it
      const u = userCard(c.t); if (!u) continue;
      for (const s of u.slots) for (const cmd of s.commands) {
        const id = ((c.o || {}).bind || {})[s.key];
        if (id && ["unlock", "open"].includes(cmd)) out.push([c.i, Kit.t(cmd === "unlock" ? "builder.warn.cardUnlock" : "builder.warn.cardOpen", { card: u.name, device: devName(id) })]);
      }
    }
    for (const c of g.cards) for (const k of ["tap", "hold", "dbl"]) {
      const a = c[k]; if (!a) continue;
      const name = devName(a.id), kind = devKind(a.id);
      if (a.do === "unlock" || (a.do === "cmd" && a.c === "unlock") || (a.do === "toggle" && kind === "" && /lock/i.test(name)))
        out.push([c.i, Kit.t({ tap: "builder.warn.unlockTap", hold: "builder.warn.unlockHold", dbl: "builder.warn.unlockDbl" }[k], { device: name })]);
      else if (a.do === "cmd" && a.c === "open") out.push([c.i, Kit.t({ tap: "builder.warn.openTap", hold: "builder.warn.openHold", dbl: "builder.warn.openDbl" }[k], { device: name })]);
      else if (["toggle", "on"].includes(a.do) && ["garage", "valve"].includes(kind)) out.push([c.i, Kit.t({ tap: "builder.warn.canOpenTap", hold: "builder.warn.canOpenHold", dbl: "builder.warn.canOpenDbl" }[k], { device: name, kind })]);
    }
    return out;
  }

  // ---------- the editor ----------
  // what the Home page shows now, as the panel draws it (app.js customGrid): its own grid only while "Your own layout" is
  // the one in use (a new panel's empty grid included: it starts blank on purpose) — else the built-in layout it uses
  // (Two columns, Minimal… — v2.5.0: the builder used to open such a panel's unused, empty grid)
  function homeStart(m) {
    const own = m.homeGrid && Array.isArray(m.homeGrid.cards) ? m.homeGrid : null;
    if (m.homeLayout === "custom" && own) return structuredClone(own);
    const k = Object.hasOwn(PRESETS, m.homeLayout) && m.homeLayout !== "empty" ? m.homeLayout : "classic";
    return { v: 1, cols: 12, rows: 8, gap: 14, cards: PRESETS[k][1](), ...(own && own.scr ? { scr: own.scr } : {}) };
  }
  // a room page as it is now: its own grid, else every room's, else the built-in room layout
  function roomStart(grids, key) {
    const own = grids[key], every = grids["*"];
    return structuredClone(own && Array.isArray(own.cards) ? own : every && Array.isArray(every.cards) ? every : { v: 1, cols: 12, rows: 8, gap: 14, cards: ROOM_PRESETS.rclassic[1]() });
  }
  // ctx: {panel: {id, name}, managed, rooms, views, panels, save(set) → Promise<bool>, back()}
  // (rooms: key — the page, "*" every room's; start — "empty": no cards)
  M.openBuilder = async (ctx) => {
    // rooms: grids = every room's own grid as saved ("*" = the one for every room), key = the one being edited,
    // view = the room shown while editing it; edited = the keys changed (only those are saved)
    const grids = ctx.room ? structuredClone(ctx.managed.roomGrids || {}) : null;
    // (v3.0.2: ctx.key — the room page asked for, "*" every room's; Panels asks first which one, it no longer opens
    // every room's with the first room on it as if that room were picked)
    const rooms = ctx.rooms || [], key = ctx.room && rooms.some((r) => r.id === ctx.key) ? ctx.key : "*";
    const g = toFine(ctx.room ? roomStart(grids, key) : homeStart(ctx.managed));
    // (the room bar's style, names and auto-hide too: what the canvas draws is what the wall shows)
    const m = ctx.managed, dockStyle = (M.DOCK_STYLES || []).some(([k]) => k === m.dockStyle) ? m.dockStyle : "pill";
    const look = { theme: m["look.theme"] || "purple", background: m["look.background"] || "mountains", dockStyle,
      dockLabels: typeof m.dockLabels === "boolean" ? m.dockLabels : dockStyle !== "rail", dockAutoHide: m.dockAutoHide === true };
    st = { g, sel: null, ctx, gs: null, dirty: false, mode: "arrange", rect: null, sig: "", cams: [], pics: [], bgs: [], cards: [], look, look0: { ...look }, open: new Set(["shows"]),
      grids, key, view: ctx.room ? (key !== "*" ? key : (rooms[0] || {}).id || "") : "home", edited: new Set(),
      snap: (() => { try { return localStorage.getItem("bld.snap") !== "0"; } catch { return true; } })(),
      hist: new Map(), base: "", touched: false, orig: new Map(), saved: ctx.room ? structuredClone(ctx.managed.roomGrids || {}) : null };
    st.base = snap(); remember();
    // (v3.0.2: "An empty page": no cards, the grid as it was — a change (unsaved, Undo brings back what it was); the
    // page it was is kept as the one to compare with)
    if (ctx.room && ctx.start === "empty" && g.cards.length) {
      st.g = { ...toFine({ v: 1, cols: 12, rows: 8, gap: 14, cards: [] }), ...(g.scr ? { scr: g.scr } : {}) };
      st.touched = true; st.edited.add(key); record();
    }
    M.cardList().then((l) => { if (!st) return; st.cards = l; palette(); side(); notes(); }).catch(() => {});
    loadTpls();
    // (camera and picture lists for the pickers; the editor works without them)
    api("/api/manage/cameras").then((r) => { if (st) { st.cams = r.all || []; side(); } }).catch(() => {});
    api("/api/manage/pictures").then((r) => {
      if (!st) return;
      st.pics = r.uploads || []; st.bgs = st.pics.filter((u) => u.style === "background");
      if ($(".bld-bgsel")) bgOptions($(".bld-bgsel"));
    }).catch(() => {});
    window.addEventListener("message", onFrame);
    document.addEventListener("pointerdown", onPalDown, true);
    document.addEventListener("pointerdown", onAnyDown, true);
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFull);
    document.body.classList.add("bld-open");
    document.addEventListener("pointerdown", onActivity, true);
    document.addEventListener("keydown", onActivity, true);
    document.addEventListener("input", onInput, true);
    draw(); remember();
    offerDraft().finally(() => { if (st) { st.draftReady = true; dirtyNow(); } });
    if (innerWidth < 1100) setFocus(true);   // (a narrow window — 800 × 1280: the panel gets the room, the sides open over it)
  };
  // the saved cards (service/templates.py)
  function loadTpls() {
    api("/api/manage/templates").then((r) => { if (st && Array.isArray(r.templates)) { st.tpls = r.templates; palette(); } }).catch(() => {});
  }
  async function tplChange(req, done) {
    try {
      const r = await api("/api/manage/templates", req);
      // (the server's words, plain: "blank card: the lock needs its device" → "Not saved: on a blank card, …")
      if (r.status !== 200) return toast(r.error ? (/^blank card: /.test(r.error) ? Kit.t("builder.err.blankCard", { reason: r.error.slice(12) }) : plainError(`Home layout: ${r.error}`)) : Kit.t("builder.err.notSaved"), true);
      if (st) { st.tpls = r.templates || []; palette(); }
      if (done) toast(done);
    } catch {}
  }
  // a new sign-in (or signed out): the builder goes, unsaved changes too — never offered to whoever signs in next
  M.onReset(() => { if (st) teardown(); });
  function teardown() {
    if (!st) return;
    document.removeEventListener("pointerdown", onPalDown, true);
    document.removeEventListener("pointerdown", onAnyDown, true);
    document.removeEventListener("pointerdown", onActivity, true);
    document.removeEventListener("keydown", onActivity, true);
    document.removeEventListener("input", onInput, true);
    clearTimeout(draftTimer);
    window.removeEventListener("message", onFrame);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("fullscreenchange", onFull);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    window.removeEventListener("beforeunload", unsavedGuard);
    document.body.classList.remove("bld-open");
    st = null;
  }
  // ← Back: with unsaved changes, the Manager's own question (Save / Cancel / Leave without saving — manage.js
  // askUnsaved), else the browser's
  const leave = async () => {
    if (!st) return;
    if (st.dirty) {
      if (typeof M.askUnsaved === "function") {
        const a = await M.askUnsaved();
        if (!st || a === "cancel" || !a) return;
        if (a === "save") { await saveIt(); if (!st || st.dirty) return; }   // (refused: stay, the reason is shown)
      } else if (!confirm(Kit.t("builder.leave.confirm"))) return;
    }
    if (st.dirty) dropDraft();   // (left without saving on purpose: no draft to offer later)
    const back = st.ctx.back; teardown(); back();
  };
  const dropDraft = () => { try { if (draftKey()) localStorage.removeItem(draftKey()); } catch {} };
  const unsavedGuard = (e) => { if (st && st.dirty) { e.preventDefault(); e.returnValue = ""; } };
  // another Manager tab while the builder is open: ask about unsaved changes, then close it (false = stay)
  // (force = true: the Manager already asked — close without asking again)
  M.leaveBuilder = (force) => {
    if (!st) return true;
    if (!force && st.dirty && !confirm(Kit.t("builder.leave.confirm"))) return false;
    if (st.dirty) dropDraft();
    teardown();
    return true;
  };
  // for the Manager's own question (Save / Cancel / Leave without saving): anything unsaved? save it (true = saved,
  // nothing left unsaved — false: a check stopped it, the card is selected and the reason shown); close it unasked
  M.builderDirty = () => !!(st && st.dirty);
  M.saveBuilder = async () => { if (!st) return true; await saveIt(); return !st || !st.dirty; };
  M.closeBuilder = () => { teardown(); };
  // merge: changes with the same key close together are one step (a slider being dragged)
  const changed = (redrawSide = true, merge = null) => {
    st.touched = true;
    if (st.ctx.room) {   // (a room's own now: "Use every room's" shows at once)
      st.edited.add(st.key);
      const rp = $(".bld-roompick"); if (rp && st.key !== "*" && !rp.querySelector("button")) rp.replaceWith(roomPicker());
    }
    dirtyNow();
    record(merge);
    if (redrawSide) side();
    if (st.ptab === "layers" && !merge) palette();
    notes(); post();
  };

  // ---------- unsaved: by what's on screen, not by what was done — a change taken back (Undo, or by hand) is none ----------
  // orig: each layout (the page, or a room key) as it was when it was first shown, or last saved — as text, without the
  // empty wheel lists the settings fill in when a card is selected (no change of its own)
  const norm = (g) => JSON.stringify(g, (k, v) => (k === "wheel" && Array.isArray(v) && !v.length ? undefined : v));
  function remember() { const k = st.ctx.room ? st.key : "home"; if (!st.orig.has(k)) st.orig.set(k, norm(st.g)); }
  // a room key's layout now (the one on screen as edited) is not what it was ("" = every room's again: only if it had its own)
  const roomNow = (k) => (k === st.key && st.touched ? st.g : st.grids[k]);
  const roomDiffers = (k) => { const v = roomNow(k);
    return v === "" ? !!(st.saved[k] && Array.isArray(st.saved[k].cards)) : v != null && norm(v) !== st.orig.get(k); };
  const lookChanged = () => Object.keys(st.look).some((k) => st.look[k] !== st.look0[k]);
  const unsaved = () => lookChanged()
    || (st.ctx.room ? [...st.edited].some(roomDiffers) : st.orig.has("home") && norm(st.g) !== st.orig.get("home"));
  // ---------- a draft in this browser (v2.7.0): a reload, a crash or an ended session doesn't lose the layout ----------
  // (no login known: no draft at all — never one shared key for everybody)
  const draftKey = () => { const u = ((M.me() || {}).user || "").toLowerCase(); return u ? `skypane.draft:${u}:${st.ctx.panel.id}:${st.ctx.room ? `room:${st.key}` : "home"}` : null; };
  function keepDraft() {
    if (!st.draftReady || !draftKey()) return;   // (not before the draft from last time was offered: opening must not erase it)
    try {
      if (st.dirty) localStorage.setItem(draftKey(), JSON.stringify({ at: Date.now(), g: st.g, look: st.look }));
      else localStorage.removeItem(draftKey());
    } catch { /* (no storage: the session guard still keeps it while the page is open) */ }
  }
  async function offerDraft() {
    let d = null;
    if (!draftKey()) return;
    try { d = JSON.parse(localStorage.getItem(draftKey()) || "null"); } catch {}
    if (!d || !d.g || !Array.isArray(d.g.cards) || JSON.stringify(d.g) === JSON.stringify(st.g)) return;
    const when = new Date(d.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const pick = await Kit.choose({ title: Kit.t("builder.draft.title"), text: Kit.t("builder.draft.text", { when }),
      buttons: [["drop", Kit.t("builder.draft.drop")], ["restore", Kit.t("builder.draft.restore"), "pri"]] });
    if (!st) return;
    if (pick === "drop") { try { localStorage.removeItem(draftKey()); } catch {} return; }
    if (pick !== "restore") return;
    st.g = toFine(d.g);
    if (d.look && typeof d.look === "object") st.look = { ...st.look, ...d.look };
    if (st.ctx.room) st.touched = true;
    st.sel = null; st.inner = null; st.sig = ""; changed(false); syncTop(); fit(); drawHandles(); side(); palette();
    toast(Kit.t("builder.draft.back"));
  }
  // (while you arrange, the session is kept alive: a real request now and then — at most every 4 minutes — never on a
  // timer of its own: an open builder nobody touches still signs out after 30 minutes)
  let lastPing = Date.now();
  // (any typing in the builder: the draft written again within half a second — debounced)
  let draftTimer = null;
  function onInput() { clearTimeout(draftTimer); draftTimer = setTimeout(() => { if (st) dirtyNow(); }, 400); }
  function onActivity() {
    if (!st || Date.now() - lastPing < 240000) return;
    lastPing = Date.now();
    fetch("/api/manage/prefs", { cache: "no-store" }).catch(() => {});
  }
  function dirtyNow() {
    st.dirty = unsaved();
    keepDraft();
    if (st.dirty) window.addEventListener("beforeunload", unsavedGuard); else window.removeEventListener("beforeunload", unsavedGuard);
    // (the top bar says it: unsaved changes, or all saved — v2.5.0)
    const u = $(".bld-unsaved");
    if (u) { u.classList.toggle("dirty", st.dirty); u.querySelector(".t").textContent = st.dirty ? Kit.t("builder.top.unsaved") : Kit.t("builder.top.allSaved"); }
    const d = $(".bld-discard"); if (d) d.disabled = !st.dirty;
  }

  // ---------- undo / redo: the last 20 states of the layout being edited (one list per page / room) ----------
  // Every change goes through changed(): the layout as it was just before becomes one step back (st.base). A new
  // change clears what could be redone. Kept while the builder is open (any card selected), not over a reload.
  const HIST_MAX = 20;
  // a step: the layout and the panel's theme / background (they're saved with it)
  const snap = () => JSON.stringify({ g: st.g, look: st.look });
  const histOf = () => { const k = st.ctx.room ? st.key : "home"; if (!st.hist.has(k)) st.hist.set(k, { undo: [], redo: [] }); return st.hist.get(k); };
  function record(merge) {
    const now = snap();
    if (now === st.base) return;
    const h = histOf(), t = Date.now();
    if (!(merge && h.merge === merge && t - h.at < 1500 && h.undo.length)) { h.undo.push(st.base); if (h.undo.length > HIST_MAX) h.undo.shift(); }
    h.redo.length = 0; h.merge = merge; h.at = t; st.base = now;
    histBtns();
  }
  function undoRedo(back) {
    if (!st || st.drag) return;
    const h = histOf(), from = back ? h.undo : h.redo, to = back ? h.redo : h.undo;
    if (!from.length) return toast(back ? Kit.t("builder.hist.noUndo") : Kit.t("builder.hist.noRedo"));
    to.push(snap()); if (to.length > HIST_MAX) to.shift();
    const s0 = JSON.parse(from.pop()), lookWas = JSON.stringify(st.look);
    st.g = s0.g; Object.assign(st.look, s0.look); st.base = snap(); h.merge = null;
    if (JSON.stringify(st.look) !== lookWas) {   // (the theme / background went back too: the boxes and the live panel follow)
      const f = $(".bld-frame"); if (f && f.contentWindow) f.contentWindow.postMessage({ t: "look", look: { ...st.look } }, location.origin);
      if ($(".bld-bgsel")) bgOptions($(".bld-bgsel"));
      const th = $(".bld-theme select"); if (th) th.value = st.look.theme;
      dockBoxes();
    }
    if (!st.g.cards.some((c) => c.i === st.sel)) st.sel = null;
    if (st.inner) { const ic = innerCard(); if (!ic) st.inner = null; else if (st.inner.sel != null && !(ic.o.parts || [])[st.inner.sel]) st.inner.sel = null; }
    st.touched = true;
    if (st.ctx.room) st.edited.add(st.key);
    dirtyNow();
    syncTop(); fit(); drawHandles(); side(); notes(); post(); histBtns();
  }
  // the ↶ ↷ buttons: greyed out when there's nothing to go back / forward to
  function histBtns() {
    if (!st) return;
    const h = histOf(), u = $(".bld-undo"), r = $(".bld-redo");
    if (u) { u.disabled = !h.undo.length; u.title = h.undo.length ? Kit.t("builder.hist.undoSteps", { n: h.undo.length }) : Kit.t("builder.hist.undo"); }
    if (r) { r.disabled = !h.redo.length; r.title = h.redo.length ? Kit.t("builder.hist.redoSteps", { n: h.redo.length }) : Kit.t("builder.hist.redo"); }
  }
  // the top bar's boxes follow an undo (overlap, join, spacing, screen)
  function syncTop() {
    const g = st.g, q = (s2) => document.querySelector(s2);
    setSw(q(".bld-ov .sw"), !!g.ov);
    setSw(q(".bld-join .sw"), !!g.join);
    if (q(".bld-gap select")) q(".bld-gap select").value = String(g.gap);
    if (q(".bld-scr select") && g.scr) q(".bld-scr select").value = `${g.scr.w}x${g.scr.h}`;
  }
  const $ = (sel) => document.querySelector(sel);

  const roomName = (id) => ((st.ctx.rooms || []).find((r) => r.id === id) || {}).name || id;
  // rooms: which layout is being edited (every room's, or one room's own) and, for every room's, the room shown with it
  // (the "Editing" box, and a room tapped on the canvas's room bar: the same way in)
  function pickRoom(key) {
    if (key === st.key) return;
    // (not a room just set back to every room's: "" stays; one put back as it was — Undo — keeps what was saved, not a copy)
    if (st.touched && roomDiffers(st.key)) st.grids[st.key] = st.g;
    else if (st.touched) { if (st.saved[st.key] == null) delete st.grids[st.key]; else st.grids[st.key] = st.saved[st.key]; st.edited.delete(st.key); }
    st.key = key; st.touched = false;
    st.g = toFine(roomStart(st.grids, key));
    if (key !== "*") st.view = key;
    st.sel = null; st.base = snap(); draw(); remember();
  }
  // (v3.0.2) the line that says it in words: "Editing: Kitchen only" / "Editing: every room — showing Kitchen as an example"
  const editWhat = () => (st.key === "*" ? (st.view ? Kit.t("builder.room.nowEvery", { room: roomName(st.view) }) : Kit.t("builder.room.nowEveryAlone")) :Kit.t("builder.room.nowOne", { room: roomName(st.key) }));
  const syncWhat = () => { const w = $(".bld-editwhat"); if (w) { w.textContent = editWhat(); w.title = editWhat(); } };
  function roomPicker() {
    const rooms = (st.ctx.rooms || []).map((r) => [r.id, (st.grids[r.id] ? Kit.t("builder.room.itsOwn", { room: r.name }) : r.name)]);
    const pick = pickRoom;
    return el("div.bld-roompick", {},
      el("b.bld-editwhat", { role: "status", title: editWhat() }, editWhat()),
      el("label.bld-f", {}, el("select", { "aria-label": Kit.t("builder.room.editing"), onchange: (e) => pick(e.target.value) },
        el("option", { value: "*", selected: st.key === "*" }, Kit.t("builder.room.every")),
        el("optgroup", { label: Kit.t("builder.room.aRoomsOwn") }, rooms.map(([id, n]) => el("option", { value: id, selected: st.key === id }, n))))),
      st.key === "*" ? el("label.bld-f.bld-showwith", {}, Kit.t("builder.room.shownWith"), el("select", { onchange: (e) => { st.view = e.target.value; syncWhat(); post(); } },
        rooms.map(([id, n]) => el("option", { value: id, selected: st.view === id }, n)))) : null,
      st.key !== "*" && (st.grids[st.key] || st.edited.has(st.key)) ? el("button.ghost.small", { type: "button", title: Kit.t("builder.room.useEveryTip"),
        onclick: async () => {   // (then the screen shows every room's layout, with this room — this room's own is gone)
          const room = st.key;
          if (!(await Kit.ask({ title: Kit.t("builder.room.useEveryAsk", { room: roomName(room) }), text: Kit.t("builder.room.useEveryText"), yes: Kit.t("builder.room.useEvery") })) || !st) return;
          st.grids[room] = ""; st.edited.add(room); st.dirty = true; window.addEventListener("beforeunload", unsavedGuard);
          st.touched = false; st.view = room; pick("*");
          toast(Kit.t("builder.room.useEveryToast", { room: roomName(room) }));
        } }, Kit.t("builder.room.useEvery")) : null);
  }

  const sel = (opts, cur, pick, label) => el("select", { "aria-label": label || null, onchange: (e) => pick(e.target.value) }, optList(opts, cur));
  // the screens to pick from: the panel's own (its page size, reported by the panel itself) marked, the layout's own kept
  function screensOf() {
    const meas = ((st.ctx.perf || []).find((p) => p.vw && p.vh) || null), mk = meas && `${meas.vw}x${meas.vh}`;
    const scr = (st.g.scr && `${st.g.scr.w}x${st.g.scr.h}`) || "1280x800";
    const screens = SCREENS.map(([k, l]) => [k, k === mk ? Kit.t("builder.screen.thisPanel", { screen: l }) : l]);
    if (mk && !SCREENS.some(([k]) => k === mk)) screens.unshift([mk, Kit.t("builder.screen.measured", { w: meas.vw, h: meas.vh })]);
    if (!screens.some(([k]) => k === scr)) screens.push([scr, scr.replace("x", " × ")]);
    return { meas, scr, screens };
  }
  // "Start from…": a built-in layout, another room's or another panel's (the layout on screen: st.g — drawn without
  // loading the panel page again)
  function startFromSel() {
    return el("select", { "aria-label": Kit.t("builder.start.aria"), onchange: async (e) => {
      const v = e.target.value, g = st.g; e.target.value = "";
      if (!v || (g.cards.length && !(await Kit.ask({ title: Kit.t("builder.start.askTitle"), text: Kit.t("builder.start.askText"), yes: Kit.t("builder.start.askYes") }))) || !st) return;
      if (v.startsWith("panel:")) {
        try {
          const r = await api(`/api/manage/panels/${encodeURIComponent(v.slice(6))}`);
          const other = r.managed && r.managed.homeGrid;
          if (!other || !Array.isArray(other.cards)) return toast(Kit.t("builder.start.noLayout"), true);
          st.g = toFine({ ...structuredClone(other), scr: g.scr });
        } catch { return; }
      } else if (v.startsWith("room:")) {
        const other = st.grids[v.slice(5)];
        if (!other || !Array.isArray(other.cards)) return;
        st.g = toFine({ ...structuredClone(other), scr: g.scr });
      } else {   // (a built-in layout is on the old 12 × 8 grid with gaps: toFine leaves the gap around each card, as before)
        const spacing = st.g.gap;
        st.g = { ...toFine({ ...st.g, v: 1, cols: 12, rows: 8, sp: false, gap: 14, cards: presets()[v][1]() }), gap: spacing };
      }
      st.sel = null; st.inner = null; st.sig = ""; changed(false); syncTop(); fit(); drawHandles(); side(); palette();
    } }, el("option", { value: "" }, Kit.t("builder.start.label")),
      el("optgroup", { label: st.ctx.room ? Kit.t("builder.start.roomLayouts") : Kit.t("builder.start.builtIn") }, Object.entries(presets()).map(([k, [n]]) => el("option", { value: k }, n))),
      st.ctx.room && Object.keys(st.grids).filter((k) => k !== st.key && st.grids[k]).length
        ? el("optgroup", { label: Kit.t("builder.start.copyRoom") }, Object.keys(st.grids).filter((k) => k !== st.key && st.grids[k]).map((k) =>
          el("option", { value: "room:" + k }, k === "*" ? Kit.t("builder.start.everyRooms") : roomName(k)))) : null,
      !st.ctx.room && (st.ctx.panels || []).filter((p) => p.id !== st.ctx.panel.id).length
        ? el("optgroup", { label: Kit.t("builder.start.copyPanel") }, st.ctx.panels.filter((p) => p.id !== st.ctx.panel.id).map((p) => el("option", { value: "panel:" + p.id }, p.name))) : null);
  }
  const pageName = () => (st.ctx.room ? (st.key === "*" ? Kit.t("builder.page.everyRoom") : Kit.t("builder.page.room", { room: roomName(st.key) })) : Kit.t("builder.page.home"));

  // the builder's chrome (v2.5.0, the new Manager look — the design notes "BUILDER"): a top bar (Done,
  // where you are, the screen, Arrange / Try it, Focus, full screen, undo / redo, saved or not, Discard, Save), the cards
  // to add on the left (Cards / Layers), the panel in the middle, the selected card's settings on the right — or, with
  // none selected, the page's own (start from, the grid, the look, the room bar). Focus (F) hides both sides; a small
  // bar floats over the panel then (Cards / Card settings open that side over it for a moment, Exit focus).
  function draw() {
    const g = st.g;
    st.inner = null;
    const { meas, scr, screens } = screensOf();
    // (the panel's own size wins over the one the layout was saved with — unless picked from the list just now)
    if (meas && !st.scrPicked && (!g.scr || g.scr.w !== meas.vw || g.scr.h !== meas.vh)) {
      if (g.scr && !st.scrToldOnce) { st.scrToldOnce = true; toast(Kit.t("builder.screen.setTo", { w: meas.vw, h: meas.vh, sw: g.scr.w, sh: g.scr.h })); }
      g.scr = { w: meas.vw, h: meas.vh };
    }
    const scrNow = (g.scr && `${g.scr.w}x${g.scr.h}`) || scr;
    const modeSeg = () => el("div.seg.bld-mode", { role: "group", "aria-label": Kit.t("builder.mode.aria") }, [["arrange", Kit.t("builder.mode.arrange")], ["try", Kit.t("builder.mode.try")]].map(([v, l]) =>
      el("button" + (st.mode === v ? ".cur" : ""), { type: "button", "data-mode": v, title: v === "try" ? Kit.t("builder.mode.tryTip") : Kit.t("builder.mode.arrangeTip"),
        onclick: () => setMode(v) }, l)));
    // full screen: a small bar on top (arrange or try, snap, exit) — the cards can be moved there too
    const fsbar = el("div.bld-fsbar", {}, modeSeg(),
      el("label.bld-snap", {}, el("input", { type: "checkbox", checked: st.snap, onchange: (e) => { st.snap = e.target.checked; setSw($(".bld-page .bld-psnap .sw"), st.snap); } }), Kit.t("builder.fs.snap")),
      el("small", {}, Kit.t("builder.fs.hint")),
      el("button.ghost.small", { type: "button", onclick: () => document.exitFullscreen().catch(() => {}) }, Kit.t("builder.fs.exit")));
    const ib = (cls, label, icon, onclick, tip) => el(`button.btn.bld-ib${cls}`, { type: "button", "aria-label": label, title: tip || label, onclick }, Kit.icon(icon, 16));
    const top = el("div.bld-top", {},
      el("button.btn.ghost.bld-done", { type: "button", title: Kit.t("builder.top.doneTip"), onclick: leave }, Kit.icon("chevL", 16), Kit.t("builder.top.done")),
      el("span.vr"),
      el("div.bld-crumb", {}, el("span", {}, st.ctx.panel.name), Kit.icon("chevR", 14), el("b", {}, st.ctx.room ? Kit.t("builder.top.roomPages") : Kit.t("builder.page.home"))),
      st.ctx.room ? roomPicker() : null,
      el("span.sp"),
      el("label.bld-f.bld-scr", { title: meas ? Kit.t("builder.screen.reports", { w: meas.vw, h: meas.vh }) : Kit.t("builder.screen.reportsLater") },
        el("span.bld-hide-s", {}, Kit.t("builder.screen.label")),
        sel(screens, scrNow, (v) => { const [w, h] = v.split("x").map(Number); st.g.scr = { w, h }; st.scrPicked = true; st.sig = ""; changed(false); fit(); }, Kit.t("builder.screen.size"))),
      modeSeg(),
      el("button.btn.bld-focusb", { type: "button", "aria-pressed": String(!!st.focus), title: Kit.t("builder.focus.tip"), onclick: () => setFocus(!st.focus) },
        Kit.icon(st.focus ? "minimize" : "maximize", 15), el("span.bld-hide-s", {}, st.focus ? Kit.t("builder.focus.exit") : Kit.t("builder.focus.label"))),
      ib("", Kit.t("builder.top.full"), "full", fullScreen, Kit.t("builder.top.fullTip")),
      el("span.vr"),
      ib(".bld-undo", Kit.t("builder.hist.undoLabel"), "undo", () => undoRedo(true), Kit.t("builder.hist.undo")),
      ib(".bld-redo", Kit.t("builder.hist.redoLabel"), "redo", () => undoRedo(false), Kit.t("builder.hist.redo")),
      el("span.vr.bld-hide-s"),
      el("span.bld-unsaved", { role: "status" }, el("span.dot"), el("span.t")),
      el("button.btn.bld-discard", { type: "button", title: Kit.t("builder.top.discardTip"), onclick: discard }, Kit.t("builder.top.discard")),
      el("button.btn.pri.bld-save", { type: "button", title: Kit.t("builder.top.saveTip"), onclick: saveIt }, Kit.t("builder.top.save")));
    // the panel's own page, live, in demo mode (design.js) — the handles (gridstack) sit on top of it
    // (v3.0.2: no built-in "main" at / any more — / is the pairing page; every panel has its own address)
    const id = st.ctx.panel.id, src = `${st.ctx.panel.address || `/${encodeURIComponent(id)}`}?design=1`;
    // (Arrange: the frame is no Tab stop — Tab goes from the cards to the settings, not through 60 panel buttons; Try it: it is)
    const frame = el("iframe.bld-frame", { src, title: Kit.t("builder.frame.title"), tabindex: st.mode === "try" ? null : "-1" });
    const over = el("div.bld-over");
    // (editing inside a blank card: around it is dimmed — a click there is "Done")
    const mask = el("div.bld-inmask", { title: Kit.t("builder.inner.maskTip"), onclick: () => leaveInner() });
    const screen = el("div.bld-screen" + (st.mode === "try" ? ".trying" : ""), {}, frame, mask, over, dockProxyEl(), fsbar, el("div.bld-wait", {}, Kit.t("builder.frame.loading")));
    const ptabs = el("div.bld-ptabs", { role: "tablist", "aria-label": Kit.t("builder.pal.paneAria") }, [["cards", Kit.t("builder.pal.cards"), "cards"], ["layers", Kit.t("builder.pal.layers"), "layers"]].map(([k, n, i]) =>
      el("button" + ((st.ptab || "cards") === k ? ".on" : ""), { type: "button", role: "tab", "aria-selected": String((st.ptab || "cards") === k), "data-ptab": k,
        onclick: () => { st.ptab = k; for (const b of ptabs.children) { const on = b.dataset.ptab === k; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); } palette(); } }, Kit.icon(i, 15), n)));
    const fbar = el("div.bld-fbar", { role: "toolbar", "aria-label": Kit.t("builder.focus.label") }, el("span.bld-fname", {}, Kit.t("builder.focus.name", { page: pageName() })), el("span.vr"),
      el("button.btn.sm.bld-fcards", { type: "button", "aria-pressed": "false", onclick: () => setPeek("pal") }, Kit.icon("cards", 14), Kit.t("builder.pal.cards")),
      el("button.btn.sm.bld-finsp", { type: "button", "aria-pressed": "false", onclick: () => setPeek("insp") }, Kit.icon("settings", 14), Kit.t("builder.focus.cardSettings")),
      el("span.vr"),
      el("button.btn.sm.pri", { type: "button", onclick: () => setFocus(false) }, Kit.t("builder.focus.exit"), el("kbd", {}, "F")));
    const layout = el("div.bld" + (st.focus ? ".focus" : ""), {}, top,
      el("aside.bld-pal-col", { "aria-label": Kit.t("builder.pal.aria") }, ptabs, el("div.bld-pal-scroll"),
        el("div.bld-trash", { title: Kit.t("builder.bin.tip"),
          onclick: () => { const c = st.g.cards.find((x) => x.i === st.sel); if (c) remove(c); else toast(Kit.t("builder.bin.toast")); } }, Kit.icon("trash", 18), el("span", {}, Kit.t("builder.bin.label")))),
      el("div.bld-stage", {}, el("div.bld-canvas", {}, screen), el("div.bld-notes"), fbar),
      el("div.bld-side", { "aria-label": Kit.t("builder.side.aria"), onkeydown: (e) => { if (e.key === "Tab") { st.tabFrom = { el: e.target, dir: e.shiftKey ? -1 : 1 }; setTimeout(() => { if (st) st.tabFrom = null; }); } } }));
    M.$main.replaceChildren(layout);
    st.drag = null; st.rect = null; st.sig = "";
    palette(); fit(); side(); notes(); histBtns(); dirtyNow();
  }
  // the page's own settings (the right side while no card is selected): what it starts from, the grid, the panel's look
  function pagePanel() {
    const g = st.g;
    const themes = [...Object.entries(window.THEMES || {}).map(([k, t]) => [k, t.name || k]),
      ...(st.look0.theme === "custom" ? [["custom", Kit.t("panels.look.custom")]] : [])];   // (v3.0.2: the owner's own colour — picked on Look & layout)
    const bgSel = bgOptions(el("select.bld-bgsel", { "aria-label": Kit.t("builder.look.background"), onchange: (e) => setLook({ background: e.target.value }) }));
    const sec2 = (title, ...rows) => el("div.bld-psec", {}, el("h4", {}, title), ...rows.filter(Boolean));
    const line = (label, ctl, cls = "") => el(`label.bld-f.bld-pl${cls}`, {}, el("span", {}, label), ctl);
    // (v2.5.0: the Manager's switches, as on the Setup pages — handlers get {target: {checked}} as from a check box)
    const check = (cls, label, on, onchange, tip) => el(`div.bld-f.bld-pl.bld-pck${cls}`, { title: tip || "" }, el("span", {}, label),
      Kit.sw(on, (v) => onchange({ target: { checked: v } }), label));
    const n = g.cards.length;
    return el("div.bld-page", {},
      el("div.bld-ih", {}, el("span.di", {}, Kit.icon(st.ctx.room ? "home" : "dash", 18)), el("div", {}, el("b", {}, pageName()), el("small", {}, Kit.t("builder.page.nothingSel", { n })))),
      el("div.bld-psec", {}, el("h4", {}, Kit.t("builder.page.layout")), line(Kit.t("builder.page.startFrom"), startFromSel())),
      sec2(Kit.t("builder.page.grid"),
        check(".bld-psnap", Kit.t("builder.fs.snap"), st.snap, (e) => { st.snap = e.target.checked; try { localStorage.setItem("bld.snap", st.snap ? "1" : "0"); } catch {} },
          Kit.t("builder.page.snapTip")),
        check(".bld-ov", Kit.t("builder.page.overlap"), !!g.ov, (e) => { if (e.target.checked) st.g.ov = true; else { delete st.g.ov; overlapNote(); } changed(false); side(); },
          Kit.t("builder.page.overlapTip")),
        check(".bld-join", Kit.t("builder.page.join"), !!g.join, (e) => { if (e.target.checked) st.g.join = true; else delete st.g.join; changed(false); },
          Kit.t("builder.page.joinTip")),
        // (the spacing kept between cards that snap next to each other — cards are always drawn at the size they're given)
        line(Kit.t("builder.page.spacing"), sel([0, 4, 6, 10, 14, 20, 28].map((x) => [x, Kit.t("builder.page.px", { n: x })]), g.gap, (v) => { st.g.gap = +v; changed(false); }, Kit.t("builder.page.spacingAria")), ".bld-gap")),
      sec2(Kit.t("builder.look.title"), themes.length ? line(Kit.t("builder.look.theme"), sel(themes, st.look.theme, (v) => setLook({ theme: v }), Kit.t("builder.look.theme")), ".bld-theme") : null, line(Kit.t("builder.look.background"), bgSel)),
      // the room bar's look (its place: Panels → Look & layout → Room bar); a style starts with its own names setting
      sec2(Kit.t("builder.dock.title"),
        line(Kit.t("builder.dock.style"), sel((M.DOCK_STYLES || []).map(([k, x]) => [k, x]), st.look.dockStyle, (v) => setLook({ dockStyle: v, dockLabels: v !== "rail" }), Kit.t("builder.dock.styleAria")), ".bld-dock"),
        check(".bld-dlab", Kit.t("builder.dock.names"), st.look.dockLabels, (e) => setLook({ dockLabels: e.target.checked }), Kit.t("builder.dock.namesTip")),
        check(".bld-dauto", Kit.t("builder.dock.autoHide"), st.look.dockAutoHide, (e) => setLook({ dockAutoHide: e.target.checked }), Kit.t("builder.dock.autoHideTip"))),
      el("div.bld-empty", {}, el("span.ei", {}, Kit.icon("cards", 18)), el("b", {}, Kit.t("builder.empty.title")),
        el("p", {}, Kit.t("builder.empty.text")),
        el("p", {}, Kit.t("builder.empty.try"))));
  }
  // Focus (F): the side panes hidden, the panel as big as it gets; a side can be opened over it for a moment (peek)
  function setFocus(on) {
    if (!st) return;
    st.focus = !!on; st.peek = null;
    const b = $(".bld"); if (b) { b.classList.toggle("focus", st.focus); b.classList.remove("peek-pal", "peek-insp"); }
    const fb = $(".bld-focusb");
    if (fb) { fb.setAttribute("aria-pressed", String(st.focus)); fb.replaceChildren(Kit.icon(st.focus ? "minimize" : "maximize", 15), el("span.bld-hide-s", {}, st.focus ? Kit.t("builder.focus.exit") : Kit.t("builder.focus.label"))); }
    for (const x of document.querySelectorAll(".bld-fbar [aria-pressed]")) x.setAttribute("aria-pressed", "false");
    fit(); setTimeout(() => { if (st) fit(); }, 230);
  }
  function setPeek(which) {
    if (!st || !st.focus) return;
    st.peek = st.peek === which ? null : which;
    const b = $(".bld"); if (!b) return;
    b.classList.toggle("peek-pal", st.peek === "pal"); b.classList.toggle("peek-insp", st.peek === "insp");
    const c = $(".bld-fcards"), i = $(".bld-finsp");
    if (c) c.setAttribute("aria-pressed", String(st.peek === "pal"));
    if (i) i.setAttribute("aria-pressed", String(st.peek === "insp"));
  }
  // Discard: the layout as it was saved (the builder opened again; asked first)
  async function discard() {
    if (!st) return;
    if (!st.dirty) return toast(Kit.t("builder.discard.nothing"));
    if (!(await Kit.ask({ title: Kit.t("builder.discard.title"), text: Kit.t("builder.discard.text"), yes: Kit.t("builder.discard.yes"), no: Kit.t("builder.discard.no"), danger: true })) || !st) return;
    const ctx = { ...st.ctx, managed: st.ctx.latest ? st.ctx.latest() : st.ctx.managed }, focus = st.focus, ptab = st.ptab;
    teardown();
    await M.openBuilder(ctx);
    if (st) { st.ptab = ptab; if (focus) setFocus(true); palette(); }
    toast(Kit.t("builder.discard.done"));
  }

  // (the built-in scenes: backgrounds.js, the panel's own list)
  const BUILT_BG = (window.BACKGROUNDS || [{ id: "mountains", name: Kit.t("builder.look.mountains") }]).map((b) => [b.id, b.name]);
  function bgOptions(select) {
    select.replaceChildren(
      el("optgroup", { label: Kit.t("builder.look.builtIn") }, BUILT_BG.map(([k, n]) => el("option", { value: k, selected: st.look.background === k }, n))),
      st.bgs.length ? el("optgroup", { label: Kit.t("builder.look.yourPictures") }, st.bgs.map((u) => el("option", { value: "up:" + u.id, selected: st.look.background === "up:" + u.id }, u.name))) : null);
    return select;
  }
  function setLook(patch) {
    Object.assign(st.look, patch);
    const was = st.touched, had = st.edited.has(st.key);
    changed(false);
    if (st.ctx.room) { st.touched = was; if (!had) st.edited.delete(st.key); }   // (the theme is no room layout: it switches no room to one)
    const f = $(".bld-frame"); if (f && f.contentWindow) f.contentWindow.postMessage({ t: "look", look: { ...st.look } }, location.origin);
    dockBoxes();
  }
  // the room bar's boxes show the look as it is now (a style picked resets its names; Undo)
  function dockBoxes() {
    const s = $(".bld-dock select");
    if (s) s.value = st.look.dockStyle;
    setSw($(".bld-dlab .sw"), st.look.dockLabels); setSw($(".bld-dauto .sw"), st.look.dockAutoHide);
  }
  // a kit switch shown on / off without running its change
  function setSw(n, on) { if (!n) return; n.classList.toggle("on", !!on); n.setAttribute("aria-checked", String(!!on)); }

  // full screen: the panel alone, filling the screen, to use as on the wall (a demo) — Esc comes back
  function fullScreen() {
    const screen = $(".bld-screen"); if (!screen || !screen.requestFullscreen) return toast(Kit.t("builder.fs.cant"), true);
    screen.requestFullscreen().catch(() => toast(Kit.t("builder.fs.refused"), true));
  }
  function onFull() {
    if (!st) return;
    const screen = $(".bld-screen"), on = !!screen && document.fullscreenElement === screen;
    if (screen) screen.classList.toggle("fs", on);
    fit();
  }

  // ---------- the live panel ----------
  // its page at the panel's own screen size, scaled to fit between the side columns
  function fit() {
    const stage = $(".bld-stage"), screen = $(".bld-screen"), frame = $(".bld-frame"); if (!stage || !screen || !frame) return;
    // (tell the canvas which blank card is being edited inside: it hides that card's "Empty — select it…" hint)
    try {
      const w = frame.contentWindow, now = st.inner ? st.inner.id : null;
      if (w && w.Grid && w.Grid.editingInside !== now) { w.Grid.editingInside = now; if (w.App && w.App.render) w.App.render(); }
    } catch { /* (the canvas not loaded yet) */ }
    const scr = st.g.scr || { w: 1280, h: 800 };
    const full = screen.classList.contains("fs"), tb = $(".bld-top");
    if (tb) document.documentElement.style.setProperty("--bld-top", `${tb.offsetHeight + 8}px`);   // (Focus: a side opened over the panel starts under it)
    // (v2.5.0: the middle of the builder, under its top bar — room kept under the panel for the load meter, or in Focus
    // for the floating bar)
    const availW = full ? innerWidth : Math.max(240, stage.clientWidth - 48), availH = full ? innerHeight : Math.max(220, stage.clientHeight - (st.focus ? 92 : 112));
    const k = Math.min(availW / scr.w, availH / scr.h, full ? 4 : 1);
    st.k = k;
    screen.style.width = full ? "" : `${Math.round(scr.w * k)}px`; screen.style.height = full ? "" : `${Math.round(scr.h * k)}px`;
    frame.style.width = `${scr.w}px`; frame.style.height = `${scr.h}px`; frame.style.transform = `scale(${k})`;
    st.off = full ? { x: Math.round((availW - scr.w * k) / 2), y: Math.round((availH - scr.h * k) / 2) } : { x: 0, y: 0 };
    frame.style.left = `${st.off.x}px`; frame.style.top = `${st.off.y}px`;
    place();
  }
  let resizeTimer = null;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (st) fit(); }, 150); };

  function onFrame(e) {
    const frame = $(".bld-frame");
    if (!st || !frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data; if (!m || typeof m !== "object") return;
    if (m.t === "ready") {
      $(".bld-wait") && $(".bld-wait").remove(); post(true);
      if (lookChanged()) setLook({});
    }
    else if (m.t === "rect" && [m.x, m.y, m.w, m.h].every(Number.isFinite)) { st.rect = m; place(); }
  }
  // the layout being edited → the panel page (while dragging: the cards where they are right now)
  let postQueued = false;
  function post(now) {
    if (!st) return;
    if (!now) { if (postQueued) return; postQueued = true; requestAnimationFrame(() => { postQueued = false; post(true); }); return; }
    const frame = $(".bld-frame"); if (!frame || !frame.contentWindow) return;
    // (every room's layout is shown as the room on screen's own: a room with a layout of its own saved — or one just set
    // back to every room's — would otherwise keep showing that one)
    frame.contentWindow.postMessage({ t: "grid", grid: live(), ...(st.ctx.room ? { room: { key: st.key === "*" ? st.view : st.key, view: st.view } } : {}) }, location.origin);
  }
  // ---------- moving and resizing: our own (pointer events), over the panel's fine grid ----------
  // The panel's #main content box is cols × rows cells with no gaps; each card is inset by gap / 2. The handles are boxes
  // at the same cells. Nothing is ever pushed out of the way: with "Allow overlap" off, a card that would land on another
  // shows red and goes back; on, cards stack (each card's z: Bring to front / Send to back).
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const fits = (r, id) => !!st.g.ov || !st.g.cards.some((c) => c.i !== id && overlaps(r, c));
  // where a card would land (in cells): snapped to the grid's steps (Snap to grid), then lined up with the other cards'
  // edges and centres (within ALIGN cells: a guide shows); the guides are drawn here
  function settle(id, mode, fx, fy, fw, fh, free) {
    const g = st.g, grid = st.snap && !free, q = (v) => (grid ? Math.round(v / SNAP) * SNAP : Math.round(v)), min = grid ? SNAP : 1;
    // (moving keeps the card's size exactly; only resizing goes by the grid's steps)
    let w = mode === "move" ? cl(Math.round(fw), 1, g.cols) : cl(q(fw), min, g.cols), h = mode === "move" ? cl(Math.round(fh), 1, g.rows) : cl(q(fh), min, g.rows), x, y;
    if (mode === "resize") {   // (the top-left corner stays: only the size changes, up to the screen's edge)
      x = Math.round(fx); y = Math.round(fy); w = cl(w, Math.min(min, g.cols - x), g.cols - x); h = cl(h, Math.min(min, g.rows - y), g.rows - y);
    } else { x = cl(q(fx), 0, g.cols - w); y = cl(q(fy), 0, g.rows - h); }
    // (line up / keep the spacing: measured where the pointer really is, not the grid step — within 3 screen pixels it lands
    // exactly there, even between grid steps; no pull from further away; none while Alt is held)
    const lines = [], ALIGN = free ? -1 : 3 / Math.max(1, st.cell ? st.cell.cw : 1), others = g.cards.filter((c) => c.i !== id);
    const ex = mode === "resize" ? x : fx, ey = mode === "resize" ? y : fy, ew = mode === "resize" ? fw : w, eh = mode === "resize" ? fh : h;
    // the spacing between neighbours (the Spacing box), in cells of this panel
    const gx = st.rect ? Math.round((g.gap || 0) / (st.rect.w / g.cols)) : 0, gy = st.rect ? Math.round((g.gap || 0) / (st.rect.h / g.rows)) : 0;
    // [my edge, where it would go, the guide (where the other card's edge is)]
    const best = (pairs) => { let b = null; for (const [mv, t, at, gap] of pairs) { const d = t - mv; if (Math.abs(d) <= ALIGN && (!b || Math.abs(d) < Math.abs(b.d))) b = { d, at, gap }; } return b; };
    const pairsX = (lo, hi, mid) => others.flatMap((c) => [
      ...(lo != null ? [[lo, c.x, c.x], [lo, c.x + c.w, c.x + c.w], [lo, c.x + c.w + gx, c.x + c.w, gx]] : []),
      ...(hi != null ? [[hi, c.x + c.w, c.x + c.w], [hi, c.x, c.x], [hi, c.x - gx, c.x, -gx]] : []),
      ...(mid != null ? [[mid, c.x + c.w / 2, c.x + c.w / 2]] : [])]);
    const pairsY = (lo, hi, mid) => others.flatMap((c) => [
      ...(lo != null ? [[lo, c.y, c.y], [lo, c.y + c.h, c.y + c.h], [lo, c.y + c.h + gy, c.y + c.h, gy]] : []),
      ...(hi != null ? [[hi, c.y + c.h, c.y + c.h], [hi, c.y, c.y], [hi, c.y - gy, c.y, -gy]] : []),
      ...(mid != null ? [[mid, c.y + c.h / 2, c.y + c.h / 2]] : [])]);
    const bx = best(mode === "resize" ? pairsX(null, ex + ew, null) : pairsX(ex, ex + ew, ex + ew / 2));
    // (a guide only when the card really got there — not when the screen's edge stopped it short)
    if (bx) { if (mode === "resize") w = cl(Math.round(ew + bx.d), 1, g.cols - x); else x = cl(Math.round(ex + bx.d), 0, g.cols - w);
      if (Math.abs((mode === "resize" ? x + w : x) - Math.round(mode === "resize" ? ew + bx.d + x : ex + bx.d)) < 0.5) lines.push(["v", bx.at, bx.gap]); }
    const by = best(mode === "resize" ? pairsY(null, ey + eh, null) : pairsY(ey, ey + eh, ey + eh / 2));
    if (by) { if (mode === "resize") h = cl(Math.round(eh + by.d), 1, g.rows - y); else y = cl(Math.round(ey + by.d), 0, g.rows - h);
      if (Math.abs((mode === "resize" ? y + h : y) - Math.round(mode === "resize" ? eh + by.d + y : ey + by.d)) < 0.5) lines.push(["h", by.at, by.gap]); }
    guides(lines);
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }
  // the guide lines over the screen (the cells where edges line up)
  function guides(lines) {
    const over = $(".bld-over"); if (!over || !st.cell) return;
    let box = over.querySelector(".bld-guides");
    if (!box) { box = el("div.bld-guides"); over.append(box); }
    // (a spacing guide: the neighbour's edge, and the gap to it shaded)
    box.replaceChildren(...lines.flatMap(([d, at, gap]) => [el("i." + d, { style: d === "v" ? `left:${at * st.cell.cw}px` : `top:${at * st.cell.ch}px` }),
      gap ? el("b." + d, { style: d === "v" ? `left:${Math.min(at, at + (gap > 0 ? 0 : gap)) * st.cell.cw}px;width:${Math.abs(gap) * st.cell.cw}px` : `top:${Math.min(at, at + (gap > 0 ? 0 : gap)) * st.cell.ch}px;height:${Math.abs(gap) * st.cell.ch}px` }) : null].filter(Boolean)));
  }
  // the layout as the panel should show it right now (a card being moved: where it would land)
  const live = () => {
    const pd = st.pdrag, ic = pd && innerCard();
    if (ic) return { ...st.g, cards: st.g.cards.map((c) => (c === ic ? { ...c, o: { ...c.o, parts: (c.o.parts || []).map((p, k) => (k === pd.n ? { ...p, ...pd.r } : p)) } } : c)) };
    const d = st.drag;
    if (!d || !d.moved || !d.id) return st.g;
    return { ...st.g, cards: st.g.cards.map((c) => (c.i === d.id ? { ...c, ...d.rect, z: 99 } : c)) };
  };
  function setMode(m) {
    if (m === "try" && st.inner) { st.inner = null; fit(); side(); }   // (Try it: the whole page, as on the wall)
    st.mode = m;
    document.querySelectorAll(".bld-mode button").forEach((b) => b.classList.toggle("cur", b.dataset.mode === m));
    $(".bld-screen") && $(".bld-screen").classList.toggle("trying", m === "try");
    const fr = $(".bld-frame"); if (fr) { if (m === "try") fr.removeAttribute("tabindex"); else fr.setAttribute("tabindex", "-1"); }
    dockProxy();
    const f = $(".bld-frame");
    if (f && f.contentWindow) f.contentWindow.postMessage({ t: m === "arrange" ? "home" : "try" }, location.origin);
  }

  // ---------- the room bar on the canvas (Arrange): drag it, its arrows, a room = that room's page ----------
  // The canvas takes no pointer while arranging (the handles do that), so a see-through box lies over the panel's room bar
  // (its .dock-rail: the rooms and the ‹ › arrows) and passes a drag, a wheel and a tap on to it (same origin). Hidden when
  // the panel has no room bar (dockOff), while trying / benchmarking, and while editing inside a card.
  function dockInfo() {
    const frame = $(".bld-frame");
    let doc = null; try { doc = frame && frame.contentDocument; } catch { /* (not ours) */ }
    const sc = doc && doc.querySelector("#dock .dock-rooms"), rail = sc && sc.parentElement;
    if (!rail) return null;
    const fr = frame.getBoundingClientRect(), k = frame.offsetWidth ? fr.width / frame.offsetWidth : st.k || 1;
    const c = doc.documentElement.classList, vert = c.contains("dock-left") || c.contains("dock-right");
    return { frame, doc, win: frame.contentWindow, sc, rail, fr, k, vert };
  }
  function dockProxyEl() {
    const px = el("div.bld-dockproxy", { hidden: true, title: Kit.t("builder.dock.proxyTip") });
    let g = null;
    const hit = (e, d) => d && d.doc.elementFromPoint((e.clientX - d.fr.left) / d.k, (e.clientY - d.fr.top) / d.k);
    px.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !st || st.mode !== "arrange") return;
      const d = dockInfo(); if (!d) return;
      e.preventDefault(); e.stopPropagation();
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, l: d.sc.scrollLeft, t: d.sc.scrollTop, moved: false };
      try { px.setPointerCapture(e.pointerId); } catch {}
    });
    px.addEventListener("pointermove", (e) => {
      const d = dockInfo(); if (!d) return;
      if (!g || e.pointerId !== g.id) { const t = hit(e, d); px.classList.toggle("on-btn", !!(t && t.closest && t.closest("button"))); return; }
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.moved) { if (Math.hypot(dx, dy) <= 6) return; g.moved = true; px.classList.add("dragging"); }
      if (d.vert) d.sc.scrollTop = g.t - dy / d.k; else d.sc.scrollLeft = g.l - dx / d.k;
    });
    const end = (e, tap) => {
      if (!g || e.pointerId !== g.id) return;
      const was = g; g = null; px.classList.remove("dragging");
      if (!tap || was.moved) return;
      const d = dockInfo(), t = hit(e, d); if (!t || !t.closest) return;
      const more = t.closest("#dock .dock-more"), room = t.closest("#dock button[data-room]");
      if (more) more.click();   // (the panel's own: about one bar's width)
      else if (room) dockRoom(room.dataset.room);
    };
    px.addEventListener("pointerup", (e) => end(e, true));
    px.addEventListener("pointercancel", (e) => end(e, false));
    px.addEventListener("wheel", (e) => {
      const d = dockInfo(); if (!d || e.ctrlKey) return;
      const u = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? (d.vert ? d.sc.clientHeight : d.sc.clientWidth) : 1;
      const v = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * u;
      if (d.vert) d.sc.scrollTop += v; else d.sc.scrollLeft += v;
      e.preventDefault();
    }, { passive: false });
    return px;
  }
  // a room tapped on the canvas's room bar: the builder's own way to that room (the "Editing" / "Shown with" boxes)
  function dockRoom(id) {
    if (!id) return;
    if (!st.ctx.room) return toast(Kit.t("builder.dock.notHere", { room: roomName(id) }));
    const d = dockInfo(); if (d) st.dockKeep = [d.sc.scrollLeft, d.sc.scrollTop];   // (the new canvas: the bar where it was)
    if (st.key === "*" && !st.grids[id]) {   // every room's layout: only which room it is shown with changes
      if (st.view === id) return;
      st.view = id; st.dockKeep = null;
      const s = document.querySelector(".bld-showwith select"); if (s) s.value = id;
      syncWhat(); post();
      return;
    }
    if (id === st.key) { st.dockKeep = null; return; }
    pickRoom(id);
    toast(Kit.t(st.grids[id] ? "builder.dock.nowOwn" : "builder.dock.nowNew", { room: roomName(id) }));
  }
  // the box over the room bar, where the bar is right now (the canvas is scaled by st.k)
  function dockProxy() {
    const px = $(".bld-dockproxy"), screen = $(".bld-screen"); if (!px || !screen) return;
    const d = dockInfo();
    let r = null;
    if (d && st.mode === "arrange" && !innerCard()) {
      const dk = d.doc.getElementById("dock"), cs = dk && d.win.getComputedStyle(dk);
      const rr = d.rail.getBoundingClientRect();
      if (cs && cs.display !== "none" && cs.visibility !== "hidden" && !d.doc.documentElement.classList.contains("dock-off") && rr.width > 2 && rr.height > 2) r = rr;
      // (a room bar that came back with a new canvas: scrolled as it was)
      if (st.dockKeep && d.sc.querySelector("button[data-room]")) { [d.sc.scrollLeft, d.sc.scrollTop] = st.dockKeep; st.dockKeep = null; }
      if (!st.dockObs || st.dockObs.doc !== d.doc) {   // (the bar moving or growing without the grid moving)
        if (st.dockObs) st.dockObs.ro.disconnect();
        try { const ro = new d.win.ResizeObserver(() => { if (st) dockProxy(); }); ro.observe(d.doc.getElementById("dock")); ro.observe(d.rail); st.dockObs = { doc: d.doc, ro }; } catch { st.dockObs = null; }
      }
    }
    px.hidden = !r;
    if (!r) return;
    const sb = screen.getBoundingClientRect();
    Object.assign(px.style, { left: `${d.fr.left - sb.left - screen.clientLeft + r.left * d.k}px`, top: `${d.fr.top - sb.top - screen.clientTop + r.top * d.k}px`,
      width: `${r.width * d.k}px`, height: `${r.height * d.k}px` });
  }

  // ---------- the handles: one box per card, at the panel's cells ----------
  function place() {
    const over = $(".bld-over"); if (!over) return;
    const r = st.rect, g = st.g, k = st.k || 1;
    dockProxy();
    over.hidden = !r || !r.home;
    if (!r || !r.home) return;
    const off = st.off || { x: 0, y: 0 };   // (full screen: the picture is centred)
    st.cell = { cw: (r.w * k) / g.cols, ch: (r.h * k) / g.rows, m: g.sp ? 0 : (g.gap * k) / 2 };
    const ic = innerCard(), screen = $(".bld-screen"), frame = $(".bld-frame");
    if (st.inner && !ic) st.inner = null;
    if (screen) screen.classList.toggle("inner", !!ic);
    over.classList.toggle("bld-inner", !!ic);
    if (ic && screen && frame) {   // editing inside a blank card: the panel zoomed so the card fills the screen
      const cw = r.w / g.cols, ch = r.h / g.rows, x0 = r.x + ic.x * cw, y0 = r.y + ic.y * ch, w0 = ic.w * cw, h0 = ic.h * ch;
      const SW = screen.clientWidth, SH = screen.clientHeight, pad = 30;
      // (a tiny card too fills the screen — no cap on the zoom; the panel is moved so it covers the screen where it can,
      // not centred on the card with the empty space beside the panel showing as a dark strip)
      const K = Math.max(k, Math.min((SW - 2 * pad) / w0, (SH - 2 * pad - 24) / h0));
      const fw = (st.g.scr || { w: 1280 }).w * K, fh = (st.g.scr || { h: 800 }).h * K;
      const fitIn = (v, room, size) => (size >= room ? cl(v, room - size, 0) : v);
      const tx = fitIn((SW - w0 * K) / 2 - x0 * K, SW, fw), ty = fitIn((SH - 24 - h0 * K) / 2 - y0 * K, SH, fh);
      frame.style.left = "0px"; frame.style.top = "0px"; frame.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${K.toFixed(4)})`;   // i18n-ok
      Object.assign(over.style, { left: `${tx + x0 * K}px`, top: `${ty + y0 * K}px`, width: `${w0 * K}px`, height: `${h0 * K}px` });
      if (!st.pdrag) drawInner();
      return;
    }
    Object.assign(over.style, { left: `${off.x + r.x * k}px`, top: `${off.y + r.y * k}px`, width: `${r.w * k}px`, height: `${r.h * k}px` });
    if (!st.drag) drawHandles();
  }
  const boxStyle = (c) => {
    const { cw, ch, m } = st.cell;
    return `left:${c.x * cw + m}px;top:${c.y * ch + m}px;width:${Math.max(6, c.w * cw - 2 * m)}px;height:${Math.max(6, c.h * ch - 2 * m)}px;z-index:${(c.z || 0) + 1}`;
  };
  function drawHandles() {
    const over = $(".bld-over"); if (!over || !st.cell) return;
    if (innerCard()) return drawInner();
    const keep = over.querySelector(".bld-guides");
    over.replaceChildren(...st.g.cards.map(item), ...(keep ? [keep] : []));
  }
  function item(c) {
    const t = tdef(c.t);
    const np = c.t === "blank" ? (c.o.parts || []).length : 0;
    const label = c.t === "blank" ? (np ? Kit.t("builder.canvas.blankPieces", { type: t[1], n: np }) : Kit.t("builder.canvas.blankEmpty", { type: t[1] })) : c.o.title || (c.o.id ? devName(c.o.id) : "") || t[1];
    const box = el("div.bld-item", { "data-id": c.i, style: boxStyle(c) },
      el("div.bld-card" + (st.sel === c.i ? ".sel" : "") + (c.show ? ".cond" : ""), {},
        el("span.bld-name", {}, iconEl(/^(art|up):/.test(c.o.icon || "") ? t[2] : c.o.icon || t[2], 14), label)),
      el("i.bld-rz", { title: Kit.t("builder.canvas.resize") }));
    // (the grip's rounded-off corner too: a press within its square of the corner resizes — never moves the card; a tiny
    // card's square is a third of it, so most of the card still moves it)
    box.addEventListener("pointerdown", (e) => { const r = box.getBoundingClientRect(), z = Math.min(18, r.width / 3, r.height / 3), corner = r.right - e.clientX <= z && r.bottom - e.clientY <= z;
      startDrag(e, c.i, e.target.classList.contains("bld-rz") || corner ? "resize" : "move"); });
    return box;
  }
  const trashHit = (e) => { const t = $(".bld-trash"), r = t && t.getBoundingClientRect(); return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  // pick a card up (or its corner): it follows the pointer; the panel shows where it would land; let go = it lands there
  function startDrag(e, id, mode) {
    if (e.button !== 0 || st.mode !== "arrange" || !st.cell) return;
    const c = st.g.cards.find((x) => x.i === id); if (!c) return;
    e.preventDefault(); e.stopPropagation();
    // (the focus leaves the side panel: Delete then means this card, not the box last typed in)
    if (document.activeElement && document.activeElement !== document.body && !document.activeElement.closest(".bld-stage")) document.activeElement.blur();
    const node = e.currentTarget;
    try { node.setPointerCapture(e.pointerId); } catch {}
    if (st.sel !== id) select(id);
    const s0 = { px: e.clientX, py: e.clientY, x: c.x, y: c.y, w: c.w, h: c.h };
    st.drag = { id, mode, rect: { x: c.x, y: c.y, w: c.w, h: c.h }, moved: false };
    const trash = $(".bld-trash");
    const move = (ev) => {
      const d = st.drag; if (!d) return;
      const dx = ev.clientX - s0.px, dy = ev.clientY - s0.py;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      if (!d.moved) { d.moved = true; document.body.classList.add("bld-dragging"); if (mode === "move" && trash) trash.classList.add("armed"); }
      const { cw, ch } = st.cell;
      const fx = mode === "move" ? s0.x + dx / cw : s0.x, fy = mode === "move" ? s0.y + dy / ch : s0.y;
      const fw = mode === "resize" ? Math.max(1, s0.w + dx / cw) : s0.w, fh = mode === "resize" ? Math.max(1, s0.h + dy / ch) : s0.h;
      d.rect = settle(id, mode, fx, fy, fw, fh, ev.altKey);
      const onBin = mode === "move" && trashHit(ev);
      node.style.cssText = boxStyle({ x: fx, y: fy, w: fw, h: fh, z: 98 });   // (the handle follows the pointer exactly)
      node.classList.toggle("bad", !onBin && !fits(d.rect, id));
      if (trash) trash.classList.toggle("hot", onBin);
      post();
    };
    const up = (ev) => {
      node.removeEventListener("pointermove", move); node.removeEventListener("pointerup", up); node.removeEventListener("pointercancel", up);
      document.body.classList.remove("bld-dragging"); guides([]);
      if (trash) trash.classList.remove("armed", "hot");
      const d = st.drag; st.drag = null;
      if (!d || !d.moved) {   // (a blank card clicked twice: open it)
        const now = Date.now(), two = c.t === "blank" && st.lastClick && st.lastClick.id === id && now - st.lastClick.at < 500;
        st.lastClick = two ? null : { id, at: now };
        if (two) return enterInner(c);
        drawHandles(); return;
      }
      if (d.mode === "move" && ev.type === "pointerup" && trashHit(ev)) { remove(c); return; }
      if (ev.type !== "pointerup" || !fits(d.rect, id)) {
        if (ev.type === "pointerup") toast(Kit.t("builder.drag.overlapMove"), true);
        drawHandles(); post(); return;
      }
      Object.assign(c, d.rect); changed(false); drawHandles();
    };
    node.addEventListener("pointermove", move); node.addEventListener("pointerup", up); node.addEventListener("pointercancel", up);
  }
  // a card type dragged in from the list on the left (a click adds it at the first free spot): a copy follows the pointer,
  // a dashed box on the screen shows where it would land
  function onPalDown(e) {
    const b = e.target.closest && e.target.closest(".bld-pal .bld-add");
    if (!b || !st || e.button !== 0 || st.mode !== "arrange") return;
    e.preventDefault();
    // (inside a blank card the page's cards can't be seen: a page card added there would land out of sight)
    if (st.inner) return toast(Kit.t("builder.drag.insideBlank"), true);
    const type = b.dataset.type, [w, h] = sizeOf(type);
    const s0 = { px: e.clientX, py: e.clientY };
    let moved = false, ghost = null, spot = null, rect = null;
    const over = $(".bld-over");
    const clear = () => { if (ghost) ghost.remove(); if (spot) spot.remove(); guides([]); document.body.classList.remove("bld-dragging"); };
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - s0.px, ev.clientY - s0.py) < 5) return;
      if (!moved) { moved = true; document.body.classList.add("bld-dragging"); ghost = el("div.bld-ghost", {}, ...[...b.childNodes].map((n) => n.cloneNode(true))); document.body.append(ghost); }
      ghost.style.left = `${ev.clientX + 8}px`; ghost.style.top = `${ev.clientY + 8}px`;
      const o = over && !over.hidden ? over.getBoundingClientRect() : null;
      if (o && st.cell && ev.clientX >= o.left && ev.clientX <= o.right && ev.clientY >= o.top && ev.clientY <= o.bottom) {
        const fx = (ev.clientX - o.left) / st.cell.cw - w / 2, fy = (ev.clientY - o.top) / st.cell.ch - h / 2;
        rect = settle(null, "move", fx, fy, w, h, ev.altKey);
        if (!spot) { spot = el("div.bld-drop"); over.append(spot); }
        spot.style.cssText = boxStyle({ ...rect, z: 97 });
        spot.classList.toggle("bad", !fits(rect, null));
      } else { rect = null; if (spot) { spot.remove(); spot = null; } guides([]); }
    };
    const up = () => {
      document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
      clear();
      if (!moved) return add(type);
      if (!rect) return;
      if (!fits(rect, null)) return toast(Kit.t("builder.drag.overlapDrop"), true);
      add(type, rect);
    };
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
  }
  // stacking (with Allow overlap): the card's z among the others
  function restack(c, front) {
    const order = st.g.cards.filter((x) => x !== c).sort((a, b) => (a.z || 0) - (b.z || 0));
    if (front) order.push(c); else order.unshift(c);
    order.forEach((x, n) => { if (n) x.z = n; else delete x.z; });
    changed(false); drawHandles();
  }
  const select = (i) => { if (st.inner && st.inner.id !== i) { st.inner = null; fit(); } st.sel = i; markSel(); side(); if (st.ptab === "layers") palette(); };
  const markSel = () => document.querySelectorAll(".bld-over .bld-item").forEach((b) => b.firstElementChild.classList.toggle("sel", b.dataset.id === st.sel));
  const nodeOf = (i) => [...document.querySelectorAll(".bld-over .bld-item")].find((n) => n.dataset.id === i);
  const refreshItem = (c) => {
    const old = nodeOf(c.i); if (!old) return;
    // (in place: gridstack listens on this very element for drags — a new one would no longer move)
    const box = old.firstElementChild, fresh = item(c).firstElementChild;
    box.className = fresh.className; box.replaceChildren(...fresh.childNodes);
  };
  function remove(c) {
    if (st.inner && st.inner.id === c.i) { st.inner = null; fit(); }
    const n = nodeOf(c.i);
    st.g.cards = st.g.cards.filter((x) => x.i !== c.i);
    if (st.sel === c.i) st.sel = null;
    if (n) n.remove();
    changed();
  }
  // where the last click was: Delete / Backspace / the arrows only act on the screen when it was on the screen (a
  // click in the side panel redraws it, and the focus falls back to the page — that's not "the screen has the focus")
  function onAnyDown(e) { if (st) st.downStage = !!(e.target.closest && e.target.closest(".bld-stage")); }
  const onScreen = (t) => !!st.downStage && (t === document.body || t === document.documentElement || !!(t.closest && t.closest(".bld-stage")));
  // Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z): undo / redo — not while typing in a box (that box's own undo then);
  // Delete / Backspace: remove the selected card — only while the screen has the focus, not a box or a button beside it
  function onKey(e) {
    if (!st) return;
    const t = e.target, typing = t.closest && t.closest("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), textarea, [contenteditable]");   // i18n-ok
    const k = (e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === "z" || k === "y") && !typing) { e.preventDefault(); undoRedo(k === "z" && !e.shiftKey); return; }
    // (v2.5.0) F: Focus on / off; Esc: a side opened over the panel closes, then Focus ends, then the card is let go
    const quiet = !typing && !(t.closest && t.closest("select")) && !document.querySelector(".modal-bg") && !document.body.classList.contains("hp-open") && !document.fullscreenElement;
    if (quiet && k === "f" && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); return setFocus(!st.focus); }
    if (quiet && e.key === "Escape" && st.peek) { e.preventDefault(); return setPeek(st.peek); }
    if (quiet && e.key === "Escape" && st.focus && !st.inner) { e.preventDefault(); return setFocus(false); }
    if (st.inner) return innerKey(e, t, typing);
    if (quiet && e.key === "Escape" && st.sel && !(t.closest && t.closest(".bld-side .bld-cdpanel"))) { e.preventDefault(); select(null); return; }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (st.mode !== "arrange" || !st.sel || (!d && !["Delete", "Backspace"].includes(e.key))) return;   // i18n-ok
    if (!onScreen(t)) return;
    if (t.closest && t.closest("input, textarea, select, button, [contenteditable]")) return;   // i18n-ok
    const c = st.g.cards.find((x) => x.i === st.sel); if (!c) return;
    e.preventDefault();
    if (!d) return remove(c);
    // the arrows: one snap step (Shift: four, Alt: one fine cell) — not onto another card
    const n = e.altKey ? 1 : (st.g.v === 2 ? SNAP : 1) * (e.shiftKey ? 4 : 1);
    const r = { x: cl(c.x + d[0] * n, 0, st.g.cols - c.w), y: cl(c.y + d[1] * n, 0, st.g.rows - c.h), w: c.w, h: c.h };
    if (!fits(r, c.i)) return toast(Kit.t("builder.drag.overlap"), true);
    Object.assign(c, r); changed(false, `nudge:${c.i}`); drawHandles();
  }
  // Allow overlap turned off while cards lie over each other: they stay where they are — say which
  function overlapNote() {
    const cs = st.g.cards, pairs = [];
    for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) if (overlaps(cs[a], cs[b])) pairs.push([cs[a], cs[b]]);
    if (!pairs.length) return;
    const nm = (c) => c.o.title || (c.o.id ? devName(c.o.id) : "") || tdef(c.t)[1];
    toast(pairs.length === 1 ? Kit.t("builder.overlap.pair", { a: nm(pairs[0][0]), b: nm(pairs[0][1]) }) : Kit.t("builder.overlap.pairs", { n: pairs.length }), true);
  }

  // where a new card of w × h fits (top-left first); null = no room
  function freeSpot(w, h) {
    const g = st.g, step = g.v === 2 ? SNAP : 1;
    const gx = g.sp && st.rect ? Math.round((g.gap || 0) / (st.rect.w / g.cols)) : 0, gy = g.sp && st.rect ? Math.round((g.gap || 0) / (st.rect.h / g.rows)) : 0;
    const hit = (x, y) => g.cards.some((c) => x < c.x + c.w + gx && x + w + gx > c.x && y < c.y + c.h + gy && y + h + gy > c.y);
    for (let y = 0; y + h <= g.rows; y += step) for (let x = 0; x + w <= g.cols; x += step) if (!hit(x, y)) return { x, y };
    return null;
  }
  const fz = (n) => (st.g.v === 2 ? n * F : n);   // (a type's size, in the old grid's cells → this grid's)
  // a new card's size in this grid's cells: a saved card keeps its exact size (no rounding to the old 12 × 8 grid)
  const sizeOf = (type) => {
    const sv = tplOf(type), g = st.g;
    if (sv && g.v === 2) {
      const from = sv.fine ? (sv.fine === true ? 96 : sv.fine) : 12, ky = FR / ((from * 2) / 3);   // (every fine grid is 3 : 2, like the old 12 × 8)
      return [cl(Math.round((sv.card.w * FC) / from), 1, g.cols), cl(Math.round(sv.card.h * ky), 1, g.rows)];
    }
    const t = tdef(type);
    return [Math.min(fz(t[4]), g.cols), Math.min(fz(t[5]), g.rows)];
  };
  const newId = () => { let n = 1; while (st.g.cards.some((c) => c.i === `c${n}`)) n++; return `c${n}`; };
  // a new card: at = where it was dropped; none = the first free place
  function add(type, at) {
    if (st.g.cards.length >= 60) return toast(Kit.t("builder.add.max"), true);
    const t = tdef(type);
    let w, h;
    if (at) ({ w, h } = at);
    else {
      // its own size where that fits, else the nearest smaller one that does — its shape kept as well as it can be,
      // never under half its width or height (a thermostat 1 row high is no use to anyone)
      const [W, H] = sizeOf(type), sizes = [], stp = st.g.v === 2 ? SNAP : 1;
      w = W; h = H;
      for (let a = W; a >= Math.max(Math.min(stp, W), W / 2); a -= stp) for (let b = H; b >= Math.max(Math.min(stp, H), H / 2); b -= stp) sizes.push([a, b]);
      const kept = (p) => Math.min(p[0] / W, p[1] / H);
      sizes.sort((p, q) => kept(q) - kept(p) || q[0] * q[1] - p[0] * p[1]);
      for (const [a, b] of sizes) { at = freeSpot(a, b); if (at) { w = a; h = b; break; } }
      if (!at) return toast(Kit.t("builder.add.noRoom", { type: t[1] }), true);
      if (w < W || h < H) toast(Kit.t("builder.add.smaller"));
    }
    const sv = tplOf(type);
    const c = sv ? { ...structuredClone(sv.card), i: newId(), x: at.x, y: at.y, w, h }
      : { i: newId(), t: type, x: at.x, y: at.y, w, h, s: { ...(t[6] || {}) }, o: structuredClone(t[7] || {}) };
    st.g.cards.push(c); st.sel = c.i;
    // (the focus leaves "Find a card…": Esc, Delete and the arrows then act on the new card)
    const f = document.activeElement; if (f && f.closest && f.closest(".bld-pal-col")) f.blur();
    st.downStage = true;
    drawHandles(); changed();
    if (c.t === "blank" && !(c.o.parts || []).length) enterInner(c);   // (a new blank card: straight in, to fill it)
  }

  // ---------- a blank card: "Edit inside" (the owner's most wanted) ----------
  // Its pieces sit on the card's own small grid (24 × 24 cells, whatever the card's size: they move and grow with it).
  // While editing inside, the panel is zoomed so the card fills the screen (the rest dimmed): the pieces are dragged
  // into place and resized from their corner, always landing on the grid; the settings on the right are the selected
  // piece's. "Done", Esc or a click outside goes back to arranging the cards. Every change is one undo step.
  const IN = 24;
  // [kind, name, icon, what it is, default width, height (cells of 24)]
  const PIECE_T = [["icon", Kit.t("builder.piece.icon.name"), "image", Kit.t("builder.piece.icon.desc"), 8, 10],
    ["light", Kit.t("builder.piece.light.name"), "bulb", Kit.t("builder.piece.light.desc"), 8, 10],
    ["switch", Kit.t("builder.piece.switch.name"), "toggle", Kit.t("builder.piece.switch.desc"), 12, 4],
    ["value", Kit.t("builder.piece.value.name"), "gauge", Kit.t("builder.piece.value.desc"), 8, 6],
    ["door", Kit.t("builder.piece.door.name"), "door", Kit.t("builder.piece.door.desc"), 12, 4],
    ["lock", Kit.t("builder.piece.lock.name"), "lock", Kit.t("builder.piece.lock.desc"), 14, 5],
    ["garage", Kit.t("builder.piece.garage.name"), "garage", Kit.t("builder.piece.garage.desc"), 10, 12],
    ["text", Kit.t("builder.piece.text.name"), "edit", Kit.t("builder.piece.text.desc"), 16, 4]];
  const PT = Object.fromEntries(PIECE_T.map((x) => [x[0], x]));
  const innerCard = () => (st && st.inner ? st.g.cards.find((c) => c.i === st.inner.id && c.t === "blank") || null : null);
  const pieceName = (p) => {
    const t = PT[p.t] || ["", Kit.t("builder.piece.fallback")], dev = p.id ? devName(p.id) : p.t === "garage" ? ((p.doors || [])[0] || {}).id && devName(p.doors[0].id) : "";
    return p.t === "text" ? Kit.t("builder.piece.textName", { text: String(p.text || "").replace(/\s+/g, " ").slice(0, 24) || Kit.t("builder.piece.emptyText") }) : p.label || dev ? Kit.t("builder.piece.named", { type: t[1], name: p.label || dev }) : t[1];
  };
  // the zoom goes smoothly (only while going in or out — not while the window is resized)
  const zooming = () => { const sc = $(".bld-screen"); if (!sc) return; sc.classList.add("zooming"); clearTimeout(st.zoomT); st.zoomT = setTimeout(() => sc.classList.remove("zooming"), 400); };
  function enterInner(c, sel = null) {
    if (st.mode !== "arrange") setMode("arrange");
    innerCss(); zooming();
    st.sel = c.i; st.inner = { id: c.i, sel };
    fit(); side();
  }
  function leaveInner() {
    if (!st.inner) return;
    zooming(); st.inner = null; fit(); drawHandles(); side();
  }
  // a piece's box over the card, at its cells
  const inStyle = (p, n) => `left:${(100 * p.x) / IN}%;top:${(100 * p.y) / IN}%;width:${(100 * p.w) / IN}%;height:${(100 * p.h) / IN}%;z-index:${n + 2}`;
  function drawInner() {
    const over = $(".bld-over"), c = innerCard(); if (!over || !c) return;
    const parts = Array.isArray(c.o.parts) ? c.o.parts : (c.o.parts = []), sel = st.inner.sel;
    const grid = el("div.bk-ed-grid", { title: Kit.t("builder.inner.gridTip") });
    grid.addEventListener("pointerdown", (e) => { if (e.button === 0 && st.inner.sel != null) { st.inner.sel = null; drawInner(); side(); } });
    over.replaceChildren(grid, ...parts.map((p, n) => {
      // (the selected one, and its corner, above the others — a piece later in the list can't cover it)
      const b = el("div.bk-ed-it" + (sel === n ? ".sel" : "") + (pieceProblem(p) ? ".todo" : ""), { "data-n": String(n), style: inStyle(p, sel === n ? 40 : n), title: pieceProblem(p) ? Kit.t("builder.piece.todo", { piece: pieceName(p), problem: pieceProblem(p) }) : pieceName(p) },
        el("span.bk-ed-name", {}, iconEl((PT[p.t] || [])[2] || "grid", 12), pieceName(p)), el("i.bk-ed-rz", { title: Kit.t("builder.canvas.resize") }));
      b.addEventListener("pointerdown", (e) => startPieceDrag(e, n, e.target.classList.contains("bk-ed-rz") ? "resize" : "move"));
      return b;
    }), el("div.bk-ed-tip", {}, parts.length ? Kit.t("builder.inner.tip")
      : Kit.t("builder.inner.empty")));
  }
  // move a piece (or its corner): it follows the pointer in whole cells of the card's grid; the panel shows it as it goes
  function startPieceDrag(e, n, mode) {
    if (e.button !== 0) return;
    const c = innerCard(), p = c && (c.o.parts || [])[n]; if (!p) return;
    e.preventDefault(); e.stopPropagation();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    const node = e.currentTarget, over = $(".bld-over"), R = over.getBoundingClientRect(), cw = R.width / IN, ch = R.height / IN;
    try { node.setPointerCapture(e.pointerId); } catch {}
    if (st.inner.sel !== n) { st.inner.sel = n; over.querySelectorAll(".bk-ed-it").forEach((b) => { b.classList.toggle("sel", +b.dataset.n === n); b.style.zIndex = String(+b.dataset.n === n ? 42 : +b.dataset.n + 2); }); side(); }
    const s0 = { px: e.clientX, py: e.clientY, x: p.x, y: p.y, w: p.w, h: p.h };
    let moved = false;
    const move = (ev) => {
      const dx = (ev.clientX - s0.px) / cw, dy = (ev.clientY - s0.py) / ch;
      if (!moved && Math.hypot(ev.clientX - s0.px, ev.clientY - s0.py) < 4) return;
      moved = true;
      const r = mode === "move" ? { x: cl(Math.round(s0.x + dx), 0, IN - s0.w), y: cl(Math.round(s0.y + dy), 0, IN - s0.h), w: s0.w, h: s0.h }
        : { x: s0.x, y: s0.y, w: cl(Math.round(s0.w + dx), 1, IN - s0.x), h: cl(Math.round(s0.h + dy), 1, IN - s0.y) };
      st.pdrag = { n, r };
      node.style.cssText = inStyle(r, 40);
      post();
    };
    const up = (ev) => {
      node.removeEventListener("pointermove", move); node.removeEventListener("pointerup", up); node.removeEventListener("pointercancel", up);
      const d = st.pdrag; st.pdrag = null;
      if (!moved || !d) return drawInner();
      if (ev.type === "pointerup") { Object.assign(p, d.r); changed(false, null); }
      drawInner(); post();
    };
    node.addEventListener("pointermove", move); node.addEventListener("pointerup", up); node.addEventListener("pointercancel", up);
  }
  // where a new piece of w × h cells fits on the card (top-left first); none free: smaller; still none: null
  function freeInner(parts, W, H) {
    const hit = (x, y, w, h) => parts.some((q) => x < q.x + q.w && x + w > q.x && y < q.y + q.h && y + h > q.y);
    for (let w = W, h = H; w >= 2 && h >= 2; w = Math.max(2, w - 2), h = Math.max(2, h - 2)) {
      for (let y = 0; y + h <= IN; y++) for (let x = 0; x + w <= IN; x++) if (!hit(x, y, w, h)) return { x, y, w, h };
      if (w === 2 && h === 2) break;
    }
    return null;
  }
  // a new piece (at = where it was dropped, in cells); it's selected, and its first box (its device) has the focus
  function addPiece(t, at) {
    const c = innerCard(); if (!c) return;
    const parts = Array.isArray(c.o.parts) ? c.o.parts : (c.o.parts = []);
    if (parts.length >= 16) return toast(Kit.t("builder.piece.max"), true);
    const [, , , , W, H] = PT[t];
    let r = at ? { x: cl(at.x - Math.floor(W / 2), 0, IN - W), y: cl(at.y - Math.floor(H / 2), 0, IN - H), w: W, h: H } : freeInner(parts, W, H);
    if (!r) { r = { x: 0, y: 0, w: W, h: H }; toast(Kit.t("builder.piece.noRoom"), true); }
    // (a text piece that only fits smaller than it should: medium-sized text, so its words still show)
    const fresh = { garage: { doors: [{}] }, text: r.h < H ? { text: Kit.t("builder.piece.yourText"), bold: true } : { text: Kit.t("builder.piece.yourText"), size: "l", bold: true } }[t] || {};
    parts.push({ t, ...r, ...structuredClone(fresh) });
    st.inner.sel = parts.length - 1;
    changed(true); drawInner();
    setTimeout(() => { const f = document.querySelector(".bld-side .bk-pe .bld-dfind, .bld-side .bk-pe textarea"); if (f) f.focus({ preventScroll: true }); }, 0);
  }
  // what a piece still needs ("" = it's ready)
  function pieceProblem(p) {
    if (["light", "switch", "value", "door", "lock"].includes(p.t) && !p.id) return Kit.t("builder.piece.needDevice");
    if (p.t === "value" && !p.at) return Kit.t("builder.piece.needReading");
    if (p.t === "garage") { const n = (p.doors || []).findIndex((d) => !d.id); if (!(p.doors || []).length) return Kit.t("builder.piece.needDoor"); if (n >= 0) return p.doors.length > 1 ? Kit.t("builder.piece.doorNOpener", { n: n + 1 }) : Kit.t("builder.piece.doorOpener"); }
    return "";
  }
  // a piece type's button: a click adds it where there's room, a drag drops it where it's let go on the card
  // (full: greyed out; Enter or Space on it adds it too — a click with the keyboard has no pointer)
  function pieceBtn(t, onAdd, full) {
    const [, name, icn, tip] = PT[t];
    const b = el("button.ghost.bk-add", { type: "button", title: full ? Kit.t("builder.piece.max") : tip, disabled: !!full,
      onclick: (e) => { if (e.detail === 0 && !b.disabled) onAdd(null); } }, iconEl(icn, 20), el("span", {}, name));
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || b.disabled) return;
      e.preventDefault();
      const s0 = { x: e.clientX, y: e.clientY };
      let moved = false, ghost = null, spot = null, at = null;
      const over = () => (innerCard() ? $(".bld-over") : null);
      const mv = (ev) => {
        if (!moved && Math.hypot(ev.clientX - s0.x, ev.clientY - s0.y) < 5) return;
        if (!moved) { moved = true; document.body.classList.add("bld-dragging"); ghost = el("div.bld-ghost", {}, iconEl(icn, 16), name); document.body.append(ghost); }
        ghost.style.left = `${ev.clientX + 8}px`; ghost.style.top = `${ev.clientY + 8}px`;
        const o = over(), R = o && o.getBoundingClientRect();
        if (R && ev.clientX >= R.left && ev.clientX <= R.right && ev.clientY >= R.top && ev.clientY <= R.bottom) {
          const [, , , , W, H] = PT[t];
          at = { x: Math.floor(((ev.clientX - R.left) / R.width) * IN), y: Math.floor(((ev.clientY - R.top) / R.height) * IN) };
          const r = { x: cl(at.x - Math.floor(W / 2), 0, IN - W), y: cl(at.y - Math.floor(H / 2), 0, IN - H), w: W, h: H };
          if (!spot) { spot = el("div.bld-drop"); o.append(spot); }
          spot.style.cssText = inStyle(r, 60);
        } else { at = null; if (spot) { spot.remove(); spot = null; } }
      };
      const done = (ev) => {
        document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", done); document.removeEventListener("pointercancel", done);
        document.body.classList.remove("bld-dragging"); if (ghost) ghost.remove(); if (spot) spot.remove();
        if (ev.type !== "pointerup") return;
        if (!moved) return onAdd(null);
        if (at) onAdd(at);
      };
      document.addEventListener("pointermove", mv); document.addEventListener("pointerup", done); document.addEventListener("pointercancel", done);
    });
    return b;
  }
  // Esc / Done: back to the cards; Delete: remove the selected piece; the arrow keys: move it a cell (Shift: four)
  function innerKey(e, t, typing) {
    const onStage = onScreen(t);
    if (e.key === "Escape" && !typing && !(t.closest && t.closest("select"))) { e.preventDefault(); return leaveInner(); }
    const c = innerCard(), n = st.inner.sel, p = c && n != null ? (c.o.parts || [])[n] : null;
    if (!p || !onStage || (t.closest && t.closest("input, textarea, select, button, [contenteditable]"))) return;   // i18n-ok
    if (["Delete", "Backspace"].includes(e.key)) { e.preventDefault(); return removePiece(c, n); }   // i18n-ok
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const k = e.shiftKey ? 4 : 1;
    p.x = cl(p.x + d[0] * k, 0, IN - p.w); p.y = cl(p.y + d[1] * k, 0, IN - p.h);
    changed(false, `nudge:${c.i}:${n}`); drawInner();
  }
  function removePiece(c, n) {
    c.o.parts.splice(n, 1);
    st.inner.sel = null; changed(true); drawInner();
  }
  // the right side while editing inside: the pieces to add, the ones on the card, the selected one's settings
  function innerSide(c) {
    const parts = Array.isArray(c.o.parts) ? c.o.parts : (c.o.parts = []), n = st.inner.sel, p = n != null ? parts[n] : null;
    const list = parts.length ? el("div.bk-list", {}, parts.map((q, k) => el("button.ghost.small.bk-li" + (k === n ? ".cur" : ""), { type: "button", title: pieceProblem(q) ? Kit.t("builder.piece.stillToDo", { problem: pieceProblem(q) }) : Kit.t("builder.piece.selectIt"),
      onclick: () => { st.inner.sel = k; drawInner(); side(); } }, iconEl((PT[q.t] || [])[2] || "grid", 14), el("span", {}, pieceName(q)), pieceProblem(q) ? el("b.bk-todo", {}, "!") : null))) : null;
    return el("div.card.bld-insp.bk-insp", {},
      el("div.bld-head", {}, picEl("plus", 22), el("h3", {}, Kit.t("builder.inner.title")),
        el("button.primary.small.bk-done", { type: "button", title: Kit.t("builder.inner.doneTip"), onclick: leaveInner }, Kit.t("builder.top.done")),
        el("small.muted", {}, Kit.t("builder.inner.help"))),
      el("b.bk-h", {}, Kit.t("builder.inner.addPiece")),
      el("div.bk-addrow", {}, PIECE_T.map(([t]) => pieceBtn(t, (at) => addPiece(t, at), parts.length >= 16))),
      parts.length ? el("b.bk-h", {}, Kit.t("builder.inner.onCard", { n: parts.length })) : null, list,
      p ? pieceEditor(c, p, n) : el("small.muted", {}, parts.length ? Kit.t("builder.inner.clickPiece") : ""));
  }
  // one piece's settings
  function pieceEditor(c, p, n) {
    const [, name, icn, tip] = PT[p.t] || ["", Kit.t("builder.piece.fallback"), "grid", ""];
    const put = (redraw = true) => { changed(redraw); drawInner(); };
    const setp = (k, v, redraw = true) => { if (v == null || v === "") delete p[k]; else p[k] = v; put(redraw); };
    const nameRow = (ph) => row(Kit.t("builder.f.name"), el("input", { type: "text", maxlength: "30", value: p.label || "", placeholder: ph || Kit.t("builder.f.automaticPh"), onchange: (e) => setp("label", e.target.value.trim()) }));
    const out = [el("div.bk-peh", {}, iconEl(icn, 18), el("b", {}, name), el("small.muted", {}, tip))];
    const prob = pieceProblem(p);
    if (prob) out.push(el("small.bld-note", {}, Kit.t("builder.piece.stillToDoDot", { problem: prob })));
    const wheelOf = () => {   // its own press-and-hold wheel (none: the panel's automatic one)
      if (!p.id) return null;
      const list = p.wheel || (p.wheel = []), key = `bkw-${c.i}-${n}`, auto = autoWheels(p.id);
      // (the panel's automatic wheel only exists for a dimmer, a white or colour light, a fan or a shade — a plain
      // on / off switch has none: holding it does nothing more, unless actions are picked here)
      const d = el("details.bld-gwheel", { open: st.open.has(key) }, el("summary", {}, list.length ? Kit.t("builder.wheel.holdOwn", { n: list.length }) : auto ? Kit.t("builder.wheel.holdAuto") : Kit.t("builder.wheel.holdNone")),
        wheelEditor(p.id, list, () => { if (list.length) p.wheel = list; else delete p.wheel; put(); }, p.icon),
        list.length ? null : el("small.muted", {}, auto ? Kit.t("builder.wheel.autoNote")
          : Kit.t("builder.wheel.noneNote")));
      d.addEventListener("toggle", () => { if (d.open) st.open.add(key); else st.open.delete(key); });
      if (!list.length) delete p.wheel;
      return d;
    };
    if (p.t === "icon") {
      out.push(row(Kit.t("builder.f.picture"), iconPick(p.icon, (v) => setp("icon", v), p.id ? Kit.t("builder.icon.devicesOwn") : Kit.t("builder.icon.imageIcon"))),
        tipRow(Kit.t("builder.f.device"), Kit.t("builder.piece.iconDevTip"),
          devSelect(p.id ?? null, (v) => { if (!v) delete p.wheel; setp("id", v); }, Kit.t("builder.piece.justPicture"), { all: true })),
        row(Kit.t("builder.piece.nameUnder"), el("input", { type: "text", maxlength: "30", value: p.label || "", placeholder: Kit.t("builder.f.nonePh"), onchange: (e) => setp("label", e.target.value.trim()) })),
        el("small.muted", {}, p.id ? Kit.t("builder.piece.iconTapNote") : Kit.t("builder.piece.iconAloneNote")));
      out.push(wheelOf());
    }
    if (p.t === "light") out.push(row(Kit.t("builder.piece.light.name"), devSelect(p.id ?? null, (v) => setp("id", v), Kit.t("builder.piece.pickLight"), { first: (d) => d.kind === "light", firstLabel: Kit.t("builder.dev.lights"), restLabel: Kit.t("builder.dev.otherDevices") })),
      nameRow(p.id ? devName(p.id) : ""), row(Kit.t("builder.f.picture"), iconPick(p.icon, (v) => setp("icon", v), Kit.t("builder.f.automatic"))), wheelOf());
    if (p.t === "switch") out.push(row(Kit.t("builder.f.device"), devSelect(p.id ?? null, (v) => setp("id", v), Kit.t("builder.piece.pickSwitch"), { narrow: switches })), nameRow(p.id ? devName(p.id) : ""), wheelOf());
    if (p.t === "value") {
      const A = p.id ? attrsOf(p.id) : {}, names = Object.keys(A).filter((a) => !SKIP_AT.test(a) || a === p.at);
      out.push(row(Kit.t("builder.f.device"), devSelect(p.id ?? null, (v) => { if (v !== p.id) delete p.at; setp("id", v); }, Kit.t("builder.dev.pick"), { all: true })),
        tipRow(Kit.t("builder.f.reading"), Kit.t("builder.f.readingTip"), el("select", { disabled: !p.id, onchange: (e) => setp("at", e.target.value) },
          optList((names.length ? names : ATTRS).map((a) => [a, names.length ? Kit.t("builder.f.readingNow", { name: spotPlain(a), value: A[a] ?? "—" }) : spotPlain(a)]), p.at, p.id ? Kit.t("builder.f.pick") : Kit.t("builder.f.pickDeviceFirst")))),
        nameRow(p.at ? spotPlain(p.at) : ""),
        tipRow(Kit.t("builder.f.unit"), Kit.t("builder.f.unitTip"), el("input", { type: "text", maxlength: "8", value: p.unit || "", placeholder: Kit.t("builder.f.automaticLower"), onchange: (e) => setp("unit", e.target.value.trim()) })));
    }
    if (p.t === "door") out.push(row(Kit.t("builder.piece.door.name"), devSelect(p.id ?? null, (v) => setp("id", v), Kit.t("builder.piece.pickContact"), CONTACT_FIRST)), nameRow(p.id ? devName(p.id) : ""));
    if (p.t === "lock") {
      out.push(row(Kit.t("builder.piece.lock.name"), devSelect(p.id ?? null, (v) => setp("id", v), Kit.t("builder.f.pickLock"), { only: (d) => d.kind === "lock" })), nameRow(p.id ? devName(p.id) : ""));
      const D = M.devices && M.devices(), lockOk = p.id && ((D && D.unlockable) || []).includes(p.id), panelOk = st.ctx.managed.allowUnlock === true;
      out.push(el("small" + (p.id && !(lockOk && panelOk) ? ".bld-note" : ".muted"), {}, !p.id ? Kit.t("builder.lock.noteNone")
        : lockOk && panelOk ? Kit.t("builder.lock.noteOk", { panel: st.ctx.panel.name })
          : Kit.t(!panelOk ? "builder.lock.notePanel" : "builder.lock.noteLock", { panel: st.ctx.panel.name })));
    }
    if (p.t === "garage") {
      const doors = Array.isArray(p.doors) && p.doors.length ? p.doors : (p.doors = [{}]);
      out.push(row(Kit.t("builder.garage.doors"), seg([["1", "1"], ["2", "2"], ["3", "3"]], String(doors.length), (v) => { while (doors.length < +v) doors.push({}); doors.length = +v; put(); })));
      doors.forEach((dr, k) => out.push(el("div.bld-gitem", {}, el("b", {}, doors.length > 1 ? Kit.t(k === 0 ? "builder.garage.doorLeft" : k === doors.length - 1 ? "builder.garage.doorRight" : "builder.garage.doorMiddle", { n: k + 1 }) : Kit.t("builder.garage.theDoor")),
        row(Kit.t("builder.garage.opener"), devSelect(dr.id ?? null, (v) => { if (v) dr.id = v; else delete dr.id; put(); }, Kit.t("builder.garage.pickOpener"), GARAGE_FIRST)),
        tipRow(Kit.t("builder.garage.contact"), Kit.t("builder.garage.contactTip"), devSelect(dr.contact ?? null, (v) => { if (v) dr.contact = v; else delete dr.contact; put(); }, Kit.t("builder.garage.noContact"), CONTACT_FIRST)),
        tipRow(Kit.t("builder.garage.takes"), Kit.t("builder.garage.takesTip"), el("input", { type: "number", min: "3", max: "60", step: "1", placeholder: "15", value: dr.travel ?? "",
          onchange: (e) => { const v = Math.round(+e.target.value); if (v >= 3 && v <= 60) dr.travel = v; else delete dr.travel; put(); } }), el("span.muted", {}, Kit.t("builder.garage.sToOpen"))))));
      out.push(nameRow(Kit.t("builder.f.nonePh")), el("small.muted", {}, Kit.t("builder.garage.tapNote")));
    }
    if (p.t === "text") {
      const ta = el("textarea", { rows: "3", maxlength: "200", onchange: (e) => setp("text", e.target.value) }); ta.value = p.text || "";
      let insDev = null, insAt = "temperature";
      out.push(row(Kit.t("builder.piece.text.name"), ta),
        el("div.bld-ins", {}, el("small.muted", {}, Kit.t("builder.text.addLive")), devSelect(null, (v) => { insDev = v; }, Kit.t("builder.text.devicePh"), { all: true }),
          el("select", { onchange: (e) => { insAt = e.target.value; } }, optList([["name", Kit.t("builder.text.itsName")], ...ATTRS.map((a) => [a, a])], insAt)),
          el("button.ghost.small", { type: "button", onclick: () => { if (!insDev) return toast(Kit.t("builder.text.pickDevFirst"), true);
            const add = `${ta.value && !/\s$/.test(ta.value) ? " " : ""}{{${insDev}.${insAt}}}`; if (ta.value.length + add.length > 200) return toast(Kit.t("builder.text.full"), true);
            ta.value += add; setp("text", ta.value); } }, Kit.t("builder.text.insert"))),
        el("small.muted", {}, Kit.t("builder.text.also", { time: "{{time}}", date: "{{date}}", greeting: "{{greeting}}" })),
        row(Kit.t("builder.f.size"), seg([["s", Kit.t("builder.f.small")], ["m", Kit.t("builder.f.medium")], ["l", Kit.t("builder.f.large")], ["xl", Kit.t("builder.f.huge")]], p.size || "m", (v) => setp("size", v === "m" ? null : v))),
        row(Kit.t("builder.f.align"), seg([["left", Kit.t("builder.f.left")], ["center", Kit.t("builder.f.centre")], ["right", Kit.t("builder.f.right")]], p.align || "left", (v) => setp("align", v === "left" ? null : v))),
        row(Kit.t("builder.f.bold"), el("label.switch", {}, el("input", { type: "checkbox", checked: !!p.bold, onchange: (e) => setp("bold", e.target.checked ? true : null) }), el("span"))));
    }
    const parts = c.o.parts;
    out.push(el("div.bld-acts", {},
      el("button.ghost.small", { type: "button", title: Kit.t("builder.piece.frontTip"), disabled: n === parts.length - 1, onclick: () => { parts.push(parts.splice(n, 1)[0]); st.inner.sel = parts.length - 1; put(); } }, Kit.t("builder.f.toFront")),
      el("button.ghost.small", { type: "button", title: Kit.t("builder.piece.backTip"), disabled: n === 0, onclick: () => { parts.unshift(parts.splice(n, 1)[0]); st.inner.sel = 0; put(); } }, Kit.t("builder.f.toBack")),
      el("button.ghost.small", { type: "button", onclick: () => {
        if (parts.length >= 16) return toast(Kit.t("builder.piece.maxShort"), true);
        const q = structuredClone(p), r = freeInner(parts, p.w, p.h) || { x: cl(p.x + 1, 0, IN - p.w), y: cl(p.y + 1, 0, IN - p.h), w: p.w, h: p.h };
        parts.push({ ...q, ...r }); st.inner.sel = parts.length - 1; put(); } }, Kit.t("builder.f.duplicate")),
      el("button.ghost.small.bad", { type: "button", onclick: () => removePiece(c, n) }, Kit.t("builder.piece.remove"))));
    return el("div.bk-pe", {}, ...out.filter(Boolean));
  }
  // (the look of the inside editor; kept here with it — manage.css can take it over)
  function innerCss() {
    if (document.getElementById("bld-inner-css")) return;
    document.head.append(el("style", { id: "bld-inner-css" }, `
.bld-inmask { position: absolute; inset: 0; display: none; cursor: zoom-out; }
.bld-screen.inner .bld-inmask { display: block; }
.bld-screen.zooming .bld-frame { transition: transform .32s ease; }
.bld-screen.zooming .bld-over { transition: left .32s ease, top .32s ease, width .32s ease, height .32s ease; }
.bld-over.bld-inner { box-shadow: 0 0 0 4000px rgba(6, 4, 18, .62); outline: 2px dashed #fbbf24; outline-offset: 3px; border-radius: 4px; }
.bk-ed-grid { position: absolute; inset: 0; background-size: calc(100% / 24) calc(100% / 24);
  background-image: linear-gradient(to right, rgba(255, 255, 255, .09) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, .09) 1px, transparent 1px); }
.bk-ed-it { position: absolute; box-sizing: border-box; border: 1px dashed rgba(255, 255, 255, .5); border-radius: 6px; cursor: grab; touch-action: none; user-select: none; }
.bk-ed-it:hover { border: 1px solid #fff; background: color-mix(in srgb, var(--accent) 12%, transparent); }
.bk-ed-it.sel { border: 2px solid #fbbf24; background: rgba(251, 191, 36, .08); }
.bk-ed-it.todo { border-color: #fb923c; }
.bk-ed-name { position: absolute; left: 4px; top: -10px; display: none; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 7px; font-size: 11px; line-height: 16px;
  background: var(--surface, #1a1238); border: 1px solid rgba(255, 255, 255, .3); color: var(--text); white-space: nowrap; max-width: calc(100% + 40px); overflow: hidden; text-overflow: ellipsis; z-index: 3; pointer-events: none; }
.bk-ed-it:hover .bk-ed-name, .bk-ed-it.sel .bk-ed-name, .bk-ed-it.todo .bk-ed-name { display: inline-flex; }
.bk-ed-it.sel .bk-ed-name { background: #fbbf24; color: #1a1238; border-color: #fbbf24; } .bk-ed-it.sel .bk-ed-name .ic { color: #1a1238; }
.bk-ed-rz { position: absolute; right: 1px; bottom: 1px; width: 16px; height: 16px; background: #fbbf24; border-radius: 4px 0 6px 0; cursor: nwse-resize; opacity: 0; z-index: 3; }
.bk-ed-it:hover .bk-ed-rz, .bk-ed-it.sel .bk-ed-rz { opacity: .95; }
.bk-ed-tip { position: absolute; left: -200px; right: -200px; top: calc(100% + 8px); text-align: center; font-size: 12px; color: #fde68a; pointer-events: none; white-space: nowrap; }
.bk-addrow { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.bk-add { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 9px 2px; font-size: 12px; cursor: grab; touch-action: none; }
.bk-h { display: block; font-size: 13px; margin-top: 6px; }
.bk-list { display: flex; flex-direction: column; gap: 3px; }
.bk-li { display: flex; align-items: center; gap: 6px; text-align: left; justify-content: flex-start; }
.bk-li > span { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bk-li.cur { border-color: #fbbf24; } .bk-todo { color: #fb923c; }
.bk-pe { display: flex; flex-direction: column; gap: 7px; border-top: 1px solid var(--glass-line); padding-top: 10px; margin-top: 4px; }
.bk-peh { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; } .bk-peh small { flex-basis: 100%; }
.bk-done { margin-left: auto; }
.bk-open { width: 100%; padding: 12px; font-size: 15px; }`));
  }

  // ---------- left: the cards to add ----------
  function palette() {
    const box = $(".bld-pal-scroll"); if (!box || !st) return;
    if (st.ptab === "layers") return box.replaceChildren(...layers());
    const btn = (k, n, ic, d) => {
      const [w, h] = sizeOf(k);
      return el("div.bld-add", { title: Kit.t("builder.pal.addTip", { what: d }), "data-type": k, "gs-w": String(w), "gs-h": String(h) }, iconEl(ic, 18), el("span", {}, n));
    };
    box.replaceChildren(
      el("h3", {}, Kit.t("builder.pal.cards")),
      el("small.muted", {}, Kit.t("builder.pal.hint")),
      cats(),
      ...(() => {
        const cat = st.cat || (st.ctx.room ? "room" : "devices"), q = (st.find || "").toLowerCase();
        const hit = (n, d) => !q || `${n} ${d}`.toLowerCase().includes(q);
        const types = TYPES.filter(([k, n, , d]) => (k.startsWith("room") && k !== "room" ? st.ctx.room : true) && (q ? hit(n, d) : (CAT_OF[k] || []).includes(cat)));
        const mine = st.cards.filter((u) => (q ? hit(u.name, u.description || "") : cat === "yours"));
        const saved = (st.tpls || []).filter((s) => (!/^room./.test(s.card.t) || st.ctx.room) && (q ? hit(s.name, tdef(s.card.t)[1]) : cat === "yours"));
        return [
          types.length ? el("div.bld-pal", {}, types.map(([k, n, ic, d]) => btn(k, n, ic, d))) : null,
          saved.length ? el("h4.bld-palh", {}, Kit.t("builder.pal.saved")) : null,
          saved.length ? el("div.bld-pal", {}, saved.map((s) => btn("tpl:" + s.id, s.name, tdef(s.card.t)[2], tdef("tpl:" + s.id)[3]))) : null,
          saved.length && !q ? el("details.bld-saved", {}, el("summary", {}, Kit.t("builder.pal.manageSaved")),
            ...saved.map((s) => el("div.bld-savedrow", {},
              el("input", { type: "text", value: s.name, maxlength: "40", "aria-label": Kit.t("builder.f.name"),
                onchange: (e) => { const v = e.target.value.trim();
                  if (!v) { e.target.value = s.name; return toast(Kit.t("builder.pal.needName", { name: s.name }), true); }
                  if (v !== s.name) tplChange({ action: "rename", id: s.id, name: v }, Kit.t("builder.pal.renamed")); } }),
              el("button.ghost.bad.small", { type: "button", title: Kit.t("builder.pal.removeTip"),
                onclick: async () => { if (await Kit.ask({ title: Kit.t("builder.pal.removeAsk", { name: s.name }), text: Kit.t("builder.pal.removeText"), yes: Kit.t("builder.pal.remove"), danger: true })) tplChange({ action: "remove", id: s.id }, Kit.t("builder.pal.removed")); } }, "✕")))) : null,
          mine.length ? el("h4.bld-palh", {}, Kit.t("builder.pal.mine")) : null,
          mine.length ? el("div.bld-pal", {}, mine.map((u) => btn("card:" + u.id, u.name, "grid", u.description || ""))) : null,
          !types.length && !mine.length && !saved.length ? el("small.muted", {}, cat === "yours" && !q
            ? Kit.t("builder.pal.yoursEmpty")
            : Kit.t("builder.pal.nothing")) : null].filter(Boolean);
      })());
    dragIn();
  }
  // Layers (v2.5.0): every card on the page, top to bottom — a click selects it (the screen shows which)
  function layers() {
    const cs = [...st.g.cards].sort((a, b) => a.y - b.y || a.x - b.x);
    const nm = (c) => c.o.title || (c.o.id ? devName(c.o.id) : "") || tdef(c.t)[1];
    return [el("h3", {}, Kit.t("builder.pal.layers")), el("small.muted", {}, cs.length ? Kit.t("builder.layers.count", { n: cs.length, page: pageName() }) : Kit.t("builder.layers.none", { page: pageName() })),
      el("div.bld-layers", { role: "list" }, cs.map((c) => el("button.bld-layer" + (c.i === st.sel ? ".on" : ""), { type: "button", role: "listitem", "aria-current": c.i === st.sel ? "true" : null,
        onclick: () => { if (st.mode !== "arrange") setMode("arrange"); select(c.i); } }, iconEl(tdef(c.t)[2], 16), el("span", {}, nm(c)),
      el("small", {}, c.show && c.show.length ? Kit.t("builder.layers.sometimes") : tdef(c.t)[1] !== nm(c) ? tdef(c.t)[1] : ""))))];
  }
  // the categories (and a search over every card)
  function cats() {
    const cat = st.cat || (st.ctx.room ? "room" : "devices");
    const find = el("input", { type: "search", placeholder: Kit.t("builder.pal.find"), value: st.find || "", oninput: (e) => { st.find = e.target.value; palette(); const f = $(".bld-palfind"); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } } });
    find.classList.add("bld-palfind");
    return el("div.bld-cats", {}, find,
      el("div.bld-catrow", {}, CATS.filter(([k]) => k !== "room" || st.ctx.room).map(([k, n, ic]) =>
        el("button.bld-cat" + (cat === k && !st.find ? ".cur" : ""), { type: "button", title: n, onclick: () => { st.cat = k; st.find = ""; palette(); } }, iconEl(ic, 16), el("span", {}, n)))));
  }
  function dragIn() {}   // (the list's cards: onPalDown, one listener for the whole page)

  // ---------- right: the selected card's settings ----------
  function side() {
    const box = $(".bld-side"); if (!box || !st) return;
    const c = st.g.cards.find((x) => x.i === st.sel), ic = innerCard();
    // (drawn again: the box or button that had the focus gets it back, and the list stays where it was scrolled to)
    // (left with Tab / Shift+Tab, a box's change comes after the focus left it — and the browser's next field is in the old
    // list: that box counts as focused, and the next one in the new list gets the focus)
    const tf = st.tabFrom && box.contains(st.tabFrom.el) ? st.tabFrom : null;
    const FOC = "input, select, textarea, button, summary", a = tf ? tf.el : document.activeElement, top = box.scrollTop;   // i18n-ok
    const at = a && box.contains(a) ? [...box.querySelectorAll(FOC)].indexOf(a) : -1, sig = (x) => `${x.tagName}:${x.type || ""}:${x.tagName === "BUTTON" ? x.textContent.replace(/^[✓+] /, "") : ""}`, kind = a ? sig(a) : "";
    box.replaceChildren(ic ? innerSide(ic) : c ? inspector(c) : pagePanel());
    box.scrollTop = top;
    if (at >= 0 && !box.contains(document.activeElement)) {
      const all = [...box.querySelectorAll(FOC)], n = all[at];
      const live = all.filter((x) => !x.disabled && x.offsetParent !== null), to = n && tf ? live[live.indexOf(n) + tf.dir] : null;
      if (n && sig(n) === kind) (to || n).focus({ preventScroll: true });
    }
    // (drawing the settings may fill in empty lists on the card — that's not a change of its own to undo)
    st.base = snap();
  }
  const row = (label, ...kids) => el("div.bld-row", {}, el("span.bld-l", {}, label), ...kids);
  const seg = (opts, cur, pick) => el("div.seg", {}, opts.map(([v, l]) => el("button" + (cur === v ? ".cur" : ""), { type: "button", onclick: () => pick(v) }, l)));

  // a card's picture: a line icon ("bulb"), an animated drawing ("art:washer", roomlayoutG.js) or one of the owner's
  // pictures ("up:<id>") — drawn here as the panel draws it (grid.js)
  const G = () => window.RoomLayouts && RoomLayouts.G;
  function picEl(v, size) {
    if (/^art:/.test(v || "")) {
      const box = el("span.artbox", { style: `width:${size}px;height:${Math.round(size * 1.15)}px` }), k = v.slice(4);
      if (G() && G().artKeys.includes(k)) box.innerHTML = G().artPreview(k);   // (our own SVG drawings, never user text)
      return box;
    }
    const mo = /^mo:([a-z]+):([A-Za-z0-9]+)$/.exec(v || "");
    if (mo && window.Motion) { const b = el("span"); b.innerHTML = Motion.wrap(icon(mo[2], Math.round(size * 0.75)), mo[1], true, Math.round(size * 0.75)); return b; }
    if (/^up:[0-9a-f]{16}$/.test(v || "")) return el("img", { src: `/pictures/${v.slice(3)}`, alt: "", style: `width:${size}px;height:${size}px;object-fit:contain` });
    return iconEl(v, size);
  }
  const picName = (v) => (/^art:/.test(v || "") ? Kit.t("builder.icon.animated", { name: v.slice(4) }) : /^up:/.test(v || "") ? ((st.pics.find((p) => "up:" + p.id === v) || {}).name || Kit.t("builder.icon.yourPicture")) : v || "");
  // ---------- the picture picker: "Icons" (by set) and "Pictures" (the owner's own) ----------
  // Only picking here: the sets (iconsets.js — who made them and "Check for new releases" are on the Icons tab),
  // then category (from the names), animated / still, sort and search. Animated icons (our own motions) only where a
  // motion can be set (device cards).
  const ICON_GROUPS = () => M.iconSets.GROUPS;   // (iconsets.js: the sets, their credits on the Icons tab)
  const SKYPANE_ART = { washer: Kit.t("builder.art.washer"), dryer: Kit.t("builder.art.dryer"), dishwasher: Kit.t("builder.art.dishwasher"), oven: Kit.t("builder.art.oven"), fridge: Kit.t("builder.art.fridge"), microwave: Kit.t("builder.art.microwave"),
    purifier: Kit.t("builder.art.purifier"), garage: Kit.t("builder.art.garage"), trap: Kit.t("builder.art.trap"), "fan-ceiling": Kit.t("builder.art.fanCeiling"), "fan-box": Kit.t("builder.art.fanBox"), "fan-pedestal": Kit.t("builder.art.fanPedestal"),
    "fan-desk": Kit.t("builder.art.fanDesk"), "fan-tower": Kit.t("builder.art.fanTower") };
  // a category from the name (the first that matches)
  const ICON_CATS = [[Kit.t("builder.iconCat.lighting"), /bulb|lamp|light|pendant|chandelier|spot|ledstrip/], [Kit.t("builder.iconCat.laundry"), /wash|dryer|iron/],
    [Kit.t("builder.iconCat.kitchen"), /kitchen|kettle|coffee|espresso|toaster|fryer|blender|dish|fridge|freezer|oven|range|microwave|utensil|wine|hood|cake/],
    [Kit.t("builder.iconCat.climate"), /thermo|fan|^ac|air|heat|radiator|humid|purifier|snowflake|co2/], [Kit.t("builder.iconCat.security"), /lock|key|shield|siren|cctv|camera|smoke|carbon|contact|door|window|gate|garage|fence|motion|vibration|alarm|trap/],
    [Kit.t("builder.iconCat.media"), /tv|speaker|soundbar|remote|gamepad|play|pause|stop|skip|volume|mic|music|film/], [Kit.t("builder.iconCat.tech"), /computer|laptop|phone|tablet|printer|router|server|nas|wifi|bluetooth/],
    [Kit.t("builder.iconCat.energy"), /plug|outlet|power|bolt|batter|solar|ev|charger|meter|gauge|toggle|switch|button/], [Kit.t("builder.iconCat.waterGarden"), /drop|leak|valve|sprinkler|pool|tub|bath|shower|toilet|sink|pump|plant|flower|tree|leaf/],
    [Kit.t("builder.iconCat.weather"), /sun|cloud|rain|wind|storm|snow|fog|umbrella|moon|star|sunrise|sunset/], [Kit.t("builder.iconCat.peoplePets"), /user|baby|dog|cat\b|^cat|bird|fish|paw|presence|away|vacation|luggage|party|sleep/],
    [Kit.t("builder.iconCat.cleaning"), /vacuum|mop|trash|recycle/]];
  const catOf = (s) => { const k = String(s).toLowerCase(); return (ICON_CATS.find(([, re]) => re.test(k)) || [Kit.t("builder.iconCat.other")])[0]; };
  const human = (s) => String(s).replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  // every icon: {v: the value saved, name, group, cat, anim}; animated icons only where a motion can be set (device cards)
  function iconItems(withMotion) {
    const out = [], names = window.ICON_NAMES || [], arts = (G() && G().artKeys) || [];
    for (const n of names) out.push({ v: n, name: human(n), group: "line", cat: catOf(n), anim: false });
    if (withMotion && window.Motion) for (const [n, m] of Object.entries(Motion.byIcon)) if (names.includes(n)) out.push({ v: `mo:${m}:${n}`, name: `${human(n)} · ${m}`, group: "motion", cat: catOf(n), anim: true });
    for (const k of arts) {
      const xa = G().artInfo && G().artInfo(k);
      out.push({ v: "art:" + k, name: xa ? Kit.tOr(`builder.artName.${k}`, xa.name) : SKYPANE_ART[k] || human(k), group: xa ? "skyrotter" : "skypane", cat: catOf(xa ? `${k} ${xa.name}` : k), anim: true });
    }
    return out;
  }
  // the current picture, and the two buttons: Icons (the groups) and Pictures (the owner's own)
  // opts.motion: (motion | null) → the card's icon motion (device cards: picking an animated icon sets both)
  function iconPick(cur, pick, auto = Kit.t("builder.f.automatic"), opts = {}) {
    const withMotion = typeof opts.motion === "function", curMotion = opts.curMotion || null;
    const ups = (st.pics || []).filter((p) => p.style !== "background");
    const f = st.iconF || (st.iconF = { group: "line", cat: "", kind: "", sort: "name", q: "" });   // (remembered while the builder is open)
    if (f.group === "motion" && !withMotion) f.group = "line";
    const grid = el("div.bld-icons");
    const choose = (v) => {
      const m = /^mo:([a-z]+):(.+)$/.exec(v || "");
      if (m && withMotion) { pick(m[2]); opts.motion(m[1]); return; }
      if (withMotion && v && /^(art|up):/.test(v) && curMotion) opts.motion(null);   // (drawings and pictures have their own life)
      pick(v);
    };
    const isCur = (v) => (/^mo:/.test(v) ? v === `mo:${curMotion}:${cur}` : cur === v);
    const tile = (it, size) => el("button.ghost.bld-ic" + (isCur(it.v) ? ".cur" : ""), { type: "button", title: `${it.name} · ${it.cat}`, onclick: () => choose(it.v) }, picEl(it.v, size));
    const sel2 = (opts2, cur2, onpick) => el("select", { onchange: (e) => onpick(e.target.value) }, optList(opts2, cur2));
    const controls = el("div.bld-icf");
    const fill = () => {
      const all = iconItems(withMotion), inGroup = all.filter((it) => it.group === f.group);
      const cats = [...new Set(inGroup.map((it) => it.cat))].sort();
      if (f.cat && !cats.includes(f.cat)) f.cat = "";
      const q = f.q.trim().toLowerCase();
      // a search looks through every group; otherwise the chosen group, category and kind
      let list = q ? all.filter((it) => `${it.name} ${it.v} ${it.cat}`.toLowerCase().includes(q)) : inGroup.filter((it) => (!f.cat || it.cat === f.cat));
      if (f.kind) list = list.filter((it) => (f.kind === "anim" ? it.anim : !it.anim));
      list.sort((a, b) => (f.sort === "cat" ? a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name) : f.sort === "za" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
      const find = el("input", { type: "search", placeholder: Kit.t("builder.icon.find"), value: f.q, oninput: (e) => { f.q = e.target.value; fill(); const x = controls.querySelector("input"); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } } });
      controls.replaceChildren(
        sel2(ICON_GROUPS().filter(([g]) => g !== "motion" || withMotion).map(([g, n]) => [g, `${n} · ${all.filter((it) => it.group === g).length}`]), f.group, (v) => { f.group = v; f.cat = ""; f.q = ""; fill(); }),
        el("div.bld-icf2", {},
          sel2([["", Kit.t("builder.icon.everyCat")], ...cats.map((c) => [c, c])], f.cat, (v) => { f.cat = v; fill(); }),
          sel2([["", Kit.t("builder.icon.animAndStill")], ["anim", Kit.t("builder.icon.anim")], ["still", Kit.t("builder.icon.still")]], f.kind, (v) => { f.kind = v; fill(); }),
          sel2([["name", Kit.t("builder.icon.sortAz")], ["za", Kit.t("builder.icon.sortZa")], ["cat", Kit.t("builder.icon.sortCat")]], f.sort, (v) => { f.sort = v; fill(); })),
        find);
      const big = (it) => (it.v.startsWith("art:") ? 34 : 24);
      grid.replaceChildren(el("button.ghost.small" + (!cur ? ".cur" : ""), { type: "button", onclick: () => choose(null) }, auto),
        ...(list.length ? list.map((it) => tile(it, big(it))) : [el("small.muted", {}, Kit.t("builder.icon.nothing"))]));
    };
    const panel = el("div.bld-iconpick", { hidden: true }, controls, grid);
    // Pictures: the owner's own (Manager → Icons)
    const pgrid = el("div.bld-icons");
    const ppanel = el("div.bld-iconpick", { hidden: true }, el("small.muted", {}, Kit.t("builder.icon.ownPics")), pgrid);
    const pfill = () => pgrid.replaceChildren(...(ups.length ? ups.map((p) => el("button.ghost.bld-ic" + (cur === "up:" + p.id ? ".cur" : ""), { type: "button", title: p.name, onclick: () => choose("up:" + p.id) }, picEl("up:" + p.id, 32)))
      : [el("small.muted", {}, Kit.t("builder.icon.noPics"))]));
    const show = (which) => { const open = which.hidden; panel.hidden = true; ppanel.hidden = true; which.hidden = !open; if (!panel.hidden) fill(); if (!ppanel.hidden) pfill(); };
    const curPic = cur && withMotion && curMotion && !/^(art|up):/.test(cur) && window.Motion ? (() => { const s = el("span"); s.innerHTML = Motion.wrap(icon(cur, 18), curMotion, true, 18); return s; })() : cur ? picEl(cur, 26) : null;
    const now = el("div.bld-icnow", {}, curPic || el("span.muted", {}, auto), el("span", {}, picName(cur) + (withMotion && curMotion && cur && !/^(art|up):/.test(cur) ? ` · ${curMotion}` : "")));
    return el("div.bld-iconwrap", {}, now,
      el("div.bld-icbtns", {}, el("button.ghost.small.bld-icbtn", { type: "button", onclick: () => show(panel) }, Kit.t("builder.icon.icons")),
        el("button.ghost.small", { type: "button", onclick: () => show(ppanel) }, ups.length ? Kit.t("builder.icon.picturesN", { n: ups.length }) : Kit.t("builder.icon.pictures"))),
      panel, ppanel);
  }
  // ---------- a dropdown with checkboxes: a button that says what's ticked ("Modes shown: Heat, Cool, Off ▾") → a
  // list to tick. Esc or a click outside closes it; ↑ ↓ move between the boxes, Space ticks. The settings are drawn
  // again after every tick: it stays open (cdOpen) and the box keeps the focus.
  // items: [[value, name, note?]]; cur: the values ticked; pick(values ticked, in the items' order)
  // opts: sum(names) → the button's words, allText / noneText, disabled(value), foot (a note under the list)
  let cdOpen = null;   // {key, at}: the open one, the box that had the focus
  function cdCss() {   // (its look; kept here with the control — manage.css can take it over)
    if (document.getElementById("bld-cdrop-css")) return;
    document.head.append(el("style", { id: "bld-cdrop-css" }, `
.bld-cdrop { position: relative; flex: 1 1 100%; min-width: 0; }
.bld-cdrop > .bld-cdbtn { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; justify-content: space-between; }
.bld-cdbtn > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.bld-cdbtn > b { flex: none; font-weight: 400; opacity: .7; }
.bld-cdpanel { position: absolute; z-index: 60; left: 0; right: 0; top: calc(100% + 4px); max-height: 280px; overflow: auto; padding: 6px;
  display: flex; flex-direction: column; gap: 2px; border-radius: 12px; border: 1px solid var(--glass-line);
  background: var(--surface, #1a1238); box-shadow: 0 12px 32px rgba(0, 0, 0, .45); }
.bld-cdpanel[hidden] { display: none; }
.bld-cdi { display: grid; grid-template-columns: 18px 1fr auto; gap: 8px; align-items: center; padding: 5px 6px; border-radius: 8px; font-size: 13px; cursor: pointer; }
.bld-cdi:hover, .bld-cdi:focus-within { background: rgba(255, 255, 255, .07); }
.bld-cdi small { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bld-cdi:has(input:disabled) { opacity: .5; cursor: default; }
.bld-cdpanel > small { padding: 4px 6px 2px; }`));
  }
  function checkDrop(key, label, items, cur, pick, opts = {}) {
    cdCss();
    const on = (v) => cur.includes(v), names = items.filter(([v]) => on(v)).map(([, n]) => n);
    const sum = opts.sum ? opts.sum(names) : names.length === items.length && opts.allText ? opts.allText : names.length ? names.join(", ") : opts.noneText || Kit.t("builder.cd.none");
    const wrap = el("div.bld-cdrop"), words = Kit.t("builder.cd.words", { label, list: sum });
    const btn = el("button.ghost.small.bld-cdbtn", { type: "button", "aria-haspopup": "true", "aria-expanded": "false", title: words }, el("span", {}, words), el("b", { "aria-hidden": "true" }, "▾"));
    const boxes = items.map(([v], k) => el("input", { type: "checkbox", checked: on(v), disabled: !!(opts.disabled && opts.disabled(v)),
      onchange: (e) => { cdOpen = { key, at: k }; pick(items.map(([x]) => x).filter((x) => (x === v ? e.target.checked : on(x)))); } }));
    const panel = el("div.bld-cdpanel", { role: "group", "aria-label": label, hidden: true },
      items.map(([, n, note], k) => el("label.bld-cdi", {}, boxes[k], el("span", {}, n), note != null ? el("small.muted", {}, note) : null)),
      opts.foot ? el("small.muted", {}, opts.foot) : null);
    const outside = (e) => { if (!wrap.isConnected) return document.removeEventListener("pointerdown", outside, true); if (!wrap.contains(e.target)) close(); };
    const move = (k) => { const live = boxes.filter((b) => !b.disabled); if (!live.length) return; const i = live.indexOf(document.activeElement); live[(i + k + live.length) % live.length].focus(); };
    function open(at) {
      panel.hidden = false; btn.setAttribute("aria-expanded", "true"); cdOpen = { key, at: at ?? null };
      document.addEventListener("pointerdown", outside, true);
      if (at != null) { const b = boxes[at] && !boxes[at].disabled ? boxes[at] : boxes.find((x) => !x.disabled); if (b) b.focus({ preventScroll: true }); }
    }
    function close(focusBtn) {
      panel.hidden = true; btn.setAttribute("aria-expanded", "false"); if (cdOpen && cdOpen.key === key) cdOpen = null;
      document.removeEventListener("pointerdown", outside, true);
      if (focusBtn) btn.focus();
    }
    btn.addEventListener("click", () => (panel.hidden ? open() : close()));
    btn.addEventListener("keydown", (e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(e.key === "ArrowUp" ? boxes.length - 1 : 0); } });
    panel.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); move(e.key === "ArrowDown" ? 1 : -1); }
      else if (e.key === "Home" || e.key === "End") { e.preventDefault(); const live = boxes.filter((b) => !b.disabled); (e.key === "Home" ? live[0] : live[live.length - 1])?.focus(); }
      else if (e.key === "Enter") { e.preventDefault(); if (document.activeElement && document.activeElement.type === "checkbox") document.activeElement.click(); }
    });
    // (Esc: only this list closes, not the builder or the card)
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { e.preventDefault(); e.stopPropagation(); close(true); } });
    // (Tab out of the list closes it — not the redraw after a tick, which puts the focus back)
    wrap.addEventListener("focusout", () => setTimeout(() => { if (wrap.isConnected && !panel.hidden && !wrap.contains(document.activeElement)) close(); }, 0));
    wrap.append(btn, panel);
    if (cdOpen && cdOpen.key === key) { const at = cdOpen.at; setTimeout(() => { if (wrap.isConnected) open(at); }, 0); }
    return wrap;
  }
  // some of a list (none chosen = all of them): a checkbox dropdown where every box ticked is "all"
  function checks(key, label, items, cur, pick, allLabel) {
    const all = !Array.isArray(cur) || !cur.length, vals = items.map((x) => x[0]);
    return checkDrop(key, label, items, all ? vals : cur.filter((x) => vals.includes(x)), (next) => pick(next.length === vals.length || !next.length ? null : next),
      { allText: allLabel, foot: Kit.t("builder.cd.foot") });
  }

  // a section of the card's settings, open or closed (remembered while the builder is open)
  function sec(key, title, hint, ...kids) {
    const d = el("details.bld-sec", { open: st.open.has(key) }, el("summary", {}, title, hint ? el("small", {}, hint) : null), ...kids);
    d.addEventListener("toggle", () => { if (d.open) st.open.add(key); else st.open.delete(key); });
    return d;
  }
  function inspector(c) {
    const t = tdef(c.t), o = c.o, s = c.s, u = userCard(c.t);
    const set = (k, v, redraw = true) => { if (v == null || v === "" || (Array.isArray(v) && !v.length && k !== "items")) delete o[k]; else o[k] = v; refreshItem(c); changed(redraw); };
    const sty = (k, v, merge) => { if (v == null) delete s[k]; else s[k] = v; changed(false, merge); };
    // a slider whose name says its value as it moves (one undo step per drag); done = once let go
    const slide = (label, v, lo, hi, step, k, map, done) => {
      const l = el("span.bld-l", {}, label(v));
      return el("div.bld-row", {}, l, el("input", { type: "range", min: lo, max: hi, step, value: v,
        oninput: (e) => { const n = +e.target.value; sty(k, map ? map(n) : n, `sty:${c.i}:${k}`); l.textContent = label(n); },
        onchange: () => { if (done) done(); } }));
    };
    // (a blank card that has pieces isn't "Empty: …" any more)
    const sub = c.t === "blank" && (o.parts || []).length ? Kit.t("builder.insp.blankSub") : t[3];
    const parts = [el("div.bld-head", {}, picEl(o.icon || t[2], 22), el("h3", {}, t[1]), el("small.muted", {}, sub),
      el("button.btn.ghost.bld-desel", { type: "button", "aria-label": Kit.t("builder.insp.letGo"), title: Kit.t("builder.insp.letGo"), onclick: () => select(null) }, Kit.icon("x", 15)))];

    // what it shows
    const what = [];
    if (!["clock", "picture", "blank"].includes(c.t)) what.push(row(Kit.t("builder.f.title"), el("input", { type: "text", value: o.title || "", maxlength: "40", placeholder: Kit.t("builder.f.automaticPh"), onchange: (e) => set("title", e.target.value.trim()) })));
    if (c.t === "lock") what.push(row(Kit.t("builder.piece.lock.name"), devSelect(o.id ?? null, (v) => set("id", v), Kit.t("builder.f.pickLock"), { only: (d) => d.kind === "lock" })),
      el("small.muted", {}, Kit.t("builder.lock.cardNote")),
      o.id ? (() => {   // (what this panel will really do with this lock)
        const D = M.devices && M.devices(), lockOk = ((D && D.unlockable) || []).includes(o.id), panelOk = st.ctx.managed.allowUnlock === true;
        return el("small" + (lockOk && panelOk ? ".muted" : ".bld-note"), {}, lockOk && panelOk ? Kit.t("builder.lock.cardOk", { panel: st.ctx.panel.name })
          : Kit.t(!panelOk ? "builder.lock.notePanel" : "builder.lock.noteLock", { panel: st.ctx.panel.name }));
      })() : null);
    // (the garage door openers first; a plain switch or relay can open a door too)
    if (c.t === "garage") what.push(row(Kit.t("builder.type.garage.name"), devSelect(o.id ?? null, (v) => set("id", v), Kit.t("builder.garage.pickDoor"), GARAGE_FIRST)),
      row(Kit.t("builder.f.picture"), iconPick(o.icon, (v) => set("icon", v), Kit.t("builder.garage.drawing"))));
    if (c.t === "todo") what.push(row(Kit.t("builder.todo.list"), el("input", { type: "text", value: o.list || "shopping", maxlength: "30", list: "bld-lists",
        onchange: (e) => { const v = e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30); set("list", v || "shopping"); } }),
        el("datalist", { id: "bld-lists" }, ["shopping", "todo", "chores", "groceries", "packing"].map((x) => el("option", { value: x })))),
      el("small.muted", {}, Kit.t("builder.todo.shareNote")),
      tipRow(Kit.t("builder.todo.done"), Kit.t("builder.todo.doneTip"), seg([[false, Kit.t("builder.todo.showStruck")], [true, Kit.t("builder.todo.hide")]], o.hideDone === true, (v) => set("hideDone", v ? true : null))));
    if (c.t === "fan") what.push(row(Kit.t("builder.type.fan.name"), devSelect(o.id ?? null, (v) => set("id", v), Kit.t("builder.fan.pick"), { only: (d) => /fan|purifier/.test(d.kind) })));
    if (c.t === "energy") {
      const tip = { solar: Kit.t("builder.energy.solarTip"),
        grid: Kit.t("builder.energy.gridTip"),
        battery: Kit.t("builder.energy.batteryTip"), home: Kit.t("builder.energy.homeTip") };
      for (const [k, l] of [["solar", Kit.t("builder.energy.solar")], ["grid", Kit.t("builder.energy.grid")], ["battery", Kit.t("builder.energy.battery")], ["home", Kit.t("builder.energy.home")]])
        what.push(tipRow(l, tip[k], devSelect(o[k] ?? null, (v) => set(k, v), k === "home" ? Kit.t("builder.energy.workedOut") : Kit.t("builder.f.none"), { all: true, narrow: reportsW })));
      what.push(tipRow(Kit.t("builder.energy.gridCounts"), Kit.t("builder.energy.gridCountsTip"), seg([[false, Kit.t("builder.energy.fromGrid")], [true, Kit.t("builder.energy.toGrid")]], o.gridFlip === true, (v) => set("gridFlip", v ? true : null))),
        tipRow(Kit.t("builder.energy.batCounts"), Kit.t("builder.energy.batCountsTip"), seg([[false, Kit.t("builder.energy.giving")], [true, Kit.t("builder.energy.charging")]], o.batFlip === true, (v) => set("batFlip", v ? true : null))),
        el("small.muted", {}, Kit.t("builder.energy.note")));
    }
    if (c.t === "player") what.push(row(Kit.t("builder.player.speaker"), devSelect(o.id ?? null, (v) => set("id", v), Kit.t("builder.player.pick"),
      { only: (d) => (rawDev(d.id).cmds || []).some((x) => ["play", "setVolume"].includes(x)) || d.kind === "speaker" || /speaker|sonos/i.test(d.kind) })),
      tipRow(Kit.t("builder.player.art"), Kit.t("builder.player.artTip"), el("label.switch", {}, el("input", { type: "checkbox", checked: o.art !== false, onchange: (e) => set("art", e.target.checked ? null : false) }), el("span"))));
    if (c.t === "photos") {
      const ups = (st.pics || []).filter((p) => p.style !== "background" || true), cur = o.pics || [];
      what.push(ups.length ? el("div.bld-photos", {}, ups.map((u) => { const v = "up:" + u.id, on = cur.includes(v);
        return el("button.ghost.bld-ph" + (on ? ".cur" : ""), { type: "button", title: u.name, onclick: () => {
          const next = on ? cur.filter((x) => x !== v) : cur.length >= 12 ? (toast(Kit.t("builder.photos.max"), true), cur) : [...cur, v];
          set("pics", next.length ? next : []); } }, el("img", { src: `/pictures/${u.id}`, alt: "" })); }))
        : el("small.muted", {}, Kit.t("builder.photos.none")));
      what.push(row(Kit.t("builder.photos.every"), el("select", { onchange: (e) => set("every", +e.target.value) }, optList([[5, Kit.t("builder.f.secs", { n: 5 })], [10, Kit.t("builder.f.secs", { n: 10 })], [20, Kit.t("builder.f.secs", { n: 20 })], [60, Kit.t("builder.f.mins", { n: 1 })], [300, Kit.t("builder.f.mins", { n: 5 })]], o.every || 10))),
        tipRow(Kit.t("builder.fit.label"), Kit.t("builder.fit.tip"), seg([["cover", Kit.t("builder.fit.fill")], ["contain", Kit.t("builder.fit.whole")]], o.fit || "cover", (v) => set("fit", v))));
    }
    if (c.t === "batteries") what.push(row(Kit.t("builder.batteries.below"), el("select", { onchange: (e) => set("below", +e.target.value) }, optList([[10, "10 %"], [15, "15 %"], [25, "25 %"], [40, "40 %"], [60, "60 %"], [100, Kit.t("builder.batteries.all")]], o.below || 25))));
    if (c.t === "power") what.push(row(Kit.t("builder.f.show"), el("select", { onchange: (e) => set("top", +e.target.value) }, optList([3, 5, 8, 12, 20].map((n) => [n, Kit.t("builder.power.top", { n })]), o.top || 8))),
      el("small.muted", {}, Kit.t("builder.power.note")));
    if (c.t === "alarm") what.push(el("small.muted", {}, Kit.t("builder.alarm.note")));
    // (a value card's new device: its reading only if that device has it too — else "Pick…" again)
    if (["device", "value", "button"].includes(c.t)) what.push(row(c.t === "button" ? Kit.t("builder.button.litWhenOn") : Kit.t("builder.f.device"), devSelect(o.id ?? null, (v) => {
      if (c.t === "value" && v !== o.id && o.at && !(v && o.at in attrsOf(v))) delete o.at;
      set("id", v); }, c.t === "button" ? Kit.t("builder.f.nonePh") : Kit.t("builder.dev.pick"), { all: c.t === "value" })));
    if (c.t === "value") {
      // (the device's own readings, with what each says now — as the blank card's Value piece lists them)
      const A = o.id ? attrsOf(o.id) : {}, names = Object.keys(A).filter((a) => !SKIP_AT.test(a));
      what.push(tipRow(Kit.t("builder.f.reading"), Kit.t("builder.value.readingTip"), el("select", { onchange: (e) => set("at", e.target.value) },
        optList([...(names.length ? names : ATTRS), ...(o.at && names.length && !names.includes(o.at) ? [o.at] : [])].map((a) => [a, names.length && a in A ? Kit.t("builder.f.readingNow", { name: spotPlain(a), value: A[a] || "—" }) : spotPlain(a)]), o.at, Kit.t("builder.f.pick")))));
      what.push(row(Kit.t("builder.f.unit"), el("input", { type: "text", value: o.unit || "", maxlength: "8", placeholder: Kit.t("builder.value.unitPh"), onchange: (e) => set("unit", e.target.value.trim()) })));
      what.push(tipRow(Kit.t("builder.value.decimals"), Kit.t("builder.value.decimalsTip"), el("select", { onchange: (e) => set("dec", e.target.value === "" ? null : +e.target.value) }, optList([[0, "0"], [1, "1"], [2, "2"]], o.dec, Kit.t("builder.f.automatic")))));
    }
    if (c.t === "group") what.push(...groupEditor(c, set));
    if (c.t === "text") {
      const ta = el("textarea", { rows: "4", maxlength: "400", onchange: (e) => set("text", e.target.value) }); ta.value = o.text || "";
      let insDev = null, insAt = "temperature";
      what.push(row(Kit.t("builder.piece.text.name"), ta));
      what.push(el("div.bld-ins", {}, el("small.muted", {}, Kit.t("builder.text.addLive")), devSelect(null, (v) => { insDev = v; }, Kit.t("builder.text.devicePh"), { all: true }),
        el("select", { onchange: (e) => { insAt = e.target.value; } }, optList([["name", Kit.t("builder.text.itsName")], ...ATTRS.map((a) => [a, a])], insAt)),
        el("button.ghost.small", { type: "button", onclick: () => { if (!insDev) return toast(Kit.t("builder.text.pickDevFirst"), true);
          const add = `${ta.value && !/\s$/.test(ta.value) ? " " : ""}{{${insDev}.${insAt}}}`; if (ta.value.length + add.length > 400) return toast(Kit.t("builder.text.fullLong"), true);
          ta.value += add; set("text", ta.value, false); } }, Kit.t("builder.text.insert"))));
      what.push(el("small.muted", {}, Kit.t("builder.text.also", { time: "{{time}}", date: "{{date}}", greeting: "{{greeting}}" })));
      what.push(row(Kit.t("builder.f.align"), seg([["left", Kit.t("builder.f.left")], ["center", Kit.t("builder.f.centre")], ["right", Kit.t("builder.f.right")]], o.align || "left", (v) => set("align", v))));
    }
    if (c.t === "room") what.push(row(Kit.t("builder.type.room.name"), el("select", { onchange: (e) => set("room", e.target.value) }, optList(st.ctx.rooms.map((r) => [r.id, r.name]), o.room, Kit.t("builder.room.pick")))));
    if (c.t === "camera") {
      what.push(row(Kit.t("builder.type.camera.name"), camSelect(o.cam, (v) => set("cam", v))));
      what.push(row(Kit.t("builder.f.shows"), seg([["live", Kit.t("builder.cam.live")], ["still", Kit.t("builder.cam.still")], ["icon", Kit.t("builder.cam.button")]], o.view || "live", (v) => set("view", v === "live" ? null : v))));
      what.push(el("small.muted", {}, o.view === "still" ? Kit.t("builder.cam.stillNote") : o.view === "icon" ? Kit.t("builder.cam.buttonNote")
        : Kit.t("builder.cam.liveNote")));
    }
    if (c.t === "picture") {
      what.push(row(Kit.t("builder.f.picture"), el("select", { onchange: (e) => set("pic", e.target.value) }, optList(st.pics.map((p) => ["up:" + p.id, p.name]), o.pic, st.pics.length ? Kit.t("builder.f.pick") : Kit.t("builder.picture.none")))));
      what.push(tipRow(Kit.t("builder.fit.label"), Kit.t("builder.fit.tip"), seg([["cover", Kit.t("builder.fit.fill")], ["contain", Kit.t("builder.fit.whole")]], o.fit || "cover", (v) => set("fit", v))));
    }
    if (c.t === "calendar") what.push(row(Kit.t("builder.calendar.days"), el("select", { onchange: (e) => set("days", +e.target.value) }, optList([1, 2, 3, 4, 5, 7].map((n) => [n, n]), o.days || 3))));
    if (c.t === "weather") what.push(...wxPlaces(o, set));
    if (c.t === "weather") what.push(row(Kit.t("builder.weather.days"), el("select", { onchange: (e) => set("days", e.target.value === "" ? null : +e.target.value) },
      optList([[0, Kit.t("builder.weather.nowOnly")], [1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"], [7, "7"]], o.days, Kit.t("builder.weather.all")))));
    if (c.t === "openings") what.push(row(Kit.t("builder.f.shows"), seg([["both", Kit.t("builder.openings.both")], ["windows", Kit.t("builder.openings.windows")], ["doors", Kit.t("builder.openings.doors")]], o.show || "both", (v) => set("show", v === "both" ? null : v))));
    if (c.t === "temps") what.push(...tempsEditor(c, o, set));
    if (c.t === "locks") {
      const locks = devices().filter((d) => d.kind === "lock").map((d) => [d.id, d.label]);
      what.push(locks.length ? checks(`locks:${c.i}`, Kit.t("builder.f.shows"), locks, o.ids, (v) => set("ids", v), Kit.t("builder.locks.all")) : el("small.muted", {}, Kit.t("builder.locks.none")));
    }
    if (c.t === "people") {
      const ppl = (st.ctx.managed.people || []).map((p) => [p.id, p.name]);
      what.push(ppl.length ? checks(`ppl:${c.i}`, Kit.t("builder.f.shows"), ppl, o.ids, (v) => set("ids", v), Kit.t("builder.people.all")) : el("small.muted", {}, Kit.t("builder.people.none")));
    }
    // the card's look (research: the research notes)
    const STY = { thermostat: [["dial", Kit.t("builder.style.dial")], ["arc", Kit.t("builder.style.arc")], ["big", Kit.t("builder.style.bigNumber")], ["compact", Kit.t("builder.style.compact")]], device: [["row", Kit.t("builder.style.row")], ["square", Kit.t("builder.style.square")], ["icon", Kit.t("builder.style.iconOnly")], ["slider", Kit.t("builder.style.slider")], ["bar", Kit.t("builder.style.tallBar")]],
      value: [["big", Kit.t("builder.style.bigNumber")], ["gauge", Kit.t("builder.style.gauge")], ["chip", Kit.t("builder.style.chip")]], people: [["pills", Kit.t("builder.style.facesRow")], ["avatars", Kit.t("builder.style.bigAvatars")], ["count", Kit.t("builder.style.count")]],
      modes: [["segmented", Kit.t("builder.style.everyMode")], ["chip", Kit.t("builder.style.currentTap")]], alarm: [["full", Kit.t("builder.style.stateButtons")], ["buttons", Kit.t("builder.style.buttons")], ["badge", Kit.t("builder.style.badge")]],
      player: [["row", Kit.t("builder.style.row")], ["big", Kit.t("builder.style.nowPlaying")], ["volume", Kit.t("builder.style.volumeOnly")]] }[c.t];
    // (a thermostat with one of the 12 looks: the look decides — Thermostat → Look; the style is kept for "Standard")
    if (STY && !(c.t === "thermostat" && o.look)) what.unshift(row(Kit.t("builder.dock.style"), seg(STY, o.style || STY[0][0], (v) => set("style", v === STY[0][0] ? null : v))));
    // the icon's motion while it's on (motions.js — the idea from Anashost's HA-Animated-cards, our own motions)
    if (c.t === "device" && window.Motion) what.push(
      tipRow(Kit.t("builder.motion.label"), Kit.t("builder.motion.tip"), el("select", { onchange: (e) => set("motion", e.target.value || null) },
        optList([["", Kit.t("builder.motion.none")], ["auto", Kit.t("builder.motion.auto")], ...Motion.MOTIONS.map(([k, n]) => [k, Kit.tOr(`builder.motionName.${k}`, n)])], o.motion || ""))),   // (v3.0.0: a translation names them by id)
      tipRow(Kit.t("builder.motion.runAbove"), Kit.t("builder.motion.runAboveTip"), el("input", { type: "number", min: "1", max: "10000", step: "1", placeholder: Kit.t("builder.motion.runPh"), value: o.runW ?? "",
        onchange: (e) => { const n = Math.round(+e.target.value); set("runW", n >= 1 && n <= 10000 ? n : null); } }), el("span.muted", {}, " W")),
      el("small.muted", {}, Kit.t("builder.motion.note")));
    // a garage opener: its door's contact (for a relay / button) and how long the door takes — the icon then shows the
    // door opening or closing, and staying open or closed (grid.js garage())
    // (the catalogue files the house's door controller as "thing:garage"; Manager → Devices can set any switch "as a garage")
    const garageKind = (k) => k === "garage" || k === "thing:garage";
    if (o.id && (c.t === "garage" || (c.t === "device" && (garageKind(devKind(o.id)) || garageKind((devices().find((d) => d.id === o.id) || {}).kind))))) what.push(
      tipRow(Kit.t("builder.garage.doorContact"), Kit.t("builder.garage.contactTip"), devSelect(o.contact ?? null, (v) => set("contact", v), Kit.t("builder.garage.noContact"), CONTACT_FIRST)),
      tipRow(Kit.t("builder.garage.doorTakes"), Kit.t("builder.garage.takesTip"), el("input", { type: "number", min: "3", max: "60", step: "1", placeholder: "15", value: o.travel ?? "",
        onchange: (e) => { const n = Math.round(+e.target.value); set("travel", n >= 3 && n <= 60 ? n : null); } }), el("span.muted", {}, Kit.t("builder.garage.sToOpen"))),
      el("small.muted", {}, Kit.t("builder.garage.contactNote")));
    if (c.t === "spot") what.push(...spotEditor(c, o, set));
    if (c.t === "blank") {   // its pieces: edited inside the card (the card fills the screen)
      const parts = o.parts || [];
      what.push(el("button.primary.bk-open", { type: "button", title: Kit.t("builder.blank.openTip"), onclick: () => enterInner(c) }, parts.length ? Kit.t("builder.blank.edit") : Kit.t("builder.blank.fill")),
        el("small.muted", {}, parts.length ? Kit.t("builder.blank.pieces", { n: parts.length, list: parts.map(pieceName).join(" · ") }) : Kit.t("builder.blank.empty")),
        ...parts.map(pieceProblem).filter(Boolean).slice(0, 1).map((x) => el("small.bld-note", {}, Kit.t("builder.blank.needs", { problem: x }))),
        el("b.bk-h", {}, Kit.t("builder.inner.addPiece")), (innerCss(), el("div.bk-addrow", {}, PIECE_T.map(([t]) => pieceBtn(t, () => { enterInner(c); addPiece(t, null); }, parts.length >= 16)))));
    }
    if (c.t === "value" && o.style === "gauge") what.push(row(Kit.t("builder.gauge.from"), el("input", { type: "text", inputmode: "decimal", value: o.min ?? 0, onchange: (e) => { const n = parseFloat(e.target.value); set("min", Number.isFinite(n) ? n : null); } })),
      row(Kit.t("builder.gauge.to"), el("input", { type: "text", inputmode: "decimal", value: o.max ?? 100, onchange: (e) => { const n = parseFloat(e.target.value); set("max", Number.isFinite(n) ? n : null); } })),
      (o.max ?? 100) <= (o.min ?? 0) ? el("small.bld-note", {}, Kit.t("builder.gauge.bad")) : null);
    if (c.t === "roomdevs") {
      what.push(row(Kit.t("builder.f.shows"), el("select", { onchange: (e) => set("show", e.target.value) }, optList([["lights", Kit.t("builder.dev.lights")], ["switches", Kit.t("builder.roomdevs.switches")], ["fans", Kit.t("builder.roomdevs.fans")], ["shades", Kit.t("builder.roomdevs.shades")], ["all", Kit.t("builder.roomdevs.all")]], o.show || "all"))));
      // (v3.0.2: "Orbs" — Room Layout G's light orbs: grid.js)
      what.push(row(Kit.t("builder.look.title"), seg([["list", Kit.t("builder.todo.list")], ["tiles", Kit.t("builder.roomdevs.tiles")], ["orbs", Kit.t("builder.roomdevs.orbs")]], o.look || "list", (v) => set("look", v))));
      what.push(el("small.muted", {}, Kit.t("builder.roomdevs.note")));
    }
    if (c.t === "roomhead") what.push(row(Kit.t("builder.roomhead.allOnOff"), el("label.switch", {}, el("input", { type: "checkbox", checked: o.allOff !== false, onchange: (e) => set("allOff", e.target.checked ? null : false) }), el("span"))),
      row(Kit.t("builder.f.icon"), iconPick(o.icon, (v) => set("icon", v), Kit.t("builder.f.none"))));
    if (c.t === "scenes") what.push(...listEditor(o, "items", 8, Kit.t("builder.scenes.add"), () => ({ label: Kit.t("builder.scenes.scene"), a: { do: "none" } }), (it) => [
      row(Kit.t("builder.f.name"), el("input", { type: "text", value: it.label || "", maxlength: "24", onchange: (e) => { it.label = e.target.value.trim() || Kit.t("builder.scenes.scene"); changed(); } })),
      row(Kit.t("builder.f.icon"), iconPick(it.icon, (v) => { if (v) it.icon = v; else delete it.icon; changed(); }, Kit.t("builder.scenes.sparkles"))),
      actionEditor(it, "a", Kit.t("builder.scenes.does"))]),
      row(Kit.t("builder.look.title"), seg([["row", Kit.t("builder.style.row")], ["list", Kit.t("builder.todo.list")]], o.look || "row", (v) => set("look", v === "row" ? null : v))),
      el("small.muted", {}, Kit.t("builder.scenes.note")));
    if (c.t === "modes") what.push(el("small.muted", {}, Kit.t("builder.modes.note")));
    if (c.t === "countdown") what.push(row(Kit.t("builder.countdown.date"), el("input", { type: "date", value: o.date || "", onchange: (e) => set("date", e.target.value || null) })),
      row(Kit.t("builder.f.icon"), iconPick(o.icon, (v) => set("icon", v), Kit.t("builder.f.none"))));
    if (c.t === "bins") what.push(...listEditor(o, "items", 6, Kit.t("builder.bins.add"), () => ({ name: Kit.t("builder.bins.rubbish"), day: 1, every: 1, color: "#22c55e" }), (b) => [
      row(Kit.t("builder.f.name"), el("input", { type: "text", value: b.name || "", maxlength: "24", onchange: (e) => { b.name = e.target.value.trim() || Kit.t("builder.bins.bin"); changed(); } }),
        el("input", { type: "color", value: b.color || "#22c55e", onchange: (e) => { b.color = e.target.value; changed(); } })),
      row(Kit.t("builder.bins.collected"), el("select", { onchange: (e) => { b.day = +e.target.value; changed(); } }, optList(["builder.day.sunday", "builder.day.monday", "builder.day.tuesday", "builder.day.wednesday", "builder.day.thursday", "builder.day.friday", "builder.day.saturday"].map((d, i) => [i, Kit.t(d)]), b.day)),
        el("select", { onchange: (e) => { b.every = +e.target.value; changed(); } }, optList([[1, Kit.t("builder.bins.weekly")], [2, Kit.t("builder.bins.fortnightly")]], b.every || 1))),
      b.every === 2 ? row(Kit.t("builder.bins.from"), el("input", { type: "date", value: b.from || "", onchange: (e) => { if (e.target.value) b.from = e.target.value; else delete b.from; changed(); } })) : null]));
    if (c.t === "timer") what.push(row(Kit.t("builder.timer.buttons"), el("input", { type: "text", value: (o.presets || [1, 5, 10, 15, 30]).join(", "), placeholder: "1, 5, 10, 15, 30",
      onchange: (e) => {   // (each once, whole minutes 1–240, at most 6 — what's left out is said)
        const all = e.target.value.split(/[\s,]+/).filter(Boolean), v = [...new Set(all.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 240))].slice(0, 6);
        if (v.length < all.length) toast(v.length ? Kit.t("builder.timer.someLeft") : Kit.t("builder.timer.noneWork"), !v.length);
        set("presets", v.length ? v : null); } })));
    if (c.t === "roomcams") what.push(row(Kit.t("builder.f.shows"), seg([["live", Kit.t("builder.cam.live")], ["still", Kit.t("builder.cam.still")]], o.view || "live", (v) => set("view", v === "live" ? null : v))));
    if (c.t === "thermostat") what.push(...thermoEditor(c, o, set));
    if (["device", "value", "text", "button", "room", "camera"].includes(c.t) && !(c.t === "camera" && o.view !== "icon")) what.push(row(Kit.t("builder.f.icon"), c.t === "device"
      ? iconPick(o.icon, (v) => set("icon", v), Kit.t("builder.f.automatic"), { motion: (m) => set("motion", m), curMotion: o.motion })
      : iconPick(o.icon, (v) => set("icon", v))));
    if (u) {   // a card people made: its devices (slots) and its own settings
      o.bind = o.bind || {}; o.set = o.set || {};
      what.length = 0;
      for (const sl of u.slots) {
        what.push(row(sl.required ? sl.label : Kit.t("builder.ucard.optional", { label: sl.label }), devSelect(o.bind[sl.key] ?? null, (v) => { if (v) o.bind[sl.key] = v; else delete o.bind[sl.key]; refreshItem(c); changed(); }, Kit.t("builder.dev.pick"))));
        what.push(el("small.muted", {}, Kit.t(sl.commands.length ? "builder.ucard.readsSends" : "builder.ucard.reads", { attrs: sl.attributes.join(", ") || Kit.t("builder.ucard.nothing"), cmds: sl.commands.join(", ") })));
      }
      for (const se of u.settings) {
        const cur = se.key in o.set ? o.set[se.key] : se.default, put = (v) => { o.set[se.key] = v; changed(false); };
        const input = se.type === "bool" ? el("label.switch", {}, el("input", { type: "checkbox", checked: !!cur, onchange: (e) => put(e.target.checked) }), el("span"))
          : se.type === "select" ? el("select", { onchange: (e) => put(e.target.value) }, optList(se.options.map((x) => [x, x]), cur))
          : se.type === "color" ? el("input", { type: "color", value: cur, onchange: (e) => put(e.target.value) })
          : se.type === "number" ? el("input", { type: "text", inputmode: "decimal", value: String(cur), onchange: (e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) put(n); } })
          : el("input", { type: "text", value: cur, maxlength: "60", onchange: (e) => put(e.target.value) });
        what.push(row(se.label, input));
      }
      if (!u.slots.length && !u.settings.length) what.push(el("small.muted", {}, Kit.t("builder.ucard.noSettings")));
    }
    // what's inside follows the card's size: scaled to fit, or (lists) fitted to the width and scrolling up and down —
    // on top, where it's seen (it was hidden under Style)
    if (c.t !== "blank") { const fitNow = s.fit === "scroll" || s.fit === false ? "scroll" : "scale";
      what.unshift(tipRow(Kit.t("builder.resize.label"), Kit.t("builder.resize.tip"), seg([["scale", Kit.t("builder.resize.scale")], ["scroll", Kit.t("builder.resize.scroll")]], fitNow, (v) => { sty("fit", v === "scale" ? null : "scroll"); side(); })),
        el("small.muted", {}, fitNow === "scale" ? Kit.t("builder.resize.scaleNote")
          : Kit.t("builder.resize.scrollNote"))); }
    if (what.length) parts.push(sec("shows", u ? Kit.t("builder.sec.devicesSettings") : Kit.t("builder.f.shows"), "", ...what));
    if (["device", "button"].includes(c.t) && o.id) {
      const list = o.wheel || (o.wheel = []);
      const save = () => { if (list.length) o.wheel = list; else delete o.wheel; changed(); };
      parts.push(sec("wheel", Kit.t("builder.sec.wheel"), list.length ? Kit.t("builder.sec.nActions", { n: list.length }) : "", wheelEditor(o.id, list, save, o.icon)));
      if (!list.length) delete o.wheel;
    }

    // style (presets first, then fine-tuning) — the panel in the middle shows each change at once
    const PRE = [[Kit.t("builder.pre.glass"), { r: 24, e: 1, a: null, b: true }], [Kit.t("builder.pre.flat"), { r: 12, e: 0, a: 25, b: false }], [Kit.t("builder.pre.raised"), { r: 18, e: 3, a: 85, b: true }],
      [Kit.t("builder.style.square"), { r: 0, e: 0, a: null, b: true }], [Kit.t("builder.pre.noCard"), { r: 0, e: 0, a: 0, b: false }]];
    const fitNow = s.fit === "scroll" ? "scroll" : s.fit === false ? "scroll" : "scale";
    parts.push(sec("style", Kit.t("builder.dock.style"), fitNow === "scroll" ? Kit.t("builder.sec.scrolls") : "",
      el("div.bld-pre", {}, PRE.map(([n, p]) => el("button.ghost.small", { type: "button", onclick: () => { for (const [k, v] of Object.entries(p)) { if (v == null) delete s[k]; else s[k] = v; } changed(); } }, n))),
      slide((v) => Kit.t("builder.sty.corners", { n: v }), s.r ?? 24, 0, 48, 2, "r"),
      tipRow(Kit.t("builder.pre.raised"), Kit.t("builder.sty.raisedTip"), seg([[0, Kit.t("builder.pre.flat")], [1, Kit.t("builder.sty.little")], [2, Kit.t("builder.sty.more")], [3, Kit.t("builder.sty.threeD")]], s.e ?? 1, (v) => { sty("e", v); side(); })),
      (() => { const r = slide((v) => (s.a == null ? Kit.t("builder.sty.alphaPanel") : Kit.t("builder.sty.alpha", { n: v })), s.a ?? 72, 0, 100, 5, "a", null, () => side());
        r.title = Kit.t("builder.sty.alphaTip");
        if (s.a != null) r.append(el("button.ghost.small", { type: "button", title: Kit.t("builder.sty.alphaResetTip"), onclick: () => { sty("a", null); side(); } }, Kit.t("builder.sty.alphaReset")));
        return r; })(),
      tipRow(Kit.t("builder.sty.border"), Kit.t("builder.sty.borderTip"), el("label.switch", {}, el("input", { type: "checkbox", checked: s.b !== false, onchange: (e) => sty("b", e.target.checked ? null : false) }), el("span"))),
      slide((v) => Kit.t("builder.sty.icons", { n: v }), s.ic ?? 100, 50, 250, 10, "ic", (v) => (v === 100 ? null : v)),
      slide((v) => Kit.t("builder.sty.text", { n: v }), s.tx ?? 100, 50, 250, 10, "tx", (v) => (v === 100 ? null : v)),
      tipRow(Kit.t("builder.sty.colour"), Kit.t("builder.sty.colourTip"), el("input", { type: "color", value: s.c || "#8b5cf6", onchange: (e) => sty("c", e.target.value) }),
        s.c ? el("button.ghost.small", { type: "button", onclick: () => { sty("c", null); side(); } }, Kit.t("builder.sty.themes")) : null)));

    // actions
    const actRows = [["tap", Kit.t("builder.act.tap")], ["hold", Kit.t("builder.act.hold")], ["dbl", Kit.t("builder.act.dbl")]].map(([k, l]) =>
      k === "hold" && (o.wheel || []).length ? el("div.bld-act", {}, el("span.bld-l", {}, l), el("small.muted", {}, Kit.t("builder.act.opensWheel"))) : actionEditor(c, k, l));
    if (!u && c.t !== "group") parts.push(sec("acts", Kit.t("builder.sec.does"), ["tap", "hold", "dbl"].filter((k) => c[k]).length ? Kit.t("builder.sec.set") : "", ...actRows,
      ["device", "room", "camera"].includes(c.t) && !c.tap ? el("small.muted", {}, c.t === "device" ? Kit.t("builder.act.noTapDevice") : Kit.t("builder.act.noTapOpen")) : null));

    // show-when / highlight
    parts.push(sec("rules", Kit.t("builder.sec.rules"), c.show || c.hi ? Kit.t("builder.sec.set") : "", el("h4", { title: Kit.t("builder.rules.showTip") }, Kit.t("builder.rules.show")), rulesEditor(c, "show"),
      el("h4", { title: Kit.t("builder.rules.hiTip") }, Kit.t("builder.rules.hi")), rulesEditor(c, "hi"),
      c.hi ? tipRow(Kit.t("builder.rules.hiColour"), Kit.t("builder.rules.hiColourTip"), el("input", { type: "color", value: c.hic || "#f59e0b", onchange: (e) => { c.hic = e.target.value; changed(false); } })) : null));

    parts.push(el("div.bld-acts", {},
      el("button.ghost", { type: "button", onclick: () => { const at = freeSpot(c.w, c.h); if (!at) return toast(Kit.t("builder.card.noSpace"), true);
        const d = { ...structuredClone(c), i: newId(), ...at }; st.g.cards.push(d); st.sel = d.i; drawHandles(); changed(); } }, Kit.t("builder.f.duplicate")),
      st.g.ov ? el("button.ghost", { type: "button", title: Kit.t("builder.card.frontTip"), onclick: () => restack(c, true) }, Kit.t("builder.f.toFront")) : null,
      st.g.ov ? el("button.ghost", { type: "button", title: Kit.t("builder.card.backTip"), onclick: () => restack(c, false) }, Kit.t("builder.f.toBack")) : null,
      el("button.ghost", { type: "button", title: Kit.t("builder.card.saveTip"), onclick: () => saveTpl(c) }, Kit.t("builder.card.save")),
      el("button.ghost.bad", { type: "button", onclick: () => remove(c) }, Kit.t("builder.pal.remove"))));
    return el("div.card.bld-insp", {}, ...parts);
  }

  // keep a card as set up (its look, devices, actions, rules) under a name: Your cards → Saved cards
  function saveTpl(c) {
    // (a blank card with an unfinished piece: the same check as Save — the piece is shown, inside the card)
    const k = c.t === "blank" ? (c.o.parts || []).findIndex((q) => pieceProblem(q)) : -1;
    if (k >= 0) { const q = c.o.parts[k]; enterInner(c, k); return toast(Kit.t("builder.card.pieceTodo", { piece: pieceName(q), n: k + 1, problem: pieceProblem(q) }), true); }
    const box = $(".bld-insp .bld-acts"); if (!box || box.querySelector(".bld-savename")) return;
    // (the name it suggests: the card's title, else its device's name, else the kind of card)
    const name = el("input", { type: "text", maxlength: "40", value: (c.o.title || (c.o.id ? devName(c.o.id) : "") || tdef(c.t)[1]).slice(0, 40), "aria-label": Kit.t("builder.card.nameAria") });
    const go = () => { const n = name.value.trim(); if (!n) { toast(Kit.t("builder.card.needName"), true); return name.focus(); }
      tplChange({ action: "add", name: n, card: structuredClone(c), fine: st.g.v === 2 ? st.g.cols : false }, Kit.t("builder.card.saved")); form.remove(); };
    const form = el("div.bld-savename", {}, name, el("button.primary.small", { type: "button", onclick: go }, Kit.t("builder.top.save")),
      el("button.ghost.small", { type: "button", onclick: () => form.remove() }, Kit.t("builder.card.cancel")));
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); if (e.key === "Escape") form.remove(); });
    box.after(form); name.select();
  }

  // ---------- the press-and-hold wheel: what this device can do, picked in a ring around it ----------
  // From the device's own capabilities and commands (house model can_do): every action it supports; the owner turns
  // up to 8 on. A colour bulb that takes hue and saturation one by one still gets colour swatches: the panel sends
  // them the way that bulb wants (grid.js run).
  const rawDev = (id) => (((M.devices && M.devices()) || {}).devices || []).find((d) => d.id === id) || {};
  const COLORS = [[Kit.t("builder.colour.red"), 0, 100, "#ff3b30"], [Kit.t("builder.colour.orange"), 8, 100, "#ff9500"], [Kit.t("builder.colour.yellow"), 16, 100, "#ffcc00"], [Kit.t("builder.colour.green"), 33, 100, "#34c759"],
    [Kit.t("builder.colour.cyan"), 50, 100, "#32d2f5"], [Kit.t("builder.colour.blue"), 66, 100, "#007aff"], [Kit.t("builder.colour.purple"), 77, 100, "#af52de"], [Kit.t("builder.colour.pink"), 90, 60, "#ff6fb0"]];
  function wheelChoices(id) {
    const d = rawDev(id), caps = new Set(d.caps || []), cmds = new Set(d.cmds || []), out = [];
    const put = (key, label, icon, a, col) => out.push({ key, label, icon, col, a: { id, ...a } });
    const has = (...c) => c.some((x) => caps.has(x) || cmds.has(x));
    if (has("Switch", "on")) { put("on", Kit.t("builder.wheel.on"), "power", { do: "on" }); put("off", Kit.t("builder.wheel.off"), "power", { do: "off" }); }
    if (has("SwitchLevel", "setLevel")) {
      for (const v of [10, 25, 50, 75, 100]) put(`lv${v}`, Kit.t("builder.wheel.pct", { n: v }), "sun", { do: "cmd", c: "setLevel", v });
      put("lv+", Kit.t("builder.wheel.brighter"), "chevron", { do: "nudge", c: "setLevel", v: 10 }); put("lv-", Kit.t("builder.wheel.dimmer"), "chevron", { do: "nudge", c: "setLevel", v: -10 });
    }
    if (has("ColorTemperature", "setColorTemperature")) for (const [n, k] of [[Kit.t("builder.wheel.warm"), 2700], [Kit.t("builder.wheel.neutral"), 4000], [Kit.t("builder.wheel.daylight"), 6000]]) put(`ct${k}`, n, "bulb", { do: "cmd", c: "setColorTemperature", v: k });
    if (has("ColorControl", "setColor", "setHue")) for (const [n, h, s, hex] of COLORS) put(`col${h}`, n, null, { do: "cmd", c: "setColor", v: `${h},${s}` }, hex);
    if (has("WindowShade", "WindowBlind", "setPosition")) { put("open", Kit.t("builder.wheel.open"), "shade", { do: "cmd", c: "open" }); put("close", Kit.t("builder.wheel.close"), "shade", { do: "cmd", c: "close" }); put("pos50", Kit.t("builder.wheel.half"), "shade", { do: "cmd", c: "setPosition", v: 50 }); }
    if (has("Thermostat", "ThermostatMode", "setThermostatMode")) {
      for (const m of (d.modes || ["heat", "cool", "auto", "off"]).filter((m) => ["heat", "cool", "auto", "off"].includes(m))) put(`tm${m}`, Kit.t({ heat: "builder.wheel.heat", cool: "builder.wheel.cool", auto: "builder.wheel.auto", off: "builder.wheel.off" }[m]), "thermo", { do: "cmd", c: "setThermostatMode", v: m });
      put("heat+", Kit.t("builder.wheel.warmer"), "thermo", { do: "nudge", c: "setHeatingSetpoint", v: 1 }); put("heat-", Kit.t("builder.wheel.cooler"), "thermo", { do: "nudge", c: "setHeatingSetpoint", v: -1 });
      if (has("setCoolingSetpoint", "ThermostatCoolingSetpoint")) { put("cool+", Kit.t("builder.wheel.coolUp"), "thermo", { do: "nudge", c: "setCoolingSetpoint", v: 1 }); put("cool-", Kit.t("builder.wheel.coolDown"), "thermo", { do: "nudge", c: "setCoolingSetpoint", v: -1 }); }
    }
    if (has("ThermostatFanMode", "setThermostatFanMode")) for (const m of (d.fanModes || ["auto", "on"]).filter((m) => ["auto", "on", "circulate"].includes(m))) put(`fm${m}`, Kit.t({ auto: "builder.wheel.fanAuto", on: "builder.wheel.fanOn", circulate: "builder.wheel.fanCirculate" }[m]), "fan", { do: "cmd", c: "setThermostatFanMode", v: m });
    if (has("FanControl", "setSpeed")) for (const sp of (d.speeds || ["low", "medium", "high", "off"]).filter((x) => ["low", "medium-low", "medium", "medium-high", "high", "off", "auto", "on"].includes(x))) put(`sp${sp}`, Kit.t({ low: "builder.wheel.low", "medium-low": "builder.wheel.mediumLow", medium: "builder.wheel.medium", "medium-high": "builder.wheel.mediumHigh", high: "builder.wheel.high", off: "builder.wheel.off", auto: "builder.wheel.auto", on: "builder.wheel.on" }[sp]), "fan", { do: "cmd", c: "setSpeed", v: sp });
    if (has("Lock", "lock")) put("lock", Kit.t("builder.wheel.lock"), "lock", { do: "lock" });
    if (has("Valve", "GarageDoorControl", "DoorControl") && !out.some((x) => x.key === "open")) { put("open", Kit.t("builder.wheel.open"), "drop", { do: "cmd", c: "open" }); put("close", Kit.t("builder.wheel.close"), "drop", { do: "cmd", c: "close" }); }
    if (has("play")) { put("play", Kit.t("builder.wheel.play"), "play", { do: "cmd", c: "play" }); put("pause", Kit.t("builder.wheel.pause"), "pause", { do: "cmd", c: "pause" }); }
    if (has("nextTrack")) put("next", Kit.t("builder.wheel.next"), "skipNext", { do: "cmd", c: "nextTrack" });
    if (has("setVolume")) for (const v of [10, 25, 50]) put(`vol${v}`, Kit.t("builder.wheel.volume", { n: v }), "volume", { do: "cmd", c: "setVolume", v });
    if (has("mute")) put("mute", Kit.t("builder.wheel.mute"), "volumeOff", { do: "cmd", c: "mute" });
    if (has("PushableButton", "push")) for (let n = 1; n <= Math.min(d.buttons || 1, 8); n++) put(`push${n}`, Kit.t("builder.wheel.button", { n }), "button", { do: "cmd", c: "push", v: n });
    if (has("Refresh", "refresh")) put("refresh", Kit.t("builder.wheel.refresh"), "settings", { do: "cmd", c: "refresh" });
    return out;
  }
  const sameAction = (x, y) => x && y && x.do === y.do && x.c === y.c && String(x.v ?? "") === String(y.v ?? "");
  // the ring: every action this device can do; the chosen ones lit, numbered in their order on the wheel
  function wheelEditor(id, list, save, picture) {
    if (!id) return el("small.muted", {}, Kit.t("builder.wheel.pickFirst"));
    const choices = wheelChoices(id);
    if (!choices.length) return el("small.muted", {}, Kit.t("builder.wheel.nothing"));
    const box = el("div.bld-wheel"), n = choices.length, R = n > 14 ? 128 : 112, R2 = 76;
    const outer = n > 14 ? choices.slice(0, Math.ceil(n * 0.6)) : choices, inner2 = n > 14 ? choices.slice(outer.length) : [];
    const place = (ring, r) => ring.forEach((ch, i) => {
      const at = list.findIndex((w) => sameAction(w, ch.a)), ang = -Math.PI / 2 + (2 * Math.PI * i) / ring.length;
      box.append(el("button.bld-wi" + (at >= 0 ? ".on" : ""), { type: "button", title: ch.label, style: `left:${150 + Math.cos(ang) * r}px;top:${150 + Math.sin(ang) * r}px`,
        onclick: () => {
          if (at >= 0) list.splice(at, 1);
          else if (list.length >= 8) return toast(Kit.t("builder.wheel.max"), true);
          else list.push({ ...ch.a, label: ch.label, ...(ch.icon ? { icon: ch.icon } : {}), ...(ch.col ? { col: ch.col } : {}) });
          save();
        } },
        ch.col ? el("i.bld-sw", { style: `background:${ch.col}` }) : iconEl(ch.icon, 16), el("span", {}, ch.label), at >= 0 ? el("b", {}, String(at + 1)) : null));
    });
    place(outer, R); place(inner2, R2);
    box.append(el("div.bld-wmid", {}, picEl(picture || "bulb", 30)));
    return el("div.bld-wheelwrap", {}, box,
      el("small.muted", {}, list.length ? Kit.t("builder.wheel.count", { n: list.length })
        : Kit.t("builder.wheel.hint")),
      list.length ? el("button.ghost.small", { type: "button", onclick: () => { list.length = 0; save(); } }, Kit.t("builder.wheel.noWheel")) : null);
  }

  // ---------- a thermostat card: which thermostat, and which of its modes / its fan's modes show as buttons ----------
  // (the house's own thermostat: the house model's "thermostat"; any device with the thermostat's commands or values)
  const isThermo = (d) => d.kind === "thermostat" || (!/fan|dyson|purifier/i.test(`${d.type} ${d.label}`)
    && (d.caps.some((x) => /^Thermostat/.test(x)) || (rawDev(d.id).cmds || []).includes("setThermostatMode") || "thermostatMode" in (rawDev(d.id).attrs || {})));
  // a list the device sends as text ('["heat","cool"]' or "heat, cool")
  const listAttr = (v) => {
    if (typeof v !== "string" || !v.trim()) return [];
    try { const x = JSON.parse(v); if (Array.isArray(x)) return x.map(String); } catch {}
    return v.split(",").map((x) => x.trim().replace(/^[[\s"']+|[\]\s"']+$/g, "")).filter(Boolean);
  };
  // (the modes the panel may send: the hub bridge's list; "fan" = off with the fan on, as the dial has it)
  const T_MODES = [["heat", Kit.t("builder.wheel.heat")], ["cool", Kit.t("builder.wheel.cool")], ["auto", Kit.t("builder.wheel.auto")], ["fan", Kit.t("builder.thermo.fanOnly"), Kit.t("builder.thermo.fanOnlyNote")], ["off", Kit.t("builder.wheel.off")], ["emergency heat", Kit.t("builder.thermo.emergency")]];   // i18n-ok
  const T_FANS = [["auto", Kit.t("builder.wheel.auto")], ["on", Kit.t("builder.wheel.on")], ["circulate", Kit.t("builder.thermo.circulate")]];
  // what the thermostat says it can do: {modes, fans, guessed (it doesn't say: the usual ones), emergency}
  function thermoCan(id) {
    const d = rawDev(id), a = d.attrs || {};
    let modes = (d.modes && d.modes.length ? d.modes : listAttr(a.supportedThermostatModes)).map((m) => String(m).toLowerCase());
    let fans = (d.fanModes && d.fanModes.length ? d.fanModes : listAttr(a.supportedThermostatFanModes)).map((m) => String(m).toLowerCase());
    const guessed = !modes.length, emergency = modes.includes("emergency heat");   // i18n-ok
    if (!modes.length) modes = ["heat", "cool", "auto", "off"];
    if (!fans.length && ((d.cmds || []).includes("setThermostatFanMode") || "thermostatFanMode" in a)) fans = ["auto", "on"];
    // ("Fan only" = off with the fan on: only for a thermostat whose fan has an "on" mode — auto / circulate alone can't)
    if (fans.includes("on")) modes = [...modes, "fan"];
    return { modes: T_MODES.filter(([m]) => modes.includes(m)), fans: T_FANS.filter(([m]) => fans.includes(m)), guessed, emergency };
  }
  // the thermostat card's 12 looks (the panel draws them: layouts/v4/shared/thermo-looks.js — the same ids, the same
  // order; the pictures: the design notes). None = "Standard": the card's Style (the dial, arc, big, compact).
  const T_LOOKS = [["halo", Kit.t("builder.tlook.halo.name"), Kit.t("builder.tlook.halo.desc")], ["knob", Kit.t("builder.tlook.knob.name"), Kit.t("builder.tlook.knob.desc")],
    ["slider", Kit.t("builder.tlook.slider.name"), Kit.t("builder.tlook.slider.desc")], ["mercury", Kit.t("builder.tlook.mercury.name"), Kit.t("builder.tlook.mercury.desc")],
    ["bignum", Kit.t("builder.tlook.bignum.name"), Kit.t("builder.tlook.bignum.desc")], ["stepper", Kit.t("builder.tlook.stepper.name"), Kit.t("builder.tlook.stepper.desc")],
    ["range", Kit.t("builder.tlook.range.name"), Kit.t("builder.tlook.range.desc")], ["today", Kit.t("builder.tlook.today.name"), Kit.t("builder.tlook.today.desc")],
    ["oneline", Kit.t("builder.tlook.oneline.name"), Kit.t("builder.tlook.oneline.desc")], ["orb", Kit.t("builder.tlook.orb.name"), Kit.t("builder.tlook.orb.desc")],
    ["gauge", Kit.t("builder.tlook.gauge.name"), Kit.t("builder.tlook.gauge.desc")], ["rings", Kit.t("builder.tlook.rings.name"), Kit.t("builder.tlook.rings.desc")]];
  function thermoEditor(c, o, set) {
    const therms = devices().filter(isThermo), house = therms.find((d) => d.kind === "thermostat"), out = [];
    // the look: a dropdown of the 12 (the device picker below stays) — the canvas shows it at once
    const lk = T_LOOKS.find(([k]) => k === o.look);
    out.push(tipRow(Kit.t("builder.look.title"), Kit.t("builder.thermo.lookTip"),
      el("select.bld-tlook", { onchange: (e) => set("look", e.target.value || null) }, optList(T_LOOKS.map(([k, n]) => [k, n]), o.look || "", Kit.t("builder.thermo.standard")))));
    if (lk) out.push(el("small.muted", {}, Kit.t("builder.thermo.lookNote", { desc: lk[2] })));
    // (another thermostat: its own modes — the ticks of the one before don't carry over)
    // (picked: the buttons it starts with are written down — Heat, Cool, Fan, Off where it has them — so the panel
    // never shows a mode this thermostat hasn't got)
    const pickT = (v) => { delete o.modes; delete o.fans; if (v) o.modes = thermoCan(v).modes.map(([m]) => m).filter((m) => ["heat", "cool", "auto", "fan", "off"].includes(m)); set("id", v); };
    out.push(row(Kit.t("builder.type.thermostat.name"), devSelect(o.id ?? null, pickT, therms.length === 1 && house ? Kit.t("builder.thermo.house", { name: house.label }) : Kit.t("builder.thermo.pick"),
      { narrow: isThermo })));
    if (o.id == null && therms.length > 1) out.push(el("small.bld-note", {}, house ? Kit.t("builder.thermo.manyHouse", { n: therms.length, name: house.label }) : Kit.t("builder.thermo.many", { n: therms.length })));
    else if (o.id == null && !therms.length) out.push(el("small.muted", {}, Kit.t("builder.thermo.none")));
    const picked = o.id != null && devices().find((d) => d.id === o.id);
    if (picked && !isThermo(picked)) out.push(el("small.bld-note", {}, Kit.t("builder.thermo.notThermo")));
    const id = o.id ?? (house && house.id);
    if (id == null) return out;
    const can = thermoCan(id);
    // (a mode ticked before that this thermostat hasn't got — "Fan only" without an "on" fan mode — is dropped)
    if (Array.isArray(o.modes) && !can.guessed) o.modes = o.modes.filter((m) => can.modes.some(([x]) => x === m));
    // (not set yet: the buttons the card always had — Heat, Cool, Fan, Off — and Auto, where the thermostat has them)
    const modesNow = Array.isArray(o.modes) ? o.modes : can.modes.map(([m]) => m).filter((m) => ["heat", "cool", "auto", "fan", "off"].includes(m));
    const foot = [can.guessed ? Kit.t("builder.thermo.guessed") : "",
      ""].filter(Boolean).join(" ");
    out.push(tipRow(Kit.t("builder.thermo.modeButtons"), Kit.t("builder.thermo.modeButtonsTip"),
      checkDrop(`tmodes:${c.i}`, Kit.t("builder.thermo.modesShown"), can.modes, modesNow, (next) => { o.modes = next; refreshItem(c); changed(); },
        { allText: can.modes.map(([, n]) => n).join(", "), noneText: Kit.t("builder.thermo.noModes"), foot: foot || null })));
    if (can.fans.length) out.push(tipRow(Kit.t("builder.thermo.fanButtons"), Kit.t("builder.thermo.fanButtonsTip"),
      checkDrop(`tfans:${c.i}`, Kit.t("builder.thermo.fansShown"), can.fans, Array.isArray(o.fans) ? o.fans : [], (next) => { if (next.length) o.fans = next; else delete o.fans; refreshItem(c); changed(); },
        { noneText: Kit.t("builder.cd.none") })));
    out.push(el("small.muted", {}, o.look ? Kit.t("builder.thermo.tapNote") : Kit.t("builder.thermo.tapNoteStyle")));
    return out;
  }

  // ---------- an inside / outside card: which sensor for each (none picked: the panel's inside one, the house's outside one) ----------
  const hasTemp = (d) => "temperature" in (rawDev(d.id).attrs || {});
  const reportsW = (d) => "power" in (rawDev(d.id).attrs || {});   // (an energy meter, the inverter, a smart plug)
  const tempsDev = new Set();   // "card:inside" while "A sensor" is chosen and none picked yet (builder only)
  function tempsEditor(c, o, set) {
    const out = [row(Kit.t("builder.f.shows"), seg([["both", Kit.t("builder.openings.both")], ["inside", Kit.t("builder.temps.inside")], ["outside", Kit.t("builder.temps.outside")]], o.show || "both", (v) => set("show", v === "both" ? null : v)))];
    const outs = devices().find((d) => d.kind === "outside-temp");
    for (const [k, l, dflt] of [["inside", Kit.t("builder.temps.inside"), Kit.t("builder.temps.asPanel")], ["outside", Kit.t("builder.temps.outside"), outs ? Kit.t("builder.temps.houses") : Kit.t("builder.temps.housesNone")]]) {
      if ((o.show === "inside" && k === "outside") || (o.show === "outside" && k === "inside")) continue;
      const key = `${c.i}:${k}`, v = o[k], mode = v === "none" ? "none" : Number.isInteger(v) || tempsDev.has(key) ? "dev" : "";
      out.push(tipRow(l, k === "inside" ? Kit.t("builder.temps.insideTip")
        : outs ? Kit.t("builder.temps.outsideTipNamed", { name: outs.label }) : Kit.t("builder.temps.outsideTip"),
        seg([["", dflt], ["dev", Kit.t("builder.temps.aSensor")], ["none", Kit.t("builder.f.none")]], mode, (m) => {
          if (m === "dev") { tempsDev.add(key); if (Number.isInteger(v)) return; delete o[k]; refreshItem(c); changed(); return; }
          tempsDev.delete(key); set(k, m === "none" ? "none" : null);
        })));
      if (mode === "dev") out.push(row("", devSelect(Number.isInteger(v) ? v : null, (id) => { if (id) set(k, id); else { delete o[k]; refreshItem(c); changed(); } }, Kit.t("builder.temps.pick"),
        { all: true, first: hasTemp, firstLabel: Kit.t("builder.temps.sensors"), restLabel: Kit.t("builder.dev.otherDevices") })));
    }
    if (o.inside === "none" && o.outside === "none") out.push(el("small.bld-note", {}, Kit.t("builder.temps.bothNone")));
    return out;
  }

  // ---------- a weather card's places: + Add a place (search Open-Meteo's place names), × to remove; the first is home ----------
  let wxFound = null, wxAdding = false, wxWhy = "";   // (wxWhy: why the last search found nothing — a word from the table)
  function wxPlaces(o, set) {
    const locs = Array.isArray(o.locs) ? o.locs : [];
    const put = (list) => set("locs", list.length ? list : null);
    const out = [el("b", { style: "display:block;margin-top:6px" }, Kit.t("builder.wx.places")), el("small.muted", { style: "display:block" }, locs.length ? Kit.t("builder.wx.placesNote")
      : Kit.t("builder.wx.noPlaces"))];
    locs.forEach((p, n) => out.push(el("div.bld-row", {}, el("span", {}, `${n === 0 ? "🏠 " : ""}${p.name}${p.region ? `, ${p.region}` : ""}`),
      el("button.ghost.small", { type: "button", disabled: n === 0, "aria-label": Kit.t("builder.wx.up"), title: n === 1 ? Kit.t("builder.wx.makeHome") : Kit.t("builder.wx.up"), onclick: () => { const l = locs.slice(); l.splice(n - 1, 0, l.splice(n, 1)[0]); put(l); } }, "▲"),
      el("button.ghost.small", { type: "button", disabled: n === locs.length - 1, "aria-label": Kit.t("builder.wx.down"), title: Kit.t("builder.wx.down"), onclick: () => { const l = locs.slice(); l.splice(n + 1, 0, l.splice(n, 1)[0]); put(l); } }, "▼"),
      el("button.ghost.small", { type: "button", "aria-label": Kit.t("builder.pal.remove"), onclick: () => put(locs.filter((_, k) => k !== n)) }, "✕"))));
    if (!wxAdding) {
      if (locs.length < 6) out.push(el("button.ghost.small", { type: "button", onclick: () => { wxAdding = true; wxFound = null; changed(); } }, Kit.t("builder.wx.add")));
      return out;
    }
    const q = el("input", { type: "text", placeholder: Kit.t("builder.wx.town"), maxlength: "60", onkeydown: (e) => { if (e.key === "Enter") find(); } });
    async function find() {
      const v = q.value.trim(); if (!v) return;
      // (v3.0.0) asked through Skypane's server (the Manager's page may only reach Skypane: CSP connect-src 'self'), in
      // the login's Manager language; "nothing found" and "the weather service didn't answer" are told apart
      const lang = String((window.Shell && Shell.prefs().lang) || "en").split("-")[0];
      wxWhy = "";
      try {
        const r = await fetch(`/api/manage/geocode?q=${encodeURIComponent(v)}&lang=${encodeURIComponent(lang)}`, { cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (r.status === 401 && j.error === "login") { wxFound = null; if (M.signedOut) M.signedOut(); return; }
        wxFound = r.ok && Array.isArray(j.places) ? j.places.filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).slice(0, 6) : [];
        if (!r.ok) wxWhy = r.status === 429 ? "builder.wx.slowDown" : "builder.wx.unreachable";
      } catch { wxFound = []; wxWhy = "builder.wx.unreachable"; }
      changed();
      setTimeout(() => { const i = document.querySelector(".bld-wxq"); if (i) { i.value = v; i.focus(); } }, 0);
    }
    q.className = "bld-wxq";
    out.push(el("div.bld-row", {}, q, el("button.ghost.small", { type: "button", onclick: find }, Kit.t("builder.wx.search")),
      el("button.ghost.small", { type: "button", onclick: () => { wxAdding = false; wxFound = null; changed(); } }, Kit.t("builder.card.cancel"))));
    if (wxFound) out.push(wxFound.length ? el("div.bld-attrs", {}, ...wxFound.map((p) => el("button.ghost.small", { type: "button", style: "text-align:left",
      onclick: () => { wxAdding = false; wxFound = null; put([...locs, { name: String(p.name).slice(0, 40), lat: +p.latitude.toFixed(4), lon: +p.longitude.toFixed(4), ...(p.admin1 ? { region: String(p.admin1).slice(0, 60) } : {}) }]); } },
      [p.name, p.admin1, p.country_code].filter(Boolean).join(", ")))) : el("small.muted", {}, wxWhy === "builder.wx.slowDown" ? Kit.t("builder.wx.slowDown") : wxWhy ? Kit.t("builder.wx.unreachable") : Kit.t("builder.wx.noPlace")));
    setTimeout(() => { const i = document.querySelector(".bld-wxq"); if (i && !i.value) i.focus(); }, 0);
    return out;
  }

  // ---------- a "Picture & values" card (stage 2, mockup the design notes) ----------
  // what each device sends (the Manager's device list: names and the value when it was read)
  const attrsOf = (id) => { const D = M.devices && M.devices(); const d = ((D && D.devices) || []).find((x) => x.id === id); return (d && d.attrs) || {}; };
  // not values to show: what a device can do (its lists of modes and speeds, how many buttons), colour settings
  const SKIP_AT = /^(supported|numberOf|colorMode|colorName|hue$|saturation$|RGB|lastCodeName|codeLength|maxCodes|lockCodes|trackData|DeviceWatch|healthStatus)/;
  const spotPlain = (at) => String(at || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (x) => x.toUpperCase());
  let spotFrom = null;   // the device whose values are listed to tick (builder only)
  function spotEditor(c, o, set) {
    const out = [], isG = o.pic === "garage";
    out.push(row(Kit.t("builder.f.picture"), seg([["pic", Kit.t("builder.spot.aPicture")], ["garage", Kit.t("builder.spot.garageDoors")]], isG ? "garage" : "pic", (v) => {
      if (v === "garage") { set("pic", "garage"); if (!Array.isArray(o.doors) || !o.doors.length) set("doors", [{}]); } else { delete o.doors; set("pic", null); }
    })));
    if (!isG) out.push(row("", iconPick(o.pic, (v) => set("pic", v))));
    if (isG) {
      const doors = Array.isArray(o.doors) ? o.doors : (o.doors = [{}]);
      out.push(row(Kit.t("builder.garage.doors"), seg([["1", "1"], ["2", "2"], ["3", "3"]], String(doors.length), (v) => { while (doors.length < +v) doors.push({}); doors.length = +v; set("doors", doors); })));
      doors.forEach((dr, k) => out.push(el("div.bld-gitem", {}, el("b", {}, doors.length > 1 ? Kit.t(k === 0 ? "builder.garage.doorLeft" : k === doors.length - 1 ? "builder.garage.doorRight" : "builder.garage.doorMiddle", { n: k + 1 }) : Kit.t("builder.garage.theDoor")),
        row(Kit.t("builder.spot.buttonOpener"), devSelect(dr.id ?? null, (v) => { if (v) dr.id = v; else delete dr.id; set("doors", doors); }, Kit.t("builder.garage.pickOpener"), GARAGE_FIRST)),
        tipRow(Kit.t("builder.f.name"), Kit.t("builder.spot.doorNameTip"),
          el("input", { type: "text", maxlength: "30", value: dr.label || "", placeholder: dr.id ? devName(dr.id) : Kit.t("builder.spot.openerNamePh"), onchange: (e) => { const v = e.target.value.trim(); if (v) dr.label = v; else delete dr.label; set("doors", doors); } })),
        tipRow(Kit.t("builder.garage.contact"), Kit.t("builder.garage.contactTip"), devSelect(dr.contact ?? null, (v) => { if (v) dr.contact = v; else delete dr.contact; set("doors", doors); }, Kit.t("builder.garage.noContact"), CONTACT_FIRST)),
        row(Kit.t("builder.garage.takes"), el("input", { type: "number", min: "3", max: "60", step: "1", placeholder: "15", value: dr.travel ?? "",
          onchange: (e) => { const n = Math.round(+e.target.value); if (n >= 3 && n <= 60) dr.travel = n; else delete dr.travel; set("doors", doors); } }), el("span.muted", {}, Kit.t("builder.garage.sToOpen"))))));
      out.push(el("small.muted", {}, Kit.t("builder.spot.garageNote")));
    } else {
      // when the picture moves
      const anim = o.anim || "always";
      out.push(tipRow(Kit.t("builder.spot.moves"), Kit.t("builder.spot.movesTip"), el("select", { onchange: (e) => set("anim", e.target.value) }, optList([["always", Kit.t("builder.spot.always")], ["on", Kit.t("builder.spot.whileOn")],
        ["above", Kit.t("builder.spot.whileAbove")], ["is", Kit.t("builder.spot.whileIs")], ["never", Kit.t("builder.spot.never")]], anim))));
      if (["on", "above", "is"].includes(anim)) out.push(row(Kit.t("builder.f.device"), devSelect(o.aid ?? null, (v) => set("aid", v), Kit.t("builder.dev.pick"), anim === "on" ? { first: switches, firstLabel: Kit.t("builder.spot.switches"), restLabel: Kit.t("builder.dev.otherDevices") } : { all: true })));
      if (["above", "is"].includes(anim) && o.aid) {
        const names = Object.keys(attrsOf(o.aid));
        out.push(row(Kit.t("builder.spot.value"), el("select", { onchange: (e) => set("aat", e.target.value) }, optList(names.map((a) => [a, Kit.t("builder.f.readingNow", { name: a, value: attrsOf(o.aid)[a] || "—" })]), o.aat, Kit.t("builder.f.pick"))),
          anim === "above" ? el("input", { type: "number", step: "any", value: o.av ?? "", style: "width:90px", onchange: (e) => { const n = parseFloat(e.target.value); set("av", Number.isFinite(n) ? n : null); } })
            : el("input", { type: "text", maxlength: "40", value: o.av ?? "", placeholder: Kit.t("builder.spot.isPh"), style: "width:120px", onchange: (e) => set("av", e.target.value.trim() || null) })));
      }
      out.push(tipRow(Kit.t("builder.spot.tapDoes"), Kit.t("builder.spot.tapDoesTip"), seg([["none", Kit.t("builder.action.none")], ["toggle", Kit.t("builder.spot.switchDevice")], ["values", Kit.t("builder.spot.showValues")]], o.tapdo || (o.vpos === "tap" ? "values" : "none"), (v) => set("tapdo", v))));
      if (o.tapdo === "toggle") out.push(row(Kit.t("builder.piece.switch.name"), devSelect(o.tid ?? null, (v) => set("tid", v), Kit.t("builder.dev.pick"), { narrow: switches })));
    }
    out.push(tipRow(Kit.t("builder.spot.values"), Kit.t("builder.spot.valuesTip"), seg([["beside", Kit.t("builder.spot.beside")], ["below", Kit.t("builder.spot.below")], ["tap", Kit.t("builder.spot.onTap")], ["none", Kit.t("builder.f.none")]], o.vpos || "beside", (v) => set("vpos", v))));
    // the rows, in order: a value (rename it), a door, a switch / light (tap: on / off, hold: its wheel), a lock (slide to unlock)
    const rows = Array.isArray(o.rows) ? o.rows : (o.rows = []);
    out.push(el("b", {}, Kit.t("builder.spot.shownBeside")), ...listEditor(o, "rows", 12, "", () => ({}), (r) => [
      el("div.bld-row", {}, el("span.muted", {}, Kit.t("builder.spot.rowName", { device: devName(r.id), what: { switch: Kit.t("builder.spot.rowSwitch"), lock: Kit.t("builder.spot.rowLock"), door: Kit.t("builder.spot.rowDoor") }[r.as] || r.at || "" }))),
      el("input", { type: "text", maxlength: "30", value: r.label || "", placeholder: r.as && r.as !== "value" ? devName(r.id) : spotPlain(r.at), onchange: (e) => { const v = e.target.value.trim(); if (v) r.label = v; else delete r.label; set("rows", rows); } })]).slice(0, -1));
    const full = rows.length >= 12;
    if (full) out.push(el("small.muted", {}, Kit.t("builder.spot.max")));
    // add from a device: every value it sends, ticked = shown; or the device itself as a switch / lock / door
    out.push(tipRow(Kit.t("builder.spot.addFrom"), Kit.t("builder.spot.addFromTip"), devSelect(spotFrom, (v) => { spotFrom = v; changed(); }, Kit.t("builder.dev.pick"), { all: true })));
    if (spotFrom) {
      const A = attrsOf(spotFrom), has = (at) => rows.some((r) => r.id === spotFrom && (r.as || "value") === "value" && r.at === at);
      const as = (k) => rows.some((r) => r.id === spotFrom && r.as === k);
      const toggle = (on, add) => { if (on) { const i = rows.findIndex(add.find); if (i >= 0) rows.splice(i, 1); } else if (rows.length < 12) rows.push(add.row); set("rows", rows); };
      // (only what this device can be: a switch only if it switches, a lock if it's a lock, a door if it reports open /
      // closed; "As a value": its main reading — the first it has of temperature, power, humidity…)
      const d = devices().find((x) => x.id === spotFrom) || { id: spotFrom, kind: "", caps: [], label: "" };
      // (no values read yet: a temperature sensor's is still its temperature)
      const main = ["temperature", "power", "humidity", "illuminance", "energy", "airQualityIndex", "pm25", "co2", "battery", "level", "speed", "position"].find((a) => a in A)
        || (/temp|climate|freezer/.test(d.kind) ? "temperature" : "");
      const can = { switch: switches(d) || as("switch"), lock: d.kind === "lock" || d.caps.includes("Lock") || as("lock"),
        door: /door|window|contact|garage/.test(d.kind) || "contact" in A || "door" in A || as("door") };
      out.push(el("div.bld-row", {}, ...[["switch", Kit.t("builder.spot.asSwitch")], ["lock", Kit.t("builder.spot.asLock")], ["door", Kit.t("builder.spot.asDoor")]].filter(([k]) => can[k]).map(([k, l]) => el("button.ghost.small" + (as(k) ? ".cur" : ""), { type: "button", disabled: full && !as(k),
        title: { switch: Kit.t("builder.spot.asSwitchTip"), lock: Kit.t("builder.spot.asLockTip"), door: Kit.t("builder.spot.asDoorTip") }[k],
        onclick: () => toggle(as(k), { find: (r) => r.id === spotFrom && r.as === k, row: { id: spotFrom, as: k } }) }, (as(k) ? "✓ " : "+ ") + l)),
        main ? el("button.ghost.small" + (has(main) ? ".cur" : ""), { type: "button", disabled: full && !has(main), title: Kit.t("builder.spot.asValueTip", { what: spotPlain(main).toLowerCase() }),
          onclick: () => toggle(has(main), { find: (r) => r.id === spotFrom && (r.as || "value") === "value" && r.at === main, row: { id: spotFrom, as: "value", at: main } }) }, (has(main) ? "✓ " : "+ ") + Kit.t("builder.spot.asValue")) : null));
      // (its values: a checkbox dropdown — ticked = a row on the card)
      const names = Object.keys(A).filter((at) => !SKIP_AT.test(at) || has(at));
      out.push(names.length ? checkDrop(`spot:${c.i}:${spotFrom}`, Kit.t("builder.spot.valuesShown"), names.map((at) => [at, at, A[at] || "—"]), names.filter(has), (next) => {
        for (const at of names) {
          const want = next.includes(at), i = rows.findIndex((r) => r.id === spotFrom && (r.as || "value") === "value" && r.at === at);
          if (!want && i >= 0) rows.splice(i, 1);
          else if (want && i < 0 && rows.length < 12) rows.push({ id: spotFrom, as: "value", at });
        }
        set("rows", rows);
      }, { disabled: (at) => full && !has(at), noneText: Kit.t("builder.spot.noneTick"), foot: full ? Kit.t("builder.spot.maxRows") : null })
        : el("small.muted", {}, Kit.t("builder.spot.noValues")));
    }
    return out;
  }

  // a list of items on a card (scene buttons, bins): each with its own rows, ▲ ▼ ✕, and "+ Add"
  function listEditor(o, key, max, addLabel, fresh, rowsOf) {
    const items = Array.isArray(o[key]) ? o[key] : (o[key] = []);
    return [
      ...items.map((it, n) => el("div.bld-gitem", {}, ...rowsOf(it).filter(Boolean),
        el("div.bld-row", {},
          el("button.ghost.small", { type: "button", disabled: n === 0, onclick: () => { items.splice(n - 1, 0, items.splice(n, 1)[0]); changed(); } }, "▲"),
          el("button.ghost.small", { type: "button", disabled: n === items.length - 1, onclick: () => { items.splice(n + 1, 0, items.splice(n, 1)[0]); changed(); } }, "▼"),
          el("button.ghost.small.bad", { type: "button", onclick: () => { items.splice(n, 1); changed(); } }, Kit.t("builder.pal.remove"))))),
      items.length < max ? el("button.ghost.small", { type: "button", onclick: () => { items.push(fresh()); changed(); } }, addLabel) : el("small.muted", {}, Kit.t("builder.list.max", { n: max }))];
  }

  // the devices on a "Devices" card: each with its icon and name (or the device's own), in order
  function groupEditor(c, set) {
    const o = c.o, items = Array.isArray(o.items) ? o.items : (o.items = []);
    const put = () => set("items", items);
    const rows = items.map((it, n) => el("div.bld-gitem", {},
      el("div.bld-row", {}, devSelect(it.id ?? null, (v) => { if (v) { it.id = v; put(); } }),
        el("button.ghost.small", { type: "button", disabled: n === 0, "aria-label": Kit.t("builder.wx.up"), onclick: () => { items.splice(n - 1, 0, items.splice(n, 1)[0]); put(); } }, "▲"),
        el("button.ghost.small", { type: "button", disabled: n === items.length - 1, "aria-label": Kit.t("builder.wx.down"), onclick: () => { items.splice(n + 1, 0, items.splice(n, 1)[0]); put(); } }, "▼"),
        el("button.ghost.small", { type: "button", "aria-label": Kit.t("builder.pal.remove"), onclick: () => { items.splice(n, 1); put(); } }, "✕")),
      el("div.bld-row", {}, iconPick(it.icon, (v) => { if (v) it.icon = v; else delete it.icon; put(); }),
        el("input", { type: "text", value: it.title || "", maxlength: "40", placeholder: devName(it.id) || Kit.t("builder.f.name"), onchange: (e) => { const v = e.target.value.trim(); if (v) it.title = v; else delete it.title; put(); } })),
      (() => {   // this device's own press-and-hold wheel
        const list = it.wheel || (it.wheel = []), key = `gw-${c.i}-${n}`;
        const d = el("details.bld-gwheel", { open: st.open.has(key) }, el("summary", {}, list.length ? Kit.t("builder.wheel.holdWheelN", { n: list.length }) : Kit.t("builder.wheel.holdWheel")),
          wheelEditor(it.id, list, () => { if (list.length) it.wheel = list; else delete it.wheel; put(); }, it.icon));
        d.addEventListener("toggle", () => { if (d.open) st.open.add(key); else st.open.delete(key); });
        if (!list.length) delete it.wheel;
        return d;
      })()));
    let pick = null;
    return [
      ...rows,
      items.length < 12 ? el("div.bld-row", {}, devSelect(null, (v) => { pick = v; }, Kit.t("builder.group.addDevice")),
        el("button.ghost.small", { type: "button", onclick: () => { if (!pick) return toast(Kit.t("builder.text.pickDevFirst"), true); items.push({ id: pick }); put(); } }, Kit.t("builder.group.add"))) : el("small.muted", {}, Kit.t("builder.group.max")),
      row(Kit.t("builder.look.title"), seg([["list", Kit.t("builder.todo.list")], ["tiles", Kit.t("builder.roomdevs.tiles")]], o.look || "list", (v) => set("look", v === "list" ? null : v))),
      el("small.muted", {}, Kit.t("builder.group.note")),
    ];
  }

  function camSelect(cur, pick) {
    return el("select", { onchange: (e) => pick(e.target.value) }, el("option", { value: "", selected: !cur }, Kit.t("builder.f.pick")),
      st.cams.length ? el("optgroup", { label: Kit.t("builder.cam.cameras") }, st.cams.map((x) => el("option", { value: String(x.id), selected: String(cur) === String(x.id) }, x.name))) : null,
      (st.ctx.views || []).length ? el("optgroup", { label: Kit.t("builder.cam.views") }, st.ctx.views.map((v) => el("option", { value: v.id, selected: cur === v.id }, v.name))) : null);
  }

  function actionEditor(c, k, label) {
    const a = c[k] || { do: "none" };
    const put = (patch) => {
      const next = { ...a, ...patch };
      if (next.do === "none") delete c[k]; else c[k] = next;
      refreshItem(c); changed();
    };
    const kids = [el("select", { onchange: (e) => put({ do: e.target.value }) }, optList(ACTIONS, a.do))];
    // (only what can do it: a lock to lock, something that switches (or, to switch, a garage door) to switch or turn on /
    // off — a garage door controller has no on / off — a device with commands to send one)
    const fit = ["lock", "unlock"].includes(a.do) ? { only: (d) => d.kind === "lock" } : a.do === "cmd" ? { narrow: (d) => (rawDev(d.id).cmds || []).length > 0 }
      : a.do === "toggle" ? { narrow: (d) => switches(d) || isGarage(d) } : { narrow: switches };
    if (DEV_ACTIONS.includes(a.do)) kids.push(devSelect(a.id ?? null, (v) => put({ id: v }), Kit.t("builder.dev.pick"), fit));
    if (a.do === "cmd") {
      // (the picked device's own commands — a lock that locks can unlock too; not known: the usual ones)
      const own = a.id ? rawDev(a.id).cmds || [] : [], cmds = own.length ? [...own, ...(own.includes("lock") ? ["unlock"] : [])] : COMMANDS;
      kids.push(el("select", { onchange: (e) => put({ c: e.target.value }) }, optList([...cmds, ...(a.c && !cmds.includes(a.c) ? [a.c] : [])].map((x) => [x, x]), a.c, a.id ? Kit.t("builder.act.command") : Kit.t("builder.f.pickDeviceFirst"))));
      kids.push(el("input", { type: "text", value: a.v ?? "", maxlength: "60", placeholder: Kit.t("builder.act.valuePh"), onchange: (e) => { const v = e.target.value.trim(); put({ v: v === "" ? undefined : /^-?\d+(\.\d+)?$/.test(v) ? +v : v }); } }));
    }
    if (a.do === "room") kids.push(el("select", { onchange: (e) => put({ room: e.target.value }) }, optList(st.ctx.rooms.map((r) => [r.id, r.name]), a.room, Kit.t("builder.room.pick"))));
    if (a.do === "page") kids.push(el("select", { onchange: (e) => put({ page: e.target.value }) }, optList([["home", Kit.t("builder.act.pageHome")], ["cameras", Kit.t("builder.cam.cameras")], ["music", Kit.t("builder.act.pageMusic")]], a.page, Kit.t("builder.f.pick"))));
    if (a.do === "camera") kids.push(camSelect(a.cam, (v) => put({ cam: v })));
    const tip = { tap: Kit.t("builder.act.tapTip"), hold: Kit.t("builder.act.holdTip"), dbl: Kit.t("builder.act.dblTip") }[k];
    return el("div.bld-act", tip ? { title: tip } : {}, el("span.bld-l", {}, label), ...kids);
  }

  function rulesEditor(c, k) {
    const list = c[k] || [];
    const save = () => { if (list.length) c[k] = list; else { delete c[k]; if (k === "hi") delete c.hic; } refreshItem(c); changed(); };
    const rows = list.map((r, n) => el("div.bld-rule", {},
      devSelect(r.id ?? null, (v) => { r.id = v; save(); }, Kit.t("builder.dev.pick"), { all: true }),
      el("select", { onchange: (e) => { r.at = e.target.value; save(); } }, optList(ATTRS.map((x) => [x, x]), r.at)),
      el("select", { onchange: (e) => { r.op = e.target.value; save(); } }, optList(OPS, r.op)),
      el("input", { type: "text", value: r.v ?? "", maxlength: "60", placeholder: Kit.t("builder.rules.valuePh"), onchange: (e) => { const v = e.target.value.trim(); r.v = /^-?\d+(\.\d+)?$/.test(v) && r.op !== "eq" && r.op !== "ne" ? +v : v; save(); } }),
      el("button.ghost.small", { type: "button", "aria-label": Kit.t("builder.pal.remove"), onclick: () => { list.splice(n, 1); save(); } }, "✕")));
    return el("div.bld-rules", {}, ...rows,
      list.length < 4 ? el("button.ghost.small", { type: "button", onclick: () => { list.push({ id: null, at: "switch", op: "eq", v: "on" }); c[k] = list; changed(); } }, list.length ? Kit.t("builder.rules.and") : Kit.t("builder.rules.add")) : null,
      list.length > 1 ? el("small.muted", {}, Kit.t("builder.rules.all")) : null);
  }

  // the measured panel (its newest device with a benchmark) or null
  const benchOf = (ctx = st && st.ctx) => M.benchOf(ctx && ctx.perf);
  // a card's share: [ms (or share of the room when not measured), live video tiles]
  // (ctx: the panel — {perf, managed, views}; the open editor's, or Panels → Status's for a panel's map: v2.5.0)
  function cardCost(c, k, ctx = st.ctx) {
    const cams = (id) => { const v = (ctx.views || []).find((x) => x.id === id); return v ? Math.max(1, Math.min(4, v.cameras || 1)) : 1; };
    c = { ...c, o: c.o || {} };
    let pts = k.card, tiles = 0;
    if (LIVE_T.has(c.t)) pts += k.live;
    if (["calendar", "weather", "thermostat"].includes(c.t)) pts += 2 * k.card;
    if (/^art:/.test(c.o.icon || "") || ["garage", "energy", "fan"].includes(c.t)) pts += k.art;
    if (c.t === "photos") pts += 2 * k.css;
    if (/^card:/.test(c.t)) pts += 8 * k.card;   // (its own sealed frame)
    if (c.t === "camera" && c.o.view !== "icon") { if (c.o.view === "still") pts += 2 * k.card; else tiles = cams(c.o.cam); }
    if (c.t === "roomcams") { if (c.o.view === "still") pts += 4 * k.card; else tiles = 2; }
    pts += tiles * k.tile;
    return [pts, tiles];
  }
  // the whole page: its cards + the heaviest weather effect allowed on it, against the room; live tiles against the limit
  function pageCost(g, ctx = st.ctx) {
    const b = benchOf(ctx);
    const c = b ? b.costs || {} : {}, budget = b ? b.budgetMs : 1;
    const k = b ? { card: c.card || 0, live: (c.upd || 0) * LIVE_RATE, art: c.art || 0, css: c.css || 0, tile: c.tile != null ? c.tile : DEF_SHARE.tile * budget, full: c.full || 0 }
      : DEF_SHARE;
    const fxs = b ? b.fxMs : DEF_FX;
    const set = (ctx.managed && ctx.managed["effects.maxLoad"]) || 0, lvl = set || (b ? b.best : 4) || 4;
    const parts = g.cards.map((x) => [x, ...cardCost(x, k, ctx)]);
    const cards = parts.reduce((n, x) => n + x[1], 0), tiles = parts.reduce((n, x) => n + x[2], 0), fx = fxs[lvl] || 0;
    const liveMax = b && !b.noVideo ? b.liveMax : DEF_LIVEMAX;
    const pct = Math.round(100 * Math.max((cards + fx) / budget, liveMax ? tiles / liveMax : tiles ? 2 : 0));
    const top = parts.filter((x) => x[1] > 0).sort((a, b2) => b2[1] - a[1]).slice(0, 3);
    return { b, pct, cards, fx, fxs, lvl, set, tiles, liveMax, budget, top };
  }

  // ---------- notes under the panel: warnings, the load meter, the benchmark ----------
  function notes() {
    const box = $(".bld-notes"); if (!box || !st) return;
    const w = warnings(st.g), m = pageCost(st.g), pct = m.pct;
    const L = ["", Kit.t("builder.fx.minimal"), Kit.t("builder.fx.light"), Kit.t("builder.fx.medium"), Kit.t("builder.fx.heavy")], name = st.ctx.panel.name;
    const share = (x) => Kit.t("builder.meter.pct", { n: Math.round((100 * x) / m.budget) });
    const tips = [];
    if (pct > 80) {
      if (m.tiles > m.liveMax) tips.push(m.liveMax ? Kit.t("builder.meter.tooManyCams", { n: m.tiles, max: m.liveMax }) : Kit.t("builder.meter.tooManyCamsNone", { n: m.tiles }));
      if (m.lvl > 1 && m.cards + m.fx > m.budget && m.fx > m.fxs[m.lvl - 1]) tips.push(Kit.t("builder.meter.fxTip", { level: L[m.lvl], share: share(m.fx), lower: L[m.lvl - 1], frees: share(m.fx - m.fxs[m.lvl - 1]) }));
      if (m.top.length) tips.push(Kit.t("builder.meter.heaviest", { list: m.top.map(([c, p]) => Kit.t("builder.meter.heavyItem", { name: c.o.title || tdef(c.t)[1], share: share(p) })).join(", ") }));
    }
    // the benchmark box stays the same element while the page is edited (a run being watched carries on)
    if (!st.benchEl || st.benchFor !== (m.b && m.b.at)) {
      st.benchFor = m.b && m.b.at;
      st.benchEl = M.benchBox(st.ctx.panel, st.ctx.perf, async () => {
        const d = await api(`/api/manage/panels/${encodeURIComponent(st.ctx.panel.id)}`).catch(() => null);
        if (st && d && Array.isArray(d.perf)) { st.ctx.perf = d.perf; st.benchEl = null; notes(); }
      }, { compact: true, mirror: true, onProgress: (p) => {
        // the run plays on the canvas: the panel page here shows what the panel shows (design.js → Bench.mirror)
        const f = $(".bld-frame"), sc = $(".bld-screen");
        if (f && f.contentWindow) f.contentWindow.postMessage({ t: "bench", p: p && p.state === "running" ? p : null }, location.origin);
        if (sc) sc.classList.toggle("benching", !!(p && p.state === "running"));
      } });
    }
    box.replaceChildren(...[
      el("div.bld-meter" + (m.b ? "" : ".est"), {},
        el("span", {}, m.b ? Kit.t("builder.meter.load", { panel: name, n: pct }) : Kit.t("builder.meter.loadEst", { n: pct })),
        el("div.bar", {}, el("i", { style: `width:${Math.min(100, pct)}%;background:${pct > 100 ? "var(--bad)" : pct > 80 ? "var(--warn)" : "var(--ok)"}` })),
        el("small.muted", {}, Kit.t(m.tiles ? (m.set ? "builder.meter.sumTiles" : "builder.meter.sumAutoTiles") : (m.set ? "builder.meter.sum" : "builder.meter.sumAuto"),
          { cards: Kit.t("builder.meter.cards", { n: st.g.cards.length }), level: L[m.lvl], tiles: Kit.t("builder.meter.tiles", { n: m.tiles }), max: m.liveMax })),
        ...tips.map((t) => el("div.bld-tip", {}, t))),
      st.benchEl,
      ...w.map(([i, text]) => el("div.bld-warn", { onclick: () => select(i) }, "⚠ ", text)),
      w.length ? el("small.muted", {}, Kit.t("builder.warn.allowed")) : null].filter(Boolean));
  }

  // one save at a time: a double click on Save mustn't send the same change twice (the second would meet our own
  // first as "someone else saved meanwhile")
  async function saveIt() {
    if (!st || st.saving) return;
    st.saving = true;
    const btn = $(".bld-save"); if (btn) btn.disabled = true;
    try {
      // (another login signed in on this browser meanwhile — another tab: the layout isn't saved as that login)
      const now = await api("/api/manage/login").catch(() => null), mine = ((M.me() || {}).user || "").toLowerCase();
      if (now && now.in && mine && String(now.user || "").toLowerCase() !== mine) {
        toast(Kit.t("builder.save.otherUser", { user: now.user, me: (M.me() || {}).user }), true);
        return;
      }
      if (!st) return;
      dirtyNow();   // (the draft as it is this moment — an edit typed just before Save included)
      await saveIt1();
    } finally {
      if (st) st.saving = false;
      const b = $(".bld-save"); if (b) b.disabled = false;
    }
  }
  async function saveIt1() {
    const g = st.g;
    for (const c of g.cards) {
      const stop = (msg) => { select(c.i); toast(msg, true); return true; };
      if (["device", "value", "lock", "garage", "player", "fan"].includes(c.t) && !c.o.id && stop(Kit.t("builder.save.needDevice"))) return;
      if (c.t === "value" && !c.o.at && stop(Kit.t("builder.save.needReading"))) return;
      if (((c.t === "room" && !c.o.room) || (c.t === "camera" && !c.o.cam) || (c.t === "picture" && !c.o.pic)) && stop(Kit.t("builder.save.needRoomCamPic"))) return;
      for (const k of ["tap", "hold", "dbl"]) {
        const a = c[k];
        if (a && ((DEV_ACTIONS.includes(a.do) && !a.id) || (a.do === "cmd" && !a.c) || (a.do === "room" && !a.room) || (a.do === "page" && !a.page) || (a.do === "camera" && !a.cam))
          && stop(Kit.t({ room: { tap: "builder.save.todoTapRoom", hold: "builder.save.todoHoldRoom", dbl: "builder.save.todoDblRoom" }, page: { tap: "builder.save.todoTapPage", hold: "builder.save.todoHoldPage", dbl: "builder.save.todoDblPage" }, camera: { tap: "builder.save.todoTapCamera", hold: "builder.save.todoHoldCamera", dbl: "builder.save.todoDblCamera" }, command: { tap: "builder.save.todoTapCommand", hold: "builder.save.todoHoldCommand", dbl: "builder.save.todoDblCommand" }, device: { tap: "builder.save.todoTapDevice", hold: "builder.save.todoHoldDevice", dbl: "builder.save.todoDblDevice" } }[a.do === "room" ? "room" : a.do === "page" ? "page" : a.do === "camera" ? "camera" : a.do === "cmd" && a.id ? "command" : "device"][k]))) return;
        const bad = a && cmdValue(a); if (bad && stop(Kit.t({ tap: "builder.save.badTap", hold: "builder.save.badHold", dbl: "builder.save.badDbl" }[k], { problem: bad }))) return;
      }
      if (["show", "hi"].some((k) => (c[k] || []).some((r) => !r.id)) && stop(Kit.t("builder.save.ruleDevice"))) return;
      if (c.t === "scenes") {
        const n = (c.o.items || []).findIndex((it) => !it.a || it.a.do === "none" || (DEV_ACTIONS.includes(it.a.do) && !it.a.id) || (it.a.do === "cmd" && !it.a.c)
          || (it.a.do === "room" && !it.a.room) || (it.a.do === "page" && !it.a.page) || (it.a.do === "camera" && !it.a.cam));
        if (n >= 0 && stop(Kit.t("builder.save.sceneTodo", { n: n + 1 }))) return;
        const b = (c.o.items || []).map((it) => it.a && cmdValue(it.a)).findIndex(Boolean);
        if (b >= 0 && stop(Kit.t("builder.save.sceneBad", { n: b + 1, problem: cmdValue(c.o.items[b].a) }))) return;
      }
      if (c.t === "spot") {   // a Picture & values card: its garage doors, when it moves, what a tap switches
        const o = c.o;
        if (o.pic === "garage") {
          const n = (o.doors || []).findIndex((d) => !d.id);
          if (n >= 0 && stop((o.doors || []).length > 1 ? Kit.t("builder.save.doorNOpener", { n: n + 1 }) : Kit.t("builder.save.doorOpener"))) return;
        } else {
          const anim = o.anim || "always";
          if (["on", "above", "is"].includes(anim) && !o.aid && stop(Kit.t("builder.save.movesDevice"))) return;
          if (["above", "is"].includes(anim) && !o.aat && stop(Kit.t("builder.save.movesValue"))) return;
          if (anim === "above" && !Number.isFinite(o.av) && stop(Kit.t("builder.save.movesNumber"))) return;
          if (anim === "is" && !(typeof o.av === "string" && o.av.trim()) && stop(Kit.t("builder.save.movesIs"))) return;
          if (o.tapdo === "toggle" && !o.tid && stop(Kit.t("builder.save.tapSwitch"))) return;
        }
      }
      if (c.t === "blank") {   // a blank card: each piece has what it needs (the piece is shown, inside the card)
        const k = (c.o.parts || []).findIndex((q) => pieceProblem(q));
        if (k >= 0) { const q = c.o.parts[k]; select(c.i); enterInner(c, k); toast(Kit.t("builder.save.blankPiece", { piece: pieceName(q), n: k + 1, problem: pieceProblem(q) }), true); return; }
      }
      if (c.t === "weather" && (c.o.locs || []).length > 6 && stop(Kit.t("builder.plain.weather"))) return;
      if (c.t === "text" && (c.o.text || "").length > 400 && stop(Kit.t("builder.save.textLong"))) return;
      for (const [w, list] of [[0, c.o.wheel], ...(c.o.items || []).map((it, n) => [n + 1, it.wheel])]) {
        const b = (list || []).map(cmdValue).find(Boolean);
        if (b && stop(w ? Kit.t("builder.save.devWheel", { n: w, problem: b }) : Kit.t("builder.save.wheel", { problem: b }))) return;
      }
      if (c.t === "countdown" && !c.o.date && stop(Kit.t("builder.plain.countdown"))) return;
      const u = userCard(c.t);
      if (u && u.slots.some((sl) => sl.required && !((c.o || {}).bind || {})[sl.key]) && stop(Kit.t("builder.save.ucardDevices", { name: u.name }))) return;
    }
    // (Home: only a layout that differs from what was opened / saved — one left as it was switches no panel to "Your own")
    let set = norm(g) !== st.orig.get("home") ? { homeLayout: "custom", homeGrid: g } : {};
    if (st.ctx.room) {   // every room's and / or rooms' own grids that changed ("" = that room uses every room's again)
      // (only the layout on screen when it was changed: one opened and left as it is — every room's starting layout
      // too — switches no room to it)
      // (and only what differs from what it was: a change taken back with Undo is none)
      if (st.touched || st.edited.has(st.key)) { st.grids[st.key] = st.grids[st.key] === "" && !st.touched ? "" : g; st.edited.add(st.key); }
      for (const k of [...st.edited]) if (!roomDiffers(k)) st.edited.delete(k);
      const changedKeys = [...st.edited];
      set = changedKeys.length ? { roomGrids: Object.fromEntries(changedKeys.map((k) => [k, st.grids[k] || ""])) } : {};
      if (changedKeys.includes("*")) set.roomLayout = "custom";
      const own = changedKeys.filter((k) => k !== "*");
      if (own.length) set.roomLayouts = Object.fromEntries(own.map((k) => [k, st.grids[k] ? "custom" : ""]));
    }
    if (st.look.theme !== st.look0.theme) set["look.theme"] = st.look.theme;
    if (st.look.background !== st.look0.background) set["look.background"] = st.look.background;
    for (const k of ["dockStyle", "dockLabels", "dockAutoHide"]) if (st.look[k] !== st.look0[k]) set[k] = st.look[k];
    if (!Object.keys(set).length) { st.dirty = false; window.removeEventListener("beforeunload", unsavedGuard); dirtyNow(); return toast(Kit.t("builder.save.nothing")); }
    // (v2.5.0: the layouts as they were loaded go along — saved only if nobody saved them meanwhile, another tab or person)
    const base = st.ctx.latest ? st.ctx.managed : null, was = {};
    if (base) for (const k of ["homeGrid", "roomGrids"]) if (k in set) was[k] = base[k] ?? null;
    let ok = await st.ctx.save(set, null, Object.keys(was).length ? { was } : {});
    if (ok === "changed") {
      if (!st) return;
      // (only the two buttons act: Esc, a click outside or another page = back to editing, nothing lost)
      const pick = await Kit.choose({ title: Kit.t("builder.conflict.title"), text: Kit.t("builder.conflict.text"),
        buttons: [["theirs", Kit.t("builder.conflict.theirs")], ["mine", Kit.t("builder.conflict.mine"), "pri"]] });
      if (!st) return;
      if (pick == null) return toast(Kit.t("builder.conflict.cancelled"), true);
      if (pick === "mine") {
        ok = await st.ctx.save(set);
      } else {
        const ctx = { ...st.ctx, managed: st.ctx.latest() }, id = st.ctx.panel.id;
        const fresh = await api(`/api/manage/panels/${encodeURIComponent(id)}`).catch(() => null);
        if (fresh && fresh.managed) ctx.managed = fresh.managed;
        teardown(); await M.openBuilder(ctx);
        return toast(Kit.t("builder.conflict.loaded"));
      }
    }
    if (ok === true) {
      if (!st) return;
      dropDraft();   // (saved: no draft to offer later)
      // (a save of the look only, while another tab had saved the layout: the server's layout is shown again below)
      const now = st.ctx.latest ? st.ctx.latest() : null, lk = st.ctx.room ? ["roomGrids", "roomLayout", "roomLayouts"] : ["homeGrid", "homeLayout"];
      const theirs = !!(now && base) && lk.some((k) => !(k in set) && JSON.stringify(now[k] ?? null) !== JSON.stringify(base[k] ?? null));
      if (st.ctx.latest) st.ctx.managed = now;   // (what was saved is what the next save is checked against)
      // (what's saved is what the next change is compared with)
      if (st.ctx.room) for (const k of st.edited) { st.saved[k] = st.grids[k]; if (st.grids[k]) st.orig.set(k, norm(st.grids[k])); }
      else st.orig.set("home", norm(g));
      st.look0 = { ...st.look }; if (st.edited) st.edited.clear(); st.dirty = false; window.removeEventListener("beforeunload", unsavedGuard); dirtyNow();
      if (theirs) {
        const ctx = { ...st.ctx, managed: now }, focus = st.focus, ptab = st.ptab;
        teardown(); await M.openBuilder(ctx);
        if (st) { st.ptab = ptab; if (focus) setFocus(true); palette(); }
        toast(Kit.t("builder.conflict.savedOther"), true);
      }
    }
    else {   // (refused: the server's own words name its fields — say it plainly, and point at the card when we can)
      const t = document.getElementById("toast"), raw = t ? t.textContent : "", plain = plainError(raw);
      if (plain && plain !== raw) toast(plain, true);
    }
  }
  // a command's value the server would refuse (a button number, a volume); "" = fine
  function cmdValue(a) {
    if (!a || a.do !== "cmd") return "";
    if (a.c === "push" && !(Number.isInteger(a.v) && a.v >= 1 && a.v <= 20)) return Kit.t("builder.cmd.push");
    if (a.c === "setVolume" && !(Number.isInteger(a.v) && a.v >= 0 && a.v <= 100)) return Kit.t("builder.cmd.volume");
    return "";
  }
  // the server's refusal ("homeGrid: garage door: opener: a whole number 1..999999999") in plain words
  const PLAIN = [[/garage door: opener/, Kit.t("builder.plain.opener")],
    [/garage door: contact|door contact/, Kit.t("builder.plain.contact")], [/travel time/, Kit.t("builder.plain.travel")],
    [/moves when: device/, Kit.t("builder.plain.movesDevice")], [/moves when/, Kit.t("builder.plain.moves")],
    [/tap: which switch/, Kit.t("builder.plain.tapSwitch")], [/value: which reading|value: an attribute/, Kit.t("builder.plain.reading")],
    [/button number/, Kit.t("builder.plain.button")], [/volume/, Kit.t("builder.plain.volume")], [/scene button/, Kit.t("builder.plain.scene")],
    [/^a room$|room: which room/, Kit.t("builder.plain.room")], [/camera/, Kit.t("builder.plain.camera")], [/picture/, Kit.t("builder.plain.picture")],
    [/a rule/, Kit.t("builder.plain.rule")], [/at most \d+ cards/, Kit.t("builder.add.max")], [/weather: up to/, Kit.t("builder.plain.weather")],
    [/place/, Kit.t("builder.plain.place")], [/countdown/, Kit.t("builder.plain.countdown")], [/photos/, Kit.t("builder.plain.photos")],
    [/the wheel|wheel action/, Kit.t("builder.plain.wheel")], [/whole number 1\.\.999999999|^device/, Kit.t("builder.plain.device")],
    [/screen/, Kit.t("builder.plain.screen")], [/x: |y: |width|height/, Kit.t("builder.plain.offScreen")]];
  function plainError(raw) {
    // (the server says "Home layout: …" / "Room layouts: …" — before, "homeGrid: …" / "roomGrids: …")
    const m = /^(home ?layout|home ?grid|room ?grids?(?:\.[\w-]+)?|room ?layouts?)\s*:\s*(.*)$/i.exec(String(raw || "").trim());
    if (!m) return raw;
    if (/^blank card: /.test(m[2])) return Kit.t("builder.err.blankCard", { reason: m[2].slice(12) });   // (already in plain words)
    const hit = PLAIN.find(([re]) => re.test(m[2]));
    return Kit.t("builder.err.notSavedReason", { reason: hit ? hit[1] : m[2] });
  }
  M.plainLayoutError = plainError;   // (for panels.js: the same words wherever a layout is refused)
  // (v2.5.0, Panels → Status and Setup: a panel's map and its load without opening the builder)
  // layoutPresets(): the built-in Home layouts as cards on the 12 × 8 grid {key: [name, cards]}
  // (M.layoutPresets: layoutmaps.js)
  // pageLoad(grid, {perf, managed, views}) → {pct, measured, cards} — the builder's load meter for a page that isn't open
  M.pageLoad = (g, ctx) => {
    if (!g || !Array.isArray(g.cards)) return null;
    const m = pageCost(g, { perf: ctx.perf || [], managed: ctx.managed || {}, views: ctx.views || [] });
    return { pct: m.pct, measured: !!m.b, cards: g.cards.length };
  };
})();
