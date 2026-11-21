package kz.safepause.guard.data

import kotlinx.serialization.Serializable
import kz.safepause.detector.Assessment
import kz.safepause.detector.Level
import kz.safepause.detector.Phrase
import kz.safepause.guard.call.CallInfo
import kz.safepause.guard.call.CallKind
import java.util.UUID

/** What the app keeps about a listened call. The transcript only when the client allowed it. */
@Serializable
data class CallRecord(
    val id: String,
    val at: Long,
    val kind: CallKind,
    val number: String?,
    val level: Level,
    val reasons: List<String>,
    val transcript: List<String>?,
) {
    companion object {
        fun from(info: CallInfo, a: Assessment?, transcript: List<Phrase>, keepTranscript: Boolean, lang: String) = CallRecord(
            id = UUID.randomUUID().toString(),
            at = info.startedAt,
            kind = info.kind,
            number = info.number,
            level = a?.level ?: Level.LOW,
            reasons = a?.hits.orEmpty().map { it.rule.reason(lang) }.distinct(),
            transcript = if (keepTranscript) transcript.map { it.text } else null,
        )
    }
}
