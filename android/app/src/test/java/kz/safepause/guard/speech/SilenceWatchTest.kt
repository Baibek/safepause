package kz.safepause.guard.speech

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SilenceWatchTest {
    @Test fun reportsAfterFiveSecondsOfSilence() {
        val w = SilenceWatch()
        val fired = (0..60).map { i -> i * 100L to w.feed(5.0, i * 100L) }
        assertFalse(fired.filter { it.first < 5000 }.any { it.second })
        assertTrue(fired.first { it.first == 5000L }.second)
        assertEquals(1, fired.count { it.second })
    }

    @Test fun doesNotReportWhenSpeechSeen() {
        val w = SilenceWatch()
        var any = false
        for (i in 0..100) any = any or w.feed(if (i == 20) 800.0 else 5.0, i * 100L)
        assertFalse(any)
    }
}
