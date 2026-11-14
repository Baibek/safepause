package kz.safepause.guard.call

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle

/**
 * Invisible activity opened by the overlay bubble. Being a visible activity for a moment is what lets
 * Android start a microphone foreground service from the call screen (while-in-use rule, Android 11+).
 */
class ListenActivity : Activity() {
    companion object {
        fun launch(ctx: Context) = ctx.startActivity(
            Intent(ctx, ListenActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val blocker = listenBlocker(this)
        if (blocker != null) CallBus.problem.value = blocker else ListenService.start(this)
        finish()
        overridePendingTransition(0, 0)
    }
}
