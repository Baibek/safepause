package kz.safepause.detector

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test

/** Cases from the final review. Kept apart from the frozen evaluation set. */
class ReviewFixesTest {
    private val rules = RuleSet.load()
    private fun run(vararg phrases: Phrase): Assessment {
        val d = ScamDetector(rules); var a = d.current()
        phrases.forEach { a = d.add(it) }
        return a
    }
    private fun ru(text: String, at: Long = 0) = Phrase(text, at, "ru")
    private fun kk(text: String, at: Long = 0) = Phrase(text, at, "kk")
    private fun Assessment.has(id: String) = hits.any { it.rule.id == id }

    @Test fun scamCodeWithSecrecyIsHigh() =
        assertEquals(Level.HIGH, run(ru("продиктуйте код из смс и никому не говорите")).level)

    @Test fun bankNeverAsksThenAsksIsHigh() =
        assertEquals(Level.HIGH, run(ru("банк никогда не просит код назовите код из смс")).level)

    @Test fun neGovoriteIsNotStateAuthority() =
        assertFalse(Stage.AUTHORITY in run(ru("мам не говори папе")).stages)

    @Test fun wifiPasswordIsNotHigh() =
        assertEquals(Level.LOW, run(ru("мам какой пароль от вайфая")).level)

    @Test fun bankAppPasswordIsHigh() =
        assertEquals(Level.HIGH, run(ru("назовите пароль от приложения банка")).level)

    @Test fun relativePromisingTransferIsNotHigh() =
        assertNotEquals(Level.HIGH, run(ru("мама это я"), ru("я тебе завтра переведу деньги", 3000)).level)

    @Test fun splitNegationIsNotHit() {
        val a = run(ru("никому не сообщайте", 0), ru("код из смс", 1500))
        assertFalse(a.has("req_code"), a.hits.toString())
    }

    @Test fun otherRecogniserNegationSuppresses() {
        assertFalse(run(ru("никому не сообщайте код из смс", 0), kk("код из смс", 100)).has("req_code"))
        assertFalse(run(kk("код из смс", 0), ru("никому не сообщайте код из смс", 100)).has("req_code"))
    }

    @Test fun codeRequestLaterInCallStillCounts() =
        assertEquals(Level.HIGH, run(ru("никому не сообщайте код", 0), ru("а теперь назовите код из смс", 20_000)).level)
}
