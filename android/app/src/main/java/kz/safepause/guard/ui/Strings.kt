package kz.safepause.guard.ui

import android.content.Context

/** UI copy in Kazakh and Russian. Every key must exist in both maps (StringsTest). */
object Strings {
    private val kk = mapOf(
        "bubble" to "SafePause: тыңдайын ба?",
        "listening" to "SafePause тыңдап тұр",
        "speaker_hint" to "Динамикті қосыңыз — сонда қарсы жақтың сөзін естимін",
        "risk_low" to "Қауіп белгісі жоқ",
        "risk_suspicious" to "Күдікті",
        "risk_high" to "АЛАЯҚТЫҚ БЕЛГІЛЕРІ",
        "warning_title" to "Бұл алаяқ болуы әбден мүмкін",
        "warning_advice" to "Тұтқаны қойыңыз. Ешқандай кодты айтпаңыз, ақша аудармаңыз. Банкке картаның артындағы нөмірмен өзіңіз қоңырау шалыңыз.",
        "warning_ok" to "Түсіндім",
        "stop" to "Тоқтату",
        "mic_silent" to "Микрофон үнсіз. «Арнайы мүмкіндіктер» бөлімінде SafePause-ты қосыңыз.",
        "open_settings" to "Баптауларды ашу",
        "models_missing" to "Сөйлеуді тану модельдері әлі жүктелмеген. Қосымшаны ашып, жүктеуді аяқтаңыз.",
        "no_mic_permission" to "Микрофонға рұқсат жоқ. Қосымшаны ашып, рұқсат беріңіз.",
        "check_face" to "Бетті тексеру",
        "notif_channel" to "Қоңырауды қорғау",
        "notif_listening" to "Қоңырау тыңдалып жатыр. Дыбыс телефоннан шықпайды.",
    )
    private val ru = mapOf(
        "bubble" to "SafePause: слушать?",
        "listening" to "SafePause слушает",
        "speaker_hint" to "Включите громкую связь — так я услышу собеседника",
        "risk_low" to "Признаков опасности нет",
        "risk_suspicious" to "Подозрительно",
        "risk_high" to "ПРИЗНАКИ МОШЕННИЧЕСТВА",
        "warning_title" to "Очень похоже на мошенника",
        "warning_advice" to "Положите трубку. Не называйте никаких кодов и не переводите деньги. Сами позвоните в банк по номеру на обороте карты.",
        "warning_ok" to "Понятно",
        "stop" to "Стоп",
        "mic_silent" to "Микрофон молчит. Включите SafePause в разделе «Специальные возможности».",
        "open_settings" to "Открыть настройки",
        "models_missing" to "Модели распознавания речи ещё не скачаны. Откройте приложение и завершите загрузку.",
        "no_mic_permission" to "Нет доступа к микрофону. Откройте приложение и дайте разрешение.",
        "check_face" to "Проверить лицо",
        "notif_channel" to "Защита звонка",
        "notif_listening" to "Звонок прослушивается. Звук не покидает телефон.",
    )

    val keys: Set<String> get() = kk.keys + ru.keys

    fun t(key: String, lang: String): String = (if (lang == "ru") ru[key] else kk[key]) ?: key

    /** Interface language chosen in Settings (same preference file and key as data.Settings). */
    fun lang(ctx: Context): String =
        ctx.getSharedPreferences("safepause", Context.MODE_PRIVATE).getString("lang", "kk") ?: "kk"
}
