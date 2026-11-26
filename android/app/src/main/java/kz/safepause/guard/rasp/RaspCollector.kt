package kz.safepause.guard.rasp

import android.app.AppOpsManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import java.io.File

/**
 * Reads [DeviceFacts] from Android. Package visibility (Android 11+): the manifest's <queries> lists the remote-control
 * and root packages, so only those can be seen; overlay permission is checked for the same packages via AppOps.
 */
object RaspCollector {
    fun facts(ctx: Context): DeviceFacts {
        val pm = ctx.packageManager
        val watched = REMOTE_APPS.keys + ROOT_APPS
        val installed = watched.filter { pkg ->
            runCatching { pm.getPackageInfo(pkg, 0); true }.getOrDefault(false)
        }.toSet()
        val a11y = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
            ?.split(':')?.filter { it.isNotBlank() } ?: emptyList()
        return DeviceFacts(
            buildTags = Build.TAGS ?: "", fingerprint = Build.FINGERPRINT ?: "", model = Build.MODEL ?: "",
            product = Build.PRODUCT ?: "", hardware = Build.HARDWARE ?: "",
            suPaths = SU_PATHS.filter { File(it).exists() }, installed = installed, accessibility = a11y,
            overlayApps = installed.filter { canDrawOverlays(ctx, pm, it) }, selfPackage = ctx.packageName,
        )
    }

    fun report(ctx: Context): RaspReport = assess(facts(ctx))

    private fun canDrawOverlays(ctx: Context, pm: PackageManager, pkg: String): Boolean = runCatching {
        val uid = pm.getApplicationInfo(pkg, 0).uid
        val ops = ctx.getSystemService(AppOpsManager::class.java)
        @Suppress("DEPRECATION")
        val mode = if (Build.VERSION.SDK_INT >= 29) ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_SYSTEM_ALERT_WINDOW, uid, pkg)
        else ops.checkOpNoThrow(AppOpsManager.OPSTR_SYSTEM_ALERT_WINDOW, uid, pkg)
        mode == AppOpsManager.MODE_ALLOWED && uid != Process.myUid()
    }.getOrDefault(false)
}
