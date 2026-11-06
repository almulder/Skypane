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
    ["weather", Kit.t("builder.type.weather.name"), "sun", Kit.t("builder.type.weather.desc"), 4, 3, {}, { src: "auto" }, "home"],
    ["calendar", Kit.t("builder.type.calendar.name"), "calendar", Kit.t("builder.type.calendar.desc"), 4, 5, {}, { days: 3 }, "home"],
    ["thermostat", Kit.t("builder.type.thermostat.name"), "thermo", Kit.t("builder.type.thermostat.desc"), 4, 4, {}, {}, "home"],
    ["locks", Kit.t("builder.type.locks.name"), "lock", Kit.t("builder.type.locks.desc"), 4, 2, {}, {}, "home"],
    ["openings", Kit.t("builder.type.openings.name"), "door", Kit.t("builder.type.openings.desc"), 4, 1, {}, {}, "home"],
    ["people", Kit.t("builder.type.people.name"), "user", Kit.t("builder.type.people.desc"), 4, 1, {}, {}, "home"],
    ["temps", Kit.t("builder.type.temps.name"), "thermo", Kit.t("builder.type.temps.desc"), 4, 1, {}, {}, "home"],
    ["guest", Kit.t("builder.type.guest.name"), "wifi", Kit.t("builder.type.guest.desc"), 4, 2, {}, {}, "home"],
    ["alerts", Kit.t("builder.type.alerts.name"), "shield", Kit.t("builder.type.alerts.desc"), 4, 1, {}, {}, "home"],
    ["blank", Kit.t("builder.type.blank.name"), "plus", Kit.t("builder.type.blank.desc"), 4, 3, {}, { fr: 1, parts: [] }, "dev"],
    // (v3.0.4) one Devices card for every device — Device, Devices, Value, Button, Lock, Fan and Scene buttons below are
    // no longer offered (OLD_T); kept so a card of theirs still opens (service/devices_card.py moved the saved ones over)
    ["devices", Kit.t("builder.type.devices.name"), "grid", Kit.t("builder.type.devices.desc"), 4, 3, {}, { look: "list", items: [] }, "dev"],
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
    // (v3.0.5) a new System card watches these (the owner ticks and orders them: sysPicker); one from before shows its four
    ["status", Kit.t("builder.type.status.name"), "server", Kit.t("builder.type.status.desc"), 3, 2, {}, { rows: ["hubitat", "bridge", "mqtt", "cameras", "unifi", "weather", "panel"] }, "home"],
    ["photos", Kit.t("builder.type.photos.name"), "image", Kit.t("builder.type.photos.desc"), 4, 3, { a: 0, r: 18 }, { pics: [] }, "media"],
    ["batteries", Kit.t("builder.type.batteries.name"), "batteryLow", Kit.t("builder.type.batteries.desc"), 4, 3, {}, {}, "home"],
    ["power", Kit.t("builder.type.power.name"), "bolt", Kit.t("builder.type.power.desc"), 4, 3, {}, {}, "home"],
    ["scenes", Kit.t("builder.type.scenes.name"), "sparkles", Kit.t("builder.type.scenes.desc"), 6, 2, {}, { items: [] }, "home"],
    ["modes", Kit.t("builder.type.modes.name"), "moon", Kit.t("builder.type.modes.desc"), 6, 2, {}, {}, "home"],
    ["safety", Kit.t("builder.type.safety.name"), "shield", Kit.t("builder.type.safety.desc"), 4, 1, {}, {}, "home"],
    ["notices", Kit.t("builder.type.notices.name"), "bell", Kit.t("builder.type.notices.desc"), 4, 3, {}, {}, "home"],
    // (v3.0.4) Bins / Trash and Countdown & timers; Bin day, Countdown and Timers below are no longer offered (OLD_T),
    // kept so a card of theirs still opens (service/time_cards.py moved the saved ones over)
    ["trash", Kit.t("builder.type.trash.name"), "trashBin", Kit.t("builder.type.trash.desc"), 5, 3, {}, { rem: { when: "before", at: "19:30" }, alarm: "21:00", items: [] }, "home"],
    ["timers", Kit.t("builder.type.timers.name"), "hourglass", Kit.t("builder.type.timers.desc"), 4, 3, {}, { items: [] }, "home"],
    ["countdown", Kit.t("builder.type.countdown.name"), "hourglass", Kit.t("builder.type.countdown.desc"), 3, 2, {}, {}, "home"],
    ["bins", Kit.t("builder.type.bins.name"), "trashBin", Kit.t("builder.type.bins.desc"), 4, 1, {}, { items: [] }, "home"],
    ["timer", Kit.t("builder.type.timer.name"), "clock", Kit.t("builder.type.timer.desc"), 4, 3, {}, {}, "home"],
    // (v3.0.4) the UniFi cards (the panel's unifi.js; hidden on the panels while UniFi isn't connected)
    ["netwan", Kit.t("builder.type.netwan.name"), "router", Kit.t("builder.type.netwan.desc"), 8, 4, {}, {}, "home"],
    ["netmap", Kit.t("builder.type.netmap.name"), "router", Kit.t("builder.type.netmap.desc"), 8, 5, {}, {}, "home"],
    ["netstrip", Kit.t("builder.type.netstrip.name"), "chartBar", Kit.t("builder.type.netstrip.desc"), 12, 1, {}, {}, "home"],
    ["netchips", Kit.t("builder.type.netchips.name"), "users", Kit.t("builder.type.netchips.desc"), 8, 1, {}, {}, "home"],
    ["netdevs", Kit.t("builder.type.netdevs.name"), "list", Kit.t("builder.type.netdevs.desc"), 4, 4, {}, {}, "home"],
    ["netpoe", Kit.t("builder.type.netpoe.name"), "bolt", Kit.t("builder.type.netpoe.desc"), 4, 4, {}, {}, "home"],
    ["netclients", Kit.t("builder.type.netclients.name"), "users", Kit.t("builder.type.netclients.desc"), 8, 5, {}, {}, "home"],
    ["netlog", Kit.t("builder.type.netlog.name"), "clock", Kit.t("builder.type.netlog.desc"), 4, 5, {}, {}, "home"],
    ["netvals", Kit.t("builder.type.netvals.name"), "gauge", Kit.t("builder.type.netvals.desc"), 4, 2, {}, {}, "home"],
    // (v3.0.5) UPS / battery backup (NUT or a UniFi UPS), Doorbell (Protect), Activity feed (unifi-v2.html)
    ["netups", Kit.t("builder.type.netups.name"), "batteryFull", Kit.t("builder.type.netups.desc"), 4, 3, {}, {}, "home"],
    ["netbell", Kit.t("builder.type.netbell.name"), "doorbell", Kit.t("builder.type.netbell.desc"), 4, 4, {}, {}, "home"],
    ["netfeed", Kit.t("builder.type.netfeed.name"), "clock", Kit.t("builder.type.netfeed.desc"), 4, 5, {}, {}, "home"],
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
    ["people", Kit.t("builder.cat.people"), "user"], ["time", Kit.t("builder.cat.time"), "clock"], ["media", Kit.t("builder.cat.media"), "film"], ["info", Kit.t("builder.cat.info"), "edit"], ["network", Kit.t("builder.cat.network"), "router"], ["yours", Kit.t("builder.cat.yours"), "grid"]];
  const CAT_OF = { roomhead: ["room"], roomdevs: ["room", "devices"], roomopen: ["room", "security"], roomcams: ["room", "security", "media"], roomthings: ["room", "devices"],
    timer: ["time"], clock: ["time"], scenes: ["devices", "time"], modes: ["security", "time"], safety: ["security"], notices: ["info", "security"],
    countdown: ["time"], bins: ["time"], trash: ["time"], timers: ["time"], alarm: ["security"], lock: ["security", "devices"], garage: ["security", "devices"], spot: ["devices", "security", "info"], status: ["info"], photos: ["media", "info"], player: ["media", "devices"], fan: ["climate", "devices"], energy: ["info", "climate"], todo: ["time"], notes: ["time", "info"],
    batteries: ["info", "devices"], power: ["info", "devices"], weather: ["climate", "time"], calendar: ["time"], thermostat: ["climate"], locks: ["security"], openings: ["security"], people: ["people"],
    temps: ["climate"], guest: ["info"], alerts: ["security", "info"], devices: ["devices", "climate", "security"], device: ["devices"], group: ["devices"], value: ["devices", "climate", "info"],
    netwan: ["network"], netmap: ["network"], netstrip: ["network", "info"], netchips: ["network"], netdevs: ["network"], netpoe: ["network"], netclients: ["network"], netlog: ["network"], netvals: ["network", "info"],
    netups: ["network", "info"], netbell: ["network", "security"], netfeed: ["network", "info"],
    button: ["devices"], room: ["devices"], text: ["info"], blank: ["devices", "security", "climate", "info"], camera: ["security", "media"], picture: ["media"] };
  const T = Object.fromEntries(TYPES.map((t) => [t[0], t]));
  // (v3.0.5: and the Devices and Text cards — their items are a blank card's pieces now; service/blank_card.py moved the
  // saved ones over)
  // (v3.0.5: and the Alert note — the Notifications card's Compact style now; service/notices_card.py moved them over)
  // (v3.0.5: and the Picture card — one picture in the Slide show / Picture card now; service/picture_card.py moved them)
  const OLD_T = new Set(["device", "group", "value", "button", "lock", "fan", "scenes", "bins", "countdown", "timer", "devices", "text", "alerts", "picture"]);
  // a card type: a built-in one, or "card:<id>" — one people made (Manager → Cards)
  const userCard = (type) => (/^card:/.test(type) && st ? (st.cards || []).find((c) => c.id === type.slice(5)) : null);
  // "tpl:<id>": a card saved from this editor (Save card) — dropped, it's a copy of that card
  // the fine grid, toFine, the card helper and the built-in layouts: layoutmaps.js (v2.8.0 — shared with the
  // Panels maps and the phone, which never loads this file)
  const { FC, FR, F, SNAP, toFine: fine0, card, CLOCK, HEAD, PRESETS, ROOM_PRESETS } = window.LayoutMaps;
  // (v3.0.4) and a blank card's pieces from the old 24 × 24 grid to thousandths of the card, as it's opened (bkFree)
  const toFine = (g) => { const f = fine0(g); return f && Array.isArray(f.cards) && f.cards.some(bkOld) ? { ...f, cards: f.cards.map(bkFree) } : f; };
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
  const LIVE_T = new Set(["devices", "device", "group", "value", "thermostat", "people", "energy", "player", "timers", "status", "power", "batteries", "fan", "alarm",
    "lock", "garage", "modes", "scenes", "roomdevs", "roomhead", "roomopen", "roomthings", "locks", "openings", "temps", "todo", "notes", "clock", "notices",
    "safety", "countdown", "alerts", "blank", "trash", "netwan", "netmap", "netstrip", "netchips", "netdevs", "netpoe", "netclients", "netlog", "netvals", "netups", "netbell", "netfeed"]);
  const presets = () => (st && st.ctx.room ? ROOM_PRESETS : PRESETS);
  const EDGES = ["bottom", "top", "left", "right"];   // (v3.0.4) the room bar's edges (app.js dockAtNow)


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
  // (v3.0.4: an air purifier too — the panel sends it fanOn / off, grid.js run())
  const switches = (d) => d.caps.includes("Switch") || (rawDev(d.id).cmds || []).includes("on") || /purifier/.test(d.kind || "");
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
  const VIB_FIRST = { first: (d) => /vibration|accel|tilt|multi/i.test(`${d.label} ${d.type} ${d.kind}`), firstLabel: Kit.t("builder.dev.vibFirst") };
  // (v3.0.4) a garage set's doors (a Picture & values card, a blank card's piece): how many (Single to Quad), then each
  // door's opener, name, contact, vibration / tilt sensor, width and its open and close times; save() after each change
  function garageDoorRows(doors, save, named) {
    const out = [], secs = (dr, k, ph, unit) => el("span", {}, el("input", { type: "number", min: "3", max: "60", step: "1", placeholder: ph, value: dr[k] ?? "",
      onchange: (e) => { const n = Math.round(+e.target.value); if (n >= 3 && n <= 60) dr[k] = n; else delete dr[k]; save(); } }), el("span.muted", {}, Kit.t(unit)));
    out.push(row(Kit.t("builder.garage.doors"), seg(["single", "double", "triple", "quad"].map((w, n) => [String(n + 1), Kit.t(`builder.garage.n.${w}`)]), String(doors.length),
      (v) => { while (doors.length < +v) doors.push({}); doors.length = +v; save(); })));
    doors.forEach((dr, k) => out.push(el("div.bld-gitem", {}, el("b", {}, doors.length > 1 ? Kit.t(k === 0 ? "builder.garage.doorLeft" : k === doors.length - 1 ? "builder.garage.doorRight" : "builder.garage.doorMiddle", { n: k + 1 }) : Kit.t("builder.garage.theDoor")),
      row(Kit.t(named ? "builder.spot.buttonOpener" : "builder.garage.opener"), devSelect(dr.id ?? null, (v) => { if (v) dr.id = v; else delete dr.id; save(); }, Kit.t("builder.garage.pickOpener"), GARAGE_FIRST)),
      named ? tipRow(Kit.t("builder.f.name"), Kit.t("builder.spot.doorNameTip"),
        el("input", { type: "text", maxlength: "30", value: dr.label || "", placeholder: dr.id ? devName(dr.id) : Kit.t("builder.spot.openerNamePh"), onchange: (e) => { const v = e.target.value.trim(); if (v) dr.label = v; else delete dr.label; save(); } })) : null,
      tipRow(Kit.t("builder.garage.contact"), Kit.t("builder.garage.contactTip"), devSelect(dr.contact ?? null, (v) => { if (v) dr.contact = v; else delete dr.contact; save(); }, Kit.t("builder.garage.noContact"), CONTACT_FIRST)),
      dr.contact != null ? tipRow(Kit.t("builder.garage.vib"), Kit.t("builder.garage.vibTip"), devSelect(dr.vib ?? null, (v) => { if (v) dr.vib = v; else delete dr.vib; save(); }, Kit.t("builder.garage.noVib"), VIB_FIRST)) : null,
      row(Kit.t("builder.garage.width"), seg([["1", Kit.t("builder.garage.single")], ["2", Kit.t("builder.garage.wide")]], dr.wide ? "2" : "1", (v) => { if (v === "2") dr.wide = true; else delete dr.wide; save(); })),
      tipRow(Kit.t("builder.garage.takes"), Kit.t("builder.garage.takesTip"), secs(dr, "travel", "15", "builder.garage.sToOpen"), secs(dr, "tclose", dr.travel ? String(dr.travel) : "15", "builder.garage.sToClose")))));
    if (doors.some((dr) => dr.vib != null)) out.push(el("small.muted", {}, Kit.t("builder.garage.vibNote")));
    return out;
  }

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
      dockLabels: typeof m.dockLabels === "boolean" ? m.dockLabels : dockStyle !== "rail", dockAutoHide: m.dockAutoHide === true,
      // (v3.0.4) its edge (dragged on the canvas, or the edge picker) and its rooms: which, in what order
      dockAt: EDGES.includes(m.dockAt) ? m.dockAt : "bottom", roomOrder: Array.isArray(m.roomOrder) ? [...m.roomOrder] : [],
      hiddenRooms: Object.fromEntries(Object.entries(m.hiddenRooms || {}).filter(([, v]) => v === true)) };
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
      return r;   // (v3.0.5: a remove's answer names its place in the Trash — the Undo)
    } catch {}
    return null;
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
  // (v3.0.3: nor the screen it's shown on — the Screen list only previews a size; it's saved along with a real change)
  const norm = (g) => JSON.stringify(g && typeof g === "object" && !Array.isArray(g) ? { ...g, scr: undefined } : g,
    (k, v) => (k === "wheel" && Array.isArray(v) && !v.length ? undefined : v));
  function remember() { const k = st.ctx.room ? st.key : "home"; if (!st.orig.has(k)) st.orig.set(k, norm(st.g)); }
  // a room key's layout now (the one on screen as edited) is not what it was ("" = every room's again: only if it had its own)
  const roomNow = (k) => (k === st.key && st.touched ? st.g : st.grids[k]);
  const roomDiffers = (k) => { const v = roomNow(k);
    return v === "" ? !!(st.saved[k] && Array.isArray(st.saved[k].cards)) : v != null && norm(v) !== st.orig.get(k); };
  const lookDiff = (k) => JSON.stringify(st.look[k]) !== JSON.stringify(st.look0[k]);   // (the rooms' order and hidden ones: lists)
  const lookChanged = () => Object.keys(st.look).some(lookDiff);
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
  // (v3.0.5) the shortcut's keys as this computer has them: ⌘Z / ⇧⌘Z on a Mac, Ctrl+Z / Ctrl+Y elsewhere (both work)
  const NAV = typeof navigator === "undefined" ? {} : navigator, MAC = /Mac|iPhone|iPad/.test((NAV.userAgentData && NAV.userAgentData.platform) || NAV.platform || NAV.userAgent || "");
  const KEY = { undo: MAC ? "⌘Z" : "Ctrl+Z", redo: MAC ? "⇧⌘Z" : "Ctrl+Y" };   // i18n-ok (key names)
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
    if (st.inner) { const ic = innerCard(); if (!ic) st.inner = null; else if (st.inner.sel != null && !(ic.o[ic.t === "devices" ? "items" : "parts"] || [])[st.inner.sel]) st.inner.sel = null; }
    st.touched = true;
    if (st.ctx.room) st.edited.add(st.key);
    dirtyNow();
    syncTop(); fit(); drawHandles(); side(); notes(); post(); histBtns();
  }
  // the ↶ ↷ buttons: greyed out when there's nothing to go back / forward to
  function histBtns() {
    if (!st) return;
    const h = histOf(), u = $(".bld-undo"), r = $(".bld-redo");
    if (u) { u.disabled = !h.undo.length; u.title = h.undo.length ? Kit.t("builder.hist.undoSteps", { n: h.undo.length, key: KEY.undo }) : Kit.t("builder.hist.undo", { key: KEY.undo }); }
    if (r) { r.disabled = !h.redo.length; r.title = h.redo.length ? Kit.t("builder.hist.redoSteps", { n: h.redo.length, key: KEY.redo }) : Kit.t("builder.hist.redo", { key: KEY.redo }); }
  }
  // the top bar's boxes follow an undo (overlap, join, spacing, screen)
  function syncTop() {
    const g = st.g, q = (s2) => document.querySelector(s2);
    setSw(q(".bld-ov .sw"), !!g.ov);
    setSw(q(".bld-join .sw"), !!g.join);
    if (q(".bld-gap select")) q(".bld-gap select").value = String(g.gap);
    if (q(".bld-edge select")) q(".bld-edge select").value = g.edge == null ? "" : String(g.edge);   // (v3.0.5)
    // (the screen: also back to a layout saved without one — drawn at 1280 × 800 then, fit(); a size not in the list added)
    const ss = q(".bld-scr select");
    if (ss) {
      const v = g.scr ? `${g.scr.w}x${g.scr.h}` : "1280x800";
      if (![...ss.options].some((o) => o.value === v)) ss.append(el("option", { value: v }, v.replace("x", " × ")));
      ss.value = v;
    }
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
      ib(".bld-undo", Kit.t("builder.hist.undoLabel"), "undo", () => undoRedo(true), Kit.t("builder.hist.undo", { key: KEY.undo })),
      ib(".bld-redo", Kit.t("builder.hist.redoLabel"), "redo", () => undoRedo(false), Kit.t("builder.hist.redo", { key: KEY.redo })),
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
    const hint = el("div.bk-hint", { role: "status" }, el("i"), Kit.t("builder.inner.hint"));
    const screen = el("div.bld-screen" + (st.mode === "try" ? ".trying" : ""), {}, frame, mask, over, hint, dockBoxEl(), dockProxyEl(), fsbar, el("div.bld-wait", {}, Kit.t("builder.frame.loading")));
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
        line(Kit.t("builder.page.spacing"), sel([0, 4, 6, 10, 14, 20, 28].map((x) => [x, Kit.t("builder.page.px", { n: x })]), g.gap, (v) => { st.g.gap = +v; changed(false); }, Kit.t("builder.page.spacingAria")), ".bld-gap"),
        // (v3.0.5) the Edge margin around the cards (TESTING-NOTES "Cards can't reach the screen's edges"): as before, or the
        // same space on every side — 0 lets a card reach the screen's edge; the panel shows the same
        line(Kit.t("builder.page.edge"), sel([["", Kit.t("builder.page.edgeAsBefore")], ...[0, 8, 16, 24].map((x) => [x, Kit.t("builder.page.px", { n: x })])], g.edge ?? "", (v) => { if (v === "") delete st.g.edge; else st.g.edge = +v; changed(false); }, Kit.t("builder.page.edgeAria")), ".bld-edge"),
        // (v3.0.5) a builder setting (this browser): double-click edits a card where it is, unless zoom is wanted
        check(".bld-zoom", Kit.t("builder.page.zoom"), zoomOn(), (e) => { setZoom(e.target.checked); toast(Kit.t(e.target.checked ? "builder.page.zoomOn" : "builder.page.zoomOff")); }, Kit.t("builder.page.zoomTip"))),
      sec2(Kit.t("builder.look.title"), themes.length ? line(Kit.t("builder.look.theme"), sel(themes, st.look.theme, (v) => setLook({ theme: v }), Kit.t("builder.look.theme")), ".bld-theme") : null, line(Kit.t("builder.look.background"), bgSel),
        // (v3.0.5) this page's own background pictures (rotating, on the slide-show engine; none: the panel's background)
        check(".bld-pbg", Kit.t("builder.page.ownBg"), !!g.bg, (e) => { if (e.target.checked) st.g.bg = { pics: [] }; else delete st.g.bg; changed(false); side(); }, Kit.t("builder.page.ownBgTip")),
        g.bg && Kit.showEditor ? Kit.showEditor({ o: g.bg, which: "bg", uploads: (st.pics || []).filter((u) => u.style === "background"), set: (n) => { st.g.bg = { ...n, ...(Number.isInteger(g.bg.dim) ? { dim: g.bg.dim } : {}) }; changed(false); side(); } }) : null,
        // (v3.0.5) the veil over this page's own pictures, as the panel's (0–70 %, 35 % when not set — app.js applyBg)
        g.bg ? ((dim) => { const out = el("span.muted", {}, `${dim} %`);   // i18n-ok (a unit)
          return line(Kit.t("builder.page.bgDim"), el("span.bld-pbg-dim", {}, el("input", { type: "range", min: "0", max: "70", step: "5", value: String(dim), "aria-label": Kit.t("builder.page.bgDim"),
            oninput: (e) => { out.textContent = `${e.target.value} %`; },   // i18n-ok (a unit)
            onchange: (e) => { st.g.bg = { ...st.g.bg, dim: Math.max(0, Math.min(70, +e.target.value || 0)) }; changed(false); } }), out), ".bld-pbgdim"); })(Number.isInteger(g.bg.dim) ? Math.max(0, Math.min(70, g.bg.dim)) : 35) : null),
      // (v3.0.4) the room bar: everything about it in one place (as on Panels → Room bar)
      dockSec(),
      el("div.bld-empty", {}, el("span.ei", {}, Kit.icon("cards", 18)), el("b", {}, Kit.t("builder.empty.title")),
        el("p", {}, Kit.t("builder.empty.text")),
        el("p", {}, Kit.t("builder.empty.try", { key: KEY.undo }))));
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
      ...(st.bgs.length ? [el("optgroup", { label: Kit.t("builder.look.yourPictures") }, st.bgs.map((u) => el("option", { value: "up:" + u.id, selected: st.look.background === "up:" + u.id }, u.name)))] : []));
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
  // the room bar's section shows the look as it is now (a style picked resets its names; a drag; Undo) — drawn again,
  // the focus kept where it was
  function dockBoxes() {
    const old = $(".bld-dsec"); if (!old) return;
    const fk = document.activeElement && old.contains(document.activeElement) ? document.activeElement.dataset.fk : null;
    const now = dockSec(); old.replaceWith(now);
    const f = fk && now.querySelector(`[data-fk="${fk}"]`); if (f) f.focus({ preventScroll: true });
  }
  // (v3.0.4) the room bar's settings: its edge (a 4-way picker — the arrow keys, or a click on a side; the same as
  // dragging it on the canvas), its style, names, auto-hide, and its rooms (which, in what order: ▲ ▼ and a switch)
  const EDGE_KEYS = { ArrowUp: "top", ArrowDown: "bottom", ArrowLeft: "left", ArrowRight: "right" };
  const edgeName = (k) => Kit.t(`panels.look.${k}`);
  const fkd = (n, fk) => { n.dataset.fk = fk; return n; };
  function dockSec() {
    const L = st.look, line = (label, ctl, cls = "") => el(`label.bld-f.bld-pl${cls}`, {}, el("span", {}, label), ctl);
    const check = (cls, label, on, onchange, tip, fk) => el(`div.bld-f.bld-pl.bld-pck${cls}`, { title: tip || "" }, el("span", {}, label), fkd(Kit.sw(on, onchange, label), fk));
    const pick = el("div.bld-edges", { role: "radiogroup", "aria-label": Kit.t("builder.dock.edgeAria"),
      onkeydown: (e) => { const k = EDGE_KEYS[e.key]; if (!k) return; e.preventDefault(); setEdge(k); const n = $(`.bld-edges .e-${k}`); if (n) n.focus(); } },
    EDGES.map((k) => el(`button.e-${k}`, { type: "button", role: "radio", "aria-checked": String(L.dockAt === k), tabindex: L.dockAt === k ? "0" : "-1",
      "aria-label": edgeName(k), title: edgeName(k), "data-fk": `edge:${k}`, onclick: () => setEdge(k) })), el("span.c", { "aria-hidden": "true" }));
    const rooms = dockRooms(), shown = rooms.filter((r) => !L.hiddenRooms[r.id]).length;
    const move = (i, d) => { const ids = rooms.map((r) => r.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; setLook({ roomOrder: ids }); };
    const hide = (id, on) => setLook({ hiddenRooms: on ? Object.fromEntries(Object.entries(L.hiddenRooms).filter(([k]) => k !== id)) : { ...L.hiddenRooms, [id]: true } });
    return el("div.bld-psec.bld-dsec", {}, el("h4", {}, Kit.t("builder.dock.title")),
      el("div.bld-f.bld-pl.bld-dedge", {}, el("span", {}, Kit.t("builder.dock.edge"), el("small", {}, edgeName(L.dockAt))), pick),
      el("p.bld-dnote", {}, Kit.t("builder.dock.edgeHint")),
      line(Kit.t("builder.dock.style"), sel((M.DOCK_STYLES || []).map(([k, x]) => [k, x]), L.dockStyle, (v) => setLook({ dockStyle: v, dockLabels: v !== "rail" }), Kit.t("builder.dock.styleAria")), ".bld-dock"),
      check(".bld-dlab", Kit.t("builder.dock.names"), L.dockLabels, (v) => setLook({ dockLabels: v }), Kit.t("builder.dock.namesTip"), "names"),
      check(".bld-dauto", Kit.t("builder.dock.autoHide"), L.dockAutoHide, (v) => setLook({ dockAutoHide: v }), Kit.t("builder.dock.autoHideTip"), "auto"),
      rooms.length ? el("div.bld-drooms", { role: "list", "aria-label": Kit.t("builder.dock.rooms") },
        el("div.bld-dgh", {}, el("b", {}, Kit.t("builder.dock.rooms")), el("small", {}, Kit.t("builder.dock.shownN", { n: shown, all: rooms.length }))),
        rooms.map((r, i) => el("div.bld-droom" + (L.hiddenRooms[r.id] ? ".off" : ""), { role: "listitem" }, el("span.nm", {}, r.name),
          el("button.bld-dmv", { type: "button", disabled: i === 0, "aria-label": Kit.t("panels.order.up", { name: r.name }), "data-fk": `up:${r.id}`, onclick: () => move(i, -1) }, Kit.icon("chevU", 14)),
          el("button.bld-dmv", { type: "button", disabled: i === rooms.length - 1, "aria-label": Kit.t("panels.order.down", { name: r.name }), "data-fk": `down:${r.id}`, onclick: () => move(i, 1) }, Kit.icon("chevD", 14)),
          fkd(Kit.sw(!L.hiddenRooms[r.id], (on) => hide(r.id, on), Kit.t("panels.shownHere", { name: r.name })), `eye:${r.id}`))),
        // (v3.0.5) switched off = off the bar only: a Rooms card, a button's "open a room" and Hubitat still open it
        el("p.bld-dnote", {}, Kit.t("builder.dock.offNote"))) : null);
  }
  // the panel's rooms in the bar's order (as Panels → Room bar lists them)
  function dockRooms() {
    const order = st.look.roomOrder, rank = (r, i) => { const k = order.indexOf(r.id); return k < 0 ? order.length + i : k; };
    return (st.ctx.rooms || []).map((r, i) => [r, rank(r, i)]).sort((a, b) => a[1] - b[1]).map(([r]) => r);
  }
  function setEdge(k) {
    if (!st || !EDGES.includes(k) || k === st.look.dockAt) return;
    setLook({ dockAt: k });
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
    else if (m.t === "netPos" && typeof m.i === "string" && m.pos && typeof m.pos === "object") netPos(m.i, m.pos);
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
    const pk = ic && ic.t === "devices" ? "items" : "parts";   // (v3.0.4: a Devices card's item, as a blank card's piece)
    if (ic) return { ...st.g, cards: st.g.cards.map((c) => (c === ic ? { ...c, o: { ...c.o, [pk]: (c.o[pk] || []).map((p, k) => (k === pd.n ? { ...p, ...pd.r } : p)) } } : c)) };
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
        try { const ro = new d.win.ResizeObserver(() => { if (st) { barPlace(); dockProxy(); } }); ro.observe(d.doc.getElementById("dock")); ro.observe(d.rail); st.dockObs = { doc: d.doc, ro }; } catch { st.dockObs = null; }
      }
    }
    px.hidden = !r;
    const bx = $(".bld-dockbox");
    if (bx) bx.hidden = !r;
    if (!r) return;
    const sb = screen.getBoundingClientRect();
    if (bx) {   // (the whole bar, its grip at the side facing the page)
      const dr = d.doc.getElementById("dock").getBoundingClientRect();
      Object.assign(bx.style, { left: `${d.fr.left - sb.left - screen.clientLeft + dr.left * d.k}px`, top: `${d.fr.top - sb.top - screen.clientTop + dr.top * d.k}px`,
        width: `${dr.width * d.k}px`, height: `${dr.height * d.k}px` });
      bx.dataset.at = st.bar && st.bar.moved ? st.bar.at : st.look.dockAt;
    }
    Object.assign(px.style, { left: `${d.fr.left - sb.left - screen.clientLeft + r.left * d.k}px`, top: `${d.fr.top - sb.top - screen.clientTop + r.top * d.k}px`,
      width: `${r.width * d.k}px`, height: `${r.height * d.k}px` });
  }

  // ---------- (v3.0.4) moving the room bar: only here, never on the wall ----------
  // A box over the whole bar: pointed at, its grip dots show; dragged (by the dots or the bar itself — not its rooms,
  // they scroll), the panel's real bar follows the pointer, on the nearest edge as it goes (along the top / bottom,
  // down a side), the page reflowing around it; let go, it settles on that edge (saved with the layout; Undo). Esc
  // cancels. The grip takes the arrow keys too, as the edge picker does.
  function dockBoxEl() {
    const bx = el("div.bld-dockbox", { hidden: true },
      el("button.bld-dgrip", { type: "button", title: Kit.t("builder.dock.gripTip"), "aria-label": Kit.t("builder.dock.gripAria"),
        onkeydown: (e) => { const k = EDGE_KEYS[e.key]; if (!k) return; e.preventDefault(); e.stopPropagation(); setEdge(k); } }, el("span.gi")));
    bx.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !st || st.mode !== "arrange" || st.bar) return;
      const d = dockInfo(); if (!d) return;
      e.preventDefault(); e.stopPropagation();
      const r = d.doc.getElementById("dock").getBoundingClientRect(), p = framePt(e, d);
      st.bar = { id: e.pointerId, x: e.clientX, y: e.clientY, from: st.look.dockAt, at: st.look.dockAt, moved: false, tx: 0, ty: 0, p,
        off: { x: p.x - (r.left + r.width / 2), y: p.y - (r.top + r.height / 2) } };
      try { bx.setPointerCapture(e.pointerId); } catch {}
    });
    bx.addEventListener("pointermove", (e) => {
      const b = st && st.bar; if (!b || e.pointerId !== b.id) return;
      if (!b.moved) { if (Math.hypot(e.clientX - b.x, e.clientY - b.y) <= 6) return; b.moved = true; $(".bld-screen").classList.add("bar-moving"); }
      const d = dockInfo(); if (!d) return;
      b.p = framePt(e, d);
      const ne = nearEdge(b.p, b.at, d);
      if (ne !== b.at) {   // (the live bar to that edge — not saved yet; turned the other way: held by its middle)
        if ((ne === "left" || ne === "right") !== (b.at === "left" || b.at === "right")) b.off = { x: 0, y: 0 };
        b.at = ne; postLook({ ...st.look, dockAt: ne });
      }
      barPlace(); dockProxy();
    });
    bx.addEventListener("pointerup", (e) => { if (st && st.bar && e.pointerId === st.bar.id) barEnd(false); });
    bx.addEventListener("pointercancel", (e) => { if (st && st.bar && e.pointerId === st.bar.id) barEnd(true); });
    return bx;
  }
  const framePt = (e, d) => ({ x: (e.clientX - d.fr.left) / d.k, y: (e.clientY - d.fr.top) / d.k });
  // the edge nearest the pointer (a little past halfway before it switches: no flicker on the diagonal)
  function nearEdge(p, cur, d) {
    const W = d.frame.offsetWidth || 1, H = d.frame.offsetHeight || 1;
    const by = { left: p.x / W, right: 1 - p.x / W, top: p.y / H, bottom: 1 - p.y / H };
    const best = EDGES.reduce((a, k) => (by[k] < by[a] ? k : a), cur);
    return by[best] < by[cur] - 0.03 ? best : cur;
  }
  // the real bar held under the pointer (style.translate — app.js dockSafe still measures where it sits), on screen
  function barPlace() {
    const b = st && st.bar, d = b && b.moved && dockInfo(); if (!d) return;
    const dk = d.doc.getElementById("dock"); if (!dk) return;
    const r = dk.getBoundingClientRect(), W = d.frame.offsetWidth, H = d.frame.offsetHeight;
    const l = r.left - b.tx, t = r.top - b.ty;   // (where it sits)
    b.tx = Math.round(Math.max(-l, Math.min(W - l - r.width, b.p.x - b.off.x - (l + r.width / 2))));
    b.ty = Math.round(Math.max(-t, Math.min(H - t - r.height, b.p.y - b.off.y - (t + r.height / 2))));
    const v = `${b.tx}px ${b.ty}px`; if (dk.style.translate !== v) dk.style.translate = v;   // i18n-ok (CSS)
  }
  // let go: it settles on its edge (one change; Undo takes it back) — Esc / cancelled: back where it was
  function barEnd(cancel) {
    const b = st && st.bar; if (!b) return;
    st.bar = null;
    $(".bld-screen").classList.remove("bar-moving");
    if (!b.moved) return;
    const d = dockInfo(), dk = d && d.doc.getElementById("dock");
    if (cancel || b.at === b.from) postLook(st.look); else setLook({ dockAt: b.at });
    if (dk) {
      dk.style.transition = "translate .32s cubic-bezier(.2, .8, .3, 1)"; dk.style.translate = "0px 0px";   // i18n-ok (CSS)
      setTimeout(() => { dk.style.transition = ""; dk.style.translate = ""; if (st) dockProxy(); }, 340);
    }
    if (cancel && b.at !== b.from) toast(Kit.t("builder.dock.cancelled"));
    dockProxy();
  }
  const postLook = (look) => { const f = $(".bld-frame"); if (f && f.contentWindow) f.contentWindow.postMessage({ t: "look", look: { ...look } }, location.origin); };

  // ---------- the handles: one box per card, at the panel's cells ----------
  function place() {
    const over = $(".bld-over"); if (!over) return;
    const r = st.rect, g = st.g, k = st.k || 1;
    // (v3.0.4) "Arrange the parts" of a Network map: the screen lets the drag through to the panel's card (unifi.js)
    if (st.netArr && (st.sel !== st.netArr || st.mode !== "arrange")) netArrange(null);
    over.classList.toggle("bld-pass", !!st.netArr);
    dockProxy();
    over.hidden = !r || !r.home;
    if (!r || !r.home) return;
    const off = st.off || { x: 0, y: 0 };   // (full screen: the picture is centred)
    st.cell = { cw: (r.w * k) / g.cols, ch: (r.h * k) / g.rows, m: g.sp ? 0 : (g.gap * k) / 2 };
    const ic = innerCard(), screen = $(".bld-screen"), frame = $(".bld-frame");
    if (st.inner && !ic) st.inner = null;
    if (screen) screen.classList.toggle("inner", !!ic);
    over.classList.toggle("bld-inner", !!ic);
    // (v3.0.4: a blank card's pieces are edited where the card is — no zoom; v3.0.5: unless the builder setting "Double-
    // click zooms into a card" is on)
    const here = !!ic && ic.t === "blank" && !zoomOn();
    over.classList.toggle("bld-inplace", here); if (screen) screen.classList.toggle("inplace", here);
    if (here) {
      const { cw, ch } = st.cell;
      st.inner.box = { x0: r.x + (ic.x * r.w) / g.cols, y0: r.y + (ic.y * r.h) / g.rows, w0: (ic.w * r.w) / g.cols, h0: (ic.h * r.h) / g.rows };
      Object.assign(over.style, { left: `${off.x + r.x * k + ic.x * cw}px`, top: `${off.y + r.y * k + ic.y * ch}px`, width: `${ic.w * cw}px`, height: `${ic.h * ch}px` });
      if (!st.pdrag) drawInner();
      return;
    }
    if (ic && screen && frame) {   // editing inside a Devices card: the panel zoomed so the card fills the screen
      const cw = r.w / g.cols, ch = r.h / g.rows, x0 = r.x + ic.x * cw, y0 = r.y + ic.y * ch, w0 = ic.w * cw, h0 = ic.h * ch;
      st.inner.box = { x0, y0, w0, h0 };   // (v3.0.4: a Devices card's items are measured against it — dvMeasure)
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
  // (v3.0.5) a label's real width at the name tag's font (manage.css .bld-name: 11 px, the page's font)
  let labelCtx = null;
  function labelW(text) {
    try {
      if (!labelCtx) { labelCtx = document.createElement("canvas").getContext("2d"); labelCtx.font = `11px ${getComputedStyle(document.body).fontFamily}`; }   // i18n-ok (a CSS font)
      return labelCtx.measureText(text).width;
    } catch { return text.length * 6.6; }   // (no canvas: a wide guess, so it's never cut)
  }
  function item(c) {
    const t = tdef(c.t);
    const np = c.t === "blank" ? (c.o.parts || []).length : 0;
    // (v3.0.5) a card's label is never cut off: the longest one that fits the card's width, measured at the label's own
    // font (the whole of it in its tooltip); none fits — the icon alone. A blank card: its name, "Blank card", how many
    // pieces, "double-click to change it"; any other: its title, else its type
    const own = c.o.title || (c.o.id ? devName(c.o.id) : "");
    let opts = own && own !== t[1] ? [own, t[1]] : [t[1]];
    if (c.t === "blank") {
      const nm = c.o.title || "", full = np ? Kit.t("builder.canvas.blankPieces", { type: t[1], n: np }) : Kit.t("builder.canvas.blankEmpty", { type: t[1] });
      const short = np ? Kit.t("builder.canvas.nPieces", { n: np }) : Kit.t("builder.canvas.empty");
      opts = [nm ? `${nm} · ${full}` : full, nm ? `${nm} · ${t[1]} · ${short}` : `${t[1]} · ${short}`, nm ? `${nm} · ${short}` : short, short];
    }
    // (the label's room: the card's width less its 6 px inset each side, the 8 px padding each side, the 14 px icon,
    // its 4 px gap and the border)
    const room = Math.max(0, c.w * (st.cell ? st.cell.cw : 6) - 2 * (st.cell ? st.cell.m : 0) - 12 - 16 - 18 - 2);
    const tip = opts[0], label = opts.find((x) => labelW(x) <= room) ?? "";
    const box = el("div.bld-item", { "data-id": c.i, style: boxStyle(c) },
      el("div.bld-card" + (st.sel === c.i ? ".sel" : "") + (c.show ? ".cond" : ""), {},
        el("span.bld-name", { title: tip }, iconEl(/^(art|up):/.test(c.o.icon || "") ? t[2] : c.o.icon || t[2], 14), label)));
    // (v3.0.5) the move dots at the card's top-left corner (shown on mouse-over): drag them to move the card — the corner
    // itself would resize it
    const grip = el("button.bld-grip", { type: "button", tabindex: "-1", title: Kit.t("builder.canvas.gripTip"), "aria-label": Kit.t("builder.canvas.gripAria", { name: tip }) }, gripDots());
    grip.addEventListener("pointerdown", (e) => { e.stopPropagation(); startDrag(e, c.i, "move", box); });
    box.append(grip);
    // (v3.0.4: no marks — a press on any edge or corner resizes from there, the cursor says which; anywhere else moves it)
    const zoneAt = (e) => { const r = box.getBoundingClientRect(); return DE().zone(e.clientX - r.left, e.clientY - r.top, r.width, r.height); };
    box.addEventListener("pointermove", (e) => { if (!st.drag) { const z = zoneAt(e); box.firstElementChild.style.cursor = z === "move" ? "" : DE().CURSOR[z]; } });
    box.addEventListener("pointerdown", (e) => startDrag(e, c.i, zoneAt(e)));
    return box;
  }
  const trashHit = (e) => { const t = $(".bld-trash"), r = t && t.getBoundingClientRect(); return !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  // a card resized from its left or top edge (or a corner with one): that edge follows the pointer (the grid's steps with
  // Snap to grid), the opposite one stays; the right / bottom edges alone go through settle (its guides)
  function edgeRect(z, fx, fy, fw, fh, free) {
    const g = st.g, grid = st.snap && !free, q = (v) => (grid ? Math.round(v / SNAP) * SNAP : Math.round(v)), min = grid ? SNAP : 1;
    let L = Math.round(fx), T = Math.round(fy), R = Math.round(fx + fw), B = Math.round(fy + fh);
    if (z.includes("w")) L = cl(q(fx), 0, R - Math.min(min, R));
    if (z.includes("e")) R = cl(q(fx + fw), L + Math.min(min, g.cols - L), g.cols);
    if (z.includes("n")) T = cl(q(fy), 0, B - Math.min(min, B));
    if (z.includes("s")) B = cl(q(fy + fh), T + Math.min(min, g.rows - T), g.rows);
    guides([]);
    return { x: L, y: T, w: R - L, h: B - T };
  }
  // the card's X / Y / W / H boxes follow a drag (cells of the panel's grid)
  const cardSync = (r) => document.querySelectorAll(".bld-side .bld-cxywh input[data-k]").forEach((x) => { if (r[x.dataset.k] != null) x.value = String(r[x.dataset.k]); });
  // pick a card up (mode "move"), or resize it from an edge or a corner ("n", "se"…): it follows the pointer; the panel
  // shows where it would land; let go = it lands there
  // (v3.0.5: node — the card's handle; the move dots pass it, the press being on them)
  function startDrag(e, id, mode, node = e.currentTarget) {
    if (e.button !== 0 || st.mode !== "arrange" || !st.cell) return;
    const c = st.g.cards.find((x) => x.i === id); if (!c) return;
    e.preventDefault(); e.stopPropagation();
    // (the focus leaves the side panel: Delete then means this card, not the box last typed in)
    if (document.activeElement && document.activeElement !== document.body && !document.activeElement.closest(".bld-stage")) document.activeElement.blur();
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
      const { cw, ch } = st.cell, z = mode === "move" ? "" : mode;
      let fx = z ? s0.x : s0.x + dx / cw, fy = z ? s0.y : s0.y + dy / ch, fw = s0.w, fh = s0.h;
      if (z.includes("e")) fw = Math.max(1, s0.w + dx / cw);
      if (z.includes("s")) fh = Math.max(1, s0.h + dy / ch);
      if (z.includes("w")) { fx = Math.min(s0.x + dx / cw, s0.x + s0.w - 1); fw = s0.w + s0.x - fx; }
      if (z.includes("n")) { fy = Math.min(s0.y + dy / ch, s0.y + s0.h - 1); fh = s0.h + s0.y - fy; }
      d.rect = !z ? settle(id, "move", fx, fy, fw, fh, ev.altKey) : /^(e|s|se)$/.test(z) ? settle(id, "resize", fx, fy, fw, fh, ev.altKey) : edgeRect(z, fx, fy, fw, fh, ev.altKey);
      cardSync(d.rect);
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
        const now = Date.now(), two = (c.t === "blank" || c.t === "devices") && st.lastClick && st.lastClick.id === id && now - st.lastClick.at < 500;
        st.lastClick = two ? null : { id, at: now };
        if (two) return enterInner(c);
        drawHandles(); return;
      }
      if (d.mode === "move" && ev.type === "pointerup" && trashHit(ev)) { remove(c); return; }
      if (ev.type !== "pointerup" || !fits(d.rect, id)) {
        if (ev.type === "pointerup") toast(Kit.t("builder.drag.overlapMove"), true);
        drawHandles(); post(); return;
      }
      Object.assign(c, d.rect); changed(false); drawHandles(); cardSync(c);
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
    const type = b.dataset.type, [w, h] = newSize(type);
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
    undoToast(Kit.t("builder.hist.cardGone", { name: c.o.title || tdef(c.t)[1] }));   // (v3.0.5: Undo right in the message)
  }
  // (v3.0.5) a delete says so, with Undo in the message (the same step as ↶ / Ctrl+Z). The step it means is the one made
  // just now: anything changed since (another change, an undo, another page) — its Undo does nothing and says so
  function undoToast(text) {
    const t = document.getElementById("toast"); if (!t) return toast(text);
    const h = histOf(), at = st.base, n = h.undo.length;
    const undo = () => { t.className = ""; if (histOf() !== h || st.base !== at || h.undo.length !== n) return toast(Kit.t("builder.hist.stale")); undoRedo(true); };
    t.replaceChildren(el("span", {}, text), el("button.rr-undo", { type: "button", onclick: undo }, Kit.icon("undo", 14), Kit.t("builder.hist.undoLabel")));
    t.className = "show rr";   // i18n-ok (class names)
    clearTimeout(st.undoT); st.undoT = setTimeout(() => { if (t.classList.contains("rr")) t.className = ""; }, 6000);
  }
  // where the last click was: Delete / Backspace / the arrows only act on the screen when it was on the screen (a
  // click in the side panel redraws it, and the focus falls back to the page — that's not "the screen has the focus")
  function onAnyDown(e) { if (st) st.downStage = !!(e.target.closest && e.target.closest(".bld-stage")); }
  const onScreen = (t) => !!st.downStage && (t === document.body || t === document.documentElement || !!(t.closest && t.closest(".bld-stage")));
  // Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z): undo / redo — not while typing in a box (that box's own undo then);
  // Delete / Backspace: remove the selected card — only while the screen has the focus, not a box or a button beside it
  function onKey(e) {
    if (st && st.bar && st.bar.moved && e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); return barEnd(true); }   // (moving the room bar)
    if (!st || document.querySelector(".dve-shade")) return;   // (v3.0.4: a pop-up open — devedit.js — has its own keys)
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
  // (v3.0.3) a newly added card starts small — half a single-device card (a valve: 3 × 1 → 24 × 8 fine cells),
  // (a few types a little bigger: NEW_START), so it always finds room; it's then grown as needed. A room's header strip
  // stays full width.
  // (A duplicate keeps the size of the card it copies; a saved card — tpl:… — and a card people made — card:… — keep
  // their own size: only plain new types start small.)
  const NEW_W = T.device[4] / 2, NEW_H = T.device[5] / 2;
  // (v3.0.3) a few types don't read at that size (the clock's time, a title with buttons, a hint of two lines): their own
  // small start — still small, just readable. In the old grid's cells, like the types' sizes (× 16 → fine cells).
  const NEW_START = { clock: [2, 1], status: [2, 1], spot: [2, 0.75], energy: [2, 0.75], locks: [2, 0.75],
    calendar: [2.5, 1], alerts: [2, 0.5], room: [1.5, 0.75] };
  const newSize = (type) => {
    const g = st.g;
    if (tplOf(type) || userCard(type) || tdef(type)[0] === "roomhead") return sizeOf(type);
    const stp = g.v === 2 ? SNAP : 1, r = (n) => Math.max(stp, Math.round(fz(n) / stp) * stp);
    const [w0, h0] = NEW_START[type] || [NEW_W, NEW_H];
    return [Math.min(r(w0), g.cols), Math.min(r(h0), g.rows)];
  };
  const newId = () => { let n = 1; while (st.g.cards.some((c) => c.i === `c${n}`)) n++; return `c${n}`; };
  // a new card: at = where it was dropped; none = the first free place
  function add(type, at) {
    if (st.g.cards.length >= 60) return toast(Kit.t("builder.add.max"), true);
    const t = tdef(type);
    let w, h;
    if (at) ({ w, h } = at);
    else {
      // the small starting size where that fits, else ever smaller (its shape kept as well as it can be),
      // down to the smallest a card may be
      const [W, H] = newSize(type), sizes = [], stp = st.g.v === 2 ? SNAP : 1;
      w = W; h = H;
      for (let a = W; a >= Math.min(stp, W); a -= stp) for (let b = H; b >= Math.min(stp, H); b -= stp) sizes.push([a, b]);
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

  // ---------- a blank card: "Edit pieces" (the owner's most wanted) ----------
  // (v3.0.4) Its pieces sit anywhere on the card, in thousandths of it (devedit.js FREE — as a Devices card's Freeform
  // items; they move and grow with the card). Editing them happens right where the card is — nothing zooms: around it
  // is dimmed, a quiet "Editing pieces — Esc to finish" shows on top. No borders and no grid: a piece is dragged
  // anywhere and resized from any edge or corner (the cursor says which), dashed only while selected; faint guides
  // show when edges or middles line up (nothing snaps). "Done", Esc or a click outside goes back to arranging the
  // cards. Every change is one undo step. A card from before (cells of a 24 × 24 grid) is moved over as it's opened.
  const IN = 24;
  // [kind, name, icon, what it is, default width, height (cells of 24 — a new piece's size, in thousandths by from24)]
  // (v3.0.5) Device and Fan first — a Devices card's item as a piece (Fan: one that is a fan); then Text, Value, Picture,
  // and the ones from before
  const PIECE_T = [["dev", Kit.t("builder.piece.dev.name"), "bulb", Kit.t("builder.piece.dev.desc"), 8, 10],
    ["fan", Kit.t("builder.piece.fan.name"), "fan", Kit.t("builder.piece.fan.desc"), 8, 10],
    ["text", Kit.t("builder.piece.text.name"), "edit", Kit.t("builder.piece.text.desc"), 16, 4],
    ["value", Kit.t("builder.piece.value.name"), "gauge", Kit.t("builder.piece.value.desc"), 8, 6],
    ["icon", Kit.t("builder.piece.icon.name"), "image", Kit.t("builder.piece.icon.desc"), 8, 10],
    ["light", Kit.t("builder.piece.light.name"), "bulb", Kit.t("builder.piece.light.desc"), 8, 10],
    ["switch", Kit.t("builder.piece.switch.name"), "toggle", Kit.t("builder.piece.switch.desc"), 12, 4],
    ["door", Kit.t("builder.piece.door.name"), "door", Kit.t("builder.piece.door.desc"), 12, 4],
    ["lock", Kit.t("builder.piece.lock.name"), "lock", Kit.t("builder.piece.lock.desc"), 14, 5],
    ["garage", Kit.t("builder.piece.garage.name"), "garage", Kit.t("builder.piece.garage.desc"), 10, 12]];
  const PT = Object.fromEntries(PIECE_T.map((x) => [x[0], x]));
  const innerCard = () => (st && st.inner ? st.g.cards.find((c) => c.i === st.inner.id && (c.t === "blank" || c.t === "devices")) || null : null);   // (v3.0.4: a Devices card opens too)
  const pieceName = (p) => {
    if (p.t === "dev") return Kit.t("builder.piece.named", { type: PT[p.k === "fan" ? "fan" : "dev"][1], name: dvName(p) });   // (v3.0.5)
    if (p.t === "text" && p.head && !p.text) return Kit.t("builder.piece.headName", { text: p.head });
    const t = PT[p.t] || ["", Kit.t("builder.piece.fallback")], dev = p.id ? devName(p.id) : p.t === "garage" ? ((p.doors || [])[0] || {}).id && devName(p.doors[0].id) : "";
    if (p.t === "value" && p.net) return Kit.t("builder.piece.named", { type: t[1], name: p.label || Kit.t(`builder.net.val.${p.net}`) });   // (v3.0.5: a UniFi value)
    return p.t === "text" ? Kit.t("builder.piece.textName", { text: String(p.text || "").replace(/\s+/g, " ").slice(0, 24) || Kit.t("builder.piece.emptyText") }) : p.label || dev ? Kit.t("builder.piece.named", { type: t[1], name: p.label || dev }) : t[1];
  };
  // the zoom goes smoothly (only while going in or out — not while the window is resized; a blank card doesn't zoom)
  const zooming = () => { const sc = $(".bld-screen"); if (!sc) return; sc.classList.add("zooming"); clearTimeout(st.zoomT); st.zoomT = setTimeout(() => sc.classList.remove("zooming"), 400); };
  // a blank card from before: its pieces on the 24 × 24 grid (no "fr") → thousandths, edges where they were
  function bkOld(c) { return !!c && c.t === "blank" && !!c.o && c.o.fr !== 1; }
  function bkFree(c) { return bkOld(c) ? { ...c, o: { ...c.o, fr: 1, parts: (Array.isArray(c.o.parts) ? c.o.parts : []).map((q) => DE().from24(q)) } } : c; }
  const bkParts = (c) => { if (bkOld(c)) { c.o = bkFree(c).o; return true; } if (!Array.isArray(c.o.parts)) c.o.parts = []; return false; };
  // (v3.0.5) "Double-click zooms into a card" — a builder setting, off by default (remembered in this browser): off, a
  // double-click edits the card right where it is
  const zoomOn = () => { try { return localStorage.getItem("skypane.bld.zoom") === "1"; } catch { return false; } };
  const setZoom = (on) => { try { localStorage.setItem("skypane.bld.zoom", on ? "1" : "0"); } catch { /* (no storage: off again next time) */ } };
  function enterInner(c, sel = null) {
    if (st.mode !== "arrange") setMode("arrange");
    innerCss(); if (c.t !== "blank" || zoomOn()) zooming();
    if (c.t === "devices" && dvLook(c.o) === "free" && DE().autoPlace(c.o.items || [])) changed(false);   // (v3.0.4: placed before it's dragged)
    if (c.t === "blank" && bkParts(c)) changed(false);   // (a card added from a saved one of before)
    st.sel = c.i; st.inner = { id: c.i, sel };
    fit(); side();
  }
  function leaveInner() {
    if (!st.inner) return;
    if (!(innerCard() && innerCard().t === "blank") || zoomOn()) zooming();
    st.inner = null; fit(); drawHandles(); side();
  }
  // a new piece's drop spot over the card, in cells of 24 (the button's drag)
  const inStyle = (p, n) => `left:${(100 * p.x) / IN}%;top:${(100 * p.y) / IN}%;width:${(100 * p.w) / IN}%;height:${(100 * p.h) / IN}%;z-index:${n + 2}`;
  // (the alignment guides: on unless switched off — remembered in this browser)
  const guidesOn = () => { try { return localStorage.getItem("skypane.bld.guides") !== "0"; } catch { return true; } };
  const setGuides = (on) => { try { localStorage.setItem("skypane.bld.guides", on ? "1" : "0"); } catch { /* (no storage: on again next time) */ } };
  function drawInner() {
    const over = $(".bld-over"), c = innerCard(); if (!over || !c) return;
    if (c.t === "devices") return drawDvInner(c);
    bkParts(c);
    const parts = c.o.parts, sel = st.inner.sel;
    const bg = el("div.bk-ed-bg");   // (a click on the card beside the pieces: none selected)
    bg.addEventListener("pointerdown", (e) => { if (e.button === 0 && st.inner.sel != null) { st.inner.sel = null; drawInner(); side(); } });
    over.replaceChildren(bg, ...parts.map((p, n) => {
      // (the selected one above the others — a piece later in the list can't cover it; no marks: the cursor says
      // where a press moves it and where it resizes it)
      const b = el("div.bk-ed-it" + (sel === n ? ".sel" : "") + (pieceProblem(p) ? ".todo" : ""), { "data-n": String(n), style: `${freeBox(p)};z-index:${sel === n ? 42 : n + 2}`, title: pieceProblem(p) ? Kit.t("builder.piece.todo", { piece: pieceName(p), problem: pieceProblem(p) }) : pieceName(p) },
        el("span.bk-ed-name", {}, iconEl((PT[p.t] || [])[2] || "grid", 12), pieceName(p)));
      const zoneAt = (e) => { const r = b.getBoundingClientRect(); return DE().zone(e.clientX - r.left, e.clientY - r.top, r.width, r.height); };
      b.addEventListener("pointermove", (e) => { if (!st.pdrag) b.style.cursor = DE().CURSOR[zoneAt(e)]; });
      b.addEventListener("pointerdown", (e) => startPieceDrag(e, n, zoneAt(e)));
      return b;
    }), el("div.bk-guides"), ...(parts.length ? [] : [el("div.bk-ed-tip", {}, Kit.t("builder.inner.empty"))]));
  }
  // the faint lines where the piece being moved lines up with another, or with the card's middle (nothing snaps)
  function bkGuides(c, n, r) {
    const box = $(".bld-over .bk-guides"); if (!box) return;
    const O = $(".bld-over").getBoundingClientRect(), others = guidesOn() && r ? c.o.parts.filter((q, k) => k !== n) : null;
    const lines = others ? DE().aligned(r, others, (3 / Math.max(1, O.width)) * DE().FREE, (3 / Math.max(1, O.height)) * DE().FREE) : [];
    box.replaceChildren(...lines.map(([d, at, a, b]) => el("i." + d, { style: d === "v" ? `left:${at / 10}%;top:${a / 10}%;height:${(b - a) / 10}%` : `top:${at / 10}%;left:${a / 10}%;width:${(b - a) / 10}%` })));
  }
  // the X / Y / W / H boxes follow a drag (in % of the card)
  const bkSync = (r) => document.querySelectorAll(".bld-side .bk-xywh input[data-k]").forEach((x) => { if (r[x.dataset.k] != null) x.value = String(r[x.dataset.k] / 10); });
  // move a piece (z "move"), or resize it from an edge or a corner ("n", "se"…): it follows the pointer anywhere on the
  // card (thousandths, devedit.js dragRect: it stays on the card); the panel shows it as it goes
  function startPieceDrag(e, n, z) {
    if (e.button !== 0) return;
    const c = innerCard(), p = c && (c.o.parts || [])[n]; if (!p) return;
    e.preventDefault(); e.stopPropagation();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    const node = e.currentTarget, over = $(".bld-over"), R = over.getBoundingClientRect();
    try { node.setPointerCapture(e.pointerId); } catch {}
    if (st.inner.sel !== n) { st.inner.sel = n; over.querySelectorAll(".bk-ed-it").forEach((b) => { b.classList.toggle("sel", +b.dataset.n === n); b.style.zIndex = String(+b.dataset.n === n ? 42 : +b.dataset.n + 2); }); side(); }
    const s0 = { px: e.clientX, py: e.clientY }, r0 = { x: p.x, y: p.y, w: p.w, h: p.h };
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - s0.px, ev.clientY - s0.py) < 4) return;
      if (!moved) { moved = true; document.body.classList.add("bld-dragging"); }
      const r = DE().dragRect(r0, z, ((ev.clientX - s0.px) / R.width) * DE().FREE, ((ev.clientY - s0.py) / R.height) * DE().FREE);
      st.pdrag = { n, r };
      node.style.cssText = `${freeBox(r)};z-index:42`; bkSync(r); bkGuides(c, n, r);
      post();
    };
    const up = (ev) => {
      node.removeEventListener("pointermove", move); node.removeEventListener("pointerup", up); node.removeEventListener("pointercancel", up);
      st.dragEsc = null; try { node.releasePointerCapture(e.pointerId); } catch {}
      document.body.classList.remove("bld-dragging"); bkGuides(c, n, null);
      const d = st.pdrag; st.pdrag = null;
      if (!moved || !d) return drawInner();
      if (ev.type === "pointerup") { Object.assign(p, d.r); changed(false, null); }
      drawInner(); bkSync(p); post();
    };
    node.addEventListener("pointermove", move); node.addEventListener("pointerup", up); node.addEventListener("pointercancel", up);
    st.dragEsc = () => up({ type: "pointercancel" });   // (Esc mid-drag: back where it was, nothing saved — innerKey)
  }
  // where a new piece of w × h cells (of 24) fits on the card (top-left first); none free: smaller; still none: null
  // → its box in thousandths
  function freeInner(parts, W, H) {
    const hit = (r) => parts.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    for (let w = W, h = H; w >= 2 && h >= 2; w = Math.max(2, w - 2), h = Math.max(2, h - 2)) {
      for (let y = 0; y + h <= IN; y++) for (let x = 0; x + w <= IN; x++) { const r = DE().from24({ x, y, w, h }); if (!hit(r)) return r; }
      if (w === 2 && h === 2) break;
    }
    return null;
  }
  // a new piece (at = where it was dropped, in cells of 24); it's selected, and its first box (its device) has the focus
  function addPiece(t, at) {
    const c = innerCard(); if (!c) return;
    bkParts(c);
    const parts = c.o.parts;
    if (parts.length >= 25) return toast(Kit.t("builder.piece.max"), true);
    const [, , , , W, H] = PT[t];
    let r = at ? DE().from24({ x: cl(at.x - Math.floor(W / 2), 0, IN - W), y: cl(at.y - Math.floor(H / 2), 0, IN - H), w: W, h: H }) : freeInner(parts, W, H);
    if (!r) { r = DE().from24({ x: 0, y: 0, w: W, h: H }); toast(Kit.t("builder.piece.noRoom"), true); }
    // (a text piece that only fits smaller than it should: medium-sized text, so its words still show)
    const fresh = { garage: { doors: [{}] }, text: r.h < DE().from24({ x: 0, y: 0, w: 1, h: H }).h ? { text: Kit.t("builder.piece.yourText"), bold: true } : { text: Kit.t("builder.piece.yourText"), size: "l", bold: true },
      fan: { k: "fan" } }[t] || {};
    parts.push({ t: t === "fan" ? "dev" : t, ...r, ...structuredClone(fresh) });   // (v3.0.5: a Fan is a device piece that is a fan)
    if (t === "dev" || t === "fan") st.dvTab = "device";
    st.inner.sel = parts.length - 1;
    changed(true); drawInner();
    setTimeout(() => { const f = document.querySelector(".bld-side .bk-pe .bld-dfind, .bld-side .bk-pe textarea, .bld-side .bk-pe .dve-cbx"); if (f) f.focus({ preventScroll: true }); }, 0);
  }
  // what a piece still needs ("" = it's ready)
  function pieceProblem(p) {
    if (p.t === "dev") return dvTodo(p);   // (v3.0.5)
    if (p.t === "value" && p.net) return "";   // (v3.0.5: a UniFi value needs no device)
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
  // Esc / Done: back to the cards; Delete: remove the selected piece; the arrow keys: move it 1 % of the card (Shift: 10 %)
  function innerKey(e, t, typing) {
    const onStage = onScreen(t);
    if (e.key === "Escape" && st.dragEsc) { e.preventDefault(); return st.dragEsc(); }   // (a piece mid-drag: Esc cancels the drag first)
    if (innerCard() && innerCard().t === "devices") return dvKey(e, t, typing, innerCard());
    if (e.key === "Escape" && !typing && !(t.closest && t.closest("select"))) { e.preventDefault(); return leaveInner(); }
    const c = innerCard(), n = st.inner.sel, p = c && n != null ? (c.o.parts || [])[n] : null;
    if (!p || !onStage || (t.closest && t.closest("input, textarea, select, button, [contenteditable]"))) return;   // i18n-ok
    if (["Delete", "Backspace"].includes(e.key)) { e.preventDefault(); return removePiece(c, n); }   // i18n-ok
    if (!/^Arrow/.test(e.key)) return;
    e.preventDefault();
    Object.assign(p, DE().nudge(p, e.key, e.shiftKey));
    changed(false, `nudge:${c.i}:${n}`); drawInner(); bkSync(p);
  }
  function removePiece(c, n) {
    const p = c.o.parts.splice(n, 1)[0];
    st.inner.sel = null; changed(true); drawInner();
    if (p) undoToast(Kit.t("builder.hist.pieceGone", { name: pieceName(p) }));   // (v3.0.5: Undo right in the message)
  }
  // (v3.0.5) "Arrange ▾": the Devices card's looks as one-time helpers — List (one row each, the icon on the left), Tiles
  // (even tiles side by side) or Single item (the picked one over the whole card, in front). They only move the pieces
  // once (one Undo puts them back); dragging them afterwards is as before. In thousandths of the card.
  function arrange(c, how) {
    const parts = c.o.parts || []; if (!parts.length) return;
    const P = 24, G = 16, inner = 1000 - 2 * P, n = parts.length;
    const box = (x, y, w, h) => DE().fixRect({ x: Math.round(x), y: Math.round(y), w: Math.max(10, Math.round(w)), h: Math.max(10, Math.round(h)) });
    if (how === "list") parts.forEach((p, k) => { const h = (inner - (n - 1) * G) / n; Object.assign(p, box(P, P + k * (h + G), inner, h)); if (p.t === "dev") p.tp = "right"; });
    else if (how === "tiles") {
      // (as square as the card lets them: the card's own width against its height on the screen)
      const cw = st.rect ? (c.w * st.rect.w) / st.g.cols : c.w, ch = st.rect ? (c.h * st.rect.h) / st.g.rows : c.h;
      const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * cw) / Math.max(1, ch))) || 1)), rows = Math.ceil(n / cols);
      const w = (inner - (cols - 1) * G) / cols, h = (inner - (rows - 1) * G) / rows;
      parts.forEach((p, k) => { Object.assign(p, box(P + (k % cols) * (w + G), P + Math.floor(k / cols) * (h + G), w, h)); if (p.t === "dev") p.tp = "bottom"; });
    } else {
      const k = st.inner && st.inner.sel != null && parts[st.inner.sel] ? st.inner.sel : 0, p = parts.splice(k, 1)[0];
      Object.assign(p, box(P, P, inner, inner)); parts.push(p); st.inner.sel = parts.length - 1;
    }
    changed(true); drawInner(); post();
    undoToast(Kit.t(`builder.arrange.done.${how}`));
  }
  // (v3.0.5) "Grow and shrink with the card" on a piece: on — the card's box now is where what's in it has its own size
  // (from there it follows the card); off — how much it grew goes into its icon and text size, so it looks the same
  // (a piece from before 3.0.5 — "fit": "box", filling its box — takes the new way once the owner picks either)
  function setPieceGrow(c, p, on) {
    delete p.fit;
    if (on) { p.grow = { w: c.w, h: c.h }; return; }
    const g = p.grow, k = g && g.w > 0 && g.h > 0 ? Math.max(0.4, Math.min(4, Math.min(c.w / g.w, c.h / g.h))) : 1;
    delete p.grow;
    if (Math.abs(k - 1) < 0.005) return;
    const bake = (key) => { const v = Math.max(50, Math.min(250, Math.round((p[key] || 100) * k))); if (v === 100) delete p[key]; else p[key] = v; };
    if (p.t === "dev") { bake("iz"); bake("tz"); }
    else if (p.t === "text") p.fs = Math.max(9, Math.min(80, Math.round((p.fs || { s: 13, m: 17, l: 24, xl: 34 }[p.size || "m"]) * k)));
    // (v3.0.5) a light, switch, value, door, lock, garage or picture: its own zoom ("pz", % — grid.js draws it at that size)
    else { const z = Math.max(40, Math.min(400, Math.round((p.pz || 100) * k))); if (z === 100) delete p.pz; else p.pz = z; }
  }
  const growBox = (on, onchange, note) => el("label.dve-tk.bk-grow", { title: Kit.t("builder.grow.tip") },
    el("input", { type: "checkbox", checked: !!on, onchange: (e) => onchange(e.target.checked) }),
    el("span", {}, el("b", {}, Kit.t("builder.grow.label")), el("small.muted", {}, note)));
  // the right side while editing inside: the pieces to add, the ones on the card, the selected one's settings
  function innerSide(c) {
    if (c.t === "devices") return dvSide(c);
    bkParts(c);
    const parts = c.o.parts, n = st.inner.sel, p = n != null ? parts[n] : null;
    const list = parts.length ? el("div.bk-list", {}, parts.map((q, k) => el("button.ghost.small.bk-li" + (k === n ? ".cur" : ""), { type: "button", title: pieceProblem(q) ? Kit.t("builder.piece.stillToDo", { problem: pieceProblem(q) }) : Kit.t("builder.piece.selectIt"),
      onclick: () => { st.inner.sel = k; drawInner(); side(); } }, iconEl((PT[q.t] || [])[2] || "grid", 14), el("span", {}, pieceName(q)), pieceProblem(q) ? el("b.bk-todo", {}, "!") : null))) : null;
    return el("div.card.bld-insp.bk-insp", {},
      el("div.bld-head", {}, picEl("plus", 22), el("h3", {}, Kit.t("builder.inner.title")),
        el("button.primary.small.bk-done", { type: "button", title: Kit.t("builder.inner.doneTip"), onclick: leaveInner }, Kit.t("builder.top.done")),
        el("small.muted", {}, Kit.t("builder.inner.help"))),
      el("b.bk-h", {}, Kit.t("builder.inner.addPiece")),
      el("div.bk-addrow", {}, PIECE_T.map(([t]) => pieceBtn(t, (at) => addPiece(t, at), parts.length >= 25))),
      // (v3.0.5) Arrange ▾ — the old Devices card's looks, as helpers that move the pieces once
      parts.length > 1 ? el("div.bk-arr", {}, el("span.bld-l", { title: Kit.t("builder.arrange.tip") }, Kit.t("builder.arrange.label")),
        el("button.ghost.small", { type: "button", title: Kit.t("builder.arrange.listTip"), onclick: () => arrange(c, "list") }, Kit.t("builder.arrange.list")),
        el("button.ghost.small", { type: "button", title: Kit.t("builder.arrange.tilesTip"), onclick: () => arrange(c, "tiles") }, Kit.t("builder.arrange.tiles")),
        el("button.ghost.small", { type: "button", title: Kit.t("builder.arrange.singleTip"), onclick: () => arrange(c, "single") }, Kit.t("builder.arrange.single"))) : null,
      parts.length ? el("b.bk-h", {}, Kit.t("builder.inner.onCard", { n: parts.length })) : null, list,
      p ? piecePlace(c, p, n) : null, p ? pieceEditor(c, p, n) : el("small.muted", {}, parts.length ? Kit.t("builder.inner.clickPiece") : ""),
      el("label.bk-gsw", { title: Kit.t("builder.inner.guidesTip") }, el("span", {}, Kit.t("builder.inner.guides")),
        el("span.switch", {}, el("input", { type: "checkbox", checked: guidesOn(), onchange: (e) => { setGuides(e.target.checked); toast(Kit.t(e.target.checked ? "builder.inner.guidesOn" : "builder.inner.guidesOff")); } }), el("span"))));
  }
  // the selected piece's place (in % of the card — as a Devices card's Freeform item; they follow a drag, and set it
  // as they're typed) and its layer: later pieces lie in front
  function piecePlace(c, p, n) {
    const parts = c.o.parts;
    const num = (k) => el("label.dve-num", {}, el("span", {}, Kit.t(`builder.dve.${k}`)), el("input", { type: "number", min: "0", max: "100", step: "any", value: String(p[k] / 10), "data-k": k, "aria-label": Kit.t(`builder.dve.${k}Long`),
      oninput: (e) => { const v = parseFloat(e.target.value); if (!Number.isFinite(v)) return; Object.assign(p, DE().fixRect({ ...p, [k]: v * 10 })); changed(false, `bkpos:${c.i}:${n}:${k}`); drawInner(); },
      onchange: () => side() }));
    const layer = (to) => { parts.splice(to, 0, parts.splice(n, 1)[0]); st.inner.sel = to; changed(true); drawInner(); toast(Kit.t(to > n ? "builder.inner.forwardDone" : "builder.inner.backDone")); };
    return el("div.bk-place", {}, el("b.bk-h", {}, Kit.t("builder.dve.place")), el("div.dve-xywh.bk-xywh", {}, num("x"), num("y"), num("w"), num("h")),
      el("small.muted", {}, Kit.t("builder.inner.placeNote")),
      el("div.bk-order", {}, el("button.ghost.small.bk-fwd", { type: "button", disabled: n === parts.length - 1, onclick: () => layer(n + 1) }, Kit.t("builder.inner.forward")),
        el("button.ghost.small.bk-bwd", { type: "button", disabled: n === 0, onclick: () => layer(n - 1) }, Kit.t("builder.inner.back"))),
      el("small.muted", {}, Kit.t("builder.inner.layer", { n: n + 1, of: parts.length })));
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
    // (v3.0.5) "Grow and shrink with the card" on every piece (off: it keeps its own size whatever the card's size)
    out.push(growBox(!!p.grow, (on) => { setPieceGrow(c, p, on); put(); toast(Kit.t(on ? "builder.grow.pieceOn" : "builder.grow.pieceOff")); }, Kit.t("builder.grow.pieceNote")));
    // (v3.0.5) a device piece: everything a Devices item has — Device · Actions · Look · Advanced (dvItem)
    // (v3.0.5) "Use the new look" on a device piece: the same "Done — Undo" note as the Devices card had (dvCard)
    if (p.t === "dev" && !p.st && st.dvUndo === `${c.i}#${n}`) out.push(el("div.dve-old", {}, el("small.muted", {}, Kit.t("builder.dve.newLookDone")),
      el("button.ghost.small", { type: "button", onclick: () => { st.dvUndo = null; undoRedo(true); } }, Kit.t("builder.dve.undo"))));
    if (p.t === "dev") out.push(dvItem(c, p, n, "piece"));
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
    // (v3.0.5) a Value piece shows a device's reading, or one UniFi Network value (unifi.js: a tap opens its room)
    if (p.t === "value") out.push(row(Kit.t("builder.value.from"), seg([[false, Kit.t("builder.value.fromDevice")], [true, Kit.t("builder.value.fromNet")]], !!p.net,
      (v) => { if (v) { delete p.id; delete p.at; delete p.unit; p.net = p.net || "inet"; } else delete p.net; put(); })));
    if (p.t === "value" && p.net) out.push(row(Kit.t("builder.value.netValue"), el("select", { onchange: (e) => setp("net", e.target.value) }, optList(NET_VALS.map((k) => [k, Kit.t(`builder.net.val.${k}`)]), p.net))),
      nameRow(Kit.t(`builder.net.val.${p.net}`)), el("small.muted", {}, Kit.t("builder.value.netNote")));
    if (p.t === "value" && !p.net) {
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
      out.push(...garageDoorRows(doors, put, false));
      out.push(nameRow(Kit.t("builder.f.nonePh")), el("small.muted", {}, Kit.t("builder.garage.tapNote")));
    }
    if (p.t === "text") {
      const ta = el("textarea", { rows: "3", maxlength: "400", onchange: (e) => setp("text", e.target.value) }); ta.value = p.text || "";
      let insDev = null, insAt = "temperature";
      out.push(row(Kit.t("builder.piece.text.name"), ta),
        el("div.bld-ins", {}, el("small.muted", {}, Kit.t("builder.text.addLive")), devSelect(null, (v) => { insDev = v; }, Kit.t("builder.text.devicePh"), { all: true }),
          el("select", { onchange: (e) => { insAt = e.target.value; } }, optList([["name", Kit.t("builder.text.itsName")], ...ATTRS.map((a) => [a, a])], insAt)),
          el("button.ghost.small", { type: "button", onclick: () => { if (!insDev) return toast(Kit.t("builder.text.pickDevFirst"), true);
            const add = `${ta.value && !/\s$/.test(ta.value) ? " " : ""}{{${insDev}.${insAt}}}`; if (ta.value.length + add.length > 400) return toast(Kit.t("builder.text.full"), true);
            ta.value += add; setp("text", ta.value); } }, Kit.t("builder.text.insert"))),
        el("small.muted", {}, Kit.t("builder.text.also", { time: "{{time}}", date: "{{date}}", greeting: "{{greeting}}" })),
        row(Kit.t("builder.f.size"), seg([["s", Kit.t("builder.f.small")], ["m", Kit.t("builder.f.medium")], ["l", Kit.t("builder.f.large")], ["xl", Kit.t("builder.f.huge")]], p.fs ? "" : p.size || "m", (v) => { delete p.fs; setp("size", v === "m" ? null : v); })),
        // (v3.0.5) its own size in px, its color, a heading over it
        (() => { const v = p.fs || { s: 13, m: 17, l: 24, xl: 34 }[p.size || "m"], l = el("span.bld-l", {}, Kit.t("builder.text.px", { n: v }));
          return el("div.bld-row", {}, l, el("input", { type: "range", min: "9", max: "80", step: "1", value: String(v), "aria-label": Kit.t("builder.text.sizeAria"),
            oninput: (e) => { p.fs = +e.target.value; delete p.size; l.textContent = Kit.t("builder.text.px", { n: p.fs }); changed(false, `bkfs:${c.i}:${n}`); drawInner(); }, onchange: () => side() })); })(),
        row(Kit.t("builder.text.color"), colorBtn(p.nc, Kit.t("builder.dve.colorAutoShort"), (v) => { if (v) p.nc = v; else delete p.nc; changed(false, `bknc:${c.i}:${n}`); }, () => side())),
        row(Kit.t("builder.text.head"), el("input", { type: "text", maxlength: "40", value: p.head || "", placeholder: Kit.t("builder.f.nonePh"), onchange: (e) => setp("head", e.target.value.trim()) })),
        row(Kit.t("builder.f.align"), seg([["left", Kit.t("builder.f.left")], ["center", Kit.t("builder.f.centre")], ["right", Kit.t("builder.f.right")]], p.align || "left", (v) => setp("align", v === "left" ? null : v))),
        row(Kit.t("builder.f.bold"), el("label.switch", {}, el("input", { type: "checkbox", checked: !!p.bold, onchange: (e) => setp("bold", e.target.checked ? true : null) }), el("span"))));
    }
    const parts = c.o.parts;
    out.push(el("div.bld-acts", {},
      el("button.ghost.small", { type: "button", title: Kit.t("builder.piece.frontTip"), disabled: n === parts.length - 1, onclick: () => { parts.push(parts.splice(n, 1)[0]); st.inner.sel = parts.length - 1; put(); } }, Kit.t("builder.f.toFront")),
      el("button.ghost.small", { type: "button", title: Kit.t("builder.piece.backTip"), disabled: n === 0, onclick: () => { parts.unshift(parts.splice(n, 1)[0]); st.inner.sel = 0; put(); } }, Kit.t("builder.f.toBack")),
      el("button.ghost.small", { type: "button", onclick: () => {
        if (parts.length >= 25) return toast(Kit.t("builder.piece.maxShort"), true);
        const q = structuredClone(p), r = DE().dragRect(p, "move", 30, 30);   // (a little down and to the right)
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
.bk-ed-bg { position: absolute; inset: 0; }
.bk-ed-name { position: absolute; left: 4px; top: -10px; display: none; align-items: center; gap: 4px; padding: 1px 7px; border-radius: 7px; font-size: 11px; line-height: 16px;
  background: var(--surface, #1a1238); border: 1px solid rgba(255, 255, 255, .3); color: var(--text); white-space: nowrap; max-width: calc(100% + 40px); overflow: hidden; text-overflow: ellipsis; z-index: 3; pointer-events: none; }
.bk-ed-it:hover .bk-ed-name, .bk-ed-it.sel .bk-ed-name, .bk-ed-it.todo .bk-ed-name { display: inline-flex; }
.bk-ed-it.sel .bk-ed-name { background: #fbbf24; color: #1a1238; border-color: #fbbf24; } .bk-ed-it.sel .bk-ed-name .ic { color: #1a1238; }
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
.bk-arr { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.bk-grow { align-items: flex-start; } .bk-grow > span { display: flex; flex-direction: column; gap: 2px; }
.bk-open { width: 100%; padding: 12px; font-size: 15px; }`));
  }

  // ---------- left: the cards to add ----------
  function palette() {
    const box = $(".bld-pal-scroll"); if (!box || !st) return;
    if (st.ptab === "layers") return box.replaceChildren(...layers());
    const btn = (k, n, ic, d) => {
      const [w, h] = newSize(k);
      return el("div.bld-add", { title: Kit.t("builder.pal.addTip", { what: d }), "data-type": k, "gs-w": String(w), "gs-h": String(h) }, iconEl(ic, 18), el("span", {}, n));
    };
    box.replaceChildren(
      el("h3", {}, Kit.t("builder.pal.cards")),
      el("small.muted", {}, Kit.t("builder.pal.hint")),
      cats(),
      ...(() => {
        const cat = st.cat || (st.ctx.room ? "room" : "devices"), q = (st.find || "").toLowerCase();
        const hit = (n, d) => !q || `${n} ${d}`.toLowerCase().includes(q);
        const types = TYPES.filter(([k, n, , d]) => !OLD_T.has(k) && (k.startsWith("room") && k !== "room" ? st.ctx.room : true) && (q ? hit(n, d) : (CAT_OF[k] || []).includes(cat)));
        const mine = st.cards.filter((u) => (q ? hit(u.name, u.description || "") : cat === "yours"));
        const saved = (st.tpls || []).filter((s) => (!/^room./.test(s.card.t) || st.ctx.room) && (q ? hit(s.name, tdef(s.card.t)[1]) : cat === "yours"));
        return [
          types.length ? el("div.bld-pal", {}, types.map(([k, n, ic, d]) => btn(k, n, ic, d))) : null,
          // (v3.0.4) Protect's storage (Recordings & NVR): the server can't read it yet — said here, never on a panel
          cat === "network" && !q ? el("div.bld-soon", {}, iconEl("nas", 18), el("span", {}, el("b", {}, Kit.t("builder.net.nvrName")), el("small", {}, Kit.t("builder.net.nvrSoon")))) : null,
          saved.length ? el("h4.bld-palh", {}, Kit.t("builder.pal.saved")) : null,
          saved.length ? el("div.bld-pal", {}, saved.map((s) => btn("tpl:" + s.id, s.name, tdef(s.card.t)[2], tdef("tpl:" + s.id)[3]))) : null,
          saved.length && !q ? el("details.bld-saved", {}, el("summary", {}, Kit.t("builder.pal.manageSaved")),
            ...saved.map((s) => el("div.bld-savedrow", {},
              el("input", { type: "text", value: s.name, maxlength: "40", "aria-label": Kit.t("builder.f.name"),
                onchange: (e) => { const v = e.target.value.trim();
                  if (!v) { e.target.value = s.name; return toast(Kit.t("builder.pal.needName", { name: s.name }), true); }
                  if (v !== s.name) tplChange({ action: "rename", id: s.id, name: v }, Kit.t("builder.pal.renamed")); } }),
              el("button.ghost.bad.small", { type: "button", title: Kit.t("builder.pal.removeTip"),
                // (v3.0.5) a small thing: no question — it goes to the Trash, with Undo in the message
                onclick: async () => { const r = await tplChange({ action: "remove", id: s.id });
                  if (r && Kit.trash) Kit.trash.deleted({ name: s.name, trash: r.trash, days: r.days, after: () => loadTpls(),
                    redo: async () => { const x = await tplChange({ action: "remove", id: s.id }); return x && x.trash; } }); } }, "✕")))) : null,
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
      el("div.bld-icbtns", {}, opts.picsOnly ? null : el("button.ghost.small.bld-icbtn", { type: "button", onclick: () => show(panel) }, Kit.t("builder.icon.icons")),   // (picsOnly: the owner's pictures only)
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
/* (v3.0.5) a calendar's color dot */ .bld-cdi.dot { grid-template-columns: 18px 10px 1fr auto; } .bld-cddot { width: 10px; height: 10px; border-radius: 50%; flex: none; box-shadow: 0 0 0 2px rgba(255, 255, 255, .08); }
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
      // (v3.0.5) opts.dot(v): a color dot before the name (a calendar's own color); opts.tip(v): why a box is off
      items.map(([v, n, note], k) => el(opts.dot ? "label.bld-cdi.dot" : "label.bld-cdi", { title: (opts.tip && opts.tip(v)) || null }, boxes[k],
        opts.dot && /^#[0-9a-f]{3,8}$/i.test(opts.dot(v) || "") ? el("i.bld-cddot", { style: `background:${opts.dot(v)}`, "aria-hidden": "true" }) : null,
        el("span", {}, n), note != null ? el("small.muted", {}, note) : null)),
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
  // (v3.0.4) a card's X / Y / W / H, in cells of the panel's grid (192 × 128 on any screen): they follow a drag, and move
  // it as they're typed — not onto another card while "Allow overlap" is off
  function cardPlace(c) {
    const g = st.g;
    // (a box typed in: kept on the screen — a size too big takes the room left, the card stays where it is; onto another
    // card → "overlap", nothing moves)
    const put = (k, v) => {
      const r = { x: c.x, y: c.y, w: c.w, h: c.h, [k]: v };
      if (k === "w" || k === "h") { r.w = cl(r.w, 1, g.cols - r.x); r.h = cl(r.h, 1, g.rows - r.y); }
      r.w = cl(r.w, 1, g.cols); r.h = cl(r.h, 1, g.rows); r.x = cl(r.x, 0, g.cols - r.w); r.y = cl(r.y, 0, g.rows - r.h);
      if (!fits(r, c.i)) return "overlap";
      if (["x", "y", "w", "h"].some((q) => r[q] !== c[q])) { Object.assign(c, r); changed(false, `cpos:${c.i}:${k}`); drawHandles(); }
      return "ok";
    };
    const num = (k) => el("label.dve-num", {}, el("span", {}, Kit.t(`builder.dve.${k}`)), el("input", { type: "number", min: k === "w" || k === "h" ? "1" : "0", max: String(k === "x" || k === "w" ? g.cols : g.rows), step: "1", value: String(c[k]), "data-k": k, "aria-label": Kit.t(`builder.cpos.${k}Long`),
      oninput: (e) => { const v = Math.round(parseFloat(e.target.value)); if (Number.isFinite(v)) put(k, v); },
      onchange: (e) => { const v = Math.round(parseFloat(e.target.value)); if (Number.isFinite(v) && put(k, v) === "overlap") toast(Kit.t("builder.drag.overlap"), true); e.target.value = String(c[k]); } }));
    return el("div.bld-cpos", {}, el("div.dve-xywh.bld-cxywh", {}, num("x"), num("y"), num("w"), num("h")), el("small.muted", {}, Kit.t("builder.cpos.note", { cols: g.cols, rows: g.rows })));
  }
  // (v3.0.5) a Rooms card's rooms (mockups/prototypes/settings-and-pages.html, the Rooms tab): in order — drag a grip or
  // ▲ ▼, ✕ takes one off, "Add a room…" puts one at the end. One room: o.room alone (as before 3.0.5); more: o.rooms
  // too (its first is o.room). A room hidden from this panel's room bar is still offered: the card still opens it
  function roomsPicker(o, set) {
    const all = st.ctx.rooms || [], name = (id) => (all.find((r) => r.id === id) || {}).name || id;
    const ids = Array.isArray(o.rooms) && o.rooms.length ? o.rooms.slice() : o.room ? [o.room] : [];
    const hidden = (st.look && st.look.hiddenRooms) || {};
    const put = (l) => { l = [...new Set(l)].slice(0, 12); if (l.length) o.room = l[0]; else delete o.room; set("rooms", l.length > 1 ? l : null); };
    const mv = (from, to) => { const l = ids.slice(); l.splice(to, 0, l.splice(from, 1)[0]); put(l); };
    const out = [el("b", { style: "display:block;margin-top:6px" }, Kit.t("builder.rooms.title"))];
    const box = el("div.bld-wxlist.bld-rooms", {}, ids.map((id, n) => el("div.bld-row", {}, Kit.reorder && ids.length > 1 ? Kit.reorder.grip(id, name(id)) : null,
      el("span", {}, name(id)), hidden[id] ? el("small.muted", { title: Kit.t("builder.rooms.offBarTip") }, Kit.t("builder.rooms.offBar")) : null,
      el("button.ghost.small", { type: "button", disabled: n === 0, "aria-label": Kit.t("builder.wx.up"), title: Kit.t("builder.wx.up"), onclick: () => mv(n, n - 1) }, "▲"),
      el("button.ghost.small", { type: "button", disabled: n === ids.length - 1, "aria-label": Kit.t("builder.wx.down"), title: Kit.t("builder.wx.down"), onclick: () => mv(n, n + 1) }, "▼"),
      el("button.ghost.small", { type: "button", "aria-label": Kit.t("builder.rooms.remove", { name: name(id) }), title: Kit.t("builder.pal.remove"), onclick: () => put(ids.filter((_, k) => k !== n)) }, "✕"))));
    if (ids.length) out.push(Kit.reorder && ids.length > 1 ? Kit.reorder.list(box, "rooms-card", { name: (i) => name(ids[i]), move: mv, ownUndo: true }) : box);
    const left = all.filter((r) => !ids.includes(r.id));
    if (ids.length < 12 && left.length) out.push(row(Kit.t("builder.rooms.add"), el("select", { onchange: (e) => { if (e.target.value) put([...ids, e.target.value]); } },
      optList(left.map((r) => [r.id, hidden[r.id] ? Kit.t("builder.rooms.hiddenOpt", { name: r.name }) : r.name]), null, Kit.t("builder.room.pick")))));
    out.push(el("small.muted", {}, Kit.t(ids.length > 1 ? "builder.rooms.manyNote" : "builder.rooms.oneNote")));
    return out;
  }
  // (v3.0.5) the System card's rows (mockups/prototypes/cards-editor.html, System): tick what it watches, order the ticked
  // ones (a grip or ▲ ▼); a part this house hasn't set up is grayed out, "not set up" (the panel's own word on it:
  // GET /api/panel/<id>/health → sys, row names only — asked once per builder visit). A card from before 3.0.5 (no
  // rows) shows its four: they start ticked
  const SYS = ["hubitat", "bridge", "notifier", "mqtt", "protect", "cameras", "unifi", "calendars", "weather", "music", "led", "panel"];
  // (the panel's own to judge: never grayed out)
  const SYS_ALWAYS = new Set(["hubitat", "bridge", "weather", "led", "panel"]);
  function sysPicker(o, set) {
    if (st.sys === undefined) {
      st.sys = null;
      api(`/api/panel/${encodeURIComponent(st.ctx.panel.id)}/health`).then((j) => {
        st.sys = j && j.sys && Array.isArray(j.sys.set) ? j.sys : false;
        // (the canvas follows: the panel page there doesn't ask itself — status.js stays off in the builder)
        try { const w = $(".bld-frame").contentWindow; if (w && st.sys) { w.PanelSys = st.sys; if (w.App && w.App.render) w.App.render(); } } catch {}
        side();
      }).catch(() => { st.sys = false; side(); });
    }
    const known = st.sys && Array.isArray(st.sys.set), isSet = (k) => SYS_ALWAYS.has(k) || !known || st.sys.set.includes(k);
    const picked = Array.isArray(o.rows) ? o.rows.filter((k) => SYS.includes(k)) : ["hubitat", "bridge", "weather", "panel"];
    const put = (l) => set("rows", l);
    const order = [...picked, ...SYS.filter((k) => !picked.includes(k))];
    const mv = (from, to) => { const l = picked.slice(); l.splice(to, 0, l.splice(from, 1)[0]); put(l); };
    const box = el("div.bld-wxlist.bld-sys", {}, order.map((k) => {
      const on = picked.includes(k), n = picked.indexOf(k), ok = isSet(k);
      return el("div.bld-row" + (on ? "" : ".off"), {}, Kit.reorder && on && picked.length > 1 ? Kit.reorder.grip(k, Kit.t(`builder.sys.${k}`)) : null,
        el("label.bld-sysl", {}, el("input", { type: "checkbox", checked: on, onchange: (e) => put(e.target.checked ? [...picked, k] : picked.filter((x) => x !== k)) }), el("span", {}, Kit.t(`builder.sys.${k}`))),
        ok ? null : el("small.muted", { title: Kit.t("builder.sys.notSetTip") }, Kit.t("builder.sys.notSet")),
        el("button.ghost.small", { type: "button", disabled: !on || n === 0, "aria-label": Kit.t("builder.wx.up"), title: Kit.t("builder.wx.up"), onclick: () => mv(n, n - 1) }, "▲"),
        el("button.ghost.small", { type: "button", disabled: !on || n === picked.length - 1, "aria-label": Kit.t("builder.wx.down"), title: Kit.t("builder.wx.down"), onclick: () => mv(n, n + 1) }, "▼"));
    }));
    // (the grips move the ticked rows only — they come first, in their order)
    const list = Kit.reorder && picked.length > 1 ? Kit.reorder.list(box, "sys-rows", { name: (i) => Kit.t(`builder.sys.${order[i]}`), move: (a, b) => (a < picked.length && b < picked.length ? mv(a, b) : null), ownUndo: true }) : box;
    return [el("b", { style: "display:block;margin-top:6px" }, Kit.t("builder.sys.title")), el("small.muted", { style: "display:block" }, Kit.t("builder.sys.hint")), list,
      !picked.length ? el("small.pn-warn", {}, Kit.t("builder.sys.noneNote")) : null];
  }
  function inspector(c) {
    const t = tdef(c.t), o = c.o, s = c.s, u = userCard(c.t);
    // (v3.0.5: a System card's "rows": [] is kept — every row unticked, "Pick rows"; no rows at all would be the old four)
    const set = (k, v, redraw = true) => { if (v == null || v === "" || (Array.isArray(v) && !v.length && k !== "items" && !(k === "rows" && c.t === "status"))) delete o[k]; else o[k] = v; refreshItem(c); changed(redraw); };
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
    parts.push(cardPlace(c));

    // what it shows
    const what = [];
    if (!["clock", "picture", "blank"].includes(c.t)) what.push(row(Kit.t("builder.f.title"), el("input", { type: "text", value: o.title || "", maxlength: "40", placeholder: Kit.t("builder.f.automaticPh"), onchange: (e) => set("title", e.target.value.trim()) })));
    // (v3.0.5) a blank card's own name: here in the builder only (its label on the screen), not drawn on the panel
    if (c.t === "blank") what.push(tipRow(Kit.t("builder.f.name"), Kit.t("builder.blank.nameTip"), el("input", { type: "text", value: o.title || "", maxlength: "40", placeholder: Kit.t("builder.type.blank.name"), onchange: (e) => { set("title", e.target.value.trim()); drawHandles(); } })));
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
    // (v3.0.5) Slide show / Picture: one picture stays, several (or a picture folder) play — the options shared with the
    // background and the screensaver (folders.js Kit.showEditor; service/layouts.py show_opts checks them again)
    if (c.t === "photos") {
      what.push(Kit.showEditor ? Kit.showEditor({ o, which: "card", uploads: st.pics || [], set: (n) => {
        for (const k of Object.keys(o)) if (k !== "title") delete o[k];
        Object.assign(o, n); refreshItem(c); changed(true);
      } }) : el("small.muted", {}, Kit.t("builder.photos.none")));
    }
    // (v3.0.5) Batteries: "Low batteries" (every device with one) or "Custom" (the devices picked, with their own low
    // level); "Show only when low" or "Always show" (every watched battery, the low ones marked)
    if (c.t === "batteries") {
      // (v3.0.5: a battery with no level yet says so — never "— %")
      const lvl = (id) => { const b = parseFloat(rawDev(id).attrs.battery); return Number.isFinite(b) ? `${Math.round(b)} %` : Kit.t("builder.batteries.noLevel"); };   // i18n-ok (a unit)
      const custom = o.mode === "custom", bats = devices().filter((d) => "battery" in (rawDev(d.id).attrs || {})).map((d) => [d.id, d.label, lvl(d.id)]);
      what.push(row(Kit.t("builder.batteries.what"), seg([[false, Kit.t("builder.batteries.low")], [true, Kit.t("builder.batteries.custom")]], custom, (v) => set("mode", v ? "custom" : null))));
      if (custom) what.push(bats.length ? checkDrop(`bat:${c.i}`, Kit.t("builder.batteries.watch"), bats, (o.ids || []).filter((x) => bats.some((b) => b[0] === x)),
        (next) => set("ids", next.length ? next : null), { noneText: Kit.t("builder.batteries.noneYet"), foot: Kit.t("builder.batteries.watchFoot") }) : el("small.muted", {}, Kit.t("builder.batteries.noBattery")));
      if (custom && !(o.ids || []).length) what.push(el("small.pn-warn", {}, Kit.t("builder.batteries.pickNote")));   // (v3.0.5: as the card shows it)
      what.push(tipRow(custom ? Kit.t("builder.batteries.lowAt") : Kit.t("builder.batteries.below"), Kit.t("builder.batteries.lowTip"),
        el("select", { onchange: (e) => set("below", +e.target.value) }, optList([[10, "10 %"], [15, "15 %"], [20, "20 %"], [25, "25 %"], [30, "30 %"], [40, "40 %"], [50, "50 %"], [60, "60 %"], [100, Kit.t("builder.batteries.all")]], o.below || 25))),
        row(Kit.t("builder.batteries.when"), seg([[false, Kit.t("builder.batteries.onlyLow")], [true, Kit.t("builder.batteries.always")]], o.show === "all", (v) => set("show", v ? "all" : null))),
        el("small.muted", {}, o.show === "all" ? Kit.t("builder.batteries.alwaysNote") : Kit.t("builder.batteries.onlyLowNote")));
    }
    // (v3.0.5) Power now: the devices it watches (none picked: every device that reports watts), then all or the top N
    if (c.t === "power") {
      // (v3.0.5) every device that reports watts — hidden ones too (an inverter or a meter is often hidden from the rooms)
      const meters = ((((M.devices && M.devices()) || {}).devices) || []).filter(reportsW).map((d) => [d.id, d.label || Kit.t("builder.dev.fallback", { id: d.id })])
        .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
      what.push(meters.length ? checks(`pw:${c.i}`, Kit.t("builder.power.watch"), meters, o.ids, (v) => set("ids", v), Kit.t("builder.power.every")) : null,
        row(Kit.t("builder.f.show"), el("select", { onchange: (e) => set("top", +e.target.value) }, optList([[0, Kit.t("builder.power.allOf")], ...[3, 5, 8, 10, 12, 20].map((n) => [n, Kit.t("builder.power.top", { n })])], o.top ?? 8))),
        el("small.muted", {}, Array.isArray(o.ids) && o.ids.length ? Kit.t("builder.power.pickedNote", { n: o.ids.length }) : Kit.t("builder.power.note")));
    }
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
    if (c.t === "devices") what.push(...dvCard(c, set));
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
    if (c.t === "room") what.push(...roomsPicker(o, set));
    if (c.t === "status") what.push(...sysPicker(o, set));
    // (v3.0.5) Notifications: Compact (the Alert note's button) or List (mockups/prototypes/cards-editor.html)
    if (c.t === "notices") what.push(row(Kit.t("builder.f.style"), seg([["compact", Kit.t("builder.notices.compact")], ["list", Kit.t("builder.notices.list")]], o.style === "compact" ? "compact" : "list",
      (v) => set("style", v === "compact" ? "compact" : null))), el("small.muted", {}, Kit.t(o.style === "compact" ? "builder.notices.compactNote" : "builder.notices.listNote")));
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
    // (v3.0.5; mockups/prototypes/calendar-pick-305.html) "Same as the panel" (the default) or "Choose": a card only ever
    // narrows the panel — a calendar off on this panel stays off, ticked or not; one added later shows only on "Same
    // as the panel" cards. Going back to "Same as the panel" keeps the ticks for next time.
    if (c.t === "calendar") {
      const house = st.ctx.houseCalendars || [], own = new Map((st.ctx.managed.calendars || []).map((x) => [x.id, x]));
      const offHere = (id) => (own.get(id) || {}).on === false, pick = o.cal === "pick";
      const shown = house.filter((h) => !offHere(h.id)).map((h) => h.id), color = new Map(house.map((h) => [h.id, h.color]));
      // (v3.0.5) "Choose" the first time: the calendars the panel shows start ticked
      what.push(row(Kit.t("builder.calendar.which"), seg([[false, Kit.t("builder.calendar.same")], [true, Kit.t("builder.calendar.choose")]], pick,
        (v) => { if (v && !Array.isArray(o.cals)) o.cals = shown.slice(); set("cal", v ? "pick" : null); })));
      if (!house.length) what.push(el("small.muted", {}, Kit.t("builder.calendar.noneYet")));
      else if (pick) {
        // (v3.0.5) each with its color dot; one off on the panel: dimmed and disabled (narrowing: it can't show), the tooltip says why
        const items = house.map((h) => [h.id, h.name, offHere(h.id) ? Kit.t("builder.calendar.offHere", { panel: st.ctx.panel.name }) : null]);
        const ticked = (Array.isArray(o.cals) ? o.cals : []).filter((id) => house.some((h) => h.id === id));
        what.push(checkDrop(`cal:${c.i}`, Kit.t("builder.calendar.onCard"), items, ticked,
          (next) => { o.cals = next; set("cal", "pick"); },   // (v3.0.5: none ticked stays none — set() would drop an empty list)
          { noneText: Kit.t("builder.calendar.noneTicked"), disabled: offHere, foot: Kit.t("builder.calendar.narrowNote"),
            dot: (id) => color.get(id), tip: (id) => (offHere(id) ? Kit.t("builder.calendar.offTip", { panel: st.ctx.panel.name }) : null) }));
        if (!ticked.some((id) => !offHere(id))) what.push(el("small.pn-warn", {}, Kit.t("builder.calendar.emptyCard")));
      } else what.push(el("small.muted", {}, Kit.t("builder.calendar.sameNote", { n: house.filter((h) => !offHere(h.id)).length, panel: st.ctx.panel.name })));
    }
    if (c.t === "weather") what.push(...wxSource(o, set), ...wxPlaces(o, set));
    if (c.t === "weather") what.push(row(Kit.t("builder.weather.days"), el("select", { onchange: (e) => set("days", e.target.value === "" ? null : +e.target.value) },
      optList([[0, Kit.t("builder.weather.nowOnly")], [1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"], [7, "7"], [14, "14"]], o.days, Kit.t("builder.weather.all")))));
    if (c.t === "weather" && o.days !== 0) what.push(tipRow(Kit.t("builder.weather.tapHours"), Kit.t("builder.weather.tapHoursTip"),   // (v3.0.4: on unless switched off)
      Kit.sw(o.hours !== false, (v) => set("hours", v ? null : false), Kit.t("builder.weather.tapHours"))));
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
    if (c.t === "blank") {   // its pieces: edited right on the card (v3.0.4: nothing zooms)
      const parts = o.parts || [];
      what.push(el("button.primary.bk-open", { type: "button", title: Kit.t("builder.blank.openTip"), onclick: () => enterInner(c) }, parts.length ? Kit.t("builder.blank.edit") : Kit.t("builder.blank.fill")),
        el("small.muted", {}, parts.length ? Kit.t("builder.blank.pieces", { n: parts.length, list: parts.map(pieceName).join(" · ") }) : Kit.t("builder.blank.empty")),
        ...parts.map(pieceProblem).filter(Boolean).slice(0, 1).map((x) => el("small.bld-note", {}, Kit.t("builder.blank.needs", { problem: x }))),
        el("b.bk-h", {}, Kit.t("builder.inner.addPiece")), (innerCss(), el("div.bk-addrow", {}, PIECE_T.map(([t]) => pieceBtn(t, () => { enterInner(c); addPiece(t, null); }, parts.length >= 25)))));
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
    if (c.t === "trash") what.push(...trashEditor(o));
    if (NET_COL[c.t]) what.push(...netEditor(c, o, set));
    if (c.t === "timers") what.push(...timersEditor(o));
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
    // (v3.0.3) the words and icons keep their own size (Style's Icon / Text size); "Grow and shrink with the card" (off by
    // default) makes them follow the box from the size it has when it's switched on
    // (v3.0.5: on every card — a blank card too, where its pieces then follow the card; each piece has its own as well)
    { const fitNow = s.fit === "scroll" || s.fit === false ? "scroll" : "scale", growOn = !!(s.grow && s.grow.w && s.grow.h);
      if (c.t === "blank") what.unshift(growBox(growOn, (on) => { setGrow(c, on); side(); }, growOn ? Kit.t("builder.grow.onNote") : Kit.t("builder.grow.blankNote")));
      else what.unshift(tipRow(Kit.t("builder.grow.label"), Kit.t("builder.grow.tip"), el("label.switch", {}, el("input", { type: "checkbox", checked: growOn, onchange: (e) => { setGrow(c, e.target.checked); side(); } }), el("span"))),
        tipRow(Kit.t("builder.resize.label"), Kit.t("builder.resize.tip"), seg([["scale", Kit.t("builder.resize.scale")], ["scroll", Kit.t("builder.resize.scroll")]], fitNow, (v) => { sty("fit", v === "scale" ? null : "scroll"); side(); })),
        el("small.muted", {}, growOn ? Kit.t("builder.grow.onNote") : fitNow === "scale" ? Kit.t("builder.resize.scaleNote")
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
    if (!u && c.t !== "group" && c.t !== "devices") parts.push(sec("acts", Kit.t("builder.sec.does"), ["tap", "hold", "dbl"].filter((k) => c[k]).length ? Kit.t("builder.sec.set") : "", ...actRows,
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

  // (v3.0.3) "Grow and shrink with the card". On: the card's box now (in the grid's cells) is where its content is its own
  // size — from there on it follows the box, so nothing jumps. Off: how much it grew (or shrank) with the box since then
  // (the box against the box it had when switched on — grid.js Grid.fit's "grow" ratio) goes into its Icon and Text size,
  // so it looks the same; from then on the box only gives it room. Only that ratio: the canvas's --gfit also holds the
  // "doesn't fit" shrink, which the card does again on its own — baking that in would shrink it for good.
  function setGrow(c, on) {
    const s = c.s || (c.s = {});
    if (on) { s.grow = { w: c.w, h: c.h }; return changed(false); }
    let k = 1;
    const ref = s.grow && typeof s.grow === "object" && s.grow.w > 0 && s.grow.h > 0 ? s.grow : null;
    if (ref && c.w > 0 && c.h > 0) {
      const kw = c.w / ref.w, kh = c.h / ref.h, scroll = s.fit === "scroll" || s.fit === false;
      k = Math.max(0.4, Math.min(4, scroll ? kw : Math.min(kw, kh)));
    }
    // (the Style sliders' range, 50–250 %; 100 % is no setting at all)
    const bake = (key) => { const n = Math.max(50, Math.min(250, Math.round((s[key] ?? 100) * k))); if (n === 100) delete s[key]; else s[key] = n; };
    if (Math.abs(k - 1) > 0.005) { bake("ic"); bake("tx"); }
    delete s.grow;
    changed(false);
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

  // ---------- (v3.0.4) a weather card's "Weather from": Automatic, Open-Meteo, the Hubitat device, OpenWeatherMap ----------
  // (GET /api/manage/weather/sources, asked once a visit: only what's connected can be picked; the rest say where to
  // connect it. A card that picked one since disconnected keeps it — the panel shows Open-Meteo for it meanwhile)
  let wxSrcs = null, wxSrcAsked = false;
  function wxSource(o, set) {
    if (!wxSrcAsked) {
      wxSrcAsked = true;
      api("/api/manage/weather/sources").then((j) => { wxSrcs = j || {}; side(); }).catch(() => { wxSrcs = {}; side(); });
    }
    const s = wxSrcs || {}, cur = ["auto", "om", "hub", "owm"].includes(o.src) ? o.src : "auto";
    const connect = () => (M.isAdmin && M.isAdmin() ? el("button.lnk", { type: "button", onclick: () => M.go("integrations") }, Kit.t("builder.wxsrc.connect"))
      : el("span", {}, Kit.t("builder.wxsrc.connect")));
    const opt = (v, name, note, ok) => el("label.bld-wxsrc" + (ok ? "" : ".off"), {},
      el("input", { type: "radio", name: "bld-wxsrc", checked: cur === v, disabled: !ok && cur !== v, onchange: () => set("src", v) }),
      el("span", {}, el("b", {}, name), el("small.muted", {}, ...(ok ? [note] : [Kit.t("builder.wxsrc.notConnected"), " ", connect()]))));
    // (v3.0.4: as the panel decides — the device is the home place's, the others OpenWeatherMap with a key, else Open-Meteo)
    const auto = wxSrcs ? Kit.t({ hub: "builder.wxsrc.autoHub", owm: "builder.wxsrc.autoOwm" }[s.auto] || "builder.wxsrc.autoOm", { other: Kit.t(s.owm ? "builder.wxsrc.owm" : "builder.wxsrc.om") }) : Kit.t("common.loading");
    return [el("b", { style: "display:block;margin-top:6px" }, Kit.t("builder.wxsrc.title")),
      opt("auto", Kit.t("builder.wxsrc.auto"), auto, true),
      opt("om", Kit.t("builder.wxsrc.om"), Kit.t("builder.wxsrc.omNote"), true),
      opt("hub", Kit.t("builder.wxsrc.hub"), Kit.t("builder.wxsrc.hubNote"), !wxSrcs || !!s.hub),
      opt("owm", Kit.t("builder.wxsrc.owm"), Kit.t("builder.wxsrc.owmNote"), !wxSrcs || !!s.owm)];
  }
  // ---------- a weather card's places: + Add a place (search Open-Meteo's place names), × to remove; the first is home ----------
  let wxFound = null, wxAdding = false, wxWhy = "";   // (wxWhy: why the last search found nothing — a word from the table)
  function wxPlaces(o, set) {
    const locs = Array.isArray(o.locs) ? o.locs : [];
    const put = (list) => set("locs", list.length ? list : null);
    const out = [el("b", { style: "display:block;margin-top:6px" }, Kit.t("builder.wx.places")), el("small.muted", { style: "display:block" }, locs.length ? Kit.t("builder.wx.placesNote")
      : Kit.t("builder.wx.noPlaces"))];
    // (v3.0.5) each place has a grip too: drag it (or Alt+↑ ↓, Space on the grip) — Kit.reorder, one Undo per move
    const pname = (p) => `${p.name}${p.region ? `, ${p.region}` : ""}`;
    const mv = (from, to) => { const l = locs.slice(); l.splice(to, 0, l.splice(from, 1)[0]); put(l); };
    // (v3.0.5) the grip only with two places or more; a drag is the builder's own Undo step (ownUndo), not Kit.history's
    const wbox = el("div.bld-wxlist", {}, locs.map((p, n) => el("div.bld-row", {}, Kit.reorder && locs.length > 1 ? Kit.reorder.grip(`${p.name}|${p.lat},${p.lon}`, pname(p)) : null, el("span", {}, `${n === 0 ? "🏠 " : ""}${pname(p)}`),
      el("button.ghost.small", { type: "button", disabled: n === 0, "aria-label": Kit.t("builder.wx.up"), title: n === 1 ? Kit.t("builder.wx.makeHome") : Kit.t("builder.wx.up"), onclick: () => mv(n, n - 1) }, "▲"),
      el("button.ghost.small", { type: "button", disabled: n === locs.length - 1, "aria-label": Kit.t("builder.wx.down"), title: Kit.t("builder.wx.down"), onclick: () => mv(n, n + 1) }, "▼"),
      el("button.ghost.small", { type: "button", "aria-label": Kit.t("builder.pal.remove"), onclick: () => put(locs.filter((_, k) => k !== n)) }, "✕"))));
    if (locs.length) out.push(Kit.reorder && locs.length > 1 ? Kit.reorder.list(wbox, "wx-places", { name: (i) => pname(locs[i]), move: mv, ownUndo: true }) : wbox);
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
      out.push(...garageDoorRows(doors, () => set("doors", doors), true));
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

  // ---------- (v3.0.4) Bins / Trash and Countdown & timers (the design: mockups/prototypes/garage-bins-timers.html) ----------
  // The card's own settings, plus two house-wide lists kept by the service, saved as they're changed: the holidays
  // (/api/manage/bins — what moves a pickup) and the timer presets (/api/manage/timers — every timer's buttons).
  const hex6 = () => Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join("");
  const WEEKDAYS = ["builder.day.sunday", "builder.day.monday", "builder.day.tuesday", "builder.day.wednesday", "builder.day.thursday", "builder.day.friday", "builder.day.saturday"];
  const BIN_COLORS = [["gray", "#7a808c"], ["black", "#2e3038"], ["yellow", "#f2c230"], ["green", "#3f9460"], ["blue", "#3373d6"], ["brown", "#8f5d3d"], ["red", "#d64545"],
    ["purple", "#9b5bd6"], ["burgundy", "#8c2740"], ["lime", "#8cc63f"]];
  const TC_COLORS = ["#8b5cf6", "#38bdf8", "#34d399", "#fbbf24", "#fb923c", "#fb7185", "#ec4899"];
  const house = (what) => {   // the house's list, read once while the builder is open (then the side is drawn again)
    const h = st.house || (st.house = {});
    if (!h[what]) { h[what] = { busy: true }; api(`/api/manage/${what}`).then((r) => { if (st && r && r.ok) { st.house[what] = r; side(); } }).catch(() => {}); }
    return h[what].busy ? null : h[what];
  };
  const saveHouse = (what, body) => api(`/api/manage/${what}`, body).then((r) => {
    if (r && r.ok) { st.house[what] = r; toast(Kit.t("builder.house.saved")); } else toast((r && r.error) || Kit.t("builder.house.notSaved"), true);
    side();
  }).catch(() => toast(Kit.t("builder.house.notSaved"), true));
  const timeIn = (v, put) => el("input", { type: "time", value: v || "", onchange: (e) => { if (/^\d{2}:\d{2}$/.test(e.target.value)) put(e.target.value); } });
  const chips = (opts, on, flip) => el("div.bld-chips", {}, opts.map(([v, l]) => el("button.ghost.small" + (on(v) ? ".cur" : ""), { type: "button", "aria-pressed": String(on(v)), onclick: () => flip(v) }, l)));

  // ---------- (v3.0.4) the UniFi cards: Style (A / B / C), their colors, each one's own settings ----------
  // (the colors and their defaults: the panel's unifi.js COL — service/layouts.py NET_COLORS checks the keys)
  const NET_COL = {
    netwan: { dl: "#38bdf8", ul: "#c084fc", lat: "#fbbf24", ok: "#34d399", warn: "#fbbf24", bad: "#fb7185" },
    netchips: { acc: "#f3efff", bar: "#a78bfa" },
    netstrip: { ok: "#34d399", warn: "#fbbf24", bad: "#fb7185", sel: "#a78bfa" },
    netmap: { line: "#8b5cf6", wifi: "#38bdf8", orb: "#f5d0fe", node: "#a78bfa", idle: "#6b6390", bad: "#fb7185", ok: "#34d399", warn: "#fbbf24" },
    netdevs: { ok: "#34d399", bad: "#fb7185", warn: "#fbbf24" },
    netpoe: { gauge: "#a78bfa", warn: "#fb923c", port: "#38bdf8" },
    netclients: { icon: "#dacfff", named: "#a5b4fc" },
    netlog: { join: "#34d399", roam: "#7dd3fc" },
    netvals: { val: "#f3efff", icon: "#a78bfa" },
    netups: { mains: "#34d399", batt: "#fbbf24", low: "#fb7185", fill: "#a78bfa" },
    netbell: { ring: "#fbbf24", acc: "#a78bfa" },
    netfeed: { join: "#34d399", leave: "#94a3b8", alert: "#fb7185", ok: "#38bdf8" },
  };
  const NET_PARTS = ["counts", "uptime", "uptodate", "isp", "thru", "ping"], NET_STRIP = ["net", "gw", "wifi", "sw", "pro", "clients"];
  const NET_VALS = ["inet", "line", "ping", "gw", "poe", "wifi", "wired", "clients", "devs"], NET_VALS0 = ["inet", "line", "ping", "wifi", "devs"];
  const swIn = (on, put) => el("label.switch", {}, el("input", { type: "checkbox", checked: !!on, onchange: (e) => put(e.target.checked) }), el("span"));
  function netColors(c, o) {
    const cols = NET_COL[c.t], own = o.col || {};
    const put = (k, v) => { const n = { ...(o.col || {}) }; if (v && v.toLowerCase() !== cols[k]) n[k] = v; else delete n[k]; if (Object.keys(n).length) o.col = n; else delete o.col; changed(false); };
    return sec(`netcol:${c.t}`, Kit.t("builder.net.colors"), Kit.t("builder.net.colorsN", { n: Object.keys(cols).length }),
      el("div.bld-netcols", {}, Object.entries(cols).map(([k, d]) => el("label", {}, el("input", { type: "color", value: own[k] || d, onchange: (e) => put(k, e.target.value) }), el("span", {}, Kit.t(`builder.net.col.${c.t}.${k}`))))),
      el("button.ghost.small", { type: "button", onclick: () => { delete o.col; changed(); } }, Kit.t("builder.net.resetColors")));
  }
  // the switches on this house's network (the PoE card's picker): the Manager's own read of UniFi, once
  const netSwitches = () => {
    if (!st.netDevs) { st.netDevs = []; api("/api/manage/unifi").then((r) => { if (st) { st.netDevs = (r.devices || []).filter((d) => d.kind === "switch"); side(); } }).catch(() => {}); }
    return st.netDevs;
  };
  // (v3.0.5) the UPSes there are (the UPS card's picker): the Manager's read, once
  const netUpses = () => {
    if (!st.netUps) { st.netUps = []; api("/api/manage/ups").then((r) => { if (st) { st.netUps = r.upses || []; side(); } }).catch(() => {}); }
    return st.netUps;
  };
  // (v3.0.5) a slider for a percent (the map's card title sizes): saved when let go; the default saves as nothing
  const pctSlider = (label, v, def, min, max, put) => { const lab = el("span.bld-l", {}, Kit.t(label, { n: v }));
    return el("div.bld-row", {}, lab, el("input", { type: "range", min, max, step: 5, value: v, oninput: (e) => { lab.textContent = Kit.t(label, { n: e.target.value }); },
      onchange: (e) => put(+e.target.value === def ? null : +e.target.value) })); };
  function netEditor(c, o, set) {
    const look = ["a", "b", "c"].includes(o.look) ? o.look : "a", out = [];
    if (c.t !== "netfeed") out.push(row(Kit.t("builder.dock.style"), seg(["a", "b", "c"].map((v) => [v, Kit.t(`builder.net.look.${c.t}.${v}`)]), look, (v) => set("look", v === "a" ? null : v))));
    if (c.t === "netmap") {
      const glow = Number.isInteger(o.glow) ? o.glow : 60, lab = el("span.bld-l", {}, Kit.t("builder.net.glowN", { n: glow }));
      out.push(el("div.bld-row", {}, lab, el("input", { type: "range", min: 0, max: 100, step: 5, value: glow,
        oninput: (e) => { lab.textContent = Kit.t("builder.net.glowN", { n: e.target.value }); }, onchange: (e) => set("glow", +e.target.value === 60 ? null : +e.target.value) })));
    }
    out.push(netColors(c, o));   // (the map's: just under Orb glow)
    if (c.t === "netwan") out.push(
      row(Kit.t("builder.net.graph"), seg([["dl", Kit.t("builder.net.gm.dl")], ["ul", Kit.t("builder.net.gm.ul")], ["both", Kit.t("builder.net.gm.both")]], o.gm || "both", (v) => set("gm", v === "both" ? null : v))),
      el("small.muted", {}, Kit.t("builder.net.graphNote")),
      row(Kit.t("builder.net.lat"), swIn(o.lat !== false, (v) => set("lat", v ? null : false))),
      checks(`netparts:${c.i}`, Kit.t("builder.net.parts"), NET_PARTS.map((k) => [k, Kit.t(`builder.net.part.${k}`)]), o.parts, (v) => set("parts", v), Kit.t("builder.net.allParts")),
      el("small.muted", {}, Kit.t("builder.net.wanNote")));
    if (c.t === "netmap") {
      const arr = st.netArr === c.i;
      out.push(row(Kit.t("builder.net.follow"), swIn(o.follow !== false, (v) => set("follow", v ? null : false))),
        el("h4.bld-sub", {}, Kit.t("builder.net.arrange")),
        el("div.bld-row", {}, el("button" + (arr ? ".primary" : ".ghost") + ".small", { type: "button", onclick: () => netArrange(arr ? null : c.i) }, Kit.t(arr ? "builder.net.arrangeDone" : "builder.net.arrangeGo")),
          // (v3.0.5) "Arrange for me": your own places go, the parts spread over the whole card again (one undo step)
          el("button.ghost.small", { type: "button", title: Kit.t("builder.net.autoTip"), onclick: () => { if (o.pos) set("pos", null); toast(Kit.t("builder.net.autoDone")); } }, Kit.t("builder.net.auto"))),
        el("small.muted", {}, Kit.t(arr ? "builder.net.arrangeOn" : o.pos ? "builder.net.arrangeKept" : "builder.net.arrangeNote")),
        row(Kit.t("builder.net.snap"), swIn(o.snap !== false, (v) => set("snap", v ? null : false))),   // (v3.0.5: on by default)
        row(Kit.t("builder.net.ports"), swIn(o.ports, (v) => set("ports", v || null))),
        // (v3.0.5) the parts follow the card's Style Icon size / Text size, never the card's size; the title has its own
        el("h4.bld-sub", {}, Kit.t("builder.net.mapSizes")),
        el("small.muted", {}, Kit.t("builder.net.mapSizesNote")),
        pctSlider("builder.net.htxN", Number.isInteger(o.htx) ? o.htx : 100, 100, 60, 180, (v) => set("htx", v)),
        pctSlider("builder.net.hicN", Number.isInteger(o.hic) ? o.hic : 100, 100, 60, 180, (v) => set("hic", v)),
        el("h4.bld-sub", {}, Kit.t("builder.net.protectGear")),
        row(Kit.t("builder.net.protect"), swIn(o.protect !== false, (v) => set("protect", v ? null : false))),
        o.protect !== false ? row(Kit.t("builder.net.cams"), seg([["bubble", Kit.t("builder.net.camsBubble")], ["each", Kit.t("builder.net.camsEach")]], o.camEach ? "each" : "bubble", (v) => set("camEach", v === "each" || null))) : null);
    }
    if (c.t === "netdevs") out.push(row(Kit.t("builder.net.cols"), seg([[1, Kit.t("builder.net.colsOne")], [2, Kit.t("builder.net.colsTwo")]], o.cols === 2 ? 2 : 1, (v) => set("cols", v === 2 ? 2 : null))),
      row(Kit.t("builder.net.group"), swIn(o.group, (v) => set("group", v || null))), el("small.muted", {}, Kit.t("builder.net.devsNote")));
    if (c.t === "netpoe") out.push(row(Kit.t("builder.net.switch"), el("select", { onchange: (e) => set("sw", e.target.value || null) },
      optList(netSwitches().map((d) => [d.id, d.name]), o.sw || "", Kit.t("builder.net.allSwitches")))), el("small.muted", {}, Kit.t("builder.net.poeNote")));
    if (c.t === "netclients") out.push(row(Kit.t("builder.net.sort"), el("select", { onchange: (e) => set("sort", e.target.value === "name" ? null : e.target.value) },
      optList(["name", "type", "network", "ssid", "conn", "signal", "traffic"].map((k) => [k, Kit.t(`builder.net.sortBy.${k}`)]), o.sort || "name"))),
      row(Kit.t("builder.net.filter"), seg(["all", "wired", "wifi", "guest"].map((k) => [k, Kit.t(`builder.net.f.${k}`)]), o.filter || "all", (v) => set("filter", v === "all" ? null : v))),
      el("small.muted", {}, Kit.t("builder.net.clientsNote")));
    if (c.t === "netlog") out.push(row(Kit.t("builder.net.logWifi"), swIn(o.wifi !== false, (v) => set("wifi", v ? null : false))), el("small.muted", {}, Kit.t("builder.net.logNote")));
    if (c.t === "netups") out.push(row(Kit.t("builder.net.ups"), el("select", { onchange: (e) => set("ups", e.target.value || null) },
      optList(netUpses().map((u) => [u.id, `${u.name} · ${Kit.t(u.src === "nut" ? "builder.net.upsNut" : "builder.net.upsUnifi")}`]), o.ups || "", Kit.t("builder.net.upsFirst")))),
      el("small.muted", {}, Kit.t("builder.net.upsNote")));   // (says it hides without a UPS)
    if (c.t === "netbell") {
      const bells = ((window.HUBITAT && HUBITAT.cameras) || st.cams || []).filter((x) => x && x.doorbell);
      out.push(row(Kit.t("builder.net.bell"), el("select", { onchange: (e) => set("cam", e.target.value ? +e.target.value : null) },
        optList(bells.map((x) => [String(x.id), x.name]), o.cam != null ? String(o.cam) : "", Kit.t("builder.net.bellFirst")))),
        row(Kit.t("builder.net.bellMsgs"), swIn(o.msgs !== false, (v) => set("msgs", v ? null : false))),
        el("small.muted", {}, Kit.t("builder.net.bellNote")));
    }
    if (c.t === "netfeed") out.push(row(Kit.t("builder.net.feedCounts"), swIn(o.counts !== false, (v) => set("counts", v ? null : false))),
      row(Kit.t("builder.net.feedDense"), swIn(o.dense === true, (v) => set("dense", v || null))),
      row(Kit.t("builder.net.feedGuests"), swIn(o.guests !== false, (v) => set("guests", v ? null : false))),
      row(Kit.t("builder.net.feedAlerts"), swIn(o.alerts !== false, (v) => set("alerts", v ? null : false))),
      el("small.muted", {}, Kit.t("builder.net.feedNote")));
    if (c.t === "netstrip") out.push(checks(`netstrip:${c.i}`, Kit.t("builder.net.tabs"), NET_STRIP.map((k) => [k, Kit.t(`builder.net.tab.${k}`)]), o.items, (v) => set("items", v), Kit.t("builder.net.allTabs")),
      el("small.muted", {}, Kit.t("builder.net.stripNote")));
    if (c.t === "netvals") out.push(checks(`netvals:${c.i}`, Kit.t("builder.net.vals"), NET_VALS.map((k) => [k, Kit.t(`builder.net.val.${k}`)]), o.vals || NET_VALS0, (v) => set("vals", v || NET_VALS), Kit.t("builder.net.allVals")),
      el("small.muted", {}, Kit.t("builder.net.valsNote")));
    // (its own line: not run into the note above; v3.0.5: the UPS and the Doorbell don't need UniFi Network — their notes say when they hide)
    if (c.t !== "netups" && c.t !== "netbell") out.push(el("small.muted", { style: "display:block;margin-top:6px" }, Kit.t("builder.net.hiddenNote")));
    return out.filter(Boolean);
  }
  // the map's arranging: on for one card (the frame lets the drag through), off when that card isn't the one selected
  function netArrange(i) {
    st.netArr = i || null;
    const f = $(".bld-frame"); if (f && f.contentWindow) f.contentWindow.postMessage({ t: "netArrange", i: st.netArr }, location.origin);
    const over = $(".bld-over"); if (over) over.classList.toggle("bld-pass", !!st.netArr);
    side();
  }
  // a part dragged on the panel's card → that card's o.pos (node id → [x, y] in thousandths of the map)
  function netPos(i, pos) {
    const c = st.g.cards.find((x) => x.i === i); if (!c || c.t !== "netmap" || st.netArr !== i) return;
    const clean = {};
    for (const [k, v] of Object.entries(pos).slice(0, 300)) if (/^(wan:WAN2?|(pg:)?[0-9a-f]{12})$/.test(k) && Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000)) clean[k] = v;
    c.o = c.o || {}; c.o.pos = clean;
    changed(true);   // (v3.0.5: each move its own undo step — ↶ / Ctrl+Z takes back one move at a time)
  }

  function trashEditor(o) {
    const rem = o.rem || (o.rem = { when: "before", at: "19:30" });
    const out = [
      ...listEditor(o, "items", 8, Kit.t("builder.trash.add"), () => ({ id: hex6(), name: Kit.t("builder.trash.trash"), icon: "wheelie", color: "green", anim: true, btn: "out",
        truck: "07:00", hol: "none", sch: { k: "weekly", days: [1] } }), (b) => binRows(b)),
      el("h4.bld-sub", {}, Kit.t("builder.trash.reminder")),
      row(Kit.t("builder.trash.when"), seg([["before", Kit.t("builder.trash.before")], ["same", Kit.t("builder.trash.same")]], rem.when === "same" ? "same" : "before", (v) => { rem.when = v; changed(); })),
      row(Kit.t("builder.trash.from"), timeIn(rem.at, (v) => { rem.at = v; changed(); })),
      el("small.muted", {}, Kit.t("builder.trash.remNote")),
      row(Kit.t("builder.trash.alarm"), el("label.switch", {}, el("input", { type: "checkbox", checked: !!o.alarm, onchange: (e) => { if (e.target.checked) o.alarm = "21:00"; else delete o.alarm; changed(); } }), el("span")),
        o.alarm ? timeIn(o.alarm, (v) => { o.alarm = v; changed(); }) : null),
      el("small.muted", {}, Kit.t("builder.trash.alarmNote")),
      row(Kit.t("builder.trash.calm"), el("label.switch", {}, el("input", { type: "checkbox", checked: o.calm === true, onchange: (e) => { if (e.target.checked) o.calm = true; else delete o.calm; changed(); } }), el("span"))),
      el("small.muted", {}, Kit.t("builder.trash.calmNote")),
      el("h4.bld-sub", {}, Kit.t("builder.trash.holidays")),
    ];
    const h = house("bins");
    if (!h) return [...out, el("small.muted", {}, Kit.t("builder.house.loading"))];
    const hol = (h.holidays || []).map((x) => ({ ...x })), put = () => saveHouse("bins", { holidays: hol.filter((x) => x.d) });
    return [...out, ...hol.map((x, n) => el("div.bld-row", {},
      el("input", { type: "date", value: x.d || "", onchange: (e) => { x.d = e.target.value; put(); } }),
      el("input", { type: "text", value: x.name || "", maxlength: "40", placeholder: Kit.t("builder.trash.holName"), onchange: (e) => { x.name = e.target.value.trim() || Kit.t("builder.trash.holiday"); put(); } }),
      el("button.ghost.small", { type: "button", "aria-label": Kit.t("builder.pal.remove"), onclick: () => { hol.splice(n, 1); put(); } }, "✕"))),
    hol.length < 40 ? el("button.ghost.small", { type: "button", onclick: () => { const d = new Date(); hol.push({ d: d.toISOString().slice(0, 10), name: Kit.t("builder.trash.holiday") }); put(); } }, Kit.t("builder.trash.addHoliday")) : null,
    el("small.muted", {}, Kit.t("builder.trash.holNote"))];
  }
  function binRows(b) {
    const s = b.sch || (b.sch = { k: "weekly", days: [1] }), put = () => changed();
    const days = WEEKDAYS.map((k, i) => [i, Kit.t(k).slice(0, 3)]);
    const rows = [
      row(Kit.t("builder.f.name"), el("input", { type: "text", value: b.name || "", maxlength: "24", onchange: (e) => { b.name = e.target.value.trim() || Kit.t("builder.trash.trash"); put(); } })),
      row(Kit.t("builder.trash.container"), el("select", { onchange: (e) => { b.icon = e.target.value; if (!["wheelie", "recycle", "inside"].includes(b.icon)) delete b.lid; put(); } },
        optList(["wheelie", "recycle", "inside", "bag", "bulky"].map((k) => [k, Kit.t(`builder.trash.icon.${k}`)]), b.icon || "wheelie"))),
      // (v3.0.4) your own picture instead of the drawing (Manager → Icons: the own-pictures picker)
      tipRow(Kit.t("builder.trash.ownPic"), Kit.t("builder.trash.ownPicTip"), iconPick(b.pic || null, (v) => { if (/^up:[0-9a-f]{16}$/.test(v || "")) b.pic = v; else delete b.pic; put(); }, Kit.t("builder.trash.theDrawing"), { picsOnly: true }),
        b.pic ? el("button.ghost.small", { type: "button", "aria-label": Kit.t("builder.trash.dropPic"), title: Kit.t("builder.trash.dropPic"), onclick: () => { delete b.pic; put(); } }, "✕") : null),
      row(Kit.t("builder.trash.style"), seg([["still", Kit.t("builder.trash.still")], ["anim", Kit.t("builder.trash.animated")]], b.anim ? "anim" : "still", (v) => { if (v === "anim") b.anim = true; else delete b.anim; put(); })),
      row(Kit.t("builder.trash.color"), el("div.bld-sws", {}, BIN_COLORS.map(([k, hx]) => el("button.bld-sw" + ((b.color || "gray") === k ? ".cur" : ""), { type: "button", title: Kit.t(`builder.trash.c.${k}`),
        "aria-label": Kit.t(`builder.trash.c.${k}`), style: `background:${hx}`, onclick: () => { b.color = k; put(); } })))),
      ["wheelie", "recycle", "inside"].includes(b.icon || "wheelie") ? row(Kit.t("builder.trash.colorOn"), seg([["all", Kit.t("builder.trash.whole")], ["lid", Kit.t("builder.trash.lid")]], b.lid ? "lid" : "all",
        (v) => { if (v === "lid") b.lid = true; else delete b.lid; put(); })) : null,
      row(Kit.t("builder.trash.schedule"), el("select", { onchange: (e) => { s.k = e.target.value; if (s.k === "every") { s.every = s.every || 2; s.from = s.from || new Date().toISOString().slice(0, 10); }
        if (s.k === "seasonal" && !s.months) s.months = [2, 3, 4, 5, 6, 7, 8, 9, 10]; if (s.k === "monthly") { s.nth = s.nth || 1; s.days = [s.days[0] ?? 1]; } put(); } },
        optList(["weekly", "every", "evenodd", "monthly", "seasonal"].map((k) => [k, Kit.t(`builder.trash.sch.${k}`)]), s.k || "weekly"))),
    ];
    if (s.k === "monthly") rows.push(row(Kit.t("builder.trash.which"), el("select", { onchange: (e) => { s.nth = +e.target.value; put(); } }, optList(["first", "second", "third", "fourth", "last"].map((w, i) => [i + 1, Kit.t(`builder.trash.nth.${w}`)]), s.nth || 1)),
      el("select", { onchange: (e) => { s.days = [+e.target.value]; put(); } }, optList(WEEKDAYS.map((k, i) => [i, Kit.t(k)]), (s.days || [1])[0]))));
    else rows.push(row(Kit.t("builder.trash.days"), chips(days, (v) => (s.days || []).includes(v), (v) => {
      const d = new Set(s.days || []); if (d.has(v) && d.size > 1) d.delete(v); else d.add(v); s.days = [...d].sort(); put(); })));
    if (s.k === "every") rows.push(row(Kit.t("builder.trash.every"), el("select", { onchange: (e) => { s.every = +e.target.value; put(); } }, optList([1, 2, 3, 4, 6, 8].map((n) => [n, Kit.t("builder.trash.weeks", { n })]), s.every || 2))),
      row(Kit.t("builder.trash.knownPickup"), el("input", { type: "date", value: s.from || "", onchange: (e) => { if (e.target.value) { s.from = e.target.value; put(); } } })),
      el("small.muted", {}, Kit.t("builder.trash.everyNote")));
    if (s.k === "evenodd") rows.push(row(Kit.t("builder.trash.weeksOf"), seg([["even", Kit.t("builder.trash.even")], ["odd", Kit.t("builder.trash.odd")]], s.parity === "odd" ? "odd" : "even", (v) => { s.parity = v; put(); })));
    if (s.k === "seasonal") rows.push(row(Kit.t("builder.trash.season"), chips([...Array(12).keys()].map((m) => [m, new Date(2026, m, 1).toLocaleDateString(undefined, { month: "short" })]),
      (v) => (s.months || []).includes(v), (v) => { const m = new Set(s.months || []); if (m.has(v) && m.size > 1) m.delete(v); else m.add(v); s.months = [...m].sort((x, y) => x - y); put(); })));
    rows.push(row(Kit.t("builder.trash.truck"), timeIn(b.truck || "07:00", (v) => { b.truck = v; put(); })),
      row(Kit.t("builder.trash.ifHoliday"), el("select", { onchange: (e) => { b.hol = e.target.value; put(); } },
        optList(["none", "next_day", "next_work_day", "shift_week", "shift_rest", "cancel"].map((k) => [k, Kit.t(`builder.trash.hol.${k.replace(/_(\w)/g, (m, x) => x.toUpperCase())}`)]), b.hol || "none"))),
      row(Kit.t("builder.trash.button"), el("select", { onchange: (e) => { b.btn = e.target.value; put(); } }, optList([["out", Kit.t("builder.trash.btn.out")], ["emptied", Kit.t("builder.trash.btn.emptied")], ["curb", Kit.t("builder.trash.btn.curb")]], b.btn || "out"))));
    return rows;
  }

  function timersEditor(o) {
    // (own: the card's own presets — an old Timers card's buttons, moved over in 3.0.4; else every timer's, the house's)
    const h = house("timers"), own = Array.isArray(o.presets) && o.presets.length ? o.presets : null, presets = (h && h.presets) || [], pl = own || presets;
    const items = Array.isArray(o.items) ? o.items : (o.items = []);
    const out = [...listEditor(o, "items", 8, Kit.t("builder.tc.addTimer"), () => ({ id: hex6(), k: "timer", name: Kit.t("builder.tc.timer"), mix: "hms", col: TC_COLORS[items.length % TC_COLORS.length],
      preset: pl[0] && pl[0].id, snd: "chime", dismiss: 15 }), (it) => tcRows(it, pl))];
    if (items.length < 8) out.push(el("button.ghost.small", { type: "button", onclick: () => {
      const d = new Date(Date.now() + 7 * 864e5);
      items.push({ id: hex6(), k: "count", name: Kit.t("builder.tc.countdown"), mix: "d", col: TC_COLORS[1], at: `${d.toISOString().slice(0, 10)}T09:00` }); changed(); } }, Kit.t("builder.tc.addCount")));
    // (v3.0.4) the PIN lock-down: +1 min, Pause, Resume, Stop ask for the panel PIN; the presets too when not "free"
    out.push(tipRow(Kit.t("builder.tc.pin"), Kit.t("builder.tc.pinTip"), Kit.sw(o.pin === true, (v) => { if (v) o.pin = true; else { delete o.pin; delete o.pinFree; } changed(); }, Kit.t("builder.tc.pin"))));
    if (o.pin === true) out.push(row(Kit.t("builder.tc.pinFree"), Kit.sw(o.pinFree !== false, (v) => { if (v) delete o.pinFree; else o.pinFree = false; changed(); }, Kit.t("builder.tc.pinFree"))));
    if (own) out.push(el("h4.bld-sub", {}, Kit.t("builder.tc.ownPresets")), el("small.muted", {}, Kit.t("builder.tc.ownPresetsNote", { list: own.map((p) => p.name).join(", ") })),
      el("button.ghost.small", { type: "button", onclick: () => { delete o.presets; for (const it of items) if (it.k === "timer") it.preset = presets[0] && presets[0].id; changed(); } }, Kit.t("builder.tc.useHouse")));
    out.push(el("h4.bld-sub", {}, Kit.t("builder.tc.presets")));
    if (!h) return [...out, el("small.muted", {}, Kit.t("builder.house.loading"))];
    const list = presets.map((p) => ({ ...p })), put = () => saveHouse("timers", { presets: list });
    out.push(...list.map((p, n) => el("div.bld-row", {},
      el("input", { type: "text", value: p.name, maxlength: "24", "aria-label": Kit.t("builder.f.name"), onchange: (e) => { if (e.target.value.trim()) { p.name = e.target.value.trim(); put(); } } }),
      el("input", { type: "number", min: "1", max: "10080", value: String(Math.round(p.sec / 60)), "aria-label": Kit.t("builder.tc.minutes"), style: "width:72px",
        onchange: (e) => { const m = Math.round(+e.target.value); if (m >= 1 && m <= 10080) { p.sec = m * 60; put(); } } }),
      el("label.bld-chk", { title: Kit.t("builder.tc.asButton") }, el("input", { type: "checkbox", checked: p.btn !== false, onchange: (e) => { p.btn = e.target.checked; put(); } }), Kit.t("builder.tc.button")),
      list.length > 1 ? el("button.ghost.small", { type: "button", "aria-label": Kit.t("builder.pal.remove"), onclick: () => { list.splice(n, 1); put(); } }, "✕") : null)),
    list.length < 12 ? el("button.ghost.small", { type: "button", onclick: () => { list.push({ name: Kit.t("builder.tc.newPreset"), sec: 600, btn: true }); put(); } }, Kit.t("builder.tc.addPreset")) : null,
    el("small.muted", {}, Kit.t("builder.tc.presetsNote")), el("small.muted", {}, Kit.t("builder.tc.hubNote")));
    return out;
  }
  function tcRows(it, presets) {
    const put = () => changed();
    const mix = String(it.mix || (it.k === "count" ? "d" : "hms"));
    const sw = el("i.dve-colsw", { style: `background:${it.col || TC_COLORS[0]}` });
    const cb = el("button.ghost.small.dve-colbtn", { type: "button", "aria-haspopup": "dialog", onclick: () => DE().pickColor(cb, it.col || null, (v) => {
      if (v) it.col = v; else delete it.col; sw.style.background = v || ""; changed(false, `tccol:${it.id}`);
    }, TC_COLORS.map((c) => [c, c]), () => side()) }, sw, el("span", {}, it.col || TC_COLORS[0]));
    const rows = [
      el("small.muted", {}, Kit.t(it.k === "count" ? "builder.tc.isCount" : "builder.tc.isTimer")),
      row(Kit.t("builder.f.name"), el("input", { type: "text", value: it.name || "", maxlength: "24", onchange: (e) => { it.name = e.target.value.trim() || Kit.t(it.k === "count" ? "builder.tc.countdown" : "builder.tc.timer"); put(); } })),
    ];
    if (it.k === "count") rows.push(row(Kit.t("builder.tc.countsTo"), el("input", { type: "datetime-local", value: it.at || "", onchange: (e) => { if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(e.target.value)) { it.at = e.target.value; put(); } } })),
      row(Kit.t("builder.f.icon"), iconPick(it.icon, (v) => { if (v) it.icon = v; else delete it.icon; put(); }, Kit.t("builder.tc.calendar"))));
    else rows.push(row(Kit.t("builder.tc.preset"), el("select", { onchange: (e) => { it.preset = e.target.value; put(); } }, optList(presets.map((p) => [p.id, `${p.name} · ${Math.round(p.sec / 60)} min`]), it.preset))));
    rows.push(row(Kit.t("builder.tc.display"), chips([["d", Kit.t("builder.tc.mix.d")], ["h", "HH"], ["m", "MM"], ["s", "SS"]], (u) => mix.includes(u),   // i18n-ok (the clock's parts)
      (u) => { const m = new Set(mix); if (m.has(u) && m.size > 1) m.delete(u); else m.add(u); it.mix = "dhms".split("").filter((x) => m.has(x)).join(""); put(); })),
      row(Kit.t("builder.tc.color"), cb));
    if (it.k === "timer") {
      rows.push(row(Kit.t("builder.tc.sound"), el("select", { onchange: (e) => { it.snd = e.target.value; if (it.snd !== "speak") delete it.say; put(); } },
        optList([["chime", Kit.t("builder.tc.snd.chime")], ["speak", Kit.t("builder.tc.snd.speak")], ["none", Kit.t("builder.tc.snd.none")]], it.snd || "chime"))),
        it.snd === "speak" || (it.speakers || []).length ? row(Kit.t("builder.tc.words"), el("input", { type: "text", value: it.say || "", maxlength: "80", placeholder: Kit.t("builder.tc.wordsPh", { name: it.name || "" }), onchange: (e) => { const v = e.target.value.trim(); if (v) it.say = v; else delete it.say; put(); } })) : null,
        row(Kit.t("builder.tc.dismiss"), el("input", { type: "number", min: "3", max: "120", value: String(it.dismiss || 15), style: "width:72px", onchange: (e) => { const v = Math.round(+e.target.value); if (v >= 3 && v <= 120) { it.dismiss = v; put(); } } })));
      // (v3.0.4) lights that flash on "Timer up" (none by default; up to 4 — lights only)
      const lights = Array.isArray(it.lights) ? it.lights : [], setL = (l) => { if (l.length) it.lights = l; else delete it.lights; put(); };
      [...lights, ...(lights.length < 4 ? [null] : [])].forEach((id, n) => rows.push(tipRow(n ? "" : Kit.t("builder.tc.lights"), Kit.t("builder.tc.lightsTip"),
        devSelect(id, (v) => { const l = lights.slice(); if (v) l[n] = v; else l.splice(n, 1); setL([...new Set(l.filter(Boolean))]); }, Kit.t(id == null ? "builder.tc.addLight" : "builder.tc.noLight"),
          { only: (d) => d.kind === "light", firstLabel: Kit.t("builder.dev.lights") }))));
      // (v3.0.4) house speakers that say the words on "Timer up" (none by default; up to 3 — only a Hubitat speaker with
      // "speak"; the service sends it, not this panel); a volume only when one of them has setVolume (else left alone)
      const spk = Array.isArray(it.speakers) ? it.speakers : [], setS = (l) => { if (l.length) it.speakers = l; else { delete it.speakers; delete it.spkVol; } put(); };
      [...spk, ...(spk.length < 3 ? [null] : [])].forEach((id, n) => rows.push(tipRow(n ? "" : Kit.t("builder.tc.speakers"), Kit.t("builder.tc.speakersTip"),
        devSelect(id, (v) => { const l = spk.slice(); if (v) l[n] = v; else l.splice(n, 1); setS([...new Set(l.filter(Boolean))]); }, Kit.t(id == null ? "builder.tc.addSpeaker" : "builder.tc.noLight"),
          { only: (d) => !!rawDev(d.id).speak }))));
      if (spk.some((id) => (rawDev(id).cmds || []).includes("setVolume")))
        rows.push(tipRow(Kit.t("builder.tc.spkVol"), Kit.t("builder.tc.spkVolTip"), el("select", { onchange: (e) => { if (e.target.value) it.spkVol = +e.target.value; else delete it.spkVol; put(); } },
          optList([["", Kit.t("builder.tc.spkVolKeep")], ...[20, 30, 40, 50, 60, 70, 80, 100].map((v) => [String(v), `${v}%`])], it.spkVol ? String(it.spkVol) : ""))));
      const others = (st.ctx.panels || []).filter((p) => p.id !== st.ctx.panel.id);
      if (others.length) {
        rows.push(el("small.muted", {}, Kit.t("builder.tc.livesNote", { panel: st.ctx.panel.name || st.ctx.panel.id })));
        for (const p of others) rows.push(row(p.name || p.id, el("select", { onchange: (e) => { const l = { ...(it.links || {}) }; if (e.target.value) l[p.id] = e.target.value; else delete l[p.id];
          if (Object.keys(l).length) it.links = l; else delete it.links; put(); } },
          optList([["", Kit.t("builder.tc.link.none")], ["notify", Kit.t("builder.tc.link.notify")], ["linked", Kit.t("builder.tc.link.linked")]], (it.links || {})[p.id] || ""))));
        rows.push(el("small.muted", {}, Kit.t("builder.tc.linkNote")));
      }
    }
    return rows;
  }

  // the devices on a "Devices" card: each with its icon and name (or the device's own), in order
  // (v3.0.4: the old Devices card, kept so one still opens — the new one's editor is dvCard / dvItem below)
  function groupEditor(c, set) {
    const o = c.o, items = Array.isArray(o.items) ? o.items : (o.items = []), nk = "title", max = 12;
    const put = () => set("items", items);
    const rows = items.map((it, n) => el("div.bld-gitem", {},
      el("div.bld-row", {}, devSelect(it.id ?? null, (v) => { if (v) { it.id = v; put(); } }),
        el("button.ghost.small", { type: "button", disabled: n === 0, "aria-label": Kit.t("builder.wx.up"), onclick: () => { items.splice(n - 1, 0, items.splice(n, 1)[0]); put(); } }, "▲"),
        el("button.ghost.small", { type: "button", disabled: n === items.length - 1, "aria-label": Kit.t("builder.wx.down"), onclick: () => { items.splice(n + 1, 0, items.splice(n, 1)[0]); put(); } }, "▼"),
        el("button.ghost.small", { type: "button", "aria-label": Kit.t("builder.pal.remove"), onclick: () => { items.splice(n, 1); put(); } }, "✕")),
      el("div.bld-row", {}, iconPick(it.icon, (v) => { if (v) it.icon = v; else delete it.icon; put(); }),
        el("input", { type: "text", value: it[nk] || "", maxlength: "40", placeholder: devName(it.id) || Kit.t("builder.f.name"), onchange: (e) => { const v = e.target.value.trim(); if (v) it[nk] = v; else delete it[nk]; put(); } })),
      !it.id ? null : (() => {   // this device's own press-and-hold wheel
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
      items.length < max ? el("div.bld-row", {}, devSelect(null, (v) => { pick = v; }, Kit.t("builder.group.addDevice")),
        el("button.ghost.small", { type: "button", onclick: () => { if (!pick) return toast(Kit.t("builder.text.pickDevFirst"), true); items.push({ id: pick }); put(); } }, Kit.t("builder.group.add"))) : el("small.muted", {}, Kit.t("builder.group.max")),
      row(Kit.t("builder.look.title"), seg([["list", Kit.t("builder.todo.list")], ["tiles", Kit.t("builder.roomdevs.tiles")]], o.look || "list", (v) => set("look", v === "list" ? null : v))),
      el("small.muted", {}, Kit.t("builder.group.note")),
    ];
  }


  // ---------- (v3.0.4) a Devices card: its look, its items, one item's settings (the parts: devedit.js) ----------
  // In the card's settings: the look (List · Tiles · Freeform · One big item), Tiles' columns, the items (a grip to
  // drag, or ▲ ▼), + a device / + a button. A click on an item (or a double-click on the card) opens the card on the
  // screen, as a blank card's: an item is picked there — Freeform: moved anywhere and resized from any edge or corner
  // (no grid, no marks: the cursor says which), Tiles: its span from its right / bottom edge, List / Tiles: dragged to its
  // place (a drop line). The picked item's settings: a live preview on top (a click shows it on / off — here only), then
  // four tabs: Device (which, what kind of item, what it shows) · Actions (a press, a hold, a double-tap: the device's own
  // commands, never another device — that's "Something else…") · Look (icon, motion, background, color when on, sizes,
  // text position, its place) · Advanced (a value's unit and range, a plug's running watts, the old card's look, remove).
  const DE = () => window.DevEdit;
  const DV_LOOKS = ["list", "tiles", "free", "single"], DV_KS = ["value", "switch", "button", "lock", "fan", "scene"];
  const dvLook = (o) => (DV_LOOKS.includes(o.look) ? o.look : "list");
  const dvDev = (id) => (id == null ? null : devices().find((d) => d.id === id) || null);
  const dvOwn = (it) => { const d = dvDev(it.id); return d ? DE().choices(d, wheelChoices(d.id)) : []; };
  const dvName = (it) => it.label || (it.id != null ? devName(it.id) : "") || Kit.t(it.k === "scene" ? "builder.dve.scene" : it.k === "button" ? "builder.dve.button" : "builder.dve.item");
  const dvPic = (it) => it.icon || (dvDev(it.id) ? DE().kindIcon(dvDev(it.id).kind) : it.k === "scene" ? "sparkles" : "power");
  const dvTodo = (it) => (it.id == null && !(["scene", "button"].includes(it.k) && it.tap) ? Kit.t("builder.dve.needDevice") : "");
  // the panel draws again after a change (post): the boxes over it follow once it has
  const dvRedraw = () => { clearTimeout(st.dvT); st.dvT = setTimeout(() => { if (st && innerCard()) drawInner(); }, 90); };
  function dvOpen(c, n) {
    if (!st.inner || st.inner.id !== c.i) return enterInner(c, n);
    st.inner.sel = n; drawInner(); side();
  }
  function dvMove(c, from, to) {
    if (!DE().move(c.o.items, from, to)) return;
    if (st.inner && st.inner.id === c.i && st.inner.sel === from) st.inner.sel = to;
    changed(); dvRedraw();
  }
  function dvAdd(c, it) {
    const items = c.o.items || (c.o.items = []);
    if (items.length >= 24) return toast(Kit.t("builder.devices.max"), true);
    items.push(it);
    if (dvLook(c.o) === "free") DE().autoPlace(items);
    st.dvTab = "device";
    changed(false); dvOpen(c, items.length - 1);
  }
  function dvRemove(c, n) {
    c.o.items.splice(n, 1);
    st.inner.sel = null; changed(); dvRedraw();
  }
  // the device box: a combobox — its search is the list's first row (devedit.js pickDevice)
  function dvDevButton(cur, pick, empty = Kit.t("builder.dve.pickDevice")) {
    const d = dvDev(cur);
    const b = el("button.dve-cbx" + (d ? "" : ".none"), { type: "button", "aria-haspopup": "dialog", onclick: () => {
      const every = devices().filter((x) => !noiseDev(x) || x.id === cur), main = every.filter((x) => !helperDev(x) || x.id === cur);
      DE().pickDevice(b, main, cur, pick, every.filter((x) => !main.includes(x)));
    } },
      el("span.dve-ci", {}, iconEl(d ? DE().kindIcon(d.kind) : "search", 18)),
      el("span.dve-ct", {}, el("b", {}, d ? d.label : empty), el("small", {}, d ? [d.room, DE().kindName(d.kind)].filter(Boolean).join(" · ") : Kit.t("builder.dve.typeToSearch"))),
      el("span.dve-chev", { "aria-hidden": "true" }, "▾"));
    return b;
  }
  // the card's own settings (in the inspector, and over the items while the card is open)
  function dvCard(c, set) {
    const o = c.o, items = Array.isArray(o.items) ? o.items : (o.items = []), look = dvLook(o);
    const out = [row(Kit.t("builder.look.title"), seg([["list", Kit.t("builder.todo.list")], ["tiles", Kit.t("builder.roomdevs.tiles")], ["free", Kit.t("builder.devices.free")], ["single", Kit.t("builder.devices.single")]],
      look, (v) => { if (v === "free") DE().autoPlace(items); set("look", v); dvRedraw(); }))];
    if (look === "tiles") out.push(row(Kit.t("builder.dve.cols"), el("select", { onchange: (e) => set("cols", e.target.value ? +e.target.value : null) },
      optList([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, String(n)]), o.cols, Kit.t("builder.f.automatic")))));
    // a card moved over from an old type keeps that card's look ("st") until "Use the new look" — one Undo takes it back
    if (items.some((it) => it.st)) out.push(el("div.dve-old", {}, el("small.muted", {}, Kit.t("builder.dve.oldLook")),
      el("button.ghost.small", { type: "button", onclick: () => { items.forEach((it) => delete it.st); st.dvUndo = c.i; set("items", items); dvRedraw(); toast(Kit.t("builder.dve.newLookDone")); } }, Kit.t("builder.dve.newLook"))));
    else if (st.dvUndo === c.i) out.push(el("div.dve-old", {}, el("small.muted", {}, Kit.t("builder.dve.newLookDone")),
      el("button.ghost.small", { type: "button", onclick: () => { st.dvUndo = null; undoRedo(true); } }, Kit.t("builder.dve.undo"))));
    const cur = st.inner && st.inner.id === c.i ? st.inner.sel : null;
    const list = el("div.dve-items", {}, items.map((it, n) => el("div.dve-li" + (cur === n ? ".cur" : ""), {},
      Kit.reorder ? Kit.reorder.grip(n, dvName(it)) : null,
      el("button.ghost.small.dve-lib", { type: "button", "aria-current": cur === n ? "true" : null, onclick: () => dvOpen(c, n) }, picEl(dvPic(it), 16), el("span", {}, dvName(it)), dvTodo(it) ? el("b.bk-todo", { title: dvTodo(it) }, "!") : null),
      el("button.ghost.small", { type: "button", disabled: n === 0, "aria-label": Kit.t("builder.wx.up"), onclick: () => dvMove(c, n, n - 1) }, "▲"),
      el("button.ghost.small", { type: "button", disabled: n === items.length - 1, "aria-label": Kit.t("builder.wx.down"), onclick: () => dvMove(c, n, n + 1) }, "▼"))));
    if (Kit.reorder) Kit.reorder.list(list, `dv-${c.i}`, { name: (k) => dvName(items[k]), move: (a, b) => dvMove(c, a, b) });
    out.push(list, items.length < 24 ? el("div.bld-row.dve-add", {}, dvDevButton(null, (id) => dvAdd(c, { id }), Kit.t("builder.group.addDevice")),
      el("button.ghost.small", { type: "button", title: Kit.t("builder.dve.addButtonTip"), onclick: () => dvAdd(c, { k: "button" }) }, Kit.t("builder.dve.addButton"))) : el("small.muted", {}, Kit.t("builder.devices.max")),
      el("small.muted", {}, Kit.t(items.length ? "builder.dve.clickItem" : "builder.devices.note")));
    return out;
  }
  // the right side while the card is open: Done, the card's settings, the picked item's
  function dvSide(c) {
    const items = c.o.items || [], n = st.inner.sel, it = n != null ? items[n] : null;
    const set = (k, v) => { if (v == null || v === "") delete c.o[k]; else c.o[k] = v; changed(); };
    return el("div.card.bld-insp.bk-insp.dve", {},
      el("div.bld-head", {}, picEl("grid", 22), el("h3", {}, c.o.title || Kit.t("builder.type.devices.name")),
        el("button.primary.small.bk-done", { type: "button", title: Kit.t("builder.inner.doneTip"), onclick: leaveInner }, Kit.t("builder.top.done")),
        el("small.muted", {}, Kit.t(`builder.dve.help.${dvLook(c.o)}`))),
      ...dvCard(c, set),
      it ? dvItem(c, it, n) : null);
  }

  // ---------- one item: the live preview, then the four tabs ----------
  const DV_TABS = [["device", "builder.dve.tab.device"], ["actions", "builder.dve.tab.actions"], ["look", "builder.dve.tab.look"], ["adv", "builder.dve.tab.adv"]];
  // (v3.0.5: lookOver "piece" — a blank card's device piece: its place is the piece's, its look has the icon background)
  function dvItem(c, it, n, lookOver = null) {
    const d = dvDev(it.id), raw = it.id != null ? rawDev(it.id) : {}, own = dvOwn(it), look = lookOver || dvLook(c.o);
    const put = (redraw = true, merge = null) => { changed(redraw, merge); dvRedraw(); };
    const setv = (k, v, redraw = true, merge = null) => { if (v == null || v === "" || (Array.isArray(v) && !v.length)) delete it[k]; else it[k] = v; put(redraw, merge); };
    const tab = DV_TABS.some(([k]) => k === st.dvTab) ? st.dvTab : "device";
    const go = (k) => { st.dvTab = k; side(); const b = document.getElementById(`dve-t-${k}`); if (b) b.focus(); };
    const tabs = el("div.dve-tabs", { role: "tablist", "aria-label": Kit.t("builder.dve.itemSettings") }, DV_TABS.map(([k, w], i) => el("button" + (k === tab ? ".cur" : ""), {
      type: "button", role: "tab", id: `dve-t-${k}`, "aria-selected": String(k === tab), "aria-controls": "dve-panel", tabindex: k === tab ? "0" : "-1", onclick: () => go(k),
      onkeydown: (e) => { const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: DV_TABS.length - 1 }[e.key]; if (j != null) { e.preventDefault(); go(DV_TABS[(j + DV_TABS.length) % DV_TABS.length][0]); } } }, Kit.t(w))));
    const x = { d, raw, own, look, put, setv };
    const body = { device: dvTabDevice, actions: dvTabActions, look: dvTabLook, adv: dvTabAdv }[tab](c, it, n, x);
    return el("div.dve-ed", {}, look === "piece" ? null : el("b.bk-h", {}, Kit.t("builder.dve.itemN", { n: n + 1, name: dvName(it) })), dvPreview(c, it, n, x), tabs,
      el("div.dve-panel", { role: "tabpanel", id: "dve-panel", "aria-labelledby": `dve-t-${tab}` }, ...body.filter(Boolean)));
  }
  // what it shows now, from the hub's last values (the preview only)
  function dvWords(it, d, raw, on) {
    const a = raw.attrs || {}, out = [];
    for (const k of it.show && it.show.length ? it.show : ["state"]) {
      if (k === "state") out.push(d && DE().isLock(d, raw) ? Kit.t(a.lock === "unlocked" ? "builder.dve.unlocked" : "builder.dve.locked") : d && (DE().canSwitch(d, raw) || it.tap) ? Kit.t(on ? "builder.wheel.on" : "builder.wheel.off") : "");
      else if (a[k] != null && a[k] !== "") out.push(`${a[k]}${it.unit ? ` ${it.unit}` : ""}`);
    }
    return out.filter(Boolean).join(" · ");
  }
  function dvPreview(c, it, n, { d, raw, look }) {
    const key = `${c.i}:${n}`, a = raw.attrs || {}, real = a.switch === "on" || a.lock === "unlocked" || (/purifier/.test((d || {}).kind || "") && /^(FAN|AUTO)$/i.test(String(a.fanState || a.fanMode || "")));
    const on = st.dvPv && st.dvPv.k === key ? st.dvPv.on : real;
    const pic = dvPic(it), sz = Math.round((30 * (it.iz || 100)) / 100), mot = it.motion && window.Motion && !/^(art|up):/.test(pic) ? Motion.pick(it.motion, pic, (d || {}).kind) : "";
    const icx = mot ? (() => { const s = el("span"); s.innerHTML = Motion.wrap(icon(pic, Math.round(sz * 0.8)), mot, on, Math.round(sz * 0.8)); return s; })() : picEl(pic, sz);
    const tp = it.tp || (look === "list" ? "right" : "bottom"), words = dvWords(it, d, raw, on);
    // (v3.0.5) a device piece: drawn as the panel draws it (grid.js dvItem bk, theme.css .dv-pc — builder.css mirrors it):
    // the icon background's shape, size, color and transparency, the icon white unless set, the name's color
    let cls = (it.bg === "none" || it.shape === "none" ? ".bg-none" : ""), sty = `${it.col ? `--dc:${it.col};` : ""}--tz:${(it.tz || 100) / 100}`;
    if (look === "piece") {
      const art = /^art:/.test(pic), up = /^up:/.test(pic), disc = Math.round(art || up ? sz * (art ? 1.85 : 1.3) * 1.14 : sz * 1.74);
      const shape = ["rounded", "none"].includes(it.shape) ? it.shape : "circle", icc = it.icc === "auto" ? "" : it.icc || "#ffffff";
      cls = `.dv-pc.sh-${shape}` + (icc ? ".icc" : "");
      sty += `;--disc:${disc}px${it.bc ? `;--dvb:${it.bc}` : ""}${it.ba ? `;--dva:${(100 - it.ba) / 100}` : ""}${icc ? `;--dvi:${icc}` : ""}${it.nc ? `;--dvn:${it.nc}` : ""}`;
    }
    return el("div.dve-pv", {},
      el(`button.dve-pvit.tp-${tp}` + (on ? ".on" : "") + cls, { type: "button", title: Kit.t("builder.dve.previewTip"), "aria-pressed": String(on),
        style: sty, onclick: () => { st.dvPv = { k: key, on: !on }; side(); } },
        el("span.dve-pvic", {}, icx), el("span.dve-pvtx", {}, el("b", {}, dvName(it)), words ? el("small", {}, words) : null)),
      el("small.muted", {}, Kit.t("builder.dve.previewNote")));
  }

  // Device: which device (a button may have none), what kind of item, what it shows
  function dvTabDevice(c, it, n, { d, raw, setv, put }) {
    const out = [row(Kit.t("builder.f.device"), dvDevButton(it.id ?? null, (id) => {
      const was = it.id;
      it.id = id;
      // (its own actions were the old device's: gone with it; what it shows too)
      for (const k of ["tap", "hold", "dbl"]) if (it[k] && it[k].id === was) delete it[k];
      delete it.wheel; delete it.show;
      put();
    }))];
    if (it.id == null) out.push(el("small.muted", {}, Kit.t(["scene", "button"].includes(it.k) ? "builder.dve.buttonOnly" : "builder.dve.needDevice")));
    const autoK = !d ? "button" : DE().isLock(d, raw) ? "lock" : /fan|purifier/.test(d.kind) ? "fan" : DE().canSwitch(d, raw) ? "switch" : "value";
    out.push(row(Kit.t("builder.dve.kindItem"), el("div.dve-chips", { role: "radiogroup", "aria-label": Kit.t("builder.dve.kindItem") },
      [["", Kit.t("builder.dve.kindAuto", { kind: Kit.t(`builder.dve.k.${autoK}`) })], ...DV_KS.map((k) => [k, Kit.t(`builder.dve.k.${k}`)])].map(([k, w]) =>
        el("button.chip" + ((it.k || "") === k ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String((it.k || "") === k), onclick: () => setv("k", k || null) }, w)))));
    if (d) {   // what it shows: its state and up to 3 more of its values (or 4 values)
      const a = raw.attrs || {}, shown = it.show && it.show.length ? it.show : ["state"];
      const keys = ["state", ...Object.keys(a).filter((k) => !SKIP_AT.test(k) && typeof a[k] !== "object").sort()];
      out.push(el("b.bk-h", {}, Kit.t("builder.dve.shows")), el("div.dve-ticks", { role: "group", "aria-label": Kit.t("builder.dve.shows") }, keys.map((k) => el("label.dve-tk", {},
        el("input", { type: "checkbox", checked: shown.includes(k), disabled: !shown.includes(k) && shown.length >= 4,
          onchange: (e) => { const nx = e.target.checked ? [...shown, k] : shown.filter((x) => x !== k); setv("show", nx.length === 1 && nx[0] === "state" ? null : nx); } }),
        el("span", {}, k === "state" ? Kit.t("builder.dve.state") : spotPlain(k)), k !== "state" && a[k] != null ? el("small.muted", {}, String(a[k]).slice(0, 18)) : null))),
        el("small.muted", {}, Kit.t("builder.dve.showsNote")));
    }
    return out;
  }
  // Actions: a press, a hold, a double-tap — from the device's own commands (devedit.js choices); "Something else…"
  // opens the old editor (another device, a room, a page, a camera), its device the item's own to start with
  function dvTabActions(c, it, n, { d, raw, own, put }) {
    if (!d) return [actionEditor(it, "tap", Kit.t("builder.dve.pressDoes")), el("small.muted", {}, Kit.t("builder.dve.buttonNote"))];
    const other = (k) => st.dvOther === `${c.i}:${n}:${k}`;
    const setAct = (k, key) => {
      st.dvOther = null;
      if (key === "other") { st.dvOther = `${c.i}:${n}:${k}`; return side(); }
      if (key === "auto") delete it[k]; else if (key === "none") it[k] = { do: "none" };
      else { const ch = own.find((x) => x.key === key); if (ch) it[k] = DE().plain(ch.a); }
      put();
    };
    const pick = (label, opts, cur, onpick) => row(label, el("select", { "aria-label": label, onchange: (e) => onpick(e.target.value) }, optList(opts, cur)));
    const out = [];
    const pk = other("tap") ? "other" : DE().actKey(it.tap, it, own);
    out.push(pick(Kit.t("builder.dve.pressDoes"), DE().pressOpts(it, d, raw, own), pk, (v) => setAct("tap", v)),
      el("small.muted", {}, pk === "auto" ? Kit.t(`builder.dve.pressWhy.${DE().pressAuto(it, d, raw)}`) : pk === "other" ? Kit.t("builder.dve.otherNote") : Kit.t("builder.dve.ownCmds")));
    if (pk === "other") out.push(actionEditor(it, "tap", Kit.t("builder.dve.otherDoes"), it.id));
    // the hold: Automatic, nothing, a fly-out (tick which of its options show), one of its commands, something else
    const hk = other("hold") ? "other" : DE().holdKey(it, own);
    out.push(pick(Kit.t("builder.dve.holdDoes"), [...DE().holdOpts(own), ["other", Kit.t("builder.dve.other")]], hk, (v) => {
      if (v === "fly") { delete it.hold; st.dvOther = null; it.wheel = DE().flyList(own, DE().flyDefault(d, own)); return put(); }
      delete it.wheel; setAct("hold", v);
    }));
    if (hk === "fly") {
      const keys = DE().flyKeys(it, own), put2 = (ks) => { const w = DE().flyList(own, ks); if (w.length) it.wheel = w; else delete it.wheel; put(); };
      out.push(el("small.muted", {}, Kit.t("builder.dve.flyCount", { n: keys.length, max: DE().FLY_MAX })),
        el("div.dve-ticks.dve-fly", { role: "group", "aria-label": Kit.t("builder.dve.flyShow") }, own.map((ch) => el("label.dve-tk", {},
          el("input", { type: "checkbox", checked: keys.includes(ch.key), disabled: !keys.includes(ch.key) && keys.length >= DE().FLY_MAX,
            onchange: (e) => put2(e.target.checked ? [...keys, ch.key] : keys.filter((k) => k !== ch.key)) }),
          ch.col ? el("i.bld-sw", { style: `background:${ch.col}` }) : iconEl(ch.icon || "power", 14), el("span", {}, ch.label)))),
        el("div.bld-row.dve-mini", {}, el("button.ghost.small", { type: "button", onclick: () => put2(own.slice(0, DE().FLY_MAX).map((x) => x.key)) }, Kit.t("builder.dve.tickFirst", { n: DE().FLY_MAX })),
          DE().isPurifier(d) ? el("button.ghost.small", { type: "button", onclick: () => put2(DE().flyDefault(d, own)) }, Kit.t("builder.dve.flyEven")) : null,
          el("button.ghost.small", { type: "button", onclick: () => put2([]) }, Kit.t("builder.dve.clear"))));
    } else out.push(el("small.muted", {}, Kit.t(hk === "auto" ? "builder.dve.holdAutoNote" : hk === "other" ? "builder.dve.otherNote" : hk === "none" ? "builder.dve.holdNoneNote" : "builder.dve.ownCmds")));
    if (hk === "other") out.push(actionEditor(it, "hold", Kit.t("builder.dve.otherDoes"), it.id));
    // a double-tap: nothing (a press is at once), or one of its commands
    const dk = other("dbl") ? "other" : DE().actKey(it.dbl, it, own);
    out.push(pick(Kit.t("builder.dve.dblDoes"), DE().dblOpts(own), dk === "none" ? "auto" : dk, (v) => setAct("dbl", v)), el("small.muted", {}, Kit.t("builder.dve.dblNote")));
    if (dk === "other") out.push(actionEditor(it, "dbl", Kit.t("builder.dve.otherDoes"), it.id));
    return out;
  }
  // every icon to pick from: the line icons, the animated ones and the drawings (iconItems), the owner's pictures
  const dvIcons = () => [...iconItems(true), ...(st.pics || []).filter((p) => p.style !== "background").map((p) => ({ v: "up:" + p.id, name: p.name, group: "pics", cat: "", anim: false }))];
  // Look: its name, icon (any icon can move: its motion, only while it's on), background, color when on, icon and text
  // size, where the words sit, its place on the card
  function dvTabLook(c, it, n, { d, look, setv, put }) {
    const out = [row(Kit.t("builder.f.name"), el("input", { type: "text", value: it.label || "", maxlength: "40", placeholder: (it.id != null && devName(it.id)) || Kit.t("builder.f.automaticPh"),
      onchange: (e) => setv("label", e.target.value.trim()) }))];
    const ib = el("button.dve-cbx", { type: "button", "aria-haspopup": "dialog", onclick: () => DE().pickIcon(ib, dvIcons(), it.icon || null, (v) => {
      const m = /^mo:([a-z]+):(.+)$/.exec(v || "");
      if (m) { it.icon = m[2]; it.motion = m[1]; }
      else { if (v) it.icon = v; else delete it.icon; if (/^(art|up):/.test(v || "")) delete it.motion; }
      put();
    }, picEl, Kit.t("builder.f.automatic")) },
      el("span.dve-ci", {}, picEl(dvPic(it), 22)), el("span.dve-ct", {}, el("b", {}, it.icon ? picName(it.icon) : Kit.t("builder.f.automatic")), el("small", {}, Kit.t("builder.dve.iconChange"))),
      el("span.dve-chev", { "aria-hidden": "true" }, "▾"));
    out.push(row(Kit.t("builder.dve.icon"), ib));
    if (!/^(art|up):/.test(it.icon || "") && window.Motion) out.push(row(Kit.t("builder.dve.motion"), el("select", { "aria-label": Kit.t("builder.dve.motion"), onchange: (e) => setv("motion", e.target.value || null) },
      optList([["auto", Kit.t("builder.f.automatic")], ...Motion.MOTIONS], it.motion, Kit.t("builder.dve.still")))), el("small.muted", {}, Kit.t("builder.dve.motionNote")));
    if (look === "piece") out.push(...dvPieceLook(c, it, n, setv));   // (v3.0.5: the icon background's shape, transparency, colors)
    else out.push(row(Kit.t("builder.dve.background"), seg([["round", Kit.t("builder.dve.round")], ["none", Kit.t("builder.dve.none")]], it.bg === "none" ? "none" : "round", (v) => setv("bg", v === "none" ? "none" : null))),
      el("small.muted", {}, Kit.t(it.bg === "none" ? "builder.dve.bgNoneNote" : "builder.dve.bgRoundNote")));
    // color when on: Automatic, or any color (the full picker: hue, saturation, brightness, a hex code)
    const sw = el("i.dve-colsw", { style: it.col ? `background:${it.col}` : "" }), sl = el("span", {}, it.col || Kit.t("builder.dve.colorAutoShort"));
    const cb = el("button.ghost.small.dve-colbtn", { type: "button", "aria-haspopup": "dialog", onclick: () => DE().pickColor(cb, it.col || null, (v) => {
      if (v) it.col = v; else delete it.col;
      sw.style.background = v || ""; sl.textContent = v || Kit.t("builder.dve.colorAutoShort");
      changed(false, `dvcol:${c.i}:${n}`);
    }, COLORS.map(([name, , , hex]) => [name, hex]), () => side()) }, sw, sl);
    out.push(row(Kit.t("builder.dve.colorOn"), cb));
    const slide = (label, k) => {
      const v = it[k] || 100, l = el("span.bld-l", {}, Kit.t("builder.dve.pct", { label, n: v }));
      return el("div.bld-row", {}, l, el("input", { type: "range", min: "50", max: "250", step: "5", value: String(v), "aria-label": label,
        oninput: (e) => { const nv = +e.target.value; if (nv === 100) delete it[k]; else it[k] = nv; l.textContent = Kit.t("builder.dve.pct", { label, n: nv }); changed(false, `dv${k}:${c.i}:${n}`); dvRedraw(); },
        onchange: () => side() }));
    };
    out.push(slide(Kit.t("builder.dve.iconSize"), "iz"), slide(Kit.t("builder.dve.textSize"), "tz"));
    const tp = it.tp || (look === "list" ? "right" : "bottom");
    out.push(row(Kit.t("builder.dve.textPos"), seg([["top", Kit.t("builder.dve.top")], ["bottom", Kit.t("builder.dve.bottom")], ["left", Kit.t("builder.dve.left")], ["right", Kit.t("builder.dve.right")]], tp, (v) => setv("tp", v))));
    // its place: Freeform's X / Y / W / H (in % of the card; they follow a drag), Tiles' span, else the look places it
    if (look === "free") {
      if (!DE().placed(it)) DE().autoPlace(c.o.items);
      const num = (k) => el("label.dve-num", {}, el("span", {}, Kit.t(`builder.dve.${k}`)), el("input", { type: "number", min: "0", max: "100", step: "0.5", value: String(it[k] / 10), "data-k": k, "aria-label": Kit.t(`builder.dve.${k}Long`),
        onchange: (e) => { const v = parseFloat(e.target.value); if (!Number.isFinite(v)) return side(); Object.assign(it, DE().fixRect({ ...it, [k]: v * 10 })); put(); } }));
      out.push(el("b.bk-h", {}, Kit.t("builder.dve.place")), el("div.dve-xywh", {}, num("x"), num("y"), num("w"), num("h")), el("small.muted", {}, Kit.t("builder.dve.placeNote")));
    } else if (look === "tiles") {
      const span = (k, label) => el("label.dve-num", {}, el("span", {}, label), el("select", { onchange: (e) => setv(k, +e.target.value > 1 ? +e.target.value : null) }, optList([1, 2, 3, 4].map((v) => [v, String(v)]), it[k] || 1)));
      out.push(el("b.bk-h", {}, Kit.t("builder.dve.span")), el("div.dve-xywh", {}, span("sw", Kit.t("builder.dve.spanW")), span("sh", Kit.t("builder.dve.spanH"))), el("small.muted", {}, Kit.t("builder.dve.spanNote")));
    } else if (look !== "piece") out.push(el("small.muted", {}, Kit.t(look === "single" ? "builder.dve.placeSingle" : "builder.dve.placeList")));
    return out;
  }
  // (v3.0.5) a color button: its swatch and hex (or Automatic), the full picker on a click (devedit.js pickColor)
  function colorBtn(cur, autoLabel, onPick, onClose) {
    const sw = el("i.dve-colsw", { style: cur ? `background:${cur}` : "" }), sl = el("span", {}, cur || autoLabel);
    const b = el("button.ghost.small.dve-colbtn", { type: "button", "aria-haspopup": "dialog", onclick: () => DE().pickColor(b, cur || null, (v) => {
      cur = v || null; sw.style.background = v || ""; sl.textContent = v || autoLabel; onPick(v || null);
    }, COLORS.map(([name, , , hex]) => [name, hex]), onClose) }, sw, sl);
    return b;
  }
  // (v3.0.5) a device piece's Look: the icon background — Circle / Rounded square / None — its transparency and color
  // (sized to the larger side of the drawing, centered; no square behind it), the icon's color (white by default;
  // Automatic: gray when off, as before) and the name's color
  function dvPieceLook(c, it, n, setv) {
    const shape = ["rounded", "none"].includes(it.shape) ? it.shape : "circle";
    const out = [row(Kit.t("builder.dve.background"), seg([["circle", Kit.t("builder.dve.circle")], ["rounded", Kit.t("builder.dve.rounded")], ["none", Kit.t("builder.dve.none")]], shape,
      (v) => setv("shape", v === "circle" ? null : v))), el("small.muted", {}, Kit.t(shape === "none" ? "builder.dve.bgNoneNote" : "builder.dve.shapeNote"))];
    if (shape !== "none") {
      const v = it.ba || 0, l = el("span.bld-l", {}, Kit.t("builder.dve.alpha", { n: v }));
      out.push(el("div.bld-row", {}, l, el("input", { type: "range", min: "0", max: "100", step: "5", value: String(v), "aria-label": Kit.t("builder.dve.alphaAria"),
        oninput: (e) => { const nv = +e.target.value; if (nv) it.ba = nv; else delete it.ba; l.textContent = Kit.t("builder.dve.alpha", { n: nv }); changed(false, `dvba:${c.i}:${n}`); dvRedraw(); },
        onchange: () => side() })),
      row(Kit.t("builder.dve.bgColor"), colorBtn(it.bc, Kit.t("builder.dve.colorAutoShort"), (cv) => { if (cv) it.bc = cv; else delete it.bc; changed(false, `dvbc:${c.i}:${n}`); dvRedraw(); }, () => side())));
    }
    // (the icon: white unless picked; "Automatic" is the old gray-when-off — kept as "auto")
    const icc = it.icc === "auto" ? null : it.icc || "#ffffff";
    out.push(row(Kit.t("builder.dve.iconColor"), colorBtn(icc, Kit.t("builder.dve.iconAuto"), (cv) => { it.icc = cv ? cv : "auto"; if (it.icc === "#ffffff") delete it.icc; changed(false, `dvicc:${c.i}:${n}`); dvRedraw(); }, () => side())),
      el("small.muted", {}, Kit.t("builder.dve.iconColorNote")),
      row(Kit.t("builder.dve.nameColor"), colorBtn(it.nc, Kit.t("builder.dve.colorAutoShort"), (cv) => { if (cv) it.nc = cv; else delete it.nc; changed(false, `dvnc:${c.i}:${n}`); dvRedraw(); }, () => side())),
      el("small.muted", {}, Kit.t("builder.dve.nameColorNote")));
    return out;
  }
  // (v3.0.5) the move dots (as the room bar's grip)
  const gripDots = () => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 10 14"); s.setAttribute("width", "10"); s.setAttribute("height", "14"); s.setAttribute("aria-hidden", "true");
    for (const [x, y] of [[2, 2], [8, 2], [2, 7], [8, 7], [2, 12], [8, 12]]) { const ci = document.createElementNS("http://www.w3.org/2000/svg", "circle"); ci.setAttribute("cx", x); ci.setAttribute("cy", y); ci.setAttribute("r", "1.6"); ci.setAttribute("fill", "currentColor"); s.append(ci); }
    return s; };
  // Advanced: a value's unit, decimals and range; a plug-in appliance's running watts; a garage door's contact; the
  // old card's look; duplicate, remove
  function dvTabAdv(c, it, n, { d, setv, put }) {
    const out = [], numIn = (k, ph) => el("input", { type: "number", value: it[k] ?? "", placeholder: ph || "", onchange: (e) => { const v = e.target.value.trim(); setv(k, v === "" ? null : +v); } });
    out.push(row(Kit.t("builder.f.unit"), el("input", { type: "text", value: it.unit || "", maxlength: "8", placeholder: Kit.t("builder.value.unitPh"), onchange: (e) => setv("unit", e.target.value.trim()) })),
      row(Kit.t("builder.value.decimals"), el("select", { onchange: (e) => setv("dec", e.target.value === "" ? null : +e.target.value) }, optList([[0, "0"], [1, "1"], [2, "2"]], it.dec, Kit.t("builder.f.automatic")))),
      row(Kit.t("builder.dve.min"), numIn("min")), row(Kit.t("builder.dve.max"), numIn("max")));
    if (d && /plug|outlet|switch/.test(d.kind || "") || it.runW) out.push(row(Kit.t("builder.dve.runW"), numIn("runW")), el("small.muted", {}, Kit.t("builder.dve.runWNote")));
    if (d && /garage/.test(d.kind || "") || it.contact) out.push(row(Kit.t("builder.dve.contact"), dvDevButton(it.contact ?? null, (v) => setv("contact", v))), row(Kit.t("builder.dve.travel"), numIn("travel", "15")));
    // (v3.0.4) "Ask before doing it": Yes / Cancel on the panel first; a garage door always asks (and the PIN)
    const gar = !!(d && /garage/.test(d.kind || ""));
    if (d || it.tap) out.push(el("label.dve-tk", {}, el("input", { type: "checkbox", checked: gar || it.ask === true, disabled: gar, onchange: (e) => setv("ask", e.target.checked ? true : null) }),
      el("span", {}, Kit.t("builder.dve.ask"))), el("small.muted", {}, Kit.t(gar ? "builder.dve.askGarage" : "builder.dve.askNote")));
    if (it.st) out.push(el("div.dve-old", {}, el("small.muted", {}, Kit.t("builder.dve.oldItem")),
      el("button.ghost.small", { type: "button", onclick: () => { delete it.st; st.dvUndo = Array.isArray(c.o.items) ? c.i : `${c.i}#${n}`; put(); } }, Kit.t("builder.dve.newLook"))));   // (v3.0.5: a piece — its own key, pieceEditor)
    if (!Array.isArray(c.o.items)) return out;   // (v3.0.5: a blank card's device piece — the piece's own buttons do these)
    out.push(el("div.bld-row.dve-mini", {},
      el("button.ghost.small", { type: "button", disabled: c.o.items.length >= 24, onclick: () => { const cp = structuredClone(it); if (DE().placed(cp)) Object.assign(cp, DE().dragRect(cp, "move", 30, 30)); c.o.items.splice(n + 1, 0, cp); st.inner.sel = n + 1; put(); } }, Kit.t("builder.f.duplicate")),
      el("button.ghost.small.bad", { type: "button", onclick: () => dvRemove(c, n) }, Kit.t("builder.pal.remove"))));
    return out;
  }

  // ---------- the open card on the screen: each item a box over the panel's own (measured in the live panel) ----------
  // Freeform: no grid and no borders — a dashed outline only on the picked one; a press near an edge or a corner resizes
  // (the cursor shows it, there are no marks), anywhere else moves. Tiles: its right / bottom edge spans it over more
  // tiles. List / Tiles: drag it to its place — a drop line shows where.
  function dvMeasure(c) {
    const bx = st.inner && st.inner.box;
    try {
      const doc = $(".bld-frame").contentDocument, card = doc && bx && doc.querySelector(`[data-gi="${CSS.escape(c.i)}"]`), dv = card && card.querySelector(".dv");
      if (!dv) return null;
      const pct = (r) => ({ left: ((r.left - bx.x0) / bx.w0) * 100, top: ((r.top - bx.y0) / bx.h0) * 100, width: (r.width / bx.w0) * 100, height: (r.height / bx.h0) * 100 });
      return { area: pct(dv.getBoundingClientRect()), items: [...dv.querySelectorAll("[data-gitem]")].map((x) => ({ n: +x.dataset.gitem, ...pct(x.getBoundingClientRect()) })) };
    } catch { return null; }
  }
  const pctBox = (r) => `left:${r.left}%;top:${r.top}%;width:${r.width}%;height:${r.height}%`;
  const freeBox = (r) => `left:${r.x / 10}%;top:${r.y / 10}%;width:${r.w / 10}%;height:${r.h / 10}%`;
  function drawDvInner(c) {
    const over = $(".bld-over"); if (!over) return;
    const items = c.o.items || [], look = dvLook(c.o), m = dvMeasure(c), kids = [];
    if (!m) { st.dvTry = (st.dvTry || 0) + 1; if (st.dvTry < 20) dvRedraw(); }   // (the panel not drawn yet)
    else {
      st.dvTry = 0;
      const area = el("div.dve-area", { style: pctBox(m.area) });
      area.addEventListener("pointerdown", (e) => { if (e.target === area && e.button === 0 && st.inner.sel != null) { st.inner.sel = null; drawInner(); side(); } });
      kids.push(area);
      if (look === "free") {
        const tmp = items.map((it) => ({ ...it }));
        DE().autoPlace(tmp);   // (one not placed yet: where the panel would put it, until it's moved)
        tmp.forEach((it, n) => area.append(dvBox(c, n, freeBox(it), look)));
      } else m.items.filter((q) => items[q.n]).forEach((q) => kids.push(dvBox(c, q.n, pctBox(q), look)));
    }
    over.replaceChildren(...kids, el("div.bk-ed-tip", {}, Kit.t(items.length ? `builder.dve.tip.${look}` : "builder.dve.tipEmpty")));
  }
  function dvBox(c, n, style, look) {
    const it = c.o.items[n], b = el("div.dve-it" + (st.inner.sel === n ? ".sel" : "") + (dvTodo(it) ? ".todo" : "") + `.lk-${look}`, { "data-n": String(n), style, title: dvName(it) });   // i18n-ok (class names, CSS)
    // (Freeform: every edge and corner; Tiles: the right and bottom edges; List, one big item: it only moves)
    const zoneAt = (e) => {
      const r = b.getBoundingClientRect(), z = DE().zone(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      return look === "free" ? z : look === "tiles" && /^(e|s|se)$/.test(z) ? z : look === "single" ? "pick" : "move";
    };
    b.addEventListener("pointermove", (e) => { if (!st.pdrag) b.style.cursor = DE().CURSOR[zoneAt(e)] || "pointer"; });
    b.addEventListener("pointerdown", (e) => dvDrag(e, c, n, zoneAt(e), look, b));
    return b;
  }
  // the X / Y / W / H boxes follow a drag
  const dvSync = (r) => document.querySelectorAll(".bld-side .dve-xywh input[data-k]").forEach((x) => { if (r[x.dataset.k] != null) x.value = String(r[x.dataset.k] / 10); });
  function dvDrag(e, c, n, z, look, node) {
    if (e.button !== 0) return;
    const it = c.o.items[n]; if (!it) return;
    e.preventDefault(); e.stopPropagation();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    const over = $(".bld-over"), O = over.getBoundingClientRect(), A = node.parentElement.getBoundingClientRect(), R0 = node.getBoundingClientRect();
    try { node.setPointerCapture(e.pointerId); } catch {}
    if (st.inner.sel !== n) { st.inner.sel = n; over.querySelectorAll(".dve-it").forEach((x) => x.classList.toggle("sel", +x.dataset.n === n)); side(); }
    if (z === "pick") return;
    const r0 = DE().placed(it) ? { x: it.x, y: it.y, w: it.w, h: it.h } : DE().fixRect({ x: ((R0.left - A.left) / A.width) * 1000, y: ((R0.top - A.top) / A.height) * 1000, w: (R0.width / A.width) * 1000, h: (R0.height / A.height) * 1000 });
    const s0 = { px: e.clientX, py: e.clientY, sw: it.sw || 1, sh: it.sh || 1 };
    let moved = false, line = null, drop = null;
    const mv = (ev) => {
      const dx = ev.clientX - s0.px, dy = ev.clientY - s0.py;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) { moved = true; document.body.classList.add("bld-dragging"); }
      if (look === "free") {
        const r = DE().dragRect(r0, z, (dx / A.width) * 1000, (dy / A.height) * 1000);
        st.pdrag = { n, r }; node.style.cssText = freeBox(r); dvSync(r); post();
      } else if (z !== "move") {   // (a tile: its span, in whole tiles; the box follows the pointer)
        const r = DE().span({ sw: s0.sw, sh: s0.sh }, z, dx, dy, R0.width / s0.sw, R0.height / s0.sh);
        st.pdrag = { n, r };
        node.style.width = `${Math.max(12, R0.width + (z.includes("e") ? dx : 0))}px`; node.style.height = `${Math.max(12, R0.height + (z.includes("s") ? dy : 0))}px`;
        post();
      } else {   // (List / Tiles: to another place; the drop line shows where)
        const rects = [...over.querySelectorAll(".dve-it")].sort((a, b) => a.dataset.n - b.dataset.n).map((x) => {
          if (x === node) return { left: R0.left - O.left, top: R0.top - O.top, width: R0.width, height: R0.height };
          const q = x.getBoundingClientRect(); return { left: q.left - O.left, top: q.top - O.top, width: q.width, height: q.height };
        });
        drop = DE().dropAt(rects, n, ev.clientX - O.left, ev.clientY - O.top);
        if (!line) { line = el("div.dve-line"); over.append(line); }
        Object.assign(line.style, { left: `${drop.line.x - (drop.line.w ? 0 : 2)}px`, top: `${drop.line.y - (drop.line.h ? 0 : 2)}px`, width: `${drop.line.w || 4}px`, height: `${drop.line.h || 4}px` });
        node.style.transform = `translate(${dx}px, ${dy}px)`;   // i18n-ok (class names, CSS)
      }
    };
    const up = (ev) => {
      node.removeEventListener("pointermove", mv); node.removeEventListener("pointerup", up); node.removeEventListener("pointercancel", up);
      st.dragEsc = null; try { node.releasePointerCapture(e.pointerId); } catch {}
      document.body.classList.remove("bld-dragging"); if (line) line.remove();
      const d = st.pdrag; st.pdrag = null;
      if (moved && ev.type === "pointerup") {
        if (look === "free" && d) Object.assign(it, d.r);
        else if (d && d.r.sw) { for (const k of ["sw", "sh"]) if (d.r[k] > 1) it[k] = d.r[k]; else delete it[k]; }
        else if (drop && DE().move(c.o.items, n, drop.at)) st.inner.sel = drop.at;
        changed();
      }
      drawInner(); dvRedraw(); post();
    };
    node.addEventListener("pointermove", mv); node.addEventListener("pointerup", up); node.addEventListener("pointercancel", up);
    st.dragEsc = () => up({ type: "pointercancel" });
  }
  // Esc / Done: back to the cards; Delete: remove the picked item; the arrows: Freeform moves it 1 % (Shift: 10 %), List /
  // Tiles move it a place earlier / later
  function dvKey(e, t, typing, c) {
    if (e.key === "Escape" && !typing && !(t.closest && t.closest("select"))) { e.preventDefault(); return leaveInner(); }
    const n = st.inner.sel, it = n != null ? (c.o.items || [])[n] : null;
    if (!it || !onScreen(t) || (t.closest && t.closest("input, textarea, select, button, [contenteditable]"))) return;   // i18n-ok
    if (["Delete", "Backspace"].includes(e.key)) { e.preventDefault(); return dvRemove(c, n); }   // i18n-ok
    if (!/^Arrow/.test(e.key)) return;
    e.preventDefault();
    if (dvLook(c.o) === "free") {
      if (!DE().placed(it)) DE().autoPlace(c.o.items);
      Object.assign(it, DE().nudge(it, e.key, e.shiftKey)); changed(true, `dvnudge:${c.i}:${n}`);
    } else {
      const to = n + (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1);   // i18n-ok
      if (!DE().move(c.o.items, n, to)) return;
      st.inner.sel = to; changed();
    }
    drawInner(); dvRedraw();
  }

  function camSelect(cur, pick) {
    return el("select", { onchange: (e) => pick(e.target.value) }, el("option", { value: "", selected: !cur }, Kit.t("builder.f.pick")),
      st.cams.length ? el("optgroup", { label: Kit.t("builder.cam.cameras") }, st.cams.map((x) => el("option", { value: String(x.id), selected: String(cur) === String(x.id) }, x.name))) : null,
      (st.ctx.views || []).length ? el("optgroup", { label: Kit.t("builder.cam.views") }, st.ctx.views.map((v) => el("option", { value: v.id, selected: cur === v.id }, v.name))) : null);
  }

  // ownId (v3.0.4, a Devices card's item): a device action starts on the item's own device — never asks for a second one
  function actionEditor(c, k, label, ownId = null) {
    const a = c[k] || { do: "none" };
    const put = (patch) => {
      const next = { ...a, ...patch };
      if (ownId != null && DEV_ACTIONS.includes(next.do) && next.id == null) next.id = ownId;
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
      if (c.t === "devices") {   // (a scene / button item may do only its action; every other item needs its device)
        const n = (c.o.items || []).findIndex((it) => !it.id && !(["scene", "button"].includes(it.k) && it.tap));
        if (n >= 0 && stop(Kit.t("builder.save.devicesTodo", { n: n + 1 }))) return;
      }
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
      // (v3.0.4: an old Countdown with no date — kept as it was, not moved over — saves as it is; it says "Pick a date")
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
    for (const k of ["dockStyle", "dockLabels", "dockAutoHide", "dockAt", "roomOrder"]) if (lookDiff(k)) set[k] = st.look[k];
    // (hidden rooms are merged where they're kept: each room this changed — shown again = false)
    if (lookDiff("hiddenRooms")) set.hiddenRooms = Object.fromEntries([...new Set([...Object.keys(st.look.hiddenRooms), ...Object.keys(st.look0.hiddenRooms)])].map((k) => [k, st.look.hiddenRooms[k] === true]));
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
