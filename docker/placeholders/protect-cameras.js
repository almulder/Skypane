// Placeholder shipped in the Docker image: no cameras (house data is never in the image).
// The dashboard service serves the real file from DATA_DIR/house/protect-cameras.js when it exists.
if (window.HUBITAT) HUBITAT.cameras = [];
window.PROTECT_LIVEVIEWS = [];
