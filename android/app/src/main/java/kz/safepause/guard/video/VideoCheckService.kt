package kz.safepause.guard.video

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjectionManager
import android.os.IBinder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kz.safepause.guard.R
import kz.safepause.guard.ai.ApiKeyStore
import kz.safepause.guard.call.CallBus
import kz.safepause.guard.ui.Strings

/** Foreground service of type mediaProjection (required by Android to capture the screen) running one face check. */
class VideoCheckService : Service() {
    companion object {
        fun start(ctx: Context, resultCode: Int, data: Intent) = ctx.startForegroundService(
            Intent(ctx, VideoCheckService::class.java).putExtra("code", resultCode).putExtra("data", data))
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val lang = Strings.lang(this)
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("video", Strings.t("check_face", lang), NotificationManager.IMPORTANCE_LOW))
        startForeground(3, Notification.Builder(this, "video").setSmallIcon(R.drawable.ic_shield)
            .setContentTitle(Strings.t("video_checking", lang)).build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)

        val code = intent?.getIntExtra("code", Activity.RESULT_CANCELED) ?: Activity.RESULT_CANCELED
        @Suppress("DEPRECATION") val data: Intent? = intent?.getParcelableExtra("data")
        if (code != Activity.RESULT_OK || data == null) { stopSelf(); return START_NOT_STICKY }

        val projection = getSystemService(MediaProjectionManager::class.java).getMediaProjection(code, data)
        if (projection == null) { CallBus.videoResult.value = kz.safepause.detector.judge(emptyList(), true, emptyList()); stopSelf(); return START_NOT_STICKY }
        val metrics = resources.displayMetrics
        val capture = ScreenCapture(projection, metrics.widthPixels, metrics.heightPixels, metrics.densityDpi)
        val faces = FaceSignals()
        scope.launch {
            try {
                CallBus.videoResult.value = null
                val result = LivenessSession(capture::latest, faces, ApiKeyStore.client(this@VideoCheckService)) { CallBus.videoStep.value = it }.run()
                CallBus.videoResult.value = result
            } finally {
                CallBus.videoStep.value = null
                capture.close(); faces.close(); stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() { scope.cancel(); super.onDestroy() }
}
