import { Router } from "express";
import { query, queryOne, execute } from "../../pg.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { fetchFreeFlightWxData, getSlugFromStationId, parseGaugeUrl } from "../../freeflightwx.js";
import { getStationById, getCachedTideData, getAllStations, findNearestStation } from "../../tides.js";
import { invalidateSearchCaches } from "../search.js";
import { normaliseWindSpeed, haversineDistanceServer, invalidateSitesCache } from "./helpers.js";

const router = Router();

router.get("/weather-gauge/fetch", asyncHandler(async (req, res) => {
  const url = req.query.url as string;
  if (!url) return res.status(400).json({ error: "url query parameter required" });

  const parsed = parseGaugeUrl(url);
  if (!parsed) return res.status(400).json({ error: "URL is not a supported freeflightwx.com station" });

  const data = await fetchFreeFlightWxData(url);
  res.json(data);
}));

router.get("/tide-stations", (_req, res) => {
  try {
    const stations = getAllStations().map(s => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
    }));
    res.json(stations);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id/tides", asyncHandler(async (req, res) => {
  const site = await queryOne<any>('SELECT id, type, "isTidal", "tideStationId", lat, lon FROM sites WHERE id = $1', [req.params.id]);
  if (!site) return res.status(404).json({ error: "Site not found" });
  const isCoastal = !(site.type || "").toLowerCase().includes("inland");
  if (!isCoastal && site.isTidal !== "true") return res.status(404).json({ error: "Site is not tidal" });

  let station = site.tideStationId ? getStationById(site.tideStationId) : null;
  if (!station && site.lat && site.lon) {
    station = findNearestStation(site.lat, site.lon);
  }
  if (!station) return res.status(404).json({ error: "No tide station found for this site" });

  const tideData = await getCachedTideData(station);
  res.json(tideData);
}));

router.get("/:id/weather-gauge", asyncHandler(async (req, res) => {
  const site = await queryOne<{ liveStationId: string | null, liveStationIdAlt: string | null }>(
    'SELECT "liveStationId", "liveStationIdAlt" FROM sites WHERE id = $1',
    [req.params.id]
  );
  if (!site) return res.status(404).json({ error: "Site not found" });
  const ffwxId = [site.liveStationId, site.liveStationIdAlt].find(id => id?.startsWith('freeflightwx-'));
  if (!ffwxId) return res.status(404).json({ error: "No freeflightwx station configured" });

  const slug = getSlugFromStationId(ffwxId);
  const gaugeUrl = `https://www.freeflightwx.com/${slug}/gauge.php`;
  const data = await fetchFreeFlightWxData(gaugeUrl);
  res.json(data);
}));

router.post("/wtf-compare", requireAuth, asyncHandler(async (req, res) => {
  const { fetchWtfData, matchWtfSite, getWtfWindData } = await import("../../wtf.js");
  const wtfData = await fetchWtfData();
  if (!wtfData.sites.length) {
    return res.json({ success: false, error: "Could not fetch WTF data" });
  }

  const sites = await query<any>('SELECT id, name, "windSpeed", "windDir", "siteguideUrl" FROM sites ORDER BY name');
  const comparisons: any[] = [];

  for (const site of sites) {
    const wtfMatch = matchWtfSite(site.siteguideUrl, site.name, wtfData);
    if (wtfMatch) {
      const wtfWind = getWtfWindData(wtfMatch);
      const wtfSpeed = normaliseWindSpeed(wtfWind.windSpeed);
      const currentSpeed = site.windSpeed || null;
      comparisons.push({
        siteId: site.id,
        siteName: site.name,
        currentWindSpeed: currentSpeed,
        wtfWindSpeed: wtfSpeed,
        currentWindDir: site.windDir || null,
        wtfWindDir: wtfMatch.dir || null,
        changed: currentSpeed !== wtfSpeed,
        wtfSiteName: wtfMatch.title,
      });
    }
  }

  res.json({
    success: true,
    wtfSiteCount: wtfData.sites.length,
    matchedCount: comparisons.length,
    changedCount: comparisons.filter(c => c.changed).length,
    comparisons,
  });
}));

router.post("/wtf-apply", requireAuth, asyncHandler(async (req, res) => {
  const { siteIds } = req.body;
  if (!Array.isArray(siteIds) || siteIds.length === 0) {
    return res.status(400).json({ error: "No site IDs provided" });
  }

  const { fetchWtfData, matchWtfSite, getWtfWindData } = await import("../../wtf.js");
  const wtfData = await fetchWtfData();
  if (!wtfData.sites.length) {
    return res.json({ success: false, error: "Could not fetch WTF data" });
  }

  let updated = 0;
  const results: any[] = [];

  for (const siteId of siteIds) {
    const site = await queryOne<any>('SELECT id, name, "windSpeed", "siteguideUrl" FROM sites WHERE id = $1', [siteId]);
    if (!site) continue;

    const wtfMatch = matchWtfSite(site.siteguideUrl, site.name, wtfData);
    if (!wtfMatch) continue;

    const wtfWind = getWtfWindData(wtfMatch);
    const wtfSpeed = normaliseWindSpeed(wtfWind.windSpeed);
    if (wtfSpeed && wtfSpeed !== site.windSpeed) {
      await execute('UPDATE sites SET "windSpeed" = $1 WHERE id = $2', [wtfSpeed, site.id]);
      results.push({ siteId: site.id, name: site.name, oldSpeed: site.windSpeed, newSpeed: wtfSpeed });
      updated++;
    }
  }

  invalidateSearchCaches();
  invalidateSitesCache();
  res.json({ success: true, updated, results });
}));

const EMERGENCY_CACHE_TTL_MS = 48 * 60 * 60 * 1000;

router.get("/:id/emergency-hospitals", asyncHandler(async (req, res) => {
  const site = await queryOne<any>('SELECT id, lat, lon, "what3words" FROM sites WHERE id = $1', [req.params.id]);
  if (!site) return res.status(404).json({ error: "Site not found" });
  if (site.lat == null || site.lon == null) return res.json({ hospitals: [], what3words: site.what3words || null });

  const cached = await queryOne<any>('SELECT hospitals, "cachedAt" FROM emergency_hospitals_cache WHERE "siteId" = $1', [site.id]);
  if (cached) {
    const cachedTime = new Date(cached.cachedAt).getTime();
    if (Date.now() - cachedTime < EMERGENCY_CACHE_TTL_MS) {
      try {
        return res.json({ hospitals: JSON.parse(cached.hospitals), what3words: site.what3words || null });
      } catch {
        // Corrupted cache, continue to fetch fresh data
      }
    }
  }

  const searchRadius = 75000;

  // Primary: hospitals with confirmed emergency departments (emergency=yes is well-tagged in Australian OSM)
  const queryEmergency = `
    [out:json][timeout:25];
    (
      node["amenity"="hospital"]["emergency"="yes"](around:${searchRadius},${site.lat},${site.lon});
      way["amenity"="hospital"]["emergency"="yes"](around:${searchRadius},${site.lat},${site.lon});
      relation["amenity"="hospital"]["emergency"="yes"](around:${searchRadius},${site.lat},${site.lon});
    );
    out center;
  `;

  // Fallback for remote areas where OSM tagging may be sparse: any hospital within radius
  const queryAllHospitals = `
    [out:json][timeout:25];
    (
      node["amenity"="hospital"](around:${searchRadius},${site.lat},${site.lon});
      way["amenity"="hospital"](around:${searchRadius},${site.lat},${site.lon});
      relation["amenity"="hospital"](around:${searchRadius},${site.lat},${site.lon});
    );
    out center;
  `;

  const overpassHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "SkyHighParaglidingClub/1.0 (paragliding club website; emergency hospital lookup for pilots)",
    "Accept": "application/json",
  };

  const overpassServers = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.fr/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
  ];

  async function fetchFromOverpass(query: string): Promise<any | null> {
    for (const server of overpassServers) {
      try {
        const overpassRes = await fetch(server, {
          method: "POST",
          headers: overpassHeaders,
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(20000),
        });
        if (overpassRes.ok) {
          const result = await overpassRes.json();
          console.log(`Emergency hospitals: fetched from ${server} for site ${site.id}`);
          return result;
        }
        console.error(`Overpass API error from ${server}: ${overpassRes.status}`);
      } catch (e: any) {
        console.error(`Overpass server ${server} failed: ${e.message}`);
      }
    }
    return null;
  }

  try {
    // Phase 1: hospitals explicitly tagged emergency=yes (accurate for Australian OSM)
    let data = await fetchFromOverpass(queryEmergency);

    // Phase 2: if no ED-tagged hospitals found (very remote area), fall back to all hospitals
    if (data && (data.elements || []).length === 0) {
      console.log(`Emergency hospitals: no emergency=yes results for site ${site.id}, falling back to all hospitals`);
      data = await fetchFromOverpass(queryAllHospitals);
    }

    if (!data) {
      if (cached) {
        try {
          return res.json({ hospitals: JSON.parse(cached.hospitals), what3words: site.what3words || null });
        } catch {}
      }
      return res.json({ hospitals: [], what3words: site.what3words || null });
    }
    const elements = data.elements || [];

    const hospitals = elements
      .map((el: any) => {
        const lat = el.lat || el.center?.lat;
        const lon = el.lon || el.center?.lon;
        if (!lat || !lon) return null;

        const tags = el.tags || {};
        const name = tags.name || tags["name:en"] || "Hospital";

        if (/clinic|medical cent|urgent care|health cent|gp /i.test(name)) return null;

        const distance = haversineDistanceServer(site.lat, site.lon, lat, lon);
        const phone = tags.phone || tags["contact:phone"] || tags["phone:emergency"] || null;

        return {
          name,
          lat,
          lon,
          distanceKm: Math.round(distance * 10) / 10,
          phone,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.distanceKm - b.distanceKm)
      .slice(0, 5);

    await execute(
      'INSERT INTO emergency_hospitals_cache ("siteId", hospitals, "cachedAt") VALUES ($1, $2, $3) ON CONFLICT ("siteId") DO UPDATE SET hospitals = EXCLUDED.hospitals, "cachedAt" = EXCLUDED."cachedAt"',
      [site.id, JSON.stringify(hospitals), new Date().toISOString()]
    );

    res.json({ hospitals, what3words: site.what3words || null });
  } catch (err: any) {
    console.error("Emergency hospitals fetch error:", err.message);
    if (cached) {
      try {
        return res.json({ hospitals: JSON.parse(cached.hospitals), what3words: site.what3words || null });
      } catch {}
    }
    res.json({ hospitals: [], what3words: site.what3words || null });
  }
}));

export default router;
