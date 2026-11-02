// What a tap (or a change, a key…) on the panel's generated HTML does — without a handler in the markup (v2.5.1: the
// panel page's CSP is script-src 'self': no onclick="…", no eval). An element names its action and its arguments:
//   <button data-click="ui.calShift" data-args="[-1]">        ← Acts.on("ui.calShift", -1)
//   <select data-change="set.sky">                            ← Acts.attr("change", "set.sky")
// and each module adds its own small table of actions: Acts.add({ "ui.calShift": (n) => …, … }). Every action is
// called as fn(...args, element, event).
// One listener per event type on the document does the rest:
//   click    the innermost element's action, then each enclosing one's — as handlers in the markup ran, bubbling —
//            unless an action stops it (event.stopPropagation()). In the bubbling phase, so the panel's own
//            capture-phase listeners still come first (app.js: the tap that ended a press-and-hold is eaten).
//   change, input, keydown, focus (focusin), error (an <img> that failed: captured, it doesn't bubble)
// Only names in the tables run — never code from the page — and arguments are JSON data.
(function () {
  const A = Object.create(null);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const TYPES = { click: "click", change: "change", input: "input", keydown: "keydown", focus: "focusin", error: "error" };
  const run = (type, el, e) => {
    const name = el.dataset[type], fn = A[name];
    if (typeof fn !== "function") { console.warn(`[acts] no action "${name}" (${type})`); return; }
    let args = [];
    if (el.dataset.args) { try { args = JSON.parse(el.dataset.args); } catch { args = []; } }
    if (!Array.isArray(args)) args = [args];
    try { fn(...args, el, e); } catch (err) { console.error(`[acts] ${name} failed:`, err); }
  };
  document.addEventListener("click", (e) => {
    // (the path as it was when the tap happened: an action that redraws doesn't change which enclosing ones run)
    const path = e.composedPath ? e.composedPath() : [];
    for (const n of path) {
      if (n === document || n === window) break;
      if (n.nodeType === 1 && n.dataset && n.dataset.click && !n.matches(":disabled")) { run("click", n, e); if (e.cancelBubble) break; }
    }
  });
  for (const [type, ev] of Object.entries(TYPES)) {
    if (type === "click") continue;
    document.addEventListener(ev, (e) => {
      const el = e.target && e.target.closest ? e.target.closest(`[data-${type}]`) : null;
      if (el) run(type, el, e);
    }, type === "error");
  }
  const args = (a) => (a.length ? ` data-args="${esc(JSON.stringify(a))}"` : "");
  window.Acts = {
    add(table) { for (const [k, f] of Object.entries(table)) A[k] = f; },
    // the attributes for an element's click action (with its arguments)
    on: (name, ...a) => ` data-click="${esc(name)}"${args(a)}`,
    // … for another event (change, input, keydown, focus, error); arguments shared with its click, if any
    attr: (type, name, ...a) => ` data-${type}="${esc(name)}"${args(a)}`,
    has: (name) => typeof A[name] === "function",
  };
})();
