// Skypane Manager — (v3.0.5) pictures for the slide-show engine (mockups/prototypes/settings-and-pages.html → Pictures):
//   Kit.showEditor({o, set, which, uploads}) — the options shared by the Slide show / Picture card (the builder), the
//     panel's rotating background and the screensaver (Panels → Look): where the pictures come from (uploads, or a
//     picture folder), which ones, how often, the order, the transition (10 plus Mix — hover a tile for a preview),
//     its speed / direction / color / shape, the fit. set(next): the whole options object (service/layouts.py
//     show_opts checks it again).
//   M.pictureFolders() — the folders the admin picked (GET /api/manage/picture-folders), read once per sign-in.
//   The Picture folders page (the admin): the media root (PICTURES_DIR, mapped in Docker / Unraid — Skypane never
//     mounts anything itself), the folders picked under it, Browse… to pick another, Rescan, Rename, Remove.
// Built with DOM calls + textContent only; every word from strings/en.js. The tile previews use the panels' own engine
// (layouts/v4/shared/slideshow.js), on the Manager's routes for a folder's pictures.
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api, toast } = M, ic = K.icon, t = K.t;
  // (the engine in the Manager: a folder's list and pictures through /api/manage/picture-folders — a login's own view)
  if (window.Slides) Slides.api = { list: (id) => `/api/manage/picture-folders/${id}`, img: (id, k, size) => `/api/manage/picture-folders/${id}/${k}/${size}` };   // i18n-ok (addresses)

  let FOLD = null;
  M.onReset(() => { FOLD = null; });
  M.pictureFolders = async (fresh) => {
    if (FOLD && !fresh) return FOLD;
    try { FOLD = await api("/api/manage/picture-folders"); } catch { FOLD = { enabled: false, sources: [] }; }
    return FOLD;
  };

  // ================================================================== the shared options
  const TR = () => [["none", t("show.tr.none")], ["fade", t("show.tr.fade")], ["whip", t("show.tr.whip")], ["punch", t("show.tr.punch")], ["match", t("show.tr.match")],
    ["leak", t("show.tr.leak")], ["page", t("show.tr.page")], ["cube", t("show.tr.cube")], ["ramp", t("show.tr.ramp")], ["dip", t("show.tr.dip")], ["shape", t("show.tr.shape")], ["mix", t("show.tr.mix")]];
  const secs = (n) => (n >= 3600 ? t("show.every.hours", { n: n / 3600 }) : n >= 60 ? t("show.every.mins", { n: n / 60 }) : t("show.every.secs", { n }));
  const EVERY = [5, 10, 30, 60, 300, 3600];
  function seg(opts, cur, pick, label) {
    return el("div.seg", { role: "group", "aria-label": label || null }, opts.map(([v, l]) =>
      el("button" + (String(cur) === String(v) ? ".on" : ""), { type: "button", "aria-pressed": String(String(cur) === String(v)), onclick: () => pick(v) }, l)));
  }
  const row = (label, hint, control, dim) => { const r = K.row(label, hint, control); if (dim) r.classList.add("sh-dim"); return r; };
  let TP = null;   // (the one tile preview that runs: hover / focus — so it stays cheap)
  // (v3.0.5) a preview that ends lets its pictures go (Show.stop) and the tile gets its one still picture back
  const still = (box, src) => { if (src && box && !box.querySelector(".ss-ly")) { box.append(el("div.ss-ly", {}, el("img", { src, alt: "" }))); box.classList.add("ss-box"); } };
  const tileStop = () => { if (TP) { clearInterval(TP.t); if (TP.s) TP.s.stop(); still(TP.show, TP.rest); TP = null; } };

  // opts: {o, set(next), which: "card" | "bg" | "ss", uploads: [{id, name}]} → the editor
  K.showEditor = function showEditor({ o, set, which, uploads }) {
    o = o && typeof o === "object" ? o : {};
    const ups = uploads || [], put = (k, v) => { const n = { ...o }; if (v == null) delete n[k]; else n[k] = v; set(n); };
    const wrap = el("div.sh-ed");
    const from = el("select", { "aria-label": t("show.from"), onchange: (e) => {
      const v = e.target.value, n = { ...o };
      if (v === "up") { delete n.src; n.pics = n.pics || []; } else { n.src = v; delete n.pics; }
      set(n);
    } }, el("option", { value: "up", selected: !o.src }, t("show.fromUploads")));
    M.pictureFolders().then((f) => {
      for (const s of (f && f.enabled && f.sources) || []) from.append(el("option", { value: "fs:" + s.id, selected: o.src === "fs:" + s.id }, t("show.fromFolder", { name: s.name })));
      if (o.src && ![...from.options].some((x) => x.value === o.src)) from.append(el("option", { value: o.src, selected: true }, t("show.folderGone")));
    });
    wrap.append(row(t("show.from"), o.src ? t("show.fromFolderHint") : null, from));
    const cur = Array.isArray(o.pics) ? o.pics : [], many = !!o.src || cur.length > 1;
    if (!o.src) {
      const grid = el("div.sh-pics", { role: "group", "aria-label": t("show.pick") });
      if (!ups.length) grid.append(el("small.muted", {}, which === "card" ? t("show.noUploads") : t("show.noBackgrounds")));
      for (const u of ups) {
        const v = "up:" + u.id, k = cur.indexOf(v);
        grid.append(el("button.sh-th" + (k >= 0 ? ".on" : ""), { type: "button", title: u.name, "aria-pressed": String(k >= 0), "aria-label": u.name, onclick: () => {
          if (k >= 0) put("pics", cur.filter((x) => x !== v));
          else if (cur.length >= 50) toast(t("show.max"), true);
          else put("pics", [...cur, v]);
        } }, el("img", { src: `/pictures/${u.id}`, alt: "", loading: "lazy" }), k >= 0 && cur.length > 1 ? el("span.sh-ord", {}, String(k + 1)) : null));
      }
      wrap.append(grid, el("small.sh-count", {}, !cur.length ? t("show.pickOne") : cur.length === 1 ? t("show.one") : t("show.several", { n: cur.length })));
    }
    const every = Number.isInteger(o.every) ? o.every : which === "bg" ? 300 : which === "ss" ? 60 : 10;
    const list = EVERY.includes(every) ? EVERY : [...EVERY, every].sort((a, b) => a - b);
    wrap.append(el("div.grp.sh-grp", {},
      row(t("show.every"), null, el("select", { "aria-label": t("show.every"), disabled: !many, onchange: (e) => put("every", +e.target.value) }, list.map((n) => el("option", { value: String(n), selected: n === every }, secs(n)))), !many),
      row(t("show.order"), null, seg([["order", t("show.inOrder")], ["random", t("show.random")]], o.order === "random" ? "random" : "order", (v) => put("order", v === "random" ? "random" : null), t("show.order")), !many)));
    // the transition: 12 tiles (None, the 10, Mix), each a little preview on hover / focus
    const trans = o.trans || "fade", speed = o.speed || "normal";
    const tiles = el("div.sh-trgrid");
    const demoPics = (o.src ? [] : cur.map((v) => `/pictures/${v.slice(3)}`)).concat(ups.map((u) => `/pictures/${u.id}`));
    const pair = [...new Set(demoPics)].slice(0, 2);
    for (const [v, n] of TR()) {
      const show = el("span.sh-show"), b = el("button.sh-trt" + (v === trans ? ".on" : ""), { type: "button", title: n, "aria-pressed": String(v === trans), onclick: () => put("trans", v === "fade" ? null : v) }, show, el("span.sh-tn", {}, n));
      const start = () => {
        tileStop(); if (!window.Slides || pair.length < 2 || v === "none") return;
        let k = 0; const step = () => { if (!b.isConnected) return tileStop(); k++;
          const tr = v === "mix" ? Slides.MIX[Math.floor(Math.random() * Slides.MIX.length)] : v;
          Slides.demo(show, pair[(k + 1) % 2], pair[k % 2], { ...o, trans: tr }).then((s) => { if (TP && TP.b === b) TP.s = s; else { s.stop(); still(show, pair[0]); } }); };   // (v3.0.5: ended meanwhile — let go)
        TP = { b, show, rest: pair[0], t: setInterval(step, ({ slow: 1600, normal: 1000, fast: 600 }[speed] || 1000) + 700) }; step();
      };
      b.addEventListener("mouseenter", start); b.addEventListener("focus", start);
      b.addEventListener("mouseleave", () => { if (TP && TP.b === b) tileStop(); }); b.addEventListener("blur", () => { if (TP && TP.b === b) tileStop(); });
      still(show, pair[0]);
      tiles.append(b);
    }
    const sub = [row(t("show.speed"), null, seg([["slow", t("show.slow")], ["normal", t("show.normal")], ["fast", t("show.fast")]], speed, (v) => put("speed", v === "normal" ? null : v), t("show.speed")))];
    if (trans === "whip") sub.push(row(t("show.dir"), null, seg([["left", t("show.left")], ["right", t("show.right")], ["up", t("show.up")], ["down", t("show.down")]], o.dir || "left", (v) => put("dir", v === "left" ? null : v), t("show.dir"))));
    if (trans === "dip") sub.push(row(t("show.dipTo"), null, seg([["black", t("show.black")], ["white", t("show.white")]], o.dip || "black", (v) => put("dip", v === "black" ? null : v), t("show.dipTo"))));
    if (trans === "shape") sub.push(row(t("show.shape"), null, seg([["circle", t("show.circle")], ["star", t("show.star")], ["diagonal", t("show.diagonal")]], o.shape || "circle", (v) => put("shape", v === "circle" ? null : v), t("show.shape"))));
    wrap.append(el("div.sh-trbox" + (many ? "" : ".sh-dim"), {},
      el("div.sh-trh", {}, el("b", {}, t("show.transition")), el("small.muted", {}, pair.length > 1 ? t("show.hoverHint") : t("show.clickHint"))),
      tiles, el("div.grp.sh-grp", {}, sub),
      trans === "mix" ? el("small.muted", {}, t("show.mixNote")) : null,
      trans === "match" ? el("p.pn-info", {}, t("show.matchNote")) : null,
      el("small.muted.sh-gentle", {}, ic("gauge", 13), t("show.gentleNote"))));
    wrap.append(el("div.grp.sh-grp", {}, row(t("show.fit"), o.fit === "contain" ? t("show.fitWholeHint") : t("show.fitFillHint"),
      seg([["cover", t("show.fill")], ["contain", t("show.whole")]], o.fit === "contain" ? "contain" : "cover", (v) => put("fit", v === "cover" ? null : v), t("show.fit")))));
    return wrap;
  };

  // ================================================================== the Picture folders page (the admin)
  let F = null, $page = null;
  async function load(fresh) { F = await M.pictureFolders(fresh); draw(); }
  const countWords = (s) => (s.error ? t("folders.unreachable") : s.count == null ? t("folders.notListed") : t("folders.count", { n: s.count }));
  function draw() {
    const ph = el("div.ph", {}, el("div", {}, el("h1", {}, t("folders.title")), el("p", {}, t("folders.intro"))), el("span.sp"),
      F && F.enabled ? el("div.acts", {}, el("button.btn.pri", { type: "button", onclick: () => browse("") }, ic("folder", 15), t("folders.add"))) : null);
    const body = [];
    if (!F) body.push(el("p.muted", {}, t("common.loading")));
    else if (!F.enabled) body.push(setupCard(false));
    else {
      const rows = (F.sources || []).map((s) => el("div.pf-row", {}, ic("folder", 20),
        el("div.pf-tx", {}, el("b", {}, s.name), el("small", {}, `${(F.root || "").replace(/\/+$/, "")}/${s.path}`.replace(/\/$/, "")), el("small" + (s.error ? ".pn-warn" : ".muted"), {}, countWords(s))),   // (v3.0.5: no "root" for a login that is not the admin)
        el("div.pf-acts", {},
          el("button.btn.sm", { type: "button", onclick: () => rescan(s) }, ic("refresh", 14), t("folders.rescan")),
          el("button.btn.sm", { type: "button", onclick: () => rename(s) }, t("folders.rename")),
          el("button.btn.sm.danger", { type: "button", onclick: () => remove(s) }, t("folders.remove")))));
      body.push(el("section.card.flush", {}, el("h3.ch", {}, ic("folder", 16), t("folders.picked"), el("small", {}, t("folders.of", { n: (F.sources || []).length, max: F.max || 24 }))),
        rows.length ? el("div.pf-list", {}, rows) : el("p.pf-empty.muted", {}, t("folders.none"))), setupCard(true));
    }
    $page = el("div.md-page.pf-page", { "data-page": "folders" }, ph, ...body);
    M.swap(M.$main, $page);
  }
  // how a folder gets into the container (Skypane only reads what's mapped there; it never mounts a share itself)
  function setupCard(on) {
    const root = (F && F.root) || "/pictures";
    return el("section.card", {}, el("h3.ch", {}, ic("info", 16), on ? t("folders.howMore") : t("folders.off")),
      el("p", {}, on ? t("folders.howMoreText", { root }) : t("folders.offText")),
      el("pre.pf-cmd", {}, `-e PICTURES_DIR=/pictures\n-v /mnt/user/Photos:/pictures:ro`),   // i18n-ok (a command)
      el("ol.pf-steps", {}, el("li", {}, t("folders.stepOne")), el("li", {}, t("folders.stepTwo")), el("li", {}, t("folders.stepThree"))),
      el("p.pn-info", {}, t("folders.readOnly")));
  }
  // (v3.0.5) the server's answer in words: its code (in-use, not-found, busy…) → folders.err.inUse…, anything else the
  // general one
  const errWords = (r) => { const c = r && (r.refused || r.error);
    return typeof c === "string" && /^[a-z-]{2,20}$/.test(c) ? K.tOr("folders.err." + c.replace(/-([a-z])/g, (_, x) => x.toUpperCase()), t("folders.err.general")) : t("folders.err.general"); };
  async function rescan(s) {
    try { const r = await api("/api/manage/picture-folders", { action: "rescan", id: s.id });
      if (!r.ok) toast(errWords(r), true); else toast(r.error ? t("folders.unreachable") : t("folders.count", { n: r.count || 0 }), !!r.error); }
    catch (e) { if (e.message !== "login") toast(t("folders.offline"), true); }
    load(true);
  }
  async function rename(s) {
    const box = el("input", { type: "text", value: s.name, maxlength: "40", "aria-label": t("folders.name") });
    if (!(await K.ask({ title: t("folders.renameTitle"), yes: t("folders.rename"), extra: box }))) return;
    try { const r = await api("/api/manage/picture-folders", { action: "rename", id: s.id, name: box.value.trim() }); if (!r.ok) toast(errWords(r), true); }
    catch (e) { if (e.message !== "login") toast(t("folders.offline"), true); }
    load(true);
  }
  // (v3.0.5) the panels, and the saved cards and the Trash's items that would bring it back
  const folderUses = (r) => [...(r.panels || []).map((p) => ({ id: p.id, kind: "background", name: p.name })),
    ...(r.saved || []).map((x) => ({ kind: "template", name: t("folders.useSaved", { name: x.name }) })),
    ...(r.trash || []).map((x) => ({ kind: "trash", name: t("folders.useTrash", { name: x.name }) }))];
  const showInUse = (s, r) => (K.trash && K.trash.inUse ? K.trash.inUse(t("folders.inUseTitle", { name: s.name }), folderUses(r), (u) => u.name, r.panels || []) : toast(errWords({ error: "in-use" }), true));
  async function remove(s) {
    // (v3.0.5, tester) the in-use check first: a folder a panel uses shows what uses it straight away, never "Are you sure?" first
    try {
      const u = await api("/api/manage/picture-folders", { action: "uses", id: s.id });
      if (u && u.ok && u.inUse) { await showInUse(s, u); return; }
    } catch (e) { if (e.message === "login") return; }
    if (!(await K.ask({ title: t("folders.removeTitle", { name: s.name }), text: t("folders.removeText"), yes: t("folders.remove"), danger: true }))) return;
    try {
      const r = await api("/api/manage/picture-folders", { action: "remove", id: s.id });
      if (r.error === "in-use") await showInUse(s, r);   // (v3.0.5: in use since the check — the server's 409 says so still)
      else if (!r.ok) toast(errWords(r), true);
      else toast(t("folders.removed", { name: s.name }));
    } catch (e) { if (e.message !== "login") toast(t("folders.offline"), true); }
    load(true);
  }
  // Browse…: the folders under the media root, one level at a time; "Use this folder" picks the one open
  async function browse(start) {
    let path = start, close = null;
    const list = el("div.pf-browse", { role: "list" }), crumbs = el("div.pf-crumbs"), name = el("input", { type: "text", maxlength: "40", "aria-label": t("folders.name"), placeholder: t("folders.namePh") });
    const info = el("small.muted"), use = el("button.btn.pri", { type: "button" }, t("folders.use"));
    const cancel = el("button.btn", { type: "button", onclick: () => close && close() }, t("control.cancel"));
    async function open(p) {
      list.replaceChildren(el("p.muted", {}, t("common.loading")));
      let r;
      try { r = await api("/api/manage/picture-folders", { action: "browse", path: p }); } catch (e) { if (e.message !== "login") list.replaceChildren(el("p.pn-warn", {}, t("folders.offline"))); return; }
      if (!r.ok) { list.replaceChildren(el("p.pn-warn", {}, r.error ? errWords(r) : t("folders.cantOpen"))); return; }
      path = r.path;
      const parts = path ? path.split("/") : [];
      crumbs.replaceChildren(el("button.ghost.small", { type: "button", onclick: () => open("") }, F.root || "/pictures"),
        ...parts.flatMap((x, i) => [el("span.muted", {}, " / "), el("button.ghost.small", { type: "button", onclick: () => open(parts.slice(0, i + 1).join("/")) }, x)]));
      list.replaceChildren(...(r.folders.length ? r.folders.map((f) => el("button.pf-item", { type: "button", role: "listitem", onclick: () => open(f.path) },
        ic("folder", 18), el("span", {}, f.name), el("small.muted", {}, f.pictures ? t("folders.here", { n: f.pictures >= 999 ? "999+" : f.pictures }) : f.more ? t("folders.hasFolders") : t("folders.empty")), ic("chevR", 14)))
        : [el("p.muted", {}, t("folders.noSub"))]), ...(r.cut ? [el("small.muted", {}, t("folders.cut"))] : []));
      info.textContent = t("folders.inThis", { n: r.pictures });
      name.placeholder = parts.length ? parts[parts.length - 1] : t("folders.namePh");
      use.disabled = !path && !r.pictures && !r.folders.length;
    }
    use.addEventListener("click", async () => {
      try {
        const r = await api("/api/manage/picture-folders", { action: "add", path, name: name.value.trim() });
        if (!r.ok) { toast(errWords(r), true); return; }
        toast(r.source.error ? t("folders.unreachable") : t("folders.added", { name: r.source.name, n: r.source.count }));
        if (close) close();
        load(true);
      } catch (e) { if (e.message !== "login") toast(t("folders.offline"), true); }
    });
    const shade = el("div.modal-bg.top", { onclick: (e) => { if (e.target === shade && close) close(); } },
      el("div.modal.pf-dlg", { role: "dialog", "aria-labelledby": "pf-h" }, el("h2", { id: "pf-h" }, t("folders.browseTitle")),
        el("p.muted", {}, t("folders.browseText")), crumbs, list, info,
        el("label.pf-name", {}, el("b", {}, t("folders.name")), name),
        el("div.pn-ask-acts", {}, cancel, use)));
    close = M.dialog(shade, use, () => close && close());
    open(start);
  }

  S.page("folders", { title: t("folders.title"), group: "manage", icon: "folder", allowed: () => M.isAdmin(), demoHidden: true,
    words: "picture folder photos nas share local storage slide show screensaver background", render: () => { F = null; draw(); load(); } });
})();
