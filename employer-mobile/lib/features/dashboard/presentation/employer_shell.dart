import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/notifications/alarm_service.dart';
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
  late final AlarmService _alarmService;

  @override
  void initState() {
    super.initState();
    _alarmService = ref.read(alarmServiceProvider);
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
    _alarmService.stopAlarm();
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

    if (expiredSessions.isNotEmpty) {
      _alarmService.startAlarm();
    } else {
      _alarmService.stopAlarm();
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
              onScanToEnd: _scanAndEndExpired,
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
  final ValueChanged<SessionModel> onScanToEnd;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.danger,
      child: SafeArea(
        bottom: false,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 190),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.notifications_active,
                      color: Colors.white,
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        sessions.length == 1
                            ? 'Time expired — scan QR to stop alarm'
                            : '${sessions.length} machines expired — scan QR to stop alarm',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 12.5,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                for (var i = 0; i < sessions.length; i++) ...[
                  if (i > 0) const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          sessions[i].machine.code.isNotEmpty
                              ? '${sessions[i].machine.name} (${sessions[i].machine.code})'
                              : sessions[i].machine.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      FilledButton.icon(
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: AppColors.danger,
                          minimumSize: const Size(0, 34),
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                        ),
                        onPressed: busy ? null : () => onScanToEnd(sessions[i]),
                        icon: const Icon(Icons.qr_code_scanner, size: 15),
                        label: const Text(
                          'Scan QR',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
