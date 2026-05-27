# Autonomous Hybrid-Model Workflow: Area 9

Please take control and run the full pipeline for Area 9 using the `subagent` tool.

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
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Audit server/weather.ts, server/bomWeather.ts, server/freeflightwx.ts, server/tides.ts, server/victoriaGrid.ts, server/googleDrive.ts, server/seed.ts, server/storage.ts for: (1) API client error handling — missing try/catch on external HTTP calls, (2) rate limiting — no backoff or retry logic, (3) response parsing — assuming response structure without validation, (4) timeout handling — requests that could hang indefinitely, (5) credential/token management — hardcoded keys or insecure storage. Read all files thoroughly. YOU MUST use bash commands (echo/cat with heredoc) to save findings to worker/scout-findings-area9.md."
    },
    {
      "agent": "planner",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/scout-findings-area9.md. If bugs exist, use bash to save fix plan to worker/fix-plan-area9.md. If no bugs exist, save 'All clear'."
    },
    {
      "agent": "worker",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/fix-plan-area9.md. If fixes exist, apply them with the edit tool. Save summary to worker/worker-summary-area9.md."
    },
    {
      "parallel": [
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed integration files for error handling and resilience. Save report to worker/review-resilience-area9.md."
        },
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed files for security (credentials, tokens, injection). Save report to worker/review-security-area9.md."
        }
      ],
      "concurrency": 2
    }
  ]
}
```