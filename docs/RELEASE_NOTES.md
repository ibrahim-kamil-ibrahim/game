# Release Notes

## Version 1.0.0 — 23 November 2026

First complete release of the Game Rental Management System.

### Delivered components

| Component | Status | Build output |
|---|---|---|
| Backend API | Built and tested | `backend/dist/` |
| Admin dashboard | Production build | `admin-web/dist/` |
| Employer Android app | Release APK + AAB, signed | `employer-mobile/build/app/outputs/flutter-apk/app-release.apk` |
| | | `employer-mobile/build/app/outputs/bundle/release/app-release.aab` |

### Android artifacts

| Item | Value |
|---|---|
| Application ID | `com.gamezone.gamezone_employer` |
| Version | `1.0.0` (versionCode `1`) |
| APK size | ~76.1 MB (universal release) |
| AAB size | ~65.2 MB |
| APK SHA-256 | `5D5958BE90F545D57E224DEF9D0EC2497AF85073F65EDE2F410D5833499CDDAE` |
| AAB SHA-256 | `869EEA9AB0AEABE72C18A7622EA747488BEC9B572D267D898BD7958F17C9CA88` |
| Signing | RSA 2048, valid 10,000 days |
| Certificate DN | `CN=GameZone, OU=Operations, O=GameZone Gaming Center, L=Addis Ababa, C=ET` |
| Certificate SHA-256 | `dcb51044a9260fcc95f5593a300d3704b8fb55df9448bf5c57f1122710bd9933` |
| Keystore | `employer-mobile/android/app/gamezone-release.jks` (gitignored) |
| Credentials | `employer-mobile/android/key.properties` (gitignored) |

> **Back up the keystore and `key.properties` now.** Without them you cannot publish updates to the
> same application id. The password is intentionally not committed to source control.

The artifacts were built with:

```powershell
flutter build apk --release --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
flutter build appbundle --release --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
```

That URL targets the local emulator for acceptance testing. For production, rebuild with your HTTPS
API domain:

```powershell
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.your-domain.com/api/v1
```

### Verification performed

- `npm test` (backend): **8 files, 47 tests passed**, including auth/RBAC, QR security, package scope,
  cash payments, session lifecycle, extension/pause rules, expiry scheduler, concurrency races,
  financial reports, exports, audit trails, low-cash alerting and admin credential provisioning.
- `flutter analyze`: **no issues**.
- `flutter test`: **6 tests passed** (money formatting, countdowns, session parsing, labels, login
  validation, paused/ended countdown states).
- `npm run build` (admin): production build succeeded; API and Socket.IO proxy through Vite/Nginx.
- End-to-end on an Android 17 emulator against the real backend:
  - employer login and session restoration;
  - machine selection, package list from admin configuration;
  - cash confirmation and immutable payment reference;
  - atomic session start and server countdown;
  - admin-started rental on behalf of an employer (cash payment + session start) and admin pause,
    resume and end actions from the live monitor;
  - auto-generated employer usernames/passwords, copyable from the creation dialog and employer detail,
    with the temporary credential erased on first employer login;
  - live admin monitor matching the mobile countdown;
  - scheduler expiry (shortened test session), machine released, mobile UI updated to `EXPIRED`,
    history retained, admin dashboard revenue updated;
  - low-cash admin alert job verified with a de-duplicated notification per day.
- QR PNG/PDF generation and download verified.
- Release APK installed, launched, signed and logged in successfully.
- Backend production TypeScript build compiled; Docker Compose YAML validated.

### Test credentials (seeded)

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@12345` |
| Demo employer | `employer1` | `Employer@12345` |

Change both immediately in any environment that is not a local demo, and set
`SEED_SAMPLE_DATA=false` for production.

### Known operational notes

- Run a **single backend instance** (the expiry scheduler runs inside it). Multiple instances would be
  idempotent but unnecessary.
- Reports aggregate filtered payments/sessions in the API. This is accurate and correct for the volumes
  of a gaming center; extremely large histories should move aggregation to SQL materialized views.
- Local notifications are best-effort; the server scheduler always expires sessions.
- Android cleartext HTTP is restricted to emulator/localhost hosts. Use HTTPS in production.
- The portal uses the business timezone for all displayed times and report grouping.

### Upgrade notes

No previous release exists. Future upgrades: back up the database, apply
`npx prisma migrate deploy`, rebuild the API/dashboard, and publish a new signed Android build using the
same keystore.
