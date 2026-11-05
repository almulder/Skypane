# Skypane Notifier — alerts from Hubitat rules

A Hubitat driver (`hubitat/SkypaneNotifier.groovy`) that lets your rules put alerts on the panels and hear when someone
dismisses them. Install it once on the hub (below); the Skypane bridge does the rest.

## Where alert rules live: in Hubitat

Every alert rule is made in Hubitat: a water leak, smoke / CO, gas, a freezer too warm or without
power, the alarm going off (HSM intrusion), a garage left open — a Rule Machine rule or webCoRE piston sends it with
this notifier's commands (below), and picks the level and which panels get it. Skypane itself has **no** alert rules any
more: a leak sensor turning wet raises nothing on a panel by itself (its card still shows "Water!"), there is no
freezer limit or "alert sensor off" switch in Skypane. The panels only **show** what Hubitat pushes, sound it, and
**acknowledge** it: every dismissal on a panel goes back to Hubitat (`panelAck` / `panelAckAll`, the
`acknowledged` / `ackPanel` attributes and the buttons below), so a rule can silence the sirens when someone taps
Dismiss. Arming and disarming HSM from a panel (with the panel PIN) stays — that's a control, not a rule.

Example rule for a leak: *Trigger: Kitchen leak sensor wet → Skypane: critical / alert("Water leak — kitchen sink",
"leak")*; and *Trigger: sensor dry → Skypane: dismiss("leak")*.

## Install (once, on the hub)

The same steps as in [hubitat.md](hubitat.md#3-the-skypane-notifier--alerts-from-your-rules-recommended):

1. Hubitat → **Drivers Code → + New Driver** → **Import** → paste the address below → **Import** → **Save**.

   It's the same address you open the Manager with, without `/admin`, followed by `/hubitat/SkypaneNotifier.groovy` —
   e.g. `http://192.168.1.50/hubitat/SkypaneNotifier.groovy` on Unraid, or
   `http://192.168.1.20:8088/hubitat/SkypaneNotifier.groovy` with Docker.

   Skypane serves the driver itself, so it always matches your version. If Import says *Failed to fetch* (or doesn't
   work), open that address in your browser, copy everything on the page and paste it into the **New Driver** box
   instead.
2. **Devices → Add Device → Virtual** → **Device Name:** `Skypane`, **Type:** *Skypane Notifier* (under the
   `skypane` namespace) → **Save Device**.
3. **Apps → Maker API** → tick the new **Skypane** device → **Done**. Skypane needs it there so that a dismissal on a
   panel reaches Hubitat, and so it can ask for the alerts again after a restart.
4. Test it: open the **Skypane** device in Hubitat, type `Test` in the box next to **Info** and press **Info**. Within a
   few seconds every panel shows a short note "Test" (it goes away by itself after a minute). No panel set up yet?
   The Manager's **Overview** lists alerts that are waiting, so you can check it there too.

Nothing else: the bridge already listens to the hub's event socket. No secret goes onto the hub.

## Use it (webCoRE, Rule Machine)

### Raise an alert

In webCoRE: *with Skypane → do → (command) with parameters*. In Rule Machine: *Run custom action* → Skypane.

| Level | Command | Example parameters |
|---|---|---|
| 5 Critical (life safety only) | `critical(text, tag)` | `"Smoke in the kitchen"`, `"smoke"` |
| 4 Alert | `alert(text, tag)` | `"Garage door open 30 min"`, `"garage"` |
| 3 Warning | `warning(text, tag)` | `"Freezer is warm"`, `"freezer"` |
| 2 Notice | `notice(text, tag)` | `"Printer done"`, `"printer"` |
| 1 Info | `info(text)` | `"Mail arrived"` |
| any | `notify(text, level, panels, title, seconds, tag)` | `"Door open"`, `4`, `"main,k_office"`, `"Garage"`, `0`, `"garage"` |

- The short commands go to the device's default panels (its preferences). Use `notify` to pick panels, a title, or an
  expiry in seconds (`0` = the level's default: info 10 min, notice 30 min, warning 2 h, alert / critical until
  dismissed). The level may also be a word: `"critical"`.
- The **tag** is your name for the alert. Raising the same tag again replaces it (the panel shows "×2"), and you clear
  it by the tag. Give every alert you will want to clear or react to a tag.
- Any notification app (Rule Machine "Send notification", HSM, webCoRE "send notification to device") also works:
  pick "Skypane". Plain text may start with `!4 @main,k_office #printer +600` = level 4, those panels, tag "printer",
  gone after 600 s.
- Also: `showCamera(camera names, panels, seconds)`, `showView(view name, panels, seconds)` — full screen for that
  many seconds (5–3600, so up to 60 min; the panel counts down as 60:00 … 1:00, then 59s); a tap closes it early.
  Leave Seconds empty and each panel uses its own "Auto-show a camera for" (Manager → Panels → Cameras).

### Clear alerts from a piston

- `dismiss(tag)` — clears that alert on every panel (e.g. `dismiss("smoke")` when the smoke detector goes clear).
- `dismissAll()` — clears every alert.
- These do **not** push a button or set `acknowledged` (only a person on a panel does).

### React to a dismiss on a panel

The device is also a button device:

| Button | Pushed when |
|---|---|
| 1–5 | someone dismissed an alert of that level on a panel |
| 6 | someone pressed **Dismiss all** on a panel (after the buttons 1–5 of the alerts it cleared) |
| 7 | someone pressed **Silence** on a level 4–5 alert — the sound stopped on that panel, the alert is still up |

Just before the push the device sets `acknowledged` (the alert's tag, or `all`), `ackPanel` (which panel) and
`ackLevel` (its level; for Dismiss all, the highest level it cleared). Button 7 (Silence) sets its own instead:
`silenced` (the tag), `silencedPanel` and `silencedLevel` — never `acknowledged` / `ackPanel` / `ackLevel`, so a rule
on those still means "dismissed".

Piston triggers to use:

- **Skypane button 5 is pushed** → Sirens off. (Someone dismissed a critical alert.)
- **Skypane button 6 is pushed** → Sirens off. (Dismiss all — add it next to button 5.)
- **Skypane acknowledged changes to `smoke`** → only that alert (use `acknowledged` when several alerts of the same
  level can be up). Check `ackPanel` if it matters where.
- **Skypane expired changes to `printer`** → an alert ran out on its own.
- **Skypane button 7 is pushed** (or **silenced** changes) → someone heard it and silenced that panel; the alert stays
  until it is dismissed with the panel PIN. Up to you whether the sirens go quiet too.
- Panel tests without a real alert: run `push(5)` on the device.

Level 3–5: a dismiss clears the alert on every panel. Level 1–2: it is dismissed on that panel only (it stays up on the
others), but the button is still pushed.

**From the Manager:** the admin can acknowledge an alert on the Manager's Overview
(levels 4–5 ask for the panel PIN there, with the same lock-outs as a panel). Hubitat hears it like a panel's Dismiss —
the same button and `acknowledged` — with `ackPanel` = **`manager-<login>`** (e.g. `manager-jane`), so a rule can tell
it came from the Manager, and who (only the server can send that name: see "Acknowledged in the Manager" below). From the Manager any level is cleared on every panel.

Other attributes to read: `activeLevel` (highest level up now, 0 = none), `alertCount` (how many are up),
`lastAlertLevel` (level of the newest alert), `lastAlert` (its text).

### Several alerts at once

One alert on screen at a time: the highest level wins, and the newest within a level. A lower one
that arrives while a higher one is showing goes straight into the panel's notification list (Home → *Notifications ·
N*, or a Notifications card) — no sound, no interruption. Nothing takes over a level 5 on screen — not even another
level 5: it waits in the list.

When a level 4–5 on screen is dismissed or cleared, the next waiting level 4–5 takes over the
screen with its own sound — the highest level first, then the one that has waited longest. So a second emergency (CO
after smoke) is never missed. After a level 1–3, nothing pops up, and a level 1–3 never pops up after a 4–5 either:
those stay in the list, where they can be read and dismissed. Dismiss all clears every level 3–5 alert
and dismisses the lower ones on that panel.

Panels: `all`, or panel names as in the Manager (main, k_office…).

The five levels (every webCoRE piston and Switchboard rule means the same by a level):

| Level | Name | Meaning / examples | On the panel | How long |
|---|---|---|---|---|
| 5 | Life safety | gas, smoke, heat, CO, intrusion | full screen in red, alarm beeps (also in quiet hours), spoken, LED flashing red; Dismiss asks the panel PIN; shown whatever the panel's lowest level | until dismissed, or `dismiss(tag)` |
| 4 | Damage | a water leak | as 5, in orange | until dismissed, or `dismiss(tag)` |
| 3 | Action needed | a mouse trap caught something, a package at the door, doors open / unlocked at bedtime | a note above the dock with a gentle sound; LED orange | until dismissed — never times out on its own |
| 2 | Finished | washer, dryer, dishwasher done | a silent note | 60 s |
| 1 | Reminder | calendar events | a note with a short tone | 60 s |

"How long" is the default when a rule passes `seconds` 0 (or uses critical / alert / warning / notice / info); any
other `seconds` wins. Dismissing a level 3–5 clears it on every panel (button 3–5); level 1–2 on that panel only
(button 1–2 is still pushed).

Per panel (Manager → Panels → Alerts): beep until dismissed, the lowest level shown (a level 5 always shows), quiet
hours (no sound below level 4), or Hubitat modes that make it quiet — the mode wins over the hours; and a notification
light for tablets without the LED strip. Which panels get an alert at all is the rule's `panels` (above).

LED strip (only a tablet with a Skypane-controlled LED strip): a level 4–5 on screen → flashing red; a level 3 or higher up (on screen or in the
list) → orange; HSM armed → red;
just disarmed → green for a minute; otherwise the theme color.

Try it without a rule: on the panel, Settings → Test → *Test alert — level 1…5* (on that panel only; Hubitat never
hears of these).

Never put codes or passwords in a notification: device events can be read by anything on the home network.

## Is the Skypane server alive?

The server checks itself every 30 s (Hubitat bridge, MQTT broker, camera video, Protect, UniFi, every panel's last
check-in — `service/health.py`) and tells Hubitat through the notifier device:

| Attribute | What it says |
|---|---|
| `serverStatus` | `online` while heartbeats come in; `offline` when none came for 90 s (preference *Heartbeat timeout*); `unknown` before the first one |
| `lastHeartbeat` | when the server was last heard (hub time; updated every 5 minutes and when it comes back) |
| `healthAlert` | what's wrong, e.g. `Panel Office is disconnected; Camera video (go2rtc) is not running`; `none` when all is fine; `Skypane server offline (last heard …)` when it stopped |
| `healthCount` / `healthLevel` | how many problems; the worst one's level (0 none, 2 notice, 3 warning, 4 alert) |

The "offline" check runs on the hub (a timer that restarts with every heartbeat), so it works when the server, the
bridge or the broker is gone — any of the three stops the heartbeat.

Rules to make (Rule Machine or webCoRE), to get it on your phone:

- **Skypane serverStatus changes to `offline`** → send a notification "Skypane server is down".
- **Skypane healthAlert changes** and it isn't `none` → send a notification with `%value%` (the problem's text).
- Optional: **serverStatus changes to `online`** → "Skypane is back".

## The panels as speakers

The device is also a speaker (capabilities *SpeechSynthesis* and *AudioVolume*), so any app that can "speak" on a
speaker can use the panels:

| Command | What happens |
|---|---|
| `speak(text, volume, voice)` | the panels in *Panels that speak* (empty = the same as for plain notifications) say the text. The text may start with `@main,k_office` to pick panels. Volume 0–100 is for this message only. |
| `speakTo(text, panels, volume, voice)` | the same, with the panels given |
| `setVolume(volume)` / `volumeUp()` / `volumeDown()` | the speaking panels' volume (steps of 10) |
| `setPanelVolume(volume, panels)` | the volume of some panels only |
| `mute()` / `unmute()` | the speaking panels stay silent / speak again (level 5 critical alerts still sound) |

To have spoken text also show as an alert, switch on the preference
**Spoken text also shows as an alert** (the panel then shows it and says it once, not twice).

## Message formats (driver ↔ bridge ↔ panels)

All `panelCommand` events are JSON with `"v": 1` (the bridge refuses anything else); the bridge checks every field
again before the panels see it.

**Heartbeat** — server → MQTT `dashboard/health` (live, never retained; only the internal login may write `dashboard/#`),
every 30 s:

```json
{"v": 1, "n": 2, "lvl": 4, "text": "Hubitat bridge not running; Panel Office is disconnected"}
```

The bridge passes it to every notifier through the Maker API: `GET devices/<id>/serverHeartbeat/2,4,Hubitat%20bridge…`
— the same message at most every 20 s, a changed one at most every 5 s. The text has only letters, digits, spaces and
`. : ; ' ( ) ! ? + _ -` (the Maker API splits at commas; no slashes in a URL path), at most 120 characters; `OK` when
`n` is 0. *Why the bridge and not the hub polling the server:* the bridge already holds the Maker API token and talks to
the hub, the server has no token (by design), and a hub polling a URL would need the server's address and an open
route — the bridge's way needs nothing new on the hub.

**Speech** — driver `panelCommand` → bridge → MQTT `hubitat/say` (one-shot, not retained, at most 10 a minute):

```json
driver:  {"v": 1, "op": "say", "to": ["all"], "text": "Dinner is ready", "vol": 60, "voice": "en-US", "id": "18f2c3a9b0701"}
panels:  {"to": ["all"], "text": "Dinner is ready", "volume": 60, "voice": "en-US", "id": "18f2c3a9b0701"}
```

`volume` is `null` when not given (the panel's own volume), `voice` `""` when not given; `id` only when the text also
went up as an alert (then the panel speaks it once — not again for the alert).

**Volume** — driver → bridge → MQTT `hubitat/volume` (not retained; the panel keeps the last one itself):

```json
driver:  {"v": 1, "op": "volume", "to": ["main"], "vol": 30}           {"v": 1, "op": "volume", "to": ["all"], "muted": true}
panels:  {"to": ["main"], "volume": 30, "muted": null}                 {"to": ["all"], "volume": null, "muted": true}
```

`null` = leave it as it is. After a bridge restart the driver sends its last volume again (`"replay": true`).

`to` is always a list of panel names or `["all"]`; a panel acts on a message when `all` or its own name is in it.

**Dismissed on a panel** — panel → MQTT `hubitat/alerts/ack` → bridge → `panelAck/<id>,<panel>,<level>`; for
**Dismiss all** `{"all": true, "panel": "main"}` one `panelAck` per alert the bridge knows is up for that panel, then
`panelDismissedAll/<panel>,<highest level cleared>,<count>` (the bridge never calls `panelAckAll`):

```json
{"id": "18f2c3a9b0702", "panel": "main", "level": 3}
{"id": "18f2c3a9b0701", "panel": "main", "level": 5, "ticket": "1792000030.9f0c…(16).4be1…(64)"}
```

**Levels 4–5 need the panel PIN — checked by the bridge too.** The PIN never goes over MQTT (the broker's
page login is shared by every panel page): the panel sends it to the server, `PATCH /api/pin`
`{"action": "ticket", "purpose": "alert", "panel": "main", "items": [[0, "alertAck", "18f2c3a9b0701"]], "pin": "…"}`,
which checks it with the panels' "alert" lock-outs (5 wrong → 30 s, then 1, 2, 5 minutes; the pad counts down) and
answers one ticket per alert — HMAC-signed with the house's ticket key, for device 0 / `alertAck` / that alert id,
good for 30 s, accepted **once** (the same tickets as arming / disarming). The bridge then:

- takes the alert's level from the hub (its own list), never from the message — saying `"level": 1` for a level 5
  doesn't skip the check;
- passes a level 4–5 on only with a valid, unused ticket for that alert id; otherwise it refuses it (logged);
- answers **every** dismissal it drops on **`hubitat/alerts/ack/result`** `{"id", "panel", "ok": false, "reason"}`
  (`{"all": true, "panel", …}` for a dropped Dismiss all) — reason `no-ticket`, `bad-ticket`, `too-many` (the rate
  limit) or `not-up` — and the panel that sent it puts the alert back on screen with "Not dismissed … Try again";
- `{"all": true}` never clears a level 4–5: it sends one `panelAck` for each level 1–3 alert it knows is up for that
  panel (never the driver's `panelAckAll`, which would also clear a level 4–5 the bridge hasn't heard of yet — e.g.
  a smoke alarm that came in a second earlier), then **`panelDismissedAll`** on every notifier — it clears nothing
  and only tells rules, as Dismiss all always did: `acknowledged` = `all`, `ackPanel`, `ackLevel`, button 6 — and it
  answers `no-ticket` for each level 4–5 left up. A panel's
  **Dismiss all** therefore sends every level 4–5 on its own with its ticket first, then the `all`;
- an alert it doesn't know is up: a level 4–5 (or no level) only with a valid ticket; a level 1–3 goes on to the
  driver (which ignores a level lower than a level 4–5 alert's own);
- budgets: plain dismissals 20 a minute per panel name and 60 a minute all together; PIN-checked level 4–5 ones have
  their own 30 a minute, so nobody can use up the panels' budget to block dismissing a smoke alarm;
- levels 1–3 and a Silence need no ticket.

**The driver** (defence in depth): `panelAckAll` never clears a level 4–5 (a rule may still call it);
`panelDismissedAll(panel, level, count)` is Dismiss all's notification side only (button 6, `acknowledged` =
`all`); `panelAck` with a level lower than a level 4–5 alert's own is ignored (logged).

The **alarm window** (Manager → Panels → Safety, default 30 s from the PIN entry, touches don't extend it, 0 = never
relocks) only spares the pad: the page keeps the PIN in memory for that long and sends it again for each new ticket, so
the server checks it every time. **No panel PIN set**: the server hands out tickets without one, and the bridge doesn't
ask for them (nothing to prove). The Manager's acknowledgement (`hubitat/alerts/ack/manager`, below) is unchanged.

Turning the bridge's check off (not recommended): the container variable
**`ACK_TICKETS=off`** (Unraid: Edit → Add another Path, Port, Variable → Key `ACK_TICKETS`, Value `off`; or
`--ack-tickets off` for a bridge started by hand). Then a level 4–5 dismissal without a valid ticket still goes through,
and the bridge logs a warning for each one. Default: on (the pages and the bridge come in the same container, so they
update together; a panel reloads by itself at its first quiet moment after an update — 10 s without a touch, or after
5 minutes at the latest, never while a PIN pad or a dialog is open). The bridge says at start whether tickets are
checked; started by hand without a house dir (`--house-dir` / `DATA_DIR`) it can't check them and logs a warning.

**Silenced** — panel → MQTT `hubitat/alerts/ack` (the same topic as a dismissal), only when the
panel's admin turned on **Silence without the PIN** (Manager → Panels → Alerts):

```json
{"id": "18f2c3a9b0701", "panel": "main", "level": 5, "silenced": true}
```

Only for a level 4–5 alert the bridge knows is up. It is **not** a dismissal: the bridge leaves the alert up everywhere
and calls `GET devices/<id>/panelSilence/<id>,<panel>,<level>` → `silenced` = the alert's tag, `silencedPanel` /
`silencedLevel`, button 7 pushed. The panel plays the sound again after 5 minutes if the alert is still
up, or at once when the alert happens again (its count goes up).

**Acknowledged in the Manager** — the server → MQTT **`hubitat/alerts/ack/manager`**, after the admin's
Acknowledge (PATCH `/api/manage/alerts`; the panel PIN for levels 4–5, checked by the server with the panels' "alert"
counter):

```json
{"id": "18f2c3a9b0701", "by": "manager-jane", "level": 5}
```

Its own topic on purpose: on the built-in broker only the server's **internal** login may write it (the panels' page
login may write exactly `hubitat/alerts/ack`, the device login nothing under `hubitat/`) — so nobody with a panel page
can fake the admin. `by` is `manager-` + the login's name (small letters; anything but `a-z 0-9 _ -` becomes `-`; at
most 40 in all). The bridge clears it on every panel at any level and calls `panelAck/<id>,manager-jane,<level>`.
On the panels' `hubitat/alerts/ack` a panel name starting with `manager` is refused, and the Manager won't create a
panel with such an address. Manager acknowledgements have their own budget in the bridge (30 a minute; the server sends
at most 20 a minute — "Acknowledge all" says how many are left for the next press), so they never use up the panels'
20 dismissals a minute. With an outside broker (MQTT_HOST) give it the same rule: only the server and the bridge may
write `hubitat/alerts/ack/manager`.

## Not yet

A child device per panel, `setPage` / `setScreen` / `setBrightness` / `chime`, waking the screen for an alert,
camera pop-ups from Protect's smart detections, a history of alerts, the Hubitat Package Manager manifest.
