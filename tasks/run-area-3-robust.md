# Autonomous Hybrid-Model Workflow: Area 3

Please take control and run the full pipeline for Area 3 using the `subagent` tool.

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
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Thoroughly audit src/pages/Admin*.tsx (26 admin pages) for: (1) TypeScript type errors — missing properties on API response types, incorrect setState calls, prop mismatches on child components, (2) missing null/undefined checks on data before rendering, (3) incorrect event handler signatures, (4) missing key props in mapped lists, (5) form state management bugs. Read a representative sample of the most critical admin page files. YOU MUST use bash commands (echo/cat with heredoc) to save your findings to worker/scout-findings-area3.md."
    },
    {
      "agent": "planner",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Make your own best judgment. Use the read tool to read worker/scout-findings-area3.md. If bugs exist, use bash commands (echo/cat with heredoc) to save a strict step-by-step fix plan to worker/fix-plan-area3.md. If no bugs exist, use bash to save a summary stating 'All clear'."
    },
    {
      "agent": "worker",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom - there is nobody listening. Make your own best judgment and document it. Use the read tool to read worker/fix-plan-area3.md. If there are fixes, use the edit tool to apply them to the codebase. If you find inconsistencies, pick the most conservative fix, document your decision in the output file, and proceed. YOU MUST use bash commands (echo/cat with heredoc) to save a summary of actions taken (or confirm everything is clean) to worker/worker-summary-area3.md."
    },
    {
      "parallel": [
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom - there is nobody listening. Make your own best judgment. Review the changed admin pages for TypeScript correctness and prop interface mismatches. YOU MUST use bash commands (echo/cat with heredoc) to save your report to worker/review-types-area3.md."
        },
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom - there is nobody listening. Make your own best judgment. Review the changed admin pages for null/undefined handling and form state edge cases. YOU MUST use bash commands (echo/cat with heredoc) to save your report to worker/review-state-area3.md."
        }
      ],
      "concurrency": 2
    }
  ]
}
```