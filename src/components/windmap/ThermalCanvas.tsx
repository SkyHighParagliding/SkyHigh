import { useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { zoomIdentity } from 'd3-zoom';
import { geoMercator } from 'd3-geo';
import type { SiteMarker, ZoomSetpoints } from '../windMapTypes';
import { DEFAULT_ZOOM_SETPOINTS } from '../windMapTypes';
import { getThermalAt } from './thermalInterpolation';
import type { ThermalGrid } from './thermalInterpolation';
import type { WindGrid } from './windInterpolation';
import { fetchElevationAt } from './elevationPoint';
import { createThermalOverlay, maybeRebuildThermalOverlay, drawThermalOverlay, DEFAULT_THERMAL_TUNING } from './thermalRenderer';
import type { ThermalTuning } from './thermalRenderer';
import { useSettings } from '@/contexts/SettingsContext';
import { createCumulusField, rebuildCumulusField, drawCumulusField } from './cumulusField';
import { createParticlePool, updateAndDrawParticles } from './particleRenderer';
import { drawSiteMarkers } from './siteMarkerRenderer';
import { MapCanvas } from './MapCanvas';
import type { MapLayer, MapPin } from './MapCanvas';

/**
 * The wind map draws white trails over a black basemap. The thermal map's
 * basemap is pale grey and its ramp runs through warm oranges, so white
 * vanishes. A dark near-navy reads against both extremes, and the reduced
 * opacity keeps the flow legible without competing with the heat field the
 * pilot is actually there to read.
 */
const THERMAL_WIND_TRAIL_STYLE = { rgb: '15, 23, 42', opacityScale: 0.55 };

interface ThermalCanvasProps {
  thermalGrid: ThermalGrid;
  currentTime: number;
  siteLat: number;
  siteLon: number;
  siteMarkers?: SiteMarker[];
  onSiteClick?: (site: SiteMarker, screenX: number, screenY: number) => void;
  onThermalInfoChange?: (info: { cape: number; blh: number; wstar?: number; ccl?: number; precip?: number; weatherCode?: number; groundAmsl?: number } | null) => void;
  sizeKey?: number;
  savedCenterLat?: number;
  savedCenterLon?: number;
  savedZoom?: number;
  onTransformChange?: (lat: number, lon: number, zoomLevel: number) => void;
  /** Optional wind grid. When combined with showWind, overlays wind flow lines. Off by default. */
  windGrid?: WindGrid;
  /** When true and windGrid is provided, renders wind particle trails on the thermal map. */
  showWind?: boolean;
  /**
   * Particle density/speed curve for the wind overlay. Must be the curve the
   * wind map is using, or the same wind reads as a far sparser flow here than
   * it does one toggle away.
   */
  zoomSetpoints?: ZoomSetpoints;
}

export const ThermalCanvas = memo(function ThermalCanvas({
  thermalGrid, currentTime, siteLat, siteLon,
  siteMarkers, onSiteClick, onThermalInfoChange,
  sizeKey, savedCenterLat, savedCenterLon, savedZoom,
  onTransformChange, windGrid, showWind, zoomSetpoints = DEFAULT_ZOOM_SETPOINTS,
}: ThermalCanvasProps) {
  const siteMarkersRef = useRef(siteMarkers);
  siteMarkersRef.current = siteMarkers;
  const onThermalInfoChangeRef = useRef(onThermalInfoChange);
  onThermalInfoChangeRef.current = onThermalInfoChange;
  // Held in a ref, as WindCanvas does, so retuning the setpoints does not
  // change the layer list identity and tear down the map shell.
  const zoomSetpointsRef = useRef(zoomSetpoints);
  zoomSetpointsRef.current = zoomSetpoints;

  // Admin-tunable thermal thresholds (Admin → Forecast). Each falls back to the
  // renderer default, so an unset setting reproduces today's map exactly. Held
  // in a ref so the per-frame draw closure reads the latest without rebuilding
  // the layer list. Folded into the overlay cache key inside
  // maybeRebuildThermalOverlay, so a changed value forces a rebuild on reload.
  const { settings } = useSettings();
  const numOr = (v: unknown, d: number) => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : d; };
  const tuning = useMemo<ThermalTuning>(() => ({
    clearSkyCloudPct: numOr(settings.thermalClearSkyCloudPct, DEFAULT_THERMAL_TUNING.clearSkyCloudPct),
    overcastOnsetPct: numOr(settings.thermalOvercastOnsetPct, DEFAULT_THERMAL_TUNING.overcastOnsetPct),
    overcastFullPct:  numOr(settings.thermalOvercastFullPct,  DEFAULT_THERMAL_TUNING.overcastFullPct),
    minWstar:         numOr(settings.thermalMinWstar,         DEFAULT_THERMAL_TUNING.minWstar),
    stormCapeGate:    numOr(settings.thermalStormCapeGate,    DEFAULT_THERMAL_TUNING.stormCapeGate),
    rainOffMm:        numOr(settings.thermalRainOffMm,        DEFAULT_THERMAL_TUNING.rainOffMm),
  }), [settings.thermalClearSkyCloudPct, settings.thermalOvercastOnsetPct, settings.thermalOvercastFullPct, settings.thermalMinWstar, settings.thermalStormCapeGate, settings.thermalRainOffMm]);
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;

  const currentTimeRef = useRef(currentTime);
  // Monotonically increasing counter — used to discard stale elevation responses.
  const elevationSeqRef = useRef(0);
  // Last resolved ground elevation, tagged with the pin it belongs to.
  const elevationForPinRef = useRef<{ key: string; value: number } | null>(null);
  // The pin position an elevation lookup has already been dispatched for. Set
  // before the request resolves, so the readout layer below cannot fire a
  // duplicate on every subsequent frame.
  const elevationRequestedKeyRef = useRef<string | null>(null);
  const projectionRef = useRef<ReturnType<typeof geoMercator> | null>(null);
  const transformRef = useRef(zoomIdentity);

  // The pin lives in a ref, not state: the readout runs inside the render loop
  // and must see the live value without re-running the layer memo.
  const pinnedCrosshairRef = useRef<MapPin | null>(null);
  // Readout throttle, matching the wind map: at most 10fps into parent state.
  const lastThermalInfoUpdateRef = useRef(0);

  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  const bounds = useMemo(() => ({
    lonMin: thermalGrid.lonMin,
    lonMax: thermalGrid.lonMax,
    latMin: thermalGrid.latMin,
    latMax: thermalGrid.latMax,
  }), [thermalGrid]);

  const layers = useMemo((): MapLayer<any>[] => {
    // Layer 0: combined thermal overlay + cumulus stipple.
    // The cumulus rebuild needs the overlay object, so they share one create() return value.
    // Cumulus stipple sits above the heat raster but below the site markers so
    // pilots see the texture without it obscuring the interactive pin targets.
    const heatAndCumulus: MapLayer<any> = {
      create: (w: number, h: number) => ({
        overlay: createThermalOverlay(w, h),
        field: createCumulusField(w, h),
      }),
      dispose: (res: { overlay: ReturnType<typeof createThermalOverlay>; field: ReturnType<typeof createCumulusField> }) => {
        if (res.overlay.rebuildTimeout) clearTimeout(res.overlay.rebuildTimeout);
      },
      draw: (c, res: { overlay: ReturnType<typeof createThermalOverlay>; field: ReturnType<typeof createCumulusField> }) => {
        maybeRebuildThermalOverlay(res.overlay, c.transform, c.transformRef, c.projection, currentTimeRef, thermalGrid, tuningRef.current);
        drawThermalOverlay(c.ctx, res.overlay, c.transform);
        rebuildCumulusField(res.field, res.overlay, c.transform);
        drawCumulusField(c.ctx, res.field, c.transform);
      },
    };

    // Layer (optional): wind particle trails.
    // Wind draws above the heat raster and cumulus stipple but below the site
    // markers so the flow lines never obscure the interactive pin targets.
    const windLayer: MapLayer<any> = {
      create: (w: number, h: number) => createParticlePool(w, h),
      draw: (c, p: ReturnType<typeof createParticlePool>) => {
        updateAndDrawParticles(
          c.ctx, p, c.width, c.height, c.transform, c.projection,
          currentTimeRef.current, windGrid!, zoomSetpointsRef.current,
          THERMAL_WIND_TRAIL_STYLE,
        );
      },
    };

    // Layer last: site markers — always on top so pins remain interactive.
    const markers: MapLayer<any> = {
      draw: (c) => {
        const m = siteMarkersRef.current;
        if (m && m.length > 0) drawSiteMarkers(c.ctx, m, c.transform, c.projection, c.todayStr, true);
      },
    };

    // Readout layer — throttled to 10fps, mirroring the wind map's.
    //
    // This has to run in the render loop rather than in an effect. The pin is
    // fixed in SCREEN space, so what sits underneath it changes whenever the
    // transform changes — but the transform lives in a ref, and mutating a ref
    // re-renders nothing. An effect keyed on the pin and the time therefore
    // never re-runs while panning, and the panel keeps reporting the point that
    // was under the cross at the moment of the tap. Reading currentTimeRef here
    // covers the time slider too, so this replaces the effect outright.
    const readout: MapLayer<any> = {
      draw: (c) => {
        const pin = pinnedCrosshairRef.current;
        if (!pin) return;
        const now = performance.now();
        if (now - lastThermalInfoUpdateRef.current <= 100) return;
        lastThermalInfoUpdateRef.current = now;

        const geo = c.projection.invert!(c.transform.invert([pin.x, pin.y]));
        if (!geo) return;

        const th = getThermalAt(geo[0], geo[1], currentTimeRef.current, thermalGrid);
        if (!th) { onThermalInfoChangeRef.current?.(null); return; }

        // Terrain doesn't change with the time slider, so reuse the elevation
        // already resolved for this pin. Without this the readout would blink
        // out and back as each pass re-emitted without groundAmsl first.
        const pinKey = `${geo[0].toFixed(4)},${geo[1].toFixed(4)}`;
        const known = elevationForPinRef.current;
        const cached = known?.key === pinKey ? known.value : undefined;

        // Emit immediately so the panel never blocks on the network.
        onThermalInfoChangeRef.current?.({ ...th, groundAmsl: cached });
        if (cached !== undefined || elevationRequestedKeyRef.current === pinKey) return;

        elevationRequestedKeyRef.current = pinKey;
        const seq = ++elevationSeqRef.current;
        fetchElevationAt(geo[0], geo[1]).then(groundAmsl => {
          // Discard if a newer lookup has already been dispatched, so tapping
          // point B mid-flight cannot show point A's ground.
          if (seq !== elevationSeqRef.current) return;
          if (groundAmsl === null) return;
          elevationForPinRef.current = { key: pinKey, value: groundAmsl };
          // Re-emit rather than wait for the next throttled pass. A resident
          // terrain tile resolves in a microtask, so without this the ground
          // line would blink empty for a full throttle window on every pin
          // position — which, while panning, is most of the time.
          onThermalInfoChangeRef.current?.({ ...th, groundAmsl });
        });
      },
    };

    const l: MapLayer<any>[] = [heatAndCumulus];
    if (showWind && windGrid) l.push(windLayer);
    l.push(markers);
    l.push(readout);
    return l;
  }, [thermalGrid, windGrid, showWind]);

  const handlePinChange = useCallback((pin: MapPin) => {
    pinnedCrosshairRef.current = pin;
    // Let the next readout pass emit straight away rather than waiting out the
    // throttle window, so a tap feels instant.
    lastThermalInfoUpdateRef.current = 0;
  }, []);

  return (
    <MapCanvas
      bounds={bounds}
      siteLat={siteLat}
      siteLon={siteLon}
      singleSiteZoom={savedZoom ?? 9}
      siteMarkers={siteMarkers}
      savedCenterLat={savedCenterLat}
      savedCenterLon={savedCenterLon}
      savedZoom={savedZoom}
      sizeKey={sizeKey}
      layers={layers}
      onTransformChange={onTransformChange}
      onSiteClick={onSiteClick}
      markerHitSuppressesPin={true}
      onPinChange={handlePinChange}
      projectionRef={projectionRef}
      transformRef={transformRef}
      containerClassName="relative w-full h-full bg-[#e8e8e8] cursor-crosshair touch-none overflow-hidden"
      hoverCrosshairClassName="bg-black/30"
      pinnedCrosshairColor="rgb(249, 115, 22)"
    />
  );
});
