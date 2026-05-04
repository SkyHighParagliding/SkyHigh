export interface ZoomSetpoint {
  speed: number;
  lineWidth: number;
  trailLength: number;
  opacity: number;
  particleCount: number;
}

export interface ZoomSetpoints {
  z0: ZoomSetpoint;
  z5: ZoomSetpoint;
  z10: ZoomSetpoint;
}

export const DEFAULT_ZOOM_SETPOINTS: ZoomSetpoints = {
  z0:  { speed: 1.7,  lineWidth: 1.2, trailLength: 15, opacity: 0.4,  particleCount: 5200 },
  z5:  { speed: 1.7,  lineWidth: 1.5, trailLength: 20, opacity: 0.2,  particleCount: 3000 },
  z10: { speed: 1.55, lineWidth: 1.4, trailLength: 20, opacity: 0.4,  particleCount: 2400 },
};

export const INITIAL_K = 256 * Math.pow(2, 12);

export const getCompassDirection = (deg: number) => {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round(deg / 22.5) % 16;
  return points[index < 0 ? index + 16 : index];
};

export interface SiteMarker {
  id: string;
  name: string;
  lat: number;
  lon: number;
  status?: string;
  isSkyHighSite?: string;
  type?: string;
  windDir?: string;
}

const SPEED_COLOR_STOPS: { kts: number; color: [number,number,number] }[] = [
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

export const SPEED_LEGEND_CSS = (() => {
  const stops = SPEED_COLOR_STOPS.map(s => {
    const pct = Math.min(100, (s.kts / 20) * 100);
    return `rgb(${s.color[0]},${s.color[1]},${s.color[2]}) ${pct.toFixed(0)}%`;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
})();
