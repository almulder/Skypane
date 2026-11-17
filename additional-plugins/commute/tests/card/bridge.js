// A stand-in window.Skypane for checking the card in a browser: canned answers, the scenario from the page address
// (#state=ok&mode=work&late=0&look=day&map=1&light=0). Pictures are drawn here (a made-up street grid), not TomTom's.
(function () {
  var q = {}, h = location.hash.replace(/^#/, "").split("&"), i;
  for (i = 0; i < h.length; i++) { var kv = h[i].split("="); if (kv[0]) q[kv[0]] = decodeURIComponent(kv[1] || ""); }
  if (q.light === "1") document.body.className = "light";
  var NX = 5, NY = 4, calls = [];
  window.CALLS = calls;
  function tile(kind, i) {
    var c = document.createElement("canvas"); c.width = c.height = 256; var g = c.getContext("2d");
    if (kind === "map") {
      g.fillStyle = q.look === "night" ? "#1f2633" : "#eef0e6"; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = q.look === "night" ? "#3a4456" : "#ffffff"; g.lineWidth = 6;
      for (var k = 0; k < 4; k++) { g.beginPath(); g.moveTo(0, 32 + k * 64); g.lineTo(256, 32 + k * 64); g.stroke(); g.beginPath(); g.moveTo(32 + k * 64, 0); g.lineTo(32 + k * 64, 256); g.stroke(); }
      g.fillStyle = q.look === "night" ? "#24402c" : "#cfe6c4"; g.fillRect(70 + (i % 3) * 10, 70, 50, 50);
    } else {
      g.lineWidth = 4; g.strokeStyle = ["#2ecc71", "#f1c40f", "#e74c3c"][i % 3];
      g.beginPath(); g.moveTo(0, 96); g.lineTo(256, 96); g.stroke();
    }
    return c.toDataURL("image/png");
  }
  var line = [], x;
  for (x = 330; x <= 980; x += 10) line.push(x, 690);
  for (var y = 690; y >= 330; y -= 10) line.push(980, y);
  function status() {
    var s = q.state || "ok";
    if (s !== "ok") return { state: s, err: q.err || null };
    if (q.mode === "rest") {
      var rest = { kind: q.kind || "next" };
      if (q.at) rest.at = +q.at;
      if (rest.kind === "next") { rest.tomorrow = q.tomorrow !== "0"; rest.day = 0; }
      return { state: "ok", err: null, name: "My commute", mode: "rest", rest: rest };
    }
    var late = +(q.late || 0), mode = q.mode || "work", how = q.how || "car";
    if (how !== "car") { q.delay = "0"; q.why = "0"; q.level = "clear"; q.min = q.min || (how === "bike" ? "62" : "222"); }
    var r = { state: "ok", err: q.err || null, name: "My commute", mode: mode, how: how, min: +(q.min || 28), normalMin: how === "car" ? 22 : +(q.min || 0), delayMin: +(q.delay || 6),
      meters: 17700, units: q.units || "mi", clock: q.clock || "12", level: q.level || "slow", updated: 432, arrive: 460,
      why: q.why === "0" ? [] : [{ kind: "accident", min: 9, atMeters: 9980 }, { kind: "rush", min: 4, atMeters: 2250 }, { kind: "roadworks", min: 1, atMeters: 15770 }],
      map: { g: "13.1.2." + NX + "." + NY, w: NX * 256, h: NY * 256, nx: NX, ny: NY, rv: 1, mv: "m1", tv: how === "car" ? "t1" : null, home: [330, 690], work: [980, 330], line: line } };
    if (mode === "work" && q.leave !== "0") { r.leaveBy = 477; r.arriveBy = 510; r.late = late; r.leaveIn = late ? -late : +(q.leaveIn || 45); }
    return r;
  }
  function imgs(kind) { var a = []; for (var i = 0; i < NX * NY; i++) a.push(tile(kind, i)); return a; }
  window.Skypane = {
    options: { trip: "aaaa0001", view: q.view || "map", mapLook: q.look || "day", routeColor: "#3b82f6" },
    t: function (k, v) { var s = WORDS[k] || k; for (var n in (v || {})) s = s.split("{" + n + "}").join(String(v[n])); return s; },
    get: function (route, query) {
      calls.push(route);
      return new Promise(function (ok) {
        setTimeout(function () {
          if (route === "status") ok(status());
          else if (route === "map") ok({ v: "m1", imgs: imgs("map") });
          else ok({ v: "t1", imgs: imgs("traffic") });
        }, 30);
      });
    },
    post: function (route, body) { calls.push(route + ":" + (body && body.command)); return Promise.resolve({ ok: true, result: "soon" }); },
    on: function (ev, fn) { if (ev === "size") window.addEventListener("resize", function () { fn({ w: innerWidth, h: innerHeight }); }); }
  };
})();
