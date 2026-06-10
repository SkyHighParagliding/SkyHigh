---
title: Fallow — Codebase Intelligence
tags: [tooling, mcp, claude-code, fallow, dead-code, analysis]
last_updated: 2026-06-06
---

# Fallow — Codebase Intelligence

Fallow is a zero-config static analyser for TypeScript/JavaScript. It finds unused code, circular dependencies, duplicates, and complexity hotspots. Installed in SkyHigh as a dev dependency with MCP server + Agent Skill wired into Claude Code.

---

## Current Status in SkyHigh

- **Installed:** `fallow` (devDependency, 2026-06-06)
- **MCP server:** `fallow-mcp` registered in `.mcp.json`
- **Agent Skill:** copied to `~/.claude/skills/fallow/` (global)
- **Config:** zero-config — no `.fallowrc.json` created; 118 framework plugins auto-detect Vite + React

---

## Quick Commands

All commands should append `--format json --quiet` for machine-readable output. Append `|| true` in scripts — exit 1 = issues found (not a crash).

```powershell
# Full analysis
npx fallow --format json --quiet

# Dead code only (unused files, exports, types, deps)
npx fallow dead-code --format json --quiet

# Duplication
npx fallow dupes --format json --quiet

# Complexity hotspots
npx fallow health --format json --quiet

# PR risk gate — only changed files since main
npx fallow audit --format json --quiet --base main

# Security candidates (not verified CVEs — for agent review)
npx fallow security --format json --quiet
```

---

## Safe Auto-Fix Cycle

```powershell
# 1. Preview what will be removed
npx fallow fix --dry-run --format json --quiet

# 2. Apply (--yes required in non-TTY / agent environments)
npx fallow fix --yes --format json --quiet

# 3. Verify
npx fallow dead-code --format json --quiet
```

---

## Via Claude Code (MCP Tools)

Once the MCP server is active, ask Claude directly — no CLI needed:

- *"Find all unused exports in SkyHigh"* → `analyze`
- *"What code has been duplicated?"* → `find_dupes`
- *"Which functions are the most complex?"* → `check_health`
- *"Why is `FlightService` showing as unused?"* → `trace_export`
- *"Audit the files changed since main"* → `audit`
- *"Are there any security candidates?"* → `security_candidates`

---

## Debugging a False Positive

If fallow flags something that looks genuinely used:

```powershell
# Trace why a specific export is flagged
npx fallow dead-code --format json --quiet --trace src/services/FlightService.ts:FlightService

# Trace all edges for a file
npx fallow dead-code --format json --quiet --trace-file src/services/FlightService.ts

# Trace where an npm package is actually used
npx fallow dead-code --format json --quiet --trace-dependency express
```

To suppress a specific false positive in code:

```typescript
// fallow-ignore-next-line unused-export
export const legacyHelper = () => {};

/** @expected-unused */
export const deprecatedEndpoint = () => {};
```

---

## Useful Context for SkyHigh

- **Post-SQLite migration cleanup** — the SQLite→PostgreSQL migration (session 23) left some dead code paths. `npx fallow dead-code` is the right tool to surface them.
- **Production-only mode** — useful to exclude test scaffolding: `--production`
- **Entry points** — Vite plugin auto-detected; `src/main.tsx` is the client entry, `server.ts` is the server entry. Exports reachable from these are not flagged.
- **Dynamic imports** — fallow uses syntactic analysis only. Fully dynamic `import(variable)` paths (e.g. plugin loading) will not be resolved — suppress with `// fallow-ignore-next-line` if needed.

---

## Files Added to This Project

| File | Purpose |
|------|---------|
| `fallow` in `devDependencies` (package.json) | CLI + MCP server + bundled skill |
| `fallow` entry in `.mcp.json` | MCP server wired into Claude Code |
| `~/.claude/skills/fallow/SKILL.md` | Agent Skill (global — all Claude Code sessions) |

---

## Updating Fallow

After `npm update fallow`, re-copy the skill to keep it version-matched:

```powershell
Copy-Item "node_modules\fallow\skills\fallow\SKILL.md" "$env:USERPROFILE\.claude\skills\fallow\SKILL.md" -Force
Copy-Item "node_modules\fallow\skills\fallow\references\*" "$env:USERPROFILE\.claude\skills\fallow\references\" -Force
```

---

## Related

- [[codegraph]] — The other codebase intelligence MCP tool (symbol lookup, cross-references)
- [[09-integrations]] — All external integrations
- [[01-architecture]] — Tech stack and tooling decisions
