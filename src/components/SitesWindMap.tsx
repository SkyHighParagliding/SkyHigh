import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Altitude } from '@/components/Altitude';
import { Loader2, Layers, Maximize2, Minimize2, Crosshair, Wind, Thermometer, Info, X } from 'lucide-react';
import { WindMapModeToggle } from './windmap/WindMapModeToggle';
import { WindMapScrubberTray } from './windmap/WindMapScrubberTray';
import { MapScaleBar } from './windmap/MapScaleBar';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { SPEED_LEGEND_CSS, getCompassDirection, INITIAL_K } from './windMapTypes';
import type { SiteMarker, ZoomSetpoints } from './windMapTypes';
import type { WindGrid } from './windmap/windInterpolation';
import { useWindPlayback } from '@/hooks/useWindPlayback';
import { getThermalAt, getThermalStrength, effectiveWstar } from './windmap/thermalInterpolation';
import type { ThermalGrid } from './windmap/thermalInterpolation';
import { THERMAL_LEGEND_CSS, LEGEND_MAX_WSTAR } from './windmap/thermalRenderer';

const WindCanvas = lazy(() => import('./windmap/WindCanvas').then(m => ({ default: m.WindCanvas })));
const ThermalCanvas = lazy(() => import('./windmap/ThermalCanvas').then(m => ({ default: m.ThermalCanvas })));
import { ThermalHelpModal } from './windmap/ThermalHelpModal';

interface SitesWindMapProps {
  sites: SiteMarker[];
  isAuthenticated?: boolean;
  zoomSetpoints?: ZoomSetpoints;
}

/** Overlay hide-level at which nothing is drawn over the map at all. */
const OVERLAY_OFF = 5;

export function SitesWindMapProto({ sites, isAuthenticated, zoomSetpoints }: SitesWindMapProps) {
  const { settings, updateSettings } = useSettings();
  const { user } = useAuth();
  const clubName = settings.clubName || 'SkyHigh';
  const isAdmin = !!user?.isAdmin;
  const containerRef = useRef<HTMLDivElement>(null);
  const isThermalEnabled = settings.featureThermalMap === 'true';

  const [zoomK, setZoomK] = useState(INITIAL_K);
  const [selectedSite, setSelectedSite] = useState<{ site: SiteMarker; x: number; y: number } | null>(null);
  const [sitesWindInfo, setSitesWindInfo] = useState<{ speed: number; direction: number; groundAmsl?: number } | null>(null);
  const [thermalInfo, setThermalInfo] = useState<{ cape: number; blh: number; wstar?: number; ccl?: number; groundAmsl?: number } | null>(null);
  const [showThermalHelp, setShowThermalHelp] = useState(false);
  const [mapMode, setMapMode] = useState<'today' | '7day'>('today');
  const [viewMode, setViewMode] = useState<'wind' | 'thermal'>('wind');
  const [thermalGrid, setThermalGrid] = useState<ThermalGrid | null>(null);
  const [thermalLoading, setThermalLoading] = useState(false);
  const [thermalError, setThermalError] = useState<string | null>(null);
  // The INFO button strips overlay pills one at a time on phones where vertical
  // space is scarce. We use a numeric level rather than a named enum because the
  // pill count varies by viewMode and isThermalEnabled — a fixed enum cannot
  // express "one press removes exactly one currently-rendered pill". Each
  // increment hides one more pill, in this order:
  //   0 = full (all pills visible)
  //   1 = gradient legend hidden
  //   2 = site type legend hidden (wind mode only; skipped in thermal)
  //   3 = today/7-day toggle hidden (wind mode only; skipped in thermal)
  //   4 = view toggle hidden (only when isThermalEnabled)
  //   5 = off (bare map)
  // Desktop always renders the full overlay (lg:flex); the INFO button is
  // lg:hidden so the level only matters below the lg breakpoint.
  const [overlayLevel, setOverlayLevel] = useState(
    () => (typeof window !== 'undefined' && window.innerWidth >= 1024 ? 0 : OVERLAY_OFF),
  );
  // Derived helpers — read these instead of comparing the level directly, so the
  // logic stays in one place when pill definitions change.
  const showOverlay = overlayLevel < OVERLAY_OFF;
  const hideGradientLegend = overlayLevel >= 1;
  const hideSiteTypeLegend = overlayLevel >= 2;
  const hideModeToggle = overlayLevel >= 3;
  const hideViewToggle = overlayLevel >= 4;
  // Which pills are actually on screen right now, combining the hide level with
  // each pill's own render condition.
  const gradientPillShown = !hideGradientLegend;
  const siteTypePillShown = viewMode === 'wind' && !hideSiteTypeLegend;
  const modeTogglePillShown = viewMode === 'wind' && !hideModeToggle;
  const viewTogglePillShown = isThermalEnabled && !hideViewToggle;
  // The data pill moves up and left the moment it is the last one standing —
  // derived from the pills themselves rather than from a magic level, because the
  // level at which that happens differs by mode (4 in thermal, 3 when the thermal
  // feature is off, 4 in wind with it on).
  const dataPillOnly = showOverlay
    && !gradientPillShown && !siteTypePillShown && !modeTogglePillShown && !viewTogglePillShown;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canvasSizeKey, setCanvasSizeKey] = useState(0);
  const [isSettingView, setIsSettingView] = useState(false);
  const [liveView, setLiveView] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  // lat/k for the scale bar, derived from onTransformChange (which fires on both
  // WindCanvas and ThermalCanvas). k = 256 * 2^zoomLevel.
  const [mapTransform, setMapTransform] = useState<{ lat: number; k: number }>({ lat: -37.8, k: INITIAL_K });
  const didPushHistoryRef = useRef(false);
  const closingViaPopRef = useRef(false);

  const savedLat = settings.windMapDefaultLat ? parseFloat(String(settings.windMapDefaultLat)) : undefined;
  const savedLon = settings.windMapDefaultLon ? parseFloat(String(settings.windMapDefaultLon)) : undefined;
  const savedZoom = settings.windMapDefaultZoom ? parseFloat(String(settings.windMapDefaultZoom)) : undefined;

  const todayFetcher = useCallback(async (): Promise<WindGrid> => {
    const res = await fetch('/api/weather/wind-overlay/full');
    if (!res.ok) {
      if (res.status === 503) throw new Error('Wind data temporarily unavailable, please try again in a moment');
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }, []);

  const {
    windGrid, loading, error,
    currentTime, isPlaying, trayOpen, toggleTray,
    playSpeed, timeStep, forecastStart, forecastEnd,
    formattedTime, handleSliderChange, togglePlay, cycleSpeed,
  } = useWindPlayback(mapMode, todayFetcher);

  // Lazy-load thermal grid when user switches to thermal mode
  useEffect(() => {
    if (viewMode !== 'thermal' || thermalGrid) return;
    setThermalLoading(true);
    setThermalError(null);
    fetch('/api/weather/thermal-overlay')
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error((body as { error?: string })?.error || `HTTP ${res.status}`);
        }
        return res.json() as Promise<ThermalGrid>;
      })
      .then(data => { setThermalGrid(data); setThermalLoading(false); })
      .catch(e => { setThermalError((e as Error).message); setThermalLoading(false); });
  }, [viewMode, thermalGrid]);

  const handleViewModeChange = useCallback((mode: 'wind' | 'thermal') => {
    setViewMode(mode);
    setSelectedSite(null);
    if (mode === 'thermal') setMapMode('today');
    // Reset overlay to full when switching modes — the pill set changes and the
    // previous level may hide wrong pills.
    setOverlayLevel(prev => prev < OVERLAY_OFF ? 0 : prev);
  }, []);

  // Thermal data at the selected site, live-updating with currentTime
  const thermalAtSite = useMemo(() => {
    if (viewMode !== 'thermal' || !thermalGrid || !selectedSite) return null;
    return getThermalAt(selectedSite.site.lon, selectedSite.site.lat, currentTime, thermalGrid);
  }, [viewMode, thermalGrid, selectedSite, currentTime]);

  const thermalSiteStrength = thermalAtSite ? getThermalStrength(effectiveWstar(thermalAtSite.wstar, thermalAtSite.cape)) : null;

  const handleSaveView = useCallback(async () => {
    if (!liveView) return;
    try {
      await updateSettings({
        windMapDefaultLat: String(liveView.lat.toFixed(6)),
        windMapDefaultLon: String(liveView.lon.toFixed(6)),
        windMapDefaultZoom: String(liveView.zoom.toFixed(4)),
      });
      setIsSettingView(false);
    } catch (e) {
      console.error('Failed to save wind map view:', e);
    }
  }, [liveView, updateSettings]);

  const exitFullscreen = useCallback(() => {
    if (didPushHistoryRef.current && !closingViaPopRef.current) {
      didPushHistoryRef.current = false;
      window.history.back();
    } else {
      closingViaPopRef.current = false;
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setOverlayLevel(e.matches ? 0 : OVERLAY_OFF);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      if (isFullscreen) {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          requestAnimationFrame(() => setCanvasSizeKey(k => k + 1));
        }, 150);
      }
    };

    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
      const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exitFullscreen(); };
      const handlePopState = () => {
        didPushHistoryRef.current = false;
        closingViaPopRef.current = true;
        setIsFullscreen(false);
      };
      if (!didPushHistoryRef.current) {
        window.history.pushState({ windMapFullscreen: true }, '');
        didPushHistoryRef.current = true;
      }
      window.addEventListener('keydown', handleKey);
      window.addEventListener('resize', handleResize);
      window.addEventListener('popstate', handlePopState);
      resizeTimer = setTimeout(() => {
        requestAnimationFrame(() => setCanvasSizeKey(k => k + 1));
      }, 150);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKey);
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('popstate', handlePopState);
        clearTimeout(resizeTimer);
      };
    } else {
      document.body.style.overflow = '';
      resizeTimer = setTimeout(() => {
        requestAnimationFrame(() => setCanvasSizeKey(k => k + 1));
      }, 150);
      return () => clearTimeout(resizeTimer);
    }
  }, [isFullscreen, exitFullscreen]);

  const centerLat = useMemo(
    () => sites.length > 0 ? sites.reduce((s, site) => s + site.lat, 0) / sites.length : -37.8,
    [sites],
  );
  const centerLon = useMemo(
    () => sites.length > 0 ? sites.reduce((s, site) => s + site.lon, 0) / sites.length : 145.0,
    [sites],
  );

  const handleTransformChange = useCallback((lat: number, lon: number, zoom: number) => {
    setLiveView({ lat, lon, zoom });
    setMapTransform({ lat, k: 256 * Math.pow(2, zoom) });
  }, []);

  const handleSiteClick = useCallback((site: SiteMarker, x: number, y: number) => {
    setSelectedSite(prev => prev?.site.id === site.id ? null : { site, x, y });
  }, []);

  const handleZoomChange = useCallback((k: number) => {
    setZoomK(k);
    setSelectedSite(null);
  }, []);

  /**
   * The next level up that actually changes what is on screen. Levels whose pill
   * is not rendered in the current mode are skipped, so every press visibly
   * removes exactly one pill instead of appearing to do nothing.
   */
  const nextOverlayLevel = useCallback((prev: number) => {
    if (prev >= OVERLAY_OFF) return 0; // wrap: off → full
    let next = prev + 1;
    if (next === 2 && viewMode !== 'wind') next++;        // site type legend — wind only
    if (next === 3 && viewMode !== 'wind') next++;        // today/7-day toggle — wind only
    if (next === 4 && !isThermalEnabled) next++;          // view toggle — only when enabled
    return next;
  }, [viewMode, isThermalEnabled]);

  const advanceOverlayLevel = useCallback(() => {
    setOverlayLevel(nextOverlayLevel);
  }, [nextOverlayLevel]);

  // Tooltip describes what the *next* press will do, accounting for the skips
  // above — otherwise it promises to hide a pill that this mode never showed.
  const infoButtonTitle = (() => {
    const next = nextOverlayLevel(overlayLevel);
    if (next === 0) return 'Show map info';
    if (next >= OVERLAY_OFF) return 'Hide map info';
    return ['', 'Hide the strength legend', 'Hide the site key', 'Hide the today/7-day toggle', 'Hide the wind/thermal toggle'][next];
  })();

  const sitesModeToggle = <WindMapModeToggle mode={mapMode} onChange={setMapMode} />;

  if (loading) {
    return (
      <div className="w-full h-full relative flex items-center justify-center bg-[#0a0a0a] rounded-xl">
        <div className="absolute top-3 left-3 z-30">{sitesModeToggle}</div>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
          <span className="text-xs text-white/50 font-mono">Loading {mapMode === '7day' ? '7-day' : ''} wind data...</span>
        </div>
      </div>
    );
  }

  if (error || !windGrid) {
    return (
      <div className="w-full h-full relative flex items-center justify-center bg-[#0a0a0a] rounded-xl">
        <div className="absolute top-3 left-3 z-30">{sitesModeToggle}</div>
        <span className="text-xs text-red-400 font-mono">{error || 'No wind data available'}</span>
      </div>
    );
  }

  const fullscreenClasses = isFullscreen
    // dvh, not vh: on iOS Safari `100vh` is the *large* viewport, so the bottom
    // of the map slides under the collapsing toolbar and takes the tray with it.
    ? 'fixed inset-0 z-[10001] w-screen h-[100dvh]'
    : 'w-full h-full relative';

  const canvasFallback = (
    <div className="w-full h-full flex items-center justify-center bg-[#e8e8e8]">
      <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
    </div>
  );

  return (
    <div ref={containerRef} className={fullscreenClasses}>
      <div className={`relative overflow-hidden w-full h-full ${isFullscreen ? '' : 'rounded-xl'}`}>

        {/* Canvas area */}
        {viewMode === 'thermal' ? (
          thermalLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#e8e8e8]">
              <Loader2 className="w-6 h-6 text-amber-500 animate-spin mb-2" />
              <span className="text-xs text-gray-500 font-mono">Loading thermal data…</span>
            </div>
          ) : thermalError ? (
            <div className="w-full h-full flex items-center justify-center bg-[#e8e8e8]">
              <span className="text-xs text-red-500 font-mono">{thermalError}</span>
            </div>
          ) : thermalGrid ? (
            <Suspense fallback={canvasFallback}>
              <ThermalCanvas
                thermalGrid={thermalGrid}
                currentTime={currentTime}
                siteLat={centerLat}
                siteLon={centerLon}
                siteMarkers={sites}
                onSiteClick={handleSiteClick}
                onThermalInfoChange={setThermalInfo}
                sizeKey={canvasSizeKey}
                savedCenterLat={savedLat}
                savedCenterLon={savedLon}
                savedZoom={savedZoom}
                onTransformChange={handleTransformChange}
              />
            </Suspense>
          ) : null
        ) : (
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a]">
              <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
            </div>
          }>
            <WindCanvas
              windGrid={windGrid}
              currentTime={currentTime}
              siteLat={centerLat}
              siteLon={centerLon}
              onZoomChange={handleZoomChange}
              zoomSetpoints={zoomSetpoints}
              siteMarkers={sites}
              onSiteClick={handleSiteClick}
              onWindInfoChange={setSitesWindInfo}
              sizeKey={canvasSizeKey}
              initialZoomK={INITIAL_K}
              savedCenterLat={savedLat}
              savedCenterLon={savedLon}
              savedZoom={savedZoom}
              onTransformChange={handleTransformChange}
            />
          </Suspense>
        )}

        {/* Site popup */}
        {selectedSite && (
          <div
            className="absolute z-30 bg-card rounded-lg shadow-xl border border-border-subtle p-3 min-w-[180px]"
            style={{
              left: Math.min(Math.max(8, selectedSite.x + 12), (containerRef.current?.clientWidth || 400) - 200),
              top: Math.min(Math.max(8, selectedSite.y - 60), (containerRef.current?.clientHeight || 400) - 160),
              pointerEvents: 'auto',
            }}
          >
            <button
              onClick={() => setSelectedSite(null)}
              className="absolute top-1 right-1.5 text-foreground-faint hover:text-foreground-secondary text-xs font-bold"
            >
              &times;
            </button>
            <div className="font-semibold text-navy text-sm">{selectedSite.site.name}</div>
            {selectedSite.site.isSkyHighSite === 'true' && (
              <div className="text-[10px] text-emerald-600 font-medium">a {clubName} Site</div>
            )}

            {viewMode === 'thermal' ? (
              thermalSiteStrength ? (
                <div className="mt-1.5 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: thermalSiteStrength.color }} />
                    <span className="font-medium" style={{ color: thermalSiteStrength.color }}>{thermalSiteStrength.label}</span>
                  </div>
                  {thermalAtSite && effectiveWstar(thermalAtSite.wstar, thermalAtSite.cape) >= 0.3 && (
                    <div className="text-[10px] text-foreground-secondary space-y-0.5">
                      <div>
                        {thermalAtSite.wstar !== undefined
                          ? `W* ${thermalAtSite.wstar.toFixed(1)} m/s`
                          : `CAPE ${Math.round(thermalAtSite.cape)} J/kg`}
                      </div>
                      {(thermalAtSite.blh > 0 || (thermalAtSite.ccl !== undefined && thermalAtSite.ccl > 0)) && (
                        <div className="flex items-center gap-2">
                          {thermalAtSite.blh > 0 && (
                            <span>BL Top <Altitude metres={thermalAtSite.blh} step={100} /></span>
                          )}
                          {thermalAtSite.ccl !== undefined && thermalAtSite.ccl > 0 && (
                            <span className={thermalAtSite.ccl < 600 ? 'text-amber-500 font-medium' : ''}>
                              Cu Base <Altitude metres={thermalAtSite.ccl} step={100} />{thermalAtSite.ccl < 600 ? ' ⚠' : ''}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-foreground-secondary mt-1">Thermal data loading…</div>
              )
            ) : (
              <div className="text-xs text-muted-foreground mt-0.5">{selectedSite.site.type} &middot; {selectedSite.site.windDir}</div>
            )}

            <div className="flex items-center gap-3 mt-2">
              <a href={`/sites/${selectedSite.site.id}`} className="text-xs font-medium text-sky hover:underline">
                View Site Guide &rarr;
              </a>
              {viewMode !== 'thermal' && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedSite.site.lat},${selectedSite.site.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-emerald-600 hover:underline"
                >
                  Navigate
                </a>
              )}
            </div>
            {isAuthenticated && viewMode !== 'thermal' && (
              <div className="mt-1.5 pt-1.5 border-t border-border-subtle">
                <a href={`/admin/sites/${selectedSite.site.id}/edit`} className="text-xs font-medium text-orange hover:underline">
                  Edit Site
                </a>
              </div>
            )}
          </div>
        )}

        <WindMapScrubberTray
          trayOpen={trayOpen}
          onToggle={toggleTray}
          isPlaying={isPlaying}
          onPlayToggle={togglePlay}
          currentTime={currentTime}
          forecastStart={forecastStart}
          forecastEnd={forecastEnd}
          timeStep={timeStep}
          onTimeChange={handleSliderChange}
          playSpeed={playSpeed}
          onSpeedCycle={cycleSpeed}
          formattedTime={formattedTime}
          mapMode={mapMode}
        />
      </div>

      {/* Fullscreen button */}
      <button
        onClick={() => isFullscreen ? exitFullscreen() : setIsFullscreen(true)}
        className="absolute top-3 left-3 z-40 w-8 h-8 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors shadow-lg"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>

      {isAdmin && (
        <button
          onClick={() => isSettingView ? handleSaveView() : setIsSettingView(true)}
          title={isSettingView ? 'Save this view as default' : 'Set default map view'}
          className={`absolute top-3 right-12 z-40 p-1.5 rounded-full transition-colors shadow-lg ${
            isSettingView
              ? 'bg-orange-500 text-white ring-2 ring-orange-300 animate-pulse'
              : 'bg-black/60 text-white/80 hover:text-white hover:bg-black/80'
          }`}
        >
          <Crosshair className="w-4 h-4" />
        </button>
      )}

      <button
        onClick={advanceOverlayLevel}
        title={infoButtonTitle}
        className={`absolute top-3 right-3 z-30 lg:hidden flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wide transition-colors border shadow-lg ${
          overlayLevel === 0
            ? 'bg-sky-500 text-white border-white/20'
            : dataPillOnly
              // De-emphasised but still legible. A translucent sky tint was tried
              // here first and disappeared against the near-white thermal basemap,
              // so this state reuses the dark plate with a sky accent.
              ? 'bg-black/55 text-sky-200 border-sky-400/40 backdrop-blur-md'
              : showOverlay
                // Kept opaque enough to stay readable over the near-white thermal
                // basemap as well as the dark wind map.
                ? 'bg-sky-600/80 text-white border-sky-300/50 backdrop-blur-md'
                : 'bg-black/60 text-white/70 border-white/10 backdrop-blur-md'
        }`}
      >
        <Layers className="w-3 h-3" />
        INFO
      </button>

      {/* Overlay info panel.
          dataPillOnly: repositioned to top-3 left-14 so it sits in the top bar
          beside the fullscreen button, freeing the map area. max-w is tightened
          in that state so it cannot run under the INFO button at top-3 right-3. */}
      <div className={`absolute z-30 flex-col gap-1.5 ${
        dataPillOnly
          ? 'top-3 left-14 max-w-[calc(100vw-7rem)]'
          : 'top-14 left-3 max-w-[calc(100vw-1.5rem)]'
      } ${showOverlay ? 'flex' : 'hidden'} lg:flex lg:top-14 lg:left-3 lg:max-w-[calc(100vw-1.5rem)]`}>

        {/* Wind / Thermal view toggle (feature-flagged) */}
        {isThermalEnabled && !hideViewToggle && (
          <div className="flex bg-black/60 backdrop-blur-md rounded-full border border-white/10 p-0.5">
            <button
              onClick={() => handleViewModeChange('wind')}
              className={`px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wide transition-colors flex items-center gap-1 ${viewMode === 'wind' ? 'bg-sky-500 text-white' : 'text-white/50 hover:text-white/80'}`}
            >
              <Wind aria-hidden="true" className="w-2.5 h-2.5" />
              WIND
            </button>
            <button
              onClick={() => handleViewModeChange('thermal')}
              className={`px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wide transition-colors flex items-center gap-1 ${viewMode === 'thermal' ? 'bg-amber-500 text-white' : 'text-white/50 hover:text-white/80'}`}
            >
              <Thermometer aria-hidden="true" className="w-2.5 h-2.5" />
              THERMAL
            </button>
          </div>
        )}

        {/* Today / 7-day toggle (wind mode only) */}
        {viewMode === 'wind' && !hideModeToggle && sitesModeToggle}

        {/* Site type legend (wind mode only) */}
        {viewMode === 'wind' && !hideSiteTypeLegend && (
          <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-lg px-2.5 py-1.5 text-[9px] font-mono">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white/50" />
            <span className="text-white/70">{clubName}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 border border-white/50 ml-1.5" />
            <span className="text-white/70">Other</span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white/50 ml-1.5" />
            <span className="text-white/70">Restricted</span>
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white/50 ml-1.5" />
            <span className="text-white/70">Closed</span>
          </div>
        )}

        {/* Gradient legend — dropped first (level 1+) so the readout below rises. */}
        {!hideGradientLegend && (
        <div className="bg-black/50 backdrop-blur-sm rounded-lg px-2.5 py-2 text-[9px] font-mono">
          {viewMode === 'thermal' ? (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] text-white/80 font-semibold tracking-wide uppercase">Thermal Strength</span>
                <button
                  onClick={() => setShowThermalHelp(true)}
                  className="text-white/40 hover:text-white/80 transition-colors pointer-events-auto"
                  title="What do these readings mean?"
                >
                  <Info className="w-3 h-3" />
                </button>
              </div>
              <div className="h-2 w-full rounded-full" style={{ background: THERMAL_LEGEND_CSS }} />
              {/* Labels positioned at the true W* threshold fraction of LEGEND_MAX_WSTAR
                  so they align with where each band actually sits on the gradient. */}
              <div className="relative mt-1 h-[10px] text-[7px] font-mono text-white/70">
                {(
                  [
                    // No 'None' label: nothing is painted below W* 0.3, so it would
                    // sit at 0% with no colour to point at and collide with 'Weak'.
                    { label: 'Weak',   wstar: 0.3 },
                    { label: 'Mod',    wstar: 0.8 },
                    { label: 'Good',   wstar: 1.5 },
                    { label: 'Strong', wstar: 2.5 },
                  ] as { label: string; wstar: number }[]
                ).map(({ label, wstar }, i, arr) => {
                  const pct = Math.min(100, (wstar / LEGEND_MAX_WSTAR) * 100);
                  const isFirst = i === 0;
                  const isLast  = i === arr.length - 1;
                  return (
                    <span
                      key={label}
                      className="absolute"
                      style={{
                        left: `${pct}%`,
                        transform: isFirst ? 'none' : isLast ? 'translateX(-100%)' : 'translateX(-50%)',
                      }}
                    >{label}</span>
                  );
                })}
              </div>
              <div className="flex items-center gap-1 mt-1.5 text-[7px] text-white/60">
                <span className="text-[9px] leading-none">☁</span>
                <span>Cumulus</span>
                <span className="text-white/35 ml-auto">plain = blue thermals</span>
              </div>
            </>
          ) : (
            <>
              <div className="text-center text-[8px] text-white/80 font-semibold tracking-wide uppercase mb-1">Forecast Data</div>
              <div className="relative">
                <div className="h-2 w-full rounded-full" style={{ background: SPEED_LEGEND_CSS }} />
                {sitesWindInfo && (
                  <div
                    className="absolute top-0 w-px bg-card shadow-[0_0_3px_rgba(255,255,255,0.8)]"
                    style={{ left: `${Math.min(100, (sitesWindInfo.speed / 20) * 100)}%`, height: 'calc(100% + 2px)' }}
                  />
                )}
              </div>
              <div className="flex justify-between mt-1 text-[7px] font-mono text-white/70 px-0.5">
                <span>0</span><span>5</span><span>10</span><span>15</span><span>20+ kts</span>
              </div>
            </>
          )}
        </div>
        )}

        {/* Readout panel */}
        <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1.5 text-[9px] font-mono lg:whitespace-nowrap pointer-events-none">
          {viewMode === 'thermal' ? (
            <>
              {/* Desktop: single row (lg+) */}
              {thermalInfo ? (
                <div className="hidden lg:flex items-center gap-2">
                  <span className="font-bold" style={{ color: getThermalStrength(effectiveWstar(thermalInfo.wstar, thermalInfo.cape)).color }}>
                    {getThermalStrength(effectiveWstar(thermalInfo.wstar, thermalInfo.cape)).shortLabel}
                  </span>
                  <span className="text-white/40">|</span>
                  {thermalInfo.wstar !== undefined ? (
                    <span className="text-white/60">W* {thermalInfo.wstar.toFixed(1)} m/s</span>
                  ) : (
                    <span className="text-white/60">CAPE {Math.round(thermalInfo.cape)} J/kg</span>
                  )}
                  {thermalInfo.blh > 0 && (
                    <>
                      <span className="text-white/40">|</span>
                      <span className="text-white/60">BL Top <Altitude metres={thermalInfo.blh} step={100} className="pointer-events-auto" /></span>
                    </>
                  )}
                  {thermalInfo.ccl !== undefined && thermalInfo.ccl > 0 && (
                    <>
                      <span className="text-white/40">|</span>
                      <span className={thermalInfo.ccl < 600 ? 'text-amber-400 font-semibold' : 'text-white/60'}>
                        Cu Base <Altitude metres={thermalInfo.ccl} step={100} className="pointer-events-auto" />{thermalInfo.ccl < 600 ? ' ⚠' : ''}
                      </span>
                    </>
                  )}
                  {typeof thermalInfo.groundAmsl === 'number' && (
                    <>
                      <span className="text-white/40">|</span>
                      <span className="text-white/60">Ground <Altitude metres={thermalInfo.groundAmsl} step={10} className="pointer-events-auto" /></span>
                    </>
                  )}
                </div>
              ) : (
                <div className="hidden lg:flex items-center gap-2">
                  <span className="text-white/40">Tap map for thermal reading</span>
                </div>
              )}
              {/* Mobile: two rows (below lg) */}
              {thermalInfo ? (
                <div className="flex lg:hidden flex-col gap-1">
                  {/* Row 1: Strength | W-star/CAPE | BL */}
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold" style={{ color: getThermalStrength(effectiveWstar(thermalInfo.wstar, thermalInfo.cape)).color }}>
                      {getThermalStrength(effectiveWstar(thermalInfo.wstar, thermalInfo.cape)).shortLabel}
                    </span>
                    <span className="text-white/40">|</span>
                    {thermalInfo.wstar !== undefined ? (
                      <span className="text-white/60">W* {thermalInfo.wstar.toFixed(1)} m/s</span>
                    ) : (
                      <span className="text-white/60">CAPE {Math.round(thermalInfo.cape)} J/kg</span>
                    )}
                    {thermalInfo.blh > 0 && (
                      <>
                        <span className="text-white/40">|</span>
                        <span className="text-white/60">BL <Altitude metres={thermalInfo.blh} step={100} className="pointer-events-auto" /></span>
                      </>
                    )}
                  </div>
                  {/* Row 2: Cu Base | Ground (only if either is present) */}
                  {(thermalInfo.ccl !== undefined && thermalInfo.ccl > 0) || typeof thermalInfo.groundAmsl === 'number' ? (
                    <div className="flex items-center gap-1.5">
                      {thermalInfo.ccl !== undefined && thermalInfo.ccl > 0 && (
                        <span className={thermalInfo.ccl < 600 ? 'text-amber-400 font-semibold' : 'text-white/60'}>
                          Cu <Altitude metres={thermalInfo.ccl} step={100} className="pointer-events-auto" />{thermalInfo.ccl < 600 ? ' ⚠' : ''}
                        </span>
                      )}
                      {thermalInfo.ccl !== undefined && thermalInfo.ccl > 0 && typeof thermalInfo.groundAmsl === 'number' && (
                        <span className="text-white/40">|</span>
                      )}
                      {typeof thermalInfo.groundAmsl === 'number' && (
                        <span className="text-white/60">Gnd <Altitude metres={thermalInfo.groundAmsl} step={10} className="pointer-events-auto" /></span>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex lg:hidden items-center gap-2">
                  <span className="text-white/40">Tap map for thermal reading</span>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Desktop: single row (lg+) */}
              {sitesWindInfo ? (
                <div className="hidden lg:flex items-center gap-2">
                  <span className="text-sky-400 font-bold">{sitesWindInfo.speed.toFixed(1)} KTS</span>
                  <span className="text-white/40">|</span>
                  <span className="text-white font-bold">{sitesWindInfo.direction.toFixed(0)}°</span>
                  <span className="text-sky-300 font-bold tracking-wider">{getCompassDirection(sitesWindInfo.direction)}</span>
                  <svg
                    width="10"
                    height="14"
                    viewBox="0 0 10 18"
                    className="fill-white drop-shadow-[0_0_2px_rgba(255,255,255,0.5)]"
                    style={{ transform: `rotate(${sitesWindInfo.direction}deg)`, transformOrigin: 'center' }}
                  >
                    <path d="M 5 0 L 10 18 L 0 18 Z" />
                  </svg>
                  {typeof sitesWindInfo.groundAmsl === 'number' && (
                    <>
                      <span className="text-white/40">|</span>
                      <span className="text-white/60">Ground <Altitude metres={sitesWindInfo.groundAmsl} step={10} className="pointer-events-auto" /></span>
                    </>
                  )}
                  <span className="text-white/40">|</span>
                  <span className="text-white/50">Z{Math.max(0, Math.min(10, Math.round(((liveView?.zoom ?? Math.log2(INITIAL_K / 256)) - 6) * (10 / 7))))}</span>
                </div>
              ) : (
                <div className="hidden lg:flex items-center gap-2">
                  <span className="text-white/40">Tap map to pin wind reading</span>
                  <span className="text-white/40">|</span>
                  <span className="text-white/50">Z{Math.max(0, Math.min(10, Math.round(((liveView?.zoom ?? Math.log2(INITIAL_K / 256)) - 6) * (10 / 7))))}</span>
                </div>
              )}
              {/* Mobile: two rows (below lg) */}
              {sitesWindInfo ? (
                <div className="flex lg:hidden flex-col gap-1">
                  {/* Row 1: speed | dir compass arrow */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-sky-400 font-bold">{sitesWindInfo.speed.toFixed(1)} KTS</span>
                    <span className="text-white/40">|</span>
                    <span className="text-white font-bold">{sitesWindInfo.direction.toFixed(0)}°</span>
                    <span className="text-sky-300 font-bold tracking-wider">{getCompassDirection(sitesWindInfo.direction)}</span>
                    <svg
                      width="10"
                      height="14"
                      viewBox="0 0 10 18"
                      className="fill-white drop-shadow-[0_0_2px_rgba(255,255,255,0.5)]"
                      style={{ transform: `rotate(${sitesWindInfo.direction}deg)`, transformOrigin: 'center' }}
                    >
                      <path d="M 5 0 L 10 18 L 0 18 Z" />
                    </svg>
                  </div>
                  {/* Row 2: Gnd | Z */}
                  <div className="flex items-center gap-1.5">
                    {typeof sitesWindInfo.groundAmsl === 'number' && (
                      <>
                        <span className="text-white/60">Gnd <Altitude metres={sitesWindInfo.groundAmsl} step={10} className="pointer-events-auto" /></span>
                        <span className="text-white/40">|</span>
                      </>
                    )}
                    <span className="text-white/50">Z{Math.max(0, Math.min(10, Math.round(((liveView?.zoom ?? Math.log2(INITIAL_K / 256)) - 6) * (10 / 7))))}</span>
                  </div>
                </div>
              ) : (
                <div className="flex lg:hidden flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/40">Tap map to pin wind reading</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white/50">Z{Math.max(0, Math.min(10, Math.round(((liveView?.zoom ?? Math.log2(INITIAL_K / 256)) - 6) * (10 / 7))))}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Scale bar — visible in every INFO state except the bare-map off state.
          Shifts up when the scrubber tray is open so the tray doesn't cover it. */}
      {showOverlay && (
        <div
          className="absolute left-3 z-30 transition-[bottom] duration-300 pointer-events-none"
          style={{ bottom: trayOpen ? 104 : 8 }}
        >
          <MapScaleBar lat={mapTransform.lat} k={mapTransform.k} />
        </div>
      )}

      {/* Thermal help modal */}
      {showThermalHelp && <ThermalHelpModal onClose={() => setShowThermalHelp(false)} />}
    </div>
  );
}
