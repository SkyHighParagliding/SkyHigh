import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface WindObservation {
  lat: number;
  lon: number;
  speedKts: number;
  dirDeg: number;
  u: number;
  v: number;
}

export interface WindFieldSettings {
  particleCount: number;
  trailLength: number;
  maxInfluenceKm: number;
  fadeStartKm: number;
  idwPower: number;
  speedScale: number;
  lineWidth: number;
  opacity: number;
  maxParticleSpeed: number;
  particleMaxAge: number;
}

export const WIND_FIELD_DEFAULTS: WindFieldSettings = {
  particleCount: 1200,
  trailLength: 12,
  maxInfluenceKm: 120,
  fadeStartKm: 80,
  idwPower: 2,
  speedScale: 0.4,
  lineWidth: 1.5,
  opacity: 0.7,
  maxParticleSpeed: 4,
  particleMaxAge: 180,
};

interface WindFieldLayerProps {
  observations: WindObservation[];
  visible: boolean;
  settings?: Partial<WindFieldSettings>;
}

const CARDINAL_TO_DEGREES: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

export function parseWindDirection(dir: string | number | null): number | null {
  if (dir === null || dir === undefined) return null;
  if (typeof dir === 'number') return dir;
  const upper = String(dir).toUpperCase().trim();
  if (upper === 'CALM' || upper === '') return null;
  const deg = CARDINAL_TO_DEGREES[upper];
  if (deg !== undefined) return deg;
  const n = parseFloat(upper);
  return isNaN(n) ? null : n;
}

const SPEED_COLOR_STOPS: { kts: number; color: [number, number, number] }[] = [
  { kts: 0, color: [58, 40, 130] },
  { kts: 3, color: [48, 80, 180] },
  { kts: 6, color: [30, 140, 200] },
  { kts: 9, color: [40, 180, 100] },
  { kts: 12, color: [120, 200, 50] },
  { kts: 14, color: [220, 200, 30] },
  { kts: 16, color: [230, 140, 20] },
  { kts: 18, color: [210, 60, 30] },
  { kts: 20, color: [180, 30, 60] },
  { kts: 30, color: [140, 20, 80] },
];

function speedToColor(kts: number): [number, number, number] {
  if (kts <= SPEED_COLOR_STOPS[0].kts) return SPEED_COLOR_STOPS[0].color;
  for (let i = 0; i < SPEED_COLOR_STOPS.length - 1; i++) {
    if (kts >= SPEED_COLOR_STOPS[i].kts && kts <= SPEED_COLOR_STOPS[i + 1].kts) {
      const t = (kts - SPEED_COLOR_STOPS[i].kts) / (SPEED_COLOR_STOPS[i + 1].kts - SPEED_COLOR_STOPS[i].kts);
      const c1 = SPEED_COLOR_STOPS[i].color;
      const c2 = SPEED_COLOR_STOPS[i + 1].color;
      return [
        Math.round(c1[0] + (c2[0] - c1[0]) * t),
        Math.round(c1[1] + (c2[1] - c1[1]) * t),
        Math.round(c1[2] + (c2[2] - c1[2]) * t),
      ];
    }
  }
  return SPEED_COLOR_STOPS[SPEED_COLOR_STOPS.length - 1].color;
}


function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function idwInterpolate(lat: number, lon: number, obs: WindObservation[], maxInfluenceKm: number, fadeStartKm: number, idwPower: number): { u: number; v: number; speed: number; confidence: number } | null {
  if (obs.length === 0) return null;

  let minDist = Infinity;
  const weights: number[] = [];
  const distances: number[] = [];

  for (let i = 0; i < obs.length; i++) {
    const d = haversineKm(lat, lon, obs[i].lat, obs[i].lon);
    distances.push(d);
    if (d < minDist) minDist = d;
    if (d < 0.1) {
      return { u: obs[i].u, v: obs[i].v, speed: obs[i].speedKts, confidence: 1 };
    }
  }

  if (minDist > maxInfluenceKm) return null;

  let totalWeight = 0;
  for (let i = 0; i < obs.length; i++) {
    if (distances[i] > maxInfluenceKm) {
      weights.push(0);
    } else {
      const w = 1 / Math.pow(distances[i], idwPower);
      weights.push(w);
      totalWeight += w;
    }
  }

  if (totalWeight === 0) return null;

  let uSum = 0, vSum = 0;
  for (let i = 0; i < obs.length; i++) {
    const w = weights[i] / totalWeight;
    uSum += obs[i].u * w;
    vSum += obs[i].v * w;
  }

  const speed = Math.sqrt(uSum * uSum + vSum * vSum);

  let confidence = 1;
  if (minDist > fadeStartKm) {
    confidence = 1 - (minDist - fadeStartKm) / (maxInfluenceKm - fadeStartKm);
  }

  return { u: uSum, v: vSum, speed, confidence: Math.max(0, Math.min(1, confidence)) };
}

interface Particle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  trail: [number, number][];
}

export function WindFieldLayer({ observations, visible, settings: settingsOverride }: WindFieldLayerProps) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const obsRef = useRef<WindObservation[]>(observations);
  obsRef.current = observations;
  const settingsRef = useRef<WindFieldSettings>({ ...WIND_FIELD_DEFAULTS, ...settingsOverride });
  settingsRef.current = { ...WIND_FIELD_DEFAULTS, ...settingsOverride };

  useEffect(() => {
    if (!visible || !map) {
      if (canvasRef.current) {
        canvasRef.current.style.display = 'none';
      }
      if (animFrameRef.current) {
        clearTimeout(animFrameRef.current);
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
      return;
    }

    const container = map.getContainer();
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '450';
      container.querySelector('.leaflet-map-pane')?.parentElement?.appendChild(canvas);
      canvasRef.current = canvas;
    }
    canvas.style.display = 'block';

    const cfg = settingsRef.current;
    const PARTICLE_COUNT = cfg.particleCount;

    function spawnParticle(): Particle {
      const c = settingsRef.current;
      const w = canvas!.width / dpr;
      const h = canvas!.height / dpr;
      const baseAge = Math.floor(c.particleMaxAge * 0.67);
      const ageRange = Math.floor(c.particleMaxAge * 0.67);
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        age: Math.floor(Math.random() * c.particleMaxAge),
        maxAge: baseAge + Math.floor(Math.random() * ageRange),
        trail: [],
      };
    }

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      || (window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth < 1024);
    const dpr = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const mobileParticleLimit = 200;

    function resize() {
      const rect = container.getBoundingClientRect();
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      canvas!.style.width = rect.width + 'px';
      canvas!.style.height = rect.height + 'px';
    }
    resize();

    const effectiveCount = isMobile ? Math.min(PARTICLE_COUNT, mobileParticleLimit) : PARTICLE_COUNT;
    if (particlesRef.current.length !== effectiveCount) {
      particlesRef.current = Array.from({ length: effectiveCount }, () => spawnParticle());
    }
    const particles = particlesRef.current;

    const ctx = canvas.getContext('2d')!;

    let lastBounds = map.getBounds();
    let lastZoom = map.getZoom();
    let isPanning = false;

    function resetParticles() {
      const w = canvas!.width / dpr;
      const h = canvas!.height / dpr;
      for (const p of particles) {
        p.x = Math.random() * w;
        p.y = Math.random() * h;
        p.age = Math.floor(Math.random() * p.maxAge);
        p.trail = [];
      }
    }

    function onMoveStart() {
      isPanning = true;
      canvas!.style.display = 'none';
      cancelAnim();
    }

    function onMoveEnd() {
      isPanning = false;
      canvas!.style.display = 'block';
      const newBounds = map.getBounds();
      const newZoom = map.getZoom();
      if (newZoom !== lastZoom || !newBounds.equals(lastBounds)) {
        lastBounds = newBounds;
        lastZoom = newZoom;
        resetParticles();
      }
      if (!animFrameRef.current) {
        scheduleNext();
      }
    }

    function onResize() {
      resize();
      resetParticles();
    }

    map.on('movestart', onMoveStart);
    map.on('moveend', onMoveEnd);
    map.on('resize', onResize);

    const targetFPS = isMobile ? 12 : 30;
    const frameInterval = 1000 / targetFPS;
    let lastFrameTime = 0;

    const activeParticles = particlesRef.current;

    function scheduleNext() {
      if (isMobile) {
        animFrameRef.current = window.setTimeout(() => render(performance.now()), frameInterval) as unknown as number;
      } else {
        animFrameRef.current = requestAnimationFrame(render);
      }
    }

    function render(now: number) {
      if (isPanning) return;
      if (!isMobile && now - lastFrameTime < frameInterval) {
        animFrameRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameTime = now;

      const obs = obsRef.current;
      const c = settingsRef.current;
      const w = canvas!.width / dpr;
      const h = canvas!.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (obs.length === 0) {
        scheduleNext();
        return;
      }

      const zoom = map.getZoom();
      const zoomSpeedScale = Math.max(0.5, Math.min(2.5, zoom / 10));

      for (const p of activeParticles) {
        p.age++;
        if (p.age > p.maxAge || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
          p.x = Math.random() * w;
          p.y = Math.random() * h;
          p.age = 0;
          p.trail = [];
        }

        const containerPoint = L.point(p.x, p.y);
        const latlng = map.containerPointToLatLng(containerPoint);

        const wind = idwInterpolate(latlng.lat, latlng.lng, obs, c.maxInfluenceKm, c.fadeStartKm, c.idwPower);
        if (!wind || wind.confidence < 0.05) {
          p.trail = [];
          continue;
        }

        const moveSpeed = Math.min(wind.speed * c.speedScale * zoomSpeedScale, c.maxParticleSpeed);
        const dirRad = Math.atan2(wind.v, wind.u);
        const dx = Math.cos(dirRad) * moveSpeed;
        const dy = -Math.sin(dirRad) * moveSpeed;

        p.trail.push([p.x, p.y]);
        if (p.trail.length > c.trailLength) p.trail.shift();

        p.x += dx;
        p.y += dy;

        if (p.trail.length < 2) continue;

        const lifeRatio = p.age / p.maxAge;
        const fadeIn = Math.min(1, p.age / 10);
        const fadeOut = lifeRatio > 0.7 ? 1 - (lifeRatio - 0.7) / 0.3 : 1;
        const alpha = fadeIn * fadeOut * wind.confidence * c.opacity;

        if (alpha < 0.02) continue;

        const color = speedToColor(wind.speed);

        ctx.beginPath();
        ctx.moveTo(p.trail[0][0], p.trail[0][1]);
        for (let i = 1; i < p.trail.length; i++) {
          ctx.lineTo(p.trail[i][0], p.trail[i][1]);
        }
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
        ctx.lineWidth = c.lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      scheduleNext();
    }

    scheduleNext();

    function cancelAnim() {
      if (animFrameRef.current) {
        if (isMobile) {
          clearTimeout(animFrameRef.current);
        } else {
          cancelAnimationFrame(animFrameRef.current);
        }
        animFrameRef.current = 0;
      }
    }

    return () => {
      cancelAnim();
      map.off('movestart', onMoveStart);
      map.off('moveend', onMoveEnd);
      map.off('resize', onResize);
    };
  }, [visible, map]);

  useEffect(() => {
    if (visible && particlesRef.current.length > 0) {
      for (const p of particlesRef.current) {
        p.trail = [];
      }
    }
  }, [observations, visible]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        clearTimeout(animFrameRef.current);
        cancelAnimationFrame(animFrameRef.current);
      }
      if (canvasRef.current) {
        canvasRef.current.remove();
        canvasRef.current = null;
      }
    };
  }, []);

  return null;
}

export function buildWindObservations(
  sites: { id: string; lat: number; lon: number; useLiveWeather?: string }[],
  windDataMap: Record<string, { windSpeed: number | null; windGust: number | null; direction: string | number | null; stale?: boolean }>
): WindObservation[] {
  const obs: WindObservation[] = [];
  for (const site of sites) {
    if (site.useLiveWeather !== 'true') continue;
    const wd = windDataMap[site.id];
    if (!wd || wd.stale || wd.windSpeed === null) continue;
    const dirDeg = parseWindDirection(wd.direction);
    if (dirDeg === null) continue;
    const speedKts = wd.windSpeed;
    const speedMs = speedKts * 0.514444;
    const windRad = (270 - dirDeg) * Math.PI / 180;
    const u = speedMs * Math.cos(windRad) * 1.94384;
    const v = speedMs * Math.sin(windRad) * 1.94384;
    obs.push({ lat: site.lat, lon: site.lon, speedKts, dirDeg, u, v });
  }
  return obs;
}
