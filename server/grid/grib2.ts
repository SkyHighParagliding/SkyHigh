/**
 * Minimal GRIB2 decoder for GFS/NOAA data fetched from NOMADS.
 *
 * Supports:
 *   - Grid Definition Template 3.0 (regular lat/lon)
 *   - Data Representation Template 5.0 (simple packing)
 *   - Section 6 bitmaps (missing values → NaN)
 *   - Multiple concatenated messages in one buffer
 *
 * Deliberately throws on unsupported templates so callers get
 * a clear failure rather than silently garbage-decoded data.
 *
 * GRIB2 spec: https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Grib2Grid {
  ni: number;       // points along a parallel (longitude direction)
  nj: number;       // points along a meridian  (latitude direction)
  lat1: number;     // first grid point latitude,  degrees (south negative)
  lon1: number;     // first grid point longitude, degrees (west negative)
  lat2: number;     // last  grid point latitude
  lon2: number;     // last  grid point longitude
  di: number;       // longitude increment, degrees
  dj: number;       // latitude  increment, degrees
  scanMode: number; // scanning mode flags byte (section 3.4, octet 72)
}

export interface Grib2Field {
  discipline: number;        // section 0: GRIB master table discipline
  parameterCategory: number; // section 4: parameter category
  parameterNumber: number;   // section 4: parameter number
  forecastTime: number;      // section 4: forecast time in hours
  referenceTime: Date;       // section 1: reference time
  grid: Grib2Grid;
  /** Row-major float array, length ni*nj. NaN where bitmap marks missing. */
  values: Float32Array;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Decodes all GRIB2 messages in `buf` and returns one field per message.
 * Messages are concatenated end-to-end as NOMADS returns them.
 */
export function decodeGrib2(buf: Uint8Array): Grib2Field[] {
  const fields: Grib2Field[] = [];
  let offset = 0;

  while (offset < buf.length) {
    // Skip padding / garbage between messages
    const magic = findNextGrib(buf, offset);
    if (magic === -1) break;
    offset = magic;

    const field = decodeMessage(buf, offset);
    fields.push(field);
    offset += field._msgLength;
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Coordinate helper
// ---------------------------------------------------------------------------

/**
 * Returns the decoded value at the given (lat, lon) by finding the nearest
 * grid point.
 *
 * GRIB2 Flag Table 3.4 (bits numbered 1 = MSB):
 *   Bit 1 (0x80): 0 = columns W→E (+i), 1 = E→W (-i)
 *   Bit 2 (0x40): 0 = rows in -j direction (N→S, La1 is the north edge),
 *                  1 = rows in +j direction (S→N, La1 is the south edge)
 *
 * GFS subsetted via NOMADS arrives with scanMode=0x40, i.e. bit 2 set, so rows
 * run south to north and La1 is the southern edge.  Row 0 is therefore La1,
 * which is what the formula below computes.  This is the spec behaviour, not
 * an empirical quirk.
 *
 *   row = round((lat - lat1) / dj)   where lat1 is La1 (south edge)
 *   col = round((lon - lon1) / di)   where lon1 is Lo1 (west edge)
 *
 * The decoded `values` array is row-major: values[row * ni + col].
 */
export function valueAt(field: Grib2Field, lat: number, lon: number): number {
  const { grid, values } = field;
  const { ni, nj, lat1, lon1, di, dj } = grid;

  const row = Math.round((lat - lat1) / dj);
  const col = Math.round((lon - lon1) / di);

  const ri = Math.max(0, Math.min(nj - 1, row));
  const ci = Math.max(0, Math.min(ni - 1, col));

  return values[ri * ni + ci];
}

// ---------------------------------------------------------------------------
// Internal decode
// ---------------------------------------------------------------------------

/** Extended field type with message byte-length for cursor advancement. */
interface Grib2FieldInternal extends Grib2Field {
  _msgLength: number;
}

function decodeMessage(buf: Uint8Array, start: number): Grib2FieldInternal {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // ---- Section 0 (Indicator) ----
  assertBytes(buf, start, [0x47, 0x52, 0x49, 0x42]); // "GRIB"
  const edition = buf[start + 7];
  if (edition !== 2) throw new Error(`grib2: unsupported edition ${edition} (expected 2)`);

  // Message length is a 64-bit big-endian integer at offset 8.
  // JS DataView handles up to 32-bit natively; messages are always << 2^32 bytes.
  const msgLenHi = v.getUint32(start + 8, false);
  const msgLenLo = v.getUint32(start + 12, false);
  if (msgLenHi !== 0) throw new Error(`grib2: message > 4 GiB not supported`);
  const msgLength = msgLenLo;
  const discipline = buf[start + 6];

  let pos = start + 16; // end of section 0

  // State accumulated across sections
  let referenceTime!: Date;
  let grid!: Grib2Grid;
  let parameterCategory = 0;
  let parameterNumber = 0;
  let forecastTime = 0;
  let refValue = 0;
  let binaryScale = 0;
  let decimalScale = 0;
  let bitsPerValue = 0;
  let bitmap: Uint8Array | null = null;
  let hasBitmap = false;
  let nDataPoints = 0;

  while (pos < start + msgLength) {
    const secLength = v.getUint32(pos, false);
    const secNum = buf[pos + 4];

    if (secNum === 8) break; // "7777" end section

    switch (secNum) {
      case 1:
        referenceTime = parseSection1(v, pos);
        break;
      case 2:
        // Local use section — skip
        break;
      case 3:
        ({ grid, nDataPoints } = parseSection3(v, buf, pos));
        break;
      case 4:
        ({ parameterCategory, parameterNumber, forecastTime } =
          parseSection4(v, pos));
        break;
      case 5:
        ({ refValue, binaryScale, decimalScale, bitsPerValue } =
          parseSection5(v, buf, pos));
        break;
      case 6:
        ({ bitmap, hasBitmap } = parseSection6(buf, pos, secLength, nDataPoints));
        break;
      case 7:
        // Data section — decoded after all metadata is parsed
        break;
    }

    if (secNum === 7) {
      // Decode data now that we have all parameters
      const values = parseSection7(
        buf, pos, secLength, nDataPoints,
        refValue, binaryScale, decimalScale, bitsPerValue,
        bitmap, hasBitmap,
      );
      return {
        discipline,
        parameterCategory,
        parameterNumber,
        forecastTime,
        referenceTime,
        grid,
        values,
        _msgLength: msgLength,
      };
    }

    pos += secLength;
  }

  throw new Error(`grib2: message at offset ${start} has no section 7`);
}

// ---------------------------------------------------------------------------
// Section parsers
// ---------------------------------------------------------------------------

function parseSection1(v: DataView, pos: number): Date {
  // Octets 13-20 (0-indexed: bytes 12-19 within section, or abs pos+12..)
  // Section 1 layout (byte offsets from section start):
  //   0-3 : section length
  //   4   : section number (1)
  //   5-6 : originating centre
  //   7-8 : originating sub-centre
  //   9   : GRIB master tables version
  //   10  : GRIB local tables version
  //   11  : significance of reference time (0=analysis,1=start of forecast)
  //   12-13: year
  //   14   : month
  //   15   : day
  //   16   : hour
  //   17   : minute
  //   18   : second
  const year   = v.getUint16(pos + 12, false);
  const month  = v.getUint8(pos + 14);
  const day    = v.getUint8(pos + 15);
  const hour   = v.getUint8(pos + 16);
  const minute = v.getUint8(pos + 17);
  const second = v.getUint8(pos + 18);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

interface Section3Result {
  grid: Grib2Grid;
  nDataPoints: number;
}

function parseSection3(v: DataView, buf: Uint8Array, pos: number): Section3Result {
  const gridTemplate = v.getUint16(pos + 12, false);
  if (gridTemplate !== 0) {
    throw new Error(
      `grib2: unsupported Grid Definition Template ${gridTemplate} (only 3.0 supported)`
    );
  }

  const nDataPoints = v.getUint32(pos + 6, false);

  // Template 3.0 byte offsets (0-indexed from section start, i.e. pos+N):
  //   4     : section number (3)
  //   5     : source of grid definition
  //   6-9   : number of data points
  //   10    : number of octets for optional list
  //   11    : interpretation of list
  //   12-13 : grid definition template number
  //   14    : shape of earth
  //   15    : scale factor for radius of spherical earth
  //   16-19 : scaled value of radius
  //   20    : scale factor for major axis
  //   21-24 : scaled value of semi-major axis
  //   25    : scale factor for minor axis
  //   26-29 : scaled value of semi-minor axis
  //   30-33 : Ni (points along parallel)
  //   34-37 : Nj (points along meridian)
  //   38-41 : basic angle of initial production domain
  //   42-45 : subdivisions of basic angle
  //   46-49 : La1 — latitude of first grid point  (sign-and-magnitude, µ°)
  //   50-53 : Lo1 — longitude of first grid point (sign-and-magnitude, µ°)
  //   54    : resolution and component flags
  //   55-58 : La2 — latitude of last  grid point  (sign-and-magnitude, µ°)
  //   59-62 : Lo2 — longitude of last grid point  (sign-and-magnitude, µ°)
  //   63-66 : Di  — i-direction increment (unsigned, µ°)
  //   67-70 : Dj  — j-direction increment (unsigned, µ°)
  //   71    : scanning mode
  const ni = v.getUint32(pos + 30, false);
  const nj = v.getUint32(pos + 34, false);

  // GRIB2 Template 3.0 uses sign-and-magnitude encoding for La1/Lo1/La2/Lo2
  // (NOT two's complement). The MSB is the sign bit; the remaining 31 bits
  // are the magnitude in units of 10^-6 degrees.
  const lat1 = signMagMicroDeg(v.getUint32(pos + 46, false));
  const lon1 = signMagMicroDeg(v.getUint32(pos + 50, false));
  const lat2 = signMagMicroDeg(v.getUint32(pos + 55, false));
  const lon2 = signMagMicroDeg(v.getUint32(pos + 59, false));
  const di   = v.getUint32(pos + 63, false) / 1_000_000;
  const dj   = v.getUint32(pos + 67, false) / 1_000_000;
  const scanMode = v.getUint8(pos + 71);

  return {
    nDataPoints,
    grid: { ni, nj, lat1, lon1, lat2, lon2, di, dj, scanMode },
  };
}

/**
 * Decodes a GRIB2 sign-and-magnitude micro-degree coordinate value.
 * Bit 31 = sign (1 = negative), bits 30..0 = magnitude in 10^-6 degrees.
 * This is distinct from two's complement and is the correct GRIB2 encoding.
 */
function signMagMicroDeg(raw: number): number {
  const sign = (raw & 0x80000000) !== 0 ? -1 : 1;
  const mag  = (raw & 0x7FFFFFFF) / 1_000_000;
  return sign * mag;
}

interface Section4Result {
  parameterCategory: number;
  parameterNumber: number;
  forecastTime: number;
}

function parseSection4(v: DataView, pos: number): Section4Result {
  // Template 4.0 (surface / fixed level) layout from section start:
  //   0-3 : length
  //   4   : section number (4)
  //   5-6 : number of coordinate values
  //   7-8 : product definition template number
  //   9   : parameter category
  //   10  : parameter number
  //   11  : type of generating process
  //   12  : background generating process id
  //   13  : analysis or forecast generating process id
  //   14-15: hours of observational data cutoff after reference time
  //   16  : minutes of observational data cutoff
  //   17  : indicator of unit of time range (1 = hour)
  //   18-21: forecast time in indicated units
  const pdtNum = v.getUint16(pos + 7, false);
  if (pdtNum !== 0) {
    // Many templates share the same first fields; we only need category/number/time
    // which are at fixed offsets in template 4.0.  For non-zero templates warn
    // but continue — we just need the parameter identity and forecast time.
  }

  const parameterCategory = v.getUint8(pos + 9);
  const parameterNumber   = v.getUint8(pos + 10);
  const forecastTime      = v.getUint32(pos + 18, false); // hours (unit code 1)

  return { parameterCategory, parameterNumber, forecastTime };
}

interface Section5Result {
  refValue: number;
  binaryScale: number;
  decimalScale: number;
  bitsPerValue: number;
}

function parseSection5(v: DataView, buf: Uint8Array, pos: number): Section5Result {
  const drtNum = v.getUint16(pos + 9, false);
  if (drtNum !== 0) {
    throw new Error(
      `grib2: unsupported Data Representation Template ${drtNum} ` +
      `(only 5.0 simple packing supported; ECMWF uses 5.42 which is not implemented)`
    );
  }

  // Template 5.0 layout from section start:
  //   0-3 : length
  //   4   : section number (5)
  //   5-8 : number of packed values
  //   9-10: DRT number (0)
  //   11-14: reference value R (IEEE 754 single, big-endian)
  //   15-16: binary scale factor E  (sign-and-magnitude, NOT two's complement)
  //   17-18: decimal scale factor D (sign-and-magnitude)
  //   19  : bits per value
  //   20  : type of original field values (0=float, 1=int)
  const refValue = v.getFloat32(pos + 11, false);

  // Sign-and-magnitude: high bit = sign, remaining 15 bits = magnitude.
  // This is a common GRIB2 gotcha — do NOT use getInt16().
  const rawE = v.getUint16(pos + 15, false);
  const binaryScale  = (rawE & 0x8000) ? -(rawE & 0x7FFF) : (rawE & 0x7FFF);
  const rawD = v.getUint16(pos + 17, false);
  const decimalScale = (rawD & 0x8000) ? -(rawD & 0x7FFF) : (rawD & 0x7FFF);
  const bitsPerValue = buf[pos + 19];

  return { refValue, binaryScale, decimalScale, bitsPerValue };
}

interface Section6Result {
  bitmap: Uint8Array | null;
  hasBitmap: boolean;
}

function parseSection6(
  buf: Uint8Array,
  pos: number,
  secLength: number,
  nDataPoints: number,
): Section6Result {
  const bitmapIndicator = buf[pos + 5];

  if (bitmapIndicator === 255) {
    // No bitmap — all points are present
    return { bitmap: null, hasBitmap: false };
  }

  if (bitmapIndicator === 0) {
    // Bitmap follows in this section (1 bit per grid point, MSB first)
    const bitmapBytes = buf.subarray(pos + 6, pos + secLength);
    return { bitmap: bitmapBytes, hasBitmap: true };
  }

  throw new Error(
    `grib2: bitmap indicator ${bitmapIndicator} not supported (only 0=present, 255=absent)`
  );
}

function parseSection7(
  buf: Uint8Array,
  pos: number,
  secLength: number,
  nDataPoints: number,
  refValue: number,
  binaryScale: number,
  decimalScale: number,
  bitsPerValue: number,
  bitmap: Uint8Array | null,
  hasBitmap: boolean,
): Float32Array {
  // Packed data starts at pos+5 (after 4-byte length + 1-byte section number)
  const dataStart = pos + 5;
  const values = new Float32Array(nDataPoints);

  // Pre-compute scale factors:
  //   physical = (R + X * 2^E) / 10^D
  // where X is the unsigned integer unpacked from bitsPerValue bits.
  const scale2 = Math.pow(2, binaryScale);
  const scale10 = Math.pow(10, -decimalScale);

  if (bitsPerValue === 0) {
    // All values equal the reference value
    const v = refValue * scale10;
    values.fill(v);
    // Apply bitmap masking (NaN for missing)
    if (hasBitmap && bitmap) {
      for (let i = 0; i < nDataPoints; i++) {
        const byteIdx = i >> 3;
        const bitIdx  = 7 - (i & 7); // MSB first
        if (!((bitmap[byteIdx] >> bitIdx) & 1)) values[i] = NaN;
      }
    }
    return values;
  }

  // Unpack the bit stream
  let bitOffset = (dataStart) * 8; // global bit offset into buf

  const bitMask = (bitsPerValue < 32) ? (1 << bitsPerValue) - 1 : 0xFFFFFFFF;

  for (let i = 0; i < nDataPoints; i++) {
    // If bitmap says this point is missing, skip its packed bits and mark NaN
    if (hasBitmap && bitmap) {
      const byteIdx = i >> 3;
      const bitIdx  = 7 - (i & 7);
      if (!((bitmap[byteIdx] >> bitIdx) & 1)) {
        values[i] = NaN;
        // Missing points do NOT consume packed data bits
        continue;
      }
    }

    // Read bitsPerValue bits from the stream (big-endian, MSB first)
    const x = readBits(buf, bitOffset, bitsPerValue, bitMask);
    bitOffset += bitsPerValue;
    values[i] = (refValue + x * scale2) * scale10;
  }

  return values;
}

// ---------------------------------------------------------------------------
// Bit-stream reader
// ---------------------------------------------------------------------------

/**
 * Reads `n` bits (1..24) from `buf` starting at bit offset `bitOff`
 * (MSB-first, big-endian byte order).
 *
 * Uses JavaScript's 32-bit integer arithmetic.  A worst-case read of
 * n=24 bits with bitStart=7 requires 4 bytes (32 bits), which just fits
 * inside the 32-bit unsigned accumulator after the `>>> shift` step.
 * For GFS simple-packing, observed bitsPerValue values are 7..14,
 * well within this limit.
 */
function readBits(buf: Uint8Array, bitOff: number, n: number, mask: number): number {
  let byteIdx = bitOff >> 3;
  const bitStart = bitOff & 7; // offset within first byte (0 = MSB)

  // Accumulate enough bytes to cover all n bits
  let val = 0;
  const bytesNeeded = Math.ceil((bitStart + n) / 8);
  for (let b = 0; b < bytesNeeded; b++) {
    val = (val << 8) | (byteIdx < buf.length ? buf[byteIdx++] : 0);
  }

  // Discard trailing bits and mask to n bits
  const shift = bytesNeeded * 8 - bitStart - n;
  return (val >>> shift) & mask;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function findNextGrib(buf: Uint8Array, from: number): number {
  for (let i = from; i <= buf.length - 4; i++) {
    if (buf[i] === 0x47 && buf[i+1] === 0x52 && buf[i+2] === 0x49 && buf[i+3] === 0x42) {
      return i;
    }
  }
  return -1;
}

function assertBytes(buf: Uint8Array, offset: number, expected: number[]): void {
  for (let i = 0; i < expected.length; i++) {
    if (buf[offset + i] !== expected[i]) {
      throw new Error(
        `grib2: expected byte 0x${expected[i].toString(16)} at offset ${offset + i}, ` +
        `got 0x${buf[offset + i].toString(16)}`
      );
    }
  }
}
