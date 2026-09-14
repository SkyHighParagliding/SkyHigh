/**
 * The invariant: at the zoom-out floor, the whole configured grid rectangle is
 * visible — for EVERY rectangle shape the admin editor can produce and EVERY
 * viewport the map is mounted in.
 *
 * This is swept rather than spot-checked on purpose. The bug it pins (cover
 * instead of contain) is invisible whenever the rectangle and the viewport
 * happen to share an aspect ratio, and it binds on *different axes* depending on
 * which way that ratio tips — a couple of hand-picked cases would have passed
 * while portrait mobile was losing 72% of the map.
 *
 * Run: npm run test:mapextent
 */

import {
  createMapProjection,
  gridWorldExtent,
  gridWorldCenter,
  containScale,
} from './mapExtent.ts';

let passed = 0;
let failed = 0;

function check(name, cond, detail) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const projection = createMapProjection();

/**
 * Invert a screen point to projected world coordinates under transform {x,y,k}.
 *
 * The containment check runs in world space, not lon/lat. Degrees are the wrong
 * ruler for it twice over: a viewport wider than the globe inverts to a longitude
 * that has wrapped past ±180 (so `lonMax < lonMin` and a correct result reads as a
 * failure), and a fixed epsilon in degrees is a different tolerance at every zoom.
 */
function toWorld(sx, sy, t) {
  return [(sx - t.x) / t.k, (sy - t.y) / t.k];
}

/** The transform at the zoom floor, centred on the rectangle. */
function flooredTransform(bounds, width, height) {
  const { extW, extH } = gridWorldExtent(projection, bounds);
  const k = containScale(extW, extH, width, height);
  const c = gridWorldCenter(projection, bounds);
  return { k, x: width / 2 - c[0] * k, y: height / 2 - c[1] * k };
}

// Rectangle shapes: the current production box, the dev box, plus deliberately
// extreme aspect ratios in both directions.
const RECTS = [
  { name: 'production (wide, short)', lonMin: 138.9, lonMax: 151.6, latMin: -40.5, latMax: -34.1 },
  { name: 'dev (near square)', lonMin: 140.0, lonMax: 150.95, latMin: -43.7, latMax: -33.95 },
  { name: 'very wide', lonMin: 112.0, lonMax: 154.0, latMin: -39.0, latMax: -35.0 },
  { name: 'very tall', lonMin: 144.0, lonMax: 146.0, latMin: -43.5, latMax: -10.0 },
  { name: 'tiny', lonMin: 145.0, lonMax: 145.4, latMin: -37.9, latMax: -37.6 },
  { name: 'continental', lonMin: 112.0, lonMax: 154.0, latMin: -44.0, latMax: -10.0 },
];

// Viewports: phones in portrait, the fullscreen map, embedded panels, desktop.
const VIEWPORTS = [
  { name: 'iPhone SE portrait', w: 320, h: 568 },
  { name: 'iPhone 14 fullscreen', w: 375, h: 733 },
  { name: 'narrow portrait', w: 271, h: 600 },
  { name: 'site panel', w: 409, h: 247 },
  { name: 'sites card', w: 343, h: 343 },
  { name: 'desktop wide', w: 1440, h: 420 },
  { name: 'desktop tall', w: 900, h: 1000 },
  { name: 'square', w: 800, h: 800 },
];

console.log('\nZoom floor contains the whole rectangle:');
for (const r of RECTS) {
  for (const v of VIEWPORTS) {
    const t = flooredTransform(r, v.w, v.h);
    const { tl, br, extW, extH } = gridWorldExtent(projection, r);
    const [x0, y0] = toWorld(0, 0, t);
    const [x1, y1] = toWorld(v.w, v.h, t);
    // Tolerance relative to the rectangle: one part in a billion of its own size.
    const ex = extW * 1e-9;
    const ey = extH * 1e-9;
    const ok = x0 <= tl[0] + ex && x1 >= br[0] - ex && y0 <= tl[1] + ey && y1 >= br[1] - ey;
    check(
      `${r.name} @ ${v.name}`,
      ok,
      `shows ${(((x1 - x0) / extW) * 100).toFixed(1)}% of width, ` +
        `${(((y1 - y0) / extH) * 100).toFixed(1)}% of height`,
    );
  }
}

console.log('\nExactly one axis binds (the floor is tight, not slack):');
for (const r of RECTS) {
  for (const v of VIEWPORTS) {
    const { extW, extH } = gridWorldExtent(projection, r);
    const k = containScale(extW, extH, v.w, v.h);
    // One of the two ratios must equal k, i.e. that axis fits edge to edge.
    const tight =
      Math.abs(k - v.w / extW) < 1e-9 || Math.abs(k - v.h / extH) < 1e-9;
    check(`${r.name} @ ${v.name} tight`, tight);
  }
}

console.log('\nCover (the old behaviour) genuinely fails this invariant:');
{
  // Guard against the test being vacuous: the thing it checks must be capable of
  // failing. Reproduce the old `Math.max` and confirm it loses the rectangle.
  const r = RECTS[0];
  const v = { w: 375, h: 733 };
  const { tl, br, extW, extH } = gridWorldExtent(projection, r);
  const coverK = Math.max(v.w / extW, v.h / extH);
  const c = gridWorldCenter(projection, r);
  const t = { k: coverK, x: v.w / 2 - c[0] * coverK, y: v.h / 2 - c[1] * coverK };
  const [x0] = toWorld(0, 0, t);
  const [x1] = toWorld(v.w, v.h, t);
  const visiblePct = ((x1 - x0) / extW) * 100;
  check(
    'cover loses longitude on portrait',
    x0 > tl[0] && x1 < br[0],
    `cover shows ${visiblePct.toFixed(1)}% of longitude`,
  );
  console.log(`  (cover showed ${visiblePct.toFixed(1)}% of longitude; contain shows 100%)`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
