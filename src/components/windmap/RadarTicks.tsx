import { RADAR_TICKS } from './radarTiles';

/** mm/hr tick labels under the rain-radar gradient, placed at their log positions. */
export function RadarTicks({ className = '' }: { className?: string }) {
  return (
    <div className={`relative h-3 mt-1 text-[10px] font-mono ${className}`}>
      {RADAR_TICKS.map(t => (
        <span
          key={t.label}
          className="absolute top-0 whitespace-nowrap"
          style={t.pos === 0 ? { left: 0 } : t.pos === 1 ? { right: 0 } : { left: `${t.pos * 100}%`, transform: 'translateX(-50%)' }}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}
