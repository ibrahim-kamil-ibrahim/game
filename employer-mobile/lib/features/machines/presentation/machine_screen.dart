import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/common.dart';
import '../../dashboard/providers/dashboard_providers.dart';
import '../../payments/models/payment_draft.dart';
import '../models/machine.dart';

class MachineScreen extends ConsumerStatefulWidget {
  const MachineScreen({super.key, required this.machineId, this.resolved});

  final String machineId;
  final ResolvedMachine? resolved;

  @override
  ConsumerState<MachineScreen> createState() => _MachineScreenState();
}

class _MachineScreenState extends ConsumerState<MachineScreen> {
  PackageOption? _selected;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(machineDetailProvider(widget.machineId));
    final data = widget.resolved ?? async.value;
    final timezone = ref.watch(businessTimezoneProvider);

    if (data == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Machine')),
        body: async.isLoading
            ? const LoadingView(label: 'Loading machine')
            : ErrorView(
                message: _message(async.error),
                onRetry: () =>
                    ref.invalidate(machineDetailProvider(widget.machineId)),
              ),
      );
    }

    final machine = data.machine;
    final packages = data.packages;
    final selected = _selected ?? (packages.isNotEmpty ? packages.first : null);
    final canRent = machine.isAvailable && packages.isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: Text(machine.name),
        actions: [
          if (async.isLoading)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 140),
        children: [
          _MachineHeader(machine: machine),
          const SizedBox(height: 14),
          if (machine.activeSession != null) ...[
            _InUseBanner(
              session: machine.activeSession!,
              timezone: timezone,
              onOpen: () =>
                  context.push('/session/${machine.activeSession!.id}'),
            ),
            const SizedBox(height: 14),
          ] else if (!machine.isAvailable) ...[
            _NoticeBanner(
              icon: Icons.construction,
              color: AppColors.warning,
              title: machine.status == 'MAINTENANCE'
                  ? 'Under maintenance'
                  : 'Machine unavailable',
              message: 'This machine cannot be rented right now. Ask your administrator for details.',
            ),
            const SizedBox(height: 14),
          ],
          if (machine.description != null &&
              machine.description!.isNotEmpty) ...[
            AppCard(
              child: Text(
                machine.description!,
                style: const TextStyle(
                  fontSize: 12.5,
                  color: AppColors.textSecondary,
                  height: 1.5,
                ),
              ),
            ),
            const SizedBox(height: 14),
          ],
          SectionHeader(
            title: 'Choose a package',
            subtitle: 'Prices and durations are set by the administrator',
          ),
          if (packages.isEmpty)
            const AppCard(
              child: EmptyView(
                title: 'No packages available',
                description: 'This machine has no active packages. Ask the administrator to configure one.',
                icon: Icons.inventory_2_outlined,
              ),
            )
          else
            ...packages.map(
              (package) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _PackageTile(
                  package: package,
                  selected: selected?.id == package.id,
                  enabled: canRent,
                  onTap: () => setState(() => _selected = package),
                ),
              ),
            ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.brandSurface,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, size: 16, color: AppColors.brand),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Collect the exact cash amount shown before starting. The employer cannot change the price or duration.',
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
        ],
      ),
      bottomNavigationBar: canRent && selected != null
          ? SafeArea(
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                decoration: const BoxDecoration(
                  color: AppColors.surface,
                  border: Border(top: BorderSide(color: AppColors.navy100)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            selected.name,
                            style: const TextStyle(
                              fontSize: 11.5,
                              color: AppColors.textSecondary,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          Text(
                            formatEtb(selected.priceSantim),
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: AppColors.navy,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    SizedBox(
                      width: 190,
                      child: FilledButton(
                        onPressed: () => context.push(
                          '/payment',
                          extra: PaymentDraft(
                            machine: machine,
                            package: selected,
                          ),
                        ),
                        child: const Text('Confirm cash'),
                      ),
                    ),
                  ],
                ),
              ),
            )
          : null,
    );
  }

  String _message(Object? error) {
    if (error == null) return 'This machine could not be loaded.';
    return ApiException.fromError(error).message;
  }
}

class _MachineHeader extends StatelessWidget {
  const _MachineHeader({required this.machine});

  final MachineModel machine;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              MachineImage(imageUrl: machine.imageUrl, size: 72),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            machine.name,
                            style: const TextStyle(
                              fontSize: 16.5,
                              fontWeight: FontWeight.w800,
                              color: AppColors.navy,
                            ),
                          ),
                        ),
                        StatusBadge.machine(machine.status),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${machine.code}${machine.categoryName != null ? ' • ${machine.categoryName}' : ''}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    if (machine.location != null &&
                        machine.location!.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          const Icon(
                            Icons.place_outlined,
                            size: 13,
                            color: AppColors.navy400,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            machine.location!,
                            style: const TextStyle(
                              fontSize: 11.5,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (machine.brand != null || machine.model != null) ...[
            const Divider(height: 22),
            Row(
              children: [
                if (machine.brand != null)
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Brand',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppColors.textSecondary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          machine.brand!,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.navy,
                          ),
                        ),
                      ],
                    ),
                  ),
                if (machine.model != null)
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Model',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppColors.textSecondary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          machine.model!,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.navy,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _PackageTile extends StatelessWidget {
  const _PackageTile({
    required this.package,
    required this.selected,
    required this.enabled,
    required this.onTap,
  });

  final PackageOption package;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: enabled ? onTap : null,
      borderColor: selected ? AppColors.brand : AppColors.navy100,
      color: selected ? AppColors.brandSurface : AppColors.surface,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: selected ? AppColors.brand : AppColors.navy200,
                width: 2,
              ),
            ),
            child: selected
                ? Center(
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.brand,
                      ),
                    ),
                  )
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  package.name,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
                Text(
                  '${package.durationMinutes} minutes'
                  '${package.description != null && package.description!.isNotEmpty ? ' • ${package.description}' : ''}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            formatEtb(package.priceSantim),
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: selected ? AppColors.brand : AppColors.navy,
            ),
          ),
        ],
      ),
    );
  }
}

class _InUseBanner extends StatelessWidget {
  const _InUseBanner({
    required this.session,
    required this.timezone,
    required this.onOpen,
  });

  final ActiveSessionSummary session;
  final String timezone;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.brandSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.brand.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          const Icon(Icons.timer_outlined, color: AppColors.brand),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Machine currently in use',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
                Text(
                  '${session.packageName} • ends ${formatTime(session.endsAt, timezone: timezone)}',
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          TextButton(onPressed: onOpen, child: const Text('Open')),
        ],
      ),
    );
  }
}

class _NoticeBanner extends StatelessWidget {
  const _NoticeBanner({
    required this.icon,
    required this.color,
    required this.title,
    required this.message,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
                Text(
                  message,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.textSecondary,
                    height: 1.4,
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
