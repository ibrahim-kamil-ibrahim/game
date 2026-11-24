import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/common.dart';
import '../../dashboard/models/dashboard_models.dart';
import '../../dashboard/providers/dashboard_providers.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationsProvider);
    final timezone = ref.watch(businessTimezoneProvider);
    final items = async.value ?? const <AppNotification>[];
    final unread = items.where((item) => item.isUnread).length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton(
            onPressed: unread == 0
                ? null
                : () async {
                    await ref
                        .read(employerRepositoryProvider)
                        .markAllNotificationsRead();
                    ref.invalidate(notificationsProvider);
                    ref.invalidate(dashboardProvider);
                  },
            child: const Text('Mark all read'),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.brand,
        onRefresh: () async {
          ref.invalidate(notificationsProvider);
          try {
            await ref.read(notificationsProvider.future);
          } catch (_) {}
        },
        child: async.isLoading && items.isEmpty
            ? ListView(children: const [SizedBox(height: 80), LoadingView()])
            : async.hasError && items.isEmpty
            ? ListView(
                children: [
                  const SizedBox(height: 60),
                  ErrorView(
                    message: ApiException.fromError(async.error!).message,
                    onRetry: () => ref.invalidate(notificationsProvider),
                  ),
                ],
              )
            : items.isEmpty
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 60),
                  EmptyView(
                    title: 'No notifications',
                    description: 'Session warnings, expiry notices and payment confirmations appear here.',
                    icon: Icons.notifications_none,
                  ),
                ],
              )
            : ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 110),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final item = items[index];
                  return _NotificationTile(
                    item: item,
                    timezone: timezone,
                    onTap: () async {
                      if (item.isUnread) {
                        await ref
                            .read(employerRepositoryProvider)
                            .markNotificationRead(item.id);
                        ref.invalidate(notificationsProvider);
                        ref.invalidate(dashboardProvider);
                      }
                    },
                  );
                },
              ),
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.item,
    required this.timezone,
    required this.onTap,
  });

  final AppNotification item;
  final String timezone;
  final VoidCallback onTap;

  IconData get _icon => switch (item.type) {
    'SESSION_EXPIRED' => Icons.timer_off_outlined,
    'SESSION_EXPIRING' => Icons.timer_outlined,
    'SESSION_STARTED' => Icons.play_circle_outline,
    'SESSION_ENDED' => Icons.stop_circle_outlined,
    'SESSION_EXTENDED' => Icons.add_alarm,
    'PAYMENT_RECORDED' => Icons.payments_outlined,
    'EMPLOYER_ACTIVITY' => Icons.person_outline,
    _ => Icons.notifications_outlined,
  };

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: onTap,
      color: item.isUnread ? AppColors.brandSurface : AppColors.surface,
      borderColor: item.isUnread
          ? AppColors.brand.withValues(alpha: 0.25)
          : AppColors.navy100,
      padding: const EdgeInsets.all(13),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppColors.navy100,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(_icon, size: 18, color: AppColors.navy600),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.title,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.navy,
                        ),
                      ),
                    ),
                    if (item.isUnread)
                      Container(
                        width: 7,
                        height: 7,
                        decoration: const BoxDecoration(
                          color: AppColors.brand,
                          shape: BoxShape.circle,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  item.body,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  formatDateTime(item.createdAt, timezone: timezone),
                  style: const TextStyle(
                    fontSize: 10,
                    color: AppColors.navy400,
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
