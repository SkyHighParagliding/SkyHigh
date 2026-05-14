---
name: Credential Recovery & Account Management
description: Master list of all production accounts, passwords, API keys, and emergency recovery procedures
type: wiki
---

# Credential Recovery & Account Management

**⚠️ SECURE:** This file is a reference guide. Actual passwords and API keys are stored in:
1. **Primary:** Club password manager (web@ Google Workspace account)
2. **Backup:** Encrypted file in Google Drive (SkyHigh Committee folder)

**Last Updated:** 2026-05-14  
**Next Review:** 2026-08-14 (quarterly)

---

## Account Ownership & Access

All accounts listed below are registered to the club and owned by the club's web@ Google Workspace account.

| Account | Email | Owner | Access Method | Backup Contact |
|---------|-------|-------|---|---|
| GitHub Organization | web@skyhighparagliding.org.au | Club | OAuth via web@ Google | [TBD] |
| Railway Project | web@skyhighparagliding.org.au | Club | OAuth via club GitHub org | [TBD] |
| Cloudflare R2 | web@skyhighparagliding.org.au | Club | Password manager | [TBD] |
| Google Workspace (Gemini API) | web@skyhighparagliding.org.au | Club | Workspace Business Standard | [TBD] |
| Google Cloud (DNS, Cloud Functions) | web@skyhighparagliding.org.au | Club | Workspace admin | [TBD] |
| Resend (Email) | [Club account TBD] | Club | Password manager | [TBD] |
| TidyHQ (Member Sync) | [Existing club account] | Club | Password manager | [TBD] |

---

## GitHub Organization Setup

**Created:** [DATE]  
**Organization Name:** `skyhigh-club` or `skyhighparagliding`  
**URL:** https://github.com/skyhigh-club  
**Admin Email:** web@skyhighparagliding.org.au

### Access Procedure
1. Go to https://github.com/skyhigh-club
2. Sign in with web@skyhighparagliding.org.au (use password manager)
3. Click Settings → Members → invite additional maintainers as needed

### Repository Configuration
- **Repository:** `SkyHigh` (transferred from personal account)
- **Default Branch:** `main`
- **Branch Protection:** Enabled on `main` (require PR review before merge)
- **Deployment Key:** [TBD — used by Railway]

### Recovery Procedure (If Access Lost)
1. Use Google Workspace admin account to reset web@ password
2. Log in to GitHub with new password
3. Verify SSH/OAuth keys in Settings → Developer Settings

---

## Railway Project Setup

**Created:** [DATE]  
**Project Name:** `skyhigh`  
**URL:** https://railway.app/project/[PROJECT-ID]  
**Account Email:** web@skyhighparagliding.org.au

### Services
- **Web Service:** Express 4 + React 19 (auto-deploys on main push)
- **Database:** PostgreSQL (managed by Railway, DATABASE_URL auto-injected)

### Access Procedure
1. Go to https://railway.app/
2. Sign in with OAuth (club GitHub organization)
3. Select "skyhigh" project
4. View services, logs, and environment variables

### Environment Variables Stored in Railway
All variables defined in `.env` file, plus:
- `NODE_ENV=production`
- `APP_URL=https://www.skyhighparagliding.org.au` (after DNS live)
- `ALLOW_PLAINTEXT_PASSWORDS=false`
- `DEV_ALLOW_LOCALHOST_URLS=false`
- `DATABASE_URL` (auto-injected by Railway PostgreSQL service)

### Recovery Procedure (If Service Down)
1. Log in to Railway (via club GitHub)
2. Check service logs for errors
3. Verify DATABASE_URL env var still exists
4. If needed, trigger manual redeploy: Railway → web service → Deployments → Redeploy latest

---

## Cloudflare R2 Bucket Setup

**Created:** [DATE]  
**Account Email:** web@skyhighparagliding.org.au  
**Bucket Name:** `skyhigh`  
**Region:** [TBD]  
**Public URL:** `https://r2.skyhighparagliding.org.au`

### API Tokens
- **Token Name:** `railway-skyhigh` (limited to R2 read/write only)
- **Scopes:** R2 object read/write (NOT account admin)
- **Stored:** Password manager + Railway environment variables

### Access Procedure
1. Go to https://dash.cloudflare.com/
2. Sign in with web@skyhighparagliding.org.au (use password manager)
3. Navigate to R2 → skyhigh bucket
4. View/upload objects

### Recovery Procedure (If API Token Lost)
1. Log in to Cloudflare with web@ account
2. Navigate to Account Settings → API Tokens
3. Delete the compromised token
4. Create a new token with same scopes
5. Update Railway environment variables with new token
6. Trigger redeploy

---

## Google Workspace & Cloud Services

**Account Email:** web@skyhighparagliding.org.au  
**Workspace Type:** Business Standard (club account)  
**Access:** https://workspace.google.com/ and https://console.cloud.google.com/

### Gemini API Key
- **Source:** Google AI Studio (requires Workspace Business Standard auth)
- **Created:** [DATE]
- **Stored:** `.env` file (development) + Railway environment variables (production)
- **Location in Password Manager:** [TBD]

### Google Cloud Projects
1. **Skyhigh DNS Service**
   - Service: Cloud DNS
   - Purpose: Manage www.skyhighparagliding.org.au DNS records
   - CNAME record points to: Railway CNAME target (after Phase 5)

2. **SAFA Connector** (existing)
   - Service: Cloud Functions + Cloud Scheduler
   - Purpose: Fetch SAFA aerotow winch data

### Recovery Procedure (If Workspace Access Lost)
1. Contact Google Workspace support with recovery email
2. Verify ownership via backup email address
3. Reset password and re-enable two-factor authentication
4. Audit active sessions and revoke any suspicious access

---

## Resend (Email Service)

**Account Email:** [Club email TBD]  
**Status:** ✅ Existing club account (no new setup needed)  
**Used For:** Transactional emails (password resets, notifications)

### Domain Verification
- **Domain:** skyhighparagliding.org.au
- **Status:** [Pending verification in Phase 5]
- **DNS Records Required:** [TBD — Resend provides these]

### Access Procedure
1. Log in to Resend dashboard (password manager)
2. Navigate to Domains → verify status
3. If needed, add missing DNS records in Google Cloud DNS

### Recovery Procedure (If Domain Verification Lost)
1. Log in to Resend
2. Delete unverified domain
3. Re-add domain and follow verification steps
4. Update Railway `RESEND_FROM_DOMAIN` variable once verified

---

## TidyHQ Integration

**Status:** ✅ Existing club account (no new setup needed)  
**Used For:** Member roster sync, webhook processing

### API Credentials
- **Club ID:** `skyhigh`
- **Access Token:** In `.env` (stored securely)
- **Client ID & Secret:** In `.env` (stored securely)
- **Webhook Signing Key:** In `.env` (stored securely)

### Webhook Configuration
- **Endpoint:** `https://www.skyhighparagliding.org.au/api/tidyhq/webhook` (after DNS live)
- **Status:** [TBD — verify post-deployment]

### Recovery Procedure (If Webhook Fails)
1. Log in to TidyHQ admin panel
2. Navigate to Integrations → webhooks
3. Check last delivery status and error messages
4. If needed, generate new API credentials in TidyHQ
5. Update `.env` and redeploy

---

## Credential Rotation Schedule

| Account | Rotation Frequency | Last Rotated | Next Rotation |
|---------|---|---|---|
| GitHub tokens | Annually | [DATE] | [DATE + 1 year] |
| Railway access | Annually | [DATE] | [DATE + 1 year] |
| Cloudflare R2 tokens | Every 6 months | [DATE] | [DATE + 6 months] |
| TidyHQ API key | Annually | [DATE] | [DATE + 1 year] |
| Resend domain | On-demand | [DATE] | [Ongoing] |
| Google Workspace password | Annually | [DATE] | [DATE + 1 year] |

---

## Emergency Access Procedures

### If Primary Admin Account (web@) is Compromised
1. **Immediately:** Revoke all active sessions from Google Workspace admin console
2. **Reset password:** Use recovery email to reset web@ password
3. **Audit access:** Check GitHub, Railway, Cloudflare for unauthorized activity
4. **Rotate secrets:** Generate new API tokens for all services
5. **Update environment variables:** Redeploy app with new credentials
6. **Notify committee:** Document the incident and any data affected

### If web@ Email Account is Lost
1. **Verify ownership:** Use backup email address registered with Google
2. **Contact Google Support:** Report account compromise/loss
3. **Restore access:** Use recovery codes (stored separately, not in password manager)
4. **Create backup admin:** Add another committee member as secondary Workspace admin
5. **Audit all services:** Check for unauthorized access to GitHub, Railway, Cloudflare

### If Railway Service is Down
1. Check Railway dashboard for deployment errors
2. Review recent changes in GitHub (last 3 commits)
3. Check logs for database/API connectivity issues
4. If unresolvable: rollback to previous commit or database snapshot (if available)
5. Escalate to technical team

---

## Password Manager Setup

**System:** Club password manager (web@ Google Workspace)  
**Access:** [TBD — document the exact process here]

### Items to Store (with tags)
- `github-org-skyhigh` — Organization admin credentials
- `railway-skyhigh` — Project access + API keys
- `cloudflare-r2` — Account + R2 API tokens
- `resend-api-key` — Email service API key
- `tidyhq-api-creds` — TidyHQ integration tokens
- `google-workspace-web` — web@ account password

---

## Backup Location (Google Drive)

**Path:** Google Drive → SkyHigh Committee folder → `[ENCRYPTED-FILE-NAME]`  
**Format:** Encrypted text file (password-protected, separate key in password manager)  
**Contains:** Backup copy of all credentials listed above  
**Last Updated:** [DATE]  
**Update Frequency:** After each account rotation or new service added

**How to Access:**
1. Go to Google Drive → SkyHigh Committee
2. Find encrypted credentials file
3. Download and open with password from password manager
4. Use credentials to access account

---

## Audit Trail

| Date | Change | Made By | Details |
|------|--------|---------|---------|
| 2026-05-14 | Created | Claude Code | Phase 0 account setup template created |
| [DATE] | GitHub org created | [Name] | Organization `skyhigh-club` established |
| [DATE] | Railway project created | [Name] | Project linked to GitHub org |
| [DATE] | R2 bucket created | [Name] | Bucket + API token generated |
| [DATE] | [Other changes] | | |

---

## Questions & Contacts

**If you can't access an account:**
1. Check password manager for credentials
2. Verify backup file in Google Drive
3. Use account recovery procedures listed above
4. Contact [committee member name] for assistance

**To add a new account or service:**
1. Document in this file under the appropriate section
2. Add entry to the Audit Trail
3. Update password manager + Google Drive backup
4. Notify committee about new access procedures

---

Last reviewed: 2026-05-14  
Next review due: 2026-08-14 (quarterly)
