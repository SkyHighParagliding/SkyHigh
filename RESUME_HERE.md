# RESUME_HERE — Last updated: 2026-09-15 (session 62)

## Project: SkyHigh
## Status: Active — on `main`, everything below is deployed to production

```
branch: main   (== origin/main; Railway auto-deploys main)
```

The `chore/remove-multi-branding` branch was merged to `main` and pushed; the
whole de-brand plus a run of follow-ups are **live on production** and verified.

## What shipped this session (all live)

- **De-brand / native single-club (Waves 1–4).** Removed the multi-template /
  white-label engine; froze Wonderful White as static CSS; renamed `--tmpl-*` →
  semantic tokens and the legacy palette → `accent`/`ink`/`cream`; deleted
  `templates/` (headers/footers now `components/SiteHeader`/`SiteFooter`). Zero
  pixel change verified (39/39 tokens vs prod baseline). DECISION-014 recorded.
- **CSP hotfix** (`server.ts`): the prod security headers had `default-src 'self'`
  with **no `frame-src`**, blocking all third-party iframes (Ground Handling
  Google My Maps, Insta Wall) and geolocation + the terrarium elevation fetch.
  Added `frame-src` (google.com, instagram.com), `connect-src` (s3.amazonaws.com,
  basemaps.cartocdn.com), `geolocation=(self)`. Verified live.
- **Admin Manual keyword search** above Contents (partial-word, highlighted,
  jump links).
- **Weather Management manual** corrected (thermal is W*-based not CAPE; 7-Day =
  5:30am; three-state cloud/OD described; Admin→Forecast controls added).
- **Admin → Forecast** rebuilt: removed dead vaporware; the 5 thermal thresholds
  + default hour now genuinely drive the live renderer (`ThermalTuning`).
- **Ground Handling Map** manual section (managed via Site Options + Google My Maps).
- **Thermal coastal inset** — thermal paint clipped 1.5 km inland (`isThermalLand`)
  so the sea/immediate coast no longer reads as thermic.
- **3-day wind + thermal window** — `FORECAST_DAYS 2→3`; the map render window
  (`getTimeWindow` in `extract.ts`) was a separate 36 h cap, now `FORECAST_DAYS×24`
  for the map overlays (site-forecast/tide stays 36 h). Slider shows day-name
  markers (Today / Wed / Thu). Verified live: both grids span ~66 h.

## Revert points (historical — de-brand)

`pre-debrand-2026-09-15` tag, `backup/pre-debrand-2026-09-15` branch. No longer
needed day-to-day; keep until the de-brand has soaked in prod.

## Next / open items

- **Jon to eyeball prod over the next day or two** — the de-brand touched ~2,000
  palette sites and the thermal map is pilot-facing; nothing outstanding, just
  soak time.
- The daily crons now fetch 3 days for both grids; the first manual fetch ran
  56 s (wind) / 1:29 (thermal), no 429s — volume is comfortably within limits.
- **Undecided:** the two long-standing uncommitted edits to
  `server/data/siteguide_airspace.txt` and `siteguide_zones.json` (still excluded
  from every commit — decide keep or discard).
- Carried smaller items (unchanged): `TASK-036` is a **duplicate ID** in
  `wiki/02-tasks.md` (thermal work vs "Site Scheduled Closure Calendar") — pick
  one and sed it; `GridBoundsSelector.tsx` still says "Fine 0.15°" after the
  Fine→Wind rename; TASK-SW-001 (consolidate the two `/`-scope service workers);
  deferred R2 terrain-tile mirror.
- **Never authenticate to production using `DEFAULT_ADMINS`** from the local
  `.env`. Jon performs privileged prod actions himself via the admin UI.

## Quick context refresher

SkyHigh is permanently one club's site (native single-club — the template engine
is gone). The wind/thermal map now covers 3 days with a day-labelled slider and
admin-tunable thermal thresholds (Admin → Forecast). The CC BY 4.0 Geoscience
Australia attribution (thermal help modal / wind legend) is a licence obligation —
do not remove it. `.env` is drawn from 1Password at session start and wiped at end.
