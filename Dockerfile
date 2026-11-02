# Skypane (wall-panel pages + the Manager + per-panel settings API + Hubitat <-> MQTT bridge).
# Built by the Skypane repo's workflow -> ghcr.io/almulder/skypane. Install: docs/install-unraid.md, docs/install-docker.md.
# No secrets and no house data in this image: settings come from container environment variables (Unraid template),
# house files from the /data volume (/data/house/).
FROM python:3.12-slim

LABEL org.opencontainers.image.title="Skypane" \
      org.opencontainers.image.description="Skypane: a wall-panel dashboard for Hubitat - panel pages, the Manager, the Hubitat-MQTT bridge" \
      org.opencontainers.image.source="https://github.com/almulder/Skypane" \
      org.opencontainers.image.url="https://github.com/almulder/Skypane" \
      org.opencontainers.image.licenses="LicenseRef-AllRightsReserved"

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8088 \
    BIND=0.0.0.0 \
    DATA_DIR=/data \
    DASHBOARD_DIR=/app/dashboard \
    MQTT_PORT=1883 \
    TZ=UTC

# segno: the guest Wi-Fi QR code (service/guest_wifi.py; pure Python, no other packages); pillow: every uploaded
# picture is drawn again before it is kept (service/reencode.py)
RUN pip install --no-cache-dir paho-mqtt==2.1.0 segno==1.6.6 pillow==11.0.0 tzdata==2024.2

# Built-in MQTT broker (stage 3, service/broker.py): Debian's Mosquitto, started by run_all.py when MQTT_HOST is empty.
# Camera video (stage 3): go2rtc 1.9.14 (same version as dashboard/.../go2rtc-video-rtc.js), checked against the
# release asset's SHA-256; ffmpeg turns H.264 frames into the snapshot JPEGs (/api/frame.jpeg).
ARG GO2RTC_VERSION=1.9.14
ARG GO2RTC_SHA256=32d616af226bd731678ffde328b94cfb94e30339bfefc469cfb76323144615a6
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg mosquitto ca-certificates curl \
 && curl -fsSL -o /usr/local/bin/go2rtc "https://github.com/AlexxIT/go2rtc/releases/download/v${GO2RTC_VERSION}/go2rtc_linux_amd64" \
 && echo "${GO2RTC_SHA256}  /usr/local/bin/go2rtc" | sha256sum -c - \
 && chmod 755 /usr/local/bin/go2rtc \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Runs as uid 99 / gid 100 = Unraid's nobody:users, so files in /mnt/user/appdata/skypane get the usual owner.
RUN useradd --uid 99 --gid 100 --no-create-home --home-dir /app --shell /usr/sbin/nologin panel \
 && mkdir -p /data/house /data/panels /data/backups /data/private /data/mosquitto \
 && chown -R 99:100 /data

WORKDIR /app
COPY service/ service/
COPY scripts/hubitat_bridge.py scripts/protect_to_go2rtc.py scripts/
COPY dashboard/ dashboard/
# the Unraid template rides along, so Unraid can copy it out (docs/install-unraid.md, step 1)
COPY unraid/skypane.xml unraid/skypane.xml
# (v3.0.0) the Hubitat driver: the hub imports it from http://<this server>/hubitat/SkypaneNotifier.groovy
COPY hubitat/SkypaneNotifier.groovy hubitat/SkypaneNotifier.groovy
# empty house-data placeholders (the real ones are served from /data/house when present)
COPY docker/placeholders/hubitat-data.js docker/placeholders/protect-cameras.js dashboard/layouts/v4/shared/

ARG VERSION=dev
ENV VERSION=${VERSION}
LABEL org.opencontainers.image.version="${VERSION}"

USER 99:100
VOLUME /data
# 8088 = default. On Unraid (br0, own IP) the template sets PORT=80 so the panel is just http://<ip>/ — a non-root
# process may bind 80 there because the template passes --sysctl net.ipv4.ip_unprivileged_port_start=0
# (Docker 20.10+ already sets that by default for containers with their own network namespace).
# 1984 = camera video for the panels (service/go2rtc_guard.py in front of the built-in go2rtc), 8555 = WebRTC (TCP+UDP)
# 1883 = MQTT for LAN devices (built-in broker, login), 9001 = MQTT WebSocket for the pages (login)
EXPOSE 8088 80 1984 8555 8555/udp 1883 9001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % (os.environ.get('PORT') or '8088'), timeout=4)"]

STOPSIGNAL SIGTERM
CMD ["python", "-u", "service/run_all.py"]
