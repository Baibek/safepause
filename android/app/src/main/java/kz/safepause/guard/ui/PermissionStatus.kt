package kz.safepause.guard.ui

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import kz.safepause.guard.access.GuardAccessibilityService

/** What the protection needs, each true when granted. Keys match Strings "perm_<key>". */
class PermissionStatus(private val ctx: Context) {
    fun granted(p: String) = ctx.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED

    fun accessibilityOn(): Boolean {
        val me = ComponentName(ctx, GuardAccessibilityService::class.java).flattenToString()
        val enabled = Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
        return enabled.split(':').any { it.equals(me, ignoreCase = true) }
    }

    fun all(): Map<String, Boolean> = linkedMapOf(
        "mic" to granted(Manifest.permission.RECORD_AUDIO),
        "phone" to granted(Manifest.permission.READ_PHONE_STATE),
        "notif" to (Build.VERSION.SDK_INT < 33 || granted(Manifest.permission.POST_NOTIFICATIONS)),
        "access" to accessibilityOn(),
    )
}
