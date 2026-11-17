# Additional plugins

Plugins that add integrations Skypane doesn't have built in. Each one is a `.skyplugin` file you download and install
yourself; nothing here ships inside Skypane.

**Needs Skypane 3.0.46.1 or newer** (the release that added plugins). Some plugins need a newer Skypane: each one's
line below and its page say which.

| Plugin | What it does | Download |
|---|---|---|
| [Narwal robot vacuum](narwal/) | Your Narwal robot's map with your rooms, live status and battery; vacuum or mop all rooms or the rooms you tap; pause, resume, send it home. Local, no cloud. | [narwal-1.0.4.skyplugin](narwal/narwal-1.0.4.skyplugin) |
| [NVIDIA Shield remote](nvidia-shield/) | A remote for your NVIDIA Shield TV: the real remote's look (or flat), an on-screen keyboard, your own button, volume to your receiver over HDMI, power, find my remote, and the apps you pick beside the remote with their icons. Local, no cloud. Needs Skypane 3.0.52. | [nvidia-shield-1.2.0.skyplugin](nvidia-shield/nvidia-shield-1.2.0.skyplugin) |
| [Commute](commute/) | Your drive to work with live traffic: when to leave, how long it takes right now, why it's slower, and a map of the route with traffic. By car, bike or on foot. Uses your own free TomTom key. Needs Skypane 3.0.49. | [commute-1.3.0.skyplugin](commute/commute-1.3.0.skyplugin) |

## Installing a plugin

1. Download its `.skyplugin` file.
2. In Skypane: **Manager → Integrations → Plugins → Install**, and pick the file.
3. Read the trust screen: it lists what the plugin does and what it connects to. Confirm it's you (your password).
4. The plugin gets its own tab in Integrations for its settings, and its cards appear in the layout builder under
   **Plugins**.

A plugin runs its own code on your Skypane server, with the same access as Skypane. Only install plugins from people you
trust. Skypane never downloads or updates a plugin by itself: you upload every version.

## Writing your own

**[PLUGIN-GUIDE.md](PLUGIN-GUIDE.md)** is the full guide: the package and manifest, the worker and its SDK, the settings
tab, the card and its bridge, alerts, the panel PIN, security, testing, packing, sharing a plugin here, the lessons
from building the Narwal plugin, checklists, and every limit in one table. Updated for Skypane 3.0.52.7: tick lists, sliders,
device slots, the rate limit. The [Narwal plugin](narwal/) and the [NVIDIA Shield remote](nvidia-shield/) are complete
worked examples.
