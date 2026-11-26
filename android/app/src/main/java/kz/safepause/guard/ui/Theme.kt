package kz.safepause.guard.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import kz.safepause.detector.Level

object Palette {
    val navy = Color(0xFF14213D)
    val amber = Color(0xFFE0A526)
    val teal = Color(0xFF0F4C4A)
    val red = Color(0xFFC8372D)
    val green = Color(0xFF1F7A55)
    val paper = Color(0xFFF5F2EA)

    fun of(level: Level) = when (level) { Level.LOW -> green; Level.SUSPICIOUS -> amber; Level.HIGH -> red }
}

@Composable
fun SafePauseTheme(content: @Composable () -> Unit) {
    val scheme = if (isSystemInDarkTheme())
        darkColorScheme(primary = Color(0xFF4FB98A), secondary = Palette.amber, error = Color(0xFFE5665C))
    else lightColorScheme(primary = Palette.teal, secondary = Palette.amber, error = Palette.red, background = Palette.paper)
    MaterialTheme(colorScheme = scheme, content = content)
}
