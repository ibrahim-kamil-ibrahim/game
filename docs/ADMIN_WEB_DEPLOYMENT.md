# Admin Web Deployment

The Admin Web is a static React/Vite SPA. It can be hosted on any static host; it only needs the API URL
and a SPA fallback. **No backend secrets belong in this build.**

## ⚠ Hosting compliance first

**Vercel Hobby is not compliant for this commercial admin dashboard.** Vercel's Terms of Service
(§4, updated 19 Oct 2026) restrict Hobby to “personal or non-commercial use”. This is a business
management system.

Choose one:

| Option | Free? | Commercial? | Recommendation |
|---|---|---|---|
| **Cloudflare Pages Free** | Yes | No non-commercial limit in Cloudflare's self-serve terms | **Recommended** |
| **Netlify Free** | Yes (300 credits/month) | Explicitly allows commercial projects | Valid fallback |
| Vercel Hobby | Yes | **No** for this use | Do not use for production |
| Vercel Pro | Paid (~$20/user/month) | Yes | Only if you accept paid hosting |

The repo contains both `admin-web/vercel.json` and `admin-web/public/_redirects` so either host works.

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
VITE_API_URL=https://<render-service>.onrender.com/api/v1
VITE_SOCKET_URL=https://<render-service>.onrender.com
```

`VITE_API_URL` must include `/api/v1`. Never add server secrets (`JWT_*`, database URLs, QR secret) to
this project; Vite exposes `VITE_*` values to the browser.

## 2. Recommended: Cloudflare Pages (free, commercial-friendly)

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

## 3. Netlify Free (fallback)

1. <https://app.netlify.com> → Add new site → Import from Git.
2. Base directory `admin-web`, build `npm run build`, publish `dist`.
3. Add the same `VITE_API_URL` / `VITE_SOCKET_URL` environment variables.
4. `_redirects` handles SPA routing.
5. Add the Netlify site origin to Render CORS.

Netlify Free explicitly allows commercial projects, but the 2026 credit model gives 300 credits/month
(a production deploy consumes 15 credits). Monitor usage.

## 4. Vercel (only if you are eligible under its terms)

1. <https://vercel.com/new> → import the GitHub repository.
2. Root directory `admin-web`.
3. Framework Vite; build `npm run build`; output `dist`.
4. Environment variables:
   - `VITE_API_URL=https://<render-service>.onrender.com/api/v1`
   - `VITE_SOCKET_URL=https://<render-service>.onrender.com`
5. Deploy. `admin-web/vercel.json` supplies SPA rewrites and basic headers.
6. Add the production Vercel origin to Render `CORS_ORIGINS`.

If you are on a paid Vercel plan and want cookie reliability without third-party cookies, use a
same-origin API proxy (next section).

## 5. Cookie behaviour (important)

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
    "destination": "https://<render-service>.onrender.com/api/:path*"
  }
  ```
- Build with `VITE_API_URL=/api/v1`.
- Keep `VITE_SOCKET_URL=https://<render-service>.onrender.com` because WebSocket proxying is not
  supported by the static rewrite.
- Set Render `COOKIE_SAME_SITE=lax`.
- CORS only needs the static origin for the Socket.IO handshake.

Do not hardcode the Render URL in React source; it belongs in the deployment configuration only.

## 6. Verify after deployment

Use the real URL assigned by the host (never invent one):

1. Open the admin URL over HTTPS.
2. Sign in with the seeded admin account; confirm the dashboard loads real data.
3. Create a machine and download/print its QR (PNG and PDF).
4. Create a package with a duration and price.
5. Create an employer with auto-generated credentials and copy them.
6. Open the employer detail and verify username/temporary password/copy controls.
7. Start a rental from Live Monitor on behalf of an employer.
8. Pause/resume/end it; verify the session and payment appear in reports/transactions.
9. Open Live Monitor in two tabs and verify Socket.IO updates while the API is awake; then rely on the
   10–30 second polling fallback.
10. Reload the page with an expired access token and confirm the refresh cookie works (or discover the
    third-party-cookie limitation and switch to proxy mode).
11. Confirm a hard refresh on a nested route (`/machines/<id>`) serves the app, not a 404.
12. Confirm browser console has no CORS/401 loop.

## 7. CORS and origin rules

Render `CORS_ORIGINS` must list the exact admin origin. Examples (replace with your real origin):

```text
CORS_ORIGINS=https://<admin-project>.pages.dev
```

- No wildcard.
- No trailing slash.
- Add preview domains only if you intentionally use them.
- Restart/redeploy Render after changing CORS.

## 8. Operating notes

- The static build contains no database credentials and no JWT secrets.
- A new deploy invalidates nothing on the backend; users keep their sessions unless the cookie domain or
  API host changes.
- Pin a production domain before giving admins the link; preview URLs change.
- Keep the previous deployment for rollback (Cloudflare/Netlify/Vercel support instant rollback).
