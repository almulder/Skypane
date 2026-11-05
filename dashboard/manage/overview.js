// Skypane Manager — the Overview (v2.3.1; the design notes): the house at a
// glance — a greeting, the health of the four parts (hub, broker, camera video, panels), four tiles (panels online,
// alerts waiting, lights on, things to check), the alerts waiting on the panels (the admin may Acknowledge them — levels
// 4–5 with the panel PIN, the same check and lock-outs as a panel: the decision 1), what needs a look (with a
// link to the device or the panel), the recent activity (the health log for now) and quick links.
// GET /api/manage/overview (service/overview.py) every 20 s while the page is on screen; a server without it (older,
// or the demo before it has one) gets the same page from /api/manage/health, without alerts and devices.
// PATCH /api/manage/alerts {action: "ack", id | all: true, pin?} → 403 pin-required / wrong-pin, 423 locked (lockedFor:
// the pad counts it down), 503 no-broker, 200 {acked}.
// Built with DOM calls + textContent only: names from the hub and the panels are never parsed as HTML.
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el } = M, ic = K.icon;
  const POLL = 20000;
  const LEVEL = { 5: K.t("overview.level.lifeSafety"), 4: K.t("overview.level.damage"), 3: K.t("overview.level.actionNeeded"), 2: K.t("overview.level.finished"),
    1: K.t("overview.level.reminder") };
  const PARTS = [["hub", K.t("health.part.hub"), "server"], ["broker", K.t("health.part.broker"), "broker"], ["cameras", K.t("health.card.cameras"), "camera"],
    ["panels", K.t("overview.shared.aboutpanels"), "tablet"]];
  let O = null, from = "", down = false, timer = null, last = "", busy = false;

  // ---------- words ----------
  const ago = (t) => K.ago(t, "mid");   // (kit.js: one "time ago" for every page)
  const hm = (s) => new Date(s * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day = (s) => { const d = new Date(s * 1000), now = new Date();
    if (d.toDateString() === now.toDateString()) return hm(s);
    return `${d.toLocaleDateString([], { weekday: "short" })} ${hm(s)}`; };
  const greeting = () => { const h = new Date().getHours();
    return h < 5 ? K.t("overview.greeting.night") : h < 12 ? K.t("overview.greeting.morning") : h < 18 ? K.t("overview.greeting.afternoon") : K.t("overview.greeting.evening"); };
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ---------- without /api/manage/overview: the same page from the health answer (no alerts, no devices) ----------
  const kind = (id) => String(id || "").split(/[:.]/)[0];
  const partOf = (id) => { const k = kind(id); return k === "hubitat" ? "hub" : k === "mqtt" ? "broker" : /^(protect|go2rtc|camera|cameras|video)$/.test(k) ? "cameras" : k === "panel" ? "panels" : null; };
  function fromHealth(H) {
    const probs = H.problems || [], panels = H.panels || [], parts = {};
    for (const [k] of PARTS) {
      const ps = probs.filter((p) => partOf(p.id) === k), worst = Math.max(0, ...ps.map((p) => p.lvl || 3));
      if (k === "panels") parts[k] = !panels.length && !ps.length ? (M.can("panels") ? "unset" : "none") : worst >= 4 ? "bad" : ps.length || panels.some((p) => p.state !== "connected") ? "warn" : "ok";
      else parts[k] = !ps.length && H.parts && H.parts[k] === false ? "unset" : worst >= 4 ? "bad" : ps.length ? "warn" : "ok";
    }
    const set = Object.values(parts).filter((v) => v !== "unset" && v !== "none");
    const look = probs.map((p) => ({ sev: (p.lvl || 3) >= 4 ? "bad" : "warn", kind: kind(p.id) === "panel" ? "panel" : "problem", panel: kind(p.id) === "panel" ? p.id.slice(6) : null,
      title: p.title, detail: p.details || "", since: p.first }));
    return { health: { ok: !probs.length, problems: probs.length, worst: Math.max(0, ...probs.map((p) => p.lvl || 3)), checkedAt: H.checkedAt, parts,
      partsOk: set.filter((v) => v === "ok").length, partsSet: set.length },
    panels: { online: panels.filter((p) => p.state === "connected").length, total: panels.length },
    alerts: { heard: false, items: [], canAck: false }, look, lookTotal: look.length, devices: null,
    activity: (H.log || []).slice(0, 8).map((e) => ({ at: e.at, what: e.what, title: e.title, lvl: e.what === "resolved" ? 0 : e.lvl })) };
  }

  // ---------- asking the server ----------
  const onPage = () => S.route().page === "overview" && document.body.classList.contains("signed-in");
  // user: the page was opened (a real request — it keeps the session alive); the timer's asks are polls (Manage.poll:
  // they never do, and a sign-out shows the sign-in card at once)
  async function load(user) {
    clearTimeout(timer);
    if (!onPage()) return;
    if (document.visibilityState !== "hidden") timer = setTimeout(load, POLL);   // (a hidden tab asks again when it's back)
    const ask = async (path) => (user === true ? fetch(path, { cache: "no-store" }).then(async (r) => {
      if (r.status === 401) { M.signedOut(); return null; }
      return r;
    }) : M.poll(path));
    try {
      let r = await ask("/api/manage/overview");
      if (!r) return;   // (signed out: the sign-in card is up)
      if (r.ok) { O = await r.json(); from = "overview"; down = false; }
      else if (r.status >= 500) down = true;
      else {   // (404: a server without the Overview — the health monitor's answer instead)
        r = await ask("/api/manage/health");
        if (!r) return;
        const H = r.ok ? await r.json() : null;
        O = H && Array.isArray(H.problems) ? fromHealth(H) : null; from = O ? "health" : ""; down = r.status >= 500;
      }
    } catch { down = true; }
    if (M.alertsSeen && O && from === "overview") M.alertsSeen(O);   // (v2.8.0: the phone's Overview tab counts them)
    if (!onPage()) return;
    const now = JSON.stringify([O, from, down]);
    if (now !== last) draw();
    else for (const t of M.$main.querySelectorAll("[data-ago]")) t.textContent = K.t("integrations.side.checkedAgo", { ago: ago(+t.dataset.ago) });
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && onPage()) load(); });

  // the live part (alerts, device counts) is old when the broker isn't connected or the bridge said it stopped
  const stale = () => (from !== "overview" ? "" : O.broker === false ? "broker" : O.broker && O.bridge === "offline" ? "bridge" : "");
  const staleWhy = () => (stale() === "broker" ? K.t("overview.stale.broker") : K.t("overview.stale.bridge"));
  const heardAt = () => Math.max(0, ...Object.values(O.heard || {}).filter((x) => typeof x === "number"));

  // ---------- the page ----------
  function draw() {
    last = JSON.stringify([O, from, down]);
    if (S.isPhone()) return drawPhone();   // (v2.8.0: the phone's own screen, below)
    const me = M.me() || {};
    const date = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
    const head = el("div.ph", {}, el("div", {}, el("h1", {}, K.t("overview.greet", { greeting: greeting(), name: me.user || "" })),
      el("p", {}, K.t("overview.intro", { date }))),
    el("span.sp"), el("div.acts", {},
      el("button.btn", { type: "button", onclick: () => M.go("health") }, ic("activity", 16), K.t("health.title")),
      S.allowed("panels") && !S.isPhone() ? el("button.btn.pri", { type: "button", onclick: () => M.go("panels") }, ic("layout", 16), K.t("overview.links.editLayout")) : null));   // (a phone: layouts are edited on a computer)
    if (!O) {
      M.swap(M.$main, el("div.ov-page", {}, head, el("div.card.ov-empty", {}, down
        ? [el("span.ei.bad", {}, ic("alert", 22)), el("h3", {}, K.t("health.page.downTitle")), el("p", {}, K.t("overview.retry"))]
        : [el("span.ei", {}, ic("clock", 22)), el("h3", {}, K.t("overview.loading")), el("p", {}, K.t("overview.oneMoment"))])));
      return;
    }
    const kids = [head];
    if (down) kids.push(el("p.ov-note.bad", {}, ic("alert", 15), K.t("overview.note.down")));
    if (from === "health") kids.push(el("p.ov-note", {}, ic("help", 15), K.t("overview.note.older")));
    const st = stale(), at = heardAt();
    if (st) kids.push(el("p.ov-note.bad", {}, ic("alert", 15), at ? K.t("overview.stale.noteHeard", { why: staleWhy(), when: day(at) }) : K.t("overview.stale.noteNotLive", { why: staleWhy() })));
    if (UP && hasUp() && (!UP.seen || upOpen)) kids.push(upgradeCard());   // (v3.0.4: the admin's "What changed", once)
    kids.push(healthCard(), tiles(),
      el("div.ovg", {}, el("div", {}, lookCard(), activityCard()), el("div", {}, alertsCard(), M.houseCard ? M.houseCard(false) : null, linksCard())));   // (v2.9.3: Mode & alarm)
    M.swap(M.$main, el("div.ov-page", {}, kids));
  }

  // (one whole sentence per count — each can be translated as it is; never a list glued together with "and")
  const NEED_ONE = { hub: K.t("overview.need.hub"), broker: K.t("overview.need.broker"), cameras: K.t("overview.need.cameras"), panels: K.t("overview.need.panels") };
  const ONLINE = (on, all) => K.t("overview.online", { on, n: all });
  // short: the heading's sentence alone; else with how many panels are online
  const needWords = (h, short) => {
    const ns = PARTS.filter(([k]) => h.parts[k] === "warn" || h.parts[k] === "bad");
    const s = ns.length === 1 ? NEED_ONE[ns[0][0]] : ns.length === 2 ? K.t("overview.need.two", { a: ns[0][1], b: ns[1][1] }) : K.t("overview.need.many", { n: ns.length });
    return !short && ns.some(([k]) => k === "panels") && O.panels && O.panels.total ? K.t("overview.need.withOnline", { need: s, online: ONLINE(O.panels.online, O.panels.total) }) : s;
  };
  // the things to look at (Needs a look): one count everywhere, with what they are
  const lookCount = () => (O.lookTotal != null ? O.lookTotal : O.look.length);
  function lookParts() {
    const by = { panel: 0, device: 0, problem: 0 };
    for (const r of O.look) by[r.kind === "panel" ? "panel" : r.kind === "battery" || r.kind === "offline" ? "device" : "problem"]++;
    return [by.panel ? K.t("overview.look.panels", { n: by.panel }) : "", by.device ? K.t("overview.shared.roomDevices", { n: by.device }) : "",
      by.problem ? K.t("health.card.problems", { n: by.problem }) : ""].filter(Boolean);
  }
  function thingsWords() {
    const parts = lookParts();
    return parts.length > 1 ? K.t("overview.thingsParts", { n: lookCount(), parts: parts.join(", ") }) : K.t("health.pop.toLook", { n: lookCount() });
  }
  // "All 3 working" (the parts set up)
  const allWorking = (n) => (n === 1 ? K.t("overview.allOfIt") : K.t("overview.allWorking", { n }));

  function healthCard() {
    const h = O.health, cls = h.worst >= 4 ? "bad" : h.problems ? "warn" : "";
    const word = { ok: K.t("integrations.pill.working"), warn: K.t("health.look.title"), bad: K.t("health.card.down"), unset: K.t("integrations.pill.notSetUp"), none: K.t("health.card.noneForYou") };
    const need = h.partsSet - h.partsOk;
    return el("section.card.ov-health" + (cls ? `.${cls}` : ""), {},
      el("div.ovh-sum", {}, el("span.si", {}, ic("activity", 20)), el("div", {},
        // (the parts that need a look by name — as the pill shows them; under it the same count as the "things" tile and
        // Needs a look; never "everything works" while anything needs a look)
        el("b", {}, !h.partsSet ? (lookCount() ? thingsWords() : K.t("overview.nothingYet")) : need ? needWords(h, true) : allWorking(h.partsSet)),
        el("small", {}, !h.partsSet ? K.t("overview.noneSetUp") : lookCount() ? thingsWords() : need ? needWords(h) : K.t("overview.allWorks")),
        h.checkedAt ? el("small.ago", { "data-ago": String(h.checkedAt) }, K.t("integrations.side.checkedAgo", { ago: ago(h.checkedAt) })) : null)),
      el("div.ovh-parts", {}, PARTS.map(([k, n, i]) => {
        const st = h.parts[k] || "unset";
        return el("button.ovh-part", { type: "button", onclick: () => M.go("health"), "data-tip": K.t("overview.partTip", { name: n, state: PART_WORD[st] }) }, ic(i, 16),
          el("span", {}, n), el("span.pill" + (st === "ok" ? "" : st === "unset" || st === "none" ? ".idle" : `.${st}`), {}, word[st]));
      })),
      el("button.btn.sm.ghost", { type: "button", onclick: () => M.go("health") }, K.t("health.pop.open"), ic("arrowR", 14)));
  }

  function tiles() {
    const a = O.alerts.items, d = O.devices, p = O.panels;
    const never = O.look.filter((r) => r.kind === "panel" && /never checked in/.test(r.title)).length;
    const tile = (cls, icon, big, unit, small, go) => el("button.ok4" + (cls ? `.${cls}` : ""), { type: "button", onclick: go, title: small },
      el("span.si", {}, ic(icon, 20)), el("div", {}, el("b", {}, big, unit ? el("span", {}, ` ${unit}`) : null), el("small", {}, small)));
    const worstA = Math.max(0, ...a.map((x) => x.level));
    const out = [
      tile(p.total && p.online < p.total ? "warn" : "", "tablet", String(p.online), K.t("overview.tile.ofTotal", { n: p.total }),
        p.total ? (never ? K.t("overview.tile.panelsOnlineNever", { n: never }) : K.t("overview.tile.panelsOnline")) : M.isAdmin() ? K.t("overview.tile.noPanels") : K.t("overview.tile.noPanelForYou"),
        () => M.go(S.allowed("panels") ? "panels" : "health")),
      tile(worstA >= 4 ? "bad" : a.length ? "warn" : O.alerts.heard && !stale() ? "" : "idle", "bell", String(a.length), K.t("overview.tile.alertsUnit", { n: a.length }),
        a.length ? K.t("overview.tile.waiting") : O.alerts.heard ? K.t("overview.tile.nothingWaiting") : from === "health" ? K.t("overview.tile.notAvailable") : K.t("overview.tile.notHeard"),
        () => { const c = M.$main.querySelector(".ov-alerts"); if (c) c.scrollIntoView({ block: "center", behavior: "smooth" }); })];
    if (d) {
      const extra = [K.t("overview.shared.roomDevices", { n: d.total }), d.open ? K.t("overview.tile.open", { n: d.open }) : "", d.unlocked ? K.t("overview.tile.unlocked", { n: d.unlocked }) : "",
        d.offline ? K.t("health.card.offline", { n: d.offline }) : ""].filter(Boolean);
      out.push(tile("acc", "bulb", d.heard ? String(d.lightsOn) : "—", K.t("overview.tile.lightsUnit", { n: d.lightsOn }),
        d.heard ? extra.join(" · ") : K.t("overview.tile.devicesNoLive", { n: d.total }), () => M.go(S.allowed("devices") ? "devices" : "overview")));
    }
    const n = O.lookTotal != null ? O.lookTotal : O.look.length;
    out.push(tile(O.look.some((r) => r.sev === "bad") ? "bad" : n ? "warn" : "", "alert", String(n), K.t("overview.tile.thingsUnit", { n }),
      n ? (lookParts().length > 1 ? lookParts().join(", ") : K.t("overview.tile.toCheck")) : K.t("overview.tile.nothingToCheck"), () => { const c = M.$main.querySelector(".ov-look"); if (c) c.scrollIntoView({ block: "center", behavior: "smooth" }); }));
    return el("div.ovk" + (out.length === 3 ? ".three" : ""), {}, out);
  }

  // a device's editor on the Devices page (once its list is in: the page loads it when it opens)
  async function openDevice(id) {
    if (!(await M.go("devices"))) return;
    for (let i = 0; i < 60 && !(M.devices() && M.devices().devices); i++) await new Promise((r) => setTimeout(r, 75));
    M.openDevice(id);
  }
  // what a "Needs a look" row opens: a device's editor, a panel, or the Health page
  function lookAction(r) {
    if (r.device != null && S.allowed("devices")) {
      return el("button.btn.sm", { type: "button", "aria-label": K.t("overview.look.viewLabel", { title: r.title }), onclick: () => openDevice(r.device) }, K.t("overview.look.view"));
    }
    if (r.panel && S.allowed("panels") && M.can(null, r.panel)) return el("button.btn.sm", { type: "button", "aria-label": K.t("health.look.openPanel", { title: r.title }), onclick: () => M.go(`panels/${r.panel}`) }, K.t("control.open"));
    if (r.kind === "problem") return el("button.btn.sm.ghost", { type: "button", "aria-label": K.t("overview.look.healthLabel", { title: r.title }), onclick: () => M.go("health") }, K.t("health.title"));
    return null;
  }
  const LOOK_ICON = { problem: "alert", panel: "tablet", battery: "battery", offline: "devices" };
  function lookRow(r) {
    return el("div.nl", {}, el("span.ni." + (r.sev === "bad" ? "bad" : "warn"), {}, ic(LOOK_ICON[r.kind] || "alert", 16)),
      el("div", {}, el("b", {}, r.title), el("small", {}, [r.detail, r.since ? K.t("health.card.since", { when: day(r.since) }) : ""].filter(Boolean).join(" · ") || " ")),
      lookAction(r));
  }
  function lookCard() {
    const n = O.lookTotal != null ? O.lookTotal : O.look.length;
    return el("section.card.flush.ov-look", {}, el("h3.ch", {}, ic("alert", 15), K.t("health.look.title"), el("small", {}, n ? K.t("health.look.count", { n }) : "")),
      O.look.length ? O.look.map(lookRow)
        : el("div.ov-empty.sm", {}, el("span.ei.ok", {}, ic("check", 20)), el("b", {}, K.t("health.look.nothing")), el("p", {}, K.t("overview.look.allClear"))),
      n > O.look.length ? el("p.gf.pad", {}, K.t("overview.look.more", { n: n - O.look.length })) : null);
  }

  function activityCard() {
    const list = O.activity || [];
    return el("section.card.flush", {}, el("h3.ch", {}, ic("clock", 15), K.t("overview.act.title"),
      el("small", {}, el("button.lnk", { type: "button", onclick: () => M.go("health") }, K.t("overview.act.seeAll")))),
    list.length ? el("div.tl", {}, list.map((e) => el("div.tli", {}, el("span.t", {}, day(e.at)),
      el("span.d." + (e.what === "resolved" ? "ok" : e.lvl >= 4 ? "bad" : e.lvl >= 3 ? "warn" : "acc")),
      el("span", {}, e.what === "resolved" ? K.t("timeline.fixed", { title: e.title }) : e.title,
        el("small", {}, e.what === "resolved" ? K.t("overview.act.resolved") : e.lvl >= 4 ? K.t("overview.act.alert") : e.lvl >= 3 ? K.t("overview.act.warning") : K.t("overview.act.notice"))))))
      : el("div.ov-empty.sm", {}, el("span.ei", {}, ic("clock", 20)), el("b", {}, K.t("overview.act.nothing")), el("p", {}, K.t("overview.act.nothingText"))));
  }

  function alertsCard() {
    const A = O.alerts, items = A.items;
    const canAck = A.canAck && !M.isDemo();   // (the demo's pretend house has no alerts path to tell)
    const off = !!stale(), offWhy = staleWhy();
    const where = (a) => (a.panels.includes("all") ? K.t("overview.alert.allPanels") : a.panels.join(", "));
    const rows = items.map((a) => el("div.nl", {}, el("span.alv.l" + a.level, { title: LEVEL[a.level] || "" }, K.t("overview.alert.levelTag", { level: a.level })),
      el("div", {}, el("b", {}, a.title || a.text, a.kind === "weather" ? el("span.pill.ov-wx", {}, K.t("overview.alert.weatherTag")) : null), el("small", {}, [a.title ? a.text : "", K.t("overview.alert.on", { where: where(a) }), a.since ? ago(a.since) : "", a.count > 1 ? `×${a.count}` : ""].filter(Boolean).join(" · "))),
      canAck ? el("button.btn.sm", { type: "button", disabled: off, title: off ? offWhy : null, onclick: (e) => ack({ id: a.id }, [a], e.currentTarget) },
        a.level >= 4 && A.pinSet ? ic("lock", 14) : null, K.t("overview.ack.button")) : null));
    return el("section.card.flush.ov-alerts", {}, el("h3.ch", {}, ic("bell", 15), K.t("overview.alerts.title"), el("small", {}, items.length ? K.t("overview.alerts.onPanels") : "")),
      rows.length ? rows : el("div.ov-empty.sm", {}, el("span.ei" + (A.heard ? ".ok" : ""), {}, ic(A.heard ? "check" : "bell", 20)),
        el("b", {}, A.heard ? K.t("overview.alerts.none") : K.t("overview.alerts.noWord")),
        el("p", {}, A.heard ? K.t("overview.alerts.clear") : from === "health" ? K.t("overview.alerts.olderServer")
          : O.broker === null ? K.t("overview.alerts.setUp") : K.t("overview.alerts.bridgeSends"))),
      canAck && items.length > 1 ? el("div.nl.end", {}, el("small", {}, K.t("overview.alerts.hubitatHears")),
        el("button.btn.sm.ghost", { type: "button", disabled: off, title: off ? offWhy : null, onclick: (e) => ack({ all: true }, items, e.currentTarget) }, K.t("overview.ack.all"))) : null);
  }

  function linksCard() {
    const L = [];
    if (S.allowed("panels") && !S.isPhone()) L.push(["layout", K.t("overview.links.editLayout"), () => M.go("panels")]);
    if (M.isAdmin() && S.allowed("panels")) L.push(["plus", K.t("overview.links.addPanel"), async () => { if (await M.go("panels")) M.focusAddPanel = true; }]);
    if (S.allowed("devices")) L.push(["devices", K.t("overview.shared.aboutdevices"), () => M.go("devices")]);
    if (S.allowed("cameras")) L.push(["camera", K.t("overview.shared.aboutcameras"), () => M.go("cameras")]);
    if (S.allowed("backgrounds")) L.push(["upload", K.t("overview.links.background"), () => M.go("backgrounds")]);
    if (S.allowed("guest")) L.push(["wifi", K.t("overview.links.guest"), () => M.go("guest")]);
    if (S.allowed("accounts")) L.push(["users", K.t("overview.links.addLogin"), () => M.go("accounts")]);
    if (M.isAdmin() && UP && hasUp()) L.push(["sparkles", K.t("upgrade.link", { v: UP.version }), () => { upOpen = true; draw(); M.$main.scrollTo && M.$main.scrollTo(0, 0); }]);
    L.push(["help", K.t("overview.links.help"), () => M.help && M.help("overview")]);
    return el("section.card.flush", {}, el("h3.ch", {}, ic("zap", 15), K.t("overview.links.title")),
      el("div.qlinks", {}, L.map(([i, t, f]) => el("button.ql", { type: "button", onclick: f, title: t }, ic(i, 16), el("span", {}, t)))));
  }

  // ---------- the phone (v2.8.0; the design notes, mockup A screen 1): a greeting, the status ring, three tiles,
  // the alerts waiting (a tap: a sheet with Acknowledge — the same route, PIN and lock-outs as above), Needs a look,
  // the last five things that happened. The same data, the same 20 s reads. ----------
  const SVGNS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };
  const PART_WORD = { ok: K.t("overview.partWord.ok"), warn: K.t("overview.partWord.warn"), bad: K.t("health.spark.bad"), unset: K.t("overview.partWord.unset"), none: K.t("overview.partWord.none") };
  function ring(on, total, label) {
    const r = 26, c = 2 * Math.PI * r, f = total ? on / total : 0;
    const s = svgEl("svg", { viewBox: "0 0 64 64", class: "ovp-ring", role: "img", "aria-label": label });
    s.append(svgEl("circle", { cx: 32, cy: 32, r, fill: "none", "stroke-width": 6, class: "bg" }),
      svgEl("circle", { cx: 32, cy: 32, r, fill: "none", "stroke-width": 6, class: "fg", "stroke-linecap": "round", "stroke-dasharray": c.toFixed(1),
        "stroke-dashoffset": (c * (1 - f)).toFixed(1), transform: "rotate(-90 32 32)" }));
    const t = svgEl("text", { x: 32, y: 37, "text-anchor": "middle", "aria-hidden": "true" });
    t.textContent = total ? `${on}/${total}` : "—";
    s.append(t);
    return s;
  }
  let recent = null, recentAt = 0;
  async function loadRecent() {
    if (recent && Date.now() - recentAt < 15000) return recent;
    try {
      const r = await M.poll("/api/manage/activity?limit=5");   // i18n-ok (a URL)
      if (r && r.ok) { const j = await r.json(); recent = Array.isArray(j.events) ? j.events : []; recentAt = Date.now(); }
    } catch {}
    if (!recent) recent = [];
    return recent;
  }
  M.onReset(() => { recent = null; recentAt = 0; });
  function drawPhone() {
    const me = M.me() || {};
    const date = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
    const head = el("div.ph", {}, el("div", {}, el("h1", {}, K.t("overview.greet", { greeting: greeting(), name: me.user || "" })), el("p", {}, date)));
    if (!O) {
      return M.swap(M.$main, el("div.ov-page", {}, head, down
        ? el("div.card.ov-empty", {}, el("span.ei.bad", {}, ic("alert", 22)), el("h3", {}, K.t("health.page.downTitle")), el("p", {}, K.t("overview.retry")))
        : el("div.p-skel", { "aria-label": K.t("overview.loadingLabel"), role: "status" }, el("i"), el("i"), el("i"), el("i"))));
    }
    const kids = [head];
    if (down) kids.push(el("p.ov-note.bad", {}, ic("alert", 15), K.t("overview.note.downPhone")));
    if (from === "health") kids.push(el("p.ov-note", {}, ic("help", 15), K.t("overview.note.olderPhone")));
    const stl = stale(), at = heardAt();
    if (stl) kids.push(el("p.ov-note.bad", {}, ic("alert", 15), at ? K.t("overview.stale.phoneHeard", { why: staleWhy(), when: day(at) }) : K.t("overview.stale.phoneNotLive", { why: staleWhy() })));
    // the status card: the panels online as a ring, the worst thing in one line, the four parts
    const h = O.health, p = O.panels, cls = h.worst >= 4 ? "bad" : h.problems || (p.total && p.online < p.total) ? "warn" : "";
    const need = h.partsSet - h.partsOk;
    // (the same whole sentences as the computer's health card: what needs a look by kind, the count under it)
    const line = !h.partsSet ? (lookCount() ? thingsWords() : K.t("overview.nothingYet")) : need ? needWords(h, true) : allWorking(h.partsSet);
    const detail = !h.partsSet ? K.t("overview.noneSetUp") : lookCount() ? thingsWords() : need ? needWords(h) : K.t("overview.allWorks");
    const sub = !p.total ? (M.isAdmin() ? K.t("overview.phone.noPanelsAdmin") : K.t("overview.phone.noPanelForYou")) : K.t("overview.phone.online", { on: p.online, n: p.total });
    kids.push(el("button.card.ovp-status" + (cls ? `.${cls}` : ""), { type: "button", onclick: () => M.go("health"), "aria-label": K.t("overview.phone.statusLabel", { line, detail, sub }) },
      ring(p.online, p.total, sub),
      el("div.ovp-st", { "aria-hidden": "true" }, el("b", {}, line), el("small", {}, detail), p.total ? null : el("small", {}, sub),
        el("div.ovp-parts", {}, PARTS.map(([k, n]) => { const st = h.parts[k] || "unset";
          return el("span", { title: K.t("overview.partTip", { name: n, state: PART_WORD[st] }) }, el("i.hd" + (st === "ok" ? "" : st === "unset" || st === "none" ? ".idle" : `.${st}`)), n); }))),
      ic("chevR", 18)));
    // three tiles: panels online, alerts waiting, lights on
    const a = O.alerts.items, d = O.devices, worstA = Math.max(0, ...a.map((x) => x.level));
    const kpi = (c, big, small, go, label) => el("button.card.ovp-kpi" + (c ? `.${c}` : ""), { type: "button", onclick: go, "aria-label": label },
      el("b", { "aria-hidden": "true" }, big), el("small", { "aria-hidden": "true" }, small));
    // (the tile's words under the number shown big above them)
    kids.push(el("div.ovp-kpis", {},
      kpi(p.total && p.online < p.total ? "warn" : "", p.total ? `${p.online}/${p.total}` : "—", K.t("overview.tile.panelsOnline"), () => M.go(S.allowed("panels") ? "panels" : "health"), sub),
      kpi(worstA >= 4 ? "bad" : a.length ? "warn" : "", String(a.length), K.t("overview.kpi.alerts", { n: a.length }),
        () => { const c = M.$main.querySelector(".ovp-alerts"); if (c) c.scrollIntoView({ block: "start", behavior: "smooth" }); },
        a.length ? K.t("overview.kpi.alertsLabel", { n: a.length }) : K.t("overview.alerts.none")),
      kpi("", d && d.heard ? String(d.lightsOn) : "—", d && d.heard ? K.t("overview.kpi.lights", { n: d.lightsOn }) : K.t("overview.kpi.lightsOn"),
        () => { if (S.allowed("devices")) { M.devicesPhoneChip = "lit"; M.go("devices"); } },
        d && d.heard ? K.t("overview.kpi.lightsLabel", { n: d.lightsOn }) : K.t("overview.kpi.lightsNotHeard"))));
    // the alerts waiting
    const A = O.alerts, canAck = A.canAck && !M.isDemo(), off = !!stale();
    const where = (x) => (x.panels.includes("all") ? K.t("overview.alert.allPanels") : x.panels.join(", "));
    kids.push(el("h2.ovp-h.ovp-alerts", {}, K.t("overview.alerts.title"), a.length ? el("span.r", {}, K.t("overview.alerts.count", { n: a.length })) : null));
    kids.push(el("div.ovp-list", {}, a.length ? a.map((x) => el("button.ovp-row", { type: "button", onclick: () => alertSheet(x) },
      el("span.alv.l" + x.level, { title: LEVEL[x.level] || "" }, K.t("overview.alert.levelTag", { level: x.level })),
      el("span.t", {}, el("b", {}, x.title || x.text, x.kind === "weather" ? el("span.pill.ov-wx", {}, K.t("overview.alert.weatherTag")) : null), el("small", {}, [K.t("overview.alert.on", { where: where(x) }), x.since ? ago(x.since) : ""].filter(Boolean).join(" · "))), ic("chevR", 16)))
      : el("p.ovp-empty", {}, A.heard ? K.t("overview.alerts.nonePhone") : K.t("overview.alerts.noWordPhone")),
    canAck && a.length > 1 ? el("div.ovp-end", {}, el("button.btn.sm", { type: "button", disabled: off, onclick: () => ackAllSheet(a) }, K.t("overview.ack.all"))) : null));
    if (M.houseCard) { const hc = M.houseCard(true); if (hc) kids.push(hc); }   // (v2.9.3: Mode & alarm)
    // what needs a look, then what happened
    kids.push(lookCard());
    // (the Timeline's own source: the activity log merged with the health log — gate 2; read in the background)
    const actBox = el("div.ovp-list");
    const drawActs = () => {
      const health = (O.activity || []).map((e) => ({ at: e.at, cls: e.what === "resolved" ? "ok" : e.lvl >= 4 ? "bad" : e.lvl >= 3 ? "warn" : "acc",
        say: e.what === "resolved" ? K.t("timeline.fixed", { title: e.title }) : e.title }));
      const log = (recent || []).map((e) => ({ at: e.at, cls: /wrong|locked|unknown/.test(e.kind) ? "warn" : "acc", say: M.activitySay ? M.activitySay(e) : e.kind }));
      const acts = [...health, ...log].sort((a2, b2) => b2.at - a2.at).slice(0, 5);
      actBox.replaceChildren(...(acts.length ? acts.map((e) => el("div.ovp-row", {}, el("span.dot." + e.cls, { "aria-hidden": "true" }),
        el("span.t", {}, el("b", {}, e.say), el("small", {}, day(e.at))))) : [el("p.ovp-empty", {}, recent ? K.t("overview.act.nothingPhone") : K.t("common.loading"))]));
    };
    drawActs();
    loadRecent().then(() => { if (actBox.isConnected) drawActs(); });
    kids.push(el("h2.ovp-h", {}, K.t("overview.act.title"), el("span.r", {}, el("button.lnk", { type: "button", onclick: () => { S.savePrefs({ views: { health: "timeline" } }); M.go("health/timeline"); } }, K.t("overview.act.all")))),
      actBox);
    M.swap(M.$main, el("div.ov-page.ovp", {}, kids));
  }
  // one alert: its details, and Acknowledge (the admin; levels 4–5 then ask for the panel PIN — the pad below)
  function alertSheet(x) {
    const A = O.alerts, canAck = A.canAck && !M.isDemo(), off = !!stale();
    const where = x.panels.includes("all") ? K.t("overview.sheet.everyPanel") : x.panels.join(", ");
    const ackB = canAck ? el("button.btn.pri", { type: "button", disabled: off }, x.level >= 4 && A.pinSet ? ic("lock", 16) : null, K.t("overview.ack.button")) : null;
    const sh = K.sheet({ title: x.title || x.text, sub: K.t("overview.sheet.sub", { level: x.level, levelName: LEVEL[x.level] || "" }),
      body: [x.title && x.text ? el("p.ovp-text", {}, x.text) : null,
        el("div.ps-kv", {}, el("span", {}, K.t("overview.sheet.waitingOn")), el("b", {}, where),
          x.since ? el("span", {}, K.t("overview.sheet.since")) : null, x.since ? el("b", {}, `${K.when(x.since, "dayTime")} · ${ago(x.since)}`) : null,
          x.count > 1 ? el("span", {}, K.t("overview.sheet.times")) : null, x.count > 1 ? el("b", {}, String(x.count)) : null,
          x.kind === "weather" && x.sender ? el("span", {}, K.t("overview.sheet.issuedBy")) : null, x.kind === "weather" && x.sender ? el("b", {}, x.sender) : null),
        canAck && x.level >= 4 && A.pinSet ? el("p.ps-ro", {}, K.t("overview.sheet.needsPin")) : null,
        canAck && off ? el("p.ov-note.bad", {}, ic("alert", 15), K.t("overview.stale.sheet", { why: staleWhy() })) : null,
        canAck ? el("p.ovp-fine", {}, x.kind === "weather" ? K.t("overview.sheet.clearsWeather") : K.t("overview.sheet.clears"))
          : el("p.ps-ro", {}, K.t("overview.sheet.adminOnly"))].filter(Boolean),
      actions: [el("button.btn", { type: "button", onclick: () => sh.close() }, canAck ? K.t("control.cancel") : K.t("common.close")), ackB] });
    if (ackB) ackB.addEventListener("click", () => { sh.msg(""); sheetNow = sh; ack({ id: x.id }, [x], ackB); });
  }
  function ackAllSheet(items) {
    const top = items.reduce((m, y) => (y.level > m.level ? y : m), items[0]);
    const go = el("button.btn.pri", { type: "button" }, K.t("overview.ack.all"));
    const sh = K.sheet({ title: K.t("overview.ackAll.title", { n: items.length }),
      body: [el("p.ovp-text", {}, top.level >= 4 && O.alerts.pinSet ? K.t("overview.ackAll.textPin", { level: top.level }) : K.t("overview.ackAll.text"))],
      actions: [el("button.btn", { type: "button", onclick: () => sh.close() }, K.t("control.cancel")), go] });
    go.addEventListener("click", () => { sh.msg(""); sheetNow = sh; ack({ all: true }, items, go); });
  }

  // ---------- Acknowledge (the admin): levels 4–5 ask for the panel PIN — the server checks it ----------
  // (one at a time: a second Acknowledge pressed meanwhile waits its turn — its button says so; the button pressed keeps
  // the keyboard focus — aria-disabled, not disabled — so the PIN pad or the question gives it back after)
  const queue = [];
  let sheetNow = null;   // (v2.8.0: the phone's alert sheet waiting for its answer)
  async function ack(target, alerts, btn, pin, pad, confirm) {
    if (busy) { queue.push([target, alerts, btn, pin, pad, confirm]); if (btn) { btn.setAttribute("aria-disabled", "true"); btn.setAttribute("aria-busy", "true"); } return; }
    busy = true; if (btn) { btn.setAttribute("aria-disabled", "true"); btn.setAttribute("aria-busy", "true"); }
    let r;
    try { r = await M.api("/api/manage/alerts", { action: "ack", ...target, ...(pin != null ? { pin } : {}), ...(confirm ? { confirm: true } : {}) }); }
    catch (e) { r = { status: e && e.message === "login" ? -1 : 0 }; }
    if (r.status === -1) { busy = false; return; }   // (signed out: the sign-in card is up)
    // (v2.8.0, a phone: the alert's sheet stays open until the answer — it closes for the PIN pad or once done; a failure
    // is said inside it, never behind it)
    const sh = sheetNow;
    const sheetGone = async () => { if (sh && sheetNow === sh) { sheetNow = null; await sh.close(); } };
    busy = false; if (btn && btn.isConnected) { btn.removeAttribute("aria-disabled"); btn.removeAttribute("aria-busy"); }
    if (queue.length) setTimeout(() => { const n = queue.shift(); if (n) ack(...n); }, 0);
    if (r.status === 200) {
      await sheetGone();
      if (pad) pad.close();
      M.toast(r.left ? K.t("overview.ack.partial", { n: r.acked.length, left: r.left })
        : r.acked.length === 1 ? K.t("overview.ack.one") : K.t("overview.ack.many", { n: r.acked.length }), !!r.left);
      last = ""; load();
      return;
    }
    if (r.status === 403 && (r.error === "pin-required" || r.error === "wrong-pin") || r.status === 423) {
      await sheetGone();
      const p = pad || pinPad(target, alerts);
      p.show(r.error === "wrong-pin" ? "wrong" : r.status === 423 ? "locked" : "", r.lockedFor || 0);
      return;
    }
    if (r.status === 409 && r.error === "confirm-no-pin") {
      await sheetGone();
      const top = alerts.reduce((x, y) => (y.level > x.level ? y : x), alerts[0]);
      if (await confirmBox(K.t("overview.noPin.title"), K.t("overview.noPin.text", { title: top.title || top.text, level: top.level, levelName: LEVEL[top.level] }),
        K.t("overview.noPin.yes"))) ack(target, alerts, btn, null, null, true);
      return;
    }
    const why = r.status === 0 ? K.t("overview.ack.down")
      : r.status === 404 ? K.t("overview.ack.gone") : r.error === "no-broker" ? K.t("overview.ack.noBroker")
        : r.error === "no-bridge" ? K.t("overview.ack.noBridge")
          : r.status === 429 ? K.t("overview.ack.tooMany", { n: r.retryIn || 60 }) : r.error || K.t("overview.ack.failed");
    if (pad && r.status === 0) { pad.show("down", 0); return; }   // (the PIN pad stays: the reason in it)
    if (sh && sheetNow === sh && r.status !== 404) { sh.msg(why, true); last = ""; load(); return; }
    await sheetGone();
    if (pad) pad.close();
    if (r.status === 0) { M.toast(why, true); last = ""; load(); return; }
    M.toast(r.status === 404 ? K.t("overview.ack.gone") : r.error === "no-broker" ? K.t("overview.ack.noBroker")
      : r.error === "no-bridge" ? K.t("overview.ack.noBridge")
        : r.status === 429 ? K.t("overview.ack.tooMany", { n: r.retryIn || 60 }) : r.error || K.t("overview.ack.failed"), r.status !== 404);
    last = ""; load();
  }

  // a yes / no question in the Manager's look → true for yes
  function confirmBox(title, text, yes) {
    return new Promise((done) => {
      let close = null;
      const end = (v) => { if (close) close(); done(v); };
      const ok = el("button.btn.pri", { type: "button", onclick: () => end(true) }, yes);
      const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) end(false); } },
        el("div.modal.small.pinpad", { role: "alertdialog", "aria-labelledby": "cb-h", "aria-describedby": "cb-p" },
          el("h2#cb-h", {}, ic("alert", 18), title), el("p.muted#cb-p", {}, text),
          el("div.pp-acts", {}, el("button.btn.ghost", { type: "button", onclick: () => end(false) }, K.t("control.cancel")), ok)));
      close = M.dialog(shade, ok, () => end(false));
    });
  }

  // the PIN pad (the Manager's look; a panel's rules): digits by click or keyboard, Enter sends; locked: a countdown
  function pinPad(target, alerts) {
    const top = alerts.reduce((a, b) => (b.level > a.level ? b : a), alerts[0]);
    // (a phone: the keypad below types — no system keyboard over it: inputmode none, read-only)
    const input = el("input.pp-in", { type: "password", inputmode: S.isPhone() ? "none" : "numeric", readonly: S.isPhone() ? "" : null, autocomplete: "off", maxlength: "8", "aria-label": K.t("control.pinLabel"), spellcheck: "false" });
    const msg = el("p.pp-msg", { role: "status", "aria-live": "polite" });
    const go = el("button.btn.pri", { type: "button" }, K.t("overview.ack.button"));
    const keys = el("div.pp-keys", {}, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((k) =>
      el("button.pp-k" + (/\d/.test(k) ? "" : ".fn"), { type: "button", "aria-label": k === "C" ? K.t("control.clear") : k === "⌫" ? K.t("control.delete") : k, tabindex: "-1",
        onclick: () => { if (k === "C") input.value = ""; else if (k === "⌫") input.value = input.value.slice(0, -1); else if (input.value.length < 8) input.value += k; input.focus(); } }, k)));
    let tick = null, close = null;
    const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) pad.close(); } },
      el("div.modal.small.pinpad", { role: "dialog", "aria-labelledby": "pp-h" },
        el("h2#pp-h", {}, ic("lock", 18), K.t("control.pinTitle")),
        el("p.muted", {}, alerts.length > 1 ? K.t("overview.pin.many", { n: alerts.length, level: top.level, levelName: LEVEL[top.level] })
          : K.t("overview.pin.one", { title: top.title || top.text, level: top.level, levelName: LEVEL[top.level] })),
        input, keys, msg,
        el("div.pp-acts", {}, el("button.btn.ghost", { type: "button", onclick: () => pad.close() }, K.t("control.cancel")), go)));
    const send = () => { const v = input.value.trim(); if (!/^\d{4,8}$/.test(v)) { msg.className = "pp-msg bad"; msg.textContent = K.t("control.pinFormat"); input.focus(); return; }
      input.value = ""; ack(target, alerts, go, v, pad); };
    go.addEventListener("click", send);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } });
    input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, "").slice(0, 8); });
    const lock = (secs) => {
      clearInterval(tick);
      const until = Date.now() + secs * 1000;
      const step = () => {
        const left = Math.ceil((until - Date.now()) / 1000);
        const on = left > 0;
        input.disabled = go.disabled = on;
        for (const b of keys.children) b.disabled = on;
        if (on) { msg.className = "pp-msg bad"; msg.textContent = K.t("overview.pin.locked", { time: mmss(left) }); }   // i18n-ok (class names)
        else { clearInterval(tick); msg.className = "pp-msg"; msg.textContent = K.t("control.tryAgain"); if (!S.isPhone()) input.focus(); }
      };
      step(); tick = setInterval(step, 1000);
    };
    const pad = {
      show(why, lockedFor) {
        if (!close) close = M.dialog(shade, S.isPhone() ? go : input, () => pad.close());   // (a phone: the keypad, not the system keyboard over it)
        if (lockedFor > 0) lock(lockedFor);
        else { msg.className = "pp-msg" + (why ? " bad" : ""); msg.textContent = why === "wrong" ? K.t("control.wrongPin") : why === "down" ? K.t("overview.pin.down") : K.t("control.pinAsk"); if (!S.isPhone()) input.focus(); }
      },
      close() { clearInterval(tick); if (close) { close(); close = null; } },
    };
    return pad;
  }

  // ---------- the page in the shell ----------
  // ---------- (v3.0.4) "What changed in 3.0.4": what the one-time moves did to the saved layouts (GET / PATCH
  // /api/manage/upgrade — the record the moves wrote, read generically: panel → where → card → from → to → title; the
  // saved cards; what could not move). The panels show nothing new (only their version glows); the admin sees this here
  // once ("Got it": per admin, on the server), and again from Quick links → "What changed in 3.0.4". ----------
  let UP = null, upOpen = false;
  async function loadUpgrade() {
    if (!M.isAdmin()) { UP = null; return; }
    try { const r = await M.api("/api/manage/upgrade"); UP = r && r.version && Array.isArray(r.panels) ? r : null; } catch { UP = null; }
  }
  const hasUp = () => !!(UP.cards || (UP.saved || []).length || (UP.failed || []).length);
  // what an old card became when the record doesn't say ("to"): devices_card.py's and time_cards.py's moves
  const TO = { device: "devices", group: "devices", value: "devices", button: "devices", lock: "devices", fan: "devices", scenes: "devices",
    bins: "trash", countdown: "timers", timer: "timers" };   // i18n-ok (card types)
  const typeName = (t) => (t ? K.tOr(`builder.type.${t}.name`, t) : "");
  const moveWords = (r) => { const to = r.to || TO[r.from]; return to && to !== r.from ? K.t("upgrade.move", { from: typeName(r.from), to: typeName(to) }) : K.t("upgrade.updated", { from: typeName(r.from) }); };
  const whereWords = (w) => (w === "home" ? K.t("upgrade.where.home") : w === "rooms" ? K.t("upgrade.where.rooms")
    : /^room:/.test(w || "") ? K.t("upgrade.where.room", { room: w.slice(5) }) : w || "");
  function upgradeCard() {
    const row = (title, sub, cls) => el("div.up-row" + (cls || ""), {}, el("span.ri", {}, ic(cls ? "alert" : "cards", 15)), el("div", {}, el("b", {}, title), sub ? el("small", {}, sub) : null));
    const groups = UP.panels.map((p) => el("details.up-grp", { open: true }, el("summary", {}, ic("tablet", 15), el("b", {}, p.name), el("small.muted", {}, K.t("upgrade.cards", { n: p.rows.length })),
      el("span.sp"), p.gone ? el("span.pill.idle", {}, K.t("upgrade.gone")) : S.allowed("panels") && !S.isPhone()
        ? el("button.btn.sm", { type: "button", onclick: (e) => { e.preventDefault(); M.go(`panels/${p.id}/layout`); } }, ic("layout", 14), K.t("upgrade.openLayout")) : null),
    p.rows.map((r) => row(moveWords(r), [r.title || r.dev, r.pos ? K.tOr(`upgrade.pos.${r.pos}`, "") : "", whereWords(r.where)].filter(Boolean).join(" · ")))));
    if ((UP.saved || []).length) groups.push(el("details.up-grp", { open: true }, el("summary", {}, ic("cards", 15), el("b", {}, K.t("upgrade.saved")), el("small.muted", {}, K.t("upgrade.cards", { n: UP.saved.length }))),
      UP.saved.map((r) => row(moveWords(r), r.name || ""))));
    if ((UP.failed || []).length) groups.push(el("details.up-grp", { open: true }, el("summary", {}, ic("alert", 15), el("b", {}, K.t("upgrade.failed")), el("small.muted", {}, K.t("upgrade.failedHint"))),
      UP.failed.map((r) => row(r.panel ? K.t("upgrade.failedPanel", { name: r.name || r.panel }) : K.t("upgrade.failedSaved"), [whereWords(r.where), r.error].filter(Boolean).join(" · "), ".bad"))));
    const done = el("button.btn.pri", { type: "button", onclick: async () => {
      done.disabled = true;
      const r = await M.api("/api/manage/upgrade", { action: "seen" }).catch(() => null);
      done.disabled = false;
      if (!r || !r.ok) { M.toast((r && r.error) || K.t("upgrade.notSaved"), true); return; }
      UP.seen = true; upOpen = false; draw();
      M.toast(K.t("upgrade.dismissed", { v: UP.version }));
    } }, ic("check", 15), K.t("upgrade.gotIt"));
    const nf = (UP.failed || []).length;
    return el("section.card.flush.up-card", { "aria-label": K.t("upgrade.title", { v: UP.version }) },
      el("div.up-head", {}, el("span.ni", {}, ic("sparkles", 20)), el("div", {}, el("h2", {}, K.t("upgrade.title", { v: UP.version })), el("p", {}, K.t("upgrade.intro")),
        el("div.up-sum", {}, el("span.pill.acc", {}, K.t("upgrade.sumCards", { n: UP.cards })), UP.saved.length ? el("span.pill.idle", {}, K.t("upgrade.sumSaved", { n: UP.saved.length })) : null,
          nf ? el("span.pill.warn", {}, K.t("upgrade.sumFailed", { n: nf })) : null))),
      ...groups,
      el("div.up-foot", {}, el("small.muted", {}, K.t("upgrade.foot")), el("span.sp"), done));
  }
  M.onReset(() => { UP = null; upOpen = false; });

  M.renderOverview = () => { last = ""; draw(); load(true); loadUpgrade().then(() => { if (onPage() && O) draw(); }); };
  M.onReset(() => { O = null; from = ""; down = false; last = ""; clearTimeout(timer); });
  // (a test or the help may ask for it)
  M.overview = () => O;
})();
