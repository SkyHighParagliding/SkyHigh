# Autonomous Hybrid-Model Workflow: Area 2

Please take control and run the full pipeline for Area 2 using the `subagent` tool.

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
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Thoroughly audit server/routes/ (33 route files) for: (1) unhandled promise rejections or missing try/catch on async handlers, (2) missing input validation or type casting on request params/body, (3) incorrect error response status codes, (4) SQL injection vectors (raw string interpolation instead of parameterised queries), (5) missing authentication/authorisation checks. Read a representative sample of the most critical route files. YOU MUST use bash commands (echo/cat with heredoc) to save your findings to worker/scout-findings-area2.md."
    },
    {
      "agent": "planner",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Make your own best judgment. Use the read tool to read worker/scout-findings-area2.md. If bugs exist, use bash commands (echo/cat with heredoc) to save a strict step-by-step fix plan to worker/fix-plan-area2.md. If no bugs exist, use bash to save a summary stating 'All clear'."
    },
    {
      "agent": "worker",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom - there is nobody listening. Make your own best judgment and document it. Use the read tool to read worker/fix-plan-area2.md. If there are fixes, use the edit tool to apply them to the codebase. If you find inconsistencies, pick the most conservative fix, document your decision in the output file, and proceed. YOU MUST use bash commands (echo/cat with heredoc) to save a summary of actions taken (or confirm everything is clean) to worker/worker-summary-area2.md."
    },
    {
      "parallel": [
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom - there is nobody listening. Make your own best judgment. Review the changed route files for security vulnerabilities (auth bypass, SQL injection, XSS). YOU MUST use bash commands (echo/cat with heredoc) to save your report to worker/review-security-area2.md."
        },
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom - there is nobody listening. Make your own best judgment. Review the changed route files for error handling and TypeScript correctness. YOU MUST use bash commands (echo/cat with heredoc) to save your report to worker/review-errors-area2.md."
        }
      ],
      "concurrency": 2
    }
  ]
}
```