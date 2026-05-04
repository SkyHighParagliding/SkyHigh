import { useState, useEffect, useRef, useCallback } from 'react';
import { select } from 'd3-selection';
import { geoMercator } from 'd3-geo';
import { zoom as d3Zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';
import { tile as d3tile } from 'd3-tile';
import { DEFAULT_ZOOM_SETPOINTS } from '../windMapTypes';
import type { ZoomSetpoints, SiteMarker } from '../windMapTypes';
import { getWindAt } from './windInterpolation';
import type { WindGrid } from './windInterpolation';
import { createParticlePool, updateAndDrawParticles, createSpeedOverlay, maybeRebuildOverlay } from './particleRenderer';
import { drawSiteMarkers, drawSingleSiteMarker } from './siteMarkerRenderer';

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
  hideWindInfo?: boolean;
  onWindInfoChange?: (info: { speed: number; direction: number } | null) => void;
  sizeKey?: number;
}

export function WindCanvas({ windGrid, currentTime, siteLat, siteLon, siteName, onZoomChange, zoomSetpoints = DEFAULT_ZOOM_SETPOINTS, siteMarkers, onSiteClick, hideWindInfo, onWindInfoChange, sizeKey }: WindCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crosshair, setCrosshair] = useState<{ x: number, y: number } | null>(null);
  const [pinnedCrosshair, setPinnedCrosshair] = useState<{ x: number, y: number } | null>(null);
  const [transform, setTransform] = useState(zoomIdentity);
  const siteMarkersRef = useRef(siteMarkers);
  siteMarkersRef.current = siteMarkers;
  const zoomSetpointsRef = useRef(zoomSetpoints);
  zoomSetpointsRef.current = zoomSetpoints;

  const currentTimeRef = useRef(currentTime);
  const projectionRef = useRef<ReturnType<typeof geoMercator> | null>(null);
  const transformRef = useRef(zoomIdentity);
  const initialTransformApplied = useRef(false);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    initialTransformApplied.current = false;
    transformRef.current = zoomIdentity;
  }, [sizeKey]);

  useEffect(() => {
    if (!containerRef.current || !svgRef.current || !canvasRef.current || !windGrid) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    const projection = geoMercator()
      .scale(1 / (2 * Math.PI))
      .translate([0, 0]);
    projectionRef.current = projection;

    let initialTransform: ZoomTransform;
    const markers = siteMarkersRef.current;
    if (markers && markers.length > 1) {
      // Use wind grid bounds instead of marker bounds for initial focus
      const minLat = windGrid.latMin;
      const maxLat = windGrid.latMax;
      const minLon = windGrid.lonMin;
      const maxLon = windGrid.lonMax;
      const padding = 0;
      const latRange = (maxLat - minLat) * (1 + padding * 2);
      const lonRange = (maxLon - minLon) * (1 + padding * 2);
      const centerPt = projection([(minLon + maxLon) / 2, (minLat + maxLat) / 2])!;
      const topLeft = projection([minLon - lonRange * padding, maxLat + latRange * padding])!;
      const bottomRight = projection([maxLon + lonRange * padding, minLat - latRange * padding])!;
      const geoW = Math.abs(bottomRight[0] - topLeft[0]);
      const geoH = Math.abs(bottomRight[1] - topLeft[1]);
      const fitK = Math.min(width / geoW, height / geoH) * 0.95;
      const clampedK = Math.max(256 * Math.pow(2, 6), Math.min(fitK, 256 * Math.pow(2, 20)));
      initialTransform = zoomIdentity
        .translate(width / 2 - centerPt[0] * clampedK, height / 2 - centerPt[1] * clampedK)
        .scale(clampedK);
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
      img.onload = () => { tileCache.set(key, img); };
      tileCache.set(key, img);
      return null;
    };

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const overlay = createSpeedOverlay(width, height);
    const particles = createParticlePool(width, height);

    const gridTL = projection([windGrid.lonMin, windGrid.latMax])!;
    const gridBR = projection([windGrid.lonMax, windGrid.latMin])!;
    const minK = 256 * Math.pow(2, 6);
    const maxK = 256 * Math.pow(2, 20);

    const zoom = d3Zoom<HTMLDivElement, unknown>()
      .scaleExtent([minK, maxK])
      .translateExtent([[gridTL[0], gridTL[1]], [gridBR[0], gridBR[1]]])
      .on('zoom', (event) => {
        const t = event.transform;
        transformRef.current = t;
        setTransform(t);
        onZoomChange(t.k);
      });

    const d3Container = select(containerRef.current);
    d3Container.call(zoom as any);
    d3Container.call((zoom as any).transform, transformRef.current);

    let animationFrameId: number;

    const render = () => {
      const currentTransform = transformRef.current;

      const tile = d3tile()
        .size([width, height])
        .scale(currentTransform.k)
        .translate([currentTransform.x, currentTransform.y]);
      const tiles = tile();

      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(0, 0, width, height);

      for (const d of tiles) {
        const tileKey = `${d[2]}/${d[0]}/${d[1]}`;
        const url = `https://a.basemaps.cartocdn.com/light_nolabels/${tileKey}${dpr > 1 ? '@2x' : ''}.png`;
        const img = loadTile(tileKey, url);
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
      ctx.drawImage(overlay.canvas, 0, 0, width, height);
      ctx.restore();

      updateAndDrawParticles(ctx, particles, width, height, currentTransform, projection, currentTimeRef.current, windGrid, zoomSetpointsRef.current);

      const markersLocal = siteMarkersRef.current;
      if (markersLocal && markersLocal.length > 0) {
        drawSiteMarkers(ctx, markersLocal, currentTransform, projection);
      } else {
        drawSingleSiteMarker(ctx, currentTransform, projection, siteLon, siteLat, siteName);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (overlay.rebuildTimeout) clearTimeout(overlay.rebuildTimeout);
    };
  }, [windGrid, siteLat, siteLon, onZoomChange, sizeKey]);

  const handlePointer = (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    if (e.pointerType === "touch") return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCrosshair({ x, y });
  };

  const handlePointerLeave = () => {
    setCrosshair(null);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPinnedCrosshair({ x, y });

    if (projectionRef.current && siteMarkersRef.current && onSiteClick) {
      const projection = projectionRef.current;
      const currentTransform = transformRef.current;
      for (const site of siteMarkersRef.current) {
        const sp = currentTransform.apply(projection([site.lon, site.lat])!);
        const dist = Math.sqrt((sp[0] - x) ** 2 + (sp[1] - y) ** 2);
        if (dist < 12) {
          onSiteClick(site, x, y);
          return;
        }
      }
    }
  };

  useEffect(() => {
    if (!pinnedCrosshair || !projectionRef.current || !windGrid) return;

    const [ux, uy] = transform.invert([pinnedCrosshair.x, pinnedCrosshair.y]);
    const geo = projectionRef.current.invert!([ux, uy]);

    if (geo) {
      const wind = getWindAt(geo[0], geo[1], currentTime, windGrid);
      if (wind) {
        const [u, v] = wind;
        const speedMs = Math.sqrt(u * u + v * v);
        const speedKnots = speedMs * 1.94384;

        let dir = (Math.atan2(-u, -v) * 180) / Math.PI;
        if (dir < 0) dir += 360;

        const info = { speed: speedKnots, direction: dir };
        onWindInfoChange?.(info);
      } else {
        onWindInfoChange?.(null);
      }
    }
  }, [currentTime, pinnedCrosshair, transform, windGrid, onWindInfoChange]);

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
      <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none hidden" />
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
}
