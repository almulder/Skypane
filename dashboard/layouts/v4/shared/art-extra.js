/* art-extra.js — more animated drawings for the device cards (Manager → Devices → Picture → "art:<key>").
 *
 * Sets window.EXTRA_ART = { css, items: { key: { name, fits, svg() } } }; roomlayoutG.js picks it up (load this first).
 *
 * Credit: these drawings are adapted from skyrotter/ha-appliance-electromenager-cards
 *   https://github.com/skyrotter/ha-appliance-electromenager-cards — MIT License, Copyright (c) 2026 Nicolas
 *   (licence text: dashboard/vendor/anim/skyrotter/LICENSE) — except the batch 4 ones below, redrawn as SVG from
 *   ADNPolymerase/ha-appliance-card https://github.com/ADNPolymerase/ha-appliance-card — MIT License, Copyright (c)
 *   2026 ADNPolymerase (licence text: dashboard/vendor/anim/ha-appliance-card/LICENSE).
 * What was changed:
 *   - Home Assistant parts removed (hass, services, editor, i18n, live values); the LCDs show a fixed sample value.
 *   - Re-framed into our 200 × 240 view box (the 120 × 140 drawings are scaled 1.6× in a nested <svg>) with our own
 *     ground shadow; ids and classes renamed to "xa-…"; greys re-tinted to our purple-night palette (tint() below);
 *     the EV car and garage car are violet; the home battery is re-laid out as two modules.
 *   - Animation reworked to compositor-friendly properties only (transform / opacity): every stroke-dashoffset "flow"
 *     became a chase of dots (opacity), drop-shadow / blur glows became gradient layers, keyframed fill / filter / CSS
 *     "d:" paths were dropped, doors and lids stay closed. Loops run only under ".xa-on" (the device is on/running).
 *   - Simplified: one coffee-maker style per key, single-zone wine cooler, TV without the boot intro, solo robot
 *     vacuum without the room scene, gates/garage show "open" as the on state.
 *   - Batch 2: AV receiver, beer tap, desktop PC, laptop, cooktop, pellet stove, 3D printer, radiator,
 *     server rack, tool charger, towel warmer, ventilation fan — one "on" state each (playing / pouring / screen on /
 *     two zones cooking / heating / printing / online / charging / running); the radiator's blur shadow, the RGB
 *     colour cycle and every dash animation were replaced as above.
 *   - Batch 3 (from the larger cards, rendered in a sandbox): boom barrier, swing gate, aquarium, diesel
 *     heater, gas boiler, hot tub, colour / filament bulbs, pendant cluster, chandelier, garden spotlight, Christmas
 *     tree, power meter (no brand), pellet boiler, pool robot, water / industrial pumps, robot mower, sauna, roller
 *     shutter, venetian blind, swing shutters, underfloor heating, UPS, ground-source heat pump — the HTML around each
 *     drawing, extra states and live gauges dropped; bright walls darkened; colour cycles and blend modes removed.
 *     The venetian blind was later split into a lift blind and a tilt blind, and drapes were added;
 *     these three can also show part-open ("--pos", see the window coverings below).
 *   - Batch 4 (ADNPolymerase): kettle, multicooker, rice cooker, toaster, iron, hair dryer, pet feeder,
 *     pet fountain, dehumidifier, space heater, monitor, router, bathroom scale, security camera, aroma diffuser,
 *     mailbox — his CSS/HTML illustrations redrawn as SVG in his 96 × 108 layout (his kettle, multicooker, rice cooker
 *     and scale were SVG already and kept close), one "on" state each; the mailbox flag and a few small motions are Skypane's own.
 */
(function () {
  "use strict";

  // ---------- helpers ----------
  // greys → our purple-night greys (the drawings were white/steel appliances on a light card)
  function tint(s) {
    return s.replace(/#([0-9a-fA-F]{6})\b/g, (m, h) => {
      const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
      if (Math.max(r, g, b) - Math.min(r, g, b) > 26) return m;
      const L = (r + g + b) / 3;
      const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
      return "#" + c(L * 0.96) + c(L * 0.93) + c(L + 18 * (1 - L / 255) + 10);
    });
  }
  const DEF = {
    body: '<linearGradient id="ID-body" x1="0" x2="1"><stop offset="0" stop-color="#eef1f4"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#d4d9df"/></linearGradient>',
    chrome: '<linearGradient id="ID-chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbfcfd"/><stop offset=".3" stop-color="#a3abb4"/><stop offset=".55" stop-color="#eef1f4"/><stop offset=".8" stop-color="#8d959f"/><stop offset="1" stop-color="#c9ced4"/></linearGradient>',
    inox: '<linearGradient id="ID-inox" x1="0" x2="1"><stop offset="0" stop-color="#b9bfc6"/><stop offset=".22" stop-color="#eceff2"/><stop offset=".5" stop-color="#c5cad0"/><stop offset=".75" stop-color="#e6e9ec"/><stop offset="1" stop-color="#a8afb7"/></linearGradient>',
    gloss: '<linearGradient id="ID-gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>',
    dark: '<linearGradient id="ID-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3138"/><stop offset="1" stop-color="#101317"/></linearGradient>',
    warm: '<radialGradient id="ID-warm" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="#ffe2a3"/><stop offset=".6" stop-color="#f3a54a" stop-opacity=".75"/><stop offset="1" stop-color="#7a3b12" stop-opacity=".2"/></radialGradient>',
    holes: '<pattern id="ID-holes" width="4.5" height="4.5" patternUnits="userSpaceOnUse"><circle cx="2.25" cy="2.25" r=".75" fill="#4f5760" opacity=".55"/></pattern>',
    mesh: '<pattern id="ID-mesh" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r=".55" fill="#000" opacity=".45"/></pattern>',
  };
  const defs = (names, extra = "") => `<defs>${names.map((n) => DEF[n]).join("")}${extra}</defs>`;
  const shadow = (cx, cy, rx, ry = 5) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity=".28"/>`;
  const nest = (vb, x, y, w, h, body) => `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb}" overflow="visible">${body}</svg>`;
  // a 120 × 140 drawing, 1.6×, with our shadow under its base (base / rx in drawing units)
  const sk = (body, base, rx) => (rx ? shadow(100, (4 + base * 1.6).toFixed(1), (rx * 1.6).toFixed(1)) : "") + nest("0 0 120 140", 4, 4, 192, 224, body);
  const lcd = (x, y, w, h, txt, cls = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="#0c1720" stroke="#8f98a2" stroke-width=".6"/>
    <text class="xa-lcd ${cls}" x="${x + w / 2}" y="${y + h / 2 + 0.3}" text-anchor="middle" dominant-baseline="central">${txt}</text>`;
  const steam = (xs, y) => `<g class="xa-steam">${xs.map((x) => `<path d="M${x} ${y}q-3-5 0-9t0-9"/>`).join("")}</g>`;
  // "flow" along a line: dots whose opacity peaks one after another (no stroke-dashoffset)
  function along(pts, n) {
    const seg = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); tot += d; }
    const out = [];
    for (let k = 0; k < n; k++) {
      let t = ((k + 0.5) / n) * tot, i = 0;
      while (i < seg.length - 1 && t > seg[i]) { t -= seg[i]; i++; }
      const f = seg[i] ? t / seg[i] : 0;
      out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f]);
    }
    return out;
  }
  const bez = (p0, p1, p2, p3, s = 24) => Array.from({ length: s + 1 }, (_, i) => {
    const t = i / s, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
  });
  const chase = (pts, n, r, fill, dur) => `<g class="xa-chase" fill="${fill}">${along(pts, n).map(([x, y], i) =>
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" style="animation-duration:${dur}s;animation-delay:${(-((n - i) / n) * dur).toFixed(2)}s"/>`).join("")}</g>`;

  // ---------- drawings (ids written as "ID-…", made unique per key by root()) ----------
  const D = {};

  D["chest-freezer"] = () => sk(`${defs(["body"], `
<linearGradient id="ID-side" x1="0" x2="1"><stop offset="0" stop-color="#cfd5db"/><stop offset="1" stop-color="#aeb6be"/></linearGradient>
<linearGradient id="ID-top" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e3e8ec"/></linearGradient>`)}
<rect x="12" y="126" width="9" height="5" rx="1.5" fill="#3a3f45"/><rect x="88" y="126" width="9" height="5" rx="1.5" fill="#3a3f45"/>
<path d="M100 73L112 61V117L100 129Z" fill="url(#ID-side)"/>
<path d="M103 112l6-6M103 116l6-6M103 120l6-6" stroke="#8f979f" stroke-width=".7"/>
<rect x="8" y="73" width="92" height="56" rx="2.5" fill="url(#ID-body)" stroke="#bfc6ce" stroke-width=".7"/>
<rect x="8" y="121" width="92" height="8" rx="2" fill="#e2e6ea"/>
<path d="M76 123.5h20M76 125.5h20M76 127.5h20" stroke="#aab1b9" stroke-width=".6"/>
${lcd(66, 79, 30, 11, "-18°")}
<g class="xa-flake" stroke="#6fd8ff" stroke-width=".8" stroke-linecap="round"><path d="M72 81.5v6M69.4 83l5.2 3M69.4 86l5.2-3"/></g>
<circle class="xa-led xa-ledp" cx="72" cy="94" r="1.3"/><circle cx="77" cy="94" r="1.3" fill="#3b335f"/>
<path d="M100 66L112 54L112 61L100 73Z" fill="url(#ID-side)"/>
<path d="M8 66L100 66L112 54L20 54Z" fill="url(#ID-top)" stroke="#bfc6ce" stroke-width=".6"/>
<path d="M8 66L100 66L100 73L8 73Z" fill="#f1f3f5" stroke="#bfc6ce" stroke-width=".6"/>
<rect x="44" y="68.5" width="20" height="2.6" rx="1.3" fill="#7d858e"/>
<path d="M14 80v36" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/>
<g class="xa-mist"><circle cx="30" cy="131" r="1.6"/><circle cx="46" cy="132" r="1.3"/><circle cx="64" cy="131" r="1.7"/><circle cx="80" cy="132" r="1.3"/></g>`, 131, 54);

  D["drawer-freezer"] = () => sk(`${defs(["body", "chrome"], `
<linearGradient id="ID-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfeaf3"/></linearGradient>
<linearGradient id="ID-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfe6f5" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#cfe6f5" stop-opacity=".25"/></linearGradient>`)}
<rect x="26" y="4" width="68" height="126" rx="6" fill="url(#ID-body)" stroke="#bfc6ce" stroke-width=".7"/>
<rect x="30" y="30" width="60" height="88" rx="3" fill="url(#ID-in)"/>
<rect class="xa-df-light" x="30" y="30" width="60" height="88" fill="#fffbe6"/>
${[[34, 16, "#e5484d", "#3e8ed0", "#f2c94c"], [56, 18, "#9fd356", "#ffffff", "#ff8f3d"], [78, 18, "#c4c9cf", "#e5484d", "#8a5a2b"], [100, 16, "#3e8ed0", "#f6f7f9", "#e5484d"]].map(([y, h, a, b, c]) => `
<g><rect x="32" y="${y}" width="56" height="${h}" rx="2.5" fill="#e9f5ff" opacity=".9" stroke="#9fc3db" stroke-width=".6"/>
  <rect x="36" y="${y + 6}" width="12" height="${h - 8}" rx="2" fill="${a}"/><rect x="51" y="${y + 8}" width="14" height="${h - 10}" rx="2" fill="${b}" stroke="#c9d3dc" stroke-width=".4"/><rect x="68" y="${y + 5}" width="16" height="${h - 7}" rx="3" fill="${c}"/>
  <rect x="32" y="${y}" width="56" height="4.5" rx="2" fill="#cfe6f5" opacity=".95"/><rect x="50" y="${y + 1.2}" width="20" height="2" rx="1" fill="#9fc3db"/></g>`).join("")}
<g class="xa-mist xa-df-cold"><circle cx="44" cy="58" r="2"/><circle cx="60" cy="80" r="2.4"/><circle cx="76" cy="62" r="1.8"/><circle cx="52" cy="102" r="2"/></g>
<rect x="30" y="30" width="60" height="88" rx="3" fill="url(#ID-glass)" stroke="#9aa3ad" stroke-width="1.2"/>
<path d="M33 33h24l-22 80h-2z" fill="#fff" opacity=".12"/>
<rect x="84" y="44" width="3.4" height="46" rx="1.7" fill="url(#ID-chrome)" stroke="#6f7781" stroke-width=".4"/>
${lcd(35, 11, 30, 13, "-20°")}
<g class="xa-flake" stroke="#6fd8ff" stroke-width=".8" stroke-linecap="round"><path d="M74 14.5v7M71 16.25l6 3.5M71 19.75l6-3.5"/></g>
<circle class="xa-led xa-ledp" cx="82" cy="18" r="1.3"/>
<rect x="26" y="122" width="68" height="8" rx="3" fill="#e2e6ea"/><path d="M34 125h52M34 127h52" stroke="#aab1b9" stroke-width=".6"/>
<g class="xa-mist"><circle cx="40" cy="132" r="1.4"/><circle cx="52" cy="133" r="1.2"/><circle cx="66" cy="132" r="1.5"/><circle cx="79" cy="133" r="1.2"/></g>`, 131, 40);

  const coffeeDefs = (clip) => defs(["inox", "chrome", "dark", "mesh", "holes"], `
<linearGradient id="ID-glassv" x1="0" x2="1"><stop offset="0" stop-color="#e8f1f7" stop-opacity=".35"/><stop offset=".3" stop-color="#ffffff" stop-opacity=".12"/><stop offset="1" stop-color="#c9d6e0" stop-opacity=".3"/></linearGradient>
<linearGradient id="ID-cof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a4a24"/><stop offset=".15" stop-color="#4a2a14"/><stop offset="1" stop-color="#2a170b"/></linearGradient>
<linearGradient id="ID-mug" x1="0" x2="1"><stop offset="0" stop-color="#e9ecef"/><stop offset=".45" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd5db"/></linearGradient>
<linearGradient id="ID-tank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe6ff" stop-opacity=".55"/><stop offset="1" stop-color="#5fb4ea" stop-opacity=".7"/></linearGradient>
<radialGradient id="ID-hot"><stop offset="0" stop-color="#ff7a2e" stop-opacity=".9"/><stop offset="1" stop-color="#ff7a2e" stop-opacity="0"/></radialGradient>
<clipPath id="ID-cup">${clip}</clipPath>`);
  const drops = (x, y, dy) => `<g class="xa-cdrip" style="--dy:${dy}px"><circle cx="${x}" cy="${y}" r="1.3"/><circle cx="${x}" cy="${y}" r="1.1"/><circle cx="${x}" cy="${y}" r="1.2"/></g>`;

  D["coffee-drip"] = () => sk(`${coffeeDefs('<path d="M30 70h40v30q0 6-6 6h-28q-6 0-6-6z"/>')}
<rect x="74" y="16" width="34" height="96" rx="6" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".6"/>
<rect x="80" y="28" width="10" height="62" rx="4" fill="url(#ID-tank)" stroke="#7fb6d8" stroke-width=".5"/>
<rect x="81.5" y="40" width="7" height="48" rx="3" fill="#4aa6e0" opacity=".5"/>
<path d="M82 34h2M82 46h2M82 58h2M82 70h2" stroke="#fff" stroke-opacity=".6" stroke-width=".8"/>
<path d="M22 30q0-10 10-10h46v26h-48q-8 0-8-8z" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".6"/>
<path d="M28 24h44" stroke="#fff" stroke-opacity=".18" stroke-width="1.4" stroke-linecap="round"/>
<path d="M30 46h44l-9 12h-26z" fill="#262b31" stroke="#05070a" stroke-width=".5"/>
${drops(52, 60, 26)}
<rect x="12" y="106" width="96" height="21" rx="6" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".6"/>
<ellipse class="xa-cf-hot" cx="50" cy="106" rx="30" ry="5" fill="url(#ID-hot)"/>
<rect x="26" y="104.5" width="48" height="3.5" rx="1.7" fill="#3a3232"/>
<rect class="xa-cf-plate" x="26" y="104.5" width="48" height="3.5" rx="1.7" fill="#ff5a1f"/>
${lcd(80, 112, 24, 9, "07:30")}
<circle class="xa-led xa-ledo xa-ledp" cx="22" cy="116.5" r="3"/><circle cx="22" cy="116.5" r="3" fill="none" stroke="#7d8792" stroke-width=".6"/>
<path d="M28 76q-11 1-11 12q0 10 11 11" fill="none" stroke="#454d57" stroke-width="4" stroke-linecap="round"/>
<g clip-path="url(#ID-cup)"><rect class="xa-lvl" x="28" y="70" width="44" height="36" fill="url(#ID-cof)"/></g>
<path d="M30 66h40v34q0 6-6 6h-28q-6 0-6-6z" fill="url(#ID-glassv)" stroke="#c4d2dd" stroke-opacity=".8" stroke-width=".8"/>
<path d="M34 72v26" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>
<rect x="28" y="61" width="44" height="7" rx="2.5" fill="#1d2126"/><rect x="47" y="59" width="10" height="3" rx="1" fill="#1d2126"/>
${steam([44, 56], 19)}`, 128, 52);

  D["coffee-pod"] = () => sk(`${coffeeDefs('<rect x="41" y="84" width="30" height="20" rx="2"/>')}
<rect x="80" y="18" width="18" height="86" rx="6" fill="url(#ID-tank)" stroke="#7fb6d8" stroke-width=".6"/>
<rect x="82" y="34" width="14" height="66" rx="4" fill="#4aa6e0" opacity=".45"/>
<path d="M44 12h34q8 0 8 8v96h-50v-96q0-8 8-8z" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".6"/>
<path d="M24 22q0-10 10-10h40q8 0 8 8v24q0 8-8 8h-40q-10 0-10-10z" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".6"/>
<path d="M28 16h44" stroke="#fff" stroke-opacity=".18" stroke-width="1.4" stroke-linecap="round"/>
<circle class="xa-led xa-ledb xa-ledp" cx="40" cy="31" r="3.4"/><circle class="xa-led xa-ledb xa-ledp xa-d2" cx="54" cy="31" r="3.4"/>
<circle cx="40" cy="31" r="3.4" fill="none" stroke="#7d8792" stroke-width=".6"/><circle cx="54" cy="31" r="3.4" fill="none" stroke="#7d8792" stroke-width=".6"/>
<circle cx="70" cy="31" r="4.2" fill="url(#ID-chrome)" stroke="#5c646d" stroke-width=".4"/><path d="M70 28.6v2.2M68.1 29.6a2.6 2.6 0 1 0 3.8 0" stroke="#3a424b" stroke-width=".8" fill="none" stroke-linecap="round"/>
<rect x="49" y="52" width="14" height="5" rx="2" fill="#2a2f35"/>
<path class="xa-cstream" d="M56 57v26" stroke="#5a3417" stroke-width="1.6" stroke-linecap="round"/>
${drops(56, 58, 24)}
<rect x="24" y="108" width="72" height="16" rx="6" fill="url(#ID-inox)" stroke="#7d858e" stroke-width=".6"/>
<rect x="30" y="106" width="56" height="5" rx="2" fill="#2a2f35"/><rect x="30" y="106" width="56" height="5" rx="2" fill="url(#ID-mesh)"/>
<path d="M71 87q9 0 9 7t-9 7" fill="none" stroke="#dfe3e7" stroke-width="3.2"/>
<path d="M39 82h34l-2 22q-1 3-4 3h-22q-3 0-4-3z" fill="url(#ID-mug)" stroke="#aab2ba" stroke-width=".6"/>
<g clip-path="url(#ID-cup)"><rect class="xa-lvl" x="38" y="84" width="36" height="20" fill="url(#ID-cof)"/></g>
<ellipse cx="56" cy="82.5" rx="17" ry="1.8" fill="#9aa2ab" opacity=".5"/>
${steam([50, 60], 80)}`, 124, 44);

  D["coffee-espresso"] = () => sk(`${coffeeDefs('<rect x="47" y="93" width="26" height="14" rx="2"/>')}
<rect x="22" y="4" width="40" height="8" rx="3" fill="#2a2f35"/><rect x="26" y="2.5" width="32" height="3" rx="1.5" fill="#3d444c"/>
<g class="xa-hum">
<rect x="9" y="10" width="102" height="116" rx="9" fill="url(#ID-inox)" stroke="#7d858e" stroke-width=".7"/>
<rect x="15" y="14" width="90" height="26" rx="5" fill="url(#ID-dark)"/>
${lcd(38, 20, 44, 13, "ESPRESSO", "xa-lcds")}
<circle class="xa-led xa-ledb xa-ledp" cx="26" cy="27" r="3"/><circle cx="26" cy="27" r="3" fill="none" stroke="#7d8792" stroke-width=".6"/>
<circle class="xa-led" cx="94" cy="27" r="3"/><circle cx="94" cy="27" r="3" fill="none" stroke="#7d8792" stroke-width=".6"/>
<rect x="20" y="46" width="80" height="70" rx="5" fill="#15181b"/>
<path d="M22 48h76" stroke="#fff" stroke-opacity=".06" stroke-width="2"/>
<rect x="38" y="48" width="44" height="12" rx="3" fill="url(#ID-chrome)" stroke="#5c646d" stroke-width=".5"/>
<rect x="51" y="60" width="5" height="6" rx="1" fill="#8f979f"/><rect x="64" y="60" width="5" height="6" rx="1" fill="#8f979f"/>
<path class="xa-cstream" d="M53.5 66v27M66.5 66v27" stroke="#5a3417" stroke-width="1.4" stroke-linecap="round"/>
${drops(53.5, 67, 26)}${drops(66.5, 67, 26).replace('class="xa-cdrip"', 'class="xa-cdrip xa-d2"')}
<path d="M73 97q7 0 7 4.5t-7 4.5" fill="none" stroke="#dfe3e7" stroke-width="2.6"/>
<path d="M45 92h30l-1.6 14q-1 4-5 4h-17q-4 0-5-4z" fill="url(#ID-mug)" stroke="#aab2ba" stroke-width=".6"/>
<g clip-path="url(#ID-cup)"><rect class="xa-lvl" x="44" y="93" width="32" height="14" fill="url(#ID-cof)"/></g>
<ellipse cx="60" cy="92.5" rx="15" ry="1.6" fill="#9aa2ab" opacity=".5"/>
<ellipse cx="60" cy="112" rx="24" ry="2" fill="#000" opacity=".35"/>
<rect x="17" y="112" width="86" height="10" rx="3" fill="url(#ID-chrome)" stroke="#6f7780" stroke-width=".5"/>
<rect x="21" y="114" width="78" height="6" rx="2" fill="url(#ID-holes)"/>
<path d="M13 16v100" stroke="#fff" stroke-opacity=".5" stroke-width="1.2" stroke-linecap="round"/>
</g>
${steam([55, 65], 90)}`, 127, 54);

  D["air-fryer"] = () => {
    const coil = (x) => `M${x} 61h3l1.8 2l1.8-2l1.8 2l1.8-2l1.8 2l1.8-2l1.8 2l1.8-2l1.8 2l1.8-2l1.8 2l1.8-2l1.8 2h3`;
    const win = (x, clip, food) => `<g clip-path="url(#${clip})">
  <rect class="xa-af-light" x="${x}" y="58" width="39" height="31" fill="url(#ID-warm)"/>
  <path class="xa-af-coil" d="${coil(x + 2)}"/><path class="xa-af-coilh" d="${coil(x + 2)}"/>
  <g class="xa-af-air"><path d="M${x + 3} 74q7-8 16-3t16-2"/><path d="M${x + 3} 68q8 5 16 0t16 1"/></g>
  <path d="M${x + 1} 84h37v5h-37z" fill="url(#ID-mesh)" opacity=".9"/>${food}</g>`;
    const fries = [[18, 80, 15, -14], [27, 78.5, 14, 18], [35, 80.5, 15, -6], [21, 83, 13, 8], [31, 83.5, 15, -20], [24, 76.5, 12, 32], [40, 77.5, 10, -38]]
      .map(([x, y, w, a]) => `<rect x="${x}" y="${y}" width="${w}" height="3" rx="1" fill="url(#ID-fry)" transform="rotate(${a} ${x + w / 2} ${y + 1.5})"/>`).join("");
    const nugs = [[75, 83, 5, 3.4, 0], [85, 84, 5.4, 3.2, -10], [96, 83, 5, 3.5, 12], [80, 79, 4.6, 3, 15], [91, 79, 4.8, 3.1, -18]]
      .map(([x, y, rx, ry, a]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#ID-nug)" transform="rotate(${a} ${x} ${y})"/>`).join("");
    return sk(`${defs(["inox", "dark", "warm", "mesh"], `<clipPath id="ID-w1"><rect x="14" y="58" width="39" height="31" rx="3"/></clipPath><clipPath id="ID-w2"><rect x="67" y="58" width="39" height="31" rx="3"/></clipPath>
<linearGradient id="ID-cav" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f45"/><stop offset="1" stop-color="#15181b"/></linearGradient>
<linearGradient id="ID-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#272c32"/><stop offset="1" stop-color="#0b0d10"/></linearGradient>
<linearGradient id="ID-fry" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd76a"/><stop offset="1" stop-color="#e09b2d"/></linearGradient>
<radialGradient id="ID-nug" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#e9a54c"/><stop offset="1" stop-color="#9c5a1e"/></radialGradient>`)}
${steam([42, 60, 78], 23)}
<rect x="10" y="123" width="12" height="5" rx="1.5" fill="#15181b"/><rect x="98" y="123" width="12" height="5" rx="1.5" fill="#15181b"/>
<rect x="5" y="26" width="110" height="100" rx="9" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".8"/>
<path d="M14 27.5h92" stroke="#4a525b" stroke-width=".8" stroke-linecap="round"/>
<rect x="9" y="30" width="102" height="17" rx="4" fill="url(#ID-glass)" stroke="#3a424b" stroke-width=".5"/>
${lcd(46, 33, 28, 11, "200°", "xa-lcdo")}
<circle class="xa-led xa-ledo xa-ledp" cx="41" cy="38.5" r="1.3"/>
<g fill="none" stroke="#7d8792" stroke-width=".7">
  <circle cx="17" cy="38.5" r="2.6"/><path d="M15.6 38.5h2.8"/><circle cx="25" cy="38.5" r="2.6"/><path d="M23.6 38.5h2.8M25 37.1v2.8"/>
  <circle cx="33" cy="38.5" r="2.6"/><path d="M32 37.4l2 1.1l-2 1.1z"/><circle cx="87" cy="38.5" r="2.6"/><path d="M86 37.4l2 1.1l-2 1.1z"/>
  <circle cx="95" cy="38.5" r="2.6"/><path d="M93.6 38.5h2.8M95 37.1v2.8"/><circle cx="103" cy="38.5" r="2.6"/><path d="M103 36.8v1.6M101.5 37.6a2 2 0 1 0 3 0"/>
</g>
<rect x="9" y="52" width="49" height="69" rx="5" fill="url(#ID-inox)" stroke="#6f7780" stroke-width=".6"/>
<rect x="62" y="52" width="49" height="69" rx="5" fill="url(#ID-inox)" stroke="#6f7780" stroke-width=".6"/>
<rect x="12.5" y="56.5" width="42" height="34" rx="4" fill="#15181b"/><rect x="65.5" y="56.5" width="42" height="34" rx="4" fill="#15181b"/>
<rect x="14" y="58" width="39" height="31" rx="3" fill="url(#ID-cav)"/><rect x="67" y="58" width="39" height="31" rx="3" fill="url(#ID-cav)"/>
${win(14, "ID-w1", `<g class="xa-af-food">${fries}</g>`)}
${win(67, "ID-w2", `<g class="xa-af-food xa-d2">${nugs}<path d="M73 82.5q2-1 4 0M84 83.5q2-1 4 0M94 82q2-1 4 0M89 78.5q2-1 4 0" stroke="#7a3f12" stroke-width=".6" fill="none" opacity=".7"/></g>`)}
<path d="M14 72L30 58h9L14 80z" fill="#fff" opacity=".1"/><path d="M67 72L83 58h9L67 80z" fill="#fff" opacity=".1"/>
<rect x="14" y="58" width="39" height="31" rx="3" fill="none" stroke="#000" stroke-opacity=".35"/><rect x="67" y="58" width="39" height="31" rx="3" fill="none" stroke="#000" stroke-opacity=".35"/>
<rect x="17" y="96" width="33" height="19" rx="4" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".5"/><rect x="70" y="96" width="33" height="19" rx="4" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".5"/>
<path d="M20 98.5h27M73 98.5h27" stroke="#fff" stroke-opacity=".14" stroke-width="1" stroke-linecap="round"/>
<rect x="29" y="105" width="9" height="2.2" rx="1.1" fill="#59616b"/><rect x="82" y="105" width="9" height="2.2" rx="1.1" fill="#59616b"/>
<path d="M11 55l14-1M64 55l14-1" stroke="#fff" stroke-opacity=".5" stroke-width=".8" stroke-linecap="round"/>`, 128, 56);
  };

  D["robot-vacuum"] = () => {
    const brush = (x) => `<g transform="translate(${x} 113)"><g class="xa-rv-brush"><circle r="17" fill="none"/>
      ${[0, 120, 240].map((a) => `<line x1="0" y1="0" x2="17" y2="0" transform="rotate(${a}) scale(1 .35)" stroke="#6b7178" stroke-width="2.4" stroke-linecap="round"/>`).join("")}
      <circle r="3" fill="#30343a"/></g></g>`;
    const dust = Array.from({ length: 10 }, (_, i) => `<circle cx="${70 + (i * 37) % 100}" cy="${132 + (i % 3) * 3}" r="${1.4 + (i % 3) * 0.5}" style="animation-delay:${-((i * 0.17) % 1.4).toFixed(2)}s"/>`).join("");
    return nest("16 36 208 112", 0, 104, 200, 107.7, `<defs>
  <linearGradient id="ID-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d3d8dd"/></linearGradient>
  <linearGradient id="ID-side" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9bfc5"/><stop offset="1" stop-color="#868d94"/></linearGradient></defs>
<g class="xa-rv-dust">${dust}</g>
<g class="xa-rv-bot">
  <ellipse cx="120" cy="124" rx="96" ry="9" fill="#000" opacity=".28"/>
  ${brush(64)}${brush(176)}
  <path d="M30 78 V96 Q30 120 120 120 Q210 120 210 96 V78 Z" fill="url(#ID-side)"/>
  <path d="M34 92 Q40 116 120 117 Q200 116 206 92 V100 Q200 121 120 121 Q40 121 34 100 Z" fill="#2b2f35"/>
  <ellipse cx="120" cy="78" rx="90" ry="30" fill="url(#ID-top)"/>
  <ellipse cx="120" cy="80" rx="74" ry="23" fill="none" stroke="#dfe3e7" stroke-width="3.5"/>
  <ellipse class="xa-rv-ring" cx="120" cy="80" rx="74" ry="23" pathLength="100" stroke-dasharray="64 100" transform="rotate(180 120 80)"/>
  <circle cx="104" cy="94" r="3.5" fill="#cfd4d9" stroke="#b5bbc1"/><circle cx="136" cy="94" r="3.5" fill="#cfd4d9" stroke="#b5bbc1"/>
  <rect x="102" y="54" width="36" height="18" rx="9" fill="#2b2f35"/>
  <ellipse cx="120" cy="55" rx="18" ry="5.5" fill="#4a4f56"/>
  <rect x="108" y="62" width="24" height="4" rx="2" fill="#111"/>
  <rect class="xa-rv-scan" x="108" y="62" width="6" height="4" rx="2" fill="#38d9ff"/>
</g>`);
  };

  D["water-heater"] = () => sk(`${defs(["chrome"], `
<linearGradient id="ID-cyl" x1="0" x2="1"><stop offset="0" stop-color="#c3c9cf"/><stop offset=".3" stop-color="#ffffff"/><stop offset=".6" stop-color="#eef0f2"/><stop offset="1" stop-color="#aeb5bc"/></linearGradient>
<linearGradient id="ID-copper" x1="0" x2="1"><stop offset="0" stop-color="#a0603a"/><stop offset=".45" stop-color="#e2a477"/><stop offset="1" stop-color="#8a4f2e"/></linearGradient>
<linearGradient id="ID-arc" x1="0" x2="1"><stop offset="0" stop-color="#3e8ed0"/><stop offset=".5" stop-color="#f2c94c"/><stop offset="1" stop-color="#e5484d"/></linearGradient>`)}
<g class="xa-wh-waves"><path d="M46 20q-3-4 0-8t0-8"/><path d="M60 18q-3-4 0-8t0-8"/><path d="M74 20q-3-4 0-8t0-8"/></g>
<rect x="49" y="114" width="6" height="18" fill="url(#ID-copper)"/><rect x="65" y="114" width="6" height="18" fill="url(#ID-copper)"/>
<rect x="48" y="122" width="8" height="3" rx="1" fill="#3e8ed0"/><rect x="64" y="122" width="8" height="3" rx="1" fill="#e5484d"/>
<rect x="40" y="117" width="9" height="5" rx="1.2" fill="#c9a43a" stroke="#8a6d1f" stroke-width=".4"/>
<path d="M30 26q0-14 30-14t30 14v80q0 12-30 12t-30-12z" fill="url(#ID-cyl)" stroke="#a7aeb5" stroke-width=".8"/>
<path d="M30 26q0 9 30 9t30-9" fill="none" stroke="#b7bec5" stroke-width=".8"/><path d="M30 104q0 9 30 9t30-9" fill="none" stroke="#b7bec5" stroke-width=".8"/>
<rect x="38" y="58" width="44" height="40" rx="5" fill="#f4f6f8" stroke="#b5bcc3" stroke-width=".7"/>
<circle cx="60" cy="76" r="13" fill="url(#ID-chrome)"/><circle cx="60" cy="76" r="11" fill="#fcfcfd"/>
<path d="M51.5 84.5a12 12 0 1 1 17 0" fill="none" stroke="url(#ID-arc)" stroke-width="2.2" stroke-linecap="round"/>
<path d="M60 67.4v2M52.6 70.6l1.4 1.4M67.4 70.6l-1.4 1.4M50 76h2M68 76h2" stroke="#7d868f" stroke-width=".7"/>
<path d="M60 76l-1.1 0l1.1-8.5l1.1 8.5z" fill="#c62828" transform="rotate(38 60 76)"/>
<circle cx="60" cy="76" r="1.6" fill="#3a4148"/>
<text x="60" y="86" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700" font-size="5" fill="#4b545e">55°</text>
<circle class="xa-led xa-ledo xa-ledp" cx="76" cy="92" r="1.9"/>
<rect x="43" y="90.5" width="16" height="3" rx="1.2" fill="#d5dade"/>
<path d="M36 40q4-6 6-1" stroke="#fff" stroke-opacity=".9" stroke-width="2" fill="none" stroke-linecap="round"/>
<rect x="34" y="34" width="5" height="70" rx="2.5" fill="#fff" opacity=".35"/>`, 132, 36);

  D["ac-split"] = () => sk(`${defs([], `<linearGradient id="ID-split" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#eef1f4"/><stop offset="1" stop-color="#cfd5db"/></linearGradient>`)}
<g class="xa-ac-air"><path d="M22 86q-6 14 0 26t-2 22"/><path d="M40 86q-4 14 2 26t0 22"/><path d="M60 86q-3 14 3 26t-1 22"/><path d="M80 86q-2 14 4 26t0 22"/><path d="M98 86q0 14 6 26t2 22"/></g>
<path d="M6 54q0-10 10-10h88q10 0 10 10v18q0 6-6 8h-96q-6-2-6-8z" fill="url(#ID-split)" stroke="#aab2ba" stroke-width=".7"/>
<path d="M14 48h92" stroke="#c4cbd2" stroke-width=".6"/><path d="M16 51h88M16 53.5h88" stroke="#d7dce1" stroke-width=".5"/>
<path d="M10 70h100" stroke="#fff" stroke-opacity=".9" stroke-width="1"/>
<rect class="xa-ac-slot" x="12" y="73.5" width="96" height="5" rx="2.5" fill="#2a2f35"/>
<g class="xa-ac-flap"><path d="M12 74.5h96q0 4.5-4 5h-88q-4-.5-4-5z" fill="#f2f4f6" stroke="#aab2ba" stroke-width=".5"/></g>
${lcd(84, 58, 22, 9, "22°")}
<g class="xa-ac-ico" stroke="#4fc3f7" stroke-width=".9" stroke-linecap="round"><path d="M78 59v8M74.5 61l7 4M74.5 65l7-4"/></g>
<circle class="xa-led" cx="18" cy="64" r="1.2"/>`, 128, 0);

  D["heat-pump"] = () => sk(`${defs([], `
<linearGradient id="ID-hp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6f8"/><stop offset="1" stop-color="#cfd5db"/></linearGradient>
<radialGradient id="ID-grill" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#3a4048"/><stop offset="1" stop-color="#1c2025"/></radialGradient>`)}
<g class="xa-hum">
<rect x="14" y="114" width="14" height="8" rx="1" fill="#59616b"/><rect x="92" y="114" width="14" height="8" rx="1" fill="#59616b"/>
<rect x="8" y="34" width="104" height="82" rx="4" fill="url(#ID-hp)" stroke="#9aa2ab" stroke-width=".7"/>
<path d="M10 37h100" stroke="#fff" stroke-width="1.2"/><path d="M84 40v72" stroke="#b9c0c7" stroke-width=".7"/>
<g stroke="#bfc6cd" stroke-width=".6"><path d="M88 46h20M88 50h20M88 54h20M88 58h20M88 62h20M88 66h20"/></g>
<rect x="88" y="84" width="20" height="18" rx="1.5" fill="#e3e7eb" stroke="#aab2ba" stroke-width=".5"/><circle cx="98" cy="93" r="1.3" fill="#9aa2ab"/>
<circle class="xa-led" cx="104" cy="75" r="1.3"/>
<circle cx="46" cy="75" r="31" fill="#d4d9de" stroke="#aab2ba" stroke-width=".6"/><circle cx="46" cy="75" r="28" fill="url(#ID-grill)"/>
<g class="xa-spin" style="--sp:.5s" fill="#8e979f"><circle cx="46" cy="75" r="24" fill="none"/><path d="M46 75q-2-16 8-23q3 9-8 23z"/><path d="M46 75q15-6 23 3q-9 4-23-3z"/><path d="M46 75q-13 10-24 4q5-8 24-4z"/></g>
<circle cx="46" cy="75" r="4" fill="#59616b"/>
<g fill="none" stroke="#e6eaee" stroke-opacity=".8" stroke-width=".7"><circle cx="46" cy="75" r="9"/><circle cx="46" cy="75" r="15"/><circle cx="46" cy="75" r="21"/><circle cx="46" cy="75" r="27"/><path d="M46 47v56M18 75h56"/></g>
</g>
<g class="xa-hp-out"><circle cx="46" cy="75" r="30"/><circle cx="46" cy="75" r="30"/><circle cx="46" cy="75" r="30"/></g>
<path d="M112 98h4q3 0 3 3v19" stroke="#c77b3a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<path d="M112 104h2q2 0 2 2v14" stroke="#2a2f35" stroke-width="3.2" fill="none" stroke-linecap="round"/>`, 122, 56);

  D["solar-panels"] = () => {
    const P = "M7.1 93.1L40.4 93.1L53.9 50.9L20.6 50.9Z M42.1 93.1L75.4 93.1L88.9 50.9L55.6 50.9Z";
    return sk(`${defs([], `<clipPath id="ID-pan"><path d="${P}"/></clipPath>
<linearGradient id="ID-cell" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#132a52"/><stop offset=".55" stop-color="#1f4683"/><stop offset="1" stop-color="#3a6fb8"/></linearGradient>
<linearGradient id="ID-rail" x1="0" x2="1"><stop offset="0" stop-color="#8d959e"/><stop offset=".5" stop-color="#e3e7eb"/><stop offset="1" stop-color="#7d858e"/></linearGradient>
<linearGradient id="ID-sweep" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="ID-sunglow"><stop offset="0" stop-color="#fff6c2" stop-opacity=".9"/><stop offset=".5" stop-color="#ffd23f" stop-opacity=".35"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0"/></radialGradient>`)}
<g class="xa-sol-sun">
  <circle cx="96" cy="22" r="22" fill="url(#ID-sunglow)"/>
  <g class="xa-sol-rays"><path d="M96 6v5M96 33v5M80 22h5M107 22h5M84.7 10.7l3.5 3.5M103.8 29.8l3.5 3.5M84.7 33.3l3.5-3.5M103.8 14.2l3.5-3.5" stroke="#ffc51a" stroke-width="2.2" stroke-linecap="round"/></g>
  <circle cx="96" cy="22" r="8" fill="#ffd23f" stroke="#ffb400" stroke-width="1"/>
</g>
<rect x="24" y="52" width="3" height="58" fill="url(#ID-rail)"/><rect x="84" y="52" width="3" height="58" fill="url(#ID-rail)"/>
<path d="M26 104L84 78M26 80L84 104" stroke="#9aa3ad" stroke-width="1.2"/><path d="M26 92L12 104M86 92L72 104" stroke="#9aa3ad" stroke-width="1.2"/>
<rect x="9" y="92" width="2.6" height="18" fill="url(#ID-rail)"/><rect x="69" y="92" width="2.6" height="18" fill="url(#ID-rail)"/>
${[5.5, 65.5, 20.5, 80.5, 97].map((x) => `<rect x="${x}" y="108" width="${x === 97 ? 9 : 10}" height="5" rx="1" fill="#b8b4ac" stroke="#8f8a80" stroke-width=".5"/>`).join("")}
<path d="M6.0 94.0L76.0 94.0L90.0 50.0L20.0 50.0Z" fill="#c9d1da" stroke="#8d959e" stroke-width=".8" stroke-linejoin="round"/>
<path d="${P}" fill="url(#ID-cell)" stroke="#dfe5ea" stroke-width="1" stroke-linejoin="round"/>
<path d="M9.4 86.1L42.7 86.1M11.6 79.0L44.9 79.0M13.8 72.0L47.2 72.0M16.1 65.0L49.4 65.0M18.3 57.9L51.6 57.9M15.4 93.1L28.9 50.9M23.8 93.1L37.2 50.9M32.1 93.1L45.5 50.9M44.4 86.1L77.7 86.1M46.6 79.0L79.9 79.0M48.8 72.0L82.2 72.0M51.1 65.0L84.4 65.0M53.3 57.9L86.6 57.9M50.5 93.1L63.9 50.9M58.8 93.1L72.2 50.9M67.1 93.1L80.5 50.9" stroke="#6f97d4" stroke-width=".35" opacity=".85"/>
<g clip-path="url(#ID-pan)"><rect class="xa-sol-sweep" x="-20" y="44" width="24" height="54" fill="url(#ID-sweep)" transform="skewX(-18)"/></g>
<path class="xa-sol-glow" d="${P}" fill="#ffe28a"/>
<path class="xa-sol-shade" d="${P}" fill="#0b1630"/>
<path d="M70 92V106H101V98" fill="none" stroke="#2b2f34" stroke-width="1.6" stroke-linejoin="round"/>
${chase([[70, 92], [70, 106], [101, 106], [101, 98]], 9, 1, "#ffd23f", 1.4)}
<rect x="100" y="94" width="3" height="16" fill="url(#ID-rail)"/>
<rect x="91" y="64" width="22" height="32" rx="2.5" fill="#e7eaee" stroke="#9aa3ad" stroke-width=".6"/>
<rect x="91" y="64" width="22" height="4.5" rx="2" fill="#cfd5db"/>
<path d="M94 88h16M94 90.5h16M94 93h16" stroke="#b3bac2" stroke-width=".6"/>
${lcd(93, 71, 18, 8, "3.2kW", "xa-lcds")}
<circle class="xa-led" cx="96" cy="83" r="1.3"/>
<path d="M104 80l-2 4h3l-2 4" stroke="#ffb400" stroke-width=".9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`, 113, 50);
  };

  // home battery: two stacked-cell modules (after skyrotter's three-module drawing), drawn straight in 200 × 240
  D["home-battery"] = () => {
    const X = [14, 100], TOP = 62, LID = 20, BODY = 128, W = 76, Dp = 12, lvl = 0.72;
    const h = BODY * lvl, ly = TOP + LID + BODY - h;
    const mod = (x0, i) => `<g>
      <polygon points="${x0 + W},${TOP + LID} ${x0 + W + Dp},${TOP + LID - Dp} ${x0 + W + Dp},${TOP + LID + BODY - Dp} ${x0 + W},${TOP + LID + BODY}" fill="#c9ced3"/>
      <polygon points="${x0 + W},${TOP} ${x0 + W + Dp},${TOP - Dp} ${x0 + W + Dp},${TOP + LID - Dp} ${x0 + W},${TOP + LID}" fill="#0d0d0d"/>
      <polygon points="${x0},${TOP} ${x0 + Dp},${TOP - Dp} ${x0 + W + Dp},${TOP - Dp} ${x0 + W},${TOP}" fill="#2a2a2a"/>
      <rect x="${x0}" y="${TOP}" width="${W}" height="${LID}" rx="3" fill="#161616"/>
      <rect x="${x0 + 8}" y="${TOP + 7}" width="20" height="6" rx="3" fill="#000"/>
      <circle class="xa-led xa-ledp${i ? " xa-d2" : ""}" cx="${x0 + W - 10}" cy="${TOP + 10}" r="3"/>
      <rect x="${x0}" y="${TOP + LID}" width="${W}" height="${BODY}" fill="url(#ID-cell)"/>
      ${Array.from({ length: 8 }, (_, k) => `<line x1="${x0 + 40 + k * 4}" y1="${TOP + LID + 4}" x2="${x0 + 40 + k * 4}" y2="${TOP + LID + BODY - 4}" stroke="#d9dde1" stroke-width="1"/>`).join("")}
      <g clip-path="url(#ID-c${i})">
        <rect x="${x0}" y="${ly}" width="${W}" height="${h}" fill="#34d399" opacity=".3"/>
        <path class="xa-bat-wave${i ? " xa-d2" : ""}" d="M${x0 - 20} ${ly} q 10 -6 20 0 t 20 0 t 20 0 t 20 0 t 20 0 t 20 0 v 8 h-120z" fill="#34d399" opacity=".45"/>
      </g>
      <circle cx="${x0 + 6}" cy="${TOP + LID + BODY - 6}" r="2" fill="#9aa3ad"/></g>`;
    const cab1 = bez([X[0] + 22, TOP - 6], [X[0] + 22, TOP - 30], [X[1] + 16, TOP - 30], [X[1] + 16, TOP - 6]);
    const cab2 = bez([X[1] + W + 4, TOP - 8], [X[1] + W + 24, TOP - 20], [X[1] + W + 20, TOP + 60], [X[1] + W + 16, TOP + 140]);
    const pd = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");
    return `<defs><linearGradient id="ID-cell" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f7f8f9"/><stop offset="1" stop-color="#e3e6e9"/></linearGradient>
      ${X.map((x, i) => `<clipPath id="ID-c${i}"><rect x="${x}" y="${TOP + LID}" width="${W}" height="${BODY}"/></clipPath>`).join("")}</defs>
      ${shadow(100, TOP + LID + BODY + 4, 90)}
      ${mod(X[1], 1)}${mod(X[0], 0)}
      ${[cab1, cab2].map((c) => `<path d="${pd(c)}" fill="none" stroke="#111" stroke-width="8" stroke-linecap="round"/><path d="${pd(c)}" fill="none" stroke="#ff7a1a" stroke-width="5" stroke-linecap="round"/>`).join("")}
      ${chase(cab1, 9, 1.4, "#fff6a0", 1.2)}${chase(cab2, 10, 1.4, "#fff6a0", 1.2)}
      <path class="xa-bat-bolt" d="M${X[0] + 40} ${TOP + LID + 40} l-12 18 h8 l-4 16 l12 -18 h-8 z" fill="#ffb300"/>`;
  };

  D["ev-charger"] = () => {
    const car = "#6d5bd0";
    const cable = bez([44, 112], [44, 168], [112, 170], [134, 118]);
    const pd = "M44 112 C 44 168, 112 170, 134 118";
    return shadow(100, 199, 80, 4) + nest("2 0 338 172", 0, 96, 200, 101.8, `<defs>
  <linearGradient id="ID-wb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#40454d"/><stop offset="1" stop-color="#16191d"/></linearGradient>
  <linearGradient id="ID-carb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${car}"/><stop offset="1" stop-color="#4a3c9a"/></linearGradient>
  <linearGradient id="ID-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fc3dc"/><stop offset="1" stop-color="#2d4456"/></linearGradient></defs>
<rect x="12" y="6" width="64" height="106" rx="14" fill="url(#ID-wb)"/>
<rect x="18" y="12" width="52" height="94" rx="10" fill="#2c3036" stroke="rgba(255,255,255,.08)"/>
<rect x="41" y="22" width="6" height="44" rx="3" fill="#5b5480"/><rect class="xa-ev-led" x="41" y="22" width="6" height="44" rx="3" fill="#34d399"/>
<rect x="25" y="76" width="38" height="16" rx="3" fill="#0c1a24"/>
<text class="xa-ev-scr" x="44" y="87" text-anchor="middle">7.2 kW</text>
<rect x="36" y="104" width="16" height="10" rx="3" fill="#111"/>
<path d="M122 142 L122 120 Q124 108 142 104 L180 99 Q200 78 236 75 L272 75 Q300 77 318 98 L328 102 Q338 106 338 122 L338 142 Z" fill="url(#ID-carb)"/>
<path d="M188 99 Q206 82 236 80 L250 80 L250 99 Z" fill="url(#ID-glass)"/><path d="M256 80 L272 80 Q294 82 308 99 L256 99 Z" fill="url(#ID-glass)"/>
<rect x="251" y="80" width="4" height="20" fill="${car}"/>
<path d="M200 104 V138 M256 104 V138" stroke="rgba(0,0,0,.25)" stroke-width="1"/>
<rect x="236" y="108" width="10" height="2.5" rx="1" fill="rgba(0,0,0,.35)"/><rect x="292" y="108" width="10" height="2.5" rx="1" fill="rgba(0,0,0,.35)"/>
<path d="M330 106 l6 2 v6 l-7 -1 z" fill="#fff6c2"/><rect x="122" y="108" width="5" height="8" rx="1" fill="#e53935"/>
<rect x="122" y="132" width="216" height="6" fill="rgba(0,0,0,.25)"/>
${[160, 300].map((x) => `<circle cx="${x}" cy="142" r="17" fill="#141414"/><circle cx="${x}" cy="142" r="9" fill="#9aa3ad"/><circle cx="${x}" cy="142" r="3" fill="#555"/>`).join("")}
<rect x="130" y="112" width="10" height="10" rx="2" fill="#1d1d1d"/>
<rect x="205" y="110" width="80" height="20" rx="5" fill="rgba(0,0,0,.45)" stroke="rgba(255,255,255,.85)" stroke-width="1.5"/>
<rect x="285" y="116" width="4" height="8" rx="1.5" fill="rgba(255,255,255,.85)"/>
<rect class="xa-ev-gauge" x="208" y="113" width="52" height="14" rx="3" fill="#34d399"/>
<text x="245" y="124" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="10" fill="#fff">70%</text>
<path d="${pd}" fill="none" stroke="#1b1b1b" stroke-width="6" stroke-linecap="round"/>
${chase(cable, 12, 1.5, "#7cff9b", 1.1)}
<rect x="128" y="111" width="12" height="12" rx="3" fill="#2a2a2a"/>
<path class="xa-ev-spark" d="M134 108 L136 115 L143 117 L136 119 L134 126 L132 119 L125 117 L132 115 Z" fill="#fff59d"/>`);
  };

  D["pool-pump"] = () => sk(`${defs([], `
<clipPath id="ID-win"><rect x="22" y="52" width="16" height="32" rx="3"/></clipPath>
<clipPath id="ID-pool"><rect x="0" y="113" width="120" height="27"/></clipPath>
<linearGradient id="ID-motor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f86d8"/><stop offset=".35" stop-color="#6fb0f0"/><stop offset=".6" stop-color="#2f6fbf"/><stop offset="1" stop-color="#174a85"/></linearGradient>
<linearGradient id="ID-grey" x1="0" x2="1"><stop offset="0" stop-color="#b9c0c7"/><stop offset=".45" stop-color="#eef1f4"/><stop offset="1" stop-color="#a3abb4"/></linearGradient>
<linearGradient id="ID-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fd0ff"/><stop offset="1" stop-color="#0a6fb8"/></linearGradient>
<linearGradient id="ID-pot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fdcff" stop-opacity=".55"/><stop offset="1" stop-color="#1b88d0" stop-opacity=".85"/></linearGradient>`)}
<rect x="0" y="113" width="120" height="27" rx="3" fill="url(#ID-water)"/>
<g clip-path="url(#ID-pool)">
  <path d="M0 117h120" stroke="#1d6fa8" stroke-width="2.2" stroke-dasharray="3 1"/>
  <g class="xa-pp-ripple"><path d="M-30 124q5-2 10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width=".9"/>
  <path d="M-25 132q5-2 10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0t10 0" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width=".9"/></g>
  <g class="xa-pp-bub" fill="#fff"><circle cx="108" cy="125" r="1.2"/><circle cx="104" cy="123" r=".9"/><circle cx="106" cy="128" r="1"/><circle cx="101" cy="126" r=".8"/></g>
</g>
<rect x="0" y="108" width="120" height="5.5" fill="#d8d0bf"/>
<path d="M20 108v5.5M44 108v5.5M68 108v5.5M92 108v5.5" stroke="#b7ad98" stroke-width=".6"/>
<rect x="10" y="100" width="100" height="8" fill="#c4bfb4"/><rect x="10" y="100" width="100" height="1.5" fill="#d6d2c8"/>
<path d="M6 126V72H18" fill="none" stroke="#9aa3ad" stroke-width="8" stroke-linejoin="round"/><path d="M6 126V72H18" fill="none" stroke="#f1f3f5" stroke-width="6" stroke-linejoin="round"/>
<path d="M52 62V26H112V126" fill="none" stroke="#9aa3ad" stroke-width="8" stroke-linejoin="round"/><path d="M52 62V26H112V126" fill="none" stroke="#f1f3f5" stroke-width="6" stroke-linejoin="round"/>
${chase([[6, 124], [6, 72], [18, 72]], 7, 1.3, "#36b4f5", 1)}${chase([[52, 62], [52, 26], [112, 26], [112, 122]], 18, 1.3, "#36b4f5", 1)}
<rect x="2" y="90" width="8" height="5" rx="1" fill="#d5dade" stroke="#9aa3ad" stroke-width=".5"/><rect x="48" y="38" width="8" height="5" rx="1" fill="#d5dade" stroke="#9aa3ad" stroke-width=".5"/>
<g class="xa-hum">
<rect x="46" y="92" width="56" height="8" rx="1.5" fill="#3a3f45"/>
<rect x="18" y="44" width="24" height="48" rx="4" fill="url(#ID-grey)" stroke="#8f979f" stroke-width=".6"/>
<rect x="16" y="35" width="28" height="9" rx="2.5" fill="#2b3036"/><rect x="19" y="36.5" width="22" height="3" rx="1.5" fill="#cfe9ff" opacity=".55"/>
<rect x="22" y="52" width="16" height="32" rx="3" fill="url(#ID-pot)"/>
<g clip-path="url(#ID-win)">
  <path d="M23 58h14M23 64h14M23 70h14M23 76h14M26 52v32M30 52v32M34 52v32" stroke="#ffffff" stroke-opacity=".35" stroke-width=".5"/>
  <g class="xa-spin" style="--sp:2.4s"><circle cx="30" cy="68" r="8" fill="none"/>
    <circle cx="30" cy="68" r="5" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width=".8" stroke-dasharray="4 3"/>
    <path d="M27 63q2-2 4 0q-2 1.5-4 0z" fill="#5c9a34"/><path d="M32 72q2-2 4 0q-2 1.5-4 0z" fill="#8a6a2b"/><path d="M26 74q1.5-2 3.5 0q-1.5 1.5-3.5 0z" fill="#4f8a2a"/></g>
</g>
<rect x="22" y="52" width="16" height="32" rx="3" fill="none" stroke="#6f7881" stroke-width=".6"/>
<circle cx="52" cy="74" r="13" fill="url(#ID-grey)" stroke="#8f979f" stroke-width=".6"/><circle cx="52" cy="74" r="8" fill="none" stroke="#a7afb7" stroke-width=".7"/>
<rect x="60" y="56" width="42" height="36" rx="6" fill="url(#ID-motor)"/>
<path d="M65 58v32M69 58v32M73 58v32M77 58v32M81 58v32M85 58v32M89 58v32M93 58v32M97 58v32" stroke="#123a6a" stroke-opacity=".45" stroke-width=".9"/>
<rect x="64" y="45" width="32" height="11" rx="2" fill="#1d2126" stroke="#40464e" stroke-width=".5"/>
${lcd(66, 46.5, 24, 8, "1.1kW", "xa-lcds")}
<circle class="xa-led" cx="93" cy="50.5" r="1.3"/>
<rect x="99" y="58" width="10" height="32" rx="3" fill="url(#ID-grey)" stroke="#8f979f" stroke-width=".6"/>
<g class="xa-spin" style="--sp:.35s"><circle cx="104" cy="74" r="6.5" fill="none"/><path d="M104 74l-3.5-5.5M104 74l6-1M104 74l-2.5 6" stroke="#5b636c" stroke-width="2" stroke-linecap="round"/></g>
<path d="M100.5 63h7M100.5 67h7M100.5 71h7M100.5 75h7M100.5 79h7M100.5 83h7" stroke="#6f7881" stroke-width=".9"/>
<path d="M64 60q10-3 34 0" stroke="#fff" stroke-opacity=".35" stroke-width="1.4" fill="none"/>
</g>`, 141, 60);

  // ---- lights (skyrotter lights.js, 200 × 180 drawings) — halos are radial gradients here, not blur filters ----
  const LC = "#ffd27a";
  const lightDefs = `<defs>
   <radialGradient id="ID-halo"><stop offset="0" stop-color="${LC}" stop-opacity=".75"/><stop offset=".45" stop-color="${LC}" stop-opacity=".28"/><stop offset="1" stop-color="${LC}" stop-opacity="0"/></radialGradient>
   <radialGradient id="ID-glass" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity=".02"/></radialGradient>
   <radialGradient id="ID-fill" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".35" stop-color="${LC}" stop-opacity=".95"/><stop offset="1" stop-color="${LC}" stop-opacity=".55"/></radialGradient>
   <radialGradient id="ID-pool"><stop offset="0" stop-color="${LC}" stop-opacity=".6"/><stop offset="1" stop-color="${LC}" stop-opacity="0"/></radialGradient>
   <linearGradient id="ID-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6f767e"/><stop offset=".45" stop-color="#e2e6ea"/><stop offset="1" stop-color="#5a6067"/></linearGradient>
   <linearGradient id="ID-brass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a5f22"/><stop offset=".45" stop-color="#f1cf7a"/><stop offset="1" stop-color="#7b521b"/></linearGradient>
   <linearGradient id="ID-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${LC}" stop-opacity=".7"/><stop offset="1" stop-color="${LC}" stop-opacity="0"/></linearGradient>
   <linearGradient id="ID-up" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${LC}" stop-opacity=".75"/><stop offset="1" stop-color="${LC}" stop-opacity="0"/></linearGradient>
  </defs>`;
  const lights = (body, sh) => (sh || "") + nest("0 0 200 180", 0, 30, 200, 180, lightDefs + body);
  const halo = (cx, cy, r, k = 0.9) => `<circle class="xa-lt-lit xa-lt-halo" cx="${cx}" cy="${cy}" r="${r}" fill="url(#ID-halo)" style="--k:${k}"/>`;
  const screw = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="22" rx="3" fill="url(#ID-steel)"/>
    ${[4, 9, 14].map((d) => `<path d="M${x} ${y + d} L${x + w} ${y + d + 3}" stroke="#4d535a" stroke-width="1.2"/>`).join("")}
    <path d="M${x + 3} ${y + 22} Q${x + w / 2} ${y + 32} ${x + w - 3} ${y + 22} Z" fill="#3b4046"/>`;
  const BULB = "M100 22 C126 22 142 42 142 64 C142 82 130 92 122 104 C118 110 117 116 117 122 L83 122 C83 116 82 110 78 104 C70 92 58 82 58 64 C58 42 74 22 100 22 Z";

  D["light-bulb"] = () => lights(`${halo(100, 68, 76)}
      <path d="${BULB}" fill="#fff" fill-opacity=".06" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>
      <path class="xa-lt-lit" d="${BULB}" fill="url(#ID-fill)" style="--k:.9"/>
      <path class="xa-lt-wire" d="M92 120 L92 86 M108 120 L108 86"/>
      <path class="xa-lt-wire" d="M92 86 l2 -5 l2 5 l2 -5 l2 5 l2 -5 l2 5 l2 -5 l2 5" stroke-width="1.8"/>
      <path d="${BULB}" fill="url(#ID-glass)"/>
      ${screw(83, 122, 34)}`, shadow(100, 206, 34, 4));

  D["floor-lamp"] = () => lights(`<g class="xa-lt-beams"><path class="xa-lt-lit" d="M70 42 L40 0 L160 0 L130 42 Z" fill="url(#ID-up)" style="--k:.55"/>
      <path class="xa-lt-lit" d="M72 104 L52 160 L148 160 L128 104 Z" fill="url(#ID-cone)" style="--k:.45"/></g>
      <ellipse class="xa-lt-lit" cx="100" cy="176" rx="60" ry="7" fill="url(#ID-pool)" style="--k:.6"/>
      <path d="M100 104 L64 178 M100 104 L136 178 M100 104 L102 172" stroke="#b07a46" stroke-width="4" stroke-linecap="round"/>
      <circle cx="100" cy="106" r="4" fill="#7a5530"/>
      ${halo(100, 74, 62, 0.7)}
      <path d="M70 42 L130 42 L140 106 L60 106 Z" fill="#e9e1d2"/>
      <path class="xa-lt-lit" d="M70 42 L130 42 L140 106 L60 106 Z" fill="url(#ID-fill)" style="--k:.95"/>
      <path d="M70 42 L84 42 L76 106 L60 106 Z" fill="#000" fill-opacity=".1"/><path d="M118 42 L130 42 L140 106 L126 106 Z" fill="#000" fill-opacity=".14"/>
      <path d="M70 42 L130 42 M60 106 L140 106" stroke="#c9bda7" stroke-width="1.5"/>`, shadow(100, 210, 52, 4));

  D["desk-lamp"] = () => lights(`<rect x="0" y="168" width="200" height="12" rx="3" fill="#2a2420"/>
      <g class="xa-lt-beams"><path class="xa-lt-lit" d="M126 92 L108 168 L200 168 L168 66 Z" fill="url(#ID-cone)" style="--k:.7"/></g>
      <ellipse class="xa-lt-lit" cx="156" cy="168" rx="44" ry="5" fill="url(#ID-pool)" style="--k:.9"/>
      <g class="xa-lt-motes" fill="#fff"><circle cx="140" cy="150" r="1.2"/><circle cx="160" cy="158" r="1"/><circle cx="150" cy="140" r="1.1"/><circle cx="170" cy="152" r=".9"/></g>
      <ellipse cx="54" cy="166" rx="26" ry="6" fill="url(#ID-steel)"/><rect x="50" y="150" width="8" height="16" rx="2" fill="#7c838b"/>
      <path d="M54 152 L74 96 L126 56" fill="none" stroke="url(#ID-steel)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="74" cy="96" r="5" fill="#9aa1a8"/><circle cx="128" cy="58" r="4.5" fill="#9aa1a8"/>
      <g transform="rotate(-32 140 66)"><path d="M126 52 L154 52 L166 80 L114 80 Z" fill="#4c555e"/><path d="M126 52 L134 52 L118 80 L114 80 Z" fill="#fff" fill-opacity=".14"/>
       <ellipse cx="140" cy="80" rx="26" ry="4.5" fill="#2a2f35"/><ellipse class="xa-lt-lit" cx="140" cy="80" rx="24" ry="4" fill="url(#ID-fill)" style="--k:1"/></g>`, shadow(100, 212, 92, 4));

  D["pendant-light"] = () => lights(`<g class="xa-lt-beams"><path class="xa-lt-lit" d="M58 104 L18 180 L182 180 L142 104 Z" fill="url(#ID-cone)" style="--k:.7"/></g>
      <ellipse class="xa-lt-lit" cx="100" cy="176" rx="74" ry="6" fill="url(#ID-pool)" style="--k:.7"/>
      <g class="xa-lt-sway">
      <path d="M100 0 V40" stroke="#3a3f45" stroke-width="2"/><rect x="94" y="0" width="12" height="5" rx="1.5" fill="#cfd5db"/>
      <rect x="92" y="38" width="16" height="10" rx="2" fill="url(#ID-brass)"/>
      <path d="M100 46 C66 46 46 70 42 102 L158 102 C154 70 134 46 100 46 Z" fill="#525b66"/>
      <path d="M100 46 C80 46 62 58 54 78 C70 60 86 54 100 54 Z" fill="#fff" fill-opacity=".18"/>
      <ellipse cx="100" cy="102" rx="58" ry="7" fill="#2a2f35"/>
      <ellipse class="xa-lt-lit" cx="100" cy="102" rx="56" ry="6" fill="url(#ID-fill)" style="--k:1"/>
      <ellipse class="xa-lt-lit" cx="100" cy="104" rx="16" ry="6" fill="#fff8e6" style="--k:1"/>
      <path d="M42 102 L158 102" stroke="#c99a3e" stroke-width="2.5"/></g>`);

  D["tv"] = () => shadow(100, 186, 44, 4) + nest("0 0 120 140", 4, 4, 192, 224, `${defs([], `<clipPath id="ID-scr"><rect x="4" y="38" width="112" height="63" rx="1"/></clipPath>
<linearGradient id="ID-off" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2027"/><stop offset=".6" stop-color="#0a0c0f"/><stop offset="1" stop-color="#14181d"/></linearGradient>
<linearGradient id="ID-hero" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f5a73"/><stop offset=".55" stop-color="#3b2a7a"/><stop offset="1" stop-color="#0f1420"/></linearGradient>
<linearGradient id="ID-fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0f1420" stop-opacity=".95"/><stop offset=".6" stop-color="#0f1420" stop-opacity="0"/></linearGradient>
<linearGradient id="ID-gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>`)}
<rect x="53" y="102" width="14" height="7" fill="#15181d"/>
<path d="M40 113l5-5h30l5 5z" fill="#0b0d10" stroke="#2c3138" stroke-width=".5"/><path d="M45 108h30" stroke="#fff" stroke-opacity=".18" stroke-width=".6"/>
<rect x="2.5" y="36.5" width="115" height="66" rx="2" fill="#0b0d10" stroke="#2c3138" stroke-width=".7"/>
<rect x="4" y="38" width="112" height="63" rx="1" fill="url(#ID-off)"/>
<g clip-path="url(#ID-scr)"><g class="xa-tv-content">
  <rect x="4" y="38" width="112" height="63" fill="#0f1420"/>
  <rect x="4" y="38" width="112" height="33" fill="url(#ID-hero)"/>
  <circle cx="92" cy="50" r="9" fill="#ffb35c" opacity=".85"/>
  <path d="M60 71l14-12l9 6l12-10l21 16z" fill="#1d1640" opacity=".9"/>
  <rect x="4" y="38" width="112" height="33" fill="url(#ID-fade)"/>
  <rect x="9" y="51" width="30" height="3.2" rx="1" fill="#fff"/><rect x="9" y="56" width="22" height="1.6" rx=".8" fill="#9aa3b8"/>
  <rect x="9" y="61" width="11" height="4" rx="1" fill="#fff"/><path d="M12 61.9l2.4 1.1l-2.4 1.1z" fill="#0f1420"/><rect x="22" y="61" width="11" height="4" rx="1" fill="#59616b"/>
  <rect x="9" y="74" width="16" height="1.6" rx=".8" fill="#c9d0db"/>
  <g class="xa-tv-row">
    ${["#e85d75", "#3fb6a8", "#f2b84b", "#5b7cfa", "#a55cd6", "#4fb36b", "#e8834a", "#3a8fd6"].map((c, i) => `<rect x="${9 + i * 19}" y="77.5" width="17" height="11" rx="1.2" fill="${c}"/>`).join("")}
    <path d="M12 86h8M31 86h10M50 86h7M69 86h9M88 86h10M107 86h8M126 86h9M145 86h8" stroke="#fff" stroke-opacity=".75" stroke-width="1" stroke-linecap="round"/>
  </g>
  <rect class="xa-tv-sel" x="8.4" y="76.9" width="18.2" height="12.2" rx="1.6" fill="none" stroke="#fff" stroke-width=".9"/>
  <rect x="9" y="91.5" width="12" height="1.6" rx=".8" fill="#c9d0db"/>
  <g class="xa-tv-row2">${["#2f6f8f", "#8f3f5f", "#6f6f2f", "#3f4f8f", "#2f8f5f"].map((c, i) => `<rect x="${9 + i * 26}" y="95" width="24" height="9" rx="1.2" fill="${c}"/>`).join("")}</g>
</g></g>
<path d="M4 38L46 38L4 78z" fill="#fff" opacity=".06"/>
<path class="xa-tv-gloss" d="M4 38L78 38L30 101H4z" fill="url(#ID-gl)"/>
<rect x="4" y="38" width="112" height="63" rx="1" fill="none" stroke="#000" stroke-opacity=".5"/>
<circle class="xa-tv-led" cx="60" cy="101.8" r=".8"/>`);

  D["range-hood"] = () => sk(`${defs(["inox", "chrome", "holes", "mesh"], `
<linearGradient id="ID-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4c9" stop-opacity=".55"/><stop offset="1" stop-color="#fff4c9" stop-opacity="0"/></linearGradient>
<linearGradient id="ID-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3138"/><stop offset="1" stop-color="#0d1013"/></linearGradient>
<radialGradient id="ID-zone"><stop offset="0" stop-color="#ff5a1f" stop-opacity=".9"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient>`)}
<g class="xa-hd-beam"><path d="M24 80l-12 40h32z" fill="url(#ID-beam)"/><path d="M96 80l-12 40h32z" fill="url(#ID-beam)"/></g>
<g class="xa-hd-air"><path d="M38 118q-4-18 10-36"/><path d="M60 116v-34"/><path d="M82 118q4-18-10-36"/><path d="M28 112q2-16 18-30"/><path d="M92 112q-2-16-18-30"/></g>
<g class="xa-hd-steam"><path d="M54 96q-3-5 0-9t0-9"/><path d="M60 95q-3-5 0-9t0-9"/><path d="M66 96q-3-5 0-9t0-9"/></g>
<rect x="46" y="4" width="28" height="46" fill="url(#ID-inox)" stroke="#8f979f" stroke-width=".6"/>
<path d="M48 4v46" stroke="#fff" stroke-opacity=".6" stroke-width="1.2"/><path d="M50 40h20M50 43h20M50 46h20" stroke="#6f7780" stroke-width=".7"/>
<path d="M16 50h88l10 20h-108z" fill="url(#ID-inox)" stroke="#7d858e" stroke-width=".6"/>
<path d="M20 52h40l-6 16h-44z" fill="#fff" opacity=".18"/>
<rect x="6" y="70" width="108" height="8" rx="1.5" fill="url(#ID-chrome)" stroke="#6f7780" stroke-width=".5"/>
<circle cx="60" cy="60" r="7.5" fill="#22272d" stroke="#6f7780" stroke-width=".6"/>
<g class="xa-spin" style="--sp:.5s"><circle cx="60" cy="60" r="6.4" fill="none"/><path d="M60 60l0-6.2M60 60l5.4 3.1M60 60l-5.4 3.1" stroke="#a9b1ba" stroke-width="2.4" stroke-linecap="round"/></g>
<circle cx="60" cy="60" r="1.6" fill="#d7dce1"/><circle cx="60" cy="60" r="7.5" fill="url(#ID-holes)" opacity=".6"/>
<circle class="xa-led xa-ledb" cx="86" cy="74" r="1.4"/><circle class="xa-led xa-ledb" cx="93" cy="74" r="1.4"/><circle cx="100" cy="74" r="1.4" fill="#59616b"/>
<circle class="xa-led xa-ledy" cx="20" cy="74" r="1.4"/>
<rect x="9" y="78" width="102" height="3" rx="1" fill="#2a2f35"/><rect x="12" y="78" width="96" height="3" fill="url(#ID-mesh)"/>
<rect class="xa-hd-lamp" x="20" y="79.6" width="8" height="1.8" rx=".9"/><rect class="xa-hd-lamp" x="92" y="79.6" width="8" height="1.8" rx=".9"/>
<path d="M45 98h30v16q0 4-4 4h-22q-4 0-4-4z" fill="url(#ID-inox)" stroke="#7d858e" stroke-width=".6"/>
<rect x="44" y="96" width="32" height="3" rx="1.5" fill="url(#ID-chrome)"/><rect x="57" y="93.5" width="6" height="3" rx="1.2" fill="#2a2f35"/>
<path d="M45 102h-5M75 102h5" stroke="#2a2f35" stroke-width="2.2" stroke-linecap="round"/>
<rect x="10" y="118" width="100" height="7" rx="1.5" fill="url(#ID-glass)" stroke="#05070a" stroke-width=".5"/>
<ellipse class="xa-hd-zone" cx="60" cy="119.5" rx="20" ry="3" fill="url(#ID-zone)"/>
<ellipse cx="60" cy="119.5" rx="17" ry="1.3" fill="none" stroke="#3a424b" stroke-width=".6"/><ellipse cx="88" cy="121" rx="10" ry="1.2" fill="none" stroke="#3a424b" stroke-width=".6"/>`, 126, 54);

  D["wine-cooler"] = () => {
    const rows = [[44, ["#5b1226", "#1f4d2e", "#5b1226", "#b0852f", "#1f4d2e"]], [70, ["#d48a8a", "#5b1226", "#b0852f", "#1f4d2e", "#5b1226"]], [96, ["#1f4d2e", "#b0852f", "#5b1226", "#d48a8a", "#1f4d2e"]]];
    return sk(`${defs(["chrome", "gloss"], `
<linearGradient id="ID-light" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1c9" stop-opacity=".85"/><stop offset=".55" stop-color="#ffd98a" stop-opacity=".25"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></linearGradient>
<linearGradient id="ID-cab" x1="0" x2="1"><stop offset="0" stop-color="#2b3036"/><stop offset=".5" stop-color="#14171b"/><stop offset="1" stop-color="#262b31"/></linearGradient>
<linearGradient id="ID-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9a26b"/><stop offset="1" stop-color="#8a6a3f"/></linearGradient>
<clipPath id="ID-clip"><rect x="30" y="32" width="60" height="86"/></clipPath>`)}
<rect x="22" y="6" width="76" height="122" rx="4" fill="url(#ID-cab)" stroke="#05070a" stroke-width=".8"/>
<rect x="26" y="9" width="68" height="17" rx="2" fill="#0d1013"/>
<circle class="xa-led xa-ledb xa-ledp" cx="34" cy="17.5" r="1.7"/>
<path d="M42 15h10M42 18h10M42 21h10" stroke="#3b424a" stroke-width=".8" stroke-linecap="round"/>
${lcd(64, 12, 26, 11, "12°")}
<rect x="28" y="30" width="64" height="92" fill="#07090b"/>
<g clip-path="url(#ID-clip)">
  <rect x="30" y="32" width="60" height="86" fill="#14181d"/>
  <rect class="xa-wn-light" x="30" y="32" width="60" height="86" fill="url(#ID-light)"/>
  <rect class="xa-wn-light" x="31" y="33" width="58" height="2" fill="#fff6dc"/>
  <g class="xa-wn-bottles">
    ${rows.map(([y, cols]) => cols.map((c, i) => `<circle cx="${37 + i * 11.6}" cy="${y}" r="5" fill="${c}"/><circle cx="${37 + i * 11.6}" cy="${y}" r="2.4" fill="none" stroke="#fff" stroke-opacity=".22"/>`).join("") +
      `<rect x="30" y="${y + 5.5}" width="60" height="3" fill="url(#ID-wood)"/>`).join("")}
    <rect x="30" y="112" width="60" height="3" fill="url(#ID-wood)"/>
  </g>
  <g class="xa-wn-air" fill="none" stroke="#9fdcff" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="3 6"><path d="M44 116q-5-14 0-28t-3-30"/><path d="M60 116q5-14 0-28t3-30"/><path d="M76 116q-5-14 0-28t-3-30"/></g>
</g>
<rect x="26" y="28" width="68" height="96" rx="2" fill="none" stroke="#0a0c0f" stroke-width="3"/>
<rect x="29" y="31" width="62" height="90" fill="#0d1b2a" opacity=".3"/>
<g class="xa-drops" fill="#cfeeff"><circle cx="40" cy="48" r="1.1"/><circle cx="64" cy="58" r="1.1"/><circle cx="80" cy="46" r="1.1"/><circle cx="52" cy="88" r="1.1"/></g>
<path d="M29 31h62l-26 90h-36z" fill="url(#ID-gloss)" opacity=".45"/>
<rect x="89" y="50" width="3.6" height="46" rx="1.8" fill="url(#ID-chrome)" stroke="#6f7780" stroke-width=".4"/>
<path d="M28 124h64" stroke="#3b424a" stroke-width="1"/>
<rect x="30" y="127" width="10" height="5" rx="1.5" fill="#3a3f45"/><rect x="80" y="127" width="10" height="5" rx="1.5" fill="#3a3f45"/>`, 132, 44);
  };

  // ---- access (skyrotter access.js, 260 × 170): "on" = open ----
  const accDefs = `
  <linearGradient id="ID-stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f4f6f8"/><stop offset=".6" stop-color="#dfe4e8"/><stop offset="1" stop-color="#b9c1c9"/></linearGradient>
  <linearGradient id="ID-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d6670"/><stop offset="1" stop-color="#2d333a"/></linearGradient>
  <linearGradient id="ID-road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a5059"/><stop offset="1" stop-color="#363b42"/></linearGradient>
  <radialGradient id="ID-chr" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#bfc8d0"/><stop offset="1" stop-color="#6c7782"/></radialGradient>
  <radialGradient id="ID-flash"><stop offset="0" stop-color="#ffb84d" stop-opacity=".9"/><stop offset="1" stop-color="#ffb84d" stop-opacity="0"/></radialGradient>`;
  const beacon = (x, y) => `<circle class="xa-acc-halo" cx="${x}" cy="${y - 3}" r="11" fill="url(#ID-flash)"/>
 <rect x="${x - 6}" y="${y + 1}" width="12" height="4" rx="1" fill="#30363d"/>
 <path d="M${x - 5} ${y + 1} V${y - 3} A5 5 0 0 1 ${x + 5} ${y - 3} V${y + 1} Z" fill="#8a6a3a"/>
 <path class="xa-acc-lamp" d="M${x - 5} ${y + 1} V${y - 3} A5 5 0 0 1 ${x + 5} ${y - 3} V${y + 1} Z" fill="#ffb84d"/>
 <path d="M${x - 2.5} ${y - 4} A2.5 2.5 0 0 1 ${x} ${y - 6.5}" fill="none" stroke="#fff" stroke-width="1.2" opacity=".55"/>`;
  const pillar = (x, w, top, bot) => `<rect x="${x}" y="${top}" width="${w}" height="${bot - top}" fill="url(#ID-stone)" stroke="#9aa5ae" stroke-width=".8"/>
 <rect x="${x - 3}" y="${top - 6}" width="${w + 6}" height="7" rx="1.5" fill="#cfd6dc" stroke="#9aa5ae" stroke-width=".8"/>
 <rect x="${x - 2}" y="${bot - 6}" width="${w + 4}" height="6" fill="#c3cad0"/>`;

  D["garage-sectional"] = () => {
    let panels = "", wins = "";
    for (let i = 0; i < 4; i++) {
      const y = 46 + i * 26;
      panels += `<rect x="42" y="${y}" width="176" height="26" fill="url(#ID-panel)" stroke="#9aa5ae" stroke-width=".8"/>
   <path d="M44 ${y + 9} H216 M44 ${y + 17} H216" stroke="#b7c0c8" stroke-width=".8"/><path d="M44 ${y + 1.5} H216" stroke="#fff" stroke-width=".8" opacity=".7"/>`;
    }
    for (let i = 0; i < 5; i++) wins += `<rect x="${56 + i * 31}" y="50" width="24" height="10" rx="1.5" fill="#2b3640" stroke="#8d969e" stroke-width=".8"/><path d="M${58 + i * 31} 52 L${64 + i * 31} 52" stroke="#9fd3ff" stroke-width="1" opacity=".55"/>`;
    return shadow(100, 196, 92, 4) + nest("0 8 260 160", 0, 72, 200, 123, `<defs>${accDefs}
  <linearGradient id="ID-panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f4f6"/><stop offset="1" stop-color="#cdd4da"/></linearGradient>
  <linearGradient id="ID-facade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2ddd5"/><stop offset="1" stop-color="#cfc8bd"/></linearGradient>
  <linearGradient id="ID-inside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1f25"/><stop offset="1" stop-color="#2b3138"/></linearGradient>
  <radialGradient id="ID-light" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#fff3c4" stop-opacity=".75"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>
  <clipPath id="ID-gap"><rect x="42" y="46" width="176" height="104"/></clipPath></defs>
 <rect x="8" y="22" width="244" height="130" fill="url(#ID-facade)" stroke="#b3ab9e" stroke-width=".8"/>
 <rect x="2" y="14" width="256" height="10" rx="2" fill="#4a5058"/>
 <rect x="0" y="150" width="260" height="12" rx="2" fill="url(#ID-road)"/>
 <rect x="42" y="46" width="176" height="104" fill="url(#ID-inside)"/>
 <g class="xa-gd-bulb"><path d="M130 50 L60 150 H200 Z" fill="url(#ID-light)"/><circle cx="130" cy="50" r="3" fill="#fff6d0"/></g>
 <g>
  <path d="M84 146 V112 Q86 98 100 96 H160 Q174 98 176 112 V146 Z" fill="#6d5bd0"/>
  <path d="M96 99 Q100 88 110 86 H150 Q160 88 164 99 Z" fill="#4a3c9a"/>
  <path d="M100 98 Q104 90 112 89 H148 Q156 90 160 98 Z" fill="#9cc6ea" opacity=".55"/>
  <rect x="88" y="114" width="16" height="6" rx="2" fill="#e53935"/><rect x="156" y="114" width="16" height="6" rx="2" fill="#e53935"/>
  <rect x="116" y="124" width="28" height="8" rx="1" fill="#f2f2f2"/>
  <rect x="84" y="136" width="92" height="8" rx="2" fill="#3b2f7a"/>
  <rect x="88" y="142" width="14" height="8" rx="2" fill="#15191d"/><rect x="158" y="142" width="14" height="8" rx="2" fill="#15191d"/>
 </g>
 <g clip-path="url(#ID-gap)"><g class="xa-gd-door">
  ${panels}${wins}
  <rect x="122" y="136" width="16" height="3" rx="1.5" fill="url(#ID-chr)"/>
  <rect x="42" y="146" width="176" height="4" fill="#2d333a"/>
 </g></g>
 <rect x="38" y="42" width="184" height="108" fill="none" stroke="#9aa1a8" stroke-width="5"/>
 <rect x="34" y="38" width="192" height="6" rx="1" fill="#8d949b"/>
 <rect x="230" y="60" width="10" height="16" rx="2" fill="#2d333a"/><circle class="xa-led xa-ledy" cx="235" cy="70" r="2"/>
 ${beacon(235, 54)}`);
  };

  D["sliding-gate"] = () => {
    let bars = "", spikes = "";
    for (let x = 42; x <= 140; x += 7) bars += `<rect x="${x}" y="70" width="3" height="72" rx="1"/>`;
    for (let x = 43.5; x <= 141.5; x += 7) spikes += `<path d="M${x - 2.4} 70 L${x} 64 L${x + 2.4} 70 Z"/>`;
    const wheel = (cx) => `<g class="xa-sg-wheel"><circle cx="${cx}" cy="145" r="4.5" fill="#2d333a"/><path d="M${cx - 3} 145 H${cx + 3} M${cx} 142 V148" stroke="#9aa3ab" stroke-width="1"/></g>`;
    return shadow(100, 198, 92, 4) + nest("0 30 260 136", 0, 92, 200, 104.6, `<defs>${accDefs}
  <linearGradient id="ID-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3dccf"/><stop offset="1" stop-color="#c9c0b0"/></linearGradient></defs>
 <rect x="0" y="148" width="260" height="12" rx="2" fill="url(#ID-road)"/>
 <path d="M20 149 H252" stroke="#a9b1b8" stroke-width="2"/>
 <rect x="160" y="104" width="94" height="44" fill="url(#ID-wall)" stroke="#a89f8f" stroke-width=".8"/>
 <rect x="157" y="99" width="100" height="6" rx="1.5" fill="#d7d0c3" stroke="#a89f8f" stroke-width=".8"/>
 <g stroke="#b3a996" stroke-width=".7" opacity=".7"><path d="M160 118 H254 M160 133 H254 M190 104 V118 M226 104 V118 M174 118 V133 M210 118 V133 M244 118 V133 M190 133 V148 M226 133 V148"/></g>
 <g class="xa-sg-leaf">
  <g fill="#2f353c">${bars}${spikes}</g>
  <rect x="36" y="68" width="110" height="5" rx="1.5" fill="#3a4148"/><rect x="36" y="104" width="110" height="4" rx="1.5" fill="#3a4148"/>
  <rect x="36" y="138" width="110" height="5" rx="1.5" fill="#3a4148"/>
  <rect x="36" y="68" width="4" height="75" fill="#3a4148"/><rect x="142" y="68" width="4" height="75" fill="#3a4148"/>
  <path d="M38 70 H144" stroke="#fff" stroke-width=".8" opacity=".25"/>
  ${wheel(52)}${wheel(130)}
 </g>
 <rect x="168" y="130" width="24" height="18" rx="3" fill="url(#ID-metal)"/>
 <rect x="171" y="133" width="18" height="3" rx="1" fill="#8b949c" opacity=".6"/>
 <circle class="xa-led" cx="186" cy="141" r="1.8"/>
 ${pillar(146, 16, 56, 150)}${pillar(16, 18, 56, 150)}
 <rect x="20" y="90" width="9" height="14" rx="1.5" fill="#2d333a"/><circle cx="24.5" cy="95" r="1.6" fill="#7fe3ff"/><rect x="22" y="99" width="5" height="2.5" rx=".8" fill="#8b949c"/>
 ${beacon(25, 44)}`);
  };

  D["sump-pump"] = () => {
    const wave = "M58 58 q6 -3 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 V200 H58 Z";
    const grill = Array.from({ length: 6 }, (_, i) => `M${92 + i * 4} 161 V167`).join(" ");
    return shadow(100, 196, 96, 4) + nest("0 26 260 154", 0, 76, 200, 118.5, `<defs>
  <linearGradient id="ID-soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a6a4a"/><stop offset="1" stop-color="#5b4430"/></linearGradient>
  <linearGradient id="ID-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fb4f0" stop-opacity=".75"/><stop offset="1" stop-color="#1b4f7a" stop-opacity=".95"/></linearGradient>
  <linearGradient id="ID-pump" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5f7f99"/><stop offset=".45" stop-color="#a9c0d2"/><stop offset="1" stop-color="#4a647a"/></linearGradient>
  <clipPath id="ID-pit"><rect x="70" y="46" width="100" height="124"/></clipPath></defs>
 <rect x="0" y="40" width="260" height="138" rx="4" fill="url(#ID-soil)"/>
 <g fill="#6f5338" opacity=".6"><circle cx="20" cy="70" r="2"/><circle cx="40" cy="120" r="2.5"/><circle cx="210" cy="100" r="2"/><circle cx="240" cy="150" r="3"/><circle cx="30" cy="160" r="2"/><circle cx="200" cy="160" r="2.4"/></g>
 <rect x="0" y="34" width="260" height="7" rx="2" fill="#5aa046"/>
 <rect x="62" y="34" width="116" height="144" fill="#a7adb2"/>
 <rect x="70" y="46" width="100" height="124" fill="#2b3238"/>
 <g clip-path="url(#ID-pit)"><g class="xa-sp-lvl"><g class="xa-sp-wave"><path d="${wave}" fill="url(#ID-water)"/></g></g></g>
 <path d="M0 78 H74" stroke="#7d868e" stroke-width="9" fill="none"/><path d="M0 78 H74" stroke="#3b4248" stroke-width="5" fill="none"/>
 <g class="xa-drops" fill="#4fb4f0"><circle cx="76" cy="83" r="2"/><circle cx="77" cy="83" r="1.6"/><circle cx="75" cy="83" r="1.8"/></g>
 <g clip-path="url(#ID-pit)"><g class="xa-sp-lvl">
  <path d="M150 62 C150 90 128 100 116 118" fill="none" stroke="#1d2125" stroke-width="1.4"/>
  <ellipse cx="150" cy="58" rx="9" ry="5" fill="#f2a516" stroke="#a86f0c"/>
 </g></g>
 <g fill="none" stroke-linecap="round">
  <path d="M104 120 V68 Q104 60 112 60 H260" stroke="#7d868e" stroke-width="10"/>
  <path d="M104 120 V68 Q104 60 112 60 H260" stroke="#3b4248" stroke-width="6"/>
 </g>
 ${chase([[104, 118], [104, 68], [106, 62.5], [112, 60], [258, 60]], 18, 1.7, "#7dd3fc", 1.2)}
 <rect x="97" y="86" width="14" height="10" rx="2" fill="#4c555c" stroke="#2b3238"/>
 <g class="xa-hum">
  <rect x="88" y="118" width="32" height="44" rx="7" fill="url(#ID-pump)" stroke="#2f4558"/>
  <rect x="86" y="160" width="36" height="9" rx="2" fill="#2f4558"/>
  <path d="${grill}" stroke="#a9c0d2" stroke-width="1.6"/>
  <rect x="96" y="114" width="16" height="6" rx="2" fill="#4a647a"/>
  <circle class="xa-led" cx="104" cy="132" r="2.4"/>
 </g>
 <g class="xa-sp-bub" fill="#dff3ff"><circle cx="90" cy="158" r="1.6"/><circle cx="118" cy="156" r="1.3"/><circle cx="104" cy="160" r="1.8"/></g>`);
  };

  // ---------- batch 2 (skyrotter): rendered from his templates, classes renamed, flows made dot chases ----------
  D["av-receiver"] = () => sk(`<defs><linearGradient id="ID-chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbfcfd"/><stop offset=".3" stop-color="#a3abb4"/><stop offset=".55" stop-color="#eef1f4"/><stop offset=".8" stop-color="#8d959f"/><stop offset="1" stop-color="#c9ced4"/></linearGradient><radialGradient id="ID-steel" cx=".42" cy=".38" r=".8"><stop offset="0" stop-color="#eef1f3"/><stop offset=".55" stop-color="#aab2ba"/><stop offset="1" stop-color="#5f6770"/></radialGradient><radialGradient id="ID-shadow"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="ID-avb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4048"/><stop offset=".15" stop-color="#1d2126"/><stop offset="1" stop-color="#0d0f12"/></linearGradient><radialGradient id="ID-ring" cx=".5" cy=".5" r=".5"><stop offset=".7" stop-color="#38d9ff" stop-opacity="0"/><stop offset=".85" stop-color="#38d9ff" stop-opacity=".9"/><stop offset="1" stop-color="#38d9ff" stop-opacity="0"/></radialGradient></defs>
<ellipse cx="60" cy="104" rx="58" ry="4" fill="url(#ID-shadow)"/>
<g class="xa-av-notes" fill="#9fd3f0"><path d="M30 44v-9l6-2v9"/><circle cx="29" cy="44" r="1.8"/><circle cx="35" cy="42" r="1.8"/><path d="M60 40v-8"/><circle cx="59" cy="40" r="1.8"/><path d="M60 32l4 1.5" stroke="#9fd3f0" stroke-width="1"/><path d="M88 44v-9l6-2v9"/><circle cx="87" cy="44" r="1.8"/><circle cx="93" cy="42" r="1.8"/></g>
<g class="xa-av-waves" fill="none" stroke-linecap="round"><path d="M2 64q-4 8 0 16"/><path d="M-3 60q-6 12 0 24"/><path d="M118 64q4 8 0 16"/><path d="M123 60q6 12 0 24"/></g>
<rect x="10" y="96" width="12" height="5" rx="1.5" fill="#15181b"/><rect x="98" y="96" width="12" height="5" rx="1.5" fill="#15181b"/>
<rect x="4" y="52" width="112" height="45" rx="3.5" fill="url(#ID-avb)" stroke="#000" stroke-width=".6"/>
<path d="M6 54.5h108" stroke="#fff" stroke-opacity=".18" stroke-width="1"/>
<path d="M6 92h108" stroke="#2c3138" stroke-width=".8"/>
<circle class="xa-av-pwr" cx="14" cy="62" r="1.4"/>
<circle cx="16" cy="78" r="6.5" fill="url(#ID-chrome)" stroke="#2a2f35" stroke-width=".6"/>
<circle cx="16" cy="78" r="4.4" fill="#2a2f35"/><path d="M16 78l0-3.6" stroke="#cfd6dd" stroke-width="1" stroke-linecap="round"/>
<rect x="30" y="58" width="52" height="14" rx="2" fill="#071016" stroke="#2c3138" stroke-width=".6"/>
<text class="xa-lcd xa-av-lcd" x="56" y="67.4" text-anchor="middle">-24dB</text>
<g class="xa-av-eq">
<rect x="33" y="76" width="3.2" height="12" rx=".6"/><rect x="38" y="76" width="3.2" height="12" rx=".6"/><rect x="43" y="76" width="3.2" height="12" rx=".6"/>
<rect x="48" y="76" width="3.2" height="12" rx=".6"/><rect x="53" y="76" width="3.2" height="12" rx=".6"/><rect x="58" y="76" width="3.2" height="12" rx=".6"/>
<rect x="63" y="76" width="3.2" height="12" rx=".6"/><rect x="68" y="76" width="3.2" height="12" rx=".6"/><rect x="73" y="76" width="3.2" height="12" rx=".6"/>
<rect x="78" y="76" width="3.2" height="12" rx=".6"/>
</g>
<circle class="xa-av-ring" cx="99" cy="74" r="16" fill="url(#ID-ring)"/>
<circle cx="99" cy="74" r="12.5" fill="url(#ID-chrome)" stroke="#2a2f35" stroke-width=".7"/>
<circle cx="99" cy="74" r="10" fill="url(#ID-steel)"/>
<g class="xa-av-knob"><circle cx="99" cy="66.5" r="1.1" fill="#2a2f35"/></g>
<path d="M92 68a10 10 0 0 1 8-4" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" fill="none" stroke-linecap="round"/>`);
  D["beer-tap"] = () => sk(`<defs><linearGradient id="ID-chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbfcfd"/><stop offset=".3" stop-color="#a3abb4"/><stop offset=".55" stop-color="#eef1f4"/><stop offset=".8" stop-color="#8d959f"/><stop offset="1" stop-color="#c9ced4"/></linearGradient><linearGradient id="ID-inox" x1="0" x2="1"><stop offset="0" stop-color="#b9bfc6"/><stop offset=".22" stop-color="#eceff2"/><stop offset=".5" stop-color="#c5cad0"/><stop offset=".75" stop-color="#e6e9ec"/><stop offset="1" stop-color="#a8afb7"/></linearGradient><radialGradient id="ID-shadow"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="ID-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3138"/><stop offset="1" stop-color="#101317"/></linearGradient><pattern id="ID-mesh" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r=".55" fill="#000" opacity=".45"/></pattern><clipPath id="ID-gl"><path d="M85 80h26l-2.4 36q-.2 2-2.2 2h-17.2q-2 0-2.2-2z"/></clipPath><clipPath id="ID-kw"><rect x="26" y="70" width="40" height="34" rx="4"/></clipPath><linearGradient id="ID-beer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7c948"/><stop offset="1" stop-color="#d8891c"/></linearGradient><linearGradient id="ID-glassb" x1="0" x2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".35"/><stop offset=".3" stop-color="#ffffff" stop-opacity=".08"/><stop offset="1" stop-color="#dfe9f2" stop-opacity=".3"/></linearGradient></defs>
<ellipse cx="60" cy="128" rx="54" ry="4.5" fill="url(#ID-shadow)"/>
<g class="xa-bt-mist"><circle cx="16" cy="70" r="3"/><circle cx="14" cy="88" r="2.6"/><circle cx="18" cy="104" r="3.2"/></g>
<rect x="12" y="44" width="68" height="78" rx="10" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".6"/>
<path d="M16 48h60" stroke="#fff" stroke-opacity=".15" stroke-width="1.2" stroke-linecap="round"/>
<rect x="28" y="52" width="36" height="11" rx="1.5" fill="#0c1720" stroke="#8f98a2" stroke-width=".6"/>
<text class="xa-lcd" x="46" y="57.8" text-anchor="middle" dominant-baseline="central" fill="#7ec8e3">3°C</text>
<g class="xa-bt-flake" stroke="#6fd8ff" stroke-width=".8" stroke-linecap="round"><path d="M22 54.5v6M19.4 56l5.2 3M19.4 59l5.2-3"/></g>
<rect x="24" y="68" width="44" height="38" rx="5" fill="#15181b" stroke="#3a424b" stroke-width=".6"/>
<g clip-path="url(#ID-kw)">
<rect x="30" y="70" width="32" height="40" rx="3" fill="url(#ID-inox)"/>
<path d="M30 78h32M30 98h32" stroke="#8f979f" stroke-width="1.2"/>
<rect x="58" y="72" width="3" height="32" rx="1.5" fill="#2a2f35"/>
<g class="xa-bt-keg"><rect x="58" y="72" width="3" height="32" rx="1.5" fill="url(#ID-beer)"/></g>
</g>
<path d="M26 70L40 70L26 86z" fill="#fff" opacity=".08"/>
<rect x="76" y="114" width="40" height="7" rx="2" fill="url(#ID-chrome)" stroke="#6f7780" stroke-width=".5"/>
<rect x="79" y="114.5" width="34" height="2" fill="url(#ID-mesh)"/>
<path d="M40 44v-26q0-8 8-8h40q8 0 8 8v10" fill="none" stroke="url(#ID-chrome)" stroke-width="7" stroke-linecap="round"/>
<path d="M40 44v-26q0-8 8-8h40q8 0 8 8v10" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.2" stroke-linecap="round"/>
<rect x="93" y="27" width="6" height="7" rx="1.5" fill="#8f979f"/>
<g class="xa-bt-handle"><rect x="61" y="-6" width="9" height="16" rx="3" fill="#1d2126" stroke="#000" stroke-width=".5"/><rect x="63" y="-4" width="2" height="12" rx="1" fill="#fff" opacity=".2"/></g>
<rect x="60" y="8" width="11" height="4" rx="1.5" fill="url(#ID-chrome)"/>
<path class="xa-bt-stream" d="M96 34v46"/>${chase([[96,36],[96,79]], 8, 0.9, "#ffe7a3", 0.7)}
<g clip-path="url(#ID-gl)">
<g class="xa-bt-beer"><rect x="84" y="80" width="28" height="40" fill="url(#ID-beer)"/><rect x="84" y="80" width="28" height="6" fill="#fff8e6"/></g>
<g class="xa-bt-bubbles" fill="#fff6c8"><circle cx="92" cy="114" r=".8"/><circle cx="99" cy="116" r=".7"/><circle cx="104" cy="113" r=".9"/><circle cx="95" cy="110" r=".6"/></g>
</g>
<path d="M85 80h26l-2.4 36q-.2 2-2.2 2h-17.2q-2 0-2.2-2z" fill="url(#ID-glassb)" stroke="#d6e2ec" stroke-opacity=".8" stroke-width=".7"/>
<path d="M88 84l1.6 28" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>
<g class="xa-bt-drops" fill="#cfe9ff"><circle cx="87.5" cy="92" r=".7"/><circle cx="108.5" cy="98" r=".7"/><circle cx="90" cy="104" r=".6"/></g>`);
  D["desktop-pc"] = () => sk(`<defs><linearGradient id="ID-inox" x1="0" x2="1"><stop offset="0" stop-color="#b9bfc6"/><stop offset=".22" stop-color="#eceff2"/><stop offset=".5" stop-color="#c5cad0"/><stop offset=".75" stop-color="#e6e9ec"/><stop offset="1" stop-color="#a8afb7"/></linearGradient><linearGradient id="ID-gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="ID-shadow"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="ID-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3138"/><stop offset="1" stop-color="#101317"/></linearGradient><linearGradient id="ID-pcwall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f2a5c"/><stop offset=".55" stop-color="#1c5fc4"/><stop offset="1" stop-color="#5ec8ff"/></linearGradient><linearGradient id="ID-pcdesk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9c3a5"/><stop offset="1" stop-color="#b79a74"/></linearGradient><linearGradient id="ID-pcglass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b3138"/><stop offset="1" stop-color="#090b0e"/></linearGradient><clipPath id="ID-pcclip"><rect x="10" y="22" width="68" height="44" rx="1"/></clipPath></defs>
<ellipse cx="60" cy="126" rx="56" ry="3.5" fill="url(#ID-shadow)"/>
<path d="M2 110h116l-5 12h-106z" fill="url(#ID-pcdesk)"/>
<path d="M2 110h116" stroke="#fff" stroke-opacity=".5" stroke-width="1"/>
<path d="M36 104h12l2 7h-16z" fill="url(#ID-dark)"/>
<rect x="38" y="70" width="8" height="36" fill="url(#ID-inox)" stroke="#7d858e" stroke-width=".4"/>
<ellipse cx="42" cy="108" rx="16" ry="3.2" fill="url(#ID-inox)" stroke="#7d858e" stroke-width=".4"/>
<rect x="6" y="18" width="76" height="52" rx="3.5" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".6"/>
<rect x="10" y="22" width="68" height="44" rx="1" fill="#0a0d11"/>
<g class="xa-pc-screen" clip-path="url(#ID-pcclip)">
<rect x="10" y="22" width="68" height="44" fill="url(#ID-pcwall)"/>
<circle cx="64" cy="32" r="9" fill="#bfeaff" opacity=".35"/>
<rect x="13" y="26" width="30" height="24" rx="1.5" fill="#0d1520" stroke="#2b4a73" stroke-width=".4"/>
<rect x="13" y="26" width="30" height="3.4" rx="1.5" fill="#22344d"/>
<circle cx="15.2" cy="27.7" r=".7" fill="#ff5f56"/><circle cx="17.6" cy="27.7" r=".7" fill="#ffbd2e"/><circle cx="20" cy="27.7" r=".7" fill="#27c93f"/>
<g class="xa-pc-code"><rect x="16" y="32" width="16" height="1.6" rx=".8" fill="#6fd8ff"/><rect x="19" y="35.4" width="20" height="1.6" rx=".8" fill="#b894ff"/><rect x="19" y="38.8" width="12" height="1.6" rx=".8" fill="#ffd76a"/><rect x="16" y="42.2" width="22" height="1.6" rx=".8" fill="#6fe3a1"/><rect x="19" y="45.6" width="14" height="1.6" rx=".8" fill="#6fd8ff"/></g>
<rect x="46" y="38" width="28" height="19" rx="1.5" fill="#f4f7fb" opacity=".92"/>
<g class="xa-pc-bars"><rect x="50" y="48" width="4" height="7" fill="#3b82f6"/><rect x="56" y="43" width="4" height="12" fill="#22c55e"/><rect x="62" y="45.5" width="4" height="9.5" fill="#f59e0b"/><rect x="68" y="41" width="4" height="14" fill="#ef4444"/></g>
<rect x="10" y="61" width="68" height="5" fill="#0b1626" opacity=".85"/>
<circle cx="14" cy="63.5" r="1.4" fill="#5ec8ff"/><rect x="19" y="62.6" width="3.4" height="1.8" rx=".5" fill="#8fa3bd"/><rect x="24" y="62.6" width="3.4" height="1.8" rx=".5" fill="#8fa3bd"/><rect x="29" y="62.6" width="3.4" height="1.8" rx=".5" fill="#8fa3bd"/>
<path class="xa-pc-cursor" d="M0 0l0 6l1.7 -1.6l1.2 2.7l1.1 -.5l-1.2 -2.6l2.3 0z" fill="#fff" stroke="#000" stroke-width=".4"/>
</g>
<path d="M10 22h68l-28 44h-40z" fill="url(#ID-gloss)" opacity=".35"/>
<circle class="xa-pc-mled" cx="44" cy="68" r=".9"/>
<g class="xa-pc-tower">
<rect x="86" y="38" width="28" height="74" rx="3" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".6"/>
<rect x="90" y="43" width="20" height="62" rx="1.5" fill="url(#ID-pcglass)" stroke="#3b424a" stroke-width=".4"/>
<g class="xa-pc-rgb" fill="none" stroke-width="1.3">
<circle cx="100" cy="53" r="7.6"/><circle cx="100" cy="72" r="7.6"/><circle cx="100" cy="91" r="7.6"/>
</g>
<g class="xa-pc-fan"><circle cx="100" cy="53" r="6.5" fill="#12161a"/><path d="M100 53v-6M100 53l5.2 3M100 53l-5.2 3" stroke="#a9b1ba" stroke-width="2" stroke-linecap="round"/><circle cx="100" cy="53" r="7.6" fill="none"/></g>
<g class="xa-pc-fan"><circle cx="100" cy="72" r="6.5" fill="#12161a"/><path d="M100 72v-6M100 72l5.2 3M100 72l-5.2 3" stroke="#a9b1ba" stroke-width="2" stroke-linecap="round"/><circle cx="100" cy="72" r="7.6" fill="none"/></g>
<g class="xa-pc-fan"><circle cx="100" cy="91" r="6.5" fill="#12161a"/><path d="M100 91v-6M100 91l5.2 3M100 91l-5.2 3" stroke="#a9b1ba" stroke-width="2" stroke-linecap="round"/><circle cx="100" cy="91" r="7.6" fill="none"/></g>
<circle cx="100" cy="53" r="1.4" fill="#d7dce1"/><circle cx="100" cy="72" r="1.4" fill="#d7dce1"/><circle cx="100" cy="91" r="1.4" fill="#d7dce1"/>
<path d="M91 44h8l-8 14z" fill="#fff" opacity=".07"/>
<rect x="104" y="40.2" width="6" height="1.8" rx=".9" fill="#2a2f35"/>
<circle class="xa-pc-led" cx="94" cy="41" r="1.2"/>
<rect x="90" y="106.6" width="20" height="3" rx="1" fill="#2a2f35"/>
</g>
<rect x="10" y="114" width="62" height="7" rx="1.4" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".4"/>
<g class="xa-pc-keys" fill="#4b535c"><rect x="12" y="115.2" width="58" height="1.2" opacity=".9"/><rect x="12" y="117.2" width="58" height="1.2" opacity=".9"/><rect x="12" y="119.2" width="58" height="1.2" opacity=".9"/></g>
<path d="M12 116.4h58M12 118.4h58" stroke="#05070a" stroke-width=".4" stroke-dasharray="2.2 .8"/>
<ellipse cx="78" cy="117" rx="3.6" ry="3" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".4"/><path d="M78 114.2v2" stroke="#6f7780" stroke-width=".6"/>`);
  D["cooktop"] = () => sk(`<defs><radialGradient id="ID-shadow"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="ID-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2d31"/><stop offset="1" stop-color="#0d0e10"/></linearGradient><radialGradient id="ID-hot"><stop offset="0" stop-color="#ffb347"/><stop offset=".45" stop-color="#ff4a1f"/><stop offset="1" stop-color="#8a1205" stop-opacity=".25"/></radialGradient><linearGradient id="ID-pot" x1="0" x2="1"><stop offset="0" stop-color="#8d959e"/><stop offset=".3" stop-color="#f1f3f5"/><stop offset=".6" stop-color="#c3c9cf"/><stop offset="1" stop-color="#7d858e"/></linearGradient></defs>
<ellipse cx="60" cy="125" rx="50" ry="4" fill="url(#ID-shadow)"/>
<g transform="translate(-9 -24) scale(1.15)">
<path d="M12 122L108 122L97 60L23 60Z" fill="#8d959e"/>
<path d="M14 120L106 120L96 62L24 62Z" fill="url(#ID-glass)"/>
<g class="xa-hb-zone xa-hb-z1">
<ellipse cx="40" cy="99" rx="18" ry="9.7" fill="none" stroke="#5a6068" stroke-width=".5"/>
<ellipse class="xa-hb-zglow" cx="40" cy="99" rx="16" ry="8.5" fill="url(#ID-hot)"/>
<g class="xa-hb-coil" fill="none" stroke="#ff5a1f" stroke-width=".7">
<ellipse cx="40" cy="99" rx="13.1" ry="7.0"/><ellipse cx="40" cy="99" rx="9.3" ry="4.9"/><ellipse cx="40" cy="99" rx="5.4" ry="2.9"/></g>
<ellipse cx="40" cy="99" rx="16" ry="8.5" fill="none" stroke="#7d848c" stroke-width=".7" stroke-dasharray="2 1.4"/>
</g><g class="xa-hb-zone xa-hb-z2">
<ellipse cx="82" cy="99" rx="14" ry="7.7" fill="none" stroke="#5a6068" stroke-width=".5"/>
<ellipse class="xa-hb-zglow" cx="82" cy="99" rx="12" ry="6.5" fill="url(#ID-hot)"/>
<g class="xa-hb-coil" fill="none" stroke="#ff5a1f" stroke-width=".7">
<ellipse cx="82" cy="99" rx="9.8" ry="5.3"/><ellipse cx="82" cy="99" rx="7.0" ry="3.8"/><ellipse cx="82" cy="99" rx="4.1" ry="2.2"/></g>
<ellipse cx="82" cy="99" rx="12" ry="6.5" fill="none" stroke="#7d848c" stroke-width=".7" stroke-dasharray="2 1.4"/>
</g><g class="xa-hb-zone xa-hb-z3">
<ellipse cx="44" cy="73" rx="13" ry="6.4" fill="none" stroke="#5a6068" stroke-width=".5"/>
<ellipse class="xa-hb-zglow" cx="44" cy="73" rx="11" ry="5.2" fill="url(#ID-hot)"/>
<g class="xa-hb-coil" fill="none" stroke="#ff5a1f" stroke-width=".7">
<ellipse cx="44" cy="73" rx="9.0" ry="4.3"/><ellipse cx="44" cy="73" rx="6.4" ry="3.0"/><ellipse cx="44" cy="73" rx="3.7" ry="1.8"/></g>
<ellipse cx="44" cy="73" rx="11" ry="5.2" fill="none" stroke="#7d848c" stroke-width=".7" stroke-dasharray="2 1.4"/>
</g><g class="xa-hb-zone xa-hb-z4">
<ellipse cx="78" cy="73" rx="16" ry="7.7" fill="none" stroke="#5a6068" stroke-width=".5"/>
<ellipse class="xa-hb-zglow" cx="78" cy="73" rx="14" ry="6.5" fill="url(#ID-hot)"/>
<g class="xa-hb-coil" fill="none" stroke="#ff5a1f" stroke-width=".7">
<ellipse cx="78" cy="73" rx="11.5" ry="5.3"/><ellipse cx="78" cy="73" rx="8.1" ry="3.8"/><ellipse cx="78" cy="73" rx="4.8" ry="2.2"/></g>
<ellipse cx="78" cy="73" rx="14" ry="6.5" fill="none" stroke="#7d848c" stroke-width=".7" stroke-dasharray="2 1.4"/>
</g>
<path d="M30 63L58 63L22 118L16 118Z" fill="#fff" opacity=".05"/>
<path d="M18 109H102" stroke="#3b4047" stroke-width=".5"/>
<g class="xa-hb-digits">
<text class="xa-hb-zd xa-hb-zd1" x="28" y="116.5" text-anchor="middle">0</text>
<text class="xa-hb-zd xa-hb-zd3" x="44" y="116.5" text-anchor="middle">0</text>
<text class="xa-hb-zd xa-hb-zd4" x="76" y="116.5" text-anchor="middle">0</text>
<text class="xa-hb-zd xa-hb-zd2" x="92" y="116.5" text-anchor="middle">0</text>
</g>
<circle cx="60" cy="114.5" r="2.4" fill="none" stroke="#5a6068" stroke-width=".6"/><path d="M60 112.6v1.6" stroke="#5a6068" stroke-width=".6"/>
<path d="M51 114.5h3M66 114.5h3M67.5 113v3" stroke="#5a6068" stroke-width=".6"/>
<g class="xa-hb-pan">
<path d="M90 66L104 52" stroke="#2b2f34" stroke-width="2.6" stroke-linecap="round"/>
<ellipse cx="78" cy="71" rx="13" ry="6.2" fill="#2b2f34"/>
<ellipse cx="78" cy="70" rx="11.5" ry="5.2" fill="#3b4047"/>
<ellipse cx="76" cy="70" rx="5" ry="2.6" fill="#ffffff"/><ellipse cx="76.5" cy="69.8" rx="2" ry="1.2" fill="#f2b632"/>
<g class="xa-hb-sizzle"><path d="M68 64l-1-3M74 62l0-3M84 62l1-3M89 65l2-2"/></g>
</g>
<g class="xa-hb-pot">
<path d="M24 86l-10-2" stroke="#2b2f34" stroke-width="2.4" stroke-linecap="round"/>
<path d="M25 80V96Q25 101 40 101Q55 101 55 96V80Z" fill="url(#ID-pot)" stroke="#6f7781" stroke-width=".5"/>
<ellipse cx="40" cy="96.5" rx="15" ry="4.5" fill="none" stroke="#6f7781" stroke-width=".4" opacity=".6"/>
<g class="xa-hb-lid"><ellipse cx="40" cy="80" rx="15.5" ry="4.6" fill="#d7dce1" stroke="#7d858e" stroke-width=".6"/>
<ellipse cx="40" cy="79.4" rx="11" ry="3" fill="#eef1f4"/>
<rect x="37.5" y="75" width="5" height="3.4" rx="1.4" fill="#2b2f34"/></g>
<g class="xa-hb-steam-pot"><path d="M34 72q-3-5 0-10t0-10"/><path d="M41 70q-3-5 0-10t0-10"/><path d="M48 72q-3-5 0-10t0-10"/></g>
</g></g>`);
  D["laptop"] = () => sk(`<defs><linearGradient id="ID-gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient><radialGradient id="ID-shadow"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="ID-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3138"/><stop offset="1" stop-color="#101317"/></linearGradient><linearGradient id="ID-lpwall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a1a63"/><stop offset=".5" stop-color="#6b3fc9"/><stop offset="1" stop-color="#ff8fab"/></linearGradient><linearGradient id="ID-lpbody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e4e8ec"/><stop offset="1" stop-color="#bfc6cd"/></linearGradient><radialGradient id="ID-lpglow" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#7fdcff" stop-opacity=".55"/><stop offset="1" stop-color="#7fdcff" stop-opacity="0"/></radialGradient><clipPath id="ID-lpclip"><rect x="22" y="21" width="76" height="52" rx="1"/></clipPath></defs>
<ellipse cx="60" cy="116" rx="54" ry="4" fill="url(#ID-shadow)"/>
<rect x="16" y="14" width="88" height="64" rx="5" fill="url(#ID-dark)" stroke="#05070a" stroke-width=".6"/>
<rect x="22" y="21" width="76" height="52" rx="1" fill="#0a0d11"/>
<g class="xa-lp-screen" clip-path="url(#ID-lpclip)">
<rect x="22" y="21" width="76" height="52" fill="url(#ID-lpwall)"/>
<rect x="22" y="21" width="76" height="5" fill="#0b1020" opacity=".6"/>
<circle cx="26" cy="23.5" r="1" fill="#fff" opacity=".8"/><rect x="82" y="22.6" width="14" height="1.8" rx=".9" fill="#fff" opacity=".7"/>
<rect x="27" y="30" width="20" height="14" rx="2" fill="#fff" opacity=".9"/><rect x="50" y="30" width="20" height="14" rx="2" fill="#fff" opacity=".9"/><rect x="73" y="30" width="20" height="14" rx="2" fill="#fff" opacity=".9"/>
<circle cx="33" cy="37" r="3" fill="#ffb347"/><circle cx="56" cy="37" r="3" fill="#38d9ff"/><circle cx="79" cy="37" r="3" fill="#43c07a"/>
<rect x="38" y="35.4" width="7" height="1.6" rx=".8" fill="#4b535c"/><rect x="61" y="35.4" width="7" height="1.6" rx=".8" fill="#4b535c"/><rect x="84" y="35.4" width="7" height="1.6" rx=".8" fill="#4b535c"/>
<rect x="27" y="48" width="66" height="19" rx="2" fill="#0d1520" opacity=".88"/>
<path class="xa-lp-line" d="M30 62l8-4l7 3l8-8l8 5l8-7l8 3l8-6l6 2" fill="none" stroke="#38d9ff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M30 64h60" stroke="#3b4a63" stroke-width=".5"/>
<circle class="xa-lp-dot" cx="90" cy="53" r="1.6" fill="#fff"/>
</g>
<path d="M22 21h76l-26 52h-50z" fill="url(#ID-gloss)" opacity=".3"/>
<circle cx="60" cy="17.4" r=".9" fill="#2a2f35"/><circle class="xa-lp-cam" cx="60" cy="17.4" r=".45"/>
<path d="M14 78h92l8 30h-108z" fill="url(#ID-lpbody)" stroke="#9aa2ab" stroke-width=".6"/>
<path d="M14 78h92" stroke="#fff" stroke-width="1" opacity=".8"/>
<path d="M6 108h108v3q0 2.5-3 2.5h-102q-3 0-3-2.5z" fill="#aab2ba" stroke="#8f98a2" stroke-width=".5"/>
<path d="M48 108h24v1.6q-12 1.6-24 0z" fill="#8f98a2"/>
<path d="M18 81h84l5 20h-94z" fill="#151a1f" opacity=".85"/>
<g class="xa-lp-keys" fill="#cfd5db">
<path d="M20.6 83h8l-1.2 3h-8zM30.4 83h8l-.5 3h-8zM40.2 83h8l-.2 3h-8zM50 83h8v3h-8zM59.8 83h8v3h-8zM69.6 83h8l.2 3h-8zM79.4 83h8l.5 3h-8zM89.2 83h8l1.2 3h-8z"/>
<path d="M19.2 87.4h8.6l-1.2 3.2h-8.6zM29.4 87.4h8.6l-.6 3.2h-8.6zM39.6 87.4h8.6l-.2 3.2h-8.6zM49.8 87.4h8.6v3.2h-8.6zM60 87.4h8.6l.2 3.2h-8.6zM70.2 87.4h8.6l.6 3.2h-8.6zM80.4 87.4h8.6l1.2 3.2h-8.6zM90.6 87.4h6.4l1.4 3.2h-6.6z"/>
<path d="M17.8 92h9.2l-1.3 3.4h-9.2zM28.6 92h9.2l-.6 3.4h-9.2zM39.4 92h9.2l-.2 3.4h-9.2zM50.2 92h9.2v3.4h-9.2zM61 92h9.2l.2 3.4h-9.2zM71.8 92h9.2l.6 3.4h-9.2zM82.6 92h9.2l1.3 3.4h-9.2z"/>
</g>
<path d="M46 97h28l1 4h-30z" fill="#aab2ba" stroke="#8f98a2" stroke-width=".4"/>
<path d="M18 81h84l5 20h-94z" fill="url(#ID-lpglow)" class="xa-lp-glow"/>
<circle class="xa-lp-led" cx="60" cy="111" r="1.1"/>`);
  D["pellet-stove"] = () => sk(`<defs><linearGradient id="ID-chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbfcfd"/><stop offset=".3" stop-color="#a3abb4"/><stop offset=".55" stop-color="#eef1f4"/><stop offset=".8" stop-color="#8d959f"/><stop offset="1" stop-color="#c9ced4"/></linearGradient><radialGradient id="ID-shadow"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><clipPath id="ID-win"><rect x="34" y="46" width="52" height="50" rx="5"/></clipPath><linearGradient id="ID-blk" x1="0" x2="1"><stop offset="0" stop-color="#17191c"/><stop offset=".5" stop-color="#34383e"/><stop offset="1" stop-color="#141618"/></linearGradient><linearGradient id="ID-white" x1="0" x2="1"><stop offset="0" stop-color="#d9dde2"/><stop offset=".55" stop-color="#ffffff"/><stop offset="1" stop-color="#c9ced4"/></linearGradient><linearGradient id="ID-brick" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1712"/><stop offset="1" stop-color="#0f0706"/></linearGradient><radialGradient id="ID-glow" cx=".5" cy=".85" r=".85"><stop offset="0" stop-color="#ffd27a" stop-opacity=".95"/><stop offset=".45" stop-color="#ff7a1a" stop-opacity=".55"/><stop offset="1" stop-color="#3a0d00" stop-opacity="0"/></radialGradient><linearGradient id="ID-fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff3b0"/><stop offset=".3" stop-color="#ffc23d"/><stop offset=".68" stop-color="#ff7a1a"/><stop offset="1" stop-color="#e5381c" stop-opacity="0"/></linearGradient><linearGradient id="ID-core" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#fff0a0"/><stop offset="1" stop-color="#ffc23d" stop-opacity="0"/></linearGradient></defs>
<g transform="translate(-6.5 -4.5) scale(1.11)">
<ellipse cx="60" cy="134" rx="44" ry="4.5" fill="url(#ID-shadow)"/>
<g class="xa-ps-flue-smoke"><path d="M57 0q-4-5 0-10t0-10"/><path d="M63 -2q-4-5 0-10t0-10"/></g>
<rect x="53" y="3" width="14" height="11" fill="url(#ID-chrome)"/>
<rect x="51" y="1" width="18" height="4" rx="1.5" fill="url(#ID-chrome)" stroke="#7d858e" stroke-width=".4"/>
<rect x="28" y="124" width="9" height="7" rx="1.5" fill="#24272b"/><rect x="83" y="124" width="9" height="7" rx="1.5" fill="#24272b"/>
<rect x="22" y="14" width="76" height="113" rx="7" fill="url(#ID-blk)" stroke="#0b0c0e" stroke-width=".6"/>
<rect x="22" y="22" width="9.5" height="102" rx="3.5" fill="url(#ID-white)"/>
<rect x="88.5" y="22" width="9.5" height="102" rx="3.5" fill="url(#ID-white)"/>
<rect x="19" y="11" width="82" height="8" rx="3" fill="#2b2f34" stroke="#474c53" stroke-width=".6"/>
<rect x="40" y="12.4" width="40" height="5" rx="1.6" fill="#1b1d21" stroke="#555b63" stroke-width=".5"/>
<path d="M36 23.5h48M36 26h48M36 28.5h48" stroke="#0b0c0e" stroke-width="1.2"/>
<rect x="46" y="31.5" width="28" height="9" rx="1.5" fill="#0c1720" stroke="#8f98a2" stroke-width=".6"/>
<text class="xa-lcd" x="60" y="36.3" text-anchor="middle" dominant-baseline="central" fill="#7ec8e3">21°</text>
<circle cx="40" cy="36" r="2" fill="#3b4148" stroke="#5a616a" stroke-width=".4"/>
<circle class="xa-ps-led xa-ps-l1" cx="80" cy="36" r="1.5"/>
<rect x="31" y="43" width="58" height="56" rx="7" fill="#0f1113" stroke="#4a5058" stroke-width=".8"/>
<rect x="34" y="46" width="52" height="50" rx="5" fill="url(#ID-brick)"/>
<g clip-path="url(#ID-win)">
<path d="M34 56h52M34 66h52M34 76h52M46 46v10M62 46v10M78 46v10M40 56v10M56 56v10M72 56v10M48 66v10M64 66v10M80 66v10" stroke="#3d2219" stroke-width=".6" opacity=".9"/>
<rect class="xa-ps-glow" x="34" y="46" width="52" height="50" fill="url(#ID-glow)"/>
<g class="xa-ps-fire">
<path class="xa-ps-flame xa-ps-f2" d="M52.5 86C46.5 81 47.5 73 50 68C51.5 73 54 73.5 54 69C57.5 74.5 58.5 82 52.5 86Z" fill="url(#ID-fl)"/>
<path class="xa-ps-flame xa-ps-f3" d="M67.5 86C62 82 63 74 65.5 70C66.5 74.5 68.5 74.5 69.5 70C73.5 76.5 72.5 83 67.5 86Z" fill="url(#ID-fl)"/>
<path class="xa-ps-flame xa-ps-f1" d="M60 86C51 80 52.5 69 57 62C58 68.5 61 68.5 60.5 60C67.5 67 71 78 60 86Z" fill="url(#ID-fl)"/>
<path class="xa-ps-flame xa-ps-f5" d="M59.5 68C57.5 62 59.5 56 61.5 52C62.5 58 63.5 62.5 59.5 68Z" fill="url(#ID-fl)" opacity=".85"/>
<path class="xa-ps-flame xa-ps-f4" d="M60 86C56 83 56 77 58.5 72.5C59.5 76 61.5 76.5 62 73C64.5 78 64.5 83 60 86Z" fill="url(#ID-core)"/>
</g>
<g class="xa-ps-smoke-in"><path d="M55 82q-3-6 0-12t0-12"/><path d="M64 82q-3-6 0-12t0-12"/></g>
<path d="M45 92h30l-3.5-7h-23z" fill="#3a3f45" stroke="#5c636b" stroke-width=".5"/>
<g class="xa-ps-pellets" fill="#8a5a2b"><rect x="50" y="83.6" width="3" height="1.4" rx=".7"/><rect x="54" y="84.2" width="3" height="1.4" rx=".7" transform="rotate(20 55.5 85)"/><rect x="58" y="83.4" width="3" height="1.4" rx=".7"/><rect x="62" y="84" width="3" height="1.4" rx=".7" transform="rotate(-15 63.5 84.7)"/><rect x="66" y="83.6" width="3" height="1.4" rx=".7"/></g>
<g class="xa-ps-embers"><circle cx="51" cy="84.6" r=".9"/><circle cx="55.5" cy="85.2" r="1"/><circle cx="59.5" cy="84.4" r=".9"/><circle cx="63.5" cy="85" r="1"/><circle cx="67.5" cy="84.6" r=".9"/></g>
<circle class="xa-ps-igniter" cx="60" cy="88.5" r="1.8"/>
</g>
<path d="M36 60L50 46h8L36 70z" fill="#fff" opacity=".08"/>
<rect x="34" y="46" width="52" height="50" rx="5" fill="none" stroke="#000" stroke-opacity=".5"/>
<rect x="86.3" y="60" width="2.3" height="16" rx="1.1" fill="url(#ID-chrome)"/>
<rect x="34" y="104" width="52" height="12" rx="2" fill="#18191c" stroke="#3b4047" stroke-width=".6"/>
<rect x="52" y="108.5" width="16" height="3" rx="1.5" fill="#4a5058"/>
<path d="M36 120h48M36 122.5h48" stroke="#0b0c0e" stroke-width="1"/>
<g class="xa-ps-warm-air"><path d="M42 30q-2-3 0-6t0-6"/><path d="M54 30q-2-3 0-6t0-6"/><path d="M66 30q-2-3 0-6t0-6"/><path d="M78 30q-2-3 0-6t0-6"/></g>
</g>`);
  D["printer-3d"] = () => sk(`<defs><radialGradient id="ID-shadow"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><clipPath id="ID-obj"><rect x="40" y="89" width="40" height="15"/></clipPath><linearGradient id="ID-frame" x1="0" x2="1"><stop offset="0" stop-color="#2a2e33"/><stop offset=".5" stop-color="#4a5058"/><stop offset="1" stop-color="#23272b"/></linearGradient><linearGradient id="ID-alu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1f3f5"/><stop offset=".5" stop-color="#b9c0c7"/><stop offset="1" stop-color="#8d959e"/></linearGradient><linearGradient id="ID-pei" x1="0" x2="1"><stop offset="0" stop-color="#3a3326"/><stop offset=".5" stop-color="#6b5a3a"/><stop offset="1" stop-color="#3a3326"/></linearGradient><linearGradient id="ID-fil" x1="0" x2="1"><stop offset="0" stop-color="#ff8a1f" stop-opacity=".75"/><stop offset=".45" stop-color="#ff8a1f"/><stop offset="1" stop-color="#ff8a1f" stop-opacity=".7"/></linearGradient><pattern id="ID-layers" width="4" height="1.3" patternUnits="userSpaceOnUse"><rect width="4" height=".55" fill="#000" opacity=".18"/></pattern></defs>
<ellipse cx="60" cy="133" rx="50" ry="4.5" fill="url(#ID-shadow)"/>
<g class="xa-p3-spool">
<circle cx="97" cy="20" r="11" fill="#1f2226" stroke="#3b4047" stroke-width=".6"/>
<circle cx="97" cy="20" r="9" fill="#ff8a1f"/>
<circle cx="97" cy="20" r="9" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="2.6" stroke-dasharray=".8 1.2"/>
<circle cx="97" cy="20" r="4" fill="#2b2f34" stroke="#555b63" stroke-width=".6"/>
<circle cx="97" cy="20" r="1.6" fill="#8d959e"/>
<path d="M93 16.5l2 2M101 16.5l-2 2M93 23.5l2-2M101 23.5l-2-2" stroke="#555b63" stroke-width=".8"/>
</g>
<rect x="94" y="32" width="6" height="10" rx="1.5" fill="url(#ID-frame)"/>
<rect x="17" y="16" width="10" height="100" rx="2.5" fill="url(#ID-frame)"/>
<rect x="15.5" y="13" width="13" height="5" rx="2" fill="#33373d"/>
<rect x="20.8" y="20" width="2.4" height="92" rx="1.2" fill="url(#ID-alu)" opacity=".85"/>
<rect x="10" y="112" width="100" height="16" rx="4" fill="url(#ID-frame)" stroke="#16181b" stroke-width=".6"/>
<rect x="12" y="113" width="96" height="1.6" rx=".8" fill="#fff" opacity=".12"/>
<rect x="78" y="116" width="26" height="9" rx="1.5" fill="#0c1720" stroke="#8f98a2" stroke-width=".6"/>
<text class="xa-lcd" x="91" y="120.8" text-anchor="middle" dominant-baseline="central" fill="#7ec8e3">38%</text>
<circle class="xa-p3-led xa-p3-l1" cx="72" cy="120.5" r="1.4"/>
<rect x="32" y="108" width="56" height="4" rx="1" fill="#5d646c"/>
<g class="xa-p3-bedheat"><path d="M40 101q-2-3 0-6t0-6"/><path d="M54 101q-2-3 0-6t0-6"/><path d="M66 101q-2-3 0-6t0-6"/><path d="M80 101q-2-3 0-6t0-6"/></g>
<rect x="30" y="104" width="60" height="4.5" rx="1" fill="url(#ID-pei)" stroke="#1c1a15" stroke-width=".5"/>
<g clip-path="url(#ID-obj)"><g class="xa-p3-object">
<path d="M49 104C47 96 45 88 48 80C50 74 52 70 52 66H68C68 70 70 74 72 80C75 88 73 96 71 104Z" fill="url(#ID-fil)"/>
<path d="M49 104C47 96 45 88 48 80C50 74 52 70 52 66H68C68 70 70 74 72 80C75 88 73 96 71 104Z" fill="url(#ID-layers)"/>
<path d="M53 101C52 94 51 88 53 82" stroke="#fff" stroke-opacity=".35" stroke-width="1.4" fill="none" stroke-linecap="round"/>
</g></g>
<g class="xa-p3-gantry" transform="translate(0 -14)">
<rect x="22" y="82" width="76" height="5" rx="1.5" fill="url(#ID-alu)" stroke="#7d858e" stroke-width=".4"/>
<rect x="94" y="80" width="6" height="9" rx="1.5" fill="url(#ID-frame)"/>
<g class="xa-p3-head">
<rect x="51" y="78" width="18" height="21" rx="3" fill="#ececec" stroke="#a7afb7" stroke-width=".6"/>
<rect x="51" y="78" width="18" height="5" rx="2" fill="#2b2f34"/>
<circle cx="60" cy="90" r="4.2" fill="#2b2f34"/>
<g class="xa-p3-hfan"><path d="M60 90l0-3.4M60 90l2.9 1.7M60 90l-2.9 1.7" stroke="#8d959e" stroke-width="1.3" stroke-linecap="round"/></g>
<path d="M57.5 99h5l-1.6 4h-1.8z" fill="#c9a43a" stroke="#8a6d1f" stroke-width=".4"/>
<path d="M69 81q12-4 25-30" fill="none" stroke="#e9ecef" stroke-opacity=".75" stroke-width="1.6" stroke-linecap="round"/>
<circle class="xa-p3-tip" cx="60" cy="103.4" r="1.2"/>
<rect class="xa-p3-filpath" x="59.2" y="70" width="1.6" height="8" fill="#ff8a1f"/>
</g>
</g>`);
  D["radiator"] = () => sk(`<defs><clipPath id="ID-fins"><path d="M12.0 27H23.4V100Q23.4 104 20.4 104H15.0Q12.0 104 12.0 100Z"/><path d="M24.8 27H36.2V100Q36.2 104 33.2 104H27.8Q24.8 104 24.8 100Z"/><path d="M37.6 27H49.0V100Q49.0 104 46.0 104H40.6Q37.6 104 37.6 100Z"/><path d="M50.4 27H61.8V100Q61.8 104 58.8 104H53.4Q50.4 104 50.4 100Z"/><path d="M63.2 27H74.6V100Q74.6 104 71.6 104H66.2Q63.2 104 63.2 100Z"/><path d="M76.0 27H87.4V100Q87.4 104 84.4 104H79.0Q76.0 104 76.0 100Z"/></clipPath><linearGradient id="ID-fin" x1="0" x2="1"><stop offset="0" stop-color="#e3e6e9"/><stop offset=".25" stop-color="#ffffff"/><stop offset=".85" stop-color="#f6f7f8"/><stop offset="1" stop-color="#d9dde1"/></linearGradient><linearGradient id="ID-side" x1="0" x2="1"><stop offset="0" stop-color="#e7eaed"/><stop offset="1" stop-color="#cdd2d7"/></linearGradient><linearGradient id="ID-heatglow" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff8a3d" stop-opacity=".15"/><stop offset="1" stop-color="#ff5a1f" stop-opacity=".9"/></linearGradient><linearGradient id="ID-box" x1="0" x2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e2e5e8"/></linearGradient></defs>
<g class="xa-rd-rwaves"><path d="M22 18q-3-5 0-10t0-10"/><path d="M38 16q-3-5 0-10t0-10"/><path d="M54 18q-3-5 0-10t0-10"/><path d="M70 16q-3-5 0-10t0-10"/></g>
<g class="xa-rd-cold-air"><path d="M-6 50q6-3 12 0t12 0"/><path d="M-8 66q6-3 12 0t12 0"/><path d="M-6 82q6-3 12 0t12 0"/></g>
<path d="M16 30H95.4V108H16Z" fill="#000" opacity=".07"/>
<path d="M87.4 27L91.4 23V100L87.4 104Z" fill="url(#ID-side)" stroke="#c9ced4" stroke-width=".4"/>
<circle cx="89.4" cy="31" r="1.6" fill="#e9ecef" stroke="#aeb5bc" stroke-width=".5"/>
<path d="M12.0 27L15.5 23H26.9L23.4 27Z" fill="#eef0f2" stroke="#cfd4d9" stroke-width=".4"/><rect x="15.0" y="24" width="8.4" height="1.6" rx=".8" fill="#c3c9cf"/><path d="M24.8 27L28.3 23H39.7L36.2 27Z" fill="#eef0f2" stroke="#cfd4d9" stroke-width=".4"/><rect x="27.8" y="24" width="8.4" height="1.6" rx=".8" fill="#c3c9cf"/><path d="M37.6 27L41.1 23H52.5L49.0 27Z" fill="#eef0f2" stroke="#cfd4d9" stroke-width=".4"/><rect x="40.6" y="24" width="8.4" height="1.6" rx=".8" fill="#c3c9cf"/><path d="M50.4 27L53.9 23H65.3L61.8 27Z" fill="#eef0f2" stroke="#cfd4d9" stroke-width=".4"/><rect x="53.4" y="24" width="8.4" height="1.6" rx=".8" fill="#c3c9cf"/><path d="M63.2 27L66.7 23H78.1L74.6 27Z" fill="#eef0f2" stroke="#cfd4d9" stroke-width=".4"/><rect x="66.2" y="24" width="8.4" height="1.6" rx=".8" fill="#c3c9cf"/><path d="M76.0 27L79.5 23H90.9L87.4 27Z" fill="#eef0f2" stroke="#cfd4d9" stroke-width=".4"/><rect x="79.0" y="24" width="8.4" height="1.6" rx=".8" fill="#c3c9cf"/>
<path d="M12.0 27H23.4V100Q23.4 104 20.4 104H15.0Q12.0 104 12.0 100Z" fill="url(#ID-fin)" stroke="#d2d6da" stroke-width=".4"/><path d="M24.8 27H36.2V100Q36.2 104 33.2 104H27.8Q24.8 104 24.8 100Z" fill="url(#ID-fin)" stroke="#d2d6da" stroke-width=".4"/><path d="M37.6 27H49.0V100Q49.0 104 46.0 104H40.6Q37.6 104 37.6 100Z" fill="url(#ID-fin)" stroke="#d2d6da" stroke-width=".4"/><path d="M50.4 27H61.8V100Q61.8 104 58.8 104H53.4Q50.4 104 50.4 100Z" fill="url(#ID-fin)" stroke="#d2d6da" stroke-width=".4"/><path d="M63.2 27H74.6V100Q74.6 104 71.6 104H66.2Q63.2 104 63.2 100Z" fill="url(#ID-fin)" stroke="#d2d6da" stroke-width=".4"/><path d="M76.0 27H87.4V100Q87.4 104 84.4 104H79.0Q76.0 104 76.0 100Z" fill="url(#ID-fin)" stroke="#d2d6da" stroke-width=".4"/>
<g clip-path="url(#ID-fins)"><rect class="xa-rd-rglow" x="10" y="26" width="87.4" height="80" fill="url(#ID-heatglow)"/></g>
<path d="M82.4 84h18q2 0 2 2v16q0 3-3 6l-3 10h-10q-2 0-2-2V86q0-2 2-2z" fill="url(#ID-box)" stroke="#bfc6ce" stroke-width=".6"/>
<rect x="84.8" y="86.5" width="15" height="8" rx="1.5" fill="#0c1720" stroke="#8f98a2" stroke-width=".6"/>
<text class="xa-lcd" x="92.3" y="90.8" text-anchor="middle" dominant-baseline="central" fill="#7ec8e3">20°</text>
<g class="xa-rd-micon xa-rd-m-comfort" transform="translate(87.4 97.3) scale(.48)"><circle r="2.2"/><path d="M0-4.2v1.1M0 3.1v1.1M-4.2 0h1.1M3.1 0h1.1M-3 -3l.8.8M2.2 2.2l.8.8M-3 3l.8-.8M2.2-2.2l.8-.8" stroke-width=".9" stroke-linecap="round"/></g>
<g class="xa-rd-micon xa-rd-m-eco" transform="translate(92.4 97.3) scale(.48)"><path d="M1.6-3a3.4 3.4 0 1 0 1.8 5.6a2.8 2.8 0 0 1-1.8-5.6z"/></g>
<g class="xa-rd-micon xa-rd-m-frost" transform="translate(97.4 97.3) scale(.48)"><path d="M0-3.4v6.8M-3 -1.7l6 3.4M-3 1.7l6-3.4" stroke-width="1.1" stroke-linecap="round"/></g>
<g fill="#eef0f2" stroke="#a7aeb5" stroke-width=".4"><circle cx="86.8" cy="102.5" r="1.4"/><circle cx="91.8" cy="102.5" r="1.4"/><circle cx="96.8" cy="102.5" r="1.4"/><circle cx="89.3" cy="106.5" r="1.4"/><circle cx="94.3" cy="106.5" r="1.4"/></g>
<circle class="xa-rd-led xa-rd-l1" cx="96.8" cy="106.5" r=".8"/>`);
  D["server-rack"] = () => sk(`<defs><linearGradient id="ID-panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3f5f7"/><stop offset="1" stop-color="#d9dee3"/></linearGradient><radialGradient id="ID-shadow"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><pattern id="ID-mesh" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r=".55" fill="#000" opacity=".45"/></pattern><linearGradient id="ID-rkframe" x1="0" x2="1"><stop offset="0" stop-color="#2a2f35"/><stop offset=".5" stop-color="#14171b"/><stop offset="1" stop-color="#262b31"/></linearGradient><linearGradient id="ID-rkunit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b424a"/><stop offset=".15" stop-color="#262b31"/><stop offset="1" stop-color="#16191d"/></linearGradient><linearGradient id="ID-rkblue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b9cff" stop-opacity=".5"/><stop offset="1" stop-color="#3b9cff" stop-opacity="0"/></linearGradient></defs>
<ellipse cx="60" cy="135" rx="50" ry="3.5" fill="url(#ID-shadow)"/>
<rect x="16" y="4" width="88" height="126" rx="3" fill="url(#ID-rkframe)" stroke="#4a525a" stroke-width=".8"/>
<rect x="22" y="10" width="76" height="114" fill="#07090b"/>
<path d="M19 12v110M101 12v110" stroke="#556068" stroke-width=".6" stroke-dasharray="1.2 4.2"/>
<g class="xa-rk-glow"><rect x="22" y="92" width="76" height="30" fill="url(#ID-rkblue)"/></g>
<rect x="24" y="12" width="72" height="7" rx="1" fill="url(#ID-rkunit)" stroke="#59616b" stroke-width=".4"/>
<circle class="xa-rk-led xa-rk-g" cx="30" cy="15.5" r="1"/><circle class="xa-rk-led xa-rk-r" cx="35" cy="15.5" r="1"/>
<path d="M44 14h4M50 14h4M56 14h4M62 14h4M68 14h4M74 14h4M80 14h4M86 14h4" stroke="#7d858e" stroke-width="1.4"/>
<path d="M44 17.2h46" stroke="#59616b" stroke-width=".5"/>
<rect x="24" y="30" width="72" height="1" fill="#2b3138"/>
<rect x="46" y="22" width="28" height="8" rx="1.6" fill="#d7dce1" stroke="#9aa2ab" stroke-width=".4"/>
<circle class="xa-rk-led xa-rk-g" cx="52" cy="26" r="1"/><circle class="xa-rk-led xa-rk-g" cx="57" cy="26" r="1" style="animation-delay:.4s"/><circle class="xa-rk-led xa-rk-b" cx="62" cy="26" r="1" style="animation-delay:.9s"/>
<rect x="24" y="32" width="72" height="14" rx="1" fill="url(#ID-rkunit)" stroke="#59616b" stroke-width=".4"/>
<rect x="26" y="33.6" width="24" height="3.2" rx=".8" fill="#e9ecef"/>
<path d="M30 40h40M30 42.4h40M30 44.8h40" stroke="#080a0d" stroke-width="1.2" stroke-linecap="round" opacity=".9"/>
<circle class="xa-rk-led xa-rk-g" cx="84" cy="36.5" r="1"/><circle class="xa-rk-led xa-rk-g" cx="89" cy="36.5" r="1" style="animation-delay:.6s"/>
<g class="xa-rk-fan"><circle cx="80" cy="42" r="3.2" fill="#0b0d10"/><path d="M80 42v-3M80 42l2.6 1.5M80 42l-2.6 1.5" stroke="#8d959f" stroke-width="1" stroke-linecap="round"/><circle cx="80" cy="42" r="3.2" fill="none"/></g>
<rect x="24" y="48" width="72" height="7" rx="1" fill="#dfe3e7" stroke="#9aa2ab" stroke-width=".4"/>
<path d="M27 50h3v3h-3zM32 50h3v3h-3zM37 50h3v3h-3zM42 50h3v3h-3zM47 50h3v3h-3zM52 50h3v3h-3zM57 50h3v3h-3zM62 50h3v3h-3zM67 50h3v3h-3zM72 50h3v3h-3zM77 50h3v3h-3zM82 50h3v3h-3z" fill="#2b3138"/>
<path d="M28.5 53v4M33.5 53v5M38.5 53v4M43.5 53v6M48.5 53v4" stroke="#f4f6f8" stroke-width="1.4" stroke-linecap="round"/>
<rect x="24" y="57" width="72" height="9" rx="1" fill="url(#ID-rkunit)" stroke="#59616b" stroke-width=".4"/>
<text x="29" y="63.4" font-family="Arial,sans-serif" font-size="3.6" font-weight="700" fill="#e04b3c">APC</text>
<rect x="60" y="58.4" width="30" height="6.4" rx="1.2" fill="#0c1720" stroke="#8f98a2" stroke-width=".4"/>
<text class="xa-lcd" x="75" y="63.6" text-anchor="middle">42%</text>
<rect x="24" y="68" width="72" height="8" rx="1" fill="url(#ID-panel)" stroke="#9aa2ab" stroke-width=".4"/>
<rect x="27" y="70" width="40" height="4" rx=".8" fill="#2b3138"/>
<circle class="xa-rk-led xa-rk-g" cx="30" cy="72" r=".9"/><circle class="xa-rk-led xa-rk-g" cx="34" cy="72" r=".9" style="animation-delay:.2s"/><circle class="xa-rk-led xa-rk-g" cx="38" cy="72" r=".9" style="animation-delay:.7s"/>
<circle class="xa-rk-led xa-rk-g" cx="42" cy="72" r=".9" style="animation-delay:.4s"/><circle class="xa-rk-led xa-rk-g" cx="46" cy="72" r=".9" style="animation-delay:1s"/><circle class="xa-rk-led xa-rk-g" cx="50" cy="72" r=".9" style="animation-delay:.1s"/>
<circle class="xa-rk-led xa-rk-g" cx="54" cy="72" r=".9" style="animation-delay:.8s"/><circle class="xa-rk-led xa-rk-g" cx="58" cy="72" r=".9" style="animation-delay:.5s"/><circle class="xa-rk-led xa-rk-g" cx="62" cy="72" r=".9" style="animation-delay:1.2s"/>
<path d="M72 72h20" stroke="#7d858e" stroke-width="2" stroke-linecap="round"/>
<rect x="24" y="78" width="72" height="14" rx="1" fill="url(#ID-rkunit)" stroke="#59616b" stroke-width=".4"/>
<rect x="26" y="80" width="30" height="10" rx="1" fill="#0b0d10"/>
<g class="xa-rk-fan"><circle cx="34" cy="85" r="4" fill="#15181c"/><path d="M34 85v-3.6M34 85l3.1 1.8M34 85l-3.1 1.8" stroke="#a9b1ba" stroke-width="1.3" stroke-linecap="round"/><circle cx="34" cy="85" r="4" fill="none"/></g>
<g class="xa-rk-fan"><circle cx="48" cy="85" r="4" fill="#15181c"/><path d="M48 85v-3.6M48 85l3.1 1.8M48 85l-3.1 1.8" stroke="#a9b1ba" stroke-width="1.3" stroke-linecap="round"/><circle cx="48" cy="85" r="4" fill="none"/></g>
<rect x="26" y="80" width="30" height="10" fill="url(#ID-mesh)" opacity=".5"/>
<circle class="xa-rk-led xa-rk-g" cx="84" cy="82" r="1"/><circle class="xa-rk-led xa-rk-b" cx="89" cy="82" r="1" style="animation-delay:.7s"/>
<path d="M62 85h14M62 88h14" stroke="#4a525a" stroke-width=".8"/>
<rect x="24" y="94" width="72" height="26" rx="1.5" fill="url(#ID-rkunit)" stroke="#59616b" stroke-width=".4"/>
<g fill="#0a0c0f" stroke="#4a525a" stroke-width=".5">
<rect x="27" y="97" width="12" height="9" rx=".8"/><rect x="41" y="97" width="12" height="9" rx=".8"/><rect x="55" y="97" width="12" height="9" rx=".8"/><rect x="69" y="97" width="12" height="9" rx=".8"/>
<rect x="27" y="108" width="12" height="9" rx=".8"/><rect x="41" y="108" width="12" height="9" rx=".8"/><rect x="55" y="108" width="12" height="9" rx=".8"/><rect x="69" y="108" width="12" height="9" rx=".8"/>
</g>
<g class="xa-rk-hdd">
<rect class="xa-rk-led xa-rk-b" x="29" y="103.6" width="8" height="1.4"/><rect class="xa-rk-led xa-rk-b" x="43" y="103.6" width="8" height="1.4" style="animation-delay:.5s"/>
<rect class="xa-rk-led xa-rk-b" x="57" y="103.6" width="8" height="1.4" style="animation-delay:1.1s"/><rect class="xa-rk-led xa-rk-b" x="71" y="103.6" width="8" height="1.4" style="animation-delay:.3s"/>
<rect class="xa-rk-led xa-rk-b" x="29" y="114.6" width="8" height="1.4" style="animation-delay:.9s"/><rect class="xa-rk-led xa-rk-b" x="43" y="114.6" width="8" height="1.4" style="animation-delay:.2s"/>
<rect class="xa-rk-led xa-rk-b" x="57" y="114.6" width="8" height="1.4" style="animation-delay:.7s"/><rect class="xa-rk-led xa-rk-b" x="71" y="114.6" width="8" height="1.4" style="animation-delay:1.3s"/>
</g>
<rect x="85" y="97" width="9" height="20" rx="1" fill="#15181c" stroke="#4a525a" stroke-width=".4"/>
<circle class="xa-rk-led xa-rk-g" cx="89.5" cy="102" r="1"/><circle class="xa-rk-led xa-rk-b" cx="89.5" cy="107" r="1" style="animation-delay:.6s"/>
<g class="xa-rk-cables" fill="none" stroke-linecap="round">
<path d="M27 54q-9 2 -6 10t6 10" stroke="#2dd4bf" stroke-width="1.3"/><path d="M29 54q-12 4 -8 14t8 8" stroke="#f5d90a" stroke-width="1.3"/>
<path d="M93 54q9 2 6 10t-6 10" stroke="#2dd4bf" stroke-width="1.3"/>
</g>
<g class="xa-rk-flow">${chase([[27,54],[24.9,54.6],[23.3,55.4],[21.9,56.3],[21,57.5],[20.4,58.8],[20.3,60.4],[20.4,62.1],[21,64],[21.8,65.9],[22.5,67.6],[23.3,69.2],[24,70.5],[24.8,71.7],[25.5,72.6],[26.3,73.4],[27,74]], 8, 0.8, "#ffffff", 1.3)}${chase([[29,54],[26.3,55.1],[24,56.4],[22.3,57.8],[21,59.5],[20.3,61.3],[20,63.4],[20.3,65.6],[21,68],[22,70.3],[23,72.3],[24,73.8],[25,75],[26,75.8],[27,76.3],[28,76.3],[29,76]], 9, 0.8, "#ffffff", 1.3)}${chase([[93,54],[95.1,54.6],[96.8,55.4],[98.1,56.3],[99,57.5],[99.6,58.8],[99.8,60.4],[99.6,62.1],[99,64],[98.3,65.9],[97.5,67.6],[96.8,69.2],[96,70.5],[95.3,71.7],[94.5,72.6],[93.8,73.4],[93,74]], 8, 0.8, "#ffffff", 1.3)}</g>
<rect x="22" y="121" width="76" height="3" fill="#1c2024"/>
<path d="M18 130v4M102 130v4" stroke="#14171b" stroke-width="4" stroke-linecap="round"/>
<path d="M20 6h80" stroke="#fff" stroke-opacity=".25" stroke-width="1"/>`);
  D["tool-charger"] = () => sk(`<defs><radialGradient id="ID-shadow"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="ID-tcfront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#30363d"/><stop offset="1" stop-color="#15191d"/></linearGradient><linearGradient id="ID-tcside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22272c"/><stop offset="1" stop-color="#0d1013"/></linearGradient><linearGradient id="ID-tctop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a4148"/><stop offset="1" stop-color="#1c2126"/></linearGradient><radialGradient id="ID-tcglow"><stop offset="0" stop-color="#43e08a" stop-opacity=".55"/><stop offset="1" stop-color="#43e08a" stop-opacity="0"/></radialGradient></defs>
<ellipse cx="62" cy="124" rx="54" ry="5" fill="url(#ID-shadow)"/>
<path class="xa-tc-cable" d="M14 96 C4 95, 2 84, 9 80 C16 76, 22 84, 15 89 C8 94, 3 104, 9 110 C14 115, 6 120, 2 118" fill="none" stroke="#14171a" stroke-width="2.6" stroke-linecap="round"/>
<g class="xa-tc-flow">${chase([[2,118],[3.3,118.4],[4.7,118.4],[6.2,118.1],[7.6,117.5],[8.9,116.6],[9.8,115.6],[10.4,114.3],[10.6,112.9],[10.1,111.5],[9,110],[7.5,108.1],[6.6,106],[6.3,103.8],[6.5,101.5],[7.1,99.1],[8.1,96.8],[9.5,94.6],[11.1,92.5],[13,90.6],[15,89],[16.7,87.4],[17.7,85.8],[18.1,84.1],[17.9,82.5],[17.3,81.1],[16.2,80],[14.7,79.2],[13,78.9],[11.1,79.1],[9,80],[7.2,81.4],[5.9,83.1],[5.1,85],[4.9,87.1],[5.1,89.1],[5.9,91.1],[7.2,92.9],[9,94.3],[11.2,95.4],[14,96]], 14, 0.9, "#43e08a", 1.1)}</g>
<path d="M10 88 L76 105 L76 122 L10 105 Z" fill="url(#ID-tcfront)" stroke="#05070a" stroke-width=".5"/>
<path d="M76 105 L114 88 L114 104 L76 122 Z" fill="url(#ID-tcside)" stroke="#05070a" stroke-width=".5"/>
<path d="M10 88 L48 72 L114 88 L76 105 Z" fill="url(#ID-tctop)" stroke="#05070a" stroke-width=".5"/>
<path d="M10 88 L76 105 L114 88" fill="none" stroke="#5b636c" stroke-width=".6" opacity=".7"/>
<g stroke="#05070a" stroke-width="1.1" stroke-linecap="round"><path d="M88 101v9"/><path d="M92 99.2v9"/><path d="M96 97.4v9"/><path d="M100 95.6v9"/><path d="M104 93.8v9"/><path d="M108 92v9"/></g>
<path d="M15.5 95.2l1.6 -2.8l1.6 2.8z" fill="none" stroke="#8b939c" stroke-width=".45"/>
<circle class="xa-tc-err" cx="17.1" cy="98.6" r="1.05"/>
<rect x="15.6" y="101.4" width="3" height="1.7" rx=".3" fill="none" stroke="#8b939c" stroke-width=".45"/>
<circle class="xa-tc-led" cx="17.1" cy="105.4" r="1.15"/>
<ellipse class="xa-tc-glow" cx="62" cy="86" rx="44" ry="12" fill="url(#ID-tcglow)"/>
<path d="M22.0 50.0L68.0 62.0L68.0 92.0L22.0 80.0Z" fill="url(#ID-tcfront)" stroke="#05070a" stroke-width=".5"/>
<path d="M68.0 62.0L98.0 49.0L98.0 77.0L68.0 92.0Z" fill="url(#ID-tcside)" stroke="#05070a" stroke-width=".5"/>
<path d="M22.0 50.0L52.0 37.0L98.0 49.0L68.0 62.0Z" fill="url(#ID-tctop)" stroke="#05070a" stroke-width=".5"/>
<path d="M31.1 48.6L69.7 58.7M35.9 46.5L74.5 56.6M40.7 44.5L79.3 54.5M45.5 42.4L84.1 52.5M50.3 40.3L88.9 50.4M36.5 51.7L60.5 41.3M48.0 54.7L72.0 44.3M59.5 57.7L83.5 47.3" stroke="#0b0d10" stroke-width="2.2" stroke-linecap="round"/>
<path d="M31.1 48.6L69.7 58.7M35.9 46.5L74.5 56.6M40.7 44.5L79.3 54.5M45.5 42.4L84.1 52.5M50.3 40.3L88.9 50.4M36.5 51.7L60.5 41.3M48.0 54.7L72.0 44.3M59.5 57.7L83.5 47.3" stroke="#4a525a" stroke-width=".5" stroke-linecap="round" transform="translate(-.5 -.6)"/>
<path d="M22.0 74.0L68.0 86.0" stroke="#05070a" stroke-width=".8"/>
<path d="M22.0 50.0L68.0 62.0L98.0 49.0" fill="none" stroke="#6a737c" stroke-width=".6" opacity=".7"/>
<g transform="translate(26.6 63.2) skewY(14.6)">
<rect x="0" y="0" width="18" height="7" rx="3.5" fill="#e9ecef"/>
<rect x="0" y="0" width="7" height="7" rx="3.5" fill="#d63a2f"/>
<path d="M4.2 1.2l-1.8 2.8h1.4l-.8 2l2.2 -3h-1.4z" fill="#fff"/>
<text x="12.5" y="5.4" text-anchor="middle" font-size="4.6" font-weight="700" fill="#1b1f24" font-family="Arial, sans-serif">18V</text>
</g>
<g class="xa-tc-gauge"><path class="xa-tc-g xa-tc-g1" d="M45.9 61.2L49.1 62.1L49.1 64.7L45.9 63.8z"/><path class="xa-tc-g xa-tc-g2" d="M50.5 62.4L53.7 63.3L53.7 65.9L50.5 65.0z"/><path class="xa-tc-g xa-tc-g3" d="M55.1 63.6L58.3 64.5L58.3 67.1L55.1 66.2z"/><path class="xa-tc-g xa-tc-g4" d="M59.7 64.8L62.9 65.7L62.9 68.3L59.7 67.4z"/></g>
<path class="xa-tc-bolt" d="M61.6 74.3l-2.6 4.6h2.2l-1.4 4.2l4 -5.6h-2.3l1.6 -3.2z"/>`);
  D["towel-dryer"] = () => sk(`<defs><linearGradient id="ID-body" x1="0" x2="1"><stop offset="0" stop-color="#eef1f4"/><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#d4d9df"/></linearGradient><radialGradient id="ID-shadow"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="ID-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3138"/><stop offset="1" stop-color="#101317"/></linearGradient><linearGradient id="ID-tdglow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb877"/><stop offset="1" stop-color="#ff6a1f"/></linearGradient><linearGradient id="ID-tdtowel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f9fb3"/><stop offset=".5" stop-color="#58c3d4"/><stop offset="1" stop-color="#2a8ea1"/></linearGradient><linearGradient id="ID-tdwall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a828b" stop-opacity=".16"/><stop offset="1" stop-color="#7a828b" stop-opacity="0"/></linearGradient></defs>
<rect x="14" y="10" width="92" height="116" rx="6" fill="url(#ID-tdwall)"/>
<g class="xa-td-heat"><path d="M44 112q-4-20 2-44t-2-44"/><path d="M60 112q4-20-2-44t2-44"/><path d="M76 112q-4-20 2-44t-2-44"/></g>
<rect x="22" y="16" width="9" height="106" rx="4.5" fill="#000" opacity=".12"/>
<rect x="89" y="16" width="9" height="106" rx="4.5" fill="#000" opacity=".12"/>
<path d="M44 55h32v22h-32z" fill="#237a8b"/>
<g class="xa-td-bars">
<rect x="29" y="22" width="62" height="5" rx="2.5" fill="url(#ID-body)" stroke="#aeb6be" stroke-width=".5"/>
<rect x="29" y="38" width="62" height="5" rx="2.5" fill="url(#ID-body)" stroke="#aeb6be" stroke-width=".5"/>
<rect x="29" y="54" width="62" height="5" rx="2.5" fill="url(#ID-body)" stroke="#aeb6be" stroke-width=".5"/>
<rect x="29" y="70" width="62" height="5" rx="2.5" fill="url(#ID-body)" stroke="#aeb6be" stroke-width=".5"/>
<rect x="29" y="86" width="62" height="5" rx="2.5" fill="url(#ID-body)" stroke="#aeb6be" stroke-width=".5"/>
<rect x="29" y="102" width="62" height="5" rx="2.5" fill="url(#ID-body)" stroke="#aeb6be" stroke-width=".5"/>
</g>
<g class="xa-td-glow" fill="url(#ID-tdglow)">
<rect x="29" y="22" width="62" height="5" rx="2.5"/><rect x="29" y="38" width="62" height="5" rx="2.5"/><rect x="29" y="54" width="62" height="5" rx="2.5"/>
<rect x="29" y="70" width="62" height="5" rx="2.5"/><rect x="29" y="86" width="62" height="5" rx="2.5"/><rect x="29" y="102" width="62" height="5" rx="2.5"/>
<rect x="20" y="14" width="9" height="106" rx="4.5"/><rect x="91" y="14" width="9" height="106" rx="4.5"/>
</g>
<path d="M29 23.2h62M29 39.2h62M29 55.2h62M29 71.2h62M29 87.2h62M29 103.2h62" stroke="#fff" stroke-opacity=".85" stroke-width="1"/>
<rect x="20" y="14" width="9" height="106" rx="4.5" fill="url(#ID-body)" stroke="#aeb6be" stroke-width=".6"/>
<rect x="91" y="14" width="9" height="106" rx="4.5" fill="url(#ID-body)" stroke="#aeb6be" stroke-width=".6"/>
<path d="M22.5 18v98M93.5 18v98" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".9"/>
<g class="xa-td-glow xa-td-glow2" fill="url(#ID-tdglow)"><rect x="20" y="14" width="9" height="106" rx="4.5"/><rect x="91" y="14" width="9" height="106" rx="4.5"/></g>
<g class="xa-td-towel">
<path d="M42 56h36v30q-3 3-6 0q-3 3-6 0q-3 3-6 0q-3 3-6 0q-3 3-6 0q-3 3-3 0z" fill="url(#ID-tdtowel)"/>
<path d="M42 80h36v3h-36z" fill="#e8f7fa" opacity=".9"/>
<path d="M42 56h36v3h-36z" fill="#1f7384" opacity=".5"/>
<path d="M50 59v20M60 59v20M70 59v20" stroke="#1f7384" stroke-opacity=".25" stroke-width="1"/>
</g>
<g class="xa-td-towel xa-td-towel2">
<path d="M63 88h20v12q-3 2-5 0q-3 2-5 0q-3 2-5 0q-3 2-5 0z" fill="#f2a6b8"/>
<path d="M63 96h20v2h-20z" fill="#fff" opacity=".7"/>
</g>
<g class="xa-td-steam"><path d="M48 52q-3-4 0-8t0-8"/><path d="M60 50q-3-4 0-8t0-8"/><path d="M72 52q-3-4 0-8t0-8"/></g>
<rect x="18" y="120" width="13" height="5" rx="1.5" fill="#3a3f45"/><rect x="89" y="120" width="13" height="5" rx="1.5" fill="#3a3f45"/>
<rect x="70" y="108" width="36" height="14" rx="3" fill="url(#ID-dark)" stroke="#8f98a2" stroke-width=".6"/>
<rect x="74" y="110" width="22" height="10" rx="1.5" fill="#0c1720" stroke="#8f98a2" stroke-width=".6"/>
<text class="xa-lcd" x="85" y="115.3" text-anchor="middle" dominant-baseline="central" fill="#7ec8e3">45°</text>
<circle class="xa-td-led" cx="101" cy="115" r="1.4"/>
<ellipse cx="60" cy="132" rx="46" ry="3" fill="url(#ID-shadow)"/>`);
  D["vent-fan"] = () => sk(`<defs><clipPath id="ID-all"><rect x="0" y="0" width="120" height="140" rx="12"/></clipPath><clipPath id="ID-hole"><circle cx="60" cy="70" r="25"/></clipPath><linearGradient id="ID-stone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7e7a75"/><stop offset=".5" stop-color="#94908a"/><stop offset="1" stop-color="#6f6b66"/></linearGradient><linearGradient id="ID-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f2ee"/><stop offset="1" stop-color="#e3e0da"/></linearGradient><linearGradient id="ID-face" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f3f5f7"/><stop offset="1" stop-color="#d9dee3"/></linearGradient><radialGradient id="ID-recess" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e9edf0"/><stop offset=".75" stop-color="#c3cad1"/><stop offset="1" stop-color="#8f979f"/></radialGradient></defs>
<g clip-path="url(#ID-all)">
<rect x="0" y="0" width="120" height="60" fill="url(#ID-stone)"/>
<circle cx="28.3" cy="6.0" r="0.54" fill="#8a8580" opacity=".55"/><circle cx="10.8" cy="1.1" r="0.63" fill="#9c978f" opacity=".55"/><circle cx="96.1" cy="44.4" r="0.43" fill="#9c978f" opacity=".55"/><circle cx="33.2" cy="10.0" r="0.36" fill="#8a8580" opacity=".55"/><circle cx="113.2" cy="1.5" r="0.68" fill="#9c978f" opacity=".55"/><circle cx="96.1" cy="11.2" r="0.49" fill="#9c978f" opacity=".55"/><circle cx="10.4" cy="35.1" r="0.70" fill="#8a8580" opacity=".55"/><circle cx="21.3" cy="27.5" r="0.35" fill="#9c978f" opacity=".55"/><circle cx="0.9" cy="16.9" r="0.72" fill="#9c978f" opacity=".55"/><circle cx="101.8" cy="29.5" r="0.55" fill="#9c978f" opacity=".55"/><circle cx="51.7" cy="9.4" r="0.48" fill="#6b6763" opacity=".55"/><circle cx="9.7" cy="26.8" r="0.90" fill="#57534f" opacity=".55"/><circle cx="84.1" cy="8.4" r="0.70" fill="#6b6763" opacity=".55"/><circle cx="49.5" cy="11.8" r="0.68" fill="#9c978f" opacity=".55"/><circle cx="22.0" cy="25.3" r="0.65" fill="#8a8580" opacity=".55"/><circle cx="108.5" cy="5.9" r="0.34" fill="#8a8580" opacity=".55"/><circle cx="33.3" cy="33.8" r="0.82" fill="#6b6763" opacity=".55"/><circle cx="39.7" cy="10.3" r="0.58" fill="#6b6763" opacity=".55"/><circle cx="42.9" cy="4.8" r="0.88" fill="#9c978f" opacity=".55"/><circle cx="88.2" cy="55.7" r="0.31" fill="#9c978f" opacity=".55"/><circle cx="38.6" cy="8.9" r="0.69" fill="#6b6763" opacity=".55"/><circle cx="35.2" cy="11.1" r="0.57" fill="#8a8580" opacity=".55"/><circle cx="30.0" cy="34.7" r="0.40" fill="#6b6763" opacity=".55"/><circle cx="43.6" cy="26.4" r="0.52" fill="#9c978f" opacity=".55"/><circle cx="119.7" cy="33.1" r="0.56" fill="#8a8580" opacity=".55"/><circle cx="50.9" cy="12.1" r="0.34" fill="#6b6763" opacity=".55"/><circle cx="88.5" cy="34.5" r="0.88" fill="#6b6763" opacity=".55"/><circle cx="65.5" cy="33.8" r="0.49" fill="#6b6763" opacity=".55"/><circle cx="14.7" cy="30.7" r="0.76" fill="#57534f" opacity=".55"/><circle cx="78.2" cy="11.6" r="0.42" fill="#57534f" opacity=".55"/><circle cx="49.3" cy="2.1" r="0.55" fill="#8a8580" opacity=".55"/><circle cx="77.7" cy="24.8" r="0.43" fill="#8a8580" opacity=".55"/><circle cx="3.8" cy="14.8" r="0.45" fill="#8a8580" opacity=".55"/><circle cx="92.7" cy="24.2" r="0.46" fill="#9c978f" opacity=".55"/><circle cx="6.2" cy="53.8" r="0.64" fill="#57534f" opacity=".55"/><circle cx="115.5" cy="37.9" r="0.82" fill="#6b6763" opacity=".55"/><circle cx="59.3" cy="5.4" r="0.43" fill="#8a8580" opacity=".55"/><circle cx="40.4" cy="38.1" r="0.78" fill="#9c978f" opacity=".55"/><circle cx="97.8" cy="30.6" r="0.69" fill="#9c978f" opacity=".55"/><circle cx="40.6" cy="22.7" r="0.60" fill="#9c978f" opacity=".55"/><circle cx="115.4" cy="38.8" r="0.33" fill="#8a8580" opacity=".55"/><circle cx="92.0" cy="15.6" r="0.81" fill="#8a8580" opacity=".55"/><circle cx="82.5" cy="26.9" r="0.58" fill="#57534f" opacity=".55"/><circle cx="111.3" cy="12.7" r="0.30" fill="#8a8580" opacity=".55"/><circle cx="1.6" cy="50.8" r="0.37" fill="#57534f" opacity=".55"/><circle cx="105.3" cy="31.9" r="0.83" fill="#8a8580" opacity=".55"/><circle cx="19.4" cy="35.3" r="0.79" fill="#57534f" opacity=".55"/><circle cx="109.8" cy="25.5" r="0.35" fill="#6b6763" opacity=".55"/><circle cx="58.7" cy="50.2" r="0.66" fill="#8a8580" opacity=".55"/><circle cx="5.0" cy="4.6" r="0.83" fill="#6b6763" opacity=".55"/><circle cx="35.6" cy="20.1" r="0.34" fill="#57534f" opacity=".55"/><circle cx="45.7" cy="45.7" r="0.49" fill="#8a8580" opacity=".55"/><circle cx="91.0" cy="49.6" r="0.54" fill="#6b6763" opacity=".55"/><circle cx="13.7" cy="36.0" r="0.83" fill="#57534f" opacity=".55"/><circle cx="49.9" cy="41.3" r="0.57" fill="#8a8580" opacity=".55"/><circle cx="76.4" cy="53.9" r="0.59" fill="#6b6763" opacity=".55"/><circle cx="95.8" cy="9.7" r="0.82" fill="#8a8580" opacity=".55"/><circle cx="84.8" cy="18.9" r="0.82" fill="#9c978f" opacity=".55"/><circle cx="65.0" cy="52.4" r="0.73" fill="#6b6763" opacity=".55"/><circle cx="77.8" cy="7.0" r="0.37" fill="#57534f" opacity=".55"/><circle cx="63.2" cy="30.2" r="0.55" fill="#9c978f" opacity=".55"/><circle cx="42.8" cy="44.5" r="0.89" fill="#6b6763" opacity=".55"/><circle cx="81.2" cy="35.4" r="0.49" fill="#57534f" opacity=".55"/><circle cx="93.9" cy="33.0" r="0.86" fill="#57534f" opacity=".55"/><circle cx="73.6" cy="25.6" r="0.38" fill="#9c978f" opacity=".55"/><circle cx="118.3" cy="19.7" r="0.56" fill="#8a8580" opacity=".55"/><circle cx="81.0" cy="36.1" r="0.47" fill="#9c978f" opacity=".55"/><circle cx="23.7" cy="46.0" r="0.70" fill="#6b6763" opacity=".55"/><circle cx="9.2" cy="37.4" r="0.84" fill="#9c978f" opacity=".55"/><circle cx="78.5" cy="18.9" r="0.48" fill="#6b6763" opacity=".55"/><circle cx="72.5" cy="30.4" r="0.75" fill="#6b6763" opacity=".55"/><circle cx="96.1" cy="46.8" r="0.87" fill="#8a8580" opacity=".55"/><circle cx="21.9" cy="57.2" r="0.70" fill="#6b6763" opacity=".55"/><circle cx="91.2" cy="56.2" r="0.37" fill="#57534f" opacity=".55"/><circle cx="81.0" cy="43.2" r="0.67" fill="#9c978f" opacity=".55"/><circle cx="102.3" cy="39.9" r="0.83" fill="#8a8580" opacity=".55"/><circle cx="107.6" cy="40.8" r="0.49" fill="#8a8580" opacity=".55"/><circle cx="89.5" cy="31.2" r="0.62" fill="#57534f" opacity=".55"/><circle cx="107.9" cy="23.2" r="0.54" fill="#9c978f" opacity=".55"/><circle cx="34.1" cy="23.9" r="0.31" fill="#8a8580" opacity=".55"/><circle cx="107.7" cy="26.6" r="0.64" fill="#9c978f" opacity=".55"/><circle cx="48.5" cy="22.5" r="0.32" fill="#6b6763" opacity=".55"/><circle cx="55.0" cy="56.0" r="0.68" fill="#9c978f" opacity=".55"/><circle cx="72.5" cy="18.1" r="0.35" fill="#9c978f" opacity=".55"/><circle cx="58.0" cy="37.1" r="0.59" fill="#6b6763" opacity=".55"/><circle cx="17.8" cy="13.8" r="0.48" fill="#6b6763" opacity=".55"/><circle cx="19.6" cy="45.8" r="0.71" fill="#9c978f" opacity=".55"/><circle cx="2.2" cy="14.2" r="0.75" fill="#8a8580" opacity=".55"/><circle cx="3.8" cy="18.4" r="0.37" fill="#6b6763" opacity=".55"/><circle cx="105.4" cy="37.3" r="0.67" fill="#8a8580" opacity=".55"/><circle cx="87.8" cy="38.0" r="0.87" fill="#6b6763" opacity=".55"/><circle cx="67.2" cy="40.2" r="0.73" fill="#8a8580" opacity=".55"/><circle cx="60.3" cy="8.9" r="0.81" fill="#57534f" opacity=".55"/><circle cx="60.9" cy="21.8" r="0.40" fill="#9c978f" opacity=".55"/><circle cx="61.8" cy="31.2" r="0.48" fill="#57534f" opacity=".55"/><circle cx="39.4" cy="22.4" r="0.55" fill="#6b6763" opacity=".55"/><circle cx="33.4" cy="39.2" r="0.48" fill="#8a8580" opacity=".55"/><circle cx="10.3" cy="6.7" r="0.67" fill="#6b6763" opacity=".55"/><circle cx="27.8" cy="32.1" r="0.59" fill="#8a8580" opacity=".55"/><circle cx="106.3" cy="26.2" r="0.74" fill="#57534f" opacity=".55"/><circle cx="40.3" cy="10.0" r="0.62" fill="#8a8580" opacity=".55"/><circle cx="12.9" cy="35.9" r="0.85" fill="#9c978f" opacity=".55"/><circle cx="111.7" cy="48.2" r="0.55" fill="#6b6763" opacity=".55"/><circle cx="98.5" cy="12.3" r="0.65" fill="#9c978f" opacity=".55"/><circle cx="94.1" cy="27.7" r="0.80" fill="#6b6763" opacity=".55"/><circle cx="107.0" cy="51.8" r="0.83" fill="#6b6763" opacity=".55"/><circle cx="72.6" cy="30.6" r="0.89" fill="#9c978f" opacity=".55"/><circle cx="111.4" cy="10.3" r="0.33" fill="#8a8580" opacity=".55"/><circle cx="4.7" cy="39.2" r="0.50" fill="#8a8580" opacity=".55"/><circle cx="83.6" cy="6.8" r="0.89" fill="#6b6763" opacity=".55"/><circle cx="8.6" cy="13.1" r="0.46" fill="#6b6763" opacity=".55"/><circle cx="106.9" cy="56.5" r="0.31" fill="#8a8580" opacity=".55"/><circle cx="25.6" cy="14.5" r="0.74" fill="#9c978f" opacity=".55"/><circle cx="97.9" cy="17.3" r="0.53" fill="#57534f" opacity=".55"/><circle cx="4.1" cy="23.9" r="0.88" fill="#9c978f" opacity=".55"/><circle cx="67.2" cy="16.4" r="0.42" fill="#57534f" opacity=".55"/><circle cx="38.6" cy="12.5" r="0.59" fill="#57534f" opacity=".55"/><circle cx="111.8" cy="16.0" r="0.75" fill="#57534f" opacity=".55"/><circle cx="114.0" cy="53.8" r="0.55" fill="#8a8580" opacity=".55"/><circle cx="30.7" cy="29.6" r="0.32" fill="#9c978f" opacity=".55"/><circle cx="73.1" cy="39.2" r="0.68" fill="#9c978f" opacity=".55"/><circle cx="10.4" cy="57.2" r="0.40" fill="#6b6763" opacity=".55"/><circle cx="84.1" cy="54.2" r="0.45" fill="#8a8580" opacity=".55"/><circle cx="106.9" cy="29.0" r="0.37" fill="#9c978f" opacity=".55"/><circle cx="1.0" cy="33.1" r="0.42" fill="#6b6763" opacity=".55"/><circle cx="29.3" cy="48.9" r="0.37" fill="#9c978f" opacity=".55"/><circle cx="35.6" cy="32.9" r="0.70" fill="#6b6763" opacity=".55"/><circle cx="79.4" cy="57.6" r="0.84" fill="#6b6763" opacity=".55"/><circle cx="90.7" cy="46.5" r="0.71" fill="#9c978f" opacity=".55"/><circle cx="4.2" cy="18.8" r="0.50" fill="#9c978f" opacity=".55"/><circle cx="118.4" cy="9.4" r="0.75" fill="#6b6763" opacity=".55"/><circle cx="114.7" cy="55.2" r="0.71" fill="#6b6763" opacity=".55"/><circle cx="80.8" cy="15.2" r="0.85" fill="#57534f" opacity=".55"/><circle cx="12.5" cy="11.6" r="0.38" fill="#57534f" opacity=".55"/><circle cx="72.2" cy="28.8" r="0.49" fill="#57534f" opacity=".55"/><circle cx="89.2" cy="48.6" r="0.76" fill="#6b6763" opacity=".55"/><circle cx="21.7" cy="20.8" r="0.48" fill="#9c978f" opacity=".55"/><circle cx="68.9" cy="11.3" r="0.67" fill="#9c978f" opacity=".55"/><circle cx="46.0" cy="31.1" r="0.37" fill="#8a8580" opacity=".55"/><circle cx="22.9" cy="20.2" r="0.89" fill="#8a8580" opacity=".55"/><circle cx="2.5" cy="6.8" r="0.48" fill="#9c978f" opacity=".55"/><circle cx="112.6" cy="28.8" r="0.32" fill="#9c978f" opacity=".55"/><circle cx="96.0" cy="46.5" r="0.40" fill="#57534f" opacity=".55"/><circle cx="74.1" cy="20.3" r="0.30" fill="#8a8580" opacity=".55"/><circle cx="53.7" cy="43.1" r="0.85" fill="#57534f" opacity=".55"/><circle cx="25.4" cy="19.2" r="0.66" fill="#6b6763" opacity=".55"/><circle cx="107.4" cy="27.9" r="0.88" fill="#6b6763" opacity=".55"/><circle cx="21.7" cy="35.7" r="0.66" fill="#6b6763" opacity=".55"/><circle cx="87.0" cy="1.3" r="0.56" fill="#8a8580" opacity=".55"/><circle cx="74.6" cy="7.8" r="0.66" fill="#8a8580" opacity=".55"/><circle cx="52.2" cy="18.2" r="0.68" fill="#8a8580" opacity=".55"/><circle cx="87.6" cy="53.8" r="0.80" fill="#9c978f" opacity=".55"/><circle cx="31.0" cy="19.4" r="0.62" fill="#8a8580" opacity=".55"/><circle cx="43.9" cy="50.0" r="0.42" fill="#57534f" opacity=".55"/><circle cx="99.4" cy="4.3" r="0.68" fill="#8a8580" opacity=".55"/><circle cx="118.5" cy="8.3" r="0.73" fill="#6b6763" opacity=".55"/><circle cx="64.6" cy="20.1" r="0.86" fill="#6b6763" opacity=".55"/><circle cx="94.2" cy="35.1" r="0.63" fill="#9c978f" opacity=".55"/><circle cx="75.0" cy="17.1" r="0.83" fill="#9c978f" opacity=".55"/><circle cx="25.1" cy="27.4" r="0.47" fill="#6b6763" opacity=".55"/>
<rect x="0" y="58" width="120" height="4" fill="#c9c5be"/><rect x="0" y="58" width="120" height="1" fill="#e9e6e0"/>
<rect x="0" y="62" width="120" height="78" fill="url(#ID-tile)"/>
<g stroke="#d6d2ca" stroke-width=".35" opacity=".8"><path d="M0 64H120" /><path d="M0 67H120" /><path d="M0 70H120" /><path d="M0 73H120" /><path d="M0 76H120" /><path d="M0 79H120" /><path d="M0 82H120" /><path d="M0 85H120" /><path d="M0 88H120" /><path d="M0 91H120" /><path d="M0 94H120" /><path d="M0 97H120" /><path d="M0 100H120" /><path d="M0 103H120" /><path d="M0 106H120" /><path d="M0 109H120" /><path d="M0 112H120" /><path d="M0 115H120" /><path d="M0 118H120" /><path d="M0 121H120" /><path d="M0 124H120" /><path d="M0 127H120" /><path d="M0 130H120" /><path d="M0 133H120" /><path d="M0 136H120" /><path d="M0 139H120" /></g>
<g class="xa-vm-condensation"><path d="M10 80q1.2 2 0 3.4q-1.2-1.4 0-3.4z"/><path d="M14 96q1.2 2 0 3.4q-1.2-1.4 0-3.4z"/><path d="M106 84q1.2 2 0 3.4q-1.2-1.4 0-3.4z"/><path d="M110 104q1.2 2 0 3.4q-1.2-1.4 0-3.4z"/><path d="M8 118q1.2 2 0 3.4q-1.2-1.4 0-3.4z"/><path d="M104 122q1.2 2 0 3.4q-1.2-1.4 0-3.4z"/></g>
<g class="xa-vm-steam"><path d="M14 136q-4-8 2-14t0-14"/><path d="M28 140q-4-8 2-14t0-14"/><path d="M98 138q-4-8 2-14t0-14"/></g>
</g>
<rect x="0" y="0" width="120" height="140" fill="#1b1433" opacity=".62" clip-path="url(#ID-all)"/>
<path d="M22 31C42 21 78 35 100 25V117H22Z" fill="#000" opacity=".16" transform="translate(3 4)"/>
<path d="M19 29C40 19 78 33 101 23V116Q101 120 97 120H23Q19 120 19 116Z" fill="#d3d8dd"/>
<path d="M18 27C39 17 77 31 99 21V114Q99 118 95 118H22Q18 118 18 114Z" fill="url(#ID-face)" stroke="#c9ced4" stroke-width=".6"/>
<path d="M21 28C40 19 76 32 97 23" fill="none" stroke="#ffffff" stroke-width="1.6" opacity=".9"/>
<circle cx="60" cy="70" r="28" fill="#e2e6ea" stroke="#c4cad0" stroke-width=".8"/>
<circle cx="60" cy="70" r="25" fill="url(#ID-recess)"/>
<g clip-path="url(#ID-hole)">
<circle cx="60" cy="70" r="25" fill="#3d4349" opacity=".55"/>
<g class="xa-vm-fanv" fill="#f4f6f8" stroke="#c4cad0" stroke-width=".4"><path d="M60 70C60 61 65 50 75 45C73 55 69 63 60 70Z" transform="rotate(0 60 70)"/><path d="M60 70C60 61 65 50 75 45C73 55 69 63 60 70Z" transform="rotate(30 60 70)"/><path d="M60 70C60 61 65 50 75 45C73 55 69 63 60 70Z" transform="rotate(60 60 70)"/><path d="M60 70C60 61 65 50 75 45C73 55 69 63 60 70Z" transform="rotate(90 60 70)"/><path d="M60 70C60 61 65 50 75 45C73 55 69 63 60 70Z" transform="rotate(120 60 70)"/><path d="M60 70C60 61 65 50 75 45C73 55 69 63 60 70Z" transform="rotate(150 60 70)"/><path d="M60 70C60 61 65 50 75 45C73 55 69 63 60 70Z" transform="rotate(180 60 70)"/><path d="M60 70C60 61 65 50 75 45C73 55 69 63 60 70Z" transform="rotate(210 60 70)"/><path d="M60 70C60 61 65 50 75 45C73 55 69 63 60 70Z" transform="rotate(240 60 70)"/><path d="M60 70C60 61 65 50 75 45C73 55 69 63 60 70Z" transform="rotate(270 60 70)"/><path d="M60 70C60 61 65 50 75 45C73 55 69 63 60 70Z" transform="rotate(300 60 70)"/><path d="M60 70C60 61 65 50 75 45C73 55 69 63 60 70Z" transform="rotate(330 60 70)"/></g>
<circle cx="60" cy="70" r="7" fill="#ffffff" stroke="#c4cad0" stroke-width=".6"/>
<g class="xa-vm-slats" fill="none" stroke-linecap="round">
<g stroke="#9aa3ad" stroke-width="2" transform="translate(0 .7)" opacity=".5"><path d="M30 47.5Q60 45.9 90 47.5" /><path d="M30 52.9Q60 51.3 90 52.9" /><path d="M30 58.3Q60 56.7 90 58.3" /><path d="M30 63.7Q60 62.1 90 63.7" /><path d="M30 69.1Q60 67.5 90 69.1" /><path d="M30 74.5Q60 72.9 90 74.5" /><path d="M30 79.9Q60 78.3 90 79.9" /><path d="M30 85.3Q60 83.7 90 85.3" /><path d="M30 90.7Q60 89.1 90 90.7" /></g>
<g stroke="#ffffff" stroke-width="1.7"><path d="M30 47.5Q60 45.9 90 47.5" /><path d="M30 52.9Q60 51.3 90 52.9" /><path d="M30 58.3Q60 56.7 90 58.3" /><path d="M30 63.7Q60 62.1 90 63.7" /><path d="M30 69.1Q60 67.5 90 69.1" /><path d="M30 74.5Q60 72.9 90 74.5" /><path d="M30 79.9Q60 78.3 90 79.9" /><path d="M30 85.3Q60 83.7 90 85.3" /><path d="M30 90.7Q60 89.1 90 90.7" /></g>
</g>
</g>
<circle cx="60" cy="70" r="25" fill="none" stroke="#b5bcc3" stroke-width="1"/>
<g class="xa-vm-intake"><path d="M20 98q8-6 14-4"/><path d="M98 100q-8-6-14-3"/><path d="M28 40q8 2 12 8"/><path d="M94 42q-8 2-12 8"/><path d="M60 112q-2-6 0-12"/></g>`);

  D["barrier"] = () => {
    const stripes = [66, 94, 122, 150, 178].map((x) => `<rect x="${x}" y="145" width="14" height="10"/>`).join("");
    const leds = [73, 115, 157, 198].map((x) => `<circle cx="${x}" cy="150" r="1.4"/>`).join("");
    return nest("18 -8 232 202", 0, 20, 200, 174.1, `<defs>${accDefs}
  <linearGradient id="ID-cab" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9bd3a"/><stop offset=".55" stop-color="#d4a00c"/><stop offset="1" stop-color="#a87a00"/></linearGradient></defs>
 <ellipse cx="134" cy="192" rx="114" ry="5" fill="#000" opacity=".28"/>
 <rect x="18" y="176" width="232" height="14" rx="3" fill="url(#ID-road)"/>
 <path d="M26 183 H244" stroke="#d9d4ec" stroke-width="1.6" stroke-dasharray="14 10" opacity=".55"/>
 <rect x="203" y="152" width="7" height="26" fill="url(#ID-metal)"/>
 <path d="M200 142 V155 H213 V142" fill="none" stroke="#3a4148" stroke-width="3" stroke-linejoin="round"/>
 <rect x="199" y="175" width="15" height="4" rx="1" fill="#2d333a"/>
 <g class="xa-br-arm">
  <rect x="44" y="145" width="160" height="10" rx="5" fill="#e6e8ea" stroke="#aab2ba" stroke-width=".8"/>
  <g fill="#d8322b">${stripes}</g>
  <g class="xa-br-armled">${leds}</g>
  <path d="M50 147 H200" stroke="#fff" stroke-width="1.2" opacity=".45"/>
 </g>
 <rect x="30" y="124" width="38" height="54" rx="3" fill="url(#ID-cab)" stroke="#8a6500" stroke-width=".8"/>
 <rect x="26" y="118" width="46" height="8" rx="2" fill="#3a4148"/>
 <rect x="35" y="160" width="28" height="14" rx="2" fill="none" stroke="#8a6500" stroke-width=".8" opacity=".7"/>
 <circle cx="58" cy="167" r="1.5" fill="#5a4400"/>
 <rect x="26" y="176" width="46" height="5" rx="1" fill="#2d333a"/>
 <circle cx="49" cy="150" r="8.5" fill="url(#ID-chr)" stroke="#555e68" stroke-width=".8"/>
 <circle cx="49" cy="150" r="2.4" fill="#3a4148"/>
 <circle class="xa-led" cx="38" cy="131" r="2"/>
 ${beacon(49, 112)}`);
  };

  D["swing-gate"] = () => {
    const cy = (x) => 16 - 10.5 * (x / 92) ** 2;
    let bars = "", tops = "", rail = "M0 16";
    for (let i = 0; i < 12; i++) {
      const x = 7 + i * 7, t = cy(x).toFixed(1);
      bars += `<rect x="${x - 1.5}" y="${t}" width="3" height="${(82 - t).toFixed(1)}" rx="1"/>`;
      tops += `<circle cx="${x}" cy="${(t - 2).toFixed(1)}" r="2.2"/>`;
    }
    for (let x = 4; x <= 92; x += 4) rail += ` L${x} ${cy(x).toFixed(1)}`;
    const leaf = `<g fill="#2f353c">${bars}${tops}</g>
  <path d="${rail}" fill="none" stroke="#3a4148" stroke-width="5" stroke-linejoin="round"/>
  <rect x="0" y="44" width="94" height="4" rx="1.5" fill="#3a4148"/><rect x="0" y="78" width="94" height="6" rx="1.5" fill="#3a4148"/>
  <rect x="0" y="14" width="4" height="70" fill="#3a4148"/><rect x="90" y="3" width="4" height="81" fill="#3a4148"/>
  <rect x="83" y="50" width="8" height="12" rx="1.5" fill="#1f2429" stroke="#555e68" stroke-width=".6"/><rect x="85.5" y="54" width="3" height="1.6" fill="url(#ID-chr)"/>
  <rect class="xa-sw-shade" x="0" y="0" width="94" height="88" fill="#000"/>`;
    return shadow(100, 193, 94, 4) + nest("0 20 260 145", 0, 82, 200, 111.5, `<defs>${accDefs}</defs>
 <path d="M0 94 H260 V150 H0 Z" fill="#3f6b38" opacity=".45"/>
 <path d="M0 86 Q40 78 80 86 T160 84 T260 86 V98 H0 Z" fill="#2f5a2c" opacity=".8"/>
 <path d="M100 96 H160 L232 150 H28 Z" fill="#7d858d" opacity=".85"/>
 <g stroke="#666e76" stroke-width=".7" opacity=".7"><path d="M90 104 H170 M78 114 H182 M62 126 H198 M44 139 H216"/></g>
 <rect x="0" y="148" width="260" height="12" rx="2" fill="url(#ID-road)"/>
 <g class="xa-sw-leaf xa-sw-l"><g transform="translate(36 57)">${leaf}</g></g>
 <g class="xa-sw-leaf xa-sw-r"><g transform="translate(224 57) scale(-1 1)">${leaf}</g></g>
 ${pillar(14, 22, 48, 150)}${pillar(224, 22, 48, 150)}
 <g fill="#3a4148"><rect x="35" y="66" width="4" height="7" rx="1"/><rect x="35" y="124" width="4" height="7" rx="1"/><rect x="221" y="66" width="4" height="7" rx="1"/><rect x="221" y="124" width="4" height="7" rx="1"/></g>
 <rect x="19" y="88" width="11" height="16" rx="1.5" fill="#2d333a"/><circle cx="24.5" cy="93" r="1.8" fill="#7fe3ff"/><rect x="21.5" y="98" width="6" height="2.5" rx=".8" fill="#8b949c"/>
 <circle class="xa-led" cx="235" cy="96" r="1.8"/>
 ${beacon(235, 36)}`);
  };

  D["aquarium"] = () => {
    const plants = [[30, -8, 47.5, "#3fbf4a", 6, 4], [42, 9, 55, "#58d65a", 5, 5], [54, -7, 40, "#35a842", 5, 6], [78, -9, 50, "#6be06a", 4, 5],
      [90, 7, 42.5, "#3fbf4a", 4, 4], [100, -6, 35, "#7ae27a", 4, 6], [195, -8, 52.5, "#4cc94c", 8, 4], [210, 9, 42.5, "#37ae3f", 7, 5], [280, -7, 47.5, "#4cc94c", 5, 5]]
      .map(([x, a, c, col, w, d]) => `<path class="xa-aq-plant" d="M${x} 146 q${a} ${(-c * 2 / 3).toFixed(1)} 0 ${-c} q${-a} ${(-c * 2 / 3).toFixed(1)} 0 ${-c}" stroke="${col}" stroke-width="${w}" style="transform-origin:${x}px 146px;animation-duration:${d}s"/>`).join("")
      + [[135, 93.5, 76, 41, 5], [148, 86, 66, 26, 6], [160, 98.5, 82.7, 51, 7], [170, 91, 72.7, 36, 8]]
      .map(([x, y1, y2, y3, d]) => `<path class="xa-aq-plant" d="M${x} 146 C${x - 10} ${y1} ${x + 10} ${y2} ${x} ${y3}" stroke="#c0789a" stroke-width="12" opacity=".85" style="transform-origin:${x}px 146px;animation-duration:${d}s"/>`).join("");
    let anem = "", grav = "", bubs = "";
    for (let k = 0; k < 22; k++) { const a = (k / 22) * Math.PI * 2; anem += `M232 136 L${(232 + 13 * Math.cos(a)).toFixed(1)} ${(136 + 13 * Math.sin(a)).toFixed(1)}`; }
    for (let i = 0; i < 40; i++) grav += `<circle cx="${14 + (i * 37) % 292}" cy="${150 + (i % 12)}" r="1"/>`;
    for (let i = 0; i < 10; i++) bubs += `<circle cx="${262 + 5 * (i % 4)}" cy="140" r="${1.5 + (i % 3)}" style="animation-duration:${3 + (i % 4)}s;animation-delay:${(-(i * 0.6) % 3).toFixed(1)}s"/>`;
    const fish = (x, y, s, tail, body, stripes, dur, dl) => `<g transform="translate(${x} ${y})"><g class="xa-aq-fish" style="animation-duration:${dur}s;animation-delay:${dl}s"><g transform="scale(${s})">
  <path class="xa-aq-tail" d="M2 0 L-12 -9 L-9 0 L-12 9 Z" fill="${tail}"/><path d="M0 0 C8 -10 26 -10 34 0 C26 10 8 10 0 0 Z" fill="${body}"/><path d="M14 -8 L22 -14 L26 -7 Z" fill="${tail}"/>
  ${stripes ? `<path d="M10 -8 L12 8 M18 -9 L20 9 M26 -6 L27 6" stroke="#111" stroke-width="2.4" fill="none"/>` : ""}<circle cx="28" cy="-2" r="2" fill="#fff"/><circle cx="28.6" cy="-2" r="1" fill="#111"/></g></g></g>`;
    return shadow(100, 194, 98, 4) + nest("0 0 320 200", 0, 70, 200, 125, `<defs>
  <linearGradient id="ID-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2378d0"/><stop offset="1" stop-color="#0a3f96"/></linearGradient>
  <linearGradient id="ID-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8702c"/><stop offset="1" stop-color="#8f4f18"/></linearGradient>
  <linearGradient id="ID-glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe6ff" stop-opacity=".9"/><stop offset="1" stop-color="#bfe6ff" stop-opacity=".2"/></linearGradient>
  <clipPath id="ID-glass"><rect x="10" y="24" width="300" height="140"/></clipPath></defs>
 <rect x="4" y="170" width="312" height="30" fill="url(#ID-wood)"/><path d="M160 172 V200" stroke="#6a3a10" stroke-width="1.5"/>
 <rect x="10" y="24" width="300" height="140" fill="url(#ID-bg)"/>
 <g clip-path="url(#ID-glass)">
  <rect x="10" y="24" width="300" height="140" fill="#2a8fd6" opacity=".35"/>
  <rect x="10" y="24" width="300" height="5" fill="#fff" opacity=".3"/>
  <rect x="108" y="28" width="9" height="115" fill="#10244a" opacity=".85"/>
  <g fill="none" stroke-linecap="round">${plants}</g>
  <path d="${anem}" stroke="#c62828" stroke-width="1.6" stroke-linecap="round"/><circle cx="232" cy="136" r="5" fill="#b71c1c"/>
  <polygon points="95,146 112,120 140,112 160,128 165,146" fill="#555a60"/><polygon points="112,120 140,112 130,128" fill="#6b7076"/>
  <polygon points="180,146 190,124 215,118 228,146" fill="#4a4e54"/><polygon points="270,146 280,128 300,126 306,146" fill="#5a5f66"/>
  <polygon points="45,150 55,140 80,138 90,150" fill="#6a6f76"/>
  <ellipse cx="82" cy="130" rx="9" ry="7" fill="#c8c8c8"/><ellipse cx="128" cy="144" rx="8" ry="5" fill="#bcbcbc"/>
  <circle cx="205" cy="146" r="6" fill="#4caf50"/><circle cx="222" cy="148" r="5" fill="#5cc45c"/><circle cx="244" cy="147" r="6" fill="#4caf50"/><circle cx="258" cy="148" r="5" fill="#5cc45c"/>
  <rect x="10" y="148" width="300" height="16" fill="#12245e"/><g fill="#6f86d6" opacity=".6">${grav}</g>
  <g class="xa-aq-bub" fill="#fff" fill-opacity=".35" stroke="#fff" stroke-opacity=".85" stroke-width=".6">${bubs}</g>
  ${fish(80, 40, 1, "#ff7a00", "#ff9a2e", 0, 14, 0)}${fish(200, 65, 0.9, "#ff9a00", "#ffb62e", 0, 18, -7)}${fish(120, 85, 1.05, "#555555", "#d8dce6", 1, 16, -4)}
  ${fish(170, 105, 0.8, "#c9a227", "#e8c86a", 1, 20, -11)}${fish(210, 55, 0.7, "#d32f2f", "#ff4d4d", 0, 22, -15)}${fish(100, 120, 0.95, "#ff9a00", "#ffc233", 0, 17, -5)}
  <rect class="xa-aq-night" x="10" y="24" width="300" height="140" fill="#050b24"/>
  <polygon class="xa-aq-glow" points="70,24 250,24 305,164 15,164" fill="url(#ID-glow)"/>
 </g>
 <rect x="6" y="14" width="308" height="11" fill="#111111"/><rect x="6" y="162" width="308" height="8" fill="#111111"/>
 <rect x="8" y="24" width="3" height="140" fill="#b4dcff" opacity=".5"/><rect x="309" y="24" width="3" height="140" fill="#b4dcff" opacity=".5"/>
 <rect x="75" y="2" width="170" height="12" rx="3" fill="#1c1c1c"/><rect class="xa-aq-led" x="82" y="9" width="156" height="3" rx="1.5"/>`);
  };

  D["diesel-heater"] = () => {
    let crown = "", holes = "";
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, x = 101 + 24 * Math.cos(a), y = 158.5 + 3.6 * Math.sin(a), f = (v) => v.toFixed(1);
      crown += `<path class="xa-dh-cf" d="M${f(x - 2)} ${f(y)} C${f(x - 2.4)} ${f(y - 4)} ${f(x - 1)} ${f(y - 7)} ${f(x)} ${f(y - 9)} C${f(x + 1)} ${f(y - 7)} ${f(x + 2.4)} ${f(y - 4)} ${f(x + 2)} ${f(y)}Z"/>`;
    }
    for (let i = 0; i < 9; i++) holes += `<circle cx="${77 + i * 6}" cy="164.5" r="1.1"/>`;
    return nest("0 0 240 226", 0, 16, 200, 188.3, `<defs>
  <linearGradient id="ID-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8c96a1"/><stop offset=".3" stop-color="#d6dbe0"/><stop offset=".55" stop-color="#b4bdc7"/><stop offset="1" stop-color="#707a86"/></linearGradient>
  <linearGradient id="ID-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2c333b"/><stop offset=".22" stop-color="#4a535d"/><stop offset=".5" stop-color="#39424b"/><stop offset="1" stop-color="#1f252b"/></linearGradient>
  <linearGradient id="ID-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6c7682"/><stop offset="1" stop-color="#3a424b"/></linearGradient>
  <linearGradient id="ID-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#171c21"/><stop offset="1" stop-color="#2a3138"/></linearGradient>
  <linearGradient id="ID-fo" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5a1f"/><stop offset=".6" stop-color="#ff9a3c"/><stop offset="1" stop-color="#ffc766"/></linearGradient>
  <linearGradient id="ID-fm" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff9d28"/><stop offset=".7" stop-color="#ffd24a"/><stop offset="1" stop-color="#fff0a0"/></linearGradient>
  <linearGradient id="ID-fi" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff2b5"/><stop offset="1" stop-color="#fffbe8"/></linearGradient>
  <linearGradient id="ID-fb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1239ff"/><stop offset=".55" stop-color="#3fa3ff"/><stop offset="1" stop-color="#c9f2ff"/></linearGradient>
  <radialGradient id="ID-gl" cx=".5" cy="1" r=".95"><stop offset="0" stop-color="#ffb04a" stop-opacity=".9"/><stop offset=".55" stop-color="#ff6a1f" stop-opacity=".3"/><stop offset="1" stop-color="#ff6a1f" stop-opacity="0"/></radialGradient>
  <linearGradient id="ID-fuel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e8a317"/><stop offset=".5" stop-color="#ffd25a"/><stop offset="1" stop-color="#c88a0c"/></linearGradient></defs>
 <ellipse cx="120" cy="214" rx="92" ry="8" fill="#000" opacity=".28"/>
 <rect x="110" y="14" width="20" height="56" fill="url(#ID-steel)"/>
 <rect x="107" y="40" width="26" height="5" rx="2" fill="url(#ID-steel)" stroke="#8a949f" stroke-width=".6"/>
 <rect x="107" y="22" width="26" height="4" rx="2" fill="url(#ID-steel)" stroke="#8a949f" stroke-width=".6"/>
 <ellipse cx="120" cy="14" rx="10" ry="3" fill="#2a3138"/>
 <g fill="#d9d4ec"><circle class="xa-dh-puff" cx="120" cy="10" r="5"/><circle class="xa-dh-puff" cx="118" cy="10" r="4"/><circle class="xa-dh-puff" cx="123" cy="10" r="4.5"/></g>
 <g fill="none" stroke="#ffd2a8" stroke-width="1.6" stroke-linecap="round"><path class="xa-dh-wave" d="M70 56 q6 -5 12 0 t12 0"/><path class="xa-dh-wave" d="M146 56 q6 -5 12 0 t12 0"/><path class="xa-dh-wave" d="M96 60 q6 -5 12 0 t12 0"/></g>
 <path d="M42 84 L198 84 L198 200 L42 200Z" fill="url(#ID-body)"/>
 <path d="M198 84 L214 72 L214 190 L198 200Z" fill="url(#ID-side)"/>
 <path d="M64 60 L176 60 L214 72 L198 84 L42 84 L26 72Z" fill="url(#ID-top)" stroke="#232a31" stroke-width="1.2" stroke-linejoin="round"/>
 <path d="M64 60 L176 60 L214 72" fill="none" stroke="#9aa4b0" stroke-width=".8" opacity=".6"/>
 <ellipse cx="120" cy="68" rx="30" ry="6.5" fill="#2a3138" stroke="#8a949f" stroke-width="1.2"/>
 <ellipse cx="120" cy="67" rx="21" ry="4" fill="#12161a"/>
 <rect x="52" y="90" width="42" height="14" rx="3" fill="#0e1b2c" stroke="#27394f"/>
 <text class="xa-lcd xa-dh-dsp" x="73" y="100.5" text-anchor="middle">21°</text>
 <circle class="xa-led xa-ledo" cx="106" cy="97" r="3.2"/>
 <circle cx="124" cy="97" r="5" fill="#8a949f" stroke="#c4ccd5"/><path d="M124 97 L127 93.5" stroke="#1d2329" stroke-width="1.6" stroke-linecap="round"/>
 <circle cx="178" cy="97" r="8.5" fill="#12161a" stroke="#6c7682"/>
 <path class="xa-dh-blades" d="M178 97 L178 90.5 Q182 92 180.5 96Z M178 97 L184.5 97 Q183 101 179.5 99Z M178 97 L178 103.5 Q174 102 175.5 98Z M178 97 L171.5 97 Q173 93 176.5 95Z" fill="#9aa4b0"/>
 <circle cx="178" cy="97" r="1.6" fill="#2a3138"/>
 <rect x="50" y="112" width="102" height="62" rx="7" fill="#1b2026" stroke="#5b6672" stroke-width="2"/>
 <rect x="55" y="117" width="92" height="52" rx="4" fill="#0f1217"/>
 <rect class="xa-dh-glow" x="55" y="117" width="92" height="52" rx="4" fill="url(#ID-gl)"/>
 <path d="M70 169 L72 160 Q101 154 130 160 L132 169Z" fill="#59636e" stroke="#3a424b"/>
 <ellipse cx="101" cy="160" rx="29" ry="5" fill="#2a3138" stroke="#7b8590" stroke-width=".8"/>
 <g fill="#12161a">${holes}</g>
 <g class="xa-dh-crown" fill="url(#ID-fb)">${crown}</g>
 <g class="xa-dh-flames">
  <path class="xa-dh-fl" d="M101 160 C74 160 76 142 90 134 C88 144 94 141 101 122 C108 141 114 144 112 134 C126 142 128 160 101 160Z" fill="url(#ID-fo)"/>
  <path class="xa-dh-fl xa-dh-f2" d="M101 158 C85 158 87 146 95 140 C94 148 98 146 101 130 C104 146 108 148 107 140 C115 146 117 158 101 158Z" fill="url(#ID-fm)"/>
  <path class="xa-dh-fl xa-dh-f3" d="M101 156 C93 156 94 149 98 146 C98 150 100 148 101 140 C102 148 104 150 104 146 C108 149 109 156 101 156Z" fill="url(#ID-fi)"/>
 </g>
 <path d="M55 119 L86 119 L55 146Z" fill="#fff" opacity=".07"/>
 <rect x="160" y="112" width="20" height="62" rx="6" fill="#1b2026" stroke="#5b6672" stroke-width="1.6"/>
 <rect x="165" y="117" width="10" height="52" rx="3" fill="#0f1217"/>
 <rect x="165" y="143" width="10" height="26" rx="3" fill="url(#ID-fuel)"/>
 <path d="M163 130 h4 M163 143 h4 M163 156 h4" stroke="#c4ccd5" stroke-width=".9" opacity=".75"/>
 <path d="M166 119 v48" stroke="#fff" stroke-width="1.2" opacity=".18"/>
 <path d="M58 184 H146 M58 190 H146" stroke="#12161a" stroke-width="2" stroke-linecap="round" opacity=".8"/>
 <rect x="52" y="200" width="14" height="9" rx="2" fill="#1b2026"/><rect x="176" y="200" width="14" height="9" rx="2" fill="#1b2026"/>`);
  };

  D["gas-boiler"] = () => {
    let fl = "", ports = "", hx = "";
    for (let i = 0; i < 11; i++) {
      const x = +(72 + i * 9.6).toFixed(1);
      fl += `<path class="xa-gb-flame" d="M${x} 130 C${(x - 4).toFixed(1)} 124 ${(x - 3.5).toFixed(1)} 117 ${x} 108 C${(x + 3.5).toFixed(1)} 117 ${(x + 4).toFixed(1)} 124 ${x} 130Z"/>`;
      ports += `<rect x="${(x - 2).toFixed(1)}" y="132" width="4" height="3" rx="1"/>`;
    }
    for (let x = 70; x <= 166; x += 12) hx += `M${x} 88 v18 `;
    const pipe = (x, c) => `<path d="M${x} 165 V202" stroke="${c}" stroke-width="8"/>`;
    return shadow(100, 192, 62, 4) + nest("0 0 240 212", 0, 14, 200, 176.7, `<defs>
  <linearGradient id="ID-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9ced5"/><stop offset="1" stop-color="#a1a9b3"/></linearGradient>
  <linearGradient id="ID-fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1239ff"/><stop offset=".5" stop-color="#3fa3ff"/><stop offset="1" stop-color="#c9f2ff"/></linearGradient>
  <radialGradient id="ID-gl" cx=".5" cy="1" r=".9"><stop offset="0" stop-color="#4aa8ff" stop-opacity=".85"/><stop offset=".6" stop-color="#2b6cff" stop-opacity=".25"/><stop offset="1" stop-color="#2b6cff" stop-opacity="0"/></radialGradient>
  <linearGradient id="ID-cu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e59a5a"/><stop offset="1" stop-color="#a45a28"/></linearGradient></defs>
 <rect x="112" y="8" width="16" height="36" rx="2" fill="#b4bac2" stroke="#8f98a3" stroke-width="1"/>
 <rect x="108" y="4" width="24" height="7" rx="2" fill="#a2aab3" stroke="#808892" stroke-width="1"/>
 <g fill="#d9d4ec"><circle class="xa-gb-puff" cx="120" cy="6" r="5"/><circle class="xa-gb-puff" cx="118" cy="6" r="4"/><circle class="xa-gb-puff" cx="123" cy="6" r="4.5"/></g>
 <rect x="48" y="42" width="144" height="116" rx="11" fill="#000" opacity=".2" transform="translate(2 3)"/>
 <rect x="44" y="40" width="152" height="116" rx="11" fill="url(#ID-body)" stroke="#9aa3ad" stroke-width="1.2"/>
 <rect x="56" y="48" width="70" height="26" rx="5" fill="#0e1b2c" stroke="#27394f"/>
 <text class="xa-lcd xa-gb-dsp" x="91" y="67" text-anchor="middle">55°</text>
 <circle class="xa-led xa-ledo" cx="136" cy="55" r="3.4"/>
 <circle cx="138" cy="67" r="4.5" fill="#a9b1ba" stroke="#8a939d"/><circle cx="152" cy="67" r="4.5" fill="#a9b1ba" stroke="#8a939d"/>
 <circle cx="172" cy="66" r="15" fill="#d6dbe0" stroke="#8a939d" stroke-width="1.4"/>
 <path d="M160.5 73 A13 13 0 0 1 183.5 73" fill="none" stroke="#bfc5cc" stroke-width="3"/>
 <path d="M165 63 A13 13 0 0 1 179 63" fill="none" stroke="#43a047" stroke-width="3" stroke-linecap="round"/>
 <path d="M172 66 L174.5 55.3" stroke="#db4437" stroke-width="1.8" stroke-linecap="round"/>
 <circle cx="172" cy="66" r="2.2" fill="#444444"/>
 <rect x="56" y="82" width="128" height="62" rx="7" fill="#0f1620" stroke="#2a3340" stroke-width="1.5"/>
 <path d="M66 90 H174 M66 97 H174 M66 104 H174" fill="none" stroke="url(#ID-cu)" stroke-width="3" stroke-linecap="round" opacity=".95"/>
 <path d="${hx}" stroke="#e5a468" stroke-width="1" opacity=".6"/>
 <rect class="xa-gb-glow" x="56" y="82" width="128" height="62" rx="7" fill="url(#ID-gl)"/>
 <g fill="url(#ID-fl)">${fl}</g>
 <rect x="66" y="130" width="108" height="8" rx="3" fill="#6a7480" stroke="#4a535e"/>
 <g fill="#2a323b">${ports}</g>
 <path d="M62 86 L84 86 L62 108Z" fill="#fff" opacity=".07"/>
 <rect x="44" y="156" width="152" height="9" rx="3" fill="#8f98a2"/>
 <g stroke-linecap="round">${pipe(62, "#3b8fe8")}${pipe(91, "#f0883e")}${pipe(120, "#f5c518")}${pipe(149, "#3b8fe8")}${pipe(178, "#e8603b")}</g>
 <g fill="#8c95a0">${[62, 91, 120, 149, 178].map((x) => `<rect x="${x - 5}" y="172" width="10" height="5" rx="1"/>`).join("")}</g>
 ${chase([[62, 168], [62, 200]], 4, 1.3, "#ffffff", 1)}${chase([[120, 200], [120, 168]], 4, 1.3, "#ffffff", 1)}${chase([[178, 200], [178, 168]], 4, 1.3, "#ffffff", 1)}`);
  };

  D["hot-tub"] = () => {
    let jets = "", streams = "", bubs = "";
    [[66, 43], [96, 43], [126, 43], [156, 43], [44, 92], [44, 118], [100, 133], [130, 133], [160, 133], [190, 133], [199, 86], [199, 110]].forEach(([x, y]) => {
      const dx = 120 - x, dy = 88 - y, n = Math.hypot(dx, dy) || 1;
      jets += `<circle cx="${x}" cy="${y}" r="3.6" fill="url(#ID-chrome)" stroke="#4d5762" stroke-width=".7"/><circle cx="${x}" cy="${y}" r="1.1" fill="#2a3138"/>`;
      streams += chase([[x + dx / n * 4, y + dy / n * 4], [x + dx / n * 19, y + dy / n * 19]], 2, 1, "#ffffff", 0.9);
    });
    for (let i = 0; i < 24; i++) {
      const x = 40 + ((i * 53) % 150), y = 40 + ((i * 37) % 95), r = 1.6 + (i % 4) * 0.7;
      bubs += `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" style="animation-delay:${(-(i % 8) * 0.19).toFixed(2)}s"/>`;
    }
    const falls = [180, 187, 194].map((x, i) => chase([[x, 33], [x, 54]], 2, 1.1, "#e6fbff", 0.7 + i * 0.05)).join("");
    return nest("0 0 240 200", 0, 30, 200, 166.7, `<defs>
  <radialGradient id="ID-water" cx=".5" cy=".55" r=".7"><stop offset="0" stop-color="#0a4d7a"/><stop offset=".5" stop-color="#1b86b3"/><stop offset="1" stop-color="#4ab8cf"/></radialGradient>
  <linearGradient id="ID-shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4dae0"/><stop offset="1" stop-color="#a9b3bc"/></linearGradient>
  <linearGradient id="ID-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb3c6"/><stop offset="1" stop-color="#3a8ea8"/></linearGradient>
  <linearGradient id="ID-cab" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b4636"/><stop offset=".5" stop-color="#7a604a"/><stop offset="1" stop-color="#4f3c2e"/></linearGradient>
  <radialGradient id="ID-chrome" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#bfc8d0"/><stop offset="1" stop-color="#6c7782"/></radialGradient>
  <linearGradient id="ID-blade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e4e8ec"/><stop offset=".5" stop-color="#aeb8c2"/><stop offset="1" stop-color="#d2d8de"/></linearGradient>
  <radialGradient id="ID-led" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#7a5cff" stop-opacity=".9"/><stop offset=".6" stop-color="#7a5cff" stop-opacity=".3"/><stop offset="1" stop-color="#7a5cff" stop-opacity="0"/></radialGradient>
  <clipPath id="ID-clip"><rect x="28" y="30" width="184" height="112" rx="22"/></clipPath></defs>
 <ellipse cx="120" cy="193" rx="106" ry="6" fill="#000" opacity=".28"/>
 <rect x="16" y="120" width="208" height="74" rx="18" fill="url(#ID-cab)"/>
 <path d="M40 176 V192 M70 176 V192 M170 176 V192 M200 176 V192" stroke="#3d2e22" stroke-width="1" opacity=".55"/>
 <rect x="86" y="175" width="68" height="17" rx="3" fill="#6a5340" stroke="#2f241a" stroke-width="1"/>
 <path d="M92 180 H122 M92 184 H122 M92 188 H122" stroke="#2f241a" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>
 <rect x="130" y="180" width="18" height="7" rx="2" fill="url(#ID-chrome)" stroke="#555e68" stroke-width=".6"/>
 <circle class="xa-led xa-ledb" cx="127" cy="183.5" r="1.8"/>
 <rect x="10" y="22" width="220" height="150" rx="36" fill="#8e9ba6"/>
 <rect x="10" y="14" width="220" height="150" rx="36" fill="url(#ID-shell)" stroke="#8a99a4" stroke-width="1"/>
 <rect x="14" y="17" width="212" height="144" rx="33" fill="none" stroke="#fff" stroke-width="1.2" opacity=".45"/>
 <rect x="24" y="26" width="192" height="120" rx="26" fill="url(#ID-wall)" stroke="#6f8a97" stroke-width="2"/>
 <rect x="26" y="28" width="188" height="116" rx="24" fill="none" stroke="#2a6a82" stroke-width="2" opacity=".55"/>
 <rect x="28" y="30" width="184" height="112" rx="22" fill="url(#ID-water)"/>
 <path d="M34 36 H202 V62 H62 V136 H34 Z" fill="#7fe0ee" opacity=".32" stroke="#b8f3fa" stroke-width="1" stroke-linejoin="round"/>
 <path d="M34 36 H202 V62 H62 V136 H34 Z" fill="none" stroke="#0a4d7a" stroke-width="2" opacity=".25" stroke-linejoin="round" transform="translate(1.5 1.5)"/>
 <g class="xa-jz-leds" clip-path="url(#ID-clip)" fill="url(#ID-led)"><ellipse cx="120" cy="86" rx="92" ry="58"/><ellipse cx="46" cy="50" rx="22" ry="18"/><ellipse cx="196" cy="128" rx="22" ry="16"/></g>
 <rect class="xa-jz-dim" x="28" y="30" width="184" height="112" rx="22" fill="#1b1433"/>
 <g class="xa-jz-bub" fill="#fff">${bubs}</g>
 ${streams}
 <path d="M36 40 Q100 34 150 42" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".22"/>
 ${jets}
 <g fill="#3a444e" stroke="#1d242b" stroke-width=".8"><rect x="48" y="19" width="28" height="13" rx="6.5"/><rect x="88" y="19" width="28" height="13" rx="6.5"/><rect x="128" y="19" width="28" height="13" rx="6.5"/><rect x="15" y="74" width="13" height="28" rx="6.5"/></g>
 <g fill="#fff" opacity=".22"><rect x="52" y="21" width="20" height="3" rx="1.5"/><rect x="92" y="21" width="20" height="3" rx="1.5"/><rect x="132" y="21" width="20" height="3" rx="1.5"/><rect x="17" y="78" width="3" height="20" rx="1.5"/></g>
 <rect class="xa-jz-fall" x="176" y="32" width="22" height="22" fill="#e6fbff"/>
 ${falls}
 <g fill="none" stroke="#fff" stroke-width="1"><ellipse class="xa-jz-rip" cx="187" cy="56" rx="14" ry="4"/><ellipse class="xa-jz-rip" cx="187" cy="56" rx="14" ry="4"/></g>
 <rect x="170" y="21" width="34" height="11" rx="4" fill="url(#ID-blade)" stroke="#7f8b97" stroke-width=".8"/>
 <rect x="174" y="29" width="26" height="4" rx="2" fill="url(#ID-chrome)"/>
 <g fill="#fff"><ellipse class="xa-jz-steam" cx="86" cy="88" rx="12" ry="7"/><ellipse class="xa-jz-steam" cx="132" cy="104" rx="14" ry="8"/><ellipse class="xa-jz-steam" cx="170" cy="84" rx="11" ry="6"/><ellipse class="xa-jz-steam" cx="108" cy="72" rx="10" ry="6"/></g>
 <rect x="150" y="148" width="62" height="13" rx="4" fill="#0e1b2c" stroke="#27394f"/>
 <text class="xa-lcd xa-jz-dsp" x="181" y="158" text-anchor="middle">38°</text>
 <circle class="xa-led xa-ledb" cx="141" cy="154.5" r="3"/>`);
  };
  D["color-bulb"] = () => {
    const P = BULB, C = ["#ff6fae", "#4fd8ff", "#ffb347"];
    const g = C.map((c, i) => `<radialGradient id="ID-cbh${i}"><stop offset="0" stop-color="${c}" stop-opacity=".75"/><stop offset=".45" stop-color="${c}" stop-opacity=".28"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient><radialGradient id="ID-cbf${i}" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".35" stop-color="${c}" stop-opacity=".95"/><stop offset="1" stop-color="${c}" stop-opacity=".6"/></radialGradient>`).join("");
    return lights(`<defs>${g}</defs>
      <path d="${P}" fill="#cfd5dc" fill-opacity=".16" stroke="#fff" stroke-opacity=".35" stroke-width="1.5"/>
      <g class="xa-cb-lit">${C.map((c, i) => `<g class="xa-cb-c" style="animation-delay:${-i * 3}s"><circle class="xa-cb-halo" cx="100" cy="68" r="76" fill="url(#ID-cbh${i})"/><path d="${P}" fill="url(#ID-cbf${i})"/></g>`).join("")}</g>
      <path d="${P}" fill="url(#ID-glass)"/><path d="${P}" fill="none" stroke="#fff" stroke-opacity=".4"/>
      <rect x="83" y="118" width="34" height="6" rx="2" fill="#c9ced4"/>
      ${screw(83, 124, 34)}`, shadow(100, 208, 34, 4));
  };

  D["filament-bulb"] = () => {
    const P = "M100 14 C124 14 136 34 136 58 C136 84 124 100 118 112 C116 117 116 120 116 124 L84 124 C84 120 84 117 82 112 C76 100 64 84 64 58 C64 34 76 14 100 14 Z";
    const fil = [86, 93, 100, 107, 114].map((x) => `M${x} 104` + " q2 -3 0 -6".repeat(9)).join(" ");
    return lights(`<circle class="xa-fb-lit xa-fb-halo" cx="100" cy="66" r="72" fill="url(#ID-halo)" style="--k:.75"/>
      <path d="${P}" fill="#c98a2b" fill-opacity=".28" stroke="#e7b260" stroke-opacity=".55" stroke-width="1.5"/>
      <path class="xa-fb-lit" d="${P}" fill="url(#ID-fill)" style="--k:.55"/>
      <path class="xa-fb-wire" d="M100 118 V52 M86 104 L100 118 L114 104 M86 50 L100 52 L114 50" stroke-width="1.1"/>
      <path class="xa-fb-wire" d="${fil}"/>
      <g class="xa-fb-lit"><path class="xa-fb-flk" d="${fil}" fill="none" stroke="#fff3c4" stroke-width="2.4" stroke-opacity=".45"/><path class="xa-fb-flk" d="${fil}" fill="none" stroke="#fffbe8" stroke-width="1.1"/></g>
      <path d="${P}" fill="url(#ID-glass)"/>
      <rect x="84" y="124" width="32" height="22" rx="3" fill="url(#ID-brass)"/>
      ${[4, 9, 14].map((d) => `<path d="M84 ${124 + d} L116 ${127 + d}" stroke="#4d535a" stroke-width="1.2"/>`).join("")}
      <path d="M87 146 Q100 156 113 146 Z" fill="#3b4046"/>`, shadow(100, 208, 32, 4));
  };

  D["pendant-cluster"] = () => {
    const pend = (x, y, d) => `<g class="xa-pcl-sw" style="animation-delay:${d}s">
        <path d="M${x} 24 V${y - 18}" stroke="#2f3439" stroke-width="1.5"/>
        <rect x="${x - 5}" y="${y - 22}" width="10" height="6" rx="1.5" fill="url(#ID-brass)"/>
        <circle class="xa-pcl-lit xa-pcl-halo" cx="${x}" cy="${y}" r="40" fill="url(#ID-halo)" style="--k:.8"/>
        <circle cx="${x}" cy="${y}" r="17" fill="#fff" fill-opacity=".07" stroke="#fff" stroke-opacity=".4"/>
        <circle class="xa-pcl-lit" cx="${x}" cy="${y}" r="16" fill="url(#ID-fill)" style="--k:.95"/>
        <path class="xa-pcl-wire" d="M${x - 4} ${y + 4} q2 -6 4 0 t4 0"/>
        <circle cx="${x}" cy="${y}" r="17" fill="url(#ID-glass)"/></g>`;
    return lights(`<ellipse class="xa-pcl-lit" cx="100" cy="174" rx="80" ry="7" fill="url(#ID-pool)" style="--k:.6"/>
      <rect x="50" y="18" width="100" height="6" rx="3" fill="url(#ID-brass)"/>
      ${pend(66, 92, 0)}${pend(134, 84, -2)}${pend(100, 124, -4)}`);
  };

  D["chandelier"] = () => {
    const arms = [[46, 110], [72, 100], [100, 96], [128, 100], [154, 110]];
    const drops = [[61, 114], [80, 104], [100, 124], [120, 104], [139, 114]];
    const star = (x, y) => `<path class="xa-chd-sp" d="M${x} ${y - 5} L${x + 1.2} ${y - 1.2} L${x + 5} ${y} L${x + 1.2} ${y + 1.2} L${x} ${y + 5} L${x - 1.2} ${y + 1.2} L${x - 5} ${y} L${x - 1.2} ${y - 1.2} Z" fill="#fff"/>`;
    return lights(`<circle class="xa-chd-lit xa-chd-halo" cx="100" cy="92" r="88" fill="url(#ID-halo)" style="--k:.5"/>
      <rect x="90" y="0" width="20" height="6" rx="2" fill="url(#ID-brass)"/><path d="M100 6 V44" stroke="#9c7a3a" stroke-width="2" stroke-dasharray="3 2"/>
      <path d="M94 44 L106 44 L104 64 Q110 70 106 78 L108 104 L92 104 L94 78 Q90 70 96 64 Z" fill="url(#ID-brass)"/>
      ${arms.map(([x, y]) => `<path d="M100 104 C${(100 + (x - 100) * 1.08).toFixed(1)} 128 ${x} 120 ${x} ${y}" fill="none" stroke="url(#ID-brass)" stroke-width="4" stroke-linecap="round"/>`).join("")}
      <circle cx="100" cy="106" r="7" fill="url(#ID-brass)"/>
      ${drops.map(([x, y]) => `<path d="M${x} ${y} V${y + 8}" stroke="#d9c79a" stroke-width=".6"/><path d="M${x} ${y + 8} L${x + 3} ${y + 14} L${x} ${y + 21} L${x - 3} ${y + 14} Z" fill="#e8f3ff" fill-opacity=".6" stroke="#fff" stroke-opacity=".6" stroke-width=".6"/>`).join("")}
      ${arms.map(([x, y], i) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="2.5" fill="url(#ID-brass)"/><rect x="${x - 3.5}" y="${y - 16}" width="7" height="16" rx="1.5" fill="#e6dccb"/>
        <circle class="xa-chd-lit xa-chd-halo" cx="${x}" cy="${y - 21}" r="18" fill="url(#ID-halo)" style="--k:.9;animation-delay:${-i * 0.7}s"/>
        <g class="xa-chd-lit"><path class="xa-chd-flame" d="M${x} ${y - 28} C${x + 4} ${y - 22} ${x + 4} ${y - 16} ${x} ${y - 16} C${x - 4} ${y - 16} ${x - 4} ${y - 22} ${x} ${y - 28} Z" fill="url(#ID-fill)" style="animation-delay:${-i * 0.37}s"/></g>
        <path d="M${x} ${y - 28} C${x + 4} ${y - 22} ${x + 4} ${y - 16} ${x} ${y - 16} C${x - 4} ${y - 16} ${x - 4} ${y - 22} ${x} ${y - 28} Z" fill="#fff" fill-opacity=".12" stroke="#fff" stroke-opacity=".3" stroke-width=".8"/>`).join("")}
      <g class="xa-chd-sps">${drops.map(([x, y]) => star(x, y + 14)).join("")}</g>`);
  };

  D["garden-spotlight"] = () => lights(`<path class="xa-gs-lit xa-gs-beam" d="M89 62 L36 0 L164 0 L111 62 Z" fill="url(#ID-up)" style="--k:.55"/>
      <g class="xa-gs-motes" fill="#fff"><circle cx="92" cy="50" r="1.4"/><circle cx="108" cy="46" r="1.1"/><circle cx="100" cy="54" r="1.6"/><circle cx="96" cy="40" r="1"/></g>
      <path d="M0 160 Q50 152 100 158 T200 156 V180 H0 Z" fill="#1d3a1b"/>
      <g fill="#3f7a3a">${[12, 34, 58, 142, 166, 188].map((x) => `<path d="M${x} 162 l-4 -14 l6 12 l2 -16 l3 18 l6 -12 l-3 14 Z"/>`).join("")}</g>
      <path d="M96 140 L100 172 L104 140 Z" fill="#7c838b"/>
      <rect x="86" y="70" width="28" height="64" rx="5" fill="url(#ID-steel)"/>
      ${[86, 98, 110, 122].map((y) => `<path d="M86 ${y} H114" stroke="#4d535a" stroke-width="1.2" opacity=".6"/>`).join("")}
      <rect x="90" y="132" width="20" height="9" rx="2" fill="#5a6067"/>
      <ellipse cx="100" cy="68" rx="15" ry="5" fill="#3b4046"/><ellipse cx="100" cy="64" rx="15" ry="5" fill="url(#ID-steel)"/>
      <ellipse cx="100" cy="64" rx="11" ry="3.5" fill="#2a2f35"/><ellipse class="xa-gs-lit" cx="100" cy="64" rx="11" ry="3.5" fill="url(#ID-fill)" style="--k:1"/>
      <ellipse class="xa-gs-lit xa-gs-halo" cx="100" cy="60" rx="30" ry="14" fill="url(#ID-halo)" style="--k:.9"/>`);

  D["christmas-tree"] = () => {
    const B = [[78, 64], [96, 70], [114, 66], [70, 96], [88, 104], [108, 104], [128, 98], [62, 132], [80, 140], [100, 142], [120, 140], [140, 134]];
    const C = ["#ff4b4b", "#ffd54f", "#4fc3f7", "#69f0ae", "#ff80ab", "#ffa726"];
    const S = "M100 6 L104 16 L115 17 L106 24 L109 35 L100 29 L91 35 L94 24 L85 17 L96 16 Z";
    return lights(`<path d="M100 22 L132 70 L118 70 L146 106 L128 106 L158 146 L42 146 L72 106 L54 106 L82 70 L68 70 Z" fill="#1f6b3a"/>
      <path d="M100 22 L132 70 L118 70 L146 106 L128 106 L158 146 L100 146 Z" fill="#000" fill-opacity=".14"/>
      <path d="M78 62 Q100 76 120 64 M68 94 Q98 112 132 96 M58 130 Q100 148 144 132" fill="none" stroke="#c9d1d8" stroke-width="1" opacity=".6"/>
      <rect x="92" y="146" width="16" height="12" fill="#6b4524"/><path d="M80 156 L120 156 L114 176 L86 176 Z" fill="#a8323a"/><path d="M80 156 L120 156" stroke="#7d222a" stroke-width="2"/>
      ${B.map(([x, y], i) => `<circle class="xa-xt-b" cx="${x}" cy="${y}" r="3.6" fill="${C[i % 6]}" style="animation-delay:${(-(i % 4) * 0.6).toFixed(1)}s"/>`).join("")}
      <circle class="xa-xt-lit xa-xt-halo" cx="100" cy="21" r="30" fill="url(#ID-halo)" style="--k:.9"/>
      <g class="xa-xt-lit"><g class="xa-xt-rays"><path d="M100 2 V-6 M100 38 V46 M82 20 H74 M118 20 H126 M88 8 L83 3 M112 8 L117 3 M88 32 L83 37 M112 32 L117 37" stroke="#ffe082" stroke-width="1.6" stroke-linecap="round"/></g></g>
      <path d="${S}" fill="#b8963a"/>
      <path class="xa-xt-lit" d="${S}" fill="#ffe27a"/>`, shadow(100, 207, 40, 4));
  };

  D["power-meter"] = () => sk(`<defs><linearGradient id="ID-pmb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9aa2aa"/><stop offset="1" stop-color="#6c757d"/></linearGradient>
   <radialGradient id="ID-pmled"><stop offset="0" stop-color="#ff5a4e" stop-opacity=".9"/><stop offset="1" stop-color="#ff5a4e" stop-opacity="0"/></radialGradient></defs>
      <rect x="40" y="123" width="40" height="8" rx="2" fill="#2c2f36"/>
      <path d="M48 116 V124 M60 116 V124 M72 116 V124" stroke-width="3.2" stroke-linecap="round" fill="none" stroke="#2a2d33"/>
      <path d="M48 116 V124" stroke="#7a5230" stroke-width="3.2"/><path d="M72 116 V124" stroke="#2f5d9a" stroke-width="3.2"/>
      <g class="xa-pm-flow">${chase([[48, 124], [48, 116]], 3, 1.1, "#ffd27a", 1)}${chase([[60, 124], [60, 116]], 3, 1.1, "#ffd27a", 1)}</g>
      <rect x="32" y="14" width="60" height="94" rx="6" fill="#000" opacity=".3"/>
      <rect x="30" y="12" width="60" height="94" rx="6" fill="url(#ID-pmb)" stroke="#fff" stroke-opacity=".25"/>
      <rect x="57" y="16" width="6" height="5" rx="1" fill="#1a1d22"/>
      <rect x="36" y="24" width="48" height="44" rx="6" fill="#b9bfc5" stroke="#8d959d" stroke-width=".8"/>
      ${lcd(40, 28, 40, 21, "1.24 kW")}
      <rect x="44" y="55" width="14" height="5" rx="1.5" fill="#eceef0" stroke="#a9b1b8" stroke-width=".5"/><rect x="62" y="55" width="14" height="5" rx="1.5" fill="#eceef0" stroke="#a9b1b8" stroke-width=".5"/>
      <path d="M60 74 v8 M56 78 h8" stroke="#4a525a" stroke-width="1.4" stroke-linecap="round"/>
      <circle class="xa-pm-halo" cx="46" cy="94" r="8" fill="url(#ID-pmled)"/>
      <circle class="xa-pm-led1" cx="46" cy="94" r="2.6"/><circle class="xa-pm-led2" cx="60" cy="94" r="2.6"/><circle cx="74" cy="94" r="2.6" fill="#2a3a2c"/>
      <rect x="36" y="106" width="48" height="11" rx="2" fill="#7d868f"/><circle cx="60" cy="111.5" r="2" fill="#5a6168"/><path d="M58.6 111.5 h2.8" stroke="#33383e" stroke-width=".7"/>`, 0, 0);
  D["pellet-boiler"] = () => {
    const pel = Array.from({ length: 40 }, (_, i) => { const x = (18 + (i * 33.3) % 90).toFixed(1), y = (50 + (i * 8.47) % 16).toFixed(1); return `<rect x="${x}" y="${y}" width="3.2" height="1.6" rx=".8" transform="rotate(${(i * 47) % 180} ${x} ${y})" fill="${i % 3 ? "#c9a066" : "#b38a50"}"/>`; }).join("");
    const pel2 = Array.from({ length: 8 }, (_, i) => `<rect x="${(40.5 + (i * 3.3) % 6).toFixed(1)}" y="${(94 + (i * 5.3) % 22).toFixed(1)}" width="3.2" height="1.6" rx=".8" fill="#000" opacity=".28"/>`).join("");
    return nest("0 0 280 214", 0, 36, 200, 152.9, `<defs>
<linearGradient id="ID-pbf" x1="0" x2="1"><stop offset="0" stop-color="#e9ebed"/><stop offset="1" stop-color="#cfd3d7"/></linearGradient>
<linearGradient id="ID-pbs" x1="0" x2="1"><stop offset="0" stop-color="#b3b8bd"/><stop offset="1" stop-color="#9aa0a6"/></linearGradient>
<linearGradient id="ID-hop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6a7076"/><stop offset="1" stop-color="#4c5157"/></linearGradient>
<clipPath id="ID-open"><polygon points="20,66 36,55 104,51 96,63"/></clipPath>
<clipPath id="ID-sight"><rect x="40" y="74" width="9" height="44" rx="2"/></clipPath>
<radialGradient id="ID-fire" cx=".5" cy=".7" r=".6"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#ffb02e"/><stop offset="1" stop-color="#ff5a1f"/></radialGradient></defs>
<ellipse cx="160" cy="206" rx="118" ry="6" fill="#000" opacity=".28"/>
<g fill="none" stroke-width="6" stroke-linecap="round"><path d="M156 32 V6 H186" stroke="#b8743b"/><path d="M172 32 V14 H186" stroke="#8f5a32"/></g>
${chase([[156, 32], [156, 6], [186, 6]], 8, 1.1, "#ffe2b8", 1)}${chase([[186, 14], [172, 14], [172, 32]], 6, 1.1, "#ffe2b8", 1)}
<g class="xa-pb-heat"><path d="M200 28 q3 -5 0 -10 q-3 -5 0 -10"/><path d="M214 28 q3 -5 0 -10 q-3 -5 0 -10"/><path d="M228 28 q3 -5 0 -10 q-3 -5 0 -10"/></g>
<polygon points="132,40 146,30 266,30 252,40" fill="#6d7379"/>
<polygon points="252,40 266,30 266,190 252,200" fill="url(#ID-pbs)"/>
<rect x="132" y="40" width="120" height="160" fill="url(#ID-pbf)"/>
<rect x="132" y="40" width="120" height="12" fill="#50565c"/>
<path d="M132 120 H252" stroke="#aeb3b8" stroke-width="1.2"/>
<rect x="244" y="74" width="3" height="16" rx="1.5" fill="#9aa0a6"/><rect x="244" y="150" width="3" height="16" rx="1.5" fill="#9aa0a6"/>
<rect x="138" y="198" width="10" height="5" fill="#2e3237"/><rect x="236" y="198" width="10" height="5" fill="#2e3237"/>
<rect x="208" y="55" width="36" height="24" rx="3" fill="#2b2f35"/>
${lcd(211, 58, 30, 18, "68°C")}
<circle class="xa-led" cx="214" cy="82" r="1.6"/>
<circle cx="192" cy="160" r="15" fill="#2b2f35"/>
<circle cx="192" cy="160" r="11.5" fill="#120a06"/>
<circle class="xa-pb-glow" cx="192" cy="161" r="11" fill="#ff8a2a"/>
<path d="M183 168 H201" stroke="#555" stroke-width="2"/>
<path class="xa-pb-fl" d="M186 168 Q184 160 189 154 Q189 160 192 160 Q190 152 195 147 Q196 157 199 160 Q201 164 198 168 Z" fill="url(#ID-fire)"/>
<path class="xa-pb-fl xa-pb-f2" d="M188 168 Q187 163 191 159 Q192 163 194 163 Q195 160 196 158 Q199 164 196 168 Z" fill="#ffcf4a"/>
<path class="xa-pb-fl xa-pb-f3" d="M190 168 Q190 165 192 163 Q194 165 194 168 Z" fill="#fff3b0"/>
<circle cx="192" cy="160" r="11.5" fill="none" stroke="#fff" stroke-opacity=".18"/>
<path d="M76 172 L136 112" stroke="#3f444a" stroke-width="13" stroke-linecap="round"/>
<path d="M76 172 L136 112" fill="none" stroke="#7b828a" stroke-width="6" stroke-dasharray="3 4"/>
${chase([[78, 170], [134, 114]], 9, 1.7, "#c9a066", 1.2)}
<rect x="128" y="104" width="10" height="16" rx="2" fill="#3f444a"/>
<rect x="62" y="126" width="12" height="40" fill="#4c5157"/>
<rect x="56" y="160" width="30" height="42" rx="3" fill="#3a3f45"/>
<rect x="60" y="196" width="22" height="6" fill="#2e3237"/>
<polygon points="20,66 96,63 82,126 50,128" fill="url(#ID-hop)"/>
<polygon points="96,63 104,51 90,116 82,126" fill="#3f444a"/>
<polygon points="20,66 36,55 104,51 96,63" fill="#1e2125"/>
<g clip-path="url(#ID-open)"><g class="xa-pb-pile">${pel}</g></g>
<polygon points="20,66 36,55 104,51 96,63" fill="none" stroke="#7b828a" stroke-width="1.2"/>
<rect x="40" y="74" width="9" height="44" rx="2" fill="#1e2125"/>
<g clip-path="url(#ID-sight)"><rect x="40" y="92" width="9" height="26" fill="#c9a066"/>${pel2}</g>
<rect x="40" y="74" width="9" height="44" rx="2" fill="none" stroke="#8a9096"/>`);
  };
  D["pool-robot"] = () => {
    const wave = (y) => `M-10 ${y} q8 -3.5 16 0` + " t16 0".repeat(19) + ` V178 H-10 Z`;
    const tiles = Array.from({ length: 16 }, (_, i) => `M${30 + i * 15} 162 V170`).join(" ") + Array.from({ length: 8 }, (_, i) => ` M8 ${42 + i * 15} H18 M262 ${42 + i * 15} H272`).join("");
    const wheel = (x) => `<g class="xa-spin" style="--sp:.6s"><circle cx="${x}" cy="153.5" r="4" fill="#4a535b"/><path d="M${x - 3.5} 153.5 H${x + 3.5} M${x} 150 V157" stroke="#7d868e" stroke-width="1"/></g>`;
    return nest("0 0 280 184", 0, 56, 200, 131.4, `<defs>
<linearGradient id="ID-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fa6d9" stop-opacity=".55"/><stop offset="1" stop-color="#0c5f8a" stop-opacity=".9"/></linearGradient>
<linearGradient id="ID-shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#dfe5ea"/><stop offset="1" stop-color="#b6c0c8"/></linearGradient>
<clipPath id="ID-pool"><rect x="18" y="30" width="244" height="132"/></clipPath></defs>
<ellipse cx="140" cy="178" rx="136" ry="4" fill="#000" opacity=".28"/>
<rect x="8" y="30" width="264" height="140" rx="3" fill="#5f6f86"/>
<rect x="18" y="30" width="244" height="132" fill="#6f86a0"/>
<path d="${tiles}" stroke="#4c5a70"/>
<rect x="2" y="24" width="276" height="8" rx="2" fill="#a9aeb3"/>
<g clip-path="url(#ID-pool)">
 <g class="xa-pr-wave xa-pr-wb"><path d="${wave(46)}" fill="url(#ID-w)" opacity=".55"/></g>
 <g class="xa-pr-wave"><path d="${wave(48)}" fill="url(#ID-w)"/></g>
 <g class="xa-pr-caus" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round"><path d="M40 150 q10 -4 20 0 t20 0"/><path d="M110 154 q10 -4 20 0 t20 0"/><path d="M180 150 q10 -4 20 0 t20 0"/></g>
</g>
<g class="xa-pr-drive"><g class="xa-pr-flip">
 <path d="M72 126 C70 104 96 96 92 74 S104 50 110 40" fill="none" stroke="#2a3138" stroke-width="1.6" stroke-linecap="round"/>
 <g class="xa-pr-bub" fill="#fff"><circle cx="64" cy="124" r="1.8"/><circle cx="78" cy="122" r="1.4"/><circle cx="70" cy="126" r="2.2"/><circle cx="84" cy="125" r="1.2"/></g>
 <g class="xa-pr-deb" fill="#7a5b3a"><rect x="112" y="156" width="3" height="2" rx="1"/><circle cx="118" cy="157" r="1.3"/><rect x="122" y="155.5" width="2.5" height="2.5" rx=".8"/></g>
 <rect x="38" y="146" width="68" height="15" rx="7.5" fill="#2a3138"/>
 <rect x="39.5" y="147.5" width="65" height="12" rx="6" fill="none" stroke="#5a636b" stroke-width="3" stroke-dasharray="3 3"/>
 ${wheel(46)}${wheel(98)}
 <path d="M36 148 V136 Q36 122 52 120 H92 Q108 122 108 136 V148 Z" fill="url(#ID-shell)" stroke="#9aa6b0"/>
 <rect x="36" y="140" width="72" height="5" fill="#1e7fd0"/>
 <path d="M52 120 V112 Q52 106 58 106 H86 Q92 106 92 112 V120" fill="none" stroke="#9aa6b0" stroke-width="4" stroke-linecap="round"/>
 <rect x="45" y="125" width="9" height="13" rx="2" fill="#c9ced3" stroke="#9aa6b0" stroke-width=".8"/>
 <rect x="46.5" y="132.5" width="6" height="4" rx="1" fill="#8d6e4a"/>
 <circle class="xa-led xa-ledp" cx="98" cy="128" r="2.3"/>
 <g class="xa-pr-brush"><circle cx="108" cy="152" r="7" fill="#1e7fd0"/><path d="M101 152 H115 M108 145 V159 M103 147 L113 157 M103 157 L113 147" stroke="#bfe3ff" stroke-width="1.4"/><circle cx="108" cy="152" r="2" fill="#0f3e66"/></g>
</g></g>`);
  };
  D["water-pump"] = () => {
    const wave = (x, y, h) => `M${x} ${y} q6 -3 12 0` + " t12 0".repeat(11) + ` V${h} H${x} Z`;
    const blades = [0, 60, 120, 180, 240, 300].map((a) => `<path d="M0 0 Q7 -4 5 -13" transform="rotate(${a})"/>`).join("");
    const main = [[84, 92], [84, 42], [86.3, 36.3], [92, 34], [212, 34], [217.7, 36.3], [220, 42], [220, 58]];
    return nest("0 0 260 170", 0, 64, 200, 130.8, `<defs>
<linearGradient id="ID-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#dfe5ea"/><stop offset="1" stop-color="#b9c3cb"/></linearGradient>
<linearGradient id="ID-vol" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5fb4ff"/><stop offset="1" stop-color="#1e6fc9"/></linearGradient>
<linearGradient id="ID-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fa9f5" stop-opacity=".75"/><stop offset="1" stop-color="#3fa9f5" stop-opacity=".95"/></linearGradient>
<clipPath id="ID-tank"><rect x="10" y="64" width="36" height="84" rx="2"/></clipPath>
<clipPath id="ID-basin"><rect x="198" y="128" width="52" height="24" rx="2"/></clipPath></defs>
<ellipse cx="130" cy="160" rx="122" ry="5" fill="#000" opacity=".28"/>
<rect x="8" y="60" width="40" height="92" rx="4" fill="#5d6b7a" opacity=".55" stroke="#9fb3c3" stroke-width="1.2"/>
<g clip-path="url(#ID-tank)"><g transform="translate(0 32)"><g class="xa-wp-wave"><path d="${wave(-2, 66, 156)}" fill="url(#ID-water)"/></g></g></g>
<rect x="6" y="56" width="44" height="6" rx="2" fill="#9fb3c3"/>
<path d="M40 80 H46 M40 100 H46 M40 120 H46 M40 140 H46" stroke="#9fb3c3" stroke-width=".8"/>
<g fill="none" stroke-linecap="round">
 <path d="M46 116 H62" stroke="#c3ced7" stroke-width="10"/>
 <path d="M84 92 V42 Q84 34 92 34 H212 Q220 34 220 42 V58" stroke="#c3ced7" stroke-width="10"/>
 <path d="M46 116 H62" stroke="#34404d" stroke-width="6"/>
 <path d="M84 92 V42 Q84 34 92 34 H212 Q220 34 220 42 V58" stroke="#34404d" stroke-width="6"/>
</g>
${chase([[46, 116], [62, 116]], 3, 1.9, "#3fa9f5", .9)}${chase(main, 24, 1.9, "#3fa9f5", .9)}
<rect x="214" y="56" width="12" height="6" rx="1.5" fill="#9fb3c3"/>
<g class="xa-wp-jet"><rect x="217.5" y="62" width="5" height="70" rx="2.5" fill="#3fa9f5" opacity=".55"/>${chase([[220, 62], [220, 132]], 7, 1.2, "#e6f4ff", .9)}</g>
<g clip-path="url(#ID-basin)"><g class="xa-wp-wave xa-wp-wb"><path d="${wave(186, 134, 164)}" fill="url(#ID-water)"/></g></g>
<g class="xa-wp-rip" fill="none" stroke="#fff"><ellipse cx="220" cy="135" rx="9" ry="2.2"/><ellipse cx="220" cy="135" rx="9" ry="2.2"/></g>
<rect x="196" y="126" width="56" height="28" rx="4" fill="none" stroke="#9fb3c3" stroke-width="2"/>
<rect x="74" y="138" width="20" height="9" rx="1.5" fill="#a9b4bd"/>
<rect x="104" y="140" width="92" height="7" rx="2" fill="#a9b4bd"/>
<rect x="104" y="106" width="10" height="20" fill="#b9c3cb"/>
<g class="xa-hum">
<rect x="110" y="92" width="78" height="48" rx="11" fill="url(#ID-body)" stroke="#aab6c0"/>
<path d="${Array.from({ length: 10 }, (_, i) => `M${124 + i * 6} 97 V135`).join(" ")}" stroke="#c4ced6" stroke-width="1.6"/>
<rect x="110" y="114" width="78" height="3" fill="#3fa9f5" opacity=".85"/>
<rect x="186" y="97" width="9" height="38" rx="4" fill="#aab6c0"/>
<rect x="134" y="82" width="28" height="12" rx="2" fill="#e8edf1" stroke="#aab6c0"/>
<circle class="xa-led" cx="155" cy="88" r="2.4"/></g>
<circle cx="84" cy="116" r="24" fill="url(#ID-vol)"/>
<circle cx="84" cy="116" r="16" fill="#0f2f52" opacity=".85"/>
<g transform="translate(84 116)"><g class="xa-spin" style="--sp:.5s" fill="none" stroke="#bfe3ff" stroke-width="2.2" stroke-linecap="round">${blades}<circle r="3.2" fill="#bfe3ff" stroke="none"/></g></g>
<path d="M72 104 A16 16 0 0 1 92 102" stroke="#fff" stroke-width="1.5" fill="none" opacity=".35"/>`);
  };
  D["industrial-pump"] = () => {
    const teeth = (n, r, h) => Array.from({ length: n }, (_, i) => `<rect x="-2" y="${-r}" width="4" height="${h}" rx="1" transform="rotate(${(360 / n) * i})"/>`).join("");
    const out = [[78, 72], [78, 50], [80.3, 44.3], [86, 42], [280, 42]];
    return nest("0 0 280 190", 0, 56, 200, 135.7, `<defs>
<linearGradient id="ID-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dee2"/><stop offset=".45" stop-color="#8c969e"/><stop offset="1" stop-color="#4c555c"/></linearGradient>
<linearGradient id="ID-motor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d8f9c"/><stop offset=".25" stop-color="#c4ced5"/><stop offset=".55" stop-color="#5d6f7c"/><stop offset="1" stop-color="#2f3b44"/></linearGradient>
<radialGradient id="ID-pump" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#7fa3c4"/><stop offset=".5" stop-color="#3b6488"/><stop offset="1" stop-color="#1d3550"/></radialGradient>
<pattern id="ID-haz" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#f2a516"/><rect width="4" height="8" fill="#22262a"/></pattern></defs>
<ellipse cx="140" cy="180" rx="134" ry="5" fill="#000" opacity=".28"/>
<g class="xa-ip-rig">
<rect x="10" y="160" width="260" height="13" rx="2" fill="#3b4248"/><rect x="10" y="160" width="260" height="3" fill="#6b747c"/>
<g fill="#9aa3aa"><circle cx="22" cy="168" r="2.4"/><circle cx="96" cy="168" r="2.4"/><circle cx="184" cy="168" r="2.4"/><circle cx="258" cy="168" r="2.4"/></g>
<g fill="none">
 <path d="M0 112 H40" stroke="#6c757d" stroke-width="15"/>
 <path d="M78 72 V50 Q78 42 86 42 H280" stroke="#6c757d" stroke-width="15"/>
 <path d="M0 112 H40" stroke="#262b30" stroke-width="9"/>
 <path d="M78 72 V50 Q78 42 86 42 H280" stroke="#262b30" stroke-width="9"/>
 <path class="xa-ip-glow" d="M78 72 V50 Q78 42 86 42 H280" stroke="#3fa9f5" stroke-width="9"/>
</g>
${chase([[0, 112], [40, 112]], 5, 2.4, "#7cc4ff", .6)}${chase(out, 22, 2.4, "#7cc4ff", .6)}
<rect x="38" y="96" width="7" height="32" rx="1.5" fill="url(#ID-steel)"/><rect x="62" y="66" width="32" height="7" rx="1.5" fill="url(#ID-steel)"/>
<rect x="196" y="28" width="7" height="28" rx="1.5" fill="url(#ID-steel)"/>
<g fill="#3b4248"><circle cx="41.5" cy="101" r="1.4"/><circle cx="41.5" cy="123" r="1.4"/><circle cx="67" cy="69.5" r="1.4"/><circle cx="89" cy="69.5" r="1.4"/><circle cx="199.5" cy="32" r="1.4"/><circle cx="199.5" cy="52" r="1.4"/></g>
<g class="xa-ip-ring" fill="none" stroke="#3fa9f5" stroke-width="2"><circle cx="78" cy="58" r="9"/><circle cx="78" cy="58" r="9"/></g>
<rect x="122" y="32" width="4" height="6" fill="#8c969e"/>
<circle cx="124" cy="20" r="15" fill="url(#ID-steel)"/><circle cx="124" cy="20" r="12.5" fill="#d6dade"/>
<path d="M114.9 25.3 A10.5 10.5 0 0 1 130.8 12" stroke="#43a047" stroke-width="2.2" fill="none"/><path d="M130.8 12 A10.5 10.5 0 0 1 134.3 18.2" stroke="#ffb31a" stroke-width="2.2" fill="none"/><path d="M134.3 18.2 A10.5 10.5 0 0 1 133.1 25.3" stroke="#e53935" stroke-width="2.2" fill="none"/>
<g transform="rotate(12 124 20)"><path class="xa-ip-ndl" d="M124 20 L124 9.5" stroke="#1d2125" stroke-width="1.4" stroke-linecap="round"/></g>
<circle cx="124" cy="20" r="1.8" fill="#1d2125"/>
<path d="M58 140 L98 140 L104 160 L52 160 Z" fill="#3b4248"/>
<circle cx="78" cy="112" r="36" fill="url(#ID-pump)" stroke="#16283b" stroke-width="1.5"/>
<g fill="#c9d1d7"><circle cx="106.6" cy="123.9" r="2.2"/><circle cx="89.9" cy="140.6" r="2.2"/><circle cx="66.1" cy="140.6" r="2.2"/><circle cx="49.4" cy="123.9" r="2.2"/><circle cx="49.4" cy="100.1" r="2.2"/><circle cx="66.1" cy="83.4" r="2.2"/><circle cx="89.9" cy="83.4" r="2.2"/><circle cx="106.6" cy="100.1" r="2.2"/></g>
<circle cx="78" cy="112" r="24" fill="#0e1a26"/>
<g transform="translate(78 112)"><g class="xa-spin" style="--sp:.6s" fill="#e8ecef"><circle r="21" fill="none" stroke="#e8ecef" stroke-width="2.5"/>${teeth(12, 21, 5)}</g></g>
<path d="M70 102 A11 11 0 0 0 70 122 A30 30 0 0 1 70 102 Z" fill="#f2a516"/>
<g transform="translate(83 112)"><g class="xa-spin" style="--sp:.35s" fill="#bfc8cf"><circle r="8.5"/>${teeth(8, 12, 4.5)}<circle r="2.5" fill="#4c555c"/></g></g>
<path d="M56 96 A26 26 0 0 1 92 88" stroke="#fff" stroke-width="2" fill="none" opacity=".25"/>
<path d="M114 112 H150" stroke="#cfd6db" stroke-width="6" stroke-dasharray="3 3"/>
<rect x="116" y="98" width="32" height="28" rx="3" fill="url(#ID-haz)" stroke="#22262a"/>
<rect x="122" y="108" width="20" height="8" rx="2" fill="#22262a"/>
<path d="M122 112 H142" stroke="#cfd6db" stroke-width="4" stroke-dasharray="3 3"/>
<rect x="156" y="150" width="14" height="10" fill="#2f3b44"/><rect x="230" y="150" width="14" height="10" fill="#2f3b44"/>
<rect x="148" y="72" width="102" height="80" rx="12" fill="url(#ID-motor)" stroke="#232d35"/>
<path d="${Array.from({ length: 8 }, (_, i) => `M152 ${(80 + i * 8.5).toFixed(1)} H246`).join(" ")}" stroke="#2f3b44" stroke-width="1.6" opacity=".55"/>
<rect x="248" y="80" width="18" height="64" rx="6" fill="url(#ID-steel)" stroke="#2f3b44"/>
<path d="M252 86 V138 M254 86 V138 M256 86 V138 M258 86 V138 M260 86 V138 M262 86 V138" stroke="#2f3b44"/>
${lcd(160, 104, 38, 17, "7.5 kW")}
<rect x="174" y="54" width="56" height="20" rx="3" fill="#1d2329" stroke="#4c555c"/>
<circle class="xa-led" cx="187" cy="64" r="3.6"/><circle cx="202" cy="64" r="3.6" fill="#5a4416"/><circle cx="217" cy="64" r="3.6" fill="#4f1d19"/>
</g>`);
  };
  D["robot-mower"] = () => {
    const wheel = (x, y, r) => `<g transform="translate(${x} ${y})"><circle r="${r}" fill="#1b1b1b"/><g class="xa-rm-spin">${[0, 45, 90, 135].map((a) => `<rect x="${-r}" y="-.7" width="${2 * r}" height="1.4" fill="#2e2e2e" transform="rotate(${a})"/>`).join("")}<circle r="${(r * 0.55).toFixed(1)}" fill="#8d959c"/><path d="M${(-r * 0.55).toFixed(1)} 0 H${(r * 0.55).toFixed(1)} M0 ${(-r * 0.55).toFixed(1)} V${(r * 0.55).toFixed(1)}" stroke="#4a4f55" stroke-width="1.2"/></g></g>`;
    const clips = Array.from({ length: 10 }, (_, i) => `<path d="M${36 + (i % 4) * 2} ${-3 - (i % 3) * 2} l2 -3" stroke="${i % 2 ? "#6cc457" : "#3f9d35"}" style="animation-delay:${(i * 0.08).toFixed(2)}s"/>`).join("");
    const tufts = Array.from({ length: 24 }, (_, i) => { const x = 36 + i * 7.6 + (i % 3); return `M${x.toFixed(1)} 124 l${i % 2 ? 1.5 : -1.5} -${4 + (i % 3)}`; }).join(" ");
    return nest("30 24 190 106", 5, 88, 190, 106, `<defs><linearGradient id="ID-shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f7f8"/><stop offset="1" stop-color="#b8bec4"/></linearGradient></defs>
<rect x="34" y="118" width="182" height="10" rx="5" fill="#2c5a2a"/>
<path d="${tufts}" stroke="#4f8f3f" stroke-width="1.4" stroke-linecap="round"/>
<g transform="translate(112 120) scale(2.05)">
 <ellipse cx="2" cy="1" rx="40" ry="3" fill="#000" opacity=".3"/>
 <g class="xa-rm-speed" stroke="#b9b2d6" stroke-width="1" stroke-linecap="round"><path d="M42 -14 H50"/><path d="M46 -8 H54"/><path d="M40 -20 H48"/></g>
 <g class="xa-rm-clip" fill="none" stroke-width="1.4" stroke-linecap="round">${clips}</g>
 <g class="xa-rm-body">
  <ellipse class="xa-rm-blade" cx="0" cy="-4" rx="14" ry="1.2" fill="none" stroke="#9aa1a8" stroke-width=".8" stroke-dasharray="2 2"/>
  <path d="M-34 -6 Q-36 -22 -16 -27 L16 -28 Q34 -27 37 -12 L37 -6 Z" fill="url(#ID-shell)"/>
  <path d="M-30 -18 Q-26 -26 -12 -27 L14 -28 Q28 -27 32 -18 Z" fill="#8bc34a"/>
  <path d="M-30 -18 H32" stroke="#000" stroke-opacity=".12" stroke-width=".6"/>
  <rect x="-36" y="-10" width="10" height="5" rx="2" fill="#30343a"/>
  <rect x="-6" y="-31" width="16" height="4" rx="2" fill="#30343a"/><circle cx="12" cy="-29" r="1.6" fill="#e53935"/>
  <path d="M8 -31 V-42" stroke="#30343a" stroke-width="1.6"/><circle cx="8" cy="-43" r="2.4" fill="#30343a"/>
  <circle class="xa-led xa-ledp" cx="-14" cy="-23" r="1.8"/>
 </g>
 ${wheel(22, -9, 10)}${wheel(-24, -5, 5.5)}
</g>`);
  };
  D["sauna"] = () => {
    const slats = Array.from({ length: 20 }, (_, i) => `M${52 + i * 8} 30 V174`).join(" ");
    return nest("30 0 200 190", 0, 6, 200, 190, `<defs>
<linearGradient id="ID-wood" x1="0" x2="1"><stop offset="0" stop-color="#9a5f2f"/><stop offset=".5" stop-color="#b57a45"/><stop offset="1" stop-color="#8c5527"/></linearGradient>
<linearGradient id="ID-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2420"/><stop offset="1" stop-color="#14110f"/></linearGradient>
<radialGradient id="ID-glow" cx=".5" cy=".85" r=".8"><stop offset="0" stop-color="#ff9a3c" stop-opacity=".95"/><stop offset=".55" stop-color="#ff6a1f" stop-opacity=".4"/><stop offset="1" stop-color="#ff6a1f" stop-opacity="0"/></radialGradient>
<linearGradient id="ID-roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d959c"/><stop offset="1" stop-color="#5d656c"/></linearGradient>
<linearGradient id="ID-stove" x1="0" x2="1"><stop offset="0" stop-color="#3a3f45"/><stop offset=".5" stop-color="#5b626a"/><stop offset="1" stop-color="#2c3136"/></linearGradient>
<clipPath id="ID-door"><rect x="98" y="52" width="58" height="114" rx="3"/></clipPath></defs>
<ellipse cx="130" cy="180" rx="104" ry="6" fill="#000" opacity=".28"/>
<g class="xa-sa-stm" fill="#d9d4ec"><ellipse cx="196" cy="10" rx="7" ry="5"/><ellipse cx="200" cy="8" rx="6" ry="4"/><ellipse cx="193" cy="12" rx="8" ry="5"/><ellipse cx="198" cy="9" rx="6" ry="4"/></g>
<rect x="190" y="12" width="12" height="16" rx="1.5" fill="#6d757c"/><rect x="187" y="10" width="18" height="4" rx="1" fill="#4a5158"/>
<rect x="44" y="30" width="172" height="144" fill="url(#ID-wood)"/>
<path d="${slats}" stroke="#6e4220" opacity=".6"/>
<rect x="44" y="30" width="172" height="144" fill="none" stroke="#5e3818"/>
<rect x="34" y="22" width="192" height="10" rx="2" fill="url(#ID-roof)"/>
<path d="M36 23 H224" stroke="#fff" opacity=".35"/>
<rect x="38" y="172" width="184" height="7" rx="2" fill="#a7afb6"/>
<rect x="119" y="36" width="16" height="6" rx="2" fill="#3a3f45"/>
<ellipse class="xa-sa-bulb" cx="127" cy="44" rx="16" ry="6" fill="#ffd27a"/>
<rect x="94" y="48" width="66" height="122" rx="4" fill="#3a3f45"/>
<g clip-path="url(#ID-door)">
 <rect x="98" y="52" width="58" height="114" fill="url(#ID-glass)"/>
 <rect class="xa-sa-glow" x="80" y="52" width="94" height="114" fill="url(#ID-glow)"/>
 <rect x="98" y="96" width="58" height="6" fill="#6b4524" opacity=".85"/><rect x="98" y="122" width="58" height="6" fill="#6b4524" opacity=".85"/>
 <rect x="112" y="138" width="30" height="28" rx="2" fill="url(#ID-stove)"/>
 <g class="xa-sa-stones"><circle cx="117" cy="137" r="5"/><circle cx="126" cy="135" r="6"/><circle cx="136" cy="137" r="5"/><circle cx="121" cy="131" r="4"/><circle cx="132" cy="131" r="4.5"/></g>
 <g class="xa-sa-emb" fill="#ff7a2a"><circle cx="119" cy="136" r="1.6"/><circle cx="127" cy="133" r="1.8"/><circle cx="134" cy="136" r="1.5"/><circle cx="124" cy="139" r="1.3"/><circle cx="131" cy="131" r="1.4"/></g>
 <g class="xa-sa-wave"><path d="M118 126 q3 -4 0 -8 t0 -8"/><path d="M127 124 q3 -4 0 -8 t0 -8"/><path d="M136 126 q3 -4 0 -8 t0 -8"/></g>
 <path d="M102 56 L118 56 L104 120 Z" fill="#fff" opacity=".07"/>
</g>
<rect x="98" y="52" width="58" height="114" rx="3" fill="none" stroke="#1d2125" stroke-width="1.5"/>
<rect x="148" y="94" width="4" height="30" rx="2" fill="#c9a06a" stroke="#7a4a22" stroke-width=".6"/>
<rect x="62" y="62" width="14" height="86" rx="7" fill="#cfcac2" stroke="#7a4a22" stroke-width=".8"/>
<rect x="67" y="68" width="4" height="70" rx="2" fill="#a9a196"/>
<rect class="xa-sa-therm" x="67" y="68" width="4" height="70" rx="2" fill="#e53935"/>
<circle cx="69" cy="141" r="4.5" fill="#e53935"/>
<path d="M72 76 H75 M72 90 H75 M72 104 H75 M72 118 H75 M72 132 H75" stroke="#7a4a22" stroke-width=".7"/>
<rect x="172" y="84" width="30" height="34" rx="4" fill="#1b1e22" stroke="#3a3f45"/>
${lcd(176, 89, 22, 13, "80°C", "xa-lcdo")}
<circle class="xa-led xa-ledo xa-ledp" cx="181" cy="110" r="2.2"/><circle cx="193" cy="110" r="2.6" fill="#3a3f45" stroke="#6d757c" stroke-width=".6"/>`);
  };
  D["roller-shutter"] = () => {
    const stars = [[60.4, 52.5], [96, 45.9], [117.2, 74.5], [72.3, 80], [49.8, 69]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#e8e4ff"/>`).join("");
    return shadow(100, 192, 88, 4) + nest("0 10 200 150", 0, 44, 200, 150, `<defs>
  <linearGradient id="ID-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1430"/><stop offset="1" stop-color="#1b2a55"/></linearGradient>
  <linearGradient id="ID-box" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b4bac2"/><stop offset="1" stop-color="#7f868f"/></linearGradient>
  <pattern id="ID-slat" width="132" height="7" x="34" y="34" patternUnits="userSpaceOnUse"><rect width="132" height="7" fill="#959ca5"/><rect width="132" height="2.4" fill="#c3c8cf" opacity=".45"/><rect y="5" width="132" height="2" fill="#000" opacity=".2"/><path d="M0 6.5H132" stroke="#000" stroke-opacity=".35" stroke-width=".8"/></pattern>
  <clipPath id="ID-win"><rect x="34" y="36" width="132" height="110"/></clipPath></defs>
 <rect x="14" y="14" width="172" height="146" rx="4" fill="#3a3f47"/>
 <g clip-path="url(#ID-win)"><rect x="34" y="36" width="132" height="110" fill="url(#ID-sky)"/>
  <circle cx="137" cy="64.6" r="9.2" fill="#f4f1d0"/><circle cx="140.9" cy="61.3" r="8.2" fill="#14204a"/>${stars}
  <path d="M34 119.6 Q69.6 99.8 104 115.2 T166 107.5 V146 H34Z" fill="#13233d"/><path d="M34 131.7 Q86.8 117.4 166 129.5 V146 H34Z" fill="#0e1b30"/></g>
 <path d="M100 36 V146" stroke="#8b929b" stroke-width="3"/>
 <g clip-path="url(#ID-win)"><g class="xa-rs-tab"><rect x="34" y="34" width="132" height="112" fill="url(#ID-slat)"/><rect x="34" y="142.5" width="132" height="3.5" fill="#5c636b"/></g></g>
 <rect x="34" y="36" width="132" height="110" fill="none" stroke="#8b929b" stroke-width="3"/>
 <rect x="28" y="34" width="6" height="114" fill="#6f767f"/><rect x="166" y="34" width="6" height="114" fill="#6f767f"/>
 <rect x="26" y="18" width="148" height="20" rx="3" fill="url(#ID-box)"/><rect x="26" y="35" width="148" height="3" fill="#5c636b"/>
 <circle class="xa-led" cx="168" cy="28" r="2.2"/>
 <rect x="22" y="148" width="156" height="7" rx="2" fill="#8d939a"/>`);
  };
  // ---------- window coverings that can stop part-way (venetian lift / tilt, drapes) ----------
  // How open they look comes from "--pos" (0 closed … 1 open) when the panel puts it on the <svg> (style="--pos:.5");
  // without it they follow on/off: on = open. (".xa-wc" turns that into "--q", which the parts move by.)
  function venetian(tilt) {
    const stars = [[60.4, 52.5], [96, 45.9], [117.2, 74.5], [72.3, 80], [49.8, 69]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#e8e4ff"/>`).join("");
    // 14 slats, a little taller than their 7 px spacing so a closed blind has no gaps; "--i" = which slat (for the lift)
    let sl = "";
    for (let i = 0; i < 14; i++) sl += `<rect class="xa-vn-sl" x="36" y="${41 + i * 7}" width="128" height="7.6" rx=".6" fill="url(#ID-sl)" style="--i:${i}"/>`;
    // lift: a pull cord on the left; tilt: the wand on the right
    const ctl = tilt
      ? `<rect x="157" y="40" width="2.6" height="70" rx="1.3" fill="#c9ced4" stroke="#000" stroke-opacity=".3" stroke-width=".5"/><rect x="156.4" y="106" width="3.8" height="7" rx="1.6" fill="#a1a8b0"/>`
      : `<path d="M42 40 V104" stroke="#d6d2c8" stroke-width=".9"/><path d="M40.4 104 h3.2 l.9 8 h-5Z" fill="#a1a8b0"/>`;
    return shadow(100, 192, 88, 4) + nest("0 10 200 150", 0, 44, 200, 150, `<defs>
  <linearGradient id="ID-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1430"/><stop offset="1" stop-color="#1b2a55"/></linearGradient>
  <linearGradient id="ID-sl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c4c9d0"/><stop offset=".5" stop-color="#a1a8b0"/><stop offset="1" stop-color="#7c838c"/></linearGradient>
  <clipPath id="ID-win"><rect x="34" y="36" width="132" height="110"/></clipPath></defs>
 <rect x="14" y="14" width="172" height="146" rx="4" fill="#3a3f47"/>
 <g clip-path="url(#ID-win)"><rect x="34" y="36" width="132" height="110" fill="url(#ID-sky)"/>
  <circle cx="137" cy="64.6" r="9.2" fill="#f4f1d0"/><circle cx="140.9" cy="61.3" r="8.2" fill="#14204a"/>${stars}
  <path d="M34 119.6 Q69.6 99.8 104 115.2 T166 107.5 V146 H34Z" fill="#13233d"/><path d="M34 131.7 Q86.8 117.4 166 129.5 V146 H34Z" fill="#0e1b30"/></g>
 <path d="M100 36 V146" stroke="#8b929b" stroke-width="3"/>
 <rect x="34" y="36" width="132" height="110" fill="none" stroke="#8b929b" stroke-width="3"/>
 <g class="xa-wc xa-vn-${tilt ? "tilt" : "lift"}"><path class="xa-vn-cord" d="M64 40 V142 M136 40 V142" stroke="#000" stroke-opacity=".3" stroke-width=".8"/>${sl}
  <rect class="xa-vn-rail" x="35" y="140" width="130" height="4" rx="1.5" fill="#7c838c"/></g>
 <rect x="30" y="32" width="140" height="8" rx="2" fill="url(#ID-sl)"/>${ctl}
 <circle class="xa-led" cx="166" cy="36" r="2.2"/>
 <rect x="22" y="148" width="156" height="7" rx="2" fill="#8d939a"/>`);
  }
  D["venetian-lift"] = () => venetian(0);
  D["venetian-tilt"] = () => venetian(1);
  D["venetian-blind"] = () => venetian(0); // the older key: looks like the lift
  // drapes: a tall window, two curtains that meet in the middle when closed and bunch at the sides when open
  D["drapes"] = () => {
    const stars = [[52, 64], [78, 56], [118, 70], [64, 92], [140, 98], [92, 80]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#e8e4ff"/>`).join("");
    const rings = (x0) => Array.from({ length: 8 }, (_, i) => `<circle cx="${x0 + 5 + i * 11}" cy="36" r="2.6" fill="none" stroke="#c9a76a" stroke-width="1.2"/>`).join("");
    const cur = (x, side) => `<g class="xa-wc xa-dr-c xa-dr-${side}"><rect x="${x}" y="38" width="88" height="170" fill="url(#ID-pleat)"/>
  <rect x="${x}" y="38" width="88" height="7" fill="#000" opacity=".22"/><rect x="${x}" y="201" width="88" height="7" fill="#000" opacity=".18"/>
  <rect x="${x}" y="38" width="88" height="170" fill="url(#ID-shade)"/>${rings(x)}</g>`;
    return shadow(100, 222, 92, 4) + `<defs>
  <linearGradient id="ID-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1430"/><stop offset="1" stop-color="#1b2a55"/></linearGradient>
  <pattern id="ID-pleat" width="11" height="10" patternUnits="userSpaceOnUse"><rect width="11" height="10" fill="#5e4880"/><rect x="2" width="4" height="10" fill="#7a62a2"/><rect x="3" width="1.4" height="10" fill="#8e78b6"/><rect x="8.6" width="2.4" height="10" fill="#45345f"/></pattern>
  <linearGradient id="ID-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
  <clipPath id="ID-win"><rect x="34" y="46" width="132" height="148"/></clipPath></defs>
 <rect x="6" y="16" width="188" height="204" rx="4" fill="#3a3f47"/>
 <g clip-path="url(#ID-win)"><rect x="34" y="46" width="132" height="148" fill="url(#ID-sky)"/>
  <circle cx="134" cy="74" r="10" fill="#f4f1d0"/><circle cx="138.2" cy="70.4" r="8.9" fill="#14204a"/>${stars}
  <path d="M34 160 Q70 136 104 154 T166 146 V194 H34Z" fill="#13233d"/><path d="M34 176 Q88 158 166 172 V194 H34Z" fill="#0e1b30"/></g>
 <path d="M100 46 V194 M34 112 H166" stroke="#8b929b" stroke-width="3"/>
 <rect x="34" y="46" width="132" height="148" fill="none" stroke="#8b929b" stroke-width="3"/>
 <rect x="26" y="194" width="148" height="7" rx="2" fill="#8d939a"/>
 ${cur(12, "l")}${cur(100, "r")}
 <rect x="8" y="33" width="184" height="3.6" rx="1.8" fill="#b8955a"/><circle cx="9" cy="34.8" r="4" fill="#c9a76a"/><circle cx="191" cy="34.8" r="4" fill="#c9a76a"/>
 <circle class="xa-led" cx="184" cy="24" r="2.2"/>`;
  };
  D["swing-shutter"] = () => {
    const stars = [[77.2, 55.3], [97.7, 49.2], [109.9, 75.7], [84, 80.8], [71.1, 70.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#e8e4ff"/>`).join("");
    const leaf = (x, r) => {
      let d = "";
      for (let i = 0; i < 18; i++) d += `M${x + 4} ${(46 + i * 5.4).toFixed(1)}l32 2`;
      const hx = r ? x + 36 : x;
      return `<g class="xa-ss-leaf xa-ss-${r ? "r" : "l"}"><rect x="${x}" y="38" width="40" height="104" fill="#9ea5ad"/>
  <path d="${d}" stroke="#000" stroke-opacity=".28" stroke-width="1.3"/>
  <rect x="${x + 1}" y="39" width="38" height="102" fill="none" stroke="#000" stroke-opacity=".33" stroke-width="2"/><rect x="${x + 2}" y="86" width="36" height="4" fill="#000" opacity=".19"/>
  <rect x="${hx}" y="52" width="4" height="4" fill="#30343a"/><rect x="${hx}" y="124" width="4" height="4" fill="#30343a"/>
  <rect class="xa-ss-sh" x="${x}" y="38" width="40" height="104" fill="#000"/></g>`;
    };
    return shadow(100, 196, 92, 4) + nest("0 10 200 150", 0, 44, 200, 150, `<defs>
  <linearGradient id="ID-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1430"/><stop offset="1" stop-color="#1b2a55"/></linearGradient>
  <clipPath id="ID-win"><rect x="62" y="40" width="76" height="102"/></clipPath></defs>
 <rect x="6" y="14" width="188" height="146" rx="4" fill="#d8cbb5"/><rect x="6" y="14" width="188" height="146" rx="4" fill="#1b1433" opacity=".7"/>
 <g clip-path="url(#ID-win)"><rect x="62" y="40" width="76" height="102" fill="url(#ID-sky)"/>
  <circle cx="121.3" cy="66.5" r="5.3" fill="#f4f1d0"/><circle cx="123.6" cy="63.5" r="4.7" fill="#14204a"/>${stars}
  <path d="M62 117.5 Q82.5 99.2 102.3 113.4 T138 106.3 V142 H62Z" fill="#13233d"/><path d="M62 128.7 Q92.4 115.5 138 126.7 V142 H62Z" fill="#0e1b30"/></g>
 <path d="M100 40 V142" stroke="#8f887d" stroke-width="3"/><rect x="62" y="40" width="76" height="102" fill="none" stroke="#8f887d" stroke-width="3"/>
 <rect x="52" y="143" width="96" height="6" rx="2" fill="#8a8479"/>
 <circle class="xa-led" cx="100" cy="26" r="2.2"/>
 ${leaf(60, 0)}${leaf(100, 1)}`);
  };
  D["underfloor-heating"] = () => {
    const loop = "M-8 8 H200 Q210 8 210 18 Q210 28 200 28 H20 Q10 28 10 38 Q10 48 20 48 H200 Q210 48 210 58 Q210 68 200 68 H-8";
    const pts = [[-8, 8], [200, 8], [207, 10.5], [210, 18], [207, 25.5], [200, 28], [20, 28], [13, 30.5], [10, 38], [13, 45.5], [20, 48], [200, 48], [207, 50.5], [210, 58], [207, 65.5], [200, 68], [-8, 68]];
    const waves = [70, 110, 150, 190, 230].map((x) => `<path d="M${x} 112 q4 -5 0 -10 t0 -10"/>`).join("");
    return nest("0 14 270 154", 0, 80, 200, 114.1, `<defs>
  <linearGradient id="ID-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b6f78"/><stop offset="1" stop-color="#565a63"/></linearGradient>
  <linearGradient id="ID-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1430"/><stop offset="1" stop-color="#1b2a55"/></linearGradient>
  <linearGradient id="ID-glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a3d" stop-opacity=".1"/><stop offset="1" stop-color="#ff5a2a" stop-opacity=".75"/></linearGradient>
  <pattern id="ID-tile" width="27.5" height="20" patternUnits="userSpaceOnUse"><rect width="27.5" height="20" fill="#a59d90"/><path d="M0 0 H27.5 M0 0 V20" stroke="#837a6b" stroke-width="1.4"/></pattern>
  <clipPath id="ID-slab"><rect x="0" y="0" width="220" height="80"/></clipPath></defs>
 <ellipse cx="135" cy="164" rx="128" ry="4" fill="#000" opacity=".28"/>
 <path d="M40 18 H262 V118 H40 Z" fill="url(#ID-wall)" stroke="#7a7f88"/>
 <rect x="96" y="32" width="58" height="50" rx="2" fill="url(#ID-sky)" stroke="#8f99a6" stroke-width="2"/>
 <path d="M125 32 V82 M96 57 H154" stroke="#8f99a6" stroke-width="2"/>
 <rect x="206" y="44" width="30" height="36" rx="4" fill="#a3a9b1" stroke="#7d848c"/>
 <rect x="210" y="49" width="22" height="13" rx="2" fill="#0c1720"/>
 <text class="xa-lcd xa-lcdo xa-uf-big" x="221" y="55.8" text-anchor="middle" dominant-baseline="central">21.5</text>
 <circle class="xa-led xa-ledo xa-ledp" cx="221" cy="71" r="2.2"/>
 <g class="xa-uf-waves">${waves}</g>
 <g transform="matrix(1 0 -.4 .5 40 118)">
  <rect x="0" y="0" width="220" height="80" fill="#8f897f"/>
  <g clip-path="url(#ID-slab)"><path class="xa-uf-pipe" d="${loop}"/>${chase(pts, 44, 1.5, "#ffd9c8", 2.6)}</g>
  <path d="M120 0 L100 80 H220 V0 Z" fill="url(#ID-tile)"/>
  <path d="M120 0 L100 80" stroke="#7a7062" stroke-width="2"/>
  <rect class="xa-uf-glow" x="0" y="0" width="220" height="80" fill="url(#ID-glow)"/>
 </g>
 <path d="M8 158 H228 L232 158 V164 H8 Z" fill="#6f685c"/>
 <path d="M228 158 L260 118 V124 L232 164 Z" fill="#5f584d"/>
 <rect x="6" y="64" width="30" height="48" rx="3" fill="#a9afb7" stroke="#7d848c"/>
 <rect x="10" y="74" width="22" height="4" rx="2" fill="#d9483b"/><rect x="10" y="94" width="22" height="4" rx="2" fill="#2b7fd9"/>
 <g fill="#4a5058"><circle cx="15" cy="76" r="2.4"/><circle cx="27" cy="76" r="2.4"/><circle cx="15" cy="96" r="2.4"/><circle cx="27" cy="96" r="2.4"/></g>
 <path d="M15 112 V122 M27 112 V128" stroke="#7d848c" stroke-width="3"/>`);
  };
  D["ups"] = () => {
    let ld = "";
    for (let i = 0; i < 5; i++) ld += `<rect class="${i < 3 ? "xa-ups-ld" : ""}" x="${86 + i * 6.5}" y="76" width="5" height="4" rx="1" fill="#2b3036"/>`;
    const cin = [[25, 101], [25, 144], [29, 148], [86, 148], [90, 144], [90, 132]];
    const out1 = [[112, 132], [112, 144], [116, 148], [204, 148], [208, 144], [208, 128]];
    const out2 = [[208, 144], [212, 148], [242, 148], [246, 144], [246, 86]];
    const pl = (p) => "M" + p.map((q) => q.join(" ")).join(" L");
    const cab = (p) => `<path d="${pl(p)}" fill="none" stroke="#3a4148" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    const dl = (x, y, r) => `<circle class="xa-ups-dl" cx="${x}" cy="${y}" r="${r}"/>`;
    return nest("0 18 270 148", 0, 84.8, 200, 109.6, `<defs>
  <linearGradient id="ID-body" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a2f35"/><stop offset=".5" stop-color="#3c434a"/><stop offset="1" stop-color="#23282d"/></linearGradient>
  <linearGradient id="ID-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b1f23"/><stop offset="1" stop-color="#2a2f35"/></linearGradient></defs>
 <ellipse cx="135" cy="160" rx="128" ry="5" fill="#000" opacity=".28"/>
 <rect x="8" y="70" width="34" height="40" rx="5" fill="#8f959d" stroke="#6f767e"/>
 <circle cx="25" cy="90" r="11" fill="#7d838b" stroke="#6f767e"/><circle cx="21" cy="90" r="1.8" fill="#2f343a"/><circle cx="29" cy="90" r="1.8" fill="#2f343a"/>
 <path class="xa-ups-bolt" d="M25 52 l-6 10 h5 l-3 8 l9 -12 h-5 l3 -6 z" fill="#ffd43b"/>
 ${cab(cin)}${chase(cin, 14, 1.4, "#ffd43b", 1.2)}
 <path d="M126 30 L144 22 V142 L126 150 Z" fill="url(#ID-side)"/>
 <rect x="76" y="30" width="50" height="120" rx="5" fill="url(#ID-body)" stroke="#16191c"/>
 <path d="M76 36 Q76 30 82 30 L100 22 H144 L126 30 Z" fill="#4a5158"/>
 <g transform="skewY(-24) translate(0 58)"><rect x="130" y="50" width="10" height="64" rx="2" fill="#16191c"/><rect x="131.5" y="52" width="7" height="60" rx="1.5" fill="#262b30"/><rect class="xa-ups-bat" x="131.5" y="64" width="7" height="48" rx="1.5" fill="#2f6b3a"/></g>
 <rect x="84" y="42" width="34" height="26" rx="3" fill="#0c1720" stroke="#0d0f11"/>
 <text class="xa-lcd xa-ups-g xa-ups-big" x="101" y="52.5" text-anchor="middle" dominant-baseline="central">100%</text>
 <text class="xa-lcd xa-ups-g xa-lcds" x="101" y="62" text-anchor="middle" dominant-baseline="central">230V</text>
 ${ld}
 <circle cx="101" cy="98" r="8" fill="#1b1f23" stroke="#4a5158"/>
 <path d="M101 93 V98 M97.5 95 A5 5 0 1 0 104.5 95" fill="none" stroke="#8a9097" stroke-width="1.4" stroke-linecap="round"/>
 <circle class="xa-led" cx="101" cy="112" r="2.4"/>
 <path d="M84 122 H118 M84 127 H118 M84 132 H118 M84 137 H118" stroke="#1b1f23" stroke-width="1.2"/>
 ${cab(out1)}${cab(out2)}${chase(out1, 18, 1.4, "#ffd43b", 1.2)}${chase(out2, 12, 1.4, "#ffd43b", 1.2)}
 <rect x="180" y="106" width="56" height="22" rx="4" fill="#8f959d" stroke="#6f767e"/>
 <path d="M190 106 V94 M226 106 V94" stroke="#6f767e" stroke-width="2" stroke-linecap="round"/>
 ${dl(190, 117, 1.6)}${dl(196, 117, 1.6)}${dl(202, 117, 1.6)}
 <rect x="226" y="36" width="38" height="50" rx="4" fill="#2a2f35" stroke="#16191c"/>
 <g fill="#3c434a"><rect x="231" y="42" width="28" height="9" rx="1.5"/><rect x="231" y="54" width="28" height="9" rx="1.5"/><rect x="231" y="66" width="28" height="9" rx="1.5"/></g>
 ${dl(255, 46.5, 1.4)}${dl(255, 58.5, 1.4)}${dl(255, 70.5, 1.4)}`);
  };
  D["water-heat-pump"] = () => {
    const plates = (x0, fill, st) => `<g fill="${fill}" stroke="${st}" stroke-width=".5">${[0, 1, 2, 3, 4].map((i) => `<rect x="${(x0 + i * 3.6).toFixed(1)}" y="70" width="2.6" height="42" rx=".8"/>`).join("")}</g>`;
    const rad = `<rect x="184" y="14" width="52" height="8" rx="3"/><rect x="184" y="56" width="52" height="8" rx="3"/>${[187, 198, 209, 220].map((x) => `<rect x="${x}" y="18" width="7" height="42" rx="3"/>`).join("")}`;
    const ref = [[[94, 70], [94, 64], [114, 64], [114, 92]], [[126, 92], [126, 64], [146, 64], [146, 70]], [[146, 112], [146, 136], [94, 136], [94, 112]]];
    return nest("0 10 290 194", 0, 62, 200, 133.8, `<defs>
  <linearGradient id="ID-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9bfc7"/><stop offset="1" stop-color="#8d949d"/></linearGradient>
  <linearGradient id="ID-comp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b6570"/><stop offset=".45" stop-color="#3a434d"/><stop offset="1" stop-color="#22292f"/></linearGradient>
  <linearGradient id="ID-soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d6650"/><stop offset="1" stop-color="#55422f"/></linearGradient></defs>
 <rect x="0" y="158" width="66" height="46" rx="3" fill="url(#ID-soil)"/>
 <path d="M0 158 H66" stroke="#5a9444" stroke-width="3"/>
 <g transform="translate(40 0)">
  <rect x="184" y="14" width="52" height="50" rx="5" fill="#000" opacity=".2" transform="translate(1.5 2)"/>
  <g fill="#a2a8b0" stroke="#7d848c" stroke-width="1">${rad}</g>
  <g class="xa-whp-glow" fill="#ff7a3d">${rad}</g>
 </g>
 <g class="xa-whp-heat">${steam([236, 250, 264], 10)}</g>
 <rect x="76" y="26" width="96" height="128" rx="9" fill="#000" opacity=".2" transform="translate(2 3)"/>
 <rect x="72" y="24" width="96" height="128" rx="9" fill="url(#ID-body)" stroke="#7d848c" stroke-width="1.2"/>
 <rect x="82" y="31" width="58" height="21" rx="4" fill="#0e1b2c" stroke="#27394f"/>
 <text class="xa-lcd xa-whp-big" x="111" y="41.8" text-anchor="middle" dominant-baseline="central">55°</text>
 <circle class="xa-led xa-ledo" cx="152" cy="37" r="3.2"/>
 <circle cx="152" cy="47" r="3.6" fill="#8f969f" stroke="#6f767f"/>
 <rect x="80" y="58" width="80" height="88" rx="6" fill="#18212c" stroke="#2a3340" stroke-width="1.4"/>
 <g fill="none" stroke-width="6" stroke-linecap="round">
  <path d="M92 80 H30 V188" stroke="#4aa3df"/><path d="M30 188 Q38 199 46 188" stroke="#3d8fd0"/><path d="M46 188 V104 H92" stroke="#2b6cb0"/>
  <path d="M148 80 H236 V64" stroke="#e5533d"/><path d="M264 64 V104 H148" stroke="#3b8fe8"/>
 </g>
 ${plates(86, "#5fa8e8", "#2f6ea8")}${plates(137, "#f0883e", "#a8541c")}
 <path d="M94 70 V64 H114 V92 M126 92 V64 H146 V70 M146 112 V136 H94 V112" fill="none" stroke="#c98a55" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
 <circle cx="120" cy="136" r="3" fill="#8c95a0" stroke="#5c6570"/>
 ${ref.map((p) => chase(p, 8, .9, "#fff", 1.6)).join("")}
 <g class="xa-whp-comp">
  <rect x="107" y="88" width="26" height="40" rx="11" fill="url(#ID-comp)" stroke="#1b2127"/>
  <ellipse cx="120" cy="92" rx="11" ry="4" fill="#6b7580" opacity=".55"/>
  <rect x="103" y="127" width="34" height="6" rx="2" fill="#4a535e"/>
 </g>
 ${chase([[30, 188], [30, 80], [72, 80]], 16, 1.3, "#d6efff", 1.4)}${chase([[72, 104], [46, 104], [46, 188]], 14, 1.3, "#d6efff", 1.4)}
 ${chase([[172, 80], [236, 80], [236, 64]], 10, 1.3, "#ffd9c4", 1.2)}${chase([[264, 64], [264, 104], [172, 104]], 16, 1.3, "#ffd9c4", 1.2)}`);
  };
  D["kettle"] = () => {
    const ln = "#9aa0b4", ar = "M64 31C80 29 84 40 83 53C82 66 77 73 68 77";
    const wisp = (x, y, c) => `<path class="xa-kt-steam ${c}" d="M${x} ${y}c-3-3 2-6-1-9c-2-2 1-5 0-7"/>`;
    const bub = (x, y) => `<circle class="xa-kt-bub" cx="${x}" cy="${y}" r="1"/><circle class="xa-kt-bub xa-kt-b2" cx="${x - 0.6}" cy="${y - 1}" r=".8"/><circle class="xa-kt-bub xa-kt-b3" cx="${x + 0.4}" cy="${y + 1}" r=".7"/>`;
    return shadow(100, 190, 72, 6) + nest("0 0 96 96", 4, 10, 192, 192, `<defs><radialGradient id="ID-g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff8a50"/><stop offset="1" stop-color="#ff7043" stop-opacity="0"/></radialGradient><linearGradient id="ID-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a4dcf9"/><stop offset="1" stop-color="#3b9fd8"/></linearGradient><linearGradient id="ID-b" x1="0" x2="1"><stop offset="0" stop-color="#d6dbe0"/><stop offset=".42" stop-color="#f4f6f8"/><stop offset=".7" stop-color="#e6eaee"/><stop offset="1" stop-color="#b8c0c8"/></linearGradient><radialGradient id="ID-bl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#38bdf8" stop-opacity=".7"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></radialGradient></defs>
<ellipse class="xa-kt-glow" cx="46" cy="87" rx="34" ry="7" fill="url(#ID-g)"/>
<path d="M17 82H75Q78 82 78 85V87Q78 90 74 90H18Q14 90 14 87V85Q14 82 17 82Z" fill="#3a4047"/>
<rect class="xa-kt-ring" x="20" y="88" width="52" height="1.4" rx=".7" fill="#ff7043"/>
<g fill="none" stroke-linecap="round">${wisp(13, 20, "xa-kt-s1")}${wisp(17, 20, "xa-kt-s2")}</g>
<path d="${ar}" fill="none" stroke="${ln}" stroke-width="8" stroke-linecap="round"/><path d="${ar}" fill="none" stroke="url(#ID-b)" stroke-width="6.4" stroke-linecap="round"/>
<path d="M32 33C25 31.5 19 27 14.6 22.8Q12.2 21 12.6 24C14.5 32 20 42 29 50Z" fill="url(#ID-b)" stroke="${ln}" stroke-width=".8" stroke-linejoin="round"/>
<path d="M32 26H62Q66 26 66.6 30L71.5 76Q72 82 66 82H27Q21 82 21.5 76L27.4 30Q28 26 32 26Z" fill="url(#ID-b)" stroke="${ln}" stroke-width=".8"/>
<path d="M30 32L25.6 74" stroke="#fff" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round"/>
<rect x="57" y="36" width="6.4" height="40" rx="3.2" fill="#d5dce3" stroke="${ln}" stroke-width=".6"/>
<rect x="57.9" y="55" width="4.6" height="20.2" rx="2.3" fill="url(#ID-w)"/>
<ellipse class="xa-kt-blue" cx="60.2" cy="65" rx="6" ry="13" fill="url(#ID-bl)"/>
<path d="M57.2 45h2M57.2 55h2M57.2 65h2" stroke="#9aa3ad" stroke-width=".6"/>
${bub(60.2, 73)}
<path d="M29.5 26.5Q47 17 64.5 26.5Z" fill="#e2e7eb" stroke="${ln}" stroke-width=".8" stroke-linejoin="round"/>
<rect x="42.5" y="16.5" width="9" height="4.4" rx="2.2" fill="#8f98a2"/>
${lcd(33, 42, 20, 10, "100°", "xa-lcdo")}
<rect class="xa-kt-led" x="66.5" y="73.6" width="6" height="3" rx="1.5"/>`);
  };
  D["multicooker"] = () => {
    const wisp = (x, y, c) => `<path class="xa-mc-steam ${c}" d="M${x} ${y}c-3-3 2-6-1-9c-2-2 1-5 0-7"/>`;
    return shadow(100, 190, 66, 6) + nest("0 0 96 108", 16, 15, 168, 189, `<defs><linearGradient id="ID-w" x1="0" x2="1"><stop offset="0" stop-color="#d6dbe0"/><stop offset=".45" stop-color="#f4f6f8"/><stop offset=".75" stop-color="#e6eaee"/><stop offset="1" stop-color="#c2c9cf"/></linearGradient><linearGradient id="ID-s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd08a"/><stop offset="1" stop-color="#e8913a"/></linearGradient><radialGradient id="ID-d" cx=".4" cy=".35"><stop offset="0" stop-color="#f4f6f8"/><stop offset="1" stop-color="#c9d0d6"/></radialGradient><radialGradient id="ID-hg" cx=".5" cy=".5" r=".5"><stop offset=".45" stop-color="#ff7043" stop-opacity=".9"/><stop offset="1" stop-color="#ff7043" stop-opacity="0"/></radialGradient><clipPath id="ID-c"><path d="M28.9 58.4L26.5 28.5H65.5L63.1 58.4Q46 62.4 28.9 58.4Z"/></clipPath></defs>
<path d="M19 99.6Q16 99.6 17 95.6L20 70Q21 64 27.5 64H68.5Q75 64 76 70L79 95.6Q80 99.6 77 99.6Z" fill="url(#ID-w)" stroke="#8d95a0" stroke-width=".8"/>
<path d="M19 95.4H77" stroke="#000" stroke-opacity=".08"/>
${lcd(28, 73, 40, 12.5, "100°", "xa-lcdo")}
<circle class="xa-mc-hglow" cx="48" cy="92" r="9" fill="url(#ID-hg)"/>
<circle cx="48" cy="92" r="4.4" fill="url(#ID-d)" stroke="#aeb6bd" stroke-width=".7"/>
<circle class="xa-mc-ring" cx="48" cy="92" r="6" fill="none" stroke-width="1.4"/>
<g transform="translate(46 64.5) scale(1.2) translate(-46 -58.5)">
<path d="M65 32C80 32 82 52 65.2 54" fill="none" stroke="#8d95a0" stroke-width="7" stroke-linecap="round"/>
<path d="M65 32C80 32 82 52 65.2 54" fill="none" stroke="url(#ID-w)" stroke-width="5" stroke-linecap="round"/>
<path d="M28.6 58.5L25.4 28Q25.4 25.5 28.4 25.5H63.6Q66.6 25.5 66.6 28L63.4 58.5Q46 63 28.6 58.5Z" fill="#9fc4dc" fill-opacity=".4" stroke="#9fb6c6" stroke-width=".9"/>
<g clip-path="url(#ID-c)">
<path d="M20 43.4H72V63H20Z" fill="url(#ID-s)"/>
<ellipse cx="46" cy="43.4" rx="18.6" ry="3" fill="#ffdca6" stroke="#c86e1e" stroke-opacity=".35" stroke-width=".6"/>
<ellipse cx="46" cy="43.4" rx="16.6" ry="2.3" fill="none" stroke="#b4501a" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="3 4.33"/>
<ellipse cx="46" cy="49.5" rx="13" ry="1.8" fill="none" stroke="#aa460f" stroke-opacity=".75" stroke-width="1.3" stroke-linecap="round" stroke-dasharray="2.5 4.83"/>
<g class="xa-mc-blade"><path d="M38 54L54 54M46 50L46 58" stroke="#6c757d" stroke-width="2" stroke-linecap="round"/></g>
<circle cx="46" cy="54" r="1.6" fill="#495057"/>
<path d="M20 57Q46 61 72 57" fill="none" stroke="#783c0a" stroke-opacity=".22" stroke-width="2.2"/>
</g>
<path class="xa-mc-rim" d="M28.4 59.4Q46 64 63.6 59.4" fill="none" stroke-width="1.4" stroke-linecap="round"/>
<path d="M57.5 34H62M58 41H62M58.5 48H62M59 55H62" stroke="#9fb6c6" stroke-width=".7"/>
<path d="M31 30L29.6 55" stroke="#fff" stroke-opacity=".6" stroke-width="1.4" stroke-linecap="round"/>
<path d="M22.5 28.2Q22.5 24.4 26.5 24H65.5Q69.5 24.4 69.5 28.2Z" fill="url(#ID-w)" stroke="#8d95a0" stroke-width=".8"/>
<path d="M25.2 24.2Q27 16.4 46 15.6Q65 16.4 66.8 24.2Z" fill="url(#ID-w)" stroke="#8d95a0" stroke-width=".8"/>
<path d="M30 21.8Q33 18.2 40 17.2" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.2" stroke-linecap="round"/>
<path d="M39.8 11.8V16.6Q46 18.4 52.2 16.6V11.8" fill="#dfe4e8" stroke="#b9c1c8" stroke-width=".8"/>
<ellipse cx="46" cy="11.8" rx="6.2" ry="1.8" fill="#eef1f3" stroke="#b9c1c8" stroke-width=".8"/>
<ellipse cx="46" cy="11.8" rx="3.6" ry=".9" fill="#a9b1b8"/>
<g fill="none" stroke-linecap="round">${wisp(43, 11, "xa-mc-v1")}${wisp(48.5, 11, "xa-mc-v2")}</g>
</g>`);
  };
  D["rice-cooker"] = () => {
    const wisp = (x, y, c) => `<path class="xa-rc-steam ${c}" d="M${x} ${y}c-3-3 2-6-1-9c-2-2 1-5 0-7"/>`;
    return shadow(100, 191, 72, 6) + nest("0 0 96 108", 9, 0, 182.4, 205.2, `<defs><linearGradient id="ID-w" x1="0" x2="1"><stop offset="0" stop-color="#d6dbe0"/><stop offset=".45" stop-color="#f2f4f6"/><stop offset=".75" stop-color="#e4e8ec"/><stop offset="1" stop-color="#c2c9cf"/></linearGradient><linearGradient id="ID-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f4f6"/><stop offset="1" stop-color="#d4dadf"/></linearGradient><radialGradient id="ID-r" cx=".5" cy=".5" r=".5"><stop offset=".3" stop-color="#ff5252" stop-opacity=".9"/><stop offset="1" stop-color="#ff5252" stop-opacity="0"/></radialGradient></defs>
<path d="M14 50V92Q14 97.6 21 98.6Q48 102 75 98.6Q82 97.6 82 92V50Z" fill="url(#ID-w)" stroke="#8d95a0" stroke-width=".8"/>
<path d="M14.4 91Q48 96.5 81.6 91V92Q82 97.6 75 98.6Q48 102 21 98.6Q14 97.6 14.4 92Z" fill="#46505a" fill-opacity=".35"/>
<path d="M19 57Q18.4 74 19.4 88" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>
<path d="M26 63.6Q48 61.4 70 63.6Q72 63.8 72 66V84.4Q72 86.6 70 86.8Q48 89 26 86.8Q24 86.6 24 84.4V66Q24 63.8 26 63.6Z" fill="#2a2f35"/>
${lcd(29, 68, 24, 10, "0:25", "xa-lcds")}
<circle class="xa-rc-glow" cx="60" cy="71" r="5" fill="url(#ID-r)"/>
<circle class="xa-rc-led xa-rc-cook" cx="60" cy="71" r="2"/><circle class="xa-rc-led" cx="67" cy="71" r="2"/>
<rect x="29" y="81" width="11" height="4" rx="2" fill="#4a5158"/><rect x="43" y="81.3" width="11" height="4" rx="2" fill="#4a5158"/><rect class="xa-rc-key" x="57" y="81" width="11" height="4" rx="2"/>
<path d="M12 50Q12 46.6 15.4 45Q21 30.4 48 29.4Q75 30.4 80.6 45Q84 46.6 84 50Q48 56.6 12 50Z" fill="url(#ID-l)" stroke="#8d95a0" stroke-width=".8"/>
<path d="M13.4 50.6Q48 57.4 82.6 50.6" fill="none" stroke="#000" stroke-opacity=".14" stroke-width="1.2"/>
<path d="M22 41Q27 33.6 39 31.6" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="1.4" stroke-linecap="round"/>
<path d="M42 49.4Q48 50.6 54 49.4V51.6Q48 52.8 42 51.6Z" fill="#c3cad1" stroke="#8d95a0" stroke-width=".5"/>
<path d="M58.4 28.4V31.6Q63.4 33 68.4 31.6V28.4" fill="#dfe4e8" stroke="#aeb6bd" stroke-width=".7"/>
<ellipse cx="63.4" cy="28.4" rx="5" ry="1.5" fill="#eef1f3" stroke="#aeb6bd" stroke-width=".7"/>
<ellipse cx="63.4" cy="28.4" rx="2.4" ry=".7" fill="#8f98a2"/>
<g fill="none" stroke-linecap="round">${wisp(62, 28, "xa-rc-w1")}${wisp(66.5, 28, "xa-rc-w2")}</g>`);
  };
  D["toaster"] = () => {
    const air = [33, 48, 63].map((x) => `<path d="M${x} 36C${x - 4} 29 ${x + 4} 22 ${x} 14"/>`).join("");
    return shadow(100, 190, 66, 6) + nest("0 0 96 108", 9, 4, 182.4, 205.2, `<defs><linearGradient id="ID-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2e6e9"/><stop offset=".7" stop-color="#f2f4f6"/></linearGradient><linearGradient id="ID-face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f4f6"/><stop offset=".45" stop-color="#e2e6e9"/><stop offset="1" stop-color="#c3cbd1"/></linearGradient><linearGradient id="ID-slot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0d10"/><stop offset="1" stop-color="#2c3137"/></linearGradient><linearGradient id="ID-hot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb74d"/><stop offset="1" stop-color="#e64a19"/></linearGradient><radialGradient id="ID-halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff7043" stop-opacity=".7"/><stop offset="1" stop-color="#ff7043" stop-opacity="0"/></radialGradient><linearGradient id="ID-lev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3e8eb"/><stop offset="1" stop-color="#8a99a3"/></linearGradient><radialGradient id="ID-dial" cx=".35" cy=".3"><stop offset="0" stop-color="#f2f4f6"/><stop offset=".7" stop-color="#b7c1c7"/></radialGradient></defs>
<g class="xa-ts-air" fill="none" stroke="#ff7043" stroke-width="2" stroke-linecap="round">${air}</g>
<rect x="20" y="93" width="8" height="4" rx="2" fill="#2b2f33"/><rect x="68" y="93" width="8" height="4" rx="2" fill="#2b2f33"/>
<path d="M25 38H71Q80 38 80 47V51H16V47Q16 38 25 38Z" fill="url(#ID-top)" stroke="#8d95a0" stroke-width=".7"/>
<path d="M16 49H80V85Q80 94 71 94H25Q16 94 16 85Z" fill="url(#ID-face)" stroke="#8d95a0" stroke-width=".7"/>
<ellipse class="xa-ts-halo" cx="48" cy="43.5" rx="34" ry="9" fill="url(#ID-halo)"/>
<rect x="23" y="40.5" width="50" height="3.5" rx="1.75" fill="url(#ID-slot)"/><rect x="22" y="45.5" width="52" height="3.5" rx="1.75" fill="url(#ID-slot)"/>
<g class="xa-ts-hot" fill="url(#ID-hot)"><rect x="23" y="40.5" width="50" height="3.5" rx="1.75"/><rect x="22" y="45.5" width="52" height="3.5" rx="1.75"/></g>
<rect x="71.7" y="56" width="2.5" height="26" rx="1.25" fill="#000" fill-opacity=".45"/>
<rect class="xa-ts-lever" x="68" y="55" width="10" height="5" rx="2" fill="url(#ID-lev)" stroke="#5f6b74" stroke-width=".4"/>
<circle cx="27.5" cy="68.5" r="5.5" fill="url(#ID-dial)" stroke="#5f6b74" stroke-width=".6"/>
<path d="M27.5 68.5L29.3 65.4" stroke="#455a64" stroke-width="1.4" stroke-linecap="round"/>
<rect x="38" y="65" width="8" height="4" rx="2" fill="#000" fill-opacity=".18"/><rect x="38" y="71" width="8" height="4" rx="2" fill="#000" fill-opacity=".18"/>
<circle class="xa-ts-led" cx="51.5" cy="67.5" r="1.5"/>
<rect x="26" y="88" width="44" height="2" rx="1" fill="#000" fill-opacity=".28"/>`);
  };
  D["iron"] = () => {
    const wisps = [[2, 44], [12, 40], [23, 42], [33, 46]].map(([x, y], i) => `<rect class="xa-ir-steam xa-ir-s${i + 1}" x="${x}" y="${y}" width="7" height="22" rx="3.5" fill="url(#ID-st)"/>`).join("");
    const shell = "M8 70L17.4 54.4Q21 49 34.5 46.6L80 44Q86 44 86 50V70Z";
    return shadow(100, 189, 84, 6) + nest("0 0 96 96", 4, 32, 192, 192, `<defs><linearGradient id="ID-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eceff2"/><stop offset="1" stop-color="#c3c9cf"/></linearGradient><linearGradient id="ID-st" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#c4d2e2" stop-opacity="0"/><stop offset=".3" stop-color="#c4d2e2" stop-opacity=".8"/><stop offset="1" stop-color="#c4d2e2" stop-opacity="0"/></linearGradient><radialGradient id="ID-hot" cx=".5" cy=".5" r=".5"><stop offset=".35" stop-color="#ff7043" stop-opacity=".85"/><stop offset="1" stop-color="#ff7043" stop-opacity="0"/></radialGradient><clipPath id="ID-sc"><path d="${shell}"/></clipPath></defs>
<path d="M78 60.5H80Q90.5 60.5 90.5 50V42" fill="none" stroke="#7d8590" stroke-width="3" stroke-linecap="round"/>
${wisps}
<ellipse class="xa-ir-glow" cx="46" cy="75" rx="48" ry="10" fill="url(#ID-hot)"/>
<path d="M28.5 40V33Q28.5 19.5 44 19.5H72Q81.5 19.5 81.5 29V40" fill="none" stroke="#9aa1ab" stroke-width="6.2" stroke-linecap="round"/>
<path d="M28.5 40V33Q28.5 19.5 44 19.5H72Q81.5 19.5 81.5 29V40" fill="none" stroke="url(#ID-b)" stroke-width="5"/>
<path d="M34 48V42Q34 33 43 33H73Q82 33 82 42V48Z" fill="url(#ID-b)" stroke="#9aa1ab" stroke-width=".8"/>
<path d="${shell}" fill="url(#ID-b)" stroke="#9aa1ab" stroke-width=".8"/>
<g clip-path="url(#ID-sc)"><rect x="21" y="54" width="40" height="12" rx="6" fill="#4fc3f7" fill-opacity=".38"/><path d="M24 57H52" stroke="#fff" stroke-opacity=".5" stroke-width=".8" stroke-linecap="round"/></g>
<circle class="xa-ir-led" cx="74" cy="56" r="1.6"/>
<path d="M4 75L12.4 69H88V76Q88 78 86 78H6.5Z" fill="#3b4048"/>
<path class="xa-ir-plate" d="M4 75L12.4 69H88V76Q88 78 86 78H6.5Z" fill="#ff7043"/>`);
  };
  D["hair-dryer"] = () => {
    const air = [[24.5, 17], [29.5, 29.5], [34.5, 42]].map(([a, b], i) => chase(bez([72.5, a], [80, a], [86, b], [97, b], 12), 7, 1.15, i === 1 ? "#ffb070" : "#ff7a2f", 0.55)).join("");
    const blades = Array.from({ length: 5 }, (_, i) => `<path d="M14 31Q12.5 26 15.6 23.4Q17.6 27.6 14 31Z" transform="rotate(${i * 72} 14 31)"/>`).join("");
    return shadow(100, 189, 40, 5) + nest("0 0 96 108", 5, 17, 182.4, 205.2, `<defs><linearGradient id="ID-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef1f3"/><stop offset="1" stop-color="#cfd4da"/></linearGradient><radialGradient id="ID-heat"><stop offset="0" stop-color="#ffb74d"/><stop offset="1" stop-color="#ff5722" stop-opacity="0"/></radialGradient></defs>
<g transform="translate(-2 2) scale(.9)" stroke-width="1">
<path d="M40 46L50 46L56 92Q56 98 50 98L44 98Q38 98 38 92Z" fill="url(#ID-b)" stroke="#9aa1ab"/>
<rect x="44.5" y="58" width="5" height="11" rx="2.5" fill="#9aa1ab"/><circle class="xa-hdr-led" cx="47" cy="75" r="1.8"/>
<path d="M47 98q0 6-6 9" fill="none" stroke="#9aa1ab" stroke-width="2.2" stroke-linecap="round"/>
<rect x="8" y="14" width="58" height="34" rx="16" fill="url(#ID-b)" stroke="#9aa1ab"/>
<path d="M64 18L80 22Q82 23 82 25L82 35Q82 37 80 38L64 44Z" fill="#dde1e5" stroke="#9aa1ab"/>
<ellipse class="xa-hdr-heat" cx="76" cy="30" rx="7" ry="9" fill="url(#ID-heat)"/>
<rect x="80" y="23" width="2.5" height="14" rx="1" fill="#9aa1ab"/>
<circle cx="14" cy="31" r="10" fill="#3a3f47" stroke="#9aa1ab"/>
<g class="xa-hdr-fan" fill="#8c95a0">${blades}<circle cx="14" cy="31" r="2" fill="#c3c9cf"/></g>
${[0, 1, 2].map((i) => `<line x1="${9 + i * 5}" y1="${i === 1 ? 21.5 : 23}" x2="${9 + i * 5}" y2="${i === 1 ? 40.5 : 39}" stroke="#c3c9cf" stroke-width="1.2" opacity=".8"/>`).join("")}
</g>
<g class="xa-hdr-air">${air}</g>`);
  };
  D["pet-feeder"] = () => {
    const fall = [[33, "#9a6c48"], [35, "#8c5f3c"], [31.5, "#a67856"]].map(([x, c], i) => `<ellipse class="xa-pf-kib xa-pf-k${i + 1}" cx="${x + 1.5}" cy="72.2" rx="1.5" ry="1.2" fill="${c}"/>`).join("");
    return shadow(100, 190, 66, 6) + nest("0 0 96 108", 12, -20, 192, 216, `<defs><pattern id="ID-kib" width="6" height="4" patternUnits="userSpaceOnUse"><rect width="6" height="4" fill="#3a2211"/><ellipse cx="1.5" cy="1.4" rx="1.4" ry=".9" fill="#5a361e"/><ellipse cx="1.5" cy="1.1" rx="1.4" ry=".85" fill="#a67a52"/><ellipse cx="4.5" cy="3.4" rx="1.4" ry=".9" fill="#5a361e"/><ellipse cx="4.5" cy="3.1" rx="1.4" ry=".85" fill="#b98c65"/></pattern><linearGradient id="ID-sh" x1="0" x2="1"><stop offset="0" stop-color="#2a2f36"/><stop offset=".22" stop-color="#5a626b"/><stop offset=".62" stop-color="#40464d"/><stop offset="1" stop-color="#2a2f36"/></linearGradient><linearGradient id="ID-smk" x1="0" x2="1"><stop offset="0" stop-color="#1c2024" stop-opacity=".5"/><stop offset=".18" stop-color="#3c4248" stop-opacity=".14"/><stop offset=".27" stop-color="#fff" stop-opacity=".22"/><stop offset=".36" stop-color="#fff" stop-opacity=".04"/><stop offset=".78" stop-color="#3c4248" stop-opacity=".1"/><stop offset="1" stop-color="#1c2024" stop-opacity=".5"/></linearGradient><radialGradient id="ID-steel" cx=".5" cy=".75" r=".7"><stop offset="0" stop-color="#9aa3aa"/><stop offset=".55" stop-color="#d4dade"/><stop offset="1" stop-color="#aab3b9"/></radialGradient><clipPath id="ID-hc"><path d="M19 93.8V91Q19 86.8 34.5 86.8Q50 86.8 50 91V93.8Z"/></clipPath></defs>
<rect x="23" y="28" width="50" height="26" rx="2" fill="#6d747a"/>
<rect x="23" y="32" width="50" height="22" fill="url(#ID-kib)"/>
<path d="M23 33Q27 30.6 31 32.6T39 32.4T47 32.8T55 32.2T63 32.8T73 32.4V34H23Z" fill="#b98c65" fill-opacity=".8"/>
<rect x="23" y="28" width="50" height="26" fill="url(#ID-smk)" stroke="#000" stroke-opacity=".25" stroke-width=".6"/>
<path d="M25 22H71Q75 22 75 26V29H21V26Q21 22 25 22Z" fill="url(#ID-sh)" stroke="#6b737c" stroke-width=".5"/>
<rect x="40" y="24" width="16" height="1.5" rx=".75" fill="#000" fill-opacity=".25"/>
<path d="M23 54H73V97Q73 102 68 102H28Q23 102 23 97Z" fill="url(#ID-sh)" stroke="#6b737c" stroke-width=".5"/>
<rect x="63" y="49" width="7" height="3" rx="1" fill="#2a2f36"/>
<rect x="49" y="59" width="20" height="14" rx="2.5" fill="#1a1d21"/>
<rect class="xa-pf-scr" x="51" y="61" width="16" height="7" rx="1" fill="#0e1a1f"/>
<text class="xa-lcd xa-lcds xa-pf-t" x="59" y="64.8" text-anchor="middle" dominant-baseline="central">08:00</text>
${[53, 57, 61, 65].map((x) => `<circle cx="${x}" cy="70.8" r=".95" fill="#59626b"/>`).join("")}
<rect x="29" y="60" width="11" height="13" rx="2" fill="#15181b" stroke="#2f353b" stroke-width=".5"/>
${fall}
<path d="M13 94.5V98Q13 105 34.5 105Q56 105 56 98V94.5Z" fill="url(#ID-sh)" stroke="#6b737c" stroke-width=".5"/>
<ellipse cx="34.5" cy="94.5" rx="21.5" ry="4.5" fill="#5a626b" stroke="#000" stroke-opacity=".15" stroke-width=".5"/>
<ellipse cx="34.5" cy="94.6" rx="18.5" ry="3.1" fill="url(#ID-steel)"/>
<g clip-path="url(#ID-hc)"><rect x="19" y="86" width="31" height="8" fill="url(#ID-kib)"/></g>`);
  };
  D["pet-fountain"] = () => {
    const arcs = [["M48 31L48 10", 4.4, 1], ["M48 10C44 5 35 7 33 29", 2.6, 0.95], ["M48 10C46 8 41 11 40 29", 2.2, 0.85], ["M48 10C52 5 61 7 63 29", 2.6, 0.95], ["M48 10C50 8 55 11 56 29", 2.2, 0.85]];
    const pts = [[[48, 31], [48, 10]], bez([48, 10], [44, 5], [35, 7], [33, 29], 12), bez([48, 10], [46, 8], [41, 11], [40, 29], 10), bez([48, 10], [52, 5], [61, 7], [63, 29], 12), bez([48, 10], [50, 8], [55, 11], [56, 29], 10)];
    return shadow(100, 191, 62, 6) + nest("0 0 96 108", 8.8, -2, 182.4, 205.2, `<defs><linearGradient id="ID-b" x1="0" x2="1"><stop offset="0" stop-color="#cdd2d6"/><stop offset=".3" stop-color="#eef0f2"/><stop offset=".7" stop-color="#e2e5e8"/><stop offset="1" stop-color="#cdd2d6"/></linearGradient><linearGradient id="ID-win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c2d4e0"/><stop offset="1" stop-color="#a9c0d0"/></linearGradient><linearGradient id="ID-wat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#81c7f0"/><stop offset="1" stop-color="#3a9ad9"/></linearGradient><radialGradient id="ID-rim" cx=".45" cy=".3"><stop offset="0" stop-color="#f2f4f6"/><stop offset=".55" stop-color="#e2e5e8"/><stop offset="1" stop-color="#bfc5ca"/></radialGradient><radialGradient id="ID-pool" cx=".5" cy=".4"><stop offset="0" stop-color="#a9dcf7"/><stop offset=".7" stop-color="#5fb2e6"/><stop offset="1" stop-color="#3f97d2"/></radialGradient><radialGradient id="ID-sp" cx=".5" cy=".35"><stop offset="0" stop-color="#f2f4f6"/><stop offset="1" stop-color="#c4ccd2"/></radialGradient><clipPath id="ID-wc"><rect x="27" y="47" width="42" height="34" rx="7"/></clipPath></defs>
<path d="M30 34H66Q78 34 78 46V91Q78 101 68 101H28Q18 101 18 91V46Q18 34 30 34Z" fill="url(#ID-b)" stroke="#9aa1ab" stroke-width=".6"/>
<rect x="27" y="47" width="42" height="34" rx="7" fill="url(#ID-win)" stroke="#8d95a0" stroke-width=".6"/>
<g clip-path="url(#ID-wc)"><rect x="27" y="62.3" width="42" height="19" fill="url(#ID-wat)"/><rect x="27" y="62.3" width="42" height="1.2" fill="#fff" fill-opacity=".6"/></g>
<ellipse cx="48" cy="34" rx="35" ry="10" fill="url(#ID-rim)" stroke="#9aa1ab" stroke-width=".6"/>
<ellipse cx="48" cy="33.5" rx="29" ry="6.5" fill="url(#ID-pool)"/>
<ellipse class="xa-pw-rip" cx="48" cy="33.5" rx="5" ry="2" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width=".7"/>
<ellipse class="xa-pw-rip xa-pw-r2" cx="48" cy="33.5" rx="5" ry="2" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width=".7"/>
<ellipse class="xa-pw-flat" cx="48" cy="33.5" rx="5" ry="1.5" fill="#5e8eaf"/>
<g class="xa-pw-jet" fill="none" stroke-linecap="round">${arcs.map(([d, w, o]) => `<path d="${d}" stroke="#6ec1ef" stroke-width="${w}" stroke-opacity="${o}"/>`).join("")}
<ellipse cx="48" cy="9.5" rx="3.2" ry="2" fill="#9ad6f6"/>
<ellipse cx="48" cy="32.5" rx="5" ry="2.5" fill="url(#ID-sp)" stroke="#8d95a0" stroke-width=".6"/></g>
${pts.map((p) => chase(p, 6, 0.75, "#e3f5fe", 0.6)).join("")}
<g class="xa-pw-spl" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width=".8">${[[33, ""], [40, ""], [56, " xa-pw-r"], [63, " xa-pw-r"]].map(([x, c]) => `<ellipse class="xa-pw-sp${c}" cx="${x}" cy="31" rx="2.6" ry="1.1"/>`).join("")}</g>
<rect class="xa-pw-led" x="41" y="92" width="14" height="3" rx="1.5"/>`);
  };
  D["dehumidifier"] = () => {
    const air = [[38, 1.4], [48, 1.6], [58, 1.5]].map(([x, d]) => chase(bez([x, 2], [x - 4, 8], [x + 4, 15], [x, 21]), 5, 1.1, "#81d4fa", d)).join("");
    const grille = [0, 1, 2, 3].map((k) => `M29.5 ${(25.6 + k * 2.6).toFixed(1)}H66.5`).join("");
    return sk(nest("0 0 96 108", 4.8, -3.3, 110.4, 124.2, `<defs><linearGradient id="ID-dhmbody" x1="0" x2="1"><stop offset="0" stop-color="#d7dbde"/><stop offset=".3" stop-color="#f6f7f8"/><stop offset=".7" stop-color="#eef0f2"/><stop offset="1" stop-color="#d7dbde"/></linearGradient>
<linearGradient id="ID-dhmwater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#64b5f6"/><stop offset="1" stop-color="#1e88e5"/></linearGradient>
<clipPath id="ID-dhmwin"><rect x="33" y="72" width="30" height="20" rx="3"/></clipPath></defs>
${air}
<rect x="28" y="99" width="7" height="5" rx="2" fill="#3b4048"/><rect x="61" y="99" width="7" height="5" rx="2" fill="#3b4048"/>
<path d="M24 31Q24 22 33 22H63Q72 22 72 31V94Q72 100 66 100H30Q24 100 24 94Z" fill="url(#ID-dhmbody)" stroke="#9aa1a8" stroke-width=".8"/>
<rect x="29" y="25" width="38" height="10" rx="3" fill="#6e767e"/><path d="${grille}" stroke="#3a4047" stroke-width="1.2"/>
${lcd(38, 40, 20, 9, "45%")}
<circle class="xa-led" cx="32.5" cy="44.5" r="1.5"/>
<path d="M24 64H72" stroke="#000" stroke-opacity=".12"/><path d="M40 66H56V67.5Q56 69 54.5 69H41.5Q40 69 40 67.5Z" fill="#000" opacity=".14"/>
<rect x="33" y="72" width="30" height="20" rx="3" fill="#7d93a6"/>
<g clip-path="url(#ID-dhmwin)"><rect class="xa-dhm-water" x="33" y="85" width="30" height="7" fill="url(#ID-dhmwater)"/>
<rect class="xa-dhm-surf" x="33" y="85" width="30" height="1.5" fill="#cfe9ff" opacity=".6"/>
<g class="xa-dhm-drip" fill="#42a5f5"><ellipse cx="43" cy="70.5" rx="1" ry="1.5"/><ellipse cx="49" cy="70.5" rx="1" ry="1.5"/></g></g>
<rect x="33" y="72" width="30" height="20" rx="3" fill="none" stroke="#000" stroke-opacity=".2"/>
<path d="M28 30Q28 25 33 25" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1"/>`), 116.3, 32);
  };
  D["space-heater"] = () => {
    const air = [[37.5, 1.4], [48, 1.6], [58.5, 1.5]].map(([x, d]) => chase(bez([x, 34], [x - 4.2, 24], [x + 4.2, 16], [x, 6]), 6, 1.2, "#ff8a65", d)).join("");
    const bars = Array.from({ length: 8 }, (_, k) => `M31 ${(61.7 + k * 4).toFixed(1)}H65`).join("");
    return sk(nest("0 0 96 108", 2.4, -6.1, 115.2, 129.6, `<defs><linearGradient id="ID-shbody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f5f6"/><stop offset=".55" stop-color="#e3e7ea"/><stop offset="1" stop-color="#bfc7cd"/></linearGradient>
<radialGradient id="ID-shglow" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#ffb74d"/><stop offset=".45" stop-color="#ff7043"/><stop offset=".8" stop-color="#8d2d0e"/><stop offset="1" stop-color="#5a1c08"/></radialGradient>
<radialGradient id="ID-shhalo"><stop offset="0" stop-color="#ff8a50" stop-opacity=".45"/><stop offset="1" stop-color="#ff8a50" stop-opacity="0"/></radialGradient>
<clipPath id="ID-shgrill"><rect x="31" y="61" width="34" height="31" rx="7"/></clipPath></defs>
<g class="xa-sh-halo"><ellipse cx="48" cy="76" rx="34" ry="30" fill="url(#ID-shhalo)"/></g>
${air}
<rect x="30" y="97" width="10" height="5" rx="2" fill="#3b4048"/><rect x="56" y="97" width="10" height="5" rx="2" fill="#3b4048"/>
<path d="M25 48Q25 36 37 36H59Q71 36 71 48V90Q71 98 63 98H33Q25 98 25 90Z" fill="url(#ID-shbody)" stroke="#9aa1a8" stroke-width=".8"/>
<rect x="41" y="40" width="14" height="4" rx="2" fill="#000" opacity=".28"/>
${lcd(38, 48, 20, 9, "22°", "xa-lcdo")}
<g clip-path="url(#ID-shgrill)"><rect x="31" y="61" width="34" height="31" fill="#20252b"/>
<rect class="xa-sh-glow" x="31" y="61" width="34" height="31" fill="url(#ID-shglow)"/>
<g transform="translate(37 65.5) scale(.917)"><path class="xa-sh-fan" fill="#78909c" opacity=".5" d="M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12.5,2C17,2 17.11,5.57 14.75,6.75C13.76,7.24 13.32,8.29 13.13,9.22C13.61,9.42 14.03,9.73 14.35,10.13C18.05,8.13 22.03,8.92 22.03,12.5C22.03,17 18.46,17.1 17.28,14.73C16.78,13.74 15.72,13.3 14.79,13.11C14.59,13.59 14.28,14 13.88,14.34C15.87,18.03 15.08,22 11.5,22C7,22 6.91,18.42 9.27,17.24C10.25,16.75 10.69,15.71 10.89,14.79C10.4,14.59 9.97,14.27 9.65,13.87C5.96,15.85 2,15.07 2,11.5C2,7 5.56,6.89 6.74,9.26C7.24,10.25 8.29,10.68 9.22,10.87C9.41,10.39 9.73,9.97 10.14,9.65C8.15,5.96 8.94,2 12.5,2Z"/></g>
<path d="${bars}" stroke="#1e2228" stroke-opacity=".95" stroke-width="1.4"/></g>
<rect x="31" y="61" width="34" height="31" rx="7" fill="none" stroke="#000" stroke-opacity=".3"/>
<path d="M29 50Q29 40 38 40" fill="none" stroke="#fff" stroke-opacity=".45"/>`), 116.3, 26);
  };
  D["monitor"] = () => sk(nest("0 0 96 108", -12, -10, 144, 162, `<defs><linearGradient id="ID-monbez" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#515860"/><stop offset=".5" stop-color="#3b4045"/><stop offset="1" stop-color="#22262a"/></linearGradient>
<linearGradient id="ID-monglass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2f36"/><stop offset=".55" stop-color="#0c0e11"/><stop offset="1" stop-color="#16191d"/></linearGradient>
<linearGradient id="ID-monpic" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b8def"/><stop offset=".6" stop-color="#7e57c2"/><stop offset="1" stop-color="#4a3a8a"/></linearGradient>
<linearGradient id="ID-monneck" x1="0" x2="1"><stop offset="0" stop-color="#22262a"/><stop offset=".5" stop-color="#3b4045"/><stop offset="1" stop-color="#22262a"/></linearGradient>
<clipPath id="ID-monclip"><rect x="19" y="29" width="58" height="35" rx="1.5"/></clipPath></defs>
<rect x="44" y="68" width="8" height="13" fill="url(#ID-monneck)"/>
<rect x="34" y="80" width="28" height="4" rx="2" fill="url(#ID-monbez)"/>
<rect x="16" y="26" width="64" height="42" rx="2" fill="url(#ID-monbez)" stroke="#000" stroke-opacity=".25" stroke-width=".6"/>
<rect x="19" y="29" width="58" height="35" rx="1.5" fill="url(#ID-monglass)"/>
<g class="xa-mon-pic" clip-path="url(#ID-monclip)"><rect x="19" y="29" width="58" height="35" fill="url(#ID-monpic)"/>
<rect x="24.8" y="33.9" width="26.1" height="16.8" rx=".6" fill="#ddd8ee"/><rect x="24.8" y="33.9" width="26.1" height="2" fill="#9fa9cc"/>
<path d="M27 39.5H44M27 42H40M27 44.5H46" stroke="#8d86b0" stroke-width=".8"/><rect class="xa-mon-cur" x="46.6" y="43.6" width=".7" height="1.8" fill="#4a3a8a"/>
<g class="xa-mon-mv"><rect x="42.2" y="40.2" width="27.8" height="16.1" rx=".6" fill="#e6e2f2"/><rect x="42.2" y="40.2" width="27.8" height="2" fill="#a9b3d6"/>
<rect x="44.4" y="44.4" width="10" height="7" rx=".6" fill="#7ea7ef"/><path d="M57 45.2H67M57 47.6H65M57 50H66" stroke="#9a93bd" stroke-width=".8"/></g>
<rect x="19" y="61" width="58" height="3" fill="#14161e" opacity=".55"/></g>
<path d="M19 29H31.8L19 47Z" fill="#fff" opacity=".1"/>
<circle class="xa-mon-led" cx="48" cy="66.4" r=".9"/>`), 116.3, 26);
  D["router"] = () => {
    const arc = (r) => { const a = (d) => [(48 + r * Math.cos(d * Math.PI / 180)).toFixed(1), (48 + r * Math.sin(d * Math.PI / 180)).toFixed(1)]; const [x1, y1] = a(225), [x2, y2] = a(315); return `<path d="M${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}"/>`; };
    const lan = [0, 1, 2, 3].map((i) => `<circle class="xa-nw-led xa-nw-lan" cx="${57.3 + i * 6}" cy="84.3" r="1.3" style="animation-delay:-${(i * 0.45).toFixed(2)}s"/>`).join("");
    return sk(nest("0 0 96 108", -2.4, -6, 124.8, 140.4, `<defs><linearGradient id="ID-nwbody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a6168"/><stop offset=".45" stop-color="#3d4247"/><stop offset="1" stop-color="#25292d"/></linearGradient>
<linearGradient id="ID-nwant" x1="0" x2="1"><stop offset="0" stop-color="#262a2f"/><stop offset="1" stop-color="#565d64"/></linearGradient></defs>
<g class="xa-nw-wave">${arc(5)}${arc(11)}${arc(17)}</g>
<rect x="20" y="46" width="3.5" height="30" rx="1.6" fill="url(#ID-nwant)" transform="rotate(-8 21.8 61)"/>
<rect x="72.5" y="46" width="3.5" height="30" rx="1.6" fill="url(#ID-nwant)" transform="rotate(8 74.3 61)"/>
<rect x="46.3" y="52" width="3.5" height="24" rx="1.6" fill="url(#ID-nwant)"/>
<rect x="10" y="74" width="76" height="20" rx="6" fill="url(#ID-nwbody)" stroke="#6a717a" stroke-width=".6"/>
<path d="M16 76.5H80" stroke="#fff" stroke-opacity=".14"/>
<circle class="xa-nw-led xa-nw-g" cx="19.3" cy="84.3" r="1.3"/><circle class="xa-nw-led xa-nw-g" cx="27.3" cy="84.3" r="1.3"/><circle class="xa-nw-led xa-nw-b" cx="35.3" cy="84.3" r="1.3"/>${lan}
<path d="${Array.from({ length: 20 }, (_, k) => `M${(18.6 + k * 3).toFixed(1)} 89v2`).join("")}" stroke="#000" stroke-opacity=".35" stroke-width="1.2"/>`), 116.3, 40);
  };
  D["scale"] = () => sk(nest("0 0 96 108", 0, -2.5, 120, 135, `<defs><linearGradient id="ID-sclglass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3c8d0"/><stop offset="1" stop-color="#959ca6"/></linearGradient>
<linearGradient id="ID-scledge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a929b"/><stop offset="1" stop-color="#5f6770"/></linearGradient>
<radialGradient id="ID-sclpad"><stop offset="0" stop-color="#4fc3f7" stop-opacity=".45"/><stop offset="1" stop-color="#4fc3f7" stop-opacity=".1"/></radialGradient>
<radialGradient id="ID-scldisp"><stop offset="0" stop-color="#4fc3f7" stop-opacity=".35"/><stop offset="1" stop-color="#4fc3f7" stop-opacity="0"/></radialGradient></defs>
<path d="M6 88H90V92Q90 95 87 95H9Q6 95 6 92Z" fill="url(#ID-scledge)"/>
<path d="M20 50Q21 46 25 46H71Q75 46 76 50L90 86Q91 89 87 89H9Q5 89 6 86Z" fill="url(#ID-sclglass)" stroke="#a7aeb7" stroke-width=".6"/>
<path d="M25 48H42L28 86H12Z" fill="#fff" opacity=".14"/>
<ellipse cx="33" cy="76" rx="9" ry="6.5" fill="#3c4650" opacity=".14"/><ellipse cx="63" cy="76" rx="9" ry="6.5" fill="#3c4650" opacity=".14"/>
<g class="xa-scl-pad"><ellipse cx="33" cy="76" rx="9" ry="6.5" fill="url(#ID-sclpad)"/><ellipse cx="63" cy="76" rx="9" ry="6.5" fill="url(#ID-sclpad)"/></g>
<rect x="25" y="50" width="46" height="16" rx="2" fill="#0e1b2c" stroke="#27394f" stroke-width=".4"/>
<ellipse class="xa-scl-disp" cx="48" cy="58" rx="22" ry="8" fill="url(#ID-scldisp)"/>
<g class="xa-scl-val"><text class="xa-scl-lcd" x="47" y="62">72.4</text><text class="xa-scl-unit" x="69" y="62">kg</text></g>`), 116.3, 50);   // i18n-ok (CSS / a unit, not words)
  D["security-camera"] = () => {
    const ir = Array.from({ length: 8 }, (_, i) => { const t = (i / 8) * Math.PI * 2; return `<circle cx="${(60 + Math.cos(t) * 12.5).toFixed(1)}" cy="${(46 + Math.sin(t) * 12.5).toFixed(1)}" r="1.1"/>`; }).join("");
    return sk(`<defs><linearGradient id="ID-camsh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dde1e6"/><stop offset=".55" stop-color="#c9ced4"/><stop offset="1" stop-color="#aab2bb"/></linearGradient>
<linearGradient id="ID-camshv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9ecf0"/><stop offset="1" stop-color="#aab2bb"/></linearGradient>
<radialGradient id="ID-camsph" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#dfe3e8"/><stop offset=".6" stop-color="#c6ccd3"/><stop offset="1" stop-color="#959ea8"/></radialGradient>
<radialGradient id="ID-camglass" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#3a4552"/><stop offset=".55" stop-color="#11161c"/><stop offset="1" stop-color="#05070a"/></radialGradient>
<radialGradient id="ID-camlens" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#4f6b8a"/><stop offset=".45" stop-color="#16263a"/><stop offset="1" stop-color="#020407"/></radialGradient>
<radialGradient id="ID-camglow" r=".5"><stop offset="0" stop-color="#4fc3f7" stop-opacity=".9"/><stop offset="1" stop-color="#4fc3f7" stop-opacity="0"/></radialGradient>
<clipPath id="ID-camface"><ellipse cx="60" cy="47" rx="21" ry="18.5"/></clipPath></defs>
<g transform="translate(0 7)">
<path d="M38 88Q38 82 44 81H76Q82 82 82 88V104Q82 109 76 109H44Q38 109 38 104Z" fill="url(#ID-camsh)" stroke="#000" stroke-opacity=".28" stroke-width=".6"/>
<ellipse cx="60" cy="83" rx="21" ry="3.6" fill="#eceff2" opacity=".6"/>
<rect x="52" y="76" width="16" height="8" rx="3" fill="url(#ID-camshv)" stroke="#000" stroke-opacity=".28" stroke-width=".5"/>
<circle cx="60" cy="47" r="31" fill="url(#ID-camsph)" stroke="#000" stroke-opacity=".28" stroke-width=".7"/>
<ellipse cx="60" cy="47" rx="21" ry="18.5" fill="#111418"/>
<g clip-path="url(#ID-camface)"><g class="xa-cam-face"><ellipse cx="60" cy="47" rx="21" ry="18.5" fill="url(#ID-camglass)" opacity=".9"/>
<g fill="#5a1a1a">${ir}</g>
<circle cx="60" cy="46" r="8.8" fill="#05070a"/><circle cx="60" cy="46" r="7.2" fill="url(#ID-camlens)"/><circle cx="60" cy="46" r="3" fill="#03060a"/>
<circle class="xa-cam-glow" cx="60" cy="46" r="13.7" fill="url(#ID-camglow)"/>
<ellipse class="xa-cam-glint" cx="57.5" cy="43.3" rx="2.3" ry="1.4" fill="#fff" opacity=".55" transform="rotate(-30 57.5 43.3)"/>
<circle cx="49" cy="38" r="1.3" fill="#2b3946"/></g></g>
<circle class="xa-cam-led" cx="60" cy="61" r="1.5"/>
<path d="M44 36Q52 31 62 31" stroke="#fff" stroke-width="1.4" opacity=".18" fill="none" stroke-linecap="round"/>
<g class="xa-cam-rec"><rect x="22" y="14" width="13" height="9" rx="4.5" fill="#000" opacity=".55"/><circle cx="28.5" cy="18.5" r="2.4" fill="#ff3b30"/></g></g>`, 116, 30);
  };
  D["aroma-diffuser"] = () => {
    const d = "M56.5 14H63.5C63.5 30 71 40 85 50C100 60 103 79 97 91Q94 99 85 99H35Q26 99 23 91C17 79 20 60 35 50C49 40 56.5 30 56.5 14Z";
    const grain = Array.from({ length: 9 }, (_, i) => { const x = 26 + i * 8.5, w = 3 + (i % 3) * 2; return `<path d="M${x} 20C${x + w} 40 ${x - w} 60 ${x + w / 2} 80S${x - w} 96 ${x} 104" stroke-width="${(0.6 + (i % 2) * 0.5).toFixed(1)}"/>`; }).join("");
    const puffs = [0, -6, 7, -2].map((dx) => `<ellipse cx="60" cy="30" rx="6" ry="4.5" style="--dx:${dx}px"/>`).join("");
    return sk(`<defs><radialGradient id="ID-df2b" cx=".38" cy=".38" r=".75"><stop offset="0" stop-color="#e3b07a"/><stop offset=".55" stop-color="#c98f55"/><stop offset="1" stop-color="#7d4a26"/></radialGradient>
<radialGradient id="ID-df2halo" r=".5"><stop offset="0" stop-color="#ffd180"/><stop offset=".45" stop-color="#ffd180" stop-opacity=".55"/><stop offset="1" stop-color="#ffd180" stop-opacity="0"/></radialGradient>
<radialGradient id="ID-df2puff" r=".5"><stop offset="0" stop-color="#e6e0f4" stop-opacity=".85"/><stop offset=".6" stop-color="#d9d4ec" stop-opacity=".45"/><stop offset="1" stop-color="#d9d4ec" stop-opacity="0"/></radialGradient>
<clipPath id="ID-df2c"><path d="${d}"/></clipPath></defs>
<g transform="translate(12 31) scale(.8)"><ellipse class="xa-df2-halo" cx="60" cy="104" rx="66" ry="15" fill="url(#ID-df2halo)"/>
<rect x="33" y="99" width="7" height="4" rx="1.5" fill="#7d4a26"/><rect x="80" y="99" width="7" height="4" rx="1.5" fill="#7d4a26"/>
<path d="${d}" fill="url(#ID-df2b)"/>
<g clip-path="url(#ID-df2c)" fill="none" stroke="#7a4522" opacity=".35">${grain}<ellipse cx="72" cy="66" rx="9" ry="14" stroke-width=".7"/></g>
<path d="M30 60Q38 50 50 46" stroke="#fff" stroke-width="3" opacity=".22" fill="none" stroke-linecap="round"/>
<path class="xa-df2-band" d="M21 82Q60 88 99 82L98.6 84.4Q60 90.4 21.4 84.4Z"/>
<rect x="47" y="88" width="12" height="4" rx="2" fill="none" stroke="#e9e4d8" stroke-width=".9"/><rect x="61" y="88" width="12" height="4" rx="2" fill="none" stroke="#e9e4d8" stroke-width=".9"/>
<ellipse cx="60" cy="14.5" rx="3.5" ry="1" fill="#4a2a14"/></g>
<g class="xa-df2-puffs" fill="url(#ID-df2puff)">${puffs}</g>`, 116, 30);
  };
  D["mailbox"] = () => sk(`<defs><linearGradient id="ID-mbshv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dde2"/><stop offset="1" stop-color="#9aa3ad"/></linearGradient>
<linearGradient id="ID-mbsh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dde1e5"/><stop offset=".55" stop-color="#c9ced4"/><stop offset="1" stop-color="#9aa3ad"/></linearGradient>
<linearGradient id="ID-mbin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4249"/><stop offset="1" stop-color="#5b646d"/></linearGradient>
<clipPath id="ID-mbslot"><rect x="0" y="-8" width="120" height="40"/></clipPath></defs>
<g transform="translate(0 -9)">
<rect x="55" y="98" width="10" height="27" fill="#8f979f"/><rect x="55" y="98" width="3" height="27" fill="#fff" opacity=".2"/>
<g class="xa-mb-flag"><g class="xa-mb-wig"><rect x="96.5" y="45" width="3" height="19" rx="1" fill="#6f7780"/><path d="M99.5 45H109.5L107.5 49L109.5 53H99.5Z" fill="#e53935"/><circle cx="98" cy="62.5" r="1.6" fill="#4f565e"/></g></g>
<rect x="24" y="18" width="72" height="82" rx="5" fill="url(#ID-mbshv)" stroke="#000" stroke-opacity=".28" stroke-width=".7"/>
<rect x="30" y="40" width="60" height="54" rx="3" fill="url(#ID-mbsh)" stroke="#000" stroke-opacity=".28" stroke-width=".6"/>
<rect x="40" y="46" width="40" height="10" rx="2" fill="#151a20"/>
<g class="xa-mb-mail"><rect x="43" y="50" width="16" height="6" fill="#e2ddcf"/><rect x="57" y="49" width="18" height="7" fill="#d4ccb8"/><path d="M57 49L66 53L75 49" fill="none" stroke="#a89f8a" stroke-width=".5"/></g>
<path d="M41 47.5H58" stroke="#fff" stroke-width=".8" opacity=".25"/>
<rect x="44" y="62" width="32" height="8" rx="1" fill="#c8a24e"/><path d="M48 66H72" stroke="#8a6d2a" stroke-width=".8"/>
<circle cx="82" cy="80" r="2.2" fill="#7b8590"/><rect x="81.4" y="80" width="1.2" height="3.4" fill="#7b8590"/>
<rect x="20" y="12" width="80" height="9" rx="3" fill="url(#ID-mbshv)" stroke="#000" stroke-opacity=".28" stroke-width=".7"/><path d="M24 14H96" stroke="#fff" stroke-width="1.2" opacity=".35"/>
<rect x="36" y="29.6" width="48" height="3.4" rx="1" fill="#151a20"/>
<g clip-path="url(#ID-mbslot)"><g class="xa-mb-post"><rect x="47" y="21" width="26" height="10" rx="1" fill="#e2ddcf" stroke="#a89f8a" stroke-width=".5"/><path d="M47 21L60 27L73 21" fill="none" stroke="#a89f8a" stroke-width=".6"/></g></g>
<path d="M34 30L36.4 24.6H83.6L86 30Z" fill="url(#ID-mbsh)" stroke="#000" stroke-opacity=".28" stroke-width=".5"/><path d="M37 25.6H83" stroke="#fff" stroke-width=".8" opacity=".4"/></g>`, 116, 26);
  // ---------- CSS (every loop is gated by ".xa-on") ----------
  const css = `
.xa-svg{width:100%;height:100%;display:block;overflow:visible}
.xa-lcd{font:700 5.6px ui-monospace,Consolas,monospace;fill:#3b335f}
.xa-lcds{font-size:4.4px}
.xa-on .xa-lcd{fill:#7dd3fc}
.xa-on .xa-lcdo{fill:#ff9a4a}
.xa-led{fill:#3b335f}
.xa-on .xa-led{fill:#34d399}
.xa-on .xa-ledo{fill:#ff9a4a}
.xa-on .xa-ledb{fill:#38d9ff}
.xa-on .xa-ledy{fill:#ffd76a}
.xa-on .xa-ledp{animation:xa-pulse 1.6s ease-in-out infinite}
.xa-on .xa-d2{animation-delay:-.6s}
.xa-steam path{fill:none;stroke:#d9d4ec;stroke-width:2;stroke-linecap:round;opacity:0}
.xa-on .xa-steam path{animation:xa-steam 2.4s ease-out infinite}
.xa-on .xa-steam path:nth-child(2){animation-delay:-.8s}
.xa-on .xa-steam path:nth-child(3){animation-delay:-1.6s}
.xa-mist circle{fill:#dff3ff;opacity:0}
.xa-on .xa-mist circle{animation:xa-mist 2.8s ease-out infinite}
.xa-on .xa-mist circle:nth-child(2){animation-delay:-.7s}
.xa-on .xa-mist circle:nth-child(3){animation-delay:-1.4s}
.xa-on .xa-mist circle:nth-child(4){animation-delay:-2.1s}
.xa-drops circle{opacity:0}
.xa-on .xa-drops circle{animation:xa-fall 2.4s ease-in infinite}
.xa-on .xa-drops circle:nth-child(2){animation-delay:-.8s}
.xa-on .xa-drops circle:nth-child(3){animation-delay:-1.6s}
.xa-on .xa-drops circle:nth-child(4){animation-delay:-1.2s}
.xa-chase circle{opacity:0}
.xa-on .xa-chase circle{animation:xa-chase 1.2s linear infinite}
.xa-spin{transform-box:fill-box;transform-origin:center}
.xa-on .xa-spin{animation:xa-rot var(--sp,1s) linear infinite}
.xa-on .xa-hum{animation:xa-hum .3s linear infinite}
.xa-flake{transform-box:fill-box;transform-origin:center;opacity:.5}
.xa-on .xa-flake{opacity:1;animation:xa-rot 14s linear infinite}
/* drawer freezer */
.xa-df-light{opacity:0;transition:opacity .6s}
.xa-on .xa-df-light{opacity:.25}
/* coffee */
.xa-lvl{transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(.06);transition:transform 3s ease}
.xa-on .xa-lvl{transform:scaleY(.8)}
.xa-cdrip circle{fill:#5a3417;opacity:0}
.xa-on .xa-cdrip circle{animation:xa-drip 1.1s ease-in infinite}
.xa-on .xa-cdrip circle:nth-child(2){animation-delay:-.37s}
.xa-on .xa-cdrip circle:nth-child(3){animation-delay:-.74s}
.xa-on .xa-cdrip.xa-d2 circle{animation-duration:1.3s}
.xa-cstream{fill:none;opacity:0;transition:opacity .4s}
.xa-on .xa-cstream{opacity:.5}
.xa-cf-plate,.xa-cf-hot{opacity:0;transition:opacity .6s}
.xa-on .xa-cf-plate{opacity:1;animation:xa-pulse 1.8s ease-in-out infinite}
.xa-on .xa-cf-hot{opacity:.8}
/* air fryer */
.xa-af-coil{fill:none;stroke:#4a3a33;stroke-width:1.1;stroke-linejoin:round}
.xa-af-coilh{fill:none;stroke:#ff5a1f;stroke-width:1.3;stroke-linejoin:round;opacity:0}
.xa-on .xa-af-coilh{opacity:1;animation:xa-pulse 1.6s ease-in-out infinite}
.xa-af-light{opacity:0;transition:opacity .8s}
.xa-on .xa-af-light{opacity:.85}
.xa-af-air path{fill:none;stroke:#ffe2b8;stroke-width:1;stroke-linecap:round;stroke-dasharray:3 5;opacity:0}
.xa-on .xa-af-air path{animation:xa-swirl 1.4s ease-in-out infinite}
.xa-on .xa-af-air path:nth-child(2){animation-delay:-.7s}
.xa-af-food{transform-box:fill-box;transform-origin:50% 100%}
.xa-on .xa-af-food{animation:xa-toss 1.3s ease-in-out infinite}
.xa-on .xa-af-food.xa-d2{animation-delay:-.65s}
/* robot vacuum */
.xa-rv-ring{fill:none;stroke:#6f6799;stroke-width:3.5;stroke-linecap:round}
.xa-on .xa-rv-ring{stroke:#34d399}
.xa-rv-bot{transform-box:fill-box;transform-origin:50% 80%}
.xa-on .xa-rv-bot{animation:xa-wiggle 2.4s ease-in-out infinite}
.xa-rv-brush{transform-box:fill-box;transform-origin:center}
.xa-on .xa-rv-brush{animation:xa-rot .35s linear infinite}
.xa-rv-dust circle{fill:#9a92b8;opacity:0}
.xa-on .xa-rv-dust circle{animation:xa-suck 1.4s ease-in infinite}
.xa-rv-scan{opacity:0}
.xa-on .xa-rv-scan{opacity:1;animation:xa-scan .9s ease-in-out infinite alternate}
/* water heater */
.xa-wh-waves path{fill:none;stroke:#ff9a4a;stroke-width:2;stroke-linecap:round;opacity:0}
.xa-on .xa-wh-waves path{animation:xa-steam 2s ease-out infinite}
.xa-on .xa-wh-waves path:nth-child(2){animation-delay:-.7s}
.xa-on .xa-wh-waves path:nth-child(3){animation-delay:-1.4s}
/* AC split */
.xa-ac-flap{transform-box:fill-box;transform-origin:50% 0;transition:transform .9s cubic-bezier(.3,1.3,.5,1)}
.xa-on .xa-ac-flap{transform:translateY(4.5px) scaleY(.75);animation:xa-swing 6s ease-in-out infinite}
.xa-ac-slot,.xa-ac-ico{opacity:0;transition:opacity .6s}
.xa-on .xa-ac-slot,.xa-on .xa-ac-ico{opacity:1}
.xa-ac-air path{fill:none;stroke:#7dd3fc;stroke-width:2;stroke-linecap:round;stroke-dasharray:5 7;opacity:0}
.xa-on .xa-ac-air path{animation:xa-blow 1.8s linear infinite}
.xa-on .xa-ac-air path:nth-child(2){animation-delay:-.4s}
.xa-on .xa-ac-air path:nth-child(3){animation-delay:-.9s}
.xa-on .xa-ac-air path:nth-child(4){animation-delay:-1.3s}
.xa-on .xa-ac-air path:nth-child(5){animation-delay:-.2s}
/* heat pump */
.xa-hp-out circle{fill:none;stroke:#4fc3f7;stroke-width:2.2;opacity:0;transform-box:fill-box;transform-origin:center}
.xa-on .xa-hp-out circle{animation:xa-ring 1.8s ease-out infinite}
.xa-on .xa-hp-out circle:nth-child(2){animation-delay:-.6s}
.xa-on .xa-hp-out circle:nth-child(3){animation-delay:-1.2s}
/* solar */
.xa-sol-sun{opacity:.4;transition:opacity 1s}
.xa-on .xa-sol-sun{opacity:1}
.xa-sol-rays{transform-box:fill-box;transform-origin:center}
.xa-on .xa-sol-rays{animation:xa-rot 18s linear infinite}
.xa-sol-shade{opacity:.35;transition:opacity 1s}
.xa-on .xa-sol-shade{opacity:0}
.xa-sol-glow{opacity:0;transition:opacity 1s}
.xa-on .xa-sol-glow{opacity:.14}
.xa-sol-sweep{opacity:0}
.xa-on .xa-sol-sweep{opacity:1;animation:xa-sweep 3.2s ease-in-out infinite}
/* home battery */
.xa-on .xa-bat-wave{animation:xa-bob 2.6s ease-in-out infinite alternate}
.xa-bat-bolt{opacity:.25;transition:opacity .6s}
.xa-on .xa-bat-bolt{opacity:1;animation:xa-pulse 1.4s ease-in-out infinite}
/* EV charger */
.xa-ev-led{opacity:0;transition:opacity .6s}
.xa-on .xa-ev-led{opacity:1;animation:xa-pulse 2s ease-in-out infinite}
.xa-ev-scr{font:700 8px ui-monospace,Consolas,monospace;fill:#3b335f}
.xa-on .xa-ev-scr{fill:#7fe0ff}
.xa-ev-gauge{opacity:.55}
.xa-on .xa-ev-gauge{opacity:1;animation:xa-pulse 2s ease-in-out infinite}
.xa-ev-spark{opacity:0;transform-box:fill-box;transform-origin:center}
.xa-on .xa-ev-spark{animation:xa-spark 1.2s ease-in-out infinite}
/* pool pump */
.xa-on .xa-pp-ripple{animation:xa-ripple 3s linear infinite}
.xa-pp-bub circle{opacity:0}
.xa-on .xa-pp-bub circle{animation:xa-jetbub 1.4s ease-out infinite}
.xa-on .xa-pp-bub circle:nth-child(2){animation-delay:-.35s}
.xa-on .xa-pp-bub circle:nth-child(3){animation-delay:-.7s}
.xa-on .xa-pp-bub circle:nth-child(4){animation-delay:-1.05s}
/* lights */
.xa-lt-lit{opacity:0;transition:opacity .7s}
.xa-on .xa-lt-lit{opacity:var(--k,1)}
.xa-lt-halo{transform-box:fill-box;transform-origin:center}
.xa-on .xa-lt-halo{animation:xa-breath 4s ease-in-out infinite}
.xa-lt-wire{fill:none;stroke:#8a8f96;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}
.xa-on .xa-lt-wire{stroke:#fff6dc}
.xa-on .xa-lt-beams{animation:xa-beam 3.5s ease-in-out infinite}
.xa-lt-motes circle{opacity:0}
.xa-on .xa-lt-motes circle{animation:xa-mote 5s linear infinite}
.xa-on .xa-lt-motes circle:nth-child(2){animation-delay:-1.2s}
.xa-on .xa-lt-motes circle:nth-child(3){animation-delay:-2.6s}
.xa-on .xa-lt-motes circle:nth-child(4){animation-delay:-3.8s}
.xa-lt-sway{transform-box:fill-box;transform-origin:50% 0}
.xa-on .xa-lt-sway{animation:xa-sway 6s ease-in-out infinite}
/* TV */
.xa-tv-content{opacity:0;transition:opacity .5s}
.xa-on .xa-tv-content{opacity:1}
.xa-on .xa-tv-row{animation:xa-row 12s ease-in-out infinite}
.xa-on .xa-tv-row2{animation:xa-row2 16s ease-in-out infinite}
.xa-on .xa-tv-sel{animation:xa-sel 12s ease-in-out infinite}
.xa-tv-gloss{opacity:1;transition:opacity .5s}
.xa-on .xa-tv-gloss{opacity:.35}
.xa-tv-led{fill:#ff3b30}
.xa-on .xa-tv-led{fill:#fff;opacity:.45}
/* range hood */
.xa-hd-beam,.xa-hd-zone{opacity:0;transition:opacity .6s}
.xa-on .xa-hd-beam,.xa-on .xa-hd-zone{opacity:1}
.xa-hd-lamp{fill:#6b737c}
.xa-on .xa-hd-lamp{fill:#fff6d5}
.xa-hd-air path{fill:none;stroke:#cfe6ff;stroke-width:1.3;stroke-linecap:round;stroke-dasharray:3 5;opacity:0}
.xa-on .xa-hd-air path{animation:xa-up 1.6s linear infinite}
.xa-on .xa-hd-air path:nth-child(2){animation-delay:-.5s}
.xa-on .xa-hd-air path:nth-child(3){animation-delay:-1s}
.xa-on .xa-hd-air path:nth-child(4){animation-delay:-.25s}
.xa-on .xa-hd-air path:nth-child(5){animation-delay:-.75s}
.xa-hd-steam path{transform-box:fill-box;transform-origin:50% 100%;fill:none;stroke:#e3e8ed;stroke-width:2.2;stroke-linecap:round;opacity:0}
.xa-on .xa-hd-steam path{animation:xa-suckup 2s ease-in infinite}
.xa-on .xa-hd-steam path:nth-child(2){animation-delay:-.65s}
.xa-on .xa-hd-steam path:nth-child(3){animation-delay:-1.3s}
/* wine cooler */
.xa-wn-light{opacity:0;transition:opacity .8s}
.xa-on .xa-wn-light{opacity:.85}
.xa-wn-bottles{opacity:.55;transition:opacity .8s}
.xa-on .xa-wn-bottles{opacity:1}
.xa-wn-air path{opacity:0}
.xa-on .xa-wn-air path{animation:xa-up 2.4s linear infinite}
.xa-on .xa-wn-air path:nth-child(2){animation-delay:-.8s}
.xa-on .xa-wn-air path:nth-child(3){animation-delay:-1.6s}
/* garage door + sliding gate ("on" = open) */
.xa-gd-door{transition:transform 2.6s cubic-bezier(.45,0,.25,1)}
.xa-on .xa-gd-door{transform:translateY(-92px)}
.xa-gd-bulb{opacity:0;transition:opacity .6s}
.xa-on .xa-gd-bulb{opacity:1}
.xa-sg-leaf{transition:transform 4s cubic-bezier(.45,0,.25,1)}
.xa-on .xa-sg-leaf{transform:translateX(104px)}
.xa-sg-wheel{transform-box:fill-box;transform-origin:center;transition:transform 4s cubic-bezier(.45,0,.25,1)}
.xa-on .xa-sg-wheel{transform:rotate(4turn)}
.xa-acc-lamp,.xa-acc-halo{opacity:0}
.xa-acc-halo{transform-box:fill-box;transform-origin:center}
.xa-on .xa-acc-lamp{animation:xa-blink 1.4s steps(2) infinite}
.xa-on .xa-acc-halo{animation:xa-flash 1.4s ease-out infinite}
/* sump pump */
.xa-sp-lvl{transform:translateY(30px);transition:transform 6s ease-in-out}
.xa-on .xa-sp-lvl{transform:translateY(62px)}
.xa-on .xa-sp-wave{animation:xa-wave 2.4s linear infinite}
.xa-sp-bub circle{opacity:0}
.xa-on .xa-sp-bub circle{animation:xa-steam 1.6s ease-out infinite}
.xa-on .xa-sp-bub circle:nth-child(2){animation-delay:-.5s}
.xa-on .xa-sp-bub circle:nth-child(3){animation-delay:-1.1s}
/* AV receiver ("on" = playing) */
.xa-av-pwr{fill:#3a2222}
.xa-on .xa-av-pwr{fill:#38d9ff}
.xa-av-eq rect{fill:#38d9ff;opacity:.12;transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(.15)}
.xa-on .xa-av-eq rect{opacity:.9;animation:xa-eq .9s ease-in-out infinite alternate}
.xa-on .xa-av-eq rect:nth-child(2){animation-duration:.6s}
.xa-on .xa-av-eq rect:nth-child(3){animation-duration:.75s}
.xa-on .xa-av-eq rect:nth-child(4){animation-duration:.5s}
.xa-on .xa-av-eq rect:nth-child(5){animation-duration:.85s}
.xa-on .xa-av-eq rect:nth-child(6){animation-duration:.55s}
.xa-on .xa-av-eq rect:nth-child(7){animation-duration:.7s}
.xa-on .xa-av-eq rect:nth-child(8){animation-duration:.45s}
.xa-on .xa-av-eq rect:nth-child(9){animation-duration:.8s}
.xa-on .xa-av-eq rect:nth-child(10){animation-duration:.65s}
.xa-av-ring{opacity:0;transition:opacity .6s}
.xa-on .xa-av-ring{opacity:.8;animation:xa-glow 2.4s ease-in-out infinite}
.xa-av-knob{transform-box:view-box;transform-origin:99px 74px;transform:rotate(-135deg);transition:transform .8s ease}
.xa-on .xa-av-knob{transform:rotate(27deg)}
.xa-av-waves path{stroke:#38d9ff;stroke-width:1.6;opacity:0}
.xa-on .xa-av-waves path{animation:xa-fade 1.1s ease-out infinite}
.xa-on .xa-av-waves path:nth-child(2n){animation-delay:-.4s}
.xa-av-notes{opacity:0}
.xa-on .xa-av-notes{animation:xa-note 3.2s ease-in-out infinite}
/* beer tap ("on" = pouring) */
.xa-bt-flake{opacity:.25;transition:opacity .4s}
.xa-on .xa-bt-flake{opacity:.8}
.xa-bt-mist circle{fill:#bfe6ff;opacity:0}
.xa-on .xa-bt-mist circle{animation:xa-mist 3s ease-out infinite}
.xa-on .xa-bt-mist circle:nth-child(2){animation-delay:-1s}
.xa-on .xa-bt-mist circle:nth-child(3){animation-delay:-2s}
.xa-bt-keg{transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(.7)}
.xa-bt-handle{transform-box:view-box;transform-origin:65.5px 10px;transition:transform .5s cubic-bezier(.3,1.4,.5,1)}
.xa-on .xa-bt-handle{transform:rotate(32deg)}
.xa-bt-stream{fill:none;stroke:#f0b23a;stroke-width:2.6;stroke-linecap:round;opacity:0;transition:opacity .3s}
.xa-on .xa-bt-stream{opacity:.95}
.xa-bt-bubbles circle{opacity:0}
.xa-on .xa-bt-bubbles circle{animation:xa-bub 2.2s ease-in infinite}
.xa-on .xa-bt-bubbles circle:nth-child(2){animation-delay:-.6s}
.xa-on .xa-bt-bubbles circle:nth-child(3){animation-delay:-1.1s}
.xa-on .xa-bt-bubbles circle:nth-child(4){animation-delay:-1.6s}
.xa-bt-drops circle{opacity:.7}
/* desktop PC + laptop ("on" = screen on) */
.xa-pc-screen,.xa-lp-screen,.xa-lp-glow{opacity:0;transition:opacity .5s}
.xa-on .xa-pc-screen,.xa-on .xa-lp-screen,.xa-on .xa-lp-glow{opacity:1}
.xa-pc-fan{transform-box:fill-box;transform-origin:50% 50%}
.xa-on .xa-pc-fan{animation:xa-rot .7s linear infinite}
.xa-pc-rgb circle{stroke:#1d242b}
.xa-on .xa-pc-rgb{animation:xa-glow 2.4s ease-in-out infinite}
.xa-on .xa-pc-rgb circle{stroke:#ff3b6b}
.xa-on .xa-pc-rgb circle:nth-child(2){stroke:#3bff9a}
.xa-on .xa-pc-rgb circle:nth-child(3){stroke:#3b9cff}
.xa-pc-led,.xa-lp-led{fill:#5a636d}
.xa-on .xa-pc-led{fill:#38d9ff}
.xa-pc-mled,.xa-lp-cam{fill:#3a424b}
.xa-on .xa-pc-mled,.xa-on .xa-lp-cam,.xa-on .xa-lp-led{fill:#43e08a}
.xa-pc-code rect{transform-box:fill-box;transform-origin:0 50%}
.xa-on .xa-pc-code rect{animation:xa-type 4.4s ease-in-out infinite}
.xa-on .xa-pc-code rect:nth-child(2){animation-delay:-.5s}
.xa-on .xa-pc-code rect:nth-child(3){animation-delay:-1s}
.xa-on .xa-pc-code rect:nth-child(4){animation-delay:-1.5s}
.xa-on .xa-pc-code rect:nth-child(5){animation-delay:-2s}
.xa-pc-bars rect{transform-box:fill-box;transform-origin:50% 100%}
.xa-on .xa-pc-bars rect{animation:xa-bar 3.2s ease-in-out infinite alternate}
.xa-on .xa-pc-bars rect:nth-child(2){animation-delay:-.4s}
.xa-on .xa-pc-bars rect:nth-child(3){animation-delay:-.8s}
.xa-on .xa-pc-bars rect:nth-child(4){animation-delay:-1.2s}
.xa-pc-cursor{transform:translate(20px,30px)}
.xa-on .xa-pc-cursor{animation:xa-mouse 6s ease-in-out infinite}
.xa-on .xa-pc-keys rect{fill:#38d9ff;opacity:.5}
.xa-lp-line{transform-box:fill-box;transform-origin:0 50%}
.xa-on .xa-lp-line{animation:xa-type 5s ease-in-out infinite}
.xa-lp-dot{opacity:0}
.xa-on .xa-lp-dot{opacity:1;animation:xa-pulse 1.2s ease-in-out infinite}
.xa-on .xa-lp-keys{fill:#bfe9ff}
/* cooktop ("on" = the pot and the pan zones) */
.xa-hb-zglow,.xa-hb-coil{opacity:0;transition:opacity .8s}
.xa-on .xa-hb-z1 .xa-hb-zglow,.xa-on .xa-hb-z4 .xa-hb-zglow{opacity:.9;animation:xa-glow 2.2s ease-in-out infinite}
.xa-on .xa-hb-z1 .xa-hb-coil,.xa-on .xa-hb-z4 .xa-hb-coil{opacity:.8}
.xa-hb-zd{font:700 5.5px ui-monospace,Consolas,monospace;fill:#4a1d14}
.xa-on .xa-hb-zd1,.xa-on .xa-hb-zd4{fill:#ff4a1f}
.xa-hb-steam-pot path{fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;opacity:0}
.xa-on .xa-hb-steam-pot path{animation:xa-steam 2.6s ease-out infinite}
.xa-on .xa-hb-steam-pot path:nth-child(2){animation-delay:-.8s}
.xa-on .xa-hb-steam-pot path:nth-child(3){animation-delay:-1.6s}
.xa-hb-lid{transform-box:view-box;transform-origin:40px 80px}
.xa-on .xa-hb-lid{animation:xa-lid .5s steps(2) infinite}
.xa-hb-sizzle path{fill:none;stroke:#f2c94c;stroke-width:.8;stroke-linecap:round;opacity:0}
.xa-on .xa-hb-sizzle path{animation:xa-blink .5s steps(2) infinite}
/* pellet stove ("on" = heating) */
.xa-ps-fire{opacity:0;transition:opacity .8s}
.xa-on .xa-ps-fire{opacity:1}
.xa-ps-flame{transform-box:fill-box;transform-origin:50% 100%}
.xa-on .xa-ps-flame{animation:xa-flick .8s ease-in-out infinite alternate}
.xa-on .xa-ps-f2{animation-duration:.62s}
.xa-on .xa-ps-f3{animation-duration:.71s;animation-delay:-.3s}
.xa-on .xa-ps-f4{animation-duration:.5s}
.xa-on .xa-ps-f5{animation-duration:1.1s;animation-delay:-.5s}
.xa-ps-glow{opacity:0;transition:opacity 1s}
.xa-on .xa-ps-glow{opacity:1;animation:xa-glow 1.6s ease-in-out infinite}
.xa-ps-embers circle{fill:#ff8a2a;opacity:0}
.xa-on .xa-ps-embers circle{opacity:1;animation:xa-pulse 1.3s ease-in-out infinite}
.xa-on .xa-ps-embers circle:nth-child(2){animation-delay:-.4s}
.xa-on .xa-ps-embers circle:nth-child(4){animation-delay:-.8s}
.xa-ps-igniter{fill:#5a2a20}
.xa-ps-smoke-in path,.xa-ps-flue-smoke path{display:none}
.xa-ps-warm-air path,.xa-rd-rwaves path{fill:none;stroke:#ff8a3d;stroke-width:1.6;stroke-linecap:round;opacity:0}
.xa-on .xa-ps-warm-air path{animation:xa-steam 2s ease-out infinite}
.xa-on .xa-ps-warm-air path:nth-child(2),.xa-on .xa-rd-rwaves path:nth-child(2){animation-delay:-.5s}
.xa-on .xa-ps-warm-air path:nth-child(3),.xa-on .xa-rd-rwaves path:nth-child(3){animation-delay:-1s}
.xa-on .xa-ps-warm-air path:nth-child(4),.xa-on .xa-rd-rwaves path:nth-child(4){animation-delay:-1.5s}
.xa-ps-led,.xa-p3-led,.xa-rd-led{fill:#4a4f66}
.xa-on .xa-ps-l1,.xa-on .xa-rd-l1{fill:#ff8a3d}
.xa-on .xa-k-pellet-stove .xa-lcd,.xa-on .xa-k-radiator .xa-lcd{fill:#ff9a4a}
/* 3D printer ("on" = printing) */
.xa-p3-head{transform-box:view-box}
.xa-on .xa-p3-head{animation:xa-printx 1.1s ease-in-out infinite alternate}
.xa-p3-hfan{transform-box:view-box;transform-origin:60px 90px}
.xa-on .xa-p3-hfan{animation:xa-rot .25s linear infinite}
.xa-p3-spool{transform-box:view-box;transform-origin:97px 20px}
.xa-on .xa-p3-spool{animation:xa-rot 9s linear infinite}
.xa-p3-tip{fill:#8a6d1f}
.xa-on .xa-p3-tip{fill:#ffd27a}
.xa-p3-bedheat path{display:none}
.xa-on .xa-p3-l1{fill:#3ddc84}
/* radiator ("on" = heating) */
.xa-rd-rglow{opacity:0;transition:opacity 1.2s}
.xa-on .xa-rd-rglow{opacity:.35;animation:xa-glow 3s ease-in-out infinite}
.xa-rd-rwaves path{stroke-width:1.8}
.xa-on .xa-rd-rwaves path{animation:xa-steam 1.9s ease-out infinite}
.xa-rd-micon{fill:#c3c9cf;stroke:#c3c9cf}
.xa-rd-m-comfort circle{stroke:none}
.xa-on .xa-rd-m-comfort{fill:#ffb400;stroke:#ffb400}
.xa-rd-cold-air path{display:none}
/* server rack ("on" = online) */
.xa-rk-led{fill:#2d3640}
.xa-rk-fan{transform-box:fill-box;transform-origin:50% 50%}
.xa-on .xa-rk-fan{animation:xa-rot .66s linear infinite}
.xa-on .xa-rk-g{fill:#34d27a;animation:xa-rk 1.28s steps(1,end) infinite}
.xa-on .xa-rk-b{fill:#3b9cff;animation:xa-rk .94s steps(1,end) infinite}
.xa-on .xa-rk-r{fill:#ffb020}
.xa-rk-glow{opacity:0;transition:opacity .8s}
.xa-on .xa-rk-glow{opacity:1;animation:xa-glow 3s ease-in-out infinite}
.xa-rk-cables{opacity:.55}
.xa-on .xa-rk-cables{opacity:1}
.xa-on .xa-rk-flow .xa-chase circle{animation-duration:1.3s}
/* tool charger ("on" = charging) */
.xa-tc-led,.xa-tc-err{fill:#3a424b}
.xa-on .xa-tc-led{fill:#43e08a;animation:xa-pulse 1.2s ease-in-out infinite}
.xa-tc-g{fill:#2a3036}
.xa-on .xa-tc-g1,.xa-on .xa-tc-g2,.xa-on .xa-tc-g3{fill:#43e08a}
.xa-on .xa-tc-g3{animation:xa-pulse 1.2s ease-in-out infinite}
.xa-tc-bolt{fill:#43e08a;opacity:0;transition:opacity .4s}
.xa-on .xa-tc-bolt{opacity:1;animation:xa-pulse 1.6s ease-in-out infinite}
.xa-tc-glow{opacity:0;transition:opacity .8s}
.xa-on .xa-tc-glow{opacity:.9;animation:xa-glow 2.4s ease-in-out infinite}
/* towel dryer ("on" = heating) */
.xa-td-glow{opacity:0;transition:opacity .8s}
.xa-on .xa-td-glow{opacity:.85;animation:xa-glow 2.6s ease-in-out infinite}
.xa-on .xa-td-glow2{opacity:.4}
.xa-td-heat path{fill:none;stroke:#ff9a52;stroke-width:1.6;stroke-linecap:round;stroke-dasharray:2 7;opacity:0;transition:opacity .6s}
.xa-on .xa-td-heat path{opacity:.6;animation:xa-rise 1.8s linear infinite}
.xa-on .xa-td-heat path:nth-child(2){animation-duration:1.4s}
.xa-on .xa-td-heat path:nth-child(3){animation-duration:2.2s}
.xa-td-towel{transform-box:fill-box;transform-origin:50% 0}
.xa-on .xa-td-towel{animation:xa-skew 3.2s ease-in-out infinite}
.xa-on .xa-td-towel2{animation-duration:2.6s;animation-delay:-.4s}
.xa-td-steam path{fill:none;stroke:#e3e8ed;stroke-width:2;stroke-linecap:round;opacity:0}
.xa-on .xa-td-steam path{animation:xa-steam 2.6s ease-out infinite}
.xa-on .xa-td-steam path:nth-child(2){animation-delay:-.8s}
.xa-on .xa-td-steam path:nth-child(3){animation-delay:-1.6s}
.xa-td-led{fill:#5a636d}
.xa-on .xa-td-led{fill:#ff7a2e}
/* ventilation fan ("on" = running) */
.xa-vm-fanv{transform-box:view-box;transform-origin:60px 70px}
.xa-on .xa-vm-fanv{animation:xa-rot .5s linear infinite}
.xa-vm-intake path{fill:none;stroke:#8fb6d8;stroke-width:1.5;stroke-linecap:round;opacity:0;transform-box:view-box;transform-origin:60px 70px}
.xa-on .xa-vm-intake path{animation:xa-in 1.6s ease-in infinite}
.xa-on .xa-vm-intake path:nth-child(2){animation-delay:-.32s}
.xa-on .xa-vm-intake path:nth-child(3){animation-delay:-.64s}
.xa-on .xa-vm-intake path:nth-child(4){animation-delay:-.96s}
.xa-on .xa-vm-intake path:nth-child(5){animation-delay:-1.28s}
.xa-vm-steam path,.xa-vm-condensation path{display:none}
@keyframes xa-eq{from{transform:scaleY(.15)}to{transform:scaleY(.72)}}
@keyframes xa-fade{0%{opacity:0}30%{opacity:.85}100%{opacity:0}}
@keyframes xa-note{0%{opacity:0;transform:translateY(6px)}30%{opacity:.9}100%{opacity:0;transform:translateY(-10px)}}
@keyframes xa-bub{0%{opacity:0;transform:translateY(0)}20%{opacity:.9}100%{opacity:0;transform:translateY(-26px)}}
@keyframes xa-type{0%{transform:scaleX(.1)}30%,80%{transform:scaleX(1)}100%{transform:scaleX(.1)}}
@keyframes xa-bar{from{transform:scaleY(.35)}to{transform:scaleY(1)}}
@keyframes xa-mouse{0%,100%{transform:translate(20px,30px)}30%{transform:translate(52px,34px)}55%{transform:translate(60px,48px)}80%{transform:translate(28px,42px)}}
@keyframes xa-glow{50%{opacity:.6}}
@keyframes xa-lid{0%{transform:translateY(0) rotate(0)}100%{transform:translateY(-.8px) rotate(-1.5deg)}}
@keyframes xa-flick{0%{transform:scale(1,1) skewX(0)}35%{transform:scale(.94,1.08) skewX(3deg)}70%{transform:scale(1.04,.93) skewX(-2deg)}100%{transform:scale(.97,1.04) skewX(1.5deg)}}
@keyframes xa-printx{from{transform:translateX(-11px)}to{transform:translateX(11px)}}
@keyframes xa-rk{0%{opacity:1}20%{opacity:.25}35%{opacity:1}62%{opacity:.35}78%,100%{opacity:1}}
@keyframes xa-rise{from{transform:translateY(0)}to{transform:translateY(-9px)}}
@keyframes xa-skew{0%,100%{transform:skewX(0)}50%{transform:skewX(1.6deg)}}
@keyframes xa-in{0%{opacity:0;transform:scale(1.25)}30%{opacity:.85}100%{opacity:0;transform:scale(.45)}}
/* boom barrier ("on" = boom raised) */
.xa-br-arm{transform-box:fill-box;transform-origin:3.125% 50%;transition:transform 3s cubic-bezier(.45,0,.25,1)}
.xa-on .xa-br-arm{transform:rotate(-88deg)}
.xa-br-armled{fill:#ff4b3e}
.xa-on .xa-br-armled{fill:#58e06a}
/* swing gate ("on" = open, leaves swing inward from their hinges) */
.xa-sw-leaf{transform-box:fill-box;transition:transform 4s cubic-bezier(.45,0,.25,1)}
.xa-sw-l{transform-origin:0 50%}
.xa-sw-r{transform-origin:100% 50%}
.xa-on .xa-sw-leaf{transform:scaleX(.16)}
.xa-sw-shade{opacity:0;transition:opacity 4s}
.xa-on .xa-sw-shade{opacity:.45}
/* aquarium ("on" = light on, fish swim) */
.xa-aq-night{opacity:.55;transition:opacity 1.2s}
.xa-on .xa-aq-night{opacity:0}
.xa-aq-glow{opacity:0;transition:opacity 1s}
.xa-on .xa-aq-glow{opacity:.22}
.xa-aq-led{fill:#3b335f}
.xa-on .xa-aq-led{fill:#e8f6ff}
.xa-aq-plant{transform-box:view-box}
.xa-on .xa-aq-plant{animation:xa-aq-sway 5s ease-in-out infinite alternate}
.xa-aq-bub circle{opacity:0}
.xa-on .xa-aq-bub circle{animation:xa-aq-rise 4s linear infinite}
.xa-aq-fish{transform-box:view-box;transform-origin:0 0}
.xa-on .xa-aq-fish{animation:xa-aq-swim 16s linear infinite}
.xa-aq-tail{transform-box:view-box;transform-origin:2px 0}
.xa-on .xa-aq-tail{animation:xa-aq-wag .5s ease-in-out infinite alternate}
/* diesel heater ("on" = burning) */
.xa-dh-dsp{font-size:11px}
.xa-dh-flames{opacity:0;transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(.1);transition:opacity .5s,transform .5s}
.xa-on .xa-dh-flames{opacity:1;transform:none}
.xa-dh-fl,.xa-dh-cf{transform-box:fill-box;transform-origin:50% 100%}
.xa-on .xa-dh-fl{animation:xa-dh-flick .5s ease-in-out infinite alternate}
.xa-on .xa-dh-f2{animation-duration:.36s;animation-delay:-.12s}
.xa-on .xa-dh-f3{animation-duration:.27s;animation-delay:-.2s}
.xa-dh-crown{opacity:0;transition:opacity .5s}
.xa-on .xa-dh-crown{opacity:1}
.xa-on .xa-dh-cf{animation:xa-dh-crown .32s ease-in-out infinite alternate}
.xa-on .xa-dh-cf:nth-child(odd){animation-duration:.24s;animation-delay:-.1s}
.xa-dh-glow{opacity:0;transition:opacity .6s}
.xa-on .xa-dh-glow{animation:xa-dh-pulse 1.6s ease-in-out infinite alternate}
.xa-dh-puff{opacity:0;transform-box:fill-box;transform-origin:center}
.xa-on .xa-dh-puff{animation:xa-dh-rise 3.4s ease-out infinite}
.xa-on .xa-dh-puff:nth-child(2){animation-delay:-1.1s}
.xa-on .xa-dh-puff:nth-child(3){animation-delay:-2.2s}
.xa-dh-wave{opacity:0}
.xa-on .xa-dh-wave{animation:xa-dh-wave 2.4s ease-out infinite}
.xa-on .xa-dh-wave:nth-child(2){animation-delay:-.8s}
.xa-on .xa-dh-wave:nth-child(3){animation-delay:-1.6s}
.xa-dh-blades{transform-box:fill-box;transform-origin:center}
.xa-on .xa-dh-blades{animation:xa-rot .45s linear infinite}
/* gas boiler ("on" = burner lit) */
.xa-gb-dsp{font-size:15px}
.xa-gb-flame{transform-box:fill-box;transform-origin:50% 100%;opacity:0;transform:scaleY(.1);transition:opacity .5s,transform .5s}
.xa-on .xa-gb-flame{opacity:1;transform:none;animation:xa-gb-flick .45s ease-in-out infinite alternate}
.xa-on .xa-gb-flame:nth-child(odd){animation-duration:.33s;animation-delay:-.1s}
.xa-on .xa-gb-flame:nth-child(3n){animation-duration:.52s;animation-delay:-.2s}
.xa-gb-glow{opacity:0;transition:opacity .6s}
.xa-on .xa-gb-glow{animation:xa-dh-pulse 1.6s ease-in-out infinite alternate}
.xa-gb-puff{opacity:0;transform-box:fill-box;transform-origin:center}
.xa-on .xa-gb-puff{animation:xa-dh-rise 3.2s ease-out infinite}
.xa-on .xa-gb-puff:nth-child(2){animation-delay:-1.1s}
.xa-on .xa-gb-puff:nth-child(3){animation-delay:-2.1s}
/* hot tub ("on" = jets bubbling) */
.xa-jz-dsp{font-size:9px}
.xa-jz-dim{opacity:.35;transition:opacity 1s}
.xa-on .xa-jz-dim{opacity:0}
.xa-jz-leds{opacity:0;transition:opacity .6s}
.xa-on .xa-jz-leds{opacity:.5}
.xa-jz-bub circle{opacity:0;transform-box:fill-box;transform-origin:center}
.xa-on .xa-jz-bub circle{animation:xa-jz-bub 1.5s ease-out infinite}
.xa-on .xa-jz-bub circle:nth-child(3n){animation-duration:2.6s}
.xa-jz-fall{opacity:0;transition:opacity .5s}
.xa-on .xa-jz-fall{opacity:.45}
.xa-jz-rip{opacity:0;transform-box:fill-box;transform-origin:center}
.xa-on .xa-jz-rip{animation:xa-jz-rip 1.8s ease-out infinite}
.xa-on .xa-jz-rip:nth-child(2){animation-delay:-.9s}
.xa-jz-steam{opacity:0;transform-box:fill-box;transform-origin:center}
.xa-on .xa-jz-steam{animation:xa-jz-steam 3.6s ease-out infinite}
.xa-on .xa-jz-steam:nth-child(2){animation-delay:-.9s}
.xa-on .xa-jz-steam:nth-child(3){animation-delay:-1.8s}
.xa-on .xa-jz-steam:nth-child(4){animation-delay:-2.7s}
@keyframes xa-aq-sway{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}
@keyframes xa-aq-rise{0%{opacity:.9;transform:translateY(0)}100%{opacity:0;transform:translateY(-105px)}}
@keyframes xa-aq-swim{0%{transform:translateX(0) scaleX(1)}24.9%{transform:translateX(60px) scaleX(1)}25%{transform:translateX(94px) scaleX(-1)}74.9%{transform:translateX(-26px) scaleX(-1)}75%{transform:translateX(-60px) scaleX(1)}100%{transform:translateX(0) scaleX(1)}}
@keyframes xa-aq-wag{from{transform:scaleY(.7)}to{transform:scaleY(1.2)}}
@keyframes xa-dh-flick{0%{transform:scale(1,1)}100%{transform:scale(.9,.86) translate(1px,0)}}
@keyframes xa-dh-crown{0%{transform:scaleY(1)}100%{transform:scaleY(.72)}}
@keyframes xa-dh-pulse{from{opacity:.85}to{opacity:.5}}
@keyframes xa-dh-rise{0%{opacity:0;transform:translate(0,8px) scale(.5)}20%{opacity:.6}100%{opacity:0;transform:translate(9px,-34px) scale(1.9)}}
@keyframes xa-dh-wave{0%{opacity:0;transform:translateY(4px)}30%{opacity:.5}100%{opacity:0;transform:translateY(-16px)}}
@keyframes xa-gb-flick{0%{transform:scaleY(1)}100%{transform:scaleY(.72) scaleX(1.12)}}
@keyframes xa-jz-bub{0%{opacity:0;transform:scale(.3)}25%{opacity:.85}100%{opacity:0;transform:scale(1.5)}}
@keyframes xa-jz-rip{0%{opacity:.7;transform:scale(.4)}100%{opacity:0;transform:scale(1.6)}}
@keyframes xa-jz-steam{0%{opacity:0;transform:translate(0,6px) scale(.5)}25%{opacity:.4}100%{opacity:0;transform:translate(6px,-34px) scale(2)}}
/* batch 3 g2: colour bulb, filament bulb, pendant cluster, chandelier, garden spotlight, christmas tree, power meter */
.xa-cb-lit,.xa-fb-lit,.xa-pcl-lit,.xa-chd-lit,.xa-gs-lit,.xa-xt-lit{opacity:0;transition:opacity .7s}
.xa-on .xa-cb-lit,.xa-on .xa-fb-lit,.xa-on .xa-pcl-lit,.xa-on .xa-chd-lit,.xa-on .xa-gs-lit,.xa-on .xa-xt-lit{opacity:var(--k,1)}
.xa-cb-halo,.xa-fb-halo,.xa-pcl-halo,.xa-chd-halo,.xa-gs-halo,.xa-xt-halo{transform-box:fill-box;transform-origin:center}
.xa-cb-c{opacity:0}
.xa-cb-c:first-child{opacity:1}
.xa-on .xa-cb-c{animation:xa-cb-x 9s ease-in-out infinite}
.xa-on .xa-cb-halo{animation:xa-breath 4s ease-in-out infinite}
.xa-on .xa-fb-halo,.xa-on .xa-pcl-halo,.xa-on .xa-gs-halo,.xa-on .xa-xt-halo{animation:xa-breath 4s ease-in-out infinite}
.xa-fb-wire,.xa-pcl-wire{fill:none;stroke:#8a8f96;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
.xa-on .xa-fb-wire,.xa-on .xa-pcl-wire{stroke:#ffe9b0}
.xa-on .xa-fb-flk{animation:xa-fb-flk 2.3s ease-in-out infinite}
.xa-on .xa-fb-flk+.xa-fb-flk{animation-delay:-.8s}
.xa-pcl-sw{transform-box:fill-box;transform-origin:50% 0}
.xa-on .xa-pcl-sw{animation:xa-sway 6s ease-in-out infinite}
.xa-on .xa-chd-halo{animation:xa-chd-glow 2.6s ease-in-out infinite}
.xa-chd-flame{transform-box:fill-box;transform-origin:50% 100%}
.xa-on .xa-chd-flame{animation:xa-flick .9s ease-in-out infinite alternate}
.xa-chd-sp{opacity:0}
.xa-on .xa-chd-sp{animation:xa-chd-sp 2.6s ease-in-out infinite}
.xa-on .xa-chd-sp:nth-child(2){animation-delay:-.5s}
.xa-on .xa-chd-sp:nth-child(3){animation-delay:-1.1s}
.xa-on .xa-chd-sp:nth-child(4){animation-delay:-1.7s}
.xa-on .xa-chd-sp:nth-child(5){animation-delay:-2.2s}
.xa-on .xa-gs-beam{animation:xa-gs-beam 3.5s ease-in-out infinite}
.xa-gs-motes circle{opacity:0}
.xa-on .xa-gs-motes circle{animation:xa-mote 5s linear infinite}
.xa-on .xa-gs-motes circle:nth-child(2){animation-delay:-1.2s}
.xa-on .xa-gs-motes circle:nth-child(3){animation-delay:-2.6s}
.xa-on .xa-gs-motes circle:nth-child(4){animation-delay:-3.8s}
.xa-xt-b{opacity:.35;transition:opacity .4s}
.xa-on .xa-xt-b{opacity:1;animation:xa-xt-tw 2.4s steps(1) infinite}
.xa-xt-rays{transform-box:fill-box;transform-origin:center}
.xa-on .xa-xt-rays{animation:xa-rot 10s linear infinite}
.xa-pm-led1{fill:#4a2626}
.xa-pm-led2{fill:#4a3a20}
.xa-on .xa-pm-led1{fill:#ff3b30;animation:xa-pm-bl 1.1s ease-out infinite}
.xa-on .xa-pm-led2{fill:#ffb300}
.xa-pm-halo{opacity:0}
.xa-on .xa-pm-halo{animation:xa-pm-bl 1.1s ease-out infinite}
@keyframes xa-cb-x{0%,100%{opacity:0}10%,33%{opacity:1}43%{opacity:0}}
@keyframes xa-fb-flk{0%,100%{opacity:1}40%{opacity:.82}55%{opacity:.95}70%{opacity:.78}}
@keyframes xa-chd-glow{0%,100%{opacity:var(--k,1);transform:scale(1)}50%{opacity:.6;transform:scale(1.08)}}
@keyframes xa-chd-sp{0%,70%,100%{opacity:0}80%{opacity:1}}
@keyframes xa-gs-beam{0%,100%{opacity:.55}50%{opacity:.38}}
@keyframes xa-xt-tw{0%{opacity:1}50%{opacity:.4}}
@keyframes xa-pm-bl{0%,12%{opacity:1}40%,100%{opacity:.15}}
/* pellet boiler */
.xa-pb-fl{transform-box:fill-box;transform-origin:50% 100%;opacity:0;transition:opacity .8s}
.xa-on .xa-pb-fl{opacity:1;animation:xa-pb-flick .35s ease-in-out infinite alternate}
.xa-on .xa-pb-f2{animation-delay:-.12s}
.xa-on .xa-pb-f3{animation-delay:-.23s}
.xa-pb-glow{opacity:0;transition:opacity .8s}
.xa-on .xa-pb-glow{opacity:.55;animation:xa-pb-br 1.6s ease-in-out infinite}
.xa-on .xa-pb-pile{animation:xa-pb-jig .9s ease-in-out infinite alternate}
.xa-pb-heat path{fill:none;stroke:#ffb36b;stroke-width:1.6;stroke-linecap:round;opacity:0}
.xa-on .xa-pb-heat path{animation:xa-pb-rise 2.4s ease-in infinite}
.xa-on .xa-pb-heat path:nth-child(2){animation-delay:-.8s}
.xa-on .xa-pb-heat path:nth-child(3){animation-delay:-1.6s}
@keyframes xa-pb-flick{from{transform:scaleY(.82) scaleX(1.05)}to{transform:scaleY(1.12) scaleX(.94)}}
@keyframes xa-pb-br{0%,100%{opacity:.55}50%{opacity:.2}}
@keyframes xa-pb-jig{to{transform:translateY(.8px)}}
@keyframes xa-pb-rise{0%{opacity:0;transform:translateY(0)}30%{opacity:.7}100%{opacity:0;transform:translateY(-22px)}}
/* pool robot */
.xa-on .xa-pr-wave{animation:xa-pr-wave 5s linear infinite}
.xa-on .xa-pr-wb{animation-duration:3.4s;animation-direction:reverse}
.xa-pr-caus path{opacity:.15}
.xa-on .xa-pr-caus path{animation:xa-pr-caus 3s ease-in-out infinite alternate}
.xa-on .xa-pr-caus path:nth-child(2){animation-delay:-1.5s}
.xa-pr-flip{transform-box:view-box;transform-origin:72px 150px}
.xa-on .xa-pr-drive{animation:xa-pr-drive 14s ease-in-out infinite}
.xa-on .xa-pr-flip{animation:xa-pr-flip 14s linear infinite}
.xa-pr-brush{transform-box:fill-box;transform-origin:center}
.xa-on .xa-pr-brush{animation:xa-pr-spin .35s linear infinite}
.xa-pr-bub circle{opacity:0}
.xa-on .xa-pr-bub circle{animation:xa-pr-bub 2.2s ease-in infinite}
.xa-on .xa-pr-bub circle:nth-child(2){animation-delay:-.7s}
.xa-on .xa-pr-bub circle:nth-child(3){animation-delay:-1.4s}
.xa-on .xa-pr-bub circle:nth-child(4){animation-delay:-1.9s}
.xa-pr-deb>*{opacity:0}
.xa-on .xa-pr-deb>*{animation:xa-pr-deb 1.1s ease-in infinite}
.xa-on .xa-pr-deb>*:nth-child(2){animation-delay:-.4s}
.xa-on .xa-pr-deb>*:nth-child(3){animation-delay:-.8s}
@keyframes xa-pr-wave{to{transform:translateX(-32px)}}
@keyframes xa-pr-caus{to{opacity:.4}}
@keyframes xa-pr-drive{0%,4%{transform:translateX(0)}46%,54%{transform:translateX(136px)}96%,100%{transform:translateX(0)}}
@keyframes xa-pr-flip{0%,49.9%{transform:scaleX(1)}50%,99.9%{transform:scaleX(-1)}}
@keyframes xa-pr-spin{to{transform:rotate(-1turn)}}
@keyframes xa-pr-bub{0%{opacity:0;transform:translateY(0)}15%{opacity:.8}100%{opacity:0;transform:translateY(-70px)}}
@keyframes xa-pr-deb{0%{opacity:0;transform:translate(0,0)}20%{opacity:.9}100%{opacity:0;transform:translate(-14px,-2px) scale(.4)}}
/* water pump */
.xa-on .xa-wp-wave{animation:xa-wp-wave 1.4s linear infinite}
.xa-on .xa-wp-wb{animation-duration:.9s}
.xa-wp-jet{opacity:0;transition:opacity .5s}
.xa-on .xa-wp-jet{opacity:.9}
.xa-wp-rip ellipse{opacity:0;transform-box:fill-box;transform-origin:center}
.xa-on .xa-wp-rip ellipse{animation:xa-wp-rip 1.2s ease-out infinite}
.xa-on .xa-wp-rip ellipse:nth-child(2){animation-delay:-.6s}
@keyframes xa-wp-wave{to{transform:translateX(-24px)}}
@keyframes xa-wp-rip{0%{opacity:.8;transform:scale(.3)}100%{opacity:0;transform:scale(1.6)}}
/* industrial pump */
.xa-on .xa-ip-rig{animation:xa-ip-vib .12s linear infinite}
.xa-ip-glow{opacity:0;transition:opacity .6s}
.xa-on .xa-ip-glow{opacity:.55;animation:xa-ip-glow .5s ease-in-out infinite}
.xa-ip-ring circle{opacity:0;transform-box:fill-box;transform-origin:center}
.xa-on .xa-ip-ring circle{animation:xa-ip-ring .9s ease-out infinite}
.xa-on .xa-ip-ring circle:nth-child(2){animation-delay:-.45s}
.xa-ip-ndl{transform-box:fill-box;transform-origin:50% 100%}
.xa-on .xa-ip-ndl{animation:xa-ip-jit .18s ease-in-out infinite alternate}
@keyframes xa-ip-vib{25%{transform:translate(.4px,-.3px)}75%{transform:translate(-.4px,.3px)}}
@keyframes xa-ip-glow{0%,100%{opacity:.55}50%{opacity:.15}}
@keyframes xa-ip-ring{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(1.8)}}
@keyframes xa-ip-jit{to{transform:rotate(4deg)}}
/* robot mower */
.xa-on .xa-rm-body{animation:xa-rm-bnc .35s ease-in-out infinite alternate}
.xa-rm-spin{transform-box:fill-box;transform-origin:center}
.xa-on .xa-rm-spin{animation:xa-rm-spin .6s linear infinite}
.xa-rm-blade{opacity:.35}
.xa-on .xa-rm-blade{opacity:.9;animation:xa-rm-bl .15s linear infinite}
.xa-rm-clip path{opacity:0;transform-box:fill-box;transform-origin:center}
.xa-on .xa-rm-clip path{animation:xa-rm-fly .8s ease-out infinite}
.xa-rm-speed path{opacity:0}
.xa-on .xa-rm-speed path{animation:xa-rm-streak .7s linear infinite}
.xa-on .xa-rm-speed path:nth-child(2){animation-delay:-.2s}
.xa-on .xa-rm-speed path:nth-child(3){animation-delay:-.45s}
@keyframes xa-rm-bnc{to{transform:translateY(-.6px)}}
@keyframes xa-rm-spin{to{transform:rotate(-1turn)}}
@keyframes xa-rm-bl{0%,100%{opacity:.9}50%{opacity:.45}}
@keyframes xa-rm-fly{0%{opacity:0;transform:translate(0,0)}25%{opacity:1}100%{opacity:0;transform:translate(14px,-10px) rotate(160deg)}}
@keyframes xa-rm-streak{0%{opacity:0;transform:translateX(0)}30%{opacity:.6}100%{opacity:0;transform:translateX(14px)}}
/* sauna */
.xa-sa-glow{opacity:0;transition:opacity 1.5s}
.xa-on .xa-sa-glow{opacity:.9}
.xa-sa-bulb{opacity:0;transition:opacity .6s}
.xa-on .xa-sa-bulb{opacity:.6}
.xa-sa-stones{fill:#5e5a57}
.xa-on .xa-sa-stones{fill:#7a4a3a}
.xa-sa-emb circle{opacity:0;transform-box:fill-box;transform-origin:center}
.xa-on .xa-sa-emb circle{animation:xa-sa-emb 1.6s ease-in-out infinite alternate}
.xa-on .xa-sa-emb circle:nth-child(2n){animation-delay:-.7s}
.xa-on .xa-sa-emb circle:nth-child(3n){animation-delay:-1.1s}
.xa-sa-wave path{fill:none;stroke:#ffd9a0;stroke-width:1.4;stroke-linecap:round;opacity:0}
.xa-on .xa-sa-wave path{animation:xa-sa-wave 2.4s ease-in infinite}
.xa-on .xa-sa-wave path:nth-child(2){animation-delay:-.8s}
.xa-on .xa-sa-wave path:nth-child(3){animation-delay:-1.6s}
.xa-sa-stm ellipse{opacity:0;transform-box:fill-box;transform-origin:center}
.xa-on .xa-sa-stm ellipse{animation:xa-sa-stm 3.2s ease-out infinite}
.xa-on .xa-sa-stm ellipse:nth-child(2){animation-delay:-.8s}
.xa-on .xa-sa-stm ellipse:nth-child(3){animation-delay:-1.6s}
.xa-on .xa-sa-stm ellipse:nth-child(4){animation-delay:-2.4s}
.xa-sa-therm{transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(.22);transition:transform 2s ease-out}
.xa-on .xa-sa-therm{transform:scaleY(.85)}
@keyframes xa-sa-emb{from{opacity:1}to{opacity:.25}}
@keyframes xa-sa-wave{0%{opacity:0;transform:translateY(0)}30%{opacity:.75}100%{opacity:0;transform:translateY(-34px)}}
@keyframes xa-sa-stm{0%{opacity:0;transform:translate(0,4px) scale(.4)}25%{opacity:.4}100%{opacity:0;transform:translate(10px,-34px) scale(2)}}
.xa-rs-tab{transition:transform 3s cubic-bezier(.45,0,.25,1)}
.xa-on .xa-rs-tab{transform:translateY(-110px)}
.xa-wc{--p:0;--q:clamp(0,var(--pos,var(--p)),1)}
.xa-on .xa-wc{--p:1}
.xa-vn-sl{transform-box:fill-box;transform-origin:center;transition:transform 2.6s cubic-bezier(.45,0,.25,1)}
.xa-vn-lift .xa-vn-sl{transform:translateY(calc(var(--q) * var(--i) * -5.6px))}
.xa-vn-tilt .xa-vn-sl{transform:scaleY(calc(1 - .84 * var(--q)));transition-duration:1.4s}
.xa-vn-rail{transition:transform 2.6s cubic-bezier(.45,0,.25,1)}
.xa-vn-lift .xa-vn-rail{transform:translateY(calc(var(--q) * -75px))}
.xa-vn-cord{transform-box:fill-box;transform-origin:50% 0;transition:transform 2.6s cubic-bezier(.45,0,.25,1)}
.xa-vn-lift .xa-vn-cord{transform:scaleY(calc(1 - .74 * var(--q)))}
.xa-dr-c{transform-box:fill-box;transform:scaleX(calc(1 - .76 * var(--q)));transition:transform 3s cubic-bezier(.45,0,.25,1)}
.xa-dr-l{transform-origin:0 50%}
.xa-dr-r{transform-origin:100% 50%}
.xa-ss-leaf{transform-box:fill-box;transition:transform 3s cubic-bezier(.45,0,.25,1)}
.xa-ss-l{transform-origin:0 50%}
.xa-ss-r{transform-origin:100% 50%}
.xa-on .xa-ss-leaf{transform:scaleX(-.92)}
.xa-ss-sh{opacity:0;transition:opacity 3s}
.xa-on .xa-ss-sh{opacity:.35}
.xa-uf-big{font-size:8px}
.xa-uf-pipe{fill:none;stroke:#6f767e;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
.xa-on .xa-uf-pipe{stroke:#d9483b}
.xa-uf-glow{opacity:0;transition:opacity 1.5s}
.xa-on .xa-uf-glow{opacity:.75}
.xa-uf-waves path{fill:none;stroke:#ff8a3d;stroke-width:1.6;stroke-linecap:round;opacity:0}
.xa-on .xa-uf-waves path{animation:xa-uf-wave 3s ease-in infinite}
.xa-on .xa-uf-waves path:nth-child(2){animation-delay:-.6s}
.xa-on .xa-uf-waves path:nth-child(3){animation-delay:-1.2s}
.xa-on .xa-uf-waves path:nth-child(4){animation-delay:-1.8s}
.xa-on .xa-uf-waves path:nth-child(5){animation-delay:-2.4s}
.xa-ups-big{font-size:9px}
.xa-on .xa-ups-g{fill:#7dff9a}
.xa-on .xa-ups-ld{fill:#43a047}
.xa-on .xa-ups-bat{fill:#43a047;animation:xa-pulse 1.6s ease-in-out infinite}
.xa-ups-bolt{opacity:.35;transition:opacity .4s}
.xa-on .xa-ups-bolt{opacity:1}
.xa-ups-dl{fill:#4a4f56}
.xa-on .xa-ups-dl{fill:#3ddc5a;animation:xa-blink 1.4s steps(2) infinite}
.xa-on .xa-ups-dl:nth-of-type(2n){animation-delay:-.5s}
.xa-whp-big{font-size:12px}
.xa-whp-glow{opacity:0;transition:opacity 1.5s}
.xa-on .xa-whp-glow{opacity:.45}
.xa-whp-heat path{stroke:#ffb27a}
.xa-whp-comp{transform-box:fill-box;transform-origin:50% 100%}
.xa-on .xa-whp-comp{animation:xa-whp-vib .11s linear infinite alternate}
@keyframes xa-uf-wave{0%{opacity:0;transform:translateY(6px)}30%{opacity:.8}100%{opacity:0;transform:translateY(-40px)}}
@keyframes xa-whp-vib{0%{transform:translate(-.5px,0)}100%{transform:translate(.5px,-.4px)}}
.xa-kt-glow,.xa-kt-ring,.xa-kt-blue{opacity:0;transition:opacity .5s}
.xa-on .xa-kt-ring{opacity:1}
.xa-on .xa-kt-blue{opacity:.8}
.xa-on .xa-kt-glow{opacity:.55;animation:xa-kt-glow 2.4s ease-in-out infinite}
.xa-kt-led{fill:#8f98a2}
.xa-on .xa-kt-led{fill:#ff7043}
.xa-kt-bub{fill:#fff;opacity:0}
.xa-on .xa-kt-bub{animation:xa-kt-rise 1.5s linear infinite}
.xa-on .xa-kt-b2{animation-delay:-.55s}
.xa-on .xa-kt-b3{animation-delay:-1.1s}
.xa-kt-steam{stroke:#d9d4ec;stroke-width:2.2;opacity:0;transform-box:fill-box;transform-origin:50% 100%}
.xa-on .xa-kt-steam{animation:xa-kt-steam 2.4s ease-out infinite}
.xa-on .xa-kt-s2{animation-delay:-1.1s}
.xa-mc-ring{stroke:#5a6170}
.xa-mc-rim{stroke:#6b7385}
.xa-on .xa-mc-ring,.xa-on .xa-mc-rim{stroke:#ff7043}
.xa-mc-hglow{opacity:0;transition:opacity .5s}
.xa-on .xa-mc-hglow{opacity:.8;animation:xa-glow 2.2s ease-in-out infinite}
.xa-mc-blade{transform-box:fill-box;transform-origin:50% 50%}
.xa-on .xa-mc-blade{animation:xa-mc-spin 2.6s linear infinite}
.xa-mc-steam{stroke:#d9d4ec;stroke-width:2.2;opacity:0;transform-box:fill-box;transform-origin:50% 100%}
.xa-on .xa-mc-steam{animation:xa-mc-vap 2.4s ease-in-out infinite}
.xa-on .xa-mc-v2{animation-delay:-1.2s}
.xa-rc-led{fill:#5d6570}
.xa-on .xa-rc-cook{fill:#ff5252}
.xa-rc-glow{opacity:0;transition:opacity .5s}
.xa-on .xa-rc-glow{opacity:.9;animation:xa-glow 2.4s ease-in-out infinite}
.xa-rc-key{fill:#4a5158}
.xa-on .xa-rc-key{fill:#ff7043}
.xa-rc-steam{stroke:#d9d4ec;stroke-width:2.2;opacity:0;transform-box:fill-box;transform-origin:50% 100%}
.xa-on .xa-rc-steam{animation:xa-rc-puff 2.3s ease-in-out infinite}
.xa-on .xa-rc-w2{animation-delay:-1.15s}
.xa-ts-hot,.xa-ts-halo{opacity:0;transition:opacity .6s}
.xa-on .xa-ts-hot{opacity:1;animation:xa-ts-glow 1.6s ease-in-out infinite}
.xa-on .xa-ts-halo{opacity:.8;animation:xa-ts-glow 1.6s ease-in-out infinite}
.xa-ts-lever{transition:transform .5s ease}
.xa-on .xa-ts-lever{transform:translateY(23px)}
.xa-ts-led{fill:#5a6170}
.xa-on .xa-ts-led{fill:#ff7043}
.xa-ts-air path{opacity:0}
.xa-on .xa-ts-air path{animation:xa-ts-shim 1.8s ease-out infinite}
.xa-on .xa-ts-air path:nth-child(2){animation-delay:-.6s}
.xa-on .xa-ts-air path:nth-child(3){animation-delay:-1.2s}
.xa-ir-plate,.xa-ir-glow{opacity:0;transition:opacity .6s}
.xa-on .xa-ir-plate{opacity:1}
.xa-on .xa-ir-glow{opacity:.7;animation:xa-glow 2s ease-in-out infinite}
.xa-ir-led{fill:#7d8590}
.xa-on .xa-ir-led{fill:#ff7043}
.xa-ir-steam{opacity:0;transform-box:fill-box;transform-origin:50% 50%}
.xa-on .xa-ir-steam{animation:xa-ir-puff 2.6s ease-out infinite}
.xa-on .xa-ir-s2{animation-delay:-.65s}
.xa-on .xa-ir-s3{animation-delay:-1.3s}
.xa-on .xa-ir-s4{animation-delay:-1.95s}
.xa-hdr-led{fill:#7d8590}
.xa-on .xa-hdr-led{fill:#ff8a3d}
.xa-hdr-heat{opacity:0;transition:opacity .5s}
.xa-on .xa-hdr-heat{opacity:1;animation:xa-hdr-glow 1.4s ease-in-out infinite alternate}
.xa-hdr-fan{transform-box:fill-box;transform-origin:50% 50%}
.xa-on .xa-hdr-fan{animation:xa-rot .45s linear infinite}
.xa-pf-kib{opacity:0;transform-box:fill-box;transform-origin:50% 50%}
.xa-on .xa-pf-kib{animation:xa-pf-fall .8s linear infinite}
.xa-on .xa-pf-k2{animation-delay:-.27s}
.xa-on .xa-pf-k3{animation-delay:-.54s}
.xa-on .xa-pf-scr{fill:#1e88e5}
.xa-on .xa-pf-t{fill:#fff}
.xa-pw-jet{opacity:0;transition:opacity .5s}
.xa-on .xa-pw-jet{opacity:1}
.xa-on .xa-pw-flat{opacity:0}
.xa-pw-rip,.xa-pw-sp{opacity:0;transform-box:fill-box;transform-origin:50% 50%}
.xa-on .xa-pw-rip{animation:xa-pw-rip 1.6s ease-out infinite}
.xa-on .xa-pw-r2{animation-delay:-.8s}
.xa-on .xa-pw-sp{animation:xa-pw-spl .9s ease-out infinite}
.xa-on .xa-pw-r{animation-delay:-.45s}
.xa-pw-led{fill:#5a6170}
.xa-on .xa-pw-led{fill:#29b6f6}
@keyframes xa-kt-glow{50%{opacity:.9}}
@keyframes xa-kt-rise{0%{transform:translateY(0);opacity:0}20%{opacity:.95}100%{transform:translateY(-14px);opacity:0}}
@keyframes xa-kt-steam{0%{transform:translate(0,5px) scale(.7);opacity:0}30%{opacity:.9}100%{transform:translate(-2px,-9px) scale(1.15);opacity:0}}
@keyframes xa-mc-spin{0%{transform:rotate(0)}68%,100%{transform:rotate(360deg)}}
@keyframes xa-mc-vap{0%{transform:translate(0,6px) scale(.7);opacity:0}40%{opacity:.85}100%{transform:translate(-2px,-6px) scale(1.15);opacity:0}}
@keyframes xa-rc-puff{0%{transform:translate(0,7px) scale(.6);opacity:0}40%{opacity:.9}100%{transform:translate(-2px,-9px) scale(1.25);opacity:0}}
@keyframes xa-ts-glow{50%{opacity:.6}}
@keyframes xa-ts-shim{0%{transform:translateY(6px);opacity:0}35%{opacity:.75}100%{transform:translateY(-6px);opacity:0}}
@keyframes xa-ir-puff{0%{transform:translate(0,10px) scale(.45);opacity:0}20%{opacity:.95}70%{opacity:.7}100%{transform:translate(-7px,-34px) scale(1.35);opacity:0}}
@keyframes xa-hdr-glow{from{opacity:.55}to{opacity:1}}
@keyframes xa-pf-fall{0%{opacity:0;transform:translateY(0) rotate(0)}15%{opacity:1}85%{opacity:1}100%{opacity:0;transform:translateY(13px) rotate(160deg)}}
@keyframes xa-pw-rip{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(3.2)}}
@keyframes xa-pw-spl{0%{opacity:.9;transform:scale(.4)}100%{opacity:0;transform:scale(1.6)}}
/* dehumidifier */
.xa-dhm-water{transform-box:fill-box;transform-origin:50% 100%}
.xa-on .xa-dhm-water{animation:xa-dhm-fill 6s ease-in-out infinite}
.xa-on .xa-dhm-surf{animation:xa-pulse 2s ease-in-out infinite}
.xa-dhm-drip ellipse{opacity:0}
.xa-on .xa-dhm-drip ellipse{animation:xa-dhm-drip 1.3s ease-in infinite}
.xa-on .xa-dhm-drip ellipse:nth-child(2){animation-delay:-.65s}
@keyframes xa-dhm-drip{0%{opacity:0;transform:translateY(0)}15%{opacity:1}90%{opacity:1}100%{opacity:0;transform:translateY(15px)}}
@keyframes xa-dhm-fill{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.18)}}
/* space heater */
.xa-sh-glow,.xa-sh-halo{opacity:0;transition:opacity .8s}
.xa-on .xa-sh-glow{opacity:1;animation:xa-sh-glow 2.4s ease-in-out infinite}
.xa-on .xa-sh-halo{opacity:1;animation:xa-sh-glow 2.4s ease-in-out infinite}
.xa-sh-fan{transform-box:fill-box;transform-origin:center}
.xa-on .xa-sh-fan{animation:xa-rot .5s linear infinite}
@keyframes xa-sh-glow{0%,100%{opacity:.75}50%{opacity:1}}
/* monitor */
.xa-mon-pic{opacity:0;transition:opacity .4s}
.xa-on .xa-mon-pic{opacity:1}
.xa-on .xa-mon-mv{animation:xa-mon-drag 4s ease-in-out infinite alternate}
.xa-on .xa-mon-cur{animation:xa-blink 1s steps(1) infinite}
.xa-mon-led{fill:#3a3f46}
.xa-on .xa-mon-led{fill:#90caf9}
@keyframes xa-mon-drag{to{transform:translate(-5.6px,-1.3px)}}
/* router */
.xa-nw-wave path{fill:none;stroke:#4fc3f7;stroke-width:2;stroke-linecap:round;opacity:0}
.xa-on .xa-nw-wave path{animation:xa-nw-wave 2.4s ease-out infinite}
.xa-on .xa-nw-wave path:nth-child(1){animation-delay:-.6s}
.xa-on .xa-nw-wave path:nth-child(2){animation-delay:-.3s}
.xa-nw-led{fill:#3d434a}
.xa-on .xa-nw-g,.xa-on .xa-nw-lan{fill:#2ecc71}
.xa-on .xa-nw-b{fill:#4fc3f7}
.xa-on .xa-nw-lan{animation:xa-nw-flick 2.4s infinite}
@keyframes xa-nw-wave{0%{opacity:0}30%{opacity:.9}100%{opacity:0}}
@keyframes xa-nw-flick{0%,100%{opacity:1}30%{opacity:.1}55%{opacity:1}70%{opacity:.2}}
/* scale */
.xa-scl-lcd{font:700 11px system-ui,"Segoe UI",Roboto,Arial,sans-serif;letter-spacing:-.2px;text-anchor:middle;fill:#2c3a4c}
.xa-scl-unit{font:600 6px system-ui,"Segoe UI",Roboto,Arial,sans-serif;text-anchor:end;fill:#2c3a4c}
.xa-on .xa-scl-lcd,.xa-on .xa-scl-unit{fill:#7fe3ff}
.xa-scl-pad,.xa-scl-disp{opacity:0;transition:opacity .6s}
.xa-on .xa-scl-pad,.xa-on .xa-scl-disp{opacity:1;animation:xa-scl-glow 2.4s ease-in-out infinite}
.xa-on .xa-scl-val{animation:xa-scl-glow 2.4s ease-in-out infinite}
@keyframes xa-scl-glow{0%,100%{opacity:1}50%{opacity:.7}}
/* security camera */
.xa-cam-led{fill:#9aa3ad}
.xa-on .xa-cam-led{fill:#f44336;animation:xa-cam-blink 1s steps(1) infinite}
.xa-cam-rec{opacity:0;transition:opacity .4s}
.xa-on .xa-cam-rec{opacity:1}
.xa-on .xa-cam-rec circle{animation:xa-cam-blink 1s steps(1) infinite}
.xa-cam-glow{opacity:0}
.xa-on .xa-cam-glow{animation:xa-cam-breathe 2s ease-in-out infinite}
.xa-on .xa-cam-glint{animation:xa-cam-glint 3s ease-in-out infinite}
.xa-on .xa-cam-face{animation:xa-cam-pan 8s ease-in-out infinite}
@keyframes xa-cam-blink{50%{opacity:.15}}
@keyframes xa-cam-breathe{0%,100%{opacity:.3}50%{opacity:.9}}
@keyframes xa-cam-glint{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes xa-cam-pan{0%,100%{transform:translateX(0)}25%{transform:translateX(-3.5px)}75%{transform:translateX(3.5px)}}
/* aroma diffuser */
.xa-df2-halo{opacity:0;transition:opacity .8s}
.xa-on .xa-df2-halo{opacity:1;animation:xa-df2-breathe 3s ease-in-out infinite}
.xa-df2-band{fill:#e9e4d8}
.xa-on .xa-df2-band{fill:#ffd180}
.xa-df2-puffs ellipse{opacity:0;transform-box:fill-box;transform-origin:center}
.xa-on .xa-df2-puffs ellipse{animation:xa-df2-mist 2.6s ease-out infinite}
.xa-on .xa-df2-puffs ellipse:nth-child(2){animation-delay:-.65s}
.xa-on .xa-df2-puffs ellipse:nth-child(3){animation-delay:-1.3s}
.xa-on .xa-df2-puffs ellipse:nth-child(4){animation-delay:-1.95s}
@keyframes xa-df2-mist{0%{opacity:0;transform:translate(0,6px) scale(.5)}25%{opacity:.85}100%{opacity:0;transform:translate(var(--dx,0px),-28px) scale(1.7)}}
@keyframes xa-df2-breathe{0%,100%{opacity:.6}50%{opacity:1}}
/* mailbox */
.xa-mb-flag,.xa-mb-wig{transform-box:fill-box;transform-origin:11.5% 91.6%}
.xa-mb-flag{transform:rotate(90deg);transition:transform 1s cubic-bezier(.3,1.6,.5,1)}
.xa-on .xa-mb-flag{transform:none}
.xa-on .xa-mb-wig{animation:xa-mb-wig 5s ease-in-out infinite}
.xa-mb-mail{opacity:0;transition:opacity .6s}
.xa-on .xa-mb-mail{opacity:1}
.xa-mb-post{opacity:0;transform:translateY(6px);transition:opacity .5s,transform .8s ease-out}
.xa-on .xa-mb-post{opacity:1;transform:translateY(-3px)}
@keyframes xa-mb-wig{0%,80%,100%{transform:rotate(0)}86%{transform:rotate(-6deg)}93%{transform:rotate(3deg)}}
@keyframes xa-rot{to{transform:rotate(1turn)}}
@keyframes xa-pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes xa-steam{0%{opacity:0;transform:translateY(4px)}30%{opacity:.6}100%{opacity:0;transform:translateY(-8px)}}
@keyframes xa-mist{0%{opacity:0;transform:translate(0,0)}30%{opacity:.8}100%{opacity:0;transform:translate(5px,-5px)}}
@keyframes xa-fall{0%{opacity:0;transform:translateY(0)}25%{opacity:.9}100%{opacity:0;transform:translateY(16px)}}
@keyframes xa-chase{0%{opacity:1}45%,100%{opacity:.12}}
@keyframes xa-hum{0%,100%{transform:translateY(0)}50%{transform:translateY(-.4px)}}
@keyframes xa-drip{0%{opacity:0;transform:translateY(0)}15%{opacity:.95}100%{opacity:.9;transform:translateY(var(--dy,26px))}}
@keyframes xa-swirl{0%{opacity:0;transform:translateX(-3px)}40%{opacity:.75}100%{opacity:0;transform:translateX(4px)}}
@keyframes xa-toss{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(-2.2px) rotate(-2deg)}60%{transform:translateY(-.6px) rotate(1.5deg)}}
@keyframes xa-wiggle{0%,100%{transform:translateX(0) rotate(0)}25%{transform:translateX(-6px) rotate(-1.5deg)}75%{transform:translateX(6px) rotate(1.5deg)}}
@keyframes xa-suck{0%{opacity:0;transform:translateY(0) scale(1)}30%{opacity:.9}100%{opacity:0;transform:translateY(-20px) scale(.4)}}
@keyframes xa-scan{from{transform:translateX(0)}to{transform:translateX(18px)}}
@keyframes xa-swing{0%,100%{transform:translateY(4.5px) scaleY(.75)}50%{transform:translateY(5.5px) scaleY(.5)}}
@keyframes xa-blow{0%{opacity:0;transform:translateY(-4px)}30%{opacity:.8}100%{opacity:0;transform:translateY(10px)}}
@keyframes xa-ring{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(1.55)}}
@keyframes xa-sweep{0%{transform:skewX(-18deg) translateX(0)}60%,100%{transform:skewX(-18deg) translateX(130px)}}
@keyframes xa-bob{from{transform:translateX(-10px)}to{transform:translateX(8px)}}
@keyframes xa-spark{0%,100%{opacity:0;transform:scale(.6)}50%{opacity:1;transform:scale(1.1)}}
@keyframes xa-ripple{to{transform:translateX(20px)}}
@keyframes xa-jetbub{0%{opacity:0;transform:translate(0,0)}25%{opacity:.9}100%{opacity:0;transform:translate(-14px,-6px)}}
@keyframes xa-breath{50%{transform:scale(1.06);opacity:.7}}
@keyframes xa-beam{0%,100%{opacity:1}50%{opacity:.7}}
@keyframes xa-mote{0%{opacity:0;transform:translateY(0)}20%{opacity:.7}100%{opacity:0;transform:translateY(-60px)}}
@keyframes xa-sway{0%,100%{transform:rotate(-1.4deg)}50%{transform:rotate(1.4deg)}}
@keyframes xa-row{0%,20%{transform:translateX(0)}30%,55%{transform:translateX(-19px)}65%,90%{transform:translateX(-38px)}100%{transform:translateX(0)}}
@keyframes xa-row2{0%,40%{transform:translateX(0)}55%,90%{transform:translateX(-26px)}100%{transform:translateX(0)}}
@keyframes xa-sel{0%,8%{transform:translateX(0)}12%,20%{transform:translateX(19px)}24%,90%{transform:translateX(38px)}95%,100%{transform:translateX(0)}}
@keyframes xa-up{0%{opacity:0;transform:translateY(6px)}30%{opacity:.7}100%{opacity:0;transform:translateY(-8px)}}
@keyframes xa-suckup{0%{opacity:0;transform:translateY(2px) scaleX(1)}30%{opacity:.7}100%{opacity:0;transform:translateY(-14px) scaleX(.5)}}
@keyframes xa-blink{0%{opacity:1}50%{opacity:0}}
@keyframes xa-flash{0%{opacity:.85;transform:scale(.6)}100%{opacity:0;transform:scale(1.5)}}
@keyframes xa-wave{from{transform:translateX(0)}to{transform:translateX(-24px)}}
@media (prefers-reduced-motion:reduce){.xa-on *{animation:none!important;transition:none!important}}
`;

  // ---------- catalogue ----------
  const META = {
    "chest-freezer": ["Freezer (chest)", ["freezer", "fridge", "outlet", "other"]],
    "drawer-freezer": ["Upright freezer", ["freezer", "fridge", "outlet", "other"]],
    "coffee-drip": ["Drip coffee maker", ["coffee", "outlet", "switch", "other"]],
    "coffee-pod": ["Pod coffee machine", ["coffee", "outlet", "switch", "other"]],
    "coffee-espresso": ["Espresso machine", ["coffee", "outlet", "switch", "other"]],
    "air-fryer": ["Air fryer", ["oven", "outlet", "switch", "other"]],
    "robot-vacuum": ["Robot vacuum", ["vacuum", "other"]],
    "water-heater": ["Water heater", ["heater", "switch", "outlet", "other"]],
    "ac-split": ["Air conditioner (wall unit)", ["ac", "air", "fan", "heater", "other"]],
    "heat-pump": ["Heat pump (outdoor unit)", ["ac", "heater", "air", "other"]],
    "solar-panels": ["Solar panels", ["solar", "sensor", "other"]],
    "home-battery": ["Home battery", ["battery", "sensor", "other"]],
    "ev-charger": ["EV charger", ["ev", "outlet", "switch", "other"]],
    "pool-pump": ["Pool pump", ["pool", "pump", "outlet", "switch", "valve", "other"]],
    "sump-pump": ["Sump pump", ["pump", "outlet", "switch", "sensor", "other"]],
    "light-bulb": ["Light bulb", ["light", "switch", "outlet"]],
    "floor-lamp": ["Floor lamp", ["light", "switch", "outlet"]],
    "desk-lamp": ["Desk lamp", ["light", "switch", "outlet"]],
    "pendant-light": ["Pendant light", ["light", "switch"]],
    "tv": ["TV", ["tv", "outlet", "switch", "other"]],
    "range-hood": ["Range hood", ["hood", "fan", "oven", "switch", "other"]],
    "wine-cooler": ["Wine cooler", ["fridge", "outlet", "other"]],
    "garage-sectional": ["Garage door (sectional)", ["garage", "door"]],
    "sliding-gate": ["Sliding gate", ["gate", "garage", "door", "other"]],
    "av-receiver": ["AV receiver", ["speaker", "tv", "outlet", "switch", "other"]],
    "beer-tap": ["Beer tap / kegerator", ["fridge", "outlet", "switch", "other"]],
    "desktop-pc": ["Desktop PC", ["outlet", "switch", "sensor", "other"]],
    "laptop": ["Laptop", ["outlet", "switch", "sensor", "other"]],
    "cooktop": ["Cooktop", ["oven", "outlet", "switch", "other"]],
    "pellet-stove": ["Pellet stove", ["heater", "switch", "outlet", "other"]],
    "printer-3d": ["3D printer", ["outlet", "switch", "sensor", "other"]],
    "radiator": ["Radiator", ["heater", "switch", "outlet", "valve", "other"]],
    "server-rack": ["Server rack", ["outlet", "switch", "sensor", "other"]],
    "tool-charger": ["Tool battery charger", ["battery", "outlet", "switch", "other"]],
    "towel-dryer": ["Towel warmer", ["heater", "switch", "outlet", "other"]],
    "vent-fan": ["Ventilation fan", ["fan", "air", "switch", "outlet", "other"]],
    "barrier": ["Boom barrier", ["gate", "garage", "switch", "other"]],
    "swing-gate": ["Swing gate", ["gate", "garage", "door", "other"]],
    "aquarium": ["Aquarium", ["light", "outlet", "switch", "pump", "other"]],
    "diesel-heater": ["Diesel heater", ["heater", "switch", "other"]],
    "gas-boiler": ["Gas boiler", ["heater", "switch", "other"]],
    "hot-tub": ["Hot tub", ["pool", "pump", "heater", "switch", "other"]],
    "color-bulb": ["Color bulb", ["light", "switch"]],
    "filament-bulb": ["Filament bulb", ["light", "switch", "outlet"]],
    "pendant-cluster": ["Pendant cluster", ["light", "switch"]],
    "chandelier": ["Chandelier", ["light", "switch"]],
    "garden-spotlight": ["Garden spotlight", ["light", "switch", "outlet"]],
    "christmas-tree": ["Christmas tree", ["light", "outlet", "switch"]],
    "power-meter": ["Power meter", ["sensor", "other"]],
    "pellet-boiler": ["Pellet boiler", ["heater", "switch", "other"]],
    "pool-robot": ["Pool robot", ["pool", "vacuum", "switch", "other"]],
    "water-pump": ["Water pump", ["pump", "pool", "valve", "switch", "outlet", "other"]],
    "industrial-pump": ["Industrial pump", ["pump", "switch", "outlet", "other"]],
    "robot-mower": ["Robot mower", ["vacuum", "switch", "other"]],
    "sauna": ["Sauna", ["heater", "switch", "outlet", "other"]],
    "roller-shutter": ["Roller shutter", ["shade", "window", "other"]],
    "venetian-blind": ["Venetian blind", ["shade", "window", "other"]],
    "venetian-lift": ["Venetian blind (raises)", ["shade", "window", "other"]],
    "venetian-tilt": ["Venetian blind (slats turn)", ["shade", "window", "other"]],
    "drapes": ["Drapes", ["shade", "window", "other"]],
    "swing-shutter": ["Swing shutters", ["shade", "window", "other"]],
    "underfloor-heating": ["Underfloor heating", ["heater", "valve", "switch", "other"]],
    "ups": ["UPS (battery backup)", ["battery", "outlet", "switch", "other"]],
    "water-heat-pump": ["Ground-source heat pump", ["heater", "pump", "other"]],
    "kettle": ["Kettle", ["outlet", "switch", "other"]],
    "multicooker": ["Multicooker", ["outlet", "switch", "oven", "other"]],
    "rice-cooker": ["Rice cooker", ["outlet", "switch", "oven", "other"]],
    "toaster": ["Toaster", ["outlet", "switch", "oven", "other"]],
    "iron": ["Iron", ["outlet", "switch", "other"]],
    "hair-dryer": ["Hair dryer", ["outlet", "switch", "fan", "other"]],
    "pet-feeder": ["Pet feeder", ["switch", "other"]],
    "pet-fountain": ["Pet fountain", ["outlet", "switch", "pump", "other"]],
    "dehumidifier": ["Dehumidifier", ["air", "purifier", "outlet", "switch", "other"]],
    "space-heater": ["Space heater", ["heater", "outlet", "switch", "other"]],
    "monitor": ["Monitor", ["tv", "outlet", "switch", "other"]],
    "router": ["Router", ["outlet", "switch", "sensor", "other"]],
    "scale": ["Bathroom scale", ["sensor", "other"]],
    "security-camera": ["Security camera", ["camera", "sensor", "switch", "other"]],
    "aroma-diffuser": ["Aroma diffuser", ["purifier", "air", "light", "outlet", "switch", "other"]],
    "mailbox": ["Mailbox", ["sensor", "door", "other"]],
  };
  const cache = {};
  const root = (key) => `<svg class="xa-svg xa-k-${key}" viewBox="0 0 200 240" aria-hidden="true" focusable="false">${tint(D[key]()).replace(/ID-/g, `xa-${key}-`)}</svg>`;
  const items = {};
  Object.keys(META).forEach((key) => {
    items[key] = { name: META[key][0], fits: META[key][1].slice(), svg: () => cache[key] || (cache[key] = root(key)) };
  });
  window.EXTRA_ART = { css, items };
})();
