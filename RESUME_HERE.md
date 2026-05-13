# Resume Here — SkyHigh Production Deployment Planning

**Session Date:** 2026-05-13  
**Branch:** main  
**Working Tree Status:** Clean — all wiki updates committed ✅

---

## Where We Left Off

**DECISION MADE:** Migrating from Replit to **Railway** (existing account) for production deployment.

**WHY:** Railway is a one-stop shop: hosts Node.js backend + PostgreSQL + static frontend, with GitHub auto-deploy. No Firebase needed (Express serves the React frontend directly).

**STATUS:** Planning complete. Plan saved to `C:\Users\User\.claude\plans\groovy-watching-hanrahan.md`. Wiki updated. Ready for execution.

---

## What Was Just Completed (2026-05-13)

### Wiki Updates
- ✅ `wiki/06-deployment.md`: Added Railway deployment section (full setup with env var mappings)
- ✅ `wiki/07-deployment-guide.md`: Clarified Firebase is historical reference only (old Google Sites)
- ✅ `wiki/01-architecture.md`: Changed production host from Replit to Railway
- ✅ `memory/project.md`: Updated hosting decision
- ✅ Removed all Replit references from architecture
- ✅ Committed all changes: `46456bc`

### Deployment Plan Created
- **Location:** `C:\Users\User\.claude\plans\groovy-watching-hanrahan.md`
- **Phases:** 6 phases (Railway setup → Resend domain verification → custom domain → DNS switch → go-live → cleanup)
- **Credentials Status:** Most present in `.env`. Missing: `RESEND_FROM_DOMAIN`, `APP_URL`, `TIDYHQ_CLUB_ID`

---

## Next Steps to Execute (When You Return)

### A) Answer 3 Quick Questions (Required Before Execution)
1. **TIDYHQ_CLUB_ID** — What's your TidyHQ org slug? (visible in URL: `skyhigh.tidyhq.com`)
2. **Production Admin Password** — Secure password to replace `"admin"` in `.env`
3. **Domain Registrar** — Who registered `skyhighparagliding.org.au`? (GoDaddy, etc.)

### B) Then Execute the 6-Phase Plan

| Phase | What | Owner |
|-------|------|-------|
| **1** | Railway project setup + GitHub repo + PostgreSQL | User/Railway |
| **2** | Copy env vars to Railway dashboard | User |
| **3** | Test on temporary `.up.railway.app` URL | User |
| **4** | Resend domain verification (adds DNS TXT records) | User |
| **5** | Custom domain setup + DNS switch in Google Cloud DNS | User |
| **6** | Go-live testing + post-cleanup (TidyHQ webhook, old domain removal) | User |

---

## Credentials Summary

### ✅ Present in .env (Ready to Copy to Railway)
- Gemini API key
- TidyHQ (token, client ID, secret, webhook key)
- Resend API key
- Cloudflare R2 (all 5 values)
- Weather Underground key
- Session secret
- GitHub token
- Default admin accounts

### ❌ Still Missing (Will Set During Deployment)
- `RESEND_FROM_DOMAIN` → set to `skyhighparagliding.org.au` (after Resend verifies domain)
- `APP_URL` → set to `https://www.skyhighparagliding.org.au` (after DNS is live)
- `TIDYHQ_CLUB_ID` → find in TidyHQ URL
- `DATABASE_URL` → Railway auto-injects from PostgreSQL service

---

## Key Files Modified
- `wiki/06-deployment.md` — Railway deployment (add this to your password-protected storage after go-live)
- `wiki/07-deployment-guide.md` — Firebase marked as historical
- `wiki/01-architecture.md` — Production host: Railway
- Plan file: `C:\Users\User\.claude\plans\groovy-watching-hanrahan.md`

---

## When You Return

Type: **`resume`**

I will:
1. Read this file and the plan file
2. Ask the 3 missing questions (if you haven't answered them yet)
3. Guide you through the 6-phase execution
4. Help troubleshoot any issues during deployment

---

**Current Git Status:** All wiki changes committed to main ✅
