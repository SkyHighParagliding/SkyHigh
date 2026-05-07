import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, FastForward, Loader2, Calendar, ChevronUp } from 'lucide-react';
import { fetchWindGridCached } from '@/lib/windGridCache';
import { INITIAL_K, getCompassDirection, SPEED_LEGEND_CSS } from './windMapTypes';
export type { ZoomSetpoint, ZoomSetpoints, SiteMarker } from './windMapTypes';
export { DEFAULT_ZOOM_SETPOINTS, INITIAL_K, getCompassDirection, SPEED_LEGEND_CSS } from './windMapTypes';

export type { WindGrid } from './windmap/windInterpolation';
export { WindCanvas } from './windmap/WindCanvas';

import { WindCanvas } from './windmap/WindCanvas';
import type { WindGrid } from './windmap/windInterpolation';

interface WindMapProps {
  siteId: string;
  siteLat: number;
  siteLon: number;
  siteName?: string;
  fullscreen?: boolean;
}

const fetchWindGrid = fetchWindGridCached;

export default function WindMapProto({ siteId, siteLat, siteLon, siteName, fullscreen = false }: WindMapProps) {
  const [windGrid, setWindGrid] = useState<WindGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [isPlaying, setIsPlaying] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(5000);
  const [zoomK, setZoomK] = useState(INITIAL_K);
  const [singleWindInfo, setSingleWindInfo] = useState<{ speed: number; direction: number } | null>(null);
  const [mapMode, setMapMode] = useState<'today' | '7day'>('today');
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cycleSpeed = () => {
    setIsPlaying(true);
    setPlaySpeed(prev => {
      if (prev === 5000) return 2500;
      if (prev === 2500) return 1250;
      return 5000;
    });
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    setIsPlaying(false);

    if (mapMode === '7day') {
      fetch('/api/weather/extended-grid/wind-overlay')
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
            setError('Invalid extended wind data');
          }
          setLoading(false);
        })
        .catch(err => {
          setError(err.message || 'Failed to load 7-day wind data');
          setLoading(false);
        });
    } else {
      fetchWindGrid(siteId)
        .then(grid => {
          setWindGrid(grid);
          const now = Date.now();
          const start = new Date(grid.times[0]).getTime();
          const end = new Date(grid.times[grid.times.length - 1]).getTime();
          setCurrentTime(now >= start && now <= end ? now : start);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message || 'Failed to load wind data');
          setLoading(false);
        });
    }
  }, [siteId, mapMode]);

  const timeStep = mapMode === '7day' ? 4 * 60 * 60 * 1000 : 15 * 60 * 1000;

  useEffect(() => {
    if (isPlaying && windGrid) {
      playIntervalRef.current = setInterval(() => {
        setCurrentTime(prev => {
          const next = prev + timeStep;
          const end = new Date(windGrid.times[windGrid.times.length - 1]).getTime();
          const start = new Date(windGrid.times[0]).getTime();
          return next > end ? start : next;
        });
      }, playSpeed);
    } else {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, windGrid, playSpeed, timeStep]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    setCurrentTime(parseInt(e.target.value));
  }, []);

  const togglePlay = useCallback(() => setIsPlaying(p => !p), []);

  const formattedTime = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
    weekday: 'short',
    ...(mapMode === '7day' ? { day: 'numeric', month: 'short' } : {})
  }).format(currentTime);

  const forecastStart = windGrid ? new Date(windGrid.times[0]).getTime() : 0;
  const forecastEnd = windGrid ? new Date(windGrid.times[windGrid.times.length - 1]).getTime() : 0;

  const modeToggle = (
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
      <div className={`${fullscreen ? 'w-full h-full' : 'w-full h-[320px]'} relative flex items-center justify-center bg-[#0a0a0a] ${fullscreen ? '' : 'rounded-xl'}`}>
        <div className="absolute top-3 left-3 z-30">{modeToggle}</div>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
          <span className="text-xs text-white/50 font-mono">Loading {mapMode === '7day' ? '7-day' : ''} wind data...</span>
        </div>
      </div>
    );
  }

  if (error || !windGrid) {
    return (
      <div className={`${fullscreen ? 'w-full h-full' : 'w-full h-[320px]'} relative flex items-center justify-center bg-[#0a0a0a] ${fullscreen ? '' : 'rounded-xl'}`}>
        <div className="absolute top-3 left-3 z-30">{modeToggle}</div>
        <span className="text-xs text-red-400 font-mono">{error || 'No wind data available'}</span>
      </div>
    );
  }

  return (
    <div className={fullscreen ? "w-full h-full flex flex-col" : "w-full"}>
      <div className={`relative overflow-hidden ${fullscreen ? 'flex-1 min-h-0' : 'rounded-xl border border-gray-700'}`} style={fullscreen ? undefined : { height: '320px' }}>
        <WindCanvas
          windGrid={windGrid}
          currentTime={currentTime}
          siteLat={siteLat}
          siteLon={siteLon}
          siteName={siteName}
          onZoomChange={setZoomK}
          hideWindInfo
          onWindInfoChange={setSingleWindInfo}
        />

        <div className="absolute top-3 left-3 z-30 flex flex-col gap-1.5">
          {modeToggle}
          <div className="bg-black/50 backdrop-blur-sm rounded-lg px-2.5 py-2 text-[9px] font-mono">
            <div className="text-center text-[8px] text-white/80 font-semibold tracking-wide uppercase mb-1">Forecast Data</div>
            <div className="relative">
              <div className="h-2 w-full rounded-full" style={{ background: SPEED_LEGEND_CSS }} />
              {singleWindInfo && (
                <div
                  className="absolute top-0 w-px bg-card shadow-[0_0_3px_rgba(255,255,255,0.8)]"
                  style={{ left: `${Math.min(100, (singleWindInfo.speed / 20) * 100)}%`, height: 'calc(100% + 2px)' }}
                />
              )}
            </div>
            <div className="flex justify-between mt-1 text-[7px] font-mono text-white/70 px-0.5">
              <span>0</span><span>5</span><span>10</span><span>15</span><span>20+ kts</span>
            </div>
          </div>
          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1.5 text-[9px] font-mono whitespace-nowrap pointer-events-none">
            <div className="flex items-center gap-2">
              {singleWindInfo ? (
                <>
                  <span className="text-sky-400 font-bold">{singleWindInfo.speed.toFixed(1)} KTS</span>
                  <span className="text-white/40">|</span>
                  <span className="text-white font-bold">{singleWindInfo.direction.toFixed(0)}°</span>
                  <span className="text-sky-300 font-bold tracking-wider">{getCompassDirection(singleWindInfo.direction)}</span>
                  <svg
                    width="10"
                    height="14"
                    viewBox="0 0 10 18"
                    className="fill-white drop-shadow-[0_0_2px_rgba(255,255,255,0.5)]"
                    style={{ transform: `rotate(${singleWindInfo.direction}deg)`, transformOrigin: 'center' }}
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

        <div
          className="absolute bottom-0 left-0 right-0 z-20 transition-transform duration-300 ease-in-out"
          style={{ transform: trayOpen ? 'translateY(0)' : 'translateY(calc(100% - 24px))' }}
        >
          <div className="flex justify-center">
            <button
              onClick={() => setTrayOpen(o => !o)}
              className="w-[100px] h-[24px] bg-black/70 backdrop-blur-md border-t border-x border-white/10 rounded-t-md flex items-center justify-center hover:bg-black/80 transition-colors"
              aria-label={trayOpen ? 'Collapse controls' : 'Expand controls'}
            >
              <ChevronUp className={`w-3 h-3 text-white/50 transition-transform duration-300 ${trayOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <div className="bg-black/70 backdrop-blur-md border-t border-white/10 px-3 py-2">
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
                step={timeStep}
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

            <div className="flex items-center justify-between mt-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[8px] font-mono text-white/60">{5000 / playSpeed}x</span>
                <span className="text-[8px] font-mono text-white/60">ECMWF{mapMode === '7day' ? ' 7-DAY' : ''}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
