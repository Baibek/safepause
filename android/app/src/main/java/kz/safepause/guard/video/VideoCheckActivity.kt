package kz.safepause.guard.video

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle

/** Asks Android for screen-capture consent (required every time), then hands the token to VideoCheckService. */
class VideoCheckActivity : Activity() {
    companion object {
        fun launch(ctx: Context) = ctx.startActivity(Intent(ctx, VideoCheckActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        startActivityForResult(getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent(), 7)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION") super.onActivityResult(requestCode, resultCode, data)
        if (resultCode == RESULT_OK && data != null) VideoCheckService.start(this, resultCode, data)
        finish()   // back to the WhatsApp call; the overlay shows the steps
    }
}
