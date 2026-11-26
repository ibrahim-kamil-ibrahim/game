DateTime? parseDate(dynamic value) {
  if (value is String) return DateTime.tryParse(value);
  return null;
}

class ActiveSessionSummary {
  const ActiveSessionSummary({
    required this.id,
    required this.status,
    required this.packageName,
    required this.priceSantim,
    required this.remainingSeconds,
    this.endsAt,
    this.employerName,
  });

  final String id;
  final String status;
  final String packageName;
  final int priceSantim;
  final int remainingSeconds;
  final DateTime? endsAt;
  final String? employerName;

  factory ActiveSessionSummary.fromJson(Map<String, dynamic> json) {
    return ActiveSessionSummary(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? 'ACTIVE',
      packageName: json['packageName'] as String? ?? '',
      priceSantim: (json['priceSantim'] as num?)?.toInt() ?? 0,
      remainingSeconds: (json['remainingSeconds'] as num?)?.toInt() ?? 0,
      endsAt: parseDate(json['endsAt']),
      employerName:
          (json['employer'] as Map<String, dynamic>?)?['fullName'] as String?,
    );
  }
}

class MachineModel {
  const MachineModel({
    required this.id,
    required this.name,
    required this.code,
    required this.status,
    this.description,
    this.brand,
    this.model,
    this.location,
    this.imageUrl,
    this.categoryName,
    this.activeSession,
  });

  final String id;
  final String name;
  final String code;
  final String status;
  final String? description;
  final String? brand;
  final String? model;
  final String? location;
  final String? imageUrl;
  final String? categoryName;
  final ActiveSessionSummary? activeSession;

  bool get isAvailable => status == 'AVAILABLE' && activeSession == null;

  factory MachineModel.fromJson(Map<String, dynamic> json) {
    final category = json['category'];
    final active = json['activeSession'];
    return MachineModel(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Machine',
      code: json['code'] as String? ?? '',
      status: json['status'] as String? ?? 'AVAILABLE',
      description: json['description'] as String?,
      brand: json['brand'] as String?,
      model: json['model'] as String?,
      location: json['location'] as String?,
      imageUrl: json['imageUrl'] as String?,
      categoryName: category is Map<String, dynamic>
          ? category['name'] as String?
          : (json['categoryName'] as String?),
      activeSession: active is Map<String, dynamic>
          ? ActiveSessionSummary.fromJson(active)
          : null,
    );
  }
}

class PackageOption {
  const PackageOption({
    required this.id,
    required this.name,
    required this.durationMinutes,
    required this.priceSantim,
    this.description,
    this.categoryName,
  });

  final String id;
  final String name;
  final int durationMinutes;
  final int priceSantim;
  final String? description;
  final String? categoryName;

  factory PackageOption.fromJson(Map<String, dynamic> json) {
    return PackageOption(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Package',
      durationMinutes: (json['durationMinutes'] as num?)?.toInt() ?? 0,
      priceSantim: (json['priceSantim'] as num?)?.toInt() ?? 0,
      description: json['description'] as String?,
      categoryName: json['categoryName'] as String?,
    );
  }
}

class ResolvedMachine {
  const ResolvedMachine({
    required this.machine,
    required this.packages,
    this.qrToken,
  });

  final MachineModel machine;
  final List<PackageOption> packages;
  final String? qrToken;
}
