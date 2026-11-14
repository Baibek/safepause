package kz.safepause.guard.data

import kz.safepause.detector.Assessment
import kz.safepause.detector.Phrase

/** The call that just ended, kept in memory so the summary can show its transcript even when it is not stored. */
object LastCall {
    @Volatile var record: CallRecord? = null
    @Volatile var assessment: Assessment? = null
    @Volatile var transcript: List<Phrase> = emptyList()

    fun clear() { record = null; assessment = null; transcript = emptyList() }
}
