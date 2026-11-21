package kz.safepause.guard.data

import android.content.Context
import kz.safepause.guard.ai.ApiKeyStore

/** Client settings. Plain values in SharedPreferences "safepause"; the API key goes to ApiKeyStore (encrypted). */
class Settings(private val ctx: Context) {
    private val p = ctx.getSharedPreferences("safepause", Context.MODE_PRIVATE)

    var lang: String
        get() = p.getString("lang", "kk") ?: "kk"
        set(v) = p.edit().putString("lang", v).apply()
    var clientName: String?
        get() = p.getString("client_name", null)
        set(v) = p.edit().putString("client_name", v?.trim()).apply()
    var apiKey: String?
        get() = ApiKeyStore.get(ctx)
        set(v) = ApiKeyStore.set(ctx, v)
    var guardianName: String?
        get() = p.getString("guardian_name", null)
        set(v) = p.edit().putString("guardian_name", v?.trim()).apply()
    var guardianPhone: String?
        get() = p.getString("guardian_phone", null)
        set(v) = p.edit().putString("guardian_phone", v?.trim()).apply()
    /** Off by default: transcripts disappear once the summary screen is closed. */
    var keepTranscripts: Boolean
        get() = p.getBoolean("keep_transcripts", false)
        set(v) = p.edit().putBoolean("keep_transcripts", v).apply()
    var onboarded: Boolean
        get() = p.getBoolean("onboarded", false)
        set(v) = p.edit().putBoolean("onboarded", v).apply()

    fun store() = CallStore(java.io.File(ctx.filesDir, "calls.json"))
}
