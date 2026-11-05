// Clock styles + font lists for the settings page.
//   renderClock({ style, fontId, scale }) -> HTML for the clock only (no date/greeting)
//   tickClocks() — updates every clock on the page; also runs by itself once a second
// Fonts are local (../../vendor/fonts/fonts.css, loaded on first use). Classes are prefixed "clk-".
(function () {
  const SYS = "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif";
  const f = (id, name, family, weight) => ({ id, name, family: `'${family}', ${SYS}`, weight });

  window.UI_FONTS = [
    { id: "system", name: "System (Segoe UI)", family: SYS, weight: 400 },
    f("inter", "Inter", "Inter", 400), f("poppins", "Poppins", "Poppins", 400), f("nunito", "Nunito", "Nunito", 400),
    f("quicksand", "Quicksand", "Quicksand", 500), f("montserrat", "Montserrat", "Montserrat", 400), f("lexend", "Lexend", "Lexend", 400),
  ];
  window.CLOCK_FONTS = [
    { id: "system", name: "System (Segoe UI)", family: SYS, weight: 200 },
    f("inter", "Inter", "Inter", 300), f("poppins", "Poppins", "Poppins", 300), f("nunito", "Nunito", "Nunito", 300),
    f("quicksand", "Quicksand", "Quicksand", 300), f("montserrat", "Montserrat", "Montserrat", 200), f("lexend", "Lexend", "Lexend", 200),
    f("orbitron", "Orbitron (digital)", "Orbitron", 400), f("bebas", "Bebas Neue", "Bebas Neue", 400),
    f("playfair", "Playfair Display", "Playfair Display", 400), f("righteous", "Righteous", "Righteous", 400), f("rajdhani", "Rajdhani", "Rajdhani", 300),
  ];
  window.CLOCK_STYLES = [
    { id: "thin", name: "Thin" }, { id: "bold", name: "Bold" }, { id: "digital", name: "Digital" },
    { id: "elegant", name: "Elegant" }, { id: "stacked", name: "Stacked" }, { id: "analog", name: "Analog" },
  ];
  // style defaults when the chosen font is "system"
  const STYLE_FONT = { digital: "orbitron", elegant: "playfair" };

  const CSS = `
  .clk { color: var(--text, #f3efff); line-height: .9; font-variant-numeric: tabular-nums; text-shadow: 0 4px 30px rgba(0,0,0,.35); display: inline-flex; align-items: baseline; white-space: nowrap; }
  .clk .clk-ap { font-size: .29em; color: var(--muted, #a99fd0); margin-left: .12em; letter-spacing: 0; font-weight: 400; }
  .clk-thin { letter-spacing: -.03em; }
  .clk-bold { letter-spacing: -.02em; }
  .clk-digital { letter-spacing: .04em; color: color-mix(in srgb, var(--accent-2, #a78bfa) 35%, #fff);
    text-shadow: 0 0 18px color-mix(in srgb, var(--accent, #8b5cf6) 70%, transparent), 0 0 4px rgba(255,255,255,.4); }
  .clk-digital .clk-ap { font-size: .24em; color: var(--accent-2, #a78bfa); }
  .clk-elegant { flex-direction: column; align-items: flex-start; line-height: 1; }
  .clk-elegant .clk-row { display: inline-flex; align-items: baseline; }
  .clk-elegant .clk-ap { font-style: italic; }
  .clk-elegant .clk-line { height: 2px; width: 72%; margin-top: .06em; border-radius: 2px; background: linear-gradient(90deg, var(--accent-2, #a78bfa), transparent); }
  .clk-stacked { flex-direction: column; align-items: flex-start; line-height: .82; letter-spacing: -.04em; }
  .clk-stacked .clk-m { color: color-mix(in srgb, var(--accent-2, #a78bfa) 55%, #fff); }
  .clk-stacked .clk-ap { margin: .15em 0 0 .08em; }
  .clk-analog { display: inline-block; filter: drop-shadow(0 8px 24px rgba(0,0,0,.4)); }
  .clk-analog svg { display: block; width: 100%; height: 100%; }`;

  const FONTS_URL = document.currentScript && document.currentScript.src;
  function ensureFonts() {
    if (document.getElementById("clock-fonts")) return;
    const link = document.createElement("link");
    link.id = "clock-fonts"; link.rel = "stylesheet";
    link.href = new URL("../../../vendor/fonts/fonts.css", FONTS_URL || location.href).href;
    document.head.appendChild(link);
  }

  // (12 or 24 hours: the house's date and time format — fmt.js, "auto" the panel's language; without it, 12 hours as before)
  const parts = (d = new Date()) => {
    if (window.Fmt) return Fmt.timeParts(d);
    if (window.T && T.clockParts) return T.clockParts(d);
    const h = d.getHours() % 12 || 12, m = String(d.getMinutes()).padStart(2, "0");
    return { h, m, ap: d.getHours() < 12 ? "AM" : "PM" };   // i18n-ok (only without strings.js)
  };
  const font = (id, style) => CLOCK_FONTS.find((x) => x.id === (id === "system" && STYLE_FONT[style] ? STYLE_FONT[style] : id)) || CLOCK_FONTS[0];

  function analog(size) {
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6, r1 = i % 3 ? 88 : 82, x0 = 100 + r1 * Math.sin(a), y0 = 100 - r1 * Math.cos(a), x1 = 100 + 93 * Math.sin(a), y1 = 100 - 93 * Math.cos(a);
      return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="var(--text,#f3efff)" stroke-opacity="${i % 3 ? 0.45 : 0.9}" stroke-width="${i % 3 ? 2 : 4}" stroke-linecap="round"/>`;
    }).join("");
    return `<div class="clk clk-analog" data-analog style="width:${size}px;height:${size}px;--clk:${size}px"><svg viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="97" fill="rgba(10,6,25,.45)" stroke="color-mix(in srgb, var(--accent,#8b5cf6) 60%, transparent)" stroke-width="2"/>
      ${ticks}
      <line class="clk-hh" x1="100" y1="100" x2="100" y2="52" stroke="var(--text,#f3efff)" stroke-width="7" stroke-linecap="round"/>
      <line class="clk-mh" x1="100" y1="100" x2="100" y2="24" stroke="var(--text,#f3efff)" stroke-width="4.5" stroke-linecap="round"/>
      <line class="clk-sh" x1="100" y1="114" x2="100" y2="18" stroke="var(--accent-2,#a78bfa)" stroke-width="2" stroke-linecap="round"/>
      <circle cx="100" cy="100" r="6" fill="var(--accent,#8b5cf6)" stroke="var(--text,#f3efff)" stroke-width="2"/></svg></div>`;
  }

  window.renderClock = ({ style = "thin", fontId = "system", scale = 1 } = {}) => {
    ensureFonts(); if (!document.getElementById("clock-css")) { const st = document.createElement("style"); st.id = "clock-css"; st.textContent = CSS; document.head.appendChild(st); }
    if (style === "analog") { const html = analog(Math.round(260 * scale)); setTimeout(tickClocks, 0); return html; }
    const fnt = font(fontId, style), { h, m, ap } = parts();
    const weight = style === "bold" ? 700 : style === "thin" ? fnt.weight : style === "digital" ? 400 : fnt.weight;
    const size = Math.round(138 * scale * (style === "stacked" ? 0.82 : style === "digital" ? 0.82 : 1));
    // (--clk: the chosen size — Home caps it to its column, theme.css)
    const base = `font-family:${fnt.family};font-weight:${weight};font-size:${size}px;--clk:${size}px`;
    if (style === "stacked") return `<div class="clk clk-stacked" style="${base}"><span>${h}</span><span class="clk-m">${m}</span><span class="clk-ap">${ap}</span></div>`;
    if (style === "elegant") return `<div class="clk clk-elegant" style="${base}"><span class="clk-row">${h}:${m}<span class="clk-ap">${ap.toLowerCase()}</span></span><span class="clk-line"></span></div>`;
    return `<div class="clk clk-${style}" style="${base}">${h}:${m}<span class="clk-ap">${ap}</span></div>`;
  };

  // analog hands; digital clocks are re-rendered by the page, but refresh their text here too
  window.tickClocks = () => {
    const d = new Date(), s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    document.querySelectorAll("[data-analog]").forEach((el) => {
      el.querySelector(".clk-hh").setAttribute("transform", `rotate(${h * 30} 100 100)`);
      el.querySelector(".clk-mh").setAttribute("transform", `rotate(${m * 6} 100 100)`);
      el.querySelector(".clk-sh").setAttribute("transform", `rotate(${s * 6} 100 100)`);
    });
  };
  setInterval(tickClocks, 1000);
})();
