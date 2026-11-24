# Deployment Guide

This guide covers local development, a Docker Compose deployment, a manual Linux VPS deployment,
Android release builds, backups and day-two operations.

---

## 1. Prerequisites

| Component | Version |
|---|---|
| Node.js | 20 LTS or newer (tested with 24) |
| npm | 10+ |
| PostgreSQL | 15+ (tested with 18) |
| Flutter | 3.32+ (tested with 3.47) |
| Android SDK | API 37 for the notification plugin, JDK 21 |
| Docker | 24+ (optional) |

---

## 2. Environment files

### Backend `backend/.env`

Copy `backend/.env.example` and fill:

```ini
NODE_ENV=production
PORT=4000
DATABASE_URL="postgresql://gamezone:password@db-host:5432/game_rental?schema=public"
DIRECT_URL="postgresql://gamezone:password@db-host:5432/game_rental?schema=public"

JWT_ACCESS_SECRET="<48 random bytes hex>"
JWT_REFRESH_SECRET="<48 random bytes hex>"
ACCESS_TOKEN_TTL_MINUTES=30
REFRESH_TOKEN_TTL_DAYS=30
REFRESH_REUSE_GRACE_SECONDS=60

QR_HMAC_SECRET="<48 random bytes hex>"
CORS_ORIGINS="https://admin.example.com"
BUSINESS_NAME="GameZone Gaming Center"
BUSINESS_TIMEZONE="Africa/Addis_Ababa"
BUSINESS_CURRENCY="ETB"

SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD="<strong unique password>"
SEED_ADMIN_FULL_NAME="Owner"
SEED_ADMIN_PHONE="+251..."
SEED_SAMPLE_DATA=false
SESSION_EXPIRY_INTERVAL_MS=5000
```

Generate secrets:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> **Important:** keep `QR_HMAC_SECRET` stable. Changing it invalidates every printed QR code.

### Admin web `admin-web/.env.production` (optional)

The default build uses same-origin `/api/v1` and `/socket.io`, which is the recommended setup behind
Nginx. To point at a separate API host:

```ini
VITE_API_URL=https://api.example.com/api/v1
VITE_SOCKET_URL=https://api.example.com
```

If you do this, add the admin origin to `CORS_ORIGINS`.

### Mobile

The API URL is a compile-time value:

```
--dart-define=API_BASE_URL=https://api.example.com/api/v1
```

The default is `http://10.0.2.2:4000/api/v1` (Android emulator → host).

---

## 3. Local development (Windows PowerShell)

```powershell
# 1. Database
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE game_rental;"

# 2. Backend
cd backend
Copy-Item .env.example .env   # then edit secrets
npm install
npx prisma migrate deploy
npm run seed
npm run dev

# 3. Admin (second terminal)
cd admin-web
npm install
npm run dev
# http://localhost:5173

# 4. Mobile (third terminal)
cd employer-mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000/api/v1
```

---

## 4. Docker Compose deployment

```powershell
Copy-Item .env.example .env
Copy-Item backend\.env.example backend\.env
# edit both files with production secrets and DATABASE connection settings

docker compose build
docker compose up -d
docker compose logs -f backend
```

What runs:

- `db` — PostgreSQL 16 with a named volume.
- `backend` — multi-stage build; runs `prisma migrate deploy` automatically on start, then the API.
- `admin` — Nginx serving the built dashboard and proxying `/api`, `/socket.io` and `/health` to the
  backend.

The dashboard is available at `http://server:8080` by default (`ADMIN_PORT`). Put it behind HTTPS using
`deploy/nginx/gamezone.conf` or a cloud load balancer.

Create the first administrator and business configuration (idempotent; safe to rerun):

```bash
docker compose exec backend npm run seed
```

The seed uses `SEED_ADMIN_*` from `backend/.env`. `SEED_SAMPLE_DATA=true` also creates demo categories,
packages, machines and an employer; set it to `false` for a clean production start.

Upgrade:

```powershell
docker compose build backend admin
docker compose up -d
```

The scheduler runs inside the single backend container. Do not scale the backend to multiple replicas
unless you accept multiple schedulers (they are idempotent, but unnecessary).

---

## 5. Manual Linux VPS deployment

Tested layout: Ubuntu 22.04/24.04, Nginx, PostgreSQL, Node 22, PM2.

### 5.1 System packages

```bash
sudo apt update
sudo apt install -y curl git nginx postgresql postgresql-contrib
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 5.2 Database

```bash
sudo -u postgres psql -c "CREATE USER gamezone WITH PASSWORD 'strong-password';"
sudo -u postgres psql -c "CREATE DATABASE game_rental OWNER gamezone;"
```

### 5.3 Application

```bash
sudo mkdir -p /var/www/game-rental && sudo chown $USER /var/www/game-rental
cd /var/www/game-rental
git clone <repository> .
cp backend/.env.example backend/.env
nano backend/.env     # production secrets, NODE_ENV=production
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run seed
npm run build
pm2 start dist/server.js --name gamezone-api
pm2 save
sudo pm2 startup systemd -u $USER --hp /home/$USER
```

PM2 keeps the API alive and restarts it after crashes; the scheduler reconciles expired sessions on
boot.

### 5.4 Admin dashboard

```bash
cd /var/www/game-rental/admin-web
npm ci
npm run build
sudo mkdir -p /var/www/game-rental/web
sudo cp -r dist/* /var/www/game-rental/web/
```

### 5.5 Nginx and HTTPS

Copy `deploy/nginx/gamezone.conf` to `/etc/nginx/sites-available/gamezone.conf`, replace the domain and
certificate paths, and set the proxy target to `127.0.0.1:8080` (Docker) or the static root and API
upstream (manual). A manual example:

```nginx
server {
    listen 443 ssl http2;
    server_name admin.example.com;
    ssl_certificate /etc/letsencrypt/live/admin.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.example.com/privkey.pem;

    root /var/www/game-rental/web;
    index index.html;

    location /api/  { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host;
                      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                      proxy_set_header X-Forwarded-Proto $scheme; }
    location /socket.io/ { proxy_pass http://127.0.0.1:4000;
                      proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade;
                      proxy_set_header Connection "upgrade"; proxy_read_timeout 3600s; }
    location /health { proxy_pass http://127.0.0.1:4000/health; }
    location / { try_files $uri $uri/ /index.html; }
}
```

Issue certificates:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d admin.example.com
```

Set `CORS_ORIGINS=https://admin.example.com` and `NODE_ENV=production` (enables secure cookies).

### 5.6 Firewall

Only expose SSH, HTTP and HTTPS. PostgreSQL and the API port stay private:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## 6. Database migrations

Production:

```bash
cd backend
npx prisma migrate deploy
```

- Never use `migrate dev` in production.
- Migrations are forward-only; back up before every deploy.
- The Docker image runs `migrate deploy` automatically on startup.
- Migrations include the partial unique index and check constraints; do not remove them.

---

## 7. Seeding and initial credentials

`npm run seed` is idempotent:

- creates the business, settings, and the admin from `SEED_ADMIN_*` if absent;
- creates sample categories/packages/machines and a demo employer when `SEED_SAMPLE_DATA=true`;
- does not overwrite an existing admin password.

After the first login:

1. Change the admin password (`Profile → Change password`).
2. Create real employer accounts and suspend/delete the demo employer.
3. Configure real categories, packages and machines; print their QR codes.
4. Set `SEED_SAMPLE_DATA=false` and keep `SEED_ADMIN_PASSWORD` out of shell history.

---

## 8. Android release build

### 8.1 Create a keystore (once)

```powershell
keytool -genkeypair -v -keystore gamezone-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias gamezone
```

Store the keystore and passwords securely. Losing them prevents future Play Store updates.

Create `employer-mobile/android/key.properties` (gitignored):

```properties
storePassword=...
keyPassword=...
keyAlias=gamezone
storeFile=C:/secure/path/gamezone-release.jks
```

`android/app/build.gradle.kts` automatically uses this signing config for release builds; without it,
release builds fall back to debug signing for local testing only.

### 8.2 Configure the production API URL

Ensure the URL uses HTTPS. Update `network_security_config.xml` if you intentionally use cleartext for a
custom dev host.

### 8.3 Build

Use the release script (requires HTTPS and an existing `key.properties`):

```powershell
cd employer-mobile
.\tool\build_release.ps1 -ApiBaseUrl "https://api.your-domain.com/api/v1"
```

Or manually:

```powershell
cd employer-mobile
flutter clean
flutter pub get

flutter build apk --release --dart-define=API_BASE_URL=https://api.your-domain.com/api/v1
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.your-domain.com/api/v1
```

Outputs:

- `build/app/outputs/flutter-apk/app-release.apk`
- `build/app/outputs/bundle/release/app-release.aab`

Verify the APK installs and signs in against production before distributing. Keep the previous APK/AAB
for rollback; never publish debug-signed builds.

---

## 9. Backups

### Backup

```bash
pg_dump -U gamezone -Fc -d game_rental -f /backups/game_rental_$(date +%F).dump
```

Schedule via cron (02:00 daily):

```cron
0 2 * * * pg_dump -U gamezone -Fc -d game_rental -f /backups/game_rental_$(date +\%F).dump
```

Copy backups off the server and encrypt them. Retain at least 30 daily and 12 weekly copies.

### Restore

```bash
createdb -U gamezone game_rental_restore
pg_restore -U gamezone -d game_rental_restore --clean --if-exists /backups/game_rental_2026-11-23.dump
```

Test restores regularly. Back up secrets (JWT and QR) together with the database in a secure vault.

---

## 10. Logs and monitoring

- API logs are structured JSON on stdout. With PM2: `pm2 logs gamezone-api`; with Docker:
  `docker compose logs -f backend`.
- Nginx access/error logs: `/var/log/nginx/`.
- Health endpoint: `GET /health` returns 200 when the database is reachable.
- Recommended checks: HTTP health, disk space, PostgreSQL connections, container restarts, failed login
  rate, and daily revenue anomalies.
- Audit logs inside the admin app cover business-level review.

---

## 11. Updating the system

1. Back up the database.
2. Pull the new code / build new images.
3. Run `npx prisma migrate deploy` (Docker does this automatically).
4. Rebuild and restart the API, then deploy the admin build.
5. Run `flutter build` with the same signing keys for the mobile app.
6. Verify login, QR scan, one test session and the dashboard.
7. Monitor logs and `/health` for 15 minutes.

The AppSecret/JWT values should not be changed during a routine upgrade.

---

## 12. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Mobile cannot reach API | Wrong `API_BASE_URL`; emulator must use `10.0.2.2`; firewall; cleartext host missing in network security config |
| Admin login works but data calls 401 | Cookie blocked by cross-site setup; use same-origin proxy or set `CORS_ORIGINS` and HTTPS; check `NODE_ENV=production` secure cookie |
| Sessions not expiring | Scheduler not running (process crashed); check logs, `/health`, restart API; overdue sessions reconcile on boot |
| QR not recognized | Regenerated code (old printout); wrong `QR_HMAC_SECRET`; machine deleted |
| “Machine not available” after payment | Another employer won the race; payment is voided; refund customer and choose another machine |
| Notification permission denied | Android 13+ requires notification permission; enable in app settings |
| Build fails on notification plugin | Ensure `compileSdk = 37`, core library desugaring enabled, JDK 17/21 |
| Prisma cannot connect | `DATABASE_URL` wrong or DB not reachable; check `pg_hba.conf` and firewall |

---

## 13. Final acceptance checklist

- [ ] Admin can sign in to the dashboard over HTTPS.
- [ ] Admin can register unlimited machines and download/print PNG/PDF QR codes.
- [ ] Admin can create/edit/activate packages with any duration and price in ETB.
- [ ] Admin can create, suspend and reactivate employers and reset passwords.
- [ ] Employer signs in on Android; session restores after app restart.
- [ ] Employer scans a valid QR and sees the correct machine and packages.
- [ ] Invalid, revoked, inactive and maintained QR/machines show clear errors.
- [ ] Employer collects cash, confirms the exact server price and starts a session.
- [ ] Duplicate payment/start requests never create duplicates.
- [ ] Countdown matches the server and survives app restart/offline periods.
- [ ] Sessions expire automatically and machines become available without the app.
- [ ] Manual end, pause/resume and extension obey admin settings and are recorded separately.
- [ ] Admin sees live machine/session updates and can inspect any active session.
- [ ] Payments, voids, refunds and expenses appear in reports with correct totals and profit.
- [ ] CSV, Excel and PDF exports open correctly.
- [ ] Employers receive `403` on every admin endpoint and on other employers' records.
- [ ] Audit logs capture logins, price changes, refunds, voids and session overrides.
- [ ] Nightly backups run and a restore has been tested.
- [ ] Release APK/AAB is signed with the production keystore and points to the production API.
