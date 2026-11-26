package kz.safepause.guard.call

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ListenGateTest {
    @Test fun missingMicPermissionBlocksBeforeServiceStarts() =
        assertEquals(Problem.NO_MIC_PERMISSION, listenBlocker(micGranted = false, modelsReady = true))

    @Test fun missingModelsBlock() =
        assertEquals(Problem.MODELS_MISSING, listenBlocker(micGranted = true, modelsReady = false))

    @Test fun readyStarts() = assertNull(listenBlocker(micGranted = true, modelsReady = true))
}
