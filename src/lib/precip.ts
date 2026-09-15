// Human-readable precipitation labels for the thermal map readout and the
// meteogram. Combines type (from the WMO weather code, when available) with
// intensity (from the mm/hr rate).
//
// CAVEAT: the rate is a ~9 km, hourly-averaged ECMWF value. It smooths convective
// showers heavily — a local downpour can read "Moderate", and a scattered shower
// can read "Light" because it is averaged over the whole cell. Treat the label as
// a guide (reliable for widespread stratiform rain), not a gauge.

export type PrecipKind = 'drizzle' | 'rain' | 'showers' | 'snow' | 'storm';

/** WMO weather code → precipitation kind, or null when the code carries no precip. */
export function precipKind(code: number | null | undefined): PrecipKind | null {
  if (code == null || !Number.isFinite(code)) return null;
  if (code >= 95) return 'storm';               // 95/96/99 thunderstorm
  if (code >= 85 && code <= 86) return 'snow';  // snow showers
  if (code >= 80 && code <= 82) return 'showers'; // rain showers
  if (code >= 71 && code <= 77) return 'snow';  // snowfall / grains
  if (code >= 61 && code <= 67) return 'rain';  // rain (incl. freezing)
  if (code >= 51 && code <= 57) return 'drizzle'; // drizzle (incl. freezing)
  return null;                                   // clear/cloud/fog — no precip
}

/** Rainfall-rate band from mm/hr (conventional scale). */
export function precipIntensity(mm: number): 'Drizzle' | 'Light' | 'Moderate' | 'Heavy' {
  if (mm < 0.5) return 'Drizzle';
  if (mm < 2.5) return 'Light';
  if (mm < 7.5) return 'Moderate';
  return 'Heavy';
}

/**
 * A short label such as "Light rain · 1.2 mm/hr", "Drizzle · 0.3 mm/hr", or
 * "Moderate showers · 3.1 mm/hr". `code` is optional — without it, the label
 * falls back to intensity only ("Light · 1.2 mm/hr").
 */
export function precipDescription(mm: number, code?: number | null): string {
  const rate = `${mm.toFixed(1)} mm/hr`;
  const kind = precipKind(code);
  if (kind === 'storm') return `Storms · ${rate}`;
  if (kind === 'snow') return `Snow · ${rate}`;
  const intensity = precipIntensity(mm);
  if (kind === 'showers') return `${intensity} showers · ${rate}`;
  if (kind === 'drizzle') return `Drizzle · ${rate}`;
  if (kind === 'rain') return `${intensity} rain · ${rate}`;
  return `${intensity} · ${rate}`;
}
