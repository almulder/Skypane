// (v3.0.4) The UniFi cards ("Network" in the builder; the design: mockups/prototypes/unifi-v2.html round 3, the notes:
// mockups/TESTING-NOTES.md 2026-11-04). Nine cards, each with its Style (A / B / C) and its own colors (o.col):
//   netwan Internet · netchips Clients & gateway · netstrip Status tabs · netmap Network map · netdevs UniFi devices ·
//   netpoe PoE power · netclients Clients · netlog Client log · netvals Network values (single values for any room;
//   a tap opens the room that has the full card)
// The model comes from service/unifi_net.py through GET /api/panel/<id>/unifi — already scrubbed: no key, no IP address,
// no MAC address (devices and clients go by a salted hash). It's read every 30 s while any UniFi card is on one of this
// panel's layouts, shown or not, so the client log and the "new device" notices keep going; nothing is read without one.
// A card stays hidden on the wall while UniFi isn't connected (the builder's canvas says why instead).
// The map: (v3.0.5) drawn in the card's own pixels over the whole card (before: a 1000-wide space), laid out by itself —
// left to right, top down or round the gateway — unless the owner dragged a part: o.pos {node id: [x, y]} in thousandths, saved with the
// card (the builder's "Arrange the parts": the canvas lets the drag through and sends each place back, design.js).
// The "new device" notice: a small note at the bottom (not one of the 1–5 system alerts), each one once (by its id).
// (v3.0.5, M3) netups UPS / battery backup · netbell Doorbell · netfeed Activity feed (unifi-v2.html); the map drawn
// in the card's own pixels over the whole card (network-map-305.html).
(function () {
  const H = Home, esc = (s) => UI.esc(s);
  const PC = window.PANEL_CONFIG || {}, DESIGN = window.PANEL_DESIGN === true;
  const D = "—", POLL = 30000;
  const U = { m: null, st: {}, arranging: null, dragged: 0, ups: null, bell: null };
  const TYPES = ["netwan", "netchips", "netstrip", "netmap", "netdevs", "netpoe", "netclients", "netlog", "netvals", "netups", "netbell", "netfeed"];
  // (v3.0.5) the cards with their own reads (not UniFi Network's model): the UPS card (/ups) and the Doorbell (/doorbell)
  const OWN = { netups: "ups", netbell: "doorbell" };
  // each card's colors and their defaults (service/layouts.py NET_COLORS; the builder's list has the same — builder.js)
  const COL = {
    netwan: { dl: "#38bdf8", ul: "#c084fc", lat: "#fbbf24", ok: "#34d399", warn: "#fbbf24", bad: "#fb7185" },
    netchips: { acc: "#f3efff", bar: "#a78bfa" },
    netstrip: { ok: "#34d399", warn: "#fbbf24", bad: "#fb7185", sel: "#a78bfa" },
    netmap: { line: "#8b5cf6", wifi: "#38bdf8", orb: "#f5d0fe", node: "#a78bfa", idle: "#6b6390", bad: "#fb7185", ok: "#34d399", warn: "#fbbf24" },
    netdevs: { ok: "#34d399", bad: "#fb7185", warn: "#fbbf24" },
    netpoe: { gauge: "#a78bfa", warn: "#fb923c", port: "#38bdf8" },
    netclients: { icon: "#dacfff", named: "#a5b4fc" },
    netlog: { join: "#34d399", roam: "#7dd3fc" },
    netvals: { val: "#f3efff", icon: "#a78bfa" },
    netups: { mains: "#34d399", batt: "#fbbf24", low: "#fb7185", fill: "#a78bfa" },
    netbell: { ring: "#fbbf24", acc: "#a78bfa" },
    netfeed: { join: "#34d399", leave: "#94a3b8", alert: "#fb7185", ok: "#38bdf8" },
  };
  const isCol = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
  const colVars = (t, col) => Object.entries(COL[t] || {}).map(([k, d]) => `--c-${k}:${col && isCol(col[k]) ? col[k] : d}`).join(";");

  // ---------- our own line icons (the rest: icons.js) ----------
  const P = {
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
    netSwitch: '<rect x="2.5" y="7" width="19" height="10" rx="2"/><path d="M6 11h1.5M9 11h1.5M12 11h1.5M15 11h1.5M6 14h12"/>',
    ap: '<path d="M4 9.5a11 11 0 0 1 16 0M7 12.5a7 7 0 0 1 10 0"/><rect x="5" y="15" width="14" height="5" rx="2.5"/>',
    ups: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12.8 7l-3 5h4.4l-3 5"/>',
    fiber: '<path d="M3 12c3-6 6 6 9 0s6 6 9 0"/><circle cx="3" cy="12" r="1.2"/><circle cx="21" cy="12" r="1.2"/>',
    cable: '<path d="M4 20v-5a4 4 0 0 1 4-4h8a4 4 0 0 0 4-4V3"/><rect x="2" y="17" width="4" height="4" rx="1"/>',
    dsl: '<rect x="4" y="9" width="16" height="10" rx="2"/><path d="M9 9V5h6v4M8 14h8"/>',
    satellite: '<path d="M5 19a9 9 0 0 1 0-9l9 9a9 9 0 0 1-9 0z"/><path d="M10 14l5-5M15 4a5 5 0 0 1 5 5M15 7a2 2 0 0 1 2 2"/>',
    cellular: '<path d="M5 20v-3M9.5 20v-6M14 20v-9M18.5 20V5"/>',
    wireless: '<path d="M12 20v-7M8.5 9.5a5 5 0 0 1 7 0M5.5 6.5a9.5 9.5 0 0 1 13 0"/><circle cx="12" cy="12.5" r="1"/>',
    wired: '<path d="M12 3v6M8 9h8v4a4 4 0 0 1-8 0V9zM12 17v4"/>',
    watch: '<rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
    arrowDown: '<path d="M12 4v15M6 13l6 6 6-6"/>', arrowUp: '<path d="M12 20V5M6 11l6-6 6 6"/>',   // i18n-ok (drawings)
    roam: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    msg: '<path d="M4 5h16v11H9l-5 4z"/>',   // (v3.0.5: a doorbell message)
  };
  const ic = (n, size = 20) => (P[n] ? `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>` : window.icon(n, size));
  const KIND_IC = { gateway: "router", switch: "netSwitch", ap: "ap", ups: "ups", power: "plug", bridge: "wireless", other: "chip", nvr: "nas", camera: "cctv", doorbell: "doorbell", cams: "cctv" };
  const KORDER = ["gateway", "switch", "ap", "nvr", "ups", "power", "bridge", "other"];
  const CL_IC = { tv: "tv", speaker: "speaker", game: "gamepad", tablet: "tablet", watch: "watch", phone: "phone", printer: "printer", camera: "camera", server: "server", computer: "laptop", "smart-home": "bulb", other: "chip" };
  const WAN_IC = { wired: "wired", fiber: "fiber", cable: "cable", dsl: "dsl", satellite: "satellite", cellular: "cellular", wireless: "wireless" };

  // ---------- numbers ----------
  const isN = (v) => typeof v === "number" && Number.isFinite(v);
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const mb = (v) => (!isN(v) ? D : v < 10 ? v.toFixed(1) : String(Math.round(v)));
  const pct = (v) => (isN(v) ? `${Math.round(v)} %` : D);
  const ms = (v) => (isN(v) ? T("net.ms", { n: Math.round(v) }) : D);
  const upFor = (s) => { if (!isN(s)) return D; const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? T("net.upDH", { d, h }) : h ? T("net.upHM", { h, m }) : T("net.upM", { m }); };
  const bytes = (b) => { if (!isN(b)) return D; const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; while (b >= 1000 && i < 4) { b /= 1000; i++; } return `${b < 10 && i ? b.toFixed(1) : Math.round(b)} ${u[i]}`; };   // i18n-ok (units)
  const avail = (v) => (isN(v) ? (v >= 99.995 ? "100 %" : `${v.toFixed(v >= 99 ? 2 : 1)} %`) : D);
  const temp = (v) => (isN(v) ? (window.Fmt ? Fmt.tempText(v, "C") : `${Math.round(v)}°C`) : D);
  const when = (at) => { const s = Date.now() / 1000 - at; return s < 60 ? T("net.now") : s < 3600 ? T("net.minAgo", { n: Math.floor(s / 60) }) : T.time(new Date(at * 1000)); };
  const kindWord = (k) => T(`net.kind.${KORDER.includes(k) || k === "camera" || k === "doorbell" ? k : "other"}`);

  // ---------- the model ----------
  const ok = () => !!(PC.unifiNet && U.m && U.m.enabled !== false && U.m.ok);
  const wans = () => (U.m && U.m.wans) || [];
  const devs = () => (U.m && U.m.devices) || [];
  const active = () => wans().find((w) => w.active && w.up !== false) || null;
  function overall() {
    const ws = wans(), a = active();
    if (U.m && U.m.stale) return { cls: "warn", text: T("net.stale"), act: a };   // (v3.0.4: the reads stopped — service/unifi_net.py mark_stale)
    if (!ws.length) return { cls: "", text: T("net.noLine"), act: null };
    if (!a) return { cls: "bad", text: T("net.down"), act: null };
    if (a.state === "slow") return { cls: "warn", text: T("net.slow"), act: a };
    if (ws.length > 1 && ws[0] !== a) return { cls: "warn", text: T("net.backup", { name: a.name }), act: a };
    return { cls: "ok", text: T("net.online"), act: a };
  }
  const stWord = (w) => (w.up === false ? T("net.st.down") : w.active ? T(w.state === "slow" ? "net.st.slow" : "net.st.inUse") : T("net.st.standby"));
  const stCls = (w) => (w.up === false ? "bad" : w.active ? (w.state === "slow" ? "warn" : "acc") : "");
  const wIcon = (w) => WAN_IC[w && w.icon] || "globe";
  const card = (i) => (window.Grid && Grid.byId && Grid.byId.get(i)) || null;
  const S = (i) => U.st[i] || (U.st[i] = {});
  const head = (o, icon, word, right = "") => `<div class="un-hd"><span class="un-hl">${ic(icon, 18)}<span class="un-lbl">${esc(o.title || word)}</span></span>${right}</div>`;
  const pill = (cls, text) => `<span class="un-pill ${cls}">${esc(text)}</span>`;
  const dot = (cls) => `<span class="un-dot ${cls || ""}"></span>`;
  const empty = (icon, text) => `<div class="un-need">${ic(icon, 30)}<b>${esc(text)}</b></div>`;

  // where a tap on a value goes: the first room (or Home) whose layout has one of these cards; the cameras page for Protect
  function roomWith(types) {
    const v = (window.Settings && Settings.v) || {}, has = (g) => !!g && Array.isArray(g.cards) && g.cards.some((c) => types.includes(c.t));
    for (const [id, g] of Object.entries(v.roomGrids || {})) if (id !== "*" && has(g) && H.room && H.room(id)) return id;
    return has(v.homeGrid) ? "home" : null;
  }
  const GO = { net: ["netwan", "netmap"], gw: ["netwan", "netdevs"], wifi: ["netclients"], sw: ["netdevs", "netpoe", "netmap"], clients: ["netclients", "netlog"],
    inet: ["netwan", "netmap"], line: ["netwan"], ping: ["netwan"], poe: ["netpoe", "netdevs"], wired: ["netclients"], devs: ["netdevs", "netmap"] };
  function go(what) {
    if (what === "pro") return App.go("cameras");
    const r = roomWith(GO[what] || ["netwan"]);
    if (r && r !== App.view) App.go(r);
  }

  // ---------- Internet ----------
  const GM = ["dl", "ul", "both"];
  function graph(c, w, hpx) {
    const o = c.o || {}, gm = S(c.i).gm || (GM.includes(o.gm) ? o.gm : "both"), lat = o.lat !== false, h = (w && w.history) || [];
    const tag = `<span class="un-gm">${esc(T(`net.gm.${gm}`))}</span>`;
    const box = (inner) => `<div class="un-graph"${Acts.on("net.gm", c.i)} style="flex:1 1 ${hpx}px">${inner}${tag}</div>`;
    if (h.length < 2) return box(`<div class="un-gempty">${esc(T("net.noHistory"))}</div>`);
    const VW = 600, VH = 100, n = h.length, x = (i) => (i / (n - 1)) * VW;
    const keys = gm === "dl" ? ["down"] : gm === "ul" ? ["up"] : ["down", "up"];
    const vals = keys.flatMap((k) => h.map((p) => p[k]).filter(isN)).sort((a, b) => a - b);
    const nice = (v) => { const e = 10 ** Math.floor(Math.log10(Math.max(v, 1e-6))); for (const m of [1, 2.5, 5, 10]) if (m * e >= v * 1.08) return m * e; return 10 * e; };
    const max = nice(Math.max(1, vals[Math.floor(0.9 * (vals.length - 1))] || 1)), lats = h.map((p) => p.lat).filter(isN).sort((a, b) => a - b);
    const lmax = nice(Math.max(5, lats[Math.floor(0.98 * (lats.length - 1))] || 5));
    const path = (k, mx) => { let d = "", pen = false; h.forEach((p, i) => { const v = p[k]; if (!isN(v)) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${(VH - cl(v / mx, 0, 1.05) * VH).toFixed(1)}`; pen = true; }); return d; };
    let bands = "";
    for (let i = 0; i < n; i++) if (h[i].s === "down") { let j = i; while (j < n && h[j].s === "down") j++; bands += `<rect x="${x(i).toFixed(1)}" y="0" width="${Math.max(3, x(j - 1) - x(i) + 2).toFixed(1)}" height="${VH}" class="un-band"/>`; i = j; }
    const line = (k, cv, area) => { const d = path(k, max); return !d ? "" : (area ? `<path d="${d}L${VW} ${VH}L0 ${VH}Z" style="fill:var(${cv});opacity:.14"/>` : "") + `<path d="${d}" fill="none" style="stroke:var(${cv})" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`; };
    const lines = gm === "dl" ? line("down", "--c-dl", true) : gm === "ul" ? line("up", "--c-ul", true) : line("down", "--c-dl") + line("up", "--c-ul");
    const latL = lat ? `<path d="${path("lat", lmax)}" fill="none" style="stroke:var(--c-lat)" stroke-width="1.6" stroke-dasharray="1.5 3.5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` : "";
    const grid = `<path d="M0 50H${VW}M0 ${VH}H${VW}" stroke="rgba(255,255,255,.1)" vector-effect="non-scaling-stroke"/>`;
    const hrs = Math.max(1, Math.round((h[n - 1].t - h[0].t) / 3600));
    return box(`<svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="none">${grid}${bands}${lines}${latL}</svg>`
      + `<div class="un-ax l"><span>${esc(T("net.mbpsN", { n: mb(max) }))}</span><span>0</span></div>${lat ? `<div class="un-ax r"><span>${esc(ms(lmax))}</span><span>0</span></div>` : ""}`)
      + `<div class="un-gax"><span>${esc(T("net.hAgo", { n: hrs }))}</span><span>${esc(T("net.now"))}</span></div>`;
  }
  const legend = (c) => { const o = c.o || {}, gm = S(c.i).gm || (GM.includes(o.gm) ? o.gm : "both");
    return `<div class="un-leg">${gm !== "ul" ? `<span><i style="background:var(--c-dl)"></i>${esc(T("net.gm.dl"))}</span>` : ""}${gm !== "dl" ? `<span><i style="background:var(--c-ul)"></i>${esc(T("net.gm.ul"))}</span>` : ""}`
      + `${o.lat !== false ? `<span><i class="lat"></i>${esc(T("net.latency"))}</span>` : ""}<span><i style="background:var(--c-bad);opacity:.6"></i>${esc(T("net.st.down"))}</span></div>`; };
  function bars(c, big) {
    return `<div class="un-ubars">${wans().map((w) => `<button class="un-ubar${big ? " big" : ""}${S(c.i).det === w.key ? " on" : ""}"${Acts.on("net.det", c.i, w.key)}>${ic(wIcon(w), 18)}`
      + `<span class="un-nm"><b>${esc(w.name)}</b><small>${esc(big ? `${w.slot} · ${stWord(w)}${isN(w.latency) ? ` · ${ms(w.latency)}` : ""}` : w.slot)}</small></span>`
      + `<span class="un-ut">${(w.bars || []).map((s) => `<i class="${s === "down" ? "b" : s === "slow" ? "w" : s === "ok" ? "o" : "n"}"></i>`).join("")}</span><span class="un-pc">${esc(avail(w.availability))}</span></button>`).join("")}</div>`;
  }
  const kv = (l, v, cls = "") => `<div class="un-kv ${cls}"><span>${esc(l)}</span><b>${v}</b></div>`;
  const rate = (dir, v) => `<span class="un-rate ${dir}">${ic(dir === "dn" ? "arrowDown" : "arrowUp", 15)}<b>${esc(mb(v))}</b><small>${esc(T("net.mbps"))}</small></span>`;
  const PARTS = ["counts", "uptime", "uptodate", "isp", "thru", "ping"];
  function side(c, sel, compact) {
    const o = c.o || {}, p = new Set(Array.isArray(o.parts) ? o.parts : PARTS), g = U.m.gateway, k = U.m.counts || {}, kd = k.devices || {}, out = [];
    const n = (kind) => (kd[kind] ? kd[kind].total : 0);
    if (!compact) out.push(`<div class="un-gwn">${ic("router", 26)}<div><b>${esc(g ? g.name : T("net.noGateway"))}</b><small>${esc((g && g.model) || "")}</small></div></div>`);
    if (p.has("counts")) out.push(`<div class="un-cnts"><span title="${esc(T("net.kind.gateway"))}">${ic("router", 16)}${n("gateway")}</span><span title="${esc(T("net.kind.switch"))}">${ic("netSwitch", 16)}${n("switch")}</span>`
      + `<span title="${esc(T("net.kind.ap"))}">${ic("ap", 16)}${n("ap")}</span><span title="${esc(T("net.wifi"))}">${ic("wifi", 16)}${k.wireless ?? D}</span><span title="${esc(T("net.wired"))}">${ic("wired", 16)}${k.wired ?? D}</span></div>`);
    if (p.has("uptime")) out.push(kv(T("net.sysUptime"), esc(upFor(g && g.uptime))));
    if (p.has("uptodate") && g) {
      out.push(kv(T("net.gwVersion", { v: g.version || "" }), esc(T(g.upToDate ? "net.upToDate" : "net.updateReady")), g.upToDate ? "" : "warnv"));
      out.push(kv(T("net.devices"), esc(g.devicesToUpdate ? T("net.updates", { n: g.devicesToUpdate }) : T("net.upToDate")), g.devicesToUpdate ? "warnv" : ""));
    }
    const ws = wans();
    if (ws.length > 1 && !compact) out.push(`<div class="un-wsw">${ws.map((w) => `<button class="${sel === w ? "on" : ""}"${Acts.on("net.sel", c.i, w.key)}>${dot(w.up === false ? "bad" : w.state === "slow" ? "warn" : "ok")}${esc(w.name)}</button>`).join("")}</div>`);
    if (p.has("isp") && sel) out.push(`<div class="un-kv"><span class="un-isp">${ic(wIcon(sel), 16)}${esc(sel.isp || sel.name)} <small>${esc(sel.slot)}</small></span><b class="${isN(sel.availability) && sel.availability < 99 ? "warnv" : "okv"}">${esc(avail(sel.availability))}</b></div>`);
    if (p.has("thru") && sel) {
      out.push(kv(T("net.throughput"), `${rate("dn", sel.down)} ${rate("up", sel.upload)}`));
      const hs = (sel.history || []).slice(-24), mx = Math.max(0.001, ...hs.map((q) => Math.max(q.down || 0, q.up || 0)));
      if (!compact && hs.length) out.push(`<div class="un-mbars">${hs.map((q) => `<i style="height:${Math.round(((q.down || 0) / mx) * 100)}%;background:var(--c-dl)"></i><i style="height:${Math.round(((q.up || 0) / mx) * 100)}%;background:var(--c-ul)"></i>`).join("")}</div>`);
    }
    if (p.has("ping") && sel && (sel.monitors || []).length) out.push(`<div class="un-pings">${sel.monitors.slice(0, 3).map((m) => `<span><em>${esc(String(m.target || "").slice(0, 2).toUpperCase())}</em>${esc(sel.up !== false ? ms(m.latency) : D)}</span>`).join("")}</div>`);
    return `<div class="un-side">${out.join("")}</div>`;
  }
  function detail(c) {
    const w = wans().find((x) => x.key === S(c.i).det); if (!w) return "";
    return `<div class="un-det"><div class="un-hd"><span class="un-hl">${ic(wIcon(w), 20)}<b>${esc(w.name)}</b><small>${esc(`${w.slot}${w.isp && w.isp !== w.name ? ` · ${w.isp}` : ""}`)}</small></span>`
      + `<span class="un-hr">${pill(stCls(w), stWord(w))}<button class="un-x"${Acts.on("net.det", c.i, null)} aria-label="${esc(T("common.close"))}">${window.icon("x", 16)}</button></span></div>`
      + `<div class="un-dg">${kv(T("net.uptimePct"), esc(avail(w.availability)))}${kv(T("net.latencyNow"), esc(ms(w.latency)))}${kv(T("net.downNow"), esc(T("net.mbpsN", { n: mb(w.down) })))}${kv(T("net.upNow"), esc(T("net.mbpsN", { n: mb(w.upload) })))}`
      + (w.monitors || []).slice(0, 3).map((m) => kv(T("net.pingTo", { name: m.target }), esc(w.up !== false ? ms(m.latency) : D))).join("") + `</div></div>`;
  }
  const R = {};
  let first = false;
  R.netwan = (c, v) => {
    const o = c.o || {}, ws = wans(), ov = overall();
    const hd = head(o, "globe", T("net.internet"), `<span class="un-hr">${ov.act ? `<small class="un-mut">${esc(T("net.onLine", { name: ov.act.name }))}</small>` : ""}${pill(ov.cls, ov.text)}</span>`);
    if (!ws.length) return hd + empty("globe", T("net.noLine"));
    const sel = ws.find((w) => w.key === S(c.i).sel) || ov.act || ws[0];
    const big = `<div class="un-big"><span>${ic("arrowDown", 22)}<b style="color:var(--c-dl)">${esc(mb(sel.down))}</b><u>${esc(T("net.mbps"))}</u></span><span>${ic("arrowUp", 22)}<b style="color:var(--c-ul)">${esc(mb(sel.upload))}</b><u>${esc(T("net.mbps"))}</u></span>`
      + `<span>${ic("clock", 22)}<b>${isN(sel.latency) ? Math.round(sel.latency) : D}</b><u>${esc(T("net.msUnit"))}</u></span><small class="un-mut">${esc(`${sel.name} · ${stWord(sel)}`)}</small></div>`;
    if (v === "b") return hd + `<div class="un-wtiles" style="--n:${ws.length}">${ws.map((w) => `<button class="un-wtile${w.active ? " act" : ""}${w.up === false ? " down" : ""}"${Acts.on("net.det", c.i, w.key)}>`
        + `<span class="un-wt">${ic(wIcon(w), 20)}<b>${esc(w.name)}</b>${pill(stCls(w), stWord(w))}</span><small class="un-mut">${esc(`${w.slot} · ${T("net.upPct", { p: avail(w.availability) })}`)}</small>`
        + `<span class="un-wl"><span class="un-lat${w.state === "slow" ? " warnv" : ""}">${isN(w.latency) ? Math.round(w.latency) : D}<u> ${esc(T("net.msUnit"))}</u></span>${w.active ? rate("dn", w.down) + rate("up", w.upload) : `<small class="un-mut">${esc(T(w.up === false ? "net.noConn" : "net.ready"))}</small>`}</span></button>`).join("")}</div>`
      + legend(c) + graph(c, sel, 120) + bars(c) + `<div class="un-chiprow">${chipsOf(c)}</div>` + detail(c);
    if (v === "c") return hd + `<div class="un-cols c"><div class="un-col"><div class="un-lbl sm">${esc(T("net.uptimeLines"))}</div>${bars(c, true)}<div class="un-sp"></div>${big}${legend(c)}${graph(c, sel, 100)}</div>`
      + `<div class="un-col un-rside"><div class="un-lbl sm">${esc(U.m.gateway ? U.m.gateway.name : T("net.kind.gateway"))}</div>${side(c, sel, true)}</div></div>` + detail(c);
    return hd + `<div class="un-cols a">${side(c, sel)}<div class="un-col">${big}${legend(c)}${graph(c, sel, 140)}<div class="un-sp"></div><div class="un-lbl sm">${esc(T("net.uptimeTap"))}</div>${bars(c)}</div></div>` + detail(c);
  };
  function chipsOf(c) {
    const o = c.o || {}, p = new Set(Array.isArray(o.parts) ? o.parts : PARTS), k = U.m.counts || {}, kd = k.devices || {}, g = U.m.gateway, sel = active();
    return [p.has("counts") ? `<span class="un-chip">${ic("users", 15)}${esc(T("net.chipCounts", { c: k.clients ?? 0, a: (kd.ap || {}).total || 0, s: (kd.switch || {}).total || 0 }))}</span>` : "",
      p.has("uptime") && g ? `<span class="un-chip">${ic("clock", 15)}${esc(T("net.chipUp", { t: upFor(g.uptime) }))}</span>` : "",
      p.has("uptodate") && g ? `<span class="un-chip${g.devicesToUpdate ? " warn" : ""}">${ic(g.devicesToUpdate ? "warning" : "check", 15)}${esc(g.devicesToUpdate ? T("net.updates", { n: g.devicesToUpdate }) : T("net.allUpToDate"))}</span>` : "",
      p.has("ping") && sel && (sel.monitors || []).length ? `<span class="un-chip">${ic("gauge", 15)}${esc(sel.monitors.slice(0, 3).map((m) => `${String(m.target || "").slice(0, 2)} ${isN(m.latency) ? Math.round(m.latency) : D}`).join(" · "))} ${esc(T("net.msUnit"))}</span>` : ""].join("");
  }

  // ---------- Clients & gateway ----------
  R.netchips = (c, v) => {
    const k = U.m.counts || {}, g = U.m.gateway, a = active();
    const items = [[T("net.wifi"), k.wireless, "wifi"], [T("net.wired"), k.wired, "wired"], [T("net.guest"), k.guests, "user"], [T("net.cpu"), g && isN(g.cpu) ? `${Math.round(g.cpu)}%` : null, "chip"],
      [T("net.ram"), g && isN(g.mem) ? `${Math.round(g.mem)}%` : null, "server"], [T("net.line"), a ? a.name : null, a ? wIcon(a) : "globe"]];
    if (v === "b") return `<div class="un-cline">${ic("users", 18)}<span class="un-lbl">${esc((c.o || {}).title || T("net.chipsTitle"))}</span>${items.map(([l, x]) => `<span><span class="un-mut">${esc(l)}</span> <b>${esc(x ?? D)}</b></span>`).join('<span class="un-mut">·</span>')}</div>`;
    if (v === "c") {
      const bar = (l, p) => `<div class="un-brow"><span class="un-mut">${esc(l)}</span><div class="un-bar"><i style="width:${isN(p) ? cl(p, 0, 100) : 0}%;background:var(--c-bar)"></i></div><b>${esc(pct(p))}</b></div>`;
      return `<div class="un-cbar">${items.slice(0, 3).map(([l, x, i]) => `<span class="un-cn">${ic(i, 18)}<b>${esc(x ?? D)}</b><span class="un-mut">${esc(l)}</span></span>`).join("")}${bar(T("net.cpu"), g && g.cpu)}${bar(T("net.ram"), g && g.mem)}<span class="un-chip">${ic(items[5][2], 15)}${esc(items[5][1] || D)}</span></div>`;
    }
    return `<div class="un-cboxes">${items.map(([l, x]) => `<div class="un-cbox"><span>${esc(l)}</span><b>${esc(x ?? D)}</b></div>`).join("")}</div>`;
  };

  // ---------- Status tabs ----------
  const STRIP = ["net", "gw", "wifi", "sw", "pro", "clients"];
  function stripItems() {
    const ov = overall(), g = U.m.gateway, k = U.m.counts || {}, sws = devs().filter((d) => d.kind === "switch"), poe = sws.reduce((a, d) => a + (d.online ? d.poeUsed || 0 : 0), 0);
    return {
      net: { icon: ov.act ? wIcon(ov.act) : "globe", name: T("net.internet"), st: ov.cls || "idle", v: ov.act ? mb(ov.act.down) : wans().length ? T("net.st.down") : D, u: ov.act ? T("net.mbps") : "" },
      gw: { icon: "router", name: T("net.kind.gateway"), st: !g ? "idle" : !g.online ? "bad" : (g.cpu || 0) > 80 || !g.upToDate ? "warn" : "ok", v: g && isN(g.cpu) ? Math.round(g.cpu) : D, u: g && isN(g.cpu) ? "%" : "" },
      wifi: { icon: "wifi", name: T("net.wifi"), st: k.wireless == null ? "idle" : "ok", v: k.wireless ?? D, u: "" },
      sw: { icon: "netSwitch", name: T("net.switches"), st: !sws.length ? "idle" : sws.some((d) => !d.online) ? "bad" : sws.some((d) => d.poeWarn) ? "warn" : "ok", v: poe ? Math.round(poe) : D, u: poe ? "W" : "" },
      pro: { icon: "cctv", name: T("net.protect"), st: k.cameras ? "ok" : "idle", v: k.cameras ?? D, u: "" },
      clients: { icon: "users", name: T("net.clients"), st: k.clients == null ? "idle" : "ok", v: k.clients ?? D, u: "" },
    };
  }
  R.netstrip = (c, v) => {
    const o = c.o || {}, all = stripItems(), list = (Array.isArray(o.items) && o.items.length ? o.items : STRIP).filter((x) => all[x]);
    const tab = (id) => { const x = all[id];
      const val = `<span class="un-sv">${esc(x.v)}<u>${esc(x.u)}</u></span>`;
      if (v === "c") return `<button class="un-stab st ${x.st}"${Acts.on("net.go", id)}><span class="un-top">${ic(x.icon, 16)}${esc(x.name)}${dot(x.st === "ok" ? "" : x.st)}</span>${val}</button>`;
      return `<button class="un-stab${v === "b" ? " pl" : ""}"${Acts.on("net.go", id)}>${ic(x.icon, 20)}<span class="un-sn">${esc(x.name)}</span>${dot(x.st === "ok" ? "" : x.st)}${val}</button>`; };
    return `<div class="un-strip ${v}" style="--n:${list.length}">${list.map(tab).join("")}</div>`;
  };

  // ---------- Network map ----------
  const PRI = { switch: 0, nvr: 1, ups: 2, power: 3, ap: 4, cams: 5, camera: 5, doorbell: 5, bridge: 6, other: 7 };
  function mapGraph(o) {
    const m = U.m, top = m.topology || {}, N = new Map(), up = new Map((top.links || []).map((l) => [l.from, l]));
    for (const n of top.nodes || []) if (n.id !== "internet" && !(n.protect && o.protect === false)) N.set(n.id, { ...n, kids: [] });
    // (cameras: one bubble per switch they plug into, unless "each one")
    if (!o.camEach) for (const p of m.protect || []) {
      if (p.kind === "nvr" || !N.has(p.id) || !p.connectedTo || !N.has(p.connectedTo)) continue;
      N.delete(p.id);
      const gid = `pg:${p.connectedTo}`;
      if (!N.has(gid)) N.set(gid, { id: gid, kind: "cams", name: "", online: true, members: [], kids: [], sw: p.connectedTo });
      N.get(gid).members.push(p);
    }
    const gw = m.gateway && N.has(m.gateway.id) ? m.gateway.id : [...N.keys()].find((id) => !up.has(id) || !N.has(up.get(id).to)) || null;
    if (!gw) return null;
    N.forEach((n) => {
      if (n.id === gw) return;
      const l = up.get(n.id);
      n.link = l || null;
      n.parent = n.sw || (l && N.has(l.to) ? l.to : gw);
    });
    N.forEach((n) => { let p = n.parent, k = 0; const seen = new Set([n.id]); while (p && p !== gw && k++ < 60) { if (seen.has(p)) { n.parent = gw; break; } seen.add(p); p = N.get(p).parent; } });
    N.forEach((n) => { if (n.parent) N.get(n.parent).kids.push(n.id); });
    N.forEach((n) => n.kids.sort((a, b) => (PRI[N.get(a).kind] ?? 9) - (PRI[N.get(b).kind] ?? 9) || String(N.get(a).name).localeCompare(String(N.get(b).name))));
    return { N, root: gw };
  }
  function nodeInfo(n) {
    const d = devs().find((x) => x.id === n.id);
    if (n.kind === "cams") return { sub: T("net.map.camsOnline", { n: n.members.length }), st: "ok", load: 1 };
    if (n.protect) return { sub: kindWord(n.kind), st: "ok", load: 0 };
    if (!d) return { sub: kindWord(n.kind), st: n.online === false ? "bad" : "ok", load: 0 };
    const st = !d.online ? "bad" : !d.upToDate || d.poeWarn ? "warn" : "ok";
    if (!d.online) return { sub: T("net.offline"), st, load: 0 };
    if (d.kind === "gateway") return { sub: isN(d.cpu) ? T("net.map.cpu", { n: Math.round(d.cpu) }) : d.model || "", st, load: isN(d.cpu) ? d.cpu / 100 : 0 };
    if (d.kind === "switch") return { sub: isN(d.poeUsed) ? T("net.map.poe", { n: Math.round(d.poeUsed) }) : isN(d.portsUp) ? T("net.map.ports", { n: d.portsUp, of: d.portsTotal ?? "?" }) : d.model || "",
      st, load: isN(d.poeUsed) && d.poeBudget ? d.poeUsed / d.poeBudget : isN(d.portsUp) && d.portsTotal ? d.portsUp / d.portsTotal : 0 };
    if (d.kind === "ap") return { sub: isN(d.clients) ? T("net.map.clients", { n: d.clients }) : d.model || "", st, load: isN(d.clients) ? Math.min(1, d.clients / 30) : 0 };
    if (d.uplinkType === "wireless") return { sub: T("net.map.onWifi"), st, load: 0 };
    return { sub: d.model || kindWord(d.kind), st, load: 0 };
  }
  const CURVE = { a: (p, q) => [p, { x: (p.x + q.x) / 2, y: p.y }, { x: (p.x + q.x) / 2, y: q.y }, q], b: (p, q) => [p, { x: p.x, y: (p.y + q.y) / 2 }, { x: q.x, y: (p.y + q.y) / 2 }, q],
    c: (p, q) => [p, { x: p.x + (q.x - p.x) * 0.33, y: p.y + (q.y - p.y) * 0.33 }, { x: p.x + (q.x - p.x) * 0.66, y: p.y + (q.y - p.y) * 0.66 }, q] };
  const dpath = (p) => `M${p[0].x.toFixed(1)} ${p[0].y.toFixed(1)}C${p[1].x.toFixed(1)} ${p[1].y.toFixed(1)} ${p[2].x.toFixed(1)} ${p[2].y.toFixed(1)} ${p[3].x.toFixed(1)} ${p[3].y.toFixed(1)}`;
  const bez = (p, t) => { const u = 1 - t; return { x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x, y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y }; };
  // (v3.0.4) a port tag's place on its line — (v3.0.5) the first spot clear of every part, every name and every tag
  // already placed (busy: boxes [x0, y0, x1, y1]); no clear spot: no tag (it never covers a name)
  const tagAt = (p, busy, w) => { for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.2, 0.8]) { const q = bez(p, t);
    if (!busy.some((k) => q.x + w / 2 + 2 > k[0] && q.x - w / 2 - 2 < k[2] && q.y + 11 > k[1] && q.y - 11 < k[3])) return q; } return null; };
  const trunc = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  // (v3.0.5) a map name's drawn width in px (theme.css .um-n: 600 weight, the page's font), measured on a canvas
  const textW = (s, px, wt = 600) => {
    const c = textW.c || (textW.c = document.createElement("canvas").getContext("2d"));
    textW.f = textW.f || getComputedStyle(document.body).fontFamily || "sans-serif";
    c.font = `${wt} ${px.toFixed(1)}px ${textW.f}`;
    return c.measureText(s).width;
  };
  // (v3.0.5) the map's own space is the card itself, in pixels (network-map-305.html): the parts and their names keep
  // their size whatever the card's size — only the card's Style Icon size / Text size change them — and the arrange
  // area is the whole card (the title and the legend sit over it). The size: measured after it's drawn (U.px, its ResizeObserver: measure),
  // until then the grid's cell size (--g-cw / --g-rh, grid.js Grid.fit) or the screen's share
  U.px = {};
  function space(c) {
    const m = U.px[c.i]; if (m) return { W: m.w, H: m.h };
    const g = (window.Grid && Grid.cur) || {}, main = document.querySelector("main");
    const cw = main ? parseFloat(main.style.getPropertyValue("--g-cw")) : NaN, rh = main ? parseFloat(main.style.getPropertyValue("--g-rh")) : NaN;
    const w = cw > 0 ? (c.w || 6) * cw : ((c.w || 6) / (g.cols || 12)) * (innerWidth || 1280), h = rh > 0 ? (c.h || 4) * rh : ((c.h || 4) / (g.rows || 8)) * (innerHeight || 800);
    return { W: Math.round(cl(w, 200, 4000)), H: Math.round(cl(h, 150, 3000)) };
  }
  // the sizes: the card's Style Icon size / Text size (c.s.ic / c.s.tx, 50–250 %); the title's own (o.htx / o.hic)
  const pc = (v, d, a, b) => cl(isN(v) ? v : d, a, b) / 100;
  const mapSizes = (c) => { const s = c.s || {}, o = c.o || {}; return { ic: pc(s.ic, 100, 50, 250), tx: pc(s.tx, 100, 50, 250), hs: pc(o.htx, 100, 60, 180), hi: pc(o.hic, 100, 60, 180) }; };
  const nodeR = (n, root, ic) => (root ? 26 : n.protect && n.kind !== "nvr" ? 15 : n.kind === "cams" ? 17 : 19) * ic;
  // the automatic places ("Arrange for me" = no places of your own): the parts in layers — the internet lines, the
  // gateway (its UPS and power strips beside it), then each step down — spread over the whole card: A in columns left
  // to right, B in rows top down (a layer too long for one row wraps onto more), C round the gateway. Only when the parts
  // need more room than the card has is the space made bigger (the whole map drawn smaller, never on top of itself);
  // what still touches is nudged apart (the gateway and the internet lines stay put)
  function layout(G, v, sp, ws, k) {
    const { N, root } = G, pos = {}, { ic, tx, top, bot } = k;
    let { W, H: Hh } = sp, tight = false;
    const order = [], walk = (id, d) => { const n = N.get(id); n.depth = d; order.push(id); n.kids.forEach((x) => walk(x, d + 1)); };
    walk(root, 1);
    const side = (n) => n.parent === root && !n.kids.length && (n.kind === "ups" || n.kind === "power");
    const layers = [ws.map((w) => `wan:${w.key}`)];
    order.forEach((id) => { const n = N.get(id), d = side(n) ? 1 : n.depth; (layers[d] = layers[d] || []).push(id); });
    if (layers[1]) { const sideIds = layers[1].filter((id) => id !== root); layers[1] = [...sideIds.slice(0, Math.ceil(sideIds.length / 2)), root, ...sideIds.slice(Math.ceil(sideIds.length / 2))]; }
    // (v3.0.5) the names' room from their measured width (textW: the drawn font), not a fixed 112 px — long names in
    // looks B and C overlapped on a big screen; widest(n): the widest name cut to n characters
    const labels = [...ws.map((w) => String(w.name || "")), ...[...N.values()].map((n) => (n.kind === "cams" ? T("net.map.cams", { n: (n.members || []).length }) : String(n.name || "")))];
    const widest = (n) => Math.max(0, ...labels.map((x) => textW(trunc(x, n), 13.5 * tx)));
    const L = layers.filter((x) => x && x.length), r0 = 19 * ic, nameW0 = Math.max(112 * tx, widest(20) + 10 * tx), rowH = 2 * r0 + 36 * tx;
    const parentOf = (id) => (id.startsWith("wan:") ? null : id === root ? "wan" : N.get(id).parent);
    // (a crowded card: the names are shortened to the room each part has, the second line goes — only past that is the
    // space made bigger; need: one row's height, a part and the gateway's bigger one with a name between them)
    const need = (19 + 26) * ic + 24 * tx, fitName = (room) => Math.max(7, Math.floor(room / (7.4 * tx)));
    let nameMax = 20, left = true, nameW = nameW0;
    // (still touching after the nudging: the space a little bigger, laid out again — at most a few times)
    for (let tries = 0; tries < 6 && left; tries++) {
    if (tries) { W *= 1.15; Hh = top + bot + (Hh - top - bot) * 1.15; }
    tight = false; nameMax = 20; nameW = nameW0;
    for (const id of Object.keys(pos)) delete pos[id];
    if (v === "c") {
      Hh = Math.max(Hh, top + bot + 4 * rowH);
      const rest = order.filter((id) => id !== root), nL = Math.max(1, rest.filter((id) => !N.get(id).kids.length).length);
      // (the ring: room for every end part's name round 300° of it — else the space grows)
      const ring = () => [Math.max(nameW, W / 2 - nameW / 2 - 8), Math.max(rowH, (Hh - top - bot) / 2 - r0 - 22 * tx)];
      let [rx, ry] = ring();
      let want = nL * Math.max(2 * r0 + 16, nameW * 0.8), have = Math.PI * (rx + ry) * (300 / 360);
      // (v3.0.5) crowded: the names shortened and the second lines gone first — only then is the space made bigger
      if (want > have) {
        nameMax = Math.min(20, fitName(have / nL / 0.8 - 10 * tx)); nameW = Math.max(2 * r0 + 16, Math.min(nameW, widest(nameMax) + 10 * tx)); tight = true;
        [rx, ry] = ring(); want = nL * Math.max(2 * r0 + 16, nameW * 0.8); have = Math.PI * (rx + ry) * (300 / 360);
      }
      if (want > have) { const f = want / have; W *= f; Hh = top + bot + (Hh - top - bot) * f; [rx, ry] = ring(); }
      const cx = W / 2, cy = top + (Hh - top - bot) * 0.56;
      let leaf = 0; const ang = {};
      const place = (id) => { const n = N.get(id); if (!n.kids.length) ang[id] = leaf++; else { n.kids.forEach(place); ang[id] = (ang[n.kids[0]] + ang[n.kids[n.kids.length - 1]]) / 2; } };
      N.get(root).kids.forEach(place);
      const maxD = Math.max(2, ...rest.map((id) => N.get(id).depth));
      pos[root] = { x: cx, y: cy };
      rest.forEach((id) => { const n = N.get(id), a = (-60 + ((ang[id] + 0.5) / nL) * 300) * (Math.PI / 180), f = n.kids.length ? cl((n.depth - 1) / Math.max(1, maxD - 1), 0.4, 0.72) : 1;
        pos[id] = { x: cx + Math.cos(a) * rx * f, y: cy + Math.sin(a) * ry * f }; });
      ws.forEach((w, i) => { pos[`wan:${w.key}`] = { x: cx + (ws.length > 1 ? (i ? 1 : -1) * Math.min(230, W / 4) : 0), y: top + r0 + 4 }; });
    } else if (v === "b") {
      // rows: each layer wrapped to the card's width; a small layer joins the row above when there's room and its parents are higher up
      const m = r0 + 8, avail = Math.max(1, W - 2 * m), y0 = top + r0 + 4, yEnd = () => Hh - bot - r0 - 34 * tx;
      const rowsFor = (gap) => { const per = Math.max(1, Math.floor(avail / gap) + 1), rows = [], rowOf = {};
        L.forEach((lay) => { const last = rows[rows.length - 1];
          if (last && lay.length + last.length <= per && lay.every((id) => { const p = parentOf(id); return p && p !== "wan" && rowOf[p] < rows.length - 1; })) { lay.forEach((id) => { last.push(id); rowOf[id] = rows.length - 1; }); return; }
          for (let i = 0; i < lay.length; i += per) { const R = lay.slice(i, i + per); rows.push(R); R.forEach((id) => (rowOf[id] = rows.length - 1)); } });
        return rows; };
      let rows = rowsFor(Math.max(2 * r0 + 16, nameW));
      if (rows.length > 1 && (yEnd() - y0) / (rows.length - 1) < need) { const gap = Math.max(2 * r0 + 16, 74 * tx); rows = rowsFor(gap); nameMax = fitName(gap - 10); }
      let dy = rows.length > 1 ? (yEnd() - y0) / (rows.length - 1) : 0;
      if (rows.length > 1 && dy < need) { dy = need; Hh = y0 + dy * (rows.length - 1) + r0 + 34 * tx + bot; }
      tight = rows.length > 1 && dy < need + 12 * tx;
      rows.forEach((R, ri) => R.forEach((id, i) => { pos[id] = { x: m + ((i + 0.5) * avail) / R.length, y: rows.length > 1 ? y0 + ri * dy : (y0 + yEnd()) / 2 }; }));
    } else {
      // columns: each layer one column (wrapped onto more when it's taller than the card), left to right
      const m = r0 + 8, y0 = top + r0 + 4, yEnd = () => Hh - bot - r0 - 34 * tx, per = Math.max(1, Math.floor((yEnd() - y0 + need) / need)), cols = [];
      L.forEach((lay) => { for (let i = 0; i < lay.length; i += per) cols.push(lay.slice(i, i + per)); });
      let dx = cols.length > 1 ? (W - 2 * m) / (cols.length - 1) : 0;
      if (cols.length > 1 && dx < nameW) { if (dx < 70 * tx) { dx = 70 * tx; W = 2 * m + dx * (cols.length - 1); } nameMax = fitName(dx - 10); }
      const tallest = Math.max(...cols.map((x) => x.length));
      if ((yEnd() - y0 + need) / tallest < need) Hh = y0 + need * tallest - need + r0 + 34 * tx + bot;
      const span = yEnd() - y0 + need;   // (each part gets an equal share of the height, centered in it)
      tight = span / tallest < need + 12 * tx;
      cols.forEach((C, ci) => C.forEach((id, i) => { pos[id] = { x: cols.length > 1 ? m + ci * dx : W / 2, y: y0 - need / 2 + ((i + 0.5) * span) / C.length }; }));
    }
    // what still touches is nudged apart (the gateway and the internet lines stay put): each pair by its own sizes
    const ids = Object.keys(pos), fixed = (id) => id === root || id.startsWith("wan:"), rad = (id) => (id === root ? 26 * ic : r0);
    // (v3.0.5) a whole name's width and a little between (was 0.92 of a guessed width: neighbors' names overlapped)
    const nameBox = Math.max(2 * r0 + 12, Math.min(nameW, widest(nameMax) + 10 * tx)), below = (tight ? 20 : 34) * tx;
    const yMin = top + r0 + 2, yMax = Hh - bot - r0 - 30 * tx;
    left = false;
    for (let it = 0; it < 150; it++) {
      let moved = false;
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j]; if (fixed(a) && fixed(b)) continue;
        const A = pos[a], B = pos[b], BW = Math.max(rad(a) + rad(b) + 12, nameBox), BH = rad(a) + rad(b) + below + 4;
        const ox = BW - Math.abs(A.x - B.x), oy = BH - Math.abs(A.y - B.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const kk = ox / BW < oy / BH ? "x" : "y", d = (kk === "x" ? ox : oy) / 2 + 1, sg = Math.sign(B[kk] - A[kk]) || 1, fa = fixed(a) ? 0 : fixed(b) ? 2 : 1;
        A[kk] -= sg * d * fa; B[kk] += sg * d * (2 - fa);
      }
      ids.forEach((id) => { if (fixed(id)) return; pos[id].x = cl(pos[id].x, r0 + 3, W - r0 - 3); pos[id].y = cl(pos[id].y, yMin, Math.max(yMin, yMax)); });
      if (!moved) break;
      if (it === 149) left = true;
    }
    }
    return { W, H: Hh, pos, tight, nameMax };
  }
  // (v3.0.5) the automatic places kept per card: laid out again only when its parts (ids, kinds, who hangs under whom),
  // the look, the space (W / H) or the sizes change — not on every redraw (a read every 30 s, a tap on a part …)
  const layCache = {};
  function layoutFor(c, G, v, sp, ws, k) {
    const key = JSON.stringify([[...G.N.values()].map((n) => `${n.id}|${n.kind || ""}|${n.parent || ""}`), G.root, ws.map((w) => w.key), v, sp.W, sp.H, k.ic, k.tx, k.top, k.bot]);
    const hit = layCache[c.i];
    if (hit && hit.key === key) return hit.out;
    let out = layout(G, v, sp, ws, k);
    // (v3.0.5) a space made bigger is drawn smaller (its viewBox): the title's room (k.top, from the title size slider)
    // and the legend's are made bigger in step, so on the screen they still clear the title and the legend
    const scaleOf = (x) => Math.min(1, sp.W / x.W, sp.H / x.H);
    for (let i = 0, cur = k; i < 3; i++) {
      const kk = scaleOf(out), gap = (sp.H - out.H * kk) / 2;
      if (kk >= 0.999 || (cur.top * kk + gap >= k.top - 1 && cur.bot * kk + gap >= k.bot - 1)) break;
      cur = { ...k, top: Math.max(k.top, (k.top - gap) / kk), bot: Math.max(k.bot, (k.bot - gap) / kk) };
      const next = layout(G, v, sp, ws, cur);
      if (scaleOf(next) < kk * 0.7) break;   // (a short, crowded card: more room above only made it all much smaller)
      out = next;
    }
    layCache[c.i] = { key, out };
    return out;
  }
  function mapEdges(G, pos, v, ws, o) {
    const { N, root } = G, a = active(), cur = CURVE[v] || CURVE.a, out = [];
    const own = (n) => (n.members ? n.members.length : ((devs().find((d) => d.id === n.id) || {}).clients || 0) + (n.protect ? 1 : 0));
    const under = (id) => { const n = N.get(id); return own(n) + n.kids.reduce((s, k) => s + under(k), 0); };
    const tot = Math.max(1, under(root)), rate = a ? (a.down || 0) + (a.upload || 0) : 0;
    const speed = (share) => (o.follow === false ? 4 : cl(8 - 6.5 * Math.min(1, Math.sqrt(share) * 0.6 + Math.min(1, rate / 400) * 0.4), 1.2, 8));
    ws.forEach((w) => { const id = `wan:${w.key}`; out.push({ a: id, b: root, pts: cur(pos[id], pos[root]), k: w.up === false ? "bad" : w.active ? "on" : "idle", dur: speed(1), port: null }); });
    const walk = (id) => { const n = N.get(id); n.kids.forEach((k) => { const kn = N.get(k), off = kn.online === false || n.online === false, wl = !!(kn.link && kn.link.type === "wireless");
      const port = wl ? T("net.map.wifiMesh") : kn.members ? T("net.map.portsN", { list: kn.members.map((x) => x.port).filter((x) => x != null).slice(0, 3).join(", ") || "?" })
        : kn.link && kn.link.port != null ? T("net.map.port", { n: kn.link.port }) : null;
      out.push({ a: id, b: k, pts: cur(pos[id], pos[k]), k: off ? "off" : a ? "on" : "idle", wl, dur: speed(under(k) / tot), port }); walk(k); }); };
    walk(root);
    return out;
  }
  const eAttr = (e, ic) => { const col = e.k === "on" ? (e.wl ? "--c-wifi" : "--c-line") : e.k === "bad" ? "--c-bad" : "--c-idle";
    const dash = e.wl ? ' stroke-dasharray="1 7" stroke-linecap="round"' : e.k === "on" ? "" : ' stroke-dasharray="5 6"', w = Math.max(0.8, ic);
    return `style="stroke:var(${col})" stroke-width="${((e.wl ? 3 : e.k === "on" ? 2.4 : 1.7) * w).toFixed(1)}" opacity="${e.k === "on" ? 0.8 : e.k === "idle" ? 0.45 : e.k === "off" ? 0.25 : 0.85}"${dash}`; };
  const calm = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  // the orbs' layer drawn in the map's own space, scaled to where the drawing sits in its box (as "meet" places it),
  // paused when it can't be seen. (v3.0.5) A ResizeObserver on each map's box measures it (when it's first shown and on
  // every size change): a card drawn at another size than it was guessed at is drawn again at its real size — only that
  // card (U.px). A size change while a part is dragged waits for the drag's end (pxLater), then is tried again
  const ORBS_MAX = 10;
  const seenIO = window.IntersectionObserver ? new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("um-still", !e.isIntersecting))) : null;
  const pxLater = new Set(), watched = new Set();
  function fitOrbs(box) {
    const W = +box.dataset.w, Hh = +box.dataset.h, bw = box.offsetWidth, o = box.querySelector(".um-orbs"), svg = box.querySelector("svg.um");
    if (!o || !svg || !W || !Hh) return;
    const r = svg.getBoundingClientRect(), b = box.getBoundingClientRect(), z = bw ? b.width / bw : 1;   // (z: a scaled canvas)
    const w = r.width / z, h = r.height / z, k = Math.min(w / W, h / Hh);
    if (!(k > 0)) return;
    o.style.transform = `translate(${((r.left - b.left) / z + (w - W * k) / 2).toFixed(1)}px,${((r.top - b.top) / z + (h - Hh * k) / 2).toFixed(1)}px) scale(${k.toFixed(4)})`;
  }
  const mapBoxes = (id) => document.querySelectorAll(`.un-mapbox[data-map="${CSS.escape(id)}"]`);
  // only that card drawn again (its .un replaced); not found: the usual redraw
  function redrawMap(id) {
    const c = card(id); let done = false;
    if (c) mapBoxes(id).forEach((box) => { const el = box.closest(".un"); if (el && el.parentNode) { el.outerHTML = U.card(c).html; done = true; } });
    if (!done) H.refresh();
    watchMaps();
  }
  function measure(box) {
    if (!box.isConnected) return;
    const id = box.dataset.map, bw = box.offsetWidth, bh = box.offsetHeight;
    if (bw > 40 && bh > 40 && (Math.abs(bw - +box.dataset.sw) > 2 || Math.abs(bh - +box.dataset.sh) > 2)) {
      if (drag) { pxLater.add(id); return; }
      const was = U.px[id];
      if (!was || Math.abs(was.w - bw) > 2 || Math.abs(was.h - bh) > 2) { U.px[id] = { w: bw, h: bh }; redrawMap(id); return; }
    }
    fitOrbs(box);
  }
  const ro = window.ResizeObserver ? new ResizeObserver((es) => es.forEach((e) => measure(e.target))) : null;
  // the boxes just drawn are watched (each once); the ones gone from the page are let go
  function watchMaps() {
    for (const box of watched) if (!box.isConnected) { watched.delete(box); if (ro) ro.unobserve(box); if (seenIO) seenIO.unobserve(box); }
    document.querySelectorAll(".un-mapbox[data-map]").forEach((box) => {
      if (watched.has(box)) return;
      watched.add(box);
      if (seenIO) seenIO.observe(box);
      if (ro) ro.observe(box);
      measure(box);   // (its first size now — the observer's own first call may wait for a frame)
    });
  }
  let watchT = 0;
  const watchSoon = () => { if (!watchT) watchT = setTimeout(() => { watchT = 0; watchMaps(); }, 0); };
  const retryPx = () => { const ids = [...pxLater]; pxLater.clear(); ids.forEach((id) => mapBoxes(id).forEach(measure)); };
  // (a scaled canvas changes where the drawing sits without changing the box's size)
  window.addEventListener("resize", () => document.querySelectorAll(".un-mapbox[data-map]").forEach(fitOrbs));
  document.addEventListener("visibilitychange", () => document.documentElement.classList.toggle("un-hidden", document.hidden));
  // (v3.0.5) the card's own title: its own size (Card title size / Card icon size), over the map
  function mapHead(o, k, ov) {
    return `<div class="un-hd un-mhd" style="zoom:${k.hs.toFixed(2)}"><span class="un-hl">${ic("globe", Math.round((18 * k.hi) / k.hs))}<span class="un-lbl">${esc(o.title || T("net.mapTitle"))}</span></span>`
      + `<span class="un-hr">${ov.act ? `<small class="un-mut">${esc(T("net.map.on", { name: ov.act.name, n: mb(ov.act.down) }))}</small>` : ""}${pill(ov.cls, ov.text)}</span></div>`;
  }
  R.netmap = (c, v) => {
    const o = c.o || {}, ws = wans(), ov = overall(), G = mapGraph(o), k = mapSizes(c);
    if (!G) return head(o, "globe", T("net.mapTitle"), pill(ov.cls, ov.text)) + empty("globe", T("net.noDevices"));
    const sp = space(c), hd = mapHead(o, k, ov);
    k.top = 34 * k.hs + 14; k.bot = 22 + 8 * k.tx;
    const { W, H: Hh, pos: auto, tight, nameMax } = layoutFor(c, G, v, sp, ws, k), pos = {}, saved = o.pos && typeof o.pos === "object" ? o.pos : {};
    for (const [id, p] of Object.entries(auto)) { const q = saved[id]; pos[id] = Array.isArray(q) && q.length === 2 && isN(q[0]) && isN(q[1]) ? { x: (q[0] * W) / 1000, y: (q[1] * Hh) / 1000 } : p; }
    const E = mapEdges(G, pos, v, ws, o), moving = !calm(), arr = U.arranging === c.i, ic_ = k.ic, tx = k.tx;
    const lines = E.map((e) => `<path class="um-ln" data-a="${esc(e.a)}" data-b="${esc(e.b)}" d="${dpath(e.pts)}" fill="none" ${eAttr(e, ic_)}/>`).join("");
    // (v3.0.4) the orbs: a few small HTML dots over the drawing, each moved by a CSS transform along its line (points on
    // the curve as keyframes) — the compositor moves them, nothing is laid out per frame (SMIL animateMotion was ~130
    // layouts a second). One per line in use, the busiest lines first; none while stale, calm or arranging; paused
    // while the card is off screen or the page is hidden (um-still, un-hidden)
    const kid = `umk${String(c.i).replace(/[^\w-]/g, "_")}`;
    const run = !moving || arr || U.m.stale ? [] : E.filter((e) => e.k === "on").sort((a, b) => a.dur - b.dur).slice(0, ORBS_MAX);
    // (v3.0.5) placed and scaled into the card's own size from the start (fitOrbs corrects it once measured): at the
    // drawing's own W × H it stuck out of a crowded card and made the whole card's box bigger
    const ok_ = Math.min(1, sp.W / W, sp.H / Hh), otr = `translate(${((sp.W - W * ok_) / 2).toFixed(1)}px,${((sp.H - Hh * ok_) / 2).toFixed(1)}px) scale(${ok_.toFixed(4)})`;
    const orbs = !run.length ? "" : `<div class="um-orbs" style="width:${W}px;height:${Hh.toFixed(1)}px;transform:${otr};--oz:${Math.max(0.8, ic_).toFixed(2)}"><style>${run.map((e, i) => `@keyframes ${kid}-${i}{`
      + Array.from({ length: 17 }, (_, j) => { const q = bez(e.pts, j / 16); return `${(j * 6.25).toFixed(2)}%{transform:translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px)}`; }).join("") + "}").join("")}</style>`
      + run.map((e, i) => `<i class="um-o${e.wl ? " w" : ""}" style="animation:${kid}-${i} ${e.dur.toFixed(2)}s linear -${((i * 0.37) % 1 * e.dur).toFixed(2)}s infinite"></i>`).join("") + "</div>";
    watchSoon();   // (v3.0.5 the new box is measured by its ResizeObserver)
    // each part and its name: the names at the card's edges line up to the edge (not cut off)
    const parts = [];
    ws.forEach((w) => parts.push({ id: `wan:${w.key}`, r: 19 * ic_, icon: wIcon(w), label: w.name, sub: w.active && w.up !== false ? T("net.map.rates", { d: mb(w.down), u: mb(w.upload) }) : stWord(w),
      st: w.up === false ? "bad" : w.active ? (w.state === "slow" ? "warn" : "ok") : "idle", load: w.active ? cl((w.down || 0) / 300, 0.05, 1) : 0, off: !w.active && w.up !== false }));
    G.N.forEach((n) => { const inf = nodeInfo(n), root = n.id === G.root;
      parts.push({ id: n.id, r: nodeR(n, root, ic_), icon: KIND_IC[n.kind] || "chip", label: n.kind === "cams" ? T("net.map.cams", { n: n.members.length }) : n.name, sub: inf.sub, st: inf.st, load: inf.load, off: n.online === false }); });
    // (v3.0.5) each name's half-width first (nw): lined up to the card's edge only when centered it would cross it
    // (v3.0.5: measured — textW)
    const NW = new Map(parts.map((x) => [x.id, Math.max(textW(trunc(String(x.label), nameMax), 13.5 * tx), tight ? 0 : textW(trunc(String(x.sub || ""), nameMax + 2), 11.5 * tx, 400)) / 2 + 4]));
    const anchor = (p, r, nw) => (p.x - nw < 4 ? ["start", -r] : p.x + nw > W - 4 ? ["end", r] : ["middle", 0]);
    const busy = parts.map((x) => { const p = pos[x.id], r = x.r + 6;
      const nw = NW.get(x.id), [an] = anchor(p, x.r, nw), l = an === "start" ? p.x - r : an === "end" ? p.x + r - 2 * nw : p.x - nw;
      return [Math.min(p.x - r, l), p.y - r, Math.max(p.x + r, l + 2 * nw), p.y + r + (tight ? 22 : 36) * tx]; });
    let ports = "";
    if (o.ports) for (const e of E) {
      if (!e.port) continue;
      const w = Math.round(e.port.length * 6.4 + 14), q = tagAt(e.pts, busy, w);
      if (!q) continue;
      busy.push([q.x - w / 2, q.y - 9, q.x + w / 2, q.y + 9]);
      ports += `<g class="um-plab" transform="translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})"><rect x="${-w / 2}" y="-9" width="${w}" height="18" rx="9"/><text text-anchor="middle" y="4">${esc(e.port)}</text></g>`;
    }
    const portOf = new Map(E.map((e) => [e.b, e.port]));
    const nodes = parts.map((x) => {
      const p = pos[x.id], r = x.r, circ = 2 * Math.PI * (r + 5), tip = portOf.get(x.id), [an, ax] = anchor(p, r, NW.get(x.id)), s = Math.round(r * 1.1);
      return `<g class="um-nd${x.off ? " off" : ""}" data-node="${esc(x.id)}" data-r="${r.toFixed(1)}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})"${Acts.on("net.pop", c.i, x.id)}>${tip ? `<title>${esc(tip)}</title>` : ""}`
        + `<circle r="${(r + 14).toFixed(1)}" fill="transparent"/><circle r="${(r + 9).toFixed(1)}" class="um-halo"/><circle r="${(r + 5).toFixed(1)}" class="um-track"/>`
        + `<circle r="${(r + 5).toFixed(1)}" class="um-load" stroke-dasharray="${(cl(x.load, 0, 1) * circ).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90)"/><circle class="um-core" r="${r.toFixed(1)}"/>`
        + `<g transform="translate(${(-s / 2).toFixed(1)} ${(-s / 2).toFixed(1)})">${ic(x.icon, s)}</g>`
        + (x.st && x.st !== "idle" ? `<circle cx="${(r * 0.72).toFixed(1)}" cy="${(-r * 0.72).toFixed(1)}" r="${(5 * Math.max(0.8, ic_)).toFixed(1)}" class="um-st ${x.st}"/>` : "")
        + `<text class="um-n" x="${ax.toFixed(1)}" y="${(r + 17 * tx).toFixed(1)}" font-size="${(13.5 * tx).toFixed(1)}" text-anchor="${an}">${esc(trunc(String(x.label), nameMax))}</text>`
        + (tight ? "" : `<text class="um-s" x="${ax.toFixed(1)}" y="${(r + 31 * tx).toFixed(1)}" font-size="${(11.5 * tx).toFixed(1)}" text-anchor="${an}">${esc(trunc(String(x.sub || ""), nameMax + 2))}</text>`) + `</g>`;
    }).join("");
    // (v3.0.5) snapping is on unless switched off; its dots cover the whole card while you arrange
    const grid = arr && o.snap !== false ? `<defs><pattern id="umg-${esc(c.i)}" width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="12.5" cy="12.5" r="1.2" fill="rgba(222,212,255,.3)"/></pattern></defs><rect width="${W}" height="${Hh.toFixed(1)}" fill="url(#umg-${esc(c.i)})"/>` : "";
    const glow = cl(isN(o.glow) ? o.glow : 60, 0, 100) / 100;
    const leg = `<div class="un-mleg" style="font-size:${(11 * tx).toFixed(1)}px"><span><i style="background:var(--c-line)"></i>${esc(T("net.map.traffic"))}</span><span><i class="dw"></i>${esc(T("net.map.wifiMesh"))}</span>`
      + `<span><i class="di"></i>${esc(T("net.map.standby"))}</span><span><i class="db"></i>${esc(T("net.st.down"))}</span>${arr ? `<span class="un-arr">${esc(T("net.map.dragHint"))}</span>` : ""}</div>`;
    return `<div class="un-mapbox${arr ? " arr" : ""}" data-map="${esc(c.i)}" data-w="${W}" data-h="${Hh.toFixed(1)}" data-look="${v}" data-tx="${tx.toFixed(2)}" data-sw="${sp.W}" data-sh="${sp.H}" style="--glow:${glow}">`
      + `<svg class="um" viewBox="0 0 ${W} ${Hh.toFixed(1)}" preserveAspectRatio="xMidYMid meet">${grid}${lines}${nodes}${ports}</svg>${orbs}${pop(c, G)}</div>${hd}${leg}`;
  };
  // a part's details (a tap on it)
  function pop(c, G) {
    const id = S(c.i).pop; if (!id) return "";
    const rows = [], close = `<button class="un-x"${Acts.on("net.pop", c.i, null)} aria-label="${esc(T("common.close"))}">${window.icon("x", 16)}</button>`;
    let icon = "chip", name = "", sub = "";
    if (id.startsWith("wan:")) {
      const w = wans().find((x) => `wan:${x.key}` === id); if (!w) return "";
      icon = wIcon(w); name = w.name; sub = `${w.slot} · ${stWord(w)}`;
      rows.push(kv(T("net.uptimePct"), esc(avail(w.availability))), kv(T("net.latencyNow"), esc(ms(w.latency))), kv(T("net.throughput"), `${rate("dn", w.down)} ${rate("up", w.upload)}`));
    } else {
      const n = G.N.get(id); if (!n) return "";
      const d = devs().find((x) => x.id === id);
      icon = KIND_IC[n.kind] || "chip";
      if (n.kind === "cams") { name = T("net.map.cams", { n: n.members.length }); sub = T("net.map.onSwitch", { name: (G.N.get(n.sw) || {}).name || "" });
        rows.push(...n.members.slice(0, 8).map((p) => kv(p.name, esc(p.port != null ? T("net.map.port", { n: p.port }) : D)))); }
      else if (!d) { name = n.name; sub = kindWord(n.kind); }
      else {
        name = d.name; sub = `${d.model || kindWord(d.kind)} · ${d.online ? T("net.online") : T("net.offline")}`;
        if (isN(d.uptime)) rows.push(kv(T("net.uptime"), esc(upFor(d.uptime))));
        if (isN(d.clients)) rows.push(kv(T("net.clients"), String(d.clients)));
        if (isN(d.portsUp)) rows.push(kv(T("net.portsUp"), esc(`${d.portsUp} / ${d.portsTotal ?? "?"}`)));
        if (isN(d.poeUsed)) rows.push(kv(T("net.poe"), esc(`${Math.round(d.poeUsed)} / ${isN(d.poeBudget) ? Math.round(d.poeBudget) : D} W`)));
        if (isN(d.cpu)) rows.push(kv(T("net.cpu"), esc(pct(d.cpu))));
        if (isN(d.temp)) rows.push(kv(T("net.temp"), esc(temp(d.temp))));
        if (d.uplinkType) rows.push(kv(T("net.uplink"), esc(d.uplinkType === "wireless" ? T("net.map.wifiMesh") : [(G.N.get(n.parent) || {}).name, d.uplinkPort != null ? T("net.map.port", { n: d.uplinkPort }) : null].filter(Boolean).join(" · ") || T("net.wired"))));
        rows.push(kv(T("net.firmware"), esc(T(d.upToDate ? "net.upToDate" : "net.updateReady")), d.upToDate ? "" : "warnv"));
      }
    }
    return `<div class="un-mpop"><div class="un-hd"><span class="un-hl">${ic(icon, 18)}<b>${esc(name)}</b></span>${close}</div><small class="un-mut">${esc(sub)}</small>${rows.join("")}</div>`;
  }

  // ---------- UniFi devices ----------
  R.netdevs = (c, v) => {
    const o = c.o || {}, ds = devs().slice().sort((a, b) => KORDER.indexOf(a.kind) - KORDER.indexOf(b.kind) || a.name.localeCompare(b.name)), on = ds.filter((d) => d.online).length;
    const hd = head(o, "list", T("net.devsTitle"), pill(on < ds.length ? "bad" : "ok", T("net.nOnline", { n: on, of: ds.length })));
    if (!ds.length) return hd + empty("list", T("net.noDevices"));
    const dc = (d) => (!d.online ? "bad" : !d.upToDate ? "warn" : "");
    const row = (d, one) => `<div class="un-row">${dot(dc(d))}<span class="un-rn">${esc(d.name)}${one ? `<small>${esc(`${d.model || kindWord(d.kind)}${d.upToDate ? "" : ` · ${T("net.updateReady")}`}`)}</small>` : ""}</span>${d.online ? "" : `<span class="un-rv badv">${esc(T("net.offline"))}</span>`}</div>`;
    const kinds = KORDER.filter((k) => ds.some((d) => d.kind === k));
    if (v === "b") return hd + `<div class="un-scroll un-tiles">${kinds.map((k) => { const g = ds.filter((d) => d.kind === k), n = g.filter((d) => d.online).length;
      return `<div class="un-tile${n < g.length ? " bad" : ""}"><span class="un-tl">${ic(KIND_IC[k], 16)}${esc(T(`net.kinds.${k}`))}</span><span class="un-tv">${n}<u>/ ${g.length}</u></span><small>${esc(g.map((d) => d.name).join(", "))}</small></div>`; }).join("")}</div>`;
    if (v === "c") {
      const bad = ds.filter((d) => !d.online), upd = ds.filter((d) => d.online && !d.upToDate);
      return hd + (bad.length || upd.length ? `<div class="un-scroll">${bad.length ? `<div class="un-sec">${esc(T("net.offline"))}</div>${bad.map((d) => row(d, true)).join("")}` : ""}${upd.length ? `<div class="un-sec">${esc(T("net.updateReady"))}</div>${upd.map((d) => row(d, true)).join("")}` : ""}</div>`
        : `<div class="un-need okv">${window.icon("check", 30)}<b>${esc(T("net.allOnline", { n: ds.length }))}</b><span>${esc(T("net.andUpToDate"))}</span></div>`)
        + `<div class="un-foot">${esc(T("net.devsFoot", { n: on, of: ds.length, u: ds.filter((d) => !d.upToDate).length }))}</div>`;
    }
    const cols = o.cols === 2 ? 2 : 1, list = (l) => `<div class="un-dlist" style="--cols:${cols}">${l.map((d) => row(d, cols === 1)).join("")}</div>`;
    return hd + `<div class="un-scroll">${o.group ? kinds.map((k) => `<div class="un-sec">${esc(T(`net.kinds.${k}`))}</div>${list(ds.filter((d) => d.kind === k))}`).join("") : list(ds)}</div>`;
  };

  // ---------- PoE power ----------
  const arc = (cx, cy, r, a0, a1) => { const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)], [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  R.netpoe = (c, v) => {
    const o = c.o || {}, sws = devs().filter((d) => d.kind === "switch" && (isN(d.poeBudget) || isN(d.poeUsed) || (d.poeTop || []).length)), pick = sws.find((d) => d.id === o.sw) || null;
    const hd = head(o, "bolt", T("net.poeTitle"), sws.length ? pill("", pick ? pick.name : sws.length > 1 ? T("net.allSwitches") : sws[0].name) : "");
    if (!sws.length) return hd + empty("bolt", T("net.noPoe"));
    const use = pick ? [pick] : sws, used = use.reduce((a, d) => a + (d.poeUsed || 0), 0), bud = use.reduce((a, d) => a + (d.poeBudget || 0), 0), f = bud ? used / bud : null;
    const ports = use.flatMap((d) => (d.poeTop || []).map((p) => ({ ...p, sw: d.name }))).filter((p) => isN(p.watts)).sort((a, b) => b.watts - a.watts);
    const temps = use.map((d) => d.temp).filter(isN), hot = temps.length ? Math.max(...temps) : null, warn = use.some((d) => d.poeWarn);
    const pn = (p) => esc(p.device || p.name || T("net.portN", { n: p.port ?? "?" })) + (use.length > 1 ? ` <small class="un-mut">· ${esc(p.sw)}</small>` : "");
    if (v === "c") return hd + `<div class="un-scroll">${sws.map((d) => { const g = d.poeBudget ? (d.poeUsed || 0) / d.poeBudget : null;
      return `<div class="un-psw"><div><b>${esc(d.name)}</b><span>${esc(`${isN(d.poeUsed) ? Math.round(d.poeUsed) : D} / ${isN(d.poeBudget) ? Math.round(d.poeBudget) : D} W`)}</span></div>`
        + `<div class="un-bar"><i style="width:${g == null ? 0 : cl(g * 100, 0, 100)}%;background:var(${d.poeWarn ? "--c-warn" : "--c-gauge"})"></i></div><small class="un-mut">${esc(`${d.model || ""}${isN(d.temp) ? ` · ${temp(d.temp)}` : ""}`)}</small></div>`; }).join("")}</div>`;
    if (v === "b") { const mx = Math.max(1, ...ports.map((p) => p.watts));
      return hd + `<div class="un-pbig"><b>${Math.round(used)}<u>W</u></b><span class="un-mut">${esc(T("net.ofW", { n: bud ? Math.round(bud) : D }))}${f != null ? ` · ${Math.round(f * 100)} %` : ""}</span></div>`
        + `<div class="un-scroll">${ports.slice(0, 9).map((p) => `<div class="un-pbar"><span class="un-rn">${pn(p)}</span><div class="un-bar"><i style="width:${(p.watts / mx) * 100}%;background:var(--c-port)"></i></div><b>${p.watts.toFixed(1)} W</b></div>`).join("") || `<div class="un-mut">${esc(T("net.noPorts"))}</div>`}</div>`
        + `<div class="un-foot">${window.icon("thermo", 15)}${esc(T("net.switchTemp", { t: temp(hot) }))}</div>`; }
    const a0 = 150, a1 = 390, ang = a0 + (f == null ? 0 : cl(f, 0, 1)) * (a1 - a0);
    return hd + `<div class="un-gauge"><svg viewBox="0 0 160 126"><path d="${arc(80, 78, 62, a0, a1)}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="11" stroke-linecap="round"/>`
      + (f ? `<path d="${arc(80, 78, 62, a0, Math.max(a0 + 1, ang))}" fill="none" style="stroke:var(${warn ? "--c-warn" : "--c-gauge"})" stroke-width="11" stroke-linecap="round"/>` : "")
      + `</svg><div class="un-gv"><b>${Math.round(used)}<small> W</small></b><small>${esc(T("net.ofW", { n: bud ? Math.round(bud) : D }))}</small></div></div>`
      + `<div class="un-scroll">${ports.slice(0, 8).map((p) => `<div class="un-row">${window.icon("bolt", 15)}<span class="un-rn">${pn(p)}</span><span class="un-rv">${p.watts.toFixed(1)} W</span></div>`).join("") || `<div class="un-mut">${esc(T("net.noPorts"))}</div>`}</div>`
      + `<div class="un-foot">${window.icon("thermo", 15)}${esc(T("net.switchTemp", { t: temp(hot) }))}${f != null ? `<span class="${warn ? "warnv" : ""}">${esc(T("net.ofBudget", { n: Math.round(f * 100) }))}</span>` : ""}</div>`;
  };

  // ---------- Clients (never the cameras or the recorder: they're in the Protect room) ----------
  const CLF = ["all", "wired", "wifi", "guest"];
  const pass = (k, f) => (f === "wired" ? k.wired : f === "wifi" ? !k.wired : f === "guest" ? k.guest : true);
  const sig = (s) => (!isN(s) ? 0 : s >= -55 ? 4 : s >= -63 ? 3 : s >= -71 ? 2 : 1);
  const sigH = (k) => (k.wired ? `<span class="un-mut">${D}</span>` : !isN(k.signal) ? D : `<span class="un-sig l${sig(k.signal)}"><i></i><i></i><i></i><i></i></span>`);
  const cIc = (k) => `<span class="un-ci">${ic(CL_IC[k.icon] || "chip", 18)}</span>`;
  const cName = (k) => `<div class="un-cname">${cIc(k)}<span><b>${esc(k.name)}</b><small class="${k.named ? "un-named" : ""}">${esc(T(k.named ? "net.cl.named" : "net.cl.own"))}</small></span></div>`;
  const conn = (k) => (!k.connectedToName ? D : esc(k.connectedToName) + (k.wired ? (k.port != null ? ` <small class="un-mut">· ${esc(T("net.map.port", { n: k.port }))}</small>` : "") : k.band ? ` <small class="un-mut">· ${esc(k.band)}</small>` : ""));
  const typeW = (k) => T(`net.ct.${CL_IC[k.icon] ? k.icon.replace("-", "") : "other"}`);
  function clSorted(c) {
    const o = c.o || {}, s = S(c.i), f = s.f || (CLF.includes(o.filter) ? o.filter : "all"), key = s.sort || o.sort || "name", dir = s.dir || 1;
    const val = (k) => (key === "type" ? typeW(k) : key === "network" ? k.network || "~" : key === "ssid" ? (k.wired ? "~" : k.ssid || "~") : key === "conn" ? `${k.connectedToName || "~"}${String(k.port ?? "").padStart(3, "0")}`
      : key === "signal" ? (k.wired ? -999 : isN(k.signal) ? k.signal : -998) : key === "traffic" ? k.traffic || 0 : k.name.toLowerCase());
    return { f, key, dir, list: ((U.m && U.m.clients) || []).filter((k) => pass(k, f)).sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "number" ? x - y : String(x).localeCompare(String(y))) * dir || a.name.localeCompare(b.name); }) };
  }
  const COLS = [["name", "net.col.name"], ["type", "net.col.type"], ["ssid", "net.col.wifi"], ["conn", "net.col.conn"], ["signal", "net.col.signal"], ["traffic", "net.col.traffic"]];
  R.netclients = (c, v) => {
    const o = c.o || {}, all = (U.m && U.m.clients) || [], { f, key, dir, list } = clSorted(c);
    const hd = head(o, "users", T("net.clients"), pill("acc", T("net.nOf", { n: list.length, of: all.length })));
    const bar = `<div class="un-cbarf"><div class="un-seg">${CLF.map((x) => `<button class="${f === x ? "on" : ""}"${Acts.on("net.f", c.i, x)}>${esc(T(`net.f.${x}`))}<em>${all.filter((k) => pass(k, x)).length}</em></button>`).join("")}</div>`
      + `<small class="un-mut un-camnote">${window.icon("cctv", 14)}${esc(T("net.camsElsewhere"))}</small></div>`;
    if (!list.length) return hd + bar + empty("search", T("net.noClients"));
    let body;
    if (v === "b") body = `<div class="un-ctiles">${list.map((k) => `<div class="un-ctile">${cName(k)}<span class="un-ctm">${ic(k.wired ? "wired" : "wifi", 14)}<span>${k.wired ? esc(T("net.wired")) : esc(k.ssid || D)} · ${conn(k)}</span></span>`
      + `<span class="un-ctm sp">${sigH(k)}<span>${esc(`${bytes(k.traffic)} · ${upFor(k.uptime)}`)}</span></span></div>`).join("")}</div>`;
    else if (v === "c") {
      const groups = new Map(); list.forEach((k) => { const g = k.connectedToName || T("net.unknown"); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k); });
      const kindOf = (name) => (devs().find((d) => d.name === name) || {}).kind;
      body = [...groups.entries()].sort((a, b) => (kindOf(a[0]) === "ap" ? 0 : 1) - (kindOf(b[0]) === "ap" ? 0 : 1) || b[1].length - a[1].length).map(([g, l]) => `<div class="un-cgrp"><div class="un-gh">${ic(KIND_IC[kindOf(g)] || "chip", 16)}${esc(g)}<small>${esc(T(kindOf(g) === "ap" ? "net.onWifiN" : "net.pluggedN", { n: l.length }))}</small></div>`
        + l.map((k) => `<div class="un-gr">${cName(k)}<span class="un-mut">${esc(k.wired ? (k.port != null ? T("net.map.port", { n: k.port }) : T("net.wired")) : `${k.ssid || D}${k.band ? ` · ${k.band}` : ""}`)}</span>${sigH(k)}<span class="un-num">${esc(bytes(k.traffic))}</span></div>`).join("") + `</div>`).join("");
    } else body = `<table class="un-ctab"><thead><tr>${COLS.map(([k, w]) => `<th class="${key === k ? "on" : ""}"><button${Acts.on("net.sort", c.i, k)}>${esc(T(w))}${key === k ? (dir > 0 ? " ▲" : " ▼") : ""}</button></th>`).join("")}</tr></thead><tbody>`
      + list.map((k) => `<tr><td>${cName(k)}</td><td class="un-mut">${esc(typeW(k))}</td><td>${k.wired ? `<span class="un-mut">${esc(T("net.wired"))}</span>` : esc(k.ssid || D)}${k.guest ? ` ${pill("warn", T("net.guestW"))}` : ""}</td><td>${conn(k)}</td><td>${sigH(k)}</td><td class="un-num">${esc(bytes(k.traffic))}</td></tr>`).join("") + `</tbody></table>`;
    return hd + bar + `<div class="un-scroll">${body}</div>`;
  };

  // ---------- Client log ----------
  const EV = { join: ["net.ev.join", "plus"], leave: ["net.ev.leave", "minus"], move: ["net.ev.move", "roam"] };
  R.netlog = (c, v) => {
    const o = c.o || {}, E = (U.m && U.m.log) || [];
    const hd = head(o, "clock", T("net.logTitle"));
    const where = (e) => [...(e.kind === "move" ? [`${e.from ? `${e.from} → ` : ""}${e.to || D}`] : [e.wired ? T("net.wired") : null, e.to]), o.wifi !== false ? e.ssid : null].filter(Boolean).join(" · ");
    const row = (e, dense) => `<div class="un-ev"><span class="un-eic ${e.kind}">${ic(EV[e.kind] ? EV[e.kind][1] : "plus", 16)}</span><span class="un-et"><b>${esc(e.name)}${e.new ? `<span class="un-newb">${esc(T("net.newBadge"))}</span>` : ""} <span class="un-mut">${esc(T((EV[e.kind] || EV.join)[0]))}</span></b>`
      + `${dense ? "" : `<small>${esc(where(e))}</small>`}</span><time>${esc(when(e.at))}</time></div>`;
    if (!E.length) return hd + empty("clock", T("net.logEmpty"));
    if (v === "c") {
      const day = Date.now() / 1000 - 86400, d = E.filter((e) => e.at >= day), n = (k) => d.filter((e) => e.kind === k).length;
      return hd + `<div class="un-sec">${esc(T("net.lastDay"))}</div><div class="un-lcnt">${[["join", "net.cnt.join"], ["leave", "net.cnt.leave"], ["move", "net.cnt.move"]].map(([k, w]) => `<div class="un-tile"><span class="un-tl">${ic(EV[k][1], 15)}${esc(T(w))}</span><span class="un-tv">${n(k)}</span></div>`).join("")}`
        + `<div class="un-tile"><span class="un-tl">${ic("plus", 15)}${esc(T("net.cnt.new"))}</span><span class="un-tv">${d.filter((e) => e.new).length}</span></div></div><div class="un-sec">${esc(T("net.latest"))}</div><div class="un-scroll">${E.slice(0, 8).map((e) => row(e)).join("")}</div>`;
    }
    return hd + `<div class="un-scroll${v === "b" ? " dense" : ""}">${E.slice(0, v === "b" ? 80 : 50).map((e) => row(e, v === "b")).join("")}</div>`;
  };

  // ---------- Network values: single values for any room's card (a tap opens the room with the full card) ----------
  const VALS = ["inet", "line", "ping", "gw", "poe", "wifi", "wired", "clients", "devs"], VALS0 = ["inet", "line", "ping", "wifi", "devs"];
  function valItems() {
    const ov = overall(), a = ov.act, k = U.m.counts || {}, g = U.m.gateway, ds = devs(), on = ds.filter((d) => d.online).length;
    const poe = ds.filter((d) => d.kind === "switch" && d.online).reduce((s, d) => s + (d.poeUsed || 0), 0);
    return {
      inet: { icon: "globe", label: T("net.internet"), val: ov.cls === "ok" ? T("net.online") : ov.text, dot: ov.cls === "ok" ? "" : ov.cls || "idle" },
      line: { icon: a ? wIcon(a) : "globe", label: T("net.v.line"), val: a ? a.name : T("net.v.none") },
      ping: { icon: "gauge", label: T("net.v.ping"), val: a ? ms(a.latency) : D },
      gw: { icon: "router", label: T("net.kind.gateway"), val: g && isN(g.cpu) ? T("net.map.cpu", { n: Math.round(g.cpu) }) : D, dot: !g ? "idle" : !g.online ? "bad" : "" },
      poe: { icon: "bolt", label: T("net.poe"), val: `${Math.round(poe)} W` },
      wifi: { icon: "wifi", label: T("net.v.wifi"), val: k.wireless ?? D },
      wired: { icon: "wired", label: T("net.v.wired"), val: k.wired ?? D },
      clients: { icon: "users", label: T("net.clients"), val: k.clients ?? D },
      devs: { icon: "list", label: T("net.devsTitle"), val: T("net.nOnline", { n: on, of: ds.length }), dot: on < ds.length ? "bad" : "" },
    };
  }
  R.netvals = (c, v) => {
    const o = c.o || {}, all = valItems(), list = (Array.isArray(o.vals) && o.vals.length ? o.vals : VALS0).filter((x) => all[x]);
    const dt = (x) => (x.dot != null ? dot(x.dot) : "");
    const it = (id) => { const x = all[id];
      if (v === "b") return `<button class="un-vrow"${Acts.on("net.go", id)}><span class="un-vi">${ic(x.icon, 18)}</span><span>${esc(x.label)}</span><b>${dt(x)}${esc(x.val)}</b>${window.icon("chevron", 16)}</button>`;
      if (v === "c") return `<button class="un-vtile"${Acts.on("net.go", id)}><span><span class="un-vi">${ic(x.icon, 16)}</span>${esc(x.label)}</span><b>${dt(x)}${esc(x.val)}</b></button>`;
      return `<button class="un-vchip${x.dot === "bad" ? " bad" : ""}"${Acts.on("net.go", id)}><span class="un-vi">${ic(x.icon, 16)}</span><span>${esc(x.label)}</span>${dt(x)}<b>${esc(x.val)}</b></button>`; };
    return (o.title ? `<div class="gc-t">${esc(o.title)}</div>` : "") + `<div class="un-vals ${v}">${list.map(it).join("")}</div>`;
  };

  // ---------- (v3.0.5) UPS / battery backup (unifi-v2.html "UPS"; read only — Skypane never sends a UPS a command) ----------
  // From GET /api/panel/<id>/ups (U.ups): a UniFi UPS (UniFi Network's own device list) and a NUT server's UPSes
  // (service/nut_ups.py, Manager → Integrations → UPS). A: the battery; B: the readings; C: every UPS as a row.
  const UPS_ST = { mains: ["mains", "net.ups.st.mains"], battery: ["batt", "net.ups.st.batt"], low: ["low", "net.ups.st.low"], off: ["low", "net.ups.st.off"] };
  const upsSt = (u) => UPS_ST[!u.online ? "off" : UPS_ST[u.state] ? u.state : "mains"];
  const runW = (s) => (!isN(s) ? D : s >= 3600 ? T("net.ups.runH", { h: Math.floor(s / 3600), m: Math.round((s % 3600) / 60) }) : T("net.ups.runM", { m: Math.max(1, Math.round(s / 60)) }));
  const volts = (v) => (isN(v) ? `${Math.round(v)} V` : D);   // i18n-ok (unit)
  const UPS_EV = { battery: "net.ups.ev.battery", low: "net.ups.ev.low", mains: "net.ups.ev.mains" };
  const upsLast = (u) => (u.last && UPS_EV[u.last.kind] ? T(UPS_EV[u.last.kind], { t: when(u.last.at) }) : T("net.ups.ev.none"));
  const upsTag = (u) => { const [k, w] = upsSt(u); return `<span class="un-ups-st ${k}"><span class="un-dot"></span>${esc(T(w))}</span>`; };
  const upsSrc = (u) => `<span class="un-pill">${esc(T(u.src === "nut" ? "net.ups.srcNut" : "net.ups.srcUnifi"))}</span>`;
  // (v3.0.5) a UPS that isn't answering: its last charge, runtime and load are old — grayed (the API's "stale" when it
  // says, else the row's own state: not online). old(u, html): the value wrapped in .un-old when it's old
  const upsOld = (u) => (u.stale != null ? !!u.stale : !u.online);
  const old = (u, h) => (upsOld(u) ? `<span class="un-old">${h}</span>` : h);
  const upsRow = (u) => `<div class="un-upsrow${upsOld(u) ? " un-stale" : ""}"><span class="un-rn"><b>${esc(u.name)}</b>${upsSrc(u)}</span><b class="un-num">${old(u, esc(pct(u.charge)))}</b>${upsTag(u)}`
    + `<span class="un-mut un-num">${old(u, esc(T("net.ups.left", { t: runW(u.runtime) })))}</span><div class="un-bar"><i style="width:${isN(u.charge) ? cl(u.charge, 0, 100) : 0}%;background:var(${upsSt(u)[0] === "low" ? "--c-low" : "--c-fill"})"></i></div></div>`;
  R.netups = (c, v) => {
    const o = c.o || {}, L = (U.ups && U.ups.upses) || [], one = L.find((u) => u.id === o.ups) || L[0];
    const foot = (u) => `<div class="un-foot">${ic("bolt", 15)}<span>${esc(upsLast(u))}</span></div>`;
    if (v === "c") {
      const worst = L.some((u) => upsSt(u)[0] === "low") ? "bad" : L.some((u) => upsSt(u)[0] === "batt") ? "warn" : "ok";
      return head(o, "ups", T("net.upsTitle"), pill(worst, T(L.length === 1 ? "net.ups.one" : "net.ups.n", { n: L.length }))) + `<div class="un-scroll">${L.map(upsRow).join("")}</div>`;
    }
    const hd = head(o, "ups", T("net.upsTitle"), upsSrc(one));
    const name = `${esc(one.name)}${one.model ? ` · ${esc(one.model)}` : ""}`;
    if (v === "b") return hd + `<div class="un-upsb"><div><div class="un-mut">${esc(T("net.ups.loadNow"))}</div><span class="un-upsbig">${old(one, `${isN(one.load) ? Math.round(one.load) : D}<u>%</u>`)}</span></div>`
      + `<div class="un-upsbr">${upsTag(one)}<small class="un-mut">${name}</small></div></div>`
      + `<div class="un-scroll">${[[T("net.ups.charge"), pct(one.charge), 1], [T("net.ups.runtime"), runW(one.runtime), 1], [T("net.ups.input"), volts(one.vin)], [T("net.ups.output"), volts(one.vout)],
        [T("net.ups.watts"), isN(one.watts) ? `${Math.round(one.watts)} W` : D]].map(([l, x, gr]) => kv(l, gr ? old(one, esc(x)) : esc(x))).join("")}</div>` + foot(one);   // i18n-ok (unit)
    return hd + `<div class="un-upsa"><div class="un-batt${upsSt(one)[0] === "low" ? " low" : ""}${upsOld(one) ? " un-old" : ""}"><i style="width:${isN(one.charge) ? cl(one.charge, 0, 100) : 0}%"></i><span>${esc(pct(one.charge))}</span></div>`
      + `<div class="un-upsn">${upsTag(one)}<small class="un-mut">${name}</small></div></div>`
      + `<div class="un-upst">${[[T("net.ups.runtime"), runW(one.runtime), 1], [T("net.ups.load"), pct(one.load), 1], [T("net.ups.input"), volts(one.vin)], [T("net.ups.output"), volts(one.vout)]]
        .map(([l, x, gr]) => `<div class="un-tile"><span class="un-tl">${esc(l)}</span><span class="un-tv">${gr ? old(one, esc(x)) : esc(x)}</span></div>`).join("")}</div>` + foot(one);
  };

  // ---------- (v3.0.5) Doorbell (unifi-v2.html "Doorbell": three looks) ----------
  // What the Protect integration already has: the doorbell camera (house/protect-cameras.js, its picture through the
  // panel's go2rtc — a still every 10 s while it's seen, a tap opens the live view), and the Hubitat doorbell device's
  // rings ("pushed" — GET /api/panel/<id>/doorbell: the last ring and today's count the server heard, U.bell) and its
  // screen's message (notificationText). The message buttons send that device "deviceNotification" (the panel's own
  // checks — as any command). Protect's own ring history isn't open to the integration's key.
  const doorbells = () => ((window.HUBITAT && HUBITAT.cameras) || []).filter((x) => x && x.doorbell);
  const BELL_MSGS = ["net.bell.msg1", "net.bell.msg2", "net.bell.msg3"];
  const bellOf = (cam) => ((U.bell && U.bell.bells) || []).find((b) => b.id === cam.id) || {};
  const ringAt = (cam) => bellOf(cam).lastRing || null;
  const ringing = (cam) => { const t = ringAt(cam); return !!t && Date.now() / 1000 - t < 90; };
  const snapUrl = (cam) => (window.Cameras && Cameras.snapshot ? Cameras.snapshot(cam) : null);
  // (v3.0.5) the last still loaded per camera (U.snap): a redraw shows that one, never asks for a new picture; a camera
  // that is offline gets none (no picture asked of it)
  U.snap = {};
  const snapNow = (u) => `${u}&t=${Math.floor(Date.now() / 10000)}`;
  function bellPic(c, cam, cls, act) {
    const u = cam.online === false ? null : snapUrl(cam), src = u ? U.snap[cam.id] || (U.snap[cam.id] = snapNow(u)) : null;
    return `<button class="un-bpic ${cls || ""}"${act || Acts.on("net.bellOpen", cam.id)} aria-label="${esc(T("net.bell.open", { name: cam.name }))}">${src ? `<img src="${esc(src)}" data-snap="${esc(u)}" data-cam="${esc(cam.id)}" alt="" loading="lazy">` : ""}`
      + `${src || cam.online === false ? "" : `<span class="un-bnone">${ic("doorbell", 34)}<small>${esc(T("net.bell.noPic"))}</small></span>`}${cam.online === false ? `<span class="un-pill bad un-blive">${esc(T("net.offline"))}</span>` : ""}</button>`;
  }
  // (S7 as the server: a camera's id saved as a number or a string)
  const bellCam = (o) => { const bells = doorbells(); return bells.find((b) => o.cam != null && String(b.id) === String(o.cam)) || bells[0]; };
  // the message buttons (the doorbell's own Hubitat device; none without one or with "msgs": false)
  function bellMsgs(o, cam) {
    const info = bellOf(cam), dev = Number.isInteger(cam.doorbellDevice) ? cam.doorbellDevice : null;
    const msgs = o.msgs !== false && dev != null ? BELL_MSGS.map((k) => T(k)) : [];
    const lcd = typeof info.text === "string" && info.text.trim() ? info.text : null;
    const btns = (chip) => (msgs.length ? `<div class="un-bmsgs${chip ? " chips" : ""}">${msgs.map((m) => `<button class="${lcd && lcd.toLowerCase() === m.toLowerCase() ? "on" : ""}"${Acts.on("net.bellMsg", dev, m)}>${chip ? "" : ic("msg", 15)}${esc(m)}</button>`).join("")}</div>` : "");
    return { msgs, lcd, btns };
  }
  // (v3.0.5) "Last ring": the server says since when it has listened (U.bell.since) — nothing heard since a restart is
  // "unknown", never "no ring"; a failed read keeps the last answer and shows its own pill
  const lastWord = (cam) => { const t = ringAt(cam); return ringing(cam) ? T("net.bell.ringing") : t ? T("net.bell.rang", { t: when(t) }) : U.bell && isN(U.bell.since) ? T("net.bell.noRingSince") : T("net.bell.noRing"); };
  const errPill = () => (U.bellErr ? `<span class="un-pill bad un-berr">${esc(T("net.bell.err"))}</span>` : "");
  R.netbell = (c, v) => {
    const o = c.o || {}, cam = bellCam(o);
    if (!cam) return head(o, "doorbell", T("net.bellTitle")) + empty("doorbell", T("net.bell.none"));
    const info = bellOf(cam), t = ringAt(cam), ring = ringing(cam);
    if (ring && U.bellEnd !== t) { U.bellEnd = t; setTimeout(() => H.refresh(), Math.max(1000, (t + 91 - Date.now() / 1000) * 1000)); }   // ("Ringing" goes after 90 s)
    const last = lastWord(cam), { msgs, lcd, btns } = bellMsgs(o, cam);
    const hd = head(o, "doorbell", cam.name || T("net.bellTitle"), `<span class="un-hr">${errPill()}<span class="un-pill${ring ? " warn un-ringing" : ""}">${ring ? window.icon("bell", 13) : ""}${esc(last)}</span></span>`);
    if (v === "b") return hd + `<div class="un-bb">${bellPic(c, cam, "sm")}<div><b>${esc(T(ring ? "net.bell.someone" : "net.bell.nobody"))}</b>`
      + `<small class="un-mut">${esc(isN(info.today) ? T(info.today === 1 ? "net.bell.today1" : "net.bell.todayN", { n: info.today }) : T("net.bell.todayNone"))}</small></div></div>`
      + (msgs.length ? `<div class="un-sec">${esc(T("net.bell.show"))}</div>${btns(true)}` : "") + `<div class="un-foot">${window.icon("bell", 15)}<span>${esc(T("net.bell.ringOpens"))}</span></div>`;
    // (v3.0.5 look C, as unifi-v2.html: a tap opens the big view with the message buttons — no buttons: the live view)
    if (v === "c") return `<div class="un-bfull">${bellPic(c, cam, "full", msgs.length ? Acts.on("net.bellBig", c.i) : "")}<div class="un-bcap">${errPill()}<b>${esc(cam.name)}</b><small>${esc(`${last} · ${T(msgs.length ? "net.bell.tapMsgs" : "net.bell.tapLive")}`)}</small></div>`
      + `<span class="un-pill un-bpill${ring ? " warn un-ringing" : ""}">${ic("doorbell", 13)}${esc(ring ? T("net.bell.ringing") : T("net.bellTitle"))}</span></div>`;
    return hd + bellPic(c, cam, "big") + (lcd ? `<div class="un-mut un-blcd">${esc(T("net.bell.onScreen", { text: lcd }))}</div>` : "") + btns(false);
  };
  // (v3.0.5) the big view (look C's tap): the picture (a tap: live), what the doorbell shows now and the message
  // buttons; closes by itself after 60 s
  let bigT = 0;
  function bellBig(i) {
    const c0 = card(i); if (!c0 || !window.UI || !UI.popup) return;
    U.bigBell = i;
    UI.popup(() => {
      const c = card(i) || c0, o = c.o || {}, cam = bellCam(o);
      if (!cam) return { title: T("net.bellTitle"), body: empty("doorbell", T("net.bell.none")) };
      const { lcd, btns } = bellMsgs(o, cam);
      return { title: cam.name || T("net.bellTitle"), cls: "un-bellpop", body: `<div class="un-bpop" style="${colVars("netbell", o.col)}">${bellPic(c, cam, "pop")}`
        + `<div class="un-mut">${errPill()}${esc(`${lastWord(cam)} · ${T("net.bell.bigNow", { text: lcd || D })}`)}</div>${btns(false)}</div>` };
    }, () => { U.bigBell = null; clearTimeout(bigT); });
    clearTimeout(bigT); bigT = setTimeout(() => { if (U.bigBell === i && UI.isOpen && UI.isOpen()) UI.close(); }, 60000);
  }
  // the pictures: a fresh still every 10 s, only the ones on screen, only while the page is shown (no redraw)
  // (v3.0.5: on screen across too — a card swiped off to the side, a room page beside, is left alone)
  setInterval(() => {
    if (document.hidden) return;
    document.querySelectorAll(".un-bpic img[data-snap]").forEach((im) => { const r = im.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width) { im.src = snapNow(im.dataset.snap); U.snap[im.dataset.cam] = im.src; } });
  }, 10000);

  // ---------- (v3.0.5) Activity feed (unifi-v2.html "Activity", the feed look): the network's recent events ----------
  // From what unifi_net already reads: the client log (joins and leaves, guests, new devices) and its alerts (a UniFi
  // device offline / back, an internet line down / back, a UniFi UPS on battery / back on mains). Names only (every
  // client and device goes by a salted hash, never a MAC). Newest first; today's counts on top.
  const FEED = { join: ["plus", "join", "net.feed.join"], leave: ["minus", "leave", "net.feed.leave"], new: ["plus", "join", "net.feed.new"], devOff: ["warning", "alert", "net.feed.devOff"],
    devOn: ["check", "ok", "net.feed.devOn"], wanDown: ["warning", "alert", "net.feed.wanDown"], wanUp: ["check", "ok", "net.feed.wanUp"], battery: ["bolt", "alert", "net.feed.battery"],
    low: ["warning", "alert", "net.feed.low"], mains: ["plug", "ok", "net.feed.mains"] };
  function feedItems(o) {
    const out = [];
    for (const e of (U.m && U.m.log) || []) {
      if (!e || (e.kind !== "join" && e.kind !== "leave") || (o.guests === false && e.guest)) continue;
      out.push({ at: e.at, kind: e.kind === "join" && e.new ? "new" : e.kind, name: e.name, guest: !!e.guest, where: [e.wired ? T("net.wired") : e.ssid, e.to].filter(Boolean).join(" · ") });
    }
    if (o.alerts !== false) for (const e of (U.m && U.m.alerts) || []) {
      if (!e || !FEED[e.kind]) continue;
      const w = e.wan ? wans().find((x) => x.key === e.wan) : null;
      out.push({ at: e.at, kind: e.kind, name: w ? w.name : e.name, alert: true, where: e.dev ? kindWord(e.dev) : e.ups ? T("net.ups.short") : e.wan ? T("net.internet") : "" });
    }
    return out.filter((e) => isN(e.at) && typeof e.name === "string").sort((a, b) => b.at - a.at);
  }
  R.netfeed = (c, v) => {
    const o = c.o || {}, E = feedItems(o), day = new Date(), dense = o.dense === true;
    day.setHours(0, 0, 0, 0);
    const today = E.filter((e) => e.at * 1000 >= +day), n = (f) => today.filter(f).length;
    const hd = head(o, "clock", T("net.feedTitle"), `<span class="un-hr"><small class="un-mut">${esc(T("net.feed.since"))}</small></span>`);
    const chips = [["plus", "join", T("net.feed.cJoin", { n: n((e) => e.kind === "join" || e.kind === "new") })], ["minus", "leave", T("net.feed.cLeave", { n: n((e) => e.kind === "leave") })],
      o.guests !== false ? ["user", "join", ((g) => T(g === 1 ? "net.feed.cGuest1" : "net.feed.cGuest", { n: g }))(n((e) => e.guest))] : null,
      o.alerts !== false ? ["warning", "alert", ((a) => T(a === 1 ? "net.feed.cAlert1" : "net.feed.cAlert", { n: a }))(n((e) => e.alert && FEED[e.kind][1] === "alert"))] : null].filter(Boolean);
    const counts = o.counts === false ? "" : `<div class="un-fcnt">${chips.map(([i, k, w]) => `<span class="un-chip"><span class="un-fi ${k}">${ic(i, 14)}</span>${esc(w)}</span>`).join("")}</div>`;
    if (!E.length) return hd + counts + empty("clock", T("net.feed.empty"));
    const row = (e, i) => `<div class="un-ev"><span class="un-eic un-fi ${FEED[e.kind][1]}">${ic(FEED[e.kind][0], 16)}</span><span class="un-et"><b>${esc(T(FEED[e.kind][2], { name: e.name }))}${e.guest ? ` ${pill("warn", T("net.guestW"))}` : ""}</b>`
      + `${dense || !e.where ? "" : `<small>${esc(e.where)}</small>`}</span><time>${esc(i < 3 ? when(e.at) : T.time(new Date(e.at * 1000)))}</time></div>`;
    return hd + counts + `<div class="un-scroll${dense ? " dense" : ""}">${E.slice(0, dense ? 60 : 30).map(row).join("")}</div>`;
  };

  // ---------- the card (grid.js DRAW) ----------
  U.card = (c) => {
    const o = c.o || {}, v = ["a", "b", "c"].includes(o.look) ? o.look : "a";
    if (!R[c.t]) return { html: "" };
    if (OWN[c.t]) {   // (v3.0.5: the UPS and the Doorbell — nothing on the wall without one; the builder's canvas says how)
      const has = c.t === "netups" ? !!(U.ups && (U.ups.upses || []).length) : doorbells().length > 0;
      if (c.t === "netups" && !U.ups && !firstOwn.ups) { firstOwn.ups = true; setTimeout(() => loadOwn("ups"), 0); }
      // (v3.0.5 a failed /ups read: said so — never "Looking for a UPS…" for ever)
      if (!has) return { html: DESIGN ? `<div class="un un-off"><div class="gc-empty">${esc(T(c.t === "netups" ? (U.ups ? "net.hidden.noUps" : U.upsErr ? "net.hidden.upsError" : "net.hidden.waitUps") : "net.hidden.noBell"))}</div></div>` : "" };
      return { html: `<div class="un un-t-${c.t.slice(3)} un-${v}" style="${colVars(c.t, o.col)}">${R[c.t](c, v)}</div>` };
    }
    if (!ok()) {   // (on the wall: nothing; in the builder's canvas: why)
      if (!U.m && PC.unifiNet && !first) { first = true; setTimeout(load, 0); }   // (the first card just added: read now, not in 30 s)
      if (!DESIGN) return { html: "" };
      const why = !PC.unifiNet ? "net.hidden.off" : !U.m ? "net.hidden.wait" : U.m.starting ? "net.hidden.start" : "net.hidden.trouble";
      return { html: `<div class="un un-off"><div class="gc-empty">${esc(T(why))}</div></div>` };
    }
    return { html: `<div class="un un-t-${c.t.slice(3)} un-${v}" style="${colVars(c.t, o.col)}">${R[c.t](c, v)}</div>` };
  };
  U.TYPES = TYPES;

  // ---------- the map's parts moved by hand (only while the builder's "Arrange the parts" is on for that card) ----------
  let drag = null;
  const TR = /translate\(([-\d.]+) ([-\d.]+)\)/;
  // (v3.0.5) everything a drag needs is worked out when it starts (the screen-to-map matrix, every part's place, the
  // lines touching the part, the card's size and snapping); a move only notes the pointer, drawn at most once a frame
  document.addEventListener("pointerdown", (e) => {
    const g = e.target.closest && e.target.closest(".un-mapbox.arr .um-nd"); if (!g) return;
    const box = g.closest(".un-mapbox"), svg = box.querySelector("svg.um"), m = svg && svg.getScreenCTM(); if (!m) return;
    const inv = m.inverse(), toMap = (x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(inv); };
    const t = TR.exec(g.getAttribute("transform") || ""); if (!t) return;
    const id = g.dataset.node, i = box.dataset.map, c = card(i), at = {}, p = toMap(e.clientX, e.clientY);
    box.querySelectorAll(".um-nd").forEach((n) => { const q = TR.exec(n.getAttribute("transform") || ""); if (q) at[n.dataset.node] = { x: +q[1], y: +q[2] }; });
    drag = { g, box, id, i, toMap, at, x0: +t[1], y0: +t[2], px: p.x, py: p.y, moved: false, ev: null, raf: 0,
      lines: [...box.querySelectorAll(".um-ln")].filter((l) => l.dataset.a === id || l.dataset.b === id), cur: CURVE[box.dataset.look] || CURVE.a,
      W: +box.dataset.w, Hh: +box.dataset.h, snap: !(c && c.o && c.o.snap === false), r: +g.dataset.r || 19, tx: +box.dataset.tx || 1 };
    e.preventDefault();
  }, true);
  function dragStep(d) {
    d.raf = 0;
    if (!d.ev) return;
    const p = d.toMap(d.ev.x, d.ev.y), dx = p.x - d.px, dy = p.y - d.py;
    if (!d.moved && Math.hypot(dx, dy) < 6) return;
    if (!d.moved) { d.moved = true; d.box.classList.add("um-drag"); }   // (the port tags hidden while a part moves)
    // (v3.0.5) to every edge of the card (a part and its name stay inside it); snapping (on unless switched off) to
    // the dots' 25 px grid
    const step = (n) => (d.snap ? Math.round((n - 12.5) / 25) * 25 + 12.5 : n);
    d.x = cl(step(d.x0 + dx), d.r + 3, d.W - d.r - 3); d.y = cl(step(d.y0 + dy), d.r + 3, d.Hh - d.r - 34 * d.tx);
    d.g.setAttribute("transform", `translate(${d.x.toFixed(1)} ${d.y.toFixed(1)})`);
    d.at[d.id] = { x: d.x, y: d.y };
    // (the lines follow: each one's ends are its two parts' places now)
    d.lines.forEach((l) => { const a = d.at[l.dataset.a], b = d.at[l.dataset.b]; if (a && b) l.setAttribute("d", dpath(d.cur(a, b))); });
  }
  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    drag.ev = { x: e.clientX, y: e.clientY };
    if (!drag.raf) { const d = drag; d.raf = requestAnimationFrame(() => dragStep(d)); }
  });
  const endDrag = () => {
    const d = drag; drag = null;
    if (!d) return;
    if (d.raf) { cancelAnimationFrame(d.raf); dragStep(d); }   // (the last move, not yet drawn)
    setTimeout(retryPx, 0);   // (v3.0.5 a size change skipped during the drag: measured again now)
    if (!d.moved) return;
    U.dragged = Date.now();
    const W = d.W, Hh = d.Hh, c = card(d.i); if (!c) { d.box.classList.remove("um-drag"); return; }
    const pos = { ...((c.o && c.o.pos) || {}), [d.id]: [Math.round((d.x / W) * 1000), Math.round((d.y / Hh) * 1000)] };
    c.o = { ...(c.o || {}), pos };
    U.savePos(d.i, pos);
    H.refresh();
  };
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  // (the builder keeps it: the card's o.pos, saved with the layout — builder.js "netPos")
  U.savePos = (i, pos) => { if (window.parent !== window) window.parent.postMessage({ t: "netPos", i, pos }, location.origin); };
  U.arrange = (i) => { U.arranging = typeof i === "string" ? i : null; H.refresh(); };

  // ---------- the "new device" notice: small, at the bottom, each one once ----------
  const SEEN = "skypane.net.notices";
  const seen = new Set((() => { try { return JSON.parse(localStorage.getItem(SEEN) || "[]"); } catch { return []; } })());
  let noteT = 0;
  const hideNote = () => { const el = document.getElementById("net-note"); if (el) el.classList.remove("show"); };   // (v3.0.4: not while the cards are hidden)
  function notices(list) {
    if (DESIGN || !Array.isArray(list)) return;
    const fresh = list.filter((n) => n && typeof n.id === "string" && !seen.has(n.id));
    if (!fresh.length) return;
    fresh.forEach((n) => seen.add(n.id));
    try { localStorage.setItem(SEEN, JSON.stringify([...seen].slice(-100))); } catch {}
    let el = document.getElementById("net-note");
    if (!el) { el = document.createElement("div"); el.id = "net-note"; el.className = "net-note"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    const n = fresh[0], text = fresh.length > 1 ? T("net.notice.many", { n: fresh.length }) : T("net.notice.one", { name: n.name });
    el.innerHTML = `<button${Acts.on("net.noticeGo")}><span class="un-ci">${ic(fresh.length > 1 ? "plus" : CL_IC[n.icon] || "chip", 20)}</span><span><b>${esc(text)}</b>`
      + `<small>${esc(fresh.length > 1 ? T("net.notice.tap") : [n.wired ? T("net.wired") : n.ssid, n.to].filter(Boolean).join(" · ") || T("net.notice.tap"))}</small></span></button>`;
    el.classList.add("show");
    clearTimeout(noteT); noteT = setTimeout(() => el.classList.remove("show"), 10000);
  }

  // ---------- reading: every 30 s while a UniFi card is on one of this panel's layouts ----------
  // (v3.0.5: a blank card's Value piece showing a UniFi value counts too — its "net")
  const netPiece = (c) => c && c.t === "blank" && c.o && Array.isArray(c.o.parts) && c.o.parts.some((p) => p && p.t === "value" && p.net);
  const grids = () => { const v = (window.Settings && Settings.v) || {}; return [v.homeGrid, ...Object.values(v.roomGrids || {})].filter((g) => g && Array.isArray(g.cards)); };
  const wanted = () => grids().some((g) => g.cards.some((c) => c && ((TYPES.includes(c.t) && !OWN[c.t]) || netPiece(c))));
  // (v3.0.5) one UniFi value for a blank card's Value piece: {icon, label, val, dot} — null while UniFi isn't there
  // (v3.0.5) no data yet: read now (as the first card does), not in 30 s
  U.value = (k) => {
    if (!ok() && !U.m && PC.unifiNet && !first) { first = true; setTimeout(load, 0); }
    if (!ok() || !VALS.includes(k)) return null;
    try { return valItems()[k] || null; } catch { return null; }
  };
  U.dot = dot;   // (v3.0.5: a Value piece shows the value's dot as the Network values card does)
  let busy = false;
  async function load() {
    if (!PC.unifiNet || busy || !wanted() || !window.PANEL) return;
    busy = true;
    try {
      const r = await fetch(`/api/panel/${encodeURIComponent(window.PANEL)}/unifi`, { cache: "no-store" });
      if (r.ok) { const m = await r.json(); if (m && typeof m === "object") { const was = U.m ? `${U.m.readAt}|${U.m.ok}|${U.m.stale}` : ""; U.m = m; if (ok()) notices(m.notices); else hideNote(); if (`${m.readAt}|${m.ok}|${m.stale}` !== was && !drag) H.refresh(); } }
    } catch {}
    busy = false;
  }
  U.load = load;
  // (v3.0.5) the UPS and Doorbell cards' own reads: every 30 s while one is on this panel's layouts (none without one)
  const firstOwn = {};
  const ownWanted = (what) => grids().some((g) => g.cards.some((c) => c && OWN[c.t] === what));
  const ownBusy = {};
  // (v3.0.5) a failed read is kept (U.upsErr / U.bellErr: the builder says so, the Doorbell shows its own pill); the
  // last good answer stays
  async function loadOwn(what) {
    if (ownBusy[what] || !window.PANEL || !ownWanted(what)) return;
    ownBusy[what] = true;
    const key = what === "ups" ? "ups" : "bell", errKey = `${key}Err`, was = JSON.stringify([U[key], U[errKey]]);
    try {
      const r = await fetch(`/api/panel/${encodeURIComponent(window.PANEL)}/${what}`, { cache: "no-store" });
      if (r.ok) { const m = await r.json(); if (m && typeof m === "object") { U[key] = m; U[errKey] = null; } else U[errKey] = "bad answer"; }
      else U[errKey] = `HTTP ${r.status}`;
    } catch { U[errKey] = "no answer"; }
    ownBusy[what] = false;
    if (JSON.stringify([U[key], U[errKey]]) !== was && !drag) H.refresh();
  }
  U.loadOwn = loadOwn;
  setTimeout(() => { loadOwn("ups"); loadOwn("doorbell"); }, 1600);
  setInterval(() => { loadOwn("ups"); loadOwn("doorbell"); }, POLL);
  // a ring: the doorbell device said something (Hubitat's "pushed") — read its rings now, not in 30 s
  if (H && typeof H.onHubSaid === "function") H.onHubSaid((id) => {
    const cam = id != null && doorbells().find((x) => x.doorbellDevice === id);
    if (!cam) return;
    setTimeout(() => loadOwn("doorbell"), 400);
  });
  U.set = (m) => { U.m = m; notices(m && m.notices); };   // (the tests)
  Acts.add({
    "net.gm": (i) => { const s = S(i), o = (card(i) || {}).o || {}; s.gm = GM[(GM.indexOf(s.gm || (GM.includes(o.gm) ? o.gm : "both")) + 1) % 3]; H.refresh(); },
    "net.sel": (i, k) => { S(i).sel = k; H.refresh(); },
    "net.det": (i, k) => { const s = S(i); s.det = k && s.det !== k ? k : null; H.refresh(); },
    "net.pop": (i, id) => { if (Date.now() - U.dragged < 400 || U.arranging === i) return; const s = S(i); s.pop = id && s.pop !== id ? id : null; H.refresh(); },
    "net.f": (i, f) => { S(i).f = f; H.refresh(); },
    "net.sort": (i, k) => { const s = S(i), cur = s.sort || ((card(i) || {}).o || {}).sort || "name"; s.dir = cur === k ? -(s.dir || 1) : 1; s.sort = k; H.refresh(); },
    "net.go": (what) => go(what),
    "net.bellOpen": (id) => { if (DESIGN || !window.Cameras || !Cameras.full) return; if (U.bigBell != null && window.UI) UI.close(); Cameras.full(+id, 60); },
    "net.bellBig": (i) => { if (!DESIGN) bellBig(i); },   // (v3.0.5 look C)
    "net.bellMsg": (dev, text) => { if (DESIGN || !Number.isInteger(+dev) || typeof text !== "string") return; H.send(+dev, "deviceNotification", text); },
    "net.noticeGo": () => { const el = document.getElementById("net-note"); if (el) el.classList.remove("show"); go("clients"); },
  });
  if (PC.unifiNet) { setTimeout(load, 1500); setInterval(load, POLL); }
  Object.assign(U, { COL, VALS, STRIP, PARTS, mapGraph, layout, overall });
  window.UniFi = U;
})();
