import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/providers/auth_controller.dart';
import '../data/employer_repository.dart';
import '../models/dashboard_models.dart';
import '../../machines/models/machine.dart';
import '../../sessions/models/session.dart';

final employerRepositoryProvider = Provider<EmployerRepository>((ref) {
  return EmployerRepository(ref.watch(apiClientProvider));
});

final dashboardProvider = FutureProvider.autoDispose<EmployerDashboard>((ref) {
  return ref.watch(employerRepositoryProvider).fetchDashboard();
});

final activeSessionsProvider =
    FutureProvider.autoDispose<ActiveSessionsSnapshot>((ref) {
      return ref.watch(employerRepositoryProvider).fetchActiveSessions();
    });

final machineDetailProvider = FutureProvider.autoDispose
    .family<ResolvedMachine, String>((ref, machineId) {
      return ref.watch(employerRepositoryProvider).fetchMachine(machineId);
    });

final sessionDetailProvider = FutureProvider.autoDispose
    .family<SessionModel, String>((ref, sessionId) {
      return ref.watch(employerRepositoryProvider).fetchSession(sessionId);
    });

final paymentHistoryProvider = FutureProvider.autoDispose
    .family<PaymentHistoryPage, int>((ref, page) {
      return ref
          .watch(employerRepositoryProvider)
          .fetchPaymentHistory(page: page);
    });

final sessionHistoryProvider = FutureProvider.autoDispose
    .family<SessionHistoryPage, int>((ref, page) {
      return ref
          .watch(employerRepositoryProvider)
          .fetchSessionHistory(page: page);
    });

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>(
  (ref) {
    return ref.watch(employerRepositoryProvider).fetchNotifications();
  },
);

/// Emits the current connectivity list and every subsequent change. Used to
/// show an offline banner and to trigger a refresh when the connection returns.
final connectivityProvider = StreamProvider<List<ConnectivityResult>>((
  ref,
) async* {
  final connectivity = Connectivity();
  yield await connectivity.checkConnectivity();
  yield* connectivity.onConnectivityChanged;
});

final businessTimezoneProvider = Provider<String>((ref) {
  final user = ref.watch(authControllerProvider).value;
  return user?.business.timezone ?? 'Africa/Addis_Ababa';
});

final businessSettingsProvider = Provider((ref) {
  final user = ref.watch(authControllerProvider).value;
  return user?.settings;
});
