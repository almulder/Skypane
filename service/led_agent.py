"""(v3.0.5) The LED agent (tools/panel-agent) as Skypane serves it: the Manager's download (Help & guides → Download
the LED agent) and the agent's self-update (tools/panel-agent/update.go).

Files (AGENT_DIR, default agent/ next to the code — /app/agent in the image; for a local run tools/panel-agent is
looked at too):
  panel-agent.arm64       the agent (linux/arm64), built from tools/panel-agent:
                            cd tools/panel-agent && CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath
                            -ldflags="-s -w -buildid=" -o ../../agent/panel-agent.arm64 .
                          (".arm64": the release scan reads files without a suffix as text) — "panel-agent" in the zip
  VERSION                 its agentVersion (else read from tools/panel-agent/main.go)
  install-agent.sh, start-agent.sh                     with root
  install-agent-noroot.sh, start-agent-noroot.sh       without root (adb's shell user, port 8852)
  panel-agent-boot.apk    the boot app (root only; optional — not shipped yet: it is put in the zip only when an
                          agent/panel-agent-boot.apk is there; (v3.0.5) no other place is looked at)
Self-update: GET /api/agent/update → manifest() {"v": 1, "version", "sha256", "size", "sig"}; GET /api/agent/binary →
the build. Both only with a panel's agent token (Authorization: Bearer; panel_devices.Devices.agent_panel) — the same
token the panel page hands the agent; the agent asks only the server whose page first configured it.
(v3.0.5) "sig": HMAC-SHA256 of update_text(version, size, sha256) under that panel's agent key (panel_devices
agent_key — made with its token, handed to the agent once with it, trust on first use; no long-lived signing key
exists). The agent checks it before it downloads, writes or runs anything (tools/panel-agent/update.go). hello_text: what
the agent's /hello signs (the panel page checks it before it hands the agent the MQTT login or the token).
"""
import hashlib
import hmac
import io
import os
import pathlib
import re
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "panel-agent"
VERSION_RE = re.compile(r"\d{1,4}(?:\.\d{1,4}){0,3}")
_IN_GO = re.compile(r'^const agentVersion = "(\d{1,4}(?:\.\d{1,4}){0,3})"', re.M)
SCRIPTS = ("install-agent.sh", "start-agent.sh", "install-agent-noroot.sh", "start-agent-noroot.sh")
ZIP_NAME = "skypane-led-agent.zip"
UPDATE_TAG = "skypane-agent-update-v1"   # (v3.0.5) as update.go updateTag
HELLO_TAG = "skypane-agent-hello-v1"     # (v3.0.5) as api.go helloTag
_cache = {}


def update_text(version, size, sha):
    """(v3.0.5) The text an update offer's signature covers (update.go updateText)."""
    return f"{UPDATE_TAG}\n{version}\n{int(size)}\n{sha}"


def hello_text(nonce):
    """(v3.0.5) The text the agent's /hello signs (api.go helloText)."""
    return f"{HELLO_TAG}\n{nonce}"


def mac(key, text):
    """(v3.0.5) HMAC-SHA256 of text under key, lowercase hex."""
    return hmac.new(key.encode("utf-8"), text.encode("utf-8"), hashlib.sha256).hexdigest()


def agent_dir():
    d = os.environ.get("AGENT_DIR")
    return pathlib.Path(d) if d else ROOT / "agent"


def _first(*paths):
    for p in paths:
        if p.is_file():
            return p
    return None


def files(base=None):
    """{name in the zip: path} of what is there (the agent and the scripts are needed, the boot app is optional)."""
    base = pathlib.Path(base) if base else agent_dir()
    out = {}
    b = _first(base / "panel-agent.arm64", base / "panel-agent", SRC / "panel-agent")
    if b:
        out["panel-agent"] = b
    for s in SCRIPTS:
        p = _first(base / s, SRC / s)
        if p:
            out[s] = p
    apk = _first(base / "panel-agent-boot.apk")   # (v3.0.5: only here — tools/ never ships)
    if apk:
        out["panel-agent-boot.apk"] = apk
    return out


def version(base=None):
    """The agent version Skypane serves — None when it can't tell."""
    base = pathlib.Path(base) if base else agent_dir()
    try:
        v = (base / "VERSION").read_text(encoding="utf-8").strip()
        if VERSION_RE.fullmatch(v):
            return v
    except OSError:
        pass
    try:
        m = _IN_GO.search((SRC / "main.go").read_text(encoding="utf-8"))
        return m[1] if m else None
    except OSError:
        return None


def binary(base=None):
    """(path, sha256, size) of the agent build — None when there is none. Hashed again only when the file changed."""
    p = files(base).get("panel-agent")
    if not p:
        return None
    try:
        st = p.stat()
        sig = (str(p), st.st_mtime_ns, st.st_size)
        if _cache.get("sig") != sig:
            h = hashlib.sha256()
            with p.open("rb") as f:
                for chunk in iter(lambda: f.read(1 << 20), b""):
                    h.update(chunk)
            _cache.update(sig=sig, sha=h.hexdigest())
        return p, _cache["sha"], st.st_size
    except OSError:
        return None


def manifest(base=None, key=None):
    """What the agent's update check gets — None when no build (or no version) is there. (v3.0.5) Signed with the
    asking agent's key ("sig"); without a key no "sig" (that agent updates nothing until it has one)."""
    b, v = binary(base), version(base)
    if not b or not v:
        return None
    out = {"v": 1, "version": v, "sha256": b[1], "size": b[2]}
    if isinstance(key, str) and key:
        out["sig"] = mac(key, update_text(v, b[2], b[1]))
    return out


README = """Skypane LED agent {version}

The step-by-step guide: http://<your Skypane>/guides/led-agent.html (also in the Manager: Help & guides -> LED agent).

With root:     adb push panel-agent start-agent.sh install-agent.sh /data/local/tmp/
               adb shell su 0 sh /data/local/tmp/install-agent.sh
               After a reboot: adb shell su 0 sh /data/adb/panel-agent/start-agent.sh
               (Optional: the Panel Agent Boot app starts it after a reboot by itself. It isn't shipped yet;
               when this zip has panel-agent-boot.apk: adb install panel-agent-boot.apk)
Without root:  adb push panel-agent start-agent-noroot.sh install-agent-noroot.sh /data/local/tmp/
               adb shell sh /data/local/tmp/install-agent-noroot.sh
               then switch on "LED agent without root" for the panel (Manager -> Panels -> Setup -> General).
               After a reboot: adb shell sh /data/local/tmp/skypane-agent/start-agent-noroot.sh

Once installed, the agent updates itself from this Skypane (each update signed with its own key).
Network debugging (adb over the network) left on lets anyone on your network control the tablet: use USB, or
switch network debugging off as soon as you're done (the guide says how).
"""


def zip_bytes(base=None):
    """The download: the files above plus README.txt, in a skypane-led-agent/ folder. None without the agent itself."""
    fs = files(base)
    if "panel-agent" not in fs:
        return None
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        def put(name, data, mode):
            zi = zipfile.ZipInfo("skypane-led-agent/" + name, date_time=(2026, 1, 1, 0, 0, 0))
            zi.external_attr = (0o100000 | mode) << 16
            zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, data)
        put("README.txt", README.format(version=version(base) or "").replace("\n", "\r\n").encode("utf-8"), 0o644)
        for name, p in sorted(fs.items()):
            data = p.read_bytes()
            if name.endswith(".sh"):
                data = data.replace(b"\r\n", b"\n")   # (a checkout with Windows line ends would break sh on the tablet)
            put(name, data, 0o755 if name == "panel-agent" or name.endswith(".sh") else 0o644)
    return buf.getvalue()
