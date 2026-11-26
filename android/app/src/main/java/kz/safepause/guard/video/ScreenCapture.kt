package kz.safepause.guard.video

import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.os.Handler
import android.os.HandlerThread

/** Mirrors the screen into a small ImageReader and hands out the latest frame as a Bitmap. */
class ScreenCapture(private val projection: MediaProjection, screenW: Int, screenH: Int, dpi: Int) {
    private val width = 540
    private val height = (screenH.toFloat() / screenW * width).toInt()
    private val thread = HandlerThread("safepause-capture").apply { start() }
    private val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
    private val display: VirtualDisplay

    init {
        projection.registerCallback(object : MediaProjection.Callback() {}, Handler(thread.looper))
        display = projection.createVirtualDisplay("safepause-face-check", width, height, dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, reader.surface, null, Handler(thread.looper))
            ?: error("could not create the capture display")
    }

    fun latest(): Bitmap? {
        val image = reader.acquireLatestImage() ?: return null
        return image.use {
            val plane = it.planes[0]
            val rowPadding = plane.rowStride - plane.pixelStride * width
            val padded = Bitmap.createBitmap(width + rowPadding / plane.pixelStride, height, Bitmap.Config.ARGB_8888)
            padded.copyPixelsFromBuffer(plane.buffer)
            Bitmap.createBitmap(padded, 0, 0, width, height)
        }
    }

    fun close() {
        display.release(); reader.close(); projection.stop(); thread.quitSafely()
    }
}
