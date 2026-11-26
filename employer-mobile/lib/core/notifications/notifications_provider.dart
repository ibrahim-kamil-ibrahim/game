import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'alarm_service.dart';
import 'local_notifications_service.dart';

final localNotificationsServiceProvider = Provider<LocalNotificationsService>((
  ref,
) {
  throw UnimplementedError(
    'LocalNotificationsService must be overridden at startup',
  );
});

final alarmServiceProvider = Provider<AlarmService>((ref) => AlarmService());
