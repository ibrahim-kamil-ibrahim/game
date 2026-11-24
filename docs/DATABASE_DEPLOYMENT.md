# Supabase PostgreSQL Deployment

This project uses Prisma with two connection URLs:

- `DATABASE_URL` — pooled connection used by the running API.
- `DIRECT_URL` — direct/session connection used **only** by Prisma migrations.

Supabase Free provides a dedicated PostgreSQL database with 500 MB storage. It pauses after roughly a
week of low activity and has **no automatic backups**; see `FREE_HOSTING_LIMITATIONS.md`.

## 1. Create the project

1. Sign in at <https://supabase.com/dashboard> (account creation is a manual step).
2. Create an organization and a project named, for example, `game-rental-production`.
3. Choose the region closest to the Render service and your users (for Ethiopia, an EU region such as
   Frankfurt is usually the lowest-latency Supabase choice). Keep Render and Supabase in nearby regions.
4. Generate a strong database password and store it in a password manager. Never commit it or paste it in
   chat. Supabase shows it only during creation; reset it from **Project Settings → Database** if lost.
5. Wait for the database to finish provisioning.

## 2. Retrieve connection strings

Open **Project Settings → Database → Connection string**. Use the dashboard's exact hostnames; the
placeholders below are examples only.

### Runtime pooler (`DATABASE_URL`)

Transaction mode, port `6543`:

```text
postgresql://postgres.<PROJECT_REF>:<URL_ENCODED_PASSWORD>@aws-0-<REGION>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require
```

### Migration/direct URL (`DIRECT_URL`)

Use the **Direct connection** string (port `5432`) when it is reachable:

```text
postgresql://postgres:<URL_ENCODED_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require
```

If the direct host is IPv6-only and your migration environment has no IPv6, use the **Session pooler**
on port `5432` from the same dashboard panel:

```text
postgresql://postgres.<PROJECT_REF>:<URL_ENCODED_PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require
```

Notes:

- URL-encode special characters in the password (`@` → `%40`, `#` → `%23`, etc.).
- `connection_limit=1` is intentional for the free shared database and a single Render API instance.
- Never place these URLs in the frontend or the mobile app.
- The Prisma schema already declares:
  ```prisma
  datasource db {
    provider  = "postgresql"
    url       = env("DATABASE_URL")
    directUrl = env("DIRECT_URL")
  }
  ```

## 3. Run migrations

### Option A — Render first deploy (recommended)

The production start script runs migrations automatically:

```text
npm run start:deploy
  -> prisma migrate deploy
  -> optional seed (RUN_DB_SEED=true)
  -> node dist/server.js
```

Enter `DATABASE_URL` and `DIRECT_URL` in Render's environment before the first deploy. This avoids
copying the production password to a local machine.

### Option B — From your machine

Create `backend/.env` with the Supabase URLs (the file is gitignored), then:

```powershell
cd backend
npx prisma generate
npx prisma migrate deploy
```

`prisma migrate deploy` applies pending migrations only. **Never** run `prisma migrate reset` or
`prisma db push` against production.

Migration history (3 migrations):

1. `20261123112459_init`
2. `20261123112532_session_guard` — partial unique active-session index + check constraints
3. `20261123170400_employer_initial_credentials` — encrypted temporary-password columns

## 4. Bootstrap the administrator

The seed is idempotent; it creates the business/settings/admin only when missing.

Set these in Render (or local `.env` for a one-time local seed):

```text
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=<strong unique password from your password manager>
SEED_ADMIN_FULL_NAME=<owner name>
SEED_SAMPLE_DATA=false
```

First Render boot:

```text
RUN_DB_SEED=true
```

After verifying the administrator can log in, set `RUN_DB_SEED=false` and redeploy. The seed does not
overwrite an existing admin password.

For a local one-time seed against Supabase:

```powershell
cd backend
npm run seed
```

Never enable `SEED_SAMPLE_DATA` in production; it creates demo machines/packages.

## 5. Verify the database

Run in Supabase **SQL Editor**:

```sql
-- expected 17 application tables
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;

-- active-session invariant
select indexname, indexdef
from pg_indexes
where tablename = 'GameSession'
  and indexname = 'GameSession_one_active_per_machine';

-- migration state (should list all 3 migrations)
select migration_name, finished_at
from _prisma_migrations
order by started_at;

-- seeded configuration
select
  (select count(*) from "User") as users,
  (select count(*) from "GameMachine") as machines,
  (select count(*) from "GamePackage") as packages,
  (select count(*) from "EquipmentCategory") as categories;
```

Foreign keys:

```sql
select conname, conrelid::regclass as table_name
from pg_constraint
where contype = 'f' and connamespace = 'public'::regnamespace
order by 2, 1;
```

From the backend environment:

```powershell
npx prisma migrate status
```

Expected: database schema is up to date.

## 6. Connection-pooling guidance

- Runtime uses the transaction pooler on port 6543 with `pgbouncer=true`.
- Use the direct/session connection for migrations; migration advisory locks and DDL should not run
  through transaction pooling.
- Keep a single Render instance; it already uses a Prisma singleton.
- Do not add Prisma Accelerate or Supabase client keys unless separately justified.
- If you see `prepared statement ... already exists`, confirm `pgbouncer=true` is present and the URL is
  the pooler URL.

## 7. Free-tier operations

- **Pausing:** Free projects pause after ~7 days of low database activity. Normal business traffic
  prevents this. Resume from the Supabase dashboard if paused.
- **Size:** 500 MB is sufficient for this schema, but monitor **Database → Usage**.
- **Backups:** none on Free. Take manual backups (below) and store them off Supabase.
- **Restores:** documented below; test one on a non-production project.

## 8. Manual backup and restore

Use the direct/session URL (not the transaction pooler) for `pg_dump`/`pg_restore`.

```powershell
# Backup (password prompt is normal; do not echo the URL)
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" `
  -h db.<PROJECT_REF>.supabase.co -p 5432 -U postgres -d postgres `
  -Fc -f "game-rental-$(Get-Date -Format yyyyMMdd-HHmm).dump"
```

If direct IPv6 is unavailable, use the session-pooler host on port 5432.

Restore:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -h <host> -U postgres game_rental_restore
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -h <host> -U postgres `
  -d game_rental_restore --clean --if-exists "game-rental-YYYYMMDD-HHMM.dump"
```

Recommended policy:

- daily backup retained off-site for 30 days;
- weekly retained 12 weeks;
- monthly restore test;
- store `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` and **`QR_HMAC_SECRET`** in a secrets manager with the
  backup. Losing the QR secret prevents reprinting existing QR codes; losing JWT secrets invalidates all
  sessions.

## 9. Troubleshooting

| Symptom | Cause / action |
|---|---|
| `Can't reach database server` / timeout | project paused, wrong region/host, or IPv6-only direct host; use session pooler |
| `prepared statement already exists` | runtime URL is not the transaction pooler or missing `pgbouncer=true` |
| `too many connections` | remove extra instances, keep `connection_limit=1` |
| Auth works but no tables | `prisma migrate deploy` was not run or pointed at another database |
| 500 MB limit reached | archive/export old data; upgrade plan or prune safely with approval |
| Project paused | resume in Supabase dashboard; Render health recovers |

Do not delete or reset the production database to “fix” a connection error.
