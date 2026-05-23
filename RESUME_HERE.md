# RESUME_HERE — Last updated: 2026-05-23 (session 17)

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway

## Where I left off

Session 17 fixed the T4 confabulation bug and a T3 regression, then re-ran all 9 v5 tests. All 9 pass on production.

**Bugs fixed (session 17):**
- BUG-5 (T4 confabulation): Unflyable days in the 7-day extended forecasts were silently dropped, causing the AI to fill the gap with today's FCST numbers. Fix: `buildPublicContext()` now includes ALL 7 days for each site — flyable days keep their `[Dir:X Spd:Y]` tags, unflyable days get `[NOT FLYABLE: reason]` tags with actual ECMWF wind data. Behavior prompt updated to instruct AI to cite the actual numbers from NOT FLYABLE entries.
- BUG-6 (T3 regression from BUG-5 fix): When PG4 queried Monument with blown-out Tuesday conditions, the AI conflated the `[NOT FLYABLE: wind too strong]` weather tag with eligibility and said "No, PG4 cannot fly under any supervision." Fix: Added explicit rule to behavior prompt — `[NOT FLYABLE]` entries are weather-condition flags only; answer eligibility first, then conditions separately.
- DB auto-upgrade detection phrases updated for both fixes.

**v5 test results (all 9 pass):**
- ✅ T1: PG2 at Monument (CFI, Thursday) — "No, a PG2 cannot fly under any supervision"
- ✅ T2: PG3 at Monument (Wednesday) — "No, a PG3 cannot fly under any supervision"
- ✅ T3: PG4 at Monument (Tuesday) — "PG4 can fly with SO/SSO. However, Tuesday 17kt G22 ESE — too strong"
- ✅ T4: PG4 at Ben Nevis (Monday) — "6kt NE NOT FLYABLE, wrong direction (requires W-NW)" — cites actual ECMWF data
- ✅ T5: PG2 listing (Sunday) — supervised sites listed, Monument absent
- ✅ T6: PG3 listing (weekend) — qualified sites + supervision rules correct, Monument absent
- ✅ T7: PG4 at Ben Nevis (Friday) — "Yes unsupervised; 5kt G10 W, gust warning ⚠"
- ✅ T8: Mt Buninyong (no rating, Sunday) — asks for rating first (RATING-FIRST rule)
- ✅ T9: PG2 at Barwon Heads (Friday, third-person) — "Yes with supervision; supervisor types listed"

## Last completed task
- Session 17: T4 confabulation fix + T3 regression fix + v5 test suite — all 9 tests pass on production (2026-05-23)

## Currently in progress
- Nothing

## Next task to start
- TASK-029: Harden DEFAULT_ADMINS for Production (env var docs + one-time setup script)
- TASK-031: Pilot XC Flight History Export (CSV/GPX)

## Open questions / blockers
- None

## Quick context refresher
Smart search now includes ALL 7 days in the extended forecasts block — flyable days show `[Dir:Spd]`, unflyable days show `[NOT FLYABLE: reason]` with actual ECMWF wind data. The AI is instructed that NOT FLYABLE is a weather tag, not an eligibility restriction — eligibility is answered first, conditions separately. Monument (PG5 | PG4 SO/SSO) remains the canonical test case. DB auto-upgrade detection in `seedPublicPrompt()` now checks 10 phrases.
