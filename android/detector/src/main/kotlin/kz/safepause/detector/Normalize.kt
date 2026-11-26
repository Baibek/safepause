package kz.safepause.detector

private val NON_WORD = Regex("[^\\p{L}\\p{Nd}]+")

/** Lower-case, fold ё to е, replace punctuation with spaces, collapse whitespace. */
fun normalize(text: String): String =
    text.lowercase().replace('ё', 'е').replace(NON_WORD, " ").trim()

/** The form rules match against: normalised text without spaces (recognisers split and join words). */
internal fun squash(text: String): String = normalize(text).replace(" ", "")
