import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/notifications/notifications_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/presentation/splash_screen.dart';
import '../../auth/providers/auth_controller.dart';
import '../../sessions/models/session.dart';
import '../providers/dashboard_providers.dart';

class EmployerShell extends ConsumerStatefulWidget {
  const EmployerShell({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<EmployerShell> createState() => _EmployerShellState();
}

class _EmployerShellState extends ConsumerState<EmployerShell> {
  Timer? _tickTimer;
  Timer? _pollTimer;
  bool _ending = false;

  @override
  void initState() {
    super.initState();
    _tickTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
    _pollTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (mounted) ref.invalidate(activeSessionsProvider);
    });
  }

  @override
  void dispose() {
    _tickTimer?.cancel();
    _pollTimer?.cancel();
    ref.read(alarmServiceProvider).stopAlarm();
    super.dispose();
  }

  DateTime _serverNow(ActiveSessionsSnapshot? snapshot) {
    if (snapshot?.serverTime == null) return DateTime.now();
    final offset = snapshot!.serverTime!.difference(snapshot.fetchedAt);
    return DateTime.now().add(offset);
  }

  Future<void> _scanAndEndExpired(SessionModel session) async {
    if (_ending) return;
    final qrToken = await context.push<String>(
      '/scan',
      extra: <String, String>{
        'machineId': session.machine.id,
        'machineName': session.machine.name,
      },
    );
    if (qrToken == null || !mounted) return;

    setState(() => _ending = true);
    try {
      await ref
          .read(employerRepositoryProvider)
          .endSession(
            session.id,
            reason: 'Time expired',
            qrToken: qrToken,
          );
      ref.invalidate(activeSessionsProvider);
      ref.invalidate(dashboardProvider);
      ref.invalidate(sessionDetailProvider(session.id));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${session.machine.name} ended and released.',
            ),
          ),
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(ApiException.fromError(error).message),
            backgroundColor: AppColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _ending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    if (auth.isLoading || auth.value == null) {
      return const SplashScreen();
    }

    final snapshot = ref.watch(activeSessionsProvider).value;
    final serverNow = _serverNow(snapshot);
    final expiredSessions = (snapshot?.sessions ?? const <SessionModel>[])
        .where((s) => s.isTimeUpAt(serverNow))
        .toList();

    final alarm = ref.read(alarmServiceProvider);
    if (expiredSessions.isNotEmpty) {
      alarm.startAlarm();
    } else {
      alarm.stopAlarm();
    }

    final location = GoRouterState.of(context).matchedLocation;
    final index = switch (location) {
      '/sessions' => 1,
      '/history' => 2,
      '/profile' => 3,
      _ => 0,
    };

    return Scaffold(
      body: Column(
        children: [
          if (expiredSessions.isNotEmpty)
            _ExpiredAlarmBanner(
              sessions: expiredSessions,
              busy: _ending,
              onScanToEnd: () => _scanAndEndExpired(expiredSessions.first),
            ),
          Expanded(child: widget.child),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/scan'),
        backgroundColor: AppColors.brand,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.qr_code_scanner),
        label: const Text(
          'Scan QR',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) {
          switch (value) {
            case 0:
              context.go('/');
            case 1:
              context.go('/sessions');
            case 2:
              context.go('/history');
            case 3:
              context.go('/profile');
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.timer_outlined),
            selectedIcon: Icon(Icons.timer),
            label: 'Sessions',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long),
            label: 'History',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }
}

class _ExpiredAlarmBanner extends StatelessWidget {
  const _ExpiredAlarmBanner({
    required this.sessions,
    required this.busy,
    required this.onScanToEnd,
  });

  final List<SessionModel> sessions;
  final bool busy;
  final VoidCallback onScanToEnd;

  @override
  Widget build(BuildContext context) {
    final first = sessions.first;
    final extra = sessions.length > 1 ? ' (+${sessions.length - 1} more)' : '';
    return Material(
      color: AppColors.danger,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
          child: Row(
            children: [
              const Icon(
                Icons.notifications_active,
                color: Colors.white,
                size: 22,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Time expired: ${first.machine.name}$extra',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                    const Text(
                      'Scan the machine QR code to end & stop alarm',
                      style: TextStyle(
                        color: Colors.white70,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: AppColors.danger,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                ),
                onPressed: busy ? null : onScanToEnd,
                icon: const Icon(Icons.qr_code_scanner, size: 16),
                label: const Text(
                  'Scan QR',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
