// NVIDIA Shield remote card (mockup n270, approved), written against the card frame's bridge, window.Skypane:
// get/post (this plugin's panel routes: status, apps, icon, key, launch, find, power), view.get/set (the app filter),
// t (its words), on("size" | "visible"), options (shield, look, btnLabel, btnAction, btnApp, btnColor, tiles, findBtn,
// showStatus). ES5, for older wall tablets.
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
    find: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="7" width="6" height="14" rx="3"/><circle cx="12" cy="11" r="1.2" fill="currentColor"/><path d="M7 5.5a7 7 0 0 1 10 0M5 3a10 10 0 0 1 14 0"/></svg>'
  };
  var REPEAT = { volup: 1, voldown: 1, up: 1, down: 1, left: 1, right: 1 };

  // ---------------------------------------------------------------- state
  var st = null, apps = null, appsVer = null, icons = {}, iconQueue = [], iconBusy = false;
  var size = { w: window.innerWidth, h: window.innerHeight }, shown = true, timer = null, shape = "";
  var v0 = S.view.get() || {};
  var chip = ["all", "video", "music", "games"].indexOf(v0.chip) >= 0 ? v0.chip : "all";

  function layout() {
    var w = size.w, h = size.h;
    if (h < 110) return "tiny";
    if (O.tiles !== "none" && w >= 470 && h >= 360) return "large";
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
    var label = String(O.btnLabel === undefined ? "Netflix" : O.btnLabel).slice(0, 24);
    return '<button class="custom" data-k="custom">' + esc(label || " ") + "</button>";
  }
  function remote() {
    return '<div class="remote"><span class="led' + (st && st.online && !st.standby ? " on" : "") + '"></span><div class="pair">' + k("power", "power") + k("menu") + "</div>" + dpad() +
      '<div class="grid">' + k("back") + k("home") + k("ff") + k("search") + k("playpause") + k("volup") + k("rewind") + k("voldown") + "</div>" + custom() + "</div>";
  }
  function statusLine() {
    var on = O.showStatus !== false;
    return '<div class="status"><span class="dot" id="dot"></span><b id="sname">' + esc((st && st.name) || "Shield") + '</b>' +
      '<span class="what" id="swhat"></span>' + (O.findBtn !== false ? '<button class="find" data-k="find" aria-label="' + esc(T("btn.find")) + '">' + IC.find + "</button>" : "") + "</div>";
  }
  function tilesHtml() {
    var chips = '<div class="chips">' + ["all", "video", "music", "games"].map(function (c) {
      return '<button data-chip="' + c + '" class="' + (c === chip ? "on" : "") + '">' + esc(T("chip." + c)) + "</button>";
    }).join("") + "</div>";
    return '<div class="appside">' + chips + '<div class="tiles" id="tiles"></div></div>';
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
    root.innerHTML = statusLine() + body;
    [].forEach.call(root.querySelectorAll(".custom"), function (b) { if (/^#[0-9a-f]{6}$/i.test(O.btnColor || "")) b.style.setProperty("--cc", O.btnColor); });
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
  function shownApps() {
    return (apps || []).filter(function (a) {
      if (O.tiles === "media" && a.cat !== "video" && a.cat !== "music") return false;
      if (a.cat === "system" && O.tiles !== "all") return false;
      return chip === "all" || a.cat === chip;
    });
  }
  function drawTiles() {
    var box = document.getElementById("tiles"); if (!box) return;
    if (!apps || !apps.length) { box.innerHTML = '<div class="empty">' + esc(T("msg.noApps")) + "</div>"; return; }
    box.innerHTML = shownApps().map(function (a) {
      var img = icons[a.pkg] ? ' style="background-image:url(' + icons[a.pkg] + ')"' : "";
      return '<button class="tile" data-app="' + esc(a.pkg) + '"><i class="ti" data-icon="' + esc(a.pkg) + '"' + img + "></i><span>" + esc(a.name) + "</span></button>";
    }).join("");
    shownApps().forEach(function (a) { if (a.icon && !icons[a.pkg] && iconQueue.indexOf(a.pkg) < 0) iconQueue.push(a.pkg); });
    nextIcon();
  }
  function nextIcon() {
    if (iconBusy || !iconQueue.length || !shown) return;
    var pkg = iconQueue.shift(); iconBusy = true;
    S.get("icon", { pkg: pkg }).then(function (r) {
      iconBusy = false;
      if (r && typeof r.icon === "string" && r.icon.indexOf("data:image/png;base64,") === 0) {
        icons[pkg] = r.icon;
        var el = root.querySelector('[data-icon="' + pkg.replace(/"/g, "") + '"]');
        if (el) el.style.backgroundImage = "url(" + r.icon + ")";
      }
      nextIcon();
    }, function () { iconBusy = false; nextIcon(); });
  }

  // ---------------------------------------------------------------- talking to the worker
  function toast(text) {
    toastEl.textContent = text; toastEl.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.hidden = true; }, 3500);
  }
  function said(r) { if (r && r.ok === false) toast(r.text || T("msg.failed")); return r; }
  function fail(e) { toast((e && e.message) || T("msg.failed")); }
  function poll() {
    clearTimeout(timer);
    if (!shown) return;
    S.get("status").then(function (r) {
      st = r; drawStatus();
      if (r && r.appsVersion && r.appsVersion !== appsVer) loadApps();
      timer = setTimeout(poll, 10000);
    }, function (e) { st = { online: false, paired: true }; drawStatus(); if (e && e.message) toast(e.message); timer = setTimeout(poll, 20000); });
  }
  function loadApps() {
    S.get("apps", appsVer ? { v: appsVer } : {}).then(function (r) {
      if (!r || r.same) return;
      apps = r.apps || []; appsVer = r.version || null;
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
  function press(name) {
    if (name === "find") return S.post("find", {}).then(function (r) { if (said(r).ok) toast(T("msg.found")); }, fail);
    if (name === "power") return S.post("power", {}).then(said, fail);
    if (name === "custom") {
      var act = O.btnAction || "app";
      if (act === "none") return;
      if (act === "find") return press("find");
      if (act !== "app") return S.post("key", { key: act }).then(said, fail);
      var a = findApp(O.btnApp === undefined ? "Netflix" : O.btnApp);
      var pkg = a ? a.pkg : (/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+$/.test(O.btnApp || "") ? O.btnApp : null);
      if (!pkg) return toast(T("msg.noApp", { app: O.btnApp || "" }));
      return S.post("launch", { pkg: pkg }).then(said, fail);
    }
    return S.post("key", { key: name }).then(said, fail);
  }

  // ---------------------------------------------------------------- touch
  var held = null;
  function flash(el) { el.classList.add("hit"); setTimeout(function () { el.classList.remove("hit"); }, 140); }
  root.addEventListener("pointerdown", function (e) {
    var b = e.target.closest ? e.target.closest("[data-k]") : null;
    if (!b) return;
    var name = b.getAttribute("data-k");
    flash(b);
    press(name);
    if (REPEAT[name]) {
      held = { name: name, t: setTimeout(function rep() { press(name); flash(b); held.t = setTimeout(rep, 220); }, 450) };
    }
  });
  function release() { if (held) { clearTimeout(held.t); held = null; } }
  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", release);
  root.addEventListener("pointerleave", release);
  root.addEventListener("click", function (e) {
    var c = e.target.closest ? e.target.closest("[data-chip]") : null;
    if (c) {
      chip = c.getAttribute("data-chip");
      S.view.set({ chip: chip });
      [].forEach.call(root.querySelectorAll("[data-chip]"), function (x) { x.className = x === c ? "on" : ""; });
      drawTiles();
      return;
    }
    var t = e.target.closest ? e.target.closest("[data-app]") : null;
    if (t) { flash(t); S.post("launch", { pkg: t.getAttribute("data-app") }).then(said, fail); }
  });

  S.on("size", function (s) {
    size = { w: s.w, h: s.h };
    var l = layout() + "|" + (O.look === "flat" ? "flat" : "real");
    if (l !== shape) draw(); else fit();
  });
  S.on("visible", function (v) { shown = !!v; if (shown) { poll(); nextIcon(); } else clearTimeout(timer); });
  draw();
  poll();
  loadApps();
})();
