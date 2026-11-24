# Render Backend Deployment

Deploy the existing Express API from `backend/` on Render Free. Render Free is **not production-grade**:
it sleeps after 15 idle minutes and may restart at any time. The API is designed to recover safely; see
`FREE_HOSTING_LIMITATIONS.md`.

## 0. Deployed state (24 November 2026)

| Item | Value |
|---|---|
| Public API | **https://game-rental-api-znao.onrender.com** |
| Render service ID | `srv-dc2hlpcs728c73akpkb0` |
| Type / plan / region | Web Service / Free / Frankfurt |
| Root directory | `backend` |
| Build command | `npm ci --include=dev && npx prisma generate && npm run build` |
| Start command | `npm run start:deploy` |
| Health check | `/health` → `200 {"status":"ok"}` |
| Database | Supabase PostgreSQL, transaction pooler for runtime, session pooler for migrations |
| Seed | Run once from the deployment machine; `RUN_DB_SEED=false` on Render |
| Status | **Live and verified** — 17 production API checks passed |

The service name requested (`game-rental-api`) was taken globally on `onrender.com`, so Render assigned
the suffix `-znao`. Use the assigned URL; never guess the subdomain.

## 1. Prerequisites

- A GitHub repository containing this project (`backend/` included).
- A Supabase project with `DATABASE_URL` and `DIRECT_URL` ready.
- Admin web origin (Cloudflare Pages, Netlify, or Vercel).
- Render account at <https://dashboard.render.com> (manual sign-in/authorization required).

## 2. Create the service (Blueprint)

The repository contains `render.yaml` with:

- name `game-rental-api`
- runtime `node`
- plan `free`
- root directory `backend`
- build `npm ci --include=dev && npx prisma generate && npm run build`
- start `npm run start:deploy`
- health check `/health`

In Render: **New → Blueprint**, connect the repository, select the branch, review the plan, and apply.
Adjust `region` in `render.yaml` or the dashboard to the region closest to Supabase/users (EU/Frankfurt is
a reasonable default for Ethiopia).

### Manual service instead

If not using the Blueprint:

| Setting | Value |
|---|---|
| Type | Web Service |
| Environment | Node |
| Plan | Free |
| Root Directory | `backend` |
| Build Command | `npm ci --include=dev && npx prisma generate && npm run build` |
| Start Command | `npm run start:deploy` |
| Health Check Path | `/health` |
| Auto-Deploy | On |

The start script runs `prisma migrate deploy` before starting the compiled API, and can run the
idempotent seed once when `RUN_DB_SEED=true`.

### Why `--include=dev`

Render sets `NODE_ENV=production` in the build environment. Plain `npm ci` then skips
`devDependencies`, so `typescript` and all `@types/*` packages are missing and `tsc` fails with
`TS7016` errors such as “Could not find a declaration file for module 'express'”. The first deploy in
this project failed exactly that way; `npm ci --include=dev` fixes it.

## 3. Environment variables

Enter these in Render → Environment. Values marked *secret* must never be committed or shared in chat.

| Key | Example / source |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `10000` (Render also injects `PORT`) |
| `DATABASE_URL` *(secret)* | Supabase transaction-pooler URL from `DATABASE_DEPLOYMENT.md` |
| `DIRECT_URL` *(secret)* | Supabase direct or session-pooler URL |
| `JWT_ACCESS_SECRET` *(secret)* | generated ≥48 random bytes |
| `JWT_REFRESH_SECRET` *(secret)* | different generated ≥48 random bytes |
| `QR_HMAC_SECRET` *(secret)* | generated ≥48 random bytes; keep forever |
| `ACCESS_TOKEN_TTL_MINUTES` | `30` |
| `REFRESH_TOKEN_TTL_DAYS` | `30` |
| `REFRESH_REUSE_GRACE_SECONDS` | `60` |
| `CORS_ORIGINS` | exact admin origin, e.g. `https://game-rental-admin.onrender.com` |
| `COOKIE_SAME_SITE` | `none` for a cross-origin admin; `lax` for same-origin API proxy |
| `BUSINESS_NAME` | your business name |
| `BUSINESS_TIMEZONE` | `Africa/Addis_Ababa` |
| `BUSINESS_CURRENCY` | `ETB` |
| `SEED_ADMIN_USERNAME` | `admin` (or your choice) |
| `SEED_ADMIN_PASSWORD` *(secret)* | strong unique password from a password manager |
| `SEED_ADMIN_FULL_NAME` | owner name |
| `SEED_ADMIN_PHONE` | optional |
| `SEED_SAMPLE_DATA` | `false` |
| `RUN_DB_SEED` | `true` for the **first** deploy only, then `false` |
| `SESSION_EXPIRY_INTERVAL_MS` | `5000` |

Generate secrets locally without printing them in chat:

```powershell
node -e "const c=require('crypto'); console.log(c.randomBytes(48).toString('hex'))"
```

Set `CORS_ORIGINS` to the **exact** static site origin, without a trailing slash. If you use both a
preview and production admin URL, comma-separate them deliberately; do not use `*`.

### Cookie mode

- **Vercel/Cloudflare → Render direct API:** `COOKIE_SAME_SITE=none` (Secure is automatic in production).
  Some browsers block third-party cookies; if refresh fails after the 30-minute access token, use the
  same-origin proxy option in `ADMIN_WEB_DEPLOYMENT.md` and set `lax`.
- **Same-origin proxy (recommended for cookie reliability):** `COOKIE_SAME_SITE=lax`.

## 4. First deployment and seed

This deployment applied migrations and seeded the administrator **once from the deployment machine**
before the first boot, so Render runs with `RUN_DB_SEED=false`. The seed is idempotent and safe to keep
disabled.

If you prefer Render to seed instead:

1. Create the service; the first build runs Prisma generate + TypeScript build.
2. Set `RUN_DB_SEED=true` and `SEED_SAMPLE_DATA=false` for the first boot.
3. Deploy. Startup runs `prisma migrate deploy` → `npm run seed` → `node dist/server.js`.
4. Read the Render logs for `Seed complete` and `Backend API listening`.
5. Sign in with the seeded admin credentials, then **change the password immediately**.
6. Set `RUN_DB_SEED=false` and redeploy/restart.

Do not enable `SEED_SAMPLE_DATA` in production.

## 5. Verify the backend

```powershell
$api = "https://game-rental-api-znao.onrender.com"
Invoke-RestMethod "$api/health"
```

Expected `status = ok`. A 503 means the database is unreachable (Supabase paused/misconfigured).

Login:

```powershell
$login = Invoke-RestMethod -Method Post `
  -Uri "$api/api/v1/auth/login" `
  -ContentType "application/json" `
  -Headers @{ "x-client-type" = "mobile" } `
  -Body '{"username":"admin","password":"<your password>"}'
$login.data.user.role   # ADMIN
```

Authenticated request:

```powershell
Invoke-RestMethod "$api/api/v1/admin/dashboard" `
  -Headers @{ Authorization = "Bearer $($login.data.accessToken)" }
```

Logs to check:

- `Session scheduler started`
- `Backend API listening`
- Prisma migration output
- no loop of `Pre-request session reconciliation failed`

### Automated production smoke test

`backend/scripts/production-smoke.mjs` performs read-only checks: health/database, CORS preflight,
admin login, cookie flags, authenticated `/auth/me`, machines, categories, packages, settings, admin
dashboard, refresh-token rotation and logout. The password is read from an environment variable and is
never printed.

```powershell
$env:SMOKE_ADMIN_USERNAME = 'admin'
$env:SMOKE_ADMIN_PASSWORD = '<from your password manager>'
$env:SMOKE_ADMIN_ORIGIN   = 'https://game-rental-admin.onrender.com'
node backend/scripts/production-smoke.mjs 'https://game-rental-api-znao.onrender.com'
```

Result on 24 November 2026: **17/17 checks passed.**

## 6. Timer behavior on Render Free

- While the instance is awake, the scheduler runs every 5 seconds.
- On boot after sleep/restart, the scheduler reconciles all overdue sessions.
- Before API requests, `reconcileExpiredSessions` runs (throttled to the scheduler interval) so a
  cold-starting machine/session query cannot observe a stale active session.
- An idle, sleeping backend cannot expire sessions at the exact second. Expiry becomes effective when
  the service wakes for any request. The next QR scan/payment/dashboard call reconciles before reading
  state. Payments/sessions are never lost.
- Do not add a free Render cron/worker: cron jobs and background workers are paid features. An external
  uptime ping can prevent sleep but is not guaranteed; see the limitations document.

## 7. Real-time behavior

Socket.IO is enabled and authenticated by the access token. It works while the Render instance is awake.
When Render sleeps, clients disconnect; the admin layout and mobile app retry and also poll REST. The
dashboard invalidates live/session/payment queries every 10–30 seconds; mobile sessions poll every 5–15
seconds. Real-time notifications are a convenience, not the source of truth.

## 8. Health, restarts and database recovery

- `/health` executes `SELECT 1`; Render restarts do not lose data because all state is in Supabase.
- The Prisma client is a singleton; Supabase pooler uses `connection_limit=1`.
- If Supabase was paused, resume it in the Supabase dashboard; Render's next request reconnects.
- Free instances may restart at any time; the start script re-runs idempotent migrations.

## 9. Cold-start expectations

- A slept service takes about 60 seconds to answer the first request.
- The API page in the browser may show a Render loading screen during wake-up.
- The Flutter app shows a network error if its 20-second request timeout expires; the user retries and
  the backend is typically warm. Do not increase client timeouts excessively.

## 10. Troubleshooting

| Symptom | Action |
|---|---|
| Build fails on `prisma generate` | ensure `DIRECT_URL`/`DATABASE_URL` exist; inspect build logs |
| Build fails with `TS7016` / missing `@types/*` | Render sets `NODE_ENV=production`; use `npm ci --include=dev` |
| `P1001` database unreachable (pooler TCP is open) | add `sslmode=require` to both Supabase URLs |
| `prepared statement already exists` | `DATABASE_URL` must be the transaction pooler with `pgbouncer=true` |
| CORS error in admin | `CORS_ORIGINS` must exactly match the admin origin; restart/redeploy after change |
| Cookie not sent | cross-site mode needs `COOKIE_SAME_SITE=none` + HTTPS; otherwise use same-origin proxy |
| Health 503 | database connection/Supabase project state |
| Sessions expire late | expected while Render sleeps; first request reconciles; see limitations |
| `npm run seed` login loop | seed only creates admin when absent; use reset-password from admin UI if needed |

## 11. Post-deploy checklist

- [x] `/health` returns 200.
- [x] Database migration status is up to date.
- [x] Admin login works over HTTPS.
- [x] `RUN_DB_SEED=false` after initial seed.
- [x] `SEED_SAMPLE_DATA=false`.
- [x] CORS allows exactly the admin origin.
- [x] Cookie mode matches the admin hosting mode.
- [ ] Seeded admin password changed by the owner (still the generated bootstrap password).
- [ ] QR scanning/payment/session flow tested through the production API with real business data.
- [x] Render logs contain no recurring errors.
- [x] Free-plan limits accepted and documented.
