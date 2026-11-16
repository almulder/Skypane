// Narwal robot vacuum card (mockup n260 v4, approved), written against the card frame's bridge, window.Skypane:
// get/post (this plugin's panel routes: status, map, start, command), view.get/set (the map's turn, zoom and pan, kept
// per card), t (its words), on("theme" | "size" | "visible"), options (robot, rotate, controls, station).
// The map comes from the owner's own robot (rooms, names, outlines, dock), so the card works for any Narwal owner.
// Old-tablet safe: ES5 only (no arrow functions, let / const, template strings, ?. or ??).
(function () {
  "use strict";
  var S = window.Skypane;
  var root = document.getElementById("root"), toastEl = document.getElementById("toast");
  if (!S) { root.textContent = "No bridge"; return; }
  var O = S.options || {};
  var T = function (k, v) { return S.t(k, v); };
  function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var ICON = {
    vacuum: '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/></svg>',
    mop: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3v10M7 21l2-8h6l2 8z"/><path d="M10 17h4"/></svg>',
    both: '<svg class="i" viewBox="0 0 24 24"><circle cx="9" cy="10" r="5"/><path d="M15 21l1.5-6h4L22 21z"/></svg>',
    vacuumThenMop: '<svg class="i" viewBox="0 0 24 24"><circle cx="7" cy="12" r="4"/><path d="M12 12h3M14 10l2 2-2 2"/><path d="M18 18l1-5h2l1 5z"/></svg>',
    play: '<svg class="i" viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
    pause: '<svg class="i" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
    home: '<svg class="i" viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg>',
    stop: '<svg class="i" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    washMop: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3s5 6 5 10a5 5 0 0 1-10 0c0-4 5-10 5-10z"/></svg>',
    dryMop: '<svg class="i" viewBox="0 0 24 24"><path d="M4 9h11a3 3 0 1 0-3-3M4 15h15a3 3 0 1 1-3 3M4 12h8"/></svg>',
    emptyDust: '<svg class="i" viewBox="0 0 24 24"><path d="M6 7h12l-1 13H7z"/><path d="M9 7V4h6v3"/></svg>',
    locate: '<svg class="i" viewBox="0 0 24 24"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/></svg>',
    warn: '<svg class="i" viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17v.5"/></svg>',
    rot: '<svg class="i" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>'
  };
  function art(state) {
    var c = state === "error" ? "#fb7185" : state === "cleaning" ? "#4ade80" : state === "returning" ? "#fbbf24" : "#7dd3fc";
    return '<svg class="art" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#2b2f45" stroke="#9aa4c7" stroke-width="1.5"/>' +
      '<circle cx="20" cy="20" r="6" fill="#3b4262" stroke="#9aa4c7"/><circle cx="20" cy="9" r="2" fill="' + c + '"/></svg>';
  }
  var PALETTE = [[122, 162, 247], [158, 206, 106], [247, 118, 142], [224, 175, 104], [187, 154, 247], [125, 207, 255], [255, 158, 100], [115, 218, 202]];
  var MODES = ["vacuum", "mop", "both", "vacuumThenMop"];
  var BUSY = { cleaning: 1, paused: 1, error: 1, returning: 1, washing: 1 };

  // ---------------------------------------------------------------- state
  var st = null, mp = null, cells = null, BOX = null, BASE = null, ver = null;
  var mode = "both", sel = {}, size = { w: window.innerWidth, h: window.innerHeight }, shown = true, timer = null, sending = false;
  var v0 = S.view.get() || {};
  var view = { rot: [0, 90, 180, 270].indexOf(v0.rot) >= 0 ? v0.rot : 0, zoom: typeof v0.zoom === "number" && v0.zoom >= 1 && v0.zoom <= 6 ? v0.zoom : 1,
               pan: v0.pan instanceof Array && v0.pan.length === 2 ? [+v0.pan[0] || 0, +v0.pan[1] || 0] : [0, 0] };
  if (MODES.indexOf(v0.mode) >= 0) mode = v0.mode;
  var saveT = null;
  function saveView() { clearTimeout(saveT); saveT = setTimeout(function () { S.view.set({ rot: view.rot, zoom: view.zoom, pan: view.pan, mode: mode }); }, 400); }

  function selIds() { var out = []; for (var k in sel) if (sel.hasOwnProperty(k)) out.push(+k); return out; }
  function roomById(id) { var rs = (mp && mp.rooms) || []; for (var i = 0; i < rs.length; i++) if (rs[i].id === id) return rs[i]; return null; }
  function roomName(r) { return r ? (r.name || (T("room." + r.type) + (r.n > 1 ? " " + r.n : ""))) : ""; }
  function busy() { return !!(st && st.online && BUSY[st.state]); }
  function errOn() { return !!(st && st.online && st.fault && st.fault.level === "error"); }
  function offline() { return !!(st && st.online === false && st.why !== "starting"); }

  function statusLine() {
    if (!st) return T("st.starting");
    if (st.online === false) return st.why === "starting" ? T("st.starting") : T("st.offline");
    if (errOn()) return T("st.error");
    var s = st.state;
    var word = s === "returning" ? T(st.reason === "mop" ? "st.returningMop" : "st.returning")
      : s === "docked" && st.station && st.station.mopDrying ? T("st.drying") : T("st." + (s || "unknown"));
    var room = st.position && st.position.room ? roomName(roomById(st.position.room)) : "";
    return s === "cleaning" && room ? T("st.inRoom", { state: word, room: room }) : word;
  }
  function tier() {
    var w = size.w, h = size.h;
    if (h < 110 || w < 170) return w < 260 || h < 80 ? "tiny" : "short";
    if (h < 330) return "small";
    if (h < 540 || w < 330) return "medium";
    return "large";
  }

  // ---------------------------------------------------------------- talking to the plugin
  function toast(t) { toastEl.textContent = t; toastEl.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.hidden = true; }, 2600); }
  function resultWords(r) {
    if (r && r.ok) return T("msg.sent");
    var why = r && r.result;
    return why === "notReady" ? T("msg.notReady") : why === "already" ? T("msg.already") : T("msg.failed", { why: why || "?" });
  }
  function poll() {
    clearTimeout(timer);
    if (!shown) return;
    S.get("status", {}).then(function (m) {
      var before = signature();
      st = m || {};
      if (st.mapVersion && st.mapVersion !== ver) loadMap();
      if (signature() !== before) render(); else live();
      timer = setTimeout(poll, busy() ? 5000 : 10000);
    }, function (e) {
      st = { online: false, why: "reach", message: e && e.message };
      render();
      timer = setTimeout(poll, 15000);
    });
  }
  function loadMap() {
    S.get("map", ver ? { v: ver } : {}).then(function (m) {
      if (!m || m.same) return;
      if (m.none || !(m.rle instanceof Array)) { mp = null; cells = null; render(); return; }
      mp = m; ver = m.version || null;
      var n = m.width * m.height, c = new Uint8Array(n), i = 0;
      for (var k = 0; k + 1 < m.rle.length && i < n; k += 2) { var end = Math.min(n, i + m.rle[k + 1]); for (; i < end; i++) c[i] = m.rle[k]; }
      cells = c; BASE = null;
      var x0 = m.width, x1 = 0, y0 = m.height, y1 = 0;
      for (var y = 0; y < m.height; y++) for (var x = 0; x < m.width; x++) if (c[y * m.width + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      BOX = x1 >= x0 ? { x0: x0 - 3, y0: y0 - 3, x1: x1 + 3, y1: y1 + 3 } : null;
      var keep = {}; for (var id in sel) if (sel.hasOwnProperty(id) && roomById(+id)) keep[id] = 1;
      sel = keep;
      render();
    }, function () { /* the next status poll tries again */ });
  }
  function send(route, body) {
    if (sending) return;
    sending = true; render();
    S.post(route, body).then(function (r) {
      sending = false; toast(body.cmd === "locate" && r && r.ok ? T("msg.located") : resultWords(r)); poll();
    }, function (e) { sending = false; toast(T("msg.failed", { why: e && e.message ? e.message : "?" })); render(); });
  }

  // ---------------------------------------------------------------- the card
  function signature() {
    return JSON.stringify([st && st.online, st && st.state, st && st.reason, st && st.fault && st.fault.code, errOn(), tier(), selIds(), mode, !!mp, sending,
      st && st.station && st.station.mopDrying]);
  }
  function render() {
    var t = tier(), bat = st && typeof st.battery === "number" ? st.battery : null;
    var name = esc(st && st.name ? st.name : T("card.name"));
    var line = '<span id="line" class="' + (errOn() ? "bad" : "") + '">' + esc(statusLine()) + "</span>";
    var batH = bat === null ? "" : '<span class="bat"><i><b class="' + (bat < 20 ? "low" : "") + '" id="batbar" style="width:' + Math.max(2, bat * 0.18) + 'px"></b></i><span id="bat">' + bat + "%</span></span>";
    var head = '<div class="vhead">' + art(errOn() ? "error" : st && st.state) + '<div class="tt"><b>' + name + "</b>" + line + "</div>" +
      (errOn() ? '<span class="dot"></span>' : "") + batH + "</div>";
    var allowed = O.controls !== false, paused = st && (st.state === "paused" || st.state === "error");
    var html;
    if (t === "tiny") html = head;
    else if (t === "short") {
      var q = "";
      if (allowed && st && st.online) q = busy() ? '<div class="acts"><button class="btn pri" data-cmd="' + (paused ? "resume" : "pause") + '" title="' + esc(T(paused ? "btn.resume" : "btn.pause")) + '">' + (paused ? ICON.play : ICON.pause) + "</button>" +
        '<button class="btn" data-cmd="dock" title="' + esc(T("btn.home")) + '">' + ICON.home + "</button></div>" : '<div class="acts"><button class="btn pri" data-start="1">' + ICON.play + " " + esc(T("btn.start")) + "</button></div>";
      html = head + q;
    } else {
      var overlay = errOn() ? '<div class="alert">' + ICON.warn + '<span class="sp">' + esc(faultWords()) + "</span>" + (allowed ? '<button class="btn sm" data-cmd="resume">' + esc(T("btn.resume")) + "</button>" : "") + "</div>"
        : offline() ? '<div class="alert warn">' + ICON.warn + '<span class="sp">' + esc(st.why === "noId" ? T("msg.noId") : st.message && st.why === "reach" && st.message.length > 12 ? st.message : T("msg.offline")) + "</span></div>" : "";
      var map = '<div class="mapbox" id="mapbox">' + overlay + (mp ? "<canvas></canvas>" : '<div class="empty">' + esc(T("msg.noMap")) + "</div>") +
        (mp ? '<div class="mbtn zoom"><button data-z="out" title="' + esc(T("btn.zoomOut")) + '">−</button><b data-z="reset" title="' + esc(T("btn.zoomReset")) + '" id="zpct">' + Math.round(view.zoom * 100) + "%</b>" +
          '<button data-z="in" title="' + esc(T("btn.zoomIn")) + '">+</button></div>' +
          '<div class="pad" id="pad"><button data-pan="u" style="left:37px;top:0">▲</button><button data-pan="l" style="left:0;top:37px">◀</button>' +
          '<button data-pan="x" style="left:37px;top:37px" title="' + esc(T("btn.hideArrows")) + '">✕</button><button data-pan="r" style="left:74px;top:37px">▶</button>' +
          '<button data-pan="d" style="left:37px;top:74px">▼</button></div>' +
          (O.rotate !== false ? '<button class="mbtn rot" data-rot="1" title="' + esc(T("btn.turn")) + '">' + ICON.rot + "</button>" : "") : "") + "</div>";
      var prog = "";
      if (st && st.job && (st.state === "cleaning" || paused)) {
        prog = '<div class="prog">' + (st.job.areaM2 !== null && st.job.areaM2 !== undefined ? "<span><b id=\"area\">" + esc(T("job.area", { n: st.job.areaM2 })) + "</b></span>" : "") +
          (st.job.elapsed ? "<span><b id=\"min\">" + esc(T("job.min", { n: Math.round(st.job.elapsed / 60) })) + "</b></span>" : "") + "</div>";
      }
      var controls = "";
      if (allowed && st && st.online) {
        if (busy()) {
          controls = '<div class="acts"><button class="btn pri" data-cmd="' + (paused ? "resume" : "pause") + '"' + (sending ? " disabled" : "") + ">" + (paused ? ICON.play + " " + esc(T("btn.resume")) : ICON.pause + " " + esc(T("btn.pause"))) + "</button>" +
            '<button class="btn" data-cmd="dock"' + (sending ? " disabled" : "") + ">" + ICON.home + " " + esc(T("btn.home")) + "</button>" +
            (t === "small" ? "" : '<button class="btn" data-cmd="cancel"' + (sending ? " disabled" : "") + ">" + ICON.stop + " " + esc(T("btn.stop")) + "</button>") + "</div>";
        } else {
          var ids = selIds(), names = [];
          for (var i = 0; i < ids.length; i++) names.push(roomName(roomById(ids[i])));
          var modes = t === "small" ? "" : '<div class="modes">' + MODES.map(function (m) { return '<button class="' + (m === mode ? "on" : "") + '" data-mode="' + m + '">' + ICON[m] + esc(T("mode." + m)) + "</button>"; }).join("") + "</div>";
          var rooms = '<div class="rooms"><button class="chip ' + (ids.length ? "" : "on") + '" data-all="1">' + esc(T("rooms.all")) + '</button><span class="hint">' +
            esc(ids.length ? T("rooms.picked", { rooms: names.join(", ") }) : T("rooms.tap")) + "</span></div>";
          controls = modes + rooms + '<div class="acts"><button class="btn pri" data-start="1"' + (sending ? " disabled" : "") + ">" + ICON.play + " " +
            esc(ids.length === 1 ? T("btn.cleanOne") : ids.length ? T("btn.cleanN", { n: ids.length }) : T("btn.cleanAll")) + "</button></div>";
        }
      }
      var more = "";
      if (t === "large" && O.station !== false && st && st.online) {
        more = '<div class="more">' + ["washMop", "dryMop", "emptyDust", "locate"].map(function (c) {
          return '<button class="btn" data-cmd="' + c + '"' + (sending ? " disabled" : "") + ">" + ICON[c] + esc(T("btn." + c)) + "</button>";
        }).join("") + "</div>";
      }
      html = head + map + prog + controls + more;
    }
    root.className = "vac t-" + t;
    root.innerHTML = html;
    wire();
    draw();
  }
  function faultWords() {
    var code = st.fault && st.fault.code, k = "fault." + code, s = T(k);
    return s === k ? T("fault.generic", { code: code }) : s;
  }
  function live() {   // numbers and the robot's spot, without redrawing the controls
    var e = document.getElementById("line"); if (e) e.textContent = statusLine();
    var b = document.getElementById("bat"), bb = document.getElementById("batbar");
    if (b && st && typeof st.battery === "number") { b.textContent = st.battery + "%"; bb.style.width = Math.max(2, st.battery * 0.18) + "px"; }
    var a = document.getElementById("area"); if (a && st && st.job) a.textContent = T("job.area", { n: st.job.areaM2 });
    var mi = document.getElementById("min"); if (mi && st && st.job && st.job.elapsed) mi.textContent = T("job.min", { n: Math.round(st.job.elapsed / 60) });
    draw();
  }

  // ---------------------------------------------------------------- the map: turn, zoom, move (labels upright)
  function roomAt(x, y) {
    if (!mp || !cells) return 0;
    var ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= mp.width || iy >= mp.height) return 0;
    var v = cells[iy * mp.width + ix]; return v > 0 && v < 250 ? v : 0;
  }
  function basePicture() {
    var BW = BOX.x1 - BOX.x0 + 1, BH = BOX.y1 - BOX.y0 + 1;
    var off = document.createElement("canvas"); off.width = BW; off.height = BH;
    var g = off.getContext("2d"), img = g.createImageData(BW, BH), any = selIds().length > 0;
    for (var y = 0; y < BH; y++) for (var x = 0; x < BW; x++) {
      var mx = x + BOX.x0, my = BOX.y1 - y;
      if (mx < 0 || my < 0 || mx >= mp.width || my >= mp.height) continue;
      var v = cells[my * mp.width + mx]; if (!v) continue;
      var c = v === 250 ? [255, 255, 255] : PALETTE[(v - 1) % PALETTE.length], a = v === 250 ? 0.16 : 1;
      var edge = v !== 250 && (roomAt(mx + 1, my) !== v || roomAt(mx - 1, my) !== v || roomAt(mx, my + 1) !== v || roomAt(mx, my - 1) !== v);
      var dim = any && v !== 250 && !sel[v], f = edge ? 0.55 : 1, k = (y * BW + x) * 4;
      img.data[k] = c[0] * f; img.data[k + 1] = c[1] * f; img.data[k + 2] = c[2] * f; img.data[k + 3] = 255 * a * (dim ? 0.35 : 1);
    }
    g.putImageData(img, 0, 0);
    return off;
  }
  var GEOM = null;
  function R(u, v, BW, BH) { var r = view.rot; return r === 90 ? [BH - v, u] : r === 180 ? [BW - u, BH - v] : r === 270 ? [v, BW - u] : [u, v]; }
  function Rinv(X, Y, BW, BH) { var r = view.rot; return r === 90 ? [Y, BH - X] : r === 180 ? [BW - X, BH - Y] : r === 270 ? [BW - Y, X] : [X, Y]; }
  function Rvec(dx, dy) { var r = view.rot; return r === 90 ? [-dy, dx] : r === 180 ? [-dx, -dy] : r === 270 ? [dy, -dx] : [dx, dy]; }
  function draw() {
    var box = document.getElementById("mapbox"), cv = box && box.querySelector("canvas");
    if (!cv || !mp || !BOX) return;
    var BW = BOX.x1 - BOX.x0 + 1, BH = BOX.y1 - BOX.y0 + 1, rot = view.rot;
    var rw = rot % 180 ? BH : BW, rh = rot % 180 ? BW : BH, aw = box.clientWidth, ah = box.clientHeight;
    if (aw < 10 || ah < 10) return;
    var fit = Math.min(aw / rw, ah / rh), s = fit * view.zoom, dpr = window.devicePixelRatio || 1;
    var mxp = Math.max(0, (rw * s - aw) / 2) + aw * 0.25, myp = Math.max(0, (rh * s - ah) / 2) + ah * 0.25;
    view.pan[0] = Math.max(-mxp, Math.min(mxp, view.pan[0])); view.pan[1] = Math.max(-myp, Math.min(myp, view.pan[1]));
    var left = (aw - rw * s) / 2 + view.pan[0], top = (ah - rh * s) / 2 + view.pan[1];
    cv.width = Math.round(aw * dpr); cv.height = Math.round(ah * dpr); cv.style.width = aw + "px"; cv.style.height = ah + "px";
    var g = cv.getContext("2d");
    if (!BASE) BASE = basePicture();
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(dpr * s, 0, 0, dpr * s, dpr * left, dpr * top); g.imageSmoothingEnabled = false;
    g.save();
    if (rot === 90) { g.translate(BH, 0); g.rotate(Math.PI / 2); } else if (rot === 180) { g.translate(BW, BH); g.rotate(Math.PI); } else if (rot === 270) { g.translate(0, BW); g.rotate(-Math.PI / 2); }
    g.drawImage(BASE, 0, 0); g.restore();
    var P = function (p) { return R(p[0] - BOX.x0, BOX.y1 - p[1], BW, BH); };
    var zk = 1 / Math.sqrt(view.zoom), i, q;
    var trail = st && st.trail instanceof Array && busy() ? st.trail : [];
    if (trail.length > 1) {
      g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 1.2 * zk; g.beginPath();
      for (i = 0; i < trail.length; i++) { q = P(trail[i]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
      g.stroke();
    }
    if (mp.dock) { q = P(mp.dock); var k = 3 * zk; g.fillStyle = "#fff"; g.fillRect(q[0] - k, q[1] - k, 2 * k, 2 * k); }
    var pos = st && st.position;
    var spot = pos ? [pos.x, pos.y] : (st && st.onDock && mp.dock ? mp.dock : null);
    if (spot && st && st.online) {
      q = P(spot);
      var hd = pos && typeof pos.heading === "number" ? pos.heading * Math.PI / 180 : null;
      g.fillStyle = "#38bdf8"; g.strokeStyle = "#fff"; g.lineWidth = 1.2 * zk; g.beginPath(); g.arc(q[0], q[1], 4.2 * zk, 0, 7); g.fill(); g.stroke();
      if (hd !== null) { var hv = Rvec(Math.cos(hd), -Math.sin(hd)); g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + hv[0] * 6 * zk, q[1] + hv[1] * 6 * zk); g.stroke(); }
    }
    var old = box.querySelectorAll(".lab"); for (i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    var minM2 = s < 1.1 ? 9 : s < 1.6 ? 4 : s < 3 ? 1.5 : 0;
    var rs = mp.rooms || [];
    for (i = 0; i < rs.length; i++) {
      var rm = rs[i]; if (!rm.label || rm.areaM2 < minM2) continue;
      q = P(rm.label); var x = left + q[0] * s, y = top + q[1] * s;
      if (x < 0 || y < 0 || x > aw || y > ah) continue;
      var el = document.createElement("span"); el.className = "lab" + (sel[rm.id] ? " sel" : ""); el.textContent = roomName(rm);
      el.style.left = x + "px"; el.style.top = y + "px"; box.appendChild(el);
    }
    var z = document.getElementById("zpct"); if (z) z.textContent = Math.round(view.zoom * 100) + "%";
    GEOM = { aw: aw, ah: ah, left: left, top: top, s: s, BW: BW, BH: BH };
  }
  function hit(cx, cy) {
    if (!GEOM) return 0;
    var uv = Rinv((cx - GEOM.left) / GEOM.s, (cy - GEOM.top) / GEOM.s, GEOM.BW, GEOM.BH);
    return roomAt(uv[0] + BOX.x0, BOX.y1 - uv[1]);
  }
  function zoomAt(f, cx, cy) {
    var z0 = view.zoom, z1 = Math.max(1, Math.min(6, z0 * f));
    if (z1 === z0 || !GEOM) return;
    var px = cx - GEOM.aw / 2 - view.pan[0], py = cy - GEOM.ah / 2 - view.pan[1];
    view.pan[0] -= px * (z1 / z0 - 1); view.pan[1] -= py * (z1 / z0 - 1);
    view.zoom = z1; if (z1 === 1) view.pan = [0, 0];
    draw(); saveView();
  }

  // ---------------------------------------------------------------- wiring
  function wire() {
    var each = function (sel_, fn) { var l = root.querySelectorAll(sel_); for (var i = 0; i < l.length; i++) fn(l[i]); };
    each("[data-mode]", function (b) { b.onclick = function () { mode = b.getAttribute("data-mode"); saveView(); render(); }; });
    each("[data-all]", function (b) { b.onclick = function () { sel = {}; BASE = null; render(); }; });
    each("[data-start]", function (b) { b.onclick = function () { send("start", { mode: mode, rooms: selIds() }); }; });
    each("[data-cmd]", function (b) { b.onclick = function () { send("command", { cmd: b.getAttribute("data-cmd") }); }; });
    each("[data-rot]", function (b) { b.onclick = function () { view.rot = (view.rot + 90) % 360; view.pan = [0, 0]; draw(); saveView(); }; });
    each("[data-z]", function (b) {
      b.onclick = function (e) {
        e.stopPropagation(); var k = b.getAttribute("data-z");
        if (k === "in") zoomAt(1.4, GEOM.aw / 2, GEOM.ah / 2); else if (k === "out") zoomAt(1 / 1.4, GEOM.aw / 2, GEOM.ah / 2);
        else { view.zoom = 1; view.pan = [0, 0]; draw(); saveView(); }
      };
    });
    each("[data-pan]", function (b) {
      b.onclick = function (e) {
        e.stopPropagation(); var d = b.getAttribute("data-pan"), pad = document.getElementById("pad");
        if (d === "x") { pad.className = "pad"; return; }
        if (view.zoom === 1) view.zoom = 1.6;
        view.pan[0] += d === "l" ? GEOM.aw * 0.2 : d === "r" ? -GEOM.aw * 0.2 : 0;
        view.pan[1] += d === "u" ? GEOM.ah * 0.2 : d === "d" ? -GEOM.ah * 0.2 : 0;
        draw(); saveView();
      };
    });
    var box = document.getElementById("mapbox"), cv = box && box.querySelector("canvas");
    if (!cv) return;
    box.addEventListener("wheel", function (e) { e.preventDefault(); var r = box.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    var pts = {}, n = 0, start = null, moved = false, pinch = null, press = null;
    function list() { var a = []; for (var k in pts) if (pts.hasOwnProperty(k)) a.push(pts[k]); return a; }
    cv.addEventListener("pointerdown", function (e) {
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* not a live pointer */ }
      if (!pts[e.pointerId]) n++;
      pts[e.pointerId] = [e.clientX, e.clientY]; moved = false;
      if (n === 1) {
        start = [e.clientX, e.clientY, view.pan[0], view.pan[1]]; clearTimeout(press);
        press = setTimeout(function () { if (!moved) { var p = document.getElementById("pad"); if (p) p.className = p.className === "pad on" ? "pad" : "pad on"; moved = true; } }, 600);
      }
      if (n === 2) { clearTimeout(press); var a = list(); pinch = { d: Math.sqrt(Math.pow(a[0][0] - a[1][0], 2) + Math.pow(a[0][1] - a[1][1], 2)) || 1, z: view.zoom }; moved = true; }
    });
    cv.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId]) return;
      pts[e.pointerId] = [e.clientX, e.clientY];
      if (n === 2 && pinch) {
        var a = list(), d = Math.sqrt(Math.pow(a[0][0] - a[1][0], 2) + Math.pow(a[0][1] - a[1][1], 2)), r = box.getBoundingClientRect();
        zoomAt((pinch.z * d / pinch.d) / view.zoom, (a[0][0] + a[1][0]) / 2 - r.left, (a[0][1] + a[1][1]) / 2 - r.top); return;
      }
      if (n === 1 && start) {
        var dx = e.clientX - start[0], dy = e.clientY - start[1];
        if (!moved && Math.sqrt(dx * dx + dy * dy) > 6) { moved = true; clearTimeout(press); }
        if (moved && view.zoom > 1) { view.pan = [start[2] + dx, start[3] + dy]; draw(); saveView(); }
      }
    });
    function up(e) { if (pts[e.pointerId]) { delete pts[e.pointerId]; n--; } clearTimeout(press); if (n < 2) pinch = null; if (!n) start = null; cv.dragged = moved; }
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("click", function (e) {
      if (cv.dragged) { cv.dragged = false; return; }
      if (busy() || O.controls === false) return;
      var r = cv.getBoundingClientRect(), id = hit(e.clientX - r.left, e.clientY - r.top);
      if (!id) return;
      if (sel[id]) delete sel[id]; else sel[id] = 1;
      BASE = null; render();
    });
  }

  S.on("size", function (sz) { if (sz && sz.w && sz.h) { var t0 = tier(); size = { w: sz.w, h: sz.h }; if (tier() !== t0) render(); else draw(); } });
  S.on("visible", function (v) { shown = !!v; if (shown) poll(); else clearTimeout(timer); });
  S.on("theme", function () { draw(); });
  window.addEventListener("resize", function () { size = { w: window.innerWidth, h: window.innerHeight }; render(); });
  render();
  poll();
})();
