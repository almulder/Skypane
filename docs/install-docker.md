# Install Skypane with Docker (any computer, Docker Compose, Synology)

Skypane runs as one container: `ghcr.io/almulder/skypane`. It's public, so no login is needed. For Unraid, use
[install-unraid.md](install-unraid.md) instead.

The machine should stay on: the panels on your walls talk to it all day. Linux works best (a mini PC, a NAS). Docker
Desktop on Windows or macOS works for trying it out.

**The 3.0 image is for x86-64 (Intel / AMD) machines only.** A Raspberry Pi or an ARM-based NAS can't run it yet.

## Two things first

1. **A folder for Skypane's data** that the container may write to. The container runs as user 99, group 100
   (`nobody:users`, the same as Unraid), not as root, so that user has to own the folder.

   **Linux** (and a NAS over SSH): make the folder and hand it over:

   ```
   sudo mkdir -p /srv/skypane
   sudo chown -R 99:100 /srv/skypane
   ```

   ⚠ Copy the lines exactly. The path must end in `/skypane` (or your own Skypane folder). Never run `chown` on `/`,
   your home folder or another app's folder. Use any path you like; this guide uses `/srv/skypane`.

   **Windows or macOS with Docker Desktop:** no `sudo` and no `chown`. Let Docker keep the data in a **named volume**
   (simplest: see [Docker Desktop](#docker-desktop-windows--macos) below), or use a folder in your user folder, e.g.
   `C:\Users\<you>\skypane` or `/Users/<you>/skypane`; Docker Desktop lets the container write there.
2. **Your computer's IP address** on your home network, e.g. `192.168.1.20`. The tablets open Skypane there, so give
   the machine a fixed address in your router.

## Option A — Docker Compose (recommended)

Make a folder, e.g. `~/skypane`, with this file named `compose.yaml`:

```yaml
services:
  skypane:
    image: ghcr.io/almulder/skypane:latest
    container_name: skypane
    restart: unless-stopped
    network_mode: host        # Linux: Skypane uses the machine's own ports (simplest)
    volumes:
      - /srv/skypane:/data
```

Then, in that folder:

```
docker compose up -d
docker compose logs -f        # Ctrl+C to stop watching
```

The log should show `[run_all] server started (pid …)` and `… dashboard service … on 0.0.0.0:8088`.
`Hubitat not set up … bridge not started` is normal for now.

Skypane is now at **`http://192.168.1.20:8088/`** (that page shows Skypane's status, and on a new tablet the code to
pair it — [panel-pairing.md](panel-pairing.md)); the Manager is **`http://192.168.1.20:8088/admin/`**.
With Docker, every Skypane address has `:8088` after the IP — the panels' addresses too (e.g.
`http://192.168.1.20:8088/kitchen`), wherever the other guides write `http://192.168.1.50/…`.

Check: `http://192.168.1.20:8088/api/health` shows `{"ok": true, …}`.

### Without host networking (Docker Desktop on Windows / macOS, or if you prefer port mappings)

Map the ports and tell the camera video which address the tablets use:

```yaml
services:
  skypane:
    image: ghcr.io/almulder/skypane:latest
    container_name: skypane
    restart: unless-stopped
    ports:
      - "8088:8088"       # the panels and the Manager
      - "1883:1883"       # MQTT for devices (FreeKiosk)
      - "9001:9001"       # MQTT for the panel pages
      - "1984:1984"       # camera video
      - "8555:8555"       # camera video (WebRTC)
      - "8555:8555/udp"
    environment:
      - GO2RTC_CANDIDATE=192.168.1.20   # this computer's IP: where the tablets fetch camera video
    volumes:
      - /srv/skypane:/data
```

All six ports are needed, at the same numbers on both sides. Without `GO2RTC_CANDIDATE`, camera video may stay black
on the tablets (everything else works).

### Docker Desktop (Windows / macOS)

Use the port-mapping file above, but with a named volume for the data (Docker Desktop then takes care of who owns it).
Replace its `volumes:` part with:

```yaml
    volumes:
      - skypane-data:/data

volumes:
  skypane-data:
```

(The last `volumes:` starts at the very beginning of its line, not under `skypane:`.) Your data then lives in Docker
Desktop's **Volumes** list. Or use a folder in your user folder instead: `- C:\Users\<you>\skypane:/data` (Windows) or
`- /Users/<you>/skypane:/data` (macOS).

Docker Desktop is fine for trying Skypane out. For the wall, that computer has to stay on (no sleep).

## Option B — plain `docker run`

```
docker run -d --name skypane --restart unless-stopped --network host \
  -v /srv/skypane:/data ghcr.io/almulder/skypane:latest
```

Check: `docker logs skypane` shows `[run_all] server started (pid …)`, and `http://192.168.1.20:8088/api/health` shows
`{"ok": true, …}`.

## Synology

Container Manager (DSM 7.2 or newer, on a Synology with an Intel or AMD processor — e.g. the "+" models):

1. **File Station:** make a folder `docker/skypane` (e.g. `/volume1/docker/skypane`).
2. Give it to the container's user. **Control Panel → Terminal & SNMP → Enable SSH**, then log in with SSH and run:

   ```
   sudo chown -R 99:100 /volume1/docker/skypane
   ```

   (You can switch SSH off again afterwards.)
3. **Container Manager → Project → Create:** name `skypane`, path `docker/skypane`, *Create compose.yaml*, and paste:

   ```yaml
   services:
     skypane:
       image: ghcr.io/almulder/skypane:latest
       container_name: skypane
       restart: unless-stopped
       network_mode: host
       volumes:
         - /volume1/docker/skypane:/data
   ```

4. **Next → Done.** Container Manager downloads and starts it. Skypane is at `http://<your NAS's IP>:8088/`.
   Check: `http://<your NAS's IP>:8088/api/health` shows `{"ok": true, …}`.

If another package already uses port 1883 (e.g. the Mosquitto package) or 8088, stop it, or use the port-mapping
version above with other numbers on the left only for 8088. 1883, 9001, 1984 and 8555 must stay the same on both
sides.

## Then, right away: create your login

Open the Manager: `http://<address>:8088/admin/`. The **first** person to open it creates the owner login (a
username and a password of 8 characters or more), so do this before anyone else on your network can. (Logins you add
later for your family need 4 characters or more.)

(Screenshot: the first visit's *Create your login* page.)

How you know it worked: after creating the login and signing in, you see the Manager's **Overview**. If the page says
*Skypane can't save to its data folder* instead, the folder doesn't belong to user 99: repeat the `chown` above, then
`docker restart skypane` ([Troubleshooting](troubleshooting.md#the-data-folder-isnt-writable)).

Continue with [hubitat.md](hubitat.md) (connect your hub) and [first-run.md](first-run.md) (your house and the
tablets).

## Good to know

- **Check it runs:** `http://<address>:8088/api/health` shows `{"ok": true, …}`. `"dataWritable": false` means the
  data folder isn't writable by user 99 — repeat the `chown` above, then restart the container
  (`docker restart skypane`, or `docker compose restart`). The restart matters: the built-in MQTT broker only starts
  again with it.
- **Opening Skypane by a name** (e.g. `http://skypane.local:8088`) instead of the IP: add the container variable
  `ALLOWED_HOSTS` with that name (several separated by commas) and re-create the container
  ([below](#setting-a-container-variable)). Otherwise Skypane shows a page *Skypane doesn't know this address* — that
  protects it from other web pages. (A name saved in the Manager before v3.0.3 keeps working until you set the
  container variable; `none` clears it.)
- **A device shows on a panel but won't switch:** add the container variable `BRIDGE_ALLOW` with its Hubitat device
  number (several separated by commas) and re-create the container ([below](#setting-a-container-variable)). `none`
  clears a value saved in the Manager before v3.0.3.
- **Keep it on your home network.** Don't port-forward Skypane to the internet.
- **Secrets** (the Hubitat token, camera keys) are kept in the data folder's `private/`, never shown again and never
  logged. Back up the whole data folder.
- **Forgot the owner password?** `docker exec -it skypane python service/reset_login.py` — only that password is
  cleared; type a new one there, or use the one-time code it prints ("I have a sign-in code" on the sign-in page).

### Setting a container variable

A new container variable only takes effect when the container is **re-created** — `docker restart` keeps the old
ones. Your data folder isn't touched.

- **Docker Compose:** add an `environment:` part under `skypane:` in `compose.yaml` (or add the line to the one you
  have), then run `docker compose up -d` in that folder — it re-creates the container with the new value:

  ```yaml
      environment:
        - ALLOWED_HOSTS=skypane.local
  ```

- **`docker run`:** remove the container and run it again with `-e`:

  ```
  docker rm -f skypane
  docker run -d --name skypane --restart unless-stopped --network host \
    -e ALLOWED_HOSTS=skypane.local \
    -v /srv/skypane:/data ghcr.io/almulder/skypane:latest
  ```

- **Unraid:** Docker → Skypane → **Edit** → **Add another Path, Port, Variable** → Config Type **Variable**, Key
  `ALLOWED_HOSTS`, Value `skypane.local` → **Add** → **Apply** (Unraid re-creates the container).

The startup log says where each of these values comes from (the container variable, or a value saved before 3.0.3).
