/**
 * Orchestrator unit tests — pure in-memory fakes, no network.
 *
 * Run with:  node server/grid/orchestrator.test.mjs
 *
 * Covers:
 *  1. Gap-filling across tiers within the same family
 *  2. Required-variable skip
 *  3. Family threshold STOPS escalation when coverage >= 0.98
 *  4. Family threshold DOES NOT stop when coverage < 0.98 (cross-family fill)
 *  5. Misaligned time axes are re-indexed correctly (critical correctness test)
 *  6. A 429 ends the tier and moves to the next provider
 *  7. Total failure (all providers throw) throws from fetchMergedGrid
 */

// ---------------------------------------------------------------------------
// Minimal assert helper
// ---------------------------------------------------------------------------

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

function assertEqual(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Import the orchestrator (ESM, relative path from project root)
// ---------------------------------------------------------------------------

// We need to import as ESM. The TypeScript files are compiled on-the-fly via
// the project's tsx/ts-node setup; this test is .mjs so node runs it directly.
// We patch the registry import by passing `providers` in opts — the real
// registry imports the live providers, which we bypass entirely.

// Direct import of the compiled output is not possible without a build step,
// so we test the orchestrator's logic by re-implementing the critical merge
// function inline against the same contract. This is intentionally a
// functional test of the algorithm, not an import-level integration test.
//
// The orchestrator is written in TypeScript; to run it we need tsx or ts-node.
// We import it via dynamic import with the tsx loader registered in package.json.
//
// If this fails, run: node --import tsx/esm server/grid/orchestrator.test.mjs

let fetchMergedGrid;
try {
  const mod = await import("./orchestrator.ts");
  fetchMergedGrid = mod.fetchMergedGrid;
} catch (err) {
  // Fallback: try without tsx (may work if compiled)
  try {
    const mod = await import("./orchestrator.js");
    fetchMergedGrid = mod.fetchMergedGrid;
  } catch {
    console.error("Could not import orchestrator. Run with: node --import tsx/esm server/grid/orchestrator.test.mjs");
    console.error("Original error:", err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Fake provider builder
// ---------------------------------------------------------------------------

/**
 * Creates a fake GridProvider.
 *
 * @param {object} cfg
 * @param {string}   cfg.id
 * @param {number}   cfg.tier
 * @param {string}   cfg.modelFamily
 * @param {string[]} cfg.supportedVars  Variables this provider claims to support
 * @param {object[]} cfg.points         Array of {lat, lon, time, values} to return
 * @param {string}   [cfg.degraded]     Optional degraded note
 * @param {boolean}  [cfg.throw429]     If true, throws a 429 error
 * @param {boolean}  [cfg.throwError]   If true, throws a generic error
 */
function makeProvider(cfg) {
  return {
    id: cfg.id,
    tier: cfg.tier,
    modelFamily: cfg.modelFamily,
    label: cfg.id,
    resolutionDeg: 0.09,
    supports(v) {
      return cfg.supportedVars.includes(v);
    },
    async available() { return true; },
    async fetch(req) {
      if (cfg.throw429) throw new Error("429 Too Many Requests");
      if (cfg.throwError) throw new Error("network failure");

      // Return only points from req.points that we have data for
      const returned = [];
      for (const reqPt of req.points) {
        const match = cfg.points.find(
          p => Math.abs(p.lat - reqPt.lat) < 0.0001 && Math.abs(p.lon - reqPt.lon) < 0.0001
        );
        if (match) {
          returned.push({ lat: match.lat, lon: match.lon, time: match.time, values: match.values });
        }
      }
      return { source: cfg.id, points: returned, degraded: cfg.degraded };
    },
  };
}

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

// 5 points spread across two tiers
const POINT_A = { lat: -37.0, lon: 144.0 };
const POINT_B = { lat: -37.1, lon: 144.1 };
const POINT_C = { lat: -37.2, lon: 144.2 };
const POINT_D = { lat: -37.3, lon: 144.3 };
const POINT_E = { lat: -37.4, lon: 144.4 };

const TIME_AXIS_1 = ["2026-09-12T06:00", "2026-09-12T07:00", "2026-09-12T08:00"];
// Deliberately offset: starts at T07 and adds T09 (no T06)
const TIME_AXIS_2 = ["2026-09-12T07:00", "2026-09-12T08:00", "2026-09-12T09:00"];

function makeValues(vals) {
  return { wind_speed_10m: vals };
}

// ---------------------------------------------------------------------------
// TEST 1: Gap-filling across tiers within same family
// ---------------------------------------------------------------------------

console.log("\nTEST 1: Gap-filling across tiers (same family)");
{
  const tier1 = makeProvider({
    id: "openmeteo-api",
    tier: 1,
    modelFamily: "ecmwf",
    supportedVars: ["wind_speed_10m"],
    points: [
      { ...POINT_A, time: TIME_AXIS_1, values: makeValues([10, 11, 12]) },
      { ...POINT_B, time: TIME_AXIS_1, values: makeValues([20, 21, 22]) },
    ],
  });

  const tier2 = makeProvider({
    id: "openmeteo-s3-ecmwf",
    tier: 2,
    modelFamily: "ecmwf",
    supportedVars: ["wind_speed_10m"],
    points: [
      { ...POINT_C, time: TIME_AXIS_1, values: makeValues([30, 31, 32]) },
      { ...POINT_D, time: TIME_AXIS_1, values: makeValues([40, 41, 42]) },
      { ...POINT_E, time: TIME_AXIS_1, values: makeValues([50, 51, 52]) },
    ],
  });

  const result = await fetchMergedGrid(
    { points: [POINT_A, POINT_B, POINT_C, POINT_D, POINT_E], variables: ["wind_speed_10m"], forecastDays: 1 },
    { providers: [tier1, tier2] },
  );

  assert(result.points.length === 5, "All 5 points filled");
  assert(result.provenance.missing === 0, "No missing points");
  assert(result.provenance.bySource.length === 2, "Two sources in provenance");
  assert(result.provenance.bySource[0].source === "openmeteo-api", "Tier 1 listed first");
  assert(result.provenance.bySource[0].points === 2, "Tier 1 contributed 2 points");
  assert(result.provenance.bySource[1].source === "openmeteo-s3-ecmwf", "Tier 2 listed second");
  assert(result.provenance.bySource[1].points === 3, "Tier 2 contributed 3 points");
  assert(!result.provenance.mixedFamilies, "Same-family fill: no seam flag");
}

// ---------------------------------------------------------------------------
// TEST 2: Required-variable skip
// ---------------------------------------------------------------------------

console.log("\nTEST 2: Required-variable skip");
{
  // GFS-family provider does not support 'cape'; ECMWF one does.
  const ecmwfProvider = makeProvider({
    id: "openmeteo-api",
    tier: 1,
    modelFamily: "ecmwf",
    supportedVars: ["wind_speed_10m", "cape"],
    points: [
      { ...POINT_A, time: TIME_AXIS_1, values: { wind_speed_10m: [5, 6, 7], cape: [100, 200, 300] } },
    ],
  });

  const gfsProvider = makeProvider({
    id: "openmeteo-s3-gfs",
    tier: 3,
    modelFamily: "gfs",
    supportedVars: ["wind_speed_10m"], // no cape
    points: [
      { ...POINT_A, time: TIME_AXIS_1, values: makeValues([99, 99, 99]) },
    ],
  });

  const result = await fetchMergedGrid(
    {
      points: [POINT_A],
      variables: ["wind_speed_10m", "cape"],
      required: ["cape"],
      forecastDays: 1,
    },
    { providers: [ecmwfProvider, gfsProvider] },
  );

  // GFS should have been skipped entirely — cape is required
  const gfsEntry = result.provenance.bySource.find(s => s.source === "openmeteo-s3-gfs");
  assert(!gfsEntry, "GFS provider was skipped (not in bySource)");

  const ecmwfEntry = result.provenance.bySource.find(s => s.source === "openmeteo-api");
  assert(!!ecmwfEntry, "ECMWF provider contributed");

  const noteSkip = result.provenance.notes.some(n => n.includes("openmeteo-s3-gfs") && n.includes("cape"));
  assert(noteSkip, "Skip reason noted in provenance");

  // Value should be from ECMWF (cape=100 at hour 0), not GFS (99)
  const pt = result.points.find(p => Math.abs(p.lat - POINT_A.lat) < 0.001);
  assert(pt?.values?.cape?.[0] === 100, "Point carries ECMWF cape value (not GFS)");
}

// ---------------------------------------------------------------------------
// TEST 3: Family threshold STOPS cross-family escalation
// ---------------------------------------------------------------------------

console.log("\nTEST 3: Family threshold stops escalation at >= 0.98");
{
  // 100 points total; ECMWF family covers 99 of them (99% >= 98% threshold).
  // GFS family should NOT be contacted.
  const N = 100;
  const allPoints = Array.from({ length: N }, (_, i) => ({ lat: -37 + i * 0.01, lon: 144.0 }));

  let gfsFetchCalled = false;

  const ecmwfProvider = makeProvider({
    id: "openmeteo-api",
    tier: 1,
    modelFamily: "ecmwf",
    supportedVars: ["wind_speed_10m"],
    // Returns 99 out of 100 points
    points: allPoints.slice(0, 99).map(p => ({
      ...p, time: TIME_AXIS_1, values: makeValues([10, 10, 10]),
    })),
  });

  const gfsProvider = {
    id: "openmeteo-s3-gfs",
    tier: 3,
    modelFamily: "gfs",
    label: "gfs",
    resolutionDeg: 0.117,
    supports: () => true,
    available: async () => true,
    fetch: async () => {
      gfsFetchCalled = true;
      return { source: "openmeteo-s3-gfs", points: [] };
    },
  };

  const result = await fetchMergedGrid(
    { points: allPoints, variables: ["wind_speed_10m"], forecastDays: 1 },
    { providers: [ecmwfProvider, gfsProvider] },
  );

  assert(!gfsFetchCalled, "GFS provider NOT contacted (ECMWF covered 99% >= 98% threshold)");
  assert(!result.provenance.mixedFamilies, "mixedFamilies is false");
  assert(result.points.length === 99, "99 points filled");
  assert(result.provenance.missing === 1, "1 point unfilled (acceptable ragged edge)");
}

// ---------------------------------------------------------------------------
// TEST 4: Cross-family escalation when coverage < 0.98
// ---------------------------------------------------------------------------

console.log("\nTEST 4: Cross-family escalation when coverage < 0.98");
{
  // 100 points; ECMWF covers only 90 (90% < 98%). GFS SHOULD be contacted.
  const N = 100;
  const allPoints = Array.from({ length: N }, (_, i) => ({ lat: -38 + i * 0.01, lon: 145.0 }));

  let gfsFetchCalled = false;

  const ecmwfProvider = makeProvider({
    id: "openmeteo-api",
    tier: 1,
    modelFamily: "ecmwf",
    supportedVars: ["wind_speed_10m"],
    points: allPoints.slice(0, 90).map(p => ({
      ...p, time: TIME_AXIS_1, values: makeValues([10, 10, 10]),
    })),
  });

  const gfsProvider = makeProvider({
    id: "openmeteo-s3-gfs",
    tier: 3,
    modelFamily: "gfs",
    supportedVars: ["wind_speed_10m"],
    points: allPoints.slice(90, 100).map(p => ({
      ...p, time: TIME_AXIS_1, values: makeValues([20, 20, 20]),
    })),
  });

  // Wrap to track whether GFS fetch was called
  const originalFetch = gfsProvider.fetch.bind(gfsProvider);
  gfsProvider.fetch = async (req) => {
    gfsFetchCalled = true;
    return originalFetch(req);
  };

  const result = await fetchMergedGrid(
    { points: allPoints, variables: ["wind_speed_10m"], forecastDays: 1 },
    { providers: [ecmwfProvider, gfsProvider] },
  );

  assert(gfsFetchCalled, "GFS provider WAS contacted (ECMWF only covered 90%)");
  assert(result.provenance.mixedFamilies, "mixedFamilies is true");
  assert(result.points.length === 100, "All 100 points filled");
  assert(result.provenance.missing === 0, "No missing points");
  assert(
    result.provenance.notes.some(n => n.includes("ecmwf") && n.includes("gfs")),
    "Family crossing noted in provenance",
  );
}

// ---------------------------------------------------------------------------
// TEST 5: Misaligned time axes re-indexed correctly (critical)
// ---------------------------------------------------------------------------

console.log("\nTEST 5: Misaligned time axes — re-indexed by string match, not position");
{
  // TIME_AXIS_1: ["T06", "T07", "T08"]  (provider 1)
  // TIME_AXIS_2: ["T07", "T08", "T09"]  (provider 2)
  //
  // After merge the canonical axis starts as TIME_AXIS_1 (first provider), and
  // provider 2's point is re-indexed onto it BY TIMESTAMP STRING:
  //   canonical T06 → no value (provider 2 has no T06)
  //   canonical T07 → provider2's index 0 value
  //   canonical T08 → provider2's index 1 value
  //   (T09 from provider 2 is beyond the canonical axis — dropped)
  //
  // The orchestrator then trims to the window every point covers, so T06 goes
  // and the result is T07–T08. Absence is never encoded as a number: a 0 would
  // read as dead calm, which is a lie a pilot might act on.

  const provider1 = makeProvider({
    id: "openmeteo-api",
    tier: 1,
    modelFamily: "ecmwf",
    supportedVars: ["wind_speed_10m"],
    points: [
      { ...POINT_A, time: TIME_AXIS_1, values: makeValues([10, 11, 12]) },
    ],
  });

  const provider2 = makeProvider({
    id: "openmeteo-s3-ecmwf",
    tier: 2,
    modelFamily: "ecmwf",
    supportedVars: ["wind_speed_10m"],
    points: [
      // Deliberately uses the offset axis
      { ...POINT_B, time: TIME_AXIS_2, values: makeValues([71, 81, 91]) },
      //   TIME_AXIS_2[0] = T07 → value 71
      //   TIME_AXIS_2[1] = T08 → value 81
      //   TIME_AXIS_2[2] = T09 → value 91 (no T09 in canonical, dropped)
    ],
  });

  const result = await fetchMergedGrid(
    { points: [POINT_A, POINT_B], variables: ["wind_speed_10m"], forecastDays: 1 },
    { providers: [provider1, provider2] },
  );

  // T06 is uncovered by point B, so the shared window is T07–T08.
  assertEqual(result.time, TIME_AXIS_1.slice(1), "Axis trimmed to the window both points cover");
  assert(
    result.provenance.notes.some(n => n.includes("trimmed")),
    "Trimming is disclosed in provenance, not silent",
  );

  const ptA = result.points.find(p => Math.abs(p.lat - POINT_A.lat) < 0.001);
  const ptB = result.points.find(p => Math.abs(p.lat - POINT_B.lat) < 0.001);

  assert(!!ptA && !!ptB, "Both points present");

  // Point A came from provider 1 on the canonical axis: T06's 10 is dropped by
  // the trim, leaving T07=11, T08=12. If re-indexing were positional this would
  // still be [10, 11] and the whole forecast would be shifted an hour early.
  assertEqual(ptA.values.wind_speed_10m, [11, 12], "Point A sliced to the window, not shifted");

  // Point B came from the offset axis: T07 and T08 must carry provider 2's
  // index 0 and 1 values, matched by string.
  assertEqual(ptB.values.wind_speed_10m, [71, 81], "Point B re-indexed by timestamp, then sliced");

  // The invariant that matters: no hole survives into the grid.
  for (const p of result.points) {
    assert(
      p.values.wind_speed_10m.every(Number.isFinite),
      `No non-finite values survive for point ${p.lat}`,
    );
  }
}

// ---------------------------------------------------------------------------
// TEST 6: 429 ends a tier; next provider is tried
// ---------------------------------------------------------------------------

console.log("\nTEST 6: 429 ends a tier, next provider is tried");
{
  let tier2Called = false;

  const tier1 = makeProvider({
    id: "openmeteo-api",
    tier: 1,
    modelFamily: "ecmwf",
    supportedVars: ["wind_speed_10m"],
    points: [],
    throw429: true,
  });

  const tier2 = makeProvider({
    id: "openmeteo-s3-ecmwf",
    tier: 2,
    modelFamily: "ecmwf",
    supportedVars: ["wind_speed_10m"],
    points: [
      { ...POINT_A, time: TIME_AXIS_1, values: makeValues([10, 11, 12]) },
    ],
  });

  const originalFetch = tier2.fetch.bind(tier2);
  tier2.fetch = async (req) => {
    tier2Called = true;
    return originalFetch(req);
  };

  const result = await fetchMergedGrid(
    { points: [POINT_A], variables: ["wind_speed_10m"], forecastDays: 1 },
    { providers: [tier1, tier2] },
  );

  assert(tier2Called, "Tier 2 was called after tier 1 was rate-limited");
  assert(result.points.length === 1, "Point filled by tier 2");
  assert(
    result.provenance.notes.some(n => n.includes("openmeteo-api") && n.includes("rate-limited")),
    "Rate-limit noted in provenance",
  );
}

// ---------------------------------------------------------------------------
// TEST 7: Total failure throws
// ---------------------------------------------------------------------------

console.log("\nTEST 7: Total failure throws");
{
  const brokenProvider = makeProvider({
    id: "openmeteo-api",
    tier: 1,
    modelFamily: "ecmwf",
    supportedVars: ["wind_speed_10m"],
    points: [],
    throwError: true,
  });

  let threw = false;
  try {
    await fetchMergedGrid(
      { points: [POINT_A], variables: ["wind_speed_10m"], forecastDays: 1 },
      { providers: [brokenProvider] },
    );
  } catch {
    threw = true;
  }

  assert(threw, "fetchMergedGrid throws when all providers fail");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("All tests passed.");
}
