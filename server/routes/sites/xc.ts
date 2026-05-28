import { Router } from "express";
import { query } from "../../pg.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { getZoneData, getAirspaceData, downloadAndParseZones, downloadAndParseAirspace, downloadAllZoneData, invalidateCache, getZoneDataVersion } from "../../utils/siteguideZoneData.js";

interface XCSiteRow {
  id: number;
  name: string;
  type: string;
  lat: number;
  lon: number;
  windDir: string;
  launchHeight: number;
  status: string;
  useLiveWeather: string;
}

interface AltLimit {
  value: number;
  unit: number;
  referenceDatum: number;
}

interface OpenAIPFeature {
  type: string;
  geometry: GeoJSON.Geometry;
  properties: {
    name?: string;
    type?: number;
    icaoClass?: number;
    lowerLimit?: AltLimit;
    upperLimit?: AltLimit;
  };
}

interface OpenAIPResponse {
  features: OpenAIPFeature[];
}

const router = Router();

router.get("/xc/sites", async (req, res) => {
  try {
    const sites = await query<XCSiteRow>(
      `SELECT id, name, type, lat, lon, "windDir", "launchHeight", status, "useLiveWeather"
       FROM sites
       WHERE "isXCSite" = 'true' AND lat IS NOT NULL AND lon IS NOT NULL AND status != 'closed'
       ORDER BY name ASC`
    );
    res.json(sites);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});

const OPENAIP_URL = "https://storage.googleapis.com/29f98e10-a489-4c82-ae5e-489dbcd4912f/au_asp.geojson";

const AIRSPACE_TYPE_MAP: Record<number, string> = {
  0: "OTHER", 1: "RESTRICTED", 2: "DANGER", 3: "PROHIBITED",
  4: "CTR", 5: "TMA", 6: "TMZ", 7: "RMZ", 8: "FIR",
  13: "CTA", 14: "OCA", 19: "ALERT", 20: "WARNING",
  21: "PROTECTED", 25: "TIZ", 26: "TIA", 27: "MBZ",
  23: "GLIDING_SECTOR", 29: "WAVE_WINDOW",
};

const ICAO_CLASS_MAP: Record<number, string> = {
  0: "A", 1: "B", 2: "C", 3: "D", 4: "E", 5: "F", 6: "G",
  7: "SUA", 8: "UNCLASSIFIED",
};

function altToFeet(limit: AltLimit | null | undefined): number {
  if (!limit) return 0;
  if (limit.unit === 6) return limit.value * 100;
  return limit.value;
}

router.get("/xc/airspace", asyncHandler(async (req, res) => {
  try {
    const siteguideAirspace = getAirspaceData();
    if (siteguideAirspace && siteguideAirspace.features.length > 0) {
      return res.json(siteguideAirspace);
    }

    try {
      const downloaded = await downloadAndParseAirspace();
      if (downloaded.features.length > 0) {
        return res.json(downloaded);
      }
    } catch {
    }

    const resp = await fetch(OPENAIP_URL);
    if (!resp.ok) return res.status(502).json({ error: "Failed to fetch airspace data" });

    const raw = (await resp.json()) as OpenAIPResponse;
    const features = raw.features
      .map((f: OpenAIPFeature) => {
        const lowerFt = altToFeet(f.properties.lowerLimit);
        const upperFt = altToFeet(f.properties.upperLimit);
        if (lowerFt > 10000) return null;
        const cappedUpper = Math.min(upperFt, 10000);

        const typeCode = f.properties.type ?? 0;
        const icaoCode = f.properties.icaoClass ?? 8;
        const typeName = AIRSPACE_TYPE_MAP[typeCode] || "OTHER";
        const icaoName = ICAO_CLASS_MAP[icaoCode] || "UNCLASSIFIED";
        const name = f.properties.name || "Unknown";
        const isCert = name.includes("CERT");
        const isUncr = name.includes("UNCR");

        return {
          type: "Feature" as const,
          geometry: f.geometry,
          properties: {
            name,
            typeName,
            icaoClass: icaoName,
            lowerFt,
            upperFt: cappedUpper,
            lowerRef: f.properties.lowerLimit?.referenceDatum ?? 0,
            upperRef: f.properties.upperLimit?.referenceDatum ?? 0,
            isCertified: isCert,
            isUncertified: isUncr,
          },
        };
      })
      .filter(Boolean);

    const result = { type: "FeatureCollection", features };
    res.json(result);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
}));

router.get("/xc/zones", asyncHandler(async (req, res) => {
  try {
    let data = getZoneData();
    if (data && data.features.length > 0) {
      return res.json(data);
    }

    data = await downloadAndParseZones();
    res.json(data);
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
}));

router.post("/xc/zones/refresh", requireAuth, asyncHandler(async (req, res) => {
  try {
    invalidateCache();
    const result = await downloadAllZoneData();
    res.json({ message: `Refreshed: ${result.zones} zones, ${result.airspace} airspace features` });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
}));

router.get("/xc/zones/version", asyncHandler(async (req, res) => {
  const version = await getZoneDataVersion();
  res.json({ version });
}));

export default router;
