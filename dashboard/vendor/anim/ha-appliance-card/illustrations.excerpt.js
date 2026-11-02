// EXCERPT (reference only, not loaded by the panel) from ha-appliance-card v2.36.0
// https://github.com/ADNPolymerase/ha-appliance-card  commit dbbf99900c509ca77c20bd8999c92cc230d286f5
// File dist/ha-appliance-card.js, lines 2890-2990 (SVG helpers) and 5735-10320 (illustration CSS + HTML).
// Copyright (c) 2026 ADNPolymerase, MIT License - see LICENSE next to this file. Copied unmodified.
// Uses Home Assistant CSS variables only as fallbacks (var(--x, default)); no hass object in these parts.

// ---- lines 2890-2990 ----

// The air lines a purifier and a fan blow: five of them, listed so that the
// first two, then three, are evenly spread; the speed hides the rest. Up, down
// or sideways, the dashes run from the start of each line to its end.
function windLines(cls, x, y, w, h, dir) {
  const at = [0.08, 0.92, 0.5, 0.29, 0.71];
  const line = (f) => {
    if (dir === "side") {
      const v = (h * f).toFixed(1);
      return `<path d="M1 ${v} C${w * 0.3} ${v - 4} ${w * 0.6} ${+v + 4} ${w - 1} ${v - 1}"/>`;
    }
    const u = (w * f).toFixed(1);
    return dir === "up"
      ? `<path d="M${u} ${h - 1} C${u - 4} ${h * 0.66} ${+u + 4} ${h * 0.33} ${u} 1"/>`
      : `<path d="M${u} 1 C${u - 4} ${h * 0.33} ${+u + 4} ${h * 0.66} ${u} ${h - 1}"/>`;
  };
  return `<svg class="wind ${cls}" style="left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px" viewBox="0 0 ${w} ${h}">${at.map(line).join("")}</svg>`;
}
// Blades round a hub, in an SVG of their own: an invisible circle keeps the
// group centred on the hub, so a turn does not make them wobble, and r0 lets
// them start at the rim of a motor rather than at its centre.
function fanBlades(cx, cy, n, len, w, r0) {
  return `<g class="fn-rot"><circle cx="${cx}" cy="${cy}" r="${r0 + len + w}" fill="none"/>`
    + Array.from({ length: n }, (_, k) => `<path class="fn-blade" transform="rotate(${k * 360 / n} ${cx} ${cy}) translate(0 ${-r0})" d="M${cx} ${cy} `
      + `C${cx - w} ${cy - len * 0.35} ${cx - w * 0.8} ${cy - len} ${cx + w * 0.25} ${cy - len} C${cx + w * 0.9} ${cy - len * 0.7} ${cx + w * 0.5} ${cy - len * 0.3} ${cx} ${cy}Z"/>`).join("")
    + `</g>`;
}
const AIR_COLORS = { off: "var(--disabled-text-color, #9e9e9e)", run: "#42a5f5", night: "#7986cb", heat: "#ff7043", offline: "var(--disabled-text-color, #9e9e9e)" };
// What the optional screen prints: a number without its unit, a temperature
// with its degree sign.
function airScreenOf(st) {
  if (!st || ["unknown", "unavailable"].includes(st.state)) return "";
  const n = parseFloat(st.state);
  if (!Number.isFinite(n)) return String(st.state).slice(0, 4);
  const unit = String((st.attributes || {}).unit_of_measurement || "");
  return /\u00b0/.test(unit) ? `${Math.round(n)}\u00b0` : String(Math.round(n));
}

// A fan on the ceiling, by its name in any language.
const FAN_CEILING_RE = /ceiling|plafond|decken|techo|soffitto|plafon|teto|takfl|takvif|loftvent|sufit|stropn|\u5438\u9876|\u540a\u6247|\u043f\u043e\u0442\u043e\u043b/;
// A towel warmer on a pilot wire, the French way of driving an electric
// radiator: comfort, eco, frost protection and off, plus the boost and the
// towel drying of Atlantic, Thermor and Acova. Heatzy and Atlantic say it in
// the climate entity's preset, NodOn in a select of its own.
const TW_MODES = ["off", "comfort", "eco", "frost", "boost", "drying"];
const TW_COLORS = {
  off: "var(--disabled-text-color, #9e9e9e)", comfort: "#ff7043", eco: "#9575cd", frost: "#29b6f6", boost: "#f4511e", drying: "#ff8a65",
};
const TW_LABELS = { off: "ac_off", comfort: "tw_comfort", eco: "tw_eco", frost: "tw_frost", boost: "tw_boost", drying: "tw_drying" };
const TW_ICONS = { comfort: "sun", eco: "moon", frost: "cool", boost: "rocket", drying: "laundry" };
function towelModeOf(raw) {
  if (raw === undefined || raw === null) return "";
  const f = stripAccents(String(raw).trim()).toLowerCase();
  if (["", "unknown", "unavailable", "none"].includes(f)) return "";
  if (/^(off|0|arret|stop|aus|uit|apagado|spento)$/.test(f)) return "off";
  if (/boost|turbo|max/.test(f)) return "boost";
  if (/dry|sech|trock|secad|asciug|droog|tork|susz/.test(f)) return "drying";
  if (/frost|hors.?gel|antigel|anti.?freeze|away|absen|vacation|holiday|vacanc|frostschutz/.test(f)) return "frost";
  if (/eco|night|nuit|reduced|reduit|moon|sleep/.test(f)) return "eco";
  if (/comfort|confort|komfort|^home$|^heat$|^on$/.test(f)) return "comfort";
  return "";
}

// The small screen and the air lines the dehumidifier and the two heaters
// share. Warm air rises; the air a dehumidifier or a fan blows goes the other
// way along the same lines.
const MINI_LCD_CSS = `
        .mini-lcd {
          position: absolute; height: 9px; padding: 0 1.5px; border-radius: 1.5px;
          display: flex; align-items: center; justify-content: center; gap: 1px;
          background: rgba(10, 14, 18, 0.88); color: #7fdcff; text-shadow: 0 0 2px currentColor;
          font: 700 6.5px/9px ui-monospace, "SF Mono", Menlo, monospace;
        }
        .mini-lcd svg { width: 7px; height: 7px; flex: none; fill: currentColor; }
        .mini-lcd span:empty { display: none; }
        .machine.mode-off .mini-lcd { display: none; }
        .air-flow { position: absolute; display: none; overflow: visible; }
        .air-flow path {
          fill: none; stroke-width: 2; stroke-linecap: round; stroke-dasharray: 4 5;
          animation: air-up 1.4s linear infinite; animation-delay: var(--anim-offset, 0s);
        }
        .air-flow path:nth-child(2) { animation-delay: calc(-0.45s + var(--anim-offset, 0s)); }
        .air-flow path:nth-child(3) { animation-delay: calc(-0.9s + var(--anim-offset, 0s)); }
        .air-flow.down path { animation-name: air-down; }
        @keyframes air-up { to { stroke-dashoffset: -18; } }
        @keyframes air-down { to { stroke-dashoffset: 18; } }
`;
function miniLcd(cls, icon, text) {
  const svg = AC_ICONS[icon] ? `<svg viewBox="0 0 24 24"><path d="${AC_ICONS[icon]}"/></svg>` : "";
  return `<div class="mini-lcd ${cls}">${svg}<span>${esc(text || "")}</span></div>`;
}
// Three wavy lines, drawn from the bottom up.
function airFlow(cls, w, h, down) {
  const line = (x) => `<path d="M${x} ${h} C${x - w * 0.1} ${h * 0.66} ${x + w * 0.1} ${h * 0.33} ${x} 0"/>`;
  return `<svg class="air-flow ${cls} ${down ? "down" : ""}" viewBox="0 0 ${w} ${h}">${line(w * 0.25)}${line(w * 0.5)}${line(w * 0.75)}</svg>`;
}

// Air fryer. Philips (HomeID and the older HACS integration), Xiaomi (MIoT)
// and Cosori (VeSync) each report their own firmware words, read here once,
// lowercased. What the table does not know falls back on the shared
// vocabulary. A Cosori "heating" is its preheat, and a stop there is the

// ---- lines 5735-10320 ----
const BODY_COLORS = {
  white: { body: "#f1f3f4", hi: "#ffffff", lo: "#d8dcde" },
  grey: { body: "#b6bbbf", hi: "#d0d5d8", lo: "#8e9498" },
  black: { body: "#3b4045", hi: "#515860", lo: "#22262a" },
  red: { body: "#7f2a2e", hi: "#9a383d", lo: "#5a1a1d" },
};

// A pet feeder's kibble, drawn once as two small tiles: the heap, and the loose
// pieces along its top. Generated, so each disc sits a little askew and no row
// lines up with the next.
const KIBBLE_TILE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='12'%3E%3Crect width='18' height='12' fill='%233a2211'/%3E%3Cg transform='translate(1.2 1.5) rotate(-2)'%3E%3Cellipse cy='0.6' rx='1.6' ry='0.9' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='0.9' fill='%23a67a52'/%3E%3C/g%3E%3Cg transform='translate(1.2 13.5) rotate(-2)'%3E%3Cellipse cy='0.6' rx='1.6' ry='0.9' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='0.9' fill='%23a67a52'/%3E%3C/g%3E%3Cg transform='translate(19.2 1.5) rotate(-2)'%3E%3Cellipse cy='0.6' rx='1.6' ry='0.9' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='0.9' fill='%23a67a52'/%3E%3C/g%3E%3Cg transform='translate(19.2 13.5) rotate(-2)'%3E%3Cellipse cy='0.6' rx='1.6' ry='0.9' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='0.9' fill='%23a67a52'/%3E%3C/g%3E%3Cg transform='translate(4.1 1) rotate(4)'%3E%3Cellipse cy='0.6' rx='1.7' ry='1.5' fill='%235a361e'/%3E%3Cellipse rx='1.7' ry='1.5' fill='%23a27449'/%3E%3C/g%3E%3Cg transform='translate(4.1 13) rotate(4)'%3E%3Cellipse cy='0.6' rx='1.7' ry='1.5' fill='%235a361e'/%3E%3Cellipse rx='1.7' ry='1.5' fill='%23a27449'/%3E%3C/g%3E%3Cg transform='translate(8 1.5) rotate(-8)'%3E%3Cellipse cy='0.6' rx='1.7' ry='1.2' fill='%235a361e'/%3E%3Cellipse rx='1.7' ry='1.2' fill='%23a27449'/%3E%3C/g%3E%3Cg transform='translate(8 13.5) rotate(-8)'%3E%3Cellipse cy='0.6' rx='1.7' ry='1.2' fill='%235a361e'/%3E%3Cellipse rx='1.7' ry='1.2' fill='%23a27449'/%3E%3C/g%3E%3Cg transform='translate(10.2 1.2) rotate(19)'%3E%3Cellipse cy='0.6' rx='1.8' ry='1.2' fill='%235a361e'/%3E%3Cellipse rx='1.8' ry='1.2' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(10.2 13.2) rotate(19)'%3E%3Cellipse cy='0.6' rx='1.8' ry='1.2' fill='%235a361e'/%3E%3Cellipse rx='1.8' ry='1.2' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(13.2 2) rotate(26)'%3E%3Cellipse cy='0.5' rx='1.5' ry='1.5' fill='%235a361e'/%3E%3Cellipse rx='1.5' ry='1.5' fill='%23976a44'/%3E%3C/g%3E%3Cg transform='translate(13.2 14) rotate(26)'%3E%3Cellipse cy='0.5' rx='1.5' ry='1.5' fill='%235a361e'/%3E%3Cellipse rx='1.5' ry='1.5' fill='%23976a44'/%3E%3C/g%3E%3Cg transform='translate(-1.5 1.7) rotate(-8)'%3E%3Cellipse cy='0.6' rx='1.8' ry='1.2' fill='%235a361e'/%3E%3Cellipse rx='1.8' ry='1.2' fill='%23a67a52'/%3E%3C/g%3E%3Cg transform='translate(-1.5 13.7) rotate(-8)'%3E%3Cellipse cy='0.6' rx='1.8' ry='1.2' fill='%235a361e'/%3E%3Cellipse rx='1.8' ry='1.2' fill='%23a67a52'/%3E%3C/g%3E%3Cg transform='translate(16.5 1.7) rotate(-8)'%3E%3Cellipse cy='0.6' rx='1.8' ry='1.2' fill='%235a361e'/%3E%3Cellipse rx='1.8' ry='1.2' fill='%23a67a52'/%3E%3C/g%3E%3Cg transform='translate(16.5 13.7) rotate(-8)'%3E%3Cellipse cy='0.6' rx='1.8' ry='1.2' fill='%235a361e'/%3E%3Cellipse rx='1.8' ry='1.2' fill='%23a67a52'/%3E%3C/g%3E%3Cg transform='translate(2.9 4.9) rotate(-37)'%3E%3Cellipse cy='0.6' rx='1.8' ry='1.8' fill='%235a361e'/%3E%3Cellipse rx='1.8' ry='1.8' fill='%23b98c65'/%3E%3C/g%3E%3Cg transform='translate(20.9 4.9) rotate(-37)'%3E%3Cellipse cy='0.6' rx='1.8' ry='1.8' fill='%235a361e'/%3E%3Cellipse rx='1.8' ry='1.8' fill='%23b98c65'/%3E%3C/g%3E%3Cg transform='translate(5.7 5) rotate(-6)'%3E%3Cellipse cy='0.6' rx='1.6' ry='1.4' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.4' fill='%23b98c65'/%3E%3C/g%3E%3Cg transform='translate(9.1 4.5) rotate(32)'%3E%3Cellipse cy='0.6' rx='1.6' ry='1.5' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.5' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(12.4 5) rotate(16)'%3E%3Cellipse cy='0.6' rx='1.7' ry='1.6' fill='%235a361e'/%3E%3Cellipse rx='1.7' ry='1.6' fill='%23976a44'/%3E%3C/g%3E%3Cg transform='translate(-2.5 4.9) rotate(11)'%3E%3Cellipse cy='0.6' rx='1.6' ry='1.6' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.6' fill='%23a67a52'/%3E%3C/g%3E%3Cg transform='translate(15.5 4.9) rotate(11)'%3E%3Cellipse cy='0.6' rx='1.6' ry='1.6' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.6' fill='%23a67a52'/%3E%3C/g%3E%3Cg transform='translate(-0.2 4.1) rotate(-33)'%3E%3Cellipse cy='0.6' rx='1.6' ry='1.1' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.1' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(17.8 4.1) rotate(-33)'%3E%3Cellipse cy='0.6' rx='1.6' ry='1.1' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.1' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(1.4 7.2) rotate(30)'%3E%3Cellipse cy='0.5' rx='1.6' ry='1.1' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.1' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(19.4 7.2) rotate(30)'%3E%3Cellipse cy='0.5' rx='1.6' ry='1.1' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.1' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(4.6 7.8) rotate(-14)'%3E%3Cellipse cy='0.6' rx='1.6' ry='0.9' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='0.9' fill='%23976a44'/%3E%3C/g%3E%3Cg transform='translate(7.5 8) rotate(-31)'%3E%3Cellipse cy='0.5' rx='1.6' ry='1.6' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.6' fill='%23a67a52'/%3E%3C/g%3E%3Cg transform='translate(10 7.2) rotate(-19)'%3E%3Cellipse cy='0.6' rx='1.6' ry='0.9' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='0.9' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(14 7.3) rotate(32)'%3E%3Cellipse cy='0.6' rx='1.6' ry='1.5' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.5' fill='%23b98c65'/%3E%3C/g%3E%3Cg transform='translate(-1.6 7.9) rotate(14)'%3E%3Cellipse cy='0.6' rx='1.6' ry='0.9' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='0.9' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(16.4 7.9) rotate(14)'%3E%3Cellipse cy='0.6' rx='1.6' ry='0.9' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='0.9' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(3.1 -1.1) rotate(11)'%3E%3Cellipse cy='0.6' rx='1.6' ry='1.1' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.1' fill='%23a27449'/%3E%3C/g%3E%3Cg transform='translate(3.1 10.9) rotate(11)'%3E%3Cellipse cy='0.6' rx='1.6' ry='1.1' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.1' fill='%23a27449'/%3E%3C/g%3E%3Cg transform='translate(6.4 -1.6) rotate(4)'%3E%3Cellipse cy='0.5' rx='1.5' ry='1.3' fill='%235a361e'/%3E%3Cellipse rx='1.5' ry='1.3' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(6.4 10.4) rotate(4)'%3E%3Cellipse cy='0.5' rx='1.5' ry='1.3' fill='%235a361e'/%3E%3Cellipse rx='1.5' ry='1.3' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(9.3 -1) rotate(9)'%3E%3Cellipse cy='0.5' rx='1.6' ry='1.1' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.1' fill='%23a27449'/%3E%3C/g%3E%3Cg transform='translate(9.3 11) rotate(9)'%3E%3Cellipse cy='0.5' rx='1.6' ry='1.1' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.1' fill='%23a27449'/%3E%3C/g%3E%3Cg transform='translate(11.6 -1.4) rotate(9)'%3E%3Cellipse cy='0.6' rx='1.6' ry='1.4' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.4' fill='%23976a44'/%3E%3C/g%3E%3Cg transform='translate(11.6 10.6) rotate(9)'%3E%3Cellipse cy='0.6' rx='1.6' ry='1.4' fill='%235a361e'/%3E%3Cellipse rx='1.6' ry='1.4' fill='%23976a44'/%3E%3C/g%3E%3Cg transform='translate(-2.8 -2) rotate(37)'%3E%3Cellipse cy='0.5' rx='1.5' ry='1.5' fill='%235a361e'/%3E%3Cellipse rx='1.5' ry='1.5' fill='%23976a44'/%3E%3C/g%3E%3Cg transform='translate(-2.8 10) rotate(37)'%3E%3Cellipse cy='0.5' rx='1.5' ry='1.5' fill='%235a361e'/%3E%3Cellipse rx='1.5' ry='1.5' fill='%23976a44'/%3E%3C/g%3E%3Cg transform='translate(15.2 -2) rotate(37)'%3E%3Cellipse cy='0.5' rx='1.5' ry='1.5' fill='%235a361e'/%3E%3Cellipse rx='1.5' ry='1.5' fill='%23976a44'/%3E%3C/g%3E%3Cg transform='translate(15.2 10) rotate(37)'%3E%3Cellipse cy='0.5' rx='1.5' ry='1.5' fill='%235a361e'/%3E%3Cellipse rx='1.5' ry='1.5' fill='%23976a44'/%3E%3C/g%3E%3Cg transform='translate(0.1 -1.7) rotate(-11)'%3E%3Cellipse cy='0.6' rx='1.7' ry='1.6' fill='%235a361e'/%3E%3Cellipse rx='1.7' ry='1.6' fill='%23976a44'/%3E%3C/g%3E%3Cg transform='translate(0.1 10.3) rotate(-11)'%3E%3Cellipse cy='0.6' rx='1.7' ry='1.6' fill='%235a361e'/%3E%3Cellipse rx='1.7' ry='1.6' fill='%23976a44'/%3E%3C/g%3E%3Cg transform='translate(18.1 -1.7) rotate(-11)'%3E%3Cellipse cy='0.6' rx='1.7' ry='1.6' fill='%235a361e'/%3E%3Cellipse rx='1.7' ry='1.6' fill='%23976a44'/%3E%3C/g%3E%3Cg transform='translate(18.1 10.3) rotate(-11)'%3E%3Cellipse cy='0.6' rx='1.7' ry='1.6' fill='%235a361e'/%3E%3Cellipse rx='1.7' ry='1.6' fill='%23976a44'/%3E%3C/g%3E%3C/svg%3E\")";
const KIBBLE_TOP = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='4'%3E%3Cg transform='translate(1.6 1.2) rotate(-38)'%3E%3Cellipse cy='0.6' rx='1.7' ry='1' fill='%235a361e'/%3E%3Cellipse rx='1.7' ry='1' fill='%23b98c65'/%3E%3C/g%3E%3Cg transform='translate(19.6 1.2) rotate(-38)'%3E%3Cellipse cy='0.6' rx='1.7' ry='1' fill='%235a361e'/%3E%3Cellipse rx='1.7' ry='1' fill='%23b98c65'/%3E%3C/g%3E%3Cg transform='translate(4.8 1.9) rotate(-31)'%3E%3Cellipse cy='0.5' rx='1.5' ry='1.4' fill='%235a361e'/%3E%3Cellipse rx='1.5' ry='1.4' fill='%23b98c65'/%3E%3C/g%3E%3Cg transform='translate(7.9 1.7) rotate(-39)'%3E%3Cellipse cy='0.5' rx='1.5' ry='1.4' fill='%235a361e'/%3E%3Cellipse rx='1.5' ry='1.4' fill='%23a27449'/%3E%3C/g%3E%3Cg transform='translate(10.4 1.9) rotate(-27)'%3E%3Cellipse cy='0.6' rx='1.8' ry='1.2' fill='%235a361e'/%3E%3Cellipse rx='1.8' ry='1.2' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(13.1 1.3) rotate(38)'%3E%3Cellipse cy='0.5' rx='1.5' ry='1.5' fill='%235a361e'/%3E%3Cellipse rx='1.5' ry='1.5' fill='%23b0835c'/%3E%3C/g%3E%3Cg transform='translate(-1.8 1.9) rotate(-17)'%3E%3Cellipse cy='0.6' rx='1.8' ry='1.7' fill='%235a361e'/%3E%3Cellipse rx='1.8' ry='1.7' fill='%23a27449'/%3E%3C/g%3E%3Cg transform='translate(16.2 1.9) rotate(-17)'%3E%3Cellipse cy='0.6' rx='1.8' ry='1.7' fill='%235a361e'/%3E%3Cellipse rx='1.8' ry='1.7' fill='%23a27449'/%3E%3C/g%3E%3C/svg%3E\")";

const ILLUSTRATION_CSS = {
  printer_3d: (color) => `
        .p3-case {
          position: absolute; left: 6px; right: 6px; top: 2px; bottom: 5px; border-radius: 6px;
          background: linear-gradient(160deg, var(--ac-body-hi, #e6e6e6), var(--ac-body, var(--secondary-background-color, #d7d7d7)) 45%, var(--ac-body-lo, #aeb2b5));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .p3-window {
          position: absolute; left: 6px; right: 6px; top: 6px; bottom: 18px; border-radius: 3px; overflow: hidden;
          background: #1b1e23; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
        }
        .machine.lit .p3-window { background: #2b3038; box-shadow: inset 0 6px 12px rgba(255, 236, 179, 0.35); }
        .p3-glass { position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255, 255, 255, 0.10), transparent 45%); pointer-events: none; }
        .p3-rail { position: absolute; left: 3px; right: 3px; top: 8px; height: 3px; border-radius: 1px; background: #5f666e; }
        .p3-head {
          position: absolute; left: 50%; top: 4px; width: 14px; height: 12px; margin-left: -7px; z-index: 2;
          border-radius: 2px; background: linear-gradient(180deg, #e0e3e6, #aab0b6);
        }
        .p3-nozzle {
          position: absolute; left: 3px; bottom: -4px; width: 0; height: 0;
          border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 4px solid #8a9096;
        }
        .machine.nozzle-hot .p3-nozzle { border-top-color: #ff7043; }
        .p3-enclosed .p3-bed {
          position: absolute; left: 8px; right: 8px; top: calc(21px + var(--p3-h, 0px)); height: 4px; border-radius: 1px;
          background: #8f969d;
        }
        .p3-enclosed.parked .p3-bed { top: auto; bottom: 8px; }
        .machine.bed-hot .p3-bed { background: linear-gradient(180deg, #ffab91, #ff7043); box-shadow: 0 0 6px rgba(255, 112, 67, 0.55); }
        .p3-part {
          position: absolute; left: 50%; bottom: 100%; width: 26px; margin-left: -13px; height: var(--p3-h, 0px);
          overflow: hidden;
        }
        .p3-shape {
          position: absolute; left: 0; bottom: 0; width: 100%; height: 40px; border-radius: 1px 1px 0 0;
          background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 3px), ${color};
        }
        .p3-part i { position: absolute; left: 0; right: 0; bottom: calc(var(--p3-h, 0px) - 2px); height: 2px; opacity: 0; background: rgba(255, 255, 255, 0.85); }
        .p3-part-pyramid .p3-part { width: 32px; margin-left: -16px; }
        .p3-part-pyramid .p3-shape { border-radius: 0; clip-path: polygon(50% 0, 100% 100%, 0 100%); }
        /* A rubber duck in one outline: tail, head, beak, and a round front. */
        .p3-part-duck .p3-part { width: 34px; margin-left: -17px; }
        .p3-part-duck .p3-shape {
          border-radius: 0;
          clip-path: path("M1 20 L10 24 Q13 23 15 20 C12 14 15 5 22 5 C27 5 29 8 29.5 10 L34 12.5 L34 14 L29.5 16 Q28 19 25 21 C31 22 33 26 33 30 C33 37 27 40 17 40 C7 40 2 36 2 31 C2 27 1 24 1 20 Z");
        }
        .p3-eye { position: absolute; left: 22px; top: 9px; width: 3px; height: 3px; border-radius: 50%; background: rgba(0, 0, 0, 0.55); }
        .p3-lcd {
          position: absolute; left: 10px; bottom: 4px; width: 30px; height: 9px; border-radius: 2px;
          background: #14161a; color: #4fc3f7; text-align: center; font: 600 7px/9px ui-monospace, "SF Mono", monospace;
        }
        .p3-knob { position: absolute; right: 10px; bottom: 5px; width: 7px; height: 7px; border-radius: 50%; background: #3b4048; }
        .p3-foot { position: absolute; bottom: 1px; width: 12px; height: 4px; border-radius: 0 0 2px 2px; background: #3b4048; }
        .p3-foot.f1 { left: 14px; }
        .p3-foot.f2 { right: 14px; }
        /* Open frame: two uprights and a top bar, a gantry that climbs with the
           part, and a bed on the base. */
        .p3-post { position: absolute; top: 6px; bottom: 17px; width: 4px; border-radius: 1px; background: #5f666e; }
        .p3-post.l { left: 12px; }
        .p3-post.r { right: 12px; }
        .p3-top { position: absolute; left: 12px; right: 12px; top: 6px; height: 4px; border-radius: 1px; background: #5f666e; }
        .p3-gantry { position: absolute; left: 12px; right: 12px; height: 16px; bottom: calc(22px + var(--p3-h, 0px)); }
        .p3-gantry::before { content: ""; position: absolute; left: 0; right: 0; top: 4px; height: 3px; border-radius: 1px; background: #5f666e; }
        .p3-gantry .p3-head { top: 0; }
        .p3-open .p3-bed { position: absolute; left: 18px; right: 18px; bottom: 18px; height: 4px; border-radius: 1px; background: #8f969d; }
        .p3-base {
          position: absolute; left: 6px; right: 6px; bottom: 3px; height: 14px; border-radius: 3px;
          background: linear-gradient(160deg, var(--ac-body-hi, #e6e6e6), var(--ac-body, var(--secondary-background-color, #d7d7d7)) 45%, var(--ac-body-lo, #aeb2b5));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .p3-base .p3-lcd { bottom: 2px; }
        .p3-base .p3-knob { bottom: 3px; }
        @keyframes p3-move { from { transform: translateX(-14px); } to { transform: translateX(14px); } }
        @keyframes p3-draw { 0% { opacity: 0; } 30% { opacity: 0.9; } 100% { opacity: 0; } }
        .machine.moving .p3-head { animation: p3-move 1.6s ease-in-out infinite alternate; animation-delay: var(--anim-offset, 0s); }
        .machine.moving.has-part .p3-part i { animation: p3-draw 1.6s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
      `,
  laundry: (color) => `
        .mbody {
          position: absolute; inset: 0; border-radius: 10px;
          background: var(--ac-body, var(--secondary-background-color, #d7d7d7));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .mpanel {
          position: absolute; top: 6px; left: 8px; right: 8px; height: 10px;
          border-radius: 4px; background: var(--divider-color, #bdbdbd);
        }
        .mknob {
          position: absolute; top: 8px; right: 10px; width: 6px; height: 6px;
          border-radius: 50%; background: var(--disabled-text-color, #9e9e9e);
        }
        .mknob.k2 { right: 20px; }
        .bezel-wrap {
          position: absolute; left: 50%; top: 62%; transform: translate(-50%, -50%);
          width: 64px; height: 64px; perspective: 220px;
        }
        .drum-hole { position: absolute; inset: 0; border-radius: 50%; background: #14161a; }
        .door {
          position: absolute; inset: 0; border-radius: 50%;
          background: var(--divider-color, #b0b0b0);
          box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.15);
          transform-origin: left center; transform: rotateY(0deg);
          transition: transform 0.4s ease;
        }
        .door.ajar { transform: rotateY(50deg); }
        .rim { position: absolute; inset: 5px; border-radius: 50%; background: #2b2f36; }
        .glass {
          position: absolute; inset: 6px; border-radius: 50%; overflow: hidden;
          background: rgba(140, 180, 220, 0.18);
        }
        .water-level { position: absolute; left: 0; right: 0; bottom: 0; height: 55%; overflow: hidden; }
        .wave {
          position: absolute; left: -58%; top: 39%; width: 170%; height: 266%;
          background: ${color}; opacity: 0.85;
          transition: background 1s linear;
        }
        .wave.wave2 { opacity: 0.45; }
        .machine.spinning .wave { border-radius: 58%; animation: waterspin 6s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.spinning .wave.wave2 { animation: waterspin 8s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        @keyframes waterspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .garments { position: absolute; inset: 0; }
        .garment {
          position: absolute; width: 22px; height: 27px; border-radius: 40px;
          background: ${color}; opacity: 0.85; transition: background 1s linear;
        }
        .garment.g1 { top: 29px; left: -6px; }
        .machine.spinning .garment.g1 { top: -5px; left: -12px; }
        .garment.g2 { top: 24px; left: 32px; transform: rotate(15deg); opacity: 0.5; }
        .garment.g3 { top: 33px; left: 13px; transform: rotate(-25deg); }
        .machine.spinning .garments { animation: tumble 2.6s linear infinite; animation-delay: var(--anim-offset, 0s); }
        @keyframes tumble { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        /* Spinning: the load whirls against the drum, several times faster
           than the wash turns it. */
        .machine.spinning.spin-cycle .garments { animation-duration: 0.7s; }
        /* Drying, on a washer-dryer: the drum is empty of water and warm, so
           the glass loses its cold cast and three wisps rise behind the load. */
        .machine.drying .glass { box-shadow: inset 0 0 12px rgba(255, 112, 67, 0.85); }
        .wd-heat { position: absolute; inset: 0; z-index: 0; }
        .wd-heat i {
          position: absolute; bottom: 2px; width: 5px; height: 16px; opacity: 0;
          background: linear-gradient(180deg, rgba(255, 183, 77, 0), rgba(255, 128, 40, 0.95));
          border-radius: 50% 50% 40% 40%; filter: blur(0.6px);
        }
        .wd-heat i:nth-child(1) { left: 26%; }
        .wd-heat i:nth-child(2) { left: 48%; height: 21px; }
        .wd-heat i:nth-child(3) { left: 68%; height: 14px; }
        .machine.drying .wd-heat i { animation: wd-rise 2.8s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.drying .wd-heat i:nth-child(2) { animation-delay: calc(-0.93s + var(--anim-offset, 0s)); }
        .machine.drying .wd-heat i:nth-child(3) { animation-delay: calc(-1.86s + var(--anim-offset, 0s)); }
        @keyframes wd-rise {
          0% { opacity: 0; transform: translateY(4px) scaleY(0.7); }
          35% { opacity: 0.9; }
          100% { opacity: 0; transform: translateY(-18px) scaleY(1.15); }
        }
  `,
  dishwasher: (color) => `
        /* A dishwasher is front-loading, but its door hinges at the bottom.
           Keep the same compact, CSS-only visual language as the other types. */
        .dw-body {
          position: absolute; inset: 0; border-radius: 10px 10px 6px 6px;
          background: linear-gradient(145deg, var(--ac-body, var(--secondary-background-color, #d7d7d7)), var(--ac-body-lo, #aeb2b5));
          border: 1px solid var(--divider-color, #c7c7c7);
          perspective: 260px;
        }
        .dw-controls {
          position: absolute; top: 6px; left: 8px; right: 8px; height: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 3px;
          background: rgba(20, 22, 23, 0.78);
        }
        .dw-controls::before,
        .dw-controls::after {
          content: ""; position: absolute; top: 3px; width: 4px; height: 4px;
          border-radius: 50%; background: #697078;
        }
        .dw-controls::before { right: 5px; }
        .dw-controls::after { right: 12px; }
        .dw-screen {
          position: absolute; top: 2px; left: 4px; width: 24px; height: 6px;
          border-radius: 2px; background: #16292e;
          box-shadow: inset 0 0 0 1px rgba(129, 213, 205, 0.3);
        }
        .dw-cavity {
          position: absolute; top: 22px; right: 8px; bottom: 8px; left: 8px;
          overflow: hidden; border: 3px solid #34383b; border-radius: 4px;
          background: linear-gradient(180deg, #33474f, #7d8f95);
          box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.34);
        }
        .machine.done .dw-plate {
          border-color: #b9f6ca;
          background: linear-gradient(90deg, transparent 0 22%, rgba(185, 246, 202, 0.62) 50%, transparent 78%);
          box-shadow: inset 0 0 0 1px rgba(185, 246, 202, 0.55), 0 0 8px rgba(105, 240, 174, 0.65);
        }
        .dw-rack {
          position: absolute; right: 10%; bottom: 13%; left: 10%; height: 34%;
          border-top: 1px solid rgba(222, 232, 235, 0.76);
          border-bottom: 1px solid rgba(222, 232, 235, 0.5);
          background: repeating-linear-gradient(90deg, transparent 0 7px, rgba(222, 232, 235, 0.58) 8px 9px);
          transform: perspective(100px) rotateX(18deg);
        }
        .dw-dishes {
          position: absolute; right: 15%; bottom: 17%; left: 15%; z-index: 1; height: 43%;
        }
        .dw-plate {
          position: absolute; bottom: 0; width: 9px; height: 18px;
          border: 1px solid rgba(240, 242, 244, 0.62); border-radius: 50%;
          background: linear-gradient(90deg, transparent 0 28%, rgba(240, 242, 244, 0.14) 50%, transparent 72%);
          box-shadow: inset 0 0 0 1px rgba(240, 242, 244, 0.12);
        }
        .dw-plate-a { left: 0; transform: rotate(-12deg); }
        .dw-plate-b { left: 23%; transform: rotate(-5deg); }
        .dw-plate-c { left: 47%; transform: rotate(5deg); }
        .dw-plate-d { right: 0; transform: rotate(12deg); }
        .dw-spray {
          position: absolute; top: 21%; left: 10%; width: 80%; height: 5px; z-index: 3;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent 0 3%, ${color} 10% 90%, transparent 97%);
          box-shadow: 0 0 6px ${color};
          /* Visible at rest too, in the state colour: once the glass clears for
             a paused or finished load, a half-faded arm reads as a rendering
             glitch rather than as an arm standing still. */
          opacity: 0.85; transform-origin: 50% 50%; transition: opacity 0.3s ease;
        }
        .dw-spray::before,
        .dw-spray::after {
          content: ""; position: absolute; top: 1px; width: 2px; height: 1px;
          border-radius: 50%; background: ${color};
        }
        .dw-spray::before { left: 22%; }
        .dw-spray::after { right: 22%; }
        .dw-spray-hub {
          position: absolute; top: 50%; left: 50%; width: 7px; height: 7px;
          border: 1px solid ${color}; border-radius: 50%; background: #2c2c2c;
          transform: translate(-50%, -50%);
        }
        .dw-drops { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
        .dw-drop {
          position: absolute; top: 22%; width: 3px; height: 5px; border-radius: 60%;
          background: ${color}; opacity: 0; transform: translateY(-4px) scale(0.8);
        }
        .dw-drop-a { left: 25%; }
        .dw-drop-b { left: 38%; }
        .dw-drop-c { left: 51%; }
        .dw-drop-d { left: 64%; }
        .dw-drop-e { left: 75%; }
        .dw-water {
          position: absolute; right: 9%; bottom: 5%; left: 9%; z-index: 2; height: 12px;
          overflow: hidden; border-top: 1px solid ${color}; border-radius: 50% 50% 20% 20%;
          background: linear-gradient(180deg, rgba(33, 150, 243, 0.22), transparent 86%);
          opacity: 0.5; transition: opacity 0.3s ease;
        }
        .dw-wave {
          position: absolute; left: -8%; width: 116%; height: 7px;
          border-top: 1px solid ${color}; border-radius: 50%;
        }
        .dw-wave-a { top: 2px; }
        .dw-wave-b { top: 6px; left: 8%; opacity: 0.6; }
                /* Promoted to its own layer: a thin bar carrying a box-shadow is
           otherwise repainted at every angle, and the glow resampling reads as
           a vibration rather than as rotation. */
        .machine.spinning .dw-spray {
          opacity: 1; will-change: transform; backface-visibility: hidden;
          animation: dw-spray-spin 2.8s linear infinite; animation-delay: var(--anim-offset, 0s);
        }
        .machine.spinning .dw-drop { animation: dw-drop-fall 1.65s ease-in infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.spinning .dw-drop-a { animation-delay: calc(-0.3s + var(--anim-offset, 0s)); }
        .machine.spinning .dw-drop-b { animation-delay: calc(-0.95s + var(--anim-offset, 0s)); }
        .machine.spinning .dw-drop-c { animation-delay: calc(-0.58s + var(--anim-offset, 0s)); }
        .machine.spinning .dw-drop-d { animation-delay: calc(-1.15s + var(--anim-offset, 0s)); }
        .machine.spinning .dw-drop-e { animation-delay: calc(-0.76s + var(--anim-offset, 0s)); }
        .machine.spinning .dw-water { opacity: 0.82; animation: dw-water-pulse 2.2s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.spinning .dw-wave-a { animation: dw-wave-drift 1.8s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.spinning .dw-wave-b { animation: dw-wave-drift 2.4s ease-in-out infinite reverse; animation-delay: var(--anim-offset, 0s); }
        .dw-heat {
          position: absolute; top: 22px; right: 8px; bottom: 8px; left: 8px; z-index: 6;
          overflow: hidden; border-radius: 4px; opacity: 0; pointer-events: none;
          transition: opacity 0.35s ease;
        }
        .dw-heat i {
          position: absolute; bottom: 0; width: 15px; height: 34px; opacity: 0;
          background: linear-gradient(180deg, rgba(255, 183, 77, 0), rgba(255, 183, 77, 0.9) 45%, rgba(255, 138, 60, 0.95));
          clip-path: polygon(63% 0%, 79% 7%, 90% 14%, 93% 21%, 86% 29%, 73% 36%, 56% 43%, 42% 50%, 34% 57%, 35% 64%, 44% 71%, 60% 79%, 76% 86%, 88% 93%, 93% 100%, 67% 100%, 62% 93%, 50% 86%, 34% 79%, 18% 71%, 9% 64%, 8% 57%, 16% 50%, 30% 43%, 47% 36%, 60% 29%, 67% 21%, 64% 14%, 53% 7%, 37% 0%);
          filter: blur(0.5px);
        }
        .dw-heat-a { left: 3%; }
        .dw-heat-b { left: 24%; height: 27px !important; }
        .dw-heat-c { left: 44%; height: 22px !important; }
        .dw-heat-d { left: 64%; height: 29px !important; }
        .dw-heat-e { right: 3%; height: 24px !important; }
        /* Both drying phases show the same thing: heat rising across the full width
           of the machine. They differ only in where it sits, inside the cavity
           while drying and up at the door once the door is cracked open. The wash
           animation is paused underneath, since nothing is spraying any more. */
        .machine.phase-drying .dw-cavity,
        .machine.phase-ado_drying .dw-cavity {
          box-shadow: inset 0 0 20px rgba(255, 112, 67, 0.28);
        }
        .machine.phase-drying .dw-heat,
        .machine.phase-ado_drying .dw-heat { opacity: 1; }
        /* Ado drying pushes the steam further up the door, which is the only
           thing separating it from the plain drying phase. */
        .machine.phase-ado_drying .dw-heat i { height: 44px !important; }
        .machine.phase-drying .dw-heat i,
        .machine.phase-ado_drying .dw-heat i {
          animation: dw-heat-rise 2.4s ease-in-out infinite; animation-delay: var(--anim-offset, 0s);
        }
        .machine.phase-drying .dw-heat i.dw-heat-b,
        .machine.phase-ado_drying .dw-heat i.dw-heat-b { animation-delay: calc(-0.48s + var(--anim-offset, 0s)); }
        .machine.phase-drying .dw-heat i.dw-heat-c,
        .machine.phase-ado_drying .dw-heat i.dw-heat-c { animation-delay: calc(-0.96s + var(--anim-offset, 0s)); }
        .machine.phase-drying .dw-heat i.dw-heat-d,
        .machine.phase-ado_drying .dw-heat i.dw-heat-d { animation-delay: calc(-1.44s + var(--anim-offset, 0s)); }
        .machine.phase-drying .dw-heat i.dw-heat-e,
        .machine.phase-ado_drying .dw-heat i.dw-heat-e { animation-delay: calc(-1.92s + var(--anim-offset, 0s)); }
        .machine.phase-drying .dw-spray,
        .machine.phase-drying .dw-water,
        .machine.phase-drying .dw-wave-a,
        .machine.phase-drying .dw-wave-b,
        .machine.phase-ado_drying .dw-spray,
        .machine.phase-ado_drying .dw-water,
        .machine.phase-ado_drying .dw-wave-a,
        .machine.phase-ado_drying .dw-wave-b {
          animation-play-state: paused; opacity: 0.12;
        }
        /* No water at all while drying: the drops are gone, not dimmed, and
           the rising steam takes the space they used to occupy. */
        .machine.phase-drying .dw-drops,
        .machine.phase-ado_drying .dw-drops { display: none; }
        /* The arm stays lit while drying, but in heat colour: blue reads as
           water, and there is no water left at this point in the cycle. */
        .machine.phase-drying .dw-spray,
        .machine.phase-ado_drying .dw-spray {
          background: linear-gradient(90deg, transparent, #ffa726, transparent);
          box-shadow: 0 0 5px rgba(255, 167, 38, 0.55);
          opacity: 0.6;
        }
        .machine.phase-drying .dw-spray-hub,
        .machine.phase-ado_drying .dw-spray-hub {
          border-color: #ffa726;
        }
        .machine.phase-drying .dw-door,
        .machine.phase-ado_drying .dw-door {
          box-shadow: inset 0 0 0 1px rgba(225, 235, 236, 0.3),
            inset 0 0 15px rgba(255, 112, 67, 0.32), 0 0 8px rgba(255, 112, 67, 0.3);
        }
        .dw-door {
          position: absolute; top: 22px; right: 8px; bottom: 8px; left: 8px; z-index: 5;
          padding: 0; border: 3px solid #34383b; border-radius: 4px;
          background: linear-gradient(180deg, rgba(14, 20, 24, 0.5), rgba(14, 20, 24, 0.74));
          box-shadow: inset 0 0 0 1px rgba(225, 235, 236, 0.3), 0 3px 5px rgba(0, 0, 0, 0.25);
          transform-origin: 50% 100%;
          transition: transform 0.42s cubic-bezier(.2, .75, .25, 1), box-shadow 0.42s ease;
        }
        .dw-door::after {
          content: ""; position: absolute; inset: 0; z-index: 1; border-radius: 2px;
          pointer-events: none;
          background: linear-gradient(116deg, rgba(255, 255, 255, 0.17) 0 17%, rgba(255, 255, 255, 0) 40%);
        }
        .dw-door::before {
          content: ""; position: absolute; top: 4px; right: 18%; left: 18%; height: 2px;
          border-radius: 8px; background: rgba(225, 231, 232, 0.6);
        }
        /* Clear whenever there is something in the tub worth seeing: a running
           cycle, a paused one, or a finished load waiting to be emptied. Opaque
           only at rest, and that contrast is what separates a shut door from an
           open one at a glance. */
        .machine.spinning .dw-door,
        .machine.done .dw-door,
        .machine.paused .dw-door {
          background: linear-gradient(180deg, rgba(18, 26, 30, 0.08), rgba(18, 26, 30, 0.3));
        }
        .dw-door.open {
          background: linear-gradient(180deg, #2c343a, #14191c);
          transform: rotateX(81deg) translateY(13px) translateZ(9px);
          box-shadow: 0 16px 14px rgba(0, 0, 0, 0.45);
        }
        @keyframes dw-spray-spin { to { transform: rotate(360deg); } }
        @keyframes dw-drop-fall {
          0% { opacity: 0; transform: translateY(-4px) scale(0.75); }
          22% { opacity: 0.85; }
          82% { opacity: 0.62; }
          100% { opacity: 0; transform: translateY(28px) scale(1); }
        }
        @keyframes dw-water-pulse { 0%, 100% { transform: scaleX(0.97); } 50% { transform: scaleX(1.02); } }
        @keyframes dw-wave-drift { 0%, 100% { transform: translateX(-3%); } 50% { transform: translateX(3%); } }
        @keyframes dw-heat-rise {
          /* Translation only. Animating scaleY on an element that is both
             clip-path shaped and blurred forces the polygon to be recomputed
             and the blur resampled every frame, which reads as a vibration
             rather than as steam. The volutes already differ by height. */
          0% { opacity: 0; transform: translateY(16px); }
          20% { opacity: 0.72; }
          75% { opacity: 0.72; }
          100% { opacity: 0; transform: translateY(-32px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .machine.spinning .dw-spray, .machine.spinning .dw-drop, .machine.spinning .dw-water,
          .machine.spinning .dw-wave-a, .machine.spinning .dw-wave-b,
          .machine.phase-drying .dw-heat i, .machine.phase-ado_drying .dw-heat i {
          animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;
          }
        }
  `,
  oven: () => `
        .ov-body {
          position: absolute; inset: 0; border-radius: 10px;
          background: var(--ac-body, var(--secondary-background-color, #d7d7d7));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .ov-panel { position: absolute; top: 6px; left: 8px; right: 8px; height: 12px; }
        .ov-disp {
          position: absolute; left: 0; top: 2px; min-width: 30px; height: 9px; padding: 0 2px;
          border-radius: 2px; background: #14161a; color: #ff7043; text-align: center;
          font: 600 6px/9px ui-monospace, "SF Mono", monospace; letter-spacing: 0.5px;
        }
        .ov-knob {
          position: absolute; top: 3px; right: 0; width: 7px; height: 7px;
          border-radius: 50%; background: var(--disabled-text-color, #9e9e9e);
        }
        .ov-knob.k2 { right: 12px; }
        .ov-doorwrap { position: absolute; left: 7px; right: 7px; top: 24px; bottom: 7px; perspective: 300px; }
        .ov-cavity { position: absolute; inset: 0; border-radius: 6px; background: #14161a; overflow: hidden; }
        .ov-elem { position: absolute; left: 7px; right: 7px; height: 3px; border-radius: 2px; background: #3b4048; }
        .ov-elem.top { top: 16px; }
        .ov-elem.bottom { bottom: 10px; }
        .ov-rack { position: absolute; left: 5px; right: 5px; top: 60%; height: 1px; background: #4c525b; }
        .ov-dish {
          position: absolute; left: 50%; top: 60%; width: 30px; height: 9px;
          transform: translate(-50%, -100%); border-radius: 3px 3px 2px 2px; background: #5b6069;
        }
        .machine.heating .ov-elem {
          background: #ff7043; box-shadow: 0 0 9px 1px #ff7043;
          animation: ov-ember 2.6s ease-in-out infinite; animation-delay: var(--anim-offset, 0s);
        }
        .machine.heating .ov-elem.bottom { animation-delay: calc(-1.3s + var(--anim-offset, 0s)); }
        .machine.heating .ov-cavity { box-shadow: inset 0 0 22px rgba(255, 112, 67, 0.45); }
        @keyframes ov-ember { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        /* The lamp has to light the door glass, not the cavity behind it. With
           the door shut the glass is 94% opaque, so a cavity lit underneath is
           invisible: the rule worked and nobody could see it. Lighting the
           pane is also what a real oven looks like, the lamp reaching you
           through the window rather than off the back wall. */
        .machine.lit .ov-cavity {
          background: radial-gradient(ellipse at 50% 40%, rgba(255, 209, 102, 0.28), #14161a 72%);
        }
        .machine.lit .ov-glass {
          background: radial-gradient(ellipse at 50% 38%, rgba(104, 76, 38, 0.86), rgba(16, 18, 22, 0.94) 78%);
        }
        .ov-door {
          position: absolute; inset: 0; border-radius: 6px;
          background: var(--ac-body, var(--secondary-background-color, #d7d7d7));
          border: 1px solid var(--divider-color, #c7c7c7);
          transform-origin: bottom center; transform: rotateX(0deg); transition: transform 0.45s ease;
        }
        .ov-handle {
          position: absolute; left: 5px; right: 5px; top: 3px; height: 4px;
          border-radius: 2px; background: var(--disabled-text-color, #9e9e9e);
        }
        /* The resistances are drawn on the glass rather than seen through it: making
           the glass translucent enough to reveal the cavity washes the whole door out
           to a flat beige and you can no longer read what the oven is doing. */
        .ov-glass {
          position: absolute; left: 5px; right: 5px; top: 11px; bottom: 5px; border-radius: 4px;
          background: rgba(16, 18, 22, 0.94); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
          overflow: hidden; transition: box-shadow 0.4s ease;
        }
        .ov-glass::before, .ov-glass::after {
          content: ""; position: absolute; left: 8px; right: 8px; height: 3px; border-radius: 2px;
          background: #2a2e35; transition: background 0.4s ease;
        }
        .ov-glass::before { top: 8px; }
        .ov-glass::after { bottom: 8px; }
        .machine.heating .ov-glass {
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35), inset 0 0 15px rgba(255, 112, 67, 0.32);
        }
        .machine.heating .ov-glass::before, .machine.heating .ov-glass::after {
          background: #ff7043; box-shadow: 0 0 8px 1px #ff7043;
          animation: ov-ember 2.6s ease-in-out infinite; animation-delay: var(--anim-offset, 0s);
        }
        .machine.heating .ov-glass::after { animation-delay: calc(-1.3s + var(--anim-offset, 0s)); }
        .machine.open .ov-door { transform: rotateX(-74deg); }
  `,
  microwave: () => `
        .mw-body {
          position: absolute; left: 0; right: 0; top: 17px; height: 74px; border-radius: 8px;
          background: var(--ac-body, var(--secondary-background-color, #d7d7d7));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .mw-doorwrap { position: absolute; left: 5px; top: 5px; bottom: 5px; width: 65px; perspective: 280px; }
        .mw-cavity { position: absolute; inset: 0; border-radius: 4px; background: #14161a; overflow: hidden; }
        .mw-turn {
          position: absolute; left: 50%; top: 62%; width: 40px; height: 40px;
          transform: translate(-50%, -50%) scaleY(0.3);
        }
        .mw-plate { position: absolute; inset: 0; border-radius: 50%; background: #2b2f36; }
        .mw-food {
          position: absolute; left: 50%; top: 2px; width: 9px; height: 9px;
          margin-left: -4.5px; border-radius: 50%; background: #6d737c;
        }
        .machine.spinning .mw-turn { animation: mw-spin 3.4s linear infinite; animation-delay: var(--anim-offset, 0s); }
        @keyframes mw-spin {
          from { transform: translate(-50%, -50%) scaleY(0.3) rotate(0deg); }
          to { transform: translate(-50%, -50%) scaleY(0.3) rotate(360deg); }
        }
        .machine.spinning .mw-cavity {
          background: radial-gradient(ellipse at 50% 45%, rgba(255, 209, 102, 0.3), #14161a 70%);
          animation: mw-pulse 1.7s ease-in-out infinite; animation-delay: var(--anim-offset, 0s);
        }
        @keyframes mw-pulse { 0%, 100% { filter: brightness(0.88); } 50% { filter: brightness(1.15); } }
        .machine.spinning .mw-plate { background: #3a3128; }
        .machine.spinning .mw-food { background: #c98b4b; }
        .mw-door {
          position: absolute; inset: 0; border-radius: 4px;
          background: var(--ac-body, var(--secondary-background-color, #d7d7d7));
          border: 1px solid var(--divider-color, #c7c7c7);
          transform-origin: left center; transform: rotateY(0deg); transition: transform 0.45s ease;
        }
        .mw-mesh {
          position: absolute; left: 4px; right: 9px; top: 4px; bottom: 4px; border-radius: 3px;
          background:
            radial-gradient(circle, rgba(190, 200, 215, 0.34) 0.8px, transparent 1.1px) 0 0/5px 5px,
            rgba(18, 20, 24, 0.74);
          transition: background 0.4s ease;
        }
        /* Same reasoning as the oven glass: keep the grille dark and put a pool of
           warm light behind it, instead of lightening the grille itself. */
        .machine.spinning .mw-mesh {
          background:
            radial-gradient(circle, rgba(190, 200, 215, 0.42) 0.8px, transparent 1.1px) 0 0/5px 5px,
            radial-gradient(ellipse at 50% 58%, rgba(255, 183, 88, 0.5), transparent 72%),
            rgba(16, 18, 22, 0.8);
        }
        .mw-handle {
          position: absolute; right: 3px; top: 12px; bottom: 12px; width: 3px;
          border-radius: 2px; background: var(--disabled-text-color, #9e9e9e);
        }
        .machine.open .mw-door { transform: rotateY(-58deg); }
        .mw-panel { position: absolute; right: 3px; top: 5px; bottom: 5px; width: 19px; }
        .mw-disp {
          position: absolute; left: 0; right: 0; top: 0; height: 10px; border-radius: 2px;
          background: #14161a; color: #ffd166; text-align: center;
          font: 600 6px/10px ui-monospace, "SF Mono", monospace;
        }
        .mw-keys {
          position: absolute; left: 0; right: 0; top: 14px;
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px;
        }
        .mw-keys i { display: block; height: 4px; border-radius: 1px; background: var(--divider-color, #bdbdbd); }
  `,
  hood: (color) => `
        .hd-chimney {
          position: absolute; left: 50%; transform: translateX(-50%); top: 2px; width: 26px; height: 32px;
          border-radius: 3px 3px 0 0; background: var(--ac-body, var(--secondary-background-color, #d7d7d7));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .hd-canopy {
          position: absolute; left: 5px; right: 5px; top: 33px; height: 26px;
          background: var(--ac-body, var(--secondary-background-color, #d7d7d7));
          border-bottom: 1px solid var(--divider-color, #c7c7c7);
          clip-path: polygon(20% 0, 80% 0, 100% 100%, 0 100%);
        }
        .hd-under { position: absolute; left: 5px; right: 5px; top: 58px; height: 6px; border-radius: 0 0 3px 3px; background: #2b2f36; }
        .hd-lamp { position: absolute; top: 61px; width: 7px; height: 3px; border-radius: 2px; background: #4c525b; }
        .hd-lamp.l1 { left: 22px; }
        .hd-lamp.l2 { right: 22px; }
        .machine.lit .hd-lamp { background: #ffd166; box-shadow: 0 0 7px 1px #ffd166; }
        .hd-beam {
          position: absolute; top: 64px; width: 30px; height: 40px; opacity: 0;
          background: linear-gradient(to bottom, rgba(255, 209, 102, 0.4), rgba(255, 209, 102, 0));
          clip-path: polygon(34% 0, 66% 0, 100% 100%, 0 100%);
          transition: opacity 0.3s ease;
        }
        .hd-beam.b1 { left: 11px; }
        .hd-beam.b2 { right: 11px; }
        .machine.lit .hd-beam { opacity: 1; }
        .hd-air {
          position: absolute; width: 9px; height: 9px; bottom: 6px;
          border-top: 2px solid ${color}; border-left: 2px solid ${color};
          border-radius: 1px; opacity: 0;
        }
        .hd-air.a1 { left: 26px; }
        .hd-air.a2 { left: 44px; }
        .hd-air.a3 { left: 62px; }
        .machine.fan .hd-air { animation: hd-rise linear infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.fan .hd-air.a2 { animation-delay: calc(-0.45s + var(--anim-offset, 0s)); }
        .machine.fan .hd-air.a3 { animation-delay: calc(-0.9s + var(--anim-offset, 0s)); }
        .machine.v1 .hd-air { animation-duration: 2.4s; }
        .machine.v2 .hd-air { animation-duration: 1.5s; }
        .machine.v3 .hd-air { animation-duration: 1s; }
        .machine.boost .hd-air { animation-duration: 0.55s; border-color: var(--warning-color, #ff9800); }
        /* At the lowest speed a single chevron reads as "barely moving"; three would
           look the same as full speed to anyone glancing at the card. */
        .machine.v1 .hd-air.a1, .machine.v1 .hd-air.a3 { display: none; }
        @keyframes hd-rise {
          0% { transform: translateY(0) rotate(45deg); opacity: 0; }
          25% { opacity: 0.95; }
          100% { transform: translateY(-30px) rotate(45deg); opacity: 0; }
        }
  `,
  cooktop: () => `
        .ck-top {
          position: absolute; inset: 4px 1px; border-radius: 9px; background: #1a1c20;
          border: 1px solid var(--divider-color, #c7c7c7); box-shadow: inset 0 0 14px rgba(0, 0, 0, 0.55);
        }
        .ck-zones {
          position: absolute; left: 6px; right: 6px; top: 8px; bottom: 22px;
          display: grid; gap: 3px; align-items: center; justify-items: center;
        }
        .ck-zones.g1 { grid-template-columns: minmax(0, 1fr); }
        .ck-zones.g2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .ck-zones.g3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .ck-zone {
          width: 30px; height: 30px; box-sizing: border-box;
          border-radius: 50%; border: 1.5px solid #383d45;
          display: flex; align-items: center; justify-content: center; color: #4c525b;
          font: 600 11px/1 ui-monospace, "SF Mono", monospace;
        }
        .ck-zones.g3 .ck-zone { width: 22px; height: 22px; font-size: 9px; }
        .ck-zone.on {
          border-color: #ff7043; color: #ff7043;
          background: radial-gradient(circle, rgba(255, 112, 67, 0.42), transparent 70%);
          box-shadow: 0 0 11px rgba(255, 112, 67, 0.55);
          opacity: calc(0.5 + var(--zi, 1) * 0.5);
          animation: ck-ember 3s ease-in-out infinite; animation-delay: var(--anim-offset, 0s);
        }
        .ck-zone.max {
          border-color: #ff3d00; color: #ff3d00;
          background: radial-gradient(circle, rgba(255, 61, 0, 0.55), transparent 72%);
          box-shadow: 0 0 15px rgba(255, 61, 0, 0.7);
        }
        /* Powered off but still hot: the one thing a cooktop card is actually for. */
        .ck-zone.residual {
          border-color: #7a3b2c; color: #b1543d; background: none;
          box-shadow: none; animation: none; animation-delay: var(--anim-offset, 0s); opacity: 1;
        }
        @keyframes ck-ember { 0%, 100% { filter: brightness(0.85); } 50% { filter: brightness(1.12); } }
        .ck-ctrl { position: absolute; left: 12px; right: 22px; bottom: 10px; display: flex; gap: 5px; justify-content: center; }
        .ck-ctrl i { display: block; width: 11px; height: 3px; border-radius: 2px; background: #383d45; }
        .ck-ctrl i.act { background: #ff7043; box-shadow: 0 0 6px #ff7043; }
        .ck-lock {
          position: absolute; right: 8px; bottom: 8px; width: 9px; height: 7px;
          border-radius: 1px; background: var(--warning-color, #ff9800);
        }
        .ck-lock::before {
          content: ""; position: absolute; left: 2px; top: -4px; width: 5px; height: 5px;
          border: 1.5px solid var(--warning-color, #ff9800); border-bottom: none; border-radius: 3px 3px 0 0;
        }
  `,
  fridge: () => `
        .fr-body {
          position: absolute; left: 12px; right: 12px; top: 2px; bottom: 2px;
          border-radius: 8px;
          background: linear-gradient(100deg, var(--ac-body, var(--secondary-background-color, #d7d7d7)) 0%, var(--ac-body-hi, #e6e6e6) 45%, var(--ac-body, var(--secondary-background-color, #d7d7d7)) 100%);
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        /* The open-door view needs its own stacking context and a perspective,
           so the panels can swing without dragging the whole card into 3D. */
        .fr-wrap { position: absolute; left: 12px; right: 12px; top: 2px; bottom: 2px; perspective: 320px; }
        .fr-split { position: absolute; background: var(--divider-color, #c7c7c7); }
        .fr-split.h { left: 3px; right: 3px; height: 2px; }
        .fr-split.v { top: 3px; bottom: 3px; width: 2px; }
        .fr-handle { position: absolute; width: 3px; border-radius: 2px; background: var(--disabled-text-color, #9e9e9e); }
        .fr-lcd {
          position: absolute; height: 11px; min-width: 22px; padding: 0 3px;
          border-radius: 2px; background: #14161a; color: #4fc3f7; text-align: center;
          font: 600 7px/11px ui-monospace, "SF Mono", monospace;
        }
        .fr-lcd.freeze { color: #90caf9; }
        .fr-lcd.warn { color: var(--error-color, #f44336); }
        .fr-disp {
          position: absolute; border-radius: 3px; background: #20242b;
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.6);
        }
        .fr-cav {
          position: absolute; z-index: 0; border-radius: 6px; overflow: hidden;
          background: radial-gradient(ellipse at 60% 40%, rgba(255, 209, 102, 0.3), #1a1d22 72%);
        }
        .fr-shelf { position: absolute; left: 4px; right: 4px; height: 1.5px; border-radius: 1px; background: #4c525b; }
        .fr-glass {
          position: absolute; border-radius: 4px; overflow: hidden; border: 2px solid #3b4048;
          background: radial-gradient(ellipse at 50% 0%, rgba(255, 224, 178, 0.35), rgba(26, 29, 34, 0.92) 70%);
        }
        .fr-glass::after {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(115deg, transparent 32%, rgba(255, 255, 255, 0.16) 40%, transparent 48%);
        }
        .fr-glass.empty { background: rgba(26, 29, 34, 0.5); }
        .fr-cav.off, .fr-glass.off { background: #15171b; }
        .fr-cav.off .fr-rack, .fr-glass.off .fr-rack { filter: brightness(0.35); }
        .fr-racks { position: absolute; left: 8px; right: 17px; top: 21px; bottom: 9px; }
        .fr-rack {
          position: absolute; left: 50%; width: 45px; margin-left: -22.5px; height: 9px; border-bottom: 1.5px solid #8d6e63;
          background:
            radial-gradient(circle at 4.5px 4.5px, #8e2439 0 2.6px, #3a0d17 2.8px 3.8px, transparent 4px) 0 0 / 18px 9px repeat-x,
            radial-gradient(circle at 13.5px 4.5px, #4a7a3f 0 2.6px, #13240f 2.8px 3.8px, transparent 4px) 0 0 / 18px 9px repeat-x;
        }
        .fr-door {
          position: absolute; z-index: 1; border-radius: 6px;
          background: linear-gradient(100deg, var(--ac-body, var(--secondary-background-color, #d7d7d7)), var(--ac-body-hi, #e6e6e6));
          border: 1px solid var(--divider-color, #c7c7c7);
          transform-origin: left center; transition: transform 0.45s ease;
        }
        /* An open door has to paint over the one below it: left to DOM order it
           would slide behind its neighbour instead. */
        .fr-door.swung { z-index: 3; transform: rotateY(-74deg); }
        /* Hinge on the outer edge, so on a side-by-side the right-hand door
           opens to the right rather than folding across the left one. */
        .fr-door.hinge-right { transform-origin: right center; }
        .fr-door.hinge-right.swung { transform: rotateY(74deg); }
        .fr-icebox { position: absolute; overflow: hidden; }
        .fr-cube { position: absolute; width: 5px; height: 5px; border-radius: 1px; background: #4fc3f7; opacity: 0; }
        .machine.ice .fr-cube { animation: fr-fall 1.8s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.ice .fr-cube.c2 { animation-delay: calc(-0.6s + var(--anim-offset, 0s)); }
        .machine.ice .fr-cube.c3 { animation-delay: calc(-1.2s + var(--anim-offset, 0s)); }
        /* Configured but not producing: the cubes stay, greyed, so the card
           still shows there is an ice maker. */
        .fr-icebox.off .fr-cube { opacity: 0.22; background: var(--disabled-text-color, #9e9e9e); animation: none; animation-delay: var(--anim-offset, 0s); }
        @keyframes fr-fall {
          0% { transform: translateY(0); opacity: 0; }
          15%, 80% { opacity: 0.95; }
          100% { transform: translateY(19px); opacity: 0; }
        }
  `,
  water_heater: () => `
        .wh-bracket { position: absolute; left: 40px; right: 40px; top: 1px; height: 5px; border-radius: 2px; background: #3b4048; }
        .wh-tank {
          position: absolute; left: 23px; right: 23px; top: 4px; bottom: 15px;
          border-radius: 25px / 14px; overflow: hidden;
          background: linear-gradient(90deg, var(--ac-body-lo, #aeb2b5), var(--ac-body, var(--secondary-background-color, #d7d7d7)) 30%,
            var(--ac-body-hi, #e6e6e6) 50%, var(--ac-body, var(--secondary-background-color, #d7d7d7)) 72%, var(--ac-body-lo, #aeb2b5));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .wh-glass {
          position: absolute; left: 8px; right: 8px; top: 13px; bottom: 10px; border-radius: 7px; overflow: hidden;
          background: rgba(20, 24, 30, 0.10); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14);
        }
        .wh-water { position: absolute; inset: 0; background: rgba(79, 195, 247, 0.38); }
        .wh-hot {
          position: absolute; left: 0; right: 0; top: 0; height: calc(var(--wh-hot, 0) * 100%);
          background: linear-gradient(180deg, rgba(255, 87, 51, 0.72), rgba(255, 138, 60, 0.42));
          transition: height 1s ease;
        }
        .wh-lcd {
          position: absolute; left: 50%; transform: translateX(-50%); top: 22px; z-index: 3;
          height: 11px; min-width: 22px; padding: 0 3px; border-radius: 2px;
          background: #14161a; color: #4fc3f7; text-align: center;
          font: 600 7px/11px ui-monospace, "SF Mono", monospace;
        }
        .machine.heating .wh-lcd { color: #ff7043; }
        /* The element: a hairpin at the foot of the tank, where a real one sits.
           border-box, or the borders push it off the tank's axis. */
        .wh-coil {
          position: absolute; left: 50%; bottom: -3px; z-index: 2;
          box-sizing: border-box; width: 18px; height: 19px; margin-left: -9px;
          border: 3px solid #5f6770; border-bottom: none; border-radius: 7px 7px 0 0;
        }
        .machine.heating .wh-coil {
          border-color: #ff3d00;
          animation: wh-glow 1.2s ease-in-out infinite; animation-delay: var(--anim-offset, 0s);
        }
        @keyframes wh-glow {
          0%, 100% { box-shadow: 0 0 5px 1px rgba(255, 61, 0, 0.55), inset 0 0 3px rgba(255, 61, 0, 0.5); }
          50% { box-shadow: 0 0 10px 3px rgba(255, 61, 0, 0.9), inset 0 0 5px rgba(255, 61, 0, 0.8); }
        }
        .wh-heat { position: absolute; inset: 0; z-index: 1; opacity: 0; pointer-events: none; }
        .machine.heating .wh-heat { opacity: 1; }
        .wh-heat i {
          position: absolute; bottom: 6px; width: 11px; height: 32px; margin-left: -5.5px; opacity: 0;
          background: linear-gradient(180deg, rgba(255, 112, 67, 0), rgba(255, 112, 67, 0.85) 45%, rgba(255, 61, 0, 0.95));
          clip-path: polygon(63% 0%, 79% 7%, 90% 14%, 93% 21%, 86% 29%, 73% 36%, 56% 43%, 42% 50%, 34% 57%, 35% 64%, 44% 71%, 60% 79%, 76% 86%, 88% 93%, 93% 100%, 67% 100%, 62% 93%, 50% 86%, 34% 79%, 18% 71%, 9% 64%, 8% 57%, 16% 50%, 30% 43%, 47% 36%, 60% 29%, 67% 21%, 64% 14%, 53% 7%, 37% 0%);
        }
        .wh-heat i.wh-h1 { left: 22%; }
        .wh-heat i.wh-h2 { left: 50%; }
        .wh-heat i.wh-h3 { left: 78%; }
        .machine.heating .wh-heat i { animation: wh-rise 2.4s ease-in infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.heating .wh-heat i.wh-h2 { animation-delay: calc(-0.8s + var(--anim-offset, 0s)); }
        .machine.heating .wh-heat i.wh-h3 { animation-delay: calc(-1.6s + var(--anim-offset, 0s)); }
        @keyframes wh-rise {
          0% { transform: translateY(6px); opacity: 0; }
          25% { opacity: 0.9; }
          100% { transform: translateY(-30px); opacity: 0; }
        }
        .wh-pipe { position: absolute; bottom: 3px; width: 4px; height: 14px; border-radius: 0 0 2px 2px; }
        .wh-pipe.cold { left: 37px; background: #5aa9d6; }
        .wh-pipe.hot { right: 37px; background: #d9674a; }
  `,
  boiler: () => `
        .bl-box {
          position: absolute; left: 27px; right: 27px; top: 2px; height: 58px; border-radius: 5px;
          background: linear-gradient(160deg, var(--ac-body-hi, #e6e6e6), var(--ac-body, var(--secondary-background-color, #d7d7d7)) 45%, var(--ac-body-lo, #aeb2b5));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .bl-lcd {
          position: absolute; left: 50%; transform: translateX(-50%); top: 6px;
          height: 10px; min-width: 20px; padding: 0 3px; border-radius: 2px;
          background: #14161a; color: #4fc3f7; text-align: center;
          font: 600 7px/10px ui-monospace, "SF Mono", monospace;
        }
        .machine.flame .bl-lcd { color: #ff7043; }
        .bl-window {
          position: absolute; left: 50%; top: 24px; width: 20px; height: 22px; margin-left: -10px;
          border-radius: 4px; background: #14161a; overflow: hidden;
        }
        .bl-flame {
          position: absolute; left: 50%; bottom: 2px; width: 14px; height: 18px; margin-left: -7px;
          transform-origin: 50% 100%; opacity: 0;
          background: linear-gradient(0deg, #2979ff 0%, #42a5f5 14%, #ffca28 34%, #ff9800 62%, #ff5722 100%);
          clip-path: polygon(46% 0%, 58% 30%, 70% 10%, 76% 44%, 90% 28%, 94% 64%, 86% 88%, 66% 100%, 34% 100%, 14% 88%, 6% 62%, 12% 32%, 26% 50%, 30% 18%, 42% 36%);
        }
        .machine.flame .bl-flame { opacity: 1; animation: bl-flicker 0.6s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-starting .bl-flame { width: 8px; height: 10px; margin-left: -4px; }
        @keyframes bl-flicker {
          0%, 100% { transform: scale(1, 1); }
          30% { transform: scale(0.92, 1.1); }
          60% { transform: scale(1.06, 0.9); }
        }
        .bl-pipe { position: absolute; background: #8a9096; }
        .bl-pipe.tap-down { left: 33px; top: 60px; width: 4px; height: 12px; }
        .bl-pipe.tap-arm { left: 12px; top: 70px; width: 25px; height: 4px; border-radius: 2px 0 0 2px; }
        .bl-pipe.tap-nose { left: 12px; top: 70px; width: 4px; height: 9px; border-radius: 2px 2px 1px 1px; }
        .bl-knob { position: absolute; left: 20px; top: 65px; width: 8px; height: 5px; border-radius: 2px 2px 0 0; background: #d9674a; }
        .bl-drop {
          position: absolute; left: 12px; top: 80px; width: 4px; height: 6px; opacity: 0;
          border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; background: #4fc3f7;
        }
        .machine.mode-hot_water .bl-pipe.tap-down,
        .machine.mode-hot_water .bl-pipe.tap-arm,
        .machine.mode-hot_water .bl-pipe.tap-nose { background: #ef5350; }
        .machine.mode-hot_water .bl-drop { animation: bl-drip 0.9s ease-in infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-hot_water .bl-drop.d2 { animation-delay: calc(-0.3s + var(--anim-offset, 0s)); }
        .machine.mode-hot_water .bl-drop.d3 { animation-delay: calc(-0.6s + var(--anim-offset, 0s)); }
        @keyframes bl-drip {
          0% { transform: translateY(0); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translateY(24px); opacity: 0; }
        }
        .bl-pipe.rad-down { left: 59px; top: 60px; width: 4px; height: 30px; }
        .bl-pipe.rad-arm { left: 59px; top: 86px; width: 9px; height: 4px; }
        .bl-rad { position: absolute; left: 67px; right: 1px; top: 76px; height: 29px; }
        .bl-rad i {
          position: absolute; top: 0; bottom: 0; width: 5px; border-radius: 2px;
          background: var(--ac-body-lo, #aeb2b5); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
        }
        .bl-rad i:nth-child(1) { left: 0; }
        .bl-rad i:nth-child(2) { left: 7px; }
        .bl-rad i:nth-child(3) { left: 14px; }
        .bl-rad i:nth-child(4) { left: 21px; }
        .machine.mode-space_heating .bl-pipe.rad-down,
        .machine.mode-space_heating .bl-pipe.rad-arm { background: #ff7043; }
        .machine.mode-space_heating .bl-rad i { background: linear-gradient(180deg, #ffab91, #ff7043); }
        .bl-waves { position: absolute; left: 67px; right: 1px; top: 48px; height: 28px; overflow: hidden; pointer-events: none; }
        .bl-waves i {
          position: absolute; bottom: 0; width: 8px; height: 24px; opacity: 0;
          background: linear-gradient(180deg, rgba(255, 112, 67, 0), rgba(255, 112, 67, 0.85) 45%, rgba(255, 87, 34, 0.95));
          clip-path: polygon(63% 0%, 79% 7%, 90% 14%, 93% 21%, 86% 29%, 73% 36%, 56% 43%, 42% 50%, 34% 57%, 35% 64%, 44% 71%, 60% 79%, 76% 86%, 88% 93%, 93% 100%, 67% 100%, 62% 93%, 50% 86%, 34% 79%, 18% 71%, 9% 64%, 8% 57%, 16% 50%, 30% 43%, 47% 36%, 60% 29%, 67% 21%, 64% 14%, 53% 7%, 37% 0%);
        }
        .bl-waves i.w1 { left: 0; }
        .bl-waves i.w2 { left: 10px; }
        .bl-waves i.w3 { left: 20px; }
        .machine.mode-space_heating .bl-waves i { animation: bl-rise 2.4s ease-in infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-space_heating .bl-waves i.w2 { animation-delay: calc(-0.8s + var(--anim-offset, 0s)); }
        .machine.mode-space_heating .bl-waves i.w3 { animation-delay: calc(-1.6s + var(--anim-offset, 0s)); }
        @keyframes bl-rise {
          0% { transform: translateY(18px); opacity: 0; }
          30% { opacity: 0.9; }
          100% { transform: translateY(-8px); opacity: 0; }
        }
  `,
  // A pellet stove from the front: the flue on top, a small screen, the warm
  // air grille, the door with the fire behind its glass, and the hopper beside
  // it, whose window shows how much is left. The warm air leaves by the
  // grille, the smoke by the flue, and only when the stove makes some.
  // A split's indoor unit on the wall: a long rounded box, its screen and
  // lights, and the flap over the outlet, which opens as far as the vane
  // points down. The air leaves in strokes that lean with the side vanes and
  // run faster with the fan; drying, the water rises back into the unit.
  air_conditioner: () => `
        .ac-unit {
          position: absolute; left: 2px; right: 2px; top: 16px; height: 38px; border-radius: 7px 7px 11px 11px;
          background: linear-gradient(180deg, var(--ac-body-hi, #ffffff), var(--ac-body, #f1f3f4) 55%, var(--ac-body-lo, #d8dcde));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1), 0 1px 1px rgba(0, 0, 0, 0.08);
        }
        .ac-unit::before {
          content: ""; position: absolute; left: 5px; right: 5px; top: 3px; height: 4px; border-radius: 2px;
          background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.13) 0 1px, transparent 1px 3px);
        }
        .ac-seam { position: absolute; left: 0; right: 0; top: 25px; height: 1px; background: rgba(0, 0, 0, 0.1); }
        .ac-mouth { position: absolute; left: 7px; right: 7px; bottom: 2px; height: 7px; border-radius: 0 0 7px 7px; background: linear-gradient(180deg, #0e1013, #2a2f35); }
        .ac-flap {
          position: absolute; left: -1px; right: -1px; top: 0; height: 7px; border-radius: 0 0 7px 7px; transform-origin: 50% 0;
          background: linear-gradient(180deg, var(--ac-body-lo, #d8dcde), var(--ac-body, #f1f3f4) 60%, var(--ac-body-hi, #ffffff));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14), 0 1px 1px rgba(0, 0, 0, 0.12);
          transform: translateY(calc(var(--ac-flap, 0) * 1px)) scaleY(calc(1 - var(--ac-flap, 0) * 0.09));
        }
        .ac-lcd {
          position: absolute; right: 9px; top: 11px; min-width: 9px; height: 9px; padding: 0 1.5px; border-radius: 1.5px;
          display: flex; align-items: center; justify-content: center; gap: 1px;
          background: rgba(10, 14, 18, 0.85); color: #7fdcff; text-shadow: 0 0 2px currentColor;
          font: 700 6.5px/9px ui-monospace, "SF Mono", Menlo, monospace;
        }
        .ac-lcd span:empty { display: none; }
        .ac-lcd svg { width: 7px; height: 7px; flex: none; fill: currentColor; }
        .machine.icon-heat .ac-lcd { color: #ffab76; }
        .machine.icon-dry .ac-lcd { color: #80deea; }
        .machine.icon-fan .ac-lcd { color: #e0e0e0; }
        .machine.icon-auto .ac-lcd { color: #a5d6a7; }
        .machine.mode-off .ac-lcd { display: none; }
        .ac-leds { position: absolute; left: 10px; top: 14px; display: flex; gap: 2.5px; }
        .ac-leds i { width: 3px; height: 3px; border-radius: 50%; background: #43a047; box-shadow: 0 0 3px #43a047; }
        .machine.mode-off .ac-leds i { background: rgba(0, 0, 0, 0.15); box-shadow: none; }
        .ac-leds i.ion { background: #29b6f6; box-shadow: 0 0 3px #29b6f6; }
        .ac-leds i.eco { background: #8bc34a; box-shadow: 0 0 3px #8bc34a; }
        .ac-leds i.quiet { background: #ab8cff; box-shadow: 0 0 3px #ab8cff; }
        .ac-leds i.boost { background: #ff7043; box-shadow: 0 0 3px #ff7043; }
        .ac-air { position: absolute; left: 0; top: 56px; width: 96px; height: 50px; overflow: visible; display: none; }
        .machine.mode-cool .ac-air, .machine.mode-heat .ac-air, .machine.mode-dry .ac-air, .machine.mode-fan .ac-air,
        .machine.mode-auto .ac-air, .machine.mode-run .ac-air { display: block; }
        .ac-stream { transform-origin: 48px 0; transform: skewX(var(--ac-skew, 0deg)) scaleY(var(--ac-reach, 1)); }
        .ac-stream path {
          fill: none; stroke: var(--ac-air, #4fc3f7); stroke-width: 2.2; stroke-linecap: round; stroke-dasharray: 5 5; opacity: 0.9;
          animation: ac-flow var(--ac-speed, 1.2s) linear infinite; animation-delay: var(--anim-offset, 0s);
        }
        .ac-stream path:nth-child(2) { animation-delay: calc(-0.3s + var(--anim-offset, 0s)); }
        .ac-stream path:nth-child(3) { animation-delay: calc(-0.6s + var(--anim-offset, 0s)); }
        .ac-stream path:nth-child(4) { animation-delay: calc(-0.9s + var(--anim-offset, 0s)); }
        .machine.mode-cool { --ac-air: #42a5f5; }
        .machine.mode-heat { --ac-air: #ff7043; }
        .machine.mode-dry { --ac-air: #4dd0e1; }
        .machine.mode-fan { --ac-air: #90a4ae; }
        .machine.mode-auto { --ac-air: #81c784; }
        .machine.mode-run { --ac-air: #90caf9; }
        /* Drying: the water drawn out of the room goes up into the unit. */
        .ac-drop { fill: #4fc3f7; opacity: 0; transform-box: fill-box; transform-origin: center; display: none; }
        .machine.mode-dry .ac-drop { display: inline; animation: ac-drop 2s ease-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-dry .ac-drop.d2 { animation-delay: calc(-0.7s + var(--anim-offset, 0s)); }
        .machine.mode-dry .ac-drop.d3 { animation-delay: calc(-1.35s + var(--anim-offset, 0s)); }
        /* Swinging: the flap and the air sweep together. */
        .machine.swing-v .ac-flap { animation: ac-swing-v 4s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.swing-v .ac-stream { animation: ac-reach 4s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.swing-h .ac-stream { animation: ac-sweep 5s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        /* Defrosting: frost on the unit and no air, the fan is stopped. */
        .ac-frost {
          position: absolute; left: 2px; right: 2px; top: 16px; height: 38px; border-radius: 7px 7px 11px 11px; display: none;
          background: radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.9) 0 1px, transparent 1.5px),
            radial-gradient(circle at 70% 60%, rgba(255, 255, 255, 0.9) 0 1px, transparent 1.5px);
          background-size: 9px 8px; box-shadow: inset 0 0 6px rgba(129, 212, 250, 0.9);
        }
        .machine.mode-defrost .ac-frost { display: block; }
        @keyframes ac-flow { to { stroke-dashoffset: -20; } }
        @keyframes ac-drop {
          0% { opacity: 0; transform: translateY(34px) scale(1.2); }
          25% { opacity: 0.9; }
          85% { opacity: 0.8; }
          100% { opacity: 0; transform: translateY(2px) scale(0.6); }
        }
        @keyframes ac-swing-v { 0%, 100% { transform: translateY(1px) scaleY(0.91); } 50% { transform: translateY(5px) scaleY(0.55); } }
        @keyframes ac-reach {
          0%, 100% { transform: skewX(var(--ac-skew, 0deg)) scaleY(0.45); }
          50% { transform: skewX(var(--ac-skew, 0deg)) scaleY(1); }
        }
        @keyframes ac-sweep {
          0%, 100% { transform: skewX(-35deg) scaleY(var(--ac-reach, 1)); }
          50% { transform: skewX(35deg) scaleY(var(--ac-reach, 1)); }
        }
  `,
  // A pet fountain: a tank of water behind a window, a dish on top and a spout
  // that bubbles while the pump runs, a ripple spreading across the dish. The
  // light at the front is blue while it runs, orange when the filter or the
  // pump wants a hand, red and blinking when the water runs low. White by
  // default, the way most are sold.
  pet_fountain: () => `
        .ft-floor { position: absolute; left: 14px; right: 14px; bottom: 3px; height: 7px; border-radius: 50%; background: radial-gradient(closest-side, rgba(0, 0, 0, 0.20), transparent); }
        .ft-body {
          position: absolute; left: 18px; right: 18px; top: 34px; bottom: 7px; border-radius: 12px 12px 10px 10px;
          background: linear-gradient(90deg, var(--ac-body-lo, #d7dbde), var(--ac-body-hi, #ffffff) 30%, var(--ac-body, #eef0f2) 70%, var(--ac-body-lo, #d7dbde));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
        }
        .ft-win {
          position: absolute; left: 27px; right: 27px; top: 47px; height: 34px; border-radius: 7px; overflow: hidden;
          background: linear-gradient(180deg, rgba(214, 230, 240, 0.95), rgba(196, 216, 228, 0.95)); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14);
        }
        .ft-water { position: absolute; left: 0; right: 0; bottom: 0; height: var(--ft-fill, 55%); background: linear-gradient(180deg, #81c7f0, #3a9ad9); transition: height 0.6s ease; }
        .ft-water::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1.5px; background: rgba(255, 255, 255, 0.65); }
        .ft-rim {
          position: absolute; left: 13px; right: 13px; top: 24px; height: 20px; border-radius: 50%;
          background: radial-gradient(ellipse at 45% 30%, var(--ac-body-hi, #ffffff), var(--ac-body, #eef0f2) 55%, var(--ac-body-lo, #c9ced2));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
        }
        .ft-pool { position: absolute; left: 19px; right: 19px; top: 27px; height: 13px; border-radius: 50%; overflow: hidden; background: radial-gradient(ellipse at 50% 40%, #a9dcf7, #5fb2e6 70%, #3f97d2); }
        .ft-pool::after {
          content: ""; position: absolute; left: 50%; top: 50%; width: 10px; height: 4px; margin: -2px 0 0 -5px; border-radius: 50%;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.7); opacity: 0;
        }
        .machine.flowing .ft-pool::after { animation: ft-ripple 1.6s ease-out infinite; animation-delay: var(--anim-offset, 0s); }
        .ft-spout { position: absolute; left: 43px; width: 10px; top: 30px; height: 5px; border-radius: 50%; background: radial-gradient(ellipse at 50% 35%, #ffffff, #c4ccd2); box-shadow: inset 0 0 0 0.6px rgba(0, 0, 0, 0.2); }
        /* Still, the spout is a flat outlet under the surface rather than a
           bubble standing over the dish: only running water lifts it. */
        .machine:not(.flowing) .ft-spout { top: 32px; height: 3px; background: radial-gradient(ellipse at 50% 50%, #7fa9c4, #5e8eaf); box-shadow: none; }
        .machine.ft-dry .ft-pool { left: 24px; right: 24px; top: 31px; height: 7px; background: radial-gradient(ellipse at 50% 40%, #c3e6f8, #8cc6ea 70%, #6eb0dc); }
        .machine.ft-dry .ft-spout { top: 31px; background: radial-gradient(ellipse at 50% 35%, #e2e6ea, #b5bec5); }
        /* While the pump runs, the water rises from the spout and falls back
           into the dish in two arcs, like a garden fountain: a light core,
           pale dashes running outwards, and a splash where each arc lands. */
        .ft-jet { position: absolute; left: 0; top: 0; width: 96px; height: 108px; overflow: visible; display: none; }
        .machine.flowing .ft-jet { display: block; }
        .ft-jet .ft-arc { fill: none; stroke: #6ec1ef; stroke-width: 2.6; stroke-linecap: round; opacity: 0.95; }
        .ft-jet .ft-arc.col { stroke-width: 4.4; }
        .ft-jet .ft-arc.mid { stroke-width: 2.2; opacity: 0.85; }
        .ft-jet .ft-crown { fill: #9ad6f6; }
        .ft-jet .ft-arc-hi { fill: none; stroke: #e3f5fe; stroke-width: 1.1; stroke-linecap: round; stroke-dasharray: 3 6; }
        .machine.flowing .ft-jet .ft-arc-hi { animation: ft-run 0.6s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .ft-jet .ft-splash { fill: none; stroke: rgba(255, 255, 255, 0.85); stroke-width: 0.8; transform-box: fill-box; transform-origin: center; }
        .machine.flowing .ft-jet .ft-splash { animation: ft-splash 0.9s ease-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.flowing .ft-jet .ft-splash.r { animation-delay: calc(-0.45s + var(--anim-offset, 0s)); }
        .ft-jet .ft-drop { fill: #8fd0f5; }
        .machine.flowing .ft-jet .ft-drop { animation: ft-drip 0.9s ease-in infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.flowing .ft-jet .ft-drop.r { animation-delay: calc(-0.45s + var(--anim-offset, 0s)); }
        .ft-led { position: absolute; left: 41px; width: 14px; bottom: 13px; height: 3px; border-radius: 2px; background: rgba(0, 0, 0, 0.15); }
        .machine.led-on .ft-led { background: #29b6f6; box-shadow: 0 0 4px #29b6f6; }
        .machine.led-due .ft-led { background: #ff9800; box-shadow: 0 0 4px #ff9800; }
        .machine.led-low .ft-led { background: #e53935; box-shadow: 0 0 4px #e53935; animation: ft-blink 1s steps(2) infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.led-low .ft-win { box-shadow: inset 0 0 0 1.5px #e53935; }
        @keyframes ft-run { to { stroke-dashoffset: -9; } }
        @keyframes ft-splash { 0% { opacity: 0.9; transform: scale(0.4); } 100% { opacity: 0; transform: scale(1.6); } }
        @keyframes ft-drip { 0% { opacity: 0; transform: translateY(-3px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translateY(3px); } }
        /* Offline, the fountain says nothing: no light, no jet, the water
           drawn grey rather than as a level the card cannot know. */
        .machine.ft-offline .ft-water, .machine.ft-offline .ft-pool { filter: grayscale(1); opacity: 0.55; }
        @keyframes ft-ripple { 0% { opacity: 0.9; transform: scale(0.6); } 100% { opacity: 0; transform: scale(3.2); } }
        @keyframes ft-blink { 50% { opacity: 0.25; } }
  `,
  // A portable dehumidifier on its feet: the air leaves by the grille on top,
  // the screen gives the humidity, and the tank at the bottom shows the water
  // it has taken out of the room through a window, drop by drop.
  dehumidifier: () => `${MINI_LCD_CSS}
        .dh-body {
          position: absolute; left: 24px; right: 24px; top: 22px; bottom: 8px; border-radius: 9px 9px 6px 6px;
          background: linear-gradient(90deg, var(--ac-body-lo, #d7dbde), var(--ac-body-hi, #ffffff) 30%, var(--ac-body, #eef0f2) 70%, var(--ac-body-lo, #d7dbde));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
        }
        .dh-grille { position: absolute; left: 29px; right: 29px; top: 25px; height: 10px; border-radius: 3px; background: repeating-linear-gradient(180deg, #3a4047 0 1.2px, #6e767e 1.2px 2.6px); }
        .dh-lcd { left: 38px; top: 40px; min-width: 16px; }
        .dh-led { position: absolute; left: 31px; top: 43px; width: 3px; height: 3px; border-radius: 50%; background: #43a047; box-shadow: 0 0 3px #43a047; }
        .machine.mode-off .dh-led { background: rgba(0, 0, 0, 0.15); box-shadow: none; }
        .machine.mode-full .dh-led { background: #e53935; box-shadow: 0 0 3px #e53935; animation: dh-blink 1s steps(2) infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-full .dh-lcd { color: #ff6b6b; }
        .dh-seam { position: absolute; left: 24px; right: 24px; top: 64px; height: 1px; background: rgba(0, 0, 0, 0.12); }
        .dh-grip { position: absolute; left: 40px; width: 16px; top: 66px; height: 3px; border-radius: 0 0 3px 3px; background: rgba(0, 0, 0, 0.14); }
        .dh-win {
          position: absolute; left: 33px; right: 33px; top: 72px; height: 20px; border-radius: 3px; overflow: hidden;
          background: linear-gradient(180deg, rgba(210, 225, 235, 0.9), rgba(190, 210, 222, 0.9)); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
        }
        .machine.mode-full .dh-win { box-shadow: inset 0 0 0 1.5px #e53935; }
        .dh-water { position: absolute; left: 0; right: 0; bottom: 0; height: var(--dh-fill, 35%); background: linear-gradient(180deg, #64b5f6, #1e88e5); }
        .dh-water::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 1.5px; background: rgba(255, 255, 255, 0.6); }
        .dh-drip i { position: absolute; top: -3px; width: 2px; height: 3px; border-radius: 50%; background: #42a5f5; opacity: 0; }
        .dh-drip i:nth-child(1) { left: 9px; }
        .dh-drip i:nth-child(2) { left: 15px; }
        .machine.mode-drying .dh-drip i, .machine.mode-laundry .dh-drip i { animation: dh-drip 1.3s ease-in infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-drying .dh-drip i:nth-child(2), .machine.mode-laundry .dh-drip i:nth-child(2) { animation-delay: calc(-0.65s + var(--anim-offset, 0s)); }
        .dh-foot { position: absolute; bottom: 4px; width: 7px; height: 5px; border-radius: 0 0 3px 3px; background: #3b4048; }
        .dh-foot.f1 { left: 28px; }
        .dh-foot.f2 { right: 28px; }
        .dh-air { left: 28px; top: -2px; width: 40px; height: 24px; }
        .machine.mode-drying .dh-air, .machine.mode-laundry .dh-air { display: block; }
        .dh-air path { stroke: #81d4fa; }
        .machine.mode-laundry .dh-air path { stroke: #1565c0; }
        @keyframes dh-drip { 0% { opacity: 0; transform: translateY(0); } 15% { opacity: 1; } 90% { opacity: 1; } 100% { opacity: 0; transform: translateY(16px); } }
        @keyframes dh-blink { 50% { opacity: 0.25; } }
  `,
  // A small room heater, in two models. The fan heater glows behind its
  // grille and its fan turns; the oil-filled radiator warms up from the
  // bottom of its fins. Warm air rises above both, and a fan heater set to
  // blow only sends grey air the other way.
  space_heater: () => `${MINI_LCD_CSS}
        .machine.mode-heating .mini-lcd { color: #ffab76; }
        .machine.mode-idle .mini-lcd { color: #a5d6a7; }
        .machine.mode-fan .mini-lcd { color: #e0e0e0; }
        .machine.mode-heating .air-flow, .machine.mode-fan .air-flow { display: block; }
        .air-flow path { stroke: #ff8a65; }
        .machine.mode-fan .air-flow path { stroke: #90a4ae; }
        .hf-body {
          position: absolute; left: 25px; right: 25px; top: 36px; bottom: 10px; border-radius: 12px 12px 8px 8px;
          background: linear-gradient(160deg, var(--ac-body-hi, #ffffff), var(--ac-body, #eceff1) 55%, var(--ac-body-lo, #cfd6db));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
        }
        .hf-handle { position: absolute; left: 41px; width: 14px; top: 40px; height: 4px; border-radius: 2px; background: rgba(0, 0, 0, 0.28); }
        .hf-lcd { left: 38px; top: 48px; min-width: 16px; }
        .hf-grill { position: absolute; left: 31px; top: 61px; width: 34px; height: 31px; border-radius: 7px; overflow: hidden; background: #20252b; }
        .hf-grill::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(180deg, rgba(30, 34, 40, 0.95) 0 1.4px, transparent 1.4px 4px); }
        .hf-glow { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at 50% 55%, #ffb74d, #ff7043 45%, #8d2d0e 80%); }
        .machine.mode-heating .hf-glow { opacity: 1; animation: sh-glow 2.4s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .hf-fan { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; opacity: 0.5; fill: #78909c; }
        .machine.mode-heating .hf-fan, .machine.mode-fan .hf-fan { animation: sh-spin 0.5s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .hf-foot { position: absolute; bottom: 6px; width: 10px; height: 4px; border-radius: 0 0 3px 3px; background: #3b4048; }
        .hf-foot.f1 { left: 30px; }
        .hf-foot.f2 { right: 30px; }
        .hf-air { left: 27px; top: 6px; width: 42px; height: 30px; }
        .ho-fins { position: absolute; left: 14px; top: 30px; width: 58px; height: 62px; display: flex; gap: 1.5px; }
        .ho-fins i {
          flex: 1; border-radius: 4px; position: relative; overflow: hidden;
          background: linear-gradient(90deg, var(--ac-body-lo, #cfd6db), var(--ac-body-hi, #ffffff) 45%, var(--ac-body, #e6eaed));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
        }
        .ho-fins i::after { content: ""; position: absolute; inset: 0; opacity: 0; background: linear-gradient(0deg, rgba(255, 112, 67, 0.55), rgba(255, 171, 145, 0.15) 70%, transparent); }
        .machine.mode-heating .ho-fins i::after { opacity: 1; animation: sh-glow 3s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .ho-box {
          position: absolute; left: 73px; top: 34px; width: 12px; height: 26px; border-radius: 3px;
          background: linear-gradient(90deg, var(--ac-body, #e6eaed), var(--ac-body-lo, #cfd6db)); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
        }
        .ho-knob { position: absolute; left: 76px; top: 48px; width: 6px; height: 6px; border-radius: 50%; background: #90a4ae; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2); }
        .ho-lcd { left: 74px; top: 37px; min-width: 9px; padding: 0 1px; }
        .ho-base { position: absolute; left: 18px; width: 50px; top: 92px; height: 3px; border-radius: 2px; background: #5f666e; }
        .ho-wheel { position: absolute; top: 94px; width: 6px; height: 6px; border-radius: 50%; background: #3b4048; }
        .ho-wheel.w1 { left: 18px; }
        .ho-wheel.w2 { left: 62px; }
        .ho-air { left: 14px; top: 2px; width: 58px; height: 28px; }
        @keyframes sh-spin { to { transform: rotate(360deg); } }
        @keyframes sh-glow { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.25); } }
  `,
  // A towel warmer on the bathroom wall: two rails, the bars between them, a
  // towel over one, and the control box underneath. The bars warm with the
  // mode, the heat rises above them, and drying, the towel steams.
  towel_warmer: () => `${MINI_LCD_CSS}
        .machine.mode-comfort .mini-lcd, .machine.mode-boost .mini-lcd, .machine.mode-drying .mini-lcd { color: #ffab76; }
        .machine.mode-eco .mini-lcd { color: #b39ddb; }
        .machine.mode-frost .mini-lcd { color: #81d4fa; }
        .tw-rail { position: absolute; top: 14px; bottom: 18px; width: 5px; border-radius: 3px; background: linear-gradient(90deg, var(--ac-body-lo, #cfd6db), var(--ac-body-hi, #ffffff), var(--ac-body, #e6eaed)); }
        .tw-rail.r1 { left: 22px; }
        .tw-rail.r2 { right: 22px; }
        .tw-bar {
          position: absolute; left: 26px; right: 26px; height: 2.6px; border-radius: 2px;
          background: linear-gradient(180deg, var(--ac-body-hi, #ffffff), var(--ac-body, #e6eaed) 50%, var(--ac-body-lo, #bfc7cd));
          box-shadow: 0 0.5px 0 rgba(0, 0, 0, 0.12);
        }
        .machine.mode-comfort .tw-bar, .machine.mode-drying .tw-bar { background: linear-gradient(180deg, #ffe0d6, #ffab91 55%, #f4511e); }
        .machine.mode-boost .tw-bar { background: linear-gradient(180deg, #ffab91, #ff5722 55%, #bf360c); box-shadow: 0 0 3px rgba(255, 87, 34, 0.8); }
        .machine.mode-eco .tw-bar { background: linear-gradient(180deg, #fbe9e7, #ffccbc 55%, #ffab91); }
        .tw-towel { position: absolute; left: 33px; width: 30px; top: 31px; height: 44px; }
        .tw-box {
          position: absolute; left: 35px; right: 35px; top: 92px; height: 12px; border-radius: 3px;
          background: linear-gradient(180deg, var(--ac-body-hi, #ffffff), var(--ac-body-lo, #cfd6db)); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
        }
        .tw-lcd { left: 39px; top: 93.5px; min-width: 16px; }
        .tw-air { left: 22px; top: 0; width: 52px; height: 14px; }
        .machine.mode-comfort .tw-air, .machine.mode-boost .tw-air, .machine.mode-eco .tw-air { display: block; }
        .tw-air path, .tw-steam path { stroke: #ff8a65; }
        .machine.mode-eco .tw-air path { animation-duration: 2.6s; opacity: 0.6; }
        .machine.mode-boost .tw-air path { animation-duration: 0.7s; }
        .tw-steam { left: 30px; top: 10px; width: 36px; height: 22px; }
        .machine.mode-drying .tw-steam { display: block; }
  `,
  // An air fryer, in three models: a basket under a top panel, the same with
  // a window onto the fries, and two baskets side by side. The heat rises
  // above it while it cooks, the seam over the basket glows, and a basket
  // pulled out comes forward.
  air_fryer: () => `${MINI_LCD_CSS}
        .machine .mini-lcd { color: #ffab76; }
        .machine.mode-keep_warm .mini-lcd, .machine.z1-warm .mini-lcd { color: #ffd54f; }
        .machine.mode-done .mini-lcd, .machine.mode-preheated .mini-lcd { color: #81c784; }
        .machine.mode-delayed .mini-lcd { color: #ce93d8; }
        .machine.mode-paused .mini-lcd, .machine.mode-basket_out .mini-lcd, .machine.mode-shake .mini-lcd { color: #ffb74d; }
        .machine.mode-error .mini-lcd { display: none; }
        .af-body {
          position: absolute; border-radius: 16px 16px 7px 7px;
          background: linear-gradient(90deg, var(--ac-body-lo, #1f2327), var(--ac-body-hi, #4a5158) 30%, var(--ac-body, #34393e) 70%, var(--ac-body-lo, #1f2327));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18);
        }
        .af-vent { position: absolute; height: 4px; border-radius: 2px; background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.45) 0 1.2px, transparent 1.2px 3px); }
        .af-seam { position: absolute; height: 1.5px; background: rgba(0, 0, 0, 0.35); }
        .af-drawer {
          position: absolute; border-radius: 3px 3px 8px 8px; transform-origin: 50% 0;
          background: linear-gradient(90deg, var(--ac-body-lo, #1f2327), var(--ac-body, #34393e) 35%, var(--ac-body-hi, #4a5158) 60%, var(--ac-body-lo, #1f2327));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
        }
        .af-handle { position: absolute; border-radius: 3px; background: linear-gradient(180deg, #5f666e, #2b3036); box-shadow: 0 1px 1px rgba(0, 0, 0, 0.35); }
        .af-btn { position: absolute; width: 5px; height: 2px; border-radius: 1px; background: #90a4ae; }
        .af-foot { position: absolute; bottom: 5px; width: 9px; height: 3px; border-radius: 0 0 3px 3px; background: #1d2126; }
        .af-led { position: absolute; width: 3px; height: 3px; border-radius: 50%; background: rgba(0, 0, 0, 0.25); }
        .af-gap { position: absolute; background: #0f1215; display: none; border-radius: 2px; }
        .af-air path { stroke: #ff8a65; }
        /* One basket: the whole machine says what it does. */
        .machine.z1-hot .af-seam.s1, .machine.z2-hot .af-seam.s2 { background: #ff7043; box-shadow: 0 0 3px #ff7043; animation: af-pulse 1.6s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.z1-warm .af-seam.s1, .machine.z2-warm .af-seam.s2 { background: #ffb300; box-shadow: 0 0 2px #ffb300; }
        .machine.z1-hot .af-air.a1, .machine.z2-hot .af-air.a2, .machine.z1-warm .af-air.a1, .machine.z2-warm .af-air.a2 { display: block; }
        .machine.z1-warm .af-air.a1 path, .machine.z2-warm .af-air.a2 path { stroke: #ffca28; animation-duration: 2.6s; opacity: 0.7; }
        .machine.mode-preheating .af-air path { animation-duration: 2s; opacity: 0.8; }
        .machine.z1-hot .af-led.l1, .machine.z2-hot .af-led.l2 { background: #ff7043; box-shadow: 0 0 3px #ff7043; }
        .machine.z1-warm .af-led.l1, .machine.z2-warm .af-led.l2 { background: #ffb300; box-shadow: 0 0 3px #ffb300; }
        .machine.z1-ready .af-led.l1, .machine.z2-ready .af-led.l2 { background: #66bb6a; box-shadow: 0 0 3px #66bb6a; animation: af-blink 1.2s steps(2) infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.z1-out .af-gap.g1, .machine.z2-out .af-gap.g2 { display: block; }
        .machine.z1-out .af-drawer.d1, .machine.z2-out .af-drawer.d2 { transform: translateY(5px) scale(1.07); filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.35)); }
        .machine.mode-shake .af-drawer.d1 { animation: af-shake 1s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }

        .af-basket .af-body { left: 21px; right: 21px; top: 20px; bottom: 9px; }
        .af-basket .af-vent { left: 34px; right: 34px; top: 24px; }
        .af-basket .mini-lcd { left: 36px; top: 31px; min-width: 22px; }
        .af-basket .af-led { left: 46.5px; top: 43px; }
        .af-basket .af-seam { left: 21px; right: 21px; top: 52px; }
        .af-basket .af-gap { left: 23px; right: 23px; top: 52px; height: 6px; }
        .af-basket .af-drawer { left: 21px; right: 21px; top: 53px; bottom: 9px; }
        .af-basket .af-handle { left: 15px; width: 24px; top: 13px; height: 13px; }
        .af-basket .af-btn { left: 9.5px; top: 1.5px; }
        .af-basket .af-foot.f1, .af-window .af-foot.f1 { left: 25px; }
        .af-basket .af-foot.f2, .af-window .af-foot.f2 { right: 25px; }
        .af-basket .af-air, .af-window .af-air { left: 28px; top: -1px; width: 40px; height: 22px; }

        .af-window .af-body { left: 20px; right: 20px; top: 18px; bottom: 9px; }
        .af-window .af-vent { left: 34px; right: 34px; top: 22px; }
        .af-window .mini-lcd { left: 36px; top: 29px; min-width: 22px; }
        .af-window .af-led { left: 46.5px; top: 40px; }
        .af-window .af-seam { left: 20px; right: 20px; top: 47px; }
        .af-window .af-gap { left: 22px; right: 22px; top: 47px; height: 6px; }
        .af-window .af-drawer { left: 20px; right: 20px; top: 48px; bottom: 9px; }
        .af-window .af-handle { left: 12px; width: 32px; top: 33px; height: 7px; }
        .af-window .af-btn { left: 13.5px; top: 1px; }
        .af-win { position: absolute; left: 7px; right: 7px; top: 4px; height: 25px; border-radius: 5px; overflow: hidden; background: #15181c; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15); }
        .af-glow { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at 50% 10%, #ffb74d, #ff7043 40%, rgba(120, 30, 10, 0.6) 75%, transparent); }
        .machine.z1-hot .af-glow { opacity: 1; animation: af-pulse 2s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.z1-warm .af-glow { opacity: 0.55; background: radial-gradient(ellipse at 50% 10%, #ffd54f, #ffb300 45%, transparent 80%); }
        .af-coil { position: absolute; left: 4px; right: 4px; top: 2px; height: 2px; border-radius: 1px; background: #5d4037; }
        .machine.z1-hot .af-coil { background: #ff5722; box-shadow: 0 0 3px #ff5722; }
        .af-fries { position: absolute; left: 4px; right: 4px; bottom: 2px; height: 12px; }
        .af-fries i { position: absolute; bottom: 0; width: 3px; height: 10px; border-radius: 1px; background: linear-gradient(180deg, #ffe082, #f9a825); }
        .af-fries i:nth-child(1) { left: 4px; }
        .af-fries i:nth-child(2) { left: 9px; height: 8px; }
        .af-fries i:nth-child(3) { left: 14px; }
        .af-fries i:nth-child(4) { left: 19px; height: 9px; }
        .af-fries i:nth-child(5) { left: 24px; height: 7px; }
        .machine.z1-ready .af-fries i, .machine.z1-warm .af-fries i { background: linear-gradient(180deg, #ffcc80, #e08a1e); }
        .machine.mode-cooking .af-fries i { animation: af-toss 0.9s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-cooking .af-fries i:nth-child(2) { animation-delay: calc(-0.3s + var(--anim-offset, 0s)); }
        .machine.mode-cooking .af-fries i:nth-child(3) { animation-delay: calc(-0.6s + var(--anim-offset, 0s)); }
        .machine.mode-cooking .af-fries i:nth-child(4) { animation-delay: calc(-0.15s + var(--anim-offset, 0s)); }
        .machine.mode-cooking .af-fries i:nth-child(5) { animation-delay: calc(-0.45s + var(--anim-offset, 0s)); }

        .af-dual .af-body { left: 6px; right: 6px; top: 30px; bottom: 9px; border-radius: 12px 12px 6px 6px; }
        .af-dual .af-vent { left: 14px; width: 20px; top: 34px; }
        .af-dual .af-vent.v2 { left: auto; right: 14px; }
        .af-dual .mini-lcd { left: 37px; top: 33px; min-width: 22px; }
        .af-dual .af-seam { top: 52px; width: 40px; }
        .af-dual .af-seam.s1, .af-dual .af-drawer.d1, .af-dual .af-gap.g1 { left: 6px; }
        .af-dual .af-seam.s2, .af-dual .af-drawer.d2, .af-dual .af-gap.g2 { right: 6px; }
        .af-dual .af-gap { top: 52px; width: 38px; height: 6px; }
        .af-dual .af-drawer { top: 53px; bottom: 9px; width: 40px; }
        .af-div { position: absolute; left: 47.25px; top: 52px; bottom: 9px; width: 1.5px; background: rgba(0, 0, 0, 0.35); }
        .af-dual .af-handle { left: 9px; width: 22px; top: 11px; height: 12px; }
        .af-dual .af-btn { left: 8.5px; top: 1.5px; }
        .af-zn { position: absolute; left: 18px; top: 3px; font: 700 5px/6px sans-serif; color: rgba(140, 146, 152, 0.9); }
        .af-dual .af-led { top: 47px; }
        .af-dual .af-led.l1 { left: 24.5px; }
        .af-dual .af-led.l2 { right: 24.5px; }
        .af-dual .af-foot.f1 { left: 12px; }
        .af-dual .af-foot.f2 { right: 12px; }
        .af-dual .af-air { top: 9px; width: 34px; height: 22px; }
        .af-dual .af-air.a1 { left: 7px; }
        .af-dual .af-air.a2 { right: 7px; }
        @keyframes af-pulse { 50% { opacity: 0.35; } }
        @keyframes af-blink { 50% { opacity: 0.2; } }
        @keyframes af-shake { 0%, 100% { transform: rotate(0); } 20% { transform: rotate(-4deg); } 40% { transform: rotate(4deg); } 60% { transform: rotate(-3deg); } 80% { transform: rotate(3deg); } }
        @keyframes af-toss { 0%, 100% { transform: translateY(0) rotate(0); } 30% { transform: translateY(-3px) rotate(25deg); } 60% { transform: translateY(-1px) rotate(-15deg); } }
  `,
  pellet_stove: () => `
        .ps-pipe {
          position: absolute; left: 43px; top: 0; width: 10px; height: 14px; border-radius: 2px 2px 0 0;
          background: linear-gradient(90deg, #5d646b, #8a9096, #5d646b);
        }
        .ps-body {
          position: absolute; left: 15px; right: 15px; top: 13px; bottom: 5px; border-radius: 7px 7px 4px 4px;
          background: linear-gradient(160deg, var(--ac-body-hi, #e6e6e6), var(--ac-body, var(--secondary-background-color, #d7d7d7)) 45%, var(--ac-body-lo, #aeb2b5));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .ps-lid { position: absolute; left: 15px; right: 15px; top: 13px; height: 5px; border-radius: 7px 7px 0 0; background: rgba(0, 0, 0, 0.08); }
        .ps-lcd {
          position: absolute; left: 21px; top: 21px; width: 28px; height: 10px; border-radius: 2px;
          background: #14161a; color: #4fc3f7; text-align: center; overflow: hidden;
          font: 600 7px/10px ui-monospace, "SF Mono", monospace;
        }
        .machine.mode-ignition .ps-lcd, .machine.mode-burning .ps-lcd, .machine.mode-modulating .ps-lcd { color: #ff7043; }
        .machine.mode-eco .ps-lcd { color: #81c784; }
        .machine.mode-cooling .ps-lcd { color: #90caf9; }
        .machine.mode-cleaning .ps-lcd { color: #ffca28; }
        .machine.mode-alarm .ps-lcd { color: #ef5350; animation: ps-blink 1s steps(2) infinite; animation-delay: var(--anim-offset, 0s); }
        .ps-grille { position: absolute; left: 54px; top: 22px; width: 22px; height: 8px; opacity: 0.7; background: repeating-linear-gradient(180deg, #6b737c 0 1px, transparent 1px 3px); }
        .ps-door { position: absolute; left: 21px; top: 35px; width: 44px; height: 52px; border-radius: 5px; background: #2b2f35; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.4); }
        .ps-glass { position: absolute; inset: 4px; border-radius: 3px; background: #14161a; overflow: hidden; }
        .ps-shine { position: absolute; inset: 0; background: linear-gradient(135deg, rgba(255, 255, 255, 0.12), transparent 45%); pointer-events: none; }
        .ps-handle { position: absolute; left: 61px; top: 52px; width: 3px; height: 16px; border-radius: 2px; background: #8a9096; }
        .ps-pot { position: absolute; left: 50%; bottom: 3px; width: 22px; height: 6px; margin-left: -11px; border-radius: 1px 1px 3px 3px; background: #4a4f55; }
        .ps-glow {
          position: absolute; left: 50%; bottom: 8px; width: 26px; height: 8px; margin-left: -13px; border-radius: 50%; opacity: 0;
          background: radial-gradient(ellipse, rgba(255, 112, 67, 0.95), rgba(255, 87, 34, 0.25) 60%, transparent 72%);
        }
        .ps-spark { position: absolute; left: 50%; bottom: 5px; width: 5px; height: 5px; margin-left: -2.5px; border-radius: 50%; opacity: 0; background: #ffcc80; box-shadow: 0 0 6px 3px rgba(255, 152, 0, 0.9); }
        /* The boiler's flame, without the blue root of a gas burner. */
        .ps-flame {
          position: absolute; left: 50%; bottom: 8px; width: 28px; height: 34px; margin-left: -14px; transform-origin: 50% 100%; opacity: 0;
          background: linear-gradient(0deg, #ff6d00 0%, #ffa000 25%, #ffca28 55%, #fff176 100%);
          clip-path: polygon(46% 0%, 58% 30%, 70% 10%, 76% 44%, 90% 28%, 94% 64%, 86% 88%, 66% 100%, 34% 100%, 14% 88%, 6% 62%, 12% 32%, 26% 50%, 30% 18%, 42% 36%);
        }
        .ps-ash i { position: absolute; bottom: 9px; width: 3px; height: 3px; border-radius: 50%; background: #9e9e9e; opacity: 0; }
        .ps-ash i:nth-child(1) { left: 14px; }
        .ps-ash i:nth-child(2) { left: 19px; }
        .ps-ash i:nth-child(3) { left: 23px; }
        .ps-hopper { position: absolute; left: 69px; top: 37px; width: 6px; height: 48px; border-radius: 3px; background: #14161a; overflow: hidden; box-shadow: 0 0 0 1px var(--ac-body-lo, #aeb2b5); }
        .ps-pellets {
          position: absolute; left: 0; right: 0; bottom: 0; height: var(--ps-fill, 60%);
          background: radial-gradient(circle at 1.5px 1.5px, #c08a52 1.1px, transparent 1.4px) 0 0 / 3px 3px, #8d5a2b;
        }
        .machine.empty .ps-hopper { box-shadow: 0 0 0 1.5px #ef5350; }
        .ps-foot { position: absolute; bottom: 1px; width: 10px; height: 4px; border-radius: 0 0 2px 2px; background: #3b4048; }
        .ps-foot.f1 { left: 21px; }
        .ps-foot.f2 { right: 21px; }
        .ps-air { position: absolute; left: 52px; top: -14px; width: 30px; height: 34px; overflow: hidden; pointer-events: none; }
        .ps-air i {
          position: absolute; bottom: 0; width: 9px; height: 26px; opacity: 0;
          background: linear-gradient(180deg, rgba(255, 112, 67, 0), rgba(255, 112, 67, 0.85) 45%, rgba(255, 87, 34, 0.95));
          clip-path: polygon(63% 0%, 79% 7%, 90% 14%, 93% 21%, 86% 29%, 73% 36%, 56% 43%, 42% 50%, 34% 57%, 35% 64%, 44% 71%, 60% 79%, 76% 86%, 88% 93%, 93% 100%, 67% 100%, 62% 93%, 50% 86%, 34% 79%, 18% 71%, 9% 64%, 8% 57%, 16% 50%, 30% 43%, 47% 36%, 60% 29%, 67% 21%, 64% 14%, 53% 7%, 37% 0%);
        }
        .ps-air i.a1 { left: 1px; }
        .ps-air i.a2 { left: 11px; }
        .ps-air i.a3 { left: 21px; }
        .ps-smoke i { position: absolute; left: 44px; top: -2px; width: 8px; height: 8px; border-radius: 50%; background: rgba(140, 145, 150, 0.55); opacity: 0; }
        .machine.mode-burning .ps-flame { opacity: 1; animation: ps-flicker 0.6s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-burning .ps-glow, .machine.mode-modulating .ps-glow, .machine.mode-ignition .ps-glow { opacity: 1; }
        .machine.mode-burning .ps-air i { animation: ps-rise 2.2s ease-in infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-burning .ps-air i.a2 { animation-delay: calc(-0.73s + var(--anim-offset, 0s)); }
        .machine.mode-burning .ps-air i.a3 { animation-delay: calc(-1.46s + var(--anim-offset, 0s)); }
        /* Modulating: the same fire, smaller, and less warm air. */
        .machine.mode-modulating .ps-flame { opacity: 1; width: 16px; height: 18px; margin-left: -8px; animation: ps-flicker 0.8s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-modulating .ps-air i.a2 { animation: ps-rise 3s ease-in infinite; animation-delay: var(--anim-offset, 0s); }
        /* Lighting: the igniter glows, a first flame, and smoke at the flue. */
        .machine.mode-ignition .ps-spark { opacity: 1; animation: ps-spark 0.5s steps(2) infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-ignition .ps-flame { opacity: 1; width: 9px; height: 10px; margin-left: -4.5px; animation: ps-flicker 0.35s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-ignition .ps-smoke i, .machine.mode-cleaning .ps-smoke i { animation: ps-puff 2.6s ease-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-ignition .ps-smoke i:nth-child(2), .machine.mode-cleaning .ps-smoke i:nth-child(2) { animation-delay: calc(-1.3s + var(--anim-offset, 0s)); }
        /* Eco: the fire is out and the embers breathe. */
        .machine.mode-eco .ps-glow { animation: ps-breathe 3.2s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        /* Cooling down: the last embers, and the fans blow the heat out, cool. */
        .machine.mode-cooling .ps-glow { opacity: 0.25; }
        .machine.mode-cooling .ps-air i {
          background: linear-gradient(180deg, rgba(144, 202, 249, 0), rgba(144, 202, 249, 0.8) 45%, rgba(100, 181, 246, 0.9));
          animation: ps-rise 2.8s ease-in infinite; animation-delay: var(--anim-offset, 0s);
        }
        .machine.mode-cooling .ps-air i.a2 { animation-delay: calc(-0.93s + var(--anim-offset, 0s)); }
        .machine.mode-cooling .ps-air i.a3 { animation-delay: calc(-1.86s + var(--anim-offset, 0s)); }
        /* Cleaning the burn pot: the ash is blown up out of it. */
        .machine.mode-cleaning .ps-ash i { animation: ps-ash 1.1s ease-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-cleaning .ps-ash i:nth-child(2) { animation-delay: calc(-0.37s + var(--anim-offset, 0s)); }
        .machine.mode-cleaning .ps-ash i:nth-child(3) { animation-delay: calc(-0.74s + var(--anim-offset, 0s)); }
        @keyframes ps-flicker {
          0%, 100% { transform: scale(1, 1); }
          30% { transform: scale(0.92, 1.1); }
          60% { transform: scale(1.06, 0.9); }
        }
        @keyframes ps-rise {
          0% { transform: translateY(18px); opacity: 0; }
          30% { opacity: 0.9; }
          100% { transform: translateY(-8px); opacity: 0; }
        }
        @keyframes ps-spark { 0% { opacity: 1; } 100% { opacity: 0.2; } }
        @keyframes ps-puff {
          0% { transform: translate(0, 4px) scale(0.6); opacity: 0; }
          25% { opacity: 0.8; }
          100% { transform: translate(6px, -14px) scale(1.6); opacity: 0; }
        }
        @keyframes ps-breathe { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.6; } }
        @keyframes ps-ash {
          0% { transform: translateY(0); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translate(4px, -22px); opacity: 0; }
        }
        @keyframes ps-blink { 0% { opacity: 1; } 100% { opacity: 0.25; } }
  `,
  heat_pump: () => `
        .hp-unit {
          position: absolute; left: 2px; right: 2px; top: 4px; height: 60px; border-radius: 5px;
          background: linear-gradient(160deg, var(--ac-body-hi, #e6e6e6), var(--ac-body, var(--secondary-background-color, #d7d7d7)) 45%, var(--ac-body-lo, #aeb2b5));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .hp-grille {
          position: absolute; left: 5px; top: 5px; width: 48px; height: 48px; border-radius: 50%;
          background: #14161a; overflow: hidden; box-shadow: 0 0 0 2px var(--ac-body-lo, #aeb2b5);
        }
        .hp-fan {
          position: absolute; inset: 5px; border-radius: 50%;
          background: conic-gradient(#6b737c 0 16%, transparent 16% 33.3%, #6b737c 33.3% 49.3%, transparent 49.3% 66.6%, #6b737c 66.6% 82.6%, transparent 82.6%);
        }
        .hp-hub { position: absolute; left: 50%; top: 50%; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: #8a9096; }
        .hp-guard { position: absolute; inset: 0; border-radius: 50%; background: repeating-radial-gradient(circle, transparent 0 5px, rgba(255, 255, 255, 0.14) 5px 6px); }
        .hp-frost { position: absolute; inset: 0; border-radius: 50%; opacity: 0; background: radial-gradient(circle, rgba(225, 245, 254, 0.15) 35%, rgba(225, 245, 254, 0.9) 100%); }
        .hp-side { position: absolute; left: 58px; right: 4px; top: 5px; bottom: 5px; }
        .hp-lcd {
          position: absolute; left: 0; right: 0; top: 0; height: 10px; border-radius: 2px;
          background: #14161a; color: #4fc3f7; text-align: center; font: 600 7px/10px ui-monospace, "SF Mono", monospace;
        }
        .hp-fins { position: absolute; left: 0; right: 0; top: 14px; bottom: 0; background: repeating-linear-gradient(180deg, var(--ac-body-lo, #aeb2b5) 0 1px, transparent 1px 4px); }
        .hp-foot { position: absolute; top: 65px; width: 10px; height: 4px; border-radius: 0 0 2px 2px; background: #3b4048; }
        .hp-foot.f1 { left: 6px; }
        .hp-foot.f2 { right: 6px; }
        /* Two pipes a circuit, the flow and the return. */
        .hp-pipe { position: absolute; top: 66px; width: 3px; height: 14px; background: #8a9096; overflow: hidden; }
        .hp-pipe.tank.flow { left: 20px; }
        .hp-pipe.tank.ret { left: 25px; }
        .hp-pipe.rad.flow { left: 62px; }
        .hp-pipe.rad.ret { left: 67px; }
        .hp-tank {
          position: absolute; left: 12px; top: 78px; width: 24px; height: 28px; border-radius: 8px / 5px; overflow: hidden;
          background: linear-gradient(90deg, var(--ac-body-lo, #aeb2b5), var(--ac-body, var(--secondary-background-color, #d7d7d7)) 35%, var(--ac-body-hi, #e6e6e6) 55%, var(--ac-body-lo, #aeb2b5));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .hp-tank i { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: linear-gradient(180deg, rgba(255, 87, 51, 0.75), rgba(255, 138, 60, 0.45)); }
        .hp-rad { position: absolute; left: 58px; right: 2px; top: 80px; height: 26px; }
        .hp-rad i {
          position: absolute; top: 0; bottom: 0; width: 5px; border-radius: 2px;
          background: var(--ac-body-lo, #aeb2b5); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
        }
        .hp-rad i:nth-child(1) { left: 0; }
        .hp-rad i:nth-child(2) { left: 7px; }
        .hp-rad i:nth-child(3) { left: 14px; }
        .hp-rad i:nth-child(4) { left: 21px; }
        .hp-rad i:nth-child(5) { left: 28px; }
        /* Underfloor heating as its symbol draws it (mdi:heating-coil): a pipe
           snaking across a slab seen from above at an angle, and the heat
           rising off it. The coil is drawn flat in a square and laid down at
           the slab's angle, so its runs lean exactly like the slab's edges. */
        .hp-floor { position: absolute; left: 56px; right: 2px; top: 78px; height: 28px; }
        .hp-slab { position: absolute; left: -2px; right: -2px; bottom: 2px; height: 15px; }
        .hp-coil {
          position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px;
          background: var(--ac-body-lo, #9aa0a6); transform: scaleY(0.357) rotate(45deg);
        }
        /* Four runs and three bends, one bend a box: its two long borders are
           two runs, and its rounded side the bend between them. */
        .hp-coil b {
          position: absolute; left: 3px; right: 3px; height: 10px; box-sizing: border-box;
          border: 3px solid #6b737c; border-left: 0; border-radius: 0 5px 5px 0;
        }
        .hp-coil b:nth-child(1) { top: 2px; }
        .hp-coil b:nth-child(2) { top: 9px; border-left: 3px solid #6b737c; border-right: 0; border-radius: 5px 0 0 5px; }
        .hp-coil b:nth-child(3) { top: 16px; }
        .hp-floor i {
          position: absolute; bottom: 17px; width: 6px; height: 13px; opacity: 0;
          background: linear-gradient(180deg, rgba(255, 183, 77, 0), rgba(255, 138, 60, 0.95));
          clip-path: polygon(63% 0%, 79% 7%, 90% 14%, 93% 21%, 86% 29%, 73% 36%, 56% 43%, 42% 50%, 34% 57%, 35% 64%, 44% 71%, 60% 79%, 76% 86%, 88% 93%, 93% 100%, 67% 100%, 62% 93%, 50% 86%, 34% 79%, 18% 71%, 9% 64%, 8% 57%, 16% 50%, 30% 43%, 47% 36%, 60% 29%, 67% 21%, 64% 14%, 53% 7%, 37% 0%);
        }
        .hp-floor i:nth-child(1) { left: 9px; }
        .hp-floor i:nth-child(2) { left: 19px; height: 16px; }
        .hp-floor i:nth-child(3) { left: 29px; height: 11px; }
        .machine.mode-space_heating .hp-floor i { animation: hp-rise 2.6s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-space_heating .hp-floor i:nth-child(2) { animation-delay: calc(-0.87s + var(--anim-offset, 0s)); }
        .machine.mode-space_heating .hp-floor i:nth-child(3) { animation-delay: calc(-1.74s + var(--anim-offset, 0s)); }
        @keyframes hp-rise {
          0% { opacity: 0; transform: translateY(5px) scaleY(0.75); }
          35% { opacity: 0.85; }
          100% { opacity: 0; transform: translateY(-9px) scaleY(1.1); }
        }
        /* The pipes drop onto the near edge of the slab. */
        .machine.underfloor .hp-pipe.rad.flow { left: 54px; height: 30px; }
        .machine.underfloor .hp-pipe.rad.ret { left: 59px; height: 28px; }
        /* With no tank on the left, what is left stands in the middle. */
        .machine.no-tank .hp-pipe.rad.flow { left: 35px; }
        .machine.no-tank .hp-pipe.rad.ret { left: 40px; }
        .machine.no-tank .hp-rad { left: 31px; right: 29px; }
        .machine.no-tank .hp-floor { left: 31px; right: 27px; }
        .machine.no-tank.underfloor .hp-pipe.rad.flow { left: 29px; }
        .machine.no-tank.underfloor .hp-pipe.rad.ret { left: 34px; }
        .machine.fan .hp-fan { animation: hp-spin 1.1s linear infinite; animation-delay: var(--anim-offset, 0s); }
        @keyframes hp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .machine.mode-space_heating .hp-lcd,
        .machine.mode-hot_water .hp-lcd { color: #ff7043; }
        /* Out hot and back cooler while it heats, out cold and back warmer
           while it cools: the two colours say which way the heat goes. */
        .machine.mode-space_heating .hp-pipe.rad.flow { background: #ff7043; }
        .machine.mode-space_heating .hp-pipe.rad.ret,
        .machine.mode-hot_water .hp-pipe.tank.ret { background: #4fc3f7; }
        .machine.mode-space_heating .hp-rad i { background: linear-gradient(180deg, #ffab91, #ff7043); animation: hp-glow 1.6s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-hot_water .hp-pipe.tank.flow { background: #ef5350; }
        .machine.mode-hot_water .hp-tank i { height: 100%; animation: hp-glow 1.6s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-space_heating .hp-coil { background: #ffe0d6; }
        .machine.mode-space_heating .hp-coil b { border-color: #ff7043; }
        .machine.mode-cooling .hp-pipe.rad.flow { background: #29b6f6; }
        .machine.mode-cooling .hp-pipe.rad.ret { background: #ff8a65; }
        .machine.mode-cooling .hp-rad i { background: linear-gradient(180deg, #b3e5fc, #29b6f6); }
        .machine.mode-cooling .hp-coil { background: #d8f1fd; }
        .machine.mode-cooling .hp-coil b { border-color: #29b6f6; }
        /* The water itself: light dashes running down the flow pipe and back
           up the return, on the circuit the pump is working. */
        .machine.flowing.mode-hot_water .hp-pipe.tank::after,
        .machine.flowing.mode-space_heating .hp-pipe.rad::after,
        .machine.flowing.mode-cooling .hp-pipe.rad::after {
          content: ""; position: absolute; inset: 0;
          background: repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0 2px, transparent 2px 6px);
          animation: hp-flow 0.8s linear infinite; animation-delay: var(--anim-offset, 0s);
        }
        .machine.flowing .hp-pipe.ret::after { animation-direction: reverse; }
        @keyframes hp-flow { from { background-position: 0 0; } to { background-position: 0 6px; } }
        @keyframes hp-glow { 0%, 100% { filter: brightness(0.9); } 50% { filter: brightness(1.15); } }
        .machine.mode-defrost .hp-frost { animation: hp-frost 2.4s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-defrost .hp-fins { background: repeating-linear-gradient(180deg, #b3e5fc 0 1px, transparent 1px 4px); }
        @keyframes hp-frost { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.9; } }
  `,
  pet_feeder: () => `
        /* Drawn from the feeders people actually buy: a smoked tank of kibble
           on an opaque base, a small dark panel with a lit screen, a chute on
           the front and a steel bowl in a holder moulded like the shell. Three
           families: the square tower, the round tank, and the double with two
           outlets and two bowls. The shell takes the appliance colour, dark by
           default, white for the round one, the way they are sold. */
        .machine { --pf-lo: var(--ac-body-lo, #1f2327); --pf-hi: var(--ac-body-hi, #4a5158); --pf-body: var(--ac-body, #34393e); }
        .machine.canister { --pf-lo: var(--ac-body-lo, #d8dcde); --pf-hi: var(--ac-body-hi, #ffffff); --pf-body: var(--ac-body, #f1f3f4); }
        .pf-shell {
          background: linear-gradient(90deg, var(--pf-lo), var(--pf-hi) 22%, var(--pf-body) 62%, var(--pf-lo));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.10);
        }
        .pf-floor {
          position: absolute; left: 8px; right: 8px; bottom: 0; height: 7px; border-radius: 50%;
          background: radial-gradient(closest-side, rgba(0, 0, 0, 0.20), transparent);
        }
        /* Kibble as it looks: matte discs, a lighter face and a darker edge,
           one family of browns, packed in a heap with a bumpy top. */
        .pf-kib { position: absolute; left: 0; right: 0; bottom: 0; background: ${KIBBLE_TILE}; background-size: 18px 12px; }
        .pf-kib::before {
          content: ""; position: absolute; left: 0; right: 0; top: -3px; height: 4px;
          background: ${KIBBLE_TOP}; background-size: 18px 4px;
        }
        /* Nothing left to serve: the tank and the bowls are drawn empty. */
        .machine.empty .pf-kib { display: none; }
        /* Smoked plastic, so the kibble is seen through grey, and never the
           appliance colour or a black feeder would hide it. */
        .pf-tank { position: absolute; overflow: hidden; background: #6d747a; }
        .pf-tank .pf-kib { height: var(--pf-fill, 22px); }
        .pf-tank::after {
          content: ""; position: absolute; inset: 0; border-radius: inherit;
          background: linear-gradient(90deg, rgba(28, 32, 36, 0.5), rgba(60, 66, 72, 0.14) 18%, rgba(255, 255, 255, 0.26) 27%, rgba(255, 255, 255, 0.04) 36%, rgba(60, 66, 72, 0.10) 78%, rgba(28, 32, 36, 0.5)),
            linear-gradient(180deg, rgba(40, 44, 48, 0.35), rgba(40, 44, 48, 0) 30%);
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
        }
        /* The screen shows the time, like the real ones; blue while it
           serves, red when something is wrong. */
        .pf-panel { position: absolute; width: 20px; height: 14px; border-radius: 2.5px; background: #1a1d21; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06); }
        .pf-lcd {
          position: absolute; left: 2px; right: 2px; top: 2px; height: 7px; border-radius: 1px; overflow: hidden;
          background: #0e1a1f; color: #7fdcff; text-align: center; white-space: nowrap;
          font: 700 5.2px/7px ui-monospace, "SF Mono", Menlo, monospace; text-shadow: 0 0 2px rgba(127, 220, 255, 0.7);
        }
        .machine.feeding .pf-lcd { background: #1e88e5; color: #ffffff; text-shadow: none; box-shadow: 0 0 3px rgba(30, 136, 229, 0.8); }
        .machine.alert .pf-lcd { background: #e53935; color: #ffffff; text-shadow: none; box-shadow: 0 0 3px rgba(229, 57, 53, 0.8); }
        .pf-keys {
          position: absolute; left: 2.5px; right: 2.5px; bottom: 2px; height: 2.4px;
          background: radial-gradient(circle, #59626b 0 0.95px, transparent 1.2px); background-size: 25% 100%;
        }
        .pf-chute {
          position: absolute; width: 11px; height: 13px; border-radius: 2px 2px 3px 3px;
          background: linear-gradient(180deg, #2a2f34, #15181b); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
        }
        /* A steel insert in a holder moulded like the shell, seen a little
           from above, with its heap standing over the rim. While it serves the
           heap is still small: the bowl is being filled. */
        .pf-bowl { position: absolute; left: 13px; width: 43px; bottom: 3px; height: 15px; }
        .pf-holder {
          position: absolute; left: 0; right: 0; top: 3.5px; bottom: 0; border-radius: 2px 2px 50% 50% / 2px 2px 60% 60%;
          background: linear-gradient(90deg, var(--pf-lo), var(--pf-hi) 25%, var(--pf-body) 60%, var(--pf-lo));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.10);
        }
        .pf-lip { position: absolute; left: 0; right: 0; top: 0; height: 9px; border-radius: 50%; background: var(--pf-hi); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.10); }
        .pf-steel {
          position: absolute; left: 3px; right: 3px; top: 1.5px; height: 6.2px; border-radius: 50%; overflow: hidden;
          background: radial-gradient(ellipse at 50% 75%, #9aa3aa, #dfe4e7 55%, #aab3b9);
        }
        .pf-steel .pf-kib { top: 1.2px; left: 0.8px; right: 0.8px; border-radius: 50%; }
        .pf-heap {
          position: absolute; left: 6px; right: 6px; top: -3.2px; height: 7px; overflow: hidden;
          border-radius: 50% 50% 0 0 / 100% 100% 0 0;
        }
        .pf-heap .pf-kib { top: 0; }
        .pf-steel .pf-kib::before, .pf-heap .pf-kib::before { display: none; }
        .machine.feeding .pf-heap { left: 12px; right: 12px; top: -0.8px; height: 4px; }
        .machine.empty .pf-heap { display: none; }
        .pf-fall i {
          position: absolute; left: 33px; top: 71px; width: 3px; height: 2.4px; border-radius: 50%; opacity: 0;
          background: #9a6c48; box-shadow: inset 0 -0.7px 0 #5f3b22;
        }
        .pf-fall i:nth-child(2) { margin-left: 2px; background: #8c5f3c; }
        .pf-fall i:nth-child(3) { margin-left: -1.5px; background: #a67856; }
        .machine.feeding .pf-fall i { animation: pf-fall 0.8s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.feeding .pf-fall i:nth-child(2) { animation-delay: calc(-0.27s + var(--anim-offset, 0s)); }
        .machine.feeding .pf-fall i:nth-child(3) { animation-delay: calc(-0.54s + var(--anim-offset, 0s)); }
        @keyframes pf-fall {
          0% { opacity: 0; transform: translateY(0) rotate(0); }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { opacity: 0; transform: translateY(13px) rotate(160deg); }
        }
        /* The square tower, the most common: a square tank under its lid, the
           chute on the left over the bowl and the screen on the right. */
        .pf-lid { position: absolute; left: 21px; right: 21px; top: 22px; height: 7px; border-radius: 4px 4px 1.5px 1.5px; }
        .pf-lid::after { content: ""; position: absolute; left: 19px; right: 19px; top: 2px; height: 1.5px; border-radius: 1px; background: rgba(0, 0, 0, 0.18); }
        .pf-tank.sq { left: 23px; right: 23px; top: 28px; height: 26px; border-radius: 0 0 2px 2px; }
        .pf-latch { position: absolute; right: 26px; top: 49px; width: 7px; height: 3px; border-radius: 1px; background: var(--pf-lo); }
        .pf-base { position: absolute; left: 23px; right: 23px; top: 54px; bottom: 6px; border-radius: 0 0 5px 5px; }
        .pf-base .pf-panel { right: 4px; top: 5px; }
        .pf-base .pf-chute { left: 6px; top: 6px; }
        /* The round tank: a smoked cylinder under a thick lid, a round base
           with a ribbed foot, the screen over the chute and the chute over the
           bowl, so the kibble falls straight. */
        .pf-cap {
          position: absolute; left: 21px; right: 21px; top: 5px; height: 10px; border-radius: 50%; z-index: 1;
          background: radial-gradient(ellipse at 42% 35%, var(--pf-hi), var(--pf-body) 55%, var(--pf-lo));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14);
        }
        .pf-cap::after { content: ""; position: absolute; left: 12px; right: 12px; top: 2.5px; height: 4px; border-radius: 50%; box-shadow: inset 0 0 0 0.8px rgba(0, 0, 0, 0.18); }
        .pf-rim { position: absolute; left: 21px; right: 21px; top: 10px; height: 4px; border-radius: 0 0 50% 50% / 0 0 100% 100%; }
        .pf-tank.rd { left: 23px; right: 23px; top: 12px; height: 34px; border-radius: 0 0 3px 3px; }
        .pf-drum { position: absolute; left: 23px; right: 23px; top: 45px; bottom: 5px; border-radius: 0 0 50% 50% / 0 0 4px 4px; }
        .pf-ribs {
          position: absolute; left: 1px; right: 1px; bottom: 0; height: 5px; border-radius: 0 0 50% 50% / 0 0 100% 100%;
          background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.14) 0 0.7px, transparent 0.7px 3px);
        }
        .pf-drum .pf-panel { left: 4px; top: 5px; width: 22px; }
        .pf-drum .pf-chute { left: 10px; top: 21px; width: 10px; height: 11px; }
        .machine.canister .pf-bowl { left: 17px; width: 42px; bottom: 2px; }
        .machine.canister .pf-fall i { left: 36px; top: 72px; }
        /* The double: one wide body with a level slot and a steel band, and
           two outlets on its front, each over its own bowl. */
        .pf-dbody { position: absolute; left: 17px; right: 17px; top: 12px; bottom: 10px; border-radius: 9px 9px 4px 4px; }
        .pf-dbody::before { content: ""; position: absolute; left: 0; right: 0; top: 8px; height: 1px; background: rgba(0, 0, 0, 0.25); }
        .pf-dbody .pf-panel { left: 50%; top: 1px; width: 18px; height: 6px; margin-left: -9px; background: none; box-shadow: none; }
        .pf-dbody .pf-lcd { top: 0; height: 5px; font-size: 4.2px; line-height: 5px; }
        .pf-slot { position: absolute; left: 50%; top: 11px; width: 4px; height: 16px; margin-left: -2px; border-radius: 2px; overflow: hidden; background: #3e454b; }
        .pf-slot .pf-kib { height: var(--pf-fill, 9px); }
        .pf-slot .pf-kib::before { display: none; }
        .pf-band { position: absolute; left: 0; right: 0; top: 30px; height: 4px; background: linear-gradient(180deg, #8d969d, #eef1f3 45%, #a9b1b7); }
        .pf-band i { position: absolute; left: 50%; top: 0.5px; width: 3px; height: 3px; margin-left: -1.5px; border-radius: 50%; background: #1a1d21; }
        .pf-dbody .pf-chute { top: 55px; width: 10px; height: 11px; }
        .pf-dbody .pf-chute.a { left: 4px; }
        .pf-dbody .pf-chute.b { right: 4px; }
        .machine.double .pf-bowl { bottom: 2px; width: 36px; height: 14px; }
        .machine.double .pf-bowl.a { left: 4px; }
        .machine.double .pf-bowl.b { left: auto; right: 4px; }
        .machine.double .pf-fall i { top: 73px; }
        .machine.double .pf-fall.a i { left: 24px; }
        .machine.double .pf-fall.b i { left: 69px; }
        .machine.double.feeding .pf-fall.b i { animation-delay: calc(-0.4s + var(--anim-offset, 0s)); }
        .machine.double.feeding .pf-fall.b i:nth-child(2) { animation-delay: calc(-0.67s + var(--anim-offset, 0s)); }
        .machine.double.feeding .pf-fall.b i:nth-child(3) { animation-delay: calc(-0.94s + var(--anim-offset, 0s)); }
        /* Two hoppers, one split bowl: a tall body with two smoked windows,
           a base with the screen and two outlets, and one wide bowl with a
           ridge down its middle, each half under its own outlet. */
        .pf-sbody { position: absolute; left: 18px; right: 18px; top: 6px; height: 54px; border-radius: 7px 7px 2px 2px; }
        .pf-sbody::before { content: ""; position: absolute; left: 0; right: 0; top: 6px; height: 1px; background: rgba(0, 0, 0, 0.25); }
        .pf-sbody .pf-tank { top: 10px; width: 23px; height: 38px; border-radius: 2px; }
        .pf-sbody .pf-tank.a { left: 5px; }
        .pf-sbody .pf-tank.b { right: 5px; }
        .pf-sbody .pf-tank.b .pf-kib { height: var(--pf-fill-b, 22px); }
        .pf-sbase { position: absolute; left: 16px; right: 16px; top: 60px; bottom: 16px; border-radius: 0 0 4px 4px; }
        .pf-sbase .pf-panel { left: 50%; top: 3px; margin-left: -10px; }
        .pf-sbase .pf-chute { top: 15px; }
        .pf-sbase .pf-chute.a { left: 6px; }
        .pf-sbase .pf-chute.b { right: 6px; }
        .machine.dual_split .pf-bowl { left: 10px; width: 76px; bottom: 3px; height: 16px; }
        .machine.dual_split .pf-steel .pf-kib.a { right: 50%; border-radius: 50% 0 0 50%; }
        .machine.dual_split .pf-steel .pf-kib.b { left: 50%; border-radius: 0 50% 50% 0; }
        .pf-divider { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--pf-hi); box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.15); }
        .machine.dual_split .pf-heap.a { left: 8px; right: 54%; }
        .machine.dual_split .pf-heap.b { left: 54%; right: 8px; }
        .machine.dual_split.feeding .pf-heap { top: -0.8px; height: 4px; }
        .machine.dual_split.feeding .pf-heap.a { left: 14px; right: 60%; }
        .machine.dual_split.feeding .pf-heap.b { left: 60%; right: 14px; }
        .machine.dual_split .pf-fall i { top: 86px; }
        .machine.dual_split .pf-fall.a i { left: 26px; }
        .machine.dual_split .pf-fall.b i { left: 67px; }
        .machine.dual_split.feeding .pf-fall.b i { animation-delay: calc(-0.4s + var(--anim-offset, 0s)); }
        .machine.dual_split.feeding .pf-fall.b i:nth-child(2) { animation-delay: calc(-0.67s + var(--anim-offset, 0s)); }
        .machine.dual_split.feeding .pf-fall.b i:nth-child(3) { animation-delay: calc(-0.94s + var(--anim-offset, 0s)); }
        /* One hopper empties at a time: only its window and its half go bare. */
        .machine.dual_split.empty .pf-kib, .machine.dual_split.empty .pf-heap { display: block; }
        .machine.dual_split.empty-a .pf-tank.a .pf-kib, .machine.dual_split.empty-a .pf-steel .pf-kib.a, .machine.dual_split.empty-a .pf-heap.a,
        .machine.dual_split.empty-b .pf-tank.b .pf-kib, .machine.dual_split.empty-b .pf-steel .pf-kib.b, .machine.dual_split.empty-b .pf-heap.b { display: none; }
        /* The rotating wet-food feeder: a round base seen a little from above,
           a lid with a hub in its middle and one opening at the front. The
           flap lifts while it serves and shows the plate under it. */
        .pf-rwall { position: absolute; left: 6px; right: 6px; top: 52px; bottom: 12px; border-radius: 0 0 50% 50% / 0 0 16px 16px; }
        .pf-rwall .pf-panel { left: 50%; top: 18px; margin-left: -10px; }
        .pf-rtop {
          position: absolute; left: 6px; right: 6px; top: 36px; height: 32px; border-radius: 50%;
          background: radial-gradient(ellipse at 45% 35%, var(--pf-hi), var(--pf-body) 60%, var(--pf-lo));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14);
        }
        .pf-rhub { position: absolute; left: 38px; right: 38px; top: 44px; height: 9px; border-radius: 50%; background: var(--pf-lo); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18); }
        .pf-rwin { position: absolute; left: 30px; right: 30px; top: 54px; height: 12px; border-radius: 50%; overflow: hidden; background: #22272c; }
        .pf-rplate {
          position: absolute; left: 4px; right: 4px; top: 2px; bottom: 2px; border-radius: 50%;
          background: radial-gradient(ellipse at 50% 70%, #9aa3aa, #e4e8eb 60%, #b0b8be);
        }
        .pf-wet {
          position: absolute; left: 6px; right: 6px; top: 1.5px; bottom: 2px; border-radius: 50%;
          background: radial-gradient(ellipse at 40% 35%, #b5764b, #8a4f2e 60%, #6a3a20);
        }
        .machine.rotary.empty .pf-wet { display: none; }
        .pf-rflap {
          position: absolute; left: 30px; right: 30px; top: 54px; height: 12px; border-radius: 50%;
          background: radial-gradient(ellipse at 50% 30%, var(--pf-hi), var(--pf-body));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.22); transition: transform 0.4s ease, opacity 0.4s ease;
        }
        .machine.rotary.feeding .pf-rflap { transform: translateY(-8px) scaleY(0.5); opacity: 0; }
        .machine.dual_split .pf-cat, .machine.rotary .pf-cat { left: auto; right: 0; }
        .machine.dual_split .pf-alert, .machine.rotary .pf-alert { left: auto; right: 12px; }
        /* The cat, when there is something to be cross about: an empty tank or a
           jam. Its proportions are the ones every grumpy cat is drawn with: a
           head that takes half the height and nearly all the width, a small
           body tucked under it, and the tail curled round the front. */
        .pf-cat { position: absolute; left: 0; bottom: 3px; width: 42px; height: 44px; }
        .pf-cat .body {
          position: absolute; left: 9px; bottom: 0; width: 24px; height: 17px;
          border-radius: 12px 12px 9px 9px; background: #e7dbcf;
        }
        .pf-cat .paw {
          position: absolute; bottom: 0; width: 8px; height: 5px; border-radius: 4px 4px 3px 3px;
          background: #f6efe6;
        }
        .pf-cat .paw.l { left: 13px; }
        .pf-cat .paw.r { right: 13px; }
        .pf-cat .head {
          position: absolute; left: 1px; bottom: 12px; width: 40px; height: 30px;
          border-radius: 50% 50% 46% 46% / 46% 46% 54% 54%; background: #efe5da;
        }
        /* Small ears, set wide and tilted out, with the darker point a seal
           point cat carries. */
        .pf-cat .ear {
          position: absolute; bottom: 34px; width: 12px; height: 11px; background: #a1887f;
          clip-path: polygon(50% 0, 100% 100%, 0 100%);
        }
        .pf-cat .ear span {
          position: absolute; left: 50%; bottom: 0; width: 6px; height: 6px; margin-left: -3px;
          background: #d8b7ad; clip-path: polygon(50% 0, 100% 100%, 0 100%);
        }
        .pf-cat .ear.l { left: 0; transform: rotate(-18deg); }
        .pf-cat .ear.r { right: 0; transform: rotate(18deg); }
        /* The lids do the sulking: thick, level, and low over the eye. */
        /* The eye is a low almond, and most of it is lid: on a grumpy cat the
           open part is a slit, which is what makes the stare. */
        .pf-cat .eye {
          position: absolute; top: 10px; width: 11px; height: 7px; border-radius: 1px 1px 5px 5px;
          background: #bcd6e6; border-top: 4px solid #4a4a46; overflow: hidden;
        }
        /* A big pupil, cut off at the top by the lid: on both drawings it takes
           most of what the eye still shows. */
        .pf-cat .eye span {
          position: absolute; left: 50%; top: -1px; width: 6px; height: 6px; margin-left: -3px;
          border-radius: 50%; background: #3a3f45;
        }
        .pf-cat .eye.l { left: 5px; transform: rotate(7deg); }
        .pf-cat .eye.r { right: 5px; transform: rotate(-7deg); }
        .pf-cat .muzzle {
          position: absolute; left: 50%; bottom: 2px; width: 21px; height: 13px; margin-left: -10.5px;
          border-radius: 50%; background: #faf4ec;
        }
        .pf-cat .nose {
          position: absolute; left: 50%; bottom: 8px; width: 5px; height: 4px; margin-left: -2.5px;
          background: #c98f8f; clip-path: polygon(50% 100%, 100% 0, 0 0);
        }
        .pf-cat .mouth {
          position: absolute; bottom: 3px; width: 7px; height: 5px;
          border-top: 1.8px solid #7a675d; border-radius: 50%;
        }
        .pf-cat .mouth.l { left: 50%; margin-left: -7px; }
        .pf-cat .mouth.r { left: 50%; margin-left: 0; }
        .pf-cat .whisk {
          position: absolute; bottom: 8px; width: 12px; height: 1px; border-radius: 1px;
          background: rgba(122, 103, 93, 0.5);
        }
        .pf-cat .whisk.l { left: -5px; transform: rotate(9deg); box-shadow: 1px 4px 0 0 rgba(122, 103, 93, 0.4); }
        .pf-cat .whisk.r { right: -5px; transform: rotate(-9deg); box-shadow: -1px 4px 0 0 rgba(122, 103, 93, 0.4); }
        /* The tail comes round the front, as a sitting cat lays it. */
        .pf-cat .tail {
          position: absolute; left: -3px; bottom: -1px; width: 17px; height: 13px;
          border: 4.5px solid #d9ccbf; border-top-color: transparent; border-right-color: transparent;
          border-radius: 0 0 0 12px;
        }
        /* The warning sits straight above its head: the two say the same thing,
           so they are read together. */
        .pf-alert { position: absolute; left: 12px; top: 38px; width: 18px; height: 16px; }
        .pf-alert::before {
          content: ""; position: absolute; inset: 0; background: var(--error-color, #f44336);
          clip-path: polygon(50% 0, 100% 100%, 0 100%);
        }
        .pf-alert i { position: absolute; left: 50%; background: #fff; }
        .pf-alert .bar { top: 5.5px; width: 2.5px; height: 5px; margin-left: -1.25px; border-radius: 1.25px; }
        .pf-alert .dot { top: 12px; width: 2.5px; height: 2.5px; margin-left: -1.25px; border-radius: 50%; }
        .pf-fall { position: absolute; inset: 0; }
        /* On the round tank and the double the bowls are on the left or on
           both sides, and the screen on the left: the cat sits on the right. */
        .machine.canister .pf-cat, .machine.double .pf-cat { left: auto; right: 0; }
        .machine.canister .pf-alert, .machine.double .pf-alert { left: auto; right: 12px; }
  `,
  kettle: () => `
        .kt-base { position: absolute; left: 20px; right: 20px; bottom: 6px; height: 7px; border-radius: 3px; background: #3b4048; }
        .kt-body {
          position: absolute; left: 24px; right: 24px; top: 26px; bottom: 13px;
          background: var(--ac-body, var(--secondary-background-color, #d7d7d7));
          border: 1px solid var(--divider-color, #c7c7c7);
          border-radius: 4px 4px 10px 10px;
          clip-path: polygon(12% 0, 88% 0, 100% 100%, 0 100%); overflow: hidden;
        }
        .kt-water { position: absolute; left: 0; right: 0; bottom: 0; height: 52%; background: rgba(79, 195, 247, 0.34); }
        .kt-lcd {
          position: absolute; left: 50%; transform: translateX(-50%); top: 38px; z-index: 2;
          height: 11px; min-width: 24px; padding: 0 3px; border-radius: 2px;
          background: #14161a; color: #ff7043; text-align: center;
          font: 600 7px/11px ui-monospace, "SF Mono", monospace;
        }
        .kt-lid {
          position: absolute; left: 34px; right: 34px; top: 20px; height: 7px; border-radius: 3px;
          background: var(--ac-body, var(--secondary-background-color, #d7d7d7)); border: 1px solid var(--divider-color, #c7c7c7);
        }
        .kt-knob {
          position: absolute; left: 50%; transform: translateX(-50%); top: 15px; width: 9px; height: 5px;
          border-radius: 3px 3px 0 0; background: var(--disabled-text-color, #9e9e9e);
        }
        .kt-spout {
          position: absolute; left: 13px; top: 30px; width: 0; height: 0;
          border-left: 11px solid transparent;
          border-bottom: 9px solid var(--ac-body, var(--secondary-background-color, #d7d7d7));
          filter: drop-shadow(-1px 0 0 var(--divider-color, #c7c7c7));
        }
        .kt-handle {
          position: absolute; right: 8px; top: 30px; width: 17px; height: 40px;
          border: 3px solid var(--ac-body, var(--secondary-background-color, #d7d7d7)); border-left: none;
          border-radius: 0 14px 14px 0; box-shadow: 1px 0 0 var(--divider-color, #c7c7c7);
        }
        /* Heating: the base glows, the water bubbles and steam leaves the spout. */
        .machine.on .kt-base { background: #ff7043; box-shadow: 0 0 10px 1px #ff7043; }
        .kt-bub { position: absolute; bottom: 6px; width: 5px; height: 5px; border-radius: 50%; background: rgba(255, 255, 255, 0.75); opacity: 0; }
        .kt-bub.b1 { left: 34px; }
        .kt-bub.b2 { left: 46px; }
        .kt-bub.b3 { left: 57px; }
        .machine.on .kt-bub { animation: kt-rise 1.6s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.on .kt-bub.b2 { animation-delay: calc(-0.55s + var(--anim-offset, 0s)); }
        .machine.on .kt-bub.b3 { animation-delay: calc(-1.1s + var(--anim-offset, 0s)); }
        @keyframes kt-rise {
          0% { transform: translateY(0); opacity: 0; }
          25% { opacity: 0.85; }
          100% { transform: translateY(-26px); opacity: 0; }
        }
        .kt-steam {
          position: absolute; top: 14px; width: 5px; height: 14px; border-radius: 3px; opacity: 0;
          background: linear-gradient(to top, rgba(200, 215, 230, 0.75), rgba(200, 215, 230, 0));
        }
        .kt-steam.s1 { left: 12px; }
        .kt-steam.s2 { left: 20px; }
        .machine.on .kt-steam { animation: kt-steam 2.2s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.on .kt-steam.s2 { animation-delay: calc(-1.1s + var(--anim-offset, 0s)); }
        @keyframes kt-steam {
          0% { transform: translateY(6px) scaleY(0.6); opacity: 0; }
          35% { opacity: 0.9; }
          100% { transform: translateY(-10px) scaleY(1.25); opacity: 0; }
        }
  `,
  cooker: (color) => `
        .rc-base {
          position: absolute; left: 10px; right: 10px; top: 68px; bottom: 4px;
          border-radius: 7px;
          background: linear-gradient(160deg, var(--ac-body, var(--secondary-background-color, #d7d7d7)), var(--ac-body-lo, #bdbdbd));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .rc-disp {
          position: absolute; left: 8px; top: 9px; width: 30px; height: 12px;
          border-radius: 2px; background: #14161a; color: ${color}; text-align: center;
          font: 600 7px/11px ui-monospace, "SF Mono", monospace;
        }
        .rc-dial {
          position: absolute; right: 8px; top: 7px; width: 16px; height: 16px;
          border-radius: 50%; background: var(--disabled-text-color, #9e9e9e);
          box-shadow: inset 0 -1px 2px rgba(0, 0, 0, 0.35);
        }
        /* The bowl is drawn as a jug rather than as opaque metal: the blade is
           the whole point of the drawing and has to be visible. */
        .rc-bowl {
          position: absolute; left: 20px; right: 20px; top: 19px; height: 50px; overflow: hidden;
          background: rgba(255, 255, 255, 0.7);
          border: 1.5px solid var(--disabled-text-color, #9e9e9e);
          clip-path: polygon(0 0, 100% 0, 88% 100%, 12% 100%);
        }
        .rc-food { position: absolute; left: 0; right: 0; bottom: 0; height: 50%; background: rgba(186, 148, 96, 0.75); }
        /* Two graduations, so the bowl reads as a measuring jug rather than as
           a paper bag once the contents are pale. */
        .rc-grad { position: absolute; right: 6px; width: 7px; height: 1px; background: var(--divider-color, #c7c7c7); }
        .rc-grad.g1 { top: 14px; }
        .rc-grad.g2 { top: 24px; }
        .rc-blade {
          position: absolute; left: 50%; bottom: 7px; width: 28px; height: 3.5px; margin-left: -14px;
          border-radius: 2px; background: #5a6068;
        }
        .rc-blade::before {
          content: ""; position: absolute; inset: 0; border-radius: 2px;
          background: #5a6068; transform: rotate(72deg);
        }
        .machine.mixing .rc-blade { animation: rc-spin linear infinite; animation-delay: var(--anim-offset, 0s); }
        /* The speed shows in how often the turn comes round, not in how fast
           the blade travels: a turn too quick to follow reads as a glitch. */
        .machine.s1 .rc-blade { animation-duration: 2.6s; }
        .machine.s2 .rc-blade { animation-duration: 1.6s; }
        .machine.s3 .rc-blade { animation-duration: 0.9s; }
        @keyframes rc-spin {
          0% { transform: rotate(0deg); animation-timing-function: cubic-bezier(0.4, 0, 0.3, 1); }
          68% { transform: rotate(360deg); }
          100% { transform: rotate(360deg); }
        }
        /* Heating shows as the element under the bowl, not as a halo around the
           whole base: a glow that big read as a rendering fault. */
        /* Sits exactly on the seam between bowl and base, where the element is. */
        .rc-heat {
          position: absolute; left: 24px; right: 24px; top: 67px; height: 4px;
          border-radius: 2px; background: transparent;
        }
        .machine.heating .rc-heat { background: #ff7043; box-shadow: 0 0 6px 0 #ff7043; }
        .machine.heating .rc-food { background: rgba(214, 140, 90, 0.8); }
        .rc-lid {
          position: absolute; left: 19px; right: 19px; top: 12px; height: 9px; border-radius: 5px;
          background: var(--ac-body, var(--secondary-background-color, #d7d7d7)); border: 1px solid var(--divider-color, #c7c7c7);
        }
        .rc-cap {
          position: absolute; left: 50%; top: 5px; width: 12px; height: 8px; margin-left: -6px;
          border-radius: 3px 3px 0 0; background: var(--disabled-text-color, #9e9e9e);
        }
        .rc-steam {
          position: absolute; top: 0; width: 4px; height: 12px; border-radius: 2px; opacity: 0;
          background: linear-gradient(to top, rgba(200, 215, 230, 0.8), rgba(200, 215, 230, 0));
        }
        .rc-steam.v1 { left: 38px; }
        .rc-steam.v2 { left: 54px; }
        .machine.heating .rc-steam { animation: rc-vapour 2.4s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.heating .rc-steam.v2 { animation-delay: calc(-1.2s + var(--anim-offset, 0s)); }
        @keyframes rc-vapour {
          0% { transform: translateY(6px) scaleY(0.6); opacity: 0; }
          40% { opacity: 0.85; }
          100% { transform: translateY(-8px) scaleY(1.2); opacity: 0; }
        }
  `,
  coffee: (color) => `
        .cf-body {
          position: absolute; left: 14px; right: 14px; top: 2px; height: 64px; border-radius: 8px;
          background: linear-gradient(105deg, var(--ac-body, var(--secondary-background-color, #d7d7d7)), var(--ac-body-hi, #e6e6e6));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .cf-hopper {
          position: absolute; left: 22px; right: 22px; top: 5px; height: 12px; border-radius: 3px;
          background: #2a2e35; overflow: hidden;
        }
        .cf-bean { position: absolute; top: 4px; width: 5px; height: 4px; border-radius: 50%; background: #8d6e63; }
        .cf-bean.b1 { left: 20%; }
        .cf-bean.b2 { left: 44%; top: 6px; }
        .cf-bean.b3 { left: 66%; }
        /* Empty hopper: the beans stay, greyed, so the drawing still reads as a
           bean machine rather than losing a part. */
        .machine.no-beans .cf-bean { background: var(--disabled-text-color, #9e9e9e); opacity: 0.35; }
        /* Strength shows as how full the hopper looks. */
        .machine.st1 .cf-bean.b2, .machine.st1 .cf-bean.b3 { display: none; }
        .machine.st2 .cf-bean.b3 { display: none; }
        .cf-disp {
          position: absolute; left: 50%; top: 23px; transform: translateX(-50%);
          min-width: 32px; height: 11px; padding: 0 3px; border-radius: 2px;
          background: #14161a; color: ${color}; text-align: center;
          font: 600 7px/11px ui-monospace, "SF Mono", monospace;
        }
        /* Three keys under the display: without them the body is a blank slab. */
        .cf-key { position: absolute; top: 42px; width: 7px; height: 7px; border-radius: 50%; background: var(--disabled-text-color, #9e9e9e); }
        .cf-key.k1 { left: 32px; }
        .cf-key.k2 { left: 44px; }
        .cf-key.k3 { left: 56px; }
        .machine.pouring .cf-key.k2 { background: ${color}; }
        .cf-tank {
          position: absolute; right: 2px; top: 14px; width: 11px; height: 44px; border-radius: 3px;
          background: rgba(255, 255, 255, 0.5); border: 1px solid var(--divider-color, #c7c7c7); overflow: hidden;
        }
        .cf-water { position: absolute; left: 0; right: 0; bottom: 0; height: 62%; background: rgba(79, 195, 247, 0.45); }
        .machine.no-water .cf-water { height: 8%; background: var(--warning-color, #ff9800); opacity: 0.7; }
        .cf-spout { position: absolute; top: 66px; width: 4px; height: 5px; border-radius: 0 0 2px 2px; background: #4c525b; }
        .cf-spout.p1 { left: 41px; }
        .cf-spout.p2 { left: 51px; }
        .cf-stream { position: absolute; top: 71px; width: 2px; height: 13px; background: #6d4c41; opacity: 0; }
        .cf-stream.p1 { left: 42px; }
        .cf-stream.p2 { left: 52px; }
        .machine.pouring .cf-stream { animation: cf-pour 0.7s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.pouring .cf-stream.p2 { animation-delay: calc(-0.35s + var(--anim-offset, 0s)); }
        @keyframes cf-pour {
          0% { opacity: 0; transform: scaleY(0.2); transform-origin: top; }
          30% { opacity: 0.9; transform: scaleY(1); }
          100% { opacity: 0.9; transform: scaleY(1); }
        }
        .cf-cup {
          position: absolute; top: 83px; height: 15px; overflow: hidden;
          background: #fafafa; border: 1px solid var(--divider-color, #c7c7c7);
          border-radius: 2px 2px 8px 8px;
        }
        .cf-cup.c1 { left: 34px; right: 34px; }
        .cf-cup.c2 { display: none; }
        /* Two cups: the spouts move apart to stand over one each, the way the
           machine's own swivel outlet does. */
        .machine.two-cups .cf-cup.c1 { left: 27px; right: 49px; }
        .machine.two-cups .cf-cup.c2 { display: block; left: 49px; right: 27px; }
        .machine.two-cups .cf-spout.p1 { left: 35px; }
        .machine.two-cups .cf-spout.p2 { left: 57px; }
        .machine.two-cups .cf-stream.p1 { left: 36px; }
        .machine.two-cups .cf-stream.p2 { left: 58px; }
        .machine.two-cups .cf-ear { right: 20px; }
        .cf-fill { position: absolute; left: 0; right: 0; bottom: 0; height: 0; background: #6d4c41; transition: height 0.6s linear; }
        .machine.pouring .cf-fill { height: 62%; }
        .cf-ear {
          position: absolute; right: 27px; top: 86px; width: 7px; height: 9px;
          border: 2px solid var(--divider-color, #c7c7c7); border-left: none; border-radius: 0 6px 6px 0;
        }
        .cf-tray {
          position: absolute; left: 24px; right: 24px; top: 100px; height: 4px; border-radius: 2px;
          background: var(--disabled-text-color, #9e9e9e);
        }
        .machine.tray-full .cf-tray { background: var(--warning-color, #ff9800); }
        .cf-steam {
          position: absolute; top: 72px; width: 4px; height: 10px; border-radius: 2px; opacity: 0;
          background: linear-gradient(to top, rgba(200, 215, 230, 0.8), rgba(200, 215, 230, 0));
        }
        .cf-steam.p1 { left: 36px; }
        .cf-steam.p2 { left: 56px; }
        .machine.pouring .cf-steam { animation: cf-wisp 2s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.pouring .cf-steam.p2 { animation-delay: calc(-1s + var(--anim-offset, 0s)); }
        @keyframes cf-wisp {
          0% { transform: translateY(4px) scaleY(0.6); opacity: 0; }
          40% { opacity: 0.8; }
          100% { transform: translateY(-7px) scaleY(1.2); opacity: 0; }
        }
  `,
  rice_cooker: (color) => `
        /* Squat and round, nothing like the cooker's tall jug: a rice cooker is
           a closed pot, so there is no interior to show. */
        .rk-body {
          position: absolute; left: 8px; right: 8px; top: 34px; bottom: 8px;
          border-radius: 12px 12px 16px 16px;
          background: linear-gradient(105deg, var(--ac-body, var(--secondary-background-color, #d7d7d7)), var(--ac-body-hi, #e9e9e9) 55%, var(--ac-body-lo, #cfcfcf));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .rk-lid {
          position: absolute; left: 12px; right: 12px; top: 22px; height: 16px;
          border-radius: 12px 12px 4px 4px;
          background: linear-gradient(180deg, var(--ac-body-hi, #eeeeee), var(--ac-body, var(--secondary-background-color, #d7d7d7)));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .rk-vent {
          position: absolute; left: 50%; top: 15px; width: 14px; height: 9px; margin-left: -7px;
          border-radius: 4px 4px 2px 2px; background: var(--disabled-text-color, #9e9e9e);
        }
        .rk-handle {
          position: absolute; left: 20px; right: 20px; top: 8px; height: 10px;
          border: 2.5px solid var(--disabled-text-color, #9e9e9e); border-bottom: none;
          border-radius: 10px 10px 0 0;
        }
        .rk-disp {
          position: absolute; left: 50%; top: 46px; transform: translateX(-50%);
          min-width: 32px; height: 12px; padding: 0 3px; border-radius: 2px;
          background: #14161a; color: ${color}; text-align: center;
          font: 600 8px/12px ui-monospace, "SF Mono", monospace;
        }
        .rk-key { position: absolute; top: 66px; width: 8px; height: 8px; border-radius: 50%; background: var(--disabled-text-color, #9e9e9e); }
        .rk-key.k1 { left: 32px; }
        .rk-key.k2 { left: 44px; }
        .rk-key.k3 { left: 56px; }
        /* The element is the plate under the pot, so the glow belongs at the
           foot rather than around the whole body. */
        .rk-foot {
          position: absolute; left: 20px; right: 20px; bottom: 4px; height: 4px;
          border-radius: 2px; background: var(--disabled-text-color, #9e9e9e);
        }
        .machine.heating .rk-foot { background: #ff7043; box-shadow: 0 0 7px 0 #ff7043; }
        .machine.warm .rk-foot { background: #ffb300; box-shadow: 0 0 6px 0 #ffb300; }
        .machine.warm .rk-key.k3 { background: #ffb300; }
        .rk-steam {
          position: absolute; top: 0; width: 5px; height: 13px; border-radius: 3px; opacity: 0;
          background: linear-gradient(to top, rgba(200, 215, 230, 0.8), rgba(200, 215, 230, 0));
        }
        .rk-steam.w1 { left: 40px; }
        .rk-steam.w2 { left: 51px; }
        .machine.heating .rk-steam { animation: rk-puff 2.3s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.heating .rk-steam.w2 { animation-delay: calc(-1.15s + var(--anim-offset, 0s)); }
        @keyframes rk-puff {
          0% { transform: translateY(7px) scaleY(0.6); opacity: 0; }
          40% { opacity: 0.9; }
          100% { transform: translateY(-8px) scaleY(1.25); opacity: 0; }
        }
  `,
  // An iron in profile, nose to the left: the soleplate, the shell rising to
  // the back, the tank inside it and the handle over the top. The same iron is
  // drawn smaller on the base of a steam generator.
  // An air purifier in one of three shapes: a cylinder blowing out of its
  // top, a square box with its fan on top, or a bladeless ring that blows
  // forward, sideways while it oscillates, or backwards. Clean air is blue,
  // warm air orange, the night dims both, and a four-step gauge reads the
  // quality of the air.
  air_purifier: () => `${AIR_CSS}
        .pf-bar { position: absolute; z-index: 5; display: flex; gap: 0.8px; }
        .pf-bar i { flex: 1; border-radius: 1px; background: rgba(0, 0, 0, 0.16); }
        .machine.on.aq1 .pf-bar i:nth-child(-n+1), .machine.on.aq2 .pf-bar i:nth-child(-n+2), .machine.on.aq3 .pf-bar i:nth-child(-n+3), .machine.on.aq4 .pf-bar i,
        .machine.on.aq1 .dy-disp i:nth-child(-n+1), .machine.on.aq2 .dy-disp i:nth-child(-n+2), .machine.on.aq3 .dy-disp i:nth-child(-n+3), .machine.on.aq4 .dy-disp i {
          background: var(--aq); box-shadow: 0 0 2px var(--aq);
        }
        .pf-lcd {
          position: absolute; z-index: 5; border-radius: 2px; background: rgba(10, 14, 18, 0.92); color: #e3f2fd; text-align: center;
          font: 700 6.5px/9px ui-monospace, "SF Mono", Menlo, monospace; text-shadow: 0 0 2px currentColor;
        }
        .dy-round {
          position: absolute; z-index: 6; border-radius: 50%; background: radial-gradient(circle at 50% 40%, #1b2025, #07090b);
          box-shadow: 0 0 0 0.9px #b9bfc4, 0 0 0 1.4px rgba(0, 0, 0, 0.3);
        }
        .dy-round span {
          position: absolute; inset: 0; color: #e3f2fd; text-align: center; text-shadow: 0 0 1.5px currentColor;
          font: 700 10px/20px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; letter-spacing: -0.2px;
        }
        .machine:not(.on) .pf-lcd span, .machine:not(.on) .dy-round span { display: none; }
        .machine.mode-night .pf-bar, .machine.mode-night .dy-disp i { opacity: 0.35; }
        .machine.mode-night .pf-lcd, .machine.mode-night .dy-round span { opacity: 0.7; }
        .cy-body, .cy-ring, .cy-ctrl, .cy-perf, .co-top, .co-fan, .co-hub, .co-lid, .co-body, .co-perf { position: absolute; }
        .cy-body {
          z-index: 2; border-radius: 14px 14px 11px 11px / 10px 10px 7px 7px;
          background: linear-gradient(90deg, var(--ac-body-lo, #cfd6db), var(--ac-body-hi, #ffffff) 30%, var(--ac-body, #eceff1) 66%, var(--ac-body-lo, #cfd6db));
          box-shadow: inset 0 0 0 0.8px rgba(0, 0, 0, 0.14), 0 2px 3px rgba(0, 0, 0, 0.14);
        }
        .cy-ring { z-index: 3; border-radius: 50%; background: repeating-conic-gradient(from 0deg, #6b7379 0 3deg, #c4cacf 3deg 8deg); box-shadow: 0 0 0 1.2px #8a9298, inset 0 0 0 1px rgba(0, 0, 0, 0.25); }
        .cy-ctrl { z-index: 4; border-radius: 50%; background: radial-gradient(ellipse at 50% 40%, #3a4147, #15191c); box-shadow: 0 0 0 0.8px #6f777d; }
        .cy-perf { z-index: 3; -webkit-mask-image: linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent); mask-image: linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent); }
        .cy-perf i {
          position: absolute; inset: 0; background: radial-gradient(circle, rgba(0, 0, 0, 0.42) 0.75px, transparent 1px) 0 0 / 3px 3px;
          -webkit-mask-image: linear-gradient(180deg, transparent, #000 45%); mask-image: linear-gradient(180deg, transparent, #000 45%);
        }
        .co-top {
          z-index: 3; border-radius: 7px 7px 2px 2px / 5px 5px 1px 1px;
          background: linear-gradient(180deg, var(--ac-body, #eceff1), var(--ac-body-hi, #ffffff) 80%); box-shadow: inset 0 0 0 0.8px rgba(0, 0, 0, 0.14);
        }
        .co-fan { z-index: 4; border-radius: 50%; background: repeating-conic-gradient(from 0deg, #8e969c 0 3deg, #e3e7ea 3deg 9deg); box-shadow: 0 0 0 1px #b3babf, inset 0 0 0 1px rgba(0, 0, 0, 0.15); }
        .co-fan::before { content: ""; position: absolute; inset: 22%; border-radius: 50%; box-shadow: 0 0 0 0.8px rgba(0, 0, 0, 0.25); }
        .co-hub { z-index: 5; border-radius: 50%; background: radial-gradient(ellipse at 50% 35%, #ffffff, #d5dadd); box-shadow: 0 0 0 0.7px rgba(0, 0, 0, 0.25); }
        .co-lid {
          z-index: 3; border-radius: 1px; box-shadow: inset 0 0 0 0.8px rgba(0, 0, 0, 0.14), 0 1px 0 rgba(0, 0, 0, 0.18);
          background: linear-gradient(90deg, var(--ac-body-lo, #cfd6db), var(--ac-body-hi, #ffffff) 22%, var(--ac-body, #eceff1) 75%, var(--ac-body-lo, #cfd6db));
        }
        .co-body {
          z-index: 2; border-radius: 1px 1px 5px 5px / 1px 1px 3px 3px; box-shadow: inset 0 0 0 0.8px rgba(0, 0, 0, 0.12), 0 2px 3px rgba(0, 0, 0, 0.14);
          background: linear-gradient(90deg, var(--ac-body-lo, #cfd6db), var(--ac-body-hi, #ffffff) 18%, var(--ac-body, #eceff1) 75%, var(--ac-body-lo, #cfd6db));
        }
        .co-perf {
          z-index: 3; background: radial-gradient(circle, rgba(0, 0, 0, 0.42) 0.7px, transparent 0.95px) 0 0 / 2.8px 2.8px;
          -webkit-mask-image: linear-gradient(180deg, transparent, #000 40%); mask-image: linear-gradient(180deg, transparent, #000 40%);
        }
        .dy-foot, .dy-base, .dy-cap, .dy-disp, .dy-loop, .dy-back { position: absolute; }
        .dy-foot {
          z-index: 3; border-radius: 50%; box-shadow: 0 1.5px 2px rgba(0, 0, 0, 0.25), inset 0 0 0 0.6px rgba(0, 0, 0, 0.3);
          background: radial-gradient(ellipse at 50% 35%, var(--ac-body-hi, #ffffff), var(--ac-body, #eceff1) 55%, var(--ac-body-lo, #cfd6db));
        }
        .dy-base {
          z-index: 4; border-radius: 3px 3px 2px 2px / 2px 2px 1px 1px; box-shadow: inset 0 0 0 0.6px rgba(0, 0, 0, 0.3);
          background: linear-gradient(90deg, var(--ac-body-lo, #cfd6db), var(--ac-body-hi, #ffffff) 30%, var(--ac-body, #eceff1) 62%, var(--ac-body-lo, #cfd6db));
        }
        .dy-cap { z-index: 4; border-radius: 50%; background: linear-gradient(180deg, var(--ac-body-hi, #ffffff), var(--ac-body, #eceff1)); box-shadow: inset 0 0 0 0.6px rgba(0, 0, 0, 0.3); }
        .dy-disp {
          z-index: 5; display: flex; gap: 0.6px; padding: 1.5px 1.3px; box-sizing: border-box; border-radius: 1px;
          background: #0d1013; box-shadow: 0 0 0 0.6px rgba(255, 255, 255, 0.25);
        }
        .dy-disp i { flex: 1; border-radius: 0.4px; background: rgba(255, 255, 255, 0.1); }
        .dy-head { position: absolute; left: 0; top: 0; width: 96px; height: 108px; z-index: 5; transform-origin: 48px 50%; }
        .dy-loop {
          z-index: 5; box-sizing: border-box; border: 4.5px solid; border-radius: 16px;
          border-color: var(--ac-body-hi, #ffffff) var(--ac-body-lo, #cfd6db) var(--ac-body-lo, #cfd6db) var(--ac-body, #eceff1);
          box-shadow: 0 0 0 0.8px rgba(0, 0, 0, 0.35), inset 0 0 0 1.7px #c9ced3, inset 0.6px 0.6px 0 2.2px rgba(255, 255, 255, 0.75), inset 0 0 0 2.6px rgba(0, 0, 0, 0.25);
        }
        .dy-back { z-index: 4; overflow: hidden; border-radius: 12px; display: none; }
        .dy-back b {
          position: absolute; inset: 0; border: 1.6px solid var(--air, #42a5f5); border-radius: 12px; opacity: 0;
          animation: pf-aspire var(--spd, 1.6s) ease-in infinite; animation-delay: var(--anim-offset, 0s);
        }
        .dy-back b:nth-child(2) { animation-delay: calc(var(--spd, 1.6s) * -0.5 + var(--anim-offset, 0s)); }
        .dy-back b:nth-child(3) { animation-delay: calc(var(--spd, 1.6s) * -0.25 + var(--anim-offset, 0s)); }
        .dy-back b:nth-child(4) { animation-delay: calc(var(--spd, 1.6s) * -0.75 + var(--anim-offset, 0s)); }
        .machine.on.back .dy-back { display: block; }
        .machine.lv1 .dy-back b:nth-child(n+3), .machine.lv2 .dy-back b:nth-child(n+4) { display: none; }
        .machine.mode-night .dy-back { opacity: 0.45; }
        .machine.pf-ring .wind.l { transform: scaleX(-1); display: none; }
        .machine.on.osc .dy-head { animation: pf-pivot 5s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.on.osc .wind.r { animation: wind-r 5s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.on.osc .wind.l { display: block; animation: wind-l 5s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.back .wind, .machine.back.osc .wind.l { display: none; }
        @keyframes pf-pivot { 0%, 50%, 100% { transform: scaleX(1); } 25%, 75% { transform: scaleX(0.68); } }
        @keyframes pf-aspire { 0% { transform: scale(1); opacity: 0.95; } 100% { transform: scale(0.08); opacity: 0; } }
  `,
  // A fan on its stand or on a desk, a cage with its blades turning behind
  // it, or a ceiling fan seen from a little below: in summer it draws the air
  // up, in winter it sends the warm air under the ceiling back down.
  fan: () => `${AIR_CSS}
        .fn-rot { transform-origin: 50% 50%; transform-box: fill-box; }
        .machine.on .fn-rot { animation: fn-spin var(--rot, 0.6s) linear infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.on.nat .fn-rot { animation: fn-spin-nat 3s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.fn-ceiling .fn-rot { animation-direction: reverse; }
        .machine.fn-ceiling.rev .fn-rot { animation-direction: normal; }
        .machine.fn-ceiling.nat .fn-rot { animation-direction: reverse; }
        .machine.fn-ceiling.rev.nat .fn-rot { animation-direction: normal; }
        .machine.nat .wind path { animation-name: wind-flow, fn-gust; animation-duration: var(--spd, 1.6s), 3s; animation-timing-function: linear, ease-in-out; }
        .fn-blade { fill: var(--ac-body-lo, #cfd6db); fill-opacity: 0.85; stroke: rgba(0, 0, 0, 0.35); stroke-width: 0.6; }
        .fn-cage { fill: none; stroke: var(--ac-body-lo, #cfd6db); stroke-width: 0.6; opacity: 0.9; }
        .fn-cage .rim { stroke-width: 2.2; }
        .fn-hub { fill: var(--ac-body, #eceff1); stroke: rgba(0, 0, 0, 0.3); stroke-width: 0.6; }
        .fn-head { position: absolute; z-index: 2; transform-origin: 50% 50%; }
        .fn-pole, .fn-foot, .fn-ceil, .fn-canopy, .fn-housing, .fn-globe, .fn-plane, .fn-halo { position: absolute; }
        .fn-pole { z-index: 1; background: linear-gradient(90deg, var(--ac-body-lo, #cfd6db), var(--ac-body-hi, #ffffff) 40%, var(--ac-body-lo, #cfd6db)); box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.2); }
        .fn-foot {
          z-index: 1; border-radius: 50%; box-shadow: 0 1.5px 2px rgba(0, 0, 0, 0.25), inset 0 0 0 0.6px rgba(0, 0, 0, 0.3);
          background: radial-gradient(ellipse at 50% 35%, var(--ac-body-hi, #ffffff), var(--ac-body, #eceff1) 55%, var(--ac-body-lo, #cfd6db));
        }
        .machine.fn-stand .wind.l, .machine.fn-table .wind.l { transform: scaleX(-1); display: none; }
        .machine.on.osc .fn-head { animation: fn-turn 5s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.on.osc .wind.r { animation: wind-r 5s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.on.osc .wind.l { display: block; animation: wind-l 5s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .fn-ceil { z-index: 1; height: 1px; background: rgba(0, 0, 0, 0.18); }
        .fn-canopy { z-index: 2; border-radius: 0 0 6px 6px / 0 0 3px 3px; background: linear-gradient(90deg, var(--ac-body-lo, #cfd6db), var(--ac-body-hi, #ffffff) 40%, var(--ac-body-lo, #cfd6db)); box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.25); }
        .fn-plane { z-index: 3; transform: scaleY(0.26); }
        .fn-plane.front { z-index: 5; clip-path: path(evenodd, "M-60 -60H148V44H-60Z M37 28.6H51V44H37Z"); }
        .fn-plane .fn-blade { fill: var(--ac-body, #eceff1); fill-opacity: 1; stroke-width: 1.4; }
        .machine.wood .fn-plane .fn-blade { fill: url(#fn-wood); stroke: #4e2c14; }
        .fn-housing {
          z-index: 4; border-radius: 45% 45% 20% 20% / 40% 40% 30% 30%; box-shadow: inset 0 0 0 0.6px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0, 0, 0, 0.15);
          background: linear-gradient(90deg, var(--ac-body-lo, #cfd6db), var(--ac-body-hi, #ffffff) 35%, var(--ac-body, #eceff1) 68%, var(--ac-body-lo, #cfd6db));
        }
        .fn-globe { z-index: 6; border-radius: 0 0 50% 50% / 0 0 100% 100%; background: linear-gradient(180deg, #eef1f3, #c9d0d5); box-shadow: inset 0 0 0 0.6px rgba(0, 0, 0, 0.25); }
        .machine.lit .fn-globe { background: radial-gradient(ellipse at 50% 30%, #fffde7, #ffd54f 70%); box-shadow: 0 0 6px 2px rgba(255, 213, 79, 0.75), inset 0 0 0 0.6px rgba(0, 0, 0, 0.15); }
        .fn-halo { display: none; z-index: 0; border-radius: 50%; background: radial-gradient(circle, rgba(255, 213, 79, 0.28), transparent 70%); }
        .machine.lit .fn-halo { display: block; }
        .machine.fn-ceiling.rev { --air: #ff7043; }
        @keyframes fn-spin { to { transform: rotate(360deg); } }
        @keyframes fn-spin-nat { to { transform: rotate(1080deg); } }
        @keyframes fn-gust { 0%, 100% { stroke-opacity: 0.2; } 50% { stroke-opacity: 1; } }
        @keyframes fn-turn { 0%, 35%, 100% { transform: translateX(2px) scaleX(0.78); } 50%, 85% { transform: translateX(-2px) scaleX(0.78); } }
  `,
  // A network device, dark like most of them: the LEDs say everything.
  network: () => `
        .machine.nt > * { position: absolute; }
        .nt-body {
          background: linear-gradient(180deg, var(--ac-body-hi, #4a5157), var(--ac-body, #33383d) 45%, var(--ac-body-lo, #1f2327));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.22), 0 2px 3px rgba(0, 0, 0, 0.14); border-radius: 3px;
        }
        .nt-u {
          background: linear-gradient(180deg, var(--ac-body-hi, #4a5157), var(--ac-body, #33383d) 55%, var(--ac-body-lo, #1f2327));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.28); border-radius: 1px;
        }
        .nt-hi { height: 1px; background: rgba(255, 255, 255, 0.12); }
        .nt-led { width: 2.6px; height: 2.6px; border-radius: 50%; background: #3d434a; }
        .nt-port { background: #111417; border-radius: 0.8px; }
        .nt-port i { position: absolute; height: 1.5px; border-radius: 0.5px; background: #3d434a; }
        .nt-bay { background: #16191c; border-radius: 1.5px; }
        .nt-tray { background: repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.07) 0 1px, transparent 1px 3px); }
        .nt-handle { background: rgba(255, 255, 255, 0.16); border-radius: 1px; }
        .nt-key { border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.45); background: var(--ac-body-lo, #2a2e33); }
        .nt-dark { background: #121417; border-radius: 1px; }
        .nt-jack { background: #0d0f11; border-radius: 0.5px; }
        .nt-vent { background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.45) 0 1.2px, transparent 1.2px 3px); opacity: 0.6; }
        .nt-fan {
          border-radius: 50%;
          background: radial-gradient(circle, #2a2e33 0 18%, transparent 19%),
            conic-gradient(#555c63 0 12%, #1b1e21 12% 25%, #555c63 25% 37%, #1b1e21 37% 50%, #555c63 50% 62%, #1b1e21 62% 75%, #555c63 75% 87%, #1b1e21 87%);
        }
        .nt-glass { border-radius: 2px; background: linear-gradient(115deg, rgba(255, 255, 255, 0.18) 0 20%, rgba(255, 255, 255, 0.03) 20% 100%); box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.35); }
        .nt-floor { height: 5px; border-radius: 50%; background: radial-gradient(closest-side, rgba(0, 0, 0, 0.22), transparent); }
        .nt-on .nt-pw, .nt-busy .nt-pw { background: #2ecc71; box-shadow: 0 0 3px #2ecc71; }
        .nt-on .nt-lan { background: #2ecc71; animation: nt-flick 2.4s infinite; animation-delay: var(--anim-offset, 0s); }
        .nt-busy .nt-lan { background: #2ecc71; animation: nt-flick 0.4s infinite; animation-delay: var(--anim-offset, 0s); }
        .nt-on .nt-port.up i.a, .nt-busy .nt-port.up i.a { background: #2ecc71; }
        .nt-on .nt-port.up i.b { background: #ffb300; animation: nt-flick 3.2s infinite; animation-delay: var(--anim-offset, 0s); }
        .nt-busy .nt-port.up i.b { background: #ffb300; animation: nt-flick 0.45s infinite; animation-delay: var(--anim-offset, 0s); }
        .nt-on .d-ok, .nt-busy .d-ok { background: #2ecc71; }
        .nt-on .d-sleep, .nt-busy .d-sleep { background: #2ecc71; animation: nt-breathe 4s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .nt-on .d-gen { background: #4fc3f7; animation: nt-flick 2.8s infinite; animation-delay: var(--anim-offset, 0s); }
        .nt-on .d-busy, .nt-busy .d-busy, .nt-busy .d-gen { background: #4fc3f7; animation: nt-flick 0.35s infinite; animation-delay: var(--anim-offset, 0s); }
        .nt-on .d-warn, .nt-busy .d-warn { background: #ff9800; box-shadow: 0 0 3px #ff9800; }
        .nt-on .d-fail, .nt-busy .d-fail { background: #f44336; box-shadow: 0 0 3px #f44336; animation: nt-blink 1s steps(1) infinite; animation-delay: var(--anim-offset, 0s); }
        .nt-on .nt-fan:not(.stop) { animation: nt-spin 1.6s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .nt-busy .nt-fan:not(.stop) { animation: nt-spin 0.5s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .nt-alert .nt-fan { animation: nt-spinstop 3.2s cubic-bezier(0.3, 0, 0.35, 1) infinite; animation-delay: var(--anim-offset, 0s); }
        .nt-alert .nt-led, .nt-alert .nt-port.up i { background: #f44336; box-shadow: 0 0 3px #f44336; animation: nt-blink 1s steps(1) infinite; animation-delay: var(--anim-offset, 0s); }
        .nt-alert .nt-led.d-empty { background: #3d434a; box-shadow: none; animation: none; animation-delay: var(--anim-offset, 0s); }
        .nt-ant { background: linear-gradient(90deg, var(--ac-body-lo, #1f2327), var(--ac-body-hi, #4a5157)); border-radius: 1.6px 1.6px 0.8px 0.8px; }
        .nt-wave { border: 2px solid transparent; border-top-color: #4fc3f7; border-radius: 50%; opacity: 0; }
        .nt-on .nt-wave, .nt-busy .nt-wave { animation: nt-wave 2.4s ease-out infinite; animation-delay: var(--anim-offset, 0s); }
        .nt-busy .nt-wave { animation-duration: 1.2s; }
        .nt-nowifi .nt-wave { display: none; }
        .nt-on .nt-wan, .nt-busy .nt-wan { background: #2ecc71; }
        .nt-on .nt-wl, .nt-busy .nt-wl { background: #4fc3f7; box-shadow: 0 0 2px #4fc3f7; }
        .nt-nowifi .nt-wl { background: #3d434a; box-shadow: none; }
        @keyframes nt-wave { 0% { opacity: 0; } 30% { opacity: 0.9; } 100% { opacity: 0; } }
        .machine.nt-unav { opacity: 0.45; filter: grayscale(1); }
        @keyframes nt-blink { 50% { opacity: 0.15; } }
        @keyframes nt-flick { 0%, 100% { opacity: 1; } 30% { opacity: 0.1; } 55% { opacity: 1; } 70% { opacity: 0.2; } }
        @keyframes nt-breathe { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.8; } }
        @keyframes nt-spin { to { transform: rotate(360deg); } }
        @keyframes nt-spinstop { 0% { transform: rotate(0); } 55%, 100% { transform: rotate(900deg); } }
        @media (prefers-reduced-motion: reduce) { .machine.nt * { animation-name: none !important; } }
  `,
  // A pool pump, its sand filter, its pipes and its pool.
  pool_pump: () => `
        .machine.pl { --b: var(--ac-body, #3f4a54); --bh: var(--ac-body-hi, #62707c); --bl: var(--ac-body-lo, #252c33); }
        svg.pl-pp{position:absolute;left:0;top:0;width:96px;height:108px;overflow:visible}
        .pl-body{fill:url(#pl-g-body)}
        .pl-body-d{fill:var(--bl)}
        .pl-ring{fill:none;stroke:var(--bl);stroke-width:1;opacity:.6}
        .pl-pvc{fill:none;stroke:#cfd5da;stroke-width:4.6;stroke-linecap:butt}
        .pl-pvc-o{fill:none;stroke:#8e979f;stroke-width:6;stroke-linecap:butt}
        .pl-pvc-j{fill:#dfe3e6;stroke:#8e979f;stroke-width:.8}
        .pl-flow{fill:none;stroke:#4fc3f7;stroke-width:2.2;stroke-dasharray:3 4;stroke-linecap:round;opacity:0}
        .pl-m-running .pl-flow,.pl-m-backwash .pl-flow.pl-o,.pl-m-frost .pl-flow{opacity:1;animation:pl-flow .6s linear infinite}
        .pl-m-running .pl-flow.pl-w,.pl-m-frost .pl-flow.pl-w{opacity:0;animation:none}
        .pl-m-backwash .pl-flow.pl-w{opacity:1;stroke:#8d6e63;animation:pl-flow .45s linear infinite}
        .pl-m-backwash .pl-flow.pl-s{opacity:1;animation:pl-flow .45s linear infinite}
        .pl-m-backwash .pl-flow.pl-o{animation-duration:.45s}
        .pl-m-frost .pl-flow{stroke:#b3e5fc;animation-duration:1.2s}
        @keyframes pl-flow{to{stroke-dashoffset:-14}}
        @keyframes pl-spin{to{transform:rotate(360deg)}}
        .pl-needle{transform-box:view-box;transform-origin:34px 14.5px;transform:rotate(-120deg);stroke:#c62828;stroke-width:1;stroke-linecap:round;transition:transform .6s}
        .pl-m-running .pl-needle,.pl-m-frost .pl-needle{transform:rotate(-20deg)}
        .pl-m-backwash .pl-needle{transform:rotate(25deg)}
        .pl-m-error .pl-needle{transition:none;animation:pl-gauge 1.2s ease-in-out infinite}
        @keyframes pl-gauge{0%,100%{transform:rotate(-120deg)}50%{transform:rotate(120deg)}}
        .pl-lid-water{fill:url(#pl-g-water);opacity:.85}
        .pl-swirl{opacity:0}
        .pl-swirl path{fill:none;stroke:rgba(255,255,255,.9);stroke-width:.75;stroke-linecap:round;stroke-dasharray:1.6 1.6}
        .pl-m-running .pl-swirl,.pl-m-backwash .pl-swirl,.pl-m-frost .pl-swirl{opacity:1}
        .pl-m-running .pl-swirl path,.pl-m-backwash .pl-swirl path,.pl-m-frost .pl-swirl path{animation:pl-jet .5s linear infinite}
        @keyframes pl-jet{to{stroke-dashoffset:-3.2}}
        .pl-pool{fill:url(#pl-g-pool)}
        .pl-rip{fill:none;stroke:rgba(255,255,255,.7);stroke-width:.7;stroke-linecap:round;stroke-dasharray:3 4}
        .pl-m-running .pl-rip,.pl-m-frost .pl-rip{animation:pl-flow 2.2s linear infinite}
        .pl-spot{fill:#cfd8dc;stroke:#90a4ae;stroke-width:.8}
        .pl-glow{opacity:0}
        .pl-lamp .pl-spot{fill:#fff6c2;stroke:#ffd54f}
        .pl-lamp .pl-glow{opacity:1;animation:pl-breathe 3s ease-in-out infinite}
        .pl-can{fill:#f4f6f7;stroke:#9aa3ab;stroke-width:.8}
        .pl-can-l{fill:#d4e157}
        .pl-tube{fill:none;stroke:rgba(140,150,160,.85);stroke-width:1.2}
        .pl-drip{fill:none;stroke:#cddc39;stroke-width:1.6;stroke-dasharray:1.6 3.4;stroke-linecap:round;opacity:0}
        .pl-chlore .pl-drip{opacity:1;animation:pl-flow .9s linear infinite}
        .pl-chlore .pl-can-led{fill:#2ecc71;animation:pl-breathe 1.2s ease-in-out infinite}
        .pl-can-led{fill:#7c858d}
        .pl-ice{opacity:0}
        .pl-m-frost .pl-ice{opacity:1}
        .pl-snow{opacity:0}
        .pl-m-frost .pl-snow{opacity:1;animation:pl-breathe 2.4s ease-in-out infinite}
        .pl-sand{opacity:0}
        .pl-m-backwash .pl-sand{opacity:1}
        .pl-sand circle{fill:#d9c08f;animation:pl-churn 1.2s ease-in-out infinite}
        .pl-sand circle:nth-child(2){--d0:-.4s}
        .pl-sand circle:nth-child(3){--d0:-.8s}
        @keyframes pl-churn{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        .machine.pl-m-unav{opacity:.45;filter:grayscale(1)}
        @keyframes pl-blink{50%{opacity:.15}}
        @keyframes pl-breathe{0%,100%{opacity:.4}50%{opacity:1}}
        .pl-led{fill:#5a636b}
        .pl-m-running .pl-led,.pl-m-backwash .pl-led,.pl-m-frost .pl-led{fill:#2ecc71}
        .pl-m-error .pl-led{fill:#f44336;animation:pl-blink 1s steps(1) infinite}
        .pl-smoke{display:none}
        .pl-m-error .pl-smoke{display:block}
        .pl-smoke .pl-pf{transform-box:fill-box;transform-origin:50% 100%;animation:pl-puff 2s ease-out infinite}
        .pl-smoke .pl-pf2{--d0:-1s}
        .pl-smoke .pl-o{fill:#111417}
        .pl-smoke .pl-f{fill:#6b737b}
        .pl-smoke .pl-hl{fill:none;stroke:rgba(255,255,255,.75);stroke-width:1;stroke-linecap:round}
        @keyframes pl-puff{0%{transform:translateY(5px) scale(.45);opacity:0}20%{opacity:1}75%{opacity:1}100%{transform:translateY(-7px) scale(1.08);opacity:0}}
        .pl-ang{display:none;fill:none;stroke:#e53935;stroke-width:1.9;stroke-linecap:round;transform-box:fill-box;transform-origin:center;animation:pl-ang .7s ease-in-out infinite alternate}
        .pl-m-error .pl-ang{display:block}
        @keyframes pl-ang{from{transform:scale(.8)}to{transform:scale(1.15)}}
        .pl-nocl .pl-cl { display: none; }
        .machine.pl * { animation-delay: calc(var(--d0, 0s) + var(--anim-offset, 0s)) !important; }
        @media (prefers-reduced-motion: reduce) { .machine.pl * { animation-name: none !important; } }
  `,
  // A robot and its floor, its base and its station.
  robot: () => `${MINI_LCD_CSS}
        .machine.rbt { --b: var(--ac-body, #3a3f45); --bh: var(--ac-body-hi, #5a6168); --bl: var(--ac-body-lo, #1d2024); --dk: #2b2f34; --dkh: #41474e; }
        .machine.rbt > *, .rbt-dock > *, .rbt-mdock > *, .rbt-bin > *, .rbt-tk > * { position: absolute; }
        .rbt-rug{left:2px;right:2px;top:72px;height:34px;clip-path:polygon(12% 0,88% 0,100% 100%,0 100%);background:repeating-linear-gradient(90deg,#c8b79c 0 3px,#bfae92 3px 6px)}
        .rbt-tiles{left:2px;right:2px;top:72px;height:34px;clip-path:polygon(12% 0,88% 0,100% 100%,0 100%);background:linear-gradient(90deg,rgba(0,0,0,.08) 1px,transparent 1px) 0 0/12px 100%,linear-gradient(180deg,rgba(0,0,0,.08) 1px,transparent 1px) 0 0/100% 9px,#dfe4e8}
        .rbt-lawn{left:0;right:0;top:60px;height:46px;clip-path:polygon(10% 0,90% 0,100% 100%,0 100%);background:radial-gradient(ellipse at 50% 0,#6db457,#559d41 70%,#4a8f37)}
        .rbt-trace{height:9px;width:0;opacity:0}
        .rbt-trace.rbt-t1{left:6px;top:80px}
        .rbt-trace.rbt-t2{right:6px;top:88px}
        .rbt-tiles .rbt-trace{position:absolute}
        .rbt-tiles .rbt-trace.rbt-t1{left:2px;top:8px}
        .rbt-tiles .rbt-trace.rbt-t2{right:2px;top:16px}
        .rbt-rugtrace{background:repeating-linear-gradient(90deg,#d6c7ae 0 3px,#cdbca1 3px 6px)}
        .rbt-wet{background:linear-gradient(180deg,rgba(79,195,247,.15),rgba(79,195,247,.45),rgba(79,195,247,.15));border-radius:3px}
        .rbt-cut{background:repeating-linear-gradient(90deg,#8fcf6f 0 1.5px,#9fd97e 1.5px 3.5px)}
        .rbt-m-cleaning .rbt-t1{animation:rbt-t1 9s linear infinite}
        .rbt-m-cleaning .rbt-t2{animation:rbt-t2 9s linear infinite}
        @keyframes rbt-t1{0%{width:0;opacity:1}45%{width:84px;opacity:1}95%{width:84px;opacity:.5}100%{width:84px;opacity:0}}
        @keyframes rbt-t2{0%,50%{width:0;opacity:1}95%{width:84px;opacity:1}100%{width:84px;opacity:0}}
        @keyframes rbt-path{0%{transform:translate(-20px,8px)}45%{transform:translate(20px,8px)}50%{transform:translate(20px,16px)}95%{transform:translate(-20px,16px)}100%{transform:translate(-20px,8px)}}
        @keyframes rbt-ret{0%{transform:translate(20px,16px)}65%,100%{transform:translate(0,0)}}
        .rbt-dock{left:28px;top:14px;width:40px;height:56px;border-radius:0 0 20px 20px/0 0 6px 6px;background:linear-gradient(90deg,var(--bl),var(--b) 18%,var(--bh) 38%,var(--b) 68%,var(--bl))}
        .rbt-dcap{left:28px;top:8px;width:40px;height:12px;border-radius:50%;background:radial-gradient(ellipse at 45% 40%,var(--bh),var(--b) 80%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
        .rbt-plate{left:30px;top:72px;width:36px;height:5px;border-radius:0 0 18px 18px/0 0 4px 4px;background:linear-gradient(90deg,var(--bl),var(--dk) 40%,var(--bl))}
        .rbt-pcap{left:30px;top:66px;width:36px;height:9px;border-radius:50%;background:radial-gradient(ellipse at 50% 35%,var(--dkh),var(--dk) 80%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
        .rbt-pcap::before,.rbt-pcap::after{content:"";position:absolute;top:4px;width:6px;height:1.5px;border-radius:1px;background:#b0b7be}
        .rbt-pcap::before{left:9px}
        .rbt-pcap::after{right:9px}
        .rbt-dled{left:18px;top:4px;width:4px;height:2px;border-radius:1px;background:#3d434a}
        .rbt-bin{left:9px;top:10px;width:22px;height:24px;border-radius:4px;background:rgba(15,18,22,.55);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
        .rbt-bin .rbt-fill{left:0;right:0;bottom:0;height:var(--fill,30%);background:linear-gradient(180deg,#a99b86,#8d806d);transition:height 1s}
        .rbt-bin b{position:absolute;bottom:0;width:2px;height:2px;border-radius:50%;background:#bdb09a;opacity:0}
        .rbt-bin b:nth-child(2){left:6px}
        .rbt-bin b:nth-child(3){left:11px;--d0:.3s}
        .rbt-bin b:nth-child(4){left:16px;--d0:.6s}
        .rbt-m-emptying .rbt-bin b{animation:rbt-dust .9s linear infinite}
        .rbt-m-emptying .rbt-bin .rbt-fill{animation:rbt-fillup 6s ease-in-out infinite}
        @keyframes rbt-dust{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-22px);opacity:0}}
        @keyframes rbt-fillup{0%{height:30%}100%{height:62%}}
        .rbt-m-charging .rbt-dled,.rbt-m-emptying .rbt-dled{background:#2ecc71;box-shadow:0 0 3px #2ecc71;animation:rbt-breathe 2.4s ease-in-out infinite}
        .rbt-rb{left:22px;top:60px;width:52px;height:27px}
        .rbt-rb>*{position:absolute}
        .rbt-rb .rbt-sd{left:0;top:9px;width:52px;height:18px;border-radius:0 0 26px 26px/0 0 9px 9px;background:linear-gradient(90deg,var(--bl),var(--b) 20%,var(--bh) 40%,var(--b) 65%,var(--bl));box-shadow:0 2px 3px rgba(0,0,0,.25)}
        .rbt-rb .rbt-bmp{left:0;top:9px;width:52px;height:14px;box-sizing:border-box;border-radius:0 0 26px 26px/0 0 9px 9px;border-bottom:1px solid rgba(0,0,0,.4)}
        .rbt-rb .rbt-tp{left:0;top:0;width:52px;height:18px;border-radius:50%;background:radial-gradient(ellipse at 45% 40%,var(--bh),var(--b) 80%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
        .rbt-rb .rbt-lidw{left:20px;top:3px;width:12px;height:5px;border-radius:0 0 6px 6px/0 0 2.5px 2.5px;background:linear-gradient(90deg,#15181b,#3b4148 40%,#15181b)}
        .rbt-rb .rbt-lid{left:20px;top:.5px;width:12px;height:5px;border-radius:50%;background:radial-gradient(ellipse at 45% 40%,#4a5057,#24282c 80%)}
        .rbt-rb .rbt-ring{left:20px;top:10px;width:12px;height:4.5px;border-radius:50%;box-shadow:0 0 0 1.3px #59606a;background:var(--dk)}
        .rbt-rb .rbt-brush{left:0;bottom:0;width:24px;height:24px;transform:scaleY(.38);transform-origin:bottom}
        .rbt-rb .rbt-brush i{position:absolute;inset:0;border-radius:50%;background:conic-gradient(#1c1f23 0 6%,transparent 6% 33%,#1c1f23 33% 39%,transparent 39% 66%,#1c1f23 66% 72%,transparent 72%)}
        .rbt-m-cleaning .rbt-rb{animation:rbt-path 9s linear infinite}
        .rbt-m-cleaning .rbt-rb .rbt-brush i{animation:rbt-spin .35s linear infinite}
        .rbt-m-returning .rbt-rb{animation:rbt-ret 4.5s ease-in-out infinite}
        .rbt-m-paused .rbt-rb,.rbt-m-error .rbt-rb{transform:translate(-16px,14px)}
        .rbt-m-error .rbt-rb{transform:translate(-16px,14px) rotate(-9deg)}
        .rbt-ring{box-shadow:0 0 0 1.3px #59606a}
        .rbt-m-charging .rbt-ring{box-shadow:0 0 0 1.3px #2ecc71,0 0 4px #2ecc71;animation:rbt-breathe 2.4s ease-in-out infinite}
        .rbt-m-cleaning .rbt-ring{box-shadow:0 0 0 1.3px #4fc3f7,0 0 4px #4fc3f7}
        .rbt-m-returning .rbt-ring{box-shadow:0 0 0 1.3px #4fc3f7,0 0 4px #4fc3f7;animation:rbt-blink 1.2s steps(1) infinite}
        .rbt-m-paused .rbt-ring{box-shadow:0 0 0 1.3px #ffb300}
        .rbt-m-full .rbt-ring,.rbt-m-empty .rbt-ring{box-shadow:0 0 0 1.3px #ff9800,0 0 4px #ff9800}
        .rbt-m-emptying .rbt-ring{box-shadow:0 0 0 1.3px #2ecc71}
        .rbt-m-error .rbt-ring{box-shadow:0 0 0 1.3px #f44336,0 0 5px #f44336;animation:rbt-blink 1s steps(1) infinite}
        .rbt-rm{left:24px;top:60px;width:48px;height:27px}
        .rbt-rm>*{position:absolute}
        .rbt-rm .rbt-sd{left:0;top:9px;width:48px;height:16px;border-radius:0 0 12px 12px/0 0 8px 8px;background:linear-gradient(90deg,var(--bl),var(--b) 20%,var(--bh) 40%,var(--b) 65%,var(--bl));box-shadow:0 2px 3px rgba(0,0,0,.25)}
        .rbt-rm .rbt-pad{left:4px;bottom:-1px;width:40px;height:4px;border-radius:0 0 6px 6px;background:#cfd8dc}
        .rbt-m-cleaning .rbt-rm .rbt-pad{background:#81d4fa}
        .rbt-rm .rbt-tp{left:0;top:0;width:48px;height:18px;border-radius:12px/8px;background:radial-gradient(ellipse at 40% 30%,var(--bh),var(--b) 70%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)}
        .rbt-rm .rbt-tank{left:6px;top:4px;width:18px;height:9px;border-radius:3px;background:rgba(15,18,22,.35);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
        .rbt-rm .rbt-tank i{position:absolute;left:0;right:0;bottom:0;height:var(--lvl,70%);background:linear-gradient(180deg,#81d4fa,#29b6f6)}
        .rbt-m-empty .rbt-rm .rbt-tank i{background:#ff9800;height:12%}
        .rbt-rm .rbt-ring{left:30px;top:6px;width:11px;height:5px;border-radius:50%;background:var(--dk)}
        .rbt-m-cleaning .rbt-rm{animation:rbt-path 9s linear infinite}
        .rbt-m-returning .rbt-rm{animation:rbt-ret 4.5s ease-in-out infinite}
        .rbt-m-paused .rbt-rm,.rbt-m-empty .rbt-rm{transform:translate(-16px,14px)}
        .rbt-m-error .rbt-rm{transform:translate(-16px,14px) rotate(-9deg)}
        .rbt-mdock{left:22px;top:16px;width:52px;height:56px;border-radius:0 0 6px 6px;background:linear-gradient(90deg,var(--bl),var(--bh) 35%,var(--b) 70%,var(--bl));box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
        .rbt-mdock .rbt-tk{top:4px;width:19px;height:26px;border-radius:4px;overflow:hidden;background:rgba(15,18,22,.45);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14)}
        .rbt-mdock .rbt-tk.rbt-c{left:5px}
        .rbt-mdock .rbt-tk.rbt-d{right:5px}
        .rbt-mdock .rbt-tk i{position:absolute;left:0;right:0;bottom:0}
        .rbt-mdock .rbt-tk.rbt-c i{height:var(--clean,75%);background:linear-gradient(180deg,#81d4fa,#29b6f6)}
        .rbt-mdock .rbt-tk.rbt-d i{height:var(--dirty,20%);background:linear-gradient(180deg,#a1887f,#795548)}
        .rbt-mdock .rbt-dled{left:24px;top:35px}
        .rbt-mcap{left:22px;top:9px;width:52px;height:13px;border-radius:8px/6px;background:linear-gradient(180deg,var(--bh),var(--b));box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)}
        .rbt-m-washing .rbt-mdock .rbt-tk.rbt-c i{animation:rbt-drain 6s linear infinite}
        .rbt-m-washing .rbt-mdock .rbt-tk.rbt-d i{animation:rbt-fillup 6s linear infinite}
        @keyframes rbt-drain{0%{height:75%}100%{height:45%}}
        .rbt-bubbles{left:24px;top:76px;width:48px;height:8px;opacity:0}
        .rbt-m-washing .rbt-bubbles{opacity:1}
        .rbt-bubbles b{position:absolute;bottom:0;width:4px;height:4px;border-radius:50%;border:1px solid rgba(129,212,250,.9);animation:rbt-bub 1.3s ease-out infinite}
        .rbt-bubbles b:nth-child(1){left:4px}
        .rbt-bubbles b:nth-child(2){left:16px;--d0:.4s}
        .rbt-bubbles b:nth-child(3){left:28px;--d0:.8s}
        .rbt-bubbles b:nth-child(4){left:40px;--d0:.2s}
        @keyframes rbt-bub{0%{transform:translateY(0) scale(.5);opacity:0}30%{opacity:1}100%{transform:translateY(-12px) scale(1);opacity:0}}
        .rbt-vapor{left:26px;top:70px;width:44px;height:17px}
        .rbt-m-drying .rbt-vapor{display:block}
        .rbt-vapor path{stroke:#ff8a65}
        .rbt-smoke{position:absolute;display:none;overflow:visible;left:6px;top:-30px;width:40px;height:30px}
        .rbt-m-error .rbt-smoke{display:block}
        .rbt-smoke .rbt-pf{transform-box:fill-box;transform-origin:50% 100%;animation:rbt-puff 2s ease-out infinite}
        .rbt-smoke .rbt-pf2{--d0:-1s}
        .rbt-smoke .rbt-o{fill:#111417}
        .rbt-smoke .rbt-f{fill:#6b737b}
        .rbt-smoke .rbt-hl{fill:none;stroke:rgba(255,255,255,.75);stroke-width:1;stroke-linecap:round}
        @keyframes rbt-puff{0%{transform:translateY(5px) scale(.45);opacity:0}20%{opacity:1}75%{opacity:1}100%{transform:translateY(-7px) scale(1.08);opacity:0}}
        .rbt-angm{position:absolute;display:none;width:12px;height:12px;overflow:visible;z-index:2}
        .rbt-m-error .rbt-angm{display:block}
        .rbt-rb .rbt-angm{left:38px;top:-4px}
        .rbt-rm .rbt-angm{left:35px;top:-3px}
        .rbt-mw .rbt-angm{left:44px;top:6px;width:12px;height:12px}
        .rbt-angm .rbt-ang{fill:none;stroke:#e53935;stroke-width:1.9;stroke-linecap:round;transform-box:fill-box;transform-origin:center;animation:rbt-ang .7s ease-in-out infinite alternate}
        @keyframes rbt-ang{from{transform:scale(.8)}to{transform:scale(1.15)}}
        .rbt-rb .rbt-smoke,.rbt-rm .rbt-smoke{left:2px;top:-26px}
        .rbt-mw .rbt-smoke{left:4px;top:-22px}
        .rbt-smoke{transform-origin:50% 100%}
        .rbt-m-error .rbt-rb .rbt-smoke,.rbt-m-error .rbt-rm .rbt-smoke{transform:rotate(9deg)}
        .rbt-m-error .rbt-mw .rbt-smoke{transform:rotate(7deg)}
        .rbt-vapor{opacity:.8}
        .rbt-m-drying .rbt-ring{box-shadow:0 0 0 1.3px #4fc3f7;animation:rbt-breathe 2.4s ease-in-out infinite}
        .rbt-m-washing .rbt-ring{box-shadow:0 0 0 1.3px #4fc3f7;animation:rbt-breathe 1.2s ease-in-out infinite}
        .rbt-st-roof{left:38px;top:40px;width:58px;height:16px;clip-path:polygon(0 70%,100% 0,100% 30%,3% 100%);background:linear-gradient(180deg,var(--bh),var(--b) 60%,var(--bl))}
        .rbt-st-post{left:89px;top:42px;width:5px;height:46px;border-radius:1px;background:linear-gradient(90deg,var(--bl),var(--b),var(--bl))}
        .rbt-st-base{left:40px;top:83px;width:56px;height:8px;border-radius:50%;background:radial-gradient(ellipse at 50% 35%,var(--dkh),var(--dk) 80%);box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
        .rbt-st-tower{left:80px;top:66px;width:14px;height:22px;border-radius:7px 7px 2px 2px;background:linear-gradient(90deg,var(--bl),var(--b) 30%,var(--bh) 50%,var(--b) 75%,var(--bl))}
        .rbt-st-tower::after{content:"";position:absolute;left:-3px;top:13px;width:4px;height:3px;border-radius:1px;background:#b0b7be}
        .rbt-st-roof,.rbt-st-post{display:none}
        .rbt-roof .rbt-st-roof,.rbt-roof .rbt-st-post{display:block}
        .rbt-roof .rbt-st-tower{display:none}
        .rbt-roof .rbt-st-led{left:90.5px;top:50px}
        .rbt-st-led{left:86px;top:70px;width:2px;height:4px;border-radius:1px;background:#3d434a}
        .rbt-m-charging .rbt-st-led{background:#2ecc71;box-shadow:0 0 3px #2ecc71;animation:rbt-breathe 2.4s ease-in-out infinite}
        .rbt-mw{left:30px;top:53px;width:62px;height:35px;transform-origin:50% 100%}
        .rbt-mw svg{position:absolute;left:0;top:0;width:62px;height:35px;overflow:visible}
        .rbt-mw .rbt-whl{transform-box:fill-box;transform-origin:center}
        .rbt-mw .rbt-led{fill:#59606a}
        .rbt-m-charging .rbt-mw .rbt-led{fill:#2ecc71;animation:rbt-breathe 2.4s ease-in-out infinite}
        .rbt-m-cleaning .rbt-mw .rbt-led{fill:#4fc3f7}
        .rbt-m-returning .rbt-mw .rbt-led{fill:#4fc3f7;animation:rbt-blink 1.2s steps(1) infinite}
        .rbt-m-paused .rbt-mw .rbt-led{fill:#ffb300}
        .rbt-m-error .rbt-mw .rbt-led{fill:#f44336;animation:rbt-blink 1s steps(1) infinite}
        @keyframes rbt-mowpath{0%{transform:translate(-40px,8px)}45%{transform:translate(-4px,8px)}48%{transform:translate(-4px,8px) scaleX(-1)}95%{transform:translate(-40px,8px) scaleX(-1)}98%,100%{transform:translate(-40px,8px)}}
        @keyframes rbt-mowret{0%{transform:translate(-32px,8px)}70%,100%{transform:translate(0,0)}}
        .rbt-m-cleaning .rbt-mw{transform:translate(-14px,8px);animation:rbt-bob .5s ease-in-out infinite}
        @keyframes rbt-bob{50%{transform:translate(-14px,7.6px)}}
        .rbt-m-cleaning .rbt-st-base,.rbt-m-cleaning .rbt-st-tower,.rbt-m-cleaning .rbt-st-led,.rbt-m-cleaning .rbt-st-roof,.rbt-m-cleaning .rbt-st-post{display:none}
        .rbt-m-cleaning .rbt-mw .rbt-whl{animation:rbt-spin .9s linear infinite}
        .rbt-m-returning .rbt-mw{animation:rbt-mowret 4.5s ease-in-out infinite}
        .rbt-m-returning .rbt-mw .rbt-whl{animation:rbt-whlret 4.5s ease-in-out infinite}
        @keyframes rbt-whlret{0%{transform:rotate(0)}70%,100%{transform:rotate(1080deg)}}
        .rbt-m-paused .rbt-mw{transform:translate(-30px,8px)}
        .rbt-m-error .rbt-mw{transform:translate(-30px,8px) rotate(-7deg)}
        .rbt-stub{left:2px;top:92px;height:5px;width:46px;border-radius:2px;background:repeating-linear-gradient(90deg,#8bcf6c 0 1px,#79bf5c 1px 2.5px);display:none}
        .rbt-m-cleaning .rbt-stub{display:block;animation:rbt-scroll 1.4s linear infinite}
        .rbt-tall{left:48px;top:81px;width:47px;height:16px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='16'%3E%3Cpath d='M0.0 16 Q-0.7 10.2 -0.9 6.4 Q1.2 11.2 1.7 16Z' fill='%233f8a2e'/%3E%3Cpath d='M1.8 16 Q2.0 11.3 3.2 8.2 Q3.8 12.1 3.7 16Z' fill='%234f9b3a'/%3E%3Cpath d='M2.6 16 Q1.8 9.7 1.1 5.5 Q3.3 10.8 3.9 16Z' fill='%236fbd55'/%3E%3Cpath d='M3.5 16 Q4.4 9.1 6.6 4.5 Q5.9 10.2 5.2 16Z' fill='%23468f33'/%3E%3Cpath d='M5.4 16 Q5.2 9.0 5.9 4.4 Q7.3 10.2 7.4 16Z' fill='%233f8a2e'/%3E%3Cpath d='M6.9 16 Q6.7 11.2 7.3 7.9 Q8.4 12.0 8.5 16Z' fill='%23468f33'/%3E%3Cpath d='M8.1 16 Q7.4 7.9 7.3 2.5 Q9.3 9.2 9.7 16Z' fill='%234f9b3a'/%3E%3Cpath d='M9.3 16 Q8.4 9.2 7.8 4.6 Q9.9 10.3 10.6 16Z' fill='%234f9b3a'/%3E%3Cpath d='M10.7 16 Q11.3 9.2 12.9 4.7 Q12.7 10.4 12.3 16Z' fill='%236fbd55'/%3E%3Cpath d='M12.0 16 Q11.3 10.6 11.3 7.0 Q13.3 11.5 13.8 16Z' fill='%233f8a2e'/%3E%3Cpath d='M13.4 16 Q14.2 9.3 16.2 4.8 Q15.8 10.4 15.2 16Z' fill='%235fae47'/%3E%3Cpath d='M15.0 16 Q15.0 11.4 15.7 8.4 Q16.3 12.2 16.3 16Z' fill='%235fae47'/%3E%3Cpath d='M16.0 16 Q15.0 9.5 14.5 5.1 Q17.0 10.5 17.7 16Z' fill='%23468f33'/%3E%3Cpath d='M17.4 16 Q17.1 7.6 17.4 2.0 Q18.9 9.0 19.2 16Z' fill='%23468f33'/%3E%3Cpath d='M18.8 16 Q18.0 8.0 17.3 2.6 Q19.5 9.3 20.1 16Z' fill='%235fae47'/%3E%3Cpath d='M20.2 16 Q19.3 8.6 18.9 3.7 Q21.3 9.8 22.0 16Z' fill='%23468f33'/%3E%3Cpath d='M22.2 16 Q21.8 7.9 21.9 2.4 Q23.4 9.2 23.7 16Z' fill='%235fae47'/%3E%3Cpath d='M23.0 16 Q22.4 9.6 22.0 5.3 Q23.8 10.7 24.3 16Z' fill='%233f8a2e'/%3E%3Cpath d='M24.1 16 Q24.6 10.4 26.0 6.7 Q26.0 11.4 25.6 16Z' fill='%236fbd55'/%3E%3Cpath d='M25.0 16 Q25.1 9.6 26.2 5.4 Q27.0 10.7 26.9 16Z' fill='%236fbd55'/%3E%3Cpath d='M26.8 16 Q26.7 10.5 27.1 6.8 Q28.2 11.4 28.3 16Z' fill='%236fbd55'/%3E%3Cpath d='M28.8 16 Q28.1 11.1 27.8 7.8 Q29.7 11.9 30.2 16Z' fill='%234f9b3a'/%3E%3Cpath d='M29.6 16 Q29.0 7.8 28.7 2.4 Q30.5 9.2 31.0 16Z' fill='%234f9b3a'/%3E%3Cpath d='M30.9 16 Q31.0 10.0 32.2 6.0 Q33.0 11.0 32.9 16Z' fill='%23468f33'/%3E%3Cpath d='M32.8 16 Q33.3 8.7 34.8 3.8 Q34.8 9.9 34.4 16Z' fill='%23468f33'/%3E%3Cpath d='M34.1 16 Q33.3 9.9 33.0 5.8 Q35.2 10.9 35.8 16Z' fill='%233f8a2e'/%3E%3Cpath d='M35.1 16 Q35.0 7.1 35.5 1.1 Q36.3 8.6 36.4 16Z' fill='%23468f33'/%3E%3Cpath d='M36.0 16 Q35.3 11.8 34.9 9.0 Q36.7 12.5 37.3 16Z' fill='%235fae47'/%3E%3Cpath d='M37.5 16 Q36.9 11.5 36.8 8.4 Q38.6 12.2 39.0 16Z' fill='%235fae47'/%3E%3C/svg%3E") repeat-x 0 0/40px 16px;display:none}
        .rbt-m-cleaning .rbt-tall{display:block;animation:rbt-scroll 1.4s linear infinite}
        @keyframes rbt-scroll{to{background-position-x:-40px}}
        .rbt-clip{left:22px;top:24px;width:20px;height:12px;opacity:0}
        .rbt-m-cleaning .rbt-clip{opacity:1}
        .rbt-clip b{position:absolute;bottom:0;width:2.2px;height:1.1px;border-radius:1px;background:#8fdc6f;animation:rbt-clip .8s ease-out infinite}
        .rbt-clip b:nth-child(1){left:12px}
        .rbt-clip b:nth-child(2){left:14px;--d0:.13s}
        .rbt-clip b:nth-child(3){left:16px;--d0:.27s}
        .rbt-clip b:nth-child(4){left:13px;--d0:.4s}
        .rbt-clip b:nth-child(5){left:15px;--d0:.53s}
        .rbt-clip b:nth-child(6){left:17px;--d0:.67s}
        @keyframes rbt-clip{0%{transform:translate(0,2px) rotate(0);opacity:1}60%{opacity:1}100%{transform:translate(-9px,-4px) rotate(160deg);opacity:0}}
        .rbt-cloud{left:12px;top:2px;width:72px;height:26px;display:none}
        .rbt-m-raining .rbt-cloud{display:block}
        .rbt-cloud svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
        .rbt-rain{left:0;top:0;width:96px;height:100px;display:none;overflow:hidden}
        .rbt-m-raining .rbt-rain{display:block}
        .rbt-rain b{position:absolute;top:24px;width:.8px;height:7px;border-radius:1px;background:linear-gradient(180deg,rgba(160,200,240,0),rgba(150,195,240,.9));transform:rotate(12deg);animation:rbt-drop var(--d,.6s) linear infinite}
        .rbt-rain u{position:absolute;width:6px;height:2px;border-radius:50%;border:.8px solid rgba(180,215,245,.9);opacity:0;animation:rbt-splash var(--d,.6s) ease-out infinite}
        @keyframes rbt-drop{0%{transform:translate(0,0) rotate(12deg);opacity:0}10%{opacity:1}100%{transform:translate(-13px,64px) rotate(12deg);opacity:1}}
        @keyframes rbt-splash{0%,80%{transform:scale(.2);opacity:0}85%{opacity:1}100%{transform:scale(1.3);opacity:0}}
        .rbt-vapor path:nth-child(2) { --d0: -0.45s; }
        .rbt-vapor path:nth-child(3) { --d0: -0.9s; }
        .machine.rbt.rbt-base:not(.rbt-l-mower) { height: 80px; }
        .machine.rbt.rbt-base:not(.rbt-l-mower) > * { margin-top: -28px; }
        .rbt-base .rbt-dock, .rbt-base .rbt-dcap, .rbt-base .rbt-mdock, .rbt-base .rbt-mcap, .rbt-base .rbt-bubbles, .rbt-base .rbt-vapor { display: none; }
        .rbt-m-idle .rbt-rb, .rbt-m-idle .rbt-rm { transform: translate(-16px, 14px); }
        .rbt-m-idle .rbt-mw { transform: translate(-30px, 8px); }
        .machine.rbt-m-unav { opacity: 0.45; filter: grayscale(1); }
        @keyframes rbt-blink { 50% { opacity: 0.15; } }
        @keyframes rbt-breathe { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
        @keyframes rbt-spin { to { transform: rotate(360deg); } }
        .machine.rbt * { animation-delay: calc(var(--d0, 0s) + var(--anim-offset, 0s)) !important; }
        @media (prefers-reduced-motion: reduce) { .machine.rbt * { animation-name: none !important; } }
  `,
  // A hair dryer: its body in the appliance colour, the heater glowing in the
  // nozzle or the ring, and the air it blows.
  hair_dryer: () => `
        .hd-svg { position: absolute; left: 0; top: 0; width: 96px; height: 108px; overflow: visible; }
        .hd-s-hi { stop-color: var(--ac-body-hi, #ffffff); }
        .hd-s-body { stop-color: var(--ac-body, #e3e6ea); }
        .hd-part { fill: url(#hd-body); stroke: var(--ac-body-lo, #b9bec6); stroke-width: 1; }
        .hd-nozzle, .hd-grille { fill: var(--ac-body, #e3e6ea); stroke: var(--ac-body-lo, #b9bec6); stroke-width: 1; }
        .hd-btn { fill: var(--ac-body-lo, #b9bec6); }
        .hd-grip { stroke: var(--ac-body-lo, #b9bec6); stroke-width: 1.2; opacity: 0.8; }
        .hd-cord { fill: none; stroke: var(--ac-body-lo, #b9bec6); stroke-width: 2.2; stroke-linecap: round; }
        .hd-inner { fill: none; stroke: var(--ac-body-lo, #b9bec6); stroke-width: 1; opacity: 0.5; }
        .hd-led { fill: #9e9e9e; }
        .machine.mode-cool { --hd-air: #29b6f6; }
        .machine.mode-hot, .machine.mode-on { --hd-air: #ff7a2f; }
        .machine.mode-cool .hd-led { fill: #4fc3f7; }
        .machine.mode-hot .hd-led, .machine.mode-on .hd-led { fill: #ff8a3d; }
        .hd-a0 { stop-color: var(--hd-air, #ff7a2f); stop-opacity: 1; }
        .hd-a1 { stop-color: var(--hd-air, #ff7a2f); stop-opacity: 0; }
        .hd-air path {
          fill: none; stroke-width: 2.4; stroke-linecap: round; stroke-dasharray: 5 6;
          animation: hd-flow 0.55s linear infinite; animation-delay: var(--anim-offset, 0s);
        }
        .machine.mode-cool .hd-air path { animation-duration: 0.9s; }
        .hd-heat { opacity: 0; }
        .machine.mode-hot .hd-heat, .machine.mode-on .hd-heat {
          opacity: 1; animation: hd-glow 1.4s ease-in-out infinite alternate; animation-delay: var(--anim-offset, 0s);
        }
        .hd-rings circle {
          fill: none; stroke: var(--hd-air, #ff7a2f); stroke-width: 2; opacity: 0.5;
          transform-box: fill-box; transform-origin: center;
          animation: hd-ring 1.4s ease-out infinite; animation-delay: var(--anim-offset, 0s);
        }
        @keyframes hd-flow { to { stroke-dashoffset: -11; } }
        @keyframes hd-glow { from { opacity: 0.55; } to { opacity: 1; } }
        @keyframes hd-ring { 0% { transform: scale(0.9); opacity: 0.9; } 100% { transform: scale(1.45); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .hd-air path, .hd-heat, .hd-rings circle { animation-name: none; } }
  `,
  // A toaster seen from a little above: the slots open in its top, the lever
  // and the browning dial on its face. The slots glow while it toasts, the
  // heat rises above them, and the slices pop up once it is done.
  toaster: () => `${MINI_LCD_CSS}
        .tp-top, .tp-face, .tp-slot, .tp-toast, .tp-track, .tp-lever, .tp-dial, .tp-btn, .tp-led, .tp-tray, .tp-foot { position: absolute; }
        .tp-top { z-index: 2; background: linear-gradient(180deg, var(--ac-body, #eceff1), var(--ac-body-hi, #ffffff) 70%); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14); }
        .tp-face {
          z-index: 2; background: linear-gradient(180deg, var(--ac-body-hi, #ffffff), var(--ac-body, #eceff1) 45%, var(--ac-body-lo, #cfd6db));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.14), 0 2px 3px rgba(0, 0, 0, 0.12);
        }
        .tp-slot { z-index: 3; height: 3.5px; border-radius: 2px; background: linear-gradient(180deg, #0b0d10, #2c3137); box-shadow: inset 0 1px 1px #000; }
        .machine.mode-toasting .tp-slot {
          background: linear-gradient(180deg, #ffb74d, #e64a19); box-shadow: 0 0 4px #ff7043;
          animation: tp-glow 1.6s ease-in-out infinite; animation-delay: var(--anim-offset, 0s);
        }
        .tp-toast {
          z-index: 4; display: none; border-radius: 45% 45% 3px 3px / 35% 35% 3px 3px;
          background: radial-gradient(ellipse at 50% 55%, #e8b06a 0 40%, #c98443 72%, #93521f 100%); box-shadow: inset 0 0 0 1.5px #7c4219;
        }
        .tp-toast.back { filter: brightness(0.88); }
        .machine.mode-done .tp-toast { display: block; animation: tp-pop 0.55s cubic-bezier(0.3, 1.7, 0.6, 1) both; animation-delay: var(--anim-offset, 0s); }
        .tp-track { z-index: 3; width: 2.5px; border-radius: 1.5px; background: rgba(0, 0, 0, 0.45); }
        .tp-lever { z-index: 4; width: 10px; height: 5px; border-radius: 2px; background: linear-gradient(#e3e8eb, #8a99a3); box-shadow: 0 1px 1px rgba(0, 0, 0, 0.45); }
        .machine.mode-toasting .tp-lever { top: var(--tp-low) !important; }
        .tp-dial { z-index: 3; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ffffff, #b7c1c7 70%); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3), 0 1px 1px rgba(0, 0, 0, 0.2); }
        .tp-dial::after {
          content: ""; position: absolute; left: 50%; top: 1.5px; width: 1.4px; height: 42%; border-radius: 1px; background: #455a64;
          transform: translateX(-50%) rotate(40deg); transform-origin: 50% 100%;
        }
        .tp-btn { z-index: 3; width: 8px; height: 4px; border-radius: 2px; background: rgba(0, 0, 0, 0.18); }
        .tp-led { z-index: 3; width: 3px; height: 3px; border-radius: 50%; background: rgba(0, 0, 0, 0.25); }
        .machine.mode-idle .tp-led { background: #4db6ac; box-shadow: 0 0 3px #4db6ac; }
        .machine.mode-toasting .tp-led { background: #ff7043; box-shadow: 0 0 3px #ff7043; }
        .machine.mode-done .tp-led { background: #66bb6a; box-shadow: 0 0 3px #66bb6a; }
        .tp-tray { z-index: 3; height: 2px; border-radius: 1px; background: rgba(0, 0, 0, 0.28); }
        .tp-foot { z-index: 1; top: 93px; width: 8px; height: 4px; border-radius: 0 0 3px 3px; background: #2b2f33; }
        .machine.mode-toasting .air-flow { display: block; }
        .air-flow path { stroke: #ff7043; }
        @keyframes tp-glow { 50% { opacity: 0.6; } }
        @keyframes tp-pop { from { transform: translateY(20px); } to { transform: none; } }
  `,
  // A screen: a television on its feet, on a stand or on the wall, a
  // projector under its screen, or a computer and its tower. Lit, the glass
  // shows a picture; on standby only its light is on.
  screen: () => `
        .scr-zoom { position: absolute; width: 96px; height: 108px; transform-origin: 0 0; }
        .scr-bezel, .scr-glass, .scr-led, .scr-foot, .scr-neck, .scr-base, .scr-shade, .scr-wall, .scr-rod, .scr-beam,
        .scr-body, .scr-lens, .scr-vent, .scr-feet, .scr-tower, .scr-slot { position: absolute; }
        .scr-bezel {
          border-radius: 2px; background: linear-gradient(180deg, var(--ac-body-hi, #515860), var(--ac-body, #3b4045) 50%, var(--ac-body-lo, #22262a));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.18);
        }
        .scr-glass { border-radius: 1.5px; overflow: hidden; background: linear-gradient(155deg, #2a2f36 0%, #0c0e11 55%, #16191d 100%); }
        .scr-glass::after, .scr-wall::after {
          content: ""; position: absolute; inset: 0; z-index: 5; pointer-events: none;
          background: linear-gradient(120deg, rgba(255, 255, 255, 0.13) 0 22%, transparent 22% 100%);
        }
        .scr-wall::after { display: none; }
        .scr-pic { position: absolute; inset: 0; opacity: 0; transition: opacity 0.4s; overflow: hidden; }
        .scr-pic > * { position: absolute; inset: 0; overflow: hidden; }
        .machine.scr-lit .scr-pic { opacity: 1; }
        .machine.mode-paused .scr-pic * { animation-play-state: paused; }
        .scr-cover { object-fit: cover; width: 100%; height: 100%; }
        .scr-led { width: 2.4px; height: 2.4px; border-radius: 50%; background: #3a3f46; }
        .machine.mode-standby .scr-led { background: #ff3b30; box-shadow: 0 0 3px #ff3b30; }
        .machine.scr-lit .scr-led { background: transparent; }
        .machine.scr-computer.mode-standby .scr-led { background: #ffb300; box-shadow: 0 0 3px #ffb300; animation: scr-breathe 2.4s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.scr-computer.scr-lit .scr-led { background: #e3f2fd; box-shadow: 0 0 3px #90caf9; }
        .scr-badge { position: absolute; z-index: 6; right: 4%; bottom: 6%; width: 16%; max-width: 9px; opacity: 0.9; display: none; }
        .scr-badge svg { display: block; width: 100%; height: auto; }
        .machine.mode-playing .scr-badge.play, .machine.mode-paused .scr-badge.pause, .machine.scr-lit.muted .scr-badge.mute { display: block; }
        .machine.muted .scr-badge.play { display: none !important; }
        .machine.mode-paused .scr-badge.pause { right: auto; bottom: auto; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 22%; max-width: 12px; }
        .scr-lock { position: absolute; inset: 0; z-index: 4; background: linear-gradient(160deg, #263238, #37474f); }
        .scr-lock::before {
          content: ""; position: absolute; left: 50%; top: 26%; width: 14%; height: 20%; transform: translateX(-50%); box-sizing: border-box;
          border: 1.5px solid #cfd8dc; border-bottom: none; border-radius: 50% 50% 0 0;
        }
        .scr-lock::after { content: ""; position: absolute; left: 50%; top: 44%; width: 22%; height: 26%; transform: translateX(-50%); background: #cfd8dc; border-radius: 1px; }
        .scr-foot { border-radius: 1px; background: linear-gradient(180deg, var(--ac-body-hi, #515860), var(--ac-body-lo, #22262a)); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); }
        .scr-foot.l { transform: skewX(-28deg); } .scr-foot.r { transform: skewX(28deg); }
        .scr-neck { background: linear-gradient(90deg, var(--ac-body-lo, #22262a), var(--ac-body, #3b4045), var(--ac-body-lo, #22262a)); }
        .scr-base { border-radius: 50%; background: radial-gradient(ellipse at 50% 30%, var(--ac-body-hi, #515860), var(--ac-body-lo, #22262a)); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3); }
        .scr-computer .scr-base { border-radius: 2px; background: linear-gradient(180deg, var(--ac-body-hi, #515860), var(--ac-body-lo, #22262a)); }
        .scr-shade { border-radius: 4px; background: rgba(0, 0, 0, 0.1); filter: blur(2.5px); }
        .scr-wall { overflow: hidden; border-radius: 1px; background: #f6f7f9; box-shadow: inset 0 0 0 1px #d4d9df, 0 1px 2px rgba(0, 0, 0, 0.12); }
        .scr-rod { background: #9aa2ab; }
        .scr-beam { opacity: 0; transition: opacity 0.4s; clip-path: polygon(0 0, 100% 0, 57% 100%, 51% 100%); background: linear-gradient(0deg, rgba(255, 250, 230, 0.85), rgba(255, 250, 230, 0.12)); }
        .machine.scr-lit .scr-beam { opacity: 0.9; }
        .scr-body {
          border-radius: 4px 4px 3px 3px; background: linear-gradient(180deg, var(--ac-body-hi, #515860), var(--ac-body, #3b4045) 45%, var(--ac-body-lo, #22262a));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18), 0 2px 3px rgba(0, 0, 0, 0.12);
        }
        .scr-lens { border-radius: 50%; background: radial-gradient(circle at 40% 38%, #5d6670, #15181c 70%); box-shadow: 0 0 0 1.5px var(--ac-body-lo, #22262a), inset 0 0 0 1px #000; }
        .machine.scr-lit .scr-lens { background: radial-gradient(circle at 50% 50%, #fffbe8 0 30%, #ffe7a3 55%, #8d7a4a 80%); box-shadow: 0 0 0 1.5px var(--ac-body-lo, #22262a), 0 0 6px #ffe7a3; }
        .scr-vent { opacity: 0.6; background: repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.35) 0 1px, transparent 1px 3px); }
        .scr-feet { border-radius: 0 0 1px 1px; background: #2b2f34; }
        .scr-tower { border-radius: 2px; background: linear-gradient(90deg, var(--ac-body-lo, #22262a), var(--ac-body, #3b4045) 30%, var(--ac-body-hi, #515860) 60%, var(--ac-body-lo, #22262a)); }
        .scr-slot { border-radius: 0.5px; background: rgba(0, 0, 0, 0.35); }

        /* The pictures. */
        .si-sunset { background: linear-gradient(115deg, #1e3c72, #2a7fba 25%, #f4a261 50%, #e76f51 70%, #264653); background-size: 300% 300%; animation: scr-drift 9s ease-in-out infinite alternate; animation-delay: var(--anim-offset, 0s); }
        .si-sunset b { position: absolute; width: 16%; aspect-ratio: 1; border-radius: 50%; left: 58%; top: 24%; background: #ffe9a8; box-shadow: 0 0 8px #ffd166; }
        .si-sunset i { position: absolute; left: -10%; width: 120%; bottom: -30%; height: 62%; border-radius: 50%; background: #1d3b2a; opacity: 0.9; }
        .si-aquarium { background: linear-gradient(180deg, #4fc3f7, #0277bd 70%, #01579b); }
        .si-aquarium .sand { position: absolute; left: 0; right: 0; bottom: 0; height: 14%; background: #e0c38c; border-radius: 40% 60% 0 0 / 100% 100% 0 0; }
        .si-aquarium .weed { position: absolute; bottom: 8%; width: 3%; height: 40%; border-radius: 50% 50% 0 0; background: #2e7d32; transform-origin: bottom; animation: scr-sway 3s ease-in-out infinite alternate; animation-delay: var(--anim-offset, 0s); }
        .si-aquarium .fish { position: absolute; width: 13%; height: 12%; border-radius: 50%; background: var(--f); animation: scr-swim var(--sw) linear infinite; animation-delay: var(--anim-offset, 0s); }
        .si-aquarium .fish::after { content: ""; position: absolute; left: -30%; top: 10%; width: 40%; height: 80%; background: var(--f); clip-path: polygon(0 0, 100% 50%, 0 100%); }
        .si-aquarium .fish::before { content: ""; position: absolute; right: 18%; top: 28%; width: 12%; aspect-ratio: 1; border-radius: 50%; background: #111; }
        .si-aquarium .bub { position: absolute; bottom: 10%; width: 3%; aspect-ratio: 1; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.7); animation: scr-rise 3s ease-in infinite; animation-delay: var(--anim-offset, 0s); }
        .si-bars { background: linear-gradient(90deg, #c0c0c0 0 14.3%, #c0c000 0 28.6%, #00c0c0 0 42.9%, #00c000 0 57.2%, #c000c0 0 71.5%, #c00000 0 85.8%, #0000c0 0); }
        .si-bars::before {
          content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 22%;
          background: linear-gradient(90deg, #0000c0 0 14.3%, #131313 0 28.6%, #c000c0 0 42.9%, #131313 0 57.2%, #00c0c0 0 71.5%, #131313 0 85.8%, #c0c0c0 0);
        }
        .si-bars b { position: absolute; left: 50%; top: 40%; width: 30%; aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%; border: 1px solid #fff; box-shadow: 0 0 0 1px #000; }
        /* The match as television shows it: the stand full, the pitch mown in
           stripes, a goal at each end and two teams after the ball. */
        .si-football { background: repeating-linear-gradient(180deg, #43a047 0 9%, #388e3c 9% 18%); }
        .si-football .crowd {
          position: absolute; left: 0; right: 0; top: 0; height: 22%; background-color: #263238;
          background-image: radial-gradient(circle, #ef5350 0 0.7px, transparent 0.9px), radial-gradient(circle, #ffee58 0 0.7px, transparent 0.9px), radial-gradient(circle, #e0e0e0 0 0.7px, transparent 0.9px), radial-gradient(circle, #42a5f5 0 0.7px, transparent 0.9px);
          background-size: 4px 3px, 5px 3px, 3px 4px, 6px 3px; background-position: 0 0, 2px 1px, 1px 2px, 3px 0;
        }
        .si-football .lines { position: absolute; left: 6%; right: 6%; top: 30%; bottom: 8%; border: 1px solid rgba(255, 255, 255, 0.8); }
        .si-football .lines::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; border-left: 1px solid rgba(255, 255, 255, 0.8); }
        .si-football .lines::after { content: ""; position: absolute; left: 50%; top: 50%; width: 20%; height: 44%; transform: translate(-50%, -50%); border: 1px solid rgba(255, 255, 255, 0.8); border-radius: 50%; }
        .si-football .goal { position: absolute; top: 48%; width: 4%; height: 24%; border: 1px solid #fff; background: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.35) 0 1px, transparent 1px 2px); }
        .si-football .goal.l { left: 2%; border-right: none; } .si-football .goal.r { right: 2%; border-left: none; }
        .si-football .pl { position: absolute; width: 3.4%; height: 13%; border-radius: 1px 1px 0.5px 0.5px; background: linear-gradient(180deg, transparent 0 30%, var(--k) 30% 72%, #f5f5f5 72% 84%, #222 84%); animation: scr-chase 3.4s ease-in-out infinite alternate; animation-delay: var(--anim-offset, 0s); }
        .si-football .pl::before { content: ""; position: absolute; left: 12%; top: 0; width: 76%; height: 30%; border-radius: 50%; background: #f1c27d; }
        .si-football .ball { position: absolute; width: 3.6%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle at 50% 50%, #222 0 22%, #fff 26%); box-shadow: 0 0 0 0.4px #222; animation: scr-chase 3.4s ease-in-out infinite alternate, scr-hop 0.85s ease-in-out infinite alternate; animation-delay: var(--anim-offset, 0s); }
        .si-football .score { position: absolute; left: 3%; top: 3%; padding: 0 1.5px; background: #111; color: #fff; font: 700 4.5px/1.4 Arial, sans-serif; border-left: 2px solid #e53935; }
        .si-space {
          background: radial-gradient(circle at 20% 30%, #fff 0 0.6%, transparent 0.8%), radial-gradient(circle at 70% 20%, #fff 0 0.5%, transparent 0.7%), radial-gradient(circle at 85% 70%, #fff 0 0.6%, transparent 0.8%),
            radial-gradient(circle at 40% 80%, #fff 0 0.4%, transparent 0.6%), radial-gradient(circle at 55% 45%, #fff 0 0.4%, transparent 0.6%), radial-gradient(circle at 10% 75%, #fff 0 0.5%, transparent 0.7%), linear-gradient(160deg, #0b1030, #1a0f3a);
        }
        .si-space b { position: absolute; right: 8%; top: 18%; width: 26%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ffcc80, #e65100); }
        .si-space b::after { content: ""; position: absolute; left: -30%; right: -30%; top: 42%; height: 16%; border: 1px solid rgba(255, 224, 178, 0.8); border-radius: 50%; transform: rotate(-15deg); }
        .si-space i { position: absolute; width: 5%; height: 16%; border-radius: 50% 50% 15% 15%; background: #eceff1; animation: scr-fly 5s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .si-space i::after { content: ""; position: absolute; left: 20%; right: 20%; top: 100%; height: 60%; border-radius: 0 0 50% 50%; background: linear-gradient(#ffeb3b, #ff5722 60%, transparent); }
        /* The old screensaver of a DVD player: the logo bounces off the
           edges, and once in about two minutes it lands right in a corner. */
        .si-bounce { background: #050505; }
        .si-bounce .logo {
          position: absolute; width: 14px; height: 9px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
          font: 900 6px/1 Arial, sans-serif; letter-spacing: -0.3px; border-radius: 2px; color: #03a9f4; border: 1px solid currentColor;
          animation: scr-bx 4.1s linear infinite alternate, scr-by 2.9s linear infinite alternate, scr-hue 5.4s steps(6) infinite, scr-pop 118.9s linear infinite; animation-delay: var(--anim-offset, 0s);
        }
        .si-bounce .flash { position: absolute; inset: 0; z-index: 2; background: #fff; opacity: 0; animation: scr-flash 118.9s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .si-bounce .bit { position: absolute; top: -12%; width: 3%; height: 5%; background: var(--c); opacity: 0; animation: scr-confetti 118.9s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .si-desktop { background: linear-gradient(160deg, #5b8def, #7e57c2 60%, #4a3a8a); }
        .si-desktop i { position: absolute; border-radius: 1px; background: rgba(255, 255, 255, 0.92); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); }
        .si-desktop i::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 2px; background: #cfd8e3; }
        .si-desktop i.mv { animation: scr-drag 4s ease-in-out infinite alternate; animation-delay: var(--anim-offset, 0s); }
        .si-desktop u { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(20, 22, 30, 0.55); }
        .si-code { background: #1e1e2e; }
        .si-code .lines { position: absolute; left: 6%; right: 6%; top: 0; height: 200%; animation: scr-scroll 6s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .si-code .lines i { display: block; height: 1.6px; margin: 0 0 2.2px var(--x); width: var(--w); border-radius: 1px; background: var(--c); }
        .si-pong { background: #000; }
        .si-pong::before { content: ""; position: absolute; left: 50%; top: 0; bottom: 0; border-left: 1px dashed rgba(255, 255, 255, 0.5); }
        .si-pong .pad { position: absolute; width: 3%; height: 24%; background: #fff; animation: scr-pad 1.9s ease-in-out infinite alternate; animation-delay: var(--anim-offset, 0s); }
        .si-pong .pad.r { animation-duration: 2.3s; animation-direction: alternate-reverse; }
        .si-pong .ball { position: absolute; width: 4%; aspect-ratio: 1; background: #fff; animation: scr-pbx 1.6s linear infinite alternate, scr-pby 1.1s linear infinite alternate; animation-delay: var(--anim-offset, 0s); }
        .si-pong .score { position: absolute; top: 6%; left: 0; right: 0; text-align: center; color: #fff; font: 700 5px/1 monospace; letter-spacing: 6px; }
        .si-home { background: linear-gradient(160deg, #141821, #232a38); }
        .si-home i { position: absolute; width: 20%; height: 24%; border-radius: 1.5px; background: var(--c); }
        .si-home i.f { outline: 1px solid #fff; outline-offset: 0.5px; }
        .si-home u { position: absolute; left: 6%; top: 9%; width: 40%; height: 7%; border-radius: 1px; background: rgba(255, 255, 255, 0.35); }
        @keyframes scr-breathe { 50% { opacity: 0.25; } }
        @keyframes scr-drift { to { background-position: 100% 50%; } }
        @keyframes scr-sway { from { transform: rotate(-8deg); } to { transform: rotate(8deg); } }
        @keyframes scr-swim { from { left: -20%; } to { left: 110%; } }
        @keyframes scr-rise { to { bottom: 105%; opacity: 0.2; } }
        @keyframes scr-chase { from { left: 14%; } to { left: 80%; } }
        @keyframes scr-hop { from { top: 58%; } to { top: 74%; } }
        @keyframes scr-fly { from { left: -10%; top: 90%; transform: rotate(55deg); } to { left: 105%; top: -20%; transform: rotate(55deg); } }
        @keyframes scr-bx { from { left: 0; } to { left: calc(100% - 14px); } }
        @keyframes scr-by { from { top: 0; } to { top: calc(100% - 9px); } }
        @keyframes scr-hue { to { filter: hue-rotate(360deg); } }
        @keyframes scr-pop { 0% { transform: scale(1.5); } 1.2%, 100% { transform: none; } }
        @keyframes scr-flash { 0% { opacity: 0.85; } 0.8%, 100% { opacity: 0; } }
        @keyframes scr-confetti { 0% { opacity: 1; transform: translateY(0) rotate(0); } 1.6% { opacity: 1; transform: translateY(70px) rotate(540deg); } 1.61%, 100% { opacity: 0; } }
        @keyframes scr-drag { to { transform: translate(-20%, -8%); } }
        @keyframes scr-scroll { to { transform: translateY(-50%); } }
        @keyframes scr-pad { from { top: 10%; } to { top: 66%; } }
        @keyframes scr-pbx { from { left: 8%; } to { left: 88%; } }
        @keyframes scr-pby { from { top: 6%; } to { top: 88%; } }
        @media (prefers-reduced-motion: reduce) { .machine .scr-pic *, .machine .scr-led { animation: none !important; animation-delay: var(--anim-offset, 0s); } }
  `,
  iron: () => `
        .ir { position: absolute; left: 0; right: 0; top: 0; bottom: 0; }
        .ir-shell {
          position: absolute; left: 8px; right: 10px; top: 44px; height: 26px;
          background: var(--ac-body, var(--secondary-background-color, #d7d7d7));
          border: 1px solid var(--divider-color, #c7c7c7); border-radius: 10px 16px 4px 4px;
          clip-path: polygon(0 100%, 12% 40%, 34% 10%, 100% 0, 100% 100%);
        }
        /* The tank sits inside the shell, so the shell's own outline cuts it:
           drawn beside it, it stuck out past the nose. */
        .ir-tank {
          position: absolute; left: 12px; right: 26px; top: 9px; height: 12px;
          border-radius: 7px 3px 3px 7px; background: rgba(79, 195, 247, 0.34);
        }
        .ir-top {
          position: absolute; left: 34px; right: 14px; top: 33px; height: 15px; border-radius: 9px 9px 0 0;
          background: var(--ac-body, var(--secondary-background-color, #d7d7d7));
          border: 1px solid var(--divider-color, #c7c7c7); border-bottom: none;
        }
        .ir-handle {
          position: absolute; left: 26px; right: 12px; top: 17px; height: 22px;
          border: 5px solid var(--ac-body, var(--secondary-background-color, #d7d7d7)); border-bottom: none;
          border-radius: 16px 10px 0 0; box-shadow: 0 -1px 0 var(--divider-color, #c7c7c7);
        }
        .ir-plate {
          position: absolute; left: 4px; right: 8px; top: 69px; height: 9px; background: #3b4048;
          border-radius: 2px 4px 4px 4px; clip-path: polygon(0 66%, 10% 0, 100% 0, 100% 100%, 3% 100%);
        }
        .ir-cord {
          position: absolute; right: 4px; top: 42px; width: 14px; height: 20px;
          border: 3px solid var(--disabled-text-color, #9e9e9e); border-left: none; border-top: none;
          border-radius: 0 0 12px 0;
        }
        /* Heating: the soleplate glows and steam leaves the nose. */
        .machine.heating .ir-plate { background: #ff7043; box-shadow: 0 0 10px 1px #ff7043; }
        /* Steam: four wisps off the nose, rising clear of the iron and
           drifting as they go. Kept tall and staggered so that two or three
           are always in the air rather than one appearing now and then. They
           are drawn inside the iron: on a generator it is scaled and lifted
           onto its base, and steam left on the card would rise from nowhere. */
        .ir-steam {
          position: absolute; width: 8px; height: 22px; border-radius: 5px; opacity: 0;
          background: linear-gradient(to top, rgba(176, 196, 214, 0.9), rgba(176, 196, 214, 0));
        }
        .ir-steam.s1 { left: 2px; top: 44px; }
        .ir-steam.s2 { left: 12px; top: 40px; }
        .ir-steam.s3 { left: 23px; top: 42px; }
        .ir-steam.s4 { left: 33px; top: 46px; }
        .machine.heating .ir-steam { animation: ir-puff 2.6s ease-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.heating .ir-steam.s2 { animation-delay: calc(-0.65s + var(--anim-offset, 0s)); }
        .machine.heating .ir-steam.s3 { animation-delay: calc(-1.3s + var(--anim-offset, 0s)); }
        .machine.heating .ir-steam.s4 { animation-delay: calc(-1.95s + var(--anim-offset, 0s)); }
        @keyframes ir-puff {
          0% { transform: translate(0, 10px) scale(0.45); opacity: 0; }
          20% { opacity: 0.95; }
          70% { opacity: 0.7; }
          100% { transform: translate(-7px, -34px) scale(1.35); opacity: 0; }
        }
        /* Left on for too long: the boiler's flame, its shape and its flicker,
           in front of the iron. Its blue root belongs to a gas burner and is
           dropped: nothing burns gas here. */
        .ir-fire {
          position: absolute; transform-origin: 50% 100%; opacity: 0;
          background: linear-gradient(0deg, #ffca28 0%, #ffa726 30%, #ff9800 60%, #ff5722 100%);
          clip-path: polygon(46% 0%, 58% 30%, 70% 10%, 76% 44%, 90% 28%, 94% 64%, 86% 88%, 66% 100%, 34% 100%, 14% 88%, 6% 62%, 12% 32%, 26% 50%, 30% 18%, 42% 36%);
        }
        .ir-fire.f1 { left: 8px; bottom: 28px; width: 18px; height: 32px; }
        .ir-fire.f2 { left: 28px; bottom: 30px; width: 26px; height: 48px; }
        .ir-fire.f3 { left: 56px; bottom: 30px; width: 20px; height: 38px; }
        .machine.left-on .ir-fire { opacity: 1; animation: ir-flicker 0.6s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.left-on .ir-fire.f2 { animation-delay: calc(-0.2s + var(--anim-offset, 0s)); }
        .machine.left-on .ir-fire.f3 { animation-delay: calc(-0.4s + var(--anim-offset, 0s)); }
        @keyframes ir-flicker {
          0%, 100% { transform: scale(1, 1); }
          30% { transform: scale(0.92, 1.1); }
          60% { transform: scale(1.06, 0.9); }
        }
        .machine.left-on .ir-plate { background: #ff5722; box-shadow: 0 0 14px 2px #ff5722; }
        /* The generator: the base carries the water tank, a dial and a lamp,
           and the iron rests on its mat rather than sinking into it. */
        .machine.generator .ir { transform: scale(0.74) translate(2px, -35px); transform-origin: 50% 100%; }
        .machine.generator .ir-fire.f1 { left: 12px; bottom: 52px; width: 16px; height: 28px; }
        .machine.generator .ir-fire.f2 { left: 29px; bottom: 54px; width: 23px; height: 42px; }
        .machine.generator .ir-fire.f3 { left: 54px; bottom: 52px; width: 18px; height: 32px; }
        .gen-base {
          position: absolute; left: 5px; right: 5px; bottom: 10px; height: 33px; border-radius: 7px 7px 10px 10px;
          background: var(--ac-body, var(--secondary-background-color, #d7d7d7));
          border: 1px solid var(--divider-color, #c7c7c7);
        }
        .gen-mat {
          position: absolute; left: 11px; right: 11px; bottom: 42px; height: 6px; border-radius: 4px 4px 0 0;
          background: var(--ac-body, var(--secondary-background-color, #d7d7d7));
          border: 1px solid var(--divider-color, #c7c7c7); border-bottom: none;
        }
        .gen-tank {
          position: absolute; left: 11px; width: 30px; bottom: 16px; height: 22px; border-radius: 4px 7px 7px 4px;
          background: rgba(79, 195, 247, 0.34); border: 1px solid rgba(0, 0, 0, 0.05);
        }
        .gen-dial {
          position: absolute; right: 12px; bottom: 19px; width: 14px; height: 14px; border-radius: 50%;
          background: var(--disabled-text-color, #9e9e9e);
        }
        .gen-led { position: absolute; right: 33px; bottom: 24px; width: 5px; height: 5px; border-radius: 50%; background: #8e9498; }
        .machine.generator.heating .gen-led { background: #ff7043; box-shadow: 0 0 6px 1px #ff7043; }
        .machine.generator.left-on .gen-led { background: #ff5722; box-shadow: 0 0 8px 2px #ff5722; }
        .gen-hose {
          position: absolute; right: 6px; top: 52px; width: 15px; height: 18px;
          border: 4px solid var(--disabled-text-color, #9e9e9e); border-left: none; border-top: none;
          border-radius: 0 0 12px 0;
        }
  `,
  // An EV charger on the wall, from the front: the box, its dark face with a
  // bolt and the light above it, the holster on its side with a CCS plug
  // parked in it head first, and the cable looping down between the two. The light takes the
  // colour of the state, the one the state line is written in, and goes dark
  // when the charger is offline. With a car at it, the plug leaves its holster
  // and the cable runs off towards the car; while it charges, the cable
  // carries the state's colour and the energy runs along it.
  ev_charger: (color) => `
        .ev-box {
          position: absolute; left: 20px; width: 44px; top: 4px; height: 66px; border-radius: 10px;
          background: linear-gradient(160deg, var(--ac-body-hi, #ffffff), var(--ac-body, #eef0f1) 50%, var(--ac-body-lo, #c9ced2));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.14);
        }
        .ev-face {
          position: absolute; left: 6px; right: 6px; top: 7px; bottom: 10px; border-radius: 7px;
          background: linear-gradient(180deg, #30353b, #16191d); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.4);
        }
        .ev-led {
          position: absolute; left: 50%; top: 6px; width: 18px; height: 3px; margin-left: -9px; border-radius: 2px;
          background: ${color}; box-shadow: 0 0 4px ${color}, 0 0 9px ${color};
        }
        .machine.mode-offline .ev-led, .machine.mode-unknown .ev-led { background: #4a5057; box-shadow: none; }
        /* The bolt is the box's sign: large on the face and in the state's
           colour, like the light, so the state reads from across the room. */
        .ev-bolt {
          position: absolute; left: 50%; top: 15px; width: 24px; height: 30px; margin-left: -12px;
          fill: ${color}; filter: drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color});
        }
        .machine.mode-offline .ev-bolt, .machine.mode-unknown .ev-bolt { fill: #4a5057; filter: none; }
        .ev-holster {
          position: absolute; left: 61px; top: 27px; width: 16px; height: 16px; border-radius: 3px 6px 6px 3px;
          background: linear-gradient(160deg, var(--ac-body-hi, #ffffff), var(--ac-body, #eef0f1) 50%, var(--ac-body-lo, #c9ced2));
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.14);
        }
        /* A CCS plug, drawn lying down with the cable on the left: the strain
           relief, the grip, a collar in the colour of the box, and the taller
           head, its Type 2 part above the two DC pins and the release latch
           on top. It turns about the point where the cable enters it: head up
           into the holster, head first into the car. */
        .ev-plug { position: absolute; left: 69px; top: 51px; width: 26px; height: 12px; transform-origin: 0 6px; transform: rotate(-90deg); }
        .ev-plug > i { position: absolute; display: block; }
        .pl-boot {
          left: 0; top: 3px; width: 6px; height: 6px; clip-path: polygon(0 25%, 100% 0, 100% 100%, 0 75%);
          background: linear-gradient(180deg, #4a5056, #2b2f34);
        }
        .pl-grip {
          left: 5px; top: 2.5px; width: 10px; height: 7px; border-radius: 3px;
          background: linear-gradient(180deg, #5b6168, #3a3f45 45%, #24282c);
        }
        .pl-collar {
          left: 14.5px; top: 1px; width: 2px; height: 10px; border-radius: 1px; box-shadow: 0 0 0 0.5px rgba(0, 0, 0, 0.3);
          background: linear-gradient(180deg, var(--ac-body-hi, #ffffff), var(--ac-body, #eef0f1) 50%, var(--ac-body-lo, #c9ced2));
        }
        .pl-head {
          left: 16px; top: 0.5px; width: 9px; height: 11px; border-radius: 2px 3px 3px 2px;
          background: linear-gradient(180deg, #50565c, #2f3439 50%, #1d2125);
        }
        .pl-ac, .pl-dc { left: 24.5px; width: 1.5px; background: #15181b; }
        .pl-ac { top: 1.2px; height: 5.6px; border-radius: 0 2px 2px 0; }
        .pl-dc { top: 7.6px; height: 3.2px; border-radius: 0 1.5px 1.5px 0; }
        .pl-latch { left: 18px; top: -0.5px; width: 4px; height: 1.5px; border-radius: 1px 1px 0 0; background: #5f656c; }
        .ev-cable { position: absolute; left: 0; top: 0; width: 96px; height: 108px; overflow: visible; }
        .ev-cable path { fill: none; stroke: #3b4048; stroke-width: 3.5; stroke-linecap: round; }
        .ev-cable .ev-out, .ev-cable .ev-live, .machine.plugged .ev-cable .ev-loop { display: none; }
        .machine.plugged .ev-cable .ev-out { display: inline; }
        .ev-cable .ev-live { stroke: ${color}; stroke-width: 2.4; }
        .machine.plugged.mode-charging .ev-cable .ev-live { display: inline; }
        /* While it charges, the energy runs down the cable from the box to the
           car: light dashes on the coloured core, the path drawn in that order,
           a lap of the dashes the faster the more power goes through. */
        .ev-cable .ev-flow { display: none; stroke: rgba(255, 255, 255, 0.9); stroke-width: 1.6; stroke-dasharray: 3 7; }
        .machine.plugged.mode-charging .ev-cable .ev-flow {
          display: inline; animation: ev-flow var(--ev-flow, 0.6s) linear infinite; animation-delay: var(--anim-offset, 0s);
        }
        @keyframes ev-flow { to { stroke-dashoffset: -10; } }
        /* Paused, the energy stands still on the cable, in the pause's colour
           and without the halo: nothing flows. */
        .machine.plugged.mode-paused .ev-cable .ev-live, .machine.plugged.mode-paused .ev-cable .ev-flow { display: inline; }
                .machine.mode-paused .ev-cable .ev-flow { opacity: 0.6; }
        /* A fault turns the whole cable red, in its holster or at the car. */
        .machine.mode-error .ev-cable .ev-loop, .machine.mode-error .ev-cable .ev-out {
          stroke: ${color};
        }
        /* The glow is a blurred copy of the cable in an svg of its own, under
           it: WebKit (Safari and the Home Assistant apps) blurs an svg but not
           a path inside one, so a filter on the cable's own paths shows
           nowhere there. It lights while charging, and on a fault. */
        .ev-halo { position: absolute; left: 0; top: 0; width: 96px; height: 108px; overflow: visible; filter: blur(1.5px); }
        .ev-halo path { display: none; fill: none; stroke: ${color}; stroke-width: 3.5; stroke-linecap: round; }
        .machine.plugged.mode-charging .ev-halo .eh-out, .machine.plugged.mode-error .ev-halo .eh-out,
        .machine.mode-error:not(.plugged) .ev-halo .eh-loop { display: inline; }
        /* Discharging, the energy runs the other way, from the car to the box,
           at the pace of the power given back, and the halo turns into a glow
           along the whole cable, wider and lighter than the state's colour,
           that shimmers. */
        .machine.plugged.mode-discharging .ev-cable .ev-live { display: inline; }
        .machine.plugged.mode-discharging .ev-cable .ev-flow {
          display: inline; animation: ev-flow var(--ev-flow, 0.6s) linear infinite reverse; animation-delay: var(--anim-offset, 0s);
        }
        .machine.plugged.mode-discharging .ev-halo { filter: blur(2px); }
        .machine.plugged.mode-discharging .ev-halo .eh-out {
          display: inline; stroke: #a886df; stroke: color-mix(in srgb, ${color} 70%, #ffffff); stroke-width: 9;
          animation: ev-shimmer 1.3s linear infinite; animation-delay: var(--anim-offset, 0s);
        }
        @keyframes ev-shimmer { 0%, 31%, 64%, 100% { opacity: 1; } 23% { opacity: 0.7; } 57% { opacity: 0.8; } 86% { opacity: 0.75; } }
        @media (prefers-reduced-motion: reduce) {
          .machine.plugged.mode-charging .ev-cable .ev-flow { animation-play-state: paused; }
          .ev-led, .ev-cable path, .ev-energy, .ev-halo, .ev-halo path, .ev-plug, .ev-ghost {
            animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;
          }
        }
        .machine.plugged .ev-plug { left: 70px; top: 96px; transform: none; }
        /* The light speaks as a real box's does: it breathes while the car
           charges, and slowly while it waits for its start time; it blinks
           for a card at the reader, and faster on a fault. */
        .machine.mode-charging .ev-led { animation: ev-breathe 2.6s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-discharging .ev-led { animation: ev-breathe 2.6s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-scheduled .ev-led { animation: ev-breathe 4.8s ease-in-out infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-awaiting_auth .ev-led { animation: ev-blink 1.4s linear infinite; animation-delay: var(--anim-offset, 0s); }
        .machine.mode-error .ev-led { animation: ev-blink 0.8s linear infinite; animation-delay: var(--anim-offset, 0s); }
        @keyframes ev-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes ev-blink { 0%, 40% { opacity: 1; } 50%, 90% { opacity: 0.15; } 100% { opacity: 1; } }
        /* What happens while the card is open plays once, from the moment it
           happened: the plug pulled down out of its holster and riding the
           cable out to the car, then clicking in; back the other way, the
           cable winding in to the box and the plug pushed up into its holster;
           at the end of a charge, the light flashing and the energy fading. */
        .ev-ghost {
          display: none; position: absolute; left: 69px; top: 51px; width: 26px; height: 12px;
          transform-origin: 0 6px; transform: rotate(-90deg);
        }
        .ev-ghost > i { position: absolute; display: block; }
        .machine.plug-in .ev-ghost, .machine.plug-in .ev-plug, .machine.plug-in .ev-loop, .machine.plug-in .ev-out, .machine.plug-in .ev-energy, .machine.plug-in .ev-halo,
        .machine.plug-out .ev-ghost, .machine.plug-out .ev-plug, .machine.plug-out .ev-cable path,
        .machine.just-done .ev-led, .machine.just-done .ev-cable path, .machine.just-done .ev-halo { --anim-offset: var(--ev-since, 0s); }
        .machine.plug-in .ev-ghost { display: block; animation: ev-pull 0.9s linear both; animation-delay: var(--anim-offset, 0s); }
        .machine.plug-in .ev-cable .ev-loop { display: inline; animation: ev-fade 0.9s linear both; animation-delay: var(--anim-offset, 0s); }
        .machine.plug-in .ev-cable .ev-out { stroke-dasharray: 80; animation: ev-run-out 0.9s linear both; animation-delay: var(--anim-offset, 0s); }
        .machine.plug-in .ev-plug { animation: ev-ride-in 0.9s linear both; animation-delay: var(--anim-offset, 0s); }
        /* A car that charges as soon as it is plugged in gets its energy once
           the cable has reached it. */
        .machine.plug-in .ev-energy, .machine.plug-in .ev-halo { animation: ev-reach 0.9s linear both; animation-delay: var(--anim-offset, 0s); }
        .machine.plug-out .ev-ghost {
          display: block; left: 70px; top: 96px; transform: none;
          animation: ev-ride-back 0.9s linear both; animation-delay: var(--anim-offset, 0s);
        }
        .machine.plug-out .ev-cable .ev-out { display: inline; stroke-dasharray: 80; animation: ev-wind-in 0.9s linear both; animation-delay: var(--anim-offset, 0s); }
        .machine.plug-out .ev-cable .ev-loop { stroke-dasharray: 80; animation: ev-coil 0.9s linear both; animation-delay: var(--anim-offset, 0s); }
        .machine.plug-out .ev-plug { animation: ev-stow 0.9s linear both; animation-delay: var(--anim-offset, 0s); }
        .machine.just-done .ev-led { animation: ev-done 1.4s ease-out both; animation-delay: var(--anim-offset, 0s); }
        .machine.just-done.plugged .ev-cable .ev-live { display: inline; animation: ev-drain 1.4s ease-in both; animation-delay: var(--anim-offset, 0s); }
        .machine.just-done.plugged .ev-cable .ev-flow {
          display: inline; animation: ev-flow var(--ev-flow, 0.6s) linear infinite, ev-drain 1.4s ease-in both; animation-delay: var(--anim-offset, 0s);
        }
        /* The halo fades with them after a charge; out of a pause, where it was
           not lit, it stays out. */
        .machine.just-done.from-charging.plugged .ev-halo .eh-out { display: inline; animation: ev-drain 1.4s ease-in both; animation-delay: var(--anim-offset, 0s); }
        @keyframes ev-pull { 0% { opacity: 1; transform: rotate(-90deg); } 12%, 100% { opacity: 0; transform: translateY(6px) rotate(-90deg); } }
        @keyframes ev-fade { 0% { opacity: 1; } 12%, 100% { opacity: 0; } }
        @keyframes ev-drain { from { opacity: 1; } to { opacity: 0; } }
        @keyframes ev-reach { 0%, 80% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes ev-run-out {
          0%, 12% { stroke-dashoffset: 80; } 19% { stroke-dashoffset: 69.43; } 26% { stroke-dashoffset: 60.18; } 33% { stroke-dashoffset: 52.22; } 40% { stroke-dashoffset: 45.51; } 47% { stroke-dashoffset: 40.03; } 54% { stroke-dashoffset: 35.71; } 61% { stroke-dashoffset: 32.52; } 68% { stroke-dashoffset: 30.39; } 75% { stroke-dashoffset: 29.23; } 82% { stroke-dashoffset: 28.91; } 100% { stroke-dashoffset: 0; }
        }
        /* The plug's pose along the cable, worked out from the curve the
           cable is drawn with, so that it stays on the tip of the line. */
        @keyframes ev-ride-in {
          0%, 12% { opacity: 0; transform: translate(-28px, -32.98px) rotate(89.99deg); }
          19% { opacity: 1; transform: translate(-27.47px, -22.44px) rotate(83.45deg); }
          26% { transform: translate(-25.55px, -13.42px) rotate(70.71deg); }
          33% { transform: translate(-21.65px, -6.54px) rotate(48.07deg); }
          40% { transform: translate(-16.27px, -2.61px) rotate(24.87deg); }
          47% { transform: translate(-11.05px, -0.93px) rotate(11.87deg); }
          54% { transform: translate(-6.79px, -0.3px) rotate(5.62deg); }
          61% { transform: translate(-3.61px, -0.07px) rotate(2.5deg); }
          68% { transform: translate(-1.48px, -0.01px) rotate(0.91deg); }
          75% { transform: translate(-0.31px, 0px) rotate(0.18deg); }
          82% { transform: translate(0px, 0px) rotate(0deg); }
          90% { transform: translate(1.5px, 0px) rotate(0deg); }
          100% { opacity: 1; transform: translate(0px, 0px) rotate(0deg); }
        }
        @keyframes ev-ride-back {
          0% { opacity: 1; transform: translate(0px, 0px) rotate(0deg); }
          5.6% { transform: translate(-1.59px, -0.01px) rotate(0.99deg); }
          11.3% { transform: translate(-6.38px, -0.26px) rotate(5.16deg); }
          16.9% { transform: translate(-14.19px, -1.78px) rotate(18.77deg); }
          22.5% { transform: translate(-23.02px, -8.3px) rotate(55.69deg); }
          28.1% { transform: translate(-26.92px, -18.69px) rotate(79.44deg); }
          33.8% { opacity: 1; transform: translate(-27.83px, -26.61px) rotate(86.66deg); }
          39.4% { transform: translate(-27.99px, -31.39px) rotate(89.29deg); }
          45%, 100% { opacity: 0; transform: translate(-28px, -32.98px) rotate(89.99deg); }
        }
        @keyframes ev-wind-in {
          0% { stroke-dashoffset: 28.91; } 5.6% { stroke-dashoffset: 30.5; } 11.3% { stroke-dashoffset: 35.29; } 16.9% { stroke-dashoffset: 43.28; } 22.5% { stroke-dashoffset: 54.45; } 28.1% { stroke-dashoffset: 65.63; } 33.8% { stroke-dashoffset: 73.61; } 39.4% { stroke-dashoffset: 78.4; } 45%, 100% { stroke-dashoffset: 80; }
        }
        @keyframes ev-coil {
          0%, 40% { stroke-dashoffset: 80; animation-timing-function: ease-out; }
          85%, 100% { stroke-dashoffset: 0; }
        }
        @keyframes ev-stow {
          0%, 55% { opacity: 0; transform: translateY(9px) rotate(-90deg); animation-timing-function: ease-out; }
          85% { opacity: 1; transform: translateY(-1px) rotate(-90deg); }
          100% { opacity: 1; transform: rotate(-90deg); }
        }
        @keyframes ev-done {
          0%, 36%, 72%, 100% { box-shadow: 0 0 4px ${color}, 0 0 9px ${color}; filter: none; }
          18%, 54% { box-shadow: 0 0 6px ${color}, 0 0 20px ${color}; filter: brightness(1.7); }
        }
  `,
};

// The parts of the CCS plug, as the CSS above lays them out.
const EV_PLUG_PARTS = '<i class="pl-boot"></i><i class="pl-grip"></i><i class="pl-collar"></i><i class="pl-head"></i>'
  + '<i class="pl-ac"></i><i class="pl-dc"></i><i class="pl-latch"></i>';

function illustrationCss(type, color) {
  const family = type === "dishwasher" ? "dishwasher" : LAUNDRY_TYPES.includes(type) ? "laundry" : type;
  const fn = ILLUSTRATION_CSS[family] || ILLUSTRATION_CSS.laundry;
  return fn(color);
}

// Everything this card renders is concatenated into innerHTML, and much of it
// comes from the integration rather than the dashboard author: SmartThings,
// Home Connect, LG and Miele pass program names, phase labels, friendly names
// and alert keys straight through from a vendor cloud. Unescaped, any of them
// renders as live markup in the user's session, and inside a quoted attribute
// a bare double quote is enough to break out. Escape the five characters that
// matter, everywhere an entity-derived value reaches the template.
function esc(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The fridge drawing. Two sets of coordinates: `body` is laid out against the
// whole cabinet (doors shut), `door[]` against each panel (a door open). The
// display, the handle and the ice dispenser belong to their door and swing
// with it, which is also why an open door shows nothing but its edge.
function fridgeHtml(ctx) {
  const layout = ctx.layout || "freezer_bottom";
  // No temperature entity, no display: an empty dial would be worse than none.
  // A configured probe that stopped reporting shows dashes instead, since that
  // is a real state on a fridge whose plug is out but whose Zigbee sensor lives on.
  const lcd = (cls, style, v) =>
    v === undefined ? "" : `<div class="fr-lcd ${cls}" style="${style}">${esc(v)}</div>`;
  const icebox = (left, top, w) =>
    ctx.ice === undefined
      ? ""
      : `<div class="fr-icebox ${ctx.ice ? "" : "off"}" style="left:${left}px;top:${top}px;width:${w}px;height:19px">
           <div class="fr-cube c1" style="left:${(w / 2 - 8).toFixed(1)}px"></div>
           <div class="fr-cube c2" style="left:${(w / 2 - 2.5).toFixed(1)}px"></div>
           <div class="fr-cube c3" style="left:${(w / 2 + 3).toFixed(1)}px"></div>
         </div>`;
  const fT = ctx.fridgeTemp;
  const zT = layout === "single" ? undefined : ctx.freezerTemp;
  // Bottles lying on wooden racks, seen through the glass or with the door open.
  const racks = [3, 17, 31, 45, 59].map((y) => `<div class="fr-rack" style="top:${y}px"></div>`).join("");
  // Unplugged or drawing nothing: the light inside is out too.
  const off = ctx.dark ? " off" : "";
  const fCls = ctx.fridgeWarn ? "warn" : "";

  let body = "";
  let door = ["", ""];
  if (layout === "wine") {
    // A glass door: the display sits above the pane, and no ice maker.
    body = `<div class="fr-handle" style="right:8px;top:24px;bottom:24px"></div>
            ${lcd(fCls, "left:9px;top:5px", fT)}
            <div class="fr-glass${off}" style="left:6px;right:15px;top:19px;bottom:7px">${racks}</div>`;
    door = [`<div class="fr-handle" style="right:8px;top:24px;bottom:24px"></div>
            ${lcd(fCls, "left:9px;top:5px", fT)}
            <div class="fr-glass empty" style="left:6px;right:15px;top:19px;bottom:7px"></div>`, ""];
  } else if (layout === "single") {
    body = `<div class="fr-handle" style="right:8px;top:24px;bottom:24px"></div>
            ${lcd(fCls, "left:9px;top:9px", fT)}${icebox(14, 74, 22)}`;
    door = [body, ""];
  } else if (layout === "freezer_top") {
    body = `<div class="fr-split h" style="top:34%"></div>
            <div class="fr-handle" style="right:8px;top:10px;height:18px"></div>
            <div class="fr-handle" style="right:8px;top:42%;bottom:20px"></div>
            ${lcd("freeze", "left:9px;top:8px", zT)}
            ${lcd(fCls, "left:9px;top:40%", fT)}${icebox(14, 74, 22)}`;
    door = [
      `<div class="fr-handle" style="right:7px;top:10px;height:18px"></div>
       ${lcd("freeze", "left:9px;top:8px", zT)}`,
      `<div class="fr-handle" style="right:7px;top:9px;bottom:20px"></div>
       ${lcd(fCls, "left:9px;top:7px", fT)}${icebox(14, 39, 22)}`,
    ];
  } else if (layout === "side_by_side") {
    body = `<div class="fr-split v" style="left:42%"></div>
            <div class="fr-handle" style="left:34%;top:22px;bottom:22px"></div>
            <div class="fr-handle" style="left:47%;top:22px;bottom:22px"></div>
            <div class="fr-disp" style="left:3px;top:29px;width:20px;height:31px"></div>
            ${lcd("freeze", "left:4px;top:9px;min-width:19px;font-size:6px", zT)}
            ${lcd(fCls, "right:7px;top:9px;min-width:19px;font-size:6px", fT)}
            ${icebox(3, 33, 20)}`;
    // Handle on the side away from the hinge: right of the left door, and the
    // other way round for the right one.
    door = [
      `<div class="fr-handle" style="right:5px;top:22px;bottom:22px"></div>
       <div class="fr-disp" style="left:3px;top:29px;width:20px;height:31px"></div>
       ${lcd("freeze", "left:4px;top:9px;min-width:19px;font-size:6px", zT)}${icebox(3, 33, 20)}`,
      `<div class="fr-handle" style="left:5px;top:22px;bottom:22px"></div>
       ${lcd(fCls, "right:7px;top:9px;min-width:19px;font-size:6px", fT)}`,
    ];
  } else {
    body = `<div class="fr-split h" style="top:63%"></div>
            <div class="fr-handle" style="right:8px;top:26px;height:28px"></div>
            <div class="fr-handle" style="right:8px;top:70%;height:20px"></div>
            ${lcd(fCls, "left:9px;top:9px", fT)}
            ${lcd("freeze", "left:9px;top:70%", zT)}${icebox(14, 42, 22)}`;
    door = [
      `<div class="fr-handle" style="right:7px;top:26px;height:28px"></div>
       ${lcd(fCls, "left:9px;top:9px", fT)}${icebox(14, 42, 22)}`,
      `<div class="fr-handle" style="right:7px;top:8px;height:20px"></div>
       ${lcd("freeze", "left:9px;top:8px", zT)}`,
    ];
  }

  const open = !!ctx.doorOpen;
  const openFreezer = !!ctx.freezerDoorOpen;
  if (!open && !openFreezer) return `<div class="fr-body">${body}</div>`;

  const cav = (style) =>
    `<div class="fr-cav${off}" style="${style}">
       <div class="fr-shelf" style="top:28%"></div><div class="fr-shelf" style="top:62%"></div>
     </div>`;
  const panel = (style, content, on, hinge) =>
    `<div class="fr-door${on ? " swung" : ""}${hinge === "right" ? " hinge-right" : ""}" style="${style}">${content}</div>`;

  if (layout === "single") {
    return `<div class="fr-wrap">${cav("inset:0")}${panel("inset:0", door[0], open)}</div>`;
  }
  if (layout === "wine") {
    return `<div class="fr-wrap"><div class="fr-cav wine${off}" style="inset:0"><div class="fr-racks">${racks}</div></div>${panel("inset:0", door[0], open)}</div>`;
  }
  if (layout === "side_by_side") {
    return `<div class="fr-wrap">
        ${cav("left:0;width:42%;top:0;bottom:0")}${cav("left:42%;right:0;top:0;bottom:0")}
        ${panel("left:0;width:42%;top:0;bottom:0", door[0], openFreezer)}
        ${panel("left:42%;right:0;top:0;bottom:0", door[1], open, "right")}
      </div>`;
  }
  // Stacked layouts: the top door belongs to whichever compartment is on top.
  const cut = layout === "freezer_top" ? 34 : 63;
  const topOpen = layout === "freezer_top" ? openFreezer : open;
  const bottomOpen = layout === "freezer_top" ? open : openFreezer;
  return `<div class="fr-wrap">
      ${cav(`left:0;right:0;top:0;height:${cut}%`)}${cav(`left:0;right:0;top:${cut}%;bottom:0`)}
      ${panel(`left:0;right:0;top:0;height:${cut}%`, door[0], topOpen)}
      ${panel(`left:0;right:0;top:${cut}%;bottom:0`, door[1], bottomOpen)}
    </div>`;
}

// The air lines, shared by the purifier and the fan. How many show depends on
// the speed (lv1 to lv3), how fast they run on --spd; the night dims them and
// heat turns them orange.
const AIR_CSS = `
        .wind { position: absolute; display: none; overflow: visible; z-index: 7; }
        .wind path {
          fill: none; stroke: var(--air, #42a5f5); stroke-width: 2; stroke-linecap: round; stroke-dasharray: 4 6;
          animation: wind-flow var(--spd, 1.6s) linear infinite; animation-delay: var(--anim-offset, 0s);
        }
        .wind path:nth-child(2) { animation-delay: calc(var(--spd, 1.6s) * -0.33 + var(--anim-offset, 0s)); }
        .wind path:nth-child(3) { animation-delay: calc(var(--spd, 1.6s) * -0.66 + var(--anim-offset, 0s)); }
        .wind path:nth-child(4) { animation-delay: calc(var(--spd, 1.6s) * -0.5 + var(--anim-offset, 0s)); }
        .wind path:nth-child(5) { animation-delay: calc(var(--spd, 1.6s) * -0.16 + var(--anim-offset, 0s)); }
        .machine.lv1 .wind path:nth-child(n+3), .machine.lv2 .wind path:nth-child(n+4) { display: none; }
        .machine.on .wind { display: block; }
        .machine.mode-heat, .machine.warm { --air: #ff7043; }
        .machine.mode-night .wind { opacity: 0.45; }
        .machine.mode-offline { opacity: 0.45; filter: grayscale(1); }
        @keyframes wind-flow { to { stroke-dashoffset: -20; } }
        @keyframes wind-r { 0%, 35%, 100% { opacity: 1; } 50%, 85% { opacity: 0; } }
        @keyframes wind-l { 0%, 35%, 100% { opacity: 0; } 50%, 85% { opacity: 1; } }
`;

// Inline geometry: left, top, width, height.
function airBox(cls, x, y, w, h, inner = "") {
  return `<div class="${cls}" style="left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px">${inner}</div>`;
}
const AQ_BAR = "<i></i><i></i><i></i><i></i>";
// The classes and the variables every purifier and fan drawing carries.
function airMachine(cls, a, extra) {
  const on = ["run", "night", "heat"].includes(a.mode);
  const c = [cls, extra, `mode-${a.mode || "off"}`, on ? "on" : "", `lv${a.level || 2}`, a.aq ? `aq${a.aq}` : "",
    a.osc ? "osc" : "", a.back ? "back" : "", a.warm ? "warm" : "", a.natural ? "nat" : "", a.winter ? "rev" : "",
    a.lamp ? "lamp" : "", a.lit ? "lit" : "", a.wood ? "wood" : ""].filter(Boolean).join(" ");
  const style = `--spd: ${a.spd || 1.6}s; --rot: ${a.rot || 0.6}s${a.aq ? `; --aq: ${AQ_COLORS[a.aq]}` : ""}`;
  return `<div class="machine ${c}" style="${style}">`;
}

function purifierHtml(cls, p) {
  const layout = p.layout || "cylinder";
  const open = airMachine(cls, p, `pf-${layout}`);
  if (layout === "ring") {
    // The loop pivots on itself while it oscillates; the stand stays put. The
    // round screen above the gauge is the optional one.
    return `${open}
          ${airBox("dy-foot", 29, 99, 38, 7)}${airBox("dy-base", 36, 70, 24, 31)}${airBox("dy-cap", 36, 68.5, 24, 3.5)}
          ${airBox("dy-disp", 40, 94, 16, 4.5, AQ_BAR)}
          ${p.screen !== undefined ? airBox("dy-round", 38, 73, 20, 20, `<span>${esc(p.screen)}</span>`) : ""}
          <div class="dy-head">${airBox("dy-loop", 32, 1, 32, 72)}${airBox("dy-back", 36, 5, 24, 64, "<b></b><b></b><b></b><b></b>")}</div>
          ${windLines("r", 65, 13, 30, 48, "side")}${windLines("l", 1, 13, 30, 48, "side")}
        </div>`;
  }
  if (layout === "box") {
    return `${open}
          ${windLines("", 28, 0, 40, 15, "up")}
          ${airBox("co-body", 23, 34, 50, 70)}${airBox("co-lid", 22, 27, 52, 8)}${airBox("co-top", 22, 13, 52, 15)}
          ${airBox("co-fan", 31, 14.5, 34, 12)}${airBox("co-hub", 42, 18.6, 12, 4)}
          ${airBox("pf-bar", 40.5, 38.5, 15, 2.4, AQ_BAR)}
          ${p.screen !== undefined ? airBox("pf-lcd", 38, 45, 20, 9, `<span>${esc(p.screen)}</span>`) : ""}
          ${airBox("co-perf", 27, 62, 42, 38)}
        </div>`;
  }
  return `${open}
          ${windLines("", 28, 0, 40, 20, "up")}
          ${airBox("cy-body", 25, 21, 46, 83)}${airBox("cy-ring", 28, 21.5, 40, 9)}${airBox("cy-ctrl", 40, 23.8, 16, 4.4)}
          ${airBox("pf-bar", 40.5, 39.5, 15, 2.4, AQ_BAR)}
          ${p.screen !== undefined ? airBox("pf-lcd", 40, 45, 16, 9, `<span>${esc(p.screen)}</span>`) : ""}
          ${airBox("cy-perf", 26, 62, 44, 38, "<i></i>")}
        </div>`;
}

// The wood of a ceiling fan's blades: a grain along each blade, which turns
// with it.
const FAN_WOOD = `<defs><pattern id="fn-wood" width="3.2" height="88" patternUnits="userSpaceOnUse"><rect width="3.2" height="88" fill="#a86b3c"/>`
  + `<rect x="2.2" width=".7" height="88" fill="#7d4a24" opacity=".7"/><rect x=".6" width=".4" height="88" fill="#c88a55" opacity=".6"/></pattern></defs>`;
function fanHtml(cls, f) {
  const layout = f.layout || "stand";
  const open = airMachine(cls, f, `fn-${layout}`);
  if (layout === "ceiling") {
    // The blades turn in a flattened plane. The half nearer the ceiling passes
    // in front of the motor, the other half behind it, and they start at the
    // motor's rim so its inside never shows.
    const plane = (front) => `<div class="fn-plane${front ? " front" : ""}" style="left: 4px; top: -5px; width: 88px; height: 88px">`
      + `<svg width="88" height="88" viewBox="0 0 88 88">${front ? "" : FAN_WOOD}${fanBlades(44, 44, 5, 34, 9, 6)}</svg></div>`;
    return `${open}
          ${airBox("fn-halo", 18, 40, 60, 60)}${airBox("fn-ceil", 2, 8, 92, 1)}${airBox("fn-canopy", 43, 9, 10, 3.5)}${airBox("fn-pole", 46.75, 12, 2.5, 21)}
          ${plane(false)}${plane(true)}
          ${airBox("fn-housing", 41, 32, 14, 9)}${f.lamp ? airBox("fn-globe", 42.5, 40.6, 11, 5.2) : ""}
          ${windLines("", 12, 49, 72, 57, f.winter ? "down" : "up")}
        </div>`;
  }
  // A cage on a pole: a tall one for the floor, a short one for a desk.
  const table = layout === "table";
  const spokes = Array.from({ length: 16 }, (_, k) => {
    const a = k * Math.PI / 8;
    return `<line x1="${(30 + 5 * Math.cos(a)).toFixed(2)}" y1="${(28.5 + 5 * Math.sin(a)).toFixed(2)}" x2="${(30 + 27 * Math.cos(a)).toFixed(2)}" y2="${(28.5 + 27 * Math.sin(a)).toFixed(2)}"/>`;
  }).join("");
  const top = table ? 26 : 2;
  return `${open}
          ${table ? airBox("fn-pole", 46, 52, 4, 46) + airBox("fn-foot", 33, 96, 30, 7) : airBox("fn-pole", 46, 28, 4, 70) + airBox("fn-foot", 29, 96, 38, 8)}
          ${airBox("fn-head", 21, top, 54, 52, `<svg width="54" height="52" viewBox="0 0 60 58">${fanBlades(30, 28.5, 3, 23, 10, 0)}`
            + `<g class="fn-cage"><circle class="rim" cx="30" cy="28.5" r="27"/><circle cx="30" cy="28.5" r="18"/><circle cx="30" cy="28.5" r="9"/>${spokes}</g>`
            + `<circle class="fn-hub" cx="30" cy="28.5" r="5"/></svg>`)}
          ${windLines("r", 72, top + 4, 24, 44, "side")}${windLines("l", 0, top + 4, 24, 44, "side")}
        </div>`;
}

// A hair dryer seen from the side, nozzle to the right, or a ring dryer seen
// from the front. The air leaves the nozzle in a fan of lines, or the ring in
// widening circles: blue while cool, orange while hot, more of it on high.
function hairDryerHtml(cls, hd) {
  const mode = hd.mode || "off";
  const level = hd.level || 0;
  const defs = `<defs>
            <linearGradient id="hd-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="hd-s-hi"/><stop offset="1" class="hd-s-body"/></linearGradient>
            <linearGradient id="hd-air" gradientUnits="userSpaceOnUse" x1="72" y1="0" x2="96" y2="0"><stop offset="0" class="hd-a0"/><stop offset="1" class="hd-a1"/></linearGradient>
            <radialGradient id="hd-heat"><stop offset="0" stop-color="#ffb74d"/><stop offset="1" stop-color="#ff5722" stop-opacity="0"/></radialGradient>
            <radialGradient id="hd-rheat"><stop offset="0.55" stop-color="#ff5722" stop-opacity="0"/><stop offset="0.8" stop-color="#ff9800" stop-opacity="0.9"/><stop offset="1" stop-color="#ff5722" stop-opacity="0"/></radialGradient>
          </defs>`;
  if (hd.layout === "ring") {
    const ring = "M20 34a22 22 0 1 0 44 0a22 22 0 1 0 -44 0ZM30 34a12 12 0 1 1 24 0a12 12 0 1 1 -24 0Z";
    const circles = level ? Array.from({ length: level >= 3 ? 3 : 2 }, (_, i) =>
      `<circle cx="42" cy="34" r="24" style="animation-delay: calc(${(i * 0.45).toFixed(2)}s + var(--anim-offset, 0s))"/>`).join("") : "";
    return `
        <div class="machine ${cls} hd-ring mode-${mode}">
          <svg class="hd-svg" viewBox="0 0 96 108">${defs}
            <g class="hd-rings">${circles}</g>
            <path class="hd-part" d="M36 52L48 52L50 96Q50 101 45 101L39 101Q34 101 34 96Z"/>
            ${[0, 1, 2, 3, 4].map((i) => `<line class="hd-grip" x1="36.5" y1="${80 + i * 3.5}" x2="47.5" y2="${80 + i * 3.5}"/>`).join("")}
            <circle class="hd-led" cx="42" cy="62" r="1.8"/><rect class="hd-btn" x="39.5" y="66" width="5" height="8" rx="2.5"/>
            <path class="hd-part" fill-rule="evenodd" d="${ring}"/>
            <path class="hd-heat" fill-rule="evenodd" fill="url(#hd-rheat)" d="${ring}"/>
            <circle class="hd-inner" cx="42" cy="34" r="17"/>
          </svg>
        </div>`;
  }
  // The lines start at the mouth of the nozzle and fan out to the edge.
  const lines = [];
  for (let i = 0; i < level; i++) {
    const f = level === 1 ? 0.5 : i / (level - 1);
    const y0 = (24.5 + f * 10).toFixed(1);
    const y1 = (17 + f * 25).toFixed(1);
    lines.push(`<path d="M72.5 ${y0}C80 ${y0} 86 ${y1} 95 ${y1}" style="animation-delay: calc(${(-i * 0.17).toFixed(2)}s + var(--anim-offset, 0s))"/>`);
  }
  return `
        <div class="machine ${cls} hd-pistol mode-${mode}">
          <svg class="hd-svg" viewBox="0 0 96 108">${defs}
            <g transform="translate(-2 2) scale(0.9)">
              <path class="hd-part" d="M40 46L50 46L56 92Q56 98 50 98L44 98Q38 98 38 92Z"/>
              <rect class="hd-btn" x="44.5" y="58" width="5" height="11" rx="2.5"/><circle class="hd-led" cx="47" cy="75" r="1.8"/>
              <path class="hd-cord" d="M47 98q0 6 -6 9"/>
              <rect class="hd-part" x="8" y="14" width="58" height="34" rx="16"/>
              <path class="hd-nozzle" d="M64 18L80 22Q82 23 82 25L82 35Q82 37 80 38L64 44Z"/>
              <ellipse class="hd-heat" cx="76" cy="30" rx="7" ry="9" fill="url(#hd-heat)"/>
              <rect class="hd-btn" x="80" y="23" width="2.5" height="14" rx="1"/>
              <circle class="hd-grille" cx="14" cy="31" r="10"/>
              ${[0, 1, 2].map((i) => `<line class="hd-grip" x1="${9 + i * 5}" y1="24" x2="${9 + i * 5}" y2="38"/>`).join("")}
            </g>
            <g class="hd-air" stroke="url(#hd-air)">${lines.join("")}</g>
          </svg>
        </div>`;
}

// The LEDs of one device do not blink in step.
function ntDelay(i, step, mod) {
  return `animation-delay: calc(-${((i * step) % mod).toFixed(2)}s + var(--anim-offset, 0s))`;
}

// A switch: its ports in one or two rows, the first `lit` of them up. A real
// one numbers them odd on top and even below, with the LEDs of the bottom row
// under its ports.
function ntSwitch(n, lit) {
  const rows = n <= 8 ? 1 : 2, per = n / rows, x0 = 14, span = 79, pitch = span / per;
  const pw = +(pitch * 0.78).toFixed(2), ph = n >= 32 ? 5 : 6, lw = Math.max(1, +(pw * 0.32).toFixed(2));
  const top = rows === 1 ? 42 : 33, h = rows === 1 ? 24 : 38, ys = rows === 1 ? [51] : [42, 55];
  let html = `<div class="nt-body" style="left:0;top:${top}px;width:96px;height:${h}px"></div>
          <div class="nt-hi" style="left:4px;top:${top + 2.5}px;width:88px"></div>
          <div class="nt-led nt-pw" style="left:5px;top:${top + 7}px"></div>
          <div class="nt-led" style="left:5px;top:${top + 13}px"></div>`;
  for (let i = 0; i < n; i++) {
    const r = rows === 1 ? 0 : i % 2, c = rows === 1 ? i : Math.floor(i / 2);
    const x = +(x0 + c * pitch + (pitch - pw) / 2).toFixed(2), ly = r === 0 ? -2.4 : ph + 0.9;
    html += `<div class="nt-port${i < lit ? " up" : ""}" style="left:${x}px;top:${ys[r]}px;width:${pw}px;height:${ph}px">`
      + `<i class="a" style="left:0.2px;top:${ly}px;width:${lw}px"></i>`
      + `<i class="b" style="right:0.2px;top:${ly}px;width:${lw}px;${ntDelay(i, 0.37, 1.3)}"></i></div>`;
  }
  return `${html}<div class="nt-vent" style="left:${x0}px;top:${top + h - 4}px;width:${span}px;height:2.5px"></div>
          <div class="nt-floor" style="left:6px;width:84px;top:${top + h}px"></div>`;
}

// A NAS seen from the front, the way Synology draws theirs: the LEDs down the
// left, one per bay, then the bays. An empty bay has no tray and its LED stays
// dark.
function ntNas(bays, disks) {
  const tw = 13, gap = 2, strip = 11, w = strip + bays * tw + (bays - 1) * gap + 6, h = 74;
  const x = Math.round((96 - w) / 2), y = 104 - h - 4;
  const leds = ["nt-pw", "nt-lan"].concat(Array.from({ length: bays }, (_, i) => `d-${disks[i] || "gen"}`));
  let html = `<div class="nt-body" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:4px"></div>`;
  html += leds.map((k, i) => `<div class="nt-led ${k}" style="left:${x + 4}px;top:${y + 8 + i * 6}px;${ntDelay(i, 0.45, 2.8)}"></div>`).join("");
  html += `<div class="nt-led" style="left:${x + 4}px;top:${y + 8 + leds.length * 6}px"></div>
          <div class="nt-key" style="left:${x + 2.5}px;top:${y + h - 11}px;width:6px;height:6px"></div>`;
  for (let i = 0; i < bays; i++) {
    const tx = x + strip + i * (tw + gap);
    html += `<div class="nt-bay" style="left:${tx}px;top:${y + 5}px;width:${tw}px;height:${h - 10}px"></div>`;
    if (disks[i] !== "empty") {
      html += `<div class="nt-handle" style="left:${tx + 3}px;top:${y + 8}px;width:${tw - 6}px;height:3px"></div>
          <div class="nt-tray" style="left:${tx + 3}px;top:${y + 16}px;width:${tw - 6}px;height:${h - 28}px"></div>`;
    }
  }
  return `${html}<div class="nt-floor" style="left:${x + 4}px;width:${w - 8}px;top:${y + h}px"></div>`;
}

// A server tower: four drive bays, a fan behind its grille and the power
// button.
function ntServer(disks, fanOff) {
  let html = `<div class="nt-body" style="left:28px;top:6px;width:40px;height:98px"></div>
          <div class="nt-vent" style="left:33px;top:11px;width:30px;height:12px"></div>`;
  for (let i = 0; i < 4; i++) {
    const y = 28 + i * 13;
    html += `<div class="nt-bay" style="left:33px;top:${y}px;width:30px;height:10px"></div>`;
    if (disks[i] !== "empty") html += `<div class="nt-handle" style="left:36px;top:${y + 4}px;width:14px;height:1.4px"></div>`;
    html += `<div class="nt-led d-${disks[i] || "gen"}" style="left:58px;top:${y + 3.5}px;${ntDelay(i, 0.6, 2.8)}"></div>`;
  }
  return `${html}<div class="nt-fan${fanOff ? " stop" : ""}" style="left:38px;top:81px;width:20px;height:20px"></div>
          <div class="nt-key" style="left:59px;top:84px;width:6px;height:6px"></div>
          <div class="nt-led nt-pw" style="left:60.7px;top:85.7px"></div>
          <div class="nt-led" style="left:60.7px;top:94px"></div>
          <div class="nt-floor" style="left:24px;width:48px;bottom:0"></div>`;
}

// A rack behind its glass door: fans on top, a patch panel, a switch, a NAS
// and a server.
function ntRack(fanOff) {
  const fan = fanOff ? " stop" : "";
  const ports = [1, 1, 1, 0, 1, 1].map((up, i) => `<div class="nt-port${up ? " up" : ""}" style="left:${30 + i * 7}px;top:41.5px;width:5.5px;height:5px">`
    + `<i class="a" style="left:0.2px;top:-2.4px;width:1.6px"></i><i class="b" style="right:0.2px;top:-2.4px;width:1.6px;${ntDelay(i, 0.37, 1.3)}"></i></div>`).join("");
  const bays = [0, 1, 2].map((i) => `<div class="nt-bay" style="left:${24 + i * 15}px;top:52px;width:13px;height:12px"></div>`
    + `<div class="nt-led d-gen" style="left:${33 + i * 15}px;top:54px;${ntDelay(i, 0.5, 2.8)}"></div>`).join("");
  const jacks = Array.from({ length: 8 }, (_, i) => `<div class="nt-jack" style="left:${25 + i * 6}px;top:27px;width:4px;height:3px"></div>`).join("");
  return `<div class="nt-body" style="left:14px;top:2px;width:68px;height:102px"></div>
          <div class="nt-dark" style="left:19px;top:7px;width:58px;height:92px"></div>
          <div class="nt-fan${fan}" style="left:28px;top:9px;width:11px;height:11px"></div>
          <div class="nt-fan${fan}" style="left:57px;top:9px;width:11px;height:11px"></div>
          <div class="nt-u" style="left:21px;top:24px;width:54px;height:9px"></div>${jacks}
          <div class="nt-u" style="left:21px;top:35px;width:54px;height:11px"></div>
          <div class="nt-led nt-pw" style="left:24px;top:39px"></div>${ports}
          <div class="nt-u" style="left:21px;top:49px;width:54px;height:18px"></div>${bays}
          <div class="nt-led nt-pw" style="left:70px;top:53px"></div>
          <div class="nt-led" style="left:70px;top:59px"></div>
          <div class="nt-u" style="left:21px;top:70px;width:54px;height:12px"></div>
          <div class="nt-vent" style="left:24px;top:73px;width:30px;height:6px"></div>
          <div class="nt-led nt-lan" style="left:70px;top:75px"></div>
          <div class="nt-u" style="left:21px;top:85px;width:54px;height:11px;opacity:0.55"></div>
          <div class="nt-glass" style="left:19px;top:7px;width:58px;height:92px"></div>
          <div class="nt-handle" style="left:78px;top:46px;width:2px;height:14px;background:#8a929c"></div>
          <div class="nt-floor" style="left:10px;width:76px;bottom:0"></div>`;
}

// A router or an ISP's box, flat on the shelf with its antennas up: the power,
// internet and Wi-Fi lights, then one per LAN port. The Wi-Fi waves rise from
// it while it is up, faster when it is busy, and not at all with its Wi-Fi off.
// A lost internet link puts it in alert, every light red.
function ntRouter() {
  const waves = [[42, 52, 12], [36, 46, 24], [30, 40, 36]].map(([top, l, w], i) =>
    `<div class="nt-wave" style="left:${48 - w / 2}px;top:${top}px;width:${w}px;height:${w}px;${ntDelay(i, 0.3, 2.4)}"></div>`).join("");
  const lan = [0, 1, 2, 3].map((i) => `<div class="nt-led nt-lan" style="left:${56 + i * 6}px;top:83px;${ntDelay(i, 0.45, 2.4)}"></div>`).join("");
  return `${waves}
          <div class="nt-ant" style="left:20px;top:46px;width:3.5px;height:30px;transform:rotate(-8deg)"></div>
          <div class="nt-ant" style="left:72.5px;top:46px;width:3.5px;height:30px;transform:rotate(8deg)"></div>
          <div class="nt-ant" style="left:46px;top:52px;width:3.5px;height:24px"></div>
          <div class="nt-body" style="left:10px;top:74px;width:76px;height:20px;border-radius:6px"></div>
          <div class="nt-hi" style="left:16px;top:76px;width:64px"></div>
          <div class="nt-led nt-pw" style="left:18px;top:83px"></div>
          <div class="nt-led nt-wan" style="left:26px;top:83px"></div>
          <div class="nt-led nt-wl" style="left:34px;top:83px"></div>${lan}
          <div class="nt-vent" style="left:18px;top:89px;width:60px;height:2px"></div>
          <div class="nt-floor" style="left:8px;width:80px;top:94px"></div>`;
}

function networkHtml(cls, n) {
  const layout = NET_LAYOUTS.includes(n.layout) ? n.layout : "nas";
  const disks = n.disks || [];
  const inner = layout === "switch" ? ntSwitch(n.ports || 8, n.lit || 0)
    : layout === "server" ? ntServer(disks, n.fanOff)
      : layout === "rack" ? ntRack(n.fanOff)
        : layout === "router" ? ntRouter()
          : ntNas(n.bays || 2, disks);
  return `
        <div class="machine ${cls} nt nt-${n.mode || "off"} nt-l-${layout}${n.wifiOff ? " nt-nowifi" : ""}">${inner}
        </div>`;
}

// A pool pump's drawing: the sand filter on the left with its valve and its
// gauge, the pump in front of the pool, the pipes between them, and the tank
// and long tube of a chlorine dosing pump when there is one. The water flows
// while the pump filters, a jet turns in the strainer, the gauge reads the
// pressure. A backwash sends the dirty water to the drain, never to the pool.
const POOL_SVG = `<svg class="pl-pp" viewBox="0 -6 96 108">
<defs>
<linearGradient id="pl-g-body" x1="0" x2="1"><stop offset="0" stop-color="var(--bl)"/><stop offset=".25" stop-color="var(--b)"/><stop offset=".45" stop-color="var(--bh)"/><stop offset=".7" stop-color="var(--b)"/><stop offset="1" stop-color="var(--bl)"/></linearGradient>
<linearGradient id="pl-g-motor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#555d65"/><stop offset=".35" stop-color="#3a4147"/><stop offset="1" stop-color="#1f2327"/></linearGradient>
<linearGradient id="pl-g-alu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef1f3"/><stop offset=".35" stop-color="#c4cbd1"/><stop offset="1" stop-color="#7d868e"/></linearGradient>
<linearGradient id="pl-g-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b3e5fc"/><stop offset="1" stop-color="#29b6f6"/></linearGradient>
<linearGradient id="pl-g-pool" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fc3f7"/><stop offset="1" stop-color="#0288d1"/></linearGradient>
<radialGradient id="pl-g-glow"><stop offset="0" stop-color="#fff59d" stop-opacity=".95"/><stop offset="1" stop-color="#fff59d" stop-opacity="0"/></radialGradient>
</defs>
<ellipse cx="48" cy="94.6" rx="46" ry="2.6" fill="rgba(0,0,0,.18)"/>
<path d="M57 1 H95 L97 22 H55 Z" fill="#e7e1d3" stroke="#c9c1ae" stroke-width=".6"/>
<path class="pl-pool" d="M60 4 H92 L93.4 19.5 H58.6 Z"/>
<path d="M60 4 H92 L91.2 7.2 H60.8 Z" fill="rgba(0,60,110,.38)"/>
<ellipse class="pl-glow" cx="76" cy="10" rx="13" ry="9" fill="url(#pl-g-glow)"/>
<path class="pl-rip" d="M63 8.5 q2.5 -1.2 5 0 t5 0 t5 0 t5 0 t5 0"/><path class="pl-rip" d="M63 13 q2.5 -1.2 5 0 t5 0 t5 0 t5 0 t5 0" style="animation-delay:-.8s"/>
<ellipse class="pl-spot" cx="76" cy="5.7" rx="2.6" ry="1.4"/><ellipse cx="76" cy="5.7" rx="1.1" ry=".6" fill="rgba(255,255,255,.65)"/>
<path d="M84 3 Q84 0 86 0 Q88 0 88 3 V13 M88.5 3 Q88.5 0 90.5 0 Q92.5 0 92.5 3 V13" fill="none" stroke="#b7c0c7" stroke-width="1.1"/>
<path d="M88 7 H92.5 M88 10.5 H92.5" stroke="#b7c0c7" stroke-width=".9"/>
<path class="pl-pvc-o" d="M13 26 H8 Q5.5 26 5.5 23.5 V8.5 Q5.5 6 8 6 H55"/><path class="pl-pvc" d="M13 26 H8 Q5.5 26 5.5 23.5 V8.5 Q5.5 6 8 6 H55"/>
<path class="pl-pvc-o" d="M31 26 H36 Q40 26 40 30 V36 Q40 40 44 40 H59.5 Q63.5 40 63.5 44 V53"/><path class="pl-pvc" d="M31 26 H36 Q40 26 40 30 V36 Q40 40 44 40 H59.5 Q63.5 40 63.5 44 V53"/>
<path d="M15 31 H4.5 Q2.2 31 2.2 33.3 V93" fill="none" stroke="#8e979f" stroke-width="4.6"/><path d="M15 31 H4.5 Q2.2 31 2.2 33.3 V93" fill="none" stroke="#bfc6cc" stroke-width="3.2"/>
<rect x="-2.3" y="92.6" width="9" height="3" rx=".8" fill="#2b3137"/><path d="M-.8 94.1 H5.2" stroke="#596169" stroke-width=".7" stroke-dasharray="1 .8"/>
<path class="pl-flow pl-o" d="M63.5 53 V44 Q63.5 40 59.5 40 H44 Q40 40 40 36 V30 Q40 26 36 26 H31"/>
<path class="pl-flow pl-r" d="M13 26 H8 Q5.5 26 5.5 23.5 V8.5 Q5.5 6 8 6 H55"/>
<path class="pl-flow pl-w" d="M15 31 H4.5 Q2.2 31 2.2 33.3 V93"/>
<rect class="pl-pvc-j" x="30" y="3.1" width="3" height="5.8" rx=".8"/>
<rect x="53.6" y="1.6" width="3.6" height="8.8" rx="1" fill="#b6bec5" stroke="#7d868e" stroke-width=".7"/><circle cx="55.4" cy="3.3" r=".45" fill="#7d868e"/><circle cx="55.4" cy="8.7" r=".45" fill="#7d868e"/>
<ellipse cx="61.6" cy="6" rx="1.2" ry="1.6" fill="#e9eef1" stroke="#9aa3ab" stroke-width=".5"/>
<g class="pl-ice"><path d="M10 3.5 l2 -2 M20 4 l1.5 -2.5 M38 3.5 l2 -2.4 M46 4 l1.5 -2.5 M54 3.5 l2 -2.4 M48 37.5 l1.5 -2.5 M58 38 l2 -2.4 M66 47 l2 -1.5" stroke="#e1f5fe" stroke-width="1.2" stroke-linecap="round"/></g>
<rect class="pl-body-d" x="6" y="87" width="32" height="7" rx="2"/>
<path class="pl-body" d="M8 41 Q8 31 22 30 Q36 31 36 41 L36 89 Q22 92 8 89 Z"/>
<path class="pl-ring" d="M8 52 Q22 55 36 52 M8 76 Q22 79 36 76"/>
<g class="pl-sand"><circle cx="15" cy="70" r="1.3"/><circle cx="22" cy="66" r="1.1"/><circle cx="29" cy="71" r="1.3"/></g>
<rect x="11" y="23" width="3" height="6" rx="1" fill="var(--bl)"/><rect x="30" y="23" width="3" height="6" rx="1" fill="var(--bl)"/>
<rect x="14" y="20.5" width="16" height="10" rx="2.5" fill="#2b3137"/>
<rect x="12" y="16.5" width="20" height="3.2" rx="1.6" fill="#1f2428"/><rect x="20.5" y="18.5" width="3" height="3" fill="#1f2428"/>
<path d="M30 20.5 L33 17.5" stroke="#8e979f" stroke-width="1.2"/>
<circle cx="34" cy="14.5" r="4.6" fill="#f5f6f7" stroke="#8e979f" stroke-width=".9"/>
<path d="M30.8 14.5 A3.2 3.2 0 0 1 37.2 14.5" fill="none" stroke="#c0c6cb" stroke-width=".6"/>
<path class="pl-needle" d="M34 14.5 L34 11.5"/><circle cx="34" cy="14.5" r=".7" fill="#333"/>
<path class="pl-pvc-o" d="M41.5 73 H41 Q39 73 39 75 V95"/><path class="pl-pvc" d="M41.5 73 H41 Q39 73 39 75 V95"/>
<path class="pl-flow pl-s" d="M39 95 V75 Q39 73 41 73 H41.5"/>
<ellipse cx="39" cy="95" rx="3.6" ry="1" fill="#2b3137"/>
<g class="pl-cl"><path class="pl-tube" d="M74 46 V36.5 Q74 34 71.5 34 H52.5 Q50 34 50 31.5 V8.4"/>
<path class="pl-drip" d="M74 46 V36.5 Q74 34 71.5 34 H52.5 Q50 34 50 31.5 V8.4"/>
<rect x="48.3" y="7.6" width="3.4" height="2.4" rx=".6" fill="#2b3137"/>
<path class="pl-can" d="M69 47 h10 a1.5 1.5 0 0 1 1.5 1.5 v10 a1.5 1.5 0 0 1 -1.5 1.5 h-10 a1.5 1.5 0 0 1 -1.5 -1.5 v-10 a1.5 1.5 0 0 1 1.5 -1.5z"/>
<rect class="pl-can-l" x="68.1" y="52" width="11.8" height="7.5" rx="1"/><rect x="72.6" y="45.2" width="2.8" height="2.2" rx=".6" fill="#ef6c00"/>
<circle class="pl-can-led" cx="70.4" cy="49" r=".9"/></g>
<path d="M44 89 H61 V93.5 H44 Z M70 88 H90 L91 93.5 H69 Z" fill="#1d2125"/>
<path class="pl-body" d="M44 66 H61 V86 Q61 90.5 56 90.5 H49 Q44 90.5 44 86 Z"/>
<path d="M44.5 77.5 H60.5 M44.5 80.5 H60.5 M44.5 83.5 H60.5 M45 86.5 H60" stroke="rgba(0,0,0,.45)" stroke-width=".8"/>
<path d="M44.5 78.3 H60.5 M44.5 81.3 H60.5 M44.5 84.3 H60.5" stroke="rgba(255,255,255,.08)" stroke-width=".5"/>
<rect class="pl-body" x="40.5" y="69.5" width="5" height="7" rx="1"/><rect x="39.8" y="69" width="1.8" height="8" rx=".6" fill="#aeb6bd"/>
<path d="M42.6 62 H62.4 V66.4 H42.6 Z" fill="#23282d"/>
<path d="M44 62 V56 Q44 50.5 52.5 50.5 Q61 50.5 61 56 V62 Z" fill="rgba(220,235,245,.5)" stroke="#9fb0bd" stroke-width=".8"/>
<rect class="pl-lid-water" x="44.8" y="54" width="15.4" height="8" rx="1.2"/>
<path d="M47 55 V61.5 M50.5 55 V61.5 M54 55 V61.5 M57.5 55 V61.5" stroke="rgba(255,255,255,.4)" stroke-width=".6"/>
<path d="M47.5 51.8 Q52.5 49.6 57.5 51.8 M49 51.2 V53.4 M52.5 50.6 V53 M56 51.2 V53.4" fill="none" stroke="rgba(255,255,255,.85)" stroke-width=".7"/>
<g class="pl-swirl"><path d="M52.5 61.5 V54.2"/><path d="M52.5 54.2 Q49 53 47.4 60"/><path d="M52.5 54.2 Q56 53 57.6 60"/><path d="M52.5 54.8 Q50.6 54.6 49.8 60.5"/><path d="M52.5 54.8 Q54.4 54.6 55.2 60.5"/></g>
<path class="pl-body" d="M59 62 H67.5 Q71 62 71 66 V90.5 H59 Z"/>
<circle cx="65" cy="77" r="6" fill="none" stroke="var(--bl)" stroke-width=".8" opacity=".6"/>
<rect class="pl-body" x="60.6" y="52.5" width="5.8" height="10" rx=".8"/><rect x="60.2" y="51.6" width="6.6" height="2.4" rx=".6" fill="#aeb6bd"/>
<rect x="70" y="69" width="2.5" height="18" rx=".6" fill="#23282d"/>
<rect x="72" y="68" width="15" height="20" rx="2" fill="url(#pl-g-alu)"/>
<path d="M72.5 71 H86.5 M72.5 73.5 H86.5 M72.5 76 H86.5 M72.5 78.5 H86.5 M72.5 81 H86.5 M72.5 83.5 H86.5 M72.5 86 H86.5" stroke="rgba(60,70,78,.55)" stroke-width=".55"/>
<path d="M86.5 69 H90 Q93.5 69 93.5 73 V83 Q93.5 87 90 87 H86.5 Z" fill="#1d2125"/>
<path d="M89.5 70.5 V85.5 M91.5 71.5 V84.5" stroke="#3b4248" stroke-width=".6"/>
<rect x="73" y="62.5" width="11" height="6" rx="1" fill="#22272b"/><circle cx="75" cy="64.3" r=".5" fill="#69727a"/><circle cx="82" cy="64.3" r=".5" fill="#69727a"/>
<circle class="pl-led" cx="78.5" cy="65.6" r=".9"/>
<g class="pl-snow" transform="translate(89 42)"><path d="M0 -4.5 V4.5 M-3.9 -2.25 L3.9 2.25 M-3.9 2.25 L3.9 -2.25 M-1.2 -3.4 L0 -2.4 L1.2 -3.4 M-1.2 3.4 L0 2.4 L1.2 3.4" stroke="#4fc3f7" stroke-width="1.2" stroke-linecap="round" fill="none"/></g>
<g transform="translate(79 43) scale(.55)"><g class="pl-smoke"><g class="pl-pf pl-pf1"><circle class="pl-o" cx="13" cy="23" r="6.9"/><circle class="pl-o" cx="20" cy="18" r="7.9"/><circle class="pl-o" cx="27" cy="22" r="6.4"/><circle class="pl-o" cx="17" cy="12" r="5.9"/><circle class="pl-o" cx="24" cy="11" r="5.4"/><circle class="pl-f" cx="13" cy="23" r="5.5"/><circle class="pl-f" cx="20" cy="18" r="6.5"/><circle class="pl-f" cx="27" cy="22" r="5"/><circle class="pl-f" cx="17" cy="12" r="4.5"/><circle class="pl-f" cx="24" cy="11" r="4"/><path class="pl-hl" d="M15 9 q2 -2 4 -1 M17 15 q2 -2.5 5 -1.5"/></g><g class="pl-pf pl-pf2"><circle class="pl-o" cx="9.049999999999999" cy="21.55" r="6.074999999999999"/><circle class="pl-o" cx="15" cy="17.299999999999997" r="6.924999999999999"/><circle class="pl-o" cx="20.95" cy="20.7" r="5.65"/><circle class="pl-o" cx="12.45" cy="12.2" r="5.225"/><circle class="pl-o" cx="18.4" cy="11.35" r="4.8"/><circle class="pl-f" cx="9.049999999999999" cy="21.55" r="4.675"/><circle class="pl-f" cx="15" cy="17.299999999999997" r="5.5249999999999995"/><circle class="pl-f" cx="20.95" cy="20.7" r="4.25"/><circle class="pl-f" cx="12.45" cy="12.2" r="3.8249999999999997"/><circle class="pl-f" cx="18.4" cy="11.35" r="3.4"/><path class="pl-hl" d="M10.75 9.649999999999999 q2 -2 4 -1 M12.45 14.75 q2 -2.5 5 -1.5"/></g></g></g><g transform="translate(89.5 63.5)"><g class="pl-ang"><path d="M3.5 1.5 Q3.5 4 1 4"/><path d="M6 1.5 Q6 4 8.5 4"/><path d="M3.5 9.5 Q3.5 7 1 7"/><path d="M6 9.5 Q6 7 8.5 7"/></g></g>
</svg>`;
function poolHtml(cls, p) {
  const mode = p.mode || "off";
  let svg = POOL_SVG;
  if (p.needle !== null && p.needle !== undefined && mode !== "error") {
    svg = svg.replace('<path class="pl-needle"', `<path class="pl-needle" style="transform: rotate(${p.needle}deg)"`);
  }
  if (p.can !== null && p.can !== undefined) {
    const h = Math.round(7.5 * Math.max(0, Math.min(100, p.can))) / 100;
    svg = svg.replace('<rect class="pl-can-l" x="68.1" y="52" width="11.8" height="7.5"',
      `<rect class="pl-can-l" x="68.1" y="${Math.round((59.5 - h) * 100) / 100}" width="11.8" height="${h}"`);
  }
  return `
        <div class="machine ${cls} pl pl-m-${mode}${p.dosing ? " pl-chlore" : ""}${p.lit ? " pl-lamp" : ""}${p.chlorine ? "" : " pl-nocl"}">${svg}</div>`;
}

// A robot's drawing. It leaves its base and goes back and forth over its
// floor: a rug for a vacuum, tiles for a mop, a lawn for a mower, which is
// drawn in profile with the grass cut under it. Its ring says what it does,
// like the real ones: green on the base, blue at work, amber in a pause,
// orange for a full bin or an empty tank, red in an error, where a puff of
// smoke and an anger mark say it the way a cartoon would.
const ROBOT_MANGA = `<svg class="rbt-smoke" viewBox="0 0 40 30"><g class="rbt-pf rbt-pf1"><circle class="rbt-o" cx="13.0" cy="23.0" r="6.9"/><circle class="rbt-o" cx="20.0" cy="18.0" r="7.9"/><circle class="rbt-o" cx="27.0" cy="22.0" r="6.4"/><circle class="rbt-o" cx="17.0" cy="12.0" r="5.9"/><circle class="rbt-o" cx="24.0" cy="11.0" r="5.4"/><circle class="rbt-f" cx="13.0" cy="23.0" r="5.5"/><circle class="rbt-f" cx="20.0" cy="18.0" r="6.5"/><circle class="rbt-f" cx="27.0" cy="22.0" r="5.0"/><circle class="rbt-f" cx="17.0" cy="12.0" r="4.5"/><circle class="rbt-f" cx="24.0" cy="11.0" r="4.0"/><path class="rbt-hl" d="M15.0 9.0 q2 -2 4 -1 M17.0 15.0 q2 -2.5 5 -1.5"/></g><g class="rbt-pf rbt-pf2"><circle class="rbt-o" cx="9.0" cy="21.6" r="6.1"/><circle class="rbt-o" cx="15.0" cy="17.3" r="6.9"/><circle class="rbt-o" cx="20.9" cy="20.7" r="5.7"/><circle class="rbt-o" cx="12.4" cy="12.2" r="5.2"/><circle class="rbt-o" cx="18.4" cy="11.3" r="4.8"/><circle class="rbt-f" cx="9.0" cy="21.6" r="4.7"/><circle class="rbt-f" cx="15.0" cy="17.3" r="5.5"/><circle class="rbt-f" cx="20.9" cy="20.7" r="4.2"/><circle class="rbt-f" cx="12.4" cy="12.2" r="3.8"/><circle class="rbt-f" cx="18.4" cy="11.3" r="3.4"/><path class="rbt-hl" d="M10.8 9.6 q2 -2 4 -1 M12.4 14.8 q2 -2.5 5 -1.5"/></g></svg>`;
const ROBOT_ANGER = `<svg class="rbt-angm" viewBox="29.5 0.5 9.5 10"><g class="rbt-ang"><path d="M33 1.5 Q33 4 30.5 4"/><path d="M35.5 1.5 Q35.5 4 38 4"/><path d="M33 9.5 Q33 7 30.5 7"/><path d="M35.5 9.5 Q35.5 7 38 7"/></g></svg>`;
const ROBOT_MOWER_SVG = `<svg viewBox="0 0 62 35">
 <ellipse cx="31" cy="34" rx="29" ry="2" fill="rgba(0,0,0,.25)"/>
 <path d="M5 27 C3 20 6 12 14 10 L33 8 C41 8 47 12 53 18 C57 21 59 24 58 27 Z" style="fill: var(--b)"/>
 <path d="M11 13 C17 10 29 9 35 9.5 C41 10 46 13 50 16.5 C42 15 28 14.5 12 16 Z" style="fill:var(--bh)" opacity=".9"/>
 <rect x="5" y="25" width="54" height="3.5" rx="1.5" fill="#1b1e21"/>
 <path d="M24 21.5 H53" stroke="#ff8f1f" stroke-width="1.6" stroke-linecap="round"/>
 <ellipse cx="25" cy="10.2" rx="7" ry="1.5" style="fill:var(--bl)"/>
 <ellipse class="rbt-led" cx="35" cy="10" rx="1.6" ry=".9"/>
 <path d="M48 13.2 l4.5 3.4 l-1.6 1.5 l-4.4 -3 Z" fill="#1b1e21"/><circle cx="50.2" cy="15.6" r=".8" fill="#4fc3f7"/>
 <path d="M3.5 22 A12.5 12.5 0 0 1 28.5 22" fill="none" style="stroke:var(--bl)" stroke-width="2.4"/>
 <g class="rbt-whl"><circle cx="16" cy="25.5" r="9" fill="#1b1e21"/><circle cx="16" cy="25.5" r="8.2" fill="none" stroke="#3a3f45" stroke-width="1.8" stroke-dasharray="1.5 1.2"/>
  <circle cx="16" cy="25.5" r="4" fill="#4a5057"/><path d="M16 21.5 V29.5 M12 25.5 H20" stroke="#2b2f34" stroke-width="1.2"/><circle cx="16" cy="25.5" r="1.3" fill="#ff8f1f"/></g>
 <g class="rbt-whl"><circle cx="51" cy="31.3" r="3.4" fill="#1b1e21"/><circle cx="51" cy="31.3" r="1.3" fill="#555c63"/></g>
</svg>`;
let robotCloudN = 0;
function robotRain() {
  const cg = `rbt-cg${robotCloudN++}`;
  let drops = "";
  for (let i = 0; i < 18; i++) {
    const x = 18 + ((i * 37) % 60);
    const d = 0.5 + ((i * 7) % 5) * 0.06;
    const dl = -((i * 0.23) % d);
    drops += `<b style="left: ${x}px; --d: ${d.toFixed(2)}s; --d0: ${dl.toFixed(2)}s"></b>`
      + `<u style="left: ${x - 15}px; top: ${86 + (i % 4) * 3}px; --d: ${d.toFixed(2)}s; --d0: ${dl.toFixed(2)}s"></u>`;
  }
  return `<div class="rbt-cloud"><svg viewBox="0 0 72 26"><defs><linearGradient id="${cg}" x1="0" y1="0" x2="0" y2="26" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#d7dde2"/><stop offset=".55" stop-color="#a9b2ba"/><stop offset="1" stop-color="#7f8a94"/></linearGradient></defs><path d="M12 25.5 C5 25.5 3 18 9 15.5 C8 9 15 6 20 9 C23 2 35 0 40 7 C45 3 54 6 54 12 C61 11 67 16 64 21 C66 24 63 25.5 60 25.5 Z" fill="url(#${cg})"/><path d="M14 13 C15 10 18 9 21 10.5 M27 7 C30 4 35 4 38 7.5" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.4" stroke-linecap="round"/></svg></div><div class="rbt-rain">${drops}</div>`;
}

function robotHtml(cls, r) {
  const layout = ROBOT_LAYOUTS.includes(r.layout) ? r.layout : "vacuum";
  const mode = r.mode || "idle";
  const draw = mode === "edgecut" ? "cleaning" : mode === "docked" ? "charging" : mode === "rain" ? "charging rbt-m-raining" : mode;
  const err = ROBOT_MANGA + ROBOT_ANGER;
  let inner;
  if (layout === "mower") {
    inner = `<div class="rbt-lawn"></div><div class="rbt-stub"></div>${robotRain()}
          <div class="rbt-st-base"></div><div class="rbt-st-post"></div><div class="rbt-st-tower"></div><i class="rbt-st-led"></i>
          <div class="rbt-mw">${ROBOT_MOWER_SVG}${err}<div class="rbt-clip">${"<b></b>".repeat(6)}</div></div>
          <div class="rbt-tall"></div><div class="rbt-st-roof"></div>`;
  } else if (layout === "mop") {
    const lvl = r.water !== null && r.water !== undefined ? ` style="--lvl: ${Math.round(r.water)}%"` : "";
    inner = `<div class="rbt-tiles"><i class="rbt-trace rbt-t1 rbt-wet"></i><i class="rbt-trace rbt-t2 rbt-wet"></i></div>
          <div class="rbt-mcap"></div><div class="rbt-mdock"><div class="rbt-tk rbt-c"><i></i></div><div class="rbt-tk rbt-d"><i></i></div><i class="rbt-dled"></i></div>
          <div class="rbt-plate"></div><div class="rbt-pcap"></div>
          <div class="rbt-rm"${lvl}><div class="rbt-pad"></div><div class="rbt-sd"></div><div class="rbt-tp"></div><div class="rbt-tank"><i></i></div><div class="rbt-ring"></div>${err}</div>
          ${airFlow("rbt-vapor", 44, 17)}
          <div class="rbt-bubbles">${"<b></b>".repeat(4)}</div>`;
  } else {
    inner = `<div class="rbt-rug"></div>
          <div class="rbt-dock"><i class="rbt-dled"></i><div class="rbt-bin"><div class="rbt-fill"></div>${"<b></b>".repeat(3)}</div></div><div class="rbt-dcap"></div>
          <div class="rbt-plate"></div><div class="rbt-pcap"></div>
          <div class="rbt-rb"><div class="rbt-brush"><i></i></div><div class="rbt-sd"></div><div class="rbt-bmp"></div><div class="rbt-tp"></div><div class="rbt-lidw"></div><div class="rbt-lid"></div><div class="rbt-ring"></div>${err}</div>`;
  }
  return `
        <div class="machine ${cls} rbt rbt-l-${layout} rbt-m-${draw}${r.base ? " rbt-base" : ""}${r.shelter ? " rbt-roof" : ""}">
          ${inner}
        </div>`;
}

// Where each part of a toaster sits: [left, top, width, height] and the
// corners of its top, the slots as [left, top, width], the slices as [class,
// left, top, width, height], the levers as [left, raised, lowered].
const TOASTER_LAYOUTS = {
  two: {
    top: [16, 38, 64, 13, "9px 9px 3px 3px"], face: [16, 49, 64, 45],
    slots: [[23, 40.5, 50], [22, 45.5, 52]], toasts: [["back", 26, 21, 44, 22], ["", 24, 26, 48, 21.5]],
    levers: [[68, 55, 78]], dials: [[22, 63, 11]], btns: [[38, 65], [38, 71]], led: [50, 66],
    tray: [26, 88, 44], feet: [20, 68], air: [18, 2, 60, 36],
  },
  four: {
    top: [4, 38, 88, 13, "9px 9px 3px 3px"], face: [4, 49, 88, 45],
    slots: [[10, 40.5, 34], [9, 45.5, 36], [52, 40.5, 34], [51, 45.5, 36]],
    toasts: [["back", 12, 21, 30, 22], ["", 11, 26, 32, 21.5], ["back", 54, 21, 30, 22], ["", 53, 26, 32, 21.5]],
    levers: [[8, 55, 78], [78, 55, 78]], dials: [[26, 63, 10], [60, 63, 10]], btns: [], led: [46.5, 66],
    tray: [26, 88, 44], feet: [10, 78], air: [6, 2, 84, 36],
  },
  long: {
    top: [4, 47, 88, 10, "8px 8px 2px 2px"], face: [4, 55, 88, 39],
    slots: [[11, 50, 74]], toasts: [["", 13, 32, 34, 20], ["", 49, 32, 34, 20]],
    levers: [[78, 60, 79]], dials: [[13, 66, 10]], btns: [[28, 69]], led: [40, 69.5],
    tray: [30, 88, 36], feet: [10, 78], air: [6, 12, 84, 36],
  },
};
function toasterHtml(cls, tp) {
  const L = TOASTER_LAYOUTS[tp.layout] || TOASTER_LAYOUTS.two;
  const box = (c, x, y, w, h, r) => `<div class="${c}" style="left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px;${r ? ` border-radius: ${r};` : ""}"></div>`;
  const [ax, ay, aw, ah] = L.air;
  return `
        <div class="machine ${cls} tp-${tp.layout || "two"} mode-${tp.mode || "off"}">
          <div style="position: absolute; left: ${ax}px; top: ${ay}px; width: ${aw}px; height: ${ah}px">${airFlow("tp-air", aw, ah, false).replace("<svg ", '<svg style="width: 100%; height: 100%" ')}</div>
          ${box("tp-top", ...L.top)}${box("tp-face", ...L.face, "3px 3px 9px 9px")}
          ${L.slots.map(([x, y, w]) => box("tp-slot", x, y, w, 3.5)).join("")}
          ${L.toasts.map(([c, x, y, w, h]) => box(`tp-toast${c ? ` ${c}` : ""}`, x, y, w, h)).join("")}
          ${L.levers.map(([x, up, low]) => `${box("tp-track", x + 3.7, up + 1, 2.5, low - up + 3)}<div class="tp-lever" style="left: ${x}px; top: ${up}px; --tp-low: ${low}px"></div>`).join("")}
          ${L.dials.map(([x, y, d]) => box("tp-dial", x, y, d, d)).join("")}
          ${L.btns.map(([x, y]) => `<div class="tp-btn" style="left: ${x}px; top: ${y}px"></div>`).join("")}
          <div class="tp-led" style="left: ${L.led[0]}px; top: ${L.led[1]}px"></div>
          ${box("tp-tray", L.tray[0], L.tray[1], L.tray[2], 2)}
          ${L.feet.map((x) => `<div class="tp-foot" style="left: ${x}px"></div>`).join("")}
        </div>`;
}

// The pictures a lit screen can show. The logo's three animations share one
// delay, so it reaches a corner exactly when the flash and the confetti go
// off: the two bounces take 4.1 s and 2.9 s, and they meet at an end together
// every 118.9 s. Starting 30 s in, the first corner is a minute and a half
// away rather than right away.
const SCREEN_CODE_COLORS = ["#c792ea", "#82aaff", "#ffcb6b", "#c3e88d", "#89ddff", "#f78c6c"];
function screenPictureHtml(img) {
  const at = (x, y, w, h) => `left: ${x}%; top: ${y}%; width: ${w}%; height: ${h}%`;
  switch (img) {
    case "aquarium":
      return `<div class="si-aquarium"><span class="sand"></span>`
        + `<span class="weed" style="left: 12%"></span><span class="weed" style="left: 17%; height: 28%; animation-delay: calc(-1s + var(--anim-offset, 0s))"></span><span class="weed" style="left: 80%; height: 34%; animation-delay: calc(-2s + var(--anim-offset, 0s))"></span>`
        + `<span class="fish" style="top: 28%; --f: #ff9800; --sw: 6s"></span><span class="fish" style="top: 52%; --f: #ffeb3b; --sw: 8.5s; animation-delay: calc(-4s + var(--anim-offset, 0s))"></span>`
        + `<span class="fish" style="top: 40%; --f: #f06292; --sw: 7s; animation-delay: calc(-2s + var(--anim-offset, 0s)); width: 9%; height: 9%"></span>`
        + `<span class="bub" style="left: 20%"></span><span class="bub" style="left: 22%; animation-delay: calc(-1.4s + var(--anim-offset, 0s))"></span><span class="bub" style="left: 84%; animation-delay: calc(-0.7s + var(--anim-offset, 0s))"></span></div>`;
    case "bars":
      return `<div class="si-bars"><b></b></div>`;
    case "football":
      return `<div class="si-football"><span class="crowd"></span><span class="lines"></span><span class="goal l"></span><span class="goal r"></span>`
        + [["#e53935", 52, -0.4], ["#e53935", 66, -1.6], ["#e53935", 44, -2.6], ["#1e88e5", 58, -0.9], ["#1e88e5", 70, -2.1], ["#1e88e5", 46, -3]]
          .map(([k, y, d]) => `<span class="pl" style="--k: ${k}; top: ${y}%; animation-delay: calc(${d}s + var(--anim-offset, 0s))"></span>`).join("")
        + `<span class="ball"></span><span class="score">2-1</span></div>`;
    case "space":
      return `<div class="si-space"><b></b><i></i></div>`;
    case "bounce":
      return `<div class="si-bounce"><span class="logo" style="animation-delay: calc(-30s + var(--anim-offset, 0s))">HA</span><span class="flash" style="animation-delay: calc(-30s + var(--anim-offset, 0s))"></span>`
        + [["#ef5350", 8], ["#ffee58", 22], ["#66bb6a", 36], ["#42a5f5", 50], ["#ab47bc", 64], ["#ffa726", 78], ["#26c6da", 90]]
          .map(([c, x], k) => `<span class="bit" style="--c: ${c}; left: ${x}%; top: ${-12 - (k % 3) * 9}%; animation-delay: calc(-30s + var(--anim-offset, 0s))"></span>`).join("")
        + `</div>`;
    case "desktop":
      return `<div class="si-desktop"><i style="${at(10, 14, 45, 48)}"></i><i class="mv" style="${at(40, 32, 48, 46)}"></i><u></u></div>`;
    case "code": {
      let rows = "";
      for (let k = 0; k < 24; k++) {
        rows += `<i style="--c: ${SCREEN_CODE_COLORS[(k * 7) % 6]}; --w: ${20 + ((k * 37) % 55)}%; --x: ${[0, 8, 8, 16, 8, 0][k % 6]}%"></i>`;
      }
      return `<div class="si-code"><div class="lines">${rows}${rows}</div></div>`;
    }
    case "pong":
      return `<div class="si-pong"><span class="score">3 2</span><span class="pad" style="left: 4%"></span><span class="pad r" style="right: 4%"></span><span class="ball"></span></div>`;
    case "home":
      return `<div class="si-home"><u></u>`
        + [["#e50914", 4, 30, "f"], ["#1db954", 28, 30], ["#0f79af", 52, 30], ["#ff0000", 76, 30], ["#f5c518", 4, 60], ["#7b1fa2", 28, 60], ["#00a8e1", 52, 60], ["#ff6d00", 76, 60]]
          .map(([c, x, y, f]) => `<i${f ? ' class="f"' : ""} style="--c: ${c}; left: ${x}%; top: ${y}%"></i>`).join("")
        + `</div>`;
    default:
      return `<div class="si-sunset"><b></b><i></i></div>`;
  }
}
const SCREEN_BADGE = (cls, d) => `<span class="scr-badge ${cls}"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(0,0,0,.55)"/><path fill="#fff" d="${d}"/></svg></span>`;
const SCREEN_BADGES = SCREEN_BADGE("play", "M9 7v10l8-5z") + SCREEN_BADGE("pause", "M8 7h3v10H8zM13 7h3v10h-3z")
  + SCREEN_BADGE("mute", "M5 10v4h3l4 3V7L8 10zM14.6 9.7l1-1 2.4 2.4 2.4-2.4 1 1-2.4 2.4 2.4 2.4-1 1-2.4-2.4-2.4 2.4-1-1 2.4-2.4z");
function screenHtml(cls, sc) {
  const layout = SCREEN_LAYOUTS.includes(sc.layout) ? sc.layout : "tv_feet";
  const mode = sc.mode || "off";
  const box = (c, x, y, w, h, extra = "") => `<div class="${c}" style="left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px${extra}"></div>`;
  const picture = mode === "home" ? screenPictureHtml("home")
    : sc.cover ? `<img class="scr-cover" src="${esc(sc.cover)}" alt="">`
      : screenPictureHtml(sc.image);
  const glassInner = `<div class="scr-pic">${SCREEN_LIT.includes(mode) ? picture : ""}</div>${mode === "locked" ? '<div class="scr-lock"></div>' : ""}${SCREEN_BADGES}`;
  const tv = (y) => `${box("scr-bezel", 1, y, 94, 54)}<div class="scr-glass" style="left: 3px; top: ${y + 2}px; width: 90px; height: 49px">${glassInner}</div>`
    + box("scr-led", 46.8, y + 51.8, 2.4, 2.4);
  let body;
  if (layout === "tv_stand") body = tv(28) + box("scr-neck", 44, 82, 8, 7) + box("scr-base", 28, 88, 40, 5);
  else if (layout === "tv_wall") body = box("scr-shade", 3, 31, 92, 54) + tv(27);
  else if (layout === "projector") {
    body = box("scr-rod", 10, 0, 1, 3) + box("scr-rod", 85, 0, 1, 3)
      + `<div class="scr-wall" style="left: 1px; top: 3px; width: 94px; height: 50px">${glassInner}</div>`
      + box("scr-beam", 1, 53, 94, 18) + box("scr-body", 24, 69, 48, 15) + box("scr-vent", 56, 73, 12, 7)
      + box("scr-lens", 46, 70, 11, 11) + box("scr-led", 29, 73, 2.4, 2.4) + box("scr-feet", 28, 84, 4, 2) + box("scr-feet", 64, 84, 4, 2);
  } else if (layout === "computer") {
    body = box("scr-bezel", 2, 26, 64, 42) + `<div class="scr-glass" style="left: 5px; top: 29px; width: 58px; height: 35px">${glassInner}</div>`
      + box("scr-neck", 30, 68, 8, 13) + box("scr-base", 20, 80, 28, 4) + box("scr-tower", 72, 34, 20, 50)
      + box("scr-slot", 75, 40, 14, 1.5) + box("scr-slot", 75, 44, 14, 1.5) + box("scr-led", 80.8, 76, 2.4, 2.4);
  } else body = tv(30) + box("scr-foot l", 12, 84, 3, 8) + box("scr-foot r", 81, 84, 3, 8);
  const lit = SCREEN_LIT.includes(mode) ? " scr-lit" : "";
  // A television is wider than it is tall, and a computer too with its
  // tower, so in the box every other appliance fits in they came out small.
  // They are drawn larger, in a box cut to their own height, and so is the
  // projector's screen, as large as a television's.
  const band = SCREEN_BANDS[layout];
  const px = (v) => Math.round(v * 10) / 10;
  // On a narrow card, a phone's two columns, the drawing shrinks to the
  // width there is: --scr-fit, set by the card from that width, never above 1.
  const fit = "var(--scr-fit, 1)";
  const inner = band
    ? `<div class="scr-zoom" style="left: 0; top: calc(${px(-band[0] * band[2])}px * ${fit}); transform: scale(calc(${band[2]} * ${fit}))">${body}</div>`
    : body;
  const size = band
    ? ` data-fit-w="${px(96 * band[2])}" style="width: calc(${px(96 * band[2])}px * ${fit}); height: calc(${px(band[1] * band[2])}px * ${fit})"`
    : "";
  return `
        <div class="machine ${cls} scr-${layout} mode-${mode}${lit}${sc.muted ? " muted" : ""}"${size}>${inner}</div>`;
}

function illustrationHtml(type, ctx) {
  const cls = [
    ctx.spinning ? "spinning" : "",
    ctx.heating ? "heating" : "",
    ctx.lit ? "lit" : "",
    ctx.doorOpen ? "open" : "",
    ctx.done ? "done" : "",
    ctx.paused ? "paused" : "",
    ctx.phase && DISHWASHER_PHASES.has(ctx.phase) ? `phase-${ctx.phase}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (type === "dishwasher") {
    return `
        <div class="machine ${cls}">
          <div class="dw-body">
            <div class="dw-controls"><div class="dw-screen"></div></div>
            <div class="dw-cavity">
              <div class="dw-dishes" aria-hidden="true">
                <span class="dw-plate dw-plate-a"></span>
                <span class="dw-plate dw-plate-b"></span>
                <span class="dw-plate dw-plate-c"></span>
                <span class="dw-plate dw-plate-d"></span>
              </div>
              <div class="dw-rack"></div>
              <div class="dw-spray" aria-hidden="true"><span class="dw-spray-hub"></span></div>
              <div class="dw-drops" aria-hidden="true">
                <i class="dw-drop dw-drop-a"></i><i class="dw-drop dw-drop-b"></i>
                <i class="dw-drop dw-drop-c"></i><i class="dw-drop dw-drop-d"></i>
                <i class="dw-drop dw-drop-e"></i>
              </div>
              <div class="dw-water" aria-hidden="true">
                <span class="dw-wave dw-wave-a"></span><span class="dw-wave dw-wave-b"></span>
              </div>
                          </div>
            <div class="dw-heat" aria-hidden="true">
              <i class="dw-heat-a"></i><i class="dw-heat-b"></i><i class="dw-heat-c"></i><i class="dw-heat-d"></i><i class="dw-heat-e"></i>
            </div>
            <div class="dw-door ${ctx.doorOpen ? "open" : ""}" aria-hidden="true"></div>
          </div>
        </div>`;
  }

  if (LAUNDRY_TYPES.includes(type)) {
    const water = `
        <div class="water-level">
          <div class="wave"></div>
          <div class="wave wave2"></div>
        </div>`;
    const clothes = `
        <div class="garments">
          <div class="garment g1"></div>
          <div class="garment g2"></div>
          <div class="garment g3"></div>
        </div>`;
    // A washer-dryer empties its drum before it dries, so while it dries it is
    // a dryer: clothes turning in hot air, and the warm haze that goes with it.
    // A spin empties it too, and the clothes show, whirling with no heat.
    const glassContent = type === "dryer" || ctx.drying || ctx.spinCycle ? clothes : water;
    const heat = ctx.drying
      ? `
        <div class="wd-heat" aria-hidden="true"><i></i><i></i><i></i></div>`
      : "";
    return `
        <div class="machine ${[ctx.spinning ? "spinning" : "", ctx.drying ? "drying" : "", ctx.spinCycle ? "spin-cycle" : ""].filter(Boolean).join(" ")}">
          <div class="mbody">
            <div class="mpanel"></div>
            <div class="mknob"></div>
            <div class="mknob k2"></div>
          </div>
          <div class="bezel-wrap">
            <div class="drum-hole"></div>
            <div class="door ${ctx.doorOpen ? "ajar" : ""}">
              <div class="rim">
                <div class="glass">
                  ${heat}${glassContent}
                </div>
              </div>
            </div>
          </div>
        </div>`;
  }

  if (type === "pet_feeder") {
    // Three families. The square tower is the default; the round tank and
    // the double hold a taller heap, and the double shows its level in a slot.
    const layout = ctx.feederLayout || "";
    const heapPx = layout === "canister" ? 28 : layout === "double" ? 12 : layout === "dual_split" ? 32 : 20;
    const lcd = `<div class="pf-lcd">${esc(ctx.feederScreen || "")}</div>`;
    const panel = `<div class="pf-panel">${lcd}<div class="pf-keys"></div></div>`;
    const kib = `<div class="pf-kib"></div>`;
    const bowl = (side = "") => `
          <div class="pf-bowl${side}"><div class="pf-holder"></div><div class="pf-lip"></div><div class="pf-steel">${kib}</div><div class="pf-heap">${kib}</div></div>`;
    const fall = (side = "") => `
          <div class="pf-fall${side}" aria-hidden="true"><i></i><i></i><i></i></div>`;
    let body;
    if (layout === "canister") {
      body = `
          <div class="pf-tank rd">${kib}</div>
          <div class="pf-rim pf-shell"></div>
          <div class="pf-cap"></div>
          <div class="pf-drum pf-shell"><div class="pf-ribs"></div>${panel}<div class="pf-chute"></div></div>${bowl()}${fall()}`;
    } else if (layout === "double") {
      body = `
          <div class="pf-dbody pf-shell">
            <div class="pf-panel">${lcd}</div>
            <div class="pf-slot">${kib}</div>
            <div class="pf-band"><i></i></div>
            <div class="pf-chute a"></div><div class="pf-chute b"></div>
          </div>${bowl(" a")}${bowl(" b")}${fall(" a")}${fall(" b")}`;
    } else if (layout === "dual_split") {
      // Two hoppers side by side in one tall body, each with its own outlet
      // over its own half of one wide bowl split down the middle.
      body = `
          <div class="pf-sbody pf-shell"><div class="pf-tank a">${kib}</div><div class="pf-tank b">${kib}</div></div>
          <div class="pf-sbase pf-shell">${panel}<div class="pf-chute a"></div><div class="pf-chute b"></div></div>
          <div class="pf-bowl split"><div class="pf-holder"></div><div class="pf-lip"></div><div class="pf-steel"><div class="pf-kib a"></div><div class="pf-kib b"></div><i class="pf-divider"></i></div><div class="pf-heap a">${kib}</div><div class="pf-heap b">${kib}</div></div>${fall(" a")}${fall(" b")}`;
    } else if (layout === "rotary") {
      // A round wet-food feeder: plates on a turntable under a lid with one
      // opening. The flap lifts while a meal is served, showing the plate.
      body = `
          <div class="pf-rwall pf-shell">${panel}</div>
          <div class="pf-rtop"></div>
          <div class="pf-rhub"></div>
          <div class="pf-rwin"><div class="pf-rplate"><div class="pf-wet"></div></div></div>
          <div class="pf-rflap"></div>`;
    } else {
      body = `
          <div class="pf-tank sq">${kib}</div>
          <div class="pf-lid pf-shell"></div>
          <div class="pf-latch"></div>
          <div class="pf-base pf-shell">${panel}<div class="pf-chute"></div></div>${bowl()}${fall()}`;
    }
    // Two hoppers empty one at a time. An empty state that names no hopper
    // (a fault that says "no food") empties both.
    const sides = layout !== "dual_split" || !ctx.feederEmpty ? []
      : ctx.feederEmptyA || ctx.feederEmptyB ? [ctx.feederEmptyA ? "empty-a" : "", ctx.feederEmptyB ? "empty-b" : ""]
      : ["empty-a", "empty-b"];
    const cls = [layout, ctx.feeding ? "feeding" : "", ctx.feederEmpty ? "empty" : "", ...sides, ctx.feederAlert ? "alert" : ""].filter(Boolean).join(" ");
    const fillPx = (pct) => (4 + (pct / 100) * heapPx).toFixed(1);
    const styles = [
      ctx.feederFill === null || ctx.feederFill === undefined ? "" : `--pf-fill:${fillPx(ctx.feederFill)}px`,
      layout !== "dual_split" || ctx.feederFillB === null || ctx.feederFillB === undefined ? "" : `--pf-fill-b:${fillPx(ctx.feederFillB)}px`,
    ].filter(Boolean).join(";");
    return `
        <div class="machine ${cls}"${styles ? ` style="${styles}"` : ""}>
          <div class="pf-floor"></div>${body}${ctx.feederAlert ? `
          <div class="pf-cat" aria-hidden="true">
            <u class="ear l"><span></span></u><u class="ear r"><span></span></u>
            <u class="tail"></u>
            <b class="body"><span class="paw l"></span><span class="paw r"></span></b>
            <b class="head">
              <i class="whisk l"></i><i class="whisk r"></i>
              <i class="muzzle"></i>
              <i class="eye l"><span></span></i><i class="eye r"><span></span></i>
              <i class="nose"></i><i class="mouth l"></i><i class="mouth r"></i>
            </b>
          </div>
          <div class="pf-alert" aria-hidden="true"><i class="bar"></i><i class="dot"></i></div>` : ""}
        </div>`;
  }

  if (type === "oven") {
    return `
        <div class="machine ${cls}">
          <div class="ov-body">
            <div class="ov-panel">
              <div class="ov-disp">${esc(ctx.display || "--")}</div>
              <div class="ov-knob"></div>
              <div class="ov-knob k2"></div>
            </div>
            <div class="ov-doorwrap">
              <div class="ov-cavity">
                <div class="ov-elem top"></div>
                <div class="ov-rack"></div>
                <div class="ov-dish"></div>
                <div class="ov-elem bottom"></div>
              </div>
              <div class="ov-door">
                <div class="ov-handle"></div>
                <div class="ov-glass"></div>
              </div>
            </div>
          </div>
        </div>`;
  }

  if (type === "microwave") {
    return `
        <div class="machine ${cls}">
          <div class="mw-body">
            <div class="mw-doorwrap">
              <div class="mw-cavity">
                <div class="mw-turn"><div class="mw-plate"></div><div class="mw-food"></div></div>
              </div>
              <div class="mw-door">
                <div class="mw-mesh"></div>
                <div class="mw-handle"></div>
              </div>
            </div>
            <div class="mw-panel">
              <div class="mw-disp">${esc(ctx.display || "--")}</div>
              <div class="mw-keys">${"<i></i>".repeat(9)}</div>
            </div>
          </div>
        </div>`;
  }

  if (type === "hood") {
    const level = ctx.fanLevel || 0;
    const fanCls = `${level > 0 ? "fan" : ""} v${level} ${ctx.boost ? "boost" : ""}`;
    return `
        <div class="machine ${cls} ${fanCls}">
          <div class="hd-chimney"></div>
          <div class="hd-canopy"></div>
          <div class="hd-under"></div>
          <div class="hd-lamp l1"></div>
          <div class="hd-lamp l2"></div>
          <div class="hd-beam b1"></div>
          <div class="hd-beam b2"></div>
          <div class="hd-air a1"></div>
          <div class="hd-air a2"></div>
          <div class="hd-air a3"></div>
        </div>`;
  }

  if (type === "fridge") {
    return `<div class="machine ${cls} ${ctx.ice ? "ice" : ""}">${fridgeHtml(ctx)}</div>`;
  }

  if (type === "water_heater") {
    // Hot water sits on top of a real tank, so the warm layer grows down from
    // the dome as the water heats: 15 degrees is a cold tank, 65 a full one.
    const hot = ctx.tankTemp === null || ctx.tankTemp === undefined
      ? 0 : Math.max(0, Math.min(1, (ctx.tankTemp - 15) / 50));
    const lcd = ctx.display ? `<div class="wh-lcd">${esc(ctx.display)}</div>` : "";
    return `
        <div class="machine ${cls}" style="--wh-hot: ${hot.toFixed(2)}">
          <div class="wh-bracket"></div>
          <div class="wh-tank">
            <div class="wh-glass">
              <div class="wh-water"></div>
              <div class="wh-hot"></div>
              <div class="wh-heat"><i class="wh-h1"></i><i class="wh-h2"></i><i class="wh-h3"></i></div>
              <div class="wh-coil"></div>
            </div>
          </div>
          ${lcd}
          <div class="wh-pipe cold"></div>
          <div class="wh-pipe hot"></div>
        </div>`;
  }

  if (type === "boiler") {
    const mode = ctx.boilerMode || "idle";
    // A burner waiting its turn is out, like one on standby.
    const flame = mode !== "idle" && mode !== "waiting";
    const lcd = ctx.display ? `<div class="bl-lcd">${esc(ctx.display)}</div>` : "";
    return `
        <div class="machine ${cls} mode-${mode} ${flame ? "flame" : ""}">
          <div class="bl-box">
            ${lcd}
            <div class="bl-window"><div class="bl-flame"></div></div>
          </div>
          <div class="bl-pipe tap-down"></div>
          <div class="bl-pipe tap-arm"></div>
          <div class="bl-pipe tap-nose"></div>
          <div class="bl-knob"></div>
          <i class="bl-drop d1"></i><i class="bl-drop d2"></i><i class="bl-drop d3"></i>
          <div class="bl-pipe rad-down"></div>
          <div class="bl-pipe rad-arm"></div>
          <div class="bl-rad"><i></i><i></i><i></i><i></i></div>
          <div class="bl-waves"><i class="w1"></i><i class="w2"></i><i class="w3"></i></div>
        </div>`;
  }

  if (type === "air_conditioner") {
    // The flap opens a step per vane position, and the air reaches further
    // the lower it points. At rest the flap is closed whatever the vane says.
    const a = ctx.ac || {};
    const mode = a.mode || "off";
    const blowing = !["off", "idle", "defrost", "preheat"].includes(mode);
    const v = Number.isInteger(a.vane) ? a.vane : 3;
    const h = Number.isInteger(a.hvane) ? a.hvane : 0;
    const style = `--ac-flap: ${blowing ? v : 0}; --ac-reach: ${[0.45, 0.6, 0.75, 0.88, 1][v - 1]}; `
      + `--ac-skew: ${h * 15}deg; --ac-speed: ${AC_FAN_SECONDS[a.speed] || AC_FAN_SECONDS.medium}s`;
    const icon = AC_ICONS[a.icon] ? `<svg viewBox="0 0 24 24"><path d="${AC_ICONS[a.icon]}"/></svg>` : "";
    const leds = ["", ...(a.leds || [])].map((l) => `<i${l ? ` class="${l}"` : ""}></i>`).join("");
    const acCls = [`mode-${mode}`, a.icon ? `icon-${a.icon}` : "", blowing && a.swingV ? "swing-v" : "", blowing && a.swingH ? "swing-h" : ""]
      .filter(Boolean).join(" ");
    return `
        <div class="machine ${cls} ${acCls}" style="${style}">
          <div class="ac-unit">
            <div class="ac-seam"></div>
            <div class="ac-leds">${leds}</div>
            <div class="ac-lcd">${icon}<span>${esc(a.screen || "")}</span></div>
            <div class="ac-mouth"><div class="ac-flap"></div></div>
          </div>
          <div class="ac-frost"></div>
          <svg class="ac-air" viewBox="0 0 96 52">
            <g class="ac-stream">
              <path d="M20 2 C17 16 14 28 10 42"/><path d="M36 2 C35 18 34 32 32 48"/>
              <path d="M60 2 C61 18 62 32 64 48"/><path d="M76 2 C79 16 82 28 86 42"/>
            </g>
            <circle class="ac-drop d1" cx="26" cy="2" r="1.8"/><circle class="ac-drop d2" cx="48" cy="2" r="1.8"/><circle class="ac-drop d3" cx="70" cy="2" r="1.8"/>
          </svg>
        </div>`;
  }

  if (type === "pet_fountain") {
    // A tank seen through its window, a dish on top with water in it and a
    // spout in the middle that bubbles while the pump runs. Without a level
    // the tank keeps a resting height rather than reading as empty.
    const f = ctx.fountain || {};
    const fill = f.low ? 8 : f.fill === null || f.fill === undefined ? 55 : Math.round(f.fill);
    const led = f.offline ? "" : f.low ? "led-low" : f.due ? "led-due" : f.flowing ? "led-on" : "";
    // No water comes up a pump that is off or that has run dry: the jet stops,
    // and with the tank low the dish goes low with it.
    const running = f.flowing && !f.low;
    return `
        <div class="machine ${cls} ${running ? "flowing" : ""} ${f.low ? "ft-dry" : ""}${f.offline ? " ft-offline" : ""} ${led}" style="--ft-fill: ${fill}%">
          <div class="ft-floor"></div>
          <div class="ft-body"></div>
          <div class="ft-win"><div class="ft-water"></div></div>
          <div class="ft-rim"></div>
          <div class="ft-pool"></div>
          <svg class="ft-jet" viewBox="0 0 96 108" aria-hidden="true">
            <path class="ft-arc col" d="M48 31 L48 10"/><path class="ft-arc far" d="M48 10 C44 5 35 7 33 29"/><path class="ft-arc mid" d="M48 10 C46 8 41 11 40 29"/><path class="ft-arc far" d="M48 10 C52 5 61 7 63 29"/><path class="ft-arc mid" d="M48 10 C50 8 55 11 56 29"/>
            <path class="ft-arc-hi" d="M48 31 L48 10"/><path class="ft-arc-hi" d="M48 10 C44 5 35 7 33 29"/><path class="ft-arc-hi" d="M48 10 C46 8 41 11 40 29"/><path class="ft-arc-hi" d="M48 10 C52 5 61 7 63 29"/><path class="ft-arc-hi" d="M48 10 C50 8 55 11 56 29"/>
            <ellipse class="ft-crown" cx="48" cy="9.5" rx="3.2" ry="2"/>
            <circle class="ft-drop" cx="31" cy="23" r="0.9"/><circle class="ft-drop r" cx="65" cy="23" r="0.9"/>
            <ellipse class="ft-splash" cx="33" cy="31" rx="2.6" ry="1.1"/><ellipse class="ft-splash" cx="40" cy="31" rx="2.6" ry="1.1"/><ellipse class="ft-splash r" cx="56" cy="31" rx="2.6" ry="1.1"/><ellipse class="ft-splash r" cx="63" cy="31" rx="2.6" ry="1.1"/>
          </svg>
          <div class="ft-spout"></div>
          <div class="ft-led"></div>
        </div>`;
  }

  if (type === "dehumidifier") {
    // The tank keeps a resting level when the card cannot know one, rather
    // than reading a dehumidifier with no tank entity as an empty one.
    const d = ctx.dh || {};
    const mode = d.mode || "off";
    const fill = mode === "full" ? 100 : d.fill === null || d.fill === undefined ? 35 : Math.round(d.fill);
    return `
        <div class="machine ${cls} mode-${mode}" style="--dh-fill: ${fill}%">
          ${airFlow("dh-air", 40, 24, true)}
          <div class="dh-body"></div>
          <div class="dh-grille"></div>
          ${miniLcd("dh-lcd", d.icon, d.screen)}
          <div class="dh-led"></div>
          <div class="dh-seam"></div>
          <div class="dh-grip"></div>
          <div class="dh-win"><div class="dh-water"></div><div class="dh-drip"><i></i><i></i></div></div>
          <div class="dh-foot f1"></div><div class="dh-foot f2"></div>
        </div>`;
  }

  if (type === "space_heater") {
    const h = ctx.heater || {};
    const mode = h.mode || "off";
    if (h.layout === "oil") {
      return `
        <div class="machine ${cls} oil mode-${mode}">
          ${airFlow("ho-air", 58, 28, false)}
          <div class="ho-fins"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="ho-box"></div>
          ${miniLcd("ho-lcd", h.icon, "")}
          <div class="ho-knob"></div>
          <div class="ho-base"></div><div class="ho-wheel w1"></div><div class="ho-wheel w2"></div>
        </div>`;
    }
    return `
        <div class="machine ${cls} mode-${mode}">
          ${airFlow("hf-air", 42, 30, mode === "fan")}
          <div class="hf-body"></div>
          <div class="hf-handle"></div>
          ${miniLcd("hf-lcd", h.icon, h.screen)}
          <div class="hf-grill"><div class="hf-glow"></div><svg class="hf-fan" viewBox="0 0 24 24"><path d="${AC_ICONS.fan}"/></svg></div>
          <div class="hf-foot f1"></div><div class="hf-foot f2"></div>
        </div>`;
  }

  if (type === "towel_warmer") {
    const w = ctx.towel || {};
    const bars = [17, 23, 29, 35, 47, 53, 59, 71, 77, 83].map((y) => `<div class="tw-bar" style="top: ${y}px"></div>`).join("");
    // The towel hangs over the fourth bar, its back half behind it.
    const towel = `<svg class="tw-towel" viewBox="0 0 30 44">`
      + `<path d="M3 4 H27 V24 H3Z" fill="#80cbc4" opacity=".55"/>`
      + `<path d="M2 3 Q15 1 28 3 V38 C23 40 18 37 13 39 C8 41 5 39 2 40 Z" fill="#80cbc4"/>`
      + `<path d="M2 3 Q15 1 28 3 V7 Q15 5 2 7Z" fill="rgba(0,0,0,.14)"/>`
      + `<path d="M4 33 H26" stroke="rgba(255,255,255,.55)" stroke-width="1.2" stroke-dasharray="2 2"/></svg>`;
    return `
        <div class="machine ${cls} mode-${w.mode || "off"}">
          ${airFlow("tw-air", 52, 14, false)}
          ${airFlow("tw-steam", 36, 22, false)}
          <div class="tw-rail r1"></div><div class="tw-rail r2"></div>
          ${bars}
          ${towel}
          <div class="tw-box"></div>
          ${miniLcd("tw-lcd", w.icon, w.screen)}
        </div>`;
  }

  if (type === "air_fryer") {
    const f = ctx.fryer || {};
    const mode = f.mode || "off";
    const layout = f.layout || "basket";
    const z1 = fryerZoneOf(mode);
    const z2 = fryerZoneOf(f.mode2 || mode);
    // A dual fryer is on as long as one of its baskets is.
    const shown = layout === "dual" && mode === "off" ? f.mode2 || "off" : mode;
    const drawer = (n, inner) => `<div class="af-gap g${n}"></div>`
      + `<div class="af-drawer d${n}">${inner}<div class="af-handle"><div class="af-btn"></div></div></div>`;
    const top = `<div class="af-body"></div><div class="af-vent"></div>${miniLcd("af-lcd", f.icon, f.screen)}`;
    const feet = `<div class="af-foot f1"></div><div class="af-foot f2"></div>`;
    if (layout === "dual") {
      return `
        <div class="machine ${cls} af-dual mode-${shown} z1-${z1} z2-${z2}">
          ${airFlow("af-air a1", 34, 22, false)}${airFlow("af-air a2", 34, 22, false)}
          ${top}<div class="af-vent v2"></div>
          <div class="af-led l1"></div><div class="af-led l2"></div>
          <div class="af-seam s1"></div><div class="af-seam s2"></div>
          ${drawer(1, `<div class="af-zn">1</div>`)}${drawer(2, `<div class="af-zn">2</div>`)}
          <div class="af-div"></div>${feet}
        </div>`;
    }
    const win = layout === "window"
      ? `<div class="af-win"><div class="af-glow"></div><div class="af-coil"></div><div class="af-fries"><i></i><i></i><i></i><i></i><i></i></div></div>`
      : "";
    return `
        <div class="machine ${cls} af-${layout} mode-${mode} z1-${z1}">
          ${airFlow("af-air a1", 40, 22, false)}
          ${top}<div class="af-led l1"></div><div class="af-seam s1"></div>
          ${drawer(1, win)}${feet}
        </div>`;
  }

  if (type === "ev_charger") {
    const e = ctx.ev || {};
    const shot = e.shot ? ` ${e.shot} from-${e.from}` : "";
    const since = e.shot ? `; --ev-since: ${e.since}s` : "";
    return `
        <div class="machine ${cls} mode-${e.mode || "unknown"}${e.plugged ? " plugged" : ""}${shot}" style="--ev-flow: ${e.flow || EV_FLOW_DEFAULT}s${since}">
          <svg class="ev-halo" viewBox="0 0 96 108" aria-hidden="true"><path class="eh-loop" d="M42 69 C42 104 69 104 69 57"/><path class="eh-out" d="M42 69 C42 96 50 102 70 102"/></svg>
          <svg class="ev-cable" viewBox="0 0 96 108" aria-hidden="true"><path class="ev-loop" d="M42 69 C42 104 69 104 69 57"/><path class="ev-out" d="M42 69 C42 96 50 102 70 102"/><g class="ev-energy"><path class="ev-live" d="M42 69 C42 96 50 102 70 102"/><path class="ev-flow" d="M42 69 C42 96 50 102 70 102"/></g></svg>
          <div class="ev-box"><div class="ev-face"><div class="ev-led"></div>
            <svg class="ev-bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M11 15H6L13 1V9H18L11 23V15Z"/></svg>
          </div></div>
          <div class="ev-plug">${EV_PLUG_PARTS}</div>
          <div class="ev-ghost">${EV_PLUG_PARTS}</div>
          <div class="ev-holster"></div>
        </div>`;
  }

  if (type === "pellet_stove") {
    // The hopper keeps a resting level when the card cannot know one, rather
    // than reading a stove with no level entity as an empty one.
    const s = ctx.stove || {};
    const fill = s.fill === null || s.fill === undefined ? 60 : Math.round(s.fill);
    const lcd = ctx.display ? esc(ctx.display) : "";
    return `
        <div class="machine ${cls} mode-${s.mode || "off"} ${s.empty ? "empty" : ""}" style="--ps-fill: ${fill}%">
          <div class="ps-smoke"><i></i><i></i></div>
          <div class="ps-air"><i class="a1"></i><i class="a2"></i><i class="a3"></i></div>
          <div class="ps-pipe"></div>
          <div class="ps-body"></div>
          <div class="ps-lid"></div>
          <div class="ps-lcd">${lcd}</div>
          <div class="ps-grille"></div>
          <div class="ps-door"><div class="ps-glass">
            <div class="ps-glow"></div><div class="ps-flame"></div><div class="ps-spark"></div>
            <div class="ps-ash"><i></i><i></i><i></i></div>
            <div class="ps-pot"></div><div class="ps-shine"></div>
          </div></div>
          <div class="ps-handle"></div>
          <div class="ps-hopper"><div class="ps-pellets"></div></div>
          <div class="ps-foot f1"></div><div class="ps-foot f2"></div>
        </div>`;
  }

  if (type === "heat_pump") {
    const mode = ctx.hpMode || "idle";
    // The fan turns whenever the pump works; it stops to defrost, as the real
    // one does while it melts the ice off its coil.
    const fan = ["space_heating", "hot_water", "cooling", "running"].includes(mode) && !ctx.compressorOff;
    // Water runs while the pump works a circuit: down the flow pipe and back
    // up the return, to the tank for hot water and to the emitter otherwise.
    const flowing = ["space_heating", "hot_water", "cooling"].includes(mode) && !ctx.compressorOff;
    const lcd = ctx.display ? `<div class="hp-lcd">${esc(ctx.display)}</div>` : "";
    const pipes = (circuit) => `<div class="hp-pipe ${circuit} flow"></div><div class="hp-pipe ${circuit} ret"></div>`;
    // A pump that heats no domestic hot water has no tank to draw, and what
    // takes its heat is a radiator or the floor.
    const tank = ctx.noTank ? "" : `
          ${pipes("tank")}
          <div class="hp-tank"><i></i></div>`;
    const emitter = ctx.underfloor
      ? `<div class="hp-floor"><i></i><i></i><i></i><div class="hp-slab"><div class="hp-coil"><b></b><b></b><b></b></div></div></div>`
      : `<div class="hp-rad"><i></i><i></i><i></i><i></i><i></i></div>`;
    return `
        <div class="machine ${cls} mode-${mode} ${fan ? "fan" : ""} ${flowing ? "flowing" : ""} ${ctx.noTank ? "no-tank" : ""} ${ctx.underfloor ? "underfloor" : ""}">
          <div class="hp-unit">
            <div class="hp-grille"><div class="hp-fan"></div><div class="hp-hub"></div><div class="hp-guard"></div><div class="hp-frost"></div></div>
            <div class="hp-side">${lcd}<div class="hp-fins"></div></div>
          </div>
          <div class="hp-foot f1"></div><div class="hp-foot f2"></div>${tank}
          ${pipes("rad")}
          ${emitter}
        </div>`;
  }

  if (type === "printer_3d") {
    const p = ctx.p3 || { layout: "enclosed", height: 0 };
    // The part grows with the job. On an enclosed printer the bed drops as it
    // grows, the head staying at the top; on an open frame the gantry climbs.
    const h = Math.round(Math.max(0, Math.min(1, p.height || 0)) * P3_PART_MAX);
    const lcd = ctx.display ? `<div class="p3-lcd">${esc(ctx.display)}</div>` : "";
    const flags = [
      `p3-${p.layout === "open" ? "open" : "enclosed"}`,
      `p3-part-${p.part || "cube"}`,
      p.moving ? "moving" : "",
      p.nozzleHot ? "nozzle-hot" : "",
      p.bedHot ? "bed-hot" : "",
      h > 0 ? "has-part" : "",
      p.parked ? "parked" : "",
    ].filter(Boolean).join(" ");
    const head = `<div class="p3-head"><div class="p3-nozzle"></div></div>`;
    // The whole part is drawn and only what is printed shows, from the bottom
    // up, the way a printer lays it down.
    const eye = p.part === "duck" ? `<b class="p3-eye"></b>` : "";
    const bed = `<div class="p3-bed"><div class="p3-part"><div class="p3-shape">${eye}<i></i></div></div></div>`;
    if (p.layout === "open") {
      return `
        <div class="machine ${cls} ${flags}" style="--p3-h:${h}px">
          <div class="p3-post l"></div>
          <div class="p3-post r"></div>
          <div class="p3-top"></div>
          <div class="p3-gantry">${head}</div>
          ${bed}
          <div class="p3-base">${lcd}<div class="p3-knob"></div></div>
        </div>`;
    }
    return `
        <div class="machine ${cls} ${flags}" style="--p3-h:${h}px">
          <div class="p3-case">
            <div class="p3-window">
              <div class="p3-rail"></div>
              ${head}
              ${bed}
              <div class="p3-glass"></div>
            </div>
            ${lcd}
            <div class="p3-knob"></div>
          </div>
          <div class="p3-foot f1"></div>
          <div class="p3-foot f2"></div>
        </div>`;
  }

  if (type === "toaster") return toasterHtml(cls, ctx.toaster || {});
  if (type === "hair_dryer") return hairDryerHtml(cls, ctx.hairDryer || {});
  if (type === "network") return networkHtml(cls, ctx.network || {});
  if (type === "robot") return robotHtml(cls, ctx.robot || {});
  if (type === "pool_pump") return poolHtml(cls, ctx.pool || {});
  if (type === "screen") return screenHtml(cls, ctx.screen || {});
  if (type === "air_purifier") return purifierHtml(cls, ctx.purifier || {});
  if (type === "fan") return fanHtml(cls, ctx.fan || {});

  if (type === "iron") {
    // The iron alone, or the same iron on the base of a steam generator. The
    // base is drawn first, so the iron rests on it rather than through it.
    const base = ctx.ironLayout === "generator"
      ? `<div class="gen-base"></div><div class="gen-tank"></div><div class="gen-dial"></div>
          <div class="gen-led"></div><div class="gen-mat"></div><div class="gen-hose"></div>`
      : `<div class="ir-cord"></div>`;
    return `
        <div class="machine ${cls} ${ctx.ironLayout} ${ctx.leftOn ? "left-on" : ""}">
          ${base}
          <div class="ir">
            <div class="ir-steam s1"></div>
            <div class="ir-steam s2"></div>
            <div class="ir-steam s3"></div>
            <div class="ir-steam s4"></div>
            <div class="ir-handle"></div>
            <div class="ir-top"></div>
            <div class="ir-shell"><div class="ir-tank"></div></div>
            <div class="ir-plate"></div>
          </div>
          <div class="ir-fire f1"></div>
          <div class="ir-fire f2"></div>
          <div class="ir-fire f3"></div>
        </div>`;
  }

  if (type === "kettle") {
    // No timer and no progress: the drawing is the whole readout.
    const lcd = ctx.display ? `<div class="kt-lcd">${esc(ctx.display)}</div>` : "";
    return `
        <div class="machine ${cls} ${ctx.spinning ? "on" : ""}">
          ${lcd}
          <div class="kt-steam s1"></div>
          <div class="kt-steam s2"></div>
          <div class="kt-knob"></div>
          <div class="kt-lid"></div>
          <div class="kt-spout"></div>
          <div class="kt-handle"></div>
          <div class="kt-body">
            <div class="kt-water"></div>
            <div class="kt-bub b1"></div>
            <div class="kt-bub b2"></div>
            <div class="kt-bub b3"></div>
          </div>
          <div class="kt-base"></div>
        </div>`;
  }

  if (type === "cooker") {
    const sp = ctx.speed || 0;
    return `
        <div class="machine ${cls} ${sp > 0 ? "mixing" : ""} s${sp}">
          <div class="rc-steam v1"></div>
          <div class="rc-steam v2"></div>
          <div class="rc-cap"></div>
          <div class="rc-lid"></div>
          <div class="rc-bowl">
            <div class="rc-food"></div>
            <div class="rc-grad g1"></div>
            <div class="rc-grad g2"></div>
            <div class="rc-blade"></div>
          </div>
          <div class="rc-heat"></div>
          <div class="rc-base">
            ${ctx.display ? `<div class="rc-disp">${esc(ctx.display)}</div>` : ""}
            <div class="rc-dial"></div>
          </div>
        </div>`;
  }

  if (type === "coffee") {
    const flags = [
      ctx.spinning ? "pouring" : "",
      ctx.noWater ? "no-water" : "",
      ctx.noBeans ? "no-beans" : "",
      ctx.trayFull ? "tray-full" : "",
      ctx.cups >= 2 ? "two-cups" : "",
      `st${ctx.strength || 3}`,
    ].filter(Boolean).join(" ");
    return `
        <div class="machine ${cls} ${flags}">
          <div class="cf-body">
            <div class="cf-hopper">
              <div class="cf-bean b1"></div><div class="cf-bean b2"></div><div class="cf-bean b3"></div>
            </div>
            ${ctx.display ? `<div class="cf-disp">${esc(ctx.display)}</div>` : ""}
            <div class="cf-key k1"></div>
            <div class="cf-key k2"></div>
            <div class="cf-key k3"></div>
          </div>
          <div class="cf-tank"><div class="cf-water"${
            ctx.waterPct === null || ctx.waterPct === undefined
              ? ""
              : ` style="height:${Math.max(4, ctx.waterPct).toFixed(0)}%"`
          }></div></div>
          <div class="cf-spout p1"></div>
          <div class="cf-spout p2"></div>
          <div class="cf-stream p1"></div>
          <div class="cf-stream p2"></div>
          <div class="cf-steam p1"></div>
          <div class="cf-steam p2"></div>
          <div class="cf-ear"></div>
          <div class="cf-cup c1"><div class="cf-fill"></div></div>
          <div class="cf-cup c2"><div class="cf-fill"></div></div>
          <div class="cf-tray"></div>
        </div>`;
  }

  if (type === "rice_cooker") {
    return `
        <div class="machine ${cls} ${ctx.keepWarm ? "warm" : ""}">
          <div class="rk-steam w1"></div>
          <div class="rk-steam w2"></div>
          <div class="rk-handle"></div>
          <div class="rk-vent"></div>
          <div class="rk-lid"></div>
          <div class="rk-body">
            ${ctx.display ? `<div class="rk-disp">${esc(ctx.display)}</div>` : ""}
            <div class="rk-key k1"></div>
            <div class="rk-key k2"></div>
            <div class="rk-key k3"></div>
          </div>
          <div class="rk-foot"></div>
        </div>`;
  }

  if (type === "cooktop") {
    const zones = ctx.zones || [];
    const zonesHtml = zones
      .map((z) => {
        const zc = [z.on ? "on" : "", z.max ? "max" : "", z.residual ? "residual" : ""]
          .filter(Boolean)
          .join(" ");
        const title = z.title ? ` title="${esc(z.title)}"` : "";
        return `<div class="ck-zone ${zc}" style="--zi:${z.intensity.toFixed(2)}"${title}>${esc(z.label || "")}</div>`;
      })
      .join("");
    const act = ctx.anyZoneOn ? "act" : "";
    return `
        <div class="machine ${cls}">
          <div class="ck-top">
            <div class="ck-zones g${ctx.zoneColumns || 2}">${zonesHtml}</div>
            <div class="ck-ctrl"><i class="${act}"></i><i class="${act}"></i><i class="${act}"></i></div>
            ${ctx.childLock ? `<div class="ck-lock"></div>` : ""}
          </div>
        </div>`;
  }

  return "";
}
