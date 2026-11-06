# Skypane Help

The Manager's Help page (**Help** at the bottom of the sidebar, F1, or `/admin/#help/<topic>`), as one file.
Made from `dashboard/manage/help-topics.js` — change the topics there, then make this file again.

## Start here

<a id="feedback"></a>
### Sending feedback

*Where: Sidebar → Send feedback (on a phone: More)*

Found a bug, have an idea, or something is confusing? **Send feedback** tells the Skypane team — every login can use it, and you need no GitHub account.

1. Pick what it is: **Something's wrong**, **An idea** or **Confusing**.
2. Say what happened in your own words (and, for a bug, what you expected and how to make it happen). Please leave out names, addresses and passwords.
3. Look at **About this install**: the Skypane version, the page you came from, your browser, theme and language, and a few counts (panels, devices, cameras, logins). Untick anything you'd rather not send.
4. Check **What will be sent** — exactly that, nothing more — and press **Send**.

Your Skypane server sends it to the Skypane feedback service, which files it as a **public** issue on GitHub (anyone can read it) and gives you its number ("Thanks — reported as #12"). With it goes a random number for this install, so the team can see which reports come from the same place — it doesn't say who you are.

Never sent: your devices', rooms', panels' or people's names, addresses, passwords, PINs, settings or the activity log.

> **Tip:** No internet on the Skypane server, or the service is busy? Press **Copy report** and send the text another way.

See also: [About Skypane](#about)

<a id="about"></a>
### About Skypane

Skypane turns a wall tablet into a dashboard for your Hubitat home: lights, fans, locks, the thermostat, cameras, calendars, the weather and an animated sky.

This page — the **Manager** — is where you set it all up from a laptop or a phone. The tablets only show what you set up here.

> **Note:** Skypane is a work in progress. Things change often, and some parts are still rough. Your feedback is wanted: what is confusing, what is missing, what broke — **Send feedback** in the Manager files it for you.

**What it works with**

- **Hubitat** — every device, room and mode comes from your hub (through Maker API). Alerts come from Hubitat rules too ([Alerts come from Hubitat](#alerts-hubitat)).
- **Cameras** — UniFi Protect cameras show up by themselves. Other cameras work too (an RTSP, RTMP or MJPEG address); the video is played through the built-in go2rtc ([Cameras: Setup, your own cameras and views](#cameras)).
- **Switchboard** — another project by the same author: a Hubitat app for announcements, notifications and sirens. It is also still in development.
- **Sonos Panel** — a page by the same author for people with a Sonos system. A panel's **Music page** setting can open it from the panel's Music button ([A panel's General settings](#panel-general)).

Enjoying Skypane? It's built in the author's spare time — a coffee helps keep it going. The link opens the author's page in a new tab; the Manager's top bar (☕) and the avatar menu have it too. [Buy me a coffee](https://buymeacoffee.com/almulder)

Version: the small tag under the Skypane name at the top of the sidebar — open it with **›** (for example v3.0.4: the release number — point at it to see the exact build). The same number sits faintly in the lower-right corner of every page, and on the sign-in page; the tablets show theirs in the lower-left corner. **Send feedback** sends both the version and the build ([Sending feedback](#feedback)).

See also: [Getting started](#getting-started) · [Finding your way around the Manager](#find-your-way)

<a id="getting-started"></a>
### Getting started

The usual order for a new house:

1. **Sidebar → Admin → Integrations**: fill in how Skypane reaches Hubitat (and UniFi Protect, if you have it). Press **Save and restart**. ([Integrations](#settings-admin))
2. **Devices**: check what each device shows as and which room it is in. Fix the ones that are wrong. ([Devices: the Basic view](#devices))
3. **Panels → Add a panel**: one panel per tablet. A new panel starts blank. ([Add a panel (a new tablet)](#add-panel))
4. Open the panel → **Look & layout**: pick a Home page layout, or build your own in the layout builder. ([Look & layout: theme, Home page, room pages](#look-layout), [The layout builder: the basics](#builder-basics))
5. Set up the tablet: point its kiosk app at the panel's address. ([Set up a tablet (FreeKiosk)](#tablet-setup))
6. Optional: calendars, cameras, alerts from Hubitat, more logins. ([Calendars](#calendars), [Cameras: Setup, your own cameras and views](#cameras), [Alerts come from Hubitat](#alerts-hubitat), [Accounts and permissions](#accounts))

> **Tip:** Changes in the Manager save as you make them (except the layout builder, which has its own **Save**). The panels pick them up within seconds.

See also: [About Skypane](#about) · [Finding your way around the Manager](#find-your-way)

<a id="find-your-way"></a>
### Finding your way around the Manager

The **sidebar** on the left has every page. The **top bar** has the health pill, search, the theme and your avatar.

- **Sidebar** — icons only until you open it: **›** opens it over the page, the **pin** keeps it open (the **[** key does too), **‹** closes it again. Point at an icon to see its name.
- **Overview** — the house at a glance: the health, the alerts waiting on the panels, what needs a look. The Manager opens on it ([The Overview](#overview)).
- **Devices** — every Hubitat device: what it shows as, its room, PIN and picture. Also **Rooms** and **Groups & rules**.
- **Panels** — each tablet's own settings and layouts.
- **Manage** — **Cameras**, **Backgrounds**, **Icons** and **Cards**.
- **Admin** (the admin only) — **Accounts**, **Integrations** and **Guest Wi-Fi**.
- **Help** — at the bottom of the sidebar (or F1): this page. Search at the top; Esc clears the search, Esc again closes Help.
- The health pill — a dot for the hub, the broker, the cameras and the panels: what isn't working right now ([Health and the health pill](#health)).
- **Search** (Ctrl K) — pages, devices, panels and a few commands; type **>** for the commands only.
- Your avatar (top right) — **Your account**, **Change password**, the theme (**Light**, **Dark**, **Skypane night**), **Keep the sidebar open** and **Sign out**.

A login sees only the pages it may use: its own panel, and what the admin ticked for it ([Accounts and permissions](#accounts)).

Most pages have a small **?** next to their title: it opens the help for that page.

See also: [Getting started](#getting-started) · [The Overview](#overview)

<a id="phone"></a>
### Using the Manager on a phone

*Where: Open the Manager on a phone*

On a phone the Manager has its own layout: four tabs at the bottom — **Overview**, **Devices**, **Panels** and **More**. A tab your login can't use is left out.

- **Overview** — the house at a glance: the status ring (the panels online), three tiles, the alerts waiting, what needs a look and the last things that happened. A red number on the tab is the alerts waiting.
- **Devices** — search, then **By room** (a tile per room — tap one to see its devices) or **All devices** (with chips such as **Needs a look** or **Lights**). Tap a device for its sheet.
- **Panels** — swipe through your panels (or use the dots and **‹ ›**). Under the drawing: its status, address (**Copy**) and **Open live**.
- **More** — Cameras, Backgrounds, Icons, Cards, the admin pages, **Your account**, the theme, **Health**, **Help** and **Sign out**.
- **Pull to refresh** — at the top of any page, pull down and let go: the page is read again ("Updated"). Not while a sheet or a camera is open.

**The More pages**

- **Cameras** — every camera, two to a row. Tap one for full screen; swipe sideways (or **‹ ›**) for the next one, **Save picture** keeps the one on screen.
- **Backgrounds** and **Icons** — tap a picture for its sheet: what uses it, rename or remove your own. **Upload** takes a photo from the camera roll (or the camera); it's made smaller on the phone first, and the upload shows its progress.
- **Cards** — what's installed and where it's used. Installing a card is done on a computer.
- **Guest Wi-Fi** — the card, the password (**Show**, **Copy**), **Change password now**, and Show / Hide on each panel.
- **Accounts** (admins) — every login; tap one to **Unlock** it or **Make a sign-in code**. Acting on another admin asks for your password first, as on a computer.
- **Integrations** (admins) — each connection's state and **Check now**; read only on a phone.
- **Your account** — your name, password, sign out the others, the theme.

**Search**

The search icon at the top opens a full-screen search: pages, devices, panels and rooms. A device opens its sheet, a room its devices. Your last searches are kept in this browser (**Clear recent searches** forgets them).

**Sheets and Back**

A device, an alert or the PIN pad opens as a **sheet** from the bottom. Swipe it down, tap outside it, press **✕** — or your phone's **Back** — to close it. With unsaved changes it asks first.

**‹ Back** at the top left takes you out of a room, Health or a More page. Back on the phone does the same.

**What a phone can change**

- A device's **room**, whether it asks for **the panel PIN**, and (the admin) whether **the panels may switch it**. The rest of a device is shown, to change on a computer.
- **Acknowledge** an alert (the admin) — levels 4 and 5 ask for the panel PIN, exactly as on a panel ([The Overview](#overview)).
- Devices aren't switched from the phone yet — use **Open live** on a panel for that.

> **Tip:** Add it to your home screen (Share → **Add to Home Screen** on an iPhone, the menu → **Add to home screen** on Android): it then opens full screen, like an app.

> **Note:** Some things are only on a computer: the layout builder, a panel's Setup tabs, changing the integrations, adding logins and their rights, and installing cards. A tablet gets the computer's layout; a phone held sideways keeps the phone's (the tabs move to the left).

See also: [Finding your way around the Manager](#find-your-way) · [Checking the Manager on your iPhone](#phone-check) · [The Overview](#overview) · [Devices: the Basic view](#devices) · [Open live: the real panel in the Manager](#open-live)

<a id="phone-check"></a>
### Checking the Manager on your iPhone

*Where: Safari on the iPhone*

Skypane is tested in a phone-sized browser on a computer, which isn't the same as Safari on an iPhone. Once, after an update, take about 20 minutes on your own iPhone:

1. Open the Manager in Safari, then Share → **Add to Home Screen**, and open it from there. It should fill the screen, keep clear of the notch at the top and of the home bar at the bottom.
2. Turn the phone on its side. The tabs move to the left, and you stay on the same page; turn it back.
3. Open a device. Swipe the sheet down to close it; open it again and swipe from the left edge (iOS Back) — it closes too.
4. Acknowledge a test alert. The PIN pad shows its own keys — the iPhone's keyboard should never cover it.
5. On **Backgrounds**, upload a photo from the camera roll. It should arrive the right way up, and the progress shows while it uploads.
6. Open **Cameras**, tap one and swipe through them.
7. Turn on Airplane mode for half a minute: "Can't reach Skypane" shows at the top, and goes again once you're back.
8. Settings → Accessibility → Display & Text Size → Larger Text, at its largest: nothing should be cut off.

> **Tip:** Anything odd: a screenshot and a line about what you did is all that's needed.

See also: [Using the Manager on a phone](#phone)

<a id="overview"></a>
### The Overview

*Where: Sidebar → Overview (the Manager opens on it)*

The **Overview** is the first page after signing in: the house at a glance, and everything that needs you. It updates itself every 20 seconds while it is on screen.

- **Health** — the hub, the broker, camera video and the panels: working, needs a look, down, or not set up (gray). **Open Health** for the details ([Health and the health pill](#health)).
- The tiles — **panels online**, **alerts waiting**, **lights on** (with how many doors and windows are open, locks unlocked and devices offline) and **things to check**. Click one to go there.
- **Needs a look** — problems, panels that never checked in or went quiet, devices the hub can't reach and batteries under 15 %. **View** opens that device in Devices, **Open** opens that panel.
- **Alerts waiting** — the alerts from Hubitat that the panels show right now, the worst first, with where they show.
- **Recent activity** — what went wrong and when it was fixed (more kinds of activity come later).
- **Quick links** — the things you do most, for what your login may use.

<!-- (v3.0.5) the notice is 3.0.5's now -->
**What changed in 3.0.5**

After the upgrade to 3.0.5, each admin sees **What changed in 3.0.5** once, on top of the Overview: every card the upgrade replaced with its newer version, panel by panel (old → new, which screen, its name), with **Open the layout** for each panel, your saved cards, and anything kept as it was. Upgraded straight from 3.0.3? The same notice lists the 3.0.4 changes too, each with the card it is now (for example Device → Blank card). Each card kept its place, size and settings, so the panels look the same. **Got it** hides it for your login; **Quick links** → **What changed in 3.0.5** shows it again. A copy of every panel from before the upgrade is in backups/.

**Acknowledge an alert from the Manager**

The admin can clear an alert here — handy when you're not at home, without giving anyone the PIN.

1. Press **Acknowledge** next to the alert (or **Acknowledge all**).
2. A level 4 or 5 alert (damage, life safety) asks for the **panel PIN** — the same PIN the panels use. A wrong PIN counts as on a panel: after 5 wrong ones it waits a little (30 seconds at first), and the pad counts down. With no panel PIN set, it asks once whether to go ahead.
3. The alert is gone on every panel. Hubitat hears it was dismissed from the Manager, and by whom — so a rule can still silence the sirens.

> **Tip:** Other logins see the alerts on their own panels, but only the admin can acknowledge them here.

> **Note:** Alerts and device counts need the message broker and the Hubitat bridge (Integrations). Without them the Overview shows the health only; while one of them is down it says how old the alerts are, and Acknowledge waits until it's back.

See also: [Health and the health pill](#health) · [Alerts come from Hubitat](#alerts-hubitat)

## Panels

<a id="add-panel"></a>
### Add a panel (a new tablet)

*Where: Panels → Add a panel*

Each tablet is a panel, and only a tablet the admin approved can open it ([Connect a tablet: pairing with a code](#panel-pairing)). The quickest way: open Skypane on the new tablet and approve the code it shows with a new name — the panel is made then. To prepare a panel first:

1. Open **Panels** and press **Add panel** (top right; on the Status view also the dashed **Add a panel** tile).
2. Type the panel's name (for example Office panel). Skypane makes its web address from it and shows it as you type: “This panel will open at http://<your server>/office”. Don't type the tablet's IP address — Skypane doesn't need it. Want another web address? Press **Change the web address**.
3. Press **Add panel**. It is **unclaimed**: no tablet yet. It starts **blank**: an empty Home page with only the settings gear, no room bar, LED strip off.
4. Give it a layout: **Look & layout** ([Look & layout: theme, Home page, room pages](#look-layout)).
5. On the tablet open the Skypane address (http://<your server>/). It shows a 6-character code. Approve it under **New panel requests** with this panel's name ([Connect a tablet: pairing with a code](#panel-pairing)).

A web address starts with a letter and may have letters, digits, _ and - (at most 32).

**Remove a panel**

**Panels** → **Setup** → the panel → **General** → **Remove…** (the admin; any panel — there is no built-in main panel). It asks first. Its settings and layouts go. Its tablet goes back to the pairing screen.

See also: [Connect a tablet: pairing with a code](#panel-pairing) · [Panels: the Status and Setup views](#panels-status) · [A panel's General settings](#panel-general) · [Set up a tablet (FreeKiosk)](#tablet-setup)

<a id="panel-pairing"></a>
### Connect a tablet: pairing with a code

*Where: Panels → New panel requests (the admin)*

A panel works only on the tablet the admin approved. Its key stays in that tablet's browser, so a new IP address doesn't matter, and another device that opens the panel's address sees “Unable to connect”.

1. On the new tablet open the Skypane address: http://<your server>/. It shows **Connect this panel** with a 6-character code and what it is (for example Chrome on Android, SM-T500). The code changes every 10 minutes; the request lasts while that screen is open.
2. In the Manager open **Panels**. The tablet is under **New panel requests** (a count shows on Panels in the sidebar). Press **Approve**.
3. Type the code (capitals or not, spaces don't matter) and a name. The line under the name says what happens: it **takes over an unclaimed panel** with that name (its settings kept), or **creates a new panel** at its own address. A panel that already has a tablet is refused — unlink it first.
4. The tablet says “Connected as …” and opens its panel by itself, from then on too.

Five wrong codes cancel the request. **Reject** turns a request down. **Accept new panels** off: new tablets are told pairing is closed.

**A panel's tablet**

Panels → Setup → the panel: the **Its tablet** card shows the device, its last IP, when it was last seen and when it was paired.

- **Unlink device** — the tablet loses its key; the panel keeps its name and settings and is **unclaimed** until a tablet is approved with its name.
- **Move this device to…** — the tablet takes over an unclaimed panel (its name and settings); the panel left behind can be removed.
- **Rename** — only the name; its address and FreeKiosk name stay.
- **Re-trust this device** — after a copy alert: an old copy of the panel's key was used by another device. With **Lock a panel when its key is copied** on, that panel stops until you re-trust or unlink it.

**Notices**

Blocked attempts, a copied key, a tablet that suddenly looks like another device, 5 wrong codes and tablets connected automatically after the upgrade are listed under **Notices** until you mark them read. Nothing is pushed.

> **Tip:** After an upgrade, tablets already in use are connected automatically for 24 hours (the banner says until when). **Lock all panels now** ends that early.

See also: [Add a panel (a new tablet)](#add-panel) · [Set up a tablet (FreeKiosk)](#tablet-setup) · [Safety: PIN windows and unlocking on a panel](#panel-safety)

<a id="panels-status"></a>
### Panels: the Status and Setup views

*Where: Panels → Status / Setup (the switch at the top right, or press V)*

The **Panels** page has two views. The switch at the top right (or the V key) changes between them; your choice is remembered for your login.

**Status: every panel at once**

- Each panel is a tile with a **drawing of its Home page**: its cards as blocks in the panel's color theme, and the room bar on its edge. It is drawn from the layout itself — not a screenshot — so it shows what you set up even when the tablet is off.
- The dot and the words under the name: **Online** (it checked in during the last 5 minutes), **Offline** (when it was last seen, and on which page), or **Never checked in** (the tablet hasn't opened its address yet).
- **Load** — how heavy its Home page is against what that tablet draws smoothly (the builder's load meter). With ≈ in front it is an estimate: the tablet hasn't been benchmarked yet.
- **Check-in**, **Screen** (the size the tablet reported) and **Version** (the Skypane version it runs).
- The row at the top counts what is online, what needs a look, the average load and how many panels were benchmarked. Filter with **All / Online / Offline / Never checked in**, or type in **Find a panel…**.
- **Benchmark all** runs the benchmark on every online panel you see, one after another — Thorough unless you pick Quick. Nobody should touch the tablets meanwhile ([Weather effects and the benchmark](#weather-effects)).
- On a tile: **Setup** opens its settings, **Layout** the layout builder, **Live** the real page ([Open live: the real panel in the Manager](#open-live)). The list reads the check-ins again every 30 seconds.

**Setup: one panel at a time**

The list of panels on the left, the panel's settings in tabs in the middle — **General**, **Look & layout**, **Rooms & devices**, **Cameras**, **People & calendars**, **Alerts**, **Safety**, **Guest Wi-Fi card**, **Weather effects** — and beside them a **Preview** (the same drawing, as saved: it follows every change you make) and its **Status**. Your changes wait in a bar at the bottom — “3 changes waiting” — until you press **Save** (or **Discard**); Save sends them to the panel at once and it takes them within seconds. Leaving with changes waiting asks first. A link straight to a tab: /admin/#panels/setup/<panel>/<tab>.

> **Tip:** Alerts and Safety are the admin's. Another login that may change a panel sees those two tabs read only.

See also: [Open live: the real panel in the Manager](#open-live) · [Add a panel (a new tablet)](#add-panel) · [Weather effects and the benchmark](#weather-effects)

<a id="open-live"></a>
### Open live: the real panel in the Manager

*Where: Panels → a tile's Live, or Setup → Open live*

**Open live** shows the panel's real page in a large window over the Manager — what the tablet shows right now, at its own screen size (pick another size at the top).

- **The admin can switch things** — as that panel would: its groups and “may switch” rules apply, and anything that needs the panel PIN asks for it, exactly as on the wall. The PIN is checked by the Skypane server; it is never sent to the panels.
- **Any other login gets it view only.** The server sends that page without the panels' broker login; the page reads what the house is doing from the Manager every few seconds, and taps, the PIN pad and saving are refused (“View only”).
- It is not the panel itself: it doesn't check in, drive the LED strip, speak, measure or run a benchmark. It is silent unless you switch **Sound on** in its bar — then this window plays the panel's chimes and alert beeps too (remembered until you close the browser).
- **New tab** opens the same page in its own browser tab (full screen there with F11). **Reload** loads it again. Esc or ✕ closes it.

> **Note:** Only someone signed in to the Manager can open a panel live; the address with ?live=1 shows a note for anyone else. A panel's own address works only on the tablet approved for it ([Connect a tablet: pairing with a code](#panel-pairing)); any other device that opens it sees “Unable to connect”.

See also: [Panels: the Status and Setup views](#panels-status) · [Safety: PIN windows and unlocking on a panel](#panel-safety)

<a id="panel-general"></a>
### A panel's General settings

*Where: Panels → Setup → (a panel) → General*

Open **Panels** → **Setup**, pick the panel on the left, then **General**.

- **Name** — what the Manager calls it.
- **Temperatures** and **Wind speed** — this panel only: °F or °C; mph, km/h, m/s or knots. Unset ("Follows the house") is the house's, set in **Display settings**. (A Hubitat weather device's own units are set on Integrations → Weather and converted.)
- **FreeKiosk device name** — the name its FreeKiosk app uses for MQTT. Sounds, volume, spoken alerts and camera pop-ups go to the tablet with this name. Each tablet needs its own (the admin sets it).
- **Music page** — what the panel's Music button opens, for example the Sonos Panel. Empty = the house default (Integrations → Music); with neither set the panel has no Music button. The admin sets it (the tablet opens that page full screen).
- **LED strip** — only for a tablet with a Skypane-controlled LED strip. Leave it off.
- **Inside temperature from** — this tablet's own sensors, a Hubitat sensor, or the thermostat's reading.
- **Back to Home after** — a room or camera page left alone goes back to Home after this long.
- **Arrange on the panel too** — lets people rearrange rooms and lights on the tablet (press and hold, panel PIN, drag).
- **PIN pad sound** — a soft tick when a key on the PIN pad is tapped, the same for every key, at the panel's sounds volume.
- **Show the version on this panel** — the small version tag in the lower-left corner, to check that the panel got an update. Off hides it.
- **Set up the tablet** — the exact start page and MQTT details for this panel ([Set up a tablet (FreeKiosk)](#tablet-setup)).

See also: [Look & layout: theme, Home page, room pages](#look-layout) · [Set up a tablet (FreeKiosk)](#tablet-setup)

<a id="look-layout"></a>
### Look & layout: theme, Home page, room pages

*Where: Panels → Setup → (a panel) → Look & layout*

Open **Panels** → **Setup** → the panel → **Look & layout**.

**Color theme**

Tap a color. The panel changes within seconds. (The tablet's own Settings → Look can change it too.)

**Home page**

Pick a built-in layout: **Classic**, **Calendar first**, **Two columns**, **Security** or **Minimal**. The built-in layouts can't be changed, but each can be the start of your own.

1. To make your own: under **Your own layout**, press **Build one** (or **Edit** if you already have one).
2. The layout builder opens ([The layout builder: the basics](#builder-basics)). Press **Save** there when you're done.
3. If you have your own layout but the panel shows a built-in one, press **Use it**.

**Room pages**

**Every room** picks how every room page looks: **Cards & orbs**, **Tiles**, **List** or **Your own**. Under **A room's own**, one room can look different.

**Your own room layouts** → **Build one** / **Edit**: one layout for every room (it fills itself in for each room), and any room its own.

Further down: the background and sky ([Background and sky](#sky)) and the room bar ([The room bar](#room-bar)).

See also: [The layout builder: the basics](#builder-basics) · [Background and sky](#sky) · [The room bar](#room-bar)

<a id="sky"></a>
### Background and sky

*Where: Panels → Setup → (a panel) → Look & layout → Background & sky*

In **Look & layout**, the **Background & sky** card:

- Tap a built-in background, or one of your own pictures (add them on **Sidebar → Manage → Backgrounds**, see [Backgrounds](#backgrounds)).
- **Sky** (a dropdown): **Animated sky** — sun, moon, clouds and weather move above the background. **Still sky** — the same sky, redrawn once a minute (lighter for the tablet). **No sky** — your own picture fills the screen as it is (best for a photo with its own sky).
- **Sky colors**: **The theme's** or **Realistic**.
- **Weather effects on Home**: rain, snow and leaves **In front of the cards** or **Behind the cards**.

> **Tip:** A tablet that stutters: try **Still sky**, or lower the effects ([Weather effects and the benchmark](#weather-effects)).

See also: [Backgrounds](#backgrounds) · [Weather effects and the benchmark](#weather-effects)

<a id="room-bar"></a>
### The room bar

*Where: Panels → Setup → (a panel) → Room bar*

The room bar holds the buttons for Home, the rooms, cameras and music.

1. **Panels** → the panel → **Room bar**.
2. **Show the room bar**: **Show** or **Hide**. A new panel starts with it hidden.
3. **Where it sits**: **Bottom**, **Top**, **Left** or **Right**. Or in the layout builder: point at the bar and drag it by its dots to an edge (Esc cancels), or pick the edge in its **Room bar** settings on the right.
4. **Rooms on this panel**: switch a room off to hide it here; drag a row by its ⠿ grip, or use ▲ ▼, to change the order.
5. The same tab has its **style**, **names** (shown or not) and **auto-hide**. In the layout builder, with no card selected, the **Room bar** section on the right has them too.

The bar is only moved and arranged in the Manager. On the tablet it stays where you put it.

See also: [Rooms & devices on a panel](#panel-rooms)

<a id="panel-rooms"></a>
### Rooms & devices on a panel

*Where: Panels → Setup → (a panel) → Rooms & devices*

Each panel picks which rooms it shows and in what order.

1. **Panels** → the panel → **Room bar** → **Rooms on this panel**: switch a room off to hide it here. Drag a row by its ⠿ grip, or use ▲ ▼, to change the order (Alt+↑ ↓ on the grip works too; Undo in the message puts it back).
2. **Panels** → the panel → **Rooms & devices** → under **Devices in a room**: pick a room, then switch single devices off, add devices from other rooms, and order them.

This only changes this panel. The rooms themselves are made on **Devices → Rooms** ([Rooms](#rooms)).

See also: [Rooms](#rooms) · [Devices: the Basic view](#devices)

<a id="panel-cameras"></a>
### Cameras on a panel

*Where: Panels → Setup → (a panel) → Cameras*

**Panels** → the panel → **Cameras**.

- **Camera views on this panel** — their order (drag by the ⠿ grip, or ▲ ▼) is the order of the tabs on the camera page. Switch off views this panel shouldn't show. Type a name to rename one here.
- **Auto-show a camera for** — how long a camera pops up (for example when the doorbell rings).
- **Live video up to** — more live tiles is harder work for the tablet.
- **Bigger views: a still every** and **Camera sound off after**.

Views and your own cameras are made on **Sidebar → Manage → Cameras** ([Cameras: Setup, your own cameras and views](#cameras)).

See also: [Cameras: Setup, your own cameras and views](#cameras)

<a id="people-calendars"></a>
### People & calendars on a panel

*Where: Panels → Setup → (a panel) → People & calendars*

**Panels** → the panel → **People & calendars**.

- **Who's home** — switch on the presence devices (OwnTracks, phones) this panel shows. Type a name, tap the circle for an icon or picture, tap the dot for a color.
- **Calendars on this panel** — switch a house calendar off here, or give it this panel's own color or icon.

The calendars themselves are added by the admin on **Integrations** ([Calendars](#calendars)).

See also: [Calendars](#calendars)

<a id="panel-alerts"></a>
### Alerts on a panel: levels, quiet hours, light

*Where: Panels → Setup → (a panel) → Alerts (the admin)*

Alerts are made in Hubitat ([Alerts come from Hubitat](#alerts-hubitat)). Here the admin chooses how **this** panel shows them. Only the admin can change these — not other logins, and not the panel itself (its Settings only shows them).

1. **Panels** → the panel → **Alerts**.
2. **Beep until dismissed** — for levels 4 and 5.
3. **Silence without the PIN** — off by default. On: a level 4–5 alert gets a **Silence** button that stops the sound on this panel. The alert stays full screen until someone dismisses it with the PIN, the sound comes back after 5 minutes if it's still up, and Hubitat hears it (button 7, [The Skypane Notifier driver (Hubitat)](#notifier-driver)).
4. **Lowest level shown here** — for example 3 to skip reminders and finished notes. A level 5 always shows.
5. **Quiet hours** — from / to: no sound below level 4. Or **… or while Hubitat's mode is** — for example Night.
6. **Level 4 sounds in quiet hours** — on by default (a leak at night). Off: only a level 5 sounds then; a level 4 still shows full screen.
7. **Notification light** — **This tablet's own light** (its LED strip, with the Skypane panel agent: it flashes red), or a Hubitat light near the tablet that pulses during an alert. None also switches the LED strip off.

> **Tip:** Try it on the tablet: Settings → Test → a test alert.

See also: [Alerts come from Hubitat](#alerts-hubitat)

<a id="panel-safety"></a>
### Safety: PIN windows and unlocking on a panel

*Where: Panels → Setup → (a panel) → Safety (the admin)*

**The panel PIN**

**Panels** → **Setup** → a panel → **Safety** → **Panel PIN** (the admin): **Set PIN…** / **Change PIN…** (4 to 8 digits, twice) or **Clear…**. Each asks your own Manager password — the old PIN isn't needed. One PIN for every panel; it is never shown or logged.

**Panel PIN stays unlocked**

After the panel PIN was entered it isn't asked again for a while. Two timers:

- **Alarm** — arming, disarming and dismissing a level 4–5 alert: 30 seconds from the PIN entry (touches don't make it longer). Enough to disarm and then dismiss the alert.
- **Everything else** — Settings, Room options, doors, the garage, guest mode: 1 minute without a touch (each touch starts it again).

**Off** means it never relocks. The Manager warns when the alarm timer is off or longer than a minute: anyone at the panel could arm or disarm until it relocks.

**Unlocking**

By default no panel can unlock a door. Two things must both allow it:

1. The lock: **Devices** → the lock → **Unlocking** → tick **May be unlocked from the panels** (or a group's rule, see [Groups & rules](#groups)).
2. The panel: **Panels** → the panel → **Safety** → **Allow unlocking here**. It asks you to confirm.

Unlocking always asks for the panel PIN. Locking never does.

See also: [Groups & rules](#groups) · [The panel PIN](#panel-pin)

<a id="guest-card"></a>
### Guest Wi-Fi card on a panel

*Where: Panels → Setup → (a panel) → Guest Wi-Fi card*

**Panels** → the panel → **Guest Wi-Fi card** → **On the home screen**: **Show** or **Hide**.

The network name, password and QR code are set for the whole house on **Sidebar → Admin → Guest Wi-Fi** ([Guest Wi-Fi](#guest-wifi)).

See also: [Guest Wi-Fi](#guest-wifi)

<a id="weather-effects"></a>
### Weather effects and the benchmark

*Where: Panels → Setup → (a panel) → Weather effects*

Rain, snow, fog and lightning cost the tablet work. Each panel can be limited.

1. **Panels** → the panel → **Weather effects**.
2. **Heaviest effect**: **Auto** (the tablet measures itself) or a fixed level: **Minimal**, **Light**, **Medium**, **Heavy**.
3. With the tablet on, press **Run benchmark** (quick, about 1½ minutes, or thorough, about 5). The numbers show here afterwards.
4. Press **Use it** next to a result to use what the test found.

See also: [Background and sky](#sky)

## The layout builder

<a id="builder-basics"></a>
### The layout builder: the basics

*Where: Panels → Setup → (a panel) → Look & layout → Build one / Edit*

The layout builder is where you make your own Home page or room pages. It fills the whole window: a bar at the top, the cards to add on the left, the panel in the middle and the settings on the right.

1. **Panels** → **Setup** → the panel → **Edit layout** (or **Look & layout** → **Build one** / **Edit**). A tile's **Layout** button on the Status view goes there too.
2. The middle is the panel itself, live, at its own screen size (**Screen** at the top picks another). Nothing switches for real here.
3. With no card selected, the right side shows **the page's own settings**: **Start from…** (a built-in layout, another panel's or another room's), the grid (snap, overlap, join, spacing), the panel's theme and background, and the room bar's style.
4. Add, move and size cards ([Add, move, resize and remove cards](#builder-cards)). Click a card to change it on the right ([Changing a card: Shows, Style, What it does](#card-settings)); Esc or ✕ lets go of it. **Layers** (on the left) lists every card on the page — click one to select it.
5. **Arrange** moves cards. **Try it** lets you tap the panel as on the wall. **Focus** (or F) hides both sides ([Focus: the panel as big as it gets](#builder-focus)).
6. Press **Save**. The panel takes it within seconds. **Done** goes back to the panel's settings.

> **Tip:** Help works while the builder is open: your unsaved changes stay.

Leaving with unsaved changes asks: **Save**, **Cancel** or **Leave without saving**.

See also: [Add, move, resize and remove cards](#builder-cards) · [Undo, redo and saving a layout](#undo-save) · [Card types (a short list)](#card-types)

<a id="builder-cards"></a>
### Add, move, resize and remove cards

*Where: Layout builder*

1. **Add**: drag a card from the list on the left onto the screen, or click it (it goes in the first free spot). A new card starts small, so it always finds room — then drag its corner to make it as big as you need. **Find a card…** searches every card.
2. **Move**: drag the card.
3. **Resize**: drag any edge or corner (the cursor shows which). A selected card's settings start with its **X / Y / W / H** in cells of the panel's grid: type a number to move or size it. The arrow keys move it too.
4. **Remove**: drag it onto the bin, press **Remove**, or click it on the screen and press Delete.

- These four are on the right while no card is selected. **Snap to grid** moves in tidy steps (hold Alt to move freely). Edges that line up show a guide.
- **Spacing** is the gap kept when a card snaps next to another.
- **Allow overlap** lets cards lie over each other (then **Bring to front** / **Send to back**).
- **Join touching cards** makes cards that meet look like one.

> **Note:** “That spot overlaps another card” — move it to a free spot, or turn on **Allow overlap**.

See also: [Changing a card: Shows, Style, What it does](#card-settings) · [A blank card: your own pieces](#blank-card) · [Undo, redo and saving a layout](#undo-save)

<a id="undo-save"></a>
### Undo, redo and saving a layout

*Where: Layout builder*

- The undo and redo arrows at the top (or Ctrl+Z / Ctrl+Y) undo and redo the last 20 changes: adding, moving, resizing, style, settings, removing, the theme and the background. Each room keeps its own list.
- The top bar says **Unsaved changes** or **All saved**. **Discard** puts the layout back to how it was last saved (it asks first).
- The undo list is gone after a reload or once you leave the builder.
- In a text box, Ctrl+Z undoes the typing as usual.

1. Press **Save**. Nothing changes on the wall until you do.
2. If a card isn't finished (a device not picked, a garage door without its opener…), the builder selects it and says what is missing. Fix it and press **Save** again.
3. After saving, the panel's Home layout says **Your own**.

See also: [The layout builder: the basics](#builder-basics)

<a id="builder-focus"></a>
### Focus: the panel as big as it gets

*Where: Layout builder → Focus (or press F)*

**Focus** (the button at the top, or the F key) hides the cards on the left and the settings on the right, so the panel fills the middle. Everything still works: drag, resize, Delete, undo.

- A small bar floats under the panel: **Cards** opens the card list over the panel for a moment, **Card settings** the settings of the selected card. Press the same button again (or Esc) to close it.
- **Exit focus**, F or Esc brings both sides back.
- **Full screen** (the button beside Focus) is something else: the panel alone on the whole screen, to use it as on the wall. Esc comes back.

See also: [The layout builder: the basics](#builder-basics) · [Add, move, resize and remove cards](#builder-cards)

<a id="card-settings"></a>
### Changing a card: Shows, Style, What it does

*Where: Layout builder → tap a card*

Tap a card. Its settings open on the right (hover a dotted name for a short note).

- **Shows** — its device, reading, text, room, camera or picture; title and icon. The words and icons keep the size Style gives them (**Icons**, **Text**); a bigger card only gives them room. **Grow and shrink with the card** (off at first): switched on, they grow and shrink with the card from its size at that moment; switched off, they keep the size they have then. **When it doesn't fit**: *Make it smaller* or *Fit the width, scroll*.
- **Style** — presets (**Glass**, **Flat**, **Raised**, **Square**, **No card**), corners, how raised, see-through, border, icon and text size, color.
- **What it does** — tap, press and hold, double tap: switch a device, lock, unlock (panel PIN), send a command, open a room, page or camera.
- **Press and hold: the wheel** — up to 8 actions picked from what the device can do. (A Devices card's items have their own: [The Devices card](#devices-card).)
- **Only show it when** / **Highlight it when** — up to 4 rules (device, reading, is / is not / above / below, value).

**Device pickers** have the search as their first row: type any part of the name, room or kind, in any order (“light kit” finds “Kitchen Lights”); ↑ ↓ and Enter pick. The list is grouped by room, each device with its kind's icon.

**Pop-ups** (the device, icon and color pickers) scroll on their own; Esc or a click outside closes them.

**Save a card for later**

**Save card** (at the bottom of its settings) keeps it under **Your cards → Saved cards**, to drag onto any page as a copy.

See also: [Card types (a short list)](#card-types) · [Add, move, resize and remove cards](#builder-cards) · [The Devices card](#devices-card)

<a id="devices-card"></a>
### The Devices card

*Where: Layout builder → Devices → Devices*

One **Devices** card does what Device, Devices, Value, Button, Lock, Fan and Scene buttons did: lights, switches, readings, buttons, locks, fans and scenes as a **List**, **Tiles**, **Freeform** or one **Single big item**.

1. Add a **Devices** card and click an item (or double-click the card). Its settings open with a live preview on top and four tabs: **Device** · **Actions** · **Look** · **Advanced**.
2. **Device**: pick it (the search is the list's first row). The item kinds: Value, Switch, Button, Lock, Fan, Scene.
3. **Actions**: a tap is on / off when the device can switch (the Dyson: Fan on / Fan off), else one of its own commands in plain words (Auto, Speed 1–10…). Another device, a room or a page is under **Something else…**. **Hold** opens a fly-out: tick which of its options show (up to 8). A double-tap is optional.
4. **Look**: an icon (all icons, drawings, your own pictures; Animated), a motion while it's on, a round background or none, **Color when on** (Automatic or any color), **Icon size** and **Text size**, and the text on any side.
5. **Advanced**: **Ask before doing it** — the panel asks “Turn on Desk fan?” first. A garage door always asks (then the PIN).

- **Freeform**: drag an item anywhere; resize it from any edge or corner. X / Y / W / H (in % of the card) follow along; the arrow keys move it (Shift: 10 at a time).
- **Tiles**: drag a tile's right or bottom edge to span more tiles (up to 4 × 4). **List** and **Tiles**: drag an item to a new place.
- **Single big item** with several items: swipe left or right on the panel for the next one; dots show where you are.
- The air purifier in Auto shows its speed: “Auto · Speed 4”.

In the builder a click only picks an item: the preview shows on / off without sending anything.

> **Tip:** Upgraded from 3.0.3 or 3.0.4? Your old Device, Devices, Value, Button, Lock, Fan and Scene buttons cards are blank cards now and look the same. [What changed in 3.0.5](#overview) lists them. <!-- (v3.0.5) -->

See also: [Changing a card: Shows, Style, What it does](#card-settings) · [Card types (a short list)](#card-types)

<a id="blank-card"></a>
### A blank card: your own pieces

*Where: Layout builder → Devices → Blank card*

A blank card is yours to fill with up to 25 pieces.

1. Drop **Blank card** (in **Devices**, first in the list).
2. Double-click it (or **Edit pieces**). It is edited where it is: the rest dims a little and “Editing pieces — Esc to finish” shows on top.
3. **Add a piece** on the right: **Picture**, **Light**, **Switch**, **Value**, **Door**, **Lock**, **Garage** or **Text**. Click one, or drag it onto the card.
4. Drag a piece anywhere on the card and resize it from any edge or corner. X / Y / W / H (in % of the card) follow along; the arrow keys move it 1 % (Shift: 10 %); Delete removes it. **Bring forward** / **Send back** stack them.
5. Give each piece its device on the right.
6. Esc or a click outside the card ends it.

- **Alignment guides**: faint lines when an edge or a middle lines up with another piece or the card's middle. They only show; nothing snaps. On unless you switch them off (remembered in this browser).
- Undo / Redo (Ctrl+Z / Ctrl+Y) work for every move. A piece always stays inside its card.
- A blank card from before 3.0.4 keeps its look: its pieces move to the new places as it's opened or saved.

**Save** says which piece still needs its device, and opens it.

See also: [Add, move, resize and remove cards](#builder-cards) · [Card types (a short list)](#card-types)

<a id="card-types"></a>
### Card types (a short list)

*Where: Layout builder → the card list*

The card list has categories: This room, Devices, Climate, Security, People, Time & planning, Cameras & pictures, Network, Info, Your cards.

- **Clock**, **Weather** ([Weather card: places, source and days](#weather-places)), **Calendar**, **Countdown & timers** ([Countdown & timers](#timers)), **Bins / Trash** ([Bins / Trash](#bins-trash)).
- **Thermostat** ([Thermostat card and its looks](#thermostat-looks)), **Inside / outside**.
- **Devices** — lights, switches, readings, buttons, locks, fans and scenes on one card ([The Devices card](#devices-card)); **Text** (your words with live values).
- **Door locks**, **Doors & windows**, **Lock** (slide to unlock), **Garage door**, **Picture & values** ([Picture & values cards and garage doors](#picture-values)), **Alarm (HSM)**, **Safety**, **Mode**.
- **Who's home**, **Guest Wi-Fi**, **Alert note**, **Notifications**.
- **Camera**, **Picture**, **Photo frame**.
- **Music player**, **Energy flow**, **Power now**, **Batteries**, **System**.
- **List** (a shared shopping / to-do list), **Notes** (sticky notes).
- **Network** (UniFi): Internet, Network map, Status tabs, Clients & gateway, UniFi devices, PoE power, Clients, Client log and Network values ([UniFi Network and the Network cards](#unifi-network)).
- Room pages: **Room header**, **Room's devices**, **Doors & locks here**, **Room's cameras**, **Appliances here** — they fill themselves in.
- **Blank card** ([A blank card: your own pieces](#blank-card)), your saved cards and cards people make ([Cards people make (install a card)](#cards-people-make)).

Device, Value, Button, Lock, Fan and Scene buttons are now part of the **Devices** card; Bin day is now **Bins / Trash**; Countdown and Timers are now **Countdown & timers**. The upgrade moved your old ones over by itself.

See also: [Changing a card: Shows, Style, What it does](#card-settings) · [The Devices card](#devices-card) · [Thermostat card and its looks](#thermostat-looks)

<a id="thermostat-looks"></a>
### Thermostat card and its looks

*Where: Layout builder → a Thermostat card → Look*

1. Add a **Thermostat** card and tap it.
2. **Look** (a dropdown): **Standard** (the card's Style) or one of 12 looks. The screen shows it at once.
3. Pick which thermostat. Only thermostats are listed (**Show every device** for the rest). With several in the house, pick one — until then it shows the house thermostat.
4. **Modes shown** and **Fan modes shown**: ticked = a button on the card.

- **Halo ring** — big and round, for the main thermostat. **Arc with a knob** — precise dragging.
- **Slider bar** — a wide card. **Thermometer** — a tall, narrow spot.
- **Big number** — readable across the room. **Stepper chip** and **One line** — thin strips.
- **Heat–cool range** — both set points in Auto. **Today's run** — when it heated or cooled today.
- **Glass orb** — its color is the state. **Gauge + outside** — inside and outside together. **Twin rings** — set point and humidity.

Every look works the same: − / + (or drag), the mode buttons you ticked, the PIN where it applies.

See also: [Card types (a short list)](#card-types)

<a id="picture-values"></a>
### Picture & values cards and garage doors

*Where: Layout builder → a Picture & values card*

A **Picture & values** card is a picture with up to 12 rows of readings, switches, locks and doors.

1. Add the card and tap it.
2. Under **Add from**, pick a device. Tick its values in the dropdown, or use **+ As a value**, **+ As a switch**, **+ As a lock** or **+ As a door**.
3. For a garage door: pick its opener. The picker lists garage door openers first, then switches and relays (never a sensor).
4. Give a garage door a **Name** — what the PIN question calls the door.
5. **Doors**: a set of 1 to 4 (Single to Quad), each **Single** or **Double-wide**, each with its own opener and its own open and close times. Each door is tapped on its own. A blank card's **Garage** piece works the same.

Opening a garage always asks first, then for the panel PIN. The builder shows a warning under the screen for anything that opens or unlocks.

**A vibration or tilt sensor on a door (optional)**

Moving and it starts shaking → **Closing…** before the contact says so. It stops, then shakes again with no “closed” → **Opening…** (the safety eye sent it back up). It stops with no “closed” → **Partly open**. With or without a sensor, the close time running out with no “closed” → **Not closed**, in amber. The contact saying closed always wins.

See also: [Card types (a short list)](#card-types) · [The panel PIN](#panel-pin)

<a id="bins-trash"></a>
### Bins / Trash

*Where: Layout builder → Time & planning → Bins / Trash*

One card for every bin: wheelie, recycling and inside bins, bags, bulky items. Each is drawn a little fuller every day until pickup day. The line on top says “Tomorrow is trash day”, “Trash day today” or the next pickup.

1. Add a **Bins / Trash** card and tap it. Add a bin, name it and pick its drawing (or your own picture from **Icons**), one of 10 colors (whole bin or lid only), **Still** or **Animated** (**Calm** for old tablets).
2. Its **schedule**: weekly (one or more days), every N weeks from a known pickup day, even or odd weeks, the 1st–4th or last weekday of the month, or seasonal; and the time the truck comes.
3. **Holidays** (one list for the house, in the card's settings): per bin, what a holiday does — nothing, next day, next work day, same day next week, the rest of that week a day later, or no pickup. The card then says “Pickup Thursday · moved (holiday)”.
4. **The reminder**: from a set time (the evening before, 19:30 at first, or on pickup day) each due bin is a Reminder in the notification list, with its button: **Taken out**, **Emptied** or **At the curb**. Pressing it clears that bin on every panel.
5. An optional **alarm** (21:00) chimes and says “Don't forget the bins” when one isn't out yet. Off at first.

Upgraded from 3.0.3? A Bin day card became Bins / Trash with its bins and schedules (Still, no alarm).

See also: [Card types (a short list)](#card-types) · [Countdown & timers](#timers)

<a id="timers"></a>
### Countdown & timers

*Where: Layout builder → Time & planning → Countdown & timers*

Countdowns to a date and time, and timers (one per kid, say) that start from the house's presets — Free time, Reading, Screen time, Pizza… — with **+1 min**, **Pause** / **Resume** and **Stop**. Each shows any mix of Days · HH · MM · SS (“3 days 02:19:10”, “3 days”, “74 h”).

1. Add a **Countdown & timers** card and tap it. Add a countdown (its date and time) or a timer (its preset). The presets are edited in the card's settings and shared by every timer in the house; the ticked ones are buttons on an idle timer.
2. A timer's **Sound** on “Timer up”: the chime, spoken words (**Words**: “Emma, time is up” at first) or none; and how many seconds “Timer up” stays.
3. **Lights that flash** (none at first, up to 4): on and off twice, then back as they were — only lights this panel may switch without the PIN.
4. **House speakers** (none at first, up to 3): Hubitat speakers that can speak (SpeechSynthesis, such as Sonos or Echo Speaks) say the timer's words. The Skypane service sends it, not the panel, so it works with every panel off. **Speaker volume** shows when a speaker can set its volume; at first it's left as it is.
5. Connect a timer to other panels: **Linked** (it's on that panel's card too, with its buttons, or runs with its own timer of the same name) or **Notification only** (it counts down there). It goes off on both.

**“Timer up”** fills the screen in the timer's color with its sound, and closes itself after its seconds. It looks like a level 5 but isn't one: no PIN, no alert level.

**PIN-protect timers on this panel** (the card's settings): +1 min, Pause, Resume and Stop ask for the panel PIN (still unlocked from a moment ago: not again). **Presets still start without the PIN** is on unless you switch it off. A lock shows next to the card's title.

**Start a timer from a Hubitat rule**

Send the **Skypane Notifier** the notify text Timer: Emma, Free time (a preset by its name) or Timer: Pizza, 0d00:20 (days, then hours:minutes). Every timer with that name starts, on every panel. It isn't shown as an alert — Skypane clears it on the hub. No driver update is needed.

Upgraded from 3.0.3? A Countdown card kept its date; a Timers card became one timer with its minute buttons as presets.

See also: [Card types (a short list)](#card-types) · [The Skypane Notifier driver (Hubitat)](#notifier-driver) · [Bins / Trash](#bins-trash)

<a id="weather-places"></a>
### Weather card: places, source and days

*Where: Layout builder → a Weather card*

1. Add a **Weather** card and tap it.
2. Under **Places**, press **+ Add a place**, type a town or city, press **Search** and pick the right one from the list.
3. Use ▲ ▼ to order them. The first one is home.
4. Press ✕ to remove one.

A new weather card starts with none: with a weather device on the hub it shows that weather, otherwise “+ Add a place”. The search goes through your Skypane server, so the server needs internet access; “Couldn't reach the weather service” means it has none. “No place by that name” means try another spelling.

- **Weather from**: **Automatic** (it says what it shows right now), **Built-in (Open-Meteo)**, **Hubitat device** or **OpenWeatherMap**. A source that isn't connected is grayed out, with a link to connect it. Automatic: the Hubitat device if it's connected (its gaps filled from Open-Meteo), else OpenWeatherMap if there's a key, else Open-Meteo. A new card starts on Automatic.
- **Days ahead**: 7 or 14 (14 show as two rows of 7). Days OpenWeatherMap or the device doesn't have come from Open-Meteo, with a small blue dot.
- **Tap a day for its hours** (on at first): a tap shows that day hour by hour under the days, in a row to scroll; tap it again to close. Off, the days only show.

Upgraded from 3.0.3? Every weather card kept the source it showed: **Hubitat device** where “Use it for the weather card” was on, **Built-in (Open-Meteo)** where it was off.

See also: [Card types (a short list)](#card-types)

## Devices, rooms and the house

<a id="devices"></a>
### Devices: the Basic view

*Where: Devices → Basic*

**Devices** lists every Hubitat device. It has two views — **Basic** and **Detailed** (the switch at the top right, or press **V**). The Manager remembers the one you used last for your login; the filters and the device you have open stay the same when you switch.

**Find a device**

- The tiles at the top — lights on, open, unlocked, low battery, offline — filter the list when you click them. Click again to show everything.
- The filter box: type a name, or a filter like **room:Kitchen**, **type:light**, **state:on**, **state:offline**, **rule:pin**, **battery:low** or **driver:** (the hub's driver name). It suggests as you type: ↑ ↓ to pick, Enter to add. Each filter becomes a chip; ✕ or Backspace removes it. Press **/** to jump to the box.
- On the right: **grouped by room** or **A–Z**, and a **list** or **tiles**.

**Change a device**

1. Click a device. Its settings open in a panel on the right (over the list on a smaller window). Every change saves at once and applies to every panel.
2. **Shows as** — what the panels make of it (light, fan, outlet, lock, hidden…). **Room** — where the panels show it. **Picture** → **Choose…** — its icon on the panels.
3. Lights: **Light type** and **Color command** (if colors come out wrong, try the other way). Fans: **Fan type**. A freezer sensor: **Show as a warning above** (no sound — alerts come from Hubitat rules, [Alerts come from Hubitat](#alerts-hubitat)).
4. Safety: **Ask for the panel PIN**, **May be unlocked from the panels** (locks), **The panels may switch it** (off makes it view only everywhere; the admin only).
5. **Back to automatic** undoes your changes. **Esc** or ✕ closes the panel.

The state, battery and last activity are live from the hub (they need the message broker and the Hubitat bridge — Integrations). Each device's recent events are at the bottom of its panel.

See also: [Devices: the Detailed view and changing many at once](#devices-detailed) · [New devices found](#devices-new) · [Rooms](#rooms) · [Groups & rules](#groups) · [Icons and pictures for devices](#icons)

<a id="switch-devices"></a>
### Switching devices from the Manager

*Where: Devices → a device → Control*

A device's editor — the sheet on a phone, the side panel on a computer — has a **Control** section when your login may switch it, with what the panels can do with that device: **On** / **Off**, **Brightness**, **Open** / **Close**, **Lock**; a thermostat's **Mode**, **Heat to** / **Cool to** (− and +, sent a moment after the last press) and **Fan**; a light's **White** (color temperature) and **Color**; a fan's speeds; the air purifier; a media player's **Play**, **Pause**, **Next**, **Volume**; scene buttons.

- Admins may always switch. Anyone else needs **Switch devices** ticked in Accounts (off until an admin ticks it), and then only what their panel shows.
- Only devices the panels may switch: a device made view only (Devices → "The panels may switch it": No) can't be switched from the Manager either.
- Where a panel asks for the **panel PIN** — a garage door, a water valve, a guest mode, a device marked "Ask for the PIN" — the Manager asks too. Wrong PINs lock out as on a panel, counted for your login and for your phone or computer.
- The new state shows at once ("Now: on · sending…"). If the hub refuses it, or the device doesn't report the new state within about 5 seconds, the real state comes back with one line why — for example "Kitchen Lights didn't change — it still reports off". A device that asks for the PIN changes once the PIN is in.
- Every command is in Health → Timeline: who sent what to which device (never the PIN).

A media player or a scene button shows here when it is on one of the panels' layout cards — as on the panels, where only those can be used.

> **Note:** Doors are locked from the Manager, never unlocked — whatever the login, whatever the device.

The house's **mode** and the **alarm** (Hubitat Safety Monitor) are on the Overview: [Mode & alarm from the Manager](#mode-alarm).

If the hub doesn't answer within 5 seconds the Manager says so, and the command is dropped rather than sent late — still, check the device before trying again.

> **Tip:** With your own MQTT broker instead of Skypane's built-in one, the Manager's switching is still signed end to end — but the panels' own topics are only as protected as your broker's logins and access lists make them, as before.

Switching from a list isn't possible on purpose — a tap while scrolling never switches anything; open the device first.

See also: [Devices: the Basic view](#devices) · [Mode & alarm from the Manager](#mode-alarm) · [Safety: PIN windows and unlocking on a panel](#panel-safety) · [Accounts and permissions](#accounts)

<a id="mode-alarm"></a>
### Mode & alarm from the Manager

*Where: Overview → Mode & alarm*

The Overview has a **Mode & alarm** card for admins and logins with **Switch devices**: the hub's mode now with a list to change it, and Hubitat Safety Monitor's state with **Arm away**, **Arm home**, **Arm night**, **Disarm** (and **Cancel the alerts** while one is up).

- Every change asks for the **panel PIN** — disarming too — exactly as on a panel. Wrong PINs lock out as on a panel, for your login and for your phone or computer.
- Nothing shows as changed until the hub has it; the card reads the house again right after.
- The Hubitat bridge checks it all again and keeps the same limits as the panels (a few changes a minute). Each change is in Health → Timeline (never the PIN).

> **Tip:** No panel PIN set yet? The admin sets one in **Panels** → **Setup** → a panel → **Safety** → **Panel PIN** ([The panel PIN](#panel-pin)).

See also: [Switching devices from the Manager](#switch-devices) · [Safety: PIN windows and unlocking on a panel](#panel-safety)

<a id="devices-detailed"></a>
### Devices: the Detailed view and changing many at once

*Where: Devices → Detailed*

**Detailed** shows every device in a table: name, room, shows as, state, battery, last activity, the **driver** (the hub's type name, e.g. Generic Zigbee Contact Sensor), the hub id and its rules. A narrower window leaves out the last columns.

- Click a column's name to sort by it; again to reverse.
- The boxes on the left (Room, Type, State, Battery, Rules, Driver) filter the table — they are the same filters as Basic's chips.
- The tiles at the top filter too (lights on, open, unlocked, low battery, not responding).
- **Export** saves the devices shown as a CSV file.

**Change many devices at once**

1. Select the devices with their boxes (the box at the top selects every device shown).
2. The bar shows what you can change for all of them: **Room…**, **Shows as…** (only the types every selected device can be), **Panel PIN…**, **May switch…** (the admin) and **Hide / show…**.
3. Pick the new value and press **Change**. It is one change: if one of the devices can't take it, none is changed and the message says which one.
4. **Clear selection** when you're done. A disabled button says why when you point at it; devices still selected but hidden by a filter are counted in the bar and included.

**One device**

Click a row: a panel slides in from the right with four tabs — **Settings** (the same as in Basic), **Details** (its hub id, driver, battery, health, when it was first seen, every value the hub reports, what the panels can do with it), **Events** (the last 50 things the hub said about it since the Skypane server started) and **Panels** (which panels show it — through its room or a card on a layout — with **Open** to go there). Esc, ✕ or a click beside it closes it.

> **Tip:** On a phone the Devices page always opens in Basic.

See also: [Devices: the Basic view](#devices) · [New devices found](#devices-new) · [Groups & rules](#groups)

<a id="devices-new"></a>
### New devices found

*Where: Devices → the “new devices found” note*

When a device turns up on the hub (you paired something new), Devices says **new devices found** at the top, and the device has a green **New** tag.

1. **Show them** filters the list to the new ones.
2. Check how each one shows on the panels and its room (Skypane guesses from the hub's driver and name).
3. **Mark as reviewed** — the note goes away until the next new device.

Every device the hub had when you started using this Skypane counts as known. **Details** (Detailed view) shows when each one was first seen.

See also: [Devices: the Basic view](#devices) · [Devices: the Detailed view and changing many at once](#devices-detailed)

<a id="rooms"></a>
### Rooms

*Where: Devices → Rooms*

Rooms come from Hubitat. You can also make rooms of your own.

1. **Devices** → **Rooms**.
2. Tap a room's picture to change it.
3. To make a room: **New room of your own** → type a name → **Make the room**, then add its devices.
4. **Remove room** removes a room of your own.

To rename a Hubitat room, rename it in Hubitat. Which rooms each panel shows: [Rooms & devices on a panel](#panel-rooms).

See also: [Rooms & devices on a panel](#panel-rooms) · [Devices: the Basic view](#devices)

<a id="groups"></a>
### Groups & rules

*Where: Devices → Groups & rules (the admin)*

Rules for several devices at once — locks, doors, garage openers or anything sensitive.

1. **Devices** → **Groups & rules** → **New group** → type a name → **Make the group**.
2. Add its devices.
3. Tick the rules: **The panel PIN to turn them on / open them**, **Locks in it may be unlocked from the panels**, **Only these panels may control them:** (then tick the panels).
4. Press **Save**.

See also: [Safety: PIN windows and unlocking on a panel](#panel-safety) · [Devices: the Basic view](#devices)

<a id="cameras-live"></a>
### Cameras: the Live view

*Where: Sidebar → Manage → Cameras → Live*

**Cameras** → **Live** shows every camera your account may see at once. The switch at the top right (or the V key) changes between **Live** and **Setup**; your choice is remembered.

- **Spotlight** — one camera big, the others beside it. A camera's **Into the spotlight** button (or a motion entry below) moves it there. **Side by side** — all of them the same size.
- The tiles show each camera's **picture now**, fetched by the Skypane server every 2 seconds (the spotlight every second). Only the tiles on screen are fetched, and nothing while the page is hidden.
- On your home network the spotlight plays **live video** (the built-in camera video). Away from home — or with a separate camera video server — it stays with pictures and says so.
- **The picture, big** opens it larger, with **Save picture**. **Full screen** shows one camera alone (Esc to come back).
- **Recent motion** — when the hub last reported motion for each camera (since the server started), each with the camera's picture from now: the times are real, the pictures are current.

> **Tip:** A login without the Cameras right sees the cameras its own panel shows — and only those. One that may change its panel can put any camera on it (in a view or a camera card), and then sees that camera too: give the panel right with that in mind.

> **Note:** "Camera video isn't running on this server" — the pictures come from the built-in camera video (go2rtc). Health shows what's wrong.

See also: [Cameras: Setup, your own cameras and views](#cameras) · [Cameras on a panel](#panel-cameras)

<a id="cameras"></a>
### Cameras: Setup, your own cameras and views

*Where: Sidebar → Manage → Cameras → Setup*

UniFi Protect cameras show up by themselves. Other cameras (an RTSP, RTMP or MJPEG address) can be added here. The video is played through the built-in camera video (go2rtc). **Setup** lists every camera; pick one for its card on the right.

- **Show on panels** — a panel's camera page shows the cameras of its views, one tab per view. For each panel, a switch per view the camera is in: off hides that view on that panel. Only the panels your account may change are listed; the others are the admin's.
- **Pop up on the panels** — what shows a camera today: a doorbell ring, or a Hubitat rule (the Skypane Notifier). Rules per camera come later.
- **Test picture** — the camera's picture now. A camera of your own also has its name, room and streams here.

**Add a camera**

1. **Cameras** → **Add camera** (top right; the admin).
2. Type a name and paste the **Main stream** link (rtsp://user:password@address:554/…). Optional: a **Sub stream** (small, for grids). Examples: a Reolink, Hikvision or Amcrest camera's RTSP address (its manual calls it an RTSP or stream URL), or tinyCam PRO's re-stream rtsp://<phone>:8083/…. RTMP and MJPEG addresses work too.
3. Press **Add camera**. It plays on the panels in a few seconds. The links stay on the server and are never shown again — to change one, type it again.

**Add a view**

1. Under **Camera views**, open **Add a view**, type a name and tick up to 4 cameras.
2. Press **Add view**. It becomes a tab on the panels' camera page. Protect's own views come from Protect.

> **Note:** Cameras of your own need the built-in camera video. If the page says so, clear the separate go2rtc address in Integrations → Cameras.

See also: [Cameras: the Live view](#cameras-live) · [Cameras on a panel](#panel-cameras)

<a id="calendars"></a>
### Calendars

*Where: Sidebar → Admin → Integrations → Calendars (the admin)*

The panels' calendar cards read your real calendars through their subscription link (iCal / ICS). Nothing on a panel can change your calendar.

1. Copy the calendar's iCal link (**Where do I find the link?** on the card explains Google, Outlook, iCloud and others).
2. **Sidebar** → **Admin** → **Integrations** → the **Calendars** card.
3. Type a name, paste the link, pick a color, press **Add**.
4. A few seconds later the card shows how many events it found — or what went wrong.
5. Per panel: [People & calendars on a panel](#people-calendars).

**Check now** reads it at once. **Replace** puts in a new link. **Remove** only takes it off the panels.

> **Note:** The link is a secret: anyone with it can read that calendar. Skypane never shows it again. If it leaks, reset it at your calendar provider and **Replace** it here.

Until you add one, the panels show sample events.

See also: [People & calendars on a panel](#people-calendars)

<a id="backgrounds"></a>
### Backgrounds

*Where: Sidebar → Manage → Backgrounds*

**Backgrounds** has two views (the switch at the top right, or V): **Gallery** — big tiles of the built-in scenes and your own pictures — and **List** — their size, who added them, when, and what uses them. Pick one for its card on the right.

1. **Upload** (top right): choose a picture, give it a name. It's made smaller first, which also removes hidden data such as where a photo was taken.
2. **Use on a panel…** on its card puts it on a panel straight away — or **Panels** → the panel → **Look & layout** → **Background & sky** ([Background and sky](#sky)).

Want the animated sky above your picture? Make the sky part of the picture transparent, or pick **No sky** for a photo with its own sky.

**Used by** lists which panels use a picture. **Remove** asks first; one that's in use needs your password, and those panels go back to the mountains. A picture whose file went missing shows the mountains too.

See also: [Background and sky](#sky) · [Icons and pictures for devices](#icons)

<a id="icons"></a>
### Icons and pictures for devices

*Where: Sidebar → Manage → Icons*

**Icons** shows every picture a device can have: the built-in **line icons** (they follow each panel's theme), the animated **drawings** for big cards, and your own **uploads** (they keep their own colors). **Gallery** or **List**, a filter and a search; **Show them on** draws them as a switched-on device.

1. **Upload** (top right): choose the kind and the file, give it a name, **pick the device types it fits**, press **Upload**.
2. **Use for a device…** on its card gives it to a device — or **Devices** → the device → **Picture**, or in the layout builder a card's **Icon**.

**Used by** lists the devices using it (a click opens the device). Each built-in set shows who made it and its license.

See also: [Devices: the Basic view](#devices) · [Backgrounds](#backgrounds)

<a id="cards-people-make"></a>
### Cards people make (install a card)

*Where: Sidebar → Manage → Cards*

**Cards** lists the installed cards: **Gallery** (each card's face) or **List** (version, author, when it was checked, where it's used). Its card on the right shows the card running with made-up values and what it may do.

1. **Install a card** (top right): choose a .json file, paste the card's JSON, or pick an example.
2. Press **Check it**. Read **What it may do** and **What the automatic scan found**.
3. Optional: **Ask an AI…** copies a ready-made question for a second opinion.
4. Tick the box and press **Install**.
5. **Add to a layout…** opens a panel's layout builder: the card is under **Your cards**; pick which of your devices it gets.

Every such card runs sealed off: it can only see the devices you give it, and only send commands after someone touches it.

> **Note:** **Changed since checked** — the card's code no longer matches what was checked when it was installed (its file was edited on the server). Install it again from its file to check it again.

See also: [Card types (a short list)](#card-types)

<a id="guest-wifi"></a>
### Guest Wi-Fi

*Where: Sidebar → Admin → Guest Wi-Fi*

1. **Sidebar** → **Admin** → **Guest Wi-Fi**.
2. Without a UniFi console: type the **Network name** and **Password** (or switch on **Open network**) and press **Show it on the panels**. The panels show the new code within a minute.
3. With your UniFi console connected (**Integrations → Guest Wi-Fi console**): pick the **Guest network**; **Show** or **Copy** its password; choose when it changes (**After guests leave**, **And every** …) or press **Change password now**. Skypane then changes the guest password by itself, and the panels' QR code follows. Without a console you change the password by hand.
4. **On the panels**: **Show**, **Hide** or **In guest mode** for each panel's card (the same switch as Panels → Setup → Guest Wi-Fi card).

The side card shows the card as the panels show it, and who may change this page (the admins and the logins allowed **Guest Wi-Fi settings**).

**Guest modes** lists Hubitat's guest-mode switches; they are switched on the panels, behind the PIN.

**Picture in the middle of the code** (admins): the Skypane icon, or one of your own pictures — upload it on **Icons** first.

**When guests stay (guest lockdown, admins)**

Pick a Hubitat switch (e.g. “Guest mode all”) and the panels that lock down while it is on: either **Everything asks for the PIN**, or **Screen off until touched** (then the PIN for anything, and off again after a short time). Motion and presence don't wake the screen while it's on. Each chosen panel's **Safety** tab shows it.

**Blur the calendar** has its own choice of panels, apart from the lock: while the switch is on, the calendar card on those panels is blurred — events and names unreadable, the card stays in place, with a small "Hidden while guests stay" label. A tap on it asks for the panel PIN and shows it for a short while. A panel can blur its calendar without locking down, or both.

> **Tip:** What a locked panel looks like and how to unlock it: [Guest lockdown on a panel](#guest-lockdown).

See also: [Guest lockdown on a panel](#guest-lockdown) · [Guest Wi-Fi card on a panel](#guest-card) · [Safety: PIN windows and unlocking on a panel](#panel-safety)

<a id="guest-lockdown"></a>
### Guest lockdown on a panel

*Where: Sidebar → Admin → Guest Wi-Fi → When guests stay (the admins)*

While the Hubitat switch picked under **When guests stay** (e.g. “Guest mode all”) is on, the panels picked there lock — within a second of the switch changing, and they unlock by themselves when it goes off.

- **Everything asks for the PIN**: the panel shows a calm full screen with the clock, **Guest mode — please ask the owner** and **Unlock**. Nothing under it can be switched or opened.
- **Screen off until touched**: the screen stays black. A touch shows the same screen; with no touch it goes black again after the time picked there (**off again after** … seconds).

1. Tap **Unlock** and type the panel PIN.
2. The panel works as usual — Settings too, behind the PIN as always — for the panel's PIN window counted from that PIN ([Safety: PIN windows and unlocking on a panel](#panel-safety), a minute by default, at most 5 minutes; a window set to never relock is 5 minutes here), or less when nobody touches it. Touches don't make it longer. Then it locks again by itself and the PIN is forgotten.

Only the PIN typed on the lock unlocks it: a PIN window that was open before guest mode came on ends when it does, and a PIN typed for something else (an alert, a door) doesn't unlock the panel. While it's locked nothing under it can be reached by touch or keyboard.

After a reload, a restart or a lost connection the panel starts locked and stays locked until the hub tells it the switch is off. It remembers the switch's last state: if that was on, it stays locked for as long as the hub is silent; if it was off, it opens again after 2 minutes without news — so a panel that was offline when guest mode was switched on may open after 2 minutes if it can't reach the hub.

Level 4–5 alerts still come over the lock, full screen, and are dismissed with the PIN as always.

While it's on, nothing else wakes or opens the panel: the tablet's own motion or presence wake shows only the black screen (or the lock), and doorbell or alert camera pop-ups aren't shown.

**Open live** from the Manager shows the lock too, with a line saying the panel is in guest lockdown. The layout builder's canvas is never locked.

> **Tip:** No panel PIN set? Then the panel can't be unlocked on the wall — the admin sets one in **Panels** → **Setup** → a panel → **Safety** → **Panel PIN** ([The panel PIN](#panel-pin)), or switch guest mode off.

> **Note:** The layout builder's canvas address (the panel's address with **?design=1**) shows the panel without the lock. On a wall tablet keep the kiosk app's address bar hidden (FreeKiosk: kiosk mode on), so a guest can't type it.

See also: [Guest Wi-Fi](#guest-wifi) · [Safety: PIN windows and unlocking on a panel](#panel-safety)

<a id="settings-admin"></a>
### Integrations

*Where: Sidebar → Admin → Integrations (the admin)*

**Sidebar** → **Admin** → **Integrations** (admins only).

How Skypane reaches your hub (**Home hub**), the **Message broker**, **Cameras** (UniFi Protect and the camera video), your **Guest Wi-Fi console** (UniFi), **UniFi Network** ([UniFi Network and the Network cards](#unifi-network)), **Weather** (the Hubitat weather device and your own OpenWeatherMap key: [Weather warnings and the weather device](#weather)), **Calendars** ([Calendars](#calendars)), **Music** and the **General** settings. Each group starts with its **Status** from the health checks.

1. Change what you need. A bar at the bottom counts the changes waiting.
2. A secret (a token, a key, a password) shows only as “•••• set”: **Replace…** asks for the new one, **Clear** removes it. It is never shown again.
3. Press **Save and restart**. Skypane restarts its services: the page shows **Restarting — back in a few seconds** and reloads by itself when Skypane is back (usually within a few seconds). **Discard** forgets the changes.

The side card **Connections** shows each part's state; **Check now** runs every check at once. There is no test button per field on purpose: save, and the checks tell you.

The **Login for devices** (the built-in broker) is for FreeKiosk and other MQTT devices: use **Copy user** and **Copy password** — never type it by hand.

Address fields take a bare IP too (192.168.1.10): http:// is added for you.

Open Skypane by its IP address (for example http://192.168.1.20:8088/). A name like skypane.local only works when it is set in the container variable ALLOWED_HOSTS.

A device shows on a panel but won't switch: set the container variable BRIDGE_ALLOW to its Hubitat device number. In either one, "none" clears a value saved in the Manager before v3.0.3.

**Setting a container variable:** a restart isn't enough — the container has to be re-created (your data stays). **Unraid:** **Docker** → Skypane → **Edit** → **Add another Path, Port, Variable** → Config Type **Variable**, Key ALLOWED_HOSTS (or BRIDGE_ALLOW), Value skypane.local → **Add** → **Apply**. **Docker Compose:** add the line - ALLOWED_HOSTS=skypane.local under environment: in compose.yaml, then run docker compose up -d. **docker run:** docker rm -f skypane, then the same docker run again with -e ALLOWED_HOSTS=skypane.local added. The container's start-up log says where each value comes from.

**Camera video server** with a login (http://user:password@host:1984): the Manager's pictures use the login, but the panels get the address without it — they can't keep a password secret. Let the panels in without one on that go2rtc (for example its allow-list of addresses), or leave this empty and use the built-in camera video.

See also: [Calendars](#calendars) · [UniFi Network and the Network cards](#unifi-network) · [Display settings: units and date formats](#display-settings) · [Set up a tablet (FreeKiosk)](#tablet-setup) · [Health and the health pill](#health)

<a id="unifi-network"></a>
### UniFi Network and the Network cards

*Where: Sidebar → Admin → Integrations → UniFi Network (the admin)*

With your UniFi console connected, the builder's **Network** cards show your internet lines, the gateway, switches, access points and the UPS, PoE power, the network map, clients and a client log.

1. **Integrations** → **Guest Wi-Fi console**: the UniFi console address and its UniFi Network API key (UniFi Network 10 or newer, from an admin with full Network management) → **Save and restart**. The Network cards read the same console.
2. **Integrations** → **UniFi Network** says **Connected**, or **Trouble** with what went wrong in plain words.
3. Its settings (saved at once, no restart): rename each internet line and pick its connection type (fiber, cable, satellite…; cleared, it goes back to UniFi's name), the **“New device joined” notice** on or off and on which panels, guests hidden on the panels, the **PoE warning** (50–100 %, 80 % at first), and the **Client log** on or off, kept 1 or 7 days.
4. In the layout builder, add cards from **Network**: Internet, Network map, Status tabs, Clients & gateway, UniFi devices, PoE power, Clients, Client log and Network values. Each has a Style (A / B / C) and its own colors. On the **Network map**, drag the parts where you want them (Snap to grid, Show ports, Reset layout).

- Skypane reads the console only while someone looks — a panel with a Network card or the Manager in the last 2 minutes — then every 30 seconds.
- No API key, IP address, MAC address or serial number goes to a panel or the Manager.
- Client names come from UniFi itself. The UNVR and the cameras are on the map, never in the Clients list. Guests are hidden on the wall panels at first (the Manager shows them).
- A **new device** (first time ever seen) is a small notice at the bottom of the panels, gone by itself — not one of the 1–5 alerts. Tap it for Clients.
- The client log (joined, left, moved to another access point) is also in **Health** → **Timeline** → **Network**.
- The Network cards stay hidden on the panels while UniFi Network isn't connected; the builder's canvas says why.

> **Note:** Not yet: **Recordings & NVR** (days left, disks) needs a Protect login — Protect's API key can't read the recorder's storage.

See also: [Integrations](#settings-admin) · [Guest Wi-Fi](#guest-wifi) · [Health → Timeline: what happened, and who did it](#health-timeline)

<a id="display-settings"></a>
### Display settings: units and date formats

*Where: Sidebar → Admin → Display settings (the admin)*

One set of units and formats for the whole house: every panel follows it, and a change shows on the panels in a few seconds.

- **Temperature** °F or °C; **distance and speed** in miles, kilometers, knots or meters (wind in mph, km/h, kn or m/s); **pressure** in inHg or hPa; **rain** in inches or mm.
- **Date and time**: Automatic, the language's own, or one of nine formats (such as dd/mm/yyyy 24 hour), with an example. The week starts on Sunday or Monday.
- The **decimals** for temperature and wind, rain and pressure.

The clock, calendar headings and the week row, events, alerts, logs, the weather card, thermostats and room temperatures follow it. Health → Timeline uses the house's date and time format for every login.

A panel can keep its own temperature and wind units: a switch here, or **Follows the house** in that panel's **General** settings ([A panel's General settings](#panel-general)).

After the upgrade the house took the units most panels already showed; a panel that showed others keeps them as its own. The date format starts on Automatic, the look the panels had.

See also: [A panel's General settings](#panel-general) · [Weather card: places, source and days](#weather-places)

## Alerts

<a id="alerts-hubitat"></a>
### Alerts come from Hubitat

*Where: Hubitat rules → the Skypane Notifier device*

Skypane has no alert rules of its own. Every alert is made in Hubitat: a Rule Machine rule or webCoRE piston sends it to the **Skypane Notifier** device, with a level and which panels get it.

- Level **5 Life safety** — gas, smoke, heat, carbon monoxide, intrusion. Fills the screen with the alarm sound (also in quiet hours), asks for the PIN to dismiss.
- Level **4 Damage** — a water leak. The same as level 5.
- Level **3 Action needed** — a mouse trap, a package at the door, doors left open at bedtime. A note with a gentle sound; stays until dismissed.
- Level **2 Finished** — the washer, dryer or dishwasher is done. A silent note for 60 seconds.
- Level **1 Reminder** — calendar events. A short tone and a note for 60 seconds.

One alert shows at a time: the highest level, and the newest within a level. Others wait in **Notifications** on Home (and a Notifications card), where you can read and dismiss them — nothing pops up after you dismiss the one on screen.

Dismissing a level 3, 4 or 5 alert clears it on every panel. Levels 1–2 are dismissed per panel.

A level 4–5 is only cleared with the panel PIN, and Skypane checks that on the server too: the panel gets a one-time pass for that alert, good for 30 seconds. If it ran out, the alert comes back on screen with “Not dismissed … Try again”.

Every dismissal goes back to Hubitat. A rule can react, for example turn the sirens off when someone taps **Dismiss**.

How each panel shows alerts: [Alerts on a panel: levels, quiet hours, light](#panel-alerts). Setting up the driver: [The Skypane Notifier driver (Hubitat)](#notifier-driver).

See also: [The Skypane Notifier driver (Hubitat)](#notifier-driver) · [Alerts on a panel: levels, quiet hours, light](#panel-alerts)

<a id="notifier-driver"></a>
### The Skypane Notifier driver (Hubitat)

*Where: Hubitat → Drivers Code*

**Install it (on the hub)**

1. Hubitat → **Drivers Code** → **+ New Driver** → **Import** → the same address you open the Manager with, without /admin, followed by /hubitat/SkypaneNotifier.groovy — e.g. http://192.168.1.50/hubitat/SkypaneNotifier.groovy on Unraid, or http://192.168.1.20:8088/hubitat/SkypaneNotifier.groovy with Docker (Skypane serves the driver itself) → **Import** → **Save**. Import says “Failed to fetch”? Open that address in your browser, copy everything and paste it into the **New Driver** box instead.
2. **Devices** → **Add Device** → **Virtual** → **Device Name:** Skypane, **Type:** *Skypane Notifier* (namespace skypane) → **Save Device**.
3. **Apps** → **Maker API** → tick the new device. (Needed so a dismiss on a panel reaches Hubitat.)

**Send an alert**

In a rule: run a custom action on the Skypane device. The commands: critical(text, tag), alert(text, tag), warning(text, tag), notice(text, tag), info(text), or notify(text, level, panels, title, seconds, tag) to pick panels.

Give every alert you want to clear later a **tag**. Sending the same tag again replaces it. dismiss(tag) clears it; dismissAll() clears all.

**React to a dismiss**

The device is also a button device: buttons 1–5 are pushed when someone dismissed an alert of that level; button 6 for **Dismiss all** (it never clears a level 4–5 — those need the PIN). For example: Skypane button 5 pushed → sirens off.

> **Tip:** Example for a leak: Trigger: kitchen leak sensor wet → Skypane: critical(“Water leak — kitchen sink”, “leak”). Trigger: sensor dry → Skypane: dismiss(“leak”).

**Start a timer**

notify(“Timer: Emma, Free time”) starts every Countdown & timers timer named Emma with the Free time preset; Timer: Pizza, 0d00:20 runs it for 20 minutes (days, then hours:minutes). It isn't shown as an alert ([Countdown & timers](#timers)).

<!-- (v3.0.5) the Skypane Helper app: how it links, the signed updates, and what unlinks it -->
**Keep it up to date: the Skypane Helper app**

The optional **Skypane Helper** app on the hub can update this driver for you (**Integrations** → **Hubitat** → **Link the Helper**, then type the code in the app). The link gives the app a token and a key of its own; every update Skypane offers is signed with that key, and the app checks the signature, the code's sha256 and that it is the Skypane code before it saves anything.

> **Note:** If Skypane answers the app with 401 or 403 (you unlinked it in the Manager, or Skypane lost the link), the app **unlinks itself**: it stops asking and its page says “Not linked”. Make a new link code in the Manager and type it in the app again.

<!-- (v3.0.7) the Helper is the hub link: OAuth, its own token, no Maker API, no fallback -->
**The Skypane Helper is the hub link (3.0.7)**

Since 3.0.7 the Helper does Maker API's job: **Integrations** → **Hubitat** → **Set up with the Skypane Helper** walks you through it. The app makes its own access token (OAuth must be on for it: Hubitat Package Manager turns it on; by hand, **Apps Code** → **Skypane Helper** → **OAuth** → **Enable OAuth in App** → **Update**), makes the Skypane Notifier as its own child device, and Skypane sees only the devices you pick in the app.

> **Note:** There's no fallback: if the Helper stops answering, Skypane shows a problem on **Integrations** → **Hubitat** and never moves back to Maker API by itself. A hub that already uses Maker API moves over on **Switch from Maker API** (test one light, then remove the Maker API settings).

<!-- (v3.0.7) review: the Helper's access token works through Hubitat's cloud endpoint too -->
> **Note:** Treat the Helper's access token like a password: it also works through Hubitat's cloud endpoint, not only on your network. Skypane keeps it on the server only and never shows it. Unlinking or reinstalling the app makes a new one (the old one stops working).

See also: [Alerts come from Hubitat](#alerts-hubitat) · [Countdown & timers](#timers)

<a id="weather"></a>
### Weather warnings and the weather device

*Where: Sidebar → Admin → Integrations → Weather (the admin)*

Skypane can use a weather device on your Hubitat hub. Its warnings (tornado, flood, severe storms and more) appear on the panels like any alert, and its weather fills the weather card's first tab (**Home**). Without one, the panels use Open-Meteo.

**In Hubitat**

1. Install the community **OpenWeatherMap-Alerts Weather Driver** with Hubitat Package Manager, or with **Drivers Code** → **+ New Driver** → **Import** and the driver's address from the Hubitat community.
2. Get an API key at openweathermap.org. The driver uses OpenWeatherMap's One Call API: a new key needs the **One Call by Call** subscription (One Call 3.0). It asks for a payment card, but the first 1,000 calls a day are free.
3. **Devices** → **Add Device** → **Virtual** → **Type:** *OpenWeatherMap-Alerts Weather Driver* → **Save Device**. Paste the API key, turn **API Key Version** on (3.0) and type your city.
4. Set **Weather Alert Source** to weather.gov (in the US) or OWM, and both poll intervals to 30 minutes for the fastest warnings. A warning takes up to one update interval to appear on the panels and to clear; with more than 2 hours between updates the weather card shows Open-Meteo in between.
5. Turn on the attributes Skypane reads: **Weather Alert**, **Condition Code**, **Condition Text**, **Forecast High/Low Temperatures**, **Forecast Code**, **Forecast Text**, **Today's Precipitation Probability**, **Precipitation Forecast**, **Local SunRise and SunSet**, **Wind Speed** and **Observation time**. Press **Save Preferences**.
6. **Apps** → **Maker API** → tick the weather device → **Done**.

**In Skypane**

1. **Integrations** → **Weather** → pick the device. (It shows up a few minutes after you tick it in Maker API.)
2. Leave **Show its warnings** on, or switch it off. Which weather each card shows is now the card's own **Weather from** setting ([Weather card: places, source and days](#weather-places)).
3. Choose the **Panels that show warnings**, and under **Warning levels** which level each kind of warning gets.

The levels: tornado, flash flood, hurricane and other extreme warnings are level 5; other warnings are level 4; watches are level 3; advisories and statements are level 2. Levels 4 and 5 fill the screen, sound, and need the panel PIN to dismiss — like any alert.

A warning goes away by itself when the device stops reporting it. A dismissed warning stays dismissed while the device keeps reporting it; a watch that becomes a warning, or a warning issued again after it ended, shows again with its sound.

> **Tip:** When the device's data hasn't changed for 2 hours, the weather card goes back to Open-Meteo until it updates. The Weather group on Integrations says which one the panels use now.

> **Note:** This driver reports only the first warning's name and text, and how many more are up. The panels show the first one and say how many more there are.

The driver's author has marked it as no longer maintained (March 2026), but it still works. Another weather driver can work too: **How the device reports** lets you name its attributes.

Only an admin can choose the weather device. Pointed at a device that isn't a weather device, Skypane only reads its values: the weather card shows whatever it reports (or Open-Meteo when it has no temperature), and nothing else changes.

**Your own OpenWeatherMap key (optional)**

**Integrations** → **Weather** → **OpenWeatherMap key**. With it, Skypane fetches One Call 3.0 once for the house every 15 minutes — the weather now, 48 hours, 8 days and warnings — and every panel shares it. It stays within 800 calls a day (OpenWeatherMap is free up to 1,000), even across restarts. Days 9–14 come from Open-Meteo. The key shows only as set or not set; it's never sent to a panel and never logged.

With the key, OpenWeatherMap's warnings join the panels' alerts the way the weather device's do: the same levels, panels and dismissing. A warning both report shows once. Without a weather device they're the only warnings.

See also: [Alerts come from Hubitat](#alerts-hubitat) · [Integrations](#settings-admin)

## Accounts and health

<a id="accounts"></a>
### Accounts and permissions

*Where: Sidebar → Admin → Accounts (admins)*

Admins let other people sign in to the Manager, each with their own name and password. A new login sees only the panel you give it.

1. **Sidebar** → **Admin** → **Accounts** → **Add login**: type the name, its password (4 or more characters), pick **Their panel** and a start (**Family** or **Limited**). Press **Add login**.
2. **One** (the view switch, top right): pick a login with the button at the top. Its rows save as you change them: **Panel** (their panel; own or all panels) and **May also manage** (guest Wi-Fi, backgrounds — **No**, **Upload only** or **Full** —, icons, cards, devices, cameras).
3. **Family** and **Limited** only fill the boxes; you can change each one afterwards.
4. The side card shows **What they see** — every page as can change, view only or hidden — and their **Sign-ins**. Its button opens their sign-ins and changes in Health → Timeline.
5. **All**: every login as a column, the same rights in rows — handy to compare. **Open** goes back to One for that login.

**Rename** gives a login a new name (it signs in again with it). **Set a new password** gives a user a new one (and signs it out everywhere). **Make a sign-in code…** gives them a one-time code instead. **Unlock** opens a login locked after too many wrong passwords.

Integrations and Accounts are always the admins'. More about admins and the owner: [Admins, the owner and sign-in codes](#admins-owner).

> **Tip:** A page that says “Your account isn't allowed to …” means no admin has ticked that permission.

See also: [Admins, the owner and sign-in codes](#admins-owner) · [Your account: password, sign-ins, look and language](#my-account)

<a id="admins-owner"></a>
### Admins, the owner and sign-in codes

*Where: Sidebar → Admin → Accounts → a login → Role*

The first login made on a new Skypane is the **owner**. The owner is an admin who can't be removed or demoted by anyone — so there is always an admin.

1. **Make another login an admin**: Accounts → the login → **Role** → **Admin**. Give them a new password of 8 or more characters (an admin's minimum); they sign in with it.
2. **Make an admin an ordinary login again**: **Role** → **User**. Their old rights come back.
3. **Hand over ownership** (the owner only): pick another admin → **Hand over ownership…**. You stay an admin.

Acting on an admin (their role, a sign-in code, unlocking), removing a login and handing over ownership first ask for **your own password** (“Confirm it's you”). It then holds for 10 minutes on that browser.

**A forgotten password**

An admin's password is never typed in by someone else. Another admin presses **Make a sign-in code…**: the old password stops at once, and the person types the code with a new password on the sign-in page (**I have a sign-in code**). A code works once, for an hour; it is shown only once and never kept. Wrong tries are counted per device; after too many the code stops and both of you are told.

**The owner's password** can't be reset by another admin at all — only with the reset command on the server. Otherwise an admin could reset it, sign in as the owner and take the house over.

The reset command (the owner, or when every admin is locked out): on the server running Skypane, docker exec -it <your Skypane container> python service/reset_login.py --user <name> (no --user: the owner). It asks for the new password there, or prints a code for the sign-in page. A login that signed in with a code can't hand over ownership for a day.

> **Tip:** Who did what is in Health → Timeline: who made whom an admin, who made a code for whom — never the code or any password.

See also: [Accounts and permissions](#accounts) · [Health → Timeline: what happened, and who did it](#health-timeline)

<a id="my-account"></a>
### Your account: password, sign-ins, look and language

*Where: Your avatar (top right) → Your account*

1. Your avatar (top right) → **Your account** (or **Change password**, which takes you straight to it).
2. **Profile**: the **Name shown** in the avatar menu and the **Avatar color**. Your sign-in name only an admin can change.
3. **Password**: type the current one and the new one twice, press **Change password**. Your other browsers are signed out.
4. **Sign out on every other browser**: if you signed in somewhere you shouldn't stay signed in. This browser stays signed in.
5. **Language**: yours only — every login picks its own. English for now; more languages are on the way.
6. **Theme**, **Keep the sidebar open** and **Default views** (which view each page opens in).

The side card shows this browser and **Your recent sign-ins**, wrong passwords on your name included. Something you don't recognize? Change your password, then sign out the others.

> **Tip:** Your look and language are kept for your login on the server — the same on every computer you sign in on.

**Forgot it?**

Ask an admin for a sign-in code (Accounts → your name → **Make a sign-in code…**), then on the sign-in page press **I have a sign-in code**. The owner uses the reset command on the server instead. More: [Admins, the owner and sign-in codes](#admins-owner).

The Manager signs you out after 30 minutes without use.

See also: [Accounts and permissions](#accounts) · [Admins, the owner and sign-in codes](#admins-owner)

<a id="health"></a>
### Health and the health pill

*Where: The health pill in the top bar → Open Health (or Overview → Open Health)*

Skypane checks every 30 seconds what it needs: the Hubitat bridge and hub, the message broker, camera video, UniFi Protect, your UniFi console and every panel.

1. The health pill in the top bar has a dot for the hub, the broker, the cameras and the panels (green: fine; amber or red: a problem; gray: not set up) and a number for problems you haven't looked at yet.
2. Click it to see the last ones. Click one, or **Open Health**, to open the **Health** page.
3. The Health page starts with four cards — **Hub**, **Broker**, **Camera video** and **Panels**: is it working, since when, and what to do. A part this house doesn't use is gray, “Not set up”.
4. Under them, **Needs a look** lists every problem up now (**Open** goes to that panel), then the **Log** of what went wrong and when it was fixed, and the panels with when each last checked in.

Each card has a small bar per hour of the last day: green fine, amber trouble, red down, gray not checked that hour. Admins can press **Check now** to run every check at once.

A panel that says “Never checked in — set up its tablet” has no tablet showing it yet.

On a tablet, problems show as a small “⚠ Issues detected” bar. Tap it for the list.

See also: [Health → Timeline: what happened, and who did it](#health-timeline) · [“Not connected to the hub” or “Lost connection”](#not-connected)

<a id="health-timeline"></a>
### Health → Timeline: what happened, and who did it

*Where: Health → Timeline (the view switch, top right)*

The Timeline puts everything that happened in one list, newest first, grouped by day: health problems and when they were fixed, sign-ins (and wrong passwords), account changes, settings, panel changes, alerts acknowledged, pictures and cards.

1. **Health** → **Timeline**.
2. The chips filter it: **Problems**, **Sign-ins**, **Accounts**, **Panels**, **Cameras**, **Alerts**, **Settings**. **Find…** searches the words; the list on the right picks how far back (today up to as long as the log keeps).
3. **Show older** loads more. Admins can **Export** what is shown as a CSV file.

Admins see everything. Any other login sees its own sign-ins and changes, and the health of its panels.

Kept for 90 days unless an admin picks 30 or 365 days in **Keep** on the right (the log takes about 2 MB at 30 days, 5 MB at 90, 15 MB at 365). A shorter time deletes the older events at once — it asks first — and the change shows in the Timeline. Never in it: a password, a PIN, a sign-in code, a token or key, a camera's stream — and a name typed at sign-in that isn't a login (it may have been a password in the wrong box).

See also: [Health and the health pill](#health) · [Admins, the owner and sign-in codes](#admins-owner)

## On the tablet

<a id="tablet-setup"></a>
### Set up a tablet (FreeKiosk)

*Where: Panels → Setup → (a panel) → General → Set up the tablet*

Pair the tablet in the browser it will keep using — for FreeKiosk, inside FreeKiosk. The panel's key stays in that browser.

1. Connect the tablet to your home Wi-Fi. (A fixed address isn't needed: the panel follows the tablet, not its IP.)
2. Install FreeKiosk. Allow what it asks for, so it can stay on screen.
3. FreeKiosk → start page: the Skypane address, http://<your server>/. Start on boot: on. Kiosk mode: on. Keep the screen on: on. Zoom: 100 %.
4. Restart FreeKiosk. It shows **Connect this panel** with a 6-character code. Approve it in the Manager under **New panel requests** ([Connect a tablet: pairing with a code](#panel-pairing)). The tablet then opens its panel by itself — the start page can stay as it is, it forwards.
5. FreeKiosk → MQTT: broker <your server> port 1883, the user and password from **Integrations → Message broker → Login for devices** (use **Copy user** and **Copy password**), and the panel's **FreeKiosk device name** (**Panels** → **Setup** → the panel → **General** → **Set up the tablet**).
6. Check that the version tag in the panel's lower-left corner matches the Manager's.

**The PoE wall tablet's LED agent** (its LED strip and sensors) keeps MQTT settings of its own, apart from FreeKiosk's. With the built-in broker the panel page sets the agent up by itself (on the tablet, port 852): within a minute **Its tablet** shows **LED agent: Connected**. Put the agent on each such tablet once, with or without root ([The LED agent (PoE wall tablet)](#led-agent)); after that it updates itself. On such a tablet, open Skypane by its IP address (http://192.168.1.5/, not a name): the agent connects to that address. A separate broker: the agent's agent.args is still set by hand.

An iPad or any browser works too. If you skip the MQTT part, you go without screen wake, volume control and spoken alerts. On an iPad, open Skypane's address in Safari, Share → **Add to Home Screen** first, then open it from the Home Screen icon and connect it there (a Home Screen app keeps its own storage, apart from Safari) (sorry iPad users — blame Apple).

See also: [Connect a tablet: pairing with a code](#panel-pairing) · [Add a panel (a new tablet)](#add-panel) · [The tablet's own Settings (the gear)](#tablet-settings) · [“Unable to connect” and other pairing problems](#not-set-up)

<a id="led-agent"></a>
### The LED agent (PoE wall tablet)

*Where: Help & guides → LED agent*

Only for the PoE wall tablet with a built-in LED strip: a small program, the **LED agent**, drives the strip and reads the tablet's sensors. Any other tablet doesn't need it.

**Download the LED agent** (in the Manager) · the step-by-step guide: `http://<your Skypane>/guides/led-agent.html`

1. Download the LED agent on a computer and unzip it.
2. Open the step-by-step guide: developer mode, USB or network debugging, adb, then one install command — with root, or without it.
3. Without root: switch on **LED agent without root** for the panel (**Panels** → **Setup** → the panel → **General** → **This tablet**).
4. Within a minute **Its tablet** says **LED agent: Connected**, with its version.

From then on the agent **updates itself** from this Skypane: it asks only the Skypane that set it up, with its own token, and checks each new build (its version and sha256) before it runs it. **Its tablet** says **update available** while it is older; an agent from before Skypane 3.0.5 can't update itself, so put the new one on once.

> **Note:** Without root the agent can't start by itself after the tablet restarts: run the one start line from the guide again then. The LED strip works without root only when the tablet lets adb's shell user use it (the guide's check tells).

See also: [Set up a tablet (FreeKiosk)](#tablet-setup) · [A panel's General settings](#panel-general)

<a id="tablet-settings"></a>
### The tablet's own Settings (the gear)

*Where: On the panel: the settings gear*

Every panel has a small settings gear. It asks for the panel PIN (once a PIN is set).

- **Look** — colors, clock, text size.
- **Sound** — volumes and the clock chime.
- **Panel** — LED strip, **Child lock**, **Panel PIN** (change it with the old PIN), screen.
- **Guest mode**, **Weather effects**, **Test** (test alerts and events).
- **More (Manager)** — the Manager's address, for everything else.

Most settings are made in the Manager. The panel's own settings are for quick changes at the wall.

See also: [The panel PIN](#panel-pin) · [Child lock](#child-lock)

<a id="panel-pin"></a>
### The panel PIN

*Where: Panels → Setup → (a panel) → Safety → Panel PIN (the admin), or on a panel: Settings → Panel → Panel PIN*

One PIN for every panel. It's asked for when opening the tablet's Settings, unlocking, opening a garage or valve, a device marked to ask, and dismissing a level 4–5 alert.

**In the Manager (the admin)**

1. **Panels** → **Setup** → any panel → **Safety** → **Panel PIN**.
2. **Set PIN…** (or **Change PIN…**): the new PIN twice (4 to 8 digits), then your own Manager password. The old PIN isn't needed. **Clear…** removes the PIN.

**On a panel**

The gear → **Panel** → **Panel PIN** → **Change PIN**: the old PIN first, then the new one twice.

After a correct PIN the panel stays unlocked for a short while: 30 seconds for the alarm and level 4–5 alerts, a minute after the last touch for everything else (the admin sets both: [Safety: PIN windows and unlocking on a panel](#panel-safety)).

Too many wrong PINs lock the PIN pad for a while; it counts down (“Try again in 0:24”). Settings and the rest: 5 wrong → 5 minutes. Dismissing a level 4–5 alert and disarming: 30 seconds, then 1, 2, 5 minutes (forgotten after 15 minutes without a wrong PIN). At most 30 wrong PINs an hour on one panel, all together. A PIN pad opened during a lock-out counts down at once.

The screen holds still while the PIN pad is open: nothing behind it moves or jumps while you type.

The alarm (HSM) codes stay in Hubitat.

> **Tip:** Forgot the PIN? The admin sets a new one in the Manager (above) — it needs only the admin's own Manager password, and it ends any PIN lock-out too.

See also: [Safety: PIN windows and unlocking on a panel](#panel-safety) · [The tablet's own Settings (the gear)](#tablet-settings) · [Child lock](#child-lock)

<a id="child-lock"></a>
### Child lock

*Where: On the panel: Settings → Panel → Child lock*

Child lock stops the panel from being used, except the alarm keypad and Settings.

1. The gear → **Panel** → **Child lock**.
2. **Child lock now** — on or off.
3. **Lock automatically** — after 5, 10, 15, 30 or 60 minutes without a touch.

To unlock: open Settings (with the panel PIN) and switch **Child lock now** off.

See also: [The panel PIN](#panel-pin)

## Troubleshooting

<a id="not-set-up"></a>
### “Unable to connect” and other pairing problems

**“Unable to connect”**

- **“This panel is connected to another device”** — the panel belongs to another tablet. On the right tablet it works; on this one, press **Connect this device** and approve it with another name — or **Unlink device** on the panel first to give it to this tablet ([Connect a tablet: pairing with a code](#panel-pairing)).
- **“This panel isn't connected yet”** — no tablet was approved for this panel, or there is no panel at that address. Press **Connect this device** and approve the code with the panel's name.

**On the pairing screen**

- **“Pairing is closed”** — switch **Accept new panels** on (**Panels**, the New panel requests box).
- **The code changed** — it renews every 10 minutes: type the one the tablet shows now.
- **The request is gone from the Manager** — the tablet left the pairing screen (or went to sleep). Open the Skypane address on it again for a new request.
- **“That isn't the code on the tablet”** — 5 wrong codes cancel the request; the tablet then asks again with a new code.

**The tablet lost its key**

The tablet keeps two copies of its key; when only one was lost it says “Reconnecting this panel…” and goes on by itself. When both are gone (cleared browser data, a reinstalled browser or FreeKiosk, a new tablet) it shows the pairing screen. On the old panel press **Unlink device**, then approve the tablet with the same name — the panel's settings are kept.

**An empty Home with only the gear**

That's a new panel: it starts blank. Give it a layout in **Look & layout** and switch on the room bar ([Look & layout: theme, Home page, room pages](#look-layout), [The room bar](#room-bar)).

See also: [Connect a tablet: pairing with a code](#panel-pairing) · [Add a panel (a new tablet)](#add-panel)

<a id="not-connected"></a>
### “Not connected to the hub” or “Lost connection”

**“Not connected to the hub” (on a tablet)**

Skypane can't reach Hubitat right now, so nothing was sent and the tap was undone.

1. Open the health pill / **Health** in the Manager: it says what isn't working ([Health and the health pill](#health)).
2. Check that the hub is on and reachable.
3. Check **Integrations → Home hub** ([Integrations](#settings-admin)).

**“The Hubitat bridge isn't running” (on Devices)**

Your changes are saved; the panels get them when the bridge runs again.

**“Lost connection to Skypane — reconnecting…” (on a tablet)**

The tablet can't reach the server. Is it on the home Wi-Fi? Can it open the Manager's address in a browser?

See also: [Health and the health pill](#health)

<a id="trouble-other"></a>
### Other problems

- **A tablet shows an older version tag than the Manager** — tap the Refresh pill if it shows, or restart FreeKiosk.
- **“Your account isn't allowed to …”** or **“Your account can't see this yet”** — ask the admin to tick that permission or panel ([Accounts and permissions](#accounts)).
- **Signed out** — after 30 minutes without use. Sign in again.
- **Effects stutter** — run the benchmark, or lower the effects ([Weather effects and the benchmark](#weather-effects)). Try **Still sky** ([Background and sky](#sky)).
- **Screen on / off, volume or spoken alerts don't reach a tablet** — the MQTT settings in FreeKiosk: broker address, login, and the device name must match the panel's ([Set up a tablet (FreeKiosk)](#tablet-setup)).
- **The layout builder won't save** — it selects the card that isn't finished and says what's missing ([Undo, redo and saving a layout](#undo-save)).
- **A light shows the wrong colors** — **Devices** → the light → **Color command** → try the other way ([Devices: the Basic view](#devices)).
- **Calendar shows sample events** — no calendar is added yet ([Calendars](#calendars)).

> **Tip:** Something else? Skypane is a work in progress — send feedback from the Manager ([Sending feedback](#feedback)).

See also: [About Skypane](#about)
