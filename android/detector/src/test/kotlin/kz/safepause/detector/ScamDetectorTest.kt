package kz.safepause.detector

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ScamDetectorTest {
    private val rules = RuleSet.load()
    private fun run(vararg texts: String, source: String = "ru"): Assessment {
        val d = ScamDetector(rules)
        var a = d.current()
        texts.forEachIndexed { i, t -> a = d.add(Phrase(t, i * 1000L, source)) }
        return a
    }

    @Test fun authorityAloneIsLow() {
        val a = run("здравствуйте вас беспокоит служба безопасности банка")
        assertEquals(Level.LOW, a.level)
        assertEquals(setOf(Stage.AUTHORITY), a.stages)
    }

    @Test fun safeAccountIsHighAlone() =
        assertEquals(Level.HIGH, run("переведите деньги на безопасный счет").level)

    @Test fun smsCodeKazakhIsHigh() =
        assertEquals(Level.HIGH, run("смс кодты айтыңызшы", source = "kk").level)

    @Test fun negatedCodeIsNotHit() {
        val ru = run("никому не сообщайте код из смс")
        assertEquals(Level.LOW, ru.level); assertTrue(ru.hits.isEmpty(), ru.hits.toString())
        val kk = run("кодты ешкімге айтпаңыз", source = "kk")
        assertEquals(Level.LOW, kk.level); assertTrue(kk.hits.isEmpty(), kk.hits.toString())
    }

    @Test fun requestPlusThreatIsHigh() =
        assertEquals(Level.HIGH, run("на вас оформили кредит", "нужно перевести деньги").level)

    @Test fun twoStagesWithoutRequestIsSuspicious() =
        assertEquals(Level.SUSPICIOUS, run("это полиция", "никому не говорите об этом").level)

    @Test fun sameRuleTwiceFromBothRecognisersCountsOnce() {
        val d = ScamDetector(rules)
        d.add(Phrase("служба безопасности банка", 0, "kk"))
        val a = d.add(Phrase("служба безопасности банка", 0, "ru"))
        assertEquals(a.hits.map { it.rule.id }.distinct().size, a.hits.size)
    }

    @Test fun normalizeLowercasesAndFoldsYo() =
        assertEquals("счет блокирован", normalize("Счёт  БЛОКИРОВАН!"))
}
