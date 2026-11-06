// The LED agent on this panel's own tablet follows Skypane by itself (v3.0.2, mockups/AGENT-AUTOCONFIG.md).
// The agent (tools/panel-agent, a root program on the PoE tablet: the LED strip and the sensors) listens on
// http://127.0.0.1:852 only (rev. 2: below 1024, so no Android app can take the port) — the panel's CSP allows that one address (server.py PANEL_CSP).
//   - every 60 s: GET /status (2 s timeout) → {connected, name, broker: "host:port", pinned, tokenId, …}. (3.0.2 re-test)
//     No answer 3 times in a row: no agent on this tablet ("none"), asked again every 10 minutes only; before that
//     (an agent restarting) the last state stays and it is asked again in 60 s. Back and connected: the LED re-send.
//   - not connected, a name / broker host other than this panel's, or "pinned": false (no token stored yet): GET /api/panel/<id>/agent (the built-in broker's
//     devices login, the FreeKiosk name, this tablet's agent token; 404 not-builtin with a separate broker — that one is set up by hand, so this
//     stops asking; 400 ipv6 when the page was opened by an IPv6 address — the broker is IPv4-only — stops asking too, until a reload) and POST it to the agent's /config. At most once every 5 minutes. The console gets the outcome,
//     never the password or the token, which are held only for that one call.
//   - (3.0.2 re-test, token rotation) the agent's tokenId (first 12 hex of sha256 of its token) other than the server's
//     (learnt from GET /api/panel/<id>/agent — the first check after a load asks once): configured too, with the
//     token the server renewed on an unlink and the previous one ("prevToken"), which the agent holds — so it takes
//     the new one at once.
//   - (rev. 2) the agent takes /config only with the token it was first given (403 {"error": "token"}) and only from
//     the page whose host is the broker's (403 {"error": "origin"}): logged, reported as "off", tried again after 5
//     minutes at the soonest, as any other attempt.
//   - AgentLink.state ("ok" connected / "off" running but not connected / "none" / null not known yet): status.js
//     sends it as agent=… with its next check-in (the Manager's "Its tablet" card and the Notification light list).
// (v3.0.5) the agent without root (adb's shell user can't open a port below 1024) listens on http://127.0.0.1:8852
// instead — asked there only when the panel's "LED agent without root" setting (settings.agentNoRoot) is on, so the
// devices login is never handed to that port otherwise. AgentLink.version: the agent's own version (its /status
// "agent"), sent with the check-in (status.js) so the Manager says when Skypane has a newer one.
// (v3.0.5) Port squatting: any app may listen on 8852 while the agent isn't running. So before the devices login or
// the agent token is handed over, the page asks the agent's POST /hello with a fresh nonce from Skypane (GET
// /api/panel/<id>/agent's "hello") and compares its answer (an HMAC under this tablet's agent key) with the one Skypane
// expects. Once the agent has proved it ("keyed"), a wrong answer, "pinned": false or no /hello at all is refused:
// nothing is sent, AgentLink.proof = "bad" (status.js: agentk=bad — the Manager's tablet card warns). Before that
// (the first set-up, an agent before 4) it is trust on first use. AgentLink.proof = "ok" once it matched (agentk=ok).
// Only on the real panel (Home.isPanel) holding this panel's device key; never in the builder's canvas or "Open live".
(function () {
  const H = window.Home;
  // (v3.0.5) 852 with root, 8852 without (the setting says which; the panel's CSP allows both, server.py PANEL_CSP)
  const agentUrl = () => (window.Settings && Settings.v && Settings.v.agentNoRoot === true ? "http://127.0.0.1:8852" : "http://127.0.0.1:852");
  const api = { state: null, version: null, proof: null };   // (v3.0.5: proof — "ok" | "bad" | null)
  window.AgentLink = api;
  if (!H || !H.isPanel || window.PANEL_DESIGN === true || window.PANEL_LIVE) return;
  const PID = () => String((window.PanelStore && PanelStore.id) || window.PANEL || "").toLowerCase();
  const keyed = () => !!window.PANEL_DEVICE_KEY
    || (() => { try { return String(localStorage.getItem("skypane.dk") || "").toLowerCase().indexOf(`${PID()}.`) === 0; } catch { return false; } })();
  const EVERY = 60000, ABSENT = 600000, CONFIG_GAP = 300000, MISSES = 3;
  // serverTokenId: the server's tokenId (not secret) from the last GET …/agent, null = not asked yet this load
  let lastConfig = 0, builtin = true, timer = null, refused = false, misses = 0, serverTokenId = null;

  // fetch with a time limit (the old FreeKiosk WebView may have no AbortController: the race still gives up)
  function ask(url, opts, ms) {
    const ctl = window.AbortController ? new AbortController() : null;
    let cut = null;
    const late = new Promise((res, rej) => { cut = setTimeout(() => { if (ctl) ctl.abort(); rej(new Error("timeout")); }, ms); });
    return Promise.race([fetch(url, Object.assign({}, opts, ctl ? { signal: ctl.signal } : {})), late])
      .then((r) => { clearTimeout(cut); return r; }, (e) => { clearTimeout(cut); throw e; });
  }
  // (rev. 2) the strip's colour again once the agent is (re)connected: led/set isn't retained and alarm.js skips
  // repeats — 2 s later, after the agent has subscribed
  const resend = () => setTimeout(() => { if (window.Alarm && Alarm.resendLed) Alarm.resendLed(); }, 2000);
  // "host:port" / "tcp://host:port" → host ("[::1]" kept with its brackets, as location.hostname has it)
  const hostOf = (b) => String(b || "").replace(/^[a-z]+:\/\//i, "").replace(/:\d+$/, "").toLowerCase();

  // (v3.0.5) the same text, compared in full (no early exit)
  const same = (a, b) => { if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
  // (v3.0.5) the agent's /hello against Skypane's expected answer: "ok" | "bad" (refuse) | "tofu" (never proved yet)
  async function hello(want) {
    const h = want.hello;
    let j = null;
    if (h && typeof h.nonce === "string" && typeof h.expect === "string") {
      try {
        const r = await ask(`${agentUrl()}/hello`, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
          credentials: "omit", body: JSON.stringify({ nonce: h.nonce }) }, 3000);
        j = r.ok ? await r.json().catch(() => null) : null;
      } catch (e) { j = null; }
      if (j && j.pinned === true && same(j.sig, h.expect)) return "ok";
    }
    return want.keyed === true ? "bad" : "tofu";
  }

  async function configure(st) {
    lastConfig = Date.now();
    let want = null;
    try {
      const r = await ask(`/api/panel/${encodeURIComponent(PID())}/agent`, { cache: "no-store", credentials: "same-origin" }, 8000);
      if (r.status === 404 || r.status === 400) {
        const j = await r.json().catch(() => null);
        if (j && j.error === "not-builtin") { builtin = false; console.info("agentlink: a separate MQTT broker — the agent's agent.args is set by hand"); }
        // (review: the built-in broker listens on IPv4 only — opened by an IPv6 address, stop asking until a reload)
        else if (j && j.error === "ipv6") { builtin = false; console.warn("agentlink: open Skypane by its IPv4 address on this tablet — the LED agent can't reach the broker over IPv6"); }
        else console.warn(`agentlink: Skypane didn't give the agent's settings (${r.status})`);
        return;
      }
      if (!r.ok) { console.warn(`agentlink: Skypane didn't give the agent's settings (${r.status})`); return; }
      want = await r.json().catch(() => null);
    } catch (e) { console.warn("agentlink: Skypane didn't answer"); return; }
    if (!want || typeof want.broker !== "string" || typeof want.name !== "string") return;
    if (typeof want.tokenId === "string") serverTokenId = want.tokenId;
    // (v3.0.5) is it the real agent? Before anything secret goes to the port
    const proof = await hello(want);
    if (proof === "bad") {
      want = null; refused = true; api.state = "off"; api.proof = "bad";
      console.warn("agentlink: what answers on the LED agent's port couldn't prove it is this tablet's agent — nothing was sent (Manager → Panels → the panel → Its tablet)");
      return;
    }
    api.proof = proof === "ok" ? "ok" : null;
    // (already right — unless it holds no token yet: an upgraded or hand-configured agent is pinned by this POST — or
    // (re-test) a token other than the server's: an unlink renewed it, rotated with prevToken; an agent without
    // tokenId (older) is left alone on that)
    const sameToken = typeof st.tokenId !== "string" || typeof want.tokenId !== "string" || st.tokenId === want.tokenId;
    if (st.pinned !== false && sameToken && st.connected === true && st.name === want.name && hostOf(st.broker) === hostOf(want.broker)) { want = null; return; }
    try {
      const r = await ask(`${agentUrl()}/config`, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        credentials: "omit", body: JSON.stringify({ broker: want.broker, user: want.user, pass: want.pass, name: want.name,
          token: typeof want.token === "string" ? want.token : "",
          // (v3.0.5) the agent's own key: it signs the self-update and /hello (taken with a new token, or once)
          ...(typeof want.key === "string" && want.key ? { key: want.key } : {}),
          ...(typeof want.prevToken === "string" && want.prevToken ? { prevToken: want.prevToken } : {}) }) }, 5000);
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.ok) { refused = false; resend(); console.info(`agentlink: the LED agent was set up (${want.name} on ${want.broker})`); }
      else if (r.status === 403 && j && (j.error === "token" || j.error === "origin" || j.error === "private")) {
        refused = true; api.state = "off";
        console.warn(j.error === "token" ? "agentlink: the LED agent was set up by another Skypane (its token differs) — asked again in 5 minutes"
          : j.error === "private" ? "agentlink: the LED agent takes a new server only on the local network (open Skypane by its LAN address) — asked again in 5 minutes"
          : "agentlink: the LED agent takes its settings only from the page of its broker's host — asked again in 5 minutes");
      } else console.warn(`agentlink: the LED agent refused its settings (${r.status}${j && j.error ? ` ${String(j.error).slice(0, 40)}` : ""})`);
    } catch (e) {
      console.warn("agentlink: the LED agent didn't take its settings");
    } finally { want = null; }
  }

  async function check() {
    clearTimeout(timer);
    let next = EVERY;
    if (keyed()) {
      let st = null;
      try {
        const r = await ask(`${agentUrl()}/status`, { cache: "no-store", credentials: "omit" }, 2000);
        st = r.ok ? await r.json().catch(() => null) : null;
      } catch (e) { st = null; }
      if (!st || typeof st !== "object") {
        // (re-test: one missed answer is an agent restarting — "none" and the 10-minute pace only after MISSES in a row)
        misses += 1;
        if (misses >= MISSES) { api.state = "none"; next = ABSENT; }
      } else {
        const back = misses > 0;
        misses = 0;
        api.version = typeof st.agent === "string" ? st.agent.slice(0, 12) : null;   // (v3.0.5)
        const off = st.connected !== true || st.name !== H.kiosk() || hostOf(st.broker) !== String(location.hostname || "").toLowerCase();
        // (review: "pinned": false = no token stored yet — an upgraded or hand-configured agent. It is configured even
        // when everything else matches, so it gets this panel's token; an older agent without the field isn't)
        const unpinned = st.pinned === false;
        // (re-test: a tokenId other than the server's — or the server's not known yet this load — asks the server; an
        // older agent without tokenId isn't asked for that)
        const rotate = typeof st.tokenId === "string" && st.pinned !== false && (serverTokenId === null || st.tokenId !== serverTokenId);
        if (!off && api.proof !== "bad") refused = false;   // (v3.0.5: never while what answers couldn't prove itself)
        // (rev. 2: an agent that refused this page — another server's token — counts as not connected for this panel)
        const was = api.state;
        api.state = st.connected === true && !refused ? "ok" : "off";
        if (api.state === "ok" && (was !== "ok" || back)) resend();   // (absent / not connected → connected: a restart, a rename)
        // (v3.0.5: and a refused /hello is asked again, at the same pace — the real agent may be back)
        if ((off || unpinned || rotate || api.proof === "bad") && builtin && Date.now() - lastConfig >= CONFIG_GAP) await configure(st);
      }
    }
    timer = setTimeout(check, next);
  }
  setTimeout(check, 1000);   // (just before status.js's first check-in, 1.5 s)
})();
