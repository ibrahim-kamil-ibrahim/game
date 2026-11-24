# Production Security Checklist

Legend: **[code]** already implemented and locally tested · **[cloud]** must be verified after cloud
deployment · **[manual]** requires an owner/account action.

## Secrets and source control

- [ ] **[manual]** No `.env` file, database URL, JWT secret, QR secret, keystore or `key.properties` is
      committed. Verified locally with Git ignore rules before the first commit.
- [ ] **[cloud]** Render environment variables are entered through the dashboard/blueprint secret fields,
      never in `render.yaml` values (`sync: false`).
- [ ] **[manual]** Database password and admin password are stored in a password manager, not chat.
- [ ] **[manual]** `QR_HMAC_SECRET` is backed up. Changing it invalidates all printed QR codes.
- [ ] **[cloud]** Vercel/Cloudflare build environment contains only `VITE_API_URL` and `VITE_SOCKET_URL`
      (public values), never backend secrets.
- [ ] **[manual]** Android keystore + `key.properties` backed up offline.

## Authentication and authorization

- [ ] **[code]** Passwords hashed with bcrypt cost 12; no plaintext password column.
- [ ] **[code]** Access JWT + rotating opaque refresh tokens; hashed refresh storage; family revocation.
- [ ] **[code]** Suspended employers are rejected on every request (DB status check).
- [ ] **[code]** RBAC on all admin routes; employer ownership checks on payments/sessions.
- [ ] **[code]** Admin-only employer credentials; encrypted temporary password cleared after first login.
- [ ] **[cloud]** Employer cannot access `/api/v1/admin/*` in production.
- [ ] **[cloud]** Employer cannot read another employer's payment/session.
- [ ] **[cloud]** Employer cannot change prices, packages, machine configuration or settings.
- [ ] **[cloud]** Suspended employer tokens are rejected and socket disconnected.

## Transport and browser security

- [ ] **[cloud]** Render and static host serve over HTTPS only.
- [ ] **[code/cloud]** Helmet headers enabled by Express; Render termination OK.
- [ ] **[code]** Strict CORS allow-list (`CORS_ORIGINS` exact origins, credentials enabled).
- [ ] **[cloud]** `COOKIE_SAME_SITE` matches hosting mode (`none` cross-site, `lax` same-origin proxy).
- [ ] **[cloud]** HttpOnly + Secure refresh cookie verified in browser devtools.
- [ ] **[cloud]** No mixed-content requests from the admin page.
- [ ] **[manual]** If cross-site cookies are blocked by the browser, switch to same-origin proxy or
      document forced re-login rather than weakening cookie security.
- [ ] **[code]** Access token kept in memory; no `localStorage` token persistence.

## Input, abuse and data integrity

- [ ] **[code]** Zod validation strips unknown fields; prices/durations read server-side.
- [ ] **[code]** Rate limits (global, auth, QR) active behind Render proxy.
- [ ] **[code]** Payment idempotency key unique per business.
- [ ] **[code]** Session start and extension use transactions/row locks.
- [ ] **[code]** Partial unique index prevents two active sessions per machine.
- [ ] **[code]** Financial records never deleted; void/refund audited.
- [ ] **[code]** UTC timestamps, integer santim, server-authoritative countdown.
- [ ] **[cloud]** Duplicate payment/start tested against production.
- [ ] **[cloud]** Overlapping session race tested with two employers.

## Database

- [ ] **[cloud]** Supabase SSL connection verified; pooler URL uses `pgbouncer=true`.
- [ ] **[cloud]** Prisma migrations applied with `migrate deploy` only; no reset.
- [ ] **[cloud]** Foreign keys, partial unique index and check constraints present.
- [ ] **[cloud]** API uses pooled URL; migrations use direct/session URL.
- [ ] **[manual]** Manual backups configured (Supabase Free has no automatic backups).
- [ ] **[manual]** A restore into a separate database has been tested.
- [ ] **[cloud]** Database not exposed publicly beyond Supabase's required connection endpoint.
- [ ] **[cloud]** Supabase project pause alert understood; resume procedure documented.

## Audit and operations

- [ ] **[code]** Audit logs cover logins, employer changes, machine/package changes, payments,
      voids/refunds, session changes, expenses, settings and credential resets.
- [ ] **[cloud]** Audit logs visible only to admin.
- [ ] **[cloud]** Render logs monitored for errors after deploy.
- [ ] **[cloud]** `/health` monitored (uptime service optional).
- [ ] **[manual]** Daily cash review by owner using dashboard/reports.
- [ ] **[manual]** Incident procedure: suspend account, revoke tokens, rotate secrets, review audit.

## Mobile

- [ ] **[code]** Tokens in Android encrypted storage; no secrets in APK.
- [ ] **[code]** HTTPS production API; cleartext restricted to local dev hosts.
- [ ] **[code]** Session countdown derives from server time and re-syncs.
- [ ] **[cloud]** Production APK login tested on a real phone.
- [ ] **[manual]** APK signed with the production keystore; previous release retained.

## Hosting compliance and free-tier risks

- [ ] **[manual]** Vercel Hobby is **not** used for this commercial admin app; Cloudflare Pages/Netlify or
      paid Vercel chosen.
- [ ] **[manual]** Render Free sleeping/restart and “not for production” warning accepted or upgraded.
- [ ] **[manual]** Supabase Free pause/500 MB/no-backup limits accepted or upgraded.
- [ ] **[manual]** Free service terms re-checked at deployment time; free plans can change.

## Go-live gate

- [ ] Admin can log in over HTTPS and all dashboard data is real.
- [ ] Employer APK can log in over HTTPS and complete a rental.
- [ ] Payment, session, expiry and report totals match.
- [ ] No secret appears in GitHub, frontend bundles, APK or logs.
- [ ] Backup/restore and incident contacts are documented.
