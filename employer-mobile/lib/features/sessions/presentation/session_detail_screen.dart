import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/notifications/notifications_provider.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/common.dart';
import '../../../core/widgets/session_countdown.dart';
import '../../auth/models/auth_user.dart';
import '../../auth/providers/auth_controller.dart';
import '../../dashboard/providers/dashboard_providers.dart';
import '../../machines/models/machine.dart';
import '../../payments/models/payment_draft.dart';
import '../models/session.dart';

class SessionDetailScreen extends ConsumerStatefulWidget {
  const SessionDetailScreen({super.key, required this.sessionId, this.initial});

  final String sessionId;
  final Object? initial;

  @override
  ConsumerState<SessionDetailScreen> createState() =>
      _SessionDetailScreenState();
}

class _SessionDetailScreenState extends ConsumerState<SessionDetailScreen>
    with WidgetsBindingObserver {
  Timer? _pollTimer;
  SessionModel? _cached;
  String? _lastStatus;
  String _notificationSignature = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    if (widget.initial is SessionModel) {
      _cached = widget.initial as SessionModel;
      _lastStatus = _cached!.status;
    }
    WidgetsBinding.instance.addObserver(this);
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) ref.invalidate(sessionDetailProvider(widget.sessionId));
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
      ref.invalidate(sessionDetailProvider(widget.sessionId));
      ref.read(authControllerProvider.notifier).reloadProfile();
    }
  }

  void _syncNotifications(SessionModel session) {
    final signature =
        '${session.id}:${session.status}:${session.endsAt?.toIso8601String()}';
    if (signature == _notificationSignature) {
      _lastStatus = session.status;
      return;
    }
    _notificationSignature = signature;
    final wasRunning = _lastStatus == 'ACTIVE' || _lastStatus == 'PAUSED';
    _lastStatus = session.status;

    final service = ref.read(localNotificationsServiceProvider);
    final settings = ref.read(authControllerProvider).value?.settings;
    final timezone = ref.read(businessTimezoneProvider);

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (session.isFinished) {
        await service.cancelForSession(session.id);
        if (wasRunning) {
          await service.showNow(
            id: session.id.hashCode & 0x3fffffff,
            title: 'Session ended',
            body:
                '${session.packageName} on ${session.machine.name} has ended.',
          );
        }
      } else {
        await service.scheduleForSession(
          session: session,
          warningMinutes: settings?.expiryWarningMinutes ?? 5,
          timezone: timezone,
        );
      }
    });
  }

  Future<void> _pause(SessionModel session) async {
    setState(() => _busy = true);
    try {
      await ref.read(employerRepositoryProvider).pauseSession(session.id);
      ref.invalidate(sessionDetailProvider(widget.sessionId));
      ref.invalidate(dashboardProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Session paused. The timer is frozen on the server.'),
          ),
        );
      }
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resume(SessionModel session) async {
    setState(() => _busy = true);
    try {
      await ref.read(employerRepositoryProvider).resumeSession(session.id);
      ref.invalidate(sessionDetailProvider(widget.sessionId));
      ref.invalidate(dashboardProvider);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Session resumed.')));
      }
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _end(SessionModel session) async {
    final qrToken = await context.push<String>(
      '/scan',
      extra: <String, String>{
        'machineId': session.machine.id,
        'machineName': session.machine.name,
      },
    );
    if (qrToken == null || !mounted) return;

    final settings = ref.read(authControllerProvider).value?.settings;
    final reason = session.isExpired
        ? 'Time expired'
        : await _askEndReason(
            requireReason: settings?.requireEndReason ?? false,
          );
    if (reason == null) return;

    setState(() => _busy = true);
    try {
      await ref
          .read(employerRepositoryProvider)
          .endSession(
            session.id,
            reason: reason.isEmpty ? null : reason,
            qrToken: qrToken,
          );
      ref.invalidate(sessionDetailProvider(widget.sessionId));
      ref.invalidate(dashboardProvider);
      ref.invalidate(activeSessionsProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Session ended. The machine is now available.'),
          ),
        );
      }
    } catch (error) {
      _showError(error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _extend(SessionModel session) async {
    final qrToken = await context.push<String>(
      '/scan',
      extra: <String, String>{
        'machineId': session.machine.id,
        'machineName': session.machine.name,
      },
    );
    if (qrToken == null || !mounted) return;

    setState(() => _busy = true);
    ResolvedMachine? machineData;
    try {
      machineData = await ref
          .read(employerRepositoryProvider)
          .fetchMachine(session.machine.id);
    } catch (error) {
      _showError(error);
      if (mounted) setState(() => _busy = false);
      return;
    }
    if (!mounted) return;
    setState(() => _busy = false);
    final machine = machineData;

    final chosen = await showModalBottomSheet<PackageOption>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Add More Time',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.navy,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Select a package configured for this machine, then confirm the cash payment.',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 14),
                if (machine.packages.isEmpty)
                  const EmptyView(
                    title: 'No extension packages',
                    description:
                        'No active packages are configured for this machine.',
                  )
                else
                  Flexible(
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: machine.packages.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final package = machine.packages[index];
                        return AppCard(
                          onTap: () => Navigator.of(sheetContext).pop(package),
                          padding: const EdgeInsets.all(13),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      package.name,
                                      style: const TextStyle(
                                        fontSize: 13.5,
                                        fontWeight: FontWeight.w700,
                                        color: AppColors.navy,
                                      ),
                                    ),
                                    Text(
                                      '${package.durationMinutes} minutes',
                                      style: const TextStyle(
                                        fontSize: 11,
                                        color: AppColors.textSecondary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                formatEtb(package.priceSantim),
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.navy,
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );

    if (chosen == null || !mounted) return;

    await context.push(
      '/payment',
      extra: PaymentDraft(
        machine: machine.machine,
        package: chosen,
        qrToken: qrToken,
        activeSession: session,
      ),
    );
  }

  Future<String?> _askEndReason({required bool requireReason}) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: const Text('End this session?'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'The machine will be released immediately and the payment stays recorded.',
                    style: TextStyle(
                      fontSize: 12.5,
                      color: AppColors.textSecondary,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: controller,
                    maxLength: 300,
                    decoration: InputDecoration(
                      labelText: requireReason
                          ? 'Reason (required)'
                          : 'Reason (optional)',
                      hintText: 'e.g. Customer finished early',
                    ),
                    onChanged: (_) => setDialogState(() {}),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(dialogContext).pop(null),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.danger,
                  ),
                  onPressed: requireReason && controller.text.trim().length < 3
                      ? null
                      : () =>
                            Navigator.of(dialogContext)
                                .pop(controller.text.trim()),
                  child: const Text('End session'),
                ),
              ],
            );
          },
        );
      },
    );
    controller.dispose();
    return result;
  }

  void _showError(Object error) {
    if (!mounted) return;
    final apiError = ApiException.fromError(error);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(apiError.message),
        backgroundColor: AppColors.danger,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(sessionDetailProvider(widget.sessionId));
    final session = async.value ?? _cached;
    final timezone = ref.watch(businessTimezoneProvider);
    final settings = ref.watch(authControllerProvider).value?.settings;

    if (session != null) {
      _cached = session;
      _syncNotifications(session);
    }

    if (session == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Session')),
        body: async.isLoading
            ? const LoadingView(label: 'Loading session')
            : ErrorView(
                message: async.error == null
                    ? 'Session not found'
                    : ApiException.fromError(async.error!).message,
                onRetry: () =>
                    ref.invalidate(sessionDetailProvider(widget.sessionId)),
              ),
      );
    }

    final running = session.isRunning;
    final extensions = session.extensions;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(session.machine.name),
            Text(
              session.machine.code,
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Center(child: StatusBadge.session(session.status)),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(sessionDetailProvider(widget.sessionId));
          try {
            await ref.read(sessionDetailProvider(widget.sessionId).future);
          } catch (_) {}
        },
        color: AppColors.brand,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AppColors.navy,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                children: [
                  Text(
                    '${session.packageName.toUpperCase()} • ${session.durationMinutes} MIN',
                    style: const TextStyle(
                      fontSize: 10.5,
                      letterSpacing: 1.1,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navy400,
                    ),
                  ),
                  const SizedBox(height: 10),
                  SessionCountdown(
                    session: session,
                    style: const TextStyle(fontSize: 56, color: Colors.white),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.payments_outlined,
                        size: 15,
                        color: AppColors.navy200,
                      ),
                      const SizedBox(width: 5),
                      Text(
                        '${formatEtb(session.totalPriceSantim)} • ${session.paymentRef}',
                        style: const TextStyle(
                          fontSize: 11.5,
                          color: AppColors.navy200,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            if (async.hasError)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(
                  'Offline or sync delayed: showing the last known session state.',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.warning.withValues(alpha: 0.9),
                  ),
                ),
              ),
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Session details',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: AppColors.navy,
                    ),
                  ),
                  const SizedBox(height: 8),
                  InfoRow(
                    label: 'Machine',
                    value: '${session.machine.name} (${session.machine.code})',
                  ),
                  InfoRow(label: 'Package', value: session.packageName),
                  InfoRow(
                    label: 'Started',
                    value: formatDateTime(
                      session.startedAt,
                      timezone: timezone,
                    ),
                  ),
                  InfoRow(
                    label: 'Scheduled end',
                    value: formatDateTime(session.endsAt, timezone: timezone),
                  ),
                  InfoRow(label: 'Payment', value: session.paymentRef),
                  InfoRow(
                    label: 'Amount',
                    value: formatEtb(session.totalPriceSantim),
                  ),
                  if (session.actualEndedAt != null)
                    InfoRow(
                      label: 'Ended',
                      value: formatDateTime(
                        session.actualEndedAt,
                        timezone: timezone,
                      ),
                    ),
                  if (session.actualDurationSeconds != null)
                    InfoRow(
                      label: 'Actual duration',
                      value: formatDurationSeconds(
                        session.actualDurationSeconds,
                      ),
                    ),
                  if (session.endReason != null)
                    InfoRow(label: 'End reason', value: session.endReason!),
                  if (session.totalPausedSeconds > 0)
                    InfoRow(
                      label: 'Paused time',
                      value: '${session.totalPausedSeconds}s',
                    ),
                ],
              ),
            ),
            if (extensions.isNotEmpty) ...[
              const SizedBox(height: 14),
              AppCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Extensions',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.navy,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ...extensions.map(
                      (extension) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            InfoRow(
                              label: extension.packageName,
                              value:
                                  '+${extension.durationMinutes} min • ${formatEtb(extension.priceSantim)}',
                            ),
                            Text(
                              [
                                if (extension.previousEndsAt != null &&
                                    extension.newEndsAt != null)
                                  '${formatTime(extension.previousEndsAt, timezone: timezone)} -> ${formatTime(extension.newEndsAt, timezone: timezone)}',
                                if (extension.createdAt != null)
                                  formatDateTime(
                                    extension.createdAt,
                                    timezone: timezone,
                                  ),
                                if (extension.paymentRef != null)
                                  extension.paymentRef!,
                              ].join(' • '),
                              style: const TextStyle(
                                fontSize: 10.5,
                                color: AppColors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.brandSurface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    Icons.cloud_done_outlined,
                    size: 16,
                    color: AppColors.brand,
                  ),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'The countdown is synchronized with the server and keeps running even if this app is closed. The machine ends automatically when time expires.',
                      style: TextStyle(
                        fontSize: 11.5,
                        color: AppColors.brand,
                        height: 1.45,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (running || session.isExpired) ...[
              const SizedBox(height: 16),
              ..._actionButtons(session, settings),
            ] else ...[
              const SizedBox(height: 16),
              PrimaryButton(
                label: 'Back to home',
                icon: Icons.home_outlined,
                onPressed: () => context.go('/'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => context.go('/history'),
                icon: const Icon(Icons.receipt_long_outlined, size: 18),
                label: const Text('View transaction history'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  List<Widget> _actionButtons(
    SessionModel session,
    BusinessSettings? settings,
  ) {
    if (session.isExpired) {
      return [
        FilledButton.icon(
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.danger,
            minimumSize: const Size.fromHeight(50),
          ),
          onPressed: _busy ? null : () => _end(session),
          icon: const Icon(Icons.qr_code_scanner),
          label: const Text('Time expired — Scan QR to end'),
        ),
      ];
    }

    final allowExtension = settings?.allowExtension ?? true;
    final allowPause = settings?.allowPause ?? false;
    final allowEnd = settings?.allowManualEnd ?? false;

    return [
      if (allowExtension) ...[
        PrimaryButton(
          label: 'Add More Time',
          icon: Icons.add_alarm,
          loading: _busy,
          onPressed: () => _extend(session),
        ),
        const SizedBox(height: 10),
      ],
      if (allowPause) ...[
        OutlinedButton.icon(
          onPressed: _busy
              ? null
              : () => session.isPaused ? _resume(session) : _pause(session),
          icon: Icon(session.isPaused ? Icons.play_arrow : Icons.pause),
          label: Text(session.isPaused ? 'Resume session' : 'Pause session'),
        ),
        const SizedBox(height: 10),
      ],
      if (allowEnd)
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.danger,
            side: const BorderSide(color: AppColors.danger),
          ),
          onPressed: _busy ? null : () => _end(session),
          icon: const Icon(Icons.stop_circle_outlined),
          label: const Text('End session early'),
        ),
      if (!allowExtension && !allowPause && !allowEnd)
        const Text(
          'This session will end automatically. The administrator has disabled manual changes.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 11.5, color: AppColors.textSecondary),
        ),
    ];
  }
}
