// Skypane Manager — before the first paint (loaded in <head>, v2.3.0): the theme and the sidebar's pin from this
// browser's copy of the last login's prefs (shell.js keeps it; the server's copy — /api/manage/prefs — wins once
// it answers), and whether this is a phone (a narrow screen with a finger, never the user agent: shell.js follows it).
// No inline script: the Manager's CSP allows only its own files.
(function () {
  const html = document.documentElement;
  let p = null;
  try { p = JSON.parse(localStorage.getItem("skypane.manager.prefs") || "null"); } catch {}
  const theme = p && ["light", "dark", "night"].includes(p.theme) ? p.theme : "dark";
  html.dataset.theme = theme;
  if (p && p.pinned === true) html.classList.add("pinned");
  try { if (window.matchMedia("(max-width: 699px) and (pointer: coarse), (max-height: 500px) and (pointer: coarse)").matches) html.classList.add("phone"); } catch {} // i18n-ok
})();
