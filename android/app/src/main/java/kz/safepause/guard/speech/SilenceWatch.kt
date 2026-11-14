package kz.safepause.guard.speech

/**
 * Reports, once, that the microphone delivered nothing but silence for [windowMs] since the first
 * sample. During a call that means the phone is muting this app (accessibility service off, or an
 * OEM restriction). Any sample at or above [threshold] RMS disarms it for good.
 */
class SilenceWatch(private val windowMs: Long = 5000, private val threshold: Double = 60.0) {
    private var startMs = -1L
    private var done = false

    fun feed(rms: Double, atMs: Long): Boolean {
        if (done) return false
        if (rms >= threshold) { done = true; return false }
        if (startMs < 0) startMs = atMs
        if (atMs - startMs >= windowMs) { done = true; return true }
        return false
    }
}
