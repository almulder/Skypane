# Changelog

## 3.0.6

- **Devices → Detailed:** the Protocol column (from the Skypane Helper) now shows at every screen width. ID and
  Driver hide first on narrow screens.
- **Notifier driver 3.0.6:** only the version number changed, so you can try the Helper's "Update the driver" in
  Integrations → Hubitat.

## 3.0.5

### One blank card for everything
- **Devices and Text are now pieces of the blank card.** + Add gives a Device, Fan, Text, Value or Picture piece.
  Your Devices and Text cards become blank cards on their own and keep their look. List, Tiles and Single item stay
  as Arrange helpers.
- **Grow and shrink with the card:** one checkbox on every card and every piece. It's off by default, so content
  keeps its size.
- **Pieces have no borders**, and labels wrap and shrink before they're ever cut off.
- **Editing:** a double-click edits a card where it is; zoom is a builder option, off by default. Grip dots at a
  card's top-left move it. Edge margin (0 / 8 / 16 / 24 px) sits next to Spacing.
- **Icons:** the background can be a Circle, a Rounded square or None, with transparency, and it's sized to the
  icon's larger side. Icons are white by default. The icon and the name each have their own color.
- **Undo and redo everywhere:** buttons, plus Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (⌘ on a Mac).

### Deleting safely
- **In use:** something used on a panel or card can't be deleted. The message lists each place, as links. The lists
  show an In use badge.
- **Trash:** deleted things are kept for 7, 14 or 30 days, with Restore, Delete now and Empty. Big things ask first;
  small things go at once, with Undo in the message.

### Cards
- **Notifications:** the Alert note and Notifications cards are now one card (Compact or List). It holds up to 100
  alerts, then "+ N more", and keeps its place when a new one arrives.
- **System card:** pick its rows. Each shows OK or Trouble, and there's a new Notifier driver row.
- **Rooms card:** several rooms on one card. Room pages get Back, with a history. A Home button stays next to the
  security status when the room bar hides. A room hidden from the bar can still be opened from a Rooms card.
- **Calendar card:** "Same as the panel" or choose its calendars. A card can only narrow the panel's list.
- **Batteries:** your own device group with its own low level, and "Always show" or "Only when low".
  **Power now:** pick the devices.
- **Pictures:**
  - Slide show and Picture are now one card, with 10 transitions plus Mix (Match is marked "try").
  - Rotating background pictures per panel or page, with a dim setting.
  - A screensaver uses the same engine; the touch that wakes it never presses anything.
  - Read-only picture folders, from a /pictures folder you map in Docker / Unraid.
- **Network map:** fills the whole card. Snap is on by default. "Arrange for me" spreads it out. There are sizes for
  the parts, the names and the title, and moves can be undone. Port tags never cover names, and crowded maps are much
  lighter.
- **New UniFi cards:**
  - **UPS / battery backup**, from a UniFi UPS or a NUT server. It only reads, and its password is kept secret.
  - **Doorbell**, with three looks. Rings come from your Hubitat doorbell, and the message buttons work only on the
    doorbell itself.
  - **Activity feed.**
- **UniFi values** can be pieces. Weather places can be dragged into order.

### Lists & notes
- A Manager page for lists and notes: rename, delete empty lists, an "On the panel" preview and Undo. The quick-add
  chips are bigger and never add twice.
- **Hubitat commands** (notify text to the Skypane device): `add to list: Shopping, milk`, `remove from list: …`,
  `tick: …`, `pin note: …`. A command that doesn't work out is shown as the original alert, so nothing is lost.

### Hubitat and tablets
- **Notifier driver 3.0.5:** it reports its version. Integrations → Hubitat says "Up to date" or how to update.
- **Skypane Helper app (new, optional):**
  - link it with a one-time code;
  - it reports each device's protocol, last activity and health;
  - it updates the Notifier driver from the Manager. Every update is signed, and your hub login stays on the hub.
  - It installs from Apps Code or Hubitat Package Manager.
- **LED agent:** a guide for tablets without root, a download under Help & guides, and self-update. Each update is
  signed, the agent is pinned to its own Skypane server, and it falls back to the old build if a new one fails.

### Upgrading
- The Manager's "What changed" note lists every card that moved. Earlier versions are backed up first, and anything
  that can't move is left as it was.
- **Redeploy the bridge** (it's part of the image) to get the higher alert limit (120) and the list commands.

## 3.0.4

### Devices card
- **One Devices card** replaces Device, Devices, Value, Button, Lock, Fan and Scene buttons: lights, switches,
  readings, buttons, locks, fans and scenes as a List, Tiles, Freeform or one Single big item.
- **Each item has its own settings,** with a live preview on top and four tabs: Device · Actions · Look · Advanced.
  Click an item (or double-click the card) to pick it.
- **What a press does:** on / off when the device can switch (the Dyson: Fan on / Fan off), else one of its own
  commands in plain words (Auto, Speed 1–10…). Another device, a room or a page is under "Something else…". **Hold**
  opens a fly-out: tick which of its options show (up to 8). A double-tap is optional.
- **Ask before doing it** (Advanced): "Turn on Desk fan?" Yes / Cancel first. A garage door always asks, then the PIN.
- **Look:** an icon picker with its search on top (all icons, drawings, your own pictures; Animated), a motion while
  the device is on, a round background or none, Color when on (Automatic or any color), Icon size and Text size, and
  the text on any side.
- **Freeform:** drag an item anywhere and resize it from any edge or corner; X / Y / W / H follow; the arrow keys move
  it (Shift: 10 at a time). **Tiles:** drag a tile's right or bottom edge to span more tiles. **List and Tiles:** drag
  an item to a new place.
- **Single big item with several items:** swipe left or right on the panel; dots show where you are.
- **The air purifier in Auto shows its speed:** "Auto · Speed 4", else "Auto".
- Fixed: "Switch a device on and off" no longer asks for another device, and the Dyson is no longer left out.

### Builder
- **Device pickers:** the search is the list's first row. Type any words (name, room or kind, in any order); ↑ ↓ and
  Enter pick. Grouped by room, each with its kind's icon.
- **Cards resize from all four corners and all four edges.** A selected card's settings start with its X / Y / W / H,
  in cells of the panel's 192 × 128 grid; they follow a drag and move the card as you type.
- **Pop-ups** (device, icon and color pickers) scroll on their own; Esc or a click outside closes them.
- **The blank card is edited where it is:** a double-click (or "Edit pieces") no longer zooms; the rest dims a little
  and "Editing pieces — Esc to finish" shows on top.
- **Its pieces go anywhere:** no grid; drag and resize from any edge or corner; X / Y / W / H in % of the card; the
  arrow keys move 1 % (Shift: 10 %); Bring forward / Send back; Undo / Redo for every move. **Alignment guides** show
  when an edge or a middle lines up — nothing snaps.

### Garage doors
- **Garage door sets, Single to Quad:** a Picture & values card's garage (and a blank card's garage piece) takes 1–4
  doors, each Single or Double-wide, each with its own open and close times. Each door is tapped on its own (asked
  first, then the PIN).
- **A vibration or tilt sensor on a door (optional):** "Closing…" while it shakes, "Opening…" when it shakes again with
  no "closed" (the safety eye sent it back up), "Partly open" when it stops. With or without one, the close time
  running out with no "closed" shows "Not closed", in amber. The contact saying closed always wins.

### Bins / Trash
- **Bins / Trash** (replaces Bin day): wheelie, recycling and inside bins, bags and bulky items on one card, each drawn
  a little fuller every day until pickup day. Name each one; 10 colors, whole bin or lid only; Still or Animated
  ("Calm" for old tablets); or your own picture. The line on top: "Tomorrow is trash day" / "Trash day today" / the
  next pickup.
- **Schedules:** weekly, every N weeks, even / odd weeks, the 1st–4th or last weekday of the month, seasonal; the time
  the truck comes. **Holidays** (one list for the house): per bin, nothing / next day / next work day / same day next
  week / the rest of that week a day later / no pickup.
- **The reminder:** from a set time each due bin is a Reminder with its button (Taken out, Emptied or At the curb);
  pressing it clears that bin on every panel. An optional alarm chimes and says "Don't forget the bins".
- The animated bins are after skyrotter's Poubelle Card (MIT) — our own drawings; see CREDITS.md.

### Countdown & timers
- **Countdown & timers** (replaces Countdown and Timers): countdowns to a date and time, and timers (one per kid, say)
  that start from the house's presets with +1 min, Pause / Resume and Stop. Any mix of Days · HH · MM · SS.
- **A timer on several panels:** Linked (on that panel's card too, or runs with its own timer of the same name) or
  Notification only (it counts down there). It goes off on both.
- **"Timer up"** fills the screen in the timer's color with its chime or its words, and closes itself after its
  seconds. It looks like a level 5 but isn't one: no PIN, no alert level.
- **PIN-protect timers on this panel:** +1 min, Pause, Resume and Stop ask for the panel PIN; "Presets still start
  without the PIN" is on unless you switch it off. A lock shows next to the card's title.
- **Lights that flash on "Timer up"** (up to 4): on and off twice, then back as they were — only lights this panel may
  switch without the PIN, through the same checks as a tap.
- **House speakers on "Timer up"** (up to 3): Hubitat speakers with a `speak` command (SpeechSynthesis) say the timer's
  words. The Skypane service sends it, not the panel, through the bridge's usual checks (the allowlist and never
  list); the bridge sends `speak` only from this feature and only to a device that has it. A volume only for a speaker
  with setVolume.
- **"Timer:" from a Hubitat rule:** send the Skypane Notifier "Timer: Emma, Free time" (a preset) or
  "Timer: Pizza, 0d00:20" (days, hours:minutes) and every timer with that name starts. It isn't shown as an alert —
  the bridge clears it on the hub. No driver update needed.

### UniFi
- **Nine Network cards** in the builder, each with a Style (A / B / C) and its own colors: Internet, Network map,
  Status tabs, Clients & gateway, UniFi devices, PoE power, Clients, Client log and Network values. Hidden on the
  panels while UniFi Network isn't connected (the builder's canvas says why).
- **Setup:** the console address and UniFi Network API key under Integrations → Guest Wi-Fi console;
  **Integrations → UniFi Network** says Connected, or Trouble in plain words.
- **Reads your UniFi console only while someone looks:** a panel with a Network card or the Manager in the last 2
  minutes, then every 30 seconds. No API key, IP address, MAC address or serial number goes to a panel or the Manager.
- **Internet lines** by the name UniFi gives each one (WAN 1 / WAN 2 underneath); rename a line and pick its type;
  ISP, speed, latency, a 24-hour graph and uptime bars.
- **The gateway, switches, access points and the UPS:** model, online, CPU and memory, temperature, PoE watts and
  budget, the busiest PoE ports, firmware up to date.
- **Network map:** which device plugs into which; drag the parts where you want them in the builder. The UNVR and the
  cameras are on the map, never in the Clients list.
- **Clients** with UniFi's own names, network, Wi-Fi, signal and an icon by type. **Client log** (joined, left, moved)
  also in Health → Timeline → Network. **A new device** is a small notice on the panels — not one of the 1–5 alerts.
- **UniFi Network settings** (admins): line names and types, the new-device notice and its panels, guests on the
  panels, the PoE warning (50–100 %), the client log and how long it's kept. Saved at once, no restart.
- **Network values** anywhere: Internet, the active line, ping, the gateway, PoE watts, clients, UniFi devices online.
- Not yet: Recordings & NVR (Protect's API key can't read the recorder's storage); UniFi values inside a Devices
  card's value picker (the Network values card does that for now).

### Weather
- **Your own OpenWeatherMap key (optional),** in Integrations → Weather: One Call 3.0, fetched once for the house every
  15 minutes and shared by every panel, at most 800 calls a day. The key is shown only as set or not set, never sent
  to a panel, never logged.
- **14 days:** what OpenWeatherMap or the Hubitat device doesn't have comes from Open-Meteo (a small blue dot).
- **Each weather card picks its source** ("Weather from"): Automatic, Built-in (Open-Meteo), Hubitat device or
  OpenWeatherMap. Automatic works as before. A source that isn't connected is grayed out, with a link to connect it.
  The built-in layouts' weather has the same choice (`weather.src`).
- **"Use it for the weather card" is gone** from Integrations; its saved value is what Automatic follows.
- **7 or 14 days** on a weather card; 14 show as two rows of 7.
- **Tap a day for its hours,** hour by hour in a row to scroll; fetched only when tapped. Can be switched off per card.
- **OpenWeatherMap's warnings in the panels' alerts,** like the weather device's: the same levels, panels and
  dismissing. A warning both report shows once.

### Display settings
- **Units and date formats for the whole house:** Manager → Display settings (the admin). Temperature, distance and
  speed, pressure, rain, the date and time format, the first day of the week, and the decimals.
- **Every panel follows it** (clock, calendar, events, alerts, logs, weather, thermostats, room temperatures) within a
  few seconds. A panel can still keep its own temperature and wind units. Health → Timeline uses it for every login.

### Cameras
- **Choose what each camera's label shows:** Cameras → a camera → Label. Name, room, your own text, any mix, or
  nothing. The same on a tile, the Cameras page and full screen. A camera button card shows it too.

### Room bar
- **Move it in the layout builder:** point at it and drag it by its dots to any edge; Esc puts it back. Saved with the
  layout; Undo takes it back. With no card selected, its settings sit on the right.
- **A Room bar tab in Panels:** show or hide it, its edge, style, names, auto-hide and the rooms on this panel (moved
  here from Rooms & devices and Look & layout).
- Every bar style is checked on all four edges.

### Manager
- **"What changed in 3.0.4" on the Overview** (admins, once each): every card the upgrade replaced, panel by panel.
- **The version** ("v3.0.4") faintly in the lower-right corner of every page, on the sign-in page and on the panels;
  point at it in the Manager for the exact build.
- **Drag to reorder** wherever there's ▲ ▼ (Rooms & devices, Camera views, Event icons): a ⠿ grip for mouse or finger;
  Esc cancels, Undo puts it back; Alt+↑ ↓ or Space on the keyboard.

### Upgrading
- **Old cards become their newer versions by themselves** at the first start, each panel backed up first (in
  `backups/`; the saved cards in `house/card-templates.v303.json`): Device, Devices, Value, Button, Lock, Fan and Scene
  buttons → Devices; Bin day → Bins / Trash (its bins and schedules, Still, no alarm); Countdown → Countdown & timers
  (its date); a Timers card → one timer with its minute buttons as presets. Each keeps its place, size and settings,
  and a moved Devices card keeps its old look until you press "Use the new look".
- **The notice:** each admin sees "What changed in 3.0.4" once on the Overview — old → new, which screen, the card's
  name, a link to each panel's layout, the saved cards, and anything that couldn't move (it still works). "Got it"
  hides it; Quick links → "What changed in 3.0.4" shows it again. The panels show nothing new — only their version.
- **Weather cards keep their source:** each one (on every panel, the built-in layouts and your saved cards) gets the
  source it showed — "Hubitat device" where "Use it for the weather card" was on, "Built-in (Open-Meteo)" where it was
  off.
- **The house's units** start as the ones most panels showed; a panel that showed others keeps them as its own. The
  date format starts on Automatic.
- **The room bar can no longer be moved on the tablet:** the "Arrange on the panel too" switch is gone (also for a
  room's devices). Every panel keeps its edge.
- A blank card from before keeps its look: its pieces move from the old 24 × 24 grid as it's opened or saved.
- **The Skypane Helper app is not in this release.**
- The Hubitat driver is unchanged: no driver update.

### Defaults we chose (tell us if you want them different)
- Devices card: the item kinds keep their names (Value, Switch, Button, Lock, Fan, Scene); a new fly-out gets a short
  set (the Dyson: Auto, 2, 4, 6, 8, 10, Off); a click in the builder only picks an item; a hold never unlocks;
  X / Y / W / H in % of the card; a tile spans up to 4 × 4; an animated icon moves the whole time the device is on.
- Blank card: guides on (remembered in this browser); pieces in % of the card, whole cards in grid cells; cards keep
  snapping to the grid (Alt for free); a piece always stays inside its card.
- Timers: no lights and no house speakers on "Timer up"; the speakers' volume left as it is; up to 4 lights and 3
  speakers; "Presets still start without the PIN" on.
- Bins / Trash: the reminder from 19:30 the evening before; the alarm off (21:00 when on).
- UniFi: no ISP speed-test button; the graph covers 24 h; client log kept 7 days; the new-device notice on every panel;
  guests hidden on wall panels; PoE warning at 80 %; PoE ports named by the device plugged in; cameras not in the
  UniFi devices list.
- UniFi cards: Style A everywhere; the graph starts Combined with latency on; all side-panel pieces; the map left to
  right, orbs follow the traffic, glow 60 %, snap to grid off, ports shown on a tap, Protect gear on with a camera
  bubble per switch; Network values show Internet, the active line, ping, Wi-Fi clients and UniFi devices; the
  Protect tab opens the cameras page.
- Weather: a new card on Automatic; "Tap a day for its hours" on.
- Room bar: each panel keeps its own edge (not one for all panels); the Rail style fills the whole side on the left
  or right.

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
