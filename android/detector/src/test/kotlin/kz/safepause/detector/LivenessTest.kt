package kz.safepause.detector

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class LivenessTest {
    private fun samples(
        left: Float = -40f, right: Float = 40f,
        handFaceFound: List<Boolean> = listOf(true, false, false, true),
        handArea: Float = 0.2f,
    ): List<FaceSample> {
        var t = 0L
        fun s(step: Step, found: Boolean, yaw: Float?, area: Float?) = FaceSample(t.also { t += 250 }, step, found, yaw, area)
        return listOf(0f, left / 2, left).map { s(Step.TURN_LEFT, true, it, 0.2f) } +
            listOf(0f, right / 2, right).map { s(Step.TURN_RIGHT, true, it, 0.2f) } +
            handFaceFound.map { s(Step.HAND_OVER_FACE, it, if (it) 0f else null, if (it) handArea else null) } +
            listOf(0.2f, 0.3f, 0.4f).map { s(Step.CLOSER, true, 0f, it) }
    }

    @Test fun blackFramesGiveNoImage() =
        assertEquals(VideoOutcome.NO_IMAGE, judge(samples(), blackFrames = true, visionFlags = emptyList()).first)

    @Test fun noYawBeyond25DegreesIsDidNotCooperate() {
        val (outcome, signals) = judge(samples(left = -10f, right = 12f), false, emptyList())
        assertEquals(VideoOutcome.DID_NOT_COOPERATE, outcome)
        assertTrue(signals.any { it.id == "no_head_turn" })
    }

    @Test fun faceNeverCoveredIsDidNotCooperate() {
        // a caller who did not pass a hand looks the same as an overlay that ignores the hand: not a verdict
        val (outcome, signals) = judge(samples(handFaceFound = listOf(true, true, true, true)), false, emptyList())
        assertEquals(VideoOutcome.DID_NOT_COOPERATE, outcome)
        assertTrue(signals.any { it.id == "hand_no_occlusion" })
    }

    @Test fun smallSelfViewFaceDuringHandPassCountsAsCovered() {
        // WhatsApp's own small self-view stays visible when the caller covers their face
        val (outcome, _) = judge(samples(handFaceFound = listOf(true, true, true, true), handArea = 0.02f), false, emptyList())
        assertEquals(VideoOutcome.LOOKS_NORMAL, outcome)
    }

    @Test fun goodTurnsAndOcclusionLooksNormal() {
        val (outcome, signals) = judge(samples(), false, emptyList())
        assertEquals(VideoOutcome.LOOKS_NORMAL, outcome)
        assertTrue(signals.isEmpty(), signals.toString())
    }

    @Test fun visionFlagMakesSuspicious() {
        val (outcome, signals) = judge(samples(), false, listOf("edge_flicker"))
        assertEquals(VideoOutcome.SUSPICIOUS, outcome)
        assertTrue(signals.any { it.id == "edge_flicker" })
    }

    @Test fun noFaceAtAllIsDidNotCooperate() {
        val none = samples().map { it.copy(faceFound = false, yaw = null, boxArea = null) }
        assertEquals(VideoOutcome.DID_NOT_COOPERATE, judge(none, false, emptyList()).first)
    }

    @Test fun unknownVisionFlagIsIgnored() =
        assertEquals(VideoOutcome.LOOKS_NORMAL, judge(samples(), false, listOf("looks_fake_100_percent")).first)

    @Test fun parseVisionFlagsKeepsOnlyVocabulary() =
        assertEquals(listOf("edge_flicker", "skin_mismatch"),
            parseVisionFlags("```json\n[\"edge_flicker\", \"skin_mismatch\", \"weird\"]\n```"))
}
