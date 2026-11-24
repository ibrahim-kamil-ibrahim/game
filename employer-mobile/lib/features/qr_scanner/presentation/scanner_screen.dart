import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/common.dart';
import '../../dashboard/providers/dashboard_providers.dart';
import '../../machines/models/machine.dart';

class ScannerScreen extends ConsumerStatefulWidget {
  const ScannerScreen({super.key});

  @override
  ConsumerState<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends ConsumerState<ScannerScreen> {
  final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
    formats: const [BarcodeFormat.qrCode],
    facing: CameraFacing.back,
  );

  bool _processing = false;
  bool _torch = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_processing) return;
    final raw = capture.barcodes
        .map((barcode) => barcode.rawValue)
        .whereType<String>()
        .map((value) => value.trim())
        .firstWhere((value) => value.isNotEmpty, orElse: () => '');
    if (raw.isEmpty) return;
    await _resolve(raw);
  }

  Future<void> _resolve(String raw) async {
    setState(() => _processing = true);
    try {
      await _controller.stop();
    } catch (_) {}

    try {
      final resolved = await ref
          .read(employerRepositoryProvider)
          .resolveQr(raw);
      if (!mounted) return;
      await context.push('/machine/${resolved.machine.id}', extra: resolved);
      if (!mounted) return;
      setState(() => _processing = false);
      try {
        await _controller.start();
      } catch (_) {}
    } catch (error) {
      if (!mounted) return;
      setState(() => _processing = false);
      final apiError = ApiException.fromError(error);
      await _showError(apiError);
      if (!mounted) return;
      try {
        await _controller.start();
      } catch (_) {}
    }
  }

  Future<void> _showError(ApiException error) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: const BoxDecoration(
                        color: AppColors.dangerSurface,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.error_outline,
                        color: AppColors.danger,
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Text(
                        'Cannot start this rental',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppColors.navy,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  error.message,
                  style: const TextStyle(
                    fontSize: 13.5,
                    height: 1.5,
                    color: AppColors.textSecondary,
                  ),
                ),
                if (error.details is Map<String, dynamic> &&
                    (error.details as Map<String, dynamic>)['paymentVoided'] ==
                        true) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.warningSurface,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Text(
                      'The cash payment was voided because the machine was unavailable. Refund the customer and choose another machine.',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.warning,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                PrimaryButton(
                  label: 'Try scanning again',
                  icon: Icons.qr_code_scanner,
                  onPressed: () => Navigator.of(sheetContext).pop('retry'),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () => Navigator.of(sheetContext).pop('pick'),
                  icon: const Icon(Icons.grid_view, size: 18),
                  label: const Text('Choose a machine from the list'),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (!mounted) return;
    if (action == 'pick') {
      await _pickMachine();
    }
  }

  Future<void> _pickMachine() async {
    final selected = await showModalBottomSheet<MachineModel>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        return Consumer(
          builder: (context, ref, _) {
            final dashboard = ref.watch(dashboardProvider);
            final machines =
                dashboard.value?.machineList ?? const <MachineModel>[];
            final available = machines
                .where((machine) => machine.isAvailable)
                .toList();
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Choose an available machine',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: AppColors.navy,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Use this if the QR sticker is damaged. The server still verifies availability and pricing.',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (dashboard.isLoading)
                      const LoadingView(label: 'Loading machines')
                    else if (available.isEmpty)
                      const EmptyView(
                        title: 'No available machines',
                        description: 'All machines are in use, under maintenance or inactive.',
                        icon: Icons.sports_esports_outlined,
                      )
                    else
                      Flexible(
                        child: ListView.separated(
                          shrinkWrap: true,
                          itemCount: available.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 6),
                          itemBuilder: (context, index) {
                            final machine = available[index];
                            return AppCard(
                              onTap: () =>
                                  Navigator.of(sheetContext).pop(machine),
                              padding: const EdgeInsets.all(12),
                              child: Row(
                                children: [
                                  MachineImage(
                                    imageUrl: machine.imageUrl,
                                    size: 40,
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          machine.name,
                                          style: const TextStyle(
                                            fontSize: 13.5,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.navy,
                                          ),
                                        ),
                                        Text(
                                          '${machine.code}${machine.categoryName != null ? ' • ${machine.categoryName}' : ''}',
                                          style: const TextStyle(
                                            fontSize: 11,
                                            color: AppColors.textSecondary,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  StatusBadge.machine(machine.status),
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
      },
    );

    if (selected == null || !mounted) return;
    setState(() => _processing = true);
    try {
      await _controller.stop();
    } catch (_) {}
    if (!mounted) return;
    await context.push('/machine/${selected.id}');
    if (!mounted) return;
    setState(() => _processing = false);
    try {
      await _controller.start();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text(
          'Scan machine QR',
          style: TextStyle(color: Colors.white),
        ),
        actions: [
          IconButton(
            tooltip: 'Torch',
            onPressed: () {
              _controller.toggleTorch();
              setState(() => _torch = !_torch);
            },
            icon: Icon(
              _torch ? Icons.flash_on : Icons.flash_off,
              color: Colors.white,
            ),
          ),
        ],
      ),
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (context, error) {
              return _CameraError(
                message: error.errorCode.name,
                onPickMachine: _pickMachine,
              );
            },
          ),
          IgnorePointer(
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withValues(alpha: 0.55),
                    Colors.transparent,
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.7),
                  ],
                  stops: const [0, 0.25, 0.7, 1],
                ),
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                const SizedBox(height: 12),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 24),
                  child: Text(
                    'Point the camera at the QR code on the machine',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const Spacer(),
                Center(
                  child: Container(
                    width: 240,
                    height: 240,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.85),
                        width: 2,
                      ),
                    ),
                    child: Stack(
                      children: [
                        for (final alignment in [
                          Alignment.topLeft,
                          Alignment.topRight,
                          Alignment.bottomLeft,
                          Alignment.bottomRight,
                        ])
                          Align(
                            alignment: alignment,
                            child: Container(
                              width: 30,
                              height: 30,
                              margin: const EdgeInsets.all(-2),
                              decoration: BoxDecoration(
                                border: Border(
                                  top: alignment.y < 0
                                      ? const BorderSide(
                                          color: AppColors.brandLight,
                                          width: 4,
                                        )
                                      : BorderSide.none,
                                  bottom: alignment.y > 0
                                      ? const BorderSide(
                                          color: AppColors.brandLight,
                                          width: 4,
                                        )
                                      : BorderSide.none,
                                  left: alignment.x < 0
                                      ? const BorderSide(
                                          color: AppColors.brandLight,
                                          width: 4,
                                        )
                                      : BorderSide.none,
                                  right: alignment.x > 0
                                      ? const BorderSide(
                                          color: AppColors.brandLight,
                                          width: 4,
                                        )
                                      : BorderSide.none,
                                ),
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                const Spacer(),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.55),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.lock_outline,
                              size: 14,
                              color: Colors.white70,
                            ),
                            SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                'The server verifies the machine, status and package before any session starts.',
                                style: TextStyle(
                                  color: Colors.white70,
                                  fontSize: 10.5,
                                  height: 1.35,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white,
                            side: const BorderSide(color: Colors.white38),
                            backgroundColor: Colors.black.withValues(
                              alpha: 0.35,
                            ),
                          ),
                          onPressed: _processing ? null : _pickMachine,
                          icon: const Icon(Icons.grid_view, size: 18),
                          label: const Text('QR damaged? Choose a machine'),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (_processing)
            Container(
              color: Colors.black.withValues(alpha: 0.65),
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: Colors.white),
                    SizedBox(height: 14),
                    Text(
                      'Checking machine with the server...',
                      style: TextStyle(color: Colors.white, fontSize: 13),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _CameraError extends StatelessWidget {
  const _CameraError({required this.message, required this.onPickMachine});

  final String message;
  final VoidCallback onPickMachine;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.navy,
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.no_photography_outlined,
            size: 48,
            color: Colors.white54,
          ),
          const SizedBox(height: 14),
          const Text(
            'Camera unavailable',
            style: TextStyle(
              color: Colors.white,
              fontSize: 17,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Allow camera access in your phone settings, then try again. You can still choose a machine manually. ($message)',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 12.5,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 20),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(foregroundColor: Colors.white),
            onPressed: onPickMachine,
            icon: const Icon(Icons.grid_view, size: 18),
            label: const Text('Choose a machine'),
          ),
        ],
      ),
    );
  }
}
