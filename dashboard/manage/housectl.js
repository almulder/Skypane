// Skypane Manager — Mode & alarm (v2.9.3): the house's Hubitat mode and Hubitat Safety Monitor from the
// Overview, for an admin or a login with "Switch devices" — always with the panel PIN, as on a panel (disarm too).
// GET /api/manage/house/command → {modes, mode, hsm: {status, alert}, can, pinSet, hsmActions}; PATCH {command:
// "setMode" | "setHsm", value, pin} → the server checks the PIN, sends a one-time ticket on the signed Manager topic,
// and the Hubitat bridge checks it all again (its own mode / HSM budgets). Nothing is shown at once here (a PIN
// command): the card reads the house again when the hub has it. Built with DOM calls + textContent only.
(function () {
  const M = window.Manage, S = window.Shell, K = window.Kit; if (!M || !S || !K) return;
  const { el, api } = M, ic = K.icon, t = K.t;
  let H = null, busy = false, msg = null, readAt = 0;
  const HSM_WORDS = { armedAway: "house.armedAway", armedHome: "house.armedHome", armedNight: "house.armedNight", armingAway: "house.armingAway",
    armingHome: "house.armingHome", armingNight: "house.armingNight", disarmed: "house.disarmed", allDisarmed: "house.disarmed" };
  const ACTION_WORDS = { armAway: "house.armAway", armHome: "house.armHome", armNight: "house.armNight", disarm: "house.disarm", cancelAlerts: "house.cancelAlerts" };
  const boxes = new Set();

  async function read(force) {
    if (!force && H && Date.now() - readAt < 10000) return H;
    try { H = await api("/api/manage/house/command"); readAt = Date.now(); } catch { /* (the last one stays) */ }
    return H;
  }
  function why(r) {
    const W = { 0: t("control.offline"), "pin-unset": t("control.pinUnset"), "not-allowed": t("control.notAllowed"), "no-broker": t("control.noBroker"),
      "no-bridge": t("control.noBridge"), timeout: t("control.timeout"), "hub-error": t("control.hubError"), "bad-value": t("house.badValue"),
      "command-not-allowed": t("control.notThis") };
    return r.status === 429 ? t("control.tooMany", { s: r.retryIn || 5 }) : r.error === "refused" ? t("control.refused", { why: r.reason || "" })
      : W[r.status === 0 ? 0 : r.error] || t("control.notSent");
  }
  async function send(command, value, words) {
    if (busy) return;
    if (H && "broker" in H && H.broker !== true) { msg = { text: t("control.noBroker"), bad: true }; redraw(); return; }   // (v3.0.0: why, before the PIN)
    if (!H || !H.pinSet) { msg = { text: t("control.pinUnset"), bad: true }; redraw(); return; }
    let why0 = "", lockedFor = 0;
    for (;;) {
      const pin = M.askControlPin ? await M.askControlPin(t("house.title"), command, words, why0, lockedFor) : null;
      if (pin == null) { msg = { text: t("control.notSent") }; redraw(); return; }
      busy = true; msg = { text: t("control.sending") }; redraw();
      let r;
      try { r = await api("/api/manage/house/command", { command, value, pin }); } catch (e) { r = { status: e && e.message === "login" ? -1 : 0 }; }
      busy = false;
      if (r.status === -1) { msg = null; redraw(); return; }
      if (r.status === 200 && r.ok) { msg = { text: t("house.done", { what: words }) }; redraw(); follow(); return; }
      if ((r.status === 403 && (r.error === "wrong-pin" || r.error === "pin-required")) || r.status === 423) {
        why0 = r.error === "wrong-pin" ? t("control.wrongPin") : ""; lockedFor = r.lockedFor || 0; continue;
      }
      msg = { text: why(r), bad: true }; redraw(); return;
    }
  }
  // (gate 2) after a change: the house read again until it says so — the hub's retained mode / HSM state (arming has an
  // exit delay: "Arming away…" first) — at 1.5, 4, 8, 15, 30 and 60 s, or until it's settled
  let followT = [];
  function follow() {
    for (const x of followT) clearTimeout(x);
    followT = [1500, 4000, 8000, 15000, 30000, 60000].map((ms) => setTimeout(async () => {
      if (![...boxes].some((b) => b.isConnected)) return;
      await read(true); redraw();
    }, ms));
  }
  function body() {
    const h = H || {}, kids = [];
    if (Array.isArray(h.modes) && h.modes.length) {
      const sel = el("select.hc-sel", { "aria-label": t("house.mode"), disabled: busy, onchange: (e) => { const v = e.target.value; e.target.value = h.mode || ""; send("setMode", v, v); } },
        !h.modes.includes(h.mode) ? el("option", { value: "", selected: true, disabled: true }, "—") : null,
        h.modes.map((m) => el("option", { value: m, selected: m === h.mode }, m)));
      kids.push(el("div.hc-row", {}, el("span.hc-l", {}, ic("home", 15), t("house.mode")), el("b.hc-now", {}, h.mode || "—"), sel));
    }
    if (h.hsm) {
      const st = t(HSM_WORDS[h.hsm.status] || "house.unknown");
      // (gate 2: the same style for every action; the one the house is in already is marked and can't be pressed again)
      const NOW = { armAway: /Away$/, armHome: /Home$/, armNight: /Night$/, disarm: /isarmed$/ };
      const acts = (h.hsmActions || []).filter((a) => a !== "cancelAlerts" || h.hsm.alert).map((a) => {
        const cur = !!(NOW[a] && NOW[a].test(h.hsm.status));
        return el("button.btn.sm" + (cur ? ".hc-cur" : ""), { type: "button", disabled: busy || cur, "aria-current": cur ? "true" : null,
          onclick: () => send("setHsm", a, t(ACTION_WORDS[a])) }, ic(cur ? "eye" : "lock", 13), t(ACTION_WORDS[a]));
      });
      kids.push(el("div.hc-row", {}, el("span.hc-l", {}, ic("bell", 15), t("house.alarm")),
        el("b.hc-now" + (h.hsm.alert ? ".bad" : ""), {}, h.hsm.alert ? t("house.alert", { what: h.hsm.alert }) : st)), el("div.hc-acts", {}, acts));
    }
    if (!kids.length) kids.push(el("p.gf.pad", {}, t("house.notHeard")));
    kids.push(el("p.hc-msg" + (msg && msg.bad ? ".bad" : ""), { role: "status", "aria-live": "polite" }, msg ? msg.text : t("house.hint")));
    return kids;
  }
  function redraw() { for (const b of [...boxes]) { if (!b.isConnected) { boxes.delete(b); continue; } b.replaceChildren(...body()); } }
  // the card for the Overview (a computer: a card in the right column; a phone: a heading and a list) — null when this
  // login can't use it; filled once the house is read
  M.houseCard = (phone) => {
    if (M.isDemo && M.isDemo()) return null;
    const me = M.me() || {};
    if (!me.admin && !M.can("switch")) return null;
    const box = el("div.hc-body");
    boxes.add(box);
    const card = phone ? el("div.hc-phone", {}, el("h2.ovp-h", {}, t("house.title")), el("div.ovp-list.hc", {}, box))
      : el("section.card.flush.hc", {}, el("h3.ch", {}, ic("home", 15), t("house.title"), el("small", {}, t("house.pinAlways"))), box);
    read().then((h) => { if (!h || !h.can) { card.remove(); return; } redraw(); });
    if (H && H.can) box.replaceChildren(...body());
    return card;
  };
  M.onReset(() => { H = null; msg = null; readAt = 0; boxes.clear(); });
})();
