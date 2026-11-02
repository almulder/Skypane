// Nest-style round thermostat (round 3: "halo" look chosen).
//   nestFace(t)            -> SVG (300x300 viewBox)
//   nestTempAt(x, y)       -> temperature for a point in viewBox coords (finger on the ring), or null near the centre
//   nestTarget(t)          -> "heat" | "cool" | null  (which setpoint the ring adjusts in this mode)
// t = { temp, heat, cool, mode: heat|cool|fan|off }
// "fan" = thermostat off + fan circulating (Hubitat: setThermostatMode off + setThermostatFanMode circulate).
(function () {
  const MIN = 50, MAX = 90, START = 120, SWEEP = 300; // degrees; 0° = 3 o'clock, clockwise
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const target = (t) => (t.mode === "heat" ? "heat" : t.mode === "cool" ? "cool" : null);
  const op = (t) => t.mode === "heat" && t.temp < t.heat ? "heating" : t.mode === "cool" && t.temp > t.cool ? "cooling" : t.mode;
  const ang = (f) => START + ((Math.min(MAX, Math.max(MIN, f)) - MIN) / (MAX - MIN)) * SWEEP;
  const pt = (a, r) => [150 + r * Math.cos((a * Math.PI) / 180), 150 + r * Math.sin((a * Math.PI) / 180)];

  function tempAt(x, y) {
    const dx = x - 150, dy = y - 150;
    if (Math.hypot(dx, dy) < 75) return null;
    let a = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (a < 0) a += 360;
    let rel = a - START; if (rel < 0) rel += 360;
    if (rel > SWEEP) rel = rel - SWEEP < (360 - SWEEP) / 2 ? SWEEP : 0; // dead zone at the bottom snaps to the nearest end
    return Math.round(MIN + (rel / SWEEP) * (MAX - MIN));
  }

  function ticks(t, o, glow) {
    const tgt = target(t), set = tgt ? t[tgt] : null;
    const lo = set == null ? null : Math.min(set, t.temp), hi = set == null ? null : Math.max(set, t.temp);
    let s = "";
    for (let i = 0, n = 100; i <= n; i++) {
      const a = START + (i / n) * SWEEP, f = MIN + (i / n) * (MAX - MIN);
      const on = lo != null && (o === "heating" || o === "cooling") ? f >= lo - 0.01 && f <= hi + 0.01 : set != null && Math.abs(f - set) < 0.25;
      const [x0, y0] = pt(a, 128), [x1, y1] = pt(a, on ? 112 : 116);
      s += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${on ? glow : "rgba(255,255,255,.18)"}" stroke-width="${on ? 2.6 : 1.6}" stroke-linecap="round"/>`;
    }
    const ca = ang(t.temp), [mx0, my0] = pt(ca, 130), [mx1, my1] = pt(ca, 106), [lx, ly] = pt(ca, 92);
    s += `<line x1="${mx0}" y1="${my0}" x2="${mx1}" y2="${my1}" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`;
    s += `<text x="${lx}" y="${ly + 5}" text-anchor="middle" font-size="15" fill="#fff" opacity=".9">${Math.round(t.temp)}</text>`;
    if (set != null) { const [hx, hy] = pt(ang(set), 120); s += `<circle cx="${hx}" cy="${hy}" r="11" fill="${glow}" stroke="#fff" stroke-width="3"/>`; }
    return s;
  }

  window.nestTarget = target;
  window.nestOp = op;
  window.nestTempAt = tempAt;
  window.nestFace = (t) => {
    // fixed id: the defs are the same for every dial, and a new id per call made the home screen's HTML differ on
    // every render, so App.render rebuilt the whole screen each time (lost taps, ~100 ms jank on the panel)
    const id = "nestdial", o = op(t);
    const glow = o === "heating" || t.mode === "heat" ? "#ff7a2f" : o === "cooling" || t.mode === "cool" ? "#3b9bff" : t.mode === "fan" ? "#34d399" : "#a78bfa";
    // (in Auto: both set points, the one the dial edits lit — a tap on the other picks it: app.js, data-side; heating /
    // cooling goes to the bottom line)
    const auto = t.tmode === "auto" && (t.mode === "heat" || t.mode === "cool");
    const LK = { heating: "nest.heating", cooling: "nest.cooling", heat: "nest.heat", cool: "nest.cool", fan: t.fan === "circulate" ? "nest.fanCirculate" : "nest.fanOn", off: "nest.off" }[o];
    const label = auto || !LK ? "" : esc(T(LK));
    // (an invisible taller rect around each chip: a finger-sized target — the chip itself is 28 tall)
    const sides = !auto ? "" : ["heat", "cool"].map((s, i) => `<g data-side="${s}" style="cursor:pointer">
        <rect x="${i ? 150 : 74}" y="85" width="76" height="44" fill="transparent"/>
        <rect x="${i ? 152 : 76}" y="93" width="72" height="28" rx="14" fill="${s === "heat" ? "#ff7a2f" : "#3b9bff"}" fill-opacity="${t.mode === s ? 0.45 : 0}" stroke="#fff" stroke-opacity="${t.mode === s ? 0.5 : 0.2}"/>
        <text x="${i ? 188 : 112}" y="112" text-anchor="middle" font-size="13" letter-spacing="1" fill="#fff" opacity="${t.mode === s ? 1 : 0.6}">${esc(T("nest.side", { mode: T(`nest.${s}`), t: Math.round(t[s]) }))}</text></g>`).join("");
    const tgt = target(t);
    const big = tgt ? t[tgt] : esc(T(t.mode === "fan" ? "nest.fan" : "nest.off"));
    return `<svg viewBox="0 0 300 300" font-family="'Segoe UI', system-ui, sans-serif"><defs>
        <radialGradient id="${id}f" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#1a1530"/><stop offset="1" stop-color="#05040b"/></radialGradient>
        <filter id="${id}g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter></defs>
      <circle cx="150" cy="150" r="141" fill="none" stroke="${glow}" stroke-width="10" opacity="${o === "heating" || o === "cooling" ? 0.9 : 0.55}" filter="url(#${id}g)"/>
      <circle cx="150" cy="150" r="140" fill="url(#${id}f)" stroke="${glow}" stroke-width="2" stroke-opacity=".9"/>
      ${ticks(t, o, glow)}
      <text x="150" y="112" text-anchor="middle" font-size="14" letter-spacing="2.5" fill="#fff" opacity=".75">${label}</text>
      <g class="nest-set" style="cursor:pointer"><circle cx="150" cy="152" r="60" fill="transparent"/>
        <text x="150" y="172" text-anchor="middle" font-size="62" font-weight="200" fill="#fff">${big}</text></g>${sides}
      <text x="150" y="208" text-anchor="middle" font-size="15" fill="#fff" opacity=".7">${esc(T(auto && (o === "heating" || o === "cooling") ? (o === "heating" ? "thermo.heatingInside" : "thermo.coolingInside") : "thermo.inside", { t: Math.round(t.temp) }))}</text></svg>`;
  };
})();
