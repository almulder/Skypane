// Skypane panel page — what the server tells this page (v2.4.1): its panel, its settings and, in the Manager, the
// builder's canvas / "Open live" mode. The server writes them into the page as data (<script type="application/json"
// id="panel-boot">, which never runs); this file — loaded right after it, before every other script — puts them where
// the page's scripts read them (window.PANEL, PANEL_CONFIG, PANEL_DESIGN, PANEL_LIVE). So the page needs no inline script
// and its Content-Security-Policy can say script-src 'self' (service/server.py _layout).
(function () {
  const n = document.getElementById("panel-boot");
  if (!n) return;
  let b = {};
  try { b = JSON.parse(n.textContent) || {}; } catch { return; }
  // (PANEL_LOCKDOWN, v2.7.2: guest lockdown for this panel — layouts/v4/shared/guestlock.js)
  for (const k of ["PANEL", "PANEL_CONFIG", "PANEL_DESIGN", "PANEL_LIVE", "PANEL_LOCKDOWN"]) if (Object.prototype.hasOwnProperty.call(b, k)) window[k] = b[k];
})();
