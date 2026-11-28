import '../../machines/models/machine.dart';
import '../../sessions/models/session.dart';

class PaymentDraft {
  const PaymentDraft({
    required this.machine,
    required this.package,
    required this.qrToken,
    this.activeSession,
  });

  final MachineModel machine;
  final PackageOption package;
  final String qrToken;
  final SessionModel? activeSession;

  bool get isExtension => activeSession != null;
}
