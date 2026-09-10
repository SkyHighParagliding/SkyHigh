export interface ThermalGrid {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  deltaLon: number;
  deltaLat: number;
  ni: number;
  nj: number;
  times: string[];
  data: { cape: number; blh: number; wstar?: number; ccl?: number }[][];
}

const epochCache = new WeakMap<string[], number[]>();
function getGridEpochs(times: string[]): number[] {
  let cached = epochCache.get(times);
  if (!cached) {
    cached = times.map(t => new Date(t).getTime());
    epochCache.set(times, cached);
  }
  return cached;
}

function interpolateSpatial(
  lon: number, lat: number,
  timeData: { cape: number; blh: number; wstar?: number; ccl?: number }[],
  grid: ThermalGrid,
): { cape: number; blh: number; wstar?: number; ccl?: number } | null {
  const fi = (lon - grid.lonMin) / grid.deltaLon;
  const fj = (lat - grid.latMin) / grid.deltaLat;
  const i = Math.floor(fi);
  const j = Math.floor(fj);
  const dx = fi - i;
  const dy = fj - j;
  const i0 = Math.max(0, Math.min(i, grid.ni - 1));
  const i1 = Math.max(0, Math.min(i + 1, grid.ni - 1));
  const j0 = Math.max(0, Math.min(j, grid.nj - 1));
  const j1 = Math.max(0, Math.min(j + 1, grid.nj - 1));

  const getVal = (ix: number, jy: number) => timeData[jy * grid.ni + ix];
  const v00 = getVal(i0, j0);
  const v10 = getVal(i1, j0);
  const v01 = getVal(i0, j1);
  const v11 = getVal(i1, j1);
  if (!v00 || !v10 || !v01 || !v11) return null;

  const lerp = (a: number, b: number, c: number, d: number) => {
    const r0 = a * (1 - dx) + b * dx;
    const r1 = c * (1 - dx) + d * dx;
    return r0 * (1 - dy) + r1 * dy;
  };

  const hasWstar = v00.wstar !== undefined;
  return {
    cape:  lerp(v00.cape, v10.cape, v01.cape, v11.cape),
    blh:   lerp(v00.blh,  v10.blh,  v01.blh,  v11.blh),
    wstar: hasWstar ? lerp(v00.wstar!, v10.wstar!, v01.wstar!, v11.wstar!) : undefined,
    ccl:   hasWstar ? lerp(v00.ccl!,  v10.ccl!,  v01.ccl!,  v11.ccl!)   : undefined,
  };
}

export function getThermalAt(
  lon: number, lat: number, time: number, grid: ThermalGrid,
): { cape: number; blh: number; wstar?: number; ccl?: number } | null {
  if (lon < grid.lonMin || lon > grid.lonMax || lat < grid.latMin || lat > grid.latMax) return null;

  const epochs = getGridEpochs(grid.times);
  if (time <= epochs[0]) return interpolateSpatial(lon, lat, grid.data[0], grid);
  if (time >= epochs[epochs.length - 1]) return interpolateSpatial(lon, lat, grid.data[epochs.length - 1], grid);

  let t0 = 0;
  for (let i = 0; i < epochs.length - 1; i++) {
    if (time >= epochs[i] && time < epochs[i + 1]) { t0 = i; break; }
  }
  const t1 = t0 + 1;
  const dt = (time - epochs[t0]) / (epochs[t1] - epochs[t0]);
  const v0 = interpolateSpatial(lon, lat, grid.data[t0], grid);
  const v1 = interpolateSpatial(lon, lat, grid.data[t1], grid);
  if (!v0 || !v1) return null;

  const hasWstar = v0.wstar !== undefined && v1.wstar !== undefined;
  return {
    cape:  v0.cape  * (1 - dt) + v1.cape  * dt,
    blh:   v0.blh   * (1 - dt) + v1.blh   * dt,
    wstar: hasWstar ? v0.wstar! * (1 - dt) + v1.wstar! * dt : undefined,
    ccl:   hasWstar ? v0.ccl!   * (1 - dt) + v1.ccl!   * dt : undefined,
  };
}

// Derive effective W* from CAPE when real W* not available (old cached grids).
// Rough empirical: cape=100 → ~1.0 m/s, cape=400 → ~2.0 m/s
export function effectiveWstar(wstar: number | undefined, cape: number): number {
  if (wstar !== undefined) return wstar;
  return Math.min(4, Math.sqrt(Math.max(0, cape) / 100));
}

export interface ThermalStrength {
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
}

// W*-based strength classification (m/s)
export function getThermalStrength(wstar: number): ThermalStrength {
  if (wstar < 0.3)  return { label: 'No thermals',      shortLabel: 'None',    color: '#a0aec0', bgColor: 'bg-slate-500' };
  if (wstar < 0.8)  return { label: 'Weak thermals',    shortLabel: 'Weak',    color: '#d4a843', bgColor: 'bg-amber-500' };
  if (wstar < 1.5)  return { label: 'Moderate thermals',shortLabel: 'Moderate',color: '#dc821e', bgColor: 'bg-amber-600' };
  if (wstar < 2.5)  return { label: 'Good thermals',    shortLabel: 'Good',    color: '#d45a14', bgColor: 'bg-orange-600' };
  if (wstar < 3.5)  return { label: 'Strong / XC',      shortLabel: 'Strong',  color: '#c03210', bgColor: 'bg-orange-700' };
  return                   { label: 'Extreme / caution', shortLabel: 'Extreme', color: '#b41414', bgColor: 'bg-red-700' };
}
