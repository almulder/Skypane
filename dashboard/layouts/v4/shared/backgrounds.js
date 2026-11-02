// Selectable landscapes drawn over the animated sky (sky.js canvas shows through the transparent top).
// window.BACKGROUNDS = [{ id, name }]; window.renderBackground(id) â†’ SVG string to insert INLINE
// (fills use CSS variables from themes.js: --land1..4, --land1b..4b, --water, --water-hi).
(function () {
  const W = 1920, H = 1080;

  function prng(seed) { // mulberry32 â€” deterministic, so the landscape never changes between loads
    return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const f1 = (n) => Math.round(n * 10) / 10;

  // ridge points like scripts/make_background.py: sum of sines + jitter
  function ridgePts(base, amp, rough, seed, step = 16) {
    const r = prng(seed), ph = [0, 1, 2].map(() => r() * Math.PI * 2), pts = [];
    for (let x = 0; x <= W + step; x += step) {
      const y = base - amp * 0.55 * Math.sin(x / 390 + ph[0]) - amp * 0.3 * Math.sin(x / 170 + ph[1]) - amp * 0.15 * Math.sin(x / 61 + ph[2]) + (r() * 2 - 1) * rough;
      pts.push([x, y]);
    }
    return pts;
  }
  const closed = (pts, bottom = H) => `M0,${bottom} L${pts.map(([x, y]) => `${x},${f1(y)}`).join(" L")} L${W},${bottom} Z`;

  // vertical gradients bound to theme variables.
  //   bgl1..4: per-shape (objectBoundingBox) â€” one big shape per layer, like the original mountains
  //   bgu1..4: per-layer (userSpaceOnUse) â€” for layers made of many shapes (mesas, trees, cliffs), so they shade as one
  const U = [[560, 1000], [640, 1060], [740, 1080], [840, 1080]];
  const defs = (extra = "") => `<defs>${[1, 2, 3, 4].map((i) =>
    `<linearGradient id="bgl${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--land${i})"/><stop offset="1" stop-color="var(--land${i}b)"/></linearGradient>
     <linearGradient id="bgu${i}" gradientUnits="userSpaceOnUse" x1="0" y1="${U[i - 1][0]}" x2="0" y2="${U[i - 1][1]}"><stop offset="0" stop-color="var(--land${i})"/><stop offset="1" stop-color="var(--land${i}b)"/></linearGradient>`).join("")}
    <linearGradient id="bgw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--water)" stop-opacity=".85"/><stop offset="1" stop-color="var(--land4b)"/></linearGradient>${extra}</defs>`;
  const svg = (body, extraDefs) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" class="bg-svg">${defs(extraDefs)}${body}</svg>`;

  // a pine: trunk + three tiers, base at (x, y), height h
  function pine(x, y, h) {
    const w = h * 0.36, t = h * 0.08;
    return `M${f1(x - t / 2)},${f1(y)}V${f1(y - t * 1.5)}H${f1(x - w)}L${f1(x - w * 0.55)},${f1(y - h * 0.38)}H${f1(x - w * 0.8)}L${f1(x - w * 0.4)},${f1(y - h * 0.66)}H${f1(x - w * 0.6)}L${f1(x)},${f1(y - h)}L${f1(x + w * 0.6)},${f1(y - h * 0.66)}H${f1(x + w * 0.4)}L${f1(x + w * 0.8)},${f1(y - h * 0.38)}H${f1(x + w * 0.55)}L${f1(x + w)},${f1(y - t * 1.5)}H${f1(x + t / 2)}V${f1(y)}Z`;
  }
  // y of a ridge polyline at x
  const yAt = (pts, x) => { const i = Math.min(pts.length - 2, Math.max(0, Math.floor(x / (pts[1][0] - pts[0][0])))); const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); };

  // the exact round-3 mountains (path data from shared/mountains.svg, made by scripts/make_background.py)
  const MOUNTAIN_PATHS = [
    "M0,1080 L0,647.5 L16,640.9 L32,635.6 L48,628.2 L64,609.6 L80,597.8 L96,596.1 L112,580.1 L128,573.3 L144,554.5 L160,551.3 L176,547.6 L192,536.4 L208,541.5 L224,539.1 L240,528.3 L256,529.2 L272,537.4 L288,544.7 L304,540.9 L320,541.6 L336,546.4 L352,543.3 L368,546.3 L384,548.5 L400,547.9 L416,542.4 L432,539.4 L448,535.9 L464,535.2 L480,529.9 L496,524.1 L512,532.3 L528,528.7 L544,531.2 L560,528.9 L576,543.8 L592,549.3 L608,549.2 L624,562.1 L640,578.4 L656,590.7 L672,606.2 L688,612.9 L704,630.1 L720,639.7 L736,645.6 L752,657.8 L768,668.6 L784,673.8 L800,673.7 L816,677.3 L832,672.0 L848,675.0 L864,681.7 L880,676.9 L896,674.1 L912,679.3 L928,682.5 L944,684.7 L960,684.6 L976,690.1 L992,696.6 L1008,706.3 L1024,710.2 L1040,715.9 L1056,724.0 L1072,725.0 L1088,730.6 L1104,742.7 L1120,748.7 L1136,744.9 L1152,741.6 L1168,736.2 L1184,735.8 L1200,735.8 L1216,726.3 L1232,715.9 L1248,711.8 L1264,696.4 L1280,692.5 L1296,691.4 L1312,681.8 L1328,676.7 L1344,672.4 L1360,675.4 L1376,681.5 L1392,672.7 L1408,685.7 L1424,690.7 L1440,696.4 L1456,699.6 L1472,705.1 L1488,705.6 L1504,709.1 L1520,709.3 L1536,705.4 L1552,714.4 L1568,708.9 L1584,701.6 L1600,701.6 L1616,697.4 L1632,691.9 L1648,688.1 L1664,687.4 L1680,686.6 L1696,685.8 L1712,684.8 L1728,682.1 L1744,688.4 L1760,693.0 L1776,704.2 L1792,714.7 L1808,721.5 L1824,729.0 L1840,736.3 L1856,735.8 L1872,747.8 L1888,749.2 L1904,743.8 L1920,742.7 L1920,1080 Z",
    "M0,1080 L0,786.7 L16,775.7 L32,765.6 L48,753.4 L64,748.9 L80,742.7 L96,737.5 L112,729.5 L128,729.6 L144,727.5 L160,729.8 L176,731.8 L192,730.8 L208,726.1 L224,723.9 L240,720.3 L256,715.4 L272,711.8 L288,711.8 L304,705.2 L320,700.0 L336,698.9 L352,688.9 L368,683.1 L384,674.3 L400,667.3 L416,666.6 L432,662.3 L448,665.1 L464,670.6 L480,669.4 L496,668.1 L512,680.0 L528,684.8 L544,690.7 L560,699.3 L576,704.7 L592,711.6 L608,713.2 L624,724.5 L640,728.3 L656,723.1 L672,730.5 L688,730.5 L704,727.3 L720,726.4 L736,723.8 L752,725.7 L768,719.0 L784,720.2 L800,713.8 L816,718.2 L832,718.5 L848,715.2 L864,718.4 L880,724.9 L896,726.8 L912,728.8 L928,730.7 L944,736.4 L960,744.4 L976,742.7 L992,752.9 L1008,748.1 L1024,754.9 L1040,748.0 L1056,752.2 L1072,746.3 L1088,739.8 L1104,734.8 L1120,730.5 L1136,724.1 L1152,715.8 L1168,709.8 L1184,708.8 L1200,710.1 L1216,705.3 L1232,699.6 L1248,708.3 L1264,710.0 L1280,715.6 L1296,713.3 L1312,724.4 L1328,723.6 L1344,735.7 L1360,737.9 L1376,743.0 L1392,754.4 L1408,750.7 L1424,758.0 L1440,763.5 L1456,758.7 L1472,759.0 L1488,765.8 L1504,761.1 L1520,764.0 L1536,757.4 L1552,761.7 L1568,761.6 L1584,769.5 L1600,767.7 L1616,781.7 L1632,779.0 L1648,793.8 L1664,795.3 L1680,806.9 L1696,822.0 L1712,825.0 L1728,834.4 L1744,847.9 L1760,852.3 L1776,855.1 L1792,869.3 L1808,864.1 L1824,864.5 L1840,867.7 L1856,869.2 L1872,868.1 L1888,858.5 L1904,857.0 L1920,849.9 L1920,1080 Z",
    "M0,1080 L0,819.2 L16,819.8 L32,824.8 L48,837.2 L64,838.3 L80,843.6 L96,854.6 L112,854.6 L128,860.9 L144,860.3 L160,862.8 L176,859.1 L192,862.2 L208,862.5 L224,857.5 L240,856.6 L256,853.2 L272,845.5 L288,848.6 L304,845.2 L320,841.5 L336,838.7 L352,845.5 L368,843.3 L384,847.0 L400,850.5 L416,851.8 L432,856.3 L448,854.9 L464,860.7 L480,860.0 L496,865.5 L512,865.8 L528,859.5 L544,858.9 L560,857.9 L576,861.5 L592,854.4 L608,852.7 L624,846.8 L640,845.3 L656,841.6 L672,839.2 L688,839.9 L704,839.6 L720,843.1 L736,843.3 L752,848.5 L768,852.0 L784,858.1 L800,861.3 L816,863.3 L832,875.3 L848,882.4 L864,887.9 L880,890.7 L896,896.6 L912,896.6 L928,904.8 L944,905.1 L960,904.4 L976,903.6 L992,910.5 L1008,911.8 L1024,904.8 L1040,910.9 L1056,908.5 L1072,907.7 L1088,910.7 L1104,917.2 L1120,921.4 L1136,918.8 L1152,928.0 L1168,928.5 L1184,939.1 L1200,941.2 L1216,950.5 L1232,955.6 L1248,955.4 L1264,961.9 L1280,957.9 L1296,956.3 L1312,959.5 L1328,952.8 L1344,950.8 L1360,948.2 L1376,944.8 L1392,935.7 L1408,929.0 L1424,929.8 L1440,919.8 L1456,919.8 L1472,914.8 L1488,906.8 L1504,904.4 L1520,902.6 L1536,901.9 L1552,900.5 L1568,899.5 L1584,899.5 L1600,901.5 L1616,897.3 L1632,895.4 L1648,895.9 L1664,889.5 L1680,886.7 L1696,887.9 L1712,879.4 L1728,874.1 L1744,863.8 L1760,860.7 L1776,855.8 L1792,845.3 L1808,844.5 L1824,839.8 L1840,831.2 L1856,832.9 L1872,829.8 L1888,830.9 L1904,828.7 L1920,833.1 L1920,1080 Z",
    "M0,1080 L0,928.2 L16,930.8 L32,935.0 L48,935.6 L64,936.8 L80,934.9 L96,937.9 L112,937.3 L128,937.2 L144,936.9 L160,937.3 L176,940.9 L192,939.4 L208,938.3 L224,937.1 L240,932.5 L256,932.5 L272,934.1 L288,935.0 L304,936.7 L320,938.5 L336,936.1 L352,942.3 L368,946.5 L384,949.9 L400,952.7 L416,959.6 L432,962.4 L448,972.6 L464,977.1 L480,979.7 L496,982.1 L512,989.1 L528,989.8 L544,993.6 L560,994.8 L576,993.5 L592,993.2 L608,994.2 L624,992.9 L640,991.0 L656,991.6 L672,994.6 L688,990.3 L704,991.1 L720,995.8 L736,995.3 L752,998.8 L768,1000.8 L784,1002.6 L800,1009.1 L816,1006.8 L832,1010.4 L848,1011.0 L864,1015.0 L880,1013.6 L896,1014.2 L912,1015.9 L928,1012.1 L944,1011.6 L960,1011.2 L976,1003.5 L992,1000.2 L1008,998.1 L1024,998.2 L1040,994.5 L1056,989.9 L1072,988.6 L1088,986.5 L1104,987.7 L1120,985.3 L1136,990.0 L1152,992.6 L1168,994.7 L1184,995.5 L1200,999.1 L1216,995.7 L1232,999.4 L1248,1005.3 L1264,1005.6 L1280,1004.3 L1296,1007.9 L1312,1005.9 L1328,1006.5 L1344,1002.4 L1360,1000.5 L1376,1000.6 L1392,997.4 L1408,997.6 L1424,1000.1 L1440,995.7 L1456,993.7 L1472,994.4 L1488,996.2 L1504,1001.6 L1520,1001.2 L1536,1003.3 L1552,1004.9 L1568,1013.1 L1584,1012.7 L1600,1014.0 L1616,1015.3 L1632,1017.0 L1648,1018.7 L1664,1022.1 L1680,1018.4 L1696,1016.5 L1712,1017.3 L1728,1013.2 L1744,1014.5 L1760,1005.8 L1776,1004.5 L1792,1002.1 L1808,996.2 L1824,996.2 L1840,990.1 L1856,986.0 L1872,984.8 L1888,980.8 L1904,981.9 L1920,979.9 L1920,1080 Z"
  ];

  const R = {
    mountains() {
      return svg(MOUNTAIN_PATHS.map((d, i) => `<path d="${d}" fill="url(#bgl${i + 1})"/>`).join(""));
    },

    lake() {
      const shore = 770, far = ridgePts(650, 120, 5, 11), mid = ridgePts(720, 60, 4, 12);
      const r = prng(13);
      const mirror = (pts) => `M0,${shore} L${pts.map(([x, y]) => `${x},${f1(2 * shore - Math.min(y, shore))}`).join(" L")} L${W},${shore} Z`;
      let trees = "";
      for (const [x0, x1] of [[-20, 520], [1400, 1960]]) for (let x = x0; x < x1; x += 14 + r() * 22) {
        const edge = x < W / 2 ? (x1 - x) / (x1 - x0) : (x - x0) / (x1 - x0); // taller towards the screen edges
        trees += pine(x, shore + 8 + r() * 30, 60 + edge * 170 + r() * 50);
      }
      const ripples = Array.from({ length: 9 }, (_, i) => { const y = shore + 30 + i * 30 + r() * 12, x = 300 + r() * 1100, w = 120 + r() * 380;
        return `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="2" rx="1" fill="var(--water-hi)" opacity="${f1(0.06 + r() * 0.1)}"/>`; }).join("");
      return svg(`<path d="${closed(far, shore)}" fill="url(#bgu1)"/><path d="${closed(mid, shore)}" fill="url(#bgu2)"/>
        <rect x="0" y="${shore}" width="${W}" height="${H - shore}" fill="url(#bgw)"/>
        <g opacity=".28"><path d="${mirror(far)}" fill="var(--land1)"/><path d="${mirror(mid)}" fill="var(--land2)"/></g>
        ${ripples}
        <path d="M0,${shore - 4} H${W} V${shore + 6} H0Z" fill="var(--land3b)" opacity=".7"/>
        <path d="${trees}" fill="url(#bgu4)"/>
        <path d="${closed(ridgePts(1050, 25, 3, 14))}" fill="var(--land4b)"/>`);
    },

    desert() {
      const r = prng(21);
      // flat-topped mesas: trapezoids with a ragged cap rock, sitting on a base line
      // cliff band on top, then a concave talus slope flaring out to the base
      const mesa = (x, w, top, base, cap) => {
        const h = base - top, s = h * (0.45 + r() * 0.2), cliffY = top + cap + h * 0.3;
        let d = `M${f1(x - s)},${base + 6} Q${f1(x - s * 0.45)},${f1(base - h * 0.08)} ${f1(x - 4)},${f1(cliffY)} L${f1(x + 4)},${f1(top + 3)}`;
        for (let px = x + 24; px < x + w - 24; px += 24 + r() * 20) d += ` L${f1(px)},${f1(top + (r() - 0.5) * 7)}`;
        return d + ` L${f1(x + w - 4)},${f1(top + 3)} L${f1(x + w + 4)},${f1(cliffY)} Q${f1(x + w + s * 0.45)},${f1(base - h * 0.08)} ${f1(x + w + s)},${base + 6} Z`;
      };
      const far = [mesa(60, 380, 600, 730, 10), mesa(700, 170, 640, 730, 8), mesa(1180, 120, 655, 730, 6), mesa(1400, 440, 585, 730, 12)].join(" ");
      const mid = [mesa(-120, 260, 670, 810, 10), mesa(520, 120, 700, 810, 8), mesa(960, 200, 680, 810, 10), mesa(1640, 300, 665, 810, 12)].join(" ");
      const ground = ridgePts(860, 30, 3, 22), fore = ridgePts(970, 22, 3, 23);
      let shrubs = "";
      for (let i = 0; i < 26; i++) {
        const x = r() * W, y = yAt(fore, x) + 6 + r() * 40, rr = 8 + r() * 18;
        shrubs += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rr * 1.3)}" ry="${f1(rr)}"/><ellipse cx="${f1(x + rr * 0.8)}" cy="${f1(y + 2)}" rx="${f1(rr * 0.9)}" ry="${f1(rr * 0.75)}"/>`;
      }
      // separate <path>s: overlapping sub-paths with opposite winding would punch holes
      const group = (ds, fill) => `<g fill="${fill}">${ds.split(" Z").filter((s) => s.trim()).map((s) => `<path d="${s.trim()} Z"/>`).join("")}</g>`;
      return svg(`${group(`${far} ${closed(ridgePts(728, 10, 2, 24))}`, "url(#bgu1)")}${group(`${mid} ${closed(ridgePts(806, 14, 2, 25))}`, "url(#bgu2)")}
        <path d="${closed(ground)}" fill="url(#bgu3)"/><path d="${closed(fore)}" fill="url(#bgu4)"/>
        <g fill="var(--land4b)">${shrubs}</g>`);
    },

    forest() {
      // [base, amp, seed, tree height, spacing] far â†’ near; fewer, bigger trees nearer the viewer
      const layers = [[700, 60, 31, 55, 0.55], [790, 55, 32, 85, 0.6], [890, 40, 33, 125, 0.65], [1000, 25, 34, 175, 0.7]];
      return svg(layers.map(([base, amp, seed, th, gap], i) => {
        const pts = ridgePts(base, amp, 2, seed), r = prng(seed + 100);
        let trees = "";
        for (let x = -30; x < W + 30; x += th * gap * (0.6 + r() * 0.9)) {
          if (r() < 0.12) continue; // small clearings
          trees += pine(x, yAt(pts, Math.max(0, Math.min(W, x))) + 10, th * (0.6 + r() * 0.55));
        }
        return `<path d="${closed(pts)} ${trees}" fill="url(#bgl${i + 1})"/>`;
      }).join(""));
    },

    coast() {
      const horizon = 660, r = prng(41);
      let waves = "";
      for (let i = 0; i < 16; i++) {
        const y = horizon + 14 + i * i * 1.55, x0 = r() * W * 0.75, len = 160 + r() * 520, amp = 1.5 + i * 0.35;
        let d = `M${f1(x0)},${f1(y)}`;
        for (let x = 20; x <= len; x += 20) d += ` L${f1(x0 + x)},${f1(y + Math.sin(x / 40 + i) * amp)}`;
        waves += `<path d="${d}" fill="none" stroke="var(--water-hi)" stroke-width="${f1(1 + i * 0.14)}" stroke-linecap="round" opacity="${f1(0.1 + i * 0.012)}"/>`;
      }
      // headland/cliffs on the right: jagged top, steep sea face
      // jagged sea face climbing diagonally from (x0, bottom) to the clifftop, then a rough top to the right edge
      const cliff = (x0, face, top, rough, seed, fill) => {
        const rr = prng(seed), steps = 9;
        let d = `M${x0},${H}`;
        for (let i = 1; i <= steps; i++) {
          const k = i / steps, x = x0 + face * Math.pow(k, 0.7) + (rr() - 0.5) * 22, y = H - (H - top) * k + (rr() - 0.5) * 26;
          d += ` L${f1(x)},${f1(Math.max(top, y))}`;
        }
        let y = top;
        for (let x = x0 + face + 24; x <= W + 30; x += 22 + rr() * 26) { y = Math.max(top - 30, Math.min(top + 50, y + (rr() - 0.5) * rough)); d += ` L${f1(x)},${f1(y)}`; }
        return `<path d="${d} L${W + 30},${H} Z" fill="${fill}"/>`;
      };
      const farIsle = `<path d="M60,${horizon} Q160,${horizon - 34} 260,${horizon - 22} T460,${horizon} Z" fill="url(#bgu1)" opacity=".85"/>`;
      return svg(`<rect x="0" y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#bgw)"/>${farIsle}${waves}
        ${cliff(1180, 260, 560, 30, 42, "url(#bgu2)")}${cliff(1380, 230, 650, 34, 43, "url(#bgu3)")}
        <path d="M0,${H} L0,1010 Q120,960 260,995 T520,1030 L640,${H} Z" fill="url(#bgu4)"/>
        ${cliff(1600, 180, 800, 40, 44, "url(#bgu4)")}`);
    },
    // a city at night: four rows of towers, far → near; windows lit here and there
    city() {
      const r = prng(51), rows = [[640, 200, 60, 140], [720, 260, 70, 170], [820, 300, 80, 200], [930, 200, 110, 220]];
      let body = "", lights = "";
      rows.forEach(([base, maxH, minW, maxW], i) => {
        let d = "", x = -40;
        while (x < W + 40) {
          const w = minW + r() * (maxW - minW), h = maxH * (0.35 + r() * 0.65), top = base - h;
          d += `M${f1(x)},${H}V${f1(top)}`;
          if (r() < 0.25) d += `H${f1(x + w * 0.42)}V${f1(top - 18 - r() * 40)}H${f1(x + w * 0.5)}V${f1(top)}`;   // (a mast)
          d += `H${f1(x + w)}V${H}Z`;
          if (i >= 1) for (let wy = top + 14; wy < base - 8; wy += 22) for (let wx = x + 8; wx < x + w - 10; wx += 16)
            if (r() < 0.16) lights += `<rect x="${f1(wx)}" y="${f1(wy)}" width="7" height="10" rx="1"/>`;
          x += w + r() * 18;
        }
        body += `<path d="${d}" fill="url(#bgu${i + 1})"/>`;
        if (i === 1 || i === 2) { body += `<g fill="var(--water-hi)" opacity="${i === 1 ? 0.35 : 0.5}">${lights}</g>`; lights = ""; }
      });
      return svg(body + `<path d="${closed(ridgePts(1040, 8, 2, 52))}" fill="var(--land4b)"/>`);
    },

    // soft rolling hills, a few round trees and a fence line
    hills() {
      const r = prng(61), layers = [[680, 90, 62], [760, 80, 63], [860, 70, 64], [980, 50, 65]];
      let body = layers.map(([b, a, sd], i) => `<path d="${closed(ridgePts(b, a, 0, sd, 24))}" fill="url(#bgl${i + 1})"/>`).join("");
      const near = ridgePts(860, 70, 0, 64, 24);
      let trees = "";
      for (let i = 0; i < 9; i++) { const x = 120 + r() * (W - 240), y = yAt(near, x), s = 22 + r() * 26;
        trees += `<rect x="${f1(x - 3)}" y="${f1(y - s * 0.9)}" width="6" height="${f1(s * 0.9)}"/><circle cx="${f1(x)}" cy="${f1(y - s * 1.2)}" r="${f1(s * 0.75)}"/>`; }
      const fore = ridgePts(980, 50, 0, 65, 24);
      let fence = "";
      for (let x = 60; x < W; x += 70) { const y = yAt(fore, x); fence += `<rect x="${f1(x)}" y="${f1(y - 34)}" width="5" height="40" rx="2"/>`; }
      const rail = (dy) => `M0,${f1(yAt(fore, 0) - dy)} L${fore.map(([x, y]) => `${x},${f1(y - dy)}`).join(" L")}`;
      return svg(body + `<g fill="url(#bgu3)">${trees}</g><g fill="var(--land4b)" opacity=".8">${fence}</g>
        <path d="${rail(26)}" stroke="var(--land4b)" stroke-width="4" fill="none" opacity=".8"/><path d="${rail(12)}" stroke="var(--land4b)" stroke-width="4" fill="none" opacity=".8"/>`);
    },

    // jagged peaks with snow on their tops, pines below
    peaks() {
      const r = prng(71);
      const jag = (base, n, hMin, hMax, seed) => { const rr = prng(seed), pts = [[0, base]]; const step = W / n;
        for (let i = 0; i <= n; i++) { const x = i * step + (rr() - 0.5) * step * 0.3; pts.push([x, base - hMin - rr() * (hMax - hMin)]); if (i < n) pts.push([x + step / 2, base - rr() * hMin * 0.6]); }
        pts.push([W, base]); return pts; };
      const far = jag(760, 6, 220, 420, 72), mid = jag(840, 8, 150, 280, 73);
      const shape = (pts) => `M0,${H} L${pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" L")} L${W},${H} Z`;
      // snow: a cap under each tip, a quarter of the way down
      const caps = (pts) => pts.slice(1, -1).filter((_, i) => i % 2 === 0).map(([x, y], i, a) => {
        const d = 50 + r() * 50;
        return `M${f1(x)},${f1(y)} L${f1(x + d * 0.8)},${f1(y + d)} L${f1(x + d * 0.35)},${f1(y + d * 0.8)} L${f1(x)},${f1(y + d * 1.05)} L${f1(x - d * 0.4)},${f1(y + d * 0.78)} L${f1(x - d * 0.8)},${f1(y + d)} Z`; }).join(" ");
      let trees = "";
      const ground = ridgePts(950, 30, 2, 74);
      for (let x = -20; x < W + 20; x += 18 + r() * 30) trees += pine(x, yAt(ground, Math.max(0, Math.min(W, x))) + 8, 70 + r() * 90);
      return svg(`<path d="${shape(far)}" fill="url(#bgu1)"/><path d="${caps(far)}" fill="var(--water-hi)" opacity=".75"/>
        <path d="${shape(mid)}" fill="url(#bgu2)"/><path d="${caps(mid)}" fill="var(--water-hi)" opacity=".55"/>
        <path d="${closed(ground)} ${trees}" fill="url(#bgu3)"/><path d="${closed(ridgePts(1040, 14, 2, 75))}" fill="var(--land4b)"/>`);
    },

    // a canyon: from each side a rock wall steps down towards the middle (ledges), a river far below, a far rim behind
    canyon() {
      const r = prng(81);
      // left wall: rim at `top` from the left edge to x0, then ledges stepping down and inwards to the floor
      const wall = (side, x0, top, floor, steps, fill) => {
        const X = (x) => (side < 0 ? x : W - x);
        let d = `M${f1(X(-30))},${H} L${f1(X(-30))},${f1(top)}`, x = x0, y = top;
        for (let i = 0; i < steps; i++) {
          d += ` L${f1(X(x))},${f1(y)}`;
          y += (floor - top) / steps * (0.7 + r() * 0.6);
          x += 8 + r() * 12; d += ` L${f1(X(x))},${f1(Math.min(floor, y))}`;   // (a cliff: nearly straight down)
          x += 30 + r() * 70; d += ` L${f1(X(x))},${f1(Math.min(floor, y + 6))}`;   // (a ledge)
        }
        return `<path d="${d} L${f1(X(x))},${H} Z" fill="${fill}"/>`;
      };
      const strata = (y0, n) => Array.from({ length: n }, (_, i) => `<rect x="0" y="${y0 + i * 38}" width="${W}" height="3" fill="var(--land1)" opacity=".16"/>`).join("");
      return svg(`<path d="${closed(ridgePts(690, 30, 3, 82))}" fill="url(#bgu1)"/>${strata(705, 5)}
        <path d="M820,${H} Q900,960 960,900 Q1020,960 1100,${H} Z" fill="url(#bgw)"/>
        ${wall(-1, 380, 560, 980, 5, "url(#bgu2)")}${wall(1, 380, 590, 980, 5, "url(#bgu2)")}
        ${wall(-1, 160, 760, 1040, 3, "url(#bgu3)")}${wall(1, 180, 790, 1040, 3, "url(#bgu3)")}
        <path d="${closed(ridgePts(1050, 12, 3, 83))}" fill="var(--land4b)"/>`);
    },

    // a tropical beach: calm sea, an island, palms leaning over the sand
    tropical() {
      const horizon = 700, r = prng(91);
      let waves = "";
      for (let i = 0; i < 12; i++) { const y = horizon + 20 + i * i * 2.2, x = r() * W * 0.8, w = 140 + r() * 420;
        waves += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(2 + i * 0.2)}" rx="2" fill="var(--water-hi)" opacity="${f1(0.08 + i * 0.012)}"/>`; }
      const palm = (x, y, h, lean) => {
        const tx = x + lean * h * 0.35, ty = y - h;
        let d = `<path d="M${f1(x - 7)},${f1(y)} Q${f1(x + lean * h * 0.05)},${f1(y - h * 0.5)} ${f1(tx - 3)},${f1(ty)} L${f1(tx + 3)},${f1(ty)} Q${f1(x + lean * h * 0.12)},${f1(y - h * 0.5)} ${f1(x + 7)},${f1(y)} Z"/>`;
        for (const a of [-160, -125, -90, -55, -20, 10, 200]) {
          const rad = (a * Math.PI) / 180, len = h * (0.42 + r() * 0.12), ex = tx + Math.cos(rad) * len, ey = ty + Math.sin(rad) * len * 0.55 + len * 0.18;
          const mx = tx + Math.cos(rad) * len * 0.5, my = ty + Math.sin(rad) * len * 0.5 - 18;
          d += `<path d="M${f1(tx)},${f1(ty)} Q${f1(mx)},${f1(my)} ${f1(ex)},${f1(ey)} Q${f1(mx)},${f1(my + 16)} ${f1(tx)},${f1(ty + 4)} Z"/>`;
        }
        return d;
      };
      const sand = `M0,${H} L0,930 Q480,880 960,930 T1920,920 L1920,${H} Z`;
      return svg(`<rect x="0" y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#bgw)"/>
        <path d="M1240,${horizon} Q1380,${horizon - 60} 1520,${horizon - 40} Q1600,${horizon - 70} 1700,${horizon} Z" fill="url(#bgu1)"/>${waves}
        <path d="${sand}" fill="url(#bgu3)"/><path d="M0,${H} L0,1000 Q600,960 1200,1010 T1920,990 L1920,${H} Z" fill="url(#bgu4)"/>
        <g fill="var(--land4b)">${palm(180, 960, 380, 0.5)}${palm(330, 990, 300, 0.75)}${palm(1720, 950, 360, -0.55)}</g>`);
    },

    // sand dunes: rows of smooth crests (sum of long waves), each with a lit edge
    dunes() {
      const row = (base, amp, seed) => { const rr = prng(seed), ph = [rr() * 6, rr() * 6], pts = [];
        for (let x = 0; x <= W + 40; x += 30) pts.push([x, base - amp * (0.6 * Math.abs(Math.sin(x / 520 + ph[0])) + 0.4 * Math.abs(Math.sin(x / 230 + ph[1])))]);
        return pts; };
      const L = [[700, 110, 101], [790, 130, 102], [890, 150, 103], [1010, 120, 104]];
      return svg(L.map(([b, a, sd], i) => { const pts = row(b, a, sd);
        return `<path d="${closed(pts)}" fill="url(#bgu${i + 1})"/><path d="M${pts.map(([x, y]) => `${x},${f1(y)}`).join(" L")}" fill="none" stroke="var(--water-hi)" stroke-width="${2 + i}" stroke-linejoin="round" opacity="${f1(0.14 + i * 0.05)}"/>`;
      }).join(""));
    },
  };

  window.BACKGROUNDS = [
    { id: "mountains", name: "Mountains" }, { id: "lake", name: "Lake & pines" }, { id: "desert", name: "Desert mesas" },
    { id: "forest", name: "Forest" }, { id: "coast", name: "Coast" }, { id: "city", name: "City at night" },
    { id: "hills", name: "Rolling hills" }, { id: "peaks", name: "Snowy peaks" }, { id: "canyon", name: "Canyon" },
    { id: "tropical", name: "Tropical beach" }, { id: "dunes", name: "Sand dunes" },
  ];
  // "up:<id>" = the owner's own picture (Manager → Pictures → Backgrounds): it covers the screen; with a transparent sky
  // the animated sky shows through (a missing picture falls back to the mountains)
  // the owner's picture that won't load (removed meanwhile): the built-in mountains in its place (acts.js)
  // (window.Acts: the Manager loads this file without acts.js — its scene thumbnails; there a missing picture stays empty)
  if (window.Acts) Acts.add({ "bg.fallback": (el) => { el.outerHTML = window.renderBackground("mountains"); } });
  window.renderBackground = (id) => {
    const m = /^up:([0-9a-f]{16})$/.exec(typeof id === "string" ? id : "");
    if (m) return `<img class="bg-own" src="/pictures/${m[1]}" alt="" draggable="false"${window.Acts ? Acts.attr("error", "bg.fallback") : ""}>`;
    return (R[id] || R.mountains)();
  };

})();
