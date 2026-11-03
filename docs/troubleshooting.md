# Troubleshooting and FAQ

First places to look:

- **Manager → Health:** each part (hub, broker, cameras, panels) with what's wrong and what to do. **Check now** runs
  every check at once. **Timeline** shows what happened, when.
- **The container's log:** Unraid → Docker → the Skypane icon → **Logs**; Docker: `docker logs skypane` (or
  `docker compose logs`). Lines start with the part that wrote them: `[server]`, `[bridge]`, `[run_all]`, `[go2rtc]`.
- **`http://<skypane>/api/health`** answers `{"ok": true, …}` when the server runs and can write its data folder.

(Screenshot: the Health page with one amber card.)

## I don't know Skypane's address

- **Unraid:** the Fixed IP you picked when you added the container (Docker tab → the Skypane row shows it), e.g.
  `http://192.168.1.50/`.
- **Docker:** the computer's IP address, then `:8088`, e.g. `http://192.168.1.20:8088/`.

## The Manager or a panel doesn't open

- **`/manage` says "The Manager moved":** since Skypane 3.0.1 the Manager is at **`/admin`** (e.g. `http://192.168.1.50/admin/`).
  Update your bookmark or home-screen icon; the old address doesn't forward.
- **The bare address shows Skypane's status, not a panel:** that's normal since 3.0.2 — a panel has its own
  address (e.g. `http://192.168.1.50/kitchen`), and a tablet is paired first. See [Pairing problems](#pairing-problems).
- **Nothing answers:** is the container running? Is the address right (Docker: port `8088`, e.g.
  `http://192.168.1.20:8088/`)? On Unraid with br0, the Unraid server itself can't reach a container's br0 address by
  default — try from another device.
- **"Skypane doesn't know this address":** you opened Skypane by a name instead of its IP. Add that name in
  **Integrations → General → Extra names for this server (optional)** and press **Save and restart**, or use the IP.
- **"Skypane can't save to its data folder"** on the sign-in page: see [the next section](#the-data-folder-isnt-writable).
- **The page says "Restarting — back in a few seconds" for longer than a minute:** look at the container's log for a
  line from `[run_all]` or `[server]` that says what's wrong, then reload the page.

## The data folder isn't writable

The Manager's sign-in page says **Skypane can't save to its data folder**, and `/api/health` says `"dataWritable": false`
(HTTP 503). The container runs as user 99, group 100 (`nobody:users`), and that user doesn't own the data folder. (This
also happens when the folder didn't exist before the first start: Docker then makes it, owned by root.)
Nothing is lost and nothing is locked; give the folder to that user:

- **Unraid** (terminal): `chown -R nobody:users /mnt/user/appdata/skypane`
- **Docker on Linux:** `sudo chown -R 99:100 /srv/skypane` (your folder)
- **Docker Desktop on Windows / macOS:** use a named volume or a folder in your user folder
  ([install-docker.md](install-docker.md#docker-desktop-windows--macos)).

⚠ Type the path exactly: it must end in your Skypane folder (`…/skypane`). Then restart the container (Unraid: Docker
tab → the Skypane icon → **Restart**; Docker: `docker restart skypane`) and reload the Manager.

## No devices, or "Hubitat not set up"

- The log says `Hubitat not set up (Manager page → Integrations) — bridge not started`: fill in **Integrations → Home
  hub** (address, Maker API app number, token) and **Save and restart** ([hubitat.md](hubitat.md)).
- Health says the hub can't be reached: check the hub's address, and that Maker API has **Allow Access via Local IP
  Address** on.
- A device is missing: tick it in the **Maker API** app. It shows within a few minutes.

## Pairing problems

Since 3.0.2 each panel works only on the tablet approved for it ([panel-pairing.md](panel-pairing.md)).

- **The tablet shows Skypane's status and "Connect this panel" instead of its panel:** it isn't paired (yet), or it lost
  its key. Approve its code in **Panels → New panel requests**. After an upgrade from 3.0.1, a tablet that opened the
  bare address (`http://192.168.1.50/`) used to show the main panel — that panel is gone; approve the tablet with a
  name ([upgrade.md](upgrade.md#301--302-panel-pairing)).
- **"Unable to connect. This panel is connected to another device (…)":** another tablet has this panel. That's the
  lock working — you opened the address on the wrong device (a phone, a laptop). To give the panel to this tablet:
  **Panels → Setup →** the panel **→ Unlink device**, then press **Connect this device** on the tablet and approve it
  with the panel's name. To look at a panel from a computer, use **Live** in the Manager.
- **"Unable to connect. This panel isn't connected yet.":** no tablet was approved for that address (or there's no
  panel there). Press **Connect this device** and approve the code with the panel's name.
- **"Pairing is closed. Ask the admin to open it in the Manager.":** **Accept new panels** is off. Switch it on in
  **Panels** (the New panel requests box), and the tablet asks again by itself.
- **The code doesn't work:**
  - The code renews every 10 minutes (*New code in …*). Type the one the tablet shows now.
  - *That isn't the code on the tablet — 2 tries left*: check for look-alikes — codes never use 0, O, 1 or I.
  - *Too many wrong codes — the request was cancelled*: 5 wrong codes end a request (and raise a notice). The tablet
    starts a new one with a new code.
- **The tablet isn't under New panel requests, or "This tablet has left the pairing screen":** a request lasts only
  while the pairing screen is open. A tablet that went to sleep or opened another page drops out. Wake it and reload
  `http://192.168.1.50/`.
- **"… is already claimed by another device. Unlink it first or choose another name.":** that panel has a tablet.
  **Unlink device** on it first, or type another name.
- **Cleared browser data, a new browser, a reinstalled FreeKiosk or a new tablet:** the key is gone. (If only one of
  the two copies went, the tablet says *Reconnecting this panel…* and goes on by itself.) Otherwise it shows the
  pairing screen: **Unlink device** on its old panel, then approve the tablet with that panel's name — its settings
  are kept. Or approve it with a new name, if you want a new panel.
- **A notice "Possible copy of …'s device key":** an old copy of that panel's key was used from another device. If
  you know why (you restored a tablet from a backup, say), press **Re-trust this device** on the panel. If not, press
  **Unlink device** and pair the tablet again — the copy then stops working. With **Lock a panel when its key is
  copied** on, the panel stays stopped until you choose one of the two.
- **A notice "… looks like a different device now":** a valid key came from a quite different browser or system.
  After a browser change on the tablet that's normal. Otherwise, treat it like a copy.
- **A panel's page stopped and went to the pairing screen:** its key was refused — unlinked, moved, removed, or a
  copy alert with the lock on. **Health → Timeline** says which.

## A panel shows old values, or "can't reach"

- The panel's status bar shows a red dot or "offline": the tablet lost Wi-Fi, or Skypane restarted. It reconnects by
  itself.
- **Health → Panels** shows when each tablet last checked in.

## FreeKiosk's MQTT doesn't connect

- Broker = Skypane's IP, port `1883` (Docker with port mappings: the host's IP, and 1883 must be mapped).
- User and password exactly from **Integrations → Message broker → Login for devices** (**Copy user**, **Copy password**).
- The device name matches **Panels → Setup → General → FreeKiosk device name**.

## Camera video stays black

- Protect: **Integrations → Cameras** needs the console's address and an API key; **Health → Cameras** says what's wrong.
- Docker with port mappings (not host networking): set `GO2RTC_CANDIDATE` to the host's IP, and map `1984` and `8555`
  (TCP **and** UDP) at the same numbers ([install-docker.md](install-docker.md)).
- A firewall between the tablets and Skypane must let ports 1984 and 8555 through.

## I forgot the owner password

Run, on the machine running Skypane:

```
docker exec -it skypane python service/reset_login.py
```

(Another login: add `--user <name>`.) Only that password is cleared — the logins, settings, devices and panels stay.
Type a new password right there, or use the one-time code it prints: sign-in page → **I have a sign-in code** (within an
hour). The command prints the Manager's address with `<Skypane's IP>` in it — put your Skypane's address there.

(Forgot the password of another login, not the owner's? The owner or an admin can also make that login a sign-in code
in **Accounts**.)

## I forgot the panel PIN

An admin sets a new one in the Manager: **Panels → Setup →** any panel **→ Safety → Panel PIN → Change PIN…**. Type
the new PIN twice and your own Manager password — the old PIN isn't needed, and it also ends any PIN lock-out.
**Clear…** removes the PIN altogether.

Forgot your Manager password as well? Reset that first ([above](#i-forgot-the-owner-password)).

## "Too many wrong tries"

- **Manager login:** locked for 5, then 10 minutes; after that until an admin unlocks it (**Accounts**) or the reset
  command above.
- **Panel PIN:** the PIN pad counts down by itself (Settings: 5 minutes after 5 wrong PINs).

## The time is wrong on the panels

Set **Integrations → General → Time zone** (e.g. `America/Chicago`) and **Save and restart**.

## Send feedback says it can't reach the feedback service

Your Skypane server needs internet access to send a report. Press **Copy report** and send the text another way.

## FAQ

- **Does Skypane need the internet?** No — the panels, the Manager and Hubitat all stay on your home network. The
  weather, the calendar links and **Send feedback** use the internet when you use them.
- **Can I open it from outside my home?** Not by port-forwarding — keep it on your home network. Use a VPN (e.g.
  WireGuard or Tailscale) to reach your home network instead.
- **Where are my settings?** All in the data folder (`appdata/skypane` or your Docker folder): `panels/` (each panel),
  `house/` (house files), `backups/` (automatic backups of each panel), `private/` (logins, secrets and the
  panels' device keys — keep it private). Back up the whole folder.
- **What's in a feedback report?** Only what you see before sending: your words, the Skypane version, the page, your
  browser, and counts (panels, devices, cameras, logins). Skypane adds no names, addresses or passwords; your
  words go as you typed them, so leave out private details.
