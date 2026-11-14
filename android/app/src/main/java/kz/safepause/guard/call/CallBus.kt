package kz.safepause.guard.call

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kz.safepause.detector.Assessment
import kz.safepause.detector.Phrase

enum class CallKind { CELLULAR, WHATSAPP, SAMPLE }

data class CallInfo(val kind: CallKind, val number: String?, val startedAt: Long)

enum class Problem { NONE, MIC_SILENT, MODELS_MISSING, NO_MIC_PERMISSION }

/** Process-wide state of the current call, shared by the accessibility service, overlay and listener. */
object CallBus {
    val call = MutableStateFlow<CallInfo?>(null)
    val listening = MutableStateFlow(false)
    val assessment = MutableStateFlow<Assessment?>(null)
    val transcript = MutableStateFlow<List<Phrase>>(emptyList())
    val partial = MutableStateFlow("")
    val problem = MutableStateFlow(Problem.NONE)
    /** Extra reasons from the Claude second opinion (filled by CallAnalyst when a key is set). */
    val llmReasons = MutableStateFlow<List<String>>(emptyList())

    /** Face check: the instruction currently shown (a Step name) and the final result. */
    val videoStep = MutableStateFlow<kz.safepause.detector.Step?>(null)
    val videoResult = MutableStateFlow<Pair<kz.safepause.detector.VideoOutcome, List<kz.safepause.detector.VideoSignal>>?>(null)

    /** Manual face check: a step index (0..3 = Step.entries) or a question index (4.. = ManualQuestion.entries), plus answers. */
    data class Manual(val index: Int, val answers: Map<kz.safepause.detector.ManualQuestion, Boolean>)
    val manual = MutableStateFlow<Manual?>(null)

    private val endListeners = mutableListOf<(CallInfo, Assessment?, List<Phrase>) -> Unit>()

    fun onCallEnded(cb: (CallInfo, Assessment?, List<Phrase>) -> Unit) { synchronized(endListeners) { endListeners += cb } }

    fun start(info: CallInfo) {
        if (call.value != null) return
        assessment.value = null; transcript.value = emptyList(); partial.value = ""; problem.value = Problem.NONE; llmReasons.value = emptyList()
        videoStep.value = null; videoResult.value = null; manual.value = null
        call.value = info
    }

    fun end() {
        val info = call.value ?: return
        val a = assessment.value
        val t = transcript.value
        call.value = null
        listening.value = false
        synchronized(endListeners) { endListeners.toList() }.forEach { it(info, a, t) }
    }

    val callState: StateFlow<CallInfo?> get() = call
}
