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
        "SafePause: у $clientName в $time был звонок с признаками мошенничества" +
            (number?.let { " (номер $it)" } ?: "") + ". Пожалуйста, позвоните ей/ему."
    } else {
        "SafePause: $clientName $time-те алаяқтық белгілері бар қоңырау қабылдады" +
            (number?.let { " (нөмір $it)" } ?: "") + ". Оған хабарласыңыз."
    }
}

object GuardianSms {
    /** Sends the SMS when the call was HIGH risk, a guardian is set and SEND_SMS is granted. Returns true if sent. */
    fun sendIfNeeded(ctx: Context, settings: Settings, record: CallRecord): Boolean {
        val phone = settings.guardianPhone?.takeIf { it.isNotBlank() } ?: return false
        if (record.level != Level.HIGH) return false
        if (ctx.checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) return false
        val text = guardianText(settings.clientName ?: "SafePause", record.at, record.number, settings.lang)
        val sms = if (Build.VERSION.SDK_INT >= 31) ctx.getSystemService(SmsManager::class.java)
                  else @Suppress("DEPRECATION") SmsManager.getDefault()
        return runCatching { sms.sendMultipartTextMessage(phone, null, sms.divideMessage(text), null, null); true }.getOrDefault(false)
    }
}
