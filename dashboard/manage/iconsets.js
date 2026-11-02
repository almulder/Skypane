// Skypane Manager — the icon sets and their credits (release 2). One list for the layout builder's picker (the set
// names only: picking is all it does there) and the Icons tab's "Icon sets" (who made each set, its licence and
// links, and "Check for new releases" — service/art_sources.py asks GitHub what changed since our version).
// Packs people import later become sets of their own (docs/roadmap.md).
(function () {
  const M = window.Manage;
  const { el, api } = M;
  const K = window.Kit;
  // [id, name, credit text ({links}: the repos), repos, licence]
  const GROUPS = [
    ["line", K.t("iconsets.line.name"), K.t("iconsets.line.credit"), [], ""],
    ["motion", K.t("iconsets.motion.name"), K.t("iconsets.motion.credit"), ["Anashost/HA-Animated-cards"], K.t("iconsets.motion.licence")],   // i18n-ok (repo names)
    ["skypane", K.t("iconsets.skypane.name"), K.t("iconsets.skypane.credit"), ["sionetta/wm_animated_ha_card", "ADNPolymerase/ha-appliance-card"],   // i18n-ok (repo names)
      K.t("iconsets.skypane.licence")],
    ["skyrotter", K.t("iconsets.skyrotter.name"), K.t("iconsets.skyrotter.credit"), ["skyrotter/ha-appliance-electromenager-cards"],   // i18n-ok (repo names)
      K.t("iconsets.skyrotter.licence")],
  ];
  // a sentence with {name} places filled with nodes (links), the words around them as text
  const fill = (s, parts) => String(s).split(/\{(\w+)\}/).flatMap((x, i) => (i % 2 ? [].concat(parts[x] == null ? `{${x}}` : parts[x]) : x ? [x] : []));
  const REPO_AUTHOR = { "Anashost/HA-Animated-cards": "Anashost", "sionetta/wm_animated_ha_card": "sionetta", "ADNPolymerase/ha-appliance-card": "ADNPolymerase",   // i18n-ok (repo names)
    "skyrotter/ha-appliance-electromenager-cards": "skyrotter" };   // i18n-ok

  // a set's credit: who made it, the repos, the licence, and "Check for new releases" (on the right)
  function credit(gid) {
    const [, , text, repos, lic] = GROUPS.find((g) => g[0] === gid) || GROUPS[0];
    const news = el("div.set-news");
    const check = repos.length && (!M.isAdmin || M.isAdmin()) ? el("button.ghost.small", { type: "button", onclick: async () => {
      check.disabled = true; news.replaceChildren(el("small.muted", {}, K.t("iconsets.news.asking")));
      try {
        const r = await api("/api/manage/art-sources?check=1"), u = r.updates;
        if (!u) throw new Error("no answer");   // i18n-ok (caught below, never shown)
        const mine = u.sources.filter((s) => repos.includes(s.repo)), any = mine.some((s) => s.changes > 0), failed = mine.some((s) => s.changes == null);
        news.replaceChildren(...mine.map((s) => el("div", {},
          el("b", {}, REPO_AUTHOR[s.repo] || s.repo), " — ",
          s.changes == null ? el("span.muted", {}, s.error || K.t("iconsets.news.noAnswer"))
            : !s.changes ? el("span.muted", {}, K.t("iconsets.news.nothingNew"))
            : el("span", {}, K.t("iconsets.news.changes", { n: s.changes }) + " ", s.latest.map((c) => `${c.date} ${c.title}`).join(" · "), " ",
              el("a", { href: s.compare, target: "_blank", rel: "noopener noreferrer" }, K.t("iconsets.news.seeThem"))))),   // i18n-ok (rel)
          gid === "motion" ? el("small.muted", {}, K.t("iconsets.news.ideaOnly"))
            : any ? el("p.note", {}, el("b", {}, K.t("iconsets.news.somethingNew")), " ", K.t("iconsets.news.pleaseTell"))
            : failed ? el("small.muted", {}, K.t("iconsets.news.notAll"))
            : el("small.muted", {}, K.t("iconsets.news.none")));
      } catch { news.replaceChildren(el("small.muted", {}, K.t("iconsets.news.unreachable"))); }
      check.disabled = false;
    } }, K.t("iconsets.check")) : null;
    const as = repos.map((r) => el("a", { href: `https://github.com/${r}`, target: "_blank", rel: "noopener noreferrer" }, `${REPO_AUTHOR[r]} · ${r.split("/")[1]}`));   // i18n-ok (rel; repo names)
    // (the last two: "{a} and {b}"; any before them with commas)
    const links = as.length < 2 ? as : [...as.slice(0, -2).flatMap((a) => [a, ", "]), ...fill(K.t("iconsets.credit.pair"), { a: as[as.length - 2], b: as[as.length - 1] })];
    return el("div.set-credit", {},
      el("div.set-row", {}, el("div", {}, el("p", {}, ...fill(text, { links })), lic ? el("small.muted", {}, lic) : null), check),
      news);
  }
  M.iconSets = { GROUPS, REPO_AUTHOR, credit };
})();
