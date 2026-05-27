# Autonomous Hybrid-Model Workflow: Area 1

Please take control and run the full pipeline for Area 1 using the `subagent` tool.

**CRITICAL STABILITY RULES FOR ORCHESTRATOR:**
1. You MUST set `"context": "fresh"` at the top level of your `subagent` tool call to prevent Windows/Node.js memory buffer crashes. 
2. The intercom and contact_supervisor are OFF-LIMITS. You must explicitly tell every subagent (scout, planner, worker, reviewers) in their task description: "DO NOT use `contact_supervisor` or `intercom`. There is nobody listening. If you find inconsistencies or need a decision, make your best judgment, document your decision in the output file, and proceed. Do not wait for a reply."

**The Pipeline (Launch this using `subagent` tool):**
You must call the `subagent` tool EXACTLY with this JSON structure. Do not deviate.

```json
{
  "context": "fresh",
  "chain": [
    {
      "agent": "scout",
      "model": "deepseek/deepseek-v4-flash",
      "task": "Use the read or bash tools to thoroughly read server/migrations/ and server/pg_migrations/. Compare them to find any remaining schema mismatches between SQLite and Postgres. Check server/pgDb.ts for any unhandled SQL syntax conversions. CRITICAL: DO NOT use contact_supervisor or intercom. YOU MUST use bash commands (echo/cat with heredoc) to save your exact findings to worker/scout-findings.md."
    },
    {
      "agent": "planner",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Make your own best judgment. Use the read tool to read worker/scout-findings.md. If bugs exist, use bash commands (echo/cat with heredoc) to save a strict step-by-step fix plan to worker/fix-plan.md. If no bugs exist, use bash to save a summary stating 'All clear'."
    },
    {
      "agent": "worker",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom - there is nobody listening. Make your own best judgment and document it. Use the read tool to read worker/fix-plan.md. If there are fixes, use the edit tool to apply them to the codebase. If you find inconsistencies between plans, pick the most conservative fix, document your decision in the output file, and proceed. YOU MUST use bash commands (echo/cat with heredoc) to save a summary of actions taken (or confirm everything is clean) to worker/worker-summary.md."
    },
    {
      "parallel": [
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom - there is nobody listening. Make your own best judgment. Review the codebase for Schema Parity. YOU MUST use bash commands (echo/cat with heredoc) to save your report to worker/review-schema.md."
        },
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom - there is nobody listening. Make your own best judgment. Review server/pgDb.ts for SQL Syntax accuracy. YOU MUST use bash commands (echo/cat with heredoc) to save your report to worker/review-sql.md."
        }
      ],
      "concurrency": 2
    }
  ]
}
```