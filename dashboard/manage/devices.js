// Skypane Manager — Devices (v2.4.0; the design notes): every Hubitat device,
// in two views — remembered per login (shell.js), the filters and the device open shared between them:
//   Basic     grouped by room (or A–Z; a list or tiles), a status strip (lights on, open, unlocked, low battery,
//             offline: a click filters), key:value filter chips (room: type: state: rule: battery: driver:) typed in
//             a box that suggests, and the editor in a drawer pinned to the right (it slides over below 1200 px).
//   Detailed  KPI tiles, a facet pane, a dense sortable table (driver = the Hubitat type name: the decision 2),
//             row selection with bulk changes (room, shows as, the panel PIN, may switch, hide — one PATCH, all or
//             nothing) and a slide-over editor with tabs: Settings, Details, Events, Panels.
// A phone gets Basic only (stacked; the editor as a sheet). Live values, battery and last activity come from
// GET /api/manage/devices (and /live every 15 s while the page is open: service/live_state.py); a device's last
// events from /api/manage/devices/<id>/events, the panels showing it from …/<id>/panels; "new devices found" from
// firstSeen (PATCH {action: "reviewed"}). Changes: PATCH /api/manage/devices {id, set} | {ids, set} — every panel
// follows once the Hubitat bridge rebuilt the house model.
// Built with DOM calls + textContent only: names from the hub are never parsed as HTML (the device icons are the
// panels' own constant drawings).
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast, iconEl } = M, ic = K.icon;
  const POLL = 15000, BATTERY_LOW = 15;

  // ================================================================== what kind of thing each one is
  const SWITCHY = ["light", "fan", "outlet", "switch", "valve", "garage", "thing:garage"];
  const NEEDS_ROOM = ["light", "fan", "outlet", "switch", "shade", "valve", "garage"];
  const FIXED_PIN = ["valve", "garage", "thing:garage"];
  const FAN_NAMES = { ceiling: K.t("devices.fan.ceiling"), box: K.t("devices.fan.box"), pedestal: K.t("devices.fan.pedestal"), desk: K.t("devices.fan.desk"), tower: K.t("devices.fan.tower") };
  const LT = { onoff: K.t("devices.lightType.onoff"), dim: K.t("devices.lightType.dim"), ct: K.t("devices.lightType.ct"), rgb: K.t("devices.lightType.rgb"), rgbct: K.t("devices.lightType.rgbct") };
  // (the filter's type: — one word per kind)
  const TYPE_OF = (k) => {
    if (!k || k === "hidden") return "hidden";
    if (k === "light" || k === "fan" || k === "outlet" || k === "switch" || k === "shade" || k === "valve" || k === "lock" || k === "window" || k === "camera") return k;
    if (k === "garage" || k === "thing:garage") return "garage";
    if (k === "thing:smart-outlet") return "outlet";
    if (["thermostat", "climate", "outside-temp", "thing:air", "thing:purifier"].includes(k)) return "climate";
    if (["door-in", "door-out", "contact"].includes(k)) return "door";
    if (k === "motion" || k === "temp-alert" || /^sensor:|^thing:(leak|gas|vibration|smoke|water)$/.test(k)) return "sensor";
    if (/^thing:(washer|dryer|dishwasher|fridge|oven|microwave|siren)$/.test(k)) return "appliance";
    if (k === "thing:speaker") return "speaker";
    if (k === "presence") return "person";
    if (k === "thing:mode" || k === "thing:guest") return "mode";
    return "other";
  };
  const ICON_FOR = { light: "bulb", fan: "fan", outlet: "plug", switch: "power", shade: "shade", valve: "drop", garage: "car",
    lock: "lock", window: "window", "door-in": "door", "door-out": "door", camera: "film", presence: "user", thermostat: "thermo",
    "outside-temp": "thermo", climate: "thermo", motion: "motion", contact: "door", "temp-alert": "thermo",
    "thing:speaker": "music", "thing:washer": "drop", "thing:dryer": "wind", "thing:dishwasher": "drop", "thing:fridge": "kitchen",
    "thing:oven": "kitchen", "thing:microwave": "kitchen", "thing:siren": "shield", "thing:air": "wind", "thing:purifier": "fan",
    "thing:mode": "settings", "thing:guest": "user", "thing:smart-outlet": "plug", "thing:garage": "car",
    "sensor:smoke": "shield", "sensor:gas": "shield", "sensor:water": "drop", "sensor:freezer": "thermo", "sensor:power": "power" };
  const TYPE_ICON = { sensor: "motion", appliance: "kitchen", climate: "thermo", door: "door", person: "user", mode: "settings", hidden: "x", other: "grid" };

  // ================================================================== state kept between the views
  const st = { chips: [], q: "", cur: null, open: false, sel: new Set(), sort: { k: "name", dir: 1 }, tab: "settings" };
  const LKEY = "hp-manage-view";   // (Basic's own layout, kept in this browser as before: rows | rows-room | tiles | tiles-room)
  let layout = (() => { try { const v = JSON.parse(localStorage.getItem(LKEY) || "{}").layout; return /^(rows|tiles)(-room)?$/.test(v) ? v : "rows-room"; } catch { return "rows-room"; } })();
  const saveLayout = () => { try { localStorage.setItem(LKEY, JSON.stringify({ layout })); } catch {} };
  let pollT = null, refreshT = null, liveSig = "";   // (liveSig: the last /live answer's — the same again: nothing to draw)
  const events = new Map(), panelsOf = new Map();   // id → {at, list} (asked again after 15 s)
  M.onReset(() => { st.chips = []; st.q = ""; st.cur = null; st.open = false; st.sel.clear(); events.clear(); panelsOf.clear(); clearTimeout(pollT); clearTimeout(refreshT); liveSig = ""; });

  const D = () => M.devices();
  const onPage = () => S.route().page === "devices" && document.body.classList.contains("signed-in");
  const viewNow = () => (S.isPhone() ? "basic" : S.view("devices") || "basic");

  // ================================================================== one device, worked out (for the rows, filters, table)
  const ago = (t) => K.ago(t, "short");   // (kit.js: one "time ago" for every page)
  const when = (t) => {
    const d = new Date(t * 1000), now = new Date();
    const hm = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return d.toDateString() === now.toDateString() ? hm : `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${hm}`;
  };
  const num = (v) => { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
  const word = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  // ctx (allInfo, once per draw): the new ids as a Set, each device's groups
  function info(c, ctx) {
    const d = D(), o = d.overrides[c.id] || {}, lv = (d.live || {})[c.id] || {};
    const role = o.as || c.is || "";
    const ov = optOf(c.id);   // (v2.9.2: a command just sent shows its new state at once — until confirmed or undone)
    const v = { ...(c.attrs || {}), ...(lv.values || {}), ...(ov ? ov.patch : {}) };
    const b = lv.battery != null ? lv.battery : num(v.battery);
    const battery = b != null && b >= 0 && b <= 100 ? Math.round(b) : null;
    const health = lv.health || (v.healthStatus === "offline" || v.healthStatus === "online" ? v.healthStatus : null);
    const states = [];
    let main = null;   // [words, look: ok | warn | bad | idle | lit]
    if (health === "offline") { states.push("offline"); main = [K.t("devices.state.offline"), "bad"]; }
    const lock = v.lock === "locked" ? "locked" : v.lock === "unlocked" ? "unlocked" : null;
    const contact = v.contact === "open" || v.contact === "closed" ? v.contact : null;
    const shade = typeof v.windowShade === "string" ? (v.windowShade === "closed" ? "closed" : /open/.test(v.windowShade) ? "open" : null) : null;
    const sw = v.switch === "on" || v.switch === "off" ? v.switch : null;
    if (lock) states.push(lock);
    if (contact) states.push(contact);
    else if (shade) states.push(shade);
    if (sw) states.push(sw);
    if (v.motion === "active") states.push("motion");
    if (v.presence === "present") states.push("home"); else if (v.presence === "not present") states.push("away");   // i18n-ok (a server value / selectors / CSS)
    if (v.water === "wet" || v.smoke === "detected") states.push("alarm");
    if (battery != null && battery < BATTERY_LOW) states.push("low-battery");
    if (!main) {
      const t = num(v.temperature), lvl = num(v.level);
      if (lock) main = [word(K.t(lock === "locked" ? "control.stLocked" : "control.stUnlocked")), lock === "locked" ? "ok" : "warn"];
      else if (contact || shade) main = [word(K.t((contact || shade) === "open" ? "control.stOpen" : "control.stClosed")), (contact || shade) === "open" ? "warn" : "idle"];
      else if (v.water === "wet") main = [K.t("devices.state.wet"), "bad"];
      else if (v.smoke === "detected") main = [K.t("devices.state.smoke"), "bad"];
      else if (sw) main = [sw === "on" ? (lvl != null && role === "light" ? K.t("devices.state.onLevel", { n: Math.round(lvl) }) : K.t("control.on")) : K.t("control.off"), sw === "on" ? "lit" : "idle"];
      else if (v.motion) main = [v.motion === "active" ? K.t("devices.state.motion") : K.t("devices.state.noMotion"), v.motion === "active" ? "ok" : "idle"];
      else if (v.presence) main = [v.presence === "present" ? K.t("devices.state.home") : K.t("devices.state.away"), v.presence === "present" ? "ok" : "idle"];
      else if (typeof v.thermostatMode === "string") main = [`${word(v.thermostatMode)}${t != null ? ` · ${Math.round(t)}°` : ""}`, "ok"];
      else if (v.water === "dry") main = [K.t("devices.state.dry"), "ok"];   // (a leak sensor: dry, not its temperature)
      else if (t != null) main = [`${Math.round(t * 10) / 10}°`, "ok"];
      else if (typeof v.status === "string" && v.status) main = [word(v.status).slice(0, 24), "ok"];
      else main = ["—", "idle"];
    }
    // (v2.9.2 gate 2) a device this login switches from the Manager: its pill says what "Now:" says (the relay of a
    // garage door, a valve) — also while a command is shown at once
    const cm = health !== "offline" ? controlsOf(c.id) : null;
    if (cm && cm.length) {
      const now = stateNow(v);
      if (now !== K.t("control.stUnknown")) main = [now[0].toUpperCase() + now.slice(1), /unlocked|open/.test(now) ? "warn" : /^on/.test(now) ? "lit" : /locked/.test(now) ? "ok" : "idle"];
    }
    const groups = ctx ? ctx.groups.get(c.id) || [] : (d.groups || []).filter((g) => (g.devices || []).includes(c.id));
    const rules = [];
    if (o.confirm || FIXED_PIN.includes(role) || groups.some((g) => g.pin)) rules.push("pin");
    if (o.unlock === "pin" || groups.some((g) => g.unlock)) rules.push("unlock");
    if (d.switchable && d.switchable.has(c.id) && d.never && d.never.has(c.id)) rules.push("view-only");
    if (!role || role === "hidden") rules.push("hidden");
    if (Object.keys(o).length) rules.push("changed");
    const isNew = ctx ? ctx.isNew.has(c.id) : (d.newIds || []).includes(c.id);
    return { c, o, id: c.id, name: c.label || K.t("devices.unnamed", { id: c.id }), role, type: TYPE_OF(role), room: o.room || c.room || c.hubRoom || K.t("devices.noRoom"), noRoom: !(o.room || c.room || c.hubRoom),   // (v3.0.0: the flag decides, the words only show)
      states, main, battery, health, lastAt: lv.lastAt || null, driver: c.type || "", rules, isNew, firstSeen: (d.firstSeen || {})[c.id] || null, vals: v, pending: !!ov };
  }
  const iconOf = (i) => ICON_FOR[i.role] || TYPE_ICON[i.type] || "grid";
  // (v2.9.2) the state a command just sent asks for, shown at once over the reported one: device id →
  // {patch, until}. A live poll meanwhile never flips it back — only the device's own report (confirmed: dropped) or
  // the end of the window / a refusal (undone: the real state, and one line why). Never kept past `until`.
  const opt = new Map();
  const optOf = (id) => { const o = opt.get(id); if (o && Date.now() > o.until) { opt.delete(id); return null; } return o || null; };
  function allInfo() {
    const d = D(); if (!d || !Array.isArray(d.devices)) return [];
    const groups = new Map();
    for (const g of d.groups || []) for (const id of g.devices || []) { if (!groups.has(id)) groups.set(id, []); groups.get(id).push(g); }
    const ctx = { groups, isNew: new Set(d.newIds || []) };
    return d.devices.map((c) => info(c, ctx));
  }

  // ================================================================== filters: key:value chips (shared by both views)
  const KEYS = {
    // ("room:none" typed works in any language too — an alias for matching only, never a row of its own in the filter)
    room: { d: K.t("devices.filter.room"), get: (i) => [i.room], alias: (i) => (i.noRoom ? ["none"] : []) },
    type: { d: "light, lock, sensor, outlet…", get: (i) => [i.type] },   // i18n-ok (the values typed in the filter)
    state: { d: "on, off, open, unlocked, offline, low-battery…", get: (i) => i.states },   // i18n-ok (the values typed in the filter)
    rule: { d: "pin, unlock, view-only, hidden, changed", get: (i) => (i.rules.length ? i.rules : ["none"]) },   // i18n-ok (the values typed in the filter)
    battery: { d: "low, half, good, none (mains)", get: (i) => [i.battery == null ? "none" : i.battery < BATTERY_LOW ? "low" : i.battery < 50 ? "half" : "good"] },   // i18n-ok (the values typed in the filter)
    driver: { d: K.t("devices.filter.driver"), get: (i) => [i.driver || "—"] },
    new: { d: K.t("devices.filter.new"), get: (i) => [i.isNew ? "yes" : "no"], hidden: true },
  };
  const valuesOf = (k, list, aliases) => {
    const m = new Map();
    for (const i of list) for (const v of [...KEYS[k].get(i), ...(aliases && KEYS[k].alias ? KEYS[k].alias(i) : [])]) m.set(v, (m.get(v) || 0) + 1);
    // (rooms A–Z, K.t("devices.noRoom") last; the others: the most used first)
    return [...m.entries()].sort((a, b) => (k === "room" ? (a[0] === K.t("devices.noRoom")) - (b[0] === K.t("devices.noRoom")) || String(a[0]).localeCompare(String(b[0])) : 0)
      || b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  };
  const hay = (i) => `${i.name} ${i.driver} ${i.room} ${M.roleName(i.role)} ${i.id}`.toLowerCase();
  function matches(i, extraQ) {
    const by = {};
    for (const c of st.chips) (by[c.k] = by[c.k] || []).push(String(c.v).toLowerCase());
    for (const [k, vs] of Object.entries(by)) {
      if (k === "text") { if (!vs.every((v) => hay(i).includes(v))) return false; continue; }
      if (!KEYS[k]) continue;
      const have = [...KEYS[k].get(i), ...(KEYS[k].alias ? KEYS[k].alias(i) : [])].map((x) => String(x).toLowerCase());
      if (!vs.some((v) => have.includes(v))) return false;
    }
    const q = (extraQ == null ? st.q : extraQ).trim().toLowerCase();
    if (q && !/^\w+:/.test(q) && !hay(i).includes(q)) return false;
    return true;
  }
  const hasChip = (k, v) => st.chips.some((c) => c.k === k && String(c.v).toLowerCase() === String(v).toLowerCase());
  function addChip(k, v) { if (!hasChip(k, v)) st.chips.push({ k, v: String(v) }); }
  function toggleChip(k, v) {
    const n = st.chips.findIndex((c) => c.k === k && String(c.v).toLowerCase() === String(v).toLowerCase());
    if (n >= 0) st.chips.splice(n, 1); else st.chips.push({ k, v: String(v) });
  }
  // a typed "room:Kitchen" (Enter without picking): the chip, if it names a value that exists
  function typedChip(text, list, dry) {
    const m = /^(\w+):(.+)$/.exec(text.trim());
    if (!m || !KEYS[m[1].toLowerCase()]) return false;
    const k = m[1].toLowerCase(), want = m[2].trim().toLowerCase();
    const hit = valuesOf(k, list, true).find(([v]) => String(v).toLowerCase() === want) || valuesOf(k, list).find(([v]) => String(v).toLowerCase().startsWith(want));
    if (!hit) return false;
    if (!dry) addChip(k, hit[0]);
    return true;
  }
  // "state:bogus": a key we know with a value no device has — say so (the text stays to fix), no empty search
  function unknownValue(text) {
    const m = /^(\w+):(.+)$/.exec(text.trim());
    if (!m || !KEYS[m[1].toLowerCase()] || typedChip(text, allInfo(), true)) return false;
    toast(K.t("devices.filter.noValue", { k: m[1].toLowerCase(), v: m[2].trim() }), true);
    return true;
  }
  const chipText = (c) => (c.k === "text" ? `“${c.v}”` : null);
  function chipEl(c, n) {
    return el("span.fchip", {}, c.k === "text" ? chipText(c) : [el("span.k", {}, `${c.k}:`), c.v],
      el("button", { type: "button", "aria-label": K.t("devices.filter.removeOne", { f: c.k === "text" ? c.v : `${c.k}:${c.v}` }), "data-tip": K.t("devices.filter.remove"),
        onclick: (e) => { e.stopPropagation(); st.chips.splice(n, 1); draw(); } }, ic("x", 12)));
  }

  // ================================================================== saving
  function refreshSoon(ms = 6000) {   // (the house model rebuilds a few seconds after a change: read again, then redraw)
    clearTimeout(refreshT);
    refreshT = setTimeout(async () => {
      try { await M.loadDevices(); } catch { return; }
      if (!onPage()) return;
      if (busy()) refreshSoon(3000); else draw();
    }, ms);
  }
  async function change(c, field, value) {
    const set = typeof field === "object" ? field : { [field]: value === "" ? null : value };
    const d = D();
    try {
      const was = d.overrides[c.id] || {};
      const r = await api("/api/manage/devices", { id: c.id, set });
      if (!r.ok) { toast(r.error || K.t("devices.notSaved"), true); return draw(); }
      if (was.room && !(r.overrides || {}).room) c.room = null;   // (its own room went: Hubitat's at once, not after the reload)
      d.overrides[c.id] = r.overrides;
      if (!Object.keys(r.overrides || {}).length) delete d.overrides[c.id];
      toast(M.follow());
      draw();
      refreshSoon();
    } catch (e) { if (e.message !== "login") toast(K.t("devices.unreachable"), true); }
  }
  async function setAllowed(c, allowed) {
    const d = D();
    try {
      const r = await api("/api/manage/never", { id: c.id, allowed });
      if (!r.ok) return toast(r.error || K.t("devices.notSaved"), true);
      if (allowed) d.never.delete(c.id); else d.never.add(c.id);
      toast(allowed ? K.t("devices.saved.may") : K.t("devices.saved.never"));
      try { await M.loadDevices(); } catch { /* (the old list stays) */ }   // (v2.9.1: what may be switched from here changed too)
      draw();
    } catch (e) { if (e.message !== "login") toast(K.t("devices.unreachable"), true); }
  }

  // ================================================================== the editor (Basic's drawer, Detailed's Settings tab)
  function settingsParts(c) {
    const d = D(), o = d.overrides[c.id] || {}, role = o.as || "", now = role || c.is;
    const parts = [];
    const sec = (title, ...rows) => el("div.dsec", {}, el("h4", {}, title), ...rows.filter(Boolean));
    const row = (label, ctl, hint) => el("div.drow", {}, el("div.rl", {}, el("b", {}, label), hint ? el("small", {}, hint) : null), ctl);
    const hasRoom = !!(o.room || (c.hubRoom && !d.noRoom.includes(c.hubRoom)));
    const opts = [...new Set([...(c.options || []), ...(role && !(c.options || []).includes(role) ? [role] : [])])];
    const type = el("select.dv-sel", { "data-fk": "ed-as", "aria-label": K.t("devices.showsAs"), onchange: (e) => change(c, "as", e.target.value) },
      el("option", { value: "" }, K.t("devices.ed.asAuto", { role: M.roleName(c.is) })),
      opts.map((k) => el("option", { value: k, selected: role === k, disabled: NEEDS_ROOM.includes(k) && !hasRoom && role !== k },
        ((a, b, role) => (a && b ? K.t("devices.ed.asNoRoomNotNow", { role }) : a ? K.t("devices.ed.asNoRoom", { role }) : b ? K.t("devices.ed.asNotNow", { role }) : role))(
          NEEDS_ROOM.includes(k) && !hasRoom, !((c.options || []).includes(k) || k === "hidden"), M.roleName(k)))));
    const room = el("select.dv-sel", { "data-fk": "ed-room", "aria-label": K.t("devices.room"), onchange: (e) => change(c, "room", e.target.value) },
      el("option", { value: "" }, c.hubRoom ? K.t("devices.ed.fromHub", { room: c.hubRoom }) : K.t("devices.noRoom")),
      d.rooms.filter((x) => x !== c.hubRoom).map((x) => el("option", { value: x, selected: o.room === x }, x)));
    const panelRows = [row(K.t("devices.showsAs"), type, K.t("devices.ed.showsAsHint")), row(K.t("devices.room"), room, K.t("devices.ed.roomHint"))];
    const DRAWN = /^(light|fan|outlet|switch|valve|garage|shade|thing:(garage|washer|dryer|dishwasher|oven|fridge|microwave|purifier))$/;
    if (M.pickPicture && (DRAWN.test(now) || o.icon)) {
      panelRows.push(row(K.t("devices.ed.picture"), el("div.dv-pic", {}, M.picturePreview(o.icon, 34),
        el("button.btn.sm", { type: "button", onclick: () => M.pickPicture(c.label, now, o.icon || "", (v) => change(c, "icon", v || null)) }, K.t("devices.ed.choose"))),
      K.t("devices.ed.pictureHint")));
    }
    parts.push(sec(K.t("devices.ed.onPanels"), ...panelRows));

    // what this kind of device has of its own
    const own = [];
    const LTs = c.lightTypes || [];
    if (now === "light" && LTs.length > 1) {
      own.push(row(K.t("devices.ed.lightType"), el("select.dv-sel", { "data-fk": "ed-lt", "aria-label": K.t("devices.ed.lightType"), onchange: (e) => change(c, "lightType", e.target.value) },
        el("option", { value: "" }, K.t("devices.ed.lightAuto")),
        LTs.map((k) => el("option", { value: k, selected: o.lightType === k }, LT[k] || k))), K.t("devices.ed.lightHint")));
      const colour = o.lightType ? ["rgb", "rgbct"].includes(o.lightType) : LTs.includes("rgb");
      if (colour) {
        own.push(row(K.t("devices.ed.colourCmd"), el("select.dv-sel", { "data-fk": "ed-cc", "aria-label": K.t("devices.ed.colourCmd"), onchange: (e) => change(c, "colorCmd", e.target.value === "hueSat" ? null : e.target.value) },
          el("option", { value: "hueSat", selected: o.colorCmd !== "setColor" }, K.t("devices.ed.wayHueSat")),
          el("option", { value: "setColor", selected: o.colorCmd === "setColor" }, K.t("devices.ed.wayOneCmd"))), K.t("devices.ed.colourHint")));
      }
    }
    if (now === "fan") {
      own.push(row(K.t("devices.ed.fanType"), el("select.dv-sel", { "data-fk": "ed-fan", "aria-label": K.t("devices.ed.fanType"), onchange: (e) => change(c, "fanType", e.target.value) },
        el("option", { value: "" }, K.t("devices.automatic")),
        d.fanTypes.map((k) => el("option", { value: k, selected: o.fanType === k }, FAN_NAMES[k] || k))), K.t("devices.ed.fanHint")));
    }
    if (now === "sensor:freezer") {
      own.push(row(K.t("devices.ed.warnAbove"), el("span.num-in", {}, el("input", { type: "number", min: "-40", max: "120", step: "1", "data-fk": "ed-max", "aria-label": K.t("devices.ed.warnAboveLabel"),
        placeholder: "—", value: o.alertAbove ?? "", style: "width:84px", onchange: (e) => {
          const v = e.target.value.trim(), n = Math.round(+v);
          if (v !== "" && !(Number.isFinite(n) && n >= -40 && n <= 120)) return toast(K.t("devices.ed.warnAboveBad"), true);
          change(c, "alertAbove", v === "" ? null : n);
        } }), " °F"), K.t("devices.ed.warnAboveHint")));
    }
    const showOnly = now === "thing:garage" && !(d.switchable && d.switchable.has(c.id));
    if (showOnly && (c.options || []).includes("garage")) {
      own.push(row(K.t("devices.ed.opening"), el("small.muted", {}, K.t("devices.ed.openingHow")), K.t("devices.ed.openingNow")));
    }
    if (own.length) parts.push(sec({ light: K.t("devices.ed.secLight"), fan: K.t("control.tFan"), "sensor:freezer": K.t("devices.ed.secFreezer") }[now] || K.t("devices.ed.secThis"), ...own));

    // safety: the PIN, unlocking, switching
    const safe = [];
    if (SWITCHY.includes(now)) {
      const fixed = FIXED_PIN.includes(now);
      safe.push(row(K.t("devices.ed.askPin"), K.sw(!!o.confirm || fixed, (v) => change(c, "confirm", v), K.t("devices.ed.askPin")),
        showOnly ? K.t("devices.ed.pinOnceOpen") : fixed ? K.t("devices.ed.pinFixed") : K.t("devices.ed.pinBefore")));
      if (fixed) safe[safe.length - 1].querySelector(".sw").disabled = true;
    }
    if (now === "lock") {
      const byGroup = (d.groups || []).filter((g) => g.unlock && (g.devices || []).includes(c.id)).map((g) => g.name);
      const s = K.sw(o.unlock === "pin" || byGroup.length > 0, (v) => change(c, "unlock", v ? "pin" : null), K.t("devices.ed.mayUnlock"));
      if (byGroup.length > 0 && o.unlock !== "pin") s.disabled = true;
      safe.push(row(K.t("devices.ed.mayUnlock"), s, byGroup.length ? K.t("devices.ed.unlockByGroup", { groups: byGroup.join(", ") })
        : K.t("devices.ed.unlockHint")));
    }
    if (d.switchable && d.switchable.has(c.id)) {
      const [may, off] = { lock: [K.t("devices.ed.mayLock"), K.t("devices.ed.mayLockOff")],
        thermostat: [K.t("devices.ed.mayChange"), K.t("devices.ed.mayChangeOff")],
        garage: [K.t("devices.ed.mayOpen"), K.t("devices.ed.mayOpenOff")],
        valve: [K.t("devices.ed.mayOpen"), K.t("devices.ed.mayOpenOff")] }[now] || [K.t("devices.maySwitch"), K.t("devices.ed.maySwitchOff")];
      safe.push(row(may, K.sw(!d.never.has(c.id), (v) => setAllowed(c, v), may), off));
    }
    if (safe.length) parts.push(sec(K.t("devices.ed.safety"), ...safe));
    return parts;
  }
  // the editor's foot: "Back to automatic" (every field at once, the switching exception too)
  function footFor(c) {
    const d = D(), o = d.overrides[c.id] || {};
    const switchOwn = d.switchable && d.switchable.has(c.id) && d.byName && d.never.has(c.id) !== d.byName.has(c.id);
    const changed = Object.keys(o).length || switchOwn;
    return el("div.dfoot", {}, el("small", {}, changed ? K.t("devices.ed.changed") : K.t("devices.ed.auto")),
      !changed ? null : el("button.btn.sm", { type: "button", onclick: async () => {   // (only when something was changed by hand)
        if (switchOwn) await setAllowed(c, !d.byName.has(c.id));
        if (Object.keys(o).length) await change(c, Object.fromEntries(Object.keys(o).map((f) => [f, null])));
      } }, K.t("devices.ed.backToAuto")));
  }
  // (v2.9.3 gate 2: a device with a Control section says "Now:" there — one line, not two)
  // (a sentence with a live element in it: the words around {x} from the table, the element where {x} is)
  const tEl = (key, node) => { const [a, b = ""] = K.t(key, { x: "\u0001" }).split("\u0001"); return [a, node, b].filter((p) => p !== ""); };
  const stateLine = (i) => el("div.dstate", {}, el("span.dot." + dotOf(i.main[1])), (controlsOf(i.id) || []).length ? null : el("span", {}, ...tEl("devices.ed.now", el("b", {}, i.main[0]))),
    el("span.r", {}, i.health === "offline" ? (i.lastAt ? tEl("devices.ed.lastHeard", el("span", { "data-ago": String(i.lastAt) }, ago(i.lastAt))) : K.t("devices.ed.notHeard"))
      : i.lastAt ? tEl("devices.ed.updated", el("span", { "data-ago": String(i.lastAt) }, ago(i.lastAt))) : K.t("devices.ed.noActivity")));
  const dotOf = (look) => (look === "lit" ? "ok" : look === "ok" ? "ok" : look);
  const head = (i, closeFn, cls) => el("div." + cls, {}, el("span.di" + (i.main[1] === "lit" ? ".on" : ""), {}, iconEl(iconOf(i), 22)),
    el("div.dh-n", {}, el("h3", {}, i.name), el("small", {}, i.c.hubRoom ? K.t("devices.ed.subRoom", { driver: i.driver || "?", id: i.id, room: i.c.hubRoom }) : K.t("devices.ed.sub", { driver: i.driver || "?", id: i.id }))),
    el("button.ib.x", { type: "button", "aria-label": K.t("common.close"), "data-tip": K.t("devices.ed.closeEsc"), onclick: closeFn }, ic("x", 16)));

  // ================================================================== events and panels (asked when shown)
  async function loadEvents(id, force, poll) {
    const e = events.get(id);
    if (!force && e && Date.now() - e.at < POLL) return e;
    try {
      let r;
      if (poll) {   // (the 15 s refresh: a background poll)
        const res = await M.poll(`/api/manage/devices/${id}/events`);
        if (!res) throw new Error("login");
        r = { status: res.status, ...(await res.json().catch(() => ({}))) };
      } else r = await api(`/api/manage/devices/${id}/events`);
      const v = { at: Date.now(), list: Array.isArray(r.events) ? r.events : [], ok: r.status === 200 };
      events.set(id, v); return v;
    } catch { return e || { at: 0, list: [], ok: false }; }
  }
  async function loadPanels(id) {
    const e = panelsOf.get(id);
    if (e && Date.now() - e.at < POLL) return e;
    try {
      const r = await api(`/api/manage/devices/${id}/panels`);
      const v = { at: Date.now(), list: Array.isArray(r.panels) ? r.panels : [], ok: r.status === 200 };
      panelsOf.set(id, v); return v;
    } catch { return e || { at: 0, list: [], ok: false }; }
  }
  const evText = (e) => `${e.name} → ${e.value === null ? "—" : String(e.value)}`;
  function eventList(id, max) {
    const box = el("div.elog", { "data-ev": String(id) }, el("div.muted", {}, K.t("common.loading")));
    const fill = (v) => {
      if (!box.isConnected && box.dataset.drawn) return;
      box.dataset.drawn = "1";
      const list = v.list.slice(0, max || 50);
      box.replaceChildren(...(list.length ? list.map((e) => el("div", {}, el("span", {}, when(e.t)), evText(e)))
        : [el("div.muted", {}, v.ok ? K.t("devices.events.none") : K.t("devices.events.cantRead"))]));
    };
    const have = events.get(id);
    if (have) fill(have);
    loadEvents(id).then((v) => { if (box.isConnected) fill(v); });
    return box;
  }

  // ================================================================== the page
  let $page = null, parts = {};   // (the page's skeleton; draw() fills its parts)
  let selTouched = 0;   // (when a select was last opened or used: a redraw then would close its list)
  document.addEventListener("pointerdown", (e) => { if (e.target && e.target.tagName === "SELECT") selTouched = Date.now(); }, true);
  document.addEventListener("keydown", (e) => { if (e.target && e.target.tagName === "SELECT") selTouched = Date.now(); }, true);
  const busy = () => {
    const a = document.activeElement;
    return (a && a.tagName === "SELECT" && Date.now() - selTouched < 8000) || !!document.querySelector(".modal-bg:not(.ps-bg)") || (parts.sugg && !parts.sugg.hidden);   // (a phone's device sheet doesn't stop the list behind it)
  };
  function header() {
    const d = D();
    const acts = el("div.acts", {},
      M.can("devices") ? el("button.btn", { type: "button", "aria-label": K.t("devices.shared.rooms"), "data-tip": K.t("devices.shared.rooms"), onclick: () => M.renderRooms && M.renderRooms() }, ic("home", 16), el("span.bl", {}, K.t("devices.shared.rooms"))) : null,
      M.isAdmin() ? el("button.btn", { type: "button", "aria-label": K.t("devices.groups"), "data-tip": K.t("devices.groups"), onclick: () => M.renderGroups && M.renderGroups() }, ic("shield", 16),
        el("span.bl", {}, (d.groups || []).length ? K.t("devices.groupsN", { n: d.groups.length }) : K.t("devices.groups"))) : null);
    return el("div.ph", {}, el("div", {}, el("h1", {}, K.t("devices.shared.aboutdevices")),
      el("p", {}, K.t("devices.lead"))),
    el("span.sp"), acts, S.isPhone() ? null : el("span.vr"), S.isPhone() ? null : S.viewSwitch("devices"));
  }
  function notes() {
    const d = D(), out = [];
    if (M.bridgeDown()) out.push(el("p.dv-note.warn", {}, ic("alert", 15), K.t("devices.bridgeDown")));
    const n = (d.newIds || []).length;
    if (n) {
      const names = d.devices.filter((c) => d.newIds.includes(c.id)).map((c) => c.label).slice(0, 4);
      out.push(el("div.dv-new", { role: "status" }, el("span.si", {}, ic("sparkles", 18)),
        el("div", {}, el("b", {}, K.t("devices.new.found", { n })),
          el("small", {}, n > names.length ? K.t("devices.new.namesMore", { names: names.join(", "), n: n - names.length }) : K.t("devices.new.names", { names: names.join(", ") }))),
        el("button.btn.sm", { type: "button", onclick: () => { st.chips = [{ k: "new", v: "yes" }]; st.q = ""; draw(); } }, K.t("devices.new.show")),
        el("button.btn.sm.ghost", { type: "button", onclick: reviewed }, K.t("devices.new.reviewed"))));
    }
    return out;
  }
  async function reviewed() {
    try {
      const r = await api("/api/manage/devices", { action: "reviewed" });
      if (!r.ok) return toast(r.error || K.t("devices.notSaved"), true);
      D().newIds = [];
      st.chips = st.chips.filter((c) => c.k !== "new");
      toast(K.t("devices.new.reviewedDone"));
      render();
    } catch (e) { if (e.message !== "login") toast(K.t("devices.unreachable"), true); }
  }

  // open / close the editor (both views): the device in the address? no — kept here, the same in both views
  // focus: into the editor (Detailed: its open tab; Basic: its first choice) — Esc / ✕ bring it back to the row
  function openDev(id, focus) {
    st.cur = id; st.open = true;
    draw();
    if (focus) {
      const f = document.querySelector(".dv-slide .stabs button.on") || (document.querySelector(".dv-drawer select") || document.querySelector(".dv-drawer .sw, .dv-drawer button"));
      if (f) f.focus({ preventScroll: true });
    }
  }
  function closeDev() {
    if (!st.open) return;
    const id = st.cur; st.open = false; draw();
    const r = M.$main.querySelector(`[data-fk="dev:${id}"]`); if (r) r.focus({ preventScroll: true });
  }

  function render() {
    const d = D();
    if (!d || !Array.isArray(d.devices)) {
      $page = null;
      return M.$main.replaceChildren(el("div.card", {}, d && d.refused ? d.error : K.t("devices.noModel")));
    }
    if (S.isPhone()) return renderPhone();   // (v2.8.0: the phone's own screen — below)
    const v = viewNow();
    if (S.route().rest[0] !== v) S.sync([v]);   // (a phone: Basic — the address says so too)
    parts = {};
    $page = el("div.dv-page." + v, { "data-view": v });
    if (v === "detailed") buildDetailed(); else buildBasic();
    M.swap(M.$main, $page);
    draw();
    poll();
  }
  function draw() {
    if (!$page || !$page.isConnected || !D() || !Array.isArray(D().devices)) return;
    if (st.cur != null && !D().devices.some((c) => c.id === st.cur)) { st.cur = null; st.open = false; }
    for (const id of [...st.sel]) if (!D().devices.some((c) => c.id === id)) st.sel.delete(id);
    keepFocus(() => { const list = allInfo(); if ($page.dataset.view === "phone") drawPhone(list); else if ($page.dataset.view === "detailed") drawDetailed(list); else drawBasic(list); });
  }
  // (a part drawn again — a tick, a sort, a facet, the 15 s refresh: the focused control stays focused, found again by
  // its data-fk, else its aria-label, else its words; the editor keeps its own through Manage.swap)
  const fkOf = (n) => (!n || n === document.body ? null : n.dataset && n.dataset.fk ? `fk:${n.dataset.fk}` : n.getAttribute && n.getAttribute("aria-label")
    ? `al:${n.getAttribute("aria-label")}` : n.tagName === "BUTTON" ? `tx:${n.textContent.trim()}` : null);
  function keepFocus(fn) {
    const a = document.activeElement, k = a && $page && $page.contains(a) ? fkOf(a) : null;
    fn();
    if (!k || (document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected)) return;
    const n = [...$page.querySelectorAll("button, input, select, a[href]")].find((x) => !x.disabled && x.offsetParent !== null && fkOf(x) === k);
    if (n) n.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ Basic
  function buildBasic() {
    const stats = el("div.dv-stats");
    const chips = el("span.dv-chipset");
    const input = el("input#dv-q", { type: "text", placeholder: "", autocomplete: "off", spellcheck: "false", "aria-label": K.t("devices.basic.filter"), role: "combobox",
      "aria-expanded": "false", "aria-controls": "dv-sugg", "aria-autocomplete": "list", value: st.q });
    const clr = el("button.ib.sm.clr", { type: "button", "aria-label": K.t("devices.clearFilters"), "data-tip": K.t("devices.clearFilters"), onclick: (e) => { e.stopPropagation(); st.chips = []; st.q = ""; input.value = ""; draw(); input.focus(); } }, ic("x", 14));
    const sugg = el("div.dv-sugg#dv-sugg", { role: "listbox", hidden: true });
    const fbox = el("div.dv-fbox", { onclick: (e) => { if (e.target === fbox || e.target.closest(".dv-chipset") === chips && !e.target.closest("button")) input.focus(); } },
      ic("search", 15), chips, input, el("kbd.dv-k", { "aria-hidden": "true", title: K.t("devices.basic.slash") }, "/"), clr, sugg);
    const cnt = el("span.cnt");
    const seg = (items, cur, set, label) => el("div.seg.dv-seg", { role: "group", "aria-label": label }, items.map(([k, n, i]) =>
      el("button" + (k === cur ? ".on" : ""), { type: "button", "aria-pressed": String(k === cur), "data-tip": n, "aria-label": n, onclick: () => set(k) }, ic(i, 15))));
    const byRoom = layout.endsWith("-room"), tiles = layout.startsWith("tiles");
    const opts = el("div.dv-opts", {},
      seg([["room", K.t("devices.basic.byRoom"), "home"], ["flat", K.t("devices.basic.az"), "az"]], byRoom ? "room" : "flat", (k) => { layout = (tiles ? "tiles" : "rows") + (k === "room" ? "-room" : ""); saveLayout(); render(); }, K.t("devices.basic.group")),
      seg([["rows", K.t("devices.basic.list"), "list"], ["tiles", K.t("devices.basic.tiles"), "grid"]], tiles ? "tiles" : "rows", (k) => { layout = k + (byRoom ? "-room" : ""); saveLayout(); render(); }, K.t("devices.basic.look")));
    const listBox = el("div.dv-listbox");
    roveKeys(listBox, "basic", BASIC_ITEMS, [BASIC_ITEMS], true);
    const drawer = el("aside.dv-drawer.dv-ed", { "aria-label": K.t("devices.basic.drawer"), hidden: true });
    const split = el("div.dv-split", {}, listBox, drawer);
    parts = { stats, chips, input, clr, sugg, cnt, listBox, drawer, split, notes: el("div.dv-notes") };
    $page.append(header(), parts.notes, stats, el("div.dv-fbar", {}, fbox, cnt, opts), split);
    wireFilter(input, sugg);
  }
  function drawBasic(list) {
    parts.notes.replaceChildren(...notes());
    drawStats(list);
    parts.chips.replaceChildren(...st.chips.map(chipEl));
    parts.clr.hidden = !st.chips.length && !st.q;
    parts.input.placeholder = st.chips.length ? K.t("devices.basic.addFilter") : K.t("devices.basic.filterHint");
    if (parts.input.value !== st.q) parts.input.value = st.q;
    const shown = list.filter((i) => matches(i));
    parts.cnt.textContent = shown.length === list.length ? K.t("devices.shared.roomDevices", { n: list.length }) : K.t("devices.countOf", { shown: shown.length, n: list.length });
    drawList(shown, list);
    drawDrawer(list);
    if (!parts.sugg.hidden) suggest();
  }
  function drawStats(list) {
    const vis = list.filter((i) => i.type !== "hidden");
    const lights = vis.filter((i) => i.type === "light"), on = lights.filter((i) => i.states.includes("on"));
    const open = vis.filter((i) => i.states.includes("open") && ["window", "door", "garage", "shade"].includes(i.type));
    const locks = vis.filter((i) => i.type === "lock"), unlocked = locks.filter((i) => i.states.includes("unlocked"));
    const low = vis.filter((i) => i.battery != null && i.battery < BATTERY_LOW).sort((a, b) => a.battery - b.battery);
    const off = vis.filter((i) => i.health === "offline");
    const names = (xs, f) => (xs.length ? (f || ((i) => i.name))(xs[0]) + (xs.length > 1 ? ` +${xs.length - 1}` : "") : "");   // (the first, then +N)
    const S = [
      [on.length ? "ok" : "", "bulb", K.t("devices.stats.on", { n: on.length }), lights.length ? K.t("devices.stats.ofLights", { n: lights.length }) : K.t("devices.stats.noLights"), [["type", "light"], ["state", "on"]]],
      [open.length ? "warn" : "", "window", open.length ? K.t("devices.stats.open", { n: open.length }) : K.t("devices.stats.allClosed"), open.length ? names(open) : K.t("devices.stats.doors"), [["state", "open"]]],
      [unlocked.length ? "warn" : "", unlocked.length ? "unlock" : "lock", !locks.length ? K.t("devices.stats.noLocks") : unlocked.length ? K.t("devices.stats.unlocked", { n: unlocked.length }) : K.t("devices.stats.allLocked"),
        unlocked.length ? names(unlocked) : locks.length ? names(locks) : K.t("devices.stats.noneOnHub"), unlocked.length ? [["state", "unlocked"]] : [["type", "lock"]]],
      [low.length ? "warn" : "", "battery", low.length ? K.t("devices.stats.low", { n: low.length }) : K.t("devices.stats.batteriesOk"), low.length ? names(low, (i) => `${i.name} · ${i.battery}%`) : K.t("devices.stats.below", { n: BATTERY_LOW }), [["state", "low-battery"]]],
      [off.length ? "bad" : "", "alert", off.length ? K.t("devices.stats.offline", { n: off.length }) : K.t("devices.stats.noneOffline"), off.length ? names(off) : K.t("devices.stats.reachesAll"), [["state", "offline"]]],
    ];
    parts.stats.replaceChildren(...S.map(([cls, i, b, s, f], n) => {
      const on2 = f.every(([k, v]) => hasChip(k, v)) && st.chips.length === f.length;
      return el("button.dv-stat" + (cls ? `.${cls}` : "") + (on2 ? ".on" : ""), { type: "button", "data-fk": `stat:${n}`, "aria-pressed": String(on2), "data-tip": on2 ? K.t("devices.stats.showAll") : K.t("devices.stats.filterTip", { f: f.map(([k, v]) => `${k}:${v}`).join(" ") }),
        onclick: () => { st.chips = on2 ? [] : f.map(([k, v]) => ({ k, v })); st.q = ""; draw(); } },
      el("span.si", {}, ic(i, 18)), el("div", {}, el("b", {}, b), el("small", {}, s)));
    }));
  }
  function ruleTags(i, compact) {
    const t = [];
    if (i.isNew) t.push(el("span.tag.new", {}, K.t("devices.tag.new")));
    if (i.rules.includes("pin")) t.push(el("span.tag.pin", {}, K.t("devices.tag.pin")));
    if (i.rules.includes("unlock")) t.push(el("span.tag.pin", {}, compact ? K.t("devices.tag.unlockShort") : K.t("devices.tag.unlock")));
    if (i.rules.includes("view-only")) t.push(el("span.tag.nos", {}, compact ? K.t("devices.tag.viewOnlyShort") : K.t("devices.tag.viewOnly")));
    if (i.rules.includes("hidden")) t.push(el("span.tag", {}, compact ? K.t("devices.tag.hiddenShort") : K.t("devices.tag.hidden")));
    return t;
  }
  function drawList(shown, list) {
    const box = parts.listBox, tiles = layout.startsWith("tiles"), byRoom = layout.endsWith("-room");
    if (!shown.length) {
      return box.replaceChildren(el("div.dv-empty.box", {}, el("span.ei", {}, ic("filter", 22)), el("h3", {}, list.length ? K.t("devices.empty.noMatch") : K.t("devices.empty.none")),
        el("p", {}, list.length ? K.t("devices.empty.noMatchText") : K.t("devices.empty.noneText")),
        list.length ? el("button.btn", { type: "button", onclick: () => { st.chips = []; st.q = ""; draw(); } }, K.t("devices.clearFilters")) : null));
    }
    const sorted = shown.slice().sort((a, b) => byName(a.name, b.name));
    const groups = [];
    if (byRoom) {
      const m = new Map();
      for (const i of sorted) { if (!m.has(i.room)) m.set(i.room, []); m.get(i.room).push(i); }
      groups.push(...[...m].sort(([a], [b]) => (a === K.t("devices.noRoom")) - (b === K.t("devices.noRoom")) || a.localeCompare(b)));
    } else groups.push([null, sorted]);
    const cur = st.open ? st.cur : null;
    const open = (i) => () => openDev(i.id, true);
    if (tiles) {
      box.replaceChildren(...groups.flatMap(([g, xs]) => [g ? el("div.dv-gh", {}, g, el("span", {}, String(xs.length))) : null,
        el("div.dv-tiles", {}, xs.map((i) => el("button.dv-tile" + (cur === i.id ? ".cur" : ""), { type: "button", "data-fk": `dev:${i.id}`, onclick: open(i), title: i.name },
          el("span.di" + (i.main[1] === "lit" ? ".on" : ""), {}, iconEl(iconOf(i), 24)), el("b", {}, i.name), el("small", {}, M.roleName(i.role)),
          el("span.st", {}, el("span.dot." + dotOf(i.main[1])), i.main[0]), el("span.tags", {}, ruleTags(i)))))]).filter(Boolean));   // (one ruleTags per tile)
      return rove(box, "basic", BASIC_ITEMS);
    }
    const flat = !byRoom;
    const rowOf = (i) => el("button.tr" + (cur === i.id ? ".cur" : ""), { type: "button", "data-fk": `dev:${i.id}`, onclick: open(i), "aria-current": cur === i.id ? "true" : null },
      el("span.nm", {}, el("span.di" + (i.main[1] === "lit" ? ".on" : ""), {}, iconEl(iconOf(i), 16)), el("span.nmt", {}, el("b", {}, i.name), el("small", {}, i.driver || "—"))),
      flat ? el("span.ell.muted", {}, i.room) : null,
      el("span.ell", {}, M.roleName(i.role)),
      el("span.st" + (i.main[1] === "bad" ? ".bad" : i.main[1] === "warn" ? ".warn" : ""), {}, el("span.dot." + dotOf(i.main[1])), el("span.ell", {}, i.main[0])),
      el("span.ell.c-act", { "data-ago": i.lastAt ? String(i.lastAt) : null }, i.lastAt ? ago(i.lastAt) : el("span.muted", {}, "—")),
      ((t) => el("span.ell.tags", {}, t.length ? t : el("span.muted", {}, "—")))(ruleTags(i)));
    const th = el("div.tr.th", { "aria-hidden": "true" }, el("span", {}, K.t("devices.col.name")), flat ? el("span", {}, K.t("devices.room")) : null, el("span", {}, K.t("devices.showsAs")), el("span", {}, K.t("devices.col.state")),
      el("span.c-act", {}, K.t("devices.col.last")), el("span", {}, K.t("devices.col.rules")));
    const tbl = el("div.dv-tbl" + (flat ? ".flat" : ""), {}, th, ...groups.flatMap(([g, xs]) => [g ? el("div.tr.gh2", {}, g, el("span", {}, String(xs.length))) : null, ...xs.map(rowOf)]).filter(Boolean));
    box.replaceChildren(tbl);
    rove(box, "basic", BASIC_ITEMS);
  }
  function drawDrawer(list) {
    const dr = parts.drawer, i = st.open ? list.find((x) => x.id === st.cur) : null;
    parts.split.classList.toggle("open", !!i);
    document.documentElement.classList.toggle("dv-sheet", !!i && S.isPhone());
    if (!i) { dr.hidden = true; dr.replaceChildren(); return; }
    const top = dr.scrollTop;
    dr.hidden = false;
    M.swap(dr, head(i, closeDev, "dh"), stateLine(i), ...[controlSection(i)].filter(Boolean), ...settingsParts(i.c),   // (v2.9.1: Control)
      el("div.dsec", {}, el("h4", {}, K.t("devices.events.recent")), eventList(i.id, 4)), footFor(i.c));
    dr.scrollTop = top;
    fitDrawer();
  }
  // (pinned beside the list: never taller than what's left of the window under its top — its foot always in view;
  // it scrolls inside only when its settings are longer than that)
  function fitDrawer() {
    const dr = parts.drawer;
    if (!dr || dr.hidden || !dr.isConnected) return;
    if (getComputedStyle(dr).position !== "sticky") { dr.style.maxHeight = ""; return; }
    const topH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--top-h")) || 52;
    dr.style.maxHeight = `${Math.max(260, Math.round(window.innerHeight - Math.max(dr.getBoundingClientRect().top, topH + 16) - 16))}px`;
  }
  window.addEventListener("scroll", () => { if (st.open && parts.drawer) fitDrawer(); }, { passive: true });
  window.addEventListener("resize", () => { if (st.open && parts.drawer) fitDrawer(); });

  // ---------- the filter box: suggestions (keys, values, a name search), ↑ ↓ ↵, ⌫ removes the last chip ----------
  let sIdx = 0, sItems = [];
  function wireFilter(input, sugg) {
    const open = () => { suggest(); };
    input.addEventListener("focus", open);
    input.addEventListener("input", () => { st.q = input.value; drawBasicQuiet(); suggest(); });
    input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== input) closeSugg(); }, 120));
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (sugg.hidden) suggest(); else { sIdx = Math.min(sIdx + 1, sItems.length - 1); hl(); } }
      else if (e.key === "ArrowUp") { e.preventDefault(); sIdx = Math.max(sIdx - 1, 0); hl(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const it = !sugg.hidden && sItems[sIdx];
        if (it) pick(it);
        else if (input.value.trim()) { if (unknownValue(input.value)) return; if (!typedChip(input.value, allInfo())) addChip("text", input.value.trim()); st.q = ""; input.value = ""; draw(); }
      } else if (e.key === "Escape") {
        if (!sugg.hidden) { e.preventDefault(); e.stopPropagation(); closeSugg(); }
        else if (input.value) { e.preventDefault(); e.stopPropagation(); input.value = ""; st.q = ""; draw(); }
      } else if (e.key === "Backspace" && !input.value && st.chips.length) { st.chips.pop(); draw(); suggest(); }
      else if (e.key === "Tab") closeSugg();
    });
    sugg.addEventListener("mousedown", (e) => { e.preventDefault(); const o = e.target.closest(".so[data-n]"); if (o) pick(sItems[+o.dataset.n]); });
    sugg.addEventListener("mousemove", (e) => { const o = e.target.closest(".so[data-n]"); if (o && +o.dataset.n !== sIdx) { sIdx = +o.dataset.n; hl(); } });
  }
  // (typing: only the list and the count are drawn again — the box keeps its caret)
  function drawBasicQuiet() {
    const list = allInfo(), shown = list.filter((i) => matches(i));
    parts.cnt.textContent = shown.length === list.length ? K.t("devices.shared.roomDevices", { n: list.length }) : K.t("devices.countOf", { shown: shown.length, n: list.length });
    parts.clr.hidden = !st.chips.length && !st.q;
    drawList(shown, list);
  }
  function closeSugg() { if (!parts.sugg) return; parts.sugg.hidden = true; parts.input.setAttribute("aria-expanded", "false"); parts.input.removeAttribute("aria-activedescendant"); }
  function pick(it) {
    const input = parts.input;
    if (it.key) { input.value = `${it.key}:`; st.q = input.value; input.focus(); suggest(); return; }
    addChip(it.k, it.v); st.q = ""; input.value = "";
    draw(); input.focus(); suggest();
  }
  function suggest() {
    const input = parts.input, box = parts.sugg; if (!input || !box) return;
    const raw = input.value, q = raw.trim().toLowerCase(), list = allInfo();
    sItems = [];
    const kids = [];
    const add = (grp, items) => { if (!items.length) return; kids.push(el("h6", {}, grp)); for (const it of items) { kids.push(el("div.so", { role: "option", id: `dv-so-${sItems.length}`, "data-n": String(sItems.length) }, ...it.h)); sItems.push(it); } };
    const code = (t) => el("code", {}, t), small = (t) => el("small", {}, String(t));
    const keys = Object.entries(KEYS).filter(([k, o]) => !o.hidden || list.some((i) => i.isNew));
    const m = /^(\w+):(.*)$/.exec(q);
    if (m && KEYS[m[1]]) {
      const k = m[1], part = m[2].trim();
      const vs = valuesOf(k, list).filter(([v]) => String(v).toLowerCase().includes(part));
      add(K.t("devices.sugg.valuesFor", { k }), vs.slice(0, 30).map(([v, n]) => ({ h: [code(`${k}:${v}`), small(K.t("devices.shared.roomDevices", { n }))], k, v })));
      if (vs.length > 30) kids.push(el("div.so.none", {}, K.t("devices.sugg.more", { n: vs.length - 30 })));
      if (!sItems.length) kids.push(el("div.so.none", {}, K.t("devices.sugg.noValue", { k, part })));
    } else if (!q) {
      add(K.t("devices.sugg.filterBy"), keys.map(([k, o]) => ({ h: [code(`${k}:`), el("span.d", {}, o.d)], key: k })));
      const often = [["state", "on"], ["state", "offline"], ["state", "low-battery"], ["type", "light"], ["rule", "pin"]]
        .map(([k, v]) => [k, v, (valuesOf(k, list).find((x) => x[0] === v) || [])[1] || 0]).filter(([, , n]) => n);
      add(K.t("devices.sugg.often"), often.filter(([k, v]) => !hasChip(k, v)).map(([k, v, n]) => ({ h: [code(`${k}:${v}`), small(n)], k, v })));
    } else {
      const n = list.filter((i) => hay(i).includes(q)).length;
      add(K.t("devices.sugg.search"), [{ h: [ic("search", 15), el("span", {}, ...tEl("devices.sugg.searchFor", el("b", {}, raw.trim()))), small(n)], k: "text", v: raw.trim() }]);
      add(K.t("devices.sugg.keys"), keys.filter(([k]) => k.startsWith(q)).map(([k, o]) => ({ h: [code(`${k}:`), el("span.d", {}, o.d)], key: k })));
      const vals = [];
      for (const [k] of keys) for (const [v, c] of valuesOf(k, list)) if (String(v).toLowerCase().startsWith(q) && !hasChip(k, v)) vals.push({ h: [code(`${k}:${v}`), small(c)], k, v });
      add(K.t("devices.sugg.values"), vals.slice(0, 6));
    }
    kids.push(el("div.sf", {}, el("span", {}, K.t("devices.sugg.keyPick")), el("span", {}, K.t("devices.sugg.keyAdd")), el("span", {}, K.t("devices.sugg.keyBack"))));
    box.replaceChildren(...kids);
    sIdx = 0; hl();
    box.hidden = false; input.setAttribute("aria-expanded", "true");
  }
  function hl() {
    for (const o of parts.sugg.querySelectorAll(".so[data-n]")) { const on = +o.dataset.n === sIdx; o.classList.toggle("on", on); o.setAttribute("aria-selected", String(on)); }
    const o = parts.sugg.querySelector(`.so[data-n="${sIdx}"]`);
    if (o) { o.scrollIntoView({ block: "nearest" }); parts.input.setAttribute("aria-activedescendant", o.id); }
  }

  // ------------------------------------------------------------------ Detailed
  // (v2.4.1) one Tab stop per list (400 devices aren't 400 Tab stops): ↑ ↓ Home End move between the rows — in the
  // table ← → between a row's box and its name; Basic's tiles ← → too. The one reached last keeps the Tab stop.
  const BASIC_ITEMS = "button.tr[data-fk], button.dv-tile", TABLE_ITEMS = "tbody .cb, tbody .rowb";   // i18n-ok (selectors, CSS: not words)
  const roveKey = { basic: null, detailed: null };
  function rove(box, which, sel) {
    const items = [...box.querySelectorAll(sel)];
    if (!items.length) return;
    const cur = items.find((n) => n.dataset.fk && n.dataset.fk === roveKey[which]) || items.find((n) => n.matches(".rowb, .tr, .dv-tile")) || items[0];
    for (const n of items) n.tabIndex = n === cur ? 0 : -1;
  }
  function roveKeys(box, which, rowSel, cols, linear) {
    const all = cols.join(", ");
    box.addEventListener("focusin", (e) => {
      const n = e.target.closest && e.target.closest(all); if (!n || !box.contains(n)) return;
      roveKey[which] = n.dataset.fk || null;
      for (const x of box.querySelectorAll(all)) x.tabIndex = x === n ? 0 : -1;
    });
    box.addEventListener("keydown", (e) => {
      const n = e.target.closest && e.target.closest(all); if (!n || e.altKey || e.ctrlKey || e.metaKey) return;
      const rows = [...box.querySelectorAll(rowSel)].filter((r) => r.offsetParent !== null);
      const row = n.matches(rowSel) ? n : n.closest(rowSel), ri = rows.indexOf(row), ci = Math.max(0, cols.findIndex((c) => n.matches(c)));
      let ti = ri, tc = ci;
      const k = e.key;
      if (k === "ArrowDown" || (linear && k === "ArrowRight")) ti++; else if (k === "ArrowUp" || (linear && k === "ArrowLeft")) ti--;
      else if (k === "Home") ti = 0; else if (k === "End") ti = rows.length - 1;
      else if (!linear && k === "ArrowRight") tc = Math.min(ci + 1, cols.length - 1); else if (!linear && k === "ArrowLeft") tc = Math.max(ci - 1, 0);
      else return;
      e.preventDefault();
      const r = rows[Math.max(0, Math.min(rows.length - 1, ti))]; if (!r) return;
      const t = r.matches(cols[tc]) ? r : r.querySelector(cols[tc]);
      if (t) { t.focus(); t.scrollIntoView({ block: "nearest" }); }
    });
  }
  const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;   // ("Door 46" before "Door 414")
  const COLS = [
    ["name", K.t("devices.col.name"), "", (i) => i.name.toLowerCase()],
    ["room", K.t("devices.room"), "", (i) => i.room.toLowerCase()],
    ["as", K.t("devices.showsAs"), "c-mid", (i) => M.roleName(i.role).toLowerCase()],
    ["state", K.t("devices.col.state"), "", (i) => i.main[0].toLowerCase()],
    ["battery", K.t("devices.col.battery"), "", (i) => i.battery],
    ["last", K.t("devices.col.last"), "", (i) => (i.lastAt ? -i.lastAt : null)],
    ["driver", K.t("devices.col.driver"), "c-drv", (i) => i.driver.toLowerCase() || null],
    ["id", K.t("devices.col.id"), "c-wide", (i) => i.id],
    ["rules", K.t("devices.col.rules"), "", (i) => (i.isNew ? "0" : "") + i.rules.join(",")],
  ];
  function buildDetailed() {
    const kpis = el("div.dv-kpis");
    const facets = el("aside.dv-facets", { "aria-label": K.t("devices.det.filters") });
    const q = el("input#dv-dq", { type: "text", placeholder: K.t("devices.det.searchHint"), autocomplete: "off", spellcheck: "false", "aria-label": K.t("devices.search"), value: st.q });
    q.addEventListener("input", () => { st.q = q.value; redrawTable(); });
    q.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && q.value.trim()) { e.preventDefault(); if (unknownValue(q.value)) return; if (!typedChip(q.value, allInfo())) addChip("text", q.value.trim()); st.q = ""; q.value = ""; draw(); }
      else if (e.key === "Escape" && q.value) { e.preventDefault(); e.stopPropagation(); q.value = ""; st.q = ""; draw(); }
      else if (e.key === "Backspace" && !q.value && st.chips.length) { st.chips.pop(); draw(); }
    });
    const qbox = el("label.q", {}, ic("search", 14), q, el("kbd", { "aria-hidden": "true", title: K.t("devices.det.slash") }, "/"));
    const chips = el("span.dv-chipset");
    const cnt = el("span.cnt");
    const clrAll = el("button.lnk", { type: "button", onclick: () => { st.chips = []; st.q = ""; q.value = ""; draw(); } }, K.t("devices.det.clearAll"));
    const exportB = el("button.btn.sm", { type: "button", "data-tip": K.t("devices.det.exportTip"), onclick: exportCsv }, ic("download", 14), K.t("devices.det.export"));
    const findBar = el("div.dv-tbar-f", {}, qbox, chips, clrAll, el("span.sp"), cnt, exportB);
    const bulkBar = el("div.dv-tbar-b", { hidden: true });
    const tbar = el("div.dv-tbar", {}, findBar, bulkBar);
    const table = el("table.dv-dt");
    roveKeys(table, "detailed", "tbody tr[data-id]", [".cb", ".rowb"], false);   // i18n-ok (selectors, CSS: not words)
    const foot = el("div.dv-tfoot");
    const slide = el("aside.dv-slide.dv-ed", { "aria-label": K.t("devices.det.device"), hidden: true });
    parts = { kpis, facets, q, chips, cnt, clrAll, findBar, bulkBar, table, foot, slide, notes: el("div.dv-notes") };
    // (the slide-over is fixed to the right; in the page it comes before the table: Tab goes into it, not across the table)
    $page.append(header(), parts.notes, kpis, slide, el("div.dv-dwrap", {}, el("div.dv-dlay", {}, facets, el("div.dv-tw", {}, tbar, el("div.dv-tsc", {}, table), foot))));
  }
  function drawDetailed(list) {
    parts.notes.replaceChildren(...notes());
    drawKpis(list);
    drawFacets(list);
    drawTable(list);
    drawSlide(list);
  }
  function drawKpis(list) {
    const vis = list.filter((i) => i.type !== "hidden");
    const lights = vis.filter((i) => i.type === "light"), on = lights.filter((i) => i.states.includes("on")).length;
    const open = vis.filter((i) => i.states.includes("open") && ["window", "door", "garage", "shade"].includes(i.type));
    const unlocked = vis.filter((i) => i.type === "lock" && i.states.includes("unlocked"));
    const low = vis.filter((i) => i.battery != null && i.battery < BATTERY_LOW).sort((a, b) => a.battery - b.battery);
    const off = vis.filter((i) => i.health === "offline");
    const heard = list.filter((i) => i.lastAt && Date.now() / 1000 - i.lastAt < 3600).length;
    const first = (xs, f) => (xs.length ? (f || ((i) => i.name))(xs[0]) + (xs.length > 1 ? ` +${xs.length - 1}` : "") : K.t("devices.kpi.none"));
    const K6 = [
      ["", K.t("devices.shared.aboutdevices"), String(list.length), list.length > vis.length ? K.t("devices.kpi.notShown", { n: list.length - vis.length }) : K.t("devices.kpi.onHub"), null],
      [on ? "ok" : "", K.t("devices.kpi.lightsOn"), String(on), K.t("devices.kpi.of", { n: lights.length }), [["type", "light"], ["state", "on"]]],
      ["", K.t("devices.kpi.heard"), String(heard), K.t("devices.kpi.heardSub"), null],
      [open.length ? "warn" : "", K.t("control.open"), String(open.length), first(open), [["state", "open"]]],
      [unlocked.length ? "warn" : "", K.t("devices.kpi.unlocked"), String(unlocked.length), first(unlocked), [["state", "unlocked"]]],
      [low.length ? "warn" : "", K.t("devices.kpi.low"), String(low.length), first(low, (i) => `${i.name} · ${i.battery}%`), [["state", "low-battery"]]],
      [off.length ? "bad" : "", K.t("devices.kpi.off"), String(off.length), first(off), [["state", "offline"]]],
    ];
    parts.kpis.replaceChildren(...K6.map(([cls, s, b, sub, f]) => {
      const on2 = f && f.every(([k, v]) => hasChip(k, v)) && st.chips.length === f.length;
      return el(f ? "button.kpi" : "div.kpi", { class: `kpi${cls ? ` ${cls}` : ""}${on2 ? " on" : ""}`, type: f ? "button" : null, "data-fk": f ? `kpi:${s}` : null, "aria-pressed": f ? String(!!on2) : null,
        "data-tip": f ? (on2 ? K.t("devices.stats.showAll") : K.t("devices.stats.filterTip", { f: f.map(([k, v]) => `${k}:${v}`).join(" ") })) : null,
        onclick: f ? () => { st.chips = on2 ? [] : f.map(([k, v]) => ({ k, v })); st.q = ""; parts.q.value = ""; draw(); } : null },
      el("small", {}, s), el("b", {}, b, el("span", {}, sub)));
    }));
  }
  function drawFacets(list) {
    const DOT = { offline: "bad", "low-battery": "warn", open: "warn", unlocked: "warn", alarm: "bad", off: "idle", away: "idle", closed: "idle" };
    const grp = (k, title, max) => {
      const vals = valuesOf(k, list).slice(0, max || 40);
      if (!vals.length) return null;
      const any = st.chips.some((c) => c.k === k);
      return el("div.fg", {}, el("h6", {}, title, any ? el("button", { type: "button", onclick: () => { st.chips = st.chips.filter((c) => c.k !== k); draw(); } }, K.t("control.clear")) : null),
        vals.map(([v, n]) => {
          const on = hasChip(k, v);
          return el("button.fo" + (on ? ".on" : ""), { type: "button", role: "checkbox", "aria-checked": String(on), "data-fk": `fo:${k}:${v}`, onclick: () => { toggleChip(k, v); draw(); } },
            el("span.cb", {}, on ? ic("check", 10) : null), k === "state" ? el("span.dot." + (DOT[v] || "ok")) : null,
            el("span.fl", {}, k === "battery" ? { low: K.t("devices.facet.low", { n: BATTERY_LOW }), half: K.t("devices.facet.half"), good: K.t("devices.facet.good"), none: K.t("devices.mains") }[v] || v : k === "type" || k === "state" || k === "rule" ? word(v) : v),
            el("span.n", {}, String(n)));
        }));
    };
    const top = parts.facets.scrollTop;
    parts.facets.replaceChildren(...[grp("room", K.t("devices.room")), grp("type", K.t("devices.col.type")), grp("state", K.t("devices.col.state")), grp("battery", K.t("devices.col.battery")), grp("rule", K.t("devices.col.rules")), grp("driver", K.t("devices.col.driver"), 25)].filter(Boolean));
    parts.facets.scrollTop = top;
  }
  function sortedShown(list) {
    const g = (COLS.find(([k]) => k === st.sort.k) || COLS[0])[3];
    // (no value — no battery, nothing heard yet: last, whichever way)
    return list.filter((i) => matches(i)).sort((a, b) => { const x = g(a), y = g(b);
      if ((x == null) !== (y == null)) return x == null ? 1 : -1;
      return (st.sort.k === "name" ? byName(a.name, b.name) : (x > y) - (x < y)) * st.sort.dir || byName(a.name, b.name); });
  }
  const redrawTable = () => keepFocus(() => drawTable(allInfo()));
  function drawTable(list) {
    const shown = sortedShown(list);
    // the bar: the search and the chips — or, with devices ticked, what can be changed for all of them
    const selN = st.sel.size, hiddenN = selN - shown.filter((i) => st.sel.has(i.id)).length;
    parts.findBar.hidden = !!selN; parts.bulkBar.hidden = !selN;
    if (selN) drawBulkBar(list.filter((i) => st.sel.has(i.id)), hiddenN);
    parts.chips.replaceChildren(...st.chips.map(chipEl));
    parts.clrAll.hidden = !st.chips.length && !st.q;
    parts.cnt.textContent = K.t("devices.det.countOf", { shown: shown.length, n: list.length });
    const allOn = shown.length > 0 && shown.every((i) => st.sel.has(i.id)), someOn = shown.some((i) => st.sel.has(i.id));
    const cb = (on, label, onclick, mixed, fk) => el("button.cb" + (on ? ".on" : mixed ? ".mixed" : ""), { type: "button", role: "checkbox", "data-fk": fk || null, "aria-checked": mixed && !on ? "mixed" : String(on), "aria-label": label, onclick },
      on ? ic("check", 10) : mixed ? ic("minus", 10) : null);
    const head = el("thead", {}, el("tr", {}, el("th.cbx", {}, cb(allOn, allOn ? K.t("devices.det.selNone") : K.t("devices.det.selAll"), (e) => {
      e.stopPropagation(); for (const i of shown) { if (allOn) st.sel.delete(i.id); else st.sel.add(i.id); } redrawTable();
    }, someOn, "cb-all")),
    COLS.map(([k, n, cls]) => el("th" + (cls ? `.${cls}` : "") + (st.sort.k === k ? ".srt" : ""), { "aria-sort": st.sort.k === k ? (st.sort.dir > 0 ? "ascending" : "descending") : null },
      el("button.th-b", { type: "button", "data-fk": `sort:${k}`, onclick: () => { st.sort = { k, dir: st.sort.k === k ? -st.sort.dir : 1 }; redrawTable(); } },
        n, st.sort.k === k ? ic(st.sort.dir > 0 ? "chevD" : "chevU", 12) : null)))));
    if (!shown.length) {
      parts.table.replaceChildren(head, el("tbody", {}, el("tr.none", {}, el("td", { colspan: String(COLS.length + 1) }, el("div.dv-empty", {}, el("span.ei", {}, ic("filter", 22)),
        el("h3", {}, list.length ? K.t("devices.empty.noMatch") : K.t("devices.empty.none")), el("p", {}, list.length ? K.t("devices.empty.noMatchText") : K.t("devices.empty.bridge")),
        list.length ? el("button.btn", { type: "button", onclick: () => { st.chips = []; st.q = ""; parts.q.value = ""; draw(); } }, K.t("devices.clearFilters")) : null)))));
    } else {
      const cur = st.open ? st.cur : null;
      parts.table.replaceChildren(head, el("tbody", {}, shown.map((i) => {
        const ck = st.sel.has(i.id);
        const tr = el("tr" + (cur === i.id ? ".cur" : "") + (ck ? ".chk" : ""), { "data-id": String(i.id) },
          el("td.cbx", {}, cb(ck, K.t("devices.det.select", { name: i.name }), (e) => { e.stopPropagation(); if (ck) st.sel.delete(i.id); else st.sel.add(i.id); redrawTable(); }, false, `ck:${i.id}`)),
          el("td.nm2", {}, el("button.rowb", { type: "button", "data-fk": `dev:${i.id}`, onclick: (e) => { e.stopPropagation(); openDev(i.id, true); } },
            el("span.di" + (i.main[1] === "lit" ? ".on" : ""), {}, iconEl(iconOf(i), 15)), el("span.ell", {}, i.name))),
          el("td.rm", { title: i.room }, i.room), el("td.c-mid", {}, M.roleName(i.role)),
          el("td", {}, el("span.sd" + (i.main[1] === "bad" ? ".bad" : i.main[1] === "warn" ? ".warn" : ""), {}, el("span.dot." + dotOf(i.main[1])), i.main[0])),
          el("td.mono", {}, i.battery == null ? el("span.muted", {}, "—") : [el("span.bbar", {}, el("i" + (i.battery < BATTERY_LOW ? ".bad" : i.battery < 35 ? ".warn" : ""), { style: `width:${i.battery}%` })), `${i.battery}%`]),   // i18n-ok (selectors, CSS: not words)
          el("td.mono" + (i.health === "offline" ? ".bad" : ""), { "data-ago": i.lastAt ? String(i.lastAt) : null }, i.lastAt ? ago(i.lastAt) : el("span.muted", {}, "—")),
          el("td.c-drv.drv", { title: i.driver }, i.driver || "—"),
          el("td.mono.c-wide.muted", {}, String(i.id)),
          ((t) => el("td", {}, t.length ? t : el("span.muted", {}, "—")))(ruleTags(i, true)));
        tr.addEventListener("click", () => openDev(i.id, true));
        return tr;
      })));
      rove(parts.table, "detailed", TABLE_ITEMS);
    }
    const heard = (D().heard || {}).event || (D().heard || {}).state;
    parts.foot.replaceChildren(el("span", {}, [K.t("devices.shared.roomDevices", { n: shown.length }), shown.length < list.length ? K.t("devices.det.hiddenN", { n: list.length - shown.length }) : "",
      st.sel.size ? K.t("devices.det.selectedN", { n: st.sel.size }) : ""].filter(Boolean).join(" · ")),
      el("span", {}, M.bridgeDown() ? (heard ? tEl("devices.det.downHeard", el("span", { "data-ago": String(heard) }, ago(heard))) : K.t("devices.det.downNoLive"))
        : heard ? tEl("devices.det.liveHeard", el("span", { "data-ago": String(heard) }, ago(heard))) : K.t("devices.det.noLive")));
  }

  // ---------- bulk changes: one change for every ticked device (all or nothing: the server checks every one first) ----------
  const commonOptions = (sel) => {
    let common = null;
    for (const i of sel) { const o = new Set([...(i.c.options || []), "hidden"]); common = common ? new Set([...common].filter((x) => o.has(x))) : o; }
    return [...(common || [])];
  };
  function bulkChecks(sel) {
    const d = D();
    const as = commonOptions(sel).filter((k) => k !== "hidden");
    const pinOk = sel.every((i) => SWITCHY.includes(i.role));
    const swOk = M.isAdmin() && d.switchable && sel.every((i) => d.switchable.has(i.id));
    return {
      room: [true, ""],
      as: [as.length > 0, as.length ? "" : K.t("devices.bulk.noType", { n: sel.length })],
      pin: [pinOk, pinOk ? "" : K.t("devices.bulk.pinOnly")],
      allowed: [!!swOk, !M.isAdmin() ? K.t("devices.bulk.adminOnly") : swOk ? "" : K.t("devices.bulk.notAll")],
      hide: [true, ""],
    };
  }
  function drawBulkBar(sel, hiddenN) {
    const ok = bulkChecks(sel);
    const b = (key, icon, words) => el("button.btn.sm", { type: "button", "data-fk": `bk:${key}`, "aria-disabled": ok[key][0] ? null : "true", "data-tip": ok[key][1] || null,
      onclick: () => { if (ok[key][0]) bulkDialog(key); } }, ic(icon, 14), words);
    parts.bulkBar.replaceChildren(...[el("span.bulk", {}, ic("check", 15), K.t("devices.det.selectedN", { n: sel.length }),
      hiddenN ? el("small", { "data-tip": K.t("devices.bulk.hiddenTip") }, " · " + K.t("devices.det.hiddenN", { n: hiddenN })) : null),
      b("room", "home", K.t("devices.bulk.roomB")), b("as", "devices", K.t("devices.bulk.asB")), b("pin", "lock", K.t("devices.bulk.pinB")), M.isAdmin() ? b("allowed", "zap", K.t("devices.bulk.allowedB")) : null, b("hide", "eyeoff", K.t("devices.bulk.hideB")),
      el("span.sp"), el("button.btn.sm.ghost.bk-clr", { type: "button", onclick: () => { st.sel.clear(); redrawTable(); } }, K.t("devices.bulk.clearSel"))].filter(Boolean));   // (no "null" for a login that isn't the admin)
  }
  function bulkDialog(what) {
    const d = D(), sel = allInfo().filter((i) => st.sel.has(i.id));
    if (!sel.length) return;
    const ok = bulkChecks(sel);
    const KINDS = [["room", K.t("devices.room")], ["as", K.t("devices.showsAs")], ["pin", K.t("control.pinLabel")], ["allowed", K.t("devices.bulk.allowed")], ["hide", K.t("devices.bulk.hide")]].filter(([k]) => k !== "allowed" || M.isAdmin());
    let kind = what, close = null;
    const ctl = el("div.bk-ctl"), why = el("p.bk-why"), go = el("button.btn.pri", { type: "button" }, K.t("devices.bulk.change", { n: sel.length }));
    const segB = el("div.seg", { role: "group", "aria-label": K.t("devices.bulk.what") });
    const value = () => { const s = ctl.querySelector("select"); return s ? s.value : null; };
    function drawKind() {
      segB.replaceChildren(...KINDS.map(([k, n]) => el("button" + (k === kind ? ".on" : ""), { type: "button", "aria-pressed": String(k === kind), "aria-disabled": ok[k][0] ? null : "true",
        "data-tip": ok[k][1] || null, onclick: () => { if (ok[k][0]) { kind = k; drawKind(); } } }, n)));
      let sel2 = null;
      if (kind === "room") sel2 = el("select.dv-sel", { "aria-label": K.t("devices.room") }, el("option", { value: "" }, K.t("devices.bulk.roomAuto")), d.rooms.map((x) => el("option", { value: x }, x)));
      else if (kind === "as") {
        const lacking = sel.some((i) => !(i.o.room || (i.c.hubRoom && !d.noRoom.includes(i.c.hubRoom))));
        sel2 = el("select.dv-sel", { "aria-label": K.t("devices.showsAs") }, el("option", { value: "" }, K.t("devices.bulk.asAuto")),
          commonOptions(sel).filter((k) => k !== "hidden").map((k) => el("option", { value: k, disabled: NEEDS_ROOM.includes(k) && lacking }, (NEEDS_ROOM.includes(k) && lacking ? K.t("devices.bulk.asNoRoom", { role: M.roleName(k) }) : M.roleName(k)))));
      } else if (kind === "pin") sel2 = el("select.dv-sel", { "aria-label": K.t("control.pinLabel") }, el("option", { value: "on" }, K.t("devices.bulk.pinOn")), el("option", { value: "off" }, K.t("devices.bulk.pinOff")));
      else if (kind === "allowed") sel2 = el("select.dv-sel", { "aria-label": K.t("devices.bulk.allowed") }, el("option", { value: "on" }, K.t("devices.bulk.mayOn")), el("option", { value: "off" }, K.t("devices.bulk.mayOff")));
      else {
        const hid = sel.filter((i) => i.o.as === "hidden").length;
        sel2 = el("select.dv-sel", { "aria-label": K.t("devices.bulk.hideOrShow"), onchange: () => { go.textContent = sel2.value === "show" ? K.t("devices.bulk.showN", { n: hid }) : K.t("devices.bulk.change", { n: sel.length }); } },
          el("option", { value: "hide" }, K.t("devices.bulk.hideAll")),
          el("option", { value: "show", disabled: !hid }, !hid ? K.t("devices.bulk.showNone") : hid === sel.length ? K.t("devices.bulk.showAll", { n: hid })
            : K.t("devices.bulk.showSome", { n: hid })));
      }
      go.textContent = K.t("devices.bulk.change", { n: sel.length });
      ctl.replaceChildren(sel2);
      why.textContent = ok[kind][0] ? "" : ok[kind][1];
      go.disabled = !ok[kind][0];
    }
    go.addEventListener("click", async () => {
      const v = value();
      const set = kind === "room" ? { room: v || null } : kind === "as" ? { as: v || null } : kind === "pin" ? { confirm: v === "on" ? true : null }
        : kind === "allowed" ? { allowed: v === "on" } : { as: v === "hide" ? "hidden" : null };
      // (show again: only the hidden ones — a type set by hand on the others stays)
      const ids = (kind === "hide" && v === "show" ? sel.filter((i) => i.o.as === "hidden") : sel).map((i) => i.id);
      if (!ids.length) { why.textContent = K.t("devices.bulk.noneHidden"); return; }
      go.disabled = true;
      try {
        const r = await api("/api/manage/devices", { ids, set });
        if (!r.ok) { why.textContent = r.error || K.t("devices.notSaved"); go.disabled = false; return; }
        for (const [id, o] of Object.entries(r.overrides || {})) { if (Object.keys(o).length) d.overrides[id] = o; else delete d.overrides[id]; }
        if ("allowed" in set) for (const i of sel) { if (set.allowed) d.never.delete(i.id); else d.never.add(i.id); }
        close();
        toast(M.bridgeDown() ? K.t("devices.bulk.doneDown", { n: ids.length }) : K.t("devices.bulk.done", { n: ids.length }));
        draw(); refreshSoon();
      } catch (e) { if (e.message !== "login") why.textContent = K.t("devices.unreachable"); go.disabled = false; }
    });
    const names = sel.map((i) => i.name);
    const shade = el("div.modal-bg", { onclick: (e) => { if (e.target === shade) close(); } },
      el("div.modal.small.dv-bulk", { role: "dialog", "aria-labelledby": "bk-h" },
        el("h2#bk-h", {}, K.t("devices.bulk.change", { n: sel.length })),
        el("p.muted", {}, names.length > 5 ? K.t("devices.bulk.namesMore", { names: names.slice(0, 5).join(", "), n: names.length - 5 }) : K.t("devices.bulk.names", { names: names.join(", ") })),
        segB, ctl, why,
        el("div.pp-acts", {}, el("button.btn.ghost", { type: "button", onclick: () => close() }, K.t("control.cancel")), go)));
    drawKind();
    close = M.dialog(shade, ctl.querySelector("select"));
  }
  function exportCsv() {
    const shown = sortedShown(allInfo());
    const q = (s) => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const lines = [[K.t("devices.col.name"), K.t("devices.room"), K.t("devices.showsAs"), K.t("devices.col.state"), K.t("devices.col.battery"), K.t("devices.col.last"), K.t("devices.col.driver"), K.t("devices.col.id"), K.t("devices.col.rules")].map(q).join(",")];
    for (const i of shown) lines.push([i.name, i.room, M.roleName(i.role), i.main[0], i.battery == null ? "" : i.battery, i.lastAt ? new Date(i.lastAt * 1000).toISOString() : "",
      i.driver, i.id, i.rules.join(" ")].map((x) => q(/^\s*[=+\-@]|^[\t\r]/.test(String(x)) ? `'${x}` : x)).join(","));
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
    const a = el("a", { href: url, download: "skypane-devices.csv" }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- the slide-over (Detailed): Settings · Details · Events · Panels ----------
  const TABS = [["settings", K.t("devices.tab.settings")], ["details", K.t("devices.tab.details")], ["events", K.t("devices.tab.events")], ["panels", K.t("devices.shared.aboutpanels")]];
  function drawSlide(list) {
    const sl = parts.slide, i = st.open ? list.find((x) => x.id === st.cur) : null;
    if (!parts.scrim) { parts.scrim = el("div.dv-scrim", { "aria-hidden": "true" }); sl.before(parts.scrim); }
    parts.scrim.hidden = !i;
    if (!i) { sl.hidden = true; sl.replaceChildren(); return; }
    const body = el("div.sob#dv-tabpanel", { "data-keep-scroll": "slide", role: "tabpanel", "aria-labelledby": `dv-tab-${st.tab}`, tabindex: "-1" });
    const top = (sl.querySelector(".sob") || {}).scrollTop || 0;
    if (st.tab === "settings") body.append(stateLine(i), ...[controlSection(i)].filter(Boolean), ...settingsParts(i.c), el("div.dsec", {}, el("h4", {}, K.t("devices.events.recent")), eventList(i.id, 3)));   // (v2.9.1: Control)
    else if (st.tab === "details") body.append(...details(i));
    else if (st.tab === "events") body.append(el("p.gf", {}, K.t("devices.events.about")), eventList(i.id, 50));
    else body.append(panelsTab(i));
    const pick = (k) => { st.tab = k; drawSlide(allInfo()); const b = document.getElementById(`dv-tab-${k}`); if (b) b.focus({ preventScroll: true }); };
    const tabs = el("div.stabs", { role: "tablist", "aria-label": K.t("devices.det.device"), onkeydown: (e) => {
      const n = TABS.findIndex(([k]) => k === st.tab), to = { ArrowRight: n + 1, ArrowLeft: n - 1, Home: 0, End: TABS.length - 1 }[e.key];
      if (to == null) return;
      e.preventDefault(); pick(TABS[(to + TABS.length) % TABS.length][0]);
    } }, TABS.map(([k, n]) => el("button" + (k === st.tab ? ".on" : ""), { type: "button", role: "tab", id: `dv-tab-${k}`, "aria-selected": String(k === st.tab),
      "aria-controls": "dv-tabpanel", tabindex: k === st.tab ? "0" : "-1", onclick: () => pick(k) }, n)));
    sl.hidden = false;
    M.swap(sl, head(i, closeDev, "soh"), tabs, body, footFor(i.c));
    const nb = sl.querySelector(".sob"); if (nb) nb.scrollTop = top;
  }
  function details(i) {
    const kv = (rows) => el("div.kvs", {}, rows.filter(Boolean).flatMap(([k, v, mono]) => [el("span", {}, k), el("b" + (mono ? ".mono" : ""), {}, v)]));
    const fmt = (v) => (v === null ? "—" : typeof v === "boolean" ? String(v) : String(v));
    const vals = Object.entries(i.vals).sort(([a], [b]) => a.localeCompare(b));
    const c = i.c;
    return [
      kv([[K.t("devices.col.id"), String(i.id), true], [K.t("devices.col.driver"), i.driver || "—"], [K.t("devices.details.hubRoom"), c.hubRoom || "—"], [K.t("devices.details.roomNow"), i.room],
        [K.t("devices.showsAs"), K.t(i.o.as ? "devices.details.asChanged" : "devices.details.asAuto", { role: M.roleName(i.role) })], [K.t("devices.col.battery"), i.battery == null ? K.t("devices.mains") : `${i.battery}%`, true],
        [K.t("devices.details.health"), i.health ? word(i.health) : K.t("devices.details.notReported"), false], [K.t("devices.col.last"), i.lastAt ? `${when(i.lastAt)} (${ago(i.lastAt)})` : K.t("devices.details.nothingSince"), true],
        [K.t("devices.details.firstSeen"), i.firstSeen ? ((d) => (i.isNew ? K.t("devices.details.firstSeenNew", { date: d }) : d))(new Date(i.firstSeen * 1000).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })) : "—"]]),
      el("div.dsec", {}, el("h4", {}, K.t("devices.details.attrs", { n: vals.length })), vals.length ? el("div.kvs.attrs", {}, vals.flatMap(([k, v]) => [el("span.mono", {}, k), el("b.mono", {}, fmt(v))]))
        : el("p.gf", {}, K.t("devices.details.noValues"))),
      el("div.dsec", {}, el("h4", {}, K.t("devices.details.caps")), el("div.chipl", {}, (c.caps || []).length ? c.caps.map((x) => el("span.tag", {}, x)) : el("span.muted", {}, K.t("devices.details.none")))),
      el("div.dsec", {}, el("h4", {}, K.t("devices.details.cmds")), el("div.chipl", {}, (c.cmds || []).length ? c.cmds.map((x) => el("span.tag.mono", {}, x)) : el("span.muted", {}, K.t("devices.details.none")))),
    ];
  }
  function panelsTab(i) {
    const box = el("div.dv-panels", {}, el("p.muted", {}, K.t("common.loading")));
    const fill = (v) => {
      const via = (p) => [p.via.includes("room") ? K.t("devices.panels.viaRoom", { room: i.room }) : "", p.via.includes("extra") ? K.t("devices.panels.viaExtra") : "", p.via.includes("thermostat") ? K.t("devices.viaThermostat") : "",
        p.cards ? K.t("devices.panels.viaCards", { n: p.cards }) : ""].filter(Boolean).join(" · ");
      box.replaceChildren(el("p.gf", {}, K.t("devices.panels.about")),
        v.list.length ? el("div.grp", {}, v.list.map((p) => K.row(p.name, p.hidden ? (via(p) ? K.t("devices.panels.takenOffVia", { via: via(p) }) : K.t("devices.panels.takenOff")) : via(p),
          M.can("panels", p.id) ? el("button.btn.sm", { type: "button", onclick: () => M.go(`panels/${p.id}`) }, ic("tablet", 14), K.t("control.open")) : null)))
          : el("div.dv-empty.sm", {}, el("span.ei", {}, ic("tablet", 20)), el("h3", {}, !v.ok ? K.t("devices.panels.cantRead") : M.can("panels") ? K.t("devices.panels.none") : K.t("devices.panels.noneSeen")),
            el("p", {}, !v.ok ? K.t("devices.panels.tryAgain") : M.can("panels") ? K.t("devices.panels.noneText") : K.t("devices.panels.noneSeenText"))));
    };
    loadPanels(i.id).then((v) => { if (box.isConnected) fill(v); });
    return box;
  }

  // ================================================================== the phone (v2.8.0; the design notes)
  // A search, then By room (B: a grid of rooms, a tap opens the room — #devices/room/<room>, ‹ Devices) or All devices
  // (A: chips, rows under room headings) — the choice kept per login (prefs views["devices-phone"]). A tap on a device:
  // its sheet — the room, the panel PIN rule and (the admin) "the panels may switch it" can be changed there, saved
  // together; everything else is shown, to change on a computer. No switching devices from the phone .
  const ph = { q: "", chip: "all" };
  const slug = (room) => (room === K.t("devices.noRoom") ? "none" : String(room).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "room");
  const phMode = () => (S.prefs().views["devices-phone"] === "all" ? "all" : "room");
  const needsLook = (i) => i.health === "offline" || (i.battery != null && i.battery < BATTERY_LOW);
  const CHIPS = [["all", K.t("devices.phone.all"), () => true], ["look", K.t("devices.phone.look"), needsLook], ["lit", K.t("devices.phone.lit"), (i) => i.states.includes("on")],
    ["light", K.t("devices.phone.lights"), (i) => i.type === "light"], ["door", K.t("devices.phone.doors"), (i) => ["door", "window", "garage", "shade"].includes(i.type)],
    ["lock", K.t("devices.phone.locks"), (i) => i.type === "lock"], ["sensor", K.t("devices.phone.sensors"), (i) => i.type === "sensor"], ["climate", K.t("devices.phone.climate"), (i) => i.type === "climate"],
    ["switch", K.t("devices.phone.switches"), (i) => ["switch", "outlet", "fan", "valve"].includes(i.type)], ["person", K.t("devices.phone.people"), (i) => i.type === "person"]];
  function renderPhone() {
    const rest = S.route().rest;
    if (rest[0] && rest[0] !== "room") S.sync([]);   // (a computer's #devices/basic: plain #devices here)
    if (M.devicesPhoneChip) { ph.chip = M.devicesPhoneChip; ph.q = ""; M.devicesPhoneChip = null; if (phMode() !== "all") S.savePrefs({ views: { "devices-phone": "all" } }); }
    const q = el("input", { type: "search", placeholder: K.t("devices.phone.searchHint"), autocomplete: "off", spellcheck: "false", "aria-label": K.t("devices.search"), value: ph.q, "data-fk": "dvp-q",
      oninput: (e) => { ph.q = e.target.value; draw(); } });
    parts = { q, sum: el("p.dvp-sum"), body: el("div.dvp-body"), title: el("h1", {}, K.t("devices.shared.aboutdevices")) };
    $page = el("div.dv-page.dvp", { "data-view": "phone" }, el("div.ph", {}, el("div", {}, parts.title)), parts.sum,
      el("label.dvp-q", {}, ic("search", 18), q), parts.body);
    M.swap(M.$main, $page);
    draw();
    poll();
  }
  // (v2.9.3 gate 2) a device that is only on a layout card (a scene button, a media player) but this login may use:
  // listed on the phone too — "On a card", its icon from what it does
  const cardOnly = (i) => (!i.role || i.role === "hidden") && !!(controlsOf(i.id) || []).length;
  const roleWords = (i) => (cardOnly(i) ? K.t("devices.onCard") : M.roleName(i.role));
  const phIcon = (i) => (cardOnly(i) ? ((controlsOf(i.id) || []).some((c) => c === "play" || c === "setVolume") ? "music" : "grid") : iconOf(i));
  const phRow = (i) => el("button.dvp-row", { type: "button", "data-fk": `dev:${i.id}`, onclick: () => phoneSheet(i.id),
    "aria-label": K.t(i.battery != null && i.battery < BATTERY_LOW ? "devices.phone.rowBattery" : "devices.phone.row", { name: i.name, role: roleWords(i), room: i.room, state: i.main[0], n: i.battery }) },
  el("span.di" + (i.main[1] === "lit" ? ".on" : ""), { "aria-hidden": "true" }, iconEl(phIcon(i), 20)),
  el("span.t", { "aria-hidden": "true" }, el("b", {}, i.name), el("small", {}, `${roleWords(i)} · ${i.room}`)),
  el("span.s" + (i.main[1] === "bad" ? ".bad" : i.main[1] === "warn" || (i.battery != null && i.battery < BATTERY_LOW) ? ".warn" : ""), { "aria-hidden": "true" },
    el("span.dot." + dotOf(i.main[1])), el("span", {}, i.battery != null && i.battery < BATTERY_LOW ? `${i.main[0]} · ${i.battery} %` : i.main[0])),
  ic("chevR", 16));
  const byName2 = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  function grouped(xs) {
    const m = new Map();
    for (const i of xs.slice().sort(byName2)) { if (!m.has(i.room)) m.set(i.room, []); m.get(i.room).push(i); }
    return [...m].sort(([a], [b]) => (a === K.t("devices.noRoom")) - (b === K.t("devices.noRoom")) || a.localeCompare(b));
  }
  const listOf = (xs) => el("div.dvp-list", {}, xs.map(phRow));
  function drawPhone(list) {
    const vis = list.filter((i) => i.type !== "hidden" || cardOnly(i)), body = parts.body;   // (v2.9.3: and what this login may use on a card)
    const on = vis.filter((i) => i.type === "light" && i.states.includes("on")).length, offN = vis.filter((i) => i.health === "offline").length;
    parts.sum.textContent = [K.t("devices.shared.roomDevices", { n: vis.length }), K.t("devices.phone.lightsOn", { n: on }), offN ? K.t("devices.phone.offline", { n: offN }) : ""].filter(Boolean).join(" · ");
    if (parts.q.value !== ph.q) parts.q.value = ph.q;
    const rest = S.route().rest;
    const qq = ph.q.trim().toLowerCase();
    const hits = (xs) => (qq ? xs.filter((i) => hay(i).includes(qq) || TYPE_OF(i.role).includes(qq)) : xs);
    const none = (words) => el("p.dvp-none", {}, words);
    if (!vis.length) return body.replaceChildren(none(K.t("devices.phone.noneYet")));
    // a room, opened (‹ Devices in the top bar)
    if (rest[0] === "room" && rest[1]) {
      const room = grouped(vis).find(([r]) => slug(r) === rest[1]);
      if (!room) return body.replaceChildren(none(K.t("devices.phone.roomEmpty")));
      S.sync(["room", rest[1]], room[0]);
      const xs = hits(room[1]);
      if (parts.title) parts.title.textContent = room[0];   // (the room's own name as the heading — gate 2)
      parts.sum.textContent = K.t("devices.shared.roomDevices", { n: room[1].length });
      return body.replaceChildren(xs.length ? listOf(xs) : none(K.t("devices.phone.roomNoMatch", { room: room[0], q: ph.q.trim() })));
    }
    if (parts.title && parts.title.textContent !== K.t("devices.shared.aboutdevices")) parts.title.textContent = K.t("devices.shared.aboutdevices");
    const mode = phMode();
    const seg = el("div.seg.dvp-seg", { role: "group", "aria-label": K.t("devices.phone.show") }, [["room", K.t("devices.phone.byRoom")], ["all", K.t("devices.phone.allDevices")]].map(([k, n]) =>
      el("button" + (mode === k ? ".on" : ""), { type: "button", "aria-pressed": String(mode === k), onclick: () => { S.savePrefs({ views: { "devices-phone": k } }); draw(); } }, n)));
    const kids = [seg];
    if (mode === "room" && !qq) {
      kids.push(el("div.dvp-rooms", {}, grouped(vis).map(([r, xs]) => {
        const lit = xs.filter((i) => i.states.includes("on")).length, look = xs.some(needsLook);
        const count = K.t("devices.shared.roomDevices", { n: xs.length }), onNow = lit ? K.t("devices.phone.onN", { n: lit }) : "";
        const says = [count, onNow, r === K.t("devices.noRoom") ? K.t("devices.phone.noRoomText") : "", look ? K.t("devices.phone.needsLook") : ""].filter(Boolean);
        return el("button.card.dvp-room", { type: "button", onclick: () => S.go(`devices/room/${slug(r)}`), "aria-label": `${r}: ${says.join(". ")}` },
          el("span.ri", { "aria-hidden": "true" }, r === K.t("devices.noRoom") ? ic("users", 18) : (D().roomIcons || {})[r] ? iconEl(D().roomIcons[r], 20) : ic("home", 18)), el("b", { "aria-hidden": "true" }, r),
          el("small", { "aria-hidden": "true" }, count), onNow ? el("small", { "aria-hidden": "true" }, onNow) : null,
          r === K.t("devices.noRoom") ? el("small", { "aria-hidden": "true" }, K.t("devices.phone.noRoomShort")) : null, look ? el("span.warnd", { "aria-hidden": "true" }) : null);
      })));
    } else {
      const counts = new Map(CHIPS.map(([k, , f]) => [k, vis.filter(f).length]));
      if (!CHIPS.some(([k]) => k === ph.chip)) ph.chip = "all";
      if (mode === "all") {
        kids.push(el("div.dvp-chips", { role: "group", "aria-label": K.t("devices.phone.showOnly") }, CHIPS.filter(([k]) => k === "all" || k === ph.chip || counts.get(k)).map(([k, n]) =>
          el("button", { type: "button", "aria-pressed": String(ph.chip === k), onclick: () => { ph.chip = k; draw(); } }, n, el("span", {}, String(counts.get(k)))))));
      }
      const f = mode === "all" ? CHIPS.find(([k]) => k === ph.chip)[2] : () => true;
      const xs = hits(vis.filter(f));
      if (!xs.length) kids.push(none(qq ? K.t("devices.phone.noMatch", { q: ph.q.trim() }) : K.t("devices.phone.noFit")));
      for (const [r, ys] of grouped(xs)) kids.push(el("h2.dvp-gh", {}, r, el("span", {}, String(ys.length))), listOf(ys));
    }
    body.replaceChildren(...kids);
  }
  // the device sheet: the room, the PIN rule, may switch (the admin); the rest shown — set on a computer
  function phoneSheet(id) {
    const d = D(), i0 = allInfo().find((x) => x.id === id);
    if (!i0) return;
    const c = i0.c, o = d.overrides[c.id] || {}, now = o.as || c.is;
    const edit = M.can("devices");
    const want = { room: o.room || "", confirm: !!o.confirm, allowed: d.never ? !d.never.has(c.id) : true };
    const was = { ...want };
    const field = (label, ctl, hint) => el("label.ps-field", {}, el("b", {}, label), ctl, hint ? el("small", {}, hint) : null);
    const room = el("select", { disabled: !edit, onchange: (e) => { want.room = e.target.value; } },
      el("option", { value: "" }, c.hubRoom ? K.t("devices.ed.fromHub", { room: c.hubRoom }) : K.t("devices.noRoom")),
      d.rooms.filter((x) => x !== c.hubRoom).map((x) => el("option", { value: x, selected: o.room === x }, x)));
    const segOf = (opts, cur, set, label, dis) => el("div.seg", { role: "group", "aria-label": label }, opts.map(([v, n]) =>
      el("button" + (cur === v ? ".on" : ""), { type: "button", "aria-pressed": String(cur === v), disabled: dis, onclick: (e) => {
        set(v); for (const b of e.currentTarget.parentNode.children) { const on2 = b === e.currentTarget; b.classList.toggle("on", on2); b.setAttribute("aria-pressed", String(on2)); } } }, n)));
    const fixed = FIXED_PIN.includes(now);
    const editRows = [field(K.t("devices.room"), room, K.t("devices.phone.roomHint"))];
    if (SWITCHY.includes(now)) {
      editRows.push(fixed ? el("div.ps-field", {}, el("b", {}, K.t("control.pinTitle")), el("p.ps-ro", {}, K.t("devices.phone.pinFixed")))
        : el("div.ps-field", {}, el("b", {}, K.t("control.pinTitle")), segOf([[false, K.t("devices.phone.noPin")], [true, K.t("devices.phone.askPin")]], want.confirm, (v) => { want.confirm = v; }, K.t("control.pinTitle"), !edit),
          el("small", {}, K.t("devices.phone.pinBefore"))));
    }
    const mayRow = M.isAdmin() && d.switchable && d.switchable.has(c.id);
    if (mayRow) editRows.push(el("div.ps-field", {}, el("b", {}, K.t("devices.maySwitch")), segOf([[true, K.t("devices.phone.yes")], [false, K.t("devices.phone.noViewOnly")]], want.allowed, (v) => { want.allowed = v; }, K.t("devices.maySwitch")),
      el("small", {}, K.t("devices.phone.noHint"))));
    const LTn = o.lightType ? LT[o.lightType] || o.lightType : K.t("devices.automatic");
    const roRows = [[K.t("devices.showsAs"), o.as ? M.roleName(now) : K.t("devices.details.asAuto", { role: M.roleName(now) })]];
    if (now === "light") roRows.push([K.t("devices.ed.lightType"), LTn]);
    if (now === "light" && o.colorCmd) roRows.push([K.t("devices.ed.colourCmd"), o.colorCmd === "setColor" ? K.t("devices.phone.oneCmd") : K.t("devices.phone.hueSat")]);
    if (now === "fan") roRows.push([K.t("devices.ed.fanType"), o.fanType ? FAN_NAMES[o.fanType] || o.fanType : K.t("devices.automatic")]);
    if (o.icon) roRows.push([K.t("devices.ed.picture"), K.t("devices.phone.ownPicture")]);
    const panelsBox = el("div.ps-ro", {}, K.t("common.loading"));
    loadPanels(id).then((v) => { if (!panelsBox.isConnected) return;
      panelsBox.textContent = !v.ok ? K.t("devices.phone.panelsCantRead") : v.list.length ? v.list.map((x) => x.name || x.id).join(", ") : K.t("devices.phone.panelsNone"); });
    const save = edit ? el("button.btn.pri", { type: "button" }, K.t("devices.phone.save")) : null;
    const dirty = () => want.room !== was.room || want.confirm !== was.confirm || want.allowed !== was.allowed;
    const ctlBox = controlSection(i0);   // (v2.9.1: switching, when this login may)
    sheetCtl = ctlBox ? { id, box: ctlBox } : null;
    const sh = K.sheet({
      title: i0.name, sub: `${i0.room} · ${M.roleName(now)}${now === "light" && o.lightType ? ` · ${LTn.toLowerCase()}` : ""}`,
      icon: el("span.di" + (i0.main[1] === "lit" ? ".on" : ""), { "aria-hidden": "true" }, iconEl(iconOf(i0), 22)),
      body: [
        el("div.dvp-tags", {}, el("span.pill" + (i0.main[1] === "bad" ? ".bad" : i0.main[1] === "warn" ? ".warn" : ""), {}, el("span.dot." + dotOf(i0.main[1])), i0.main[0]),
          i0.battery != null ? el("span.pill" + (i0.battery < BATTERY_LOW ? ".warn" : ".idle"), {}, ic("battery", 13), `${i0.battery} %`) : null,
          el("span.pill.idle", {}, i0.driver || "—"), el("span.pill.idle", {}, K.t("devices.phone.id", { id: i0.id }))),
        ctlBox,
        el("section.ps-sec", {}, el("h3", {}, K.t("devices.ed.onPanels")), ...editRows,
          el("p.ps-ro", {}, K.t("devices.phone.nameFromHub"))),
        el("section.ps-sec", {}, el("h3", {}, K.t("devices.phone.rightNow")),
          el("div.ps-kv", {}, el("span", {}, K.t("devices.col.state")), el("b", {}, i0.main[0]),
            el("span", {}, i0.health === "offline" ? K.t("devices.phone.lastHeard") : K.t("devices.col.last")), el("b", {}, i0.lastAt ? ago(i0.lastAt) : K.t("devices.phone.notSince"))),
          el("b", { style: "display:block;margin:0 0 6px;font-size:14px" }, K.t("devices.phone.shownOn")), panelsBox),
        el("section.ps-sec", {}, el("h3", {}, K.t("devices.phone.lastEvents")), el("div.dvp-ev", {}, eventList(id, 5))),
        el("section.ps-sec", {}, el("h3", {}, K.t("devices.phone.onComputer")),
          el("div.ps-kv", {}, ...roRows.flatMap(([k, v]) => [el("span", {}, k), el("b", {}, v)])),
          el("p.ps-ro", {}, K.t("devices.phone.onComputerText"))),
        edit ? null : el("p.ps-ro", {}, K.t("devices.phone.lookOnly")),
      ].filter(Boolean),
      actions: edit ? [el("button.btn", { type: "button", onclick: () => sh.request() }, K.t("control.cancel")), save] : [el("button.btn", { type: "button", onclick: () => sh.close() }, K.t("common.close"))],
      dirty,
    });
    if (!save) return;
    save.addEventListener("click", async () => {
      if (!dirty()) return sh.close();
      save.disabled = true; save.setAttribute("aria-busy", "true"); sh.msg(K.t("devices.phone.saving"));
      try {
        const set = {};
        if (want.room !== was.room) set.room = want.room || null;
        if (want.confirm !== was.confirm) set.confirm = want.confirm || null;
        if (Object.keys(set).length) {
          const r = await api("/api/manage/devices", { id: c.id, set });
          if (!r.ok) throw new Error(r.error || K.t("devices.notSaved"));
          if (was.room && !(r.overrides || {}).room) c.room = null;
          d.overrides[c.id] = r.overrides;
          if (!Object.keys(r.overrides || {}).length) delete d.overrides[c.id];
          was.room = want.room; was.confirm = want.confirm;
        }
        if (want.allowed !== was.allowed) {
          const r = await api("/api/manage/never", { id: c.id, allowed: want.allowed });
          if (!r.ok) throw new Error(r.error || K.t("devices.notSaved"));
          if (want.allowed) d.never.delete(c.id); else d.never.add(c.id);
          was.allowed = want.allowed;
          try { await M.loadDevices(); } catch { /* (the old list stays) */ }   // (the Control section follows at once)
        }
        await sh.close();
        toast(M.follow());
        draw();
        refreshSoon();
      } catch (e) {
        save.disabled = false; save.removeAttribute("aria-busy");
        if (e.message === "login") { sh.msg(""); return; }
        sh.msg(e.message && e.message !== "Failed to fetch" ? K.t("devices.phone.notSavedWhy", { why: e.message }) : K.t("devices.phone.notSavedOffline"), true);   // i18n-ok ("Failed to fetch": the browser's own error)
      }
    });
  }

  // ================================================================== switching from the Manager (v2.9.1;–)
  // A Control section at the top of a device's editor (the phone's sheet, Basic's drawer, Detailed's Settings tab) —
  // only for what the server lists for this login (GET /api/manage/devices "controls": admins and logins with the
  // "Switch devices from the Manager" right; the panels' switchable devices, never the never list). One command at a
  // time: the controls are busy until the server has the bridge's real answer (PATCH …/<id>/command; no optimistic
  // flip — v2.9.2: it flips at once now, see opt); a device that needs the panel PIN asks for it in the PIN pad, exactly when a panel would. The rows stay
  // view only — nothing switches from a list. Never unlock .
  const ctl = { busy: null, msg: null };   // busy: the device id waiting for an answer; msg: {id, text, bad}
  const t = K.t;
  const controlsOf = (id) => ((D() && D().controls) || {})[String(id)] || null;
  // (gate 2) the device's state now, as words — separate from the buttons, which stay neutral actions
  function stateNow(v) {
    const bits = [];
    if (v.switch === "on" || v.switch === "off") bits.push(t(v.switch === "on" ? "control.stOn" : "control.stOff"));
    const oc = String(v.valve || v.door || v.windowShade || "");
    if (/open/.test(oc)) bits.push(t("control.stOpen")); else if (/clos/.test(oc)) bits.push(t("control.stClosed"));
    if (v.lock === "locked" || v.lock === "unlocked") bits.push(t(v.lock === "locked" ? "control.stLocked" : "control.stUnlocked"));
    const lvl = num(v.level), pos = num(v.position);
    if (lvl != null && v.switch !== "off") bits.push(t("control.stPct", { n: Math.round(lvl) }));
    else if (pos != null) bits.push(t("control.stPct", { n: Math.round(pos) }));
    return bits.length ? bits.join(" · ") : t("control.stUnknown");
  }
  // (v2.9.3) the rest of "Now:" — a thermostat's mode and setpoints, a light's colour temperature, a fan's speed,
  // a media player's state and volume (the pill keeps stateNow's words)
  const MODE_W = (m) => { const k = `control.tmode.${m}`, tab = (window.SKYPANE_STRINGS || {}).en || {};
    return Object.prototype.hasOwnProperty.call(tab, k) ? t(k) : String(m); };   // (a word the table has; else the device's own)
  function stateMore(v, cmds) {
    const has = (c) => cmds.includes(c), bits = [];
    if (has("setThermostatMode") && typeof v.thermostatMode === "string") bits.push(MODE_W(v.thermostatMode));
    if (has("setHeatingSetpoint") && num(v.heatingSetpoint) != null) bits.push(t("control.stHeat", { n: num(v.heatingSetpoint) }));
    if (has("setCoolingSetpoint") && num(v.coolingSetpoint) != null) bits.push(t("control.stCool", { n: num(v.coolingSetpoint) }));
    if (has("setThermostatFanMode") && typeof v.thermostatFanMode === "string") bits.push(t("control.stFan", { m: MODE_W(v.thermostatFanMode) }));
    if (has("setColorTemperature") && num(v.colorTemperature) != null && v.colorMode !== "RGB") bits.push(`${Math.round(num(v.colorTemperature))} K`);
    if ((has("setHue") || has("setColor")) && v.colorMode === "RGB") bits.push(t("control.stColour"));
    if (has("setSpeed") && typeof v.speed === "string" && v.switch !== "off") bits.push(MODE_W(v.speed));
    if (has("setFanSpeed") && fanSpd(v) != null) bits.push(t("control.stSpeed", { n: fanSpd(v) }));
    const play = String(v.transportStatus || v.status || "");
    if ((has("play") || has("pause")) && /play|paus|stop/.test(play)) bits.push(t(/play/.test(play) ? "control.stPlaying" : /paus/.test(play) ? "control.stPaused" : "control.stStopped"));
    if (has("setVolume") && num(v.volume) != null) bits.push(t("control.stVolume", { n: Math.round(num(v.volume)) }));
    if ((has("mute") || has("unmute")) && v.mute === "muted") bits.push(t("control.stMuted"));
    return bits;
  }
  const fanSpd = (v) => { const x = v.speed ?? v.fanSpeed ?? v.airPurifierSpeed; return x == null || x === "" ? null : String(x); };
  const fanKey = (v) => ["speed", "fanSpeed", "airPurifierSpeed"].find((k) => v[k] != null && v[k] !== "") || "speed";
  const cap = (w) => { const s2 = String(w); return s2 ? s2[0].toUpperCase() + s2.slice(1) : s2; };   // (a choice's words: sentence case)
  const describe = (v, cmds) => { const b = stateNow(v), more = stateMore(v, cmds || []);
    return b === t("control.stUnknown") ? (more.length ? more.join(" · ") : b) : [b, ...more].join(" · "); };
  // (v2.9.3) commands whose result the device doesn't report as a state: done once the hub has it
  const NO_STATE = new Set(["nextTrack", "previousTrack", "push", "stop", "auto", "fanOn"]);
  // whether the device now reports what this command asks for
  function reached(command, value, v) {
    const oc = String(v.valve || v.door || v.windowShade || "");
    if (command === "on") return v.switch === "on";
    if (command === "off") return v.switch === "off";
    if (command === "open") return /open/.test(oc) || (!oc && v.switch === "on");
    if (command === "close") return /clos/.test(oc) || (!oc && v.switch === "off");
    if (command === "lock") return v.lock === "locked";
    if (command === "setLevel") return num(v.level) != null && Math.abs(num(v.level) - value) <= 1;
    if (command === "setPosition") return num(v.position) != null && Math.abs(num(v.position) - value) <= 2;
    if (command === "setHeatingSetpoint") return num(v.heatingSetpoint) != null && Math.abs(num(v.heatingSetpoint) - value) <= 0.5;
    if (command === "setCoolingSetpoint") return num(v.coolingSetpoint) != null && Math.abs(num(v.coolingSetpoint) - value) <= 0.5;
    if (command === "setThermostatMode") return v.thermostatMode === value;
    if (command === "setThermostatFanMode") return v.thermostatFanMode === value;
    if (command === "setColorTemperature") return num(v.colorTemperature) != null && Math.abs(num(v.colorTemperature) - value) <= 150;
    if (command === "setHue") return num(v.hue) != null && Math.abs(num(v.hue) - value) <= 2;
    if (command === "setSaturation") return num(v.saturation) != null && Math.abs(num(v.saturation) - value) <= 2;
    if (command === "setColor") { const [h, sa] = String(value).split(",").map(Number); return num(v.hue) != null && Math.abs(num(v.hue) - h) <= 2 && num(v.saturation) != null && Math.abs(num(v.saturation) - sa) <= 2; }
    if (command === "setSpeed") return v.speed === value;
    if (command === "setFanSpeed") return fanSpd(v) === String(value);
    if (command === "setVolume") return num(v.volume) != null && Math.abs(num(v.volume) - value) <= 2;
    if (command === "play") return /play/.test(String(v.transportStatus || v.status || ""));
    if (command === "pause") return /paus|stop/.test(String(v.transportStatus || v.status || ""));
    if (command === "mute") return v.mute === "muted";
    if (command === "unmute") return v.mute === "unmuted";
    return false;
  }
  // (v2.9.3) a colour picker's #rrggbb → Hubitat's hue and saturation (0–100 each, the brightness left alone) and back
  function hexToHs(hex) {
    const n = parseInt(String(hex).slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [Math.round(((h * 60 + 360) % 360) / 3.6), Math.round(mx ? (d / mx) * 100 : 0)];
  }
  function hsToHex(h, sa) {
    const H = (h / 100) * 6, S = sa / 100, f = (k) => { const x = (k + H) % 6; return 1 - S * Math.max(0, Math.min(x, 4 - x, 1)); };
    return "#" + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
  }
  // (v2.9.3) a setpoint stepper waits a moment after the last press, then sends once (one command a second a device)
  const stepWait = new Map();   // "id:command" → {value, timer}
  function stepSoon(i, command, value) {
    const k = `${i.id}:${command}`, o = stepWait.get(k) || {};
    clearTimeout(o.timer);
    const go = () => { if (ctl.busy != null) { stepWait.set(k, { value, timer: setTimeout(go, 700) }); return; } stepWait.delete(k); send(i, command, value); };
    stepWait.set(k, { value, timer: setTimeout(go, 1200) });
  }
  const valuesOfCmd = (id, c) => ((((D() && D().controlValues) || {})[String(id)] || {})[c]) || null;
  function moreRows(i, cmds, v, dis) {
    const has = (c) => cmds.includes(c), rows = [];
    const btn = (c, words, val, on) => el("button.btn.dvc-b" + (on ? ".on" : ""), { type: "button", disabled: dis, "aria-pressed": on == null ? null : String(!!on),
      onclick: (e) => { if (realTap(e)) send(i, c, val); } }, words);
    const pick = (c, label, cur) => {
      const words = valuesOfCmd(i.id, c) || [];
      if (!words.length) return null;
      return el("label.dvc-lvl.dvc-pick", {}, el("span", {}, label),
        el("select.dvc-sel", { disabled: dis, "aria-label": label, onchange: (e) => send(i, c, e.target.value) },
          !words.includes(cur) ? el("option", { value: "", selected: true, disabled: true }, "—") : null,
          words.map((w) => el("option", { value: w, selected: w === cur }, cap(MODE_W(w))))), el("span"));
    };
    // the thermostat: its mode, the setpoints (a stepper: − 68° +, sent a moment after the last press), its fan
    if (has("setThermostatMode")) { const r = pick("setThermostatMode", t("control.tMode"), v.thermostatMode); if (r) rows.push(r); }
    for (const [c, label, key] of [["setHeatingSetpoint", t("control.heatTo"), "heatingSetpoint"], ["setCoolingSetpoint", t("control.coolTo"), "coolingSetpoint"]]) {
      if (!has(c)) continue;
      const w = stepWait.get(`${i.id}:${c}`), cur = w ? w.value : num(v[key]);
      const out = el("output.dvc-val", {}, cur != null ? `${cur}°` : "—");
      const step = (d) => { const base = (stepWait.get(`${i.id}:${c}`) || {}).value ?? num(v[key]) ?? 70, n = Math.max(50, Math.min(90, base + d));
        out.textContent = `${n}°`; stepSoon(i, c, n); };
      rows.push(el("div.dvc-lvl.dvc-step", { role: "group", "aria-label": label }, el("span", {}, label),
        el("span.dvc-stp", {}, el("button.btn.sm", { type: "button", disabled: dis, "aria-label": t("control.lower", { what: label }), onclick: (e) => { if (realTap(e)) step(-1); } }, "−"), out,
          el("button.btn.sm", { type: "button", disabled: dis, "aria-label": t("control.raise", { what: label }), onclick: (e) => { if (realTap(e)) step(1); } }, "+")), el("span")));
    }
    if (has("setThermostatFanMode")) { const r = pick("setThermostatFanMode", t("control.tFan"), v.thermostatFanMode); if (r) rows.push(r); }
    // a light's colour temperature and colour
    if (has("setColorTemperature")) {
      const cur = num(v.colorTemperature), out = el("output.dvc-val", {}, cur != null ? `${Math.round(cur)} K` : "—");
      rows.push(el("label.dvc-lvl", {}, el("span", {}, t("control.white")), el("input.dvc-range.dvc-ct", { type: "range", min: "2000", max: "6500", step: "100",
        value: String(cur != null ? Math.round(cur / 100) * 100 : 3000), disabled: dis, "aria-label": t("control.white"),
        oninput: (e) => { out.textContent = `${e.target.value} K`; }, onchange: (e) => send(i, "setColorTemperature", Number(e.target.value)) }), out));
    }
    if (has("setColor") || (has("setHue") && has("setSaturation"))) {
      const h = num(v.hue), sa = num(v.saturation);
      const inp = el("input.dvc-color", { type: "color", value: h != null && sa != null ? hsToHex(h, sa) : "#ffb347", disabled: dis, "aria-label": t("control.colour"),
        onchange: async (e) => {
          const [hh, ss] = hexToHs(e.target.value);
          if (has("setColor")) return send(i, "setColor", `${hh},${ss}`);
          await send(i, "setHue", hh);   // (as a panel does: two commands, the hue first)
          if (ctl.msg && ctl.msg.bad) return;
          await send(i, "setSaturation", ss);
        } });
      rows.push(el("label.dvc-lvl", {}, el("span", {}, t("control.colour")), inp, el("span")));
    }
    // a fan's speeds; the air purifier
    // (a fan's speeds — not "off" or "on" when On / Off are there already)
    if (has("setSpeed")) rows.push(el("div.dvc-row.dvc-wrap", { role: "group", "aria-label": t("control.speed") }, (valuesOfCmd(i.id, "setSpeed") || [])
      .filter((w) => !(has("on") && has("off") && (w === "off" || w === "on"))).map((w) => btn("setSpeed", cap(MODE_W(w)), w, v.speed === w && v.switch !== "off"))));
    if (has("fanOn") || has("auto")) rows.push(el("div.dvc-row", {}, has("fanOn") ? btn("fanOn", t("control.on")) : null, has("auto") ? btn("auto", t("control.auto")) : null, has("off") && !has("on") ? btn("off", t("control.off")) : null));
    if (has("setFanSpeed")) { const r = pick("setFanSpeed", t("control.speed"), fanSpd(v)); if (r) rows.push(r); }
    // scene buttons
    if (has("push")) { const n = Math.max(1, Math.min(20, num(((D().devices || []).find((x) => x.id === i.id) || {}).buttons) || 1));
      rows.push(el("div.dvc-row.dvc-wrap", { role: "group", "aria-label": t("control.buttons") }, Array.from({ length: n }, (_, k) => btn("push", t("control.button", { n: k + 1 }), k + 1)))); }
    // a media player
    const media = ["previousTrack", "play", "pause", "stop", "nextTrack"].filter(has);
    if (media.length) rows.push(el("div.dvc-row", { role: "group", "aria-label": t("control.media", { name: i.name }) }, media.map((c) => btn(c, t(`control.m.${c}`)))));
    if (has("setVolume")) {
      const cur = num(v.volume), out = el("output.dvc-val", {}, cur != null ? `${Math.round(cur)} %` : "—");
      rows.push(el("label.dvc-lvl", {}, el("span", {}, t("control.volume")), el("input.dvc-range", { type: "range", min: "0", max: "100", step: "1", value: String(cur != null ? Math.round(cur) : 20),
        disabled: dis, "aria-label": t("control.volume"), oninput: (e) => { out.textContent = `${e.target.value} %`; }, onchange: (e) => send(i, "setVolume", Number(e.target.value)) }), out));
    }
    if (has("mute") || has("unmute")) rows.push(el("div.dvc-row", {}, has("mute") ? btn("mute", t("control.m.mute"), undefined, v.mute === "muted") : null, has("unmute") ? btn("unmute", t("control.m.unmute")) : null));
    return rows;
  }
  function controlSection(i) {
    const cmds = controlsOf(i.id);
    if (!cmds || !cmds.length) return null;
    const busy = ctl.busy === i.id, has = (c) => cmds.includes(c), v = i.vals || {};
    const btn = (c, words) => el("button.btn.dvc-b", { type: "button", disabled: busy || ctl.busy != null, onclick: (e) => { if (realTap(e)) send(i, c); } }, words);
    const rows = [];
    if (has("on")) rows.push(el("div.dvc-row", { role: "group", "aria-label": t("control.power", { name: i.name }) }, btn("on", t("control.on")), btn("off", t("control.off"))));
    if (has("open")) rows.push(el("div.dvc-row", { role: "group", "aria-label": t("control.openClose", { name: i.name }) }, btn("open", t("control.open")), btn("close", t("control.close"))));
    if (has("lock")) rows.push(el("div.dvc-row", {}, btn("lock", t("control.lock"))));
    for (const [c, label, cur] of [["setLevel", t("control.level"), num(v.level)], ["setPosition", t("control.position"), num(v.position)]]) {
      if (!has(c)) continue;
      const out = el("output.dvc-val", {}, cur != null ? `${Math.round(cur)} %` : "—");
      const range = el("input.dvc-range", { type: "range", min: "0", max: "100", step: "1", value: String(cur != null ? Math.round(cur) : 50), disabled: busy || ctl.busy != null,
        "aria-label": label, oninput: (e) => { out.textContent = `${e.target.value} %`; }, onchange: (e) => send(i, c, Number(e.target.value)) });
      rows.push(el("label.dvc-lvl", {}, el("span", {}, label), range, out));
    }
    rows.push(...moreRows(i, cmds, v, busy || ctl.busy != null));   // (v2.9.3)
    const m = ctl.msg && ctl.msg.id === i.id ? ctl.msg : null;
    return el("div.dsec.dvc", { "aria-busy": busy ? "true" : "false" }, el("h4", {}, t("control.title")),
      el("p.dvc-note", {}, t("control.rightAway")),
      el("p.dvc-now" + (i.pending ? ".pending" : ""), { "aria-live": "polite" }, t(i.pending ? "control.nowSending" : "control.now", { state: describe(v, cmds) })), ...rows,
      el("p.dvc-msg" + (m && m.bad ? ".bad" : ""), { role: "status", "aria-live": "polite" },
        busy ? (ctl.waiting ? t("control.waiting", { name: i.name }) : t("control.sending")) : m ? m.text : t("control.hint")));
  }
  // (gate 2) a Control button acts on a real tap only: a finger that moved more than a few px, or a scroll / a sheet
  // drag in between, is a gesture — never a command (a keyboard's Enter / Space: always)
  let tap = null;
  document.addEventListener("pointerdown", (e) => { tap = { x: e.clientX, y: e.clientY, el: e.target, moved: false }; }, true);
  document.addEventListener("pointermove", (e) => { if (tap && !tap.moved && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) tap.moved = true; }, true);
  document.addEventListener("pointercancel", () => { if (tap) tap.moved = true; }, true);
  // (a scroll of what holds the button — the sheet, the page; a fling still running: the tap only stops it)
  document.addEventListener("scroll", (e) => { if (tap && (e.target === document || (e.target.contains && e.target.contains(tap.el)))) tap.moved = true; }, true);
  document.addEventListener("touchmove", (e) => { if (tap && e.touches[0] && Math.hypot(e.touches[0].clientX - tap.x, e.touches[0].clientY - tap.y) > 10) tap.moved = true; }, { capture: true, passive: true });
  const realTap = (e) => {
    if (!e || e.detail === 0) return true;   // (keyboard)
    const ok = !tap || (!tap.moved && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= 10);
    tap = null;
    return ok;
  };
  const say = (id, text, bad) => { ctl.msg = { id, text, bad: !!bad }; };
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // the live state now (a background read — Manage.poll), into the house's list
  async function readLive() {
    try {
      const res = await M.poll("/api/manage/devices/live");
      if (!res || !res.ok) return;
      const r = await res.json();
      if (r && r.live && D()) { D().live = r.live; D().heard = r.heard || D().heard; liveSig = r.sig || liveSig; }
    } catch { /* (next try) */ }
  }
  const redrawAll = (id) => { draw(); redrawSheet(id); };
  // what the device reports itself — never the shown-at-once state
  const realVals = (id) => { const d = D(), c = d && (d.devices || []).find((x) => x.id === id), lv = ((d && d.live) || {})[id] || {};
    return { ...((c && c.attrs) || {}), ...(lv.values || {}) }; };
  function flip(id, command, value) {
    const v = realVals(id), oc = ["valve", "door", "windowShade"].find((k) => typeof v[k] === "string");
    const patch = command === "on" || command === "off" ? { switch: command }
      : command === "open" || command === "close" ? (oc ? { [oc]: command === "open" ? "open" : "closed" } : { switch: command === "open" ? "on" : "off" })
        : command === "lock" ? { lock: "locked" }
          : command === "setLevel" ? { level: value, ...(value > 0 ? { switch: "on" } : {}) }
            : command === "setPosition" ? { position: value }
              : command === "setHeatingSetpoint" ? { heatingSetpoint: value } : command === "setCoolingSetpoint" ? { coolingSetpoint: value }
                : command === "setThermostatMode" ? { thermostatMode: value } : command === "setThermostatFanMode" ? { thermostatFanMode: value }
                  : command === "setColorTemperature" ? { colorTemperature: value, colorMode: "CT" }
                    : command === "setHue" ? { hue: value, colorMode: "RGB" } : command === "setSaturation" ? { saturation: value, colorMode: "RGB" }
                      : command === "setColor" ? { hue: Number(String(value).split(",")[0]), saturation: Number(String(value).split(",")[1]), colorMode: "RGB" }
                        : command === "setSpeed" ? { speed: value, switch: value === "off" ? "off" : "on" } : command === "setFanSpeed" ? { [fanKey(realVals(id))]: String(value) }
                          : command === "setVolume" ? { volume: value } : command === "play" ? { status: "playing", transportStatus: "playing" }
                            : command === "pause" ? { status: "paused", transportStatus: "paused" }
                              : command === "mute" ? { mute: "muted" } : command === "unmute" ? { mute: "unmuted" } : null;
    if (patch) opt.set(id, { patch, until: Date.now() + 20000 });   // (a safety net: send() always ends it sooner)
  }
  const pinDevs = new Set();   // ("id:command" that asked for the panel PIN anyway (the bridge): flipped once it is in — never before)
  async function send(i, command, value, pin) {
    if (ctl.busy != null) return;
    // (gate 1: the server marks which commands ask for the PIN — those never flip before it is accepted; the first
    // press is asked once without one, so the server says pin-required / pin-unset / locked, then the PIN pad)
    const pinNow = (((D() && D().controlsPin) || {})[String(i.id)] || []).includes(command);
    const early = pin == null && !pinNow && !pinDevs.has(`${i.id}:${command}`);
    ctl.busy = i.id; ctl.waiting = false; ctl.msg = null;
    if (early) flip(i.id, command, value);
    redrawAll(i.id);
    let r;
    try { r = await api(`/api/manage/devices/${i.id}/command`, { command, ...(value != null ? { value } : {}), ...(pin != null ? { pin } : {}) }); }
    catch (e) { r = { status: e && e.message === "login" ? -1 : 0 }; }
    if (r.status === -1) { opt.delete(i.id); ctl.busy = null; redrawAll(i.id); return; }
    if (r.status === 200 && r.ok) {
      // (the hub has it — shown at once already , until the device itself reports it: read every half second, up to 5 s)
      if (!early) flip(i.id, command, value);   // (the PIN was right: now it flips)
      ctl.waiting = true; redrawAll(i.id);
      let ok = NO_STATE.has(command);
      for (let k = 0; k < 10 && !ok; k++) {
        await sleep(500);
        await readLive();
        ok = reached(command, value, realVals(i.id));
        if (!ok) redrawAll(i.id);
      }
      opt.delete(i.id);
      ctl.busy = null; ctl.waiting = false;
      const state = describe(realVals(i.id), controlsOf(i.id) || []), known = state !== t("control.stUnknown");
      say(i.id, ok ? (NO_STATE.has(command) ? t("control.done") : t("control.doneNow", { name: i.name, state }))
        : t(known ? "control.didntChange" : "control.didntReport", { name: i.name, state }), !ok);
      redrawAll(i.id);
      return;
    }
    opt.delete(i.id);   // (refused or not sent: the real state back, and why — below)
    ctl.busy = null;
    if ((r.status === 403 && (r.error === "pin-required" || r.error === "wrong-pin")) || r.status === 423) {
      pinDevs.add(`${i.id}:${command}`);
      redrawAll(i.id);
      const got = await askPin(i, command, value, r.error === "wrong-pin" ? t("control.wrongPin") : "", r.lockedFor || 0);
      if (got != null) return send(i, command, value, got);
      say(i.id, t("control.notSent"));
      redrawAll(i.id);
      return;
    }
    const WHY = {
      0: t("control.offline"), "pin-unset": t("control.pinUnset"), "never-switch": t("control.never"), "not-switchable": t("control.notSwitchable"),
      "not-yours": t("control.notYours"), "not-allowed": t("control.notAllowed"), "command-not-allowed": t("control.notThis"), "bad-value": t("control.badValue"),
      "no-broker": t("control.noBroker"), "no-bridge": t("control.noBridge"), timeout: t("control.timeout"), "hub-error": t("control.hubError"),
    };
    say(i.id, r.status === 429 ? t("control.tooMany", { s: r.retryIn || 5 }) : r.error === "refused" ? t("control.refused", { why: r.reason || "" })
      : WHY[r.status === 0 ? 0 : r.error] || t("control.notSent"), true);
    redrawAll(i.id);
  }
  // the PIN pad (the Overview's look): its own keys, never the phone's keyboard; a lock-out counts down
  function askPin(i, command, value, why, lockedFor) {
    return new Promise((done) => {
      const ph = S.isPhone();
      const input = el("input.pp-in", { type: "password", inputmode: ph ? "none" : "numeric", readonly: ph ? "" : null, autocomplete: "off", maxlength: "8", "aria-label": t("control.pinLabel"), spellcheck: "false" });
      const msg = el("p.pp-msg" + (why ? ".bad" : ""), { role: "status", "aria-live": "polite" }, why || t("control.pinAsk"));
      const go = el("button.btn.pri", { type: "button" }, t(`control.act.${command}`));   // (gate 2: the action, not "Send")
      const keys = el("div.pp-keys", {}, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((k) =>
        el("button.pp-k" + (/\d/.test(k) ? "" : ".fn"), { type: "button", "aria-label": k === "C" ? t("control.clear") : k === "⌫" ? t("control.delete") : k, tabindex: "-1",
          onclick: () => { if (k === "C") input.value = ""; else if (k === "⌫") input.value = input.value.slice(0, -1); else if (input.value.length < 8) input.value += k; } }, k)));
      let close = null, over = false, tick = null;
      const end = (v) => { if (over) return; over = true; clearInterval(tick); if (close) close(); done(v); };
      const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) end(null); } },
        el("div.modal.small.pinpad", { role: "dialog", "aria-labelledby": "dvc-pp-h" },
          el("h2#dvc-pp-h", {}, ic("lock", 18), t(`control.ask.${command}`, { name: i.name, n: value })),
          el("p.muted", {}, t("control.pinWhy", { name: i.name })), input, keys, msg,
          el("div.pp-acts", {}, el("button.btn.ghost", { type: "button", onclick: () => end(null) }, t("control.cancel")), go)));
      const sendPin = () => { const v = input.value.trim(); if (!/^\d{4,8}$/.test(v)) { msg.className = "pp-msg bad"; msg.textContent = t("control.pinFormat"); return; } end(v); };
      go.addEventListener("click", sendPin);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendPin(); } });
      close = M.dialog(shade, ph ? go : input, () => end(null));
      if (lockedFor > 0) {
        const until = Date.now() + lockedFor * 1000;
        const step = () => {
          const left = Math.ceil((until - Date.now()) / 1000), on = left > 0;
          input.disabled = go.disabled = on; for (const b of keys.children) b.disabled = on;
          msg.className = "pp-msg" + (on ? " bad" : ""); msg.textContent = on ? t("control.lockedOut", { t: mmss(left) }) : t("control.tryAgain");
          if (!on) clearInterval(tick);
        };
        step(); tick = setInterval(step, 1000);
      }
    });
  }
  // (v2.9.3) the same PIN pad for the house's Mode & alarm (housectl.js)
  M.askControlPin = (name, command, words, why, lockedFor) => askPin({ id: 0, name }, command, words, why, lockedFor);
  // (the phone's device sheet: its Control section drawn again in place)
  let sheetCtl = null;   // {id, box}
  function redrawSheet(id) {
    if (!sheetCtl || sheetCtl.id !== id || !sheetCtl.box.isConnected) return;
    const i = allInfo().find((x) => x.id === id); if (!i) return;
    const n = controlSection(i);
    if (n) { sheetCtl.box.replaceChildren(...n.childNodes); sheetCtl.box.setAttribute("aria-busy", n.getAttribute("aria-busy")); }
    // (and the state pill at the top of the sheet)
    const pill = sheetCtl.box.closest(".psheet") && sheetCtl.box.closest(".psheet").querySelector(".dvp-tags .pill");
    if (pill) pill.replaceWith(el("span.pill" + (i.main[1] === "bad" ? ".bad" : i.main[1] === "warn" ? ".warn" : ""), {}, el("span.dot." + dotOf(i.main[1])), i.main[0]));
  }

  // ================================================================== live data every 15 s (only while the page is open)
  function poll() {
    clearTimeout(pollT);
    if (!onPage()) return;
    pollT = setTimeout(async () => {
      if (!onPage()) return;
      if (document.visibilityState === "hidden") return poll();
      let changed = false;
      try {
        const d = D();
        const res = await M.poll(`/api/manage/devices/live${liveSig && d && d.live ? `?sig=${encodeURIComponent(liveSig)}` : ""}`);
        if (!res) return;   // (signed out: the sign-in card is up)
        const r = { status: res.status, ...(await res.json().catch(() => ({}))) };
        if (r.status === 200 && d && r.same) d.heard = r.heard || d.heard;
        else if (r.status === 200 && d && r.live) {
          liveSig = r.sig || ""; changed = true;
          d.live = r.live; d.heard = r.heard || d.heard;
          const ids = (d.devices || []).map((c) => c.id).sort((a, b) => a - b).join();
          if (Array.isArray(r.ids) && (r.ids.join() !== ids || r.modelVersion !== d.modelVersion)) { await M.loadDevices(); if (!onPage()) return; }
          else if (Array.isArray(r.newIds)) D().newIds = r.newIds;
        }
      } catch (e) { if (e.message === "login") return; }   // (signed out: the sign-in form is up; anything else: next time)
      if (st.open && st.cur != null) {
        const before = JSON.stringify((events.get(st.cur) || {}).list || []);
        try { const v = await loadEvents(st.cur, true, true); if (JSON.stringify(v.list) !== before) changed = true; } catch {}
      }
      if (changed && onPage() && !busy() && !typingInEditor()) draw();
      if (changed && sheetCtl) redrawSheet(sheetCtl.id);   // (gate 2: the open phone sheet's state follows too)
      else if (onPage()) for (const n of M.$main.querySelectorAll("[data-ago]")) n.textContent = ago(+n.dataset.ago);
      poll();
    }, POLL);
  }
  const typingInEditor = () => { const a = document.activeElement; return !!a && a.tagName === "INPUT" && !!a.closest(".dv-ed"); };
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && onPage()) poll(); });

  // ================================================================== keys: / the filter, Esc closes the editor
  document.addEventListener("keydown", (e) => {
    if (!onPage() || !$page || !$page.isConnected || document.querySelector(".modal-bg") || document.body.classList.contains("hp-open")) return;
    const a = document.activeElement, typing = a && (/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) || a.isContentEditable);
    if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { const f = parts.input || parts.q; if (f) { e.preventDefault(); f.focus(); } }
    else if (e.key === "Escape" && !e.defaultPrevented && st.open && !document.querySelector(".rail.open, .pop:not([hidden])") && !(a && a.closest && a.closest(".topbar"))) { e.preventDefault(); closeDev(); }
  });
  // (Detailed: a click outside the slide-over and the table closes it)
  document.addEventListener("mousedown", (e) => {
    if (!st.open || !$page || $page.dataset.view !== "detailed" || !onPage()) return;
    if (e.target.closest(".dv-slide, .dv-dt, .topbar, .rail, .pop, .modal-bg, #toast, #gtip, .dv-kpis, .dv-facets, .dv-tbar")) return;
    closeDev();
  });
  window.addEventListener("resize", () => { if (onPage() && $page && $page.isConnected) document.documentElement.classList.toggle("dv-sheet", st.open && S.isPhone()); });

  // ================================================================== in the shell
  S.page("devices", { title: K.t("devices.shared.aboutdevices"), group: "main", icon: "devices", allowed: () => M.can("devices"), words: "hubitat device room battery offline driver filter bulk",
    views: [["basic", K.t("devices.view.basic"), "rows", K.t("devices.view.basicHint")], ["detailed", K.t("devices.view.detailed"), "table", K.t("devices.view.detailedHint")]],
    render: async () => {
      if (M.devicesStale || !D()) {
        if (S.isPhone()) M.$main.replaceChildren(el("div.p-skel", { role: "status", "aria-label": K.t("devices.loading") }, el("i"), el("i"), el("i"), el("i")));   // (v2.8.0)
        M.devicesStale = false; try { await M.loadDevices(); } catch { return; }
      }   // (pictures deleted elsewhere changed some)
      if (S.route().page === "devices") render();
    } });
  M.onSignIn(() => { st.sel.clear(); });
  // (search → one device; the Overview's "View"): its editor, in the view open now
  M.openDevice = (id) => {
    const d = D(); if (!d || !d.devices.some((c) => c.id === id)) return;
    if (S.isPhone()) { if (!$page || !$page.isConnected) render(); return phoneSheet(id); }   // (v2.8.0: the phone's sheet)
    st.cur = id; st.open = true; st.tab = "settings";
    if (!$page || !$page.isConnected) render(); else draw();
    const r = M.$main.querySelector(`[data-fk="dev:${id}"]`); if (r) r.scrollIntoView({ block: "center" });
    const f = document.querySelector(".dv-ed select") || document.querySelector(".dv-ed button"); if (f) f.focus({ preventScroll: true });
  };
  M.renderDevices = () => { if (S.route().page === "devices") render(); };
  M.roomSlug = (room) => slug(room);   // (v2.9.0: the phone's search opens a room)
  M.deviceIcon = (role) => ICON_FOR[role] || TYPE_ICON[TYPE_OF(role)] || "grid";   // (v2.8.0: the phone's search rows)
  M.devicesView = () => ($page && $page.isConnected ? $page.dataset.view : null);   // (help.js: the topic for the view open)
})();
