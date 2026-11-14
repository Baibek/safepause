package kz.safepause.guard.ai

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kz.safepause.detector.Assessment
import kz.safepause.detector.Level
import kz.safepause.detector.Phrase
import kz.safepause.detector.Stage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CallAnalystTest {
    private class FakeClient(val reply: suspend () -> String?) : ClaudeClient {
        var calls = 0
        override suspend fun complete(prompt: String): String? { calls++; return reply() }
        override suspend fun vision(prompt: String, jpegs: List<ByteArray>): String? = null
    }

    private val phrase = listOf(Phrase("служба безопасности банка", 0, "ru"))
    private fun a(vararg stages: Stage) = Assessment(Level.LOW, 0.1, stages.toSet(), emptyList())

    private fun TestScope.analyst(client: ClaudeClient) = CallAnalyst(client, this, { "kk" }, { testScheduler.currentTime })

    @Test fun validReplySetsVerdict() = runTest {
        val c = FakeClient { "{\"verdict\":\"scam\",\"reasons\":[\"код сұрайды\"],\"advice\":\"тұтқаны қойыңыз\"}" }
        val an = analyst(c)
        an.onPhrase(a(Stage.AUTHORITY), phrase); advanceUntilIdle()
        assertEquals(Level.HIGH, an.verdict.value?.level)
        assertEquals(Level.SUSPICIOUS, an.level(a(Stage.AUTHORITY)))
    }

    @Test fun garbageReplyKeepsRulesOnly() = runTest {
        val an = analyst(FakeClient { "I think this is fine" })
        an.onPhrase(a(Stage.AUTHORITY), phrase); advanceUntilIdle()
        assertNull(an.verdict.value)
        assertEquals(Level.LOW, an.level(a(Stage.AUTHORITY)))
    }

    @Test fun unreachableClientKeepsRulesOnly() = runTest {
        val an = analyst(FakeClient { null })
        an.onPhrase(a(Stage.AUTHORITY), phrase); advanceUntilIdle()
        assertNull(an.verdict.value)
    }

    @Test fun slowClientTimesOutAndAllowsNextRequest() = runTest {
        val c = FakeClient { delay(20_000); "{\"verdict\":\"scam\",\"reasons\":[],\"advice\":\"\"}" }
        val an = analyst(c)
        an.onPhrase(a(Stage.AUTHORITY), phrase)
        advanceTimeBy(10_500)
        assertNull(an.verdict.value)
        an.onPhrase(a(Stage.AUTHORITY, Stage.THREAT), phrase)   // new stage: a fresh request is allowed after the timeout
        advanceTimeBy(100)
        assertEquals(2, c.calls)
    }

    @Test fun noConcurrentRequests() = runTest {
        val c = FakeClient { delay(5_000); null }
        val an = analyst(c)
        an.onPhrase(a(Stage.AUTHORITY), phrase)
        an.onPhrase(a(Stage.AUTHORITY, Stage.THREAT), phrase)
        an.onPhrase(a(Stage.AUTHORITY, Stage.THREAT, Stage.REQUEST), phrase)
        advanceTimeBy(1_000)
        assertEquals(1, c.calls)
    }

    @Test fun noRequestWithoutNewStageWithin30s() = runTest {
        val c = FakeClient { "{\"verdict\":\"safe\",\"reasons\":[],\"advice\":\"\"}" }
        val an = analyst(c)
        an.onPhrase(a(Stage.AUTHORITY), phrase); advanceUntilIdle()
        an.onPhrase(a(Stage.AUTHORITY), phrase); advanceUntilIdle()
        assertEquals(1, c.calls)
        advanceTimeBy(31_000)
        an.onPhrase(a(Stage.AUTHORITY), phrase); advanceUntilIdle()
        assertEquals(2, c.calls)
    }
}
