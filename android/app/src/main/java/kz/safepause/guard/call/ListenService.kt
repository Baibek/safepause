package kz.safepause.guard.call

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import kz.safepause.detector.Level
import kz.safepause.detector.RuleSet
import kz.safepause.detector.ScamDetector
import kz.safepause.guard.R
import kz.safepause.guard.speech.AudioCapture
import kz.safepause.guard.speech.DualRecognizer
import kz.safepause.guard.speech.ModelManager
import kz.safepause.guard.speech.SilenceWatch
import kz.safepause.guard.ui.Strings

/** Microphone foreground service: audio → two recognisers → detector → CallBus. Runs only after the client's tap. */
class ListenService : Service() {
    companion object {
        private const val CHANNEL = "listen"
        /** Hook for the Claude second opinion (Task 6); called with every new final phrase. */
        var onPhrase: ((kz.safepause.detector.Assessment, List<kz.safepause.detector.Phrase>) -> Unit)? = null

        fun start(ctx: Context) = ctx.startForegroundService(Intent(ctx, ListenService::class.java))
        fun stop(ctx: Context) = ctx.stopService(Intent(ctx, ListenService::class.java))
    }

    private val capture = AudioCapture()
    private var recognizer: DualRecognizer? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val lang = Strings.lang(this)
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, Strings.t("notif_channel", lang), NotificationManager.IMPORTANCE_LOW))
        val notification = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_shield)
            .setContentTitle(Strings.t("listening", lang))
            .setContentText(Strings.t("notif_listening", lang))
            .setOngoing(true).build()
        startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)

        if (CallBus.listening.value) return START_NOT_STICKY
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            CallBus.problem.value = Problem.NO_MIC_PERMISSION; stopSelf(); return START_NOT_STICKY
        }
        val models = ModelManager(filesDir)
        if (!models.ready()) { CallBus.problem.value = Problem.MODELS_MISSING; stopSelf(); return START_NOT_STICKY }

        val rec = DualRecognizer(models.modelDir(ModelManager.MODELS[0])!!, models.modelDir(ModelManager.MODELS[1])!!)
        recognizer = rec
        val detector = ScamDetector(RuleSet.load())
        val silence = SilenceWatch()
        val started = System.currentTimeMillis()
        var lastLevel = Level.LOW
        CallBus.listening.value = true

        capture.start { pcm, n ->
            if (silence.feed(AudioCapture.rms(pcm, n), System.currentTimeMillis() - started)) CallBus.problem.value = Problem.MIC_SILENT
            val phrases = rec.accept(pcm, n)
            CallBus.partial.value = rec.partial()
            for (p in phrases) {
                CallBus.transcript.value = CallBus.transcript.value + p
                val a = detector.add(p)
                CallBus.assessment.value = a
                onPhrase?.invoke(a, CallBus.transcript.value)
                if (a.level == Level.HIGH && lastLevel != Level.HIGH) vibrate()
                lastLevel = a.level
            }
        }
        return START_NOT_STICKY
    }

    private fun vibrate() {
        val v = if (android.os.Build.VERSION.SDK_INT >= 31) getSystemService(VibratorManager::class.java).defaultVibrator
                else @Suppress("DEPRECATION") getSystemService(Vibrator::class.java)
        v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 400, 200, 400), -1))
    }

    override fun onDestroy() {
        capture.stop()
        recognizer?.close(); recognizer = null
        CallBus.listening.value = false
        super.onDestroy()
    }
}
