import 'package:flutter/services.dart';

/// Plays a continuous alarm sound on the device when a game session's time
/// expires, and keeps looping until [stopAlarm] is called (after the employer
/// scans the machine's QR code to end the session).
class AlarmService {
  static const _channel = MethodChannel('com.gamezone.gamezone_employer/alarm');

  bool _playing = false;

  bool get isPlaying => _playing;

  Future<void> startAlarm() async {
    if (_playing) return;
    _playing = true;
    try {
      await _channel.invokeMethod<void>('startAlarm');
    } on MissingPluginException {
      // Ignored in unit/widget tests without a native host.
    } on PlatformException {
      _playing = false;
    }
  }

  Future<void> stopAlarm() async {
    if (!_playing) return;
    _playing = false;
    try {
      await _channel.invokeMethod<void>('stopAlarm');
    } on MissingPluginException {
      // Ignored in unit/widget tests without a native host.
    } on PlatformException {
      // Best-effort stop.
    }
  }
}

