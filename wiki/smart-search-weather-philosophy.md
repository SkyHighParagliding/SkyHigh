# Site Logic — where the doc lives and how it works

*This note deliberately does **not** contain the logic itself. The actual content lives in the version-controlled file described below — read/edit it there, not here, so there is one source of truth.*

## What it is

The **Site Logic** document is the site's **decision philosophy**, not a feature list. It is structured in three layers: **Part 1 — Principles** that apply to anything the site does; **Part 2 — a What/Why/How/Principles template**; and **Part 3 — a catalogue of concrete decisions** (eligibility, weather buckets, the gust ceiling, label meanings, the safety gates) written up against the principles. Part 3 is a **populated catalogue** — 474 documented decisions across eight domain files in `docs/site-logic/` (indexed by `docs/site-logic/README.md`), produced by scanning the whole codebase against Parts 1–2 — and remains extendable by an AI (see `AGENTS.md`).

## Single source of truth

- The content is the repository file **`docs/site-logic.md`**. It is version-controlled and pulled with the code.
- **To change the logic: edit `docs/site-logic.md` and commit it.** There is no database copy — this removes any chance of drift.
- **Editing from the website (dev only):** because the local dev server runs from the repo folder, the `/admin/site-logic` page can Save straight back to `docs/site-logic.md` (`PUT /api/settings/site-logic`, auth-guarded, refused when `NODE_ENV=production`). Edit in the browser, Save, then commit. On the deployed site the page is read-only (ephemeral filesystem, not the repo).

## Why a repo file (not a DB doc or website download)

The consumers are AI coding tools (Claude Code, Cursor, Aider, Copilot, etc.) and developers working against the repo. A repo file means:

- Anyone who pulls from GitHub already has it — no running website, no download step.
- It is engine-agnostic: the root **`AGENTS.md`** points any AI tool at it, and it is one plain `.md` that can be attached to any chat.
- It is version-controlled and PR-reviewable — changes to the rules the code must obey show up in diffs.

## How it surfaces

- **In the repo:** `docs/site-logic.md`; referenced by `AGENTS.md` (vendor-neutral) and noted in `CLAUDE.md`.
- **On the website:** rendered at **/admin/site-logic** (admin route) from `GET /api/settings/site-logic` (reads the file). The page offers **Download .md** and **Print**, plus **Edit/Save** when running locally (writes the file); read-only in production.
- **Linked from:** Admin Manual (`/admin/manual`) → “Site Logic (Admin Reference)”.

## Dual use — as an AI prompt

The intended reverse use is a compliance check: attach `docs/site-logic.md` (or use the Download button) and ask, e.g. *“read this document and tell me which site components do NOT comply with it.”* `AGENTS.md` documents this for any tool.

## Status

- **Built:** the `docs/site-logic.md` source file, `AGENTS.md` pointer, the website render at `/admin/site-logic` with Download/Print and dev-only Edit/Save-to-file, and the manual link.
- **Planned (phase 2, not yet built):** an in-app **“Audit compliance”** AI action that sends this document plus the relevant logic (`getWindStatus`, `computeGustCeiling`, the Smart Search prompt and gates) to Gemini and returns a non-compliance report. To be discussed and built separately.

## Related

- Precise rules/decisions (project memory): `gust-tolerance-rule`, `smart-search-reeval-decisions`.
- Implementation: `computeGustCeiling` / `getWindStatus` in `src/lib/utils.ts`; the `⚠ GUSTY` pill in `src/components/weather/WeatherCardApple.tsx`; Smart Search in `server/routes/search.ts` and `server/utils/*`.
