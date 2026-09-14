import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { zoomIdentity } from 'd3-zoom';
import { geoMercator } from 'd3-geo';
import type { SiteMarker } from '../windMapTypes';
import { getThermalAt } from './thermalInterpolation';
import type { ThermalGrid } from './thermalInterpolation';
import { fetchElevationAt } from './elevationPoint';
import { createThermalOverlay, maybeRebuildThermalOverlay, drawThermalOverlay } from './thermalRenderer';
import { createCumulusField, rebuildCumulusField, drawCumulusField } from './cumulusField';
import { drawSiteMarkers } from './siteMarkerRenderer';
import { MapCanvas } from './MapCanvas';
import type { MapLayer, MapPin } from './MapCanvas';

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
}

export const ThermalCanvas = memo(function ThermalCanvas({
  thermalGrid, currentTime, siteLat, siteLon,
  siteMarkers, onSiteClick, onThermalInfoChange,
  sizeKey, savedCenterLat, savedCenterLon, savedZoom,
  onTransformChange,
}: ThermalCanvasProps) {
  const siteMarkersRef = useRef(siteMarkers);
  siteMarkersRef.current = siteMarkers;
  const onThermalInfoChangeRef = useRef(onThermalInfoChange);
  onThermalInfoChangeRef.current = onThermalInfoChange;

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

  const layers = useMemo((): MapLayer<any>[] => [
    // Layer 0: combined thermal overlay + cumulus stipple.
    // The cumulus rebuild needs the overlay object, so they share one create() return value.
    // Cumulus stipple sits above the heat raster but below the site markers so
    // pilots see the texture without it obscuring the interactive pin targets.
    {
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
    },
    // Layer 1: site markers.
    {
      draw: (c) => {
        const m = siteMarkersRef.current;
        if (m && m.length > 0) drawSiteMarkers(c.ctx, m, c.transform, c.projection, c.todayStr, true);
      },
    },
  ], [thermalGrid]);

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
