# Autonomous Hybrid-Model Workflow: Area 4

Please take control and run the full pipeline for Area 4 using the `subagent` tool.

**CRITICAL STABILITY RULES FOR ORCHESTRATOR:**
1. You MUST set `"context": "fresh"` at the top level of your `subagent` tool call to prevent Windows/Node.js memory buffer crashes.
2. The intercom and contact_supervisor are OFF-LIMITS.

```json
{
  "context": "fresh",
  "chain": [
    {
      "agent": "scout",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Audit non-admin pages in src/pages/ (Home, Sites, SiteDetail, SiteFieldView, CheckIn, Events, News, NewsDetail, Safety, Join, Shop, Sponsors, Airspace, XCMaps, XCMapsDemo, RetrievalMap, FlightHistory, BusinessDirectory, GroundHandling, ProceduresManual, ClubPhotos, InstaWall, VideoWall, BuildBlueprint, Features, TechSpec, ProductSpec, ResetPassword, WindMapLab, DutyPilotMap, Page) for: (1) type errors in API response handling, (2) missing loading/error states, (3) prop mismatches with child components, (4) data fetching patterns that could fail silently. Read a representative sample. YOU MUST use bash commands (echo/cat with heredoc) to save findings to worker/scout-findings-area4.md."
    },
    {
      "agent": "planner",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/scout-findings-area4.md. If bugs exist, use bash to save a step-by-step fix plan to worker/fix-plan-area4.md. If no bugs exist, save 'All clear'."
    },
    {
      "agent": "worker",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/fix-plan-area4.md. If fixes exist, use the edit tool to apply them. Save a summary to worker/worker-summary-area4.md."
    },
    {
      "parallel": [
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed pages for data fetching and error handling. Save report to worker/review-fetching-area4.md."
        },
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed pages for rendering and type correctness. Save report to worker/review-render-area4.md."
        }
      ],
      "concurrency": 2
    }
  ]
}
```