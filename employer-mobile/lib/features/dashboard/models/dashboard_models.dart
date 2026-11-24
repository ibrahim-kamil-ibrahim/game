import 'dart:convert';

import '../../auth/models/auth_user.dart';
import '../../machines/models/machine.dart';
import '../../sessions/models/session.dart';

class RecentPayment {
  const RecentPayment({
    required this.id,
    required this.transactionRef,
    required this.amountSantim,
    required this.status,
    required this.packageName,
    required this.machineName,
    required this.machineCode,
    this.paidAt,
  });

  final String id;
  final String transactionRef;
  final int amountSantim;
  final String status;
  final String packageName;
  final String machineName;
  final String machineCode;
  final DateTime? paidAt;

  factory RecentPayment.fromJson(Map<String, dynamic> json) {
    final machine = (json['machine'] as Map<String, dynamic>?) ?? const {};
    return RecentPayment(
      id: json['id'] as String? ?? '',
      transactionRef: json['transactionRef'] as String? ?? '',
      amountSantim: (json['amountSantim'] as num?)?.toInt() ?? 0,
      status: json['status'] as String? ?? 'PAID',
      packageName: json['packageName'] as String? ?? '',
      machineName: machine['name'] as String? ?? 'Machine',
      machineCode: machine['code'] as String? ?? '',
      paidAt: parseDate(json['paidAt']),
    );
  }
}

class EmployerDashboard {
  const EmployerDashboard({
    required this.employerName,
    required this.businessName,
    required this.currency,
    required this.timezone,
    required this.todayCollectedSantim,
    required this.todayTransactions,
    required this.todayCompletedSessions,
    required this.todayActiveSessions,
    required this.unreadNotifications,
    required this.machinesTotal,
    required this.machinesAvailable,
    required this.machinesInUse,
    required this.machinesMaintenance,
    required this.activeSessions,
    required this.machineList,
    required this.recentPayments,
    required this.settings,
    this.serverTime,
    this.offline = false,
    this.cachedAt,
  });

  final String employerName;
  final String businessName;
  final String currency;
  final String timezone;
  final int todayCollectedSantim;
  final int todayTransactions;
  final int todayCompletedSessions;
  final int todayActiveSessions;
  final int unreadNotifications;
  final int machinesTotal;
  final int machinesAvailable;
  final int machinesInUse;
  final int machinesMaintenance;
  final List<SessionModel> activeSessions;
  final List<MachineModel> machineList;
  final List<RecentPayment> recentPayments;
  final BusinessSettings settings;
  final DateTime? serverTime;
  final bool offline;
  final DateTime? cachedAt;

  factory EmployerDashboard.fromJson(
    Map<String, dynamic> json, {
    bool offline = false,
    DateTime? cachedAt,
  }) {
    final employer = (json['employer'] as Map<String, dynamic>?) ?? const {};
    final business = (json['business'] as Map<String, dynamic>?) ?? const {};
    final today = (json['today'] as Map<String, dynamic>?) ?? const {};
    final machines = (json['machines'] as Map<String, dynamic>?) ?? const {};
    return EmployerDashboard(
      employerName: employer['fullName'] as String? ?? '',
      businessName: business['name'] as String? ?? 'GameZone',
      currency: business['currency'] as String? ?? 'ETB',
      timezone: business['timezone'] as String? ?? 'Africa/Addis_Ababa',
      todayCollectedSantim: (today['collectedSantim'] as num?)?.toInt() ?? 0,
      todayTransactions: (today['transactions'] as num?)?.toInt() ?? 0,
      todayCompletedSessions:
          (today['completedSessions'] as num?)?.toInt() ?? 0,
      todayActiveSessions: (today['activeSessions'] as num?)?.toInt() ?? 0,
      unreadNotifications: (today['unreadNotifications'] as num?)?.toInt() ?? 0,
      machinesTotal: (machines['total'] as num?)?.toInt() ?? 0,
      machinesAvailable: (machines['available'] as num?)?.toInt() ?? 0,
      machinesInUse: (machines['inUse'] as num?)?.toInt() ?? 0,
      machinesMaintenance: (machines['maintenance'] as num?)?.toInt() ?? 0,
      activeSessions: (json['activeSessions'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(SessionModel.fromJson)
          .toList(),
      machineList: (json['machineList'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(MachineModel.fromJson)
          .toList(),
      recentPayments: (json['recentPayments'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(RecentPayment.fromJson)
          .toList(),
      settings: BusinessSettings.fromJson(
        business['settings'] as Map<String, dynamic>?,
      ),
      serverTime: parseDate(json['serverTime']),
      offline: offline,
      cachedAt: cachedAt,
    );
  }

  Map<String, dynamic> toJson() => {
    'employer': {'fullName': employerName},
    'business': {
      'name': businessName,
      'currency': currency,
      'timezone': timezone,
      'settings': settings.toJson(),
    },
    'today': {
      'collectedSantim': todayCollectedSantim,
      'transactions': todayTransactions,
      'completedSessions': todayCompletedSessions,
      'activeSessions': todayActiveSessions,
      'unreadNotifications': unreadNotifications,
    },
    'machines': {
      'total': machinesTotal,
      'available': machinesAvailable,
      'inUse': machinesInUse,
      'maintenance': machinesMaintenance,
    },
    'activeSessions': activeSessions
        .map((session) => session.toJson())
        .toList(),
    'machineList': machineList
        .map(
          (machine) => {
            'id': machine.id,
            'name': machine.name,
            'code': machine.code,
            'status': machine.status,
            'category': machine.categoryName != null
                ? {'name': machine.categoryName}
                : null,
            'location': machine.location,
            'imageUrl': machine.imageUrl,
            'activeSession': machine.activeSession == null
                ? null
                : {
                    'id': machine.activeSession!.id,
                    'status': machine.activeSession!.status,
                    'packageName': machine.activeSession!.packageName,
                    'priceSantim': machine.activeSession!.priceSantim,
                    'remainingSeconds': machine.activeSession!.remainingSeconds,
                    'endsAt': machine.activeSession!.endsAt?.toIso8601String(),
                  },
          },
        )
        .toList(),
    'recentPayments': recentPayments
        .map(
          (payment) => {
            'id': payment.id,
            'transactionRef': payment.transactionRef,
            'amountSantim': payment.amountSantim,
            'status': payment.status,
            'packageName': payment.packageName,
            'paidAt': payment.paidAt?.toIso8601String(),
            'machine': {
              'name': payment.machineName,
              'code': payment.machineCode,
            },
          },
        )
        .toList(),
    'serverTime': serverTime?.toIso8601String(),
  };

  String encode() => jsonEncode(toJson());
}

class PaymentResult {
  const PaymentResult({
    required this.id,
    required this.transactionRef,
    required this.amountSantim,
    required this.status,
    required this.packageName,
    required this.machineId,
    required this.machineName,
    required this.packageId,
    this.sessionId,
    this.paidAt,
  });

  final String id;
  final String transactionRef;
  final int amountSantim;
  final String status;
  final String packageName;
  final String machineId;
  final String machineName;
  final String packageId;
  final String? sessionId;
  final DateTime? paidAt;

  factory PaymentResult.fromJson(Map<String, dynamic> json) {
    final machine = (json['machine'] as Map<String, dynamic>?) ?? const {};
    return PaymentResult(
      id: json['id'] as String? ?? '',
      transactionRef: json['transactionRef'] as String? ?? '',
      amountSantim: (json['amountSantim'] as num?)?.toInt() ?? 0,
      status: json['status'] as String? ?? 'PAID',
      packageName: json['packageName'] as String? ?? '',
      machineId: machine['id'] as String? ?? '',
      machineName: machine['name'] as String? ?? 'Machine',
      packageId: json['packageId'] as String? ?? '',
      sessionId: json['sessionId'] as String?,
      paidAt: parseDate(json['paidAt']),
    );
  }
}

class PaymentHistoryItem {
  const PaymentHistoryItem({
    required this.id,
    required this.transactionRef,
    required this.amountSantim,
    required this.status,
    required this.type,
    required this.packageName,
    required this.machineName,
    required this.machineCode,
    this.sessionStatus,
    this.paidAt,
    this.createdAt,
  });

  final String id;
  final String transactionRef;
  final int amountSantim;
  final String status;
  final String type;
  final String packageName;
  final String machineName;
  final String machineCode;
  final String? sessionStatus;
  final DateTime? paidAt;
  final DateTime? createdAt;

  factory PaymentHistoryItem.fromJson(Map<String, dynamic> json) {
    final machine = (json['machine'] as Map<String, dynamic>?) ?? const {};
    return PaymentHistoryItem(
      id: json['id'] as String? ?? '',
      transactionRef: json['transactionRef'] as String? ?? '',
      amountSantim: (json['amountSantim'] as num?)?.toInt() ?? 0,
      status: json['status'] as String? ?? 'PAID',
      type: json['type'] as String? ?? 'RENTAL',
      packageName: json['packageName'] as String? ?? '',
      machineName: machine['name'] as String? ?? 'Machine',
      machineCode: machine['code'] as String? ?? '',
      sessionStatus: json['sessionStatus'] as String?,
      paidAt: parseDate(json['paidAt']),
      createdAt: parseDate(json['createdAt']),
    );
  }
}

class PaymentHistoryPage {
  const PaymentHistoryPage({
    required this.items,
    required this.hasMore,
    required this.total,
  });

  final List<PaymentHistoryItem> items;
  final bool hasMore;
  final int total;
}

class SessionHistoryItem {
  const SessionHistoryItem({
    required this.id,
    required this.status,
    required this.packageName,
    required this.priceSantim,
    required this.machineName,
    required this.machineCode,
    required this.paymentRef,
    required this.paymentStatus,
    this.startedAt,
    this.endsAt,
    this.actualEndedAt,
    this.actualDurationSeconds,
    this.createdAt,
  });

  final String id;
  final String status;
  final String packageName;
  final int priceSantim;
  final String machineName;
  final String machineCode;
  final String paymentRef;
  final String paymentStatus;
  final DateTime? startedAt;
  final DateTime? endsAt;
  final DateTime? actualEndedAt;
  final int? actualDurationSeconds;
  final DateTime? createdAt;

  factory SessionHistoryItem.fromJson(Map<String, dynamic> json) {
    final machine = (json['machine'] as Map<String, dynamic>?) ?? const {};
    final payment = (json['payment'] as Map<String, dynamic>?) ?? const {};
    return SessionHistoryItem(
      id: json['id'] as String? ?? '',
      status: json['status'] as String? ?? 'COMPLETED',
      packageName: json['packageName'] as String? ?? '',
      priceSantim: (json['priceSantim'] as num?)?.toInt() ?? 0,
      machineName: machine['name'] as String? ?? 'Machine',
      machineCode: machine['code'] as String? ?? '',
      paymentRef: payment['transactionRef'] as String? ?? '',
      paymentStatus: payment['status'] as String? ?? 'PAID',
      startedAt: parseDate(json['startedAt']),
      endsAt: parseDate(json['endsAt']),
      actualEndedAt: parseDate(json['actualEndedAt']),
      actualDurationSeconds: (json['actualDurationSeconds'] as num?)?.toInt(),
      createdAt: parseDate(json['createdAt']),
    );
  }
}

class SessionHistoryPage {
  const SessionHistoryPage({
    required this.items,
    required this.hasMore,
    required this.total,
  });

  final List<SessionHistoryItem> items;
  final bool hasMore;
  final int total;
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    this.readAt,
  });

  final String id;
  final String type;
  final String title;
  final String body;
  final DateTime? createdAt;
  final DateTime? readAt;

  bool get isUnread => readAt == null;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'] as String? ?? '',
      type: json['type'] as String? ?? 'SYSTEM',
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      createdAt: parseDate(json['createdAt']),
      readAt: parseDate(json['readAt']),
    );
  }
}
