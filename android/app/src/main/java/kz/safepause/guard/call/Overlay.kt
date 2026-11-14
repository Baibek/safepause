package kz.safepause.guard.call

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kz.safepause.detector.Level
import kz.safepause.guard.ui.Strings

/**
 * The window drawn over the call screen: a consent bubble before listening, a live strip while
 * listening, a large red card when the risk becomes HIGH, and problem cards.
 * Owned by the accessibility service so it can use an accessibility overlay (no extra permission).
 */
class Overlay(private val ctx: Context, private val windowType: Int) {
    companion object { var onCheckFace: (() -> Unit)? = null }

    private val wm = ctx.getSystemService(WindowManager::class.java)
    private val am = ctx.getSystemService(AudioManager::class.java)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var job: Job? = null
    private var view: View? = null
    private var warnedAt: Int = 0      // number of hits when the warning was last dismissed/shown
    private var showWarning = false

    private val navy = Color.parseColor("#14213d")
    private val red = Color.parseColor("#c8372d")
    private val amber = Color.parseColor("#e0a526")
    private val teal = Color.parseColor("#0f4c4a")

    fun attach() {
        job = scope.launch {
            combine(
                combine(CallBus.call, CallBus.listening, CallBus.assessment, CallBus.transcript, CallBus.problem) { c, l, a, t, p -> arrayOf(c, l, a, t, p) },
                CallBus.videoStep, CallBus.videoResult,
            ) { a, b, c -> Triple(a, b, c) }.collect { render() }
        }
    }

    fun detach() { job?.cancel(); remove() }

    private fun lang() = Strings.lang(ctx)
    private fun s(key: String) = Strings.t(key, lang())

    private fun render() {
        val call = CallBus.call.value
        if (call == null) { remove(); showWarning = false; warnedAt = 0; return }
        val a = CallBus.assessment.value
        if (a?.level == Level.HIGH && a.hits.size > warnedAt && !showWarning) showWarning = true
        val content = when {
            CallBus.videoStep.value != null -> stepCard(CallBus.videoStep.value!!)
            CallBus.videoResult.value != null -> videoResultCard()
            showWarning -> warningCard()
            CallBus.problem.value != Problem.NONE -> problemCard(CallBus.problem.value)
            !CallBus.listening.value -> bubble()
            else -> strip(call)
        }
        show(content, fullWidth = content.tag != "bubble")
    }

    private fun bubble(): View = button(s("bubble"), teal) { ListenActivity.launch(ctx) }.apply { tag = "bubble" }

    private fun strip(call: CallInfo): View {
        val a = CallBus.assessment.value
        val level = a?.level ?: Level.LOW
        val color = when (level) { Level.LOW -> teal; Level.SUSPICIOUS -> amber; Level.HIGH -> red }
        return column(color).apply {
            addView(text("${s("listening")} · ${s("risk_" + level.name.lowercase())}", 15f, bold = true))
            val lines = CallBus.transcript.value.takeLast(3).joinToString("\n") { it.text }
            if (lines.isNotBlank()) addView(text(lines, 13f))
            if (call.kind == CallKind.CELLULAR && !speakerOn()) addView(text(s("speaker_hint"), 13f, bold = true))
            val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
            row.addView(button(s("stop"), navy) { ListenService.stop(ctx) })
            if (call.kind == CallKind.WHATSAPP && onCheckFace != null) row.addView(button(s("check_face"), navy) { onCheckFace?.invoke() })
            addView(row)
        }
    }

    private fun warningCard(): View {
        val a = CallBus.assessment.value
        val reasons = a?.hits?.filter { it.rule.stage.name != "AUTHORITY" || a.hits.size < 3 }
            ?.joinToString("\n") { "• " + it.rule.reason(lang()) }.orEmpty()
        return column(red).apply {
            addView(text(s("warning_title"), 22f, bold = true))
            if (reasons.isNotBlank()) addView(text(reasons, 15f))
            CallBus.llmReasons.value.takeIf { it.isNotEmpty() }?.let { addView(text(it.joinToString("\n") { r -> "• $r" }, 15f)) }
            addView(text(s("warning_advice"), 16f, bold = true))
            addView(button(s("warning_ok"), navy) {
                showWarning = false; warnedAt = CallBus.assessment.value?.hits?.size ?: 0; render()
            })
        }
    }

    private fun stepCard(step: kz.safepause.detector.Step): View = column(navy).apply {
        addView(text(s("video_checking"), 14f))
        addView(text(s("step_" + step.name), 22f, bold = true))
    }

    private fun videoResultCard(): View {
        val (outcome, signals) = CallBus.videoResult.value!!
        val bg = when (outcome) {
            kz.safepause.detector.VideoOutcome.LOOKS_NORMAL -> teal
            kz.safepause.detector.VideoOutcome.NO_IMAGE -> navy
            else -> red
        }
        return column(bg).apply {
            addView(text(s("video_" + outcome.name), 20f, bold = true))
            signals.forEach { addView(text("• " + if (lang() == "ru") it.ru else it.kk, 14f)) }
            addView(text(s("video_note"), 13f))
            addView(button(s("warning_ok"), navy) { CallBus.videoResult.value = null })
        }
    }

    private fun problemCard(p: Problem): View = column(navy).apply {
        val key = when (p) { Problem.MIC_SILENT -> "mic_silent"; Problem.MODELS_MISSING -> "models_missing"; else -> "no_mic_permission" }
        addView(text(s(key), 15f, bold = true))
        if (p == Problem.MIC_SILENT) addView(button(s("open_settings"), teal) {
            ctx.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        })
        addView(button(s("warning_ok"), teal) { CallBus.problem.value = Problem.NONE })
    }

    private fun speakerOn(): Boolean =
        if (Build.VERSION.SDK_INT >= 31) am.communicationDevice?.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
        else @Suppress("DEPRECATION") am.isSpeakerphoneOn

    // --- view helpers -------------------------------------------------------------------------

    private fun column(bg: Int) = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(36, 28, 36, 28)
        background = GradientDrawable().apply { setColor(bg); cornerRadius = 36f }
    }

    private fun text(value: String, size: Float, bold: Boolean = false) = TextView(ctx).apply {
        text = value; textSize = size; setTextColor(Color.WHITE); setPadding(0, 6, 0, 6)
        if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
    }

    private fun button(label: String, bg: Int, onClick: () -> Unit) = Button(ctx).apply {
        text = label; isAllCaps = false; setTextColor(Color.WHITE)
        background = GradientDrawable().apply { setColor(bg); cornerRadius = 28f; setStroke(2, Color.WHITE) }
        setPadding(32, 16, 32, 16)
        setOnClickListener { onClick() }
    }

    private fun show(content: View, fullWidth: Boolean) {
        remove()
        val lp = WindowManager.LayoutParams(
            if (fullWidth) WindowManager.LayoutParams.MATCH_PARENT else WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            windowType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply { gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL; y = 120; horizontalMargin = 0.03f }
        wm.addView(content, lp)
        view = content
    }

    private fun remove() { view?.let { runCatching { wm.removeView(it) } }; view = null }
}
