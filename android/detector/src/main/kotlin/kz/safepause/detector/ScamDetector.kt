package kz.safepause.detector

/**
 * Accumulates rule hits over one call. Each rule counts once per call, whichever recogniser heard it.
 * Level depends on how many different stages of a scam script were heard, not on keyword counts.
 */
class ScamDetector(private val rules: RuleSet) {
    private val hits = LinkedHashMap<String, Hit>()

    fun add(p: Phrase): Assessment {
        val text = squash(p.text)
        if (text.isNotEmpty()) {
            for (rule in rules.rules) {
                if (rule.id in hits) continue
                if (rule.patterns.any { it.containsMatchIn(text) } && rule.exclude.none { it.containsMatchIn(text) }) {
                    hits[rule.id] = Hit(rule, p)
                }
            }
        }
        return current()
    }

    fun current(): Assessment {
        val list = hits.values.toList()
        val stages = list.map { it.rule.stage }.toSet()
        val level = when {
            list.any { it.rule.critical } -> Level.HIGH
            Stage.REQUEST in stages && stages.size >= 2 -> Level.HIGH
            stages.size >= 3 -> Level.HIGH
            Stage.REQUEST in stages -> Level.SUSPICIOUS
            stages.size == 2 -> Level.SUSPICIOUS
            else -> Level.LOW
        }
        val base = when (level) { Level.LOW -> 0.15; Level.SUSPICIOUS -> 0.5; Level.HIGH -> 0.9 }
        val risk = if (list.isEmpty()) 0.0 else minOf(1.0, base + 0.03 * (list.size - 1))
        return Assessment(level, risk, stages, list)
    }

    fun reset() = hits.clear()
}
