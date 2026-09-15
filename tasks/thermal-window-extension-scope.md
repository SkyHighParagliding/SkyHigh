# Scoping — extending the thermal map forecast window (currently 48h)

**Status:** scoping only, nothing changed. Requested 2026-09-15.

## 1. Current state

- The thermal grid fetches **2 days ≈ 48 h**, set by `const FORECAST_DAYS = 2` in
  `server/grid/pipeline.ts:45`.
- `FORECAST_DAYS` is **shared by both grids** — the Wind (fine, 0.15°) grid and
  the Thermal (0.09°) grid both fetch through `pipeline.fetchGrid`, which passes
  this one constant as `forecast_days` to every provider (`pipeline.ts:309`).
- Time axis (`grid/time.ts`) is generic: Melbourne-midnight origin + N whole
  local days. No hard-coded 48 h assumption — it scales with `FORECAST_DAYS`.
- Primary source: Open-Meteo REST `models=ecmwf_ifs` (`utils/openMeteo.ts`),
  hourly. Fallback tiers include the direct `ecmwf_ifs025` `.om` reader
  (`providers/ecmwfLiftedIndex.ts`), which carries **312 h (~13 days) at 3-hourly**.
- Thermal grid size: 0.09° over Victoria land, **~6,173 points**, ~8 tiles,
  `MAX_POINTS_PER_TILE = 1000`. Stored as JSON in `wind_grid_data`, `RETAIN_DAYS = 7`.

## 2. What's available upstream

| Source (tier) | Max range | Resolution |
|---|---|---|
| Open-Meteo `ecmwf_ifs` (primary) | ~7 days* | hourly first ~3–5 days, 3-hourly after (Open-Meteo up-samples) |
| Direct `ecmwf_ifs025` `.om` (fallback) | ~13 days (312 h) | 3-hourly |
| GFS (lower tier) | ~16 days | 3-hourly / coarser |

*Confirm the exact `forecast_days` cap Open-Meteo allows for `ecmwf_ifs` before
building — treat 7 as indicative, not verified here.

So the 48 h cap is **our choice, not a source limit.** 3–5 days is comfortably
available at usable resolution; 7+ is possible but degrades to 3-hourly.

## 3. The real costs of extending

1. **Open-Meteo rate limits (biggest).** The free tier meters by *data volume*
   ≈ points × hours × variables (see `memory/feedback.md`, 2026-09-09). Thermal is
   already the dense grid and today takes 1–2 min with a 4-step retry chain.
   Volume scales **linearly** with hours: 48 h → 96 h doubles it, → 120 h (5 days)
   is 2.5×. Higher 429 risk and longer fetches.
2. **Shared constant.** Bumping `FORECAST_DAYS` naively extends the **Wind grid
   too**, doubling *its* volume for no thermal benefit. Extending thermal alone
   needs `forecastDays` moved into the per-kind `GridKind` config (small refactor).
3. **Storage.** JSON blob per point × 6,173 points grows linearly with hours.
   48 h → 120 h ≈ 2.5× the thermal grid rows. Manageable, not free.
4. **Resolution honesty.** Beyond ~3–5 days it's 3-hourly; the map's temporal
   interpolation (`getThermalAt`) will still animate smoothly but the physics is
   coarser — worth a UI note so pilots don't over-trust day 5+.
5. **Playback UX.** The time slider (`useWindPlayback`, 15-min steps in `today`
   mode) would span far more range. A 5-day window at 15-min steps ≈ 480 slider
   positions — fine functionally, but a coarser step or day markers would help.
6. **Render window** — NOT a blocker: the 36 h window in `grid/extract.ts` is the
   fine-grid *site-point* forecast (tide positioning), separate from the thermal
   map, which renders whatever hours the thermal grid holds.

## 4. Options

- **A — one-line bump (`FORECAST_DAYS = N`).** Cheapest. But extends BOTH grids;
  doubles/triples wind + thermal volume together. Not recommended beyond 3 days.
- **B — per-kind window (recommended).** Move `forecastDays` into `GridKind` so
  Wind stays 2 days and Thermal goes to N. Contained volume increase; ~½ day of
  work (config threading + the retry/axis paths already generic).
- **C — B + coarsen the tail.** Fetch hourly for 48 h, 3-hourly for days 3–N, to
  cap volume/rate-limit growth. Most robust for 5–7 days, most work (mixed-step
  axis + merge handling).

## 5. Recommendation

**Option B, target 3–4 days (72–96 h) for the thermal map.** It roughly matches
the useful convective-forecast horizon, keeps resolution honest (mostly hourly),
and holds the rate-limit/storage increase to ~1.5–2×, which the existing retry
chain can absorb. Revisit Option C only if we later want 5–7 days.

**Effort:** ~0.5–1 day. **Risk:** medium — the failure mode is Open-Meteo 429s,
so it needs live verification on the real grid (not a spike), watching the fetch
duration + retry status, ideally across a couple of daily cron runs.

**Verify before shipping:** (1) confirm Open-Meteo `ecmwf_ifs` `forecast_days`
cap; (2) one live thermal fetch at the new N, measure duration + 429 rate +
resulting blob size; (3) confirm the map slider + `getThermalAt` handle the
longer axis; (4) add the "day 3+ is coarser" note to the thermal help modal.
