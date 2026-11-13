import { fromZonedTime } from "date-fns-tz";
import { fetchWithRetry } from "./weather-utils.js";
import createLogger from "./utils/logger.js";

const log = createLogger("bom-weather");

export interface BomStation {
  productCode: string;
  stationNum: string;
  name: string;
  lat: number;
  lon: number;
  /** Station height, m AMSL (BOM stations.txt). */
  elevation?: number;
}

export interface BomObservation {
  windSpeed: number;
  windGust: number;
  direction: string;
  stationName: string;
  stationLat: number;
  stationLon: number;
  timestamp: string;
}

// Victoria AWS stations from https://reg.bom.gov.au/vic/observations/vicall.shtml
// All use product code IDV60801. Portable/unknown-location stations omitted.
// Coordinates and heights: BOM's station list (bom.gov.au/climate/data/lists_by_element/stations.txt,
// matched by WMO number), refreshed 2026-11-13. Stations not in that list use the 1-dp coords from
// their own JSON feed. The earlier hand-typed coords were up to 44 km out.
const BOM_VIC_STATIONS: BomStation[] = [
  // Mallee
  { productCode: "IDV60801", stationNum: "94839", name: "Charlton", lat: -36.2846, lon: 143.3341, elevation: 132 },
  { productCode: "IDV60801", stationNum: "94838", name: "Hopetoun Airport", lat: -35.7151, lon: 142.3569, elevation: 77 },
  { productCode: "IDV60801", stationNum: "94844", name: "Kerang", lat: -35.7466, lon: 143.935, elevation: 78 },
  { productCode: "IDV60801", stationNum: "94693", name: "Mildura", lat: -34.2358, lon: 142.0867, elevation: 50 },
  { productCode: "IDV60801", stationNum: "94843", name: "Swan Hill", lat: -35.3766, lon: 143.5416, elevation: 71 },
  { productCode: "IDV60801", stationNum: "95831", name: "Walpeup", lat: -35.1201, lon: 142.004, elevation: 105 },
  // Wimmera
  { productCode: "IDV60801", stationNum: "95832", name: "Edenhope", lat: -37.0222, lon: 141.2657, elevation: 155 },
  { productCode: "IDV60801", stationNum: "95839", name: "Horsham", lat: -36.6699, lon: 142.1733, elevation: 134 },
  { productCode: "IDV60801", stationNum: "95835", name: "Longerenong", lat: -36.6722, lon: 142.2991, elevation: 133 },
  { productCode: "IDV60801", stationNum: "94827", name: "Nhill Aerodrome", lat: -36.3093, lon: 141.6486, elevation: 139 },
  { productCode: "IDV60801", stationNum: "94836", name: "Stawell", lat: -37.072, lon: 142.7402, elevation: 235 },
  { productCode: "IDV60801", stationNum: "94920", name: "Warracknabeal Airport", lat: -36.3203, lon: 142.4161, elevation: 118 },
  { productCode: "IDV60801", stationNum: "94834", name: "Ararat", lat: -37.2769, lon: 142.9786, elevation: 295 },
  { productCode: "IDV60801", stationNum: "94835", name: "Ben Nevis", lat: -37.2281, lon: 143.2005, elevation: 875 },
  // South West
  { productCode: "IDV60801", stationNum: "94826", name: "Cape Nelson", lat: -38.4306, lon: 141.5437, elevation: 45 },
  { productCode: "IDV60801", stationNum: "94842", name: "Cape Otway", lat: -38.8557, lon: 143.513, elevation: 80 },
  { productCode: "IDV60801", stationNum: "95825", name: "Casterton", lat: -37.583, lon: 141.3339, elevation: 131 },
  { productCode: "IDV60801", stationNum: "95822", name: "Dartmoor", lat: -37.9222, lon: 141.2614, elevation: 51 },
  { productCode: "IDV60801", stationNum: "94829", name: "Hamilton", lat: -37.6486, lon: 142.0636, elevation: 241 },
  { productCode: "IDV60801", stationNum: "94840", name: "Mortlake", lat: -38.0737, lon: 142.7744, elevation: 130 },
  { productCode: "IDV60801", stationNum: "95845", name: "Mount Gellibrand", lat: -38.2333, lon: 143.7924, elevation: 261 },
  { productCode: "IDV60801", stationNum: "94833", name: "Mount William", lat: -37.295, lon: 142.6039, elevation: 1150 },
  { productCode: "IDV60801", stationNum: "94830", name: "Port Fairy", lat: -38.3906, lon: 142.2348, elevation: 10 },
  { productCode: "IDV60801", stationNum: "94828", name: "Portland Airport", lat: -38.3148, lon: 141.4705, elevation: 81 },
  { productCode: "IDV60801", stationNum: "95826", name: "Portland Harbour", lat: -38.3439, lon: 141.6136, elevation: 0 },
  { productCode: "IDV60801", stationNum: "94837", name: "Warrnambool", lat: -38.2869, lon: 142.4524, elevation: 71 },
  { productCode: "IDV60801", stationNum: "95840", name: "Westmere", lat: -37.7067, lon: 142.9378, elevation: 226 },
  // Central / Port Phillip
  { productCode: "IDV60801", stationNum: "94846", name: "Aireys Inlet", lat: -38.4583, lon: 144.0883, elevation: 105 },
  { productCode: "IDV60801", stationNum: "94854", name: "Avalon", lat: -38.0288, lon: 144.4783, elevation: 11 },
  { productCode: "IDV60801", stationNum: "94852", name: "Ballarat", lat: -37.5127, lon: 143.7911, elevation: 435 },
  { productCode: "IDV60801", stationNum: "94898", name: "Cerberus", lat: -38.3646, lon: 145.1785, elevation: 13 },
  { productCode: "IDV60801", stationNum: "94864", name: "Coldstream", lat: -37.7239, lon: 145.4092, elevation: 83 },
  { productCode: "IDV60801", stationNum: "95866", name: "Essendon Airport", lat: -37.7276, lon: 144.9066, elevation: 78 },
  { productCode: "IDV60801", stationNum: "95872", name: "Fawkner Beacon", lat: -37.9483, lon: 144.9269, elevation: 17 },
  { productCode: "IDV60801", stationNum: "94872", name: "Ferny Creek", lat: -37.8748, lon: 145.3497, elevation: 513 },
  { productCode: "IDV60801", stationNum: "94876", name: "Frankston (Ballam Park)", lat: -38.1517, lon: 145.1615, elevation: 59 },
  { productCode: "IDV60801", stationNum: "94871", name: "Frankston Beach", lat: -38.148, lon: 145.1152, elevation: 6 },
  { productCode: "IDV60801", stationNum: "94857", name: "Geelong Racecourse", lat: -38.1737, lon: 144.3766, elevation: 13 },
  { productCode: "IDV60801", stationNum: "94865", name: "Laverton", lat: -37.8565, lon: 144.7565, elevation: 20 },
  { productCode: "IDV60801", stationNum: "94866", name: "Melbourne Airport", lat: -37.6654, lon: 144.8329, elevation: 113 },
  { productCode: "IDV60801", stationNum: "95936", name: "Melbourne (Olympic Park)", lat: -37.8255, lon: 144.9816, elevation: 8 },
  { productCode: "IDV60801", stationNum: "94870", name: "Moorabbin Airport", lat: -37.98, lon: 145.0962, elevation: 12 },
  { productCode: "IDV60801", stationNum: "95941", name: "Point Cook", lat: -37.9273, lon: 144.7566, elevation: 3 },
  { productCode: "IDV60801", stationNum: "94847", name: "Point Wilson", lat: -38.0958, lon: 144.5359, elevation: 5 },
  { productCode: "IDV60801", stationNum: "94886", name: "Pound Creek", lat: -38.6297, lon: 145.8107, elevation: 3 },
  { productCode: "IDV60801", stationNum: "94892", name: "Rhyll", lat: -38.4612, lon: 145.3101, elevation: 13 },
  { productCode: "IDV60801", stationNum: "95867", name: "Scoresby", lat: -37.88, lon: 145.25 },
  { productCode: "IDV60801", stationNum: "94863", name: "She Oaks", lat: -37.9075, lon: 144.1303, elevation: 237 },
  { productCode: "IDV60801", stationNum: "94853", name: "South Channel Island", lat: -38.3065, lon: 144.8016, elevation: 9 },
  { productCode: "IDV60801", stationNum: "95864", name: "St Kilda Harbour RMYS", lat: -37.864, lon: 144.9639, elevation: 6 },
  { productCode: "IDV60801", stationNum: "95874", name: "Viewbank", lat: -37.7408, lon: 145.0972, elevation: 66 },
  { productCode: "IDV60801", stationNum: "95881", name: "Wonthaggi", lat: -38.6078, lon: 145.5965, elevation: 53 },
  // Central North (Loddon Campaspe / Goulburn)
  { productCode: "IDV60801", stationNum: "94855", name: "Bendigo", lat: -36.7411, lon: 144.3274, elevation: 209 },
  { productCode: "IDV60801", stationNum: "94861", name: "Echuca", lat: -36.1639, lon: 144.7639, elevation: 98 },
  { productCode: "IDV60801", stationNum: "95833", name: "Kyabram", lat: -36.335, lon: 145.0638, elevation: 105 },
  { productCode: "IDV60801", stationNum: "94874", name: "Mangalore", lat: -36.8886, lon: 145.1859, elevation: 141 },
  { productCode: "IDV60801", stationNum: "94859", name: "Redesdale", lat: -37.0194, lon: 144.5203, elevation: 290 },
  { productCode: "IDV60801", stationNum: "94875", name: "Shepparton", lat: -36.4288, lon: 145.3949, elevation: 114 },
  { productCode: "IDV60801", stationNum: "95843", name: "Strathbogie", lat: -36.8472, lon: 145.7307, elevation: 501 },
  { productCode: "IDV60801", stationNum: "95836", name: "Tatura", lat: -36.4379, lon: 145.2673, elevation: 114 },
  { productCode: "IDV60801", stationNum: "94862", name: "Yarrawonga", lat: -36.0294, lon: 146.0305, elevation: 129 },
  // North East
  { productCode: "IDV60801", stationNum: "95896", name: "Albury", lat: -36.07, lon: 146.96 },
  { productCode: "IDV60801", stationNum: "94884", name: "Benalla", lat: -36.5522, lon: 145.9977, elevation: 171 },
  { productCode: "IDV60801", stationNum: "94903", name: "Falls Creek", lat: -36.8708, lon: 147.2755, elevation: 1765 },
  { productCode: "IDV60801", stationNum: "94878", name: "Hunters Hill", lat: -36.2136, lon: 147.5395, elevation: 981 },
  { productCode: "IDV60801", stationNum: "94894", name: "Mount Buller", lat: -37.145, lon: 146.4395, elevation: 1707 },
  { productCode: "IDV60801", stationNum: "94905", name: "Mount Hotham Airport", lat: -37, lon: 147.3 },
  { productCode: "IDV60801", stationNum: "94906", name: "Mount Hotham", lat: -36.9772, lon: 147.1342, elevation: 1849 },
  { productCode: "IDV60801", stationNum: "95837", name: "Rutherglen", lat: -36.1048, lon: 146.5094, elevation: 175 },
  { productCode: "IDV60801", stationNum: "94889", name: "Wangaratta", lat: -36.4205, lon: 146.3056, elevation: 153 },
  // Central (Ranges / Macedon)
  { productCode: "IDV60801", stationNum: "94881", name: "Eildon Fire Tower", lat: -37.2091, lon: 145.8423, elevation: 637 },
  { productCode: "IDV60801", stationNum: "94860", name: "Kilmore Gap", lat: -37.3807, lon: 144.9655, elevation: 528 },
  { productCode: "IDV60801", stationNum: "94882", name: "Lake Eildon", lat: -37.2313, lon: 145.9124, elevation: 230 },
  { productCode: "IDV60801", stationNum: "94849", name: "Maryborough", lat: -37.056, lon: 143.732, elevation: 249 },
  { productCode: "IDV60801", stationNum: "94858", name: "Puckapunyal-Lyon Hill (Defence)", lat: -36.9381, lon: 145.0539, elevation: 193 },
  { productCode: "IDV60801", stationNum: "94856", name: "Puckapunyal West (Defence)", lat: -37.0178, lon: 144.8547, elevation: 293 },
  // Gippsland
  { productCode: "IDV60801", stationNum: "95907", name: "East Sale Airport", lat: -38.1016, lon: 147.1398, elevation: 5 },
  { productCode: "IDV60801", stationNum: "94949", name: "Hogan Island", lat: -39.2225, lon: 146.9841 },
  { productCode: "IDV60801", stationNum: "94891", name: "Latrobe Valley", lat: -38.2094, lon: 146.4746, elevation: 56 },
  { productCode: "IDV60801", stationNum: "95901", name: "Mount Baw Baw", lat: -37.8384, lon: 146.2747, elevation: 1561 },
  { productCode: "IDV60801", stationNum: "95913", name: "Mount Moornapa", lat: -37.7481, lon: 147.1428, elevation: 480 },
  { productCode: "IDV60801", stationNum: "99806", name: "Warragul (Nilma North)", lat: -38.1321, lon: 145.9865, elevation: 134 },
  { productCode: "IDV60801", stationNum: "94893", name: "Wilsons Promontory", lat: -39.1297, lon: 146.4246, elevation: 95 },
  { productCode: "IDV60801", stationNum: "95890", name: "Yarram Airport", lat: -38.5647, lon: 146.7479, elevation: 18 },
  { productCode: "IDV60801", stationNum: "94912", name: "Bairnsdale", lat: -37.8818, lon: 147.5669, elevation: 49 },
  { productCode: "IDV60801", stationNum: "94914", name: "Combienbar", lat: -37.3416, lon: 149.0227, elevation: 640 },
  { productCode: "IDV60801", stationNum: "94933", name: "Gabo Island", lat: -37.5679, lon: 149.9158, elevation: 15 },
  { productCode: "IDV60801", stationNum: "94913", name: "Gelantipy", lat: -37.22, lon: 148.2626, elevation: 755 },
  { productCode: "IDV60801", stationNum: "95904", name: "Lakes Entrance", lat: -37.8717, lon: 148.006, elevation: 4 },
  { productCode: "IDV60801", stationNum: "94935", name: "Mallacoota", lat: -37.5976, lon: 149.7289, elevation: 22 },
  { productCode: "IDV60801", stationNum: "94930", name: "Mount Nowa Nowa", lat: -37.6924, lon: 148.0908, elevation: 350 },
  { productCode: "IDV60801", stationNum: "94908", name: "Omeo", lat: -37.1017, lon: 147.6008, elevation: 690 },
  { productCode: "IDV60801", stationNum: "95918", name: "Orbost", lat: -37.6922, lon: 148.4667, elevation: 63 },
  // CFA volunteer fire brigade stations
  { productCode: "IDV60801", stationNum: "99813", name: "Cressy (CFA)", lat: -38, lon: 143.6 },
  { productCode: "IDV60801", stationNum: "99815", name: "Wycheproof (CFA)", lat: -36.07, lon: 143.22 },
  { productCode: "IDV60801", stationNum: "99820", name: "Ballan (CFA)", lat: -37.60, lon: 144.22 },
  { productCode: "IDV60801", stationNum: "99821", name: "Trentham East (CFA)", lat: -37.39, lon: 144.35 },
  { productCode: "IDV60801", stationNum: "99822", name: "Glenburn (CFA)", lat: -37.3, lon: 145.5 },
  { productCode: "IDV60801", stationNum: "99826", name: "Gerangamete (CFA)", lat: -38.4, lon: 143.7 },
  { productCode: "IDV60801", stationNum: "99827", name: "Mt Burnett (CFA)", lat: -38, lon: 145.5 },
];

export function getBomStations(): BomStation[] {
  return BOM_VIC_STATIONS;
}

export function parseBomStationId(stationId: string): { productCode: string; stationNum: string } | null {
  // Format: bom-{productCode}-{stationNum}  e.g. bom-IDV60801-94846
  const match = stationId.match(/^bom-([A-Z0-9]+)-(\d+)$/);
  if (!match) return null;
  return { productCode: match[1], stationNum: match[2] };
}

export function getBomStationId(station: BomStation): string {
  return `bom-${station.productCode}-${station.stationNum}`;
}

export function parseBomTimestamp(localDateTimeFull: string): string {
  // BOM local_date_time_full format: YYYYMMDDHHMMSS in Melbourne local time
  const y = localDateTimeFull.slice(0, 4);
  const mo = localDateTimeFull.slice(4, 6);
  const d = localDateTimeFull.slice(6, 8);
  const h = localDateTimeFull.slice(8, 10);
  const mi = localDateTimeFull.slice(10, 12);
  const s = localDateTimeFull.slice(12, 14);
  return fromZonedTime(`${y}-${mo}-${d}T${h}:${mi}:${s}`, "Australia/Melbourne").toISOString();
}

export async function fetchBomObservation(productCode: string, stationNum: string): Promise<BomObservation | null> {
  const url = `https://reg.bom.gov.au/fwo/${productCode}/${productCode}.${stationNum}.json`;
  try {
    const data = await fetchWithRetry(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://reg.bom.gov.au/",
      },
    });

    const obs = data?.observations?.data?.[0];
    const header = data?.observations?.header?.[0];
    if (!obs) {
      log.warn(`BOM: No observation data for ${productCode}.${stationNum}`);
      return null;
    }

    const rawSpeed = Number(obs.wind_spd_kt);
    const windSpeed = !isNaN(rawSpeed) ? Math.round(rawSpeed) : 0;
    const rawGust = Number(obs.gust_kt);
    const windGust = !isNaN(rawGust) ? Math.round(rawGust) : windSpeed;
    const direction = obs.wind_dir || "N/A";
    const stationName = header?.name || `BOM ${stationNum}`;

    // Header lat/lon can be empty strings — fall back to static list coords
    const staticStation = BOM_VIC_STATIONS.find(s => s.stationNum === stationNum);
    const headerLat = parseFloat(header?.lat);
    const headerLon = parseFloat(header?.lon);
    const stationLat = Number.isFinite(headerLat) ? headerLat : (staticStation?.lat ?? 0);
    const stationLon = Number.isFinite(headerLon) ? headerLon : (staticStation?.lon ?? 0);

    let timestamp: string;
    if (obs.local_date_time_full) {
      try {
        timestamp = parseBomTimestamp(String(obs.local_date_time_full));
      } catch {
        timestamp = new Date().toISOString();
      }
    } else {
      timestamp = new Date().toISOString();
    }

    return { windSpeed, windGust, direction, stationName, stationLat, stationLon, timestamp };
  } catch (err) {
    log.error(`BOM: Failed to fetch ${productCode}.${stationNum}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
