---
title: CodeGraph — Pre-indexed Knowledge Graph
tags: [tooling, mcp, claude-code, codegraph]
last_updated: 2026-06-06
---

# CodeGraph — Pre-indexed Knowledge Graph

CodeGraph builds a local SQLite index of the entire codebase and exposes it to Claude Code as an MCP tool server. Instead of Claude walking files one by one, it can query the pre-built graph for symbols, files, and relationships in a single call — fewer tool calls, less context consumption.

---

## Current Status in SkyHigh

- **Installed:** `@colbymchenry/codegraph` v0.9.9 (global)
- **Index:** `.codegraph/codegraph.db` (326 files indexed, 2026-06-06)
- **MCP config:** `.mcp.json` at project root — wired into Claude Code
- **Auto-allow:** Updated in `.claude/settings.json`

---

## Re-indexing After Large Changes

The index doesn't auto-update. Re-run after big refactors, adding new route files, or major directory restructures:

```powershell
cd C:\Users\User\Documents\CodeFolder\SkyHigh
codegraph init
```

This regenerates `.codegraph/codegraph.db` in place. Takes ~10–30 seconds for a project this size.

> Run this after: adding new route files, renaming directories, major component additions, or any session where 10+ files changed.

---

## Installation (reference — already done)

```powershell
# Install globally (the plain 'codegraph' package on npm has no bin — must use scoped name)
npm install -g @colbymchenry/codegraph

# Initialize index in project root
codegraph init

# Wire into Claude Code (local/project-level)
codegraph install -y --target=claude --location=local
```

This creates:
- `.codegraph/codegraph.db` — the index
- `.mcp.json` — MCP server config for Claude Code
- Adds auto-allow permissions to `.claude/settings.json`

---

## Restarting the MCP Server

The MCP server starts when Claude Code starts. To pick up config changes or a fresh index:

- Restart your Claude Code session (close and reopen)
- Or: `/mcp` in Claude Code to check server status

---

## What It Gives Claude

- **Symbol lookup** — find where a function, type, or component is defined without scanning files
- **Cross-reference** — which files import a given module
- **Structural overview** — summarise the codebase shape without reading every file
- **Reduced tool calls** — one graph query replaces 5–10 sequential `Read`/`Grep` calls

Useful for: navigating `server/routes/` when adding new endpoints, understanding which components use a shared hook, or tracing a type through the stack.

---

## Files Added to This Project

| File | Purpose |
|------|---------|
| `.codegraph/codegraph.db` | SQLite index (gitignored) |
| `.mcp.json` | MCP server registration for Claude Code |

Both are gitignored — the index is local-only and rebuilds in seconds.

---

## Related

- [[09-integrations]] — All external integrations
- [[01-architecture]] — Tech stack and tooling decisions
