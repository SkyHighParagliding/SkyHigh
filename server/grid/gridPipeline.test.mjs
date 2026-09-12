/**
 * Grid pipeline tests — fake providers, no network, no database.
 *
 * Run with:  node --import tsx/esm server/grid/gridPipeline.test.mjs
 *
 * Covers the three guarantees the refactor must not break:
 *  1. A MergedGrid converts to the EXACT legacy VictoriaGrid / ThermalVictoriaGrid
 *     persisted shape — production rows must stay readable by the same code.
 *  2. A grid stored WITHOUT provenance (an old production row) still loads and
 *     renders through the extraction helpers.
 *  3. The thermal request's `required` set excludes the S3 GFS provider, which
 *     carries no CAPE.
 */

import { fetchMergedGrid } from "./orchestrator.ts";
import { FINE_GRID } from "./fineGrid.ts";
import { THERMAL_GRID } from "./thermalGrid.ts";
import { extractFullWindGrid, extractThermalGrid, extractSiteForecast } from "./extract.ts";
import { PROVIDERS } from "./providers/registry.ts";

// ---------------------------------------------------------------------------
// Assertions
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
// Fixtures
// ---------------------------------------------------------------------------

const TIME = ["2026-09-12T05:00", "2026-09-12T06:00", "2026-09-12T07:00"];
const POINT_A = { lat: -37.8, lon: 145.0 };
const POINT_B = { lat: -37.65, lon: 145.0 };

/** A provider that returns a fixed value for every variable it supports. */
function fakeProvider({ id, tier, modelFamily, supportedVars, points, time = TIME }) {
  const supported = new Set(supportedVars);
  return {
    id,
    tier,
    modelFamily,
    label: `Fake ${id}`,
    resolutionDeg: 0.1,
    supports: v => supported.has(v),
    available: async () => true,
    async fetch(req) {
      const wanted = req.variables.filter(v => supported.has(v));
      return {
        source: id,
        points: points.map((p, pi) => ({
          lat: p.lat,
          lon: p.lon,
          time,
          // Distinct per variable and per point so mis-wiring is visible.
          values: Object.fromEntries(
            wanted.map((v, vi) => [v, time.map((_t, ti) => (vi + 1) * 10 + pi * 100 + ti)]),
          ),
        })),
      };
    },
  };
}

const ALL_FINE_VARS = FINE_GRID.variables;

// ---------------------------------------------------------------------------
// Test 1 — merged grid converts to the exact legacy persisted shape
// ---------------------------------------------------------------------------

console.log("\nTest 1: MergedGrid → legacy VictoriaGrid persisted shape");
{
  const provider = fakeProvider({
    id: "openmeteo-api",
    tier: 1,
    modelFamily: "ecmwf",
    supportedVars: ALL_FINE_VARS,
    points: [POINT_A, POINT_B],
  });

  const merged = await fetchMergedGrid(
    { points: [POINT_A, POINT_B], variables: ALL_FINE_VARS, required: FINE_GRID.required, forecastDays: 2 },
    { providers: [provider] },
  );

  const points = merged.points.map(p => FINE_GRID.buildPoint(p, merged.time));

  // The persisted per-point shape is a contract: exactly these keys, in the
  // hourly block, with numeric arrays. Anything else breaks production rows.
  const EXPECTED_HOURLY_KEYS = [
    "time",
    "wind_speed_10m",
    "wind_gusts_10m",
    "wind_direction_10m",
    "temperature_2m",
    "weather_code",
    "precipitation",
    "precipitation_probability",
    "cloud_cover",
    "cloud_cover_low",
    "visibility",
    "cape",
    "boundary_layer_height",
  ];

  assertEqual(Object.keys(points[0].hourly).sort(), [...EXPECTED_HOURLY_KEYS].sort(),
    "GridPoint.hourly has exactly the legacy key set");

  assert(typeof points[0].lat === "number" && typeof points[0].lon === "number",
    "GridPoint carries numeric lat/lon at the top level");

  assertEqual(points[0].hourly.time, TIME,
    "hourly.time is the canonical Melbourne-local axis");

  assert(EXPECTED_HOURLY_KEYS.filter(k => k !== "time")
    .every(k => Array.isArray(points[0].hourly[k]) && points[0].hourly[k].length === TIME.length),
    "every hourly variable is a numeric array aligned to the time axis");

  assert(points[0].hourly.wind_speed_10m.every(Number.isFinite),
    "no NaN leaks into the persisted arrays (NaN is not JSON-representable)");

  assert(points[0].source === "openmeteo-api",
    "each point records the source that supplied it");

  // The full stored envelope, as the pipeline assembles it.
  const grid = {
    latMin: -44.5, latMax: -35.0, lonMin: 139.0, lonMax: 155.0,
    delta: FINE_GRID.delta, ni: 107, nj: 64,
    fetchedAt: Date.now(),
    provenance: merged.provenance,
    points,
  };

  assertEqual(
    Object.keys(grid).sort(),
    ["delta", "fetchedAt", "latMax", "latMin", "lonMax", "lonMin", "ni", "nj", "points", "provenance"],
    "stored envelope keeps every legacy field and adds only `provenance`",
  );

  // Round-trip through JSON, exactly as the DB stores it.
  const roundTripped = JSON.parse(JSON.stringify(grid));
  assertEqual(roundTripped, grid, "grid survives a JSON round-trip unchanged");

  const overlay = extractFullWindGrid(roundTripped);
  assert(overlay !== null && overlay.times.length > 0,
    "extractFullWindGrid renders the converted grid");

  const forecast = extractSiteForecast(roundTripped, "test-site", -37.8, 145.0);
  assert(forecast !== null && typeof forecast.windSpeed === "number",
    "extractSiteForecast renders the converted grid");
}

// ---------------------------------------------------------------------------
// Test 2 — a grid stored WITHOUT provenance (old production row) still loads
// ---------------------------------------------------------------------------

console.log("\nTest 2: legacy row without provenance still loads");
{
  // Byte-for-byte the shape victoriaGrid.ts used to write: no `provenance`
  // on the envelope and no `source` on any point.
  const legacyJson = JSON.stringify({
    latMin: -44.5, latMax: -35.0, lonMin: 139.0, lonMax: 155.0,
    delta: 0.15, ni: 107, nj: 64,
    fetchedAt: Date.now(),
    points: [
      {
        lat: -37.8, lon: 145.0,
        hourly: {
          time: TIME,
          wind_speed_10m: [10, 11, 12],
          wind_gusts_10m: [15, 16, 17],
          wind_direction_10m: [270, 275, 280],
          temperature_2m: [14, 15, 16],
          weather_code: [0, 1, 2],
          precipitation: [0, 0, 0],
          precipitation_probability: [0, 5, 10],
          cloud_cover: [20, 30, 40],
          cloud_cover_low: [10, 15, 20],
          visibility: [24000, 24000, 24000],
          cape: [100, 200, 300],
          boundary_layer_height: [800, 900, 1000],
        },
      },
      {
        lat: -37.65, lon: 145.0,
        hourly: {
          time: TIME,
          wind_speed_10m: [8, 9, 10],
          wind_gusts_10m: [12, 13, 14],
          wind_direction_10m: [260, 265, 270],
          temperature_2m: [13, 14, 15],
          weather_code: [0, 0, 1],
          precipitation: [0, 0, 0],
          precipitation_probability: [0, 0, 5],
          cloud_cover: [10, 20, 30],
          cloud_cover_low: [5, 10, 15],
          visibility: [24000, 24000, 24000],
          cape: [50, 150, 250],
          boundary_layer_height: [700, 800, 900],
        },
      },
    ],
  });

  const legacy = JSON.parse(legacyJson);

  assert(legacy.provenance === undefined, "fixture genuinely has no provenance");
  assert(legacy.points.every(p => p.source === undefined), "fixture points genuinely have no source");

  const overlay = extractFullWindGrid(legacy);
  assert(overlay !== null, "extractFullWindGrid loads a provenance-free legacy grid");
  assert(overlay.ni === 1 && overlay.nj === 2, "legacy grid keeps its 1×2 point geometry");
  assert(overlay.data[0].every(c => typeof c.u === "number" && typeof c.v === "number"),
    "legacy grid produces valid u/v components");

  const forecast = extractSiteForecast(legacy, "legacy-site", -37.8, 145.0);
  assert(forecast !== null, "extractSiteForecast loads a provenance-free legacy grid");
  assert(forecast.windSpeed > 0, "legacy grid yields a real wind speed");

  // Same for the thermal shape.
  const legacyThermal = JSON.parse(JSON.stringify({
    latMin: -44.5, latMax: -35.0, lonMin: 139.0, lonMax: 155.0,
    delta: 0.09, ni: 178, nj: 106,
    fetchedAt: Date.now(),
    points: [{
      lat: -37.8, lon: 145.0,
      hourly: {
        time: TIME,
        cape: [100, 200, 300],
        boundary_layer_height: [800, 900, 1000],
        temperature_2m: [14, 15, 16],
        dew_point_2m: [4, 5, 6],
      },
    }],
  }));

  const thermal = extractThermalGrid(legacyThermal);
  assert(thermal !== null, "extractThermalGrid loads a provenance-free legacy thermal grid");
  assert(thermal.data[0][0] !== null && thermal.data[0][0].cape === 100,
    "legacy thermal grid yields real CAPE values");
  assert(typeof thermal.data[0][0].ccl === "number",
    "legacy thermal grid still computes CCL from T/Td");
}

// ---------------------------------------------------------------------------
// Test 3 — thermal `required` excludes the S3 GFS provider
// ---------------------------------------------------------------------------

console.log("\nTest 3: thermal required set excludes S3 GFS");
{
  assertEqual([...THERMAL_GRID.required].sort(), ["boundary_layer_height", "cape"],
    "thermal grid requires cape + boundary_layer_height");

  const gfsS3 = PROVIDERS.find(p => p.id === "openmeteo-s3-gfs");
  assert(gfsS3 !== undefined, "the real S3 GFS provider is in the registry");
  assert(gfsS3.supports("boundary_layer_height") === true,
    "S3 GFS does carry boundary_layer_height");
  assert(gfsS3.supports("cape") === false,
    "S3 GFS does NOT carry cape — this is what excludes it");
  assert(THERMAL_GRID.required.some(v => !gfsS3.supports(v)),
    "the real S3 GFS provider is therefore ineligible for the thermal request");

  // And the orchestrator actually acts on it: a GFS-shaped provider is never
  // contacted, so a thermal fetch with only that provider available fails.
  let gfsFetchCalled = false;
  const fakeGfs = fakeProvider({
    id: "openmeteo-s3-gfs",
    tier: 3,
    modelFamily: "gfs",
    supportedVars: ["wind_speed_10m", "wind_direction_10m", "boundary_layer_height", "temperature_2m"],
    points: [POINT_A],
  });
  const originalFetch = fakeGfs.fetch.bind(fakeGfs);
  fakeGfs.fetch = async req => { gfsFetchCalled = true; return originalFetch(req); };

  let threw = false;
  try {
    await fetchMergedGrid(
      {
        points: [POINT_A],
        variables: THERMAL_GRID.variables,
        required: THERMAL_GRID.required,
        forecastDays: 2,
      },
      { providers: [fakeGfs] },
    );
  } catch {
    threw = true;
  }

  assert(threw, "a thermal request with only a CAPE-less provider throws rather than returning holes");
  assert(gfsFetchCalled === false, "the CAPE-less provider was never contacted");

  // With an ECMWF-family provider present, the thermal fetch succeeds and the
  // GFS provider is still skipped — no cross-family seam from a partial fill.
  gfsFetchCalled = false;
  const ecmwf = fakeProvider({
    id: "openmeteo-api",
    tier: 1,
    modelFamily: "ecmwf",
    supportedVars: THERMAL_GRID.variables,
    points: [POINT_A],
  });

  const merged = await fetchMergedGrid(
    {
      points: [POINT_A],
      variables: THERMAL_GRID.variables,
      required: THERMAL_GRID.required,
      forecastDays: 2,
    },
    { providers: [ecmwf, fakeGfs] },
  );

  assert(gfsFetchCalled === false, "CAPE-less provider stays uncontacted even alongside an eligible one");
  assert(merged.provenance.mixedFamilies === false, "thermal grid is never family-mixed");
  assert(merged.provenance.notes.some(n => n.includes("cape")),
    "provenance explains why the GFS tier was skipped");

  const thermalPoints = merged.points.map(p => THERMAL_GRID.buildPoint(p, merged.time));
  assertEqual(Object.keys(thermalPoints[0].hourly).sort(),
    ["boundary_layer_height", "cape", "dew_point_2m", "shortwave_radiation",
     "soil_moisture_0_to_7cm", "temperature_2m", "time"],
    "ThermalPoint.hourly has exactly the expected key set");
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
