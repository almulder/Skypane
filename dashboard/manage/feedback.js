// Skypane Manager — Send feedback (v3.0.0): every login can report a bug, an idea or something
// confusing. The report is filed as an issue for the Skypane team through the feedback relay (the server sends it —
// service/feedback.py); the tester needs no GitHub account. The form, then "About this install" — every line shown and
// each one can be taken out —, then exactly what will be sent; nothing leaves before Send. Copy report: the same words
// as text, for any failure. Built with DOM calls + textContent only; every word from the string table (Kit.t).
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast } = M, ic = K.icon, t = K.t;
  const st = { kind: "bug", severity: null, title: "", what: "", expected: "", steps: "", drop: new Set(), about: null, from: "", busy: false, done: null, err: null };
  let fromPage = "";
  if (S.onRoute) S.onRoute((r) => { if (r.page && r.page !== "feedback") fromPage = r.page; });

  // the browser's part of "About this install": short words only (the relay's pattern), nothing that identifies anyone
  const clean = (s) => String(s || "").replace(/[^A-Za-z0-9 ._:/#()+,-]/g, "").trim().slice(0, 60);
  function browserWords() {
    const ua = navigator.userAgent || "";
    const m = (re) => (ua.match(re) || [])[1];
    const browser = /Edg\//.test(ua) ? `Edge ${m(/Edg\/(\d+)/) || ""}` : /Firefox\//.test(ua) ? `Firefox ${m(/Firefox\/(\d+)/) || ""}`
      : /Chrome\//.test(ua) ? `Chrome ${m(/Chrome\/(\d+)/) || ""}` : /Safari\//.test(ua) ? `Safari ${m(/Version\/(\d+)/) || ""}` : "Other";
    const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows"
      : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches; // i18n-ok
    const device = S.isPhone() ? "phone" : coarse ? "tablet" : "desktop";
    // (the page's title as the sidebar shows it — "Account", not the route key; a title the relay's pattern can't carry: the key)
    const key = fromPage || "overview", pg = (S.pages ? S.pages() : []).find((x) => x.key === key);
    return { page: clean(pg && pg.title) || clean(key), device, browser: clean(browser), os, theme: clean(S.prefs().theme || "dark"),
      language: clean(S.prefs().lang || "en") };   // (v3.0.0: the login's Manager language, not the browser's)
  }
  const ABOUT_ORDER = ["version", "build", "page", "device", "browser", "os", "theme", "language", "panels", "devices", "cameras", "logins", "broker", "bridge"];
  const aboutValue = (k, v) => (k === "bridge" ? t(v ? "feedback.yes" : "feedback.no") : k === "broker" ? t(v === "own" ? "feedback.brokerOwn" : "feedback.brokerBuiltIn")
    : k === "device" ? t(`feedback.device.${v}`) : String(v));
  const kept = () => Object.fromEntries(ABOUT_ORDER.filter((k) => st.about && k in st.about && !st.drop.has(k)).map((k) => [k, st.about[k]]));
  function report() {
    const r = { kind: st.kind, what: st.what.trim() };
    if (st.title.trim()) r.title = st.title.trim();
    if (st.expected.trim()) r.expected = st.expected.trim();
    if (st.steps.trim()) r.steps = st.steps.trim();
    if (st.severity) r.severity = st.severity;
    const ab = kept();
    if (Object.keys(ab).length) r.about = ab;
    return r;
  }
  // the report as text (Copy report, and the preview) — the same words that are sent
  function asText(r) {
    const lines = [`${t("feedback.kindLabel")}: ${t(`feedback.kind.${r.kind}`)}`];
    if (r.severity) lines.push(`${t("feedback.severityLabel")}: ${t(`feedback.severity.${r.severity}`)}`);
    if (r.title) lines.push(`${t("feedback.titleLabel")}: ${r.title}`);
    lines.push("", `${t("feedback.whatLabel")}:`, r.what || "—");
    if (r.expected) lines.push("", `${t("feedback.expectedLabel")}:`, r.expected);
    if (r.steps) lines.push("", `${t("feedback.stepsLabel")}:`, r.steps);
    if (r.about) { lines.push("", `${t("feedback.aboutTitle")}:`); for (const [k, v] of Object.entries(r.about)) lines.push(`  ${t(`feedback.about.${k}`)}: ${aboutValue(k, v)}`); }
    return lines.join("\n");
  }
  const HTML = /<\/?[A-Za-z!?]|&#?[A-Za-z0-9]{1,32};/;
  function problem() {
    if (!st.what.trim()) return t("feedback.needWhat");
    for (const k of ["title", "what", "expected", "steps"]) if (HTML.test(st[k])) return t("feedback.noHtml");
    return null;
  }
  async function copy() {
    const text = asText(report());
    try { await navigator.clipboard.writeText(text); toast(t("feedback.copied")); }
    catch { if (M.copyText) { M.copyText(text); } else toast(t("feedback.copyFailed"), true); }
  }
  function errorWords(r) {
    if (r.status === 429) return r.retry ? t("feedback.errWait", { m: Math.max(1, Math.ceil(r.retry / 60)) }) : t("feedback.errTooMany");
    if (r.error === "not-set-up") return t("feedback.errNotSetUp");
    if (r.error === "github") return t("feedback.errGithub");
    if (r.error === "unreachable" || r.status === 0) return t("feedback.errUnreachable");
    if (r.status === 400 && r.error) return t("feedback.errRefused", { why: r.error });
    return t("feedback.errRelay");
  }
  async function send() {
    const p = problem(); if (p) { st.err = p; draw(); return; }
    st.busy = true; st.err = null; draw();
    let r;
    try { r = await api("/api/manage/feedback", report()); } catch (e) { r = { status: e && e.message === "login" ? -1 : 0 }; }
    st.busy = false;
    if (r.status === -1) { draw(); return; }
    if (r.ok) { st.done = { issue: r.issue, url: r.url }; st.title = st.what = st.expected = st.steps = ""; st.severity = null; }
    else st.err = errorWords(r);
    draw();
  }

  function seg(label, opts, cur, set) {
    return el("div.seg", { role: "radiogroup", "aria-label": label }, opts.map(([v, words]) =>
      el("button" + (cur === v ? ".on" : ""), { type: "button", role: "radio", "aria-checked": String(cur === v), onclick: () => { set(cur === v && label === t("feedback.severityLabel") ? null : v); draw(); } }, words)));
  }
  function field(label, hint, ctl) { return el("label.fb-f", {}, el("b", {}, label), hint ? el("small", {}, hint) : null, ctl); }
  function area(key, rows, max, ph) {
    const ta = el("textarea.fb-t", { rows: String(rows), maxlength: String(max), placeholder: ph || "", value: st[key] });
    ta.value = st[key];
    ta.addEventListener("input", () => { st[key] = ta.value; st.err = null; drawPreview(); });
    return ta;
  }
  let previewBox = null, privWarn = null;
  // (v3.0.0) what's typed is sent as typed: an e-mail address or an IP address in it gets a gentle warning
  const PRIVATE = /[\w.+-]+@[\w-]+\.[\w.-]+|\b\d{1,3}(\.\d{1,3}){3}\b/;   // (v3.0.2: its word boundaries were backspace characters — no IP address ever matched)
  function drawPreview() {
    if (previewBox) previewBox.textContent = asText(report());
    if (privWarn) privWarn.hidden = !["title", "what", "expected", "steps"].some((k) => PRIVATE.test(st[k] || ""));
  }

  function draw() {
    if (S.route().page !== "feedback") return;
    const head = el("div.ph", {}, el("div", {}, el("h1", {}, t("feedback.title")), el("p", {}, t("feedback.intro"))));
    if (st.done) {
      const n = st.done.issue;
      M.swap(M.$main, el("div.fb-page", {}, head, el("section.card.fb-done", {}, el("span.ei.ok", {}, ic("check", 22)),
        el("h3", {}, n ? t("feedback.thanksN", { n }) : t("feedback.thanks")), el("p", {}, t("feedback.thanksMore")),
        st.done.url ? el("p", {}, el("a", { href: st.done.url, target: "_blank", rel: "noopener noreferrer" }, t("feedback.seeIt"))) : null, // i18n-ok
        el("button.btn", { type: "button", onclick: () => { st.done = null; draw(); } }, t("feedback.another")))));
      return;
    }
    const title = el("input.fb-i", { type: "text", maxlength: "120", value: st.title, placeholder: t("feedback.titlePh") });
    title.addEventListener("input", () => { st.title = title.value; st.err = null; drawPreview(); });
    const ab = st.about ? ABOUT_ORDER.filter((k) => k in st.about).map((k) => el("label.fb-ab", {},
      el("input", { type: "checkbox", checked: !st.drop.has(k), onchange: (e) => { if (e.target.checked) st.drop.delete(k); else st.drop.add(k); drawPreview(); } }),
      el("span", {}, t(`feedback.about.${k}`)), el("b", {}, aboutValue(k, st.about[k])))) : [el("p.muted", {}, t("feedback.aboutLoading"))];
    previewBox = el("pre.fb-pre", { "aria-label": t("feedback.previewTitle") });
    privWarn = el("p.fb-warn.warn", { role: "status", hidden: true }, t("feedback.privateWarn"));
    const form = el("section.card.fb-form", {},
      field(t("feedback.kindLabel"), null, seg(t("feedback.kindLabel"), [["bug", t("feedback.kind.bug")], ["idea", t("feedback.kind.idea")], ["confusing", t("feedback.kind.confusing")]], st.kind, (v) => { st.kind = v; })),
      field(t("feedback.titleLabel"), t("feedback.titleHint"), title),
      field(t("feedback.whatLabel"), t(st.kind === "idea" ? "feedback.whatHintIdea" : "feedback.whatHint"), area("what", 5, 4000)),
      st.kind === "idea" ? null : field(t("feedback.expectedLabel"), null, area("expected", 3, 2000)),
      st.kind === "idea" ? null : field(t("feedback.stepsLabel"), t("feedback.stepsHint"), area("steps", 4, 3000, t("feedback.stepsPh"))),
      field(t("feedback.severityLabel"), t("feedback.severityHint"), seg(t("feedback.severityLabel"), [["blocks", t("feedback.severity.blocks")], ["annoying", t("feedback.severity.annoying")], ["cosmetic", t("feedback.severity.cosmetic")]], st.severity, (v) => { st.severity = v; })));
    const about = el("section.card.fb-about", {}, el("h3.ch", {}, ic("shield", 15), t("feedback.aboutTitle")), el("p.gf.pad", {}, t("feedback.aboutHint")), el("div.fb-abs", {}, ab));
    const preview = el("section.card.fb-prev", {}, el("h3.ch", {}, ic("eye", 15), t("feedback.previewTitle")), el("p.gf.pad", {}, t("feedback.previewHint", { host: st.relay || "" })), privWarn, previewBox);
    const acts = el("div.fb-acts", {},
      el("button.btn.pri", { type: "button", disabled: st.busy, "aria-busy": st.busy ? "true" : null, onclick: send }, ic("upload", 15), st.busy ? t("feedback.sending") : t("feedback.send")),
      el("button.btn", { type: "button", onclick: copy }, ic("copy", 15), t("feedback.copy")),
      el("p.fb-msg" + (st.err ? ".bad" : ""), { role: "status", "aria-live": "polite" }, st.err ? [st.err, " ", t("feedback.copyInstead")] : t("feedback.privacy")));
    M.swap(M.$main, el("div.fb-page", {}, head, form, about, preview, acts));
    drawPreview();
  }
  async function render() {
    st.done = null; st.err = null;
    draw();
    try { const r = await api("/api/manage/feedback"); st.about = { ...(r.about || {}), ...browserWords() }; st.relay = r.relay || ""; } catch { st.about = browserWords(); }
    draw();
  }
  M.onReset(() => { st.title = st.what = st.expected = st.steps = ""; st.severity = null; st.drop.clear(); st.about = null; st.done = null; st.err = null; });
  S.page("feedback", { title: t("feedback.title"), group: "foot", icon: "send", demoHidden: true, words: "feedback bug idea report problem confusing issue github tester",
    render });
})();
