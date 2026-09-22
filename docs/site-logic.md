# Site Logic — how the site makes decisions

> **Single source of truth for the site's decision-making.** Version-controlled and pulled with the code, so any person or AI engine can read and enforce it — no running website or download required. The website renders this same file at `/admin/site-logic`. To change the logic, edit this file and commit it (or edit via the local site, which writes this file). See `AGENTS.md`.

This document is a **decision philosophy**, not a feature list. It has three layers:

- **Part 1 — Principles:** a small set of rules that apply to *anything* the site does.
- **Part 2 — Template:** the fixed format for documenting one concrete piece of logic.
- **Part 3 — Instances:** each concrete decision documented against the principles. The full catalogue lives in [`docs/site-logic/`](site-logic/).

Part 3 is meant to grow: hand Parts 1 and 2 to an AI and have it scan the codebase and document every instance it finds.

---

## Part 1 — Principles (apply to anything the site does)

- **Decisions stay with the human.** The site lays out options and caveats; it never makes the consequential call for the user.
- **Separate facts from judgements — handle them oppositely.** Hard rules/facts are stated plainly and enforced; judgement calls are surfaced with caveats and left to the user.
- **Compute in code, phrase with the model.** Anything that must be correct is calculated deterministically; a language model only presents it — it never decides a fact.
- **Assume the safest reading when context is missing.** With incomplete information the site defaults conservatively rather than guessing optimistically.
- **Surface, don't hide.** Cautions and uncertainty are shown plainly, never buried under the good news; certainty is never overstated.
- **Refuse rather than improvise at the edges.** Outside its competence, or where a wrong answer is dangerous, the site returns a fixed safe response and stops.
- **One source of truth per rule.** Each rule or threshold is defined once; every screen and feature derives from that definition, so copies can't drift.
- **Deliberate, explained differences.** When the same rule shows different results in different places, that difference is intentional and documented — not an accident.
- **Traceable to code.** Every rule points to the file(s) that implement it, so the description and the behaviour stay tied together.

---

## Part 2 — Template (how each instance is documented)

For every distinct rule, threshold, gate, or default in the site, capture four things:

- **What it is** — the rule in one plain sentence, and where the user meets it.
- **Why (the decisions)** — the reasoning, constraints and trade-offs that made it work this way, including options that were rejected.
- **How (the mechanism)** — where and how it is computed (formula / algorithm / data) and the files involved.
- **Principles** — which Part 1 principles it embodies.

---

## Part 3 — Instances (the catalogue)

The full catalogue was produced by scanning the entire codebase (public and admin, client and server) against Part 1 and Part 2. It holds **474 entries across 107 groups**, split into eight domain files under [`docs/site-logic/`](site-logic/). Index with per-group counts and cross-domain overlaps: [`docs/site-logic/README.md`](site-logic/README.md).

| Domain | Entries | File |
|--------|--------:|------|
| Smart Search & AI safety | 58 | [`01-smart-search-ai-safety.md`](site-logic/01-smart-search-ai-safety.md) |
| Weather ingestion & flyability | 47 | [`02-weather-flyability.md`](site-logic/02-weather-flyability.md) |
| Grid data pipeline | 71 | [`03-grid-pipeline.md`](site-logic/03-grid-pipeline.md) |
| Wind & thermal map rendering | 67 | [`04-map-rendering.md`](site-logic/04-map-rendering.md) |
| Authentication, sessions & security | 54 | [`05-auth-security.md`](site-logic/05-auth-security.md) |
| Admin CMS, settings & feature flags | 47 | [`06-admin-settings.md`](site-logic/06-admin-settings.md) |
| External integrations & scheduling | 52 | [`07-integrations-scheduling.md`](site-logic/07-integrations-scheduling.md) |
| XC tracking, retrieval & media | 78 | [`08-xc-tracking-media.md`](site-logic/08-xc-tracking-media.md) |

**To extend the catalogue:** using Part 1 as the lens and Part 2 as the format, scan any new or unreviewed code and add an entry per distinct decision, threshold, gate, or default (see `AGENTS.md`).

### Worked example (the template in use) — Gust ceiling

- **What it is:** The gust level above which a site is flagged with a caution, scaled to the pilot's rating band.
- **Why (the decisions):** An SSO advised that gusts are a caution, not a hard-stop — don't stop a pilot launching in a lull; launch is the critical phase and gusts matter less once airborne. Tolerance scales with experience. The site's wind range is a *sustained*-wind range, not a gust limit, so gusts are allowed a defined margin above it.
- **How (the mechanism):** `ceiling = top-of-range + allowance × mean` (mean = (low+high)/2; allowance 0.50 for PG4+, 0.25 for PG2/3) in `computeGustCeiling` (`src/lib/utils.ts`); used by the `⚠ GUSTY` pill in `src/components/weather/WeatherCardApple.tsx` and by Smart Search.
- **Principles:** compute-in-code · assume-safest-default · one-source-of-truth · deliberate-differences.

*(Full details for this and every other instance are in the catalogue files above.)*
