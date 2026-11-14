package kz.safepause.guard.speech

/**
 * Reports, once, that the microphone delivered digital silence for [windowMs] since the first sample.
 * A phone that mutes this app during a call (accessibility service off, or an OEM restriction) delivers
 * exact zeros; a quiet room never does, so the threshold sits just above zero. Sound arriving later
 * clears the report ([reported] turns false) so the problem card can go away.
 */
class SilenceWatch(private val windowMs: Long = 5000, private val threshold: Double = 2.0) {
    private var startMs = -1L
    private var armed = true
    var reported = false
        private set

    fun feed(rms: Double, atMs: Long): Boolean {
        if (rms >= threshold) { armed = false; reported = false; return false }
        if (!armed) return false
        if (startMs < 0) startMs = atMs
        if (atMs - startMs >= windowMs) { armed = false; reported = true; return true }
        return false
    }
}
