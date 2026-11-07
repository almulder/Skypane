# First run: your house and your tablets

This walks you from an empty Skypane to tablets on the wall. It assumes Skypane is installed
([install-unraid.md](install-unraid.md) or [install-docker.md](install-docker.md)) and connected to Hubitat
([hubitat.md](hubitat.md)).

In the examples Skypane is at `http://192.168.1.50/` — on Unraid it has its own address and needs no port. With Docker
(or a NAS), use your computer's address and add `:8088` after it everywhere —
`http://192.168.1.20:8088/`, `http://192.168.1.20:8088/kitchen` and so on (the FreeKiosk start page too). Use a computer for
setting up — the Manager works on a phone too, but some parts (Integrations, the layout builder) are computer-only.

## 1. The owner login

You did this already at the end of the install guide: the first visit to the Manager (`http://192.168.1.50/admin/`)
creates the **owner** login. The owner is an admin who can't be removed. You sign in with it straight away.

Lost the password later? See [troubleshooting.md](troubleshooting.md#i-forgot-the-owner-password).

## 2. Check your devices

**Sidebar → Devices.** It lists every device you gave the Skypane Helper on the hub, grouped by room (the rooms come
from Hubitat). Click a device to open its settings. A device missing? On the hub: **Apps → Skypane Helper → Devices for
Skypane**, tick it, then **Done** ([hubitat.md](hubitat.md#2-later-new-devices-and-updates)).

- **Shows as:** what each device is on the panels (light, fan, lock, door, sensor…). Skypane guesses; fix the ones that
  are wrong. **Hidden** keeps a device off the panels.
- **Room:** the room it's shown in.
- A device that opens something (a garage door, a water valve) always asks for the panel PIN. You can make others ask
  too (**Ask for the PIN**).

Changes save as you make them; the panels follow within seconds.

## 3. The panel PIN

One PIN protects every panel's settings, the garage door, valves, unlocking and the alarm. You set it in the Manager,
as the admin:

1. **Panels → Setup →** any panel **→ Safety → Panel PIN → Set PIN…** (No panel yet? Add one first — §4 — or come back
   after pairing your first tablet.)
2. Type 4 to 8 digits, the same digits again, and then **your own Manager password** to confirm it's you. **Save PIN.**

It's the same PIN on every panel, and it's never shown or written to a log. Later you can **Change PIN…** or
**Clear…** it there the same way — the old PIN isn't needed, only your Manager password. (On a tablet, the gear →
**Panel** → **Panel PIN** → **Change PIN** works too, with the old PIN.)

**A sample house?** With no hub connected yet, a panel shows a made-up sample house — **John & Jane**, sample rooms,
devices and calendar events — so you can see how it looks. It isn't anyone's data. Your own devices take its place once
Hubitat is connected, and your calendars replace the sample events once you add one (**Integrations → Calendars**).

(Screenshot: Panels → Setup → Safety with the Panel PIN row and the Set the panel PIN dialog.)

## 4. Your panels — one per tablet

Every tablet is its own panel, and a panel only works on the tablet you approved for it
([panel-pairing.md](panel-pairing.md)). There is no built-in panel: Skypane's own address, `http://192.168.1.50/`,
shows its status, and on a new tablet a code to approve.

**The quick way — pair the tablet, and the panel is made for it:**

1. On the tablet, open `http://192.168.1.50/` (with FreeKiosk: as its start page, §5). It shows **Connect this panel**
   and a 6-character code, e.g. `K7M Q2X`.
2. In the Manager: **Panels** → **New panel requests** → **Approve** next to that tablet.
3. Type the code and a **name**, e.g. `Kitchen`. The line under the name says *Creates a new panel at /kitchen*. **Approve.**
4. The tablet says *Connected as Kitchen* and opens `http://192.168.1.50/kitchen` by itself — from now on
   too, even when its IP address changes.

**Or prepare the panel first** (to give it a look before the tablet is on the wall):

1. **Panels → Add panel.**
2. **Panel name:** e.g. `Kitchen panel`. Skypane makes the panel's web address from it and shows it as you type:
   *This panel will open at `http://192.168.1.50/kitchen`*.
   - Don't type the tablet's IP address here — Skypane doesn't need it. (If you do, it says so.)
   - Want another web address? **Change the web address**: it starts with a letter, then letters, digits, `_` and `-`
     (at most 32).
3. **Add panel.** It's **unclaimed**: no tablet yet. When you approve a tablet later, type this panel's name (or pick it
   under **Or take over:**) — the tablet takes it over with everything you set.

(Screenshot: the Approve this tablet dialog with the code, the name and "Creates a new panel at …".)

Three tablets, for example: `hallway`, `kitchen` and `office`.

A brand-new panel starts with an empty screen and only the settings gear, and its room bar is hidden. That's normal:
give each panel its look: **Panels → Setup → (the panel) → Look & layout** — pick a ready-made **Home** layout, or open
the **layout builder** to arrange cards yourself (computer only; it has its own **Save**). Your changes on a panel's
Setup tabs wait in a bar at the bottom (*2 changes waiting*) until you press **Save**; then they go to the panel at once.

Then switch on its room bar: **Look & layout** → **Room bar** → **Show the room bar** → **Show**, and **Save**. Now the
panel shows a Home page and a button per room.

(Screenshot: Look & layout with the Home layouts and Room bar → Show.)

Every Home layout has a **Weather** card. It shows **+ Add a place** until your hub has a weather device
([hubitat.md](hubitat.md#4-weather-optional--warnings-and-the-weather-card-from-hubitat)) or you add a place: tap
**+ Add a place** on the panel, or use **Places** in the layout builder. You can also remove the card there.

## 5. Each tablet

Any Android tablet with **FreeKiosk** works best (it keeps the screen on, starts by itself and lets Skypane wake the
screen or speak alerts). An iPad or any browser works too. If you skip the MQTT part, you go without screen wake,
volume control and spoken alerts.

**MQTT** is how Skypane tells FreeKiosk to wake the screen, change the volume or speak an alert. Skypane has its own
MQTT broker (the "message broker"); you only copy its login.

**Pair in the browser you'll keep.** The panel's key lives in that browser. Pair a FreeKiosk tablet inside FreeKiosk,
not in Chrome first.

1. Connect the tablet to your home Wi-Fi. (A fixed address in your router isn't needed: the panel follows the tablet,
   not its IP.)
2. Install **FreeKiosk** and allow what it asks for, so it can stay on screen.
3. In FreeKiosk:
   - **Start page / URL:** `http://192.168.1.50/`. On a new tablet that shows the pairing code; once paired, it forwards
     to the tablet's own panel. (Or use the panel's own address, e.g. `http://192.168.1.50/kitchen`, after
     pairing.)
   - **Start on boot:** on. **Kiosk mode:** on. **Keep the screen on:** on. **Zoom:** 100 %.
4. Restart FreeKiosk. It shows **Connect this panel** with a code: approve it (§4). The panel loads with its sky.
5. In FreeKiosk → **MQTT:** broker `192.168.1.50`, port `1883`, the **user and password** from **Manager →
   Integrations → Message broker → Login for devices** (use **Copy user** and **Copy password**, don't type them), and
   the **device name** shown in **Panels → Setup → General → Set up the tablet** (the panel's FreeKiosk device name,
   e.g. `kitchen`).

(Screenshot: the Manager's **Set up the tablet** box, and FreeKiosk's settings screen — a mock-up with example values.)
6. Check the version tag in the panel's lower-left corner: it should match the Manager's (the tag under the Skypane name
   in the Manager's sidebar).

On an iPad: open Skypane's address in Safari (e.g. `http://192.168.1.50/`), **Share → Add to Home Screen** first,
then open Skypane from the new Home Screen icon and connect it there: it shows the code to approve in the Manager.
(A Home Screen app keeps its own storage, apart from Safari, so a tablet connected in Safari would have to be connected
again in the app.) It then opens its panel full screen every time. (No screen wake, volume or spoken alerts there —
sorry iPad users, blame Apple.)

How you know it worked: **Panels → Status** shows each tablet as online, and its **Its tablet** card (Setup) shows the
device and when it was paired. Opening a panel's address on another device — your phone, say — shows *Unable to
connect*: that's the lock doing its job. To look at a panel from a computer, use **Live** in the Manager. The top bar's
panel count catches up after a page reload.

## 6. More logins (optional)

**Admin → Accounts → Add a login** for each person:

- Passwords for these logins need 4 characters or more (the owner's: 8 or more).
- **Family** — their panel, devices, cameras, uploads, guest Wi-Fi. **Limited** — only their own panel. You can fine-tune
  the rights afterwards. **Switch devices** from the Manager is off until you tick it.
- Each login picks its own theme. The language is English for now — more languages are on the way.

## 7. Optional extras

- **Cameras:** UniFi Protect — **Integrations → Cameras**: the console's address and an API key (made in Protect by an
  owner or admin). Cameras that aren't UniFi: **Manager → Cameras → Add camera**, and paste the camera's RTSP, RTMP or
  MJPEG address — e.g. a Reolink, Hikvision or Amcrest RTSP address (the camera's manual calls it an RTSP or stream
  URL), or tinyCam PRO's re-stream `rtsp://<phone>:8083/…`. Skypane has camera video built in; nothing else to install.
  More: [help.md](help.md#cameras).
- **Calendars:** **Integrations → Calendars** — a read-only iCal / ICS link per calendar (Google: *Secret address in
  iCal format*; Outlook / iCloud: their published link). The panels' calendar cards show them.
- **Alerts from Hubitat rules:** the Skypane Helper already made the Skypane Notifier; test it and use it in your rules
  ([hubitat.md](hubitat.md#3-the-skypane-notifier--alerts-from-your-rules-recommended)).
- **Guest Wi-Fi:** the panels show a QR code for guests. With a UniFi console (e.g. a UDM Pro) — **Integrations →
  Guest Wi-Fi console** — Skypane can change the guest password by itself (after guests leave, or every few days), and
  the panels' QR code follows. Without one, type the network yourself on **Guest Wi-Fi** and change the password by
  hand.
- **Help:** the **?** on every page, or **Help** in the sidebar (F1).

## 8. Tell us how it went

**Send feedback** (sidebar; on a phone: More) — a bug, an idea or something confusing. You see the whole report first.
Skypane adds no names, addresses or passwords of its own; what you type is sent as you typed it, so leave out private details.

(Screenshot: the Send feedback preview, "What will be sent".)
