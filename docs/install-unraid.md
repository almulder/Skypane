# Install Skypane on Unraid

About 10 minutes. You need Unraid 6.12 or newer (Docker enabled) and a free IP address on your network.

## 1. Get the template

The template comes inside the Skypane image, which is public, so no login is needed.

1. Open the Unraid web page → **Terminal** (the `>_` icon, top right).
2. Paste this line and press Enter:

   ```
   docker pull ghcr.io/almulder/skypane:latest && docker run --rm --entrypoint cat ghcr.io/almulder/skypane:latest /app/unraid/skypane.xml > /tmp/skypane.xml && cp /tmp/skypane.xml /boot/config/plugins/dockerMan/templates-user/my-skypane.xml && rm /tmp/skypane.xml && echo "template saved"
   ```

   It should end with `template saved`. (`/app/unraid/skypane.xml` is the template's place *inside the image*.)

Do this only for the first install. Later updates don't need it (see [upgrade.md](upgrade.md)).

3. Still in the terminal, make Skypane's data folder and give it to the user the container runs as (Skypane doesn't
   run as root, so it must own its folder):

   ```
   mkdir -p /mnt/user/appdata/skypane && chown -R nobody:users /mnt/user/appdata/skypane
   ```

   ⚠ Copy the line exactly. The path must end in `/skypane`. Don't run `chown` on `/mnt/user` or on another app's
   folder: it would change who owns all of those files.

   Check: the command prints nothing. (If you skip this step, the Manager later says *Skypane can't save to its data
   folder* — see [Troubleshooting](troubleshooting.md#the-data-folder-isnt-writable).)

## 2. Pick an address for Skypane

Skypane gets its own IP address on your network, through Unraid's **br0** network: a setting that gives Skypane its
own address, as if it were a separate device. The tablets and your phone will open Skypane at that address.

- Pick an address outside your router's DHCP range (the range of addresses your router hands out by itself) — for
  example `192.168.1.50` if your router hands out `192.168.1.100`–`192.168.1.250`. Your router's settings show the
  range.
- Check that it's free: in the Unraid terminal, `ping -c 2 192.168.1.50` should get **no** answer.

## 3. Add the container

1. **Docker** tab → **Add Container** → **Template:** choose **skypane** (under *User templates*).
2. **Network Type:** `Custom: br0`. **Fixed IP address:** the address from step 2.
3. Leave the rest as it is:
   - **Data** = `/mnt/user/appdata/skypane` — everything Skypane keeps lives here.
   - **Web port** = `80`, so Skypane is simply `http://192.168.1.50/`.
   - **Pictures** (optional, 3.0.5) = a folder of your photos, e.g. `/mnt/user/Photos`, mapped **read only** to
     `/pictures`. Slide shows, rotating backgrounds and the screensaver can then play the folders you pick in the
     Manager (**Picture folders**). A NAS share: mount it on Unraid first (**Unassigned Devices** → mount the share;
     it shows up under `/mnt/remotes/…`) and pick that folder here. Skypane only reads picture files and never mounts
     anything itself. More folders later: first create an empty folder for it inside the Pictures folder (e.g.
     `/mnt/user/Photos/Family` — `/pictures` is read only, so Docker can't make it, and the container wouldn't
     start), then **Add another Path, Port, Variable…** → that path, `/pictures/Family`, read only.
   - **Extra Parameters** already holds what lets Skypane use port 80 without running as root (they also lock the
     container down: no extra rights). Don't remove it. If you do, set **Web port** to `8088`.
   - Changed **Web port**? Then also change the port in the **WebUI** field (switch to **Advanced View**, top right)
     to the same number, or the WebUI button opens the old port.
4. Press **Apply**. Unraid downloads the image and starts it.

(Screenshot: Unraid's Add Container page with Network Type `Custom: br0` and the Fixed IP filled in.)

## 4. Check that it runs

- **Docker** tab → the Skypane icon → **Logs**. You should see `[run_all] server started (pid …)` and
  `[server] … dashboard service … on 0.0.0.0:80`. The line `Hubitat not set up … bridge not started` is normal for now.
- In a browser: `http://192.168.1.50/api/health` shows `{"ok": true, …}`.
- `http://192.168.1.50/` itself shows Skypane's status. It isn't a panel: each tablet gets its own panel by pairing
  with a code ([first-run.md](first-run.md), [panel-pairing.md](panel-pairing.md)).

Open these from another computer or your phone. The Unraid server itself can't reach Skypane's own br0 address (an
Unraid quirk; nothing is wrong).

(Screenshot: the health page in a browser, showing `{"ok": true, …}`.)

## 5. Create your login — right away

Open the Manager: the container's **WebUI** button, or `http://192.168.1.50/admin/`.

The **first** person to open it creates the owner login (a username and a password of 8 characters or more). Do this
now, before anyone else on your network can. (Logins you add later for your family need 4 characters or more.)

(Screenshot: the first visit's *Create your login* page.)

How you know it worked: after creating the login and signing in, you see the Manager's **Overview**. If the page shows
*Skypane can't save to its data folder* in place of the create-login form, repeat the `chown` line of step 1, then
restart the container (Docker tab → the Skypane icon → **Restart**) and reload the page.

Then continue with [hubitat.md](hubitat.md) (connect your hub) and [first-run.md](first-run.md) (your house and the
tablets).

## Good to know

- **Ports on that address:**

  | Port | Used for |
  |---|---|
  | 80 | the panels and the Manager |
  | 1883 | MQTT for devices (FreeKiosk) |
  | 9001 | MQTT for the panel pages |
  | 1984 | camera video |
  | 8555 (TCP and UDP) | camera video |

  Nothing needs opening on your router. Keep Skypane on your home network: **don't port-forward it**.
- **Secrets** (the Hubitat token, camera keys) are kept in `/mnt/user/appdata/skypane/private`. They're never shown
  again, never logged and never sent to a browser. Back up the whole `appdata/skypane` folder like your other
  containers.
- **Forgot the owner password?** Unraid terminal: `docker exec -it skypane python service/reset_login.py`. Only that
  password is cleared; type a new one there, or use the one-time code it prints ("I have a sign-in code" on the
  sign-in page).
