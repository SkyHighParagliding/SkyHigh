---
title: Vector Basemaps (CARTO GL) — Future Option
tags: [maps, basemap, carto, vector, webgl, future]
status: Proposed / not scheduled — raster is the current, deliberate choice
updated: 2026-09-19
---

# Vector Basemaps (CARTO GL)

A note-to-future-self: CARTO offers full **vector** basemaps alongside the raster
tiles the wind/thermal maps use today. This records what's available, what it would
buy us, and why we are **not** adopting it now — so the trade-off is a decision, not
an oversight.

> **Current choice stands:** the maps render Canvas 2D + D3 with raster PNG tiles
> (see [[03-decisions-log]] DECISION-004). Base-map legibility is already solved by
> the multiply detail slider + `light_only_labels` town-names overlay
> (DECISION-015, [[12-map-ui-style-guide]] rule 11). Vector is only worth it as part
> of a larger map rebuild.

## What's available (verified live 2026-09-19)

CARTO serves Mapbox GL **style spec v8** JSON, backed by MVT vector tiles
(`tiles.basemaps.cartocdn.com/vector/carto.streets/v1/`), sprites, and glyph fonts:

- `positron-gl-style` — light/pale (vector sibling of our current `light_nolabels` raster)
- `dark-matter-gl-style` — dark
- `voyager-gl-style` — colourful, roads + labels
- `…-nolabels-gl-style` variants of each

Endpoint form: `https://basemaps.cartocdn.com/gl/<style>-gl-style/style.json`.
Same CARTO account/attribution obligations as the raster tiles ([[carto-basemap]]).

## What vector would buy us

- **Runtime restyling** — the biggest win. Darken roads, mute or hide labels, recolour
  water/land, or emphasise the coastline by editing the style at load, rather than the
  multiply re-pass + `only_labels` overlay we hand-built. The base-map detail slider and
  town-names toggle could become style tweaks instead of extra canvas passes.
- **Crisp labels/lines at every zoom** — text and strokes are rendered on the fly, so no
  blurring between raster zoom levels and no `@2x` juggling.
- **Rotation & tilt (pitch)** — a rotated/3D-perspective map, useful for terrain-aware
  orientation.
- **3D terrain / hillshade** — MapLibre can drape the basemap over a DEM; we already
  sample terrain client-side ([[03-decisions-log]] DECISION-011), so the data exists.
- **Smaller, sharper tiles** — vector tiles are typically lighter than raster PNGs and
  scale without re-fetching.
- **Collision-aware label placement** — the renderer hides overlapping labels
  automatically (our `only_labels` raster cannot).

## Why not now — the cost

- **Different renderer.** Vector needs **WebGL** (MapLibre GL JS or Mapbox GL JS). Our
  maps are Canvas 2D + D3 (`windmap/MapCanvas.tsx`), a deliberate DECISION-004 choice.
- **Overlay re-plumbing.** Every overlay — the heat/speed raster, wind particles, cumulus
  glyphs, airspace polygons, the pinned reticle, the AMSL readout hit-testing — is drawn
  on the 2D canvas and would have to move to GL custom layers or a synced overlay canvas.
  This is the bulk of the work, not the basemap swap.
- **New dependency + bundle weight** (MapLibre GL is sizeable) and a second set of tile
  caching/offline logic (our SW raster tile cache assumes PNG tiles — see
  [[carto-basemap]]).
- **No user-visible gain on its own.** The legibility problem that prompted this is
  already handled; vector alone doesn't add pilot value without the rebuild features
  above (rotation, 3D, dynamic styling).

## When to revisit

Bundle this with any future decision to:
- add **map rotation / tilt / 3D terrain**, or
- move to a single GL map engine across the app (wind/thermal **and** the XC Leaflet map), or
- make basemap appearance **fully admin-restyleable** at runtime.

At that point, re-open as a proper decision (options: MapLibre GL + CARTO vector vs
staying raster) and reassess the overlay-migration cost against the feature set above.

**Related:** [[future/3d-flight-replay]] shares the same "adopt MapLibre GL" foundation
(GL engine + DEM). If both are wanted, do the engine adoption once and reuse it — but
either can proceed alone; the 3D replay needs the GL engine, not vector tiles.
