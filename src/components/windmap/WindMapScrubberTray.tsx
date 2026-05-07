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
  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-20 transition-transform duration-300 ease-in-out"
      style={{ transform: trayOpen ? 'translateY(0)' : `translateY(calc(100% - ${TRAY_HANDLE_HEIGHT_PX}px))` }}
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
      <div className="bg-black/70 backdrop-blur-md border-t border-white/10 px-3 py-2" inert={!trayOpen}>
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
          <input
            type="range"
            min={forecastStart}
            max={forecastEnd}
            step={timeStep}
            value={currentTime}
            onChange={onTimeChange}
            aria-label="Timeline"
            aria-valuetext={formattedTime}
            className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
          />
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
