# Writing a Skypane plugin

A complete guide to building, testing and sharing a plugin for Skypane 3.0.46.1 and newer: what a plugin is made of,
every rule Skypane checks, the patterns that work, and the mistakes we already made so you don't have to.

It is based on Skypane's plugin contract (API version 1) and on building the first real plugin, the
[Narwal robot vacuum](narwal/), whose full source is in this folder and is the best worked example.

**Contents**
1. [What a plugin is](#1-what-a-plugin-is)
2. [Before you start](#2-before-you-start)
3. [The package](#3-the-package)
4. [plugin.json, the manifest](#4-pluginjson-the-manifest)
5. [The worker (the server part)](#5-the-worker-the-server-part)
6. [Settings: the Integrations tab](#6-settings-the-integrations-tab)
7. [The card (the panel part)](#7-the-card-the-panel-part)
8. [Alerts](#8-alerts)
9. [The panel PIN](#9-the-panel-pin)
10. [Words](#10-words)
11. [Security: what Skypane promises and what it doesn't](#11-security-what-skypane-promises-and-what-it-doesnt)
12. [Testing](#12-testing)
13. [Packing, versions and updates](#13-packing-versions-and-updates)
14. [Sharing it here](#14-sharing-it-here)
15. [Lessons from the Narwal plugin](#15-lessons-from-the-narwal-plugin)
16. [Checklists](#16-checklists)
17. [Reference: every limit in one place](#17-reference-every-limit-in-one-place)

---

## 1. What a plugin is

A plugin adds an integration Skypane doesn't have built in: a device, a service, a gadget on your network. It can bring
up to three parts, all optional:

| Part | Runs where | Does what |
|---|---|---|
| **Worker** | on the Skypane server, as its own process | talks to the device, keeps its state, answers the plugin's routes, raises alerts |
| **Settings tab** | in the Manager (Integrations → your plugin) | fields and a list (for example a list of devices) that Skypane draws from your schema, with buttons like **Test** |
| **Cards** | on the panels, in a sealed frame | shows the device and lets people control it, talking only to its own worker through Skypane |

```
 panel card ──(bridge)──► Skypane ──(proxy: login, panel, PIN, limits)──► worker ──► your device
                                ▲                                            │
 Manager tab ──(schema, Test)───┘                                            └──► alerts → panels
```

The card never reaches the network or the worker directly. Skypane sits in the middle of every call and checks it.

**When a plugin fits:** a device with a local API that Skypane doesn't support. **When it doesn't:** something Hubitat
already exposes (use a normal card), or a card that only needs Hubitat devices (a hand-made card is enough).

## 2. Before you start

- **Skypane 3.0.46.1 or newer** to install and test it.
- **Python 3.12, standard library only**, for the worker, and only the modules Skypane compiles in (list in
  [section 5](#modules-you-may-import)). No `pip` packages: copy any pure-Python helper you need into `worker/`.
- **ES5 JavaScript** for the card (old wall tablets): no `let`/`const`, arrow functions, template strings, `?.`, `??`,
  `async`/`await`, `class`. `Promise` is fine (the bridge uses it).
- **Your device's local protocol**, worked out and tried by hand first. Write a small read-only script that connects,
  asks for status and prints it before you write any plugin code (see [lesson 1](#lesson-1-prove-the-protocol-on-the-real-device-first)).
- **Skypane's source** if you want to run its plugin kit (`tools/plugin-kit/`: `pack.py` and the `hello-counter`
  example) and the end-to-end test harness.

## 3. The package

A plugin is one file, `<id>-<version>.skyplugin`: a zip with this layout.

```
plugin.json          the manifest (required)
worker/main.py       the server part (any name; more .py files go in worker/ too)
card/<type>/…        each card type's files: index.html, .js, .css, pictures
strings/en.json      the words (strings/<lang>.json for other languages)
icon.svg             optional, ≤ 64 KB
help.md              optional, shown in the Manager, ≤ 64 KB
```

Skypane checks the package before it unpacks anything:

- the zip ≤ 10 MB and ≤ 300 entries (folders count); each file ≤ 5 MB unpacked, all ≤ 30 MB unpacked;
- no links, no absolute or `..` paths, no backslashes, at most 8 folders deep; path parts only letters, digits, `_ . -`;
  no two names that differ only in case; no password-protected entries;
- only `.py .json .js .css .html .svg .png .jpg .webp .md .txt`, and `.py` only inside `worker/`;
- a card's JavaScript (all `.js` in its folder) ≤ 512 KB;
- the manifest's schema, and every string key it uses exists in `strings/en.json`.

The package is installed read-only to `DATA_DIR/plugins/<id>/<version>/`, and only the card files you declare are ever
served to a page.

## 4. plugin.json, the manifest

```json
{
  "api": 1,
  "id": "my-gadget",
  "name": "plugin.name",
  "version": "1.0.0",
  "author": "plugin.author",
  "description": "plugin.description",
  "homepage": "https://github.com/you/my-gadget",
  "skypane": "3.0.46",
  "network": ["TCP port 8080 on the gadget addresses you enter"],
  "worker": {"entry": "worker/main.py"},
  "settings": { "...": "section 6" },
  "routes": {
    "panel":  [{"name": "status", "method": "GET"},
               {"name": "start",  "method": "POST", "pin": "optional"},
               {"name": "command","method": "POST"}],
    "manage": [{"name": "test", "method": "POST"}]
  },
  "cards": [
    {"type": "gadget", "name": "card.name", "icon": "robot", "frame": "card/gadget/index.html",
     "size": {"w": 2, "h": 1},
     "settings": [{"key": "device", "type": "item", "label": "card.device"}]}
  ],
  "alerts": true
}
```

| Key | Rules |
|---|---|
| `api` | `1` |
| `id` | `[a-z][a-z0-9-]{2,39}` (3–40 characters). It names the plugin everywhere: folders, routes, words. Never change it after release. |
| `version` | semver: `1.0.0`, `1.2.0-beta.1` |
| `name`, `author`, `description` | plain text (≤ 60 / 80 / 500) or a string key |
| `homepage` | an `http(s)://` address, optional |
| `skypane` | the oldest Skypane it works with; refused on older ones |
| `network` | up to 10 lines in plain words of what the worker reaches. Shown on the trust screen. Be exact. |
| `worker.entry` | a `.py` file in `worker/` |
| `routes.panel` | up to 20: `{name, method: "GET" or "POST", pin?: "always" or "optional"}`. A name may appear twice, once per method. |
| `routes.manage` | up to 20: `{name, method: "POST"}`: the Manager's buttons |
| `cards` | up to 8 card types: `type` (`[a-z][a-z0-9-]{0,23}`), `name`, `icon`, `frame`, `size {w 1–12, h 1–8}`, `settings` |
| `alerts` | `true` when the worker raises alerts |

- **Route names:** `[a-z][a-z0-9-]{0,18}` (up to 19 characters), not `card`, `strings` or `alerts`. Routes and alerts
  need a worker.
- **Text that looks like a key** (`card.name`: letters and dots, no spaces) is looked up in `strings/en.json`; the package
  is refused if the key is missing. Plain text works too, but keys keep every word in one file.
- **`size`** is in the builder's old grid units (12 × 8 per screen). As of Skypane 3.0.47 a newly placed plugin card
  starts at the same small default as every built-in card and `size` no longer decides the starting size; until then,
  keep it small (`2 × 1`), never big (see [lesson 6](#lesson-6-start-small)).

## 5. The worker (the server part)

### How Skypane runs it

Skypane starts it as `python -I -B -u -X utf8 skypane_plugin.py <entry>` (the SDK's runner), as its own process:

- **Working folder:** its data folder, `DATA_DIR/plugins-data/<id>/` (0700; your files are 0600).
- **Environment:** only `PATH`, `LANG`, `TZ` and:
  - `SKYPANE_PLUGIN_ID`: its id
  - `SKYPANE_PLUGIN_DATA`: its data folder
  - `SKYPANE_PLUGIN_DIR`: its own read-only package folder (read your `strings/en.json` from here)
  - `SKYPANE_PLUGIN_PORT`: where it listens, on 127.0.0.1 (new on every start)
  - `SKYPANE_PLUGIN_TOKEN`: every call from Skypane carries it (new on every start; the SDK checks it)
- **`sys.path`:** the entry's folder, the plugin's folder and the SDK's folder, so `import helpers` finds
  `worker/helpers.py` and `import skypane_plugin` finds the SDK.
- **Crashes:** restarts back off 1 s, 2 s … 60 s; 5 crashes in 10 minutes stop it, and the Manager says why.
- **Stop:** SIGTERM; it must stop within 8 s (`sp.run()` does).

### Modules you may import

Skypane's image is one compiled program with no separate Python installation. Your `.py` files are read as source, but
every module they import must already be compiled in:

`json socket ssl struct zlib gzip base64 binascii hashlib hmac secrets random math statistics datetime collections
dataclasses enum functools itertools typing io threading queue selectors ipaddress uuid re http.client http.server
socketserver urllib.parse urllib.request urllib.error email.utils html textwrap string pathlib shutil tempfile copy
logging time calendar zoneinfo decimal fractions bisect heapq`, plus the core modules Python can't start without
(`os`, `sys`, `signal`, `_thread`…).

Check your imports against this list before release (a short `ast` script does it, see [section 12](#check-your-imports)).
**An import that's missing works in your tests and fails only on a real Skypane.**

### The SDK, `skypane_plugin`

```python
import skypane_plugin as sp

sp.data_dir()                   # pathlib.Path of the data folder
sp.write_private("x.json", obj) # obj as JSON, 0600, written whole or not at all
sp.read_private("x.json", {})   # what write_private wrote, or the default
sp.settings()                   # the owner's saved settings (dict; secrets included as text: never log them)

@sp.on_settings                 # called after the owner saves (checked every 2 s)
def changed(settings): ...

@sp.route("status")             # a panel route
def status(req): return {...}   # any JSON value, ≤ 2 MB

@sp.manage("test")              # a Manager button
def test(req): return {"ok": True, "text": "words for the owner", "save": {...}}

sp.alerts([...])                # the alerts it raises now (section 8)
sp.log("text")                  # one line in Skypane's log, with your id in front. Never a secret, address or id.
raise sp.Error("words", 404)    # in a route: that status (400–499) and {"error": words} to the caller
sp.run()                        # serve until SIGTERM
```

**A panel route's `req`:**

```
{"panel": "kitchen",                         the asking panel
 "card": "<page>/<card id>",                 the asking card
 "method": "GET" | "POST",
 "cards": [{"card": "<page>/<id>", "page": "...", "id": "...", "type": "gadget", "o": {its saved settings}}],
                                             this panel's cards of your plugin only
 "query": {...},                             GET: up to 20 values, ≤ 2 KB in all, each ≤ 500 characters
 "body": {...} | null,                       POST: the card's JSON body, ≤ 64 KB
 "ticket": true | false,                     true: the panel PIN was checked for this call
 "login": {"via": "panel"}}
```

**A Manager route's `req`:** `{"item": {the list item, secrets included} | null, "settings": {all of them},
"body": {...}, "login": {"user": "..."}}`. Answer `{"ok", "text", "save"?}`: `save` is merged into that list item when
it's saved (what a Test learned: an id, a model, firmware).

**Limits:** answers are JSON only (no NaN or Infinity), ≤ 2 MB, within a 20 s total deadline. Send pictures as `data:`
URLs inside the JSON.

### Patterns that work

**One owner for the device connection.** Many devices take one client at a time, or get confused by two at once.
Give the worker one background loop that owns every visit to every device; routes never connect themselves, they put a
job on a queue and wait for the loop's answer:

```python
jobs = queue.Queue()

def loop():                                  # the only code that talks to the device
    while not stop.is_set():
        try:
            job = jobs.get(timeout=1.0)
        except queue.Empty:
            job = None
        if job:
            device_id, cmd, holder = job
            holder["res"] = visit(device_id, cmd)
            holder["done"].set()
        for d in due_devices():
            visit(d)                         # status polls

def run_command(device_id, cmd):             # called from a route
    holder = {"done": threading.Event(), "res": None}
    jobs.put((device_id, cmd, holder))
    if not holder["done"].wait(15):          # stay inside Skypane's 20 s deadline
        return {"ok": False, "result": "timeout"}
    return holder["res"]

if __name__ == "__main__":
    threading.Thread(target=loop, daemon=True).start()
    sp.run()
```

**Short visits.** Connect, ask, disconnect. Poll slowly when idle (60 s) and faster while something is happening
(15 s). Back off on failures (20 s, 40 s, 90 s … 5 min).

**The card decides nothing about which device.** Resolve the device from the asking card's own saved setting
(`req["cards"]` entry whose `card` equals `req["card"]`, then its `o`), never from a value the card sends. A panel can
then only reach the devices its own cards were set to.

**Keep the answer small and panel-safe.** Never send addresses, ids, tokens or serial numbers to a card. Send what the
card draws, and add a version number to anything big (a map, a picture) so the card asks for it only when it changed:
`GET map?v=<version>` → `{"same": true}`.

**Allowlist commands.** A POST route takes a command name from a fixed list and checks every argument (types, ranges,
ids that must exist on the device). Refuse anything else with `sp.Error`.

## 6. Settings: the Integrations tab

Skypane draws the tab from your schema; no plugin code runs in the Manager.

```json
{"fields": [{"key": "pollSec", "type": "number", "label": "settings.poll", "min": 5, "max": 120, "default": 10}],
 "list": {"key": "devices", "label": "settings.devices", "add": "settings.add", "max": 6,
          "fields": [{"key": "name", "type": "text", "label": "settings.name", "required": true, "max": 48},
                     {"key": "ip",   "type": "host", "label": "settings.ip", "required": true, "help": "settings.ipHelp"},
                     {"key": "deviceId", "type": "text", "label": "settings.deviceId", "max": 40}],
          "actions": [{"route": "test", "label": "settings.test"}]},
 "actions": [{"route": "refresh", "label": "settings.refresh"}]}
```

- **Field types:** `text` (`max` ≤ 2000), `number` (`min`, `max`, `step`), `bool`, `select` (`options`: texts or
  `{value, label}`), `host`, `secret`. Each can have `label`, `help`, `placeholder`, `default` (not for a secret),
  `required`.
- **`host`** is a name or address on the network, and is never this machine, `localhost`, `127.x` or `169.254.x`.
- **`secret`**: readable by the worker, never sent back to the Manager (it shows "set").
- **Limits:** up to 24 fields, up to 16 in the list, the list up to 50 items. Keys: `[a-zA-Z][a-zA-Z0-9_]{0,23}`.
- Each list item gets an `"id"` (8 hex characters, Skypane's). Card settings of type `item` pick one of these ids.
- Saved to `settings.json` in the data folder (0600). Read them with `sp.settings()`; react with `@sp.on_settings`.

**Make Test useful.** It's the owner's first contact with your plugin. Return a different message for each real case:
no answer at the address; something answered but isn't the device; the device answered but needs something (asleep,
a code, a pairing button); found it (with the model, firmware, battery…). Use `save` to keep what it learned.

## 7. The card (the panel part)

### The frame

Each card runs in a sandboxed iframe: an opaque origin, a strict content policy, **no network at all**
(`connect-src 'none'`), no forms, frames, workers or navigation. Scripts and styles load only from your card folder
(relative paths: `<script src="card.js">`), pictures from there or as `data:` URLs.

- It must never navigate itself; a frame that navigates is stopped.
- Text inputs inside a card can't keep focus. Use buttons and taps, not typing.
- It can't open a pop-up outside its own frame.
- Up to 50 messages a second to the panel.

### The bridge, `window.Skypane`

```js
var S = window.Skypane;
S.get("status", {v: "3"})       // → Promise of the route's answer (declared panel GET routes only)
S.post("start", {mode: "x"})    // → Promise (asks for the PIN first when the route needs it)
S.view.get()                    // this card's saved view state (or null)
S.view.set({zoom: 2, rot: 90})  // ≤ 16 KB, kept on the panel per card: as the owner left it
S.t("card.name", {n: 3})        // your words; "{n}" filled from the object
S.on("theme", fn)               // the theme's colors changed (CSS variables are set for you)
S.on("size", fn)                // {w, h} in pixels: the card was resized
S.on("visible", fn)             // true / false: stop polling while hidden
S.options                       // the card's saved settings
```

### Writing a good card

- **Size freely.** Skypane sizes cards on the grid, and the owner drags them to any size. Pick what to show from the
  pixels you get in `on("size")`: a one-line row when short, the full view when tall. Never assume a fixed size.
- **Theme colors only:** `var(--text)`, `--muted`, `--faint`, `--accent`, `--accent-2`, `--accent-grad`, `--ok`,
  `--warn`, `--bad`, `--glass`, `--glass-strong`, `--glass-line`, `--radius`, with fallbacks. Keep the page background
  transparent: Skypane draws the card's frame.
- **Update in place.** Redraw the whole card only when its shape changes (a new state, a new size). For numbers that
  change every poll, set `textContent` on the existing elements.
- **Escape everything** you put in `innerHTML`.
- **Poll only while visible**, every 10 s idle and faster while something happens; stop on `visible: false`.
- **Problems float over the content**, never push it down: an absolute-positioned bar over the card's main area keeps
  the card's size steady.
- **Save view state** (zoom, turn, the last mode picked…) with `view.set`, debounced (0.4 s).
- **Touch:** handle pointer events, with taps ≥ 30 px. Separate a tap from a drag (a 6 px threshold) so dragging a map
  never presses a button.

## 8. Alerts

```python
sp.alerts([{"key": "abcd1234-stuck", "level": "help", "title": "Downstairs robot",
            "text": "The right back wheel is stuck. Free it, then press Resume.", "panel": "kitchen"}])
```

- `level`: `help` (shown as "Action needed"), `warning` or `info`. Never an alarm and never speech.
- `sp.alerts` replaces the last list; `[]` clears them. Up to 20. `panel` limits one to a single panel.
- They show on the panels that have a card of your plugin, as "<plugin name>: <title>".
- Raise only what needs a person. Leave out passing states (our robot's "refilling the water tank" is not an alert).
- Call it when the list changes, not on every poll.

## 9. The panel PIN

Mark a route `"pin": "optional"` (or `"always"`). Skypane adds a **PIN** yes/no to every card of your plugin; with it on,
calls to that route need the panel PIN.

- A route's PIN covers **every call** to it, so give the risky action its **own route** (`start`), separate from harmless
  ones (`command` for pause, home…).
- With no panel PIN set, nothing is asked.
- The PIN pad opens only within 3 s of a real tap on the card, never while another pad or pop-up is open, with a 30 s
  cooldown after a cancel. Tickets are single-use and tied to that card and route.
- Your worker sees `req["ticket"]: true` when the PIN was checked. It never sees the PIN.

## 10. Words

- Every word people see goes in `strings/en.json`: a flat `{"key": "text"}` object, up to 2000 entries of up to 1000
  characters. Other languages: `strings/<lang>.json`.
- Use keys in the manifest (`"card.name"`), `S.t()` in the card, and in the worker read the file from
  `SKYPANE_PLUGIN_DIR/strings/en.json` for alert texts and Test messages.
- Write plain words for people at home: say what to do ("Start any clean, then press Test again"), not error codes.

## 11. Security: what Skypane promises and what it doesn't

**Skypane enforces:**
1. Install is admin-only, after "confirm it's you", with a trust screen that lists the name, author, version, the
   package's SHA-256 and every permission in plain words. An update shows what changed in the permissions first.
2. The worker is its own process, with none of Skypane's secrets in its environment.
3. No plugin code runs in the Manager.
4. Cards are sealed: no network, only their own declared routes, through Skypane.
5. Skypane proxies every call and checks the login, the panel, the declared routes, sizes, rate limits (120 calls a
   minute per panel and plugin) and PIN tickets. The worker never sees a cookie, a login or the PIN.
6. The package is checked before unpacking and installed read-only.
7. No automatic updates and no downloads: the owner uploads every version.

**Skypane can't enforce:** the worker runs as the same user as Skypane and could read what Skypane can read, and its
`network` lines are **advisory** (a process that isn't root can't be firewalled). The trust screen says so.

**So your plugin must:**
- reach only what `network` says, and only the addresses the owner typed;
- never log or send to a card an address, id, token, serial or secret;
- treat everything from a card as untrusted (allowlists, type and range checks);
- keep personal data out of the package (no real addresses, ids, names or maps in examples and tests).

## 12. Testing

Three kinds of tests, none of which ever touch a real device.

### A stand-in device

Write a small fake of your device that speaks its real protocol on `127.0.0.1` with a random port, records what it
was sent, and can be switched between states (idle, busy, error). Make it **as strict as the real device**: if the real
one ignores a message with a wrong id, the fake must too. See [`narwal/tests/fake_robot.py`](narwal/tests/fake_robot.py).

The `host` field refuses `127.x`, so tests point the saved device at the fake by editing `settings.json` in the data
folder directly (the Narwal plugin accepts a hidden integer `port` key there for this, which the Manager never writes).
Skypane caches settings, so clear its cache after such an edit.

### Unit tests of the worker's logic

Parse every message shape the device really sent (keep captures, with personal data replaced), every state, every
odd or truncated message (it must not crash), and every command's encoding.

### End to end, through Skypane

The way Skypane tests its own example (`service/test_plugins_api.py`), and the way
[`narwal/tests/test_plugin_e2e.py`](narwal/tests/test_plugin_e2e.py) does it: pack with `pack.py`, inspect and install
through the Manager routes (with "confirm it's you"), start the worker with Skypane's `plugin_host`, call the Manager
and panel routes through Skypane's proxy, and check the fake device saw the right messages. Cover the PIN path
(refused without a ticket, works with one, a ticket works once), alerts appearing and clearing, and the card's files
being served. Run with `python -B` so nothing is written into Skypane's source.

### The card in a browser

Load your card's files in a small page with a stand-in `window.Skypane` (same methods, canned answers), then click
through it: every state, every size, every button. Check the browser console shows no errors, and that the calls it
makes are the ones you expect.

### Check your imports

```python
import ast, sys
ok = set("json socket ssl struct zlib gzip base64 binascii hashlib hmac secrets random math statistics datetime "
         "collections dataclasses enum functools itertools typing io threading queue selectors ipaddress uuid re "
         "http.client http.server socketserver urllib.parse urllib.request urllib.error email.utils html textwrap "
         "string pathlib shutil tempfile copy logging time calendar zoneinfo decimal fractions bisect heapq "
         "skypane_plugin os sys signal".split())
for f in sys.argv[1:]:
    t = ast.parse(open(f, encoding="utf-8").read())
    for n in ast.walk(t):
        names = [a.name for a in n.names] if isinstance(n, ast.Import) else [n.module] if isinstance(n, ast.ImportFrom) and n.module else []
        for m in names:
            if m not in ok and m.split(".")[0] not in ok:
                print(f, "imports", m, "- is it your own file in worker/?")
```

### Then the real device, by hand

Install the package on a real Skypane and try it with the real device: Test, every state, every button. Only you do
this, never an automated test.

## 13. Packing, versions and updates

```
python tools/plugin-kit/pack.py path/to/your-plugin -o your-plugin-1.0.0.skyplugin
```

`pack.py` (in Skypane's source) runs the same checks as the install and prints what the trust screen will show. Read
that output: it's what people will be asked to agree to.

- **Bump `version`** for every package you hand out (semver). Never reuse a version number.
- **Updates:** the owner installs the new file over the old one. Settings and the data folder are kept. The trust screen
  shows any permission change, so add new permissions only when needed.
- **Removing** keeps the data folder unless the owner ticks "Also delete its saved data".
- **Changing `id`** makes it a different plugin. Don't.
- Saved cards keep their size and settings across updates. Keep card setting keys stable.

## 14. Sharing it here

Each plugin in [`additional-plugins/`](./) gets its own folder:

```
additional-plugins/<id>/
  <id>-<version>.skyplugin     the package to download
  README.md                    what it does, which devices, setup, what it connects to, known limits, credits
  source/                      the unpacked package (what pack.py was given)
  tests/                       fake device + tests (no personal data; skip cleanly without Skypane's source)
  THIRD-PARTY-*.txt            licenses of anything it builds on
```

and a row in [`additional-plugins/README.md`](README.md). Before you open the pull request:

- **Scan for personal data**, in the source **and inside the `.skyplugin`**: real IP addresses, device ids, serial
  numbers, names, room names, email addresses, local paths (`C:\Users\…`), host names.
- **Credit what you learned from**, and include its license when you used it (an MIT project needs its notice included).
- **Say what's not proven**: anything you couldn't confirm on a real device goes in the README's known limits.

## 15. Lessons from the Narwal plugin

These are real mistakes and surprises from building the first plugin.

### Lesson 1: prove the protocol on the real device first
The reference notes said the robot would identify itself to anyone who asked. It didn't: it ignores every message
unless it already carries its own id, and a docked robot sends nothing at all. Our first release passed every test and
failed on the first real install, because the fake robot answered things the real one never does. **Before writing the
plugin, try each step (find, identify, status, command) by hand against the real device, read-only where possible,
and write down exactly what it does and doesn't answer.**

### Lesson 2: make the fake as strict as the device
After lesson 1, the fake robot was changed to ignore wrong ids exactly like the real one, and the tests caught the next
problem at once. A lenient fake hides real bugs.

### Lesson 3: discovery needs a plan B
If a device can't be identified while idle, say so in Test, tell the owner how to wake it, learn what it reveals while
awake, and offer a field to type the missing piece. Then "found it" means proven, never assumed.

### Lesson 4: one connection, short visits
The robot takes one local client at a time, and the owner's phone app is another. One loop owns every visit, visits last
under a second, and commands queue to that loop.

### Lesson 5: don't trust a single field when the device lies
The robot's "operating state" stayed at one value for a whole mop job. The real stages showed only in other fields
(dock flags, sub-states) and in what changed between polls. Watch the device through a whole real job before deciding
what a state means.

### Lesson 6: start small
The first card asked for a 4 × 6 starting size and filled a third of the panel. Cards should start small and grow;
Skypane 3.0.47 now ignores the manifest size for a new card's start.

### Lesson 7: sealed frames have edges
A card can't open a pop-up, keep a text field focused, or reach the network. Design for taps and for the space you
have.

### Lesson 8: save what people set
People expect the map they turned and zoomed to stay that way. `view.set` it, debounced.

### Lesson 9: check imports against the compiled list
A from-source test can't catch a module missing from Skypane's compiled image. Check by script before release.

### Lesson 10: say what isn't proven
Room-only cleaning still needs a confirmation on a real robot, and its README says so.

## 16. Checklists

### Before the first line of code
- [ ] The device's protocol tried by hand on a real device: find, identify, status, one command.
- [ ] What it does when idle, busy, asleep, offline, and with two clients at once.
- [ ] What it ignores (wrong ids, wrong keys, bad messages).

### Before release
- [ ] `pack.py` passes; you read its trust-screen output.
- [ ] `network` lists exactly what the worker reaches.
- [ ] Imports checked against the compiled list.
- [ ] Every word in `strings/en.json`; no raw words in the card or worker.
- [ ] The card works at every size, every state, in a dark and a light theme, with no console errors.
- [ ] The card is ES5.
- [ ] Commands allowlisted; the device comes from the card's own setting.
- [ ] No address, id, token or secret reaches a card or the log.
- [ ] Unit, end-to-end and card tests pass; the fake is as strict as the device.
- [ ] Tried on a real Skypane with the real device.
- [ ] `version` bumped.
- [ ] Personal-data scan of the source and the `.skyplugin`: clean.
- [ ] README: features, devices, setup, what it connects to, known limits, credits.

## 17. Reference: every limit in one place

| What | Limit |
|---|---|
| Skypane version | 3.0.46.1 or newer; manifest `api: 1` |
| Plugins installed | 40 |
| Package | ≤ 10 MB zipped, ≤ 300 entries, ≤ 5 MB a file, ≤ 30 MB unpacked, ≤ 8 folders deep |
| File types | `.py .json .js .css .html .svg .png .jpg .webp .md .txt`; `.py` only in `worker/` |
| `plugin.json` | ≤ 256 KB |
| `strings/<lang>.json` | ≤ 512 KB, ≤ 2000 entries, ≤ 1000 characters each |
| `icon.svg`, `help.md` | ≤ 64 KB each |
| `id` | `[a-z][a-z0-9-]{2,39}` |
| `name` / `author` / `description` | ≤ 60 / 80 / 500 characters |
| `network` | ≤ 10 lines |
| Routes | ≤ 20 panel, ≤ 20 manage; names `[a-z][a-z0-9-]{0,18}`; not `card`, `strings`, `alerts` |
| Card types | ≤ 8; type `[a-z][a-z0-9-]{0,23}`; `size` w 1–12, h 1–8 |
| Card JavaScript | ≤ 512 KB per card type |
| Settings | ≤ 24 fields, ≤ 16 list fields, ≤ 50 list items; keys `[a-zA-Z][a-zA-Z0-9_]{0,23}` |
| Card settings | ≤ 24; types text, number, bool, select, color, item; Skypane's own keys refused (`plugin type pin title icon id items` …) |
| Worker answer | JSON only, ≤ 2 MB, 20 s deadline, no NaN / Infinity |
| Panel call | ≤ 64 KB body; query ≤ 20 values, ≤ 2 KB, ≤ 500 characters each; 120 calls a minute per panel and plugin |
| Card view state | ≤ 16 KB per card |
| Card messages | ≤ 50 a second |
| Alerts | ≤ 20; levels help, warning, info |
| Worker stop | ≤ 8 s after SIGTERM |
| Worker restarts | back off 1 s … 60 s; 5 crashes in 10 minutes stop it |
| PIN pad | within 3 s of a real tap; 30 s cooldown after a cancel; tickets single-use |
