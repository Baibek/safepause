package kz.safepause.guard.access

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

/**
 * While enabled, Android lets this app capture the microphone concurrently with a phone call
 * (Android 10+ concurrent-capture rules). Call-screen detection is added in a later task.
 */
class GuardAccessibilityService : AccessibilityService() {
    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    override fun onInterrupt() = Unit
}
