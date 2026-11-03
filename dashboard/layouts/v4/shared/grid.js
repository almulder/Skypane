// The layout builder's Home page on the panel (release 2): the owner's grid of cards (Manager → Panels → Look & layout
// → "Custom"; the format: service/layouts.py). Plain CSS Grid — no library on the panel: each card is a cell area,
// the browser lays them out once. app.js draws it in place of the fixed columns when Settings.v.homeLayout is "custom".
//
// Every card has a style (corner radius, elevation, surface see-through, border, icon / text size, accent colour),
// tap / hold / double-tap actions, show-when rules (hidden unless they all match) and highlight rules. A command from
// a card goes through the same checks as any tap (Home.send: "only some panels", the PIN) and then the bridge's.
(function () {
  const H = Home, esc = (s) => UI.esc(s);
  const Grid = { cur: null, byId: new Map() };

  Grid.valid = (g) => !!g && typeof g === "object" && Array.isArray(g.cards) && g.cols >= 4 && g.rows >= 3;

  // ---------- rules (show-when / highlight) ----------
  const test = (r) => {
    const v = H.attr(r.id, r.at);
    if (r.op === "gt" || r.op === "lt") {
      const a = parseFloat(v), b = parseFloat(r.v);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      return r.op === "gt" ? a > b : a < b;
    }
    const same = String(v ?? "").toLowerCase() === String(r.v ?? "").toLowerCase();
    return r.op === "eq" ? same : !same;
  };
  const all = (rules) => !rules || !rules.length || rules.every(test);

  // ---------- values ----------
  const fmt = (v, dec) => {
    if (v == null || v === "") return "—";
    const n = typeof v === "number" ? v : parseFloat(v);
    return Number.isFinite(n) && String(v).trim() !== "" && /^-?[\d.]+$/.test(String(v).trim()) ? n.toFixed(dec ?? (Number.isInteger(n) ? 0 : 1)) : String(v);
  };
  // {{123.temperature}} · {{123.name}} · {{time}} · {{date}} · {{greeting}} — every value escaped
  const fill = (text) => esc(text).replace(/\{\{\s*(?:(\d{1,9})\.([A-Za-z][A-Za-z0-9_]{0,39})|(time|date|greeting))\s*\}\}/g, (m, id, at, word) => {
    if (word) return esc(word === "time" ? `${H.time()} ${H.ampm()}` : word === "date" ? H.date() : H.greeting());
    return at === "name" ? esc(H.devName(+id)) : valText({ id: +id, at });   // (with its usual unit: 80 %, 510 W)
  }).replace(/\n/g, "<br>");
  const ids = (text) => [...String(text || "").matchAll(/\{\{\s*(\d{1,9})\./g)].map((m) => +m[1]);

  // a device's word in plain words: "idle" → "Idle", "fan only" → "Fan only", a list (["low","high"]) → "Low, high"
  const words = (v) => {
    let s = String(v ?? "").trim();
    if (/^\[.*\]$/.test(s)) { try { const l = JSON.parse(s); if (Array.isArray(l)) s = l.join(", "); } catch { s = s.replace(/[[\]"]/g, "").replace(/,\s*/g, ", "); } }
    const k = `val.${s.toLowerCase()}`;   // (a known word: the panel's language)
    if (T.has(k)) return T(k);
    return { present: T("g.home"), "not present": T("g.away") }[s] || s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (x) => x.toUpperCase());
  };
  // what a device is right now: [state text, active?, icon]
  const KIND_ICON = { light: "bulb", fan: "fan", outlet: "plug", switch: "power", shade: "shade", valve: "drop", garage: "car" };
  function devState(id) {
    const d = H.device(id), lock = H.state.locks.find((l) => l.id === id), a = H.attrs(id);
    const r = (k) => a[k] ?? H.reading(id, k), w = parseFloat(r("power"));
    // (a plug's switch: what it draws as well)
    const watts = Number.isFinite(w) && w > 0 ? ` · ${Math.round(w)} W` : "";
    if (lock) return [lock.lock === "locked" ? T("state.locked") : lock.lock === "unlocked" ? T("state.unlocked") : T("val.unknown"), lock.lock !== "locked", lock.lock === "locked" ? "lock" : "unlock"];
    if (d && d.kind === "shade" && !d.unknown) {
      // a shade: its words follow where it stands (position, else level — clamped as the drawing is): "Closed",
      // "Open", "Open 40 %"; with neither, its on / off
      let p = pct01(H.attr(id, "position")); if (p == null && d.level != null) p = pct01(d.level);
      if (p != null) { const n = Math.round(p * 100); return [n <= 0 ? T("val.closed") : n >= 100 ? T("val.open") : T("g.openPct", { n }), n > 0, "shade"]; }
      return [d.on ? T("val.open") : T("val.closed"), !!d.on, "shade"];
    }
    // a garage door opener: its door (opening / open / closing / closed), not "On" / "Off"
    if (d && d.kind === "garage" && !d.unknown) { const s = d.door || (d.on ? "open" : "closed"); return [GD_TEXT[s] || words(s), s !== "closed", "garage"]; }
    if (d) {
      const lvl = d.on && d.level != null && d.dim ? ` · ${Math.round(d.level)}%` : "";
      // (a fan: its speed — "On · Medium"; a plug: what it draws)
      const sp = d.kind === "fan" && d.on ? String(r("speed") || "") : "", more = lvl || (sp && !/^(on|off|auto)$/.test(sp) ? ` · ${words(sp)}` : d.on ? watts : "");
      return [d.unknown ? T("val.unknown") : `${d.on ? (d.kind === "shade" ? T("val.open") : T("val.on")) : d.kind === "shade" ? T("val.closed") : T("val.off")}${more}`, !!d.on, KIND_ICON[d.kind] || "power"];
    }
    if (r("contact") != null) return [r("contact") === "open" ? T("val.open") : T("val.closed"), r("contact") === "open", r("contact") === "open" ? "doorOpen" : "door"];
    if (r("switch") != null) return [r("switch") === "on" ? `On${watts}` : T("val.off"), r("switch") === "on", "power"];
    if (r("motion") != null) return [r("motion") === "active" ? T("g.motion") : T("g.still"), r("motion") === "active", "motion"];
    if (r("water") != null) return [r("water") === "wet" ? T("g.wet") : T("thing.dry"), r("water") === "wet", "drop"];
    // a smoke / CO detector: "Clear", or what it found
    if (r("smoke") != null || r("carbonMonoxide") != null) {
      const sm = r("smoke"), co = r("carbonMonoxide"), bad = sm === "detected" ? T("g.smoke") : co === "detected" ? T("g.co") : sm === "tested" || co === "tested" ? T("g.testing") : "";
      return [bad || T("thing.clear"), !!bad, "smoke"];
    }
    // a speaker: "Playing · Morning Jazz", "Paused", "Stopped"
    if (r("status") != null && (r("trackDescription") != null || /^(playing|paused|stopped)$/.test(r("status")))) {
      const tr = r("trackDescription"); return [`${words(r("status"))}${tr ? ` · ${tr}` : ""}`, r("status") === "playing", "speaker"];
    }
    if (r("valve") != null) return [r("valve") === "open" ? T("val.open") : T("val.closed"), r("valve") === "open", "valve"];
    if (r("door") != null) return [GD_TEXT[r("door")] || words(r("door")), r("door") !== "closed", "garage"];
    if (r("temperature") != null) {   // (a thermostat: its mode too — "70° · Auto")
      const m = r("thermostatMode"); return [`${fmt(r("temperature"))}°${m ? ` · ${words(m)}` : ""}`, false, "thermo"];
    }
    if (r("presence") != null) return [r("presence") === "present" ? T("g.home") : T("g.away"), r("presence") === "present", "user"];
    if (r("humidity") != null) return [`${fmt(r("humidity"))} %`, false, "drop"];
    if (r("illuminance") != null) return [`${fmt(r("illuminance"))} lx`, false, "sun"];
    if (r("battery") != null) return [T("g.batteryPct", { n: fmt(r("battery")) }), false, "batteryLow"];
    return ["—", false, "power"];
  }

  // ---------- the cards ----------
  // the devices a card lists one by one (a "Devices" card, a room's lights, its doors / locks): [{id, icon?, title?, wheel?}]
  const ROOM_KINDS = { lights: ["light"], switches: ["switch", "outlet"], fans: ["fan"], shades: ["shade"] };
  function itemsOf(c) {
    const o = c.o || {}, r = Grid.room;
    if (c.t === "group" || c.t === "scenes") return Array.isArray(o.items) ? o.items : [];
    if (c.t === "spot") return (Array.isArray(o.rows) ? o.rows : []).map((r) => ({ id: r.id, as: r.as || "value", passive: !["switch", "lock"].includes(r.as) }));
    if (c.t === "roomdevs") return r ? H.devices(r).filter((d) => !ROOM_KINDS[o.show || "all"] || ROOM_KINDS[o.show].includes(d.kind)).map((d) => ({ id: d.id })) : [];
    if (c.t === "roomopen") { const p = r ? H.placed(r.name) : { locks: [], doors: [], windows: [] }; return [...p.locks, ...p.doors, ...p.windows].map((x) => ({ id: x.id })); }
    // a blank card's pieces: a light / switch / a picture on a device switches (hold: its wheel), a lock slides, a
    // garage's doors open and close; a value, a door, text or a picture on its own only show (the card's own tap)
    if (c.t === "blank") return (Array.isArray(o.parts) ? o.parts : []).map((p) => {
      const as = p.t === "lock" ? "lock" : p.t === "garage" ? "garage" : ["light", "switch"].includes(p.t) || (p.t === "icon" && p.id && switches(p.id)) ? "switch" : "value";
      return { id: p.id, as, passive: as === "value" || (as === "garage" && !(p.doors || []).length), wheel: p.wheel, icon: p.icon, doors: p.doors };
    });
    return [];
  }
  function rows(c, items, empty) {
    const o = c.o;
    if (!items.length) return { html: `${head(o.title)}<div class="gc-empty">${esc(empty)}</div>` };
    // (v3.0.2) "Orbs": the room's devices as Room Layout G draws its lights (roomlayoutG.js: one orb, painted) — tap
    // switches, slide up / down dims, hold: the light's pop-up (the press below); a switch / fan: an orb with its icon
    const G = o.look === "orbs" && window.RoomLayouts && RoomLayouts.G && RoomLayouts.G.orb;
    if (G) return { html: `${head(o.title)}<div class="gc-devs orbs">${items.map((it, n) => {
      const d = H.device(it.id), [st, , i] = devState(it.id), lt = d && d.kind === "light";
      return d ? `<div class="gc-orbi" data-gitem="${n}">${RoomLayouts.G.orb(d, Grid.room && Grid.room.name, lt ? null : ic(it.icon || i, 24, d.on, it.id), lt ? null : st)}</div>` : "";
    }).join("")}</div>` };
    const html = items.map((it, n) => {
      const [st, on, i] = devState(it.id);
      return `<div class="gc-gi${on ? " on" : ""}" data-gitem="${n}">${ic(it.icon || i, 26, on, it.id)}<span class="gc-n">${esc(it.title || H.devName(it.id) || T("g.device"))}</span><span class="gc-s">${esc(st)}</span></div>`;
    }).join("");
    return { html: `${head(o.title)}<div class="gc-devs ${o.look === "tiles" ? "tiles" : "list"}">${html}</div>` };
  }
  Grid.itemsOf = itemsOf;
  // ---------- window coverings that stop part-way (venetian lift / tilt, drapes: art-extra.js) ----------
  // The drawing's <svg> gets --pos (0 closed … 1 open) from the shade's position (the tilt blind: its tilt, else its
  // position); without one it's taken off and the drawing follows on / off. Set on the drawing already on the page
  // (the drawing's markup is shared — never baked in), after every redraw (Grid.fit); a drawing drawn anew starts where
  // the last one stood, so it slides to the new place instead of jumping.
  const WC = { "venetian-lift": "pos", "venetian-blind": "pos", drapes: "pos", "venetian-tilt": "tilt" };
  const wcLast = new Map();   // card / device → the last --pos drawn
  const pct01 = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n / 100)) : null; };
  function coverPos(id, kind) {
    const d = H.device(id);
    if (d && d.unknown) return null;
    let p = kind === "tilt" ? pct01(H.attr(id, "tilt")) : null;
    if (p == null) p = pct01(H.attr(id, "position"));
    if (p == null && d && d.kind === "shade" && d.level != null) p = pct01(d.level);
    if (p == null) { const ws = String(H.attr(id, "windowShade") || H.attr(id, "windowBlind") || "").toLowerCase(); p = ws === "open" ? 1 : ws === "closed" ? 0 : null; }
    return p;
  }
  Grid.coverPos = coverPos;
  function covers(main) {
    for (const box of main.querySelectorAll(".gc-art[data-wc]")) {
      const svg = box.querySelector(".xa-svg"); if (!svg) continue;
      const id = +box.dataset.wc, p = coverPos(id, box.dataset.wct), cell = box.closest("[data-gi]"), k = `${cell ? cell.dataset.gi : ""}|${id}`;
      if (p == null) { svg.style.removeProperty("--pos"); wcLast.delete(k); continue; }
      const v = p.toFixed(3);
      if (svg.style.getPropertyValue("--pos") === v) continue;
      const was = wcLast.get(k); wcLast.set(k, v);
      if (!svg.style.getPropertyValue("--pos") && was != null && was !== v) {   // (drawn anew: from where it stood)
        svg.style.setProperty("--pos", was); void svg.getBoundingClientRect();
        requestAnimationFrame(() => svg.isConnected && svg.style.setProperty("--pos", v));
      } else svg.style.setProperty("--pos", v);
    }
  }
  const head = (title) => (title ? `<div class="gc-t">${esc(title)}</div>` : "");
  // a card's picture: a line icon, an animated drawing ("art:washer" — it moves only while the device is on) or one of
  // the owner's pictures ("up:<id>")
  // id: the device it shows — a window covering's drawing then stands where the shade is (covers(), above)
  const ic = (name, size, on, id) => {
    const s = String(name || "");
    if (s.startsWith("art:")) {
      const G = window.RoomLayouts && RoomLayouts.G, k = s.slice(4);
      if (G && G.artKeys.includes(k)) {
        let html = G.artPreview(k);
        if (!on) html = html.replace(/ [\w-]+-run [\w-]+-on /, " ");   // (still while off)
        const wc = WC[k] && Number.isInteger(id) && id > 0 ? ` data-wc="${id}" data-wct="${WC[k]}"` : "";
        return `<span class="gc-art"${wc} style="width:${Math.round(size * 1.6)}px;height:${Math.round(size * 1.85)}px">${html}</span>`;
      }
    }
    const m = /^up:([0-9a-f]{16})$/.exec(s);
    if (m) return `<img class="gc-up" src="/pictures/${m[1]}" alt="" draggable="false" style="width:${Math.round(size * 1.3)}px;height:${Math.round(size * 1.3)}px">`;
    return icon(window.ICON_NAMES && ICON_NAMES.includes(s) ? s : "power", size);
  };
  // a fan's own speeds (the house model's list of its supportedFanSpeeds — the value itself may come cut short — else that
  // value: a JSON list or words), slowest first, Off in front; null when it doesn't say (or says only one)
  const SPEEDS = ["low", "medium-low", "medium", "medium-high", "high"], SPEED_NAMES = { get "medium-low"() { return T("g.medLow"); }, get "medium-high"() { return T("g.medHigh"); } };   // (read when drawn: another language's words too)
  function fanSpeeds(id) {
    const cat = window.HUBITAT && Array.isArray(HUBITAT.devices) ? HUBITAT.devices.find((d) => d && d.id === id) : null;
    const v = cat && Array.isArray(cat.speeds) && cat.speeds.length ? cat.speeds : H.reading(id, "supportedFanSpeeds");
    let l = [];
    if (typeof v === "string" && v.trim()) { try { const x = JSON.parse(v); if (Array.isArray(x)) l = x; } catch { l = v.split(","); } }
    else if (Array.isArray(v)) l = v;
    l = l.map((s) => String(s).replace(/[[\]"'\s]/g, "").toLowerCase());
    const own = SPEEDS.filter((s) => l.includes(s));
    return own.length > 1 ? ["off", ...own] : null;
  }
  // ---------- a garage door that opens and closes on the icon ----------
  // From a garage door controller's own "door" (opening / open / closing / closed), or a relay / button and the door's
  // contact sensor (the card's "contact"): a press while it's closed shows the door opening for its travel time, a press
  // while it's open shows it closing until the contact closes; it then stays open or closed as the contact says. Opened
  // or closed some other way (its remote, the wall button) the contact still moves it. Nothing to go by → null.
  const gStates = new Map(), QUICK = 1800;   // card id → { phase, since, sent, pos, quick }; the catch-up closing (ms)
  function garage(c, d) {
    const o = c.o, TRAVEL = (Number.isInteger(o.travel) ? Math.max(3, Math.min(60, o.travel)) : 15) * 1000, now = Date.now();
    let g = gStates.get(c.i);
    if (!g) gStates.set(c.i, (g = { phase: null, since: 0, sent: H.sentAt(o.id), pos: undefined }));
    if (o.contact == null) {
      if (!d || d.cmd !== "openclose") return null;
      const s = d.door || (d.on ? "open" : "closed");
      if (s !== g.phase) { g.phase = s; g.since = now; }
    } else {
      const ct = H.attrs(o.contact).contact, pos = ct === "open" ? "open" : ct === "closed" ? "closed" : null;
      if (!pos) return null;
      const sent = H.sentAt(o.id);
      if (sent > g.sent) { g.sent = sent; g.phase = pos === "closed" ? "opening" : "closing"; g.since = now; g.quick = false; }   // pressed here
      if (g.pos !== undefined && pos !== g.pos) {   // the contact changed
        if (pos === "open" && g.phase !== "opening") { g.phase = "opening"; g.since = now; g.quick = false; }   // (opened some other way)
        // closed some other way (the car's remote): the contact only says so once it's down — a short catch-up closing
        else if (pos === "closed") { if (g.phase === "closing") g.phase = "closed"; else { g.phase = "closing"; g.since = now; g.quick = true; } }
      }
      g.pos = pos;
      const len = g.quick ? QUICK : TRAVEL;
      if (g.phase === "opening" && now - g.since >= TRAVEL) g.phase = pos;                  // (if it never opened: back to closed)
      if (g.phase === "closing" && now - g.since >= len + (g.quick ? 0 : 2000)) g.phase = pos;   // (didn't close: open again)
      if (g.phase !== "opening" && g.phase !== "closing") g.phase = pos;
    }
    const moving = g.phase === "opening" || g.phase === "closing", len = g.quick && g.phase === "closing" ? QUICK : TRAVEL;
    if (moving) {   // redraw when it should have arrived (a controller says so itself)
      clearTimeout(g.t); g.t = setTimeout(() => H.refresh(), Math.max(50, len - (now - g.since) + 60) + (g.phase === "closing" && !g.quick && o.contact != null ? 2000 : 0));
    }
    return { phase: g.phase, T: len, ago: moving ? now - g.since : 0 };
  }
  // the garage icon (24 × 24, like icons.js) with its door: up when open, down when closed, moving in between
  const garageIcon = (gs, size) => {
    const mv = gs.phase === "opening" || gs.phase === "closing", AGO = Math.min(gs.ago, gs.T);
    const anim = mv ? ` style="animation-duration:${(gs.T / 1000).toFixed(1)}s;animation-delay:-${(AGO / 1000).toFixed(2)}s"` : "";
    return `<svg class="ic gd-ic gd-${gs.phase}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
      + `<path d="M3 21V9l9-6 9 6v12"/><path d="M6 21v-9h12v9"/>`
      + `<g class="gd-car" stroke-width="1.4"><path d="M8 20.4v-1.6l1.2-2.2h5.6l1.2 2.2v1.6z"/><path d="M9.6 20.6v.4M14.4 20.6v.4"/></g>`
      + `<clipPath id="gd-c"><rect x="6" y="12" width="12" height="9"/></clipPath><g clip-path="url(#gd-c)"><g class="gd-door"${anim}>`
      + `<rect x="6.9" y="12.9" width="10.2" height="7.6" rx=".4" class="gd-fill" stroke="none"/><path d="M6 15h12M6 18h12"/></g></g>`
      + `<circle class="gd-lamp" cx="12" cy="7.6" r="1.1" fill="currentColor" stroke="none"/></svg>`;
  };
  const GD_TEXT = { get opening() { return T("g.opening"); }, get open() { return T("val.open"); }, get closing() { return T("g.closing"); }, get closed() { return T("val.closed"); } };
  // a garage of 1–3 doors, each as big as the single garage's door (the building gets wider, not the doors thinner);
  // each door is its own tap target (data-gdoor) and moves on its own
  const garageDoors = (list, size) => {
    const n = list.length, dw = 12, gap = 1.6, vw = 12 + n * dw + (n - 1) * gap, R = vw - 3;
    let body = `<path d="M3 21V9L${(vw / 2).toFixed(1)} 3L${R} 9v12"/><path d="M6 21v-9h${(vw - 12).toFixed(1)}v9"/>`;
    list.forEach((gs, k) => {
      const x = 6 + k * (dw + gap), mv = gs.phase === "opening" || gs.phase === "closing", AGO = Math.min(gs.ago, gs.T);
      const anim = mv ? ` style="animation-duration:${(gs.T / 1000).toFixed(1)}s;animation-delay:-${(AGO / 1000).toFixed(2)}s"` : "";
      if (k) body += `<path d="M${(x - gap / 2).toFixed(1)} 12v9"/>`;
      body += `<g class="gd-${gs.phase}" data-gdoor="${k}"><rect x="${x}" y="11" width="${dw}" height="10" fill="transparent" stroke="none"/>`
        + `<g class="gd-car" stroke-width="1.4"><path d="M${x + 2} 20.4v-1.6l1.2-2.2h5.6l1.2 2.2v1.6z"/></g>`
        + `<clipPath id="gdm-${k}"><rect x="${x}" y="12" width="${dw}" height="9"/></clipPath><g clip-path="url(#gdm-${k})"><g class="gd-door"${anim}>`
        + `<rect x="${x + 0.9}" y="12.9" width="${dw - 1.8}" height="7.6" rx=".4" class="gd-fill" stroke="none"/><path d="M${x} 15h${dw}M${x} 18h${dw}"/></g></g>`
        + `<circle class="gd-lamp" cx="${x + dw / 2}" cy="${n > 1 ? 10.3 : 7.6}" r="${n > 1 ? 0.8 : 1.1}" fill="currentColor" stroke="none"/></g>`;
    });
    return `<svg class="ic gd-ic" width="${Math.round(size * vw / 24)}" height="${size}" viewBox="0 0 ${vw} 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  };
  // a "Picture & values" card (stage 2): when its picture moves
  function spotRuns(o) {
    const v = o.aid ? H.attr(o.aid, o.aat) : null;
    switch (o.anim || "always") {
      case "never": return false;
      case "on": return !!devState(o.aid)[1];
      case "above": return parseFloat(v) > o.av;
      case "is": return v != null && String(v).toLowerCase() === String(o.av).toLowerCase();
      default: return true;
    }
  }
  // a room's temperature: its temperature sensor — else its thermostat's (a hallway with only the thermostat)
  const roomTemp = (name) => {
    const th = H.state.thermostat, t = H.things({ room: name, kind: "climate" }).map((x) => parseFloat((x.attrs || {}).temperature)).find(Number.isFinite);
    return t ?? (th && th.id != null && th.room === name ? parseFloat(H.thermo(null).temp) : undefined);
  };
  // (a no-break space before the unit: "76 %" never wraps into "76" / "%")
  const UNITS = { power: "\u00a0W", energy: "\u00a0kWh", temperature: "°", humidity: "\u00a0%", battery: "\u00a0%", level: "\u00a0%", illuminance: "\u00a0lx", co2: "\u00a0ppm",
    pm25: "\u00a0µg/m³", heatingSetpoint: "°", coolingSetpoint: "°", thermostatSetpoint: "°", volume: "\u00a0%", position: "\u00a0%", voltage: "\u00a0V", amperage: "\u00a0A" };
  const plainName = (at) => String(at || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (x) => x.toUpperCase());
  // one row: a value, a door (open / closed), a switch / light (tap: on / off, hold: its wheel), a lock (slide to unlock)
  function spotRow(r, n) {
    // (a lock keeps its full Hubitat name: "Garage Door Lock", not "Garage Door" like the door next to it)
    const lab = esc(r.label || (r.as === "value" || !r.as ? plainName(r.at) : (r.as === "lock" && H.fullName(r.id)) || H.devName(r.id) || T("g.device")));
    if (r.as === "switch") {
      const [st, on] = devState(r.id);
      return `<div class="sp-r sp-sw${on ? " on" : ""}" data-gitem="${n}"><span>${lab}</span><b>${esc(st)}</b><i class="sp-tg"></i></div>`;
    }
    if (r.as === "lock") {
      const lk = H.state.locks.find((l) => l.id === r.id), locked = lk && lk.lock === "locked";
      if (!lk) return `<div class="sp-r"><span>${lab}</span><b>—</b></div>`;
      return `<div class="sp-r sp-lk${locked ? "" : " open"}" data-gitem="${n}"><span>${lab}</span>`
        + (!locked ? `<b>${esc(T("g.unlockedTap"))}</b>` : H.canUnlock(r.id) ? `<div class="lk-track sp-trk"><i class="lk-thumb">${ic("chevron", 16)}</i><span>${esc(T("g.lockedSlide"))}</span></div>` : `<b>${esc(T("state.locked"))}</b>`) + `</div>`;
    }
    if (r.as === "door") {
      // (no contact event yet: what the house model says about that door / window)
      const dw = H.state.doors.find((x) => x.id === r.id) || H.state.windows.find((x) => x.id === r.id);
      const c = H.attr(r.id, "contact") ?? (dw ? (dw.open ? "open" : "closed") : undefined);
      return `<div class="sp-r${c === "open" ? " warn" : ""}"><span>${lab}</span><b>${c === "open" ? T("val.open") : c === "closed" ? T("val.closed") : "—"}</b></div>`;
    }
    return `<div class="sp-r"><span>${lab}</span><b>${valText(r)}</b></div>`;
  }
  // a reading as shown: rounded, with its unit (its own, else the usual one for that reading)
  // (no live event yet: the house model's value, as the other cards show it; temperature, humidity, battery, level:
  // whole numbers like the thermostat and the temperature pills)
  const WHOLE = new Set(["temperature", "humidity", "battery", "level"]);
  function valText(r) {
    const v = H.attr(r.id, r.at) ?? H.reading(r.id, r.at), num = v != null && v !== "" && !isNaN(+v);
    const dec = WHOLE.has(r.at) ? 0 : Math.abs(+v) < 10 && +v % 1 ? 1 : 0;
    return v == null || v === "" ? "—" : esc(num ? fmt(Math.round(+v * 10 ** dec) / 10 ** dec, dec) : words(v)) + (num ? (r.unit ? `\u00a0${esc(r.unit)}` : UNITS[r.at] || "") : "");
  }
  // a door / contact: open or closed (no contact event yet: what the house model says about that door / window)
  const doorOpen = (id) => {
    const dw = H.state.doors.find((x) => x.id === id) || H.state.windows.find((x) => x.id === id);
    return H.attr(id, "contact") ?? (dw ? (dw.open ? "open" : "closed") : undefined);
  };
  // a garage's words under its doors: "Open", or "Open · Closed"; with the doors' own names (builder → a door's Name)
  // "Left: Open · Right: Closed"
  const doorWords = (doors, st) => st.map((x, k) => {
    const n = doors[k] && typeof doors[k].label === "string" ? doors[k].label.trim().slice(0, 40) : "";
    const w = x.none ? T("g.pickOpener") : GD_TEXT[x.phase];   // (no opener yet: not "Closed" — nothing is known)
    return n ? `${n}: ${w}` : w;
  }).join(" · ");
  // ---------- a blank card (the owner's own): its pieces, each where the owner put it on the card's 24 × 24 grid ----------
  const INNER = 24, TXT = { s: 13, m: 17, l: 24, xl: 34 };
  const at = (v) => `${((100 * v) / INNER).toFixed(3)}%`;
  function piece(c, p, n) {
    const lab = (dflt) => esc(p.label || dflt);
    switch (p.t) {
      case "icon": {   // a picture or drawing; on a device it lights up / moves while that's on (on its own it moves)
        const [, on, i] = p.id ? devState(p.id) : [null, true, "image"];
        return [`<div class="bk-pic">${ic(p.icon || i, 48, on, p.id)}</div>${p.label ? `<small>${lab("")}</small>` : ""}`, !!p.id && on];
      }
      case "light": {   // a light as a tile: its picture, name and state (tap: on / off, hold: its wheel)
        const [st, on, i] = devState(p.id);
        return [`<div class="bk-lt">${ic(p.icon || i, 40, on, p.id)}<div><b>${lab(H.devName(p.id) || T("g.light"))}</b><small>${esc(st)}</small></div></div>`, on];
      }
      case "switch": return [spotRow({ id: p.id, as: "switch", label: p.label }, n), devState(p.id)[1]];
      case "lock": return [spotRow({ id: p.id, as: "lock", label: p.label }, n), false];
      // (its name: the device's — "Outdoor Temperature" — with the reading added when it isn't the temperature)
      case "value": { const dn = H.devName(p.id), nm = dn ? (p.at === "temperature" ? dn : `${dn} · ${plainName(p.at)}`) : plainName(p.at);
        return [`<div class="bk-v"><span>${lab(nm)}</span><b class="num">${valText(p)}</b></div>`, false]; }
      case "door": {
        const ct = doorOpen(p.id);
        return [`<div class="bk-v bk-dr${ct === "open" ? " warn" : ""}">${ic(ct === "open" ? "doorOpen" : "door", 26)}<span>${lab(H.devName(p.id) || T("g.door"))}</span><b>${ct === "open" ? T("val.open") : ct === "closed" ? T("val.closed") : "—"}</b></div>`, false];
      }
      case "garage": {   // 1–3 doors, each tapped on its own (opening and closing ask the PIN)
        const st = (Array.isArray(p.doors) ? p.doors : []).slice(0, 3).map((dr, k) => {
          const d = H.device(dr.id), gs = garage({ i: `${c.i}#p${n}#${k}`, o: { id: dr.id, contact: dr.contact, travel: dr.travel } }, d);
          return gs || { phase: d && d.on ? "open" : "closed", T: 15000, ago: 0, none: !dr.id };
        });
        const sub = doorWords((Array.isArray(p.doors) ? p.doors : []).slice(0, 3), st);
        return [`<div class="bk-gar">${st.length ? garageDoors(st, 64) : ic("garage", 48)}${p.label || sub ? `<small>${p.label ? `${lab("")} · ` : ""}${esc(sub || "")}</small>` : ""}</div>`, st.some((x) => x.phase !== "closed")];
      }
      case "text": {
        const sz = TXT[p.size] || TXT.m, al = ["center", "right"].includes(p.align) ? p.align : "left";
        return [`<div class="bk-tx" style="font-size:${sz}px;text-align:${al}${p.bold ? ";font-weight:700" : ""}"><div>${fill(p.text || "")}</div></div>`, false];
      }
    }
    return ["", false];
  }

  const spotPop = new Set();   // the cards whose values are open on a tap
  const DRAW = {
    // styles: row (icon, name, state), square (the icon in a disc on top, name and state under it), icon (big icon only)
    device(c) {
      const o = c.o, [st0, on0, i] = devState(o.id), name = esc(o.title || H.devName(o.id) || T("g.device"));
      let on = on0;
      // a plug-in appliance on a smart plug: running only above runW watts (and what it draws)
      let st = st0, run = on;
      if (o.runW) {
        const w = parseFloat(H.attrs(o.id).power), has = Number.isFinite(w);
        run = has && w > o.runW;
        st = run ? T("g.runningW", { w: Math.round(w) }) : on || has ? (has ? T("g.idleW", { w: Math.round(w) }) : T("thing.idle")) : st0;
      }
      // a garage opener: the door opening / open / closing / closed (unless the owner picked a drawing or picture)
      const dv = H.device(o.id), gs = dv && dv.kind === "garage" && !/^(art|up):/.test(o.icon || "") ? garage(c, dv) : null;
      if (gs) { st = GD_TEXT[gs.phase] || st; run = on = gs.phase !== "closed"; }
      // the icon, moving while it runs (motions.js); not the animated drawings or own pictures (they have their own)
      const pic = o.icon || i, mot = !gs && o.motion && window.Motion && !/^(art|up):/.test(pic) ? Motion.pick(o.motion, pic, (dv || {}).kind) : "";
      const icx = (size) => (gs ? garageIcon(gs, size) : mot ? Motion.wrap(ic(pic, Math.round(size * 0.8), run), mot, run, Math.round(size * 0.8)) : ic(pic, size, run, o.id));
      if (o.style === "square") {
        // (on a card much wider than high the disc sits left of the words — stacked, it stuck out at the top)
        const g = Grid.cur || {}, flat = ((c.w || 3) / (g.cols || 12)) * 16 > ((c.h || 1) / (g.rows || 8)) * 10 * 1.8;
        if (flat) return { cls: on ? "on" : "", html: `<div class="gc-dev gc-sqrow"><span class="gc-disc">${icx(30)}</span><div><div class="gc-n">${name}</div><div class="gc-s">${esc(st)}</div></div></div>` };
        return { cls: on ? "on" : "", html: `<div class="gc-sq"><span class="gc-disc">${icx(30)}</span><div class="gc-n">${name}</div><div class="gc-s">${esc(st)}</div></div>` };
      }
      // slider: the tile fills to the light's level; drag across it to dim (a tap still switches, a hold still opens the wheel)
      if (o.style === "bar") {   // a tall brightness bar: drag up / down to dim, a tap switches
        const d = H.device(o.id), lv = d && d.on ? Math.max(0, Math.min(100, d.level ?? 100)) : 0;
        return { cls: on ? "on" : "", html: `<div class="gc-sl gc-vb"><i class="gc-slf" style="transform:scaleY(${(lv / 100).toFixed(3)})"></i><div class="gc-vbt">${icx(30)}<b class="gc-s">${on ? `${lv}%` : T("val.off")}</b><span class="gc-n">${name}</span></div></div>` };
      }
      if (o.style === "slider") {
        const d = H.device(o.id), lv = d && d.on ? Math.max(0, Math.min(100, d.level ?? 100)) : 0;
        return { cls: on ? "on" : "", html: `<div class="gc-sl"><i class="gc-slf" style="transform:scaleX(${(lv / 100).toFixed(3)})"></i><div class="gc-dev">${icx(34)}<div><div class="gc-n">${name}</div><div class="gc-s">${esc(st)}</div></div></div></div>` };
      }
      if (o.style === "icon") return { cls: on ? "on" : "", html: `<div class="gc-btn gc-ico">${icx(54)}<small>${name}</small></div>` };
      return { cls: on ? "on" : "", html: `<div class="gc-dev">${icx(34)}<div><div class="gc-n">${name}</div><div class="gc-s">${esc(st)}</div></div></div>` };
    },
    // styles: big (the number), gauge (an arc from min to max), chip (one small line)
    value(c) {
      const o = c.o, v = H.attr(o.id, o.at) ?? H.reading(o.id, o.at), num = v != null && v !== "" && !isNaN(+v);
      if (!o.id || !o.at) return { html: `${head(o.title)}<div class="gc-empty">${esc(T(!o.id ? "g.pickReading" : "g.pickReadingOnly"))}</div>` };
      // (a word in plain words — "Idle", not "idle"; a number with its unit: the one typed, else the usual one)
      const txt = esc(num || v == null || v === "" ? fmt(v, o.dec) : words(v)), u = o.unit || (num ? (UNITS[o.at] || "").trim() : "");
      const unit = u ? `<small>${esc(u)}</small>` : "";
      if (o.style === "chip") return { html: `<div class="gc-chipv">${ic(o.icon || "thermo", 22)}<span>${esc(o.title || H.devName(o.id))}</span><b class="num">${txt}</b>${unit}</div>` };
      if (o.style === "gauge") {
        const lo = Number.isFinite(o.min) ? o.min : 0, hi = Number.isFinite(o.max) && o.max > lo ? o.max : lo + 100, n = parseFloat(v);
        const f = Number.isFinite(n) ? Math.max(0, Math.min(1, (n - lo) / (hi - lo))) : 0, L = 157.08;   // (half a circle of r = 50)
        return { html: `${head(o.title || H.devName(o.id))}<div class="gc-gauge"><svg viewBox="0 0 120 70"><path d="M10 62 A50 50 0 0 1 110 62" class="gg-bg"/>`
          + `<path d="M10 62 A50 50 0 0 1 110 62" class="gg-fg" style="stroke-dasharray:${(f * L).toFixed(1)} ${L}"/></svg><div class="gg-v"><b class="num">${txt}</b>${unit}</div></div>` };
      }
      return { html: `${head(o.title || H.devName(o.id))}<div class="gc-val">${o.icon ? ic(o.icon, 30) : ""}<b class="num">${txt}</b>${unit}</div>` };
    },
    // the thermostat in other looks than the dial (the dial: app.js thermostat()) — the house's, or the one picked
    // for this card (o.id); its mode / fan buttons: the ones the owner ticked (app.js App.tModes)
    thermostat(c) {
      // one of the 12 looks picked in the builder (o.look: thermo-looks.js) — none: the Style below, as before
      if (window.ThermoLooks && ThermoLooks.has(c.o.look)) { const h = ThermoLooks.html(c); if (h) return { html: h }; }
      const o = c.o, own = Number.isInteger(o.id) && o.id > 0, t = H.thermo(own ? o.id : null), tid = own ? o.id : "null";
      if (!o.style || o.style === "dial" || t.id == null) return null;   // (the dial: Home's own piece)
      const tgt = t.mode === "cool" ? "cool" : t.mode === "heat" ? "heat" : null, set = tgt ? t[tgt] : null;
      const step = (d) => (tgt ? `<button class="gt-b"${Acts.on("gr.setpoint", tgt, d, tid)} aria-label="${d > 0 ? "Warmer" : "Cooler"}">${d > 0 ? "+" : "−"}</button>` : "");
      const modes = App.tModes(t, o, "gt-m");
      const now = t.temp != null ? Math.round(t.temp) : "—";
      if (o.style === "arc") {   // a 270° ring from 50 to 90 °F: the set point lit, a tick at the room's temperature
        const pos = (v) => Math.max(0, Math.min(1, (v - 50) / 40)), L = 2 * Math.PI * 70 * 0.75;
        const f = tgt ? pos(set) : 0, tk = t.temp != null ? pos(t.temp) : null, ang = (k) => (135 + k * 270) * Math.PI / 180;
        const tick = tk == null ? "" : `<circle cx="${(100 + 70 * Math.cos(ang(tk))).toFixed(1)}" cy="${(100 + 70 * Math.sin(ang(tk))).toFixed(1)}" r="6" class="ga-now"/>`;
        return { html: `<div class="gt gt-arc"><div class="ga"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="70" class="ga-bg" style="stroke-dasharray:${L.toFixed(1)} 999"/>`
          + `<circle cx="100" cy="100" r="70" class="ga-fg ${tgt || ""}" style="stroke-dasharray:${(f * L).toFixed(1)} 999"/>${tick}</svg>`
          + `<div class="ga-mid"><b class="num">${tgt ? set : now}°</b><small>${esc(tgt ? T(tgt === "heat" ? "g.heatToNow" : "g.coolToNow", { t: now }) : App.tWord(t))}</small></div></div>`
          + `<div class="gt-row ga-row">${step(-1)}<span>${esc(o.title || t.name || T("thermo.title"))}</span>${step(1)}</div>${modes}</div>` };
      }
      if (o.style === "compact") return { html: `<div class="gt gt-compact">${ic("thermo", 28)}<div class="gt-now"><b class="num">${now}°</b><small>${esc(o.title || t.name || T("thermo.title"))}</small></div>`
        + `${tgt ? `${step(-1)}<div class="gt-set ${tgt}"><b class="num">${set}°</b><small>${esc(T(tgt === "heat" ? "g.heatTo" : "g.coolTo"))}</small></div>${step(1)}` : `<div class="gt-set"><small>${esc(App.tWord(t))}</small></div>`}</div>` };
      return { html: `<div class="gt gt-big">${head(o.title || t.name || T("thermo.title"))}<div class="gt-row">${step(-1)}<div class="gt-set ${tgt || ""}"><b class="num">${tgt ? set : now}°</b>`
        + `<small>${esc(tgt ? T(tgt === "heat" ? "g.heatingToNow" : "g.coolingToNow", { t: now }) : T("g.nowMode", { mode: App.tWord(t) }))}</small></div>${step(1)}</div>${modes}</div>` };
    },
    // who's home in other looks than Home's pills: big avatars, or one count
    people(c) {
      const o = c.o; if (!o.style || o.style === "pills") return null;
      const ppl = H.people().filter((p) => !Array.isArray(o.ids) || !o.ids.length || o.ids.includes(p.id)), home = ppl.filter((p) => p.home).length;
      if (o.style === "count") return { html: `<div class="gc-chipv">${ic("user", 24)}<b class="num">${home}</b><span>${esc(T("g.ofHome", { n: ppl.length }))}</span></div>` };
      return { html: `<div class="gc-ppl">${ppl.map((p) => `<div class="gc-pp ${p.home ? "home" : "away"}">${UI.face(p, 64)}<span>${esc(p.name)}</span><small>${p.home ? T("g.home") : T("g.away")}</small></div>`).join("")}</div>` };
    },
    text(c) {
      const o = c.o;
      if (!o.text && !o.title && H.design) return { html: `<div class="gc-empty">${esc(T("g.typeText"))}</div>` };   // (the builder's canvas only)
      return { html: `<div class="gc-text" style="text-align:${["center", "right"].includes(o.align) ? o.align : "left"}">${o.icon ? ic(o.icon, 28) : ""}${o.title ? `<b>${esc(o.title)}</b>` : ""}<div>${fill(o.text || "")}</div></div>` };
    },
    button(c) {
      const o = c.o, on = o.id ? devState(o.id)[1] : false;
      return { cls: on ? "on" : "", html: `<div class="gc-btn">${ic(o.icon || "power", 38, on)}<span>${esc(o.title || T("g.button"))}</span></div>` };
    },
    // a room: its picture, name, lights on; its temperature and anything open / unlocked as chips (style "summary")
    room(c) {
      const r = H.room(c.o.room), n = r ? H.lightsOn(r) : 0;
      if (!r) return { html: `<div class="gc-btn">${ic(c.o.icon || "home", 38)}<span>${esc(c.o.title || T("g.room"))}</span><small>${esc(T("g.notHere"))}</small></div>` };
      const p = H.placed(r.name), open = [...p.doors, ...p.windows].filter((x) => x.open).length, unl = p.locks.filter((l) => l.lock !== "locked").length;
      const temp = roomTemp(r.name);
      const chips = [Number.isFinite(temp) ? `<i>${ic("thermo", 14)}${Math.round(temp)}°</i>` : "", open ? `<i class="w">${ic("doorOpen", 14)}${open}</i>` : "",
        unl ? `<i class="w">${ic("unlock", 14)}${unl}</i>` : ""].join("");
      return { cls: n ? "on" : "", html: `<div class="gc-btn">${ic(c.o.icon || r.icon || "home", 38, n > 0)}<span>${esc(c.o.title || r.name)}</span><small>${esc(n ? T("g.lightsOn", { n }) : T("g.allOff"))}</small>${chips ? `<div class="gc-rchips">${chips}</div>` : ""}</div>` };
    },
    // a music player (Sonos…): what's playing, play / pause, next / previous, volume. Styles: row, big, volume.
    // The track comes from Hubitat (trackData JSON or trackDescription); album art only from an http(s) address.
    player(c) {
      const o = c.o, a = H.attrs(o.id), id = int(o.id, 1, 999999999, 0);
      let t = {};
      try { const j = JSON.parse(a.trackData || "{}"); if (j && typeof j === "object") t = j; } catch {}
      const title = String(t.title || t.name || a.trackDescription || "").slice(0, 120), artist = String(t.artist || "").slice(0, 80);
      const art = o.art !== false && typeof t.albumArtUrl === "string" && /^https?:\/\/[^\s"'<>]{1,500}$/.test(t.albumArtUrl) ? t.albumArtUrl : "";
      const playing = String(a.status || "").toLowerCase() === "playing", vol = int(Math.round(parseFloat(a.volume ?? a.level)), 0, 100, 0);
      const name = esc(o.title || H.devName(id) || T("g.speaker"));
      const b = (cmd, icon_, v, label) => `<button${Acts.on("gr.send", id, cmd, v ?? null)} aria-label="${label}">${ic(icon_, 26)}</button>`;
      const vols = `<div class="pl-vol">${b("setVolume", "volumeDown", Math.max(0, vol - 5), T("g.quieter"))}<i><i style="transform:scaleX(${(vol / 100).toFixed(2)})"></i></i><span class="num">${vol}</span>${b("setVolume", "volume", Math.min(100, vol + 5), T("g.louder"))}</div>`;
      if (o.style === "volume") return { cls: playing ? "on" : "", html: `<div class="pl pl-v">${ic(o.icon || "speaker", 28, playing)}<b>${name}</b>${vols}</div>` };
      const ctl = `<div class="pl-ctl">${b("previousTrack", "skipPrev", null, T("g.previous"))}${playing ? b("pause", "pause", null, T("g.pause")) : b("play", "play", null, T("g.play"))}${b("nextTrack", "skipNext", null, T("g.next"))}</div>`;
      const now = `<div class="pl-now"><b>${esc(title || (playing ? T("thing.playing") : T("g.nothingPlaying")))}</b><small>${esc(artist || name)}</small></div>`;
      const pic = art ? `<img class="pl-art" src="${esc(art)}" alt="" draggable="false" referrerpolicy="no-referrer"${Acts.attr("error", "gr.dropImg")}>` : `<span class="pl-art pl-noart">${ic("music", 32)}</span>`;
      if (o.style === "big") return { cls: playing ? "on" : "", html: `<div class="pl pl-big">${pic}${now}${ctl}${vols}</div>` };
      return { cls: playing ? "on" : "", html: `<div class="pl pl-row">${pic}${now}${ctl}</div>` };
    },
    // a fan or an air purifier: its speeds as buttons; the icon turns while it runs (transform only)
    fan(c) {
      const o = c.o, d = H.device(o.id), th = H.thing ? H.thing(o.id) : null;
      if (th && th.kind === "purifier") {
        const a = th.attrs || {}, off = String(a.fanMode || a.fanState || "").toUpperCase() === "OFF", auto = String(a.fanMode || "").toUpperCase() === "AUTO";
        const sp = parseInt(a.fanSpeed, 10) || 0;
        const btn = (lbl, act, v, cur) => `<button class="${cur ? "cur" : ""}" ${Acts.on("gr.purifier", +o.id, act, v ?? null)}>${lbl}</button>`;
        return { cls: off ? "" : "on", html: `<div class="fn"><div class="fn-h"><span class="fn-ic">${ic(o.icon || "airPurifier", 34, !off)}</span><b>${esc(o.title || th.name)}</b><small>${off ? T("val.off") : auto ? T("val.auto") : T("g.speed", { n: sp })}</small></div>`
          + `<div class="fn-sp">${btn(T("val.off"), "off", null, off)}${btn(T("val.auto"), "auto", null, !off && auto)}${[2, 4, 6, 8, 10].map((n) => btn(n, "speed", n, !off && !auto && sp === n)).join("")}</div></div>` };
      }
      if (!d) return { html: `<div class="gc-empty">${esc(T("g.pickFan"))}</div>` };
      // (the fan's own speeds when it reports them — medium-low, medium-high too — else Off / Low / Medium / High)
      const own = fanSpeeds(d.id), speeds = own || ["off", "low", "medium", "high"], raw = String(H.attr(d.id, "speed") ?? "").toLowerCase();
      // (the panel files medium-low as low and medium-high as high — data.js: its own speed lights while it still is that one)
      const near = (s) => (s === "medium-low" ? "low" : s === "medium-high" ? "high" : s);
      const cur = d.on ? (own && own.includes(raw) && near(raw) === d.speed ? raw : d.speed || "medium") : "off", name = (s) => SPEED_NAMES[s] || words(s);
      return { cls: d.on ? "on" : "", html: `<div class="fn"><div class="fn-h"><span class="fn-ic">${ic(o.icon || "fan", 34, d.on)}</span><b>${esc(o.title || d.full || d.name)}</b><small>${d.on ? esc(name(cur)) : T("val.off")}</small></div>`
        + `<div class="fn-sp${speeds.length > 4 ? " many" : ""}">${speeds.map((s) => `<button class="${cur === s ? "cur" : ""}" ${Acts.on("gr.setFan", d.id, s)}>${name(s)}</button>`).join("")}</div></div>` };
    },
    // where the power goes: Solar, Grid and Battery around Home, dots moving the way the power flows
    energy(c) {
      const o = c.o, w = (id, flip) => { const v = parseFloat(H.attr(id, "power")); return Number.isFinite(v) ? (flip ? -v : v) : null; };
      const solar = o.solar ? Math.max(0, w(o.solar) || 0) : null, grid = o.grid ? w(o.grid, o.gridFlip) : null, bat = o.battery ? w(o.battery, o.batFlip) : null;
      // grid > 0 = from the grid (import); battery > 0 = the battery gives power (discharging)
      if (!o.solar && !o.grid && !o.battery && !o.home) return { html: `${o.title ? `<div class="gc-t">${esc(o.title)}</div>` : ""}<div class="gc-empty">${esc(T("g.pickMeters"))}</div>` };
      const home = o.home ? w(o.home) : (solar || 0) + (grid || 0) + (bat || 0);
      const fmtW = (x) => (x == null ? "—" : Math.abs(x) >= 1000 ? `${(Math.abs(x) / 1000).toFixed(1)} kW` : `${Math.round(Math.abs(x))} W`);
      // a spoke from a node to Home: dots go towards Home when `toHome`, away when not; none when it's ~0
      const spoke = (cls, v, toHome) => (v == null ? "" : `<div class="ef-sp ${cls}${Math.abs(v) < 10 ? "" : toHome ? " in" : " out"}"><i></i><i></i><i></i></div>`);
      const node = (cls, icon_, label, v, sub) => (v == null ? "" : `<div class="ef-n ${cls}">${ic(icon_, 26)}<b class="num">${fmtW(v)}</b><small>${esc(sub || label)}</small></div>`);
      return { html: `${head(o.title || T("g.energy"))}<div class="ef">${spoke("s", solar, true)}${spoke("g", grid, grid > 0)}${spoke("b", bat, bat > 0)}`
        + `${node("s", "solar", T("g.solar"), solar)}${node("g", "bolt", T("g.grid"), grid, grid == null ? "" : grid >= 0 ? T("g.fromGrid") : T("g.toGrid"))}`
        + `${node("b", "batteryCharging", T("g.battery"), bat, bat == null ? "" : bat >= 0 ? T("g.giving") : T("g.charging"))}${node("h", "home", T("g.home"), home)}</div>` };
    },
    // the panel's own health: Hubitat, the bridge, the weather service, this page's version
    status(c) {
      const hub = H.hub.live, bridge = H.hub.bridge !== "offline", wx = window.Weather && !!Weather.current() && !Weather.error;
      const row = (ok, name, text) => `<div class="st-row"><i class="${ok ? "ok" : "bad"}"></i><b>${name}</b><small>${esc(text)}</small></div>`;
      const ver = (window.PANEL_CONFIG && PANEL_CONFIG.version) || "dev";
      return { html: `${head(c.o.title || T("g.system"))}<div class="gc-st">${row(hub, "Hubitat", hub ? "live" : "not connected")}${row(bridge && hub, T("g.bridge"), hub ? "running" : "waiting")}`
        + `${row(wx, T("wx.title"), wx ? "up to date" : (window.Weather && Weather.error) || "loading")}${row(true, T("g.panel"), ver)}</div>` };
    },
    // a slideshow of your pictures (they cross-fade every few seconds; a ticker below — no redraw)
    photos(c) {
      const o = c.o, pics = (Array.isArray(o.pics) ? o.pics : []).map((p) => /^up:([0-9a-f]{16})$/.exec(p)).filter(Boolean).slice(0, 12);
      if (!pics.length) return { html: `<div class="gc-empty">${esc(T("g.pickPictures"))}</div>` };
      return { html: `<div class="gc-ph" data-every="${int(o.every, 3, 600, 10)}" style="--fit:${o.fit === "contain" ? "contain" : "cover"}">${pics.map((m, i) =>
        `<img src="/pictures/${m[1]}" alt="" draggable="false" class="${i ? "" : "on"}" loading="lazy">`).join("")}</div>` };
    },
    // batteries running low (every device that reports one), lowest first
    batteries(c) {
      const below = int(c.o.below, 1, 100, 25), list = [];
      for (const [id, a] of H.hub.attrs) { const b = parseFloat(a.battery); if (Number.isFinite(b) && b <= below) list.push([id, b]); }
      list.sort((x, y) => x[1] - y[1]);
      if (!list.length) return { html: `<div class="gc-safe ok">${ic("batteryFull", 32)}<div><b>${esc(c.o.title || T("g.batteries"))}</b><small>${esc(T("g.allAbove", { n: below }))}</small></div></div>` };
      return { html: `${head(c.o.title || T("g.batteriesBelow", { n: below }))}<div class="gc-devs list">${list.slice(0, 20).map(([id, b]) =>
        `<div class="gc-gi"><span class="gc-bat ${b <= 10 ? "bad" : "warn"}">${ic(b <= 10 ? "batteryLow" : "batteryHalf", 24)}</span><span class="gc-n">${esc(H.devName(id) || T("g.deviceN", { id }))}</span><span class="gc-s num">${Math.round(b)} %</span></div>`).join("")}</div>` };
    },
    // what uses power now: devices reporting watts, biggest first, as bars; the total
    power(c) {
      const o = c.o, ids = Array.isArray(o.ids) && o.ids.length ? new Set(o.ids) : null, list = [];
      for (const [id, a] of H.hub.attrs) { const w = parseFloat(a.power); if (Number.isFinite(w) && (!ids || ids.has(id)) && (ids || w > 0.5)) list.push([id, w]); }
      list.sort((x, y) => y[1] - x[1]);
      const top = list.slice(0, int(o.top, 3, 20, 8)), max = Math.max(1, ...top.map((x) => x[1])), total = list.reduce((n, x) => n + x[1], 0);
      const fmtW = (w) => (w >= 1000 ? `${(w / 1000).toFixed(1)} kW` : `${Math.round(w)} W`);
      return { html: `${head(o.title || T("g.powerNow"))}<div class="gc-pw"><div class="gc-pwt num">${fmtW(total)}<small>${list.length} device${list.length === 1 ? "" : "s"}</small></div>${top.map(([id, w]) =>
        `<div class="gc-pwr"><span>${esc(H.devName(id) || T("g.deviceN", { id }))}</span><b class="num">${fmtW(w)}</b><i><i style="transform:scaleX(${(w / max).toFixed(3)})"></i></i></div>`).join("") || `<div class="gc-empty">${esc(T("g.noPower"))}</div>`}</div>` };
    },
    // a camera or a camera view: live video (default), a still refreshed every few seconds, or just a button
    camera(c) {
      const o = c.o, cam = window.Cameras && Cameras.cam ? Cameras.cam(o.cam) : null;
      if (o.view !== "icon" && window.Cameras && Cameras.cardHtml) {
        const html = Cameras.cardHtml(o.cam, o.view === "still");
        if (html) return { html: `<div class="gc-cam">${html}</div>` };
      }
      return { html: `<div class="gc-btn">${ic(o.icon || "film", 38)}<span>${esc(o.title || (cam && cam.name) || T("g.camera"))}</span></div>` };
    },
    // several devices on one card: each with its state, its own icon / name; a tap on one switches that one
    group(c) { return rows(c, itemsOf(c), T("g.noDevices")); },
    // shared lists and notes (lists.js)
    todo(c) { return { html: window.Lists ? Lists.card(c.o) : "" }; },
    notes(c) { return { html: window.Lists ? Lists.notes(c.o) : "" }; },
    // kitchen timers (timers.js): the running ones, then preset buttons
    timer(c) { return { html: window.Timers ? Timers.card(c.o) : "" }; },
    // a row of scene / routine buttons: each does its own action (a scene switch on, a Hubitat button pushed…)
    scenes(c) {
      const o = c.o, items = Array.isArray(o.items) ? o.items : [];
      if (!items.length) return { html: `${head(o.title)}<div class="gc-empty">${esc(T("g.noButtons"))}</div>` };
      return { html: `${head(o.title)}<div class="gc-scenes ${o.look === "list" ? "list" : "row"}">${items.map((it, n) =>
        `<div class="gc-sc" data-gitem="${n}">${ic(it.icon || "sparkles", 28)}<span>${esc(it.label || T("g.scene"))}</span></div>`).join("")}</div>` };
    },
    // Hubitat Safety Monitor (alarm.js): its state and what can be done now — each asks the panel PIN.
    // Styles: full (state + buttons), buttons (just the buttons), badge (the state; a tap opens the keypad)
    alarm(c) {
      if (!window.Alarm) return { html: "" };
      const info = Alarm.info(), st = H.state.alarm.status, armed = Alarm.isArmed();
      const cls = armed ? "armed" : Alarm.live ? "ok" : "";
      const btns = `<div class="al-btns">${Alarm.choices().map((a) => { const [label, i2, k] = Alarm.ACTIONS[a]; return `<button class="${k}"${Acts.on("alarm.request", a)}>${ic(i2, 24)}<span>${esc(label)}</span></button>`; }).join("")}</div>`;
      const state = `<div class="al-st" style="color:${info.color}">${ic(info.icon, 30)}<b>${esc(info.text)}</b></div>`;
      if (c.o.style === "badge") return { cls: `act ${cls}`, html: `<div class="al al-badge"${Acts.on("alarm.open")}>${state}</div>` };
      if (c.o.style === "buttons") return { cls, html: `<div class="al">${Alarm.live ? btns : state}</div>` };
      return { cls, html: `<div class="al">${state}${Alarm.live ? btns : `<small class="al-hint">${esc(T("g.waitHsm"))}</small>`}</div>` };
    },
    // one lock: locked → slide to unlock (only when this lock and this panel allow it; then "Are you sure?" + the PIN);
    // unlocked → a tap locks it
    lock(c) {
      const o = c.o, l = H.state.locks.find((x) => x.id === o.id);
      if (!l) return { html: `<div class="gc-empty">${esc(T("g.pickLock"))}</div>` };
      const name = esc(o.title || l.name), st = l.lock === "locked" ? "locked" : l.lock === "unlocked" ? "unlocked" : "unknown";
      if (st !== "locked") return { cls: "act lk-open", html: `<div class="lk">${ic("unlock", 44)}<div><b>${name}</b><small>${esc(T(st === "unknown" ? "g.unknownTap" : "g.unlockedTapLong"))}</small></div></div>` };
      const can = H.canUnlock(o.id);
      return { cls: "lk-shut", html: `<div class="lk">${ic("lock", 44)}<div><b>${name}</b><small>${esc(T("state.locked"))}</small></div></div>`
        + (can ? `<div class="lk-track"><i class="lk-thumb">${ic("chevron", 26)}</i><span>${esc(T("g.slideUnlock"))}</span></div>` : "") };
    },
    // a garage door: the drawing (open / closed), a tap opens or closes it (opening asks the PIN — data.js)
    garage(c) {
      const o = c.o, d = H.device(o.id), a = H.attrs(o.id), gs = d && d.kind === "garage" ? garage(c, d) : null;
      if (!o.id) return { html: `<div class="gc-empty">${esc(T("g.pickGarage"))}</div>` };   // (not "Closed": nothing is known yet)
      let open = d ? !!d.on : ["open", "opening"].includes(a.door) || a.contact === "open";
      let txt = a.door === "opening" || a.door === "closing" ? GD_TEXT[a.door] : open ? T("val.open") : T("val.closed");
      if (gs) { open = gs.phase !== "closed"; txt = GD_TEXT[gs.phase]; }
      // a card about as high as it's wide (or narrower): the picture on top, the words under it — no empty half (by the
      // page's own shape: a portrait tablet's card is taller than the same cells on a landscape one)
      const g = Grid.cur || {}, wide = ((c.w || 3) / (g.cols || 12)) * (innerWidth || 16) > ((c.h || 2) / (g.rows || 8)) * (innerHeight || 10) * 1.5;
      return { cls: `act ${open ? "on" : ""}`, html: `<div class="gr${wide ? "" : " gr-col"}">${ic(o.icon || "art:garage-sectional", 64, open)}<div><b>${esc(o.title || H.devName(o.id) || T("g.garage"))}</b>`
        + `<small>${esc(txt)}</small></div></div>` };
    },
    // a picture with live values, or a garage of 1–3 doors (each tapped on its own — opening and closing ask the PIN)
    spot(c) {
      const o = c.o, rows = Array.isArray(o.rows) ? o.rows : [], pos = o.vpos || "beside", title = o.title ? `<div class="sp-t">${esc(o.title)}</div>` : "";
      let pic, sub = "", on;
      if (o.pic === "garage") {
        const doors = (Array.isArray(o.doors) ? o.doors : []).slice(0, 3);
        const st = doors.map((dr, k) => {
          const d = H.device(dr.id), gs = garage({ i: `${c.i}#${k}`, o: { id: dr.id, contact: dr.contact, travel: dr.travel } }, d);
          return gs || { phase: d && d.on ? "open" : "closed", T: 15000, ago: 0, none: !dr.id };
        });
        pic = st.length ? garageDoors(st, 64) : ic("garage", 56);
        sub = doorWords(doors, st);
        on = st.some((s) => s.phase !== "closed");
      } else {
        on = spotRuns(o);
        pic = ic(o.pic || "power", 60, on);
        if (!o.pic && !rows.length && H.design) return { html: `<div class="gc-empty">${esc(T("g.pickPicValues"))}</div>` };
      }
      const vals = rows.length ? `<div class="sp-vals">${rows.map(spotRow).join("")}</div>` : "";
      // (the pop-up: "Values: on a tap", or "Tap does: Show the values" — whatever the Values position)
      const showV = pos === "beside" || pos === "below", pop = spotPop.has(c.i) && !!vals;
      return { cls: on ? "on" : "", html: `<div class="spc sp-${showV ? pos : "solo"}"><div class="sp-pic">${pic}${sub ? `<small>${esc(sub)}</small>` : ""}${showV ? "" : title}</div>`
        + (showV ? `<div class="sp-side">${title}${vals}</div>` : "") + (pop ? `<div class="sp-pop">${title}${vals}</div>` : "") + `</div>` };
    },
    // the owner's own card: the pieces where they put them (later ones in front); nothing yet → a hint (the builder)
    blank(c) {
      const parts = (Array.isArray(c.o.parts) ? c.o.parts : []).slice(0, 16);
      // (the hint: only in the builder's canvas, and not while the builder edits inside this very card — it sets
      // Grid.editingInside = the card's id then)
      if (!parts.length) return { html: `<div class="bk bk-none">${H.design && Grid.editingInside !== c.i ? `<div class="gc-empty">${ic("plus", 26)}<span>${esc(T("g.emptyBlock"))}</span></div>` : ""}</div>` };
      const html = parts.map((p, n) => {
        const [inner, on] = piece(c, p, n), x = int(p.x, 0, 23, 0), y = int(p.y, 0, 23, 0);
        const w = int(p.w, 1, INNER - x, 1), h = int(p.h, 1, INNER - y, 1);
        return `<div class="bk-p bk-${String(p.t).replace(/[^a-z]/g, "")}${on ? " on" : ""}" data-gitem="${n}" style="left:${at(x)};top:${at(y)};width:${at(w)};height:${at(h)}">${inner}</div>`;
      }).join("");
      return { html: `<div class="bk">${html}</div>` };
    },
    // Hubitat's mode (modes.js): change it with the panel PIN
    modes(c) { return { html: window.Modes ? `<div class="gc-modes">${Modes.card(c.o)}</div>` : "" }; },
    // the house's safety sensors (smoke, CO, gas, water, freezer, power): all clear, or what's wrong
    safety(c) {
      const bad = H.state.sensors.filter((s) => s.state === "detected"), all = H.state.sensors.length;
      const head_ = esc(c.o.title || T("g.safety"));
      // (a freezer above its warning limit: "to check", amber — red 5 °F above; shown only, the alert is Hubitat's)
      const warm = !bad.length && H.sensorWarn ? H.state.sensors.filter((s) => H.sensorWarn(s)) : [];
      if (warm.length) return { cls: "", html: `<div class="gc-safe ${warm.some((s) => H.sensorWarn(s) === "hot") ? "bad" : "warn"}">${ic("thermo", 34)}<div><b>${warm.length} to check</b><small>${warm.slice(0, 3).map((s) => `${esc(H.devName(s.id) || s.where || s.name)} ${Math.round(s.temp)}°`).join(" · ")}</small></div></div>` };
      if (!bad.length) return { cls: "", html: `<div class="gc-safe ok">${ic("shield", 34)}<div><b>${head_}</b><small>${esc(all ? T("g.allClear", { n: all }) : T("g.noSafety"))}</small></div></div>` };
      return { cls: "alarm", html: `<div class="gc-safe bad">${ic("shieldAlert", 34)}<div><b>${bad.length} alert${bad.length > 1 ? "s" : ""}</b><small>${bad.slice(0, 3).map((s) => esc(s.name || s.kind)).join(" · ")}</small></div></div>` };
    },
    // alerts from Hubitat rules that are up on this panel (hubalerts.js): newest first; × dismisses one
    notices(c) {
      const list = window.HubAlerts ? HubAlerts.shown().slice().sort((x, y) => y.lvl - x.lvl || (y.at || 0) - (x.at || 0)) : [];
      if (!list.length) return { html: `${head(c.o.title || T("alert.notifications"))}<div class="gc-empty">${esc(T("g.nothingNew"))}</div>` };
      return { html: `${head(c.o.title || T("alert.notifications"))}<div class="gc-devs list gc-notes">${list.slice(0, 12).map((a) =>
        `<div class="gc-nt l${+a.lvl}"><i></i><span class="gc-n">${esc(a.title || a.text)}</span>${a.title ? `<small>${esc(a.text)}</small>` : ""}<button${Acts.on("hub.dismiss", String(a.id).replace(/[^0-9a-f]/g, ""))} aria-label="${esc(T("alert.dismissOne"))}">✕</button></div>`).join("")}</div>` };
    },
    // days until a date ("12 days to the trip"), or "Today!"
    countdown(c) {
      const o = c.o, m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(o.date || "");
      if (!m) return { html: `<div class="gc-empty">${esc(T("g.pickDate"))}</div>` };
      const t = new Date(+m[1], +m[2] - 1, +m[3]), today = new Date(); today.setHours(0, 0, 0, 0);
      const days = Math.round((t - today) / 864e5);
      const big = days > 1 ? `${days}` : days === 1 ? "1" : days === 0 ? T("g.todayBang") : `${-days}`;
      const sub = days >= 1 ? T("g.daysToGo", { n: days }) : days === 0 ? "" : T("g.daysAgo", { n: -days });
      return { html: `<div class="gc-cd">${o.icon ? ic(o.icon, 34) : ""}<div><b class="num">${esc(big)}</b><small>${esc(sub)}</small><span>${esc(o.title || "")}</span></div></div>` };
    },
    // bin day: which bins go out tonight / today (each bin: a weekday, every 1 or 2 weeks from a first date)
    bins(c) {
      const items = Array.isArray(c.o.items) ? c.o.items : [], now = new Date(), day0 = new Date(now); day0.setHours(0, 0, 0, 0);
      const due = (b, d) => {
        if (d.getDay() !== +b.day) return false;
        if (+b.every !== 2) return true;
        const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b.from || ""); if (!f) return true;
        const weeks = Math.round((d - new Date(+f[1], +f[2] - 1, +f[3])) / (7 * 864e5));
        return weeks % 2 === 0;
      };
      const tomorrow = new Date(day0); tomorrow.setDate(day0.getDate() + 1);
      const today_ = items.filter((b) => due(b, day0)), tmr = items.filter((b) => due(b, tomorrow));
      const show = now.getHours() >= 15 && tmr.length ? [T("g.tonight"), tmr] : today_.length ? [T("cal.today"), today_] : tmr.length ? [T("g.tomorrow"), tmr] : null;
      if (!show) {
        let next = null;
        for (let k = 2; k < 15 && !next; k++) { const d = new Date(day0); d.setDate(day0.getDate() + k); const b = items.filter((x) => due(x, d)); if (b.length) next = [d, b]; }
        return { html: `<div class="gc-bins">${ic("trashBin", 30)}<div><b>${esc(c.o.title || T("g.binDay"))}</b><small>${esc(next ? T("g.binNext", { day: T.weekday(next[0], "long"), bins: T.list(next[1].map((b) => b.name)) }) : T("g.noBins"))}</small></div></div>` };
      }
      return { cls: "on", html: `<div class="gc-bins">${show[1].map((b) => `<i class="gc-bin" style="--bin:${col(b.color) || "#22c55e"}">${ic("trashBin", 30)}</i>`).join("")}<div><b>${esc(T("g.binsShow", { when: show[0], bins: T.list(show[1].map((b) => b.name)) }))}</b><small>${esc(show[0] === T("g.tonight") ? T("g.putOut") : T("g.binDay"))}</small></div></div>` };
    },
    // ---- a room's own page (Grid.room = the room it's on) ----
    roomdevs(c) { return rows(c, itemsOf(c), T("g.nothingLike")); },
    roomopen(c) { return rows(c, itemsOf(c), T("g.noOpenings")); },
    roomhead(c) {
      const r = Grid.room; if (!r) return { html: "" };
      const on = H.lightsOn(r), all = H.lightsTotal(r), p = H.placed(r.name);
      const open = [...p.doors, ...p.windows].filter((x) => x.open).length, unl = p.locks.filter((l) => l.lock !== "locked").length;
      const temp = roomTemp(r.name);
      const chips = [all ? `<span class="chip">${ic("bulb", 16)}${on} of ${all} on</span>` : "", Number.isFinite(temp) ? `<span class="chip">${ic("thermo", 16)}${Math.round(temp)}°</span>` : "",
        open ? `<span class="chip warn">${ic("doorOpen", 16)}${open} open</span>` : "", unl ? `<span class="chip warn">${ic("unlock", 16)}${unl} unlocked</span>` : ""].join("");
      // (the room id is [a-z0-9-] only: safe in the attribute)
      const rid = String(r.id).replace(/[^a-z0-9-]/g, "");
      const btns = c.o.allOff === false || !all ? "" : `<div class="gc-rhb"><button${Acts.on("gr.roomAll", rid, true)}>${ic("bulb", 18)}${esc(T("g.allOnBtn"))}</button><button class="ghost"${Acts.on("gr.roomAll", rid, false)}>${ic("power", 18)}${esc(T("g.allOffBtn"))}</button></div>`;
      return { html: `<div class="gc-rh">${c.o.icon ? ic(c.o.icon, 34) : ""}<div class="gc-rht"><h2>${esc(c.o.title || r.name)}</h2><div class="gc-rhc">${chips}</div></div>${btns}</div>` };
    },
    roomcams(c) {
      const r = Grid.room, cams = r ? H.placed(r.name).cameras : [];
      if (!cams.length || !window.Cameras || !Cameras.cardHtml) return { html: `${head(c.o.title)}<div class="gc-empty">${esc(T("g.noCamRoom"))}</div>` };
      return { html: `<div class="gc-cam gc-cams n${Math.min(cams.length, 4)}">${cams.slice(0, 4).map((x) => Cameras.cardHtml(x.id, c.o.view === "still")).join("")}</div>` };
    },
    picture(c) {
      const m = /^up:([0-9a-f]{16})$/.exec(c.o.pic || "");
      return { html: m ? `<img class="gc-pic" src="/pictures/${m[1]}" alt="" draggable="false" style="object-fit:${c.o.fit === "contain" ? "contain" : "cover"}">` : `<div class="gc-empty">${esc(T("g.pickPicture"))}</div>` };
    },
  };

  // (never trusting what's stored: the service checks it, and here every number is a number in range and every colour a
  // colour before it goes into the page — security review)
  const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
  const col = (v) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);

  // The cards' HTML: [{key, open, cls, ghi, html}] — key = the cell (place + style, never what changes with the
  // devices), open = its opening tag as first drawn, cls / ghi = its classes and highlight colour now, html = what's
  // inside. app.js patches classes and insides that changed, and redraws the whole grid only when a key changed —
  // a light switching never reloads the cards people made (their frames).
  // parts = app.js's own Home pieces (clock, weather, calendar…): {name: () => html}
  // room = the room whose page this is (a room's own grid), else null (Home)
  // "Join touching cards": two cards that overlap along an edge (one reaches into the other — cards merely next to each
  // other keep their gap) become one: the seam has no border and no gap, its corners square off, and the card behind is
  // trimmed to end where the one in front begins (no double background) — the outer border runs around both. One that lies
  // over more than half of the other isn't along an edge: both stay whole (no card trimmed to a sliver).
  // → {card id: {t|b|l|r: cells trimmed there (0 = not trimmed, just joined)}}
  function joins(g) {
    const out = new Map();
    if (!g.join || g.v !== 2) return out;
    const set = (c, k, cut) => { if (!out.has(c.i)) out.set(c.i, {}); out.get(c.i)[k] = cut; };
    const span = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0;
    const order = new Map(g.cards.map((c, n) => [c.i, (c.z || 0) * 1000 + n]));   // (who's in front: z, then later on the page)
    for (const a of g.cards) for (const b of g.cards) {
      if (a === b) continue;
      const ab = a.y + a.h, bb = b.y + b.h, ar = a.x + a.w, br = b.x + b.w, front = order.get(b.i) > order.get(a.i);
      // b reaches up into a's bottom (and goes on below it)
      if (span(a.x, ar, b.x, br) && b.y < ab && b.y > a.y && bb > ab && ab - b.y <= Math.min(a.h, b.h) / 2) { const d = ab - b.y; set(a, "b", front ? d : 0); set(b, "t", front ? 0 : d); }
      // b reaches into a's right side (and goes on past it)
      if (span(a.y, ab, b.y, bb) && b.x < ar && b.x > a.x && br > ar && ar - b.x <= Math.min(a.w, b.w) / 2) { const d = ar - b.x; set(a, "r", front ? d : 0); set(b, "l", front ? 0 : d); }
    }
    return out;
  }
  // A room page on the wall: a room card with nothing for this room (no camera, no fans, no doors…) gives its place to
  // the cards next to it that have something — each grows a cell at a time into the freed place only (a gap the layout
  // left on purpose stays), keeping the spacing to the other cards. Nothing on the page has anything (only the header):
  // null — the empty notes stay. → {card id: {x, y, w, h}} for the cards that are shown
  const ROOM_CARDS = new Set(["roomdevs", "roomopen", "roomcams", "roomthings"]);
  function fillEmpty(g, empty) {
    const shown = g.cards.filter((c) => !empty.has(c.i));
    if (!empty.size || !shown.some((c) => c.t !== "roomhead")) return null;
    const W = int(g.cols, 1, 256, 12), Hh = int(g.rows, 1, 256, 8), free = new Uint8Array(W * Hh);
    const rect = (c) => ({ x: int(c.x, 0, 255, 0), y: int(c.y, 0, 255, 0), w: int(c.w, 1, 256, 1), h: int(c.h, 1, 256, 1) });
    // (the fine grid: cards lie a few cells apart — the freed place reaches over that gap, and a card that grows stops
    // that far from the others; the old 12 × 8 grid's cards touch, its gap is drawn)
    const m = g.v === 2 ? Math.max(1, Math.round((g.gap ?? 14) / 7)) : 0, reach = g.v === 2 ? m + 2 : 0;
    const all = g.cards.map(rect), x0 = Math.min(...all.map((b) => b.x)), y0 = Math.min(...all.map((b) => b.y));
    const x1 = Math.min(W, Math.max(...all.map((b) => b.x + b.w))), y1 = Math.min(Hh, Math.max(...all.map((b) => b.y + b.h)));
    g.cards.forEach((c) => { if (!empty.has(c.i)) return; const b = rect(c);
      for (let y = Math.max(y0, b.y - reach); y < Math.min(y1, b.y + b.h + reach); y++) for (let x = Math.max(x0, b.x - reach); x < Math.min(x1, b.x + b.w + reach); x++) free[y * W + x] = 1; });
    const box = new Map(shown.map((c) => [c.i, rect(c)]));
    const hits = (a, b) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
    const ok = (s, self) => { if (s.x < 0 || s.y < 0 || s.x + s.w > W || s.y + s.h > Hh) return false;
      for (const [id, b] of box) if (id !== self && hits(s, b)) return false;
      for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) if (!free[y * W + x]) return false;
      return true; };
    // (in turns — right, down, left, up — so two cards beside a freed place share it; each step: the strip it takes)
    const STEPS = [(b) => [{ x: b.x + b.w, y: b.y, w: 1, h: b.h }, { w: 1 }], (b) => [{ x: b.x, y: b.y + b.h, w: b.w, h: 1 }, { h: 1 }],
      (b) => [{ x: b.x - 1, y: b.y, w: 1, h: b.h }, { x: -1, w: 1 }], (b) => [{ x: b.x, y: b.y - 1, w: b.w, h: 1 }, { y: -1, h: 1 }]];
    for (let grew = true; grew;) {
      grew = false;
      for (const [id, b] of box) {
        if (Grid.byId.get(id).t === "roomhead") continue;
        for (const step of STEPS) {
          const [s, add] = step(b);
          if (!ok(s, id)) continue;
          for (const k in add) b[k] += add[k];
          grew = true;
        }
      }
    }
    return box;
  }
  // (data-cond: T("g.hiddenNow") — the builder's canvas: a card whose "Only show it when…" doesn't match now)
  Grid.cards = (g, parts, room) => {
    Grid.cur = g; Grid.room = room || null; Grid.byId = new Map(g.cards.map((c) => [c.i, c]));
    const joined = joins(g);
    const watch = new Set(), empty = new Set();
    const out = g.cards.map((c) => {
      const o = c.o || {}, s = c.s || {};
      [o.id, o.contact, ...(c.show || []).map((r) => r.id), ...(c.hi || []).map((r) => r.id), ...ids(o.text), ...(o.items || []).map((it) => it.id)].forEach((x) => x && watch.add(x));
      Object.values(o.bind || {}).forEach((x) => watch.add(x));
      if (c.t === "spot") [o.aid, o.tid, ...(o.rows || []).map((r) => r.id), ...(o.doors || []).flatMap((d) => [d.id, d.contact])].forEach((x) => x && watch.add(x));
      if (c.t === "blank") (o.parts || []).forEach((p) => [p.id, ...ids(p.text), ...(p.doors || []).flatMap((d) => [d.id, d.contact])].forEach((x) => x && watch.add(x)));
      if (c.t === "temps") [o.inside, o.outside].forEach((x) => Number.isInteger(x) && watch.add(x));   // (its own sensors)
      if (c.t === "scenes") (o.items || []).forEach((it) => it && it.a && it.a.id && watch.add(it.a.id));
      if (["roomdevs", "roomopen"].includes(c.t)) itemsOf(c).forEach((it) => watch.add(it.id));
      const shown = all(c.show), hi = c.hi && all(c.hi);
      let body = { html: "" };
      // (the builder's canvas draws a hidden card anyway, faded and marked — you see what you style and size; in "Try it"
      // it's hidden as on the wall: Grid.trying, design.js)
      const marked = H.design && !Grid.trying;
      if (shown || marked) {
        try {
          if (DRAW[c.t]) body = DRAW[c.t](c) || (parts[c.t] ? { html: parts[c.t](o, c) } : { html: "" });
          else if (/^card:/.test(c.t)) body = { html: window.UserCards ? UserCards.html(c) : "" };
          else if (parts[c.t]) body = { html: parts[c.t](o, c) };
        } catch (e) { console.warn(`[grid] card ${c.i} (${c.t}) failed:`, e); body = { html: "" }; }
        if (room && (ROOM_CARDS.has(c.t) ? /class="gc-empty"/.test(body.html)
          : c.t === "people" && !H.people().some((p) => !Array.isArray(o.ids) || !o.ids.length || o.ids.includes(p.id)))) empty.add(c.i);
      }
      // what's inside follows the card's size (Grid.fit): "scale" (the fine grid's default), "scroll", or the old shrink
      // (an old 12 × 8 grid's card with no choice shrinks to fit too: on a smaller screen it was cut off — a 1024 × 768 or
      // portrait tablet showed "3:2…" and a dial wider than its card)
      const fm = s.fit === "scroll" ? "fit scroll" : s.fit === "scale" || (g.v === 2 && s.fit == null) ? "fit scale" : s.fit === true || (g.v !== 2 && s.fit == null) ? "fit" : "";
      const base = ["gc", `gc-${String(c.t).replace(/[^a-z0-9-]/g, "-")}`, `e${int(s.e, 0, 3, 1)}`, s.b === false ? "nb" : "", fm,
        c.tap || c.hold || c.dbl || defTap(c) ? "act" : ""].filter(Boolean).join(" ");
      const jn = joined.get(c.i), jc = jn ? Object.keys(jn).map((k) => `j-${k}`).join(" ") : "";
      const jv = jn ? Object.entries(jn).filter(([, d]) => d > 0).map(([k, d]) => `--j${k}:${d}`).join(";") : "";
      // (the Guest Wi-Fi card with nothing to show — no network, off for this panel: no empty glass box on the wall)
      const gone = !shown || (c.t === "guest" && !body.html && !marked);
      const cls = [base, jc, body.cls || "", hi ? "hi" : "", !gone ? "" : marked ? "gc-cond" : "gc-hide"].filter(Boolean).join(" "), ghi = hi && col(c.hic) ? col(c.hic) : "";
      // (the place is kept apart from the key: moving a card — the builder's live canvas while dragging — only moves it)
      const area = `${int(c.y, 0, 255, 0) + 1}/${int(c.x, 0, 255, 0) + 1}/span ${int(c.h, 1, 256, 1)}/span ${int(c.w, 1, 256, 1)}`;   // (the fine grid: up to 192 × 128)
      const st = [s.r != null ? `--gr:${int(s.r, 0, 48, 24)}px` : "", s.a != null ? `--ga:${int(s.a, 0, 100, 72) / 100}` : "",
        s.ic != null ? `--gic:${int(s.ic, 50, 250, 100) / 100}` : "", s.tx != null ? `--gtx:${int(s.tx, 50, 250, 100) / 100}` : "",
        col(s.c) ? `--gcc:${col(s.c)}` : "", c.z ? `z-index:${int(c.z, 0, 99, 0)}` : "", jv].filter(Boolean).join(";");
      return { key: `${base}|${c.i}|${st}`, area, cls, ghi, st, html: body.html };
    });
    // (a room page on the wall — and in "Try it" — only: the builder's canvas shows each card where its handles are)
    const grown = room && !(H.design && !Grid.trying) ? fillEmpty(g, empty) : null;
    out.forEach((x, n) => {
      const c = g.cards[n], b = grown && grown.get(c.i);
      if (grown && empty.has(c.i)) x.cls += " gc-hide";
      if (b) x.area = `${b.y + 1}/${b.x + 1}/span ${b.h}/span ${b.w}`;
      // (--go: its reading order for a phone, where the cards stack — theme.css: column by column, as the built-in
      // layouts stack theirs: each column's cards top to bottom, then the next column)
      const go = (b ? b.x : int(c.x, 0, 255, 0)) * 256 + (b ? b.y : int(c.y, 0, 255, 0));
      // (data-cond: the builder canvas's "Hidden now" tag — words in the page, not in the CSS, so they can be translated)
      x.open = `<div class="${x.cls}" data-gi="${esc(c.i)}" data-cond="${esc(T("g.hiddenNow"))}" style="grid-area:${x.area};--go:${go}${x.st ? `;${x.st}` : ""}${x.ghi ? `;--ghi:${x.ghi}` : ""}">`;
    });
    H.watch(watch);
    // (cards people made: their frames get the new values once the HTML is on the page — cards.js)
    if (window.UserCards && g.cards.some((c) => /^card:/.test(c.t))) setTimeout(() => UserCards.push(), 0);
    return out;
  };
  // What's inside a card follows its size (--gfit, theme.css; measured after each redraw):
  //   "scale"  the card's type has a normal size (BASE, in the old 12 × 8 grid's cells); a card twice that wide and
  //            high draws everything twice as big — the dial, icons and text — and smaller below it; then smaller still
  //            until it all fits (the content reflows into the box a smaller scale gives, so a few rounds settle it)
  //   "scroll" made smaller only when the card is narrower than normal (to fit the width); lists scroll, the title stays put
  //   (old) "shrink to fit": only smaller, until it fits
  const BASE = { clock: [4, 2], weather: [4, 3], calendar: [4, 5], thermostat: [4, 4], locks: [4, 2], openings: [4, 1], people: [4, 1], temps: [4, 1],
    guest: [4, 2], alerts: [4, 1], device: [3, 1], group: [3, 3], value: [2, 2], button: [2, 2], room: [2, 2], text: [4, 2], alarm: [4, 2], lock: [3, 2],
    garage: [3, 2], spot: [4, 3], todo: [4, 4], notes: [5, 3], fan: [4, 2], energy: [5, 4], player: [5, 2], status: [3, 2], photos: [4, 3], batteries: [4, 3], power: [4, 3],
    scenes: [6, 2], modes: [6, 2], safety: [4, 1], notices: [4, 3], countdown: [3, 2], bins: [4, 1], timer: [4, 3], camera: [4, 3], picture: [3, 3], blank: [4, 3],
    roomhead: [12, 1], roomdevs: [6, 4], roomopen: [4, 3], roomcams: [6, 4], roomthings: [4, 3] };
  const over = (n) => Math.max(n.scrollHeight / Math.max(1, n.clientHeight), n.scrollWidth / Math.max(1, n.clientWidth));
  // (the calendar's day and "Coming up" lists clip on their own: measured too, or a grown card cuts an event in half)
  const need = (inn) => Math.max(over(inn), ...[...inn.querySelectorAll(".card, .cal-body, .cal-body > .ag, .lock-list, .gc-devs, .wx-days, .gc-text, .gc-text > div")].map(over));
  Grid.fit = (main) => {
    const mw = main.clientWidth, mh = main.clientHeight;
    // one cell's size (the fine grid): joined cards are trimmed by whole cells (theme.css --g-cw / --g-rh)
    const g = Grid.cur, cs = getComputedStyle(main), pad = (a, b) => (parseFloat(cs[a]) || 0) + (parseFloat(cs[b]) || 0);
    if (g && g.v === 2) {
      main.style.setProperty("--g-cw", `${(mw - pad("paddingLeft", "paddingRight")) / g.cols}px`);
      main.style.setProperty("--g-rh", `${(mh - pad("paddingTop", "paddingBottom")) / g.rows}px`);
    }
    for (const cell of main.querySelectorAll(".gc.fit")) {
      const inn = cell.firstElementChild; if (!inn) continue;
      let s = 1;
      if (cell.classList.contains("scale") || cell.classList.contains("scroll")) {
        // (a thermostat look has its own normal size: a strip is 1 high — thermo-looks.js)
        const c = Grid.byId && Grid.byId.get(cell.dataset.gi), b = (c && c.t === "thermostat" && window.ThermoLooks && ThermoLooks.base((c.o || {}).look)) || (c && BASE[c.t]) || [3, 2];
        const kw = cell.clientWidth / Math.max(1, (b[0] / 12) * mw), kh = cell.clientHeight / Math.max(1, (b[1] / 8) * mh);
        // (scroll: only ever smaller, to fit the width — the height goes to the list, which scrolls)
        // (a one-row card — a device, people — in a box taller than its row: its words wrap, so it starts from between the
        // two and the rounds below make it fit — not drawn at the narrow width's scale in a mostly empty card)
        // (not "Doors & windows": its two chips are a row, not words — grown that way the words wrapped one per line in
        // huge type, "1 / window / open"; at its width's scale it looks as on the built-in layouts, the chips centred)
        const k = b[1] === 1 && kh > kw && !(c && c.t === "openings") ? Math.sqrt(kw * kh) : Math.min(kw, kh);
        // (a phone, the cards stacked full width — theme.css: never drawn bigger than normal; measured against the whole
        // screen's width a card was 2.2 × — "DOOR / LOCKS", "Lock / all" on two lines each)
        const stacked = cs.display === "flex";
        s = Math.max(0.4, cell.classList.contains("scroll") ? Math.min(1, kw) : Math.min(stacked ? 1 : 2.2, k));
        // (v3.0.2: a room's devices keep their own size — tiles / rows / orbs reflow into the card, leaving free space; only
        // once they no longer fit do they get smaller (the rounds below), then scroll. Drawn at the card's scale, a big card
        // had huge tiles and shrinking it shrank them long before its edges came near)
        if (c && c.t === "roomdevs") s = 1;
      }
      if (cell.dataset.lscroll) delete cell.dataset.lscroll;
      cell.style.setProperty("--gfit", s.toFixed(3));
      // (much smaller than its normal size: a card may leave out its extras — thermo-looks.css)
      cell.classList.toggle("g-small", s < 0.72);
      if (cell.classList.contains("scroll")) continue;   // (lists scroll)
      const s0 = s;
      // too big: smaller until it fits, then back up halfway a few times — the largest size that fits (a part that
      // takes the rest of the card, like the weather's days, doesn't shrink in step: s / r alone overshoots to tiny)
      const fits = (v) => { cell.style.setProperty("--gfit", v.toFixed(3)); return need(inn) <= 1.01; };
      let hi = null;
      for (let i = 0; i < 5 && s > 0.35; i++) {
        const r = need(inn);
        if (r <= 1.01) break;
        hi = s; s = Math.max(0.35, s / r);
        cell.style.setProperty("--gfit", s.toFixed(3));
      }
      if (hi != null && need(inn) <= 1.01) {
        for (let i = 0; i < 5 && hi - s > 0.01; i++) { const m = (s + hi) / 2; if (fits(m)) s = m; else hi = m; }
        cell.style.setProperty("--gfit", s.toFixed(3));
      }
      // a long list (a room's 58 lights): rather readable and scrolling than squeezed into 3 px text
      // (a room's devices: down to 0.7 of their size at most, then scroll at that size)
      const own = cell.classList.contains("gc-roomdevs"), lo = own ? 0.7 : 0.6;
      if (s < lo && inn.querySelector(".gc-devs")) {
        s = own ? lo : Math.max(0.6, Math.min(1, s0));
        cell.dataset.lscroll = "1";
        cell.style.setProperty("--gfit", s.toFixed(3));
      }
    }
    covers(main);
  };
  Grid.frame = (main, g) => {
    const st = main.style;
    if (!g) { ["--g-cols", "--g-rows", "--g-gap"].forEach((k) => st.removeProperty(k)); return; }
    st.setProperty("--g-cols", g.cols); st.setProperty("--g-rows", g.rows); st.setProperty("--g-gap", `${g.gap}px`);
  };

  // ---------- actions: tap / hold (0.55 s) / double-tap ----------
  const unlockNo = () => window.PinPad && PinPad.confirm({ title: T("dev.notFromHere"), text: T("g.noUnlock"), yes: T("common.ok") });
  // a tap on a garage door (a Garage door card, a Picture & values door, a Device card on a garage opener): open or
  // close it — a door controller by its own door, a relay / switch by the door's contact (else its switch) — always
  // with the PIN (data.js: gar). In the builder's Try it the door's contact follows, so the door is seen to move.
  function garageTap(id, gd, d) {
    const ct = gd.contact != null ? H.attr(gd.contact, "contact") : null;
    const open = d && d.cmd === "openclose" ? !!d.on : ct === "open" || ct === "closed" ? ct === "open" : d ? !!d.on : H.attr(id, "switch") === "on";
    const gar = open ? "close" : "open";
    if (H.design && gd.contact != null) {
      const TRAVEL = (Number.isInteger(gd.travel) ? Math.max(3, Math.min(60, gd.travel)) : 15) * 1000;
      if (ct !== "open" && ct !== "closed") H.demoAttr(gd.contact, "contact", open ? "open" : "closed");
      setTimeout(() => H.demoAttr(gd.contact, "contact", gar === "open" ? "open" : "closed"), gar === "open" ? 800 : Math.max(500, TRAVEL - 300));
    }
    if (d) return H.toggle(id, d.cmd === "openclose" ? null : gar);
    return H.send(id, H.attr(id, "switch") === "on" ? "off" : "on", null, gar);
  }
  Grid.garageTap = garageTap;   // (a room page's "Overhead door" row: roomlayoutG.js)
  function run(a, c) {
    if (!a || a.do === "none") return;
    const id = a.id, d = id ? H.device(id) : null, lock = id ? H.state.locks.find((l) => l.id === id) : null;
    switch (a.do) {
      case "toggle":
        if (lock) return lock.lock === "locked" ? (H.canUnlock(id) ? H.unlock(id) : unlockNo()) : H.lock(id);
        if (a.gd || (d && d.kind === "garage")) return garageTap(id, a.gd || {}, d);
        if (d) return H.toggle(id);
        return H.send(id, H.attr(id, "switch") === "on" ? "off" : "on");
      case "on": case "off":
        if (d && !!d.on !== (a.do === "on")) return H.toggle(id);
        if (d && d.cmd === "openclose") return null;   // (a door controller already there: never "on" / "off" to it)
        return H.send(id, a.do);
      case "lock": return lock ? H.lock(id) : H.send(id, "lock");
      case "unlock": return lock && H.canUnlock(id) ? H.unlock(id) : unlockNo();
      case "cmd":
        if (a.c === "unlock") return H.canUnlock(id) ? H.unlock(id) : unlockNo();
        // a room light: through its own helpers (shown at once; the light's own colour command — one setColor, or
        // hue + saturation for drivers that take them one by one: Manager → Devices)
        if (d && a.c === "setLevel") return H.setLevel(id, +a.v);
        if (d && a.c === "setColorTemperature" && d.white) return H.setColorTemp(id, +a.v);
        if (a.c === "setColor") {
          const [hue, sat] = String(a.v || "").split(",").map(Number);
          if (d && d.rgb) return H.setColor(id, hue, sat);
          H.send(id, "setHue", hue); return H.send(id, "setSaturation", sat);
        }
        if (id != null && id === H.state.thermostat.id && a.c === "setThermostatMode") return H.setMode(a.v);
        return H.send(id, a.c, a.v ?? null);
      case "nudge": {   // a little up / down from where it is now
        const t = H.state.thermostat;
        if (id === t.id && a.c !== "setLevel") return H.setTemp(a.c === "setHeatingSetpoint" ? "heat" : "cool", t[a.c === "setHeatingSetpoint" ? "heat" : "cool"] + a.v);
        if (d && a.c === "setLevel") return H.setLevel(id, (d.on ? d.level || 0 : 0) + a.v);
        const cur = parseFloat(H.attr(id, { setHeatingSetpoint: "heatingSetpoint", setCoolingSetpoint: "coolingSetpoint", setLevel: "level" }[a.c]));
        return Number.isFinite(cur) ? H.send(id, a.c, Math.round(cur + a.v)) : null;
      }
      case "room": return H.room(a.room) ? App.go(a.room) : null;
      case "page": return App.go(a.page);
      case "camera": return window.Cameras && Cameras.full(a.cam);
      case "spotpop": if (spotPop.has(c.i)) spotPop.delete(c.i); else spotPop.add(c.i); return H.refresh();
    }
  }
  // what a card does when the owner set nothing
  // (a device card: only a device that switches — a sensor card does nothing by itself)
  const switches = (id) => !!H.device(id) || H.attr(id, "switch") != null || H.state.locks.some((l) => l.id === id);
  // (a group card: no default — its devices are tapped one by one)
  const defTap = (c) => (c.t === "spot" && c.o ? (c.o.tapdo === "toggle" && c.o.tid ? { do: "toggle", id: c.o.tid } : c.o.tapdo === "values" || (c.o.vpos === "tap" && c.o.tapdo !== "none") ? { do: "spotpop" } : null)
    : c.t === "garage" && c.o && c.o.id ? { do: "toggle", id: c.o.id, gd: { contact: c.o.contact, travel: c.o.travel } } : c.t === "lock" && c.o && c.o.id ? { do: "toggle", id: c.o.id, dflt: true }
    : c.t === "device" && c.o && switches(c.o.id) ? { do: "toggle", id: c.o.id, dflt: true, ...((H.device(c.o.id) || {}).kind === "garage" ? { gd: { contact: c.o.contact, travel: c.o.travel } } : {}) } : c.t === "room" ? { do: "room", room: c.o.room }
    : c.t === "camera" ? { do: "camera", cam: c.o.cam } : null);
  const act = (c, k) => {
    let a = c[k] || (k === "tap" ? defTap(c) : null);
    // (a device card's own tap never unlocks: that needs an action the owner chose)
    if (a && a.dflt) { const lock = H.state.locks.find((l) => l.id === a.id); if (lock) a = lock.lock === "locked" ? null : { do: "lock", id: a.id }; }
    return a;
  };
  let press = null, lastTap = null;
  const inner = (t) => t.closest("button, a, input, select, textarea, [data-click], [data-change], [data-nest], [data-tdrag], .cal, .gw-card");
  document.addEventListener("pointerdown", (e) => {
    // (v3.0.2: a press whose release never came — its card redrawn under the finger — must not block every card after it)
    if (press && !press.unlock && !press.sliding && Date.now() - press.at > 5000) { clearTimeout(press.timer); press = null; }
    const el = e.target.closest("#main.lay-custom .gc[data-gi]");
    if (!el || press || (inner(e.target) && !el.matches(".gc-device, .gc-button, .gc-room, .gc-camera, .gc-value, .gc-text, .gc-picture, .gc-group, .gc-roomdevs, .gc-roomopen, .gc-scenes, .gc-lock, .gc-garage, .gc-spot, .gc-blank"))) return;
    if (el.matches(".gc-player") && e.target.closest("button")) return;   // (its own buttons)
    const c = Grid.byId.get(el.dataset.gi); if (!c) return;
    // one device on a card of several: a tap switches that one (the card's own actions don't apply)
    const many = ["group", "roomdevs", "roomopen", "scenes"].includes(c.t);
    const gi = e.target.closest("[data-gitem]"), item = gi && many ? itemsOf(c)[+gi.dataset.gitem] : null;
    if (many && !item) return;
    // a picture card: one garage door, or one of its rows (a value row does nothing; the picture itself: its tap)
    // a blank card: one of its pieces (a value, a door, text: the card's own tap); a garage piece: the door tapped
    // (one door: anywhere on the piece)
    const blank = c.t === "blank", spot = c.t === "spot" || blank, door = spot && e.target.closest("[data-gdoor]");
    let srow = spot && gi ? itemsOf(c)[+gi.dataset.gitem] : null, dn = door ? +door.dataset.gdoor : null;
    if (blank && srow && srow.passive) srow = null;
    else if (spot && gi && (!srow || srow.passive)) return;
    if (blank) { if (!srow || srow.as !== "garage") dn = null; else if (dn == null && (srow.doors || []).length === 1) dn = 0; else if (dn == null) return; }
    press = { id: e.pointerId, el: item || srow ? gi : el, c, item: item || srow, x: e.clientX, y: e.clientY, held: false, door: dn, at: Date.now() };
    // a lock card's "slide to unlock": the thumb follows the finger (pointermove), let go near the end → unlock
    const thumb = (c.t === "lock" || (srow && srow.as === "lock")) && e.target.closest(".lk-thumb");
    if (thumb) { press.unlock = { track: thumb.parentElement, thumb, id: srow ? srow.id : c.o.id }; App.dragging = true; return; }
    if (press.door != null) { press.el.classList.add("pressed"); return; }
    // a slider tile on a light that dims: dragging across it sets the level
    if (!item && c.t === "device" && ["slider", "bar"].includes((c.o || {}).style)) { const d = H.device(c.o.id); if (d && d.dim !== false && d.kind === "light") { press.slider = d; press.vert = c.o.style === "bar"; } }
    // (v3.0.2) an orb that dims: press and slide up / down = brightness from where it is (Room Layout G's orb), off at the bottom
    // (v3.0.2: not in a card whose list scrolls — data-lscroll: there an up / down swipe scrolls; hold for the pop-up)
    if (item && gi.matches(".gc-orbi") && !el.dataset.lscroll && e.target.closest(".rlG-ow")) { const d = H.device(item.id); if (d && d.dim && d.kind === "light") { press.slider = d; press.orb = gi.querySelector("[data-light]"); press.lv0 = d.on ? d.level || 0 : 0; } }
    press.el.classList.add("pressed");
    // press and hold: the card's wheel of actions when it has one (else its hold action); a device that switches with
    // neither (an item of a Devices card, a Device card with no wheel set): the automatic wheel from what it is
    // (v3.0.2: a light that dims / changes colour: its pop-up — brightness, white, colour — not the wheel's two colours)
    const it2 = press.item, auto = (x) => (x && x.id && !H.state.locks.some((l) => l.id === x.id) && (H.device(x.id) || {}).kind !== "garage" ? (lightPopOk(x.id) ? [{ pop: x.id }] : Grid.autoWheel(x.id)) : null);
    const wh = it2 ? it2.wheel || (c.t === "roomdevs" || c.t === "group" || (spot && it2.as === "switch") ? auto(it2) : null)
      : (c.o || {}).wheel || (c.t === "device" && !c.hold ? auto(c.o) : null);
    if (wh && wh.length) {
      const at = press.el;
      at.classList.add("holding");   // (a ring fills while the finger stays: the wheel is coming)
      press.fire = () => {
        if (!press) return; press.held = true; at.classList.remove("pressed", "holding");
        if (wh[0].pop != null) { eatAfter(press.id); Grid.lightPop(wh[0].pop); } else Grid.openWheel(at, wh, c, it2 ? it2.icon : (c.o || {}).icon);   // (the lift's click: not on the pop-up's backdrop)
      };
      press.timer = setTimeout(press.fire, 550);
      return;
    }
    if (it2) return;
    const hold = act(c, "hold");
    if (hold) { press.fire = () => { if (!press) return; press.held = true; el.classList.remove("pressed"); run(hold, c); }; press.timer = setTimeout(press.fire, 550); }
  });
  // (v3.0.2) a tablet's own long-press (Android / FreeKiosk WebView, iPad Safari) shows no menu on a card, a room tile or
  // an orb — and when its contextmenu comes before our 0.55 s (Android's long-press is ~0.4–0.5 s, and a menu it starts
  // cancels the touch: no pointerup, the hold never fired), that IS the hold
  const NO_MENU = "#main.lay-custom .gc, main.roomview .tile[data-dev], main.roomlayout [data-light], .gwheel, .popup-host";
  document.addEventListener("contextmenu", (e) => {
    const t = e.target.closest ? e.target : null; if (!t) return;
    if (press && press.fire && !press.held && press.timer && t.closest("#main.lay-custom .gc[data-gi]")) { e.preventDefault(); clearTimeout(press.timer); press.fire(); return; }
    if (lp) { e.preventDefault(); lpFire(); return; }
    if (t.closest(NO_MENU) && !t.closest("input, textarea, [contenteditable]:not([contenteditable=false])")) e.preventDefault();   // (v3.0.2: a pop-up's text field keeps its paste / select menu)
  }, true);
  const end = (e, cancel) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press; press = null; clearTimeout(p.timer); p.el.classList.remove("pressed", "holding");
    if (p.unlock) {
      App.dragging = false;
      if (!cancel && p.unlock.frac >= 0.85) H.unlock(p.unlock.id);   // ("Are you sure?" + the PIN: data.js)
      else p.unlock.thumb.style.transform = "";
      App.render();
      return;
    }
    if (p.sliding) {   // (the level where the finger let go; 0 = off)
      App.dragging = false;
      // (an orb dragged down while off stays off: no command)
      if (!cancel && p.pct != null) { if (p.pct === 0) { if (!p.orb || p.slider.on) run({ do: "off", id: p.slider.id }, p.c); } else H.setLevel(p.slider.id, p.pct); }
      App.render();
      return;
    }
    // (a release after a hold is never a tap — also where the hold had nothing to open)
    if (cancel || p.held || Date.now() - p.at >= 550 || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) return;
    if (p.door != null) { const dr = ((p.c.t === "blank" ? (p.item || {}).doors : (p.c.o || {}).doors) || [])[p.door]; return dr && dr.id ? run({ do: "toggle", id: dr.id, gd: { contact: dr.contact, travel: dr.travel } }, p.c) : null; }   // (the PIN: data.js)
    if (p.item && p.c.t === "scenes") return run(p.item.a, p.c);
    if (p.item) {   // (like a device card's own tap: a lock only locks)
      const id = p.item.id, lock = H.state.locks.find((l) => l.id === id);
      return lock ? (lock.lock === "locked" ? null : H.lock(id)) : switches(id) ? run({ do: "toggle", id }, p.c) : null;
    }
    const dbl = act(p.c, "dbl"), tap = act(p.c, "tap");
    if (!dbl) return run(tap, p.c);
    if (lastTap && lastTap.c === p.c && Date.now() - lastTap.at < 300) { clearTimeout(lastTap.timer); lastTap = null; return run(dbl, p.c); }
    if (lastTap) { clearTimeout(lastTap.timer); const prev = lastTap; lastTap = null; run(act(prev.c, "tap"), prev.c); }   // (another card's tap: now)
    const mine = { c: p.c, at: Date.now() };
    mine.timer = setTimeout(() => { if (lastTap === mine) lastTap = null; run(tap, p.c); }, 300);
    lastTap = mine;
  };
  document.addEventListener("pointermove", (e) => {
    if (press && press.unlock && e.pointerId === press.id) {
      const u = press.unlock, r = u.track.getBoundingClientRect(), room = r.width - u.thumb.offsetWidth - 8;
      u.frac = Math.max(0, Math.min(1, (e.clientX - press.x) / Math.max(1, room)));
      u.thumb.style.transform = `translateX(${Math.round(u.frac * room)}px)`;
      return;
    }
    const ody = press && press.orb ? e.clientY - press.y : 0;
    if (press && press.orb && e.pointerId === press.id && (press.sliding || (Math.abs(ody) > 20 && Math.abs(ody) > Math.abs(e.clientX - press.x) * 1.2))) {
      if (!press.sliding) { press.sliding = true; clearTimeout(press.timer); press.el.classList.remove("pressed", "holding"); App.dragging = true; }
      const v = Math.round(press.lv0 - (ody / 160) * 100); press.pct = v < 1 ? 0 : Math.min(100, v);
      RoomLayouts.G.orbPaint(press.orb, press.slider, { on: press.pct > 0, level: Math.max(1, press.pct) });
      return;
    }
    if (press && press.slider && !press.orb && e.pointerId === press.id && (press.sliding || Math.abs(press.vert ? e.clientY - press.y : e.clientX - press.x) > 10)) {
      if (!press.sliding) { press.sliding = true; clearTimeout(press.timer); press.el.classList.remove("pressed", "holding"); App.dragging = true; }
      const r = press.el.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, Math.round(press.vert ? ((r.bottom - e.clientY) / r.height) * 100 : ((e.clientX - r.left) / r.width) * 100)));
      press.pct = pct;
      const f = press.el.querySelector(".gc-slf"), s = press.el.querySelector(".gc-s");
      if (f) f.style.transform = press.vert ? `scaleY(${(pct / 100).toFixed(3)})` : `scaleX(${(pct / 100).toFixed(3)})`;
      if (s) s.textContent = pct ? `${pct}%` : T("val.off");
      return;
    }
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) { clearTimeout(press.timer); press.timer = null; press.el.classList.remove("pressed", "holding"); }
  });
  document.addEventListener("pointerup", (e) => end(e, false));
  document.addEventListener("pointercancel", (e) => end(e, true));

  // a room's own device list: a wheel from what the device is (no setup) — on / off, brightness, white, colour, speed, open
  Grid.autoWheel = (id) => {
    const d = H.device(id); if (!d) return null;
    const w = [], a = (label, icon, x, col) => w.push({ id, label, icon, col, ...x });
    if (d.kind === "fan") { for (const s of ["low", "medium", "high"]) a(s[0].toUpperCase() + s.slice(1), "fan", { do: "cmd", c: "setSpeed", v: s }); a(T("val.off"), "power", { do: "off" }); return w; }
    if (d.kind === "shade") { a(T("val.open"), "shade", { do: "cmd", c: "setPosition", v: 100 }); a(T("shade.half"), "shade", { do: "cmd", c: "setPosition", v: 50 }); a(T("shade.close"), "shade", { do: "cmd", c: "setPosition", v: 0 }); return w; }
    a(T("val.on"), "power", { do: "on" }); a(T("val.off"), "power", { do: "off" });
    if (d.dim) { a("25 %", "sun", { do: "cmd", c: "setLevel", v: 25 }); a("100 %", "sun", { do: "cmd", c: "setLevel", v: 100 }); }
    if (d.white) { a(T("g.warm"), "bulb", { do: "cmd", c: "setColorTemperature", v: 2700 }); a(T("g.daylight"), "bulb", { do: "cmd", c: "setColorTemperature", v: 6000 }); }
    if (d.rgb) { a(T("g.red"), null, { do: "cmd", c: "setColor", v: "0,100" }, "#ff3b30"); a(T("g.blue"), null, { do: "cmd", c: "setColor", v: "66,100" }, "#007aff"); }
    return w.length > 2 ? w.slice(0, 8) : null;
  };

  // ---------- a light's pop-up (v3.0.2: press and hold a light anywhere — room tiles / list rows, cards, orbs) ----------
  // On / off, brightness (dims), warm ↔ cool (tunable white, 2000–6500 K as data.js sends it) and colour: a rainbow hue
  // slider + saturation (Hubitat's 0–100 scales; H.setColor sends setHue + setSaturation, or one setColor — the device's
  // own colour command, which the bridge's rules allow). Live while dragging, sent on release (one command, not fifty).
  // (v3.0.2: every light — a plain on / off one too: its pop-up is just the switch. Held, a light opens it on every look —
  // cards, orbs, tiles, list rows — and the release never also switches it)
  const lightPopOk = (id) => { const d = H.device(+id); return !!(d && d.kind === "light"); };
  const CT_STOPS = [[2000, "#ff8a1f"], [2700, "#ffb86b"], [4000, "#ffe4c4"], [5000, "#fff6ea"], [6500, "#d6e3ff"]];
  const ctCol = (k) => { const s = CT_STOPS.find(([v]) => v >= k) || CT_STOPS[CT_STOPS.length - 1]; return s[1]; };
  const hueCol = (h, s) => `hsl(${Math.round(h * 3.6)} 100% ${Math.round(100 - s / 2)}%)`;
  const lpLook = (d) => (d.rgb && (String(d.mode).toUpperCase() === "RGB" || !d.white) ? hueCol(d.hue ?? 0, d.sat ?? 100) : d.white ? ctCol(d.ct || 2700) : "#ffd27a");
  const lpRange = (id, k, min, max, step, v, label, out, cls = "") => `<div class="lp-row"><div class="lp-l"><span>${esc(label)}</span><b class="num" data-lpo="${k}">${esc(out)}</b></div>
    <input type="range" class="lp-r lp-${k} ${cls}" min="${min}" max="${max}" step="${step}" value="${v}" aria-label="${esc(label)}"${Acts.attr("input", "gr.lpLive", id, k)} data-change="gr.lpSet"></div>`;
  Grid.lightPop = (id) => {
    id = +id; Grid.closeWheel();
    UI.popup(() => {
      const d = H.device(id); if (!d) return { title: "", body: "" };
      const lv = Math.max(1, Math.min(100, Math.round(d.level || 100))), ct = Math.max(2000, Math.min(6500, Math.round(d.ct || 2700)));
      const hue = Math.max(0, Math.min(100, Math.round(d.hue ?? 0))), sat = Math.max(0, Math.min(100, Math.round(d.sat ?? 100)));
      const body = `<div class="lp${d.on ? " on" : ""}" style="--lp-c:${lpLook(d)};--lp-h:${Math.round(hue * 3.6)}">
        <button class="lp-pw" role="switch" aria-checked="${!!d.on}"${Acts.on("gr.lpToggle", id)}><span class="lp-dot"></span><span class="lp-st">${esc(T(d.on ? "val.on" : "val.off"))}</span><span class="switch ${d.on ? "on" : ""}"></span></button>
        ${d.dim ? lpRange(id, "lvl", 1, 100, 1, lv, T("lp.brightness"), `${lv} %`) : ""}
        ${d.white ? lpRange(id, "ct", 2000, 6500, 50, ct, T("lp.white"), `${ct} K`) : ""}
        ${d.rgb ? lpRange(id, "hue", 0, 100, 1, hue, T("lp.colour"), "", "hue-range") + lpRange(id, "sat", 0, 100, 1, sat, T("lp.saturation"), `${sat} %`) : ""}</div>`;
      return { title: d.name, body, cls: "pop-lp" };
    });
  };
  let lpPtr = false;   // (a slider moved by a finger / mouse lets go of the focus after it's sent: the pop-up updates live again)
  document.addEventListener("pointerdown", (e) => { const r = e.target.closest && e.target.closest(".lp-r"); lpPtr = !!r; if (r) r.focus({ preventScroll: true }); }, true);
  const lpBox = (el) => el.closest(".lp"), lpVal = (box, k) => { const r = box.querySelector(`.lp-${k}`); return r ? +r.value : null; };
  Acts.add({
    "gr.lpToggle": (id) => H.toggle(id),
    "gr.lpLive": (id, k, el) => {   // (only the pop-up's own look while the finger moves — nothing is sent)
      const box = lpBox(el), v = +el.value, o = box.querySelector(`[data-lpo="${k}"]`);
      if (o && k !== "hue") o.textContent = k === "ct" ? `${v} K` : `${v} %`;
      if (k === "hue" || k === "sat") { box.style.setProperty("--lp-h", Math.round(lpVal(box, "hue") * 3.6)); box.style.setProperty("--lp-c", hueCol(lpVal(box, "hue"), lpVal(box, "sat"))); }
      if (k === "ct") box.style.setProperty("--lp-c", ctCol(v));
    },
    "gr.lpSet": (id, k, el) => {   // (the input's data-args, shared with gr.lpLive)
      const box = lpBox(el); if (!box) return;
      if (k === "lvl") H.setLevel(id, +el.value);
      else if (k === "ct") H.setColorTemp(id, +el.value);
      else H.setColor(id, lpVal(box, "hue"), lpVal(box, "sat") ?? 100);
      if (lpPtr) { lpPtr = false; el.blur(); UI.refreshPopup(); }
    },
  });

  // ---------- press and hold on a room page's light / switch (v3.0.2: one for every room look) ----------
  // Held still 0.5 s → fn(); moved more than 10 px (a list scrolling, an orb dimming), lifted or cancelled first: not a
  // hold — the tap / drag stays the page's own. The tap that ends a hold is eaten (one click, right after the release; a
  // tablet that sends none after its long-press doesn't lose the next real tap).
  let lp = null, eatUntil = 0, heldId = null;
  const lpOff = () => { if (lp) { clearTimeout(lp.timer); lp.el.classList.remove("holding"); lp = null; } };
  const eatAfter = (pid) => { heldId = pid; eatUntil = Date.now() + 1500; };
  const lpFire = () => { const p = lp; if (!p) return; lpOff(); eatAfter(p.id); p.fn(); };
  Grid.longPress = (e, el, fn) => {
    lpOff(); if (e.button > 0 || !e.isPrimary) return;
    lp = { el, fn, id: e.pointerId, x: e.clientX, y: e.clientY, timer: setTimeout(lpFire, 500) };
    el.classList.add("holding");
  };
  addEventListener("pointerdown", (e) => { if (e.pointerId !== heldId) { eatUntil = 0; heldId = null; } }, true);
  addEventListener("pointermove", (e) => { if (lp && e.pointerId === lp.id && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) lpOff(); }, true);
  addEventListener("pointerup", (e) => { if (lp && e.pointerId === lp.id) lpOff(); if (e.pointerId === heldId) { heldId = null; eatUntil = Math.min(eatUntil, Date.now() + 400); } }, true);
  addEventListener("pointercancel", (e) => { if (lp && e.pointerId === lp.id) lpOff(); }, true);
  addEventListener("click", (e) => { if (Date.now() < eatUntil) { eatUntil = 0; e.stopPropagation(); e.preventDefault(); } }, true);
  // what a hold on a device opens: a light's pop-up, else its automatic wheel (fans, shades …); null: nothing to open
  Grid.holdable = (id) => lightPopOk(id) || !!Grid.autoWheel(+id);
  Grid.holdDev = (el, id) => { if (lightPopOk(id)) return Grid.lightPop(id); const w = Grid.autoWheel(+id); if (w) Grid.openWheel(el, w, null, null); };

  // ---------- the press-and-hold wheel ----------
  // The card's chosen actions around it. Only the actions do something: a tap on one runs it and closes the wheel; the
  // middle (the card's own picture) and anywhere else just close it.
  let wheelEl = null, wheelIdle = null;
  Grid.closeWheel = () => { clearTimeout(wheelIdle); if (wheelEl) { wheelEl.remove(); wheelEl = null; } };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") Grid.closeWheel(); });
  Grid.openWheel = (from, items, c, picture) => {
    Grid.closeWheel();
    const r = from.getBoundingClientRect(), n = items.length;
    const R = Math.round(Math.max(96, Math.min(150, 46 + n * 13))), pad = R + 46;
    const cx = Math.max(pad, Math.min(innerWidth - pad, r.left + r.width / 2)), cy = Math.max(pad, Math.min(innerHeight - pad, r.top + r.height / 2));
    const opened = Date.now();
    const btns = items.map((a, i) => {
      const ang = -Math.PI / 2 + (2 * Math.PI * i) / n, x = Math.round(Math.cos(ang) * R), y = Math.round(Math.sin(ang) * R);
      const sw = col(a.col) ? `<i class="gw-sw" style="background:${col(a.col)}"></i>` : ic(a.icon || "power", 26, true);
      return `<button class="gw-it" data-wi="${i}" style="--wx:${x}px;--wy:${y}px;--wd:${i * 18}ms">${sw}<span>${esc(a.label || "")}</span></button>`;
    }).join("");
    const mid = c && c.t === "device" ? devState(c.o.id)[2] : "power";
    wheelEl = document.createElement("div");
    wheelEl.className = "gwheel";
    wheelEl.innerHTML = `<div class="gw-c" style="left:${cx}px;top:${cy}px">${btns}<button class="gw-mid" aria-label="${esc(T("common.close"))}">${ic(picture || mid, 34, true)}</button></div>`;   // (v3.0.2: was the literal text T("shade.close"))
    wheelEl.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (Date.now() - opened < 350) return;   // (the hold's own finger lifting)
      const b = e.target.closest(".gw-it");
      const a = b ? items[+b.dataset.wi] : null;
      Grid.closeWheel();
      if (a) run(a, c);
    });
    document.body.appendChild(wheelEl);
    requestAnimationFrame(() => wheelEl && wheelEl.classList.add("open"));
    wheelIdle = setTimeout(Grid.closeWheel, 6000);   // (left alone: it goes)
  };
  // (a redraw of Home, another page or a camera pop-up: the wheel goes)
  document.addEventListener("visibilitychange", () => { if (document.hidden) Grid.closeWheel(); });

  // the photo cards: the next picture every few seconds (only the classes change — the grid isn't redrawn)
  setInterval(() => {
    if (document.hidden) return;
    const now = Date.now();
    for (const box of document.querySelectorAll(".gc-ph")) {
      const every = (+box.dataset.every || 10) * 1000;
      if (now - (+box.dataset.at || 0) < every) continue;
      box.dataset.at = String(now);
      const imgs = box.children; if (imgs.length < 2) continue;
      const i = [...imgs].findIndex((x) => x.classList.contains("on"));
      imgs[i < 0 ? 0 : i].classList.remove("on"); imgs[(i + 1) % imgs.length].classList.add("on");
    }
  }, 1000);

  // the cards' own buttons (acts.js; the Alarm and Notifications cards use alarm.js's and hubalerts.js's)
  Acts.add({
    "gr.setpoint": (tgt, d, tid) => H.setpoint(tgt, d, tid),
    "gr.send": (id, cmd, v) => (v == null ? H.send(id, cmd) : H.send(id, cmd, v)),
    "gr.purifier": (id, act, v) => (v == null ? H.purifier(id, act) : H.purifier(id, act, v)),
    "gr.setFan": (id, s) => H.setFan(id, s), "gr.roomAll": (rid, on) => H.roomAll(rid, on),
    "gr.dropImg": (el) => el.remove(),   // (an album cover that won't load: the card without it)
  });
  window.Grid = Grid;
})();
