/**
 * A single interpolated thermal cell value, as the renderer receives it.
 *
 * All optional fields degrade gracefully: the renderer checks for presence
 * before use and falls back to pre-TASK-036 behaviour when they are absent.
 * Cloud fields (`cloud`, `cloudLow`) are absent on grids cached before
 * TASK-036 — when they are undefined the grey overcast overlay is skipped and
 * the full cumulus lattice is drawn, exactly matching today's behaviour.
 *
 * Naming note: `ccl` is the condensation level (m AGL, derived from T − Td).
 * The cloud-cover fields are deliberately called `cloud` / `cloudLow` to avoid
 * collision with the existing `ccl` abbreviation.
 */
export interface ThermalCellValue {
  cape: number;
  blh: number;
  wstar?: number;
  ccl?: number;
  li?: number;
  cin?: number;
  /** Total cloud cover, %. Undefined on grids cached before TASK-036. */
  cloud?: number;
  /** Low cloud cover (below ~2 km), %. Undefined on grids cached before TASK-036. */
  cloudLow?: number;
  /** Precipitation, mm/hr. Undefined on grids cached before it was added. */
  precip?: number;
}

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
  data: (ThermalCellValue | null)[][];
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
  timeData: ThermalCellValue[],
  grid: ThermalGrid,
): ThermalCellValue | null {
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

  // Relaxed bilinear: when a corner is null (outside column tile coverage), substitute
  // the nearest non-null corner rather than discarding the whole cell. This eliminates
  // hard seams at column tile boundaries without pulling values toward zero.
  const any = v00 ?? v10 ?? v01 ?? v11;
  if (!any) return null;
  const c00 = v00 ?? v10 ?? v01 ?? v11!;
  const c10 = v10 ?? v00 ?? v11 ?? v01!;
  const c01 = v01 ?? v00 ?? v11 ?? v10!;
  const c11 = v11 ?? v10 ?? v01 ?? v00!;

  const lerp = (a: number, b: number, c: number, d: number) => {
    const r0 = a * (1 - dx) + b * dx;
    const r1 = c * (1 - dx) + d * dx;
    return r0 * (1 - dy) + r1 * dy;
  };

  // Gated separately: CCL comes from temperature and dew point, W* does not.
  // Tying them together hid cloud base on every grid, because W* is not yet
  // computed anywhere and is always undefined.
  // li, cin, cloud, and cloudLow follow the same pattern: only interpolate when
  // all four corners have a value, otherwise leave undefined so the renderer
  // degrades gracefully. Cloud fields are absent on pre-TASK-036 grids, so
  // every corner of every cell will be undefined until the next 5:26 am fetch —
  // hasCloud* will be false, and the grey overlay will simply not appear, which
  // is exactly today's behaviour.
  const hasWstar   = c00.wstar    !== undefined;
  const hasCcl     = c00.ccl      !== undefined && c10.ccl      !== undefined
    && c01.ccl      !== undefined && c11.ccl      !== undefined;
  const hasLi      = c00.li       !== undefined && c10.li       !== undefined
    && c01.li       !== undefined && c11.li       !== undefined;
  const hasCin     = c00.cin      !== undefined && c10.cin      !== undefined
    && c01.cin      !== undefined && c11.cin      !== undefined;
  const hasCloud   = c00.cloud    !== undefined && c10.cloud    !== undefined
    && c01.cloud    !== undefined && c11.cloud    !== undefined;
  const hasCloudLow = c00.cloudLow !== undefined && c10.cloudLow !== undefined
    && c01.cloudLow !== undefined && c11.cloudLow !== undefined;
  const hasPrecip  = c00.precip   !== undefined && c10.precip   !== undefined
    && c01.precip   !== undefined && c11.precip   !== undefined;
  return {
    cape:     lerp(c00.cape,  c10.cape,  c01.cape,  c11.cape),
    blh:      lerp(c00.blh,   c10.blh,   c01.blh,   c11.blh),
    wstar:    hasWstar    ? lerp(c00.wstar!,    c10.wstar!,    c01.wstar!,    c11.wstar!)    : undefined,
    ccl:      hasCcl      ? lerp(c00.ccl!,      c10.ccl!,      c01.ccl!,      c11.ccl!)      : undefined,
    li:       hasLi       ? lerp(c00.li!,       c10.li!,       c01.li!,       c11.li!)       : undefined,
    cin:      hasCin      ? lerp(c00.cin!,      c10.cin!,      c01.cin!,      c11.cin!)      : undefined,
    cloud:    hasCloud    ? lerp(c00.cloud!,    c10.cloud!,    c01.cloud!,    c11.cloud!)    : undefined,
    cloudLow: hasCloudLow ? lerp(c00.cloudLow!, c10.cloudLow!, c01.cloudLow!, c11.cloudLow!) : undefined,
    precip:   hasPrecip   ? lerp(c00.precip!,   c10.precip!,   c01.precip!,   c11.precip!)   : undefined,
  };
}

export function getThermalAt(
  lon: number, lat: number, time: number, grid: ThermalGrid,
): ThermalCellValue | null {
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

  // Both time steps must have a field for the temporal lerp to be valid —
  // absence at either step means "data not available" for this instant, not
  // "lerp toward zero". Cloud fields are absent on pre-TASK-036 grids, so
  // both will be undefined and the renderer degrades to today's behaviour.
  const hasWstar    = v0.wstar    !== undefined && v1.wstar    !== undefined;
  const hasCcl      = v0.ccl      !== undefined && v1.ccl      !== undefined;
  const hasLi       = v0.li       !== undefined && v1.li       !== undefined;
  const hasCin      = v0.cin      !== undefined && v1.cin      !== undefined;
  const hasCloud    = v0.cloud    !== undefined && v1.cloud    !== undefined;
  const hasCloudLow = v0.cloudLow !== undefined && v1.cloudLow !== undefined;
  const hasPrecip   = v0.precip   !== undefined && v1.precip   !== undefined;
  return {
    cape:     v0.cape  * (1 - dt) + v1.cape  * dt,
    blh:      v0.blh   * (1 - dt) + v1.blh   * dt,
    wstar:    hasWstar    ? v0.wstar!    * (1 - dt) + v1.wstar!    * dt : undefined,
    ccl:      hasCcl      ? v0.ccl!      * (1 - dt) + v1.ccl!      * dt : undefined,
    li:       hasLi       ? v0.li!       * (1 - dt) + v1.li!       * dt : undefined,
    cin:      hasCin      ? v0.cin!      * (1 - dt) + v1.cin!      * dt : undefined,
    cloud:    hasCloud    ? v0.cloud!    * (1 - dt) + v1.cloud!    * dt : undefined,
    cloudLow: hasCloudLow ? v0.cloudLow! * (1 - dt) + v1.cloudLow! * dt : undefined,
    precip:   hasPrecip   ? v0.precip!   * (1 - dt) + v1.precip!   * dt : undefined,
  };
}

// Fallback for cells with no real W*: grids cached before W* was computed, and
// points supplied by the GFS tiers, which carry neither radiation nor soil
// moisture. Treat this as degraded, not equivalent — CAPE measures deep-
// convection energy, so it reads 0 across plenty of perfectly soarable days.
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
