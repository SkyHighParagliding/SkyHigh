# SkyHigh Reorganization Plan — Align with Project-Template Standard

## Investigation Summary

SkyHigh's CLAUDE.md is a **valid derivative** of the Project-Template CLAUDE.md. Sections 0-16 are structurally intact with three minor customizations:

| Section | Template | SkyHigh | Verdict |
|---|---|---|---|
| 17 | "Skills (Auto-Triggered Workflows)" | "How-To References" | Customized — SkyHigh has no `.claude/skills/`, describes CodeFolder `.agents/skills/` instead |
| 18 | "First-Run Behavior" | "Autonomous Code Audit Pipeline" | Inserted — new section for audit pipeline |
| 19 | _(doesn't exist)_ | "First-Run Behavior" | Shifted — renumbered from 18 |

**CLAUDE.md is good.** No rewrite needed. Only minor path corrections in Section 2 and Section 18.

The real problem is the **folder structure**: the wiki content is in the wrong place.

---

## Problems Found

### 🔴 Critical: Wiki content at wrong location

| What | Where it is | Where it should be |
|---|---|---|
| All wiki pages (`00-overview.md` through `07-*.md`) | `SkyHigh/SkyHigh/` | `SkyHigh/wiki/` |
| Wiki README, index, .obsidian, future/ | `SkyHigh/SkyHigh/` | `SkyHigh/wiki/` |
| SkyHigh-specific pages (`skyhigh-*.md`) | `SkyHigh/SkyHigh/` | `SkyHigh/wiki/` |

The `SkyHigh/wiki/` directory exists but has only 1 file: `smart-search-test-questions.md`.

### 🔴 Critical: SkyHigh pages in shared LLM wiki

| File | Current location | Should be |
|---|---|---|
| `07-code-review-process.md` | `Claude_LLM_Wiki/wiki/` | `SkyHigh/wiki/` |
| `08-codebase-areas-runbook.md` | `Claude_LLM_Wiki/wiki/` | `SkyHigh/wiki/` |

### 🟡 Medium: Duplicate `07-` prefix

Three files in the nested wiki share the `07-` prefix:
- `07-credential-recovery.md`
- `07-deployment-guide.md`
- `07-integrations.md`

### 🟡 Medium: Missing standard directories

| Missing | In template? | Impact |
|---|---|---|
| `.agents/` (ARCHITECT.md, CODER.md, REVIEWER.md, skills/) | Yes | Section 16 references these |
| `.claude/settings.json` | Yes | Section 4 step 2 reads it |
| `wiki/prompts/` | Yes | Stage C references it |
| `wiki/decisions/` | Yes | Section 10 references it |

### 🟢 Low: CLAUDE.md path references

- Section 2 references `wiki/` correctly (will work after files move)
- Section 3 Canonical Structure says `06-integrations.md` but actual file is `06-deployment.md`
- Section 18 references `Claude_LLM_Wiki/wiki/08-codebase-areas-runbook.md` — should point to project wiki

### 🟢 Low: Orphan temp directory
- `C:UsersUserAppDataLocalTemppi-subagents-user-Userchain-runsacdea34e` in project root — delete

---

## Plan (6 Steps)

### Step 1: Merge nested wiki into correct location

**Action:** Move all content from `SkyHigh/SkyHigh/` into `SkyHigh/wiki/`.

```
FROM: SkyHigh/SkyHigh/              TO: SkyHigh/wiki/
├── 00-overview.md                  ├── 00-overview.md
├── 01-architecture.md              ├── 01-architecture.md
├── 02-tasks.md                     ├── 02-tasks.md
├── 03-decisions-log.md             ├── 03-decisions-log.md
├── 04-glossary.md                  ├── 04-glossary.md
├── 05-file-map.md                  ├── 05-file-map.md
├── 06-deployment.md                ├── 06-deployment.md               (keep as-is)
├── 07-credential-recovery.md       →  ├── 07-credential-recovery.md   (keep 07-)
├── 07-deployment-guide.md          →  ├── 08-deployment-guide.md      (renumber)
├── 07-integrations.md              →  ├── 09-integrations.md          (renumber)
├── README.md                       ├── README.md
├── index.md                        ├── index.md
├── .obsidian/                      ├── .obsidian/
├── future/                         ├── future/
├── skyhigh-foundation.md           ├── skyhigh-foundation.md
├── skyhigh-legacy-index.md         ├── skyhigh-legacy-index.md
├── skyhigh-parallel-workstreams.md ├── skyhigh-parallel-workstreams.md
├── skyhigh-workstream-a1-auth.md   ├── skyhigh-workstream-a1-auth.md
├── skyhigh-workstream-template.md  ├── skyhigh-workstream-template.md
├── skyhigh_weather_apis.md         ├── skyhigh_weather_apis.md
└── Cloudflare Keys.png             ├── Cloudflare Keys.png
                                    └── smart-search-test-questions.md (already there)
```

Keep `smart-search-test-questions.md` — it's legitimate SkyHigh content already in `wiki/`.

**Then:** Delete the empty `SkyHigh/SkyHigh/` directory.

### Step 2: Move SkyHigh pages from shared wiki

**Action:** Move two files from `Claude_LLM_Wiki/wiki/` to `SkyHigh/wiki/`:

```
FROM: Claude_LLM_Wiki/wiki/        TO: SkyHigh/wiki/
├── 07-code-review-process.md       →  10-code-review-process.md       (first available number)
└── 08-codebase-areas-runbook.md    →  11-codebase-areas-runbook.md
```

Update the shared wiki index (`Claude_LLM_Wiki/wiki/index.md`) — remove the `[[08-codebase-areas-runbook]]` link.

### Step 3: Fix internal wiki cross-references

After moving and renumbering, update:
- `wiki/index.md` — update links to `08-deployment-guide.md` and `09-integrations.md`
- `wiki/README.md` — update navigation to reflect new file names
- Any `[[wiki-links]]` or relative paths that reference old file names
- `skyhigh-foundation.md` and other pages — scan for `[[07-deployment-guide]]` style links

### Step 4: Create missing standard directories and files

Copy from `CodeFolder/Project-Template/` to `SkyHigh/`:

```
FROM: Project-Template/              TO: SkyHigh/
├── .agents/ARCHITECT.md             →  .agents/ARCHITECT.md
├── .agents/CODER.md                 →  .agents/CODER.md
├── .agents/REVIEWER.md              →  .agents/REVIEWER.md
├── .agents/skills/fix-bug.md        →  .agents/skills/fix-bug.md
├── .agents/skills/review-pr.md      →  .agents/skills/review-pr.md
├── .agents/skills/sync-memory.md    →  .agents/skills/sync-memory.md
├── .claude/settings.json            →  .claude/settings.json
├── wiki/prompts/                    →  wiki/prompts/ (empty directory)
└── wiki/decisions/                  →  wiki/decisions/ (empty directory)
```

### Step 5: Fix CLAUDE.md references

Three targeted edits:

1. **Section 2 (Wiki Files list):** Update to list actual files:
   - Add `06-deployment.md` (instead of `06-integrations.md`)
   - Add the renumbered pages: `07-credential-recovery.md`, `08-deployment-guide.md`, `09-integrations.md`, `10-code-review-process.md`, `11-codebase-areas-runbook.md`

2. **Section 3 (Canonical Folder Structure):** Update wiki subtree to match reality:
   - Change `06-integrations.md` → `06-deployment.md`
   - Add the additional numbered pages
   - Add `prompts/` and `decisions/` directories

3. **Section 18 (Audit Pipeline):** Update references:
   - `Claude_LLM_Wiki/wiki/08-codebase-areas-runbook.md` → `wiki/11-codebase-areas-runbook.md`
   - `SkyHigh/tasks/` → `tasks/` (relative path)
   - `SkyHigh/worker/` → `worker/` (relative path)

### Step 6: Cleanup

- Delete orphan temp directory: `C:UsersUserAppDataLocalTemppi-subagents-user-Userchain-runsacdea34e`
- Verify `.gitignore` includes `worker/` (added in earlier session — confirm)
- Run `git status` to verify no unexpected changes

---

## Final SkyHigh Structure (target)

```
SkyHigh/
├── CLAUDE.md                       ✅ Updated
├── RESUME_HERE.md                   ✅ Already correct
├── .claude/
│   ├── settings.json                ✅ New (from template)
│   └── settings.local.json          ✅ Already exists
├── .agents/
│   ├── ARCHITECT.md                 ✅ New (from template)
│   ├── CODER.md                     ✅ New (from template)
│   ├── REVIEWER.md                  ✅ New (from template)
│   └── skills/                      ✅ New (from template)
├── wiki/
│   ├── README.md                    ✅ From nested SkyHigh/
│   ├── index.md                     ✅ From nested SkyHigh/
│   ├── .obsidian/                   ✅ From nested SkyHigh/
│   ├── 00-overview.md               ✅ From nested SkyHigh/
│   ├── 01-architecture.md           ✅ From nested SkyHigh/
│   ├── 02-tasks.md                  ✅ From nested SkyHigh/
│   ├── 03-decisions-log.md          ✅ From nested SkyHigh/
│   ├── 04-glossary.md               ✅ From nested SkyHigh/
│   ├── 05-file-map.md               ✅ From nested SkyHigh/
│   ├── 06-deployment.md             ✅ From nested SkyHigh/
│   ├── 07-credential-recovery.md    ✅ From nested SkyHigh/ (kept 07)
│   ├── 08-deployment-guide.md       ✅ Renumbered from 07-
│   ├── 09-integrations.md           ✅ Renumbered from 07-
│   ├── 10-code-review-process.md    ✅ Moved from shared wiki
│   ├── 11-codebase-areas-runbook.md ✅ Moved from shared wiki
│   ├── skyhigh-foundation.md        ✅ From nested SkyHigh/
│   ├── skyhigh-legacy-index.md      ✅ From nested SkyHigh/
│   ├── skyhigh-parallel-workstreams.md     ✅ From nested SkyHigh/
│   ├── skyhigh-workstream-a1-auth.md       ✅ From nested SkyHigh/
│   ├── skyhigh-workstream-template.md      ✅ From nested SkyHigh/
│   ├── skyhigh_weather_apis.md             ✅ From nested SkyHigh/
│   ├── smart-search-test-questions.md      ✅ Already in wiki/
│   ├── Cloudflare Keys.png          ✅ From nested SkyHigh/
│   ├── prompts/                     ✅ New (empty, from template)
│   ├── decisions/                   ✅ New (empty, from template)
│   └── future/                      ✅ From nested SkyHigh/
├── memory/                          ✅ Already correct
├── tasks/                           ✅ Already correct
├── worker/                          ✅ Already correct
└── ... (source code, configs unchanged)
```

After Step 2, DELETE:
- `SkyHigh/SkyHigh/` (empty after move)
- `SkyHigh/C:UsersUserAppDataLocalTemppi-subagents-user-Userchain-runsacdea34e` (orphan)
- `Claude_LLM_Wiki/wiki/07-code-review-process.md` (moved)
- `Claude_LLM_Wiki/wiki/08-codebase-areas-runbook.md` (moved)

After Step 5, UPDATE:
- `Claude_LLM_Wiki/wiki/index.md` — remove `[[08-codebase-areas-runbook]]` link

---

## What This Does NOT Change

- Source code, configs, package.json — untouched
- `memory/` files — already correct
- `RESUME_HERE.md` — already correct
- `.git/` — untouched
- `tasks/todo.md` and audit task files — untouched
- `worker/` artifacts — untouched

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| `git mv` loses file history | Low | Use `git mv` for moves; git tracks renames |
| Wiki cross-references break | Medium | Step 3 explicitly scans and updates all `[[links]]` |
| Duplicate filenames collide | Low | All sources have unique names after renumbering |
| `07-` prefix ambiguity remains | Low | After renumbering, only `07-credential-recovery.md` retains `07-` — others get sequential numbers |
| Shared wiki has other SkyHigh references | Low | Only 2 files found; both are being moved |
