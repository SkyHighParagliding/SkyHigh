// Simplified Victoria mainland polygon — [longitude, latitude] pairs.
// Traces the coastline clockwise. Key omissions by design:
//   • Port Phillip Bay: line jumps from Point Lonsdale directly to Point Nepean
//     (bay is then subtracted via PORT_PHILLIP_BAY polygon below)
//   • Western Port Bay: line jumps from Flinders to Inverloch
//   • Bass Strait / ocean: everything south of the south coast is outside
// Resolution is adequate for the 0.09–0.15° thermal grid (~10–15 km cells).
const VICTORIA_LAND: [number, number][] = [
  [140.96, -33.98], // SA border north
  [140.96, -38.08], // SA border south
  [141.00, -38.13],
  [141.61, -38.34], // Portland
  [142.10, -38.57],
  [142.48, -38.62], // Warrnambool area
  [143.05, -38.73],
  [143.52, -38.86], // Cape Otway
  [143.83, -38.73],
  [144.15, -38.47], // Lorne
  [144.37, -38.33],
  [144.55, -38.27], // Barwon Heads
  [144.67, -38.27], // Point Lonsdale (west side of The Heads)
  // — Jump across The Heads to Point Nepean; bay water excluded by PORT_PHILLIP_BAY below —
  [144.73, -38.51], // Point Nepean (tip of Mornington Peninsula)
  [144.88, -38.52], // Cape Schanck
  [145.00, -38.48], // Flinders (outer Mornington Peninsula)
  // — Jump from Flinders to Inverloch, excluding Western Port Bay + Phillip Island —
  [145.72, -38.62], // Inverloch / Cape Paterson
  [146.18, -38.71], // Venus Bay
  [146.40, -39.14], // Wilsons Promontory (south tip)
  [146.75, -38.82],
  [147.05, -38.58],
  [147.38, -38.20],
  [147.80, -37.88],
  [148.30, -37.71],
  [148.70, -37.60],
  [149.00, -37.56],
  [149.40, -37.56],
  [149.98, -37.53], // NSW border coast
  [149.98, -33.98], // NSW border north
  // Close back to SA border north via the Murray River (north boundary)
];

// Port Phillip Bay outline — traced clockwise from Point Lonsdale.
// Any point inside this polygon is bay water, not land.
const PORT_PHILLIP_BAY: [number, number][] = [
  [144.67, -38.27], // Point Lonsdale (west entrance / The Heads)
  [144.66, -38.24], // Queenscliff
  [144.72, -38.17], // St Leonards
  [144.65, -38.12], // Portarlington
  [144.52, -38.09], // Edwards Point
  [144.42, -38.13], // Point Henry / Geelong South
  [144.38, -38.12], // Geelong / Rippleside
  [144.38, -38.07], // North Geelong
  [144.43, -37.97], // Lara / Little River area
  [144.55, -37.94], // Werribee South
  [144.65, -37.93], // Werribee coast
  [144.80, -37.88], // Altona / Laverton
  [144.88, -37.86], // Williamstown
  [144.97, -37.86], // Port Melbourne / Docklands
  [145.03, -37.88], // St Kilda
  [145.08, -37.95], // Brighton / Mentone
  [145.12, -38.05], // Aspendale / Edithvale
  [145.14, -38.13], // Frankston
  [145.08, -38.22], // Mornington
  [145.01, -38.29], // Mount Martha
  [144.90, -38.36], // Rosebud
  [144.83, -38.40], // Rye
  [144.76, -38.38], // Sorrento
  [144.74, -38.34], // Portsea
  [144.73, -38.51], // Point Nepean (east entrance / The Heads)
  // Close back to Point Lonsdale via The Heads (3 km open-water gap)
];

// Tasmania mainland — traced clockwise from Cape Grim. Bass Strait, the
// D'Entrecasteaux Channel and the deeper harbours are all outside; at 0.09°
// (~10 km) cells there is no point resolving them.
const TASMANIA_LAND: [number, number][] = [
  [144.70, -40.68], // Cape Grim (NW tip)
  [145.30, -40.77], // Stanley
  [145.90, -41.05], // Burnie
  [146.35, -41.15], // Devonport
  [146.82, -41.05], // Tamar Heads
  [147.40, -40.85], // Bridport
  [147.97, -40.75], // Cape Portland (NE tip)
  [148.35, -41.00], // Eddystone Point
  [148.30, -41.30], // St Helens
  [148.30, -41.87], // Bicheno
  [148.30, -42.15], // Freycinet
  [147.95, -42.50], // Triabunna
  [148.00, -43.02], // Tasman Peninsula
  [147.40, -43.15], // Storm Bay / Bruny
  [146.82, -43.64], // South East Cape
  [146.00, -43.58], // South West Cape
  [145.90, -43.30], // Port Davey
  [145.20, -42.30], // Macquarie Harbour
  [145.30, -42.10], // Strahan
  [144.95, -41.85], // Granville Harbour
  [144.70, -41.30], // Temma
  [144.65, -40.90], // West Point
];

// Bass Strait islands. Small, but they carry real flying sites and without them
// the overlay would show open water where the server has data.
const KING_ISLAND: [number, number][] = [
  [143.85, -39.57], [144.12, -39.65], [144.10, -40.05], [143.85, -40.10],
];

const FLINDERS_ISLAND: [number, number][] = [
  [147.90, -39.70], [148.30, -39.75], [148.35, -40.20], [147.95, -40.20],
];

const LAND_RINGS: [number, number][][] = [
  VICTORIA_LAND, TASMANIA_LAND, KING_ISLAND, FLINDERS_ISLAND,
];

function isInsidePolygon(poly: [number, number][], lon: number, lat: number): boolean {
  const n = poly.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Returns true if (lon, lat) is on land covered by the grid (not ocean or bay
// water). Must stay in step with the coverage rings in server/utils/gridTiles.ts
// — anything the server fetches but this rejects is erased before it is drawn.
export function isOnLand(lon: number, lat: number): boolean {
  if (!LAND_RINGS.some(ring => isInsidePolygon(ring, lon, lat))) return false;
  if (isInsidePolygon(PORT_PHILLIP_BAY, lon, lat)) return false;
  return true;
}
