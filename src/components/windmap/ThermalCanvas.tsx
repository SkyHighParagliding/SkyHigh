import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { select } from 'd3-selection';
import { geoMercator } from 'd3-geo';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
import { tile as d3tile } from 'd3-tile';
import type { SiteMarker } from '../windMapTypes';
import { toMelbourneDate } from '@/utils/closureStatus';
import { getThermalAt } from './thermalInterpolation';
import type { ThermalGrid } from './thermalInterpolation';
import { fetchElevationAt } from './elevationPoint';
import { createThermalOverlay, maybeRebuildThermalOverlay, drawThermalOverlay } from './thermalRenderer';
import { drawSiteMarkers } from './siteMarkerRenderer';

const TILE_CACHE_MAX = 200;

type TileResult = ReturnType<ReturnType<typeof d3tile>>;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
  const [pinnedCrosshair, setPinnedCrosshair] = useState<{ x: number; y: number } | null>(null);

  const siteMarkersRef = useRef(siteMarkers);
  siteMarkersRef.current = siteMarkers;
  const pinnedCrosshairRef = useRef(pinnedCrosshair);
  pinnedCrosshairRef.current = pinnedCrosshair;
  const onThermalInfoChangeRef = useRef(onThermalInfoChange);
  onThermalInfoChangeRef.current = onThermalInfoChange;

  const currentTimeRef = useRef(currentTime);
  // Monotonically increasing counter — used to discard stale elevation responses.
  const elevationSeqRef = useRef(0);
  // Last resolved ground elevation, tagged with the pin it belongs to.
  const elevationForPinRef = useRef<{ key: string; value: number } | null>(null);
  const projectionRef = useRef<ReturnType<typeof geoMercator> | null>(null);
  const transformRef = useRef(zoomIdentity);
  const initialTransformApplied = useRef(false);
  const canvasSizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    canvasSizeRef.current = { width, height };
    canvasRef.current.width = width;
    canvasRef.current.height = height;
    initialTransformApplied.current = false;
    transformRef.current = zoomIdentity;
  }, [sizeKey]);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current || !thermalGrid) return;

    const { width, height } = canvasSizeRef.current;
    if (width === 0 || height === 0) return;

    const projection = geoMercator().scale(1 / (2 * Math.PI)).translate([0, 0]);
    projectionRef.current = projection;

    // Calculate initial transform to fit Victoria
    let initialTransform: ReturnType<typeof zoomIdentity.translate>;
    const markers = siteMarkersRef.current;
    if (markers && markers.length > 1) {
      let useK = savedZoom ? 256 * Math.pow(2, savedZoom) : undefined;
      const useCenterLon = savedCenterLon ?? (thermalGrid.lonMin + thermalGrid.lonMax) / 2;
      const useCenterLat = savedCenterLat ?? (thermalGrid.latMin + thermalGrid.latMax) / 2;

      if (!useK) {
        const tl = projection([thermalGrid.lonMin, thermalGrid.latMax])!;
        const br = projection([thermalGrid.lonMax, thermalGrid.latMin])!;
        const geoW = Math.abs(br[0] - tl[0]);
        const geoH = Math.abs(br[1] - tl[1]);
        const fitK = Math.min(width / geoW, height / geoH) * 0.95;
        useK = Math.max(256 * Math.pow(2, 6), Math.min(fitK, 256 * Math.pow(2, 20)));
      }
      const centerPt = projection([useCenterLon, useCenterLat])!;
      initialTransform = zoomIdentity
        .translate(width / 2 - centerPt[0] * useK, height / 2 - centerPt[1] * useK)
        .scale(useK);
    } else {
      const targetZoom = savedZoom ?? 9;
      const initialK = 256 * Math.pow(2, targetZoom);
      const sitePixel = projection([siteLon, siteLat])!;
      initialTransform = zoomIdentity
        .translate(width / 2 - sitePixel[0] * initialK, height / 2 - sitePixel[1] * initialK)
        .scale(initialK);
    }

    if (!initialTransformApplied.current) {
      transformRef.current = initialTransform;
      initialTransformApplied.current = true;
    }

    const tileCache = new Map<string, HTMLImageElement>();
    const loadTile = (key: string, url: string): HTMLImageElement | null => {
      if (tileCache.has(key)) return tileCache.get(key)!;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = () => tileCache.delete(key);
      img.src = url;
      if (tileCache.size >= TILE_CACHE_MAX) tileCache.delete(tileCache.keys().next().value!);
      tileCache.set(key, img);
      return null;
    };

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let overlay = createThermalOverlay(width, height);

    const gridTL = projection([thermalGrid.lonMin, thermalGrid.latMax])!;
    const gridBR = projection([thermalGrid.lonMax, thermalGrid.latMin])!;
    const extW = Math.abs(gridBR[0] - gridTL[0]);
    const extH = Math.abs(gridBR[1] - gridTL[1]);
    const fitK = Math.max(width / extW, height / extH);
    const minK = Math.max(fitK, 256 * Math.pow(2, 3));
    const maxK = 256 * Math.pow(2, 20);

    const zoom = d3Zoom<HTMLDivElement, unknown>()
      .scaleExtent([minK, maxK])
      .translateExtent([[gridTL[0], gridTL[1]], [gridBR[0], gridBR[1]]])
      .on('zoom', (event) => {
        const t = event.transform;
        transformRef.current = t;
        if (onTransformChange) {
          const { width: cw, height: ch } = canvasSizeRef.current;
          const inverted = projection.invert!([(cw / 2 - t.x) / t.k, (ch / 2 - t.y) / t.k]);
          if (inverted) onTransformChange(inverted[1], inverted[0], Math.log2(t.k / 256));
        }
      });

    const d3Container = select(containerRef.current);
    d3Container.call(zoom as Parameters<typeof d3Container.call>[0]);
    d3Container.call((zoom as Parameters<typeof d3Container.call>[0]).transform, transformRef.current);

    let todayStr = toMelbourneDate(new Date());
    const todayInterval = setInterval(() => { todayStr = toMelbourneDate(new Date()); }, 60_000);

    let lastTileKey = '';
    let lastTiles: TileResult | null = null;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0 && canvasRef.current) {
          if (w !== canvasSizeRef.current.width || h !== canvasSizeRef.current.height) {
            canvasSizeRef.current = { width: w, height: h };
            canvasRef.current.width = w;
            canvasRef.current.height = h;
            if (overlay.rebuildTimeout) clearTimeout(overlay.rebuildTimeout);
            overlay = createThermalOverlay(w, h);
          }
        }
      }
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    let animationFrameId: number;

    const render = () => {
      const currentTransform = transformRef.current;
      const { width: w, height: h } = canvasSizeRef.current;
      if (w === 0 || h === 0) { animationFrameId = requestAnimationFrame(render); return; }

      const tileKey = `${w}|${h}|${currentTransform.k.toFixed(1)}|${currentTransform.x.toFixed(1)}|${currentTransform.y.toFixed(1)}`;
      if (tileKey !== lastTileKey || !lastTiles) {
        const tileLayout = d3tile()
          .size([w, h])
          .scale(currentTransform.k)
          .translate([currentTransform.x, currentTransform.y]);
        lastTiles = tileLayout();
        lastTileKey = tileKey;
      }
      const tiles = lastTiles;
      const dpr = window.devicePixelRatio || 1;

      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(0, 0, w, h);

      for (const d of tiles) {
        const tileKey2 = `${d[2]}/${d[0]}/${d[1]}`;
        const url = `https://basemaps.cartocdn.com/rastertiles/light_nolabels/${tileKey2}${dpr > 1 ? '@2x' : ''}.png?key=${import.meta.env.VITE_CARTO_API_KEY}`;
        const img = loadTile(tileKey2, url);
        if (img && img.complete && img.naturalWidth > 0) {
          const x = (d[0] + tiles.translate[0]) * tiles.scale;
          const y = (d[1] + tiles.translate[1]) * tiles.scale;
          ctx.drawImage(img, x, y, tiles.scale, tiles.scale);
        }
      }

      maybeRebuildThermalOverlay(overlay, currentTransform, transformRef, projection, currentTimeRef, thermalGrid);
      drawThermalOverlay(ctx, overlay, currentTransform);

      const markersLocal = siteMarkersRef.current;
      if (markersLocal && markersLocal.length > 0) {
        drawSiteMarkers(ctx, markersLocal, currentTransform, projection, todayStr, true);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (overlay.rebuildTimeout) clearTimeout(overlay.rebuildTimeout);
      clearInterval(todayInterval);
      resizeObserver.disconnect();
    };
  }, [thermalGrid, siteLat, siteLon, onTransformChange, savedCenterLat, savedCenterLon, savedZoom, sizeKey]);

  const handlePointer = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    if (e.pointerType === 'touch') return;
    const rect = containerRef.current.getBoundingClientRect();
    setCrosshair({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handlePointerLeave = () => setCrosshair(null);

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

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check for site marker hit first
    if (projectionRef.current && siteMarkersRef.current && onSiteClick) {
      const currentTransform = transformRef.current;
      for (const site of siteMarkersRef.current) {
        const proj = projectionRef.current([site.lon, site.lat]);
        if (!proj) continue;
        const sp = currentTransform.apply(proj);
        const dist = Math.sqrt((sp[0] - x) ** 2 + (sp[1] - y) ** 2);
        if (dist < 12) { onSiteClick(site, x, y); return; }
      }
    }

    // Pin the crosshair — the useEffect above will compute thermal info once
    setPinnedCrosshair({ x, y });
  }, [onSiteClick]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#e8e8e8] cursor-crosshair touch-none overflow-hidden"
      onPointerMove={handlePointer}
      onPointerDown={handlePointer}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_40px_rgba(0,0,0,0.3)]" />

      {crosshair && (
        <div className="absolute pointer-events-none" style={{ left: crosshair.x, top: crosshair.y }}>
          <div className="absolute w-6 h-px bg-black/30 -left-3 top-0" />
          <div className="absolute h-6 w-px bg-black/30 left-0 -top-3" />
        </div>
      )}

      {pinnedCrosshair && (
        <div className="absolute pointer-events-none" style={{ left: pinnedCrosshair.x, top: pinnedCrosshair.y }}>
          <div className="absolute w-3 h-px bg-orange-500/80 -left-1.5 top-0" />
          <div className="absolute h-3 w-px bg-orange-500/80 left-0 -top-1.5" />
        </div>
      )}
    </div>
  );
});
