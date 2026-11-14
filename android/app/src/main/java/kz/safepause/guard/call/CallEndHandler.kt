package kz.safepause.guard.call

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.app.Notification
import kz.safepause.detector.Assessment
import kz.safepause.detector.Phrase
import kz.safepause.guard.R
import kz.safepause.guard.data.CallRecord
import kz.safepause.guard.data.LastCall
import kz.safepause.guard.data.Settings
import kz.safepause.guard.guardian.GuardianSms
import kz.safepause.guard.ui.Strings
import kz.safepause.guard.ui.SummaryActivity

/** After a listened call: store the record, text the guardian if needed, offer the summary. */
object CallEndHandler {
    private const val CHANNEL = "summary"

    fun handle(ctx: Context, info: CallInfo, a: Assessment?, transcript: List<Phrase>) {
        ListenService.stop(ctx)
        if (a == null && transcript.isEmpty()) return            // the client did not ask to listen
        val settings = Settings(ctx)
        val record = CallRecord.from(info, a, transcript, settings.keepTranscripts, settings.lang)
        settings.store().add(record)
        LastCall.record = record; LastCall.assessment = a; LastCall.transcript = transcript
        GuardianSms.sendIfNeeded(ctx, settings, record)

        val lang = settings.lang
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, Strings.t("summary_title", lang), NotificationManager.IMPORTANCE_HIGH))
        val pi = PendingIntent.getActivity(ctx, 0, SummaryActivity.intent(ctx, record.id),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        nm.notify(2, Notification.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_shield)
            .setContentTitle(Strings.t("summary_title", lang) + " · " + Strings.t("risk_" + record.level.name.lowercase(), lang))
            .setContentText(record.reasons.firstOrNull() ?: Strings.t("risk_low", lang))
            .setContentIntent(pi).setAutoCancel(true).build())
    }
}
