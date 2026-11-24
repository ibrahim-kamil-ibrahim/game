# Game Rental Management System

A production-ready system for a physical game rental business. Customers walk in and pay cash;
employers operate the machines from an Android app; the owner manages everything from a web
dashboard. There is no customer account or customer app.

| Component | Technology | Location |
|---|---|---|
| Central API | Node.js, Express, TypeScript, Prisma, PostgreSQL, Socket.IO | `backend/` |
| Admin dashboard | React 19, Vite, TypeScript, Tailwind CSS 4, TanStack Query | `admin-web/` |
| Employer app | Flutter 3, Dart, Material 3, Riverpod, GoRouter, Dio, Mobile Scanner | `employer-mobile/` |
| Documentation | Architecture, API, database, business rules, security, deployment | `docs/` |

## Screenshots

| Admin | Employer |
|---|---|
| ![Dashboard](docs/screenshots/admin-dashboard.jpg) | ![Login](docs/screenshots/mobile-login.png) |
| ![Live monitor](docs/screenshots/admin-live-monitor.jpg) | ![Home](docs/screenshots/mobile-home.png) |
| ![Machine QR](docs/screenshots/admin-machine-qr.jpg) | ![Packages](docs/screenshots/mobile-machine-packages.png) |
| ![Settings](docs/screenshots/admin-settings.jpg) | ![Cash confirmation](docs/screenshots/mobile-cash-confirmation.png) |
| | ![Countdown](docs/screenshots/mobile-session-countdown.png) |

More screenshots (expired session, transaction history) are in `docs/screenshots/`.

## Core business rules

1. **The admin controls everything.** Machines, categories, packages, prices, durations, employers and
   business rules can only be changed by an admin. Every employer request is re-validated on the server.
2. **Employers only operate machines.** They scan a machine QR code, choose an admin-configured
   package, collect physical cash, confirm the payment and start the session.
3. **Cash only.** No online payments, no customer accounts.
4. **Server time is authoritative.** The session end time is stored on the server. The mobile countdown
   is cosmetic; a scheduler expires sessions even if every phone is closed.
5. **Financial history is immutable.** Payments are never deleted. Refunds and voids are separate,
   audited actions. Prices and durations are snapshotted when a payment is created.
6. **QR codes are secure.** Each QR contains a 192-bit random secret. The database stores an HMAC of the
   secret and an encrypted copy for reprinting. Database ids are never used as QR credentials.

## Quick start (Windows PowerShell)

### 1. Prerequisites

- Node.js 20+ and npm
- PostgreSQL 15+ (local service or Docker)
- Flutter 3.32+ with the Android SDK and an emulator/device
- Optional: Docker + Docker Compose for the production-style stack

### 2. Database

Create the database (the example assumes the default `postgres` superuser):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE game_rental;"
```

### 3. Backend

```powershell
cd backend
Copy-Item .env.example .env
# Edit .env: set DATABASE_URL and replace every secret.
npm install
npx prisma migrate deploy
npm run seed
npm run dev
```

- API: <http://localhost:4000>
- Health check: <http://localhost:4000/health>
- Interactive docs are not shipped; see `docs/API_DOCUMENTATION.md`.

Seeded accounts (change them immediately):

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@12345` (from `SEED_ADMIN_PASSWORD`) |
| Demo employer | `employer1` | `Employer@12345` |

`SEED_SAMPLE_DATA=true` also creates three categories, four packages and three machines so the system
is usable immediately. Set it to `false` for a clean production start.

### 4. Admin dashboard

```powershell
cd admin-web
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` and `/socket.io` to the backend on port 4000.

### 5. Employer mobile app

The default API URL is `http://10.0.2.2:4000/api/v1`, which is the host machine from an Android
emulator. Build and run:

```powershell
cd employer-mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
```

For a physical phone on the same LAN, use your computer's LAN IP and make sure the phone can reach
the backend. The Android network security config allows cleartext only for `10.0.2.2`, `localhost`
and `127.0.0.1`; for a LAN IP during development add it to
`android/app/src/main/res/xml/network_security_config.xml`, or use HTTPS.

The app has a **“QR damaged? Choose a machine”** fallback so the full rental flow can be exercised on
an emulator without a camera pointing at a printed code.

### 6. Test suites

```powershell
# Backend (uses game_rental_test)
cd backend
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/game_rental_test?schema=public"
npx prisma migrate deploy
Remove-Item Env:DATABASE_URL
npm test

# Admin web
cd ..\admin-web
npm run build

# Flutter
cd ..\employer-mobile
flutter analyze
flutter test
```

## End-to-end rental flow

1. Admin registers a machine → a QR code is generated and can be downloaded as PNG/PDF.
2. Admin creates packages (duration + price + scope) and employers.
3. Employer signs in, scans the machine QR.
4. Server validates the QR, machine status, active sessions and applicable packages.
5. Employer selects a package and collects the exact cash amount shown.
6. Employer confirms cash → server creates an immutable payment with a unique reference.
7. Employer starts the game → server atomically checks payment + machine, creates the session, sets
   the machine to `IN_USE` and calculates the end time.
8. The app counts down from server timestamps; warnings fire at the configured threshold and at 1 min.
9. A background scheduler expires the session at the server end time, releases the machine and notifies
   both the dashboard and the employer.
10. Admin sees revenue, sessions, machines and audit entries in real time.

## Repository layout

```
app/
├── backend/              Express + Prisma API, scheduler, Socket.IO, tests
├── admin-web/            React admin dashboard
├── employer-mobile/      Flutter employer application
├── docs/                 Architecture, database, API, business, UI/UX, security, deployment
├── docker-compose.yml    PostgreSQL + API + dashboard
├── .gitignore
└── README.md
```

## Documentation

- [Project architecture](docs/PROJECT_ARCHITECTURE.md)
- [Database design](docs/DATABASE_DESIGN.md)
- [API documentation](docs/API_DOCUMENTATION.md)
- [Business logic and session lifecycle](docs/BUSINESS_LOGIC.md)
- [UI/UX guide](docs/UI_UX_GUIDE.md)
- [Security guide](docs/SECURITY_GUIDE.md)
- [Deployment guide](docs/DEPLOYMENT_GUIDE.md)
- [Release notes and test evidence](docs/RELEASE_NOTES.md)

### Free cloud deployment

- [Deployment audit](docs/DEPLOYMENT_AUDIT.md)
- [Supabase database deployment](docs/DATABASE_DEPLOYMENT.md)
- [Render backend deployment](docs/BACKEND_DEPLOYMENT.md)
- [Admin web deployment](docs/ADMIN_WEB_DEPLOYMENT.md)
- [Mobile release guide](docs/MOBILE_RELEASE_GUIDE.md)
- [Production security checklist](docs/PRODUCTION_SECURITY_CHECKLIST.md)
- [Verified free-hosting limitations](docs/FREE_HOSTING_LIMITATIONS.md)
- [Final deployment status](docs/FINAL_DEPLOYMENT_REPORT.md)

> Render Free is suitable for a low-traffic pilot only; it sleeps after 15 idle minutes and is not
> production-grade. Vercel Hobby is non-commercial; use Cloudflare Pages or Netlify Free for the admin
> static site, or Vercel Pro.

## Build artifacts

- Admin production build: `admin-web/dist/`
- Backend production build: `backend/dist/`
- Android APK: `employer-mobile/build/app/outputs/flutter-apk/app-release.apk`
- Android AAB: `employer-mobile/build/app/outputs/bundle/release/app-release.aab`

The checked-in build artifacts are signed and configured for local emulator acceptance testing. Rebuild
with your HTTPS API URL before distributing to real employers:

```powershell
cd employer-mobile
.\tool\build_release.ps1 -ApiBaseUrl "https://api.your-domain.com/api/v1"
```

## Production

Read `docs/DEPLOYMENT_GUIDE.md`. At a minimum:

- use HTTPS everywhere (the admin app and API must be same-origin or CORS allow-listed);
- replace every secret in `backend/.env`;
- change the seeded passwords, set `SEED_SAMPLE_DATA=false`;
- configure a real Android keystore (`employer-mobile/android/key.properties`);
- back up PostgreSQL daily and test restores;
- keep the API port private and expose only Nginx.

## License

Proprietary. All rights reserved by the business owner.
