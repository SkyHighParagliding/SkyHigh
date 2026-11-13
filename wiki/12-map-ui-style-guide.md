---
title: Map UI Style Guide (Wind / Thermal / Radar)
tags: [maps, ui, style-guide, wind, thermal, radar, meteogram, airspace]
status: adopted 2026-09-16 · rewritten 2026-10-04 — one component, in-card controls
---

# Map UI Style Guide

The single source of truth for how **every** wind / thermal / radar map looks and
behaves — site picker, site page, admin previews, embedded and fullscreen. New map
surfaces or modifications MUST follow this.

> **2026-10-04 — the model changed.** There is now **one** map component,
> `SitesWindMap` (`SitesWindMapProto`), used everywhere. The old per-site surfaces
> (`WindMapProto`/`WindMap`, `SiteThermalPanel`) and the pull-out scrubber tray
> (`WindMapScrubberTray`, `WindMapModeToggle`, `ModeSwitchPill`) are **deleted**.
> All controls live **inside the tapped-point card** (no pull-out tray, no separate
> "Key" pill). The three data layers are **Wind | Thermal | Radar** chosen by one
> segmented `LayerSelector` pill (see DECISION-016). Rules below are rewritten to match.

## Surfaces this governs
- **Site picker** (`SitesWindMap`) — Sites page: all site markers, pan/tap freely.
- **Single-site map** (`SitesWindMap` with `focusSite` + `startFullscreen`) — reached from
  the weather-card **"Map"** button; opens fullscreen, **pre-tapped at the site**, carrying
  the same Wind|Thermal|Radar pill. No separate per-site component.
- **Admin preview** (`SitesWindMap` with `focusSite`) — AdminWeather "Preview Wind Map".
- **Meteogram / SkewT / RASP** — point-modals reached from the thermal card's actions
  (`Chart` / `SkewT` / `RASP`), not separate map surfaces.
- Out of scope: the **XC map** (`XCMap`, Leaflet) — deliberately a different stack.

## The rules

### 1. One component, three layers
`SitesWindMap` is the only map component. The data layers — **Wind | Thermal | Radar** —
are three mutually-exclusive peers chosen by one segmented `LayerSelector` pill
(`windmap/LayerSelector.tsx`), **top-left, always visible**. Radar reuses whichever
canvas is mounted and suppresses its data overlay (DECISION-016). Thermal degrades out
of the pill when `featureThermalMap` is off. `Chart` (meteogram), `SkewT` and `RASP` are
**point-modal actions in the thermal card**, not layers.

### 2. All controls live in the tapped-point card
No pull-out tray, no separate "Key" pill. Once a point is tapped, a single dark card
(top-left, under the pill) holds everything: the forecast reading, the **in-card time
scrubber**, the layer **scale/legend**, the **base-map detail slider + town-names toggle**,
and (thermal) the point actions + airspace toggle. Before a tap: just the map + pill. The
`LayerSelector` pill is always visible; the card appears on tap and is dismissable (✕).

### 3. Readout / data card
- **Stacked** — one value per line, never a side-by-side strip. Top-left, `bg-black/75`,
  `min-w-[232px]`, with a **✕ to dismiss** (clears pin + card + crosshair — `dismissRef`/`clearPinRef`).
- **Style system (strict):** all text **10px** (9px for helper notes). `white/75` = static,
  **`sky-500` (hover `sky-400`) = tappable**. Tap-to-cycle idioms: speed units (kt→mph→kph),
  direction (compass↔degrees), the 12/24h clock. Zone dividers = `border-t border-white/10`.
- **Lines, in order.** Wind: Fcst time + speed/dir → Live (if within range at "now") → Ground
  → time pills → scale/legend → base-map. Thermal: Fcst time → strength → BL Top / Cu Base /
  Ground / (Rain) → actions (Scale · Chart · SkewT · RASP) → scale/legend → base-map. Radar:
  Ground → Rain-radar loop (Play + two-tone timeline) + opacity → scale → base-map + © RainViewer.
- **Base-map controls** (last zone, every layer): a **town-names toggle** + **base-map detail
  slider**, shared across layers and remembered per browser (`skyhigh.showMapLabels`,
  `skyhigh.basemapIntensity`). See rule 11.
- The point is **carried across a layer switch** (`focusSite`/`carriedGeoRef`/`setPinGeoRef`)
  so Wind↔Thermal↔Radar never needs a re-tap; a single-site map opens **pre-tapped**.

### 4. Altitudes — always AMSL (decision 8A)
Every altitude shows **" AMSL"** and is mean-sea-level. BL Top / Cu Base are AGL
in the data, so **add ground elevation**; fall back to " AGL" only until terrain
resolves. Applies to wind mode's Ground too. Values toggle m/ft via `<Altitude>`.

### 5. Airspace warning (decision 9A)
Anywhere a thermal height / cloudbase AMSL is shown, run the airspace check
(`src/lib/airspaceConflict.ts`, `/api/sites/xc/airspace`). Conflict → a red
`(Class C)` bracket after BL Top / Cu Base; tapping it outlines that sector on the
map, tap again to hide. Skips FIR/OCA/ground-obstacles.
- **Airspace ON/OFF** — the last line of the tapped-point box is an `Airspace
  ON/OFF` toggle that outlines **every** sector (not just a height conflict),
  independent of the red brackets. Drawn by `ThermalCanvas`'s `allAirspace` prop
  (viewport-culled, faint fill 0.08); the tapped conflict still draws emphasised
  (0.22) on top. State lives in the surface (`showAllAirspace`).

### 6. Tapped-point card — one layout for all three layers, folded by default on phones (2026-11-07)
Wind, Thermal and Radar use the **same card, same order**; only the contents change.

| Part | Wind | Thermal | Radar |
|---|---|---|---|
| Line 1 (time, sky) | "Sat 2:26 pm" | same | radar frame time + LIVE / FORECAST tag |
| Line 2 (main reading) | Fcst 12.0 kt / SSW | strength label (its colour) or overcast | "No rain here" / "Rain ≈ x mm/hr" |
| Line 3 | Live 4 kt S (when a station is near) | BL 1900m · Cu 1200m | Observed 9 min ago / Forecast, in 20 min |
| Time pills | -1h +1h -1D +1D | same | play/pause, -10m, +10m, Now |
| Pull tab | grabber + chevron | same | same |
| Details (open) | Live station, distance, gust | BL Top/Cu Base + airspace class, airspace list, rain, Wind line (wind-flow toggle) | radar loop bar (sky observed, amber nowcast) |
| then, on all | Ground → Scale/Chart/SkewT/RASP → legend (+ radar opacity) → Base map (+ © RainViewer) | | |

- Lines 1–3 share `READOUT_FONT_PX` (15px). No "Tapped point" title.
- **Fold:** tap the tab, or swipe down/up on the card's top part. Default folded on a phone
  with the map embedded in the page (`max-width: 639px` and not fullscreen), open in
  fullscreen and on wider screens; the choice is remembered per situation
  (`skyhigh.cardOpen.compact` / `.roomy` in localStorage). Folded ≈ 134px on a 358px phone map.
- **Forecast pills:** days 1–3 step 1 h on the hourly grid (the map opens on the nearest whole hour); stepping past it switches the
  wind map to the 7-day grid (daytime every 4 h), where the small steps jump to the next
  available time and are labelled with the real gap (+4h, +12h overnight). Thermal stops at
  its 3-day end; radar returns to the 3-day grid. 7-day times read "Wed 11, 11:00 am".
- **Radar pills** step one RainViewer frame (labelled with the real gap); Now = newest observed frame.
- Code: all in `SitesWindMap.tsx` (`forecastSlider`, `radarPills`, `radarTimeline`, the card
  IIFE). `RadarCardControls.tsx`, `WindMapScrubberTray`, `WindMapModeToggle` and
  `ModeSwitchPill` are deleted. The remaining sliders (base map, radar opacity) share
  `SLIDER_INPUT_CLS`.

### 7. Fullscreen == embedded (decision 6A)
Fullscreen shows the **identical chrome** — same pill, card, scrubber, legend — just larger.
Nothing is hidden in fullscreen.
- **Fullscreen/minimize toggle is top-right**; the `LayerSelector` pill + card are top-left.
- The map owns its own fullscreen overlay (`fixed inset-0 z-[10001]`), Esc, and back-button
  close. A **single-site map opens already fullscreen** (`startFullscreen`) and routes its exit
  to `onExitFullscreen` (the parent unmounts it) — there is no embedded single-site host.

### 8. Text sizes (decision 7A) — the readable scale
The thermal-panel scale, everywhere (no more 6–8px):
- Section header (e.g. "THERMAL STRENGTH", "Tapped point"): **10px**, semibold, uppercase
- Primary value / strength label: **12px** bold
- Data lines (BL Top, Cu Base, Wind, Ground, legend descriptions): **10–11px**
- Legend W* band labels: **10px**
- ✕ / info icons: **w-3.5 h-3.5**

### 9. Legend content & glyphs
Legend marks must match what the map draws:
- Cumulus: the SVG cumulus glyph (port of `traceCumulus`), not the ☁ emoji
- Overcast: grey swatch (rgb 150,154,160) · Rain: blue swatch (rgb 56,118,209)
- Overdevelopment: drawn hollow + filled triangles (not the words "hollow/solid")
- Wind-flow ON/OFF: a control inside the collapsible panel (per 1C)

### 10. Shared bits already standardised
- Admin → Forecast opacity knobs (grey overcast wash / rain wash) apply to all.
- `getAirspaceColor`, `getThermalStrength`, `effectiveWstar`, `<Altitude>`,
  `precipDescription`, `airspaceConflict` are the shared primitives — reuse, don't fork.

### 11. Base-map legibility — detail slider + town-names toggle (2026-09-19)
The CARTO `light_nolabels` base is near-white and the translucent heat/speed
overlay washes it out, hiding terrain the pilot uses to orientate. Two ref-driven
levers in `MapCanvas` fix this without a React re-render of the map:
- **Base-map detail slider** — after the overlay draws, the same base tiles are
  re-composited with `globalCompositeOperation = 'multiply'` at an alpha. Multiply
  leaves the near-white background (the overlay colour) ~untouched but darkens the
  base's own roads/rivers/borders back in. Do **not** "fix" wash-out by fading the
  overlay — that dims the data; darken the base instead.
- **Town names** — CARTO's transparent `light_only_labels` tiles (`L<key>` cache
  key) drawn **last, on top** of the overlay so names stay legible over the colours
  (~1 KB/tile). Never draw labels under the overlay.
- **Admin band (per map)** — the pilot's slider is a *position* 0–1; the effective
  multiply alpha is that position mapped into an admin `[floor, ceiling]` band set
  in **Admin → Forecast → "Base-map detail range"** (`windBasemapDetailFloorPct` /
  `…CeilPct`, `thermalBasemapDetailFloorPct` / `…CeilPct`; defaults 0/100 = the
  full range). Separate per map because the wind and thermal overlays bury the base
  by different amounts. Remap: `alpha = floor + position × (ceiling − floor)`,
  bounds order-safe. Lives in `SitesWindMap`; the labels toggle has no admin default
  (pure pilot preference).
- **Future option:** CARTO also offers **vector** basemaps (MapLibre GL) which could do
  the darken-roads / hide-labels restyling natively — but they need a WebGL renderer, not
  our Canvas 2D + D3 stack, so it's a rebuild, not a swap. Deferred; see
  [[future/vector-basemaps]].

### 12. Live stations overlay (2026-11-13)
- A **Stations** switch beside the Wind | Thermal | Radar pill turns observed-wind boxes on over any layer (remembered per browser). It is not a 4th layer (DECISION-016 stands).
- Box: rounded note box reading `9 G12` in the map's speed unit, point facing **downwind**, station at the flat tail (white dot). Text never reads upside down. Fill uses the wind-particle speed colours; stale (> 90 min) = grey dashed; possibly stuck (our site stations: same windy reading for 75+ min) = amber dashed outline plus an "Unchanged" note in the card; calm/no direction = round pill.
- Map time off "now": boxes drawn at 60% and the switch says "· Observed: now".
- Tap order: site marker (12 px) → station box (6 px slop) → map pin. A station tap opens the station card in the tapped-point slot (same layout as §6) with a 6 h chart; tapping elsewhere returns the normal card.

## History
The 2026-09-16 rollout (Stages 1–3b) brought AMSL/airspace readouts and the shared
pull-out-tray chrome onto the picker, the site wind map (`WindMapProto`) and the thermal
panel (`SiteThermalPanel`). Session 72 (2026-10-03) then redesigned the **picker** —
Wind|Thermal|Radar `LayerSelector`, the scrubber moved **into the card**, radar added
(DECISION-016) — which left the per-site surfaces behind on the old tray.

**Stage 4 ✅ (2026-10-04) — unified.** The site page now uses the one `SitesWindMap`
component via `focusSite` + `startFullscreen` (opens fullscreen, pre-tapped at the site).
The weather-card **"Map"** button launches it; the buried inland "Thermal" entry is gone
(thermal is a layer in the pill). `WindMapProto`/`WindMap`, `SiteThermalPanel`,
`WindMapScrubberTray`, `WindMapModeToggle` and `ModeSwitchPill` were **deleted**. The rules
above describe the unified result; this guide is now the live state, not a rollout plan.
