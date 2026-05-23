# Multi-Agent Code Review — How To Guide

> **What this does:** Runs 5 specialized code reviewers → 1 coordinator who validates findings → 1 fixer who implements fixes → repeats up to 5 cycles until errors drop 90%.

> **SAFETY:** Nothing pushes to GitHub. Git hooks block all push attempts automatically.

---

## ONE-TIME SETUP (Already Done ✅)

- ✅ 7 review skills installed in `.pi/skills/`
- ✅ Git pre-push hook installed (blocks ALL pushes automatically)
- ✅ Review output directory `.pi/reviews/` created
- ✅ No extra packages or dependencies required

---

## STEP-BY-STEP: RUNNING A REVIEW CYCLE

### Where to run this

Open a terminal in:
```
cd C:\Users\User\Documents\CodeFolder\skyhigh
```

### Cycle 1 — First Pass

**Step 1: Run the 5 reviewers** (one at a time). Each takes 2–15 minutes depending on what it reads.

```bash
# Reviewer 1: Bugs & Logic Errors
pi /skill:review-bugs

# Reviewer 2: Code Duplication
pi /skill:review-duplication

# Reviewer 3: Security
pi /skill:review-security

# Reviewer 4: Performance
pi /skill:review-performance

# Reviewer 5: Dual-DB Compatibility (SQLite vs PostgreSQL)
pi /skill:review-database
```

Each reviewer writes a report to `.pi/reviews/cycle-1-*.md`.

**Step 2: Run the Coordinator** (reads all 5 reports, validates findings, produces a fix plan)

```bash
pi /skill:review-coordinator
```

The coordinator writes `.pi/reviews/cycle-1-plan.md` with a prioritized list of fixes. Review it — it shows what was validated, what was rejected, and what gets fixed.

**Step 3: Run the Fixer** (implements the plan, shows you each change BEFORE applying)

```bash
pi /skill:review-fixer
```

The fixer works through each item one-by-one:
1. Shows you the current code and the proposed fix
2. Waits for your approval (say "yes", "skip", or "no")
3. Applies approved fixes
4. Runs TypeScript compilation check (`tsc --noEmit`) to verify nothing breaks
5. Reports success or rollback for each item

**Step 4: Local git commit (optional but recommended)**

```bash
git add .
git commit -m "[review] checkpoint before cycle N fixes"
```

**NEVER run `git push`.** The pre-push hook will block it with an error message.

---

### Cycle 2+ — Full Codebase Sweeps

From cycle 2 onward, all reviewers read the **entire codebase** (not just scoping).

```bash
# Run all 5 reviewers again
pi /skill:review-bugs
pi /skill:review-duplication
pi /skill:review-security
pi /skill:review-performance
pi /skill:review-database

# Coordinator re-validates
pi /skill:review-coordinator

# Fixer implements remaining items
pi /skill:review-fixer

# Local checkpoint
git add .
git commit -m "[review] checkpoint after cycle 2 fixes"
```

---

## WHEN TO STOP

The system stops when:

- **Condition A:** Total findings in current cycle ≤ 10% of Cycle 1 findings, OR
- **Condition B:** You've run 5 cycles (hard limit)

Example: If Cycle 1 found 50 findings, stop when Cycle 3 finds 5 or fewer.

---

## WHAT TO LOOK AT AFTER EACH CYCLE

| File | What it contains |
|------|-----------------|
| `.pi/reviews/cycle-N-bugs.md` | Bugs found by Bug reviewer |
| `.pi/reviews/cycle-N-duplication.md` | Duplicated code found |
| `.pi/reviews/cycle-N-security.md` | Security vulnerabilities found |
| `.pi/reviews/cycle-N-performance.md` | Performance issues found |
| `.pi/reviews/cycle-N-database.md` | SQLite vs PostgreSQL issues found |
| `.pi/reviews/cycle-N-plan.md` | Coordinator's validated fix plan |
| `.pi/reviews/cycle-N-fix-report.md` | What the fixer changed (and what was skipped) |

---

## IMPORTANT NOTES

### The "Show Before Apply" Mode
The fixer shows you every change and waits for your approval. It will:
- Display the current code
- Display the proposed new code
- Explain why the fix is needed
- Wait for you to say "yes", "skip", or "no"

### No Push Safety
Three layers of protection:
1. **Pre-push hook** (`~/.git/hooks/pre-push`) — blocks `git push` with an error message. Always active.
2. **Skill instructions** — every skill file explicitly says "no git push" at the top
3. `.pi/AGENTS.md` — project-level context file loaded by Pi, reiterates the rule

### Dual-DB Focus
The 5th reviewer (`review-database`) specifically hunts for:
- Parameter syntax mismatches (`?` vs `$1`)
- Type coercion gaps (SQLite is permissive, PostgreSQL is strict)
- Schema drift between your 53 SQLite migrations and 22 PostgreSQL migrations
- Adapter bypasses (code that uses SQLite OR PostgreSQL directly instead of going through `server/db.ts`)

This is your #1 production risk. Pay special attention to the database reviewer's findings.

---

## QUICK REFERENCE: ALL COMMANDS

```bash
# Navigate to project
cd C:\Users\User\Documents\CodeFolder\skyhigh

# --- CYCLE N ---
pi /skill:review-bugs
pi /skill:review-duplication
pi /skill:review-security
pi /skill:review-performance
pi /skill:review-database
pi /skill:review-coordinator
pi /skill:review-fixer
git add .
git commit -m "[review] cycle N checkpoint"

# --- CHECK RESULTS ---
# Read review files in .pi/reviews/

# --- DECIDE: continue to next cycle or stop? ---
# If findings dropped 90%+ from cycle 1, STOP
# If you've run 5 cycles, STOP
# Otherwise, repeat cycle N+1
```

---

## COST ESTIMATE (per cycle with Qwen 3.5 via OpenRouter)

With Qwen 3.5, these skills are very cheap because Qwen uses a fraction of a cent per 1K tokens. Each cycle reads through the entire codebase 5+ times (once per reviewer), but with Qwen's pricing, expect roughly:

| Component | Estimated cost per run |
|-----------|----------------------|
| Bug reviewer | $0.10 – $0.30 |
| Duplication reviewer | $0.10 – $0.30 |
| Security reviewer | $0.10 – $0.30 |
| Performance reviewer | $0.10 – $0.30 |
| Database reviewer | $0.10 – $0.30 |
| Coordinator | $0.05 – $0.15 |
| Fixer | $0.10 – $0.50 (depends on number of fixes) |
| **Total per cycle** | **$0.65 – $2.20** |
| **5 cycles total** | **$3.25 – $11.00** |

These are rough estimates. Qwen's pricing depends on token count, which varies by how much code the reviewers read.

---

*Last updated: 2026-05-23. This guide is for SkyHigh project in C:\Users\User\Documents\CodeFolder\skyhigh\.*
