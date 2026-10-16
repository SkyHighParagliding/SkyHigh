---
name: Deployment & Operations — Accounts, Credentials, Infrastructure
description: Admin accounts, credentials, billing, DNS, and infrastructure management for all SkyHigh platforms
type: wiki
---

# Deployment & Operations — Accounts, Credentials, Infrastructure

**⚠️ ACCOUNT OWNERSHIP NOTE (as of 2026-05-14):**
All production accounts (GitHub, Railway, Cloudflare R2) are now registered under the club's **web@skyhighparagliding.org.au** email address. This ensures institutional ownership and smooth handoff if development staff change. See [[07-credential-recovery]] for the master credential list and recovery procedures.

**Credential Storage:**
- **Primary:** Club password manager (accessible via web@skyhighparagliding.org.au)
- **Backup:** Encrypted file in Google Drive (SkyHigh Committee folder)
- **Do not commit credentials to git** — .env is gitignored

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
3. In Cloudflare → skyhighparagliding.org.au → DNS → Records, add the CNAME + TXT (DNS only). See Domain Management below.
4. Wait 1–24 hours for propagation
5. Railway auto-provisions SSL

### Monitoring
- Railway dashboard shows service health, recent deployments, logs
- Real-time logs streaming via Railway CLI or dashboard
- Database admin available via Railway PostgreSQL service UI

---

---

## Account Setup Status (Phase 0 — ✅ COMPLETE)

All production accounts are under club ownership. See [[02-tasks]] Phase 0 for full details.

| Account | Status | Email | Notes |
|---------|--------|-------|-------|
| GitHub Organization | ✅ DONE | web@skyhighparagliding.org.au | SkyHighParagliding org, repo transferred |
| Railway Project | ✅ DONE | web@skyhighparagliding.org.au | Live at skyhigh-production.up.railway.app |
| Cloudflare R2 | ✅ DONE | web@skyhighparagliding.org.au | Bucket: skyhigh-media |
| Gemini API Key | ✅ DONE | web@skyhighparagliding.org.au (Workspace) | Key in .env + password manager |
| Resend | ✅ EXISTING | [Club account] | No new setup needed |
| TidyHQ | ✅ EXISTING | [Club account] | No new setup needed |
| Google Workspace | ✅ EXISTING | web@skyhighparagliding.org.au | All Google services |
| Cloudflare DNS | ✅ DONE 2026-10-16 | web@skyhighparagliding.org.au | DNS for skyhighparagliding.org.au (replaced Google Cloud DNS) |

---

## Google Workspace — Club Account (All Google Services)

**Account Email:** web@skyhighparagliding.org.au  
**Account Type:** Business Standard (annual subscription, billed to club)  
**Used for:** Workspace management, DNS, Cloud services, Gemini API, Drive, Gmail

#### Google Workspace Admin Console
- **URL:** https://admin.google.com/
- **Purpose:** Manage club's web domain, users, groups, and security
- **Billing:** 1× Google Workspace User (admin) + domain = **$8.40/mth**
- **Billed to:** Club account
- **Access:** web@skyhighparagliding.org.au (password in club password manager)

### Google Cloud Console
- **URL:** https://console.cloud.google.com/
- **Account:** web@skyhighparagliding.org.au (via Workspace)
- **Purpose:** DNS service, Cloud Functions (SAFA connector), Gemini API setup
- **Billing:** Integrated with Workspace account
- **Access:** Password stored in club password manager

### Obtaining Gemini API Key (Task ACCT-004)

**Requirement:** Google Workspace Business Standard account (✅ already established)

**Step-by-step procedure:**
1. Go to **https://aistudio.google.com/**
2. Sign in with **web@skyhighparagliding.org.au** (use club password manager for password)
3. Click **"Get API Key"** in the left sidebar
4. Click **"Create API Key"**
5. Select project: **SkyHigh** (or create if doesn't exist)
6. Copy the API key that appears
7. **Paste into `.env` file:** `GEMINI_API_KEY=<key-here>`
8. **Store in password manager** under tag `gemini-api-key`
9. **Document in wiki/07-credential-recovery.md** with creation date

**Important:** This key is free-tier and should be restricted to SkyHigh app only. If exposed, regenerate immediately.

---

#### Google Cloud Projects

**Skyhigh DNS Service Project**
- Service: Cloud DNS
- Purpose: Manage domain DNS records for www.skyhighparagliding.org.au
- Accessed via: https://console.cloud.google.com/

**SAFA Connector Project** (existing)
- Service: Cloud Functions + Cloud Scheduler
- Purpose: Fetch SAFA aerotow winch data
- Schedule: Every 24 hours via Cloud Scheduler

---

## Google Drive — Shared Documents

**Account:** web@skyhighparagliding.org.au  
**Folder:** Google Drive → SkyHigh Committee folder

### Contains
- Standard Operating Procedures (SOPs)
- Committee Minutes & Decisions
- Encrypted Credential Backup File
- Finance records
- Other committee documents

### Access Control
- Managed via Google Workspace "committee" group
- Members added/removed via Workspace admin console
- Revision history automatically tracked

---

## Domain Management

**Domain:** skyhighparagliding.org.au (bare domain and `www` both serve the site over HTTPS)  
**Registrar:** **Vodien** (manage.vodien.com; registry shows "Web Address Registration Pty Ltd", the Dreamscape Networks registrar behind Vodien and Crazy Domains). Expires 8 Jan 2028, auto-renew on.  
**DNS Provider:** **Cloudflare** (account web@skyhighparagliding.org.au, Free plan) since 2026-10-16. Nameservers `abdullah.ns.cloudflare.com`, `dana.ns.cloudflare.com`.

### Why Cloudflare (2026-10-16)
The bare domain used the Google Workspace "naked domain redirect" (A records `216.239.32/34/36/38.21`), which is HTTP-only, so `https://skyhighparagliding.org.au` failed. Google Cloud DNS cannot point a bare domain at Railway (no CNAME flattening). Cloudflare flattens `@` → Railway.

### Records (all DNS only, grey cloud: Railway terminates TLS)
| Name | Type | Value |
|---|---|---|
| `@` | CNAME (flattened) | `ec6h5vtz.up.railway.app` |
| `www` | CNAME | `33bp9c73.up.railway.app` |
| `_railway-verify` / `_railway-verify.www` | TXT | Railway ownership tokens |
| `@` | MX | `1 aspmx.l.google.com`, `5 alt1.aspmx.l.google.com`, `5 alt2.aspmx.l.google.com` |
| `@` | TXT | `v=spf1 include:_spf.google.com ~all` (Gmail SPF, added 2026-10-16) |
| `_dmarc` | TXT | `v=DMARC1; p=none;` |
| `send` | MX / TXT | Resend: `10 feedback-smtp.ap-northeast-1.amazonses.com`; `v=spf1 include:amazonses.com ~all` |
| `resend._domainkey` | TXT | Resend DKIM key |
| `google._domainkey` | TXT | Gmail DKIM key (2048-bit, added 2026-10-16; authentication ON in Workspace) |

### Notes
- Do **not** turn on Cloudflare proxy (orange cloud) for the Railway CNAMEs without also setting SSL/TLS to Full (strict).
- Vodien's own "DNS Settings" tab holds stale records (`103.11.189.189`); they are unused while nameservers point at Cloudflare. Ignore them.
- Plain-language handover for non-developers: `docs/dns-handover.md`.
- Old Google Cloud DNS zone `skyhigh-zone` (project "Skyhigh DNS Service", `glass-indexer-201105`) kept as rollback until ~2026-10-23, then delete. Rollback = set Vodien nameservers back to `ns-cloud-a1..a4.googledomains.com`.

### Adding a Railway custom domain
1. Railway → SkyHigh service → Settings → Networking → **Custom Domain** (port 8080).
2. Add the CNAME + `_railway-verify` TXT it shows in Cloudflare → DNS → Records (DNS only).
3. Railway shows a green tick and issues the certificate within minutes.

---

## Billing Summary

| Service | Cost | Billed To | Status |
|---------|------|-----------|--------|
| Google Workspace (Business Standard) | $8.40/mth | Club account | Covers Workspace, Drive, Cloud |
| Google Cloud (DNS, SAFA, Gemini API) | ~$1–2/mth | Club account | DNS + optional Cloud Functions |
| Railway (hosting + PostgreSQL) | $5–50/mth | [TBD] | Scales with traffic; includes managed DB |
| Cloudflare R2 (image storage) | $0.015/GB + $0.015/GB reads | Club account | [TBD post-setup] |
| Resend (email) | Free/paid tier | Club account | ✅ Already subscribed |
| TidyHQ | [Existing club subscription] | Club | ✅ Already active |

---

## Account Security & Credential Management

**Credential Storage:** See [[07-credential-recovery]] for the complete master list and recovery procedures.

**Key Rules:**
- All passwords stored in club password manager (web@ Google Workspace) — never in code or plaintext
- Encrypted backup copy in Google Drive (SkyHigh Committee folder)
- **Never commit credentials to git** — `.env` is always in `.gitignore`
- Rotate API keys and passwords every 6–12 months (see rotation schedule in [[07-credential-recovery]])
- Keep Google Workspace two-factor authentication enabled for web@ account
- Audit group memberships and active sessions quarterly
- For emergency access procedures, see [[07-credential-recovery]]

---

## Phase 0 — Account Setup Checklist (✅ COMPLETE)

- [x] **TASK-ACCT-001:** GitHub organization created + SkyHigh repo transferred
- [x] **TASK-ACCT-002:** Railway project created + linked to club GitHub org
- [x] **TASK-ACCT-003:** Cloudflare R2 account created + bucket + API tokens generated
- [x] **TASK-ACCT-004:** Gemini API key obtained from Google Workspace + stored in `.env`

## Phase 4–6 — Deployment Checklist

- [ ] **Phase 4:** PostgreSQL configured, R2 bucket active, CSRF ready
- [ ] **Phase 5:** Railway `.up.railway.app` URL tested + domain verification started
- [ ] **Phase 6:** Custom domain DNS switched to Railway + SSL active
- [ ] [ ] www.skyhighparagliding.org.au resolves to Railway (verified at whatsmydns.net)
- [ ] [ ] Admin login works on production domain
- [ ] [ ] Wind map loads and animates
- [ ] [ ] Database migrations completed (check Railway logs)
- [ ] [ ] Password reset email works (via Resend)
- [ ] [ ] TidyHQ webhook updated to new domain + tested
- [ ] [ ] Image uploads via R2 work
- [ ] [ ] Update wiki/06-deployment.md with Railway service URLs
- [ ] [ ] Document domain registrar identity (Google) in wiki

---

Last updated: 2026-05-14 (Phase 0 Account Setup added, all accounts moved to club ownership)
