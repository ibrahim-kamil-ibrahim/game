package com.gamezone.gamezone_employer

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
  private val channelName = "com.gamezone.gamezone_employer/alarm"
  private var mediaPlayer: MediaPlayer? = null

  override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
    super.configureFlutterEngine(flutterEngine)
    MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
      .setMethodCallHandler { call, result ->
        when (call.method) {
          "startAlarm" -> {
            startAlarm()
            result.success(null)
          }
          "stopAlarm" -> {
            stopAlarm()
            result.success(null)
          }
          else -> result.notImplemented()
        }
      }
  }

  private fun startAlarm() {
    if (mediaPlayer?.isPlaying == true) return
    stopAlarm()

    val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ?: return

    try {
      mediaPlayer = MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
        setDataSource(applicationContext, uri)
        isLooping = true
        prepare()
        start()
      }
    } catch (_: Exception) {
      stopAlarm()
    }
  }

  private fun stopAlarm() {
    try {
      mediaPlayer?.stop()
    } catch (_: Exception) {
    }
    try {
      mediaPlayer?.release()
    } catch (_: Exception) {
    }
    mediaPlayer = null
  }

  override fun onDestroy() {
    stopAlarm()
    super.onDestroy()
  }
}
