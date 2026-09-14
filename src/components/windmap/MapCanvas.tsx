import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { select } from 'd3-selection';
import type { GeoProjection } from 'd3-geo';
import { createMapProjection, gridWorldExtent, gridWorldCenter, coverScale } from './mapExtent';
import { zoom as d3Zoom, zoomIdentity } from 'd3-zoom';
import type { ZoomTransform } from 'd3-zoom';
import { tile as d3tile } from 'd3-tile';
import type { SiteMarker } from '../windMapTypes';
import { toMelbourneDate } from '@/utils/closureStatus';
import { tileCoordsFor, prefetchTile } from './terrainTiles';

const TILE_CACHE_MAX = 200;

type TileResult = ReturnType<ReturnType<typeof d3tile>>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MapRenderContext {
  ctx: CanvasRenderingContext2D;
  /** Transform in force for this frame. */
  transform: ZoomTransform;
  /** Live transform ref, for renderers that schedule throttled rebuilds. */
  transformRef: React.MutableRefObject<ZoomTransform>;
  projection: GeoProjection;
  width: number;
  height: number;
  /** Melbourne date string, refreshed once a minute outside the loop. */
  todayStr: string;
}

/**
 * One drawable layer. `create` allocates size-dependent resources (rasters,
 * particle pools); it is called on mount and again whenever the canvas
 * resizes. `dispose` must clear any pending timers held by those resources.
 */
export interface MapLayer<R = void> {
  // NOTE: declare these with METHOD syntax, not property-arrow syntax, so that
  // MapLayer<SpeedOverlayState> stays assignable to MapLayer<any> under
  // strictFunctionTypes (method params are checked bivariantly).
  create?(width: number, height: number): R;
  dispose?(resources: R): void;
  draw(c: MapRenderContext, resources: R): void;
}

export interface MapPin { x: number; y: number; }

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MapCanvasProps {
  /** Geographic extent: bounds panning, and drives the fit-to-view zoom. */
  bounds: { lonMin: number; lonMax: number; latMin: number; latMax: number };
  /** Centre used when there are 0 or 1 site markers. */
  siteLat: number;
  siteLon: number;
  /** Zoom level for that single-site view. */
  singleSiteZoom: number;
  siteMarkers?: SiteMarker[];
  savedCenterLat?: number;
  savedCenterLon?: number;
  savedZoom?: number;
  /** Zoom scale k used when savedZoom is absent (wind map's remembered k). */
  fallbackZoomK?: number;
  sizeKey?: number;
  /** Drawn in order, after the basemap. Memoise this in the consumer — its
   *  identity is a dependency of the setup effect. */
  layers: MapLayer<any>[];
  onTransformChange?: (lat: number, lon: number, zoomLevel: number) => void;
  onZoomChange?: (k: number) => void;
  onSiteClick?: (site: SiteMarker, screenX: number, screenY: number) => void;
  /** When true a marker hit returns early and does NOT pin (thermal). When
   *  false the pin is set first and the hit-test runs after (wind). */
  markerHitSuppressesPin?: boolean;
  onPinChange?: (pin: MapPin) => void;
  /** Filled in by MapCanvas so consumers can invert screen coords themselves. */
  projectionRef?: React.MutableRefObject<GeoProjection | null>;
  transformRef?: React.MutableRefObject<ZoomTransform>;
  containerClassName: string;
  hoverCrosshairClassName: string;
  /** CSS colour for the pinned reticle. A colour, not a class, because the
   *  reticle is an SVG drawn twice (dark halo under, colour over). */
  pinnedCrosshairColor: string;
}

// ---------------------------------------------------------------------------
// Pinned reticle
// ---------------------------------------------------------------------------

/**
 * The pinned marker is a reticle, not a small cross.
 *
 * Two things it has to survive: a pale grey basemap under a warm heat ramp on
 * the thermal map, and a near-black one on the wind map. A single flat stroke
 * disappears into one or the other, so every stroke is painted twice — a dark
 * halo underneath, the colour over it — which reads on both.
 *
 * The centre is deliberately left open. The point the legend is reporting sits
 * exactly there, so filling it in would hide the pixel the user is asking about.
 * The arms stop short of the middle, a ring marks the spot, and the dot inside
 * it is drawn with a 1-px outline rather than the 4-px halo the rest gets —
 * haloed at full width its dark edge spans the whole ring and closes the gap
 * back up, which is the one thing this shape exists to avoid.
 */
const RETICLE = {
  /** Half the SVG box. Arms reach armOuter, so this must exceed it. */
  half: 24,
  /** Arms run from the edge of the gap out to here. */
  armOuter: 23,
  /** Where the arms start. Sits clear of the ring so the two read as separate. */
  gap: 13,
  ring: 7,
  dot: 1.5,
  stroke: 2,
  halo: 4,
  haloColor: 'rgba(0,0,0,0.55)',
};

function PinnedReticle({ x, y, color }: { x: number; y: number; color: string }) {
  const { half, armOuter, gap, ring, dot, stroke, halo, haloColor } = RETICLE;
  const size = half * 2;
  // One arm per side, drawn from the gap outwards.
  const arms = [
    [half, half - gap, half, half - armOuter],
    [half, half + gap, half, half + armOuter],
    [half - gap, half, half - armOuter, half],
    [half + gap, half, half + armOuter, half],
  ];

  const paint = (strokeColor: string, width: number) => (
    <g stroke={strokeColor} strokeWidth={width} strokeLinecap="round" fill="none">
      {arms.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
      ))}
      <circle cx={half} cy={half} r={ring} />
    </g>
  );

  return (
    <svg
      className="absolute pointer-events-none"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ left: x - half, top: y - half }}
    >
      {paint(haloColor, halo)}
      {paint(color, stroke)}
      <circle cx={half} cy={half} r={dot} fill={color} stroke={haloColor} strokeWidth={1} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const MapCanvas = memo(function MapCanvas({
  bounds,
  siteLat,
  siteLon,
  singleSiteZoom,
  siteMarkers,
  savedCenterLat,
  savedCenterLon,
  savedZoom,
  fallbackZoomK,
  sizeKey,
  layers,
  onTransformChange,
  onZoomChange,
  onSiteClick,
  markerHitSuppressesPin,
  onPinChange,
  projectionRef: projectionRefProp,
  transformRef: transformRefProp,
  containerClassName,
  hoverCrosshairClassName,
  pinnedCrosshairColor,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);
  const [pinnedCrosshair, setPinnedCrosshair] = useState<{ x: number; y: number } | null>(null);

  // Always call useRef — pick the prop version if provided, otherwise use the
  // internal fallback. This keeps the hook call count stable.
  const internalProjectionRef = useRef<GeoProjection | null>(null);
  const internalTransformRef = useRef<ZoomTransform>(zoomIdentity);
  const projectionRef = projectionRefProp ?? internalProjectionRef;
  const transformRef = transformRefProp ?? internalTransformRef;

  const siteMarkersRef = useRef(siteMarkers);
  siteMarkersRef.current = siteMarkers;

  const initialTransformApplied = useRef(false);
  const canvasSizeRef = useRef({ width: 0, height: 0 });

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
    if (!containerRef.current || !canvasRef.current) return;

    const { width, height } = canvasSizeRef.current;
    if (width === 0 || height === 0) return;

    const projection = createMapProjection();
    projectionRef.current = projection;

    // The grid rectangle in projected world coordinates. Computed before the
    // initial transform because minK bounds that transform too — see clampK.
    // coverScale is COVER, not contain, so the user can never zoom out past the
    // edge of the data; the reasoning is documented in mapExtent.ts and pinned
    // by mapExtent.test.mjs.
    const { tl: gridTL, br: gridBR, extW, extH } = gridWorldExtent(projection, bounds);
    const maxK = 256 * Math.pow(2, 20);

    // A pathologically small rectangle could want a cover scale above the zoom
    // ceiling, which would invert scaleExtent and throw. Cap it; the map is then
    // zoomed as far in as it goes, which is the closest honest approximation.
    const floorK = (w: number, h: number) => Math.min(coverScale(extW, extH, w, h), maxK);

    // Not const: the floor depends on the viewport, which changes without
    // remounting (phone rotation, window resize, expanding to fullscreen). The
    // ResizeObserver below recomputes it — otherwise the floor stays pinned to
    // whatever size the map happened to mount at.
    let minK = floorK(width, height);

    // d3-zoom clamps to scaleExtent on the first gesture, so an initial k outside
    // [minK, maxK] shows up as a jump the moment the user touches the map. Clamp
    // every initial transform through the same range instead.
    const clampK = (k: number) => Math.min(maxK, Math.max(minK, k));

    let initialTransform: ReturnType<typeof zoomIdentity.translate>;
    const markers = siteMarkersRef.current;
    if (markers && markers.length > 1) {
      const savedK = savedZoom ? 256 * Math.pow(2, savedZoom) : fallbackZoomK;

      // With no admin-configured default, open zoomed out as far as the data
      // allows, centred in world space rather than on the mid-latitude — see
      // gridWorldCenter.
      const useK = clampK(savedK || minK);
      const gridCenter = gridWorldCenter(projection, bounds);
      const centerPt =
        savedCenterLon != null && savedCenterLat != null
          ? projection([savedCenterLon, savedCenterLat])!
          : gridCenter;
      initialTransform = zoomIdentity
        .translate(width / 2 - centerPt[0] * useK, height / 2 - centerPt[1] * useK)
        .scale(useK);
    } else {
      const initialK = clampK(256 * Math.pow(2, singleSiteZoom));
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
      if (tileCache.size >= TILE_CACHE_MAX) {
        tileCache.delete(tileCache.keys().next().value!);
      }
      tileCache.set(key, img);
      return null;
    };

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Allocate layer resources
    let layerResources: any[] = layers.map(l => l.create?.(width, height));

    // Prefetch the 3×3 block of z12 terrain tiles around the current map centre
    // so that the next user tap usually hits the local fast path in elevationPoint.ts.
    // One z12 tile ≈ 9.6 × 7.5 km, so a 3×3 block covers ~29 × 22 km — more than
    // any site-level view shows.  9 tiles × ~20 KB ≈ 180 KB per pan/zoom settle.
    let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
    const schedulePrefetch = () => {
      if (prefetchTimer !== null) clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(() => {
        prefetchTimer = null;
        const proj = projectionRef.current;
        const t = transformRef.current;
        const { width: cw, height: ch } = canvasSizeRef.current;
        if (!proj || cw === 0 || ch === 0) return;
        const screen = t.invert([cw / 2, ch / 2]);
        const geo = proj.invert!(screen);
        if (!geo) return;
        const [lon, lat] = geo;
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        const { x: cx, y: cy } = tileCoordsFor(lon, lat);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            void prefetchTile(cx + dx, cy + dy);
          }
        }
      }, 300);
    };

    const zoom = d3Zoom<HTMLDivElement, unknown>()
      .scaleExtent([minK, maxK])
      .translateExtent([[gridTL[0], gridTL[1]], [gridBR[0], gridBR[1]]])
      .on('zoom', (event) => {
        const t = event.transform;
        transformRef.current = t;
        onZoomChange?.(t.k);

        if (onTransformChange) {
          const { width: cw, height: ch } = canvasSizeRef.current;
          const inverted = projection.invert!([(cw / 2 - t.x) / t.k, (ch / 2 - t.y) / t.k]);
          if (inverted) {
            onTransformChange(inverted[1], inverted[0], Math.log2(t.k / 256));
          }
        }
        schedulePrefetch();
      });

    const d3Container = select(containerRef.current);
    d3Container.call(zoom as Parameters<typeof d3Container.call>[0]);
    d3Container.call((zoom as Parameters<typeof d3Container.call>[0]).transform, transformRef.current);

    // Warm the initial view immediately (debounce fires after 300 ms so it
    // doesn't race the first render frame).
    schedulePrefetch();

    // todayStr refreshed every minute — computed once outside the render loop
    let todayStr = toMelbourneDate(new Date());
    const todayInterval = setInterval(() => {
      todayStr = toMelbourneDate(new Date());
    }, 60_000);

    // d3tile result cached until transform or canvas size changes
    let lastTileKey = '';
    let lastTiles: TileResult | null = null;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0 && canvasRef.current) {
          // Guard: only reset canvas (which clears context state) when dimensions actually change (#3).
          if (w !== canvasSizeRef.current.width || h !== canvasSizeRef.current.height) {
            canvasSizeRef.current = { width: w, height: h };
            canvasRef.current.width = w;
            canvasRef.current.height = h;
            // Dispose old layer resources and reallocate for new dimensions.
            layerResources.forEach((r, i) => layers[i].dispose?.(r));
            layerResources = layers.map(l => l.create?.(w, h));

            // Re-fit the zoom floor to the new viewport. Growing the map lowers
            // the floor; shrinking it raises the floor above the current scale,
            // so the existing transform has to be pushed back through d3 rather
            // than left behind — d3 only re-applies scaleExtent on the next
            // gesture, which would show up as a jump on first touch.
            minK = floorK(w, h);
            zoom.scaleExtent([minK, maxK]);
            if (transformRef.current.k < minK) {
              const center = gridWorldCenter(projection, bounds);
              d3Container.call(
                (zoom as Parameters<typeof d3Container.call>[0]).transform,
                zoomIdentity
                  .translate(w / 2 - center[0] * minK, h / 2 - center[1] * minK)
                  .scale(minK),
              );
            }
          }
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

      const c: MapRenderContext = { ctx, transform: currentTransform, transformRef, projection, width: w, height: h, todayStr };
      for (let i = 0; i < layers.length; i++) layers[i].draw(c, layerResources[i]);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      layerResources.forEach((r, i) => layers[i].dispose?.(r));
      if (prefetchTimer !== null) clearTimeout(prefetchTimer);
      clearInterval(todayInterval);
      resizeObserver.disconnect();
    };
  }, [bounds, siteLat, siteLon, singleSiteZoom, savedCenterLat, savedCenterLon, savedZoom, fallbackZoomK, sizeKey, layers, onTransformChange, onZoomChange]);

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

    const pin = () => { setPinnedCrosshair({ x, y }); onPinChange?.({ x, y }); };
    if (!markerHitSuppressesPin) pin();

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

    if (markerHitSuppressesPin) pin();
  }, [onSiteClick, onPinChange, markerHitSuppressesPin]);

  return (
    <div
      ref={containerRef}
      className={containerClassName}
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
          <div className={`absolute w-6 h-px ${hoverCrosshairClassName} -left-3 top-0`} />
          <div className={`absolute h-6 w-px ${hoverCrosshairClassName} left-0 -top-3`} />
        </div>
      )}

      {pinnedCrosshair && (
        <PinnedReticle
          x={pinnedCrosshair.x}
          y={pinnedCrosshair.y}
          color={pinnedCrosshairColor}
        />
      )}
    </div>
  );
});
