/**
 * Thermal overlay extraction tests — no network, no database.
 *
 * Run with:  node --import tsx/esm server/grid/extract.test.mjs
 *
 * Regression cover for the bug that blanked ~90% of the thermal overlay: the
 * extractor used to derive its lattice origin from Math.min(lon) and then look
 * points up by an exact coordinate string. One point off the 0-origin lattice
 * shifted the origin, and every other point missed the lookup and rendered as a
 * hole. The overlay's own geometry gave it away — latMin/delta was a whole
 * number while lonMin/delta was 1544.4444.
 */

import { extractThermalGrid } from "./extract.ts";

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

const DELTA = 0.09;
const TIME = ["2026-09-12T05:00", "2026-09-12T06:00", "2026-09-12T07:00"];

function makePoint(lat, lon) {
  return {
    lat, lon,
    hourly: {
      time: TIME,
      cape: [100, 200, 300],
      boundary_layer_height: [800, 900, 1000],
      temperature_2m: [14, 15, 16],
      dew_point_2m: [4, 5, 6],
      shortwave_radiation: [400, 600, 700],
      soil_moisture_0_to_7cm: [0.2, 0.2, 0.2],
    },
  };
}

/** A block of points sitting exactly on the absolute 0-origin lattice. */
function latticeBlock(j0, j1, i0, i1) {
  const points = [];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      points.push(makePoint(parseFloat((j * DELTA).toFixed(4)), parseFloat((i * DELTA).toFixed(4))));
    }
  }
  return points;
}

function grid(points) {
  // fetchedAt must be unique per call — extractThermalGrid memoises on it.
  return { delta: DELTA, fetchedAt: Date.now() + Math.random(), points };
}

function countCells(overlay) {
  return overlay.data[0].filter(c => c !== null).length;
}

// ---------------------------------------------------------------------------

console.log("\nTest 1: a fully on-lattice grid extracts every point");
{
  const points = latticeBlock(-440, -431, 1545, 1554); // 10 x 10
  const overlay = extractThermalGrid(grid(points));

  assert(overlay !== null, "overlay is produced");
  assert(overlay.ni === 10 && overlay.nj === 10, `lattice is 10x10 (got ${overlay.ni}x${overlay.nj})`);
  assert(countCells(overlay) === 100, `all 100 cells are populated (got ${countCells(overlay)})`);
}

console.log("\nTest 2: one off-lattice point does not blank the rest");
{
  const points = latticeBlock(-440, -431, 1545, 1554);
  // The stray: a longitude that is NOT a multiple of delta. Under the old
  // min/max reconstruction this became the origin and every other point missed.
  points.push(makePoint(-39.6, 139.0));

  const overlay = extractThermalGrid(grid(points));
  const cells = countCells(overlay);

  // Compared with a tolerance: the envelope is rounded to 4 dp on the way out, so
  // 138.96 / 0.09 is 1543.9999999999998 in binary floating point, not 1544.
  const onLattice = v => Math.abs(v / DELTA - Math.round(v / DELTA)) < 1e-6;

  assert(onLattice(overlay.lonMin),
    `overlay lonMin stays on the lattice (lonMin/delta = ${(overlay.lonMin / DELTA).toFixed(4)})`);
  assert(onLattice(overlay.latMin),
    `overlay latMin stays on the lattice (latMin/delta = ${(overlay.latMin / DELTA).toFixed(4)})`);
  assert(cells >= 100, `all 100 on-lattice points survive alongside the stray (got ${cells})`);
}

console.log("\nTest 3: ni/nj are consistent with the emitted envelope");
{
  const overlay = extractThermalGrid(grid(latticeBlock(-440, -431, 1545, 1554)));

  assert(Math.round((overlay.lonMax - overlay.lonMin) / DELTA) + 1 === overlay.ni,
    "ni matches (lonMax - lonMin) / delta + 1");
  assert(Math.round((overlay.latMax - overlay.latMin) / DELTA) + 1 === overlay.nj,
    "nj matches (latMax - latMin) / delta + 1");
  assert(overlay.data[0].length === overlay.ni * overlay.nj,
    "each time step holds exactly ni * nj cells");
}

console.log("\nTest 4: a point a few decimals off its cell centre still lands in that cell");
{
  // Providers round coordinates; a 0.0001 wobble must not drop the cell.
  const points = [makePoint(-39.6001, 139.0499), makePoint(-39.5099, 139.0501)];
  const overlay = extractThermalGrid(grid(points));

  assert(countCells(overlay) === 2, `both wobbled points render (got ${countCells(overlay)})`);
}

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
