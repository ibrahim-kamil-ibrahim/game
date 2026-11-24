# Deployment Audit

**Project:** Game Rental Management System  
**Audit date:** 23 November 2026  
**Cloud deployment status:** Repository pushed to GitHub. Supabase/Render/static-host resources are
**not yet created** because those services are not authenticated on this machine. No URLs or credentials
are invented in this report.

GitHub repository: <https://github.com/ibrahim-kamil-ibrahim/game> (branch `main`, commit `39d5a8b`).
The repository is currently public; switch it to private in GitHub settings if the source should not be
public (no secrets are committed).

## 1. Project and repository

- Repository: <https://github.com/ibrahim-kamil-ibrahim/game>
- Branch: `main`
- Local deployment commit: `39d5a8b`
- The repository is currently public. No secrets, `.env` files, keystores, build outputs or
  `node_modules` are committed. If the source should be private, make it private in GitHub settings.

### Verified components

| Component | Location | Technology | Local status |
|---|---|---|---|
| Backend API | `backend/` | Node.js, Express 4, TypeScript, Prisma 6, PostgreSQL, Socket.IO | Running, `/health` 200 |
| Admin web | `admin-web/` | React 19, Vite 8, TypeScript, Tailwind 4, TanStack Query | Running on `:5173`, production build passes |
| Employer app | `employer-mobile/` | Flutter 3.47, Riverpod, GoRouter, Dio, Mobile Scanner | `flutter analyze` clean, 6 tests pass |
| Database | local PostgreSQL 18 | Prisma migrations | 3 migrations applied |
| Source control | GitHub | https://github.com/ibrahim-kamil-ibrahim/game | `main` pushed |

Local backend health response verified:
`{"status":"ok", ...}`. The database currently has the seeded business, admin, demo employer, three
machines, four packages and three categories; financial test data was removed.

## 2. Runtime dependencies

- **Backend:** `@prisma/client`, `bcryptjs`, `compression`, `cookie-parser`, `cors`, `dotenv`, `exceljs`,
  `express`, `express-rate-limit`, `helmet`, `jsonwebtoken`, `morgan`, `pdfkit`, `prisma`, `qrcode`,
  `socket.io`, `tsx`, `zod`. Tests use `vitest` + `supertest`.
- **Admin:** React, React Router, TanStack Query, Axios, Recharts, Zustand, Tailwind, Sonner,
  Socket.IO client.
- **Mobile:** `flutter_riverpod`, `go_router`, `dio`, `flutter_secure_storage`, `mobile_scanner`,
  `flutter_local_notifications`, `shared_preferences`, `connectivity_plus`, `timezone`, `uuid`, `intl`.
- **System:** Node 20+ (tested Node 24 locally), PostgreSQL 15+ (tested 18), Flutter 3.47 / Android SDK 37.

## 3. Database / Prisma

- 17 models, enums, UUIDs, foreign keys, indexes, check constraints and the partial unique index
  `GameSession_one_active_per_machine`.
- Migrations:
  1. `20261123112459_init`
  2. `20261123112532_session_guard`
  3. `20261123170400_employer_initial_credentials`
- Added `directUrl = env("DIRECT_URL")` for Supabase migration routing.
- Production uses Supabase pooled URL at runtime and direct/session URL for migrations.
- No destructive migration is planned. Production migrations use only `prisma migrate deploy`.

## 4. Environment variables (actual names)

Backend:

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | Enables secure cookies/headers |
| `PORT` | yes on Render | Render injects `PORT` (10000 in blueprint) |
| `DATABASE_URL` | yes | Supabase pooled connection string |
| `DIRECT_URL` | yes | Supabase direct/session connection for `prisma migrate` |
| `JWT_ACCESS_SECRET` | yes | ≥32 random characters |
| `JWT_REFRESH_SECRET` | yes | different ≥32 random characters |
| `QR_HMAC_SECRET` | yes | must remain stable; changing invalidates printed QR codes |
| `ACCESS_TOKEN_TTL_MINUTES` | no | default 30 |
| `REFRESH_TOKEN_TTL_DAYS` | no | default 30 |
| `REFRESH_REUSE_GRACE_SECONDS` | no | default 60 |
| `CORS_ORIGINS` | yes | exact admin origin(s), comma separated |
| `CORS_ORIGIN` | optional alias | merged with `CORS_ORIGINS` |
| `COOKIE_SAME_SITE` | no | `none` for Vercel→Render; `lax` for same-origin proxy |
| `BUSINESS_NAME`, `BUSINESS_TIMEZONE`, `BUSINESS_CURRENCY` | no | defaults exist |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_FULL_NAME`, `SEED_ADMIN_PHONE` | first boot | seed only |
| `SEED_SAMPLE_DATA` | no | must be `false` in production |
| `RUN_DB_SEED` | no | `true` for the first Render boot only |
| `SESSION_EXPIRY_INTERVAL_MS` | no | default 5000 |

Admin web:

| Variable | Notes |
|---|---|
| `VITE_API_URL` | `https://<render-service>/api/v1` (or `/api/v1` with same-origin proxy) |
| `VITE_SOCKET_URL` | `https://<render-service>` when the API is cross-origin |

Mobile: no runtime secrets. API URL is compiled with
`--dart-define=API_BASE_URL=https://<render-service>/api/v1`.

## 5. Build and start commands (from actual package.json)

Backend:

```text
build:  npm ci && npx prisma generate && npm run build
start:  npm run start:deploy
        -> node scripts/start-production.cjs
        -> prisma migrate deploy
        -> optional seed when RUN_DB_SEED=true
        -> node dist/server.js
```

Admin:

```text
npm ci
npm run build       # tsc --noEmit && vite build
output: dist
```

Mobile:

```powershell
flutter pub get
flutter build apk --release --dart-define=API_BASE_URL=https://<render-service>/api/v1
flutter build appbundle --release --dart-define=API_BASE_URL=https://<render-service>/api/v1
```

## 6. API / security / realtime inventory

- REST base: `/api/v1`; health: `/health`.
- JWT access tokens, rotating refresh tokens, RBAC (`ADMIN`, `EMPLOYER`), Zod validation, rate limits,
  Helmet, strict CORS allow-list, audit logs, payment idempotency, atomic session start.
- Socket.IO at `/socket.io` with access-token authentication. Admin/employer clients poll REST as
  fallback.
- Scheduler runs every 5 seconds and at boot; **new** request-triggered reconciliation runs before API
  handlers at most once per interval, so a sleeping Render instance expires overdue sessions when it
  wakes.
- QR codes use an HMAC lookup plus AES-encrypted copy; no database IDs in QR payloads.
- Employer credentials: temporary password AES-encrypted, admin-only, cleared on first login.

## 7. Deployment-blocking issues found and fixed

| Issue | Fix |
|---|---|
| Prisma migrations cannot target Supabase pooler/direct split | `directUrl = env("DIRECT_URL")` |
| Render/Vercel cross-site refresh cookie would be rejected | `COOKIE_SAME_SITE` (`none` in production) + secure cookies + CORS credentials |
| Documentation used `CORS_ORIGIN`, code used `CORS_ORIGINS` | both aliases accepted and merged |
| Sleeping backend would not expire sessions until scheduler resumed | boot scheduler + pre-request reconciliation middleware |
| No production deploy entrypoint | `scripts/start-production.cjs` and `start:deploy` with migrations + optional first-boot seed |
| Manual Render free jobs/shell unavailable | first-boot seed controlled by `RUN_DB_SEED=true` |
| Admin SPA refresh on hard navigation | `admin-web/vercel.json` + `public/_redirects` |
| Production API base URL scattered | centralized `VITE_API_URL` / `VITE_SOCKET_URL`; mobile `AppConfig` dart-define |
| Commercial Vercel Hobby use | documented as non-compliant; Cloudflare Pages/Netlify recommended |

## 8. Remaining external blockers

1. **GitHub:** no repository/remote or CLI authentication on this machine. A local Git repository and
   commit can be prepared; creating/pushing the remote requires your GitHub login.
2. **Supabase:** account, organization, project, database password, and connection strings are not
   available. Connection strings must be entered directly into Render, not pasted into chat.
3. **Render:** account authorization is required. Free-plan sleeping is accepted and documented.
4. **Admin host:** Vercel Hobby is non-commercial; choose Cloudflare Pages (recommended free), Netlify
   Free, or a paid Vercel plan. Do not claim Vercel Hobby as compliant production use.
5. **Android:** production URL must be supplied before the final APK/AAB build. APK signing keys exist
   locally and must not be committed.

## 9. Deployment plan

1. Commit the hardened repository to GitHub (no `.env`, secrets, keystores or build outputs).
2. Create Supabase project, apply migrations, verify tables/indexes.
3. Create Render web service from the GitHub repo; set environment variables and first-boot seed.
4. Verify `/health`, login, QR, payments, sessions, reports against Render + Supabase.
5. Deploy the static admin build to the chosen compliant host; verify CORS/cookies/socket/polling.
6. Rebuild the Android APK/AAB against the production HTTPS API; install and test login/rental.
7. Run the 20-step production integration test, including cold start and restart scenarios.
8. Fill `FINAL_DEPLOYMENT_REPORT.md` with real URLs and results only after they exist.

## 10. Rollback

- Backend: Render keeps the two most recent deploys on Free; rollback via dashboard.
- Database: no destructive migration is used. Before any future migration, take a manual Supabase
  backup; restore with `pg_restore` if needed.
- Admin: redeploy the previous static build from the Git commit.
- Mobile: keep the previous signed APK/AAB; versionCode must increase for updates.
