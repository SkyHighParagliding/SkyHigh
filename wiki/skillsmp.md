---
title: SkillsMP MCP — Agent Skills Marketplace
tags: [tooling, mcp, claude-code, skillsmp]
last_updated: 2026-06-06
---

# SkillsMP MCP — Agent Skills Marketplace

SkillsMP is a marketplace of ~1.5 million pre-built agent skills. The MCP server is wired into Claude Code for this project so any session can search the catalogue as a tool call.

---

## Current Status in SkyHigh

- **MCP config:** `.mcp.json` at project root — `skillsmp` server entry added 2026-06-06
- **Auth:** API key set via `env.SKILLSMP_API_KEY` in `.mcp.json`
- **Quota:** 500 req/day, 30 req/min (authenticated tier)

---

## How to Use It

Just ask Claude directly — the MCP tool is called automatically:

```
Search SkillsMP for "flight log parsing" skills
```

```
Find skills for summarising weather forecasts, sorted by stars
```

```
Search SkillsMP for data extraction skills in the engineering category
```

Claude will query the marketplace and return matching skills with descriptions. Useful before writing a new agent skill from scratch — check if a high-quality one already exists.

---

## Configuration (already done)

The entry in `.mcp.json`:

```json
"skillsmp": {
  "type": "stdio",
  "command": "npx",
  "args": ["skillsmp-mcp"],
  "env": {
    "SKILLSMP_API_KEY": "sk_live_skillsmp_..."
  }
}
```

If the server stops responding, restart Claude Code and run `/mcp` to confirm it's connected.

---

## Search Parameters

| Parameter | Description |
|-----------|-------------|
| `q` | Search terms — wildcards (`*`) not supported |
| `sortBy` | `stars` (most popular) or `recent` (newest) |
| `category` | Category slug (e.g. `engineering`, `data-science`) |
| `occupation` | SOC occupation slug filter |
| `limit` | Results per page (max 100) |

---

## Gotchas

- Wildcard searches (`*`) fail — use real keywords.
- No offline mode — every search hits the live SkillsMP API.
- Changes to `.mcp.json` require a Claude Code restart to take effect.

---

## Related

- [[09-integrations]] — All external integrations
- [[01-architecture]] — Tech stack and tooling decisions
