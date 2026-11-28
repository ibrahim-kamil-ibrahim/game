import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/common.dart';
import '../../dashboard/providers/dashboard_providers.dart';

class ScannerScreen extends ConsumerStatefulWidget {
  const ScannerScreen({
    super.key,
    this.verifyMachineId,
    this.verifyMachineName,
  });

  /// When set, the scanner only captures and returns the scanned QR payload
  /// so the caller (e.g. ending a session) can submit it for verification.
  final String? verifyMachineId;
  final String? verifyMachineName;

  bool get isVerifyMode => verifyMachineId != null;

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

    if (widget.isVerifyMode) {
      if (!mounted) return;
      context.pop<String>(raw);
      return;
    }

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
    await showModalBottomSheet<void>(
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
                  onPressed: () => Navigator.of(sheetContext).pop(),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final verifyMode = widget.isVerifyMode;
    final machineLabel = widget.verifyMachineName ?? 'the machine';

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(
          verifyMode ? 'Scan QR to end session' : 'Scan machine QR',
          style: const TextStyle(color: Colors.white),
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
              return _CameraError(message: error.errorCode.name);
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
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Text(
                    verifyMode
                        ? 'Scan the QR code on $machineLabel to confirm ending this session'
                        : 'Point the camera at the QR code on the machine',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
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
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.55),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.lock_outline,
                          size: 14,
                          color: Colors.white70,
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            verifyMode
                                ? 'Scanning the machine QR code is required to end the session.'
                                : 'Scanning the machine QR code is required before any session can start.',
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 10.5,
                              height: 1.35,
                            ),
                          ),
                        ),
                      ],
                    ),
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
  const _CameraError({required this.message});

  final String message;

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
            'Camera access is required to scan the machine QR code. Allow camera access in your phone settings and try again. ($message)',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 12.5,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}
