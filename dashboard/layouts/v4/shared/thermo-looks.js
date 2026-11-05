// The thermostat card's 12 looks ("user should select from dropdown what to show and what
// thermostat to attach to it"). The card's field `look` picks one
// (builder → Thermostat → Look; none = the card's Style as before: grid.js / app.js). Every look works the thermostat
// the same way as the old card: the same device (the house's or the one picked, H.thermo), the same commands (H.setpoint /
// H.setTemp / App.mode / App.fan — the PIN, "only some panels" and "Not connected to the hub" with its undo all
// happen there), the same mode / fan buttons the owner ticked (o.modes / o.fans, as App.tModes). Only the drawing differs.
// Dragging (the ring, the arc, the bars) only moves the drawing — transform / a CSS variable — and sends the set point
// once, when the finger lets go. Colours: the theme's CSS variables (thermo-looks.css).
(function () {
  const H = Home, esc = (s) => UI.esc(s);
  // [id, name in the builder, normal size in the old 12 × 8 grid (v3.0.3: no longer used by grid.js — what's inside a card
  // keeps its own size, theme.css caps each look's drawing)]
  const LOOKS = [
    ["halo", "Halo ring", [4, 5]], ["knob", "Arc with a knob", [4, 5]], ["slider", "Slider bar", [5, 4]],
    ["mercury", "Thermometer", [4, 5]], ["bignum", "Big number", [4, 5]], ["stepper", "Stepper chip", [3, 1]],
    ["range", "Heat–cool range", [5, 4]], ["today", "Today's run", [5, 4]], ["oneline", "One line", [4, 1]],
    ["orb", "Glass orb", [4, 5]], ["gauge", "Gauge + outside", [5, 5]], ["rings", "Twin rings", [5, 4]],
  ];
  const BY = new Map(LOOKS.map((l) => [l[0], l]));

  // ---------- small drawings ----------
  const PATHS = {
    flame: '<path d="M12 3c1 3 4.5 5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2 1-3.3 2-4.3 0 2 1 3.3 2 3.3 0-3.2-.8-5.5.5-8.5z"/>',
    snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 6l2.5-1.5M9.5 19.5 12 18l2.5 1.5"/>',
    auto: '<path d="M6 19 12 5l6 14M8.4 14h7.2"/>',
    power: '<path d="M12 3v8M7.2 6.3a7 7 0 1 0 9.6 0"/>',
    em: '<path d="M10 3c1 3 4.5 5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2 1-3.3 2-4.3 0 2 1 3.3 2 3.3 0-3.2-.8-5.5.5-8.5z"/><path d="M19 5v6M19 14.5v.5"/>',
    fan: '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4c-1-3.5.2-6.4 2.6-6.4 2.6 0 2.4 4-2.6 6.4zM13.6 12c3.5-1 6.4.2 6.4 2.6 0 2.6-4 2.4-6.4-2.6zM12 13.6c1 3.5-.2 6.4-2.6 6.4-2.6 0-2.4-4 2.6-6.4zM10.4 12c-3.5 1-6.4-.2-6.4-2.6 0-2.6 4-2.4 6.4 2.6z"/>',
    drop: '<path d="M12 3.5s6 6.8 6 11a6 6 0 0 1-12 0c0-4.2 6-11 6-11z"/>',
    thermo: '<path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0z"/><path d="M12 9v6"/>',
    cloud: '<path d="M7 18h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.3 3.3 0 0 0 7 18z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  };
  const I = (n, s = 18) => `<svg class="tl-i" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[n] || ""}</svg>`;
  // (only known words reach the page: these)
  const words = () => ({ MODE: { heat: ["flame", T("thermo.mode.heat")], cool: ["snow", T("thermo.mode.cool")], auto: ["auto", T("thermo.mode.auto")], fan: ["fan", T("thermo.mode.fan")], off: ["power", T("thermo.mode.off")], "emergency heat": ["em", T("tl.emHeat")] },
    FAN: { auto: T("thermo.mode.auto"), on: T("val.on"), circulate: T("thermo.fan.circulate") } });
  let { MODE, FAN } = words();
  addEventListener("panel-strings", () => ({ MODE, FAN } = words()));   // (another language's words arrived)
  const LO = 50, HI = 90;   // (the dial's range: data.js clamps set points to it)
  const frac = (v) => (v == null || !Number.isFinite(+v) ? 0 : Math.max(0, Math.min(1, (v - LO) / (HI - LO))));
  const rad = (a) => (a * Math.PI) / 180;
  const P = (cx, cy, r, a) => [cx + r * Math.sin(rad(a)), cy - r * Math.cos(rad(a))];   // (a: degrees clockwise from 12 o'clock)
  const arc = (cx, cy, r, a0, a1) => { const [x0, y0] = P(cx, cy, r, a0), [x1, y1] = P(cx, cy, r, a1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  // the gauge's colours: blue (cold) → purple → orange (hot), as in the mockup
  const gcol = (k) => { const m = (a, b, f) => Math.round(a + (b - a) * f), [c0, c1, c2] = [[74, 163, 255], [167, 139, 250], [251, 146, 60]], [x, y, f] = k < 0.5 ? [c0, c1, k * 2] : [c1, c2, (k - 0.5) * 2];
    return `rgb(${m(x[0], y[0], f)},${m(x[1], y[1], f)},${m(x[2], y[2], f)})`; };
  const deg = (v) => (v == null || !Number.isFinite(+v) ? "—" : Math.round(v));

  // ---------- what every look shows: one thermostat, read the same way ----------
  function model(c) {
    const o = c.o || {}, own = Number.isInteger(o.id) && o.id > 0, t = H.thermo(own ? o.id : null);
    if (t.id == null) return null;
    const tid = own ? o.id : "null";   // (in the buttons' onclick: the card's own thermostat, or the house's)
    const tgt = t.mode === "cool" ? "cool" : t.mode === "heat" ? "heat" : null, set = tgt ? t[tgt] : null;
    const op = String(t.op || "").toLowerCase(), run = op === "heating" ? "heat" : op === "cooling" ? "cool" : /fan/.test(op) ? "fan" : null;
    const st = run || tgt || (t.mode === "fan" ? "fan" : "off");
    // (in Auto: both set points are shown, "68–76°"; − / + and dragging move the nearer one, as the Standard look's dial)
    const auto = t.tmode === "auto" && !!tgt;
    const word = run === "heat" ? T("tl.heating") : run === "cool" ? T("tl.cooling") : run === "fan" || t.mode === "fan" ? T("thermo.mode.fan") : !tgt ? T("thermo.mode.off")
      : op === "idle" ? T("tl.idle") : auto ? T("thermo.mode.auto") : tgt === "heat" ? T("thermo.mode.heat") : T("thermo.mode.cool");
    const h = parseFloat(H.reading(t.id, "humidity")), hum = Number.isFinite(h) ? Math.round(h) : null;
    // the mode buttons: the ones the owner ticked (none set: Heat / Cool / Fan / Off — and Auto where the thermostat has
    // it), lit as App.tModes lights them
    const hasAuto = t.tmode === "auto" || /auto/.test(String(H.reading(t.id, "supportedThermostatModes") || ""));
    const list = (Array.isArray(o.modes) ? o.modes : ["heat", "cool", ...(hasAuto ? ["auto"] : []), "fan", "off"]).filter((m) => Object.hasOwn(MODE, m) && (m !== "fan" || H.fanOn(t.id)));
    const lit = (m) => (m === "fan" ? t.mode === "fan" : t.tmode == null ? t.mode === m
      : t.tmode === "emergency heat" && m === "heat" && !list.includes("emergency heat") ? true
      : t.tmode === m && (m !== "off" || t.mode !== "fan" || !list.includes("fan")));
    const modes = list.map((m) => ({ m, icon: MODE[m][0], label: MODE[m][1], cur: lit(m) }));
    const fans = (Array.isArray(o.fans) ? o.fans : []).filter((m) => Object.hasOwn(FAN, m)).map((m) => ({ m, label: FAN[m], cur: t.fan === m }));
    const curMode = modes.find((x) => x.cur) || (t.tmode && MODE[t.tmode] ? { m: t.tmode, icon: MODE[t.tmode][0], label: MODE[t.tmode][1] } : { m: t.mode, icon: (MODE[t.mode] || MODE.off)[0], label: (MODE[t.mode] || MODE.off)[1] });
    return { c, o, t, tid, tgt, set, now: t.temp, st, run, word, hum, modes, fans, curMode, auto, name: esc(o.title || t.name || T("thermo.title")) };
  }

  // ---------- shared pieces ----------
  const stepB = (M, d, cls = "") => `<button class="tl-b ${cls}" ${M.tgt ? Acts.on("tl.setpoint", M.tgt, d, M.tid) : "disabled"} aria-label="${d > 0 ? T("thermo.warmer") : T("thermo.cooler")}">${d > 0 ? "+" : "−"}</button>`;
  const setB = (M, which, d) => `<button class="tl-b"${Acts.on("tl.nudge", which, d)} aria-label="${esc(T(`tl.${which === "heat" ? "heat" : "cool"}${d > 0 ? "Warmer" : "Cooler"}`))}">${d > 0 ? "+" : "−"}</button>`;
  const modeB = (M, x, inner, cls = "") => `<button class="${cls} ${x.cur ? `cur ${x.m === "emergency heat" ? "heat" : x.m}` : ""}" ${Acts.on("tl.mode", x.m, M.tid)} aria-label="${esc(x.label)}" title="${esc(x.label)}">${inner}</button>`;
  // chips: icon + word · seg: words in one bar · icons: round icon buttons · dots: glass dots, the word under · words: chips without icons
  function modesHtml(M, kind = "chips") {
    if (!M.modes.length) return "";
    if (kind === "seg") return `<div class="tl-seg">${M.modes.map((x) => modeB(M, x, x.label)).join("")}</div>`;
    if (kind === "icons") return `<div class="tl-icons">${M.modes.map((x) => modeB(M, x, I(x.icon, 22), "tl-ib")).join("")}</div>`;
    if (kind === "dots") return `<div class="tl-dots">${M.modes.map((x) => `<div class="tl-dot">${modeB(M, x, I(x.icon, 20), "tl-gd")}<small>${x.label}</small></div>`).join("")}</div>`;
    if (kind === "stack") return `<div class="tl-chips tl-stack">${M.modes.map((x) => modeB(M, x, `${I(x.icon, 15)}${x.label}`, "tl-chip")).join("")}</div>`;
    return `<div class="tl-chips">${M.modes.map((x) => modeB(M, x, kind === "words" ? x.label : `${I(x.icon, 15)}${x.label}`, "tl-chip")).join("")}</div>`;
  }
  const fansHtml = (M) => (M.fans.length ? `<div class="tl-fan">${I("fan", 16)}<span>${esc(T("thermo.mode.fan"))}</span>${M.fans.map((x) => `<button class="tl-chip sm ${x.cur ? "cur fan" : ""}"${Acts.on("tl.fan", x.m, M.tid)}>${x.label}</button>`).join("")}</div>` : "");
  // a mode button that opens the list of modes (and the fan's): Big number, Stepper chip, One line
  const menuB = (M, cls = "") => (M.modes.length || M.fans.length ? `<button class="tl-chip tl-menu-b ${cls} ${M.curMode.m && M.modes.some((x) => x.cur) ? `cur ${M.st === "off" ? "" : M.st}` : ""}"${Acts.on("tl.menu")} aria-label="${esc(T("tl.mode"))}">${I(M.curMode.icon || "power", 15)}${esc(M.curMode.label || T("tl.mode"))} ▾</button>` : "");
  const nowLine = (M, lower) => T(M.hum != null ? (lower ? "tl.nowHumLower" : "tl.nowHum") : (lower ? "tl.nowLower" : "tl.now"), { t: deg(M.now), h: M.hum });
  // (inside an SVG drawing a <tspan>: an HTML <span> there would break out of the drawing)
  // the set point as shown; in Auto both, smaller (tl-rng): "68–76"
  const setNum = (M, svg) => {
    const tag = svg ? "tspan" : "span", v = (w) => `<${tag} data-tv="${w}">${deg(M.t[w])}</${tag}>`;
    return M.auto ? `<${tag} class="tl-rng">${v("heat")}–${v("cool")}</${tag}>` : M.tgt ? v(M.tgt) : deg(M.now);
  };
  // what the set point does, in words: "Heat to" / "Cool to" — "Auto" (keeping the room between both)
  const toWord = (M, heat = T("tl.heatTo"), cool = T("tl.coolTo")) => (M.auto ? T("thermo.mode.auto") : M.tgt === "cool" ? cool : heat);
  const uid = (M) => String(M.c.i).replace(/[^a-z0-9]/gi, "");

  // ---------- the looks ----------
  const DRAW = {
    // 1 · a round display with ticks, lit from the room's temperature to the set point; drag around the ring
    halo(M) {
      const ticks = [];
      for (let v = LO; v <= HI; v += 1) { const a = -135 + frac(v) * 270, big = v % 5 === 0, [x0, y0] = P(130, 130, big ? 103 : 107, a), [x1, y1] = P(130, 130, 117, a);
        ticks.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" class="${big ? "big" : ""}"/>`); }
      return `<div class="tl-dial" data-tdrag="ring"><svg viewBox="0 0 260 260"><circle cx="130" cy="130" r="122" class="tl-halo-glow"/><circle cx="130" cy="130" r="96" class="tl-disc"/>
          <g class="tl-ticks">${ticks.join("")}</g><path d="${arc(130, 130, 112, -135, 135)}" pathLength="100" class="tl-lit"/>
          <g class="tl-rot tl-rn"><circle cx="130" cy="42" r="4" class="tl-nowdot"/></g>${M.tgt ? `<g class="tl-rot tl-rk"><circle cx="130" cy="18" r="9" class="tl-thumbc"/></g>` : ""}
          <text x="130" y="92" class="tl-word">${M.word.toUpperCase()}</text><text x="130" y="162" class="tl-big">${setNum(M, true)}°</text>
          <text x="130" y="190" class="tl-sub">${M.tgt ? nowLine(M) : esc(M.word)}</text></svg></div>
        <div class="tl-row">${stepB(M, -1, "acc")}<span class="tl-name">${M.name}</span>${stepB(M, 1, "acc")}</div>${modesHtml(M)}${fansHtml(M)}`;
    },
    // 2 · an arc with a knob on the set point; status icons under the number; icon-only mode buttons
    knob(M) {
      const g = `tlg${uid(M)}`;
      return `<div class="tl-head"><span class="tl-name">${M.name}</span></div>
        <div class="tl-dial" data-tdrag="ring"><svg viewBox="0 0 240 230"><defs><linearGradient id="${g}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" class="tl-s0"/><stop offset="1" class="tl-s1"/></linearGradient></defs>
          <path d="${arc(120, 120, 92, -135, 135)}" class="tl-track"/>${M.tgt ? `<path d="${arc(120, 120, 92, -135, 135)}" pathLength="100" class="tl-fill" style="stroke:url(#${g})"/>
          <g class="tl-rot tl-rk"><circle cx="120" cy="28" r="12" class="tl-thumbc"/></g>` : ""}<g class="tl-rot tl-rn"><line x1="120" y1="16" x2="120" y2="40" class="tl-nowl"/></g>
          <g transform="translate(78 64)" class="tl-stc">${I(M.st === "cool" ? "snow" : M.st === "off" ? "power" : M.st === "fan" ? "fan" : "flame", 16)}</g><text x="99" y="77" class="tl-word l">${esc(M.word)}</text>
          <text x="120" y="140" class="tl-big">${setNum(M, true)}°</text>
          <g transform="translate(${M.hum != null ? 66 : 94} 156)" class="tl-mut">${I("thermo", 15)}</g><text x="${M.hum != null ? 84 : 112}" y="168" class="tl-sub l">${deg(M.now)}°</text>
          ${M.hum != null ? `<g transform="translate(122 156)" class="tl-hum">${I("drop", 15)}</g><text x="140" y="168" class="tl-sub l">${M.hum} %</text>` : ""}</svg>
          <div class="tl-gap">${stepB(M, -1, "ghost")}${stepB(M, 1, "ghost")}</div></div>${modesHtml(M, "icons")}${fansHtml(M)}`;
    },
    // 3 · a wide card: room and set point side by side, slide along the bar
    slider(M) {
      return `<div class="tl-head"><span class="tl-badge">${I(M.st === "cool" ? "snow" : M.st === "off" ? "power" : M.st === "fan" ? "fan" : "flame", 20)}</span>
          <div class="tl-hd"><span class="tl-name">${M.name}</span><small>${esc(M.hum != null ? T("tl.humidity", { word: M.word, h: M.hum }) : M.word)}</small></div></div>
        <div class="tl-two"><div><small>${esc(T("tl.inRoom"))}</small><b class="tl-n">${deg(M.now)}°</b></div><div class="r"><small>${M.auto ? T("thermo.mode.auto") : T("tl.setTo")}</small><b class="tl-n tl-setc">${M.tgt ? `${setNum(M)}°` : T("thermo.mode.off")}</b></div></div>
        <div class="tl-bar" data-tdrag="bar"><i class="tl-bt"></i>${M.tgt ? `<i class="tl-bf"></i>` : ""}<div class="tl-mv tl-mn"><i class="tl-tri"></i></div>${M.tgt ? `<div class="tl-mv tl-mk"><i class="tl-thumb"></i></div>` : ""}</div>
        <div class="tl-scale"><span>${LO}°</span><span>${esc(T("tl.nowMark", { t: deg(M.now) }))}</span><span>${HI}°</span></div>${modesHtml(M, "seg")}${fansHtml(M)}`;
    },
    // 4 · a tall thermometer: the column is the room, the arrow the set point (drag along the tube)
    mercury(M) {
      const y = (v) => 240 - frac(v) * 210, marks = [];
      for (let v = LO; v <= HI; v += 10) marks.push(`<line x1="50" y1="${y(v)}" x2="58" y2="${y(v)}" class="tl-mk-l"/><text x="62" y="${y(v) + 4}" class="tl-mk-t">${v}</text>`);
      return `<div class="tl-tube" data-tdrag="vbar"><svg viewBox="0 0 84 300"><rect x="24" y="20" width="22" height="240" rx="11" class="tl-glass"/>
          <rect x="29" y="${y(M.now).toFixed(1)}" width="12" height="${(262 - y(M.now)).toFixed(1)}" rx="6" class="tl-merc"/><circle cx="35" cy="268" r="20" class="tl-merc tl-bulb"/>${marks.join("")}
          ${M.tgt ? `<g class="tl-vk"><path d="M4 23l14 7-14 7z" class="tl-arrow"/><line x1="18" y1="30" x2="50" y2="30" class="tl-dash"/></g>` : ""}</svg></div>
        <div class="tl-side"><span class="tl-name">${M.name}</span><div><b class="tl-n">${deg(M.now)}°</b><small>${esc(T("tl.inRoomLower"))}</small></div>
          <div class="tl-setline">${M.auto ? `${I("auto", 16)}${M.run ? (M.run === "cool" ? T("tl.cooling") : T("tl.heating")) : T("thermo.mode.auto")} · <b>${setNum(M)}°</b>`
            : M.tgt ? `${I(M.tgt === "cool" ? "snow" : "flame", 16)}${esc(T("tl.toSet", { word: M.run ? T(M.tgt === "cool" ? "tl.cooling" : "tl.heating") : T(M.tgt === "cool" ? "thermo.mode.cool" : "thermo.mode.heat") }))} <b>${setNum(M)}°</b>` : esc(M.word)}</div>
          ${M.hum != null ? `<div class="tl-sub2"><span class="tl-hum">${I("drop", 15)}</span>${M.hum} %</div>` : ""}
          <div class="tl-row l">${stepB(M, -1, "acc")}${stepB(M, 1, "acc")}</div>${modesHtml(M, "stack")}${fansHtml(M)}</div>`;
    },
    // 5 · the set point as big as it goes; the card glows warm while heating, cool while cooling
    bignum(M) {
      return `<div class="tl-head"><span class="tl-name m">${M.name}</span><span class="tl-pill">${I(M.st === "cool" ? "snow" : M.st === "off" ? "power" : M.st === "fan" ? "fan" : "flame", 13)}${esc(M.word)}</span></div>
        <div class="tl-mid"><small class="tl-cap">${M.tgt ? toWord(M).toUpperCase() : "IN THE ROOM"}</small><div class="tl-huge">${setNum(M)}<sup>°</sup></div><small>${M.tgt ? nowLine(M) : esc(M.word)}</small></div>
        <div class="tl-row">${stepB(M, -1, "ghost l")}${menuB(M)}${stepB(M, 1, "ghost l")}</div>`;
    },
    // 6 · a pill: fits a 1-high strip; the round mode button opens the list
    stepper(M) {
      return `<div class="tl-pillrow"><button class="tl-modeb"${Acts.on("tl.menu")} aria-label="${esc(T("tl.modeIs", { mode: M.curMode.label || "" }))}">${I(M.curMode.icon || "power", 24)}</button>
          <div class="tl-hd"><span class="tl-name">${M.name}</span><small>${esc(M.word)} · ${deg(M.now)}°${M.hum != null ? ` · ${M.hum} %` : ""}</small></div>
          <div class="tl-cap2">${stepB(M, -1, "ghost")}<b class="tl-v">${M.tgt ? `${setNum(M)}°` : T("thermo.mode.off")}</b>${stepB(M, 1, "ghost")}</div></div>
        <div class="tl-more">${menuB(M)}${M.fans.length ? `<span class="tl-fanw">${fansHtml(M)}</span>` : ""}</div>`;
    },
    // 7 · Auto: keep the room between two temperatures — both ends drag on one bar, each has its own − / +
    range(M) {
      const t = M.t, under = M.now != null && M.now < t.heat, over = M.now != null && M.now > t.cool;
      return `<div class="tl-head"><span class="tl-name m">${M.name}</span><span class="tl-pill">${I(M.curMode.icon || "auto", 13)}${esc(M.curMode.label || M.word)}</span></div>
        <div class="tl-boxes"><div class="tl-box heat"><small>${I("flame", 13)} Heat at</small><div class="tl-row"><b class="tl-n"><span data-tv="heat">${deg(t.heat)}</span>°</b>${setB(M, "heat", -1)}${setB(M, "heat", 1)}</div></div>
          <div class="tl-box cool"><small>${I("snow", 13)} Cool at</small><div class="tl-row"><b class="tl-n"><span data-tv="cool">${deg(t.cool)}</span>°</b>${setB(M, "cool", -1)}${setB(M, "cool", 1)}</div></div></div>
        <div class="tl-bar tl-rng" data-tdrag="range"><i class="tl-bt"></i><i class="tl-bf2"></i><div class="tl-mv tl-mn"><i class="tl-tri"></i></div>
          <div class="tl-mv tl-mh"><i class="tl-thumb heat"></i></div><div class="tl-mv tl-mc"><i class="tl-thumb cool"></i></div></div>
        <div class="tl-scale"><span>${LO}°</span><span>${esc(T("tl.nowMark", { t: deg(M.now) }))}</span><span>${HI}°</span></div>
        <div class="tl-note">${under ? T.html("tl.under", { what: `<span class="tl-hc">${esc(T(M.run === "heat" ? "tl.heatingL" : "tl.willHeat"))}</span>` }, { t: deg(t.heat) }) : over ? T.html("tl.over", { what: `<span class="tl-cc">${esc(T(M.run === "cool" ? "tl.coolingL" : "tl.willCool"))}</span>` }, { t: deg(t.cool) }) : esc(T("tl.inRange"))}</div>
        ${modesHtml(M, "chips")}${fansHtml(M)}`;
    },
    // 8 · today: when the heat / cooling ran (as this panel saw it since midnight), the set point, − / +
    today(M) {
      const day = runLog(M), now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), pct = (m) => ((m / 1440) * 100).toFixed(2);
      const segs = day.segs.map((s, i) => { const end = i + 1 < day.segs.length ? day.segs[i + 1][0] : nm, w = end - s[0];
        return w <= 0 ? "" : `<i class="tl-sg ${s[1]}" style="left:${pct(s[0])}%;width:${pct(w)}%">${w >= 150 && s[2] != null ? `${s[2]}°` : ""}</i>`; }).join("");
      const ran = day.segs.reduce((n, s, i) => n + (/^(heat|cool)$/.test(s[1]) ? (i + 1 < day.segs.length ? day.segs[i + 1][0] : nm) - s[0] : 0), 0);
      const since = day.segs.length ? day.segs[day.segs.length - 1][0] : null, hm = (m) => { const h = Math.floor(m / 60), x = m % 60, ap = h >= 12 ? "pm" : "am"; return `${h % 12 || 12}${x ? `:${String(x).padStart(2, "0")}` : ""} ${ap}`; };
      const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
      return `<div class="tl-head"><b class="tl-n tl-setc">${M.tgt ? `${setNum(M)}°` : T("thermo.mode.off")}</b>
          <div class="tl-hd"><span class="tl-stl">${I(M.st === "cool" ? "snow" : M.st === "off" ? "power" : M.st === "fan" ? "fan" : "flame", 15)}${esc(T("tl.wordNow", { word: M.word, t: deg(M.now) }))}</span>
            <small>${esc(M.run && since != null ? T("tl.since", { what: T(M.run === "cool" ? "tl.cooling" : M.run === "fan" ? "tl.fanOn" : "tl.heating"), time: hm(since), dur: dur(ran) }) : T("tl.ran", { dur: dur(ran) }))}</small></div>
          ${stepB(M, -1, "ghost")}${stepB(M, 1, "ghost")}</div>
        <div class="tl-strip">${segs}${nm - (day.segs[0] || [nm])[0] < 30 ? `<span class="tl-strip-n">${esc(T("tl.watching", { time: hm((day.segs[0] || [nm])[0]) }))}</span>` : ""}<i class="tl-nowbar" style="left:${pct(nm)}%"></i></div>
        <div class="tl-hours"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span></div>
        <div class="tl-key"><i class="heat"></i>${esc(T("tl.heatingL"))} <i class="cool"></i>${esc(T("tl.coolingL"))} <i class="idle"></i>${esc(T("tl.waiting"))} <i class="off"></i>${esc(T("tl.offL"))}</div>
        ${modesHtml(M, "chips")}${fansHtml(M)}`;
    },
    // 9 · one line: a 1-high strip; small, only the numbers
    oneline(M) {
      return `<div class="tl-line"><span class="tl-ic">${I("thermo", 20)}</span><div class="tl-hd"><span class="tl-name">${M.name}</span><small>${deg(M.now)}°${M.hum != null ? ` · ${M.hum} %` : ""}</small></div>
          <span class="tl-short"><b>${deg(M.now)}°</b><span>→</span></span><span class="tl-stl">${I(M.st === "cool" ? "snow" : M.st === "off" ? "power" : M.st === "fan" ? "fan" : "flame", 14)}<span>${esc(M.word)}</span></span>
          ${stepB(M, -1, "ghost")}<b class="tl-v tl-setc">${M.tgt ? `${setNum(M)}°` : T("thermo.mode.off")}</b>${stepB(M, 1, "ghost")}</div>
        <div class="tl-more">${modesHtml(M, "chips")}${fansHtml(M)}</div>`;
    },
    // 10 · a glass orb whose colour is the state (amber heat, blue cool, grey off)
    orb(M) {
      return `<div class="tl-orbbox"><div class="tl-ball"><i class="tl-orbglow"></i><div class="tl-orbt"><small>${M.word.toUpperCase()}</small><b>${setNum(M)}°</b><small>${M.tgt ? esc(nowLine(M, true)) : M.hum != null ? `${M.hum} %` : ""}</small></div></div></div>
        <div class="tl-row c">${stepB(M, -1, "ghost")}<span class="tl-name">${M.name}</span>${stepB(M, 1, "ghost")}</div>${modesHtml(M, "dots")}${fansHtml(M)}`;
    },
    // 11 · inside and outside on one face (0–100 °F): the needle the room, the blue tick outside, the orange the set point
    gauge(M) {
      const cx = 150, cy = 150, r = 112, a = (v) => -90 + Math.max(0, Math.min(100, v)) * 1.8, segs = [];
      for (let i = 0; i < 20; i++) segs.push(`<path d="${arc(cx, cy, r, a(i * 5) + 0.8, a(i * 5 + 5) - 0.8)}" class="tl-gs" style="stroke:${gcol(i / 19)}"/>`);
      const out = outside(), line = (v, r0, r1, cls) => { const [x0, y0] = P(cx, cy, r0, a(v)), [x1, y1] = P(cx, cy, r1, a(v)); return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" class="${cls}"/>`; };
      const ol = out.temp != null ? P(cx, cy, r + 24, a(out.temp)) : null;
      return `<div class="tl-head"><span class="tl-name m">${M.name}</span><span class="tl-pill">${I(M.st === "cool" ? "snow" : M.st === "off" ? "power" : M.st === "fan" ? "fan" : "flame", 13)}${esc(M.word)}</span></div>
        <div class="tl-gbox"><svg viewBox="-12 0 324 182">${segs.join("")}<text x="${(P(cx, cy, r, a(0))[0] - 4).toFixed(1)}" y="172" class="tl-mk-t m">0°</text><text x="${(P(cx, cy, r, a(100))[0] + 4).toFixed(1)}" y="172" class="tl-mk-t m">100°</text>
          ${out.temp != null ? `${line(out.temp, r + 9, r - 14, "tl-out")}<text x="${ol[0].toFixed(1)}" y="${(ol[1] + 4).toFixed(1)}" class="tl-outt">${deg(out.temp)}°</text>` : ""}
          ${M.auto ? line(M.t.heat, r - 12, r + 12, "tl-setk") + line(M.t.cool, r - 12, r + 12, "tl-setk") : M.tgt ? line(M.set, r - 12, r + 12, "tl-setk") : ""}${M.now != null ? line(M.now, r - 44, r - 18, "tl-needle") : ""}
          <text x="${cx}" y="${cy - 14}" class="tl-big">${deg(M.now)}°</text><text x="${cx}" y="${cy + 6}" class="tl-sub">${esc(T("tl.inside"))}</text></svg></div>
        <div class="tl-two s">${out.temp != null ? `<span class="tl-cc">${I("cloud", 16)}${esc(T("tl.outside", { t: deg(out.temp) }))}${out.hi != null ? ` <small>${out.hi} / ${out.lo}</small>` : ""}</span>` : "<span></span>"}${M.hum != null ? `<span><span class="tl-hum">${I("drop", 14)}</span>${M.hum} %</span>` : ""}</div>
        <div class="tl-row">${stepB(M, -1, "ghost")}<span class="tl-setline">${M.tgt ? `${toWord(M)}${M.auto ? " ·" : ""} <b class="tl-setc">${setNum(M)}°</b>` : esc(M.word)}</span>${stepB(M, 1, "ghost")}</div>${modesHtml(M, "words")}${fansHtml(M)}`;
    },
    // 12 · two rings: the set point outside, the humidity (or, without one, the room) inside; the fan right there
    rings(M) {
      const k1 = M.tgt ? frac(M.set) : 0, k2 = M.hum != null ? M.hum / 100 : frac(M.now), g = `tlg${uid(M)}`;
      return `<div class="tl-head"><span class="tl-name m">${M.name}</span><span class="tl-stl">${I(M.st === "cool" ? "snow" : M.st === "off" ? "power" : M.st === "fan" ? "fan" : "flame", 15)}${esc(M.word)}</span></div>
        <div class="tl-pair"><div class="tl-rbox"><svg viewBox="0 0 190 190"><defs><linearGradient id="${g}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" class="tl-s0"/><stop offset="1" class="tl-s1"/></linearGradient></defs>
            <path d="${arc(95, 95, 80, -135, 135)}" class="tl-r1b"/><path d="${arc(95, 95, 80, -135, 135)}" pathLength="100" class="tl-r1" style="stroke:url(#${g});stroke-dasharray:${(k1 * 100).toFixed(1)}px 200px"/>
            <path d="${arc(95, 95, 60, -135, 135)}" class="tl-r2b"/><path d="${arc(95, 95, 60, -135, 135)}" pathLength="100" class="tl-r2" style="stroke-dasharray:${(k2 * 100).toFixed(1)}px 200px"/>
            <text x="95" y="101" class="tl-big">${setNum(M, true)}°</text><text x="95" y="123" class="tl-humt">${M.hum != null ? `${M.hum} %` : `now ${deg(M.now)}°`}</text></svg></div>
          <div class="tl-side"><div><small>${esc(T("tl.room"))}</small><b class="tl-n">${deg(M.now)}°</b></div><div><small>${M.auto ? T("thermo.mode.auto") : T("tl.setTo")}</small><b class="tl-n tl-setc">${M.tgt ? `${setNum(M)}°` : T("thermo.mode.off")}</b></div>
            <div class="tl-row l">${stepB(M, -1, "acc")}${stepB(M, 1, "acc")}</div></div></div>${fansHtml(M)}${modesHtml(M, "chips")}`;
    },
  };

  // the outside temperature: the house's own sensor, else the weather; today's high / low from the weather
  function outside() {
    const S = H.state.outside || {}, w = window.Weather && Weather.current ? Weather.current() : null, d0 = w && w.days && w.days[0];
    const temp = S.temp != null && !S.none ? S.temp : w && w.now ? w.now.temp : null;
    return { temp: Number.isFinite(+temp) && temp !== null ? +temp : null, hi: d0 ? d0.high : null, lo: d0 ? d0.low : null };
  }

  // today's run (the Today look): what the thermostat was doing, as this panel saw it — kept per thermostat for the
  // day in the browser (a reload keeps it; a new day starts empty). [[minute of the day, heat | cool | fan | idle | off, set point]]
  const logs = new Map();
  function runLog(M) {
    const key = `tl-run-${M.t.id}`, d = new Date(), day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`, nm = d.getHours() * 60 + d.getMinutes();
    let L = logs.get(key);
    if (!L) { try { L = JSON.parse(localStorage.getItem(key) || "null"); } catch { L = null; } }
    if (!L || L.day !== day || !Array.isArray(L.segs)) L = { day, segs: [] };
    const state = M.run || (M.tgt ? "idle" : M.t.mode === "fan" ? "fan" : "off"), set = M.tgt ? Math.round(M.set) : null, last = L.segs[L.segs.length - 1];
    if (!last || last[1] !== state || last[2] !== set) {
      if (last && last[0] === nm) L.segs.pop();
      L.segs.push([nm, state, set]);
      L.segs = L.segs.slice(-200);
      try { localStorage.setItem(key, JSON.stringify(L)); } catch {}
    }
    logs.set(key, L);
    return L;
  }

  // ---------- the card ----------
  const TL = { LOOKS: LOOKS.map(([id, name]) => [id, name]), has: (id) => BY.has(id), base: (id) => (BY.get(id) || [])[2] || null };
  TL.html = (c) => {
    const look = (c.o || {}).look;
    if (!BY.has(look)) return null;
    const M = model(c); if (!M) return null;
    const t = M.t, vars = `--tk:${frac(M.set).toFixed(3)};--tn:${frac(M.now).toFixed(3)};--th:${frac(t.heat).toFixed(3)};--tc:${frac(t.cool).toFixed(3)}`;
    return `<div class="tl tl-${look} st-${M.st}${M.run ? " run" : ""}${M.tgt ? "" : " noset"}" data-tl="${esc(c.i)}" style="${vars}">${DRAW[look](M)}</div>`;
  };
  const cardOf = (el) => { const r = el && el.closest(".tl"); return r && window.Grid && Grid.byId ? Grid.byId.get(r.dataset.tl) : null; };

  // the range look's − / +: one set point, kept 2° from the other
  TL.nudge = (btn, which, d) => {
    const c = cardOf(btn), M = c && model(c); if (!M) return;
    const v = M.t[which] + d;
    if (which === "heat" ? v > M.t.cool - 2 : v < M.t.heat + 2) return;
    H.setpoint(which, d, M.tid === "null" ? null : M.tid);
  };

  // the list of modes (and the fan's) from a mode button: a small menu by the button
  let menuEl = null, menuIdle = null;
  TL.closeMenu = () => { clearTimeout(menuIdle); if (menuEl) { menuEl.remove(); menuEl = null; } };
  TL.menu = (btn) => {
    const c = cardOf(btn), M = c && model(c); if (!M) return;
    if (menuEl) return TL.closeMenu();
    const r = btn.getBoundingClientRect();
    menuEl = document.createElement("div");
    menuEl.className = "tl-menu glass";
    menuEl.innerHTML = `${M.modes.map((x) => modeB(M, x, `${I(x.icon, 18)}${x.label}`, "tl-mi")).join("")}${M.fans.length ? `<div class="tl-mhd">${esc(T("thermo.mode.fan"))}</div>${M.fans.map((x) => `<button class="tl-mi ${x.cur ? "cur fan" : ""}"${Acts.on("tl.fan", x.m, M.tid)}>${I("fan", 18)}${x.label}</button>`).join("")}` : ""}`;
    document.body.appendChild(menuEl);
    const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    menuEl.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    menuEl.style.top = `${r.bottom + h + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
    menuEl.addEventListener("click", (e) => { if (e.target.closest("button")) setTimeout(TL.closeMenu, 0); });
    menuIdle = setTimeout(TL.closeMenu, 8000);
  };
  document.addEventListener("pointerdown", (e) => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest(".tl-menu-b, .tl-modeb")) TL.closeMenu(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") TL.closeMenu(); });

  // ---------- dragging the ring / the arc / the bars ----------
  // Only the drawing follows the finger (a CSS variable: --tk, --th or --tc, and the number); the set point is sent once,
  // on letting go (H.setTemp: clamped 50–90, the PIN / not-connected checks there). App.dragging keeps redraws off it.
  let drag = null;
  const valAt = (d, kind, e) => {
    const r = d.getBoundingClientRect();
    let f;
    if (kind === "ring") {
      // (the drawing is square in the middle of its box: its centre is the box's)
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      let a = (Math.atan2(dx, -dy) * 180) / Math.PI;   // (clockwise from 12 o'clock)
      if (a > 135) a = 135; if (a < -135) a = -135;
      f = (a + 135) / 270;
    } else if (kind === "vbar") f = (r.bottom - r.height * (60 / 300) - e.clientY) / (r.height * (210 / 300));   // (the tube's 50–90 part)
    else f = (e.clientX - r.left) / Math.max(1, r.width);
    return Math.round(LO + Math.max(0, Math.min(1, f)) * (HI - LO));
  };
  document.addEventListener("pointerdown", (e) => {
    const d = e.target.closest && e.target.closest("[data-tdrag]");
    if (!d || drag || e.target.closest("button") || (e.button != null && e.button > 0)) return;
    const c = cardOf(d), M = c && model(c); if (!M) return;
    const kind = d.dataset.tdrag;
    if (kind === "ring") {   // (only on the ring itself — not the number in the middle)
      const r = d.getBoundingClientRect(), s = Math.min(r.width, r.height) / 2, k = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / Math.max(1, s);
      if (k < 0.62 || k > 1.08) return;
    }
    let which = M.tgt;
    if (kind === "range") { const v = valAt(d, "bar", e); which = Math.abs(v - M.t.heat) <= Math.abs(v - M.t.cool) ? "heat" : "cool"; if (M.t.heat === M.t.cool) which = v < M.t.heat ? "heat" : "cool"; }
    if (!which) return;
    drag = { id: e.pointerId, d, root: d.closest(".tl"), M, kind, which, v: M.t[which] };
    App.dragging = true;
    try { d.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
    moveTo(e);
  });
  function moveTo(e) {
    let v = valAt(drag.d, drag.kind === "range" ? "bar" : drag.kind, e);
    if (drag.kind === "range") v = drag.which === "heat" ? Math.min(v, drag.M.t.cool - 2) : Math.max(v, drag.M.t.heat + 2);
    if (v === drag.v) return;
    drag.v = v;
    drag.root.style.setProperty(drag.kind === "range" ? (drag.which === "heat" ? "--th" : "--tc") : "--tk", frac(v).toFixed(3));
    drag.root.querySelectorAll(`[data-tv="${drag.which}"]`).forEach((n) => { n.textContent = v; });
  }
  document.addEventListener("pointermove", (e) => { if (drag && e.pointerId === drag.id) moveTo(e); });
  // (the drawing back to a value: the page's redraw only patches what changed since it last drew the card — a
  // drawing moved by hand that ends where it began, or a set point undone because the hub isn't connected, is put back here)
  const put = (g, v) => {
    g.root.style.setProperty(g.kind === "range" ? (g.which === "heat" ? "--th" : "--tc") : "--tk", frac(v).toFixed(3));
    g.root.querySelectorAll(`[data-tv="${g.which}"]`).forEach((n) => { n.textContent = deg(v); });
  };
  const end = (e, cancel) => {
    if (!drag || e.pointerId !== drag.id) return;
    const g = drag, was = g.M.t[g.which]; drag = null; App.dragging = false;
    if (!cancel && g.v !== was) {
      H.setTemp(g.which, g.v, g.M.t.id);   // (redraws)
      const c = cardOf(g.root), M = c && model(c);
      if (M && M.t[g.which] !== g.v) put(g, M.t[g.which]);   // (not sent — "Not connected to the hub": back as it was)
    } else put(g, was);
    App.render();
  };
  document.addEventListener("pointerup", (e) => end(e, false));
  document.addEventListener("pointercancel", (e) => end(e, true));

  // the looks' buttons (acts.js): + / −, a set point in Auto, the modes, the fan, the mode list
  Acts.add({
    "tl.setpoint": (tgt, d, tid) => Home.setpoint(tgt, d, tid), "tl.nudge": (which, d, el) => TL.nudge(el, which, d),
    "tl.mode": (m, tid) => App.mode(m, tid), "tl.fan": (m, tid) => App.fan(m, tid), "tl.menu": (el) => TL.menu(el),
  });
  window.ThermoLooks = TL;
})();
