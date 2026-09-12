/**
 * units.ts — single source of truth for the metric/imperial altitude preference.
 *
 * Designed as a plain (non-React) module so that non-React code (Leaflet HTML-string
 * popups, canvas renderers) can import formatAltitude directly without hooks.
 *
 * Subscribers are notified synchronously after every setUnits call, and also when the
 * storage event fires so the preference stays in sync across browser tabs.
 */

export type UnitSystem = 'metric' | 'imperial';

export const UNITS_STORAGE_KEY = 'skyhigh:units';

const listeners = new Set<() => void>();

/**
 * Cached so getUnits() is a cheap, referentially-stable read. useSyncExternalStore
 * calls its snapshot getter on every render, and hitting localStorage each time is
 * needless synchronous I/O. Invalidated by setUnits and by the cross-tab storage event.
 */
let cached: UnitSystem | null = null;

function readStorage(): UnitSystem {
  try {
    const v = localStorage.getItem(UNITS_STORAGE_KEY);
    return v === 'imperial' ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}

function writeStorage(u: UnitSystem): void {
  try {
    localStorage.setItem(UNITS_STORAGE_KEY, u);
  } catch {
    // Safari private mode — ignore
  }
}

function notify(): void {
  listeners.forEach(fn => fn());
}

// Keep in sync across tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === UNITS_STORAGE_KEY) { cached = null; notify(); }
  });
}

export function getUnits(): UnitSystem {
  if (cached === null) cached = readStorage();
  return cached;
}

export function setUnits(u: UnitSystem): void {
  cached = u;
  writeStorage(u);
  notify();
}

export function toggleUnits(): void {
  setUnits(getUnits() === 'metric' ? 'imperial' : 'metric');
}

/** Returns an unsubscribe function. */
export function subscribeUnits(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function metresToFeet(m: number): number {
  return m * 3.280839895;
}

/**
 * Format an altitude value for display.
 *
 * @param metres - The altitude in metres.
 * @param step   - Rounding step in metres (e.g. 100 for BL/CCL, 1 for live GPS).
 *                 When step >= 50 the imperial value is rounded to the nearest 100 ft;
 *                 otherwise it is rounded to the nearest 1 ft.
 * @returns e.g. '1100m' or '3600ft', or '—' for non-finite input.
 */
export function formatAltitude(metres: number, step = 1): string {
  if (!Number.isFinite(metres)) return '—';

  const units = getUnits();

  if (units === 'metric') {
    const rounded = Math.round(metres / step) * step;
    return `${rounded}m`;
  } else {
    const feet = metresToFeet(metres);
    const ftStep = step >= 50 ? 100 : 1;
    const rounded = Math.round(feet / ftStep) * ftStep;
    return `${rounded}ft`;
  }
}
