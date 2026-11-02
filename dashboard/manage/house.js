// Skypane Manager — the house-wide pages: Rooms and Groups & rules (from Devices; the Cameras page moved to cameras.js
// in v2.6.0). Loaded after manage.js (window.Manage). DOM calls + textContent only.
(function () {
  const M = window.Manage, K = window.Kit;
  const { el, api, toast, iconEl } = M;
  // a saved Devices / Rooms / Groups change: the panels get it once the Hubitat bridge rebuilt the house model
  const said = (msg, bridge) => (M.bridgeDown && M.bridgeDown(bridge)
    ? K.t("rooms.saved.bridgeDown", { what: msg || K.t("rooms.saved.plain") }) : msg || K.t("rooms.saved.follow"));
  // (a device added or taken out in one card is saved at once and the page drawn again: the other cards keep what was
  // typed or ticked in them, and stay open or shut as they were)
  const typed = () => new Map([...M.$main.querySelectorAll("details[data-key]")].map((d) =>
    [d.dataset.key, { open: d.open, vals: [...d.querySelectorAll("input")].map((i) => (i.type === "checkbox" ? i.checked : i.value)) }]));
  function keepTyped(kept, saved) {
    for (const d of M.$main.querySelectorAll("details[data-key]")) {
      const k = kept.get(d.dataset.key), ins = [...d.querySelectorAll("input")];
      if (!k || d.dataset.key === String(saved)) continue;
      d.open = k.open;
      if (ins.length !== k.vals.length) continue;
      ins.forEach((i, n) => { if (i.type !== "checkbox") i.value = k.vals[n]; else if (i.checked !== k.vals[n]) { i.checked = k.vals[n]; i.dispatchEvent(new Event("change")); } });
    }
  }

  // a line icon, picked from all of them (rooms' pictures) → onPick(name) or onPick(null) = automatic
  function pickIcon(title, current, onPick) {
    let close = () => shade.remove();
    const shade = el("div.modal-bg", { onclick: (e) => { if (e.target === shade) close(); } });
    const choose = (v) => { close(); onPick(v); };
    shade.append(el("div.modal", { role: "dialog", "aria-label": title },
      el("div.ehead", {}, el("div", {}, el("h2", {}, title)), el("button.ghost.small", { type: "button", onclick: () => close(), "aria-label": K.t("common.close") }, "✕")),
      el("div.pgrid", {}, el("button.ptile", { type: "button", onclick: () => choose(null) }, el("span.auto", {}, "A"), el("small", {}, K.t("rooms.picture.auto"))),
        (window.ICON_NAMES || []).map((n) => el("button.ptile" + (n === current ? ".cur" : ""), { type: "button", title: n, onclick: () => choose(n) }, iconEl(n, 30), el("small", {}, n))))));
    close = M.dialog(shade);   // (Esc closes it; the focus goes in and back)
  }

  // (v2.4.1) a sub-page opened from Devices: the keyboard focus on its "← Devices" (never left on <body>)
  const focusIn = () => { const a = document.activeElement; if (!a || a === document.body) { const b = M.$main.querySelector(".house > .filters button"); if (b) b.focus({ preventScroll: true }); } };

  // ---------- Rooms (Devices tab → Rooms): pictures for every room, rooms of your own ----------
  M.renderRooms = async function renderRooms(openId) {
    // (drawn again after a change: in place — no "Loading…" step, so the page keeps its scroll position)
    if (!M.$main.querySelector(".rooms-page")) M.$main.replaceChildren(el("p.muted", {}, K.t("common.loading")));
    let R;
    try { R = await api("/api/manage/rooms"); await M.loadDevices(); }
    catch (e) { if (e.message !== "login") M.$main.replaceChildren(el("p.err", {}, K.t("rooms.unreachableLong"))); return; }
    const send = async (body, msg, open) => {
      try {
        const r = await api("/api/manage/rooms", body);
        if (!r.ok) return toast(r.error || K.t("rooms.notSaved"), true);
        toast(said(msg, R.bridge));
        const made = open === "new";
        if (made) open = (r.mine[r.mine.length - 1] || {}).id;
        setTimeout(() => { if (M.tab() === "devices" && document.querySelector(".rooms-page") && !M.isDirty() && !(document.activeElement && /^(INPUT|SELECT)$/.test(document.activeElement.tagName))) M.renderRooms(open); }, 5000);   // (the rebuilt house model — not over typed changes)
        await M.renderRooms(open);
        if (made) { const f = M.$main.querySelector(`[data-fk="add:${open}"]`); if (f) f.focus(); }   // (the new room: its devices next)
      } catch (e) { if (e.message !== "login") toast(K.t("rooms.unreachable"), true); }
    };
    const hub = R.rooms.filter((r) => !r.custom);
    // every room device (lights, fans, switches, outlets, shades…) for the own rooms' pickers
    const all = hub.flatMap((r) => r.devices.map((d) => ({ ...d, room: r.name })));
    const byId = new Map(all.map((d) => [d.id, d]));
    const iconBtn = (name, icon, mine) => el("button.ghost.small", { type: "button", title: K.t("rooms.picture.button"), onclick: () => pickIcon(K.t("rooms.picture.for", { name }), icon,
      (v) => mine ? send({ action: "room", id: mine.id, room: { name: mine.name, icon: v || "grid", devices: mine.devices } }, K.t("rooms.picture.saved"), mine.id)
        : send({ action: "icon", name, icon: v }, v ? K.t("rooms.picture.saved") : K.t("rooms.picture.backToAuto"))) }, iconEl(icon || "home", 22));

    const mineCard = (c) => {
      const devs = [...c.devices];
      const name = el("input", { type: "text", value: c.name, maxlength: "40", "aria-label": K.t("rooms.name"), "data-fk": `name:${c.id}` });
      const list = el("div.chips"), addBox = el("span");
      const drawList = () => list.replaceChildren(...devs.map((id) => { const d = byId.get(id);
        return el("span.tchip", {}, d ? `${d.full || d.name}` : K.t("rooms.gone", { id }), el("button.ghost.small.x", { type: "button", "aria-label": K.t("rooms.takeOut"),
          onclick: () => { devs.splice(devs.indexOf(id), 1); saveRoom(); } }, "✕")); }));
      const saveRoom = () => !name.value.trim() ? toast(K.t("rooms.mine.needsName"), true) : send({ action: "room", id: c.id, room: { name: name.value, icon: c.icon, devices: devs } }, K.t("rooms.mine.saved"), c.id);
      const KIND = { light: K.t("rooms.all.lights"), fan: K.t("rooms.all.fans"), outlet: K.t("rooms.all.outlets"), switch: K.t("rooms.all.switches"), shade: K.t("rooms.all.shades") };
      const drawAdd = () => addBox.replaceChildren(
        el("select", { "aria-label": K.t("rooms.addDevice"), "data-fk": `add:${c.id}`, onchange: (e) => { const v = e.target.value; if (!v) return;
          if (v.startsWith("all:")) all.filter((d) => d.kind === v.slice(4) && !devs.includes(d.id)).forEach((d) => devs.push(d.id)); else devs.push(+v);
          saveRoom(); } },
        el("option", { value: "" }, K.t("rooms.mine.addDevices")),
        el("optgroup", { label: K.t("rooms.mine.manyAtOnce") }, Object.entries(KIND).filter(([k]) => all.some((d) => d.kind === k)).map(([k, l]) => el("option", { value: "all:" + k }, l))),
        hub.map((r) => el("optgroup", { label: r.name }, r.devices.filter((d) => !devs.includes(d.id)).map((d) => el("option", { value: d.id }, `${d.name} (${d.kind})`))))));
      drawList(); drawAdd();
      return el("details.card.group-card", { open: openId === c.id, "data-unsaved": K.t("rooms.mine.unsaved", { name: c.name }), "data-key": c.id },
        el("summary", {}, iconBtn(c.name, c.icon, c), el("b", {}, c.name), el("small.muted", {}, ` · ${K.t("rooms.mine.summary", { n: c.devices.length })}`)),
        el("div.erow", {}, el("span.lbl", {}, K.t("rooms.name")), name),
        el("div.erow", {}, el("span.lbl", {}, K.t("rooms.shared.aboutdevices"), el("span.hint", {}, K.t("rooms.mine.devicesHint"))), list, addBox),
        el("div.row2", {}, el("button", { type: "button", onclick: saveRoom }, K.t("rooms.save")),
          el("button.ghost", { type: "button", onclick: () => confirm(K.t("rooms.mine.removeAsk", { name: c.name })) && send({ action: "room", id: c.id, room: null }, K.t("rooms.mine.removed")) }, K.t("rooms.mine.remove"))));
    };
    const newName = el("input", { type: "text", maxlength: "40", placeholder: K.t("rooms.mine.newPlaceholder"), "aria-label": K.t("rooms.mine.newName") });
    const kept = typed();
    M.swap(M.$main, el("div.house.rooms-page", {},
      el("div.filters", {}, el("button.ghost", { type: "button", onclick: () => M.go("devices") }, K.t("rooms.backToDevices"))),
      el("div.card", {}, el("h2", {}, K.t("rooms.shared.rooms")),
        el("p", {}, K.t("rooms.intro")),
        el("p.muted", {}, K.t("rooms.introMore"))),
      el("div.card", {}, el("h3", {}, K.t("rooms.hub.title", { n: hub.length })),
        hub.map((r) => el("div.srow2", {}, iconBtn(r.name, r.icon), el("span.grow", {}, r.name),
          el("small.muted", {}, R.icons[r.name] ? K.t("rooms.hub.countOwnPicture", { n: r.devices.length }) : K.t("rooms.hub.count", { n: r.devices.length }))))),
      el("h3", {}, K.t("rooms.mine.title", { n: R.mine.length })),
      ...R.mine.map(mineCard),
      el("form.card", { onsubmit: (e) => { e.preventDefault(); if (!newName.value.trim()) { newName.focus(); return toast(K.t("rooms.mine.typeName"), true); }
        send({ action: "room", room: { name: newName.value, icon: "grid", devices: [] } }, K.t("rooms.mine.made"), "new"); } },
        el("h3", {}, K.t("rooms.mine.newTitle")), newName, el("button", { type: "submit" }, K.t("rooms.mine.make")))));
    keepTyped(kept, openId);
    focusIn();
  };

  // ---------- Device groups & their rules (Devices tab → Groups & rules) ----------
  // A group (e.g. "Locks & doors", "Kids' room"): the panel PIN to turn its devices on / open, its locks may be
  // unlocked (always with the PIN, only on panels that allow unlocking), only some panels may control them.
  M.renderGroups = async function renderGroups(openId) {
    if (!M.$main.querySelector(".groups-page")) M.$main.replaceChildren(el("p.muted", {}, K.t("common.loading")));   // (again: in place)
    let panels;
    try { await M.loadDevices(); panels = (await api("/api/manage/panels")).panels || []; }
    catch (e) { if (e.message !== "login") M.$main.replaceChildren(el("p.err", {}, K.t("rooms.unreachableLong"))); return; }
    const D = M.devices(), groups = D.groups || [];
    const byId = new Map(D.devices.map((c) => [c.id, c]));
    const send = async (body, msg, open) => {
      try {
        const r = await api("/api/manage/groups", body);
        if (!r.ok) return toast(r.error || K.t("rooms.notSaved"), true);
        toast(said(msg));
        const id = open === "new" ? (r.groups[r.groups.length - 1] || {}).id : open;
        await M.renderGroups(id);
        if (open === "new") { const f = M.$main.querySelector(`[data-fk="add:${id}"]`); if (f) f.focus(); }   // (the new group: its devices next)
      } catch (e) { if (e.message !== "login") toast(K.t("rooms.unreachable"), true); }
    };
    const card = (g) => {
      const devs = [...g.devices];
      const name = el("input", { type: "text", value: g.name, maxlength: "40", "aria-label": K.t("rooms.name"), "data-fk": `name:${g.id}` });
      const pin = el("input", { type: "checkbox", checked: g.pin });
      const unlock = el("input", { type: "checkbox", checked: g.unlock });
      const limit = el("input", { type: "checkbox", checked: Array.isArray(g.panels) });
      const pboxes = el("div.chips", {}, panels.map((p) => el("label.tchip", {},
        el("input", { type: "checkbox", value: p.id, checked: Array.isArray(g.panels) && g.panels.includes(p.id) }), p.name)));
      const showP = () => { pboxes.hidden = !limit.checked; };
      limit.addEventListener("change", showP); showP();
      const list = el("div.chips");
      const drawList = () => list.replaceChildren(...devs.map((id) => { const c = byId.get(id);
        return el("span.tchip", {}, c ? c.label : K.t("rooms.gone", { id }), el("button.ghost.small.x", { type: "button", "aria-label": K.t("rooms.takeOut"),
          onclick: () => { devs.splice(devs.indexOf(id), 1); save(); } }, "✕")); }));
      const addBox = el("span");
      const drawAdd = () => {
        const rooms = new Map();
        for (const c of D.devices) { if (devs.includes(c.id)) continue; const r = c.room || c.hubRoom || K.t("rooms.groups.noRoom"); if (!rooms.has(r)) rooms.set(r, []); rooms.get(r).push(c); }
        addBox.replaceChildren(el("select", { "aria-label": K.t("rooms.addDevice"), "data-fk": `add:${g.id}`, onchange: (e) => { if (+e.target.value) { devs.push(+e.target.value); save(); } } },
          el("option", { value: "" }, K.t("rooms.groups.addDevice")),
          [...rooms].sort(([a], [b]) => a.localeCompare(b)).map(([r, cs]) => el("optgroup", { label: r },
            cs.sort((a, b) => a.label.localeCompare(b.label)).map((c) => el("option", { value: c.id }, `${c.label} (${M.roleName(c.is)})`))))));
      };
      drawList(); drawAdd();
      // (a device added / taken out is saved at once, with the rules as they are on screen)
      function save() {
        const chosen = [...pboxes.querySelectorAll("input:checked")].map((i) => i.value);
        if (!name.value.trim()) return toast(K.t("rooms.groups.needsName"), true);
        if (limit.checked && !chosen.length) return toast(K.t("rooms.groups.pickPanel"), true);
        send({ id: g.id, group: { name: name.value, devices: devs, pin: pin.checked, unlock: unlock.checked, panels: limit.checked ? chosen : null } }, K.t("rooms.groups.saved"), g.id);
      }
      const rules = [g.pin && K.t("rooms.groups.rulePin"), g.unlock && K.t("rooms.groups.ruleUnlock"), Array.isArray(g.panels) && K.t("rooms.groups.rulePanels", { n: g.panels.length })].filter(Boolean);
      return el("details.card.group-card", { open: openId === g.id, "data-unsaved": K.t("rooms.groups.unsaved", { name: g.name }), "data-key": g.id },
        el("summary", {}, el("b", {}, g.name), el("small.muted", {}, ` · ${[K.t("rooms.shared.roomDevices", { n: g.devices.length }), ...rules].join(" · ")}`)),
        el("div.erow", {}, el("span.lbl", {}, K.t("rooms.name")), name),
        el("div.erow", {}, el("span.lbl", {}, K.t("rooms.shared.aboutdevices")), list, addBox),
        el("div.erow", {}, el("span.lbl", {}, K.t("rooms.groups.rules")),
          el("label.check", {}, pin, K.t("rooms.groups.pin")),
          el("label.check", {}, unlock, K.t("rooms.groups.unlock")),
          el("label.check", {}, limit, K.t("rooms.groups.limit")), pboxes),
        el("div.row2", {}, el("button", { type: "button", onclick: save }, K.t("rooms.save")),
          el("button.ghost", { type: "button", onclick: () => confirm(K.t("rooms.groups.removeAsk", { name: g.name })) && send({ id: g.id, group: null }, K.t("rooms.groups.removed")) }, K.t("rooms.groups.remove"))));
    };
    const newName = el("input", { type: "text", maxlength: "40", placeholder: K.t("rooms.groups.newPlaceholder"), "aria-label": K.t("rooms.groups.newName") });
    const kept = typed();
    M.swap(M.$main, el("div.house.groups-page", {},
      el("div.filters", {}, el("button.ghost", { type: "button", onclick: () => M.go("devices") }, K.t("rooms.backToDevices")),
        el("small.muted", {}, K.t("rooms.groups.sub"))),
      el("div.card", {}, el("h2", {}, K.t("rooms.groups.title")),
        el("p.muted", {}, K.t("rooms.groups.intro"))),
      ...groups.map(card),
      el("form.card", { onsubmit: (e) => { e.preventDefault(); if (!newName.value.trim()) { newName.focus(); return toast(K.t("rooms.groups.typeName"), true); }
        send({ group: { name: newName.value, devices: [], pin: true } }, K.t("rooms.groups.made"), "new"); } },
        el("h3", {}, K.t("rooms.groups.newTitle")), newName, el("button", { type: "submit" }, K.t("rooms.groups.make")))));
    keepTyped(kept, openId);
    focusIn();
  };

  // (v2.6.0: the Cameras page is cameras.js — Live / Setup)
})();
