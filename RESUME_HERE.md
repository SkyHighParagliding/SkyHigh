# RESUME_HERE — Last updated: 2026-09-15 (session 61)

## Project: SkyHigh
## Status: Active

## ⚠️ READ FIRST — you are NOT on `main`

```
current branch: chore/remove-multi-branding
```

Session 61 was **research and planning only. No application code has been
changed.** The branch contains one commit adding planning artifacts under
`tasks/debrand/`. `main` is untouched and still level with `origin/main`.

**Before doing anything else, read `tasks/debrand/PLAN.md` in full.** It is the
executable spec for this work — scope decisions, two traps that will silently
wreck the design, the agent dispatch plan, and the shared contract. This file is
only the orientation layer.

## Where I left off

Jon asked to **remove the multi-template / white-label system** so SkyHigh is
permanently a single-organisation site on the **Wonderful White** design, and to
strip the associated documentation. Session 61 did the research, captured a
verification baseline, created revert points, and wrote the plan. Execution
starts next session.

### The finding that shapes the whole job

`src/index.css` contains **zero** `--tmpl-*` references. All 39 design tokens are
injected at runtime by `TemplateContext.tsx` via `root.style.setProperty()`. So
the removal is mostly "make the injected values static". If the `--tmpl-*` token
**names** are kept and declared in `index.css :root`, the ~9 pages that consume
`var(--tmpl-...)` need **no edits at all**. Do not rename the tokens.

### Two traps — these will silently recolour the site

1. **`--color-orange` is `#007aff` (Apple blue) on the live site.** Wonderful
   White remaps the "orange" token to its accent, so every `bg-orange` /
   `text-orange` class currently renders blue. Static CSS must preserve
   `#007aff`. "Fixing" it back to `#ff6b35` recolours the site. This already bit
   the project once — `memory/feedback.md`, 2026-09-05, the Cross legend dot.
2. **`index.css @theme` currently holds CLASSIC values** (`--color-navy:#1a2b3c`,
   `--color-sky:#00a8e8`, `--color-orange:#ff6b35`, Montserrat/Roboto). Deleting
   `TemplateContext` without rewriting `@theme` snaps the whole site back to
   Classic. Highest-risk edit in the job.

### Jon was right about the dark logo

He flagged that light *and* dark logos are both used by Wonderful White, and the
code confirms it: `WonderfulHeader.tsx:36` uses the **light** logo over the hero
and the **dark** one once scrolled past it; `WonderfulFooter.tsx:10` uses the
dark one. So `lightLogos` and `darkLogos` both survive — only
`resolveActiveLogos()` (the `activeTemplate` + `logoMode_*` reader) is removed.
Verified visually in the two baseline screenshots.

Safe because production `/api/settings` has **no `logoMode_*` key at all**, so
`activeLogos === lightLogos` today. The collapse is a zero-visual-change edit.

### Verification approach (works without a database)

`tasks/debrand/baseline-tokens.json` holds the 39 computed custom-property values
captured from **production** before any change. After the refactor: `npm run
build`, link only the built CSS into a bare harness HTML, dump
`getComputedStyle(document.documentElement)` in Playwright, diff against the
baseline. Exact, needs no backend, and sidesteps the screenshot-downscaling trap
from session 60. Then `tsc --noEmit`, `npm run build`, then **Jon's manual
pass** — which per `memory/feedback.md` is the real gate, not the green checks.

## Revert points (created this session)

```
tag    pre-debrand-2026-09-15           -> 025893f  committed/deployed state
tag    pre-debrand-worktree-2026-09-15  -> 0e87b01  incl. uncommitted siteguide_* edits
branch backup/pre-debrand-2026-09-15
```

Full revert: `git checkout main`. Nothing has been pushed.

## Last completed task
- Session 61: research + plan for multi-branding removal. No code changed.
- TASK-036 follow-up (thermal-overlay `no-cache` + glyph/hatch exclusivity),
  commit `2e3950f` — 2026-09-15, live and verified on production.
- TASK-036 (thermal overcast vs cumulus), commit `3389874` — 2026-09-14.
- Baked raster land mask (DECISION-013), commit `92b49b2` — 2026-09-14.

## Currently in progress
De-brand execution — **Wave 1 not yet started.** See `tasks/debrand/PLAN.md` §5.

Working tree also carries two long-standing unrelated modifications to
`server/data/siteguide_airspace.txt` and `server/data/siteguide_zones.json`.
They are captured in the `pre-debrand-worktree` tag and are deliberately
excluded from commits — still undecided what to do with them.

## Next task to start

1. Draw `.env` (see below), then `npm run dev` for a live reference.
2. Re-verify the revert tags exist (`git tag -l "pre-debrand*"`).
3. Dispatch **Wave 1** from `tasks/debrand/PLAN.md` §5: Agent A (core theming
   collapse) and Agent E (documentation) in parallel.
4. Then Wave 2 (agents B/C/D), then Wave 3 (verify → rectify → loop).

### .env / 1Password

The draw script is **not** in this repo — it lives at:

```
C:\Users\User\Documents\CodeFolder\Ai System Projects\scripts\draw-env.ps1
```

Session 61 tried to run it and it **hung** on `op user get --me`, which wants a
1Password desktop unlock/biometric approval that a tool call cannot satisfy.
Jon should run it himself so the prompt lands in his own terminal:

```
! & "C:\Users\User\Documents\CodeFolder\Ai System Projects\scripts\draw-env.ps1" -Path "C:\Users\User\Documents\CodeFolder\Ai Coding Projects\SkyHigh"
```

No `.env` was created, so there is nothing to wipe. `op` CLI is v2.34.0 and on PATH.

## Open questions / blockers

- **Nothing blocking the plan** — scope was confirmed with Jon this session:
  keep club identity settings (`clubName`, tagline, logo uploads, PWA icon) and
  `server/routes/branding.ts`; remove only the template engine and `logoMode_*`.
- `clubPrimaryColor` is **kept** but is `''` in production, so it is a no-op
  today. The admin copy that calls it a "template default" override needs
  rewording.
- Still outstanding from earlier sessions (unchanged):
  - **TASK-036 is a duplicate ID.** `wiki/02-tasks.md` has two `### TASK-036`
    headings — the thermal work and "Site Scheduled Closure Calendar". Jon to
    pick the ID, then sed it across ~9 files.
  - Stale extended-forecast rows need `POST /api/weather/extended-forecast/fetch-now`
    (requireAuth — Jon triggers it, or wait for the 05:30 Melbourne cron).
  - `GridBoundsSelector.tsx` still says "Fine 0.15°" after the Fine → Wind rename.
  - ~~Untracked debugging PNGs + scratch files in the repo root~~ — **DONE
    (session 62):** 242 scratch items removed via targeted `git clean`, plus the
    72M `.ga-coast/` duplicate of `data/ga-coast/` and `tmp/gridTilesOld.ts` /
    `scripts/probe-coastline.tmp.mjs`. Preserved: the 3 PDFs and the empty
    documented dirs (`.config/`, `wiki/decisions/`, `screenshots-test/`). Working
    tree now only carries the two `siteguide_*` edits and two untracked PDFs
    (Inductions Links, Smart Search Log — Jon chose to keep).
  - `FORECAST_DAYS = 2` conflicts with the "7-Day" naming and `RETAIN_DAYS = 7`;
    `convective_inhibition` is missing on a large fraction of ECMWF points while
    `lifted_index` is fully present, so the overdevelopment weighting may lean on
    the weaker variable.
- **Never authenticate to production using `DEFAULT_ADMINS` from the local `.env`.**
  Jon performs privileged production actions himself via the admin UI.
- After this work lands, `TASK-032 (Multi-Club White-Label Test)` in
  `wiki/02-tasks.md` and `tasks/todo.md` is obsolete and gets deleted, closing
  two of the "Jon asked to be reminded" items carried since session 59.

## Quick context refresher

SkyHigh is permanently one club's site. The in-app docs (`AdminManual`,
`BuildBlueprint`, `ProductSpec`, `TechSpec`) and six wiki files still advertise
white-label capability; that copy is now false and contradicts DECISION-012,
which already records that white-label was dropped and that the GPL-2.0-only
`@openmeteo/file-reader` is only acceptable because SkyHigh is hosted-only and
never distributed. Add a DECISION-014 for this removal rather than editing 012.

The CC BY 4.0 Geoscience Australia attribution in `ThermalHelpModal.tsx` and the
wind map legend is a **licence obligation** — unrelated to branding, do not
remove it while stripping "branding" text.
