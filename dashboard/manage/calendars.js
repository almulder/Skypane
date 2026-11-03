// Skypane Manager — Integrations → Calendars (the admin only; service/calendars.py, owner's guide docs/calendars.md).
// The house's calendars: a name, its iCal / ICS subscription link (Google "Secret address in iCal format", Outlook
// published ICS, iCloud public webcal link…) and a default colour. A link is a SECRET: once saved it never comes back
// to this page ("•••• saved" + Replace); the server fetches it every 5–30 minutes (the admin's "Check for changes every",
// v3.0.2) and shows how that went; "Check calendars now" fetches them all at once (once a minute) and says what it found.
// Each panel then picks the ones it shows: Panels → People & calendars. Under them (v3.0.2): Event icons (eventicons.js).
// Drawn with DOM calls + textContent only.
(function () {
  const M = window.Manage;
  const { el, api, toast } = M;
  const K = window.Kit;
  const COLORS = ["#8b5cf6", "#ec4899", "#22d3ee", "#f59e0b", "#34d399", "#f43f5e"];
  let list = null, box = null, polls = [], timing = {}, tick = null, later = null;   // (timing: {every, everyChoices, lastChecked} — v3.0.2)
  const adding = { name: "", link: "", color: null };   // (v3.0.2: "Add a calendar" as typed — kept when the card is drawn again)

  const ago = (iso) => window.Kit.ago(Date.parse(iso || "") / 1000 || 0, "mid");   // (kit.js: one "time ago")
  function statusLine(c) {
    const st = c.status || {};
    if (st.state === "waiting") return el("small.muted", {}, K.t("calendars.status.waiting"));
    if (st.state === "error") {
      const error = st.error || K.t("calendars.status.couldntRead"), checked = ago(st.fetched);
      return el("small.cal-bad", {}, st.okAt ? K.t("calendars.status.errorStale", { error, when: ago(st.okAt), n: st.events, checked })
        : K.t("calendars.status.errorEmpty", { error, checked }));
    }
    return el("small.muted", {}, K.t("calendars.status.ok", { n: st.events, checked: ago(st.fetched) }));
  }

  async function change(body, okText) {
    try {
      const r = await api("/api/manage/calendars", body);
      if (!r.ok) { toast(r.error || K.t("calendars.notSaved"), true); return false; }
      list = r.calendars; keepTiming(r); draw(); if (okText) toast(okText);
      if (body.action === "add" || body.link || body.action === "refresh") pollSoon();
      return true;
    } catch (e) { if (e.message !== "login") toast(K.t("calendars.unreachable"), true); return false; }
  }
  // (the server fetches in the background: look again in a moment)
  function pollSoon() {
    polls.forEach(clearTimeout);
    polls = [3000, 9000, 20000].map((ms) => setTimeout(async () => {
      if (!box || !box.isConnected) return;
      try { const r = await api("/api/manage/calendars"); if (r.calendars) { list = r.calendars; keepTiming(r); drawSoon(); } } catch {}
    }, ms));
  }

  // ---- (v3.0.2) how often the server looks, and "Check calendars now" ----
  // (the last check stays known when the server has none to say — the last calendar removed — not "Not checked yet")
  const keepTiming = (r) => { if (r && r.every) timing = { every: r.every, everyChoices: r.everyChoices, lastChecked: r.lastChecked || timing.lastChecked }; };
  const lastText = () => timing.lastChecked ? K.t("calendars.lastChecked", { when: ago(timing.lastChecked) }) : K.t("calendars.neverChecked");
  function timingBox() {
    const choices = timing.everyChoices || [5, 10, 15, 30];
    const seg = el("div.seg", { role: "group", "aria-label": K.t("calendars.every.label") }, choices.map((n) =>
      el("button" + (timing.every === n ? ".on" : ""), { type: "button", "aria-pressed": String(timing.every === n), onclick: () => {
        if (timing.every !== n) change({ action: "every", every: n }, K.t("calendars.every.saved", { n }));
      } }, K.t("calendars.every.min", { n }))));
    const last = el("small.muted.cal-last", {}, lastText());
    const btn = el("button.ghost.small", { type: "button", title: K.t("calendars.checkAllTip"), onclick: () => checkAll(btn) }, K.t("calendars.checkAll"));
    clearInterval(tick);   // ("Last checked: 2 min ago" keeps up without redrawing the inputs)
    tick = setInterval(() => { if (!last.isConnected) clearInterval(tick); else last.textContent = lastText(); }, 30000);
    return el("div.cal-timing", {},
      el("div.cal-every", {}, el("span", {}, K.t("calendars.every.label")), seg),
      el("small.muted", {}, K.t("calendars.every.hint")),
      el("div.cal-every", {}, btn, last));
  }
  async function checkAll(btn) {
    btn.disabled = true; btn.textContent = K.t("calendars.checkingAll");
    try {
      const r = await api("/api/manage/calendars", { action: "refresh" });
      if (r.status === 429) { toast(K.t("calendars.tooSoon", { s: r.wait || 60 }), true); return; }
      if (!r.ok) { toast(r.error || K.t("calendars.notSaved"), true); return; }
      // (v3.0.2: checked / still checking / couldn't be read — an older answer has only checked and errors)
      const c = r.checked || {}, num = (v) => (typeof v === "number" && v > 0 ? v : 0);
      const bad = num(c.failed) || (Array.isArray(c.errors) ? c.errors.length : 0), still = num(c.stillChecking) || num(c.still) || num(c.waiting) || num(c.pending);
      toast(K.t("calendars.checkedAll", { n: num(c.checked), events: K.t("calendars.newEvents", { n: num(c.newEvents) }) })
        + (still ? K.t("calendars.checkedStill", { n: still }) : "") + (bad ? K.t("calendars.checkedErrors", { n: bad }) : ""), !!bad);   // (each one's error: on its row, as always)
      list = r.calendars; keepTiming(r); draw();
    } catch (e) { if (e.message !== "login") toast(K.t("calendars.unreachable"), true); }
    finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = K.t("calendars.checkAll"); } }
  }

  const colorIn = (value, onpick) => el("input.cal-color", { type: "color", value: value || COLORS[0], title: K.t("calendars.colorTip"),
    "aria-label": K.t("calendars.color"), onchange: (e) => onpick(e.target.value) });

  function row(c) {
    const linkBox = el("span.cal-link", {});
    const showSaved = () => linkBox.replaceChildren(el("code", {}, K.t("calendars.linkSaved")),
      el("button.ghost.small", { type: "button", onclick: replace }, K.t("calendars.replace")));
    function replace() {
      const inp = el("input", { type: "password", placeholder: K.t("calendars.newLinkPlaceholder"), autocomplete: "off", spellcheck: "false", "aria-label": K.t("calendars.newLink") });
      const save = el("button.small", { type: "button", onclick: async () => {
        if (!inp.value.trim()) return toast(K.t("calendars.pasteFirst"), true);
        if (await change({ action: "change", id: c.id, link: inp.value.trim() }, K.t("calendars.newLinkSaved"))) inp.value = "";
      } }, K.t("calendars.save"));
      linkBox.replaceChildren(inp, save, el("button.ghost.small", { type: "button", onclick: showSaved }, K.t("calendars.cancel")));
      inp.focus();
    }
    showSaved();
    return el("div.srow2.cal-row", {},
      colorIn(c.color, (v) => change({ action: "change", id: c.id, color: v }, K.t("calendars.colorSaved"))),
      el("div.grow", {},
        el("input", { type: "text", value: c.name, maxlength: "60", "aria-label": K.t("calendars.name"),
          // (a refused name — empty — goes back to the saved one at once, not only after a reload)
          onchange: async (e) => { const inp = e.target; if (!(await change({ action: "change", id: c.id, name: inp.value }, K.t("calendars.renamed"))) && inp.isConnected) inp.value = c.name; } }),
        statusLine(c)),
      linkBox,
      el("button.ghost.small", { type: "button", title: K.t("calendars.checkTip"), onclick: () => change({ action: "refresh", id: c.id }, K.t("calendars.checking")) }, K.t("calendars.checkNow")),
      el("button.ghost.small", { type: "button", onclick: () => {
        if (confirm(K.t("calendars.removeAsk", { name: c.name }))) change({ action: "remove", id: c.id }, K.t("calendars.removed"));
      } }, K.t("calendars.remove")));
  }

  // (data-unsaved: a name or link typed and not added yet — leaving, or a save that restarts Skypane, asks first)
  function addForm() {
    const name = el("input", { type: "text", placeholder: K.t("calendars.add.namePlaceholder"), maxlength: "60", "aria-label": K.t("calendars.name"), oninput: (e) => { adding.name = e.target.value; } });
    const link = el("input", { type: "password", placeholder: K.t("calendars.add.linkPlaceholder"), autocomplete: "off", spellcheck: "false", "aria-label": K.t("calendars.add.link"), oninput: (e) => { adding.link = e.target.value; } });
    name.value = adding.name; link.value = adding.link;   // (the value only: the starting one stays empty, so the unsaved check still sees it)
    const color = adding.color || COLORS[(list || []).length % COLORS.length];
    const col = colorIn(color, (v) => { adding.color = v; });
    return el("form.cal-add", { "data-unsaved": K.t("calendars.add.unsaved"), "data-save": K.t("calendars.add.button"), onsubmit: async (e) => {
      e.preventDefault();
      if (!name.value.trim() || !link.value.trim()) return toast(K.t("calendars.add.missing"), true);
      const body = { action: "add", name: name.value.trim(), link: link.value.trim(), color: adding.color || color };
      adding.name = ""; adding.link = ""; adding.color = null;   // (drawn again by change(): empty)
      if (!(await change(body, K.t("calendars.add.added")))) { adding.name = body.name; adding.link = body.link; adding.color = body.color; }
    } }, el("b", {}, K.t("calendars.add.title")), col, name, link, el("button", { type: "submit" }, K.t("calendars.add.button")));
  }

  const help = () => el("details.cal-help", {}, el("summary", {}, K.t("calendars.help.title")),
    el("ul", {},
      el("li", {}, el("b", {}, "Google: "), K.t("calendars.help.google")),   // i18n-ok (a brand name)
      el("li", {}, el("b", {}, "Outlook / Microsoft 365: "), K.t("calendars.help.outlook")),   // i18n-ok (a brand name)
      el("li", {}, el("b", {}, "iCloud: "), K.t("calendars.help.icloud")),   // i18n-ok (a brand name)
      el("li", {}, el("b", {}, K.t("calendars.help.others")), K.t("calendars.help.othersText"))),
    el("small.muted", {}, K.t("calendars.help.readOnly")));

  // (v2.9.0 gate 2: a phone lists the calendars to read — names and colours; adding and changing them on a computer)
  function roRow(c) {
    return el("div.srow2.cal-row.cal-ro", {}, el("span.cal-dot", { style: `background:${/^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : "#8b5cf6"}`, "aria-hidden": "true" }),
      el("div.grow", {}, el("b", {}, c.name), statusLine(c)));
  }
  function draw() {
    if (!box) return;
    if (window.Shell && Shell.isPhone()) {
      box.replaceChildren(el("h3", {}, K.t("calendars.title")), (list || []).length ? el("div", {}, (list || []).map(roRow)) : el("p.muted", {}, window.Kit.t("integrations.noCalendars")),
        timing.every && (list || []).length ? el("small.muted", {}, K.t("calendars.everyRo", { n: timing.every }) + " · " + lastText()) : "",   // (v3.0.2: read only; none with no calendars, as on a computer)
        M.eventIconsCard ? M.eventIconsCard() : "");
      return;
    }
    const rows = (list || []).map(row);
    clearTimeout(later); later = null;
    (box.isConnected ? M.swap : (b, ...k) => b.replaceChildren(...k))(box, el("h3", {}, K.t("calendars.title")),   // (swap: the focused field keeps the focus)
      el("p.muted", {}, K.t("calendars.intro")),
      rows.length ? el("div", {}, rows) : el("p.warn", {}, K.t("calendars.empty")),
      rows.length ? timingBox() : "",   // (replaceChildren: a null would show as the word "null")
      (list || []).length < 20 ? addForm() : el("small.muted", {}, K.t("calendars.atMost")),
      help(),
      M.eventIconsCard ? M.eventIconsCard() : "");   // (v3.0.2: which words show which icon — eventicons.js)
  }

  // (v3.0.2) a draw nobody asked for (the list read again in the background) waits while a field in the card has the
  // focus — the Integrations page drawing itself again never takes away what's being typed
  const typing = () => { const a = document.activeElement; return !!(box && a && box.contains(a) && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !/^(color|checkbox|radio|button|submit)$/.test(a.type)))); };
  function drawSoon() {
    if (!box) return;
    if (!box.isConnected || !typing()) { draw(); return; }
    clearTimeout(later); later = setTimeout(drawSoon, 3000);
  }
  // the card on Integrations; filled when the list arrives — the same element each time the page draws itself again
  M.calendarsCard = () => {
    if (!box) box = el("div.card.sgroup.cal-card", {}, el("h3", {}, K.t("calendars.title")), el("p.muted", {}, K.t("common.loading")));
    api("/api/manage/calendars").then((r) => { if (r && Array.isArray(r.calendars)) { list = r.calendars; keepTiming(r); drawSoon(); } }).catch(() => {});
    return box;
  };
  M.onReset && M.onReset(() => { list = null; box = null; timing = {}; adding.name = adding.link = ""; adding.color = null; clearTimeout(later); });   // (signed out: nothing kept)
})();
