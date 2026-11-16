# Additional plugins

Plugins that add integrations Skypane doesn't have built in. Each one is a `.skyplugin` file you download and install
yourself; nothing here ships inside Skypane.

**Needs Skypane 3.0.46.1 or newer** (the release that added plugins).

| Plugin | What it does | Download |
|---|---|---|
| [Narwal robot vacuum](narwal/) | Your Narwal robot's map with your rooms, live status and battery; vacuum or mop all rooms or the rooms you tap; pause, resume, send it home. Local, no cloud. | [narwal-1.0.2.skyplugin](narwal/narwal-1.0.2.skyplugin) |

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
from building the Narwal plugin, checklists, and every limit in one table. The [Narwal plugin](narwal/) is a complete
worked example.
