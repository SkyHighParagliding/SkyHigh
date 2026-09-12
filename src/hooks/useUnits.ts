import { useSyncExternalStore, useCallback } from 'react';
import {
  getUnits,
  setUnits,
  toggleUnits,
  subscribeUnits,
  formatAltitude as _formatAltitude,
  type UnitSystem,
} from '@/lib/units';

/**
 * React hook for the altitude unit preference.
 *
 * Uses useSyncExternalStore over the units module so there is no React context
 * and no App.tsx wiring required — any component can call this hook and it will
 * re-render automatically whenever the preference changes (including cross-tab).
 */
export function useUnits(): {
  units: UnitSystem;
  setUnits: (u: UnitSystem) => void;
  toggleUnits: () => void;
  formatAltitude: (metres: number, step?: number) => string;
} {
  const units = useSyncExternalStore(subscribeUnits, getUnits);

  const formatAltitude = useCallback(
    (metres: number, step = 1) => _formatAltitude(metres, step),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [units], // re-create when units change so callers that capture this function get fresh output
  );

  return { units, setUnits, toggleUnits, formatAltitude };
}
