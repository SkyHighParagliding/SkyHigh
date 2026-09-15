# RESUME_HERE — Last updated: 2026-09-15 (session 62)

## Project: SkyHigh
## Status: Active

## ⚠️ READ FIRST — you are NOT on `main`, and nothing is pushed

```
current branch: chore/remove-multi-branding
```

**Session 62 executed the entire de-brand (all 4 waves) and it is verified
green — but NOT merged and NOT pushed.** `main` is untouched. The next step is
**Jon's manual pass** on local dev, then merge to `main` + push (Railway
auto-deploys `main`).

## Where I left off

The multi-template / white-label system is **fully removed** and SkyHigh now
reads as a native single-organisation app on the Wonderful White design. All
four waves of `tasks/debrand/PLAN.md` are done, each gated by token-diff + tsc +
fresh-reviewer code review + live Chrome check:

- **Waves 1–2** (`6feed11`) — behavioral de-brand: deleted `TemplateContext`,
  `registry.ts`, `WeatherCardClassic`; froze Wonderful White as static CSS;
  removed `activeTemplate`/`isGlass`/`variant`/`logoMode_*`; AdminBranding
  template card gone; migration `045_drop_template_settings.sql`. Zero pixel
  change proven (39/39 tokens match production baseline).
- **Wave 3** (`414f850`) — fresh-review PASS + 3 nits fixed + DECISION-014.
- **Wave 4.1** (`682fe52`) — `--tmpl-*` tokens → semantic names.
- **Wave 4.3** (`0dc99e2`) — palette rewrite: `sky`+`orange`→`accent`,
  `navy`→`ink`, `navy-light`→`ink-muted`, `sand`→`cream` (~1988 sites, verified
  deterministic script). Built-in Tailwind `sky-500`/`orange-500` left intact.
- **Wave 4.4** (`bdc89bf`) — `Wonderful{Header,Footer}` → `components/Site{Header,
  Footer}`; `src/templates/` deleted; kept `clubPrimaryColor` (now the PWA
  theme-color setting, fallback fixed `#00a8e8`→`#007aff`).
- **Wave 4 review** (`697dfcd`) — fresh reviewer caught 4 regex false positives
  (BLOCKER: a Leaflet marker URL `-orange.png`→`-accent.png`; 3 comment nits);
  all fixed + re-verified.

Final state verified: `tsc` clean, `vite build` succeeds, built CSS has the new
semantic tokens and zero custom `--color-sky/navy/orange/sand`, source grep finds
no `--tmpl-`/`Wonderful`/`activeTemplate`/`isGlass`/`useTemplate`/`TemplateContext`/
`templates/`, live runtime tokens + real element colours correct, console clean,
Home renders identically on desktop + mobile. Proof shots:
`tasks/debrand/FINAL-home-1280.png`, `FINAL-home-390.png`.

### NEXT: Jon's manual pass, then merge

The real gate (per `memory/feedback.md`) is Jon's manual test. Suggested spots:
admin **Branding** page (template card gone, logos/colour still save), the
**weather-station map pin** on Admin → Site Edit (the reverted `-orange.png`
marker), any **hover** states (8 previously-broken `sky-dark` hovers now darken —
intended, flag), and a general colour sweep. Then `git checkout main && git merge
chore/remove-multi-branding` and push. Revert if needed: `git checkout main`
(tag `pre-debrand-2026-09-15`, branch `backup/pre-debrand-2026-09-15`).

### Original planning context (session 61) below for reference

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

### .env / 1Password — RESOLVED (session 62)

The session-61 "draw hung / no `.env`" blocker is **stale**. As of session 62 the
`SessionStart` hook reports `.env` present and up to date (38 lines), and the dev
server boots against it. **The live-verification harness is proven:** `npm run dev`
(Vite 5173 / Express 3001) up, Chrome via Playwright loads the app,
`data-template=wonderful-white`, and all 39 `:root` tokens match
`baseline-tokens.json` with **zero deviation**. Only console error is a harmless
pre-existing `favicon.ico` 404. See PLAN.md §4c for the per-wave live-check
protocol; baseline shot at `tasks/debrand/live-before-home-1280.png`.

If `.env` ever goes missing again, the draw script lives at
`C:\Users\User\Documents\CodeFolder\Ai System Projects\scripts\draw-env.ps1` and
must be run by Jon (it needs a 1Password biometric a tool call can't satisfy).

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
