# Production Security Checklist

Legend: **[code]** already implemented and locally tested · **[cloud]** must be verified after cloud
deployment · **[manual]** requires an owner/account action.

## Secrets and source control

- [x] **[manual]** No `.env` file, database URL, JWT secret, QR secret, keystore or `key.properties` is
      committed. Verified locally with Git ignore rules before the first commit.
- [x] **[cloud]** Render environment variables were set through the Render API/dashboard, never in
      `render.yaml` values (`sync: false` for secrets).
- [ ] **[manual]** Database password and admin password are stored in a password manager, not chat.
      *(Generated bootstrap password is in the local secrets file described in the final report.)*
- [ ] **[manual]** `QR_HMAC_SECRET` is backed up. Changing it invalidates all printed QR codes.
- [x] **[cloud]** Render static-site environment contains only `VITE_API_URL` and `VITE_SOCKET_URL`
      (public values), never backend secrets.
- [ ] **[manual]** Android keystore + `key.properties` backed up offline.

## Authentication and authorization

- [x] **[code]** Passwords hashed with bcrypt cost 12; no plaintext password column.
- [x] **[code]** Access JWT + rotating opaque refresh tokens; hashed refresh storage; family revocation.
- [x] **[code]** Suspended employers are rejected on every request (DB status check).
- [x] **[code]** RBAC on all admin routes; employer ownership checks on payments/sessions.
- [x] **[code]** Admin-only employer credentials; encrypted temporary password cleared after first login.
- [ ] **[cloud]** Employer cannot access `/api/v1/admin/*` in production.
- [ ] **[cloud]** Employer cannot read another employer's payment/session.
- [ ] **[cloud]** Employer cannot change prices, packages, machine configuration or settings.
- [ ] **[cloud]** Suspended employer tokens are rejected and socket disconnected.
- [x] **[cloud]** Admin login over HTTPS works against the production API and returns role `ADMIN`.

## Transport and browser security

- [x] **[cloud]** Render and the static host serve over HTTPS only.
- [x] **[code/cloud]** Helmet headers enabled by Express; Render terminates TLS.
- [x] **[code]** Strict CORS allow-list (`CORS_ORIGINS` exact origins, credentials enabled).
- [x] **[cloud]** `COOKIE_SAME_SITE=none` matches the cross-origin Render static site.
- [x] **[cloud]** HttpOnly + Secure + SameSite=None refresh cookie verified in a real browser.
- [x] **[cloud]** No mixed-content requests from the admin page.
- [ ] **[manual]** If cross-site cookies are blocked by the browser, switch to same-origin proxy or
      document forced re-login rather than weakening cookie security.
- [x] **[code]** Access token kept in memory; no `localStorage` token persistence.

## Input, abuse and data integrity

- [x] **[code]** Zod validation strips unknown fields; prices/durations read server-side.
- [x] **[code]** Rate limits (global, auth, QR) active behind Render proxy.
- [x] **[code]** Payment idempotency key unique per business.
- [x] **[code]** Session start and extension use transactions/row locks.
- [x] **[code]** Partial unique index prevents two active sessions per machine.
- [x] **[code]** Financial records never deleted; void/refund audited.
- [x] **[code]** UTC timestamps, integer santim, server-authoritative countdown.
- [ ] **[cloud]** Duplicate payment/start tested against production.
- [ ] **[cloud]** Overlapping session race tested with two employers.

## Database

- [x] **[cloud]** Supabase SSL connection verified (`sslmode=require`); runtime uses `pgbouncer=true`.
- [x] **[cloud]** Prisma migrations applied with `migrate deploy` only; no reset.
- [x] **[cloud]** Foreign keys, partial unique index and check constraints applied by the three migrations.
- [x] **[cloud]** API uses the transaction pooler; migrations use the session pooler.
- [ ] **[manual]** Manual backups configured (Supabase Free has no automatic backups).
- [ ] **[manual]** A restore into a separate database has been tested.
- [x] **[cloud]** Database is not exposed beyond Supabase's required connection endpoints.
- [x] **[cloud]** Supabase project pause alert understood; resume procedure documented.

## Audit and operations

- [x] **[code]** Audit logs cover logins, employer changes, machine/package changes, payments,
      voids/refunds, session changes, expenses, settings and credential resets.
- [ ] **[cloud]** Audit logs visible only to admin.
- [x] **[cloud]** Render deploy logs and runtime logs reviewed; migrations and startup clean.
- [x] **[cloud]** `/health` returns 200 and executes a database query.
- [ ] **[manual]** Daily cash review by owner using dashboard/reports.
- [ ] **[manual]** Incident procedure: suspend account, revoke tokens, rotate secrets, review audit.

## Mobile

- [x] **[code]** Tokens in Android encrypted storage; no secrets in APK.
- [x] **[code]** HTTPS production API; cleartext restricted to local dev hosts.
- [x] **[code]** Session countdown derives from server time and re-syncs.
- [ ] **[cloud]** Production APK login tested on a real phone.
- [ ] **[manual]** APK signed with the production keystore; previous release retained.

## Hosting compliance and free-tier risks

- [x] **[manual]** Vercel Hobby is **not** used for this commercial admin app; Render Static Sites
      (free) are used instead.
- [x] **[manual]** Render Free sleeping/restart and “not for production” warning accepted and documented.
- [x] **[manual]** Supabase Free pause/500 MB/no-backup limits accepted and documented.
- [x] **[manual]** Free service terms re-checked at deployment time; free plans can change.

## Go-live gate

- [x] Admin can log in over HTTPS and all dashboard data is real.
- [ ] Employer APK can log in over HTTPS and complete a rental on a physical phone.
- [ ] Payment, session, expiry and report totals match in production.
- [x] No secret appears in GitHub, frontend bundles, APK configuration or logs.
- [ ] Backup/restore and incident contacts are documented and restore-tested.
