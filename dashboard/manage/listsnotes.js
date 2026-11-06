// Skypane Manager — Lists & notes (v3.0.5; mockups/prototypes/settings-and-pages.html, "Lists & notes"; TESTING-NOTES
// "Lists: adding items"). The house's shared lists and the note board (service/lists.py, GET / PATCH /api/lists — the
// same ones every panel shows): add, tick and remove items; a list's quick-add chips (also on the panel's List card);
// "New list"; notes to pin to the panels (only the pinned ones show there), edit and remove; the Hubitat commands a rule
// can send through the Skypane Notifier, with "Run" to try one here. Any login may use it, phones included.
// (v3.0.5, review) "On the panel": the List card with its chips and the pinned notes, as a panel shows them; the page
// reads the lists again every POLL ms while it is open and shown (the Manager has no live feed); Undo puts a removed
// item / note back exactly as it was ("restore" / "restorenote"); a list can be renamed, and an empty one deleted —
// blocked with the "In use" dialog while a List card names it.
// Built with DOM calls + textContent only; every word from strings/en.js.
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast } = M, ic = K.icon, t = K.t;
  let D = null, cur = null, editing = null, busy = false, log = null, cmdText = null, pollT = null;
  const POLL = 15000;   // (v3.0.5)

  const nameOf = (lid) => ((D.names || {})[lid]) || (lid.charAt(0).toUpperCase() + lid.slice(1)).replace(/-/g, " ");
  const ids = () => [...new Set([...Object.keys(D.lists || {}), ...(Array.isArray(D.known) ? D.known : [])])].filter((x) => /^[a-z0-9-]{1,30}$/.test(x));
  const itemsOf = (lid) => (Array.isArray((D.lists || {})[lid]) ? D.lists[lid] : []);
  const chipsOf = (lid) => (((D.chips || {})[lid]) || []).filter((c) => typeof c === "string");
  const BY = { panel: "lists.by.panel", manager: "lists.by.manager", hubitat: "lists.by.hubitat" };
  const byWhen = (x) => [BY[x.by] ? t(BY[x.by]) : null, x.at ? K.when(x.at, "dateTime") : null].filter(Boolean).join(" · ");

  async function load() {
    try { const d = await api("/api/lists"); D = d && typeof d.lists === "object" && Array.isArray(d.notes) ? d : { failed: true }; }
    catch (e) { if (e.message !== "login") D = { failed: true }; }
    draw();
    arm();
  }
  // (v3.0.5) read again every POLL ms while the page is open and shown (a background poll: Manage.poll) — drawn only
  // when something changed and nobody is typing or editing here (what's typed stays)
  const onPage = () => S.route().page === "lists";
  const typing = () => editing != null || [...M.$main.querySelectorAll(".ln-page input, .ln-page textarea")].some((n) => n === document.activeElement || (n.value && n.value !== n.defaultValue));
  function arm() {
    clearTimeout(pollT); pollT = null;
    if (!onPage() || document.visibilityState !== "visible") return;
    pollT = setTimeout(async () => {
      pollT = null;
      if (!onPage() || document.visibilityState !== "visible") return;
      if (!busy && D && !D.failed) {
        try {
          const r = await M.poll("/api/lists");
          const d = r && r.ok ? await r.json().catch(() => null) : null;
          if (d && typeof d.lists === "object" && Array.isArray(d.notes) && JSON.stringify(d) !== JSON.stringify(D) && onPage() && !busy && !typing()) { D = d; draw(); }
        } catch {}
      }
      arm();
    }, POLL);
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && onPage() && D) arm(); });
  // one change (lists.Lists.change) → true when it was done; the page is drawn again from the answer
  async function act(body, okText) {
    if (busy) return false;
    busy = true;
    try {
      const r = await api("/api/lists", body);
      if (r && r.lists && Array.isArray(r.notes)) D = r;
      if (r.status >= 400 || r.ok === false) { if (body.action !== "command") toast(r.error ? t("lists.notDoneWhy", { why: r.error }) : t("lists.notDone"), true); return r; }
      if (okText) toast(okText);
      return r;
    } catch (e) { if (e.message !== "login") toast(t("lists.unreachable"), true); return false; }
    finally { busy = false; draw(); }
  }
  // a removed item or note: Undo (Kit.history: Ctrl+Z, ↶) puts it back — (v3.0.5) as it was: its id, words, tick,
  // time, who added it and its place (lists.py "restore" / "restorenote")
  function undoable(what, again) {
    const step = { what, undo: async () => { const r = await act(again); return !!(r && r.lists && !(r.status >= 400)); }, redo: () => false };
    if (K.history && K.history.did) K.history.did(step, what); else toast(what);
  }

  // ---------- the lists ----------
  function nav() {
    const input = el("input", { type: "text", maxlength: "40", placeholder: t("lists.newList"), "aria-label": t("lists.newList") });
    const add = async () => {
      const v = input.value.trim(); if (!v) return input.focus();
      const r = await act({ action: "newlist", name: v });
      // (its id as the server makes it: service/lists.py slug)
      if (r && r.lists && !(r.status >= 400)) { cur = v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "") || cur; input.value = ""; draw(); }
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
    return el("section.card.flush.ln-nav", { "aria-label": t("lists.lists") }, el("h3.ch", {}, ic("list", 15), t("lists.lists")),
      el("div.ln-navl", { role: "tablist" }, ids().map((k) => el("button" + (k === cur ? ".on" : ""), { type: "button", role: "tab", "aria-selected": k === cur ? "true" : "false",
        onclick: () => { cur = k; editing = null; draw(); } }, ic("list", 15), el("span.ln-nm", {}, nameOf(k)), el("span.n", {}, String(itemsOf(k).filter((i) => !i.done).length))))),
      el("div.ln-pad.ln-foot", {}, el("div.ln-row", {}, input, el("button.btn.sm", { type: "button", "aria-label": t("lists.addList"), title: t("lists.addList"), onclick: add }, ic("plus", 14)))));
  }
  function listCard() {
    if (!cur) return el("section.card.ln-list", {}, K.empty("list", t("lists.noLists"), t("lists.noListsHint")));
    const items = itemsOf(cur), open = items.filter((i) => !i.done).length, done = items.length - open;
    const input = el("input", { type: "text", maxlength: "120", placeholder: t("lists.addItem"), "aria-label": t("lists.addItem") });
    const add = async () => { const v = input.value.trim(); if (!v) return input.focus(); const r = await act({ action: "add", list: cur, text: v }); if (r && !(r.status >= 400)) { input.value = ""; } setTimeout(() => { const n = M.$main.querySelector(".ln-list input"); if (n) n.focus(); }, 0); };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
    const rows = items.length ? items.map((i) => el("div.ln-item" + (i.done ? ".done" : ""), {},
      el("button.tk", { type: "button", "aria-pressed": i.done ? "true" : "false", "aria-label": t(i.done ? "lists.untick" : "lists.tick", { name: i.text }), onclick: () => act({ action: "toggle", list: cur, id: i.id }) }, ic("check", 13)),
      el("div.tx", {}, el("span", {}, i.text), byWhen(i) ? el("small", {}, byWhen(i)) : null),
      el("button.ib.rm", { type: "button", "aria-label": t("lists.removeItem", { name: i.text }), title: t("lists.remove"), onclick: async () => {
        const at = items.indexOf(i), lst = cur, r = await act({ action: "remove", list: lst, id: i.id });
        if (r && !(r.status >= 400)) undoable(t("lists.removed", { name: i.text }), { action: "restore", list: lst, item: { ...i }, at });
      } }, ic("trash", 15)))) : [el("div.ln-pad.muted.small", {}, t("lists.emptyList"))];
    const chips = chipsOf(cur), lid = cur;
    const chipIn = el("input", { type: "text", maxlength: "40", placeholder: t("lists.newChip"), "aria-label": t("lists.newChipLabel") });
    chipIn.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      const v = chipIn.value.trim(); if (!v) return;
      const r = await act({ action: "chip", list: lid, text: v });
      if (r && !(r.status >= 400)) setTimeout(() => { const n = M.$main.querySelector(".ln-chip.add input"); if (n) n.focus(); }, 0);
    });
    return el("section.card.flush.ln-list", { "aria-label": nameOf(cur) },
      el("h3.ch", {}, ic("list", 15), nameOf(cur), el("small", {}, t("lists.counts", { open, done })),
        el("span.ln-hacts", {},
          el("button.ib", { type: "button", title: t("lists.rename"), "aria-label": t("lists.rename"), onclick: () => renameList(lid) }, ic("edit", 15)),
          el("button.ib", { type: "button", disabled: !!items.length, title: t(items.length ? "lists.deleteNotEmpty" : "lists.deleteList"),
            "aria-label": t("lists.deleteList"), onclick: () => deleteList(lid) }, ic("trash", 15)))),
      el("div.ln-pad", {}, el("div.ln-row", {}, input, el("button.btn.sm.pri", { type: "button", onclick: add }, ic("plus", 14), t("lists.add")))),
      el("div.ln-items", {}, rows),
      el("div.ln-pad.ln-foot", {},
        el("div.small.muted.ln-lab", {}, t("lists.chips"), " ", el("span", {}, t("lists.chipsWhere"))),
        el("div.ln-chips", {}, chips.map((c) => el("span.ln-chip", {},
          el("button.ln-chip-add", { type: "button", title: t("lists.chipAdd", { name: c }), onclick: () => act({ action: "add", list: lid, text: c }, t("lists.added", { name: c })) }, ic("plus", 12), c),
          el("button.x", { type: "button", "aria-label": t("lists.chipRemove", { name: c }), title: t("lists.chipRemove", { name: c }), onclick: () => act({ action: "unchip", list: lid, text: c }) }, ic("x", 12)))),
        chips.length < 12 ? el("span.ln-chip.add", {}, chipIn) : null),
        el("div.ln-row.ln-gap", {}, el("button.btn.sm.ghost", { type: "button", disabled: !done, onclick: () => act({ action: "clear", list: lid }, t("lists.cleared", { n: done })) }, t("lists.clearTicked")))));
  }
  // (v3.0.5) a list's name (its id stays: the List cards name the id), and an empty list deleted — while a List card
  // names it: blocked, the "In use" dialog with each place (Kit.trash.inUse, as a card or a picture in use)
  const errWords = (r) => ({ "name-taken": t("lists.err.nameTaken"), "not-empty": t("lists.deleteNotEmpty"), "no such list": t("lists.cmd.noList") })[r && r.error]   // i18n-ok (the server's codes)
    || (r && r.error ? t("lists.notDoneWhy", { why: r.error }) : t("lists.notDone"));
  async function renameList(lid) {
    const box = el("input", { type: "text", value: nameOf(lid), maxlength: "40", "aria-label": t("lists.listName") });
    if (!(await K.ask({ title: t("lists.renameTitle", { name: nameOf(lid) }), yes: t("lists.renameYes"), extra: box }))) return;
    const v = box.value.trim(); if (!v || v === nameOf(lid)) return;
    try {
      const r = await api("/api/lists", { action: "renamelist", list: lid, name: v });
      if (r.status >= 400 || !r.lists) toast(errWords(r), true);
      else { D = r; toast(t("lists.renamed", { name: v })); }
    } catch (e) { if (e.message !== "login") toast(t("lists.unreachable"), true); }
    draw();
  }
  async function deleteList(lid) {
    const name = nameOf(lid);
    if (itemsOf(lid).length) return toast(t("lists.deleteNotEmpty"), true);
    const words = (u) => (u.kind === "cards" ? t("trash.onPanel", { panel: u.panel }) : t("trash.onOtherPanel"));
    const inUse = (uses) => (K.trash && K.trash.inUse ? K.trash.inUse(t("lists.inUseTitle", { name }), uses || [], words, []) : toast(t("lists.notDone"), true));
    // (v3.0.5, tester) the in-use check first: a list a List card names shows where straight away, never "Are you sure?" first
    try {
      const u = await api("/api/lists", { action: "listuses", list: lid });
      if (u && u.ok && u.inUse) { await inUse(u.uses); return; }
    } catch (e) { if (e.message === "login") return; }
    if (!(await K.ask({ title: t("lists.deleteTitle", { name }), text: t("lists.deleteText"), yes: t("lists.deleteYes"), danger: true }))) return;
    // (v3.0.5, tester) what Undo puts back: the empty list, its own name and its quick-add chips
    const back = { action: "restorelist", list: lid, ...((D.names || {})[lid] ? { name: D.names[lid] } : {}), chips: chipsOf(lid).slice() };
    try {
      const r = await api("/api/lists", { action: "deletelist", list: lid });
      if (r.error === "in-use") await inUse(r.uses);   // (a List card added since the check: the server's 409 says so still)
      else if (r.status >= 400 || !r.lists) toast(errWords(r), true);
      else { D = r; if (cur === lid) cur = null; undoable(t("lists.deleted", { name }), back); }   // (v3.0.5: with Undo)
    } catch (e) { if (e.message !== "login") toast(t("lists.unreachable"), true); }
    draw();
  }
  // (v3.0.5) "On the panel" (the mockup's): the open list's List card — its first items, ticks and quick-add chips —
  // and the pinned notes, drawn as a panel shows them (a picture: nothing here is a button)
  const NOTE_COLORS = ["yellow", "pink", "blue", "green", "purple"];
  function preview() {
    const items = cur ? itemsOf(cur) : [], chips = cur ? chipsOf(cur) : [], pins = D.notes.filter((n) => n.pin !== false).slice().reverse();
    const list = cur ? el("div.ln-pc", {}, el("div.ln-pc-lb", {}, ic("list", 13), el("span", {}, nameOf(cur)), el("span.ln-pc-n", {}, t("lists.preview.left", { n: items.filter((i) => !i.done).length }))),
      el("div.ln-pc-items", {}, items.length ? items.slice(0, 6).map((i) => el("div.ln-pc-i" + (i.done ? ".done" : ""), {}, el("span.tk", { "aria-hidden": "true" }, ic("check", 13)), el("span", {}, i.text)))
        : [el("div.ln-pc-sub", {}, t("lists.emptyList"))]),
      chips.length ? el("div.ln-pc-sub.ln-pc-qa", {}, t("lists.preview.quickAdd")) : null,
      chips.length ? el("div.ln-pc-chips", {}, chips.map((c) => el("span.ln-pc-chip", {}, ic("plus", 12), c))) : null) : null;
    const notes = el("div.ln-pc", {}, el("div.ln-pc-lb", {}, ic("pin", 13), el("span", {}, t("lists.preview.pinned"))),
      el("div.ln-pc-notes", {}, pins.length ? pins.slice(0, 6).map((n) => el("div.ln-pc-note." + (NOTE_COLORS.includes(n.color) ? n.color : "yellow"), {}, ic("note", 14), el("span", {}, n.text)))
        : [el("div.ln-pc-sub", {}, t("lists.preview.noPinned"))]));
    return el("section.ln-stage", { "aria-label": t("lists.preview.title") }, el("div.ln-stage-h", {}, ic("eye", 14), t("lists.preview.title")), list, notes);
  }

  // ---------- the Hubitat commands (a rule sends them to the Skypane device) ----------
  function hubCard() {
    const input = el("input.ln-mono", { type: "text", maxlength: "320", value: cmdText ?? t("lists.cmd.example"), "aria-label": t("lists.cmd.try") });
    const out = el("div.ln-log" + (log && !log.ok ? ".bad" : ""), { role: "status" }, log ? log.text : "");
    const run = async () => {
      const v = input.value.trim(); if (!v) return input.focus();
      cmdText = v;
      const r = await act({ action: "command", text: v });
      if (!r) return;
      const why = { "not-understood": t("lists.cmd.notUnderstood"), "too-many": t("lists.cmd.tooMany"), "no such list": t("lists.cmd.noList"), "no such item": t("lists.cmd.noItem") };   // i18n-ok (the server's reasons)
      log = r.ok ? { ok: true, text: t(`lists.cmd.done.${r.done}`) } : { ok: false, text: why[r.error] || t("lists.notDoneWhy", { why: r.error || "" }) };
      draw();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
    return el("section.card.flush.ln-hub", { "aria-label": t("lists.cmd.title") }, el("h3.ch", {}, ic("server", 15), t("lists.cmd.title"), el("small", {}, t("lists.cmd.sub"))),
      el("div.ln-pad", {}, el("div.ln-cmd", {}, ["lists.cmd.add", "lists.cmd.remove", "lists.cmd.tick", "lists.cmd.note"].map((k) => el("div", {}, t(k))), el("span", {}, t("lists.cmd.how"))),
        el("div.ln-row.ln-gap", {}, input, el("button.btn.sm", { type: "button", onclick: run }, ic("play", 14), t("lists.cmd.run"))), out));
  }
  // ---------- the notes ----------
  function notesCard() {
    const input = el("input", { type: "text", maxlength: "300", placeholder: t("lists.writeNote"), "aria-label": t("lists.writeNote") });
    const add = async () => { const v = input.value.trim(); if (!v) return input.focus(); const r = await act({ action: "note", text: v }); if (r && !(r.status >= 400)) input.value = ""; };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
    const notes = D.notes.slice().reverse().sort((a, b) => (a.pin === false) - (b.pin === false));
    const rows = notes.length ? notes.map((n) => {
      const pinned = n.pin !== false;
      if (editing === n.id) {
        const box = el("textarea", { rows: "2", maxlength: "300", "aria-label": t("lists.editNote") }); box.value = n.text;
        setTimeout(() => box.focus(), 0);
        return el("div.ln-note" + (pinned ? ".pinned" : ""), {}, el("div.tx", {}, box, el("div.ln-row.ln-gap", {},
          el("button.btn.sm.pri", { type: "button", onclick: async () => { const v = box.value.trim(); if (!v) return box.focus(); const r = await act({ action: "editnote", id: n.id, text: v }); if (r && !(r.status >= 400)) { editing = null; draw(); } } }, t("lists.save")),
          el("button.btn.sm.ghost", { type: "button", onclick: () => { editing = null; draw(); } }, t("control.cancel")))));
      }
      return el("div.ln-note" + (pinned ? ".pinned" : ""), {}, el("div.tx", {}, el("span", {}, n.text), el("small", {}, [byWhen(n), pinned ? t("lists.pinnedWhere") : null].filter(Boolean).join(" · "))),
        el("div.acts", {},
          el("button.ib" + (pinned ? ".on" : ""), { type: "button", "aria-pressed": pinned ? "true" : "false", title: t(pinned ? "lists.unpin" : "lists.pin"), "aria-label": t(pinned ? "lists.unpin" : "lists.pin"),
            onclick: () => act({ action: "pin", id: n.id, pin: !pinned }, t(pinned ? "lists.unpinned" : "lists.pinned")) }, ic("pin", 15)),
          el("button.ib", { type: "button", title: t("lists.editNote"), "aria-label": t("lists.editNote"), onclick: () => { editing = n.id; draw(); } }, ic("edit", 15)),
          el("button.ib", { type: "button", title: t("lists.removeNote"), "aria-label": t("lists.removeNote"), onclick: async () => {
            const at = D.notes.indexOf(n), r = await act({ action: "unnote", id: n.id });
            if (r && !(r.status >= 400)) undoable(t("lists.noteRemoved"), { action: "restorenote", note: { ...n }, at });
          } }, ic("trash", 15))));
    }) : [el("div.ln-pad.muted.small", {}, t("lists.noNotes"))];
    return el("section.card.flush.ln-notes", { "aria-label": t("lists.notes") }, el("h3.ch", {}, ic("note", 15), t("lists.notes"), el("small", {}, t("lists.notesSub"))),
      el("div.ln-pad", {}, el("div.ln-row", {}, input, el("button.btn.sm", { type: "button", "aria-label": t("lists.addNote"), title: t("lists.addNote"), onclick: add }, ic("plus", 14)))),
      el("div.ln-items", {}, rows));
  }

  function draw() {
    if (S.route().page !== "lists") return;
    if (!D) { M.$main.replaceChildren(el("p.muted", {}, t("common.loading"))); return; }
    if (D.failed) { M.$main.replaceChildren(K.empty("list", t("lists.cantRead"), t("lists.tryAgain"))); return; }
    const all = ids();
    if (!cur || !all.includes(cur)) cur = all.includes("shopping") ? "shopping" : all[0] || null;
    M.swap(M.$main, el("div.ln-page", {}, el("div.ph", {}, el("div", {}, el("h1", {}, t("lists.title")), el("p", {}, t("lists.intro")))),
      el("div.ln-grid", {}, nav(), el("div.ln-col", {}, listCard(), hubCard()), el("div.ln-col.ln-ncol", {}, notesCard(), preview()))));
  }
  S.page("lists", { title: t("lists.title"), group: "manage", icon: "list", words: "lists notes shopping to do chores note board pin quick add chips hubitat",
    render: () => { D = null; log = null; editing = null; clearTimeout(pollT); pollT = null; draw(); load(); } });
})();
