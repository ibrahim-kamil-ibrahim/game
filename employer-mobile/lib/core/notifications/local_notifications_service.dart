import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../features/sessions/models/session.dart';

class LocalNotificationsService {
  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  static const _channelId = 'game_sessions';
  static const _channelName = 'Game sessions';
  static const _channelDescription =
      'Session timers, expiry warnings and payments';

  static const _details = NotificationDetails(
    android: AndroidNotificationDetails(
      _channelId,
      _channelName,
      channelDescription: _channelDescription,
      importance: Importance.high,
      priority: Priority.high,
      playSound: true,
      enableVibration: true,
    ),
  );

  Future<void>? _initialization;

  /// Initializes the plugin once. Startup never blocks on this: the app renders
  /// first and notification calls await the same future when needed.
  Future<void> init() => _initialization ??= _doInit();

  Future<void> _doInit() async {
    try {
      const androidSettings = AndroidInitializationSettings(
        '@mipmap/ic_launcher',
      );
      const settings = InitializationSettings(android: androidSettings);
      await _plugin.initialize(settings: settings);

      final android = _plugin
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >();
      await android?.createNotificationChannel(
        const AndroidNotificationChannel(
          _channelId,
          _channelName,
          description: _channelDescription,
          importance: Importance.high,
        ),
      );
    } catch (_) {
      // Notifications are best-effort. The server remains the source of truth
      // for session expiry even if the platform rejects notifications.
    }
  }

  Future<void> requestPermissions() async {
    try {
      final android = _plugin
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >();
      await android?.requestNotificationsPermission();
    } catch (_) {
      // Permission can be denied; the app continues to work.
    }
  }

  Future<void> showNow({
    required int id,
    required String title,
    required String body,
  }) async {
    await init();
    try {
      await _plugin.show(
        id: id,
        title: title,
        body: body,
        notificationDetails: _details,
      );
    } catch (_) {}
  }

  int _baseId(String sessionId) {
    var hash = 0;
    for (final unit in sessionId.codeUnits) {
      hash = (hash * 31 + unit) & 0x3fffffff;
    }
    return (hash % 500000) * 10;
  }

  Future<void> cancelForSession(String sessionId) async {
    await init();
    final base = _baseId(sessionId);
    for (var offset = 0; offset < 3; offset++) {
      try {
        await _plugin.cancel(id: base + offset);
      } catch (_) {}
    }
  }

  /// Schedules a warning, a one-minute warning and the expiry notification.
  /// The backend remains responsible for actually ending the session; these
  /// notifications only inform the employer.
  Future<void> scheduleForSession({
    required SessionModel session,
    required int warningMinutes,
    required String timezone,
  }) async {
    await init();
    await cancelForSession(session.id);

    if (!session.isRunning || session.endsAt == null) return;
    if (session.isPaused) return;

    final location = _location(timezone);
    final base = _baseId(session.id);
    final endsAt = session.endsAt!.toUtc();

    if (warningMinutes > 1) {
      await _scheduleAt(
        id: base,
        title: '$warningMinutes minutes remaining',
        body: '${session.packageName} on ${session.machine.name} ends soon.',
        when: endsAt.subtract(Duration(minutes: warningMinutes)),
        location: location,
      );
    }

    await _scheduleAt(
      id: base + 1,
      title: '1 minute remaining',
      body: '${session.machine.name}: time is almost up.',
      when: endsAt.subtract(const Duration(minutes: 1)),
      location: location,
    );

    await _scheduleAt(
      id: base + 2,
      title: 'Session expired',
      body: '${session.packageName} on ${session.machine.name} has ended.',
      when: endsAt,
      location: location,
    );
  }

  tz.Location _location(String timezone) {
    try {
      return tz.getLocation(timezone);
    } catch (_) {
      return tz.getLocation('Africa/Addis_Ababa');
    }
  }

  Future<void> _scheduleAt({
    required int id,
    required String title,
    required String body,
    required DateTime when,
    required tz.Location location,
  }) async {
    if (!when.isAfter(DateTime.now().add(const Duration(seconds: 5)))) return;
    try {
      await _plugin.zonedSchedule(
        id: id,
        title: title,
        body: body,
        scheduledDate: tz.TZDateTime.from(when, location),
        notificationDetails: _details,
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      );
    } catch (_) {
      // Scheduling can fail when exact alarms are restricted. Ignore.
    }
  }
}
