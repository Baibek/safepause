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

    @SuppressLint("MissingPermission") // callers check RECORD_AUDIO before starting
    fun start(onChunk: (ShortArray, Int) -> Unit) {
        if (running) return
        running = true
        worker = thread(name = "safepause-audio") {
            val rate = 16000
            val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val rec = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, rate,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(min * 2, rate))
            val buf = ShortArray(rate / 10)
            try {
                rec.startRecording()
                while (running) {
                    val n = rec.read(buf, 0, buf.size)
                    if (n > 0) onChunk(buf, n)
                }
            } finally {
                rec.stop(); rec.release()
            }
        }
    }

    fun stop() { running = false; worker?.join(1000); worker = null }

    companion object {
        fun rms(pcm: ShortArray, n: Int): Double {
            if (n <= 0) return 0.0
            var sum = 0.0
            for (i in 0 until n) sum += pcm[i].toDouble() * pcm[i]
            return sqrt(sum / n)
        }
    }
}
