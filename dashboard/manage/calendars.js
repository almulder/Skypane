// Skypane Manager — Integrations → Calendars (the admin only; service/calendars.py, owner's guide docs/calendars.md).
// The house's calendars: a name, its iCal / ICS subscription link (Google "Secret address in iCal format", Outlook
// published ICS, iCloud public webcal link…) and a default colour. A link is a SECRET: once saved it never comes back
// to this page ("•••• saved" + Replace); the server fetches it every 10 minutes and shows how that went.
// Each panel then picks the ones it shows: Panels → People & calendars. Drawn with DOM calls + textContent only.
(function () {
  const M = window.Manage;
  const { el, api, toast } = M;
  const K = window.Kit;
  const COLORS = ["#8b5cf6", "#ec4899", "#22d3ee", "#f59e0b", "#34d399", "#f43f5e"];
  let list = null, box = null, polls = [];

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
      list = r.calendars; draw(); if (okText) toast(okText);
      if (body.action === "add" || body.link || body.action === "refresh") pollSoon();
      return true;
    } catch (e) { if (e.message !== "login") toast(K.t("calendars.unreachable"), true); return false; }
  }
  // (the server fetches in the background: look again in a moment)
  function pollSoon() {
    polls.forEach(clearTimeout);
    polls = [3000, 9000, 20000].map((ms) => setTimeout(async () => {
      if (!box || !box.isConnected) return;
      try { const r = await api("/api/manage/calendars"); if (r.calendars) { list = r.calendars; draw(); } } catch {}
    }, ms));
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

  function addForm() {
    const name = el("input", { type: "text", placeholder: K.t("calendars.add.namePlaceholder"), maxlength: "60", "aria-label": K.t("calendars.name") });
    const link = el("input", { type: "password", placeholder: K.t("calendars.add.linkPlaceholder"), autocomplete: "off", spellcheck: "false", "aria-label": K.t("calendars.add.link") });
    let color = COLORS[(list || []).length % COLORS.length];
    const col = colorIn(color, (v) => { color = v; });
    return el("form.cal-add", { onsubmit: async (e) => {
      e.preventDefault();
      if (!name.value.trim() || !link.value.trim()) return toast(K.t("calendars.add.missing"), true);
      if (await change({ action: "add", name: name.value.trim(), link: link.value.trim(), color }, K.t("calendars.add.added"))) { name.value = ""; link.value = ""; }
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
      box.replaceChildren(el("h3", {}, K.t("calendars.title")), (list || []).length ? el("div", {}, (list || []).map(roRow)) : el("p.muted", {}, window.Kit.t("integrations.noCalendars")));
      return;
    }
    const rows = (list || []).map(row);
    box.replaceChildren(el("h3", {}, K.t("calendars.title")),
      el("p.muted", {}, K.t("calendars.intro")),
      rows.length ? el("div", {}, rows) : el("p.warn", {}, K.t("calendars.empty")),
      (list || []).length < 20 ? addForm() : el("small.muted", {}, K.t("calendars.atMost")),
      help());
  }

  // the card on Integrations; filled when the list arrives
  M.calendarsCard = () => {
    box = el("div.card.sgroup.cal-card", {}, el("h3", {}, K.t("calendars.title")), el("p.muted", {}, K.t("common.loading")));
    api("/api/manage/calendars").then((r) => { if (r && Array.isArray(r.calendars)) { list = r.calendars; draw(); } }).catch(() => {});
    return box;
  };
})();
