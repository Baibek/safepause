package kz.safepause.guard.guardian

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

class GuardianSmsTest {
    private fun record(kind: kz.safepause.guard.call.CallKind, level: kz.safepause.detector.Level) =
        kz.safepause.guard.data.CallRecord("id", at, kind, null, level, listOf("r"), null)

    @Test fun sampleCallNeverTexts() =
        assertFalse(shouldTextGuardian(record(kz.safepause.guard.call.CallKind.SAMPLE, kz.safepause.detector.Level.HIGH), "+7701", true))

    @Test fun realHighCallTexts() =
        assertTrue(shouldTextGuardian(record(kz.safepause.guard.call.CallKind.CELLULAR, kz.safepause.detector.Level.HIGH), "+7701", true))

    @Test fun noTextWithoutPermissionOrNumberOrHigh() {
        val high = record(kz.safepause.guard.call.CallKind.WHATSAPP, kz.safepause.detector.Level.HIGH)
        assertFalse(shouldTextGuardian(high, "+7701", false))
        assertFalse(shouldTextGuardian(high, " ", true))
        assertFalse(shouldTextGuardian(record(kz.safepause.guard.call.CallKind.WHATSAPP, kz.safepause.detector.Level.SUSPICIOUS), "+7701", true))
    }

    private val at = 1_700_000_000_000L // 2023-11-14 22:13 UTC = 04:13 in Almaty (UTC+6 until March 2024)

    @Test fun textHasNameNumberAndNoTranscript() {
        val text = guardianText("Айгүл", at, "+77011234567", "kk", TimeZone.getTimeZone("Asia/Almaty"))
        assertTrue(text, text.contains("Айгүл"))
        assertTrue(text, text.contains("+77011234567"))
        assertTrue(text, text.contains("04:13"))
        assertFalse(text, text.contains("безопасный"))
    }

    @Test fun russianTextWithoutNumber() {
        val text = guardianText("Айгуль", at, null, "ru", TimeZone.getTimeZone("Asia/Almaty"))
        assertTrue(text, text.contains("Айгуль"))
        assertFalse(text, text.contains("null"))
    }

    @Test fun textUnder160Chars() {
        assertTrue(guardianText("Айгүл Сейітова", at, "+77011234567", "kk", TimeZone.getTimeZone("Asia/Almaty")).length <= 160)
        assertTrue(guardianText("Айгуль Сеитова", at, "+77011234567", "ru", TimeZone.getTimeZone("Asia/Almaty")).length <= 160)
    }
}
