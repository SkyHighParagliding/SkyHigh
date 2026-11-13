import { STALE_AFTER_MIN, type LiveStation, type LiveStationsResponse, type StationHistoryResponse } from "../../shared/stations.js";
import { getBomStations, getBomStationId } from "../bomWeather.js";
import createLogger from "../utils/logger.js";
import { parseBomStation, type BomParsed } from "./bomParse.js";
import { loadSiteStations, siteStationHistory } from "./siteStations.js";

const log = createLogger("stations");

const REFRESH_MS = 10 * 60_000;
const IDLE_AFTER_MS = 30 * 60_000;
const COLD_WAIT_MS = 10_000;
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 10_000;
const ATTEMPTS = 2;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  Accept: "application/json",
  Referer: "https://reg.bom.gov.au/",
};
const BOM_ATTRIBUTION = "Bureau of Meteorology";

interface BomEntry { station: LiveStation; history: BomParsed["history"] }

const bomCache = new Map<string, BomEntry>();
let updatedAt: string | null = null;
let lastRequestAt = 0;
let timer: NodeJS.Timeout | null = null;
let inflight: Promise<void> | null = null;

async function fetchJson(url: string): Promise<any> {
  let lastErr: unknown;
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function refreshBom(): Promise<void> {
  const t0 = Date.now();
  const list = getBomStations();
  let ok = 0;
  let failed = 0;
  const failedNums: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const s = list[next++];
      try {
        const parsed = parseBomStation(await fetchJson(`https://reg.bom.gov.au/fwo/${s.productCode}/${s.productCode}.${s.stationNum}.json`));
        if (!parsed) throw new Error("no usable reading");
        const id = getBomStationId(s);
        const r = parsed.latest;
        const ts = Date.parse(r.t);
        bomCache.set(id, {
          history: parsed.history,
          station: {
            id,
            name: parsed.name || s.name,
            lat: s.lat, // static list has 2 dp; BOM rows are rounded to 1 dp
            lon: s.lon,
            source: "bom",
            speedKt: r.speedKt,
            gustKt: r.gustKt,
            dirDeg: r.dirDeg,
            ...(r.tempC !== undefined && { tempC: r.tempC }),
            ...(r.pressureHpa !== undefined && { pressureHpa: r.pressureHpa }),
            ...(r.humidityPct !== undefined && { humidityPct: r.humidityPct }),
            obsTime: r.t,
            stale: Date.now() - ts > STALE_AFTER_MIN * 60_000,
            attribution: BOM_ATTRIBUTION,
          },
        });
        ok++;
      } catch {
        failed++;
        failedNums.push(s.stationNum);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (ok > 0) updatedAt = new Date().toISOString();
  log.info(`BOM refresh: ${ok} ok, ${failed} failed, ${Date.now() - t0} ms${failed ? ` (failed: ${failedNums.join(",")})` : ""}`);
}

/** Run a refresh unless one is already running. */
function refresh(): Promise<void> {
  if (!inflight) {
    inflight = refreshBom()
      .catch(err => log.error(`BOM refresh crashed: ${err instanceof Error ? err.message : err}`))
      .finally(() => { inflight = null; });
  }
  return inflight;
}

function tick() {
  timer = null;
  if (Date.now() - lastRequestAt > IDLE_AFTER_MS) {
    log.info("No station requests for 30 min: polling idle");
    return;
  }
  void refresh();
  timer = setTimeout(tick, REFRESH_MS);
  timer.unref();
}

/** Mark demand; starts polling if idle. Cold cache waits (max ~10 s) for the first fill. */
async function touch(): Promise<void> {
  lastRequestAt = Date.now();
  if (!timer) {
    log.info("Station polling started");
    timer = setTimeout(tick, REFRESH_MS);
    timer.unref();
    void refresh();
  }
  if (bomCache.size === 0 && inflight) {
    await Promise.race([inflight, new Promise(r => setTimeout(r, COLD_WAIT_MS))]);
  }
}

export async function getLiveStations(): Promise<LiveStationsResponse> {
  await touch();
  const bom = getBomStations();
  const stations: LiveStation[] = [...bomCache.values()].map(e => e.station);
  try {
    // Reuse BOM coords for the near-BOM dedupe so site stations on a BOM mast aren't doubled.
    const sites = await loadSiteStations(bom);
    stations.push(...sites.map(s => s.station));
  } catch (err) {
    log.error(`Site stations failed: ${err instanceof Error ? err.message : err}`);
  }
  // Staleness changes with time, not only on refresh.
  const now = Date.now();
  for (const s of stations) s.stale = now - Date.parse(s.obsTime) > STALE_AFTER_MIN * 60_000;
  return { stations, updatedAt };
}

/** null = unknown id. */
export async function getStationHistory(id: string, hours: number): Promise<StationHistoryResponse | null> {
  await touch();
  const b = bomCache.get(id);
  if (b) {
    const cutoff = Date.now() - hours * 3600_000;
    return { id, points: b.history.filter(p => Date.parse(p.t) >= cutoff) };
  }
  const site = (await loadSiteStations(getBomStations())).find(s => s.station.id === id);
  if (!site) return null;
  return { id, points: await siteStationHistory(site, hours) };
}
