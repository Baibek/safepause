package kz.safepause.detector

enum class Stage { AUTHORITY, THREAT, REQUEST, ISOLATION }

enum class Level { LOW, SUSPICIOUS, HIGH }

/** One final utterance from a speech recogniser. [source] is the recogniser language: "kk" or "ru". */
data class Phrase(val text: String, val atMs: Long, val source: String)

data class Rule(
    val id: String,
    val stage: Stage,
    val critical: Boolean,
    val patterns: List<Regex>,
    val exclude: List<Regex>,
    val kk: String,
    val ru: String,
    /** Whole-word patterns, matched on the spaced text. */
    val word: List<Regex> = emptyList(),
    /** Openers of negated spans ("никому не сообщайте …"); see call_rules.json _doc. */
    val negate: List<Regex> = emptyList(),
) {

    fun reason(lang: String) = if (lang == "ru") ru else kk
}

data class Hit(val rule: Rule, val phrase: Phrase)

data class Assessment(val level: Level, val risk: Double, val stages: Set<Stage>, val hits: List<Hit>)
