import { fromZonedTime } from "date-fns-tz";
import { fetchWithRetry } from "./weather.js";
import createLogger from "./utils/logger.js";

const log = createLogger("bom-weather");

export interface BomStation {
  productCode: string;
  stationNum: string;
  name: string;
  lat: number;
  lon: number;
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
const BOM_VIC_STATIONS: BomStation[] = [
  // Mallee
  { productCode: "IDV60801", stationNum: "94839", name: "Charlton", lat: -36.26, lon: 143.35 },
  { productCode: "IDV60801", stationNum: "94838", name: "Hopetoun Airport", lat: -35.72, lon: 142.37 },
  { productCode: "IDV60801", stationNum: "94844", name: "Kerang", lat: -35.73, lon: 143.92 },
  { productCode: "IDV60801", stationNum: "94693", name: "Mildura", lat: -34.23, lon: 142.09 },
  { productCode: "IDV60801", stationNum: "94843", name: "Swan Hill", lat: -35.34, lon: 143.55 },
  { productCode: "IDV60801", stationNum: "95831", name: "Walpeup", lat: -35.12, lon: 141.98 },
  // Wimmera
  { productCode: "IDV60801", stationNum: "95832", name: "Edenhope", lat: -37.03, lon: 141.28 },
  { productCode: "IDV60801", stationNum: "95839", name: "Horsham", lat: -36.66, lon: 142.10 },
  { productCode: "IDV60801", stationNum: "95835", name: "Longerenong", lat: -36.67, lon: 142.20 },
  { productCode: "IDV60801", stationNum: "94827", name: "Nhill Aerodrome", lat: -36.33, lon: 141.65 },
  { productCode: "IDV60801", stationNum: "94836", name: "Stawell", lat: -37.05, lon: 142.77 },
  { productCode: "IDV60801", stationNum: "94920", name: "Warracknabeal Airport", lat: -36.32, lon: 142.42 },
  { productCode: "IDV60801", stationNum: "94834", name: "Ararat", lat: -37.28, lon: 142.97 },
  { productCode: "IDV60801", stationNum: "94835", name: "Ben Nevis", lat: -37.16, lon: 143.69 },
  // South West
  { productCode: "IDV60801", stationNum: "94826", name: "Cape Nelson", lat: -38.43, lon: 141.55 },
  { productCode: "IDV60801", stationNum: "94842", name: "Cape Otway", lat: -38.86, lon: 143.51 },
  { productCode: "IDV60801", stationNum: "95825", name: "Casterton", lat: -37.59, lon: 141.40 },
  { productCode: "IDV60801", stationNum: "95822", name: "Dartmoor", lat: -37.92, lon: 141.27 },
  { productCode: "IDV60801", stationNum: "94829", name: "Hamilton", lat: -37.65, lon: 142.07 },
  { productCode: "IDV60801", stationNum: "94840", name: "Mortlake", lat: -38.07, lon: 142.80 },
  { productCode: "IDV60801", stationNum: "95845", name: "Mount Gellibrand", lat: -38.48, lon: 143.57 },
  { productCode: "IDV60801", stationNum: "94833", name: "Mount William", lat: -37.20, lon: 142.63 },
  { productCode: "IDV60801", stationNum: "94830", name: "Port Fairy", lat: -38.38, lon: 142.22 },
  { productCode: "IDV60801", stationNum: "94828", name: "Portland Airport", lat: -38.32, lon: 141.47 },
  { productCode: "IDV60801", stationNum: "95826", name: "Portland Harbour", lat: -38.35, lon: 141.61 },
  { productCode: "IDV60801", stationNum: "94837", name: "Warrnambool", lat: -38.29, lon: 142.48 },
  { productCode: "IDV60801", stationNum: "95840", name: "Westmere", lat: -37.85, lon: 143.10 },
  // Central / Port Phillip
  { productCode: "IDV60801", stationNum: "94846", name: "Aireys Inlet", lat: -38.46, lon: 144.09 },
  { productCode: "IDV60801", stationNum: "94854", name: "Avalon", lat: -38.03, lon: 144.47 },
  { productCode: "IDV60801", stationNum: "94852", name: "Ballarat", lat: -37.51, lon: 143.79 },
  { productCode: "IDV60801", stationNum: "94898", name: "Cerberus", lat: -38.36, lon: 145.15 },
  { productCode: "IDV60801", stationNum: "94864", name: "Coldstream", lat: -37.73, lon: 145.40 },
  { productCode: "IDV60801", stationNum: "95866", name: "Essendon Airport", lat: -37.73, lon: 144.90 },
  { productCode: "IDV60801", stationNum: "95872", name: "Fawkner Beacon", lat: -37.86, lon: 144.99 },
  { productCode: "IDV60801", stationNum: "94872", name: "Ferny Creek", lat: -37.88, lon: 145.36 },
  { productCode: "IDV60801", stationNum: "94876", name: "Frankston (Ballam Park)", lat: -38.13, lon: 145.17 },
  { productCode: "IDV60801", stationNum: "94871", name: "Frankston Beach", lat: -38.15, lon: 145.13 },
  { productCode: "IDV60801", stationNum: "94857", name: "Geelong Racecourse", lat: -38.15, lon: 144.35 },
  { productCode: "IDV60801", stationNum: "94865", name: "Laverton", lat: -37.86, lon: 144.75 },
  { productCode: "IDV60801", stationNum: "94866", name: "Melbourne Airport", lat: -37.67, lon: 144.83 },
  { productCode: "IDV60801", stationNum: "95936", name: "Melbourne (Olympic Park)", lat: -37.82, lon: 144.98 },
  { productCode: "IDV60801", stationNum: "94870", name: "Moorabbin Airport", lat: -37.98, lon: 145.10 },
  { productCode: "IDV60801", stationNum: "95941", name: "Point Cook", lat: -37.93, lon: 144.75 },
  { productCode: "IDV60801", stationNum: "94847", name: "Point Wilson", lat: -38.09, lon: 144.47 },
  { productCode: "IDV60801", stationNum: "94886", name: "Pound Creek", lat: -38.64, lon: 145.72 },
  { productCode: "IDV60801", stationNum: "94892", name: "Rhyll", lat: -38.47, lon: 145.31 },
  { productCode: "IDV60801", stationNum: "95867", name: "Scoresby", lat: -37.88, lon: 145.25 },
  { productCode: "IDV60801", stationNum: "94863", name: "She Oaks", lat: -38.15, lon: 144.10 },
  { productCode: "IDV60801", stationNum: "94853", name: "South Channel Island", lat: -38.33, lon: 145.03 },
  { productCode: "IDV60801", stationNum: "95864", name: "St Kilda Harbour RMYS", lat: -37.87, lon: 144.97 },
  { productCode: "IDV60801", stationNum: "95874", name: "Viewbank", lat: -37.74, lon: 145.13 },
  { productCode: "IDV60801", stationNum: "95881", name: "Wonthaggi", lat: -38.61, lon: 145.59 },
  // Central North (Loddon Campaspe / Goulburn)
  { productCode: "IDV60801", stationNum: "94855", name: "Bendigo", lat: -36.74, lon: 144.28 },
  { productCode: "IDV60801", stationNum: "94861", name: "Echuca", lat: -36.16, lon: 144.76 },
  { productCode: "IDV60801", stationNum: "95833", name: "Kyabram", lat: -36.31, lon: 145.04 },
  { productCode: "IDV60801", stationNum: "94874", name: "Mangalore", lat: -36.88, lon: 145.19 },
  { productCode: "IDV60801", stationNum: "94859", name: "Redesdale", lat: -37.02, lon: 144.55 },
  { productCode: "IDV60801", stationNum: "94875", name: "Shepparton", lat: -36.43, lon: 145.40 },
  { productCode: "IDV60801", stationNum: "95843", name: "Strathbogie", lat: -36.85, lon: 145.72 },
  { productCode: "IDV60801", stationNum: "95836", name: "Tatura", lat: -36.44, lon: 145.27 },
  { productCode: "IDV60801", stationNum: "94862", name: "Yarrawonga", lat: -36.02, lon: 146.03 },
  // North East
  { productCode: "IDV60801", stationNum: "95896", name: "Albury", lat: -36.07, lon: 146.96 },
  { productCode: "IDV60801", stationNum: "94884", name: "Benalla", lat: -36.55, lon: 145.98 },
  { productCode: "IDV60801", stationNum: "94903", name: "Falls Creek", lat: -36.87, lon: 147.28 },
  { productCode: "IDV60801", stationNum: "94878", name: "Hunters Hill", lat: -36.57, lon: 147.32 },
  { productCode: "IDV60801", stationNum: "94894", name: "Mount Buller", lat: -37.15, lon: 146.44 },
  { productCode: "IDV60801", stationNum: "94905", name: "Mount Hotham Airport", lat: -37.05, lon: 147.33 },
  { productCode: "IDV60801", stationNum: "94906", name: "Mount Hotham", lat: -37.03, lon: 147.13 },
  { productCode: "IDV60801", stationNum: "95837", name: "Rutherglen", lat: -36.10, lon: 146.51 },
  { productCode: "IDV60801", stationNum: "94889", name: "Wangaratta", lat: -36.42, lon: 146.30 },
  // Central (Ranges / Macedon)
  { productCode: "IDV60801", stationNum: "94881", name: "Eildon Fire Tower", lat: -37.23, lon: 145.92 },
  { productCode: "IDV60801", stationNum: "94860", name: "Kilmore Gap", lat: -37.29, lon: 144.96 },
  { productCode: "IDV60801", stationNum: "94882", name: "Lake Eildon", lat: -37.23, lon: 145.91 },
  { productCode: "IDV60801", stationNum: "94849", name: "Maryborough", lat: -37.05, lon: 143.73 },
  { productCode: "IDV60801", stationNum: "94858", name: "Puckapunyal-Lyon Hill (Defence)", lat: -36.98, lon: 144.89 },
  { productCode: "IDV60801", stationNum: "94856", name: "Puckapunyal West (Defence)", lat: -36.97, lon: 144.88 },
  // Gippsland
  { productCode: "IDV60801", stationNum: "95907", name: "East Sale Airport", lat: -38.10, lon: 147.13 },
  { productCode: "IDV60801", stationNum: "94949", name: "Hogan Island", lat: -39.22, lon: 147.01 },
  { productCode: "IDV60801", stationNum: "94891", name: "Latrobe Valley", lat: -38.23, lon: 146.47 },
  { productCode: "IDV60801", stationNum: "95901", name: "Mount Baw Baw", lat: -37.83, lon: 146.27 },
  { productCode: "IDV60801", stationNum: "95913", name: "Mount Moornapa", lat: -37.92, lon: 147.31 },
  { productCode: "IDV60801", stationNum: "99806", name: "Warragul (Nilma North)", lat: -38.18, lon: 145.92 },
  { productCode: "IDV60801", stationNum: "94893", name: "Wilsons Promontory", lat: -39.13, lon: 146.42 },
  { productCode: "IDV60801", stationNum: "95890", name: "Yarram Airport", lat: -38.57, lon: 146.75 },
  { productCode: "IDV60801", stationNum: "94912", name: "Bairnsdale", lat: -37.88, lon: 147.57 },
  { productCode: "IDV60801", stationNum: "94914", name: "Combienbar", lat: -37.56, lon: 148.78 },
  { productCode: "IDV60801", stationNum: "94933", name: "Gabo Island", lat: -37.57, lon: 149.92 },
  { productCode: "IDV60801", stationNum: "94913", name: "Gelantipy", lat: -37.15, lon: 148.34 },
  { productCode: "IDV60801", stationNum: "95904", name: "Lakes Entrance", lat: -37.88, lon: 147.99 },
  { productCode: "IDV60801", stationNum: "94935", name: "Mallacoota", lat: -37.60, lon: 149.72 },
  { productCode: "IDV60801", stationNum: "94930", name: "Mount Nowa Nowa", lat: -37.72, lon: 148.07 },
  { productCode: "IDV60801", stationNum: "94908", name: "Omeo", lat: -37.10, lon: 147.60 },
  { productCode: "IDV60801", stationNum: "95918", name: "Orbost", lat: -37.69, lon: 148.46 },
  // CFA volunteer fire brigade stations
  { productCode: "IDV60801", stationNum: "99813", name: "Cressy (CFA)", lat: -37.89, lon: 143.49 },
  { productCode: "IDV60801", stationNum: "99815", name: "Wycheproof (CFA)", lat: -36.07, lon: 143.22 },
  { productCode: "IDV60801", stationNum: "99820", name: "Ballan (CFA)", lat: -37.60, lon: 144.22 },
  { productCode: "IDV60801", stationNum: "99821", name: "Trentham East (CFA)", lat: -37.39, lon: 144.35 },
  { productCode: "IDV60801", stationNum: "99822", name: "Glenburn (CFA)", lat: -37.43, lon: 145.46 },
  { productCode: "IDV60801", stationNum: "99826", name: "Gerangamete (CFA)", lat: -38.52, lon: 143.67 },
  { productCode: "IDV60801", stationNum: "99827", name: "Mt Burnett (CFA)", lat: -37.89, lon: 145.47 },
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

function parseBomTimestamp(localDateTimeFull: string): string {
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

    const windSpeed = obs.wind_spd_kt != null ? Math.round(obs.wind_spd_kt) : 0;
    const windGust = obs.gust_kt != null ? Math.round(obs.gust_kt) : windSpeed;
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
