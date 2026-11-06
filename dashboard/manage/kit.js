// Skypane Manager — the kit (v2.3.0): small builders the new pages share — the line icons, the side layout (a side
// card pinned to the right edge, the main area fluid:), grouped rows, a switch, a card with a
// heading. More come with the pages rebuilt later (a gallery…; v2.4.0's filter chips and data table live in devices.js
// until a second page needs them). window.Kit.
// Built with DOM calls + textContent; the icons are our own constant drawings (never data).
(function () {
  const M = window.Manage;
  const { el } = M;

  // ---------- the line icons (24 × 24, drawn with the stroke; the design notes) ----------
  const ICONS = {
    send: '<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4 18-7z"/>',
    ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    coffee: '<path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8z"/><path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5c.6.6.6 1.4 0 2M11 3.5c.6.6.6 1.4 0 2M14 3.5c.6.6.6 1.4 0 2"/>',
    dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    devices: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    tablet: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M11 16h2"/>',
    layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    shapes: '<circle cx="7.5" cy="7.5" r="4"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><path d="M17 3l4 7h-8z"/>',
    cards: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
    camera: '<path d="M15 10l5-3v10l-5-3"/><rect x="3" y="6" width="12" height="12" rx="2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    wifi: '<path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5 12a10 10 0 0 1 14 0"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2-2.4 3.6"/><circle cx="12" cy="17" r=".6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    night: '<path d="M19 15.5A7.5 7.5 0 0 1 9 5.5a7.5 7.5 0 1 0 10 10z"/><path d="M17.5 3v3.5M15.75 4.75h3.5"/><circle cx="21" cy="9.5" r=".6"/>',
    pin: '<path d="M12 17v5"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>',
    chevL: '<path d="m15 6-6 6 6 6"/>', chevR: '<path d="m9 6 6 6-6 6"/>', chevD: '<path d="m6 9 6 6 6-6"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
    rows: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="m5 12 5 5 9-10"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    // (v2.3.1: the Overview and Health status)
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
    alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M5 10h6v4H5z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    broker: '<circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/>',
    arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    window: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M4 12h16"/>',
    // (v2.4.0: Devices Basic / Detailed)
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 9v11"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.7-1.5"/>',
    chevU: '<path d="m6 15 6-6 6 6"/>', minus: '<path d="M5 12h14"/>',
    az: '<path d="M4 17 7.5 7 11 17M5.2 14h4.6"/><path d="M14 7h6l-6 10h6"/>',
    // (v2.5.0: Panels and the layout builder)
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
    maximize: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    minimize: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    full: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 9H6v2M16 9h2v2M8 15H6v-2M16 15h2v-2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    // (v3.0.5: picture folders and the slide-show options)
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    gauge: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="m12 16 4-5"/>',
    // (v3.0.5: Lists & notes — a note, edit, run)
    note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4"/>',
    edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14 7 3 3"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  };
  // (each drawing parsed once — our own constant markup, as SVG, never as HTML — then copied)
  const made = new Map();
  function icon(name, size = 18) {
    if (!made.has(name)) {
      const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" `
        + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ""}</svg>`, "image/svg+xml");
      made.set(name, document.importNode(doc.documentElement, true));
    }
    const s = made.get(name).cloneNode(true);
    s.setAttribute("class", "i");
    s.setAttribute("width", String(size)); s.setAttribute("height", String(size));
    return s;
  }

  // ---------- layouts and rows ----------
  // sideLayout(main, aside): the main area fluid, the side card pinned to the right edge (one column on a narrow window)
  const sideLayout = (main, aside) => el("div.side-layout", {}, el("div.side-main", {}, main), aside ? el("aside", {}, aside) : null);
  // group("Title", rows, "a note under it") → the parts to put on a page (a small heading, the rows in one box, a note)
  const group = (title, rows, foot) => [title ? el("div.gh", {}, title) : null, el("div.grp", {}, rows), foot ? el("p.gf", {}, foot) : null];
  // row("Label", "what it means", control) — one line of a group: the words on the left, its control on the right
  const row = (label, hint, control, attrs) => el("div.grp-row", attrs || {}, el("div.rl", {}, el("b", {}, label), hint ? el("small", {}, hint) : null),
    control != null ? el("div.rc", {}, control) : null);
  // a switch (role="switch"): on, onchange(newValue), its name for a screen reader
  function sw(on, onchange, label) {
    const b = el("button.sw" + (on ? ".on" : ""), { type: "button", role: "switch", "aria-checked": on ? "true" : "false", "aria-label": label || null });
    b.addEventListener("click", () => {
      const v = b.getAttribute("aria-checked") !== "true";
      b.classList.toggle("on", v); b.setAttribute("aria-checked", String(v));
      onchange(v);
    });
    return b;
  }
  // a card with a heading line ("Title", a small note on its right) and its parts under it
  const card = (title, note, ...kids) => el("section.card.flush", {}, el("h3.ch", {}, title, note ? el("small", {}, note) : null), ...kids);

  // a small question in the Manager's own look (never the browser's confirm): named buttons; resolves true (yes) /
  // false (no, Esc, a click outside). ask({title, text, yes, no = "Cancel", danger, extra}) — v2.5.0 (Panels, the builder)
  let askN = 0;
  function ask({ title, text, yes = t("kit.ask.ok"), no = t("control.cancel"), danger = false, extra = null }) {
    return new Promise((done) => {
      let close = null, over = false;
      const id = `k-ask-${++askN}`;
      // (the page changes under it — Back, a link, the router: the question is about the page it was asked on, so it
      // ends as a "no", never answered later over another page)
      const onRoute = () => end(false);
      window.addEventListener("hashchange", onRoute);
      const end = (v) => { if (over) return; over = true; window.removeEventListener("hashchange", onRoute); if (close) close(); done(v); };
      const yesB = el("button.btn" + (danger ? ".pn-danger" : ".pri"), { type: "button", onclick: () => end(true) }, yes);
      const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) end(false); } },
        el("div.modal.small.pn-ask", { role: "alertdialog", "aria-labelledby": `${id}-h`, "aria-describedby": text ? `${id}-p` : null },
          el("h2", { id: `${id}-h` }, title), text ? el("p", { id: `${id}-p` }, text) : null, extra,
          el("div.pn-ask-acts", {}, el("button.btn", { type: "button", onclick: () => end(false) }, no), yesB)));
      close = M.dialog(shade, yesB, () => end(false));
    });
  }

  // choose({title, text, buttons: [[value, "Label", "pri" | "danger"]…]}) → the value of the button pressed, or null for
  // Esc, a click outside or the page changing — when "no answer" must never mean one of the choices (v2.7.0: the
  // builder's "someone else saved" — Load theirs drops your work, so only that button may do it)
  function choose({ title, text, buttons }) {
    return new Promise((done) => {
      let close = null, over = false;
      const id = `k-ask-${++askN}`;
      const onRoute = () => end(null);
      window.addEventListener("hashchange", onRoute);
      const end = (v) => { if (over) return; over = true; window.removeEventListener("hashchange", onRoute); if (close) close(); done(v); };
      const bs = buttons.map(([v, label, cls]) => el("button.btn" + (cls === "pri" ? ".pri" : cls === "danger" ? ".pn-danger" : ""), { type: "button", onclick: () => end(v) }, label));
      const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) end(null); } },
        el("div.modal.small.pn-ask", { role: "alertdialog", "aria-labelledby": `${id}-h`, "aria-describedby": text ? `${id}-p` : null },
          el("h2", { id: `${id}-h` }, title), text ? el("p", { id: `${id}-p` }, text) : null,
          el("div.pn-ask-acts", {}, el("button.btn.ghost", { type: "button", onclick: () => end(null) }, t("kit.ask.notNow")), ...bs)));
      close = M.dialog(shade, bs[bs.length - 1], () => end(null));
    });
  }

  // ---------- v2.6.0: the List views' table, empty states, a built-in background scene ----------
  // table({cols: [[key, "Label", {cls, sort: (row) => value}]…], rows: [{id, cells: {key: node|text}, data}], cur, onPick,
  // sort: {k, dir}, onSort, label}) → a table in a box; a row is picked with a click, Enter or Space (aria-selected)
  function table({ cols, rows, cur, onPick, sort, onSort, label }) {
    const head = el("tr", {}, cols.map(([k, n, o = {}]) => {
      const on = sort && sort.k === k;
      return el("th" + (o.cls ? `.${o.cls}` : ""), { scope: "col", "aria-sort": on ? (sort.dir > 0 ? "ascending" : "descending") : null },
        o.sort && onSort ? el("button.k-th", { type: "button", onclick: () => onSort(k) }, n, on ? icon(sort.dir > 0 ? "chevU" : "chevD", 12) : null) : n);
    }));
    const body = el("tbody", {}, rows.map((r) => el("tr" + (r.id === cur ? ".cur" : ""), { tabindex: "0", "data-id": String(r.id), "aria-selected": String(r.id === cur),
      onclick: () => onPick && onPick(r.id), onkeydown: (e) => { if ((e.key === "Enter" || e.key === " ") && onPick) { e.preventDefault(); onPick(r.id); } } },
    cols.map(([k, , o = {}]) => el("td" + (o.cls ? `.${o.cls}` : ""), {}, r.cells[k] ?? "")))));
    return el("div.k-tw", {}, el("table.k-tbl", { "aria-label": label || null }, el("thead", {}, head), body));
  }
  // empty(icon, "Title", "what to do", action button?) → the friendly empty state of a page or a part of it
  const empty = (ic, title, text, action) => el("div.k-empty", {}, el("span.ei", {}, icon(ic, 22)), el("b", {}, title), text ? el("p", {}, text) : null, action || null);
  // scene("mountains" | "up:<id>") → a background as the panels draw it (backgrounds.js); an owner's picture that can't
  // be loaded shows the mountains instead (the Manager has no Acts: the panels' own fallback doesn't run here)
  function scene(id) {
    const box = el("span.scene");
    box.innerHTML = window.renderBackground ? window.renderBackground(id) : "";   // (our own drawings / an <img> of our own server's picture)
    const img = box.querySelector("img.bg-own");
    if (img) img.addEventListener("error", () => { box.innerHTML = window.renderBackground ? window.renderBackground("mountains") : ""; box.classList.add("missing"); }, { once: true });
    return box;
  }

  // fileButton(input, "Choose a file…") → the file input as a button with the chosen file's name beside it (the input
  // stays — hidden, still labelled, still the one the form reads; its own onchange still runs)
  function fileButton(input, words) {
    input.classList.add("k-file-in");
    const name = el("span.k-file-n", {}, t("kit.file.none"));
    input.addEventListener("change", () => { const f = input.files && input.files[0]; name.textContent = f ? f.name : t("kit.file.none"); name.classList.toggle("on", !!f); });
    return el("label.k-file", {}, input, el("span.btn.sm", {}, icon("upload", 14), words || t("kit.file.choose")), name);
  }

  // ---------- words for numbers and times (v2.7.2): one place for every page — translation-ready ----------
  // plural(n, "camera", "cameras") → "1 camera" / "3 cameras" (Intl.PluralRules picks the form; a translation adds its
  // own forms later — both English forms are always given by the page)
  const LANG = () => { try { return (window.Shell && Shell.prefs().lang) || "en"; } catch { return "en"; } };
  let pr = null, prLang = "";
  function plural(n, one, many) {
    if (!pr || prLang !== LANG()) { prLang = LANG(); try { pr = new Intl.PluralRules(prLang); } catch { pr = { select: (x) => (x === 1 ? "one" : "other") }; } }
    return `${n} ${pr.select(n) === "one" ? one : many}`;   // (the pages use t() plural entries now; kept for old callers)
  }
  // ago(epoch seconds, style) — how long ago, in words (English as the pages always said it):
  //   "long"  just now · 5 minutes ago · 3 hours ago · 2 days ago        (Accounts, Your account)
  //   "secs"  12 seconds ago · 5 minutes ago · 3 hours ago                (Integrations: "checked … ago")
  //   "mid"   just now · 5 min ago · 3 h ago · 2 days ago                 (Health, Overview, Calendars)
  //   "short" just now · 40 s ago · 5 min ago · 3 h ago · 2 d ago         (Devices, Panels, Cameras: live values)
  function ago(t, style = "mid") {
    if (!t) return "";
    const s = Math.max(0, Math.round(Date.now() / 1000 - t)), r = (x) => Math.round(x);
    // (v3.0.0: every form from the table — ago.* keys, whole phrases with their plural forms)
    const now = () => K_T("ago.justNow");
    // "bare": how long, without "ago" — a tile's "Checked in 5 min" (v3.0.0: its own words, never cut from the others)
    if (style === "bare") return s < 10 ? K_T("ago.bareNow") : s < 60 ? K_T("ago.bareS", { n: s }) : s < 3600 ? K_T("ago.bareMin", { n: r(s / 60) }) : s < 86400 ? K_T("ago.bareH", { n: r(s / 3600) }) : K_T("ago.bareD", { n: r(s / 86400) });
    if (style === "short") return s < 10 ? now() : s < 60 ? K_T("ago.sShort", { n: s }) : s < 3600 ? K_T("ago.minShort", { n: r(s / 60) }) : s < 86400 ? K_T("ago.hShort", { n: r(s / 3600) }) : K_T("ago.dShort", { n: r(s / 86400) });
    if (style === "secs") return s < 90 ? K_T("ago.seconds", { n: s }) : s < 5400 ? K_T("ago.minutes", { n: r(s / 60) }) : K_T("ago.hours", { n: r(s / 3600) });
    if (style === "long") return s < 90 ? now() : s < 5400 ? K_T("ago.minutes", { n: r(s / 60) }) : s < 129600 ? K_T("ago.hours", { n: r(s / 3600) }) : K_T("ago.days", { n: r(s / 86400) });
    return s < 60 ? now() : s < 5400 ? K_T("ago.minShort", { n: r(s / 60) }) : s < 129600 ? K_T("ago.hShort", { n: r(s / 3600) }) : K_T("ago.days", { n: r(s / 86400) });
  }
  // dates through one formatter (the browser's locale, as before): epoch seconds →
  //   date "Nov 1, 2026" · dateTime "Nov 1, 4:13 PM" · time "4:13 PM" · dayTime "today 4:13 PM" / "yesterday …" / "Nov 1 …"
  const fmt = {
    date: (d) => d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }),
    dateTime: (d) => d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    time: (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    dayTime: (d) => {
      const now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
      const t = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      const tm = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return d.toDateString() === now.toDateString() ? K_T("ago.todayAt", { time: tm }) : d.toDateString() === y.toDateString() ? K_T("ago.yesterdayAt", { time: tm })
        : K_T("ago.dayAt", { day: d.toLocaleDateString([], { month: "short", day: "numeric" }), time: tm });
    },
  };
  const when = (t, kind = "dateTime") => (t ? fmt[kind](new Date(t * 1000)) : "");
  const K_T = (k, v) => t(k, v);   // (fmt.dayTime has a local "t" of its own)

  // ---------- t(key, vars) (v2.9.0): the Manager's words from one string table (strings/en.js) ----------
  // t("cameras.next") → "The next camera"; t("cameras.of", {n: 2, total: 5}) → "Camera 2 of 5" ({name} placeholders).
  // An entry may be {one, other} (Intl.PluralRules on vars.n). English only for now: the language files come with
  // v2.10.0 — the table and these calls are the same then. A key missing from the table shows the key (and says so
  // once on the console), never an empty label.
  const missing = new Set();
  function t(key, vars) {
    const all = window.SKYPANE_STRINGS || {}, tab = all[LANG()] || all.en || {};
    let s = Object.prototype.hasOwnProperty.call(tab, key) ? tab[key] : (all.en || {})[key];
    if (s == null) { if (!missing.has(key)) { missing.add(key); console.warn(`Skypane: no words for "${key}"`); } return key; }
    if (typeof s === "object") {
      if (!pr || prLang !== LANG()) { prLang = LANG(); try { pr = new Intl.PluralRules(prLang); } catch { pr = { select: (x) => (x === 1 ? "one" : "other") }; } }
      s = s[pr.select(Number((vars || {}).n) || 0)] || s.other || "";
    }
    return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m)) : String(s);
  }

  // (v3.0.0) a word from the table if it has one, else the given text — names that come from the panel's own files
  // (motions, drawings) and are translated by id
  const tOr = (key, fallback) => { const all = window.SKYPANE_STRINGS || {}, tab = all[LANG()] || {}, en = all.en || {};
    return Object.prototype.hasOwnProperty.call(tab, key) || Object.prototype.hasOwnProperty.call(en, key) ? t(key) : fallback; };
  window.Kit = { icon, sideLayout, group, row, sw, card, ask, choose, table, empty, scene, fileButton, plural, ago, when, t, tOr };
})();
