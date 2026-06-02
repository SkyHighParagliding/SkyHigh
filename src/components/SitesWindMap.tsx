import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Loader2, Layers, Maximize2, Minimize2, Crosshair } from 'lucide-react';
import { WindMapModeToggle } from './windmap/WindMapModeToggle';
import { WindMapScrubberTray } from './windmap/WindMapScrubberTray';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { SPEED_LEGEND_CSS, getCompassDirection, INITIAL_K } from './windMapTypes';
import type { SiteMarker, ZoomSetpoints } from './windMapTypes';
import type { WindGrid } from './windmap/windInterpolation';
import { useWindPlayback } from '@/hooks/useWindPlayback';

const WindCanvas = lazy(() => import('./windmap/WindCanvas').then(m => ({ default: m.WindCanvas })));

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

  const [zoomK, setZoomK] = useState(INITIAL_K);
  const [selectedSite, setSelectedSite] = useState<{ site: SiteMarker; x: number; y: number } | null>(null);
  const [sitesWindInfo, setSitesWindInfo] = useState<{ speed: number; direction: number } | null>(null);
  const [mapMode, setMapMode] = useState<'today' | '7day'>('today');
  const [showOverlay, setShowOverlay] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canvasSizeKey, setCanvasSizeKey] = useState(0);
  const [isSettingView, setIsSettingView] = useState(false);
  const [liveView, setLiveView] = useState<{ lat: number; lon: number; zoom: number } | null>(null);
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
    const handler = (e: MediaQueryListEvent) => setShowOverlay(e.matches);
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
  }, []);

  const handleSiteClick = useCallback((site: SiteMarker, x: number, y: number) => {
    setSelectedSite(prev => prev?.site.id === site.id ? null : { site, x, y });
  }, []);

  const handleZoomChange = useCallback((k: number) => {
    setZoomK(k);
    setSelectedSite(null);
  }, []);

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
    ? 'fixed inset-0 z-[10001] w-screen h-screen'
    : 'w-full h-full relative';

  return (
    <div ref={containerRef} className={fullscreenClasses}>
      <div className={`relative overflow-hidden w-full h-full ${isFullscreen ? '' : 'rounded-xl'}`}>
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

        {selectedSite && (
          <div
            className="absolute z-30 bg-card rounded-lg shadow-xl border border-border-subtle p-3 min-w-[180px]"
            style={{
              left: Math.min(Math.max(8, selectedSite.x + 12), (containerRef.current?.clientWidth || 400) - 200),
              top: Math.min(Math.max(8, selectedSite.y - 60), (containerRef.current?.clientHeight || 400) - 140),
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
            <div className="text-xs text-muted-foreground mt-0.5">{selectedSite.site.type} &middot; {selectedSite.site.windDir}</div>
            <div className="flex items-center gap-3 mt-2">
              <a href={`/sites/${selectedSite.site.id}`} className="text-xs font-medium text-sky hover:underline">
                View Site Guide &rarr;
              </a>
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${selectedSite.site.lat},${selectedSite.site.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-emerald-600 hover:underline"
              >
                Navigate
              </a>
            </div>
            {isAuthenticated && (
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
        onClick={() => setShowOverlay(o => !o)}
        className={`absolute top-3 right-3 z-30 lg:hidden flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wide transition-colors border shadow-lg ${showOverlay ? 'bg-sky-500 text-white border-white/20' : 'bg-black/60 text-white/70 border-white/10 backdrop-blur-md'}`}
      >
        <Layers className="w-3 h-3" />
        INFO
      </button>

      <div className={`absolute top-14 left-3 z-30 flex-col gap-1.5 ${showOverlay ? 'flex' : 'hidden'} lg:flex`}>
        {sitesModeToggle}
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
        <div className="bg-black/50 backdrop-blur-sm rounded-lg px-2.5 py-2 text-[9px] font-mono">
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
        </div>
        <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1.5 text-[9px] font-mono whitespace-nowrap pointer-events-none">
          <div className="flex items-center gap-2">
            {sitesWindInfo ? (
              <>
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
                <span className="text-white/40">|</span>
                <span className="text-white/50">Z{Math.max(0, Math.min(10, Math.round((Math.log2(zoomK / 256) - 6) * (10 / 7))))}</span>
              </>
            ) : (
              <>
                <span className="text-white/40">Tap map to pin wind reading</span>
                <span className="text-white/40">|</span>
                <span className="text-white/50">Z{Math.max(0, Math.min(10, Math.round((Math.log2(zoomK / 256) - 6) * (10 / 7))))}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
