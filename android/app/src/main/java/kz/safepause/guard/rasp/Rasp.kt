package kz.safepause.guard.rasp

/**
 * Runtime self-protection (RASP): what this phone says about itself before a transfer.
 * Pure logic over [DeviceFacts] so it is testable on the JVM; [RaspCollector] reads the facts from Android.
 * Signals go to the bank's transfer check as `rooted` and `remote_app` (see SafePauseSdk).
 */
data class DeviceFacts(
    val buildTags: String = "",
    val fingerprint: String = "",
    val model: String = "",
    val product: String = "",
    val hardware: String = "",
    val suPaths: List<String> = emptyList(),
    val installed: Set<String> = emptySet(),
    /** Enabled accessibility services as "package/class" (Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES). */
    val accessibility: List<String> = emptyList(),
    /** Apps allowed to draw over other apps. */
    val overlayApps: List<String> = emptyList(),
    val selfPackage: String = "kz.safepause.guard",
)

data class Finding(val key: String, val kk: String, val ru: String)

data class RaspReport(
    val rooted: Boolean,
    val emulator: Boolean,
    val remoteApps: List<String>,
    val remoteActive: Boolean,
    val overlayApps: List<String>,
    val findings: List<Finding>,
) {
    val remoteAccess get() = remoteApps.isNotEmpty()

    /** Fields of the bank API's `signals` object. */
    fun signals(): Map<String, Boolean> = mapOf("rooted" to (rooted || emulator), "remote_app" to (remoteActive || remoteAccess))
}

/** Remote-control apps scammers ask victims to install: package -> name. */
val REMOTE_APPS = mapOf(
    "com.anydesk.anydeskandroid" to "AnyDesk",
    "com.carriez.flutter_hbb" to "RustDesk",
    "com.teamviewer.quicksupport.market" to "TeamViewer QuickSupport",
    "com.teamviewer.host.market" to "TeamViewer Host",
    "com.sand.airdroid" to "AirDroid",
    "com.sand.airmirror" to "AirMirror",
    "com.rsupport.mvagent" to "RemoteCall",
)
val ROOT_APPS = setOf("com.topjohnwu.magisk", "eu.chainfire.supersu", "com.noshufou.android.su", "com.koushikdutta.superuser", "me.weishu.kernelsu")
val SU_PATHS = listOf("/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/sbin/su", "/vendor/bin/su", "/data/local/xbin/su", "/data/local/bin/su", "/su/bin/su")

fun assess(f: DeviceFacts): RaspReport {
    val rooted = "test-keys" in f.buildTags || f.suPaths.isNotEmpty() || f.installed.any { it in ROOT_APPS }
    val fp = f.fingerprint.lowercase()
    val emulator = fp.startsWith("generic") || "sdk_gphone" in fp || fp.contains("/emu") || "emulator" in f.model.lowercase() ||
        f.model.startsWith("Android SDK built for") || f.hardware in setOf("goldfish", "ranchu", "vbox86") || f.product.startsWith("sdk")
    val remote = f.installed.filter { it in REMOTE_APPS }
    val a11yPackages = f.accessibility.map { it.substringBefore('/') }
    val remoteActive = remote.any { it in a11yPackages }
    val overlay = f.overlayApps.filter { it != f.selfPackage && it !in REMOTE_APPS }
    val findings = buildList {
        if (rooted) add(Finding("rooted", "Телефонда root-құқық бар: қорғаныс әлсіз", "На телефоне есть root-доступ: защита ослаблена"))
        if (emulator) add(Finding("emulator", "Қосымша эмуляторда іске қосылған", "Приложение запущено в эмуляторе"))
        if (remoteActive) add(Finding("remote_active", "Қашықтан басқару қосулы: біреу телефоныңызды басқара алады", "Включено удалённое управление: кто-то может управлять телефоном"))
        else if (remote.isNotEmpty()) add(Finding("remote_installed", "Қашықтан басқару қосымшасы орнатылған: ${remote.joinToString { REMOTE_APPS.getValue(it) }}", "Установлено приложение удалённого доступа: ${remote.joinToString { REMOTE_APPS.getValue(it) }}"))
        if (overlay.isNotEmpty()) add(Finding("overlay", "Басқа қосымшалардың үстіне шыға алатын қосымша бар", "Есть приложение, которое может рисовать поверх других"))
    }
    return RaspReport(rooted, emulator, remote.map { REMOTE_APPS.getValue(it) }, remoteActive, overlay, findings)
}
