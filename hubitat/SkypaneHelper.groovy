/**
 *  Skypane Helper — a Hubitat app that helps Skypane (v3.0.7).
 *
 *  What it does:
 *    - (v3.0.7) It is Skypane's link to the hub, in place of Maker API: it makes its own access token (OAuth must be on
 *      for this app: Hubitat Package Manager turns it on; by hand, Apps Code → Skypane Helper → OAuth → Enable OAuth in
 *      App → Update) and answers Maker API's own requests, with the same JSON, at this hub's address:
 *        GET /apps/api/<this app's id>/devices                 the devices you picked: id, name, label, type
 *        GET /apps/api/<this app's id>/devices/all             the same, with attributes, capabilities and commands
 *        GET /apps/api/<this app's id>/devices/<id>            one device
 *        GET /apps/api/<this app's id>/devices/<id>/<command>[/<value, value…>]   a command the device lists
 *        GET /apps/api/<this app's id>/modes, /modes/<id>      the hub's modes; set one
 *        GET /apps/api/<this app's id>/hsm, /hsm/<action>      Hubitat Safety Monitor; arm / disarm
 *        GET /apps/api/<this app's id>/ping                    is it there (the version, how many devices)
 *      Only the devices picked below (and this app's own Skypane Notifier) are there. The access token, this app's id
 *      and the hub's address go to Skypane once, when the app links (signed with the link's key, see below). Skypane
 *      reads live changes from the hub's own event socket and keeps only the devices this app was given.
 *    - Reports the devices you pick: each one's protocol (Zigbee, Z-Wave, Matter, LAN, an app / cloud integration,
 *      virtual), its last activity and its health status. Skypane shows them in Devices → Detailed.
 *    - Keeps the Skypane Notifier driver up to date: when an admin taps "Update the driver" in the Skypane Manager
 *      (Integrations → Hubitat), this app downloads the driver from your Skypane, checks it against the sha256 Skypane
 *      gave it, and saves it on this hub. It can update itself the same way.
 *    - (v3.0.7) Makes the Skypane Notifier as its own child device by itself, right after it links (and saves the
 *      Notifier driver code first when it isn't on the hub yet), and shows "Update required" on that device's page
 *      (driverStatus) when Skypane has a newer driver.
 *    - (v3.0.7) Tells Skypane how many devices the hub has and which ones it wasn't given (it reads the hub's own device
 *      list, read only, on 127.0.0.1). It never adds devices by itself: tick them below.
 *
 *  Install once: Hubitat Package Manager → Install → From a URL → http://<your Skypane>/hubitat/packageManifest.json
 *  (it turns OAuth on). Or by hand: Apps Code → New App → Import → http://<your Skypane>/hubitat/SkypaneHelper.groovy →
 *  Save → OAuth → Enable OAuth in App → Update. Then Apps → Add user app → Skypane Helper.
 *
 *  How it talks to Skypane: this app starts its connections only to the Skypane address typed below. It links once
 *  with a one-time code from the Manager and gets a token of its own, which it sends with every request.
 *  (v3.0.5) The link also gives this app a key of its own (made for this link only). Skypane signs every "update" offer
 *  with it (HMAC-SHA256); this app checks the signature before it downloads anything, then checks the code's sha256
 *  and that it is the Skypane code it expects (namespace "skypane" and the right name). If Skypane answers 401 or 403,
 *  this app unlinks itself: make a new link code in the Manager and type it here again.
 *  (v3.0.7) Skypane then calls this app's endpoint with the access token (the way it called Maker API).
 *
 *  Hub Login Security: if it is on, saving code and counting the hub's devices need the hub's login. Type it below: it
 *  stays in this app's settings on this hub and is only sent to the hub itself (127.0.0.1). Skypane never sees it.
 *
 *  Saving code uses the hub's own pages (/driver/ajax/update, /app/ajax/update, /driver/save — the ones Hubitat Package
 *  Manager uses), and the device count /hub2/devicesList. They aren't an official API: if a hub update changes them,
 *  the app says "Update required" and shows the import address, so the code can be updated by hand (the count is then
 *  left out, and Skypane says it can't count).
 */
import groovy.json.JsonOutput
import groovy.transform.Field
import java.security.MessageDigest
import javax.crypto.Mac                    // (v3.0.5) the update offer's signature
import javax.crypto.spec.SecretKeySpec

@Field static final String APP_VERSION = "3.0.7"   // (v3.0.5) Skypane reads it from here (service/hubitat_helper.py)
@Field static final String HUB = "http://127.0.0.1:8080"
@Field static final Integer MAX_DEVICES = 500
@Field static final Integer MAX_MISSING = 50   // (v3.0.7) as service/hubitat_helper.py MAX_MISSING
@Field static final String OFFER_TAG = "skypane-helper-offer-v1"   // (v3.0.5) as service/hubitat_helper.py OFFER_TAG
@Field static final String HUBLINK_TAG = "skypane-helper-hublink-v1"   // (v3.0.7) as service/hubitat_helper.py HUBLINK_TAG
// (v3.0.5) what each update must declare in its definition(): namespace "skypane" and this name
@Field static final Map CODE_NAMES = [driver: "Skypane Notifier", app: "Skypane Helper"]
// (v3.0.7) the Hubitat Safety Monitor actions the endpoint takes (as Maker API's hsm/<action>)
@Field static final List HSM_ACTIONS = ["armAway", "armHome", "armNight", "disarm", "armAll", "disarmAll", "cancelAlerts"]
// (v3.0.7 review) commands the endpoint never runs: this app's own (helper…), configure, and the lock-code ones
@Field static final List BLOCKED_COMMANDS = ["configure", "deleteCode", "getCodes", "setCode", "setCodeLength", "setCodeEncryption", "updateCodes"]
// (v3.0.7 review) after Skypane refuses the hub link: wait 1, then 5, then 15 minutes before sending it again
@Field static final List HUBLINK_BACKOFF = [1, 5, 15]

definition(
    name: "Skypane Helper",
    namespace: "skypane",
    author: "Skypane",
    description: "Skypane's link to the hub (in place of Maker API): device list, commands, the Skypane Notifier and its driver.",
    category: "Convenience",
    singleInstance: true,
    iconUrl: "",
    iconX2Url: "")

preferences {
    page(name: "mainPage")
}

// (v3.0.7) the local endpoint: Maker API's own paths and JSON (Skypane's bridge reads them unchanged)
mappings {
    path("/devices")                         { action: [GET: "apiList"] }
    path("/devices/all")                     { action: [GET: "apiAll"] }
    path("/devices/:id")                     { action: [GET: "apiDevice"] }
    path("/devices/:id/:command")            { action: [GET: "apiCommand"] }
    path("/devices/:id/:command/:secondary") { action: [GET: "apiCommand"] }
    path("/modes")                           { action: [GET: "apiModes"] }
    path("/modes/:id")                       { action: [GET: "apiSetMode"] }
    path("/hsm")                             { action: [GET: "apiHsm"] }
    path("/hsm/:value")                      { action: [GET: "apiSetHsm"] }
    path("/ping")                            { action: [GET: "apiPing"] }
}

def mainPage() {
    dynamicPage(name: "mainPage", title: "Skypane Helper ${APP_VERSION}", install: true, uninstall: true) {
        section("Skypane") {
            input "skypaneUrl", "text", title: "Skypane address (for example http://192.168.1.50:8088)", required: true, submitOnChange: true
            if (!state.token) {
                input "linkCode", "text", title: "Link code (Skypane Manager → Integrations → Hubitat → Set up with the Skypane Helper)", required: false
            }
            paragraph statusText()
            if (state.token) input "unlink", "bool", title: "Unlink from Skypane (a new link code is needed after this)", defaultValue: false
        }
        // (v3.0.7) the devices Skypane may use: "Select all" is offered by the hub's picker, not required
        section("Devices for Skypane") {
            input "devs", "capability.*", title: "Select devices", multiple: true, required: false
            paragraph "Skypane can only see and switch the devices ticked here. New devices on the hub aren't ticked by themselves: Skypane tells you when the hub has some this app wasn't given."
        }
        section("Skypane Notifier") {
            input "notifiers", "device.SkypaneNotifier", title: "A Skypane Notifier you made yourself (optional)", multiple: true, required: false
            input "createNotifier", "bool", title: "Create a Skypane Notifier device for me", defaultValue: false
            paragraph "This app makes the Notifier as its own child device after it links, so there's nothing to add by hand."
        }
        section("Hub login (only when Hub Login Security is on)") {
            input "hubUser", "text", title: "Hub user name", required: false
            input "hubPass", "password", title: "Hub password", required: false
            paragraph "Used only to save driver and app code and to count the hub's devices, on this hub. It stays on this hub; Skypane never sees it."
        }
        section("Logging") {
            input "logEnable", "bool", title: "Debug logging", defaultValue: false
        }
    }
}

def installed() { initialize() }
def updated() {
    // (v3.0.7 review) Done was pressed (the devices may have changed): the next report asks Skypane to resync, and a
    // refused hub link is tried again at once
    state.resyncAsk = true
    state.remove("hubLinkNext")
    initialize()
}
def uninstalled() { unschedule() }

def initialize() {
    unschedule()
    if (settings.unlink) {
        state.remove("token")
        state.remove("key")   // (v3.0.5)
        state.remove("hubLinkAt")   // (v3.0.7)
        dropAccessToken()   // (v3.0.7 review) a new link gets a new access token (the old one stops working)
        app.updateSetting("unlink", [value: "false", type: "bool"])
    }
    ensureToken()   // (v3.0.7) this app's own access token (OAuth on)
    if (!state.token && settings.linkCode) link()
    if (settings.createNotifier) {
        app.updateSetting("createNotifier", [value: "false", type: "bool"])
        makeNotifier()
    }
    if (state.token) {
        if (state.accessToken && !state.hubLinkAt) sendHubLink()   // (v3.0.7) once, after the link (or OAuth turned on)
        runEvery1Minute("poll")
        runEvery15Minutes("report")
        runEvery1Hour("countHub")   // (v3.0.7)
        runIn(5, "report")
        runIn(10, "poll")
        runIn(20, "countHub")
    }
}

// ---------- the Skypane address ----------
private String base() {
    String u = (settings.skypaneUrl ?: "").trim()
    if (u.endsWith("/")) u = u.substring(0, u.length() - 1)
    // only http(s)://host[:port] — no path, no user, nothing else
    return (u ==~ /^https?:\/\/[A-Za-z0-9.\-]{1,253}(:\d{1,5})?$/) ? u : null
}
private Map auth() { [Authorization: "Bearer ${state.token}"] }

private String statusText() {
    if (!base()) return "Type Skypane's address (http://… with its port, if any)."
    if (!state.token) return state.linkError ? "Not linked: ${state.linkError}" : "Not linked yet: type the link code from the Manager and press Done."
    List lines = ["Linked to ${base()}."]
    // (v3.0.7) OAuth off: no access token, so Skypane can't use this app's endpoint
    if (state.oauthOff) lines << "OAuth is off for this app: open Apps Code → Skypane Helper → OAuth → Enable OAuth in App → Update, then come back and press Done."
    else if (state.hubLinkAt) lines << "Skypane has this app's endpoint (since ${new Date(state.hubLinkAt as Long)})."
    // (v3.0.7 review) Skypane refused the endpoint: why, and when it's tried again
    else if (state.hubLinkError) lines << "Skypane didn't take this app's endpoint: ${hubLinkWords(state.hubLinkError as String)}" +
        (state.hubLinkNext ? " Trying again at ${new Date(state.hubLinkNext as Long)}." : "")
    if (state.lastPoll) lines << "Last heard from Skypane: ${new Date(state.lastPoll as Long)}"
    if (state.hubCount != null) {
        Integer miss = (state.missing ?: []).size()
        lines << (miss ? "The hub has ${state.hubCount} devices; ${miss} of them aren't ticked above." : "All of the hub's ${state.hubCount} devices are ticked above.")
    }
    if (state.appLatest && newer(state.appLatest as String, APP_VERSION)) lines << "Update required: Skypane has Skypane Helper ${state.appLatest} (this is ${APP_VERSION})."
    if (state.manual) lines << "Update required — the hub didn't take the new code. Import it by hand: ${base()}${state.manual}"
    if (state.lastResult) lines << "Last update: ${state.lastResult}"
    return lines.join("\n")
}

// ---------- linking: a one-time code from the Manager → this app's own token ----------
private void link() {
    String b = base(), code = (settings.linkCode ?: "").replaceAll(/[\s-]/, "").toUpperCase()
    app.removeSetting("linkCode")   // (v3.0.5) the documented way to clear a setting
    if (!b || !(code ==~ /^[A-Z2-9]{8}$/)) { state.linkError = "the address or the code doesn't look right"; return }
    try {
        httpPost([uri: b, path: "/api/hubitat/helper/link", requestContentType: "application/json", contentType: "application/json",
                  body: JsonOutput.toJson([code: code, version: APP_VERSION, hub: location?.hub?.name ?: ""]), timeout: 20]) { resp ->
            String t = resp?.data?.token, k = resp?.data?.key
            // (v3.0.5) the token and this link's own HMAC key (for the update offers) — both, or no link
            if (resp.status == 200 && t ==~ /^[A-Za-z0-9_\-]{40,100}$/ && k ==~ /^[A-Za-z0-9_\-]{43,100}$/) {
                state.token = t
                state.key = k
                state.remove("linkError")
                state.remove("hubLinkAt")   // (v3.0.7) a new link: the endpoint goes to Skypane again
            } else state.linkError = "Skypane said no"
        }
    } catch (e) {
        state.linkError = "Skypane refused the code or can't be reached (${e?.message?.take(60)})"
    }
}

// ---------- (v3.0.7) the access token and the hub link ----------
// createAccessToken() fails while OAuth is off for this app: the app says so (here and in its report to Skypane)
private void ensureToken() {
    if (state.accessToken) { state.remove("oauthOff"); return }
    try {
        createAccessToken()
        state.remove("oauthOff")
        state.remove("hubLinkAt")
    } catch (e) {
        state.oauthOff = true
    }
}

// (v3.0.7 review) Unlinked: the access token is revoked (it works through the hub's cloud endpoint too); the next
// initialize() makes a new one
private void dropAccessToken() {
    try { revokeAccessToken() } catch (e) { }
    state.remove("accessToken")
}

// The exact text the hub link's signature covers — the same as service/hubitat_helper.py hublink_text.
private String hubLinkText(Long appId, String host, String token) {
    return [HUBLINK_TAG, appId as String, host, token].join("\n")
}

// (v3.0.7 review) Skypane's refusal (its "error" word) in words for statusText
private String hubLinkWords(String why) {
    switch (why) {
        case "bad-signature": return "the signature didn't match. Unlink, then link again with a new code."
        case "no-key": return "this link has no key (made before 3.0.5). Unlink, then link again with a new code."
        case "bad": return "it didn't look right (the hub's address or the token). Press Done to try again."
        case "too-many": return "too many tries; it waits a few minutes."
        case "not-linked": return "Skypane doesn't know this link any more. Make a new link code in the Manager."
        default: return "Skypane answered ${why}."
    }
}

// The access token, this app's id and the hub's address, once, over the link: signed with the link's key.
private void sendHubLink() {
    String b = base(), ip = location?.hub?.localIP as String, t = state.accessToken as String
    if (!b || !state.token || !t || !(ip ==~ /^\d{1,3}(\.\d{1,3}){3}$/)) return
    if (state.hubLinkNext && now() < (state.hubLinkNext as Long)) return   // (v3.0.7 review) backing off after a refusal
    Long id = app.id as Long
    String sig = hmacHex(state.key as String, hubLinkText(id, ip, t))
    if (!sig) { state.lastResult = "This link has no key: unlink, then link again with a new code."; return }
    asynchttpPost("hubLinkDone", [uri: b, path: "/api/hubitat/helper/hublink", headers: auth(), requestContentType: "application/json",
                                  contentType: "application/json", body: JsonOutput.toJson([appId: id, host: ip, token: t, sig: sig]), timeout: 20])
}
def hubLinkDone(resp, data) {
    if (resp.status == 200) {
        state.hubLinkAt = now()
        state.remove("hubLinkFails"); state.remove("hubLinkNext"); state.remove("hubLinkError")
        return
    }
    // (v3.0.7 review) refused: wait 1, 5, then 15 minutes before the next try, and say why on the app's page
    Integer n = ((state.hubLinkFails ?: 0) as Integer) + 1
    state.hubLinkFails = n
    state.hubLinkNext = now() + (HUBLINK_BACKOFF[Math.min(n, HUBLINK_BACKOFF.size()) - 1] as Long) * 60000L
    String why = null
    try { why = resp.getJson()?.error as String } catch (e) { why = null }
    state.hubLinkError = (why ==~ /^[a-z-]{1,20}$/) ? why : "HTTP ${resp.status}"
    log.warn "Skypane Helper: Skypane didn't take this app's endpoint (${state.hubLinkError}); trying again in ${HUBLINK_BACKOFF[Math.min(n, HUBLINK_BACKOFF.size()) - 1]} min"
}

// ---------- every minute: anything to do? (and the newest versions) ----------
def poll() {
    String b = base()
    if (!b || !state.token) return
    asynchttpGet("pollDone", [uri: b, path: "/api/hubitat/helper/poll", headers: auth(), contentType: "application/json", timeout: 15])
}

def pollDone(resp, data) {
    // (v3.0.5) a 401 / 403 unlinks this app (documented in Help: make a new link code then)
    if (resp.status == 401 || resp.status == 403) { state.remove("token"); state.remove("key"); state.remove("hubLinkAt"); dropAccessToken(); state.linkError = "Skypane unlinked this app"; unschedule(); return }
    if (resp.status != 200) { if (logEnable) log.debug "poll: ${resp.status}"; return }
    Map j
    try { j = resp.getJson() } catch (e) { return }
    state.lastPoll = now()
    state.driverLatest = j?.driver?.version
    state.appLatest = j?.app?.version
    // (v3.0.7) Skypane hasn't got this app's endpoint (yet, or any more): send it again
    if (j?.hubLink == false && state.accessToken) { state.remove("hubLinkAt"); sendHubLink() }
    allNotifiers().each { d ->
        // (v3.0.5) a declared command of the Notifier driver; a failure is said on the hub's log, not swallowed
        try { d.helperDriverStatus(state.driverLatest as String) } catch (e) { log.warn "Skypane Helper: couldn't set driverStatus on ${d}: ${e?.message?.take(80)}" }
    }
    // (v3.0.5) the signed offer ({id, what, version, sha256, path, sig}) — the plain "request" is never acted on
    Map r = j?.offer
    if (j?.relink) state.lastResult = "Skypane asked for an update, but this link has no key: unlink, then link again with a new code."
    if (r?.id && (r.what == "driver" || r.what == "app" || r.what == "notifier") && r.id != state.lastRequest) {
        state.lastRequest = r.id
        // (plain values only: runIn keeps its data as JSON)
        runIn(1, "doRequest", [data: [id: r.id as String, what: r.what as String, version: (r.version ?: "") as String,
                                      sha256: (r.sha256 ?: "") as String, path: (r.path ?: "") as String, sig: (r.sig ?: "") as String]])
    }
}

// (v3.0.5) The text the offer's signature covers — the same as service/hubitat_helper.py offer_text.
private String offerText(Map r) {
    return [OFFER_TAG, r.id ?: "", r.what ?: "", r.version ?: "", r.sha256 ?: "", r.path ?: ""].collect { it as String }.join("\n")
}

// (v3.0.5) Is the offer signed with this link's key? HMAC-SHA256, compared in constant time (MessageDigest.isEqual).
private boolean offerSigned(Map r) {
    String key = state.key, sig = r?.sig
    if (!(sig ==~ /^[0-9a-f]{64}$/)) return false
    String want = hmacHex(key, offerText(r))
    return want ? MessageDigest.isEqual(want.getBytes("UTF-8"), sig.getBytes("UTF-8")) : false
}

// (v3.0.7) HMAC-SHA256 under this link's key (state.key), lowercase hex — null without a well-formed key
private String hmacHex(String key, String text) {
    if (!(key ==~ /^[A-Za-z0-9_\-]{43,100}$/)) return null
    try {
        Mac mac = Mac.getInstance("HmacSHA256")
        mac.init(new SecretKeySpec(key.getBytes("UTF-8"), "HmacSHA256"))
        return mac.doFinal(text.getBytes("UTF-8")).encodeHex().toString()
    } catch (e) {
        log.warn "Skypane Helper: the signature couldn't be made (${e?.message?.take(60)})"
        return null
    }
}

// (v3.0.5) The downloaded code is the Skypane code expected: its definition() says namespace "skypane" and the name.
// (v3.0.7) "notifier" downloads the Notifier driver.
private boolean declares(String code, String what) {
    String name = CODE_NAMES[what == "notifier" ? "driver" : what]
    if (!name || !code) return false
    // (the first line that starts with definition( — never one in a comment or a string further in)
    def m = code =~ /(?m)^[ \t]*definition[ \t]*\(([^)]*)\)/
    if (!m.find()) return false
    String head = m.group(1)
    return head.contains("name: \"${name}\"") && head.contains('namespace: "skypane"')
}

// ---------- every 15 minutes: the picked devices, and the Notifier's version ----------
def report() {
    String b = base()
    if (!b || !state.token) return
    List list = (settings.devs ?: []).take(MAX_DEVICES).collect { d ->
        Map p = protocolOf(d)
        Long last = null
        try { last = d.getLastActivity()?.getTime() } catch (e) { }
        String health = null
        try { health = d.currentValue("healthStatus") as String } catch (e) { }
        Boolean off = false
        try { off = d.isDisabled() ? true : false } catch (e) { }
        [id: d.id as Long, p: p.p, src: p.src, last: last, health: health, disabled: off]
    }
    List kids = getChildDevices()?.collect { it.id as String } ?: []
    Map body = [v: 1, version: APP_VERSION, hub: location?.hub?.name ?: "", firmware: location?.hub?.firmwareVersionString ?: "",
                login: settings.hubUser ? true : false, manual: state.manual ? true : false,
                notifiers: allNotifiers().collect { [id: it.id as Long, version: it.currentValue("driverVersion") as String, child: (it.id as String) in kids] },
                devices: list,
                // (v3.0.7) OAuth on (this app has its access token), how many devices it was given, the hub's own count
                // and the ones it wasn't given (null: it couldn't count), Hub Login Security (null: can't tell)
                oauth: state.accessToken ? true : false, given: allDevices().size(),
                hubCount: state.hubCount, missing: state.hubCount != null ? (state.missing ?: []) : null, secured: state.secured,
                // (v3.0.7 review) after Done (updated()): Skypane reads this app's device list again
                resync: state.resyncAsk ? true : false]
    asynchttpPost("reportDone", [uri: b, path: "/api/hubitat/helper/report", headers: auth(), requestContentType: "application/json",
                                 contentType: "application/json", body: JsonOutput.toJson(body), timeout: 30], [resync: body.resync])
}
def reportDone(resp, data) {
    if (resp.status == 200 && data?.resync) state.remove("resyncAsk")   // (v3.0.7 review)
    if (logEnable) log.debug "report: ${resp.status}"
}

// What the hub says about a device's radio. Strongest first: the controller type, the Zigbee id, then the network id
// and the data the driver keeps. "src" says which one decided (so a wrong guess can be fixed).
private Map protocolOf(d) {
    String ct = null
    try { ct = d.getControllerType() as String } catch (e) { }
    if (ct) {
        String c = ct.toUpperCase()
        if (c.startsWith("ZGB") || c.contains("ZIGBEE")) return [p: "zigbee", src: "controllerType"]
        if (c.startsWith("ZWV") || c.contains("ZWAVE") || c.contains("Z-WAVE")) return [p: "zwave", src: "controllerType"]
        if (c.startsWith("MAT") || c.contains("MATTER")) return [p: "matter", src: "controllerType"]
        if (c.startsWith("LAN") || c.contains("LAN")) return [p: "lan", src: "controllerType"]
    }
    String zid = null
    try { zid = d.getZigbeeId() as String } catch (e) { }
    if (zid) return [p: "zigbee", src: "zigbeeId"]
    Map data = [:]
    try { data = d.getData() ?: [:] } catch (e) { }
    if (data.keySet().any { (it as String).toLowerCase().contains("matter") }) return [p: "matter", src: "data"]
    String dni = (d.deviceNetworkId ?: "") as String
    if (data.zwNodeInfo || data.containsKey("zwaveSecurePairingComplete") || data.S2) return [p: "zwave", src: "data"]
    if (dni ==~ /^[0-9A-Fa-f]{2}(-\d+)?$/) return [p: "zwave", src: "dni"]
    String type = (d.typeName ?: "") as String
    if (type.toLowerCase().startsWith("virtual")) return [p: "virtual", src: "type"]
    if (dni ==~ /^[0-9A-Fa-f]{12}$/ || dni ==~ /^[0-9A-Fa-f]{8}:[0-9A-Fa-f]{4}$/ || dni ==~ /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/) return [p: "lan", src: "dni"]
    Long parentApp = null
    try { parentApp = d.getParentAppId() as Long } catch (e) { }
    if (parentApp) return [p: "app", src: "parent"]
    return [p: "unknown", src: "none"]
}

private List allNotifiers() {
    List out = (settings.notifiers ?: []).collect { it }
    getChildDevices()?.each { c -> if (!out.any { it.id == c.id }) out << c }
    return out
}

// (v3.0.7) every device the endpoint serves: the picked ones, this app's own children (the Notifier) and a Notifier
// picked above
private List allDevices() {
    List out = (settings.devs ?: []).take(MAX_DEVICES).collect { it }
    allNotifiers().each { n -> if (!out.any { it.id == n.id }) out << n }
    return out
}

// ---------- (v3.0.7) every hour: how many devices the hub has, and which ones this app wasn't given ----------
// The hub's own device list (/hub2/devicesList, read only, on 127.0.0.1 — with the hub login when one is typed). Only
// the count and the names of the devices not given leave this hub. When the page can't be read, the count is left out.
def countHub() {
    String cookie = ""
    if (settings.hubUser) {
        cookie = hubLogin()
        if (cookie == null) { state.remove("hubCount"); state.remove("missing"); state.secured = true; return }
    }
    String text = null
    try {
        httpGet([uri: HUB, path: "/hub2/devicesList", headers: hdr(cookie), textParser: true, timeout: 30, ignoreSSLIssues: true]) { resp ->
            text = resp?.data?.text
        }
    } catch (e) { text = null }
    Map found = [:]
    if (text && text.trim().startsWith("{")) {
        try {
            Map j = parseJson(text)
            if (j?.devices instanceof List) walkDevices(j.devices, found, 0)
        } catch (e) { found = [:] }
    }
    if (!found) {
        state.remove("hubCount")
        state.remove("missing")
        // (no login typed and the hub showed its login page instead: Hub Login Security is on)
        state.secured = settings.hubUser ? true : ((text ?: "").toLowerCase().contains("password") ? true : null)
        return
    }
    state.secured = settings.hubUser ? true : false
    List given = allDevices().collect { it.id as Long }
    state.hubCount = found.size()
    state.missing = found.findAll { !(it.key in given) }.collect { [id: it.key, name: it.value] }.take(MAX_MISSING)
}

private void walkDevices(List items, Map out, Integer depth) {
    if (depth > 4 || items == null) return
    items.each { x ->
        if (x instanceof Map) {
            Map d = x.data instanceof Map ? x.data : x
            String id = d.id as String
            if (id?.isLong()) out[id as Long] = ((d.label ?: d.name) ?: "#${id}") as String
            if (x.children instanceof List) walkDevices(x.children, out, depth + 1)
        }
    }
}

// ---------- the Notifier device ----------
// (v3.0.7) true when this app has a Notifier child device afterwards. (v3.0.7 review) state.notifierError says why
// not: "driver" (the driver isn't on the hub), "dni" (another device already has its network id) or "child" (anything
// else — the hub's own message is on the app's page and in the log).
private boolean makeNotifier() {
    if (getChildDevices()?.size()) { state.remove("notifierError"); return true }
    String dni = "skypane-notifier-${app.id}"
    try {
        addChildDevice("skypane", "Skypane Notifier", dni, [name: "Skypane Notifier", label: "Skypane", isComponent: false])
        state.remove("notifierError")
        state.lastResult = "Created the Skypane Notifier device (a child of this app: Skypane uses it through this app)."
        return true
    } catch (e) {
        String kind = e?.getClass()?.getSimpleName() ?: "Exception", msg = (e?.message ?: "").take(120)
        if (kind.contains("UnknownDeviceType")) {
            state.notifierError = "driver"
            state.lastResult = "Couldn't create the Notifier: the Skypane Notifier driver isn't on the hub yet."
        } else if (msg.toLowerCase().contains("network id") || msg.toLowerCase().contains("already exists")) {
            state.notifierError = "dni"
            state.lastResult = "Couldn't create the Notifier: another device already has the network id ${dni} (${msg}). Delete that device, or pick it under Skypane Notifier above."
        } else {
            state.notifierError = "child"
            state.lastResult = "Couldn't create the Notifier: ${kind}: ${msg}"
        }
        log.warn "Skypane Helper: ${state.lastResult}"
        return false
    }
}

// ---------- "Update the driver" / the app itself / (v3.0.7) the Notifier with its driver ----------
def doRequest(Map r) {
    String what = r.what
    // (v3.0.5) nothing is done for an offer that isn't signed with this link's key
    if (!offerSigned(r)) { log.warn "Skypane Helper: an update offer with a wrong signature was ignored"; sendResult(r.id, what, false, "badRequest", null); return }
    // (v3.0.7) the Notifier: made at once when its driver is there; else the driver code first (below, then made)
    if (what == "notifier" && makeNotifier()) { sendResult(r.id, what, true, null, null); return }
    // (v3.0.7 review) the driver is there but the device can't be made (its network id taken, or another error): say so
    if (what == "notifier" && state.notifierError in ["dni", "child"]) { sendResult(r.id, what, false, state.notifierError as String, null); return }
    String path = r.path, sha = r.sha256
    String want = what == "app" ? "/hubitat/SkypaneHelper.groovy" : "/hubitat/SkypaneNotifier.groovy"
    if (!(path in ["/hubitat/SkypaneNotifier.groovy", "/hubitat/SkypaneHelper.groovy"]) || path != want || !(sha ==~ /^[0-9a-f]{64}$/)) {
        sendResult(r.id, what, false, what == "notifier" ? "notfound" : "badRequest", null); return
    }
    // (v3.0.5) downloaded without blocking the hub (asynchttpGet); codeDone checks it and saves it
    asynchttpGet("codeDone", [uri: base(), path: path, contentType: "text/plain", timeout: 60],
                 [id: r.id, what: what, path: path, sha256: sha, version: r.version])
}

def codeDone(resp, Map r) {
    String what = r.what, path = r.path, sha = r.sha256, version = r.version
    String code = null
    try { code = resp.status == 200 ? (resp.getData() as String) : null } catch (e) { code = null }
    if (!code) { sendResult(r.id, what, false, "download", null); return }
    if (sha256(code) != sha) { sendResult(r.id, what, false, "sha", null); return }
    // (v3.0.5) and it is the code expected: namespace "skypane", the Notifier driver's or this app's name
    if (!declares(code, what)) { log.warn "Skypane Helper: the downloaded ${what} isn't the Skypane code expected; not saved"; sendResult(r.id, what, false, "badRequest", null); return }
    String cookie = ""
    if (settings.hubUser) {
        cookie = hubLogin()
        if (cookie == null) { sendResult(r.id, what, false, "login", null); return }
    }
    boolean ok = what == "app" ? saveApp(code, cookie) : saveDriver(code, cookie)
    if (ok && what == "notifier") {   // (v3.0.7) the driver is there now: the Notifier device
        if (makeNotifier()) sendResult(r.id, what, true, null, version)
        else sendResult(r.id, what, false, state.notifierError in ["dni", "child"] ? state.notifierError as String : "notfound", null)
        return
    }
    if (ok) {
        state.remove("manual")
        state.lastResult = "${what == 'app' ? 'Skypane Helper' : 'Skypane Notifier driver'} ${version} saved on ${new Date()}"
        sendResult(r.id, what, true, null, version)
    } else {
        state.manual = path
        state.lastResult = "Saving ${what == 'app' ? 'the app' : 'the driver'} failed on ${new Date()}"
        // (v3.0.7) a hub with Hub Login Security and no login typed refuses the save: say "login", not "endpoint"
        sendResult(r.id, what, false, !settings.hubUser && state.secured ? "login" : "endpoint", null)
    }
}

private void sendResult(String id, String what, boolean ok, String error, String version) {
    if (!base() || !state.token) return
    // (v3.0.7 review) detail: the hub's own words for a failed Notifier device (no secret in them)
    String detail = !ok && error in ["dni", "child"] ? ((state.lastResult ?: "") as String).take(160) : null
    asynchttpPost("reportDone", [uri: base(), path: "/api/hubitat/helper/result", headers: auth(), requestContentType: "application/json",
                                 contentType: "application/json", body: JsonOutput.toJson([id: id, what: what, ok: ok, error: error, version: version, detail: detail]), timeout: 20])
    runIn(30, "report")
}

private String sha256(String s) {
    MessageDigest md = MessageDigest.getInstance("SHA-256")
    return md.digest(s.getBytes("UTF-8")).encodeHex().toString()
}

// The hub's own login (Hub Login Security) — only to 127.0.0.1. Returns the session cookie, or null when refused.
private String hubLogin() {
    String cookie = null
    try {
        // (v3.0.5) a form post, as the hub's login page sends it; no session cookie back counts as a failed login
        httpPost([uri: HUB, path: "/login", query: [loginRedirect: "/"], requestContentType: "application/x-www-form-urlencoded",
                  body: [username: settings.hubUser, password: settings.hubPass, submit: "Login"],
                  textParser: true, ignoreSSLIssues: true, timeout: 20]) { resp ->
            String page = resp?.data?.text ?: ""
            String got = resp?.headers?."Set-Cookie"?.split(";")?.getAt(0)
            if (!page.contains("The login information you supplied was incorrect") && got) cookie = got
        }
    } catch (e) { cookie = null }
    return cookie
}
private Map hdr(String cookie) { cookie ? [Cookie: cookie] : [:] }

private boolean saveDriver(String code, String cookie) {
    String id = notifierDriverId(cookie)
    if (id == null) return false
    return id ? saveCode("/driver/ajax/code", "/driver/ajax/update", id, code, cookie) : createDriver(code, cookie)
}

// (v3.0.7 review) The Notifier driver's id on this hub: "" when it isn't there, null when no list could be read. The
// hub's user driver list (/hub2/userDeviceTypes) first, the older /device/drivers when that one can't be read.
private String notifierDriverId(String cookie) {
    String id = null
    boolean read = false
    try {
        httpGet([uri: HUB, path: "/hub2/userDeviceTypes", headers: hdr(cookie), timeout: 30, ignoreSSLIssues: true]) { resp ->
            if (resp?.status == 200 && resp?.data instanceof List) {
                read = true
                def d = resp.data.find { it.namespace == "skypane" && it.name == "Skypane Notifier" }
                if (d) id = d.id as String
            }
        }
    } catch (e) { read = false }
    if (read) return id ?: ""
    try {
        httpGet([uri: "${HUB}/device/drivers", headers: hdr(cookie), timeout: 30, ignoreSSLIssues: true]) { resp ->
            if (resp?.data?.drivers instanceof List) {
                read = true
                def d = resp.data.drivers.find { it.type == "usr" && it.namespace == "skypane" && it.name == "Skypane Notifier" }
                if (d) id = d.id as String
            }
        }
    } catch (e) { read = false }
    return read ? (id ?: "") : null
}

private boolean saveApp(String code, String cookie) {
    String id = null
    try {
        httpGet([uri: "${HUB}/hub2/userAppTypes", headers: hdr(cookie), timeout: 30, ignoreSSLIssues: true]) { resp ->
            def a = resp?.data?.find { it.namespace == "skypane" && it.name == "Skypane Helper" }
            if (a) id = a.id as String
        }
    } catch (e) { return false }
    return id ? saveCode("/app/ajax/code", "/app/ajax/update", id, code, cookie) : false
}

// The same steps as Hubitat Package Manager: the code's current version number, then the update with it.
private boolean saveCode(String codePath, String updatePath, String id, String code, String cookie) {
    def version = null
    boolean ok = false
    try {
        httpGet([uri: HUB, path: codePath, query: [id: id], headers: hdr(cookie), timeout: 30, ignoreSSLIssues: true]) { resp -> version = resp?.data?.version }
        if (version == null) return false
        httpPost([uri: HUB, path: updatePath, requestContentType: "application/x-www-form-urlencoded", headers: hdr(cookie),
                  body: [id: id, version: version, source: code], timeout: 300, ignoreSSLIssues: true]) { resp -> ok = resp?.data?.status == "success" }
    } catch (e) { ok = false }
    return ok
}

private boolean createDriver(String code, String cookie) {
    boolean ok = false
    try {
        httpPost([uri: HUB, path: "/driver/save", requestContentType: "application/x-www-form-urlencoded", headers: hdr(cookie),
                  body: [id: "", version: "", create: "", source: code], timeout: 300, ignoreSSLIssues: true]) { resp ->
            ok = resp?.headers?."Location" ? true : false
        }
    } catch (e) { ok = false }
    return ok
}

private boolean newer(String a, String b) {
    if (!(a ==~ /^\d{1,4}(\.\d{1,4}){0,3}$/)) return false
    List x = a.tokenize(".").collect { it as Integer }, y = b.tokenize(".").collect { it as Integer }
    for (int i = 0; i < Math.max(x.size(), y.size()); i++) {
        int p = i < x.size() ? x[i] : 0, q = i < y.size() ? y[i] : 0
        if (p != q) return p > q
    }
    return false
}

// ---------- (v3.0.7) the local endpoint (Maker API's paths and JSON; the access token is checked by the hub) ----------
private renderJson(Object body, Integer status = 200) {
    render contentType: "application/json", data: JsonOutput.toJson(body), status: status
}

private findDevice(id) {
    String want = id as String
    return allDevices().find { (it.id as String) == want }
}

// One device as Maker API's devices/all has it: attributes as {name: value}
private Map deviceJson(d) {
    Map attrs = [:]
    try { d.getSupportedAttributes()?.each { a -> attrs[a.name] = d.currentValue(a.name) } } catch (e) { }
    return [id: d.id as String, name: d.name, label: d.displayName, type: d.typeName, room: roomOf(d),
            attributes: attrs, capabilities: capsOf(d), commands: cmdsOf(d)]
}
private String roomOf(d) {
    try { return d.getRoomName() as String } catch (e) { return null }
}
private List capsOf(d) {
    try { return d.getCapabilities()?.collect { it.name }?.unique() ?: [] } catch (e) { return [] }
}
private List cmdsOf(d) {
    try { return d.getSupportedCommands()?.collect { it.name }?.unique() ?: [] } catch (e) { return [] }
}

def apiList() {
    renderJson(allDevices().collect { d -> [id: d.id as String, name: d.name, label: d.displayName, type: d.typeName] })
}

def apiAll() {
    renderJson(allDevices().collect { deviceJson(it) })
}

// One device as Maker API's devices/<id> has it: attributes as [{name, currentValue, dataType}]
def apiDevice() {
    def d = findDevice(params.id)
    if (!d) return renderJson([error: "not-found"], 404)
    List attrs = []
    try { attrs = d.getSupportedAttributes()?.collect { a -> [name: a.name, currentValue: d.currentValue(a.name), dataType: a.dataType as String] } ?: [] } catch (e) { }
    renderJson([id: d.id as String, name: d.name, label: d.displayName, type: d.typeName, room: roomOf(d),
                attributes: attrs, capabilities: capsOf(d), commands: cmdsOf(d)])
}

// A command the device lists, with its values: one JSON map ({"hue":…}) only for setColor or a command whose first
// value is a COLOR_MAP / JSON_OBJECT (v3.0.7 review: any other text is passed as it is, even one starting with "{"),
// else split on commas into at most as many values as the command declares (the last one keeps its commas); NUMBER
// values become numbers.
def apiCommand() {
    def d = findDevice(params.id)
    if (!d) return renderJson([error: "not-found"], 404)
    String c = params.command as String
    def cmd = null
    try { cmd = d.getSupportedCommands()?.find { it.name == c } } catch (e) { }
    if (!cmd) return renderJson([error: "no-command"], 404)
    // (v3.0.7 review) never through the endpoint: this app's own commands, configure, the lock codes
    if (c.startsWith("helper") || c in BLOCKED_COMMANDS) return renderJson([error: "blocked"], 403)
    List args = argsFor(cmd, params.secondary as String)
    try {
        if (args) d."$c"(*args)
        else d."$c"()
    } catch (e) {
        log.warn "Skypane Helper: ${c} on ${d} failed: ${e?.message?.take(80)}"
        return renderJson([error: "failed"], 500)
    }
    if (logEnable) log.debug "endpoint: ${c} on ${d}"
    renderJson([ok: true, id: d.id as String, command: c])
}

private List argsFor(cmd, String sec) {
    if (sec == null || sec == "") return []
    List types = []
    try { types = cmd.parameters?.collect { (it?.type ?: "") as String } ?: [] } catch (e) { }
    String first = types ? ((types[0] ?: "") as String).toUpperCase() : ""
    if (cmd.name == "setColor" || first in ["COLOR_MAP", "JSON_OBJECT"]) {   // (v3.0.7 review) only then JSON
        try { return [parseJson(sec)] } catch (e) { return [sec] }
    }
    List parts = types.size() == 1 ? [sec] : (types.size() > 1 ? sec.split(",", types.size()) as List : sec.split(",") as List)
    List out = []
    parts.eachWithIndex { p, i ->
        String t = i < types.size() ? (types[i] ?: "").toUpperCase() : ""
        boolean num = t in ["NUMBER", "INTEGER", "DECIMAL"] || (t == "" && p ==~ /^-?\d+(\.\d+)?$/)
        if (num && p ==~ /^-?\d+$/) out << (p as Integer)
        else if (num && p ==~ /^-?\d*\.\d+$/) out << (p as BigDecimal)
        else out << p
    }
    return out
}

def apiModes() {
    def cur = location.currentMode
    renderJson(location.modes?.collect { m -> [id: m.id as Long, name: m.name, active: cur?.id == m.id] } ?: [])
}

def apiSetMode() {
    def m = location.modes?.find { (it.id as String) == (params.id as String) }
    if (!m) return renderJson([error: "not-found"], 404)
    setLocationMode(m.name)
    renderJson([ok: true, mode: m.name])
}

def apiHsm() {
    renderJson([hsm: location.hsmStatus])
}

def apiSetHsm() {
    String v = params.value as String
    if (!(v in HSM_ACTIONS)) return renderJson([error: "bad-action"], 400)
    sendLocationEvent(name: "hsmSetArm", value: v)
    renderJson([hsm: v])
}

def apiPing() {
    renderJson([ok: true, version: APP_VERSION, devices: allDevices().size()])
}
