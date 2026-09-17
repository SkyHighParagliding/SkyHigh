---
title: Map UI Style Guide (Wind / Thermal / Meteogram)
tags: [maps, ui, style-guide, wind, thermal, meteogram, airspace]
status: adopted 2026-09-16 — rollout in progress
---

# Map UI Style Guide

The single source of truth for how **every** wind / thermal / meteogram map looks
and behaves — site picker, site page, admin previews, embedded and fullscreen.
New map surfaces or modifications MUST follow this. Decisions locked with Jon
2026-09-16.

## Surfaces this governs
- **Site picker** (`SitesWindMap`) — Sites page
- **Site wind map** (`WindMapProto` / `WindMap`) — site weather card + admin preview
- **Site thermal panel** (`SiteThermalPanel`) — site weather card Thermal tab
- **Meteogram chart** (`SiteMeteogramChart`) — chart mode
- Out of scope: the **XC map** (`XCMap`, Leaflet) — deliberately a different stack.

## The rules

### 1. One unified component (decision 10A)
Wind, Thermal and Meteogram are **modes of one canonical map component**, used on
both the picker and the site page. Wind and Thermal are not separate components.
`Map` and `Chart` (meteogram) become the **third option** in the same mode switch.
Target switch: **Wind · Thermal · Chart** (Chart only where a single site is in
context; the picker has no Chart mode).

### 2. Mode switch always visible; legend collapsible (decision 1C → hybrid B, 2026-09-16)
- The **Wind · Thermal · Chart mode pill is always visible** (it's the primary
  control) — the picker's rounded segmented pill with icons, inside the map top-left.
- The **legend collapses behind a "Key" pill** (bottom-left): default = bare map
  + mode pill + Key pill; tap the Key → legend panel expands; tap again (or ✕) →
  collapse. Only the legend hides — never the mode switch.

### 3. Readout / data box (decision 3A + 4A)
- **Stacked** — one value per line, never a side-by-side strip.
- **Top-left**, dark rounded box (`bg-black/75`), with a **✕ to dismiss**.
- Dismiss clears the pin fully (pin + box + crosshair) — see `dismissRef`/`clearPinRef`.
- Lines, in order: mode-specific strength/summary, then BL Top, Cu Base, (Rain),
  Ground — or Wind speed/dir, Ground for wind mode.

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

### 6. Time scrubber — pull-out tray (decision 5B)
A **pull-out tray/tab** (`WindMapScrubberTray` idiom) on every surface, embedded
and fullscreen. Not an always-visible slider.

### 7. Fullscreen == embedded (decision 6A)
Fullscreen shows the **identical chrome** — same Key/mode switch, legend, readout,
scrubber — just larger. No mode/controls hidden in fullscreen.
- **Fullscreen toggle button is top-right** on every surface (2026-09-16). The
  top-left is for the mode toggle + readout; bottom-left for the Key; bottom for
  the scrubber tray.

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

## Rollout (see RESUME_HERE for live status)
1. **Stage 1 ✅** — AMSL + airspace on the picker readouts (done, `377d007`).
2. **Stage 2** — canonical collapsible Key (mode switch + legend) on the picker,
   remove `overlayLevel`; stacked top-left readout; pull-out scrubber retained.
3. **Stage 3 ✅** — bring the site wind map (`WindMapProto`) onto the same chrome:
   stacked AMSL readout **hidden until tap** with ✕, Key pill raised to clear the
   collapsed scrubber tab, the **Today/7-day toggle moved into the tray** (before
   play), and **fullscreen == embedded** — the `WeatherCard` wind-map portal lost
   its header bar; the map now carries its own **top-right minimize** button (new
   `onExitFullscreen` prop) + Esc-to-close.
4. **Stage 3b ✅** — bring the site thermal panel (`SiteThermalPanel`) onto the
   same chrome: pull-out `WindMapScrubberTray` with play/pause + speed (replacing
   the manual slider), stacked top-left readout with airspace warnings, Key pill,
   top-right fullscreen toggle, and fullscreen == embedded (the separate
   fullscreen header/slider was removed). The launch site's own reading now rides
   in the tray's bottom row (new optional `readout` slot on the tray). Map/Chart
   stays a header switch for now — Chart replaces the map, so an on-map mode pill
   needs the full component merge below.
5. **Stage 4** — unify: the site page uses the one component (Wind/Thermal/Chart
   as one on-map mode switch), retiring the split between `WindMapProto` and
   `SiteThermalPanel`. Deferred (largest change).
