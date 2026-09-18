import { THERMAL_LEGEND_CSS, LEGEND_MAX_WSTAR } from './thermalRenderer';

/**
 * The thermal-map legend body: the W* strength gradient with its band labels,
 * plus the cumulus / overcast / rain / overdevelopment marks. Shared by the
 * SitesWindMap and SiteThermalPanel legend panels so the two never drift. The
 * surrounding panel chrome (header, close/info, wind-flow toggle) stays in each
 * caller since it differs between them.
 */
export function ThermalStrengthLegend() {
  return (
    <>
      <div className="h-2.5 w-44 max-w-full rounded-full" style={{ background: THERMAL_LEGEND_CSS }} />
      {/* Labels pinned to their true W* threshold position so they stay aligned
          with the gradient when the ramp changes. */}
      <div className="relative mt-1 h-[13px] w-44 max-w-full text-[10px] text-white/60 font-mono">
        {([
          { label: 'Weak', wstar: 0.3 },
          { label: 'Good', wstar: 1.5 },
          { label: 'Strong', wstar: 2.5 },
        ] as { label: string; wstar: number }[]).map(({ label, wstar }, i, arr) => {
          const pct = Math.min(100, (wstar / LEGEND_MAX_WSTAR) * 100);
          const isFirst = i === 0;
          const isLast = i === arr.length - 1;
          return (
            <span
              key={label}
              className="absolute"
              style={{ left: `${pct}%`, transform: isFirst ? 'none' : isLast ? 'translateX(-100%)' : 'translateX(-50%)' }}
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
      </div>
    </>
  );
}
