import { Router } from "express";
import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import db from "../../db.js";
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
  let sitesToImport = await db.prepare(
    "SELECT name, url FROM external_site_listings WHERE state = ? OR state LIKE ? OR state LIKE ? ORDER BY name"
  ).all(state, state + ' >%', fullStateName + ' >%') as { name: string, url: string }[];
  if (sitesToImport.length === 0) {
    return res.status(404).json({ error: `No sites found for state: ${state}` });
  }

  if (missingWindOnly) {
    const sitesWithWind = await db.prepare(
      "SELECT siteguideUrl FROM sites WHERE windDir IS NOT NULL AND windDir != ''"
    ).all() as { siteguideUrl: string }[];
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

  await db.prepare("INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = @value")
    .run({ key: "lastImportedState", value: state });

  res.json({ success: true, started: true, total: sitesToImport.length });

  runBulkImportLoop(sitesToImport, apiKey);
}));

async function runBulkImportLoop(sitesToImport: { name: string, url: string }[], apiKey: string) {
  try {
    const promptRow = await db.prepare("SELECT value FROM settings WHERE key = 'aiSystemPrompt'").get() as { value: string } | undefined;
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
        const skipCheck = await db.prepare("SELECT skipBulkImport FROM sites WHERE siteguideUrl = ?").get(externalSite.url) as { skipBulkImport: string } | undefined;
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
        const existingSite = await db.prepare("SELECT id, contentHash FROM sites WHERE siteguideUrl = ?").get(externalSite.url) as { id: string, contentHash: string | null } | undefined;
        if (existingSite?.contentHash && existingSite.contentHash === newHash) {
          bulkImportProgress.completed++;
          bulkImportProgress.remaining = bulkImportProgress.total - bulkImportProgress.completed;
          bulkImportProgress.results.push({ name: externalSite.name, status: "unchanged", error: undefined as any });
          console.log(`  Skipped ${externalSite.name} — content unchanged (hash match)`);
          continue;
        }

        const { allText, isSiteClosed, $ } = scrapeSiteguidePage(html);

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
          status: isSiteClosed ? "closed" : "open",
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

        const existingByUrl = await db.prepare("SELECT id FROM sites WHERE siteguideUrl = ?").get(externalSite.url) as { id: string } | undefined;
        const existingById = await db.prepare("SELECT id FROM sites WHERE id = ?").get(siteId) as { id: string } | undefined;
        const existing = existingByUrl || existingById;
        if (existing) {
          siteData.id = existing.id;
          await db.prepare(`
            UPDATE sites SET
              type=@type, lat=COALESCE(@lat, lat), lon=COALESCE(@lon, lon),
              description=@description, launch=@launch, landing=@landing, hazards=@hazards, rules=@rules,
              siteguideUrl=@siteguideUrl, siteContact=COALESCE(@siteContact, siteContact), siteContactPhone=COALESCE(@siteContactPhone, siteContactPhone),
              navigateTo=COALESCE(@navigateTo, navigateTo), launchHeight=COALESCE(@launchHeight, launchHeight), launchHeightHigh=COALESCE(@launchHeightHigh, launchHeightHigh),
              hoodedPloversLink=COALESCE(@hoodedPloversLink, hoodedPloversLink),
              emergencyMarker=COALESCE(@emergencyMarker, emergencyMarker), what3words=COALESCE(@what3words, what3words),
              essentialInfoImages=@essentialInfoImages, essentialInfoText=@essentialInfoText,
              unassignedText=CASE WHEN @unassignedText::text != '' THEN @unassignedText ELSE COALESCE(unassignedText, @unassignedText) END,
              siteguideVersion=@siteguideVersion, siteguideScrapedAt=@siteguideScrapedAt, contentHash=@contentHash,
              pgRating=COALESCE(pgRating, @pgRating), hgRating=COALESCE(hgRating, @hgRating),
              windDir=COALESCE(windDir, @windDir), windSpeed=COALESCE(windSpeed, @windSpeed),
              isSkyHighSite=@isSkyHighSite
            WHERE id=@id
          `).run(siteData);
          bulkImportProgress!.completed++;
          bulkImportProgress!.remaining = bulkImportProgress!.total - bulkImportProgress!.completed;
          bulkImportProgress!.results.push({ name: siteData.name, status: "updated" });
        } else {
          await db.prepare(`
            INSERT INTO sites (id, name, type, pgRating, hgRating, windDir, windSpeed, status, hazardLevel, lat, lon, description, launch, landing, hazards, rules, image, useLiveWeather, liveStationId, siteguideUrl, siteContact, siteContactPhone, navigateTo, launchHeight, launchHeightHigh, hoodedPloversLink, emergencyMarker, what3words, weatherStationLink, isSkyHighSite, crossLeft, crossRight, essentialInfoImages, essentialInfoText, unassignedText, siteguideVersion, siteguideScrapedAt, contentHash)
            VALUES (@id, @name, @type, @pgRating, @hgRating, @windDir, @windSpeed, @status, @hazardLevel, @lat, @lon, @description, @launch, @landing, @hazards, @rules, @image, @useLiveWeather, @liveStationId, @siteguideUrl, @siteContact, @siteContactPhone, @navigateTo, @launchHeight, @launchHeightHigh, @hoodedPloversLink, @emergencyMarker, @what3words, @weatherStationLink, @isSkyHighSite, @crossLeft, @crossRight, @essentialInfoImages, @essentialInfoText, @unassignedText, @siteguideVersion, @siteguideScrapedAt, @contentHash)
          `).run(siteData);
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

    fetch("http://localhost:3001/api/weather/scrape-now", { method: "POST" }).catch(() => {});

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

  const apiKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { started: false, error: "Gemini API key not configured" };
  }

  const abbrToFull: Record<string, string> = {};
  for (const [full, abbr] of Object.entries(STATE_ABBREVIATIONS)) {
    abbrToFull[abbr] = full;
  }
  const fullStateName = abbrToFull[state] || state;
  const sitesToImport = await db.prepare(
    "SELECT name, url FROM external_site_listings WHERE state = ? OR state LIKE ? OR state LIKE ? ORDER BY name"
  ).all(state, state + ' >%', fullStateName + ' >%') as { name: string, url: string }[];

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

  await db.prepare("INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = @value")
    .run({ key: "lastImportedState", value: state });

  runBulkImportLoop(sitesToImport, apiKey);

  return { started: true };
}

export default router;
