package kz.safepause.guard.data

import kotlinx.serialization.json.Json
import java.io.File

/** Call records in one small JSON file, newest first. A damaged file reads as empty instead of crashing. */
class CallStore(private val file: File) {
    private val json = Json { ignoreUnknownKeys = true }

    @Synchronized fun all(): List<CallRecord> =
        runCatching { json.decodeFromString<List<CallRecord>>(file.readText()) }.getOrDefault(emptyList()).sortedByDescending { it.at }

    @Synchronized fun add(r: CallRecord) = write(all() + r)

    @Synchronized fun delete(id: String) = write(all().filterNot { it.id == id })

    private fun write(list: List<CallRecord>) {
        file.parentFile?.mkdirs()
        val tmp = File(file.path + ".tmp")
        tmp.writeText(json.encodeToString(list.sortedByDescending { it.at }.take(200)))
        tmp.renameTo(file)
    }
}
