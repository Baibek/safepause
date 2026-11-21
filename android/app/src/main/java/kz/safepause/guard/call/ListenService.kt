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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kz.safepause.guard.R
import kz.safepause.guard.ai.ApiKeyStore
import kz.safepause.guard.ai.CallAnalyst
import kz.safepause.guard.speech.AudioCapture
import kz.safepause.guard.speech.DualRecognizer
import kz.safepause.guard.speech.ModelManager
import kz.safepause.guard.speech.SilenceWatch
import kz.safepause.guard.ui.Strings

/** Microphone foreground service: audio → two recognisers → detector → CallBus. Runs only after the client's tap. */
class ListenService : Service() {
    companion object {
        private const val CHANNEL = "listen"

        fun start(ctx: Context) = ctx.startForegroundService(Intent(ctx, ListenService::class.java))
        fun stop(ctx: Context) = ctx.stopService(Intent(ctx, ListenService::class.java))
    }

    private val capture = AudioCapture()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

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
        listenBlocker(this)?.let { CallBus.problem.value = it; stopSelf(); return START_NOT_STICKY }
        try {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } catch (e: Exception) {   // Android refused while-in-use microphone access for this start
            CallBus.problem.value = Problem.NO_MIC_PERMISSION; stopSelf(); return START_NOT_STICKY
        }
        if (CallBus.listening.value) return START_NOT_STICKY

        val models = ModelManager(filesDir)
        var rec: DualRecognizer? = null
        lateinit var detector: ScamDetector
        val silence = SilenceWatch()
        val started = System.currentTimeMillis()
        var lastLevel = Level.LOW
        CallBus.listening.value = true
        val analyst = CallAnalyst(ApiKeyStore.client(this), scope, { Strings.lang(this) }) // key read lazily below
        // Claude's opinion can raise the shown level by one step; its reasons are added to the warning.
        analyst.verdict.onEach { v ->
            if (v == null) return@onEach
            CallBus.llmReasons.value = v.reasons
            val current = CallBus.assessment.value ?: return@onEach
            val merged = analyst.level(current)
            if (merged != current.level) {
                CallBus.assessment.value = current.copy(level = merged)
                if (merged == Level.HIGH && lastLevel != Level.HIGH) vibrate()
                lastLevel = merged
            }
        }.launchIn(scope)

        capture.start(
            prepare = {
                // loading two speech models takes seconds: do it here, on the audio thread, never on main
                try {
                    detector = ScamDetector(RuleSet.load())
                    rec = DualRecognizer(models.modelDir(ModelManager.MODELS[0])!!, models.modelDir(ModelManager.MODELS[1])!!)
                    true
                } catch (e: Exception) {
                    CallBus.problem.value = Problem.MODELS_MISSING; stopSelf(); false
                }
            },
            onError = { CallBus.problem.value = Problem.MIC_SILENT },
            onStopped = { rec?.close(); rec = null },
        ) { pcm, n ->
            val r = rec ?: return@start
            if (silence.feed(AudioCapture.rms(pcm, n), System.currentTimeMillis() - started)) CallBus.problem.value = Problem.MIC_SILENT
            else if (!silence.reported && CallBus.problem.value == Problem.MIC_SILENT) CallBus.problem.value = Problem.NONE
            val phrases = r.accept(pcm, n)
            CallBus.partial.value = r.partial()
            for (p in phrases) {
                CallBus.transcript.value = CallBus.transcript.value + p
                val raw = detector.add(p)
                analyst.onPhrase(raw, CallBus.transcript.value)
                val a = raw.copy(level = analyst.level(raw))
                CallBus.assessment.value = a
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
        capture.stop()          // the audio thread closes the recognisers itself after its last chunk
        scope.cancel()
        CallBus.listening.value = false
        super.onDestroy()
    }
}
