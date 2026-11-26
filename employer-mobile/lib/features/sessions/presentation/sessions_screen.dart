import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/common.dart';
import '../../../core/widgets/session_countdown.dart';
import '../../dashboard/providers/dashboard_providers.dart';
import '../models/session.dart';

class SessionsScreen extends ConsumerStatefulWidget {
  const SessionsScreen({super.key});

  @override
  ConsumerState<SessionsScreen> createState() => _SessionsScreenState();
}

class _SessionsScreenState extends ConsumerState<SessionsScreen>
    with WidgetsBindingObserver {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _timer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (mounted) ref.invalidate(activeSessionsProvider);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(activeSessionsProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(activeSessionsProvider);
    final snapshot = async.value;
    final timezone = ref.watch(businessTimezoneProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Active sessions'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => ref.invalidate(activeSessionsProvider),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          ref.invalidate(activeSessionsProvider);
          try {
            await ref.read(activeSessionsProvider.future);
          } catch (_) {}
        },
        child: async.isLoading && snapshot == null
            ? ListView(children: const [SizedBox(height: 80), LoadingView()])
            : async.hasError && snapshot == null
            ? ListView(
                children: [
                  const SizedBox(height: 60),
                  ErrorView(
                    message: ApiException.fromError(async.error!).message,
                    onRetry: () => ref.invalidate(activeSessionsProvider),
                  ),
                ],
              )
            : snapshot == null || snapshot.sessions.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(20, 60, 20, 120),
                children: [
                  const EmptyView(
                    title: 'No active sessions',
                    description: 'Start a rental by scanning a machine QR code.',
                    icon: Icons.timer_off_outlined,
                  ),
                  const SizedBox(height: 8),
                  PrimaryButton(
                    label: 'Scan machine QR',
                    icon: Icons.qr_code_scanner,
                    onPressed: () => context.push('/scan'),
                  ),
                ],
              )
            : ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 110),
                children: [
                  if (snapshot.offline)
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AppColors.warningSurface,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Row(
                        children: [
                          Icon(
                            Icons.cloud_off_outlined,
                            size: 16,
                            color: AppColors.warning,
                          ),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Offline — showing saved sessions. The server timer keeps running.',
                              style: TextStyle(
                                fontSize: 11.5,
                                color: AppColors.warning,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  Text(
                    '${snapshot.sessions.length} running on the floor',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 10),
                  ...snapshot.sessions.map(
                    (session) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _SessionCard(
                        session: session,
                        serverTime: snapshot.serverTime,
                        timezone: timezone,
                        onTap: () => context.push('/session/${session.id}'),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Timers are synchronized with the server every few seconds.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 10.5, color: AppColors.navy400),
                  ),
                ],
              ),
      ),
    );
  }
}

class _SessionCard extends StatelessWidget {
  const _SessionCard({
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
    final paused = session.isPaused;
    return AppCard(
      onTap: onTap,
      borderColor: paused
          ? AppColors.warning.withValues(alpha: 0.5)
          : AppColors.navy100,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              MachineImage(imageUrl: null, size: 42),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session.machine.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14.5,
                        fontWeight: FontWeight.w700,
                        color: AppColors.navy,
                      ),
                    ),
                    Text(
                      '${session.machine.code} • ${session.packageName}',
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              StatusBadge.session(session.status),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: paused ? AppColors.warningSurface : AppColors.navy,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.timer_outlined,
                  size: 18,
                  color: paused ? AppColors.warning : AppColors.brandLight,
                ),
                const SizedBox(width: 8),
                SessionCountdown(
                  session: session,
                  serverTime: serverTime,
                  compact: true,
                  style: TextStyle(
                    fontSize: 22,
                    color: paused ? AppColors.warning : Colors.white,
                  ),
                ),
                const Spacer(),
                Text(
                  'ends ${formatTime(session.endsAt, timezone: timezone)}',
                  style: TextStyle(
                    fontSize: 10.5,
                    color: paused ? AppColors.warning : AppColors.navy200,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Text(
                formatEtb(session.totalPriceSantim),
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.navy,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                session.paymentRef,
                style: const TextStyle(fontSize: 10, color: AppColors.navy400),
              ),
              const Spacer(),
              const Text(
                'Manage',
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: AppColors.brand,
                ),
              ),
              const Icon(Icons.chevron_right, size: 18, color: AppColors.brand),
            ],
          ),
        ],
      ),
    );
  }
}
