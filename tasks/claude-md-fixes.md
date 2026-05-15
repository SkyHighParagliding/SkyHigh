# CLAUDE.md Fixes — Task List for Review

> **STATUS:** Draft for user review. No changes made until confirmed.
> **Created:** 2026-05-15
> **Purpose:** Address all vague and missing items identified in CLAUDE.md audit

---

## Phase 1: Clarifications & Ambiguities

### TASK-001: Document the 7 remediation items
- **Status:** ⬜ TODO
- **Prerequisites:** None
- **Estimated effort:** S (1-2 hours)
- **Description:** Section 0 references "7 items in tasks/remediation_plan.md" but doesn't list them. Create an explicit list with titles and brief descriptions.
- **Acceptance criteria:**
  - The 7 items are listed in Section 0 or linked explicitly
  - Each item has a title and 1-2 sentence description
  - If they map to task IDs, those are noted
- **Notes:** Check if `tasks/remediation_plan.md` already exists; if so, summarize its contents

### TASK-002: Define "NEEDS REVIEW" task status
- **Status:** ⬜ TODO
- **Prerequisites:** None
- **Estimated effort:** XS (15-30 min)
- **Description:** Section 9 mentions marking tasks "NEEDS REVIEW" but Section 7's task format doesn't include this status. Add it to the format and define when to use it.
- **Acceptance criteria:**
  - Section 7 task format updated to include 🔍 NEEDS REVIEW status
  - Clear definition of when to use NEEDS REVIEW (can't automate verification, needs human judgment, security concern, etc.)
  - Section 9 updated to reference the new status
- **Notes:** Decide if NEEDS REVIEW is a terminal state or a transitional one

### TASK-003: Clarify error recovery threshold (Stage D)
- **Status:** ⬜ TODO
- **Prerequisites:** None
- **Estimated effort:** XS (15-30 min)
- **Description:** Section 5 Stage D says "if something went wrong, update memory/feedback.md with what you learned, then fix it" but doesn't specify severity threshold. Clarify when to pause and ask vs. retry vs. escalate.
- **Acceptance criteria:**
  - Section 5 Stage D updated with decision tree: "If error is X, do Y; if error is Z, do W"
  - Threshold defined (e.g., "code won't compile" = ask user, "test failed" = retry once, etc.)
  - Examples provided for 2-3 common scenarios
- **Notes:** Think about types: compilation error vs. test failure vs. verification failure

### TASK-004: Verify and document subagent delegation files
- **Status:** ⬜ TODO
- **Prerequisites:** None
- **Estimated effort:** M (2-4 hours)
- **Description:** Section 16 references `.agents/ARCHITECT.md`, `.agents/CODER.md`, `.agents/REVIEWER.md` but these may not exist or may be incomplete. Verify state and clarify.
- **Acceptance criteria:**
  - Confirm whether `.agents/` folder exists in the project
  - If files exist, verify they have content (don't reference non-existent files in CLAUDE.md)
  - If files don't exist, either: create stub versions OR update Section 16 to clarify they're not yet created
  - Section 16 should explicitly state "These files are not yet created; they are a future feature" OR "These files exist at [path] and contain..."
- **Notes:** This is a design debt item — clarify whether it's planned or not

### TASK-005: Clarify tasks/remediation_plan.md vs wiki/02-tasks.md
- **Status:** ⬜ TODO
- **Prerequisites:** TASK-001
- **Estimated effort:** XS (15-30 min)
- **Description:** Section 0 says tasks are in `tasks/remediation_plan.md` but Section 7 defines master task format in `wiki/02-tasks.md`. Clarify: are these the same file? Different? Should both exist?
- **Acceptance criteria:**
  - CLAUDE.md clearly states the canonical task list location
  - If two files exist, explain their relationship (e.g., remediation_plan is a subset, or legacy file to retire)
  - Section 0 and Section 7 are consistent
- **Notes:** May require checking the actual filesystem

---

## Phase 2: Missing Development & Setup Guidance

### TASK-006: Document environment variables (.env)
- **Status:** ⬜ TODO
- **Prerequisites:** None
- **Estimated effort:** M (2-3 hours)
- **Description:** Create `.env.example` and document all required variables, which are secrets, which are config, and where they come from.
- **Acceptance criteria:**
  - `.env.example` file exists in repo root with all required variables
  - Each variable has a comment explaining its purpose
  - Variables marked as [REQUIRED], [OPTIONAL], [SECRET]
  - Wiki/06-integrations.md or new wiki/07-environment.md documents how to obtain each value (where to generate API keys, etc.)
  - Section 4 (Session Start) mentions how to set up `.env.local`
- **Notes:** Check which integrations actually need keys: Gemini, TidyHQ, Open-Meteo, R2, etc.

### TASK-007: Document database setup and schema
- **Status:** ⬜ TODO
- **Prerequisites:** None
- **Estimated effort:** M (2-3 hours)
- **Description:** Clarify how to initialize the database locally, run migrations, and understand the current schema.
- **Acceptance criteria:**
  - Wiki/06-deployment.md or new wiki/07-database.md documents:
    - How to initialize SQLite locally (`npm run db:init` or similar)
    - How to run migrations in dev vs. prod
    - Connection string format for both SQLite and PostgreSQL
    - Current schema version
    - How to inspect the database schema
  - `scripts/seed.ts` is documented (what does it do? when to run?)
  - `database/schema.sql` is explained (or link to it if it exists)
- **Notes:** May need to verify what the actual commands are

### TASK-008: Document API credentials and rotation
- **Status:** ⬜ TODO
- **Prerequisites:** None
- **Estimated effort:** M (2-3 hours)
- **Description:** Document where API keys live in dev, how to manage them, and rotation procedure.
- **Acceptance criteria:**
  - Wiki/06-integrations.md updated to clarify for each integration (Gemini, TidyHQ, Open-Meteo, R2):
    - Dev: where are keys stored? (env file? local secrets manager?)
    - Prod: where are keys? (Railway env vars? Secrets manager?)
    - How to rotate a compromised key
    - Whom to contact if a key leaks
  - Section 0 or wiki/06 mentions which keys are personal vs. team-managed
- **Notes:** This overlaps with TASK-006; coordinate

### TASK-009: Add "First-Time Setup" guide
- **Status:** ⬜ TODO
- **Prerequisites:** TASK-006, TASK-007
- **Estimated effort:** M (2-3 hours)
- **Description:** Create a clear "first time setup" checklist in Section 4 (Session Start Protocol) or as a new wiki file.
- **Acceptance criteria:**
  - New subsection in Section 4 titled "First-Time Local Setup" with step-by-step instructions
  - Steps include: clone repo, npm install, .env setup, database init, seed data, verify it works
  - Each step has a "verify it worked" check
  - Estimated time to complete (e.g., "takes ~10 minutes")
  - Links to relevant sections for each step
- **Notes:** Should be executable in order without ambiguity

### TASK-010: Document prerequisites (Node version, npm version, etc.)
- **Status:** ⬜ TODO
- **Prerequisites:** TASK-009
- **Estimated effort:** S (1-2 hours)
- **Description:** State minimum Node/npm versions, OS support, and any system dependencies.
- **Acceptance criteria:**
  - Section 0 or new "Environment" section lists:
    - Minimum Node.js version (check package.json engines field)
    - Minimum npm version
    - OS support (Windows, Mac, Linux?)
    - Any other system dependencies (Python? ffmpeg? etc.)
  - This is linked from the "First-Time Setup" guide
- **Notes:** Check package.json for current requirements

---

## Phase 3: Missing Deployment & Production Docs

### TASK-011: Document Railway deployment details
- **Status:** ⬜ TODO
- **Prerequisites:** None
- **Estimated effort:** M (2-3 hours)
- **Description:** Section 0 says "Railway (PostgreSQL) — migration in progress" but doesn't provide actionable details.
- **Acceptance criteria:**
  - Wiki/06-deployment.md (or update existing) includes:
    - Railway project name and link
    - How to view logs on Railway dashboard
    - Current deployment status (what's "in progress"?)
    - Deployment pipeline: is it manual `git push` or automated CI/CD?
    - How long does a typical deploy take?
    - Current prod URLs (app, admin, API)
  - Section 0 is updated with link to this section
- **Notes:** May need to verify actual Railway project details

### TASK-012: Document production database access
- **Status:** ⬜ TODO
- **Prerequisites:** TASK-011, TASK-007
- **Estimated effort:** M (2-3 hours)
- **Description:** How to connect to PostgreSQL in production for debugging, backups, or emergency queries.
- **Acceptance criteria:**
  - Wiki/06-deployment.md documents:
    - How to connect to prod PostgreSQL locally (connection string, SSH tunnel if needed)
    - Which users have access and approval process
    - Whether backups are automated and where they're stored
    - Disaster recovery procedure (how to restore from backup?)
  - Warnings about production data (don't modify without approval, etc.)
- **Notes:** Security-sensitive; clarify access control

### TASK-013: Add emergency procedures
- **Status:** ⬜ TODO
- **Prerequisites:** TASK-011, TASK-012
- **Estimated effort:** M (2-3 hours)
- **Description:** Create runbook for common critical scenarios.
- **Acceptance criteria:**
  - New wiki file `wiki/07-runbook.md` (or update existing deployment doc) with:
    - "Production is down" — steps to diagnose and recover
    - "Deployment failed" — how to rollback to previous version
    - "Database corruption" — who to contact, backup recovery
    - "Leaked API key" — immediate steps, rotation process
  - Each scenario has: symptom, diagnosis steps, recovery steps, prevention
  - Escalation paths (whom to contact)
- **Notes:** Write this assuming 3am emergency

---

## Phase 4: Missing Development Guidance

### TASK-014: Document testing strategy
- **Status:** ⬜ TODO
- **Prerequisites:** None
- **Estimated effort:** M (2-3 hours)
- **Description:** Clarify test runner, coverage thresholds, and types of tests.
- **Acceptance criteria:**
  - Wiki/01-architecture.md or new wiki/08-testing.md documents:
    - Test runner and how to run tests (`npm test`? `vitest`? jest?)
    - Coverage thresholds (if any)
    - Which tests are unit vs. integration vs. E2E
    - Whether E2E tests exist and where they live
    - How to write a test (conventions, example)
  - Section 4 mentions running tests as part of session start verification
  - `npm test` command is listed and documented
- **Notes:** Check package.json for actual test runner

### TASK-015: Document debugging guidance
- **Status:** ⬜ TODO
- **Prerequisites:** None
- **Estimated effort:** M (2-3 hours)
- **Description:** How to debug frontend and backend, where logs go, common errors.
- **Acceptance criteria:**
  - New wiki file `wiki/09-debugging.md` with sections:
    - Frontend debugging (browser DevTools, where to look for errors)
    - Backend debugging (Express logs, how to enable debug mode)
    - Where logs live in dev vs. prod
    - 3-5 common errors and their solutions
    - How to enable verbose logging
  - Linked from wiki/README.md
- **Notes:** Include examples with screenshots or code snippets

### TASK-016: Document API endpoint structure
- **Status:** ⬜ TODO
- **Prerequisites:** None
- **Estimated effort:** M (2-3 hours)
- **Description:** Where API docs live, how endpoints are structured, how to add new ones.
- **Acceptance criteria:**
  - Wiki/01-architecture.md or new wiki/10-api.md documents:
    - Base URL for API in dev vs. prod
    - Authentication scheme (bearer token? session? none?)
    - Response format (JSON envelope? direct?)
    - Error handling (error codes, format)
    - How to add a new endpoint (template or example)
  - Links to actual endpoint code in `server/routes/`
  - Swagger/OpenAPI docs (if they exist) or note that they don't
- **Notes:** Check server/routes/ for current structure

### TASK-017: Document port mappings
- **Status:** ⬜ TODO
- **Prerequisites:** TASK-009
- **Estimated effort:** XS (15-30 min)
- **Description:** Clarify which port is frontend (5173?) and which is backend (3001?).
- **Acceptance criteria:**
  - Section 0 or wiki/01-architecture.md clearly states:
    - Frontend runs on port 5173 (or actual port)
    - Backend runs on port 3001 (or actual port)
    - How Vite + Express run together (`npm run dev`?)
    - What happens if a port is already in use
  - First-Time Setup guide references this
- **Notes:** Verify actual ports in vite.config.ts and server/index.ts

---

## Phase 5: Missing Build & Quality Docs

### TASK-018: Document build process and production testing
- **Status:** ⬜ TODO
- **Prerequisites:** TASK-011
- **Estimated effort:** M (2-3 hours)
- **Description:** How to build for production and test the build locally.
- **Acceptance criteria:**
  - Wiki/01-architecture.md or wiki/06-deployment.md documents:
    - Build command (`npm run build`?)
    - Build output location and what it contains
    - How to test the production build locally (serve dist/)
    - Build configuration (Vite settings, TypeScript compilation)
    - How long build takes, any optimizations
  - Warnings about production vs. dev behavior differences
- **Notes:** Check scripts/ and vite.config.ts for actual commands

### TASK-019: Document code style and linting
- **Status:** ⬜ TODO
- **Prerequisites:** None
- **Estimated effort:** S (1-2 hours)
- **Description:** ESLint, Prettier, pre-commit hooks, code review standards.
- **Acceptance criteria:**
  - Wiki/01-architecture.md updated to mention:
    - ESLint and Prettier are configured (or note if they're not)
    - How to run linter (`npm run lint`?)
    - Pre-commit hooks (are there any? what do they check?)
    - Code review standards (see CLAUDE.md Section 15)
  - Links to actual config files (.eslintrc, .prettierrc, husky config)
- **Notes:** Check for actual linter/formatter configs in repo

### TASK-020: Audit memory and wiki file state
- **Status:** ⬜ TODO
- **Prerequisites:** None
- **Estimated effort:** M (2-3 hours)
- **Description:** Verify which memory/wiki files exist and what state they're in.
- **Acceptance criteria:**
  - For each file below, document "EXISTS" or "TODO":
    - `memory/MEMORY.md`
    - `memory/feedback.md`
    - `memory/project.md`
    - `memory/reference.md`
    - `wiki/00-overview.md`
    - `wiki/01-architecture.md`
    - `wiki/02-tasks.md`
    - `wiki/03-decisions-log.md`
    - `wiki/04-glossary.md`
    - `wiki/05-file-map.md`
    - `wiki/06-integrations.md`
  - Add a "Wiki & Memory Audit" section to CLAUDE.md Section 0 with actual status
  - If a file should exist but doesn't, create it as a stub (even if empty)
- **Notes:** This is a prerequisite for CLAUDE.md to be accurate

---

## Phase 6: CLAUDE.md Updates & Cleanup

### TASK-021: Create or update .env.example
- **Status:** ⬜ TODO
- **Prerequisites:** TASK-006
- **Estimated effort:** S (1 hour)
- **Description:** Add `.env.example` to repo root.
- **Acceptance criteria:**
  - `.env.example` exists in repo root
  - All required vars are listed with comments
  - Vars are marked [REQUIRED], [OPTIONAL], [SECRET]
  - `.gitignore` has `.env` and `.env.local` (so example isn't committed by mistake)
- **Notes:** Not to be committed; this is an artifact of TASK-006

### TASK-022: Add .agents/ files (or clarify they don't exist)
- **Status:** ⬜ TODO
- **Prerequisites:** TASK-004
- **Estimated effort:** S (1-2 hours)
- **Description:** Either create the subagent files or update CLAUDE.md to clarify they're a future feature.
- **Acceptance criteria:**
  - One of these is true:
    - A) `.agents/ARCHITECT.md`, `.agents/CODER.md`, `.agents/REVIEWER.md` are created with role descriptions
    - B) Section 16 of CLAUDE.md is updated to say "These files do not yet exist; they are planned as a future feature"
  - If (A), the files have clear instructions and the role description
  - If (B), there's a note in RESUME_HERE.md to create them later
- **Notes:** If unsure, go with (B) for now

### TASK-023: Add "Quick Start" subsection to Section 4
- **Status:** ⬜ TODO
- **Prerequisites:** TASK-009, TASK-006, TASK-007, TASK-010
- **Estimated effort:** S (1-2 hours)
- **Description:** Add a concise "First-Time Setup" subsection to Section 4.
- **Acceptance criteria:**
  - New subsection in Section 4: "🚀 First-Time Local Setup"
  - 5-7 numbered steps (git clone, npm install, .env, npm run db:init, npm run dev, verify)
  - Each step has a verification check
  - Estimated total time (~10 minutes)
  - Links to detailed docs for each step
- **Notes:** Should be copy-paste executable

### TASK-024: Add "Current State Verification" to Section 0
- **Status:** ⬜ TODO
- **Prerequisites:** TASK-020, TASK-001, TASK-005
- **Estimated effort:** S (1 hour)
- **Description:** Update Section 0 with explicit verification of project state.
- **Acceptance criteria:**
  - New subsection in Section 0: "✓ Current State (as of 2026-05-15)"
  - Lists which wiki files exist and are filled in
  - Lists which memory files exist
  - Confirms which remediation items are in progress
  - Confirms Railway migration status
  - Easy to update when state changes
- **Notes:** This is a living document; update it as state changes

---

## Summary

**Total tasks:** 24  
**Phases:** 6  
**Estimated total effort:** ~40-50 hours  
**Critical path:** Tasks 1 → 5 → 6 → 20 → 24 (others can be parallel)

**High-priority (do first):**
- TASK-001, 005, 020, 024 — Clarify and verify current state
- TASK-006, 007, 009, 010 — Enable first-time setup
- TASK-011, 012, 013 — Document production access

**Can be parallelized:**
- TASK-002, 003, 004 (Section 5 clarifications)
- TASK-014, 015, 016, 017, 018, 019 (dev guidance)

---

## How to Proceed

1. **Review this list** — does it match your priorities?
2. **Adjust scope** — combine/remove/reorder tasks as needed
3. **Confirm** — tell me which tasks to start on
4. **I will not change CLAUDE.md or create files until you confirm**

