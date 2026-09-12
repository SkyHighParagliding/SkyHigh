import { toggleUnits } from '@/lib/units';
import { useUnits } from '@/hooks/useUnits';

// Earth circumference at the equator in metres.
const EARTH_CIRC_M = 40_075_016.686;

// Metric ladder: metres then kilometres.
const METRIC_LADDER_M: number[] = [
  10, 20, 50, 100, 200, 500,
  1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000, 500_000, 1_000_000,
];

// Imperial ladder: feet then statute miles. 1 mi = 1609.344 m, 1 ft = 0.3048 m.
const MILES_TO_M = 1609.344;
const FEET_TO_M = 0.3048;
const IMPERIAL_LADDER_M: number[] = [
  50 * FEET_TO_M, 100 * FEET_TO_M, 200 * FEET_TO_M, 500 * FEET_TO_M, 1000 * FEET_TO_M, 2000 * FEET_TO_M,
  0.5 * MILES_TO_M, 1 * MILES_TO_M, 2 * MILES_TO_M, 5 * MILES_TO_M,
  10 * MILES_TO_M, 20 * MILES_TO_M, 50 * MILES_TO_M, 100 * MILES_TO_M,
  200 * MILES_TO_M, 500 * MILES_TO_M,
];

const MAX_BAR_PX = 84;

function formatMetric(metres: number): string {
  if (metres >= 1000) return `${metres / 1000} km`;
  return `${metres} m`;
}

function formatImperial(metres: number): string {
  // If metres came from the feet portion of the ladder, metres < 0.5 mi
  const ft = metres / FEET_TO_M;
  const mi = metres / MILES_TO_M;
  if (mi >= 0.5) {
    // Display as miles (may be fractional like 0.5)
    return mi === Math.round(mi) ? `${Math.round(mi)} mi` : `${mi} mi`;
  }
  return `${Math.round(ft)} ft`;
}

interface MapScaleBarProps {
  /** Geographic latitude at the map centre (degrees). Used for cos-correction. */
  lat: number;
  /**
   * The d3 zoom transform's `k` value (world width in screen pixels).
   * At zoom-0, k=256 gives 156,543 m/px at the equator — the Web Mercator constant.
   * Derive from onTransformChange's zoomLevel via: k = 256 * 2 ** zoomLevel
   */
  k: number;
  className?: string;
}

export function MapScaleBar({ lat, k, className }: MapScaleBarProps) {
  const { units } = useUnits();

  // Metres per screen pixel at this latitude and zoom level.
  // Formula: (earth circumference at equator × cos(lat)) / k
  const mpp = (EARTH_CIRC_M * Math.cos(lat * (Math.PI / 180))) / k;

  const ladder = units === 'metric' ? METRIC_LADDER_M : IMPERIAL_LADDER_M;

  // Find the largest rung whose pixel width fits within MAX_BAR_PX.
  // Fall back to smallest if even that exceeds it; use largest if all fit.
  let chosen = ladder[0];
  for (const rung of ladder) {
    const px = rung / mpp;
    if (px <= MAX_BAR_PX) chosen = rung;
  }

  const barPx = Math.max(1, chosen / mpp);
  const label = units === 'metric' ? formatMetric(chosen) : formatImperial(chosen);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    toggleUnits();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      toggleUnits();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Scale: ${label}. Tap to switch units`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`pointer-events-auto cursor-pointer select-none${className ? ` ${className}` : ''}`}
    >
      {/* Label sits above the bar.
          The bar is drawn in white with a dark halo rather than a plate, because it
          has to stay readable over both the dark wind map and the near-white
          thermal basemap without boxing off any more of the map than the bar itself. */}
      <div
        className="text-[9px] font-mono text-white leading-tight mb-0.5"
        style={{ width: barPx, textAlign: 'center', textShadow: '0 0 3px rgba(0,0,0,0.95), 0 1px 2px rgba(0,0,0,0.8)' }}
      >
        {label}
      </div>
      {/* Bar: bottom border + left/right end ticks via box decoration */}
      <div
        style={{
          width: barPx,
          height: 6,
          borderBottom: '2px solid rgba(255,255,255,0.9)',
          borderLeft: '2px solid rgba(255,255,255,0.9)',
          borderRight: '2px solid rgba(255,255,255,0.9)',
          filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.9))',
        }}
      />
    </div>
  );
}
