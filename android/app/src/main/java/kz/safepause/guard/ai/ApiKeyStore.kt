package kz.safepause.guard.ai

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** The Claude API key, encrypted at rest with a key from the Android Keystore. */
object ApiKeyStore {
    private fun prefs(ctx: Context): SharedPreferences {
        val master = MasterKey.Builder(ctx).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        @Suppress("DEPRECATION")
        return EncryptedSharedPreferences.create(ctx, "safepause_secrets", master,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    }

    fun get(ctx: Context): String? = runCatching { prefs(ctx).getString("claude_api_key", null) }.getOrNull()?.takeIf { it.isNotBlank() }

    fun set(ctx: Context, key: String?) {
        prefs(ctx).edit().apply { if (key.isNullOrBlank()) remove("claude_api_key") else putString("claude_api_key", key.trim()) }.apply()
    }

    fun client(ctx: Context): ClaudeClient? = get(ctx)?.let { AnthropicClaudeClient(it) }
}
