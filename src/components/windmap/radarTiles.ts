// Shared RainViewer radar tile config + our own rain palette, used by three places
// that must agree: the map draw (MapCanvas), the scale (SitesWindMap / help), and
// the point sampler below.
//
// RainViewer now serves only its "Universal Blue" colour scheme, whatever scheme
// the URL asks for (checked 2026-11-16: schemes 1/2/3/4/8 return identical tiles).
// Its weakest echoes are a translucent grey-beige that washes over the map. So we
// decode each pixel back to radar strength (dBZ) with RainViewer's published colour
// table, and redraw it in our own palette: one rain scale we control, independent
// of RainViewer's styling, and the legend and tap reading match what is drawn.

// Colour scheme in the URL is ignored by RainViewer (always Universal Blue), kept
// at 2 so the request says what we actually get.
export const RADAR_COLOR_SCHEME = 2;
// `{smooth}_{snow}`. Smoothing on: compared side by side on 16 Nov 2026, the
// smoothed tiles read as clean rain areas (close to Windy) while unsmoothed ones
// are speckly. Smoothed edge pixels are blends; they decode to the nearest table
// colour, which is fine at the edges.
export const RADAR_OPTIONS = '1_0';
// RainViewer radar data stops at zoom 7 (z8+ returns a "Zoom Level Not Supported"
// placeholder); sampling and overzoom both anchor to this.
export const RADAR_MAX_Z = 7;

export function radarTileUrl(host: string, path: string, z: number, x: number, y: number): string {
  return `${host}${path}/256/${z}/${x}/${y}/${RADAR_COLOR_SCHEME}/${RADAR_OPTIONS}.png`;
}

// RainViewer "Universal Blue" rain colours, dBZ -10..64 in steps of 1 (#RRGGBBAA),
// from https://www.rainviewer.com/files/rainviewer_api_colors_table.csv (2026-11-16).
// Below -10 is transparent; 65+ (white, green) are flags/clutter, treated as 64.
const UB_MIN_DBZ = -10;
const UB_RAIN = (
  '63615914 66635a19 69665c1e 6c685d24 6f6b5f29 726e612e 75706234 78736439 7c75653e 7f786744 ' + // -10..-1
  '827b6949 857d6a4e 88806c54 8b826d59 8e856f5e 92887164 9e93756e aa9e7978 b6a97e82 c2b4828c ' + //   0..9
  'cec08796 d2c48ba0 d6c88faa dacc93b4 ded097be 88ddeeff 6cd1ebff 51c5e8ff 36bae5ff 1baee2ff ' + //  10..19
  '00a3e0ff 009ad5ff 0091caff 0088bfff 007fb4ff 0077aaff 0070a3ff 00699cff 006295ff 005b8eff ' + //  20..29
  '005588ff 005180ff 004e78ff 004a70ff 004768ff ffee00ff ffe000ff ffd200ff ffc500ff ffb700ff ' + //  30..39
  'ffaa00ff ff9f00ff ff9500ff ff8b00ff ff8100ff ff4400ff f23600ff e62800ff d91b00ff cd0d00ff ' + //  40..49
  'c10000ff a80000ff 8f0000ff 760000ff 5d0000ff ffaaffff ff9fffff ff95ffff ff8bffff ff81ffff ' + //  50..59
  'ff77ffff ff6cffff ff62ffff ff58ffff ff4effff'                                                 //  60..64
).split(' ').map(h => [0, 2, 4, 6].map(i => parseInt(h.slice(i, i + 2), 16)));

/** Radar strength (dBZ) → rain rate (mm/hr), Marshall-Palmer Z = 200 R^1.6. */
export function dbzToMmhr(dbz: number): number {
  return Math.pow(Math.pow(10, dbz / 10) / 200, 1 / 1.6);
}

// Our palette: position 0..1 on a log scale from 0.1 to 100 mm/hr (0.1, 1, 10, 100
// sit at 0, 1/3, 2/3, 1). Light → heavy, deep enough to read on the light base map.
const RADAR_STOPS: [number, string][] = [
  [0, '#5b8def'], [1 / 6, '#2f5fd0'], [2 / 6, '#17a84a'],
  [3 / 6, '#f2d22e'], [4 / 6, '#f08a24'], [5 / 6, '#d7261e'], [1, '#9b1b8e'],
];
export const RADAR_LEGEND_CSS = `linear-gradient(to right, ${RADAR_STOPS.map(([p, c]) => `${c} ${Math.round(p * 100)}%`).join(', ')})`;
/** Tick labels for the scale: value + position (0..1). */
export const RADAR_TICKS: { label: string; pos: number }[] = [
  { label: '0.1', pos: 0 }, { label: '1', pos: 1 / 3 }, { label: '10', pos: 2 / 3 }, { label: '100 mm/hr', pos: 1 },
];

export function mmhrToPosition(mmhr: number): number {
  return Math.min(1, Math.max(0, Math.log10(Math.max(mmhr, 1e-6) / 0.1) / 3));
}
export function positionToMmhr(pos: number): number {
  return 0.1 * Math.pow(10, 3 * Math.min(1, Math.max(0, pos)));
}

export function formatMmhr(mmhr: number): string {
  return mmhr < 10 ? mmhr.toFixed(1) : String(Math.round(mmhr));
}

// Rain under 0.1 mm/hr (about 7 dBZ) is not drawn: mostly noise and clutter.
// 0.1–0.3 mm/hr (drizzle) fades in; 0.3 mm/hr and up is fully opaque.
const DRAW_MIN_MMHR = 0.1;
const FULL_ALPHA_MMHR = 0.3;
function alphaFor(mmhr: number): number {
  if (mmhr < DRAW_MIN_MMHR) return 0;
  if (mmhr >= FULL_ALPHA_MMHR) return 255;
  const f = Math.log(mmhr / DRAW_MIN_MMHR) / Math.log(FULL_ALPHA_MMHR / DRAW_MIN_MMHR);
  return Math.round(255 * (0.4 + 0.6 * f));
}

// 256-entry RGB lookup rendered from our gradient, built once.
let lut: Uint8ClampedArray | null = null;
function getLut(): Uint8ClampedArray | null {
  if (lut) return lut;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  for (const [p, col] of RADAR_STOPS) g.addColorStop(p, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 1);
  lut = ctx.getImageData(0, 0, 256, 1).data;
  return lut;
}

// RainViewer pixel → dBZ. Exact table colours hit the map; anything else (edge
// blends) goes to the nearest table colour by RGBA distance, cached.
const exact = new Map<number, number>();
UB_RAIN.forEach(([r, g, b, a], i) => exact.set(((r << 24) | (g << 16) | (b << 8) | a) >>> 0, UB_MIN_DBZ + i));
const nearestCache = new Map<number, number>();
export function decodeDbz(r: number, g: number, b: number, a: number): number | null {
  if (a < 8) return null;
  const key = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
  const hit = exact.get(key) ?? nearestCache.get(key);
  if (hit !== undefined) return hit;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < UB_RAIN.length; i++) {
    const c = UB_RAIN[i];
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2 + (a - c[3]) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  const dbz = UB_MIN_DBZ + best;
  if (nearestCache.size > 4096) nearestCache.clear();
  nearestCache.set(key, dbz);
  return dbz;
}

// Recoloured tiles, keyed like the raw tile cache. Each is a 256×256 canvas.
const recoloured = new Map<string, HTMLCanvasElement>();
const RECOLOURED_MAX = 400;

/**
 * Our-palette copy of a loaded RainViewer tile (cached by key), or null if it
 * can't be read yet. Synchronous: about 1–2 ms per tile, once per tile.
 */
export function recolourRadarTile(key: string, img: HTMLImageElement): HTMLCanvasElement | null {
  const hit = recoloured.get(key);
  if (hit) return hit;
  const t = getLut();
  if (!t || !img.complete || img.naturalWidth === 0) return null;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  let id: ImageData;
  try { id = ctx.getImageData(0, 0, c.width, c.height); } catch { return null; }
  const d = id.data;
  const byDbz = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < d.length; i += 4) {
    const dbz = decodeDbz(d[i], d[i + 1], d[i + 2], d[i + 3]);
    if (dbz == null) { d[i + 3] = 0; continue; }
    let out = byDbz.get(dbz);
    if (!out) {
      const mm = dbzToMmhr(dbz);
      const li = Math.round(mmhrToPosition(mm) * 255) * 4;
      out = [t[li], t[li + 1], t[li + 2], alphaFor(mm)];
      byDbz.set(dbz, out);
    }
    d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
  }
  ctx.putImageData(id, 0, 0);
  if (recoloured.size >= RECOLOURED_MAX) recoloured.delete(recoloured.keys().next().value!);
  recoloured.set(key, c);
  return c;
}

// Web-mercator tile + in-tile pixel for a lat/lon at zoom z.
function tilePixel(lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const xf = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.floor(xf), y = Math.floor(yf);
  return { x, y, px: Math.min(255, Math.floor((xf - x) * 256)), py: Math.min(255, Math.floor((yf - y) * 256)) };
}

const imgCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(url: string): Promise<HTMLImageElement | null> {
  const hit = imgCache.get(url);
  if (hit) return hit;
  const p = new Promise<HTMLImageElement | null>(res => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
  if (imgCache.size > 300) imgCache.delete(imgCache.keys().next().value!);
  imgCache.set(url, p);
  return p;
}

let scratch: HTMLCanvasElement | null = null;

export interface RadarSample { pos: number; mmhr: number }

/**
 * Rain rate at a lat/lon in the given radar frame, decoded from the raw tile pixel.
 * Null when there's no drawn rain there (under 0.1 mm/hr) or the tile can't be
 * read. `pos` is the 0..1 position on the scale; `mmhr` the approximate rate.
 */
export async function sampleRadarAt(lat: number, lon: number, host: string, path: string): Promise<RadarSample | null> {
  if (typeof document === 'undefined') return null;
  const { x, y, px, py } = tilePixel(lat, lon, RADAR_MAX_Z);
  const img = await loadImage(radarTileUrl(host, path, RADAR_MAX_Z, x, y));
  if (!img) return null;
  if (!scratch) { scratch = document.createElement('canvas'); scratch.width = 256; scratch.height = 256; }
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, 256, 256);
  ctx.drawImage(img, 0, 0);
  let d: Uint8ClampedArray;
  try { d = ctx.getImageData(px, py, 1, 1).data; } catch { return null; }
  const dbz = decodeDbz(d[0], d[1], d[2], d[3]);
  if (dbz == null) return null;
  const mmhr = dbzToMmhr(dbz);
  if (mmhr < DRAW_MIN_MMHR) return null;
  return { pos: mmhrToPosition(mmhr), mmhr };
}
