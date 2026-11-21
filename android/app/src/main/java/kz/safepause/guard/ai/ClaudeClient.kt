package kz.safepause.guard.ai

/** The two things the app asks Claude. Implementations return null on any failure; callers fall back to rules. */
interface ClaudeClient {
    suspend fun complete(prompt: String): String?
    suspend fun vision(prompt: String, jpegs: List<ByteArray>): String?
}
