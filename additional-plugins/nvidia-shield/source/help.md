# NVIDIA Shield remote

A remote for your NVIDIA Shield TV on your panels. Skypane talks to the Shield directly on your home network: no cloud,
no account.

## Set up

1. **Add a Shield**: a name, and the Shield's address (your router's list of devices shows it). Give it a fixed address
   in the router.
2. Make sure the Shield is awake, then press **Pair**. A code appears on your TV.
3. Type the code into **Code on the TV** and press **Pair** again. Done: Skypane keeps its own key from the Shield.
4. Press **Test** to check: it says how many apps it found.
5. In the layout builder, add a **Shield remote** card (Plugins group) and pick the Shield.

## Good to know

- **Volume** is sent like the Shield's own remote does, so it reaches a receiver or soundbar over HDMI (ARC / CEC).
- **Your button** opens the app you name (like Netflix), or sends Home, Back, Menu, Search, Play / pause or Mute, or
  makes the remote beep. Pick it in the card's settings.
- **Find my remote** makes the Shield remote beep until you press one of its buttons (the 2019 remote has a speaker).
- **What's on** shows the open app and the volume. The title of what's playing isn't available from the Shield.
- **Look**: the real remote, or flat in your theme's colours.
- The card's **PIN** setting asks for the panel PIN before the power button works.
- **Forget pairing** removes Skypane's key. To remove Skypane from the Shield too, unpair it in the Shield's settings.
