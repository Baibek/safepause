package kz.safepause.guard.speech

import kz.safepause.detector.Phrase
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File

/** Runs a Kazakh and a Russian recogniser on the same 16 kHz mono stream; speakers mix the two. */
class DualRecognizer(kkDir: File, ruDir: File) {
    private val models = listOf("kk" to Model(kkDir.absolutePath), "ru" to Model(ruDir.absolutePath))
    private val recognizers = models.map { (lang, m) -> lang to Recognizer(m, 16000f) }

    fun accept(pcm: ShortArray, n: Int): List<Phrase> {
        val now = System.currentTimeMillis()
        return recognizers.mapNotNull { (lang, r) ->
            if (r.acceptWaveForm(pcm, n)) {
                JSONObject(r.result).optString("text").takeIf { it.isNotBlank() }?.let { Phrase(it, now, lang) }
            } else null
        }
    }

    /** The longer of the two live partial guesses, for display only. */
    fun partial(): String = recognizers.map { (_, r) -> JSONObject(r.partialResult).optString("partial") }
        .maxByOrNull { it.length } ?: ""

    fun close() {
        recognizers.forEach { it.second.close() }
        models.forEach { it.second.close() }
    }
}
