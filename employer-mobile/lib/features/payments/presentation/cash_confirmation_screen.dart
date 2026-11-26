import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:uuid/uuid.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/common.dart';
import '../../auth/providers/auth_controller.dart';
import '../../dashboard/models/dashboard_models.dart';
import '../../dashboard/providers/dashboard_providers.dart';
import '../models/payment_draft.dart';

class CashConfirmationScreen extends ConsumerStatefulWidget {
  const CashConfirmationScreen({super.key, required this.draft});

  final PaymentDraft draft;

  @override
  ConsumerState<CashConfirmationScreen> createState() =>
      _CashConfirmationScreenState();
}

class _CashConfirmationScreenState
    extends ConsumerState<CashConfirmationScreen> {
  final String _idempotencyKey = const Uuid().v4();
  bool _cashReceived = false;
  bool _processing = false;
  bool _starting = false;
  bool _paymentVoided = false;
  String? _error;
  PaymentResult? _payment;

  Future<void> _confirmCash() async {
    if (!_cashReceived || _processing || _payment != null) return;
    setState(() {
      _processing = true;
      _error = null;
    });

    try {
      final result = await ref
          .read(employerRepositoryProvider)
          .createCashPayment(
            machineId: widget.draft.machine.id,
            packageId: widget.draft.package.id,
            idempotencyKey: _idempotencyKey,
          );
      if (!mounted) return;
      setState(() {
        _payment = result;
        _processing = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _processing = false;
        _error = ApiException.fromError(error).message;
      });
    }
  }

  Future<void> _startGame() async {
    final payment = _payment;
    if (payment == null || _starting) return;
    setState(() {
      _starting = true;
      _error = null;
    });

    try {
      final session = await ref
          .read(employerRepositoryProvider)
          .startSession(payment.id, qrToken: widget.draft.qrToken);
      if (!mounted) return;
      ref.invalidate(dashboardProvider);
      ref.invalidate(activeSessionsProvider);
      setState(() => _starting = false);
      context.pushReplacement('/session/${session.id}', extra: session);
    } catch (error) {
      if (!mounted) return;
      final apiError = ApiException.fromError(error);
      final details = apiError.details;
      setState(() {
        _starting = false;
        _error = apiError.message;
        _paymentVoided =
            details is Map<String, dynamic> && details['paymentVoided'] == true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final timezone = ref.watch(businessTimezoneProvider);
    final user = ref.watch(authControllerProvider).value;
    final package = widget.draft.package;
    final machine = widget.draft.machine;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cash payment'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: _processing || _starting ? null : () => context.pop(),
          tooltip: 'Close',
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
        children: [
          const Center(child: StepDots(current: 1)),
          const SizedBox(height: 18),
          if (_payment == null)
            const Text(
              'Confirm the cash payment',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: AppColors.navy,
              ),
            )
          else
            const Text(
              'Payment recorded',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: AppColors.navy,
              ),
            ),
          const SizedBox(height: 4),
          Text(
            _payment == null
                ? 'Receive the physical cash from the customer before confirming.'
                : 'Now start the game session. The server timer begins immediately.',
            style: const TextStyle(
              fontSize: 12.5,
              color: AppColors.textSecondary,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 18),
          AppCard(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                Row(
                  children: [
                    MachineImage(imageUrl: machine.imageUrl, size: 48),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            machine.name,
                            style: const TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w700,
                              color: AppColors.navy,
                            ),
                          ),
                          Text(
                            '${machine.code}${machine.categoryName != null ? ' • ${machine.categoryName}' : ''}',
                            style: const TextStyle(
                              fontSize: 11.5,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    StatusBadge.machine(machine.status),
                  ],
                ),
                const Divider(height: 22),
                InfoRow(label: 'Package', value: package.name),
                InfoRow(
                  label: 'Duration',
                  value: '${package.durationMinutes} minutes',
                ),
                InfoRow(label: 'Payment method', value: 'Cash'),
                InfoRow(label: 'Employee', value: user?.fullName ?? 'Employer'),
                if (_payment != null)
                  InfoRow(label: 'Reference', value: _payment!.transactionRef),
                if (_payment != null)
                  InfoRow(
                    label: 'Paid at',
                    value: formatDateTime(_payment!.paidAt, timezone: timezone),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.navy,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _payment == null ? 'AMOUNT DUE' : 'AMOUNT RECEIVED',
                  style: const TextStyle(
                    fontSize: 10.5,
                    letterSpacing: 1.2,
                    color: AppColors.navy400,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  formatEtb(_payment?.amountSantim ?? package.priceSantim),
                  style: const TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                    letterSpacing: -0.8,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Physical cash only — no online payment is supported.',
                  style: TextStyle(fontSize: 11, color: AppColors.navy200),
                ),
              ],
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _paymentVoided
                    ? AppColors.warningSurface
                    : AppColors.dangerSurface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: (_paymentVoided ? AppColors.warning : AppColors.danger)
                      .withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    _paymentVoided
                        ? Icons.warning_amber_rounded
                        : Icons.error_outline,
                    size: 18,
                    color: _paymentVoided
                        ? AppColors.warning
                        : AppColors.danger,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _error!,
                      style: TextStyle(
                        fontSize: 12.5,
                        height: 1.4,
                        color: _paymentVoided
                            ? AppColors.warning
                            : AppColors.danger,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 18),
          if (_payment == null) ...[
            AppCard(
              padding: EdgeInsets.zero,
              child: CheckboxListTile(
                value: _cashReceived,
                onChanged: _processing
                    ? null
                    : (value) => setState(() => _cashReceived = value ?? false),
                activeColor: AppColors.brand,
                controlAffinity: ListTileControlAffinity.leading,
                title: Text(
                  'I have received ${formatEtb(package.priceSantim)} in cash from the customer',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.navy,
                  ),
                ),
                subtitle: const Text(
                  'This records the payment permanently. Only confirm after counting the cash.',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),
            PrimaryButton(
              label: 'Confirm cash payment',
              icon: Icons.payments_outlined,
              loading: _processing,
              onPressed: _cashReceived ? _confirmCash : null,
            ),
          ] else if (!_paymentVoided) ...[
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.successSurface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                children: [
                  Icon(Icons.check_circle, color: AppColors.success, size: 18),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Cash recorded. The machine stays reserved for this payment until the session starts.',
                      style: TextStyle(
                        fontSize: 11.5,
                        color: AppColors.success,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            PrimaryButton(
              label: 'Start game session',
              icon: Icons.play_arrow_rounded,
              loading: _starting,
              onPressed: _startGame,
            ),
            const SizedBox(height: 8),
            const Text(
              'The countdown is controlled by the server. Starting is atomic: no other employer can start the same machine.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 10.5,
                color: AppColors.navy400,
                height: 1.4,
              ),
            ),
          ] else ...[
            PrimaryButton(
              label: 'Back to home',
              icon: Icons.home_outlined,
              onPressed: () => context.go('/'),
            ),
          ],
        ],
      ),
    );
  }
}
