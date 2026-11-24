# API Documentation

Base URL: `http://localhost:4000/api/v1` (development)

All responses are JSON. Authenticated endpoints require:

```http
Authorization: Bearer <access_token>
```

Mobile clients also send:

```http
x-client-type: mobile
```

so the refresh token is returned in the JSON body instead of an httpOnly cookie.

## 1. Response envelope

Success:

```json
{ "success": true, "data": { }, "meta": { } }
```

Errors:

```json
{
  "success": false,
  "error": {
    "code": "MACHINE_NOT_AVAILABLE",
    "message": "PlayStation 5 is not available (in use). The payment was voided - refund the customer and try another machine.",
    "details": { "paymentRef": "CASH-20261123-ABC123", "paymentVoided": true }
  }
}
```

Common codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `INVALID_CREDENTIALS` (401),
`REFRESH_TOKEN_REUSED` (401), `FORBIDDEN` (403), `ACCOUNT_SUSPENDED` (403), `NOT_FOUND` (404),
`CONFLICT` (409), `MACHINE_NOT_AVAILABLE` (409), `MACHINE_IN_USE` (409),
`PAYMENT_NOT_USABLE` (409), `SESSION_NOT_ACTIVE` (409), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

Pagination uses `?page=1&pageSize=20` (max 100) and returns:

```json
{ "total": 42, "page": 1, "pageSize": 20, "totalPages": 3, "hasNextPage": true, "hasPreviousPage": false }
```

## 2. Authentication

### `POST /auth/login`

Rate-limited (30 attempts / 15 min / IP).

```json
{ "username": "employer1", "password": "Employer@12345" }
```

`200`:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "fullName": "Demo Employer",
      "username": "employer1",
      "role": "EMPLOYER",
      "status": "ACTIVE",
      "business": { "id": "uuid", "name": "GameZone", "currency": "ETB", "timezone": "Africa/Addis_Ababa" },
      "settings": { "allowExtension": true, "allowPause": false, "allowManualEnd": false, "requireEndReason": false, "expiryWarningMinutes": 5 }
    },
    "accessToken": "eyJ...",
    "refreshToken": "opaque-token (mobile only)",
    "refreshTokenExpiresAt": "2026-12-23T12:00:00.000Z"
  }
}
```

Suspended accounts return `403 ACCOUNT_SUSPENDED`.

### `POST /auth/refresh`

Browser: refresh cookie is sent automatically. Mobile:

```json
{ "refreshToken": "opaque-token" }
```

Returns the same shape as login. Every refresh rotates the token. Reusing a revoked token outside the
configured grace window (`REFRESH_REUSE_GRACE_SECONDS`, default 60) revokes the whole family and returns
`401 REFRESH_TOKEN_REUSED`.

### `POST /auth/logout`

Revokes the supplied refresh token (or cookie) and clears the cookie. Always returns success.

### `GET /auth/me`

Returns `{ "user": AuthUser }` and re-checks that the account is still active.

### `PATCH /auth/password`

```json
{ "currentPassword": "Old@12345", "newPassword": "New@123456" }
```

Revokes all refresh tokens; the client must sign in again.

## 3. Admin dashboard

### `GET /admin/dashboard` — ADMIN

Returns real aggregates:

```json
{
  "business": { "id": "...", "name": "...", "currency": "ETB", "timezone": "Africa/Addis_Ababa" },
  "serverTime": "2026-11-23T12:00:00.000Z",
  "revenue": {
    "todaySantim": 9500, "weekSantim": 15500, "monthSantim": 50000, "yearSantim": 300000,
    "allTimeSantim": 900000, "refundedTodaySantim": 0, "todayTransactions": 3
  },
  "finance": { "expensesMonthSantim": 10000, "profitMonthSantim": 40000 },
  "machines": { "total": 6, "available": 3, "inUse": 2, "maintenance": 1, "inactive": 0 },
  "sessions": { "total": 120, "active": 2, "today": 8, "averageDurationMinutes": 27 },
  "employers": { "total": 3, "active": 3 },
  "topMachines": [], "topEmployers": [], "revenueSeries": [], "recentPayments": [],
  "recentSessions": [], "machineOverview": [], "settings": {}
}
```

### `GET /admin/dashboard/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day|week|month`

Totals plus a time series of revenue, sessions and expenses, machine/employer counts and top packages.
Defaults to the last 30 days.

An alias is also available at `GET /admin/analytics` for contract compatibility.

## 4. Employers (ADMIN)

| Method | Path | Description |
|---|---|---|
| GET | `/admin/employers?search=&status=&page=&pageSize=` | List employers with sessions/revenue |
| POST | `/admin/employers` | Create employer |
| GET | `/admin/employers/:id` | Detail + stats + recent activity |
| PATCH | `/admin/employers/:id` | Update name, username, phone |
| PATCH | `/admin/employers/:id/status` | `{ "status": "ACTIVE" \| "SUSPENDED" }` |
| POST | `/admin/employers/:id/reset-password` | `{ "newPassword": "..." }` (optional; generated when omitted) |
| GET | `/admin/employers/:id/activity?page=&pageSize=` | Sessions, payments and audit history |

Create example (username and password are optional; the server generates strong unique values when omitted):

```json
{
  "fullName": "Abebe Bekele",
  "phone": "+251911000000"
}
```

`201` response includes the generated credentials once for hand-off:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "fullName": "Abebe Bekele",
    "username": "abebe-bekele-x7k2m",
    "status": "ACTIVE",
    "temporaryPassword": "kR7!mQ2vT9pLx4"
  }
}
```

`GET /admin/employers/:id` also returns a `credentials` block (admin only, `Cache-Control: no-store`):

```json
{
  "credentials": {
    "username": "abebe-bekele-x7k2m",
    "temporaryPassword": "kR7!mQ2vT9pLx4",
    "setAt": "2026-11-23T20:28:00.000Z"
  }
}
```

The temporary password is encrypted at rest and is cleared automatically on the employer's first
successful login. After that `temporaryPassword` is `null`; use reset to generate a new one.

Passwords must be ≥8 characters and contain a letter and a number. Suspension revokes refresh tokens
immediately. Other employers' private records are never exposed.

## 5. Categories

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/categories` | any authenticated | List with machine/package counts |
| POST | `/categories` | ADMIN | Create |
| PATCH | `/categories/:id` | ADMIN | Update / activate / deactivate |
| DELETE | `/categories/:id` | ADMIN | Delete only if unused |

## 6. Machines

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/machines?search=&status=&categoryId=&page=&pageSize=` | any | List equipment |
| POST | `/machines` | ADMIN | Register machine (automatically creates QR v1) |
| GET | `/machines/:id` | any | Machine, applicable packages, stats, recent sessions |
| PATCH | `/machines/:id` | ADMIN | Update details |
| PATCH | `/machines/:id/status` | ADMIN | `AVAILABLE`, `MAINTENANCE`, `INACTIVE` |
| DELETE | `/machines/:id` | ADMIN | Soft delete + revoke QR (no active session allowed) |
| GET | `/machines/:id/qr?format=png\|pdf\|json` | ADMIN | Download or inspect the QR |
| POST | `/machines/:id/qr/regenerate` | ADMIN | Revoke old code, issue next version |
| GET | `/machines/:id/history?page=&pageSize=` | any | Rental history |
| GET | `/machines/:id/stats` | ADMIN | Revenue/sessions/daily usage |
| GET | `/machines/live` | ADMIN | Live monitoring grid with server time |

Create example:

```json
{
  "name": "PlayStation 5 - Station 1",
  "code": "PS5-01",
  "categoryId": "uuid",
  "brand": "Sony",
  "model": "PlayStation 5",
  "location": "Main hall",
  "status": "AVAILABLE"
}
```

`IN_USE` cannot be set manually. Status changes are blocked while a session is active. The QR endpoint
returns `image/png` or `application/pdf`; `format=json` returns the exact payload for diagnostics.

## 7. Packages

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/packages?search=&status=&scope=&categoryId=&page=&pageSize=` | any | Employers see active packages only |
| POST | `/packages` | ADMIN | Create package |
| GET | `/packages/:id` | any | Package + usage statistics |
| PATCH | `/packages/:id` | ADMIN | Update price/duration/scope/status |
| DELETE | `/packages/:id` | ADMIN | Only if never used (otherwise deactivate) |
| GET | `/packages/:id/stats` | ADMIN | Sessions/revenue |

Create example:

```json
{
  "name": "Premium",
  "description": "30 minute session",
  "durationMinutes": 30,
  "priceSantim": 5000,
  "scope": "ALL",
  "status": "ACTIVE",
  "displayOrder": 3
}
```

Scoped examples: `{ "scope": "CATEGORY", "categoryId": "uuid" }` or
`{ "scope": "MACHINES", "machineIds": ["uuid", "uuid"] }`.

The price is always read from the package on the server. Client-supplied amounts are ignored.

## 8. QR resolution

### `POST /qr/resolve` — EMPLOYER or ADMIN, rate-limited (60/min)

```json
{ "token": "grs:v1:<secret>" }
```

`200`:

```json
{
  "machine": { "id": "...", "name": "...", "code": "...", "status": "AVAILABLE", "category": { "id": "...", "name": "Console" } },
  "packages": [ { "id": "...", "name": "Premium", "durationMinutes": 30, "priceSantim": 5000 } ],
  "available": true,
  "serverTime": "2026-11-23T12:00:00.000Z",
  "settings": { "allowExtension": true, "allowPause": false, "allowManualEnd": false, "requireEndReason": false }
}
```

Errors: `404 QR_NOT_RECOGNIZED`, `409 MACHINE_INACTIVE`, `409 MACHINE_MAINTENANCE`,
`409 MACHINE_IN_USE`, `409 NO_PACKAGES`. Conflict errors include machine details.

## 9. Payments

### `POST /payments/cash` — EMPLOYER or ADMIN

```json
{ "machineId": "uuid", "packageId": "uuid", "idempotencyKey": "uuid-v4" }
```

The server looks up the package, validates that it applies to the machine, validates machine
availability and records a `PAID` cash payment. Repeating the same idempotency key returns the original
payment (`200` instead of `201`). Admin callers must supply `employerId`.

Response includes `transactionRef`, amount, duration, machine, employer, `packageName`, `sessionId`
(null until a session starts).

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/payments?status=&type=&machineId=&employerId=&from=&to=&search=&page=&pageSize=` | any | Employers are scoped to their own payments |
| GET | `/payments/:id` | any | Detail (ownership enforced) |
| POST | `/payments/:id/void` | ADMIN | `{ "reason": "..." }` — only unstarted payments |
| POST | `/payments/:id/refund` | ADMIN | `{ "reason": "..." }` — only without an active session |

List responses include `summary: { collectedSantim, paidTransactions }` for the filtered set.

## 10. Sessions

### `POST /sessions/start`

```json
{ "paymentId": "uuid" }
```

Atomically:

1. locks the payment (`FOR UPDATE`) and verifies `PAID`, `RENTAL`, ownership;
2. returns the existing session if this payment already started one (safe retry);
3. locks the machine and verifies `AVAILABLE` and no active session;
4. creates the session (`ACTIVE`, `startedAt`, `endsAt`), sets the machine `IN_USE`, writes events,
   audit and notifications.

If the machine is unavailable, the payment is **voided** (a preserved record with a reason) and the API
returns `409 MACHINE_NOT_AVAILABLE` with `details.paymentRef` and `details.paymentVoided = true`.

### Other session endpoints

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/sessions?status=&machineId=&employerId=&from=&to=&search=&page=&pageSize=` | any | Employers scoped to their own |
| GET | `/sessions/active` | any | Running/paused sessions + `serverTime` |
| GET | `/sessions/:id` | any | Session + event timeline + `serverTime` |
| POST | `/sessions/:id/end` | EMPLOYER/ADMIN | `{ "reason": "..." }`; requires `allowManualEnd` for employers |
| POST | `/sessions/:id/cancel` | ADMIN | Cancel and release machine |
| POST | `/sessions/:id/extend` | EMPLOYER/ADMIN | `{ "packageId": "uuid", "idempotencyKey": "..." }` (admin bypasses `allowExtension`) |
| POST | `/sessions/:id/pause` | EMPLOYER/ADMIN | Requires `allowPause` for employers |
| POST | `/sessions/:id/resume` | EMPLOYER/ADMIN | Shifts `endsAt` by paused time |
| GET | `/sessions/:id/events` | any | Timeline |

Session representation includes server-computed `remainingSeconds`, `elapsedSeconds`, snapshots,
payment reference and extensions.

Errors: `409 SESSION_NOT_ACTIVE`, `403 MANUAL_END_DISABLED`, `400 REASON_REQUIRED`,
`403 EXTENSION_DISABLED`, `403 PAUSE_DISABLED`.

## 11. Employer home

### `GET /employer/dashboard` — authenticated employer (also usable by admin)

Returns the employer's own snapshot: today's collected cash, transaction count, completed/active
sessions, unread notifications, machine counts, active sessions, machine list with active-session
summaries, recent payments, business settings and `serverTime`.

## 12. Expenses (ADMIN)

| Method | Path | Description |
|---|---|---|
| GET | `/expenses?category=&from=&to=&search=&page=&pageSize=` | List + totals by category |
| POST | `/expenses` | Record expense |
| PATCH | `/expenses/:id` | Update |
| DELETE | `/expenses/:id` | Soft delete (audited) |

```json
{
  "title": "Electricity bill",
  "category": "ELECTRICITY",
  "amountSantim": 250000,
  "description": "November",
  "expenseDate": "2026-11-23T12:00:00.000Z",
  "receiptUrl": "https://..."
}
```

## 13. Reports (ADMIN)

All report endpoints accept:

`from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day|week|month|year&machineId=&employerId=&packageId=&status=`

| Method | Path | Returns |
|---|---|---|
| GET | `/reports/revenue` | Totals, refunds, series by period |
| GET | `/reports/machines` | Revenue/sessions/average duration per machine |
| GET | `/reports/employers` | Cash collected/sessions per employer |
| GET | `/reports/packages` | Revenue/sessions per package |
| GET | `/reports/sessions` | Session totals, status breakdown, series, up to 200 items |
| GET | `/reports/expenses` | Totals, series, by category, items |
| GET | `/reports/profit-loss` | Revenue − expenses, margin, series, expense breakdown |
| GET | `/reports/export?type=&format=csv\|xlsx\|pdf` | Downloadable file |

Revenue definition: sum of payments with status `PAID` whose `paidAt` is inside the range, in the
business timezone. Voided/refunded transactions are excluded and reported separately.

Export `type`: `revenue`, `machines`, `employers`, `packages`, `sessions`, `expenses`, `profit-loss`.

The same report endpoints are also mounted under `/admin/reports/...` for contract compatibility
(for example `GET /admin/reports/revenue`).

## 14. Settings (ADMIN)

- `GET /settings` → business profile + operational settings.
- `PATCH /settings` → partial update:

```json
{
  "businessName": "GameZone Gaming Center",
  "businessPhone": "+251...",
  "businessAddress": "...",
  "timezone": "Africa/Addis_Ababa",
  "allowExtension": true,
  "allowPause": false,
  "allowManualEnd": false,
  "requireEndReason": false,
  "expiryWarningMinutes": 5,
  "lowCashThresholdSantim": null
}
```

Business name/timezone changes are audited with previous and new values.

## 15. Notifications

| Method | Path | Description |
|---|---|---|
| GET | `/notifications?unreadOnly=&page=&pageSize=` | Own notifications (admin audience for admins) + unread count |
| POST | `/notifications/:id/read` | Mark one read (ownership enforced) |
| POST | `/notifications/read-all` | Mark all read |

## 16. Audit logs (ADMIN)

`GET /admin/audit-logs?userId=&action=&entityType=&from=&to=&search=&page=&pageSize=`

Returns `data` with actor, action, entity, before/after JSON, IP, user agent, plus a list of distinct
actions for filter menus.

## 17. Health

`GET /health` (no prefix) → `{ "status": "ok", "uptime": 123, "timestamp": "..." }` or `503` when the
database is unreachable.

## 18. Socket.IO

Connect to `/socket.io` with `auth: { token: accessToken }` (or a bearer header). Unauthenticated
handshakes are rejected. Events are emitted to the business room, admin room or user room.

| Event | Payload (summary) |
|---|---|
| `session:started` | session DTO |
| `session:updated` | session DTO (pause/resume/extension) |
| `session:ended` | session DTO |
| `session:expired` | session DTO |
| `session:warning` | `{ sessionId, threshold, remainingSeconds }` |
| `payment:created` | payment DTO |
| `payment:updated` | payment DTO (void/refund) |
| `machine:status` | `{ machineId, status, machine? }` |
| `machine:updated` | machine DTO |
| `employer:activity` | `{ employerId, fullName, action, at }` |
| `notification:new` | notification DTO |

Treat event payloads as invalidations; fetch REST data before displaying authoritative financial values.

## 19. PowerShell examples

```powershell
$login = Invoke-RestMethod -Method Post `
  -Uri "http://localhost:4000/api/v1/auth/login" `
  -ContentType "application/json" `
  -Headers @{ "x-client-type" = "mobile" } `
  -Body '{"username":"admin","password":"Admin@12345"}'

$headers = @{ Authorization = "Bearer $($login.data.accessToken)" }
Invoke-RestMethod -Uri "http://localhost:4000/api/v1/admin/dashboard" -Headers $headers
Invoke-RestMethod -Uri "http://localhost:4000/api/v1/machines" -Headers $headers
```
