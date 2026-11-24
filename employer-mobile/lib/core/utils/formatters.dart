import 'package:intl/intl.dart';
import 'package:timezone/timezone.dart' as tz;

import '../config/app_config.dart';

String _safeTimezone(String? name) {
  final zone = name?.isNotEmpty == true ? name! : AppConfig.fallbackTimezone;
  try {
    tz.getLocation(zone);
    return zone;
  } catch (_) {
    return AppConfig.fallbackTimezone;
  }
}

DateTime inBusinessTime(DateTime? value, String? timezone) {
  if (value == null) return DateTime.now();
  try {
    return tz.TZDateTime.from(
      value.toUtc(),
      tz.getLocation(_safeTimezone(timezone)),
    );
  } catch (_) {
    return value.toLocal();
  }
}

String formatDateTime(
  DateTime? value, {
  String? timezone,
  String pattern = 'd MMM yyyy, HH:mm',
}) {
  if (value == null) return '—';
  return DateFormat(pattern).format(inBusinessTime(value, timezone));
}

String formatDate(
  DateTime? value, {
  String? timezone,
  String pattern = 'd MMM yyyy',
}) {
  if (value == null) return '—';
  return DateFormat(pattern).format(inBusinessTime(value, timezone));
}

String formatTime(DateTime? value, {String? timezone}) {
  if (value == null) return '—';
  return DateFormat('HH:mm').format(inBusinessTime(value, timezone));
}

String formatCountdown(int totalSeconds) {
  final safe = totalSeconds < 0 ? 0 : totalSeconds;
  final hours = safe ~/ 3600;
  final minutes = (safe % 3600) ~/ 60;
  final seconds = safe % 60;
  if (hours > 0) {
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
  }
  return '${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
}

String formatEtb(int santim) {
  final value = santim / 100;
  return '${NumberFormat('#,##0.00', 'en_US').format(value)} ETB';
}

String formatSantimShort(int santim) {
  return NumberFormat('#,##0.00', 'en_US').format(santim / 100);
}

String formatDurationSeconds(int? seconds) {
  if (seconds == null) return '—';
  final minutes = (seconds / 60).round();
  if (minutes < 60) return '$minutes min';
  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  return rest == 0 ? '$hours h' : '$hours h $rest min';
}

String humanize(String? value) {
  if (value == null || value.isEmpty) return '—';
  return value
      .toLowerCase()
      .split('_')
      .map(
        (part) => part.isEmpty
            ? part
            : '${part[0].toUpperCase()}${part.substring(1)}',
      )
      .join(' ');
}

String greetingForHour(int hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

String initialsOf(String name) {
  final parts = name
      .trim()
      .split(RegExp(r'\s+'))
      .where((part) => part.isNotEmpty)
      .toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}
