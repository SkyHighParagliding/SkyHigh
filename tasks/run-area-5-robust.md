# Autonomous Hybrid-Model Workflow: Area 5

Please take control and run the full pipeline for Area 5 using the `subagent` tool.

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
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Audit src/components/ (excluding ui/, weather/, windmap/, xcmap/ subdirs) for: (1) prop interface mismatches between component definition and usage, (2) missing key props on mapped list items, (3) incorrect event handler types (onClick, onChange, onSubmit), (4) conditional rendering that could throw on null/undefined, (5) incorrect hook usage. Read a representative sample of the most complex components. YOU MUST use bash commands (echo/cat with heredoc) to save findings to worker/scout-findings-area5.md."
    },
    {
      "agent": "planner",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/scout-findings-area5.md. If bugs exist, use bash to save fix plan to worker/fix-plan-area5.md. If no bugs exist, save 'All clear'."
    },
    {
      "agent": "worker",
      "model": "deepseek/deepseek-v4-flash",
      "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Read worker/fix-plan-area5.md. If fixes exist, use the edit tool to apply them. Save summary to worker/worker-summary-area5.md."
    },
    {
      "parallel": [
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed components for prop types and TypeScript correctness. Save report to worker/review-props-area5.md."
        },
        {
          "agent": "reviewer",
          "model": "deepseek/deepseek-v4-flash",
          "task": "CRITICAL: DO NOT use contact_supervisor or intercom. Review changed components for rendering edge cases and null safety. Save report to worker/review-render-area5.md."
        }
      ],
      "concurrency": 2
    }
  ]
}
```