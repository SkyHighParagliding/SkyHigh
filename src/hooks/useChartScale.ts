import { useCallback, useState } from 'react';

/**
 * Altitude-scale mode shared by the SkewT, the thermal meteogram and (later) the
 * RASP view. `false` = PG working band (auto-zoomed to the day's thermals);
 * `true` = full profile (surface → top of the sounding). Persisted so the choice
 * carries across the Chart / SkewT views and both map surfaces.
 */
const KEY = 'skyhigh.chartFullScale';

export function useChartScale() {
  const [fullScale, setFullScale] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  const toggle = useCallback(() => {
    setFullScale(v => {
      const next = !v;
      try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return { fullScale, toggle };
}
