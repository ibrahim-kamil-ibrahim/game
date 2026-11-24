import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gamezone_employer/core/storage/token_storage.dart';
import 'package:gamezone_employer/core/widgets/session_countdown.dart';
import 'package:gamezone_employer/features/auth/presentation/login_screen.dart';
import 'package:gamezone_employer/features/auth/providers/auth_controller.dart';
import 'package:gamezone_employer/features/sessions/models/session.dart';

class _MemoryTokenStorage extends TokenStorage {
  String? access;
  String? refresh;

  @override
  Future<String?> readAccessToken() async => access;

  @override
  Future<String?> readRefreshToken() async => refresh;

  @override
  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    access = accessToken;
    refresh = refreshToken;
  }

  @override
  Future<void> clear() async {
    access = null;
    refresh = null;
  }
}

SessionModel _session({
  required String status,
  required int remainingSeconds,
  DateTime? endsAt,
}) {
  return SessionModel(
    id: 'session-test',
    status: status,
    machine: const SessionMachine(id: 'm1', name: 'PS5', code: 'PS5-01'),
    packageName: 'Premium',
    durationMinutes: 30,
    priceSantim: 5000,
    remainingSeconds: remainingSeconds,
    elapsedSeconds: 0,
    paymentRef: 'CASH-TEST',
    paymentStatus: 'PAID',
    endsAt: endsAt,
    startedAt: DateTime.now().toUtc(),
  );
}

void main() {
  testWidgets('login form validates required credentials', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          tokenStorageProvider.overrideWithValue(_MemoryTokenStorage()),
        ],
        child: const MaterialApp(home: LoginScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sign in'), findsOneWidget);
    expect(find.text('Sign in securely'), findsOneWidget);

    await tester.ensureVisible(find.text('Sign in securely'));
    await tester.tap(find.text('Sign in securely'));
    await tester.pump();

    expect(find.text('Enter your username'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
  });

  testWidgets('countdown shows paused and ended states', (tester) async {
    final paused = _session(
      status: 'PAUSED',
      remainingSeconds: 300,
      endsAt: DateTime.now().toUtc().add(const Duration(minutes: 5)),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: SessionCountdown(session: paused)),
      ),
    );
    await tester.pump();
    expect(find.text('PAUSED'), findsOneWidget);

    final ended = _session(
      status: 'EXPIRED',
      remainingSeconds: 0,
      endsAt: DateTime.now().toUtc().subtract(const Duration(minutes: 1)),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: SessionCountdown(session: ended)),
      ),
    );
    await tester.pump();
    expect(find.text('00:00'), findsOneWidget);
    expect(find.text('Session ended'), findsOneWidget);

    // Dispose timers created by the widget.
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
