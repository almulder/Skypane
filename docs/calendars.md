# Calendars on the panels

The panels' calendar cards show your real calendars — Google, Outlook / Microsoft 365, iCloud, Yahoo, Proton,
Fastmail, Nextcloud, school and sports-team calendars — through each calendar's **subscription link** (iCal / ICS).
Skypane only **reads** them: nothing on a panel can change your calendar.

Until you add one, the panels show sample events (the Manager says so).

## Add a calendar

1. Find the calendar's iCal link (below) and copy it.
2. Open the Manager → **Settings** → under *Admin settings*, the **Calendars** card (only the admin sees it).
3. Type a name (e.g. *Jane*, *School*), paste the link, pick a colour, and press **Add**.
4. A few seconds later the card shows "✓ 42 events …" — or what went wrong, in plain words.
5. Each panel shows every house calendar to begin with. To choose per panel: Manager → **Panels** → the panel →
   **People & calendars** — switch a calendar off there, or give it this panel's own colour or icon.

The panels check for changes every few minutes; the server reads each link every 10 minutes. **Check now** reads it at
once. **Replace** puts in a new link (for example after you reset it). **Remove** only takes it off the panels — your
calendar itself isn't touched (adding it again later starts fresh: the panels' old choices for it don't come back).
Everything on the Calendars card saves at once — no need for "Save and restart".

A calendar that can't be read shows as a notice on the Manager's **Health** page (the panels keep its last good copy);
one that never worked is marked as such for the panels. A panel gets at most the 1,500 soonest events at a time.

> **The link is a secret.** Anyone who has it can read that calendar. Skypane keeps it on the server only (in the
> private folder), never shows it again (you'll see "•••• saved") and never writes it in a log. If a link ever leaks,
> reset it at your calendar provider (Google: *Reset* next to the secret address) and **Replace** it here.

## Where to find the link

### Google Calendar
1. On a computer, open **calendar.google.com** (it isn't in the phone app).
2. ⚙ **Settings** (top right) → in the left list, under *Settings for my calendars*, click the calendar.
3. Scroll to **Integrate calendar** → **Secret address in iCal format** → click the copy button.
   (It ends in `basic.ics`. Use the *secret* one: the "public address" only works if the calendar is public.)
4. Each person's calendar (yours, your partner's, a shared family one) has its own link — add each one.

### Outlook.com / Microsoft 365
1. Open Outlook on the web (**outlook.com** or **outlook.office.com**) → ⚙ **Settings** → **Calendar** → **Shared calendars**.
2. Under **Publish a calendar**, pick the calendar and **Can view all details** → **Publish**.
3. Copy the **ICS** link (not the HTML one — that's a web page, and Skypane says "isn't a calendar").
   At work, your IT may have turned publishing off.

### iCloud (iPhone / iPad / Mac)
1. iPhone: **Calendar** app → **Calendars** (bottom) → the **ⓘ** next to the calendar.
2. Turn on **Public Calendar** → **Share Link…** → **Copy**. It starts with `webcal://` — paste it as it is.
   (Mac: Calendar → right-click the calendar → Share Calendar… → Public Calendar.)
   Note: anyone with a public iCloud link can read it.

### Yahoo Calendar
calendar.yahoo.com → the ⋮ next to the calendar → **Share** → under *Links*, copy the **ICS** link (*View all event details*).

### Proton Calendar
Proton Calendar on the web → ⚙ **Settings** → **Calendars** → the calendar → **Share** → **Share with anyone** →
*Full view* → **Create link** → copy.

### Fastmail
⚙ **Settings** → **Calendars** → the calendar → **Edit & share** → **Share with the public / iCal** → turn on, and copy
the iCal link.

### Nextcloud
Calendar app → the ⋯ next to the calendar → **Share link** (+) → the ⋯ next to the new link → **Copy subscription link**.

### School, sports teams and others
Look for **Subscribe**, **iCal**, **ICS**, **Add to calendar** or **Export** — a link ending in `.ics` or starting with
`webcal://` is the one.

## What's shown

- Events from yesterday to two months ahead: title, time (or *All day*), the calendar's name and the place. The icon
  comes from words in the title (docs/calendar-keywords.md); the colour bar is the calendar's colour.
- Repeating events (daily, weekly, monthly, yearly), skipped and moved single dates, all-day and multi-day events,
  and time zones are understood. Cancelled events are left out.

## When something's wrong

The Calendars card shows the last problem in plain words. The panels keep showing the last good copy meanwhile.

| It says | What to do |
|---|---|
| *isn't a calendar (no iCal data)* | You copied a web page link (e.g. Outlook's HTML link). Copy the iCal / ICS one. |
| *refused the link (401/403)* or *wasn't found (404)* | The link was reset or the calendar deleted. Copy the link again and **Replace**. |
| *points into the local network* | Only calendars on the internet can be added (a safety rule). |
| *must start with https:// or webcal://* | Plain `http://` links aren't accepted. Most providers give an https / webcal one. |
| *too big (more than 2 MB)* | A very large calendar — split it, or use a smaller one. |
| *took too long* / *couldn't connect* | Usually passes by itself; it's tried again every 10 minutes. |

## Technical notes (for whoever maintains it)

- `service/calendars.py` (standard library only), tests in `service/test_calendars.py` and `service/test_server.py`
  (`CalendarApiTests`).
- Links: `DATA_DIR/private/calendars.json` (0600). Last good events + status: `DATA_DIR/private/calendar-cache.json`.
- `GET/PATCH /api/manage/calendars` (the admin), `GET /api/panel/<id>/events` (the panel; only the calendars that panel
  shows). MQTT `dashboard/calendars/changed` tells the panels to load again.
- Fetching: https only (webcal → https), at most 3 redirects (https only), 15 s timeouts, 2 MB, and never to a
  private / loopback / link-local address (checked after the name lookup; the connection goes to exactly that address).
