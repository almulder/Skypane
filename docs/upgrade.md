# Updating and rolling back

**In short:** Unraid: **Docker** tab → **apply update**. Docker Compose: `docker compose pull && docker compose up -d`.
That's it — your settings stay.

Skypane keeps everything in its data folder. Updating only swaps the program: your panels, layouts, logins and settings
stay (3.0.2 removes the old main panel — see below). Panels reload by themselves when the new version starts.

**Version tags:** `latest` is the newest release. Fixed versions are tagged too (`3.0.0`, `3.0.1`, `3.0.2`…). Use a fixed tag if
you want to decide when to update. The Manager shows the version under the Skypane name in the sidebar (e.g.
`v3.0.0 · sha-1234567`), and each panel shows it in its lower-left corner.

## 3.0.1 → 3.0.2: panel pairing

From 3.0.2 on, a panel only works on the tablet the admin approved for it ([panel-pairing.md](panel-pairing.md)).
There's no built-in "main" panel any more. What the update does by itself, at its first start:

- **The old main panel (`/`) is removed** — its look, layout and settings. (A last copy stays in `backups/`.)
  Skypane's bare address (`http://192.168.1.50/`, or `http://192.168.1.20:8088/` with Docker) now shows Skypane's status,
  and on a tablet that isn't paired, **Connect this panel** with a code.
- **The house's "may switch" rule is kept** (which devices no panel may switch — the sprinklers, the freezer…). It
  lived in the main panel's settings; it's now in `house/switch-rule.json`, still edited in **Devices** (**The panels
  may switch it**, the admin).
- **For 24 hours, the tablets you already use are connected automatically.** Each one's next visit to its own address
  (e.g. `/kitchen`) gives it its key, with no code. The Manager shows a banner — *Existing tablets are being connected
  automatically until …* — and a notice per tablet. After that, every new tablet needs a code.
- **The panel PIN stays.** The admin now sets, resets or clears it in the Manager (**Panels → Setup →** a panel **→
  Safety → Panel PIN**), with their own Manager password.

What to do:

1. **Update** as usual (below), then within the 24 hours, **switch on every tablet** (or reload its page) so it gets
   its key. **Panels** → each panel's **Its tablet** card then shows the device and *Paired*.
2. **The tablet that showed the main panel** (bookmarked at `http://192.168.1.50/`) now shows **Connect this panel**.
   Approve it in **Panels → New panel requests** with a name, e.g. `Hallway`. Tick **Use the FreeKiosk name
   skypane** in that dialog to keep its FreeKiosk MQTT settings working as they are. Its old look is gone: give the
   new panel one in **Look & layout** (or start from another panel's).
3. All tablets done? Press **Lock all panels now** on the banner: from then on only approved tablets work. (Not
   pressed, it locks by itself after 24 hours.)
4. A tablet you missed: approve it with a code like a new one — type its panel's name and it keeps that panel's
   settings. That panel must have no tablet yet (**Unlink device** first if needed).

Also new in 3.0.2: a panel's Setup tabs in the Manager have a **Save** bar. Changes wait (*2 changes waiting*) until
you press **Save**; then they're sent to the panel at once.

## 3.0.1: the Manager moved to /admin

The Manager is now at **`http://<skypane>/admin/`** (it was `/manage/`). The old address doesn't forward — it shows a short
"the Manager moved" page — so update your bookmarks and any home-screen icon (add it again from the new address). On Unraid, your
container keeps its old **WebUI** button: edit the container, switch on **Advanced View**, set **WebUI** to
`http://[IP]:[PORT:80]/admin/` and **Apply**. The panels don't change.

If you had a panel called **admin**, it now opens at **`/admin-panel`**: point that tablet there (Health and the
Overview say so until it does). Its settings, layout and alerts stay as they were.

## Before you update

Back up the data folder now and then (it's small): copy `appdata/skypane` (Unraid) or your Docker folder. Skypane also
keeps automatic backups of every panel's settings in `backups/`.

## Update

- **Unraid:** **Docker** tab → **Check for Updates** → **apply update** next to Skypane. Keep your template as it is —
  don't fetch the template again (that would reset your values).
- **Docker Compose:** in the folder with `compose.yaml`: `docker compose pull && docker compose up -d`.
- **docker run:** `docker pull ghcr.io/almulder/skypane:latest`, then remove and start the container again with the
  same command and folder.
- **Synology:** Container Manager → **Project → skypane → Action → Build** (it pulls the newer image), or **Image → Update**.

Check afterwards: the version tag shows the new number, and **Health** is green.

## Roll back

Run the previous version with the same data folder:

- Set the image to the version you had, e.g. `ghcr.io/almulder/skypane:3.0.0` (Unraid: edit the container →
  **Repository**; Compose: the `image:` line), then start it again.
- Rolling back to an older version can drop settings that only the newer one knows — for example a login's language,
  display name or colour. Set them again after you update forward.
- Within 3.0.x, every version reads the same data folder. If a release ever changes that, its notes will say so — and
  then restore the backup you made before updating.
- **3.0.2 back to 3.0.1:** 3.0.1 doesn't know pairing. Its panels open again on any device, and its main panel comes
  back empty, without the "may switch" rule (that is in `house/switch-rule.json` now, which 3.0.1 doesn't read).
  Restore the data-folder backup you made before updating to get the old main panel back.

## Release notes

[CHANGELOG.md](../CHANGELOG.md) lists what changed in each release.
