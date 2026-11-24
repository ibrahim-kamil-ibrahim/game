import 'package:flutter_test/flutter_test.dart';
import 'package:gamezone_employer/core/utils/formatters.dart';
import 'package:gamezone_employer/features/sessions/models/session.dart';

void main() {
  test('formats integer santim as ETB without floating point drift', () {
    expect(formatEtb(3500), '35.00 ETB');
    expect(formatEtb(2000), '20.00 ETB');
    expect(formatEtb(125050), '1,250.50 ETB');
    expect(formatEtb(0), '0.00 ETB');
  });

  test('formats countdowns with minute and hour precision', () {
    expect(formatCountdown(0), '00:00');
    expect(formatCountdown(59), '00:59');
    expect(formatCountdown(600), '10:00');
    expect(formatCountdown(3661), '01:01:01');
    expect(formatCountdown(-5), '00:00');
  });

  test('parses a session response and preserves server amounts', () {
    final session = SessionModel.fromJson({
      'id': 'session-1',
      'status': 'ACTIVE',
      'machine': {'id': 'm1', 'name': 'PS5 Station', 'code': 'PS5-01'},
      'packageName': 'Premium',
      'durationMinutes': 30,
      'priceSantim': 5000,
      'remainingSeconds': 1499,
      'elapsedSeconds': 301,
      'startedAt': '2026-01-01T10:00:00.000Z',
      'endsAt': '2026-01-01T10:30:00.000Z',
      'payment': {'transactionRef': 'CASH-1', 'status': 'PAID'},
      'extensions': [
        {
          'id': 'e1',
          'packageName': 'Extra 10',
          'durationMinutes': 10,
          'priceSantim': 1500,
          'createdAt': '2026-01-01T10:10:00.000Z',
        },
      ],
    });

    expect(session.isActive, isTrue);
    expect(session.isRunning, isTrue);
    expect(session.priceSantim, 5000);
    expect(session.totalPriceSantim, 6500);
    expect(session.extensions, hasLength(1));
    expect(session.remainingSeconds, 1499);
    expect(session.paymentRef, 'CASH-1');
  });

  test('humanizes backend enum values for display', () {
    expect(humanize('IN_USE'), 'In Use');
    expect(humanize('SESSION_EXPIRED'), 'Session Expired');
    expect(humanize(null), '—');
  });
}
