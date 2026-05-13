---
name: Deployment & Operations — Accounts, Credentials, Infrastructure
description: Admin accounts, credentials, billing, DNS, and infrastructure management for all SkyHigh platforms
type: wiki
---

# Deployment & Operations — Accounts, Credentials, Infrastructure

**⚠️ SECURE:** This file contains credentials and account details. Keep in password-protected storage after site deployment completion. Do not commit to git.

---

## Railway Deployment — Production SkyHigh (2026-05-13 onward)

**Platform:** Railway (already used by the club for another project)  
**Services:** Node.js/Express web service + managed PostgreSQL  
**Domain:** www.skyhighparagliding.org.au  
**Frontend:** React 19 (served from Express via `/public/` bundle)  
**Status:** Primary deployment platform

### Railway Project Details
- **URL:** https://railway.app/ (existing account)
- **Project name:** `skyhigh`
- **Repo:** Connected to GitHub SkyHigh repo, branch `main`
- **Services:** 
  - Web service (Node.js): Runs Express backend + serves React frontend
  - PostgreSQL: Managed database, auto-injected as `DATABASE_URL`

### Environment Variables (Set in Railway Dashboard)

Copy all values from project `.env` file to Railway web service Variables tab:

| Variable | Value | Source |
|---|---|---|
| `GEMINI_API_KEY` | See .env | Google AI Studio |
| `TIDYHQ_ACCESS_TOKEN` | See .env | TidyHQ |
| `TIDYHQ_CLIENT_ID` | See .env | TidyHQ |
| `TIDYHQ_CLIENT_SECRET` | See .env | TidyHQ |
| `TIDYHQ_WEBHOOK_SIGNING_KEY` | See .env | TidyHQ |
| `TIDYHQ_CLUB_ID` | [TBD] | TidyHQ org URL |
| `RESEND_API_KEY` | See .env | Resend |
| `RESEND_FROM_DOMAIN` | `skyhighparagliding.org.au` | After Resend verification |
| `R2_ACCOUNT_ID` | See .env | Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | See .env | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | See .env | Cloudflare R2 |
| `R2_BUCKET_NAME` | `skyhigh` | Cloudflare R2 |
| `R2_PUBLIC_URL` | See .env | Cloudflare R2 |
| `SESSION_SECRET` | See .env | (generated, do not change) |
| `WU_API_KEY` | See .env | Weather Underground |
| `NODE_ENV` | `production` | — |
| `APP_URL` | `https://www.skyhighparagliding.org.au` | After DNS live |
| `ALLOW_PLAINTEXT_PASSWORDS` | `false` | — |
| `DEV_ALLOW_LOCALHOST_URLS` | `false` | — |
| `DEFAULT_ADMINS` | `[{"name":"Admin","email":"admin@skyhigh.org.au","password":"<SECURE>"}]` | Update password |

### Deployment Workflow
1. Push to `main` branch
2. Railway auto-deploys (builds `npm run build`, starts `node dist/server.js`)
3. Logs visible in Railway dashboard

### Custom Domain Setup
1. Railway → web service → Settings → Domains → Add `www.skyhighparagliding.org.au`
2. Railway provides CNAME target
3. In Google Cloud Console → Skyhigh DNS Service → Cloud DNS → add CNAME record
4. Wait 1–24 hours for propagation
5. Railway auto-provisions SSL

### Monitoring
- Railway dashboard shows service health, recent deployments, logs
- Real-time logs streaming via Railway CLI or dashboard
- Database admin available via Railway PostgreSQL service UI

---

## Google Account Admin (All Platforms)

**Used for:** Workspace management, admin console access, group management  
**Account:** web@skyhighparagliding.org.au  
**Password:** MtBroughton

### Google Workspace Console
- **URL:** https://admin.google.com/u/2/?pli=1&rapt
- **Purpose:** Manage club's web domain and website users
- **Billing:** 1× Google Workspace User (admin) + domain = **$8.40/mth**
- **Billed to:** John Weatherley's Credit Card (claims back from club periodically)
- **Access:** Username/password above

### Google Cloud Console
- **URL:** https://console.cloud.google.com/welcome?pli=1&project=glass-indexer-201105&authuser=2
- **Username:** web@skyhighparagliding.org.au
- **Password:** MtBroughton
- **Purpose:** DNS service, SAFA connector integration
- **Billing:** **$0.87/mth** (separate from Workspace)
- **Billed to:** Andrew Hall's Credit Card

#### Google Cloud Projects

**Skyhigh DNS Service Project**
- Service: Cloud DNS
- Purpose: Manage domain DNS records for www.skyhighparagliding.org.au

**SAFA Connector Project**
- Service: Cloud Functions + Cloud Scheduler
- Purpose: Fetch SAFA aerotow winch data
- Schedule: Every 24 hours via Cloud Scheduler

---

## Google Workspace — Committee Management

**Console:** https://admin.google.com/u/2/?pli=1&rapt

### Update Committee Members
1. Log in with web@skyhighparagliding.org.au / MtBroughton
2. Navigate to **Groups** → **committee**
3. Add/remove members as needed
4. Controls access to:
   - Google Drive (shared documents)
   - Google Sites (if applicable)
   - Other Google Workspace resources

---

## Google Drive — Shared Documents

**Account:** web@skyhighparagliding.org.au  
**URL:** https://drive.google.com/drive/website/SkyHigh%20Admin%20Website/SkyHigh%20Committee/

### Folder Structure
- **SkyHigh Committee** (main folder, access controlled via Workspace group)
  - Standard Operating Procedures (SOPs)
  - Committee Minutes
  - Correspondence
  - Finance records
  - Other committee documents

### Access Control
- Membership in the "committee" Google Group (managed in Workspace console, above) controls folder access
- Any file changes are automatically tracked via Google Drive revision history

---

## Old Site Infrastructure (Google Sites)

**Status:** Backup/Archive (post-migration)  
**Console URL:** https://sites.google.com/u/2/new?pli=1&authuser=2

### Before Migration
- Hosted the club's website
- Custom domain: www.skyhighparagliding.org.au
- Editable via Google Sites editor

### After Migration to Firebase
- **Remains accessible via:** https://sites.google.com/view/skyhighparagliding
- **No longer serves www.skyhighparagliding.org.au** (DNS points to Firebase)
- **Why keep:** Serves as historical backup; site data preserved in Google account
- **Access:** Via private Google Sites URL only
- **Deletion:** Do NOT delete unless explicitly decided by committee; data is preserved as long as the account exists

---

## New Site Infrastructure — Railway (Not Firebase)

**Status:** Active (production since 2026-05-13)

Firebase is **NOT used** for the new SkyHigh application. The React frontend is served directly from the Express backend running on Railway. See **Railway Deployment** section (above) for the current setup.

Firebase documentation has been removed as it is no longer relevant to the new SkyHigh deployment.

---

## Domain Management

**Domain:** www.skyhighparagliding.org.au  
**Registrar:** [TBD — to be confirmed]  
**DNS Provider:** Google Cloud DNS (via Google Cloud Console)

### Current Setup (Pre-Migration)
- Custom domain points to Google Sites
- Managed via Google Workspace

### Post-Migration Setup
- Custom domain points to Firebase (via A records)
- DNS managed in Google Cloud Console
- Google Sites remains accessible via private URL

### DNS Update Procedure
1. Log in to Google Cloud Console (see credentials above)
2. Select "Skyhigh DNS Service" project
3. Navigate to **Network Services** → **Cloud DNS**
4. Update A records to Firebase's provided IP addresses
5. Wait 1–24 hours for global propagation
6. Verify migration complete

---

## Billing Summary

| Service | Cost | Billed To | Notes |
|---------|------|-----------|-------|
| Google Workspace (1 user + domain) | $8.40/mth | John Weatherley (claims back) | Admin access, group management |
| Google Cloud (DNS, SAFA) | $0.87/mth | Andrew Hall | DNS service, Cloud Functions |
| Firebase Hosting | [TBD] | [TBD] | Post-migration (to be confirmed) |

---

## Account Security Notes

- All passwords are shared via secure, password-protected document distribution
- **Do not commit credentials to git** — this file is gitignored in production
- Rotate credentials periodically (especially if staff turnover)
- Keep Google Workspace two-factor authentication enabled for web@ account
- Audit Google Workspace group membership quarterly

---

## Post-Migration Checklist

- [ ] Verify Firebase project created and deployed
- [ ] DNS records updated in Google Cloud Console
- [ ] www.skyhighparagliding.org.au resolves to Firebase (not Google Sites)
- [ ] SSL certificate provisioned and active (HTTPS working)
- [ ] Old Google Sites site still accessible via sites.google.com/view/skyhighparagliding
- [ ] Remove custom domain binding from Google Sites (to prevent conflicts)
- [ ] Test all key pages on new Firebase site
- [ ] Update any internal documentation pointing to old site

---

Last updated: 2026-05-13 (Railway deployment plan added, Firebase removed for new app)
