# Your own background (with the live sky)

Every Skypane panel draws a live sky behind its cards — the sun and moon moving across it, clouds, rain, snow,
lightning — and a landscape in front of it. You can replace the landscape with your own picture (Manager →
Backgrounds → Add a background), and keep the live sky.

## The idea: a transparent sky

Make the **sky part of your picture transparent**. Skypane puts your picture in front of its sky, so wherever the
picture is see-through, the live sky — sun, moon, clouds and weather — shows through. Mountains, trees, buildings or
your house stay in front.

A picture **without** a transparent sky works too: it simply covers the sky. Then switch the animated sky off for that
panel (Panels → Look & layout) so it doesn't run unseen.

## What to make

- **Size:** your panel's screen, e.g. **1920 × 1080** (landscape). It's scaled to fill the screen.
- **Format:** **PNG** or **WebP** (JPEG has no transparency).
- **The sky:** fully transparent (not half). A soft edge of a few pixels where the sky meets the land looks natural.
- **The land:** fully opaque. Keep the horizon in the lower half or two-thirds, so the sun and moon have room to rise
  and set above it.
- **Colors:** a little darker than a daytime photo reads best behind the cards, day and night.

The Manager turns the picture into a WebP of at most 2560 px a side before it's uploaded (up to 740 KB), which also
removes the photo's hidden data such as where it was taken. The server draws it again before it's kept.

## How to make the sky transparent (free tools)

**GIMP** (free, Windows / Mac / Linux):
1. Open the picture. *Layer → Transparency → Add Alpha Channel.*
2. Pick the **Fuzzy Select** tool (the magic wand) and click the sky; hold **Shift** and click to add more of it.
3. Press **Delete** — the sky turns into a checkerboard (transparent).
4. *Select → None*, then *File → Export As… →* `my-background.png`.

**Photopea** (free, in the browser — photopea.com): open the picture, use *Magic Wand* on the sky, press Delete,
then *File → Export as → PNG*.

**remove.bg / similar sites:** these remove a background around a subject; for a landscape, check that only the sky
went and the land stayed.

## Tips

- Clouds or haze in your photo stay in front of the live sky — remove them with the sky, or soften them, so the live
  weather isn't hidden.
- City lights, a lit window or a lamp post look lovely at night against the live moon.
- Built-in scenes to compare with: Manager → Backgrounds → Built in.
