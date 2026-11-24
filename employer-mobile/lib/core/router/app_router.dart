import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/providers/auth_controller.dart';
import '../../features/dashboard/presentation/employer_shell.dart';
import '../../features/dashboard/presentation/home_screen.dart';
import '../../features/history/presentation/history_screen.dart';
import '../../features/machines/models/machine.dart';
import '../../features/machines/presentation/machine_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/payments/models/payment_draft.dart';
import '../../features/payments/presentation/cash_confirmation_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/qr_scanner/presentation/scanner_screen.dart';
import '../../features/sessions/presentation/session_detail_screen.dart';
import '../../features/sessions/presentation/sessions_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final refreshNotifier = ValueNotifier<int>(0);
  ref.listen(authControllerProvider, (_, _) {
    refreshNotifier.value++;
  });
  ref.onDispose(refreshNotifier.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refreshNotifier,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final location = state.matchedLocation;
      final loggingIn = location == '/login';

      if (auth.isLoading) return null;

      final user = auth.value;
      final loggedIn = user != null;

      if (!loggedIn) return loggingIn ? null : '/login';
      if (loggingIn) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      ShellRoute(
        builder: (context, state, child) => EmployerShell(child: child),
        routes: [
          GoRoute(path: '/', builder: (context, state) => const HomeScreen()),
          GoRoute(
            path: '/sessions',
            builder: (context, state) => const SessionsScreen(),
          ),
          GoRoute(
            path: '/history',
            builder: (context, state) => const HistoryScreen(),
          ),
          GoRoute(
            path: '/profile',
            builder: (context, state) => const ProfileScreen(),
          ),
        ],
      ),
      GoRoute(
        path: '/scan',
        builder: (context, state) => const ScannerScreen(),
      ),
      GoRoute(
        path: '/machine/:id',
        builder: (context, state) {
          return MachineScreen(
            machineId: state.pathParameters['id']!,
            resolved: state.extra is ResolvedMachine
                ? state.extra as ResolvedMachine
                : null,
          );
        },
      ),
      GoRoute(
        path: '/payment',
        builder: (context, state) {
          final draft = state.extra;
          if (draft is! PaymentDraft) {
            return const _RouteFallback();
          }
          return CashConfirmationScreen(draft: draft);
        },
      ),
      GoRoute(
        path: '/session/:id',
        builder: (context, state) => SessionDetailScreen(
          sessionId: state.pathParameters['id']!,
          initial: state.extra,
        ),
      ),
      GoRoute(
        path: '/notifications',
        builder: (context, state) => const NotificationsScreen(),
      ),
    ],
  );
});

class _RouteFallback extends StatelessWidget {
  const _RouteFallback();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Not available')),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('This screen was opened without the required data.'),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => context.go('/'),
              child: const Text('Back to home'),
            ),
          ],
        ),
      ),
    );
  }
}
