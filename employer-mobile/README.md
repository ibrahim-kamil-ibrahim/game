# GameZone Employer (Flutter Android)

The operational app used by staff to rent gaming machines for cash. Customers do not use this app.

## Features

- JWT login with secure token storage and automatic session restoration
- Dashboard with today's cash, active sessions, machines and recent payments
- QR scanning (`mobile_scanner`) backed by server-side validation
- Machine/package selection with admin-controlled pricing
- Cash confirmation with idempotent payment recording
- Server-anchored countdown with 5-minute/1-minute/expiry local notifications
- Active sessions, pause/resume, extensions and early end (per admin settings)
- Transaction and session history
- Offline dashboard/session cache with clear offline messaging
- Change password and logout

## Run (emulator)

```powershell
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
```

`10.0.2.2` is the host machine from the Android emulator. For a physical phone use the host's LAN IP
(or an HTTPS domain) and adjust `android/app/src/main/res/xml/network_security_config.xml` for cleartext
development hosts.

## Build

```powershell
flutter analyze
flutter test
flutter build apk --release --dart-define=API_BASE_URL=https://api.example.com/api/v1
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.example.com/api/v1
```

Configure release signing with `android/key.properties` (`storeFile`, `storePassword`, `keyAlias`,
`keyPassword`) before publishing. See `../docs/DEPLOYMENT_GUIDE.md`.

## Structure

- `lib/core` — config, theme, Dio client with refresh-token rotation, router, notifications,
  formatters, shared widgets.
- `lib/features/auth` — login, session restoration, password change.
- `lib/features/dashboard` — home snapshot, repository with offline cache, shell/bottom navigation.
- `lib/features/qr_scanner` — camera scanning and manual machine fallback.
- `lib/features/machines` — machine details and package selection.
- `lib/features/payments` — cash confirmation and start session.
- `lib/features/sessions` — live countdown, actions, active sessions.
- `lib/features/history` — payments and sessions history.
- `lib/features/notifications`, `profile`.

## Notes

- The countdown is cosmetic: the server expires every session, even if the app is closed.
- Prices and durations are never entered by the employer; they come from the backend.
- Local notifications are scheduled from server timestamps and cancelled/rescheduled on pause, resume,
  extension and completion.
