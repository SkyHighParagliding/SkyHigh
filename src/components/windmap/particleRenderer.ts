import type { ZoomSetpoints } from '../windMapTypes';
import { getWindAt, speedLUT, speedKnotsToLUTIndex, interpolateSetpoint, zoomKToDisplaySmooth } from './windInterpolation';
import type { WindGrid } from './windInterpolation';
import type { GeoProjection } from 'd3-geo';
import type { ZoomTransform } from 'd3-zoom';

export interface Particle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  speedMultiplier: number;
  thickness: number;
  trail: number[][];
}

export const POOL_PARTICLES = 2400;
export const POOL_TRAIL = 60;
const MARGIN = 80;

export function spawnRandom(width: number, height: number) {
  return {
    x: -MARGIN + Math.random() * (width + MARGIN * 2),
    y: -MARGIN + Math.random() * (height + MARGIN * 2),
  };
}

export function createParticlePool(width: number, height: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < POOL_PARTICLES; i++) {
    const maxAge = 500 * (0.6 + Math.random() * 0.8);
    const pos = spawnRandom(width, height);
    particles.push({
      x: pos.x, y: pos.y,
      age: Math.floor(Math.random() * maxAge),
      maxAge,
      speedMultiplier: 0.7 + Math.random() * 0.3,
      thickness: 0.6 + Math.random() * 0.6,
      trail: Array.from({ length: POOL_TRAIL }, () => [pos.x, pos.y]),
    });
  }
  return particles;
}

export function updateAndDrawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  width: number,
  height: number,
  currentTransform: ZoomTransform,
  projection: GeoProjection,
  currentTime: number,
  windGrid: WindGrid,
  zoomSetpoints: ZoomSetpoints,
) {
  const zoomDisplay = zoomKToDisplaySmooth(currentTransform.k);
  const sp = interpolateSetpoint(zoomSetpoints, zoomDisplay);
  const activeCount = Math.min(POOL_PARTICLES, sp.particleCount);
  const activeTLen = Math.min(POOL_TRAIL, sp.trailLength);

  for (let i = 0; i < POOL_PARTICLES; i++) {
    if (i >= activeCount) {
      const p = particles[i];
      if (p.age < p.maxAge) p.age = p.maxAge;
      continue;
    }
    const p = particles[i];
    p.age++;

    if (p.age > p.maxAge || p.x < -MARGIN * 2 || p.x > width + MARGIN * 2 || p.y < -MARGIN * 2 || p.y > height + MARGIN * 2) {
      const pos = spawnRandom(width, height);
      p.x = pos.x;
      p.y = pos.y;
      p.age = 0;
      for (let t = 0; t < POOL_TRAIL; t++) {
        p.trail[t][0] = p.x;
        p.trail[t][1] = p.y;
      }
    }

    const inverted = currentTransform.invert([p.x, p.y]);
    const geo = projection.invert!(inverted);
    if (!geo) {
      p.age--;
      continue;
    }
    const [lon, lat] = geo;

    const windVector = getWindAt(lon, lat, currentTime, windGrid);
    if (!windVector) {
      p.age--;
      continue;
    }

    const [u, v] = windVector;
    const speedMsSq = u * u + v * v;
    // Compare squared values instead of calling Math.sqrt for performance
    if (speedMsSq < 0.0001) continue; // 0.0001 = 0.01^2
    
    const speedMs = Math.sqrt(speedMsSq);
    const reciprocalSpeed = 1.0 / speedMs; // Calculate only once 
    const dirU = u * reciprocalSpeed;
    const dirV = v * reciprocalSpeed;
    const moveScale = sp.speed * p.speedMultiplier * Math.min(speedMs / 3.0, 2.5);

    // Store old position once instead of re-copying later
    const oldX = p.x;
    const oldY = p.y;
    
    // Optimize trail updates by shifting elements more efficiently
    for (let t = POOL_TRAIL - 1; t > 0; t--) {
      p.trail[t][0] = p.trail[t - 1][0];
      p.trail[t][1] = p.trail[t - 1][1];
    }
    // Now update with the new position at trail head
    p.trail[0][0] = oldX;
    p.trail[0][1] = oldY;

    p.x += dirU * moveScale;
    p.y -= dirV * moveScale;

    const lifeRatio = p.age / p.maxAge;
    const fadeIn = Math.min(1, p.age / 8);
    const fadeOut = Math.max(0, 1 - (lifeRatio - 0.7) / 0.3);
    const baseOpacity = Math.min(fadeIn, lifeRatio < 0.7 ? 1 : fadeOut);

    const trailStart = Math.max(0, activeTLen - 1);
    ctx.beginPath();
    ctx.moveTo(p.trail[trailStart][0], p.trail[trailStart][1]);
    for (let t = trailStart - 1; t >= 0; t--) {
      ctx.lineTo(p.trail[t][0], p.trail[t][1]);
    }
    ctx.lineTo(p.x, p.y);

    ctx.lineWidth = p.thickness * sp.lineWidth;
    ctx.strokeStyle = `rgba(255, 255, 255, ${baseOpacity * sp.opacity * 0.85})`;
    ctx.stroke();
  }
}

export interface SpeedOverlayState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  imageData: ImageData;
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  cachedTransformKey: string;
  cachedTime: number;
  rebuildTimeout: ReturnType<typeof setTimeout> | null;
  lastRebuild: number;
}

const CELL = 5;
const OVERLAY_REBUILD_MIN_INTERVAL = 80;

export function createSpeedOverlay(width: number, height: number): SpeedOverlayState {
  const overlayW = Math.ceil(width / CELL);
  const overlayH = Math.ceil(height / CELL);
  const canvas = document.createElement('canvas');
  canvas.width = overlayW;
  canvas.height = overlayH;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(overlayW, overlayH);
  return {
    canvas,
    ctx,
    imageData,
    pixels: imageData.data,
    width: overlayW,
    height: overlayH,
    cachedTransformKey: '',
    cachedTime: 0,
    rebuildTimeout: null,
    lastRebuild: 0,
  };
}

export function rebuildSpeedOverlay(
  overlay: SpeedOverlayState,
  currentTransform: ZoomTransform,
  projection: GeoProjection,
  currentTime: number,
  windGrid: WindGrid,
) {
  const { width: overlayW, height: overlayH, pixels, ctx, imageData } = overlay;
  for (let oy = 0; oy < overlayH; oy++) {
    for (let ox = 0; ox < overlayW; ox++) {
      const px = ox * CELL + CELL / 2;
      const py = oy * CELL + CELL / 2;
      const inverted = currentTransform.invert([px, py]);
      const geo = projection.invert!(inverted);
      const idx = (oy * overlayW + ox) * 4;
      if (!geo) {
        pixels[idx + 3] = 0;
        continue;
      }
      const wind = getWindAt(geo[0], geo[1], currentTime, windGrid);
      if (!wind) {
        pixels[idx + 3] = 0;
        continue;
      }
      const spd = Math.sqrt(wind[0] * wind[0] + wind[1] * wind[1]) * 1.94384;
      const li = speedKnotsToLUTIndex(spd);
      pixels[idx] = speedLUT[li * 3];
      pixels[idx + 1] = speedLUT[li * 3 + 1];
      pixels[idx + 2] = speedLUT[li * 3 + 2];
      pixels[idx + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

export function maybeRebuildOverlay(
  overlay: SpeedOverlayState,
  currentTransform: ZoomTransform,
  transformRef: { current: ZoomTransform },
  projection: GeoProjection,
  currentTimeRef: { current: number },
  windGrid: WindGrid,
) {
  const transformKey = `${currentTransform.k.toFixed(1)}_${currentTransform.x.toFixed(0)}_${currentTransform.y.toFixed(0)}`;
  const curTime = currentTimeRef.current;
  if (transformKey !== overlay.cachedTransformKey || curTime !== overlay.cachedTime) {
    const now = performance.now();
    if (now - overlay.lastRebuild > OVERLAY_REBUILD_MIN_INTERVAL) {
      rebuildSpeedOverlay(overlay, currentTransform, projection, curTime, windGrid);
      overlay.cachedTransformKey = transformKey;
      overlay.cachedTime = curTime;
      overlay.lastRebuild = now;
      if (overlay.rebuildTimeout) { clearTimeout(overlay.rebuildTimeout); overlay.rebuildTimeout = null; }
    } else if (!overlay.rebuildTimeout) {
      overlay.rebuildTimeout = setTimeout(() => {
        rebuildSpeedOverlay(overlay, transformRef.current, projection, currentTimeRef.current, windGrid);
        overlay.cachedTransformKey = `${transformRef.current.k.toFixed(1)}_${transformRef.current.x.toFixed(0)}_${transformRef.current.y.toFixed(0)}`;
        overlay.cachedTime = currentTimeRef.current;
        overlay.lastRebuild = performance.now();
        overlay.rebuildTimeout = null;
      }, OVERLAY_REBUILD_MIN_INTERVAL);
    }
  }
}
