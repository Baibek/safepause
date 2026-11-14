package kz.safepause.detector

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The face check when the screen cannot be captured: the client answers what they saw. */
class ManualCheckTest {
    private fun answers(distorted: Boolean = false, hand: Boolean = false, lips: Boolean = false, refused: Boolean = false) = mapOf(
        ManualQuestion.DISTORTED_ON_TURN to distorted, ManualQuestion.HAND_GLITCH to hand,
        ManualQuestion.LIPS_OUT_OF_SYNC to lips, ManualQuestion.REFUSED to refused)

    @Test fun nothingSeenLooksNormal() {
        val (o, s) = judgeManual(answers())
        assertEquals(VideoOutcome.LOOKS_NORMAL, o); assertTrue(s.isEmpty())
    }

    @Test fun glitchOnTurnIsSuspicious() {
        val (o, s) = judgeManual(answers(distorted = true))
        assertEquals(VideoOutcome.SUSPICIOUS, o); assertTrue(s.any { it.id == "edge_flicker" })
    }

    @Test fun handPassingBehindFaceIsSuspicious() =
        assertTrue(judgeManual(answers(hand = true)).second.any { it.id == "hand_behind_face" })

    @Test fun lipsOutOfSyncIsSuspicious() =
        assertTrue(judgeManual(answers(lips = true)).second.any { it.id == "frozen_expression" })

    @Test fun refusalIsDidNotCooperate() =
        assertEquals(VideoOutcome.DID_NOT_COOPERATE, judgeManual(answers(refused = true)).first)

    @Test fun refusalWithGlitchIsSuspicious() =
        assertEquals(VideoOutcome.SUSPICIOUS, judgeManual(answers(refused = true, distorted = true)).first)

    @Test fun questionsAskedInOrder() =
        assertEquals(listOf(ManualQuestion.REFUSED, ManualQuestion.DISTORTED_ON_TURN, ManualQuestion.HAND_GLITCH,
            ManualQuestion.LIPS_OUT_OF_SYNC), ManualQuestion.entries.toList())
}
