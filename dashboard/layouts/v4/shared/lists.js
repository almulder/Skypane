// Shared lists (to-do, shopping…) and the family note board (release 2; service/lists.py): every panel shows the same
// ones and anyone can tick, add or remove — like a paper list on the fridge. Loaded from /api/lists, changed with one
// small action at a time; the service announces a change (dashboard/lists/changed) and every panel loads them again.
// The builder's demo canvas changes only its own copy (nothing is saved).
// (v3.0.5) A list's quick-add chips (set in the Manager's Lists & notes page) sit under its items: a tap adds that item.
// Only the pinned notes show (a note written in the Manager starts unpinned: "pin": false).
(function () {
  const H = Home, esc = (s) => UI.esc(s);
  const L = { doc: { lists: {}, notes: [] }, ok: false };
  const DESIGN = window.PANEL_DESIGN === true;
  async function load() {
    try {
      const r = await fetch("/api/lists", { cache: "no-store" });
      if (r.ok) { const d = await r.json(); if (d && typeof d.lists === "object" && Array.isArray(d.notes)) { L.doc = d; L.ok = true; H.refresh(); } }
    } catch {}
  }
  load();
  H.subscribe("dashboard/lists/changed", load);
  setInterval(load, 5 * 60000);   // (a missed announcement: never stale for long)

  async function change(req) {
    if (DESIGN) {   // (the demo: only this page's copy)
      const d = L.doc, items = (d.lists[req.list] ||= []);
      if (req.action === "add") items.push({ id: Math.random().toString(16).slice(2, 10), text: req.text, done: false });
      if (req.action === "toggle") { const i = items.find((x) => x.id === req.id); if (i) i.done = !i.done; }
      if (req.action === "remove") d.lists[req.list] = items.filter((x) => x.id !== req.id);
      if (req.action === "clear") d.lists[req.list] = items.filter((x) => !x.done);
      if (req.action === "note") d.notes.push({ id: Math.random().toString(16).slice(2, 10), text: req.text, color: req.color || "yellow" });
      if (req.action === "unnote") d.notes = d.notes.filter((n) => n.id !== req.id);
      H.refresh(); return;
    }
    try {
      const r = await fetch("/api/lists", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
      const d = await r.json().catch(() => null);
      if (r.ok && d && d.lists) { L.doc = d; H.refresh(); }
    } catch {}
  }
  // (v3.0.5) a chip's tap: locked while its request is out and CHIP_LOCK ms after (a double tap adds it once; the
  // server also ignores the same unticked item again within 2 s)
  const CHIP_LOCK = 800, chipBusy = new Set();
  const chipKey = (list, text) => `${list}|${text}`;   // (a list id never has a "|")
  const id8 = (s) => String(s || "").replace(/[^0-9a-f]/g, "").slice(0, 8);
  const lid = (s) => String(s || "").replace(/[^a-z0-9-]/g, "").slice(0, 30);
  L.toggle = (list, id) => change({ action: "toggle", list: lid(list), id: id8(id) });
  L.remove = (list, id) => change({ action: "remove", list: lid(list), id: id8(id) });
  L.clear = (list) => change({ action: "clear", list: lid(list) });
  L.unnote = (id) => change({ action: "unnote", id: id8(id) });
  // (v3.0.5) a quick-add chip: its words added to the list — the chip's own text is sent (chip: true), and the server
  // checks it is still one of that list's chips
  L.chip = async (list, text, btn) => {
    const l = lid(list), c = typeof text === "string" ? text : "", k = chipKey(l, c);
    if (!c || chipBusy.has(k) || !(((L.doc.chips || {})[l]) || []).includes(c)) return;
    chipBusy.add(k);
    if (btn && btn.setAttribute) btn.setAttribute("disabled", "");
    try { await change({ action: "add", list: l, text: c, chip: true }); }
    finally { setTimeout(() => { chipBusy.delete(k); H.refresh(); }, CHIP_LOCK); }
  };
  // the "add" fields: Enter or the + button sends what's typed
  L.add = (btn) => {
    const box = btn.closest("[data-list], [data-notes]"), inp = box && box.querySelector("input"), text = inp && inp.value.trim();
    if (!text) return inp && inp.focus();
    inp.value = "";
    if (box.dataset.list) change({ action: "add", list: lid(box.dataset.list), text });
    else change({ action: "note", text, color: box.querySelector("select") ? box.querySelector("select").value : "yellow" });
  };
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches && e.target.matches(".ls-add input")) L.add(e.target); });

  // a list card: the items (a tap ticks one), done ones last (or hidden), "+ add", "clear the done ones"
  L.card = (o) => {
    const list = lid(o.list) || "shopping", items = (L.doc.lists[list] || []).slice();
    const open = items.filter((i) => !i.done), done = items.filter((i) => i.done);
    const chips = (((L.doc.chips || {})[list]) || []).filter((c) => typeof c === "string").slice(0, 12);
    const row = (i) => `<div class="ls-i${i.done ? " done" : ""}"><button class="ls-ck"${Acts.on("ls.toggle", list, id8(i.id))} aria-label="${esc(T("ls.done"))}">${i.done ? icon("check", 18) : ""}</button>`
      + `<span>${esc(i.text)}</span><button class="ls-x"${Acts.on("ls.remove", list, id8(i.id))} aria-label="${esc(T("ls.remove"))}">✕</button></div>`;
    return `<div class="ls">${o.title !== "" ? `<div class="gc-t">${esc(o.title || T.named("ls.name", list, list[0].toUpperCase() + list.slice(1)))}${open.length ? ` · ${open.length}` : ""}</div>` : ""}
      <div class="ls-list">${open.map(row).join("")}${o.hideDone ? "" : done.map(row).join("")}${items.length ? "" : `<div class="gc-empty">${esc(T("ls.empty"))}</div>`}</div>
      ${chips.length ? `<div class="ls-chips" role="group" aria-label="${esc(T("ls.quickAdd"))}">${chips.map((c) => `<button class="ls-chip"${Acts.on("ls.chip", list, c)}${chipBusy.has(chipKey(list, c)) ? " disabled" : ""}>+ ${esc(c)}</button>`).join("")}</div>` : ""}
      <div class="ls-add" data-list="${list}"><input type="text" maxlength="120" placeholder="${esc(T("ls.addPlaceholder"))}" enterkeyhint="done"><button${Acts.on("ls.add")} aria-label="${esc(T("ls.add"))}">+</button>
      ${done.length ? `<button class="ls-clr"${Acts.on("ls.clear", list)}>${esc(T("ls.clearDone", { n: done.length }))}</button>` : ""}</div></div>`;
  };
  // the note board: sticky notes in five colors, newest first; ✕ takes one down
  // (v3.0.5) the color picker's label: "ls.color" — a language file that still says "ls.colour" keeps its words
  const colorWord = () => {
    const tabs = window.PANEL_STRINGS || {}, l = T.lang ? T.lang() : "en";
    for (const tab of [tabs[l], tabs[l.split("-")[0]]]) {
      if (tab && Object.prototype.hasOwnProperty.call(tab, "ls.color")) break;
      if (tab && typeof tab["ls.colour"] === "string") return tab["ls.colour"];
    }
    return T("ls.color");
  };
  L.notes = (o) => {
    const notes = L.doc.notes.filter((n) => n.pin !== false).reverse();   // (v3.0.5: only the pinned ones)
    return `<div class="ls">${o.title !== "" ? `<div class="gc-t">${esc(o.title || T("ls.notes"))}</div>` : ""}
      <div class="nt-board">${notes.map((n) => `<div class="nt ${["yellow", "pink", "blue", "green", "purple"].includes(n.color) ? n.color : "yellow"}"><span>${esc(n.text)}</span>`
        + `<button class="ls-x"${Acts.on("ls.unnote", id8(n.id))} aria-label="${esc(T("ls.takeDown"))}">✕</button></div>`).join("") || `<div class="gc-empty">${esc(T("ls.noNotes"))}</div>`}</div>
      <div class="ls-add" data-notes="1"><input type="text" maxlength="300" placeholder="${esc(T("ls.notePlaceholder"))}" enterkeyhint="done">
        <select aria-label="${esc(colorWord())}">${["yellow", "pink", "blue", "green", "purple"].map((c) => `<option value="${c}">${esc(T(`ls.c.${c}`))}</option>`).join("")}</select>
        <button${Acts.on("ls.add")} aria-label="${esc(T("ls.pin"))}">+</button></div></div>`;
  };
  // the cards' buttons (acts.js)
  Acts.add({ "ls.toggle": (l, id) => L.toggle(l, id), "ls.remove": (l, id) => L.remove(l, id), "ls.add": (el) => L.add(el),
    "ls.clear": (l) => L.clear(l), "ls.unnote": (id) => L.unnote(id), "ls.chip": (l, c, el) => L.chip(l, c, el) });
  window.Lists = L;
})();
