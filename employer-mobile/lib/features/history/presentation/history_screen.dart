import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/common.dart';
import '../../dashboard/models/dashboard_models.dart';
import '../../dashboard/providers/dashboard_providers.dart';

class HistoryScreen extends ConsumerStatefulWidget {
  const HistoryScreen({super.key});

  @override
  ConsumerState<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends ConsumerState<HistoryScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Transaction history'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.brand,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.brand,
          indicatorSize: TabBarIndicatorSize.tab,
          dividerColor: AppColors.navy100,
          tabs: const [
            Tab(text: 'Cash payments'),
            Tab(text: 'Sessions'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [_PaymentHistoryTab(), _SessionHistoryTab()],
      ),
    );
  }
}

class _PaymentHistoryTab extends ConsumerStatefulWidget {
  const _PaymentHistoryTab();

  @override
  ConsumerState<_PaymentHistoryTab> createState() => _PaymentHistoryTabState();
}

class _PaymentHistoryTabState extends ConsumerState<_PaymentHistoryTab>
    with AutomaticKeepAliveClientMixin {
  final List<PaymentHistoryItem> _items = [];
  int _page = 1;
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load(reset: true);
  }

  Future<void> _load({bool reset = false}) async {
    if (reset) {
      setState(() {
        _items.clear();
        _page = 1;
        _hasMore = true;
        _error = null;
        _loading = true;
      });
    } else {
      if (_loadingMore || !_hasMore) return;
      setState(() => _loadingMore = true);
    }

    try {
      final page = await ref
          .read(employerRepositoryProvider)
          .fetchPaymentHistory(page: _page);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _hasMore = page.hasMore;
        _page += 1;
        _loading = false;
        _loadingMore = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = ApiException.fromError(error).message;
        _loading = false;
        _loadingMore = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final timezone = ref.watch(businessTimezoneProvider);

    if (_loading) return const LoadingView(label: 'Loading payments');

    return RefreshIndicator(
      color: AppColors.brand,
      onRefresh: () => _load(reset: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 110),
        children: [
          if (_error != null)
            ErrorView(message: _error!, onRetry: () => _load(reset: true))
          else if (_items.isEmpty)
            const EmptyView(
              title: 'No cash payments yet',
              description: 'Payments you confirm for customers will be listed here permanently.',
              icon: Icons.receipt_long_outlined,
            )
          else ...[
            Text(
              '${_items.length}${_hasMore ? '+' : ''} transactions',
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 10),
            ..._items.map(
              (payment) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _PaymentTile(payment: payment, timezone: timezone),
              ),
            ),
            if (_hasMore)
              OutlinedButton(
                onPressed: _loadingMore ? null : () => _load(),
                child: _loadingMore
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Load more'),
              ),
          ],
        ],
      ),
    );
  }
}

class _PaymentTile extends StatelessWidget {
  const _PaymentTile({required this.payment, required this.timezone});

  final PaymentHistoryItem payment;
  final String timezone;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: AppColors.successSurface,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: const Icon(
                  Icons.payments_outlined,
                  color: AppColors.success,
                  size: 18,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      payment.machineName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.navy,
                      ),
                    ),
                    Text(
                      payment.packageName,
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                formatEtb(payment.amountSantim),
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: AppColors.navy,
                ),
              ),
            ],
          ),
          const Divider(height: 18),
          Row(
            children: [
              Text(
                payment.transactionRef,
                style: const TextStyle(
                  fontSize: 10.5,
                  color: AppColors.navy400,
                  fontFamily: 'monospace',
                ),
              ),
              if (payment.type == 'EXTENSION') ...[
                const SizedBox(width: 6),
                const StatusBadge(
                  label: 'Extension',
                  tone: BadgeTone.violet,
                  dot: false,
                ),
              ],
              const Spacer(),
              StatusBadge.payment(payment.status),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Text(
                formatDateTime(
                  payment.paidAt ?? payment.createdAt,
                  timezone: timezone,
                ),
                style: const TextStyle(
                  fontSize: 10.5,
                  color: AppColors.textSecondary,
                ),
              ),
              const Spacer(),
              if (payment.sessionStatus != null &&
                  payment.sessionStatus != 'COMPLETED')
                StatusBadge.session(payment.sessionStatus!),
            ],
          ),
        ],
      ),
    );
  }
}

class _SessionHistoryTab extends ConsumerStatefulWidget {
  const _SessionHistoryTab();

  @override
  ConsumerState<_SessionHistoryTab> createState() => _SessionHistoryTabState();
}

class _SessionHistoryTabState extends ConsumerState<_SessionHistoryTab>
    with AutomaticKeepAliveClientMixin {
  final List<SessionHistoryItem> _items = [];
  int _page = 1;
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  String? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load(reset: true);
  }

  Future<void> _load({bool reset = false}) async {
    if (reset) {
      setState(() {
        _items.clear();
        _page = 1;
        _hasMore = true;
        _error = null;
        _loading = true;
      });
    } else {
      if (_loadingMore || !_hasMore) return;
      setState(() => _loadingMore = true);
    }

    try {
      final page = await ref
          .read(employerRepositoryProvider)
          .fetchSessionHistory(page: _page);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _hasMore = page.hasMore;
        _page += 1;
        _loading = false;
        _loadingMore = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = ApiException.fromError(error).message;
        _loading = false;
        _loadingMore = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final timezone = ref.watch(businessTimezoneProvider);

    if (_loading) return const LoadingView(label: 'Loading sessions');

    return RefreshIndicator(
      color: AppColors.brand,
      onRefresh: () => _load(reset: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 110),
        children: [
          if (_error != null)
            ErrorView(message: _error!, onRetry: () => _load(reset: true))
          else if (_items.isEmpty)
            const EmptyView(
              title: 'No sessions yet',
              description: 'Sessions you operate will be listed here with their payment references.',
              icon: Icons.timer_outlined,
            )
          else ...[
            Text(
              '${_items.length}${_hasMore ? '+' : ''} sessions',
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 10),
            ..._items.map(
              (session) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _SessionHistoryTile(
                  session: session,
                  timezone: timezone,
                ),
              ),
            ),
            if (_hasMore)
              OutlinedButton(
                onPressed: _loadingMore ? null : () => _load(),
                child: _loadingMore
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Load more'),
              ),
          ],
        ],
      ),
    );
  }
}

class _SessionHistoryTile extends StatelessWidget {
  const _SessionHistoryTile({required this.session, required this.timezone});

  final SessionHistoryItem session;
  final String timezone;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(13),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${session.machineName} • ${session.machineCode}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
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
            session.packageName,
            style: const TextStyle(
              fontSize: 11.5,
              color: AppColors.textSecondary,
            ),
          ),
          const Divider(height: 18),
          Row(
            children: [
              Text(
                formatDateTime(
                  session.startedAt ?? session.createdAt,
                  timezone: timezone,
                ),
                style: const TextStyle(
                  fontSize: 10.5,
                  color: AppColors.textSecondary,
                ),
              ),
              const Spacer(),
              Text(
                formatEtb(session.priceSantim),
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: AppColors.navy,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Text(
                session.paymentRef,
                style: const TextStyle(
                  fontSize: 10,
                  color: AppColors.navy400,
                  fontFamily: 'monospace',
                ),
              ),
              const Spacer(),
              if (session.actualDurationSeconds != null)
                Text(
                  formatDurationSeconds(session.actualDurationSeconds),
                  style: const TextStyle(
                    fontSize: 10.5,
                    color: AppColors.textSecondary,
                  ),
                ),
              const SizedBox(width: 8),
              StatusBadge.payment(session.paymentStatus),
            ],
          ),
        ],
      ),
    );
  }
}
