# Changelog

## 3.0.3

### Weather
- **A weather card for another place shows that place's weather,** not the house's.
- **Changing °F / °C or mph / km/h** in the Manager changes the panel at once.
- **Today moves on at midnight,** and a forecast shows one Today.
- **"7 days" really shows 7.**
- When the weather can't be fetched, the card says so in plain words.
- **A place west of the panel keeps its own Today** after the panel's midnight (New York on a panel in Amsterdam).
- When the Hubitat weather leaves gaps that Open-Meteo fills, the card says "From your Hubitat weather and Open-Meteo".

### Cards and the layout builder
- **A new card starts small;** then make it as big as you need.
- **The words and icons keep their own size** (Style: Icons, Text). A bigger card only gives them room; a
  smaller one first takes the empty space.
- **"Grow and shrink with the card"** (off by default): on, what's inside follows the card from its size then.
- **The Guest Wi-Fi card** keeps its QR code large and wraps a long network name; on a tall or square card the QR
  code sits above the words.
- A few cards (clock, calendar, door locks …) start a little bigger so they're readable straight away.
- An empty Alert note card shows a hint in the builder on what to put in it.
- **Fixed:** "Someone else saved this layout meanwhile" on every save after adding some weather places; switching
  "Grow and shrink" on and off no longer shrinks the card; the Screen list follows Undo.

### The PIN pad
- **PIN pad sound:** a soft tick on each key, the same for every key (Panels → Setup → General; on by default).
- **The screen holds still while the PIN pad is open,** so no tap misses.

### Panels
- **Show the version on this panel:** a switch per panel for the small version tag in the lower-left corner.
- **The System card** uses plainer status words.
- Text you see now uses US English spelling (color, gray, center, license …).

### Integrations
- **Guest Wi-Fi:**
  - A good UniFi key says **Connected** while the guest network is still to be set up, with **Open → set up**.
  - One **Change password now** is enough.
  - The guest network you pick stays shown while Skypane asks the console about it.
  - A change made from the Manager is logged as "changed from the Manager".
- **"Check now"** reports the check, even while something else has a problem; the page then shows what it found.
- **Calendars:**
  - The status follows an added, changed or removed calendar at once.
  - A removed broken calendar takes its Trouble with it, and a new broken link never shows Working.
  - Removing a calendar asks in the Manager's own dialog.
- **Recent** names the settings in words ("UniFi Network API key"), and the side card's lines are no longer cut off.
- **Clearer words:** the UniFi key message doesn't send you to the page you're on, and "since" lines lose their double
  punctuation.

### Opening Skypane by a name; extra devices
- **"Extra names for this server" and "Extra devices the panels may control" left the Manager.** Set the container
  variables `ALLOWED_HOSTS` and `BRIDGE_ALLOW` instead ([install-docker.md](docs/install-docker.md#setting-a-container-variable)).
  - A value saved before keeps working until the container variable is set; `none` clears it.
  - A new container variable needs the container **re-created** (Compose: `docker compose up -d`; Unraid: Edit →
    Apply), not just restarted.
  - **Unraid, updating from before stage 4:** `ALLOWED_HOSTS` or `BRIDGE_ALLOW` left in the template now win over
    the Manager's value — check or remove them. The start-up log says where each value comes from.
- The *Skypane doesn't know this address* page mentions `ALLOWED_HOSTS` for people who want to use a name.

### Upgrading
- Cards that used to enlarge their contents when made bigger now keep words and icons at their Style size — switch
  on **Grow and shrink with the card** to get the old look.

## 3.0.2

### Panels connect with a code now ([panel-pairing.md](docs/panel-pairing.md))
- **Connecting a tablet:**
  - Open Skypane's address on the tablet; it shows a 6-character code.
  - In the Manager, go to **Panels → New panel requests → Approve**, then type the code and a name.
  - The tablet goes to its own panel and opens it by itself from then on.
- **A panel works only on the tablet you approved,** even when that tablet's IP address changes. Each panel has Unlink,
  Move to another panel, Rename, Re-trust, an "Accept new panels" switch, and notices when another device tries a
  panel.
- **The bare address shows a Skypane status page,** with the code for a new tablet. There's no built-in "main" panel any
  more.
- **Upgrading:**
  - The old main panel's look is removed. Your "which devices the panels may switch" rule is kept.
  - For 24 hours your existing tablets are connected automatically on their next visit. "Lock all panels now" ends
    that early. See [upgrade.md](docs/upgrade.md).
- **The panel PIN is set, changed or cleared in the Manager** (Panels → Safety). It asks for your Manager password; no
  old PIN is needed.

### Integrations tell the truth
- **"Working" means the hub, UniFi Protect or the UniFi console really answered with your token or key.** Until then
  the page shows **Checking…**, and it says so when a key is missing.
- **A Connect button for each section** saves and connects that section straight away. Saving a token says "Saved".
- **Addresses:** a bare IP is fine (`http://` is added for you), and a broken one like `192.168.1` is refused.
- Music shows its status too.
- Integrations → Hubitat shows the **last alert from the hub**, so the Notifier's "Test" can be checked before any
  panel is set up.
- The Hubitat driver now imports straight from Skypane. Import's "Failed to fetch" is fixed.

### Panels and the Manager
- **The panel editor has a Save bar:** changes wait until you press Save, then go to the panel at once.
- **Press and hold a light anywhere** (lists, tiles, cards, orbs) for brightness, warm↔cool, **hue** and saturation.
  The room card gets an **Orbs** look, and its tiles no longer shrink long before they need to.
- **A custom theme colour:** a hue slider after the 12 themes.
- **Calendars:**
  - Panels pick up calendar changes within seconds of a check.
  - Choose how often Skypane checks (5–30 min), or press **Check calendars now**.
- **Calendar event icons:**
  - 41 icons, matched on whole words.
  - Edit the words for each icon and drag them into order (Integrations → Calendars → Event icons).
  - See [calendar-icons.md](docs/calendar-icons.md).
- **The cameras page** waits for UniFi Protect's cameras with a message, instead of staying blank until a refresh.
- Rooms: "Build one" asks whether the room page is for every room or one room, and whether to start from an empty page.
- **Smaller fixes:**
  - Guest Wi-Fi's "Change password now" confirms when it's done.
  - Who's home starts with the right people.
  - The notification light can be the tablet's own light.
  - The camera screen drops its "views come from UniFi Protect" line.
  - Feedback reports hide IP addresses again.

## 3.0.1

- **The Manager moved to `/admin`** (e.g. `http://192.168.1.50/admin/`). The old address `/manage` now shows a short
  "the Manager moved" page with a link — it doesn't forward, so update your bookmarks and any home-screen icon. On Unraid, set the container's
  **WebUI** to `http://[IP]:[PORT:80]/admin/` ([upgrade.md](docs/upgrade.md)). Panels keep their addresses.
- A panel you called **admin** in 3.0 now opens at `/admin-panel`; its settings, layout and alerts stay. Health and the
  Overview say so until its tablet opens the new address. `admin` and `manage` can't be used for new panels.
- The layout builder's preview no longer shows the house's alerts or the weather card's warning ribbon.
- Send feedback says plainly that a report becomes a public GitHub issue — the repository is public now. The licence
  says anyone may read the source (all rights stay reserved).
- The Unraid template's icon comes from the GitHub repository.
- Wording: the weather card's **+ Add a place** (the same name everywhere), a plainer message when the place search
  can't be reached, and the health pill says "1 issue" / "3 issues".
- The image build uses the current GitHub Actions (Node 24).
- Addresses with a part ending in a dot or a space are refused (on Windows they could reach a file by another name).

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
