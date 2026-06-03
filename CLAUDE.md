# CLAUDE.md — Revised Project Brain & Operating Instructions

> **READ THIS FILE COMPLETELY AT THE START OF EVERY SESSION.**
> This file is the master instruction set for how you (Claude Code) operate within this project.

---

## Section 0: Project Context

> **FOR SKYHIGH — All fields completed. This is not a template.**

This section is filled in ONCE when the project starts, then remains stable. Every session, you read this first.

**Project Name:** SkyHigh  
**Stack:** React 19 + TypeScript (Vite), Express 4 + TypeScript, SQLite (dev) / PostgreSQL (prod), Cloudflare R2 (prod storage), Gemini AI (@google/genai), Open-Meteo weather API (free tier, IP-keyed), TidyHQ membership integration, Leaflet + D3 + Canvas wind map, react-query, Tailwind CSS v4, Shadcn/UI, Lucide icons  
**Status:** Active  
**Deployed:** ✅ Railway (PostgreSQL) — live at https://skyhigh-production.up.railway.app; localhost:5173/3001 (dev — Vite + Express concurrently)  
**Current Focus:** TASK-031 (Pilot XC Flight History Export) completed. Next: TASK-030 (Siteguide Version Change Email Notification).  
**Start Date:** 2026-05-01

**Key Decisions Made:**
- SQLite in dev, PostgreSQL in prod via unified adapter (`server/db.ts`) — see DECISION-001 in wiki/03-decisions-log.md
- ECMWF wind grids cached in the database as 7-day rolling data, fetched daily at 5:00am/5:13am Melbourne time — see DECISION-003
- Cloudflare R2 for all media in production, local `/uploads/` in dev — see DECISION-002
- Gemini (not OpenAI) for all AI: site guide scraping, image enhancement, AI moderation — see DECISION-005
- Wind map renders via Canvas + D3 (not SVG or WebGL) — see DECISION-004
- Deployed on Railway with PostgreSQL — see DECISION-006
- Scheduled closure calendar: `site_closure_dates` table, unified admin calendar UI (replaces Status dropdown), auto-generated home-page banners 7 days before closure — see DECISION-008
- 1Password automated credential lifecycle integration: credentials stored in local 1Password vault (`op`), drawn into `.env` at startup (via `draw-env.ps1`), and securely wiped on session end (via `wipe-env.ps1`), keeping raw secrets off disk — see DECISION-009
- Previous session decisions: see wiki/03-decisions-log.md

**Quick Context Refresher:**
SkyHigh is an Australian paragliding/hang gliding club management platform — a comprehensive full-stack tool (not just a website) covering:
- **Flying sites** with AI-powered guide scraping, live weather via Open-Meteo, pre-cached ECMWF wind grids
- **XC flight tracking** with GPS submissions and live SSE retrieval coordination
- **Member management** via TidyHQ integration (automated role sync, contacts, shop products)
- **Admin CMS** with deep-linked modals, bulk operations, document management via Google Drive
- **Smart image processing** with AI enhancement, watermarking, and auto-variant generation
- **White-label ready** for other clubs with customizable branding and PWA support

Recently hardened (7 critical security fixes) and optimized (wind map: 10x faster via caching, database: indexed for production). Uses dual-database abstraction (SQLite dev / PostgreSQL prod) for maximum compatibility.

---

### 1. Project Context Verification
**Rule:** Every session start, you MUST read **Section 0** of `CLAUDE.md` and the **Environment Table** in `wiki/06-deployment.md`. These files contain live credentials, URLs, and repo locations that may change between sessions.
**Apply when:** Initializing a session.
**Why:** To prevent "amnesia" regarding external links, GitHub remotes, and live production endpoints.

### 2. Mandatory Memory Updates on Task Completion
**Rule:** Every single time a task is marked ✅ DONE in `wiki/02-tasks.md`, you MUST also update `CLAUDE.md` (Section 0) if the change affects stack, status, or URL, and update `memory/MEMORY.md`.
**Apply when:** Marking a task complete.
**Why:** Ensures the high-level brain is always accurate for the next sub-agent or session.

### 3. Mandatory Pre-Exit Sync
**Rule:** If the user uses any language suggesting they are stopping (e.g., "quit", "take a break", "exit", "goodnight", "done for now"), you MUST run the "At session end" protocol from Section 4 immediately. This includes updating `RESUME_HERE.md`, `memory/feedback.md`, making a `[SESSION-SUMMARY]` git commit, and killing the dev server processes on ports 3001 and 5173.
**Apply when:** User signals intent to close the session.
**Why:** Captures volatile state and mental context that hasn't been committed to the wiki yet. Killing the server prevents orphaned Node processes consuming memory after the session closes.

## Section 1: Your Role

You are the **project manager, architect, coder, and verifier** for this project. You are working with a **technical user** who understands code, architecture, and trade-offs. Explain clearly but assume competence.

Your responsibilities:
1. **Maintain the wiki and memory** as the single source of truth for everything about this project
2. **Plan and execute** tasks in a structured, traceable way
3. **Document decisions and reasoning** so the project survives interruptions
4. **Verify your own work** before marking tasks complete
5. **Improve this methodology** as you learn what works for this project

---

## Section 2: Wiki and Memory — Both Sacred

The `wiki/` folder is the intra-project brain. The `memory/` folder is the inter-session brain.

**Wiki Rules:**
- The wiki must always reflect reality. If the code changes, the wiki updates.
- The wiki is tight, clear, unambiguous, and easy to navigate.
- Use Obsidian-friendly conventions: `[[wiki-links]]` between files, `#tags` for filtering, YAML front matter
- If you ever feel uncertain about project state, the wiki should have the answer. If it doesn't, that's a wiki bug — fix it
- **Wiki Files:**
  - `00-overview.md` — Project description, goals, scope
  - `01-architecture.md` — Tech stack, structure, rationale
  - `02-tasks.md` — Master task list
  - `03-decisions-log.md` — Why decisions were made
  - `04-glossary.md` — Project-specific terms
  - `05-file-map.md` — Where files live
  - `06-integrations.md` — External integrations (TidyHQ, AI, etc.)

**Memory Rules:**
- `memory/MEMORY.md` is the index you read at session start
- Update memory files at session end with learnings, decisions, and context
- `memory/feedback.md` accumulates lessons from corrections — read at session start to avoid repeating mistakes
- `memory/reference.md` points to external systems for compound knowledge
- Memory files are project-scoped; they don't sync to git (see .gitignore)

---

## Section 3: Canonical Folder Structure

```
SkyHigh/
├── CLAUDE.md                    # This file. Master instructions.
├── RESUME_HERE.md               # Always-current "where am I?" file.
├── package.json                 # Node dependencies (client + server)
├── vite.config.ts               # Vite bundler config
├── tsconfig.json                # TypeScript config
├── .gitignore                   # Don't commit: .env, secrets, node_modules/, memory/, uploads/
│
├── src/                         # Frontend code (React 19 + TypeScript)
│   ├── main.tsx                 # App entry point
│   ├── App.tsx                  # Root component
│   ├── components/              # Reusable React components (Shadcn/UI + custom)
│   ├── pages/                   # Page components (routing via react-router)
│   ├── hooks/                   # Custom React hooks
│   ├── store/                   # react-query client + context
│   ├── styles/                  # Tailwind CSS v4 + global styles
│   └── types/                   # TypeScript type definitions (shared with server)
│
├── server/                      # Backend code (Express 4 + TypeScript)
│   ├── index.ts                 # Express server entry point
│   ├── db.ts                    # Unified database adapter (SQLite dev / PostgreSQL prod)
│   ├── routes/                  # API endpoint handlers
│   ├── middleware/              # Express middleware (auth, CORS, etc.)
│   ├── services/                # Business logic (TidyHQ, Gemini AI, Open-Meteo, etc.)
│   └── types/                   # TypeScript types (shared with client)
│
├── database/                    # Database setup & migrations
│   ├── schema.sql               # SQLite/PostgreSQL schema
│   └── migrations/              # Migration files (if using a tool)
│
├── public/                      # Static assets (served as-is)
│   ├── index.html               # HTML shell
│   ├── favicon.ico
│   └── images/                  # Logo, branding
│
├── scripts/                     # Utility scripts
│   ├── dev.ts                   # Run dev server (Vite + Express concurrently)
│   ├── build.ts                 # Build for production
│   └── seed.ts                  # (optional) Seed dev database
│
├── wiki/                        # Project brain (intra-session)
│   ├── README.md                # Wiki navigation guide
│   ├── index.md                 # Wiki table of contents
│   ├── 00-overview.md           # Project description, goals, scope
│   ├── 01-architecture.md       # Tech stack, structure, rationale
│   ├── 02-tasks.md              # Master task list (the plan)
│   ├── 03-decisions-log.md      # Why we made each significant choice
│   ├── 04-glossary.md           # Project-specific terms defined
│   ├── 05-file-map.md           # Where files live
│   ├── 06-deployment.md         # Deployment procedures and environment
│   ├── 07-credential-recovery.md # Emergency access recovery
│   ├── 08-deployment-guide.md   # Deployment runbooks
│   ├── 09-integrations.md       # External integrations (TidyHQ, Gemini, Open-Meteo, R2)
│   ├── 10-code-review-process.md # Subagent code review pipeline
│   ├── 11-codebase-areas-runbook.md # Codebase audit area runbook
│   ├── prompts/                 # Generated prompts for each task
│   │   ├── TASK-001.md
│   │   └── ...
│   ├── decisions/               # Detailed decision records
│   ├── future/                  # Future plans and proposals
│   └── skyhigh-*.md             # Additional SkyHigh-specific docs
│
├── memory/                      # Project memory (inter-session, not git-tracked)
│   ├── MEMORY.md                # Index of all memories
│   ├── user.md                  # User profile and working style
│   ├── project.md               # Project-specific context
│   ├── feedback.md              # Lessons from corrections
│   └── reference.md             # Links to external resources
│
├── tasks/                       # Task tracking for this session
│   ├── todo.md                  # Current tasks to work on
│   ├── remediation_plan.md      # Hardening tasks / security fixes
│   └── lessons.md               # Accumulated lessons (self-improvement)
│
├── .claude/                     # Claude Code settings
│   └── settings.json            # Hooks and permissions
│
├── .config/                     # Project config (env, secrets — not git-tracked)
├── .git/                        # Git repository metadata
├── uploads/                     # Dev file uploads (Cloudflare R2 in prod)
├── dist/                        # Build output (generated, not committed)
├── data/                        # Data files (e.g., seed data, fixtures)
└── z_RESUME_SESSION/            # Session state dumps (temp, not committed)
```

---

## Section 4: Session Start Protocol

**Every session, in this order:**

1. Read CLAUDE.md (Section 0 especially — project context)
2. Read .claude/settings.json — check what hooks, permissions, and env vars are configured
3. **Verify credentials have been drawn**: The automated 1Password `SessionStart` hook or shell profile trigger should have already run `draw-env.ps1` to populate your local gitignored `.env` file from your 1Password vault. Check that `.env` exists and contains secrets.
4. Read RESUME_HERE.md — understand where you left off
5. Read memory/MEMORY.md — load session history and feedback
6. Read tasks/todo.md — check what's queued for this session
7. Review memory/feedback.md — remember what corrections have been made
8. If wiki was substantially changed last session, skim wiki/README.md and wiki/02-tasks.md
9. Then ask: "What should we work on?"

**At session end:**
- **Securely wipe `.env` file**: The automated `SessionEnd` hook or shell profile trigger will run `wipe-env.ps1` to securely delete the `.env` file containing raw credentials from disk.
- Update RESUME_HERE.md with current state (where you left off, what's next)
- Update memory/feedback.md with any lessons learned this session
- Update memory/project.md if project scope/decisions changed
- Git commit with `[SESSION-SUMMARY]` if there were significant changes
- **Kill the dev server:** stop any processes on ports 3001 and 5173
  ```powershell
  Get-NetTCPConnection -LocalPort 3001,5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  ```

---

## Section 5: The Project Lifecycle

This project follows a strict lifecycle. Do not skip steps.

### Stage A — Initialization (run once, at project start)

When the user first runs you in a fresh project folder:

1. **Greet the user** and ask: *"Please give me a brief description of what you want to build."*
2. **Assess complexity** based on their answer:
   - **TIER 1 — TRIVIAL:** Single static page, no interactivity. Wiki: minimal. Tasks: ~3-5.
   - **TIER 2 — SIMPLE:** Interactive frontend, no backend. Wiki: light. Tasks: ~6-12.
   - **TIER 3 — MODERATE:** Frontend + simple backend OR complex frontend. Wiki: full. Tasks: ~12-20.
   - **TIER 4 — COMPLEX:** Full-stack with database, auth, multiple features. Wiki: full + phased. Tasks: 20+, organized into phases.
3. **Tell the user what tier you've assessed** and why. Confirm before proceeding.
4. **Generate a discovery prompt** and place it in `wiki/prompts/DISCOVERY.md`. This prompt will be a list of questions tailored to the project tier, designed to extract everything you need to plan the work. The user will paste it back to you in the next session (or now, if they prefer).
5. **Fill in Section 0 of this CLAUDE.md** with the project name, stack (if known), and initial focus
6. **Create memory/project.md** with the initial brief
7. **Stop and tell the user:** *"Open `wiki/prompts/DISCOVERY.md`, copy the prompt, and paste it back to me when you're ready. I'll then ask you the questions and build the task plan."*

### Stage B — Discovery (gather requirements)

When the user pastes the discovery prompt back:

1. **Ask the questions one at a time** (or in small grouped batches if related). Wait for answers before moving on.
2. **Capture answers** in `wiki/00-overview.md` and `wiki/01-architecture.md` as you go.
3. **Record decisions and their reasoning** in `wiki/03-decisions-log.md` whenever a meaningful choice is made.
4. **Update memory/project.md** with key learnings
5. **When discovery is complete**, summarize what you've learned and ask the user to confirm before moving to planning.

### Stage C — Planning (build the task list)

1. **Generate the full task list** in `wiki/02-tasks.md` using the format defined in Section 7.
2. **For each task, create a dedicated prompt file** in `wiki/prompts/TASK-XXX.md` containing:
   - The task ID and title
   - The full prompt to paste into a fresh Claude Code instance
   - Prerequisites (other task IDs that must finish first)
   - Expected outputs (what files should exist or change)
   - Verification steps (how to confirm the task worked)
3. **Update `RESUME_HERE.md`** with the current state.
4. **Create tasks/todo.md** with the high-level task list for this sprint
5. **Tell the user:** *"The plan is ready. You can either ask me to work through tasks sequentially, or copy individual task prompts into new Claude Code sessions."*

### Stage D — Execution (do the work)

For each task:

1. **Mark the task IN PROGRESS** in wiki/02-tasks.md (use emoji: 🔄)
2. **Read the task prompt** from wiki/prompts/TASK-XXX.md
3. **Do the work** — write code, update wiki, ask clarifying questions
4. **Verify the result** — run tests, check logs, manually test if needed (see Section 9)
5. **If something went wrong**, update memory/feedback.md with what you learned, then fix it
6. **Mark the task COMPLETE** in wiki/02-tasks.md (use emoji: ✅) and ONLY if verification passed
7. **Git commit** with message: `[TASK-XXX] Title of task` plus a brief description of what changed
8. **Update `RESUME_HERE.md`** with the current state (what was just done, what's next)

If a task is ambiguous or you're unsure, **ask the user** before starting. Never guess.

### Stage E — Resumption (come back after days/weeks away)

When you return to a paused project, follow Section 4 (Session Start Protocol), then:

1. **Read wiki/02-tasks.md** — what's the plan?
2. **Summarize what you understand** and ask: "Is this still the state? Has anything changed?"
3. **Wait for the user's confirmation**, then proceed to Stage D

---

## Section 6: RESUME_HERE.md Structure

`RESUME_HERE.md` is the continuity file. At the end of every session, update it so that when you wake up in a new session, you can pick up in under 30 seconds.

**Format:**
```
# RESUME_HERE — Last updated: YYYY-MM-DD HH:MM

## Project: [Project Name]
## Status: [Active / Paused / Complete]

## Where I left off
[One paragraph in plain English: what was just done, what's the immediate next step]

## Last completed task
- TASK-XXX: [Title] — completed [date]
- (or "None" if no tasks completed yet)

## Currently in progress
- TASK-XXX: [Title] — started [date], status: [details]
- (or "None")

## Next task to start
- TASK-XXX: [Title]
- Prompt location: `wiki/prompts/TASK-XXX.md`

## Open questions / blockers
- [Anything that needs the user's input or decision]
- (or "None")

## Quick context refresher
[2-3 sentences reminding the user of the project's current shape, key recent decisions, and what to mentally prepare for]
```

---

## Section 7: Task List Format in wiki/02-tasks.md

The master task list lives in `wiki/02-tasks.md`. Format:

```markdown
## Phase 1: [Phase Name]

### TASK-001: [Task Title]
- **Status:** ⬜ TODO / 🔄 IN PROGRESS / ✅ DONE / ⏸️ BLOCKED
- **Prerequisites:** TASK-XXX, TASK-YYY (or "None")
- **Estimated effort:** [hours or t-shirt size: S/M/L/XL]
- **Description:** [1-2 sentences of what this task is about]
- **Acceptance criteria:** [How do we know it's done?]

### TASK-002: [Task Title]
[same format]
...
```

---

## Section 8: Concurrency Rules

If you have multiple Claude Code instances open at the same time:

1. **Each instance works on a separate task** — no two instances should write to the same file at the same time
2. **Communicate via RESUME_HERE.md and wiki/02-tasks.md** — update these files last, and only after your work is verified
3. **If two instances both want to modify the same file, one instance should yield** — don't create merge conflicts
4. **Use git branches** if you're doing parallel work on different features (one branch per task)

---

## Section 9: Verification Discipline

A task is NOT complete until verified. Use these steps:

1. **Self-verification** (always)
   - Does the code compile/run?
   - Do existing tests still pass?
   - Did I test the happy path AND edge cases?
   - Did I update the wiki to reflect this change?
   - Would a staff engineer approve this code?

2. **Automated verification** (if applicable)
   - Run test suite: `npm test` or `yarn test`
   - Run type checker: `tsc` or similar
   - Run linter: `eslint`, `prettier`, etc.
   - Check build output for warnings

3. **Manual verification** (if tests can't cover it)
   - Open the app in browser and test the feature
   - Try the edge cases you can think of
   - Check the logs for errors or warnings
   - If you can't test it, mark the task "NEEDS REVIEW" and ask the user

4. **Wiki verification**
   - Did you update wiki/05-file-map.md if you added/deleted files?
   - Did you update wiki/03-decisions-log.md if you made architectural choices?
   - Is wiki/01-architecture.md still accurate?

Mark a task complete ONLY when all applicable verifications have passed.

---

## Section 10: Decision Capture

Every time you make a significant decision (tech choice, architecture, design pattern), record it.

**Format in wiki/03-decisions-log.md:**

```markdown
## DECISION-NNN: [Short title]
**Date:** YYYY-MM-DD  
**Context:** [Why did we need to decide this?]  
**Options considered:**
- Option A: [description, pros/cons]
- Option B: [description, pros/cons]
- Option C: [description, pros/cons]

**Chosen:** Option B  
**Rationale:** [Why Option B? What did we value?]  
**Reversibility:** [Easy to undo / Medium effort to change / Hard to reverse]  
**Blocked by:** [Any dependencies?]  
**Confirms:** [Any previous decisions this validates or overrides?]
```

These decisions are your justification later when someone asks "why did we do it this way?"

---

## Section 11: Wiki Maintenance

Every 5-10 tasks, audit the wiki:

1. **Check for drift** — does the wiki still reflect the actual codebase state?
2. **Check for clarity** — would a fresh reader understand this file?
3. **Check for staleness** — are there TODO or FIXME comments in the wiki?
4. **Check for orphans** — are there wiki files that are never linked to?
5. **Update or delete** accordingly

The wiki is a living document. Keep it clean and tight.

---

## Section 12: Self-Improvement (memory/feedback.md)

At the end of each session, if you received a correction from the user, add an entry to `memory/feedback.md`:

**Format:**
```markdown
## Lesson: [What did you learn?]
**Date:** YYYY-MM-DD  
**Context:** [What happened?]  
**Rule:** [What's the rule you should follow going forward?]  
**Apply when:** [When does this rule kick in?]  
**Why:** [Why is this rule important?]  
```

Read `memory/feedback.md` at the start of each session (per Section 4). Use these lessons to avoid repeating mistakes.

---

## Section 13: Git Hygiene

- **Commit messages**: Use `[TASK-XXX] Title` or `[WIKI] Description` or `[SESSION-SUMMARY] Brief summary`
- **Commit frequency**: After each completed task verification, make a commit
- **Never commit**: .env files, secrets, passwords, API keys, node_modules/, dist/, .DS_Store
- **Branch strategy**: 
  - `main` — always working, always tested
  - One branch per TIER 4 phase or major feature (optional for TIER 1-3)
  - Delete branches after merge
- **Push only when**: All tasks in the batch are complete, tested, and verified

---

## Section 14: The Smoke Test

Use this to verify the template is working:

1. Read CLAUDE.md (this file) — check you understand your role
2. Open wiki/README.md — navigate through the wiki structure
3. Confirm Section 0 still has placeholder text (template is uninitialized)
4. If the project is git-initialized, run `git status` to confirm `.gitignore` is working (`memory/` should not be tracked). Skip this if not yet a git repo.
5. Ask: *"What should we build?"* and wait for a project description
6. Proceed to Stage A (Initialization)

If you can do all steps without errors, the template is working.

---

## Section 15: Tone & Communication

- **Be plain.** Avoid jargon. When you must use technical terms, define them in wiki/04-glossary.md.
- **Be honest.** If something failed or you're unsure, say so. Don't hide errors.
- **Ask one question at a time.** Batch related questions, but don't overwhelm the user with 10 questions at once.
- **Show your work.** When you make a decision, explain your reasoning in the wiki or commit message.
- **Assume competence.** The user understands code and architecture. You don't need to explain basic concepts.

---

## Section 16: Subagent Delegation

If the project requires parallel work, you can spawn specialized agents:

- **ARCHITECT agent** (.agents/ARCHITECT.md): 
  - Produces high-level designs and specs
  - Never writes code directly
  - Hands off to CODER with detailed plans
  - When to use: *"We need to rethink the auth flow design"*

- **CODER agent** (.agents/CODER.md):
  - Implements from ARCHITECT specs
  - Writes tests and code
  - Cannot make architecture decisions unilaterally
  - When to use: *"Implement the spec from ARCHITECT; I need this feature finished in parallel"*

- **REVIEWER agent** (.agents/REVIEWER.md):
  - Performs security-first code review
  - Checks test coverage and logic
  - Never writes code
  - When to use: *"Review this PR for security, coverage, and quality issues"*

**When to use agents:**
- You're context-swamped (too many tasks to track mentally)
- One task is truly independent and can run in parallel
- You need a fresh perspective on code you've been working on
- A PR needs review while you continue coding

**How to hand off:**
1. Copy the relevant task prompt from wiki/prompts/TASK-XXX.md
2. Paste it to the agent with their role file (e.g., ARCHITECT.md) prepended
3. The agent reads their role file and the task prompt
4. You get their output; integrate it back

---

## Section 17: How-To References

The files in `C:\Users\User\Documents\CodeFolder\.agents\skills\` are **manual workflow checklists for the user** — not invokable Claude Code slash commands. They live as reference docs you can open and follow when you want a structured approach to a recurring task. Each one captures a workflow you can paste into a chat or follow step-by-step yourself.

**Shared Skills Library** (available across all projects):
- UI/UX design, SEO audit, deep research, content creation, photo editing, and more
- Located at: `CodeFolder\.agents\skills\`
- Available to any Claude Code session on any project
- Example: `CodeFolder\.agents\skills\ui-ux-pro-max\SKILL.md`

These are how-tos. Typing `/fix-bug` etc. in Claude Code will not invoke them — open the file and follow it.

---

## Section 18: Autonomous Code Audit Pipeline

The project uses a **pi-subagents autonomous pipeline** to audit and fix code in 10 manageable areas. This runs via the `pi` CLI, not Claude Code.

**Quick reference:**
- **Wiki runbook:** `wiki/11-codebase-areas-runbook.md` — all 10 areas with copy-paste commands
- **Task files:** `tasks/run-area-N-robust.md` — detailed JSON chain instructions
- **Output artifacts:** `worker/` — scout findings, fix plans, worker summaries, reviewer reports
- **Model:** `deepseek/deepseek-v4-flash` (orchestrator + all subagents) via direct DeepSeek API key
- **Pipeline:** scout → planner → worker → 2× parallel reviewers

**Completed areas:**
- ✅ Area 1 (Databases & Migrations) — 3 clean passes, all verified

**Known infrastructure fixes applied (see db.ts):**
- Migration v6 semicolon-in-JSON bug fixed (state-machine based SQL splitter)
- Migration v12 nested transaction bug fixed (PL/pgSQL DO blocks stripped)
- Migration v14+ PG-specific JSON errors gracefully skipped
- Old user agent definitions deleted (builtin subagent agents now have full tool access)
- Duplicate subagent extension directory removed

**To run the full automated audit:**
```powershell
pi --model deepseek/deepseek-v4-flash "Read and execute ~/.pi/agent/tasks/master-orchestrator.md"
```

**To run a single area manually**:
1. Open a **fresh PowerShell** window
2. `cd SkyHigh`
3. `pi --model deepseek/deepseek-v4-flash "Please read and execute the instructions in tasks/run-area-N-robust.md."`

---

## Section 19: First-Run Behavior

**If the wiki/ folder is empty:** You're in Stage A (Initialization). Follow the initialization protocol above.

**If the wiki/ folder has content:** You're resuming a project. Follow the resumption protocol (Stage E) above.

---

## Final Thoughts

This project is a collaboration between you and the user. The wiki and memory are your tools to stay coherent over time. The lifecycle stages keep you organized. The verification discipline keeps the code quality high. The lessons captured in memory/feedback.md prevent regressions.

You've got this. Now go build something great.
