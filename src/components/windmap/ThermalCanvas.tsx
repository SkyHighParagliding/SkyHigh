import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { zoomIdentity } from 'd3-zoom';
import { geoMercator } from 'd3-geo';
import type { SiteMarker, ZoomSetpoints } from '../windMapTypes';
import { DEFAULT_ZOOM_SETPOINTS } from '../windMapTypes';
import { getThermalAt } from './thermalInterpolation';
import type { ThermalGrid } from './thermalInterpolation';
import type { WindGrid } from './windInterpolation';
import { fetchElevationAt } from './elevationPoint';
import { createThermalOverlay, maybeRebuildThermalOverlay, drawThermalOverlay } from './thermalRenderer';
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
  onThermalInfoChange?: (info: { cape: number; blh: number; wstar?: number; ccl?: number; groundAmsl?: number } | null) => void;
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

  const currentTimeRef = useRef(currentTime);
  // Monotonically increasing counter — used to discard stale elevation responses.
  const elevationSeqRef = useRef(0);
  // Last resolved ground elevation, tagged with the pin it belongs to.
  const elevationForPinRef = useRef<{ key: string; value: number } | null>(null);
  const projectionRef = useRef<ReturnType<typeof geoMercator> | null>(null);
  const transformRef = useRef(zoomIdentity);

  // pinnedCrosshair as React state so the useEffect below re-runs when the pin moves.
  const [pinnedCrosshair, setPinnedCrosshair] = useState<{ x: number; y: number } | null>(null);

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
        maybeRebuildThermalOverlay(res.overlay, c.transform, c.transformRef, c.projection, currentTimeRef, thermalGrid);
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

    const l: MapLayer<any>[] = [heatAndCumulus];
    if (showWind && windGrid) l.push(windLayer);
    l.push(markers);
    return l;
  }, [thermalGrid, windGrid, showWind]);

  // Recompute thermal info when the time slider moves (while a pin is active),
  // and fetch ground elevation asynchronously. A stale-response guard on
  // elevationSeqRef discards results from superseded lookups so that tapping
  // point B while point A's request is still in flight cannot show A's elevation.
  useEffect(() => {
    if (!pinnedCrosshair || !projectionRef.current) return;
    const t = transformRef.current;
    const inverted = t.invert([pinnedCrosshair.x, pinnedCrosshair.y]);
    const geo = projectionRef.current.invert!(inverted);
    if (!geo) return;

    const th = getThermalAt(geo[0], geo[1], currentTime, thermalGrid);
    if (!th) { onThermalInfoChangeRef.current?.(null); return; }

    // Terrain doesn't change with the time slider, so reuse the elevation already
    // resolved for this pin. Without this the readout would blink out and back on
    // every slider frame as each re-run re-emitted without groundAmsl first.
    const pinKey = `${geo[0].toFixed(4)},${geo[1].toFixed(4)}`;
    const known = elevationForPinRef.current;
    const cached = known?.key === pinKey ? known.value : undefined;

    // Emit immediately so the panel never blocks on the network.
    onThermalInfoChangeRef.current?.({ ...th, groundAmsl: cached });
    if (cached !== undefined) return;

    // Increment sequence and capture it for this specific lookup.
    const seq = ++elevationSeqRef.current;
    fetchElevationAt(geo[0], geo[1]).then(groundAmsl => {
      // Discard if a newer lookup has already been dispatched.
      if (seq !== elevationSeqRef.current) return;
      if (groundAmsl !== null) {
        elevationForPinRef.current = { key: pinKey, value: groundAmsl };
        onThermalInfoChangeRef.current?.({ ...th, groundAmsl });
      }
    });
  }, [currentTime, thermalGrid, pinnedCrosshair]);

  const handlePinChange = useCallback((pin: MapPin) => {
    setPinnedCrosshair(pin);
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
      pinnedCrosshairClassName="bg-orange-500/80"
    />
  );
});
