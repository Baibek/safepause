package kz.safepause.guard.call

import android.media.AudioManager

val WHATSAPP_PACKAGES = setOf("com.whatsapp", "com.whatsapp.w4b")

/**
 * A WhatsApp window is showing and the phone's audio is in VoIP-call mode. The call screen's text
 * differs by language and WhatsApp version, so the audio mode is the reliable part; [texts] is kept
 * for logging and future tuning.
 */
@Suppress("UNUSED_PARAMETER")
fun isWhatsAppCallScreen(pkg: String, texts: List<String>, audioMode: Int): Boolean =
    pkg in WHATSAPP_PACKAGES && audioMode == AudioManager.MODE_IN_COMMUNICATION
