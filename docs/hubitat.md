# Connect Hubitat

Skypane talks to your hub on your home network through Hubitat's **Maker API** app. It sends commands through Maker API
and hears every change on the hub's local event socket. Nothing goes over the internet, and nothing secret is stored
on the hub.

You need: the hub's IP address (Hubitat → **Settings → Hub Details**, e.g. `192.168.1.10`), and Skypane installed
and signed in ([install-unraid.md](install-unraid.md) or [install-docker.md](install-docker.md)).

## 1. Maker API

1. Hubitat → **Apps → Add Built-In App → Maker API**.
2. **Select devices:** tick every device Skypane should show — lights, switches, outlets, fans, shades, locks, the
   thermostat, sensors, garage door, valves, speakers. (You can add more later; Skypane notices them.)
3. Turn **Allow Access via Local IP Address** on. Leave the cloud options off.
4. Press **Done**, then open the Maker API app again. Under **Local URLs** you'll see addresses like:

   `http://192.168.1.10/apps/api/123/devices?access_token=abcd1234-…`

   - **`123`** is the **app number**.
   - The long text after `access_token=` is the **token**. Treat it like a password: don't paste it into feedback,
     forums or screenshots. If it ever leaks, press **Create new access token** in Maker API and give Skypane the new
     one (step 2).

(Screenshot: the Maker API page with **Local URLs**; the app number and the token blurred.)

## 2. Tell Skypane

1. Skypane Manager on a computer → sidebar → **Admin → Integrations** → **Home hub**.
2. Fill in **Hub address** (`192.168.1.10`) and **Maker API app number** (`123`). For **Maker API token** press
   **Set…**, paste the token and press **Keep it for saving**.
3. Set **General → Time zone** to yours (e.g. `America/New_York`).
4. Press **Save and restart** (the bar at the bottom). The page shows **Restarting — back in a few seconds** and
   reloads by itself when Skypane is back (usually within a few seconds).

How you know it worked: within a minute the **Connections** card shows the hub as working, and **Devices** lists your
devices. The container's log says `house model …: N rooms …`.

(Screenshot: Integrations → Home hub filled in, and the Connections card with the hub green.)

(The **Message broker** group stays **empty**: Skypane runs its own MQTT broker. Use it unless you know you want your
own.)

## 3. The Skypane Notifier — alerts from your rules (recommended)

The Notifier is a small Hubitat driver. Your rules (Rule Machine, webCoRE, Basic Rules, HSM, Switchboard…) use it to
put alerts on the panels — a water leak, smoke, the garage left open — and to hear when someone dismisses one.

**New to Skypane? Skip this paragraph.** Skypane 3.0 installs the driver fresh (its namespace is now `skypane`). If you
tried an earlier Skypane, remove the old Notifier first. ⚠ Any rule that sends alerts to the old device stops working
until you point it at the new one, so first open the old device → **In use by** and note those rules. Then **Devices**
→ the old *Skypane Notifier* → **Remove Device**, and **Drivers Code** → the old driver → **Delete**.

1. Hubitat → **Drivers Code → + New Driver** → **Import** → paste this address, with your Skypane's address in it →
   **Import** → **Save**:

   `http://192.168.1.50/hubitat/SkypaneNotifier.groovy` (with Docker: `http://<address>:8088/hubitat/SkypaneNotifier.groovy`)

   Skypane serves the driver itself, so it always matches your version. If Import doesn't work, open that address in a
   browser, select everything, copy it, and paste it into the new driver instead.
2. **Devices → Add Device → Virtual** → **Device Name:** `Skypane`, **Type:** *Skypane Notifier* (under the
   `skypane` namespace) → **Save Device**.
3. **Apps → Maker API** → tick the new **Skypane** device → **Done**. Skypane needs it there so that a dismissal on a
   panel reaches Hubitat, and so it can ask for the alerts again after a restart.
4. Test it: open the **Skypane** device in Hubitat, type `Test` in the box next to **Info** and press **Info**. Within a
   few seconds every panel shows a short note "Test" (it goes away by itself after a minute).

(Screenshot: Hubitat's Add Device with Type *Skypane Notifier*; the "Test" note on a panel.)

That's all: Skypane notices the device by itself. How to send alerts from a rule — the five levels, which panels, sounds,
clearing — is in [hubitat-notifier.md](hubitat-notifier.md).

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
5. **Share it:** **Apps → Maker API** → tick the weather device → **Done**.
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

## Modes and the alarm

Skypane shows the hub's **modes** and **Hubitat Safety Monitor** by itself. Nothing to set up. Changing them, from a
panel or from the Manager's **Overview → Mode & alarm**, always asks for the panel PIN.

## Good to know

- **What Skypane may switch:** everything the panels show — lights, switches, outlets, fans, shades, the thermostat,
  locks (lock only; unlocking needs the owner's permission per lock), garage doors and valves (always with the panel
  PIN). Devices named like a sprinkler, freezer or server are view-only until you allow them (Manager → **Devices**).
- **A new device** on the hub: tick it in Maker API. Skypane shows it within a few minutes, marked as new.
- **Hub address changed?** Update it in Integrations → Home hub. Give your hub a fixed address in your router.
