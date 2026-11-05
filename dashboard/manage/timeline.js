// Skypane Manager — Health → Timeline (v2.7.0): what happened, when — the health monitor's problems (and when they were
// fixed) merged with the activity log (sign-ins, accounts, settings, panels, alerts acknowledged, the libraries; never a
// secret: service/activity_log.py). Grouped by day, newest first; chips filter by area, a search box, a range (today …
// as long as the log keeps: 30 / 90 / 365 days, the admins' Keep — v2.9.2), "Show older"; an admin exports it as CSV. An admin sees everything; any other login its own sign-ins and
// changes and the health of its panels (the server filters). The sentences are made here, from each event's kind and
// fields — one table to translate later. Read again every 30 s while open (Manage.poll: only what's new).
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api } = M, ic = K.icon;
  const CHIPS = [["all", K.t("timeline.chip.all")], ["problems", K.t("timeline.chip.problems")], ["signins", K.t("timeline.chip.signins")], ["accounts", K.t("timeline.chip.accounts")],
    ["panels", K.t("timeline.shared.aboutpanels")], ["cameras", K.t("timeline.shared.aboutcameras")], ["alerts", K.t("timeline.chip.alerts")], ["settings", K.t("timeline.chip.settings")]];
  const RANGES = [[1, K.t("timeline.rangeToday")], [2, K.t("timeline.keepDays", { n: 2 })], [7, K.t("timeline.keepDays", { n: 7 })], [30, K.t("timeline.keepDays", { n: 30 })],
    [90, K.t("timeline.keepDays", { n: 90 })], [365, K.t("timeline.rangeYear")]];
  let KEEP = { days: 90, choices: [30, 90, 365] };   // (v2.9.2: how long the log keeps events — the admin's setting)
  const AREA = { signin: "signins", account: "accounts", settings: "settings", panel: "panels", library: "library", device: "devices", camera: "cameras", weather: "alerts" };
  const AREA_WORDS = { signins: K.t("timeline.area.signin"), accounts: K.t("timeline.chip.accounts"), settings: K.t("timeline.chip.settings"), panels: K.t("timeline.shared.aboutpanels"),
    alerts: K.t("timeline.chip.alerts"), library: K.t("timeline.area.library"), devices: K.t("timeline.shared.aboutdevices"), cameras: K.t("timeline.shared.aboutcameras"), problems: K.t("health.title") };
  const ICON = { signins: "user", accounts: "users", settings: "link", panels: "tablet", alerts: "bell", library: "image", devices: "devices", cameras: "camera", problems: "activity" };
  const PERM = {};   // permission id → its words (from the sign-in answer)
  const st = { chip: "all", days: 2, q: "", who: null };
  let EV = [], HL = [], more = false, oldest = null, newest = 0, poll = null;

  const areaOf = (e) => (e.kind === "panel.ack" ? "alerts" : AREA[e.kind.split(".")[0]] || "settings");
  const LEVEL = { "signin.locked": "bad", "signin.wrong": "warn", "signin.unknown": "warn", "signin.code-wrong": "warn", "device.refused": "warn" };
  const name = (x) => x || K.t("timeline.someone");
  const choice = (v) => (v === true ? K.t("timeline.shared.yes") : v === false ? K.t("timeline.shared.no") : v === "" ? K.t("timeline.choice.none") : v == null ? "—" : String(v));
  // (v2.8.0: a device by its name — from the house's device list; never a bare "#5010": "a device" when it isn't known)
  const devName = (e) => {
    const t = e.target == null ? "" : String(e.target), id = (e.data || {}).device != null ? String(e.data.device) : (/^#?(\d+)$/.exec(t) || [])[1];
    const D = M.devices && M.devices(), c = D && Array.isArray(D.devices) && id != null ? D.devices.find((x) => String(x.id) === id) : null;
    return c && c.label ? c.label : t && !/^#?\d+$/.test(t) ? t : null;
  };
  // kind → [the sentence, the detail in grey]
  // (v3.0.0) a setting's label where the table has one ("dockAt" → "Room bar", "TZ" → "Time zone"), else its id; one
  // line names each label once (quietFrom + quietTo = "Quiet hours")
  const keyWord = (k) => { const s = String(k), parts = /^[A-Z0-9_]+$/.test(s) ? s.toLowerCase().split("_") : s.split(".");
    const id = parts.map((p, n) => (n ? p.charAt(0).toUpperCase() + p.slice(1) : p.charAt(0).toLowerCase() + p.slice(1))).join("").replace(/\d/g, "");   // (keys: letters only — "quietLevel4" → "quietLevel")
    return /^[a-zA-Z]+$/.test(id) ? K.tOr(`timeline.key.${id}`, s) : s; };
  const keyWords = (keys, max) => [...new Set((keys || []).slice(0, max || 40).map(keyWord))].join(", ");
  M.keyWords = keyWords;   // (v3.0.3: Integrations → Recent names the settings the same way — never "UNIFI_API_KEY")
  const SAY = {
    "signin.ok": (e) => [K.t("timeline.say.signinOk", { who: name(e.who) }), ""],
    "signin.wrong": (e) => [e.data && e.data.what === "confirm" ? K.t("timeline.say.signinWrongConfirm", { name: e.target }) : K.t("timeline.say.signinWrong", { name: e.target }), ""],
    "signin.unknown": () => [K.t("timeline.say.signinUnknown"), K.t("timeline.say.signinUnknownDetail")],
    "signin.locked": (e) => [K.t("timeline.say.signinLocked", { name: e.target }), K.t("timeline.say.signinLockedDetail")],
    "signin.out": (e) => [K.t("timeline.say.signinOut", { who: name(e.who) }), ""],
    "signin.out-others": (e) => [K.t("timeline.say.signinOutOthers", { who: name(e.who) }), ""],
    "signin.code-used": (e) => [K.t("timeline.say.signinCodeUsed", { who: name(e.who) }), ""],
    "signin.code-wrong": (e) => [e.target ? K.t("timeline.say.signinCodeWrongFor", { name: e.target }) : K.t("timeline.say.signinCodeWrong"), ""],
    "account.add": (e) => [K.t("timeline.say.accountAdd", { who: name(e.who), name: e.target }), ""],
    "account.remove": (e) => [K.t("timeline.say.accountRemove", { who: name(e.who), name: e.target }), ""],
    "account.rename": (e) => [K.t("timeline.say.accountRename", { who: name(e.who), old: (e.data || {}).old, new: (e.data || {}).new }), ""],
    "account.perms": (e) => [K.t("timeline.say.accountPerms", { who: name(e.who), name: e.target, perm: PERM[(e.data || {}).perm] || (e.data || {}).perm }),
      `${choice((e.data || {}).old)} → ${choice((e.data || {}).new)}`],
    "account.admin": (e) => [K.t("timeline.say.accountAdmin", { who: name(e.who), name: e.target }), ""],
    "account.user": (e) => [K.t("timeline.say.accountUser", { who: name(e.who), name: e.target }), ""],
    "account.owner": (e) => [K.t("timeline.say.accountOwner", { who: name(e.who), name: e.target }), ""],
    "account.password": (e) => [K.t("timeline.say.accountPassword", { who: name(e.who) }), ""],
    "account.password-set": (e) => [K.t("timeline.say.accountPasswordSet", { who: name(e.who), name: e.target }), ""],
    "account.code": (e) => [K.t("timeline.say.accountCode", { who: name(e.who), name: e.target }), K.t("timeline.say.accountCodeDetail")],
    "account.unlock": (e) => [K.t("timeline.say.accountUnlock", { who: name(e.who), name: e.target }), ""],
    "account.reset-command": (e) => [K.t("timeline.say.accountResetCommand", { name: e.target }), ""],
    "account.code-dead": (e) => [K.t("timeline.say.accountCodeDead", { name: e.target }),
      (e.data || {}).what === "too old" ? K.t("timeline.say.accountCodeTooOld") : K.t("timeline.say.accountCodeTooManyTries")],   // i18n-ok (a server value / a URL)
    "settings.change": (e) => ((e.data || {}).what === "export" ? [K.t("timeline.say.settingsExport", { who: name(e.who) }), K.t("timeline.events", { n: (e.data || {}).count || 0 })]
      : (e.data || {}).what === "activity-retention" ? [K.t("timeline.keepChanged", { who: name(e.who), old: (e.data || {}).old, new: (e.data || {}).new }),
        (e.data || {}).removed ? K.t("timeline.keepRemoved", { n: (e.data || {}).removed }) : ""]
      : [K.t("timeline.say.settingsChange", { who: name(e.who) }), keyWords((e.data || {}).keys)]),
    "settings.guest": (e) => [K.t("timeline.say.settingsGuest", { who: name(e.who) }), keyWords((e.data || {}).keys)],
    "settings.guest-now": (e) => [K.t("timeline.say.settingsGuestNow", { who: name(e.who) }), ""],
    "settings.guest-mode": (e) => [K.t("timeline.say.settingsGuestMode", { who: name(e.who) }), ""],
    "settings.lockdown": (e) => [K.t("timeline.say.settingsLockdown", { who: name(e.who) }), (e.data || {}).on
      ? ((e.data || {}).mode === "dark" ? K.t("timeline.say.lockdownDark", { n: (e.data || {}).count || 0 }) : K.t("timeline.say.lockdownPin", { n: (e.data || {}).count || 0 }))
      : K.t("control.off")],
    "settings.check": (e) => [K.t("timeline.say.settingsCheck", { who: name(e.who) }), ""],
    "panel.add": (e) => [K.t("timeline.say.panelAdd", { who: name(e.who), panel: e.target }), ""],
    "panel.remove": (e) => [K.t("timeline.say.panelRemove", { who: name(e.who), panel: e.target }), ""],
    "panel.setup": (e) => [K.t("timeline.say.panelSetup", { who: name(e.who), panel: e.target }), keyWords((e.data || {}).keys, 6)],
    "panel.layout": (e) => [K.t("timeline.say.panelLayout", { who: name(e.who), panel: e.target }), ""],
    "panel.pin": (e) => [K.t("timeline.say.panelPin", { who: name(e.who) }), ""],
    "panel.pin-locked": (e) => [K.t("timeline.say.panelPinLocked", { panel: e.target }), ""],
    "panel.live": (e) => [K.t("timeline.say.panelLive", { who: name(e.who), panel: e.target }),
      (e.data || {}).mode === "control" ? K.t("timeline.say.panelLiveControl") : K.t("timeline.say.panelLiveView")],
    "panel.ack": (e) => [K.t("timeline.say.panelAck", { who: name(e.who), n: (e.data || {}).count }), ""],
    // (v3.0.0) a weather device's warnings (the event name and level, never its text) and its setting
    "weather.alert": (e) => [K.t("timeline.say.weatherAlert", { title: (e.data || {}).title || "", level: (e.data || {}).level || "" }), ""],
    "weather.clear": (e) => [K.t("timeline.say.weatherClear", { title: (e.data || {}).title || "" }), ""],
    "settings.weather": (e) => [K.t("timeline.say.settingsWeather", { who: name(e.who) }), ((e.data || {}).keys || []).join(", ")],
    // (v3.0.2) the house's calendar event icons — saved or reset, how many
    "settings.event-icons": (e) => [K.t((e.data || {}).what === "reset" ? "timeline.say.eventIconsReset" : "timeline.say.eventIcons", { who: name(e.who) }),
      K.t("timeline.say.eventIconsCount", { n: (e.data || {}).count || 0 })],
    "library.upload": (e) => [K.t("timeline.say.libraryUpload", { who: name(e.who), name: e.target }), ""],
    "library.remove": (e) => [K.t("timeline.say.libraryRemove", { who: name(e.who) }), ""],
    "library.card": (e) => [K.t("timeline.say.libraryCard", { who: name(e.who), name: e.target }), ""],
    "library.card-remove": (e) => [K.t("timeline.say.libraryCardRemove", { who: name(e.who) }), (e.data || {}).id || ""],
    // (v2.9.1) the Manager switched a device — the device's name, the command, the bridge's answer; never the PIN
    "device.command": (e) => { const d = e.data || {}, who = name(e.who), device = devName(e) || K.t("timeline.aDevice");
      return d.result === "wrong-pin" ? [K.t("timeline.wrongPin", { who, device }), ""]
        : d.result === "ok" ? [K.t("timeline.deviceCommand", { who, command: `${d.command}${d.value != null ? ` ${d.value}` : ""}`, device }), ""]
          : [K.t("timeline.deviceCommandFailed", { who, command: d.command, device }), String(d.result || "")]; },
    "feedback.send": (e) => [(e.data || {}).id ? K.t("timeline.feedbackN", { who: name(e.who), n: e.data.id }) : K.t("timeline.feedback", { who: name(e.who) }),
      (e.data || {}).result === "ok" ? "" : String((e.data || {}).result || "")],   // (v3.0.0 — never the words)
    "device.refused": (e) => SAY["device.command"](e),   // (v2.9.1: a refused command — its own shelf, folded per minute)
    // (v2.9.3) the house's mode and the alarm from the Manager — never the PIN
    "house.mode": (e) => { const d = e.data || {}; return d.result === "ok" ? [K.t("timeline.houseMode", { who: name(e.who), value: d.value }), ""]
      : [K.t("timeline.houseFailed", { who: name(e.who), what: e.target || "" }), String(d.result || "")]; },
    "house.hsm": (e) => { const d = e.data || {}; return d.result === "ok" ? [K.t("timeline.houseHsm", { who: name(e.who), value: d.value }), ""]
      : [K.t("timeline.houseFailed", { who: name(e.who), what: e.target || "" }), String(d.result || "")]; },
    "device.change": (e) => [(e.data || {}).count ? K.t("timeline.say.deviceChangeMany", { who: name(e.who), n: (e.data || {}).count })
      : devName(e) ? K.t("timeline.say.deviceChangeOne", { who: name(e.who), device: devName(e) }) : K.t("timeline.say.deviceChange", { who: name(e.who) }),
      ((e.data || {}).keys || []).join(", ")],
    "camera.change": (e) => [K.t("timeline.say.cameraChange", { who: name(e.who) }), [(e.data || {}).what, (e.data || {}).name].filter(Boolean).join(" · ")],
  };

  // ---------- reading ----------
  const since = () => (st.days === 1 ? new Date().setHours(0, 0, 0, 0) / 1000 : Date.now() / 1000 - st.days * 86400);
  function query(extra) {
    const p = new URLSearchParams();
    if (st.chip !== "all" && st.chip !== "problems") p.set("kinds", st.chip);
    if (st.q.trim()) p.set("q", st.q.trim());
    if (st.who) p.set("who", st.who);
    for (const [k, v] of Object.entries(extra || {})) if (v != null) p.set(k, String(v));
    return `/api/manage/activity?${p}`;   // i18n-ok (a server value / a URL)
  }
  async function load() {
    const [a, h, me, keep] = await Promise.all([api(query({ since: since().toFixed(3), limit: 200 })), api("/api/manage/health?log=500").catch(() => ({})), api("/api/manage/login").catch(() => ({})),
      api("/api/manage/activity/retention").catch(() => ({}))]);
    if (keep && typeof keep.days === "number") KEEP = { days: keep.days, choices: Array.isArray(keep.choices) ? keep.choices : KEEP.choices };
    for (const x of me.permissions || []) PERM[x.id] = x.text;
    EV = Array.isArray(a.events) ? a.events : [];
    more = !!a.more;
    oldest = EV.length ? EV[EV.length - 1].at : null;
    newest = EV.length ? EV[0].at : since();
    HL = Array.isArray(h.log) ? h.log : [];
  }
  async function older() {
    const a = await api(query({ before: oldest, since: since().toFixed(3), limit: 200 })).catch(() => ({}));
    const add = Array.isArray(a.events) ? a.events : [];
    EV = EV.concat(add); more = !!a.more;
    if (add.length) oldest = add[add.length - 1].at;
    draw();
  }
  async function refresh() {
    if (S.route().page !== "health" || !M.$main.querySelector(".tl-page") || document.visibilityState !== "visible") return;
    try {
      const r = await M.poll(query({ since: newest.toFixed(3), limit: 200 }));
      if (!r || !r.ok) return;
      const j = await r.json();
      if (Array.isArray(j.events) && j.events.length) { EV = j.events.concat(EV); newest = j.events[0].at; draw(); }
    } catch { /* (next time) */ }
  }

  // ---------- the rows ----------
  function rows() {
    const from = since(), words = st.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    if (st.chip === "all" || st.chip === "problems") {
      for (const h of HL) {
        if (h.at < from) continue;
        const text = `${h.title} ${h.details || ""}`.toLowerCase();
        if (words.length && !words.every((w) => text.includes(w))) continue;
        if (st.who) continue;   // (a login's own: the activity only)
        out.push({ at: h.at, area: "problems", lvl: h.what === "resolved" ? "ok" : (h.lvl || 3) >= 4 ? "bad" : "warn", say: h.what === "resolved" ? K.t("timeline.fixed", { title: h.title }) : h.title, det: h.details || "", src: K.t("health.title") });
      }
    }
    for (const e of EV) {
      const area = areaOf(e), lvl = LEVEL[e.kind] || "ok";
      if (st.chip === "problems" && lvl === "ok") continue;
      if (st.chip !== "all" && st.chip !== "problems" && area !== st.chip) continue;
      const [say, det0] = (SAY[e.kind] || (() => [K.t("timeline.say.other"), ""]))(e);
      const n = (e.data || {}).count, det = LEVEL[e.kind] && n ? K.t("timeline.moreLikeThis", { n }) : det0;
      out.push({ at: e.at, area, lvl, say, det: [det, e.agent, e.from].filter(Boolean).join(" · "), src: e.who || e.target || K.t("timeline.someone") });
    }
    return out.sort((a, b) => b.at - a.at);
  }
  const dayWords = (t) => { const d = new Date(t * 1000), now = new Date(), y = new Date(Date.now() - 86400000);
    const long = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
    return d.toDateString() === now.toDateString() ? K.t("timeline.dayToday", { date: long }) : d.toDateString() === y.toDateString() ? K.t("timeline.dayYesterday", { date: long }) : long; };
  const LVL_WORD = { bad: K.t("timeline.level.bad"), warn: K.t("timeline.level.warn"), ok: K.t("timeline.level.ok") };

  function draw() {
    if (S.route().page !== "health") return;
    const list = rows();
    const chips = el("div.seg.tl-chips", { role: "group", "aria-label": K.t("timeline.chipsLabel") }, CHIPS.map(([k, n]) =>
      el("button" + (st.chip === k ? ".on" : ""), { type: "button", "aria-pressed": String(st.chip === k), onclick: () => { st.chip = k; render(); } }, n)));
    const q = el("input.md-q", { type: "search", placeholder: K.t("timeline.findPlaceholder"), value: st.q, "aria-label": K.t("timeline.find"), "data-fk": "tl-q" });
    let qt = null;
    q.addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { st.q = q.value; render(); }, 350); });
    const range = el("select.tl-range", { "aria-label": K.t("timeline.range"), onchange: (e) => { st.days = +e.target.value; render(); } },
      RANGES.filter(([d]) => d <= KEEP.days).map(([d, n]) => el("option", { value: String(d), selected: st.days === d }, n)));
    // (v2.9.2) the admins: how long the log keeps events — a shorter time deletes the older ones now, asked first
    const keep = M.isAdmin() ? el("label.tl-keep", { "data-tip": K.t("timeline.keepHint") }, el("span", {}, K.t("timeline.keep")),
      el("select.tl-range", { "aria-label": K.t("timeline.keepHint"), onchange: (e) => setKeep(+e.target.value, e.target) },
        KEEP.choices.map((d) => el("option", { value: String(d), selected: KEEP.days === d }, K.t("timeline.keepDays", { n: d }))))) : null;
    const exp = M.isAdmin() && !S.isPhone() ? (list.length ? el("a.btn.sm.tl-exp", { href: `/api/manage/activity.csv?since=${since().toFixed(0)}`, download: "skypane-activity.csv" }, ic("download", 14), K.t("timeline.export"))   // i18n-ok (a server value / a URL)
      : el("button.btn.sm", { type: "button", disabled: true, "data-tip": K.t("timeline.exportNothing") }, ic("download", 14), K.t("timeline.export"))) : null;
    const tools = el("div.tl-tools", {}, chips, el("label.md-qbox", {}, ic("search", 15), q), range,
      st.who ? el("button.md-chip.tl-who", { type: "button", onclick: () => { st.who = null; render(); } }, K.t("timeline.onlyWho", { who: st.who }), " ", ic("x", 12)) : null,
      el("span.sp"), el("small.muted.tl-n", {}, K.t("timeline.events", { n: list.length })), keep, exp);
    let body;
    if (!list.length) body = K.empty("activity", K.t("timeline.empty"), st.q || st.who || st.chip !== "all" ? K.t("timeline.emptyFiltered") : K.t("timeline.emptyRange"));
    else {
      const kids = [];
      let day = "";
      for (const r of list) {
        const d = dayWords(r.at);
        if (d !== day) { day = d; kids.push(el("div.tl-day", {}, d)); }
        kids.push(el("div.tl-row", {}, el("span.tl-t", {}, new Date(r.at * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })),
          r.lvl === "bad" || r.lvl === "warn" ? el("span.pill.tl-l" + (r.lvl === "bad" ? ".bad" : ".warn"), {}, LVL_WORD[r.lvl]) : el("span.tl-l"),
          el("span.tl-src", {}, ic(ICON[r.area] || "activity", 14), r.src),
          el("span.tl-m", {}, el("b", {}, r.say), r.det ? el("small", {}, r.det) : null),
          el("span.tl-a", {}, AREA_WORDS[r.area] || "")));
      }
      body = el("div.tl-list", {}, ...kids, more ? el("div.tl-more", {}, el("button.btn", { type: "button", onclick: older }, K.t("timeline.showOlder"))) : null);
    }
    const head = M.healthHead ? M.healthHead() : el("div.ph", {}, el("h1", {}, K.t("health.title")));
    M.swap(M.$main, el("div.tl-page", {}, head, tools, body));
  }
  async function setKeep(days, sel) {
    const was = KEEP.days;
    if (days === was) return;
    if (days < was && !(await K.ask({ title: K.t("timeline.keepAsk", { n: days }), text: K.t("timeline.keepAskText", { n: days }), yes: K.t("timeline.keepAskYes"), danger: true }))) {
      sel.value = String(was); return;
    }
    let r = await api("/api/manage/activity/retention", { days }).catch(() => null);
    // (gate 1: deleting history needs "confirm it's you" — the password once, then 10 minutes on this browser)
    if (r && r.error === "need-confirm") r = M.confirmIt && (await M.confirmIt()) ? await api("/api/manage/activity/retention", { days }).catch(() => null) : { error: K.t("timeline.keepNotConfirmed") };
    if (!r || !r.ok) { sel.value = String(was); M.toast((r && r.error) || K.t("timeline.keepFailed"), true); return; }
    KEEP = { ...KEEP, days: r.days };
    M.toast(r.removed ? K.t("timeline.keepDeleted", { n: r.removed, days: r.days }) : K.t("timeline.keepSaved", { n: r.days }));
    render();
  }
  async function render() {
    if (M.timelineWho) { st.who = M.timelineWho; M.timelineWho = null; st.chip = "all"; }
    if (!M.$main.querySelector(".tl-page")) M.$main.replaceChildren(el("p.muted", {}, K.t("common.loading")));
    try { await load(); if (st.days > KEEP.days) { st.days = KEEP.days; await load(); } } catch (e) { if (e.message !== "login") M.$main.replaceChildren(K.empty("activity", K.t("timeline.loadFailed"), K.t("integrations.tryAgain"))); return; }
    draw();
    clearInterval(poll);
    poll = setInterval(refresh, 30000);
  }
  M.onReset(() => { EV = []; HL = []; clearInterval(poll); st.who = null; });
  M.renderTimeline = render;
  // (v2.8.0: the phone's Overview says the same sentences for its last few events)
  M.activitySay = (e) => (SAY[e.kind] || (() => [K.t("timeline.say.other"), ""]))(e)[0];
})();
