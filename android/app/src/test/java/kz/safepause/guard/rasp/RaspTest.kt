package kz.safepause.guard.rasp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RaspTest {
    private val clean = DeviceFacts(
        buildTags = "release-keys", fingerprint = "samsung/a54xnsxx/a54x:14/UP1A/A546EXXU:user/release-keys",
        model = "SM-A546E", product = "a54xnsxx", hardware = "s5e8835",
    )

    @Test fun ordinaryPhoneIsClean() {
        val r = assess(clean)
        assertFalse(r.rooted); assertFalse(r.emulator); assertFalse(r.remoteAccess)
        assertTrue(r.findings.isEmpty())
    }

    @Test fun testKeysOrSuBinaryMeanRoot() {
        assertTrue(assess(clean.copy(buildTags = "test-keys")).rooted)
        assertTrue(assess(clean.copy(suPaths = listOf("/system/xbin/su"))).rooted)
        assertTrue(assess(clean.copy(installed = setOf("com.topjohnwu.magisk"))).rooted)
    }

    @Test fun emulatorIsRecognised() {
        assertTrue(assess(clean.copy(fingerprint = "google/sdk_gphone64_x86_64/emu64x:14/x:userdebug/dev-keys", hardware = "ranchu")).emulator)
        assertTrue(assess(clean.copy(model = "Android SDK built for x86", hardware = "goldfish")).emulator)
    }

    @Test fun installedRemoteControlAppIsAFinding() {
        val r = assess(clean.copy(installed = setOf("com.anydesk.anydeskandroid")))
        assertTrue(r.remoteAccess); assertFalse(r.remoteActive)
        assertEquals(listOf("AnyDesk"), r.remoteApps)
    }

    @Test fun remoteAppWithAccessibilityIsActiveControl() {
        val r = assess(clean.copy(installed = setOf("com.carriez.flutter_hbb"),
            accessibility = listOf("com.carriez.flutter_hbb/com.carriez.flutter_hbb.InputService")))
        assertTrue(r.remoteActive)
        assertEquals(listOf("RustDesk"), r.remoteApps)
    }

    @Test fun ownAccessibilityServiceIsNotAThreat() {
        val r = assess(clean.copy(accessibility = listOf("kz.safepause.guard/kz.safepause.guard.access.GuardAccessibilityService")))
        assertTrue(r.findings.isEmpty())
    }

    @Test fun unknownAppDrawingOverOtherAppsIsReported() {
        val r = assess(clean.copy(overlayApps = listOf("com.example.flashlight", "kz.safepause.guard")))
        assertEquals(listOf("com.example.flashlight"), r.overlayApps)
        assertTrue(r.findings.any { it.key == "overlay" })
    }

    @Test fun signalsForTheBankApi() {
        val r = assess(clean.copy(buildTags = "test-keys", installed = setOf("com.teamviewer.quicksupport.market")))
        assertEquals(true, r.signals()["rooted"]); assertEquals(true, r.signals()["remote_app"])
    }
}
