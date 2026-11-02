# Credits

Skypane is built on the work of these people and projects. Thank you!

## Pictures and drawings
- **Line icons** (rooms, devices, status): drawn for this project.
- **Animated appliance drawings** (washer, dryer, dishwasher, range, fridge, microwave, fans, air purifier, garage):
  drawn for this project, with help from two MIT-licensed Home Assistant cards:
  - [wm_animated_ha_card](https://github.com/sionetta/wm_animated_ha_card) by **sionetta** (MIT, © 2026 sionetta):
    the dishwasher rack and dish line art, and the drum + progress-ring layout of the washer and dryer.
  - [ha-appliance-card](https://github.com/ADNPolymerase/ha-appliance-card) by **ADNPolymerase** (MIT, © 2026
    ADNPolymerase): the "animate only while running" pattern and ideas for each appliance's motion; and
    these drawings in `art-extra.js`, redrawn as SVG from his: kettle, multicooker, rice cooker, toaster, iron,
    hair dryer, pet feeder, pet fountain, dehumidifier, space heater, monitor, router, bathroom scale, security camera,
    aroma diffuser, mailbox.
  - [ha-appliance-electromenager-cards](https://github.com/skyrotter/ha-appliance-electromenager-cards) by
    **skyrotter** (MIT, Copyright (c) 2026 Nicolas): the extra drawings in `dashboard/layouts/v4/shared/art-extra.js`
    (freezers, coffee makers, air fryer, robot vacuum, water heater, AC, heat pump, solar, home battery, EV charger,
    pool and sump pumps, lamps, TV, range hood, wine cooler, garage door, sliding gate; and also: AV
    receiver, beer tap, desktop PC, laptop, cooktop, pellet stove, 3D printer, radiator, server rack, tool battery
    charger, towel warmer, ventilation fan; boom barrier, swing gate, aquarium, diesel heater, gas boiler, hot tub,
    more lights (colour and filament bulbs, pendant cluster, chandelier, garden spotlight, Christmas tree), power meter,
    pellet boiler, pool robot, water and industrial pumps, robot mower, sauna, shutters and blinds, underfloor heating,
    UPS, ground-source heat pump), re-coloured and with the
    animation reworked to transform/opacity only.
  - Their licences: `dashboard/vendor/anim/*/LICENSE`.
- **Icon motions** on device cards (a fan turns, a washer shakes, a kettle steams, sonar rings for motion…) and
  "running above N watts" for appliances on smart plugs: the idea comes from
  [HA-Animated-cards](https://github.com/Anashost/HA-Animated-cards) by **Anashost** — thank you! That repo is
  CC BY-NC-SA 4.0, so nothing was copied from it: our motions, their names and their CSS
  (`dashboard/layouts/v4/shared/motions.js`, theme.css `.mo-…`) are written from scratch, and move with
  transform / opacity only.
- **Weather icons** and the animated sky: drawn for this project.

## Code and programs
- [go2rtc](https://github.com/AlexxIT/go2rtc) by **AlexxIT** (MIT): camera video in the browser; its `video-rtc.js`
  player is in `dashboard/layouts/v4/shared/go2rtc-video-rtc.js` (licence: `dashboard/vendor/licenses/go2rtc-LICENSE.txt`).
- [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT, © MQTT.js contributors): the pages' live connection,
  `dashboard/vendor/mqtt.min.js` (licence: `dashboard/vendor/licenses/MQTT.js-LICENSE.md`).
- [gridstack.js](https://github.com/gridstack/gridstack.js) by **Alain Dumesny** and contributors (MIT): the layout
  builder's drag-and-resize grid, `dashboard/vendor/gridstack/` (with its `LICENSE`).
- [QR Code Generator](https://github.com/kazuhikoarase/qrcode-generator) by **Kazuhiko Arase** (MIT): the guest
  Wi-Fi QR code on the panels. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
- [segno](https://github.com/heuer/segno) (BSD) and [paho-mqtt](https://github.com/eclipse/paho.mqtt.python)
  (EPL 2.0 / EDL 1.0): used by the service.
- [Pillow](https://python-pillow.org/) (HPND / MIT-CMU): every uploaded picture is drawn again before it's kept.
- [tzdata](https://github.com/python/tzdata) (Apache 2.0; the IANA time zone data itself is public domain): time zones.
- [Python](https://www.python.org/) (Python Software Foundation License): the service runs on it (the image's
  `python:3.12-slim` base).
- [Eclipse Mosquitto](https://mosquitto.org/) (EPL 2.0 / EDL 1.0): the built-in MQTT broker.
- [FFmpeg](https://ffmpeg.org/) (LGPL / GPL): used by go2rtc for camera snapshots.

## Data
- Weather by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).

## Fonts
- Inter, Lexend, Montserrat, Nunito, Orbitron, Playfair Display, Poppins, Quicksand, Rajdhani, Righteous and Bebas
  Neue, from [Google Fonts](https://fonts.google.com/) (SIL Open Font License 1.1; the licence and each font's
  copyright: `dashboard/vendor/fonts/OFL.txt`).
