package kz.safepause.guard.speech

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class ModelManagerTest {
    @get:Rule val tmp = TemporaryFolder()

    private fun zipFor(url: String): ByteArray {
        val name = url.substringAfterLast('/').removeSuffix(".zip")
        val out = ByteArrayOutputStream()
        ZipOutputStream(out).use { z ->
            z.putNextEntry(ZipEntry("$name/conf/model.conf")); z.write("--x=1".toByteArray()); z.closeEntry()
        }
        return out.toByteArray()
    }

    @Test fun readyOnlyWhenBothModelsUnpacked() = runTest {
        val m = ModelManager(tmp.root) { url -> ByteArrayInputStream(zipFor(url)) }
        assertFalse(m.ready())
        m.ensure()
        assertTrue(m.ready())
        ModelManager.MODELS.forEach { name ->
            assertEquals(ModelState.READY, m.state.value[name])
            assertNotNull(m.modelDir(name))
            assertTrue(java.io.File(m.modelDir(name), "conf/model.conf").exists())
        }
        // a fresh manager sees the unpacked models without downloading again
        assertTrue(ModelManager(tmp.root) { error("must not download") }.ready())
    }

    @Test fun failedDownloadSetsFailed() = runTest {
        val m = ModelManager(tmp.root) { throw IOException("offline") }
        m.ensure()
        assertFalse(m.ready())
        ModelManager.MODELS.forEach { assertEquals(ModelState.FAILED, m.state.value[it]) }
    }
}
