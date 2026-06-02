import { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { WindMapModeToggle } from './windmap/WindMapModeToggle';
import { WindMapScrubberTray } from './windmap/WindMapScrubberTray';
import { fetchWindGridCached } from '@/lib/windGridCache';
import { INITIAL_K, getCompassDirection, SPEED_LEGEND_CSS } from './windMapTypes';
import { WindCanvas } from './windmap/WindCanvas';
import { useWindPlayback } from '@/hooks/useWindPlayback';

export type { ZoomSetpoint, ZoomSetpoints, SiteMarker } from './windMapTypes';
export { DEFAULT_ZOOM_SETPOINTS, INITIAL_K, getCompassDirection, SPEED_LEGEND_CSS } from './windMapTypes';
export type { WindGrid } from './windmap/windInterpolation';
export { WindCanvas } from './windmap/WindCanvas';

interface WindMapProps {
  siteId: string;
  siteLat: number;
  siteLon: number;
  siteName?: string;
  siteStatus?: string;
  siteUpcomingClosureDates?: string[];
  fullscreen?: boolean;
}

export default function WindMapProto({ siteId, siteLat, siteLon, siteName, siteStatus, siteUpcomingClosureDates, fullscreen = false }: WindMapProps) {
  const [zoomK, setZoomK] = useState(INITIAL_K);
  const [singleWindInfo, setSingleWindInfo] = useState<{ speed: number; direction: number } | null>(null);
  const [mapMode, setMapMode] = useState<'today' | '7day'>('today');

  const todayFetcher = useCallback(() => fetchWindGridCached(siteId), [siteId]);

  const {
    windGrid, loading, error,
    currentTime, isPlaying, trayOpen, toggleTray,
    playSpeed, timeStep, forecastStart, forecastEnd,
    formattedTime, handleSliderChange, togglePlay, cycleSpeed,
  } = useWindPlayback(mapMode, todayFetcher);

  const modeToggle = <WindMapModeToggle mode={mapMode} onChange={setMapMode} />;

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
    <div className={fullscreen ? 'w-full h-full flex flex-col' : 'w-full'}>
      <div
        className={`relative overflow-hidden ${fullscreen ? 'flex-1 min-h-0' : 'rounded-xl border border-gray-700'}`}
        style={fullscreen ? undefined : { height: '320px' }}
      >
        <WindCanvas
          windGrid={windGrid}
          currentTime={currentTime}
          siteLat={siteLat}
          siteLon={siteLon}
          siteName={siteName}
          onZoomChange={setZoomK}
          onWindInfoChange={setSingleWindInfo}
          siteStatus={siteStatus}
          siteUpcomingClosureDates={siteUpcomingClosureDates}
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
    </div>
  );
}
