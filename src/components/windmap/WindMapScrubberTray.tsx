import { useMemo } from 'react';
import { Play, Pause, FastForward, ChevronUp } from 'lucide-react';
import { TRAY_HANDLE_HEIGHT_PX } from '../windMapTypes';
import type { PlaySpeed } from '../windMapTypes';

interface WindMapScrubberTrayProps {
  trayOpen: boolean;
  onToggle: () => void;
  isPlaying: boolean;
  onPlayToggle: () => void;
  currentTime: number;
  forecastStart: number;
  forecastEnd: number;
  timeStep: number;
  onTimeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  playSpeed: PlaySpeed;
  onSpeedCycle: () => void;
  formattedTime: string;
  mapMode: 'today' | '7day';
}

export function WindMapScrubberTray({
  trayOpen, onToggle, isPlaying, onPlayToggle,
  currentTime, forecastStart, forecastEnd, timeStep, onTimeChange,
  playSpeed, onSpeedCycle, formattedTime, mapMode,
}: WindMapScrubberTrayProps) {
  // One label per whole day the slider spans, positioned at that day's start:
  // "Today", then the short weekday name (Melbourne). Makes the multi-day window
  // legible — you can see at a glance which day the slider is over.
  const dayMarkers = useMemo(() => {
    const span = forecastEnd - forecastStart;
    if (!(span > 0)) return [];
    const DAY = 24 * 60 * 60 * 1000;
    const markers: { frac: number; label: string }[] = [];
    for (let i = 0; i * DAY < span; i++) {
      const t = forecastStart + i * DAY;
      // +3h keeps the weekday lookup safely inside the local day across DST edges.
      const label = i === 0
        ? 'Today'
        : new Date(t + 3 * 60 * 60 * 1000).toLocaleDateString('en-AU', {
            weekday: 'short',
            timeZone: 'Australia/Melbourne',
          });
      markers.push({ frac: (t - forecastStart) / span, label });
    }
    return markers;
  }, [forecastStart, forecastEnd]);

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 transition-transform duration-300 ease-in-out"
      style={{
        // Collapsed, the tray is pushed down by its own height less the handle
        // AND less the home-indicator inset. Without the inset term the handle
        // lands inside iOS's bottom gesture strip, where the system swipe claims
        // every touch and the tray simply cannot be opened. The strip below the
        // handle is then filled by the top of the control bar, so the tray still
        // reads as flush with the screen edge.
        transform: trayOpen
          ? 'translateY(0)'
          : `translateY(calc(100% - ${TRAY_HANDLE_HEIGHT_PX}px - env(safe-area-inset-bottom, 0px)))`,
      }}
    >
      <div className="flex justify-center">
        <button
          onClick={onToggle}
          className="w-[100px] bg-black/70 backdrop-blur-md border-t border-x border-white/10 rounded-t-md flex items-center justify-center hover:bg-black/80 transition-colors"
          style={{ height: TRAY_HANDLE_HEIGHT_PX }}
          aria-label={trayOpen ? 'Collapse controls' : 'Expand controls'}
        >
          <ChevronUp aria-hidden="true" className={`w-3 h-3 text-white/50 transition-transform duration-300 ${trayOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>
      <div
        className="bg-black/85 border-t border-white/10 px-3 pt-2 pb-2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        inert={!trayOpen}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onPlayToggle}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-7 h-7 rounded-full bg-sky-500/10 border border-sky-500/20 flex items-center justify-center hover:bg-sky-500/20 transition-colors text-sky-400 shrink-0"
          >
            {isPlaying
              ? <Pause aria-hidden="true" className="w-3.5 h-3.5 fill-current" />
              : <Play aria-hidden="true" className="w-3.5 h-3.5 fill-current ml-0.5" />}
          </button>
          <div className="flex-1 min-w-0">
            <input
              type="range"
              min={forecastStart}
              max={forecastEnd}
              step={timeStep}
              value={currentTime}
              onChange={onTimeChange}
              aria-label="Timeline"
              aria-valuetext={formattedTime}
              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
            />
            {dayMarkers.length > 1 && (
              <div className="relative h-3 mt-1 select-none" aria-hidden="true">
                {dayMarkers.map((m, i) => (
                  <span
                    key={i}
                    className="absolute top-0 flex items-center text-[8px] font-mono uppercase tracking-wide text-white/55 whitespace-nowrap"
                    style={{ left: `${m.frac * 100}%` }}
                  >
                    <span className="inline-block w-px h-1.5 bg-white/25 mr-0.5" />
                    {m.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onSpeedCycle}
            className="p-1 rounded hover:bg-white/5 transition-colors text-sky-500 shrink-0"
            aria-label={`Speed: ${5000 / playSpeed}x`}
          >
            <FastForward aria-hidden="true" className="w-3.5 h-3.5" />
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
  );
}
