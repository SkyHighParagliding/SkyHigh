import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Altitude } from '@/components/Altitude';
import { Loader2, Maximize2, Minimize2, Crosshair, Wind, Thermometer, Info, X, LineChart, ChartLine } from 'lucide-react';
import { PointMeteogramModal } from './weather/PointMeteogramModal';
import { SkewTModal } from './weather/SkewTModal';
import { WindMapModeToggle } from './windmap/WindMapModeToggle';
import { ModeSwitchPill } from './windmap/ModeSwitchPill';
import { WindMapScrubberTray } from './windmap/WindMapScrubberTray';
import { MapScaleBar } from './windmap/MapScaleBar';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { SPEED_LEGEND_CSS, getCompassDirection, INITIAL_K, SCALE_BAR_BOTTOM_COLLAPSED } from './windMapTypes';
import type { SiteMarker, ZoomSetpoints } from './windMapTypes';
import type { WindGrid } from './windmap/windInterpolation';
import { useWindPlayback } from '@/hooks/useWindPlayback';
import { getThermalAt, getThermalStrength, effectiveWstar } from './windmap/thermalInterpolation';
import type { ThermalGrid } from './windmap/thermalInterpolation';
import { THERMAL_LEGEND_CSS, LEGEND_MAX_WSTAR, HATCH_MIN } from './windmap/thermalRenderer';
import { precipDescription } from '@/lib/precip';
import { airspaceAt, airspaceLabel, airspacesAt } from '@/lib/airspaceConflict';
import { AirspaceRange } from './AirspaceRange';

const M_TO_FT = 3.280839895;
// Ignore wide info regions / low ground obstacles for the airspace warning (see
// airspaceConflict.ts). Controlled/restricted/danger airspace IS flagged.
const AIRSPACE_WARN_SKIP = new Set(['FIR', 'OCA', 'OTHER', 'TIZ', 'GLIDING_SECTOR', 'WAVE_WINDOW']);

const WindCanvas = lazy(() => import('./windmap/WindCanvas').then(m => ({ default: m.WindCanvas })));
const ThermalCanvas = lazy(() => import('./windmap/ThermalCanvas').then(m => ({ default: m.ThermalCanvas })));
import { ThermalHelpModal } from './windmap/ThermalHelpModal';

interface SitesWindMapProps {
  sites: SiteMarker[];
  isAuthenticated?: boolean;
  zoomSetpoints?: ZoomSetpoints;
}

export function SitesWindMapProto({ sites, isAuthenticated, zoomSetpoints }: SitesWindMapProps) {
  const { settings, updateSettings } = useSettings();
  const { user } = useAuth();
  const clubName = settings.clubName || 'SkyHigh';
  const isAdmin = !!user?.isAdmin;
  const containerRef = useRef<HTMLDivElement>(null);
  const isThermalEnabled = settings.featureThermalMap === 'true';
  const meteogramEnabled = settings.featureMeteogram === 'true';
  const skewtEnabled = settings.featureSkewT === 'true';
  // Point-aware Chart / SkewT: tapped point opens a full-screen modal.
  const [chartPoint, setChartPoint] = useState<{ lat: number; lon: number; ground?: number } | null>(null);
  const [skewtPoint, setSkewtPoint] = useState<{ lat: number; lon: number; ground?: number; time: number } | null>(null);

  const [zoomK, setZoomK] = useState(INITIAL_K);
  const [selectedSite, setSelectedSite] = useState<{ site: SiteMarker; x: number; y: number } | null>(null);
  const [sitesWindInfo, setSitesWindInfo] = useState<{ speed: number; direction: number; groundAmsl?: number } | null>(null);
  const [thermalInfo, setThermalInfo] = useState<{ cape: number; blh: number; wstar?: number; ccl?: number; cloud?: number; cloudLow?: number; precip?: number; weatherCode?: number; groundAmsl?: number; lat?: number; lon?: number } | null>(null);
  // Mirror the renderer's overcast rule so the tapped-point strength label agrees
  // with the grey sheet (a low-cloud deck suppresses thermals — don't say "Good").
  const overcastOnsetPct = Number(settings.thermalOvercastOnsetPct) || 70;
  const overcastFullPct = Number(settings.thermalOvercastFullPct) || 95;
  const overcastPct = thermalInfo && thermalInfo.cloudLow !== undefined
    ? Math.max(thermalInfo.cloudLow, (thermalInfo.cloud ?? 0) >= 90 ? thermalInfo.cloud! : 0)
    : 0;
  const thermalOvercast = !!thermalInfo && thermalInfo.cloudLow !== undefined && overcastPct >= overcastOnsetPct;
  // Grade the label to the grey ramp (onset→full): "reduced" near onset where the
  // grey is faint, "suppressed" only past HATCH_MIN (a solid sheet).
  const overcastRaw = Math.min(1, Math.max(0, (overcastPct - overcastOnsetPct) / Math.max(1, overcastFullPct - overcastOnsetPct)));
  const thermalOvercastLabel = overcastRaw >= HATCH_MIN ? 'Overcast — suppressed' : 'Overcast — reduced';
  const [showThermalHelp, setShowThermalHelp] = useState(false);
  const [showWindOnThermal, setShowWindOnThermal] = useState(false);
  const [mapMode, setMapMode] = useState<'today' | '7day'>('today');
  const [viewMode, setViewMode] = useState<'wind' | 'thermal'>('wind');
  // Collapsible "Key" legend pill (bottom-left) — collapsed by default.
  const [showLegend, setShowLegend] = useState(false);
  // Dismiss handlers filled in by the active canvas; the ✕ on the readout box
  // calls the current mode's handler to clear the pin fully (box + pin +
  // crosshair), otherwise the render loop repaints it.
  const dismissThermalRef = useRef<(() => void) | null>(null);
  const dismissWindRef = useRef<(() => void) | null>(null);

  // Airspace conflict warning (thermal mode): same zones + logic as the site panel.
  const [zones, setZones] = useState<GeoJSON.FeatureCollection | null>(null);
  const [shownAirspace, setShownAirspace] = useState<GeoJSON.Feature | null>(null);
  // "Airspace ON" — outline every sector, not just a height conflict.
  const [showAllAirspace, setShowAllAirspace] = useState(false);
  useEffect(() => {
    fetch('/api/sites/xc/airspace')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: GeoJSON.FeatureCollection) => setZones(d))
      .catch(() => {});
  }, []);
  const airspaceConflicts = useMemo(() => {
    const t = thermalInfo;
    if (viewMode !== 'thermal' || !t || t.lat == null || t.lon == null || typeof t.groundAmsl !== 'number' || !zones) {
      return { bl: null as ReturnType<typeof airspaceAt>, cu: null as ReturnType<typeof airspaceAt> };
    }
    const blFt = (t.blh + t.groundAmsl) * M_TO_FT;
    const cuFt = t.ccl !== undefined ? (t.ccl + t.groundAmsl) * M_TO_FT : null;
    return {
      bl: t.blh > 0 ? airspaceAt(t.lat, t.lon, blFt, zones, AIRSPACE_WARN_SKIP) : null,
      cu: cuFt != null ? airspaceAt(t.lat, t.lon, cuFt, zones, AIRSPACE_WARN_SKIP) : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, thermalInfo?.lat, thermalInfo?.lon, thermalInfo?.blh, thermalInfo?.ccl, thermalInfo?.groundAmsl, zones]);
  const toggleAirspace = useCallback((f: GeoJSON.Feature) => setShownAirspace(cur => cur === f ? null : f), []);
  // "Airspace ON" list: every sector stacked under the pin (floor-first), thermal
  // mode only. Updates as you pan (the pin is screen-fixed).
  const airspaceStack = useMemo(() => {
    if (!showAllAirspace || viewMode !== 'thermal' || !thermalInfo || thermalInfo.lat == null || thermalInfo.lon == null || !zones) return [];
    return airspacesAt(thermalInfo.lat, thermalInfo.lon, zones, AIRSPACE_WARN_SKIP);
  }, [showAllAirspace, viewMode, thermalInfo?.lat, thermalInfo?.lon, zones]);
  // Turning airspace OFF also clears any drawn conflict sector (you may have
  // panned off it, so the tap-the-bracket toggle is no longer reachable).
  const toggleAllAirspace = useCallback(() => {
    setShowAllAirspace(v => {
      if (v) setShownAirspace(null);
      return !v;
    });
  }, []);
  const [thermalGrid, setThermalGrid] = useState<ThermalGrid | null>(null);
  const [thermalLoading, setThermalLoading] = useState(false);
  const [thermalError, setThermalError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canvasSizeKey, setCanvasSizeKey] = useState(0);
  const [isSettingView, setIsSettingView] = useState(false);
  const [liveView, setLiveView] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  // Mirror of liveView in a ref. The canvases take the saved viewport as a prop
  // that sits in their setup effect's dependency array, and that effect resets
  // initialTransformApplied — so feeding live state in directly would re-run it
  // on every pan and re-apply the transform in a loop. The ref lets us read the
  // current viewport without making it a render-visible dependency.
  const liveViewRef = useRef<{ lat: number; lon: number; zoom: number } | null>(null);
  // Viewport captured at the moment of a wind/thermal toggle. Changes only on
  // toggle, so the incoming canvas mounts where the outgoing one was, and the
  // setup effect still runs exactly once per switch.
  const [viewportSnapshot, setViewportSnapshot] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
  // lat/k for the scale bar, derived from onTransformChange (which fires on both
  // WindCanvas and ThermalCanvas). k = 256 * 2^zoomLevel.
  const [mapTransform, setMapTransform] = useState<{ lat: number; k: number }>({ lat: -37.8, k: INITIAL_K });
  const didPushHistoryRef = useRef(false);
  const closingViaPopRef = useRef(false);

  const savedLat = settings.windMapDefaultLat ? parseFloat(String(settings.windMapDefaultLat)) : undefined;
  const savedLon = settings.windMapDefaultLon ? parseFloat(String(settings.windMapDefaultLon)) : undefined;
  const savedZoom = settings.windMapDefaultZoom ? parseFloat(String(settings.windMapDefaultZoom)) : undefined;

  // What the canvases actually mount at: the viewport carried across the most
  // recent wind/thermal toggle, falling back to the admin-configured default on
  // first load (when no toggle has happened yet).
  const viewLat = viewportSnapshot?.lat ?? savedLat;
  const viewLon = viewportSnapshot?.lon ?? savedLon;
  const viewZoom = viewportSnapshot?.zoom ?? savedZoom;

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
  } = useWindPlayback(
    mapMode,
    todayFetcher,
    // Admin-set default opening hour for the site forecast map (Admin → Forecast).
    // Only applied when explicitly set; unset keeps the original "now" behaviour.
    settings.thermalMapDefaultHour !== undefined && settings.thermalMapDefaultHour !== ''
      ? parseInt(String(settings.thermalMapDefaultHour), 10)
      : undefined,
  );

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
    // Carry the current viewport across the switch. The two canvases are mounted
    // in an either/or ternary, so the incoming one would otherwise initialise
    // from the admin default and throw away wherever the pilot had panned to.
    if (liveViewRef.current) setViewportSnapshot(liveViewRef.current);
    setViewMode(mode);
    setSelectedSite(null);
    if (mode === 'thermal') setMapMode('today');
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
    liveViewRef.current = { lat, lon, zoom };
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

  // Dismiss the pinned readout in the active mode. Clears the pin fully (box +
  // pin + crosshair) so the render loop stops repainting it, and clears the
  // local readout state that drives the box.
  const dismissReading = useCallback(() => {
    if (viewMode === 'thermal') {
      dismissThermalRef.current?.();
      setThermalInfo(null);
    } else {
      dismissWindRef.current?.();
      setSitesWindInfo(null);
    }
  }, [viewMode]);

  const sitesModeToggle = <WindMapModeToggle mode={mapMode} onChange={setMapMode} />;

  // The Wind/Thermal view switch. Rendered top-left in the loaded state AND in the
  // loading/error states, so the correct pill is in place before the grid arrives
  // (the Today/7-day switch lives in the scrubber tray, not this corner). Single-pill
  // idiom: it shows the mode you'll switch TO (see ModeSwitchPill).
  const viewModeToggle = isThermalEnabled ? (
    <ModeSwitchPill
      value={viewMode}
      onChange={handleViewModeChange}
      options={[
        { value: 'wind', label: 'Wind', icon: Wind, colorClass: 'text-sky-400' },
        { value: 'thermal', label: 'Thermal', icon: Thermometer, colorClass: 'text-amber-400' },
      ]}
    />
  ) : null;

  if (loading) {
    return (
      <div className="w-full h-full relative flex items-center justify-center bg-[#0a0a0a] rounded-xl">
        <div className="absolute top-3 left-3 z-30">{viewModeToggle}</div>
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
        <div className="absolute top-3 left-3 z-30">{viewModeToggle}</div>
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
                dismissRef={dismissThermalRef}
                airspaceFeature={shownAirspace}
                allAirspace={showAllAirspace ? zones : null}
                sizeKey={canvasSizeKey}
                savedCenterLat={viewLat}
                savedCenterLon={viewLon}
                savedZoom={viewZoom}
                onTransformChange={handleTransformChange}
                windGrid={windGrid}
                showWind={showWindOnThermal}
                zoomSetpoints={zoomSetpoints}
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
              dismissRef={dismissWindRef}
              sizeKey={canvasSizeKey}
              initialZoomK={INITIAL_K}
              savedCenterLat={viewLat}
              savedCenterLon={viewLon}
              savedZoom={viewZoom}
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
            <div className="font-semibold text-ink text-sm">{selectedSite.site.name}</div>
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
              <a href={`/sites/${selectedSite.site.id}`} className="text-xs font-medium text-accent hover:underline">
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
                <a href={`/admin/sites/${selectedSite.site.id}/edit`} className="text-xs font-medium text-accent hover:underline">
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
          modeToggle={viewMode === 'wind' ? sitesModeToggle : undefined}
          insetBottom={isFullscreen}
        />
      </div>

      {/* Fullscreen button — top-right, per the map style guide. */}
      <button
        onClick={() => isFullscreen ? exitFullscreen() : setIsFullscreen(true)}
        className="absolute top-3 right-3 z-40 w-8 h-8 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors shadow-lg"
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

      {/* Mode controls — ALWAYS visible (never hidden). Wind/Thermal view toggle
          (feature-flagged) and the Today/7-day toggle (wind mode only). Sits
          top-left below the fullscreen button. */}
      <div className="absolute top-3 left-3 z-30 flex flex-col gap-1.5 max-w-[calc(100vw-1.5rem)]">
        {viewModeToggle}

        {/* Stacked, dismissable tapped-point readout box (top-left) — only shown
            after the map is tapped; ✕ closes it (clears the pin). One value/line. */}
        {((viewMode === 'thermal' && thermalInfo) || (viewMode === 'wind' && sitesWindInfo)) && (
        <div className={`bg-black/75 backdrop-blur-sm rounded-lg px-2.5 py-2 min-w-[120px] max-w-[calc(100vw-1.5rem)] ${showLegend ? 'hidden lg:block' : ''}`}>
          <div className="flex items-start justify-between gap-2.5">
            <div className="space-y-0.5">
              <div className="text-[10px] text-white/70 font-semibold uppercase tracking-wide">{viewMode === 'thermal' && showAllAirspace ? 'Airspace overhead' : 'Tapped point'}</div>
              {viewMode === 'thermal' ? (
                thermalInfo ? (
                  <>
                    {showAllAirspace ? (
                      airspaceStack.length === 0
                        ? <div className="text-[11px] text-white/50">No airspace here</div>
                        : airspaceStack.map((sec, i) => (
                            <div key={i} className="text-[11px] leading-tight">
                              <span className="font-semibold text-white/90">{airspaceLabel(sec)}</span>
                              <span className="text-white/55"> <AirspaceRange sector={sec} /></span>
                            </div>
                          ))
                    ) : (
                      <>
                        {thermalOvercast
                          ? <div className="text-[12px] font-bold leading-tight text-white/70">{thermalOvercastLabel}</div>
                          : <div className="text-[12px] font-bold leading-tight" style={{ color: getThermalStrength(effectiveWstar(thermalInfo.wstar, thermalInfo.cape)).color }}>{getThermalStrength(effectiveWstar(thermalInfo.wstar, thermalInfo.cape)).label}</div>}
                        {thermalInfo.blh > 0 && (
                          <div className="text-[11px] text-white/75">
                            BL Top {typeof thermalInfo.groundAmsl === 'number'
                              ? <><Altitude metres={thermalInfo.blh + thermalInfo.groundAmsl} step={100} /> AMSL</>
                              : <><Altitude metres={thermalInfo.blh} step={100} /> AGL</>}
                            {airspaceConflicts.bl && (
                              <button onClick={() => toggleAirspace(airspaceConflicts.bl!.feature)} className="ml-1 text-red-400 font-semibold hover:text-red-300">({airspaceLabel(airspaceConflicts.bl)})</button>
                            )}
                          </div>
                        )}
                        {thermalInfo.ccl !== undefined && thermalInfo.ccl > 0 && (
                          <div className={`text-[11px] ${thermalInfo.ccl < 600 ? 'text-amber-400' : 'text-white/75'}`}>
                            Cu Base {typeof thermalInfo.groundAmsl === 'number'
                              ? <><Altitude metres={thermalInfo.ccl + thermalInfo.groundAmsl} step={100} /> AMSL</>
                              : <><Altitude metres={thermalInfo.ccl} step={100} /> AGL</>}{thermalInfo.ccl < 600 ? ' ⚠' : ''}
                            {airspaceConflicts.cu && (
                              <button onClick={() => toggleAirspace(airspaceConflicts.cu!.feature)} className="ml-1 text-red-400 font-semibold hover:text-red-300">({airspaceLabel(airspaceConflicts.cu)})</button>
                            )}
                          </div>
                        )}
                        {typeof thermalInfo.precip === 'number' && thermalInfo.precip >= 0.1 && (
                          <div className="text-[11px] text-sky-300">{precipDescription(thermalInfo.precip, thermalInfo.weatherCode)}</div>
                        )}
                        {typeof thermalInfo.groundAmsl === 'number' && (
                          <div className="text-[11px] text-white/75">Ground <Altitude metres={thermalInfo.groundAmsl} step={10} /> AMSL</div>
                        )}
                      </>
                    )}
                    {/* Point actions. Chart opens the meteogram for this point; Airspace
                        ON lists the stack (OFF reverts + clears any drawn sector). */}
                    <div className="flex items-center gap-3 pt-1 mt-0.5 border-t border-white/10">
                      {meteogramEnabled && thermalInfo.lat != null && thermalInfo.lon != null && (
                        <button
                          onClick={() => setChartPoint({ lat: thermalInfo.lat!, lon: thermalInfo.lon!, ground: thermalInfo.groundAmsl })}
                          className="flex items-center gap-1 text-[11px] text-white/75 hover:text-white"
                          title="Thermal forecast chart for this point"
                        >
                          <LineChart className="w-3 h-3" /> Chart
                        </button>
                      )}
                      {skewtEnabled && thermalInfo.lat != null && thermalInfo.lon != null && (
                        <button
                          onClick={() => setSkewtPoint({ lat: thermalInfo.lat!, lon: thermalInfo.lon!, ground: thermalInfo.groundAmsl, time: currentTime })}
                          className="flex items-center gap-1 text-[11px] text-white/75 hover:text-white"
                          title="SkewT sounding for this point + time"
                        >
                          <ChartLine className="w-3 h-3" /> SkewT
                        </button>
                      )}
                      <button
                        onClick={() => toggleAllAirspace()}
                        className="flex items-center gap-1 text-[11px] text-white/75 hover:text-white"
                        title="List the airspace stack under the pin"
                      >
                        Airspace <span className={`font-semibold ${showAllAirspace ? 'text-sky-300' : 'text-white/40'}`}>{showAllAirspace ? 'ON' : 'OFF'}</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-white/50">Tap map for a reading</div>
                )
              ) : (
                sitesWindInfo ? (
                  <>
                    <div className="text-[12px] font-bold leading-tight text-sky-400">{sitesWindInfo.speed.toFixed(1)} kt</div>
                    <div className="text-[11px] text-white/75">
                      {sitesWindInfo.direction.toFixed(0)}° <span className="text-sky-300 font-semibold tracking-wide">{getCompassDirection(sitesWindInfo.direction)}</span>
                    </div>
                    {typeof sitesWindInfo.groundAmsl === 'number' && (
                      <div className="text-[11px] text-white/75">Ground <Altitude metres={sitesWindInfo.groundAmsl} step={10} /> AMSL</div>
                    )}
                  </>
                ) : (
                  <div className="text-[11px] text-white/50">Tap map for a reading</div>
                )
              )}
            </div>
            {((viewMode === 'thermal' && thermalInfo) || (viewMode === 'wind' && sitesWindInfo)) && (
              <button
                onClick={dismissReading}
                className="text-white/50 hover:text-white/80 transition-colors shrink-0 mt-0.5"
                title="Dismiss reading"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        )}
      </div>

      {/* Collapsible "Key" legend pill (bottom-left). Collapsed = gradient swatch
          + "Key"; expanded = a readable per-mode panel; tap panel or ✕ to hide. */}
      {showLegend ? (
        <button
          onClick={(e) => { e.stopPropagation(); setShowLegend(false); }}
          className={`absolute ${isFullscreen ? 'bottom-[calc(2.75rem+env(safe-area-inset-bottom,0px))]' : 'bottom-[2.75rem]'} left-3 z-30 text-left bg-black/75 backdrop-blur-sm rounded-lg px-2.5 py-2 max-w-[calc(100vw-1.5rem)]`}
          title="Tap to hide legend"
        >
          {viewMode === 'thermal' ? (
            <>
              <div className="flex items-center justify-between gap-2.5 mb-1">
                <span className="text-[10px] text-white/70 font-semibold uppercase tracking-wide">Thermal Strength</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  <span
                    onClick={(e) => { e.stopPropagation(); setShowThermalHelp(true); }}
                    className="text-white/40 hover:text-white/80 transition-colors cursor-pointer"
                    title="What do these readings mean?"
                    role="button"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </span>
                  <X className="w-3.5 h-3.5 text-white/50" />
                </span>
              </div>
              <div className="h-2.5 w-44 max-w-full rounded-full" style={{ background: THERMAL_LEGEND_CSS }} />
              {/* W* band labels pinned to their true threshold position. */}
              <div className="relative mt-1 h-[13px] w-44 max-w-full text-[10px] text-white/60 font-mono">
                {(
                  [
                    { label: 'Weak',   wstar: 0.3 },
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
              <div className="mt-2 space-y-1.5 text-[10px] text-white/75 leading-snug">
                <div className="flex items-center gap-2">
                  {/* Same shape the map draws (traceCumulus): three domes on a flat base. */}
                  <span className="w-[22px] flex justify-center shrink-0">
                    <svg width="22" height="16" viewBox="0 0 16 11">
                      <path fill="white" d="M2.52 9 A2.48 2.48 0 0 1 7.48 9 L4.8 7.4 A3.2 3.2 0 0 1 11.2 7.4 L9 8.8 A2.2 2.2 0 0 1 13.4 8.8 L2.52 9 Z" />
                    </svg>
                  </span>
                  <span>Cumulus — density = coverage · size &amp; brightness = depth</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-[22px] flex justify-center shrink-0"><span className="inline-block w-4 h-2.5 rounded-sm" style={{ background: 'linear-gradient(90deg, rgba(150,154,160,0.3), rgb(150,154,160))' }} /></span>
                  <span>Overcast — deeper grey = more low cloud; thermals suppressed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-[22px] flex justify-center shrink-0"><span className="inline-block w-3.5 h-2.5 rounded-sm" style={{ background: 'rgb(56,118,209)' }} /></span>
                  <span>Rain — deeper blue = heavier</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>Overdevelopment:</span>
                  <svg width="11" height="11" viewBox="0 0 11 11" className="shrink-0"><path d="M5.5 1 L10 10 L1 10 Z" fill="none" stroke="white" strokeWidth="1.2" /></svg>
                  <span className="text-white/60">watch</span>
                  <span className="text-white/35">·</span>
                  <svg width="11" height="11" viewBox="0 0 11 11" className="shrink-0"><path d="M5.5 1 L10 10 L1 10 Z" fill="white" /></svg>
                  <span className="text-white/60">likely</span>
                </div>
                {/* Wind-flow ON/OFF toggle — moved into the panel. */}
                <div
                  onClick={(e) => { e.stopPropagation(); setShowWindOnThermal(v => !v); }}
                  className="flex items-center gap-2 pt-0.5 cursor-pointer hover:text-white/90"
                  role="button"
                >
                  <span className="w-[22px] flex justify-center shrink-0 text-white/60">〰</span>
                  <span>Wind flow</span>
                  <span className={`ml-auto font-bold ${showWindOnThermal ? 'text-sky-300' : 'text-white/35'}`}>
                    {showWindOnThermal ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2.5 mb-1">
                <span className="text-[10px] text-white/70 font-semibold uppercase tracking-wide">Forecast Data</span>
                <X className="w-3.5 h-3.5 text-white/50 shrink-0" />
              </div>
              <div className="relative w-44 max-w-full">
                <div className="h-2.5 w-full rounded-full" style={{ background: SPEED_LEGEND_CSS }} />
                {sitesWindInfo && (
                  <div
                    className="absolute top-0 w-px bg-card shadow-[0_0_3px_rgba(255,255,255,0.8)]"
                    style={{ left: `${Math.min(100, (sitesWindInfo.speed / 20) * 100)}%`, height: 'calc(100% + 2px)' }}
                  />
                )}
              </div>
              <div className="flex justify-between mt-1 w-44 max-w-full text-[10px] font-mono text-white/60 px-0.5">
                <span>0</span><span>5</span><span>10</span><span>15</span><span>20+ kt</span>
              </div>
              {/* Site-type key. */}
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-white/75">
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white/50 shrink-0" /><span>{clubName}</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-500 border border-white/50 shrink-0" /><span>Other</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white/50 shrink-0" /><span>Restricted</span></div>
                <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white/50 shrink-0" /><span>Closed</span></div>
              </div>
            </>
          )}
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setShowLegend(true); }}
          className={`absolute ${isFullscreen ? 'bottom-[calc(0.4rem+env(safe-area-inset-bottom,0px))]' : 'bottom-[0.4rem]'} left-3 z-30 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full pl-1.5 pr-2.5 py-1 hover:bg-black/80 transition-colors`}
          title="Show legend"
        >
          <span className="h-2 w-8 rounded-full" style={{ background: viewMode === 'thermal' ? THERMAL_LEGEND_CSS : SPEED_LEGEND_CSS }} />
          <span className="text-[11px] text-white/80 font-medium">Key</span>
        </button>
      )}

      {/* Scale bar. Shifts up when the scrubber tray is open, and to clear the
          Key pill at bottom-left it sits offset right of it. */}
      <div
        className="absolute left-24 z-20 transition-[bottom] duration-300 pointer-events-none"
        style={{ bottom: trayOpen ? 104 : SCALE_BAR_BOTTOM_COLLAPSED }}
      >
        <MapScaleBar lat={mapTransform.lat} k={mapTransform.k} />
      </div>

      {/* Thermal help modal */}
      {showThermalHelp && <ThermalHelpModal onClose={() => setShowThermalHelp(false)} />}

      {/* Point-aware Chart popup — the meteogram for the tapped point. */}
      {chartPoint && (
        <PointMeteogramModal
          lat={chartPoint.lat}
          lon={chartPoint.lon}
          groundAmsl={chartPoint.ground}
          onClose={() => setChartPoint(null)}
        />
      )}

      {/* Interactive SkewT popup — the sounding for the tapped point + time. */}
      {skewtPoint && (
        <SkewTModal
          lat={skewtPoint.lat}
          lon={skewtPoint.lon}
          groundAmsl={skewtPoint.ground}
          time={skewtPoint.time}
          onClose={() => setSkewtPoint(null)}
        />
      )}
    </div>
  );
}
