import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { select } from 'd3-selection';
import { geoMercator } from 'd3-geo';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
import { tile as d3tile } from 'd3-tile';
import { DEFAULT_ZOOM_SETPOINTS } from '../windMapTypes';
import type { ZoomSetpoints, SiteMarker } from '../windMapTypes';
import { getWindAt } from './windInterpolation';
import type { WindGrid } from './windInterpolation';
import { createParticlePool, updateAndDrawParticles, createSpeedOverlay, maybeRebuildOverlay } from './particleRenderer';
import { drawSiteMarkers, drawSingleSiteMarker } from './siteMarkerRenderer';

const TILE_CACHE_MAX = 200;

type TileResult = ReturnType<ReturnType<typeof d3tile>>;

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
  onWindInfoChange?: (info: { speed: number; direction: number } | null) => void;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crosshair, setCrosshair] = useState<{ x: number, y: number } | null>(null);
  const [pinnedCrosshair, setPinnedCrosshair] = useState<{ x: number, y: number } | null>(null);

  const siteMarkersRef = useRef(siteMarkers);
  siteMarkersRef.current = siteMarkers;
  const zoomSetpointsRef = useRef(zoomSetpoints);
  zoomSetpointsRef.current = zoomSetpoints;
  const pinnedCrosshairRef = useRef(pinnedCrosshair);
  pinnedCrosshairRef.current = pinnedCrosshair;
  const onWindInfoChangeRef = useRef(onWindInfoChange);
  onWindInfoChangeRef.current = onWindInfoChange;

  const currentTimeRef = useRef(currentTime);
  const projectionRef = useRef<ReturnType<typeof geoMercator> | null>(null);
  const transformRef = useRef(zoomIdentity);
  const initialTransformApplied = useRef(false);
  const canvasSizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

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
    if (!containerRef.current || !canvasRef.current || !windGrid) return;

    const { width, height } = canvasSizeRef.current;
    if (width === 0 || height === 0) return;

    const projection = geoMercator()
      .scale(1 / (2 * Math.PI))
      .translate([0, 0]);
    projectionRef.current = projection;

    let initialTransform: ReturnType<typeof zoomIdentity.translate>;
    const markers = siteMarkersRef.current;
    if (markers && markers.length > 1) {
      let useK = savedZoom ? 256 * Math.pow(2, savedZoom) : initialZoomK;
      const centerGrid = windGrid.wideGrid ?? windGrid;
      const useCenterLon = savedCenterLon ?? (centerGrid.lonMin + centerGrid.lonMax) / 2;
      const useCenterLat = savedCenterLat ?? (centerGrid.latMin + centerGrid.latMax) / 2;

      if (!useK) {
        const focusGrid = windGrid.wideGrid ?? windGrid;
        const padding = 0;
        const latRange = (focusGrid.latMax - focusGrid.latMin) * (1 + padding * 2);
        const lonRange = (focusGrid.lonMax - focusGrid.lonMin) * (1 + padding * 2);
        const topLeft = projection([focusGrid.lonMin - lonRange * padding, focusGrid.latMax + latRange * padding])!;
        const bottomRight = projection([focusGrid.lonMax + lonRange * padding, focusGrid.latMin - latRange * padding])!;
        const geoW = Math.abs(bottomRight[0] - topLeft[0]);
        const geoH = Math.abs(bottomRight[1] - topLeft[1]);
        const fitK = Math.min(width / geoW, height / geoH) * 0.95;
        useK = Math.max(256 * Math.pow(2, 6), Math.min(fitK, 256 * Math.pow(2, 20)));
      }
      const centerPt = projection([useCenterLon, useCenterLat])!;
      initialTransform = zoomIdentity
        .translate(width / 2 - centerPt[0] * useK, height / 2 - centerPt[1] * useK)
        .scale(useK);
    } else {
      const targetZoom = 9;
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
      img.src = url;
      if (tileCache.size >= TILE_CACHE_MAX) {
        tileCache.delete(tileCache.keys().next().value!);
      }
      tileCache.set(key, img);
      return null;
    };

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const overlay = createSpeedOverlay(width, height);
    const particles = createParticlePool(width, height);

    const extentGrid = windGrid.wideGrid ?? windGrid;
    const gridTL = projection([extentGrid.lonMin, extentGrid.latMax])!;
    const gridBR = projection([extentGrid.lonMax, extentGrid.latMin])!;
    const extW = Math.abs(gridBR[0] - gridTL[0]);
    const extH = Math.abs(gridBR[1] - gridTL[1]);
    const fitWidthK = width / extW;
    const fitHeightK = height / extH;
    const fitK = Math.max(fitWidthK, fitHeightK);
    const minK = Math.max(fitK, 256 * Math.pow(2, 3));
    const maxK = 256 * Math.pow(2, 20);

    const zoom = d3Zoom<HTMLDivElement, unknown>()
      .scaleExtent([minK, maxK])
      .translateExtent([[gridTL[0], gridTL[1]], [gridBR[0], gridBR[1]]])
      .on('zoom', (event) => {
        const t = event.transform;
        transformRef.current = t;
        onZoomChange(t.k);

        if (onTransformChange) {
          const { width: cw, height: ch } = canvasSizeRef.current;
          const inverted = projection.invert([(cw / 2 - t.x) / t.k, (ch / 2 - t.y) / t.k]);
          if (inverted) {
            onTransformChange(inverted[1], inverted[0], Math.log2(t.k / 256));
          }
        }
      });

    const d3Container = select(containerRef.current);
    d3Container.call(zoom as Parameters<typeof d3Container.call>[0]);
    d3Container.call((zoom as Parameters<typeof d3Container.call>[0]).transform, transformRef.current);

    // todayStr refreshed every minute — computed once outside the render loop
    let todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
    const todayInterval = setInterval(() => {
      todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
    }, 60_000);

    // d3tile result cached until transform or canvas size changes
    let lastTileKey = '';
    let lastTiles: TileResult | null = null;

    // Wind info throttle: update at most 10fps to avoid flooding parent state
    let lastWindInfoUpdate = 0;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0 && canvasRef.current) {
          canvasSizeRef.current = { width: w, height: h };
          canvasRef.current.width = w;
          canvasRef.current.height = h;
        }
      }
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    let animationFrameId: number;

    const render = () => {
      const currentTransform = transformRef.current;
      const { width: w, height: h } = canvasSizeRef.current;
      if (w === 0 || h === 0) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const tileKey = `${w}|${h}|${currentTransform.k.toFixed(1)}|${currentTransform.x.toFixed(0)}|${currentTransform.y.toFixed(0)}`;
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
        const url = `https://a.basemaps.cartocdn.com/light_nolabels/${tileKey2}${dpr > 1 ? '@2x' : ''}.png`;
        const img = loadTile(tileKey2, url);
        if (img && img.complete && img.naturalWidth > 0) {
          const x = (d[0] + tiles.translate[0]) * tiles.scale;
          const y = (d[1] + tiles.translate[1]) * tiles.scale;
          ctx.drawImage(img, x, y, tiles.scale, tiles.scale);
        }
      }

      maybeRebuildOverlay(overlay, currentTransform, transformRef, projection, currentTimeRef, windGrid);

      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(overlay.canvas, 0, 0, w, h);
      ctx.restore();

      updateAndDrawParticles(ctx, particles, w, h, currentTransform, projection, currentTimeRef.current, windGrid, zoomSetpointsRef.current);

      const markersLocal = siteMarkersRef.current;
      if (markersLocal && markersLocal.length > 0) {
        drawSiteMarkers(ctx, markersLocal, currentTransform, projection, todayStr);
      } else {
        drawSingleSiteMarker(ctx, currentTransform, projection, siteLon, siteLat, todayStr, siteName, siteStatus, siteUpcomingClosureDates);
      }

      // Wind info for pinned crosshair — throttled to 10fps
      const now = performance.now();
      if (pinnedCrosshairRef.current && now - lastWindInfoUpdate > 100) {
        lastWindInfoUpdate = now;
        const crosshair = pinnedCrosshairRef.current;
        const inverted = currentTransform.invert([crosshair.x, crosshair.y]);
        const geo = projection.invert!(inverted);
        if (geo) {
          const wind = getWindAt(geo[0], geo[1], currentTimeRef.current, windGrid);
          if (wind) {
            const speedMs = Math.sqrt(wind[0] ** 2 + wind[1] ** 2);
            let dir = (Math.atan2(-wind[0], -wind[1]) * 180) / Math.PI;
            if (dir < 0) dir += 360;
            onWindInfoChangeRef.current?.({ speed: speedMs * 1.94384, direction: dir });
          } else {
            onWindInfoChangeRef.current?.(null);
          }
        }
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
  }, [windGrid, siteLat, siteLon, siteName, onZoomChange, savedCenterLat, savedCenterLon, savedZoom, sizeKey, onTransformChange, initialZoomK]);

  const handlePointer = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    if (e.pointerType === 'touch') return;
    const rect = containerRef.current.getBoundingClientRect();
    setCrosshair({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handlePointerLeave = () => {
    setCrosshair(null);
  };

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPinnedCrosshair({ x, y });

    if (projectionRef.current && siteMarkersRef.current && onSiteClick) {
      const currentTransform = transformRef.current;
      for (const site of siteMarkersRef.current) {
        const proj = projectionRef.current([site.lon, site.lat]);
        if (!proj) continue;
        const sp = currentTransform.apply(proj);
        const dist = Math.sqrt((sp[0] - x) ** 2 + (sp[1] - y) ** 2);
        if (dist < 12) {
          onSiteClick(site, x, y);
          return;
        }
      }
    }
  }, [onSiteClick]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black cursor-crosshair touch-none overflow-hidden"
      onPointerMove={handlePointer}
      onPointerDown={handlePointer}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_40px_rgba(0,0,0,0.3)]" />

      {crosshair && (
        <div
          className="absolute pointer-events-none"
          style={{ left: crosshair.x, top: crosshair.y }}
        >
          <div className="absolute w-6 h-px bg-white/40 -left-3 top-0" />
          <div className="absolute h-6 w-px bg-white/40 left-0 -top-3" />
        </div>
      )}

      {pinnedCrosshair && (
        <div
          className="absolute pointer-events-none"
          style={{ left: pinnedCrosshair.x, top: pinnedCrosshair.y }}
        >
          <div className="absolute w-3 h-px bg-sky-400/80 -left-1.5 top-0" />
          <div className="absolute h-3 w-px bg-sky-400/80 left-0 -top-1.5" />
        </div>
      )}
    </div>
  );
});
