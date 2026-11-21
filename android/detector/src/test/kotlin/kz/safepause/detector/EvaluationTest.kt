package kz.safepause.detector

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance

/**
 * Runs the detector over a fixed, synthetic set of scam and normal calls.
 * The set in resources/eval/calls.json was written before the rules and must not be edited
 * to make rules pass.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class EvaluationTest {
    @Serializable
    data class Call(val id: String, val lang: String, val label: String, val type: String, val phrases: List<String>)

    data class Result(val call: Call, val level: Level, val firstHigh: Int?)

    private val calls: List<Call> = Json.decodeFromString(
        javaClass.getResource("/eval/calls.json")!!.readText())

    private val results: List<Result> by lazy {
        val rules = RuleSet.load()
        calls.map { call ->
            val detector = ScamDetector(rules)
            var firstHigh: Int? = null
            var last: Assessment? = null
            call.phrases.forEachIndexed { i, text ->
                last = detector.add(Phrase(text, i * 4000L, if (call.lang == "kk") "kk" else "ru"))
                if (firstHigh == null && last!!.level == Level.HIGH) firstHigh = i + 1
            }
            Result(call, last!!.level, firstHigh)
        }
    }

    @Test
    fun everyScamReachesHigh() {
        val missed = results.filter { it.call.label == "scam" && it.level != Level.HIGH }
        assertTrue(missed.isEmpty(), "scam calls not reaching HIGH: " + missed.map { "${it.call.id}=${it.level}" })
    }

    @Test
    fun noNormalCallReachesHigh() {
        val falseAlarms = results.filter { it.call.label == "normal" && it.level == Level.HIGH }
        assertTrue(falseAlarms.isEmpty(), "normal calls reaching HIGH: " + falseAlarms.map { it.call.id })
    }

    @AfterAll
    fun report() {
        println("\n| id | label | final level | phrase of first HIGH |")
        println("|---|---|---|---|")
        results.forEach { println("| ${it.call.id} | ${it.call.label} | ${it.level} | ${it.firstHigh ?: "—"} / ${it.call.phrases.size} |") }
        val scams = results.filter { it.call.label == "scam" }
        val normals = results.filter { it.call.label == "normal" }
        println("\nscam detected: ${scams.count { it.level == Level.HIGH }}/${scams.size}; " +
            "false alarms: ${normals.count { it.level == Level.HIGH }}/${normals.size}; " +
            "normal calls marked SUSPICIOUS: ${normals.count { it.level == Level.SUSPICIOUS }}")
    }
}
