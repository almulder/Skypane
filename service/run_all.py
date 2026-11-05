"""Supervisor for the Docker image: runs the dashboard server and the Hubitat <-> MQTT bridge as child processes.

  - server: `python -m service.server` (always). Its environment has no HUBITAT_TOKEN / PROTECT_API_KEY (it never
    needs them); it keeps MQTT_USER / MQTT_PASSWORD because it publishes change notifications with that login.
  - bridge: `scripts/hubitat_bridge.py` — only when HUBITAT_HOST, HUBITAT_APP_ID and HUBITAT_TOKEN are set AND
    MQTT_HOST is set (no broker = nothing to bridge to). Its environment has no PROTECT_API_KEY.
    Allowlist = every device the house model shows (minus the main panel's "never switch" list) + BRIDGE_ALLOW
    (comma list of extra ids). An old DATA_DIR/house/bridge-allow.txt is ignored (logged).
    MQTT broker = MQTT_HOST / MQTT_PORT (MQTT_USER / MQTT_PASSWORD are read by the bridge from the environment).
  - cameras: `service/protect_sync.py` — when PROTECT_API_KEY is set or the built-in go2rtc runs: the live camera list
    (house/protect-cameras.js: Protect's + your own, service/own_cameras.py) and the built-in go2rtc's config
    (private/go2rtc.yaml). Its environment has no HUBITAT_TOKEN / MQTT passwords.
  - go2rtc: the image's go2rtc (camera video; API on 127.0.0.1:1985, WebRTC on 8555) — when GO2RTC_URL is empty
    (with or without Protect). It starts once private/go2rtc.yaml exists, gets no environment secrets, and is restarted
    when that changes. go2rtc-guard (service/go2rtc_guard.py) is the panels' way in on port 1984.
  - broker: the image's Mosquitto (service/broker.py) — only when MQTT_HOST is empty or "builtin". Internal port 1884
    (bridge + server, no login), 1883 (LAN devices, login "devices"), 9001 (pages, WebSocket, login "panel").
  - guestwifi: `service/guest_wifi.py` — only when UNIFI_API_KEY and UNIFI_HOST are set: the guest network's QR code
    and its new password after guests (the only child with UNIFI_API_KEY).
  - A child that exits is restarted with backoff (1 s, 2 s, 4 s … 60 s; reset after it ran 60 s).
  - SIGTERM / SIGINT (docker stop) is passed on to the children; they get 8 s before they are killed.
  - Every child output line goes to stdout with a "[server]" / "[bridge]" prefix. Secret settings (tokens, API keys,
    passwords) are never logged, other settings only by name; the start-up "settings:" line shows the values of
    ALLOWED_HOSTS / BRIDGE_ALLOW (host names and device numbers, not secrets) with where each comes from.

Usage (in the container this is the CMD):  python -u service/run_all.py
"""
import os
import pathlib
import re
import signal
import subprocess
import sys
import threading
import time

APP = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = pathlib.Path(os.environ.get("DATA_DIR") or APP / "data")
STOP = threading.Event()
OUT_LOCK = threading.Lock()
# camera stream URLs carry Protect access tokens: never in the log, whichever child prints one
STREAM_URL = re.compile(r"\b(rtsps?|rtspx|srtp)://\S+", re.I)


def file_sig(path):
    try:
        st = path.stat()
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None


def say(prefix, line):
    with OUT_LOCK:
        try:  # a logging hiccup must never stop the pump thread (a full pipe would block the child)
            sys.stdout.write(f"[{prefix}] {line}\n")
            sys.stdout.flush()
        except Exception:
            pass


class Child:
    def __init__(self, name, argv, stop_signal=signal.SIGTERM, drop_env=(), env=None, wait_for=None, config_exit=False):
        self.name, self.argv, self.stop_signal = name, argv, stop_signal
        self.config_exit = config_exit   # exit code 2 = a setting is wrong / missing: not restarted (it would only repeat)
        self.env = dict(env) if env is not None else {k: v for k, v in os.environ.items() if k not in drop_env}
        self.env["PYTHONIOENCODING"] = "utf-8"
        if len(argv) > 1 and argv[1] == "-I" and "utf8" not in argv[:4]:
            # (v3.0.2: -I ignores PYTHONIOENCODING — on Windows a child printing "→" crashed with cp1252 and was
            # restarted in a loop; -X utf8 is an option, not the environment, so it holds under -I too)
            self.argv = [argv[0], "-I", "-X", "utf8", *argv[2:]]
        self.wait_for = wait_for  # a file that must exist before the child starts (go2rtc: its config)
        self.restarting = False   # set by restart(): the next exit is planned, no backoff
        self.started_with = None  # wait_for's state (mtime, size) when the child last started
        self.proc = None

    def restart(self):
        if self.proc and self.proc.poll() is None:
            self.restarting = True
            self.terminate()

    def _pump(self, proc):
        for raw in proc.stdout:
            say(self.name, STREAM_URL.sub(r"\1://(hidden)", raw.decode("utf-8", errors="replace").rstrip("\r\n")))

    def loop(self):
        backoff = 1
        waiting_said = False
        while not STOP.is_set():
            if self.wait_for and not self.wait_for.is_file():
                if not waiting_said:
                    say("run_all", f"{self.name} waits for {self.wait_for.name} (written once the camera list came from Protect)")
                    waiting_said = True
                STOP.wait(2)
                continue
            started = time.monotonic()
            if self.wait_for:
                self.started_with = file_sig(self.wait_for)
            try:
                self.proc = subprocess.Popen(self.argv, cwd=APP, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                             stdin=subprocess.DEVNULL, env=self.env)
            except OSError as e:
                say("run_all", f"{self.name}: could not start ({type(e).__name__})")
                code = None
            else:
                say("run_all", f"{self.name} started (pid {self.proc.pid})")
                pump = threading.Thread(target=self._pump, args=(self.proc,), daemon=True)
                pump.start()
                code = self.proc.wait()
                pump.join(2)
            if STOP.is_set():
                break
            if self.restarting:
                self.restarting = False
                say("run_all", f"{self.name} restarted (new configuration)")
                continue
            if code == 2 and self.config_exit:
                say("run_all", f"{self.name} stopped: a setting is wrong or missing (see above) — fix it on the Manager page (Integrations), "
                               "it starts again when you save there")
                break
            if time.monotonic() - started > 60:
                backoff = 1
            say("run_all", f"{self.name} exited (code {code}) — restarting in {backoff} s")
            STOP.wait(backoff)
            backoff = min(backoff * 2, 60)

    def terminate(self):
        p = self.proc
        if p and p.poll() is None:
            try:
                p.send_signal(self.stop_signal)
            except OSError:
                pass

    def kill(self):
        p = self.proc
        if p and p.poll() is None:
            try:
                p.kill()
            except OSError:
                pass


RESTART = threading.Event()   # the house settings changed (Manager page): stop everything, start again
ORIG_ENV = dict(os.environ)   # the container's own environment: a restart starts from it, not from this run's changes


def hidden_value(house_settings, key, env_val, saved):
    """(v3.0.3) ALLOWED_HOSTS / BRIDGE_ALLOW are off the Manager page: the container variable sets them. Returns (the
    value in effect, "" = none; where it comes from). A non-empty container value wins over one saved in settings.json
    before 3.0.3 (checked like a save — an invalid one counts as not set); "none" = empty (clears an old saved value
    without editing files); no container value = the old saved value keeps working."""
    env_val = (env_val or "").strip()
    if env_val.lower() == "none":
        return "", 'container variable "none"' + (" — the value saved before 3.0.3 is not used" if saved else "")
    if env_val:
        try:
            return house_settings.check(key, env_val), "container variable"
        except house_settings.Invalid:
            if saved:
                return saved, "saved before 3.0.3 — the container variable isn't a valid value, ignored"
            return "", "the container variable isn't a valid value — ignored"
    if saved:
        return saved, "saved before 3.0.3; set it as a container variable to change it"
    return "", "no container variable"


def apply_settings():
    """Stage 4: the house's settings live in DATA_DIR/private/settings.json (Manager page). The first start copies the
    template's values into it once; from then on the file decides — a template value is ignored (a setting cleared in
    the Manager must not come back from the template). Returns the file's signature (to notice a change)."""
    import house_settings   # service/house_settings.py (this script runs from the service folder)
    for k in ("MQTT_BUILTIN", "GO2RTC_BUILTIN", "GUEST_WIFI"):   # set by the last run (a restart starts clean)
        os.environ.pop(k, None)
    hs = house_settings.HouseSettings(DATA_DIR / "private")
    try:
        copied, bad = hs.import_env(os.environ)
        if bad:
            say("run_all", f"settings: NOT copied from the container's settings (not a valid value): {', '.join(bad)} — enter them "
                           "on the Manager page")
        if copied:
            say("run_all", f"settings: copied {len(copied)} values from the container's settings into the Manager "
                           f"({', '.join(copied)}) — from now on the Manager page decides (Integrations)")
    except OSError as e:
        say("run_all", f"settings: could not write private/settings.json ({type(e).__name__}) — using the container's settings")
        return file_sig(hs.path)
    values = hs.load()
    leftover = [k for k in house_settings.FIELDS if (os.environ.get(k) or "").strip() and k not in values
                and k != "TZ" and k not in house_settings.HIDDEN
                and (os.environ.get(k) or "").strip() != house_settings.IMAGE_DEFAULTS.get(k)]   # (the image's own ENV: no template)
    where = []
    for k in house_settings.FIELDS:
        if k in house_settings.HIDDEN:
            val, src = hidden_value(house_settings, k, os.environ.get(k), values.get(k))
            if val:
                os.environ[k] = val
            else:
                os.environ.pop(k, None)
            where.append(f"{k} {val} ({src})" if val else f"{k} not set ({src})")
        elif values.get(k):
            os.environ[k] = values[k]
        elif k != "TZ":   # (no time zone set: the image's default stays)
            os.environ.pop(k, None)
    # (host names / device numbers only — never a secret)
    say("run_all", "settings: " + "; ".join(where))
    if leftover:
        say("run_all", f"settings: the container's settings still have {', '.join(leftover)} — ignored (the Manager page has "
                       "the settings: Integrations); you can remove them from the container's settings")
    try:
        time.tzset()
    except AttributeError:   # (Windows)
        pass
    return file_sig(hs.path)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    py = sys.executable
    os.environ["SKYPANE_SUPERVISED"] = "1"   # (v3.0.0) the server knows a settings save restarts it (the Manager waits)
    settings_sig = apply_settings()
    # MQTT broker (stage 3): MQTT_HOST empty (or "builtin") = the image's own Mosquitto (service/broker.py). The bridge
    # and the server then use its internal port; the pages get its WebSocket login; LAN devices its "devices" login.
    broker_child, observer, builtin_failed = None, None, False
    mosquitto = pathlib.Path(os.environ.get("MOSQUITTO_BIN") or "/usr/sbin/mosquitto")
    if (os.environ.get("MQTT_HOST") or "").strip().lower() in ("", "builtin"):
        if mosquitto.is_file():
            import broker  # service/broker.py (this script runs from the service folder)
            try:
                conf, lg = broker.prepare(DATA_DIR / "private", DATA_DIR, os.environ.get("MOSQUITTO_PASSWD_BIN") or "/usr/bin/mosquitto_passwd",
                                          note=lambda m: say("run_all", m))
            except Exception as e:  # never log details (could hold a path with a password file's content)
                say("run_all", f"built-in MQTT broker could not be prepared ({type(e).__name__}) — no MQTT until the "
                               "container restarts. Check that the Skypane data folder (and its private/ folder) belongs to "
                               "99:100 (nobody:users) and is writable")
                os.environ["MQTT_HOST"] = ""
                builtin_failed = True
            else:
                for k in ("MQTT_USER", "MQTT_PASSWORD", "MQTT_WS_URL", "MQTT_WS_PORT"):
                    os.environ.pop(k, None)   # the template's old broker settings don't apply to the built-in one
                # bridge + server: the internal login (the cameras child drops MQTT_PASSWORD, go2rtc gets no env at all)
                os.environ.update(MQTT_USER=lg["internal"]["user"], MQTT_PASSWORD=lg["internal"]["pass"])
                os.environ.update(MQTT_HOST="127.0.0.1", MQTT_PORT=str(broker.INTERNAL_PORT), MQTT_BUILTIN="1",
                                  MQTT_WS_USER=lg["ws"]["user"], MQTT_WS_PASSWORD=lg["ws"]["pass"])
                observer = lg["observer"]   # the guest Wi-Fi child's read-only login (below)
                # (SYSTEMROOT: only on Windows — the laptop test — whose networking needs it)
                broker_child = Child("broker", [str(mosquitto), "-c", str(conf)],
                                     env={k: os.environ[k] for k in ("PATH", "TZ", "SYSTEMROOT") if k in os.environ} | {"HOME": "/tmp"})
                say("run_all", f"built-in MQTT broker: devices on port {broker.LAN_PORT} (login: Manager → Integrations → Message broker → Login for devices), "
                               f"pages on {broker.WS_PORT}")
        else:
            say("run_all", f"MQTT_HOST is empty and there is no Mosquitto at {mosquitto} — no MQTT")
            os.environ["MQTT_HOST"] = ""   # ("builtin" is not a host name)
            builtin_failed = True
    # cameras (stage 3): with a Protect API key the camera list is live (service/protect_sync.py); with GO2RTC_URL empty
    # the image's own go2rtc serves the video, its stream list written by the camera sync
    protect = bool((os.environ.get("PROTECT_API_KEY") or "").strip())
    go2rtc_bin = pathlib.Path(os.environ.get("GO2RTC_BIN") or "/usr/local/bin/go2rtc")
    # (also without Protect: cameras of your own, added on the Manager page, play through it — service/own_cameras.py)
    builtin = not (os.environ.get("GO2RTC_URL") or "").strip() and go2rtc_bin.is_file()
    if builtin:
        os.environ["GO2RTC_BUILTIN"] = "1"  # the server tells the pages: video from this container, port 1984
    # guest Wi-Fi (stage 3): with a UniFi API key + the console's address, service/guest_wifi.py keeps the guest network's
    # QR code and changes its password after guests (only that child gets UNIFI_API_KEY)
    guest = bool((os.environ.get("UNIFI_API_KEY") or "").strip() and (os.environ.get("UNIFI_HOST") or "").strip())
    if guest:
        os.environ["GUEST_WIFI"] = "1"   # the server: serve its status / QR code, the pages: show it
    # the server only needs the MQTT login (it publishes settings-changed messages); never the other secrets
    children = [Child("server", [py, "-u", "-m", "service.server"], drop_env=("HUBITAT_TOKEN", "PROTECT_API_KEY", "UNIFI_API_KEY"))]
    if broker_child:
        children.insert(0, broker_child)

    go2rtc_cfg = DATA_DIR / "private" / "go2rtc.yaml"
    if protect or builtin:
        children.append(Child("cameras", [py, "-I", "-u", str(APP / "service" / "protect_sync.py"),
                                          "--house-dir", str(DATA_DIR / "house"), "--private-dir", str(DATA_DIR / "private")],
                              drop_env=("HUBITAT_TOKEN", "MQTT_PASSWORD", "MQTT_WS_PASSWORD", "UNIFI_API_KEY"), config_exit=True))
    if not protect:
        say("run_all", "no Protect API key (Manager page → Integrations) — only cameras of your own (Manager page → Cameras)")

    if builtin:
        # go2rtc gets no secrets at all: its config file holds the stream URLs it needs
        go2rtc = Child("go2rtc", [str(go2rtc_bin), "-c", str(go2rtc_cfg)], wait_for=go2rtc_cfg,
                       env={k: os.environ[k] for k in ("PATH", "TZ") if k in os.environ} | {"HOME": "/tmp"})
        children.append(go2rtc)
        # the panels' door to it (port 1984): only this house's camera names, only the player's paths
        children.append(Child("go2rtc-guard", [py, "-u", "-m", "service.go2rtc_guard", "--config", str(go2rtc_cfg)],
                              env={k: os.environ[k] for k in ("PATH", "TZ", "ALLOWED_HOSTS") if k in os.environ}))

        def watch_config():  # a new / renamed / removed camera: go2rtc reads its config only at start
            while not STOP.wait(5):
                now = file_sig(go2rtc_cfg)
                if now is not None and go2rtc.started_with is not None and now != go2rtc.started_with:
                    go2rtc.started_with = now   # one restart per change
                    go2rtc.restart()
        threading.Thread(target=watch_config, name="go2rtc-config", daemon=True).start()
    elif protect and (os.environ.get("GO2RTC_URL") or "").strip():
        say("run_all", "GO2RTC_URL is set — using that go2rtc for video; leave it empty to use the built-in one")
    elif not (os.environ.get("GO2RTC_URL") or "").strip():
        say("run_all", f"go2rtc not found at {go2rtc_bin} — no built-in video")


    hubitat = all(os.environ.get(k) for k in ("HUBITAT_HOST", "HUBITAT_APP_ID", "HUBITAT_TOKEN"))
    mqtt_host = (os.environ.get("MQTT_HOST") or "").strip()
    if hubitat and not mqtt_host:
        say("run_all", "bridge not started: the built-in MQTT broker didn't start (see above)" if builtin_failed else
                       "MQTT_HOST is empty — bridge not started (it needs an MQTT broker)")
    elif hubitat:
        argv = [py, "-I", "-u", str(APP / "scripts" / "hubitat_bridge.py"),
                "--mqtt-host", mqtt_host,
                "--mqtt-port", os.environ.get("MQTT_PORT") or "1883",
                "--allow", os.environ.get("BRIDGE_ALLOW", ""),
                # the bridge builds the house model from Hubitat (rooms, devices, locks…) into house/hubitat-data.js and
                # allows every device the panels show, minus the main panel's "never switch" list (stage 3)
                "--house-dir", str(DATA_DIR / "house"),
                "--panel-file", str(DATA_DIR / "panels" / "main.json"),
                # (v3.0.2) the rule's own file since pairing removed the main panel (the panel file: until it exists)
                "--rule-file", str(DATA_DIR / "house" / "switch-rule.json")]
        allow_file = DATA_DIR / "house" / "bridge-allow.txt"
        if allow_file.is_file():  # stage 2's copied list: not used any more (it would add devices back) - delete it
            say("run_all", f"{allow_file} is not used any more (the house model decides what may be switched) - you can delete it")
        # SIGINT: the bridge treats it like Ctrl+C and publishes hubitat/bridge/status = offline before it exits
        children.append(Child("bridge", argv, stop_signal=signal.SIGINT, drop_env=("PROTECT_API_KEY", "UNIFI_API_KEY", "MQTT_WS_PASSWORD")))
    else:
        say("run_all", "Hubitat not set up (Manager page → Integrations) — bridge not started")
    if guest:
        # it only reads the bridge's device states (which guest modes are on): with the built-in broker its own
        # read-only login, never the internal one (with a separate broker: that broker's MQTT_USER / MQTT_PASSWORD)
        drop = ("HUBITAT_TOKEN", "PROTECT_API_KEY", "MQTT_WS_PASSWORD")
        genv = {k: v for k, v in os.environ.items() if k not in drop}
        if observer:
            genv.update(MQTT_USER=observer["user"], MQTT_PASSWORD=observer["pass"])
        children.append(Child("guestwifi", [py, "-I", "-u", str(APP / "service" / "guest_wifi.py"), "--data-dir", str(DATA_DIR)],
                              env=genv, config_exit=True))
    else:
        say("run_all", "guest Wi-Fi not set up (Manager page → Integrations: UniFi console address + API key)")

    def on_signal(signum, frame):
        RESTART.clear()   # (docker stop during a settings restart: stop, don't start again)
        if not STOP.is_set():
            say("run_all", f"got {signal.Signals(signum).name} — stopping")
            STOP.set()

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)

    threads = [threading.Thread(target=c.loop, name=c.name, daemon=True) for c in children]
    for t in threads:
        t.start()
    settings_file = DATA_DIR / "private" / "settings.json"
    while not STOP.wait(1):
        now = file_sig(settings_file)
        if now != settings_sig:   # saved on the Manager page: start everything again with the new settings
            say("run_all", "settings changed on the Manager page — restarting the services")
            RESTART.set()
            STOP.set()

    # the broker last: the bridge still publishes "offline" while it stops
    for c in children:
        if c is not broker_child:
            c.terminate()
    if broker_child:
        for t, c in zip(threads, children):
            if c is not broker_child:
                t.join(3)
        broker_child.terminate()
    deadline = time.monotonic() + 8
    for t in threads:
        t.join(max(0, deadline - time.monotonic()))
    for c in children:
        c.kill()
    for c in children:   # reap them (this process is PID 1: nobody else would)
        if c.proc:
            try:
                c.proc.wait(3)
            except Exception:
                pass
    if RESTART.is_set():
        # the same process (PID 1 in the container) runs again from the start — new settings, new children, and the
        # container's own environment (not this run's: e.g. the built-in broker's internal login)
        say("run_all", "starting again")
        sys.stdout.flush()
        os.execve(sys.executable, [sys.executable, "-u", str(pathlib.Path(__file__).resolve())], ORIG_ENV)
    say("run_all", "stopped")


if __name__ == "__main__":
    main()
