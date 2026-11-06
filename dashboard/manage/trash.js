// Skypane Manager — the Trash and "in use" (v3.0.5; mockups/prototypes/in-use-305.html, mockups/CR-trash-and-in-use.md).
// What the Manager deletes waits in the Trash for 7, 14 or 30 days (the admin picks; 7 by default) before it's gone
// for good — service/trash.py, GET / PATCH /api/manage/trash. The Trash page (the admin): each item with who deleted it
// and when, "Gone for good in N days", Restore and Delete now; Empty Trash; how long; how much room it takes.
// Kit.trash — what the other pages share:
//   inUse(title, uses, words, panels): something still uses it — the delete is blocked; the dialog lists each panel and
//     card, each a link to it (Setup, the layout builder, the device). Only "OK": take it off those first.
//   inUseBadge(n, words): the lists' "In use" badge with a count (or "Not used").
//   deleted({name, trash, days, redo, after}): the message after a delete, with Undo (Kit.history: Ctrl+Z, ↶ ↷);
//     Undo puts it back from the Trash, Redo deletes it again (redo() → the new Trash id, or false).
// Built with DOM calls + textContent only; every word from strings/en.js.
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast } = M, ic = K.icon, t = K.t;

  // ---------- shared: the In use badge, the blocked dialog, the Undo after a delete ----------
  const inUseBadge = (n, words) => (n ? el("span.iu-b", {}, el("span.badge.iu-on", {}, t("trash.inUse")), words ? el("small.iu-n", {}, words) : null)
    : el("span.badge.iu-off", {}, t("trash.notUsed")));
  // where a use goes: a panel's Setup, its layout (the builder), a device; else just words
  function linkOf(u, panels) {
    const byName = (n) => (panels || []).find((p) => p.name === n);
    const p = u && (u.id && typeof u.id === "string" ? { id: u.id } : u.panel ? byName(u.panel) : null);
    if (u && u.kind === "cards" && p && M.can("panels", p.id)) return () => M.go(`panels/${p.id}/layout`);
    if (u && ["background", "person", "calendar"].includes(u.kind) && p && M.can("panels", p.id)) return () => M.openPanel(p.id);
    if (u && u.kind === "device" && M.can("devices")) {
      const D = M.devices && M.devices(), d = ((D && D.devices) || []).find((x) => x.label === u.name);
      if (d) return async () => { if (await M.go("devices")) M.openDevice(d.id); };
    }
    return null;
  }
  function inUse(title, uses, words, panels) {
    return new Promise((done) => {
      let close = null;
      const ok = el("button.btn.pri", { type: "button", onclick: () => end() }, t("trash.inUseOk"));
      const end = () => { if (close) close(); done(); };
      const items = uses.map((u) => { const go = linkOf(u, panels), text = words(u);
        return el("li", {}, go ? el("a.iu-link", { href: "#", onclick: (e) => { e.preventDefault(); end(); go(); } }, text) : el("span", {}, text)); });
      const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) end(); } },
        el("div.modal.small.pn-ask.iu-dlg", { role: "alertdialog", "aria-labelledby": "iu-h", "aria-describedby": "iu-p" },
          el("h2", { id: "iu-h" }, title), el("p", { id: "iu-p" }, t("trash.inUseText")),
          el("ul.iu-list", {}, items), el("div.pn-ask-acts", {}, ok)));
      close = M.dialog(shade, ok, () => end());
    });
  }
  // → {ok, …} put back, or (v3.0.5) {error: its own words} — the Undo says those, never just "Can't undo"
  async function restore(id) {
    try {
      const r = await api("/api/manage/trash", { action: "restore", id });
      if (r.ok) return r;
      return { error: r.why === "taken" ? t("trash.restoreTaken") : r.error || t("trash.cantRestore") };
    } catch (e) { return { error: e.message === "login" ? "" : t("trash.unreachable") }; }
  }
  // after a delete: "Deleted 'X'. It's in the Trash for N days." with Undo; Undo / Redo through Kit.history
  function deleted({ name, trash, days, redo, after }) {
    if (!trash) { toast(t("trash.deletedGone", { name })); return; }
    let cur = trash;
    const step = { what: t("trash.deletedWhat", { name }),
      undo: async () => { const r = await restore(cur); if (!r.ok) return r.error || false; if (after) after(r, true); return true; },
      redo: redo ? async () => { const id = await redo(); if (!id) return false; cur = id; if (after) after(null, false); return true; } : () => false,
      undoText: t("trash.restoredName", { name }), redoText: t("trash.deletedGone", { name }) };   // (v3.0.5, tester: a sentence — "Deleted …", capitalized)
    if (K.history && K.history.did) K.history.did(step, t("trash.deleted", { name, n: days || 7 }));
    else toast(t("trash.deleted", { name, n: days || 7 }));
  }
  K.trash = { inUse, inUseBadge, deleted, restore };

  // ---------- the Trash page (the admin) ----------
  let D = null, busy = false;
  const KIND = { picture: "image", card: "cards", template: "layout", panel: "tablet" };
  const kindWords = (i) => (i.kind === "picture" ? t(i.what === "background" ? "trash.kind.background" : "trash.kind.icon")
    : i.kind === "card" ? t("trash.kind.card") : i.kind === "template" ? t("trash.kind.template") : i.kind === "panel" ? t("trash.kind.panel") : i.kind);
  const kb = (b) => (b >= 1e6 ? t("trash.mb", { n: (b / 1e6).toFixed(1) }) : t("trash.kb", { n: Math.max(1, Math.round((b || 0) / 1000)) }));
  async function load() {
    try { D = await api("/api/manage/trash"); } catch (e) { if (e.message !== "login") D = { failed: true }; }
    draw();
  }
  async function act(body, okText) {
    if (busy) return false;
    busy = true;
    try {
      const r = await api("/api/manage/trash", body);
      if (!r.ok) { toast(r.why === "taken" ? t("trash.restoreTaken") : r.error || t("trash.notDone"), true); return false; }
      toast(okText(r)); return true;
    } catch (e) { if (e.message !== "login") toast(t("trash.unreachable"), true); return false; }
    finally { busy = false; load(); }
  }
  function draw() {
    if (S.route().page !== "trash") return;
    if (!D) { M.$main.replaceChildren(el("p.muted", {}, t("common.loading"))); return; }
    if (D.failed || !Array.isArray(D.items)) { M.$main.replaceChildren(el("p.gf.bad", {}, t("trash.cantRead"))); return; }
    const phone = S.isPhone(), items = D.items;
    const rows = items.map((i) => el("div.tr-row", { "data-id": i.id },
      el("span.tr-ic", {}, ic(KIND[i.kind] || "trash", 18)),
      el("span.tr-nm", {}, el("b", {}, i.name || "—"), el("small", {}, kindWords(i))),
      el("span.tr-by", {}, el("small", {}, t("trash.byWhen", { who: i.by || t("trash.someone"), when: K.when(i.at, "dateTime") || "—" }))),
      el("span.tr-days", {}, i.days ? t("trash.daysLeft", { n: i.days }) : t("trash.today")),
      el("span.tr-acts", {}, el("button.btn.sm", { type: "button", disabled: phone, onclick: () => act({ action: "restore", id: i.id }, (r) => t("trash.restored", { name: r.name || i.name, where: kindWords(i) })) }, t("trash.restore")),
        el("button.btn.sm.pn-danger", { type: "button", disabled: phone, onclick: async () => {
          if (await K.ask({ title: t("trash.eraseAsk", { name: i.name }), text: t("trash.cantUndo"), yes: t("trash.eraseYes"), danger: true })) act({ action: "erase", id: i.id }, () => t("trash.erased", { name: i.name }));
        } }, t("trash.erase")))));
    const keep = el("select", { "aria-label": t("trash.keepFor"), disabled: phone || busy, onchange: (e) => act({ action: "keep", days: +e.target.value }, (r) => t("trash.keepSaved", { n: r.keep })) },
      (D.choices || [7, 14, 30]).map((n) => el("option", { value: String(n), selected: n === D.keep }, n === 7 ? t("trash.daysDefault", { n }) : t("trash.days", { n }))));
    const empty = el("button.btn.pn-danger", { type: "button", disabled: phone || !items.length, onclick: async () => {
      if (await K.ask({ title: t("trash.emptyAsk"), text: t("trash.emptyText", { n: items.length }), yes: t("trash.emptyYes"), danger: true })) act({ action: "empty" }, () => t("trash.emptied"));
    } }, ic("trash", 15), t("trash.empty"));
    M.swap(M.$main, el("div.tr-page", {}, el("div.ph", {}, el("div", {}, el("h1", {}, t("trash.title")), el("p", {}, t("trash.intro", { n: D.keep })))),
      D.low ? el("p.pn-warn", {}, ic("alert", 15), t("trash.lowDisk")) : null,
      phone ? el("p.pn-info", {}, t("trash.phoneInfo")) : null,
      el("section.card.flush.tr-list", { "aria-label": t("trash.title") },
        items.length ? el("div.tr-head", { "aria-hidden": "true" }, el("span"), el("span", {}, t("trash.colDeleted")), el("span", {}, t("trash.colBy")), el("span", {}, t("trash.colGone")), el("span"))
          : null,
        items.length ? el("div", {}, rows) : K.empty("trash", t("trash.none"), t("trash.noneHint")),
        el("div.tr-foot", {}, el("label.tr-keep", {}, el("span", {}, t("trash.keepFor")), keep), el("span.sp"),
          // (v3.0.5, tester) nothing in it: "The Trash is empty", not "The Trash uses 0 KB"
          el("small.muted", {}, items.length ? t("trash.size", { size: kb(D.bytes || 0) }) : t("trash.none")), empty)),
      el("p.muted.tr-never", {}, t("trash.never"))));
  }
  S.page("trash", { title: t("trash.title"), group: "admin", icon: "trash", allowed: () => M.isAdmin(), demoHidden: true,
    words: "trash deleted restore undo bin recycle empty", render: () => { D = null; draw(); load(); } });
})();
