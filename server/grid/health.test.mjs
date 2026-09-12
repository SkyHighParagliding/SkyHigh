/**
 * Tests for grid health classification.
 *
 *   node --import tsx/esm server/grid/health.test.mjs
 *
 * This is the logic that decides whether anyone gets emailed, so the cases that
 * matter most are the ones that must stay quiet: a rate-limited tier 1 is
 * completely normal and must never alert.
 */

import { classifyGridHealth } from "./health.ts";

let passed = 0;
let failed = 0;

function check(name, cond) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
}

function provenance(bySource, extra = {}) {
  const supplied = bySource.reduce((n, s) => n + s.points, 0);
  return {
    bySource,
    missing: 0,
    requested: supplied,
    mixedFamilies: false,
    notes: [],
    ...extra,
  };
}

const API = { source: "openmeteo-api", label: "Open-Meteo API (ECMWF IFS HRES)", points: 1000 };
const S3_ECMWF = { source: "openmeteo-s3-ecmwf", label: "Open-Meteo S3 archive (ECMWF IFS HRES 9 km)", points: 1263 };
const S3_GFS = { source: "openmeteo-s3-gfs", label: "Open-Meteo S3 archive (NCEP GFS)", points: 400 };
const NOMADS = { source: "nomads-gfs", label: "NOAA NOMADS GFS 0.25°", points: 120 };

console.log("\nTEST 1: healthy — everything from ECMWF");
{
  const h = classifyGridHealth(provenance([API, S3_ECMWF]));
  check("severity is ok", h.severity === "ok");
  check("no fallback sources listed", h.fallbackSources.length === 0);
}

console.log("\nTEST 2: tier 1 rate-limited, tier 2 covered it — still healthy");
{
  // The everyday case in production. Tier 2 is the same model at the same
  // resolution, so this must never alert.
  const h = classifyGridHealth(provenance([{ ...API, points: 0 }, { ...S3_ECMWF, points: 2263 }]));
  check("severity is ok", h.severity === "ok");
  check("a zero-point source is not treated as a contributor", h.fallbackSources.length === 0);
}

console.log("\nTEST 3: S3 GFS contributed — degraded, no email");
{
  const h = classifyGridHealth(provenance([API, S3_ECMWF, S3_GFS]));
  check("severity is degraded", h.severity === "degraded");
  check("GFS source is reported", h.fallbackSources.some(s => s.source === "openmeteo-s3-gfs"));
  check("ECMWF sources are not listed as fallbacks", !h.fallbackSources.some(s => s.source.includes("ecmwf")));
  check("summary names the cause", h.summary.includes("GFS fallback"));
}

console.log("\nTEST 4: NOMADS contributed — critical");
{
  const h = classifyGridHealth(provenance([API, S3_ECMWF, NOMADS]));
  check("severity is critical", h.severity === "critical");
  check("summary names NOMADS", h.summary.includes("NOMADS"));
  check("tier is resolved for the email body", h.fallbackSources[0].tier === 4);
}

console.log("\nTEST 5: NOMADS alone — critical, not merely degraded");
{
  const h = classifyGridHealth(provenance([NOMADS]));
  check("severity is critical", h.severity === "critical");
}

console.log("\nTEST 6: both GFS tiers — critical wins over degraded");
{
  const h = classifyGridHealth(provenance([S3_GFS, NOMADS]));
  check("severity is critical", h.severity === "critical");
  check("both fallback sources are reported", h.fallbackSources.length === 2);
}

console.log("\nTEST 7: a NOMADS entry that supplied nothing must not alert");
{
  // The orchestrator records sources it tried. Contributing zero points is not
  // a fallback — alerting on it would cry wolf on every run that merely probed.
  const h = classifyGridHealth(provenance([S3_ECMWF, { ...NOMADS, points: 0 }]));
  check("severity is ok", h.severity === "ok");
}

console.log("\nTEST 8: missing provenance does not throw");
{
  const h = classifyGridHealth(undefined);
  check("severity is ok", h.severity === "ok");
  check("summary explains why", h.summary.includes("no provenance"));
}

console.log("\n" + "─".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log("All tests passed.");
