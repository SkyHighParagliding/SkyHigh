# De-brand Plan — remove the multi-template / white-label system

**Created:** 2026-09-15 (session 61, research only — no code changed yet)
**Branch:** `chore/remove-multi-branding`
**Goal:** SkyHigh is permanently Wonderful White, single organisation. Remove the
multi-template engine and the white-label documentation without changing one
visible pixel — **and (Jon, 2026-09-15) leave the code reading as if it were
written single-club from day one**, i.e. no `--tmpl-*` tokens, no `orange`-holds-
blue palette, no `templates/wonderful-white/` tree. Waves 1–3 are the behavioral
de-brand (zero pixel change); Wave 4 is the cosmetic normalization that removes
the archaeology. See §5 Wave 4 and §8.

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

### 4a. Verification after Wave 4 (token renames)

Wave 4 renames tokens, so `baseline-tokens.json` keys no longer match by name —
but **every value is unchanged**. Verify by *value*, not by key:

1. Keep `tasks/debrand/rename-map.json` (old→new token name map, §8).
2. In the harness dump, for each OLD name in the baseline, read the NEW name via
   the map and assert the computed value is byte-identical.
3. The set of *values* on `:root` must be a superset of the baseline values.
   (`--color-sky` and `--color-orange` both mapped to `#007aff`; after the
   collapse only `--color-accent` carries it — the value must still be present.)
4. Zero pixel change is still the bar: `tsc --noEmit`, `npm run build`, then Jon's
   manual pass. Because Wave 4 changes ~2100 class sites, the manual pass here is
   non-negotiable, not a formality.

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

Run §4. Fix. Repeat until clean. **This is the gate before Wave 4** — the
behavioral de-brand must be proven correct (token-diff clean, `tsc`, build, and
Jon's manual pass) before any cosmetic rename starts. Commit here.

### Wave 4 — native normalization (make it read as single-club-from-day-one)

**Goal chosen by Jon (2026-09-15):** the code must look as if it were written for
one club originally, not de-branded from a template engine. This is a large,
cross-cutting rename touching ~107 files, so it runs **sequentially after Wave 3
is green** — it cannot share the tree with waves 1–3. Do it as one focused pass,
re-verify per §4a, then a second manual pass.

Four independent steps; do them in this order, committing and re-verifying (§4a)
after each so a regression is bisectable:

**4.1 — `--tmpl-*` → semantic token names.** 206 uses / 17 files. Values
unchanged. Use the map in §8. Mechanical find/replace of the token *names* only;
`index.css :root` declarations and every `var(--tmpl-...)` call site update
together. `tsc` + build + §4a after.

**4.2 — collapse the `orange`=blue tell.** Only **135 class uses**. This is the
Cross-legend-dot regression class (`memory/feedback.md`, 2026-09-05), so audit
each one, do NOT blind-replace:
  - Intent = brand accent (the overwhelming majority) → replace `*-orange` with
    `*-accent`, `*-orange-dark` with `*-accent-hover`.
  - Intent = a genuine warning/status orange (would be a latent bug today, since
    it renders blue) → replace with Tailwind's built-in `*-orange-500` per the
    feedback rule, and flag it to Jon as a pre-existing bug found.
  - Then delete `--color-orange` / `--color-orange-dark` from `@theme` entirely.

**4.3 — full palette rename (Jon chose full rewrite).** Rename the remaining
legacy palette to accurate names across all call sites (§8 map). `sky`+`orange`
already collapsed to `accent` in 4.2; here rename `sky`→`accent` (1324 uses),
`navy`→`ink` (809), `sand`→`cream` (1). Tailwind v4 `@theme` auto-generates the
new utility classes from the renamed `--color-*` tokens, so this is a token
rename plus a class-name find/replace. Because it is ~2100 sites, script the
replacement with word-boundary regex per class family (`\b(bg|text|border|ring|
from|to|via|fill|stroke|hover:bg|hover:text|hover:border|group-hover:text)-sky\b`
etc.), then `tsc`, build, §4a, and a careful manual sweep of the highest-traffic
pages (Home, SiteDetail, admin).

**4.4 — de-template the file tree.** Move
`src/templates/wonderful-white/WonderfulHeader.tsx` →
`src/components/SiteHeader.tsx` and `WonderfulFooter.tsx` →
`src/components/SiteFooter.tsx`; rename the components; update the two importers
(`Layout.tsx`). Delete the now-empty `src/templates/` dir. Drop the
`clubPrimaryColor` no-op field from `SettingsContext`, `AdminBranding`, seeds, and
its migration (it is `''` in prod — a dead override of the old template default).

Final grep must return nothing: `grep -rEi "tmpl-|wonderful|activeTemplate|isGlass|isClassic|color-orange|color-navy|-sky\b|clubPrimaryColor" src/ server/`.

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
| `src/templates/wonderful-white/WonderfulHeader.tsx` | keep in Waves 1–3; Wave 4.4 → `src/components/SiteHeader.tsx` |
| `src/templates/wonderful-white/WonderfulFooter.tsx` | keep in Waves 1–3; Wave 4.4 → `src/components/SiteFooter.tsx` |
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
| `src/index.css` + ~107 files (Wave 4) | rename `--tmpl-*` and legacy palette classes per §8 |
| `src/templates/` directory (Wave 4.4) | delete once headers/footers relocated |

**Note (session 62):** the untracked diagnostic artifacts from session 60
(`prodchunks/`, `prod-index.js`, ~226 debugging PNGs, the `.ga-coast/` duplicate)
have since been **removed** — the repo root is clean. This supersedes the earlier
"ignore them" note.

---

## 8. Wave 4 rename map

The authoritative old→new map is `tasks/debrand/rename-map.json` (machine-readable,
used by §4a). Summary:

- **`--tmpl-*` → strip the prefix** (deterministic): `--tmpl-card-bg` → `--card-bg`,
  `--tmpl-accent` → `--accent`, etc. 28 tokens, 206 call sites, 17 files. Values
  unchanged. One exception noted in the map: `--tmpl-font-body` → `--font-body-face`
  (avoids colliding with the existing `--font-body` Tailwind alias).
- **Legacy palette collapse** (`sky`+`orange` share `#007aff`):

  | old class stem | new | value | uses |
  |---|---|---|---|
  | `sky`, `orange` | `accent` | `#007aff` | 1324 + 135 |
  | `sky-light`, `orange-dark` | `accent-hover` | `#0063d1` | — |
  | `navy` | `ink` | `#1d1d1f` | 809 |
  | `navy-light` | `ink-muted` | `#424245` | — |
  | `sand` | `cream` | `#f4f1ea` | 1 |

  Applies across `bg|text|border|ring|from|to|via|fill|stroke` and
  `hover:`/`group-hover:` variants (word-boundary regex per family). The 135
  `orange` sites are audited individually per §5 Wave 4.2, not blind-replaced.
