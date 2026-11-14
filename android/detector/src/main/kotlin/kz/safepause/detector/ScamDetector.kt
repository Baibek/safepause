package kz.safepause.detector

import kotlin.math.abs

/**
 * Accumulates rule hits over one call. Each rule counts once per call, whichever recogniser heard it.
 * Level depends on how many different stages of a scam script were heard, not on keyword counts.
 *
 * Negation ("никому не сообщайте код") is scoped: it only cancels a match that falls inside the negated
 * span, so "банк никогда не просит код, назовите код" still counts. The previous phrase from the same
 * recogniser (within [WINDOW_MS]) is read together with the current one, because recognisers often
 * split a sentence at a pause; and a negation heard by the other recogniser within the window cancels
 * a hit, because one of the two models often garbles the "не".
 */
class ScamDetector(private val rules: RuleSet) {
    companion object {
        const val WINDOW_MS = 4_000L
        private const val SPAN = 45
        private val IMPERATIVE = Regex("назовит|назови|продиктуй|скажит|скажи|сообщит|айтыңыз|айтыңызшы|айтып|жіберіңіз|жіберші|переведит|аударыңыз|введит")
    }

    private enum class Status { NONE, HIT, NEGATED }
    private data class Negation(val ruleId: String, val source: String, val atMs: Long)

    private val hits = LinkedHashMap<String, Hit>()
    private val history = mutableListOf<Phrase>()
    private val negations = mutableListOf<Negation>()

    fun add(p: Phrase): Assessment {
        val prev = history.lastOrNull { it.source == p.source && p.atMs - it.atMs in 0..WINDOW_MS }
        history += p
        val cur = squash(p.text)
        if (cur.isEmpty()) return current()
        val before = prev?.let { squash(it.text) }.orEmpty()
        val sq = before + cur
        val curSpaced = normalize(p.text)
        val sp = (prev?.let { normalize(it.text) + " " }.orEmpty()) + curSpaced
        val spOff = sp.length - curSpaced.length

        for (rule in rules.rules) {
            when (status(rule, sq, before.length, sp, spOff)) {
                Status.HIT -> if (rule.id !in hits && negations.none {
                        it.ruleId == rule.id && it.source != p.source && abs(it.atMs - p.atMs) <= WINDOW_MS }) {
                    hits[rule.id] = Hit(rule, p)
                }
                Status.NEGATED -> {
                    negations += Negation(rule.id, p.source, p.atMs)
                    val h = hits[rule.id]
                    if (h != null && h.phrase.source != p.source && abs(h.phrase.atMs - p.atMs) <= WINDOW_MS) hits.remove(rule.id)
                }
                Status.NONE -> Unit
            }
        }
        return current()
    }

    /** Only matches that reach into the current phrase count; earlier text is context. */
    private fun status(rule: Rule, sq: String, off: Int, sp: String, spOff: Int): Status {
        val occ = rule.patterns.flatMap { it.findAll(sq).toList() }.filter { it.range.last >= off }
        val wordHit = rule.word.any { r -> r.findAll(sp).any { it.range.last >= spOff } }
        if (occ.isEmpty() && !wordHit) return Status.NONE
        if (rule.exclude.any { it.containsMatchIn(sq) }) return Status.NEGATED
        if (wordHit) return Status.HIT
        val spans = rule.negate.flatMap { it.findAll(sq).toList() }.map { m ->
            val limit = minOf(sq.length, m.range.first + SPAN)
            val cut = IMPERATIVE.findAll(sq, m.range.last + 1)
                .firstOrNull { it.range.first < limit && !sq.regionMatches(maxOf(0, it.range.first - 2), "не", 0, 2) }
            m.range.first until (cut?.range?.first ?: limit)
        }
        val free = occ.any { o -> spans.none { s -> o.range.first >= s.first && o.range.last <= s.last } }
        return if (free) Status.HIT else Status.NEGATED
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

    fun reset() { hits.clear(); history.clear(); negations.clear() }
}
