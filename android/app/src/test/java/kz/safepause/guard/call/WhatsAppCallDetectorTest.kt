package kz.safepause.guard.call

import android.media.AudioManager
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WhatsAppCallDetectorTest {
    private val callTexts = listOf("WhatsApp voice call", "End call")

    @Test fun whatsappInCommunicationIsCall() =
        assertTrue(isWhatsAppCallScreen("com.whatsapp", callTexts, AudioManager.MODE_IN_COMMUNICATION))

    @Test fun whatsappWithNormalAudioIsNotCall() =
        assertFalse(isWhatsAppCallScreen("com.whatsapp", callTexts, AudioManager.MODE_NORMAL))

    @Test fun otherAppIsNotWhatsAppCall() =
        assertFalse(isWhatsAppCallScreen("com.android.chrome", callTexts, AudioManager.MODE_IN_COMMUNICATION))

    @Test fun whatsappBusinessCounts() =
        assertTrue(isWhatsAppCallScreen("com.whatsapp.w4b", callTexts, AudioManager.MODE_IN_COMMUNICATION))
}
