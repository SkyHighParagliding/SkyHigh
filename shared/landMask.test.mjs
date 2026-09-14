/**
 * Land mask tests — no network, no database.
 *
 * Run with:  node --import tsx/esm shared/landMask.test.mjs
 *
 * scripts/bake-land-mask.mjs verifies the *raster* it builds, before encoding.
 * This verifies the *shipped artifact*, after decoding — so a fault in the RLE
 * writer, the base64 round-trip or the varint reader cannot slip through. The
 * two sets of expectations are deliberately written out separately rather than
 * imported from the bake script: agreement between two independent statements
 * is evidence, agreement with itself is not.
 */

import { isOnLand, isCovered, MASK_BOUNDS, MASK_WIDTH, MASK_HEIGHT, COVERAGE_BUFFER_DEG } from "./landMask.generated.ts";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log("\nLand mask — decoded artifact\n");

// ─── 1. Geometry the hand-traced rings got wrong ──────────────────────────────
// Western Port, Phillip Island, French Island and Corner Inlet are the specific
// features the old single-vertex coastline could not resolve.
const LAND = [
  ["Ben Nevis", 143.21, -37.23],
  ["Melbourne CBD", 144.96, -37.81],
  ["Bright / Mystic", 146.96, -36.73],
  ["Wilsons Promontory", 146.40, -39.03],
  ["Phillip Island", 145.24, -38.49],
  ["French Island", 145.36, -38.35],
  ["Snake Island, Corner Inlet", 146.55, -38.78],
  ["King Island", 143.95, -39.90],
  ["Flinders Island", 148.05, -40.00],
  ["Hobart", 147.32, -42.88],
];

const WATER = [
  ["Port Phillip Bay", 144.85, -38.05],
  ["Western Port", 145.25, -38.42],
  ["Corner Inlet", 146.30, -38.76],
  ["Bass Strait", 145.00, -39.60],
  ["Southern Ocean", 143.00, -39.50],
  ["Tasman Sea", 150.50, -37.50],
];

for (const [name, lon, lat] of LAND) assert(isOnLand(lon, lat), `${name} is land`);
for (const [name, lon, lat] of WATER) assert(!isOnLand(lon, lat), `${name} is water`);

// ─── 2. Ground the old client ring wrongly erased ─────────────────────────────
// These are the columns the server fetched, stored, and the browser then threw
// away because the client mask traced the Victorian state border.
console.log("");
for (const [name, lon, lat] of [
  ["Mount Gambier (SA)", 140.78, -37.83],
  ["Naracoorte (SA)", 140.74, -36.96],
  ["Bermagui (NSW far south coast)", 150.07, -36.42],
  ["Mallee, top row of the box", 142.00, -34.50],
]) {
  assert(isOnLand(lon, lat), `${name} is land, not erased by a state border`);
}

// ─── 3. The coverage mask ─────────────────────────────────────────────────────
console.log("");
for (const [name, lon, lat] of LAND) assert(isCovered(lon, lat), `${name} is covered`);

// A point just offshore must be covered but not land: this is the whole purpose
// of the dilation, giving a coastal site grid neighbours on its seaward side.
assert(!isOnLand(145.00, -38.60) && isCovered(145.00, -38.60),
  "a point ~0.1° off the Bass Strait coast is covered but not land");

// ...and a point well beyond the buffer must be neither.
assert(!isCovered(145.00, -39.30), "mid Bass Strait is outside the buffer");
assert(!isCovered(151.20, -37.50), "open Tasman Sea is outside the buffer");

// ─── 4. Bounds and out-of-extent behaviour ────────────────────────────────────
console.log("");
assert(MASK_WIDTH === Math.round((MASK_BOUNDS.lonMax - MASK_BOUNDS.lonMin) / MASK_BOUNDS.res),
  `width ${MASK_WIDTH} matches the declared extent`);
assert(MASK_HEIGHT === Math.round((MASK_BOUNDS.latMax - MASK_BOUNDS.latMin) / MASK_BOUNDS.res),
  `height ${MASK_HEIGHT} matches the declared extent`);
assert(COVERAGE_BUFFER_DEG === 0.2,
  "the baked buffer still matches buildLandTiles' historical default of 0.2°");

// Outside the extent must read as water rather than throw or wrap around to the
// opposite edge of the raster.
assert(!isOnLand(120.00, -25.00), "a point far outside the extent is water, not a wrapped index");
assert(!isOnLand(MASK_BOUNDS.lonMin - 1, -38.00), "west of the extent is water");
assert(!isOnLand(MASK_BOUNDS.lonMax + 1, -38.00), "east of the extent is water");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
