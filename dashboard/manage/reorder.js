// Skypane Manager — drag to reorder (v3.0.4; mockups/prototypes/manager-reorder.html): one way for every Manager list
// with ▲ ▼ (Rooms & devices, Camera views, Event icons). Each row gets a grip that drags — pointer events, so a mouse,
// a pen and a finger — with a drop line, a "To place N" chip, scrolling by itself near an edge, Esc to cancel. The
// keyboard on the grip: Alt+↑ ↓ moves it one place, or Space picks it up, ↑ ↓ choose, Space / Enter drops, Esc cancels;
// a screen reader hears each step. Every move is one Undo (the toast's button, or Ctrl+Z on a grip). The list saves the
// way its ▲ ▼ do: move(from, to) is the list's own. Kit.reorder: grip(id, name) on each row, list(box, key, {name, move})
// on the rows' parent (key: the list's own name — after a redraw its grip gets the focus back).
(function () {
  const M = window.Manage, K = window.Kit;
  const { el } = M;
  let DR = null;     // the drag in progress
  let KP = null;     // a row picked up with the keyboard (Space)
  // (v3.0.5) undo / redo on the Manager's lists: every move is a step (up to 30), undone and redone with the ↶ ↷ buttons
  // that show while there is one, the toast's Undo, or Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (⌘ on a Mac) — never while typing
  // in a box (its own undo), nor in the layout builder (its own steps). Kit.history.push({what, undo, redo}) takes
  // other steps too; a new step clears what could be redone; another page starts afresh.
  const HIST = { undo: [], redo: [] }, HMAX = 30;
  let bar = null;
  let live = null, chip = null, toastT = null, toastUndo = null, pending = false;   // (v3.0.5: pending — a step waiting for the server)
  const GRIP = "[data-grip]";   // i18n-ok (a selector)

  const say = (text) => {   // (for a screen reader)
    if (!live) { live = el("div.sr-hide", { "aria-live": "assertive" }); document.body.append(live); }
    live.textContent = text;
  };
  // the Manager's toast, with an Undo button (manage.js's own toast() puts plain text back in it)
  function toast(text, undo) {
    const t = document.getElementById("toast");
    if (!t) return;
    toastUndo = undo ? el("button.rr-undo", { type: "button", onclick: undoLast, disabled: pending }, K.icon("undo", 14), K.t("reorder.undo")) : null;   // (v3.0.5: kept, so a step waiting disables it)
    t.replaceChildren(el("span", {}, text), ...(toastUndo ? [toastUndo] : []));
    t.className = "show";
    t.classList.add("rr");
    clearTimeout(toastT);
    toastT = setTimeout(() => { if (t.classList.contains("rr")) t.className = ""; }, undo ? 6000 : 2800);
  }

  // the rows: the list's children with a grip; a grip's row is its ancestor right under the list
  const rowsOf = (box) => [...box.children].filter((r) => r.querySelector(GRIP));
  function listOf(g) {
    let r = g;
    while (r && r.parentElement && !r.parentElement.hasAttribute("data-rlist")) r = r.parentElement;
    return r && r.parentElement ? { box: r.parentElement, row: r } : null;
  }
  const gripOf = (key, id) => [...document.querySelectorAll(GRIP)].find((g) => {
    const at = g.getAttribute("data-rid") === String(id) && listOf(g);
    return at && at.box.getAttribute("data-rlist") === key;
  }) || null;
  const nameAt = (box, i) => String(box._rr.name(i) || "");

  function doMove(box, from, to) {
    const rows = rowsOf(box), n = rows.length;
    if (!box._rr || to < 0 || to >= n || to === from) return;
    const key = box.getAttribute("data-rlist"), id = rows[from].querySelector(GRIP).getAttribute("data-rid"), name = nameAt(box, from);
    box._rr.move(from, to);   // (the list redraws and saves, as after ▲ ▼)
    // (v3.0.5) a list with its own undo (the layout builder's: opts.ownUndo) — that one step only, never Kit.history's
    if (box._rr.ownUndo) { refocus(key, id); say(K.t("reorder.sayMoved", { name, n: to + 1, total: n })); return; }
    push({ what: K.t("reorder.moved", { name, n: to + 1 }), undo: () => moveTo(key, id, from), redo: () => moveTo(key, id, to),
      undoText: K.t("reorder.undone", { name, n: from + 1 }), redoText: K.t("reorder.moved", { name, n: to + 1 }) });
    refocus(key, id);
    toast(K.t("reorder.moved", { name, n: to + 1 }), true);
    say(K.t("reorder.sayMoved", { name, n: to + 1, total: n }));
  }
  // a row (by its list and id) to place k, wherever it is now → false when it isn't on the page any more
  function moveTo(key, id, k) {
    const g = gripOf(key, id), at = g && listOf(g);
    if (!at) return false;
    const now = rowsOf(at.box).indexOf(at.row);
    if (now >= 0 && now !== k) at.box._rr.move(now, Math.min(k, rowsOf(at.box).length - 1));
    refocus(key, id);
    return true;
  }
  function push(step) {
    HIST.undo.push(step); if (HIST.undo.length > HMAX) HIST.undo.shift();
    HIST.redo.length = 0; bars();
  }
  function undoLast() { step(true); }
  // (v3.0.5) while a step waits for the server, Undo / Redo wait too (never two at once)
  function step(back) {
    if (pending) return;
    const from = back ? HIST.undo : HIST.redo, to = back ? HIST.redo : HIST.undo, s = from.pop();
    if (!s) { toast(K.t(back ? "history.nothingUndo" : "history.nothingRedo")); return bars(); }
    let r;
    try { r = back ? s.undo() : s.redo(); } catch { r = false; }
    // a step's answer: true (done), false (can't), or (v3.0.5) its own words for why not — said instead of "Can't undo"
    const finish = (v) => {
      pending = false;
      const ok = v !== false && typeof v !== "string";
      if (ok) to.push(s);
      // (v3.0.5: a step that can't be applied — the row isn't on the page any more — says so, and is dropped)
      const words = typeof v === "string" && v ? v : !ok ? K.t(back ? "history.cantUndo" : "history.cantRedo", { what: s.what })
        : (back ? s.undoText : s.redoText) || K.t(back ? "history.undone" : "history.redone", { what: s.what });
      toast(words); say(words); bars();
    };
    // (v3.0.5: a step that asks the server — a delete undone from the Trash — finishes when it answers)
    if (r && typeof r.then === "function") { pending = true; bars(); r.then(finish, () => finish(false)); }
    else finish(r);
  }
  // (v3.0.5) another page: its steps go (shell.js show() — the sidebar's links don't fire hashchange)
  function clearHist() {
    HIST.undo.length = 0; HIST.redo.length = 0;
    // (v3.0.5, tester) the toast's Undo goes with the steps: a toast still showing one is hidden (its step is gone)
    if (toastUndo) {
      const t = document.getElementById("toast");
      toastUndo.remove(); toastUndo = null; clearTimeout(toastT);
      if (t && t.classList.contains("rr")) t.className = "";
    }
    bars();
  }
  // (v3.0.5) the shortcut's keys as this computer has them: ⌘Z / ⇧⌘Z on a Mac, Ctrl+Z / Ctrl+Y elsewhere
  const NAV = typeof navigator === "undefined" ? {} : navigator, MAC = /Mac|iPhone|iPad/.test((NAV.userAgentData && NAV.userAgentData.platform) || NAV.platform || NAV.userAgent || "");
  const KEY = { key: MAC ? "⌘Z" : "Ctrl+Z" }, RKEY = { key: MAC ? "⇧⌘Z" : "Ctrl+Y" };   // i18n-ok (key names)
  // the ↶ ↷ buttons: in the page's corner while there is a step to undo or redo
  function bars() {
    const any = HIST.undo.length || HIST.redo.length;
    if (!any) { if (bar) bar.hidden = true; return; }
    if (!bar) {
      bar = el("div.mh-bar", { role: "toolbar", "aria-label": K.t("history.undo", KEY) },
        el("button.btn.ghost.sm.mh-u", { type: "button", title: K.t("history.undo", KEY), "aria-label": K.t("history.undo", KEY), onclick: () => step(true) }, K.icon("undo", 16)),
        el("button.btn.ghost.sm.mh-r", { type: "button", title: K.t("history.redo", RKEY), "aria-label": K.t("history.redo", RKEY), onclick: () => step(false) }, K.icon("redo", 16)));
      document.body.append(bar);
    }
    bar.hidden = false;
    bar.querySelector(".mh-u").disabled = pending || !HIST.undo.length;   // (v3.0.5: not while a step waits)
    bar.querySelector(".mh-r").disabled = pending || !HIST.redo.length;
    if (toastUndo) toastUndo.disabled = pending;
  }
  // (the shortcuts: not while typing in a box, not with a dialog or the builder open — they have their own)
  document.addEventListener("keydown", (e) => {
    const k = (e.key || "").toLowerCase();
    if (!(e.ctrlKey || e.metaKey) || e.altKey || (k !== "z" && k !== "y")) return;
    const t = e.target || {}, tag = t.tagName || "", typ = (t.getAttribute && t.getAttribute("type")) || "";
    const typing = tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !/^(checkbox|radio|range|color|button)$/.test(typ)) || !!t.isContentEditable;   // i18n-ok
    const busy = [".bld-screen", ".modal-bg", ".dve-shade"].some((q) => document.querySelector(q));   // i18n-ok (selectors)
    if (typing || busy || (!HIST.undo.length && !HIST.redo.length)) return;
    e.preventDefault();
    step(k === "z" && !e.shiftKey);
  });
  window.addEventListener("hashchange", clearHist);
  const refocus = (key, id) => { const g = gripOf(key, id); if (g && document.activeElement !== g) g.focus({ preventScroll: true }); };

  // ---------- the drag (by the grip only: the row's own fields and buttons work as usual) ----------
  function mark(rows, from, to) { rows.forEach((r, k) => { r.classList.toggle("rr-above", k === to && to < from); r.classList.toggle("rr-below", k === to && to > from); }); }
  const clearMarks = (rows) => rows.forEach((r) => r.classList.remove("rr-dragging", "rr-above", "rr-below", "rr-pick"));
  function scrollersOf(node) {   // (the scrolling boxes around the list, then the page)
    const out = [];
    for (let n = node.parentElement; n && n !== document.body; n = n.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1) out.push(n);
    }
    const se = document.scrollingElement;
    if (se && se.scrollHeight > se.clientHeight + 1) out.push(se);
    return out;
  }
  function calc() {
    const { rows, from } = DR;
    let to = rows.length - 1;
    for (let k = 0; k < rows.length; k++) { const b = rows[k].getBoundingClientRect(); if (DR.y < b.top + b.height / 2) { to = k > from ? k - 1 : k; break; } }
    DR.to = to;
    mark(rows, from, to);
    if (!DR.moved) return;
    if (!chip) { chip = el("div.rr-chip", { "aria-hidden": "true" }); document.body.append(chip); }
    chip.hidden = false;
    chip.textContent = to === from ? K.t("reorder.chipSame") : K.t("reorder.chipTo", { n: to + 1, total: rows.length });
    chip.style.left = `${Math.min(DR.x + 16, innerWidth - 160)}px`;
    chip.style.top = `${DR.y + 44 > innerHeight ? DR.y - 34 : DR.y + 14}px`;
  }
  function tick() {
    if (!DR) return;
    if (DR.moved) for (const sc of DR.sc) {   // (near the top / bottom edge of a scrolling box: it scrolls while held there)
      const r = sc === document.scrollingElement ? { top: 0, bottom: innerHeight } : sc.getBoundingClientRect();
      const top = Math.max(r.top, 0), bot = Math.min(r.bottom, innerHeight), Z = 48;
      let v = 0;
      if (DR.y < top + Z && DR.y > top - 40) v = -Math.min(Z, top + Z - DR.y); else if (DR.y > bot - Z && DR.y < bot + 40) v = Math.min(Z, DR.y - (bot - Z));
      if (!v || (v < 0 ? sc.scrollTop <= 0 : sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1)) continue;
      sc.scrollTop += Math.round(v * 0.35) || Math.sign(v);
      calc();
      break;
    }
    DR.raf = requestAnimationFrame(tick);
  }
  function endDrag(apply) {
    if (!DR) return;
    const d = DR;
    DR = null;
    cancelAnimationFrame(d.raf);
    removeEventListener("pointermove", onMove); removeEventListener("pointerup", onUp); removeEventListener("pointercancel", onCancel);
    document.body.classList.remove("rr-on");
    if (chip) chip.hidden = true;
    clearMarks(d.rows);
    if (apply && d.moved && d.to !== d.from) doMove(d.box, d.from, d.to);
    else if (!apply && d.moved) { toast(K.t("reorder.canceled")); say(K.t("reorder.sayCanceled")); }
  }
  function onMove(e) {
    if (!DR) return;
    DR.x = e.clientX; DR.y = e.clientY;
    if (Math.abs(e.clientY - DR.y0) > 4 || Math.abs(e.clientX - DR.x0) > 4) DR.moved = true;
    calc();
  }
  const onUp = () => endDrag(true), onCancel = () => endDrag(false);
  function onDown(e) {
    const g = e.target.closest && e.target.closest(GRIP), at = g && listOf(g);
    if (!at || at.box !== e.currentTarget || (e.pointerType === "mouse" && e.button !== 0)) return;
    if (KP) keyDrop(false, true);
    const rows = rowsOf(at.box), from = rows.indexOf(at.row);
    if (from < 0 || rows.length < 2) return;
    e.preventDefault();
    g.focus({ preventScroll: true });
    try { g.setPointerCapture(e.pointerId); } catch {}
    DR = { box: at.box, rows, from, to: from, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, sc: scrollersOf(at.row) };
    at.row.classList.add("rr-dragging");
    document.body.classList.add("rr-on");
    addEventListener("pointermove", onMove); addEventListener("pointerup", onUp); addEventListener("pointercancel", onCancel);
    DR.raf = requestAnimationFrame(tick);
  }
  // (Esc while dragging: first, before a dialog's own Esc)
  document.addEventListener("keydown", (e) => { if (DR && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); endDrag(false); } }, true);

  // ---------- the keyboard on a grip ----------
  function keyDrop(apply, quiet) {
    const k = KP;
    KP = null;
    if (!k) return;
    clearMarks(k.rows);
    if (apply && k.to !== k.from) doMove(k.box, k.from, k.to);
    else if (!quiet) {
      toast(K.t(apply ? "reorder.same" : "reorder.canceled"));
      say(K.t(apply ? "reorder.saySame" : "reorder.sayCanceled"));
    }
  }
  function onKey(e) {
    const g = e.target.closest && e.target.closest(GRIP), at = g && listOf(g);
    if (!at || at.box !== e.currentTarget) return;
    const rows = rowsOf(at.box), i = rows.indexOf(at.row), up = e.key === "ArrowUp", dn = e.key === "ArrowDown";
    if (e.altKey && (up || dn)) { e.preventDefault(); if (KP) keyDrop(false, true); doMove(at.box, i, i + (up ? -1 : 1)); return; }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (KP && KP.box === at.box) { keyDrop(true); return; }
      if (KP) keyDrop(false, true);
      KP = { box: at.box, rows, from: i, to: i };
      at.row.classList.add("rr-pick");
      say(K.t("reorder.sayPicked", { name: nameAt(at.box, i), n: i + 1, total: rows.length }));
      toast(K.t("reorder.picked"));
      return;
    }
    if (KP && KP.box === at.box && (up || dn)) {
      e.preventDefault();
      KP.to = Math.max(0, Math.min(rows.length - 1, KP.to + (up ? -1 : 1)));
      mark(rows, KP.from, KP.to);
      if (rows[KP.to].scrollIntoView) rows[KP.to].scrollIntoView({ block: "nearest" });
      say(K.t("reorder.sayPlace", { n: KP.to + 1, total: rows.length }));
      return;
    }
    if (KP && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); keyDrop(false); return; }
  }
  // (the focus leaving a picked-up row puts it back where it was)
  function onOut() { setTimeout(() => { const a = document.activeElement; if (KP && !(a && a.closest && a.closest(GRIP) && listOf(a) && listOf(a).box === KP.box)) keyDrop(false, true); }, 0); }

  // (v3.0.5) did(step, text): a step done elsewhere (a delete, an edit in a Manager list) — pushed, and said in the
  // toast with its Undo button
  K.history = { push, undo: () => step(true), redo: () => step(false), did: (s, text) => { push(s); toast(text || s.what, true); },
    clear: clearHist };   // (v3.0.5)
  K.reorder = {
    grip: (id, name, attrs) => el("button.grip", { type: "button", "data-grip": "", "data-rid": String(id), title: K.t("reorder.tip"),
      "aria-label": K.t("reorder.label", { name }), ...attrs }, "⠿"),   // i18n-ok (a sign)
    list(box, key, opts) {
      box.setAttribute("data-rlist", key);
      box._rr = opts;
      if (!box._rrOn) {
        box._rrOn = true;
        box.addEventListener("pointerdown", onDown);
        box.addEventListener("keydown", onKey);
        box.addEventListener("focusout", onOut);
      }
      return box;
    },
  };
})();
