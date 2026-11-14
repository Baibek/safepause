package kz.safepause.guard.ai

import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.models.messages.Base64ImageSource
import com.anthropic.models.messages.ContentBlockParam
import com.anthropic.models.messages.ImageBlockParam
import com.anthropic.models.messages.Message
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.OutputConfig
import com.anthropic.models.messages.TextBlockParam
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Duration
import java.util.Base64

/**
 * Claude via the official Anthropic Java SDK. Every failure (no network, bad key, refusal, timeout)
 * returns null so the caller keeps its rule-based result.
 */
class AnthropicClaudeClient(apiKey: String) : ClaudeClient {
    companion object {
        const val MODEL = "claude-opus-5-5"
        // Server-side refusal fallback (beta): a declined request is re-run on another model inside the same call.
        private const val FALLBACK_BETA = "server-side-fallback-2026-07-01"
    }

    private val client: AnthropicClient = AnthropicOkHttpClient.builder()
        .apiKey(apiKey)
        .timeout(Duration.ofSeconds(20))
        .maxRetries(1)
        .build()

    private fun params(content: List<ContentBlockParam>): MessageCreateParams = MessageCreateParams.builder()
        .model(MODEL)
        .maxTokens(4000L)
        .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.LOW).build())
        .addUserMessageOfContentBlockParams(content)
        .putAdditionalHeader("anthropic-beta", FALLBACK_BETA)
        .putAdditionalBodyProperty("fallbacks", JsonValue.from("default"))
        .build()

    private fun text(m: Message): String? {
        if (m.stopReason().map { it.toString() == "refusal" }.orElse(false)) return null
        return m.content().mapNotNull { b -> b.text().orElse(null)?.text() }.joinToString("").ifBlank { null }
    }

    override suspend fun complete(prompt: String): String? = withContext(Dispatchers.IO) {
        runCatching {
            text(client.messages().create(params(listOf(ContentBlockParam.ofText(TextBlockParam.builder().text(prompt).build())))))
        }.getOrNull()
    }

    override suspend fun vision(prompt: String, jpegs: List<ByteArray>): String? = withContext(Dispatchers.IO) {
        runCatching {
            val images = jpegs.map { bytes ->
                ContentBlockParam.ofImage(ImageBlockParam.builder().source(
                    Base64ImageSource.builder()
                        .mediaType(Base64ImageSource.MediaType.IMAGE_JPEG)
                        .data(Base64.getEncoder().encodeToString(bytes))
                        .build()).build())
            }
            text(client.messages().create(params(images + ContentBlockParam.ofText(TextBlockParam.builder().text(prompt).build()))))
        }.getOrNull()
    }
}
