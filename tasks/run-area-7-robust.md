# Autonomous Hybrid-Model Workflow: Area 7

Please take control and run the full pipeline for Area 7 using the `subagent` tool.

**CRITICAL STABILITY RULES FOR ORCHESTRATOR:**
1. You MUST set `"context": "fresh"` at the top level of your `subagent` tool call.
2. The intercom and contact_supervisor are OFF-LIMITS.

```json
{
  "context": "fresh",
  "chain": [
    {
      "agent": "scout",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Audit server/utils/, server/services/, and server/middleware/ for: (1) unhandled promise rejections or missing catch blocks on async operations, (2) environment variable access without fallback or validation, (3) error handling that swallows or masks real errors, (4) type assertions (as any, as Type) that bypass compiler checks, (5) incorrect import paths or exports. Read a representative sample of the most critical utility and service files. YOU MUST use bash commands (echo/cat with heredoc) to save findings to worker/scout-findings-area7.md."
    },
    {
      "agent": "planner",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/scout-findings-area7.md. If bugs exist, use bash to save fix plan to worker/fix-plan-area7.md. If no bugs exist, save 'All clear'."
    },
    {
      "agent": "worker",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/fix-plan-area7.md. If fixes exist, apply them with the edit tool. Save summary to worker/worker-summary-area7.md."
    },
    {
      "parallel": [
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed utils/services for error handling and promise safety. Save report to worker/review-errors-area7.md."
        },
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed middleware for security and auth correctness. Save report to worker/review-middleware-area7.md."
        }
      ],
      "concurrency": 2
    }
  ]
}
```