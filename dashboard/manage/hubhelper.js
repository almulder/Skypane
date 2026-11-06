// Skypane Manager — (v3.0.7) the Skypane Helper as the hub link (admins only): Integrations → Hubitat → "Set up with
// the Skypane Helper" (#hubhelper: five guided steps with live checks, then Finished) and "Switch from Maker API"
// (#hubhelper/switch: what changes, the status side by side, a test on one light, then "Remove Maker API settings").
// mockups/prototypes/helper-setup-307.html and helper-switch-307.html. /api/manage/hublink (service/server.py
// _manage_hublink), /api/manage/helper (the link code). The hub's access token never reaches this page. No fallback:
// a Helper that stops answering is shown as a problem; nothing moves back to Maker API by itself.
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast } = M, ic = K.icon, t = K.t;
  const ago = (s) => K.ago(s, "secs");
  const MANIFEST = "/hubitat/packageManifest.json", IMPORT = "/hubitat/SkypaneHelper.groovy", DRIVER = "/hubitat/SkypaneNotifier.groovy";   // i18n-ok (addresses)
  const STEPS = [[1, "install"], [2, "link"], [3, "devices"], [4, "login"], [5, "rest"]];   // i18n-ok (keys)
  const CHECKS = ["drv", "dev", "evt", "cmd", "mk"];   // i18n-ok (keys: service/server.py _hub_checks)

  let D = null, sig = "", step = 0, tab = "hpm", finished = false, code = null, timer = null, view = "setup";
  let testRun = null;   // the Switch card's test: {phase, cmdMs, evtMs, value, error}
  let pick = null;      // the light picked for the test

  const on = () => S.route().page === "hubhelper";
  const base = () => (D && D.address) || location.origin;
  const H = () => (D && D.helper) || {};
  const linked = () => !!H().linked;
  const hubLink = () => !!(H().hubLink && H().hubLink.set);
  const given = () => (typeof H().given === "number" ? H().given : H().devices || 0);
  const checks = () => (D && D.checks) || {};
  const coreOk = () => ["drv", "dev", "evt", "cmd"].every((k) => (checks()[k] || {}).state === "ok");

  async function load() {
    const r = await api("/api/manage/hublink").catch(() => null);
    if (!r || r.status !== 200) return false;
    delete r.status;
    D = r;
    return true;
  }
  // (every 3 s while the page is open: the checks are live; drawn again only when something changed)
  function arm() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!on()) return;
      if (!document.hidden && await load()) {
        const now = JSON.stringify(D);
        if (now !== sig) { sig = now; draw(); }
      }
      arm();
    }, 3000);
  }

  const copyBtn = (text) => el("button.btn.sm", { type: "button", onclick: async () => toast(await M.copyText(text) ? t("hubhelper.copied", { text }) : t("integrations.notifier.copyFailed"), false) },
    ic("copy", 14), t("integrations.notifier.copy"));
  const copyRow = (label, value) => el("div.hh-cp", {}, el("div.hh-lbl", {}, label), el("div.hh-copyrow", {}, el("code.hh-field", { title: value }, value), copyBtn(value)));
  const okMsg = (text) => el("div.hh-ok", { role: "status" }, ic("check", 15), el("span", {}, text));
  const waitMsg = (text) => el("div.hh-wait", { role: "status" }, el("span.hh-spin", { "aria-hidden": "true" }), el("span", {}, text));
  const warnMsg = (...kids) => el("div.hh-warn", { role: "status" }, ...kids);
  const go = (n) => { finished = false; step = n; draw(); };
  const foot = (back, next, nextOk = true, nextLabel = null) => el("div.hh-foot", {},
    back ? el("button.btn", { type: "button", onclick: () => go(back) }, t("hubhelper.back")) : null, el("span.sp"),
    next ? el("button.btn.pri", { type: "button", disabled: !nextOk, onclick: () => go(next) }, nextLabel || t("hubhelper.next")) : null);
  // a picture of the Helper's page on the hub (what to look for there; nothing to press on it)
  const hubPic = (...kids) => el("div.hh-hub", { role: "img", "aria-label": t("hubhelper.hubPicture") },
    el("div.hh-hub-bar", {}, t("hubhelper.hubBar"), el("i", {}, t("hubhelper.hubBarWhere"))), el("div.hh-hub-bd", {}, ...kids, el("span.hh-hub-btn", {}, t("hubhelper.hubDone"))));

  // ---------- step 1: install ----------
  function stepInstall() {
    const tabs = [["hpm", t("hubhelper.tab.hpm")], ["hand", t("hubhelper.tab.hand")]];   // i18n-ok (keys)
    const tl = el("div.hh-seg", { role: "tablist", "aria-label": t("hubhelper.install.how") }, tabs.map(([k, n]) => el("button", { type: "button", role: "tab", "aria-selected": String(tab === k),
      onclick: () => { tab = k; draw(); } }, n)));
    const body = tab === "hpm"
      ? [el("div.hh-card2", {}, el("b", {}, t("hubhelper.hpm.title")), el("ol", {}, el("li", {}, t("hubhelper.hpm.one")), el("li", {}, t("hubhelper.hpm.two")), el("li", {}, t("hubhelper.hpm.three")))),
        copyRow(t("hubhelper.manifest"), base() + MANIFEST)]
      : [el("div.hh-card2", {}, el("b", {}, t("hubhelper.hand.title")), el("ol", {}, el("li", {}, t("hubhelper.hand.one")), el("li", {}, t("hubhelper.hand.two")),
        el("li", {}, el("b", {}, t("hubhelper.hand.three"))), el("li", {}, t("hubhelper.hand.four")))),
        copyRow(t("hubhelper.import"), base() + IMPORT)];
    return [el("h3", {}, t("hubhelper.install.title")), el("p", {}, t("hubhelper.install.lead")), tl, ...body,
      el("p.hh-hint", {}, t("hubhelper.install.same")), foot(null, 2, true, t("hubhelper.install.next"))];
  }

  // ---------- step 2: link ----------
  async function newCode() {
    const r = await api("/api/manage/helper", { action: "link" }).catch(() => null);
    if (!r || r.status !== 200 || !r.code) { toast(t("integrations.helper.failed"), true); return; }
    code = { code: r.code, until: Date.now() + (r.seconds || 600) * 1000 };
    draw();
  }
  function codeBoxes(c) {
    return el("span.hh-code", { "aria-label": c }, [...c.slice(0, 4)].map((x) => el("span", {}, x)), el("span.hh-dash", { "aria-hidden": "true" }, "–"), [...c.slice(4)].map((x) => el("span", {}, x)));   // i18n-ok (a dash)
  }
  function stepLink() {
    const h = H(), c = code && Date.now() < code.until ? code.code : null;
    const left = [copyRow(t("hubhelper.address"), base())];
    if (!linked()) {
      left.push(el("div", {}, el("div.hh-lbl", {}, t("hubhelper.code")), c
        ? el("div.hh-copyrow", {}, codeBoxes(c), copyBtn(`${c.slice(0, 4)}-${c.slice(4)}`), el("button.btn.sm", { type: "button", onclick: newCode }, t("hubhelper.newCode")),
          // (v3.0.5, tester; v3.0.7 here) Cancel: the code stops working now
          el("button.btn.sm.ghost", { type: "button", "aria-label": t("integrations.helper.cancelCodeLabel"), onclick: async () => {
            const r = await api("/api/manage/helper", { action: "cancelcode" }).catch(() => null);
            if (r && r.ok) { code = null; draw(); toast(t("integrations.helper.codeCancelled"), false); }
          } }, t("integrations.helper.cancelCode")))
        : el("div.hh-copyrow", {}, el("button.btn.pri", { type: "button", onclick: newCode }, t("hubhelper.makeCode")))));
      left.push(waitMsg(t("hubhelper.link.waiting")));
    } else {
      left.push(okMsg(t("hubhelper.link.linked")));
      if (h.oauth === false) left.push(problem(t("hubhelper.why.oauth"), t("hubhelper.fix.oauth")));
      else left.push(hubLink() ? okMsg(t("hubhelper.link.endpoint")) : waitMsg(t("hubhelper.link.endpointWait")));
    }
    const pic = hubPic(el("div.hh-hub-sec", {}, t("hubhelper.hubSecSkypane")), el("div.hh-hub-note", {}, t("hubhelper.address")), el("div.hh-hub-inp", {}, base()),
      el("div.hh-hub-note", {}, t("hubhelper.code")), el("div.hh-hub-inp", {}, linked() ? t("hubhelper.hubLinked") : c ? `${c.slice(0, 4)}-${c.slice(4)}` : "—"));   // i18n-ok (a dash)
    return [el("h3", {}, t("hubhelper.link.title")), el("p", {}, t("hubhelper.link.lead")), el("div.hh-two", {}, el("div.hh-col", {}, left), pic), foot(1, 3, linked())];
  }

  // ---------- step 3: devices ----------
  // (v3.0.7 review) the hub's devices the Helper wasn't given: a warning (step 3 and Finished), with "Don't show these"
  function missingWarn(withCheck) {
    const h = H(), miss = h.missing || [], n = given();
    const names = miss.slice(0, 3).map((m) => m.name).join(", ");
    return warnMsg(el("div.hh-warn-h", {}, ic("alert", 15), el("b", {}, t("hubhelper.new.title", { n: miss.length }))),
      el("p", {}, t(miss.length > 3 ? "hubhelper.new.textMore" : "hubhelper.new.text", { hub: h.hubCount, given: n, names, more: miss.length - 3 })),
      el("ol", {}, el("li", {}, t("hubhelper.new.one")), el("li", {}, t("hubhelper.new.two"))),
      el("div.hh-copyrow", {}, withCheck ? el("button.btn.pri", { type: "button", onclick: checkAgain }, ic("refresh", 14), t("hubhelper.checkAgain")) : null,
        el("button.btn", { type: "button", onclick: async () => {
          const r = await api("/api/manage/hublink", { action: "hidenew", ids: miss.map((m) => m.id) }).catch(() => null);
          if (r && r.ok) { toast(t("hubhelper.new.hidden"), false); if (await load()) { sig = JSON.stringify(D); draw(); } }
        } }, t("hubhelper.new.hide", { n: miss.length }))));
  }
  function stepDevices() {
    const h = H(), n = given(), hub = h.hubCount, miss = h.missing || [];
    const pic = hubPic(el("h4", {}, t("hubhelper.hubDevices")), el("div.hh-hub-sec", {}, t("hubhelper.hubSelect")),
      el("div.hh-hub-dd", {}, el("div.hh-hub-top", {}, n ? t("hubhelper.hubSelected", { n }) : t("hubhelper.hubClick")),
        el("div.hh-hub-opt.all", {}, el("span.hh-bx" + (n && !miss.length ? ".on" : ""), { "aria-hidden": "true" }), t("hubhelper.hubSelectAll"))));
    const right = [];
    // (v3.0.7 review) people pick (Select all is optional): done with at least one device; the hub's other devices are
    // a warning, with "Don't show these" here too
    if (!n) right.push(waitMsg(t("hubhelper.devices.none")));
    else if (typeof hub === "number" && !miss.length) right.push(okMsg(t("hubhelper.devices.all", { n: hub })));
    else right.push(okMsg(t("hubhelper.devices.given", { n })));
    if (n && miss.length) right.push(missingWarn(false));
    else if (typeof hub !== "number") right.push(el("p.hh-hint", {}, t("hubhelper.devices.noCount")));
    right.push(el("div.hh-card2.hh-small", {}, el("b", {}, t("hubhelper.devices.whyTitle")), " ", t("hubhelper.devices.why")));
    return [el("h3", {}, t("hubhelper.devices.title")), el("p", {}, t("hubhelper.devices.lead")), el("div.hh-two", {}, pic, el("div.hh-col", {}, right)), foot(2, 4, linked() && n > 0)];
  }

  // ---------- step 4: hub login ----------
  function stepLogin() {
    const h = H();
    if (h.secured === false && !h.login) {
      return [el("h3", {}, t("hubhelper.login.title")), okMsg(t("hubhelper.login.none")), foot(3, 5)];
    }
    const pic = hubPic(el("div.hh-hub-sec", {}, t("hubhelper.hubSecLogin")), el("div.hh-hub-note", {}, t("hubhelper.hubUser")), el("div.hh-hub-inp", {}, h.login ? "admin" : " "),   // i18n-ok (a picture)
      el("div.hh-hub-note", {}, t("hubhelper.hubPass")), el("div.hh-hub-inp", {}, h.login ? "••••••••••" : " "), el("div.hh-hub-note", {}, t("hubhelper.hubKept")));   // i18n-ok (a picture)
    return [el("h3", {}, t("hubhelper.login.title"), " ", el("span.hh-stay", {}, ic("lock", 13), t("hubhelper.login.stays"))), el("p", {}, t("hubhelper.login.lead")),
      el("div.hh-two", {}, pic, el("div.hh-col", {}, h.login ? okMsg(t("hubhelper.login.has")) : waitMsg(t("hubhelper.login.waiting")),
        el("div.hh-card2.hh-small", {}, t("hubhelper.login.only")), h.login ? null : el("p.hh-hint", {}, t("hubhelper.login.skip")))), foot(3, 5)];
  }

  // ---------- step 5: the live checks ----------
  // (v3.0.7 review) the bridge's reason code in this page's own words (strings/en.js hubhelper.reason.*), a general
  // line when there is none or it is new — never the bridge's English text
  const reasonWords = () => { const r = (D && D.bridge && D.bridge.reason) || ""; return /^[a-z]{1,20}$/.test(r) ? K.tOr(`hubhelper.reason.${r}`, t("hubhelper.why.down")) : t("hubhelper.why.down"); };   // i18n-ok (a pattern)
  function problem(why, fix, ...more) {
    return el("div.hh-prob", { role: "alert" }, el("b", {}, why), el("span", {}, fix), ...more);
  }
  function fixOf(id, c) {
    const why = c.why || "";
    if (id === "drv") {
      if (why === "login") return [t("hubhelper.why.login"), t("hubhelper.fix.login")];
      return [K.tOr ? K.tOr(`integrations.helper.err.${why}`, t("integrations.helper.err.endpoint")) : t("integrations.helper.err.endpoint"), t("hubhelper.fix.driver"), copyRow(t("hubhelper.driverAddress"), base() + DRIVER)];
    }
    if (id === "dev") {
      // (v3.0.7 review) the driver is there, the device couldn't be made: its network id taken, or the hub's own error
      if (why === "dni" || why === "child") {
        const detail = (H().result || {}).detail;
        return [t(`integrations.helper.err.${why}`), why === "dni" ? t("hubhelper.fix.dni") : t("hubhelper.fix.child"), detail ? el("code.hh-field", { title: detail }, detail) : null];
      }
      return [t("hubhelper.why.waitDriver"), t("hubhelper.fix.above")];
    }
    if (id === "cmd") {
      if (why === "oauth") return [t("hubhelper.why.oauth"), t("hubhelper.fix.oauth")];
      if (why === "nolink") return [t("hubhelper.why.nolink"), t("hubhelper.fix.nolink")];   // (v3.0.7 review)
      if (why === "maker") return [t("hubhelper.why.maker"), t("hubhelper.fix.maker"), el("button.btn.sm", { type: "button", onclick: () => M.go("hubhelper/switch") }, t("hubhelper.switch.open"))];
      // (v3.0.7) the hub refused the Helper's token (401 / 403): OAuth is off — its fix, not "is the hub on"
      if ((D && D.bridge && D.bridge.reason) === "token") return [reasonWords(), t("hubhelper.fix.oauth")];
      return [reasonWords(), t("hubhelper.fix.down")];
    }
    if (id === "evt") return [t("hubhelper.why.waitCmd"), t("hubhelper.fix.cmdFirst")];
    if (why === "switch") return [t("hubhelper.why.makerSet"), t("hubhelper.fix.makerSet"), el("button.btn.sm", { type: "button", onclick: () => M.go("hubhelper/switch") }, t("hubhelper.switch.open"))];
    return [t("hubhelper.why.waitAbove"), t("hubhelper.fix.aboveAll")];
  }
  async function checkAgain(e) {
    const b = e.currentTarget; b.disabled = true;
    const c = checks();
    if (["drv", "dev"].some((k) => (c[k] || {}).state === "bad")) await api("/api/manage/hublink", { action: "setup" }).catch(() => null);
    await api("/api/manage/health", { action: "check" }).catch(() => null);
    if (await load()) { sig = JSON.stringify(D); draw(); }
    toast(t("hubhelper.checking"), false);
  }
  function stepRest() {
    const c = checks();
    const anyBad = CHECKS.some((k) => (c[k] || {}).state === "bad");
    const rows = CHECKS.map((id) => {
      const x = c[id] || { state: "wait" }, st = x.state;
      const f = st === "bad" ? fixOf(id, x) : null;
      return el("div.hh-chk." + st, {}, el("span.hh-st", { "aria-hidden": "true" }, st === "ok" ? ic("check", 15) : st === "bad" ? ic("alert", 15) : el("span.hh-spin")),
        el("span", {}, el("b", {}, t(`hubhelper.chk.${id}`)), el("small", {}, f ? f[0] : t(`hubhelper.chk.${id}Sub`))),
        el("span.hh-tag." + st, {}, t(`hubhelper.state.${st}`)), f ? el("div.hh-fix", {}, el("b", {}, t("hubhelper.fix")), " ", f[1], ...f.slice(2)) : null);
    });
    return [el("h3", {}, t("hubhelper.rest.title")), el("p", {}, t("hubhelper.rest.lead")), el("div.hh-checks", { "aria-live": "polite" }, rows),
      el("div.hh-foot", {}, el("button.btn", { type: "button", onclick: () => go(4) }, t("hubhelper.back")),
        anyBad ? el("button.btn", { type: "button", onclick: checkAgain }, ic("refresh", 14), t("hubhelper.checkAgain")) : null, el("span.sp"),
        el("button.btn.pri", { type: "button", disabled: !coreOk(), onclick: () => { finished = true; draw(); } }, t("hubhelper.finish")))];
  }

  // ---------- finished ----------
  function finishedView() {
    const h = H(), miss = h.missing || [], n = given();
    const out = [el("h3", {}, t("hubhelper.done.title")), okMsg(D.maker && D.maker.set ? t("hubhelper.done.okMaker") : t("hubhelper.done.ok")),
      el("div.hh-sum", {}, [[String(n), t("hubhelper.done.devices")], [t("hubhelper.done.helper"), t("hubhelper.done.events")], [t("hubhelper.done.helper"), t("hubhelper.done.commands")],
        [t("hubhelper.done.linked"), t("hubhelper.done.notifier")]].map(([a, b]) => el("div.hh-card2", {}, el("b", {}, a), el("small", {}, b))))];
    if (miss.length) {
      out.push(missingWarn(true));
    } else if (typeof h.hubCount !== "number") {
      out.push(el("p.hh-hint", {}, t("hubhelper.devices.noCount")));
    }
    if (D.maker && D.maker.set) out.push(el("div.hh-copyrow", {}, el("button.btn", { type: "button", onclick: () => M.go("hubhelper/switch") }, t("hubhelper.switch.open"))));
    out.push(el("div.hh-foot", {}, el("span.hh-hint", {}, t("hubhelper.done.integrations")), el("span.sp"),
      el("button.btn", { type: "button", onclick: () => M.go("integrations") }, t("hubhelper.toIntegrations"))));
    return out;
  }

  // (v3.0.7 review) step 3 is done with at least one device (people pick; the rest is only a warning)
  const isDone = (n) => (n === 1 ? linked() || step > 1 : n === 2 ? linked() : n === 3 ? linked() && given() > 0
    : n === 4 ? linked() && (H().login || H().secured === false) : coreOk());
  function firstStep() {
    if (!linked()) return 1;
    if (!given()) return 3;
    return coreOk() ? 5 : 5;
  }
  function stepsNav() {
    const h = H();
    return el("nav.hh-steps", { "aria-label": t("hubhelper.steps") }, STEPS.map(([n, k]) => {
      const done = isDone(n), skip = n === 4 && h.secured === false && !h.login;
      return el("button" + (done ? ".done" : "") + (skip ? ".skip" : ""), { type: "button", "aria-current": !finished && step === n ? "step" : null, onclick: () => go(n) },
        el("span.hh-num", {}, done ? ic("check", 14) : String(n)), el("span", {}, t(`hubhelper.step.${k}`), el("small", {}, skip ? t("hubhelper.step.skipped") : t(`hubhelper.step.${k}Sub`))));
    }), el("button" + (finished ? ".done" : ""), { type: "button", "aria-current": finished ? "step" : null, disabled: !coreOk(), onclick: () => { finished = true; draw(); } },
      el("span.hh-num", {}, ic("check", 14)), el("span", {}, t("hubhelper.step.finished"), el("small", {}, finished ? t("hubhelper.step.finishedN", { n: given() }) : t("hubhelper.step.finishedSub")))));
  }

  // ---------- Switch from Maker API ----------
  const pill = (cls, text, spin) => el("span.hh-pill." + cls, {}, spin ? el("span.hh-spin") : el("span.hh-dot", { "aria-hidden": "true" }), text);
  function statusRows() {
    const via = D.via, b = D.bridge || {}, mk = D.maker && D.maker.set, helperIn = via === "helper", down = helperIn && b.link === "helper" && b.ok === false;
    const mkPill = () => (!mk ? pill("idle", t("hubhelper.sw.removed")) : helperIn ? pill("idle", t("hubhelper.sw.standby")) : pill("on", t("hubhelper.sw.inUse")));
    // (v3.0.7 review) switched but no hub link: a problem; not run by run_all: "Restart Skypane", never "Starting…" for ever
    const hpPill = () => (D.noHubLink ? pill("bad", t("hubhelper.sw.noHubLink")) : helperIn ? (down ? pill("bad", t("hubhelper.sw.notAnswering")) : b.link === "helper" ? pill("on", t("hubhelper.sw.inUse"))
      : D.supervised === false ? pill("bad", t("hubhelper.sw.restart")) : pill("idle", t("hubhelper.sw.starting"), true))
      : hubLink() ? pill("idle", t("hubhelper.sw.ready")) : pill("idle", t("hubhelper.sw.notLinked")));
    const row = (name, sm, mkTxt, hpTxt, mkP, hpP) => el("tr", {}, el("td", {}, el("b", {}, name), el("small", {}, sm)), el("td", {}, mkP, el("small", {}, mkTxt)), el("td", {}, hpP, el("small", {}, hpTxt)));
    const mkDev = !helperIn && b.link === "maker" && typeof b.devices === "number" ? t("hubhelper.sw.nDevices", { n: b.devices }) : "—";   // i18n-ok (a dash)
    return [row(t("hubhelper.sw.events"), t("hubhelper.sw.eventsSub"), t("hubhelper.sw.eventsMk"), t("hubhelper.sw.eventsHp"), mkPill(), hpPill()),
      row(t("hubhelper.sw.commands"), t("hubhelper.sw.commandsSub"), t("hubhelper.sw.commandsMk"), t("hubhelper.sw.commandsHp"), mkPill(), hpPill()),
      row(t("hubhelper.sw.devices"), t("hubhelper.sw.devicesSub"), t("hubhelper.sw.devicesMk"), t("hubhelper.sw.devicesHp"),
        mk ? pill(helperIn ? "idle" : "on", mkDev) : pill("idle", t("hubhelper.sw.removed")), pill(hubLink() ? "on" : "idle", t("hubhelper.sw.nGiven", { n: given() })))];
  }
  async function restartAfter(r) {
    if (r && r.restarting && M.waitRestart) return M.waitRestart(await M.bootId());
    if (await load()) { sig = JSON.stringify(D); draw(); }
  }
  async function useLink(to, e) {
    e.currentTarget.disabled = true;
    const before = await M.bootId();
    const r = await api("/api/manage/hublink", { action: "use", to }).catch(() => null);
    if (!r || !r.ok) { toast(t("hubhelper.sw.failed"), true); draw(); return; }
    testRun = null;
    toast(to === "helper" ? t("hubhelper.sw.switched") : t("hubhelper.sw.back"), false);
    if (r.restarting && M.waitRestart) return M.waitRestart(before);
    if (await load()) { sig = JSON.stringify(D); draw(); }
  }
  async function runTest() {
    const id = pick;
    testRun = { phase: 1 }; draw();
    const s = await api("/api/manage/hublink", { action: "teststart", device: id }).catch(() => null);
    if (!s || !s.ok) { testRun = { phase: 0, error: s && s.error === "not-helper" ? t("hubhelper.test.notHelper") : t("hubhelper.test.failed") }; draw(); return; }
    const want = s.value === "on" ? "off" : "on", t0 = performance.now();
    const c = await api(`/api/manage/devices/${encodeURIComponent(id)}/command`, { command: want }).catch(() => null);
    if (!c || !c.ok) { testRun = { phase: 0, error: t("hubhelper.test.cmdFailed", { why: (c && c.error) || "—" }) }; draw(); return; }   // i18n-ok (a dash)
    testRun = { phase: 2, cmdMs: Math.round(performance.now() - t0), value: want }; draw();
    for (let i = 0; i < 40 && on(); i++) {
      await new Promise((ok) => setTimeout(ok, 400));
      const k = await api("/api/manage/hublink", { action: "testcheck", device: id, want }).catch(() => null);
      if (k && k.ok) { testRun = { ...testRun, phase: 3, evtMs: k.ms }; await load(); sig = JSON.stringify(D); draw(); return; }
      if (k && k.status === 409) break;
    }
    testRun = { ...testRun, phase: 0, error: t("hubhelper.test.noEvent") }; draw();
  }
  function switchView() {
    const via = D.via, mk = D.maker && D.maker.set, b = D.bridge || {}, sw = via === "helper", lights = D.lights || [];
    const down = sw && b.link === "helper" && b.ok === false;
    if (pick == null || !lights.some((x) => x.id === pick)) pick = ((lights.find((x) => /office/i.test(x.name)) || lights[0]) || {}).id ?? null;
    const L = lights.find((x) => x.id === pick);
    const live = testRun && testRun.value;
    const tested = D.test && D.test.ok;
    // 1. what changes
    const chg = el("div.hh-chg", {}, el("span.hh-hd", {}, t("hubhelper.sw.now")), el("span"), el("span.hh-hd", {}, t("hubhelper.sw.after")),
      ...[["events", ""], ["commands", ""], ["token", ""], ["devices", ""], ["apps", ""]].flatMap(([k]) => [el("span.hh-a", {}, t(`hubhelper.chg.${k}A`, { n: (b.link === "maker" && b.devices) || "—" })), el("span.hh-ar", { "aria-hidden": "true" }, "→"),   // i18n-ok (an arrow)
        el("span.hh-b", {}, t(`hubhelper.chg.${k}B`, { n: given() }))]));
    const act = sw ? el("div.hh-row", {}, pill("on", t("hubhelper.sw.switchedPill")), el("span.sp"), mk ? el("button.btn", { type: "button", onclick: (e) => useLink("maker", e) }, t("hubhelper.sw.useMaker")) : null)
      : el("div.hh-row", {}, el("button.btn.pri", { type: "button", disabled: !hubLink() || !linked(), onclick: (e) => useLink("helper", e) }, t("hubhelper.sw.go")),
        el("span.hh-hint", {}, hubLink() ? t("hubhelper.sw.goHint") : t("hubhelper.sw.goFirst")));
    const c1 = el("section.card.hh-pnl", {}, el("h3", {}, el("span.hh-sn" + (sw ? ".done" : ""), {}, sw ? ic("check", 14) : "1"), t("hubhelper.sw.title")), el("p", {}, t("hubhelper.sw.lead")), chg, act);
    // 2. side by side
    const c2 = el("section.card.hh-pnl", {}, el("h3", {}, t("hubhelper.sw.side")), el("div.hh-tablewrap", {}, el("table.hh-table", {}, el("thead", {}, el("tr", {}, el("th", { scope: "col" }, el("span.sr-hide", {}, t("hubhelper.sw.part"))),
      el("th", { scope: "col" }, t("hubhelper.sw.maker")), el("th", { scope: "col" }, t("hubhelper.sw.helper")))), el("tbody", {}, statusRows()))),
    sw && b.link === "helper" && b.readAt && !down ? el("p.hh-hint", {}, t("hubhelper.sw.lastRead", { when: ago(b.readAt) })) : null);
    // 3. the test
    const sel = el("select", { "aria-label": t("hubhelper.test.pick"), disabled: !lights.length || (testRun && testRun.phase > 0 && testRun.phase < 3), onchange: (e) => { pick = Number(e.target.value); testRun = null; draw(); } },
      lights.map((x) => el("option", { value: String(x.id), selected: x.id === pick }, x.room ? t("hubhelper.test.option", { name: x.name, room: x.room }) : x.name)));
    const busy = testRun && (testRun.phase === 1 || testRun.phase === 2);
    const tl = !testRun ? el("div.hh-tl", {}, el("div.hh-wc", {}, sw ? (lights.length ? t("hubhelper.test.press") : t("hubhelper.test.noLights")) : t("hubhelper.test.first")))
      : el("div.hh-tl", { "aria-live": "polite" },
        testRun.phase >= 2 ? el("div.hh-okc", {}, ic("check", 14), t("hubhelper.test.sent"), el("span.hh-ms", {}, t("hubhelper.test.ms", { ms: testRun.cmdMs }))) : testRun.phase === 1 ? el("div", {}, el("span.hh-spin"), t("hubhelper.test.sending")) : null,
        testRun.phase >= 2 ? el("div" + (testRun.phase === 3 ? ".hh-okc" : ""), {}, testRun.phase === 3 ? ic("check", 14) : el("span.hh-spin"), t("hubhelper.test.back", { value: testRun.value }),
          el("span.hh-ms", {}, testRun.phase === 3 ? t("hubhelper.test.ms", { ms: testRun.evtMs }) : "")) : null,
        testRun.phase === 3 ? el("div.hh-okc", {}, ic("check", 14), el("b", {}, t("hubhelper.test.works")), " ", t("hubhelper.test.didIt")) : null,
        testRun.error ? el("div.hh-badc", { role: "alert" }, ic("alert", 14), testRun.error) : null);
    const c3 = el("section.card.hh-pnl", {}, el("h3", {}, el("span.hh-sn" + (tested ? ".done" : ""), {}, tested ? ic("check", 14) : "2"), t("hubhelper.test.title")), el("p", {}, t("hubhelper.test.lead")),
      el("div.hh-light", {}, el("span.hh-bulb" + ((live ? live === "on" : L && L.value === "on") ? ".on" : ""), { "aria-hidden": "true" }, ic("bulb", 26)),
        el("span.hh-light-n", {}, el("b", {}, L ? L.name : t("hubhelper.test.none")), el("small", {}, L && L.room ? L.room : "")), el("span.sp"), sel,
        el("button.btn.pri", { type: "button", disabled: !sw || down || !L || busy, onclick: runTest }, L ? t("hubhelper.test.flip", { name: L.name }) : t("hubhelper.test.flipNone"))), tl,
      tested ? el("p.hh-hint", {}, t("hubhelper.test.last", { name: D.test.name || "", when: ago(D.test.at) })) : null);
    // 4. remove Maker API
    const rm = el("button.btn.danger", { type: "button", disabled: !sw || !tested, onclick: async (e) => {
      const btn = e.currentTarget;   // (v3.0.7) taken before the await: after it, e.currentTarget is null
      if (!(await K.ask({ title: t("hubhelper.rm.ask"), text: t("hubhelper.rm.askText"), yes: t("hubhelper.rm.button"), danger: true }))) return;
      btn.disabled = true;
      const r = await api("/api/manage/hublink", { action: "removemaker" }).catch(() => null);
      if (!r || !r.ok) { toast(r && r.error === "test-first" ? t("hubhelper.rm.testFirst") : t("hubhelper.sw.failed"), true); draw(); return; }
      toast(t("hubhelper.rm.done"), false);
      return restartAfter(r);
    } }, t("hubhelper.rm.button"));
    const c4 = el("section.card.hh-pnl", {}, el("h3", {}, el("span.hh-sn", {}, "3"), t("hubhelper.rm.title")),
      mk ? el("p", {}, t("hubhelper.rm.lead")) : el("p", {}, t("hubhelper.rm.gone")),
      mk ? el("div.hh-row", {}, rm, el("span.hh-hint", {}, !sw ? t("hubhelper.rm.switchFirst") : tested ? t("hubhelper.rm.ready") : t("hubhelper.rm.testFirst"))) : pill("idle", t("hubhelper.rm.forgot")));
    // 5. when the Helper stops answering (never a fallback)
    const c5 = el("section.card.hh-pnl.hh-full", {}, el("h3", {}, t("hubhelper.down.title")), down
      ? el("div.hh-msg.bad", { role: "alert" }, el("b", {}, t("hubhelper.down.bad")), " ", b.reason ? reasonWords() : "", " ", t("hubhelper.down.noFallback"),
        el("ol", {}, el("li", {}, t("hubhelper.down.one")), el("li", {}, t("hubhelper.down.two")), el("li", {}, t("hubhelper.down.three"))))
      : el("div.hh-msg.ok", {}, sw ? t("hubhelper.down.ok") : t("hubhelper.down.notYet")));
    return el("div.hh-switch", {}, c1, c2, c3, c4, c5);
  }

  // ---------- the page ----------
  function draw() {
    if (!on() || !D) return;
    view = S.route().rest[0] === "switch" ? "switch" : "setup";
    const head = el("div.ph", {}, el("div", {}, el("h1", {}, view === "switch" ? t("hubhelper.sw.title") : t("hubhelper.title")),
      el("p", {}, view === "switch" ? t("hubhelper.sw.intro") : t("hubhelper.intro"))));
    const crumb = el("div.hh-crumb", {}, el("button.btn.sm.ghost", { type: "button", onclick: () => M.go("integrations") }, ic("chevL", 14), t("hubhelper.crumb")),
      view === "setup" && D.maker && D.maker.set && hubLink() ? el("button.btn.sm", { type: "button", onclick: () => M.go("hubhelper/switch") }, t("hubhelper.switch.open")) : null,
      view === "switch" ? el("button.btn.sm", { type: "button", onclick: () => M.go("hubhelper") }, t("hubhelper.setup.open")) : null);
    // (v3.0.7 review) Skypane isn't run by run_all (nothing restarts by itself): the new hub link needs a restart; switched
    // to the Helper with no hub link: a problem, never Maker API
    const bl = (D.bridge || {}).link || null;
    const note = D.noHubLink ? problem(t("hubhelper.why.nolink"), t("hubhelper.fix.nolink"))
      : D.supervised === false && D.via && bl !== D.via ? warnMsg(el("div.hh-warn-h", {}, ic("alert", 15), el("b", {}, t("hubhelper.restart.title"))), el("p", {}, t("hubhelper.restart.text"))) : null;
    let body;
    if (view === "switch") body = switchView();
    else {
      if (!step) step = firstStep();
      const stage = finished ? finishedView() : [null, stepInstall, stepLink, stepDevices, stepLogin, stepRest][step]();
      body = el("section.card.hh-wiz", {}, stepsNav(), el("section.hh-stage", { "aria-live": "polite" }, stage));
    }
    M.swap(M.$main, el("div.hh-page", {}, head, crumb, note, body));
  }
  async function render(rest) {
    if (!D) M.$main.replaceChildren(el("p.muted", {}, t("common.loading")));
    if (!(await load())) { M.$main.replaceChildren(K.empty("link", t("hubhelper.loadFailed"), t("integrations.tryAgain"))); arm(); return; }
    sig = JSON.stringify(D);
    if ((rest || [])[0] !== "switch") step = step || 0;
    draw();
    arm();
  }
  M.onReset(() => { D = null; sig = ""; step = 0; finished = false; code = null; testRun = null; clearTimeout(timer); });
  S.page("hubhelper", { title: t("hubhelper.title"), group: "admin", icon: "link", hidden: true, allowed: () => M.isAdmin(), words: "hubitat helper maker api oauth",
    render: (rest) => render(rest) });
})();
