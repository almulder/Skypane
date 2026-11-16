# NVIDIA Shield remote (Skypane plugin)

A remote for your NVIDIA Shield TV on your Skypane panels. Skypane talks to the Shield directly on your home network:
no cloud, no account.

**Download:** [nvidia-shield-1.0.0.skyplugin](nvidia-shield-1.0.0.skyplugin) · needs **Skypane 3.0.46.1 or newer**

## What you get

- **The remote**, drawn like the Shield's own remote: power, menu, the round d-pad with OK, Back, Home, rewind,
  fast-forward, play / pause, volume, and a search button that opens the TV's search screen.
- **Two looks**: the real remote (dark, red power), or flat in your theme's colours. Pick it per card.
- **Your own button** where the remote's Netflix button is: type its label and colour, and choose what it does: open an
  app (type its name, like "Netflix", or its package), Home, Back, Menu, Search, Play / pause, Mute, Find my remote, or
  nothing.
- **Your apps as tiles** on big cards, with their own icons straight from your Shield. Tap one to open it on the TV.
  Filter by video, music or games, or show only video and music.
- **Volume that reaches your receiver**: volume is sent the way the Shield's own remote sends it, so it goes to a
  receiver or soundbar over HDMI (ARC / CEC) when that's how your sound is set up.
- **Find my remote**: the Shield remote beeps until you press one of its buttons (remotes with a speaker, like the 2019
  remote).
- **What's on**: the open app and the volume, and whether the Shield is asleep.
- **Power**: wakes the Shield when it's asleep, puts it to sleep when it's on. Turn on the card's **PIN** setting to ask
  for the panel PIN first.
- **Any size**: a small row (power, volume, your button), the remote sideways when wide, the whole remote when tall, and
  the remote with your app tiles when big.

## Set up

1. Install the plugin: **Manager → Integrations → Plugins → Install** (see [installing a plugin](../README.md)).
2. Open its tab, **NVIDIA Shield remote**, and **Add a Shield**: a name, and the Shield's address (your router's list
   of devices shows it, or the Shield: Settings → Device Preferences → About → Status). Give it a fixed address in the
   router.
3. With the Shield awake, press **Pair**. A code appears on your TV. Type it into **Code on the TV** and press **Pair**
   again. Skypane keeps its own key from the Shield, so you only do this once.
4. Press **Test**: it says how many apps it found.
5. In the layout builder, add a **Shield remote** card (Plugins group) and pick the Shield in its settings.

## Good to know

- **Works with** the Shield TV models running a current SHIELD software (2015, 2017 and 2019). Tested live on a 2019
  Shield.
- **What it connects to:** TCP port 8987 (NVIDIA's own remote connection, the one NVIDIA's phone app uses) and TCP port
  8009 (Google Cast, to read what's on) on the Shield addresses you enter, and the app icons the Shield serves while
  Skypane is connected. Nothing else.
- **The title of what's playing isn't available**: the Shield doesn't offer it to outside apps. The card shows the open
  app instead.
- **Your button's app** is typed as a name or package in the card's settings (the layout builder can't list the apps of
  one Shield). The card matches it against your Shield's apps.
- **Forget pairing** removes Skypane's key. To remove Skypane from the Shield too, unpair it in the Shield's settings.
- **Not affiliated with NVIDIA.** NVIDIA and SHIELD are NVIDIA's trademarks. App icons on the card come from your own
  Shield; none are included in the plugin.

## Files

| Path | What |
|---|---|
| `nvidia-shield-1.0.0.skyplugin` | the plugin, ready to install |
| `source/` | what's inside it: `plugin.json` (manifest), `worker/` (the server part: `shield_core.py` the Shield's protocols, `selfcert.py` a plain-Python certificate maker), `card/remote/` (the panel card), `strings/en.json` (every word), `help.md`, `icon.svg` |
| `tests/` | an end-to-end test against a stand-in Shield on 127.0.0.1 (never a real Shield); needs Skypane's source, see the top of `test_plugin_e2e.py` |

To rebuild the package from `source/`, use the plugin kit's `pack.py` from Skypane's source:
`python tools/plugin-kit/pack.py source -o nvidia-shield-<version>.skyplugin`.

## Credits

The shape of NVIDIA's remote messages was learned from the MIT-licensed
[obnauticus/ha-nvidia-shield-remote](https://github.com/obnauticus/ha-nvidia-shield-remote) (a Home Assistant
integration), then re-implemented here with the standard library only and checked against a real Shield. Its license is
in [THIRD-PARTY-ha-nvidia-shield-remote-MIT.txt](THIRD-PARTY-ha-nvidia-shield-remote-MIT.txt).
