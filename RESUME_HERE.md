# RESUME_HERE — Last updated: 2026-05-19 (session 3)

## Project: SkyHigh
## Status: **LIVE** ✅

## Current State

**The app is live at https://www.skyhighparagliding.org.au**

Go-live completed 2026-05-19. Site is stable. All recent changes deployed and confirmed working.

---

## What's Done (this session)

- ✅ **Documentation fully updated** (commit 425a194) — AdminManual v15.0, TechSpec May 2026, Procedures Manual seed + SQL with hosting platform details and officer handover steps for Railway/GitHub/R2/DNS/Resend
- ✅ **Credential Recovery PDF created** — `SkyHigh-Credential-Recovery.pdf` covers all 8 services (Railway, GitHub, Cloudflare R2, Google Cloud DNS, Resend, TidyHQ, Google Workspace, Secure PW Document) with login URLs, purposes, and recovery procedures. HTML source at `credential-recovery.html` (gitignored). User saved PDF to Google Drive → 01_Governance.
- ✅ **Platform Overview link removed from public footer** (commit 3c1e23a) — removed from `Layout.tsx` and `WonderfulFooter.tsx`. Feature still accessible via Admin dashboard.

---

## ACTION REQUIRED (next session)

- ⚠️ **Update live Procedures Manual in production DB** — Go to Admin → Procedures Manual and manually update the `Website Management` and `Officer Toolkit & Handover` sections. The seed/migration files only affect fresh installs; the live DB still has the old content.
- ⚠️ **Fill in Webmaster contact details** in the Credential Recovery PDF and re-save to Google Drive (name, personal email, phone were left as placeholders).

---

## Known Issues / Backlog

- **mt-broughton-thistle-hill weather station** — External FreeFlightWx station returning bad JSON every cycle. Not our bug; station is down.
- **TASK-035** — `cross-env` installed via npx at runtime; should be added to package.json devDependencies
- **npm audit** — 11 vulnerabilities (8 moderate, 2 high, 1 critical) flagged at build time. Run `npm audit` locally to triage.
- **TASK-028** — CSRF Redis store deferred (single-instance Railway, not needed yet)
- **TASK-029** — DEFAULT_ADMINS hardening (partial — env var set, no setup script)
- **R2 custom domain** — Public dev URL (`pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev`) is rate-limited. For production scale, add a custom domain (e.g. `media.skyhighparagliding.org.au`) to the R2 bucket.
- **Fine grid staleness root cause** — Unknown why the fine grid stopped refreshing on May 17–19. New logging will surface it in Railway logs if it recurs. Watch for `Weather scraper: Fine grid is Xmin old` warnings.

---

## Key Info

| Item | Value |
|---|---|
| Production URL | https://www.skyhighparagliding.org.au |
| Railway URL (backup) | https://skyhigh-production.up.railway.app |
| Admin login | jonpamment@gmail.com |
| GitHub repo | https://github.com/SkyHighParagliding/SkyHigh |
| Railway project | skyhigh (SkyHighParagliding org) |
| R2 bucket | skyhigh-media |
| R2 public URL | https://pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev |
| DNS provider | Google Cloud DNS (Skyhigh DNS Service project) |
| TIDYHQ_CLUB_ID | skyhigh |
| Latest deploy | Remove Platform Overview from public footer — commit 3c1e23a |

---

## Key Files

- `memory/project.md` — Full status, env var table
- `wiki/02-tasks.md` — Master task list across all phases
- `wiki/06-deployment.md` — Infrastructure, accounts, DNS, Railway setup details
- `credential-recovery.html` — Source for credential recovery PDF (gitignored, local only)
- `.env` — All local credentials (mirrored to Railway Variables)
