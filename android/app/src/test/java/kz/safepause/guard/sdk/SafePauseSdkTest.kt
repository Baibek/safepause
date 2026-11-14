package kz.safepause.guard.sdk

import kz.safepause.detector.Level
import kz.safepause.guard.call.CallKind
import kz.safepause.guard.data.CallRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SafePauseSdkTest {
    private val now = 1_800_000_000_000L
    private fun rec(minutesAgo: Long, level: Level, kind: CallKind = CallKind.CELLULAR) =
        CallRecord("r$minutesAgo", now - minutesAgo * 60_000, kind, null, level, listOf("reason"), null)

    @Test fun recentHighCallIsReportedInMinutes() =
        assertEquals(5.0, transferSignals(listOf(rec(5, Level.HIGH)), now).scamCallMinutes!!, 0.01)

    @Test fun suspiciousCallIsNotAScamCall() =
        assertNull(transferSignals(listOf(rec(5, Level.SUSPICIOUS)), now).scamCallMinutes)

    @Test fun callOlderThanAnHourIsIgnored() =
        assertNull(transferSignals(listOf(rec(61, Level.HIGH)), now).scamCallMinutes)

    @Test fun newestHighCallWins() =
        assertEquals(2.0, transferSignals(listOf(rec(40, Level.HIGH), rec(2, Level.HIGH)), now).scamCallMinutes!!, 0.01)

    @Test fun sampleDemoCallNeverReachesTheBank() =
        assertNull(transferSignals(listOf(rec(1, Level.HIGH, CallKind.SAMPLE)), now).scamCallMinutes)

    @Test fun jsonMatchesTheBankApi() =
        assertEquals("{\"scam_call_minutes\":5.0}", transferSignals(listOf(rec(5, Level.HIGH)), now).toJson())
}
