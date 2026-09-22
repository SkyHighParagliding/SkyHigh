# AGENTS.md — instructions for AI coding tools

This file is a vendor-neutral entry point for any AI engine (Claude Code, Cursor,
Aider, Copilot, etc.) working on this repository. If your tool doesn't read this
file automatically, attach the files below to your prompt.

## Read this first: the site's decision logic

**[`docs/site-logic.md`](docs/site-logic.md)** is the single source of truth for how
the site behaves — how the Smart Search assistant and the site weather cards decide
what to show a pilot (the non-advisory philosophy, eligibility vs weather, the
hard-stop/caution weather buckets, the rating-based gust ceiling, label meanings,
and the fixed safety gates).

The document is structured in three layers: **Part 1 — Principles** (rules that apply
to anything the site does), **Part 2 — Template** (the fixed What/Why/How/Principles
format for one piece of logic), and **Part 3 — Instances** (a catalogue of concrete
decisions written up against the principles).

Use it three ways:

1. **As a spec** — any code touching a documented decision must comply with
   `docs/site-logic.md`. Read it before changing that code.
2. **As a compliance check (reverse prompt)** — e.g. *"Read `docs/site-logic.md` and
   tell me which site components do NOT comply with it."*
3. **To extend the catalogue (Part 3)** — Part 3 is a seed, not a complete list. Using
   Part 1 as the lens and Part 2 as the format, scan the codebase and produce one
   documented entry per distinct decision, threshold, gate, or default you find
   (e.g. map-rendering thresholds, admin-tunable ranges, caching/staleness rules).
   For each: what it is, the decisions behind it, and how it is achieved.

When the logic changes, edit `docs/site-logic.md` and commit it — that file, not any
website copy, is authoritative. The website renders this same file at `/admin/site-logic`.

## Other project context

- `CLAUDE.md` — full project brain, operating rules, and session protocol.
- `wiki/` — architecture, decisions log, tasks, integrations, and deployment.
