// NVIDIA Shield remote card (mockup n270, approved), written against the card frame's bridge, window.Skypane:
// get/post (this plugin's panel routes: status, apps, icon, key, text, launch, find, power), view.get/set (the app filter),
// t (its words), on("size" | "visible"), options (shield, look, btnLabel, btnAction, btnApp, btnColor, appList, iconSize,
// findBtn, kbdBtn, showStatus). The apps are the ones picked in Integrations (the worker keeps the list). ES5, for older wall tablets.
(function () {
  "use strict";
  var S = window.Skypane, root = document.getElementById("root"), toastEl = document.getElementById("toast");
  if (!S) { root.textContent = "No bridge"; return; }
  var O = S.options || {};
  var T = function (k, v) { return S.t(k, v); };
  function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  var IC = {
    power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3v8"/><path d="M6.3 6.6a8 8 0 1 0 11.4 0"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M16 5v14L6 12z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="6.5"/></svg>',
    ff: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6l8 6-8 6zM12 6l8 6-8 6z"/></svg>',
    rewind: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 6l-8 6 8 6zM12 6l-8 6 8 6z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
    playpause: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5l9 7-9 7z"/><rect x="14" y="5" width="2.6" height="14"/><rect x="18.4" y="5" width="2.6" height="14"/></svg>',
    volup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 9h3l5-4v14l-5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    voldown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M4 9h3l5-4v14l-5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6"/></svg>',
    kbd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6 13.5h.01M18 13.5h.01M9 14.5h6" stroke-width="2.2"/></svg>',
    find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="7" width="6" height="14" rx="3"/><circle cx="12" cy="11" r="1.2" fill="currentColor"/><path d="M7 5.5a7 7 0 0 1 10 0M5 3a10 10 0 0 1 14 0"/></svg>'
  };
  var REPEAT = { volup: 1, voldown: 1, up: 1, down: 1, left: 1, right: 1 };

  // ---------------------------------------------------------------- state
  var st = null, apps = null, appsVer = null;
  var size = { w: window.innerWidth, h: window.innerHeight }, shown = true, timer = null, shape = "";
  var synced = true;

  var ratio = 3.1;                       // (the remote's height / width, measured at each fit)
  function appsOn() { return O.appList === undefined ? O.appRow !== "none" : O.appList !== false; }
  function colWidth() {                  // one column of apps: the icon (× Style → Icons) and its name's room
    var ts = Math.max(36, Math.min(180, typeof O.iconSize === "number" ? O.iconSize : 72));
    var ic = parseFloat(getComputedStyle(root).getPropertyValue("--icons")) || 1;
    return ts * ic + 26;
  }
  function layout() {
    var w = size.w, h = size.h;
    if (h < 110) return "tiny";
    // the apps go beside the remote whenever one column of them fits next to a remote filling the card's height
    var remoteW = Math.max(75, (h - 60) / ratio);
    if (appsOn() && h >= 260 && w - 24 >= remoteW + 16 + colWidth()) return "large";
    if (w >= h * 1.6 && h < 340) return "wide";
    return "tall";
  }

  // ---------------------------------------------------------------- pieces
  function k(name, cls) {
    return '<button class="k' + (cls ? " " + cls : "") + '" data-k="' + name + '" aria-label="' + esc(T("btn." + name)) + '">' + IC[name] + "</button>";
  }
  function dpad() {
    return '<div class="dpad"><button class="seg up" data-k="up" aria-label="' + esc(T("btn.up")) + '"></button>' +
      '<button class="seg down" data-k="down" aria-label="' + esc(T("btn.down")) + '"></button>' +
      '<button class="seg left" data-k="left" aria-label="' + esc(T("btn.left")) + '"></button>' +
      '<button class="seg right" data-k="right" aria-label="' + esc(T("btn.right")) + '"></button>' +
      '<button class="okb" data-k="ok" aria-label="' + esc(T("btn.ok")) + '"></button></div>';
  }
  function custom() {
    var label = String(O.btnLabel || "").slice(0, 24);          // (blank until it's given a label)
    return '<button class="custom" data-k="custom">' + esc(label) + "</button>";
  }
  function remote() {
    return '<div class="remote"><span class="led' + (st && st.online && !st.standby ? " on" : "") + '"></span><div class="pair">' + k("power", "power") + k("menu") + "</div>" + dpad() +
      '<div class="grid">' + k("back") + k("home") + k("ff") + k("search") + k("playpause") + k("volup") + k("rewind") + k("voldown") + "</div>" + custom() + "</div>";
  }
  function statusLine() {
    var on = O.showStatus !== false;
    return '<div class="status"><span class="dot" id="dot"></span><b id="sname">' + esc((st && st.name) || "Shield") + '</b>' +
      '<span class="what" id="swhat"></span>' +
      (O.kbdBtn === true ? '<button class="find kbdb" data-k="kbd" aria-label="' + esc(T("btn.kbd")) + '">' + IC.kbd + "</button>" : "") + (O.findBtn !== false ? '<button class="find" data-k="find" aria-label="' + esc(T("btn.find")) + '">' + IC.find + "</button>" : "") + "</div>";
  }
  function tilesHtml() {
    return '<div class="appside"><div class="tiles" id="tiles"></div></div>';
  }

  // ---------------------------------------------------------------- draw
  function fit() {
    // one size unit for the whole card (--u: 1 = the real remote at 150 px wide), from the space it has
    var l = shape.split("|")[0], h = size.h - 50, w = size.w - 24, u;
    if (l === "tiny") u = Math.min(0.95, (size.h - 40) / 44, w / 250);
    else if (l === "wide") u = Math.min(1.25, h / 125, w / 470);
    else if (l === "large") u = Math.min(h / 560, (w * 0.42) / 150);
    else u = Math.min(h / 560, w / 160);
    root.style.setProperty("--u", Math.max(0.5, Math.min(1.6, u)).toFixed(3) + "px");
    // the whole remote (tall / large): measure it and scale it to fill the card's height, within its width
    var r = root.querySelector(".remote"), sl = root.querySelector(".status");
    if (r && (l === "tall" || l === "large")) {
      var avail = size.h - (sl ? sl.offsetHeight + 8 : 0) - 22, wcap = l === "large" ? Math.max(w * 0.4, w - 16 - colWidth()) / 156 : w / 156;
      for (var pass = 0; pass < 2; pass++) {
        var hNow = r.offsetHeight; if (!hNow) break;
        u = Math.max(0.5, Math.min(2.4, wcap, u * avail / hNow));
        root.style.setProperty("--u", u.toFixed(3) + "px");
      }
    }
    if (r && r.offsetWidth && r.offsetHeight && l !== "tiny" && l !== "wide") ratio = r.offsetHeight / r.offsetWidth;
    var side = root.querySelector(".appside");
    if (side && r) side.style.height = r.offsetHeight + "px";          // (the apps stop where the remote stops)
    // the keyboard's key height: four rows in the space under the status line, never taller than a finger needs
    var room = l === "tiny" ? size.h - 8 - 8 - 30 - 9 : size.h - 48 - 16 - 36 - 18;
    root.style.setProperty("--kh", Math.max(l === "tiny" ? 8 : 26, Math.min(52, room / 4)).toFixed(0) + "px");
  }
  function draw() {
    var l = layout(), look = O.look === "flat" ? "flat" : "real";
    shape = l + "|" + look;
    root.className = "sh " + l + " " + look;
    var body;
    if (l === "tiny") body = '<div class="bar">' + k("power", "power") + (size.w >= 280 ? k("playpause") : "") + k("voldown") + k("volup") + custom() + "</div>";
    else if (l === "wide") body = '<div class="wbody">' + dpad() + '<div class="side">' + k("power", "power") + k("menu") + k("back") + k("home") +
      k("rewind") + k("playpause") + k("ff") + k("search") + k("voldown") + k("volup") + custom() + "</div></div>";
    else if (l === "large") body = '<div class="lbody">' + remote() + tilesHtml() + "</div>";
    else body = '<div class="tbody">' + remote() + "</div>";
    root.innerHTML = statusLine() + body + kbdHtml();
    [].forEach.call(root.querySelectorAll(".custom"), function (b) { if (/^#[0-9a-f]{6}$/i.test(O.btnColor || "")) b.style.setProperty("--cc", O.btnColor); });
    var ts = typeof O.iconSize === "number" ? O.iconSize : 72;
    root.style.setProperty("--ts", Math.max(36, Math.min(180, ts)) + "px");
    kbDraw();
    fit();
    drawStatus();
    drawTiles();
  }
  function drawStatus() {
    var dot = document.getElementById("dot"), what = document.getElementById("swhat"), name = document.getElementById("sname");
    if (!dot) return;
    if (st && st.name) name.textContent = st.name;
    var text = "", cls = "dot";
    if (!st) text = T("st.starting");
    else if (!st.paired) { text = T("st.unpaired"); cls += " bad"; }
    else if (st.online === false) { text = T("st.offline"); cls += " off"; }
    else if (st.standby) { text = T("st.asleep"); cls += " off"; }
    else if (O.showStatus !== false) text = [st.app, typeof st.volume === "number" ? "🔊 " + st.volume + "%" : ""].filter(Boolean).join(" · ");
    dot.className = cls;
    what.textContent = text ? "· " + text : "";
    var led = root.querySelector(".led"); if (led) led.className = "led" + (st && st.online && !st.standby ? " on" : "");
  }
  function drawTiles() {
    var box = document.getElementById("tiles"); if (!box) return;
    if (!apps || !apps.length) { box.innerHTML = '<div class="empty">' + esc(T("msg.noApps")) + "</div>"; return; }
    box.innerHTML = apps.map(function (a) {
      var img = typeof a.icon === "string" && a.icon.indexOf("data:image/png;base64,") === 0 ? ' style="background-image:url(' + a.icon + ')"' : "";
      return '<button class="tile" data-app="' + esc(a.pkg) + '"><i class="ti" data-icon="' + esc(a.pkg) + '"' + img + "></i><span>" + esc(a.name) + "</span></button>";
    }).join("");
  }

  // ---------------------------------------------------------------- talking to the worker
  function toast(text) {
    toastEl.textContent = text; toastEl.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.hidden = true; }, 3500);
  }
  function said(r) { if (r && r.ok === false) toast(r.text || T("msg.failed")); return r; }
  function fail(e) { var m = e && e.message; toast(m === "too-many" ? T("msg.tooMany") : m || T("msg.failed")); }
  function poll() {
    clearTimeout(timer);
    if (!shown) return;
    S.get("status").then(function (r) {
      st = r; drawStatus();
      if (r && r.appsVersion && r.appsVersion !== appsVer) loadApps();
      timer = setTimeout(poll, 10000);
    }, function (e) {
      if (e && e.message === "too-many") { timer = setTimeout(poll, 30000); return; }      // (busy: just ask again later)
      st = { online: false, paired: true }; drawStatus(); if (e && e.message) toast(e.message); timer = setTimeout(poll, 20000);
    });
  }
  function loadApps() {
    S.get("apps", appsVer ? { v: appsVer } : {}).then(function (r) {
      if (!r || r.same) return;
      apps = r.apps || []; appsVer = r.version || null; synced = r.synced !== false;
      drawTiles();
    }, function () {});
  }
  function findApp(want) {
    want = String(want || "").trim().toLowerCase();
    if (!want) return null;
    var list = apps || [], i;
    for (i = 0; i < list.length; i++) if (list[i].pkg.toLowerCase() === want || list[i].name.toLowerCase() === want) return list[i];
    for (i = 0; i < list.length; i++) if (list[i].name.toLowerCase().indexOf(want) === 0) return list[i];
    return null;
  }
  // ---------------------------------------------------------------- the keyboard: our own, in the remote's look; each key
  // goes to the TV as it's tapped
  var PAGES = {
    abc: [["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"], ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
      ["#shift", "z", "x", "c", "v", "b", "n", "m", "#back"], ["#123", ",", "#space", ".", "#enter"]],
    "123": [["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"], ["-", "/", ":", ";", "(", ")", "$", "&", "@", '"'],
      ["#sym", ".", ",", "?", "!", "'", "#back"], ["#abc", "#space", "#enter"]],
    sym: [["[", "]", "{", "}", "#", "%", "^", "*", "+", "="], ["_", "\\", "|", "~", "<", ">", "`"],
      ["#123", ".", ",", "?", "!", "'", "#back"], ["#abc", "#space", "#enter"]]
  };
  var KI = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M9 5h11v14H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg>',
    shift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 4l8 8h-4.5v7h-7v-7H4z"/></svg>',
    enter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M19 5v7H6"/><path d="M10 8l-4 4 4 4"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  var kb = { open: false, page: "abc", shift: 0, typed: "", sending: false, todo: [] };
  function kbdHtml() {
    return '<div class="kbd" id="kbd" hidden><div class="kbtop"><span class="kbtyped" id="kbtyped"></span>' +
      '<button class="kk kclose" data-kb="close" aria-label="' + esc(T("kbd.done")) + '">' + KI.close + '</button></div><div class="kbrows" id="kbrows"></div></div>';
  }
  function kbDraw() {
    var box = document.getElementById("kbd"); if (!box) return;
    box.hidden = !kb.open;
    if (!kb.open) return;
    var up = kb.page === "abc" && kb.shift > 0;
    document.getElementById("kbrows").innerHTML = PAGES[kb.page].map(function (row) {
      return '<div class="kbrow">' + row.map(function (c) {
        if (c.length > 1 && c.charAt(0) === "#") {
          var n = c.slice(1), cls = "kk kw k-" + n, label;
          if (n === "back" || n === "enter") label = KI[n];
          else if (n === "shift") { label = KI.shift; if (kb.shift) cls += kb.shift === 2 ? " lock" : " on"; }
          else if (n === "space") label = esc(T("kbd.space"));
          else label = { "123": "123", abc: "ABC", sym: "#+=" }[n];
          var aria = { back: "kbd.back", enter: "kbd.enter", shift: "kbd.shift", space: "kbd.space", "123": "kbd.more", sym: "kbd.more", abc: "kbd.abc" }[n];
          return '<button class="' + cls + '" data-kb="' + n + '" aria-label="' + esc(T(aria)) + '">' + label + "</button>";
        }
        var ch = up ? c.toUpperCase() : c;
        return '<button class="kk" data-ch="' + esc(ch) + '">' + esc(ch) + "</button>";
      }).join("") + "</div>";
    }).join("");
    kbEcho();
  }
  function kbEcho() {
    var el = document.getElementById("kbtyped"); if (!el) return;
    el.textContent = kb.typed.slice(-60);
    el.className = "kbtyped" + (kb.typed ? "" : " ph");
    if (!kb.typed) el.textContent = T("kbd.ph");
  }
  function kbOpen(on) { kb.open = on; kb.typed = ""; kb.page = "abc"; kb.shift = 0; kbDraw(); }
  function kbSend(body) {                       // one at a time, in order; keys waiting behind are joined
    var q = kb.todo, last = q[q.length - 1];
    if (body.text && last && last.text && last.text.length + body.text.length <= 100) last.text += body.text;
    else if (body.key === "backspace" && last && last.key === "backspace" && last.n < 100) last.n += 1;
    else q.push(body);
    kbNext();
  }
  function kbNext() {
    if (kb.sending || !kb.todo.length || kb.timer) return;
    var wait = (kb.last || 0) + GAP - Date.now();
    if (wait > 0) { kb.timer = setTimeout(function () { kb.timer = null; kbNext(); }, wait); return; }
    kb.sending = true; kb.last = Date.now();
    S.post("text", kb.todo.shift()).then(function (r) { kb.sending = false; said(r); kbNext(); },
      function (e) { kb.sending = false; kb.todo = []; fail(e); });
  }
  function kbKey(b) {
    var ch = b.getAttribute("data-ch");
    if (ch !== null) {
      kbSend({ text: ch }); kb.typed += ch;
      if (kb.shift === 1) { kb.shift = 0; kbDraw(); } else kbEcho();
      return;
    }
    var n = b.getAttribute("data-kb");
    if (n === "close") return kbOpen(false);
    if (n === "space") { kbSend({ text: " " }); kb.typed += " "; return kbEcho(); }
    if (n === "back") { kbSend({ key: "backspace", n: 1 }); kb.typed = kb.typed.slice(0, -1); return kbEcho(); }
    if (n === "enter") { kbSend({ key: "enter", n: 1 }); kb.typed = ""; return kbEcho(); }
    if (n === "shift") { var now = Date.now(); kb.shift = kb.shift === 0 ? (now - (kb.shiftAt || 0) < 350 ? 2 : 1) : (kb.shift === 1 && now - kb.shiftAt < 350 ? 2 : 0); kb.shiftAt = now; return kbDraw(); }
    if (n === "123" || n === "abc" || n === "sym") { kb.page = n; kb.shift = 0; return kbDraw(); }
  }

  function press(name) {
    if (name === "find") return S.post("find", {}).then(function (r) { if (said(r).ok) toast(T("msg.found")); }, fail);
    if (name === "power") return S.post("power", {}).then(said, fail);
    if (name === "custom") {
      var act = O.btnAction || "none";
      if (act === "none" || act === "keyboard") return;
      if (act === "find") return press("find");
      if (act !== "app") return keySend(act);
      if (!String(O.btnApp || "").trim()) return;
      var a = findApp(O.btnApp);                // (else the worker looks the name up in every app the Shield has)
      return S.post("launch", a ? { pkg: a.pkg } : { name: String(O.btnApp).trim().slice(0, 150) }).then(said, fail);
    }
    return keySend(name);
  }
  // (Skypane lets a panel make 120 calls a minute to a plugin: presses close together go in one call)
  var GAP = 400, kq = [], kBusy = false, kLast = 0, kTimer = null;
  function keySend(name) {
    var last = kq[kq.length - 1];
    if (last && last.key === name && last.times < 10) last.times += 1; else kq.push({ key: name, times: 1 });
    keyNext();
  }
  function keyNext() {
    if (kBusy || !kq.length || kTimer) return;
    var wait = kLast + GAP - Date.now();
    if (wait > 0) { kTimer = setTimeout(function () { kTimer = null; keyNext(); }, wait); return; }
    kBusy = true; kLast = Date.now();
    S.post("key", kq.shift()).then(function (r) { kBusy = false; said(r); keyNext(); },
      function (e) { kBusy = false; kq = []; fail(e); });
  }

  // ---------------------------------------------------------------- touch
  var held = null;
  function flash(el) { el.classList.add("hit"); setTimeout(function () { el.classList.remove("hit"); }, 140); }
  root.addEventListener("pointerdown", function (e) {
    var kk = e.target.closest ? e.target.closest("[data-ch], [data-kb]") : null;
    if (kk) {
      e.preventDefault(); flash(kk); kbKey(kk);
      if (kk.getAttribute("data-kb") === "back") held = { t: setTimeout(function rep() { kbKey(kk); flash(kk); held.t = setTimeout(rep, 110); }, 450) };
      return;
    }
    var b = e.target.closest ? e.target.closest("[data-k]") : null;
    if (!b) return;
    var name = b.getAttribute("data-k");
    flash(b);
    if (opensKbd(name)) return kbOpen(!kb.open);
    press(name);
    if (REPEAT[name]) {
      held = { name: name, t: setTimeout(function rep() { press(name); flash(b); held.t = setTimeout(rep, 220); }, 450) };
    }
  });
  // the mic button opens the keyboard (the Shield's own search key is still a choice for your own button)
  function opensKbd(name) { return name === "kbd" || name === "search" || (name === "custom" && O.btnAction === "keyboard"); }
  function release() { if (held) { clearTimeout(held.t); held = null; } }
  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", release);
  root.addEventListener("pointerleave", release);
  root.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-app]") : null;
    if (t) { flash(t); S.post("launch", { pkg: t.getAttribute("data-app") }).then(said, fail); }
  });

  S.on("size", function (s) {
    size = { w: s.w, h: s.h };
    var l = layout() + "|" + (O.look === "flat" ? "flat" : "real");
    if (l !== shape) draw(); else fit();
  });
  S.on("visible", function (v) { shown = !!v; if (shown) poll(); else clearTimeout(timer); });
  draw();
  poll();
  loadApps();
})();
