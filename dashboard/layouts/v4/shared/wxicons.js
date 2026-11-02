// Coloured weather icons in three styles: "flat", "glossy", "neon".
// wxIcon(kind, size, style, night) — kind from Weather.describe(): clear, mostly-clear, partly, cloudy, fog,
// drizzle, rain, heavy-rain, sleet, snow, heavy-snow, thunder, wind.
(function () {
  const CLOUD = "M20,46 H46 A10,10 0 0 0 46,26 A14,14 0 0 0 19,24 A11,11 0 0 0 20,46 Z";

  function kit(style) {
    // fixed id: every icon's defs are identical, and a new id per call made the home screen's HTML differ on every
    // render (App.render then rebuilt the whole screen)
    const id = "wxdefs";
    const neon = style === "neon", glossy = style === "glossy";
    const defs = glossy ? `<defs>
      <radialGradient id="${id}s" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff6c2"/><stop offset=".45" stop-color="#ffc107"/><stop offset="1" stop-color="#ff8f00"/></radialGradient>
      <radialGradient id="${id}g" r=".5"><stop offset="0" stop-color="#ffb300" stop-opacity=".55"/><stop offset="1" stop-color="#ffb300" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c3c6ea"/></linearGradient>
      <linearGradient id="${id}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a5f8f"/><stop offset="1" stop-color="#363a63"/></linearGradient>
      <linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9be7ff"/><stop offset="1" stop-color="#0288d1"/></linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff59d"/><stop offset="1" stop-color="#ff9800"/></linearGradient>
      <radialGradient id="${id}m" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#fffbe6"/><stop offset="1" stop-color="#ffd54f"/></radialGradient>
      <filter id="${id}f" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#1a0f3d" flood-opacity=".45"/></filter>
    </defs>` : "";
    const C = neon
      ? { sun: "#fcd34d", moon: "#fde68a", cloud: "#c4b5fd", dark: "#818cf8", rain: "#38bdf8", snow: "#e0f2fe", bolt: "#facc15", fog: "#a5b4fc" }
      : glossy
      ? { sun: `url(#${id}s)`, moon: `url(#${id}m)`, cloud: `url(#${id}c)`, dark: `url(#${id}d)`, rain: `url(#${id}r)`, snow: "#ffffff", bolt: `url(#${id}b)`, fog: "#d6d9f5" }
      : { sun: "#fdb813", moon: "#f6e7a8", cloud: "#eceef9", dark: "#9aa3c7", rain: "#4fc3f7", snow: "#ffffff", bolt: "#ffc107", fog: "#cfd8dc" };
    const shape = (fill) => neon ? `fill="none" stroke="${fill}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"` : `fill="${fill}"`;
    const shadow = glossy ? `filter="url(#${id}f)"` : "";

    return {
      defs,
      sun(cx, cy, r) {
        const rays = Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4, r1 = r + 4, r2 = r + 9;
          return `<line x1="${cx + r1 * Math.cos(a)}" y1="${cy + r1 * Math.sin(a)}" x2="${cx + r2 * Math.cos(a)}" y2="${cy + r2 * Math.sin(a)}" stroke="${neon || glossy ? "#ffca28" : C.sun}" stroke-width="3" stroke-linecap="round"/>`;
        }).join("");
        const glow = glossy ? `<circle cx="${cx}" cy="${cy}" r="${r * 2}" fill="url(#${id}g)"/>` : "";
        return glow + rays + `<circle cx="${cx}" cy="${cy}" r="${r}" ${shape(C.sun)}/>`;
      },
      moon(cx, cy, r) {
        // (both ends on the outer circle, 60° above / below the right; the inner arc's radius more than half their
        // distance — a smaller one was scaled up by SVG and ran back along the outer arc: no moon at all)
        const x = cx + r * 0.5, y1 = cy - r * 0.866, y2 = cy + r * 0.866;
        const d = `M${x},${y1} A${r},${r} 0 1 0 ${x},${y2} A${r * 0.95},${r * 0.95} 0 0 1 ${x},${y1} Z`;
        return `<path d="${d}" ${shape(C.moon)} ${shadow}/>`;
      },
      cloud(dx = 0, dy = 0, s = 1, dark = false) {
        return `<path d="${CLOUD}" transform="translate(${dx} ${dy}) scale(${s})" ${shape(dark ? C.dark : C.cloud)} ${shadow}/>`;
      },
      drops(n, heavy) {
        const xs = n === 2 ? [26, 38] : [22, 32, 42];
        return xs.map((x, i) => heavy
          ? `<line x1="${x}" y1="${50 + (i % 2) * 2}" x2="${x - 4}" y2="${60 + (i % 2) * 2}" stroke="${neon ? C.rain : "#29b6f6"}" stroke-width="3" stroke-linecap="round"/>`
          : `<path d="M${x},${50 + (i % 2) * 3} q-3,5 0,7 q3,-2 0,-7z" ${neon ? `fill="none" stroke="${C.rain}" stroke-width="2"` : `fill="${C.rain}"`}/>`).join("");
      },
      flakes(n) {
        const xs = n === 2 ? [26, 38] : [21, 32, 43];
        return xs.map((x, i) => {
          const y = 54 + (i % 2) * 4, r = 3.6;
          return `<g stroke="${neon ? C.snow : "#ffffff"}" stroke-width="2" stroke-linecap="round">
            <line x1="${x - r}" y1="${y}" x2="${x + r}" y2="${y}"/><line x1="${x - r / 2}" y1="${y - r * .87}" x2="${x + r / 2}" y2="${y + r * .87}"/>
            <line x1="${x - r / 2}" y1="${y + r * .87}" x2="${x + r / 2}" y2="${y - r * .87}"/></g>`;
        }).join("");
      },
      bolt() { return `<path d="M33,44 L26,55 H32 L28,63 L39,50 H33 L37,44 Z" ${neon ? `fill="none" stroke="${C.bolt}" stroke-width="2.2" stroke-linejoin="round"` : `fill="${C.bolt}"`}/>`; },
      fog() { return [38, 45, 52].map((y, i) => `<line x1="${14 + i * 3}" y1="${y + 6}" x2="${50 - i * 2}" y2="${y + 6}" stroke="${C.fog}" stroke-width="3.2" stroke-linecap="round" opacity="${1 - i * .15}"/>`).join(""); },
      wind() { return `<g fill="none" stroke="${neon ? "#a5f3fc" : "#b3e5fc"}" stroke-width="3" stroke-linecap="round">
        <path d="M10,28 H40 a6,6 0 1 0 -6,-6"/><path d="M10,38 H50 a6,6 0 1 1 -6,6"/><path d="M10,48 H32"/></g>`; },
    };
  }

  window.wxIcon = (kind, size = 48, style = "flat", night = false) => {
    const k = kit(style);
    const sky = (r) => (night ? k.moon(24, 22, r) : k.sun(24, 22, r));
    let body;
    switch (kind) {
      case "clear": body = night ? k.moon(32, 32, 15) : k.sun(32, 32, 13); break;
      case "mostly-clear": body = sky(11) + k.cloud(10, 14, 0.75); break;
      case "partly": body = sky(11) + k.cloud(4, 6, 0.9); break;
      case "cloudy": body = k.cloud(-6, -6, 0.85, true) + k.cloud(2, 2, 0.95); break;
      case "fog": body = k.cloud(0, -8, 0.95) + k.fog(); break;
      case "drizzle": body = k.cloud(0, -6, 1) + k.drops(2); break;
      case "rain": body = k.cloud(0, -6, 1) + k.drops(3); break;
      case "heavy-rain": body = k.cloud(-4, -10, 0.9, true) + k.cloud(0, -6, 1) + k.drops(3, true); break;
      case "sleet": body = k.cloud(0, -6, 1) + k.drops(2) + k.flakes(2).replace(/x1="(\d+)/g, (m, x) => `x1="${+x + 6}`); break;
      case "snow": body = k.cloud(0, -6, 1) + k.flakes(3); break;
      case "heavy-snow": body = k.cloud(-4, -10, 0.9, true) + k.cloud(0, -6, 1) + k.flakes(3); break;
      case "thunder": body = k.cloud(-4, -12, 0.9, true) + k.cloud(0, -8, 1, true) + k.bolt(); break;
      case "wind": body = k.wind(); break;
      default: body = k.cloud(0, 0, 1);
    }
    const glow = style === "neon" ? ` style="filter:drop-shadow(0 0 4px rgba(167,139,250,.7))"` : "";
    return `<svg class="wx wx-${style}" width="${size}" height="${size}" viewBox="0 0 64 64"${glow} aria-hidden="true">${k.defs}${body}</svg>`;
  };
})();
