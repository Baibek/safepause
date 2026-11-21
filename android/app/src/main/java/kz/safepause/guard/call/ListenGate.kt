package kz.safepause.guard.call

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import kz.safepause.guard.speech.ModelManager

/**
 * Why listening cannot start, or null when it can. Checked before starting the microphone service:
 * on Android 14+ starting a microphone foreground service without RECORD_AUDIO crashes the app.
 */
fun listenBlocker(micGranted: Boolean, modelsReady: Boolean): Problem? = when {
    !micGranted -> Problem.NO_MIC_PERMISSION
    !modelsReady -> Problem.MODELS_MISSING
    else -> null
}

fun listenBlocker(ctx: Context): Problem? = listenBlocker(
    ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED,
    ModelManager(ctx.filesDir).ready(),
)
