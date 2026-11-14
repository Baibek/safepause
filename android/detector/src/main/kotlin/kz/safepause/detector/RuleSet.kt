package kz.safepause.detector

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

class RuleSet(val rules: List<Rule>) {
    @Serializable
    private data class RuleDto(
        val id: String, val stage: Stage, val critical: Boolean = false,
        val patterns: List<String>, val exclude: List<String> = emptyList(),
        val kk: String, val ru: String,
        val word: List<String> = emptyList(), val negate: List<String> = emptyList(),
    )

    @Serializable
    private data class FileDto(val rules: List<RuleDto>)

    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        fun fromJson(text: String): RuleSet = RuleSet(json.decodeFromString<FileDto>(text).rules.map { d ->
            Rule(d.id, d.stage, d.critical, d.patterns.map(::Regex), d.exclude.map(::Regex), d.kk, d.ru,
                word = d.word.map { Regex("(?<![\\p{L}\\p{Nd}])(?:$it)(?![\\p{L}\\p{Nd}])") },
                negate = d.negate.map(::Regex))
        })

        /** Loads the bundled shared/call_rules.json. */
        fun load(): RuleSet {
            val stream = RuleSet::class.java.getResourceAsStream("/call_rules.json")
                ?: error("call_rules.json is not on the classpath")
            return fromJson(stream.bufferedReader(Charsets.UTF_8).use { it.readText() })
        }
    }
}
