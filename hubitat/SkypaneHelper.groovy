/**
 *  Skypane Helper — a Hubitat app that helps Skypane (v3.0.5).
 *
 *  What it does:
 *    - Reports the devices you pick (like in the Maker API): each one's protocol (Zigbee, Z-Wave, Matter, LAN, an app /
 *      cloud integration, virtual), its last activity and its health status. Skypane shows them in Devices → Detailed.
 *    - Keeps the Skypane Notifier driver up to date: when an admin taps "Update the driver" in the Skypane Manager
 *      (Integrations → Hubitat), this app downloads the driver from your Skypane, checks it against the sha256 Skypane
 *      gave it, and saves it on this hub. It can update itself the same way.
 *    - Can create the Skypane Notifier device for you, and shows "Update required" on that device's page
 *      (driverStatus) when Skypane has a newer driver.
 *
 *  Install once: Apps Code → New App → Import → http://<your Skypane>/hubitat/SkypaneHelper.groovy → Save; then
 *  Apps → Add user app → Skypane Helper. Or use Hubitat Package Manager with http://<your Skypane>/hubitat/packageManifest.json.
 *
 *  How it talks to Skypane: only this app starts a connection, only to the Skypane address typed below. It links once
 *  with a one-time code from the Manager and gets a token of its own, which it sends with every request. Skypane never
 *  connects to the hub for this, and needs no hub login.
 *  (v3.0.5) The link also gives this app a key of its own (made for this link only). Skypane signs every "update" offer
 *  with it (HMAC-SHA256); this app checks the signature before it downloads anything, then checks the code's sha256
 *  and that it is the Skypane code it expects (namespace "skypane" and the right name). If Skypane answers 401 or 403,
 *  this app unlinks itself: make a new link code in the Manager and type it here again.
 *
 *  Hub Login Security: if it is on, saving code needs the hub's login. Type it below: it stays in this app's settings
 *  on this hub and is only sent to the hub itself (127.0.0.1). Skypane never sees it.
 *
 *  Saving code uses the hub's own pages (/driver/ajax/update, /app/ajax/update, /driver/save — the ones Hubitat Package
 *  Manager uses). They aren't an official API: if a hub update changes them, the app says "Update required" and shows
 *  the import address, so the code can be updated by hand.
 */
import groovy.json.JsonOutput
import groovy.transform.Field
import java.security.MessageDigest
import javax.crypto.Mac                    // (v3.0.5) the update offer's signature
import javax.crypto.spec.SecretKeySpec

@Field static final String APP_VERSION = "3.0.5"   // (v3.0.5) Skypane reads it from here (service/hubitat_helper.py)
@Field static final String HUB = "http://127.0.0.1:8080"
@Field static final Integer MAX_DEVICES = 500
@Field static final String OFFER_TAG = "skypane-helper-offer-v1"   // (v3.0.5) as service/hubitat_helper.py OFFER_TAG
// (v3.0.5) what each update must declare in its definition(): namespace "skypane" and this name
@Field static final Map CODE_NAMES = [driver: "Skypane Notifier", app: "Skypane Helper"]

definition(
    name: "Skypane Helper",
    namespace: "skypane",
    author: "Skypane",
    description: "Reports device protocols to Skypane and keeps the Skypane Notifier driver up to date.",
    category: "Convenience",
    singleInstance: true,
    iconUrl: "",
    iconX2Url: "")

preferences {
    page(name: "mainPage")
}

def mainPage() {
    dynamicPage(name: "mainPage", title: "Skypane Helper ${APP_VERSION}", install: true, uninstall: true) {
        section("Skypane") {
            input "skypaneUrl", "text", title: "Skypane address (for example http://192.168.1.50:8088)", required: true, submitOnChange: true
            if (!state.token) {
                input "linkCode", "text", title: "Link code (Skypane Manager → Integrations → Hubitat → Link the Helper)", required: false
            }
            paragraph statusText()
            if (state.token) input "unlink", "bool", title: "Unlink from Skypane (a new link code is needed after this)", defaultValue: false
        }
        section("Devices to report") {
            input "devs", "capability.*", title: "Devices", multiple: true, required: false
        }
        section("Skypane Notifier") {
            input "notifiers", "device.SkypaneNotifier", title: "Your Skypane Notifier device(s)", multiple: true, required: false
            input "createNotifier", "bool", title: "Create a Skypane Notifier device for me", defaultValue: false
            paragraph "A new Notifier must still be ticked in the Maker API app (needed for dismissing alerts on the panels)."
        }
        section("Hub login (only when Hub Login Security is on)") {
            input "hubUser", "text", title: "Hub user name", required: false
            input "hubPass", "password", title: "Hub password", required: false
            paragraph "Used only to save driver and app code on this hub. It stays on this hub; Skypane never sees it."
        }
        section("Logging") {
            input "logEnable", "bool", title: "Debug logging", defaultValue: false
        }
    }
}

def installed() { initialize() }
def updated() { initialize() }
def uninstalled() { unschedule() }

def initialize() {
    unschedule()
    if (settings.unlink) {
        state.remove("token")
        state.remove("key")   // (v3.0.5)
        app.updateSetting("unlink", [value: "false", type: "bool"])
    }
    if (!state.token && settings.linkCode) link()
    if (settings.createNotifier) makeNotifier()
    if (state.token) {
        runEvery1Minute("poll")
        runEvery15Minutes("report")
        runIn(5, "report")
        runIn(10, "poll")
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
    if (state.lastPoll) lines << "Last heard from Skypane: ${new Date(state.lastPoll as Long)}"
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
            } else state.linkError = "Skypane said no"
        }
    } catch (e) {
        state.linkError = "Skypane refused the code or can't be reached (${e?.message?.take(60)})"
    }
}

// ---------- every minute: anything to do? (and the newest versions) ----------
def poll() {
    String b = base()
    if (!b || !state.token) return
    asynchttpGet("pollDone", [uri: b, path: "/api/hubitat/helper/poll", headers: auth(), contentType: "application/json", timeout: 15])
}

def pollDone(resp, data) {
    // (v3.0.5) a 401 / 403 unlinks this app (documented in Help: make a new link code then)
    if (resp.status == 401 || resp.status == 403) { state.remove("token"); state.remove("key"); state.linkError = "Skypane unlinked this app"; unschedule(); return }
    if (resp.status != 200) { if (logEnable) log.debug "poll: ${resp.status}"; return }
    Map j
    try { j = resp.getJson() } catch (e) { return }
    state.lastPoll = now()
    state.driverLatest = j?.driver?.version
    state.appLatest = j?.app?.version
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
    if (!(key ==~ /^[A-Za-z0-9_\-]{43,100}$/) || !(sig ==~ /^[0-9a-f]{64}$/)) return false
    try {
        Mac mac = Mac.getInstance("HmacSHA256")
        mac.init(new SecretKeySpec(key.getBytes("UTF-8"), "HmacSHA256"))
        byte[] want = mac.doFinal(offerText(r).getBytes("UTF-8")).encodeHex().toString().getBytes("UTF-8")
        return MessageDigest.isEqual(want, sig.getBytes("UTF-8"))
    } catch (e) {
        log.warn "Skypane Helper: the offer's signature couldn't be checked (${e?.message?.take(60)})"
        return false
    }
}

// (v3.0.5) The downloaded code is the Skypane code expected: its definition() says namespace "skypane" and the name.
private boolean declares(String code, String what) {
    String name = CODE_NAMES[what]
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
    Map body = [v: 1, version: APP_VERSION, hub: location?.hub?.name ?: "", firmware: location?.hub?.firmwareVersionString ?: "",
                login: settings.hubUser ? true : false, manual: state.manual ? true : false,
                notifiers: allNotifiers().collect { [id: it.id as Long, version: it.currentValue("driverVersion") as String] },
                devices: list]
    asynchttpPost("reportDone", [uri: b, path: "/api/hubitat/helper/report", headers: auth(), requestContentType: "application/json",
                                 contentType: "application/json", body: JsonOutput.toJson(body), timeout: 30])
}
def reportDone(resp, data) { if (logEnable) log.debug "report: ${resp.status}" }

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

// ---------- the Notifier device ----------
private void makeNotifier() {
    app.updateSetting("createNotifier", [value: "false", type: "bool"])
    if (getChildDevices()?.size()) return
    try {
        addChildDevice("skypane", "Skypane Notifier", "skypane-notifier-${app.id}", [name: "Skypane Notifier", label: "Skypane", isComponent: false])
        state.lastResult = "Created the Skypane Notifier device. Tick it in the Maker API app."
    } catch (e) {
        state.lastResult = "Couldn't create the Notifier: save the Skypane Notifier driver first (Update the driver in the Manager)."
    }
}

// ---------- "Update the driver" / the app itself ----------
def doRequest(Map r) {
    String what = r.what
    // (v3.0.5) nothing is done for an offer that isn't signed with this link's key
    if (!offerSigned(r)) { log.warn "Skypane Helper: an update offer with a wrong signature was ignored"; sendResult(r.id, what, false, "badRequest", null); return }
    if (what == "notifier") { makeNotifier(); sendResult(r.id, what, getChildDevices()?.size() ? true : false, null, null); return }
    String path = r.path, sha = r.sha256
    String want = what == "app" ? "/hubitat/SkypaneHelper.groovy" : "/hubitat/SkypaneNotifier.groovy"
    if (!(path in ["/hubitat/SkypaneNotifier.groovy", "/hubitat/SkypaneHelper.groovy"]) || path != want || !(sha ==~ /^[0-9a-f]{64}$/)) {
        sendResult(r.id, what, false, "badRequest", null); return
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
    if (ok) {
        state.remove("manual")
        state.lastResult = "${what == 'app' ? 'Skypane Helper' : 'Skypane Notifier driver'} ${version} saved on ${new Date()}"
        sendResult(r.id, what, true, null, version)
    } else {
        state.manual = path
        state.lastResult = "Saving ${what == 'app' ? 'the app' : 'the driver'} failed on ${new Date()}"
        sendResult(r.id, what, false, "endpoint", null)
    }
}

private void sendResult(String id, String what, boolean ok, String error, String version) {
    if (!base() || !state.token) return
    asynchttpPost("reportDone", [uri: base(), path: "/api/hubitat/helper/result", headers: auth(), requestContentType: "application/json",
                                 contentType: "application/json", body: JsonOutput.toJson([id: id, what: what, ok: ok, error: error, version: version]), timeout: 20])
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
    String id = null
    try {
        httpGet([uri: "${HUB}/device/drivers", headers: hdr(cookie), timeout: 30, ignoreSSLIssues: true]) { resp ->
            def d = resp?.data?.drivers?.find { it.type == "usr" && it.namespace == "skypane" && it.name == "Skypane Notifier" }
            if (d) id = d.id as String
        }
    } catch (e) { return false }
    return id ? saveCode("/driver/ajax/code", "/driver/ajax/update", id, code, cookie) : createDriver(code, cookie)
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
