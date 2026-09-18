# server/data — do not hand-delete these files

This folder holds **auto-downloaded siteguide data** (git-tracked, not cache junk).
Leave them in place during any cleanup.

## Files

| File | What it is | Source |
|---|---|---|
| `siteguide_zones.json` | Flying-site zones — landing zones, no-go zones, powerlines, hazards (XCTrack JSON, converted to GeoJSON) | `https://siteguide.org.au/Downloads/XCTrackJson` |
| `siteguide_airspace.txt` | CASA airspace up to FL125 (OpenAir format) | `https://siteguide.org.au/Downloads/OpenAir` |
| `seeds/` | Seed data for first-run DB population | (local) |

## How they are written / refreshed

`server/utils/siteguideZoneData.ts` (`downloadAllZoneData`) fetches and parses both,
writing them here. It runs:

- **Automatically** on the daily siteguide **version check** (Admin → Scheduled Tasks →
  *Site Guide Version Check*, default 05:00 Melbourne) when a new version is detected —
  gated by the **Zone Data Auto-Download** toggle.
- **Manually** via Admin → Scheduled Tasks → *Zone Data Auto-Download* → **Fetch Now**
  (`POST /api/sites/xc/zones/refresh`).

The parsed result is also cached in memory (24 h TTL) and served to the maps via
`getZoneData()` / `getAirspaceData()`, which fall back to reading these files.

## If they go missing

Not fatal — the maps' zone/airspace layer just renders empty until the next download.
Restore with `git checkout -- server/data/siteguide_*` or click **Fetch Now**.

## Production note (Railway)

Railway's filesystem is **ephemeral**: a fresh 05:00 download persists only until the
next redeploy, after which prod falls back to whatever version is committed here. Commit
the refreshed files periodically if you want prod to carry current data between downloads.
The current version is recorded in the `zoneDataVersion` setting.
