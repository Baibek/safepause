package kz.safepause.guard.ai

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kz.safepause.detector.Assessment
import kz.safepause.detector.Level
import kz.safepause.detector.LlmVerdict
import kz.safepause.detector.LlmVerdicts
import kz.safepause.detector.Phrase
import kz.safepause.detector.Stage
import kz.safepause.detector.merge

/**
 * Asks Claude for a second opinion when the rules hear a new stage of a scam script, or after
 * 30 s of further speech. One request at a time; 10 s timeout; any failure leaves the rules alone.
 */
class CallAnalyst(
    private val client: ClaudeClient?,
    private val scope: CoroutineScope,
    private val lang: () -> String,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    companion object {
        const val TIMEOUT_MS = 10_000L
        const val INTERVAL_MS = 30_000L
        const val WINDOW_MS = 3 * 60_000L
    }

    private val _verdict = MutableStateFlow<LlmVerdict?>(null)
    val verdict: StateFlow<LlmVerdict?> = _verdict

    private var inFlight = false
    private var lastStages: Set<Stage> = emptySet()
    private var lastAt = Long.MIN_VALUE / 2

    fun level(a: Assessment): Level = merge(a, _verdict.value)

    fun onPhrase(a: Assessment, transcript: List<Phrase>) {
        val c = client ?: return
        val now = clock()
        val newStage = !lastStages.containsAll(a.stages)
        if (inFlight || !(newStage || now - lastAt >= INTERVAL_MS)) return
        inFlight = true
        lastStages = a.stages
        lastAt = now
        val recent = transcript.filter { it.atMs >= (transcript.lastOrNull()?.atMs ?: 0) - WINDOW_MS }
        val prompt = LlmVerdicts.prompt(recent, lang())
        scope.launch {
            try {
                val reply = withTimeoutOrNull(TIMEOUT_MS) { c.complete(prompt) }
                LlmVerdicts.parse(reply ?: return@launch)?.let { _verdict.value = it }
            } finally {
                inFlight = false
            }
        }
    }
}
