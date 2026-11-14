package kz.safepause.guard.access

import android.accessibilityservice.AccessibilityService
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kz.safepause.guard.call.CallBus
import kz.safepause.guard.call.CallWatcher
import kz.safepause.guard.call.CallEndHandler
import kz.safepause.guard.call.Overlay
import kz.safepause.guard.call.WHATSAPP_PACKAGES

/**
 * While enabled, Android lets this app capture the microphone concurrently with a phone call
 * (Android 10+ concurrent-capture rules). It also watches for WhatsApp call screens and owns the
 * overlay drawn over the call screen.
 */
class GuardAccessibilityService : AccessibilityService() {
    private var watcher: CallWatcher? = null
    private var overlay: Overlay? = null

    companion object { private var endHookRegistered = false }

    override fun onServiceConnected() {
        if (!endHookRegistered) {
            endHookRegistered = true
            CallBus.onCallEnded { info, a, t -> CallEndHandler.handle(applicationContext, info, a, t) }
        }
        watcher = CallWatcher(this).also { it.start() }
        overlay = Overlay(this, WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY).also { it.attach() }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString() ?: return
        if (pkg !in WHATSAPP_PACKAGES) return
        watcher?.onWhatsAppWindow(pkg, texts(rootInActiveWindow))
    }

    private fun texts(node: AccessibilityNodeInfo?, out: MutableList<String> = mutableListOf(), depth: Int = 0): List<String> {
        if (node == null || depth > 6 || out.size > 30) return out
        node.text?.toString()?.takeIf { it.isNotBlank() }?.let(out::add)
        node.contentDescription?.toString()?.takeIf { it.isNotBlank() }?.let(out::add)
        for (i in 0 until node.childCount) texts(node.getChild(i), out, depth + 1)
        return out
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        watcher?.stop(); overlay?.detach()
        super.onDestroy()
    }
}
