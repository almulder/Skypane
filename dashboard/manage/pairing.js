// Skypane Manager — panel pairing (v3.0.2; mockups/PAIRING-API.md, CR-3.1 §2, 5–8). The admin's side of it:
//   the pairing box on Panels (panels.js frame puts it under the header — the same node every time, so its own 3 s
//   poll draws only itself): "Accept new panels", the upgrade's grace period ("Lock all panels now"), New panel
//   requests (Approve with the tablet's code + a name / Reject), Unclaimed panels, and the notices (blocked, copy,
//   profile, wrong-code, adopted) with Mark read;
//   a panel's tablet (panelDevice, in Setup's side column): status, device, last IP, last seen, paired — Unlink device,
//   Move this device to…, Rename, Re-trust (after a copy alert). Actions, never settings: each one at once.
//   the unread notices + waiting tablets as a count on the Panels item in the side rail (Shell.badge): asked every
//   minute in the background (Manage.poll — never keeps the session alive), every 3 s while Panels is open and shown.
// GET / PATCH /api/manage/pairing and PATCH /api/manage/panels {unlink, move, rename, retrust, remove} — the admin only.
// A phone: the requests and notices to read; approving is on a computer. Text from the server (devices, names, IPs)
// only ever goes in as textContent.
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast } = M, ic = K.icon;
  const sec = (t) => (+t > 1e12 ? +t / 1000 : +t || 0);   // (seconds, as kit.js's ago / when take them)
  const ago = (t) => K.ago(sec(t), "short");
  const norm = (v) => String(v || "").split(/\s+/).filter(Boolean).join(" ").toLowerCase();   // (as the server matches a name: case and spaces don't count)
  const signedIn = () => !!M.me() && document.body.classList.contains("signed-in");
  const onPanels = () => signedIn() && S.route().page === "panels" && !document.body.classList.contains("bld-open");

  let P = null, loaded = false, sig = "", timer = null, mode = "full", dlg = null, older = false;
  const box = el("div.pp");
  M.onReset(() => { P = null; loaded = false; sig = ""; clearTimeout(timer); box.replaceChildren(); if (S.badge) S.badge("panels", 0); });

  // ================================================================== asking the server
  async function load(bg) {
    if (!signedIn() || !M.isAdmin()) { P = null; return; }
    let r;
    try {
      if (bg) {
        const res = await M.poll("/api/manage/pairing");
        if (!res) return;   // (signed out: the sign-in card is up)
        r = res.ok ? await res.json() : res.status === 404 || res.status === 403 ? null : P;   // (an older server / not allowed: no box)
      } else { r = await api("/api/manage/pairing"); if (!r || r.status >= 400) r = r && (r.status === 404 || r.status === 403) ? null : P; }
    } catch { return; }
    loaded = true;
    P = r && Array.isArray(r.requests) ? { ...r, unclaimed: r.unclaimed || [], notices: r.notices || [] } : null;
  }
  // the next ask: 3 s while Panels is open and shown, else a minute (a hidden tab asks nothing — visibilitychange)
  function next() {
    clearTimeout(timer);
    if (!signedIn() || !M.isAdmin()) return;
    timer = setTimeout(tick, onPanels() && document.visibilityState === "visible" ? 3000 : 60000);
  }
  async function tick() {
    if (document.visibilityState === "hidden") return next();
    await load(true);
    paintIfChanged();
    next();
  }
  async function refresh() { await load(false); paintIfChanged(true); next(); }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && signedIn()) next(); });
  if (M.onSignIn) M.onSignIn(() => setTimeout(() => { if (M.isAdmin()) tick(); }, 0));
  if (S.onRoute) S.onRoute(() => { if (M.isAdmin() && signedIn()) next(); });   // (Panels opened: 3 s from now on)

  function paintIfChanged(force) {
    const now = JSON.stringify(P);
    badge();
    if (dlg) dlg.check();
    if (!force && now === sig) return;
    sig = now;
    paint();
  }
  const unread = () => (P ? P.notices.filter((n) => !n.read).length : 0);
  function badge() {
    if (!S.badge) return;
    const n = P ? unread() + P.requests.length : 0;
    S.badge("panels", n, n ? K.t("panels.pair.badge", { n }) : "");
  }

  // ================================================================== the box on the Panels page
  // M.pairingBox(mode): "full" (Status), "compact" (Setup: only tablets waiting and the grace period), "phone" (read only)
  M.pairingBox = (m) => {
    mode = m || "full";
    if (!M.isAdmin()) { box.replaceChildren(); return null; }
    if (!loaded) refresh();   // (asked once; then the timer — an older server without pairing: no box, no asking per redraw)
    paint();
    return box;
  };
  M.pairingRefresh = () => refresh();
  // (v3.0.2) a panel from before the upgrade, during its grace period: its old tablet is adopted on its next visit — no
  // code to approve. → the time it lasts until, in words, or null. (The server's legacy list when it sends one; else a
  // panel with no tablet yet that has checked in before — a panel added since never has)
  M.graceUntil = (p) => {
    if (!P || !P.grace || !p || (p.claim && p.claim.state !== "unclaimed")) return null;
    const legacy = Array.isArray(P.legacy) ? P.legacy.includes(p.id) : !!(p.status && p.status.lastSeen);
    return legacy ? K.when(sec(P.graceUntil), "dayTime") : null;
  };
  function paint() {
    if (!P || !M.isAdmin()) { box.replaceChildren(); return; }
    const kids = mode === "compact" ? compact() : mode === "phone" ? phoneView() : full();
    if (box.isConnected) M.swap(box, ...kids.filter(Boolean)); else box.replaceChildren(...kids.filter(Boolean));   // (swap: the focus stays where it was)
  }
  const grace = () => (P.grace ? el("div.pp-grace", { role: "status" }, ic("clock", 16),
    el("span", {}, K.t("panels.pair.grace", { time: K.when(sec(P.graceUntil), "dayTime") })), el("span.sp"),
    mode === "phone" ? null : el("button.btn.sm", { type: "button", onclick: lockNow }, ic("lock", 14), K.t("panels.pair.lockNow"))) : null);
  const deviceOf = (q) => q.device || K.t("panels.pair.unknownDevice");
  function reqRow(q, acts) {
    const bits = [q.screen, q.ip, K.t("panels.pair.opened", { ago: ago(q.openedAt) })].filter(Boolean).join(" · ");
    return el("div.pp-row", { "data-id": q.id }, el("span.pp-ic", {}, ic("tablet", 18)),
      el("div.pp-tx", {}, el("b", {}, deviceOf(q)), el("small", {}, bits),
        q.wrong ? el("small.pp-bad", {}, K.t("panels.pair.wrongSoFar", { n: q.wrong })) : null),
      acts ? el("div.pn-btns", {},
        el("button.btn.sm.ghost", { type: "button", "aria-label": K.t("panels.pair.rejectLabel", { device: deviceOf(q) }), onclick: () => reject(q) }, K.t("panels.pair.reject")),
        el("button.btn.sm.pri", { type: "button", "aria-label": K.t("panels.pair.approveLabel", { device: deviceOf(q) }), "data-fk": `pp-ok:${q.id}`, onclick: () => approve(q) }, ic("check", 14), K.t("panels.pair.approve"))) : null);
  }
  const acceptSw = () => el("label.pp-sw", { "data-tip": K.t("panels.pair.acceptTip") }, el("span", {}, K.t("panels.pair.accept")),
    K.sw(P.accept !== false, (on) => setFlag("accept", on), K.t("panels.pair.accept")));
  function requests(acts) {
    const rq = P.requests;
    return el("section.card.flush.pp-card", { "aria-label": K.t("panels.pair.requests") },
      el("h3.ch", {}, ic("tablet", 16), K.t("panels.pair.requests"), rq.length ? el("span.pp-n", {}, String(rq.length)) : null, el("span.sp"), mode === "phone" ? null : acceptSw()),
      grace(),
      P.accept === false ? el("p.pn-note.pp-closed", {}, ic("lock", 15), K.t("panels.pair.closed")) : null,
      rq.length ? el("div.pp-list", {}, rq.map((q) => reqRow(q, acts)))
        : el("p.pp-empty", {}, K.t(P.accept === false ? "panels.pair.noneClosed" : "panels.pair.none", { url: `${location.protocol}//${location.host}/` })),
      mode === "phone" && rq.length ? el("p.pn-info.pp-pad", {}, K.t("panels.pair.onComputer")) : null,
      // (CR §3b: a copied key locks its panel until the admin looks — Re-trust or Unlink on that panel)
      mode === "full" ? el("div.pp-foot", {}, el("label.pp-sw", {}, el("span", {}, K.t("panels.pair.lockCopy")),
        K.sw(P.lockOnCopy === true, (on) => setFlag("lock-on-copy", on), K.t("panels.pair.lockCopy"))), el("small", {}, K.t("panels.pair.lockCopyHint"))) : null);
  }
  function unclaimedCard() {
    const u = P.unclaimed;
    if (!u.length) return null;
    return el("section.card.flush.pp-card", { "aria-label": K.t("panels.pair.unclaimed") },
      el("h3.ch", {}, ic("link", 16), K.t("panels.pair.unclaimed"), el("span.pp-n.idle", {}, String(u.length))),
      el("div.pp-list", {}, u.map((x) => el("div.pp-row", {}, el("span.pp-ic", {}, ic("tablet", 18)),
        el("div.pp-tx", {}, el("b", {}, x.name), el("small", {}, K.t("panels.pair.unclaimedHint", { address: x.address || `/${x.id}` }))),
        el("div.pn-btns", {}, el("button.btn.sm", { type: "button", onclick: () => M.openPanel && M.openPanel(x.id) }, ic("settings", 14), K.t("panels.pair.openSetup")))))),
      el("p.gf.pp-pad", {}, K.t("panels.pair.unclaimedFoot")));
  }
  // a notice in plain words (its panel by name when the list knows it)
  function noticeWords(n) {
    const known = (M.panelsKnown ? M.panelsKnown() : []).find((p) => p.id === n.panel);
    const panel = known ? known.name : n.panel || K.t("panels.pair.aPanel");
    const from = [n.ip, n.agent].filter(Boolean).join(", ") || K.t("panels.pair.unknownFrom");
    const k = { blocked: "panels.pair.nBlocked", copy: "panels.pair.nCopy", profile: "panels.pair.nProfile", "wrong-code": "panels.pair.nWrong", adopted: "panels.pair.nAdopted" }[n.kind] || "panels.pair.nOther";
    return K.t(k, { panel, from, n: Math.max(1, +n.count || 1), kind: String(n.kind || "") });
  }
  const NOTICE_IC = { blocked: "lock", copy: "alert", profile: "eye", "wrong-code": "x", adopted: "check" };
  function notices(acts) {
    const all = P.notices.slice().sort((a, b) => (a.read === b.read ? sec(b.at) - sec(a.at) : a.read ? 1 : -1));
    if (!all.length) return null;
    const un = unread(), shownN = older ? all.length : Math.max(un, Math.min(3, all.length));
    return el("section.card.flush.pp-card", { "aria-label": K.t("panels.pair.notices") },
      el("h3.ch", {}, ic("bell", 16), K.t("panels.pair.notices"), un ? el("span.pp-n.bad", {}, String(un)) : null, el("span.sp"),
        acts && un ? el("button.btn.sm.ghost", { type: "button", onclick: () => readNotice() }, K.t("panels.pair.readAll")) : null),
      el("div.pp-list", {}, all.slice(0, shownN).map((n) => el("div.pp-row" + (n.read ? ".read" : ""), {},
        el("span.pp-ic" + (n.kind === "copy" || n.kind === "profile" ? ".warn" : ""), {}, ic(NOTICE_IC[n.kind] || "bell", 16)),
        el("div.pp-tx", {}, el("b", {}, noticeWords(n)), el("small", {}, K.when(sec(n.at), "dayTime"))),
        acts && !n.read ? el("button.btn.sm.ghost", { type: "button", onclick: () => readNotice(n.id) }, K.t("panels.pair.read")) : null))),
      all.length > shownN || older ? el("button.linkish.pp-more", { type: "button", onclick: () => { older = !older; paint(); } },
        older ? K.t("panels.pair.fewer") : K.t("panels.pair.older", { n: all.length - shownN })) : null);
  }
  const full = () => [el("div.pp-grid", {}, requests(true), unclaimedCard(), notices(true))];
  // (Setup: just the tablets waiting and the grace period — nothing when there are none)
  const compact = () => (P.requests.length || P.grace ? [requests(true)] : []);
  const phoneView = () => (P.requests.length || P.grace || unread() ? [requests(false), notices(true)] : []);

  // ================================================================== the actions
  async function send(body, failWords) {
    try {
      const r = await api("/api/manage/pairing", body);
      if (!r.ok) { toast(r.error || failWords || K.t("panels.save.notSaved"), true); return null; }
      return r;
    } catch (e) { if (e.message !== "login") toast(K.t("panels.save.offline"), true); return null; }
  }
  async function setFlag(action, on) {
    const r = await send({ action, on });
    if (r) toast(action === "accept" ? (on ? K.t("panels.pair.acceptOn") : K.t("panels.pair.acceptOff")) : on ? K.t("panels.pair.lockCopyOn") : K.t("panels.pair.lockCopyOff"));
    refresh();
  }
  async function lockNow() {
    if (!(await K.ask({ title: K.t("panels.pair.lockAsk"), text: K.t("panels.pair.lockText"), yes: K.t("panels.pair.lockNow") }))) return;
    if (await send({ action: "lock-now" })) toast(K.t("panels.pair.locked"));
    refresh();
  }
  async function reject(q) {
    if (await send({ action: "reject", id: q.id })) toast(K.t("panels.pair.rejected", { device: deviceOf(q) }));
    refresh();
  }
  async function readNotice(id) {
    await send(id ? { action: "notice-read", id } : { action: "notice-read" });
    refresh();
  }

  // Approve: the code the tablet shows (any case, spaces ignored) and a name — the live hint says what that name does
  function approve(q) {
    if (S.isPhone()) return toast(K.t("panels.pair.onComputer"));
    const panels = M.panelsKnown ? M.panelsKnown() : [];
    const unc = P.unclaimed;
    const codeIn = el("input.pp-code", { id: "pp-code", type: "text", maxlength: "9", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", placeholder: "ABC234", "aria-describedby": "pp-code-h" });   // i18n-ok (the code's look)
    const nameIn = el("input", { id: "pp-name", type: "text", maxlength: "40", autocomplete: "off", placeholder: K.t("panels.add.namePh"), "aria-describedby": "pp-name-h" });
    const codeHint = el("small.pn-hint#pp-code-h", { "aria-live": "polite" }, K.t("panels.pair.codeHint"));
    const nameHint = el("small.pn-hint#pp-name-h", { "aria-live": "polite" });
    const goneNote = el("p.pn-warn", { role: "alert", hidden: true }, ic("alert", 15), K.t("panels.pair.goneNow"));
    const chips = unc.length ? el("div.pp-chips", {}, el("small", {}, K.t("panels.pair.orPick")), ...unc.map((u) =>
      el("button.btn.sm.ghost", { type: "button", onclick: () => { nameIn.value = u.name; paintHint(); nameIn.focus(); } }, u.name))) : null;
    const kioskName = typeof P.legacyKiosk === "string" && P.legacyKiosk ? P.legacyKiosk : "skypane";   // i18n-ok (the old FreeKiosk name)
    const kiosk = P.legacyKiosk ? el("input", { type: "checkbox", id: "pp-kiosk" }) : null;
    const bad = (input, hint, words) => { input.classList.toggle("pn-bad", !!words); input.setAttribute("aria-invalid", words ? "true" : "false"); if (words) { hint.textContent = words; hint.classList.add("warn"); } };
    const cleanCode = () => codeIn.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    codeIn.addEventListener("input", () => {
      const v = codeIn.value.toUpperCase().replace(/\s+/g, "");
      if (v !== codeIn.value) { const at = codeIn.selectionStart; codeIn.value = v; try { codeIn.setSelectionRange(at, at); } catch {} }
      bad(codeIn, codeHint, ""); codeHint.textContent = K.t("panels.pair.codeHint"); codeHint.classList.remove("warn");
    });
    // what the name does: takes over an unclaimed panel / is taken / makes a new one at /<address>
    function paintHint() {
      const n = norm(nameIn.value);
      bad(nameIn, nameHint, "");
      nameHint.classList.remove("warn", "ok");
      if (!n) { nameHint.textContent = unc.length ? K.t("panels.pair.nameHintUnc") : K.t("panels.pair.nameHint"); return "empty"; }
      const is = (x) => norm(x.name) === n || norm(x.id) === n.replace(/ /g, "-");   // (its name, or its address)
      const u = unc.find(is);
      if (u) { nameHint.textContent = K.t("panels.pair.takesOver", { name: u.name }); nameHint.classList.add("ok"); return "ok"; }
      const c = panels.find((p) => is(p) && !(p.claim && p.claim.state === "unclaimed"));
      if (c) { nameHint.textContent = K.t("panels.pair.hasDevice", { name: c.name }); nameHint.classList.add("warn"); return "taken"; }
      nameHint.textContent = K.t("panels.pair.creates", { address: `/${M.panelSlug ? M.panelSlug(nameIn.value) : n}` });
      return "ok";
    }
    nameIn.addEventListener("input", paintHint);
    paintHint();
    let close = null;
    const go = el("button.btn.pri", { type: "submit" }, ic("check", 15), K.t("panels.pair.approve"));
    const form = el("form.modal.small.pn-ask.pp-ask", { role: "dialog", "aria-labelledby": "pp-h", autocomplete: "off", onsubmit: async (e) => {
      e.preventDefault();
      const code = cleanCode(), name = nameIn.value.trim();
      if (code.length !== 6) { bad(codeIn, codeHint, K.t("panels.pair.codeSix")); codeIn.focus(); return; }
      if (!name) { bad(nameIn, nameHint, K.t("panels.pair.nameNeeded")); nameIn.focus(); return; }
      if (paintHint() === "taken") { bad(nameIn, nameHint, nameHint.textContent); nameIn.focus(); nameIn.select(); return; }
      go.disabled = true;
      try {
        const r = await api("/api/manage/pairing", { action: "approve", id: q.id, code, name, ...(kiosk && kiosk.checked ? { kiosk: true } : {}) });
        if (r.ok) {
          end();
          toast(K.t("panels.pair.approved", { name: r.name || name, address: `${location.host}${r.address || ""}` }));
          refresh();
          if (M.panelsAfter) M.panelsAfter({});
          return;
        }
        if (r.error === "wrong-code") { bad(codeIn, codeHint, K.t("panels.pair.wrongCode", { n: Math.max(0, +r.left || 0) })); codeIn.focus(); codeIn.select(); return; }
        if (r.error === "claimed") { bad(nameIn, nameHint, r.words || K.t("panels.pair.claimed", { name })); nameIn.focus(); nameIn.select(); return; }
        if (r.error === "cancelled") { end(); toast(K.t("panels.pair.cancelled"), true); refresh(); return; }
        if (r.error === "gone") { end(); toast(K.t("panels.pair.gone"), true); refresh(); return; }
        toast(r.error || K.t("panels.pair.notApproved"), true);
      } catch (e2) { if (e2.message !== "login") toast(K.t("panels.save.offline"), true); } finally { go.disabled = false; if (dlg) dlg.check(); }   // (v3.0.2: the tablet left meanwhile — Approve stays off)
    } }, el("h2", { id: "pp-h" }, K.t("panels.pair.approveTitle")),
      el("div.pp-who", {}, ic("tablet", 18), el("div", {}, el("b", {}, deviceOf(q)), el("small", {}, [q.screen, q.ip].filter(Boolean).join(" · ")))),
      el("label.pn-fld", { for: "pp-code" }, el("b", {}, K.t("panels.pair.code")), codeIn), codeHint,
      el("label.pn-fld", { for: "pp-name" }, el("b", {}, K.t("panels.add.panelName")), nameIn), nameHint, chips,
      kiosk ? el("label.pp-check", { for: "pp-kiosk" }, kiosk, el("span", {}, K.t("panels.pair.kiosk", { name: kioskName }))) : null,
      goneNote,
      el("div.pn-ask-acts", {}, el("button.btn", { type: "button", onclick: () => end() }, K.t("control.cancel")), go));
    const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) end(); } }, form);
    function end() { dlg = null; if (close) close(); }
    // (each poll: the tablet left the pairing screen meanwhile — said in the dialog, Approve off)
    dlg = { check: () => { const left = !P || !P.requests.some((x) => x.id === q.id); goneNote.hidden = !left; go.disabled = left; } };
    close = M.dialog(shade, codeIn, end);
  }

  // ================================================================== a panel's tablet (Setup's side column)
  const ACT = (action, body, ok) => async () => {
    try {
      const r = await api("/api/manage/panels", { action, ...body });
      if (!r.ok) { toast(r.error || K.t("panels.save.notSaved"), true); return null; }
      if (ok) toast(ok);
      return r;
    } catch (e) { if (e.message !== "login") toast(K.t("panels.save.offline"), true); return null; }
  };
  M.panelDevice = (p) => {
    const c = p.claim;
    if (!c) return null;   // (an older server: no pairing yet)
    const admin = M.isAdmin() && !S.isPhone(), claimed = c.state === "claimed";
    const st = claimed ? (p.status && p.status.state) || "never" : "unclaimed";
    const kv = (k, v) => [el("span", {}, k), el("b", { title: v || "" }, v || "—")];
    const device = c.device || [c.model, c.browser, c.platform].filter(Boolean).join(" · ");
    // (rev. 2: "Not found" only where an agent is expected — its notification light is "This tablet's own light"
    // (server: ownLight = ledStrip on, notifyLight 0) — or one answered on this tablet before (claim.agentSeen);
    // a plain tablet shows no LED agent line at all)
    const said = ["ok", "off", "none"].includes(p.status && p.status.agent) ? p.status.agent : null;
    const agent = said === "none" && !(p.ownLight === true || c.agentSeen === true) ? null : said;
    const others = (M.panelsKnown ? M.panelsKnown() : []).filter((x) => x.id !== p.id && x.claim && x.claim.state === "unclaimed");
    const btn = (icon, words, fn, extra) => el("button.btn.sm" + (extra || ""), { type: "button", "data-ro-ok": "", onclick: fn }, ic(icon, 14), words);
    return el("section.card.flush.pp-dev", {}, el("h3.ch", {}, K.t("panels.dev.title"),
      el("small", {}, claimed ? (st === "online" ? K.t("panels.state.online") : st === "offline" ? K.t("panels.state.offline") : K.t("panels.dev.linked")) : K.t("panels.state.unclaimed"))),
      el("div.pn-kv", {},
        ...kv(K.t("panels.dev.device"), claimed ? device : K.t("panels.dev.none")),
        ...(claimed && c.screen ? kv(K.t("panels.kv.screen"), c.screen) : []),
        ...kv(K.t("panels.dev.lastIp"), c.lastIp),
        ...kv(K.t("panels.dev.lastSeen"), c.lastSeen ? ago(c.lastSeen) : K.t("panels.shared.never")),
        ...kv(K.t("panels.dev.paired"), c.pairedAt ? K.when(sec(c.pairedAt), "date") : "—"),
        // (v3.0.2: the LED agent on the tablet, from its check-in — nothing until the panel reported it)
        ...(claimed && agent ? kv(K.t("panels.dev.agent"), K.t(`panels.dev.agent.${agent}`)) : [])),
      c.copyAt || c.locked ? el("p.pn-warn.pp-pad", {}, ic("alert", 15), c.locked ? K.t("panels.dev.lockedCopy", { ago: ago(c.copyAt) }) : K.t("panels.dev.copySeen", { ago: ago(c.copyAt) })) : null,
      !claimed ? el("p.pn-info.pp-pad", {}, M.graceUntil(p) ? K.t("panels.dev.graceHint", { time: M.graceUntil(p) }) : K.t("panels.dev.unclaimedHint", { url: `${location.protocol}//${location.host}/` })) : null,
      admin ? el("div.pp-acts", {},
        claimed && (c.copyAt || c.locked) ? btn("check", K.t("panels.dev.retrust"), () => retrust(p), ".pri") : null,
        claimed ? btn("link", K.t("panels.dev.unlink"), () => unlink(p, device)) : null,
        claimed ? el("button.btn.sm", { type: "button", "data-ro-ok": "", disabled: !others.length, "data-tip": others.length ? null : K.t("panels.dev.moveNone"), onclick: () => move(p, device, others) },
          ic("arrowR", 14), K.t("panels.dev.move")) : null,
        btn("rows", K.t("panels.dev.rename"), () => rename(p))) : null);
  };
  async function unlink(p, device) {
    if (!(await K.ask({ title: K.t("panels.dev.unlinkAsk", { name: p.name }), text: K.t("panels.dev.unlinkText", { device: device || K.t("panels.dev.itsTablet") }), yes: K.t("panels.dev.unlinkYes"), danger: true }))) return;
    if (await ACT("unlink", { id: p.id }, K.t("panels.dev.unlinked", { name: p.name }))()) after();
  }
  async function retrust(p) {
    if (!(await K.ask({ title: K.t("panels.dev.retrustAsk", { name: p.name }), text: K.t("panels.dev.retrustText"), yes: K.t("panels.dev.retrust") }))) return;
    if (await ACT("retrust", { id: p.id }, K.t("panels.dev.retrusted", { name: p.name }))()) after();
  }
  async function rename(p) {
    const input = el("input", { type: "text", value: p.name, maxlength: "40", "aria-label": K.t("panels.add.panelName") });
    const extra = el("div.pn-ask-opt", {}, el("label.pn-fld", {}, el("b", {}, K.t("panels.add.panelName")), input), el("small.pn-hint", {}, K.t("panels.dev.renameHint", { address: p.address })));
    setTimeout(() => { input.focus(); input.select(); }, 0);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const y = input.closest(".modal").querySelector(".pn-ask-acts .btn.pri"); if (y) y.click(); } });
    if (!(await K.ask({ title: K.t("panels.dev.renameTitle", { name: p.name }), extra, yes: K.t("panels.dev.renameYes") }))) return;
    const name = input.value.trim();
    if (!name || name === p.name) return;
    if (await ACT("rename", { id: p.id, name }, K.t("panels.dev.renamed", { name }))()) after();
  }
  // Move this device to… an unclaimed panel: the tablet takes that panel's name and settings; the panel left without
  // a tablet is removed after its own question (unless the server already did — r.removed)
  async function move(p, device, others) {
    const sel = el("select", { "aria-label": K.t("panels.dev.moveTo") }, others.map((x) => el("option", { value: x.id }, x.name)));
    const extra = el("div.pn-ask-opt", {}, el("label.pn-fld", {}, el("b", {}, K.t("panels.dev.moveTo")), sel));
    if (!(await K.ask({ title: K.t("panels.dev.moveTitle", { name: p.name }), text: K.t("panels.dev.moveText", { device: device || K.t("panels.dev.itsTablet"), from: p.name }), extra, yes: K.t("panels.dev.moveYes") }))) return;
    const to = others.find((x) => x.id === sel.value);
    if (!to) return;
    const r = await ACT("move", { id: p.id, to: to.id }, K.t("panels.dev.moved", { name: to.name }))();
    if (!r) return;
    if (!r.removed && (await K.ask({ title: K.t("panels.dev.removeLeftAsk", { name: p.name }), text: K.t("panels.dev.removeLeftText", { name: p.name, to: to.name }), yes: K.t("panels.gen.removeYes"), no: K.t("panels.dev.keepIt"), danger: true }))) {
      if (await ACT("remove", { id: p.id }, K.t("panels.gen.removed", { name: p.name }))()) { if (M.panelsAfter) await M.panelsAfter({ gone: p.id }); refresh(); return M.openPanel && M.openPanel(to.id); }
    }
    if (M.panelsAfter) await M.panelsAfter({});
    refresh();
    if (M.openPanel) M.openPanel(to.id);
  }
  function after() { if (M.panelsAfter) M.panelsAfter({}); refresh(); }
})();
