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
 * Closed smooth loop through an arbitrary sequence of points (no x-monotone
 * requirement) as a single tangent-continuous bezier path — a centripetal
 * Catmull-Rom (alpha = 0.5, so no cusps or self-intersections at tight turns).
 * Use for filled blobs whose outline turns back on itself: because the whole
 * boundary is one loop, the tips where the top and bottom edges meet come out
 * rounded and tangent instead of as sharp corners. Returns a full "M … C … Z".
 */
export function closedSpline(pts: [number, number][], alpha = 0.5): string {
  const m = pts.length;
  if (m < 3) return smoothLine(pts) + (m ? ' Z' : '');
  const at = (i: number) => pts[((i % m) + m) % m];
  const dist = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} `;
  for (let i = 0; i < m; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const t1 = Math.pow(dist(p0, p1), alpha);
    const t2 = Math.pow(dist(p1, p2), alpha);
    const t3 = Math.pow(dist(p2, p3), alpha);
    const c1: [number, number] = [0, 0], c2: [number, number] = [0, 0];
    for (let k = 0; k < 2; k++) {
      const m1 = (p2[k] - p1[k]) / t2 - (p2[k] - p0[k]) / (t1 + t2) + (p1[k] - p0[k]) / t1;
      const m2 = (p3[k] - p2[k]) / t3 - (p3[k] - p1[k]) / (t2 + t3) + (p2[k] - p1[k]) / t2;
      c1[k] = p1[k] + (m1 * t2) / 3;
      c2[k] = p2[k] - (m2 * t2) / 3;
    }
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)} `;
  }
  return d.trim() + ' Z';
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
