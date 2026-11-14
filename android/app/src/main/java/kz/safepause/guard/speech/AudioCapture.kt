package kz.safepause.guard.speech

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlin.concurrent.thread
import kotlin.math.sqrt

/** 16 kHz mono PCM16 microphone capture on a background thread, 100 ms chunks. */
class AudioCapture {
    @Volatile private var running = false
    private var worker: Thread? = null

    /**
     * [prepare] runs first on the audio thread (load the recognisers there, not on the main thread);
     * returning false aborts. [onError] reports a microphone that cannot be opened or stops delivering;
     * [onStopped] runs on the audio thread after the last chunk, so native resources can be freed safely.
     */
    @SuppressLint("MissingPermission") // callers check RECORD_AUDIO before starting
    fun start(
        prepare: () -> Boolean = { true },
        onError: () -> Unit = {},
        onStopped: () -> Unit = {},
        onChunk: (ShortArray, Int) -> Unit,
    ) {
        if (running) return
        running = true
        worker = thread(name = "safepause-audio") {
            var rec: AudioRecord? = null
            try {
                if (!prepare()) return@thread
                val rate = 16000
                val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                rec = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, rate,
                    AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min * 2, rate))
                if (rec.state != AudioRecord.STATE_INITIALIZED) { onError(); return@thread }
                val buf = ShortArray(rate / 10)
                rec.startRecording()
                while (running) {
                    val n = rec.read(buf, 0, buf.size)
                    if (n < 0) { onError(); break }      // e.g. ERROR_DEAD_OBJECT: stop instead of spinning
                    if (n > 0) onChunk(buf, n)
                }
            } catch (e: Exception) {
                onError()
            } finally {
                rec?.let { r -> runCatching { r.stop() }; r.release() }
                running = false
                onStopped()
            }
        }
    }

    fun stop() { running = false; worker = null }

    companion object {
        fun rms(pcm: ShortArray, n: Int): Double {
            if (n <= 0) return 0.0
            var sum = 0.0
            for (i in 0 until n) sum += pcm[i].toDouble() * pcm[i]
            return sqrt(sum / n)
        }
    }
}
