/**
 * Bakes the shared land mask from Geoscience Australia coastline data.
 *
 * WHY. The thermal overlay is clipped to land twice — once on the server when
 * choosing which points to fetch (`buildLandTiles` in server/utils/gridTiles.ts)
 * and once in the browser when deciding which pixels to paint (`isOnLand` in
 * src/components/windmap/landMask.ts). Both were hand-traced polygon rings, they
 * drifted apart, and the client copy ended up tracing the *Victorian state
 * border* — erasing ten columns of South Australia and seven of the NSW far
 * south coast that the server had already fetched and stored. One generated
 * artifact, consumed by both, makes that class of drift impossible.
 *
 * The client mask is load-bearing, not belt-and-braces: `interpolateSpatial` in
 * thermalInterpolation.ts is a *relaxed* bilinear (one non-null corner is enough
 * to produce a value), so the field bleeds ~10 km offshore from the nearest land
 * point. The mask is what draws the visible coastline.
 *
 * SOURCE. GEODATA COAST 100K 2004, Geoscience Australia — coastline at Mean High
 * Water derived from the 1:100,000 National Topographic Map Series, including
 * islands as discrete features. Licensed CC BY 4.0; the attribution obligation
 * is already discharged in ThermalHelpModal.tsx and the wind map legend. The
 * .prj declares GCS_GDA_1994, i.e. geographic degrees, so no reprojection is
 * needed (GDA94 differs from WGS84 by ~1 m at this epoch — far below one cell).
 *
 * The source archive is a build input and is NOT committed. Fetch it with:
 *   curl -o data/ga-coast/coast.zip \
 *     https://d28rz98at9flks.cloudfront.net/61395/61395_shp.zip
 *
 * Usage:
 *   npm run bake:landmask                       # bake and write the artifact
 *   node scripts/bake-land-mask.mjs --bake      # bake and verify, write nothing
 *   node scripts/bake-land-mask.mjs --inspect   # dump layer schema + values
 *   node scripts/bake-land-mask.mjs --islands   # list named islands in the box
 *   node scripts/bake-land-mask.mjs --map 145.0 -38.6 145.6 -38.2
 *                                               # print a region as ASCII
 *
 * The emitted artifact has its own test, which checks the *decoded* masks so a
 * fault in the encoder cannot pass unnoticed: npm run test:landmask
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SRC = new URL('../data/ga-coast/', import.meta.url);
const LAYER = new URL('australia/cstauscd_r', SRC); // _r = region (polygon)

// ─── dBASE III reader ─────────────────────────────────────────────────────────
// Shapefile attributes live in a sidecar .dbf. Only the fixed-width character
// columns matter here, so this reads the header and slices strings; numeric
// columns arrive as their text representation, which is what we want for
// classification anyway.

function readDbf(path) {
  const buf = readFileSync(path);
  const recordCount = buf.readUInt32LE(4);
  const headerLen = buf.readUInt16LE(8);
  const recordLen = buf.readUInt16LE(10);

  const fields = [];
  for (let off = 32; off < headerLen && buf[off] !== 0x0d; off += 32) {
    fields.push({
      // dBASE III field descriptor: name at 0..10, type at 11, data address at
      // 12..15, length at 16, decimal count at 17.
      name: buf.toString('latin1', off, off + 11).replace(/\0.*$/, ''),
      type: String.fromCharCode(buf[off + 11]),
      length: buf[off + 16],
    });
  }

  function record(i) {
    let off = headerLen + i * recordLen + 1; // +1 skips the deletion flag
    const row = {};
    for (const f of fields) {
      row[f.name] = buf.toString('latin1', off, off + f.length).trim();
      off += f.length;
    }
    return row;
  }

  return { recordCount, fields, record };
}

// ─── Shapefile geometry reader ────────────────────────────────────────────────
// Only shape type 5 (Polygon) is handled, which is all this layer contains. The
// .shx index is ignored — records are walked sequentially, which is simpler and
// no slower for a single full pass.

function readPolygons(path, onPolygon) {
  const buf = readFileSync(path);
  const shapeType = buf.readInt32LE(32);
  if (shapeType !== 5) throw new Error(`expected polygon layer (5), got ${shapeType}`);

  const fileLen = buf.readInt32BE(24) * 2; // header stores 16-bit words
  let off = 100;
  let index = 0;

  while (off < fileLen) {
    const contentLen = buf.readInt32BE(off + 4) * 2;
    const body = off + 8;
    const recType = buf.readInt32LE(body);

    if (recType === 5) {
      const xMin = buf.readDoubleLE(body + 4);
      const yMin = buf.readDoubleLE(body + 12);
      const xMax = buf.readDoubleLE(body + 20);
      const yMax = buf.readDoubleLE(body + 28);
      const numParts = buf.readInt32LE(body + 36);
      const numPoints = buf.readInt32LE(body + 40);

      const partsAt = body + 44;
      const pointsAt = partsAt + numParts * 4;

      onPolygon({
        index,
        bbox: [xMin, yMin, xMax, yMax],
        numParts,
        numPoints,
        // Rings are materialised lazily — most records fall outside our bounding
        // box and are rejected on bbox alone, so decoding 12 MB of coordinates
        // up front would be wasted work.
        rings() {
          const out = [];
          for (let p = 0; p < numParts; p++) {
            const start = buf.readInt32LE(partsAt + p * 4);
            const end = p + 1 < numParts ? buf.readInt32LE(partsAt + (p + 1) * 4) : numPoints;
            const ring = new Array(end - start);
            for (let i = start; i < end; i++) {
              ring[i - start] = [
                buf.readDoubleLE(pointsAt + i * 16),
                buf.readDoubleLE(pointsAt + i * 16 + 8),
              ];
            }
            out.push(ring);
          }
          return out;
        },
      });
    }

    off = body + contentLen;
    index++;
  }
}

// ─── Inspection ───────────────────────────────────────────────────────────────

function inspect() {
  const dbf = readDbf(new URL(`${LAYER.pathname}.dbf`, SRC));
  console.log(`\n=== cstauscd_r.dbf — ${dbf.recordCount} records ===`);
  console.log('fields:', dbf.fields.map(f => `${f.name}:${f.type}${f.length}`).join(', '));

  console.log('\nfirst 5 records:');
  for (let i = 0; i < Math.min(5, dbf.recordCount); i++) {
    console.log(' ', JSON.stringify(dbf.record(i)));
  }

  // Value frequency per field. Whichever column separates land from sea/lake
  // will show up here as a small set of repeated codes.
  console.log('\nvalue frequencies (fields with <= 25 distinct values):');
  for (const f of dbf.fields) {
    const counts = new Map();
    let tooMany = false;
    for (let i = 0; i < dbf.recordCount; i++) {
      const v = dbf.record(i)[f.name];
      counts.set(v, (counts.get(v) ?? 0) + 1);
      if (counts.size > 25) { tooMany = true; break; }
    }
    if (tooMany) {
      console.log(`  ${f.name}: >25 distinct`);
    } else {
      const sorted = [...counts].sort((a, b) => b[1] - a[1]);
      console.log(`  ${f.name}: ${sorted.map(([v, c]) => `${v || '∅'}=${c}`).join('  ')}`);
    }
  }

  // Look-up tables decode those codes into words.
  for (const lut of ['coa_lut.dbf', 'sta_lut.dbf', 'bor_lut.dbf']) {
    try {
      const t = readDbf(new URL(`look_up_tables_lut/${lut}`, SRC));
      console.log(`\n=== ${lut} — ${t.recordCount} records ===`);
      for (let i = 0; i < t.recordCount; i++) console.log(' ', JSON.stringify(t.record(i)));
    } catch (e) {
      console.log(`\n${lut}: ${e.message}`);
    }
  }

  // Geometry summary, plus what actually falls inside the SkyHigh grid box.
  const BOX = { lonMin: 139.0, lonMax: 151.5, latMin: -44.0, latMax: -33.0 };
  let total = 0, inBox = 0, pointsInBox = 0, biggest = null;
  readPolygons(new URL(`${LAYER.pathname}.shp`, SRC), (poly) => {
    total++;
    const [xMin, yMin, xMax, yMax] = poly.bbox;
    if (xMax < BOX.lonMin || xMin > BOX.lonMax || yMax < BOX.latMin || yMin > BOX.latMax) return;
    inBox++;
    pointsInBox += poly.numPoints;
    if (!biggest || poly.numPoints > biggest.numPoints) {
      biggest = { index: poly.index, numPoints: poly.numPoints, bbox: poly.bbox };
    }
  });

  console.log(`\n=== geometry ===`);
  console.log(`polygons: ${total} total, ${inBox} intersecting the grid box`);
  console.log(`vertices inside the box: ${pointsInBox.toLocaleString()}`);
  console.log(`largest in box: record ${biggest?.index}, ${biggest?.numPoints.toLocaleString()} vertices,`,
    `bbox [${biggest?.bbox.map(n => n.toFixed(2)).join(', ')}]`);

  // Cross-reference geometry against attributes for the in-box records, so the
  // land/water classification can be decided from evidence.
  console.log('\n=== attributes of the 12 largest in-box polygons ===');
  const ranked = [];
  readPolygons(new URL(`${LAYER.pathname}.shp`, SRC), (poly) => {
    const [xMin, yMin, xMax, yMax] = poly.bbox;
    if (xMax < BOX.lonMin || xMin > BOX.lonMax || yMax < BOX.latMin || yMin > BOX.latMax) return;
    ranked.push({ index: poly.index, numPoints: poly.numPoints, bbox: poly.bbox });
  });
  ranked.sort((a, b) => b.numPoints - a.numPoints);
  for (const r of ranked.slice(0, 12)) {
    console.log(` #${r.index} pts=${String(r.numPoints).padStart(7)}`,
      `bbox=[${r.bbox.map(n => n.toFixed(2)).join(',')}]`,
      JSON.stringify(dbf.record(r.index)));
  }
}

// ─── Bake ─────────────────────────────────────────────────────────────────────

/**
 * Mask extent. Deliberately wider than the grid bounding box (lon 140–151, lat
 * −43.7 to −33.9) so the server's 0.2° offshore buffer, and any future widening
 * of the admin rectangle, stay inside the baked area rather than falling off the
 * edge into an implicit "not land".
 */
const MASK = { lonMin: 139.0, lonMax: 151.5, latMin: -44.0, latMax: -33.0, res: 0.01 };

const MASK_W = Math.round((MASK.lonMax - MASK.lonMin) / MASK.res);
const MASK_H = Math.round((MASK.latMax - MASK.latMin) / MASK.res);

/** Collects every edge of every land polygon that could touch the mask extent. */
function collectEdges() {
  const dbf = readDbf(new URL(`${LAYER.pathname}.dbf`, SRC));
  // Flat arrays rather than objects — ~190k edges, and the scanline loop below
  // touches all of them once per row.
  const x0 = [], y0 = [], x1 = [], y1 = [];
  let polygons = 0, rings = 0;

  readPolygons(new URL(`${LAYER.pathname}.shp`, SRC), (poly) => {
    const [xMin, yMin, xMax, yMax] = poly.bbox;
    if (xMax < MASK.lonMin || xMin > MASK.lonMax || yMax < MASK.latMin || yMin > MASK.latMax) return;

    const feat = dbf.record(poly.index).FEAT_CODE;
    // 'sea' polygons are the water bodies themselves. Everything else is land:
    // 'mainland' (one per state, borders internal once unioned) and 'island'.
    if (feat !== 'mainland' && feat !== 'island') return;

    polygons++;
    for (const ring of poly.rings()) {
      rings++;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        // Horizontal edges contribute no crossings and would divide by zero.
        if (ring[j][1] === ring[i][1]) continue;
        x0.push(ring[j][0]); y0.push(ring[j][1]);
        x1.push(ring[i][0]); y1.push(ring[i][1]);
      }
    }
  });

  return { x0, y0, x1, y1, polygons, rings, count: x0.length };
}

/**
 * Scanline rasterisation, even-odd fill.
 *
 * Point-in-polygon per cell would be 1.4M cells × 190k edges. Instead each row
 * is solved once: find every edge the row's latitude crosses, sort the crossing
 * longitudes, and fill between alternating pairs. Even-odd also gives interior
 * holes (lakes cut into a mainland ring) for free — a cell inside both the
 * outer ring and the hole gets two crossings and stays water.
 */
function rasterise(edges) {
  const cells = new Uint8Array(MASK_W * MASK_H);
  const xs = new Float64Array(256);
  let maxCrossings = 0;

  for (let row = 0; row < MASK_H; row++) {
    // Sample at cell centres, north to south.
    const lat = MASK.latMax - (row + 0.5) * MASK.res;

    let n = 0;
    let overflow = null;
    for (let e = 0; e < edges.count; e++) {
      const ya = edges.y0[e], yb = edges.y1[e];
      // Half-open test: a vertex exactly on the scanline counts once, not twice.
      if ((ya > lat) === (yb > lat)) continue;
      const t = (lat - ya) / (yb - ya);
      const x = edges.x0[e] + t * (edges.x1[e] - edges.x0[e]);
      if (n < xs.length) xs[n++] = x;
      else { overflow = (overflow ?? []); overflow.push(x); }
    }

    let list;
    if (overflow) {
      list = Array.from(xs.subarray(0, n)).concat(overflow);
      list.sort((a, b) => a - b);
    } else {
      list = xs.subarray(0, n);
      // Float64Array.sort is numeric by default.
      list.sort();
    }
    if (list.length > maxCrossings) maxCrossings = list.length;

    for (let i = 0; i + 1 < list.length; i += 2) {
      const xa = list[i], xb = list[i + 1];
      let ca = Math.ceil((xa - MASK.lonMin) / MASK.res - 0.5);
      let cb = Math.floor((xb - MASK.lonMin) / MASK.res - 0.5);
      if (cb < 0 || ca >= MASK_W) continue;
      if (ca < 0) ca = 0;
      if (cb >= MASK_W) cb = MASK_W - 1;
      cells.fill(1, row * MASK_W + ca, row * MASK_W + cb + 1);
    }
  }

  return { cells, maxCrossings };
}

/**
 * The offshore buffer the server adds when choosing which lattice points to
 * fetch, in degrees of latitude. Unchanged from the `buffer = 0.2` default that
 * both callers of buildLandTiles have always used; baking it means the server
 * needs no runtime distance query at all.
 */
const BUFFER_DEG = 0.2;

/** Standard-parallel scaling, so a degree of longitude compares to a degree of latitude. */
const LON_SCALE = Math.cos((38.5 * Math.PI) / 180);

/**
 * Felzenszwalb & Huttenlocher's 1D squared-distance transform, in place over a
 * strided slice. Exact and O(n), which matters because the naive alternative —
 * dilating by an elliptical structuring element of ~1,600 offsets across 1.375M
 * cells — is 2.2 billion operations.
 */
function edt1d(f, d, n, stride, spacing, v, z) {
  // The textbook formulation assumes unit sample spacing. Here a sample is
  // `spacing` degrees apart, and f already holds squared *degrees* from the
  // previous pass, so the parabola intersection has to be scaled too:
  //   s = ((f[q] + (q·sp)²) − (f[p] + (p·sp)²)) / (2·sp²·(q − p))
  // Dropping sp² compares a term of order 1e-4 against one of order 1e6, which
  // puts the intersections in the wrong place and leaves one-cell-wide vertical
  // streaks of spurious buffer trailing off the coast.
  const sp2 = spacing * spacing;
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) {
      const p = v[k];
      s = ((f[q * stride] - f[p * stride]) / sp2 + q * q - p * p) / (2 * q - 2 * p);
      if (s > z[k]) break;
      k--;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq * sp2 + f[v[k] * stride];
  }
  for (let q = 0; q < n; q++) f[q * stride] = d[q];
}

/**
 * Dilates the land mask by BUFFER_DEG, measured in true distance rather than in
 * raw degrees — a degree of longitude here is only ~0.78 of a degree of
 * latitude, so an isotropic cell dilation would over-buffer east-west by 28%.
 * Done as a separable exact Euclidean distance transform: squared distance to
 * the nearest land cell, thresholded once at the end.
 */
function dilate(cells) {
  const INF = 1e20;
  // Squared distance field, seeded 0 on land and +inf on water.
  const f = new Float64Array(MASK_W * MASK_H);
  for (let i = 0; i < f.length; i++) f[i] = cells[i] ? 0 : INF;

  const n = Math.max(MASK_W, MASK_H);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  // Columns first (latitude spacing), then rows (longitude spacing, scaled).
  for (let col = 0; col < MASK_W; col++) {
    edt1d(f.subarray(col), d, MASK_H, MASK_W, MASK.res, v, z);
  }
  for (let row = 0; row < MASK_H; row++) {
    edt1d(f.subarray(row * MASK_W), d, MASK_W, 1, MASK.res * LON_SCALE, v, z);
  }

  const limit = BUFFER_DEG * BUFFER_DEG;
  const out = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = f[i] <= limit ? 1 : 0;
  return out;
}

/**
 * Checks the fast distance transform against brute force on a sample of cells.
 *
 * The separable EDT is the one piece of this script whose output cannot be
 * eyeballed against a map — a wrong answer is a plausible-looking band. It has
 * already been wrong once: the parabola intersection dropped the spacing term,
 * which left one-cell-wide streaks of spurious buffer trailing off the coast.
 * Brute force over a window is O(window) per sample and obviously correct, so
 * agreement between the two is real evidence.
 */
function verifyDilation(cells, coverage, samples = 20000) {
  // A window wide enough to contain any land that could put a cell inside the
  // buffer, in each axis.
  const winRow = Math.ceil(BUFFER_DEG / MASK.res) + 1;
  const winCol = Math.ceil(BUFFER_DEG / (MASK.res * LON_SCALE)) + 1;
  const limit = BUFFER_DEG * BUFFER_DEG;

  // Deterministic sampling — a mulberry32 PRNG, so a failure is reproducible.
  let seed = 0x5eed;
  const rand = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  function covered(row, col) {
    for (let r = Math.max(0, row - winRow); r <= Math.min(MASK_H - 1, row + winRow); r++) {
      const dy = (r - row) * MASK.res;
      for (let c = Math.max(0, col - winCol); c <= Math.min(MASK_W - 1, col + winCol); c++) {
        if (!cells[r * MASK_W + c]) continue;
        const dx = (c - col) * MASK.res * LON_SCALE;
        if (dx * dx + dy * dy <= limit) return true;
      }
    }
    return false;
  }

  let mismatches = 0;
  let checked = 0;

  // Every cell in the buffer band, exhaustively. This is where a wrong answer
  // actually lands — the spacing bug produced *false positives* here, and
  // random sampling across 1.375M cells would very likely have missed the few
  // thousand cells involved.
  for (let row = 0; row < MASK_H; row++) {
    for (let col = 0; col < MASK_W; col++) {
      const i = row * MASK_W + col;
      if (!coverage[i] || cells[i]) continue;
      checked++;
      if (!covered(row, col)) mismatches++;
    }
  }
  const band = checked;

  // Plus a sample of everything else, to catch the opposite error — land near
  // enough to a cell that it should have been buffered and was not.
  for (let s = 0; s < samples; s++) {
    const row = Math.floor(rand() * MASK_H);
    const col = Math.floor(rand() * MASK_W);
    const i = row * MASK_W + col;
    if (coverage[i] && !cells[i]) continue; // already covered exhaustively
    checked++;
    if (covered(row, col) !== (coverage[i] === 1)) mismatches++;
  }

  return { checked, band, mismatches };
}

/** Packs one bit per cell, row-major, MSB first. */
function pack(cells) {
  const out = new Uint8Array(Math.ceil(cells.length / 8));
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]) out[i >> 3] |= 0x80 >> (i & 7);
  }
  return out;
}

/** Run-length encodes the bit sequence as LEB128 varints, starting with a water run. */
function rle(cells) {
  const runs = [];
  let current = 0, len = 0;
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i] ? 1 : 0;
    if (v === current) { len++; continue; }
    runs.push(len);
    current = v;
    len = 1;
  }
  runs.push(len);

  const bytes = [];
  for (const r of runs) {
    let v = r;
    do {
      let b = v & 0x7f;
      v >>>= 7;
      if (v > 0) b |= 0x80;
      bytes.push(b);
    } while (v > 0);
  }
  return { runs: runs.length, bytes: Uint8Array.from(bytes) };
}

function sample(cells, lon, lat) {
  const col = Math.floor((lon - MASK.lonMin) / MASK.res);
  const row = Math.floor((MASK.latMax - lat) / MASK.res);
  if (col < 0 || col >= MASK_W || row < 0 || row >= MASK_H) return false;
  return cells[row * MASK_W + col] === 1;
}

/**
 * Known points. Land cases are places pilots actually fly or that the broken
 * ring wrongly erased; water cases are the ones the hand-traced ring could not
 * resolve and that Jon called out by name.
 */
const CHECKS = [
  ['Ben Nevis', 143.21, -37.23, true],
  ['Mount Gambier (SA)', 140.78, -37.83, true],
  ['Naracoorte (SA)', 140.74, -36.96, true],
  ['Bermagui (NSW far south coast)', 150.07, -36.42, true],
  ['Mallee, top row of the box', 142.00, -33.95, true],
  ['Melbourne CBD', 144.96, -37.81, true],
  ['Bright / Mystic', 146.97, -36.73, true],
  ['Wilsons Promontory', 146.40, -39.03, true],
  ['Phillip Island', 145.24, -38.49, true],
  ['French Island', 145.36, -38.35, true],
  ['King Island', 143.95, -39.85, true],
  ['Flinders Island', 148.05, -40.00, true],
  ['Hobart', 147.32, -42.88, true],
  ['Port Phillip Bay (water)', 144.85, -38.05, false],
  ['Western Port (water)', 145.25, -38.42, false],
  // Corner Inlet proper, west of the Nooramunga island chain. An earlier version
  // of this check used 146.55 and failed — that point is inside SNAKE ISLAND
  // (record 7635, bbox [146.465, -38.790, 146.643, -38.717]), which the mask was
  // right to call land. Both points are kept so the distinction stays documented.
  ['Corner Inlet (water)', 146.30, -38.76, false],
  ['Snake Island, Corner Inlet', 146.55, -38.78, true],
  ['Bass Strait (water)', 145.00, -39.60, false],
  ['Southern Ocean (water)', 143.00, -39.50, false],
  ['Tasman Sea (water)', 150.50, -37.50, false],
];

/** Where the generated module lands. Imported by both the server and the client. */
const OUT = new URL('../shared/landMask.generated.ts', import.meta.url);

function emit(land, coverage) {
  const enc = (cells) => Buffer.from(rle(cells).bytes).toString('base64');
  // One 8 KB string literal on a single line makes the file unreadable and
  // unreviewable in a diff; chunked concatenation costs nothing at runtime.
  const wrap = (s) => s.match(/.{1,96}/g).map(m => `  "${m}"`).join(' +\n') + ';';

  return `/**
 * GENERATED FILE — DO NOT EDIT. Run \`npm run bake:landmask\` to regenerate.
 *
 * Land and coverage masks for the thermal overlay, baked from GEODATA COAST
 * 100K 2004 (Geoscience Australia, CC BY 4.0) by scripts/bake-land-mask.mjs.
 * That script's header explains why the mask exists and how it is built.
 *
 * Two masks, because the two consumers ask different questions:
 *
 *   isOnLand   — exact coastline at Mean High Water. The client clips rendered
 *                pixels with this; it is what draws the visible coastline,
 *                because interpolateSpatial is a relaxed bilinear that bleeds
 *                ~10 km offshore from the nearest land point.
 *   isCovered  — the same mask dilated by ${BUFFER_DEG}° of true distance. The server
 *                chooses which lattice points to fetch with this, so a coastal
 *                site still has grid neighbours on its seaward side.
 *
 * Both replace hand-traced polygon rings that had drifted apart — the client
 * copy was tracing the *Victorian state border*, erasing ten columns of South
 * Australia and seven of the NSW far south coast that the server had already
 * fetched and stored. One generated artifact makes that class of drift
 * impossible.
 */

/** Mask extent and cell size, in degrees. */
export const MASK_BOUNDS = {
  lonMin: ${MASK.lonMin},
  lonMax: ${MASK.lonMax},
  latMin: ${MASK.latMin},
  latMax: ${MASK.latMax},
  res: ${MASK.res},
} as const;

export const MASK_WIDTH = ${MASK_W};
export const MASK_HEIGHT = ${MASK_H};

/** Offshore buffer baked into the coverage mask, in degrees of latitude. */
export const COVERAGE_BUFFER_DEG = ${BUFFER_DEG};

// Run-length encoded, LEB128 varints, MSB-first bit order, starting with a
// water run. ~${(rle(land).bytes.length / 1024).toFixed(0)} KB each — small enough to inline rather than fetch, which
// keeps the masks synchronous and avoids a load-order hazard on first paint.
const LAND_RLE =
${wrap(enc(land))}

const COVERAGE_RLE =
${wrap(enc(coverage))}

function decode(b64: string): Uint8Array {
  const bin = typeof atob === "function"
    ? atob(b64)
    : Buffer.from(b64, "base64").toString("binary");

  const cells = new Uint8Array(MASK_WIDTH * MASK_HEIGHT);
  let i = 0;   // cell cursor
  let p = 0;   // byte cursor
  let value = 0; // runs alternate, starting with water
  while (p < bin.length && i < cells.length) {
    let run = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = bin.charCodeAt(p++);
      run |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);

    if (value) cells.fill(1, i, Math.min(i + run, cells.length));
    i += run;
    value ^= 1;
  }
  return cells;
}

// Decoded on first use rather than at module load: the server never asks
// isOnLand and the client never asks isCovered, so neither pays for both.
let landCells: Uint8Array | null = null;
let coverageCells: Uint8Array | null = null;

function at(cells: Uint8Array, lon: number, lat: number): boolean {
  const col = Math.floor((lon - MASK_BOUNDS.lonMin) / MASK_BOUNDS.res);
  const row = Math.floor((MASK_BOUNDS.latMax - lat) / MASK_BOUNDS.res);
  if (col < 0 || col >= MASK_WIDTH || row < 0 || row >= MASK_HEIGHT) return false;
  return cells[row * MASK_WIDTH + col] === 1;
}

/** True if (lon, lat) is land — the coastline the thermal overlay paints up to. */
export function isOnLand(lon: number, lat: number): boolean {
  if (!landCells) landCells = decode(LAND_RLE);
  return at(landCells, lon, lat);
}

/** True if (lon, lat) is land or within ${BUFFER_DEG}° of a coast — the server's fetch set. */
export function isCovered(lon: number, lat: number): boolean {
  if (!coverageCells) coverageCells = decode(COVERAGE_RLE);
  return at(coverageCells, lon, lat);
}
`;
}

function bake({ write = false } = {}) {
  const t0 = Date.now();
  const edges = collectEdges();
  console.log(`edges: ${edges.count.toLocaleString()} from ${edges.rings.toLocaleString()} rings across ${edges.polygons} land polygons`);

  const { cells, maxCrossings } = rasterise(edges);
  const land = cells.reduce((a, b) => a + b, 0);
  console.log(`raster: ${MASK_W} x ${MASK_H} = ${(MASK_W * MASK_H).toLocaleString()} cells at ${MASK.res}° (~1.1 km)`);
  console.log(`land:   ${land.toLocaleString()} cells (${(100 * land / (MASK_W * MASK_H)).toFixed(1)}%)`);
  console.log(`max crossings on a single scanline: ${maxCrossings}`);

  const coverage = dilate(cells);
  const covered = coverage.reduce((a, b) => a + b, 0);
  console.log(`covered: ${covered.toLocaleString()} cells (${(100 * covered / (MASK_W * MASK_H)).toFixed(1)}%) after a ${BUFFER_DEG}° dilation`);

  const packed = pack(cells);
  const encoded = rle(cells);
  const encodedCov = rle(coverage);
  const b64 = Buffer.from(encoded.bytes).toString('base64');
  console.log(`\nsizes: packed ${(packed.length / 1024).toFixed(1)} KB` +
    ` | RLE ${(encoded.bytes.length / 1024).toFixed(1)} KB (${encoded.runs.toLocaleString()} runs)` +
    ` | RLE+base64 ${(b64.length / 1024).toFixed(1)} KB` +
    ` | coverage RLE ${(encodedCov.bytes.length / 1024).toFixed(1)} KB`);

  console.log('\nverification:');
  let failed = 0;
  for (const [name, lon, lat, expected] of CHECKS) {
    const got = sample(cells, lon, lat);
    const ok = got === expected;
    if (!ok) failed++;
    console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(34)} expected ${expected ? 'land ' : 'water'}, got ${got ? 'land' : 'water'}`);
  }

  // The coverage mask must be a strict superset of land: dilation can only add.
  // Cheap to assert, and it catches a sign or stride error in the distance
  // transform that the spot checks above would sail straight past.
  let leaked = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] && !coverage[i]) leaked++;
  const superset = leaked === 0;
  if (!superset) failed++;
  console.log(`  ${superset ? '✓' : '✗'} coverage is a superset of land${superset ? '' : ` (${leaked} land cells missing)`}`);

  const dt = verifyDilation(cells, coverage);
  const dtOk = dt.mismatches === 0;
  if (!dtOk) failed++;
  console.log(`  ${dtOk ? '✓' : '✗'} dilation matches brute force on ${dt.checked.toLocaleString()} cells` +
    ` (all ${dt.band.toLocaleString()} in the buffer band, plus a sample elsewhere)` +
    `${dtOk ? '' : ` — ${dt.mismatches} mismatches`}`);

  const total = CHECKS.length + 2;
  console.log(`\n${total - failed}/${total} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (failed > 0) return false;

  if (write) {
    writeFileSync(OUT, emit(cells, coverage));
    console.log(`\nwrote ${OUT.pathname.replace(/^.*\/SkyHigh\//, '')}`);
  } else {
    console.log('\n(dry run — pass --write to emit shared/landMask.generated.ts)');
  }
  return true;
}

/**
 * Prints a region of the baked mask as ASCII, one character per cell, so a
 * coastline can be eyeballed against a real map. The bay-and-island geography
 * around Western Port and Corner Inlet is exactly what the hand-traced ring got
 * wrong, and a pass/fail table of spot checks does not show whether the *shape*
 * is right.
 */
function map(lonMin, latMin, lonMax, latMax) {
  const { cells } = rasterise(collectEdges());
  const c0 = Math.max(0, Math.floor((lonMin - MASK.lonMin) / MASK.res));
  const c1 = Math.min(MASK_W - 1, Math.ceil((lonMax - MASK.lonMin) / MASK.res));
  const r0 = Math.max(0, Math.floor((MASK.latMax - latMax) / MASK.res));
  const r1 = Math.min(MASK_H - 1, Math.ceil((MASK.latMax - latMin) / MASK.res));

  console.log(`\nlon ${lonMin}..${lonMax}  lat ${latMax}..${latMin}  (${c1 - c0 + 1} x ${r1 - r0 + 1} cells, # = land)\n`);
  for (let row = r0; row <= r1; row++) {
    let line = '';
    for (let col = c0; col <= c1; col++) line += cells[row * MASK_W + col] ? '#' : '.';
    console.log(`${(MASK.latMax - (row + 0.5) * MASK.res).toFixed(2)} ${line}`);
  }
}

/**
 * Writes the mask out as a PNG for visual review. The ASCII map above is fine
 * for one bay; judging a whole coastline needs a picture. Land is green, the
 * offshore buffer the server fetches is pale, water is dark.
 *
 * Hand-rolled rather than pulling in an image dependency: a greyscale PNG is
 * a fixed header, one zlib stream and a CRC, and this is a build-time tool that
 * should not add to the project's dependency surface.
 */
function png(outPath) {
  const cells = rasterise(collectEdges()).cells;
  const coverage = dilate(cells);

  // Filter byte 0 (None) per scanline, then one palette index per pixel.
  const raw = Buffer.alloc(MASK_H * (1 + MASK_W));
  for (let row = 0; row < MASK_H; row++) {
    const base = row * (1 + MASK_W);
    raw[base] = 0;
    for (let col = 0; col < MASK_W; col++) {
      const i = row * MASK_W + col;
      raw[base + 1 + col] = cells[i] ? 2 : coverage[i] ? 1 : 0;
    }
  }

  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'latin1');
    data.copy(out, 8);
    out.writeInt32BE(crc32(out.subarray(4, 8 + data.length)) | 0, 8 + data.length);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(MASK_W, 0);
  ihdr.writeUInt32BE(MASK_H, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 3;  // colour type 3 = palette
  // water, buffer, land
  const plte = Buffer.from([0x0d, 0x1b, 0x2a, 0x3b, 0x5a, 0x6e, 0x4c, 0x8b, 0x3f]);

  writeFileSync(outPath, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
  console.log(`wrote ${outPath} (${MASK_W} x ${MASK_H})`);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c;
}

/** Lists named islands inside the grid box — the features the hand-traced ring dropped. */
function islands() {
  const dbf = readDbf(new URL(`${LAYER.pathname}.dbf`, SRC));
  const BOX = { lonMin: 139.0, lonMax: 151.5, latMin: -44.0, latMax: -33.0 };
  const found = [];
  readPolygons(new URL(`${LAYER.pathname}.shp`, SRC), (poly) => {
    const [xMin, yMin, xMax, yMax] = poly.bbox;
    if (xMax < BOX.lonMin || xMin > BOX.lonMax || yMax < BOX.latMin || yMin > BOX.latMax) return;
    const r = dbf.record(poly.index);
    if (r.FEAT_CODE !== 'island' || !r.ISLAND_NAM) return;
    found.push({ name: r.ISLAND_NAM, pts: poly.numPoints, bbox: poly.bbox });
  });
  found.sort((a, b) => b.pts - a.pts);
  console.log(`\n${found.length} named islands inside the grid box; 25 largest:`);
  for (const f of found.slice(0, 25)) {
    console.log(`  ${String(f.pts).padStart(6)} pts  ${f.name.padEnd(32)} [${f.bbox.map(n => n.toFixed(2)).join(',')}]`);
  }
}

const mode = process.argv[2] ?? '--inspect';
if (mode === '--inspect') {
  inspect();
} else if (mode === '--islands') {
  islands();
} else if (mode === '--bake') {
  process.exit(bake({ write: process.argv.includes('--write') }) ? 0 : 1);
} else if (mode === '--map') {
  const [a, b, c, d] = process.argv.slice(3).map(Number);
  if ([a, b, c, d].some(n => !Number.isFinite(n))) {
    console.error('usage: --map <lonMin> <latMin> <lonMax> <latMax>');
    process.exit(1);
  }
  map(a, b, c, d);
} else if (mode === '--png') {
  png(process.argv[3] ?? 'land-mask.png');
} else {
  console.error(`unknown mode ${mode}; expected --inspect, --islands, --bake or --map`);
  process.exit(1);
}
