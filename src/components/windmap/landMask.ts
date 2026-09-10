// Simplified Victoria mainland polygon — [longitude, latitude] pairs.
// Traces the coastline clockwise. Key omissions by design:
//   • Port Phillip Bay: line jumps from Point Lonsdale directly to Point Nepean
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
  // — Jump across The Heads (3 km) to Point Nepean, excluding Port Phillip Bay —
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

// Ray-casting point-in-polygon. Returns true if (lon, lat) is inside Victoria.
export function isOnLand(lon: number, lat: number): boolean {
  const n = VICTORIA_LAND.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = VICTORIA_LAND[i];
    const [xj, yj] = VICTORIA_LAND[j];
    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
