import L from 'leaflet';

export interface WindData {
  windSpeed: number | null;
  windGust: number | null;
  direction: string | number | null;
  stale?: boolean;
}

export interface XCSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type?: string;
  windDir?: string;
  launchHeight?: string;
  useLiveWeather?: string;
}

export interface BreadcrumbData {
  timestamp: number;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
}

export type MapOrientation = 'north-up' | 'track-up';

export interface LivePilotData {
  pilotId: string;
  firstName: string;
  lat: number;
  lon: number;
  altitude: number;
  speed: number;
  heading: number;
  verticalSpeed?: number;
  landed?: boolean;
}

export interface WindObservation {
  lat: number;
  lon: number;
  speedKts: number;
  dirDeg: number;
  u: number;
  v: number;
}

export const CARDINAL_TO_DEGREES: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
  CALM: -1,
};

export function parseDirection(dir: string | number | null): number | null {
  if (dir === null || dir === undefined) return null;
  if (typeof dir === 'number') return dir;
  const upper = String(dir).toUpperCase().trim();
  if (upper === 'CALM') return null;
  const deg = CARDINAL_TO_DEGREES[upper];
  return deg !== undefined ? deg : null;
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function destinationPoint(lat: number, lon: number, bearing: number, distance: number): [number, number] {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(lat);
  const lon1 = toRad(lon);
  const brng = toRad(bearing);
  const d = distance / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
  const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [toDeg(lat2), toDeg(lon2)];
}

const DEFAULT_RING_DISTANCES = [10, 20, 50, 100];

export function buildRings(distances: number[]) {
  const sorted = [...distances].sort((a, b) => a - b);
  const max = sorted.length;
  return sorted.map((km, i) => {
    const opacity = 0.5 - (i / max) * 0.3;
    const dashSize = km <= 25 ? '8 4' : km <= 75 ? '12 6' : '16 8';
    return {
      radius: km * 1000,
      label: `${km} km`,
      color: `rgba(0, 122, 255, ${opacity.toFixed(2)})`,
      dash: dashSize,
    };
  });
}

export function parseDistanceRings(setting: string | undefined): number[] {
  if (!setting) return DEFAULT_RING_DISTANCES;
  try {
    const parsed = JSON.parse(setting);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((n: unknown) => typeof n === 'number' && (n as number) > 0 && (n as number) <= 500).slice(0, 20);
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_RING_DISTANCES;
}

export const BEARINGS = [
  { angle: 0, label: 'N (360°)' },
  { angle: 45, label: 'NE (045°)' },
  { angle: 90, label: 'E (090°)' },
  { angle: 135, label: 'SE (135°)' },
  { angle: 180, label: 'S (180°)' },
  { angle: 225, label: 'SW (225°)' },
  { angle: 270, label: 'W (270°)' },
  { angle: 315, label: 'NW (315°)' },
];

export const AIRSPACE_COLORS: Record<string, { fill: string; stroke: string }> = {
  CTR: { fill: '#0050c8', stroke: '#0050c8' },
  CTA: { fill: '#0050c8', stroke: '#0050c8' },
  TMA: { fill: '#0050c8', stroke: '#0050c8' },
  TIA: { fill: '#6450c8', stroke: '#6450c8' },
  RESTRICTED: { fill: '#dc3232', stroke: '#dc3232' },
  DANGER: { fill: '#dc7800', stroke: '#dc7800' },
  PROHIBITED: { fill: '#c80000', stroke: '#c80000' },
  TMZ: { fill: '#00a050', stroke: '#00a050' },
  RMZ: { fill: '#00a050', stroke: '#00a050' },
  MBZ: { fill: '#00a050', stroke: '#00a050' },
  GLIDING_SECTOR: { fill: '#64b4ff', stroke: '#64b4ff' },
  WAVE_WINDOW: { fill: '#64b4ff', stroke: '#64b4ff' },
  OTHER: { fill: '#808080', stroke: '#808080' },
  ALERT: { fill: '#ffa500', stroke: '#ffa500' },
  WARNING: { fill: '#ffa500', stroke: '#ffa500' },
};

export function getAirspaceColor(typeName: string) {
  return AIRSPACE_COLORS[typeName] || AIRSPACE_COLORS.OTHER;
}

export const BASEMAPS = [
  {
    id: 'streets',
    label: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    preview: 'https://tile.openstreetmap.org/5/29/19.png',
  },
  {
    id: 'topo',
    label: 'Topo',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    preview: 'https://tile.opentopomap.org/5/29/19.png',
  },
  {
    id: 'satellite',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    preview: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/5/19/29',
  },
];

export function createWindArrowIcon(windData: WindData | null | undefined, isSelected?: boolean): L.DivIcon {
  const dirDeg = windData ? parseDirection(windData.direction) : null;

  if (!windData || dirDeg === null || windData.windSpeed === null) {
    const dotSize = isSelected ? 14 : 10;
    const borderColor = isSelected ? 'rgba(0,122,255,0.9)' : 'rgba(128,128,128,0.8)';
    const bgDot = isSelected ? 'rgba(0,122,255,0.4)' : 'rgba(128,128,128,0.5)';
    return L.divIcon({
      className: 'wind-arrow-icon',
      html: `<div style="
        width: ${dotSize}px; height: ${dotSize}px; border-radius: 50%;
        background: ${bgDot}; border: 2px solid ${borderColor};
      "></div>`,
      iconSize: [dotSize, dotSize],
      iconAnchor: [dotSize / 2, dotSize / 2],
      popupAnchor: [0, -8],
    });
  }

  const { windSpeed, windGust, stale } = windData;
  const rotation = dirDeg;
  const speed = Math.round(windSpeed);
  const gust = windGust !== null ? Math.round(windGust) : null;
  const label = (gust !== null && gust > speed) ? `${speed} G ${gust}` : `${speed}`;
  const opacity = stale ? 0.4 : 1;
  const arrowColor = stale ? '#999' : (isSelected ? '#007AFF' : '#1d1d1f');
  const textColor = stale ? '#999' : '#fff';
  const bgColor = stale ? 'rgba(160,160,160,0.7)' : (isSelected ? 'rgba(0,122,255,0.9)' : 'rgba(30,30,30,0.85)');
  const strokeColor = stale ? 'none' : 'rgba(255,255,255,0.9)';

  const shaftLen = 48;
  const headH = 12;
  const svgSize = 210;
  const cx = svgSize / 2;
  const cy = svgSize / 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}" style="opacity:${opacity};filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))">
    <g transform="rotate(${rotation}, ${cx}, ${cy})">
      <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - shaftLen}" stroke="${strokeColor}" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - shaftLen}" stroke="${arrowColor}" stroke-width="2.5" stroke-linecap="round"/>
      <polygon points="${cx},${cy + 3} ${cx - 6},${cy - headH + 3} ${cx + 6},${cy - headH + 3}" fill="${strokeColor}" stroke="none"/>
      <polygon points="${cx},${cy + 1} ${cx - 5},${cy - headH + 1} ${cx + 5},${cy - headH + 1}" fill="${arrowColor}"/>
      <g transform="rotate(${dirDeg > 180 ? 90 : 270}, ${cx}, ${cy - shaftLen})">
        <rect x="${dirDeg > 180 ? cx - 52 : cx}" y="${cy - shaftLen - 10}" width="52" height="18" rx="4" fill="${bgColor}" stroke="${strokeColor}" stroke-width="1"/>
        <text x="${dirDeg > 180 ? cx - 26 : cx + 26}" y="${cy - shaftLen + 3}" text-anchor="middle" font-size="11" font-weight="700" fill="${textColor}" font-family="-apple-system,system-ui,sans-serif">${label}</text>
      </g>
    </g>
  </svg>`;

  return L.divIcon({
    className: 'wind-arrow-icon',
    html: svg,
    iconSize: [svgSize, svgSize],
    iconAnchor: [cx, cy],
    popupAnchor: [0, -10],
  });
}

export interface XCMapProps {
  site: XCSite;
  showAirspace: boolean;
  altitudeFt: number;
  disabledTypes?: Set<string>;
  windData?: WindData | null;
  allSites?: XCSite[];
  windDataMap?: Record<string, WindData>;
  breadcrumbs?: BreadcrumbData[];
  fullTrailBreadcrumbs?: BreadcrumbData[];
  trailColor?: string;
  trailWidth?: number;
  splineTension?: number;
  isRecording?: boolean;
  followPilot?: boolean;
  mapOrientation?: MapOrientation;
  pilotPosition?: { lat: number; lon: number; altitude?: number; speed?: number; heading?: number } | null;
  verticalSpeed?: number;
  proximityThresholdFt?: number;
  onProximityEnter?: () => void;
  onProximityExit?: () => void;
  dismissedSectorIds?: Set<string>;
  onActiveProximityIds?: (ids: Set<string>) => void;
  pilotColor?: string;
  livePilots?: LivePilotData[];
  driverLocation?: { lat: number; lon: number; name: string } | null;
  isDemo?: boolean;
  showWindField?: boolean;
  windObservations?: WindObservation[];
  windFieldSettings?: Partial<import('../components/WindFieldLayer').WindFieldSettings>;
  enableMessaging?: boolean;
  currentPilotId?: string | null;
  userLocation?: { lat: number; lon: number } | null;
  isFullscreen?: boolean;
  activeBasemap?: string;
  onMapReady?: (map: L.Map) => void;
  showZones?: boolean;
  zoneData?: GeoJSON.FeatureCollection | null;
  disabledZoneTypes?: Set<string>;
}
