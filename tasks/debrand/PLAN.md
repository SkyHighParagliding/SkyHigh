# De-brand Plan — remove the multi-template / white-label system

**Created:** 2026-09-15 (session 61, research only — no code changed yet)
**Branch:** `chore/remove-multi-branding`
**Goal:** SkyHigh is permanently Wonderful White, single organisation. Remove the
multi-template engine and the white-label documentation without changing one
visible pixel.

---

## 0. Revert points (already created — verify before starting)

```
git tag -l "pre-debrand*"
  pre-debrand-2026-09-15            -> 025893f  committed/deployed state
  pre-debrand-worktree-2026-09-15   -> 0e87b01  incl. uncommitted siteguide_* edits
git branch --list "backup/*"
  backup/pre-debrand-2026-09-15
```

Full revert: `git checkout main`. Nothing was pushed; `main` is untouched.

---

## 1. Scope decisions (confirmed by Jon, 2026-09-15)

| Decision | Answer |
|---|---|
| Club identity settings (`clubName`, `clubTagline`, logo uploads, PWA icon) | **KEEP.** Single-org config, not multi-branding. `server/routes/branding.ts` stays intact. |
| Dark logo set (`clubLogoDark*`) | **KEEP.** Jon flagged it and he was right — see §2. |
| `logoMode_*` + `resolveActiveLogos()` | **REMOVE.** Only existed to pick a logo per template. |
| `clubPrimaryColor` | **KEEP** (currently `''` in prod, so it is a no-op today). Reword the admin copy: it no longer "overrides the template default". |
| Backup method | Tag + branch (done). |

---

## 2. THE FINDING THAT CHANGES THE SHAPE OF THIS WORK

`src/index.css` contains **zero** `--tmpl-*` references. Every one of the 39
tokens is written at runtime by `TemplateContext.tsx` via
`root.style.setProperty(...)`.

**Consequence:** if the `--tmpl-*` token *names* are kept and simply declared
statically in `index.css :root`, then the ~9 pages that consume
`var(--tmpl-...)` need **no edits at all**:

```
Airspace.tsx (14)  BusinessDirectory.tsx (18)  XCCompetitions.tsx (25)
Join.tsx (5)       XCMaps.tsx (5)              GroundHandling.tsx (3)
Page.tsx (1)       DutyPilotMap.tsx (1)        RetrievalMap.tsx (1)
```

Do **NOT** rename the tokens. Renaming buys nothing and touches 70+ call sites.

### Both logo sets are live — do not collapse them

Jon caught this and the code confirms it:

- `WonderfulHeader.tsx:36` — `const logoNav = isDark ? lightLogos.nav : darkLogos.nav;`
  Over the hero (dark backdrop) → **light** logo. Scrolled past the hero
  (white backdrop) → **dark** logo.
- `WonderfulFooter.tsx:10` — `darkLogos.nav || darkLogos.footer` → **dark** logo.

So `resolveLightLogos()` and `resolveDarkLogos()` both survive. Only
`resolveActiveLogos()` (the `activeTemplate` + `logoMode_*` reader) dies.

Baseline proof in `baseline-home-hero-1280.png` vs `baseline-home-scrolled-1280.png`.

---

## 3. TWO TRAPS — read these before editing anything

### Trap 1: `--color-orange` is `#007aff` (Apple BLUE) on the live site

Wonderful White remaps the "orange" token to its accent colour:

```js
root.style.setProperty("--color-orange", tokens["--tmpl-badge-bg"]);  // #007aff
root.style.setProperty("--color-orange-dark", "#0063d1");
```

Every `bg-orange` / `text-orange` / `hover:text-orange-dark` class in the app
therefore renders **blue** right now. The static CSS must preserve `#007aff`.
"Fixing" it back to `#ff6b35` silently recolours the site.

This has bitten the project before — see `memory/feedback.md`, 2026-09-05, the
Cross legend dot rendering blue.

### Trap 2: `index.css @theme` currently holds CLASSIC values

```css
@theme {
  --color-navy: #1a2b3c;      /* Classic. Runtime overrides to #1d1d1f */
  --color-sky:  #00a8e8;      /* Classic. Runtime overrides to #007aff */
  --color-orange: #ff6b35;    /* Classic. Runtime overrides to #007aff */
  --font-sans: "Montserrat"...;  /* Runtime overrides to -apple-system   */
  --font-body: "Roboto"...;      /* Runtime overrides to -apple-system   */
}
```

Delete `TemplateContext` **without** rewriting `@theme` and the entire site
snaps back to Classic navy/orange/Montserrat. This is the single highest-risk
edit in the job.

`--color-sand: #f4f1ea` is NOT overridden at runtime — leave it as is.

---

## 4. Verification contract

`tasks/debrand/baseline-tokens.json` holds the 39 computed custom-property
values captured from **production** on 2026-09-15. After the refactor the same
39 values must be produced statically.

**Database-free test** (do this before anything needing `.env`):

1. `npm run build`
2. Write a bare harness HTML that `<link>`s only the built CSS bundle.
3. Open it in Playwright, dump `getComputedStyle(document.documentElement)`
   for all 39 names.
4. Diff against `baseline-tokens.json`. Zero deviations required.

This is exact, needs no backend, and avoids the screenshot-downscaling trap
recorded in `memory/feedback.md` (2026-09-15). Follow with `tsc --noEmit`,
`npm run build`, then Jon's manual pass on local dev — which per feedback.md is
the real gate, not the green checks.

Also assert afterwards: `grep -ri "wonderful-white\|activeTemplate\|isGlass\|isWonderfulWhite\|variant.*'classic'" src/` returns nothing meaningful.

---

## 5. Dispatch plan

File ownership is disjoint per agent (CLAUDE.md §8 concurrency rule).
**Fix the contract in §6 BEFORE dispatching** so waves 1 and 2 agree.

### Wave 1 (must land first — everything else depends on it)

**Agent A — core theming collapse.** Owns:
`src/index.css`, `src/contexts/TemplateContext.tsx` (delete),
`src/templates/registry.ts` (delete), `src/App.tsx`,
`src/components/Layout.tsx`, `src/contexts/SettingsContext.tsx`

- Move the 28 `--tmpl-*` Wonderful White tokens into `index.css :root` verbatim.
- Rewrite `@theme` to the Wonderful White values (Trap 2). Keep `--color-sand`.
- Drop the Montserrat/Roboto Google Fonts `@import` — those faces are unused at
  runtime today. Verify no `font-['Montserrat']`-style literal usage first.
- Delete `TemplateProvider` from `App.tsx` (lines 22, 170, 261).
- `Layout.tsx`: delete `ClassicHeader` + `ClassicFooter`; import
  `WonderfulHeader`/`WonderfulFooter` directly (no `lazy`/`Suspense` needed now
  that there is no alternative); `<main>` always gets `pt-[56px] sm:pt-[76px]`.
- `SettingsContext.tsx`: remove `activeTemplate` from the `Settings` interface
  and `buildSettings`; remove `resolveActiveLogos`; remove the
  `logoMode_*` spread at line 403; replace `activeLogos` with `lightLogos` at
  its 4 consumer sites. **Safe because prod has no `logoMode_*` key, so
  `activeLogos === lightLogos` today** (verified against `/api/settings`).

**Agent E — documentation** (fully independent, run in parallel). Owns:
`src/pages/AdminManual.tsx`, `src/pages/BuildBlueprint.tsx`,
`src/pages/ProductSpec.tsx`, `src/pages/TechSpec.tsx`,
`src/pages/AdminDashboard.tsx` (line 395 description only),
`wiki/00-overview.md`, `wiki/README.md`, `wiki/02-tasks.md` (delete TASK-032),
`wiki/04-glossary.md`, `wiki/skyhigh-foundation.md` (§302),
`wiki/skyhigh-legacy-index.md`, `CLAUDE.md` §0, `tasks/todo.md` (TASK-032).

Do NOT touch `wiki/03-decisions-log.md` DECISION-012 — it is the licence record
and already states white-label was dropped. Add a new DECISION-014 instead.

### Wave 2 (parallel, after Agent A merges)

**Agent B — pages.** Owns `src/pages/Home.tsx`, `src/pages/SiteDetail.tsx`,
`src/pages/SiteFieldView.tsx`. Delete `isGlass`, keep the `true` branch
everywhere. Home.tsx is the big one (~15 ternaries, lines 16/368/404/417/427/
450/506/591/693/699/705/708/709/710/711/715/718/738/745). Watch `bg-sand` in the
dead branch — it may become the only `--color-sand` consumer.

**Agent C — weather components.** Owns `src/components/WeatherCard.tsx`,
`src/components/weather/WeatherCardApple.tsx`,
`src/components/weather/WeatherCardClassic.tsx` (delete),
`src/components/weather/ExtendedOutlookPanel.tsx`,
`src/components/weather/HourlyForecastStrip.tsx`,
`src/components/weather/SiteThermalPanel.tsx`.
Remove the `variant` prop entirely; keep the `isApple`/`'apple'` path. Note
`WeatherCardApple` passes `variant="apple"` down at lines 118/137 — drop those too.

**Agent D — admin + server.** Owns `src/pages/AdminBranding.tsx`,
`server/data/seeds/seed_settings.json`, a new
`server/pg_migrations/0NN_drop_template_settings.sql`,
`server/pg_migrations/028_seed_branding_settings.sql` (comment only).

- Remove the "Visual Template" card and the `logoMode` toggles from AdminBranding.
- Retitle "Branding & Templates" → "Branding".
- **Relabel the dark-logo upload** to explain its real job: "used in the footer
  and in the header once scrolled past the hero" — not "for the dark template".
- New migration: `DELETE FROM settings WHERE key = 'activeTemplate' OR key LIKE 'logoMode\_%';`
- Remove `activeTemplate` from `seed_settings.json` (line 3).
- Run `node scripts/lint-migrations.mjs` after adding the migration.

### Wave 3 — verify, rectify, loop

Run §4. Fix. Repeat until clean. Then hand to Jon for manual pass.

---

## 6. Shared contract (pin this before dispatch)

```ts
// SettingsContext exports AFTER the change:
{ settings, updateSettings, refreshSettings, loading,
  lightLogos, darkLogos, settingsFetchedAt }
// REMOVED: activeLogos, settings.activeTemplate, settings["logoMode_*"]

// Layout.tsx favicon/apple-touch-icon now read lightLogos.favicon
// SiteFieldView.tsx:151 now reads lightLogos.nav

// WeatherCard.tsx signature AFTER:
export function WeatherCard({ weather, site, distance }:
  { weather: any; site: any; distance?: number | string })
// callers in Home.tsx / SiteDetail.tsx / SiteFieldView.tsx drop `variant={...}`

// ExtendedOutlookPanel / HourlyForecastStrip / SiteThermalPanel:
// `variant` prop removed from all three; Apple branch retained.
```

---

## 7. Inventory — every file touching the template system

| File | Action |
|---|---|
| `src/templates/registry.ts` | delete |
| `src/contexts/TemplateContext.tsx` | delete |
| `src/components/weather/WeatherCardClassic.tsx` | delete |
| `src/templates/wonderful-white/WonderfulHeader.tsx` | keep (maybe relocate to `components/`) |
| `src/templates/wonderful-white/WonderfulFooter.tsx` | keep (maybe relocate to `components/`) |
| `src/index.css` | rewrite `@theme`, add `:root` tokens |
| `src/App.tsx` | drop `TemplateProvider` (3 lines) |
| `src/components/Layout.tsx` | drop Classic header/footer + branch |
| `src/contexts/SettingsContext.tsx` | drop `activeTemplate`, `resolveActiveLogos`, `logoMode_*` |
| `src/pages/Home.tsx` | drop `isGlass` |
| `src/pages/SiteDetail.tsx` | drop `isGlass` |
| `src/pages/SiteFieldView.tsx` | drop `isGlass`, `activeLogos`→`lightLogos` |
| `src/pages/AdminBranding.tsx` | drop template card + logoMode |
| `src/pages/AdminDashboard.tsx` | line 395 copy |
| `src/components/WeatherCard.tsx` + 4 weather components | drop `variant` |
| `src/pages/{AdminManual,BuildBlueprint,ProductSpec,TechSpec}.tsx` | doc copy |
| `server/data/seeds/seed_settings.json` | drop `activeTemplate` |
| `server/pg_migrations/028_seed_branding_settings.sql` | comment only |
| `server/pg_migrations/0NN_drop_template_settings.sql` | new |
| `wiki/*` (6 files), `CLAUDE.md`, `tasks/todo.md` | doc copy |
| `server/routes/branding.ts` | **UNCHANGED** — kept deliberately |

**Note:** `prodchunks/`, `prod-index.js` etc. in the repo root are untracked
diagnostic artifacts from session 60. Ignore them; they are not source.
