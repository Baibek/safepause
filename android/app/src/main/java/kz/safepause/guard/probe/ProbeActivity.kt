package kz.safepause.guard.probe

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import kotlin.concurrent.thread
import kotlin.math.sqrt

/**
 * Microphone probe: shows whether the app hears audio while a call is active.
 * Start a call on speakerphone, come back here, tap "Probe 10 s" and watch the level bar
 * while the other side speaks.
 */
class ProbeActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var bar: ProgressBar
    @Volatile private var running = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        status = TextView(this).apply { textSize = 16f; setPadding(0, 24, 0, 24) }
        bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 3000 }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 96, 48, 48)
            setBackgroundColor(Color.WHITE)
            addView(TextView(context).apply {
                text = "SafePause · микрофон сынағы / тест микрофона"
                textSize = 20f
                setTextColor(Color.parseColor("#14213d"))
            })
            addView(Button(context).apply {
                text = "Арнайы мүмкіндіктер / Спец. возможности"
                setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
            })
            addView(Button(context).apply {
                text = "Probe 10 s"
                setOnClickListener { probe() }
            })
            addView(bar)
            addView(status)
        }
        root.gravity = Gravity.TOP
        setContentView(root)
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        }
    }

    private fun probe() {
        if (running) return
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 1); return
        }
        running = true
        thread {
            val rate = 16000
            val size = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT) * 2
            val rec = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, rate,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size)
            val buf = ShortArray(rate / 10)
            var max = 0.0
            try {
                rec.startRecording()
                val end = System.currentTimeMillis() + 10_000
                while (System.currentTimeMillis() < end) {
                    val n = rec.read(buf, 0, buf.size)
                    if (n <= 0) continue
                    var sum = 0.0
                    for (i in 0 until n) sum += buf[i].toDouble() * buf[i]
                    val rms = sqrt(sum / n)
                    if (rms > max) max = rms
                    runOnUiThread { bar.progress = rms.toInt(); status.text = "RMS ${rms.toInt()} · max ${max.toInt()}" }
                }
            } catch (e: Exception) {
                runOnUiThread { status.text = "Error: ${e.message}" }
            } finally {
                rec.release()
                running = false
                val verdict = if (max < 60) "Тыныштық — микрофон бөгелген болуы мүмкін / Тишина — микрофон, вероятно, заблокирован"
                              else "Дыбыс бар / Звук есть"
                runOnUiThread { status.text = "max RMS ${max.toInt()} — $verdict" }
            }
        }
    }
}
