package kz.safepause.guard.sdk

import android.content.Context
import kz.safepause.detector.Level
import kz.safepause.guard.call.CallKind
import kz.safepause.guard.data.CallRecord
import kz.safepause.guard.data.Settings

/** A scam call flagged on this phone within the last hour pauses any transfer (same rule as the bank API). */
const val SCAM_CALL_WINDOW_MS = 60 * 60_000L

/**
 * What the banking app sends with a transfer to the bank's anti-fraud check
 * (`POST /api/transfer/check`, field `signals.scam_call_minutes`). Only a number leaves the phone:
 * never the transcript, the caller's words or the recording.
 */
data class TransferSignals(val scamCallMinutes: Double?, val rooted: Boolean = false, val remoteApp: Boolean = false) {
    fun toJson(): String = listOfNotNull(
        scamCallMinutes?.let { "\"scam_call_minutes\":$it" },
        "\"rooted\":true".takeIf { rooted },
        "\"remote_app\":true".takeIf { remoteApp },
    ).joinToString(",", "{", "}")
}

fun transferSignals(records: List<CallRecord>, now: Long): TransferSignals {
    val last = records
        .filter { it.level == Level.HIGH && it.kind != CallKind.SAMPLE && now - it.at in 0..SCAM_CALL_WINDOW_MS }
        .maxByOrNull { it.at }
    return TransferSignals(last?.let { Math.round((now - it.at) / 6_000.0) / 10.0 })
}

/**
 * The integration surface for the host banking app (e.g. a bank's mobile app that embeds this module).
 *
 *     val signals = SafePauseSdk.transferSignals(context)      // before calling the transfer API
 *     request.put("signals", JSONObject(signals.toJson()))
 */
object SafePauseSdk {
    /** The scam-call signal plus what the phone says about itself (RASP: root, emulator, remote control). */
    fun transferSignals(ctx: Context, now: Long = System.currentTimeMillis()): TransferSignals {
        val rasp = kz.safepause.guard.rasp.RaspCollector.report(ctx).signals()
        return transferSignals(Settings(ctx).store().all(), now).copy(rooted = rasp.getValue("rooted"), remoteApp = rasp.getValue("remote_app"))
    }
}
