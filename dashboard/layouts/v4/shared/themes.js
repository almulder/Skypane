// Full colour themes: accent, text, card tint, sky palette (for sky.js), landscape and water colours.
// window.THEMES[id] and window.applyThemeVars(theme, { glassAlpha }) → sets CSS variables on <html>.
// "purple" reproduces the round-3 look exactly.
(function () {
  const TH = {
    purple: {
      name: "Purple", accent: "#8b5cf6", accent2: "#a78bfa", grad: ["#a78bfa", "#7c3aed"], led: [139, 92, 246],
      text: "#f3efff", muted: "#a99fd0", faint: "#6f6799", glass: [30, 20, 64],
      sky: { night: ["#0b0820", "#1d1145", "#3a1d6e"], dusk: ["#2a1858", "#7e4a9c", "#f2a08a"],
             day: ["#4a3aa0", "#8e7fe2", "#e7cdf2"], gloom: ["#2a2540", "#4a4466", "#7a7392"] },
      land: [["#5a3399", "#2a1757"], ["#3f2378", "#1d1042"], ["#29165a", "#140b30"], ["#170c38", "#0a0619"]],
      water: "#2a1a5e", waterHi: "#b9a4f5",
    },
    blue: {
      name: "Blue", accent: "#3b82f6", accent2: "#60a5fa", grad: ["#60a5fa", "#2563eb"], led: [40, 110, 255],
      text: "#eef4ff", muted: "#9fb4d6", faint: "#64799c", glass: [16, 28, 58],
      sky: { night: ["#050b1f", "#0d1f4a", "#1d3f7a"], dusk: ["#14244f", "#4a5f9c", "#f2a08a"],
             day: ["#2f5bb0", "#6fa0e8", "#cfe3f7"], gloom: ["#232a3a", "#414b60", "#717a8c"] },
      land: [["#2f5a9e", "#173061"], ["#21427a", "#0f2147"], ["#152b56", "#0a1630"], ["#0b1733", "#050b19"]],
      water: "#173a6e", waterHi: "#9cc4f5",
    },
    teal: {
      name: "Teal", accent: "#14b8a6", accent2: "#2dd4bf", grad: ["#2dd4bf", "#0d9488"], led: [0, 200, 170],
      text: "#ecfffb", muted: "#93c9c2", faint: "#5d8e89", glass: [12, 40, 44],
      sky: { night: ["#03141a", "#08303a", "#105a63"], dusk: ["#123a44", "#3f7f85", "#f2b48a"],
             day: ["#1f7f86", "#5cc6c4", "#c9f1ec"], gloom: ["#203234", "#3e5456", "#6f8486"] },
      land: [["#2a7a78", "#123e44"], ["#1d5c5c", "#0c2e33"], ["#123f42", "#081f24"], ["#0a2629", "#041114"]],
      water: "#0f4a4b", waterHi: "#8fe0d8",
    },
    rose: {
      name: "Rose", accent: "#f43f5e", accent2: "#fb7185", grad: ["#fb7185", "#e11d48"], led: [255, 40, 90],
      text: "#fff0f6", muted: "#d6a2bb", faint: "#9a6a80", glass: [52, 16, 38],
      sky: { night: ["#1a0712", "#3d1030", "#6a1f4c"], dusk: ["#3f1530", "#9c4a72", "#f6a98a"],
             day: ["#a03a6e", "#e07fa8", "#f7d2e0"], gloom: ["#3a2530", "#5c4452", "#8a7380"] },
      land: [["#8f3466", "#4a1636"], ["#6a2350", "#330f27"], ["#45163a", "#20091b"], ["#280b22", "#12040f"]],
      water: "#561a40", waterHi: "#f2a6c6",
    },
    amber: {
      name: "Amber", accent: "#f59e0b", accent2: "#fbbf24", grad: ["#fbbf24", "#d97706"], led: [255, 150, 0],
      text: "#fff7ec", muted: "#d8b78e", faint: "#9a7c58", glass: [50, 32, 14],
      sky: { night: ["#160d03", "#3a2208", "#6b3f10"], dusk: ["#3d2410", "#9c5f2a", "#f7b26a"],
             day: ["#b06a1f", "#e8a54f", "#f8e2bd"], gloom: ["#352c20", "#55493a", "#857a6a"] },
      land: [["#8a5520", "#45280c"], ["#6a3f16", "#331d08"], ["#472910", "#211206"], ["#2a180a", "#120a03"]],
      water: "#53361a", waterHi: "#f2c27a",
    },
    green: {
      name: "Green", accent: "#22c55e", accent2: "#4ade80", grad: ["#4ade80", "#16a34a"], led: [40, 220, 90],
      text: "#effff1", muted: "#9fcfa6", faint: "#66926c", glass: [14, 42, 22],
      sky: { night: ["#06140a", "#0f3018", "#1d5a2c"], dusk: ["#173a20", "#4f7f4a", "#f2b48a"],
             day: ["#2f8a45", "#72cf7a", "#d6f5d4"], gloom: ["#24322a", "#425447", "#738578"] },
      land: [["#2f7a3e", "#14401f"], ["#225c2f", "#0e2f17"], ["#173f21", "#09200f"], ["#0c2614", "#041108"]],
      water: "#124a28", waterHi: "#9be3a3",
    },
    // (more to pick from — each panel its own; the Manager page can use them too)
    midnight: {
      name: "Midnight", accent: "#6366f1", accent2: "#818cf8", grad: ["#818cf8", "#4f46e5"], led: [90, 90, 255],
      text: "#eef0ff", muted: "#9aa0c8", faint: "#5f6590", glass: [18, 20, 40],
      sky: { night: ["#03040c", "#0b0f2a", "#1a2150"], dusk: ["#141a3d", "#3f4a8a", "#e59a7a"],
             day: ["#2c3a8f", "#5f7ad8", "#c9d4f5"], gloom: ["#1f2232", "#3b3f55", "#6a6e84"] },
      land: [["#28306a", "#121638"], ["#1c2350", "#0c1028"], ["#121838", "#070a1c"], ["#0a0d22", "#03040e"]],
      water: "#141c4a", waterHi: "#9fb0f2",
    },
    ocean: {
      name: "Ocean", accent: "#06b6d4", accent2: "#22d3ee", grad: ["#22d3ee", "#0284c7"], led: [0, 170, 230],
      text: "#ecfbff", muted: "#8fc3d1", faint: "#5a8a98", glass: [8, 32, 48],
      sky: { night: ["#020f1a", "#06263d", "#0c4566"], dusk: ["#0d3550", "#3a7a94", "#f2b48a"],
             day: ["#0f6c96", "#45b3d9", "#c6eef8"], gloom: ["#1d2e36", "#3a5058", "#6b8088"] },
      land: [["#1b6a80", "#0c3442"], ["#13505f", "#082631"], ["#0d3742", "#051a20"], ["#082229", "#020d11"]],
      water: "#0a4258", waterHi: "#8ee6f5",
    },
    sunset: {
      name: "Sunset", accent: "#f97316", accent2: "#fb923c", grad: ["#fb923c", "#db2777"], led: [255, 90, 40],
      text: "#fff4ec", muted: "#e0ab92", faint: "#a3735e", glass: [48, 18, 26],
      sky: { night: ["#14060f", "#33102a", "#5c1d3c"], dusk: ["#4a1a3a", "#b44a5c", "#ffb36b"],
             day: ["#c2486a", "#f08a6a", "#ffe0b8"], gloom: ["#3a2a2e", "#5c464a", "#8a7478"] },
      land: [["#8f3a4c", "#4a1626"], ["#6a2a3c", "#33101c"], ["#461c2a", "#200a12"], ["#290e18", "#120408"]],
      water: "#5a1c34", waterHi: "#ffb894",
    },
    forest: {
      name: "Forest", accent: "#84cc16", accent2: "#a3e635", grad: ["#a3e635", "#4d7c0f"], led: [120, 210, 30],
      text: "#f4fbe8", muted: "#a9c48a", faint: "#6f8a56", glass: [20, 34, 16],
      sky: { night: ["#050c04", "#11220c", "#22401a"], dusk: ["#1e3418", "#5a7a3e", "#f2c48a"],
             day: ["#4a7f2c", "#8fc25a", "#e2f4c8"], gloom: ["#283024", "#465040", "#768070"] },
      land: [["#3d6b24", "#1c3810"], ["#2c5219", "#13280a"], ["#1d3810", "#0b1a05"], ["#112208", "#040c02"]],
      water: "#1e4a26", waterHi: "#b8e89a",
    },
    graphite: {
      name: "Graphite", accent: "#94a3b8", accent2: "#cbd5e1", grad: ["#cbd5e1", "#64748b"], led: [200, 210, 225],
      text: "#f1f5f9", muted: "#a3acb9", faint: "#6b7480", glass: [26, 28, 32],
      sky: { night: ["#060708", "#14171c", "#262b33"], dusk: ["#1f242c", "#4f5866", "#d9a88a"],
             day: ["#4a5566", "#8a96a8", "#dfe5ec"], gloom: ["#2a2c30", "#45484e", "#75787e"] },
      land: [["#4a5160", "#22262e"], ["#363b46", "#181b21"], ["#24282f", "#0f1115"], ["#15171b", "#060708"]],
      water: "#262c36", waterHi: "#c8d2de",
    },
    crimson: {
      name: "Crimson", accent: "#dc2626", accent2: "#f87171", grad: ["#f87171", "#991b1b"], led: [255, 30, 30],
      text: "#fff1f1", muted: "#d7a0a0", faint: "#9a6666", glass: [44, 14, 16],
      sky: { night: ["#120404", "#2e0b0c", "#521617"], dusk: ["#3d1214", "#94403a", "#f6a98a"],
             day: ["#a0302e", "#e0786a", "#f7d4cc"], gloom: ["#352626", "#574444", "#857272"] },
      land: [["#7f2a2a", "#3f1010"], ["#5e1e1e", "#2c0a0a"], ["#3f1414", "#1c0606"], ["#240b0b", "#0e0303"]],
      water: "#4a1416", waterHi: "#f5a4a4",
    },
  };

  // the selected / "current" buttons carry white text on --accent-grad: every gradient is drawn to at least 4.5 : 1
  // (gradFor below; Teal, Amber, Green, Ocean, Forest, Graphite were 1.5–1.9 : 1, Purple's light end 2.7 : 1)
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const onWhite = (hex) => 1.05 / (lum(hex) + 0.05);
  const deepen = (hex, aim = 4.5) => {
    let k = 1, out = hex;
    while (onWhite(out) < aim && k > 0.3) { k -= 0.04; out = "#" + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0")).join(""); }
    return out;
  };
  const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const hexOf = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  const toward = (a, b, t) => { const x = rgbOf(a), y = Array.isArray(b) ? b : rgbOf(b); return hexOf(x.map((v, i) => v + (y[i] - v) * t)); };
  // (v2.4.0, accessibility — WCAG AA: a button's white text sits mid-gradient, so the middle is held to 4.5 : 1 and the
  // light end to 3.5 : 1. The dark end is darkened if it needs to be; the light end moves towards it, so the colours stay
  // the theme's own rather than greyed)
  const gradFor = (g) => {
    if (!/^#[0-9a-f]{6}$/i.test(g[0]) || !/^#[0-9a-f]{6}$/i.test(g[1])) return g;
    const b = onWhite(g[1]) < 4.5 ? deepen(g[1]) : g[1];
    let a = g[0];
    for (let t = 0.05; (onWhite(a) < 3.5 || onWhite(toward(a, b, 0.5)) < 4.5) && t <= 1.001; t += 0.05) a = toward(g[0], b, t);
    return [a, b];
  };
  // the faint text (hints, a calendar event's time and calendar) at least 4.5 : 1 on the theme's glass: moved towards the
  // theme's text colour as far as that needs (on the sky behind the glass it reads the same or better)
  const contrast = (x, y) => { const [p, q] = [lum(x), lum(y)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05); };
  const faintFor = (faint, text, glass) => {
    if (!/^#[0-9a-f]{6}$/i.test(faint) || !/^#[0-9a-f]{6}$/i.test(text) || !Array.isArray(glass)) return faint;
    const bg = hexOf(glass);
    let f = faint;
    for (let t = 0.05; contrast(f, bg) < 4.5 && t <= 1.001; t += 0.05) f = toward(faint, text, t);
    return f;
  };

  // (v2.7.2, the milestone's contrast check) the muted and faint text on a card at least 4.5 : 1 over the card's worst
  // backdrop: its glass ([r,g,b] at `alpha`) over the brightest day sky — the theme's own stops or the realistic sky's —
  // plus the cards' light top edge / an agenda row's fill (8 % white). By day the cards are at least DAY_GLASS opaque
  // (settings.js), so that's the alpha to pass; at night the sky is dark and they pass with room to spare.
  window.DAY_GLASS = 0.88;
  window.textOnGlass = (theme, glass, alpha = window.DAY_GLASS) => {
    const isHex = (h) => /^#[0-9a-f]{6}$/i.test(h);
    if (!theme || !Array.isArray(glass) || !isHex(theme.text) || !isHex(theme.muted) || !isHex(theme.faint)) return null;
    const day = [...((theme.sky && theme.sky.day) || []), "#cfe6fb"].filter(isHex);
    const light = day.reduce((a, b) => (lum(b) > lum(a) ? b : a), "#000000");
    const over = (top, a, bot) => top.map((v, i) => v * a + bot[i] * (1 - a));
    const bd = hexOf(over([255, 255, 255], 0.08, over(glass, alpha, rgbOf(light))));
    const lift = (c) => { let f = c; for (let t = 0.05; contrast(f, bd) < 4.5 && t <= 1.001; t += 0.05) f = toward(c, theme.text, t); return f; };
    return { muted: lift(theme.muted), faint: lift(theme.faint), backdrop: bd };
  };

  // opts.glassAlpha (0..1) — card transparency setting; opts.glass ([r,g,b]) — override card tint
  window.applyThemeVars = (theme, opts = {}) => {
    const s = document.documentElement.style, set = (k, v) => s.setProperty(k, v);
    const [lr, lg, lb] = theme.led, glass = opts.glass || theme.glass;
    set("--accent", theme.accent);
    set("--accent-2", theme.accent2);
    const grad = gradFor(theme.grad);
    set("--accent-grad", `linear-gradient(135deg, ${grad[0]} 0%, ${grad[1]} 100%)`);
    set("--on-glow", `0 0 28px rgba(${lr},${lg},${lb},.45)`);
    set("--text", theme.text);
    set("--muted", theme.muted);
    set("--faint", faintFor(theme.faint, theme.text, glass));
    set("--glass-rgb", glass.join(","));
    if (opts.glassAlpha != null) {
      set("--glass", `rgba(${glass.join(",")},${opts.glassAlpha})`);
      set("--glass-strong", `rgba(${glass.join(",")},${Math.min(0.97, opts.glassAlpha + 0.22)})`);
    }
    theme.land.forEach((l, i) => {
      const [top, bottom] = Array.isArray(l) ? l : [l, l];
      set(`--land${i + 1}`, top);
      set(`--land${i + 1}b`, bottom);
    });
    set("--water", theme.water);
    set("--water-hi", theme.waterHi);
  };

  window.THEMES = TH;
})();
