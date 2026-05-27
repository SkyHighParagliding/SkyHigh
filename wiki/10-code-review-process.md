# Subagent Code Review & Fix Process

This guide replaces the legacy `.pi/skills/` batch-review system. 

## Why the Old System Failed
The legacy system failed because it instructed AI agents to "read the entire codebase" to find bugs. Due to context window limits, the agents would randomly sample different files each cycle, leading to "new" bugs being discovered forever. Additionally, the old `review-fixer` was instructed to make the "smallest change possible," causing it to silently skip critical fixes like npm package installations and database migrations, which resulted in repeating errors and regressions.

## The New Subagent Strategy
We now use `pi-subagents` and `pi-intercom` to execute **focused, orchestrator-led workflows**. The orchestrator (the parent AI) manages the context, targets specific areas, and directly supervises the worker.

### Core Principles
1. **Never scan the whole app.** Pick a specific directory or module per session.
2. **One writer at a time.** Use parallel agents only for reading/reviewing. Use a single `worker` for writing.
3. **Never skip hard tasks.** The worker is allowed to write DB migrations or install packages. If it is unsure, it will use the `intercom` to ask the user.
4. **Verify before moving on.** Fresh reviewers must validate the worker's changes before the task is marked done.
5. **Track Objective Metrics.** We record hard metrics before and after each area to prove the codebase is improving, rather than relying on AI opinions.

---

## The 10-Area Runbook

The full codebase is split into 10 manageable areas. Each area has its own task file at `tasks/run-area-N-robust.md` and a copy-paste ready command.

👉 See the complete runbook: [[11-codebase-areas-runbook]]

---

## Measuring Progress (The Metrics)

To ensure we are not just spinning our wheels, we track these 4 metrics for every Area we review:

1. **Scope-Locked Issue Count:** The number of known bugs in the targeted folder *before* we start vs. *after* we finish.
2. **TypeScript Compiler Pass Rate:** Running `tsc --noEmit` before and after to ensure the worker didn't introduce typos or broken imports.
3. **Database Schema Parity:** Ensuring 100% parity between SQLite and PostgreSQL schemas (crucial for backend areas).
4. **Worker vs. Reviewer Rejection Rate:** Tracking how many times the Reviewers caught a mistake and forced the Worker to try again.

*A Verification Report (e.g., `tasks/Area-1-Verification-Report.md`) is generated for every area to record these metrics.*

---

## The Autonomous Hybrid-Model Workflow

If you want the parent AI to run the process autonomously, use this robust setup. It utilizes a 5-agent team to autonomously audit and fix database migrations and code. 

**Model Strategy:** We use a fast Orchestrator to manage the team, and we use **DeepSeek V4 Pro** (`deepseek/deepseek-v4-pro`) directly via your DeepSeek API key for the heavy lifting (Scout, Planner, Worker, and Reviewers) because of its elite native coding and reasoning capabilities.

### How to Start an Autonomous Area

**Step 1: Open a Fresh Terminal**
Close any existing Pi terminals to ensure the system memory buffer is completely clear (this prevents Node.js `STATUS_STACK_BUFFER_OVERRUN` errors when launching complex subagent chains). Open a brand new PowerShell window and navigate to your project:
```powershell
cd C:\Users\User\Documents\CodeFolder\SkyHigh
```

**Step 2: Create the Robust Instruction File**
Create an instruction file (e.g., `tasks/run-area-1-robust.md`) with the exact JSON chain constraints. 
*Critically, you must set `"context": "fresh"` to prevent memory buffer crashes, and you must explicitly disable the intercom so reviewers don't hang infinitely waiting for a supervisor.*

**Contents of `tasks/run-area-1-robust.md`:**
```markdown
# Autonomous Hybrid-Model Workflow: Area 1

Please take control and run the full pipeline for Area 1 using the `subagent` tool.

**CRITICAL STABILITY RULES FOR ORCHESTRATOR:**
1. You MUST set `"context": "fresh"` at the top level of your `subagent` tool call to prevent Windows/Node.js memory buffer crashes. 
2. The intercom is OFF-LIMITS. You must instruct all subagents (scout, planner, worker, reviewers) that they MUST NOT use `intercom` or `contact_supervisor`. They must output their work directly to files in the `worker/` directory and exit cleanly.

**The Pipeline (Launch this using `subagent` tool):**
You must call the `subagent` tool EXACTLY with this JSON structure. Do not deviate.

```json
{
  "context": "fresh",
  "chain": [
    {
      "agent": "scout",
      "model": "deepseek/deepseek-v4-pro",
      "task": "Use the read or bash tools to thoroughly read server/migrations/ and server/pg_migrations/. Compare them to find any remaining schema mismatches between SQLite and Postgres. Check server/pgDb.ts for any unhandled SQL syntax conversions. YOU MUST use the write tool to save your exact findings to worker/scout-findings.md."
    },
    {
      "agent": "planner",
      "model": "deepseek/deepseek-v4-pro",
      "task": "Use the read tool to read worker/scout-findings.md. If bugs exist, use the write tool to save a strict step-by-step fix plan to worker/fix-plan.md. If no bugs exist, use the write tool to save a summary stating 'All clear'."
    },
    {
      "agent": "worker",
      "model": "deepseek/deepseek-v4-pro",
      "task": "Use the read tool to read worker/fix-plan.md. If there are fixes, use the edit tool to apply them to the codebase. YOU MUST use the write tool to save a summary of actions taken (or confirm everything is clean) to worker/worker-summary.md."
    },
    {
      "parallel": [
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-pro",
          "task": "Review the codebase for Schema Parity. YOU MUST use the write tool to save your report to worker/review-schema.md."
        },
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-pro",
          "task": "Review server/pgDb.ts for SQL Syntax accuracy. YOU MUST use the write tool to save your report to worker/review-sql.md."
        }
      ]
    }
  ]
}
```

**Step 3: Start the Orchestrator**
Launch the `pi` coding agent using **DeepSeek V4 Flash** as the fast, cheap Orchestrator:
*(Note: Do not use `-c` so we start with a clean session history).*
```powershell
pi --model deepseek/deepseek-v4-flash
```

**Step 4: Issue the Execution Prompt**
Once the Pi interface loads, pass the file to the orchestrator:
> "Please read and execute the instructions in `tasks/run-area-1-robust.md`."

**Step 5: Monitor & Review**
The Orchestrator will read the file and immediately launch the subagent team using the Qwen Max model.
*(Tip: Press `Ctrl+O` while the chain is running to open the live detail view and watch Qwen Max's internal thoughts and terminal commands in real-time.)*

Once the Orchestrator announces the process is complete, check the `worker/` folder in your code editor to read their reports and verify the code changes they made.

---

## The Manual Step-by-Step Prompts

When you want to fix bugs in a specific area (e.g., `server/routes/`), paste these prompts to the parent agent one by one.

### Step 1: Targeted Clarification & Scouting
*Use this to map the exact files in a small area and compare them against known issues (like the Cycle 4 reports).*

**Prompt to copy:**
> "We are starting a focused code review and fix cycle. Today, we are ONLY targeting the `server/routes/` directory. 
> 
> Please read the relevant sections of `cycle-4-bugs.md`, `cycle-4-security.md`, and `cycle-4-database.md` in `.pi/reviews/` to see what was previously reported for `server/routes/`. 
> 
> Then, use the `subagent` tool to launch a `scout`. Tell the scout to read the actual files in `server/routes/` to verify which of those reported issues are real and still exist. Have the scout output its findings to `plans/routes-scout-report.md`."

---

### Step 2: Planning the Fixes
*Use this to turn the scout's raw findings into a concrete action plan.*

**Prompt to copy:**
> "Now that we have the scout's report, use the `subagent` tool to launch a `planner`. 
> 
> Give the planner the `plans/routes-scout-report.md`. Instruct the planner to write a step-by-step fix plan and save it to `plans/routes-fix-plan.md`. 
> 
> **Important instructions for the planner:** 
> - Do not avoid hard fixes. 
> - If an npm package (like `sanitize-html`) is needed for XSS, include it in the plan. 
> - If database schemas mismatch, include creating new `.sql` migrations for both SQLite and PostgreSQL. 
> - Do not write the code yet, just write the plan."

---

### Step 3: Execution (The Single Worker)
*Use this to actually write the code. The worker runs in the background. If it gets stuck, it will ping you on the intercom.*

**Prompt to copy:**
> "Please use the `subagent` tool to launch an async `worker`. 
> 
> Pass it the `plans/routes-fix-plan.md`. 
> 
> **Instructions for the worker:**
> - You are the sole writer. Implement the fixes in the plan.
> - You have permission to install npm packages or write `.sql` migrations if the plan calls for it.
> - If you get stuck, encounter a complex architectural choice, or need explicit permission to modify a sensitive file, use the `contact_supervisor` intercom tool to ask me. Do not skip issues silently.
> - When finished, write a summary of what you changed to `worker/routes-fixes-applied.md`."

---

### Step 4: Intercom Coordination (Handling Blockers)
*If the worker gets stuck, it will send an intercom message. You will see a notification like: `**From subagent-worker-...** Subagent needs a supervisor decision.`*

**How to respond:**
Read the question the worker asked. If you know the answer, tell the parent agent:
> "Reply to the worker over the intercom: Yes, you can install that package." 
*(Or whatever the appropriate answer is).*

---

### Step 5: Verification & Regression Check
*Use this to ensure the worker didn't break anything else (like the PostgreSQL crash from Cycle 1).*

**Prompt to copy:**
> "The worker has finished. Now we need to verify the changes. 
> 
> Use the `subagent` tool to launch two parallel `reviewer` agents in fresh context. 
> - **Reviewer 1** should focus on Security and XSS in the changed files.
> - **Reviewer 2** should focus on Database compatibility (SQLite vs PostgreSQL syntax) and Regressions.
> 
> Tell them to output their findings. Do not let them edit the files. If they find issues, we will do one more worker fix pass. If they report it is clean, we are done with this module."
