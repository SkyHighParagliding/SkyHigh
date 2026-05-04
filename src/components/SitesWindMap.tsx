import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Play, Pause, FastForward, Loader2, Calendar, Layers, Maximize2, Minimize2 } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { SPEED_LEGEND_CSS, getCompassDirection, INITIAL_K } from './windMapTypes';
import type { SiteMarker, ZoomSetpoints } from './windMapTypes';

const WindCanvas = lazy(() => import('./WindMapProto').then(m => ({ default: m.WindCanvas })));

interface WindGrid {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  ni: number;
  nj: number;
  times: string[];
  data: { u: number[]; v: number[] }[];
}

interface SitesWindMapProps {
  sites: SiteMarker[];
  isAuthenticated?: boolean;
  zoomSetpoints?: ZoomSetpoints;
}

export function SitesWindMapProto({ sites, isAuthenticated, zoomSetpoints }: SitesWindMapProps) {
  const { settings } = useSettings();
  const clubName = settings.clubName || 'SkyHigh';
  const containerRef = useRef<HTMLDivElement>(null);
  const [windGrid, setWindGrid] = useState<WindGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(5000);
  const [zoomK, setZoomK] = useState(INITIAL_K);
  const [selectedSite, setSelectedSite] = useState<{ site: SiteMarker; x: number; y: number } | null>(null);
  const [sitesWindInfo, setSitesWindInfo] = useState<{ speed: number; direction: number } | null>(null);
  const [mapMode, setMapMode] = useState<'today' | '7day'>('today');
  const [showOverlay, setShowOverlay] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canvasSizeKey, setCanvasSizeKey] = useState(0);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didPushHistoryRef = useRef(false);
  const closingViaPopRef = useRef(false);

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
        resizeTimer = setTimeout(() => setCanvasSizeKey(k => k + 1), 100);
      }
    };

    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') exitFullscreen();
      };
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
      resizeTimer = setTimeout(() => setCanvasSizeKey(k => k + 1), 50);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKey);
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('popstate', handlePopState);
        clearTimeout(resizeTimer);
      };
    } else {
      document.body.style.overflow = '';
      resizeTimer = setTimeout(() => setCanvasSizeKey(k => k + 1), 50);
      return () => clearTimeout(resizeTimer);
    }
  }, [isFullscreen, exitFullscreen]);

  const centerLat = sites.length > 0 ? sites.reduce((s, site) => s + site.lat, 0) / sites.length : -37.8;
  const centerLon = sites.length > 0 ? sites.reduce((s, site) => s + site.lon, 0) / sites.length : 145.0;

  useEffect(() => {
    setLoading(true);
    setError(null);
    setIsPlaying(false);

    const url = mapMode === '7day'
      ? '/api/weather/extended-grid/wind-overlay'
      : '/api/weather/wind-overlay/full';

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (data?.times?.length && data?.data?.length && data.ni && data.nj) {
          setWindGrid(data);
          const now = Date.now();
          const start = new Date(data.times[0]).getTime();
          const end = new Date(data.times[data.times.length - 1]).getTime();
          setCurrentTime(now >= start && now <= end ? now : start);
        } else {
          setError('Invalid wind data');
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to load wind data');
        setLoading(false);
      });
  }, [mapMode]);

  const cycleSpeed = () => {
    setIsPlaying(true);
    setPlaySpeed(prev => prev === 5000 ? 2500 : prev === 2500 ? 1250 : 5000);
  };

  const sitesTimeStep = mapMode === '7day' ? 4 * 60 * 60 * 1000 : 15 * 60 * 1000;

  useEffect(() => {
    if (isPlaying && windGrid) {
      playIntervalRef.current = setInterval(() => {
        setCurrentTime(prev => {
          const next = prev + sitesTimeStep;
          const end = new Date(windGrid.times[windGrid.times.length - 1]).getTime();
          const start = new Date(windGrid.times[0]).getTime();
          return next > end ? start : next;
        });
      }, playSpeed);
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    }
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, [isPlaying, windGrid, playSpeed, sitesTimeStep]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    setCurrentTime(parseInt(e.target.value));
  }, []);
  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);

  const handleSiteClick = useCallback((site: SiteMarker, x: number, y: number) => {
    setSelectedSite(prev => prev?.site.id === site.id ? null : { site, x, y });
  }, []);

  const handleZoomChange = useCallback((k: number) => {
    setZoomK(k);
    setSelectedSite(null);
  }, []);

  const formattedTime = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric', minute: 'numeric', hour12: true, weekday: 'short',
    ...(mapMode === '7day' ? { day: 'numeric', month: 'short' } : {})
  }).format(currentTime);

  const forecastStart = windGrid ? new Date(windGrid.times[0]).getTime() : 0;
  const forecastEnd = windGrid ? new Date(windGrid.times[windGrid.times.length - 1]).getTime() : 0;

  const sitesModeToggle = (
    <div className="flex bg-black/60 backdrop-blur-md rounded-full border border-white/10 p-0.5">
      <button
        onClick={() => setMapMode('today')}
        className={`px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wide transition-colors ${mapMode === 'today' ? 'bg-sky-500 text-white' : 'text-white/50 hover:text-white/80'}`}
      >
        TODAY
      </button>
      <button
        onClick={() => setMapMode('7day')}
        className={`px-2.5 py-1 rounded-full text-[9px] font-bold tracking-wide transition-colors flex items-center gap-1 ${mapMode === '7day' ? 'bg-sky-500 text-white' : 'text-white/50 hover:text-white/80'}`}
      >
        <Calendar className="w-2.5 h-2.5" />
        7 DAYS
      </button>
    </div>
  );

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
            hideWindInfo
            onWindInfoChange={setSitesWindInfo}
            sizeKey={canvasSizeKey}
            initialZoomK={INITIAL_K}
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

        <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-md border-t border-white/10 px-3 py-2 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="w-7 h-7 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center hover:bg-sky-500/20 transition-colors text-sky-400 shrink-0"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
            </button>
            <input
              type="range"
              min={forecastStart}
              max={forecastEnd}
              step={sitesTimeStep}
              value={currentTime}
              onChange={handleSliderChange}
              className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
            <button
              onClick={cycleSpeed}
              className="p-1 rounded hover:bg-white/5 transition-colors text-sky-500 shrink-0"
              title={`Speed: ${5000 / playSpeed}x`}
            >
              <FastForward className="w-3.5 h-3.5" />
            </button>
            <span className="text-[9px] font-mono text-sky-400 font-bold whitespace-nowrap shrink-0">{formattedTime}</span>
          </div>
          <div className="flex items-center justify-end mt-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-mono text-white/60">{5000 / playSpeed}x</span>
              <span className="text-[8px] font-mono text-white/60">ECMWF{mapMode === '7day' ? ' 7-DAY' : ''}</span>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={() => isFullscreen ? exitFullscreen() : setIsFullscreen(true)}
        className="absolute top-3 left-3 z-40 w-8 h-8 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors shadow-lg"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>

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
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white/50"></span>
            <span className="text-white/70">{clubName}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500 border border-white/50 ml-1.5"></span>
            <span className="text-white/70">Other</span>
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white/50 ml-1.5"></span>
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
