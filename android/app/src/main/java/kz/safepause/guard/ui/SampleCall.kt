package kz.safepause.guard.ui

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import kz.safepause.guard.call.CallBus
import kz.safepause.guard.call.CallInfo
import kz.safepause.guard.call.CallKind
import kz.safepause.guard.call.ListenService
import java.util.Locale

/**
 * Plays a scam call script through the loudspeaker with the phone's TextToSpeech while listening runs,
 * so the protection can be shown without a real scammer. The client starting it is the consent.
 */
object SampleCall {
    private val SCRIPT = listOf(
        "Здравствуйте, вас беспокоит служба безопасности банка.",
        "По вашей карте сейчас зафиксирована подозрительная операция на двести тысяч тенге.",
        "Чтобы сохранить деньги, их нужно срочно перевести на безопасный счёт банка.",
        "Никому не говорите об этом разговоре и не кладите трубку.",
    )
    private var tts: TextToSpeech? = null

    fun running() = CallBus.call.value?.kind == CallKind.SAMPLE

    /** Starts the sample, or returns why it cannot (missing microphone permission or models). */
    fun start(ctx: Context): kz.safepause.guard.call.Problem? {
        if (CallBus.call.value != null) return null
        val app = ctx.applicationContext
        kz.safepause.guard.call.listenBlocker(app)?.let { return it }
        CallBus.start(CallInfo(CallKind.SAMPLE, null, System.currentTimeMillis()))
        ListenService.start(app)
        tts = TextToSpeech(app) { status ->
            val t = tts ?: return@TextToSpeech
            if (status != TextToSpeech.SUCCESS) { stop(); return@TextToSpeech }
            t.language = Locale("ru", "RU")
            t.setSpeechRate(0.9f)
            t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(id: String?) = Unit
                override fun onDone(id: String?) { if (id == "last") android.os.Handler(app.mainLooper).postDelayed({ stop() }, 3000) }
                @Deprecated("Deprecated in Java") override fun onError(id: String?) = stop()
            })
            // give the recognisers a moment to load before speaking
            t.playSilentUtterance(2500, TextToSpeech.QUEUE_FLUSH, "lead")
            SCRIPT.forEachIndexed { i, line ->
                t.speak(line, TextToSpeech.QUEUE_ADD, null, if (i == SCRIPT.lastIndex) "last" else "l$i")
                t.playSilentUtterance(1200, TextToSpeech.QUEUE_ADD, "gap$i")
            }
        }
        return null
    }

    fun stop() {
        tts?.stop(); tts?.shutdown(); tts = null
        if (running()) CallBus.end()
    }
}
