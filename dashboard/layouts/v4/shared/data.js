// Shared data + behaviour for the round-2 layouts.
// Device names/IDs/states: the house model (hubitat-data.js), replaced by LIVE values when the Hubitat bridge
// (scripts/hubitat_bridge.py) publishes hubitat/state + hubitat/event; taps then go out as hubitat/cmd (only devices in
// the bridge's allowlist are really switched). Inside temperature/humidity are LIVE from the panel (MQTT).
// Calendar: the house's calendars (iCal links, Manager → Integrations → Calendars; docs/calendars.md) from
// /api/panel/<id>/events — the SAMPLE events below only while the house has none set up.
(function () {
  // this panel's topics (stage 5): its FreeKiosk / panel agent name — set per panel on the Manager page
  const agentTopic = () => `panelagent/${api.kiosk()}`;

  // Event icon is picked from words in the title (first match wins).
  const CATEGORIES = [
    { key: "surgery", icon: "bandage", color: "#f43f5e", words: ["surgery", "operation", "procedure"] },
    { key: "hospital", icon: "hospital", color: "#ef4444", words: ["hospital", "er visit", "urgent care"] },
    { key: "dentist", icon: "tooth", color: "#22d3ee", words: ["dentist", "dental", "teeth", "orthodont"] },
    { key: "pain", icon: "pill", color: "#fb7185", words: ["pain dr", "pain doctor", "pain clinic", "pain"] },
    { key: "doctor", icon: "stethoscope", color: "#38bdf8", words: ["doctor", "dr.", " dr ", "checkup", "physical", "clinic"] },
    { key: "hair", icon: "scissors", color: "#f472b6", words: ["hair", "salon", "barber", "haircut"] },
    { key: "groomer", icon: "dog", color: "#fbbf24", words: ["groom"] },
    { key: "vet", icon: "paw", color: "#f59e0b", words: ["vet"] },
    { key: "travel", icon: "plane", color: "#60a5fa", words: ["flight", "fly ", "trip", "travel", "vacation", "airport"] },
    { key: "work", icon: "briefcase", color: "#a78bfa", words: ["work", "meeting", "call", "conference"] },
    { key: "birthday", icon: "cake", color: "#e879f9", words: ["birthday", "party", "anniversary"] },
    { key: "dinner", icon: "utensils", color: "#fb923c", words: ["dinner", "lunch", "breakfast", "brunch", "restaurant"] },
    { key: "church", icon: "church", color: "#c4b5fd", words: ["church", "temple"] },
    { key: "car", icon: "car", color: "#94a3b8", words: ["oil change", "mechanic", "car service", "tires"] },
    { key: "shopping", icon: "cart", color: "#34d399", words: ["shopping", "costco", "groceries", "store"] },
    { key: "gym", icon: "dumbbell", color: "#4ade80", words: ["gym", "workout", "yoga"] },
  ];
  const DEFAULT_CAT = { key: "event", icon: "calendar", color: "#a99fd0" };
  const category = (title) => {
    const t = ` ${title.toLowerCase()} `;
    return CATEGORIES.find((c) => c.words.some((w) => t.includes(w))) || DEFAULT_CAT;
  };

  // sample events: [days from today, time, title, who]
  // ([days from today, hour, minute, the title's key (strings/en.js "sample.*"), who — "" = the family])
  const SAMPLE = [   // (made-up examples — no real appointments here: the repo is going public)
    [-1, 18, 0, "birthday", ""],
    [0, 8, 30, "market", ""], [0, 12, 0, "lunch", "Jane"], [0, 18, 30, "dinner", ""],
    [1, 9, 0, "dentist", "Jane"], [1, 14, 0, "meeting", "John"],
    [2, 10, 30, "groomer", "John"],
    [3, 16, 0, "hair", "Jane"],
    [4, 11, 0, "doctor", "John"], [4, 19, 0, "games", ""],
    [6, 9, 30, "vet", "Jane"], [6, 13, 0, "groceries", ""],
    [8, 8, 0, "car", "Jane"],
    [10, 6, 30, "early", "John"],
    [12, 7, 15, "flight", ""],
    [15, 10, 0, "oil", "John"],
  ];
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  // which Google calendar each sample event lives on (family events are on the second one)
  // (in the panel's language — made again when another language's words arrive: strings.js "panel-strings"; the
  // icon from the English title: the keyword lists are English)
  const samples = () => SAMPLE.map(([off, h, m, key, who]) => {
    const date = today0(); date.setDate(date.getDate() + off);
    const at = new Date(date); at.setHours(h, m, 0, 0);
    const en = ((window.PANEL_STRINGS || {}).en || {})[`sample.${key}`] || key;
    return { date, time: T.time(at), title: T(`sample.${key}`), who: who || T("sample.family"), cal: who === "John" ? "john" : "jane", cat: category(en) };
  });
  let events = samples();
  addEventListener("panel-strings", () => { const was = events; events = samples(); if (state.events === was) { state.events = events; changed(); } });

  // ---------- from Hubitat (hubitat-data.js: the house model, service/house_model.py) ----------
  // Since stage 3 the Hubitat bridge builds it live (rooms, devices, locks, windows, doors, thermostat, outside
  // sensor) and the page reloads when it changes (app.js, "hubitat/model"). A list it doesn't have: none of it.
  const HUB = window.HUBITAT || { rooms: [], presence: [], cameras: [], sensors: [] };
  const windowList = (HUB.windows || []).map((w) => ({ id: w.id, name: w.name, room: w.room, open: !!w.open }));
  // a room's windows: the ones Hubitat puts in that room
  // (each list may be missing from a house model — none of it, or a room without devices: empty, never a throw at load)
  const list = (v) => (Array.isArray(v) ? v : []);
  const rooms = list(HUB.rooms).filter((r) => r && typeof r === "object").map((r) => ({ ...r, devices: list(r.devices).map((d) => ({ ...d })),
    windows: windowList.filter((w) => w.room === r.name).map((w) => w.id) }));
  const num0 = (v, d) => (v == null || v === "" || isNaN(+v) ? d : +v);
  const TH = HUB.thermostat;
  // no thermostat in this house: an inert one (id null — every command is skipped, the Home card is left out)
  const NO_THERMOSTAT = { id: null, none: true, name: "", room: "", temp: null, heat: 70, cool: 76, mode: "off" };

  const state = {
    // every presence device in Hubitat; which ones show as "people" (and their names/colours/pictures)
    // is chosen in Settings → People. See api.people().
    presence: list(HUB.presence).map((p) => ({ ...p })),
    outside: HUB.outside ? { name: HUB.outside.name, temp: num0(HUB.outside.temp, null), humidity: num0(HUB.outside.humidity, null) }
      : { name: "", temp: null, humidity: null, none: true },   // no outside sensor in this house
    inside: { temp: null, humidity: null, live: false },           // panel-agent (°C → °F)
    thermostat: TH ? { id: TH.id, name: TH.name, room: TH.room, temp: num0(TH.temp, 70), heat: num0(TH.heat, 70), cool: num0(TH.cool, 76), mode: "heat" }
      : { ...NO_THERMOSTAT },
    // Hubitat Safety Monitor. status: disarmed | armedHome | armedNight | armedAway
    alarm: { status: "disarmed", by: "Jane", source: T("alarm.sampleSource"), at: new Date(Date.now() - 3 * 3600e3), log: [] },
    // safety sensors from Hubitat: smoke/CO, water leak, freezer power failure, freezer temperature. state: clear | detected
    // (shown only — the alerts themselves come from Hubitat's rules: hubalerts.js)
    sensors: list(HUB.sensors).map((s) => ({ ...s })),
    cameras: list(HUB.cameras),
    locks: (HUB.locks || []).map((l) => ({ id: l.id, name: l.name, lock: l.lock || "unknown", battery: l.battery, unlock: l.unlock === true })),
    windows: windowList.map(({ id, name, open }) => ({ id, name, open })),
    doors: (HUB.doors || []).map((d) => ({ id: d.id, name: d.name, where: d.where, open: !!d.open })),
    events,
    rooms,
    // appliances, speakers, purifier, air quality, garage door, sensors, mode switches (the house model's "things", service/house_model.py):
    // { id, kind, name, full, room, attrs: { machineState, progressPercent, ... } } — attrs follow Hubitat live
    things: (HUB.things || []).map((t) => ({ ...t, attrs: { ...t.attrs } })),
  };
  const thingById = new Map(state.things.map((t) => [t.id, t]));
  // the house model's catalogue (every device, its values when the model was built): a card's own device reads it
  // until the bridge has sent the live values
  const CAT = new Map((Array.isArray(HUB.devices) ? HUB.devices : []).filter((d) => d && Number.isInteger(d.id)).map((d) => [d.id, d]));
  // a thermostat card's thermostat that isn't the house's (state.thermostat)
  const otherThermo = (id) => Number.isInteger(id) && id > 0 && id !== state.thermostat.id;
  const T_GAP = 2;   // °F: the least a thermostat's heat set point stays below its cool one (data.js tPair)
  // in Auto, the set point the dial edits once one was picked on its face (nest.js "HEAT 68° · COOL 76°"); else the one
  // nearer the room's temperature
  const autoPick = {};
  const autoSide = (id, t, heat, cool) => autoPick[id] || (t > (heat + cool) / 2 ? "cool" : "heat");
  // set some of a device's values as shown (a tap, before the device answers) → undo puts them back as they were
  const rawSet = (id, vals) => {
    let a = hub.attrs.get(id); if (!a) hub.attrs.set(id, (a = {}));
    const was = Object.fromEntries(Object.keys(vals).map((k) => [k, a[k]]));
    Object.assign(a, vals); hub.watched.add(id);
    return () => { for (const [k, v] of Object.entries(was)) { if (v === undefined) delete a[k]; else a[k] = v; } };
  };
  const LABEL = new Map((Array.isArray(HUB.devices) ? HUB.devices : []).filter((d) => d && typeof d.label === "string").map((d) => [d.id, d.label]));
  // a room with only doors / windows / locks / cameras (Hubitat's "Back Door") still gets a page
  const hasPlaced = (room) => { const p = api.placed(room); return !!(p.doors.length || p.windows.length || p.locks.length || p.cameras.length); };

  const listeners = [];
  // one listener failing (e.g. a view) must not stop the others (the alarm overlay, LEDs…)
  // Inside Home.batch(fn) (e.g. a light preset sending 16 commands) listeners run once at the end instead of per command.
  let batching = 0, batchedChange = false;
  const changed = () => {
    if (batching) { batchedChange = true; return; }
    listeners.forEach((fn) => { try { fn(state); } catch (e) { console.warn("[data] listener failed:", e); } });
  };
  const find = (id) => { for (const r of state.rooms) for (const d of r.devices) if (d.id === id) return d; return null; };
  // a garage door controller the house model files as a "thing" (not in a room's devices — e.g. a GarageDoorControl
  // with no Switch): to the cards it looks like a room's garage opener (kind garage, opens and closes, its "door"),
  // made fresh from its attributes on every call
  const DOOR = ["open", "opening", "closed", "closing"];
  const garageThing = (id) => {
    const t = thingById.get(id); if (!t || t.kind !== "garage") return null;
    const a = t.attrs || {}, door = DOOR.includes(String(a.door).toLowerCase()) ? String(a.door).toLowerCase() : undefined;
    return { id, kind: "garage", cmd: "openclose", thing: true, name: t.name, full: t.full, room: t.room, door,
      on: door ? door === "open" || door === "opening" : a.contact === "open" };
  };

  // ---------- live Hubitat (scripts/hubitat_bridge.py over MQTT) ----------
  // Once hubitat/state has arrived (hub.live), taps publish hubitat/cmd and update optimistically; the real value
  // comes back as a hubitat/event. If the bridge answers ok:false (e.g. device not in its allowlist) the tap is undone.
  // Without the bridge / MQTT everything works on the static snapshot as before.
  const hubSaidCbs = [], hubSaid = (id) => hubSaidCbs.forEach((fn) => { try { fn(id); } catch (e) { console.warn("[hub]", e); } });
  const hub = { live: false, pending: new Map(), heard: new Map(), waiters: new Map(), attrs: new Map(), watched: new Set(), sent: new Map(), mine: new Map() };
  // Devices whose "turn on / open" needs the panel PIN (house model "confirm": valves, garage openers, devices the
  // owner marked). Off / close never does. The bridge checks the PIN; this page only asks for it.
  const CONFIRM = new Set(Array.isArray(HUB.confirm) ? HUB.confirm : []);
  // guest modes (Hubitat "Guest Mode, <who>" switches): the PIN for on AND off — off changes the guest Wi-Fi password
  const GUEST_MODES = new Set(Array.isArray(HUB.guestModes) ? HUB.guestModes : []);
  const NO_PIN = new Set(["off", "close", "lock", "refresh"]);
  // (the bridge's needs_pin asks the same or less: a garage relay needs it for everything — many relays toggle the door
  // on any command; the panel also asks it to close a garage door controller, by the owner's choice)
  // device groups that only some panels may control (Manager → Devices → Groups): {id: [panel ids]}
  const ONLY = HUB.onlyPanels && typeof HUB.onlyPanels === "object" ? HUB.onlyPanels : {};
  const panelId = () => ((window.PanelStore && PanelStore.id) || "main").toLowerCase();
  const mayControl = (id) => !Array.isArray(ONLY[id]) || ONLY[id].includes(panelId());
  // The relays / switches this panel's cards use as a garage door's opener (a Garage door card, a Picture & values
  // garage, a blank card's garage piece), with the door's own name when the owner gave one: {id → label}. Such a
  // relay needs the PIN wherever it shows up — also as a plain Switch piece or a Device card (round 2).
  function garageUses() {
    const out = new Map(), seen = new Set(), S = window.Settings && Settings.v;
    const walk = (x, depth) => {
      if (!x || typeof x !== "object" || depth > 12 || seen.has(x)) return;
      seen.add(x);
      if (Array.isArray(x)) { x.forEach((y) => walk(y, depth + 1)); return; }
      if (x.t === "garage" && x.o && Number.isInteger(x.o.id) && !out.has(x.o.id)) out.set(x.o.id, "");
      if ((x.t === "garage" || x.pic === "garage") && Array.isArray(x.doors)) {
        for (const d of x.doors) if (d && Number.isInteger(d.id)) out.set(d.id, (typeof d.label === "string" && d.label.trim().slice(0, 60)) || out.get(d.id) || "");
      }
      for (const v of Object.values(x)) if (v && typeof v === "object") walk(v, depth + 1);
    };
    if (S) walk(S, 0);
    return out;
  }
  // gar = "open" / "close": a tap on a garage door (a garage card, a Picture & values door) — whatever the opener is
  // (also a plain switch / relay), a garage door always asks the PIN
  const needsPin = (id, command, gar) => {
    if (command === "refresh") return false;
    if (command === "unlock") return true;   // (only locks the owner allowed, on panels that allow it — and the PIN)
    if (gar) return true;
    if (garageUses().has(id)) return true;   // (a garage door's relay, wherever it shows up)
    if (GUEST_MODES.has(id)) return true;
    const d = find(id) || garageThing(id);
    if (d && d.kind === "garage") return true;   // (opening and closing)
    return CONFIRM.has(id) && !NO_PIN.has(command);
  };
  // The layout builder's canvas (?design=1): a demo — a tap shows what would happen and nothing is sent anywhere.
  const DESIGN = window.PANEL_DESIGN === true;
  const demo = (id, command, value) => {
    let a = hub.attrs.get(id); if (!a) hub.attrs.set(id, (a = {}));
    if (command === "on" || command === "off") a.switch = command;
    else if (command === "open" || command === "close") { a.contact = command === "open" ? "open" : "closed"; a.door = a.valve = a.contact; }
    else if (command === "setLevel") { a.level = value; a.switch = "on"; }
    else if (command === "lock" || command === "unlock") a.lock = `${command}ed`;
    else if (command === "play" || command === "pause" || command === "stop") a.status = command === "play" ? "playing" : command === "pause" ? "paused" : "stopped";
    else if (command === "setVolume") a.volume = value;
    const th = thingById.get(id); if (th) Object.assign(th.attrs, a);   // (a garage controller filed as a thing: its door)
    hub.watched.add(id);
    return true;
  };
  // a short note at the bottom of the screen, at most one every few seconds
  let offToldAt = 0;
  const notConnected = () => {
    if (Date.now() - offToldAt < 4000 || !document.body) return;
    offToldAt = Date.now();
    const n = document.createElement("div");
    n.className = "hub-off-toast"; n.textContent = T("hub.notConnected");
    document.body.append(n);
    setTimeout(() => n.remove(), 2600);
  };
  // The Manager's "Open live" for a login that may only look (v2.5.0, shared/live.js): nothing is sent, the tap undone
  const VIEW_ONLY = !!(window.PANEL_LIVE && window.PANEL_LIVE.mode !== "control");
  const cmd = (id, command, value, revert, ticket, gar) => {
    if (DESIGN) { hub.sent.set(id, Date.now()); return demo(id, command, value); }
    if (VIEW_ONLY) { if (revert) revert(); changed(); if (window.PanelLive) PanelLive.refuse(); return false; }
    // not connected to the hub (no bridge, the broker gone): nothing is sent — so the tap mustn't look done
    if (!hub.live) { if (revert) revert(); notConnected(); changed(); return false; }
    if (!mayControl(id) && !NO_PIN.has(command)) {   // (locking, off and close always: safe from any panel)
      if (revert) revert();
      changed();
      if (window.PinPad && !cmd.told) { cmd.told = true; PinPad.confirm({ title: T("dev.notFromHere"), text: T("dev.notFromHereText"), yes: T("common.ok") }).finally(() => { cmd.told = false; }); }
      return false;
    }
    if (needsPin(id, command, gar) && !ticket) {
      // undo what the tap already showed, then ask first ("Are you sure?" → PIN) and send it only after that
      if (revert) revert();
      changed();
      confirmAndSend(id, command, value, gar);
      return false;
    }
    if (revert && !hub.pending.has(id)) hub.pending.set(id, revert); // keep the oldest snapshot per device
    const msg = value == null ? { id, command } : { id, command, value };
    if (ticket) msg.ticket = ticket; // a one-time ticket from the dashboard service — never the PIN itself
    const mk = `${id}|${command}`; hub.mine.set(mk, (hub.mine.get(mk) || 0) + 1);   // (its answer is ours: the result handler — noted before sending)
    api.publish("hubitat/cmd", msg);
    hub.sent.set(id, Date.now());   // (a garage opener's card: a press it can show — grid.js)
    return true;
  };
  // set points: the dial shows every tap at once, the hub gets only where the taps stopped (SET_WAIT ms after the
  // last one) — quick taps never pile up commands; a refusal undoes back to before the first tap
  const SET_WAIT = 450, setWait = {};
  const setSoon = (id, undo, cmds) => {
    const w = setWait[id] || (setWait[id] = { undo, c: {} });
    Object.assign(w.c, cmds);
    clearTimeout(w.t);
    w.t = setTimeout(() => { delete setWait[id]; Object.entries(w.c).forEach(([k, v], i) => cmd(id, k, v, i ? undefined : w.undo)); }, SET_WAIT);
  };
  // the bridge's answer to one command (for the PIN pad: right / wrong / locked)
  // (longer than the bridge's 10 s "stale" limit, so a slow hub can't make the panel offer a second try)
  const resultOf = (id, command, ms = 15000) => new Promise((resolve) => {
    const key = `${id}|${command}`, t = setTimeout(() => { hub.waiters.delete(key); resolve({ ok: false, reason: "timeout" }); }, ms);
    hub.waiters.set(key, (r) => { clearTimeout(t); hub.waiters.delete(key); resolve(r); });
  });
  const PIN_KEY = { "unlock-panel": "dev.pin.unlockPanel", "unlock-device": "dev.pin.unlockDevice", "wrong-pin": "pin.wrong", locked: "dev.pin.locked",
    unset: "dev.pin.unset", "pin-unset": "dev.pin.unset", "pin-expired": "dev.pin.expired", timeout: "dev.pin.timeout" };
  const PIN_MSG = new Proxy({}, { get: (o, k) => (PIN_KEY[k] ? T(PIN_KEY[k]) : undefined) });   // (the words in the panel's language, when asked)
  // All PIN-needing commands of one gesture (a scene, a colour = hue + saturation, a dimmer being dragged) are asked
  // for ONCE: they're collected, confirmed, the PIN goes to the dashboard service over HTTP (/api/pin "ticket"), which
  // answers with one single-use ticket per command; the commands then go to the bridge with their tickets.
  let pinBatch = null; // { items: Map("id|command" → {id, command, value}), started }
  function confirmAndSend(id, command, value, gar) {
    if (!window.PinPad) return;
    if (!pinBatch) { pinBatch = { items: new Map(), started: false }; setTimeout(runPinBatch, 0); }
    pinBatch.items.set(`${id}|${command}`, { id, command, value, gar }); // a newer value (slider) replaces the older one
  }
  async function runPinBatch() {
    const batch = pinBatch; if (!batch || batch.started) return;
    batch.started = true;
    try {
      const first = [...batch.items.values()][0], d = find(first.id), t = d ? null : (state.things || []).find((x) => x.id === first.id);
      const lk = state.locks.find((x) => x.id === first.id);
      // a garage door (a room's opener, one filed as a thing, or a switch a card uses as one): open or close — from
      // the tap (first.gar), else the command (open / on = opening: a relay's toggle sends the new state)
      const uses = garageUses(), door = uses.get(first.id) || "";   // (the door's own name, builder → the door's Name)
      const gar = first.gar || ((d && d.kind === "garage") || (t && t.kind === "garage") || uses.has(first.id) ? (["open", "on"].includes(first.command) ? "open" : "close") : null);
      const name = (d && (d.full || d.name)) || (t && (t.full || t.name)) || (lk && lk.name) || T("dev.thisDevice");
      const what = door || T("dev.garageDoor");
      const ids = new Set([...batch.items.values()].map((i) => i.id));
      const ask = ids.size > 1 ? { title: T("dev.changeMany", { n: ids.size }), text: T("dev.someNeedPin"), yes: T("common.yes") }
        : d && d.kind === "valve" ? { title: T("dev.waterBack"), text: T("dev.waterBackText", { name }), yes: T("dev.turnItOn") }
        : gar ? (gar === "close" ? { title: T("dev.closeDoor", { what }), text: name, yes: T("dev.closeIt") } : { title: T("dev.openDoor", { what }), text: name, yes: T("dev.openIt") })
        : first.command === "unlock" ? { title: T("dev.unlockAsk", { name }), text: T("dev.unlockText"), yes: T("dev.unlock") }
        : t && t.kind === "guest" ? (first.command === "on"
          ? { title: T("dev.guestOn", { name: t.name }), text: T("dev.guestOnText"), yes: T("dev.turnOn") }
          : { title: T("dev.guestOff", { name: t.name }), text: T("dev.guestOffText"), yes: T("dev.turnOff") })
        : { title: T("dev.turnOnAsk", { name }), text: T("dev.needsPin"), yes: T("common.yes") };
      if (!(await PinPad.confirm(ask))) return;
      // (the general window: within it the PIN entered a moment ago is used, no pad — doors, the garage, valves…)
      await PinPad.ask({ title: T("pin.title"), text: ask.title, window: "general", check: async (pin) => {
        const items = [...batch.items.values()].slice(0, 20);
        let j = {};
        try {
          const r = await fetch("/api/pin", { method: "PATCH", headers: { "Content-Type": "application/json" },
            // (the value is signed into the ticket: a ticket seen on the network can't be used with another value)
            body: JSON.stringify({ action: "ticket", pin, panel: panelId(), items: items.map((i) => (i.value == null ? [i.id, i.command] : [i.id, i.command, i.value])) }) });
          j = await r.json().catch(() => ({}));
        } catch { return { ok: false, msg: T("pin.serviceDown") }; }
        if (!j.ok || !Array.isArray(j.tickets)) return j.error === "locked" || +j.lockedFor > 0 ? PinPad.refusal(j) : { ok: false, msg: PIN_MSG[j.error] || T("pin.cantCheck") };
        const waits = items.map((it, k) => { const w = resultOf(it.id, it.command); cmd(it.id, it.command, it.value, null, j.tickets[k]); return w; });
        const bad = (await Promise.all(waits)).find((r) => !r.ok);
        return bad ? { ok: false, msg: PIN_MSG[bad.reason] || T("dev.pin.notDone", { reason: bad.reason || T("dev.refused") }), done: bad.reason === "timeout" } : { ok: true };
      } });
    } finally {
      if (pinBatch === batch) pinBatch = null;
    }
  }
  const snapDev = (d) => { const s = { on: d.on, level: d.level, speed: d.speed, hue: d.hue, sat: d.sat, ct: d.ct, mode: d.mode, unknown: d.unknown }; return () => Object.assign(d, s); };
  const snapObj = (o) => { const s = { ...o }; return () => Object.assign(o, s); };
  // A device whose state the hub doesn't know ("unknown"): a tap sends the normal command (light → on,
  // lock → lock), which usually makes it report. If it stays quiet for 10 s, ask it to report ("refresh"); still
  // quiet 10 s later → show it as unknown again (back()), so e.g. a jammed bolt never sits there as "Locked".
  // hub.heard = when each device last reported a known switch/lock state (set in the hubitat/event handler).
  const tryKnown = (id, back) => {
    if (!hub.live) return;
    const sent = Date.now(), quiet = () => !((hub.heard.get(id) || 0) > sent);
    setTimeout(() => {
      if (!quiet()) return;
      api.publish("hubitat/cmd", { id, command: "refresh" });
      setTimeout(() => { if (quiet()) { back(); changed(); } }, 10000);
    }, 10000);
  };
  const devUnknown = (d) => () => { d.unknown = true; d.on = false; };

  const api = {
    state, category, CATEGORIES, hub,
    onChange(fn) { listeners.push(fn); fn(state); },
    // run several commands with one re-render at the end: Home.batch(() => lights.forEach(...))
    batch(fn) {
      batching++;
      try { fn(); } finally { if (--batching === 0 && batchedChange) { batchedChange = false; changed(); } }
    },
    refresh: changed,
    room: (id) => state.rooms.find((r) => r.id === id),
    // gar: a tap on a garage door ("open" / "close", grid.js) — always the PIN, and its own question
    toggle(id, gar) {
      const d = find(id);
      if (!d) {   // a garage door controller filed as a thing: open / close by its door (opening → close, closing → open)
        const g = garageThing(id); if (!g) return;
        const t = thingById.get(id), before = t.attrs.door, c = g.on ? "close" : "open";
        t.attrs.door = c === "open" ? "opening" : "closing";
        if (!cmd(id, c, null, () => { t.attrs.door = before; }, null, gar || c) && !DESIGN) t.attrs.door = before;
        changed();
        return;
      }
      const undo = snapDev(d), unknown = d.unknown && !d.on;
      d.on = unknown ? true : !d.on; d.unknown = false; if (d.kind === "fan") d.speed = d.on ? "medium" : "off";
      // a real valve / garage door controller opens and closes; relays (and everything else) switch on / off
      const c = d.cmd === "openclose" ? (d.on ? "open" : "close") : d.on ? "on" : "off";
      cmd(id, c, null, undo, null, gar); if (unknown) tryKnown(id, devUnknown(d)); changed();
    },
    // lights: d.dim / d.white (tunable white, d.ct in K) / d.rgb (d.hue, d.sat 0–100, Hubitat's scale); d.mode "CT"/"RGB"
    setLevel(id, level) {
      const d = find(id); if (!d) return;
      if (d.kind === "light" && d.dim === false) { if (!d.on) api.toggle(id); return; }   // (an on / off light: just on)
      const undo = snapDev(d), unknown = d.unknown; d.level = Math.max(1, Math.min(100, Math.round(level))); d.on = true; d.unknown = false;
      cmd(id, "setLevel", d.level, undo); if (unknown) tryKnown(id, devUnknown(d)); changed();
    },
    setColorTemp(id, kelvin) {
      const d = find(id); if (!d || !d.white) return;
      const undo = snapDev(d), unknown = d.unknown; d.ct = Math.max(2000, Math.min(6500, Math.round(kelvin))); d.mode = "CT"; d.on = true; d.unknown = false;
      cmd(id, "setColorTemperature", d.ct, undo); if (unknown) tryKnown(id, devUnknown(d)); changed();
    },
    setColor(id, hue, sat) {
      const d = find(id); if (!d || !d.rgb) return;
      const undo = snapDev(d), unknown = d.unknown;
      d.hue = Math.max(0, Math.min(100, Math.round(hue))); d.sat = Math.max(0, Math.min(100, Math.round(sat))); d.mode = "RGB"; d.on = true; d.unknown = false;
      // two plain one-value commands (default), or one setColor for drivers that want it (Manager → Devices → Colour
      // command; the bridge turns "hue,sat" into Hubitat's map)
      if (d.colorCmd === "setColor") cmd(id, "setColor", `${d.hue},${d.sat}`, undo);
      else { cmd(id, "setHue", d.hue, undo); cmd(id, "setSaturation", d.sat); }
      if (unknown) tryKnown(id, devUnknown(d)); changed();
    },
    setFan(id, speed) { const d = find(id); if (d) { const undo = snapDev(d), unknown = d.unknown; d.speed = speed; d.on = speed !== "off"; d.unknown = false; cmd(id, speed === "off" ? "off" : "setSpeed", speed === "off" ? null : speed, undo); if (unknown) tryKnown(id, devUnknown(d)); changed(); } },
    // an air purifier (Dyson HP02 driver): "fanOn" | "off" | "auto" | "speed" (1–10). Shown at once; the hub's events
    // confirm it, a refusal puts the old values back. Its speeds are the strings "1".."10" ("0007" in its attribute).
    purifier(id, action, speed) {
      const t = thingById.get(id); if (!t || t.kind !== "purifier") return;
      const a = t.attrs, before = { ...a };
      const undo = () => { Object.keys(a).forEach((k) => delete a[k]); Object.assign(a, before); };
      if (action === "speed") {
        const s = Math.max(1, Math.min(10, Math.round(+speed) || 1));
        const wasOff = String(a.fanMode || "").toUpperCase() === "OFF" || String(a.fanState || "").toUpperCase() === "OFF";
        a.fanSpeed = String(s).padStart(4, "0"); a.fanMode = "FAN"; a.fanState = "FAN";
        // from off: start it first (fanOn runs it at its last speed), then the new speed
        if (wasOff) cmd(id, "fanOn", null, undo);
        cmd(id, "setFanSpeed", String(s), undo);
      } else if (["fanOn", "off", "auto"].includes(action)) {
        if (action === "off") { a.fanMode = "OFF"; a.fanState = "OFF"; } else { a.fanMode = action === "auto" ? "AUTO" : "FAN"; a.fanState = "FAN"; }
        cmd(id, action, null, undo);
      } else return;
      changed();
    },
    // a guest mode (Hubitat switch): on / off. The bridge wants a PIN ticket for it; Settings (already unlocked with
    // the PIN) passes one it got with the remembered PIN, so it switches at once — without one it asks first
    // ("Are you sure?" + PIN, needsPin). Shown at once; the hub's event confirms, a refusal puts it back.
    guestMode(id, on, ticket) {
      const t = thingById.get(id); if (!t || t.kind !== "guest") return false;
      if (!ticket) return cmd(id, on ? "on" : "off");
      const was = t.attrs.switch;
      t.attrs.switch = on ? "on" : "off";
      changed();
      const ok = cmd(id, on ? "on" : "off", null, () => { t.attrs.switch = was; }, ticket);
      if (!ok) { t.attrs.switch = was; changed(); }
      return ok;
    },
    // the bridge's answer to one command: { ok, reason }
    resultOf: (id, command, ms) => resultOf(id, command, ms),
    guestModes: () => state.things.filter((t) => t.kind === "guest"),
    setShade(id, level) { const d = find(id); if (d) { const undo = snapDev(d); d.level = level; cmd(id, "setPosition", level, undo); changed(); } },
    roomAll(roomId, on) {
      // unknown lights get the command too (and a refresh if they stay quiet)
      // ("All on" never includes a device that needs the PIN)
      api.devices(api.room(roomId)).filter((d) => d.kind === "light" && !CONFIRM.has(d.id) && (on ? mayControl(d.id) : true) && (d.on !== on || d.unknown)).forEach((d) => {

        const undo = snapDev(d), unknown = d.unknown; d.on = on; d.unknown = false; cmd(d.id, on ? "on" : "off", null, undo); if (unknown) tryKnown(d.id, devUnknown(d));
      });
      changed();
    },
    // locks: the panel locks; unlocking only through unlock() below (owner-allowed locks, allowed panels, PIN)
    lock(id) { const l = state.locks.find((l) => l.id === id); if (l) { const undo = snapObj(l), unknown = l.lock === "unknown"; l.lock = "locked"; cmd(id, "lock", null, undo); if (unknown) tryKnown(id, () => { l.lock = "unknown"; }); changed(); } },
    lockAll() { state.locks.filter((l) => l.lock !== "locked").forEach((l) => api.lock(l.id)); changed(); },
    // unlocking (only when the owner allowed it for this lock AND this panel; always "Are you sure?" + the panel PIN —
    // the dashboard service and the bridge check both again). Shown as unlocked only when the lock reports it.
    canUnlock: (id) => { const l = state.locks.find((x) => x.id === id);
      // (the builder's canvas too: the real panel's rule, so it never shows "Slide to unlock" where the wall won't)
      return !!(l && l.unlock && window.Settings && Settings.v.allowUnlock === true && mayControl(id)); },
    unlock(id) {
      if (DESIGN) { const l = state.locks.find((x) => x.id === id); if (l && api.canUnlock(id)) { l.lock = "unlocked"; changed(); } return; }   // (the demo: no PIN, nothing sent)
      if (api.canUnlock(id)) cmd(id, "unlock");
    },
    design: DESIGN,
    mayControl,

    // (id: a thermostat card's own thermostat — builder → Thermostat; none / the house's = state.thermostat)
    setpoint(which, delta, id) { const t = api.thermo(id); if (t.id != null) api.setTemp(which, t[which] + delta, t.id); },
    // Auto: which set point the dial and its arrows edit (heat | cool)
    autoSide(which, id) {
      const own = !otherThermo(id), tid = own ? state.thermostat.id : id;
      if (tid == null || (which !== "heat" && which !== "cool")) return;
      autoPick[tid] = which;
      if (own && api.thermo(null).tmode === "auto") state.thermostat.mode = which;
      changed();
    },
    // both set points after one is moved to value: clamped to the dial's 50–90 °F, heat at least T_GAP below cool — the
    // other one moves along (never heat above cool; in Auto the two keep their dead band)
    tPair(t, which, value) {
      const v = which === "heat" ? Math.max(50, Math.min(90 - T_GAP, Math.round(value))) : Math.max(50 + T_GAP, Math.min(90, Math.round(value)));
      return which === "heat" ? { heat: v, cool: Math.max(t.cool, v + T_GAP) } : { cool: v, heat: Math.min(t.heat, v - T_GAP) };
    },
    // the one place a setpoint changes (and the other one, when it has to move along: tPair)
    setTemp(which, value, id) {
      const t = otherThermo(id) ? api.thermo(id) : state.thermostat;
      if (t.id == null) return;
      const p = api.tPair(t, which, value), other = which === "heat" ? "cool" : "heat", C = { heat: "setHeatingSetpoint", cool: "setCoolingSetpoint" };
      const moved = p[other] !== t[other];
      if (otherThermo(id)) {
        const undo = rawSet(id, { heatingSetpoint: p.heat, coolingSetpoint: p.cool });
        setSoon(id, undo, { [C[which]]: p[which], ...(moved ? { [C[other]]: p[other] } : {}) });
        changed(); return;
      }
      const undo = snapObj(t);
      t.heat = p.heat; t.cool = p.cool;
      setSoon(t.id, undo, { [C[which]]: p[which], ...(moved ? { [C[other]]: p[other] } : {}) });
      changed();
    },
    // mode: the dial's heat / cool / fan (= off + the fan on) / off, or the thermostat's own (auto, emergency heat)
    setMode(mode, id) {
      const t = otherThermo(id) ? null : state.thermostat;
      if (t && t.id == null) return;
      const tid = t ? t.id : id, was = api.thermo(t ? null : id);
      // Off (and Heat / Cool / Auto after "Fan") also puts the fan back to auto: else the fan keeps running while the
      // panel says "off" (a fan the owner switched on by its own button stays on with Heat / Cool)
      const fanAuto = mode !== "fan" && (mode === "off" || was.mode === "fan") && was.fan != null && was.fan !== "auto" && api.fanHas(tid, "auto");
      const raw = mode === "fan" ? { thermostatMode: "off", thermostatFanMode: "on" } : { thermostatMode: mode, ...(fanAuto ? { thermostatFanMode: "auto" } : {}) };
      if (mode === "fan" && !api.fanOn(tid)) return;   // (its fan has no "on": "Fan" isn't offered — never sent either)
      const u1 = rawSet(tid, raw), u2 = t ? snapObj(t) : () => {}, undo = () => { u1(); u2(); };
      if (t) {
        if (["heat", "cool", "fan", "off"].includes(mode)) t.mode = mode;
        else if (mode === "auto" && Number.isFinite(t.temp)) t.mode = autoSide(t.id, t.temp, t.heat, t.cool);   // (as tMode)
        hub.tm = { ...hub.tm, ...raw };
      }
      if (mode === "fan") { cmd(tid, "setThermostatMode", "off", undo); cmd(tid, "setThermostatFanMode", "on"); }
      else { cmd(tid, "setThermostatMode", mode, undo); if (fanAuto) cmd(tid, "setThermostatFanMode", "auto"); }
      changed();
    },
    // does this thermostat's fan have an "on" mode ("Fan" = off with the fan on)? Not known = yes, as before.
    fanOn(id) { return api.fanHas(id, "on"); },
    // does its fan have this mode (auto / on / circulate)? Not known = yes
    fanHas(id, mode) {
      const d = CAT.get(id) || {}, v = api.reading(id, "supportedThermostatFanModes");
      let fans = Array.isArray(d.fanModes) && d.fanModes.length ? d.fanModes : [];
      if (!fans.length && typeof v === "string" && v.trim()) { try { const x = JSON.parse(v); if (Array.isArray(x)) fans = x; } catch { fans = v.split(","); } }
      fans = fans.map((m) => String(m).replace(/[[\]"'\s]/g, "").toLowerCase()).filter(Boolean);
      return !fans.length || fans.includes(mode);
    },
    // the thermostat's fan: auto / on / circulate
    setFanMode(mode, id) {
      const t = otherThermo(id) ? null : state.thermostat;
      if (t && t.id == null) return;
      const tid = t ? t.id : id, u1 = rawSet(tid, { thermostatFanMode: mode }), u2 = t ? snapObj(t) : () => {}, undo = () => { u1(); u2(); };
      if (t) { hub.tm = { ...hub.tm, thermostatFanMode: mode }; if (["off", "fan"].includes(t.mode)) t.mode = mode === "auto" ? "off" : "fan"; }
      cmd(tid, "setThermostatFanMode", mode, undo);
      changed();
    },
    windowName: (id) => (state.windows.find((w) => w.id === id) || {}).name,
    openWindows: () => state.windows.filter((w) => w.open),
    openDoors: (where) => state.doors.filter((d) => d.open && (!where || d.where === where)),
    lightsOn: (room) => api.devices(room).filter((d) => d.kind === "light" && d.on).length,
    lightsTotal: (room) => api.devices(room).filter((d) => d.kind === "light").length,
    // a room's devices on this panel (Manager → Panels → Rooms, stage 4c): minus the hidden ones, plus devices from
    // other rooms this panel shows here (extraDevices), in this panel's order (deviceOrder — press and hold to arrange)
    devices: (room) => {
      const S = (window.Settings && Settings.v) || {}, hidden = S.hiddenDevices || {};
      // (a room of the owner's own, e.g. "All lights": its members stay in their own rooms too — the same objects)
      const extra = [...(room.members || []), ...((S.extraDevices || {})[room.id] || [])].map((id) => find(id))
        .filter((d, i, a) => d && !room.devices.includes(d) && a.indexOf(d) === i);

      const list = [...room.devices, ...extra].filter((d) => !hidden[d.id]);
      const order = (S.deviceOrder || {})[room.id];
      if (Array.isArray(order) && order.length) {
        const rank = (d) => { const i = order.indexOf(d.id); return i < 0 ? 1e6 + list.indexOf(d) : i; };
        list.sort((a, b) => rank(a) - rank(b));
      }
      return list;
    },
    rooms: () => state.rooms.filter((r) => !(window.Settings && Settings.v.hiddenRooms[r.id]) &&
      (api.devices(r).length || state.things.some((t) => t.room === r.name) || hasPlaced(r.name))),
    // Settings → People: chosen presence devices, with our own names / colours / pictures
    people: () => {
      const chosen = (window.Settings && Settings.v.people) || [];
      return chosen.map((c) => {
        const p = state.presence.find((x) => x.id === c.id) || {};
        return { ...c, home: p.home !== false, initials: (c.name || "?")[0].toUpperCase() };
      });
    },
    // inside temperature / humidity (Manager → Panels → General): "panel" = this tablet's own sensors (our panel agent,
    // the default), a Hubitat device id = that sensor, "none" = the thermostat's reading only
    inside: () => {
      const src = window.Settings && Settings.v.insideSensor;
      if (typeof src === "number") {
        const t = thingById.get(src), a = (t && t.attrs) || {}, n = (v) => (v == null || v === "" || isNaN(+v) ? null : +v);
        const th = state.thermostat && state.thermostat.id === src ? state.thermostat : null;
        const temp = n(a.temperature) ?? (th ? th.temp : null), hum = n(a.humidity);
        return { temp: temp != null ? Math.round(temp) : null, humidity: hum != null ? Math.round(hum) : null, live: temp != null };
      }
      if (src === "none") return { temp: null, humidity: null, live: false };
      return state.inside;
    },
    insideTemp: () => (api.inside().temp ?? (state.thermostat.temp != null ? Math.round(state.thermostat.temp) : null)),
    // ---- a device picked on a card (builder: the thermostat card's thermostat, the inside / outside sensors) ----
    // a value of any device: the live one, else the house model's (until the bridge has sent it)
    reading: (id, name) => {
      const a = hub.attrs.get(id), t = thingById.get(id), c = CAT.get(id);
      const v = a && a[name] != null ? a[name] : t && t.attrs && t.attrs[name] != null ? t.attrs[name] : c && c.attrs ? c.attrs[name] : undefined;
      return v === "" ? undefined : v;
    },
    // a temperature (°F, whole), or null
    tempOf: (id) => { const n = parseFloat(api.reading(id, "temperature")); return Number.isFinite(n) ? Math.round(n) : null; },
    // a thermostat as the cards draw it: {id, name, room, temp, heat, cool, mode (the dial's heat | cool | fan | off),
    // tmode / fan / op (its own thermostatMode, thermostatFanMode, thermostatOperatingState)}. None or the house's
    // id → the house thermostat (state.thermostat); another id → read from that device's values.
    thermo: (id) => {
      const t = state.thermostat, own = !otherThermo(id), tid = own ? t.id : id, raw = (k) => (tid == null ? undefined : api.reading(tid, k));
      const extra = { tmode: raw("thermostatMode"), fan: raw("thermostatFanMode"), op: raw("thermostatOperatingState") };
      if (own) return { ...t, ...extra };
      const n = (k) => { const v = parseFloat(raw(k)); return Number.isFinite(v) ? v : null; };
      const m = extra.tmode, f = extra.fan, temp = n("temperature"), heat = n("heatingSetpoint") ?? 70, cool = n("coolingSetpoint") ?? 76;
      // (auto: the dial turns the set point nearer the room's temperature)
      const mode = m === "heat" || m === "emergency heat" ? "heat" : m === "cool" ? "cool" : m === "off" ? (f === "on" || f === "circulate" ? "fan" : "off")
        : m === "auto" ? (temp != null ? autoSide(id, temp, heat, cool) : autoPick[id] || "heat") : "off";
      return { id, name: api.fullName(id) || "Thermostat", room: (CAT.get(id) || {}).room || "", temp: temp ?? 70, heat, cool, mode, ...extra };
    },

    // things (see state.things), optionally only one room ("Kitchen") or kind ("washer")
    things: ({ room, kind } = {}) => state.things.filter((t) => (!room || t.room === room) && (!kind || t.kind === kind)),
    thing: (id) => thingById.get(id),
    // the room Hubitat puts a device in ("Back yard" for the gates); null if none
    roomOf: (id) => (HUB.roomOf || {})[id] || null,
    // everything placed in a room by Hubitat: doors (incl. gates, garage overhead), windows, locks, alert sensors,
    // cameras (a doorbell is its camera). Room = room name, e.g. "Garage".
    placed: (room) => {
      const at = (id) => api.roomOf(id) === room;
      return {
        doors: state.doors.filter((d) => at(d.id)), windows: state.windows.filter((w) => at(w.id)),
        locks: state.locks.filter((l) => at(l.id)), sensors: state.sensors.filter((s) => at(s.id)),
        cameras: (state.cameras || []).filter((c) => c.room === room || at(c.id)),
      };
    },
    // demo helpers so the "something open" look can be shown
    needsPin: (id, command, gar) => needsPin(id, command, gar),
    garageLabel: (id) => garageUses().get(id) || "",   // (a garage door's own name, if the owner gave it one)
    // ---- the layout builder's cards (grid.js) ----
    attr: (id, name) => { const a = hub.attrs.get(id); return a ? a[name] : undefined; },
    // the hub's own values are here: its whole state arrived and the bridge / broker hasn't gone since (guestlock.js:
    // until then a value may be the house model's, not the hub's)
    hubLive: () => hub.live,
    // fn(id) the moment the hub says something — a device's event (its id), its whole state or the link going (null):
    // guestlock.js locks on the very event, not on its next check
    onHubSaid: (fn) => { hubSaidCbs.push(fn); },
    attrs: (id) => ({ ...(hub.attrs.get(id) || {}) }),
    sentAt: (id) => hub.sent.get(id) || 0,   // when this panel last sent the device a command (ms; 0 = never)
    watch: (ids) => { hub.watched = new Set(ids); },
    // any device's name (room devices, appliances, locks, sensors, windows, doors, people)
    // a device's name for rows and pieces: the device (its full name), else the house model's label ("Kitchen Window",
    // not the window list's short "Kitchen"; never an alert's wording like "Freezer too warm"), else the lists'
    devName: (id) => {
      const d = find(id) || thingById.get(id);
      if (d && (d.full || d.name)) return d.full || d.name;
      if (LABEL.get(id)) return LABEL.get(id);
      const o = [state.locks, state.windows, state.doors, state.presence, state.sensors].map((l) => (l || []).find((x) => x.id === id)).find(Boolean);
      return o ? o.full || o.name || "" : "";
    },
    device: (id) => find(id) || garageThing(id),
    // a device's full Hubitat name (the house model's catalogue), else its name on the panel
    fullName: (id) => LABEL.get(id) || api.devName(id),
    // a freezer above the owner's "Show as a warning above" (Manager → Devices; s.max, °F): "warn" (amber), "hot" (red,
    // 5 °F or more above), or null. Shown only — no sound, no alert: those come from Hubitat rules
    sensorWarn: (s) => {
      const max = s && s.kind === "freezer" ? num0(s.max, null) : null, t = s ? num0(s.temp, null) : null;
      return max == null || t == null || t <= max ? null : t >= max + 5 ? "hot" : "warn";
    },
    // a card's own command: through the same checks as a tap (only some panels, the PIN, the bridge's lists)
    // (gar: a garage door tap — see toggle)
    send: (id, command, value, gar) => cmd(id, command, value, null, null, gar),
    // the builder's Try it (?design=1) only: a demo value, e.g. a garage door's contact following the door
    demoAttr: (id, name, value) => { if (!DESIGN) return; let a = hub.attrs.get(id); if (!a) hub.attrs.set(id, (a = {})); a[name] = value; changed(); },
    toggleWindow(id) { const w = state.windows.find((w) => w.id === id); if (w) { w.open = !w.open; changed(); } },
    toggleDoor(id) { const d = state.doors.find((d) => d.id === id); if (d) { d.open = !d.open; changed(); } },
    // calendar
    // only events from calendars switched on in Settings → Calendars
    events: () => state.events.filter((e) => !window.Settings || ((Settings.v.calendars || []).find((c) => c.id === e.cal) || {}).on !== false),
    // the house's calendars this panel shows (from the service; [] while it shows the samples), and one's look:
    // {id, name, color, icon?} — this panel's own colour (Manager → Panels → People & calendars) before the house's
    calendars: () => cal.list,
    // a small line under the calendar: calendars that never worked ("broken": true), or a cut-off list (more: true)
    calNote: () => {
      const bad = cal.live ? cal.list.filter((c) => c.broken === true).map((c) => String(c.name || T("cal.aCalendar")).slice(0, 40)) : [];
      return [bad.length ? T("cal.cantRead", { names: T.list(bad) }) : "", cal.live && cal.more ? T("cal.nearestOnly") : ""].filter(Boolean).join(" · ");
    },
    calInfo: (id) => {
      const own = window.Settings && (Settings.v.calendars || []).find((c) => c.id === id), house = cal.list.find((c) => c.id === id);
      if (!own && !house) return null;
      return { ...(house || {}), ...(own || {}), color: (own && /^#[0-9a-fA-F]{6}$/.test(own.color || "") && own.color) || (house && house.color) || "#8b5cf6",
        name: (house && house.name) || (own && own.name) || id };
    },
    calendarLive: () => cal.live,
    eventsOn: (date) => api.events().filter((e) => dayKey(e.date) === dayKey(date)),
    hasEvents: (date) => api.events().some((e) => dayKey(e.date) === dayKey(date)),
    sameDay: (a, b) => dayKey(a) === dayKey(b),
  };

  // the greeting, the clock and the date in the panel's language and locale (strings.js: Intl — 12 or 24 hours)
  const dayPart = () => { const h = new Date().getHours(); return h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : "evening"; };
  api.greeting = () => T(`greet.${dayPart()}`);
  // "Good Morning, John & Jane" — the names as the language joins them (Intl.ListFormat), "everyone" without
  api.greetingFor = (names) => T(`greet.${dayPart()}Names`, { names: names && names.length ? T.list(names) : T("greet.everyone") });
  api.time = () => T.clock().time;
  api.ampm = () => T.clock().ampm;
  api.date = (opts, d = new Date()) => T.date(d, opts);
  setInterval(changed, 15000);

  // Only the panel itself drives the LEDs / speaks — a laptop browser previewing the page must not.
  // (nor the Manager's "Open live", v2.5.0: no check-in, LEDs, speech, measurements or benchmark from there)
  api.isPanel = !DESIGN && !window.PANEL_LIVE && (/Android/i.test(navigator.userAgent) || /[?&]panel\b/.test(location.search));
  // this panel's FreeKiosk device name (its MQTT topics freekiosk/<name>/…, panelagent/<name>/…, panel/<name>/show):
  // Manager → Panels → General; the main panel's default is "skypane", another panel's its own id
  api.kiosk = () => {
    const s = window.Settings && Settings.v, id = ((window.PanelStore && PanelStore.id) || "main").toLowerCase();
    return (s && typeof s.kioskName === "string" && /^[a-z0-9_-]{1,40}$/.test(s.kioskName) && s.kioskName)
      || (id === "main" ? "skypane" : id.replace(/[^a-z0-9_-]/g, "_").slice(0, 40));
  };
  api.publish = () => {};
  api.subscribe = () => {};
  // the page's line to the broker (status.js shows "Lost connection" from it): mqtt null = no broker on this page,
  // true / false = connected or not, since = when that last changed (ms)
  api.link = { mqtt: null, since: Date.now() };
  const linkCbs = [];
  api.onLink = (cb) => linkCbs.push(cb);
  const setLink = (up) => {
    if (api.link.mqtt === up) return;
    api.link = { mqtt: up, since: Date.now() };
    linkCbs.forEach((cb) => { try { cb(api.link); } catch (e) { console.warn("[link]", e); } });
  };

  // (no broker on this server — PANEL_CONFIG.mqttOff, MQTT off: nothing to connect to, so no failing ws:// try on every
  // load; the page shows its usual "not connected" state, quietly)
  if (window.mqtt && !(window.PANEL_CONFIG && PANEL_CONFIG.mqttOff === true)) {
    // the dashboard service tells the page where the broker is (PANEL_CONFIG.mqttUrl, from the Manager's settings);
    // otherwise it's on the same machine as the page (the laptop test setup)
    const host = location.hostname || "localhost";
    const mqttUrl = (window.PANEL_CONFIG && PANEL_CONFIG.mqttUrl) || `ws://${host}:9001`;
    // the broker's WebSocket listener needs a login (PANEL_CONFIG.mqttUser / mqttPass, from the service) so pages on
    // other websites can't use it; without one configured, connect as before
    const PC = window.PANEL_CONFIG || {}, login = PC.mqttUser ? { username: PC.mqttUser, password: PC.mqttPass || "" } : {};
    const client = mqtt.connect(mqttUrl, { clientId: `layout-${Math.random().toString(16).slice(2, 8)}`, reconnectPeriod: 5000, ...login });
    // (the builder's demo canvas listens only: it never publishes — no commands, acks, LEDs or speech)
    api.publish = DESIGN ? () => {} : (topic, msg) => client.publish(topic, typeof msg === "string" ? msg : JSON.stringify(msg), { qos: 1 });
    // extra subscriptions for other modules, e.g. Hubitat rules asking the panel to show a camera
    const subs = [];
    api.subscribe = (topic, cb) => { subs.push([topic, cb]); client.subscribe(topic); };
    // one handler failing on a bad message must not stop the others (or mqtt.js's own message handling)
    client.on("message", (topic, payload) => subs.forEach(([t, cb]) => {
      if (t === topic) try { cb(payload.toString()); } catch (e) { console.warn(`[mqtt] ${topic}:`, e); }
    }));
    client.on("connect", () => subs.forEach(([t]) => client.subscribe(t)));
    // Broker gone: not "live" any more, so taps aren't queued by mqtt.js and sent minutes later. Live again when the
    // retained hubitat/state arrives after the reconnect. Settings saved by another screen meanwhile were announced
    // while this page couldn't hear it: fetch them on every (re)connect.
    client.on("close", () => { hub.live = false; setLink(false); hubSaid(null); });
    client.on("connect", () => setLink(true));
    api.link = { mqtt: false, since: Date.now() };   // (connecting: not up yet)
    client.on("connect", () => { if (window.PanelStore) PanelStore.pull(); });
    client.on("connect", () => client.subscribe([`${agentTopic()}/temperature`, `${agentTopic()}/humidity`]));
    client.on("message", (topic, payload) => {
      if (topic !== `${agentTopic()}/temperature` && topic !== `${agentTopic()}/humidity`) return; // other topics: api.subscribe
      const v = parseFloat(payload.toString());
      if (topic.endsWith("/temperature")) state.inside.temp = Math.round((v * 9) / 5 + 32);
      else state.inside.humidity = Math.round(v);
      state.inside.live = true;
      changed();
    });

    // ---- Hubitat live state ----
    const num = (v) => (v == null || v === "" || isNaN(+v) ? null : +v);
    const set = (o, k, v) => { if (v == null || o[k] === v) return false; o[k] = v; return true; };
    // one attribute of one device → the matching pieces of state; returns true if anything changed
    function apply(id, name, value) {
      let hit = false;
      const d = find(id);
      if (d) {
        if (name === "switch" && d.cmd !== "openclose") { // (a valve / garage controller goes by "valve" / "door")
          // anything but on/off (e.g. "unknown") = the hub doesn't know: shown red as "Unknown"; a tap turns it on
          const known = value === "on" || value === "off";
          hit = set(d, "unknown", !known) || hit;
          hit = set(d, "on", value === "on") || hit; if (d.kind === "fan" && value === "off") hit = set(d, "speed", "off") || hit;
        }
        else if (name === "level" && d.kind !== "fan" && ("level" in d || d.dim)) hit = set(d, "level", num(value)) || hit;
        else if (name === "hue" && d.rgb) hit = set(d, "hue", num(value)) || hit;
        else if (name === "saturation" && d.rgb) hit = set(d, "sat", num(value)) || hit;
        else if (name === "colorTemperature" && d.white) {
          let k = num(value); if (k > 0 && k < 1000) k = Math.round(1e6 / k); // some Zigbee bulbs report mireds
          hit = set(d, "ct", k) || hit;
        }
        else if (name === "colorMode" && (d.rgb || d.white) && typeof value === "string") hit = set(d, "mode", value) || hit;
        else if (name === "position" && d.kind === "shade") hit = set(d, "level", num(value)) || hit;
        else if (name === "valve" && d.kind === "valve" && d.cmd === "openclose") hit = set(d, "on", value === "open") || hit;
        else if (name === "door" && d.kind === "garage" && d.cmd === "openclose") {
          hit = set(d, "on", value === "open" || value === "opening") || hit;
          if (["open", "opening", "closed", "closing"].includes(value)) hit = set(d, "door", value) || hit;
        }
        else if (name === "speed" && d.kind === "fan") { hit = set(d, "speed", ["low", "medium", "high", "off"].includes(value) ? value : value === "medium-high" ? "high" : value === "medium-low" ? "low" : d.speed) || hit; }
      }
      const p = state.presence.find((x) => x.id === id);
      if (p && name === "presence") hit = set(p, "home", value === "present") || hit;
      const l = state.locks.find((x) => x.id === id);
      // only known states: the value ends up in the page's HTML (class name), and the broker is open on the LAN
      if (l && name === "lock" && ["locked", "unlocked", "unknown"].includes(value)) hit = set(l, "lock", value) || hit;
      if (l && name === "battery") hit = set(l, "battery", num(value)) || hit;
      if (name === "contact") {
        const w = state.windows.find((x) => x.id === id); if (w) hit = set(w, "open", value === "open") || hit;
        const dr = state.doors.find((x) => x.id === id); if (dr) hit = set(dr, "open", value === "open") || hit;
      }
      const t = state.thermostat;
      if (id === t.id) {
        if (name === "temperature") hit = set(t, "temp", num(value)) || hit;
        else if (name === "heatingSetpoint") hit = set(t, "heat", num(value)) || hit;
        else if (name === "coolingSetpoint") hit = set(t, "cool", num(value)) || hit;
        // (always a redraw: the mode / fan buttons show the thermostat's own mode, e.g. Auto, not only the dial's)
        else if (name === "thermostatMode" || name === "thermostatFanMode") { hub.tm = { ...hub.tm, [name]: value }; set(t, "mode", tMode()); hit = true; }
      }
      if (id === OUTSIDE_ID) {
        if (name === "temperature") hit = set(state.outside, "temp", num(value)) || hit;
        if (name === "humidity") hit = set(state.outside, "humidity", num(value)) || hit;
      }
      const s = state.sensors.find((x) => x.id === id);
      if (s) hit = sensor(s, name, value) || hit;
      // things keep every attribute the bridge sends as is (strings/numbers only)
      const th = thingById.get(id);
      if (th && (typeof value === "string" || typeof value === "number") && th.attrs[name] !== value) { th.attrs[name] = value; hit = true; }
      // every attribute of every device, as the bridge sends it (the layout builder's cards: values, show-when rules);
      // a change redraws only when a card on screen watches that device (Home.watch)
      if (typeof value === "string" || typeof value === "number") {
        let a = hub.attrs.get(id); if (!a) hub.attrs.set(id, (a = {}));
        if (a[name] !== value) { a[name] = value; if (hub.watched.has(id)) hit = true; }
      }
      return hit;
    }
    const OUTSIDE_ID = HUB.outside ? HUB.outside.id : null; // the outside temperature sensor (house model)
    function tMode() {
      const m = (hub.tm || {}).thermostatMode, f = (hub.tm || {}).thermostatFanMode;
      if (m === "heat" || m === "emergency heat") return "heat";
      if (m === "cool") return "cool";
      if (m === "off") return f === "on" || f === "circulate" ? "fan" : "off";
      // auto: the set point nearer the room's temperature (as Home.thermo does for a picked thermostat)
      const t = state.thermostat;
      if (m === "auto" && Number.isFinite(t.temp)) return autoSide(t.id, t.temp, t.heat, t.cool);
      return t.mode; // anything else: the dial has no such mode — keep what it shows
    }
    // the house's safety sensors: what each one reports, for the cards and room pages to SHOW (state clear | detected,
    // a freezer's temperature). They raise no alert here — every alert rule lives in Hubitat and comes as a pushed
    // alert (hubalerts.js). A freezer's limit (Manager → Devices) only colours it: Home.sensorWarn.
    function sensor(s, name, value) {
      hub.sv = hub.sv || {}; const v = (hub.sv[s.id] = { ...hub.sv[s.id], [name]: value });
      let bad = null;
      if (s.kind === "smoke") bad = v.smoke === "detected" || v.carbonMonoxide === "detected";
      else if (s.kind === "gas") bad = v.naturalGas === "detected" || v.smoke === "detected";
      else if (s.kind === "water") bad = v.water === "wet";
      else if (s.kind === "power") bad = v.powerSource != null ? !["mains", "dc"].includes(v.powerSource) : null;
      else if (s.kind === "freezer" && name === "temperature" && num(value) != null) return set(s, "temp", num(value));
      if (bad == null) return false;
      return set(s, "state", bad ? "detected" : "clear");
    }
    const CONTROL = new Set(["switch", "level", "speed", "position", "lock", "heatingSetpoint", "coolingSetpoint", "thermostatMode", "thermostatFanMode"]);
    let renderTimer = null;
    const soon = () => { if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; changed(); }, 150); };
    const isObj = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
    const parse = (msg) => { try { const x = JSON.parse(msg); return isObj(x) ? x : null; } catch { return null; } };
    api.subscribe("hubitat/state", (msg) => {
      const all = parse(msg); if (!all || !Object.keys(all).length) return;
      if (!hub.live) {
        // thermostat mode needs both attributes together
        const t = all[state.thermostat.id]; if (isObj(t)) hub.tm = { thermostatMode: t.thermostatMode, thermostatFanMode: t.thermostatFanMode };
      }
      for (const [id, attrs] of Object.entries(all)) if (isObj(attrs)) for (const [k, v] of Object.entries(attrs)) apply(+id, k, v);
      hub.pending.clear(); // a full state is the truth
      hub.live = true;
      hubSaid(null);
      soon();
    });
    api.subscribe("hubitat/event", (msg) => {
      const e = parse(msg); if (!e || typeof e.name !== "string") return;
      if (CONTROL.has(e.name)) hub.pending.delete(+e.id); // the device reported back: nothing left to undo
      // a real, known on/off or lock state from the device itself → tryKnown needs no "refresh" (not battery etc.,
      // not the 5-minute full state)
      if ((e.name === "switch" && (e.value === "on" || e.value === "off")) || (e.name === "lock" && (e.value === "locked" || e.value === "unlocked"))) hub.heard.set(+e.id, Date.now());
      if (apply(+e.id, e.name, e.value)) soon();
      hubSaid(+e.id);
    });
    api.subscribe("hubitat/cmd/result", (msg) => {
      const r = parse(msg); if (!r || r.command === "refresh") return; // tryKnown's refresh has no undo of its own
      // only answers to commands THIS page sent: not another panel's, nor old ones replayed when the page starts
      const mk = `${r.id}|${r.command}`, mine = hub.mine.get(mk) || 0; if (!mine) return;
      if (mine > 1) hub.mine.set(mk, mine - 1); else hub.mine.delete(mk);
      const w = hub.waiters.get(`${r.id}|${r.command}`); if (w) w(r);  // a PIN pad waiting for this answer
      const undo = hub.pending.get(r.id);
      if (r.ok) { hub.pending.delete(r.id); return; } // the real value arrives as an event
      if (undo) { hub.pending.delete(r.id); undo(); soon(); }
      console.warn(`Hubitat command ${r.command} for ${r.id} refused: ${r.reason}`);
    });
    api.subscribe("hubitat/bridge/status", (msg) => { hub.bridge = msg; if (msg === "offline") { hub.live = false; hubSaid(null); } });
    // the panel as a speaker (the Skypane Notifier's speak / setVolume / mute — docs/hubitat-notifier.md): status.js
    // (PanelSpeech) checks every field and speaks; one-shot messages, never retained
    api.subscribe("hubitat/say", (msg) => { const m = parse(msg); if (m && window.PanelSpeech) PanelSpeech.say(m); });
    api.subscribe("hubitat/volume", (msg) => { const m = parse(msg); if (m && window.PanelSpeech) PanelSpeech.volume(m); });
  }

  // ---------- the house's calendars (service/calendars.py): this panel's events, every few minutes ----------
  // {cal, title, start, end, allDay, where?} → the shape the cards draw ({date, time, title, who, cal, cat}); an event
  // over several days is shown on each of its days ("cont": not again under "Coming up")
  const timeOf = (d) => T.time(d);
  const dateOnly = (s) => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  function toCards(list, cals) {
    const name = new Map(cals.map((c) => [c.id, c.name])), out = [];
    for (const e of list) {
      if (!e || typeof e.title !== "string") continue;
      const who = [name.get(e.cal) || "", e.where || ""].filter(Boolean).join(" · ");
      const base = { title: e.title, who, cal: e.cal, cat: category(e.title), where: e.where || "", allDay: !!e.allDay };
      if (e.allDay) {
        const s = dateOnly(e.start), en = dateOnly(e.end) || (s && new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1));
        if (!s) continue;
        for (let d = new Date(s), i = 0; d < en && i < 62; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), i++)
          out.push({ ...base, date: new Date(d), time: T("cal.allDay"), cont: i > 0 });
      } else {
        const s = new Date(e.start), en = new Date(e.end);
        if (isNaN(s)) continue;
        out.push({ ...base, date: s, time: timeOf(s), end: isNaN(en) ? s : en });
        // (into the next days: those show it from midnight — "until 10:00 AM", or all day when it goes on)
        for (let d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1), i = 0; !isNaN(en) && d < en && i < 62; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), i++) {
          const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
          out.push({ ...base, date: new Date(d), time: en < next ? T("cal.until", { time: timeOf(en) }) : T("cal.allDay"), cont: true });
        }
      }
    }
    // (all-day ones first on their day: they start at midnight)
    return out.sort((a, b) => a.date - b.date || (b.allDay - a.allDay) || a.title.localeCompare(b.title));
  }
  const cal = { live: false, list: [] };
  // guest mode with "blur the calendar" on this panel (v2.9.3; guestlock.js): the events are really gone —
  // none in memory, none on the page — and the service doesn't hand them out either (it answers this panel's
  // /events only with a "reveal" ticket while the blur is on). Hidden from the first moment on such a panel (fail
  // closed, before guestlock.js has its say); the PIN on the card gets a ticket (guestlock.js) and the events come with
  // it in a header — never in the address — until the window ends: then they're dropped again. Never stored anywhere.
  const veil = { hidden: !DESIGN && !!(window.PANEL_LOCKDOWN && window.PANEL_LOCKDOWN.blur === true), ticket: "", until: 0 };
  const dropEvents = () => { state.events = []; cal.list = []; cal.more = false; };
  if (veil.hidden) dropEvents();
  api.hideEvents = (on) => {
    if (on !== false) {   // (blurred — again: a reveal's window ended — the ticket and every event dropped)
      veil.ticket = ""; veil.until = 0;
      if (!veil.hidden || state.events.length || cal.list.length) { veil.hidden = true; dropEvents(); changed(); }
      return;
    }
    if (!veil.hidden) return;
    veil.hidden = false; veil.ticket = ""; veil.until = 0;
    setTimeout(loadEvents, 0);   // (guest mode off: the events as usual)
  };
  // the PIN was right: the ticket (and how long it lasts, ≤ 5 min) → the events, shown until then
  api.revealEvents = (ticket, seconds) => {
    if (typeof ticket !== "string" || !ticket || ticket.length > 512) return Promise.resolve(false);
    veil.ticket = ticket; veil.until = Date.now() + Math.min(Math.max(+seconds || 0, 1), 300) * 1000;
    return loadEvents();
  };
  api.eventsHidden = () => veil.hidden && !(veil.ticket && Date.now() < veil.until);
  async function loadEvents() {
    if (DESIGN) return;   // (the builder's demo canvas: the samples)
    if (veil.hidden && !(veil.ticket && Date.now() < veil.until)) return false;   // (blurred: nothing asked, nothing kept)
    const ticket = veil.hidden ? veil.ticket : "";
    try {
      const r = await fetch(`/api/panel/${encodeURIComponent(panelId())}/events`, { cache: "no-store", ...(ticket ? { headers: { "X-Skypane-Reveal": ticket } } : {}) });
      if (veil.hidden && (!ticket || veil.ticket !== ticket)) return false;   // (hidden again while it was on its way)
      if (!r.ok) return;   // (an older service, a hiccup: what's shown stays)
      const d = await r.json();
      if (veil.hidden && (!ticket || veil.ticket !== ticket)) return false;
      if (veil.hidden && d && d.hidden === true) return false;   // (the service didn't take the ticket)
      if (!d || d.configured !== true || !Array.isArray(d.events)) {
        // (hidden: without a ticket nothing — never the samples behind the veil; shown with one and the house has no
        // calendar: what any panel without one shows, the samples)
        if (veil.hidden) { if (!ticket) return false; cal.live = false; cal.list = []; cal.more = false; state.events = events; changed(); return true; }
        if (cal.live) { cal.live = false; cal.list = []; state.events = events; changed(); }   // (all removed: the samples again)
        return;
      }
      cal.live = true;
      cal.list = (Array.isArray(d.calendars) ? d.calendars : []).filter((c) => c && typeof c.id === "string");
      cal.more = d.more === true;   // (more events than one answer carries: the nearest ones came)
      state.events = toCards(d.events, cal.list);
      changed();
      return true;
    } catch { return false; }
  }
  setTimeout(loadEvents, 300);
  setInterval(loadEvents, 5 * 60000);
  // a calendar changed (Manager, or a fetch found new events): every panel loads again — spread over a few seconds
  api.subscribe("dashboard/calendars/changed", () => setTimeout(loadEvents, Math.random() * 8000));
  // this panel's own choices changed (Manager → People & calendars): the list of calendars it shows may differ
  if (window.PanelStore && PanelStore.onChange) PanelStore.onChange((keys) => { if (cal.live && (!Array.isArray(keys) || keys.includes("settings"))) setTimeout(loadEvents, 500); });
  api.reloadEvents = loadEvents;

  window.Home = api;
})();
