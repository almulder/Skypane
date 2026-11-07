# Connect Hubitat

Skypane talks to your hub through the free **Skypane Helper** app, which you install on the hub once. The Helper makes
its own access token, installs the Notifier driver and makes the Notifier device for you. Skypane hears every change on
the hub's local event stream and sends commands to the Helper's own local endpoint. Left for you: install the app, link
it, and pick its devices.

You need: Skypane installed and signed in as an admin ([install-unraid.md](install-unraid.md) or
[install-docker.md](install-docker.md)), and a computer (the setup isn't on the phone layout).

Already using Maker API with Skypane? Set up the Helper below, then see
[Already using Maker API?](#already-using-maker-api).

## 1. Set up the Skypane Helper

Skypane Manager on a computer → sidebar → **Admin → Integrations** → **Home hub** → **Set up with the Skypane Helper**.
The page walks you through five steps. Each step checks itself live: you do the part on the hub, and the Manager says
when it sees it. The steps below follow that page.

(Screenshot: Set up with the Skypane Helper, with the five steps on the left.)

### Step 1 · Install the app

Do this once. Pick a tab on the Manager's page: **Hubitat Package Manager** (best) or **By hand**. Both addresses come
from your own Skypane, so they always match the version you run. Use the **Copy** button next to each one.

**With Hubitat Package Manager** (it also keeps the Helper up to date and turns OAuth on for you):

No Package Manager on the hub? Use **By hand** below.

1. On the hub: **Apps → Hubitat Package Manager → Install → From a URL**.
2. Paste the **Manifest address** from the Manager, e.g. `http://192.168.1.50/hubitat/packageManifest.json` (with
   Docker: `http://192.168.1.20:8088/hubitat/packageManifest.json`), and press **Next**, then **Next** again to confirm. It
   installs the Helper app with OAuth turned on.
3. Then **Apps → Add user app → Skypane Helper**.

**By hand** (no Package Manager):

1. On the hub: **Apps Code → + New App → Import**.
2. Paste the **Import address** from the Manager, e.g. `http://192.168.1.50/hubitat/SkypaneHelper.groovy`, press
   **Import**, then **Save**.
3. **Press OAuth → Enable OAuth in App → Update.** Don't skip this: without OAuth the Helper can't make its access
   token. (Package Manager does this part for you.)
4. Then **Apps → Add user app → Skypane Helper**.

In the Manager, press **The app is on the hub · Next**.

### Step 2 · Link it to Skypane

1. In the Manager, press **Make a link code**. It shows 8 characters, e.g. `K7MQ-2XPA`. The code is good for 10 minutes
   and works once. (**New code** makes another; **Cancel** stops it working now.)
2. On the hub, in the Helper app, under **Skypane**:
   - **Skypane address:** the address the Manager shows under **Skypane's address**, e.g. `http://192.168.1.50` on
     Unraid or `http://192.168.1.20:8088` with Docker (without `/admin`).
   - **Link code:** the code from the Manager.
3. Press **Done** on the hub.

The Manager says **Linked.**, and then that the Helper made its own access token and handed over its endpoint. Skypane
keeps that token; you never see it. If it says OAuth is off instead, see [Troubleshooting](#troubleshooting).

(Screenshot: step 2 in the Manager next to the Helper's Skypane section on the hub.)

### Step 3 · Give it your devices

Hubitat only lets an app use the devices you pick for it, so Skypane can only see and switch the devices the Helper was
given.

1. In the Helper on the hub: **Devices for Skypane → Select devices**.
2. Tick every device Skypane should show: lights, switches, outlets, fans, shades, locks, the thermostat, sensors,
   garage door, valves, speakers, the weather device. **Select all** is there too, but it's optional: pick just the ones
   you want if you like.
3. Press **Done**.

The Manager says how many devices the Helper has. One device is enough to go on. If the hub has devices the Helper
wasn't given, the Manager lists them as a warning (not an error): tick them on the hub, or press **Don't show these**
if you left them out on purpose.

### Step 4 · Hub login (only with Hub Login Security)

Only if **Hub Login Security** is on for your hub. Without it, the Manager says there's nothing to type and skips this
step.

With Hub Login Security on, the Helper needs the hub login to save the Notifier driver code and to count the hub's
devices.

1. In the Helper on the hub, under **Hub login (only when Hub Login Security is on)**: type the **Hub user name** and
   **Hub password**.
2. Press **Done**.

Type it on the hub, in the Helper, not in the Manager. **The login stays on the hub:** it's used there, by the hub, and
never sent to Skypane. Skypane only asks the Helper "do you have a login?", yes or no.

### Step 5 · Skypane does the rest

Nothing to do here. The Helper installs the **Skypane Notifier** driver on the hub and makes the Notifier device (named
**Skypane**) as its own child device, already linked. Each line checks itself, live:

- **Notifier driver installed**: the Helper saves the driver code on the hub.
- **Notifier device created**: a child device of the Helper.
- **Events for the Helper's devices**: the hub's event stream, only the devices the Helper was given.
- **Commands through the Helper**: Skypane reads and switches through the Helper's own endpoint.
- **Maker API no longer needed**: nothing of Maker API is used.

A line marked **Problem** shows its fix right under it. Do the fix and press **Check again**. When the first four lines
are **OK**, press **Finish**. **Integrations → Home hub** now says *Events and commands go through the Skypane Helper*.

(Screenshot: step 5 with every line OK.)

How you know it worked: within a minute **Devices** lists your devices, and the **Connections** card shows the hub as
working.

Also set **Admin → Integrations → General → Time zone** to yours (e.g. `America/New_York`). The **Message broker** group
stays **empty**: Skypane runs its own MQTT broker. Use it unless you know you want your own.

## 2. Later: new devices and updates

**A new device on the hub.** New devices aren't ticked in the Helper by themselves, and Skypane never adds any on its
own. On the hub: **Apps → Skypane Helper → Devices for Skypane**, tick the new device, then **Done**. Skypane shows it
within a few minutes, marked as new. Forgot one? **Integrations → Home hub** says how many devices on the hub aren't
given to the Helper, with their names. (Skypane can count them only when it can read the hub's device list: with Hub
Login Security on, that needs the hub login from step 4.)

**Updating the driver and the app.** The Manager does it for you: **Admin → Integrations → Home hub**, under
**Skypane Helper**:

- **Update the driver** saves the newest Skypane Notifier driver on the hub.
- **Update the app to …** shows when the Helper app is out of date.
- **Create the Notifier device** makes the Notifier again if it was removed.

The Helper picks the request up within a minute, and the Manager says what was saved (e.g. *Driver 3.0.6 saved on the
hub*). Each update is signed, and the Helper checks it before it saves anything. With Hub Login Security on, the Helper
needs the hub login for this (step 4). If the Manager says **Update required**, the hub didn't take the code: open
**Drivers Code** (or **Apps Code**) on the hub, click the Skypane item, then **Import** with the address the Manager
shows, and **Save**. With Hubitat Package Manager you can also update with its **Update** button.

## 3. The Skypane Notifier — alerts from your rules (recommended)

The Notifier is a small Hubitat driver. Your rules (Rule Machine, webCoRE, Basic Rules, HSM, Switchboard…) use it to
put alerts on the panels — a water leak, smoke, the garage left open — and to hear when someone dismisses one.

**The Helper sets it up for you** (step 5): it installs the driver and makes the **Skypane** device as its own child
device. You only test it:

- Open the **Skypane** device in Hubitat, type `Test` in the box next to **Info** and press **Info**. Within a few
  seconds every panel shows a short note "Test" (it goes away by itself after a minute). No panel set up yet? The
  Manager's **Overview** lists alerts that are waiting, so you can check it there too.

(Screenshot: the Skypane device in Hubitat with **Info**; the "Test" note on a panel.)

How to send alerts from a rule — the five levels, which panels, sounds, clearing — is in
[hubitat-notifier.md](hubitat-notifier.md).

**Already have a Skypane Notifier device** (your rules send to it)? Pick it in the Helper under **Skypane Notifier →
A Skypane Notifier you made yourself**, then **Done**, so your rules keep working.

**Install it by hand** only if step 5 shows a problem on **Notifier driver installed** (for example the hub refused the
login):

1. Hubitat → **Drivers Code → + New Driver** → **Import** → paste the address below → **Import** → **Save**.

   It's the same address you open the Manager with, without `/admin`, followed by `/hubitat/SkypaneNotifier.groovy` —
   e.g. `http://192.168.1.50/hubitat/SkypaneNotifier.groovy` on Unraid, or
   `http://192.168.1.20:8088/hubitat/SkypaneNotifier.groovy` with Docker.

   Skypane serves the driver itself, so it always matches your version. If Import says *Failed to fetch* (or doesn't
   work), open that address in your browser, copy everything on the page and paste it into the **New Driver** box
   instead.
2. Press **Check again** in the Manager: the Helper makes the Notifier device.

**Tried Skypane before 3.0? Otherwise skip this paragraph.** Skypane 3.0 installs the driver fresh (its namespace is now
`skypane`). Remove the old Notifier first. ⚠ Any rule that sends alerts to the old device stops working until you point
it at the new one, so first open the old device → **In use by** and note those rules. Then **Devices** → the old
*Skypane Notifier* → **Remove Device**, and **Drivers Code** → the old driver → **Delete**.

## 4. Weather (optional) — warnings and the weather card from Hubitat

A weather device on the hub can do two things for Skypane: put its **weather warnings** (tornado, flood, severe storms…)
on the panels as alerts, and feed the weather card's first tab (**Home**) instead of Open-Meteo. Skypane is made for the
community **OpenWeatherMap-Alerts Weather Driver** (by Matthew, namespace `Matthew`). Without a weather device the
weather card shows **+ Add a place** until you add places (on the panel, or in the layout builder); their weather comes
from Open-Meteo, which needs nothing set up.

**The OpenWeatherMap key.** The driver reads OpenWeatherMap's *One Call* API. Make a free account at
openweathermap.org and an API key. A new key works only with **One Call API 3.0**, which needs the **One Call by Call**
subscription: it asks for a payment card, but the first 1,000 calls a day are free (a poll every 30 minutes is 48). The
warnings come from weather.gov (in the US, no key) or from OpenWeatherMap.

1. **Install the driver:** Hubitat Package Manager → **Install** → search *OpenWeatherMap-Alerts*, or **Drivers Code** →
   **+ New Driver** → **Import** →
   `https://raw.githubusercontent.com/HubitatCommunity/OpenWeatherMap-Alerts-Weather-Driver/master/OpenWeatherMap-Alerts%2520Weather%2520Driver.groovy`
   → **Import** → **Save**. (Its author marked it as no longer maintained in March 2026; it still works.)
2. **Make the device:** **Devices → Add Device → Virtual** → **Device Name:** `Weather`, **Type:** *OpenWeatherMap-Alerts
   Weather Driver* → **Save Device**.
3. **Its preferences:** paste the **API key**, turn **API Key Version** on (3.0), type the **City name**, set **Weather
   Alert Source** to *2 = Weather.gov* (US) or *1 = OWM*, and both **Poll Interval**s to **30 Minutes** (recommended — the
   fastest warnings). A warning takes up to one update interval to appear on the panels and to clear. With more than 2
   hours between updates the weather card shows Open-Meteo in between. The location is the hub's (**Settings →
   Location**), or turn on **Override Hub's location coordinates**. Choose °F or °C and mph or km/h as you like:
   Skypane learns the units from the device.
4. **The attributes Skypane reads** (the driver only sends what you turn on): **Weather Alert**, **Condition Code**,
   **Condition Text**, **Forecast High/Low Temperatures**, **Forecast Code**, **Forecast Text**, **Today's Precipitation
   Probability**, **Precipitation Forecast**, **Local SunRise and SunSet**, **Wind Speed** and **Observation time**
   (it changes every poll, so Skypane knows the data is fresh). Press **Save Preferences**, then **Poll Data** once.
5. **Share it:** **Apps → Skypane Helper → Devices for Skypane** → tick the weather device → **Done**.
6. **Tell Skypane:** Manager → **Admin → Integrations → Weather** → pick the device (it shows up within a few minutes).
   **Use it for the weather card** and **Show its warnings** are on; choose the panels for warnings and, under
   **Warning levels**, which level each kind gets. Saved at once — no restart.

The levels: extreme warnings (tornado, flash flood, hurricane, or "extreme" in the name) and every emergency → **5**,
other warnings → **4**, watches → **3**, advisories and statements → **2**. They behave like any alert: levels 4–5 fill
the screen, sound, and need the panel PIN to dismiss. A warning clears by itself when the device stops reporting it; a
dismissed one stays dismissed while it is still reported (a watch that becomes a warning, or the same warning issued
again after it ended, shows again with its sound). The Manager's Overview lists
them with the other alerts, and **Health → Timeline** notes when one starts and ends.

Good to know: this driver reports only the **first** warning's name and text, plus how many more are up ("Tornado
Warning +2") — the panels show the first one and the count. It sends no start or end times, so a warning lasts as long as
the device reports it. Another weather driver can work too: **How the device reports** in the Weather group lets you name
its attributes, including one with every warning as JSON. Only an admin can choose the device; a device that isn't a
weather device only has its values read — nothing else happens.

## Already using Maker API?

A hub that already uses Maker API with Skypane keeps working: nothing moves by itself. To move over:

1. Set up the Helper first (all five steps above). Give it the same devices Maker API has, the weather device too.
   Step 5's last line says **Maker API is still set up** until you finish here.
2. **Admin → Integrations → Home hub** → **Switch from Maker API**. The card shows what changes and the status side by
   side.
3. **Switch to the Helper.** Skypane restarts its hub link (a few seconds).
4. **Test it on one light:** pick a light you can see and press **Flip**. Skypane sends one command through the Helper
   and waits for the event to come back.
5. Once the test passes: **Remove Maker API settings**. Skypane forgets the Maker API address, app number and token and
   restarts. Then remove the app on the hub yourself: **Apps → Maker API → Remove**.

Until you remove the settings, **Use Maker API again** moves you back. There's no fallback: if the Helper stops
answering, Skypane shows a problem and never moves back to Maker API by itself.

(Screenshot: the Switch from Maker API card with the status side by side and the light test passed.)

## Modes and the alarm

Skypane shows the hub's **modes** and **Hubitat Safety Monitor** by itself, through the Helper. Nothing to set up.
Changing them, from a panel or from the Manager's **Overview → Mode & alarm**, always asks for the panel PIN.

## Troubleshooting

The Manager shows these on the setup page and on **Integrations → Home hub**, each with its fix.

- **OAuth is off for the Helper** (it happens after a by-hand install), so it has no access token. On the hub:
  **Apps Code → Skypane Helper → OAuth → Enable OAuth in App → Update**. Then open **Apps → Skypane Helper**, press
  **Done**, and press **Check again** in the Manager.
- **No hub link:** Skypane uses the Helper, but it has no hub link from it (the app was installed again, unlinked, or
  its link file can't be read). On the hub, open **Apps → Skypane Helper** and press **Done**. If it says **Not linked**,
  make a new link code (step 2). Skypane doesn't go back to Maker API by itself.
- **The Skypane Helper doesn't answer** (no answer from the hub at its address). Check that the hub is on and opens in a
  browser. On the hub, open **Apps → Skypane Helper**: if it says **Not linked**, make a new link code (step 2). If it
  says OAuth is off, see the first line. Meanwhile the panels show their devices' last known state.
- **The hub said no to the login:** open **Apps → Skypane Helper**, type the hub login again, press **Done**, then
  **Check again**. Or install the Notifier driver by hand ([section 3](#3-the-skypane-notifier--alerts-from-your-rules-recommended)).
- **Another device already has the Notifier's network id:** delete the old Skypane Notifier device on the hub (or pick it
  in the Helper under **Skypane Notifier**), then **Check again**.
- **Restart Skypane to use the new hub link:** this Skypane doesn't restart its services by itself. Restart it, then
  open the page again.
- **A device is missing:** tick it in the Helper ([section 2](#2-later-new-devices-and-updates)).

## Good to know

- **The Helper's access token is like a password.** It also works through Hubitat's cloud endpoint, not only on your
  network. Skypane keeps it on the server only and never shows it. Don't paste the Helper's settings, logs or app state
  into feedback, forums or screenshots. If you think it leaked, **Unlink** it in **Integrations → Home hub** (or remove
  and reinstall the app) and link it again: that makes a new token, and the old one stops working.
- **What Skypane may switch:** everything the panels show — lights, switches, outlets, fans, shades, the thermostat,
  locks (lock only; unlocking needs the owner's permission per lock), garage doors and valves (always with the panel
  PIN). Devices named like a sprinkler, freezer or server are view-only until you allow them (Manager → **Devices**).
- **Address changed?** Give your hub and Skypane a fixed address in your router. If Skypane's address changes, type the
  new one in the Helper's **Skypane address** and press **Done**. If the hub's address changes, link the Helper again
  (**Unlink** in Integrations → Home hub, then step 2).
