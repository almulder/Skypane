// Placeholder shipped in the Docker image (house data is never in the image).
// The dashboard service serves the real file from DATA_DIR/house/hubitat-data.js when it exists.
// (the empty lists / nulls matter: without them the page would fall back to the pre-stage-3 example house)
window.HUBITAT = {rooms: [], presence: [], cameras: [], sensors: [], things: [], roomOf: {},
  locks: [], windows: [], doors: [], thermostat: null, outside: null};
