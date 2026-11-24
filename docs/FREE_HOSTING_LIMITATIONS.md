# Free Hosting Limitations

**Verified:** 23 November 2026. Free plans change without notice. Re-check the official pages before
relying on them for money-handling operations.

## 1. Render Free (backend)

Source: <https://render.com/docs/free>, <https://render.com/pricing>

| Limit | Reality |
|---|---|
| Compute | Free instance, 512 MB RAM, 0.1 CPU |
| Sleep | Spins down after **15 minutes without inbound traffic** (HTTP or WebSocket messages) |
| Cold start | About **1 minute** to wake on the next request/connection |
| Hours | **750 free instance hours per workspace per calendar month**; exhausted hours suspend free services until next month |
| Restarts | Render may restart a free service at any time |
| Filesystem | Ephemeral; local files are lost on restart/redeploy/sleep |
| Background workers / cron jobs | **Paid compute only** |
| Shell / one-off jobs | **Not available on free** |
| WebSockets | Supported, but the connection drops when the service sleeps |
| Bandwidth | 5 GB included on the Hobby workspace; overage may suspend services if no payment method |
| Production status | Render's own documentation says **“Do not use them for production applications.”** |

### Consequences for this application

- Real-time Socket.IO updates stop while the backend sleeps. The Admin Web and mobile app fall back to
  REST polling; reconnection is automatic.
- Session expiry cannot be exact while the process is asleep. It is reconciled:
  1. on API boot,
  2. by the in-process scheduler while awake,
  3. before API requests after a cold start (see `sessionReconcile` middleware).
- If nobody touches the API, an expired session may remain `ACTIVE` in the database until the next
  request wakes the service. The next QR scan/payment/dashboard request reconciles it *before* reading
  state, so a machine cannot be rented twice and the customer is not charged twice.
- For strict real-time expiry and no cold starts, a paid always-on instance is required. This is a
  genuine limitation, not a configuration mistake.

### Optional mitigation (not guaranteed)

A free uptime monitor (for example cron-job.org) can request `https://<render-service>/health` every
5–10 minutes to keep the service awake. This consumes the 750 free hours (a full month is ≈744 hours)
and may still be interrupted by Render restarts. Do not treat it as an SLA. Do not configure it until
you accept those terms.

## 2. Supabase Free (PostgreSQL)

Source: <https://supabase.com/pricing>, <https://supabase.com/docs/guides/platform/free-project-pausing>

| Limit | Reality |
|---|---|
| Database size | 500 MB per active project |
| Compute | Shared CPU, 500 MB RAM |
| Active projects | 2 per organization |
| Pausing | Free projects pause after **7 days of low activity** (a few queries per day usually prevent it) |
| Restore window | Up to 1 year after pausing |
| Egress | 5 GB |
| Backups | **No automatic backups** on Free |
| PITR | Not included |
| Commercial use | Free plan is available for production use, subject to limits |

### Consequences

- The database is adequate for the expected data volume (text records, sessions and payments) but
  **must be backed up manually** (see `DATABASE_DEPLOYMENT.md`). There are no platform backups.
- A paused project makes the API unavailable until it is resumed from the Supabase dashboard.
- Keep normal daily usage to avoid pausing; the deployed application traffic normally does this.
- If the project pauses, Render health checks fail until it is resumed.

## 3. Vercel Hobby (admin web) — compliance blocker

Source: <https://vercel.com/legal/terms> (Updated 19 Oct 2026), section 4:

> “You shall only use the Services under a Hobby plan for your personal or non-commercial use.”

This Game Rental admin dashboard is a **commercial business system**. Vercel Hobby is therefore **not a
compliant production host** for it, even though the technical free limits are generous.

Vercel Hobby limits (technical, for reference): 100 GB fast data transfer, 1M function invocations,
4 active CPU hours, 360 GB-hours provisioned memory per month.

### Recommended genuinely free commercial alternative

**Cloudflare Pages Free** is the best fit for this static Vite build:

- Unlimited static requests and bandwidth, 500 builds/month, 20,000 files, 25 MiB per file.
- Cloudflare's self-serve terms do not carry a non-commercial restriction; the main prohibition is
  collecting card data on free services (this app only displays cash data, no online payments).
- Cloudflare's plans page markets the general Free plan “for personal or hobby projects that aren't
  business-critical”, so it is still a best-effort free service, not an SLA.

**Netlify Free** also explicitly permits commercial projects (300 credits/month in the 2026 credit
model; a production deploy costs 15 credits, so roughly 20 production deploys/month). It is a valid
fallback.

The repository includes:
- `admin-web/vercel.json` for Vercel (only use if you are eligible under its terms, e.g. a Pro plan),
- `admin-web/public/_redirects` for Cloudflare Pages/Netlify SPA routing.

## 4. GitHub Free

- Unlimited public/private repositories, unlimited collaborators.
- GitHub Actions minutes are finite for private repos. No workflow is required for this deployment.

## 5. What is *not* guaranteed on free hosting

1. Exact session expiry while the backend sleeps.
2. Continuous Socket.IO connections.
3. Zero cold-start latency (about one minute on Render Free).
4. Database backups (Supabase Free has none).
5. Any uptime or data-durability SLA.
6. Vercel Hobby for commercial use.

## 6. Recommendation

| Need | Free recommendation | Honest limitation |
|---|---|---|
| API | Render Free | sleeps, ~1 min wake, not production-grade |
| Database | Supabase Free | 500 MB, pauses after a week of inactivity, no backups |
| Admin static site | Cloudflare Pages Free (recommended) or Netlify Free | Vercel Hobby is non-commercial |
| Git | GitHub Free | — |
| Timer reliability | Request-triggered reconciliation + boot scheduler; optional uptime ping | not exact during sleep |
| Real-money production | Move API to a small always-on paid instance and enable Supabase backups | paid |

All data is persisted in Supabase; sleeping Render instances never lose payments or sessions. The only
degradation is delayed expiry/realtime updates while no traffic reaches the API.
