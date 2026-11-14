package kz.safepause.guard.video

import android.graphics.Bitmap
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kz.safepause.detector.FaceSample
import kz.safepause.detector.Step

/** On-device ML Kit face detection for one frame (bundled model, works offline). Call from a background thread. */
class FaceSignals {
    private val detector = FaceDetection.getClient(FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
        .setMinFaceSize(0.1f)
        .build())

    fun sample(bitmap: Bitmap, step: Step, atMs: Long): FaceSample {
        val faces = runCatching { Tasks.await(detector.process(InputImage.fromBitmap(bitmap, 0))) }.getOrDefault(emptyList())
        val face = faces.maxByOrNull { it.boundingBox.width() * it.boundingBox.height() }
            ?: return FaceSample(atMs, step, false, null, null)
        val area = face.boundingBox.width().toFloat() * face.boundingBox.height() / (bitmap.width * bitmap.height)
        return FaceSample(atMs, step, true, face.headEulerAngleY, area)
    }

    fun close() = detector.close()

    companion object {
        /** Mean luminance 0..255 on a sparse grid; black frames mean the source app blocks capture. */
        fun luminance(b: Bitmap): Double {
            var sum = 0.0; var n = 0
            val stepX = maxOf(1, b.width / 32); val stepY = maxOf(1, b.height / 32)
            for (y in 0 until b.height step stepY) for (x in 0 until b.width step stepX) {
                val c = b.getPixel(x, y)
                sum += 0.299 * ((c shr 16) and 0xff) + 0.587 * ((c shr 8) and 0xff) + 0.114 * (c and 0xff); n++
            }
            return if (n == 0) 0.0 else sum / n
        }
    }
}
