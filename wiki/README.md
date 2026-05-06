# SkyHigh Wiki

Welcome to the SkyHigh project wiki. This folder contains the **intra-session shared brain** — project architecture, decision history, task tracking, file navigation, and domain glossary.

**When to update the wiki:** After making architectural decisions, completing task phases, or discovering non-obvious project context that future sessions should know. Update immediately while context is fresh.

**Memory vs Wiki:**
- `wiki/` — tracked in git, persists across sessions, contains decisions and documentation
- `memory/` — gitignored, session-scoped, rebuilt each session from current project state

---

## Quick Navigation

| What you need | File |
|---|---|
| Quick orientation (what is SkyHigh?) | [00-overview.md](00-overview.md) |
| Stack, architecture, folder layout | [01-architecture.md](01-architecture.md) |
| All 33 tasks, phases, acceptance criteria | [02-tasks.md](02-tasks.md) |
| 7 architectural decisions + rationale | [03-decisions-log.md](03-decisions-log.md) |
| Flying domain and technical term definitions | [04-glossary.md](04-glossary.md) |
| Important files and their roles | [05-file-map.md](05-file-map.md) |

---

## Files in This Wiki

### [00-overview.md](00-overview.md)
**What SkyHigh is:** Australian paragliding/hang gliding club management platform, white-label ready.  
**6 primary goals:** Site directory, XC tracking, pilot retrieval, admin CMS, TidyHQ sync, AI tools.  
**What it is NOT:** Booking platform, social network, logbook, e-commerce, multi-tenant SaaS.  
**In-scope and out-of-scope feature lists.**

### [01-architecture.md](01-architecture.md)
**Tech stack with versions:** React 19, Express 4, SQLite (dev), PostgreSQL (prod), Vite, Cloudflare R2, Gemini, Open-Meteo, TidyHQ.  
**Architectural patterns:** Dual-database adapter, grid caching, SSE retrieval coordination, Gemini AI chain.  
**Annotated folder structure:** `src/` (frontend) and `server/` (backend) breakdown.  
**Dev vs Production table:** Key differences in DB, storage, auth, ports.

### [02-tasks.md](02-tasks.md)
**33 tasks across 5 phases:**
- **Phase 1 — Security Hardening (✅ complete):** SQL injection, plaintext password guard, CSRF, SSRF, hardcoded creds, rate limiting, PG pool config
- **Phase 2 — Wind Map & Weather (✅ complete):** Grid caching, scheduled jobs, startup catch-up, Open-Meteo key, manual trigger, bulk hero upload, admin default view, cache pagination bypass
- **Phase 3 — Short-Term Hardening (⬜ TODO):** JSON.parse guards, pagination, structured logging, Zod validation, constants, DB indexes, token hardening
- **Phase 4 — Production Deployment (⬜ TODO):** PostgreSQL, R2, CSRF Redis, admin hardening
- **Phase 5 — Feature Backlog (⬜):** Siteguide email, pilot export, NOTAM overlay, multi-club white-label test

### [03-decisions-log.md](03-decisions-log.md)
**7 documented architectural decisions:**
- DECISION-001: Dual DB strategy (SQLite dev, PostgreSQL prod, unified adapter)
- DECISION-002: Cloudflare R2 for storage
- DECISION-003: ECMWF grid caching (continental pre-cache, daily fetch, 7-day rolling DB storage)
- DECISION-004: Canvas + D3 wind map rendering
- DECISION-005: Gemini for all AI features
- DECISION-006: Replit hosting
- DECISION-007: Cache pagination bypass (skip cache if custom limit/offset)

### [04-glossary.md](04-glossary.md)
**~35 terms** organized into three categories:
- **Flying domain:** PG, HG, XC, Launch, LZ, thermal, rotor, site rating, retrieval
- **Tech/Systems:** ECMWF, Open-Meteo, Victoria grid, bilinear interpolation, TidyHQ, Garmin MapShare, SPOT, Zoleo, SSE
- **Admin system:** Procedures Manual, Safety sections, Contacts, Settings table

### [05-file-map.md](05-file-map.md)
**Curated map of important (non-obvious) files:**
- Root config: `server.ts`, `esbuild.server.mjs`, `vite.config.ts`
- Server core: `db.ts`, `pgDb.ts`, `victoriaGrid.ts`, `weather.ts`, `storage.ts`
- Routes and services key files
- Middleware, utils, migrations
- Frontend context, windmap, API client

---

## Session Workflow

1. **Start of session:** Read `RESUME_HERE.md` for last state, then this wiki as needed
2. **During work:** Update `memory/` files (auto-saved project state)
3. **Decision made:** Document in `03-decisions-log.md` → commit to git
4. **Task completed:** Mark ✅ in `02-tasks.md` → commit to git
5. **End of session:** Leave `memory/` as-is (will be refreshed next session)

---

Last updated: 2026-05-06
