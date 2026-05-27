# Autonomous Hybrid-Model Workflow: Area 6

Please take control and run the full pipeline for Area 6 using the `subagent` tool.

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
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Audit src/hooks/, src/contexts/, and src/lib/ for: (1) missing dependency arrays in useEffect/useCallback/useMemo, (2) stale closure bugs (state setter callbacks instead of direct values), (3) incorrect type assertions on API responses, (4) context provider value mismatches between creation and consumption, (5) utility functions with unhandled edge cases. Read a representative sample. YOU MUST use bash commands (echo/cat with heredoc) to save findings to worker/scout-findings-area6.md."
    },
    {
      "agent": "planner",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/scout-findings-area6.md. If bugs exist, use bash to save fix plan to worker/fix-plan-area6.md. If no bugs exist, save 'All clear'."
    },
    {
      "agent": "worker",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/fix-plan-area6.md. If fixes exist, use the edit tool to apply them. Save summary to worker/worker-summary-area6.md."
    },
    {
      "parallel": [
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed hooks/contexts for stale closure bugs and dependency array correctness. Save report to worker/review-hooks-area6.md."
        },
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed lib files for edge cases and type safety. Save report to worker/review-lib-area6.md."
        }
      ],
      "concurrency": 2
    }
  ]
}
```