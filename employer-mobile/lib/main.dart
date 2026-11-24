import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:timezone/data/latest_all.dart' as tz_data;

import 'app.dart';
import 'core/notifications/local_notifications_service.dart';
import 'core/notifications/notifications_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  tz_data.initializeTimeZones();

  final notifications = LocalNotificationsService();
  // Do not block the first frame on platform notification setup. Calls that
  // need notifications await the same initialization future.
  unawaited(notifications.init());

  runApp(
    ProviderScope(
      overrides: [
        localNotificationsServiceProvider.overrideWithValue(notifications),
      ],
      child: const GameZoneApp(),
    ),
  );
}
