package kz.safepause.guard.guardian

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.SmsManager
import kz.safepause.detector.Level
import kz.safepause.guard.data.CallRecord
import kz.safepause.guard.data.Settings
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** The message to the trusted person. Name, time and caller number only — never what was said. */
fun guardianText(clientName: String, at: Long, number: String?, lang: String, tz: TimeZone = TimeZone.getDefault()): String {
    val time = SimpleDateFormat("HH:mm", Locale.ROOT).apply { timeZone = tz }.format(Date(at))
    return if (lang == "ru") {
        "Senim: у $clientName в $time был звонок с признаками мошенничества" +
            (number?.let { " (номер $it)" } ?: "") + ". Пожалуйста, позвоните ей/ему."
    } else {
        "Senim: $clientName $time-те алаяқтық белгілері бар қоңырау қабылдады" +
            (number?.let { " (нөмір $it)" } ?: "") + ". Оған хабарласыңыз."
    }
}

/** HIGH-risk real call, a guardian number, SMS permission. The sample (demo) call never texts anyone. */
fun shouldTextGuardian(record: CallRecord, guardianPhone: String?, smsGranted: Boolean): Boolean =
    record.kind != kz.safepause.guard.call.CallKind.SAMPLE && record.level == Level.HIGH &&
        !guardianPhone.isNullOrBlank() && smsGranted

object GuardianSms {
    /** Sends the SMS when the call was HIGH risk, a guardian is set and SEND_SMS is granted. Returns true if sent. */
    fun sendIfNeeded(ctx: Context, settings: Settings, record: CallRecord): Boolean {
        val phone = settings.guardianPhone
        val granted = ctx.checkSelfPermission(Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED
        if (phone == null || !shouldTextGuardian(record, phone, granted)) return false
        val text = guardianText(settings.clientName ?: "Senim", record.at, record.number, settings.lang)
        val sms = if (Build.VERSION.SDK_INT >= 31) ctx.getSystemService(SmsManager::class.java)
                  else @Suppress("DEPRECATION") SmsManager.getDefault()
        return runCatching { sms.sendMultipartTextMessage(phone, null, sms.divideMessage(text), null, null); true }.getOrDefault(false)
    }
}
