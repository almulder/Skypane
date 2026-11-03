# Panel pairing: one panel, one tablet

Since Skypane 3.0.2 a panel only works on the tablet the admin approved for it. A tablet asks with a code, the admin
approves it in the Manager, and from then on that tablet opens its panel by itself. Another phone or laptop on your
Wi-Fi that opens the same address sees "Unable to connect".

In the examples Skypane is at `http://192.168.1.50/` (Unraid). With Docker, add `:8088`:
`http://192.168.1.20:8088/`.

## Connect a tablet

1. **On the tablet:** open Skypane's address, `http://192.168.1.50/` — in the browser the tablet will keep using
   (with FreeKiosk: set it as FreeKiosk's start page). It shows Skypane's status and **Connect this panel** with a
   6-character code, plus what the tablet is (for example *Chrome on Android*, model *SM-T500*, its screen size).
2. **In the Manager:** **Panels** → **New panel requests** → **Approve** next to that tablet (a number on **Panels** in
   the sidebar says something is waiting).
3. Type **the code on the tablet** (capitals or not, spaces don't matter) and a **name**:
   - a **new name** (e.g. `Kitchen`) makes a new panel, at its own address (`/kitchen`);
   - the name of an **unclaimed panel** (one with no tablet yet) takes that panel over, with all its settings.
     **Or take over:** lists them to pick from;
   - a panel that already has a tablet is refused: unlink it first, or choose another name.
4. The tablet says *Connected as Kitchen*, shows its address, and opens it after a few seconds. From then on it
   goes there by itself, also when it opens the bare address `http://192.168.1.50/` again.

Good to know:

- The code changes every 10 minutes (*New code in 9:41*). The request only lasts while that screen is open: a tablet
  that leaves it, or goes to sleep, disappears from the list.
- 5 wrong codes cancel the request. **Reject** turns a request down.
- **Accept new panels** (the switch on the New panel requests box) off: a new tablet sees *Pairing is closed. Ask the
  admin to open it in the Manager.*, and no request is made.
- Approving is done in the Manager on a computer. A phone shows the requests and notices to read.
- You can prepare a panel first (**Panels → Add panel**): it starts **unclaimed** and blank. Give it a look, then
  approve the tablet with that panel's name.

## Each panel's tablet

**Panels → Setup →** a panel → the **Its tablet** card: the device, its last IP, when it was last seen and when it was
paired. The buttons:

- **Unlink device** — the tablet loses its key and goes back to the pairing screen. The panel keeps its name and
  settings and waits, **unclaimed**, for the next tablet approved with its name. Use it to replace a tablet.
- **Move this device to…** — this tablet takes over an unclaimed panel: that panel's name and settings. The panel it
  leaves can be removed then (or kept for another tablet).
- **Rename** — only the name changes; its address and FreeKiosk name stay.
- **Re-trust this device** — shown after a copy alert (below), once you know where the copy came from.

## How the lock works

- At approval, Skypane gives the tablet a long random **device key**. The browser keeps it in a cookie that the page's
  own scripts can't read, with a second copy in the page's storage as a backup. The server keeps only a scrambled
  form (a hash) of it.
- That second copy is on purpose: if the browser loses or expires the cookie, the start page finds the copy and asks
  for the cookie back ("restore") — the tablet stays connected, with no new code to approve. The trade-off: a script
  running on the panel's own page could read that copy. Skypane's pages load no outside scripts, and a copied key is
  caught (below). Edge and Chrome keep a cookie at most about 400 days, however long Skypane asks for; the restore
  covers that too.
- Every visit and every call from the panel must carry its key. No key, the wrong key, or another panel's key: no
  access. That's why it doesn't need MAC or IP addresses: a new IP from your router changes nothing.
- The key is **swapped for a new one** now and then (at most every 10 minutes). If an old, replaced key is ever used
  again, that's a copy: it's refused, and a notice says *Possible copy of Kitchen's device key*. With **Lock a
  panel when its key is copied** on, that panel then stops until you press **Re-trust this device** or **Unlink
  device**.
- Skypane also remembers what the tablet looked like (browser, system, model, screen, time zone). If a valid key
  suddenly comes from something quite different — an Android tablet that now looks like Chrome on Windows — it raises
  a notice. That never blocks a panel by itself: browsers update.
- A panel's key opens only that panel. It never opens the Manager or another panel. The Manager keeps its own logins.

## Notices

Under **Panels → Notices**, until you mark them read (nothing is pushed to your phone):

- someone tried to open a panel from another device;
- a possible copy of a panel's key;
- a panel that looks like a different device now;
- a pairing request cancelled after 5 wrong codes;
- (after an upgrade) a tablet that was connected automatically.

Everything is also in **Health → Timeline**.

## Limits — a lock for a home, not a bank

Panel pairing keeps a guest's phone, a kid's laptop or a curious visitor from using a panel's address. It isn't
meant to stop a skilled attacker who is already on your home network:

- **Plain `http://`.** Someone on your Wi-Fi with the right tools could read a key as it travels. Swapping keys and
  copy alerts limit what a copied key can do.
- **The MQTT login is shared.** Every paired panel's page gets the same broker login for the panel pages (that is how
  the panels hear about changes in the house). Someone who reads it from a paired tablet can talk to the broker. Keep
  the tablets where you can see them.
- **Camera video (go2rtc) isn't behind the key.** Port 1984 serves the cameras by their names, as before. Keep
  Skypane on your home network, never port-forwarded.
- **Your own pictures** (uploaded backgrounds and icons) are served by a long random name, without a key — as before: only someone
  who knows the name can open one.
- **Clearing the browser's data** on the tablet removes its key. It then shows the pairing screen again
  ([troubleshooting.md](troubleshooting.md#pairing-problems)).

## Upgrading from 3.0.1

Tablets already in use are connected automatically for 24 hours. See [upgrade.md](upgrade.md#301--302-panel-pairing).
