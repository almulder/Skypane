// Skypane Manager (/admin, stage 4; /manage until v3.0.1): the house's settings (Hubitat, Protect, UniFi, broker… — no longer in the
// Docker template) and what each Hubitat device is (type, room, PIN rule, fan type; pictures next). Its own username +
// password, made on the first visit (service/manager_auth.py, a signed HttpOnly cookie). Device changes go to
// /api/manage/devices: the bridge rebuilds the house model and every panel reloads once it's idle.
// Everything is built with DOM calls and textContent: names from Hubitat are never parsed as HTML.
// v2.3.0: this file is the core (el, api, sign-in, permissions, dialogs, the unsaved-changes guard) and the pages not
// rebuilt yet (Integrations, Your account); the sidebar, top bar, router and prefs are shell.js; v2.4.0: the Devices page
// is devices.js (this file keeps the house's devices it reads: Manage.devices / loadDevices, used by the other pages).
(function () {
  const $main = document.getElementById("main");
  const $toast = document.getElementById("toast");
  // the words from the string table (Kit.t) — kit.js loads after this file, so only ever called at run time
  const T = (k, v) => (window.Kit ? window.Kit.t(k, v) : k);

  // el("div.cls", {attr…}, child…) — children: nodes or strings (as text); "nav.rail#rail": an id too
  function el(sel, attrs, ...kids) {
    let id = null;
    const [tag, ...cls] = sel.replace(/#([\w-]+)/, (_, x) => { id = x; return ""; }).split(".");
    const n = document.createElement(tag || "div");
    if (id) n.id = id;
    if (cls.length) n.className = cls.join(" ");
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      // (a style through the CSSOM, never as an attribute in markup: the Manager's CSP)
      else if (k === "style") n.style.cssText = v;
      // (a text box's value is its starting one too: the unsaved-changes check compares with it)
      else if (k === "value") { if (tag === "input" || tag === "textarea") n.defaultValue = v; n.value = v; }
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : String(c));
    return n;
  }
  // (pages on plain http have no navigator.clipboard: then the old way, a hidden text box)
  async function copyText(text) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch {}
    const t = el("textarea", { readonly: true, style: "position:fixed;left:-9999px;top:0;opacity:0" });
    t.value = text; document.body.append(t); t.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {}
    t.remove();
    return ok;
  }
  let toastTimer = null;
  function toast(text, bad) {
    $toast.textContent = text;
    $toast.className = "show" + (bad ? " bad" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.className = ""; }, bad ? 5000 : 2500);
  }
  // what a refused change was, for "Your account isn't allowed to …" (the server only says "not-allowed")
  const NOT_ALLOWED = [[/^\/api\/manage\/(settings|mqtt)/, "manage.notAllowed.settings"], [/^\/api\/manage\/never/, "manage.notAllowed.never"],
    [/^\/api\/manage\/groups/, "manage.notAllowed.groups"], [/^\/api\/manage\/guest-wifi/, "manage.notAllowed.guest"],
    [/^\/api\/manage\/users/, "manage.notAllowed.users"], [/^\/api\/manage\/panels\/?$/, "manage.notAllowed.panels"],
    [/^\/api\/manage\/panels\//, "manage.notAllowed.panel"], [/^\/api\/manage\/(devices|rooms|cameras)/, "manage.notAllowed.devices"],
    [/^\/api\/manage\/pictures/, "manage.notAllowed.pictures"], [/^\/api\/manage\/cards/, "manage.notAllowed.cards"],
    [/^\/api\/manage\/templates/, "manage.notAllowed.templates"], [/^\/api\/manage\/art-sources/, "manage.notAllowed.artSources"]];
  const notAllowed = (path) => T((NOT_ALLOWED.find(([re]) => re.test(path)) || [, "manage.notAllowed.other"])[1]);
  async function api(path, body) {
    const r = await fetch(path, body ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    // (unused for 30 minutes, a new password, renamed, removed, signed out elsewhere: the server doesn't say which)
    if (r.status === 401 && j.error === "login") {
      // (v2.7.0) the layout builder with unsaved work: sign in again over it — the work stays, the same request again
      if (keepBuilder()) {
        if (await reauth()) return api(path, body);
        throw new Error("login");   // (not now: the builder and its layout stay; Save asks again)
      }
      showLogin(T("manage.signedOutAgain")); throw new Error("login");
    }
    // (the plain words in place of the code; `refused` keeps the code for whoever needs it)
    // (a page to look at only: the house's lists need a panel of your own, or the matching permission)
    // (the admin may have taken a permission away meanwhile: the menu is read again, so it offers only what's left)
    if (r.status === 403 && j.error === "not-allowed") meAgain();
    if (r.status === 403 && j.error === "not-allowed") return { status: r.status, ...j, refused: "not-allowed",
      error: body ? notAllowed(path.split("?")[0]) : T("manage.cantSee") };
    return { status: r.status, ...j };
  }

  // ---------- who is signed in (GET /api/manage/login): the admin may do everything, a user what the admin ticked ----------
  // ME.perms (service/manager_auth.py PERMISSIONS): { panel: its own panel ("" none), panels: "own" | "all", guest_wifi,
  // backgrounds: "none" | "upload" | "full", icons, cards, devices, cameras }
  let ME = null;   // { user, role, admin, perms, permissions }
  const isAdmin = () => !!(ME && ME.admin);
  // the public demo (the demo branch's service/demo.py: ME.demo): no logins, no house integrations — shell.js hides those pages
  const isDemo = () => !!(ME && ME.demo);
  const perm = (k) => (ME && ME.perms ? ME.perms[k] : undefined);
  const seesPanel = (p) => isAdmin() || perm("panels") === "all" || (!!perm("panel") && String(p).toLowerCase() === perm("panel"));
  // can("devices") — a yes / no permission; can("backgrounds") — upload only or full; can("panels") — it has a panel;
  // can(null, panelId) / can("panels", panelId) — it sees (and so manages) that panel
  const can = (k, panel) => {
    if (!ME) return false;
    if (ME.admin) return true;
    if (k === "backgrounds") { if (!["upload", "full"].includes(perm("backgrounds"))) return false; }
    else if (k === "panels") { if (panel == null) return perm("panels") === "all" || !!perm("panel"); }
    else if (k && perm(k) !== true) return false;
    return panel == null || seesPanel(panel);
  };
  // "full" for the admin; a user's own choice otherwise
  const level = (k) => (isAdmin() ? "full" : perm(k));
  async function loadMe() {
    const s = await api("/api/manage/login");
    ME = s.in ? s : null;
    return s;
  }
  let meAsk = null;   // (one question at a time)
  function meAgain() {
    if (!ME || meAsk) return meAsk;
    // (the rail and the menu: only what's left; the page on screen not allowed any more → this login's first — shell.js)
    return (meAsk = loadMe().then(() => { if (ME && window.Shell) Shell.permsChanged(); })
      .catch(() => {}).finally(() => { meAsk = null; }));
  }

  // ---------- login (its own username + password, made on the first visit) ----------
  // (the answers are the same for every name, real or not: the page can't tell the admin from a user here)
  const RESET_MSG = () => T("manage.login.resetNeeded");
  // the reset command, folded away: for the owner, or when nobody else can help (a block to copy, not a sentence)
  function resetCommand() {
    const cmd = "docker exec -it <your Skypane container> python service/reset_login.py --user <your name>";   // i18n-ok (a command to copy)
    return el("details.rs-cmd", {}, el("summary", {}, T("manage.reset.nobody")),
      el("p.muted", {}, T("manage.reset.prints")),
      el("pre", {}, el("code", {}, cmd)),
      el("button.ghost.small", { type: "button", onclick: async () => toast((await copyText(cmd)) ? T("manage.reset.copied") : T("manage.reset.copyFailed")) }, T("manage.copy")));
  }
  const LOGIN_ERR_KEY = { wrong: "manage.login.wrong", locked: "manage.login.locked",
    "reset-needed": "manage.login.resetNeeded", exists: "manage.login.exists", "no-login": "manage.login.noLogin" };
  const loginErr = (e) => (Object.prototype.hasOwnProperty.call(LOGIN_ERR_KEY, e) ? T(LOGIN_ERR_KEY[e]) : "");
  const lockText = (r) => (r.resetNeeded ? RESET_MSG() : r.lockedFor
    ? T("manage.login.lockedFor", { n: Math.ceil(r.lockedFor / 60) }) : "");
  // a wrong password: how many tries are left before the next lock, and how long that lasts (or: until it's opened)
  const wrongText = (r) => {
    const n = r.triesLeft;
    if (!Number.isInteger(n) || n <= 0) return loginErr("wrong");
    return r.nextLock ? T("manage.login.wrongLeftLock", { n, m: Math.round(r.nextLock / 60) }) : T("manage.login.wrongLeftOpen", { n });
  };
  // the server's reasons for a new password / name, in plain words
  const plainReason = (e) => {
    const m = /^password: (\d+) to (\d+)/.exec(e || "");
    return m ? T("manage.reason.password", { min: m[1], max: m[2] })
      : /^username:/.test(e || "") ? T("manage.reason.username") : e;
  };
  const field = (label, attrs) => { const i = el("input", attrs); return [el("label.lbl", {}, label, i), i]; };
  // signed out while the builder holds unsaved work: the same login signs in again in a box over it (one box at a time)
  let reauthing = null, reauthDeclined = false;
  function reauth() {
    if (reauthing) return reauthing;
    reauthing = new Promise((done) => {
      const name = (ME && ME.user) || "";
      const pass = el("input", { type: "password", autocomplete: "current-password", maxlength: "128", "aria-label": T("guest.password") });
      const err = el("p.err");
      let close = null;
      // (signed in: who this login is and may do, read again — the shell stays as it is, no sign-in page; "Not now":
      // the background polls stay quiet until the next save asks again)
      const finish = (v) => { close(); reauthing = null; reauthDeclined = !v; if (v) meAgain(); done(v); };
      const go = el("button.btn.pri", { type: "submit" }, T("manage.reauth.go"));
      const form = el("form.modal.small.pn-ask", { role: "dialog", "aria-labelledby": "reauth-h", onsubmit: async (e) => {
        e.preventDefault(); err.textContent = ""; go.disabled = true;
        try {
          const r = await fetch("/api/manage/login", { method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "login", user: name, password: pass.value }) });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j.ok) return finish(true);
          err.textContent = lockText(j) || (j.error === "wrong" ? wrongText(j) : loginErr(j.error) || T("manage.reauth.notIn"));
          pass.value = ""; pass.focus();
        } catch { err.textContent = T("manage.noService"); } finally { go.disabled = false; }
      } }, el("h2", { id: "reauth-h" }, T("manage.reauth.title")),
      el("p", {}, T("manage.reauth.text", { name })),
      el("label.pn-fld", {}, el("b", {}, T("guest.password")), pass), err,
      el("div.pn-ask-acts", {}, el("button.btn", { type: "button", onclick: () => finish(false) }, T("manage.notNow")), go));
      const shade = el("div.modal-bg.top", {}, form);
      close = dialog(shade, pass, () => finish(false));
    });
    return reauthing;
  }
  // the version running: the numbered release and the container's image tag ("v3.0.0 · sha-1234567"), in the header
  // and on the sign-in card
  let VERSION = "";
  fetch("/api/health", { cache: "no-store" }).then((r) => r.json()).then((h) => {
    const rel = typeof h.release === "string" && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h.release) ? `v${h.release}` : "";
    // (the build tag once: "v2.4.0 · sha-1234567", never "v2.4.0 · 2.4.0" when the image tag is the release itself)
    VERSION = [rel, typeof h.version === "string" && h.version !== h.release && h.version !== rel ? h.version.slice(0, 40) : ""].filter(Boolean).join(" · ");
    document.querySelectorAll(".ver").forEach((v) => { v.textContent = VERSION; });
  }).catch(() => {});
  const RIDGES = '<svg viewBox="0 0 1280 370" preserveAspectRatio="none"><path d="M0 170 L180 60 L300 140 L460 30 L640 150 L780 90 L960 170 L1110 70 L1280 140 L1280 370 L0 370Z" fill="#6b46c9"/>'
    + '<path d="M0 250 L160 170 L360 240 L560 150 L760 250 L980 180 L1280 240 L1280 370 L0 370Z" fill="#3b2286"/><path d="M0 320 L240 260 L520 320 L820 270 L1280 320 L1280 370 L0 370Z" fill="#1d1050"/></svg>';
  // name: typed in already (the login just made); ok: the message isn't a refusal ("Signed out.")
  // (v2.7.2) the builder holds unsaved work, or its sign-in box is up: every "signed out" — a save, a background poll —
  // goes to that one box over the builder; the sign-in page never replaces it
  const keepBuilder = () => !!reauthing || !!(ME && bld.open() && window.Manage.builderDirty && window.Manage.builderDirty());
  function showLogin(msg, setup, name, ok) {
    if (msg && keepBuilder() && !setup && !ok) { reauth(); return; }
    if (window.Shell) Shell.stop();
    resetState();   // (whoever signs in next starts fresh)
    const err = el("div.err" + (ok ? ".ok" : ""), {}, msg || "");
    const [uRow, user] = field(T("manage.login.username"), { type: "text", autocomplete: "username", maxlength: "40", autocapitalize: "none" });
    const [pRow, pass] = field(T("guest.password"), { type: "password", autocomplete: setup ? "new-password" : "current-password", maxlength: "128" });
    const [p2Row, pass2] = field(T("manage.login.passwordAgain"), { type: "password", autocomplete: "new-password", maxlength: "128" });
    const go = el("button", { type: "submit" }, setup ? T("manage.login.create") : T("manage.login.signIn"));
    const form = el("form.signin", { onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = ""; err.className = "err";
      if (!user.value.trim()) { err.textContent = T("manage.login.typeName"); user.focus(); return; }
      if (setup && pass.value !== pass2.value) { err.textContent = T("manage.login.notSame"); return; }
      if (setup && pass.value.length < 8) { err.textContent = T("manage.login.atLeastEight"); return; }
      go.disabled = true;
      try {
        const r = await api("/api/manage/login", { action: setup ? "setup" : "login", user: user.value.trim(), password: pass.value });
        if (r.error === "data-folder") return showDataFolder();   // (v3.0.0: nothing can be saved — not a wrong try)
        if (r.ok) {
          if (setup) return showLogin(T("manage.login.created"), false, user.value.trim(), true);   // (log in once with it)
          return start();
        }
        err.textContent = lockText(r) || (r.error === "wrong" ? wrongText(r) : loginErr(r.error) || plainReason(r.error) || T("manage.notAccepted"));
        if (r.resetNeeded) { go.hidden = true; return; }   // (stays disabled: nothing to try until the reset)
        if (r.error === "exists") setup = false;
        pass.value = ""; pass2.value = ""; pass.focus();
      } catch { err.textContent = T("manage.noService"); }
      finally { if (!go.hidden) go.disabled = false; }
    } },
    // the brand on top: the logo, the wordmark (Sky | pane), what it is
    el("div.brand", {}, el("img", { src: "../assets/skypane.svg", alt: "" }),   // i18n-ok
      el("div.wm", { "aria-label": "Skypane" }, el("span", {}, "Sky"), el("i.wm-bar"), el("span.wm-b", {}, "pane")),   // i18n-ok (the wordmark)
      el("div.tagline", {}, T("manage.login.tagline"))),
    setup ? el("h2", {}, T("manage.login.createTitle")) : null,
    setup ? el("p.muted", {}, T("manage.login.firstVisit")) : null,
    uRow, pRow, setup ? p2Row : "", go, el("div.hint", {}, T("manage.login.hint")),
    el("div.hint.lg-lang", {}, T("manage.login.language")), err,   // (v3.0.0: one language so far — said, not a one-choice list)
    // (a one-time sign-in code — from an admin, or the reset command: the login's new password, set here)
    setup ? null : el("button.linkish", { type: "button", onclick: () => showReset(user.value.trim()) }, T("manage.reset.title")),
    el("small.ver", {}, VERSION));
    if (msg === RESET_MSG()) { go.hidden = true; go.disabled = true; }   // (nothing to try until the reset)
    showScene(form);
    if (name) user.value = name;
    (name ? pass : user).focus();
  }
  // a one-time sign-in code (an admin made it in Accounts, or the reset command printed it; an hour, 5 tries): the
  // login's name + the code + its new password → signed in
  function showReset(name) {
    if (window.Shell) Shell.stop();
    const err = el("div.err");
    const [uRow, user] = field(T("manage.login.username"), { type: "text", autocomplete: "username", maxlength: "40", autocapitalize: "none" });
    if (name) user.value = name;
    const [cRow, code] = field(T("manage.reset.code"), { type: "text", autocomplete: "one-time-code", maxlength: "20", autocapitalize: "characters",
      placeholder: "XXXX-XXXX-XXXX", spellcheck: "false" });   // i18n-ok (the code's shape)
    const [pRow, pass] = field(T("manage.pw.new"), { type: "password", autocomplete: "new-password", maxlength: "128" });
    const [p2Row, pass2] = field(T("manage.pw.newAgain"), { type: "password", autocomplete: "new-password", maxlength: "128" });
    const go = el("button", { type: "submit" }, T("manage.reset.go"));
    const form = el("form.signin", { onsubmit: async (e) => {
      e.preventDefault(); err.textContent = "";
      if (!user.value.trim()) { err.textContent = T("manage.reset.typeName"); user.focus(); return; }
      if (!code.value.trim()) { err.textContent = T("manage.reset.typeCode"); return; }
      if (pass.value !== pass2.value) { err.textContent = T("manage.login.notSame"); return; }
      if (pass.value.length < 4) { err.textContent = T("manage.reset.atLeastFour"); return; }
      go.disabled = true;
      try {
        const r = await api("/api/manage/login", { action: "reset", user: user.value.trim(), code: code.value.trim(), password: pass.value });
        if (r.error === "data-folder") return showDataFolder();
        if (r.ok) { toast(T("manage.reset.done")); return start(); }
        err.textContent = r.error === "wrong" ? T("manage.reset.wrong") : r.error === "slow-down" ? T("manage.reset.slowDown")
          : plainReason(r.error) || T("manage.notAccepted");
      } catch { err.textContent = T("manage.noService"); }
      finally { go.disabled = false; }
    } },
    el("div.brand", {}, el("img", { src: "../assets/skypane.svg", alt: "" }),   // i18n-ok
      el("div.wm", { "aria-label": "Skypane" }, el("span", {}, "Sky"), el("i.wm-bar"), el("span.wm-b", {}, "pane"))),   // i18n-ok (the wordmark)
    el("h2", {}, T("manage.reset.title")),
    el("p.muted", {}, T("manage.reset.intro")),
    uRow, cRow, pRow, p2Row, go, err, resetCommand(),
    el("button.linkish", { type: "button", onclick: () => showLogin("") }, T("manage.reset.back")));
    showScene(form);
    (name ? code : user).focus();
  }
  // (v3.0.0) the data folder can't be saved to (/api/health dataWritable false): the setup error, no sign-in form —
  // a login can't be made or checked, and a "wrong" try would only end in "locked"
  function showDataFolder() {
    if (window.Shell) Shell.stop();
    showScene(el("div.signin", { role: "alert" },
      el("div.brand", {}, el("img", { src: "../assets/skypane.svg", alt: "" }),   // i18n-ok
        el("div.wm", { "aria-label": "Skypane" }, el("span", {}, "Sky"), el("i.wm-bar"), el("span.wm-b", {}, "pane"))),   // i18n-ok (the wordmark)
      el("h2", {}, T("manage.dataFolder.title")),
      el("p", {}, T("manage.dataFolder.text")),
      el("p.muted", {}, T("manage.dataFolder.fix")),
      el("button", { type: "button", onclick: () => location.reload() }, T("manage.dataFolder.reload")),
      el("small.ver", {}, VERSION)));
  }
  // (v3.0.0) "Save and restart": a box over the page until Skypane answers again — a new server process (/api/health
  // "boot" changed) — then the page reloads. before = the boot id read just before the save.
  const bootId = () => fetch("/api/health", { cache: "no-store" }).then((r) => r.json()).then((h) => h.boot || "").catch(() => "");
  async function waitRestart(before) {
    const text = el("p", {}, T("manage.restart.text"));
    const box = el("div.modal-bg.top", {}, el("div.modal.small.pn-ask", { role: "alertdialog", "aria-modal": "true", "aria-labelledby": "rs-wait-h", "aria-live": "polite" },
      el("h2", { id: "rs-wait-h" }, T("manage.restart.title")), text));
    document.body.append(box);
    const t0 = Date.now();
    let down = false, slow = false;
    while (Date.now() - t0 < 180000) {
      await new Promise((ok) => setTimeout(ok, 1000));
      if (!slow && Date.now() - t0 > 30000) { slow = true; text.textContent = T("manage.restart.slow"); }
      const now = await bootId();
      if (!now) { down = true; continue; }
      if ((before && now !== before) || (!before && down)) { reloading = true; location.reload(); return; }
    }
    text.textContent = T("manage.restart.gone");
  }
  // (v2.9.3) "Buy me a coffee": the author's page, a plain link in a new tab (never the panels; no script, no
  // tracking, nothing sent — the browser just opens the page). The words match the demo's.
  const COFFEE = "https://buymeacoffee.com/almulder";
  const coffeeLink = (sel = "a.coffee", attrs = {}) => el(sel, { href: COFFEE, target: "_blank", rel: "noopener noreferrer",   // i18n-ok
    "aria-label": window.Kit ? window.Kit.t("coffee.aria") : null, ...attrs },
    window.Kit ? window.Kit.icon("coffee", 16) : null, window.Kit ? window.Kit.t("coffee.link") : "Buy me a coffee");   // i18n-ok (before the table can answer)
  function showScene(form) {
    // the panel's night sky behind it (design B, docs/branding/login-b.png): moon, stars, three ridges of mountains
    const scene = el("div.login-scene", { "aria-hidden": "true" }, el("i.moon"),
      ...[[12, 10], [30, 22], [48, 8], [86, 30], [62, 26], [20, 34], [92, 12], [6, 40]].map(([l, t]) => el("i.star", { style: `left:${l}%;top:${t}%` })));
    scene.insertAdjacentHTML("beforeend", RIDGES);   // (our own fixed drawing)
    document.body.classList.add("at-login");
    $main.replaceChildren(scene, el("div.signin-wrap", {}, form,
      el("p.lg-coffee", {}, coffeeLink("a.coffee"), el("small", {}, window.Kit ? window.Kit.t("coffee.why") : ""))));   // (v2.9.3)
  }
  // Sign out (the avatar menu, search): ends the Manager session — after the unsaved-changes question
  async function logout() {
    if (!(await leaveOk())) return;
    if (window.Shell) await window.Shell.flushPrefs();   // (a theme picked just now: on the server before the session ends)
    try { await api("/api/manage/login", { action: "logout" }); } catch {}
    // (signed out on purpose: this login's layout drafts go too — kept only for a session that ended by itself)
    try { const pre = `skypane.draft:${((ME && ME.user) || "").toLowerCase()}:`; if (ME && ME.user) for (const k of Object.keys(localStorage)) if (k.startsWith(pre)) localStorage.removeItem(k); } catch {}
    try { if (ME && ME.user) localStorage.removeItem(`skypane.search.recent:${ME.user.toLowerCase()}`); } catch {}   // (v2.9.0: the phone's recent searches go with a sign-out)
    ME = null;
    // (whoever signs in next starts on its own first page, not on this login's last address)
    history.replaceState(null, "", location.pathname + location.search);
    showLogin(T("manage.signedOut"), false, "", true);
  }

  // ---------- a new sign-in starts fresh: every page's kept state goes (the next login may see other things) ----------
  const resets = [];   // (the other files' own: Manage.onReset(fn))
  function resetState() {
    D = null; dirty = null; delete $main.dataset.page;
    for (const f of resets) { try { f(); } catch {} }
  }

  // ---------- a page drawn again (a save, a refresh): the focused control and the scroll position stay ----------
  // (the same control by a stable key: data-fk, its aria-label, its label's words, a button's words)
  const FOCUSABLE = "button, input, select, textarea, summary, a[href]";   // i18n-ok
  const focusKey = (n) => {
    if (!n || !n.matches || !n.matches(FOCUSABLE)) return null;
    const lab = n.closest("label"), words = lab ? lab.textContent.trim() : "";
    return n.dataset.fk || n.getAttribute("aria-label") || (words ? `${n.tagName}:${words}` : "")
      || (n.tagName === "BUTTON" ? `B:${n.textContent.trim()}` : "") || null;
  };
  // (a box with its own scrollbar — data-keep-scroll="its name", e.g. the device editor — stays where it was scrolled to;
  // the window's scroll only for the same page drawn again: a page opened from another one starts at the top)
  function swap(box, ...kids) {
    const a = document.activeElement, k = box.contains(a) ? focusKey(a) : null, y = window.scrollY, tab = window.Manage.tab();
    const same = box !== $main || box.dataset.page === tab;
    const tops = new Map([...box.querySelectorAll("[data-keep-scroll]")].map((x) => [x.dataset.keepScroll, x.scrollTop]));
    box.replaceChildren(...kids);
    if (box === $main) box.dataset.page = tab;
    if (k) { const n = [...box.querySelectorAll(FOCUSABLE)].find((x) => !x.disabled && focusKey(x) === k); if (n) n.focus({ preventScroll: true }); }
    if (same) for (const x of box.querySelectorAll("[data-keep-scroll]")) if (tops.has(x.dataset.keepScroll)) x.scrollTop = tops.get(x.dataset.keepScroll);
    if (box === $main) window.scrollTo(0, same ? y : 0);
  }

  // ---------- a dialog over the page (pictures, pickers, a password, the AI prompt): focus goes into it and back to
  // where it was after; Esc closes the top one; Tab goes round inside. dialog(shade, first?, onEsc?) → close() ----------
  const dialogs = [];
  document.addEventListener("keydown", (e) => {
    while (dialogs.length && !dialogs[dialogs.length - 1].shade.isConnected) dialogs.pop();   // (removed some other way)
    const d = dialogs[dialogs.length - 1];
    if (!d || document.body.classList.contains("hp-open")) return;   // (Help over it has its own keys)
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); d.esc(); }
    else if (e.key === "Tab") {
      const f = [...d.shade.querySelectorAll(FOCUSABLE)].filter((x) => !x.disabled && x.offsetParent !== null);
      const i = f.indexOf(document.activeElement);
      if (f.length && (i < 0 || (e.shiftKey ? i === 0 : i === f.length - 1))) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
    }
  }, true);
  function dialog(shade, first, onEsc) {
    const prev = document.activeElement, box = shade.querySelector(".modal");
    if (box) box.setAttribute("aria-modal", "true");
    const d = { shade, esc: () => (onEsc ? onEsc() : close()) };
    function close() {
      shade.remove();
      const i = dialogs.indexOf(d); if (i >= 0) dialogs.splice(i, 1);
      if (prev && prev.isConnected && prev.focus) prev.focus({ preventScroll: true });
    }
    if (!shade.isConnected) document.body.append(shade);
    dialogs.push(d);
    const f = first || shade.querySelector(FOCUSABLE);
    if (f) f.focus();
    return close;
  }

  // ---------- leaving the layout builder with unsaved changes: Save / Cancel / Leave without saving ----------
  // builder.js keeps its own state; what it offers today is M.leaveBuilder() (true = closed, false = stayed) which
  // asks with the browser's confirm(). Until it has a quiet way in (M.builderDirty / M.saveBuilder /
  // M.leaveBuilder(true)), its confirm() is answered here for it: "no" = it has unsaved changes, so it stays open.
  const bld = {
    open: () => document.body.classList.contains("bld-open") && !!window.Manage.leaveBuilder,
    // close it if nothing is unsaved (true), else leave it open (false)
    tryClose() {
      const M = window.Manage;
      if (M.builderDirty) return M.builderDirty() ? false : (M.leaveBuilder(true), true);
      const c = window.confirm; window.confirm = () => false;
      try { return M.leaveBuilder() !== false; } finally { window.confirm = c; }
    },
    discard() {
      const M = window.Manage, c = window.confirm; window.confirm = () => true;
      try { M.leaveBuilder(true); } finally { window.confirm = c; }
    },
    // press its Save; true once it saved (it then closes), false when it said no (its toast says why)
    async save() {
      const M = window.Manage;
      if (M.saveBuilder) { if (!(await M.saveBuilder())) return false; this.tryClose(); return true; }
      const b = [...document.querySelectorAll(".bld-top button")].find((x) => x.textContent.trim() === T("manage.save"));
      if (!b) return false;
      $toast.className = ""; b.click();
      for (let i = 0; i < 50; i++) {   // (up to 15 s: the server's answer)
        await new Promise((r) => setTimeout(r, 300));
        if ($toast.classList.contains("bad")) return false;
        if (this.tryClose()) return true;
      }
      return false;
    },
  };
  // the question itself: a small dialog (not the browser's) → "save" | "cancel" | "leave"
  // (opts: another title / text, and save: false — a page form whose own Save button keeps the changes)
  function askUnsaved(opts = {}) {
    return new Promise((done) => {
      const prev = document.activeElement;
      // (v2.8.0, gate 1: a phone opens it through Manage.dialog — phone.js gives it a history entry, so Back = Cancel)
      const viaDialog = document.documentElement.classList.contains("phone") && window.Manage.dialog !== dialog;
      let closeD = null, over = false;
      const end = (v) => {
        if (over) return; over = true;
        if (closeD) closeD(); else { shade.remove(); document.removeEventListener("keydown", key, true); if (prev && prev.focus) prev.focus(); }
        done(v);
      };
      const key = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end("cancel"); }
        else if (e.key === "Tab") {   // (focus stays in the dialog)
          const bs = [...shade.querySelectorAll("button")], i = bs.indexOf(document.activeElement);
          e.preventDefault(); bs[(i + (e.shiftKey ? bs.length - 1 : 1)) % bs.length].focus();
        }
      };
      const saveB = opts.save === false ? null : el("button", { type: "button", onclick: () => end("save") }, T("manage.save"));
      const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) end("cancel"); } },
        el("div.modal.small.unsaved", { role: "alertdialog", "aria-modal": "true", "aria-labelledby": "unsaved-h", "aria-describedby": "unsaved-p" },
          el("h2", { id: "unsaved-h" }, opts.title || T("manage.unsaved.title")),
          el("p.muted", { id: "unsaved-p" }, opts.text || T("manage.unsaved.text")),
          el("div.unsaved-acts", {}, saveB,
            el("button.ghost", { type: "button", onclick: () => end("cancel") }, T("control.cancel")),
            el("button.ghost", { type: "button", onclick: () => end("leave") }, T("manage.unsaved.leave")))));
      if (viaDialog) { closeD = window.Manage.dialog(shade, saveB || shade.querySelector("button"), () => end("cancel")); return; }
      document.body.append(shade);
      document.addEventListener("keydown", key, true);
      (saveB || shade.querySelector("button")).focus();
    });
  }
  // a page form with typed changes its own Save button keeps (Groups & rules, rooms of your own, cameras, Integrations):
  // an element with data-unsaved="its name" around the fields marks them (Integrations sets `dirty` itself; data-save = its
  // button's words when that isn't "Save")
  // (changed = a field isn't what it was drawn with: typed and erased again is no change; saved: the page is drawn again)
  let dirty = null;
  const changedIn = (f) => [...f.querySelectorAll("input, select, textarea")].some((i) => (i.type === "checkbox" || i.type === "radio" ? i.checked !== i.defaultChecked
    : i.tagName === "SELECT" ? i.selectedIndex !== Math.max(0, [...i.options].findIndex((o) => o.defaultSelected)) : i.value !== i.defaultValue));
  const dirtyForm = () => (dirty && dirty.isConnected ? dirty : [...document.querySelectorAll("[data-unsaved]")].find(changedIn) || null);
  const isDirty = () => !!dirtyForm();
  // (v3.0.0) reloading = the page reloads itself after a save (Save and restart): never "Leave site?" then
  let reloading = false;
  window.addEventListener("beforeunload", (e) => { if (!reloading && isDirty()) { e.preventDefault(); e.returnValue = ""; } });
  // (v3.0.0) a form just saved: what it shows now is what's saved — its fields' "drawn with" values follow
  const markSaved = (root) => { if (!root) return;
    for (const i of root.querySelectorAll("input, select, textarea")) {
      if (i.type === "checkbox" || i.type === "radio") i.defaultChecked = i.checked;
      else if (i.tagName === "SELECT") for (const o of i.options) o.defaultSelected = o.selected;
      else i.defaultValue = i.value;
    }
    if (dirty === root || (dirty && root.contains(dirty))) dirty = null; };
  // true = go on (the builder is closed, or wasn't open); false = stay where we are
  async function leaveOk() {
    const form = dirtyForm();
    if (form) {
      const what = form.dataset.unsaved || T("manage.unsaved.thisPage");
      const pick = await askUnsaved({ save: false, title: T("manage.unsaved.leaveTitle"),
        text: form.dataset.save ? T("manage.unsaved.formButton", { what, button: form.dataset.save }) : T("manage.unsaved.formSave", { what }) });
      if (pick === "cancel") return false;
      dirty = null;
    }
    if (!bld.open() || bld.tryClose()) return true;
    const pick = await askUnsaved();
    if (pick === "cancel") return false;
    if (pick === "save") return bld.save();
    bld.discard();
    return true;
  }

  // (the pages that are left now: unsaved changes dropped — the permissions changed, shell.js permsChanged)
  function discardUnsaved() { dirty = null; if (bld.open()) bld.discard(); }

  // signed in: the house's devices first (the pages that use them), then the shell opens the page in the address or
  // this login's first one
  async function start() {
    try { await loadMe(); } catch { return; }
    if (!ME) return showLogin("");
    await loadLanguage();   // (v3.0.0: this login's language file, before anything is drawn)
    document.body.classList.remove("at-login");
    $main.replaceChildren(el("div.p-skel.boot-skel", { role: "status", "aria-label": T("manage.loadingManager") }, el("i"), el("i"), el("i")));   // (the sign-in form goes at once, its password too; v2.8.0: skeleton rows)
    // (v2.8.0: a phone loads none of them here — each page asks for what it needs, Manage.need)
    await Promise.all([onPhone() ? null : loadHeavy(), (can("devices") || can("panels")) ? loadDevices() : null]).catch(() => null);
    if (!ME) return;
    for (const f of signins) { try { f(); } catch {} }
    window.Shell.start();
  }
  // (v2.7.2) the big scripts — the animated drawings (~530 KB), the layout builder (~230 KB) and the files that need
  // them — come only after a sign-in: the sign-in page loads just the core. In this order, each after the one before
  // (same origin: the page's CSP, script-src 'self', allows them).
  // (v3.0.0) the panel's own string table and T() first: the builder's preview (roomlayoutG.js) and the drawings use them
  const LAZY = ["../layouts/v4/shared/strings/en.js", "../layouts/v4/shared/strings.js", "../layouts/v4/shared/art-extra.js",   // i18n-ok
    "../layouts/v4/shared/roomlayoutG.js", "../layouts/v4/shared/motions.js", "pictures.js", "builder.js"];   // i18n-ok
  // (v2.8.0) Manage.need(name) → a promise once those scripts are in: "art" (the drawings and the picture picker —
  // Backgrounds, Icons, Cards, a device's Picture) or "builder" (all of them). A computer still loads everything after
  // a sign-in (loadHeavy, as in v2.7.2); a phone only what the page it opens needs. Each script once, in this order.
  const NEED = { art: () => LAZY.slice(0, LAZY.indexOf("pictures.js") + 1), builder: () => LAZY };   // (read when asked: a language file may join LAZY)
  const scripts = new Map();
  let chain = Promise.resolve();
  function load1(src) {
    if (!scripts.has(src)) {
      chain = chain.then(() => new Promise((ok) => {
        const s = document.createElement("script");
        s.src = src; s.async = false;
        s.onload = ok; s.onerror = () => { console.warn(`Skypane: ${src} didn't load`); scripts.delete(src); s.remove(); ok(); };   // (asked again next time)
        document.head.append(s);
      }));
      scripts.set(src, chain);
    }
    return scripts.get(src);
  }
  const need = (name) => Promise.all((NEED[name] ? NEED[name]() : []).map(load1)).then(() => undefined);
  // (v3.0.0) the login's language (its prefs "lang"): English is always loaded (strings/en.js, the fallback for any
  // word a translation hasn't got yet); another language's file — strings/<code>.js, and the panel's own for the
  // builder's preview — is added before the first page is drawn. Changing it reloads the Manager.
  const LANG_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
  async function loadLanguage() {
    let lang = "en";
    try { const r = await fetch("/api/manage/prefs", { cache: "no-store" }); if (r.ok) lang = String((await r.json()).lang || "en"); } catch { /* (English) */ }
    document.documentElement.lang = LANG_RE.test(lang) ? lang : "en";
    if (lang === "en" || !LANG_RE.test(lang)) return;
    await load1(`strings/${lang}.js`);
    LAZY.splice(1, 0, `../layouts/v4/shared/strings/${lang}.js`);   // (after the panel's English, before T())
  }
  const loadHeavy = () => need("builder");
  const onPhone = () => document.documentElement.classList.contains("phone");
  // (a phone turned into a computer's layout — a tablet rotated, a window made wider: the rest comes now)
  try { window.matchMedia("(max-width: 699px) and (pointer: coarse), (max-height: 500px) and (pointer: coarse)").addEventListener("change", (e) => { if (!e.matches && ME) loadHeavy(); }); } catch {}   // i18n-ok
  const signins = [];   // (the other files' own: Manage.onSignIn(fn) — the health pill starts asking)

  // ---------- Integrations (the menu's Admin part; tab "settings"): how Skypane reaches the hub, the broker, the
  // cameras' video, Protect, UniFi, the music page, the calendars… The admin only. ----------
  async function renderSettings() {
    $main.replaceChildren(el("p.muted", {}, T("common.loading")));
    const general = [el("h2.spage", { "data-unsaved": T("manage.settings.unsavedName") }, T("shell.page.integrations"))];
    if (!isAdmin()) return $main.replaceChildren(...general, el("div.card", {}, el("p.muted", {}, T("manage.settings.adminOnly"))));
    let S, M;
    try { S = await api("/api/manage/settings"); M = await api("/api/manage/mqtt"); } catch { return; }
    if (window.Manage.tab() !== "settings") return;   // (another page was opened while this one loaded)
    const groups = new Map();
    for (const f of S.fields || []) { if (!groups.has(f.group)) groups.set(f.group, []); groups.get(f.group).push(f); }
    const pending = {};   // key -> value ("" = clear)
    const save = el("button", { disabled: true, onclick: async () => {
      save.disabled = true;
      try {
        const before = await bootId();
        const r = await api("/api/manage/settings", { set: pending });
        if (!r.ok) { toast(r.error || T("manage.notSaved"), true); save.disabled = false; return; }
        if (dirty === general[0]) dirty = null;
        markSaved($main);
        if (r.restarting) return waitRestart(before);   // (v3.0.0: a box until Skypane is back, then a reload)
        toast(T("manage.settings.saved"));
        setTimeout(() => { if (window.Manage.tab() === "settings") renderSettings(); }, 8000);
      } catch (e) { if (e.message !== "login") toast(T("manage.noService"), true); save.disabled = false; }
    } }, T("manage.settings.save"));
    // (typed and erased again: no change; anything pending: leaving the page asks first)
    const mark = (k, v, was) => {
      if (was !== undefined && v === was) delete pending[k]; else pending[k] = v;
      save.disabled = !Object.keys(pending).length;
      if (!save.disabled) dirty = general[0]; else if (dirty === general[0]) dirty = null;
    };
    // (v2.4.1: each field named by its label — for / id — and described by its hint, for a screen reader)
    const named = (f, input) => {
      const id = `set-${String(f.key).replace(/[^\w-]/g, "-")}`;
      input.id = id; input.setAttribute("aria-describedby", `${id}-h`);
      return el("label.lbl", { for: id }, f.label, el("span.hint", { id: `${id}-h` }, f.help));
    };
    const rows = [...groups].map(([g, fs]) => el("div.card.sgroup", {}, el("h3", {}, g), fs.map((f) => {
      let input;
      if (f.secret) {
        // (typing and erasing again changes nothing — only the Clear button removes a stored secret)
        input = el("input", { type: "password", autocomplete: "off", placeholder: f.set ? T("manage.settings.secretSet") : T("manage.settings.secretNotSet"),
          oninput: (e) => { if (e.target.value) mark(f.key, e.target.value); else if (pending[f.key] !== "") mark(f.key, "", ""); } });
        const clear = f.set ? el("button.ghost.small", { type: "button", onclick: () => { input.value = ""; input.placeholder = T("manage.settings.willClear"); mark(f.key, ""); } }, T("control.clear")) : "";
        return el("div.srow", {}, named(f, input), el("div.sin", {}, input, clear));
      }
      input = el("input", { type: "text", value: f.value, autocomplete: "off", placeholder: f.placeholder || "",
        oninput: (e) => mark(f.key, e.target.value, f.value || "") });
      return el("div.srow", {}, named(f, input), el("div.sin", {}, input));
    })));
    let mqtt = "";
    if (M && M.builtin) {
      const pw = el("code", {}, "••••••••••••");
      mqtt = el("div.card.sgroup", {}, el("h3", {}, T("manage.mqtt.title")),
        el("p.muted", {}, T("manage.mqtt.intro")),
        el("div.srow", {}, el("span.lbl", {}, T("manage.mqtt.broker")), el("code", {}, `${location.hostname}:${M.port}`)),
        el("div.srow", {}, el("span.lbl", {}, T("shell.avatar.user")), el("code", {}, M.user)),
        el("div.srow", {}, el("span.lbl", {}, T("guest.password")), el("div.sin", {}, pw,
          el("button.ghost.small", { type: "button", onclick: (e) => { pw.textContent = pw.textContent.startsWith("•") ? M.pass : "••••••••••••"; } }, T("manage.mqtt.show")),
          el("button.ghost.small", { type: "button", onclick: async () => {
            toast(await copyText(M.pass) ? T("manage.copied") : T("manage.mqtt.copyFailed"), !1);
          } }, T("manage.copy")))));
    }
    $main.replaceChildren(...general,
      el("div.filters", {}, el("small.muted", {},
        T("manage.settings.intro")), save),
      window.Manage.calendarsCard ? window.Manage.calendarsCard() : "",   // (calendars.js: the house's iCal links)
      mqtt, ...rows);
  }

  // ---------- Your account: Appearance (theme, the sidebar, default views — shell.js), the password, how to reset it ----------
  // (the side card pinned right: the password and the reset words; the main area: Appearance)
  function renderAccount() {
    const err = el("div.err"), min = isAdmin() ? 8 : 4;   // (the admin 8+, a user 4+: service/manager_auth.py)
    const [oRow, old] = field(T("manage.pw.current"), { type: "password", autocomplete: "current-password", maxlength: "128" });
    const [nRow, nw] = field(T("manage.pw.new"), { type: "password", autocomplete: "new-password", maxlength: "128" });
    const [n2Row, nw2] = field(T("manage.pw.newAgain"), { type: "password", autocomplete: "new-password", maxlength: "128" });
    const go = el("button", { type: "submit" }, T("manage.pw.go"));
    const form = el("form.card.login", { onsubmit: async (e) => {
      e.preventDefault(); err.textContent = "";
      if (nw.value !== nw2.value) { err.textContent = T("manage.pw.notSame"); return; }
      if (nw.value.length < min) { err.textContent = T("manage.pw.atLeast", { min }); return; }
      go.disabled = true;
      try {
        const r = await api("/api/manage/login", { action: "password", old: old.value, new: nw.value });
        if (r.ok) { toast(T("manage.pw.changed")); old.value = nw.value = nw2.value = ""; }
        else err.textContent = r.error === "wrong" ? T("manage.pw.wrong") : r.error === "locked" ? T("manage.login.locked")
          : loginErr(r.error) || plainReason(r.error) || T("manage.pw.notChanged");
      } catch {} finally { go.disabled = false; }
    } }, el("h2", {}, T("manage.pw.title")),
      el("p.muted", {}, T(isAdmin() ? "manage.pw.signedInAdmin" : "manage.pw.signedIn", { user: ME ? ME.user : "?", min })),
      oRow, nRow, n2Row, go, err);
    const forgot = el("div.card.login", {}, el("h2", {}, T("manage.forgot.title")),
      isAdmin() ? el("p.muted", {}, T("manage.forgot.admin", { cmd: "docker exec -it <your Skypane container> python service/reset_login.py" }))   // i18n-ok (the command)
        : el("p.muted", {}, T("manage.forgot.user")));
    $main.replaceChildren(el("div.acc-page", {}, el("h2.spage", {}, T("shell.page.account")),
      window.Kit.sideLayout([el("p.muted.acc-lead", {}, T("manage.account.lead")),
        window.Shell.appearance()], [form, forgot])));
    // (the avatar menu's Change password / Default views…: that part, in view)
    const want = window.Manage.accountFocus; window.Manage.accountFocus = null;
    if (want === "password") { old.focus({ preventScroll: true }); form.scrollIntoView({ block: "nearest" }); }
    else if (want === "views") { const v = document.getElementById("appearance-views"); if (v) { v.focus({ preventScroll: true }); v.scrollIntoView({ block: "start" }); } }
  }

  // ---------- the house's devices (the Devices page itself: devices.js, v2.4.0) ----------
  // { devices, overrides, rooms, roles, fanTypes, noRoom, groups, live, heard, firstSeen, newIds } + what no panel may
  // switch (the admin's: switchable, never, byName) — read at sign-in and again by the pages that change them
  let D = null;
  async function loadDevices() {
    D = await api("/api/manage/devices");
    try { if (!isAdmin()) throw new Error("admin");   // (what no panel may switch: the admin's)
      const n = await api("/api/manage/never"); D.switchable = new Set(n.switchable || []); D.never = new Set(n.never || []); D.byName = new Set(n.byName || []); }
    catch { D.switchable = new Set(); D.never = new Set(); D.byName = new Set(); }
  }
  // the panels get a Devices / Rooms change once the Hubitat bridge rebuilt the house model — say so when it doesn't run
  const bridgeDown = (st) => (st || (D && D.bridge)) && (st || D.bridge) !== "online";
  const follow = (st) => (bridgeDown(st) ? T("manage.follow.bridgeDown") : T("manage.follow.soon"));
  // (icon() returns SVG markup from the panels' own constant icon set — never data — so it's parsed as HTML here)
  const iconEl = (name, size = 22) => { const s = el("span.ic"); s.innerHTML = window.icon ? icon(name, size) : ""; return s; };
  function roleName(k) {
    if (!k) return T("manage.role.notShown");
    if (k === "hidden") return T("manage.role.hidden");
    if (D && D.roles && D.roles[k]) return D.roles[k];
    const [a, b] = String(k).split(":");
    return a === "sensor" ? T("manage.role.sensor", { kind: b }) : a === "thing" ? b[0].toUpperCase() + b.slice(1)
      : a === "presence" ? T("manage.role.presence") : a === "camera" ? T("manage.role.camera") : k;
  }

  // the helpers panels.js (Panels + Guest Wi-Fi tabs) uses
  // (me / isAdmin / can: who is signed in and what it may do — the other files hide what it may not)
  // (swap: a page drawn again keeps the focus and the scroll; dialog: Esc / focus for a dialog; onReset: a new sign-in;
  // meAgain: what this login may do, read again; isDirty: a page form has unsaved changes)
  // (tab / go / refreshMenu: shell.js puts its own in — the router; until then a sign-in can't have happened)
  // (leaveOk: the unsaved-changes question before another page; openDevice / renderDevices: devices.js puts its own in —
  // search → one device's editor)
  window.Manage = { coffeeLink, el, api, toast, iconEl, $main, tab: () => null, go: async () => false, devices: () => D, loadDevices, roleName: (k) => roleName(k), bridgeDown, follow, askUnsaved,
    me: () => ME, isAdmin, isDemo, can, level, plainReason, notAllowed, swap, dialog, onReset: (f) => resets.push(f), onSignIn: (f) => signins.push(f), meAgain,
    bootId, waitRestart, markSaved, refreshMenu: () => {}, isDirty, leaveOk, discardUnsaved, logout, copyText, renderDevices: () => {}, renderSettings, renderAccount, version: () => VERSION,
    openDevice: () => {}, need };

  // (v2.4.1) a background poll — the health pill, the Overview, the Devices live values — asks with Manage.poll(path):
  // X-Skypane-Poll: 1, so it never keeps the session alive (service/server.py _manage_ok); a 401 "login" shows the
  // sign-in card at once (as Manage.api does), never stale data. → the Response, or null after a sign-out.
  window.Manage.signedOut = () => {
    if (keepBuilder()) { if (!reauthDeclined) reauth(); return; }   // (a background poll's 401 while the builder holds work: the box over it)
    if (!document.body.classList.contains("at-login")) showLogin(T("manage.signedOutAgain"));
  };
  window.Manage.poll = async (path) => {
    const r = await fetch(path, { cache: "no-store", headers: { "X-Skypane-Poll": "1" } });
    if (r.status === 401) {
      const j = await r.clone().json().catch(() => ({}));
      if (j.error === "login") { window.Manage.signedOut(); return null; }
    }
    return r;
  };

  // ---------- start (once every file has loaded: shell.js and the pages register first) ----------
  async function boot() {
    try {
      const s = await loadMe();
      if (s.dataWritable === false) return showDataFolder();
      if (s.in) return start();
      showLogin(s.setup ? "" : lockText(s), !!s.setup);
    } catch { $main.replaceChildren(el("p.err", {}, T("manage.noServiceDot"))); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
