---
title: 3D Flight Replay (GPX Upload → MapLibre Viewer) — Future Option
tags: [maps, flight-tracker, gpx, 3d, webgl, maplibre, replay, future]
status: Proposed / not scheduled — foundation data already exists
updated: 2026-09-19
---

# 3D Flight Replay

A per-flight **3D replay**: the pilot uploads a `.gpx` from their vario (or picks a
recorded flight), and the track plays back as a line at true altitude over a
terrain-draped 3D map, with a moving glider marker and a playback scrubber.

> **Key framing:** the enabler is adopting a **WebGL / GL engine (MapLibre GL JS)** —
> which is also what CARTO **vector** basemaps need ([[future/vector-basemaps]]). But
> the two are **independent decisions**: 3D replay works with a *raster* basemap draped
> over a DEM, and would live as its **own standalone map surface** (like the XC map is
> its own Leaflet stack — [[12-map-ui-style-guide]] scope note). It does **not** require
> converting the Canvas 2D wind/thermal maps.

## What already exists (most of the groundwork)

- **3D track data.** The Flight Tracker records breadcrumbs as lat/lon/**altitude**/time
  (baro-fused altitude; migration `042_breadcrumbs`, `useFlightTracker.ts`,
  `flightDb.ts`, `server/routes/flights.ts`). That *is* a 3D flight path.
- **GPX already understood.** Flights **export** to IGC and GPX today (`generateIGC` /
  `generateGPX` in `FlightHistory.tsx`, `GET /api/flights/... ?format=gpx`). Parsing an
  uploaded vario GPX back into the same breadcrumb shape is the mirror of existing code.
- **Terrain elevation.** Client-side terrarium DEM sampling already ships (DECISION-011,
  `windmap/terrainTiles.ts`); MapLibre can consume the same style of raster-DEM tiles for
  its 3D surface.

## What's new (the actual feature)

1. **GPX import** — upload + parser (today it's export-only). Accept vario GPX (and
   likely IGC, since we already read/write it), normalise to the breadcrumb shape
   (lat/lon/alt/time), sanity-check altitude source (GPS vs baro), store or hold in memory.
2. **MapLibre 3D viewer** — a new standalone page/component: `setTerrain` (raster-DEM) +
   sky layer + camera pitch/bearing, the track as a 3D line at true altitude, and a
   glider marker. Raster CARTO basemap is fine to start; vector optional later.
3. **Replay controls** — a playback timeline/scrubber animating the marker along the
   track over time (play/pause/speed), with camera modes: **chase** (behind the glider),
   **orbit**, and **free**. Live readout (altitude AMSL + AGL via the DEM, climb rate,
   ground speed) mirrors the tapped-point readout idiom.

## Nice-to-haves (later)

- **Airspace in 3D** — extrude the OpenAIP sectors we already have to their floor/ceiling
  and show the track punching through them (ties into the existing airspace conflict
  logic, `src/lib/airspaceConflict.ts`).
- **Thermal cores** — colour the track by climb rate; optionally overlay that day's
  thermal grid so the replay shows *where the lift was* vs where the pilot found it.
- **Multi-track** — replay several pilots' flights together (comps / XC league).
- **Share link / embed** — a deep-linked replay for a flight in the XC history.

## Why it's a clean, low-risk add

- **Standalone surface.** No change to the Canvas 2D wind/thermal maps; no overlay
  re-plumbing. Isolated blast radius.
- **Data already flows.** Breadcrumb schema, altitude, GPX read/write, and terrain
  sampling all exist — the new work is the viewer + import, not the pipeline.
- **Incremental.** A v1 can be raster-basemap + terrain + a single track + basic scrubber;
  vector basemap, airspace extrusion, and thermal overlays are additive.

## Dependencies / decisions to make when scheduled

- **Engine:** MapLibre GL JS (open, no token) vs Mapbox GL JS (token, richer). MapLibre is
  the natural pick — free, and pairs with the CARTO raster/vector we already use.
- **Bundle weight:** MapLibre is sizeable — lazy-load the replay route so it never touches
  the main app bundle (the wind maps already lazy-load their canvases).
- **Altitude honesty:** vario GPX altitude may be baro or GPS; label which, and compute AGL
  against the DEM rather than trusting the file's ground reference.
- **Where it lives:** likely under the XC / Flight History area (open a recorded flight in
  3D, or upload a GPX), not the site weather maps.

## Relationship to other future notes

- Shares the "adopt MapLibre GL" foundation with [[future/vector-basemaps]] — if both are
  wanted, do the engine adoption once and reuse it. But either can proceed alone: 3D replay
  needs the GL **engine + DEM**, not vector tiles.
