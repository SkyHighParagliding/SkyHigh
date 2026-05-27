// Canonical server-side haversine distance function.
// All haversine implementations across the codebase should import from here
// instead of duplicating the formula.
//
// The formula uses WGS84 mean Earth radius (6371 km).
// Returns distance in kilometers unless `inMeters` is true.

// All server-side compass direction arrays point here.
// Do NOT duplicate ["N", "NNE", ...] in other files.
export const COMPASS_DIRS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];

export function haversineDistance(
  lat1: number, lon1: number, lat2: number, lon2: number,
  opts?: { inMeters?: boolean }
): number {
  const R = opts?.inMeters ? 6371000 : 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
