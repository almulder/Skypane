// Alerts from Hubitat rules (release 2: the "Skypane Notifier" driver, hubitat/SkypaneNotifier.groovy). The
// bridge publishes the active ones, checked field by field (retained hubitat/alerts), the hub's mode (hubitat/mode)
// and camera pop-ups (hubitat/show). Every text is escaped here — it comes from rules, never HTML.
// These are the ONLY alerts a panel shows: every rule — a leak, smoke, a warm freezer, an
// intrusion — is made in Hubitat; the panel shows, sounds and acknowledges. Which panels get one: the rule's "to".
//
// Levels (every piston and Switchboard rule means the same by a level):
//   5 Life safety   gas, smoke, heat, CO, intrusion: full screen, alarm beeps (also in quiet hours), spoken
//   4 Damage        a water leak: the same as 5
//   3 Action needed a trap that went off, a package, doors open at bedtime: a note on screen until dismissed + a gentle sound
//   2 Finished      washer / dryer / dishwasher done: a note, silent, gone after its time (the driver's default 60 s)
//   1 Reminder      calendar events: a note with a short tone, gone after its time (60 s)
// How long one stays is the driver's (its "exp"); levels 3–5 never time out unless the rule says so.
//
// ONE alert on screen at a time (the "front" one): the highest level wins, the newest within a level. A lower one
// that arrives while a higher one is up goes straight into the notification list — no sound, no interruption. When
// the front one is dismissed or cleared, nothing else pops up: the rest wait in the list (Home's "Notifications"
// button, and a custom layout's Notifications card), where they can be read and dismissed. (A page loaded fresh
// starts with the top one in front.)
//
// Dismissals: levels 3–5 clear on EVERY panel (4–5 ask for the panel PIN), levels 1–2 on this panel only (kept in this
// browser). EVERY dismissal is told to Hubitat: hubitat/alerts/ack {"id", "panel", "level"} (a level 4–5 also with its
// one-time PIN "ticket", v2.3.2), or {"all": true, "panel"} for "Dismiss all" — the bridge checks it and calls the
// notifier's panelAck / panelAckAll (button 1–5 / 6 pushed); it answers a refused 4–5 on hubitat/alerts/ack/result.
// Quiet hours: the Hubitat modes chosen for this panel, or else a time — the mode wins; quiet = no sound below level 4
// (and none for a level 4 either when the admin switched "Level 4 sounds in quiet hours" off; a level 5 always sounds).
// "Silence without the PIN" (the admin's, off by default): the full-screen card gets a Silence button — the sound
// stops on this panel, the alert stays up everywhere until dismissed with the PIN, the sound comes back after
// SILENCE_MS if it's still up — or at once when it happens again (count +1) —, and Hubitat hears it ({"id", "panel",
// "level", "silenced": true} → panelSilence).
// (v3.0.4) The panel's own reminders (HA.own: the Bins / Trash card, trash.js) join the list the same way, at their
// level (a Reminder): never sent to Hubitat; their button is the card's ("Taken out"), and they go when it's pressed.
(function () {
  const H = Home, esc = (s) => UI.esc(s);
  const GONE = "panel.hubalerts.gone";
  const HA = { list: [], mode: null, seen: new Set(), acked: new Set(), front: null };
  // (each level's name in the panel's language when it's read: strings/en.js "alert.lvl.N")
  HA.NAMES = new Proxy({}, { get: (o, k) => (/^[1-5]$/.test(String(k)) ? T(`alert.lvl.${String(k)}`) : undefined) });
  const loadGone = () => { try { const v = JSON.parse(localStorage.getItem(GONE) || "[]"); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(-200) : []); } catch { return new Set(); } };
  const gone = loadGone();
  const saveGone = () => { try { localStorage.setItem(GONE, JSON.stringify([...gone].slice(-200))); } catch {} };
  const me = () => [((window.PanelStore && PanelStore.id) || "main").toLowerCase(), H.kiosk()];
  const S = () => (window.Settings && Settings.v) || {};

  // ---------- which alerts this panel shows ----------
  const forMe = (a) => a.to.includes("all") || me().some((n) => a.to.includes(n));
  // (Manager → Panels → Alerts: the lowest level shown here; a level 5 always)
  const allowed = (a) => a.lvl === 5 || a.lvl >= (+S().alertMinLevel || 1);
  const live = (a) => !a.exp || a.exp * 1000 > Date.now();
  const order = (x, y) => y.lvl - x.lvl || y.at - x.at;   // highest level first, the newest first within a level
  // every alert up on this panel (the notification list), in that order
  HA.shown = () => HA.list.filter((a) => forMe(a) && allowed(a) && live(a) && !gone.has(a.id) && !HA.acked.has(a.id)).sort(order);
  // the one on screen (null = none — after a level 1–3 was dismissed, until a new one arrives; after a 4–5: HA.next)
  HA.top = () => (HA.front && HA.shown().find((a) => a.id === HA.front)) || null;
  // the full-screen one: the front alert when it's a level 4–5 (alarm.js draws it; [] = none)
  HA.big = () => { const a = HA.top(); return a && a.lvl >= 4 ? [a] : []; };
  // the ones in the list but not on screen
  HA.waiting = () => HA.shown().filter((a) => a.id !== HA.front);
  HA.quiet = () => {
    const s = S(), modes = Array.isArray(s.quietModes) ? s.quietModes : [];
    if (modes.length && HA.mode) return modes.some((m) => m.toLowerCase() === HA.mode.toLowerCase());   // (the mode wins)
    const f = s.quietFrom, t = s.quietTo, h = new Date().getHours();
    if (!(f >= 0 && f <= 23 && t >= 0 && t <= 23) || f === t) return false;
    return f > t ? h >= f || h < t : h >= f && h < t;
  };
  // a level 4 in quiet hours: sounds unless the admin turned that off for this panel (Manager → Panels → Alerts)
  const hushed = (a) => a.lvl === 4 && S().quietLevel4 === false && HA.quiet();
  // "Silence" pressed (alert id → until when, this panel only)
  const SILENCE_MS = 5 * 60000, silenced = new Map();
  HA.silenced = (a) => !!a && (silenced.get(a.id) || 0) > Date.now();
  HA.canSilence = () => S().alertSilence === true && HA.big().length > 0 && !HA.silenced(HA.big()[0]);
  HA.silence = () => {
    const a = HA.big()[0]; if (!a || S().alertSilence !== true) return;
    silenced.set(a.id, Date.now() + SILENCE_MS); refused.delete(a.id);
    if (!a.test) H.publish(ACK, { id: a.id, panel: me()[0], level: a.lvl, silenced: true });   // (Hubitat hears it; not a dismissal)
    after();
  };
  // the alarm beeps: while a level 4–5 is on screen — in quiet hours too (life safety and damage),
  // not while silenced here, nor a level 4 in quiet hours when the admin said so
  HA.loud = () => { const a = HA.big()[0]; return !!a && !HA.silenced(a) && !hushed(a); };

  // ---------- drawing ----------
  const when = (a) => T.time(new Date(a.at * 1000));
  // under the full-screen card, what waits: a level 4–5 waiting is said first — it comes up next — then the
  // rest in the list. "1 more life-safety alert waiting." (all level 5) / "2 more urgent alerts waiting." (a level 4 among
  // them), then "3 others in Notifications."; only level 1–3 waiting: "3 more in Notifications"
  const more = () => {
    const w = HA.waiting(), big = w.filter((a) => a.lvl >= 4), rest = w.length - big.length;
    if (!big.length) return rest ? T("alert.moreInList", { n: rest }) : "";
    const first = T(big.every((a) => a.lvl === 5) ? "alert.moreLifeSafety" : "alert.moreUrgent", { n: big.length });
    return rest ? `${first} ${T("alert.othersInList", { n: rest })}` : first;
  };
  HA.more = more;
  // a weather warning: its own icon, and "+N more" when the device has more up than it sends one by one
  const isWx = (a) => a && (a.kind === "weather" || a.tag === "weather");
  HA.isWeather = isWx;
  HA.icon = (a, size) => icon(isWx(a) ? "storm" : a.lvl === 5 ? "siren" : a.lvl >= 4 ? "warning" : "bell", size);
  const moreTag = (a) => (a.more > 0 ? ` <small class="hub-more">${esc(T(isWx(a) ? "alert.moreWeather" : "alert.moreWarnings", { n: a.more }))}</small>` : "");
  const lvlLine = (a) => esc(a.place ? T("alert.atPlace", { level: HA.NAMES[a.lvl], time: when(a), place: a.place }) : T("alert.lvlAt", { level: HA.NAMES[a.lvl], time: when(a) }));
  // the full-screen card's words (alarm.js): the level's name, the title, the text, and how many wait in the list
  HA.overlayRows = () => {
    const a = HA.big()[0]; if (!a) return "";
    const m = more();
    return `<div class="alert-lvl">${esc(HA.NAMES[a.lvl])}</div><div class="alert-t" id="alert-t">${esc(a.title || HA.NAMES[a.lvl])}${a.count > 1 ? ` <small>×${+a.count | 0}</small>` : ""}${moreTag(a)}</div>
    <div class="alert-w" id="alert-w">${esc(T("alert.textAt", { text: a.text, time: when(a) }))}</div>${isWx(a) && a.sender ? `<div class="alert-w alert-from">${esc(T("alert.from", { sender: a.sender }))}</div>` : ""}${m ? `<div class="alert-w alert-more">${esc(m)}</div>` : ""}`;
  };
  // Home's line (alarm.js A.banner): a "Notifications" button when alerts wait in the list — a tap opens it
  HA.bannerHtml = () => {
    const n = HA.waiting().length; if (!n) return "";
    const hi = Math.max(...HA.waiting().map((a) => a.lvl));
    // (a level 4–5 waiting — a leak, smoke — is red, not the amber of a level-3 reminder)
    return `<button class="still hub hub-list l${hi >= 4 ? 4 : Math.min(hi, 3)}"${Acts.on("hub.openList")}>${icon("bell", 18)}<span>${esc(T("alert.notificationsN", { n }))}</span>${icon("chevron", 18)}</button>`;
  };
  // the notification list (a pop-up): every alert up here, its level's name, when, × each, and Dismiss all
  const row = (a) => `<div class="hub-row l${a.lvl}${isWx(a) ? " wx" : ""}">${isWx(a) ? `<span class="hub-ri">${HA.icon(a, 20)}</span>` : ""}<div class="hub-rt"><small>${lvlLine(a)}</small>
    <span>${a.title ? `<b>${esc(a.title)}</b>${moreTag(a)} ` : ""}${esc(a.text)}${a.count > 1 ? ` ×${+a.count | 0}` : ""}</span></div>
    ${a.act ? `<button class="hub-act"${Acts.on("hub.dismiss", a.id)}>${esc(a.act)}</button>` : `<button class="hub-x"${Acts.on("hub.dismiss", a.id)} aria-label="${esc(T("alert.dismissOne"))}">${icon("x", 18)}</button>`}</div>`;
  HA.openList = () => UI.popup(() => {
    const list = HA.shown();
    return { title: T("alert.notifications"), body: list.length
      ? `<div class="hub-rows">${list.map(row).join("")}</div>${list.length > 1 ? `<div class="hub-all"><button class="hub-allbtn"${Acts.on("hub.dismissAll")}>${icon("x", 16)}<span>${esc(T("alert.dismissAll"))}</span></button></div>` : ""}`
      : `<p class="phint">${esc(T("alert.nothingNew"))}</p>` };
  });

  // one alert on its own (the weather card's ribbon: a tap) — or, dismissed already, what it was
  HA.openAlert = (id) => UI.popup(() => {
    const a = HA.shown().find((x) => x.id === id);
    if (a) return { title: HA.NAMES[a.lvl], body: `<div class="hub-rows">${row(a)}</div>` };
    const w = (window.Weather && Weather.warnings ? Weather.warnings("*") : []).find((x) => x.id === id);
    return { title: w ? HA.NAMES[w.lvl] || T("alert.weather") : T("alert.notifications"),
      body: w ? `<div class="hub-rows"><div class="hub-row l${w.lvl} wx dim"><span class="hub-ri">${icon("storm", 20)}</span><div class="hub-rt"><small>${esc(T("alert.dismissed"))}</small><span><b>${esc(w.title || "")}</b></span></div></div></div>`
        : `<p class="phint">${esc(T("alert.nothingNew"))}</p>` };
  });
  // the weather card's warning ribbon: the highest weather warning for this panel (its "to", the panel's lowest level
  // shown); one dismissed here or elsewhere is still shown, subdued, while the device reports it. A tap: the warning, or
  // the list when several are up. "" = none.
  // (v3.0.4) id / source: the card's place and what it shows — that place's warnings only (Weather.warnings)
  HA.weatherRibbon = (id, source) => {
    if (window.PANEL_DESIGN === true) return "";   // (nor the weather card's warning ribbon)
    const ws = (window.Weather && Weather.warnings ? Weather.warnings(id, source) : []).filter((w) => forMe({ to: Array.isArray(w.to) ? w.to : ["all"] }) && allowed(w));
    if (!ws.length) return "";
    const up = new Set(HA.shown().filter(isWx).map((a) => a.id)), act = ws.filter((w) => up.has(w.id)).sort((x, y) => y.lvl - x.lvl);
    const top = act[0] || ws.slice().sort((x, y) => y.lvl - x.lvl)[0], dim = !act.length, n = Math.max(0, (dim ? ws.length : act.length) - 1);
    const words = n ? T("alert.ribbonMore", { title: top.title || T("alert.weather"), n }) : (top.title || T("alert.weather"));
    const go = !dim && act.length > 1 ? Acts.on("hub.openList") : Acts.on("hub.openAlert", top.id);
    return `<button class="wx-warn l${top.lvl}${dim ? " dim" : ""}"${go} aria-label="${esc(T(dim ? "alert.ribbonAriaDim" : "alert.ribbonAria", { title: top.title || "" }))}">${icon("storm", 18)}<span>${esc(words)}</span></button>`;
  };

  const ACK = "hubitat/alerts/ack";
  // Dismissing a level 4–5 alert asks for the panel PIN: it clears it on every panel and a Hubitat
  // rule may silence the sirens with it. Levels 1–3 stay one tap. The bridge checks it too (v2.3.2): the PIN goes to the
  // dashboard service over HTTP, which answers with a one-time ticket per alert (/api/pin "ticket", [0, "alertAck", id]
  // — 30 s, single use); the dismissal goes to the bridge with its ticket. The alarm window (pinpad.js: from the PIN
  // entry, touches don't extend it) only means the pad isn't shown — the remembered PIN is checked again each time.
  // The service's own, short "alert" lock-out applies (counted down on the pad). No PIN set: tickets without one.
  const panelName = () => me()[0];
  const askTickets = async (ids, pin) => {
    try {
      const r = await fetch("/api/pin", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ticket", purpose: "alert", panel: panelName(), items: ids.map((id) => [0, "alertAck", id]), ...(pin ? { pin } : {}) }) });
      return await r.json().catch(() => ({ error: `http-${r.status}` }));
    } catch { return { error: "down" }; }
  };
  const NO_TICKET = { get down() { return T("alert.pinDown"); } };
  // → { id: ticket } for these level 4–5 alerts, or null (cancelled, or refused — then already said why)
  HA.tickets = async (ids, title = T("alert.dismissTitle")) => {
    if (!ids.length) return {};
    const good = (j) => j && j.ok && Array.isArray(j.tickets) && j.tickets.length === ids.length;
    const map = (j) => Object.fromEntries(ids.map((id, k) => [id, j.tickets[k]]));
    const say = (text) => PinPad.confirm({ title, text, yes: "OK" }).then(() => null);
    if (!window.PinPad) return null;
    // still in the alarm window: the PIN entered a moment ago (none: no PIN set needs none; else the server says so)
    const j0 = await askTickets(ids, PinPad.alarmUnlocked());
    if (good(j0)) return map(j0);
    if (!["pin-required", "wrong-pin", "locked"].includes(j0.error)) return say(NO_TICKET[j0.error] || T("alert.refusedRetry"));
    let got = null;
    const pin = await PinPad.ask({ title, text: T("alert.enterPin"), purpose: "alert", check: async (p) => {
      const j = await askTickets(ids, p);
      if (good(j)) { got = j; return { ok: true }; }
      if (j.error === "down") return { ok: false, msg: T("pin.serviceDown") };
      return PinPad.refusal(j, T("pin.cantCheck"));
    } });
    if (!pin || !got) return null;
    PinPad.remember(pin);   // (the alarm window starts now)
    return map(got);
  };
  // a level 4–5 on screen is gone (dismissed here, elsewhere, by the rule): the next waiting level 4–5 takes the screen,
  // with its own sound — the highest level first, then the one waiting longest. (Waiting: it came while a higher one, or
  // a level 5, was up.) After a level 1–3 nothing pops up: the rest stay in the list.
  const next = (lvl) => {
    if (!(lvl >= 4)) return;
    const w = HA.shown().filter((a) => a.lvl >= 4 && a.id !== HA.front).sort((x, y) => y.lvl - x.lvl || x.at - y.at)[0];
    if (!w) return;
    HA.front = w.id;
    sound(w);
  };
  HA.next = next;
  const everywhere = (a) => a.lvl >= 3;   // (levels 3–5: gone on every panel — the bridge and the driver do the same)
  const after = () => { H.refresh(); window.Alarm && Alarm.updateLed(); if (UI.isOpen && UI.isOpen()) UI.refreshPopup(); drawNote(); };
  // one alert dismissed here (a level 4–5 asks the PIN → its ticket); Hubitat hears every one. → true when dismissed
  HA.dismiss = async (id) => {
    if (typeof id !== "string" || !/^[0-9a-f]{6,24}$/.test(id)) return false;
    const a = HA.list.find((x) => x.id === id);
    if (a && a.own) { if (HA.front === id) HA.front = null; if (a.done) a.done(); after(); return true; }   // (its own button: the card says when it's gone)
    let ticket = null;
    if (a && a.lvl >= 4) {
      const t = await HA.tickets([id]);
      if (!t) return false;
      ticket = t[id];
    }
    // (a Settings → Test one: Hubitat never sent it)
    if (a && !a.test) H.publish(ACK, { id, panel: panelName(), level: a.lvl, ...(ticket ? { ticket } : {}) });
    refused.delete(id);
    if (a && everywhere(a)) HA.acked.add(id);
    else { gone.add(id); saveGone(); }
    if (HA.front === id) { HA.front = null; next(a && a.lvl); }   // (a level 4–5: the next waiting 4–5 comes up)
    after();
    return true;
  };
  // the full-screen card's Dismiss: the alert it shows
  HA.dismissTop = () => { const a = HA.top(); return a ? HA.dismiss(a.id) : false; };
  // "Dismiss all": every alert this panel shows (3–5 go everywhere through the hub). The level 4–5 ones each go on their
  // own with their ticket first (the bridge never clears a 4–5 through "all"), then one "all" for Hubitat
  HA.dismissAll = async () => {
    const list = HA.shown().filter((a) => !a.own); if (!list.length) return false;   // (a bin's reminder goes with its own button only)
    const was = HA.top();
    const big = list.filter((a) => a.lvl >= 4).slice(0, 20);   // (20 tickets a request; more than that: the rest stay up)
    const t = await HA.tickets(big.map((a) => a.id), T("alert.dismissAll"));
    if (!t) return false;
    for (const a of big) if (!a.test) H.publish(ACK, { id: a.id, panel: panelName(), level: a.lvl, ticket: t[a.id] });
    if (list.some((a) => !a.test)) H.publish(ACK, { all: true, panel: panelName() });
    for (const a of list) { refused.delete(a.id); if (a.lvl >= 4 && !big.includes(a)) continue; if (everywhere(a)) HA.acked.add(a.id); else gone.add(a.id); }
    saveGone();
    HA.front = null;
    next(was && was.lvl);   // (more than 20 level 4–5: one left over comes up)
    after();
    return true;
  };
  // the bridge refused a level 4–5 dismissal from this panel (no / a stale ticket): the alert comes back on screen,
  // with why (alarm.js shows HA.refusal under the card)
  const refused = new Map();   // alert id → the reason's words
  const WHY = { "no-ticket": "alert.why.noTicket", "bad-ticket": "alert.why.badTicket", "too-many": "alert.why.tooMany", "not-up": "alert.why.notUp" };
  HA.refusal = (a) => (a && refused.get(a.id)) || "";
  // (every dismissal the bridge drops is answered: {"id"} for one alert, {"all": true} for a whole Dismiss all)
  const putBack = (a, why) => {
    refused.set(a.id, T(WHY[why] || "alert.why.refused"));
    HA.acked.delete(a.id);
    if (a.lvl >= 3) gone.delete(a.id);   // (levels 1–2 stay dismissed here: that is this panel's own)
    const cur = HA.top(); if (!cur || cur.lvl <= a.lvl) HA.front = a.id;
  };
  H.subscribe("hubitat/alerts/ack/result", (msg) => {
    let m; try { m = JSON.parse(msg); } catch { return; }
    if (!m || m.ok !== false || m.panel !== panelName()) return;
    // (only alerts this panel dismissed and still has in the list: a forged message in its name changes nothing here)
    const mine = HA.list.filter((x) => HA.acked.has(x.id) && (m.all === true || x.id === m.id));
    if (!mine.length) return;
    for (const a of mine.sort((x, y) => x.lvl - y.lvl)) putBack(a, m.reason);
    after();
  });

  // ---------- the note for a level 1–3 front alert (on every page, never under the full-screen card) ----------
  // It stays while the alert is up: level 3 until dismissed, levels 1–2 until their time runs out. The × dismisses it.
  let noteId = "";
  function drawNote() {
    const a = HA.top(), want = a && a.lvl <= 3 ? `${a.id}|${a.count}` : "";
    const old = document.querySelector(".hub-toast");
    if (want === noteId && (!!old === !!want)) return;
    noteId = want;
    if (old) old.remove();
    if (!want) return;
    const n = document.createElement("div");
    n.className = `hub-toast l${a.lvl}`;
    n.setAttribute("role", "status");
    n.innerHTML = `${isWx(a) ? `<span class="hub-ri">${HA.icon(a, 22)}</span>` : ""}<div class="hub-tt"><small>${esc(HA.NAMES[a.lvl])}</small>${a.title ? `<b>${esc(a.title)}${moreTag(a)}</b>` : ""}<span>${esc(a.text)}${a.count > 1 ? ` ×${+a.count | 0}` : ""}</span></div>
      ${a.act ? `<button class="hub-act">${esc(a.act)}</button>` : `<button class="hub-x" aria-label="${esc(T("alert.dismissOne"))}">${icon("x", 20)}</button>`}`;
    n.querySelector("button").addEventListener("click", () => HA.dismiss(a.id));
    document.body.append(n);
  }
  HA.drawNote = drawNote;

  // ---------- a new list from the bridge ----------
  let first = true, tests = [];
  const owns = {};   // (v3.0.4) source → the panel's own reminders (HA.own)
  function take(list) {
    list = list.concat(tests.filter((t) => live(t) && !list.some((a) => a.id === t.id)));   // (Settings → Test ones stay up)
    for (const o of Object.values(owns)) list = list.concat(o.filter((t) => !list.some((a) => a.id === t.id)));
    const was = HA.top();   // (the one on screen before this list)
    const fresh = list.filter((a) => !HA.seen.has(`${a.id}|${a.count}`));
    HA.list = list;
    for (const a of list) HA.seen.add(`${a.id}|${a.count}`);
    // a repeat (the same alert, a higher count) is a new occurrence: a Silence pressed for the last one ends
    if (!first) for (const a of fresh) { silenced.delete(a.id); refused.delete(a.id); }
    if (HA.seen.size > 500) HA.seen = new Set([...HA.seen].slice(-300));
    if (first) {   // (a page loaded fresh: the top one in front, silently)
      const t = HA.shown()[0]; HA.front = t ? t.id : null;
    } else {
      // what's new since the last list, in the order it should win: each takes the front when its level is at least the
      // front one's (a higher one, or a newer one of the same level); a lower one just joins the list — and nothing takes
      // over a level 5 on screen, a second level 5 neither: it waits, and comes up after that one (next())
      const mine = fresh.filter((x) => forMe(x) && allowed(x) && live(x) && !gone.has(x.id) && !HA.acked.has(x.id)).sort((x, y) => x.lvl - y.lvl || x.at - y.at);
      for (const a of mine) {
        const cur = HA.top();
        if (cur && (a.lvl < cur.lvl || cur.lvl === 5)) continue;
        HA.front = a.id;
        sound(a);
      }
    }
    first = false;
    // dismissed elsewhere / gone from Hubitat: forget the local marks for alerts that are no longer up
    for (const id of [...HA.acked]) if (!list.some((a) => a.id === id)) HA.acked.delete(id);
    // (cleared by the rule, dismissed on another panel, or expired: after a level 4–5 the next waiting 4–5 comes up)
    if (HA.front && !HA.top()) { HA.front = null; next(was && was.lvl); }
    for (const id of [...silenced.keys()]) if (!list.some((a) => a.id === id)) silenced.delete(id);
    for (const id of [...refused.keys()]) if (!list.some((a) => a.id === id)) refused.delete(id);
    after();
  }
  // the sound of an alert that just came to the front: 4–5 are spoken (their beeps: alarm.js, while on screen), 3 a
  // gentle attention sound, 1 a short reminder tone, 2 silent. Quiet hours: only 4–5.
  function sound(a) {
    if ((HA.quiet() && a.lvl < 4) || hushed(a)) return;
    // (status.js PanelSpeech decides: muted = only a level 5; an id is said once, so not again when it came with its own speak)
    if (a.lvl >= 4 && window.Alarm) Alarm.say(`${a.title ? `${a.title}. ` : ""}${a.text}`, a.lvl, a.id);
    else if (a.lvl === 3 && window.Sound && Sound.tone) Sound.tone("attention");
    else if (a.lvl === 1 && window.Sound && Sound.tone) Sound.tone("reminder");
  }
  const ok = (a) => a && typeof a === "object" && typeof a.id === "string" && /^[0-9a-f]{6,24}$/.test(a.id) && Number.isInteger(a.lvl) && a.lvl >= 1 && a.lvl <= 5
    && typeof a.text === "string" && Array.isArray(a.to);
  // a long title / text cut at a word with "…" (not "EVERYONE OUT OF THE HOU")
  const cut = (s, n) => (s.length <= n ? s : `${(s.slice(0, n - 1).match(/^[\s\S]*\S(?=\s)/) || [s.slice(0, n - 1)])[0].replace(/[\s,;:.—–-]+$/, "")}…`);
  // (also HubAlerts.receive(json) — the same as a message from the bridge: for testing a panel without a hub)
  const receive = HA.receive = (msg) => {
    let m; try { m = JSON.parse(msg); } catch { return; }
    if (!m || m.v !== 1 || !Array.isArray(m.alerts)) return;
    take(m.alerts.filter(ok).slice(0, 40).map((a) => ({ id: a.id, lvl: a.lvl, to: a.to.filter((t) => typeof t === "string"), tag: String(a.tag || ""),
      title: cut(String(a.title || ""), 80), text: cut(a.text, 300), exp: +a.exp || 0, at: +a.at || Date.now() / 1000, count: +a.count || 1,
      // (v3.0.0 weather warnings from a Hubitat weather device: kind "weather", where, who sent it, how many more are up)
      kind: /^[a-z]{1,20}$/.test(String(a.kind || "")) ? a.kind : "", place: cut(String(a.place || ""), 60), sender: cut(String(a.sender || ""), 60),
      more: Number.isInteger(a.more) && a.more > 0 ? Math.min(a.more, 99) : 0 })));
  };
  if (window.PANEL_DESIGN !== true) H.subscribe("hubitat/alerts", receive);   // (the layout builder's canvas never shows alerts)
  // Settings → Test (the panel only, nothing goes to Hubitat): a made-up alert of this level, as if a rule sent it —
  // shown, sounded and dismissed like a real one (its dismissal isn't sent: Hubitat never had it). It lasts as long as
  // a real one with the level's default: 1–2 for 60 s, 3–5 until dismissed.
  HA.test = (lvl) => {
    if (!Number.isInteger(lvl) || lvl < 1 || lvl > 5) return;
    const TXT = { [lvl]: [T(`alert.test.${lvl}`), T(`alert.test.${lvl}text`)] };
    const id = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
    const now = Date.now() / 1000;
    const t = { id, lvl, to: ["all"], tag: "test", title: TXT[lvl][0], text: TXT[lvl][1], exp: lvl <= 2 ? now + 60 : 0, at: now, count: 1, test: true };
    tests = tests.filter(live).concat(t);
    if (first) { HA.seen.add(`${id}|1`); HA.front = id; early(); sound(t); return; }   // (it still sounds)
    take(HA.list.filter((a) => !a.test));
  };
  // before the bridge's first list: the tests and own reminders join HA.list without take() — `first` stays the
  // bridge's, so after a reload the Hubitat alerts already up come in silently (that first take() adds these too)
  function early() {
    let list = HA.list.filter((a) => !a.test && !a.own).concat(tests.filter(live));
    for (const o of Object.values(owns)) list = list.concat(o.filter((t) => !list.some((a) => a.id === t.id)));
    HA.list = list;
    after();
  }
  // (v3.0.4) the panel's own reminders from `src` (the whole list each time): {id (hex), lvl, tag, title, text, act (its
  // button's words), done()} — shown and sounded as an alert of that level from Hubitat would be
  HA.own = (src, list) => {
    const now = Date.now() / 1000, prev = owns[src] || [];
    owns[src] = (Array.isArray(list) ? list : []).filter((a) => a && /^[0-9a-f]{6,24}$/.test(a.id)).slice(0, 20).map((a) => {
      const was = prev.find((x) => x.id === a.id);
      return { id: a.id, lvl: Math.max(1, Math.min(3, a.lvl | 0)), to: ["all"], tag: String(a.tag || ""), title: cut(String(a.title || ""), 80), text: cut(String(a.text || ""), 300),
        exp: 0, at: was ? was.at : now, count: 1, own: true, act: a.act ? cut(String(a.act), 24) : "", done: typeof a.done === "function" ? a.done : null };
    });
    if (prev.length === owns[src].length && prev.every((x, i) => x.id === owns[src][i].id && x.title === owns[src][i].title)) return;   // (nothing new: no redraw)
    if (first) return early();
    take(HA.list.filter((a) => !a.test && !a.own));
  };
  H.subscribe("hubitat/mode", (msg) => { try { const m = JSON.parse(msg); if (m && typeof m.mode === "string") HA.mode = m.mode.slice(0, 40); } catch {} });
  // a rule's camera pop-up for this panel (or all of them)
  H.subscribe("hubitat/show", (msg) => {
    let m; try { m = JSON.parse(msg); } catch { return; }
    if (!m || !Array.isArray(m.to) || !(m.to.includes("all") || me().some((n) => m.to.includes(n)))) return;
    if (window.Cameras && Cameras.onShow) Cameras.onShow({ camera: m.camera, view: m.view, seconds: m.seconds });
  });
  // levels 1–2 run out on their own (checked every 2 s, so a 60 s note goes on time); the front one gone = no note
  setInterval(() => {
    // a silenced one still up after SILENCE_MS: its Silence button and its sound come back
    for (const [id, until] of [...silenced]) if (until <= Date.now()) { silenced.delete(id); if (HA.big().some((a) => a.id === id)) after(); }
    if (!HA.list.some((a) => a.exp && a.exp * 1000 <= Date.now())) return;
    HA.list = HA.list.filter(live); tests = tests.filter(live);
    if (HA.front && !HA.top()) HA.front = null;
    after();
  }, 2000);
  // (the note hides under the full-screen card and the keypad / PIN pad; drawn again after every refresh)
  H.onChange && H.onChange(drawNote);

  // the Notifications line and list (acts.js)
  Acts.add({ "hub.openList": () => HA.openList(), "hub.openAlert": (id) => HA.openAlert(String(id)), "hub.dismiss": (id) => HA.dismiss(id), "hub.dismissAll": () => HA.dismissAll() });
  window.HubAlerts = HA;
})();
