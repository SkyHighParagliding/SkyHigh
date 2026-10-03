// Shared RainViewer radar tile config + colour palette, used by three places that
// must agree: the map draw (MapCanvas), the Key scale (SitesWindMap), and the
// point sampler below. RainViewer only serves colour per pixel (no raw value), so
// the tapped-point intensity is read back from the rendered tile and mapped
// through the same palette the legend shows.

// Scheme 1 = "Original", snow folded into the rain ramp (snow=1 tints blue).
export const RADAR_COLOR_SCHEME = 1;
export const RADAR_OPTIONS = '1_0';
// RainViewer radar data stops at zoom 7 (z8+ returns a "Zoom Level Not Supported"
// placeholder); sampling and overzoom both anchor to this.
export const RADAR_MAX_Z = 7;

export function radarTileUrl(host: string, path: string, z: number, x: number, y: number): string {
  return `${host}${path}/256/${z}/${x}/${y}/${RADAR_COLOR_SCHEME}/${RADAR_OPTIONS}.png`;
}

// Palette stops (light → heavy). The CSS gradient (legend) and the LUT (sampling)
// are both built from these so a sampled colour lands on the matching legend spot.
const RADAR_STOPS: [number, string][] = [
  [0, '#6ba3e5'], [1 / 6, '#3b6fd4'], [2 / 6, '#35c15a'],
  [3 / 6, '#e6df3b'], [4 / 6, '#f09a2c'], [5 / 6, '#e23b2b'], [1, '#a01f8f'],
];
export const RADAR_LEGEND_CSS = `linear-gradient(to right, ${RADAR_STOPS.map(([p, c]) => `${c} ${Math.round(p * 100)}%`).join(', ')})`;

// Palette position (0..1) → approximate rain rate. Marshall-Palmer-shaped log ramp
// tuned so the standard bands line up: light <2.5, moderate 2.5–10, heavy 10–50,
// violent >50 mm/hr. Approximate — RainViewer gives colour buckets, not raw dBZ.
export function positionToMmhr(pos: number): number {
  return 0.1 * Math.pow(10, 3 * Math.min(1, Math.max(0, pos)));
}

export function formatMmhr(mmhr: number): string {
  return mmhr < 10 ? mmhr.toFixed(1) : String(Math.round(mmhr));
}

// 256-entry RGB lookup rendered from the gradient, built once.
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

// Nearest palette position (0..1) for an RGB colour, by squared distance in the LUT.
function colourToPosition(r: number, g: number, b: number): number {
  const t = getLut();
  if (!t) return 0;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < 256; i++) {
    const dr = r - t[i * 4], dg = g - t[i * 4 + 1], db = b - t[i * 4 + 2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best / 255;
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
 * Read the rain intensity at a lat/lon from the given radar frame. Returns null
 * when there's no rain (transparent pixel) or the tile can't be read. `pos` is the
 * 0..1 position on the legend; `mmhr` the approximate rate.
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
  if (d[3] < 20) return null; // transparent → no rain
  const pos = colourToPosition(d[0], d[1], d[2]);
  return { pos, mmhr: positionToMmhr(pos) };
}
