// Skypane Manager — Your account (every login; v2.7.0): Profile (the sign-in name, the name shown, the avatar's colour),
// Password (change it; sign out on every other browser), Appearance (theme, sidebar, default views — Shell.appearance —
// and the language: English only until the translations come). The side card: this browser, your recent sign-ins (the
// activity log: wrong passwords on your name too) and the shortcuts. A notice from the server ("your password was reset
// by …") shows on top until dismissed. Everything is drawn with DOM calls + textContent.
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast } = M, ic = K.icon;
  const ago = (t) => K.ago(t, "long");   // (kit.js: one "time ago" for every page)
  const when = (t) => K.when(t);   // (kit.js: one date formatter)
  // this browser in words ("Edge · Windows"), as the server keeps it in the activity log
  function browserWords() {
    const ua = navigator.userAgent || "";
    const b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
    const o = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "Chrome OS" : /Linux/.test(ua) ? "Linux" : "";
    return [b, o].filter(Boolean).join(" · ") || K.t("account.thisBrowser");
  }
  const NOTICE = { code: (n) => K.t("account.notice.code", { by: n.by, when: when(n.at) }),
    "password-set": (n) => K.t("account.notice.passwordSet", { by: n.by, when: when(n.at) }),
    "made-admin": (n) => K.t("account.notice.madeAdmin", { by: n.by, when: when(n.at) }),
    "code-wrong": (n) => K.t("account.notice.codeWrong", { n: n.count > 1 ? n.count : 1, when: when(n.at) }),
    "code-dead": (n) => K.t("account.notice.codeDead", { when: when(n.at), by: n.by || K.t("account.notice.anAdmin") }),
    "code-dead-made": (n) => K.t("account.notice.codeDeadMade", { by: n.by }) };
  const SIGNIN = { "signin.ok": K.t("account.signin.ok"), "signin.wrong": K.t("account.signin.wrong"), "signin.locked": K.t("account.signin.locked"),
    "signin.out": K.t("account.signin.out"), "signin.out-others": K.t("account.signin.outOthers"), "signin.code-used": K.t("account.signin.codeUsed"),
    "signin.code-wrong": K.t("account.signin.codeWrong") };

  let ME = null, recent = [];
  async function load() {
    ME = await api("/api/manage/login");
    const r = await api(`/api/manage/activity?kinds=signins&who=${encodeURIComponent(ME.user || "")}&limit=10`).catch(() => ({}));
    recent = Array.isArray(r.events) ? r.events : [];
  }

  function profile(prefs) {
    const display = el("input", { type: "text", maxlength: "40", value: prefs.display || "", placeholder: ME.user, "aria-label": K.t("account.profile.nameShown") });
    display.addEventListener("change", () => { S.savePrefs({ display: display.value.trim() }); toast(K.t("account.profile.saved")); });
    const colors = el("div.ac-colors", { role: "radiogroup", "aria-label": K.t("account.profile.avatarColor") }, Object.entries(S.COLORS).map(([k, c]) =>
      el("button.ac-color" + (prefs.color === k ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(prefs.color === k), "aria-label": k, style: `background:${c}`,
        onclick: (e) => { S.savePrefs({ color: k }); for (const b of e.currentTarget.parentNode.children) { const on = b === e.currentTarget; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); } } },
      prefs.color === k ? ic("check", 14) : null)));
    return K.group(K.t("account.profile.title"), [
      K.row(K.t("account.profile.signInName"), ME.admin ? K.t("account.profile.renameInAccounts") : K.t("account.profile.onlyAdmin"),
        el("div.ac-two", {}, el("code.ac-name", {}, ME.user), ME.admin && !S.isPhone() ? el("button.btn.sm", { type: "button", onclick: () => M.go("accounts") }, K.t("account.profile.openAccounts")) : null)),
      K.row(K.t("account.profile.nameShown"), K.t("account.profile.nameShownHint"), display),
      K.row(K.t("account.profile.avatarColor"), null, colors)]);
  }
  function password() {
    const min = ME.admin ? 8 : 4;
    const mk = (label, ac) => el("input", { type: "password", autocomplete: ac, maxlength: "128", "aria-label": label });
    const old = mk(K.t("account.password.current"), "current-password"), nw = mk(K.t("account.password.new"), "new-password"), nw2 = mk(K.t("account.password.again"), "new-password");
    const err = el("p.err");
    const go = el("button.btn.pri", { type: "submit" }, K.t("account.password.change"));
    const form = el("form.ac-pwform", { id: "account-password", "data-unsaved": K.t("account.password.unsaved"), onsubmit: async (e) => {
      e.preventDefault(); err.textContent = "";
      if (nw.value !== nw2.value) { err.textContent = K.t("account.password.notSame"); return; }
      if (nw.value.length < min) { err.textContent = K.t("account.password.tooShort", { n: min }); return; }
      go.disabled = true;
      try {
        const r = await api("/api/manage/login", { action: "password", old: old.value, new: nw.value });
        if (r.ok) { toast(K.t("account.password.changed")); old.value = nw.value = nw2.value = ""; render(); }
        else err.textContent = r.error === "wrong" ? K.t("account.password.wrong") : r.error === "locked" ? K.t("account.password.locked") : (M.plainReason(r.error) || K.t("account.password.notChanged"));
      } catch {} finally { go.disabled = false; }
    } }, el("label.pn-fld", {}, el("b", {}, K.t("account.password.current")), old), el("label.pn-fld", {}, el("b", {}, K.t("account.password.new")), nw, el("small.pn-hint", {}, K.t("account.password.atLeast", { n: min }))),
    el("label.pn-fld", {}, el("b", {}, K.t("account.password.again")), nw2), err, el("div", {}, go));
    const others = el("button.btn", { type: "button", onclick: async () => {
      if (!(await K.ask({ title: K.t("account.others.ask"), yes: K.t("account.others.yes"), text: K.t("account.others.askText") }))) return;
      const r = await api("/api/manage/login", { action: "signout-others" }).catch(() => ({}));
      toast(r.ok ? K.t("account.others.done") : K.t("account.others.notDone"), !r.ok);
      if (r.ok) render();
    } }, ic("logout", 15), K.t("account.others.yes"));
    return K.group(K.t("account.password.title"), [
      K.row(K.t("account.password.changeYours"), ME.pwAt ? K.t("account.password.lastSet", { when: ago(ME.pwAt) }) : "", null),
      el("div.grp-row.ac-pwrow", {}, form),
      K.row(K.t("account.others.row"), K.t("account.others.rowHint"), others)],
    ME.owner || ME.admin ? K.t("account.password.forgotAdmin")
      : K.t("account.password.forgotUser"));
  }
  function language(prefs) {
    // (one language so far: said in words, no one-choice list — the choice comes with the first translation; prefs.lang)
    void prefs;
    return K.group(K.t("account.lang.title"), [K.row(K.t("account.lang.row"), K.t("account.lang.hint"), el("span.ac-lang", {}, el("b", {}, K.t("account.lang.english")), " " + K.t("account.lang.more")))]);
  }
  function side() {
    const bad = (e) => /wrong|locked/.test(e.kind), out = (e) => /signin\.out/.test(e.kind);
    const rows = recent.map((e) => el("div.nl", {}, el("span.ni" + (bad(e) ? ".bad" : out(e) ? "" : ".ok"), {}, ic(bad(e) ? "alert" : out(e) ? "logout" : "user", 15)),
      el("div", {}, el("b", {}, SIGNIN[e.kind] || K.t("account.side.signInFallback")), el("small.ac-where", { title: [e.agent, e.from].filter(Boolean).join(" · ") }, [ago(e.at), e.agent, e.from].filter(Boolean).join(" · ")))));
    return [el("section.card.flush.ac-side", { "aria-label": K.t("account.side.signedIn") }, el("h3.ch", {}, ic("user", 15), " " + K.t("account.side.signedIn")),
      el("div.pn-kv", {}, el("span", {}, K.t("account.side.login")), el("b", {}, ME.user), el("span", {}, K.t("account.side.role")), el("b", {}, ME.owner ? K.t("account.side.ownerAdmin") : ME.admin ? K.t("account.side.admin") : K.t("account.side.user")),
        el("span", {}, K.t("account.thisBrowser")), el("b", {}, browserWords())),
      el("h3.ch", {}, ic("clock", 15), " " + K.t("account.side.recent")),
      rows.length ? el("div.ac-recent", {}, ...rows) : el("p.pad.muted", {}, K.t("account.side.none")),
      el("p.gf.pad", {}, K.t("account.side.notYou"))),
    el("section.card.flush.ac-side", { "aria-label": K.t("account.shortcuts.title") }, el("h3.ch", {}, ic("help", 15), " " + K.t("account.shortcuts.title")),
      el("div.pn-kv", {}, ...[[K.t("account.shortcuts.search"), K.t("account.shortcuts.searchKey")], [K.t("account.shortcuts.switchView"), "V"], [K.t("account.shortcuts.pinSidebar"), "["], [K.t("account.shortcuts.help"), "F1"]].flatMap(([a, b]) => [el("span", {}, a), el("b", {}, el("kbd", {}, b))])))];
  }
  function draw() {
    const prefs = S.prefs();
    const notes = (ME.notices || []).map((n) => el((n.kind === "made-admin" ? "p.pn-info" : "p.pn-warn") + ".ac-notice", {}, ic(n.kind === "made-admin" ? "shield" : "alert", 15),
      el("span", {}, (NOTICE[n.kind] || (() => K.t("account.notice.changed")))(n)),
      el("button.btn.sm.ghost", { type: "button", onclick: async () => { await api("/api/manage/login", { action: "seen", id: n.id }).catch(() => {}); render(); } }, K.t("account.notice.gotIt"))));
    const main = el("div", {}, ...notes, ...profile(prefs), ...password(), ...language(prefs), S.appearance());
    M.swap(M.$main, el("div.ac-page.me", {}, el("div.ph", {}, el("div", {}, el("h1", {}, K.t("account.title")),
      el("p", {}, K.t("account.intro")))),
    window.innerWidth < 900 ? el("div.ac-narrow", {}, main, ...side()) : K.sideLayout(main, side())));
    const want = M.accountFocus; M.accountFocus = null;
    if (want === "password") { const f = document.getElementById("account-password"); if (f) { f.querySelector("input").focus({ preventScroll: true }); f.scrollIntoView({ block: "center" }); } }
    else if (want === "views") { const v = document.getElementById("appearance-views"); if (v) { v.focus({ preventScroll: true }); v.scrollIntoView({ block: "start" }); } }
  }
  async function render() {
    if (!ME) M.$main.replaceChildren(S.isPhone() ? el("div.p-skel", { role: "status", "aria-label": K.t("common.loading") }, el("i"), el("i"), el("i")) : el("p.muted", {}, K.t("common.loading")));   // (v2.9.0: a phone, skeleton rows)
    try { await load(); } catch (e) { if (e.message !== "login") M.$main.replaceChildren(K.empty("user", K.t("account.cantRead"), K.t("account.tryAgain"))); return; }
    if (S.route().page === "account") draw();
  }
  M.onReset(() => { ME = null; recent = []; });
  S.page("account", { title: K.t("account.title"), group: "none", icon: "user", demoHidden: true, words: "password theme appearance sidebar language sign out everywhere avatar",
    render: () => render() });
  M.renderAccount = () => { if (S.route().page === "account") render(); };
})();
