# Changelog

## 3.0.0 — the tester release

The first Skypane anyone can install. Welcome, testers — thank you for trying it.

### What Skypane does

- **Wall panels** on any tablet: rooms, lights, fans, shades, locks, the thermostat, garage doors and valves (with a panel
  PIN), cameras, calendars, the weather and an animated sky that follows the real one. Each panel has its own layout.
- **The Manager** on a computer or phone:
  - **Overview:** the house at a glance, alerts waiting, mode and alarm.
  - **Devices**, **Panels** (status, setup, open a panel live, a benchmark per tablet), **Cameras**,
    **Backgrounds / Icons / Cards**.
  - **Accounts:** several admins and an owner, family and limited logins.
  - **Integrations**, **Health** with a timeline, and **Help** on every page.
- **The layout builder:** drag cards onto a panel, resize them, many card types, a live load estimate for each tablet.
- **Hubitat** through Maker API and its local event socket: the house model builds itself from your hub.
  - Alerts come from your own rules (the Skypane Notifier driver).
  - Modes and Hubitat Safety Monitor work with the panel PIN.
- **Switching from the Manager:** everything a panel can do except unlocking, with the same PIN rules.
- **Guest Wi-Fi:** a QR code card for guests. While guests stay, panels can lock or blur their calendar.
- **Built in:** an MQTT broker, camera video (go2rtc, UniFi Protect or any RTSP camera), automatic backups. Secrets
  (the Hubitat token, camera keys) never reach a browser or a log.

### New in 3.0

- **Send feedback:** report a bug, an idea or something confusing from the Manager. It's filed for you — no GitHub
  account needed. You see everything first. Skypane adds no names, addresses or passwords;
  what you type goes as you typed it.
- **Ready for other languages:** every word now comes from a string table. English ships now; more languages follow.
  Each login and each panel can have its own language. See [docs/translating.md](docs/translating.md).
- **Install guides:** [Unraid](docs/install-unraid.md), [Docker / Compose / Synology](docs/install-docker.md),
  [Hubitat](docs/hubitat.md), [first run](docs/first-run.md), [troubleshooting](docs/troubleshooting.md),
  [updating](docs/upgrade.md).
- **New installs:**
  - The container and the main panel's FreeKiosk device name default to `skypane`.
  - The Skypane Notifier driver installs fresh (namespace `skypane`).
- **Weather from Hubitat:** pick a weather device such as the OpenWeatherMap-Alerts driver (Integrations → Weather).
  Its tornado, flood and storm warnings show on the panels as alerts, and its weather fills the weather card's Home tab;
  Open-Meteo stays the fallback. See [docs/hubitat.md](docs/hubitat.md#4-weather-optional--warnings-and-the-weather-card-from-hubitat).
- **Buy me a coffee:** on the sign-in page, in the top bar and in Help → About.

### Known limitations

- English only for now.
- The image is for x86-64 (Intel / AMD) machines. Not yet for a Raspberry Pi or an ARM NAS.
- Tested on Android tablets with FreeKiosk and in browsers. iPhone / iPad Safari is tested only in a phone-sized
  browser.
- Music: the panels' Music button opens the separate Sonos Panel page; there's no built-in music player yet.
- Unlocking a door from the Manager isn't possible (on purpose).
- Keep Skypane on your home network — no remote access built in.
- Panels aren't paired with their tablets yet: anyone on your home Wi-Fi who knows a panel's address can use that panel
  (the panel PIN still guards doors, the garage, valves and the alarm). Keep guests on a separate guest Wi-Fi.
- The layout builder's preview address (a panel's address with `?design=1`) shows the panel without guest lockdown.
  Keep FreeKiosk's kiosk mode on, so nobody can type another address on a wall tablet.

### How to report

**Send feedback** in the Manager (sidebar; on a phone: More). If that can't reach the feedback service, press **Copy
report** and send the text to the team another way.
