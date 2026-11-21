package kz.safepause.guard.ui

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kz.safepause.detector.Level
import kz.safepause.guard.data.CallRecord
import kz.safepause.guard.data.LastCall
import kz.safepause.guard.data.Settings
import java.text.DateFormat
import java.util.Date

/** Shows one call: risk, reasons, and the transcript with the lines that triggered a rule highlighted. */
class SummaryActivity : ComponentActivity() {
    companion object {
        fun intent(ctx: Context, id: String) = Intent(ctx, SummaryActivity::class.java).putExtra("id", id)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val settings = Settings(this)
        val id = intent.getStringExtra("id")
        val record = LastCall.record?.takeIf { it.id == id } ?: settings.store().all().firstOrNull { it.id == id }
        val live = LastCall.record?.id == id
        val lines = if (live) LastCall.transcript.map { it.text } else record?.transcript.orEmpty()
        val flagged = if (live) LastCall.assessment?.hits.orEmpty().map { it.phrase.text }.toSet() else emptySet()
        setContent {
            SafePauseTheme {
                SummaryScreen(record, lines, flagged, settings.lang) {
                    record?.let { settings.store().delete(it.id) }
                    if (live) LastCall.clear()
                    finish()
                }
            }
        }
    }

    override fun onDestroy() {
        // with "keep transcripts" off, the transcript lives only as long as this screen
        if (isFinishing && !Settings(this).keepTranscripts) LastCall.transcript = emptyList()
        super.onDestroy()
    }
}

@Composable
fun SummaryScreen(record: CallRecord?, lines: List<String>, flagged: Set<String>, lang: String, onDelete: () -> Unit) {
    val t = { k: String -> Strings.t(k, lang) }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            if (record == null) { Text(t("summary_missing")); return@Column }
            Text(t("summary_title"), fontSize = 24.sp, fontWeight = FontWeight.Bold)
            Text(DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(record.at)) +
                (record.number?.let { " · $it" } ?: ""), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(t("risk_" + record.level.name.lowercase()), color = Color.White, fontWeight = FontWeight.Bold,
                modifier = Modifier.background(Palette.of(record.level), RoundedCornerShape(50)).padding(horizontal = 14.dp, vertical = 6.dp))
            if (record.reasons.isNotEmpty()) {
                Text(t("summary_reasons"), fontWeight = FontWeight.SemiBold)
                record.reasons.forEach { Text("• $it") }
            }
            if (record.level == Level.HIGH) Text(t("warning_advice"), fontWeight = FontWeight.SemiBold)
            Text(t("summary_transcript"), fontWeight = FontWeight.SemiBold)
            if (lines.isEmpty()) Text(t("summary_no_transcript"), color = MaterialTheme.colorScheme.onSurfaceVariant)
            lines.forEach { line ->
                val hot = line in flagged
                Text(line, modifier = Modifier.fillMaxWidth()
                    .background(if (hot) Palette.red.copy(alpha = 0.15f) else Color.Transparent, RoundedCornerShape(8.dp))
                    .padding(8.dp), fontWeight = if (hot) FontWeight.SemiBold else FontWeight.Normal)
            }
            Button(onClick = onDelete, colors = ButtonDefaults.buttonColors(containerColor = Palette.navy)) { Text(t("summary_delete")) }
        }
    }
}
