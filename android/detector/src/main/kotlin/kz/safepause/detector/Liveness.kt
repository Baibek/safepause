package kz.safepause.detector

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.abs

/** The guided steps of the face check, in order. */
enum class Step { TURN_LEFT, TURN_RIGHT, HAND_OVER_FACE, CLOSER }

/** One analysed video frame: whether a face was found, its head yaw in degrees and box area as a share of the frame. */
data class FaceSample(val atMs: Long, val step: Step, val faceFound: Boolean, val yaw: Float?, val boxArea: Float?)

enum class VideoOutcome { LOOKS_NORMAL, SUSPICIOUS, DID_NOT_COOPERATE, NO_IMAGE }

data class VideoSignal(val id: String, val kk: String, val ru: String)

private val SIGNALS = listOf(
    VideoSignal("no_image", "Экран суреті алынбады — қолданба экранды түсіруге тыйым салған болуы мүмкін", "Не удалось получить изображение экрана — приложение могло запретить запись"),
    VideoSignal("no_face", "Кадрда бет табылмады", "Лицо в кадре не найдено"),
    VideoSignal("no_head_turn", "Басын бұрмады — бет алмастыру бас бұрылғанда бұзылады, сондықтан алаяқтар бұдан қашады", "Не повернул голову — подменённое лицо ломается при повороте, поэтому мошенники этого избегают"),
    VideoSignal("hand_no_occlusion", "Қол бетті жапқанда да бет «көрініп» тұрды — жасанды бетке тән белгі", "Лицо «видно» даже когда рука его закрывает — признак наложенного лица"),
    VideoSignal("edge_flicker", "Беттің шеті жыпылықтайды не жылжиды", "Край лица мерцает или сдвигается"),
    VideoSignal("skin_mismatch", "Бет пен мойынның түсі сәйкес емес", "Цвет лица и шеи не совпадает"),
    VideoSignal("hand_behind_face", "Қол беттің алдынан емес, артынан өткендей көрінеді", "Рука проходит как будто за лицом, а не перед ним"),
    VideoSignal("frozen_expression", "Бет әлпеті қатып қалған, ерін сөзге сай қозғалмайды", "Мимика застывшая, губы не совпадают с речью"),
    VideoSignal("blur_on_face_only", "Тек бет бұлыңғыр, қалғаны анық", "Размыто только лицо, остальное чёткое"),
).associateBy { it.id }

/** Flags Claude may return for the frames; anything else is ignored. */
val VISION_FLAGS = listOf("edge_flicker", "skin_mismatch", "hand_behind_face", "frozen_expression", "blur_on_face_only")

private const val MIN_TURN_DEGREES = 25f

/**
 * Turns measured behaviour into an outcome. Never a "deepfake %": the result lists what was seen.
 * A face that stays detected while a hand covers it, or Claude's visual flags, make it SUSPICIOUS;
 * a caller who would not turn their head (or showed no face) did not cooperate.
 */
fun judge(samples: List<FaceSample>, blackFrames: Boolean, visionFlags: List<String>): Pair<VideoOutcome, List<VideoSignal>> {
    if (blackFrames) return VideoOutcome.NO_IMAGE to listOf(SIGNALS.getValue("no_image"))
    if (samples.none { it.faceFound }) return VideoOutcome.DID_NOT_COOPERATE to listOf(SIGNALS.getValue("no_face"))

    val signals = mutableListOf<VideoSignal>()
    val yaws = samples.filter { it.step == Step.TURN_LEFT || it.step == Step.TURN_RIGHT }.mapNotNull { it.yaw }
    val turned = yaws.any { it <= -MIN_TURN_DEGREES } && yaws.any { it >= MIN_TURN_DEGREES }

    val hand = samples.filter { it.step == Step.HAND_OVER_FACE }
    if (hand.size >= 3 && hand.all { it.faceFound }) signals += SIGNALS.getValue("hand_no_occlusion")
    visionFlags.distinct().filter { it in VISION_FLAGS }.forEach { signals += SIGNALS.getValue(it) }

    return when {
        signals.isNotEmpty() -> VideoOutcome.SUSPICIOUS to (signals + listOfNotNull(if (!turned) SIGNALS.getValue("no_head_turn") else null))
        !turned -> VideoOutcome.DID_NOT_COOPERATE to listOf(SIGNALS.getValue("no_head_turn"))
        else -> VideoOutcome.LOOKS_NORMAL to emptyList()
    }
}

/** Reads a JSON array of flags from Claude's reply (bare or fenced); keeps only the known vocabulary. */
fun parseVisionFlags(text: String): List<String> {
    val a = text.indexOf('['); val b = text.lastIndexOf(']')
    if (a < 0 || b <= a) return emptyList()
    val arr = runCatching { Json.parseToJsonElement(text.substring(a, b + 1)) as? JsonArray }.getOrNull() ?: return emptyList()
    return arr.mapNotNull { runCatching { it.jsonPrimitive.content }.getOrNull() }.filter { it in VISION_FLAGS }.distinct()
}

/** Every face with |yaw| at least this far counts as turned (exposed for the capture code's step pacing). */
fun turnedEnough(yaw: Float?) = yaw != null && abs(yaw) >= MIN_TURN_DEGREES
