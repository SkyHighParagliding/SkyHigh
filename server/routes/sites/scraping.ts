import { Router } from "express";
import * as cheerio from 'cheerio';
import { query, queryOne, execute, transaction } from "../../pg.js";
import { SITEGUIDE_VERSION_CHECK_TTL_MS } from "../../constants.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { extractEssentialInfo, isAllowedScrapeUrl } from "../../utils/essentialInfo.js";
import { fetchSiteguideVersion, runVersionCheck, getLastVersionCheck, getLastChangedCheck, getLastDetectedVersion, getChangedSinceLastImport, getLastBulkImportTime } from "../../utils/siteguideVersionCheck.js";
import { extractResponsibleClub } from "../../utils/siteScraper.js";
import { computeContentHash, STATE_ABBREVIATIONS, invalidateSitesCache } from "./helpers.js";
import { triggerBulkImport } from "./bulkImport.js";

const router = Router();

export const externalSitesRouter = Router();

externalSitesRouter.get("/", async (req, res) => {
  try {
    const sites = await query<any>("SELECT * FROM external_site_listings ORDER BY name ASC");
    const mapped = sites.map((s: any) => {
      const firstPart = (s.state || '').split('>')[0].split('-')[0].trim();
      const stateAbbr = STATE_ABBREVIATIONS[firstPart] || firstPart;
      return {
        ...s,
        stateAbbr: s.state ? stateAbbr : null,
        region: s.region || s.state || null,
      };
    });
    res.json(mapped);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/scrape-urls", requireAuth, asyncHandler(async (req, res) => {
  console.log("Starting scraping of siteguide.org.au (all states)...");

  const response = await fetch("https://siteguide.org.au/Sites");
  if (!response.ok) {
    throw new Error(`Failed to fetch siteguide.org.au: ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  function normalizeState(raw: string): { state: string, region: string } {
    const region = raw;
    const firstPart = raw.split('>')[0].split('-')[0].trim();
    const state = STATE_ABBREVIATIONS[firstPart] || firstPart;
    return { state, region };
  }

  const sites: { name: string, url: string, state: string, region: string }[] = [];
  let currentRawState = "";

  $('tr').each((_, row) => {
    const h4 = $(row).find('h4');
    if (h4.length > 0) {
      currentRawState = h4.text().trim();
      return;
    }

    if (currentRawState) {
      const link = $(row).find('td').first().find('a');
      if (link.length > 0) {
        const name = link.text().trim();
        let href = link.attr('href');
        if (name && href) {
          if (!href.startsWith('http')) {
            href = `https://siteguide.org.au${href.startsWith('/') ? '' : '/'}${href}`;
          }
          if (!sites.find(s => s.url === href)) {
            const { state, region } = normalizeState(currentRawState);
            sites.push({ name, url: href, state, region });
          }
        }
      }
    }
  });

  console.log(`Found ${sites.length} sites across all states.`);

  await transaction(async (client) => {
    await client.query("DELETE FROM external_site_listings");
    for (const site of sites) {
      await client.query(
        "INSERT INTO external_site_listings (name, url, state, region) VALUES ($1, $2, $3, $4)",
        [site.name, site.url, site.state, site.region]
      );
    }
  });

  res.json({ success: true, count: sites.length });
}));

router.post("/:id/scrape-essential-info", requireAuth, asyncHandler(async (req, res) => {
  const site = await queryOne<any>(`SELECT id, "siteguideUrl" FROM sites WHERE id = $1`, [req.params.id]);
  if (!site) return res.status(404).json({ error: "Site not found" });
  if (!site.siteguideUrl) return res.status(400).json({ error: "No siteguide URL configured for this site" });
  if (!isAllowedScrapeUrl(site.siteguideUrl)) return res.status(400).json({ error: "URL must be from siteguide.org.au" });

  const scrapeRes = await fetch(site.siteguideUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!scrapeRes.ok) return res.status(502).json({ error: `Failed to fetch siteguide page (${scrapeRes.status})` });

  const html = await scrapeRes.text();
  const newHash = computeContentHash(html);
  const $page = cheerio.load(html);
  const essentialInfo = await extractEssentialInfo($page, site.id, site.siteguideUrl);

  await execute(
    `UPDATE sites SET "essentialInfoImages" = $1, "essentialInfoText" = $2, "contentHash" = $3 WHERE id = $4`,
    [JSON.stringify(essentialInfo.images), essentialInfo.text, newHash, site.id]
  );

  res.json({ success: true, images: essentialInfo.images, textLength: essentialInfo.text.length });
}));

router.put("/:id/essential-info", requireAuth, asyncHandler(async (req, res) => {
  const { images, text } = req.body;
  const site = await queryOne<any>("SELECT id FROM sites WHERE id = $1", [req.params.id]);
  if (!site) return res.status(404).json({ error: "Site not found" });
  await execute(
    `UPDATE sites SET "essentialInfoImages" = $1, "essentialInfoText" = $2 WHERE id = $3`,
    [JSON.stringify(images || []), text || "", req.params.id]
  );
  res.json({ success: true });
}));

let cachedSiteguideVersion: { version: string; fetchedAt: number } | null = null;

router.get("/siteguide-version", requireAuth, asyncHandler(async (_req, res) => {
  if (cachedSiteguideVersion && Date.now() - cachedSiteguideVersion.fetchedAt < SITEGUIDE_VERSION_CHECK_TTL_MS) {
    return res.json({ version: cachedSiteguideVersion.version });
  }
  try {
    const version = await fetchSiteguideVersion();
    cachedSiteguideVersion = { version, fetchedAt: Date.now() };
    res.json({ version });
  } catch (e: any) {
    res.json({ version: null, error: e.message });
  }
}));

router.get("/siteguide-version-check/status", requireAuth, asyncHandler(async (_req, res) => {
  const lastCheck = await getLastVersionCheck();
  const lastChange = await getLastChangedCheck();
  const currentVersion = await getLastDetectedVersion();
  const changedSinceLastImport = await getChangedSinceLastImport();
  const lastBulkImportTime = await getLastBulkImportTime();
  res.json({
    currentVersion,
    changedSinceLastImport,
    lastBulkImportTime,
    lastCheck: lastCheck ? {
      checkedAt: lastCheck.checkedAt,
      detectedVersion: lastCheck.detectedVersion,
      previousVersion: lastCheck.previousVersion,
      changed: !!lastCheck.changed,
      error: lastCheck.error,
    } : null,
    lastChange: lastChange ? {
      checkedAt: lastChange.checkedAt,
      detectedVersion: lastChange.detectedVersion,
      previousVersion: lastChange.previousVersion,
    } : null,
  });
}));

router.post("/siteguide-version-check/run", requireAuth, asyncHandler(async (req, res) => {
  const result = await runVersionCheck();
  const shouldAutoImport = result.changed || await getChangedSinceLastImport();

  if (shouldAutoImport) {
    const autoEnabled = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'autoImportEnabled'");
    const lastState = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'lastImportedState'");
    const requestState = req.body?.state as string | undefined;
    const importState = requestState || lastState?.value;

    if (autoEnabled?.value !== "false" && importState) {
      const importResult = await triggerBulkImport(importState);
      (result as any).autoImportTriggered = importResult.started;
      (result as any).autoImportError = importResult.error || null;
    } else if (!importState) {
      (result as any).autoImportTriggered = false;
      (result as any).autoImportError = "No state configured. Select a state and run Import Sites first.";
    }
  }

  res.json(result);
}));

router.post("/check-changes", requireAuth, asyncHandler(async (req, res) => {
  const { state } = req.body;
  if (!state) return res.status(400).json({ error: "State is required" });

  const abbrToFull: Record<string, string> = {};
  for (const [full, abbr] of Object.entries(STATE_ABBREVIATIONS)) {
    abbrToFull[abbr] = full;
  }
  const fullStateName = abbrToFull[state] || state;
  const externalSites = await query<{ name: string, url: string }>(
    "SELECT name, url FROM external_site_listings WHERE state = $1 OR state LIKE $2 OR state LIKE $3 ORDER BY name",
    [state, state + ' >%', fullStateName + ' >%']
  );

  if (externalSites.length === 0) {
    return res.status(404).json({ error: `No sites found for state: ${state}` });
  }

  const results: { name: string, status: string, url: string }[] = [];

  for (const ext of externalSites) {
    try {
      const scrapeRes = await fetch(ext.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(10000),
      });
      if (!scrapeRes.ok) {
        results.push({ name: ext.name, status: "error", url: ext.url });
        continue;
      }
      const html = await scrapeRes.text();
      const newHash = computeContentHash(html);
      const existing = await queryOne<{ contentHash: string | null }>(
        `SELECT "contentHash" FROM sites WHERE "siteguideUrl" = $1`,
        [ext.url]
      );

      if (!existing) {
        results.push({ name: ext.name, status: "new", url: ext.url });
      } else if (!existing.contentHash || existing.contentHash !== newHash) {
        results.push({ name: ext.name, status: "changed", url: ext.url });
      } else {
        results.push({ name: ext.name, status: "unchanged", url: ext.url });
      }
    } catch {
      results.push({ name: ext.name, status: "error", url: ext.url });
    }
  }

  const changed = results.filter(r => r.status === "changed");
  const newSites = results.filter(r => r.status === "new");
  const unchanged = results.filter(r => r.status === "unchanged");
  const errors = results.filter(r => r.status === "error");

  res.json({
    total: results.length,
    changed: changed.length,
    new: newSites.length,
    unchanged: unchanged.length,
    errors: errors.length,
    changedSites: changed.map(r => r.name),
    newSites: newSites.map(r => r.name),
    results,
  });
}));

router.post("/scan-club-sites", requireAuth, asyncHandler(async (req: any, res) => {
  const results: { name: string; siteguideUrl: string; responsibleClub: string; isSkyHighSite: boolean; matched: boolean; dbSiteId?: string }[] = [];

  const indexResponse = await fetch('https://siteguide.org.au/Sites', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SkyHighBot/1.0)' },
  });
  if (!indexResponse.ok) {
    return res.status(502).json({ error: 'Failed to fetch siteguide.org.au index' });
  }
  const indexHtml = await indexResponse.text();
  const $index = cheerio.load(indexHtml);

  const vicSites: { name: string; url: string }[] = [];
  let inVictoria = false;
  $index('h4, tr').each((_i, el) => {
    const tag = (el as any).tagName?.toUpperCase();
    if (tag === 'H4') {
      const headerText = $index(el).text().trim();
      inVictoria = /^victoria/i.test(headerText);
    } else if (tag === 'TR' && inVictoria) {
      const firstTd = $index(el).find('td').first();
      const link = firstTd.find('a');
      if (link.length) {
        const name = link.text().trim();
        const href = link.attr('href');
        if (name && href) {
          const fullUrl = href.startsWith('http') ? href : `https://siteguide.org.au${href}`;
          vicSites.push({ name, url: fullUrl });
        }
      }
    }
  });

  const allDbSites = await query<{ id: string; name: string }>("SELECT id, name FROM sites");

  function normalizeForMatch(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  for (const vs of vicSites) {
    try {
      const pageResponse = await fetch(vs.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SkyHighBot/1.0)' },
      });
      if (!pageResponse.ok) {
        results.push({ name: vs.name, siteguideUrl: vs.url, responsibleClub: '', isSkyHighSite: false, matched: false });
        continue;
      }
      const html = await pageResponse.text();
      const responsibleClub = extractResponsibleClub(html);
      const isSkyHigh = /sky\s*high/i.test(responsibleClub);

      const normalizedSgName = normalizeForMatch(vs.name);
      const matchedSite = allDbSites.find(dbSite => {
        const normalizedDbName = normalizeForMatch(dbSite.name);
        return normalizedDbName === normalizedSgName ||
               normalizedDbName.includes(normalizedSgName) ||
               normalizedSgName.includes(normalizedDbName);
      });

      if (matchedSite) {
        await execute(
          `UPDATE sites SET "isSkyHighSite" = $1, "siteguideUrl" = COALESCE("siteguideUrl", $2) WHERE id = $3`,
          [isSkyHigh ? 'true' : 'false', vs.url, matchedSite.id]
        );
        results.push({ name: vs.name, siteguideUrl: vs.url, responsibleClub, isSkyHighSite: isSkyHigh, matched: true, dbSiteId: matchedSite.id });
      } else {
        results.push({ name: vs.name, siteguideUrl: vs.url, responsibleClub, isSkyHighSite: isSkyHigh, matched: false });
      }

      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (e: any) {
      results.push({ name: vs.name, siteguideUrl: vs.url, responsibleClub: '', isSkyHighSite: false, matched: false });
    }
  }

  const clubSites = results.filter(r => r.isSkyHighSite);
  const matchedCount = results.filter(r => r.matched).length;
  res.json({
    total: results.length,
    clubSites: clubSites.length,
    nonClubSites: results.length - clubSites.length,
    matchedToDb: matchedCount,
    unmatchedSites: results.filter(r => !r.matched).map(r => r.name),
    results,
  });
}));

export default router;
