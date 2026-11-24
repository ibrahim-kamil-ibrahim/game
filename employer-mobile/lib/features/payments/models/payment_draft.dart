import '../../machines/models/machine.dart';

class PaymentDraft {
  const PaymentDraft({required this.machine, required this.package});

  final MachineModel machine;
  final PackageOption package;
}
