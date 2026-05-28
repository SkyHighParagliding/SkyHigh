import { Router } from "express";
import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { query, queryOne, execute } from "../../pg.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { parseAiJsonResponse } from "../../utils/aiJsonParser.js";
import { generateTextWithFallback } from "../../utils/aiModels.js";
import { extractEssentialInfo } from "../../utils/essentialInfo.js";
import { fetchSiteguideVersion, getLastDetectedVersion, getVersionBeforeLastChange } from "../../utils/siteguideVersionCheck.js";
import { scrapeSiteguidePage, extractResponsibleClub } from "../../utils/siteScraper.js";
import {
  STATE_ABBREVIATIONS, normaliseWindDir, normaliseWindSpeed, normalisePgRating,
  computeContentHash, getDefaultSiteImage, calculateHeights, archiveSitesBeforeImport,
  invalidateSitesCache,
} from "./helpers.js";

const router = Router();

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

let bulkImportProgress: {
  running: boolean;
  total: number;
  completed: number;
  remaining: number;
  currentSite: string;
  results: { name: string; status: string; error?: string }[];
  done: boolean;
  summary?: any;
} | null = null;

router.get("/bulk-import/progress", (req, res) => {
  if (!bulkImportProgress) {
    return res.json({ running: false });
  }
  res.json(bulkImportProgress);
});

router.post("/bulk-import", requireAuth, asyncHandler(async (req, res) => {
  const { state, missingWindOnly } = req.body;
  if (!state) {
    return res.status(400).json({ error: "State is required" });
  }

  const validStates = Object.values(STATE_ABBREVIATIONS) as string[];
  if (!validStates.includes(state)) {
    return res.status(400).json({ error: `Invalid state. Must be one of: ${validStates.join(", ")}` });
  }

  if (bulkImportProgress?.running) {
    return res.status(409).json({ error: "A bulk import is already in progress" });
  }

  const apiKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Gemini API key not configured" });
  }

  const abbrToFull: Record<string, string> = {};
  for (const [full, abbr] of Object.entries(STATE_ABBREVIATIONS)) {
    abbrToFull[abbr] = full;
  }
  const fullStateName = abbrToFull[state] || state;
  let sitesToImport = await query<{ name: string, url: string }>(
    "SELECT name, url FROM external_site_listings WHERE state = $1 OR state LIKE $2 OR state LIKE $3 ORDER BY name",
    [state, state + ' >%', fullStateName + ' >%']
  );
  if (sitesToImport.length === 0) {
    return res.status(404).json({ error: `No sites found for state: ${state}` });
  }

  if (missingWindOnly) {
    const sitesWithWind = await query<{ siteguideUrl: string }>(
      `SELECT "siteguideUrl" FROM sites WHERE "windDir" IS NOT NULL AND "windDir" != ''`
    );
    const urlsWithWind = new Set(sitesWithWind.map(s => s.siteguideUrl));
    sitesToImport = sitesToImport.filter(s => !urlsWithWind.has(s.url));
    if (sitesToImport.length === 0) {
      return res.json({ success: true, total: 0, created: 0, updated: 0, errors: 0, skipped: 0, results: [], message: "All sites already have wind data" });
    }
  }

  bulkImportProgress = {
    running: true,
    total: sitesToImport.length,
    completed: 0,
    remaining: sitesToImport.length,
    currentSite: "",
    results: [],
    done: false,
  };

  await execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    ["lastImportedState", state]
  );

  res.json({ success: true, started: true, total: sitesToImport.length });

  runBulkImportLoop(sitesToImport, apiKey);
}));

async function runBulkImportLoop(sitesToImport: { name: string, url: string }[], apiKey: string) {
  try {
    const promptRow = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'aiSystemPrompt'");
    const systemPrompt = promptRow?.value || "";
    const ai = new GoogleGenAI({ apiKey });
    let siteguideVersion: string | null = null;
    try {
      siteguideVersion = await fetchSiteguideVersion();
      console.log(`Bulk import: Siteguide database version: ${siteguideVersion}`);
    } catch (e) {
      console.log("Bulk import: Could not fetch siteguide version from About page");
    }

    const archiveVersion = await getVersionBeforeLastChange() || await getLastDetectedVersion() || `pre-import-${Date.now()}`;
    const archived = await archiveSitesBeforeImport(archiveVersion);
    if (archived) {
      console.log(`Bulk import: Archived current sites under version ${archiveVersion}`);
    } else {
      console.log(`Bulk import: Archive already exists for version ${archiveVersion}, skipping`);
    }

    const scrapedAt = new Date().toISOString();

    for (const externalSite of sitesToImport) {
      if (!bulkImportProgress) break;
      bulkImportProgress.currentSite = externalSite.name;
      try {
        const skipCheck = await queryOne<{ skipBulkImport: string }>(
          `SELECT "skipBulkImport" FROM sites WHERE "siteguideUrl" = $1`,
          [externalSite.url]
        );
        if (skipCheck?.skipBulkImport === "true") {
          bulkImportProgress.completed++;
          bulkImportProgress.remaining = bulkImportProgress.total - bulkImportProgress.completed;
          bulkImportProgress.results.push({ name: externalSite.name, status: "skipped", error: "Excluded from bulk import" });
          console.log(`  Skipped ${externalSite.name} — excluded from bulk import`);
          continue;
        }

        console.log(`Bulk import: Processing ${externalSite.name} (${externalSite.url})`);

        const scrapeRes = await fetch(externalSite.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (!scrapeRes.ok) {
          bulkImportProgress.completed++;
          bulkImportProgress.remaining = bulkImportProgress.total - bulkImportProgress.completed;
          bulkImportProgress.results.push({ name: externalSite.name, status: "error", error: `Failed to fetch (${scrapeRes.status})` });
          continue;
        }

        const html = await scrapeRes.text();

        const newHash = computeContentHash(html);
        const existingSite = await queryOne<{ id: string, contentHash: string | null }>(
          `SELECT id, "contentHash" FROM sites WHERE "siteguideUrl" = $1`,
          [externalSite.url]
        );
        if (existingSite?.contentHash && existingSite.contentHash === newHash) {
          bulkImportProgress.completed++;
          bulkImportProgress.remaining = bulkImportProgress.total - bulkImportProgress.completed;
          bulkImportProgress.results.push({ name: externalSite.name, status: "unchanged", error: undefined as any });
          console.log(`  Skipped ${externalSite.name} — content unchanged (hash match)`);
          continue;
        }

        const { allText, isSiteClosed, isRestricted, $ } = scrapeSiteguidePage(html);

        if (!allText || allText.length < 50) {
          bulkImportProgress.completed++;
          bulkImportProgress.remaining = bulkImportProgress.total - bulkImportProgress.completed;
          bulkImportProgress.results.push({ name: externalSite.name, status: "skipped", error: "Not enough content" });
          continue;
        }

        const directResponsibleClub = extractResponsibleClub(html);

        const finalPrompt = `${systemPrompt}\n\nTEXT CONTENT:\n${allText}`;
        const { text: responseText } = await generateTextWithFallback(ai, {
          contents: finalPrompt,
        });
        let aiData;
        try {
          aiData = parseAiJsonResponse(responseText);
        } catch {
          bulkImportProgress.completed++;
          bulkImportProgress.remaining = bulkImportProgress.total - bulkImportProgress.completed;
          bulkImportProgress.results.push({ name: externalSite.name, status: "error", error: "Generation returned invalid JSON" });
          continue;
        }

        const effectiveResponsibleClub = aiData.responsibleClub || directResponsibleClub;
        const isSkyHigh = /sky\s*high/i.test(effectiveResponsibleClub);

        const siteId = (aiData.name || externalSite.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const siteType = (aiData.type || "").toLowerCase().includes("inland") ? "Inland" : "Coastal";

        const essentialInfo = await extractEssentialInfo($, siteId, externalSite.url);
        if (essentialInfo.images.length > 0) {
          console.log(`  Essential info: ${essentialInfo.images.length} map image(s) saved`);
        }

        const siteData = {
          id: siteId,
          name: aiData.name || externalSite.name,
          type: siteType,
          pgRating: normalisePgRating(aiData.pgRating) || null,
          hgRating: aiData.hgRating || null,
          windDir: normaliseWindDir(aiData.windDir) || null,
          windSpeed: normaliseWindSpeed(aiData.windSpeed) || null,
          status: isSiteClosed ? "closed" : isRestricted ? "restricted" : "open",
          hazardLevel: "low",
          lat: aiData.lat ? parseFloat(aiData.lat) : null,
          lon: aiData.lon ? parseFloat(aiData.lon) : null,
          description: aiData.siteOverview || null,
          launch: aiData.launchArea || null,
          landing: aiData.landingZones || null,
          hazards: JSON.stringify(aiData.knownHazards || []),
          rules: JSON.stringify(aiData.siteRules || []),
          image: await getDefaultSiteImage(siteType),
          useLiveWeather: 'false',
          liveStationId: aiData.liveStationId || null,
          siteguideUrl: externalSite.url,
          siteContact: aiData.siteContact || null,
          siteContactPhone: aiData.siteContactPhone || null,
          navigateTo: aiData.navigateTo || null,
          launchHeight: aiData.launchHeight || null,
          launchHeightHigh: null as string | null,
          hoodedPloversLink: aiData.hoodedPloversLink || null,
          emergencyMarker: aiData.emergencyMarker || null,
          what3words: aiData.what3words || null,
          weatherStationLink: null,
          isSkyHighSite: isSkyHigh ? 'true' : 'false',
          crossLeft: 'true',
          crossRight: 'true',
          essentialInfoImages: JSON.stringify(essentialInfo.images),
          essentialInfoText: essentialInfo.text,
          unassignedText: aiData.unassignedText || "",
          siteguideVersion: siteguideVersion,
          siteguideScrapedAt: scrapedAt,
          contentHash: newHash,
        };

        if (siteData.launchHeight && siteData.lat != null && siteData.lon != null) {
          try {
            const heights = await calculateHeights(siteData.launchHeight, siteData.lat, siteData.lon);
            if (heights.amsl) siteData.launchHeight = heights.amsl;
            if (heights.rh) siteData.launchHeightHigh = heights.rh;
          } catch {}
        }

        const existingByUrl = await queryOne<{ id: string }>(
          `SELECT id FROM sites WHERE "siteguideUrl" = $1`,
          [externalSite.url]
        );
        const existingById = await queryOne<{ id: string }>(
          "SELECT id FROM sites WHERE id = $1",
          [siteId]
        );
        const existing = existingByUrl || existingById;
        if (existing) {
          siteData.id = existing.id;
          await execute(`
            UPDATE sites SET
              type=$1, lat=COALESCE($2, lat), lon=COALESCE($3, lon),
              description=$4, launch=$5, landing=$6, hazards=$7, rules=$8,
              "siteguideUrl"=$9, "siteContact"=COALESCE($10, "siteContact"), "siteContactPhone"=COALESCE($11, "siteContactPhone"),
              "navigateTo"=COALESCE($12, "navigateTo"), "launchHeight"=COALESCE($13, "launchHeight"), "launchHeightHigh"=COALESCE($14, "launchHeightHigh"),
              "hoodedPloversLink"=COALESCE($15, "hoodedPloversLink"),
              "emergencyMarker"=COALESCE($16, "emergencyMarker"), "what3words"=COALESCE($17, "what3words"),
              "essentialInfoImages"=$18, "essentialInfoText"=$19,
              "unassignedText"=CASE WHEN $20::text != '' THEN $20 ELSE COALESCE("unassignedText", $20) END,
              "siteguideVersion"=$21, "siteguideScrapedAt"=$22, "contentHash"=$23,
              "pgRating"=COALESCE("pgRating", $24), "hgRating"=COALESCE("hgRating", $25),
              "windDir"=COALESCE("windDir", $26), "windSpeed"=COALESCE("windSpeed", $27),
              "isSkyHighSite"=$28
            WHERE id=$29
          `, [
            siteData.type,           // $1
            siteData.lat,            // $2
            siteData.lon,            // $3
            siteData.description,    // $4
            siteData.launch,         // $5
            siteData.landing,        // $6
            siteData.hazards,        // $7
            siteData.rules,          // $8
            siteData.siteguideUrl,   // $9
            siteData.siteContact,    // $10
            siteData.siteContactPhone, // $11
            siteData.navigateTo,     // $12
            siteData.launchHeight,   // $13
            siteData.launchHeightHigh, // $14
            siteData.hoodedPloversLink, // $15
            siteData.emergencyMarker, // $16
            siteData.what3words,     // $17
            siteData.essentialInfoImages, // $18
            siteData.essentialInfoText,   // $19
            siteData.unassignedText, // $20
            siteData.siteguideVersion,    // $21
            siteData.siteguideScrapedAt,  // $22
            siteData.contentHash,    // $23
            siteData.pgRating,       // $24
            siteData.hgRating,       // $25
            siteData.windDir,        // $26
            siteData.windSpeed,      // $27
            siteData.isSkyHighSite,  // $28
            siteData.id,             // $29
          ]);
          bulkImportProgress!.completed++;
          bulkImportProgress!.remaining = bulkImportProgress!.total - bulkImportProgress!.completed;
          bulkImportProgress!.results.push({ name: siteData.name, status: "updated" });
        } else {
          await execute(`
            INSERT INTO sites (id, name, type, "pgRating", "hgRating", "windDir", "windSpeed", status, hazardLevel, lat, lon, description, launch, landing, hazards, rules, image, "useLiveWeather", "liveStationId", "siteguideUrl", "siteContact", "siteContactPhone", "navigateTo", "launchHeight", "launchHeightHigh", "hoodedPloversLink", "emergencyMarker", "what3words", "weatherStationLink", "isSkyHighSite", "crossLeft", "crossRight", "essentialInfoImages", "essentialInfoText", "unassignedText", "siteguideVersion", "siteguideScrapedAt", "contentHash")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38)
          `, [
            siteData.id,             // $1
            siteData.name,           // $2
            siteData.type,           // $3
            siteData.pgRating,       // $4
            siteData.hgRating,       // $5
            siteData.windDir,        // $6
            siteData.windSpeed,      // $7
            siteData.status,         // $8
            siteData.hazardLevel,    // $9
            siteData.lat,            // $10
            siteData.lon,            // $11
            siteData.description,    // $12
            siteData.launch,         // $13
            siteData.landing,        // $14
            siteData.hazards,        // $15
            siteData.rules,          // $16
            siteData.image,          // $17
            siteData.useLiveWeather, // $18
            siteData.liveStationId,  // $19
            siteData.siteguideUrl,   // $20
            siteData.siteContact,    // $21
            siteData.siteContactPhone, // $22
            siteData.navigateTo,     // $23
            siteData.launchHeight,   // $24
            siteData.launchHeightHigh, // $25
            siteData.hoodedPloversLink, // $26
            siteData.emergencyMarker, // $27
            siteData.what3words,     // $28
            siteData.weatherStationLink, // $29
            siteData.isSkyHighSite,  // $30
            siteData.crossLeft,      // $31
            siteData.crossRight,     // $32
            siteData.essentialInfoImages, // $33
            siteData.essentialInfoText,   // $34
            siteData.unassignedText, // $35
            siteData.siteguideVersion,    // $36
            siteData.siteguideScrapedAt,  // $37
            siteData.contentHash,    // $38
          ]);
          bulkImportProgress!.completed++;
          bulkImportProgress!.remaining = bulkImportProgress!.total - bulkImportProgress!.completed;
          bulkImportProgress!.results.push({ name: siteData.name, status: "created" });
        }

        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (e: any) {
        console.error(`Bulk import error for ${externalSite.name}:`, e);
        bulkImportProgress!.completed++;
        bulkImportProgress!.remaining = bulkImportProgress!.total - bulkImportProgress!.completed;
        bulkImportProgress!.results.push({ name: externalSite.name, status: "error", error: e.message || "Unknown error" });
      }
    }

    // Trigger weather scrape after import (use APP_URL in production, localhost in dev)
    const scrapeUrl = process.env.APP_URL
      ? `${process.env.APP_URL}/api/weather/scrape-now`
      : "http://localhost:3001/api/weather/scrape-now";
    fetch(scrapeUrl, { method: "POST" }).catch(() => {});

    finalizeBulkImport();
  } catch (err: any) {
    console.error("Bulk import fatal error:", err);
    finalizeBulkImport();
  } finally {
    setTimeout(() => { bulkImportProgress = null; }, 60000);
  }
}

function finalizeBulkImport() {
  if (bulkImportProgress) {
    bulkImportProgress.done = true;
    bulkImportProgress.running = false;
    bulkImportProgress.summary = {
      total: bulkImportProgress.total,
      created: bulkImportProgress.results.filter(r => r.status === "created").length,
      updated: bulkImportProgress.results.filter(r => r.status === "updated").length,
      unchanged: bulkImportProgress.results.filter(r => r.status === "unchanged").length,
      errors: bulkImportProgress.results.filter(r => r.status === "error").length,
      skipped: bulkImportProgress.results.filter(r => r.status === "skipped").length,
      results: bulkImportProgress.results,
    };
  }
}

export async function triggerBulkImport(state: string): Promise<{ started: boolean; error?: string }> {
  if (bulkImportProgress?.running) {
    return { started: false, error: "A bulk import is already in progress" };
  }

  const validStates = Object.values(STATE_ABBREVIATIONS) as string[];
  if (!validStates.includes(state)) {
    return { started: false, error: `Invalid state. Must be one of: ${validStates.join(", ")}` };
  }

  const apiKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { started: false, error: "Gemini API key not configured" };
  }

  const abbrToFull: Record<string, string> = {};
  for (const [full, abbr] of Object.entries(STATE_ABBREVIATIONS)) {
    abbrToFull[abbr] = full;
  }
  const fullStateName = abbrToFull[state] || state;
  const sitesToImport = await query<{ name: string, url: string }>(
    "SELECT name, url FROM external_site_listings WHERE state = $1 OR state LIKE $2 OR state LIKE $3 ORDER BY name",
    [state, state + ' >%', fullStateName + ' >%']
  );

  if (sitesToImport.length === 0) {
    return { started: false, error: `No sites found for state: ${state}` };
  }

  bulkImportProgress = {
    running: true,
    total: sitesToImport.length,
    completed: 0,
    remaining: sitesToImport.length,
    currentSite: "",
    results: [],
    done: false,
  };

  await execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    ["lastImportedState", state]
  );

  runBulkImportLoop(sitesToImport, apiKey);

  return { started: true };
}

export default router;
