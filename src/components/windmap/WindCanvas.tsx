import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { zoomIdentity } from 'd3-zoom';
import { geoMercator } from 'd3-geo';
import { DEFAULT_ZOOM_SETPOINTS } from '../windMapTypes';
import type { ZoomSetpoints, SiteMarker } from '../windMapTypes';
import { getWindAt } from './windInterpolation';
import type { WindGrid } from './windInterpolation';
import { createParticlePool, updateAndDrawParticles, createSpeedOverlay, maybeRebuildOverlay, drawSpeedOverlay } from './particleRenderer';
import { drawSiteMarkers, drawSingleSiteMarker } from './siteMarkerRenderer';
import { fetchElevationAt } from './elevationPoint';
import { MapCanvas } from './MapCanvas';
import type { MapLayer, MapPin } from './MapCanvas';

interface WindCanvasProps {
  windGrid: WindGrid;
  currentTime: number;
  siteLat: number;
  siteLon: number;
  siteName?: string;
  onZoomChange: (k: number) => void;
  zoomSetpoints?: ZoomSetpoints;
  siteMarkers?: SiteMarker[];
  onSiteClick?: (site: SiteMarker, screenX: number, screenY: number) => void;
  onWindInfoChange?: (info: { speed: number; direction: number; groundAmsl?: number } | null) => void;
  sizeKey?: number;
  initialZoomK?: number;
  savedCenterLat?: number;
  savedCenterLon?: number;
  savedZoom?: number;
  onTransformChange?: (lat: number, lon: number, zoomLevel: number) => void;
  siteStatus?: string;
  siteUpcomingClosureDates?: string[];
}

export const WindCanvas = memo(function WindCanvas({
  windGrid, currentTime, siteLat, siteLon, siteName,
  onZoomChange, zoomSetpoints = DEFAULT_ZOOM_SETPOINTS,
  siteMarkers, onSiteClick, onWindInfoChange,
  sizeKey, initialZoomK, savedCenterLat, savedCenterLon, savedZoom,
  onTransformChange, siteStatus, siteUpcomingClosureDates,
}: WindCanvasProps) {
  const siteMarkersRef = useRef(siteMarkers);
  siteMarkersRef.current = siteMarkers;
  const zoomSetpointsRef = useRef(zoomSetpoints);
  zoomSetpointsRef.current = zoomSetpoints;
  const onWindInfoChangeRef = useRef(onWindInfoChange);
  onWindInfoChangeRef.current = onWindInfoChange;
  // Ground elevation for the pinned point. The readout below re-emits at 10fps,
  // so this is keyed by pin position: the lookup fires once when the pin moves,
  // never once per frame. `value` stays undefined until the request resolves.
  const elevationPinRef = useRef<{ key: string; value?: number } | null>(null);
  const elevationSeqRef = useRef(0);
  // Refs keep siteStatus/siteUpcomingClosureDates live inside the render loop without
  // adding them to the useEffect dependency array (#1).
  const siteStatusRef = useRef(siteStatus);
  siteStatusRef.current = siteStatus;
  const siteUpcomingClosureDatesRef = useRef(siteUpcomingClosureDates);
  siteUpcomingClosureDatesRef.current = siteUpcomingClosureDates;

  const currentTimeRef = useRef(currentTime);
  const projectionRef = useRef<ReturnType<typeof geoMercator> | null>(null);
  const transformRef = useRef(zoomIdentity);

  // pinnedCrosshair as React state to drive the readout layer trigger.
  const [pinnedCrosshair, setPinnedCrosshair] = useState<{ x: number; y: number } | null>(null);
  const pinnedCrosshairRef = useRef(pinnedCrosshair);
  pinnedCrosshairRef.current = pinnedCrosshair;

  // Wind info throttle: update at most 10fps to avoid flooding parent state.
  // Stored in a ref so it persists across the rAF loop without closure re-capture.
  const lastWindInfoUpdateRef = useRef(0);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const bounds = useMemo(() => {
    const g = windGrid.wideGrid ?? windGrid;
    return { lonMin: g.lonMin, lonMax: g.lonMax, latMin: g.latMin, latMax: g.latMax };
  }, [windGrid]);

  const layers = useMemo((): MapLayer<any>[] => [
    // Layer A: speed overlay (raster heatmap).
    {
      create: (w: number, h: number) => createSpeedOverlay(w, h),
      dispose: (o: ReturnType<typeof createSpeedOverlay>) => {
        if (o.rebuildTimeout) clearTimeout(o.rebuildTimeout);
      },
      draw: (c, o: ReturnType<typeof createSpeedOverlay>) => {
        maybeRebuildOverlay(o, c.transform, c.transformRef, c.projection, currentTimeRef, windGrid);
        drawSpeedOverlay(c.ctx, o, c.transform);
      },
    },
    // Layer B: particle trails.
    {
      create: (w: number, h: number) => createParticlePool(w, h),
      draw: (c, p: ReturnType<typeof createParticlePool>) => {
        updateAndDrawParticles(c.ctx, p, c.width, c.height, c.transform, c.projection, currentTimeRef.current, windGrid, zoomSetpointsRef.current);
      },
    },
    // Layer C: site markers.
    {
      draw: (c) => {
        const markersLocal = siteMarkersRef.current;
        if (markersLocal && markersLocal.length > 0) {
          drawSiteMarkers(c.ctx, markersLocal, c.transform, c.projection, c.todayStr);
        } else {
          drawSingleSiteMarker(c.ctx, c.transform, c.projection, siteLon, siteLat, c.todayStr, siteName, siteStatusRef.current, siteUpcomingClosureDatesRef.current);
        }
      },
    },
    // Layer D: wind info readout — throttled to 10fps.
    {
      draw: (c) => {
        // lastWindInfoUpdate lives in a ref so it survives re-renders without
        // resetting mid-frame (matching the original per-effect-closure behaviour).
        const now = performance.now();
        if (pinnedCrosshairRef.current && now - lastWindInfoUpdateRef.current > 100) {
          lastWindInfoUpdateRef.current = now;
          const crosshair = pinnedCrosshairRef.current;
          const inverted = c.transform.invert([crosshair.x, crosshair.y]);
          const geo = c.projection.invert!(inverted);
          if (geo) {
            const wind = getWindAt(geo[0], geo[1], currentTimeRef.current, windGrid);
            if (wind) {
              const speedMs = Math.sqrt(wind[0] ** 2 + wind[1] ** 2);
              let dir = (Math.atan2(-wind[0], -wind[1]) * 180) / Math.PI;
              if (dir < 0) dir += 360;

              // Dispatch one elevation lookup per pin position. Recording the key
              // before the request resolves is what stops the render loop from
              // firing a duplicate on every subsequent frame.
              const pinKey = `${geo[0].toFixed(4)},${geo[1].toFixed(4)}`;
              if (elevationPinRef.current?.key !== pinKey) {
                elevationPinRef.current = { key: pinKey };
                const seq = ++elevationSeqRef.current;
                fetchElevationAt(geo[0], geo[1]).then(metres => {
                  // Ignore a superseded lookup so the pin can't show another point's ground.
                  if (seq !== elevationSeqRef.current || metres === null) return;
                  elevationPinRef.current = { key: pinKey, value: metres };
                });
              }

              onWindInfoChangeRef.current?.({
                speed: speedMs * 1.94384,
                direction: dir,
                groundAmsl: elevationPinRef.current?.value,
              });
            } else {
              onWindInfoChangeRef.current?.(null);
            }
          }
        }
      },
    },
  ], [windGrid, siteLat, siteLon, siteName]);

  const handlePinChange = useCallback((pin: MapPin) => {
    setPinnedCrosshair(pin);
  }, []);

  return (
    <MapCanvas
      bounds={bounds}
      siteLat={siteLat}
      siteLon={siteLon}
      singleSiteZoom={9}
      fallbackZoomK={initialZoomK}
      siteMarkers={siteMarkers}
      savedCenterLat={savedCenterLat}
      savedCenterLon={savedCenterLon}
      savedZoom={savedZoom}
      sizeKey={sizeKey}
      layers={layers}
      onTransformChange={onTransformChange}
      onZoomChange={onZoomChange}
      onSiteClick={onSiteClick}
      markerHitSuppressesPin={false}
      onPinChange={handlePinChange}
      projectionRef={projectionRef}
      transformRef={transformRef}
      containerClassName="relative w-full h-full bg-black cursor-crosshair touch-none overflow-hidden"
      hoverCrosshairClassName="bg-white/40"
      pinnedCrosshairColor="rgb(56, 189, 248)"
    />
  );
});
