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
  data: { cape: number; blh: number }[][];
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
  timeData: { cape: number; blh: number }[],
  grid: ThermalGrid,
): { cape: number; blh: number } | null {
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

  const cape0 = v00.cape * (1 - dx) + v10.cape * dx;
  const cape1 = v01.cape * (1 - dx) + v11.cape * dx;
  const blh0  = v00.blh  * (1 - dx) + v10.blh  * dx;
  const blh1  = v01.blh  * (1 - dx) + v11.blh  * dx;

  return {
    cape: cape0 * (1 - dy) + cape1 * dy,
    blh:  blh0  * (1 - dy) + blh1  * dy,
  };
}

export function getThermalAt(
  lon: number, lat: number, time: number, grid: ThermalGrid,
): { cape: number; blh: number } | null {
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

  return {
    cape: v0.cape * (1 - dt) + v1.cape * dt,
    blh:  v0.blh  * (1 - dt) + v1.blh  * dt,
  };
}

export interface ThermalStrength {
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
}

export function getThermalStrength(cape: number): ThermalStrength {
  if (cape < 10)   return { label: 'No thermals',            shortLabel: 'None',       color: '#a0aec0', bgColor: 'bg-blue-700' };
  if (cape < 50)   return { label: 'Weak thermals',          shortLabel: 'Weak',       color: '#1e96c8', bgColor: 'bg-sky-500' };
  if (cape < 200)  return { label: 'Moderate thermals',      shortLabel: 'Moderate',   color: '#28aa50', bgColor: 'bg-green-600' };
  if (cape < 500)  return { label: 'Good thermals',          shortLabel: 'Good',       color: '#c8c820', bgColor: 'bg-yellow-500' };
  if (cape < 1000) return { label: 'Strong thermals',        shortLabel: 'Strong',     color: '#e07820', bgColor: 'bg-orange-500' };
  return                  { label: 'Very strong / storm risk', shortLabel: 'Storm risk', color: '#c82828', bgColor: 'bg-red-600' };
}
