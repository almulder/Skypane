# Updating and rolling back

**In short:** Unraid: **Docker** tab → **apply update**. Docker Compose: `docker compose pull && docker compose up -d`.
That's it — your settings stay.

Skypane keeps everything in its data folder. Updating only swaps the program: your panels, layouts, logins and settings
stay. Panels reload by themselves when the new version starts.

**Version tags:** `latest` is the newest release. Fixed versions are tagged too (`3.0.0`, `3.0.1`…). Use a fixed tag if
you want to decide when to update. The Manager shows the version under the Skypane name in the sidebar (e.g.
`v3.0.0 · sha-1234567`), and each panel shows it in its lower-left corner.

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

## Release notes

[CHANGELOG.md](../CHANGELOG.md) lists what changed in each release.
