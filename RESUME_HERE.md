# Resume Here — SkyHigh Railway Migration & Deployment

**Last Updated:** 2026-05-13 (Late Evening)  
**Branch:** main  
**Working Tree Status:** Clean ✅

---

## Where We Left Off

**STATUS:** Documentation updated — all Replit references marked/corrected. Ready to execute Railway deployment plan.

**THIS SESSION COMPLETED:**
- Identified all Replit references in CLAUDE.md (2 locations)
- Verified folder structure diagram was a template, not current reality
- Updated CLAUDE.md Section 0: `**Deployed:**` field now shows 🚧 Railway (PostgreSQL) — migration in progress
- Updated CLAUDE.md Section 0: Key Decisions reference now points to Railway, not Replit
- Rewrote Section 3 folder structure diagram to match actual project layout (src/, server/, public/, database/, etc.)
- Updated DECISION-006: Changed from "Replit hosting" to "Railway hosting (migration in progress)"
  - Added migration phases and rationale
  - Documented why we're moving from Replit to Railway
  - Status: 🚧 Migration in progress
- Committed all changes: `[WIKI] Update deployment to Railway — mark Replit migration in progress`

**3 QUESTIONS ALREADY ANSWERED (from previous session):**
1. ✅ **TIDYHQ_CLUB_ID** = `skyhigh`
2. ✅ **DEFAULT_ADMINS password** = `BIG.brass.balls`
3. ✅ **Domain Registrar** = Google (via Google Workspace)

**PLAN LOCATION:** `C:\Users\User\.claude\plans\groovy-watching-hanrahan.md`

---

## Next Steps to Execute (Next Session)

### Execute the 6-Phase Railway Deployment Plan

| Phase | What | Owner |
|-------|------|-------|
| **1** | Railway project setup + GitHub repo + PostgreSQL | User/Railway |
| **2** | Copy env vars to Railway dashboard (use values from .env + 3 answers above) | User |
| **3** | Test on temporary `.up.railway.app` URL | User |
| **4** | Resend domain verification (adds DNS TXT records via Google Cloud DNS) | User |
| **5** | Custom domain setup + DNS switch in Google Cloud DNS | User |
| **6** | Go-live testing + post-cleanup (TidyHQ webhook, old domain removal) | User |

**Credentials to use in Phase 2:**
- All values from `.env` 
- `TIDYHQ_CLUB_ID=skyhigh`
- `DEFAULT_ADMINS` password: `BIG.brass.balls`
- `NODE_ENV=production`
- `ALLOW_PLAINTEXT_PASSWORDS=false`
- `DEV_ALLOW_LOCALHOST_URLS=false`
- `RESEND_FROM_DOMAIN=skyhighparagliding.org.au` (after Phase 4)
- `APP_URL=https://www.skyhighparagliding.org.au` (after Phase 5)

---

## Key Files for Reference
- `wiki/06-deployment.md` — Railway deployment section
- `wiki/01-architecture.md` — Updated production host
- Plan file: `C:\Users\User\.claude\plans\groovy-watching-hanrahan.md` — Full 6-phase execution plan

---

## When You Return Tomorrow

Type: **`resume`**

I will immediately:
1. Confirm all 3 answers are in place (they are ✅)
2. Start Phase 1 of the deployment plan
3. Guide you through each phase step-by-step

---

**Current Git Status:** All changes committed to main ✅
