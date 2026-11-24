class BusinessInfo {
  const BusinessInfo({
    required this.id,
    required this.name,
    required this.currency,
    required this.timezone,
    this.phone,
    this.address,
  });

  final String id;
  final String name;
  final String currency;
  final String timezone;
  final String? phone;
  final String? address;

  factory BusinessInfo.fromJson(Map<String, dynamic> json) {
    return BusinessInfo(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'GameZone',
      currency: json['currency'] as String? ?? 'ETB',
      timezone: json['timezone'] as String? ?? 'Africa/Addis_Ababa',
      phone: json['phone'] as String?,
      address: json['address'] as String?,
    );
  }
}

class BusinessSettings {
  const BusinessSettings({
    this.allowExtension = true,
    this.allowPause = false,
    this.allowManualEnd = false,
    this.requireEndReason = false,
    this.expiryWarningMinutes = 5,
  });

  final bool allowExtension;
  final bool allowPause;
  final bool allowManualEnd;
  final bool requireEndReason;
  final int expiryWarningMinutes;

  factory BusinessSettings.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const BusinessSettings();
    return BusinessSettings(
      allowExtension: json['allowExtension'] as bool? ?? true,
      allowPause: json['allowPause'] as bool? ?? false,
      allowManualEnd: json['allowManualEnd'] as bool? ?? false,
      requireEndReason: json['requireEndReason'] as bool? ?? false,
      expiryWarningMinutes:
          (json['expiryWarningMinutes'] as num?)?.toInt() ?? 5,
    );
  }

  Map<String, dynamic> toJson() => {
    'allowExtension': allowExtension,
    'allowPause': allowPause,
    'allowManualEnd': allowManualEnd,
    'requireEndReason': requireEndReason,
    'expiryWarningMinutes': expiryWarningMinutes,
  };
}

class AuthUser {
  const AuthUser({
    required this.id,
    required this.fullName,
    required this.username,
    required this.role,
    required this.business,
    required this.settings,
    this.phone,
    this.status = 'ACTIVE',
    this.lastLoginAt,
    this.createdAt,
  });

  final String id;
  final String fullName;
  final String username;
  final String role;
  final String? phone;
  final String status;
  final DateTime? lastLoginAt;
  final DateTime? createdAt;
  final BusinessInfo business;
  final BusinessSettings settings;

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      username: json['username'] as String? ?? '',
      role: json['role'] as String? ?? 'EMPLOYER',
      phone: json['phone'] as String?,
      status: json['status'] as String? ?? 'ACTIVE',
      lastLoginAt: json['lastLoginAt'] != null
          ? DateTime.tryParse(json['lastLoginAt'] as String)
          : null,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String)
          : null,
      business: BusinessInfo.fromJson(
        (json['business'] as Map<String, dynamic>?) ?? const {},
      ),
      settings: BusinessSettings.fromJson(
        json['settings'] as Map<String, dynamic>?,
      ),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'fullName': fullName,
    'username': username,
    'role': role,
    'phone': phone,
    'status': status,
    'lastLoginAt': lastLoginAt?.toIso8601String(),
    'createdAt': createdAt?.toIso8601String(),
    'business': {
      'id': business.id,
      'name': business.name,
      'currency': business.currency,
      'timezone': business.timezone,
      'phone': business.phone,
      'address': business.address,
    },
    'settings': settings.toJson(),
  };
}
