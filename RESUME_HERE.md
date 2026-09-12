# RESUME_HERE — Last updated: 2026-09-13 (session 57)

## Project: SkyHigh
## Status: Active

## Where I left off

Session 57 finished the **Ground AMSL readout** and then made it fast. Everything
is committed and **pushed — `origin/main` is in sync, 0 commits ahead.**

**What shipped:**

| Commit | What |
|---|---|
| `83940cb` | Ground AMSL in the all-sites thermal point interrogator |
| `572834c` | Ground AMSL on all-sites wind-mode map taps |
| `0a4ccd9` | Unclipped the phone readout panel, 3-state INFO cycle, first cut of the client terrain sampler |
| `6bdaf84` | Ground AMSL in the **site-level** thermal and wind readouts |
| `8e6f39e` | Local terrain-tile sampling replaces the per-tap API call |
| (this session's last) | Docs/wiki/spec sweep + DECISION-011 and DECISION-012 |

**The performance finding that killed the original plan.** Jon's first idea was to
pre-bake a DEM into Postgres as a lookup grid. Measured against production first:
`/api/health` 461–465 ms vs a *warm* `/elevation-at` 464–496 ms — so the elevation
work is only ~5–30 ms and the lag is almost entirely network round-trip. A Postgres
DEM would have optimised the fast part and left the 465 ms. Chose client-side
terrarium-tile sampling instead, which removes the round-trip outright.
Full reasoning in `wiki/03-decisions-log.md` → **DECISION-011**.

Verified end to end in the browser: a tap on a prefetched map centre issues
**zero** `/elevation-at` requests and still reads `Ground 730m`; an isolated
sampler check agreed with the server to 0.01 m (457.0247563323889 m) in ~0.2 ms.

## Last completed task
- TASK-TERRAIN-001/002/003 (wiki/02-tasks.md Phase 11) — Ground readout, client-side
  sampling, CC BY 4.0 attribution — completed 2026-09-13.

## Currently in progress
None. Clean tree apart from two long-standing unrelated modifications to
`server/data/siteguide_airspace.txt` and `server/data/siteguide_zones.json`
(deliberately excluded from every commit this session — decide what to do with them).

## Next task to start
Jon's stated next item is **TASK-030 (Siteguide Version Change Email Notification)**.
Two smaller things are queued and ready if he'd rather clear the decks:

1. **TASK-SW-001 — consolidate the two service workers.** `public/sw.js`
   (registered by `src/main.tsx`) and `public/sw-tiles.js` (registered by
   `src/hooks/useXCMapState.ts`) both claim scope `/`. Only one can own it, and
   `sw.js` has **no fetch handler** *and* deletes every cache on activate. So the
   terrain caching added to `sw-tiles.js` only takes effect on the XC map, and
   terrain tiles re-download once per session elsewhere. Harmless today (the
   in-memory LRU + prefetch already remove the tap latency) but it's real.
   Caveat is documented in a comment at the top of `public/sw-tiles.js`.
2. **R2 mirror of the z12 terrain pyramid** — 18,288 tiles ≈ 0.37 GB, inside the
   10 GB free tier, served with `Cache-Control: immutable` behind the existing
   `VITE_TERRAIN_TILE_URL` env var. Needs bucket setup + a bulk upload, which is
   infrastructure Jon may prefer to drive himself. Not required for correctness.

## Open questions / blockers

- **Jon asked to be reminded** of these cleanups (still outstanding, do not action silently):
  - `CLAUDE.md` Section 0 and `wiki/00-overview.md` still claim **"white-label ready"**,
    which is no longer true and now actively contradicts DECISION-012.
  - Delete the alternative-site-design code.
  - `GridBoundsSelector.tsx` still says "Fine 0.15°" despite the Fine → Wind rename.
  - ~130 untracked debugging PNGs sitting in the repo root.
- **Never authenticate to production using `DEFAULT_ADMINS` from the local `.env`.**
  Jon performs privileged production actions himself via the admin UI.

## Quick context refresher

Ground elevation is now sampled **in the browser**. `terrainTiles.ts` fetches AWS
Open Data terrarium tiles (z12, ~30 m/px, no API key) and decodes them with the same
bilinear maths as `server/grid/elevationPoint.ts`; `elevationPoint.ts` (client) is a
two-tier facade that tries the local tile first and falls back to
`GET /api/weather/elevation-at` only when the tile isn't resident, firing a
background tile warm so the next tap is local. Both canvases prefetch the 3×3 z12
block around the map centre, debounced 300 ms.

Two things in there are load-bearing and look like tidy-up bait:
- `sampleElevationSync` is **three-valued** — `undefined` = tile not resident,
  `null` = authoritative no-data (ocean), `number` = metres. Tier 1 must
  short-circuit on **both** `number` and `null`, or every ocean tap goes to the API forever.
- The background tile warm is **deliberately not awaited**. AWS tile latency from
  Australia is 730–940 ms vs ~465 ms for the API, so awaiting it would make cold
  taps *slower*.

The CC BY 4.0 attribution in `ThermalHelpModal.tsx` and the wind map legend is a
**licence obligation** for the Geoscience Australia data — don't remove it.
