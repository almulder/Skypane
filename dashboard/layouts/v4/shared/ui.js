// Shared pieces for the round-2 layouts: pop-ups, week calendar, weather location tabs, faces.
// Each layout sets UI.render = its render function; UI calls it after its own state changes.
(function () {
  const H = Home, S = Home.state;
  const UI = { render: () => {} };
  // escape text from data (names, event titles, place names) before putting it into HTML
  const esc = (UI.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]));

  // ---------- pop-up ----------
  const host = document.createElement("div");
  host.className = "popup-host";
  host.onclick = (e) => { if (e.target === host) UI.close(); };
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(host));
  let current = null; // function that re-renders the open pop-up (so it updates live)

  // onClose: optional callback for whoever opened the pop-up (e.g. the alarm keypad re-shows a hidden alert)
  let onClose = null;
  // a pop-up opened over another one (e.g. the alarm over a PIN pad) closes that one properly first (its onClose runs)
  // (v2.7.2, keyboard and screen readers) a pop-up is a modal dialog named by its title: the focus moves into it (the
  // PIN pad: onto the pad itself, which takes the keyboard's digits), Tab stays inside, Escape closes it as × does, and
  // the focus goes back to what opened it. A level 4–5 alert isn't a pop-up (alarm.js): Escape never dismisses one.
  let opener = null;
  const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
  const focusables = () => [...host.querySelectorAll(FOCUSABLE)].filter((e) => e.offsetWidth || e.offsetHeight);
  const focusIn = () => {
    const pop = host.querySelector(".popup"); if (!pop || pop.contains(document.activeElement)) return;
    const pad = pop.querySelector(".pp-keys");
    const first = pad ? pop : pop.querySelector(`.popup-body :is(${FOCUSABLE})`) || pop.querySelector(".popup-x");
    if (first) first.focus({ preventScroll: true });
  };
  UI.popup = (fn, closeCb) => {
    const prev = onClose; onClose = null;
    if (current && prev) prev();
    if (!current) opener = host.contains(document.activeElement) ? null : document.activeElement;
    current = fn; onClose = closeCb || null; UI.refreshPopup(); host.classList.add("show");
    focusIn();
  };
  UI.close = () => {
    current = null; host.classList.remove("show"); host.innerHTML = ""; const cb = onClose; onClose = null; if (cb) cb();
    const back = opener; opener = null;
    if (!current && back && back.isConnected && back.focus && !document.querySelector(".alert-card")) back.focus({ preventScroll: true });
  };
  UI.isOpen = () => !!current;
  document.addEventListener("keydown", (e) => {
    if (!current || !host.classList.contains("show")) return;
    // (a level 4–5 alert over the pop-up has the keyboard: alarm.js moves the focus to it; Escape never dismisses it)
    if (document.querySelector(".alert-card") && !host.querySelector(".pp-keys, .pp-confirm")) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); UI.close(); return; }
    if (e.key === "Tab") {   // (kept inside the pop-up)
      const f = focusables(); if (!f.length) { e.preventDefault(); return; }
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
      return;
    }
    // the PIN pad: 0–9, Backspace and Enter from a keyboard (Enter here never reaches the button that opened it)
    const pad = host.querySelector(".pp-keys");
    if (pad && window.PinPad && !(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) {
      const k = /^[0-9]$/.test(e.key) ? e.key : e.key === "Backspace" ? "back" : e.key === "Enter" ? "ok" : null;
      if (k) { e.preventDefault(); e.stopPropagation(); PinPad._key(k); }
    }
  }, true);
  let shownHtml = "";
  UI.refreshPopup = () => {
    if (!current) return;
    const { title, body, wide, cls } = current();   // (v3.0.2: cls — a pop-up's own class; .popup:has() needs Chrome 105, older FreeKiosk WebViews don't)
    const html = `<div class="popup glass ${wide ? "wide" : ""}${cls ? ` ${cls}` : ""}" role="dialog" aria-modal="true" aria-labelledby="popup-title" tabindex="-1"><div class="popup-head"><h2 id="popup-title">${esc(title)}</h2>
      <button class="popup-x" aria-label="${esc(T("common.close"))}"${Acts.on("ui.close")}>${icon("x", 26)}</button></div><div class="popup-body">${body}</div></div>`;
    // (nothing in it changed: left alone — a rebuild every few seconds could swallow a press landing on it)
    if (html === shownHtml && host.firstElementChild) return;
    shownHtml = html;
    // long lists keep their scroll position when the pop-up is redrawn (live values, a choice just saved); the focus
    // stays on the same control (its action and arguments, else its place)
    const lists = [...host.querySelectorAll(".ov-list, .sensor-list")].map((e) => e.scrollTop);
    const a = document.activeElement, had = a && host.contains(a) ? { key: a.dataset ? `${a.dataset.click || ""}|${a.dataset.args || ""}` : "", i: focusables().indexOf(a), pop: a.classList.contains("popup") } : null;
    host.innerHTML = html;
    host.querySelectorAll(".ov-list, .sensor-list").forEach((e, i) => { if (lists[i]) e.scrollTop = lists[i]; });
    UI.a11y(host);
    if (had) {
      const f = focusables(), same = had.key !== "|" ? f.find((e) => `${e.dataset.click || ""}|${e.dataset.args || ""}` === had.key) : null;
      const to = had.pop ? host.querySelector(".popup") : same || f[Math.min(had.i, f.length - 1)];
      if (to) to.focus({ preventScroll: true });
    }
  };
  // (v2.7.2) names and states a screen reader can read, for controls drawn as plain buttons / sliders (Settings, the
  // pop-ups): an on/off switch is role="switch" with aria-checked and its row's words as its name; a slider is named by
  // its row and says its value; a choice in a row of buttons says whether it's the current one
  const rowWords = (el) => {
    const row = el.closest(".set-row, .prow, .fx-row, .ov-row, .mq-row, label"); if (!row) return "";
    const fx = row.querySelector(".fx-name");
    if (fx && fx !== el) return [...fx.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").trim() || fx.textContent.trim();
    const out = [], walk = (n) => { for (const c of n.childNodes) {
      if (c.nodeType === 3) out.push(c.textContent);
      else if (c.nodeType === 1 && !c.matches("button, input, select, textarea, .seg, small, .muted, svg")) walk(c);
    } };
    walk(row);
    return out.join(" ").replace(/\s+/g, " ").trim().slice(0, 80);
  };
  UI.a11y = (root) => {
    if (!root) return;
    for (const b of root.querySelectorAll("button.switch")) {
      b.setAttribute("role", "switch"); b.setAttribute("aria-checked", b.classList.contains("on") ? "true" : "false");
      if (!b.hasAttribute("aria-label")) { const w = rowWords(b); if (w) b.setAttribute("aria-label", w); }
    }
    for (const r of root.querySelectorAll("input[type=range]")) {
      if (!r.hasAttribute("aria-label")) { const w = rowWords(r); if (w) r.setAttribute("aria-label", w); }
      const v = +r.value, max = +r.max;
      r.setAttribute("aria-valuetext", max <= 1 ? `${Math.round(v * 100)} %` : String(v));
    }
    for (const b of root.querySelectorAll(".seg > button")) b.setAttribute("aria-pressed", b.classList.contains("cur") ? "true" : "false");
    for (const x of root.querySelectorAll(".popup-x:not([aria-label])")) x.setAttribute("aria-label", T("common.close"));
  };
  // live-update open pop-ups, except while someone is typing in one (it would wipe the text)
  // (nor while a finger turns a dial in one: it would drop the dial from under the finger)
  H.onChange(() => { const a = document.activeElement; if (!(a && host.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) && !(window.App && App.dragging)) UI.refreshPopup(); });

  const statusRow = (ic, name, ok, okText, badText, extra = "") =>
    `<div class="prow ${ok ? "ok" : "bad"}">${icon(ic, 24)}<span class="pn">${esc(name)}</span>${extra}<span class="ps">${ok ? okText : badText}</span></div>`;

  UI.windowsPopup = () => UI.popup(() => {
    const open = H.openWindows();
    return { title: open.length ? T("win.open", { n: open.length }) : T("win.allClosed"),
      body: `<div class="pgrid">${[...S.windows].sort((a, b) => b.open - a.open).map((w) =>
        statusRow(w.open ? "windowOpen" : "window", w.name, !w.open, esc(T("state.closed")), esc(T("state.open")))).join("")}</div>
        ${window.PANEL_CONFIG && PANEL_CONFIG.demo === true   // (the fake open / closed taps: only in the public demo — a real panel never lies about a window)
          ? `<p class="phint">${esc(T("win.demoHint"))} <span class="pdemo">${S.windows.slice(0, 4).map((w) => `<button${Acts.on("home.toggleWindow", w.id)}>${esc(w.name)}</button>`).join("")}</span></p>` : ""}` };
  });

  UI.doorsPopup = () => UI.popup(() => {
    const group = (where, label) => `<div class="label" style="margin:6px 0 10px">${label}</div><div class="pgrid">${S.doors.filter((d) => d.where === where)
      .map((d) => statusRow(d.open ? "doorOpen" : "door", d.name, !d.open, esc(T("state.closed")), esc(T("state.open")))).join("")}</div>`;
    const out = H.openDoors("outside").length;
    return { title: out ? T("doors.outsideOpen", { n: out }) : T("doors.allClosed"),
      body: group("outside", esc(T("doors.outside"))) + group("inside", esc(T("doors.inside"))) };
  });

  UI.locksPopup = () => UI.popup(() => ({
    title: T("locks.title"),
    body: `<div class="pgrid">${S.locks.map((l) => statusRow(l.lock === "locked" ? "lock" : "unlock", l.name, l.lock === "locked", esc(T("state.locked")), esc(T("state.unlocked")),
      l.lock === "locked" ? "" : `<button class="pbtn"${Acts.on("home.lock", l.id)}>${esc(T("locks.lock"))}</button>`)).join("")}</div>
      <p class="phint">${esc(T("locks.onlyLocking"))}</p>`,
  }));

  // ---------- calendar (week strip + agenda) ----------
  const cal = { weekStart: null, selected: new Date() };
  const startOfWeek = (d) => { const s = new Date(d); s.setHours(0, 0, 0, 0); s.setDate(s.getDate() - s.getDay()); return s; };
  cal.weekStart = startOfWeek(new Date());
  UI.cal = cal;
  UI.calShift = (weeks) => {
    cal.weekStart.setDate(cal.weekStart.getDate() + 7 * weeks);
    const thisWeek = H.sameDay(startOfWeek(new Date()), cal.weekStart);
    cal.selected = thisWeek ? new Date() : new Date(cal.weekStart);
    UI.render();
  };
  UI.calPick = (t) => { cal.selected = new Date(t); UI.render(); };
  UI.calToday = () => { cal.weekStart = startOfWeek(new Date()); cal.selected = new Date(); UI.render(); };
  // midnight: a calendar left on "today" moves to the new day (a wall panel never reloads); a day picked by hand stays
  let calDay = new Date();
  setInterval(() => {
    const now = new Date(); if (H.sameDay(now, calDay)) return;
    const was = calDay; calDay = now;
    if (!H.sameDay(cal.selected, was)) return;
    cal.weekStart = startOfWeek(now); cal.selected = now;
    if (cal.month && cal.month.getMonth() === was.getMonth()) cal.month = new Date(now.getFullYear(), now.getMonth(), 1);
    UI.render();
  }, 30000);

  UI.weekStrip = () => {
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(cal.weekStart); d.setDate(d.getDate() + i); return d; });
    return `<div class="wk"><button class="wk-nav"${Acts.on("ui.calShift", -1)} aria-label="${esc(T("cal.prevWeek"))}">${icon("chevronLeft", 22)}</button>
      ${days.map((d) => {
        const ev = H.eventsOn(d), sel = H.sameDay(d, cal.selected), today = H.sameDay(d, new Date());
        return `<button class="wk-day ${sel ? "sel" : ""} ${today ? "today" : ""}" ${Acts.on("ui.calPick", d.getTime())} aria-label="${esc(T.date(d))}"${sel ? ` aria-pressed="true"` : ""}>
          <span class="wk-dow">${esc(T.weekday(d))}</span><b class="num">${d.getDate()}</b>
          <span class="wk-dots">${ev.slice(0, 3).map((e) => `<i style="background:${e.cat.color}"></i>`).join("")}</span></button>`;
      }).join("")}
      <button class="wk-nav"${Acts.on("ui.calShift", 1)} aria-label="${esc(T("cal.nextWeek"))}">${icon("chevron", 22)}</button></div>`;
  };

  UI.agenda = () => {
    const ev = H.eventsOn(cal.selected);
    const isToday = H.sameDay(cal.selected, new Date());
    const head = esc(isToday ? T("cal.today") : T.date(cal.selected, { weekday: "long", month: "short", day: "numeric" }));
    return `<div class="ag-head"><span class="label">${head}</span>${isToday ? "" : `<button class="chip"${Acts.on("ui.calToday")}>${esc(T("cal.backToToday"))}</button>`}</div>
      <div class="ag">${ev.length ? ev.map((e) => `<div class="ag-ev"${calBar(e)}><span class="ag-ic" style="color:${e.cat.color};background:${e.cat.color}22">${icon(e.cat.icon, 24)}</span>
        <span class="ag-t">${esc(e.time)}</span><span class="ag-n">${esc(e.title)}<small>${esc(e.who)}</small></span></div>`).join("")
        : `<div class="ag-none">${esc(T("cal.nothing"))}</div>`}</div>`;
  };

  // ---------- month view (round 3) ----------
  cal.mode = "week";
  cal.month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  UI.calMode = (m) => { cal.mode = m; cal.month = new Date(cal.selected.getFullYear(), cal.selected.getMonth(), 1); UI.render(); };
  UI.monthShift = (n) => { cal.month = new Date(cal.month.getFullYear(), cal.month.getMonth() + n, 1); UI.render(); };
  UI.monthPick = (t) => { cal.selected = new Date(t); cal.weekStart = startOfWeek(cal.selected); UI.render(); };
  UI.monthGrid = () => {
    const y = cal.month.getFullYear(), m = cal.month.getMonth(), start = new Date(y, m, 1 - new Date(y, m, 1).getDay());
    const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    const rows = cells[35].getMonth() === m ? 42 : 35;
    return `<div class="mo-head"><button class="wk-nav" style="height:40px"${Acts.on("ui.monthShift", -1)} aria-label="${esc(T("cal.prevMonth"))}">${icon("chevronLeft", 22)}</button>
        <b>${esc(T.month(cal.month))}</b>
        <button class="wk-nav" style="height:40px"${Acts.on("ui.monthShift", 1)} aria-label="${esc(T("cal.nextMonth"))}">${icon("chevron", 22)}</button></div>
      <div class="cal-mo">${Array.from({ length: 7 }, (_, i) => `<span class="dow">${esc(T.weekday(new Date(2000, 0, 2 + i), "narrow"))}</span>`).join("")}
      ${cells.slice(0, rows).map((d) => {
        const ev = H.eventsOn(d);
        return `<button class="${d.getMonth() !== m ? "other" : ""} ${H.sameDay(d, new Date()) ? "today" : ""} ${H.sameDay(d, cal.selected) ? "sel" : ""}" ${Acts.on("ui.monthPick", d.getTime())}>
          <span class="num">${d.getDate()}</span><span class="wk-dots">${ev.slice(0, 3).map((e) => `<i style="background:${e.cat.color}"></i>`).join("")}</span></button>`;
      }).join("")}</div>`;
  };
  // full calendar card body: toggle + week strip or month grid + selected day + coming up
  // (guest mode with "blur the calendar" on this panel — guestlock.js G.blurred, v2.9.3 the same card, its
  // place kept by an empty veil — blurred shapes, not one event (none is even loaded: data.js hideEvents) — with "Hidden
  // while guests stay" on it; a tap: the panel PIN)
  UI.calendar = (upcomingMax = 3) => {
    if (!(window.GuestLock && GuestLock.blurred)) return UI.calendarBody(upcomingMax);
    const live = window.PANEL_LIVE ? `<p class="gl-live gb-live">${esc(T("guest.calLive"))}</p>` : "";
    const rows = Array.from({ length: 6 }, (_, i) => `<i class="gb-row${i % 3 === 0 ? " gb-head" : ""}"></i>`).join("");
    return `<div class="card-head"><span class="label">${esc(T("cal.title"))}</span></div><div class="gb-veil" aria-hidden="true" inert><i class="gb-strip"></i>${rows}</div>
      <div class="gb-over"><button class="gb-show"${Acts.on("gl.showCal")}>${icon("lock", 20)}<span>${esc(T("guest.calHidden"))}</span><small>${esc(T("guest.calHiddenHint"))}</small></button>${live}</div>`;
  };
  UI.calendarBody = (upcomingMax = 3) => `<div class="card-head"><span class="label">${esc(T("cal.title"))}</span>
      <div class="cal-toggle"><button class="${cal.mode === "week" ? "cur" : ""}" ${Acts.on("ui.calMode", "week")}>${esc(T("cal.week"))}</button><button class="${cal.mode === "month" ? "cur" : ""}" ${Acts.on("ui.calMode", "month")}>${esc(T("cal.month"))}</button></div></div>
    <div class="cal-body">${cal.mode === "week" ? UI.weekStrip() : UI.monthGrid()}${UI.agenda()}
    ${H.eventsOn(cal.selected).length < (cal.mode === "week" ? 5 : 3) && upcomingMax ? UI.upcoming(cal.mode === "week" ? upcomingMax : 2) : ""}
    ${H.calNote && H.calNote() ? `<div class="cal-note">${UI.esc(H.calNote())}</div>` : ""}</div>`;

  // next events after the selected day (fills the space under a short day)
  UI.upcoming = (n = 3) => {
    const after = new Date(cal.selected); after.setHours(23, 59, 59, 999);
    const next = H.events().filter((e) => e.date > after && !e.cont).sort((a, b) => a.date - b.date).slice(0, n);   // (cont: a long event's later days)
    if (!next.length) return "";
    return `<div class="ag-head" style="margin-top:6px"><span class="label">${esc(T("cal.comingUp"))}</span></div><div class="ag up">${next.map((e) =>
      `<button class="ag-ev"${Acts.on("ui.calJump", e.date.getTime())}${calBar(e)}><span class="ag-ic" style="color:${e.cat.color};background:${e.cat.color}22">${icon(e.cat.icon, 22)}</span>
        <span class="ag-t">${esc(T.date(e.date, { weekday: "short", day: "numeric" }))}</span><span class="ag-n">${esc(e.title)}<small>${esc(T("cal.eventWho", { time: e.time, who: e.who }))}</small></span></button>`).join("")}</div>`;
  };
  UI.calJump = (t) => { cal.selected = new Date(t); cal.weekStart = startOfWeek(cal.selected); UI.render(); };
  // the built-in Home's calendar card shows whole rows: one that doesn't fit (and a "Coming up" title left without
  // its first row) is hidden instead of cut through the middle (app.js, after each render)
  UI.fitCal = (root) => root.querySelectorAll(".col .cal").forEach((c) => {
    c.querySelectorAll(".cal-more").forEach((m) => m.remove());
    const items = c.querySelectorAll(".ag-head, .ag-ev, .ag-none, .cal-note");
    items.forEach((e) => { e.style.visibility = ""; });
    if (c.scrollHeight <= c.clientHeight + 1) return;
    const end = c.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(c).paddingBottom) || 0);
    items.forEach((e) => { if (e.getBoundingClientRect().bottom > end + 1) e.style.visibility = "hidden"; });
    c.querySelectorAll(".ag-head").forEach((h) => { const f = h.nextElementSibling && h.nextElementSibling.querySelector(".ag-ev"); if (f && f.style.visibility) h.style.visibility = "hidden"; });
    // the events that didn't fit: a "+N more today" line under the last one shown — or, with no room for a line, at the
    // end of that row; the same for "Coming up" (v2.7.2: those were cut without a word — a phone, 800 × 1280)
    const more = (ag, words) => {
      const evs = ag ? [...ag.querySelectorAll(".ag-ev")] : [];
      const shown = evs.filter((e) => !e.style.visibility), last = shown[shown.length - 1];
      if (!ag || shown.length === evs.length) return;
      const m = document.createElement("div");
      m.className = "cal-note cal-more";
      m.textContent = T(words, { n: evs.length - shown.length });
      if (!last) {
        // (none of the list fits — "Coming up" below the card at 800 × 1280: its note under its heading when that shows,
        // else at the end of the last row that does show — never down where it can't be seen)
        const head = ag.previousElementSibling;
        if (head && head.classList.contains("ag-head") && !head.style.visibility) { head.after(m); if (m.getBoundingClientRect().bottom <= end + 1) return; m.remove(); }
        const rows = [...c.querySelectorAll(".ag-ev")].filter((e) => !e.style.visibility);
        const lastRow = rows[rows.length - 1];
        if (lastRow) { m.classList.add("in"); lastRow.append(m); } else ag.prepend(m);
        return;
      }
      last.after(m);
      if (m.getBoundingClientRect().bottom > end + 1) { m.classList.add("in"); last.append(m); }
    };
    more(c.querySelector(".ag:not(.up)"), H.sameDay(cal.selected, new Date()) ? "cal.moreToday" : "cal.moreDay");
    const up = c.querySelector(".ag.up");
    const uh = up && up.previousElementSibling;   // (its heading back when it fits: "Coming up" over its "+N more")
    if (uh && uh.classList.contains("ag-head") && uh.getBoundingClientRect().bottom <= end + 1) uh.style.visibility = "";
    more(up, "cal.moreComingUp");
  });

  // ---------- weather location tabs ----------
  // a grid weather card's own tabs (cw = Weather.forCard(…) + its key): its places, its selected one, no + / ×
  UI.locTabs = (cw) => cw ? `<div class="loc">${cw.places.map((l) => `<button class="loc-t ${l.id === cw.sel ? "sel" : ""}" ${Acts.on("wx.cardSelect", cw.key, l.id)}>${esc(l.name)}</button>`).join("")}</div>`
    : `<div class="loc">${Weather.tabs().map((l) => `<button class="loc-t ${l.id === (Weather.selected || (l.hub ? l.id : "")) ? "sel" : ""}" ${Acts.on("wx.select", l.id)}>${esc(l.name)}
      ${Weather.isCustom(l.id) ? `<span class="loc-x" role="button" aria-label="${esc(T("wx.removePlace", { name: l.name }))}"${Acts.on("wx.remove", l.id)}>${icon("x", 14)}</span>` : ""}</button>`).join("")}
    ${Weather.canAdd() ? `<button class="loc-t add" aria-label="${esc(T("wx.addPlaceAria"))}"${Acts.on("ui.addPlace")}>${icon("plus", 16)}</button>` : ""}</div>`;

  let found = [];
  UI.addPlace = () => UI.popup(() => ({
    title: T("wx.addPlace"),
    body: `<div class="psearch">${icon("search", 22)}<input id="place-q" placeholder="${esc(T("wx.placeholder"))}" autocomplete="off"
        ${Acts.attr("keydown", "ui.findPlaceKey")}><button class="pbtn"${Acts.on("ui.findPlace")}>${esc(T("wx.search"))}</button></div>
      <div class="pgrid">${found.map((p, i) => `<button class="prow ok"${Acts.on("ui.pickPlace", i)}>${icon("pin", 22)}<span class="pn">${esc(p.label)}</span></button>`).join("")}</div>
      <p class="phint">${esc(T("wx.placesHint"))}</p>`,
  }));
  UI.findPlace = async () => { const q = document.getElementById("place-q").value.trim(); if (!q) return; found = await Weather.search(q); UI.refreshPopup(); document.getElementById("place-q").value = q; };
  UI.pickPlace = (i) => { Weather.add(found[i]); found = []; UI.close(); };

  // ---------- people ----------
  // a person: their own picture (up:…, as it is), a built-in icon on their colour (ic:…), or their initial on it
  UI.face = (p, size = 48) => {
    const up = /^up:([0-9a-f]{16})$/.exec(p.icon || ""), ic = /^ic:([A-Za-z0-9]{1,40})$/.exec(p.icon || "");
    const bg = up ? `url('/pictures/${up[1]}') center/cover` : p.image ? `url('${encodeURI(p.image)}') center/cover` : esc(p.color);
    const inner = up || p.image ? "" : ic ? icon(ic[1], Math.round(size * 0.56)) : esc(p.initials);
    // (the initial or icon dark on a light colour, white on a dark one: ≥ 4.5 : 1 either way)
    const lum = (() => { const m = /^#([0-9a-f]{6})$/i.exec(String(p.color || "")); if (!m) return 0; const c = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; })();
    const fg = !up && !p.image && (lum + 0.05) / 0.064 > 1.05 / (lum + 0.05) ? "#14102a" : "#fff";   // (whichever reads better; the initial is large bold text)
    return `<div class="avatar ${p.home ? "" : "away"}${ic ? " ic" : ""}" style="width:${size}px;height:${size}px;font-size:${Math.max(size * 0.43, 12)}px;background:${bg};color:${fg}" title="${esc(T(p.home ? "people.home" : "people.away", { name: p.name }))}">${inner}</div>`;
  };
  // an event's calendar: its colour as a slim bar (whose calendar it is, at a glance)
  // (this panel's own colour for it, else the house calendar's — Manager → Settings → Calendars)
  const calOf = (e) => (H.calInfo ? H.calInfo(e.cal) : (window.Settings && (Settings.v.calendars || []).find((c) => c.id === e.cal))) || null;
  const calBar = (e) => { const c = calOf(e); return c && /^#[0-9a-fA-F]{6}$/.test(c.color || "") ? ` style="--calc:${c.color}"` : ""; };

  // what the markup's buttons do (acts.js: data-click → these; v2.5.1 — no handler in the markup)
  Acts.add({
    "ui.close": () => UI.close(),
    "home.toggleWindow": (id) => H.toggleWindow(id), "home.lock": (id) => H.lock(id),
    "ui.calShift": (n) => UI.calShift(n), "ui.calPick": (t) => UI.calPick(t), "ui.calToday": () => UI.calToday(),
    "ui.monthShift": (n) => UI.monthShift(n), "ui.monthPick": (t) => UI.monthPick(t), "ui.calMode": (m) => UI.calMode(m),
    "ui.calJump": (t) => UI.calJump(t),
    "wx.cardSelect": (key, id) => Weather.cardSelect(key, id), "wx.select": (id) => Weather.select(id),
    "wx.remove": (id, el, e) => { e.stopPropagation(); Weather.remove(id); },   // (not its tab's own: that would select it)
    "ui.addPlace": () => UI.addPlace(), "ui.findPlace": () => UI.findPlace(), "ui.pickPlace": (i) => UI.pickPlace(i),
    "ui.findPlaceKey": (el, e) => { if (e.key === "Enter") UI.findPlace(); },
  });

  window.UI = UI;
})();
