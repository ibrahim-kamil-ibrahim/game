class SessionExtension {
  const SessionExtension({
    required this.id,
    required this.packageName,
    required this.durationMinutes,
    required this.priceSantim,
    this.createdAt,
    this.previousEndsAt,
    this.newEndsAt,
  });

  final String id;
  final String packageName;
  final int durationMinutes;
  final int priceSantim;
  final DateTime? createdAt;
  final DateTime? previousEndsAt;
  final DateTime? newEndsAt;

  factory SessionExtension.fromJson(Map<String, dynamic> json) {
    return SessionExtension(
      id: json['id'] as String? ?? '',
      packageName: json['packageName'] as String? ?? '',
      durationMinutes: (json['durationMinutes'] as num?)?.toInt() ?? 0,
      priceSantim: (json['priceSantim'] as num?)?.toInt() ?? 0,
      createdAt: _date(json['createdAt']),
      previousEndsAt: _date(json['previousEndsAt']),
      newEndsAt: _date(json['newEndsAt']),
    );
  }
}

DateTime? _date(dynamic value) {
  if (value is String) return DateTime.tryParse(value);
  return null;
}

class SessionMachine {
  const SessionMachine({
    required this.id,
    required this.name,
    required this.code,
    this.categoryName,
    this.location,
  });

  final String id;
  final String name;
  final String code;
  final String? categoryName;
  final String? location;

  factory SessionMachine.fromJson(Map<String, dynamic> json) {
    final category = json['category'];
    return SessionMachine(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? 'Machine',
      code: json['code'] as String? ?? '',
      categoryName: category is Map<String, dynamic>
          ? category['name'] as String?
          : null,
      location: json['location'] as String?,
    );
  }
}

class SessionModel {
  const SessionModel({
    required this.id,
    required this.status,
    required this.machine,
    required this.packageName,
    required this.durationMinutes,
    required this.priceSantim,
    required this.remainingSeconds,
    required this.elapsedSeconds,
    required this.paymentRef,
    required this.paymentStatus,
    this.startedAt,
    this.endsAt,
    this.pausedAt,
    this.actualEndedAt,
    this.actualDurationSeconds,
    this.endReason,
    this.extensions = const [],
    this.totalPausedSeconds = 0,
    this.createdAt,
  });

  final String id;
  final String status;
  final SessionMachine machine;
  final String packageName;
  final int durationMinutes;
  final int priceSantim;
  final int remainingSeconds;
  final int elapsedSeconds;
  final String paymentRef;
  final String paymentStatus;
  final DateTime? startedAt;
  final DateTime? endsAt;
  final DateTime? pausedAt;
  final DateTime? actualEndedAt;
  final int? actualDurationSeconds;
  final String? endReason;
  final List<SessionExtension> extensions;
  final int totalPausedSeconds;
  final DateTime? createdAt;

  bool get isActive => status == 'ACTIVE';
  bool get isPaused => status == 'PAUSED';
  bool get isExpired => status == 'EXPIRED';
  bool get isRunning => status == 'ACTIVE' || status == 'PAUSED';
  bool get isFinished =>
      status == 'COMPLETED' || status == 'EXPIRED' || status == 'CANCELLED';

  /// True when the session's time has run out and it is still awaiting the
  /// employer's QR-scan checkout.
  bool isTimeUpAt(DateTime serverNow) {
    if (isExpired) return true;
    if (isActive && endsAt != null) return !endsAt!.isAfter(serverNow);
    return false;
  }
  int get totalPriceSantim =>
      priceSantim + extensions.fold(0, (sum, ext) => sum + ext.priceSantim);

  factory SessionModel.fromJson(Map<String, dynamic> json) {
    final payment = (json['payment'] as Map<String, dynamic>?) ?? const {};
    final extensions = (json['extensions'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(SessionExtension.fromJson)
        .toList();
    return SessionModel(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? 'ACTIVE',
      machine: SessionMachine.fromJson(
        (json['machine'] as Map<String, dynamic>?) ?? const {},
      ),
      packageName: json['packageName'] as String? ?? 'Session',
      durationMinutes: (json['durationMinutes'] as num?)?.toInt() ?? 0,
      priceSantim: (json['priceSantim'] as num?)?.toInt() ?? 0,
      remainingSeconds: (json['remainingSeconds'] as num?)?.toInt() ?? 0,
      elapsedSeconds: (json['elapsedSeconds'] as num?)?.toInt() ?? 0,
      paymentRef: payment['transactionRef'] as String? ?? '',
      paymentStatus: payment['status'] as String? ?? 'PAID',
      startedAt: _date(json['startedAt']),
      endsAt: _date(json['endsAt']),
      pausedAt: _date(json['pausedAt']),
      actualEndedAt: _date(json['actualEndedAt']),
      actualDurationSeconds: (json['actualDurationSeconds'] as num?)?.toInt(),
      endReason: json['endReason'] as String?,
      extensions: extensions,
      totalPausedSeconds: (json['totalPausedSeconds'] as num?)?.toInt() ?? 0,
      createdAt: _date(json['createdAt']),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'status': status,
    'machine': {
      'id': machine.id,
      'name': machine.name,
      'code': machine.code,
      'category': machine.categoryName != null
          ? {'name': machine.categoryName}
          : null,
      'location': machine.location,
    },
    'packageName': packageName,
    'durationMinutes': durationMinutes,
    'priceSantim': priceSantim,
    'remainingSeconds': remainingSeconds,
    'elapsedSeconds': elapsedSeconds,
    'payment': {'transactionRef': paymentRef, 'status': paymentStatus},
    'startedAt': startedAt?.toIso8601String(),
    'endsAt': endsAt?.toIso8601String(),
    'pausedAt': pausedAt?.toIso8601String(),
    'actualEndedAt': actualEndedAt?.toIso8601String(),
    'actualDurationSeconds': actualDurationSeconds,
    'endReason': endReason,
    'extensions': extensions
        .map(
          (ext) => {
            'id': ext.id,
            'packageName': ext.packageName,
            'durationMinutes': ext.durationMinutes,
            'priceSantim': ext.priceSantim,
            'createdAt': ext.createdAt?.toIso8601String(),
          },
        )
        .toList(),
    'totalPausedSeconds': totalPausedSeconds,
    'createdAt': createdAt?.toIso8601String(),
  };
}

class ActiveSessionsSnapshot {
  const ActiveSessionsSnapshot({
    required this.sessions,
    required this.fetchedAt,
    this.serverTime,
    this.offline = false,
  });

  final List<SessionModel> sessions;
  final DateTime fetchedAt;
  final DateTime? serverTime;
  final bool offline;
}
