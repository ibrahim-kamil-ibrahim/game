# Security Guide

## 1. Threat model

Assets: cash records, revenue reports, customer/employer data, machine control, admin credentials.
Primary threats: an employer attempting to change prices or read others' data, forged QR codes, stolen
tokens, duplicate/replayed payment requests, brute-force login, and accidental data loss.

The design principle is **never trust the client**:

- prices, durations, amounts, employer identity and session times are always derived on the server;
- roles are checked on the backend for every request;
- the database enforces the most important invariants even if application code regresses.

## 2. Authentication

- Passwords are hashed with **bcrypt cost 12**. Plaintext passwords are never stored or logged.
- Usernames are unique, trimmed and lowercased.
- Login is rate-limited (30 attempts per 15 minutes per IP, successful requests skipped).
- Suspended accounts cannot log in. Existing access tokens are rejected because the auth middleware
  reloads the user status from the database on every request.
- Password reset by an admin revokes all refresh tokens for that employer.
- Admin credential hand-off: the generated temporary password is stored **AES-256-GCM encrypted**
  (`initialPasswordEncrypted`) so the admin can copy it from the employer detail page. It is returned
  only on admin-only endpoints with `Cache-Control: no-store` and is erased automatically on the
  employer's first successful login and on any password change.
- Self-service password change verifies the current password and revokes all refresh tokens.

## 3. Access tokens

- Signed HS256 JWTs with `sub`, `businessId`, `role`, `username`, `type: "access"`, `iat`, `exp`.
- Default lifetime: 30 minutes (`ACCESS_TOKEN_TTL_MINUTES`).
- The token is kept in memory by the admin web app (not localStorage) and in encrypted storage on
  Android.
- A token is never accepted if the user has been soft-deleted or suspended.

## 4. Refresh tokens and rotation

- 512-bit opaque random tokens. Only an HMAC-SHA256 hash is stored.
- Refresh families: one per login/device. Every refresh rotates the token and links the replacement.
- Reuse detection revokes the whole family after a configurable grace window
  (`REFRESH_REUSE_GRACE_SECONDS`, default 60) to survive lost responses and app reloads. A stolen token
  replayed later is rejected and invalidates the family.
- Browsers: `httpOnly`, `SameSite=Lax`, `Secure` in production, path `/api/v1/auth`.
- Mobile: returned in the JSON body only when `x-client-type: mobile` is sent and stored with
  `flutter_secure_storage` (Android Keystore-backed encryption).
- Logout revokes the presented refresh token.

## 5. Role-based access control

Two roles only:

- `ADMIN` — full access to admin endpoints.
- `EMPLOYER` — operational endpoints, strictly scoped to their own payments, sessions and
  notifications.

Enforcement points:

- `authenticate` middleware on every protected route;
- `requireRole('ADMIN')` on management/financial endpoints;
- ownership checks inside services (payment/session detail, list filters, session actions);
- repository queries always include `businessId`, preventing cross-business access if the system is
  later multi-tenant.

The backend tests include a dedicated suite proving employers receive `403` on every admin surface and
`403` on other employers' records.

## 6. Input validation

- Zod schemas validate and **strip** unknown fields on body, query and params.
- UUIDs, enums, date formats, positive amounts and bounded text lengths are enforced.
- Client-provided `amountSantim`, `durationMinutes`, `employerId` (for employers) and `status` are
  ignored or rejected in sensitive paths.
- SQL is accessed through Prisma or parameterized `Prisma.sql`; raw SQL only interpolates parameters.

## 7. QR code security

- 192 random bits per code, encoded as `grs:v1:<base64url>`.
- Database lookup uses HMAC-SHA256 with a server secret, so a database leak does not reveal usable
  codes.
- An encrypted copy (AES-256-GCM) allows admins to reprint the code; it is never sent to employer
  clients.
- Regeneration revokes the previous code and increments the version.
- Database ids are never used as QR credentials.
- Resolution is authenticated and rate-limited (60/min), and returns only machines in the caller's
  business.

## 8. Payments, idempotency and concurrency

- Cash payments require the package to be active and applicable; the server snapshots price/duration.
- `UNIQUE (businessId, idempotencyKey)` prevents duplicate submissions.
- Session start locks the payment and machine rows and is protected by a unique payment link and a
  partial unique index for active sessions.
- A conflicting start voids the unused payment with an audit record instead of losing money history.
- Void/refund require an admin and a reason; both are audited. Payments are never deleted.
- All financial amounts are integers (santim) with database check constraints.

## 9. Transport and headers

- Helmet sets CSP, frame protection, MIME sniffing protection, referrer policy and HSTS.
- CORS is an explicit allow-list (`CORS_ORIGINS`), with credentials enabled. No wildcard in
  production.
- TLS termination is at Nginx (see `deploy/nginx/gamezone.conf`); HTTP redirects to HTTPS.
- Nginx adds HSTS and security headers; Socket.IO is proxied with WebSocket upgrade.
- Request bodies are limited to 2 MB. Compression is enabled.
- Health checks do not expose secrets.

## 10. Rate limiting

| Scope | Limit |
|---|---|
| Global API | 600 requests/min/IP |
| Login / refresh / password change | 30 per 15 min/IP (successful logins skipped) |
| QR resolution | 60/min |

Rate limits can be tuned in `src/middleware/rateLimit.ts`; production should add an edge/WAF limit as
well if exposed to the internet.

## 11. Audit logging

Recorded with actor, role, action, entity type/id, before/after JSON, IP and user agent:

- logins, failed logins and blocked suspended logins;
- employer creation, edits, suspension, password resets;
- machine creation/status changes/QR regeneration/deletion;
- package creation/edits (price/duration changes);
- payments, automatic voiding, admin void/refund;
- session start/end/cancel/pause/resume/extension/expiry;
- expense creation/update/deletion;
- settings changes.

Audit entries are written in the same transaction as the change where possible. They are visible only
to admins and cannot be edited through the API.

## 12. Secrets management

Required secrets (never commit them):

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (≥32 chars)
- `QR_HMAC_SECRET` (≥32 chars; **changing it invalidates all printed QR codes**)
- `SEED_ADMIN_PASSWORD`
- Android keystore passwords (`android/key.properties`)

Use a secret manager or restricted environment files. Rotate immediately if leaked. Rotating JWT
secrets logs everyone out; rotating the QR secret requires regenerating every machine code.

## 13. Mobile-specific security

- Tokens in Android encrypted storage; never in SharedPreferences or logs.
- Cleartext HTTP is limited to the emulator host/localhost for development. Production must be HTTPS.
- The app re-verifies all pricing with the server and displays only server-provided package options.
- Local notifications are informational; the server scheduler is the only authority for expiry.
- Cached dashboard/session data is stored in SharedPreferences for offline resilience; it contains no
  credentials or full payment details beyond amounts already visible to the signed-in employer.
- Release builds must use a private keystore and be distributed over HTTPS/Play Store.

## 14. Operational checklist

- [ ] Replace all default secrets and seeded passwords.
- [ ] Set `SEED_SAMPLE_DATA=false` for production.
- [ ] Use HTTPS; set `Secure` cookies automatically via `NODE_ENV=production`.
- [ ] Restrict PostgreSQL to a private network; no public port.
- [ ] Keep the API behind Nginx; only 80/443 exposed.
- [ ] Enable automated daily database backups and test restores.
- [ ] Store `QR_HMAC_SECRET` with backups; without it printed QR reprints are impossible.
- [ ] Review audit logs for refunds, voids, price changes and logins.
- [ ] Update dependencies and re-run tests before deploying.
- [ ] Monitor `/health`, disk space, error logs and failed login rates.
- [ ] Back up Android signing keys securely; losing them prevents app updates.

## 15. Incident response

1. Suspected token theft: suspend the account, revoke refresh tokens (automatic), rotate JWT secrets if
   broad compromise is possible, review audit logs.
2. Suspected QR cloning: regenerate all affected machine QR codes; the old codes stop working.
3. Payment dispute: use the audit log and immutable payment/session records; issue an admin refund with
   a reason (never delete).
4. Database compromise: rotate all secrets, restore from a known-good backup, notify stakeholders,
   preserve logs.
