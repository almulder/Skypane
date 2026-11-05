# Making icons for Skypane

Skypane shows three kinds of pictures on cards and room pages. This page says what makes each one work well — for
anyone drawing their own, or turning someone else's icons into a set Skypane can use.

## 1. Pictures you upload (Manager → Icons → Add an icon picture)

The quickest way: any PNG, WebP or GIF. Every upload is drawn again by the server before it is kept (so nothing hidden
inside the file comes along), and it is used exactly as it looks — the theme doesn't recolor it.

| Style | Size | Notes |
|---|---|---|
| Icons | 48–512 px a side (128 × 128 recommended), up to 300 KB | PNG or WebP with a **transparent background** |
| Animated icons | 48–512 px (128 × 128), up to 600 KB | animated GIF or WebP (or APNG) |
| Appliances | 128–1024 px, square (256 × 256), up to 700 KB | PNG or WebP |
| Animated appliances | 128–1024 px, square (256 × 256), up to 700 KB | animated GIF or WebP |

Tips: leave a little empty space around the drawing (about 8 % on each side), keep it readable at 32 px, and use a
transparent background — a white box looks wrong on the dark panels.

## 2. Line icons that follow the theme

Skypane's own line icons (`dashboard/layouts/v4/shared/icons.js`) take the color of the panel's theme, so one icon
works on every theme. To draw one that behaves the same:

- a **24 × 24** `viewBox`, drawn with **strokes**, not fills: `fill="none" stroke="currentColor" stroke-width="1.8"`,
  rounded line caps and joins;
- **no fixed colors** inside — `currentColor` is what lets the theme (or a card's own color) paint it;
- simple shapes only: `path`, `circle`, `rect`, `line`, `polyline`, `polygon`, `ellipse`, `g`.

## 3. Animated drawings (the appliance drawings)

The animated drawings (washer, fridge, coffee maker…) are SVG drawings that move only while the device is on. They
run on a wall tablet over an animated sky, all day, so they have to be cheap to draw:

- **animate only `transform` and `opacity`** (with CSS `@keyframes`). Animated `filter`, `box-shadow`, blur,
  `stroke-dashoffset` or path shapes (`d`) make a tablet stutter — that's the main thing that had to be redone when
  skyrotter's drawings were adapted;
- **still while off:** put the animation under a class that's only there while the device runs;
- glows: a soft gradient layer whose opacity changes, not a blur filter;
- a `viewBox` of about **200 × 240**, the drawing in the middle with a small shadow under it;
- **colors that suit a dark purple panel**: mid grays tinted a little purple (pure white or light gray glares at night).

## When a credited author releases new drawings

Manager → Icons → **Check for new releases** asks GitHub what changed in each credited repo since the version we
adapted from. Their drawings live inside each card's code, and every one has to be reworked for the panels, so new
ones aren't installed automatically. Instead, ask Claude (or do it by hand) to **pull the new drawings**:

1. **Download** only the new drawing files (for skyrotter: `src/core/svg/<name>.js` and `src/core/style/<name>.css`)
   into an empty scratch folder, and read them first: plain template code only — no `require`, `fetch`, `eval`,
   scripts, links or outside pictures.
2. **Render** each drawing to plain SVG in a sandbox (Node's `vm`, with only the author's helper functions loaded).
3. **Convert** it into `art-extra.js`: unused gradients dropped, ids written `ID-…`, class names prefixed `xa-<short>-`,
   blur filters removed, dash "flows" turned into dot chases (`chase()`), the LCD given a fixed sample value, one
   "on" state chosen, and our grays applied by `tint()`.
4. **Animate** with CSS under `.xa-on` (transform / opacity only — see section 3), add a `META` line (name + the
   device types it fits), and preview every drawing off and on against the dark panel.
5. **Record** it: the repo's "adapted from" time in `service/art_sources.py` (so the check starts counting from
   there), the list in `CREDITS.md` and the header of `art-extra.js`.

## What an import will refuse

Icon packs people import (planned — docs/roadmap.md) go through the same kind of check as uploads: an SVG may only
contain plain shapes and gradients. Refused: `<script>`, event handlers (`onclick`…), links (`href` to anything but
the drawing's own gradients), outside pictures or fonts, `<foreignObject>`, and anything that loads from the internet.

## Where things live

- Built-in line icons: `dashboard/layouts/v4/shared/icons.js`
- Animated drawings: `dashboard/layouts/v4/shared/roomlayoutG.js` (Skypane's) and `art-extra.js` (adapted from
  skyrotter's MIT-licensed cards — see CREDITS.md)
- Icon motions (the round colored chips): `motions.js`, `motions.css`
