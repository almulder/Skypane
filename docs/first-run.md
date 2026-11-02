# First run: your house and your tablets

This walks you from an empty Skypane to tablets on the wall. It assumes Skypane is installed
([install-unraid.md](install-unraid.md) or [install-docker.md](install-docker.md)) and connected to Hubitat
([hubitat.md](hubitat.md)).

In the examples Skypane is at `http://192.168.1.50/`. With Docker, add `:8088` after the address everywhere —
`http://192.168.1.20:8088/`, `http://192.168.1.20:8088/kitchen` and so on (the FreeKiosk start page too). Use a computer for
setting up — the Manager works on a phone too, but some parts (Integrations, the layout builder) are computer-only.

## 1. The owner login

You did this already at the end of the install guide: the first visit to the Manager (`http://192.168.1.50/admin/`)
creates the **owner** login. The owner is an admin who can't be removed. You sign in with it straight away.

Lost the password later? See [troubleshooting.md](troubleshooting.md#i-forgot-the-owner-password).

## 2. Check your devices

**Sidebar → Devices.** It lists everything Hubitat shares through Maker API, grouped by room (the rooms come from
Hubitat). Click a device to open its settings.

- **Shows as:** what each device is on the panels (light, fan, lock, door, sensor…). Skypane guesses; fix the ones that
  are wrong. **Hidden** keeps a device off the panels.
- **Room:** the room it's shown in.
- A device that opens something (a garage door, a water valve) always asks for the panel PIN. You can make others ask
  too (**Ask for the PIN**).

Changes save as you make them; the panels follow within seconds.

## 3. The panel PIN

One PIN protects every panel's settings, the garage door, valves, unlocking and the alarm. Set it on the main panel —
any browser will do, the computer you're on is fine:

1. Open `http://192.168.1.50/` (the main panel). In a computer browser this is a preview of the panel: it works, but
   it doesn't count as a tablet checking in (see §5).
2. The **settings gear** → **Panel** → **Panel PIN** → **Set PIN** → 4 to 8 digits, then the same PIN again to confirm.

**A sample house?** With no hub connected yet, a panel shows a made-up sample house — **John & Jane**, sample rooms,
devices and calendar events — so you can see how it looks. It isn't anyone's data. Your own devices take its place once
Hubitat is connected, and your calendars replace the sample events once you add one (**Integrations → Calendars**).

(Screenshot: the main panel's settings gear → Panel → Panel PIN.)

## 4. Your panels — one per tablet

A **main panel** already exists: its address is `http://192.168.1.50/` (its FreeKiosk device name is `skypane`).
For each other tablet, add a panel:

1. **Panels → Add panel.**
2. **Panel name:** e.g. `Kitchen panel`. Skypane makes the panel's web address from it and shows it as you type:
   *This panel will open at `http://192.168.1.50/kitchen`*. That's the address you open on the tablet later.
   - Don't type the tablet's IP address here — Skypane doesn't need it. (If you do, it says so.)
   - Want another web address? **Change the web address**: it starts with a letter, then letters, digits, `_` and `-`
     (at most 32).
3. **Add panel.** It opens. A brand-new panel starts with an empty screen and only the settings gear, and its room bar
   is hidden. That's normal: you give it its look next.

(Screenshot: the Add panel dialog with the address preview.)

Three tablets, for example: the main panel (hallway), `kitchen` and `office`.

Give each panel its look: **Panels → Setup → (the panel) → Look & layout** — pick a ready-made **Home** layout, or open
the **layout builder** to arrange cards yourself (computer only; it has its own **Save**).

Then switch on its room bar: **Look & layout** → **Room bar** → **Show the room bar** → **Show**. Now the panel shows a
Home page and a button per room.

(Screenshot: Look & layout with the Home layouts and Room bar → Show.)

Every Home layout has a **Weather** card. It shows **+ Add a place** until your hub has a weather device
([hubitat.md](hubitat.md#4-weather-optional--warnings-and-the-weather-card-from-hubitat)) or you add a place: tap
**+ Add a place** on the panel, or use **Places** in the layout builder. You can also remove the card there.

## 5. Each tablet

Any Android tablet with **FreeKiosk** works best (it keeps the screen on, starts by itself and lets Skypane wake the
screen or speak alerts). An iPad or any browser works too — skip the MQTT part. You then go without screen wake, volume
control and spoken alerts.

**MQTT** is how Skypane tells FreeKiosk to wake the screen, change the volume or speak an alert. Skypane has its own
MQTT broker (the "message broker"); you only copy its login.

**Which browsers check in:** a tablet running FreeKiosk with the panel's address, or any browser with `?panel` at the end
of the address (e.g. `http://192.168.1.50/?panel`). The same address opened in a computer browser without `?panel` is
only a preview: it shows and works like the panel, but **Panels → Status** keeps saying *Never checked in*.

1. Connect the tablet to your home Wi-Fi, and give it a fixed address in your router.
2. Install **FreeKiosk** and allow what it asks for, so it can stay on screen.
3. In FreeKiosk:
   - **Start page / URL:** the panel's address — `http://192.168.1.50/` for the main panel, `http://192.168.1.50/kitchen`
     for Kitchen. (Each panel shows it under **Panels → Setup → General → Set up the tablet**.)
   - **Start on boot:** on. **Kiosk mode:** on. **Keep the screen on:** on. **Zoom:** 100 %.
   - **MQTT:** broker `192.168.1.50`, port `1883`, the **user and password** from **Manager → Integrations → Message
     broker → Login for devices** (use **Copy user** and **Copy password**, don't type them), and the **device name** shown in **Panels → Setup →
     General → FreeKiosk device name** (main panel: `skypane`; others: their address, e.g. `kitchen`).
4. Restart FreeKiosk. The panel loads with its sky.

(Screenshot: the Manager's **Set up the tablet** box, and FreeKiosk's settings screen — a mock-up with example values.)
5. Check the version tag in the panel's lower-left corner: it should match the Manager's (the tag under the Skypane name
   in the Manager's sidebar).

On an iPad: open the address in Safari and add `?panel` to it (e.g. `http://192.168.1.50/kitchen?panel`), then
**Share → Add to Home Screen** for a full-screen panel. (No screen wake, volume or spoken alerts there.)

How you know it worked: **Panels → Status** shows each tablet as online. A panel you only opened in a computer browser
without `?panel` stays *Never checked in* — that's expected. The top bar's panel count catches up after a page reload.

## 6. More logins (optional)

**Admin → Accounts → Add a login** for each person:

- Passwords for these logins need 4 characters or more (the owner's: 8 or more).
- **Family** — their panel, devices, cameras, uploads, guest Wi-Fi. **Limited** — only their own panel. You can fine-tune
  the rights afterwards. **Switch devices** from the Manager is off until you tick it.
- Each login picks its own theme. The language is English for now — more languages are on the way.

## 7. Optional extras

- **Cameras:** UniFi Protect — **Integrations → Cameras**: the console's address and an API key (made in Protect by an
  owner or admin). Any other camera with an RTSP stream — **Cameras → Setup → Add camera**. (RTSP is the video link most IP cameras
  offer; the camera's manual calls it an RTSP or stream URL.) Skypane has camera video built in; nothing else to install.
- **Calendars:** **Integrations → Calendars** — a read-only iCal / ICS link per calendar (Google: *Secret address in
  iCal format*; Outlook / iCloud: their published link). The panels' calendar cards show them.
- **Alerts from Hubitat rules:** install the Skypane Notifier ([hubitat.md](hubitat.md#3-the-skypane-notifier--alerts-from-your-rules-recommended)).
- **Guest Wi-Fi:** with a UniFi console (e.g. a UDM Pro) — **Integrations → Guest Wi-Fi console**; or type the network
  yourself on **Guest Wi-Fi**. The panels show a QR code for guests.
- **Help:** the **?** on every page, or **Help** in the sidebar (F1).

## 8. Tell us how it went

**Send feedback** (sidebar; on a phone: More) — a bug, an idea or something confusing. You see the whole report first.
Skypane adds no names, addresses or passwords of its own; what you type is sent as you typed it, so leave out private details.

(Screenshot: the Send feedback preview, "What will be sent".)
