# RESUME_HERE — Last updated: 2026-05-27 (session 23 end)

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway — pure PG codebase, all fixes pushed

## Where I left off

Session 23 completed SQLite removal, fixed several INTEGER = boolean bugs introduced
during the conversion, darkened nav dropdown opacity to 0.80, and pushed everything
to production. Railway is currently deploying commit `55f86ef`.

**All done this session:**
- SQLite fully removed — `better-sqlite3` uninstalled, pure PG-native codebase
- Dev tested on local Docker Postgres before pushing — caught `seed.ts` boolean bug
- Fixed 6 INTEGER = boolean SQL bugs introduced by conversion subagent:
  - `auth.ts`: `isAdmin`, `soAuthorised`, `isSafetyCommittee` (were `= true`, now `= 1`)
  - `scheduledJobs.ts`: `isSocialMedia` (was `= true`, now `= 1`)
  - `siteguideVersionCheck.ts`: `changed` ×3 (were `= true`, now `= 1`)
  - `seed.ts`: `enabled` in safety_sections (was `true`, now `1`)
- Nav dropdown opacity: `0.35 → 0.80` (user-tuned from 0.90)
- Full audit of all INTEGER flag columns — no further issues found
- All .md files updated to reflect current state

## What's next

1. Verify production after Railway deploy completes
2. Pick from the feature backlog — TASK-031 (XC Flight History Export) is the highest priority quick win

## Open questions / blockers
- Smart Search bugs BUG-A through BUG-G remain open (7 bugs, Q40–Q50 test run not completed)

## Quick context refresher

Pure PostgreSQL codebase as of today. All DB access via `server/pg.ts` (`query`, `queryOne`,
`execute`, `transaction`). INTEGER flag columns (contacts: `isAdmin`, `isSafetyCommittee`, etc.)
must use `= 1`/`= 0` in SQL — never `= true`/`= false`. Sites boolean columns are TEXT
`'true'`/`'false'` — different pattern, different table. Local dev: Docker Postgres 16
(`skyhigh-pg-dev` container on port 5432) + `npm run dev`.
