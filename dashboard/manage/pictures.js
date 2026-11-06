// Skypane Manager — the picture picker (stage 4b; the Backgrounds and Icons pages: media.js since v2.6.0). Loaded after manage.js (window.Manage).
// Pictures: the panels' built-in line icons and animated drawings, plus the owner's uploads (service/pictures.py:
// PNG / JPEG / WebP / GIF, a style — icon / animated icon / appliance / animated appliance — and the device types it
// fits). A device's picture: "line:<icon>" | "art:<drawing>" | "up:<id>" (Manager → Devices → Picture).
(function () {
  const M = window.Manage;
  const { el, api, toast, iconEl } = M;
  const K = window.Kit;
  let LIB = null;   // { uploads, used, styles, types }
  M.onReset(() => { LIB = null; });   // (a new sign-in: read again — what's "in use" depends on who asks)
  // the animated drawings on the room pages (roomlayoutG.js ART) and the device types they fit
  const ART = [["fan-ceiling", K.t("pictures.art.ceilingFan"), ["fan"]], ["fan-box", K.t("pictures.art.boxFan"), ["fan"]], ["fan-pedestal", K.t("pictures.art.pedestalFan"), ["fan"]],
    ["fan-desk", K.t("pictures.art.deskFan"), ["fan"]], ["fan-tower", K.t("pictures.art.towerFan"), ["fan", "air", "purifier"]], ["purifier", K.t("pictures.art.purifier"), ["purifier", "air"]],
    ["washer", K.t("pictures.art.washer"), ["washer"]], ["dryer", K.t("pictures.art.dryer"), ["dryer"]], ["dishwasher", K.t("pictures.art.dishwasher"), ["dishwasher"]], ["oven", K.t("pictures.art.oven"), ["oven"]],
    ["fridge", K.t("pictures.art.fridge"), ["fridge"]], ["microwave", K.t("pictures.art.microwave"), ["microwave"]], ["garage", K.t("pictures.art.garage"), []]];   // (garage: shown on its status row, not a big card — to look at only)   // (only what a big card can show)
  // (more drawings from art-extra.js, with the device types each fits)
  { const G = window.RoomLayouts && RoomLayouts.G;
    if (G && G.artInfo) for (const k of G.artKeys) { const i = G.artInfo(k); if (i && !ART.some(([x]) => x === k)) ART.push([k, i.name, i.fits]); } }
  const TYPE_NAMES = { light: K.t("pictures.type.light"), fan: K.t("pictures.type.fan"), outlet: K.t("pictures.type.outlet"), switch: K.t("pictures.type.switch"), shade: K.t("pictures.type.shade"), valve: K.t("pictures.type.valve"),
    garage: K.t("pictures.type.garage"), purifier: K.t("pictures.type.purifier"), air: K.t("pictures.type.air"), washer: K.t("pictures.type.washer"), dryer: K.t("pictures.type.dryer"), dishwasher: K.t("pictures.type.dishwasher"),
    fridge: K.t("pictures.type.fridge"), oven: K.t("pictures.type.oven"), microwave: K.t("pictures.type.microwave"), speaker: K.t("pictures.type.speaker"), tv: K.t("pictures.type.tv"), vacuum: K.t("pictures.type.vacuum"), sensor: K.t("pictures.type.sensor"),
    door: K.t("pictures.type.door"), window: K.t("pictures.type.window"), lock: K.t("pictures.type.lock"), camera: K.t("pictures.shared.aboutcameras"), other: K.t("pictures.type.other") };
  // a device's "now" role → the picker's starting type
  const typeOf = (now) => {
    const k = String(now || "").replace(/^thing:|^sensor:/, "");
    if (TYPE_NAMES[k]) return k;
    return { "door-in": "door", "door-out": "door", contact: "door", "smart-outlet": "outlet", speaker: "speaker", siren: "other",
      motion: "sensor", climate: "sensor", water: "sensor", smoke: "sensor", gas: "sensor", leak: "sensor" }[k] || "other";
  };
  const upURL = (id) => `/pictures/${id}`;
  // a built-in drawing, running (roomlayoutG.js draws it — our own SVG, never user text)
  function artEl(k, size) {
    const G = window.RoomLayouts && RoomLayouts.G, box = el("span.artbox", { style: `width:${size}px;height:${Math.round(size * 1.15)}px` });
    if (G && G.artPreview && G.artKeys.includes(k)) box.innerHTML = G.artPreview(k);
    else box.append(iconEl(k.startsWith("fan") ? "fan" : "kitchen", Math.min(size, 28)));
    return box;
  }
  async function load() {
    const r = await api("/api/manage/pictures");
    if (!Array.isArray(r.uploads) || !r.styles) throw new Error(r.error || K.t("pictures.notLoaded"));   // (LIB stays as it was)
    LIB = r;
  }

  function preview(choice, size) {
    const m = /^(line|art|up):(.+)$/.exec(choice || "");
    if (!m) return el("span.muted", {}, K.t("pictures.automatic"));
    if (m[1] === "up") return el("img.thumb", { src: upURL(m[2]), alt: "", style: `width:${size}px;height:${size}px` });
    if (m[1] === "line") return iconEl(m[2], size);
    const a = ART.find(([k]) => k === m[2]);
    return el("span.artname", {}, artEl(m[2], Math.max(size, 40)), a ? a[1] : m[2]);
  }
  M.picturePreview = preview;

  // ---------- the picker (Manager → Devices → a device → Picture) ----------
  M.pickPicture = async function (device, now, current, onPick) {
    try { if (!LIB) await load(); } catch (e) { if (e.message !== "login") toast(e.message || K.t("pictures.cantRead"), true); return; }
    let type = typeOf(now), close = () => shade.remove();
    const shade = el("div.modal-bg", { onclick: (e) => { if (e.target === shade) close(); } });
    const choose = (v) => { close(); onPick(v); };
    function draw() {
      const tile = (choice, label, kids) => el("button.ptile" + (current === choice ? ".cur" : ""), { type: "button", title: label, onclick: () => choose(choice) }, kids, el("small", {}, label));
      const ups = LIB.uploads.filter((u) => u.types.includes(type) && u.style !== "background");   // (backgrounds: whole screens, not device pictures)
      const byStyle = Object.keys(LIB.styles).map((s) => [s, ups.filter((u) => u.style === s)]).filter(([, l]) => l.length);
      const arts = ART.filter(([, , ts]) => ts.includes(type));
      const body = el("div.pbody", {},
        el("div.chips", {}, Object.keys(TYPE_NAMES).map((t) => el("button" + (t === type ? ".cur" : ""), { type: "button", onclick: () => { type = t; draw(); } }, TYPE_NAMES[t]))),
        el("div.pgrid", {}, tile("", K.t("pictures.automatic"), el("span.auto", {}, K.t("pictures.picker.autoMark")))),
        ...byStyle.flatMap(([s, l]) => [el("div.group", {}, K.t("pictures.picker.yours", { style: LIB.styles[s].label })),
          el("div.pgrid", {}, l.map((u) => tile("up:" + u.id, u.name, el("img.thumb", { src: upURL(u.id), alt: "" }))))]),
        arts.length ? el("div.group", {}, K.t("pictures.picker.artGroup")) : "",
        arts.length ? el("div.pgrid", {}, arts.map(([k, n]) => tile("art:" + k, n, artEl(k, 64)))) : "",
        el("div.group", {}, K.t("pictures.picker.lineGroup")),
        el("div.pgrid", {}, (window.ICON_NAMES || []).map((n) => tile("line:" + n, n, iconEl(n, 30)))));
      M.swap(shade, el("div.modal", { role: "dialog", "aria-modal": "true", "aria-label": K.t("pictures.picker.label", { device }) },   // (a type picked: the focus stays on it)
        el("div.ehead", {}, el("div", {}, el("h2", {}, K.t("pictures.picker.title")), el("small.muted", {}, device)),
          el("button.ghost.small", { type: "button", onclick: () => close(), "aria-label": K.t("common.close") }, "✕")), body));
    }
    draw();
    close = M.dialog(shade);
  };

  // a background: drawn again as a WebP of at most 2560 px a side, smaller in quality steps until it fits the limit
  // (keeps transparency; drops the file's hidden data — GPS, camera — and anything else hidden in it) → base64
  // (v2.9.0: also an icon picture from a phone — what = "icon"; the bitmap freed after drawing, a huge one refused first)
  const MAX_PIXELS = 40e6;
  async function shrinkBackground(f, st, what = "background") {
    const img = await createImageBitmap(f);
    if (img.width * img.height > MAX_PIXELS) { const mp = Math.round((img.width * img.height) / 1e6); img.close(); throw new Error(window.Kit.t("pictures.tooLarge", { mp })); }
    const long = Math.max(img.width, img.height), short = Math.min(img.width, img.height);
    if (long / short > st.max / st.min) { img.close(); throw new Error(window.Kit.t(what === "icon" ? "pictures.tooThin.icon" : "pictures.tooThin.background")); }
    // one factor for both sides: the long side at most st.max, the short side at least st.min
    const k = Math.max(Math.min(1, st.max / long), st.min / short);
    const w = Math.round(img.width * k), h = Math.round(img.height * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    img.close();
    const b64 = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(b); });
    const tries = [["image/webp", 0.86], ["image/webp", 0.78], ["image/webp", 0.68], ["image/webp", 0.56], ["image/webp", 0.45],
      ["image/png"], ["image/jpeg", 0.85], ["image/jpeg", 0.7], ["image/jpeg", 0.55]];   // (Safari / iPad can't write WebP)
    for (const [type, q] of tries) {
      const b = await new Promise((res) => c.toBlob(res, type, q));
      if (b && b.type === type && b.size <= st.maxBytes) return b64(b);
    }
    throw new Error(K.t("pictures.stillTooBig"));
  }

  // the Manager password again (masked), for deleting a picture that's in use → the password, or null
  function askPassword(text) {
    return new Promise((resolve) => {
      const pw = el("input", { type: "password", autocomplete: "current-password", maxlength: "128", "aria-label": K.t("pictures.password.yours") });
      const shade = el("div.modal-bg.top");
      let close = () => shade.remove();
      const done = (v) => { close(); resolve(v); };
      shade.append(el("form.modal.small", { role: "dialog", "aria-label": K.t("guest.password"), onsubmit: (e) => { e.preventDefault(); done(pw.value || null); } },
        el("h2", {}, K.t("guest.password")), el("p.muted", {}, text), pw,
        el("div.row2", {}, el("button", { type: "submit" }, K.t("control.delete")), el("button.ghost", { type: "button", onclick: () => done(null) }, K.t("control.cancel")))));
      close = M.dialog(shade, pw, () => done(null));
    });
  }

  // what deleting does to each user, in plain words ("panel Hall's background" → it goes back to Mountains)
  // (v3.0.0) what uses a picture, as the server lists it ({kind, …} — never its words), said in the Manager's language
  const panelWords = (u) => (u.main && !u.panel ? K.t("pictures.use.mainPanel")
    : K.t(/panel$/i.test(u.panel || "") ? "pictures.use.thePanel" : "pictures.use.panel", { name: u.panel || "" }));
  function useWords(u) {
    if (!u || typeof u !== "object") return String(u || "");
    if (u.kind === "device") return K.t("pictures.use.device", { name: u.name });
    if (u.kind === "background") return K.t("pictures.use.background", { panel: panelWords(u) });
    if (u.kind === "cards") return u.where === "home" ? K.t("pictures.use.cardsHome", { n: u.n, panel: panelWords(u) })
      : u.where === "rooms" ? K.t("pictures.use.cardsEveryRoom", { n: u.n, panel: panelWords(u) }) : K.t("pictures.use.cardsRoom", { n: u.n, panel: panelWords(u), room: u.room });
    if (u.kind === "person") return K.t("pictures.use.person", { name: u.name, panel: panelWords(u) });
    if (u.kind === "calendar") return K.t("pictures.use.calendar", { name: u.name, panel: panelWords(u) });
    if (u.kind === "savedCard") return K.t("pictures.use.savedCard", { name: u.name });
    if (u.kind === "guestQr") return K.t("pictures.use.guestQr");   // (v3.0.5)
    return K.t("pictures.use.otherPanel");
  }
  const AFTER = { background: "pictures.afterDelete.background", device: "pictures.afterDelete.device", person: "pictures.afterDelete.colour",
    calendar: "pictures.afterDelete.colour", cards: "pictures.afterDelete.cards", savedCard: "pictures.afterDelete.savedCard" };
  const afterDelete = (uses) => uses.map((u) => (u && AFTER[u.kind] ? K.t(AFTER[u.kind], { use: useWords(u) }) : useWords(u)));

  // (v2.6.0: the Backgrounds and Icons pages are media.js — what they share with the picker, from here)
  M.pictureKit = { load: async () => { await load(); return LIB; }, lib: () => LIB, ART, TYPE_NAMES, artEl, upURL, shrinkBackground, askPassword, afterDelete, useWords };
})();
