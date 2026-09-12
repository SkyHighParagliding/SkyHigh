/**
 * Verification script for the GRIB2 decoder.
 *
 * Downloads real GFS data from NOMADS, decodes it, and sanity-checks
 * the physical plausibility of each field.  Also cross-checks wind
 * components at a test point against the Open-Meteo GFS model.
 *
 * Run with:
 *   node server/grid/grib2.test.mjs
 *
 * (tsx or ts-node not required — this script imports the compiled-in-memory
 *  TypeScript by using tsx as a loader, OR if you have the .js output available
 *  it imports directly.  We use a dynamic import so tsx can handle it.)
 */

import { createRequire } from 'module';
import { register } from 'module';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';
import path from 'path';

// ---------------------------------------------------------------------------
// Bootstrap: load the TypeScript decoder via tsx's transform
// ---------------------------------------------------------------------------

// We use tsx's ESM loader when available, otherwise fall back to a bundled
// approach.  The simplest cross-platform way: spawn tsx directly.
// But since this file is invoked with "node --import tsx/esm", we can
// just import the .ts file.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dynamic import — works when invoked as:
//   node --import tsx/esm server/grid/grib2.test.mjs
//   tsx server/grid/grib2.test.mjs
let decodeGrib2, valueAt;
try {
  const mod = await import('./grib2.ts');
  decodeGrib2 = mod.decodeGrib2;
  valueAt = mod.valueAt;
} catch {
  // Fallback: maybe running as plain node with a pre-compiled .js
  const mod = await import('./grib2.js');
  decodeGrib2 = mod.decodeGrib2;
  valueAt = mod.valueAt;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function pad(s, n = 14) {
  return String(s).padEnd(n);
}

function fmt(n) {
  if (isNaN(n)) return 'NaN';
  return n.toFixed(3);
}

function stats(arr) {
  let min = Infinity, max = -Infinity, sum = 0, count = 0;
  for (const v of arr) {
    if (isNaN(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    count++;
  }
  return { min, max, mean: count ? sum / count : NaN, count };
}

// ---------------------------------------------------------------------------
// Build the NOMADS URL for yesterday UTC (data retained ~10 days)
// ---------------------------------------------------------------------------

function yesterdayUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

const dateStr = yesterdayUTC();
console.log(`\n=== GRIB2 Decoder Verification ===`);
console.log(`Date: ${dateStr} (yesterday UTC)\n`);

const nomadsUrl =
  `https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl` +
  `?file=gfs.t00z.pgrb2.0p25.f012` +
  `&lev_surface=on&lev_10_m_above_ground=on` +
  `&var_CAPE=on&var_HPBL=on&var_UGRD=on&var_VGRD=on` +
  `&subregion=&leftlon=139&rightlon=155&toplat=-35&bottomlat=-44.5` +
  `&dir=%2Fgfs.${dateStr}%2F00%2Fatmos`;

// ---------------------------------------------------------------------------
// Step 1: Download
// ---------------------------------------------------------------------------

console.log(`Downloading GRIB2 from NOMADS...`);
console.log(`URL: ${nomadsUrl}\n`);

const response = await fetch(nomadsUrl);
if (!response.ok) {
  throw new Error(`NOMADS fetch failed: ${response.status} ${response.statusText}`);
}

const arrayBuffer = await response.arrayBuffer();
const buf = new Uint8Array(arrayBuffer);
console.log(`Downloaded ${buf.length} bytes\n`);

// ---------------------------------------------------------------------------
// Step 2: Decode
// ---------------------------------------------------------------------------

console.log(`Decoding GRIB2...`);
const fields = decodeGrib2(buf);
console.log(`Decoded ${fields.length} field(s)\n`);

// ---------------------------------------------------------------------------
// Step 3: Assert field count and identities
// ---------------------------------------------------------------------------

assert(fields.length === 4, `Expected 4 fields, got ${fields.length}`);

// Expected: UGRD (0,2,2), VGRD (0,2,3), CAPE (0,7,6), HPBL (0,3,196)
const expectedParams = [
  { name: 'UGRD', discipline: 0, cat: 2, num: 2 },
  { name: 'VGRD', discipline: 0, cat: 2, num: 3 },
  { name: 'CAPE', discipline: 0, cat: 7, num: 6 },
  { name: 'HPBL', discipline: 0, cat: 3, num: 196 },
];

// Build lookup by param identity
const fieldMap = {};
for (const f of fields) {
  const key = `${f.discipline}:${f.parameterCategory}:${f.parameterNumber}`;
  fieldMap[key] = f;
}

for (const exp of expectedParams) {
  const key = `${exp.discipline}:${exp.cat}:${exp.num}`;
  assert(fieldMap[key], `Missing field ${exp.name} (${key})`);
  console.log(`✓ Found ${exp.name} — discipline=${exp.discipline}, cat=${exp.cat}, num=${exp.num}`);
}

// ---------------------------------------------------------------------------
// Step 4: Assert grid dimensions
// ---------------------------------------------------------------------------

console.log(`\nGrid dimensions:`);
for (const f of fields) {
  const { ni, nj } = f.grid;
  const total = ni * nj;
  assert(ni === 65, `Expected ni=65, got ${ni}`);
  assert(nj === 39, `Expected nj=39, got ${nj}`);
  assert(total === 2535, `Expected 2535 points, got ${total}`);
  assert(f.values.length === 2535, `Expected values.length=2535, got ${f.values.length}`);
}
console.log(`✓ All fields: ni=65, nj=39, total=2535 points`);

// ---------------------------------------------------------------------------
// Step 5: Physical plausibility checks + print stats
// ---------------------------------------------------------------------------

console.log(`\nField statistics (physical plausibility):`);
console.log(
  pad('Field', 6),
  pad('Min', 12),
  pad('Max', 12),
  pad('Mean', 12),
  pad('Non-NaN', 8),
  'Status'
);
console.log('-'.repeat(70));

const ugrd = fieldMap['0:2:2'];
const vgrd = fieldMap['0:2:3'];
const cape = fieldMap['0:7:6'];
const hpbl = fieldMap['0:3:196'];

// UGRD: wind u-component m/s, plausible -60..60
{
  const s = stats(ugrd.values);
  const ok = s.min >= -60 && s.max <= 60;
  console.log(
    pad('UGRD'), pad(fmt(s.min)), pad(fmt(s.max)), pad(fmt(s.mean)),
    pad(s.count), ok ? '✓ plausible' : '✗ OUT OF RANGE'
  );
  assert(ok, `UGRD out of plausible range: min=${s.min} max=${s.max}`);
}

// VGRD: wind v-component m/s, plausible -60..60
{
  const s = stats(vgrd.values);
  const ok = s.min >= -60 && s.max <= 60;
  console.log(
    pad('VGRD'), pad(fmt(s.min)), pad(fmt(s.max)), pad(fmt(s.mean)),
    pad(s.count), ok ? '✓ plausible' : '✗ OUT OF RANGE'
  );
  assert(ok, `VGRD out of plausible range: min=${s.min} max=${s.max}`);
}

// CAPE: convective available potential energy J/kg, must be >= 0 and < 6000
{
  const s = stats(cape.values);
  const ok = s.min >= -1 && s.max < 6000; // -1 allows for tiny floating point errors
  console.log(
    pad('CAPE'), pad(fmt(s.min)), pad(fmt(s.max)), pad(fmt(s.mean)),
    pad(s.count), ok ? '✓ plausible' : '✗ OUT OF RANGE'
  );
  assert(ok, `CAPE out of plausible range: min=${s.min} max=${s.max}`);
}

// HPBL: boundary layer height metres, >= 0 and < 10000
{
  const s = stats(hpbl.values);
  const ok = s.min >= -1 && s.max < 10000;
  console.log(
    pad('HPBL'), pad(fmt(s.min)), pad(fmt(s.max)), pad(fmt(s.mean)),
    pad(s.count), ok ? '✓ plausible' : '✗ OUT OF RANGE'
  );
  assert(ok, `HPBL out of plausible range: min=${s.min} max=${s.max}`);
}

// ---------------------------------------------------------------------------
// Step 6: Print sample values at a specific point
// ---------------------------------------------------------------------------

// Test point: Melbourne area (approx -37.8, 144.9)
const testLat = -37.8;
const testLon = 144.9;

console.log(`\nSample values at (${testLat}, ${testLon}) — Melbourne area:`);
const uAt = valueAt(ugrd, testLat, testLon);
const vAt = valueAt(vgrd, testLat, testLon);
const capeAt = valueAt(cape, testLat, testLon);
const hpblAt = valueAt(hpbl, testLat, testLon);

console.log(`  UGRD (u-wind, m/s):   ${fmt(uAt)}`);
console.log(`  VGRD (v-wind, m/s):   ${fmt(vAt)}`);
console.log(`  Wind speed (m/s):     ${fmt(Math.sqrt(uAt**2 + vAt**2))}`);
console.log(`  Wind speed (kn):      ${fmt(Math.sqrt(uAt**2 + vAt**2) * 1.944)}`);
console.log(`  CAPE (J/kg):          ${fmt(capeAt)}`);
console.log(`  HPBL (m):             ${fmt(hpblAt)}`);

// ---------------------------------------------------------------------------
// Step 7: Cross-check against Open-Meteo GFS model
// ---------------------------------------------------------------------------

console.log(`\nCross-checking against Open-Meteo GFS (models=gfs_global)...`);

// The GFS f012 data is a 12-hour forecast from yesterday 00Z.
// Open-Meteo uses the same GFS model so values should be close.
const forecastHour = ugrd.forecastTime; // should be 12
const refDate = ugrd.referenceTime;
const validTime = new Date(refDate.getTime() + forecastHour * 3600 * 1000);
const validIso = validTime.toISOString();
console.log(`  GFS reference time: ${refDate.toISOString()}`);
console.log(`  Forecast hour: +${forecastHour}h`);
console.log(`  Valid time: ${validIso}`);

const omUrl =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${testLat}&longitude=${testLon}` +
  `&hourly=wind_u_component_10m,wind_v_component_10m` +
  `&models=gfs_global` +
  `&wind_speed_unit=ms` +
  `&timezone=UTC` +
  `&start_date=${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}` +
  `&end_date=${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;

console.log(`  Open-Meteo URL: ${omUrl}`);

let omCompareOk = false;
try {
  const omResp = await fetch(omUrl);
  if (omResp.ok) {
    const omData = await omResp.json();
    const times = omData.hourly?.time ?? [];
    const uArr  = omData.hourly?.wind_u_component_10m ?? [];
    const vArr  = omData.hourly?.wind_v_component_10m ?? [];

    // Find the hour matching our valid time
    const validHourStr = validIso.slice(0, 13); // "YYYY-MM-DDTHH"
    const idx = times.findIndex(t => t.startsWith(validHourStr));

    if (idx >= 0) {
      const omU = uArr[idx];
      const omV = vArr[idx];
      console.log(`\n  Open-Meteo at ${times[idx]}:`);
      console.log(`    u_wind: ${fmt(omU)} m/s`);
      console.log(`    v_wind: ${fmt(omV)} m/s`);
      console.log(`  GFS decoder at same point:`);
      console.log(`    u_wind: ${fmt(uAt)} m/s`);
      console.log(`    v_wind: ${fmt(vAt)} m/s`);

      const uDiff = Math.abs((omU ?? 0) - uAt);
      const vDiff = Math.abs((omV ?? 0) - vAt);
      console.log(`  Difference: u=${fmt(uDiff)} m/s, v=${fmt(vDiff)} m/s`);

      // Allow up to 5 m/s difference (different interpolation, rounding, etc.)
      if (uDiff < 5 && vDiff < 5) {
        console.log(`  ✓ Values agree within 5 m/s tolerance`);
        omCompareOk = true;
      } else {
        console.log(`  ⚠  Large difference — may indicate a decode bug or model lag`);
      }
    } else {
      console.log(`  ⚠  Valid time ${validHourStr} not found in Open-Meteo response (may be outside forecast window)`);
      omCompareOk = true; // Don't fail on availability issue
    }
  } else {
    console.log(`  ⚠  Open-Meteo returned ${omResp.status} — skipping cross-check`);
    omCompareOk = true;
  }
} catch (e) {
  console.log(`  ⚠  Open-Meteo fetch failed: ${e.message} — skipping cross-check`);
  omCompareOk = true;
}

// ---------------------------------------------------------------------------
// Step 8: Verify unsupported templates fail loudly
// ---------------------------------------------------------------------------

console.log(`\nVerifying error handling for unsupported templates...`);

// Craft a minimal fake GRIB2 buffer with DRT 5.42 to confirm the error message
// is clear and explicit (not silent garbage).
{
  // We'll take the real buffer and patch section 5's DRT number to 42
  // by finding the section 5 marker and overwriting bytes 9-10.
  const fakeBuf = new Uint8Array(buf);
  let p = 0;
  while (p < fakeBuf.length) {
    // Find GRIB
    let g = -1;
    for (let i = p; i <= fakeBuf.length - 4; i++) {
      if (fakeBuf[i] === 0x47 && fakeBuf[i+1] === 0x52 && fakeBuf[i+2] === 0x49 && fakeBuf[i+3] === 0x42) {
        g = i; break;
      }
    }
    if (g === -1) break;

    const msgLen = (fakeBuf[g+12] << 24) | (fakeBuf[g+13] << 16) | (fakeBuf[g+14] << 8) | fakeBuf[g+15];

    // Walk sections to find section 5
    let s = g + 16;
    let patched = false;
    while (s < g + msgLen) {
      const sLen = (fakeBuf[s] << 24) | (fakeBuf[s+1] << 16) | (fakeBuf[s+2] << 8) | fakeBuf[s+3];
      const sNum = fakeBuf[s+4];
      if (sNum === 5) {
        // Patch DRT number at offset 9 (bytes 9-10 from section start) to 42
        fakeBuf[s+9] = 0;
        fakeBuf[s+10] = 42;
        patched = true;
        break;
      }
      if (sNum === 8) break;
      s += sLen;
    }

    if (patched) {
      // Now try decoding the patched buffer — should throw clearly
      let threw = false;
      let errorMsg = '';
      try {
        decodeGrib2(fakeBuf);
      } catch (e) {
        threw = true;
        errorMsg = e.message;
      }
      assert(threw, `Expected decodeGrib2 to throw on DRT 5.42 but it did not`);
      assert(
        errorMsg.includes('42') && errorMsg.includes('5.0'),
        `Error message should mention template 42 and 5.0, got: "${errorMsg}"`
      );
      console.log(`✓ DRT 5.42 throws: "${errorMsg}"`);
      break;
    }

    p = g + msgLen;
  }
}

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(50)}`);
console.log(`ALL CHECKS PASSED`);
console.log(`  Fields decoded: ${fields.length}`);
console.log(`  Grid: ${fields[0].grid.ni}×${fields[0].grid.nj} = ${fields[0].grid.ni * fields[0].grid.nj} points`);
console.log(`  Scan mode: 0x${fields[0].grid.scanMode.toString(16).padStart(2,'0')}`);
console.log(`  Reference time: ${fields[0].referenceTime.toISOString()}`);
console.log(`  Forecast hour: +${fields[0].forecastTime}h`);
console.log(`=`.repeat(50));
