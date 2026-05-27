# Autonomous Hybrid-Model Workflow: Area 10

Please take control and run the full pipeline for Area 10 using the `subagent` tool.

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
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Audit src/types/api.ts, src/templates/, src/App.tsx, src/main.tsx, server/constants.ts, src/utils/, src/lib/demoConfig.ts, src/lib/demoInterceptor.ts, src/lib/demoSimulation.ts for: (1) type definition completeness — missing properties on API response types, (2) template rendering — header/footer prop mismatches, (3) demo mode simulation bugs — interceptor not matching real API shape, (4) app-level routing and provider setup — incorrect provider nesting or missing context providers, (5) constants that don't match their usage sites. Read all files thoroughly. YOU MUST use bash commands (echo/cat with heredoc) to save findings to worker/scout-findings-area10.md."
    },
    {
      "agent": "planner",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/scout-findings-area10.md. If bugs exist, use bash to save fix plan to worker/fix-plan-area10.md. If no bugs exist, save 'All clear'."
    },
    {
      "agent": "worker",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/fix-plan-area10.md. If fixes exist, apply them with the edit tool. Save summary to worker/worker-summary-area10.md."
    },
    {
      "parallel": [
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed type definitions and demo code for correctness. Save report to worker/review-types-area10.md."
        },
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed templates and app setup for rendering and routing correctness. Save report to worker/review-setup-area10.md."
        }
      ],
      "concurrency": 2
    }
  ]
}
```