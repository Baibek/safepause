package kz.safepause.guard.ui

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings as AndroidSettings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kz.safepause.detector.Level
import kz.safepause.guard.call.CallBus
import kz.safepause.guard.data.Settings
import kz.safepause.guard.probe.ProbeActivity
import kz.safepause.guard.speech.ModelManager
import kz.safepause.guard.speech.ModelState
import java.text.DateFormat
import java.util.Date

class MainActivity : ComponentActivity() {
    private val resumed = mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val settings = Settings(this)
        val models = ModelManager(filesDir)
        setContent {
            SafePauseTheme {
                var lang by remember { mutableStateOf(settings.lang) }
                var screen by remember { mutableStateOf(if (settings.onboarded) "home" else "onboarding") }
                val tick = resumed.intValue
                val t = { k: String -> Strings.t(k, lang) }
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Column(Modifier.systemBarsPadding().verticalScroll(rememberScrollState()).padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(if (screen == "settings") t("settings_title") else if (screen == "onboarding") t("onb_title") else t("home_title"),
                                fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                            LangSwitch(lang) { lang = it; settings.lang = it }
                        }
                        when (screen) {
                            "onboarding" -> {
                                Text(t("onb_intro"))
                                SetupList(t, models, tick)
                                Button(onClick = { settings.onboarded = true; screen = "home" }, modifier = Modifier.fillMaxWidth()) { Text(t("onb_done")) }
                            }
                            "settings" -> SettingsScreen(settings, t) { screen = "home" }
                            else -> HomeScreen(settings, models, t, tick,
                                onSettings = { screen = "settings" },
                                onSetup = { screen = "onboarding" })
                        }
                    }
                }
            }
        }
    }

    override fun onResume() { super.onResume(); resumed.intValue++ }
}

@Composable
private fun LangSwitch(lang: String, onChange: (String) -> Unit) {
    Row(Modifier.background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(50)).padding(3.dp)) {
        listOf("kk" to "ҚАЗ", "ru" to "РУС").forEach { (code, label) ->
            Text(label, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                color = if (lang == code) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.background(if (lang == code) Palette.navy else Color.Transparent, RoundedCornerShape(50))
                    .clickable { onChange(code) }.padding(horizontal = 12.dp, vertical = 6.dp))
        }
    }
}

/** Permission and model rows with a button each; shared by onboarding and the home status card. */
@Composable
fun SetupList(t: (String) -> String, models: ModelManager, tick: Int) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    var refresh by remember { mutableIntStateOf(0) }
    val status = remember(tick, refresh) { PermissionStatus(ctx).all() }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { refresh++ }
    val perms = mapOf("mic" to Manifest.permission.RECORD_AUDIO, "phone" to Manifest.permission.READ_PHONE_STATE,
        "notif" to if (Build.VERSION.SDK_INT >= 33) Manifest.permission.POST_NOTIFICATIONS else null)
    status.forEach { (key, ok) ->
        StatusRow(t("perm_$key"), t("perm_${key}_why"), ok, t) {
            if (key == "access") ctx.startActivity(Intent(AndroidSettings.ACTION_ACCESSIBILITY_SETTINGS))
            else perms[key]?.let { launcher.launch(it) }
        }
        if (key == "access" && !ok) Text(t("perm_access_restricted"), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    val modelState by models.state.collectAsState()
    val progress by models.progress.collectAsState()
    val scope = rememberCoroutineScope()
    val ready = modelState.values.all { it == ModelState.READY }
    val busy = modelState.values.any { it == ModelState.DOWNLOADING }
    StatusRow(t("models_title"), if (modelState.values.any { it == ModelState.FAILED }) t("models_failed") else "", ready, t,
        actionLabel = t("models_download"), enabled = !busy) { scope.launch { models.ensure() } }
    if (busy) LinearProgressIndicator(progress = { progress.coerceAtLeast(0.05f) }, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun StatusRow(title: String, why: String, ok: Boolean, t: (String) -> String,
                      actionLabel: String = t("grant"), enabled: Boolean = true, onAction: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Spacer(Modifier.size(12.dp).background(if (ok) Palette.green else Palette.red, CircleShape))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold)
                if (why.isNotBlank()) Text(why, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (ok) Text(t("granted"), color = Palette.green, fontSize = 13.sp)
            else OutlinedButton(onClick = onAction, enabled = enabled) { Text(actionLabel) }
        }
    }
}

@Composable
fun HomeScreen(settings: Settings, models: ModelManager, t: (String) -> String, tick: Int,
               onSettings: () -> Unit, onSetup: () -> Unit) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val call by CallBus.call.collectAsState()
    val assessment by CallBus.assessment.collectAsState()
    val transcript by CallBus.transcript.collectAsState()
    val allOk = remember(tick) { PermissionStatus(ctx).all().values.all { it } } && models.ready()

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(t("home_status"), fontWeight = FontWeight.SemiBold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.size(14.dp).background(if (allOk) Palette.green else Palette.amber, CircleShape))
                Spacer(Modifier.width(10.dp))
                Text(if (allOk) t("models_ready") else t("onb_title"), modifier = Modifier.weight(1f))
                if (!allOk) TextButton(onClick = onSetup) { Text(t("onb_next")) }
            }
        }
    }

    Button(onClick = { if (SampleCall.running()) SampleCall.stop() else SampleCall.start(ctx) },
        enabled = models.ready(), modifier = Modifier.fillMaxWidth(),
        colors = ButtonDefaults.buttonColors(containerColor = Palette.teal)) {
        Text(if (SampleCall.running()) t("stop") else t("home_test_call"))
    }

    if (call != null) {
        val level = assessment?.level ?: Level.LOW
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.background(Palette.of(level).copy(alpha = 0.12f)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(t("listening") + " · " + t("risk_" + level.name.lowercase()), fontWeight = FontWeight.Bold, color = Palette.of(level))
                transcript.takeLast(6).forEach { Text(it.text, fontSize = 14.sp) }
                if (level == Level.HIGH) {
                    Text(t("warning_title"), fontWeight = FontWeight.Bold, color = Palette.red, fontSize = 18.sp)
                    assessment?.hits?.forEach { Text("• " + it.rule.reason(settings.lang), fontSize = 14.sp) }
                    Text(t("warning_advice"), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }

    Text(t("home_recent"), fontWeight = FontWeight.SemiBold)
    val records = remember(tick, call) { settings.store().all().take(10) }
    if (records.isEmpty()) Text(t("home_no_calls"), color = MaterialTheme.colorScheme.onSurfaceVariant)
    records.forEach { r ->
        Card(Modifier.fillMaxWidth().clickable { ctx.startActivity(SummaryActivity.intent(ctx, r.id)) }) {
            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(r.at)) + " · " + r.kind.name.lowercase())
                    r.reasons.firstOrNull()?.let { Text(it, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                Text(t("risk_" + r.level.name.lowercase()), color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.background(Palette.of(r.level), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp))
            }
        }
    }
    TextButton(onClick = onSettings) { Text(t("settings_title")) }
}

@Composable
fun SettingsScreen(settings: Settings, t: (String) -> String, onBack: () -> Unit) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    var name by remember { mutableStateOf(settings.clientName.orEmpty()) }
    var key by remember { mutableStateOf(settings.apiKey.orEmpty()) }
    var gName by remember { mutableStateOf(settings.guardianName.orEmpty()) }
    var gPhone by remember { mutableStateOf(settings.guardianPhone.orEmpty()) }
    var keep by remember { mutableStateOf(settings.keepTranscripts) }
    var saved by remember { mutableStateOf(false) }
    val smsLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    OutlinedTextField(name, { name = it; saved = false }, label = { Text(t("settings_name")) }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(gName, { gName = it; saved = false }, label = { Text(t("settings_guardian_name")) }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(gPhone, { gPhone = it; saved = false }, label = { Text(t("settings_guardian_phone")) }, modifier = Modifier.fillMaxWidth())
    Text(t("perm_sms_why"), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    OutlinedTextField(key, { key = it; saved = false }, label = { Text(t("settings_api_key")) },
        visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth())
    Text(t("settings_api_key_hint"), fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(t("settings_keep"), modifier = Modifier.weight(1f))
        Switch(keep, { keep = it; saved = false })
    }
    Button(onClick = {
        settings.clientName = name; settings.guardianName = gName; settings.guardianPhone = gPhone
        settings.apiKey = key; settings.keepTranscripts = keep; saved = true
        if (gPhone.isNotBlank() && !PermissionStatus(ctx).granted(Manifest.permission.SEND_SMS)) smsLauncher.launch(Manifest.permission.SEND_SMS)
    }, modifier = Modifier.fillMaxWidth()) { Text(if (saved) t("saved") else t("save")) }
    OutlinedButton(onClick = { ctx.startActivity(Intent(ctx, ProbeActivity::class.java)) }, modifier = Modifier.fillMaxWidth()) { Text(t("settings_mic_test")) }
    TextButton(onClick = onBack) { Text("←") }
}
