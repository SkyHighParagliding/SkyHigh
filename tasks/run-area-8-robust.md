# Autonomous Hybrid-Model Workflow: Area 8

Please take control and run the full pipeline for Area 8 using the `subagent` tool.

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
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Audit src/components/windmap/, src/components/xcmap/, src/components/weather/, and related map components for: (1) canvas rendering errors or WebGL compatibility issues, (2) coordinate projection or lat/lon conversion bugs, (3) stale animation frame references not properly cleaned up on unmount, (4) marker rendering that assumes data exists without null checks, (5) missing cleanup in useEffect for subscriptions/intervals/animations. Read representative files from each subdirectory. YOU MUST use bash commands (echo/cat with heredoc) to save findings to worker/scout-findings-area8.md."
    },
    {
      "agent": "planner",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/scout-findings-area8.md. If bugs exist, use bash to save fix plan to worker/fix-plan-area8.md. If no bugs exist, save 'All clear'."
    },
    {
      "agent": "worker",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/fix-plan-area8.md. If fixes exist, apply them with the edit tool. Save summary to worker/worker-summary-area8.md."
    },
    {
      "parallel": [
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed map components for rendering correctness and cleanup patterns. Save report to worker/review-rendering-area8.md."
        },
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed weather components for data handling and null safety. Save report to worker/review-weather-area8.md."
        }
      ],
      "concurrency": 2
    }
  ]
}
```