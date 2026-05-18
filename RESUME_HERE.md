# RESUME_HERE — Last updated: 2026-05-18

## Project: SkyHigh
## Status: Active — Railway production fully operational

## Where I left off

**Session summary:** Bug-fix session. Three production bugs resolved and deployed. Railway is fully operational at https://skyhigh-production.up.railway.app. DNS still points to old Google Sites for www.skyhighparagliding.org.au — Phase 5 (DNS switchover) is the next major milestone.

**Fixes applied this session:**
1. ✅ **Site save error** (`could not determine data type of parameter $3`) — Removed `IS NOT NULL AND` from all 21 CASE expressions in `server/routes/sites/crud.ts`. Redundant check generated untyped `$N` parameters that PostgreSQL couldn't type-infer. Commit `62f8ee3`.
2. ✅ **Bulk upload limit not persisting to dialog** — `saveBulkUploadLimit()` in `useConnectionsConfig.ts` didn't call `refreshSettings()` after PUT, leaving SettingsContext stale. AdminImages reads limit from context. Fixed by adding `refreshSettings()` call. Commit `6cf43c6`.
3. ✅ **Photographer name optional in bulk upload** — Previously required; now uses `_` sentinel for empty name. Deployed in `ee8dcaf` (prior session commits now live).
4. ✅ **Bulk upload 0/N succeeded error** — `await` was missing on DB query for upload limit in `server/routes/ai.ts`. PostgreSQL adapter returns Promise without `await`. Deployed in `ee8dcaf`.

## Last completed task
- Bulk upload + site save bug fixes — 2026-05-18

## Currently in progress
- None — clean working tree

## Next task to start
- **Phase 4:** Resend domain verification — configure transactional email for password reset
  - Verify domain ownership via Resend dashboard
  - Set `RESEND_FROM_DOMAIN` in Railway env vars
  - Test password reset email sending
- **Then Phase 5:** Switch DNS to custom domain (skyhighparagliding.org.au → Railway)
- **Then Phase 6:** Production hardening and monitoring

## Open questions / blockers
- None

## Quick context refresher
SkyHigh is a paragliding/hang gliding club management platform deployed on Railway (https://skyhigh-production.up.railway.app). PostgreSQL is live, all 74 flying sites populated with banners, admin login works, image processing works. The app is fully functional on the `.up.railway.app` URL — just needs Phase 4-6 to go live on the custom domain. Three bugs were fixed today around the bulk image upload dialog (optional photographer, live limit, and PostgreSQL CASE typing).

## Live Deployment
- **App URL:** https://skyhigh-production.up.railway.app
- **Admin Login:** test@skyhigh.org.au / Test123456
- **Latest commit:** 6cf43c6

## Key Files
- `wiki/02-tasks.md` — Master task list
- `wiki/06-deployment.md` — Deployment & accounts
- `server/routes/sites/crud.ts` — Site update query (CASE expressions, no IS NOT NULL)
- `src/hooks/useConnectionsConfig.ts` — Bulk limit save + refreshSettings()
- `src/contexts/SettingsContext.tsx` — bulkUploadLimit is mapped at lines 363 and 514
