/**
 *  Skypane Notifier — lets Hubitat rules (Rule Machine, webCoRE, Basic Rules, HSM, Notifications, Switchboard…)
 *  put alerts on the Skypane wall panels, and hear back when someone dismisses them.
 *
 *  Version 3.0.0 (Skypane 3.0.0, the tester release): installs fresh under the namespace `skypane`; Skypane serves this
 *  file itself (http://<your Skypane>/hubitat/SkypaneNotifier.groovy). History of the earlier versions:
 *
 *  Version 1.8 (Skypane v2.3.2: level 4–5 dismissals need the panel PIN, checked by the bridge too):
 *  panelAckAll ("Dismiss all") never clears a level 4–5 alert — each needs its own panelAck (the bridge sends one only
 *  with a PIN ticket; since v2.3.2 it doesn't call panelAckAll at all). New panelDismissedAll(panel, level, count): a
 *  panel's Dismiss all is over (the bridge sent a panelAck per alert it cleared) — it clears nothing, only tells rules:
 *  `acknowledged` = "all", ackPanel, ackLevel and button 6, as before. Fixed: Dismiss all pushed button 7 (Silence)
 *  since 1.4 instead of 6. panelAck with a level LOWER than a level 4–5 alert's own is ignored (only a forged or stale
 *  message says that; the bridge sends the hub's level).
 *  Version 1.7: acknowledged in the Skypane Manager (v2.3.1, the admin): panelAck arrives with the panel
 *  "manager-<login>" — `ackPanel` says who; any level is cleared on every panel (a panel's level 1–2 Dismiss still only
 *  clears it there). The bridge sends that name only for the server's own Manager topic and refuses it from a panel.
 *  Version 1.6: showCamera / showView without Seconds send no time, so each panel uses its own "Auto-show
 *  a camera for" (Manager → Panels → Cameras); Seconds given still wins (up to 3600 = 60 min).
 *  Version 1.5: panelSilence sets only its own attributes (silencedPanel, silencedLevel, silenced) and
 *  button 7 — no longer ackPanel / ackLevel, which stay the dismissal's (a rule on "ackPanel changed" isn't fooled).
 *  Version 1.4: "Silence" on a panel (the panel's admin setting "Silence without the PIN"): the sound of a
 *  level 4–5 stopped there, the alert still up → panelSilence(id, panel, level) → `silenced` = the alert's tag,
 *  button 7 pushed. Not a dismissal: the alert stays on every panel until someone dismisses it with the PIN.
 *  Version 1.3: the owner's five levels (5 Life safety, 4 Damage, 3 Action needed, 2 Finished, 1 Reminder);
 *  default expiry when a rule gives none (or 0): levels 5–3 never, levels 2–1 60 s; a level 3 dismissed on a panel is
 *  now gone on every panel too (was 4–5 only).
 *  Version 1.2: the server's heartbeat (serverStatus online / offline, lastHeartbeat, healthAlert — offline
 *  when nothing is heard for 90 s, so a rule can tell your phone); the panels as speakers: speak() is now spoken on the
 *  panels (SpeechSynthesis; "Spoken text also shows as an alert" for the old behaviour), speakTo(), AudioVolume
 *  (setVolume, mute / unmute, volumeUp / volumeDown) and setPanelVolume().
 *  Version 1.1 (release 2): renamed Skypane Notifier (the bridge accepts both names); a button device for pistons (a dismiss on a panel = "button <level> pushed",
 *  Dismiss all = button 6), activeLevel / alertCount / lastAlertLevel, critical() / alert() / warning() / notice() /
 *  info() / dismissAll(). Version 1.0: phase 1.
 *
 *  Design: the research notes (phase 1). How it reaches the panels: this device only changes its own
 *  attributes. The Skypane bridge already listens to the hub's event socket (no login, no secret on the hub) and
 *  reads `panelCommand` (one-shot commands, with the texts) and `activeAlerts` (a compact list of the alerts that are
 *  up — ids, levels, expiry; small, because event values should stay short). After a restart the bridge calls refresh()
 *  through the Maker API: every active alert is sent again as a panelCommand (with "replay": true).
 *  A dismiss on a panel comes back through the Maker API as panelAck(id, panel, level) → `pushed` = level,
 *  `acknowledged` = the alert's tag; "Dismiss all" on a panel as panelAckAll(panel) → `pushed` = 6.
 *  (The Maker API splits "id,panel,level" into three arguments; panelAck takes either form.)
 *
 *  Install: Devices → Add device → Virtual → "Skypane Notifier" (name it e.g. "Skypane"); then tick it in the Maker API app (needed for
 *  dismiss → Hubitat). Never put codes or passwords in a notification: device events are readable on the LAN.
 *
 *  Levels (every piston and Switchboard rule means the same by a level):
 *    5 Life safety    gas, smoke, heat, CO, intrusion — full screen, alarm sound (also in quiet hours); until dismissed
 *    4 Damage         a water leak — the same as 5
 *    3 Action needed  a mouse trap, a package, doors open / unlocked at bedtime — a note with a gentle sound; until dismissed
 *    2 Finished       washer, dryer, dishwasher done — a silent note; 60 s
 *    1 Reminder       calendar events — a short tone; 60 s
 *  A panel shows one alert at a time: the highest level, the newest within a level; the others wait in its list.
 *  "Seconds" other than 0 always wins over the level's default. critical() / alert() / warning() / notice() / info()
 *  use the default.
 *
 *  Buttons (for pistons): 1–5 = an alert of that level was dismissed on a panel; 6 = "Dismiss all" on a panel;
 *  7 = a level 4–5 alert's sound was silenced on a panel (it is still up).
 *  A dismissed level 3–5 alert is gone on every panel; a level 1–2 one only on the panel it was dismissed on.
 *
 *  Server heartbeat: the Skypane server's health monitor (service/health.py) sends "<problems>,<level>,<text>" every
 *  ~30 s; the bridge passes it on through the Maker API as serverHeartbeat(n, level, text). No heartbeat for
 *  "Heartbeat timeout" seconds (90) → serverStatus "offline" (a runIn watchdog — it works with the server gone).
 *
 *  Speaker: speak() / speakTo() → panelCommand op "say" (the bridge publishes hubitat/say, the panels speak it);
 *  setVolume / mute / unmute / setPanelVolume → op "volume" (hubitat/volume). Message formats: docs/hubitat-notifier.md.
 *
 *  Plain text from any app (deviceNotification / speak) may start with:  !4 @kitchen,office #printer +600 Text…
 *  = level 4, those panels, tag "printer" (used to replace / dismiss), expires in 600 s.
 */
import groovy.json.JsonOutput
import groovy.transform.Field

metadata {
    definition(name: "Skypane Notifier", namespace: "skypane", author: "Skypane") {   // (install: Drivers Code → New Driver → Import → http://<your Skypane>/hubitat/SkypaneNotifier.groovy)
        capability "Actuator"
        capability "Notification"
        capability "SpeechSynthesis"   // speak(text, volume, voice): spoken on the panels
        capability "AudioVolume"       // volume, mute; setVolume, mute, unmute, volumeUp, volumeDown
        capability "PushableButton"
        capability "Refresh"

        attribute "lastAlert", "string"
        attribute "lastAlertLevel", "number"   // the level of the newest alert
        attribute "activeLevel", "number"      // the highest level up now; 0 = none
        attribute "alertCount", "number"       // how many alerts are up
        attribute "activeAlerts", "JSON_OBJECT" // read by the bridge: {"v":1,"ids":[[id,level,expiry]]}
        attribute "acknowledged", "string"     // the dismissed alert's tag (or id); "all" for Dismiss all
        attribute "silenced", "string"         // the tag (or id) of a level 4–5 alert whose sound was stopped on a panel
        attribute "silencedPanel", "string"    // where it was silenced
        attribute "silencedLevel", "number"    // its level
        attribute "ackPanel", "string"
        attribute "ackLevel", "number"
        attribute "ackInfo", "JSON_OBJECT"
        attribute "expired", "string"
        attribute "panelCommand", "JSON_OBJECT" // read by the bridge
        attribute "serverStatus", "enum", ["online", "offline", "unknown"]   // the Skypane server's heartbeat
        attribute "lastHeartbeat", "string"    // when the server was last heard (updated every 5 minutes, and on a change)
        attribute "healthAlert", "string"      // what the server says is wrong ("none" = all fine), or that it's offline
        attribute "healthCount", "number"      // how many problems the server has now
        attribute "healthLevel", "number"      // the worst one's level (0 none, 2 notice, 3 warning, 4 alert)

        command "notify", [[name: "Text*", type: "STRING"], [name: "Level", type: "NUMBER", description: "5 Life safety, 4 Damage, 3 Action needed, 2 Finished, 1 Reminder"],
                           [name: "Panels", type: "STRING", description: "all | main,k_office"],
                           [name: "Title", type: "STRING"], [name: "Seconds", type: "NUMBER", description: "expiry; 0 = the level's default"],
                           [name: "Tag", type: "STRING", description: "your key, e.g. printer — the same tag replaces the alert; dismiss uses it"]]
        command "critical", [[name: "Text*", type: "STRING", description: "level 5 — Life safety (gas, smoke, heat, CO, intrusion)"], [name: "Tag", type: "STRING"]]
        command "alert", [[name: "Text*", type: "STRING", description: "level 4 — Damage (a water leak)"], [name: "Tag", type: "STRING"]]
        command "warning", [[name: "Text*", type: "STRING", description: "level 3 — Action needed"], [name: "Tag", type: "STRING"]]
        command "notice", [[name: "Text*", type: "STRING", description: "level 2 — Finished (60 s)"], [name: "Tag", type: "STRING"]]
        command "info", [[name: "Text*", type: "STRING", description: "level 1 — Reminder (60 s)"]]
        command "dismiss", [[name: "Tag or id*", type: "STRING", description: "a tag, an alert id, or all"]]
        command "dismissAll"
        command "showCamera", [[name: "Camera*", type: "STRING", description: "a camera's name, or up to 4: Front Door,Garage"],
                               [name: "Panels", type: "STRING"], [name: "Seconds", type: "NUMBER"]]
        command "showView", [[name: "View*", type: "STRING", description: "a camera view's name"], [name: "Panels", type: "STRING"], [name: "Seconds", type: "NUMBER"]]
        command "speakTo", [[name: "Text*", type: "STRING"], [name: "Panels", type: "STRING", description: "all | main,k_office"],
                            [name: "Volume", type: "NUMBER", description: "0–100; empty = the panel's own"], [name: "Voice", type: "STRING"]]
        command "setPanelVolume", [[name: "Volume*", type: "NUMBER", description: "0–100"], [name: "Panels", type: "STRING", description: "all | main,k_office"]]
        // only for the Skypane service (through the Maker API) — not for rules:
        command "panelAck", [[name: "Alert id*", type: "STRING"], [name: "Panel*", type: "STRING"], [name: "Level", type: "NUMBER"]]
        command "panelAckAll", [[name: "Panel*", type: "STRING"]]
        command "panelDismissedAll", [[name: "Panel*", type: "STRING"], [name: "Level", type: "NUMBER"], [name: "Count", type: "NUMBER"]]
        command "panelSilence", [[name: "Alert id*", type: "STRING"], [name: "Panel*", type: "STRING"], [name: "Level", type: "NUMBER"]]
        command "serverHeartbeat", [[name: "Problems*", type: "NUMBER"], [name: "Level", type: "NUMBER"], [name: "Text", type: "STRING"]]
    }
    preferences {
        input "defLevel", "enum", title: "Level for plain notifications", options: ["1", "2", "3", "4", "5"], defaultValue: "2"
        input "defPanels", "string", title: "Panels for plain notifications (all, or panel names: main,k_office)", defaultValue: "all"
        input "parsePrefix", "bool", title: "Read !level @panels #tag +seconds at the start of plain text", defaultValue: true
        input "speakPanels", "string", title: "Panels that speak (empty = the same as for plain notifications)", defaultValue: ""
        input "speakShows", "bool", title: "Spoken text also shows as an alert", defaultValue: false
        input "hbTimeout", "number", title: "Heartbeat timeout: say the server is offline after this many seconds (60–3600)", defaultValue: 90
        input "txtEnable", "bool", title: "Description logging", defaultValue: true
        input "logEnable", "bool", title: "Debug logging (turns off after 30 minutes)", defaultValue: false
    }
}

// the level's own expiry when a rule gives none or 0 (seconds; 0 = until dismissed —)
private Integer defaultSeconds(Integer lvl) { [1: 60, 2: 60, 3: 0, 4: 0, 5: 0][lvl] ?: 0 }
@Field static final Integer MAX_ALERTS = 20
@Field static final Integer BUTTONS = 7          // 1–5: an alert of that level dismissed on a panel; 6: Dismiss all; 7: silenced
@Field static final Integer DISMISS_ALL = 6
@Field static final Map LEVEL_WORDS = [info: 1, notice: 2, warning: 3, alert: 4, critical: 5,
                                       reminder: 1, finished: 2, action: 3, damage: 4, safety: 5]
@Field static final Integer EVERYWHERE = 3       // a dismissed alert of this level or higher is gone on every panel

def installed() { initialize() }
def updated() {
    if (logEnable) runIn(1800, "logsOff")
    initialize()
}
def initialize() {
    if (state.alerts == null) state.alerts = []
    sendEvent(name: "numberOfButtons", value: BUTTONS)
    publishAlerts()
    if (device.currentValue("serverStatus") == null) sendEvent(name: "serverStatus", value: "unknown")
    // (the watchdog again, e.g. after a new timeout: what's left of it)
    Long last = state.hbAt as Long
    if (last) runIn(Math.max(1, hbSeconds() - ((now() - last).intdiv(1000) as Integer)), "heartbeatLost", [overwrite: true])
}
def logsOff() { device.updateSetting("logEnable", [value: "false", type: "bool"]) }

// ---------- what rules call ----------
def deviceNotification(text) {
    def p = readPrefix(text as String)
    notify(p.text, p.lvl, p.to, null, p.secs, p.tag)
}
def refresh() {
    // (the Skypane bridge asks for this after it (re)started: it has the ids, this sends the texts again)
    (state.alerts ?: []).each { a -> command([op: "notify", id: a.id, lvl: a.lvl, to: a.to, tag: a.tag, title: a.title, text: a.text, exp: a.exp, count: a.count, replay: true]) }
    publishAlerts()
    if (state.vol != null || state.muted != null) {   // (and the volume the panels were last given)
        Map m = [op: "volume", to: speakTargets(null), replay: true]
        if (state.vol != null) m.vol = state.vol as Integer
        if (state.muted != null) m.muted = state.muted as Boolean
        command(m)
    }
}

def critical(text, tag = null) { notify(text, 5, null, null, null, tag) }
def alert(text, tag = null)    { notify(text, 4, null, null, null, tag) }
def warning(text, tag = null)  { notify(text, 3, null, null, null, tag) }
def notice(text, tag = null)   { notify(text, 2, null, null, null, tag) }
def info(text)                 { notify(text, 1, null, null, null, null) }

// (returns the alert's id — speakTo() passes it on, so a panel says it once)
def notify(text, level = null, panels = null, title = null, seconds = null, tag = null) {
    String t = clean(text as String, 300)
    if (!t) { log.warn "notify: no text"; return null }
    Integer lvl = clampLevel(level)
    List to = targets(panels)
    Integer sec = toInt(seconds)
    Integer secs = (sec != null && sec > 0) ? Math.min(sec, 86400) : defaultSeconds(lvl)
    String tg = cleanTag(tag)
    Long s = now().intdiv(1000)
    List alerts = (state.alerts ?: []).findAll { it.exp == 0 || it.exp > s }
    def old = tg ? alerts.find { it.tag == tg } : null
    String id = old ? old.id : newId()
    Map a = [id: id, lvl: lvl, tag: tg ?: "", to: to, title: clean(title as String, 60) ?: "", text: t,
             at: s, exp: secs ? s + secs : 0, count: old ? ((old.count ?: 1) + 1) : 1]
    alerts = alerts.findAll { it.id != id } + [a]
    // too many: the oldest low-level ones go first (never a level 5)
    while (alerts.size() > MAX_ALERTS) {
        def drop = alerts.findAll { it.lvl < 5 }.min { (it.lvl as Integer) * 1e12 + (it.at as Long) }
        if (!drop) break
        alerts = alerts.findAll { it.id != drop.id }
    }
    state.alerts = alerts
    sendEvent(name: "lastAlert", value: t)
    sendEvent(name: "lastAlertLevel", value: lvl, isStateChange: true)
    command([op: "notify", id: id, lvl: lvl, to: to, tag: a.tag, title: a.title, text: t, exp: a.exp, count: a.count])
    publishAlerts()
    scheduleExpiry()
    if (txtEnable) log.info "${device.displayName}: level ${lvl} → ${to.join(',')}: ${t}"
    return id
}

def dismiss(tagOrId) {
    String k = (tagOrId as String)?.trim()
    if (!k) return
    List alerts = state.alerts ?: []
    List gone = k.toLowerCase() == "all" ? alerts : alerts.findAll { it.tag == k.toLowerCase() || it.id == k }
    if (!gone) { if (logEnable) log.debug "dismiss: nothing active for ${k}"; return }
    state.alerts = alerts - gone
    gone.each { command([op: "dismiss", id: it.id]) }
    publishAlerts()
    scheduleExpiry()
    if (txtEnable) log.info "${device.displayName}: dismissed ${gone.collect { it.tag ?: it.id }.join(', ')} (by Hubitat)"
}
def dismissAll() { dismiss("all") }

def showCamera(cameras, panels = null, seconds = null) {
    List cams = ((cameras as String) ?: "").split(",").collect { clean(it, 60) }.findAll { it }.take(4)
    if (!cams) return
    Map m = [op: "camera", cams: cams, to: targets(panels)]
    Integer s = secsOr(seconds, null); if (s != null) m.secs = s   // (none: each panel's own pop-up time)
    command(m)
}
def showView(view, panels = null, seconds = null) {
    String v = clean(view as String, 60)
    if (!v) return
    Map m = [op: "view", view: v, to: targets(panels)]
    Integer s = secsOr(seconds, null); if (s != null) m.secs = s
    command(m)
}

// ---------- the panels as speakers (SpeechSynthesis, AudioVolume) ----------
// speak(text) goes to "Panels that speak"; the text may start with @panels (and !level #tag +seconds, used when it also
// shows as an alert). volume: 0–100 for this message only; voice: a voice name or language (en-US) — the panel picks the
// nearest it has.
def speak(text, volume = null, voice = null) { speakTo(text, null, volume, voice) }
def speakTo(text, panels = null, volume = null, voice = null) {
    def p = readPrefix(text as String)
    String t = clean(p.text as String, 300)
    if (!t) { log.warn "speak: no text"; return }
    List to = speakTargets(panels ?: p.to)
    Map m = [op: "say", to: to, text: t]
    Integer v = toInt(volume)
    if (v != null) m.vol = Math.max(0, Math.min(100, v))
    String vc = clean(voice as String, 40)
    if (vc) m.voice = vc
    if (speakShows) {
        String id = notify(t, p.lvl, to.join(","), null, p.secs, p.tag)
        if (id) m.id = id
    }
    command(m)
    if (txtEnable) log.info "${device.displayName}: say → ${to.join(',')}: ${t}"
}
def setVolume(volume) { setPanelVolume(volume, null) }
def setPanelVolume(volume, panels = null) {
    Integer v = toInt(volume)
    if (v == null) { log.warn "setVolume: 0–100"; return }
    v = Math.max(0, Math.min(100, v))
    state.vol = v
    sendEvent(name: "volume", value: v, unit: "%")
    command([op: "volume", to: speakTargets(panels), vol: v])
}
def volumeUp()   { setVolume((state.vol != null ? state.vol as Integer : 50) + 10) }
def volumeDown() { setVolume((state.vol != null ? state.vol as Integer : 50) - 10) }
def mute()   { setMuted(true) }
def unmute() { setMuted(false) }
private void setMuted(Boolean m) {
    state.muted = m
    sendEvent(name: "mute", value: m ? "muted" : "unmuted")
    command([op: "volume", to: speakTargets(null), muted: m])
}
private List speakTargets(panels) { targets(panels ?: (speakPanels ?: null)) }

// ---------- the Skypane server's heartbeat ----------
// serverHeartbeat("<problems>,<level>,<text>") or serverHeartbeat(n, level, text) — from the bridge every ~30 s (the
// Maker API splits at the commas; the bridge lets none into the text). Not for rules.
def serverHeartbeat(n, level = null, text = null) {
    List parts = [n, level, text].findAll { it != null }.collect { it as String }.join(",").split(",", 3).collect { it.trim() }
    Integer cnt = parts.size() > 0 ? toInt(parts[0]) : null
    if (cnt == null || cnt < 0) { log.warn "serverHeartbeat: bad message"; return }
    Integer lvl = parts.size() > 1 ? (toInt(parts[1]) ?: 0) : 0
    String txt = clean(parts.size() > 2 ? parts[2] : "", 120)
    Long ms = now()
    state.hbAt = ms
    boolean back = device.currentValue("serverStatus") != "online"
    sendEvent(name: "serverStatus", value: "online", descriptionText: "the Skypane server is online")
    if (back || !state.hbShownAt || ms - (state.hbShownAt as Long) >= 300000) {   // (not every 30 s: the event list stays readable)
        sendEvent(name: "lastHeartbeat", value: when(ms))
        state.hbShownAt = ms
    }
    // (Hubitat drops an event whose value didn't change: these only show when something changed)
    sendEvent(name: "healthCount", value: cnt)
    sendEvent(name: "healthLevel", value: Math.max(0, Math.min(5, lvl)))
    sendEvent(name: "healthAlert", value: cnt > 0 ? (txt ?: "A problem on the Skypane server") : "none")
    runIn(hbSeconds(), "heartbeatLost", [overwrite: true])
    if (back && txtEnable) log.info "${device.displayName}: the Skypane server is online"
}
def heartbeatLost() {
    Long last = state.hbAt as Long
    Integer left = last ? hbSeconds() - ((now() - last).intdiv(1000) as Integer) : 0
    if (left > 2) { runIn(left, "heartbeatLost", [overwrite: true]); return }   // (a newer heartbeat came after all)
    if (device.currentValue("serverStatus") == "offline") return
    String since = last ? when(last) : "never"
    sendEvent(name: "serverStatus", value: "offline", descriptionText: "the Skypane server is not heard from since ${since}")
    sendEvent(name: "healthAlert", value: "Skypane server offline (last heard ${since})")
    log.warn "${device.displayName}: the Skypane server is not heard from since ${since}"
}
private Integer hbSeconds() {
    Integer t = toInt(hbTimeout)
    return t != null && t >= 60 ? Math.min(t, 3600) : 90
}
private String when(Long ms) { new Date(ms).format("yyyy-MM-dd HH:mm:ss", location?.timeZone ?: TimeZone.getDefault()) }

// PushableButton: lets a piston test its "button N pushed" trigger
def push(button) {
    Integer n = toInt(button)
    if (n == null || n < 1 || n > BUTTONS) { log.warn "push: button 1–${BUTTONS}"; return }
    firePush(n)
}

// ---------- from the Skypane service ----------
// panelAck("<id>,<panel>,<level>") or panelAck(id, panel, level) — the Maker API splits commas into arguments;
// an older bridge sends no level (it is then the alert's own).
def panelAck(id, panel = null, level = null) {
    List parts = [id, panel, level].findAll { it != null }.collect { it as String }.join(",").split(",").collect { it.trim() }
    String i = parts.size() > 0 ? parts[0].toLowerCase() : ""
    String p = parts.size() > 1 ? parts[1].toLowerCase() : ""
    if (!(i ==~ /[0-9a-f]{6,24}/) || !(p ==~ /[a-z0-9_-]{1,40}/)) { log.warn "panelAck: bad id / panel"; return }
    def a = (state.alerts ?: []).find { it.id == i }
    if (!a) { if (logEnable) log.debug "panelAck: ${i} not active"; return }
    Integer given = parts.size() > 2 ? toInt(parts[2]) : null
    Integer own = a.lvl as Integer
    // (1.8) a level 4–5 is never cleared by a message that says it's lower: a forged or stale one (the bridge sends this
    // alert's own level; only the Manager's acknowledgement may differ)
    if (own >= 4 && given != null && given < own && !p.startsWith("manager-")) {
        log.warn "panelAck: ${i} is level ${own}, the message said ${given} — ignored"
        return
    }
    Integer lvl = (given != null && given >= 1 && given <= 5) ? given : own
    // level 3–5: Dismiss clears it on every panel; level 1–2 was dismissed on that one panel only — unless it came from
    // the Manager ("manager-<login>", Skypane v2.3.1: the admin acknowledged it there): then any level, everywhere
    if (lvl >= EVERYWHERE || p.startsWith("manager-")) {
        state.alerts = (state.alerts ?: []).findAll { it.id != i }
        publishAlerts()
        scheduleExpiry()
    }
    String tag = a.tag ?: a.id
    ackEvents(tag, p, lvl, [id: i, tag: tag, panel: p, lvl: lvl, at: now().intdiv(1000)])
    firePush(lvl)
    if (txtEnable) log.info "${device.displayName}: ${tag} (level ${lvl}) dismissed on ${p}"
}

// "Dismiss all" on a panel: clears the level 3 alerts that panel was showing (sent to it, or to all panels); level 1–2
// ones were dismissed on that panel only. Never a level 4–5 (1.8): those need the panel PIN, one panelAck each.
// (Skypane's bridge no longer calls this since v2.3.2 — it sends one panelAck per alert — but a rule or an older
// bridge still may.)
def panelAckAll(panel) {
    String p = ((panel as String) ?: "").split(",")[0].trim().toLowerCase()
    if (!(p ==~ /[a-z0-9_-]{1,40}/)) { log.warn "panelAckAll: bad panel"; return }
    List alerts = state.alerts ?: []
    Integer top = highest(alerts)
    List gone = alerts.findAll { (it.lvl as Integer) >= EVERYWHERE && (it.lvl as Integer) < 4 && ((it.to ?: ["all"]).contains("all") || (it.to ?: []).contains(p)) }
    if (gone) {
        state.alerts = alerts - gone
        publishAlerts()
        scheduleExpiry()
    }
    ackEvents("all", p, top, [id: "all", tag: "all", panel: p, lvl: top, n: gone.size(), at: now().intdiv(1000)])
    firePush(DISMISS_ALL)
    if (txtEnable) log.info "${device.displayName}: Dismiss all on ${p} (${gone.size()} cleared)"
}

// (1.8, Skypane v2.3.2) panelDismissedAll("<panel>,<level>,<count>"): a panel's Dismiss all is over — the bridge already
// sent a panelAck for every alert it cleared (never a level 4–5 without the PIN). Clears NOTHING: only the notification
// side of Dismiss all, as before — `acknowledged` = "all", ackPanel = the panel, ackLevel = the highest level cleared,
// button 6 pushed.
def panelDismissedAll(panel, level = null, count = null) {
    List parts = [panel, level, count].findAll { it != null }.collect { it as String }.join(",").split(",").collect { it.trim() }
    String p = parts.size() > 0 ? parts[0].toLowerCase() : ""
    if (!(p ==~ /[a-z0-9_-]{1,40}/)) { log.warn "panelDismissedAll: bad panel"; return }
    Integer lvl = parts.size() > 1 ? toInt(parts[1]) : null
    Integer n = parts.size() > 2 ? toInt(parts[2]) : null
    if (lvl == null || lvl < 0 || lvl > 5) lvl = highest(state.alerts ?: [])
    ackEvents("all", p, lvl, [id: "all", tag: "all", panel: p, lvl: lvl, n: (n != null && n >= 0) ? n : 0, at: now().intdiv(1000)])
    firePush(DISMISS_ALL)
    if (txtEnable) log.info "${device.displayName}: Dismiss all on ${p}"
}

// "Silence" on a panel (v2.2.0): the sound of a level 4–5 stopped there — the alert stays up (not a dismissal)
def panelSilence(id, panel = null, level = null) {
    List parts = [id, panel, level].findAll { it != null }.collect { it as String }.join(",").split(",").collect { it.trim() }
    String i = parts.size() > 0 ? parts[0].toLowerCase() : ""
    String p = parts.size() > 1 ? parts[1].toLowerCase() : ""
    if (!(i ==~ /[0-9a-f]{6,24}/) || !(p ==~ /[a-z0-9_-]{1,40}/)) { log.warn "panelSilence: bad id / panel"; return }
    def a = (state.alerts ?: []).find { it.id == i }
    if (!a) { if (logEnable) log.debug "panelSilence: ${i} not active"; return }
    String tag = a.tag ?: a.id
    sendEvent(name: "silencedPanel", value: p, isStateChange: true)   // (not ackPanel / ackLevel: those mean a dismissal)
    sendEvent(name: "silencedLevel", value: a.lvl as Integer, isStateChange: true)
    sendEvent(name: "silenced", value: tag, isStateChange: true)
    firePush(7)
    if (txtEnable) log.info "${device.displayName}: ${tag} (level ${a.lvl}) silenced on ${p} — still up"
}

// ---------- expiry ----------
def expireCheck() {
    Long s = now().intdiv(1000)
    List alerts = state.alerts ?: []
    List gone = alerts.findAll { it.exp && it.exp <= s }
    if (gone) {
        state.alerts = alerts - gone
        publishAlerts()
        gone.each {
            sendEvent(name: "expired", value: it.tag ?: it.id, isStateChange: true)
            command([op: "dismiss", id: it.id])
        }
    }
    scheduleExpiry()
}
private void scheduleExpiry() {
    Long s = now().intdiv(1000)
    def next = (state.alerts ?: []).findAll { it.exp }.collect { it.exp as Long }.min()
    if (next) runIn(Math.max(1, (next - s) as Integer), "expireCheck", [overwrite: true])
    else unschedule("expireCheck")
}

// ---------- helpers ----------
private void publishAlerts() {
    List alerts = state.alerts ?: []
    // [[id, level, expiry]] — the texts go with panelCommand (an event value should stay short)
    sendEvent(name: "activeAlerts", value: JsonOutput.toJson([v: 1, ids: alerts.collect { [it.id, it.lvl, it.exp] }]))
    sendEvent(name: "alertCount", value: alerts.size())
    sendEvent(name: "activeLevel", value: highest(alerts))
}
private Integer highest(List alerts) { (alerts ?: []).collect { it.lvl as Integer }.max() ?: 0 }
private void ackEvents(String what, String p, Integer lvl, Map detail) {
    // set before `pushed`, so a piston triggered by the button can read who / what / which level
    sendEvent(name: "ackPanel", value: p, isStateChange: true)
    sendEvent(name: "ackLevel", value: lvl, isStateChange: true)
    sendEvent(name: "ackInfo", value: JsonOutput.toJson(detail), isStateChange: true)
    sendEvent(name: "acknowledged", value: what, isStateChange: true)
}
private void firePush(Integer n) {
    if (device.currentValue("numberOfButtons") != BUTTONS) sendEvent(name: "numberOfButtons", value: BUTTONS)
    // isStateChange: the same button twice is still two pushes
    sendEvent(name: "pushed", value: n, isStateChange: true, type: "physical")
    if (logEnable) log.debug "pushed ${n}"
}
private void command(Map m) {
    // isStateChange: the same command twice is still two commands (Hubitat would drop an unchanged value)
    sendEvent(name: "panelCommand", value: JsonOutput.toJson([v: 1] + m), isStateChange: true)
    if (logEnable) log.debug "panelCommand ${m}"
}
private Map readPrefix(String text) {
    // (to: null = the default panels — notify and speakTo each know theirs)
    Map out = [text: text ?: "", lvl: toInt(defLevel) ?: 2, to: null, tag: null, secs: null]
    if (parsePrefix == false) return out
    List words = (text ?: "").trim().split(/\s+/) as List
    while (words) {
        String w = words[0]
        if (w ==~ /!([1-5])/) out.lvl = w.substring(1) as Integer
        else if (w ==~ /@[A-Za-z0-9_,-]{1,200}/) out.to = w.substring(1)
        else if (w ==~ /#[A-Za-z0-9_-]{1,32}/) out.tag = w.substring(1)
        else if (w ==~ /\+\d{1,5}/) out.secs = w.substring(1) as Integer
        else break
        words = words.drop(1)
    }
    out.text = words.join(" ")
    return out
}
// webCoRE / Rule Machine may pass numbers as strings ("5", "5.0", ""), as decimals, or as null
private Integer toInt(v) {
    if (v == null) return null
    if (v instanceof Number) return (v as Number).intValue()
    String s = (v as String).trim()
    if (s.isInteger()) return s.toInteger()
    if (s.isBigDecimal()) return s.toBigDecimal().intValue()
    return null
}
private Integer clampLevel(level) {
    Integer l = toInt(level)
    if (l == null && level != null) l = LEVEL_WORDS[(level as String).trim().toLowerCase()] as Integer   // "critical"…
    if (l == null || l == 0) l = toInt(defLevel) ?: 2
    return Math.max(1, Math.min(5, l))
}
private List targets(panels) {
    String p = ((panels as String)?.trim() ?: (defPanels ?: "all")).toLowerCase()
    List out = p.split(",").collect { it.trim() }.findAll { it ==~ /[a-z0-9_-]{1,40}/ }.unique().take(20)
    return out ?: ["all"]
}
private Integer secsOr(seconds, Integer d) {
    Integer s = toInt(seconds)
    return s != null && s > 0 ? Math.min(s, 3600) : d
}
private String cleanTag(tag) {
    String t = ((tag as String) ?: "").trim().toLowerCase()
    return t ==~ /[a-z0-9_-]{1,32}/ ? t : null
}
private String clean(String s, Integer n) {
    if (s == null) return ""
    String t = s.replaceAll(/[\u0000-\u001f\u007f]/, " ").trim()
    return t.length() > n ? t.substring(0, n) : t
}
private String newId() {
    state.seq = ((state.seq ?: 0) + 1) % 256
    return Long.toHexString(now()) + String.format("%02x", state.seq)
}
