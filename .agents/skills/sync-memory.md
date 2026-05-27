# Sync Memory — How-To Reference

This is a manual workflow checklist (not an invokable slash command). Open it at the end of a session if you want to consolidate learnings into project memory and optionally promote general patterns to the LLM wiki.

**How to use:** Walk through the steps below at session end. Skip steps that don't apply (e.g., no corrections happened → skip feedback update).

---

## Workflow

When invoked (typically at session end):

### 1. Extract Session Learnings

Review the session and identify:

**Lessons Learned (mistakes or corrections)**
```
- What rule did the user give you?
- What pattern worked really well?
- What mistake did you make and how to avoid it?
```

**Project Context Changes**
```
- Did the project scope change?
- Were major decisions made?
- Is the priority different now?
```

**Feedback from User**
```
- How did the user correct your approach?
- What did they appreciate that you should repeat?
```

### 2. Update Project Memory Files

**Update `memory/feedback.md`**  
If the user gave you a rule or correction:
```
## Lesson: [One-line rule]
**Date:** YYYY-MM-DD  
**Context:** [What happened?]  
**Rule:** [What should you do going forward?]  
**Apply when:** [When does this apply?]  
**Why:** [Why is this important?]
```

**Update `memory/project.md`**  
If project direction/scope changed:
```
**[YYYY-MM-DD]:** [Brief description of what changed and why]
```

**Update `memory/MEMORY.md`**  
Update the "Quick Memory Snapshot" section with current status.

### 3. Offer to Sync to LLM Wiki

If you learned something **general** (not project-specific), offer:

> "I learned a pattern that might be useful across projects: [pattern description]. Should I add this to the LLM wiki at `C:\Users\User\Claude_LLM_Wiki\wiki\`?"

Examples of things worth syncing:
- ✅ New security patterns you discovered
- ✅ Effective debugging techniques
- ✅ Architecture patterns that worked well
- ✅ Tech stack insights or trade-offs
- ❌ Project-specific decisions (stay in project memory)
- ❌ Personal preferences (stay in user.md)

### 4. Sync If Approved

If the user approves:
1. Read the relevant wiki page (or create a new one)
2. Add or update the pattern
3. Update wiki/index.md to point to the new/updated page
4. Update wiki/log.md with the change

---

## Example

**Session Summary:**
```
Today we:
- Fixed a SQL injection vulnerability (parameterized queries)
- Learned that mocking the database in tests causes production mismatches
- Decided to always use integration tests with real DB
- User corrected me on committing without verifying tests pass first
```

**Memory Updates:**

`memory/feedback.md`:
```
## Lesson: Always run existing tests before implementing new features
**Date:** 2026-05-03  
**Context:** I started implementing a feature without running tests first. This caused me to miss that an existing test broke.  
**Rule:** Before starting work, run the full test suite and ensure it passes.  
**Apply when:** Every new session, start of work on any feature  
**Why:** Tests are the source of truth. Missing test failures earlier means finding them later in the user's hands.
```

`memory/project.md`:
```
**[2026-05-03]:** Switched from mocked DB tests to integration tests. Discovered that mocks were hiding SQL injection vulnerabilities. All future tests use real DB.
```

**LLM Wiki Offer:**
> "I discovered that mocking databases in tests can hide real-world issues (we found an SQL injection vulnerability in mocks that would've caught otherwise). Should I add a pattern page to the LLM wiki about test-driven database testing?"

---

## Rules

- **Extract the meta-lesson** — not just what happened, but why it matters
- **Be specific** — link to exact files or moments when relevant
- **Distinguish project vs. general** — project memories stay local; general patterns go to wiki
- **Update consistently** — sync at the end of substantial sessions, not just tiny tweaks
- **Respect the structure** — use the templates in memory/ files

---

## What Gets Synced Where

| Type | Where | Who | When |
|------|-------|-----|------|
| Project-specific decision | memory/project.md | Local session | After decision |
| User feedback / rule | memory/feedback.md | Local session | After correction |
| General pattern | LLM wiki | Optionally | End of session |
| User preferences | memory/user.md | Local session | Rarely (fairly stable) |

---

See `../../CLAUDE.md` Section 17 for context on how-to references.
