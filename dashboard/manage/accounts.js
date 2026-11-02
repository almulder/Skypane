// Skypane Manager — Accounts (admins only; v2.7.0, the Manager rebuild phase 5): One (a login picked from the picker
// bar: its name, password, status, role, panel and rights in grouped rows saved as you go, and a side card with what it
// sees and its sign-ins) and All (every login as a column: the same rights as a matrix).
// Several admins and an owner (service/manager_auth.py): the owner is always an admin — nobody removes or demotes it;
// acting on an admin (rights, a sign-in code, unlocking), removing a login and handing over ownership ask for your own
// password once ("confirm it's you": 10 minutes). An admin's password is only ever reset with a one-time sign-in code.
// /api/manage/users. Everything is drawn with DOM calls + textContent.
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast } = M, ic = K.icon;
    const phone = () => S.isPhone();
  const NAME_RE = /^[A-Za-z0-9._@-]{1,40}$/;
  // the server's answers, in whole sentences
  const WHY = {
    taken: K.t("accounts.why.taken"), owner: K.t("accounts.why.owner"),
    admin: K.t("accounts.why.admin"), self: K.t("accounts.why.self"),
    already: K.t("accounts.why.already"), "not-admin": K.t("accounts.why.notAdmin"), "too-many-codes": K.t("accounts.why.tooManyCodes"),
    "too-soon": K.t("accounts.why.tooSoon"),
    "no-such-user": K.t("accounts.why.noSuchUser"), "no such panel": K.t("accounts.why.noSuchPanel"),   // i18n-ok (the server's answer)
    damaged: K.t("accounts.why.damaged"), "not-allowed": K.t("accounts.why.notAllowed"),
  };
  const plain = (r) => WHY[r.error] || (M.plainReason ? M.plainReason(r.error) : r.error) || K.t("accounts.notSaved");
  const when = (t) => K.when(t);   // (kit.js: one date formatter)
  const ago = (t) => K.ago(t, "long");   // (kit.js: one "time ago" for every page)
  // presets: they only fill the boxes — what is stored is always the rights themselves
  // the rights in the side card's order: [picture, name, what it lets them do]
  const ORDER = ["devices", "switch", "cameras", "backgrounds", "icons", "cards", "guest_wifi"];
  const RIGHT = { devices: ["devices", K.t("accounts.right.devices"), K.t("accounts.right.devicesHint")], cameras: ["camera", K.t("accounts.right.cameras"), K.t("accounts.right.camerasHint")],
    backgrounds: ["image", K.t("accounts.right.backgrounds"), K.t("accounts.right.backgroundsHint")], icons: ["shapes", K.t("accounts.right.icons"), K.t("accounts.right.iconsHint")],
    cards: ["cards", K.t("accounts.right.cards"), K.t("accounts.right.cardsHint")], guest_wifi: ["wifi", K.t("accounts.right.guestWifi"), K.t("accounts.right.guestWifiHint")],
    switch: ["zap", K.t("accounts.rightSwitch"), K.t("accounts.rightSwitchHint")] };   // (v2.9.1: off until an admin ticks it)
  const PRESETS = {
    // (v2.9.1: "Switch devices" stays off in both — an admin ticks it on its own, after picking a preset)
    family: { panels: "own", devices: true, cameras: true, backgrounds: "upload", icons: true, cards: false, guest_wifi: true, switch: false },
    limited: { panels: "own", devices: false, cameras: false, backgrounds: "none", icons: false, cards: false, guest_wifi: false, switch: false },
  };

  let U = null, names = {}, pick = null;
  M.onReset(() => { U = null; pick = null; });
  const viewNow = () => (phone() || window.innerWidth < 900 ? "one" : S.view("accounts") || "one");
  const panelName = (id) => names[id] || id;

  async function load() {
    const r = await api("/api/manage/users");
    if (!Array.isArray(r.users)) throw new Error(plain(r));
    const p = await api("/api/manage/panels").catch(() => ({}));
    names = {};
    for (const x of p.panels || []) names[x.id] = x.name;
    U = r;
    if (!pick || !U.users.some((u) => u.user === pick)) pick = (U.users.find((u) => u.user !== U.you) || U.users[0]).user;
  }

  // ---------- "confirm it's you": your own password, then the change again ----------
  function askPassword(title, text) {
    return new Promise((done) => {
      const pw = el("input", { type: "password", autocomplete: "current-password", maxlength: "128", "aria-label": K.t("accounts.confirm.password") });
      let close = null;
      const finish = (v) => { close(); done(v); };
      const form = el("form.modal.small.pn-ask", { role: "dialog", "aria-labelledby": "ac-cf-h", onsubmit: (e) => { e.preventDefault(); finish(pw.value); } },
        el("h2", { id: "ac-cf-h" }, title), el("p", {}, text), el("label.pn-fld", {}, el("b", {}, K.t("accounts.confirm.password")), pw),
        el("div.pn-ask-acts", {}, el("button.btn", { type: "button", onclick: () => finish(null) }, K.t("accounts.cancel")), el("button.btn.pri", { type: "submit" }, K.t("accounts.confirm.yes"))));
      const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) finish(null); } }, form);
      close = M.dialog(shade, pw, () => finish(null));
    });
  }
  async function confirmed() {
    const pw = await askPassword(K.t("accounts.confirm.title"), K.t("accounts.confirm.text"));
    if (pw == null) return false;
    const r = await api("/api/manage/login", { action: "confirm", password: pw }).catch(() => ({}));
    if (r.ok) return true;
    toast(r.error === "wrong" ? K.t("accounts.confirm.wrong") : r.error === "locked" ? K.t("accounts.confirm.locked") : K.t("accounts.confirm.not"), true);
    return false;
  }
  M.confirmIt = confirmed;
  // one change; the answer (U is updated) or null. need-confirm: asks for your password and sends it again.
  async function send(body, ok) {
    try {
      let r = await api("/api/manage/users", body);
      if (!r.ok && r.error === "need-confirm") {
        if (!(await confirmed())) return null;
        r = await api("/api/manage/users", body);
      }
      if (!r.ok) {
        toast(plain(r), true);
        if (r.error === "no-such-user" || r.error === "no such panel") render();   // i18n-ok (the server's answer)
        return null;
      }
      if (r.self) { toast(ok); M.logout && M.logout(); return null; }
      if (Array.isArray(r.users)) U = { ...U, ...r, code: undefined };
      M.devicesStale = true;   // (v2.9.1: a right or a role changed — who may switch what is read again on Devices)
      if (ok) toast(ok);
      return r;
    } catch (e) { if (e.message !== "login") toast(K.t("accounts.unreachable"), true); return null; }
  }

  // ---------- dialogs ----------
  function formDialog(title, text, fields, yes, onOk) {
    let close = null;
    const err = el("p.err");
    const go = el("button.btn.pri", { type: "submit" }, yes);
    const form = el("form.modal.small.pn-ask", { role: "dialog", "aria-labelledby": "ac-dl-h", onsubmit: async (e) => {
      e.preventDefault(); err.textContent = "";
      go.disabled = true;
      try { const why = await onOk(); if (why) err.textContent = why; else close(); } finally { go.disabled = false; }
    } }, el("h2", { id: "ac-dl-h" }, title), text ? el("p", {}, text) : null, ...fields, err,
    el("div.pn-ask-acts", {}, el("button.btn", { type: "button", onclick: () => close() }, K.t("accounts.cancel")), go));
    const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) close(); } }, form);
    close = M.dialog(shade, form.querySelector("input, select"));
  }
  const fld = (label, input, hint) => el("label.pn-fld", {}, el("b", {}, label), input, hint ? el("small.pn-hint", {}, hint) : null);
  function addDialog() {
    const name = el("input", { type: "text", maxlength: "40", autocomplete: "off", autocapitalize: "none", placeholder: K.t("accounts.add.namePlaceholder") });
    const pw = el("input", { type: "password", maxlength: "128", autocomplete: "new-password" });
    const panel = el("select", {}, el("option", { value: "" }, K.t("accounts.noPanel")), (U.panels || []).map((p) => el("option", { value: p }, panelName(p))));
    const preset = el("select", {}, el("option", { value: "family" }, K.t("accounts.add.family")),
      el("option", { value: "limited" }, K.t("accounts.add.limited")));
    formDialog(K.t("accounts.add.title"), K.t("accounts.add.text"),
      [fld(K.t("accounts.nameLabel"), name, K.t("accounts.add.nameHint")), fld(K.t("accounts.password"), pw, K.t("accounts.add.passwordHint")),
        fld(K.t("accounts.theirPanel"), panel), fld(K.t("accounts.add.startFrom"), preset)], K.t("accounts.add.button"), async () => {
        if (!NAME_RE.test(name.value.trim())) return K.t("accounts.add.badName");
        if (pw.value.length < 4) return K.t("accounts.pw.tooShort");
        const r = await send({ action: "add", user: name.value.trim(), password: pw.value, perms: { ...PRESETS[preset.value], panel: panel.value } },
          K.t("accounts.add.done", { name: name.value.trim() }));
        if (!r) return K.t("accounts.add.failed");
        pick = name.value.trim(); draw();
        return null;
      });
  }
  function adminDialog(u) {
    const pw = el("input", { type: "password", maxlength: "128", autocomplete: "new-password" });
    const pw2 = el("input", { type: "password", maxlength: "128", autocomplete: "new-password" });
    formDialog(K.t("accounts.makeAdmin.ask", { name: u.user }), K.t("accounts.makeAdmin.text"),
      [fld(K.t("accounts.makeAdmin.newPassword"), pw), fld(K.t("accounts.makeAdmin.again"), pw2)], K.t("accounts.makeAdmin.yes"), async () => {
        if (pw.value.length < 8) return K.t("accounts.makeAdmin.tooShort");
        if (pw.value !== pw2.value) return K.t("accounts.makeAdmin.notSame");
        const r = await send({ action: "role", user: u.user, role: "admin", password: pw.value }, K.t("accounts.makeAdmin.done", { name: u.user }));
        if (r) draw();
        return r ? null : K.t("accounts.notChanged");
      });
  }
  function passwordDialog(u) {
    const pw = el("input", { type: "password", maxlength: "128", autocomplete: "new-password" });
    formDialog(K.t("accounts.pw.title", { name: u.user }), K.t("accounts.pw.text"),
      [fld(K.t("accounts.pw.newPassword"), pw, K.t("accounts.pw.hint"))], K.t("accounts.pw.yes"), async () => {
        if (pw.value.length < 4) return K.t("accounts.pw.tooShort");
        const r = await send({ action: "password", user: u.user, password: pw.value }, K.t("accounts.pw.done", { name: u.user }));
        if (r) draw();
        return r ? null : K.t("accounts.notChanged");
      });
  }
  async function codeDialog(u) {
    if (!(await K.ask({ title: K.t("accounts.code.ask", { name: u.user }), yes: K.t("accounts.code.yes"),
      text: K.t("accounts.code.askText") }))) return;
    const r = await send({ action: "code", user: u.user }, null);
    if (!r || !r.code) return;
    const code = el("code.ac-code", {}, r.code);
    const shade = el("div.modal-bg.top", {}, el("div.modal.small.pn-ask", { role: "dialog", "aria-labelledby": "ac-code-h" },
      el("h2", { id: "ac-code-h" }, K.t("accounts.code.title", { name: u.user })),
      el("p", {}, K.t("accounts.code.text", { name: u.user, when: when(r.until) })), code,
      el("div.pn-ask-acts", {}, el("button.btn", { type: "button", onclick: async () => { toast((await M.copyText(r.code)) ? K.t("accounts.code.copied") : K.t("accounts.code.copyFailed"), false); } }, ic("copy", 14), K.t("accounts.code.copy")),
        el("button.btn.pri", { type: "button", onclick: () => close() }, K.t("accounts.code.done")))));
    const close = M.dialog(shade, shade.querySelector(".btn.pri"));
    draw();
  }

  // ---------- what a login sees (the side card's list) ----------
  function seesList(u) {
    const p = u.perms || {}, adm = u.admin;
    const line = (icon, label, state, on) => el("div.ac-see" + (on ? "" : ".off"), {}, ic(icon, 15), el("span", {}, label),
      el("small", {}, on ? state : [ic("lock", 12), " " + K.t("accounts.see.hidden")]));
    const hasPanel = adm || p.panels === "all" || !!p.panel;
    return [
      line("devices", K.t("accounts.right.devices"), adm || p.devices ? K.t("accounts.see.canChange") : K.t("accounts.see.viewOnly"), adm || p.devices || hasPanel),
      line("tablet", K.t("accounts.see.panels"), adm || p.panels === "all" ? K.t("accounts.allPanels") : p.panel ? K.t("accounts.see.panelOnly", { name: panelName(p.panel) }) : "", hasPanel),
      el("div.ac-sh", {}, K.t("accounts.see.manage")),
      line("camera", K.t("accounts.right.cameras"), adm || p.cameras ? K.t("accounts.see.canChange") : K.t("accounts.see.viewOnly"), adm || p.cameras || hasPanel),
      line("image", K.t("accounts.right.backgrounds"), adm || p.backgrounds === "full" ? K.t("accounts.full") : K.t("accounts.uploadOnly"), adm || ["upload", "full"].includes(p.backgrounds)),
      line("shapes", K.t("accounts.right.icons"), K.t("accounts.see.canChange"), adm || p.icons),
      line("cards", K.t("accounts.right.cards"), K.t("accounts.see.canChange"), adm || p.cards),
      el("div.ac-sh", {}, K.t("accounts.roleAdmin")),
      line("users", K.t("accounts.title"), K.t("accounts.see.canChange"), adm),
      line("link", K.t("accounts.see.integrations"), K.t("accounts.see.canChange"), adm),
      line("wifi", K.t("accounts.right.guestWifi"), K.t("accounts.see.canChange"), adm || p.guest_wifi),
    ];
  }
  function seesSentence(u) {
    if (u.owner) return K.t("accounts.see.owner", { name: u.user });
    if (u.admin) return K.t("accounts.see.admin", { name: u.user });
    const p = u.perms || {}, s = [];
    s.push(p.devices ? K.t("accounts.right.devices") : K.t("accounts.see.devicesViewOnly"));
    s.push(p.panels === "all" ? K.t("accounts.see.allPanels") : p.panel ? K.t("accounts.see.thePanel", { name: panelName(p.panel) }) : K.t("accounts.see.noPanel"));
    if (p.cameras) s.push(K.t("accounts.right.cameras")); if (["upload", "full"].includes(p.backgrounds)) s.push(K.t("accounts.right.backgrounds"));
    if (p.icons) s.push(K.t("accounts.right.icons")); if (p.cards) s.push(K.t("accounts.right.cards")); if (p.guest_wifi) s.push(K.t("accounts.right.guestWifi"));
    return K.t("accounts.see.user", { name: u.user, list: s.slice(0, -1).join(", "), last: s[s.length - 1] }) + (p.switch ? ` ${K.t("accounts.canSwitch", { name: u.user })}` : "");
  }
  const status = (u) => (u.resetNeeded ? K.t("accounts.state.lockedReset") : u.lockedFor ? K.t("accounts.state.lockedFor", { n: Math.ceil(u.lockedFor / 60) })
    : u.codeUntil ? K.t("accounts.state.codeUntil", { when: when(u.codeUntil) }) : K.t("accounts.state.canSignIn"));
  const roleWord = (u) => (u.owner ? K.t("accounts.owner") : u.admin ? K.t("accounts.roleAdmin") : K.t("accounts.roleUser"));
  const avatar = (u) => el("span.av", { "aria-hidden": "true" }, u.user.slice(0, 1).toUpperCase());

  // ---------- One ----------
  function picker(u) {
    const menu = el("div.pop.ac-menu", { role: "listbox", "aria-label": K.t("accounts.picker.logins"), hidden: true },
      phone() ? null : el("button.ac-pm.add", { type: "button", onclick: () => { menu.hidden = true; addDialog(); } }, ic("plus", 15), K.t("accounts.picker.add")),
      U.users.map((x) => el("button.ac-pm" + (x.user === u.user ? ".on" : ""), { type: "button", role: "option", "aria-selected": String(x.user === u.user),
        onclick: () => { pick = x.user; menu.hidden = true; draw(); } }, avatar(x),
      el("span", {}, el("b", {}, x.user), el("small", {}, [roleWord(x), x.resetNeeded || x.lockedFor ? K.t("accounts.picker.locked") : null, !x.admin && x.perms && x.perms.panel ? panelName(x.perms.panel) : null].filter(Boolean).join(" · "))),
      x.user === u.user ? ic("check", 16) : null)));
    const btn = el("button.ac-picker", { type: "button", "aria-haspopup": "listbox", "aria-expanded": "false", onclick: (e) => {
      e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden));
      if (!menu.hidden) { const close = (ev) => { if (!menu.contains(ev.target)) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); document.removeEventListener("pointerdown", close); } };
        document.addEventListener("pointerdown", close); (menu.querySelector(".on") || menu.querySelector("button")).focus(); }
    } }, avatar(u), el("span", {}, el("b", {}, u.user, u.owner ? el("span.pill.acc.ac-own", {}, K.t("accounts.owner")) : null),
      el("small", {}, [u.owner ? null : roleWord(u), u.resetNeeded || u.lockedFor ? K.t("accounts.picker.locked") : (u.lastSignIn ? K.t("accounts.picker.lastSignedIn", { when: ago(u.lastSignIn.at) }) : K.t("accounts.picker.neverSignedIn"))].filter(Boolean).join(" · "))), ic("chevD", 16));
    menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { menu.hidden = true; btn.focus(); } });
    return el("div.ac-pbar", {}, el("div.ac-pwrap", {}, btn, menu));
  }
  function oneView(u) {
    const may = !phone(), me = u.user === U.you;
    const nameIn = el("input", { type: "text", value: u.user, maxlength: "40", autocapitalize: "none", "aria-label": K.t("accounts.nameLabel"), disabled: !may || (u.owner && !U.owner) });
    const rename = el("button.btn.sm", { type: "button", disabled: true, onclick: async () => {
      const v = nameIn.value.trim();
      if (!NAME_RE.test(v)) return toast(K.t("accounts.add.badName"), true);
      const r = await send({ action: "rename", user: u.user, name: v }, me ? K.t("accounts.rename.doneMe") : K.t("accounts.rename.done", { name: v }));
      if (r) { pick = r.me || v; if (r.me) await M.meAgain(); render(); }
    } }, K.t("accounts.rename.button"));
    nameIn.addEventListener("input", () => { rename.disabled = !nameIn.value.trim() || nameIn.value.trim() === u.user; });
    const pwCtl = me ? el("button.btn.sm", { type: "button", onclick: () => { M.accountFocus = "password"; M.go("account"); } }, ic("key", 14), K.t("accounts.openAccount"))
      : u.owner ? el("small.muted.ac-ownpw", {}, K.t("accounts.pw.ownerOnly"))
      : u.admin ? el("button.btn.sm", { type: "button", onclick: () => codeDialog(u) }, ic("key", 14), K.t("accounts.makeCode"))
        : el("div.ac-two", {}, may ? el("button.btn.sm", { type: "button", onclick: () => passwordDialog(u) }, ic("key", 14), K.t("accounts.pw.button")) : null,
          el("button.btn.sm.ghost", { type: "button", onclick: () => codeDialog(u) }, K.t("accounts.makeCode")));
    const locked = u.resetNeeded || u.lockedFor;
    const stCtl = locked && !me ? el("div.ac-two", {}, el("span.pill.bad", {}, K.t("accounts.locked")), el("button.btn.sm", { type: "button", onclick: async () => {
      if (await send({ action: "unlock", user: u.user }, K.t("accounts.unlocked", { name: u.user }))) draw(); } }, ic("unlock", 14), K.t("accounts.unlock")))
      : el("span.pill" + (u.codeUntil ? ".warn" : ""), {}, u.codeUntil ? K.t("accounts.state.codeWaiting") : K.t("accounts.state.canSignIn"));
    const roleSeg = el("div.seg", { role: "group", "aria-label": K.t("accounts.role") }, [["admin", K.t("accounts.roleAdmin")], ["user", K.t("accounts.roleUser")]].map(([k, n]) =>
      el("button" + ((u.admin ? "admin" : "user") === k ? ".on" : ""), { type: "button", "aria-pressed": String((u.admin ? "admin" : "user") === k), disabled: !may || u.owner,
        onclick: async () => {
          if ((u.admin ? "admin" : "user") === k) return;
          if (k === "admin") return adminDialog(u);
          if (!(await K.ask({ title: K.t("accounts.makeUser.ask", { name: u.user }), text: me ? K.t("accounts.makeUser.askMe") : K.t("accounts.makeUser.askText", { name: u.user }), yes: K.t("accounts.makeUser.yes"), danger: me }))) return;
          if (await send({ action: "role", user: u.user, role: "user" }, K.t("accounts.makeUser.done", { name: u.user }))) draw();
        } }, n)));
    const presets = u.admin || !may ? null : el("div.ac-two", {}, el("small.muted", {}, K.t("accounts.preset.startFrom")), ["family", "limited"].map((k) =>
      el("button.btn.sm", { type: "button", onclick: async () => { if (await send({ action: "perms", user: u.user, perms: PRESETS[k] }, (k === "family" ? K.t("accounts.preset.familySet") : K.t("accounts.preset.limitedSet")))) draw(); } },
        k === "family" ? K.t("accounts.preset.family") : K.t("accounts.preset.limited"))));
    const groups = [...K.group(K.t("accounts.login"), [
      K.row(K.t("accounts.nameLabel"), me ? K.t("accounts.nameHint.me") : u.owner && !U.owner ? K.t("accounts.nameHint.owner")
        : K.t("accounts.nameHint.other"), el("div.ac-two", {}, nameIn, may && !nameIn.disabled ? rename : null)),
      K.row(K.t("accounts.password"), me ? K.t("accounts.pw.me") : u.owner ? K.t("accounts.pw.owner")
        : u.admin ? K.t("accounts.pw.admin")
        : K.t("accounts.pw.user"), pwCtl),
      K.row(K.t("accounts.status"), status(u), stCtl),
      K.row(K.t("accounts.role"), u.owner ? K.t("accounts.roleHint.owner") : u.admin ? K.t("accounts.roleHint.admin") : K.t("accounts.roleHint.user"),
        el("div.ac-two", {}, roleSeg, presets)),
    ])];
    if (!u.admin) {
      const p = u.perms || {};
      const save = async (change, words) => { if (await send({ action: "perms", user: u.user, perms: change }, words || K.t("accounts.saved"))) draw(); };
      const panelSel = el("select", { "aria-label": K.t("accounts.theirPanel"), disabled: !may, onchange: (e) => save({ panel: e.target.value }) },
        el("option", { value: "" }, K.t("accounts.noPanel")), (U.panels || []).map((x) => el("option", { value: x, selected: p.panel === x }, panelName(x))));
      const segOf = (key, opts) => el("div.seg", { role: "group", "aria-label": key }, opts.map(([v, n]) =>
        el("button" + (p[key] === v ? ".on" : ""), { type: "button", "aria-pressed": String(p[key] === v), disabled: !may, onclick: () => p[key] !== v && save({ [key]: v }) }, n)));
      groups.push(...K.group(K.t("accounts.panelGroup"), [K.row(K.t("accounts.theirPanel"), K.t("accounts.panelHint"), panelSel),
        K.row(K.t("accounts.panelsLabel"), K.t("accounts.panelsHint"), segOf("panels", [["own", K.t("accounts.panelsOwn")], ["all", K.t("accounts.allPanels")]]))]));
      // (the side card's order, with a picture and a line saying what each lets them do — the mockup)
      const perms = (U.permissions || []).filter((x) => !["panel", "panels"].includes(x.id))
        .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
      groups.push(...K.group(K.t("accounts.mayAlso"), perms.map((x) => K.row([ic((RIGHT[x.id] || [])[0] || "settings", 15), " ", (RIGHT[x.id] || [])[1] || x.text], (RIGHT[x.id] || [])[2] || null, x.kind === "bool"
        ? (may ? K.sw(p[x.id] === true, (v) => save({ [x.id]: v }), x.text) : el("span.pill" + (p[x.id] ? "" : ".idle"), {}, p[x.id] ? K.t("accounts.yes") : K.t("accounts.no")))
        : segOf(x.id, (x.choices || []).map(([v, n]) => [v, v === "upload" ? K.t("accounts.uploadOnly") : n]))))));
    } else {
      groups.push(...K.group(K.t("accounts.rightsGroup"), [K.row(K.t("accounts.everyRight"), K.t("accounts.everyRightHint"), el("span.pill.acc", {}, K.t("accounts.always")))]));
    }
    groups.push(el("p.gf.ac-sees", {}, seesSentence(u)));
    const danger = [];
    if (!u.owner && may) danger.push(el("button.btn.pn-danger", { type: "button", onclick: async () => {
      if (!(await K.ask({ title: me ? K.t("accounts.remove.askMe") : K.t("accounts.remove.ask", { name: u.user }), danger: true, yes: me ? K.t("accounts.remove.yesMe") : K.t("accounts.remove.yes", { name: u.user }),
        text: me ? K.t("accounts.remove.textMe") : K.t("accounts.remove.text", { name: u.user }) }))) return;
      if (await send({ action: "remove", user: u.user }, K.t("accounts.remove.done", { name: u.user }))) { pick = null; render(); }
    } }, ic("trash", 15), me ? K.t("accounts.remove.buttonMe") : K.t("accounts.remove.button", { name: u.user })));
    if (U.owner && u.admin && !u.owner && may) danger.push(el("button.btn", { type: "button", onclick: async () => {
      if (!(await K.ask({ title: K.t("accounts.handover.ask", { name: u.user }), yes: K.t("accounts.handover.yes"), text: K.t("accounts.handover.askText", { name: u.user }) }))) return;
      if (await send({ action: "owner", user: u.user }, K.t("accounts.handover.done", { name: u.user }))) { await M.meAgain(); render(); }
    } }, ic("shield", 15), K.t("accounts.handover.button")));
    if (danger.length) groups.push(el("div.ac-danger", {}, ...danger));
    return el("div.ac-one", {}, picker(u), ...groups);
  }
  function sideCard(u) {
    const ls = u.lastSignIn;
    const wrong = u.resetNeeded ? K.t("accounts.side.lockedReset") : u.lockedFor ? K.t("accounts.state.lockedNow") : u.triesLeft != null && u.triesLeft < 5 ? K.t("accounts.side.inARow", { n: 5 - u.triesLeft }) : K.t("accounts.side.none");
    return el("section.card.flush.ac-side", { "aria-label": K.t("accounts.side.whatSees", { name: u.user }) },
      el("h3.ch", {}, ic("eye", 15), " " + K.t("accounts.side.whatSees", { name: u.user })), el("div.ac-sees-list", {}, ...seesList(u)),
      el("h3.ch", {}, ic("clock", 15), " " + K.t("accounts.side.signIns")),
      el("div.pn-kv", {}, el("span", {}, K.t("accounts.lastSignInLabel")), el("b", {}, ls ? `${ago(ls.at)}` : K.t("accounts.never")),
        ls && ls.agent ? el("span", {}, K.t("accounts.browser")) : null, ls && ls.agent ? el("b", {}, ls.agent) : null,
        ls && ls.from ? el("span", {}, K.t("accounts.side.from")) : null, ls && ls.from ? el("b", {}, ls.from) : null,
        el("span", {}, K.t("accounts.side.wrong")), el("b", {}, wrong),
        el("span", {}, K.t("accounts.side.pwSet")), el("b", {}, u.pwAt ? ago(u.pwAt) : "—")),
      el("div.cm-acts.foot", {}, el("button.btn.sm", { type: "button", onclick: () => { M.timelineWho = u.user; M.go("health/timeline"); } },
        ic("activity", 14), K.t("accounts.history", { name: u.user }))));
  }

  // ---------- All (the matrix) ----------
  function allView() {
    const users = U.users, perms = (U.permissions || []).filter((x) => !["panel", "panels"].includes(x.id)).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
    const save = async (u, change) => { if (await send({ action: "perms", user: u.user, perms: change }, K.t("accounts.all.savedFor", { name: u.user }))) draw(); };
    const cell = (u, node) => el("td", {}, node);
    const always = () => el("span.ac-always", { title: K.t("accounts.all.alwaysTip") }, ic("check", 16));
    const segCell = (u, key, opts) => el("div.seg.sm", { role: "group", "aria-label": `${u.user}: ${key}` }, opts.map(([v, n]) =>
      el("button" + (u.perms[key] === v ? ".on" : ""), { type: "button", "aria-pressed": String(u.perms[key] === v), onclick: () => u.perms[key] !== v && save(u, { [key]: v }) }, n)));
    const head = el("tr", {}, el("th.ac-rh", { scope: "col" }, el("small", {}, K.t("accounts.all.logins", { n: users.length }) + (users.some((u) => u.resetNeeded || u.lockedFor) ? " · " + K.t("accounts.all.someLocked") : ""))),
      users.map((u) => el("th", { scope: "col" }, el("button.ac-uh", { type: "button", onclick: () => { pick = u.user; S.setView("accounts", "one"); } },
        avatar(u), el("b", {}, u.user), el("small", {}, roleWord(u))))));
    const row = (label, hint, fn) => el("tr", {}, el("th.ac-rh", { scope: "row" }, el("b", {}, label), hint ? el("small", {}, hint) : null), users.map((u) => cell(u, fn(u))));
    const sect = (t) => el("tr.ac-sect", {}, el("th", { colspan: String(users.length + 1), scope: "colgroup" }, t));
    const body = el("tbody", {},
      sect(K.t("accounts.login")),
      row(K.t("accounts.role"), K.t("accounts.all.roleHint"), (u) => el("span.pill" + (u.admin ? ".acc" : ".idle"), {}, roleWord(u))),
      row(K.t("accounts.status"), K.t("accounts.all.statusHint"), (u) => el("span.pill" + (u.resetNeeded || u.lockedFor ? ".bad" : u.codeUntil ? ".warn" : ""), {},
        u.resetNeeded ? K.t("accounts.all.lockedReset") : u.lockedFor ? K.t("accounts.state.lockedNow") : u.codeUntil ? K.t("accounts.state.codeWaiting") : K.t("accounts.state.canSignIn"))),
      row(K.t("accounts.lastSignInLabel"), null, (u) => el("small", {}, u.lastSignIn ? ago(u.lastSignIn.at) : K.t("accounts.never"))),
      sect(K.t("accounts.panelGroup")),
      row(K.t("accounts.theirPanel"), K.t("accounts.all.panelHint"), (u) => (u.admin ? el("small", {}, K.t("accounts.allPanels")) : el("select.sm", { "aria-label": K.t("accounts.all.theirPanelOf", { name: u.user }), onchange: (e) => save(u, { panel: e.target.value }) },
        el("option", { value: "" }, K.t("accounts.noPanel")), (U.panels || []).map((x) => el("option", { value: x, selected: u.perms.panel === x }, panelName(x)))))),
      row(K.t("accounts.panelsLabel"), K.t("accounts.all.panelsHint"), (u) => (u.admin ? always() : segCell(u, "panels", [["own", K.t("accounts.all.own")], ["all", K.t("accounts.view.all")]]))),
      sect(K.t("accounts.mayAlso")),
      ...perms.map((x) => row((RIGHT[x.id] || [])[1] || x.text, (RIGHT[x.id] || [])[2] || null, (u) => (u.admin ? always() : x.kind === "bool" ? K.sw(u.perms[x.id] === true, (v) => save(u, { [x.id]: v }), `${u.user}: ${x.text}`)
        : segCell(u, x.id, (x.choices || []).map(([v, n]) => [v, v === "upload" ? K.t("accounts.all.upload") : v === "none" ? K.t("accounts.no") : v === "full" ? K.t("accounts.full") : n]))))),
      el("tr", {}, el("th.ac-rh", { scope: "row" }, el("button.btn.sm", { type: "button", onclick: addDialog }, ic("plus", 14), K.t("accounts.add.title"))),
        users.map((u) => cell(u, el("button.btn.sm.ghost", { type: "button", onclick: () => { pick = u.user; S.setView("accounts", "one"); } }, K.t("accounts.all.open"), ic("arrowR", 13))))));
    const cur = users.find((u) => u.user === pick) || users[0];
    return [el("div.k-tw.ac-mx-wrap", { "data-keep-scroll": "ac-mx" }, el("table.ac-mx", { "aria-label": K.t("accounts.all.label") }, el("thead", {}, head), body)),
      el("p.gf", {}, K.t("accounts.all.foot", { sees: seesSentence(cur) }))];
  }

  // ---------- the page ----------
  function header() {
    return el("div.ph", {}, el("div", {}, el("h1", {}, K.t("accounts.title")),
      el("p", {}, K.t("accounts.intro"))),
    el("span.sp"), phone() ? null : el("div.acts", {}, el("button.btn.pri", { type: "button", onclick: addDialog }, ic("plus", 16), el("span.bl", {}, K.t("accounts.add.button")))),
    phone() ? null : el("span.vr"), phone() ? null : narrowSwitch());
  }
  // below 900 px only One fits: All stays in the switch, dimmed, saying why
  function narrowSwitch() {
    const sw = S.viewSwitch("accounts");
    if (sw && window.innerWidth < 900) for (const b of sw.querySelectorAll("button")) {
      const all = b.textContent.includes(K.t("accounts.view.all"));
      b.classList.toggle("on", !all); b.setAttribute("aria-selected", String(!all));
      if (all) { b.disabled = true; b.title = ""; b.dataset.tip = K.t("accounts.narrowTip"); }
    }
    return sw;
  }
  // ---------- a phone (v2.9.0): the logins as a list; a tap opens the login's sheet ----------
  // From the phone: unlock a login and make a sign-in code — the same requests as on a computer, so the same rules
  // ("confirm it's you" for acting on an admin, five codes an hour, never the owner's or your own). Rights, roles,
  // names, new logins and removing stay on a computer.
  let accSheet = null;
  function drawPhone() {
    const rows = U.users.map((u) => {
      const locked = u.resetNeeded || u.lockedFor;
      const sub = [roleWord(u), locked ? K.t("accounts.locked") : u.codeUntil ? K.t("accounts.codeWaiting")
        : u.lastSignIn ? K.t("accounts.lastSignIn", { when: ago(u.lastSignIn.at) }) : K.t("accounts.neverSignedIn")].join(" · ");
      return el("button.pm-row.acp-row", { type: "button", onclick: () => loginSheet(u.user), "aria-label": K.t(u.user === U.you ? "accounts.rowYou" : "accounts.row", { name: u.user, details: sub }) },
        el("span.pm-i.acp-av", { "aria-hidden": "true" }, u.user.slice(0, 1).toUpperCase()),
        el("span.pm-t", { "aria-hidden": "true" }, el("b", {}, u.user, u.user === U.you ? el("small.acp-you", {}, ` · ${K.t("accounts.you")}`) : null), el("small", {}, sub)),
        locked ? el("span.pill.bad", { "aria-hidden": "true" }, K.t("accounts.locked")) : el("span.pm-c", { "aria-hidden": "true" }, ic("chevR", 16)));
    });
    M.swap(M.$main, el("div.ac-page.acp", { "data-view": "phone" }, header(),
      el("div.pm-grp", {}, rows),
      el("p.pm-note", {}, ic("window", 15), el("span", {}, K.t("accounts.onComputer")))));
    if (accSheet) { const u = U.users.find((x) => x.user === accSheet.user); if (u) accSheet.sh.body.replaceChildren(...sheetBody(u)); else accSheet.sh.close(); }
  }
  function sheetBody(u) {
    const me = u.user === U.you, locked = u.resetNeeded || u.lockedFor, ls = u.lastSignIn;
    const acts = [];
    if (locked && !me) acts.push(el("button.btn.pri.acp-act", { type: "button", onclick: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      const r = await send({ action: "unlock", user: u.user }, K.t("accounts.unlocked", { name: u.user }));
      b.disabled = false; if (r) drawPhone();
    } }, ic("unlock", 16), K.t("accounts.unlock")));
    if (!me && !u.owner) acts.push(el("button.btn.acp-act", { type: "button", onclick: () => codeDialog(u) }, ic("key", 16), K.t("accounts.makeCode")));
    return [
      el("div.ps-kv", {},
        el("span", {}, K.t("accounts.role")), el("b", {}, u.owner ? K.t("accounts.owner") : roleWord(u)),
        el("span", {}, K.t("accounts.status")), el("b", {}, status(u)),
        el("span", {}, K.t("accounts.lastSignInLabel")), el("b", {}, ls ? ago(ls.at) : K.t("accounts.never")),
        ls && ls.agent ? el("span", {}, K.t("accounts.browser")) : null, ls && ls.agent ? el("b", {}, ls.agent) : null),
      acts.length ? el("div.acp-acts", {}, ...acts) : null,
      me ? el("p.ps-ro", {}, K.t("accounts.yourOwn")) : u.owner ? el("p.ps-ro", {}, K.t("accounts.ownerSafe")) : null,
      el("section.ps-sec", {}, el("h3", {}, K.t("accounts.sees")), el("p.acp-sees", {}, seesSentence(u))),
      el("button.btn.acp-act", { type: "button", onclick: async () => { M.timelineWho = u.user; if (accSheet) await accSheet.sh.close(); M.go("health/timeline"); } },
        ic("activity", 16), K.t("accounts.history", { name: u.user })),
      el("p.ps-ro", {}, K.t("accounts.rightsOnComputer")),
    ].filter(Boolean);
  }
  function loginSheet(name) {
    const u = U.users.find((x) => x.user === name); if (!u) return;
    const sh = K.sheet({ title: u.user, sub: u.owner ? K.t("accounts.owner") : roleWord(u), body: sheetBody(u), label: u.user,
      icon: el("span.pm-i.acp-av", { "aria-hidden": "true" }, u.user.slice(0, 1).toUpperCase()), onClose: () => { if (accSheet && accSheet.sh === sh) accSheet = null; } });
    accSheet = { user: u.user, sh };
  }
  function draw() {
    if (!U || S.route().page !== "accounts") return;
    if (phone()) return drawPhone();   // (v2.9.0)
    const u = U.users.find((x) => x.user === pick) || U.users[0];
    const only = U.users.length === 1;
    const body = only ? [K.empty("users", K.t("accounts.only.title"), K.t("accounts.only.text"),
      phone() ? null : el("button.btn.pri", { type: "button", onclick: addDialog }, ic("plus", 15), K.t("accounts.add.title")))]
      : viewNow() === "all" ? allView()
        : [window.innerWidth < 900 ? el("div.ac-narrow", {}, oneView(u), sideCard(u)) : K.sideLayout(oneView(u), sideCard(u))];
    M.swap(M.$main, el("div.ac-page", { "data-view": viewNow() }, header(), ...body));
  }
  async function render() {
    if (!U) M.$main.replaceChildren(S.isPhone() ? el("div.p-skel", { role: "status", "aria-label": K.t("common.loading") }, el("i"), el("i"), el("i")) : el("p.muted", {}, K.t("common.loading")));   // (v2.9.0: a phone, skeleton rows)
    try { await load(); } catch (e) { if (e.message !== "login") M.$main.replaceChildren(K.empty("users", K.t("accounts.cantRead"), e.message || K.t("accounts.tryAgain"))); return; }
    draw();
  }
  S.page("accounts", { title: K.t("accounts.title"), group: "admin", icon: "users", allowed: () => M.isAdmin(), demoHidden: true, words: "logins users permissions admin owner password code unlock",
    views: [["one", K.t("accounts.view.one"), "user", K.t("accounts.view.oneTip")], ["all", K.t("accounts.view.all"), "table", K.t("accounts.view.allTip")]], render: () => render() });
  M.renderAccounts = () => { if (S.route().page === "accounts") render(); };
})();
