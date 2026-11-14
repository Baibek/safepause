package kz.safepause.guard.guardian

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

class GuardianSmsTest {
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
