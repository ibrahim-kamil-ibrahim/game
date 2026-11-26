import '../../machines/models/machine.dart';

class PaymentDraft {
  const PaymentDraft({
    required this.machine,
    required this.package,
    required this.qrToken,
  });

  final MachineModel machine;
  final PackageOption package;
  final String qrToken;
}
