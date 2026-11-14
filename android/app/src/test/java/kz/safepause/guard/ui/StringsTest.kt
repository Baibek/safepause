package kz.safepause.guard.ui

import org.junit.Assert.assertTrue
import org.junit.Test

class StringsTest {
    private val screenKeys = listOf(
        "onb_title", "onb_intro", "onb_next", "onb_done", "perm_mic", "perm_mic_why", "perm_phone", "perm_phone_why",
        "perm_notif", "perm_notif_why", "perm_access", "perm_access_why", "perm_access_restricted", "perm_sms", "perm_sms_why",
        "grant", "granted", "models_title", "models_download", "models_ready", "models_failed",
        "home_title", "home_status", "home_test_call", "home_test_running", "home_recent", "home_no_calls",
        "settings_title", "settings_lang", "settings_name", "settings_api_key", "settings_api_key_hint", "settings_guardian_name",
        "settings_guardian_phone", "settings_keep", "settings_mic_test", "save", "saved", "manual_check", "manual_hint", "yes", "no",
        "q_REFUSED", "q_DISTORTED_ON_TURN", "q_HAND_GLITCH", "q_LIPS_OUT_OF_SYNC",
    )

    @Test fun everyKeyHasKkAndRu() {
        for (k in Strings.keys) {
            val kk = Strings.t(k, "kk"); val ru = Strings.t(k, "ru")
            assertTrue("missing kk for $k", kk != k && kk.isNotBlank())
            assertTrue("missing ru for $k", ru != k && ru.isNotBlank())
        }
    }

    @Test fun screenKeysExist() {
        val missing = screenKeys.filterNot { it in Strings.keys }
        assertTrue("missing keys: $missing", missing.isEmpty())
    }
}
