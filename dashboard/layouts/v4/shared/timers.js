// Kitchen timers (release 2): several at once, each with a name, on this panel. The "Timers" card of a custom grid
// (grid.js) shows them with preset buttons; done = a chime and a note on top of everything until it's dismissed.
// Later the voice timers use the same calls (the wishlist: "make a timer for spaghetti 10 minutes"):
//   Timers.start(seconds, name) · Timers.cancel(id) · Timers.add(id, seconds) · Timers.reset(id) · Timers.byName(name)
// Kept in this browser (localStorage) so a reload doesn't lose a running timer.
(function () {
  const KEY = "panel.timers", MAX = 8;
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter((t) => t && Number.isFinite(t.end) && Number.isFinite(t.total)) : []; } catch { return []; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} };
  let list = load();   // [{id, name, end (ms), total (s), done}]
  const changed = () => { save(); if (window.App && App.render) App.render(); };
  const esc = (s) => (window.UI && UI.esc ? UI.esc(s) : String(s));
  const mmss = (s) => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(x).padStart(2, "0")}`; };
  const left = (t) => (t.end - Date.now()) / 1000;

  const TM = {
    list: () => list.slice(),
    start(seconds, name) {
      seconds = Math.round(+seconds);
      if (!(seconds > 0 && seconds <= 24 * 3600)) return null;
      if (list.length >= MAX) list.shift();
      const t = { id: Math.random().toString(36).slice(2, 9), name: String(name || mmss(seconds)).slice(0, 40), end: Date.now() + seconds * 1000, total: seconds };
      list.push(t); changed(); return t.id;
    },
    cancel(id) { list = list.filter((t) => t.id !== id); if (!list.some((t) => t.done)) quiet(); changed(); },
    add(id, seconds) { const t = list.find((x) => x.id === id); if (!t) return; if (t.done) { t.done = false; t.end = Date.now(); } t.end += seconds * 1000; t.total += seconds; if (!list.some((x) => x.done)) quiet(); changed(); },
    reset(id) { const t = list.find((x) => x.id === id); if (!t) return; t.done = false; t.end = Date.now() + t.total * 1000; if (!list.some((x) => x.done)) quiet(); changed(); },
    byName: (name) => list.find((t) => t.name.toLowerCase() === String(name).toLowerCase()) || null,
  };

  // the card (grid.js): running timers, then the preset buttons (minutes)
  TM.card = (o) => {
    const presets = Array.isArray(o.presets) && o.presets.length ? o.presets : [1, 5, 10, 15, 30];
    const rows = list.map((t) => `<div class="tm-row${t.done ? " done" : ""}"><span class="tm-n">${esc(t.name)}</span><b class="num" data-tend="${t.end}">${t.done ? esc(T("tm.done")) : mmss(left(t))}</b>
      <i class="tm-bar"><i data-tend="${t.end}" data-ttot="${t.total}" style="transform:scaleX(${t.done ? 0 : Math.max(0, Math.min(1, left(t) / t.total)).toFixed(3)})"></i></i>
      <button${Acts.on("tm.add", t.id, 60)}>+1</button><button${Acts.on("tm.reset", t.id)} aria-label="${esc(T("tm.again"))}">↺</button><button${Acts.on("tm.cancel", t.id)} aria-label="${esc(T("tm.stop"))}">✕</button></div>`).join("");
    return `<div class="tm">${o.title ? `<div class="gc-t">${esc(o.title)}</div>` : ""}<div class="tm-list">${rows || `<div class="gc-empty">${esc(T("tm.none"))}</div>`}</div>
      <div class="tm-pre">${presets.map((m) => `<button${Acts.on("tm.start", +m * 60)}>${esc(T("tm.minutes", { n: +m }))}</button>`).join("")}</div></div>`;
  };

  // every second: the numbers and bars only (no redraw); a timer reaching zero rings
  let ringing = null, note = null;
  function quiet() { clearInterval(ringing); ringing = null; if (note) { note.remove(); note = null; } }
  function ring(t) {
    if (window.Sound && !(window.PANEL_DESIGN === true)) { try { Sound.play("quarter"); } catch {} }
    clearInterval(ringing);
    let n = 0;
    ringing = setInterval(() => { if (++n > 12) return quiet(); try { if (window.Sound) Sound.play("quarter"); } catch {} }, 10000);   // (2 minutes at most)
    if (!note) {
      note = document.createElement("div");
      note.className = "tm-note";
      note.addEventListener("click", () => { list.filter((x) => x.done).forEach((x) => TM.cancel(x.id)); quiet(); });
      document.body.appendChild(note);
    }
    note.innerHTML = `<b>${esc(T("tm.isDone", { name: t.name }))}</b><span>${esc(T("tm.tapDismiss"))}</span>`;
  }
  setInterval(() => {
    let hit = false;
    for (const t of list) if (!t.done && left(t) <= 0) { t.done = true; hit = true; ring(t); }
    if (hit) changed();
    for (const el of document.querySelectorAll("[data-tend]")) {
      const end = +el.dataset.tend, s = (end - Date.now()) / 1000;
      if (el.dataset.ttot) el.style.transform = `scaleX(${Math.max(0, Math.min(1, s / +el.dataset.ttot)).toFixed(3)})`;
      else if (s > 0) el.textContent = mmss(s);
    }
  }, 1000);

  // the card's buttons (acts.js)
  Acts.add({ "tm.add": (id, s) => TM.add(id, s), "tm.reset": (id) => TM.reset(id), "tm.cancel": (id) => TM.cancel(id), "tm.start": (s) => TM.start(s) });
  window.Timers = TM;
})();
