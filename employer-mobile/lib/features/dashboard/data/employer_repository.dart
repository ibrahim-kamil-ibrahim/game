import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../dashboard/models/dashboard_models.dart';
import '../../machines/models/machine.dart';
import '../../sessions/models/session.dart';

class EmployerRepository {
  EmployerRepository(this._api);

  final ApiClient _api;

  static const _dashboardCacheKey = 'cache_dashboard_v1';
  static const _activeSessionsCacheKey = 'cache_active_sessions_v1';

  Future<EmployerDashboard> fetchDashboard() async {
    final prefs = await SharedPreferences.getInstance();
    try {
      final data = await _api.get('/employer/dashboard');
      if (data is! Map<String, dynamic>) {
        throw ApiException(message: 'Unexpected dashboard response.');
      }
      await prefs.setString(
        _dashboardCacheKey,
        jsonEncode({
          'savedAt': DateTime.now().toUtc().toIso8601String(),
          'data': data,
        }),
      );
      return EmployerDashboard.fromJson(data);
    } catch (error) {
      final cached = _readCachedDashboard(prefs);
      if (cached != null) return cached;
      throw ApiException.fromError(error);
    }
  }

  EmployerDashboard? _readCachedDashboard(SharedPreferences prefs) {
    final raw = prefs.getString(_dashboardCacheKey);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      final savedAt = DateTime.tryParse(decoded['savedAt'] as String? ?? '');
      final data = decoded['data'] as Map<String, dynamic>?;
      if (data == null) return null;
      return EmployerDashboard.fromJson(data, offline: true, cachedAt: savedAt);
    } catch (_) {
      return null;
    }
  }

  Future<ActiveSessionsSnapshot> fetchActiveSessions() async {
    final prefs = await SharedPreferences.getInstance();
    try {
      final envelope = await _api.getEnvelope('/sessions/active');
      final items = (envelope['data'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(SessionModel.fromJson)
          .toList();
      final serverTime = parseDate(envelope['serverTime']);
      await prefs.setString(
        _activeSessionsCacheKey,
        jsonEncode({
          'savedAt': DateTime.now().toUtc().toIso8601String(),
          'serverTime': serverTime?.toIso8601String(),
          'sessions': items.map((session) => session.toJson()).toList(),
        }),
      );
      return ActiveSessionsSnapshot(
        sessions: items,
        serverTime: serverTime,
        fetchedAt: DateTime.now(),
      );
    } catch (error) {
      final cached = _readCachedSessions(prefs);
      if (cached != null) return cached;
      throw ApiException.fromError(error);
    }
  }

  ActiveSessionsSnapshot? _readCachedSessions(SharedPreferences prefs) {
    final raw = prefs.getString(_activeSessionsCacheKey);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      final sessions = (decoded['sessions'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(SessionModel.fromJson)
          .toList();
      return ActiveSessionsSnapshot(
        sessions: sessions,
        serverTime: DateTime.tryParse(decoded['serverTime'] as String? ?? ''),
        fetchedAt:
            DateTime.tryParse(decoded['savedAt'] as String? ?? '') ??
            DateTime.now(),
        offline: true,
      );
    } catch (_) {
      return null;
    }
  }

  Future<ResolvedMachine> resolveQr(String token) async {
    final data = await _api.post('/qr/resolve', data: {'token': token});
    if (data is! Map<String, dynamic>) {
      throw ApiException(message: 'Unexpected QR response.');
    }
    final machine = MachineModel.fromJson(
      data['machine'] as Map<String, dynamic>? ?? const {},
    );
    final packages = (data['packages'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(PackageOption.fromJson)
        .toList();
    final activeSessionJson = data['activeSession'];
    final settingsJson = data['settings'];
    return ResolvedMachine(
      machine: machine,
      packages: packages,
      qrToken: token,
      available: data['available'] as bool? ?? true,
      activeSession: activeSessionJson is Map<String, dynamic>
          ? SessionModel.fromJson(activeSessionJson)
          : null,
      serverTime: parseDate(data['serverTime']),
      allowExtension: settingsJson is Map<String, dynamic>
          ? (settingsJson['allowExtension'] as bool? ?? true)
          : true,
    );
  }

  Future<ResolvedMachine> fetchMachine(String machineId) async {
    final data = await _api.get('/machines/$machineId');
    if (data is! Map<String, dynamic>) {
      throw ApiException(message: 'Unexpected machine response.');
    }
    final machine = MachineModel.fromJson(
      data['machine'] as Map<String, dynamic>? ?? const {},
    );
    final packages = (data['packages'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(PackageOption.fromJson)
        .toList();
    return ResolvedMachine(machine: machine, packages: packages);
  }

  Future<PaymentResult> createCashPayment({
    required String machineId,
    required String packageId,
    required String idempotencyKey,
  }) async {
    final data = await _api.post(
      '/payments/cash',
      data: {
        'machineId': machineId,
        'packageId': packageId,
        'idempotencyKey': idempotencyKey,
      },
    );
    if (data is! Map<String, dynamic>) {
      throw ApiException(message: 'Unexpected payment response.');
    }
    return PaymentResult.fromJson(data);
  }

  Future<SessionModel> startSession(
    String paymentId, {
    required String qrToken,
  }) async {
    final data = await _api.post(
      '/sessions/start',
      data: {'paymentId': paymentId, 'qrToken': qrToken},
    );
    if (data is Map<String, dynamic> &&
        data['session'] is Map<String, dynamic>) {
      return SessionModel.fromJson(data['session'] as Map<String, dynamic>);
    }
    if (data is Map<String, dynamic>) return SessionModel.fromJson(data);
    throw ApiException(message: 'Unexpected session response.');
  }

  Future<SessionModel> fetchSession(String sessionId) async {
    final data = await _api.get('/sessions/$sessionId');
    if (data is Map<String, dynamic> &&
        data['session'] is Map<String, dynamic>) {
      return SessionModel.fromJson(data['session'] as Map<String, dynamic>);
    }
    throw ApiException(message: 'Unexpected session response.');
  }

  Future<SessionModel> pauseSession(String sessionId) async {
    final data = await _api.post('/sessions/$sessionId/pause');
    return SessionModel.fromJson(data as Map<String, dynamic>);
  }

  Future<SessionModel> resumeSession(String sessionId) async {
    final data = await _api.post('/sessions/$sessionId/resume');
    return SessionModel.fromJson(data as Map<String, dynamic>);
  }

  Future<SessionModel> endSession(
    String sessionId, {
    String? reason,
    required String qrToken,
  }) async {
    final data = await _api.post(
      '/sessions/$sessionId/end',
      data: {'reason': reason, 'qrToken': qrToken},
    );
    return SessionModel.fromJson(data as Map<String, dynamic>);
  }

  Future<SessionModel> extendSession({
    required String sessionId,
    required String packageId,
    required String idempotencyKey,
    required String qrToken,
  }) async {
    final data = await _api.post(
      '/sessions/$sessionId/extensions',
      data: {
        'packageId': packageId,
        'idempotencyKey': idempotencyKey,
        'qrToken': qrToken,
      },
    );
    return SessionModel.fromJson(data as Map<String, dynamic>);
  }

  Future<PaymentHistoryPage> fetchPaymentHistory({
    int page = 1,
    int pageSize = 20,
  }) async {
    final envelope = await _api.getEnvelope(
      '/payments',
      query: {'page': page, 'pageSize': pageSize},
    );
    final items = (envelope['data'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(PaymentHistoryItem.fromJson)
        .toList();
    final meta = (envelope['meta'] as Map<String, dynamic>?) ?? const {};
    return PaymentHistoryPage(
      items: items,
      hasMore: meta['hasNextPage'] as bool? ?? false,
      total: (meta['total'] as num?)?.toInt() ?? items.length,
    );
  }

  Future<SessionHistoryPage> fetchSessionHistory({
    int page = 1,
    int pageSize = 20,
  }) async {
    final envelope = await _api.getEnvelope(
      '/sessions',
      query: {'page': page, 'pageSize': pageSize},
    );
    final items = (envelope['data'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(SessionHistoryItem.fromJson)
        .toList();
    final meta = (envelope['meta'] as Map<String, dynamic>?) ?? const {};
    return SessionHistoryPage(
      items: items,
      hasMore: meta['hasNextPage'] as bool? ?? false,
      total: (meta['total'] as num?)?.toInt() ?? items.length,
    );
  }

  Future<List<AppNotification>> fetchNotifications({
    int page = 1,
    int pageSize = 30,
  }) async {
    final envelope = await _api.getEnvelope(
      '/notifications',
      query: {'page': page, 'pageSize': pageSize},
    );
    return (envelope['data'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(AppNotification.fromJson)
        .toList();
  }

  Future<void> markNotificationRead(String id) async {
    await _api.post('/notifications/$id/read');
  }

  Future<void> markAllNotificationsRead() async {
    await _api.post('/notifications/read-all');
  }
}
