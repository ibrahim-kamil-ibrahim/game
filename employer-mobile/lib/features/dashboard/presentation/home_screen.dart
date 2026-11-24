import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/notifications/notifications_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/common.dart';
import '../../../core/widgets/session_countdown.dart';
import '../../auth/providers/auth_controller.dart';
import '../../machines/models/machine.dart';
import '../../sessions/models/session.dart';
import '../models/dashboard_models.dart';
import '../providers/dashboard_providers.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen>
    with WidgetsBindingObserver {
  Timer? _pollTimer;
  String _notificationSignature = '';
  Set<String> _knownSessionIds = <String>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _pollTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted) ref.invalidate(dashboardProvider);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final service = ref.read(localNotificationsServiceProvider);
      await service.requestPermissions();
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(dashboardProvider);
      ref.invalidate(activeSessionsProvider);
      ref.read(authControllerProvider.notifier).reloadProfile();
    }
  }

  Future<void> _refresh() async {
    ref.invalidate(dashboardProvider);
    try {
      await ref.read(dashboardProvider.future);
    } catch (_) {
      // The error is rendered by the provider.
    }
  }

  void _syncNotifications(EmployerDashboard dashboard) {
    final currentIds = dashboard.activeSessions
        .map((session) => session.id)
        .toSet();
    final removedIds = _knownSessionIds.difference(currentIds);
    _knownSessionIds = currentIds;

    final signature = dashboard.activeSessions
        .map(
          (session) =>
              '${session.id}:${session.status}:${session.endsAt?.toIso8601String()}',
        )
        .join('|');
    if (signature == _notificationSignature) return;
    _notificationSignature = signature;
    final service = ref.read(localNotificationsServiceProvider);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      for (final id in removedIds) {
        await service.cancelForSession(id);
      }
      for (final session in dashboard.activeSessions) {
        await service.scheduleForSession(
          session: session,
          warningMinutes: dashboard.settings.expiryWarningMinutes,
          timezone: dashboard.timezone,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final user = auth.value;
    final dashboardAsync = ref.watch(dashboardProvider);
    final connectivity = ref.watch(connectivityProvider).value;
    final offlineFromConnectivity =
        connectivity != null && connectivity.contains(ConnectivityResult.none);

    ref.listen(connectivityProvider, (previous, next) {
      final wasOffline =
          previous?.value?.contains(ConnectivityResult.none) ?? false;
      final isOffline = next.value?.contains(ConnectivityResult.none) ?? false;
      if (wasOffline && !isOffline) {
        ref.invalidate(dashboardProvider);
        ref.invalidate(activeSessionsProvider);
      }
    });

    final dashboard = dashboardAsync.value;
    if (dashboard != null) _syncNotifications(dashboard);

    final timezone = user?.business.timezone ?? AppConfigTimezone.fallback;
    final firstName = (user?.fullName ?? '').split(' ').first;
    final now = DateTime.now();

    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 70,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${greetingForHour(now.hour)}, $firstName',
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
            Text(
              formatDate(now, timezone: timezone, pattern: 'EEEE, d MMMM yyyy'),
              style: const TextStyle(
                fontSize: 11.5,
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Notifications',
            onPressed: () => context.push('/notifications'),
            icon: Badge(
              isLabelVisible: (dashboard?.unreadNotifications ?? 0) > 0,
              label: Text('${dashboard?.unreadNotifications ?? 0}'),
              backgroundColor: AppColors.danger,
              child: const Icon(Icons.notifications_outlined),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12, left: 4),
            child: GestureDetector(
              onTap: () => context.go('/profile'),
              child: CircleAvatar(
                radius: 18,
                backgroundColor: AppColors.brandSurface,
                child: Text(
                  initialsOf(user?.fullName ?? 'E'),
                  style: const TextStyle(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        color: AppColors.brand,
        child: dashboardAsync.isLoading && dashboard == null
            ? const LoadingView(label: 'Loading your dashboard')
            : dashboardAsync.hasError && dashboard == null
            ? ListView(
                children: [
                  const SizedBox(height: 60),
                  ErrorView(
                    message: errorMessageOf(dashboardAsync.error),
                    onRetry: () => ref.invalidate(dashboardProvider),
                  ),
                ],
              )
            : dashboard == null
            ? const SizedBox.shrink()
            : ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 150),
                children: [
                  if (offlineFromConnectivity || dashboard.offline) ...[
                    _OfflineBanner(
                      cachedAt: dashboard.cachedAt,
                      timezone: timezone,
                    ),
                    const SizedBox(height: 12),
                  ],
                  _CashCard(dashboard: dashboard),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: _QuickAction(
                          icon: Icons.qr_code_scanner,
                          title: 'Scan QR',
                          subtitle: 'Start a rental',
                          color: AppColors.brand,
                          onTap: () => context.push('/scan'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _QuickAction(
                          icon: Icons.timer_outlined,
                          title: 'Sessions',
                          subtitle: '${dashboard.todayActiveSessions} active',
                          color: AppColors.navy,
                          onTap: () => context.go('/sessions'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 22),
                  if (dashboard.activeSessions.isNotEmpty) ...[
                    SectionHeader(
                      title: 'Active sessions',
                      subtitle: 'Live server timers',
                      actionLabel: 'View all',
                      onAction: () => context.go('/sessions'),
                    ),
                    ...dashboard.activeSessions.map(
                      (session) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _ActiveSessionCard(
                          session: session,
                          serverTime: dashboard.serverTime,
                          timezone: timezone,
                          onTap: () => context.push('/session/${session.id}'),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  SectionHeader(
                    title: 'Machines',
                    subtitle:
                        '${dashboard.machinesAvailable} available • ${dashboard.machinesInUse} in use',
                    actionLabel: 'Scan to rent',
                    onAction: () => context.push('/scan'),
                  ),
                  _MachineGrid(
                    machines: dashboard.machineList,
                    serverTime: dashboard.serverTime,
                    timezone: timezone,
                  ),
                  const SizedBox(height: 22),
                  SectionHeader(
                    title: 'Recent cash payments',
                    actionLabel: 'History',
                    onAction: () => context.go('/history'),
                  ),
                  if (dashboard.recentPayments.isEmpty)
                    const AppCard(
                      child: EmptyView(
                        title: 'No transactions yet',
                        description:
                            'Cash payments you record will appear here.',
                        icon: Icons.receipt_long_outlined,
                      ),
                    )
                  else
                    AppCard(
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: [
                          for (
                            var index = 0;
                            index < dashboard.recentPayments.length;
                            index++
                          ) ...[
                            _PaymentTile(
                              payment: dashboard.recentPayments[index],
                              timezone: timezone,
                            ),
                            if (index < dashboard.recentPayments.length - 1)
                              const Divider(
                                height: 1,
                                indent: 16,
                                endIndent: 16,
                              ),
                          ],
                        ],
                      ),
                    ),
                  const SizedBox(height: 18),
                  Center(
                    child: Text(
                      'Server time ${formatTime(dashboard.serverTime, timezone: timezone)}',
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: AppColors.navy400,
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

class AppConfigTimezone {
  static const fallback = 'Africa/Addis_Ababa';
}

String errorMessageOf(Object? error) {
  if (error == null) return 'Unknown error';
  final text = error.toString();
  return text.replaceFirst('ApiException: ', '');
}

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner({this.cachedAt, required this.timezone});

  final DateTime? cachedAt;
  final String timezone;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.warningSurface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.warning.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.cloud_off_outlined,
            size: 17,
            color: AppColors.warning,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              cachedAt == null
                  ? 'Offline — showing the last saved data. Sessions continue on the server.'
                  : 'Offline — showing data saved ${formatDateTime(cachedAt, timezone: timezone)}. Sessions continue on the server.',
              style: const TextStyle(
                fontSize: 11.5,
                color: AppColors.warning,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CashCard extends StatelessWidget {
  const _CashCard({required this.dashboard});

  final EmployerDashboard dashboard;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.navy,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.payments_outlined,
                  color: AppColors.brandLight,
                  size: 19,
                ),
              ),
              const SizedBox(width: 10),
              const Text(
                'Cash collected today',
                style: TextStyle(
                  color: AppColors.navy200,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const Spacer(),
              Text(
                dashboard.businessName,
                style: const TextStyle(
                  color: AppColors.navy400,
                  fontSize: 10.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              formatEtb(dashboard.todayCollectedSantim),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 34,
                fontWeight: FontWeight.w800,
                letterSpacing: -1,
              ),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _CashStat(
                label: 'Transactions',
                value: '${dashboard.todayTransactions}',
              ),
              _CashStat(
                label: 'Completed',
                value: '${dashboard.todayCompletedSessions}',
              ),
              _CashStat(
                label: 'Active now',
                value: '${dashboard.todayActiveSessions}',
                highlight: true,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _CashStat extends StatelessWidget {
  const _CashStat({
    required this.label,
    required this.value,
    this.highlight = false,
  });

  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: TextStyle(
              color: highlight ? AppColors.brandLight : Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          Text(
            label,
            style: const TextStyle(color: AppColors.navy400, fontSize: 10.5),
          ),
        ],
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  const _QuickAction({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(13),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
                Text(
                  subtitle,
                  style: const TextStyle(
                    fontSize: 10.5,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActiveSessionCard extends StatelessWidget {
  const _ActiveSessionCard({
    required this.session,
    required this.serverTime,
    required this.timezone,
    required this.onTap,
  });

  final SessionModel session;
  final DateTime? serverTime;
  final String timezone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: onTap,
      borderColor: session.isPaused
          ? AppColors.warning.withValues(alpha: 0.5)
          : AppColors.brand.withValues(alpha: 0.35),
      child: Row(
        children: [
          Container(
            width: 4,
            height: 64,
            decoration: BoxDecoration(
              color: session.isPaused ? AppColors.warning : AppColors.brand,
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        session.machine.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: AppColors.navy,
                        ),
                      ),
                    ),
                    StatusBadge.session(session.status),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${session.packageName} • ${formatEtb(session.totalPriceSantim)}',
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(
                      Icons.timer_outlined,
                      size: 14,
                      color: AppColors.navy400,
                    ),
                    const SizedBox(width: 4),
                    SessionCountdown(
                      session: session,
                      serverTime: serverTime,
                      compact: true,
                      style: const TextStyle(fontSize: 14),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      'Ends ${formatTime(session.endsAt, timezone: timezone)}',
                      style: const TextStyle(
                        fontSize: 10.5,
                        color: AppColors.navy400,
                      ),
                    ),
                    const Spacer(),
                    const Icon(
                      Icons.chevron_right,
                      size: 18,
                      color: AppColors.navy400,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MachineGrid extends StatelessWidget {
  const _MachineGrid({
    required this.machines,
    required this.serverTime,
    required this.timezone,
  });

  final List<MachineModel> machines;
  final DateTime? serverTime;
  final String timezone;

  @override
  Widget build(BuildContext context) {
    if (machines.isEmpty) {
      return const AppCard(
        child: EmptyView(
          title: 'No machines yet',
          description: 'Your administrator has not registered machines for this business.',
          icon: Icons.sports_esports_outlined,
        ),
      );
    }

    final sorted = [...machines]
      ..sort((a, b) {
        if (a.isAvailable == b.isAvailable) return a.name.compareTo(b.name);
        return a.isAvailable ? -1 : 1;
      });

    return SizedBox(
      height: 132,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: sorted.length,
        separatorBuilder: (_, _) => const SizedBox(width: 10),
        itemBuilder: (context, index) {
          final machine = sorted[index];
          return SizedBox(
            width: 176,
            child: AppCard(
              onTap: () => context.push('/machine/${machine.id}'),
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      MachineImage(imageUrl: machine.imageUrl, size: 38),
                      const Spacer(),
                      StatusBadge.machine(machine.status),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    machine.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navy,
                    ),
                  ),
                  Text(
                    '${machine.code}${machine.categoryName != null ? ' • ${machine.categoryName}' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 10,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const Spacer(),
                  if (machine.activeSession != null)
                    Text(
                      'In use until ${formatTime(machine.activeSession!.endsAt, timezone: timezone)}',
                      style: const TextStyle(
                        fontSize: 10,
                        color: AppColors.brand,
                        fontWeight: FontWeight.w600,
                      ),
                    )
                  else
                    Text(
                      machine.isAvailable
                          ? 'Tap to rent'
                          : humanize(machine.status),
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: machine.isAvailable
                            ? AppColors.success
                            : AppColors.textSecondary,
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({required this.payment, required this.timezone});

  final RecentPayment payment;
  final String timezone;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: AppColors.successSurface,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.check_circle_outline,
              color: AppColors.success,
              size: 20,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${payment.machineName} • ${payment.packageName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: AppColors.navy,
                  ),
                ),
                Text(
                  '${payment.transactionRef} • ${formatDateTime(payment.paidAt, timezone: timezone, pattern: 'd MMM, HH:mm')}',
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            formatEtb(payment.amountSantim),
            style: const TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: AppColors.navy,
            ),
          ),
        ],
      ),
    );
  }
}
