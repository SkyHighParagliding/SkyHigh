export interface WindGrid {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  deltaLon: number;
  deltaLat: number;
  ni: number;
  nj: number;
  times: string[];
  data: { u: number; v: number }[][];
  wideGrid?: WindGrid;
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

function interpolateSpatial(lon: number, lat: number, timeData: { u: number; v: number }[], grid: WindGrid): [number, number] | null {
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

  const getUV = (ix: number, jy: number) => timeData[jy * grid.ni + ix];

  const v00 = getUV(i0, j0);
  const v10 = getUV(i1, j0);
  const v01 = getUV(i0, j1);
  const v11 = getUV(i1, j1);

  if (!v00 || !v10 || !v01 || !v11) return null;

  const u0 = v00.u * (1 - dx) + v10.u * dx;
  const u1 = v01.u * (1 - dx) + v11.u * dx;
  const u = u0 * (1 - dy) + u1 * dy;

  const vv0 = v00.v * (1 - dx) + v10.v * dx;
  const vv1 = v01.v * (1 - dx) + v11.v * dx;
  const v = vv0 * (1 - dy) + vv1 * dy;

  return [u, v];
}

function getWindAtSingleGrid(lon: number, lat: number, time: number, grid: WindGrid): [number, number] | null {
  if (lon < grid.lonMin || lon > grid.lonMax || lat < grid.latMin || lat > grid.latMax) {
    return null;
  }

  const epochs = getGridEpochs(grid.times);
  
  if (time <= epochs[0]) {
    return interpolateSpatial(lon, lat, grid.data[0], grid);
  }
  if (time >= epochs[epochs.length - 1]) {
    return interpolateSpatial(lon, lat, grid.data[epochs.length - 1], grid);
  }

  let t0 = 0;
  for (let i = 0; i < epochs.length - 1; i++) {
    if (time >= epochs[i] && time < epochs[i + 1]) {
      t0 = i;
      break;
    }
  }
  const t1 = t0 + 1;
  const dt = (time - epochs[t0]) / (epochs[t1] - epochs[t0]);

  const v0 = interpolateSpatial(lon, lat, grid.data[t0], grid);
  const v1 = interpolateSpatial(lon, lat, grid.data[t1], grid);

  if (!v0 || !v1) return null;

  const u = v0[0] * (1 - dt) + v1[0] * dt;
  const v = v0[1] * (1 - dt) + v1[1] * dt;

  return [u, v];
}

export function getWindAt(lon: number, lat: number, time: number, grid: WindGrid): [number, number] | null {
  if (!grid.wideGrid) {
    return getWindAtSingleGrid(lon, lat, time, grid);
  }

  const hires = getWindAtSingleGrid(lon, lat, time, grid);
  const lores = getWindAtSingleGrid(lon, lat, time, grid.wideGrid);

  if (!hires) return lores;
  if (!lores) return hires;

  const blendDeg = Math.max(grid.deltaLon, grid.deltaLat) * 8;
  const dLeft = lon - grid.lonMin;
  const dRight = grid.lonMax - lon;
  const dBottom = lat - grid.latMin;
  const dTop = grid.latMax - lat;
  const dEdge = Math.min(dLeft, dRight, dBottom, dTop);

  if (dEdge >= blendDeg) return hires;

  const t = Math.max(0, Math.min(1, dEdge / blendDeg));
  return [
    hires[0] * t + lores[0] * (1 - t),
    hires[1] * t + lores[1] * (1 - t),
  ];
}

function lerpColor(c1: [number,number,number], c2: [number,number,number], t: number): [number,number,number] {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

export const SPEED_COLOR_STOPS: { kts: number; color: [number,number,number] }[] = [
  { kts: 0,  color: [58, 40, 130] },
  { kts: 3,  color: [48, 80, 180] },
  { kts: 6,  color: [30, 140, 200] },
  { kts: 9,  color: [40, 180, 100] },
  { kts: 12, color: [120, 200, 50] },
  { kts: 14, color: [220, 200, 30] },
  { kts: 16, color: [230, 140, 20] },
  { kts: 18, color: [210, 60, 30] },
  { kts: 20, color: [180, 30, 60] },
  { kts: 30, color: [140, 20, 80] },
];

const SPEED_LUT_SIZE = 256;
const SPEED_LUT_MAX_KTS = 50;
export const speedLUT: Uint8Array = new Uint8Array(SPEED_LUT_SIZE * 3);
(() => {
  for (let i = 0; i < SPEED_LUT_SIZE; i++) {
    const kts = (i / (SPEED_LUT_SIZE - 1)) * SPEED_LUT_MAX_KTS;
    let c: [number,number,number] = SPEED_COLOR_STOPS[SPEED_COLOR_STOPS.length - 1].color;
    for (let s = 0; s < SPEED_COLOR_STOPS.length - 1; s++) {
      if (kts >= SPEED_COLOR_STOPS[s].kts && kts <= SPEED_COLOR_STOPS[s + 1].kts) {
        const t = (kts - SPEED_COLOR_STOPS[s].kts) / (SPEED_COLOR_STOPS[s + 1].kts - SPEED_COLOR_STOPS[s].kts);
        c = lerpColor(SPEED_COLOR_STOPS[s].color, SPEED_COLOR_STOPS[s + 1].color, t);
        break;
      }
    }
    speedLUT[i * 3] = c[0];
    speedLUT[i * 3 + 1] = c[1];
    speedLUT[i * 3 + 2] = c[2];
  }
})();

export function speedKnotsToLUTIndex(kts: number): number {
  return Math.min(SPEED_LUT_SIZE - 1, Math.max(0, Math.round((kts / SPEED_LUT_MAX_KTS) * (SPEED_LUT_SIZE - 1))));
}

export function interpolateSetpoint(setpoints: import('../windMapTypes').ZoomSetpoints, zoomDisplay: number): import('../windMapTypes').ZoomSetpoint {
  const z = Math.max(0, Math.min(10, zoomDisplay));
  let lo: import('../windMapTypes').ZoomSetpoint, hi: import('../windMapTypes').ZoomSetpoint, t: number;
  if (z <= 5) {
    lo = setpoints.z0;
    hi = setpoints.z5;
    t = z / 5;
  } else {
    lo = setpoints.z5;
    hi = setpoints.z10;
    t = (z - 5) / 5;
  }
  return {
    speed: lo.speed + (hi.speed - lo.speed) * t,
    lineWidth: lo.lineWidth + (hi.lineWidth - lo.lineWidth) * t,
    trailLength: Math.round(lo.trailLength + (hi.trailLength - lo.trailLength) * t),
    opacity: lo.opacity + (hi.opacity - lo.opacity) * t,
    particleCount: Math.round(lo.particleCount + (hi.particleCount - lo.particleCount) * t),
  };
}

export function zoomKToDisplaySmooth(k: number): number {
  const level = Math.log2(k / 256);
  return Math.max(0, Math.min(10, (level - 6) * (10 / 7)));
}
