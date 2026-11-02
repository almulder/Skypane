// Icon motions for device cards (release 2): the icon moves while the device is on — a fan turns, a washer shakes, a
// kettle steams, a lock twists, a motion sensor sends out sonar rings. The idea of a "Mushroom-style icon with a motion
// per device" comes from Anashost's HA-Animated-cards (https://github.com/Anashost/HA-Animated-cards, CC BY-NC-SA 4.0);
// nothing of it is copied — these motions, their names and their CSS (theme.css ".mo-…") are our own, and they move
// with transform / opacity only (the cheap kind for the panel: animated shadows and blurs, which that repo uses a lot,
// made the panel stutter).
// Each icon sits in a round chip in its motion's colour (Anashost's look, our own code): grey and still while off; while
// on the chip fills with its colour, a soft glow breathes around it (a fading layer — no animated shadows) and the
// icon moves inside it.
// Card option "motion": "auto" (picked from the icon, then the device's kind) or one of MOTIONS; nothing = still.
// "runW": a plug-in appliance counts as running only above that many watts (a "dumb" washer on a smart plug).
(function () {
  const MOTIONS = [["spin", "Spin (fan)"], ["rock", "Rock (oscillating fan)"], ["twist", "Twist (lock)"], ["swing", "Swing (door)"],
    ["sonar", "Sonar rings (motion, presence)"], ["rumble", "Rumble (fridge, freezer)"], ["hop", "Hop (sprinkler)"], ["steam", "Steam (kettle, coffee)"],
    ["shake", "Shake (washer)"], ["tumble", "Tumble (dryer)"], ["glow", "Glow (lamp)"], ["flicker", "Flicker (fire)"], ["heat", "Heat shimmer (heater)"],
    ["drip", "Drip (water, leak)"], ["ring", "Ring (bell)"], ["waves", "Sound waves (speaker, TV)"], ["slide", "Slide (shade, curtain)"],
    ["lift", "Lift (garage)"], ["charge", "Charge (battery, EV)"], ["breathe", "Breathe (purifier, humidifier)"], ["roam", "Roam (robot vacuum)"],
    ["blink", "Blink (alarm, siren)"]];
  const KEYS = new Set(MOTIONS.map(([k]) => k));
  // the automatic choice: from the icon first (it says what the thing is), then from the device's kind
  const BY_ICON = {
    fan: "spin", washer: "shake", dishwasher: "rumble", dryer: "tumble", fridge: "rumble", freezer: "rumble", kettle: "steam", coffee: "steam",
    toaster: "heat", airFryer: "heat", oven: "heat", microwave: "rumble", iron: "steam", waterHeater: "heat", radiator: "heat", heater: "heat",
    fire: "flicker", ac: "spin", heatPump: "spin", humidifier: "breathe", dehumidifier: "breathe", airPurifier: "breathe",
    lock: "twist", unlock: "twist", door: "swing", doorOpen: "swing", contact: "swing", window: "swing", windowOpen: "swing",
    motion: "sonar", presence: "sonar", user: "sonar", users: "sonar", bell: "ring", doorbell: "ring", alarmClock: "ring",
    speaker: "waves", soundbar: "waves", music: "waves", tv: "waves", volume: "waves", sprinkler: "hop", drop: "drip", leak: "drip", valve: "drip",
    shade: "slide", blinds: "slide", curtains: "slide", garage: "lift", garageOpen: "lift", gate: "lift", car: "lift",
    evCharger: "charge", batteryCharging: "charge", batteryFull: "charge", bolt: "charge", solar: "glow",
    vacuum: "roam", mop: "roam", siren: "blink", shieldAlert: "blink", smoke: "blink", carbonMonoxide: "blink", ledStrip: "glow",
    bulb: "glow", lamp: "glow", floorLamp: "glow", deskLamp: "glow", pendant: "glow", chandelier: "glow", ceilingLight: "glow", wallLight: "glow", spotlight: "glow",
    printer3d: "roam", printer: "shake",
  };
  const BY_KIND = { light: "glow", fan: "spin", shade: "slide", valve: "drip", garage: "lift" };
  const pick = (motion, iconName, kind) => (motion === "auto" ? BY_ICON[iconName] || BY_KIND[kind] || "" : KEYS.has(motion) ? motion : "");
  // the extra pieces some motions draw around the icon (rings, wisps, drops, waves, a halo)
  const EXTRA = { sonar: "<i></i><i></i>", steam: "<i></i><i></i><i></i>", heat: "<i></i><i></i><i></i>", drip: "<i></i>", waves: "<i></i><i></i>", glow: "<i></i>" };   // i18n-ok (CSS / a unit, not words)
  // each motion's chip colour while it runs (a round chip behind the icon, as in Anashost's cards — our own colours)
  const COLOR = { spin: "#38bdf8", rock: "#38bdf8", twist: "#f59e0b", swing: "#f59e0b", sonar: "#60a5fa", rumble: "#22d3ee", hop: "#3b82f6",
    steam: "#f0a35e", shake: "#818cf8", tumble: "#818cf8", glow: "#fbbf24", flicker: "#f97316", heat: "#fb7140", drip: "#3b82f6", ring: "#facc15",
    waves: "#e879f9", slide: "#2dd4bf", lift: "#f59e0b", charge: "#4ade80", breathe: "#67e8f9", roam: "#a78bfa", blink: "#ef4444" };
  // the icon's html in its round chip (size = the icon's px: the chip is 1.7 ×); it glows and moves only while `run`
  const wrap = (iconHtml, motion, run, size = 24) => (motion
    ? `<span class="mo mo-${motion}${run ? " run" : ""}" style="--c:${COLOR[motion] || "#a78bfa"};width:${Math.round(size * 1.7)}px;height:${Math.round(size * 1.7)}px">`
      + `${EXTRA[motion] || ""}<span class="mo-i">${iconHtml}</span></span>`
    : iconHtml);
  window.Motion = { MOTIONS, pick, wrap, keys: KEYS, byIcon: BY_ICON };
})();
