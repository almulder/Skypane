# Narwal robot vacuum (Skypane plugin)

Shows and runs a Narwal robot vacuum on your Skypane panels. Skypane talks to the robot directly on your home network:
no cloud, no Narwal account.

**Download:** [narwal-1.0.3.skyplugin](narwal-1.0.3.skyplugin) · needs **Skypane 3.0.46.1 or newer**

## What you get

- **The map from your own robot**: your rooms with their names (or their type, like "Kitchen", when unnamed), the dock,
  and the robot's live position and path while it cleans.
- **The map the right way round**: pick its **Map direction** (four ways, names stay upright) in the card's settings in
  the layout builder, once. **Zoom and move** with the mouse wheel or a two-finger pinch (the zoom % shows), drag to
  move, long-press for arrows; kept per card, so it's as you left it.
- **Clean**: Vacuum, Mop, Both, or Vacuum then Mop; **All rooms**, or tap rooms on the map to pick them.
- **While it cleans**: Pause, Resume, Home, Stop; the room it's in, area cleaned, minutes.
- **Station buttons**: Wash mop, Dry mop, Empty bin, Find it.
- **When it needs help** (for example a stuck wheel): the problem shows over the map with a Resume button, and as an
  alert on the panels. The water-tank refill on plumbed docks is not treated as a problem.
- **Any size**: the card shows what fits, from a small row (name, status, battery, Start) up to the full map with every
  button.
- **The panel PIN**: turn on the card's PIN setting to ask for the panel PIN before a clean starts.
- **Room changes made in the Narwal app** are picked up by themselves: the map is checked after every clean and every
  30 minutes while docked (or press **Refresh maps now**).

## Robots that work

Narwal robots with local control: **Flow**, **Flow 2**, **Freo Z10 Ultra** and **Freo X10 Pro**. The Freo X Ultra,
Freo Z Ultra and Freo X Plus are cloud-only and won't answer. Tested live on a Flow (software v01.09.07.06).

## Set up

1. Install the plugin: **Manager → Integrations → Plugins → Install** (see [installing a plugin](../README.md)).
2. Open its tab, **Narwal robot vacuum**, and **Add a robot**:
   - **Name on the panels**, for example "Downstairs robot".
   - **The robot's address**: your router's list of devices shows it. Give the robot a fixed address in the router so
     it doesn't change.
3. Press **Test**.
   - A robot sitting on its dock doesn't say who it is. If Test says so, **start any clean** (Narwal app, a schedule or
     the robot's button) and press **Test** again while it's cleaning. Skypane learns the robot's ID and fills in
     **Robot ID** by itself.
   - If you already know the Robot ID (32 letters and digits), you can paste it instead.
   - "No answer from that address" means nothing answered there: check the address.
4. In the layout builder, add a **Robot vacuum** card (Plugins group), pick the robot in its settings, and set its
   **Map direction** if the map shows the wrong way round.

## Good to know

- **One connection at a time.** The robot talks to one thing at a time. While the Narwal app is open on a phone,
  Skypane may not reach it for a moment; it tries again by itself. Skypane keeps every visit short so the app still
  works.
- **What it connects to:** TCP port 9002 on the robot addresses you enter, nothing else. No password exists on the
  robot's local port.
- **Picking rooms:** the first live room-only clean ran the robot's last saved plan instead of the picked room. The
  request was corrected to the format the reference project uses, but room picking on a real robot is still to be
  confirmed. Whole-house cleans and all other buttons work.
- **Not available from the robot yet:** a reliable "percent done" (area and minutes are shown instead), per-room
  progress, consumables and cleaning history.

## Files

| Path | What |
|---|---|
| `narwal-1.0.3.skyplugin` | the plugin, ready to install |
| `source/` | what's inside it: `plugin.json` (manifest), `worker/` (the server part), `card/vacuum/` (the panel card), `strings/en.json` (every word), `help.md`, `icon.svg` |
| `tests/` | an end-to-end test against a stand-in robot on 127.0.0.1 (never a real robot); needs Skypane's source, see the top of `test_plugin_e2e.py` |

To rebuild the package from `source/`, use the plugin kit's `pack.py` from Skypane's source:
`python tools/plugin-kit/pack.py source -o narwal-<version>.skyplugin`.

## Credits

How the robot's local connection works was learned from the MIT-licensed
[sytchi/NarwalIntegration](https://github.com/sytchi/NarwalIntegration) (a Home Assistant integration), then
re-implemented here and checked against a real robot. Its license is in
[THIRD-PARTY-NarwalIntegration-MIT.txt](THIRD-PARTY-NarwalIntegration-MIT.txt). Not affiliated with Narwal.
