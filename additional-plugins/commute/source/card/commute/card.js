// Commute card, written against the card frame's bridge, window.Skypane: get (this plugin's panel routes: status, map,
// traffic), t (its words), on("size" | "visible" | "theme"), options (trip, view, mapLook, routeColor). By bike or on
// foot (status "how") there's no traffic: no dot, delay or traffic picture. The worker asks
// TomTom; this card only reads what it last got, about once a minute while it's on screen. Outside the drive times it
// rests (says when the next drive shows). "Map with times": the map comes as data: PNG squares (street map, then
// see-through traffic over it) placed in a mosaic, the route drawn over them as SVG. "Times only": leave by, arrive by,
// the drive, and why it's slower. ES5, for older wall tablets.
(function () {
  "use strict";
  var S = window.Skypane, root = document.getElementById("root");
  if (!S) { root.textContent = "No bridge"; return; }
  var O = S.options || {};
  var T = function (k, v) { return S.t(k, v); };
  var SVGNS = "http://www.w3.org/2000/svg";
  function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function color(c, dflt) { return /^#[0-9a-fA-F]{6}$/.test(c || "") ? c : dflt; }
  var CAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="13" r=".8" fill="currentColor"/><circle cx="16.5" cy="13" r=".8" fill="currentColor"/></svg>';

  var gridKey = "";
  var POLL_MS = 60000, SOON_MS = 5000, BUSY_MS = 90000;
  var st = null, line = null, rv = null, mapImgs = null, mv = null, trImgs = null, tv = null;
  var size = { w: window.innerWidth, h: window.innerHeight }, shown = true, timer = null, shape = "", fetching = {};
  var mapOn = O.view !== "times", night = O.mapLook === "night", routeColor = color(O.routeColor, "#3b82f6");

  // the worker sends plain numbers (minutes after midnight, metres) and how the owner wants them shown
  function has(v) { return typeof v === "number" && !isNaN(v); }
  function fmtT(m) {
    if (!has(m)) return "";
    m = ((Math.round(m) % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60), mm = m % 60, two = (mm < 10 ? "0" : "") + mm;
    if (st && st.clock === "24") return h + ":" + two;
    return (h % 12 || 12) + ":" + two + " " + (h < 12 ? "am" : "pm");
  }
  function fmtD(meters) {
    if (!has(meters)) return "";
    var km = st && st.units === "km", v = km ? meters / 1000 : meters / 1609.344;
    return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + (km ? " km" : " mi");
  }
  function dur(n) {
    n = Math.max(0, Math.round(n || 0));
    return n < 60 ? T("c.min", { n: n }) : T("c.hmin", { h: Math.floor(n / 60), m: n % 60 });
  }
  function useMap() { return mapOn && size.h >= 120 && size.w >= 150 && st && st.map; }
  function big() { return size.w >= 420 && size.h >= 260; }

  // ---------------------------------------------------------------- the words
  function goLine() {
    if (!st || st.mode !== "work" || !has(st.leaveBy)) return st && st.mode === "home" ? { cls: "", text: T("c.arrive", { t: fmtT(st.arrive) }) } : null;
    if (st.late > 0) return { cls: "late", text: T("c.late", { n: st.late }) };
    if (st.leaveIn <= 0) return { cls: "now", text: T("c.leaveNow") };
    return { cls: "", text: T("c.leaveBy", { t: fmtT(st.leaveBy) }) };
  }
  function dirText() {
    if (!st) return "";
    if (st.mode === "home") return T("c.toHome");
    return st.name || T("c.toWork");
  }
  function whyText(r, withAt) {
    var what = T("why." + r.kind);
    if (what === "why." + r.kind) what = T("why.other");
    return withAt && has(r.atMeters) ? T("c.whyAt", { what: what, at: fmtD(r.atMeters) }) : what;
  }
  function topWhy() {
    if (!st.delayMin) return "";
    return st.why && st.why.length ? whyText(st.why[0], false) : T("c.whyBusy");
  }
  function car() { return !st.how || st.how === "car"; }
  function byText() { return T(st.how === "bike" ? "c.byBike" : "c.onFoot"); }
  function timeWord() { return T(st.how === "bike" ? "c.ride" : st.how === "walk" ? "c.walkT" : "c.drive"); }
  function subParts(longer) {
    var p = [];
    if (!car()) p.push(esc(byText()) + " · " + esc(fmtD(st.meters)));
    else if (st.delayMin > 0) p.push('<span class="' + esc(st.level) + '">' + esc(T("c.delay", { n: st.delayMin })) + "</span>" + (topWhy() ? " · " + esc(topWhy()) : ""));
    else p.push(esc(T("c.clear")));
    if (longer) {
      if (st.delayMin > 0) p.push(esc(T("c.normal", { n: dur(st.normalMin) })));
      if (car()) p.push(esc(fmtD(st.meters)));
      if (st.mode === "work" && has(st.leaveBy)) p.push(esc(T("c.arrive", { t: fmtT(st.arriveBy) })));
      p.push(esc(T("c.updated", { t: fmtT(st.updated) })));
    }
    return p.join(" · ");
  }
  function errText(e) {
    return T({ badkey: "c.badKey", busy: "c.busy", offline: "c.offline", notfound: "c.noRoute", setup: "c.setup" }[e] || "c.failed");
  }
  function restText() {
    var r = st.rest || {};
    if (r.kind === "today") return has(r.at) ? T("rest.today", { t: fmtT(r.at) }) : T("rest.todaySoon");
    if (r.kind === "home") return T("rest.home", { t: fmtT(r.at) });
    if (r.tomorrow) return T("rest.tomorrow");
    return T("rest.next", { day: T("day." + r.day) });
  }

  // ---------------------------------------------------------------- draw
  function wantShape() {
    if (!st) return "none";
    if (st.state !== "ok") return "msg:" + st.state;
    if (st.mode === "rest") return size.h < 120 ? "rest-row" : "rest";
    if (useMap()) return "map";
    if (!mapOn && size.h >= 150 && size.w >= 200) return "times";
    return size.w < 300 ? "row-n" : "row";
  }
  function draw() {
    var want = wantShape();
    if (want !== shape) {
      shape = want;
      root.className = "cm" + (night ? " night" : "");
      if (want === "map") {
        root.innerHTML = '<div class="map" id="map"><div class="mos" id="mos"></div><span class="credit">' + esc(T("c.credit")) + "</span></div>" +
          '<div class="pill" id="pill"></div><div class="msg warn" id="err" hidden></div>';
        mosaicBuilt = "";
      } else if (want === "row" || want === "row-n") {
        root.innerHTML = '<div class="row' + (want === "row-n" ? " narrow" : "") + '" id="pill"></div><div class="msg warn" id="err" hidden></div>';
      } else if (want === "times") {
        root.innerHTML = '<div class="times" id="pill"></div><div class="msg warn" id="err" hidden></div>';
      } else if (want === "rest" || want === "rest-row") {
        root.innerHTML = '<div class="rest' + (want === "rest-row" ? " flat" : "") + '" id="rest"></div>';
      } else {
        root.innerHTML = '<div class="msg full" id="full"></div>';
      }
    }
    if (shape === "none" || shape.indexOf("msg:") === 0) {
      var full = document.getElementById("full");
      var s = st ? st.state : "loading";
      full.textContent = s === "notrip" ? T("c.noTrip") : s === "gone" ? T("c.gone") : s === "setup" ? T("c.setup") :
        s === "error" ? errText(st.err) : T("c.loading");
      return;
    }
    if (shape === "rest" || shape === "rest-row") {
      document.getElementById("rest").innerHTML = (shape === "rest" ? '<span class="car">' + CAR + "</span><b>" + esc(st.name) + "</b>" : "") +
        "<span>" + esc(restText()) + "</span>";
      return;
    }
    var pill = document.getElementById("pill"), go = goLine();
    var dot = car() ? '<span class="dot ' + esc(st.level) + '"></span>' : "";
    if (shape === "row" || shape === "row-n") {
      var wide = size.w >= 300;
      pill.innerHTML = '<div class="big">' + dot + "<b>" + esc(dur(st.min)) + "</b></div>" +
        '<div class="col">' + (go ? '<div class="go ' + go.cls + '">' + esc(go.text) + "</div>" : '<div class="dir">' + esc(dirText()) + "</div>") +
        (size.h >= 64 && wide ? '<div class="sub">' + subParts(false) + "</div>" : "") + "</div>" +
        (size.w >= 460 ? '<div class="col right"><div class="sub">' + esc(dirText()) + '</div><div class="sub">' + esc(fmtD(st.meters)) + "</div></div>" : "");
    } else if (shape === "times") {
      drawTimes(pill, go, dot);
    } else {
      pill.innerHTML = '<div class="dir">' + esc(dirText()) + '</div><div class="big">' + dot + "<b>" + esc(dur(st.min)) + "</b></div>" +
        (go ? '<div class="go ' + go.cls + '">' + esc(go.text) + "</div>" : "") +
        '<div class="sub">' + subParts(big()) + "</div>";
      drawMap();
    }
    var err = document.getElementById("err");
    if (err) {
      if (st.err) { err.textContent = errText(st.err); err.hidden = false; } else err.hidden = true;
    }
  }

  // "Times only": three big numbers, then why it's slower
  function drawTimes(el, go, dot) {
    var cells = [], home = st.mode === "home";
    var narrow = size.w < 300;
    if (home) {
      cells.push([T("c.leave"), T("c.goShort"), ""]);
      if (!narrow) cells.push([T("c.arriveAt"), fmtT(st.arrive), ""]);
    } else {
      cells.push([T("c.leave"), st.late > 0 || st.leaveIn <= 0 ? T("c.goShort") : fmtT(st.leaveBy), go && go.cls ? go.cls : ""]);
      if (!narrow) cells.push([T("c.arriveBy"), fmtT(st.arriveBy), ""]);
    }
    cells.push([timeWord(), dur(st.min), ""]);
    var last = cells.length - 1;
    var h = '<div class="dir">' + dot + esc(dirText()) + '</div><div class="cells' + (size.w < 380 ? " tight" : "") + '">';
    for (var i = 0; i < cells.length; i++) {
      h += '<div class="cell"><span>' + esc(cells[i][0]) + '</span><b class="' + cells[i][2] + '">' + esc(cells[i][1]) + "</b>" +
        (i === last ? (!car() ? "<em>" + esc(byText()) + "</em>" : st.delayMin > 0 ? '<em><span class="' + esc(st.level) + '">' + esc(T("c.delay", { n: st.delayMin })) + "</span></em><em>" +
          esc(T("c.usually", { n: dur(st.normalMin) })) + "</em>" : "<em>" + esc(T("c.clear")) + "</em>") : "") +
        "</div>";
    }
    h += "</div>";
    if (go && go.cls === "late") h += '<div class="go late">' + esc(go.text) + "</div>";
    if (st.delayMin > 0 && size.h >= 200) {
      var list = st.why && st.why.length ? st.why : [{ kind: "busy" }];
      h += '<div class="why"><span class="wt">' + esc(T("c.why")) + "</span>";
      var room = Math.max(1, Math.floor((size.h - 170) / 24));
      for (i = 0; i < list.length && i < room; i++) {
        var r = list[i];
        h += '<div class="wr"><i class="dot ' + (r.kind === "accident" || r.kind === "closed" ? "heavy" : "slow") + '"></i><span>' +
          esc(r.kind === "busy" ? T("c.whyBusy") : whyText(r, size.w >= 300)) + "</span>" + (r.min ? "<b>" + esc(T("c.whyMin", { n: r.min })) + "</b>" : "") + "</div>";
      }
      h += "</div>";
    }
    if (size.h >= 240) h += '<div class="sub upd">' + esc(fmtD(st.meters)) + " · " + esc(T("c.updated", { t: fmtT(st.updated) })) + "</div>";
    el.innerHTML = h;
  }

  var mosaicBuilt = "", placed = { m: null, t: null };
  function drawMap() {
    var mos = document.getElementById("mos");
    if (!mos || !st.map) return;
    var m = st.map;
    var key = String(m.g);
    if (mosaicBuilt !== key) {
      mos.innerHTML = "";
      mos.style.width = m.w + "px"; mos.style.height = m.h + "px";
      var svg = document.createElementNS(SVGNS, "svg");
      svg.setAttribute("width", m.w); svg.setAttribute("height", m.h); svg.setAttribute("viewBox", "0 0 " + m.w + " " + m.h);
      svg.id = "svg";
      mos.appendChild(svg);
      mosaicBuilt = key; placed.m = placed.t = null;
    }
    placeTiles(mos, "bm", mapImgs, mv, "m");
    placeTiles(mos, "tr", trImgs, tv, "t");
    drawLine();
    fit();
  }
  function placeTiles(mos, cls, imgs, ver, slot) {
    if (!imgs || placed[slot] === ver || imgs.length !== st.map.nx * st.map.ny) return;
    var old = mos.querySelectorAll("img." + cls), i;
    for (i = 0; i < old.length; i++) mos.removeChild(old[i]);
    var svg = document.getElementById("svg"), before = cls === "bm" ? (mos.querySelector("img.tr") || svg) : svg;
    var nx = st.map.nx;
    for (i = 0; i < imgs.length; i++) {
      if (!imgs[i] || !/^data:image\/png;base64,/.test(imgs[i])) continue;
      var im = document.createElement("img");
      im.className = cls; im.alt = ""; im.src = imgs[i];
      im.style.left = (i % nx) * 256 + "px"; im.style.top = Math.floor(i / nx) * 256 + "px";
      mos.insertBefore(im, before);
    }
    placed[slot] = ver;
  }
  function drawLine() {
    var svg = document.getElementById("svg");
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var sc = scale(), pts = [], i;
    if (line && line.length >= 4) {
      for (i = 0; i + 1 < line.length; i += 2) pts.push(line[i] + "," + line[i + 1]);
      var under = document.createElementNS(SVGNS, "polyline");
      under.setAttribute("points", pts.join(" ")); under.setAttribute("class", "line-under");
      under.setAttribute("stroke-width", 9 / sc);
      svg.appendChild(under);
      var pl = document.createElementNS(SVGNS, "polyline");
      pl.setAttribute("points", pts.join(" ")); pl.setAttribute("class", "line");
      pl.setAttribute("stroke", routeColor); pl.setAttribute("stroke-width", 5 / sc);
      svg.appendChild(pl);
    }
    var ends = st.mode === "home" ? [st.map.work, st.map.home] : [st.map.home, st.map.work];
    for (i = 0; i < 2; i++) {
      var p = ends[i];
      if (!p) continue;
      var c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("cx", p[0]); c.setAttribute("cy", p[1]); c.setAttribute("r", (i ? 8 : 6) / sc);
      c.setAttribute("class", "pin"); c.setAttribute("stroke-width", 2.5 / sc);
      c.setAttribute("fill", i ? routeColor : "#222");
      svg.appendChild(c);
    }
  }

  // the route (and both ends) fitted into the card, the mosaic always covering it; the times' box kept clear
  var lastScale = 1;
  function bounds() {
    var m = st.map, x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9, i, pts = (line || []).slice();
    if (m.home) pts.push(m.home[0], m.home[1]);
    if (m.work) pts.push(m.work[0], m.work[1]);
    for (i = 0; i + 1 < pts.length; i += 2) {
      x1 = Math.min(x1, pts[i]); x2 = Math.max(x2, pts[i]); y1 = Math.min(y1, pts[i + 1]); y2 = Math.max(y2, pts[i + 1]);
    }
    if (x1 > x2) { x1 = 0; y1 = 0; x2 = m.w; y2 = m.h; }
    return { x1: x1, y1: y1, x2: x2, y2: y2 };
  }
  function layoutBox() {
    var pill = document.getElementById("pill"), pw = pill ? pill.offsetWidth : 0, ph = pill ? pill.offsetHeight : 0;
    var pad = 18, l = pad, t = pad, r = size.w - pad, b = size.h - pad - 10;
    if (pw && ph) {                                   // (beside the box if there's room, else below it)
      if (size.w > size.h * 1.2 && size.w - pw - 16 > size.w * 0.45) l = pw + 16 + 8; else t = ph + 16 + 6;
    }
    return { l: l, t: t, w: Math.max(40, r - l), h: Math.max(40, b - t) };
  }
  function scale() { return lastScale; }
  function fit() {
    var mos = document.getElementById("mos");
    if (!mos) return;
    var m = st.map, bx = bounds(), box = layoutBox();
    var bw = Math.max(20, bx.x2 - bx.x1), bh = Math.max(20, bx.y2 - bx.y1);
    var s = Math.min(box.w / bw, box.h / bh, 2.5);
    s = Math.max(s, size.w / m.w, size.h / m.h);       // (never show past the mosaic's edge)
    var cx = (bx.x1 + bx.x2) / 2, cy = (bx.y1 + bx.y2) / 2;
    var tx = box.l + box.w / 2 - cx * s, ty = box.t + box.h / 2 - cy * s;
    tx = Math.min(0, Math.max(size.w - m.w * s, tx));
    ty = Math.min(0, Math.max(size.h - m.h * s, ty));
    var tf = "translate(" + tx.toFixed(1) + "px," + ty.toFixed(1) + "px) scale(" + s.toFixed(4) + ")";
    mos.style.webkitTransform = tf; mos.style.transform = tf;
    if (Math.abs(s - lastScale) > 0.001) { lastScale = s; drawLine(); }
  }

  // ---------------------------------------------------------------- ask the worker
  function later(ms) { clearTimeout(timer); if (shown) timer = setTimeout(poll, ms); }
  function poll() {
    clearTimeout(timer);
    S.get("status", rv !== null ? { rv: String(rv) } : {}).then(function (r) {
      st = r || { state: "error" };
      if (st.map) {
        var gk = String(st.map.g);
        if (gridKey && gk !== gridKey) { mapImgs = trImgs = null; mv = tv = null; }   // (a new area: its own squares)
        gridKey = gk;
        if (st.map.line) { line = st.map.line; rv = st.map.rv; }
        if (mapOn) {
          if (st.map.mv && st.map.mv !== mv) pictures("map", mv, function (v, imgs) { mv = v; mapImgs = imgs; });
          if (st.map.tv && st.map.tv !== tv) pictures("traffic", tv, function (v, imgs) { tv = v; trImgs = imgs; });
        }
      }
      draw();
      later(st.state === "loading" || (st.map && mapOn && (!st.map.mv || (car() && !st.map.tv))) ? SOON_MS : POLL_MS);
    }, function (e) {
      if (e && e.message === "too-many") { later(BUSY_MS); return; }   // (busy: just ask again later)
      if (!st) st = { state: "error", err: "failed" }; else st.err = "failed";
      draw(); later(20000);
    });
  }
  function pictures(route, have, done) {
    if (fetching[route]) return;
    fetching[route] = true;
    S.get(route, have ? { v: have } : {}).then(function (r) {
      fetching[route] = false;
      if (r && r.imgs && r.v) { done(r.v, r.imgs); if (shape === "map") drawMap(); }
    }, function () { fetching[route] = false; });
  }

  // a tap on the card: check now (the worker allows one a minute); a drag never counts as a tap
  var down = null, toastT = null;
  function toast(text) {
    var el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
    el.textContent = text; el.style.display = "block";
    clearTimeout(toastT); toastT = setTimeout(function () { el.style.display = "none"; }, 2500);
  }
  root.addEventListener("pointerdown", function (e) { down = { x: e.clientX, y: e.clientY }; });
  root.addEventListener("pointerup", function (e) {
    if (!down || Math.abs(e.clientX - down.x) > 6 || Math.abs(e.clientY - down.y) > 6) { down = null; return; }
    down = null;
    if (!st || st.state !== "ok" || st.mode === "rest") return;
    S.post("command", { command: "refresh" }).then(function (r) {
      if (r && r.result === "soon") { toast(T("c.checking")); later(4000); }
    }, function () {});
  });

  S.on("size", function (s) {
    size = { w: s.w, h: s.h };
    draw();
  });
  S.on("visible", function (v) { shown = !!v; if (shown) poll(); else clearTimeout(timer); });
  S.on("theme", function () { if (st) { shape = ""; draw(); } });
  draw();
  poll();
})();
