// Airspace conflict check for the thermal map readout. Given a point and an
// altitude (ft AMSL), find the airspace whose floor that altitude busts —
// i.e. climbing to that height would put a pilot inside controlled/restricted
// airspace. Data is the same GeoJSON the XC map uses (GET /api/sites/xc/zones),
// where each feature carries lowerFt/upperFt (ft AMSL, 0 = GND), typeName,
// icaoClass and name.
//
// Floors are treated as ft AMSL, matching the XC map's own comparison. If any
// source sector is actually AGL/flight-level this would be off — spot-check a
// known CTA against the XC map.

// The airspace dataset mixes low ground obstacles (powerlines, towers labelled
// DANGER at 0–100 ft) in with real airspace. A glider thermalling to cloudbase
// isn't "busting airspace" by being above a powerline, so ignore anything whose
// ceiling is below this — real controlled/restricted airspace sits far higher.
const MIN_AIRSPACE_CEILING_FT = 500;

export interface AirspaceConflict {
  name: string;
  icaoClass: string;
  typeName: string;
  lowerFt: number;
  upperFt: number;
  feature: GeoJSON.Feature;
}

/** Ray-cast point-in-ring. Ring coords are GeoJSON [lng, lat]. */
function ringContains(ring: number[][], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Polygon = outer ring minus holes. */
function polygonContains(rings: number[][][], lng: number, lat: number): boolean {
  if (!rings.length || !ringContains(rings[0], lng, lat)) return false;
  for (let k = 1; k < rings.length; k++) {
    if (ringContains(rings[k], lng, lat)) return false; // inside a hole
  }
  return true;
}

function featureContains(f: GeoJSON.Feature, lng: number, lat: number): boolean {
  const g = f.geometry;
  if (!g) return false;
  if (g.type === 'Polygon') return polygonContains(g.coordinates as number[][][], lng, lat);
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).some(p => polygonContains(p, lng, lat));
  return false;
}

/**
 * The most relevant airspace the altitude busts at (lat, lon): the one with the
 * LOWEST floor at or below `altitudeFt` (the first you'd hit climbing). Null when
 * clear. `disabledTypes` skips the same categories the XC map hides by default.
 */
export function airspaceAt(
  lat: number,
  lon: number,
  altitudeFt: number,
  zones: GeoJSON.FeatureCollection | null | undefined,
  disabledTypes?: Set<string>,
): AirspaceConflict | null {
  if (!zones?.features || !Number.isFinite(altitudeFt)) return null;
  let best: AirspaceConflict | null = null;
  for (const f of zones.features) {
    const p: any = f.properties || {};
    if (disabledTypes && disabledTypes.has(p.typeName)) continue;
    const upper = p.upperFt ?? Infinity;
    if (upper < MIN_AIRSPACE_CEILING_FT) continue; // ground obstacle, not airspace
    const lower = p.lowerFt ?? 0;
    if (lower > altitudeFt) continue; // altitude never reaches this floor
    if (f.bbox) {
      const [minLng, minLat, maxLng, maxLat] = f.bbox as number[];
      if (lon < minLng || lon > maxLng || lat < minLat || lat > maxLat) continue;
    }
    if (!featureContains(f, lon, lat)) continue;
    if (!best || lower < best.lowerFt) {
      best = {
        name: String(p.name ?? 'Airspace'),
        icaoClass: String(p.icaoClass ?? ''),
        typeName: String(p.typeName ?? ''),
        lowerFt: lower,
        upperFt: p.upperFt ?? Infinity,
        feature: f,
      };
    }
  }
  return best;
}

/** Title-case an ALL-CAPS aerodrome name: "ADELAIDE/PARAFIELD" → "Adelaide/Parafield". */
function titleCaseName(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, m => m.toUpperCase());
}

/**
 * Short bracket label. Prefers a location-based name over the bare type, since
 * the raw `name` is verbose (e.g. "ARARAT 126.7 VIC (YARA) CERT"):
 *  - classified CTA/CTR (ICAO A–G): "Class C" — the class is the clearest tag
 *  - RMZ:  "ARARAT 126.7 VIC (YARA) CERT"  → "Ararat RMZ"   (name before the freq)
 *  - CTR:  "ADELAIDE CONTROL ZONE (C) [H24]" → "Adelaide CTR"
 *  - CTA:  "SOMEPLACE CTA C1 [H24]"         → "Someplace CTA"
 *  - annotated restricted/prohibited: the descriptive prefix before ':'
 * Falls back to a short raw name, then the type.
 */
export function airspaceLabel(c: { typeName?: string; icaoClass?: string; name?: string }): string {
  const name = (c.name || '').trim();
  if (/^[A-G]$/i.test(c.icaoClass)) return `Class ${c.icaoClass.toUpperCase()}`;

  if (c.typeName === 'RMZ') {
    const loc = name.split(/\s+\d/)[0].trim(); // stop at the first space-then-digit (the frequency)
    return loc ? `${titleCaseName(loc)} RMZ` : 'RMZ';
  }
  if (c.typeName === 'CTR') {
    const loc = name.split(/\bcontrol zone\b/i)[0].trim();
    return loc ? `${titleCaseName(loc)} CTR` : 'CTR';
  }
  if (c.typeName === 'CTA') {
    const loc = name.split(/\bcta\b/i)[0].trim();
    return loc ? `${titleCaseName(loc)} CTA` : 'CTA';
  }
  // Pilot-annotated restricted/prohibited (e.g. "No Fly Zone: Turbine 3"): the
  // descriptive prefix reads as a warning without the site-specific tail.
  const prefix = name.split(':')[0].trim();
  if (prefix && prefix.length <= 22) return prefix;
  if (name && name.length <= 16) return name;
  return c.typeName || 'Airspace';
}

/** One sector in the vertical stack over a point, with its raw altitude datum. */
export interface AirspaceSector {
  name: string;
  typeName: string;
  icaoClass: string;
  lowerFt: number;
  upperFt: number;
  lowerRef: number; // 0 = AGL/SFC, 1 = AMSL (matches siteguideZoneData parseAltitude)
  upperRef: number;
}

/**
 * Every sector containing (lat, lon), floor-first (ground up) — the vertical
 * airspace stack for the "Airspace ON" readout. `disabledTypes` skips the same
 * wide info regions / non-airspace annotations the map hides.
 */
export function airspacesAt(
  lat: number,
  lon: number,
  zones: GeoJSON.FeatureCollection | null | undefined,
  disabledTypes?: Set<string>,
): AirspaceSector[] {
  if (!zones?.features) return [];
  const out: AirspaceSector[] = [];
  for (const f of zones.features) {
    const p: any = f.properties || {};
    if (disabledTypes && disabledTypes.has(p.typeName)) continue;
    if (f.bbox) {
      const [minLng, minLat, maxLng, maxLat] = f.bbox as number[];
      if (lon < minLng || lon > maxLng || lat < minLat || lat > maxLat) continue;
    }
    if (!featureContains(f, lon, lat)) continue;
    out.push({
      name: String(p.name ?? 'Airspace'),
      typeName: String(p.typeName ?? ''),
      icaoClass: String(p.icaoClass ?? ''),
      lowerFt: Number(p.lowerFt ?? 0),
      upperFt: Number(p.upperFt ?? 0),
      lowerRef: Number(p.lowerRef ?? 1),
      upperRef: Number(p.upperRef ?? 1),
    });
  }
  out.sort((a, b) => a.lowerFt - b.lowerFt || a.upperFt - b.upperFt);
  return out;
}
