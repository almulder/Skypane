// (v3.0.4) The "Bins / Trash" card (replaces Bin day; the format: service/layouts.py "trash"; the design:
// mockups/prototypes/garage-bins-timers.html, the Bins / Trash tab). Several bins on one card, each with its own pickup
// schedule (weekly · every N weeks from a known pickup · even / odd weeks · the nth weekday of the month · seasonal) and
// what a holiday does to it (the house's holidays: service/bins.py, the admin's list). Each bin is drawn a little fuller
// every day until pickup day: fill = days since the last pickup ÷ days between the two (pickup day 100 %, emptied 0 %).
// The card's line: "Tomorrow is trash day" / "Trash day today" / the next pickup.
// From the reminder time (the evening before, or on pickup day) each due bin is a level-1 Reminder in the notification
// list (hubalerts.js HA.own — never a Hubitat alert), with its button: Taken out / Emptied / At the curb. Pressing it
// marks that bin for that pickup on every panel (/api/bins; a bin is known by its name). The alarm (a time, optional):
// a chime and "Don't forget the bins" when a due bin isn't marked yet, once per pickup.
//
// Animated styles: the bin fills day by day, flies when it's full, it shakes the evening before, hops on pickup morning
// and sparkles once emptied. Inspired by skyrotter's Poubelle Card — https://github.com/skyrotter/ha-poubelle-card,
// MIT License, Copyright (c) 2026 Nicolas (licence text: dashboard/vendor/anim/ha-poubelle-card/LICENSE). What was
// changed: our own drawings (redrawn in SVG for the mockup: a wheelie bin, a recycling bin, an inside bin, a bag, bulky
// items), its 10 colors and its states kept; the motion is CSS keyframes on transform / opacity only (theme.css
// ".tb-…"), none with the card's "Calm" or a device asking for reduced motion; no Home Assistant parts.
(function () {
  const H = Home, esc = (s) => UI.esc(s);
  const DESIGN = window.PANEL_DESIGN === true;
  const DAY = 864e5, TONIGHT = 16 * 60;
  // the 10 colors (as the Poubelle Card has them); "lid only" puts the color on the lid of a neutral body
  const COLORS = { gray: "#7a808c", black: "#2e3038", yellow: "#f2c230", green: "#3f9460", blue: "#3373d6", brown: "#8f5d3d", red: "#d64545",
    purple: "#9b5bd6", burgundy: "#8c2740", lime: "#8cc63f" };
  const NEUTRAL = { wheelie: "#5b616d", recycle: "#5b616d", inside: "#c9ced6" };
  const BTN = { out: "bn.btn.out", emptied: "bn.btn.emptied", curb: "bn.btn.curb" };
  const B = { doc: { holidays: [], out: {} } };

  // ---------- days: whole days counted from 1970-01-01 (UTC arithmetic, so a clock change never moves a day) ----------
  const dn = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
  const ud = (n) => new Date(n * DAY);
  const wd = (n) => ud(n).getUTCDay();
  const iso = (n) => ud(n).toISOString().slice(0, 10);
  const fromIso = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY) : null; };
  const local = (n) => { const d = ud(n); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };   // (for T.weekday / T.dayShort)
  const monday = (n) => n - ((wd(n) + 6) % 7);
  const isoWeek = (n) => { const th = n + 3 - ((wd(n) + 6) % 7), y = ud(th).getUTCFullYear(); return Math.floor((th - Math.round(Date.UTC(y, 0, 1) / DAY)) / 7) + 1; };
  const mins = (s) => { const m = /^(\d{2}):(\d{2})$/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : 0; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- the schedule ----------
  // a pickup on day n before any holiday moves it
  function raw(s, n) {
    const w = wd(n), days = Array.isArray(s.days) && s.days.length ? s.days : [1];
    if (s.k === "monthly") {
      if (w !== days[0]) return false;
      return +s.nth === 5 ? ud(n + 7).getUTCMonth() !== ud(n).getUTCMonth() : Math.ceil(ud(n).getUTCDate() / 7) === (+s.nth || 1);
    }
    if (!days.includes(w)) return false;
    if (s.k === "every") {
      const f = fromIso(s.from), e = Math.max(1, +s.every || 1);
      if (f == null) return true;
      const wk = Math.round((monday(n) - monday(f)) / 7);
      return ((wk % e) + e) % e === 0;
    }
    if (s.k === "evenodd") return (isoWeek(n) % 2 === 0) === (s.parity !== "odd");
    if (s.k === "seasonal") return Array.isArray(s.months) && s.months.includes(ud(n).getUTCMonth());
    return true;
  }
  // every pickup from day a to z after the holiday rule: {L: [{d: the day, o: the planned day, why: the holiday or null}],
  // X: canceled ones}. hol: Set of holiday day numbers.
  function picks(b, a, z, hol) {
    const s = b.sch || {}, L = [], X = [], isHol = (n) => hol.has(n), wknd = (n) => wd(n) === 0 || wd(n) === 6;
    const weekHol = (n) => { for (let x = monday(n); x <= n; x++) if (isHol(x)) return x; return null; };
    for (let d = a - 50; d <= z + 50; d++) {
      if (!raw(s, d)) continue;
      let p = d, why = null;
      if (b.hol === "shift_rest") { const h = weekHol(d); if (h !== null) { p = d + 1; why = h; } }
      else if (b.hol && b.hol !== "none" && isHol(d)) {
        why = d;
        if (b.hol === "cancel") { X.push({ o: d, why }); continue; }
        if (b.hol === "next_day") p = d + 1;
        if (b.hol === "next_work_day") { p = d + 1; while (isHol(p) || wknd(p)) p++; }
        if (b.hol === "shift_week") { p = d + 7; while (isHol(p)) p += 7; }
      }
      L.push({ d: p, o: d, why });
    }
    L.sort((x, y) => x.d - y.d);
    return { L, X };
  }
  const holSet = (list) => new Set((list || []).map((h) => fromIso(h && h.d)).filter((n) => n != null));
  // a bin on day n: its next pickup (pk), the one before (q), how full it is (0–1), what was canceled before it
  function info(b, n, hol) {
    const { L, X } = picks(b, n - 70, n + 400, hol);
    const pk = L.find((p) => p.d >= n) || { d: n + 999, o: n + 999, why: null };
    let q = null; for (const p of L) { if (p.d < n) q = p.d; else break; }
    if (q === null) q = n - 7;
    const fill = pk.d === n ? 1 : clamp((n - q) / (pk.d - q), 0, 1);
    return { pk, fill, cx: X.find((x) => x.o >= n && x.o < pk.d) || null };
  }
  const keyOf = (b, P) => `${String(b.name || "").trim().toLowerCase()}@${iso(P)}`;
  // normal · full · tonight · pickup · emptied (minute m of day n)
  function state(b, n, m, i, marked) {
    const P = i.pk.d, emp = marked && b.btn === "emptied";
    if (P === n) return m >= mins(b.truck || "07:00") || emp ? "emptied" : "pickup";
    if (P === n + 1) return emp ? "emptied" : m >= TONIGHT ? "tonight" : i.fill >= 0.6 ? "full" : "normal";
    return i.fill >= 0.6 ? "full" : "normal";
  }
  // the reminder (and the alarm) for a bin: from when, in minutes since day 0
  const remStart = (o, P) => (P - ((o.rem || {}).when === "same" ? 0 : 1)) * 1440 + mins((o.rem || {}).at || "19:30");
  const alarmAt = (o, P) => (P - ((o.rem || {}).when === "same" ? 0 : 1)) * 1440 + mins(o.alarm);

  // ---------- the drawings (our own, after the Poubelle Card's idea; viewBox 100 × 120) ----------
  function shade(hex, a) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, bl = n & 255;
    const t = a < 0 ? 0 : 255, p = Math.abs(a);
    r = Math.round(r + (t - r) * p); g = Math.round(g + (t - g) * p); bl = Math.round(bl + (t - bl) * p);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
  const hash = (s) => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };
  function cols(b) {
    const c = COLORS[b.color] || COLORS.gray, full = !b.lid || !NEUTRAL[b.icon];
    return [full ? c : NEUTRAL[b.icon], full ? shade(c, -0.2) : c, c];
  }
  function deco(st, top) {
    let s = "";
    if (st === "full") {
      [[30, top - 7, 0, 2.6], [61, top - 13, 0.9, 3.1], [75, top - 3, 1.7, 2.3]].forEach(([x, y, dl, du]) => { s += `<g transform="translate(${x} ${y})"><g class="tb-fly" style="animation-delay:-${dl}s;animation-duration:${du}s"><ellipse class="tb-w" cx="-1.7" cy="-1.9" rx="1.9" ry="1.1" fill="#e6eeff" opacity=".85"/><ellipse class="tb-w" cx="1.7" cy="-1.9" rx="1.9" ry="1.1" fill="#e6eeff" opacity=".85"/><circle r="1.8" fill="#14111c" stroke="#9a94b8" stroke-width=".4"/></g></g>`; });
      [39, 51, 63].forEach((x, i) => { s += `<path class="tb-smell" style="animation-delay:${(i * 0.75).toFixed(2)}s" d="M${x} ${top} q-3 -4 0 -7 q3 -3.5 0 -7" fill="none" stroke="#a7e3a0" stroke-width="1.6" stroke-linecap="round"/>`; });
    }
    if (st === "emptied") [[12, 46, 8, 0], [88, 36, 7, 0.5], [84, 86, 6, 1], [16, 92, 5.5, 0.3], [54, 12, 6.5, 0.8], [70, 62, 4.5, 1.2]].forEach(([x, y, r, dl]) => {
      s += `<g transform="translate(${x} ${y}) scale(${(r / 5).toFixed(2)})"><path class="tb-spk" style="animation-delay:${dl}s" d="M0 -5 L1.3 -1.3 L5 0 L1.3 1.3 L0 5 L-1.3 1.3 L-5 0 L-1.3 -1.3 Z" fill="#fff" stroke="#6ee7b7" stroke-width=".7"/></g>`; });
    return s;
  }
  // f: how full (0–1); curb: a check mark (it's out); st: the animated state (null = the still drawing); tag: a unique
  // part of the gradients' ids (the same bin may be drawn on the card and in the alert)
  function svg(b, f, curb, st, tag = "c") {
    const p = `tb${String(b.id || hash(b.name)).replace(/[^0-9a-z]/g, "")}${tag}`, [c1, c2, cc] = cols(b), A = !!st; f = clamp(f, 0, 1);
    const wig = A && (st === "full" || st === "tonight") ? ' class="tb-wig"' : "", rise = A && (st === "normal" || st === "full") ? ' class="tb-rise"' : "";
    const lidCls = (ox, oy) => (A && st !== "emptied" ? ` class="tb-lid" style="transform-origin:${ox}px ${oy}px"` : "");
    let top = 22;
    let s = `<svg viewBox="0 0 100 120" aria-hidden="true"><defs>
      <linearGradient id="${p}b" x1="0" x2="1"><stop offset="0" stop-color="${shade(c1, 0.22)}"/><stop offset=".45" stop-color="${c1}"/><stop offset="1" stop-color="${shade(c1, -0.3)}"/></linearGradient>
      <linearGradient id="${p}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c2, 0.2)}"/><stop offset="1" stop-color="${shade(c2, -0.2)}"/></linearGradient></defs>
      <ellipse cx="50" cy="113" rx="34" ry="4" fill="#000" opacity=".3"/>`;
    const R = rnd(hash(b.id || b.name) % 9973 + 3);
    const contents = (x0, x1, yb, hgt, kind) => {
      const tp = yb - hgt * f; if (f <= 0.005) return "";
      let c = `<rect x="${x0}" y="${tp + 3}" width="${x1 - x0}" height="${yb - tp}" fill="${kind === "rec" ? "#6a5f8e" : "#2c2838"}"/>`;
      const n = Math.round((x1 - x0) / 8);
      for (let i = 0; i <= n; i++) {
        const cx = x0 + (i * (x1 - x0)) / n, r = 4.5 + R() * 3;
        if (kind === "rec") {
          const t = R(), col = t < 0.33 ? "#62b67f" : t < 0.66 ? "#d6d9e0" : "#e9dcb8";
          c += t < 0.33 ? `<rect x="${cx - 3}" y="${tp - 4 + R() * 4}" width="6" height="12" rx="2.5" fill="${col}"/><rect x="${cx - 1.4}" y="${tp - 7 + R() * 3}" width="2.8" height="4" fill="${col}"/>`
            : `<rect x="${cx - 4}" y="${tp - 2 + R() * 4}" width="8" height="${t < 0.66 ? 9 : 6}" rx="${t < 0.66 ? 1.5 : 0.5}" fill="${col}" transform="rotate(${(R() * 40 - 20).toFixed(0)} ${cx} ${tp + 3})"/>`;
        } else c += `<circle cx="${cx}" cy="${tp + 2 + R() * 3}" r="${r}" fill="${["#2f2b3d", "#3d384f", "#26222f"][i % 3]}"/><path d="M${cx - 2} ${tp - r + 3} q2 -3 4 0" stroke="#5c5670" stroke-width="1" fill="none"/>`;
      }
      return c;
    };
    const own = /^up:([0-9a-f]{16})$/.exec(b.pic || "");   // (v3.0.4) the owner's own picture instead of our drawing
    if (own) s += `<g${wig}><image href="/pictures/${own[1]}" x="6" y="12" width="88" height="100" preserveAspectRatio="xMidYMid meet"/></g>`;
    else if (b.icon === "wheelie" || b.icon === "recycle" || !b.icon) {
      let ang = f > 0.8 ? ((f - 0.8) / 0.2) * 26 : 0; const kind = b.icon === "recycle" ? "rec" : "";
      if (A && st !== "emptied") ang = Math.max(ang, 9);   // (animated: the lid sits slightly open)
      s += `<circle cx="27" cy="106" r="7.5" fill="#1b1924"/><circle cx="27" cy="106" r="2.8" fill="#6b6880"/><circle cx="73" cy="106" r="7.5" fill="#1b1924"/><circle cx="73" cy="106" r="2.8" fill="#6b6880"/>
        <rect x="14" y="21" width="72" height="4.5" rx="2.2" fill="${shade(c2, -0.35)}"/>`;
      if (f > 0.85) {
        const k = ((f - 0.85) / 0.15) * 7; top = 22 - k;
        s += `<g${wig}>` + (kind ? `<rect x="30" y="${30 - k}" width="9" height="14" rx="3" fill="#62b67f" transform="rotate(-14 34 36)"/><rect x="56" y="${29 - k}" width="14" height="11" rx="1" fill="#e9dcb8" transform="rotate(10 62 34)"/>`
          : `<circle cx="34" cy="${37 - k}" r="9" fill="#2f2b3d"/><circle cx="52" cy="${34 - k}" r="10" fill="#3d384f"/><circle cx="68" cy="${37 - k}" r="8" fill="#26222f"/><path d="M50 ${25 - k} l3 -4 l3 4" stroke="#5c5670" fill="none" stroke-width="1.4"/>`) + `</g>`;
      }
      s += `<path d="M17 36 H83 L77 103 Q76.5 108 72 108 H28 Q23.5 108 23 103 Z" fill="url(#${p}b)"/>
        <clipPath id="${p}c"><path d="M25 44 H75 L70.6 99 H29.4 Z"/></clipPath>
        <path d="M25 44 H75 L70.6 99 H29.4 Z" fill="#120d22" opacity=".62"/>
        <g clip-path="url(#${p}c)"><g${rise}>${contents(25, 75, 99, 55, kind)}</g></g>
        <path d="M25 44 H75 L70.6 99 H29.4 Z" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1"/>
        <path d="M26 46 H40 L35 97 H31 Z" fill="#fff" opacity=".06"/>
        <rect x="18" y="38" width="64" height="3" fill="#000" opacity=".15"/>
        <g transform="rotate(${-ang.toFixed(1)} 86 34)"><g${lidCls(86, 34)}><path d="M12 31 Q12 26.5 17 26.5 H85 Q89 26.5 89 31 V37 H12 Z" fill="url(#${p}l)"/><rect x="12" y="34.5" width="77" height="2.5" fill="#000" opacity=".2"/><rect x="40" y="28.5" width="20" height="3" rx="1.5" fill="#fff" opacity=".25"/></g></g>`;
      if (kind) s += `<g transform="translate(66,58)"><circle r="9" fill="#f4f7fb"/><g fill="none" stroke="#2f9e5b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M-4.5 2.5 L-1 -3.5 L1 -0.5"/><path d="M0.5 -4.5 L4.5 2.5 H1"/><path d="M3 4 H-4"/></g><path d="M1 -0.5 l-.2 -2.4 2.2 1" fill="#2f9e5b"/></g>`;
    } else if (b.icon === "inside") {
      let ang = f > 0.8 ? ((f - 0.8) / 0.2) * 30 : 0; top = 30;
      if (A && st !== "emptied") ang = Math.max(ang, 10);
      if (f > 0.85) { const k = ((f - 0.85) / 0.15) * 6; top = 30 - k; s += `<g${wig}><circle cx="40" cy="${42 - k}" r="8" fill="#2f2b3d"/><circle cx="56" cy="${40 - k}" r="9" fill="#3d384f"/><path d="M48 ${32 - k} q4 -6 8 -1" stroke="#c9ced6" fill="none" stroke-width="1.5"/></g>`; }
      s += `<rect x="25" y="40" width="50" height="66" rx="7" fill="url(#${p}b)"/>
        <clipPath id="${p}c"><rect x="31" y="48" width="38" height="50" rx="3"/></clipPath>
        <rect x="31" y="48" width="38" height="50" rx="3" fill="#120d22" opacity=".6"/>
        <g clip-path="url(#${p}c)"><g${rise}>${contents(31, 69, 98, 50, "")}</g></g>
        <rect x="31" y="48" width="38" height="50" rx="3" fill="none" stroke="#fff" stroke-opacity=".3"/>
        <rect x="28" y="42" width="5" height="62" rx="2.5" fill="#fff" opacity=".18"/>
        <rect x="38" y="104" width="24" height="5" rx="2.5" fill="${shade(c2, -0.4)}"/>
        <g transform="rotate(${-ang.toFixed(1)} 76 41)"><g${lidCls(76, 41)}><path d="M23 41 Q23 30 50 29 Q77 30 77 41 Z" fill="url(#${p}l)"/><rect x="23" y="39" width="54" height="3" rx="1.5" fill="${shade(c2, -0.25)}"/><path d="M33 36 Q40 32 50 32" stroke="#fff" stroke-opacity=".5" stroke-width="1.6" fill="none"/></g></g>`;
    } else if (b.icon === "bulky") {
      let g = "";
      if (f > 0.8) g += `<rect x="9" y="44" width="23" height="62" rx="3" fill="#e9edf3"/><rect x="9" y="64" width="23" height="1.6" fill="#b9c0cc"/><rect x="27" y="50" width="2" height="9" rx="1" fill="#9aa2ad"/><rect x="27" y="69" width="2" height="12" rx="1" fill="#9aa2ad"/><rect x="11" y="46" width="4" height="58" rx="2" fill="#fff" opacity=".5"/>`;
      if (f > 0.6) g += `<g transform="rotate(9 76 108)"><rect x="66" y="48" width="18" height="60" rx="5" fill="#ece6f7"/><path d="M66 63 H84 M66 78 H84 M66 93 H84" stroke="#c9bfe0" stroke-width="1"/><rect x="66" y="48" width="18" height="60" rx="5" fill="none" stroke="#b8acd6"/></g>`;
      if (f > 0.25) g += `<rect x="36" y="82" width="30" height="26" rx="1.5" fill="#b98a58"/><rect x="36" y="82" width="30" height="5" fill="#a07445"/><rect x="48" y="82" width="6" height="26" fill="${cc}" opacity=".9"/>`;
      if (f > 0.45) g += `<rect x="39" y="62" width="26" height="19" rx="2" fill="#262433"/><rect x="41.5" y="64.5" width="21" height="14" rx="1" fill="#3d4f78"/><path d="M44 67 h7" stroke="#fff" stroke-opacity=".35" stroke-width="1.2"/><rect x="48" y="81" width="8" height="1.5" fill="#262433"/>`;
      if (f > 0.02) g += `<circle cx="24" cy="97" r="11" fill="#1b1924"/><circle cx="24" cy="97" r="8" fill="none" stroke="#2f2b3d" stroke-width="1.4" stroke-dasharray="2 2"/><circle cx="24" cy="97" r="4.5" fill="#4a4660"/>`;
      top = f > 0.8 ? 44 : f > 0.6 ? 48 : f > 0.45 ? 62 : f > 0.25 ? 82 : 86;
      s += `<ellipse cx="50" cy="108" rx="40" ry="5" fill="none" stroke="#a99fd0" stroke-opacity=".4" stroke-dasharray="3 3"/><g${rise}><g${wig}>${g}</g></g>`;
    } else {   // a bag: it grows as it fills
      const sx = 0.55 + 0.45 * f, sy = 0.32 + 0.68 * f;
      top = 108 - 63 * sy - 12;
      s += `<g${wig}><g transform="translate(50 108) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-50 -108)">
        <path d="M18 108 Q10 72 32 52 Q41 45 50 45 Q59 45 68 52 Q90 72 82 108 Z" fill="${cc}"${b.color === "yellow" ? ' opacity=".86"' : ""}/>
        <path d="M18 108 Q10 72 32 52 Q41 45 50 45 Q59 45 68 52 Q90 72 82 108 Z" fill="url(#${p}b)" opacity=".5"/>
        <path d="M28 60 Q22 78 26 100" stroke="#fff" stroke-opacity=".3" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M44 62 q4 10 -1 22 M60 66 q-3 12 2 24" stroke="#000" stroke-opacity=".18" stroke-width="1.5" fill="none"/>
        <rect x="18" y="104" width="64" height="4" rx="2" fill="#000" opacity=".15"/>
        <path d="M45 46 L46 40 H54 L55 46 Z" fill="${shade(cc, -0.2)}"/></g>
        <path d="M46 ${108 - 63 * sy + 2} q-12 -14 -2 -14 q6 0 4 10 M54 ${108 - 63 * sy + 2} q12 -14 2 -14 q-6 0 -4 10" fill="none" stroke="${shade(cc, -0.15)}" stroke-width="4" stroke-linecap="round"/></g>`;
    }
    if (A) s += deco(st, top);
    if (curb) s += `<g transform="translate(84 18)"><circle r="12" fill="#10b981" stroke="#0b3d2e" stroke-width="2"/><path d="M-5 0 l3.5 3.5 l7 -7" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
    return s + "</svg>";
  }

  // ---------- the house's part (/api/bins): holidays and marks ----------
  async function load() {   // (the builder's canvas too: a Manager login reads them)
    try {
      const r = await fetch("/api/bins", { cache: "no-store" });
      if (r.ok) { const d = await r.json(); if (d && Array.isArray(d.holidays) && d.out && typeof d.out === "object") { B.doc = d; check(); H.refresh(); } }
    } catch {}
  }
  B.mark = async (name, day, undo) => {
    const k = `${String(name).trim().toLowerCase()}@${day}`;
    if (undo) delete B.doc.out[k]; else B.doc.out[k] = { at: Date.now() / 1000 };   // (at once here; the answer has every panel's)
    check(); H.refresh();
    if (DESIGN) return;
    try {
      const r = await fetch("/api/bins", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: undo ? "undo" : "out", bin: name, day }) });
      const d = await r.json().catch(() => null);
      if (r.ok && d && d.out) { B.doc = d; check(); H.refresh(); }
    } catch {}
  };
  const isOut = (b, P) => Object.prototype.hasOwnProperty.call(B.doc.out || {}, keyOf(b, P));

  // ---------- the card ----------
  const nowParts = (now = new Date()) => ({ n: dn(now), m: now.getHours() * 60 + now.getMinutes() });
  const dayWords = (P, n) => (P - n > 6 ? T.dayShort(local(P)) : T.weekday(local(P), "long"));
  const timeWords = (hhmm) => { const m = mins(hhmm); return T.time(new Date(2000, 0, 1, Math.floor(m / 60), m % 60)); };
  const holName = (n) => ((B.doc.holidays || []).find((h) => fromIso(h.d) === n) || {}).name || T("bn.holiday");
  B.card = (c, now) => {
    const o = c.o || {}, items = Array.isArray(o.items) ? o.items : [], { n, m } = nowParts(now), hol = holSet(B.doc.holidays);
    const calm = o.calm === true || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (!items.length) return { html: `<div class="tb">${o.title ? `<div class="gc-t">${esc(o.title)}</div>` : ""}<div class="gc-empty">${esc(T("bn.none"))}</div></div>` };
    const rows = items.map((b) => { const i = info(b, n, hol), mk = isOut(b, i.pk.d); return { b, i, mk, st: state(b, n, m, i, mk) }; });
    const moved = (r) => r.i.pk.why !== null, names = (a) => T.list(a.map((r) => r.b.name));
    const today = rows.filter((r) => r.i.pk.d === n), left = today.filter((r) => r.st !== "emptied"), tom = rows.filter((r) => r.i.pk.d === n + 1);
    let line;
    if (left.length) line = `<span class="tb-dot bad"></span>${esc(T(left.some(moved) ? "bn.todayMoved" : "bn.today"))} <small>${esc(names(left))}</small>`;
    else if (tom.length) line = `<span class="tb-dot warn"></span>${esc(T(tom.some(moved) ? "bn.tomorrowMoved" : "bn.tomorrow"))} <small>${esc(names(tom))}</small>`;
    else if (today.length) line = `<span class="tb-dot ok"></span>${esc(T("bn.emptiedToday"))} <small>${esc(names(today))}</small>`;
    else {
      const r = rows.slice().sort((x, y) => x.i.pk.d - y.i.pk.d)[0];
      line = `${esc(T(moved(r) ? "bn.nextMoved" : "bn.next", { day: dayWords(r.i.pk.d, n) }))} <small>${esc(T("bn.nextIn", { name: r.b.name, n: r.i.pk.d - n }))}</small>`;
    }
    const bins = rows.map(({ b, i, mk, st }) => {
      const P = i.pk.d, dd = P - n, A = b.anim === true, out = mk && b.btn !== "emptied", f = st === "emptied" ? 0 : i.fill;
      const due = !mk && st !== "emptied" && n * 1440 + m >= remStart(o, P);
      const badge = st === "tonight" ? T("bn.st.tonight") : st === "pickup" ? T("bn.st.pickup") : st === "emptied" ? T("bn.st.emptied") : st === "full" ? T("bn.st.full", { n: dd }) : T("bn.st.in", { n: dd });
      const msg = st === "tonight" ? T(out ? "bn.outDone" : b.icon === "inside" ? "bn.emptyIt" : "bn.putOut") : st === "pickup" ? T("bn.pickupToday", { time: timeWords(b.truck || "07:00") })
        : st === "emptied" ? T("bn.emptied") : moved({ i }) ? T("bn.pickupMoved", { day: T.weekday(local(P), "long") })
        : T(dd === 1 ? "bn.whenTomorrow" : "bn.whenIn", { day: dayWords(P, n), n: dd });
      const extra = (st === "tonight" || st === "pickup") && i.pk.why !== null ? T("bn.movedFrom", { day: T.weekday(local(i.pk.o)), name: holName(i.pk.why) })
        : i.cx ? T("bn.canceled", { day: T.dayShort(local(i.cx.o)) }) : "";
      return `<div class="tb-bin${A ? " anim" : dd === 0 ? " today" : dd === 1 ? " due" : ""} s-${st}${out ? " out" : ""}"><span class="tb-st ${st}">${esc(badge)}</span>${svg(b, f, out, A ? st : null)}
        <b>${esc(b.name)}</b><small>${esc(msg)}</small>${extra ? `<span class="tb-mv">${esc(extra)}</span>` : ""}<span class="tb-pct num">${esc(T("bn.pctFull", { n: Math.round(f * 100) }))}</span>
        ${due ? `<button class="tb-btn"${Acts.on("bn.out", b.name, iso(P))}>${esc(T(BTN[b.btn] || BTN.out))}</button>` : ""}</div>`;
    }).join("");
    return { cls: left.length || tom.length ? "on" : "", html: `<div class="tb${calm ? " calm" : ""}">${o.title ? `<div class="gc-t">${esc(o.title)}</div>` : ""}<div class="tb-line">${line}</div><div class="tb-bins">${bins}</div></div>` };
  };

  // ---------- the reminders (every trash card in this panel's layouts) and the alarm ----------
  const cardsHere = () => {
    const v = (window.Settings && Settings.v) || {}, out = [];
    for (const g of [v.homeGrid, ...Object.values(v.roomGrids || {})]) for (const c of (g && Array.isArray(g.cards) ? g.cards : [])) if (c && c.t === "trash" && c.o) out.push(c);
    return out;
  };
  // the alarms that rang, per pickup — kept in this browser so a reload doesn't ring one again (as timers.js "fired")
  const RANG = "panel.bins.rang";
  const rang = (() => { try { const v = JSON.parse(localStorage.getItem(RANG) || "[]"); return new Set(Array.isArray(v) ? v.slice(-50) : []); } catch { return new Set(); } })();
  function check(now = new Date()) {
    if (DESIGN || !window.HubAlerts || !HubAlerts.own) return;
    const { n, m } = nowParts(now), abs = n * 1440 + m, hol = holSet(B.doc.holidays), list = [], seen = new Set();
    let ring = false;
    for (const c of cardsHere()) for (const b of c.o.items || []) {
      const i = info(b, n, hol), P = i.pk.d, k = keyOf(b, P);
      if (seen.has(k) || isOut(b, P) || state(b, n, m, i, false) === "emptied" || abs < remStart(c.o, P) || P > n + 1) continue;
      seen.add(k);
      list.push({ id: (hash(k).toString(16).padStart(8, "0") + hash(`${k}#`).toString(16).padStart(8, "0")).slice(0, 12), lvl: 1, tag: "bins",
        title: T(b.btn === "emptied" ? "bn.alertEmpty" : "bn.alertOut", { name: b.name }), text: T(P === n ? "bn.alertToday" : "bn.alertTomorrow"),
        act: T(BTN[b.btn] || BTN.out), done: () => B.mark(b.name, iso(P)) });
      if (c.o.alarm && abs >= alarmAt(c.o, P) && abs < (Math.floor(alarmAt(c.o, P) / 1440) + 1) * 1440 && !rang.has(k)) {
        rang.add(k); ring = true;
        try { localStorage.setItem(RANG, JSON.stringify([...rang].slice(-50))); } catch {}
      }
    }
    HubAlerts.own("bins", list);
    if (ring) {
      try { if (window.Sound && Sound.tone) Sound.tone("attention"); } catch {}
      if (window.PanelSpeech) PanelSpeech.alert(T("bn.alarmSay"), 1);
    }
  }

  load();
  if (!DESIGN) {
    H.subscribe("dashboard/bins/changed", load);
    setInterval(load, 5 * 60000);
    let sig = "";
    setInterval(() => {   // (each minute: the reminders; the cards drawn again when a bin's day or state changed)
      check();
      const { n, m } = nowParts(), s = `${n}|${m >= TONIGHT}|${cardsHere().map((c) => (c.o.items || []).map((b) => mins(b.truck) <= m).join()).join()}`;
      if (s !== sig) { sig = s; H.refresh(); }
    }, 60000);
    setTimeout(check, 3000);
  }
  Acts.add({ "bn.out": (name, day) => B.mark(String(name), String(day)) });
  // (for the tests and the builder's preview)
  Object.assign(B, { raw, picks, info, state, svg, dn, iso, fromIso, holSet, keyOf, remStart, check, COLORS });
  window.Trash = B;
})();
