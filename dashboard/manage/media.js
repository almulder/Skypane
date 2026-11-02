// Skypane Manager — the libraries (v2.6.0; the design notes "BACKGROUNDS", "ICONS", "CARDS",
// the design notes): Backgrounds, Icons and Cards, each with two views remembered per login (shell.js) —
//   Gallery  big tiles (the scene or picture itself, the icon on and off, a card's mini face), filter chips with
//            counts, a search, the one picked ringed;
//   List     the same things in a table: size (W × H · KB), what uses each, who added it and when;
// and one side card shared by both views: a big preview, what it is, what uses it, and what can be done with it
// (rename, "Use on a panel…", "Use for a device…", "Add to a layout", remove — each only where this login may).
// Uploads: backgrounds and icon pictures (service/pictures.py: the server draws each again); cards: the check →
// install dialog (cardlib.js). A phone: the Gallery only, a tap opens the side card under it; uploads work there,
// removing, "Use on…" and installing a card are for a computer .
// The server answers what this login may see (/api/manage/pictures, /api/manage/cards); it checks every change.
// Built with DOM calls + textContent only (the scenes and drawings are our own constant drawings).
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast, iconEl } = M, ic = K.icon;
  const kb = (b) => (b == null ? "" : b >= 1e6 ? K.t("media.size.mb", { n: new Intl.NumberFormat([], { maximumFractionDigits: 1 }).format(b / 1e6) })
    : K.t("media.size.kb", { n: new Intl.NumberFormat([], { maximumFractionDigits: 0 }).format(Math.max(1, b / 1000)) }));
  const day = (t) => K.when(t, "date") || "—";   // (kit.js: one date formatter)
  const phone = () => S.isPhone();
  const narrow = () => phone() || window.innerWidth < 900;
  const PK = () => M.pictureKit;
  const t = K.t;   // (v2.9.0: the new words through the string table — strings/en.js)

  // ================================================================== shared state and frame
  const st = { backgrounds: { f: "all", q: "", cur: null, sort: { k: "name", dir: 1 } }, icons: { f: "all", q: "", cur: null, on: false, sort: { k: "name", dir: 1 } },
    cards: { f: "all", q: "", cur: null, sort: { k: "name", dir: 1 } } };
  let LIB = null, CARDS = null, PANELS = null, $page = null;
  M.onReset(() => { LIB = null; CARDS = null; PANELS = null; for (const k of Object.keys(st)) st[k].cur = null; });
  const pageNow = () => S.route().page;
  const viewOf = (key) => (phone() ? "gallery" : S.view(key) || "gallery");
  async function panels() {
    if (PANELS) return PANELS;
    try { PANELS = M.can("panels") ? ((await api("/api/manage/panels")).panels || []) : []; } catch { PANELS = []; }
    return PANELS;
  }
  // (a page: the header with its upload / install button and the view switch, a toolbar, the view, the side card)
  function frame(key, title, text, act, tools, body, side) {
    const ph = el("div.ph", {}, el("div", {}, el("h1", {}, title), el("p", {}, text)), el("span.sp"), act ? el("div.acts", {}, act) : null,
      phone() || !act ? null : el("span.vr"), phone() ? null : S.viewSwitch(key));
    // (v2.9.0, a phone: the list alone — a tap opens the side card as a sheet; an open sheet shows the card drawn now)
    if (phone()) {
      $page = el("div.md-page", { "data-page": key, "data-view": viewOf(key) }, ph, el("div.md-main", {}, tools, body));
      M.swap(M.$main, $page);
      phoneSide[key] = side;
      // (gate 2: an open sheet shows only its own item — renamed: the new name; gone (removed here or elsewhere): closed)
      if (msheet && msheet.key === key) {
        if (side && st[key].cur === msheet.id) { msheet.sh.body.replaceChildren(side); msheet.sh.title(side.getAttribute("aria-label") || ""); }
        else { const sh = msheet.sh; msheet = null; sh.close(); if (!removedNow) toast(t("media.gone"), true); }
      }
      removedNow = false;
      return;
    }
    $page = el("div.md-page", { "data-page": key, "data-view": viewOf(key) }, ph,
      // (a narrow window or a phone: one column — the side card under the list, as on Cameras; a pick scrolls to it)
      narrow() ? el("div.md-one", {}, el("div.md-main", {}, tools, body), side) : K.sideLayout(el("div.md-main", {}, tools, body), side));
    M.swap(M.$main, $page);
  }
  // the toolbar: filter chips with counts and a search ("/" focuses it)
  function toolbar(key, filters, counts, extra) {
    const s = st[key];
    const q = el("input.md-q", { type: "search", placeholder: K.t("media.find.placeholder"), value: s.q, "aria-label": K.t("media.find"), "data-fk": `md-q-${key}`,
      oninput: (e) => { s.q = e.target.value; draw(key, true); } });
    return el("div.md-tools", {}, el("div.seg", { role: "group", "aria-label": K.t("media.filter") }, filters.map(([k, n]) =>
      el("button" + (s.f === k ? ".on" : ""), { type: "button", "aria-pressed": String(s.f === k), onclick: () => { s.f = k; draw(key); } }, n, el("span.n", {}, String(counts[k] ?? 0))))),
    el("label.md-qbox", {}, ic("search", 15), q), extra || null);
  }
  const hit = (q, ...words) => !q.trim() || words.join(" ").toLowerCase().includes(q.trim().toLowerCase());
  // the gallery's selection follows a click, and the side card is drawn again; the focus stays on the tile
  function pick(key, id) {
    st[key].cur = id;
    if (phone()) { draw(key); openSheet(key); return; }
    draw(key);
    const n = M.$main.querySelector(`[data-pick="${CSS.escape(String(id))}"]`) || M.$main.querySelector(`.k-tbl tr[data-id="${CSS.escape(String(id))}"]`);
    if (n) { n.focus({ preventScroll: true }); if (narrow()) M.$main.querySelector(".md-side")?.scrollIntoView({ block: "start", behavior: "smooth" }); }
  }
  // (v2.9.0) a phone: the picked item's card in a sheet (Back / swipe down closes it; drawn again with the page)
  const phoneSide = {};
  let msheet = null, removedNow = false;   // (msheet: {key, id, sh} — the sheet is for that one item)
  function openSheet(key) {
    const side = phoneSide[key];
    if (!side) return;
    if (msheet) { msheet.id = st[key].cur; msheet.key = key; msheet.sh.body.replaceChildren(side); msheet.sh.title(side.getAttribute("aria-label") || ""); return; }
    const sh = K.sheet({ title: side.getAttribute("aria-label") || "", body: [side], cls: "md-sheet", onClose: () => { if (msheet && msheet.sh === sh) msheet = null; } });
    msheet = { key, id: st[key].cur, sh };
  }
  // (a phone: a long list of device types shows a few — the ticked ones always — and "Show all")
  function fewChips(box) {
    const chips = [...box.children];
    if (!phone() || chips.length <= 8) return box;
    let open = false;
    const more = el("button.btn.sm.ghost.md-more", { type: "button" });
    const sync = () => {
      chips.forEach((c, i) => { c.hidden = !open && i >= 6 && !(c.querySelector("input") || {}).checked; });
      more.textContent = open ? t("media.fewerTypes") : t("media.allTypes", { n: chips.length });
      more.setAttribute("aria-expanded", String(open));
    };
    more.addEventListener("click", () => { open = !open; sync(); });
    sync();
    return el("div.md-few", {}, box, more);
  }
  // (draw again; keepFocus: typing in the search — the box keeps the focus and its caret)
  function draw(key, keepFocus) {
    const a = document.activeElement, q = keepFocus && a && a.classList.contains("md-q") ? a.selectionStart : null;
    ({ backgrounds: drawBackgrounds, icons: drawIcons, cards: drawCards })[key]();
    if (q != null) { const n = M.$main.querySelector(".md-q"); if (n) { n.focus(); n.setSelectionRange(q, q); } }
  }
  const tile = (key, id, cur, kids, label) => el("button.md-tile" + (id === cur ? ".cur" : ""), { type: "button", "data-pick": String(id), "aria-pressed": String(id === cur),
    "aria-label": label || null, onclick: () => pick(key, id) }, ...kids);
  const sortRows = (rows, s, get) => rows.slice().sort((a, b) => { const x = get(a, s.k), y = get(b, s.k);
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * s.dir; });
  const onSort = (key) => (k) => { const s = st[key].sort; st[key].sort = s.k === k ? { k, dir: -s.dir } : { k, dir: 1 }; draw(key); };

  async function loadPictures() {
    // (v2.8.0: a phone loads the drawings and the picture kit when this page opens — Manage.need)
    try { if (!PK()) await M.need("art"); LIB = await PK().load(); } catch (e) { if (e.message !== "login") M.$main.replaceChildren(K.empty("image", K.t("media.pictures.cantRead"), K.t("media.cantReadWhy"))); return false; }
    return true;
  }

  // ---------- a picture's upload dialog (backgrounds and icon pictures; the server draws each again) ----------
  function uploadDialog(isBg, done) {
    const L = LIB, styles = Object.entries(L.styles).filter(([k]) => (k === "background") === isBg);
    const styleSel = el("select", { id: "md-up-style", "aria-label": K.t("media.up.kindLabel") }, styles.map(([k, s]) => el("option", { value: k }, s.label)));
    const rec = el("small.pn-hint");
    const file = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", id: "md-up-file" });   // i18n-ok (file types)
    const name = el("input", { type: "text", maxlength: "40", id: "md-up-name", placeholder: isBg ? K.t("media.up.exampleBg") : K.t("media.up.exampleIcon") });
    const types = el("div.md-types", { role: "group", "aria-label": K.t("media.fitsTypes") }, L.types.map((t) => el("label.cm-chip", {}, el("input", { type: "checkbox", value: t }), PK().TYPE_NAMES[t] || t)));
    const showRec = () => { const s = L.styles[styleSel.value];
      if (phone() && !s.animated) { rec.textContent = K.t("upload.fits"); return; }   // (v2.9.0 gate 2: a phone makes a photo fit by itself)
      rec.textContent = K.t(s.animated ? "media.up.recMoves" : "media.up.recStill", { rec: s.recommended, min: s.min, max: s.max, kb: Math.round(s.maxBytes / 1000) }); };
    styleSel.addEventListener("change", showRec); showRec();
    let close = null;
    const go = el("button.btn.pri", { type: "submit" }, K.t("media.up.upload"));
    // (v2.9.0, a phone: progress and what went wrong, inside the dialog)
    const bar = el("progress.md-prog", { max: "100", value: "0", hidden: true, "aria-label": K.t("upload.progress") });
    const msg = el("p.md-upmsg", { role: "status", "aria-live": "polite", hidden: true });
    const say = (text, bad) => { msg.hidden = !text; msg.textContent = text || ""; msg.classList.toggle("bad", !!bad); };
    const form = el("form.modal.small.pn-ask.md-upform", { role: "dialog", "aria-labelledby": "md-up-h", onsubmit: async (e) => {
      e.preventDefault();
      const f = file.files && file.files[0], bg = styleSel.value === "background";
      const picked = bg ? ["other"] : [...types.querySelectorAll("input:checked")].map((i) => i.value);
      if (!f) return phone() ? say(K.t("upload.noFile"), true) : toast(K.t("media.up.noFile"), true);
      if (!picked.length) return phone() ? say(K.t("upload.noTypes"), true) : toast(K.t("media.up.noTypes"), true);
      const ph = phone(), sty = L.styles[styleSel.value];
      if (ph) {   // (v2.9.0, a phone: the reasons in the dialog, not behind it; a photo straight from the camera roll)
        say("");
        if (f.size > PHONE_MAX) return say(K.t("upload.tooBig", { mb: Math.round(PHONE_MAX / 1e6) }), true);
        if (!/^image\//.test(f.type || "image/")) return say(K.t("upload.notPicture"), true);
      }
      // (a still picture on a phone is made smaller first, like a background — a 12 MP photo never goes over the air whole)
      let shrinkIt = bg || (ph && !sty.animated && f.type !== "image/gif");
      // (gate 1: an icon picture that already fits — bytes and sides — and isn't a photo goes as it is, never re-encoded)
      if (shrinkIt && !bg && f.size <= sty.maxBytes && f.type !== "image/jpeg") {
        try { const b = await createImageBitmap(f); const lo = Math.min(b.width, b.height), hi = Math.max(b.width, b.height); b.close(); if (lo >= sty.min && hi <= sty.max) shrinkIt = false; } catch {}
      }
      if (!shrinkIt && f.size > sty.maxBytes) return ph ? say(K.t("upload.tooBigKind", { kb: Math.round(sty.maxBytes / 1000) }), true) : toast(K.t("media.up.tooBig", { kb: Math.round(sty.maxBytes / 1000) }), true);
      go.disabled = true;
      try {
        if (ph) say(K.t("upload.preparing"));
        const data = shrinkIt ? await PK().shrinkBackground(f, bg ? L.styles.background : sty, bg ? "background" : "icon")
          : await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });
        const body = { action: "upload", name: name.value || f.name.replace(/\.[^.]+$/, ""), style: styleSel.value, types: picked, data };
        const r = ph ? await sendWithProgress("/api/manage/pictures", body, (k) => { bar.hidden = false; bar.value = Math.round(k * 100); say(K.t("upload.sending", { pct: Math.round(k * 100) })); })
          : await api("/api/manage/pictures", body);
        if (!r.ok) { if (ph) { bar.hidden = true; return say(r.error || K.t("upload.failed"), true); } return toast(r.error || K.t("media.up.failed"), true); }
        toast(K.t("media.up.done")); close(); done(r.id || (r.picture && r.picture.id));
      } catch (err) {
        if (err.message === "login") return;
        if (ph) {
          bar.hidden = true;
          const unreadable = err && (err.name === "InvalidStateError" || err.name === "EncodingError" || /decode|source image|bitmap/i.test(err.message || ""));
          return say(err.message === "offline" ? K.t("upload.offline") : unreadable ? K.t("upload.unreadable")
            : err.message && /smaller|too long|too big|too large/i.test(err.message) ? err.message : K.t("upload.failed"), true);
        }
        // (a file the browser can't even draw — damaged, or not really a picture: said so, not just "couldn't")
        const unreadable = err && (err.name === "InvalidStateError" || err.name === "EncodingError" || /decode|source image|bitmap/i.test(err.message || ""));
        toast(unreadable ? K.t("media.up.unreadable")
          : err.message && /smaller|too long|too big/i.test(err.message) ? err.message : K.t("media.up.couldnt"), true);
      }
      finally { go.disabled = false; }
    } }, el("h2", { id: "md-up-h" }, isBg ? K.t("media.up.titleBg") : K.t("media.up.titleIcon")),
      isBg ? el("p", {}, K.t("media.up.bgIntro"))
        : el("label.pn-fld", { for: "md-up-style" }, el("b", {}, K.t("media.up.kind")), styleSel),
      rec, el("div.pn-fld", {}, el("b", {}, K.t("media.up.file")), K.fileButton(file, phone() ? K.t("upload.choose") : K.t("media.up.choose"))), el("label.pn-fld", { for: "md-up-name" }, el("b", {}, K.t("media.name")), name),
      isBg ? null : el("div.pn-fld", {}, el("b", {}, K.t("media.fitsTypes")), fewChips(types)),
      bar, msg,
      el("div.pn-ask-acts", {}, el("button.btn", { type: "button", onclick: () => close() }, K.t("control.cancel")), go));
    // (v2.9.0: a phone — a drag handle like the other sheets; a swipe down, the backdrop or Back asks first once a
    // file is picked)
    const leave = async () => {
      if (phone() && file.files && file.files[0] && !(await K.ask({ title: K.t("upload.leaveTitle"), text: K.t("upload.leaveText"), yes: K.t("upload.leaveYes"), no: K.t("upload.leaveNo"), danger: true }))) return;
      close();
    };
    if (phone()) {
      const grab = el("div.ps-grab", { "aria-hidden": "true" }, el("i"));
      form.prepend(grab);
      let y0 = null, dy = 0;
      grab.addEventListener("pointerdown", (e) => { y0 = e.clientY; dy = 0; try { grab.setPointerCapture(e.pointerId); } catch {} });
      grab.addEventListener("pointermove", (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); form.style.transform = dy ? `translateY(${dy}px)` : ""; });
      const up = () => { if (y0 == null) return; y0 = null; form.style.transform = ""; if (dy > 90) leave(); };
      grab.addEventListener("pointerup", up); grab.addEventListener("pointercancel", up);
    }
    const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade) leave(); } }, form);
    close = M.dialog(shade, file, () => leave());
  }
  // (v2.9.0) a phone's upload: the same PATCH as Manage.api, with the upload's progress (fetch can't report it).
  // The server checks it exactly as before (service/pictures.py); "offline" = no answer at all.
  const PHONE_MAX = 25e6;   // (a photo bigger than this isn't read at all — it would take the phone's memory)
  function sendWithProgress(path, body, onProgress) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open("PATCH", path);
      x.setRequestHeader("Content-Type", "application/json");   // i18n-ok (header)
      x.timeout = 120000;
      x.upload.onprogress = (e) => { if (e.lengthComputable && e.total) onProgress(e.loaded / e.total); };
      x.onload = () => {
        let j = {};
        try { j = JSON.parse(x.responseText || "{}"); } catch {}
        document.documentElement.classList.toggle("srv-down", x.status === 502 || x.status === 504);
        if (x.status === 401 && j.error === "login") { if (M.signedOut) M.signedOut(); return rej(new Error("login")); }
        if (x.status === 403 && j.error === "not-allowed") return res({ status: x.status, ...j, error: M.notAllowed(path) });
        res({ status: x.status, ...j });
      };
      x.onerror = x.ontimeout = () => { document.documentElement.classList.add("srv-down"); rej(new Error("offline")); };
      x.send(JSON.stringify(body));
    });
  }
  // rename / types / remove an upload (the rules as before: "full" or "icons" any, "upload" its own while unused)
  function uploadEditor(u, users, after) {
    const me = (M.me() || {}).user || "", own = !!u.by && String(u.by).toLowerCase() === me.toLowerCase();
    const bg = u.style === "background", ownInUse = bg && M.level("backgrounds") === "upload" && own && users.length > 0;
    const mayEdit = bg ? M.level("backgrounds") === "full" || (M.level("backgrounds") === "upload" && own && !ownInUse) : M.can("icons");
    if (!mayEdit) return el("p.pn-info.md-pad", {}, ownInUse ? K.t("media.edit.inUse")
      : bg && M.level("backgrounds") === "upload" ? K.t("media.edit.notYours") : K.t("media.edit.notAllowed"));
    const name = el("input", { type: "text", value: u.name, maxlength: "40", "aria-label": K.t("media.name") });
    const types = bg ? null : el("div.md-types", { role: "group", "aria-label": K.t("media.fitsTypes") }, LIB.types.map((t) => el("label.cm-chip", {}, el("input", { type: "checkbox", value: t, checked: u.types.includes(t) }), PK().TYPE_NAMES[t] || t)));
    const save = el("button.btn.sm.pri", { type: "button", onclick: async () => {
      const r = await api("/api/manage/pictures", { action: "edit", id: u.id, name: name.value, ...(types ? { types: [...types.querySelectorAll("input:checked")].map((i) => i.value) } : {}) }).catch(() => ({}));
      if (r.error === "in-use-own") return toast(K.t("media.edit.inUseRename"), true);
      if (!r.ok) return toast(r.error || K.t("media.notSaved"), true);
      toast(K.t("media.saved")); after();
    } }, K.t("media.save"));
    const del = el("button.btn.sm.pn-danger", { type: "button", onclick: async () => {
      let body = { action: "delete", id: u.id };
      if (users.length) {
        const pw = await PK().askPassword(K.t("media.edit.stillInUse", { uses: PK().afterDelete(users).join("; ") }));
        if (!pw) return;
        body = { ...body, password: pw };
      } else if (!(await K.ask({ title: K.t("media.edit.removeAsk", { name: u.name }), text: K.t("media.edit.unused"), yes: K.t("media.remove"), danger: true }))) return;
      let r = await api("/api/manage/pictures", body).catch(() => ({}));
      if (r.error === "in-use") {   // (something started using it since this page loaded: ask now)
        const pw = await PK().askPassword(K.t("media.edit.nowInUse", { uses: PK().afterDelete(r.uses || []).join("; ") }));
        if (!pw) return;
        r = await api("/api/manage/pictures", { ...body, password: pw }).catch(() => ({}));
      }
      if (r.error === "in-use-own") return toast(K.t("media.edit.inUseRemove"), true);
      if (!r.ok) return toast(r.error === "wrong" ? K.t("media.edit.wrongPassword") : r.error === "locked" || r.error === "reset-needed" ? K.t("media.edit.locked")
        : r.refused ? K.t("media.edit.refused") : r.error || K.t("media.notRemoved"), true);
      if (r.cleared) M.devicesStale = true;
      toast(K.t("media.removed")); after(true);
    } }, ic("trash", 14), K.t("media.remove"));
    return el("div.md-sec", { "data-unsaved": K.t("media.edit.unsaved", { name: u.name }) }, el("h4", {}, K.t("media.edit.this")),
      el("label.cm-fld", {}, el("span", {}, K.t("media.name")), name), types ? el("div.cm-fld", {}, el("span", {}, K.t("media.edit.fits")), fewChips(types)) : null,
      el("div.cm-acts", {}, save, el("span.sp"), del));
  }
  // a panel chip: opens that panel's Setup (a panel this login may not change: just its name)
  const panelChip = (p) => (M.can("panels", p.id) && !phone()
    ? el("button.md-chip", { type: "button", onclick: () => M.openPanel(p.id) }, p.name, el("small", {}, " " + K.t("media.chip.background")))
    : el("span.md-chip", {}, p.name, el("small", {}, " " + K.t("media.chip.background"))));
  // (the side card's item isn't in the gallery now — a filter or a search hides it)
  const hiddenNote = () => el("p.pn-info.md-hid", {}, ic("filter", 14), K.t("media.hidden"));
  // (v3.0.0: a use is {kind, …} from the server — said by pictures.js useWords)
  const usedList = (uses) => (uses.length ? el("ul.md-used", {}, uses.map((u) => el("li", {}, PK().useWords(u)))) : el("p.pn-info", {}, K.t("media.unusedYet")));

  // ================================================================== Backgrounds
  function bgItems() {
    const built = (window.BACKGROUNDS || []).map((b) => ({ id: b.id, name: b.name, built: true }));
    const ups = LIB.uploads.filter((u) => u.style === "background").map((u) => ({ id: `up:${u.id}`, name: u.name, built: false, u }));
    return [...built, ...ups];
  }
  async function renderBackgrounds() {
    if (!LIB) M.$main.replaceChildren(S.isPhone() ? el("div.p-skel", { role: "status", "aria-label": K.t("common.loading") }, el("i"), el("i"), el("i")) : el("p.muted", {}, K.t("common.loading")));   // (v2.9.0: a phone, skeleton rows)
    if (!(await loadPictures())) return;
    await panels();
    if (pageNow() === "backgrounds") drawBackgrounds();
  }
  function drawBackgrounds() {
    const s = st.backgrounds, all = bgItems(), byPanel = new Map();
    for (const p of PANELS || []) { const b = (p.map && p.map.background) || "mountains"; if (!byPanel.has(b)) byPanel.set(b, []); byPanel.get(b).push({ id: p.id, name: p.name }); }
    // where a background is used: the panels showing it (chips, as on Icons) and anything else in words (a card's picture…)
    const usesOf = (it) => (it.built ? { panels: byPanel.get(it.id) || [], other: [] }
      : { panels: it.u.panels || [], other: ((LIB.used || {})[it.u.id] || []).filter((u) => !u || u.kind !== "background") });
    const uses = (it) => { const u = usesOf(it); return [...u.panels.map((p) => ({ kind: "background", panel: p.name })), ...u.other]; };
    const usedWords = (it) => { const u = usesOf(it), n = u.panels.length + u.other.length;
      return !n ? "" : u.other.length ? K.t("media.bg.usedIn", { n }) : K.t("media.bg.usedBy", { n }); };
    const counts = { all: all.length, built: all.filter((x) => x.built).length, up: all.filter((x) => !x.built).length };
    const list = all.filter((x) => (s.f === "all" || (s.f === "built") === x.built) && hit(s.q, x.name));
    if (!s.cur || !all.some((x) => x.id === s.cur)) s.cur = (all.find((x) => !x.built) || all[0] || {}).id;
    const mayUp = M.can("backgrounds");
    const upBtn = () => el("button.btn.pri", { type: "button", onclick: () => uploadDialog(true, (id) => { if (id) s.cur = `up:${id}`; renderBackgrounds(); }) }, ic("upload", 16), el("span.bl", {}, K.t("media.up.upload")));
    const up = mayUp ? upBtn() : null;
    let body;
    if (!list.length) body = K.empty("image", s.q ? K.t("media.bg.noMatch", { q: s.q.trim() }) : K.t("media.bg.none"), s.q ? K.t("media.bg.noMatchHint") : K.t("media.bg.noneHint"), mayUp && !s.q ? upBtn() : null);
    else if (viewOf("backgrounds") === "list") {
      body = K.table({ label: K.t("media.bg.title"), cur: s.cur, onPick: (id) => pick("backgrounds", id), sort: s.sort, onSort: onSort("backgrounds"),
        cols: [["name", K.t("media.col.background"), { sort: true }], ["kind", K.t("media.up.kind"), { sort: true }], ["size", K.t("media.col.size"), { cls: "c-mid", sort: true }], ["used", K.t("media.usedBy"), { sort: true }], ["by", K.t("media.col.addedBy"), { cls: "c-wide" }], ["added", K.t("media.col.added"), { cls: "c-wide", sort: true }]],
        rows: sortRows(list, s.sort, (x, k) => (k === "kind" ? (x.built ? 0 : 1) : k === "size" ? (x.u ? x.u.bytes || 0 : 0) : k === "used" ? uses(x).length : k === "added" ? (x.u ? x.u.added || 0 : 0) : x.name.toLowerCase()))
          .map((x) => ({ id: x.id, cells: { name: el("span.md-nm", {}, el("span.md-th", {}, K.scene(x.id)), el("b", {}, x.name)),
            kind: x.built ? K.t("media.bg.builtAnimated") : K.t("media.uploaded"), size: x.u ? (x.u.missing ? K.t("media.bg.fileMissing") : K.t("media.bg.dims", { w: x.u.w || "?", h: x.u.h || "?", size: kb(x.u.bytes) })) : K.t("media.bg.drawn"),
            used: usedWords(x) || "—", by: x.u ? x.u.by || "—" : "Skypane", added: x.u ? day(x.u.added) : "—" } })) });   // i18n-ok (the name)
    } else {
      body = el("div.md-grid.md-bg", {}, list.map((x) => tile("backgrounds", x.id, s.cur, [el("span.md-art", {}, K.scene(x.id), x.built ? el("span.md-badge", {}, K.t("media.bg.builtAnimated")) : null, el("span.md-ck", {}, ic("check", 13))),
        el("span.md-meta", {}, el("b", {}, x.name), el("small", {}, usedWords(x) || (x.built ? K.t("media.bg.drawnBy") : K.t("media.bg.dims", { w: x.u.w || "?", h: x.u.h || "?", size: kb(x.u.bytes) }))))], x.name)),
      mayUp && !s.q && s.f !== "built" ? el("button.md-tile.md-add", { type: "button", onclick: () => uploadDialog(true, (id) => { if (id) s.cur = `up:${id}`; renderBackgrounds(); }) },
        el("span.ei", {}, ic("upload", 20)), el("b", {}, K.t("media.up.titleBg")), el("small", {}, K.t("media.bg.formats"))) : null);
    }
    const cur = all.find((x) => x.id === s.cur);
    frame("backgrounds", K.t("media.bg.title"), K.t("media.bg.intro"), up,
      toolbar("backgrounds", [["all", K.t("media.filter.all")], ["built", K.t("media.builtIn")], ["up", K.t("media.uploaded")]], counts), body, cur ? bgSide(cur, uses(cur), usesOf(cur), list.some((x) => x.id === cur.id)) : null);
  }
  function bgSide(x, uses, where, shown) {
    const mayPanels = (PANELS || []).filter((p) => M.can("panels", p.id));
    const useOn = !phone() && mayPanels.length ? el("select.md-useon", { "aria-label": K.t("media.bg.useOnFor", { name: x.name }), onchange: async (e) => {
      const pid = e.target.value; e.target.value = ""; if (!pid) return;
      const r = await api(`/api/manage/panels/${encodeURIComponent(pid)}`, { set: { "look.background": x.id } }).catch(() => ({}));
      if (!r.ok) return toast(r.error || K.t("media.notSaved"), true);
      toast(K.t("media.bg.savedPanel")); PANELS = null; LIB = null; renderBackgrounds();
    } }, el("option", { value: "" }, K.t("media.bg.useOn")), mayPanels.map((p) => el("option", { value: p.id }, p.name))) : null;
    return el("section.card.flush.md-side", { "aria-label": x.name },
      el("div.md-big", {}, K.scene(x.id)),
      el("div.md-sh", {}, el("b", {}, x.name), el("span.pill" + (x.built ? ".acc" : ".idle"), {}, x.built ? K.t("media.builtIn") : x.u.by ? K.t("media.uploadedBy", { name: x.u.by }) : K.t("media.uploaded")),
        el("small", {}, x.built ? K.t("media.bg.builtNote")
          : x.u.missing ? K.t("media.bg.missing") : K.t("media.bg.info", { w: x.u.w, h: x.u.h, size: kb(x.u.bytes), date: day(x.u.added) }))),
      shown ? null : hiddenNote(),
      el("div.md-sec", {}, el("h4", {}, K.t("media.usedBy")), where.panels.length ? el("div.md-chips", {}, where.panels.map((p) => panelChip(p))) : null,
        where.other.length || !where.panels.length ? usedList(where.other) : null),
      x.built ? null : uploadEditor(x.u, uses, (gone) => { if (gone) { st.backgrounds.cur = null; removedNow = true; } LIB = null; renderBackgrounds(); }),
      el("div.cm-acts.foot", {}, useOn, el("span.sp"), x.built ? el("small.muted", {}, K.t("media.builtInKeep")) : null));
  }

  // ================================================================== Icons
  // a line icon's code name in words: "batteryHalf" → "Battery half", "evCharger" → "EV charger", "co2" → "CO₂"
  const WORD = { ac: "AC", tv: "TV", ev: "EV", wifi: "Wi-Fi", led: "LED", co2: "CO₂", cctv: "CCTV", nas: "NAS", usb: "USB", "3d": "3D", prev: "previous" };   // i18n-ok (abbreviations in icon code names)
  const lineName = (n) => { if (WORD[n.toLowerCase()]) return WORD[n.toLowerCase()]; const w = n.replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").split(" ").map((x) => WORD[x.toLowerCase()] || x.toLowerCase());
    const t = w.join(" "); return t.charAt(0).toUpperCase() + t.slice(1); };
  function iconItems() {
    const P = PK();
    const line = (window.ICON_NAMES || []).map((n) => ({ id: `line:${n}`, name: lineName(n), code: n, kind: "line" }));
    const art = P.ART.map(([k, n, ts]) => ({ id: `art:${k}`, name: n, kind: "art", types: ts }));
    const ups = LIB.uploads.filter((u) => u.style !== "background").map((u) => ({ id: `up:${u.id}`, name: u.name, kind: "up", u }));
    return [...ups, ...art, ...line];
  }
  async function renderIcons() {
    if (!LIB) M.$main.replaceChildren(S.isPhone() ? el("div.p-skel", { role: "status", "aria-label": K.t("common.loading") }, el("i"), el("i"), el("i")) : el("p.muted", {}, K.t("common.loading")));   // (v2.9.0: a phone, skeleton rows)
    if (!(await loadPictures())) return;
    if (!M.devices() && (M.can("devices") || M.can("panels"))) { try { await M.loadDevices(); } catch { /* (no devices: "used by" from the server only) */ } }   // i18n-ok (a comment)
    if (pageNow() === "icons") drawIcons();
  }
  const iconFace = (x, size) => (x.kind === "up" ? el("img.md-upimg", { src: PK().upURL(x.u.id), alt: "" }) : x.kind === "art" ? PK().artEl(x.id.slice(4), size + 20) : iconEl(x.code || x.name, size));
  function drawIcons() {
    const s = st.icons, all = iconItems(), D = M.devices();
    // the devices using each picture ("line:bulb", "art:fan-box", "up:<id>" — a device's own choice on Devices)
    const devUse = new Map();
    if (D && D.overrides) for (const [id, o] of Object.entries(D.overrides)) if (o && typeof o.icon === "string") { if (!devUse.has(o.icon)) devUse.set(o.icon, []); devUse.get(o.icon).push(+id); }
    const label = (id) => ((D && D.devices) || []).find((c) => c.id === id)?.label || `#${id}`;
    const uses = (x) => (x.kind === "up" ? (LIB.used || {})[x.u.id] || [] : (devUse.get(x.id) || []).map((id) => ({ kind: "device", name: label(id) })));
    const counts = { all: all.length, line: all.filter((x) => x.kind === "line").length, art: all.filter((x) => x.kind === "art").length, up: all.filter((x) => x.kind === "up").length };
    const list = all.filter((x) => (s.f === "all" || s.f === x.kind) && hit(s.q, x.name, x.code || ""));   // (the code name still found: "batteryHalf")
    if (!s.cur || !all.some((x) => x.id === s.cur)) s.cur = (list[0] || all[0] || {}).id;
    const mayUp = M.can("icons");
    const up = mayUp ? el("button.btn.pri", { type: "button", onclick: () => uploadDialog(false, (id) => { if (id) s.cur = `up:${id}`; renderIcons(); }) }, ic("upload", 16), el("span.bl", {}, K.t("media.up.upload"))) : null;
    const onSw = K.sw(s.on, (v) => { s.on = v; draw("icons"); }, K.t("media.icons.showOn"));
    let body;
    if (!list.length) body = K.empty("shapes", s.q ? K.t("media.icons.noMatch", { q: s.q.trim() }) : K.t("media.icons.none"), s.q ? K.t("media.icons.noMatchHint") : K.t("media.icons.noneHint"));
    else if (viewOf("icons") === "list") {
      body = K.table({ label: K.t("media.icons.title"), cur: s.cur, onPick: (id) => pick("icons", id), sort: s.sort, onSort: onSort("icons"),
        cols: [["name", K.t("media.col.icon"), { sort: true }], ["kind", K.t("media.up.kind"), { sort: true }], ["format", K.t("media.col.format"), { cls: "c-mid" }], ["used", K.t("media.usedBy"), { sort: true }], ["by", K.t("media.col.addedBy"), { cls: "c-wide" }]],
        rows: sortRows(list, s.sort, (x, k) => (k === "kind" ? x.kind : k === "used" ? uses(x).length : x.name.toLowerCase())).map((x) => ({ id: x.id, cells: {
          name: el("span.md-nm", {}, el("span.md-ic" + (s.on ? ".on" : ""), {}, iconFace(x, 18)), el("b", {}, x.name)),
          kind: { line: K.t("media.icons.kindLine"), art: K.t("media.icons.kindArt"), up: K.t("media.uploaded") }[x.kind],
          format: x.kind === "up" ? K.t(x.u.animated ? "media.icons.formatMoves" : "media.icons.format", { ext: x.u.ext ? x.u.ext.toUpperCase() : "", w: x.u.w || "?", h: x.u.h || "?" }) : x.kind === "art" ? K.t("media.icons.animated") : K.t("media.icons.svgLine"),
          used: uses(x).length ? K.t("media.icons.places", { n: uses(x).length }) : "—", by: x.kind === "up" ? x.u.by || "—" : "Skypane" } })) });   // i18n-ok (the name)
    } else {
      body = el("div.md-grid.md-icons" + (s.on ? ".on" : ""), {}, list.slice(0, 400).map((x) => tile("icons", x.id, s.cur,
        [x.kind === "up" ? el("span.md-up", {}, K.t("media.icons.upBadge")) : null, el("span.md-g" + (x.kind === "art" ? ".art" : ""), {}, iconFace(x, 26)), el("b", {}, x.name),
          el("small", {}, uses(x).length ? K.t("media.icons.places", { n: uses(x).length }) : K.t("media.icons.notUsed"))], x.name)),
      list.length > 400 ? el("p.pn-info.md-more", {}, K.t("media.icons.showing", { n: 400, total: list.length })) : null);
    }
    const cur = all.find((x) => x.id === s.cur);
    frame("icons", K.t("media.icons.title"), K.t("media.icons.intro"), up,
      toolbar("icons", [["all", K.t("media.filter.all")], ["line", K.t("media.icons.filterLine")], ["art", K.t("media.icons.filterArt")], ["up", K.t("media.uploaded")]], counts, el("label.md-on", {}, el("span", {}, K.t("media.icons.showOn")), onSw)),
      body, cur ? iconSide(cur, uses(cur), devUse.get(cur.id) || [], list.some((y) => y.id === cur.id)) : null);
  }
  function iconSide(x, uses, devIds, shown) {
    const D = M.devices();
    const devs = ((D && D.devices) || []).filter((c) => c.is !== "hidden").sort((a, b) => a.label.localeCompare(b.label));
    const useFor = !phone() && M.can("devices") && devs.length ? el("select.md-useon", { "aria-label": K.t("media.icons.useForName", { name: x.name }), onchange: async (e) => {
      const id = +e.target.value; e.target.value = ""; if (!id) return;
      const r = await api("/api/manage/devices", { id, set: { icon: x.id } }).catch(() => ({}));
      if (!r.ok) return toast(r.error || K.t("media.notSaved"), true);
      toast(M.follow ? M.follow() : K.t("media.saved")); try { await M.loadDevices(); } catch {} drawIcons();
    } }, el("option", { value: "" }, K.t("media.icons.useFor")), devs.map((c) => el("option", { value: String(c.id) }, c.room ? K.t("media.icons.deviceRoom", { name: c.label, room: c.room }) : c.label))) : null;
    const chips = devIds.length ? el("div.md-chips", {}, devIds.map((id) => { const c = ((D && D.devices) || []).find((d) => d.id === id);
      return el("button.md-chip", { type: "button", onclick: async () => { if (await M.go("devices")) M.openDevice(id); } }, c ? c.label : `#${id}`); })) : null;
    return el("section.card.flush.md-side", { "aria-label": x.name },
      el("div.md-pair", {}, el("div", {}, el("span.md-g.big", {}, iconFace(x, 40)), el("small", {}, K.t("control.off"))), el("div", {}, el("span.md-g.big.on", {}, iconFace(x, 40)), el("small", {}, K.t("media.icons.on")))),
      el("div.md-sh", {}, el("b", {}, x.name), el("span.pill" + (x.kind === "up" ? ".idle" : ".acc"), {}, x.kind === "up" ? (x.u.by ? K.t("media.uploadedBy", { name: x.u.by }) : K.t("media.uploaded")) : x.kind === "art" ? K.t("media.icons.builtArt") : K.t("media.icons.builtLine")),
        el("small", {}, x.kind === "line" ? K.t("media.icons.lineNote", { code: x.code }) : x.kind === "art" ? (x.types && x.types.length ? K.t("media.icons.artNoteFits", { types: x.types.map((t) => PK().TYPE_NAMES[t] || t).join(", ") }) : K.t("media.icons.artNote"))
          : x.u.missing ? K.t("media.icons.missing") : K.t("media.icons.info", { w: x.u.w, h: x.u.h, size: kb(x.u.bytes) }))),
      shown ? null : hiddenNote(),
      el("div.md-sec", {}, el("h4", {}, K.t("media.usedBy")), chips || usedList(uses)),
      x.kind === "up" ? uploadEditor(x.u, uses, (gone) => { if (gone) { st.icons.cur = null; removedNow = true; } LIB = null; renderIcons(); }) : null,
      el("div.cm-acts.foot", {}, useFor, el("span.sp"), x.kind === "up" ? null : el("small.muted", {}, K.t("media.builtInKeep"))),
      x.kind === "up" ? null : el("div.md-sec", {}, el("h4", {}, K.t("media.icons.credits")), M.iconSets.credit(x.kind === "line" ? "line" : PK().ART.some(([k]) => `art:${k}` === x.id) && window.RoomLayouts && RoomLayouts.G && RoomLayouts.G.artInfo && RoomLayouts.G.artInfo(x.id.slice(4)) ? "skyrotter" : "skypane")));
  }

  // ================================================================== Cards
  async function renderCards() {
    if (!CARDS) M.$main.replaceChildren(S.isPhone() ? el("div.p-skel", { role: "status", "aria-label": K.t("common.loading") }, el("i"), el("i"), el("i")) : el("p.muted", {}, K.t("common.loading")));   // (v2.9.0: a phone, skeleton rows)
    try { CARDS = await M.cardList(); } catch (e) { if (e.message !== "login") M.$main.replaceChildren(K.empty("cards", K.t("media.cards.cantRead"), K.t("media.cantReadWhy"))); return; }
    await panels();
    if (pageNow() === "cards") drawCards();
  }
  const cardIcon = (c) => (c.tier === "script" ? "zap" : "cards");
  // a gallery tile's face: the card itself (its sealed frame, made-up values, scaled down); a card without code: a stand-in
  const mini = (c) => {
    if (c.sha && M.cardKit.preview) { const box = el("span.md-mf"); M.cardKit.preview(box, c, { mini: true, maxH: 150 }); return box; }
    return el("span.md-mc", { style: `aspect-ratio:${Math.max(1, c.size.w)}/${Math.max(1, c.size.h)}` }, el("span.gl", {}, el("small", {}, c.name), el("b", {}, ic(cardIcon(c), 18), `${c.size.w} × ${c.size.h}`), el("span", {}, c.author || K.t("media.cards.someone"))));   // i18n-ok (CSS)
  };
  const cardStatus = (c) => (c.changed ? el("span.pill.warn", {}, K.t("media.cards.changedSince")) : el("span.pill", {}, K.t("media.cards.installed")));
  function drawCards() {
    const s = st.cards, all = CARDS || [], names = new Map((PANELS || []).map((p) => [p.id, p.name]));
    const counts = { all: all.length, template: all.filter((c) => c.tier !== "script").length, script: all.filter((c) => c.tier === "script").length };
    const list = all.filter((c) => (s.f === "all" || (s.f === "script") === (c.tier === "script")) && hit(s.q, c.name, c.author || "", c.description || ""));
    if (!s.cur || !all.some((c) => c.id === s.cur)) s.cur = (list[0] || all[0] || {}).id;
    const may = M.can("cards") && !phone();
    const instBtn = () => el("button.btn.pri", { type: "button", onclick: () => M.cardKit.installDialog((id) => { s.cur = id; CARDS = null; renderCards(); }) }, ic("upload", 16), el("span.bl", {}, K.t("media.cards.install")));
    const inst = may ? instBtn() : null;
    let body;
    if (!list.length) body = K.empty("cards", s.q ? K.t("media.cards.noMatch", { q: s.q.trim() }) : K.t("media.cards.none"), s.q ? K.t("media.cards.noMatchHint") : K.t("media.cards.noneHint"), may && !s.q ? instBtn() : null);
    else if (viewOf("cards") === "list") {
      body = K.table({ label: K.t("media.cards.title"), cur: s.cur, onPick: (id) => pick("cards", id), sort: s.sort, onSort: onSort("cards"),
        cols: [["name", K.t("media.col.card"), { sort: true }], ["tier", K.t("media.up.kind"), { sort: true }], ["version", K.t("media.cards.version"), { cls: "c-mid" }], ["author", K.t("media.cards.author"), { cls: "c-wide", sort: true }], ["checked", K.t("media.cards.checked"), { sort: true }], ["used", K.t("media.cards.usedOn"), { sort: true }]],
        rows: sortRows(list, s.sort, (c, k) => (k === "tier" ? c.tier : k === "author" ? (c.author || "").toLowerCase() : k === "checked" ? c.checkedAt || 0 : k === "used" ? c.used.length : c.name.toLowerCase())).map((c) => ({ id: c.id, cells: {
          name: el("span.md-nm", {}, ic(cardIcon(c), 15), el("b", {}, c.name), c.changed ? el("span.pill.warn", {}, K.t("media.cards.changed")) : null),
          tier: c.tier === "script" ? K.t("media.cards.script") : K.t("media.cards.template"), version: c.version, author: c.author || "—", checked: day(c.checkedAt),
          used: c.used.length ? c.used.map((p) => names.get(p) || p).join(", ") : "—" } })) });
    } else {
      body = el("div.md-grid.md-cards", {}, list.map((c) => tile("cards", c.id, s.cur, [mini(c),
        el("span.md-meta", {}, el("b", {}, c.name), el("small", {}, K.t(c.tier === "script" ? "media.cards.scriptBy" : "media.cards.templateBy", { author: c.author || K.t("media.cards.someone") })),
          el("span.md-row2", {}, cardStatus(c), el("small", {}, c.used.length ? K.t("media.cards.onPanels", { n: c.used.length }) : K.t("media.cards.notPlaced"))))], c.name)));
    }
    const cur = all.find((c) => c.id === s.cur);
    frame("cards", K.t("media.cards.title"), K.t("media.cards.intro"), inst,
      toolbar("cards", [["all", K.t("media.filter.all")], ["template", K.t("media.cards.templates")], ["script", K.t("media.cards.scripts")]], counts), body, cur ? cardSide(cur, names, list.some((x) => x.id === cur.id)) : null);
  }
  function cardSide(c, names, shown) {
    const prev = el("div.md-prev");
    M.cardKit.preview(prev, c);
    const L = M.cardKit.LEVEL, mayPanels = (PANELS || []).filter((p) => M.can("panels", p.id));
    const place = !phone() && mayPanels.length ? el("select.md-useon", { "aria-label": K.t("media.cards.addToFor", { name: c.name }), onchange: (e) => { const pid = e.target.value; e.target.value = ""; if (pid) M.go(`panels/${pid}/layout`); } },
      el("option", { value: "" }, K.t("media.cards.addTo")), mayPanels.map((p) => el("option", { value: p.id }, p.name))) : null;
    return el("section.card.flush.md-side", { "aria-label": c.name }, prev,
      el("div.md-sh", {}, el("b", {}, c.name), cardStatus(c), el("small", {}, c.description || "")), shown ? null : hiddenNote(),
      c.changed ? el("p.pn-warn.md-m", {}, ic("alert", 15), K.t("media.cards.changedNote")) : null,
      el("div.pn-kv", {}, el("span", {}, K.t("media.up.kind")), el("b", {}, c.tier === "script" ? K.t("media.cards.scriptCard") : K.t("media.cards.templateCard")),
        el("span", {}, K.t("media.cards.version")), el("b", {}, c.version), el("span", {}, K.t("media.cards.author")), el("b", {}, c.author || "—"),
        el("span", {}, K.t("media.cards.checked")), el("b", {}, day(c.checkedAt)), el("span", {}, K.t("media.cards.usedOn")), el("b", {}, c.used.length ? c.used.map((p) => names.get(p) || p).join(", ") : K.t("media.cards.notPlaced"))),
      el("div.md-sec", {}, el("h4", {}, K.t("media.cards.mayDo")), el("ul.md-used", {}, c.words.map((w) => el("li", {}, w))),
        c.flags.length ? el("ul.cflags", {}, c.flags.map(([l, t]) => el("li." + l, {}, `${L[l]} ${t}`))) : null),
      el("div.cm-acts.foot", {}, place,
        el("button.btn.sm", { type: "button", onclick: () => M.cardKit.exportCard(c) }, ic("download", 14), K.t("media.cards.export")),
        el("button.btn.sm", { type: "button", onclick: () => M.cardKit.aiPrompt(c, c.flags, c.words, null) }, K.t("media.cards.askAi")),
        el("span.sp"),
        M.can("cards") && !phone() ? el("button.btn.sm.pn-danger", { type: "button", onclick: async () => {
          const on = c.used.map((p) => names.get(p) || p);
          if (!(await K.ask({ title: K.t("media.edit.removeAsk", { name: c.name }), text: on.length ? K.t("media.cards.removeOn", { places: on.join(", ") }) : K.t("media.cards.noLayout"), yes: K.t("media.cards.removeYes"), danger: true }))) return;
          const r = await api("/api/manage/cards", { action: "delete", id: c.id }).catch(() => ({}));
          if (!r.ok) return toast(r.error || K.t("media.notRemoved"), true);
          toast(K.t("media.removed")); st.cards.cur = null; CARDS = null; renderCards();
        } }, ic("trash", 14), K.t("media.remove")) : null));
  }

  // ================================================================== in the shell
  const views = (a, b) => [["gallery", K.t("media.view.gallery"), "cards", a], ["list", K.t("media.view.list"), "list", b]];
  S.page("backgrounds", { title: K.t("media.bg.title"), group: "manage", icon: "image", allowed: () => M.can("backgrounds"), words: "background picture photo scene sky upload",
    views: views(K.t("media.view.bgGallery"), K.t("media.view.bgList")), render: () => renderBackgrounds() });
  S.page("icons", { title: K.t("media.icons.title"), group: "manage", icon: "shapes", allowed: () => M.can("icons"), words: "icon picture drawing upload device",
    views: views(K.t("media.view.iconsGallery"), K.t("media.view.iconsList")), render: () => renderIcons() });
  S.page("cards", { title: K.t("media.cards.title"), group: "manage", icon: "cards", allowed: () => M.can("cards"), words: "card community install template script",
    views: views(K.t("media.view.cardsGallery"), K.t("media.view.cardsList")), render: () => renderCards() });
  // ("/" — the search of the page open)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || !$page || !$page.isConnected || document.querySelector(".modal-bg")) return;
    const a = document.activeElement; if (a && (/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) || a.isContentEditable)) return;
    const q = $page.querySelector(".md-q"); if (q) { e.preventDefault(); q.focus(); }
  });
  M.mediaTopic = () => ({ backgrounds: "backgrounds", icons: "icons", cards: "cards-people-make" })[pageNow()] || "getting-started";
})();
