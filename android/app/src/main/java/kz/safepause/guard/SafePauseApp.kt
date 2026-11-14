package kz.safepause.guard

import android.app.Application
import kz.safepause.guard.call.CallBus
import kz.safepause.guard.call.CallEndHandler

/** Registers the end-of-call handling once per process, whether the call came from the phone, WhatsApp or the sample. */
class SafePauseApp : Application() {
    override fun onCreate() {
        super.onCreate()
        CallBus.onCallEnded { info, a, t -> CallEndHandler.handle(this, info, a, t) }
    }
}
