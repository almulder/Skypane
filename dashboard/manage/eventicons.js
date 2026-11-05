// Skypane Manager — Integrations → Calendars → Event icons (v3.0.2, the admin; service/event_icons.py, the CR
// mockups/CR-event-icons.md, owner's guide docs/calendar-icons.md). The house's one list of which words in an event's
// title show which icon and colour: a row per icon (its icon, name, colour, words as chips, on / off), dragged by its
// grip — or ▲ ▼ — into order: the first match from the top wins. "Add an icon", "Try a title", "Reset to defaults" (the house
// language's). Changes stay on this page until Save; the panels pick a saved list up within seconds (the server says
// dashboard/calendars/changed). A phone shows the list to read. Drawn with DOM calls + textContent only.
(function () {
  const M = window.Manage;
  const { el, api, toast, iconEl } = M;
  const K = window.Kit;
  // the panel's very line (dashboard/layouts/v4/shared/data.js) — so "Try a title" says what a panel will show
  // (test_event_icons.py checks the two are the same)
  const wordRe = (words) => new RegExp(`(?:^|[^\\p{L}\\p{M}\\p{N}])(?:${words.map((w) => w.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).map((w) => (/[^\\]y$/.test(w) ? `${w}|${w.slice(0, -1)}ies` : w)).join("|")})(?:s|es|er|ers|ing|ed|ist|ists)?(?![\\p{L}\\p{M}\\p{N}])`, "u");
  const COLOR_RE = /^#[0-9a-f]{6}$/;
  const PLAIN = { icon: "calendar", color: "#a99fd0" };   // (no word matched: the panel's plain calendar icon)
  // st: {saved, list (being edited), defaults, available, max, lang, edited, damaged}; kept while the Manager is open,
  // so the Integrations page drawing itself again (its checks, a save) never drops what's being changed
  let st = null, box = null, open = false, tryText = "", picking = null, add = null, focusKey = null, saving = false;
  let typed = {};   // (v3.0.2: icon id → a word typed in its box, not added yet — Save adds it, a redraw keeps it)
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const hasTyped = () => Object.values(typed).some((v) => String(v).trim());
  const dirty = () => !!st && (JSON.stringify(st.list) !== JSON.stringify(st.saved) || hasTyped());
  const max = () => (st && st.max) || { icons: 60, words: 30, word: 40, name: 40 };
  // (as the server keeps a word — event_icons.clean_word: lowercase, one space; letters (their accents too), digits,
  // spaces and .'-& only. v3.0.2: a word with anything else is refused, not cut into another word; one letter is too short)
  const cleanWord = (w) => String(w || "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  const wordOk = (w) => [...w].length >= 2 && w.length <= max().word && /^[\p{L}\p{M}\p{N} .'&-]+$/u.test(w) && /[\p{L}\p{N}]/u.test(w);
  // (a redraw on leaving a field waits for the press that left it: its click must land on the button it went down on —
  // "type a word, click Save" — never on whatever was drawn in its place)
  let down = false;
  document.addEventListener("pointerdown", () => { down = true; }, true);
  document.addEventListener("pointerup", () => setTimeout(() => { down = false; }), true);
  document.addEventListener("pointercancel", () => { down = false; }, true);
  const afterPress = (fn) => {
    if (!down) return setTimeout(fn);
    let done = false;
    const go = () => { if (done) return; done = true; document.removeEventListener("pointerup", go, true); document.removeEventListener("pointercancel", go, true); setTimeout(fn, 30); };
    document.addEventListener("pointerup", go, true); document.addEventListener("pointercancel", go, true);
    setTimeout(go, 3000);   // (a release that never came)
  };

  // which icon wins for a title, and the word that matched — the panel's rule over the list as it is on this page
  function winner(title) {
    const t = String(title || "").toLowerCase();
    for (const c of st.list) {
      const ws = c.on ? c.words.filter((w) => w.trim()) : [];
      if (ws.length && wordRe(ws).test(t)) return { c, word: ws.find((w) => wordRe([w]).test(t)) };
    }
    return null;
  }

  async function load() {
    const r = await api("/api/manage/event-icons");
    if (!r || !Array.isArray(r.icons)) throw new Error("no list");   // i18n-ok (caught: never shown)
    take(r);
  }
  function take(r) {
    st = { saved: copy(r.icons), list: copy(r.icons), defaults: r.defaults || [], available: r.available || [], max: r.max,
      lang: r.lang, edited: !!r.edited, damaged: !!r.damaged };
  }
  // the icons a panel can draw: the server's list (icons.js on the server), the ones this page's icons.js knows too
  const names = () => { const mine = new Set(window.ICON_NAMES || []); return (st.available || []).filter((n) => mine.has(n)); };

  async function save() {
    if (saving) return false;
    // (a word still in its box, not added with Enter: it goes along — "type zumba, click Save" saves zumba)
    let more = false;
    for (const c of st.list) if (typed[c.id] && String(typed[c.id]).trim() && addWords(c, typed[c.id])) more = true;
    if (Object.keys(typed).length) { typed = {}; more = true; }
    const bad = st.list.findIndex((c) => !c.name.trim());
    if (bad >= 0) { toast(K.t("eventIcons.nameMissing", { n: bad + 1 }), true); if (more) draw(); return false; }
    // (what was sent: a change made while the answer is on its way stays a change — only "saved" follows the server)
    const sent = JSON.stringify(st.list);
    saving = true;
    if (more) draw(); else drawBar();
    try {
      const r = await api("/api/manage/event-icons", { icons: st.list.map((c) => ({ ...c, name: c.name.trim() })) });
      if (!r.ok) { toast(r.error ? K.t("eventIcons.notSavedWhy", { why: r.error }) : K.t("eventIcons.notSaved"), true); return false; }
      saving = false;
      if (JSON.stringify(st.list) === sent && !hasTyped()) { take(r); draw(); }
      else { const keep = st.list; take(r); st.list = keep; drawBar(); }
      toast(K.t("eventIcons.saved"));
      return true;
    } catch (e) { if (e.message !== "login") toast(K.t("eventIcons.unreachable"), true); return false; }
    finally { if (saving) { saving = false; drawBar(); } }
  }
  M.saveEventIcons = () => (st && dirty() ? save() : Promise.resolve(true));   // (Integrations: "Save the event icons too" before a restart)
  async function reset() {
    if (!(await K.ask({ title: K.t("eventIcons.resetTitle"), text: K.t("eventIcons.resetText"), yes: K.t("eventIcons.reset"), danger: true }))) return;
    try {
      const r = await api("/api/manage/event-icons", { action: "reset" });
      if (!r.ok) { toast(r.error || K.t("eventIcons.notSaved"), true); return; }
      take(r); picking = null; typed = {}; draw(); toast(K.t("eventIcons.resetDone"));
    } catch (e) { if (e.message !== "login") toast(K.t("eventIcons.unreachable"), true); }
  }

  // ---- one icon's row ----
  // (a change that the row shows by itself — typing a name, a colour, the switch — only updates the bar; the others redraw)
  const changed = (redraw) => { if (redraw) draw(); else drawBar(); };
  function addWords(c, text) {
    const room = max().words - c.words.length;
    const all = String(text).split(",").map(cleanWord).filter(Boolean), no = all.filter((w) => !wordOk(w));
    if (no.length) toast(K.t("eventIcons.badWord", { word: no[0].slice(0, 40) }), true);   // (refused, never changed into another word)
    const ws = all.filter((w) => wordOk(w) && !c.words.includes(w));
    if (!ws.length) return false;
    if (room <= 0) { toast(K.t("eventIcons.tooManyWords", { n: max().words }), true); return false; }
    c.words.push(...[...new Set(ws)].slice(0, room));
    return true;
  }
  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= st.list.length) return;
    [st.list[i], st.list[j]] = [st.list[j], st.list[i]];
    focusKey = `${d < 0 ? "up" : "down"}:${st.list[j].id}`;
    changed(true);
  }
  function row(c, i) {
    const n = st.list.length, face = el("button.ghost.ei-face", { type: "button", style: `color:${c.color};background:${c.color}22`,
      title: K.t("eventIcons.pickTip"), "aria-label": K.t("eventIcons.pick", { name: c.name }), "aria-expanded": String(picking === c.id),
      onclick: () => { picking = picking === c.id ? null : c.id; focusKey = `face:${c.id}`; draw(); }, "data-fk": `face:${c.id}` }, iconEl(c.icon, 22));
    const wordIn = el("input.ei-add", { type: "text", placeholder: K.t("eventIcons.addWord"), maxlength: String(max().word * 4), "data-fk": `word:${c.id}`,
      "aria-label": K.t("eventIcons.addWordTo", { name: c.name }), onkeydown: (e) => {
        if (e.key === "Enter" || e.key === ",") {
          e.preventDefault();
          delete typed[c.id];
          if (addWords(c, wordIn.value)) { focusKey = `word:${c.id}`; changed(true); } else { wordIn.value = ""; drawBar(); }
        } else if (e.key === "Backspace" && !wordIn.value && c.words.length) { c.words.pop(); focusKey = `word:${c.id}`; changed(true); }
      },
      oninput: () => { if (wordIn.value) typed[c.id] = wordIn.value; else delete typed[c.id]; drawBar(); },   // (Save can be pressed with a word still typed)
      // (a word typed and left without Enter: kept too, not lost — added at once, the row drawn again after the press
      // that left the box: a click on Save / Undo lands where it went down)
      onblur: () => {
        if (!wordIn.isConnected || !wordIn.value.trim() || typed[c.id] === undefined) return;
        delete typed[c.id];
        if (!addWords(c, wordIn.value)) { wordIn.value = ""; drawBar(); return; }
        drawBar();
        afterPress(() => { if (box && box.contains(wordIn)) draw(); });
      } });
    if (typed[c.id]) wordIn.value = typed[c.id];   // (a redraw keeps it; the starting value stays empty)
    const chips = c.words.map((w) => el("span.ei-chip", {}, el("span", {}, w),
      el("button.ei-x", { type: "button", title: K.t("eventIcons.removeWord", { word: w }), "aria-label": K.t("eventIcons.removeWord", { word: w }),
        onclick: () => { c.words = c.words.filter((x) => x !== w); focusKey = `word:${c.id}`; changed(true); } }, "×")));   // i18n-ok (a sign)
    const r = el("div.ei-row" + (c.on ? "" : ".off"), { role: "listitem" },
      // (only the grip drags — Kit.reorder, v3.0.4: the row's fields stay selectable)
      K.reorder.grip(c.id, c.name, { "data-fk": `grip:${c.id}` }),
      el("span.ei-n", { "aria-hidden": "true" }, String(i + 1)),
      face,
      el("div.ei-main", {},
        el("div.ei-top", {},
          el("input.ei-name", { type: "text", value: c.name, maxlength: String(max().name), "aria-label": K.t("eventIcons.name"), "data-fk": `name:${c.id}`,
            oninput: (e) => { c.name = e.target.value; changed(false); } }),
          el("input.cal-color", { type: "color", value: COLOR_RE.test(c.color) ? c.color : PLAIN.color, title: K.t("eventIcons.colorTip"), "aria-label": K.t("eventIcons.color", { name: c.name }),
            oninput: (e) => { c.color = e.target.value.toLowerCase(); face.style.color = c.color; face.style.background = `${c.color}22`; changed(false); } }),
          K.sw(c.on, (v) => { c.on = v; r.classList.toggle("off", !v); changed(false); }, K.t("eventIcons.onLabel", { name: c.name }))),
        el("div.ei-words", {}, ...chips, c.words.length < max().words ? wordIn : el("small.muted", {}, K.t("eventIcons.wordsFull", { n: max().words }))),
        !c.words.length ? el("small.muted", {}, K.t("eventIcons.noWords")) : null,
        picking === c.id ? picker(c.icon, (name) => { c.icon = name; picking = null; focusKey = `face:${c.id}`; changed(true); }) : null),
      el("span.ei-acts", {},
        el("button.pn-ar", { type: "button", disabled: i === 0, onclick: () => move(i, -1), "aria-label": K.t("eventIcons.up", { name: c.name }), "data-fk": `up:${c.id}` }, K.icon("chevU", 14)),
        el("button.pn-ar", { type: "button", disabled: i === n - 1, onclick: () => move(i, 1), "aria-label": K.t("eventIcons.down", { name: c.name }), "data-fk": `down:${c.id}` }, K.icon("chevD", 14)),
        el("button.pn-ar", { type: "button", title: K.t("eventIcons.remove", { name: c.name }), "aria-label": K.t("eventIcons.remove", { name: c.name }),
          onclick: () => { st.list.splice(i, 1); if (picking === c.id) picking = null; changed(true); } }, K.icon("trash", 14))));
    return r;
  }

  // the icons to choose from (a filter on top: their code names)
  function picker(current, choose) {
    let q = "";
    const grid = el("div.ei-grid", { role: "listbox", "aria-label": K.t("eventIcons.pickTitle") });
    const fill = () => grid.replaceChildren(...names().filter((n) => !q || n.toLowerCase().includes(q)).map((n) =>
      el("button.ghost.ei-pic" + (n === current ? ".cur" : ""), { type: "button", role: "option", "aria-selected": String(n === current), title: n, onclick: () => choose(n) }, iconEl(n, 22))));
    fill();
    return el("div.ei-pick", {},
      el("input", { type: "search", placeholder: K.t("eventIcons.pickFind"), "aria-label": K.t("eventIcons.pickFind"), oninput: (e) => { q = e.target.value.trim().toLowerCase(); fill(); } }),
      grid);
  }

  // ---- "Add an icon" ----
  function addForm() {
    if (st.list.length >= max().icons) return el("small.muted", {}, K.t("eventIcons.atMost", { n: max().icons }));
    if (!add) return el("button.ghost.small", { type: "button", onclick: () => { add = { name: "", icon: "star", color: "#a78bfa", words: "", pick: false }; draw(); } }, K.icon("plus", 14), K.t("eventIcons.add"));
    const name = el("input", { type: "text", placeholder: K.t("eventIcons.addNamePh"), maxlength: String(max().name), value: add.name, "aria-label": K.t("eventIcons.name"), oninput: (e) => { add.name = e.target.value; } });
    const words = el("input", { type: "text", placeholder: K.t("eventIcons.addWordsPh"), value: add.words, "aria-label": K.t("eventIcons.addWords"), oninput: (e) => { add.words = e.target.value; } });
    const face = el("button.ghost.ei-face", { type: "button", style: `color:${add.color};background:${add.color}22`, "aria-label": K.t("eventIcons.pickTitle"), "aria-expanded": String(add.pick),
      onclick: () => { add.pick = !add.pick; draw(); } }, iconEl(add.icon, 22));
    return el("form.ei-addform", { onsubmit: (e) => {
      e.preventDefault();
      const nm = add.name.trim().replace(/\s+/g, " ");
      if (!nm) return toast(K.t("eventIcons.addNameFirst"), true);
      const c = { id: newId(nm), name: nm, icon: add.icon, color: add.color, words: [], on: true };
      addWords(c, add.words);
      st.list.unshift(c);   // (at the top: it wins over the others — drag it down where it belongs)
      add = null; changed(true); toast(K.t("eventIcons.added"));
    } },
      el("b", {}, K.t("eventIcons.addTitle")),
      el("div.ei-top", {}, face, name,
        el("input.cal-color", { type: "color", value: add.color, "aria-label": K.t("eventIcons.colorTip"), oninput: (e) => { add.color = e.target.value.toLowerCase(); face.style.color = add.color; face.style.background = `${add.color}22`; } })),
      words,
      add.pick ? picker(add.icon, (n) => { add.icon = n; add.pick = false; draw(); }) : null,
      el("small.muted", {}, K.t("eventIcons.addHint")),
      el("div.ei-bar", {}, el("button.small", { type: "submit" }, K.t("eventIcons.addButton")),
        el("button.ghost.small", { type: "button", onclick: () => { add = null; draw(); } }, K.t("calendars.cancel"))));
  }
  function newId(name) {
    const base = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "icon";
    const ids = new Set(st.list.map((c) => c.id));
    let id = base, k = 2;
    while (ids.has(id)) id = `${base}-${k++}`;
    return id;
  }

  // ---- "Try a title" ----
  function tryBox() {
    const out = el("div.ei-result", { "aria-live": "polite" });
    const show = () => {
      const v = tryText.trim();
      if (!v) return out.replaceChildren(el("small.muted", {}, K.t("eventIcons.tryHint")));
      const h = winner(v), c = h ? h.c : PLAIN;
      out.replaceChildren(el("span.ei-face", { style: `color:${c.color};background:${c.color}22` }, iconEl(c.icon, 22)),
        el("div", {}, el("b", {}, h ? h.c.name : K.t("eventIcons.plain")),
          el("small.muted", {}, h ? K.t("eventIcons.matched", { word: h.word, n: st.list.indexOf(h.c) + 1 }) : K.t("eventIcons.noMatch"))));
    };
    show();
    return el("div.ei-try", {}, el("b", {}, K.t("eventIcons.tryTitle")),
      el("input", { type: "text", value: tryText, placeholder: K.t("eventIcons.tryPh"), "aria-label": K.t("eventIcons.tryTitle"), autocomplete: "off",
        oninput: (e) => { tryText = e.target.value; show(); } }),
      out);
  }

  // ---- the bar: what's changed, Save / Undo, Reset ----
  // (v3.0.2: its buttons are made once per draw and only switched on / off here — a bar drawn again under a pressed
  // mouse never got the click)
  let bar = null, marker = null, barText = null, barBtns = null;
  const discard = () => { if (!st) return; st.list = copy(st.saved); typed = {}; picking = null; add = null; };
  function drawBar() {
    if (!bar || !st) return;
    const d = dirty();
    if (marker) marker.value = d ? "1" : "";   // (the Manager's unsaved-changes guard reads it)
    const on = st.list.filter((c) => c.on).length;
    if (!barBtns) {
      barText = el("small.muted.grow");
      barBtns = [el("button.ghost.small", { type: "button", onclick: reset }, K.t("eventIcons.reset")),
        el("button.ghost.small", { type: "button", onclick: () => { discard(); draw(); } }, K.t("eventIcons.undo")),
        el("button.small", { type: "button", onclick: () => save() }, K.t("eventIcons.save"))];
      bar.replaceChildren(barText, ...barBtns);
    }
    barText.textContent = [K.t("eventIcons.count", { n: st.list.length }), on < st.list.length ? K.t("eventIcons.offCount", { n: st.list.length - on }) : null,
      d ? K.t("eventIcons.unsaved") : st.edited ? K.t("eventIcons.edited") : K.t("eventIcons.isDefaults")].filter(Boolean).join(" · ");
    barBtns[0].disabled = saving;
    barBtns[1].disabled = saving || !d;
    barBtns[2].disabled = saving || !d;   // (while a save is on its way: one at a time)
  }

  function draw() {
    if (!box) return;
    if (!st) { box.replaceChildren(el("h4", {}, K.t("eventIcons.title")), el("p.muted", {}, K.t("common.loading"))); return; }
    const head = el("summary", {}, el("b", {}, K.t("eventIcons.title")), el("small.muted", {}, " — ", K.t("eventIcons.summary", { n: st.list.filter((c) => c.on).length })));
    if (window.Shell && Shell.isPhone()) {   // (desktop-first: a phone reads the list — editing on a computer)
      box.replaceChildren(el("details", {}, head, el("div.ei-list", {}, st.list.map((c) => el("div.ei-row.ro" + (c.on ? "" : ".off"), {},
        el("span.ei-face", { style: `color:${c.color};background:${c.color}22` }, iconEl(c.icon, 20)),
        el("div.ei-main", {}, el("b", {}, c.name), el("small.muted", {}, c.words.join(", ")))))), el("small.muted", {}, K.t("eventIcons.phone"))));
      return;
    }
    const prevFocus = focusKey; focusKey = null;
    marker = el("input.sr-hide", { type: "text", tabindex: "-1", "aria-hidden": "true", value: "" });
    bar = el("div.ei-bar"); barBtns = null;
    const det = el("details", { open, ontoggle: () => { open = det.open; } }, head,
      el("p.muted", {}, K.t("eventIcons.intro")),
      st.damaged ? el("p.warn", {}, K.t("eventIcons.damaged")) : null,
      tryBox(),
      addForm(),
      K.reorder.list(el("div.ei-list", { role: "list", "aria-label": K.t("eventIcons.listLabel") }, st.list.map(row)), "eventIcons",
        { name: (i) => st.list[i].name, move: (i, j) => { const [mv] = st.list.splice(i, 1); st.list.splice(j, 0, mv); focusKey = `grip:${mv.id}`; changed(true); } }),
      st.list.length ? null : el("p.muted", {}, K.t("eventIcons.empty")),
      bar);
    box.replaceChildren(marker, det);
    drawBar();
    // (v3.0.2: ▲ to the top / ▼ to the bottom disables the arrow pressed — the focus goes to the other one, else the name)
    if (prevFocus) {
      const id = prevFocus.replace(/^[a-z]+:/, "");
      const b = [prevFocus, prevFocus.replace(/^up:/, "down:"), prevFocus.replace(/^down:/, "up:")].map((k) => box.querySelector(`[data-fk="${k}"]`)).find((x) => x && !x.disabled)
        || box.querySelector(`[data-fk="name:${id}"]`);
      if (b) b.focus();
    }
  }

  // the part of the Calendars card on Integrations (calendars.js puts it under the calendars); the same element each time
  // the page draws itself again, so what's typed stays
  // (v3.0.2: already drawn — the calendars card drawing itself again — it's handed back as it is: the focus, the caret and
  // a half-typed word stay)
  let drawnPhone = null;
  M.eventIconsCard = () => {
    if (!box) box = el("div.ei-card", { "data-unsaved": K.t("eventIcons.title") });
    const ph = !!(window.Shell && Shell.isPhone());
    if (!st) { draw(); load().then(draw).catch((e) => { if (e.message !== "login" && box) box.replaceChildren(el("p.muted", {}, K.t("eventIcons.loadFailed"))); }); }
    else if (!box.firstChild || drawnPhone !== ph) draw();
    drawnPhone = ph;
    return box;
  };
  M.onReset && M.onReset(() => { st = null; add = null; picking = null; tryText = ""; typed = {}; saving = false; });   // (signed out: nothing kept)
  // (v3.0.2) "Leave without saving" drops the changes, as on Panels: the list goes back to the saved one — no question
  // again at every later leave
  const leaveOk0 = M.leaveOk;
  if (leaveOk0) M.leaveOk = async (...a) => { const was = !!st && dirty(); const ok = await leaveOk0(...a); if (ok && was && st) { discard(); if (marker) marker.value = ""; if (box) box.replaceChildren(); } return ok; };
})();
