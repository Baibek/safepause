package kz.safepause.guard.call

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager

/**
 * Turns phone-state changes (cellular) and WhatsApp call screens (seen by the accessibility service)
 * into CallBus.start / CallBus.end. Lives as long as the accessibility service.
 */
class CallWatcher(private val ctx: Context) {
    private val tm = ctx.getSystemService(TelephonyManager::class.java)
    private val am = ctx.getSystemService(AudioManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private var callback: Any? = null

    fun start() {
        if (ctx.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return
        if (Build.VERSION.SDK_INT >= 31) {
            val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) = onCellular(state)
            }
            tm.registerTelephonyCallback(ctx.mainExecutor, cb)
            callback = cb
        } else {
            @Suppress("DEPRECATION")
            val l = object : PhoneStateListener() {
                @Deprecated("Deprecated in Java")
                override fun onCallStateChanged(state: Int, phoneNumber: String?) = onCellular(state)
            }
            @Suppress("DEPRECATION")
            tm.listen(l, PhoneStateListener.LISTEN_CALL_STATE)
            callback = l
        }
    }

    fun stop() {
        when (val cb = callback) {
            is TelephonyCallback -> if (Build.VERSION.SDK_INT >= 31) tm.unregisterTelephonyCallback(cb)
            is PhoneStateListener -> @Suppress("DEPRECATION") tm.listen(cb, PhoneStateListener.LISTEN_NONE)
        }
        callback = null
        main.removeCallbacksAndMessages(null)
    }

    private fun onCellular(state: Int) {
        when (state) {
            TelephonyManager.CALL_STATE_OFFHOOK -> CallBus.start(CallInfo(CallKind.CELLULAR, null, System.currentTimeMillis()))
            TelephonyManager.CALL_STATE_IDLE -> if (CallBus.call.value?.kind == CallKind.CELLULAR) CallBus.end()
        }
    }

    /** Called by the accessibility service for every window event from a WhatsApp package. */
    fun onWhatsAppWindow(pkg: String, texts: List<String>) {
        if (CallBus.call.value != null) return
        if (isWhatsAppCallScreen(pkg, texts, am.mode)) {
            CallBus.start(CallInfo(CallKind.WHATSAPP, null, System.currentTimeMillis()))
            pollWhatsAppEnd()
        }
    }

    // WhatsApp gives no end-of-call event to other apps; the audio mode returning to normal is the signal.
    private fun pollWhatsAppEnd() {
        main.postDelayed({
            if (CallBus.call.value?.kind != CallKind.WHATSAPP) return@postDelayed
            if (am.mode != AudioManager.MODE_IN_COMMUNICATION) CallBus.end() else pollWhatsAppEnd()
        }, 2000)
    }
}
