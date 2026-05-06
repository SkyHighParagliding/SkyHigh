import { Router } from "express";
import db from "../../db.js";
import { requireAuth, requireSOOrAdmin } from "../../middleware/auth.js";
import { invalidateSearchCaches } from "../search.js";
import {
  invalidateSitesCache, getPublicSitesCache, setPublicSitesCache, isCacheValid,
  normaliseWindDir, normaliseWindSpeed, normalisePgRating, getDefaultSiteImage,
} from "./helpers.js";
import { getPaginationParams, createPaginatedResponse } from "../../utils/pagination.js";

const safeJsonParse = (json: string | null, fallback: any = []): any => {
  try {
    return JSON.parse(json || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};

const router = Router();

router.get("/", async (req, res) => {
  try {
    const isPublic = req.query.public === "true";

    const { limit, offset } = getPaginationParams(req.query);
    const hasCustomPagination = req.query.limit || req.query.offset;

    if (isPublic && !hasCustomPagination && isCacheValid()) {
      res.set('Cache-Control', 'public, max-age=30');
      return res.json(getPublicSitesCache());
    }
    let sites = await db.prepare("SELECT * FROM sites ORDER BY name ASC LIMIT ? OFFSET ?").all(limit, offset) as any[];

    if (isPublic) {
      const hideClosedSetting = await db.prepare("SELECT value FROM settings WHERE key = 'hideClosedSites'").get() as { value: string } | undefined;
      if (hideClosedSetting?.value === "true") {
        sites = sites.filter((s: any) => s.status !== "closed" || s.overrideHideClosed === "true" || s.temporarilyClosed === 1);
      }
    }

    const countResult = await db.prepare("SELECT COUNT(*) as count FROM sites").get() as { count: number };
    const mapped = sites.map((s: any) => ({
        ...s,
        hazards: safeJsonParse(s.hazards),
        rules: safeJsonParse(s.rules),
    }));

    if (isPublic && !hasCustomPagination) {
      setPublicSitesCache(mapped);
      res.set('Cache-Control', 'public, max-age=30');
    }

    res.json(createPaginatedResponse(mapped, countResult.count, limit, offset));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const site = await db.prepare("SELECT * FROM sites WHERE id = ?").get(req.params.id) as any;
    if (site) {
      res.json({
          ...site,
          hazards: safeJsonParse(site.hazards),
          rules: safeJsonParse(site.rules),
          essentialInfoImages: safeJsonParse(site.essentialInfoImages),
      });
    } else {
      res.status(404).json({ error: "Site not found" });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const { id, name, type, pgRating, hgRating, windDir, windSpeed, status, hazardLevel, lat, lon, description, launch, landing, hazards, rules, image, useLiveWeather, liveStationId, liveStationIdAlt, siteguideUrl, siteContact, siteContactPhone, navigateTo, launchHeight, launchHeightHigh, launchHeight2, landingHeight2, hoodedPloversLink, hoodedPloversActive, emergencyMarker, what3words, weatherStationLink, isSkyHighSite, crossLeft, crossRight, overrideHideClosed, essentialInfoImages, essentialInfoText, unassignedText, siteguideVersion, siteguideScrapedAt, isTidal, tideStationId, skipBulkImport, isXCSite } = req.body;
  try {
      const insert = await db.prepare(`
        INSERT INTO sites (id, name, type, pgRating, hgRating, windDir, windSpeed, status, hazardLevel, lat, lon, description, launch, landing, hazards, rules, image, useLiveWeather, liveStationId, liveStationIdAlt, siteguideUrl, siteContact, siteContactPhone, navigateTo, launchHeight, launchHeightHigh, launchHeight2, landingHeight2, hoodedPloversLink, hoodedPloversActive, emergencyMarker, what3words, weatherStationLink, isSkyHighSite, crossLeft, crossRight, overrideHideClosed, essentialInfoImages, essentialInfoText, unassignedText, siteguideVersion, siteguideScrapedAt, isTidal, tideStationId, skipBulkImport, isXCSite)
        VALUES (@id, @name, @type, @pgRating, @hgRating, @windDir, @windSpeed, @status, @hazardLevel, @lat, @lon, @description, @launch, @landing, @hazards, @rules, @image, @useLiveWeather, @liveStationId, @liveStationIdAlt, @siteguideUrl, @siteContact, @siteContactPhone, @navigateTo, @launchHeight, @launchHeightHigh, @launchHeight2, @landingHeight2, @hoodedPloversLink, @hoodedPloversActive, @emergencyMarker, @what3words, @weatherStationLink, @isSkyHighSite, @crossLeft, @crossRight, @overrideHideClosed, @essentialInfoImages, @essentialInfoText, @unassignedText, @siteguideVersion, @siteguideScrapedAt, @isTidal, @tideStationId, @skipBulkImport, @isXCSite)
      `);
      await insert.run({
          id, name, type, pgRating: normalisePgRating(pgRating) || null, hgRating: hgRating || null, windDir: normaliseWindDir(windDir) || null, windSpeed: normaliseWindSpeed(windSpeed) || null, status, hazardLevel, lat, lon, description, launch, landing,
          hazards: JSON.stringify(hazards || []),
          rules: JSON.stringify(rules || []),
          image: image || await getDefaultSiteImage(type),
          useLiveWeather: useLiveWeather || 'false',
          liveStationId: liveStationId || null,
          liveStationIdAlt: liveStationIdAlt || null,
          siteguideUrl: siteguideUrl || null,
          siteContact: siteContact || null,
          siteContactPhone: siteContactPhone || null,
          navigateTo: navigateTo || null,
          launchHeight: launchHeight || null,
          launchHeightHigh: launchHeightHigh || null,
          launchHeight2: launchHeight2 || null,
          landingHeight2: landingHeight2 || null,
          hoodedPloversLink: hoodedPloversLink || null,
          hoodedPloversActive: hoodedPloversActive || 'false',
          emergencyMarker: emergencyMarker || null,
          what3words: what3words || null,
          weatherStationLink: weatherStationLink || null,
          isSkyHighSite: isSkyHighSite || 'false',
          crossLeft: crossLeft || 'false',
          crossRight: crossRight || 'false',
          overrideHideClosed: overrideHideClosed || 'false',
          essentialInfoImages: essentialInfoImages ? (typeof essentialInfoImages === 'string' ? essentialInfoImages : JSON.stringify(essentialInfoImages)) : null,
          essentialInfoText: essentialInfoText || null,
          unassignedText: unassignedText || null,
          siteguideVersion: siteguideVersion || null,
          siteguideScrapedAt: siteguideScrapedAt || null,
          isTidal: isTidal || 'false',
          tideStationId: tideStationId || null,
          skipBulkImport: skipBulkImport || 'false',
          isXCSite: isXCSite || 'false'
      });
      invalidateSearchCaches();
      invalidateSitesCache();
      res.status(201).json({ success: true });
  } catch (e: any) {
      res.status(400).json({ error: e.message });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  const { name, type, pgRating, hgRating, windDir, windSpeed, status, hazardLevel, lat, lon, description, launch, landing, hazards, rules, image, useLiveWeather, liveStationId, liveStationIdAlt, siteguideUrl, siteContact, siteContactPhone, navigateTo, launchHeight, launchHeightHigh, launchHeight2, landingHeight2, hoodedPloversLink, hoodedPloversActive, emergencyMarker, what3words, weatherStationLink, isSkyHighSite, crossLeft, crossRight, overrideHideClosed, essentialInfoImages, essentialInfoText, unassignedText, siteguideVersion, siteguideScrapedAt, isTidal, tideStationId, skipBulkImport, isXCSite } = req.body;
  try {
      const update = await db.prepare(`
        UPDATE sites SET
          name = @name, type = @type,
          pgRating = CASE WHEN @pgRating IS NOT NULL AND @pgRating != '' THEN @pgRating ELSE pgRating END,
          hgRating = CASE WHEN @hgRating IS NOT NULL AND @hgRating != '' THEN @hgRating ELSE hgRating END,
          windDir = CASE WHEN @windDir IS NOT NULL AND @windDir != '' THEN @windDir ELSE windDir END,
          windSpeed = CASE WHEN @windSpeed IS NOT NULL AND @windSpeed != '' THEN @windSpeed ELSE windSpeed END,
          status = @status, hazardLevel = @hazardLevel, lat = @lat, lon = @lon, description = @description, launch = @launch,
          landing = @landing, hazards = @hazards, rules = @rules, image = @image,
          useLiveWeather = @useLiveWeather, liveStationId = @liveStationId, liveStationIdAlt = @liveStationIdAlt,
          siteguideUrl = CASE WHEN @siteguideUrl IS NOT NULL AND @siteguideUrl != '' THEN @siteguideUrl ELSE siteguideUrl END,
          siteContact = CASE WHEN @siteContact IS NOT NULL AND @siteContact != '' THEN @siteContact ELSE siteContact END,
          siteContactPhone = CASE WHEN @siteContactPhone IS NOT NULL AND @siteContactPhone != '' THEN @siteContactPhone ELSE siteContactPhone END,
          navigateTo = CASE WHEN @navigateTo IS NOT NULL AND @navigateTo != '' THEN @navigateTo ELSE navigateTo END,
          launchHeight = CASE WHEN @launchHeight IS NOT NULL AND @launchHeight != '' THEN @launchHeight ELSE launchHeight END,
          launchHeightHigh = CASE WHEN @launchHeightHigh IS NOT NULL AND @launchHeightHigh != '' THEN @launchHeightHigh ELSE launchHeightHigh END,
          launchHeight2 = CASE WHEN @launchHeight2 IS NOT NULL AND @launchHeight2 != '' THEN @launchHeight2 ELSE launchHeight2 END,
          landingHeight2 = CASE WHEN @landingHeight2 IS NOT NULL AND @landingHeight2 != '' THEN @landingHeight2 ELSE landingHeight2 END,
          hoodedPloversLink = CASE WHEN @hoodedPloversLink IS NOT NULL AND @hoodedPloversLink != '' THEN @hoodedPloversLink ELSE hoodedPloversLink END,
          hoodedPloversActive = @hoodedPloversActive,
          emergencyMarker = CASE WHEN @emergencyMarker IS NOT NULL AND @emergencyMarker != '' THEN @emergencyMarker ELSE emergencyMarker END,
          what3words = CASE WHEN @what3words IS NOT NULL AND @what3words != '' THEN @what3words ELSE what3words END,
          weatherStationLink = CASE WHEN @weatherStationLink IS NOT NULL AND @weatherStationLink != '' THEN @weatherStationLink ELSE weatherStationLink END,
          isSkyHighSite = @isSkyHighSite, crossLeft = @crossLeft, crossRight = @crossRight, overrideHideClosed = @overrideHideClosed,
          unassignedText = CASE WHEN @unassignedText IS NOT NULL AND @unassignedText != '' THEN @unassignedText ELSE unassignedText END,
          essentialInfoImages = CASE WHEN @essentialInfoImages IS NOT NULL AND @essentialInfoImages != '' AND @essentialInfoImages != '[]' THEN @essentialInfoImages ELSE essentialInfoImages END,
          essentialInfoText = CASE WHEN @essentialInfoText IS NOT NULL AND @essentialInfoText != '' THEN @essentialInfoText ELSE essentialInfoText END,
          siteguideVersion = CASE WHEN @siteguideVersion IS NOT NULL AND @siteguideVersion != '' THEN @siteguideVersion ELSE siteguideVersion END,
          siteguideScrapedAt = CASE WHEN @siteguideScrapedAt IS NOT NULL AND @siteguideScrapedAt != '' THEN @siteguideScrapedAt ELSE siteguideScrapedAt END,
          isTidal = @isTidal, tideStationId = @tideStationId,
          skipBulkImport = @skipBulkImport, isXCSite = @isXCSite
        WHERE id = @id
      `);
      await update.run({
          id: req.params.id, name, type,
          pgRating: normalisePgRating(pgRating) || null, hgRating: hgRating || null,
          windDir: normaliseWindDir(windDir) || null, windSpeed: normaliseWindSpeed(windSpeed) || null,
          status, hazardLevel, lat, lon, description, launch, landing,
          hazards: JSON.stringify(hazards || []),
          rules: JSON.stringify(rules || []),
          image,
          useLiveWeather: useLiveWeather || 'false',
          liveStationId: liveStationId || null,
          liveStationIdAlt: liveStationIdAlt || null,
          siteguideUrl: siteguideUrl || null,
          siteContact: siteContact || null,
          siteContactPhone: siteContactPhone || null,
          navigateTo: navigateTo || null,
          launchHeight: launchHeight || null,
          launchHeightHigh: launchHeightHigh || null,
          launchHeight2: launchHeight2 || null,
          landingHeight2: landingHeight2 || null,
          hoodedPloversLink: hoodedPloversLink || null,
          hoodedPloversActive: hoodedPloversActive || 'false',
          emergencyMarker: emergencyMarker || null,
          what3words: what3words || null,
          weatherStationLink: weatherStationLink || null,
          isSkyHighSite: isSkyHighSite || 'false',
          crossLeft: crossLeft || 'false',
          crossRight: crossRight || 'false',
          overrideHideClosed: overrideHideClosed || 'false',
          essentialInfoImages: essentialInfoImages ? (typeof essentialInfoImages === 'string' ? essentialInfoImages : JSON.stringify(essentialInfoImages)) : null,
          essentialInfoText: essentialInfoText || null,
          unassignedText: unassignedText || null,
          siteguideVersion: siteguideVersion || null,
          siteguideScrapedAt: siteguideScrapedAt || null,
          isTidal: isTidal || 'false',
          tideStationId: tideStationId || null,
          skipBulkImport: skipBulkImport || 'false',
          isXCSite: isXCSite || 'false'
      });
      invalidateSearchCaches();
      invalidateSitesCache();
      res.json({ success: true });
  } catch (e: any) {
      res.status(400).json({ error: e.message });
  }
});

router.patch("/:id/image", requireAuth, async (req, res) => {
  const { image } = req.body;
  if (!image && image !== "") {
    return res.status(400).json({ error: "image field is required" });
  }
  try {
    const result = await db.prepare("UPDATE sites SET image = ? WHERE id = ?").run(image, req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Site not found" });
    }
    invalidateSitesCache();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const result = await db.prepare("DELETE FROM sites WHERE id = ?").run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Site not found" });
    }
    invalidateSearchCaches();
    invalidateSitesCache();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/temporary-closure", requireSOOrAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user.soAuthorised || !user.isSafetyCommittee) {
      return res.status(403).json({ error: "Only SO-authorised Safety Officers can manage temporary closures" });
    }
    if (!user.soSiteId) {
      return res.status(403).json({ error: "Temporary closure requires an SO-bound session. Use on-site SO login." });
    }
    if (user.soSiteId !== req.params.id) {
      return res.status(403).json({ error: "SO session restricted to assigned site" });
    }

    const site = await db.prepare("SELECT id, overrideHideClosed, preClosureOverrideHideClosed FROM sites WHERE id = ?").get(req.params.id) as any;
    if (!site) return res.status(404).json({ error: "Site not found" });

    await db.prepare("UPDATE sites SET temporarilyClosed = 1, preClosureOverrideHideClosed = overrideHideClosed, overrideHideClosed = 'true' WHERE id = ?").run(req.params.id);
    invalidateSitesCache();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/reopen", requireSOOrAdmin, async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user.soAuthorised || !user.isSafetyCommittee) {
      return res.status(403).json({ error: "Only SO-authorised Safety Officers can manage temporary closures" });
    }
    if (!user.soSiteId) {
      return res.status(403).json({ error: "Reopening requires an SO-bound session. Use on-site SO login." });
    }
    if (user.soSiteId !== req.params.id) {
      return res.status(403).json({ error: "SO session restricted to assigned site" });
    }

    const site = await db.prepare("SELECT id, preClosureOverrideHideClosed FROM sites WHERE id = ?").get(req.params.id) as any;
    if (!site) return res.status(404).json({ error: "Site not found" });

    const restoreValue = site.preClosureOverrideHideClosed || 'false';
    await db.prepare("UPDATE sites SET temporarilyClosed = 0, overrideHideClosed = ?, preClosureOverrideHideClosed = NULL WHERE id = ?").run(restoreValue, req.params.id);
    invalidateSitesCache();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
