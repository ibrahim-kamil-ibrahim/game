# Mobile Release Guide (Employer Android App)

The Flutter app is an operational client only. It contains no database credentials and no JWT secrets.
The API URL is compiled in at build time.

## 0. Production build target (24 November 2026)

Production API: **https://game-rental-api-znao.onrender.com/api/v1**

Build command:

```powershell
cd employer-mobile
.\tool\build_release.ps1 -ApiBaseUrl "https://game-rental-api-znao.onrender.com/api/v1"
```

The signed APK/AAB are produced under `build/app/outputs/`. The previous artifacts pointed at the
emulator URL and must not be distributed. See section 3 for artifact verification.

Built and verified on 24 November 2026:

| Artifact | Size | SHA-256 |
|---|---|---|
| `app-release.apk` | 76.08 MB | `A3EFD82DB34B0EFBB53F10CADE0B1F08CC987EAC519083F47029E12DEA83C08F` |
| `app-release.aab` | 65.21 MB | `BD048E824C6CB5DCFBE5051F11FAE25F74051B686267D7F427B6B55F47437238` |

- `flutter analyze`: no issues.
- `flutter test`: 6/6 passed.
- Compiled AOT snapshot contains `game-rental-api-znao.onrender.com` and **no** `10.0.2.2:4000` or
  `localhost:4000`.
- APK signed with the GameZone release certificate (V2), SHA-256
  `dcb51044a9260fcc95f5593a300d3704b8fb55df9448bf5c57f1122710bd9933`.

## 1. Central API configuration

`lib/core/config/app_config.dart`:

```dart
static const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:4000/api/v1',
);
```

- Default is the Android emulator's host alias for local development.
- Production builds **must** pass the Render HTTPS URL:
  ```
  --dart-define=API_BASE_URL=https://game-rental-api-znao.onrender.com/api/v1
  ```
- The URL always includes `/api/v1`.
- Android cleartext HTTP is allowed only for `10.0.2.2`, `localhost` and `127.0.0.1` in
  `android/app/src/main/res/xml/network_security_config.xml`. Production uses HTTPS and needs no change.

## 2. Signing

Existing local signing material:

- Keystore: `employer-mobile/android/app/gamezone-release.jks` (gitignored)
- Credentials: `employer-mobile/android/key.properties` (gitignored)

**Back these up now.** Losing them prevents future updates to the same application id. Never commit
them or paste the passwords in chat.

If setting up a fresh machine:

```powershell
keytool -genkeypair -v -keystore android/app/gamezone-release.jks `
  -storetype PKCS12 -keyalg RSA -keysize 2048 -validity 10000 -alias gamezone
```

Then create `android/key.properties`:

```properties
storePassword=<from password manager>
keyPassword=<from password manager>
keyAlias=gamezone
storeFile=C:/path/to/gamezone-release.jks
```

`android/app/build.gradle.kts` uses this file when present; otherwise it falls back to debug signing for
local test builds only.

## 3. Build production artifacts

After Render assigns its real URL:

```powershell
cd employer-mobile
flutter pub get
flutter analyze
flutter test

flutter build apk --release --dart-define=API_BASE_URL=https://game-rental-api-znao.onrender.com/api/v1
flutter build appbundle --release --dart-define=API_BASE_URL=https://game-rental-api-znao.onrender.com/api/v1
```

Or use the guarded helper:

```powershell
.\tool\build_release.ps1 -ApiBaseUrl "https://game-rental-api-znao.onrender.com/api/v1"
```

It refuses non-HTTPS URLs and missing signing configuration.

Outputs:

- `build/app/outputs/flutter-apk/app-release.apk`
- `build/app/outputs/bundle/release/app-release.aab`

Verify signing:

```powershell
& "$env:LOCALAPPDATA\Android\sdk\build-tools\37.0.0\apksigner.bat" verify --print-certs `
  build/app/outputs/flutter-apk/app-release.apk
```

The release artifacts were rebuilt on 24 November 2026 against
`https://game-rental-api-znao.onrender.com/api/v1`; the old emulator artifacts were overwritten.
Physical-device testing is still required before distribution (section 5).

## 4. Install and first login

1. Transfer the APK to the Android phone (USB, secure file share, or Play internal testing/AAB).
2. Enable installation from the chosen source, install, open **GameZone Employer**.
3. Grant camera and notification permissions.
4. Sign in with the credentials created by the admin.
5. On first successful login the backend erases the admin-copyable temporary password.
6. Change the password from **Profile → Change password**.
7. Confirm the home screen shows the business and today's cash.

## 5. Production acceptance tests (mobile)

Execute against the real Render API, not localhost:

- [ ] Login with admin-created employer credentials.
- [ ] Kill and reopen the app; session restores without re-entering credentials.
- [ ] Scan a real printed QR code.
- [ ] Open a damaged-QR fallback machine selection.
- [ ] Select an admin package; amount/duration match the dashboard.
- [ ] Tick “cash received”, confirm payment, start the session.
- [ ] Countdown decrements; close the app for a minute and reopen; remaining time is correct.
- [ ] Turn airplane mode on/off; app shows an offline state and recovers.
- [ ] Let a short test session expire; app shows `EXPIRED` after reconnecting.
- [ ] Extend a session (if enabled); extension payment appears in history.
- [ ] Pause/resume (if enabled); timer freezes and resumes.
- [ ] End early (if enabled); machine becomes available.
- [ ] History shows the payment reference, amount, machine, status.
- [ ] Notifications appear at the configured warning and expiry times (foreground/local).
- [ ] Suspended account is rejected at login.
- [ ] Another employer cannot see this employer's history.

## 6. Countdown and offline behaviour

- Server timestamps are authoritative; the app does not trust device time.
- Sessions are polled while the app is open; local notifications are scheduled from server timestamps.
- If the app is closed, the backend scheduler/reconciliation still expires the session.
- If Render is asleep, expiry is reconciled when the service wakes; the app re-syncs on reconnect.
- The app caches the dashboard/session list for short offline displays; payment/session actions require
  the server and must not be treated as committed while offline.

## 7. Release hygiene

- Increment `version` in `pubspec.yaml` (`version: 1.0.1+2`) for every store/internal release.
- Keep the previous APK/AAB for rollback.
- Do not embed `.env`, keystores, passwords or server secrets in the app or repository.
- The app only compiles the public API origin.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| “Cannot reach the server” | wrong URL, Render asleep (wait ~1 min), or no internet |
| Login 401 | wrong password; admin may need to reset credentials |
| Camera unavailable | grant camera permission; use “QR damaged? Choose a machine” |
| Countdown seems wrong | re-open/reconnect; server sync corrects it; verify device time is automatic |
| Notification missing | Android 13+ permission or battery optimisation; server expiry still applies |
| Install blocked | allow install from the source or use Play internal testing |
| API URL local | rebuild with the production `--dart-define`; do not ship the emulator APK |
