// Health (release 2; v2.3.0: the pill in the top bar; v2.3.1: the page as the Status view of option 7): the health pill
// and its popover, and the Health page.
// The server's health monitor (service/health.py) checks every 30 s what Skypane expects to reach — the Hubitat
// bridge, the broker, camera video, Protect, your UniFi console, every panel's last check-in. GET /api/manage/health →
// {ok, checkedAt, problems: [{id, title, details, lvl, first, last}], log: [{at, what, id, title, details, lvl}] (newest
// first), panels: [{id, name, lastSeen, state, info}]}. This file asks every 30 s while signed in: the pill shows a dot
// for each part (hub, broker, cameras, panels) and how many problems are up that haven't been looked at yet; a click
// lists the last 10 (and counts them as seen — the number goes, until a new problem comes up); one of them or "Open
// Health" opens the Health page (also seen).
// A server without that route (older, or this login may not see it): no pill at all.
// Built with DOM calls + textContent only (the titles come from the server; nothing is parsed as HTML).
(function () {
  const M = window.Manage, S = window.Shell; if (!M || !S) return;
  const { el } = M, K = window.Kit, ic = K.icon;
  const LVL = { 2: K.t("health.level.notice"), 3: K.t("health.level.warning"), 4: K.t("health.level.alert") };
  let H = null, timer = null, pop = null, last = "";   // (last: the answer the page was drawn from)
  let down = false;   // the server didn't answer (restarting, the laptop off the network…): the pill says so, never "fine"
  // the problems already looked at in this browser ("id@first": the same problem coming back later is new again)
  // (per login: another person signing in on this browser hasn't seen them)
  const SEEN = () => `skypane.health.seen:${(M.me() || {}).user || ""}`;
  let seen = new Set(), seenFor = null;
  function readSeen() {
    if (seenFor === SEEN()) return;
    seenFor = SEEN(); seen = new Set();
    try { const a = JSON.parse(localStorage.getItem(seenFor) || "[]"); if (Array.isArray(a)) seen = new Set(a.map(String).slice(0, 200)); } catch {}
  }
  const key = (p) => `${p.id}@${p.first}`;
  const fresh = () => { readSeen(); return H ? H.problems.filter((p) => !seen.has(key(p))) : []; };
  function markSeen() {
    if (!H) return;
    readSeen();
    seen = new Set(H.problems.map(key));   // (only what's up now: fixed ones drop out)
    try { localStorage.setItem(seenFor, JSON.stringify([...seen])); } catch {}
    drawPill();
  }

  // ---------- times ----------
  const ago = (t) => K.ago(t, "mid");   // (kit.js: one "time ago" for every page)
  const when = (s) => K.when(s, "dayTime");   // (kit.js: one date formatter)
  const dot = (lvl) => el("i.hl-dot.l" + (lvl in LVL ? lvl : 3), { "aria-hidden": "true" });

  // ---------- the pill: Hub · Broker · Cameras · Panels n/m (a part this house doesn't use has no problem) ----------
  // (what a problem is about: the part of its id before ":" / "." — service/health.py)
  const kind = (p) => String(p.id || "").split(/[:.]/)[0];
  const PARTS = [["hub", K.t("health.part.hub"), (k) => k === "hubitat"], ["broker", K.t("health.part.broker"), (k) => k === "mqtt"],
    ["cameras", K.t("health.shared.aboutcameras"), (k) => /^(protect|go2rtc|camera|cameras|video)$/.test(k)]];
  // (each dot has its own tooltip — "Hub: not set up", "Panels: 1 of 3 connected"; on a phone one dot: the worst)
  const pill = el("button.hbtn#hbtn", { type: "button", "aria-haspopup": "dialog", "aria-expanded": "false", hidden: true });
  S.healthSlot.append(pill);
  const lvlCls = (lvl) => (lvl >= 4 ? "bad" : lvl ? "warn" : "");
  // the panels this login sees — the same rule as the Overview and the server (Manage.can(null, panel)); a login with
  // no panel of its own has no Panels part at all (Manage.panelsSeen: one function for the pill, the pop-up, the Overview)
  const panelsSeen = (list) => (M.can("panels") ? (list || []).filter((p) => M.can(null, p.id)) : []);
  M.panelsSeen = panelsSeen;
  function drawPill() {
    const nw = fresh(), n = nw.length, up = H ? H.problems.length : 0, worst = Math.max(0, ...nw.map((p) => p.lvl || 3));
    document.documentElement.classList.toggle("srv-down", down);   // (v2.8.0: the phone's "Can't reach Skypane" bar — phone.css)
    pill.hidden = !H && !down;
    if (pill.hidden) return;
    // cls: "" fine (green) · warn · bad · idle (grey: not set up)
    const seg = (cls, words, tip) => el("span.hi" + (cls ? `.${cls}` : ""), { "data-tip": tip }, el("span.hd" + (cls ? `.${cls}` : "")), el("span.hl", {}, words));
    const segs = [];
    if (down) segs.push(["warn", K.t("health.pill.down"), K.t("health.pill.downTip")]);
    else {
      const other = H.problems.filter((p) => kind(p) !== "panel" && !PARTS.some(([, , f]) => f(kind(p))));
      for (const [k, name, f] of PARTS) {
        const ps = H.problems.filter((p) => f(kind(p)));
        const lvl = Math.max(0, ...ps.map((p) => p.lvl || 3));
        if (!ps.length && H.parts && H.parts[k] === false) segs.push(["idle", name, M.isAdmin() ? K.t("health.pill.notSetUpAdmin", { name }) : K.t("health.pill.notSetUp", { name })]);
        else segs.push([lvlCls(lvl), name, ps.length ? K.t("health.pill.problem", { name, title: ps[0].title }) : K.t("health.pill.working", { name })]);
      }
      const ps = panelsSeen(H.panels);
      if (ps.length) {
        const on = ps.filter((p) => p.state === "connected").length;
        segs.push([on === ps.length ? "" : "warn", K.t("health.pill.panels", { on, total: ps.length }), K.t("health.pill.panelsTip", { on, total: ps.length })]);
      }
      if (other.length) segs.push([lvlCls(Math.max(...other.map((p) => p.lvl || 3))), K.t("health.pill.others", { n: other.length }), other.map((p) => p.title).join(" · ")]);
    }
    // (a phone: one dot — the worst of them; never green while anything has a problem)
    const rank = { bad: 3, warn: 2, "": 1, idle: 0 };
    const top = segs.reduce((a, b) => (rank[b[0]] > rank[a[0]] ? b : a), segs[0] || ["idle", "", ""]);
    const unset = segs.filter((x) => x[0] === "idle").map((x) => x[1]);
    const kids = [el("span.hi.sum" + (top[0] ? `.${top[0]}` : ""), {}, el("span.hd" + (top[0] ? `.${top[0]}` : ""))), ...segs.map((x) => seg(...x))];
    if (n || down) kids.push(el("span.hn" + (down || worst <= 3 ? ".l3" : ""), { "aria-hidden": "true" }, down ? "?" : n > 99 ? "99+" : String(n)));
    // (v2.8.0: a phone shows the dot with its words — phone.css)
    const issues = up + quietPanels().length;
    kids.push(el("span.ptxt", { "aria-hidden": "true" }, down ? K.t("health.pill.notAnswering") : issues ? K.t("health.pill.issues", { n: issues }) : K.t("health.pill.allGood")));
    pill.replaceChildren(...kids);
    const said = n ? K.t("health.pill.ariaNew", { n })
      : up ? K.t("health.pill.ariaSeen", { n: up })
        : segs.some((x) => x[0] === "warn" || x[0] === "bad") ? K.t("health.pill.ariaList", { list: segs.filter((x) => x[0] === "warn" || x[0] === "bad").map((x) => x[2]).join("; ") }) : K.t("health.pill.ariaFine");
    pill.setAttribute("aria-label", down ? K.t("health.pill.ariaDown") : unset.length ? K.t("health.pill.ariaUnset", { label: said, names: unset.join(", ") }) : said);
  }
  // the last 10: what's up now first (worst first), then the newest of the log
  // (the panels the pill shows amber that the monitor doesn't call a problem yet — never checked in, not connected:
  // listed too, so the pill, this list and the Overview say the same thing)
  const quietPanels = () => (H ? panelsSeen(H.panels).filter((p) => p.state !== "connected" && !H.problems.some((x) => x.id === `panel:${p.id}`)) : []);
  function lastTen() {
    const out = H.problems.map((p) => ({ title: p.title, lvl: p.lvl, at: p.first, up: true }));
    for (const p of quietPanels()) out.push({ title: p.lastSeen ? K.t("health.panel.notConnected", { name: p.name || p.id }) : K.t("health.panel.neverCheckedIn", { name: p.name || p.id }), lvl: 3, at: p.lastSeen, up: true, panel: true });
    const up = new Set(H.problems.map((p) => p.id));
    for (const e of H.log) {
      if (out.length >= 10) break;
      if (e.what === "problem" && up.has(e.id)) continue;   // (already listed as up now)
      out.push({ title: e.what === "resolved" ? K.t("timeline.fixed", { title: e.title }) : e.title, lvl: e.what === "resolved" ? 0 : e.lvl, at: e.at });
    }
    return out.slice(0, 10);
  }
  function openPop() {
    if (!H && !down) return;
    if (!pop) {
      pop = el("div.pop.hpop", { role: "dialog", "aria-label": K.t("health.title"), hidden: true });
      pop.addEventListener("keydown", (e) => {
        const its = [...pop.querySelectorAll("button")], i = its.indexOf(document.activeElement);
        const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: its.length - 1 }[e.key];
        if (to != null) { e.preventDefault(); its[(to + its.length) % its.length].focus(); }
        else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); S.closePops(); pill.focus(); }
      });
    }
    const items = H ? lastTen() : [];
    const unsetNames = (admin) => { const names = PARTS.filter(([k]) => H.parts[k] === false).map(([, n]) => n).join(", ");
      return admin ? K.t("health.pop.unsetAdmin", { names }) : K.t("health.pop.unset", { names }); };
    pop.replaceChildren(
      el("h4", {}, ic("activity", 16), K.t("health.title"), H && H.checkedAt ? el("small", {}, K.t("integrations.side.checkedAgo", { ago: ago(H.checkedAt) })) : null),
      ...(down ? [el("p.hnote", {}, K.t("health.pop.down"))]
        : items.length ? items.map((x) => el("button.hrow", { type: "button", onclick: () => { S.closePops(); open(); } },
          x.lvl ? dot(x.lvl) : el("i.hl-dot.ok", { "aria-hidden": "true" }),
          el("span", {}, el("b", {}, x.title), el("small", {}, x.panel ? (x.at ? K.t("health.pop.panelLastSeen", { when: when(x.at) }) : K.t("health.pop.panelOpen"))
            : x.up ? K.t("health.levelSince", { level: LVL[x.lvl] || LVL[3], when: when(x.at) }) : when(x.at)))))
        : [el("p.hnote", {}, H && H.parts && Object.values(H.parts).every((v) => v === false) ? K.t("health.pop.nothingSetUp")
          : K.t("health.pop.allFine"))]),
      ...(H && H.parts ? PARTS.filter(([k]) => H.parts[k] === false).length
        ? [el("p.hnote.hunset", {}, el("i.hl-dot", { "aria-hidden": "true" }), unsetNames(M.isAdmin()))] : [] : []),
      el("div.hfoot", {}, H ? (H.problems.length || quietPanels().length ? K.t("health.pop.toLook", { n: H.problems.length + quietPanels().length }) : K.t("health.pop.nothingToLook")) : "",
        el("button.btn.sm", { type: "button", onclick: () => { S.closePops(); open(); } }, K.t("health.pop.open"))));
    S.openPop(pop, pill, () => { pill.classList.remove("open"); pill.setAttribute("aria-expanded", "false"); });
    pill.classList.add("open"); pill.setAttribute("aria-expanded", "true");
    const f = pop.querySelector("button"); if (f) f.focus();
    markSeen();
  }
  pill.addEventListener("click", (e) => { e.stopPropagation(); if (!pop || pop.hidden) openPop(); else S.closePops(); });

  // ---------- asking the server ----------
  const signedIn = () => !!M.me() && document.body.classList.contains("signed-in");
  // user: the Health page was opened (a real request); the timer's asks are polls (Manage.poll: they never keep the
  // session alive, and a sign-out shows the sign-in card at once). After a failed ask: again in 5 s, not 30.
  async function load(user) {
    clearTimeout(timer);
    timer = setTimeout(load, 30000);
    if (!signedIn()) return;   // (signed out: nothing to ask)
    if (user !== true && document.visibilityState === "hidden") return;   // (v2.8.0: a hidden tab asks nothing — read at once when it's back)
    try {
      const r = user === true ? await fetch("/api/manage/health", { cache: "no-store" }) : await M.poll("/api/manage/health");
      if (!r) return;   // (signed out: the sign-in card is up)
      if (r.status === 401) { M.signedOut(); return; }
      const j = r.ok ? await r.json() : null;
      H = j && Array.isArray(j.problems) && Array.isArray(j.log) ? { ...j, panels: Array.isArray(j.panels) ? j.panels : [] } : null;
      down = r.status >= 500;   // (404 / 403: an older server or not allowed — no pill; 5xx: something's wrong there)
    } catch { H = null; down = true; }   // (no answer at all: the service restarting or out of reach — the next ask)
    if (down) { clearTimeout(timer); timer = setTimeout(load, 5000); }
    if (!signedIn()) { H = null; down = false; }
    drawPill();
    // (the page again only when something changed — a text selected to copy stays; else just its "Checked … ago")
    const now = JSON.stringify([down, H && H.problems, H && H.log, H && H.panels]);
    const chk = M.$main.querySelector(".hl-page .hl-checked");
    if (M.$main.querySelector(".hl-page") && now !== last) page();
    else if (chk && H && H.checkedAt) chk.textContent = K.t("health.checkedEvery", { ago: ago(H.checkedAt) });
  }
  // signed in: ask at once; signed out: no pill
  M.onSignIn(() => setTimeout(load, 0));
  // (v3.0.0) the Panels page read its list (a panel added or removed, the Status view's own 30 s refresh): the pill's
  // "Panels n/m" asks again too, so it never lags behind the page — at most once every 5 s
  let refreshedAt = 0;
  M.refreshHealth = () => { if (!signedIn() || Date.now() - refreshedAt < 5000) return; refreshedAt = Date.now(); load(); };
  // (back online / the tab shown again: asked at once — the pill doesn't say "not answering" for half a minute more)
  window.addEventListener("online", () => { if (signedIn()) load(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && signedIn()) load(); });
  M.onReset(() => { H = null; down = false; drawPill(); });

  // ---------- the Health page: Status (v2.3.1, option 7) and Timeline (v2.7.0: timeline.js) ----------
  // four connection cards (Hub, Broker, Camera video, Panels: state, since when, what to do; a part this house doesn't
  // use: grey "not set up"; v2.7.0: a bar per hour of the last day — service/health.py history), what needs a look,
  // then the log and the panels.
  const viewNow = () => S.view("health") || "status";
  // the header both views share: the title, Check now (admins: every check runs at once), the view switch
  M.healthHead = () => el("div.ph", {}, el("div", {}, el("h1", {}, K.t("health.title")), el("p", {}, K.t("health.intro"))),
    el("span.sp"), el("div.acts", {}, M.isAdmin() ? el("button.btn", { type: "button", onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      const r = await M.api("/api/manage/health", { action: "check" }).catch(() => ({}));
      b.disabled = false;
      if (!r.ok) return M.toast(r.error || K.t("integrations.notChecked"), true);
      M.toast(K.t("integrations.checkedNow")); if (viewNow() === "timeline") M.renderTimeline(); else load(true);
    } }, ic("refresh", 16), K.t("integrations.checkNow")) : el("button.btn", { type: "button", onclick: () => (viewNow() === "timeline" ? M.renderTimeline() : load()) }, ic("refresh", 16), K.t("health.refresh"))),
    el("span.vr"), S.viewSwitch("health"));   // (a phone too: the Timeline is worth reaching there)
  // a bar per hour (the last 24): green fine, amber trouble, red down, grey not checked that hour
  // nowCls: the state right now when the history can't know it (panels not connected aren't problems): the last bar
  function spark(k, nowCls) {
    const hist = Array.isArray(H.history) ? H.history : [], by = new Map(hist.map((b) => [b.t, b.parts && b.parts[k]]));
    const now = Math.floor(Date.now() / 3600000) * 3600, bars = [];
    for (let i = 23; i >= 0; i--) {
      const t = now - i * 3600, p = by.get(t);
      let cls = !p || !p.checks ? "none" : p.worst >= 4 ? "bad" : p.worst ? "warn" : "ok";
      if (i === 0 && nowCls && cls !== "bad") cls = nowCls;
      bars.push(el("i.hb." + cls, { title: K.t("health.spark.bar", { time: new Date(t * 1000).toLocaleTimeString([], { hour: "numeric" }),
        state: cls === "none" ? K.t("health.spark.none") : cls === "ok" ? K.t("health.spark.ok") : cls === "warn" ? K.t("health.spark.warn") : K.t("health.spark.bad") }) }));
    }
    return el("div.hs-spark", { role: "img", "aria-label": K.t("health.spark.label") }, ...bars);
  }
  // problem events with when they were resolved (the log pairs them by id), newest first
  function history() {
    const open = new Map(), out = [];
    for (const e of [...H.log].reverse()) {
      if (e.what === "problem") { const x = { ...e, resolved: null }; out.push(x); open.set(e.id, x); }
      else if (e.what === "resolved" && open.has(e.id)) { open.get(e.id).resolved = e.at; open.delete(e.id); }
    }
    return out.reverse();
  }
  const partOf = (p) => { const k = kind(p); return k === "panel" ? "panels" : (PARTS.find(([, , f]) => f(k)) || [])[0] || null; };
  const CARDS = [["hub", K.t("health.part.hub"), "server", K.t("health.card.hubSub"), K.t("health.card.hubDo")],
    ["broker", K.t("health.part.broker"), "broker", K.t("health.card.brokerSub"), K.t("health.card.brokerDo")],
    ["cameras", K.t("health.card.cameras"), "camera", "go2rtc · Protect", K.t("health.card.camerasDo")],   // i18n-ok (product names)
    ["panels", K.t("health.shared.aboutpanels"), "tablet", "", K.t("health.card.panelsDo")]];
  function statusCard([k, name, icon, sub, todo]) {
    const ps = H.problems.filter((p) => partOf(p) === k), worst = Math.max(0, ...ps.map((p) => p.lvl || 3));
    const on = H.panels.filter((p) => p.state === "connected").length;
    const unset = k === "panels" ? !H.panels.length && !ps.length : !ps.length && !!H.parts && H.parts[k] === false;
    const cls = unset ? "idle" : worst >= 4 ? "bad" : ps.length || (k === "panels" && on < H.panels.length) ? "warn" : "";
    // since when: the oldest problem up, else when the last one of this part was fixed
    const fixed = H.log.find((e) => e.what === "resolved" && partOf(e) === k);
    const off = k === "panels" ? H.panels.length - on : 0;
    const since = unset ? "" : ps.length ? K.t("health.card.since", { when: when(Math.min(...ps.map((p) => p.first))) }) : off ? K.t("health.card.offNow", { off, total: H.panels.length })
      : fixed ? K.t("health.card.fineSince", { when: when(fixed.at) }) : K.t("health.card.noProblems");
    const big = k === "panels" ? (H.panels.length ? [`${on} / ${H.panels.length}`, el("span", {}, K.t("health.card.online"))] : ["—", el("span", {}, K.t("health.card.noneYet"))])
      : [unset ? "—" : cls === "bad" ? K.t("health.card.down") : cls === "warn" ? K.t("integrations.pill.trouble") : K.t("integrations.pill.working")];
    const mine = k !== "panels" || M.can("panels");   // (a login without a panel: the panels may well be set up)
    const what = unset ? (!mine ? K.t("health.card.noPanelForYou")
      : k === "panels" ? (M.isAdmin() ? K.t("health.card.noPanelsAdmin") : K.t("health.card.noPanels"))
        : M.isAdmin() ? K.t("health.card.unsetAdmin") : K.t("health.card.unset"))
      : ps.length ? (ps.length > 1 ? K.t("health.card.andMore", { text: ps[0].details || ps[0].title, n: ps.length - 1 }) : (ps[0].details || ps[0].title))
        : off ? todo : K.t("health.card.nothingToDo");
    return el("div.hs" + (cls ? `.${cls}` : ""), {},
      el("div.top1", {}, el("span.hic", {}, ic(icon, 17)), el("div", {}, el("b", {}, name), el("small", {}, k === "panels" ? K.t("health.card.setUp", { n: H.panels.length }) : sub)),
        el("span.pill" + (cls ? `.${cls}` : ""), {}, unset ? (mine ? K.t("integrations.pill.notSetUp") : K.t("health.card.noneForYou")) : ps.length ? K.t("health.card.problems", { n: ps.length })
          : cls ? K.t("health.card.offline", { n: H.panels.length - on }) : K.t("health.card.ok"))),
      el("div.big", {}, ...big),
      unset ? null : spark(k, off ? "warn" : null),
      el("div.hs-since", {}, since),
      el("p.hs-do", {}, what, ps.length ? el("small", {}, todo) : null));
  }
  // the parts this house doesn't use: one quiet line, not three empty cards
  function unsetRow(names) {
    return el("div.hl-unset", {}, ic("settings", 15), el("span", {}, K.t("health.unsetYet", { names: names.join(" · ") })),
      M.isAdmin() ? el("button.btn.sm", { type: "button", onclick: () => M.go("integrations") }, K.t("health.openIntegrations")) : el("small.muted", {}, K.t("health.adminSetsUp")));
  }
  const isUnset = ([k]) => k !== "panels" && !H.problems.some((p) => partOf(p) === k) && !!H.parts && H.parts[k] === false;
  function lookRows() {
    const rows = H.problems.map((p) => {
      const pid = kind(p) === "panel" ? p.id.slice(6) : null;
      const act = pid && M.can(null, pid) && S.allowed("panels") ? el("button.btn.sm", { type: "button", "aria-label": K.t("health.look.openPanel", { title: p.title }), onclick: () => M.go(`panels/${pid}`) }, K.t("control.open"))
        : !pid && S.allowed("integrations") && partOf(p) ? el("button.btn.sm.ghost", { type: "button", onclick: () => M.go("integrations") }, K.t("integrations.title")) : null;
      return el("div.nl", {}, el("span.ni." + ((p.lvl || 3) >= 4 ? "bad" : "warn"), {}, ic(pid ? "tablet" : "alert", 16)),
        el("div", {}, el("b", {}, p.title), el("small", {}, [p.details, K.t("health.levelSince", { level: LVL[p.lvl] || LVL[3], when: when(p.first) })].filter(Boolean).join(" · "))), act);
    });
    const up = new Set(H.problems.map((p) => p.id));
    for (const p of H.panels) if (p.lastSeen == null && !up.has(`panel:${p.id}`)) {
      rows.push(el("div.nl", {}, el("span.ni.warn", {}, ic("tablet", 16)), el("div", {}, el("b", {}, K.t("health.panel.neverCheckedIn", { name: p.name || p.id })),
        el("small", {}, K.t("health.look.openAddress"))),
      M.can(null, p.id) && S.allowed("panels") ? el("button.btn.sm", { type: "button", onclick: () => M.go(`panels/${p.id}`) }, K.t("control.open")) : null));
    }
    return rows;
  }
  function page() {
    last = JSON.stringify([down, H && H.problems, H && H.log, H && H.panels]);
    if (viewNow() === "timeline") return;
    const head = M.healthHead();
    if (!H) {
      return M.$main.replaceChildren(el("div.hl-page", {}, head, el("div.card.ov-empty", {}, down
        ? [el("span.ei.bad", {}, ic("alert", 22)), el("h3", {}, K.t("health.page.downTitle")), el("p", {}, K.t("health.page.downText"))]
        : [el("span.ei", {}, ic("activity", 22)), el("h3", {}, K.t("health.page.naTitle")), el("p", {}, K.t("health.page.naText"))])));
    }
    const look = lookRows();
    const panels = K.card(K.t("health.shared.aboutpanels"), H.panels.length ? K.t("health.panels.connected", { on: H.panels.filter((p) => p.state === "connected").length, total: H.panels.length }) : "",
      ...(H.panels.length ? H.panels.map((p) => el("div.nl", {}, el("span.dot" + (p.state === "connected" ? "" : p.lastSeen ? ".warn" : ".idle"), { "aria-hidden": "true" }),
        el("div", {}, el("b", {}, p.name || p.id), el("small", {}, p.lastSeen ? (p.state === "connected" ? K.t("health.panels.connectedSeen", { ago: ago(p.lastSeen) }) : K.t("health.panels.disconnectedSeen", { ago: ago(p.lastSeen) }))
          : K.t("health.panels.never")),
          p.info && p.info.version ? el("small", {}, [K.t("health.panels.runs", { version: p.info.version }), p.info.page ? K.t("health.panels.showing", { page: p.info.page }) : "",
            p.info.from ? K.t("health.panels.from", { from: p.info.from }) : ""].filter(Boolean).join(" · ")) : null)))
        : [el("p.pad.muted", {}, K.t("health.panels.none"))]));
    const hist = history();
    const log = K.card(K.t("health.log.title"), hist.length ? K.t("health.log.count", { n: hist.length }) : "",
      ...(hist.length ? hist.map((e) => el("div.hl-row" + (e.resolved ? ".resolved" : ""), {}, dot(e.lvl),
        el("div.hl-main", {}, el("b", {}, e.title), e.details ? el("span.hl-det", {}, e.details) : ""),
        el("small", {}, e.resolved ? K.t("health.log.fixed", { from: when(e.at), to: when(e.resolved) }) : K.t("health.log.stillUp", { from: when(e.at) }))))
        : [el("p.pad.muted", {}, K.t("health.log.nothing"))]));
    const server = K.card(K.t("health.checks.title"), null, el("div.pad.hl-about", {},
      H.checkedAt ? el("small.hl-checked", {}, K.t("health.checkedEvery", { ago: ago(H.checkedAt) })) : el("small", {}, K.t("health.checks.notYet")),
      el("p", {}, K.t("health.checks.twice"))));
    markSeen();
    const unset = CARDS.filter(isUnset), shown = CARDS.filter((c) => !isUnset(c));
    M.swap(M.$main, el("div.hl-page", {}, head,
      unset.length ? unsetRow(unset.map(([, n]) => n)) : null,
      el("div.hgrid" + (shown.length < 4 ? `.n${shown.length}` : ""), {}, shown.map(statusCard)),
      el("div.gh", {}, K.t("health.look.title"), look.length ? el("span.r", {}, K.t("health.look.count", { n: look.length })) : null),
      el("div.grp.hl-look", {}, look.length ? look : el("div.nl", {}, el("span.ni.ok", {}, ic("check", 16)), el("div", {}, el("b", {}, K.t("health.look.nothing")),
        el("small", {}, K.t("health.look.allWorks"))))),
      el("div.hl-cols", {}, K.sideLayout(log, [panels, server]))));
  }
  // open the Health page (after the unsaved-changes question: the router's)
  async function open() {
    if ((await M.go("health")) === false) return;
    load();
  }
  M.renderHealth = () => { if (viewNow() === "timeline") return M.renderTimeline && M.renderTimeline(); page(); load(true); };
  S.page("health", { title: K.t("health.title"), group: "none", icon: "activity", words: "status hub broker cameras panels problems log timeline activity sign-ins history",
    views: [["status", K.t("health.shared.status"), "activity", K.t("health.view.statusHint")], ["timeline", K.t("health.view.timeline"), "clock", K.t("health.view.timelineHint")]],
    render: () => M.renderHealth() });
  M.openHealth = open;
  load();
})();
