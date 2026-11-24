# Final Deployment Report

**Project:** Game Rental Management System  
**Date:** 24 November 2026  
**Status:** **LIVE on free tiers** — backend, database, admin web and mobile production build.  
Every result below was produced by an actual command or browser session during this deployment. Nothing
is inferred from configuration alone, and no URL or credential is invented.

## 1. Live endpoints

| Component | URL | Plan |
|---|---|---|
| API (central backend) | **https://game-rental-api-znao.onrender.com** | Render Free (Frankfurt) |
| Admin web | **https://game-rental-admin.onrender.com** | Render Static Sites Free |
| Database | Supabase PostgreSQL `game-rental-production` (ref `jivzlczwlhzdwluokhuc`) | Supabase Free (Europe) |
| Source | <https://github.com/ibrahim-kamil-ibrahim/game> (`main`) | GitHub Free |
| Health check | **https://game-rental-api-znao.onrender.com/health** | — |

The Render service name `game-rental-api` was already taken globally, so Render assigned the suffix
`-znao`. The static site received the exact requested name. `CORS_ORIGINS` and the admin build both use
these assigned URLs.

## 2. What was deployed

1. **Supabase** project created on the Free plan; password generated in-page and never displayed.
2. **Prisma migrations** applied (3/3) through the Supabase **session pooler** because the direct
   database host is IPv6-only on this project.
3. **Idempotent seed** executed once: business, settings and the `admin` account. Sample data disabled.
4. **Render web service** created from the GitHub repo using the Free plan, Node runtime, Frankfurt,
   root `backend`, health check `/health`, start `npm run start:deploy`.
5. **Render static site** created from the same repo, root `admin-web`, build `npm ci && npm run build`,
   publish `dist`, with `VITE_API_URL` / `VITE_SOCKET_URL` pointing at the API.
6. **Mobile** release APK/AAB rebuilt with
   `--dart-define=API_BASE_URL=https://game-rental-api-znao.onrender.com/api/v1`.

Server secrets (database URLs, JWT secrets, QR HMAC secret, bootstrap admin password) were transferred
through a loopback-only helper and a local file. They were never printed in this conversation, committed
to Git, or embedded in the admin bundle.

## 3. Issues found and fixed during the real deployment

| Issue | Resolution |
|---|---|
| Render build failed with `TS7016` for every `@types/*` package | Render sets `NODE_ENV=production`, so `npm ci` skipped devDependencies. Build changed to `npm ci --include=dev && npx prisma generate && npm run build` in both `render.yaml` and the live service, then redeployed. |
| Prisma `P1001` even though pooler TCP 5432/6543 answered | Supabase requires TLS; `sslmode=require` was added to `DATABASE_URL` and `DIRECT_URL`. |
| Supabase direct host `db.<ref>.supabase.co` resolves to IPv6 only | Migrations use the session pooler (`:5432`) instead of the direct host. |
| Netlify GitHub OAuth returned `email_collision` | Admin hosted on Render Static Sites Free instead. |
| Render static site returned 404 for deep links (`/machines/<id>`) | `_redirects` is not honored by Render; added a Render rewrite rule `/* → /index.html` and declared it in `render.yaml`. |
| Vercel Hobby is non-commercial | Not used. |
| API subdomain not available | Used the Render-assigned `game-rental-api-znao.onrender.com` everywhere. |

## 4. Verification evidence

### Database

- `npx prisma migrate deploy` → **“All migrations have been successfully applied.”**
- Seed output → business created, administrator `admin` created, `users=1 machines=0 packages=0`.
- Render `/health` executes `SELECT 1` and returned **`200 {"status":"ok"}`**.

### Backend — 17/17 production checks passed

`backend/scripts/production-smoke.mjs` was run against the live API:

- health returns 200 and reports the database as `ok`;
- CORS preflight from the admin origin is allowed with credentials;
- admin login succeeds and returns an access token;
- mobile login returns a rotating refresh token;
- refresh cookie is `HttpOnly`, `Secure`, `SameSite=None`;
- authenticated `/auth/me` returns the admin user;
- `machines`, `categories`, `packages`, `settings`, `admin/dashboard` all return 200;
- refresh-token rotation succeeds;
- logout succeeds.

### Admin web — real browser (Edge via Playwright)

- Login page loads; sign-in redirects into the dashboard.
- Dashboard renders the full admin navigation and real business data from `/api/v1/admin/dashboard`.
- Refresh cookie is stored with `HttpOnly`, `Secure`, `SameSite=None`.
- A full page reload keeps the session (refresh returns 200) — the Render sleep/refresh design works.
- Deep link `/machines/does-not-exist` returns the SPA (200, `#root`), so browser refreshes work.
- No 4xx/5xx API responses after login; the single boot-time refresh 401 is expected with no cookie.

### Mobile

- `flutter analyze` clean and `flutter test` **6/6 passed**.
- Release **APK 76.08 MB**, **AAB 65.21 MB**, built with
  `--dart-define=API_BASE_URL=https://game-rental-api-znao.onrender.com/api/v1`.
- APK SHA-256 `A3EFD82DB34B0EFBB53F10CADE0B1F08CC987EAC519083F47029E12DEA83C08F`;
  AAB SHA-256 `BD048E824C6CB5DCFBE5051F11FAE25F74051B686267D7F427B6B55F47437238`.
- Signed with the GameZone release certificate (V2); certificate SHA-256
  `dcb51044a9260fcc95f5593a300d3704b8fb55df9448bf5c57f1122710bd9933`.
- The AOT snapshot contains the production API host and **no** `10.0.2.2` or `localhost` API URL.
- Physical-device acceptance tests remain for the owner (install, camera/QR, real rental).

## 5. Free-plan limitations accepted

- **Render Free** sleeps after 15 idle minutes; cold start is about a minute. Session expiry is
  reconciled on boot and before API requests. While asleep, expiry is not second-accurate.
- **Supabase Free**: 500 MB, no automatic backups, pauses after ~7 days of low activity.
- **Render Static Sites Free**: 100 GB bandwidth/month, no SLA.
- Free tiers are best-effort and can change. See `FREE_HOSTING_LIMITATIONS.md`.

## 6. Required owner actions

1. **Change the bootstrap admin password immediately** after first sign-in (Admin → Settings/Profile).
2. Store the generated secrets in a password manager, then delete the local secrets file described in
   section 8. In particular back up `QR_HMAC_SECRET` (losing it invalidates printed QR codes) and the
   Android keystore.
3. Configure a manual Supabase backup routine (no automatic backups on Free) and test one restore.
4. Install the release APK on a real phone and complete a full rental: QR scan, cash payment, session
   start, expiry, reports.
5. Optionally add a free uptime ping to `/health` to reduce cold starts (consumes the 750 free hours).
6. Review `PRODUCTION_SECURITY_CHECKLIST.md`; the remaining unchecked items are operational/owner tasks.

## 7. Deployment commits

| Commit | Purpose |
|---|---|
| `39d5a8b` | Deployment hardening and documentation |
| `1ccf4c4` | Record live GitHub repository in reports |
| `640089d` | Install backend devDependencies during Render build |
| final documentation commit | Production smoke-test script, Render SPA rewrite, live deployment reports |

## 8. Secret handling

- No password, database URL, JWT secret, QR secret or keystore password appears in this report, the
  repository, the admin bundle, or the mobile build configuration.
- The generated production secrets are stored on this machine only, at:
  `C:\Users\Administrator\Documents\game-rental-production-secrets.json`
  (temporary working copy under `%TEMP%\opencode\`). Move them into a password manager and delete the
  files afterwards.
- The Render API key used to create the services can be revoked at
  Render → Account Settings → API Keys once deployment is finished.
- The Supabase and Render dashboards remain signed in on this machine; sign out on shared computers.

## 9. Honest caveats

- Render Free is explicitly not recommended for production by Render. This deployment is functional and
  safe for data integrity (all state is in Postgres), but it can sleep, restart, and cold-start.
- No automated off-site backup exists yet.
- Real-money scale should move the API to a small always-on instance and enable Supabase backups.
- No claim is made that the physical Android acceptance tests have been performed; they have not.

## 10. Documentation index

- `DEPLOYMENT_AUDIT.md`
- `DATABASE_DEPLOYMENT.md`
- `BACKEND_DEPLOYMENT.md`
- `ADMIN_WEB_DEPLOYMENT.md`
- `MOBILE_RELEASE_GUIDE.md`
- `PRODUCTION_SECURITY_CHECKLIST.md`
- `FREE_HOSTING_LIMITATIONS.md`
- this report
