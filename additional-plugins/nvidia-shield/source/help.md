# NVIDIA Shield remote

A remote for your NVIDIA Shield TV on your panels. Skypane talks to the Shield directly on your home network: no cloud,
no account.

## Set up

1. **Add a Shield**: a name, and the Shield's address (your router's list of devices shows it). Give it a fixed address
   in the router.
2. Make sure the Shield is awake, then press **Pair**. A code appears on your TV.
3. Type the code into **Code on the TV** and press **Pair** again. Done: Skypane keeps its own key from the Shield.
4. Press **Sync apps**. Your Shield's apps appear under **Apps on the remote**, all ticked: untick the ones you don't
   use, set their order with the arrows, then **Save**.
5. In the layout builder, add a **Shield remote** card (Plugins group) and pick the Shield.

## Good to know

- **Your apps** are pulled once, when you press **Sync apps**, and kept: the panels never refresh them. Sync again after
  you install or remove apps on the Shield: your ticks are kept, new apps show up unticked, and removed ones can be
  cleared with **Forget them**.
- **Your apps** show beside the remote whenever at least one column fits (narrow card: one column; wider: more), scrolled up and down. Turn them off with **Show the app list** in the card's settings. Make them bigger
  or smaller with the **App icon size** slider (the card's settings, Style tab, Apps).
- **Volume** is sent like the Shield's own remote does, so it reaches a receiver or soundbar over HDMI (ARC / CEC).
- **Your button** is blank until you set it up in the card's settings: a label and what it does (open an app by its
  name, like Netflix, Home, Back, Menu, Search, Play / pause, Mute, the keyboard, or Find my remote).
- **Keyboard**: the mic button opens a keyboard on the card. Each key goes to the TV as you tap it, for search boxes and
  sign-ins. Tap Shift once for one capital, twice for caps lock. English letters, numbers and the usual symbols.
- **Find my remote** makes the Shield remote beep until you press one of its buttons (the 2019 remote has a speaker).
- **What's on** shows the open app and the volume. The title of what's playing isn't available from the Shield.
- **Look**: the real remote, or flat in your theme's colours.
- The card's **PIN** setting asks for the panel PIN before the power button works.
- **Forget pairing** removes Skypane's key. To remove Skypane from the Shield too, unpair it in the Shield's settings.
