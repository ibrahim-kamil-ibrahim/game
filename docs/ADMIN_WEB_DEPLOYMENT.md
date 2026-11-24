# Admin Web Deployment

The Admin Web is a static React/Vite SPA. It can be hosted on any static host; it only needs the API URL
and a SPA fallback. **No backend secrets belong in this build.**

## 0. Deployed state (24 November 2026)

| Item | Value |
|---|---|
| Host | **Render Static Site (Free)** |
| Public URL | **https://game-rental-admin.onrender.com** |
| Render service ID | `srv-dc2hlqbrjlhs73cp5ktg` |
| Root directory | `admin-web` |
| Build command | `npm ci && npm run build` |
| Publish path | `dist` |
| `VITE_API_URL` | `https://game-rental-api-znao.onrender.com/api/v1` |
| `VITE_SOCKET_URL` | `https://game-rental-api-znao.onrender.com` |
| Status | **Live.** Real browser sign-in, dashboard data, refresh cookie, and session-after-reload verified |

Why Render Static Sites: Netlify's GitHub OAuth returned `email_collision` for the account email, and
Vercel Hobby is not permitted for this commercial system. Render's static hosting is free, commercial-use
compatible, and lives in the same dashboard as the API, so the CORS origin and the API URL are managed
together.

**SPA fallback:** Render static sites do **not** read Netlify's `_redirects`. A Render rewrite rule is
configured on the service:

```text
Type: Rewrite    Source: /*    Destination: /index.html
```

Without it, deep links such as `/machines/<id>` return 404. `render.yaml` now declares the same route.

## ⚠ Hosting compliance first

**Vercel Hobby is not compliant for this commercial admin dashboard.** Vercel's Terms of Service
(§4, updated 19 Oct 2026) restrict Hobby to “personal or non-commercial use”. This is a business
management system.

Choose one:

| Option | Free? | Commercial? | Recommendation |
|---|---|---|---|
| **Render Static Sites** | Yes (100 GB bandwidth/month) | Yes | **Used for this deployment** |
| **Cloudflare Pages Free** | Yes | No non-commercial limit in Cloudflare's self-serve terms | Valid alternative |
| **Netlify Free** | Yes (300 credits/month) | Explicitly allows commercial projects | Valid fallback |
| Vercel Hobby | Yes | **No** for this use | Do not use for production |
| Vercel Pro | Paid (~$20/user/month) | Yes | Only if you accept paid hosting |

The repo contains `admin-web/vercel.json` and `admin-web/public/_redirects` so any of these hosts can
serve the SPA. Render static sites apply the SPA rewrite from the dashboard's rewrite rules; this
deployment additionally keeps `_redirects` in the build output for portability.

## 1. Build settings (all static hosts)

| Setting | Value |
|---|---|
| Root directory | `admin-web` |
| Install | `npm ci` |
| Build command | `npm run build` |
| Output | `dist` |
| Node | 20+ (project uses Vite 8; Node 22 recommended) |
| SPA fallback | serve `index.html` for unknown routes |

Environment variables:

```text
VITE_API_URL=https://game-rental-api-znao.onrender.com/api/v1
VITE_SOCKET_URL=https://game-rental-api-znao.onrender.com
```

`VITE_API_URL` must include `/api/v1`. Never add server secrets (`JWT_*`, database URLs, QR secret) to
this project; Vite exposes `VITE_*` values to the browser.

## 2. Deployed: Render Static Site

1. Render Dashboard → **New → Static Site** → connect `ibrahim-kamil-ibrahim/game`.
2. Branch `main`; root directory `admin-web`.
3. Build command `npm ci && npm run build`; publish path `dist`.
4. Environment:
   - `VITE_API_URL=https://game-rental-api-znao.onrender.com/api/v1`
   - `VITE_SOCKET_URL=https://game-rental-api-znao.onrender.com`
5. Deploy, then add the assigned origin (`https://game-rental-admin.onrender.com`) to the API's
   `CORS_ORIGINS` and keep `COOKIE_SAME_SITE=none`.

Any push to `main` rebuilds the site automatically. Because `VITE_*` values are compiled into the
bundle, changing the API URL requires a redeploy, not just an env edit.

## 3. Alternative: Cloudflare Pages (free, commercial-friendly)

1. Sign in at <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Connect to Git**.
2. Select the GitHub repository.
3. Configure:
   - Framework preset: Vite
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `admin-web`
4. Add the two `VITE_*` environment variables for Production (and Preview if desired).
5. Deploy.
6. DNS: use the assigned `*.pages.dev` URL first; add a custom domain later if available.
7. `admin-web/public/_redirects` is copied into `dist` and provides the SPA fallback:
   ```
   /*    /index.html   200
   ```

Add the final Pages origin to Render's `CORS_ORIGINS` (exact origin, no trailing slash) and allow a few
minutes/redeploy for CORS changes.

Cloudflare Free limits: 500 builds/month, 20,000 files, 25 MiB per file, unlimited static requests and
bandwidth. It is still a free best-effort service with no SLA.

## 4. Netlify Free (fallback)

1. <https://app.netlify.com> → Add new site → Import from Git.
2. Base directory `admin-web`, build `npm run build`, publish `dist`.
3. Add the same `VITE_API_URL` / `VITE_SOCKET_URL` environment variables.
4. `_redirects` handles SPA routing.
5. Add the Netlify site origin to Render CORS.

Netlify Free explicitly allows commercial projects, but the 2026 credit model gives 300 credits/month
(a production deploy consumes 15 credits). Monitor usage.

## 5. Vercel (only if you are eligible under its terms)

1. <https://vercel.com/new> → import the GitHub repository.
2. Root directory `admin-web`.
3. Framework Vite; build `npm run build`; output `dist`.
4. Environment variables:
   - `VITE_API_URL=https://game-rental-api-znao.onrender.com/api/v1`
   - `VITE_SOCKET_URL=https://game-rental-api-znao.onrender.com`
5. Deploy. `admin-web/vercel.json` supplies SPA rewrites and basic headers.
6. Add the production Vercel origin to Render `CORS_ORIGINS`.

If you are on a paid Vercel plan and want cookie reliability without third-party cookies, use a
same-origin API proxy (next section).

## 6. Cookie behaviour (important)

The API stores the refresh token in an `httpOnly`, Secure cookie. Two modes:

### A. Direct API URL (Vercel/Cloudflare → Render)

- `VITE_API_URL=https://<render>/api/v1`
- `COOKIE_SAME_SITE=none` on Render.
- CORS must include the static origin and allow credentials.
- This works while the browser allows third-party cookies. Some browsers (notably Safari/incognito)
  block them, which means the user must sign in again when the 30-minute access token expires.
- Access tokens are held in memory; no token is written to localStorage.

### B. Same-origin API proxy (most reliable cookies)

Proxy `/api` from the static host to Render so the browser sees same-origin requests and the cookie is
first-party.

- On Vercel (after the Render URL is known), add to `vercel.json` **before** the SPA rewrite:
  ```json
  {
    "source": "/api/:path*",
    "destination": "https://game-rental-api-znao.onrender.com/api/:path*"
  }
  ```
- Build with `VITE_API_URL=/api/v1`.
- Keep `VITE_SOCKET_URL=https://game-rental-api-znao.onrender.com` because WebSocket proxying is not
  supported by the static rewrite.
- Set Render `COOKIE_SAME_SITE=lax`.
- CORS only needs the static origin for the Socket.IO handshake.

Do not hardcode the Render URL in React source; it belongs in the deployment configuration only.

## 7. Verify after deployment

Verified on 24 November 2026 against the live URLs:

| Check | Result |
|---|---|
| Admin loads over HTTPS | **PASS** — `200`, built bundle embeds the production API URL |
| Administrator sign-in | **PASS** — real Edge browser via Playwright |
| Dashboard renders navigation and business data | **PASS** — `/api/v1/admin/dashboard` returned 200 |
| Refresh cookie is `HttpOnly; Secure; SameSite=None` | **PASS** — inspected in the browser cookie store |
| Session survives a full page reload | **PASS** — refresh returned 200 after reload, no re-login |
| No 4xx/5xx API responses after login | **PASS** — a single 401 on the very first refresh (no cookie yet) is expected |
| Deep link (`/machines/...`) serves the SPA | **PASS** — Render rewrite `/*` → `/index.html` |

Still to be exercised with real business data (requires an operator):

1. Create a machine and download/print its QR (PNG and PDF).
2. Create a package with a duration and price.
3. Create an employer with auto-generated credentials and copy them.
4. Start, pause/resume, extend and end a rental from Live Monitor; verify the payment and reports.
5. Confirm Live Monitor updates in two tabs while the API is awake (Socket.IO), then relies on polling.

## 8. CORS and origin rules

Render `CORS_ORIGINS` must list the exact admin origin. Examples (replace with your real origin):

```text
CORS_ORIGINS=https://game-rental-admin.onrender.com
```

- No wildcard.
- No trailing slash.
- Add preview domains only if you intentionally use them.
- Restart/redeploy Render after changing CORS.

## 9. Operating notes

- The static build contains no database credentials and no JWT secrets.
- A new deploy invalidates nothing on the backend; users keep their sessions unless the cookie domain or
  API host changes.
- Pin a production domain before giving admins the link; preview URLs change.
- Keep the previous deployment for rollback (Cloudflare/Netlify/Vercel support instant rollback).
