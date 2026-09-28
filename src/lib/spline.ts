/**
 * Monotone cubic-Hermite (Fritsch–Carlson) bezier segments for x-increasing
 * points — a smooth curve that does NOT overshoot the data. Returns the path
 * commands AFTER an implicit moveto to points[0] (i.e. the "C…"/"L…" tail).
 */
export function monotoneSegments(pts: [number, number][]): string {
  const nP = pts.length;
  if (nP < 2) return '';
  if (nP === 2) return `L${pts[1][0].toFixed(1)},${pts[1][1].toFixed(1)}`;
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const dx: number[] = [], slope: number[] = [];
  for (let i = 0; i < nP - 1; i++) { dx[i] = xs[i + 1] - xs[i]; slope[i] = (ys[i + 1] - ys[i]) / (dx[i] || 1); }
  const t: number[] = [slope[0]];
  for (let i = 1; i < nP - 1; i++) t[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  t[nP - 1] = slope[nP - 2];
  for (let i = 0; i < nP - 1; i++) {
    if (slope[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / slope[i], b = t[i + 1] / slope[i], s = a * a + b * b;
    if (s > 9) { const f = 3 / Math.sqrt(s); t[i] = f * a * slope[i]; t[i + 1] = f * b * slope[i]; }
  }
  let d = '';
  for (let i = 0; i < nP - 1; i++) {
    const c1x = xs[i] + dx[i] / 3, c1y = ys[i] + t[i] * dx[i] / 3;
    const c2x = xs[i + 1] - dx[i] / 3, c2y = ys[i + 1] - t[i + 1] * dx[i] / 3;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)} `;
  }
  return d.trim();
}

/** Smooth (monotone) open path through x-increasing points. */
export function smoothLine(pts: [number, number][]): string {
  if (!pts.length) return '';
  const head = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const seg = monotoneSegments(pts);
  return seg ? `${head} ${seg}` : head;
}

/**
 * Vector-interpolated wind (speed, dir° FROM) at an altitude (m AMSL) from a set
 * of levels. u/v interpolation so direction wraps through 360° correctly.
 * Returns null when the altitude is outside the profile (± margin).
 */
export function windAtAltitude(
  levels: { zAmsl: number; windSpd: number; windDir: number }[],
  zM: number,
  marginM = 150,
): { spd: number; dir: number } | null {
  if (!levels.length) return null;
  const asc = [...levels].sort((a, b) => a.zAmsl - b.zAmsl);
  const lo = asc[0], hi = asc[asc.length - 1];
  if (zM < lo.zAmsl - marginM || zM > hi.zAmsl + marginM) return null;
  if (zM <= lo.zAmsl) return { spd: lo.windSpd, dir: lo.windDir };
  if (zM >= hi.zAmsl) return { spd: hi.windSpd, dir: hi.windDir };
  const toUV = (s: number, d: number) => {
    const r = (d * Math.PI) / 180;
    return [-s * Math.sin(r), -s * Math.cos(r)] as const;
  };
  for (let i = 0; i < asc.length - 1; i++) {
    const a = asc[i], b = asc[i + 1];
    if (zM >= a.zAmsl && zM <= b.zAmsl) {
      const f = (zM - a.zAmsl) / (b.zAmsl - a.zAmsl || 1);
      const [ua, va] = toUV(a.windSpd, a.windDir);
      const [ub, vb] = toUV(b.windSpd, b.windDir);
      const u = ua + f * (ub - ua), v = va + f * (vb - va);
      let dir = (Math.atan2(-u, -v) * 180) / Math.PI;
      if (dir < 0) dir += 360;
      return { spd: Math.hypot(u, v), dir };
    }
  }
  return null;
}
