import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../core/widgets/common.dart';
import '../../auth/providers/auth_controller.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final user = auth.value;
    if (user == null) {
      return const SizedBox.shrink();
    }
    final settings = user.settings;
    final timezone = user.business.timezone;

    return Scaffold(
      appBar: AppBar(title: const Text('My profile')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppColors.navy,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 30,
                  backgroundColor: AppColors.brand,
                  child: Text(
                    initialsOf(user.fullName),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.fullName,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        '@${user.username}',
                        style: const TextStyle(
                          color: AppColors.navy200,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          StatusBadge(
                            label: user.status == 'ACTIVE'
                                ? 'Active account'
                                : humanize(user.status),
                            tone: user.status == 'ACTIVE'
                                ? BadgeTone.green
                                : BadgeTone.red,
                          ),
                          const SizedBox(width: 6),
                          const StatusBadge(
                            label: 'Employer',
                            tone: BadgeTone.neutral,
                            dot: false,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Business',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
                const SizedBox(height: 6),
                InfoRow(label: 'Business name', value: user.business.name),
                InfoRow(label: 'Currency', value: user.business.currency),
                InfoRow(label: 'Timezone', value: user.business.timezone),
                if (user.phone != null)
                  InfoRow(label: 'Phone', value: user.phone!),
                InfoRow(
                  label: 'Last login',
                  value: formatDateTime(user.lastLoginAt, timezone: timezone),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Session rules set by admin',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: AppColors.navy,
                  ),
                ),
                const SizedBox(height: 8),
                _RuleRow(
                  icon: Icons.add_alarm,
                  label: 'Extensions',
                  allowed: settings.allowExtension,
                ),
                _RuleRow(
                  icon: Icons.pause_circle_outline,
                  label: 'Pause & resume',
                  allowed: settings.allowPause,
                ),
                _RuleRow(
                  icon: Icons.stop_circle_outlined,
                  label: 'End sessions early',
                  allowed: settings.allowManualEnd,
                ),
                const SizedBox(height: 6),
                Text(
                  'Expiry warning ${settings.expiryWarningMinutes} minutes before the timer ends.',
                  style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(
                    Icons.lock_reset,
                    color: AppColors.navy600,
                  ),
                  title: const Text(
                    'Change password',
                    style: TextStyle(fontSize: 13.5),
                  ),
                  subtitle: const Text(
                    'You will be signed out of all devices',
                    style: TextStyle(fontSize: 11),
                  ),
                  trailing: const Icon(
                    Icons.chevron_right,
                    color: AppColors.navy400,
                  ),
                  onTap: () => _changePassword(context, ref),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.logout, color: AppColors.danger),
                  title: const Text(
                    'Sign out',
                    style: TextStyle(fontSize: 13.5, color: AppColors.danger),
                  ),
                  trailing: const Icon(
                    Icons.chevron_right,
                    color: AppColors.danger,
                  ),
                  onTap: () => _logout(context, ref),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Center(
            child: Text(
              '${AppConfig.appName} • v${AppConfig.appVersion}',
              style: const TextStyle(fontSize: 10.5, color: AppColors.navy400),
            ),
          ),
          const SizedBox(height: 4),
          const Center(
            child: Text(
              'Timers and payments are controlled by the central server.',
              style: TextStyle(fontSize: 10, color: AppColors.navy400),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
          'Active sessions continue on the server. You can sign in again at any time.',
          style: TextStyle(
            fontSize: 12.5,
            color: AppColors.textSecondary,
            height: 1.4,
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    await ref.read(authControllerProvider.notifier).logout();
    if (context.mounted) context.go('/login');
  }

  Future<void> _changePassword(BuildContext context, WidgetRef ref) async {
    final changed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => const _ChangePasswordDialog(),
    );
    if (changed == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Password changed. Sign in again with your new password.',
          ),
        ),
      );
    }
  }
}

class _RuleRow extends StatelessWidget {
  const _RuleRow({
    required this.icon,
    required this.label,
    required this.allowed,
  });

  final IconData icon;
  final String label;
  final bool allowed;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Icon(icon, size: 16, color: AppColors.navy400),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(fontSize: 12.5, color: AppColors.navy),
            ),
          ),
          StatusBadge(
            label: allowed ? 'Allowed' : 'Disabled',
            tone: allowed ? BadgeTone.green : BadgeTone.neutral,
            dot: false,
          ),
        ],
      ),
    );
  }
}

class _ChangePasswordDialog extends ConsumerStatefulWidget {
  const _ChangePasswordDialog();

  @override
  ConsumerState<_ChangePasswordDialog> createState() =>
      _ChangePasswordDialogState();
}

class _ChangePasswordDialogState extends ConsumerState<_ChangePasswordDialog> {
  final _currentController = TextEditingController();
  final _newController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _currentController.dispose();
    _newController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final current = _currentController.text;
    final next = _newController.text;
    final confirm = _confirmController.text;

    if (next.length < 8 ||
        !next.contains(RegExp('[A-Za-z]')) ||
        !next.contains(RegExp('[0-9]'))) {
      setState(
        () => _error = 'New password must be at least 8 characters and include a letter and a number.',
      );
      return;
    }
    if (next != confirm) {
      setState(() => _error = 'The new passwords do not match.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await ref
          .read(authControllerProvider.notifier)
          .changePassword(currentPassword: current, newPassword: next);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = ApiException.fromError(error).message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Change password'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.dangerSurface,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: AppColors.danger,
                  ),
                ),
              ),
              const SizedBox(height: 10),
            ],
            TextField(
              controller: _currentController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Current password'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _newController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'New password'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _confirmController,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Confirm new password',
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _loading ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _loading ? null : _submit,
          child: _loading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text('Update password'),
        ),
      ],
    );
  }
}
