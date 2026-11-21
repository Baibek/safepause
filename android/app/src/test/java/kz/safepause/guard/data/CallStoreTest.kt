package kz.safepause.guard.data

import kz.safepause.detector.Assessment
import kz.safepause.detector.Level
import kz.safepause.detector.Phrase
import kz.safepause.detector.RuleSet
import kz.safepause.detector.ScamDetector
import kz.safepause.guard.call.CallInfo
import kz.safepause.guard.call.CallKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class CallStoreTest {
    @get:Rule val tmp = TemporaryFolder()

    private val info = CallInfo(CallKind.CELLULAR, "+77011234567", 1_700_000_000_000)
    private val transcript = listOf(Phrase("переведите на безопасный счет", 0, "ru"))
    private val assessment: Assessment = ScamDetector(RuleSet.load()).let { d -> transcript.forEach(d::add); d.current() }

    @Test fun transcriptDroppedWhenKeepOff() {
        val r = CallRecord.from(info, assessment, transcript, keepTranscript = false, lang = "ru")
        assertNull(r.transcript)
        assertEquals(Level.HIGH, r.level)
        assertTrue(r.reasons.isNotEmpty())
    }

    @Test fun transcriptKeptWhenKeepOn() {
        val r = CallRecord.from(info, assessment, transcript, keepTranscript = true, lang = "ru")
        assertEquals(listOf("переведите на безопасный счет"), r.transcript)
    }

    @Test fun persistsAcrossInstances() {
        val f = File(tmp.root, "calls.json")
        CallStore(f).add(CallRecord.from(info, assessment, transcript, false, "kk"))
        val all = CallStore(f).all()
        assertEquals(1, all.size)
        assertEquals("+77011234567", all[0].number)
    }

    @Test fun deleteRemoves() {
        val s = CallStore(File(tmp.root, "calls.json"))
        val r = CallRecord.from(info, assessment, transcript, false, "kk")
        s.add(r); s.delete(r.id)
        assertTrue(s.all().isEmpty())
    }

    @Test fun newestFirst() {
        val s = CallStore(File(tmp.root, "calls.json"))
        s.add(CallRecord.from(info.copy(startedAt = 1), null, emptyList(), false, "kk"))
        s.add(CallRecord.from(info.copy(startedAt = 2), null, emptyList(), false, "kk"))
        assertEquals(listOf(2L, 1L), s.all().map { it.at })
    }

    @Test fun corruptFileReadsAsEmpty() {
        val f = File(tmp.root, "calls.json").apply { writeText("{not json") }
        assertTrue(CallStore(f).all().isEmpty())
    }
}
