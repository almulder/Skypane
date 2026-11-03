// Skypane panel: this tablet's device key (v3.0.2, mockups/PAIRING-API.md) — loaded before every other script.
// The key lives in an HttpOnly cookie (skypane_dk, never seen here); this file keeps its copy in localStorage
// ("skypane.dk" = "<pid>.<key>") and puts it back when the cookie is gone:
//   - the page's new key (window.PANEL_DEVICE_KEY, or the boot JSON's) and a health check-in's {deviceKey}: kept
//   - a same-origin answer 401 {error:"device-key"}: PATCH /api/pair {action:"restore"} once, then the request once
//     more; still 401 → "/" (the pairing page says why)
//   - 401 {copy:true} (a retired key used again) or 403 {error:"other-panel"}: straight to "/" — the server shows why
// Not in the Manager's builder canvas or "Open live" (?design=1 / ?live=1): those run on the Manager's login, no key.
(function () {
  const DK = "skypane.dk";
  if (window.PANEL_DESIGN === true || window.PANEL_LIVE) return;
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const pid = () => String(window.PANEL || "").toLowerCase();
  // a bare key from the server gets its panel in front; "<pid>.<key>" stays as it is (a key has no "." of its own)
  const keep = (k, panel) => {
    k = typeof k === "string" ? k.trim() : "";
    const p = panel || pid(), full = !k ? "" : k.indexOf(".") > 0 ? k : p ? `${p}.${k}` : "";
    if (full && full.length < 300) ls.set(DK, full);
  };
  let first = window.PANEL_DEVICE_KEY;
  if (first == null) {   // (panel-boot.js copies only the names it knows: read the boot JSON too)
    try { const n = document.getElementById("panel-boot"), b = n ? JSON.parse(n.textContent) : null; if (b && b.PANEL_DEVICE_KEY) first = b.PANEL_DEVICE_KEY; } catch {}
  }
  if (first) keep(first);
  const orig = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
  if (!orig) return;

  const HEALTH = /^\/api\/panel\/[^/]+\/health$/;
  const local = (input) => {
    try { const u = new URL(typeof input === "string" ? input : (input && input.url) || String(input), location.href); return u.origin === location.origin ? u : null; } catch { return null; }
  };
  const bodyOf = async (r) => { try { const j = await r.clone().json(); return j && typeof j === "object" ? j : null; } catch { return null; } };
  let leaving = false;
  const home = () => { if (!leaving) { leaving = true; location.replace("/"); } };
  // the one restore: shared by every request that failed at the same time; another may be tried a minute later
  let restoring = null;
  function restore() {
    if (restoring) return restoring;
    restoring = (async () => {
      const saved = ls.get(DK) || "", i = saved.indexOf("."), panel = i > 0 ? saved.slice(0, i) : "", key = i > 0 ? saved.slice(i + 1) : "";
      if (!panel || !key) return false;
      try {
        const r = await orig("/api/pair", { method: "PATCH", headers: { "Content-Type": "application/json" }, cache: "no-store", credentials: "same-origin",
          body: JSON.stringify({ action: "restore", panel, key }) });
        const j = await r.json().catch(() => null);
        if (r.ok && j && j.ok) { if (j.deviceKey) keep(j.deviceKey, panel); return true; }
      } catch {}
      return false;
    })();
    restoring.then(() => setTimeout(() => { restoring = null; }, 60000));
    return restoring;
  }
  const refused = (r, j) => r.status === 401 && j && j.error === "device-key";
  window.fetch = async function (input, init) {
    const u = local(input);
    if (!u || u.pathname === "/api/pair") return orig(input, init);
    const again = typeof Request === "function" && input instanceof Request ? input.clone() : input;   // (a Request's body is read once)
    const r = await orig(input, init);
    if (r.ok) {
      if (HEALTH.test(u.pathname)) bodyOf(r).then((j) => { if (j && j.deviceKey) keep(j.deviceKey); });   // (the check-in's new key)
      return r;
    }
    if (r.status !== 401 && r.status !== 403) return r;
    const j = await bodyOf(r);
    if (r.status === 403) { if (j && j.error === "other-panel") home(); return r; }
    if (!refused(r, j)) return r;
    if (j.copy) { home(); return r; }
    if (!(await restore())) { home(); return r; }
    const r2 = await orig(again, init);
    if (r2.ok && HEALTH.test(u.pathname)) bodyOf(r2).then((j2) => { if (j2 && j2.deviceKey) keep(j2.deviceKey); });
    if (r2.status === 401 && refused(r2, await bodyOf(r2))) home();
    return r2;
  };
})();
