package kz.safepause.guard.speech

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import java.io.File
import java.io.InputStream
import java.net.URL
import java.util.zip.ZipInputStream

enum class ModelState { MISSING, DOWNLOADING, READY, FAILED }

/**
 * Downloads and unpacks the two offline Vosk models into filesDir/models/<name>.
 * A model counts as present only when its directory was renamed into place after a complete unzip.
 */
class ModelManager(
    filesDir: File,
    private val http: (String) -> InputStream = { url -> URL(url).openStream() },
) {
    companion object {
        val MODELS = listOf("vosk-model-small-kz-0.15", "vosk-model-small-ru-0.22")
        const val BASE_URL = "https://alphacephei.com/vosk/models/"
    }

    private val root = File(filesDir, "models")
    private val _state = MutableStateFlow(MODELS.associateWith { if (dirOf(it).isDirectory) ModelState.READY else ModelState.MISSING })
    private val _progress = MutableStateFlow(MODELS.count { dirOf(it).isDirectory }.toFloat() / MODELS.size)
    val state: StateFlow<Map<String, ModelState>> = _state
    val progress: StateFlow<Float> = _progress

    private fun dirOf(name: String) = File(root, name)

    fun ready(): Boolean = MODELS.all { dirOf(it).isDirectory }

    fun modelDir(name: String): File? = dirOf(name).takeIf { it.isDirectory }

    suspend fun ensure() = withContext(Dispatchers.IO) {
        root.mkdirs()
        for (name in MODELS) {
            if (dirOf(name).isDirectory) continue
            set(name, ModelState.DOWNLOADING)
            val part = File(root, "$name.part")
            try {
                part.deleteRecursively()
                part.mkdirs()
                ZipInputStream(http(BASE_URL + name + ".zip").buffered()).use { zip ->
                    while (true) {
                        val e = zip.nextEntry ?: break
                        val out = File(part, e.name).canonicalFile
                        require(out.path.startsWith(part.canonicalPath)) { "bad zip entry ${e.name}" }
                        if (e.isDirectory) out.mkdirs() else { out.parentFile?.mkdirs(); out.outputStream().use { zip.copyTo(it) } }
                    }
                }
                // archives contain a top folder named like the model; accept either layout
                val inner = File(part, name).takeIf { it.isDirectory } ?: part
                check(File(inner, "conf").isDirectory || File(inner, "am").isDirectory) { "not a Vosk model" }
                if (!inner.renameTo(dirOf(name))) error("rename failed")
                set(name, ModelState.READY)
            } catch (e: Exception) {
                set(name, ModelState.FAILED)
            } finally {
                part.deleteRecursively()
            }
            _progress.value = MODELS.count { dirOf(it).isDirectory }.toFloat() / MODELS.size
        }
    }

    private fun set(name: String, s: ModelState) { _state.value = _state.value + (name to s) }
}
