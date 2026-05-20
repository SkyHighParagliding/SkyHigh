---
name: Railway → Fly.io Migration Plan
description: Step-by-step plan to move SkyHigh from Railway to Fly.io hosting. No code changes until reviewed and approved.
type: wiki
created: 2026-05-20
status: DEFERRED — Pending future need
priority: LOW — Future migration path
---

# Railway → Fly.io Migration Plan

> **Status: DRAFT — DO NOT EXECUTE until reviewed and approved.**
> No code has been changed. This is a plan only.

---

## Why This Works Well

**Big finding:** Scheduled jobs (wind grids, siteguide, submissions, Drive sync) use `node-cron` — they run **inside the Node.js process**, not as Railway platform features. This means they will run unmodified on Fly.io. No external cron service needed.

SkyHigh's external services (R2, Gemini, Open-Meteo, TidyHQ, Resend) are all platform-agnostic.

The DB adapter (`server/db.ts`) already auto-switches between SQLite and PostgreSQL based on `DATABASE_URL`, so it works on Fly Postgres without code changes.

---

## Step 1 — Create Fly.io Account

**What:** Create a Fly.io account under club ownership.

1. Go to https://fly.io and sign up
2. Use email: **web@skyhighparagliding.org.au**
3. Choose the **Hobby plan** (3 free shared-cpu-1x VMs, 3GB storage, 160GB outbound — covers all SkyHigh needs for free)
4. No credit card required on Hobby plan
5. Store Fly.io login credentials in the club password manager

**New account entry for wiki/06-deployment.md and wiki/07-credential-recovery.md:**

| Account | Email | Owner | Notes |
|---------|-------|-------|-------|
| Fly.io | web@skyhighparagliding.org.au | Club | Hobby plan, free tier |

---

## Step 2 — Install Fly CLI Locally

**What:** Install the `flyctl` command-line tool on your dev machine.

```powershell
# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex
```

Then authenticate:
```bash
fly auth login
```

This opens a browser to sign in with web@skyhighparagliding.org.au.

---

## Step 3 — Create a Dockerfile

**What:** Fly.io needs a Dockerfile. Railway auto-detected Node.js; Fly doesn't.

Create a single file at the project root: `Dockerfile`

**File: `Dockerfile`** (new file — not yet created)

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/server/pg_migrations ./server/pg_migrations
EXPOSE 3000
CMD ["node", "dist/server.mjs"]
```

**What this does:**
- Stage 1 installs all dependencies, runs `npm run build` (vite build + esbuild)
- Stage 2 copies only the built output (`dist/`) and production `node_modules`
- Copies PG migration files so `server/db.ts` can find them at startup
- The final image is small (~200MB) — only production deps + build output
- Listens on port 3000 (Fly expects internal port 3000 by default; `server.ts` uses `process.env.PORT || 5000` → set `PORT=3000` via secrets)

**.gitignore note:** `Dockerfile` should be committed to git (it's not a secret).

---

## Step 4 — Create Fly App

**What:** Register the app on Fly.io.

```bash
cd SkyHigh
fly launch
```

During `fly launch`:
- When asked for app name: `skyhigh` (or `skyhigh-paragliding`)
- When asked for region: choose **syd** (Sydney — closest to Melbourne users)
- When it detects the Dockerfile, say **yes** to deploy now (it will fail — database isn't wired yet, that's okay)
- When asked about PostgreSQL: say **no** for now (we'll create it separately in Step 5)
- When asked about Redis/other services: **no**

After launch, note:
- App URL: `skyhigh.fly.dev` (temporary, you'll set the custom domain later)
- Run `fly status` to confirm the app exists

---

## Step 5 — Create Fly Postgres

**What:** Provision a managed PostgreSQL database on Fly.io.

```bash
fly pg create
```

During creation:
- Name: `skyhigh-pg`
- Region: **syd** (must match app region for low latency)
- Configuration: `shared-cpu-1x` (256MB RAM — fits free allowance)
- Storage: 1GB minimum (fits 3GB free allowance)

After creation, attach it to your app:

```bash
fly pg attach --app skyhigh skyhigh-pg
```

This command:
- Creates a `DATABASE_URL` secret on your app automatically
- Grants network access between the app and database
- No manual connection string needed

Verify:
```bash
fly secrets list
# Should show DATABASE_URL populated
```

---

## Step 6 — Set All Environment Variables

**What:** Copy all env vars from Railway to Fly.io secrets.

Railway's variables → Fly.io secrets. Get current values from your local `.env` file (which mirrors Railway).

```bash
fly secrets set \
  GEMINI_API_KEY="<from .env>" \
  TIDYHQ_ACCESS_TOKEN="<from .env>" \
  TIDYHQ_CLIENT_ID="<from .env>" \
  TIDYHQ_CLIENT_SECRET="<from .env>" \
  TIDYHQ_WEBHOOK_SIGNING_KEY="<from .env>" \
  TIDYHQ_CLUB_ID="skyhigh" \
  RESEND_API_KEY="<from .env>" \
  RESEND_FROM_DOMAIN="skyhighparagliding.org.au" \
  R2_ACCOUNT_ID="<from .env>" \
  R2_ACCESS_KEY_ID="<from .env>" \
  R2_SECRET_ACCESS_KEY="<from .env>" \
  R2_BUCKET_NAME="skyhigh-media" \
  R2_PUBLIC_URL="<from .env>" \
  SESSION_SECRET="<from .env>" \
  NODE_ENV="production" \
  PORT="3000" \
  APP_URL="https://www.skyhighparagliding.org.au" \
  ALLOW_PLAINTEXT_PASSWORDS="false" \
  DEV_ALLOW_LOCALHOST_URLS="false" \
  DEFAULT_ADMINS='[{"name":"Admin","email":"admin@skyhigh.org.au","password":"<SECURE>"}]'
```

**Note:** `DATABASE_URL` is already set by `fly pg attach`. Do NOT override it.

After setting secrets, verify with `fly secrets list`.

---

## Step 7 — Migrate PostgreSQL Data

**What:** Dump data from Railway PG, import to Fly PG.

### 7a — Dump from Railway

1. Get Railway PG connection string from Railway dashboard → PostgreSQL service → Connect tab
2. Run locally:

```bash
pg_dump "postgresql://user:pass@host:port/dbname" --no-owner --no-acl --clean > skyhigh_dump.sql
```

If you don't have `pg_dump` locally, install it:
- Windows: `choco install postgresql` or use the Railway CLI `railway connect` then pg_dump

Alternative using Railway CLI:
```bash
railway connect postgres
# Then in the connected shell:
pg_dump $DATABASE_URL --no-owner --no-acl --clean > skyhigh_dump.sql
```

### 7b — Import to Fly PG

```bash
fly pg connect -a skyhigh-pg < skyhigh_dump.sql
```

Alternatively, get the Fly PG connection string and use psql:
```bash
# Get connection string
fly secrets list | grep DATABASE_URL

# Import
psql "postgresql://..." < skyhigh_dump.sql
```

### 7c — Verify

```bash
# Connect and check tables
fly pg connect -a skyhigh-pg
\dt
# Should show all SkyHigh tables
SELECT count(*) FROM sites;
SELECT count(*) FROM users;
# Confirm row counts match Railway
```

---

## Step 8 — First Deploy

**What:** Deploy the app with everything wired up.

```bash
fly deploy
```

After deployment:
1. Check `fly logs` for startup output
2. Look for: `"All PostgreSQL migrations completed successfully"`
3. Look for: `"API server listening on http://0.0.0.0:3000"`
4. Open `https://skyhigh.fly.dev` in browser
5. Test: log in, load wind map, check admin panel

If deployment fails, check `fly logs` for errors. Common issues:
- Missing env vars → `fly secrets list` to verify
- Migration failures → check PG is attached
- Port issues → verify `PORT=3000` secret is set

---

## Step 9 — DNS Switch (Custom Domain)

**What:** Point www.skyhighparagliding.org.au to Fly.io instead of Railway.

### 9a — Add domain to Fly app

```bash
fly certs create www.skyhighparagliding.org.au
```

This provisions a Let's Encrypt SSL certificate. Fly handles auto-renewal.

### 9b — Get Fly.io IP addresses

```bash
fly ips list
```

The app will have IPv4 and IPv6 addresses. You'll use the IPv4 for DNS.

### 9c — Update Google Cloud DNS

1. Go to Google Cloud Console → Skyhigh DNS Service → Cloud DNS
2. Find the zone for `skyhighparagliding.org.au`
3. **Remove** the existing CNAME record pointing `www` to Railway
4. **Add** an A record: `www` → Fly.io IPv4 address (from `fly ips list`)
5. Optionally add AAAA record for IPv6

### 9d — Wait and verify

DNS propagation takes 1–24 hours. Check:
```bash
nslookup www.skyhighparagliding.org.au
# Should return Fly.io IP
```

After propagation, visit https://www.skyhighparagliding.org.au — it should load from Fly.io.

### 9e — Update TidyHQ webhook

Once custom domain is live on Fly:
1. Log in to TidyHQ admin
2. Navigate to Integrations → webhooks
3. Verify endpoint is `https://www.skyhighparagliding.org.au/api/tidyhq/webhook`
4. Send a test webhook event to confirm delivery

---

## Step 10 — GitHub Actions Auto-Deploy

**What:** Replace Railway's push-to-deploy with a GitHub Actions workflow.

Create file: `.github/workflows/deploy.yml`

```yaml
name: Deploy to Fly.io
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

### Get Fly API token

```bash
fly tokens create deploy
```

Save the token. Then add it to GitHub:

1. GitHub → SkyHighParagliding/SkyHigh → Settings → Secrets and variables → Actions
2. Add secret: `FLY_API_TOKEN` = `<token from above>`

After this, every push to `main` auto-deploys to Fly.io — same workflow as Railway.

---

## Step 11 — Verify Everything

Run through the full go-live checklist:

- [ ] App loads at https://www.skyhighparagliding.org.au
- [ ] Admin login works with existing credentials
- [ ] Wind map loads and animates (fine + coarse grids present)
- [ ] Wind map timeline smooth (D3 + Canvas rendering)
- [ ] Password reset email works (Resend)
- [ ] TidyHQ webhook receives events
- [ ] Image uploads work (R2 storage)
- [ ] Image submissions flow: upload → pending → approve
- [ ] Scheduled jobs firing (check logs after 5am Melbourne):
  - Fine grid fetch
  - Coarse grid fetch
- [ ] Site listings show current weather (Open-Meteo)
- [ ] Flight history page loads existing flight data
- [ ] `/health` endpoint returns 200
- [ ] PWA manifest loads correctly
- [ ] Google Drive document sync (if enabled)

---

## Step 12 — Decommission Railway

**Only after Step 11 passes and app has run stable on Fly for 48+ hours:**

1. Stop but do not delete the Railway project (keep as fallback for 1 week)
2. In Railway → web service → Settings → remove custom domain
3. Verify Railway is no longer receiving traffic
4. After 1 week with no issues, delete Railway project
5. Remove Railway from club password manager (or mark as decommissioned)
6. Update billing: cancel Railway subscription

---

## File Changes Summary

| File | Action | Purpose |
|------|--------|---------|
| `Dockerfile` | **NEW** | Multi-stage build for Fly.io deployment |
| `.github/workflows/deploy.yml` | **NEW** | GitHub Actions auto-deploy on push to main |
| `wiki/06-deployment.md` | EDIT | Add Fly.io infrastructure section |
| `wiki/07-credential-recovery.md` | EDIT | Add Fly.io account + credentials |
| `.gitignore` | VERIFY | Dockerfile should NOT be gitignored |

**No existing code files change.** The app runs unmodified on Fly.io.

---

## Critical "Gotchas"

1. **`node-cron` jobs run in-process.** On Railway, the server is a single process with always-on cron. On Fly.io, same thing — single VM, always-on process. No difference. If you ever scale to 2+ Fly VMs, the cron jobs would run on ALL instances (duplicate execution). SkyHigh uses single-instance, so this is fine. If scaling later, add a database lock or leader-election pattern.

2. **Port 3000.** Fly.io exposes port 3000 internally and maps it to 80/443 externally. The `PORT=3000` secret tells `server.ts` to listen on 3000. Without this, it would use `PORT || 5000` and Fly's proxy wouldn't route traffic.

3. **Database connection pooling.** The Fly PG `shared-cpu-1x` has limited connections (max ~20). SkyHigh's `pgDb.ts` should already handle connection pooling via `pg.Pool`. Verify `DB_POOL_MAX` is reasonable (default 20 is fine for single-instance).

4. **Cold starts.** Fly.io suspends idle VMs on the free plan. First request after idle has a ~1-3 second cold start. On Railway free tier you may have the same behavior. If unacceptable, upgrade to a paid plan (keeps VM warm).

5. **Data portability.** If you ever want to leave Fly.io, you can `pg_dump` from Fly PG just like anywhere else. No lock-in.

---

## Effort Estimate

| Step | Effort | Risk |
|------|--------|------|
| 1. Fly.io account | 5 min | None |
| 2. Install CLI | 5 min | None |
| 3. Dockerfile | 15 min | Low — standard Node multi-stage |
| 4. Create Fly app | 5 min | None |
| 5. Create Fly PG | 5 min | None |
| 6. Set secrets | 10 min | Medium — must match exactly |
| 7. Migrate PG data | 20 min | Medium — large dump may need tuning |
| 8. First deploy | 10 min | Low |
| 9. DNS switch | 15 min + wait | Medium — DNS propagation delay |
| 10. GitHub Actions | 10 min | Low |
| 11. Verify | 30 min | None if all checks pass |
| 12. Decommission Railway | 5 min (deferred) | Low |
| **Total active time** | **~2 hours** | |
| **Total calendar time** | **~2 days** | (includes DNS propagation + 48h stability watch) |

---

## Cost Summary

| Item | Railway (current) | Fly.io (proposed) |
|------|-------------------|-------------------|
| Compute (web server) | ~$5/mo after credit | **Free** (1 shared-cpu-1x VM) |
| PostgreSQL | ~$10/mo+ | **Free** (1 shared-cpu-1x VM, 1GB) |
| Storage | Included in PG | **Free** (within 3GB) |
| Bandwidth | Included | **Free** (160GB outbound) |
| **Monthly total** | **~$15+/mo** | **$0/mo** |

All within the Hobby plan free allowance for SkyHigh's traffic levels.

---

## Decision Required

- [ ] **Approve** this plan and begin execution
- [ ] **Modify** the plan (specify changes needed)
- [ ] **Reject** — stay on Railway
