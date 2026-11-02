// Animated sky + weather effects.
//   sky canvas (behind the mountains): sky colours, stars, sun/moon on an east→west arc, clouds, sun rays, lightning bolts
//   fx canvas (in front of everything, no touches): rain, snow, leaves, wind, fog, flashes, drops on the glass, dust
// The panel hangs on a south wall: left = east (sunrise/moonrise), right = west.
//
//   const sky = new Sky({ sky: canvas, fx: canvas, mountains: img });
//   sky.setCondition(63); sky.wind = 25; sky.mode = "demo" | "real"; sky.sunrise/sunset = Date
// One effect per Open-Meteo weather code (CONDITIONS below, named as the weather app shows them), plus the extra
// "leaves" and "none" (plain sky). Settings → Weather effects previews each one.
(function () {
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  const SKY = {
    night: ["#0b0820", "#1d1145", "#3a1d6e"].map(hex),
    dusk: ["#2a1858", "#7e4a9c", "#f2a08a"].map(hex),
    day: ["#4a3aa0", "#8e7fe2", "#e7cdf2"].map(hex),
    gloom: ["#2a2540", "#4a4466", "#7a7392"].map(hex),
  };

  // "Realistic" sky colours (Manager → Panels → Look & layout): the real blue day, warm sunrise / sunset, deep night —
  // instead of the theme's tint
  const REAL = {
    night: ["#02040d", "#0a1630", "#1c2c52"].map(hex),
    dusk: ["#1b2850", "#8a5a86", "#ff9e6a"].map(hex),
    day: ["#1f5fbf", "#5d9ce6", "#cfe6fb"].map(hex),
    gloom: ["#3a4250", "#646c7a", "#9aa0aa"].map(hex),
    blue: ["#071331", "#1a2f66", "#4a5a95"].map(hex),
    rise: ["#2a3f7a", "#c97a8a", "#ffb070"].map(hex),
    gold: ["#3a74c8", "#86b4e8", "#ffe0b0"].map(hex),
    set: ["#1f2a5c", "#b45f78", "#ff7a4a"].map(hex),
  };

  // ---------- the sky through the day ----------
  // Minutes from sunrise / sunset pick the colours: night → blue hour → dawn → sunrise → golden morning → full day,
  // and back at sunset (a little redder). A palette may bring its own blue / rise / gold / set (REAL does); a theme's
  // are made from its night / dusk / day, so every theme keeps its own tint.
  const WARM = { rise: hex("#ffb27a"), set: hex("#ff8452"), gold: hex("#ffd9a0") };
  function stages(P) {
    if (P._st) return P._st;
    const blue = P.blue || [mix(P.night[0], P.day[0], 0.18), mix(P.night[1], P.day[1], 0.3), mix(P.night[2], P.dusk[2], 0.35)];
    const rise = P.rise || [mix(P.dusk[0], P.day[0], 0.25), mix(P.dusk[1], WARM.rise, 0.35), WARM.rise];
    const set = P.set || [mix(P.dusk[0], P.night[0], 0.15), mix(P.dusk[1], WARM.set, 0.4), WARM.set];
    const gold = P.gold || [mix(P.day[0], P.dusk[0], 0.15), mix(P.day[1], WARM.gold, 0.2), mix(P.day[2], WARM.gold, 0.55)];
    // [minutes from the sun crossing the horizon, [top, mid, horizon]]
    return (P._st = { am: [[-80, P.night], [-45, blue], [-18, P.dusk], [0, rise], [30, gold], [100, P.day]],
      pm: [[-100, P.day], [-35, gold], [0, set], [18, P.dusk], [45, blue], [80, P.night]] });
  }
  function skyAt(P, am, mins) {
    const L = stages(P)[am ? "am" : "pm"];
    if (mins <= L[0][0]) return L[0][1];
    for (let i = 1; i < L.length; i++) {
      if (mins <= L[i][0]) { const t = smooth(0, 1, (mins - L[i - 1][0]) / (L[i][0] - L[i - 1][0])); return L[i - 1][1].map((c, k) => mix(c, L[i][1][k], t)); }
    }
    return L[L.length - 1][1];
  }

  // moon age in days (0 = new, ~14.77 = full)
  const SYNODIC = 29.530588853, NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
  function moonAge(d = new Date()) { return ((((d - NEW_MOON) / 86400000) % SYNODIC) + SYNODIC) % SYNODIC; }
  function moonName(age) {
    const f = age / SYNODIC;
    return f < 0.03 || f > 0.97 ? "New moon" : f < 0.22 ? "Waxing crescent" : f < 0.28 ? "First quarter" : f < 0.47 ? "Waxing gibbous"
      : f < 0.53 ? "Full moon" : f < 0.72 ? "Waning gibbous" : f < 0.78 ? "Last quarter" : "Waning crescent";
  }
  function moonIllum(age) { return (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2; }

  // ---------- sprites ----------
  function cloudSprite(w, h, tone) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.filter = `blur(${Math.round(h / 10)}px)`;
    const puffs = 14;
    // keep every puff (incl. blur) well inside the sprite, or the blur shows hard rectangular edges
    for (let i = 0; i < puffs; i++) {
      const x = rand(w * 0.25, w * 0.75), y = rand(h * 0.45, h * 0.58), r = rand(h * 0.12, h * 0.22) * (1.2 - Math.abs(x / w - 0.5));
      const gr = g.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r * 1.3);
      gr.addColorStop(0, rgb(tone, 0.95)); gr.addColorStop(1, rgb(tone, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 1.3, 0, Math.PI * 2); g.fill();
    }
    return c;
  }
  function bandSprite(w, h, tone) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.filter = `blur(${Math.round(h / 7)}px)`;
    for (let i = 0; i < 9; i++) {
      g.fillStyle = rgb(tone, rand(0.25, 0.55));
      g.beginPath(); g.ellipse(rand(w * 0.32, w * 0.68), h / 2 + rand(-h * 0.05, h * 0.05), rand(w * 0.1, w * 0.18), rand(h * 0.08, h * 0.16), 0, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  // soft "out of focus" snowflakes, pre-rendered once per size (blurring each flake every frame froze the panel)
  const softFlakes = new Map();
  function softFlake(r) {
    const key = Math.round(r);
    if (!softFlakes.has(key)) {
      const s = key * 4, c = document.createElement("canvas"); c.width = c.height = s;
      const g = c.getContext("2d"), gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,.75)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      softFlakes.set(key, c);
    }
    return softFlakes.get(key);
  }

  function bolt(x, y, len, angle, depth, out) {
    let cx = x, cy = y;
    const segs = 14;
    for (let i = 0; i < segs; i++) {
      const nx = cx + Math.cos(angle) * (len / segs) + rand(-18, 18), ny = cy + Math.sin(angle) * (len / segs);
      out.push([cx, cy, nx, ny, depth]);
      if (depth < 2 && Math.random() < 0.18) bolt(nx, ny, len * 0.45, angle + rand(-0.8, 0.8), depth + 1, out);
      cx = nx; cy = ny;
    }
    return out;
  }

  // lens flares of the "sun" glow: [position along sun→centre, radius, colour, alpha]
  const FLARES = [[0.35, 26, "255,220,180", 0.12], [0.6, 60, "200,180,255", 0.07], [0.85, 16, "255,255,255", 0.15], [1.3, 90, "180,160,255", 0.05], [1.6, 34, "255,200,160", 0.09]];


  // ---------- weather conditions (Open-Meteo = WMO weather codes) ----------
  // One recipe per code; the amount grows with the intensity (slight → moderate → heavy).
  //   clouds [kind, n] (A puffs, B overcast bands) · sky [cover, dark] (rain, snow, storms: how much of the sky is
  //   cloud and how dark — light grey to near-black storm clouds, a grey ceiling, clouds over the sun;
  //   "the heavier the storm the more clouds, darker and greyer") · gloom 0–1 (darker, greyer sky) · lens
  //   rain / drizzle / snow / grains / hail = how many · big = how many of the snowflakes are big soft ones
  //   heavy (thicker, faster rain / snow) · splash (drops bounce at the bottom) · glass = drops running down the glass
  //   ice (freezing: icy colour) · frost 0–1 (ice creeping in from the screen edges) · sparkle = ice crystals glinting
  //   fog 1 mist / 2 thick · haze 0–1 (a veil over everything) · showers (comes and goes in bursts)
  //   slant (rain driven sideways) · thunder (flashes + bolts) · leaves (windy autumn)
  const CATEGORIES = [["clear", "☀️", "Clear & cloudy"],   // i18n-ok (names in the panel's language: Sky.CATEGORIES → "fx.cat.<id>")
    ["fog", "🌫️", "Fog"], ["drizzle", "🌧️", "Drizzle"], ["rain", "🌧️", "Rain"],
    ["snow", "❄️", "Snow & ice"], ["thunder", "⛈️", "Thunderstorms"], ["extra", "🍂", "Extras"]];
  const B4 = ["B", 4], C7 = ["C", 7];
  const CONDITIONS = [
    [0, "Clear sky", "clear", { lens: true }],
    [1, "Mainly clear", "clear", { lens: true, clouds: ["A", 2], gloom: 0.03 }],
    [2, "Partly cloudy", "clear", { clouds: ["A", 6], gloom: 0.1 }],
    [3, "Overcast", "clear", { clouds: ["B", 6], gloom: 0.45 }],
    [45, "Fog", "fog", { fog: 1, clouds: ["B", 3], gloom: 0.35 }],
    [48, "Depositing rime fog", "fog", { fog: 2, clouds: ["B", 3], gloom: 0.5, frost: 0.55, sparkle: 70 }],
    [51, "Light drizzle", "drizzle", { drizzle: 220, sky: [0.6, 0.2], gloom: 0.3 }],
    [53, "Moderate drizzle", "drizzle", { drizzle: 450, glass: 20, sky: [0.7, 0.3], gloom: 0.35 }],
    [55, "Dense drizzle", "drizzle", { drizzle: 850, glass: 35, haze: 0.07, sky: [0.85, 0.4], gloom: 0.45 }],
    [56, "Light freezing drizzle", "drizzle", { drizzle: 260, ice: true, frost: 0.35, sky: [0.65, 0.3], gloom: 0.35 }],
    [57, "Dense freezing drizzle", "drizzle", { drizzle: 800, ice: true, frost: 0.65, haze: 0.06, sky: [0.85, 0.45], gloom: 0.45 }],
    [61, "Slight rain", "rain", { rain: 220, glass: 25, sky: [0.65, 0.3], gloom: 0.4 }],
    [63, "Moderate rain", "rain", { rain: 480, glass: 60, sky: [0.8, 0.45], gloom: 0.45 }],
    [65, "Heavy rain", "rain", { rain: 900, heavy: true, splash: true, glass: 70, haze: 0.05, sky: [0.95, 0.65], gloom: 0.6 }],
    [66, "Light freezing rain", "rain", { rain: 260, ice: true, splash: true, frost: 0.4, sky: [0.75, 0.45], gloom: 0.45 }],
    [67, "Heavy freezing rain", "rain", { rain: 800, heavy: true, ice: true, splash: true, frost: 0.75, sky: [0.95, 0.65], gloom: 0.6 }],
    [80, "Slight rain showers", "rain", { rain: 320, showers: true, glass: 30, sky: [0.55, 0.35], gloom: 0.35 }],
    [81, "Moderate rain showers", "rain", { rain: 620, showers: true, splash: true, glass: 45, sky: [0.75, 0.5], gloom: 0.45 }],
    [82, "Violent rain showers", "rain", { rain: 950, heavy: true, showers: true, splash: true, slant: 2.2, haze: 0.06, sky: [1, 0.75], gloom: 0.65 }],
    [71, "Slight snowfall", "snow", { snow: 130, sky: [0.6, 0.15], gloom: 0.25 }],
    [73, "Moderate snowfall", "snow", { snow: 330, big: 20, sky: [0.75, 0.25], gloom: 0.3 }],
    [75, "Heavy snowfall", "snow", { snow: 800, big: 30, heavy: true, haze: 0.12, sky: [0.95, 0.4], gloom: 0.55 }],
    [77, "Snow grains", "snow", { grains: 550, sky: [0.7, 0.25], gloom: 0.35 }],
    [85, "Slight snow showers", "snow", { snow: 260, showers: true, sky: [0.55, 0.2], gloom: 0.3 }],
    [86, "Heavy snow showers", "snow", { snow: 750, big: 25, heavy: true, showers: true, haze: 0.1, sky: [0.9, 0.4], gloom: 0.5 }],
    [95, "Thunderstorm", "thunder", { rain: 700, heavy: true, splash: true, thunder: true, sky: [1, 0.85], gloom: 0.75 }],
    [96, "Thunderstorm with slight hail", "thunder", { rain: 600, heavy: true, splash: true, thunder: true, hail: 30, sky: [1, 0.85], gloom: 0.75 }],
    [99, "Thunderstorm with heavy hail", "thunder", { rain: 550, heavy: true, splash: true, thunder: true, hail: 110, sky: [1, 0.9], gloom: 0.8 }],
    ["leaves", "Windy (autumn leaves)", "extra", { leaves: 30, clouds: ["A", 4], gloom: 0.05 }],
    ["none", "No effect", "none", {}],
  ].map(([id, name, cat, r]) => {
    // (the name in the panel's language when it's read: strings/en.js "fx.cond.<id>"; the English one without strings.js)
    const o = { id, cat, ...r };
    Object.defineProperty(o, "name", { get: () => (window.T ? T(`fx.cond.${id}`) : name), enumerable: true });
    return o;
  });
  const BY_ID = new Map(CONDITIONS.map((c) => [String(c.id), c]));
  // how heavy an effect is for the tablet's GPU (tablets differ in speed): a score
  // from its recipe — particles, drops on the glass, fog / frost layers, thunder — as 1 minimal · 2 light · 3 medium
  // · 4 heavy. Each panel shows effects up to its level (Settings effects.maxLoad, or measured: app.js).
  const LOAD_NAMES = new Proxy(["", "Minimal", "Light", "Medium", "Heavy"], { get: (a, k) => (/^[1-4]$/.test(String(k)) && window.T ? T(`fx.load.${String(k)}`) : a[k]) });   // i18n-ok (English without strings.js)
  function loadScore(c) {
    if (!c || c.id === "none") return 0;
    return (c.drizzle || 0) * 0.5 + (c.rain || 0) + (c.snow || 0) * 1.2 + (c.grains || 0) * 0.6 + (c.hail || 0) * 4 + (c.leaves || 0) * 4
      + (c.glass || 0) * 3 + (c.fog || 0) * 120 + (c.frost || 0) * 220 + (c.sparkle || 0) + (c.haze ? 60 : 0)
      + (c.thunder ? 250 : 0) + (c.splash ? 120 : 0) + (c.heavy ? 80 : 0) + (c.clouds ? c.clouds[1] * 12 : 0) + (c.sky ? Math.round(c.sky[0] * 84) : 0) + (c.lens ? 20 : 0);
  }
  const loadOf = (c) => { const s = loadScore(c); return !s ? 0 : s < 150 ? 1 : s < 500 ? 2 : s < 900 ? 3 : 4; };

  // hailstones, pre-drawn once per size (a radial gradient per stone per frame was too much for the panel)
  const hailSprites = new Map();
  function hailSprite(r) {
    const key = Math.round(r * 2) / 2;
    if (!hailSprites.has(key)) {
      const s = Math.ceil(key * 2) + 2, c = document.createElement("canvas"); c.width = c.height = s;
      const g = c.getContext("2d"), m = s / 2, gr = g.createRadialGradient(m - key * 0.35, m - key * 0.35, 0.3, m, m, key);
      gr.addColorStop(0, "rgba(255,255,255,.95)"); gr.addColorStop(1, "rgba(200,215,240,.75)");
      g.fillStyle = gr; g.beginPath(); g.arc(m, m, key, 0, Math.PI * 2); g.fill();
      hailSprites.set(key, c);
    }
    return hailSprites.get(key);
  }

  // frost creeping in from the screen edges (freezing drizzle / rain, rime fog): drawn once, then just shown
  function frostSprite(w, h) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), edge = 110;
    for (const [x0, y0, x1, y1] of [[0, 0, 0, edge], [0, h, 0, h - edge], [0, 0, edge, 0], [w, 0, w - edge, 0]]) {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, "rgba(225,240,255,.55)"); gr.addColorStop(1, "rgba(225,240,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
    // ice ferns: short branching strokes, densest in the corners
    g.strokeStyle = "rgba(240,248,255,.5)"; g.lineCap = "round";
    const fern = (x, y, a, len, d) => {
      if (d > 3 || len < 4) return;
      const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
      g.lineWidth = Math.max(0.6, 1.6 - d * 0.4); g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      fern(nx, ny, a + rand(-0.3, 0.3), len * 0.75, d + 1);
      if (Math.random() < 0.7) fern(x + (nx - x) * 0.5, y + (ny - y) * 0.5, a + rand(0.6, 1.1), len * 0.45, d + 1);
      if (Math.random() < 0.7) fern(x + (nx - x) * 0.5, y + (ny - y) * 0.5, a - rand(0.6, 1.1), len * 0.45, d + 1);
    };
    for (const [cx, cy, a] of [[0, 0, Math.PI / 4], [w, 0, (3 * Math.PI) / 4], [0, h, -Math.PI / 4], [w, h, (-3 * Math.PI) / 4]])
      for (let i = 0; i < 26; i++) fern(cx + rand(-30, 30), cy + rand(-30, 30), a + rand(-0.7, 0.7), rand(30, 90), 0);
    for (let i = 0; i < 90; i++) { // along the edges
      const side = i % 4, t = Math.random();
      const [x, y, a] = side === 0 ? [t * w, 0, Math.PI / 2] : side === 1 ? [t * w, h, -Math.PI / 2] : side === 2 ? [0, t * h, 0] : [w, t * h, Math.PI];
      fern(x, y, a + rand(-0.6, 0.6), rand(12, 40), 1);
    }
    return c;
  }

  class Sky {
    // skyFps / fxFps: redraw rates of the sky layer and the fx layer in front. Every fx frame makes the panel
    // re-composite the whole screen (~25 ms on the RK3576), so the dashboard runs fx at 30 and the sky at 12;
    // an fx layer with nothing to draw (clear, clouds, plain sun) isn't touched at all.
    // (Drawing the sky at half resolution was tried and made no difference: on the panel a sky frame costs ~36 ms to
    // composite whatever its size or the cards on top — and it doesn't slow taps.)
    constructor({ sky, fx, mountains, skyFps = 60, fxFps = 60 }) {
      this.cs = sky; this.cf = fx; this.mtn = mountains; this.skyFps = skyFps; this.fxFps = fxFps; this.lastSky = 0; this.lastFx = 0;
      this.gs = sky.getContext("2d"); this.gf = fx.getContext("2d");
      this.wind = 8; this.mode = "demo";
      this.sunrise = null; this.sunset = null;
      this.t0 = performance.now(); this.last = this.t0;
      this.resize(); addEventListener("resize", () => this.resize());
      // prefers-reduced-motion (frame): followed live — a change redraws the sky at once
      const mq = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
      this.reduce = !!(mq && mq.matches);
      if (mq && mq.addEventListener) mq.addEventListener("change", (e) => {
        const was = this.reduce; this.reduce = e.matches; this.lastSky = 0;
        if (was && !e.matches) this.kick(true);
      });
      this.stars = Array.from({ length: 260 }, () => ({ x: Math.random(), y: Math.random() * 0.62, r: rand(0.5, 1.8), tw: rand(0, 6.3) }));
      this.setCondition("none");
      this.schedule(true);
    }

    // theme sky colours: { night, dusk, day, gloom } — each [top, mid, horizon] hex strings
    setPalette(p) { this.pal = p ? Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.map(hex)])) : null; this.kick(); }

    resize() {
      this.W = this.cs.width = this.cf.width = innerWidth;
      this.H = this.cs.height = this.cf.height = innerHeight;
      this.horizon = this.H * 0.66;
      this.frostImg = this.cond && this.cond.frost ? frostSprite(this.W, this.H) : null;
      this.kick();
    }

    // ---------- time of day ----------
    clock(now) {
      if (this.mode === "demo") {
        const t = ((now - this.t0) / 1000) % 30;
        return t < 15 ? { day: true, p: t / 15, demo: t < 15 ? T("fx.demoDay", { s: Math.round(t) }) : "" } : { day: false, p: (t - 15) / 15, demo: T("fx.demoNight", { s: Math.round(t - 15) }) };
      }
      const d = new Date(), rise = this.sunrise || new Date(d.toDateString() + " 07:45"), set = this.sunset || new Date(d.toDateString() + " 18:30");
      if (d >= rise && d <= set) return { day: true, p: (d - rise) / (set - rise) };
      const prevSet = d < rise ? new Date(set.getTime() - 86400000) : set;
      const nextRise = d < rise ? rise : new Date(rise.getTime() + 86400000);
      return { day: false, p: (d - prevSet) / (nextRise - prevSet) };
    }
    arc(p) { return [this.W * (0.06 + 0.88 * p), this.horizon - Math.sin(Math.PI * p) * this.H * 0.55]; }
    // where the sun / moon is drawn: on its arc, but clear of the page's text and cards (Sky.AVOID — the Home page's
    // clock lines and cards, with a margin; the moon sat over the greeting / against the calendar): slid along the arc
    // to the nearest clear spot; none → the moon isn't drawn, the sun is, faintly (its glow is the daylight).
    // The page is measured (layout work: getBoundingClientRect) at most once a second and on a resize; the spot found
    // is kept per size of body (r) until then — the offset along the arc, or "hidden" — and only checked against the
    // last measurement (plain arithmetic) as the body moves on (the demo's 15 s day moves it every frame).
    place(p, r) {
      const now = performance.now();
      let k = this.avoid;
      if (!k || now - k.t >= 1000 || k.W !== this.W || k.H !== this.H) k = this.avoid = { t: now, W: this.W, H: this.H, boxes: this.avoidBoxes(), by: {} };
      const free = ([x, y]) => y > r && x > r && x < this.W - r
        && !k.boxes.some(([l, t, rr, bb, text]) => { const pad = r + (text ? 16 : 24); return x > l - pad && x < rr + pad && y > t - pad && y < bb + pad; });
      const c = k.by[r];
      if (c) {
        if (c.d == null) { const [x, y] = this.arc(p); return [x, y, r > 36 ? 0.35 : 0]; }   // (hidden / faint until the next measurement)
        const q = p + c.d, xy = q >= 0 && q <= 1 && this.arc(q);
        if (xy && free(xy)) return [xy[0], xy[1], 1];
      }
      for (let i = 0; i <= 200; i++) for (const d of i ? [i * 0.005, -i * 0.005] : [0]) {
        const q = p + d; if (q < 0 || q > 1) continue;
        const xy = this.arc(q); if (free(xy)) { k.by[r] = { d }; return [xy[0], xy[1], 1]; }
      }
      k.by[r] = { d: null };
      const [x, y] = this.arc(p); return [x, y, r > 36 ? 0.35 : 0];
    }
    // the boxes the sun / moon keep clear of: [left, top, right, bottom, text?] (text: the clock's lines, by their text)
    avoidBoxes() {
      const boxes = [];
      this.measured = (this.measured || 0) + 1;   // (how often the page was measured: the bench / headless checks read it)
      try {
        for (const el of document.querySelectorAll(Sky.AVOID)) {
          const text = el.matches(Sky.AVOID_TEXT);
          let b;
          if (text) { const rg = document.createRange(); rg.selectNodeContents(el); b = rg.getBoundingClientRect(); }
          else b = el.getBoundingClientRect();
          if (b.width && b.height) boxes.push([b.left, b.top, b.right, b.bottom, text]);
        }
      } catch { /* (no page: as drawn) */ }
      return boxes;
    }
    // which crossing is nearer (sunrise = am) and how many minutes from it (negative = before); the demo's 15 s day
    // stands for 12 hours
    sunMinutes(tod) {
      if (this.mode === "demo") {
        const a = tod.p * 720, b = (tod.p - 1) * 720;   // from the start / to the end of this day or night
        return tod.day ? (a <= -b ? { am: true, mins: a } : { am: false, mins: b }) : (a <= -b ? { am: false, mins: a } : { am: true, mins: b });
      }
      const d = new Date(), day = (h) => new Date(d.toDateString() + " " + h);
      const rise = this.sunrise ? new Date(d.toDateString() + " " + new Date(this.sunrise).toTimeString().slice(0, 8)) : day("07:45");
      const set = this.sunset ? new Date(d.toDateString() + " " + new Date(this.sunset).toTimeString().slice(0, 8)) : day("18:30");
      if (d < rise) return { am: true, mins: (d - rise) / 60000 };
      if (d > set) return { am: false, mins: (d - set) / 60000 };
      const r = (d - rise) / 60000, s = (d - set) / 60000;
      return r <= -s ? { am: true, mins: r } : { am: false, mins: s };
    }

    // ---------- effect selection ----------
    // id = an Open-Meteo weather code (number) or "leaves" / "none"; an unknown id shows the plain sky
    setCondition(id) {
      this.kick();
      const c = BY_ID.get(String(id)) || BY_ID.get("none");
      this.cond = c;
      const W = this.W, H = this.H, n = (k) => c[k] || 0;
      this.rain = []; this.flakes = []; this.grains = []; this.hail = []; this.leaves = []; this.drops = []; this.splashes = [];
      this.sparkles = []; this.dust = []; this.clouds = []; this.fogBands = null; this.gusts = null;
      this.boltSegs = null; this.flash = 0; this.nextBolt = 0; this.shooting = null;
      this.gloom = c.gloom || 0;
      if (c.clouds) this.makeClouds(c.clouds[1], c.clouds[0]);
      this.deck = null;
      if (c.sky) this.makeStorm(c.sky[0], c.sky[1]);
      for (let i = 0; i < n("rain"); i++) this.rain.push(this.streak(true, false));
      for (let i = 0; i < n("drizzle"); i++) this.rain.push(this.streak(true, true));
      for (let i = 0; i < n("glass"); i++) this.drops.push(this.glassDrop(true));
      for (let i = 0; i < n("snow"); i++) this.flakes.push(this.flake(true, i < n("big")));
      for (let i = 0; i < n("grains"); i++) this.grains.push(this.grain(true));
      for (let i = 0; i < n("hail"); i++) this.hail.push(this.hailStone(true));
      for (let i = 0; i < n("leaves"); i++) this.leaves.push(this.leaf(true));
      if (c.leaves) this.gusts = [];
      for (let i = 0; i < n("sparkle"); i++) this.sparkles.push({ x: rand(0, W), y: rand(0, H), r: rand(0.8, 2.2), tw: rand(0, 6.3), v: rand(4, 14) });
      if (c.lens) for (let i = 0; i < 45; i++) this.dust.push({ x: rand(0, W), y: rand(0, H), r: rand(0.8, 2.6), vx: rand(-6, 6), vy: rand(-4, 4), tw: rand(0, 6.3) });
      // (fog drifts across the sky and the horizon behind the cards — not over the bottom middle)
      if (c.fog) this.fogBands = Array.from({ length: c.fog === 2 ? 7 : 5 }, (_, i) => ({
        sprite: bandSprite(1400, 260, [225, 215, 245]), x: rand(-W, W), y: H * (0.3 + i * (c.fog === 2 ? 0.055 : 0.07)), v: rand(6, 16) * (Math.random() < 0.5 ? 1 : 0.7) }));
      if (!c.frost) this.frostImg = null;
      else if (!this.frostImg || this.frostImg.width !== W || this.frostImg.height !== H) this.frostImg = frostSprite(W, H);
      // showers start at the current strength, not all at once
      if (c.showers) { const a = this.burst(performance.now() / 1000); for (const p of [...this.rain, ...this.flakes]) p.on = Math.random() < a; }
    }

    makeClouds(n, kind) {
      const tone = kind === "C" ? [120, 110, 150] : [235, 230, 250];
      for (let i = 0; i < n; i++) {
        const w = kind === "B" ? rand(900, 1500) : rand(420, 760), h = kind === "B" ? rand(140, 220) : w * rand(0.4, 0.55);
        this.clouds.push({ sprite: kind === "B" ? bandSprite(w, h, tone) : cloudSprite(w, h, tone), x: rand(-w, this.W), y: rand(this.H * 0.02, this.H * (kind === "C" ? 0.32 : 0.4)),
          v: rand(8, 22) * (kind === "C" ? 2 : 1), a: kind === "A" ? rand(0.35, 0.6) : kind === "B" ? rand(0.3, 0.5) : rand(0.6, 0.85) });
      }
    }
    // rain / snow / storm clouds: a ceiling of grey across the top of the sky, long dark bands, and heavy puffy clouds,
    // more and darker the heavier it is; some at the sun's height so they drift across it
    makeStorm(cover, dark) {
      const light = [228, 226, 238], storm = [52, 54, 66], W = this.W, H = this.H;
      const tone = (k) => mix(light, storm, Math.min(1, dark * k));
      this.deck = { a: 0.2 + cover * 0.45, tone: tone(0.95) };
      for (let i = 0; i < Math.round(2 + cover * 5); i++) {
        const w = rand(1000, 1700), h = rand(170, 260);
        this.clouds.push({ sprite: bandSprite(w, h, tone(0.9)), x: rand(-w, W), y: rand(H * 0.0, H * 0.3), v: rand(8, 18) * (1 + dark), a: rand(0.45, 0.7) * (0.6 + cover * 0.5) });
      }
      for (let i = 0; i < Math.round(2 + cover * 9); i++) {
        const w = rand(460, 860) * (0.9 + cover * 0.4), h = w * rand(0.42, 0.58);
        // (lighter tops, darker bellies: the shape shows against the grey ceiling)
        const sp = cloudSprite(Math.round(w), Math.round(h), tone(rand(0.75, 1.05))), sg = sp.getContext("2d"), belly = sg.createLinearGradient(0, h * 0.35, 0, h * 0.75);
        belly.addColorStop(0, rgb(storm, 0)); belly.addColorStop(1, rgb(storm, 0.25 + dark * 0.5));
        sg.filter = "none"; sg.globalCompositeOperation = "source-atop"; sg.fillStyle = belly; sg.fillRect(0, 0, sp.width, sp.height);
        this.clouds.push({ sprite: sp, x: rand(-w, W), y: rand(H * 0.0, H * 0.36),
          v: rand(10, 24) * (1 + dark), a: rand(0.55, 0.9) * (0.65 + cover * 0.4) });
      }
    }
    windPx() { return this.wind * 9 * (this.cond.slant || 1); } // horizontal px/s per mph-ish
    // showers come and go: 1 = full, down to 0.15 between bursts (two slow waves, so it never repeats exactly)
    burst(t) {
      if (!this.cond.showers) return 1;
      return clamp(0.55 + 0.6 * Math.sin(t * 0.16) + 0.25 * Math.sin(t * 0.41 + 1), 0.15, 1);
    }
    // a rain streak (drizzle: short, thin, slow). "on" = drawn this time down (showers switch some off between bursts)
    streak(any, drizzle) {
      const hv = !!this.cond.heavy && !drizzle, y = any ? rand(-this.H, this.H) : rand(-120, -10);
      return drizzle ? { dz: true, x: rand(-200, this.W + 200), y, l: rand(5, 11), v: rand(380, 620), a: rand(0.14, 0.32), on: true }
        : { x: rand(-200, this.W + 200), y, l: rand(14, hv ? 34 : 26), v: rand(900, hv ? 1600 : 1250), a: rand(0.15, hv ? 0.45 : 0.35), on: true };
    }
    glassDrop(any) { return { x: rand(0, this.W), y: any ? rand(0, this.H) : rand(-20, this.H * 0.6), r: rand(3, 11), slide: 0, v: 0, trail: [] }; }
    flake(any, big) {
      const hv = !!this.cond.heavy, r = big ? rand(6, 16) : rand(1.2, 3.6);
      return { x: rand(-200, this.W + 200), y: any ? rand(-this.H, this.H) : rand(-60, -5), r, big,
        v: big ? rand(25, 55) : hv ? rand(90, 190) : rand(45, 110), sway: rand(0, 6.3), a: big ? rand(0.2, 0.5) : rand(0.5, 0.95), sprite: big ? softFlake(r) : null, on: true };
    }
    // snow grains: tiny hard white pellets, falling fast and almost straight
    grain(any) { return { x: rand(-100, this.W + 100), y: any ? rand(-this.H, this.H) : rand(-40, -5), r: rand(0.8, 1.7), v: rand(380, 650), a: rand(0.6, 0.95) }; }
    // hail: falls fast, bounces once or twice near the bottom of the screen
    hailStone(any) { const r = rand(2, 4.5); return { x: rand(-100, this.W + 100), y: any ? rand(-this.H, this.H * 0.8) : rand(-80, -10), r, sprite: hailSprite(r), vy: rand(850, 1250), vx: 0, hops: 0, ground: this.H - rand(4, 90) }; }
    leaf(any) {
      const colors = ["#d9480f", "#f59f00", "#e8590c", "#c92a2a", "#fab005", "#a0522d"];
      return { x: any ? rand(-this.W, this.W) : rand(-300, -40), y: rand(-50, this.H * 0.9), s: rand(13, 26), rot: rand(0, 6.3), vr: rand(-3, 3), flip: rand(0, 6.3),
        vf: rand(2, 6), vx: rand(0.6, 1.4), vy: rand(15, 60), c: colors[(Math.random() * colors.length) | 0] };
    }

    // ---------- drawing ----------
    // the next frame: with every frame (requestAnimationFrame) — or, when the device asks for less motion, only once a
    // minute (v2.7.2: the loop itself, not only the drawing; a resize / a new look / the setting changing kicks it)
    // (one loop only: a frame already on its way isn't asked for twice)
    schedule(now) {
      if (this.pending) return;
      this.pending = true;
      const go = () => { this.slow = null; requestAnimationFrame((t) => { this.pending = false; this.frame(t); }); };
      if (now || !this.reduce) go(); else this.slow = setTimeout(go, 60000);
    }
    next() { this.schedule(false); }
    // a change to show at once (a resize, a new look or weather; less motion switched off): the minute's wait cut short
    kick(any) {
      if (!any && !this.reduce) return;
      if (this.slow) { clearTimeout(this.slow); this.slow = null; this.pending = false; }
      this.lastSky = 0; this.schedule(true);
    }
    frame(now) {
      // paused (screensaver up / screen off, see App "animation gate"): draw nothing, just keep the loop alive
      // hold: a full-screen view covers the sky (Music) — don't spend the panel's GPU on it meanwhile
      // camHold: the Cameras page or a full-screen camera (video needs the GPU); the effects are cleared, so no frozen
      // raindrops show between the camera tiles
      if (this.camHold && this.fxDrawn) { this.gf.clearRect(0, 0, this.W, this.H); this.fxDrawn = false; }
      if (this.paused || ((this.hold || this.camHold) && !this.preview)) {
        // (the Cameras page: the sky is drawn once more for that page — the sun / moon clear of its tabs — then held)
        if (this.camHold && !this.paused && !this.noSky && !this.heldSky) { this.avoid = null; this.drawSky(this.clock(now), now / 1000, 0); this.heldSky = true; }
        this.last = now; this.next(); return;
      }
      this.heldSky = false;
      // the owner's own background without a sky (Manager → Look & layout → animated sky off): no sky layer at all
      if (this.noSky && !this.skyCleared) { this.gs.clearRect(0, 0, this.W, this.H); this.skyCleared = true; }
      if (!this.noSky) this.skyCleared = false;
      // (no sky layer: a storm still flashes — its timer normally runs while the sky is drawn)
      if (this.noSky && this.cond.thunder && now / 1000 > this.nextBolt) { this.nextBolt = now / 1000 + rand(2.5, 6); this.flash = 1; }
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      const tod = this.clock(now); this.tod = tod;
      // (v2.7.2) a light sky behind the page — day, the hour around sunrise / sunset, or none behind the owner's picture
      // (unknown: taken as light): <html class="sky-light">, and Settings makes the cards more opaque (St.skyLight)
      if (now - (this.lightAt || 0) > 5000) {
        this.lightAt = now;
        const light = !!this.noSky || tod.day || Math.abs(this.sunMinutes(tod).mins) < 60;
        if (light !== this.light) {
          this.light = light;
          document.documentElement.classList.toggle("sky-light", light);
          if (window.Settings && Settings.skyLight) Settings.skyLight(light);
        }
      }
      // (the device asks for less motion — prefers-reduced-motion: drawn like the "Still" sky, once a minute, and no
      // effects layer: no falling rain or snow, no drifting clouds or dust, no lightning flashes)
      const skyFps = this.reduce ? Math.min(this.skyFps, 1 / 60) : this.skyFps;
      if (!this.noSky && now - this.lastSky >= 1000 / skyFps - 2) {
        this.drawSky(tod, now / 1000, Math.min(0.5, (now - (this.lastSky || now)) / 1000));
        this.lastSky = now;
      }
      // the sun's lens glow + dust drift slowly: 15 fps is plenty there (it cost ~65 ms a frame at 30 on the panel)
      const fxFps = this.cond.lens ? Math.min(15, this.fxFps) : this.fxFps;
      if (this.reduce) { if (this.fxDrawn) { this.gf.clearRect(0, 0, this.W, this.H); this.fxDrawn = false; } }
      else if (now - this.lastFx >= 1000 / fxFps - 2) {
        this.drawFx(tod, now / 1000, Math.min(0.1, (now - (this.lastFx || now)) / 1000));
        this.lastFx = now;
      }
      this.next();
    }

    drawSky(tod, t, dt) {
      const g = this.gs, W = this.W, H = this.H;
      const light = Math.sin(Math.PI * tod.p), P = this.pal || SKY, sm = this.sunMinutes(tod);
      let cols = skyAt(P, sm.am, sm.mins);
      if (this.gloom) cols = cols.map((c, i) => mix(c, tod.day ? P.gloom[i] : mix(P.night[i], P.gloom[i], 0.25), this.gloom * 0.8));
      const gr = g.createLinearGradient(0, 0, 0, this.horizon);
      gr.addColorStop(0, rgb(cols[0])); gr.addColorStop(0.55, rgb(cols[1])); gr.addColorStop(1, rgb(cols[2]));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // around sunrise / sunset: a warm glow low in the sky on the sun's side (east = left, west = right)
      const warm = (1 - smooth(0, 75, Math.abs(sm.mins))) * (1 - this.gloom) * (this.cond.sky ? 1 - this.cond.sky[0] * 0.7 : 1);
      if (warm > 0.02) {
        const sx = sm.am ? W * 0.08 : W * 0.92, wc = sm.am ? WARM.rise : WARM.set, rg = g.createRadialGradient(sx, this.horizon, 0, sx, this.horizon, W * 0.6);
        rg.addColorStop(0, rgb(wc, 0.42 * warm)); rg.addColorStop(0.45, rgb(wc, 0.14 * warm)); rg.addColorStop(1, rgb(wc, 0));
        g.fillStyle = rg; g.fillRect(0, 0, W, this.horizon);
      }

      // stars (night, fading in after dusk)
      const starA = tod.day ? 0 : smooth(0.02, 0.18, Math.min(tod.p, 1 - tod.p)) * (1 - this.gloom);
      if (starA > 0.01) for (const s of this.stars) {
        g.fillStyle = `rgba(255,255,255,${starA * (0.45 + 0.55 * Math.sin(t * 2 + s.tw) ** 2)})`;
        g.beginPath(); g.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); g.fill();
      }
      if ((this.cond.id === 0 || this.cond.id === 1) && !tod.day) this.shootingStar(g, t, dt, starA);

      // sun or moon on the east→west arc
      const [x, y, seen] = this.place(tod.p, tod.day ? 38 : 34);
      const veil = (1 - this.gloom * 0.85) * (this.cond.sky ? 1 - this.cond.sky[0] * 0.55 : 1) * seen;
      if (tod.day) this.drawSun(g, x, y, veil); else this.drawMoon(g, x, y, 34, veil);

      // the cloud ceiling (rain, snow, storms): grey from the top, thinning towards the horizon
      if (this.deck) {
        const d = this.deck, gr = g.createLinearGradient(0, 0, 0, this.horizon);
        gr.addColorStop(0, rgb(d.tone, d.a * (tod.day ? 1 : 0.6))); gr.addColorStop(0.55, rgb(d.tone, d.a * 0.55 * (tod.day ? 1 : 0.6))); gr.addColorStop(1, rgb(d.tone, 0));
        g.fillStyle = gr; g.fillRect(0, 0, W, this.horizon);
      }
      // clouds
      for (const c of this.clouds) {
        c.x += (c.v + this.wind * 2.2) * dt;
        if (c.x > W + 50) { c.x = -c.sprite.width - rand(0, 200); c.y = rand(H * 0.02, H * 0.38); }
        g.globalAlpha = c.a * (tod.day ? 1 : 0.55);
        g.drawImage(c.sprite, c.x, c.y);
      }
      g.globalAlpha = 1;

      // fog (in the sky, behind the cards): bands drifting across the sky and the horizon, thick fog veils it
      this.drawFog(g, t, dt, 1 - this.gloom * 0.4);

      // lightning bolt (behind the mountains) — from a cloud when there are clouds
      if (this.cond.thunder) {
        if (t > this.nextBolt) {
          this.nextBolt = t + rand(2.5, 6);
          this.flash = 1;
          const cl = this.clouds.filter((c) => c.x > -c.sprite.width * 0.5 && c.x < W - c.sprite.width * 0.5);
          const from = cl.length ? cl[Math.floor(Math.random() * cl.length)] : null;
          const x0 = from ? from.x + from.sprite.width * rand(0.3, 0.7) : rand(W * 0.15, W * 0.85);
          const y0 = from ? Math.min(from.y + from.sprite.height * 0.62, this.horizon * 0.5) : 0;   // (always above the horizon)
          if (Math.random() < 0.7) this.boltSegs = { segs: bolt(x0, y0, Math.max(this.horizon * 0.35, this.horizon - y0) * rand(0.85, 1.05), Math.PI / 2 + rand(-0.25, 0.25), 0, []), life: 0.35 };
        }
        if (this.boltSegs && this.boltSegs.life > 0) {
          this.boltSegs.life -= dt;
          g.save(); g.shadowColor = "#d8ccff"; g.shadowBlur = 24; g.lineCap = "round";
          for (const [x0, y0, x1, y1, d] of this.boltSegs.segs) {
            g.strokeStyle = `rgba(245,240,255,${(this.boltSegs.life / 0.35) * (1 - d * 0.3)})`; g.lineWidth = 3.2 - d;
            g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
          }
          g.restore();
        }
      }

      // mountains brighten by day
      const b = tod.day ? 1 + 0.35 * smooth(0, 0.4, light) * (1 - this.gloom * 0.6) : 1;
      const filter = `brightness(${b.toFixed(2)}) saturate(${(1 + (b - 1) * 0.3).toFixed(2)})`;
      if (filter !== this.mtnFilter) this.mtn.style.filter = this.mtnFilter = filter; // each change repaints the mountains
    }

    drawFog(g, t, dt, veilF) {
      if (!this.fogBands) return;
      const thick = this.cond.fog === 2, W = this.W;
      for (const b of this.fogBands) {
        b.x += (b.v + this.wind) * dt; if (b.x > W) b.x -= b.sprite.width;
        g.globalAlpha = (thick ? 0.6 + Math.sin(t * 0.3 + b.y) * 0.1 : 0.5) * veilF;
        g.drawImage(b.sprite, b.x, b.y - 130); g.drawImage(b.sprite, b.x - b.sprite.width, b.y - 130);
      }
      g.globalAlpha = 1;
      if (thick) { g.fillStyle = `rgba(220,212,240,${(0.22 + Math.sin(t * 0.25) * 0.04) * veilF})`; g.fillRect(0, 0, W, this.horizon * 1.1); }
    }

    drawSun(g, x, y, veil) {
      const halo = g.createRadialGradient(x, y, 10, x, y, 260);
      halo.addColorStop(0, `rgba(255,236,200,${0.7 * veil})`); halo.addColorStop(0.25, `rgba(255,200,150,${0.25 * veil})`); halo.addColorStop(1, "rgba(255,200,150,0)");
      g.fillStyle = halo; g.beginPath(); g.arc(x, y, 260, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(255,248,230,${0.95 * veil})`; g.beginPath(); g.arc(x, y, 38, 0, Math.PI * 2); g.fill();
    }

    drawMoon(g, x, y, r, veil) {
      const age = moonAge(), f = age / SYNODIC, k = Math.cos(2 * Math.PI * f), waxing = f < 0.5;
      const lit = `rgba(246,240,255,${veil})`, dark = `rgba(70,60,110,${0.55 * veil})`;
      const halo = g.createRadialGradient(x, y, r, x, y, r * 5);
      halo.addColorStop(0, `rgba(210,195,255,${0.35 * moonIllum(age) * veil})`); halo.addColorStop(1, "rgba(210,195,255,0)");
      g.fillStyle = halo; g.beginPath(); g.arc(x, y, r * 5, 0, Math.PI * 2); g.fill();
      g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
      g.fillStyle = dark; g.fillRect(x - r, y - r, 2 * r, 2 * r);
      g.fillStyle = lit; g.beginPath(); g.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !waxing); g.fill(); // lit half (right when waxing)
      g.fillStyle = k > 0 ? dark : lit;                                                            // crescent: cut; gibbous: add
      g.beginPath(); g.ellipse(x, y, Math.abs(k) * r + 0.5, r, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    shootingStar(g, t, dt, a) {
      if (!this.shooting && Math.random() < dt * 0.25) this.shooting = { x: rand(this.W * 0.1, this.W * 0.7), y: rand(20, this.H * 0.3), life: 1 };
      const s = this.shooting; if (!s) return;
      s.life -= dt * 1.4; s.x += 900 * dt; s.y += 300 * dt;
      const gr = g.createLinearGradient(s.x, s.y, s.x - 160, s.y - 53);
      gr.addColorStop(0, `rgba(255,255,255,${a * s.life})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.strokeStyle = gr; g.lineWidth = 2; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - 160, s.y - 53); g.stroke();
      if (s.life <= 0) this.shooting = null;
    }

    drawFx(tod, t, dt) {
      const g = this.gf, W = this.W, H = this.H, wind = this.windPx(), c = this.cond;
      // nothing in front for this condition right now: clear once, then leave the layer alone (no repaint, no composite)
      const busy = this.rain.length || this.flakes.length || this.grains.length || this.hail.length || this.leaves.length || (this.noSky && this.fogBands) ||
        this.sparkles.length || c.frost || c.haze || (c.lens && tod.day) || this.flash > 0 || this.splashes.length;
      if (!busy) { if (this.fxDrawn) { g.clearRect(0, 0, W, H); this.fxDrawn = false; } return; }
      this.fxDrawn = true;
      g.clearRect(0, 0, W, H);
      const amount = this.burst(t); // showers: how much is falling right now
      const veil = this.front ? 0.5 : 1; // in front of the Home cards (App.syncSky): fog / haze / frost / flashes at half, so text stays readable
      if (this.noSky) this.drawFog(g, t, dt, veil * 0.8);   // (no sky layer behind an own picture: the fog goes in front)

      if (this.rain.length) {
        g.lineCap = "round";
        const col = c.ice ? "215,238,255" : "210,220,255", wide = c.heavy ? 1.6 : 1.1, a0 = c.ice ? 0.1 : 0;
        for (const d of this.rain) {
          d.y += d.v * dt; d.x += wind * dt * (d.dz ? 0.7 : 1.4);
          if (d.y > H + 20 || d.x > W + 250) {
            if (c.splash && !d.dz && d.on) this.splash(d.x, H - rand(4, 40));
            Object.assign(d, this.streak(false, d.dz)); d.on = Math.random() < amount;
          }
          if (!d.on) continue;
          const dx = (wind * (d.dz ? 0.7 : 1.4) / d.v) * d.l;
          g.strokeStyle = `rgba(${col},${d.a + a0})`; g.lineWidth = d.dz ? 0.8 : wide;
          g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x - dx, d.y - d.l); g.stroke();
        }
        this.drawSplashes(g, dt);
      }
      if (this.drops.length) this.drawGlass(g, dt);

      if (this.flakes.length) {
        for (const f of this.flakes) {
          f.sway += dt * 1.3; f.y += f.v * dt; f.x += (wind * (c.heavy ? 1.2 : 0.6) + Math.sin(f.sway) * 18) * dt;
          if (f.y > H + 20 || f.x > W + 220) { Object.assign(f, this.flake(false, f.big)); f.on = Math.random() < amount; }
          if (!f.on) continue;
          if (f.sprite) { g.globalAlpha = f.a; g.drawImage(f.sprite, f.x - f.r * 2, f.y - f.r * 2); g.globalAlpha = 1; continue; }
          g.fillStyle = `rgba(255,255,255,${f.a})`; g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill();
        }
      }

      if (this.grains.length) {
        g.fillStyle = "rgba(250,252,255,.85)";
        for (const p of this.grains) {
          p.y += p.v * dt; p.x += (wind * 0.4 + rand(-20, 20)) * dt;
          if (p.y > H + 10) Object.assign(p, this.grain(false));
          g.fillRect(p.x, p.y, p.r * 1.6, p.r * 1.6);
        }
      }

      if (this.hail.length) {
        for (const p of this.hail) {
          if (!p.hops) { p.y += p.vy * dt; p.x += wind * 0.5 * dt; if (p.y >= p.ground) { p.y = p.ground; p.vy = -rand(220, 380); p.vx = rand(-90, 90); p.hops = 1; } }
          else {
            p.vy += 2600 * dt; p.y += p.vy * dt; p.x += p.vx * dt;
            if (p.y >= p.ground) { if (p.hops >= 2) { Object.assign(p, this.hailStone(false)); continue; } p.y = p.ground; p.vy *= -0.35; p.hops++; }
          }
          g.drawImage(p.sprite, p.x - p.sprite.width / 2, p.y - p.sprite.height / 2);
        }
      }

      if (this.leaves.length) {
        for (const l of this.leaves) {
          l.flip += l.vf * dt; l.rot += l.vr * dt;
          const gust = 1 + Math.max(0, Math.sin(t * 0.9)) * 1.8;
          l.x += (wind * l.vx * gust + 40) * dt; l.y += (l.vy + Math.sin(l.flip) * 30) * dt;
          if (l.x > W + 60 || l.y > H + 40) Object.assign(l, this.leaf(false));
          g.save(); g.translate(l.x, l.y); g.rotate(l.rot); g.scale(Math.cos(l.flip), 1);
          g.fillStyle = l.c; g.beginPath(); g.moveTo(0, -l.s); g.quadraticCurveTo(l.s * 0.8, 0, 0, l.s); g.quadraticCurveTo(-l.s * 0.8, 0, 0, -l.s); g.fill();
          g.strokeStyle = "rgba(60,30,10,.5)"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -l.s); g.lineTo(0, l.s + 4); g.stroke();
          g.restore();
        }
        this.drawGusts(g, t, dt, wind);
      }

      if (this.sparkles.length) {
        for (const p of this.sparkles) {
          p.tw += dt * 2.4; p.x += p.v * dt * 0.4; p.y += p.v * dt * 0.15; if (p.x > W) p.x = 0; if (p.y > H) p.y = 0;
          const a = Math.max(0, Math.sin(p.tw)) ** 3;
          if (a < 0.05) continue;
          g.strokeStyle = g.fillStyle = `rgba(240,248,255,${0.9 * a})`; g.lineWidth = 1;
          g.beginPath(); g.moveTo(p.x - p.r * 2.5, p.y); g.lineTo(p.x + p.r * 2.5, p.y); g.moveTo(p.x, p.y - p.r * 2.5); g.lineTo(p.x, p.y + p.r * 2.5); g.stroke();
        }
      }

      if (c.haze) { g.fillStyle = `rgba(235,235,250,${c.haze * veil})`; g.fillRect(0, 0, W, H); }
      if (c.frost && this.frostImg) { g.globalAlpha = c.frost * veil; g.drawImage(this.frostImg, 0, 0, W, H); g.globalAlpha = 1; } // (stretched after a resize)
      if (c.lens && tod.day) this.lensAndDust(g, tod, t, dt);

      if (this.flash > 0) {
        g.fillStyle = `rgba(240,235,255,${this.flash * 0.45 * veil})`; g.fillRect(0, 0, W, H);
        this.flash -= dt * (Math.random() < 0.3 ? 1.5 : 4);
      }
    }

    splash(x, y) { if (this.splashes.length < 160) this.splashes.push({ x, y, life: 0.25 }); }
    drawSplashes(g, dt) {
      g.strokeStyle = this.cond.ice ? "rgba(235,248,255,.7)" : "rgba(220,228,255,.45)"; g.lineWidth = 1;
      this.splashes = this.splashes.filter((s) => (s.life -= dt) > 0);
      for (const s of this.splashes) { const r = (0.25 - s.life) * 40; g.beginPath(); g.ellipse(s.x, s.y, r, r * 0.3, 0, Math.PI, 0); g.stroke(); }
    }

    drawGlass(g, dt) {
      for (const d of this.drops) {
        if (d.r > 6 && Math.random() < dt * 0.4) d.v = rand(60, 200);
        if (d.v) { d.y += d.v * dt; d.v *= 0.985; if (d.v < 8) d.v = 0; if (Math.random() < 0.3) d.trail.push([d.x + rand(-1, 1), d.y - d.r, rand(1, 2.2), 1]); }
        if (d.y > this.H + 20) Object.assign(d, this.glassDrop(false));
        for (const tr of d.trail) { tr[3] -= dt * 0.15; g.fillStyle = `rgba(230,236,255,${0.25 * tr[3]})`; g.beginPath(); g.arc(tr[0], tr[1], tr[2], 0, Math.PI * 2); g.fill(); }
        d.trail = d.trail.filter((tr) => tr[3] > 0).slice(-40);
        const gr = g.createRadialGradient(d.x - d.r * 0.3, d.y - d.r * 0.4, 0.5, d.x, d.y, d.r);
        gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(0.35, "rgba(200,210,255,.12)"); gr.addColorStop(1, "rgba(150,160,220,.28)");
        g.fillStyle = gr; g.beginPath(); g.arc(d.x, d.y, d.r, 0, Math.PI * 2); g.fill();
      }
      if (Math.random() < dt * 6 && this.drops.length < (this.cond.glass || 0) * 1.6) this.drops.push(this.glassDrop(false));
    }

    drawGusts(g, t, dt, wind) {
      if (Math.random() < dt * 3) this.gusts.push({ x: -300, y: rand(this.H * 0.1, this.H * 0.85), len: rand(160, 380), v: rand(900, 1500) + wind * 4, a: rand(0.12, 0.3), ph: rand(0, 6.3) });
      g.lineCap = "round";
      this.gusts = this.gusts.filter((s) => (s.x += s.v * dt) < this.W + 400);
      for (const s of this.gusts) {
        g.strokeStyle = `rgba(255,255,255,${s.a})`; g.lineWidth = 1.6; g.beginPath();
        for (let i = 0; i <= 20; i++) { const px = s.x - (s.len * i) / 20, py = s.y + Math.sin(s.ph + i * 0.35 + t * 3) * 8; i ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.stroke();
      }
    }

    lensAndDust(g, tod, t, dt) {
      const [sx, sy] = this.place(tod.p, 38), cx = this.W / 2, cy = this.H / 2;
      g.save(); g.globalCompositeOperation = "lighter";
      // flares: soft discs pre-drawn once (a new radial gradient per flare per frame was expensive on the panel)
      this.flares ||= FLARES.map(([k, r, c, a]) => {
        const s = document.createElement("canvas"); s.width = s.height = r * 2;
        const sg = s.getContext("2d"), gr = sg.createRadialGradient(r, r, 0, r, r, r);
        gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`); sg.fillStyle = gr; sg.fillRect(0, 0, r * 2, r * 2);
        return { k, r, s };
      });
      for (const { k, r, s } of this.flares) g.drawImage(s, sx + (cx - sx) * k * 1.4 - r, sy + (cy - sy) * k * 1.4 - r);
      for (const m of this.dust) {
        m.x += m.vx * dt; m.y += m.vy * dt; m.tw += dt * 2;
        if (m.x < 0) m.x = this.W; if (m.x > this.W) m.x = 0; if (m.y < 0) m.y = this.H; if (m.y > this.H) m.y = 0;
        const near = 1 - Math.min(1, Math.hypot(m.x - sx, m.y - sy) / (this.W * 0.6));
        g.fillStyle = `rgba(255,240,210,${(0.15 + 0.6 * near) * Math.sin(m.tw) ** 2})`; g.beginPath(); g.arc(m.x, m.y, m.r, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }
  }

  // what the sun and moon keep clear of (Sky.place): the Home page's cards and its clock's lines (those by their text);
  // on a room page its header (the name by its text, the chips, All on / off, the time) and the Cameras page's tabs
  Sky.AVOID = "main.home .col > .part > :not(.clockbox), main.home .clockbox > *, main.home > .gc, "
    + "main:not(.home) header :is(h1, h2, button, [class*=chip], [class*=pill], time), main .room-head > *, main .cam-head button, "
    // (v2.7.2: nor behind the room bar or a room page's cards — it read through their glass as a grey disc over words)
    + "#dock, main:not(.home) .glass";
  Sky.AVOID_TEXT = ".clockbox > *, main:not(.home) header :is(h1, h2), main .room-head > h1";
  Sky.moonAge = moonAge; Sky.moonName = moonName; Sky.moonIllum = moonIllum;
  Sky.CONDITIONS = CONDITIONS; Object.defineProperty(Sky, "CATEGORIES", { get: () => CATEGORIES.map(([k, e, n]) => [k, e, window.T ? T(`fx.cat.${k}`) : n]), configurable: true }); Sky.condition = (id) => BY_ID.get(String(id)) || null;
  Sky.load = (c) => loadOf(typeof c === "object" ? c : BY_ID.get(String(c)));   // 0 = no effect, 1..4
  Sky.loadScore = (c) => loadScore(typeof c === "object" ? c : BY_ID.get(String(c)));
  Sky.LOAD_NAMES = LOAD_NAMES;
  Sky.REAL = REAL;
  Sky.skyAt = (P, am, mins) => skyAt(P, am, mins).map((c) => rgb(c));   // (tests / a preview strip)

  window.Sky = Sky;
})();
