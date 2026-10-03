import { Info } from 'lucide-react';
import type { RadarFrame } from '@/hooks/useRainviewer';
import { formatClockTime } from '@/lib/dateUtils';
import { formatMmhr } from './radarTiles';
import { SLIDER_INPUT_CLS } from '../windMapTypes';

interface RadarCardControlsProps {
  frames: RadarFrame[];
  index: number;
  onIndexChange: (i: number) => void;
  /** Index of the newest observed frame — boundary between LIVE and FORECAST. */
  nowIndex: number;
  isPlaying: boolean;
  onPlayToggle: () => void;
  loading: boolean;
  error: boolean;
  /** 12h (false) vs 24h (true) clock — shared with the card's time. */
  use24h: boolean;
  /** Toggle the 12/24h clock (shared with the header time). */
  onToggle24h: () => void;
  /** Sampled rain rate (mm/hr) at the tapped point, or null for no rain. */
  pointMmhr: number | null;
  /** Open the rain-radar help popup. */
  onHelp: () => void;
}

/**
 * The rain-radar loop (status + Play + timeline) for the tapped-point card. Opacity,
 * the Rain-radar scale and the RainViewer credit live elsewhere in the card so every
 * slider / scale is styled the same way. Play is a word, matching the card's other
 * text controls. The Real→Forecast split shows as a LIVE/FORECAST word, a two-tone
 * timeline (sky = observed, amber = nowcast) with a "now" tick, and a relative-time
 * caption.
 */
export function RadarCardControls(props: RadarCardControlsProps) {
  const { frames, index, onIndexChange, nowIndex, isPlaying, onPlayToggle, loading, error, use24h, onToggle24h, pointMmhr, onHelp } = props;

  const frame = frames[index];
  const isForecast = frame?.kind === 'nowcast';
  const hasFrames = frames.length > 0;
  const pastPct = frames.length > 1 ? (nowIndex / (frames.length - 1)) * 100 : 100;
  // Only explain the amber segment when there actually is one (nowcast present).
  const hasNowcast = frames.length > 1 && nowIndex < frames.length - 1;

  if (loading && !hasFrames) return <div className="text-[11px] text-white/75">Loading radar…</div>;
  if (error && !hasFrames) return <div className="text-[11px] text-red-400">Radar unavailable</div>;
  if (!hasFrames) return <div className="text-[11px] text-white/75">No recent radar frames</div>;

  return (
    <div className="w-full space-y-1.5" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-white/75 font-semibold tracking-wide">Rain radar</span>
        <button onClick={onHelp} className="text-white/40 hover:text-white/80 transition-colors" title="How to read the rain radar"><Info className="w-3.5 h-3.5" /></button>
      </div>
      {/* Status: Live/Forecast with its time right alongside (like "Fcst <time>").
          The time toggles the 12/24h clock, same as the header time. */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="text-[10px] font-semibold tracking-wide text-white/75">
          {isForecast ? 'Forecast' : 'Live'}
        </span>
        <button onClick={onToggle24h} className="text-[10px] text-sky-500 hover:text-sky-400 tabular-nums" title="Tap to switch 12-hour / 24-hour clock">
          {frame ? formatClockTime(frame.time * 1000, use24h) : ''}
        </button>
        <span className="text-[10px] text-white/75">
          {pointMmhr != null ? `≈ ${formatMmhr(pointMmhr)} mm/hr at tapped point` : 'No rain at tapped point'}
        </span>
      </div>

      {/* Play (as a word) + two-tone timeline. */}
      <div className="flex items-center gap-2">
        <button onClick={onPlayToggle} className="text-[10px] tracking-wide text-sky-500 hover:text-sky-400 w-14 text-left shrink-0">
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <div className="relative flex-1 flex items-center">
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full overflow-hidden pointer-events-none flex">
            <div className="h-full bg-sky-500/70" style={{ width: `${pastPct}%` }} />
            <div className="h-full bg-amber-400/70" style={{ width: `${100 - pastPct}%` }} />
          </div>
          {frames.length > 1 && pastPct < 100 && (
            <div className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-white/90 pointer-events-none" style={{ left: `${pastPct}%` }} />
          )}
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            step={1}
            value={index}
            onChange={(e) => onIndexChange(Number(e.target.value))}
            aria-label="Radar frame"
            className={SLIDER_INPUT_CLS}
          />
        </div>
      </div>

      {hasNowcast && <div className="text-[9px] text-white/40">Amber = forecast</div>}
    </div>
  );
}
