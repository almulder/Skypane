// Skypane Manager — Help: the Help page over the Manager (#help, #help/<topic> — the address is the shell's router,
// shell.js: it calls Manage.helpRoute / helpHide), opened from the sidebar's Help (F1), a live search over every topic,
// and a small "?" next to each page's title.
// The topics are plain data in help-topics.js (window.SKYPANE_HELP). Help is an overlay: the page under it — even
// the layout builder with unsaved changes — stays exactly as it was (no Manage.go, so no unsaved-changes question);
// keys pressed in Help never reach the builder. Built with DOM calls + textContent only.
(function () {
  const M = window.Manage, H = window.SKYPANE_HELP, K = window.Kit;
  if (!M || !H) return;
  const { el } = M;
  const TOPICS = H.topics, byId = new Map(TOPICS.map((t) => [t.id, t]));
  const SECTION = new Map(H.sections);

  // ---------- text: **bold** and [[topic]] / [[topic|words]] links ----------
  const plain = (s) => String(s).replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[\[([\w-]+)(?:\|([^\]]+))?\]\]/g, (_, id, w) => w || (byId.get(id) || {}).title || id);
  const blockText = (b) => (typeof b === "string" ? b : b.steps || b.list ? (b.steps || b.list).join(" ") : b.tip || b.warn || b.h || "");
  // (the same folding as the builder's device search: small letters, no accents, apostrophes don't count)
  const foldCh = (c) => c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’‘`]/g, "");
  const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’‘`]/g, "");
  const words = (q) => fold(q).split(/[^a-z0-9°]+/).filter(Boolean);
  // what a topic is searched by: its title, its extra words, its text
  for (const t of TOPICS) {
    t.text = plain(t.body.map(blockText).join(" "));
    t.fTitle = fold(t.title); t.fAll = fold(`${t.title} ${t.words || ""} ${t.where || ""} ${t.text}`);
    t.tWords = t.fTitle.split(/[^a-z0-9]+/).filter(Boolean);
    t.aWords = t.fAll.split(/[^a-z0-9]+/).filter(Boolean);
  }
  // every word somewhere (parts of words too, any order); lower rank = better:
  // 0 the exact title, 1 a title that starts with it, 2 every word starts a title word, 3 every word in the title,
  // 4 every word starts a word of the topic, 5 the rest
  function search(q) {
    const ws = words(q), Q = ws.join(" ");
    if (!ws.length) return { hits: [], near: [], ws };
    const hits = [];
    TOPICS.forEach((t, n) => {
      if (!ws.every((w) => t.fAll.includes(w))) return;
      const rank = t.fTitle === Q ? 0 : t.fTitle.startsWith(Q) ? 1 : ws.every((w) => t.tWords.some((x) => x.startsWith(w))) ? 2
        : ws.every((w) => t.fTitle.includes(w)) ? 3 : ws.every((w) => t.aWords.some((x) => x.startsWith(w))) ? 4 : 5;
      const count = ws.reduce((s, w) => s + t.fAll.split(w).length - 1, 0);
      hits.push({ t, rank, count, n });
    });
    hits.sort((a, b) => a.rank - b.rank || b.count - a.count || a.n - b.n);
    // nothing has every word: the topics with the most of them ("close matches")
    let near = [];
    if (!hits.length && ws.length > 1) {
      near = TOPICS.map((t, n) => ({ t, k: ws.filter((w) => t.fAll.includes(w)).length, n })).filter((x) => x.k)
        .sort((a, b) => b.k - a.k || a.n - b.n).slice(0, 6);
    }
    return { hits, near, ws };
  }
  // the text with the matched words marked (folded per letter, so "cafe" finds "Café" and the marks land right)
  function marked(text, ws) {
    const s = String(text);
    if (!ws || !ws.length) return [s];
    let f = ""; const at = [];
    for (let i = 0; i < s.length; i++) { const c = foldCh(s[i]); for (let j = 0; j < c.length; j++) { f += c[j]; at.push(i); } }
    const on = new Uint8Array(s.length + 1);
    for (const w of ws) for (let k = f.indexOf(w); k >= 0; k = f.indexOf(w, k + 1)) for (let j = k; j < k + w.length; j++) on[at[j]] = 1;
    const out = []; let i = 0;
    while (i < s.length) {
      let j = i; while (j < s.length && on[j] === on[i]) j++;
      out.push(on[i] ? el("mark", {}, s.slice(i, j)) : s.slice(i, j)); i = j;
    }
    return out;
  }
  // a line of help text as nodes: bold, links, marks
  function rich(s, ws) {
    const out = [], re = /\*\*(.+?)\*\*|\[\[([\w-]+)(?:\|([^\]]+))?\]\]/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(...marked(s.slice(last, m.index), ws));
      if (m[1] != null) out.push(el("b", {}, ...marked(m[1], ws)));
      else {
        const id = m[2], t = byId.get(id);
        out.push(t ? el("a.hp-link", { href: `#help/${id}`, onclick: (e) => { e.preventDefault(); show(id, true); } }, ...marked(m[3] || t.title, ws)) : (m[3] || id));
      }
      last = re.lastIndex;
    }
    if (last < s.length) out.push(...marked(s.slice(last), ws));
    return out;
  }
  // a short piece of the text around the first match (for the result list)
  function snippet(t, ws) {
    const f = fold(t.text); let k = -1;
    for (const w of ws) { const i = f.indexOf(w); if (i >= 0 && (k < 0 || i < k)) k = i; }
    if (k < 0) return t.text.slice(0, 110) + (t.text.length > 110 ? "…" : "");
    // (positions in the folded text are close enough to the original's for a cut; the marks are exact)
    const a = Math.max(0, k - 40), b = Math.min(t.text.length, a + 120);
    return (a ? "…" : "") + t.text.slice(a, b).replace(/^\S*\s/, a ? "" : "$&") + (b < t.text.length ? "…" : "");
  }

  // (replaceChildren would write a null as the text "null")
  const fill = (box, ...kids) => box.replaceChildren(...kids.filter((x) => x != null && x !== false && x !== ""));

  // ---------- which page is open (the topic the Help button and the "?" open) ----------
  const TAB_TOPIC = { overview: "overview", panels: "add-panel", cameras: "cameras", health: "health", guest: "guest-wifi", backgrounds: "backgrounds", icons: "icons",
    cards: "cards-people-make", settings: "settings-admin", accounts: "accounts", account: "my-account", devices: "devices", more: "phone", feedback: "feedback" };
  function pageTopic() {
    if (document.body.classList.contains("bld-open")) return "builder-basics";
    if (document.body.classList.contains("at-login")) return "getting-started";
    const tab = M.tab ? M.tab() : "devices", main = M.$main;
    if (tab === "devices") return main.querySelector(".rooms-page") ? "rooms" : main.querySelector(".house") ? "groups"
      : M.devicesView && M.devicesView() === "detailed" ? "devices-detailed" : "devices";   // (v2.4.0: the view open)
    if (tab === "panels") return M.panelsTopic ? M.panelsTopic() : "panels-status";   // (v2.5.0: Status, or the Setup tab open)
    if (tab === "cameras" && M.camerasTopic) return M.camerasTopic();   // (v2.6.0: Live or Setup)
    return TAB_TOPIC[tab] || "getting-started";
  }
  // the pages a topic's "Go to" button may open (Manage.go: it asks about the builder's unsaved changes itself)
  const GO_NAMES = { devices: K.t("help.shared.aboutdevices"), panels: K.t("help.shared.aboutpanels"), cameras: K.t("help.shared.aboutcameras"), guest: K.t("shell.page.guest"),
    backgrounds: K.t("shell.page.backgrounds"), icons: K.t("shell.page.icons"), cards: K.t("shell.page.cards"), settings: K.t("shell.page.integrations"),
    accounts: K.t("shell.page.accounts"), account: K.t("shell.page.account"), health: K.t("shell.page.health"), overview: K.t("shell.page.overview"), feedback: K.t("help.shared.title") };

  // ---------- the sidebar's Help item (shell.js draws it; it opens Help through Manage.help) ----------
  const btn = () => document.querySelector('.rail .rn[data-page="help"]') || { setAttribute() {}, classList: { add() {}, remove() {} }, focus() {} };

  // ---------- the Help page (built once, kept) ----------
  let shade = null, q = null, list = null, art = null, cur = null, ws = [], prevFocus = null, best = null;
  const narrow = () => window.matchMedia("(max-width: 760px)").matches;   // i18n-ok
  const coarse = () => window.matchMedia("(pointer: coarse)").matches;   // i18n-ok
  function build() {
    q = el("input.hp-q", { type: "search", placeholder: K.t("help.search.placeholder"), "aria-label": K.t("help.search.aria"),
      autocomplete: "off", spellcheck: "false", "aria-controls": "hp-list", oninput: () => { drawList(); if (cur) drawTopic(cur); if (q.value.trim()) shade.classList.remove("reading"); } });
    q.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); if (best) { show(best, true); if (narrow()) art.focus(); } }
      else if (e.key === "ArrowDown") { const f = list.querySelector("button.hp-it"); if (f) { e.preventDefault(); f.focus(); } }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (q.value) { q.value = ""; drawList(); if (cur) drawTopic(cur); } else close(); }
    });
    list = el("nav.hp-list", { id: "hp-list", "aria-label": K.t("help.topics") });
    list.addEventListener("keydown", (e) => {   // ↑ ↓ move through the topics, ↑ on the first goes back to the search
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const its = [...list.querySelectorAll("button.hp-it")], i = its.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      if (e.key === "ArrowUp" && i === 0) return q.focus();
      its[Math.max(0, Math.min(its.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))].focus();
    });
    art = el("article.hp-art", { tabindex: "-1", "aria-labelledby": "hp-topic" });
    const box = el("div.hp-box", { role: "dialog", "aria-modal": "true", "aria-labelledby": "hp-title" },
      el("div.hp-head", {}, el("h2", { id: "hp-title" }, el("span.hp-qm", { "aria-hidden": "true" }, "?"), K.t("shell.cmd.help")), q,
        el("button.ghost.hp-x", { type: "button", "aria-label": K.t("help.close"), title: K.t("help.closeEsc"), onclick: () => close() }, "✕")),
      el("div.hp-body", {}, list, art));
    shade = el("div.hp-shade", { hidden: true, onclick: (e) => { if (e.target === shade) close(); } }, box);
    // keys stay in Help: Esc closes, Tab goes round inside; nothing reaches the builder's own keys (Delete, Ctrl+Z…)
    shade.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Tab") {
        const f = [...box.querySelectorAll("a[href], button:not([disabled]), input, [tabindex='0']")].filter((x) => x.offsetParent !== null);
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
      e.stopPropagation();
    });
    for (const k of ["keyup", "keypress"]) shade.addEventListener(k, (e) => e.stopPropagation());
    document.body.append(shade);
  }

  function drawList() {
    const r = search(q.value);
    ws = r.ws; best = null;
    const item = (t, sub) => el("button.hp-it" + (cur === t.id ? ".cur" : ""), { type: "button", "aria-current": cur === t.id ? "true" : null,
      onclick: () => { show(t.id, true); if (narrow()) art.focus(); } }, el("b", {}, ...marked(t.title, ws)), sub ? el("small", {}, ...marked(sub, ws)) : null);
    if (ws.length) {
      best = r.hits.length ? r.hits[0].t.id : null;
      fill(list, 
        el("p.hp-count", { role: "status" }, r.hits.length ? K.t("help.search.count", { n: r.hits.length }) : K.t("help.search.nothing")),
        ...r.hits.map(({ t }) => item(t, snippet(t, ws))),
        r.near.length ? el("p.hp-sec", {}, K.t("help.search.near")) : null, ...r.near.map(({ t }) => item(t, snippet(t, ws))));
      return;
    }
    // no search: every topic, by section, and this page's own on top
    const here = pageTopic(), ht = byId.get(here);
    fill(list, ht ? el("p.hp-sec", {}, K.t("help.thisPage")) : null, ht ? item(ht) : null,
      ...H.sections.flatMap(([k, name]) => [el("p.hp-sec", {}, name), ...TOPICS.filter((t) => t.section === k).map((t) => item(t))]));
  }

  function drawTopic(id) {
    const t = byId.get(id) || TOPICS[0];
    const blocks = t.body.map((b) => {
      if (typeof b === "string") return el("p", {}, ...rich(b, ws));
      if (b.steps) return el("ol.hp-steps", {}, b.steps.map((s) => el("li", {}, ...rich(s, ws))));
      if (b.list) return el("ul", {}, b.list.map((s) => el("li", {}, ...rich(s, ws))));
      if (b.tip) return el("p.hp-tip", {}, ...rich(b.tip, ws));
      if (b.warn) return el("p.hp-warn", {}, ...rich(b.warn, ws));
      if (b.h) return el("h4", {}, ...marked(b.h, ws));
      if (b.coffee) return el("p.hp-coffee", {}, ...rich(b.coffee, ws), " ", M.coffeeLink ? M.coffeeLink("a.coffee") : null);   // (v2.9.3)
      return null;
    });
    const signedIn = !!(M.me && M.me()) && !document.body.classList.contains("at-login");
    // (only a page this login may open; Help's own history step becomes the page under it first — no Back that would
    // undo the page just opened)
    const mayOpen = !window.Shell || window.Shell.allowed(t.page === "settings" ? "integrations" : t.page);
    const goBtn = t.page && signedIn && mayOpen && GO_NAMES[t.page] && !(M.tab && M.tab() === t.page && !document.body.classList.contains("bld-open"))
      ? el("button.ghost.small", { type: "button", onclick: async () => { leaveQuietly(); await M.go(t.page); } }, K.t("help.goTo", { page: GO_NAMES[t.page] })) : null;
    const see = (t.see || []).filter((x) => byId.has(x));
    fill(art, 
      el("button.ghost.small.hp-back", { type: "button", onclick: () => { shade.classList.remove("reading"); const b = list.querySelector(".hp-it.cur") || list.querySelector(".hp-it"); if (b) b.focus(); } }, K.t("help.allTopics")),
      el("p.hp-crumb", {}, SECTION.get(t.section) || ""),
      el("h3", { id: "hp-topic" }, ...marked(t.title, ws)),
      t.where ? el("p.hp-where", {}, K.t("help.where") + " ", el("b", {}, t.where)) : null,
      ...blocks,
      see.length || goBtn ? el("div.hp-see", {}, goBtn, see.length ? el("span", {}, K.t("help.seeAlso") + " ") : null,
        ...see.flatMap((x, i) => [i ? " · " : "", el("a.hp-link", { href: `#help/${x}`, onclick: (e) => { e.preventDefault(); show(x, true); } }, byId.get(x).title)])) : null);
    art.scrollTop = 0;
  }

  // show a topic (and remember it in the address: #help/<id>, without a new history step)
  function show(id, fromUser) {
    if (!byId.has(id)) id = "getting-started";
    cur = id;
    // (both are drawn again: a topic picked in the list keeps the focus there, a link in the topic moves it to the topic —
    // never to the page behind, where Esc and Tab wouldn't reach Help)
    const inList = !!(list && list.contains(document.activeElement)), inArt = !!(art && art.contains(document.activeElement));
    drawTopic(id); drawList();
    if (inList) (list.querySelector("button.hp-it.cur") || art).focus();
    else if (inArt) art.focus();
    shade.classList.add("reading");
    const want = `#help/${id}`;
    if (fromUser && location.hash !== want) history.replaceState(history.state, "", want);
  }

  // ---------- open / close (#help, #help/<topic>) ----------
  let pushed = false;   // we added the #help history step (Back then closes Help)
  function open(id, viaHash) {
    if (!shade) build();
    const was = !shade.hidden;
    if (!was) prevFocus = document.activeElement;
    shade.hidden = false; document.body.classList.add("hp-open");
    btn().setAttribute("aria-expanded", "true"); btn().classList.add("cur");
    if (!viaHash && !was) { history.pushState({ help: true }, "", `#help/${id}`); pushed = true; }
    show(id, !viaHash);
    if (!was) { if (!coarse()) { q.focus(); q.select(); } else art.focus(); }
  }
  function hide() {
    if (!shade || shade.hidden) return;
    shade.hidden = true; document.body.classList.remove("hp-open"); pushed = false;
    btn().setAttribute("aria-expanded", "false"); btn().classList.remove("cur");
    if (prevFocus && prevFocus.isConnected && prevFocus.focus) prevFocus.focus(); else btn().focus();
  }
  // closed for another page (a topic's "Go to"): Help's address becomes the page under it, no history step to go Back
  function leaveQuietly() {
    const r = window.Shell && window.Shell.route();
    if (/^#help/.test(location.hash)) history.replaceState(null, "", r && r.page ? `#${[r.page, ...r.rest].join("/")}` : location.pathname + location.search);
    pushed = false;
    hide();
  }
  // closed: back to the page's own address (Back, when Help added a step: the router then hides it)
  function close() {
    if (pushed && history.state && history.state.help) { pushed = false; history.back(); return; }
    pushed = false;
    const r = window.Shell && window.Shell.route();
    history.replaceState(history.state, "", r && r.page ? `#${[r.page, ...r.rest].join("/")}` : location.pathname + location.search);
    hide();
  }
  // F1 opens Help (not while it's open, and not while the unsaved-changes question is up)
  document.addEventListener("keydown", (e) => {
    if (e.key === "F1" && !e.ctrlKey && !e.altKey && (!shade || shade.hidden) && !document.querySelector(".modal-bg.top")) { e.preventDefault(); open(pageTopic()); }
  });
  // the router's (shell.js): an address #help / #help/<topic> — and a deep link before signing in (#help/add-panel)
  M.helpRoute = (id) => open(id && byId.has(id) ? id : pageTopic(), true);
  M.helpHide = hide;
  const m = /^#help(?:\/([\w-]+))?$/.exec(location.hash);
  if (m) M.helpRoute(m[1]);

  // ---------- a small "?" next to each page's title: that page's topic ----------
  function addQ() {
    const main = M.$main;
    if (!main || document.body.classList.contains("at-login") || document.body.classList.contains("bld-open")) return;
    if (main.querySelector(".hp-page-q")) return;
    const tab = M.tab ? M.tab() : "";
    const spot = document.documentElement.classList.contains("phone") && main.querySelector(".ph h1") ? main.querySelector(".ph h1")   // (v2.8.0: a phone's screens: the title)
      : tab === "devices" && !main.querySelector(".house") ? main.querySelector(".dv-page .ph h1")
      : main.querySelector(".peditor > h2, h2.spage, .hl-page > h2, .card > h2, h2");
    if (!spot) return;
    const id = pageTopic();
    // (v2.8.0: on a phone beside the title, not inside it — the heading's name stays the page's own)
    spot[document.documentElement.classList.contains("phone") && spot.tagName === "H1" ? "after" : "append"](el("button.hp-page-q", { type: "button", "aria-label": K.t("help.pageQ", { topic: (byId.get(id) || {}).title || K.t("help.thisPageLower") }),
      title: K.t("help.pageQ", { topic: (byId.get(id) || {}).title || K.t("help.thisPageLower") }), onclick: (e) => { e.stopPropagation(); open(pageTopic()); } }, "?"));
  }
  // (only the page's own top level is watched: a new page is a new set of children; the builder's canvas isn't)
  if (M.$main) new MutationObserver(addQ).observe(M.$main, { childList: true });

  M.help = (id) => open(id && byId.has(id) ? id : pageTopic());
})();
