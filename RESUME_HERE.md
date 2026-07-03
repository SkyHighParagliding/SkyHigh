# RESUME_HERE — Last updated: 2026-07-03 (session 40)

## Project: SkyHigh
## Status: Active — Smart Search safety layer SHIPPED (commit 1455482)

## Where I left off

Session 40: Built and shipped the **deterministic Smart Search safety layer** in response to the July 2026 public query-log audit (135 entries; serious errors found: wrong eligibility verdicts, drizzle days presented as Good/Good, 20-turn emergency roleplay coaching, silent site substitution).

**What shipped (commit `1455482`):**
- `server/utils/eligibility.ts` — rating-string parser + supervision matrix; eligibility verdicts computed in code, injected as an authoritative prompt block, enforced post-generation. Boot-time audit logs unparseable rating strings.
- `server/utils/safetyGate.ts` — pre-LLM emergency circuit-breaker (fixed 000 response, full-history persistence, hypothetical guard).
- `server/utils/conditionQualifications.ts` — WMO-code + summary-text hazard detection; club-mandated verbatim qualification statement (drizzle/rain/fog/mist/strong gusts = gust ≥ mean+3kt) must lead any Good/Good verdict.
- `server/utils/siteResolver.ts` + migration 039 (sites.aliases column + seeds) — alias/fuzzy resolution, "did you mean?" instead of silent substitution, post-generation /sites/ link correction.
- `server/utils/responseEnforcement.ts` — site-scoped backstop: appends dropped restrictive verdicts, prepends corrections for contradicted permissive verdicts, appends missing qualification statements.
- `server/routes/search.ts` — integration: gate → resolution (with history fallback for "can I fly there?") → verdict/fuzzy/today-scope directives → post-gen enforcement. Gust checks now precede light-wind checks with compound reasons; unified gust threshold (removed +2 grace); fixed latent `site.windDirection` bug in 7-day NOT-FLYABLE reasons.
- `scripts/eval-smart-search.mjs` + `scripts/eval-smart-search-units.ts` — regression harness: **63 unit + 9 live cases, all passing** (`npm run eval:search`; `--live` needs dev API + Gemini key).

Two independent code reviews (both initially REQUEST-CHANGES); all 12 findings fixed and verified APPROVE by a third pass. Key review catches: pilot-rating negation ("I'm not a PG4 yet, just PG3" must extract PG3), site-scoped enforcement for multi-site answers, malformed-history crash in the safety gate.

**Not committed:** `SkyHigh — Smart Search Log.pdf` and `smart-search-log-extracted.txt` (source audit data, kept untracked in repo root).

## Last completed task
- Smart Search safety layer (session 40) — code complete 2026-07-03, committed locally as `1455482`

## Currently in progress
- **Jon completed the manual test pass (2026-07-03 session end) and FOUND ISSUES.** Details not yet captured — ask Jon for his findings first thing next session before touching anything else. **DO NOT PUSH TO GITHUB until these are fixed** (Jon's explicit instruction).

## Next task to start
- Fix the issues Jon found during manual testing of the Smart Search safety layer (get the list from Jon; add failing cases to `scripts/eval-smart-search-units.ts` first, then fix)
- Then: "Report bad answer" button for Smart Search (reminder in tasks/todo.md)
- Then: TASK-030: Siteguide Version Change Email Notification (see tasks/todo.md)
- Only after fixes verified: push to GitHub → Railway deploy; watch boot log for `[eligibility]` rating-string warnings against PROD data (prod has richer pgRating strings than dev)

## Open questions / blockers
- **BLOCKER: manual-test issues found by Jon, not yet described** — do not push/deploy commit `1455482` until fixed
- Dev DB has ratings only on The Paps / Flinders Golf Club / Three Sisters — full verdict behaviour needs prod-like data to exercise every rating-string format
- (carried) wiki/05-file-map.md has pre-existing drift — worth a wiki audit pass (Section 11) some session; new server/utils/* files also need adding to the file map

## Quick context refresher
SkyHigh is the paragliding club platform on Railway. The Smart Search public assistant now computes all safety-critical decisions (eligibility, weather hazards, emergencies, site matching) deterministically in TypeScript — the LLM only phrases them, and a post-generation enforcement layer corrects it when it strays. Regression suite: `npm run eval:search`.
