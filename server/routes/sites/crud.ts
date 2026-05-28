import { Router } from "express";
import { query, queryOne, execute } from "../../pg.js";
import asyncHandler from "../../utils/asyncHandler.js";
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

router.get("/", asyncHandler(async (req, res) => {
  try {
    const isPublic = req.query.public === "true";

    const { limit, offset } = getPaginationParams(req.query);
    const hasCustomPagination = req.query.limit || req.query.offset;

    if (isPublic && !hasCustomPagination && isCacheValid()) {
      res.set('Cache-Control', 'public, max-age=30');
      return res.json(getPublicSitesCache());
    }
    let sites = await query<any>("SELECT * FROM sites ORDER BY name ASC LIMIT $1 OFFSET $2", [limit, offset]);

    if (isPublic) {
      const hideClosedSetting = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'hideClosedSites'");
      if (hideClosedSetting?.value === "true") {
        sites = sites.filter((s: any) => s.status !== "closed" || s.overrideHideClosed === "true" || s.temporarilyClosed === 1);
      }
    }

    const countResult = await queryOne<{ count: string }>("SELECT COUNT(*) as count FROM sites");

    // More efficient query: only fetch closure dates for the sites actually on this page
    let mapped;

    if (sites.length > 0) {
      const siteIds = sites.map((s: any) => s.id);
      const today = new Date().toISOString().split('T')[0];
      const sixtyDaysOut = new Date(); sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60);
      const sixtyDaysStr = sixtyDaysOut.toISOString().split('T')[0];

      // Build PG positional placeholders for site IDs
      const placeholders = siteIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const closureRows = await query<{ site_id: string; closure_date: string }>(
        `SELECT site_id, closure_date FROM site_closure_dates WHERE site_id IN (${placeholders}) AND closure_date >= $${siteIds.length + 1} AND closure_date <= $${siteIds.length + 2} ORDER BY site_id, closure_date ASC`,
        [...siteIds, today, sixtyDaysStr]
      );

      const closuresBySite: Record<string, string[]> = {};
      for (const row of closureRows) {
        if (!closuresBySite[row.site_id]) closuresBySite[row.site_id] = [];
        closuresBySite[row.site_id].push(row.closure_date);
      }

      mapped = sites.map((s: any) => ({
          ...s,
          hazards: safeJsonParse(s.hazards),
          rules: safeJsonParse(s.rules),
          upcomingClosureDates: closuresBySite[s.id] || [],
      }));
    } else {
      // Handle empty site list case
      mapped = [];
    }

    if (isPublic && !hasCustomPagination) {
      setPublicSitesCache(mapped);
      res.set('Cache-Control', 'public, max-age=30');
    }

    const totalCount = Number(countResult!.count);
    res.set('X-Total-Count', String(totalCount));
    res.json(createPaginatedResponse(mapped, totalCount, limit, offset));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}));

router.get("/:id", asyncHandler(async (req, res) => {
  try {
    const site = await queryOne<any>("SELECT * FROM sites WHERE id = $1", [req.params.id]);
    if (site) {
      const today = new Date().toISOString().split('T')[0];
      const sixtyDaysOut = new Date(); sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60);
      const sixtyDaysStr = sixtyDaysOut.toISOString().split('T')[0];
      const closureRows = await query<{ closure_date: string }>(
        "SELECT closure_date FROM site_closure_dates WHERE site_id = $1 AND closure_date >= $2 AND closure_date <= $3 ORDER BY closure_date ASC",
        [req.params.id, today, sixtyDaysStr]
      );
      res.json({
          ...site,
          hazards: safeJsonParse(site.hazards),
          rules: safeJsonParse(site.rules),
          essentialInfoImages: safeJsonParse(site.essentialInfoImages),
          upcomingClosureDates: closureRows.map(r => r.closure_date),
      });
    } else {
      res.status(404).json({ error: "Site not found" });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { id, name, type, pgRating, hgRating, windDir, windSpeed, status, hazardLevel, lat, lon, description, launch, landing, hazards, rules, image, useLiveWeather, liveStationId, liveStationIdAlt, siteguideUrl, siteContact, siteContactPhone, navigateTo, launchHeight, launchHeightHigh, launchHeight2, landingHeight2, hoodedPloversLink, hoodedPloversActive, emergencyMarker, what3words, weatherStationLink, isSkyHighSite, crossLeft, crossRight, overrideHideClosed, essentialInfoImages, essentialInfoText, unassignedText, siteguideVersion, siteguideScrapedAt, isTidal, tideStationId, skipBulkImport, isXCSite } = req.body;
  try {
      // $1...$47 matching column order:
      // id, name, type, pgRating, hgRating, windDir, windSpeed, status, hazardLevel, lat, lon,
      // description, launch, landing, hazards, rules, image, useLiveWeather, liveStationId,
      // liveStationIdAlt, siteguideUrl, siteContact, siteContactPhone, navigateTo, launchHeight,
      // launchHeightHigh, launchHeight2, landingHeight2, hoodedPloversLink, hoodedPloversActive,
      // emergencyMarker, what3words, weatherStationLink, isSkyHighSite, crossLeft, crossRight,
      // overrideHideClosed, essentialInfoImages, essentialInfoText, unassignedText, siteguideVersion,
      // siteguideScrapedAt, isTidal, tideStationId, skipBulkImport, isXCSite, closurePillsMax
      await execute(`
        INSERT INTO sites (id, name, type, "pgRating", "hgRating", "windDir", "windSpeed", status, "hazardLevel", lat, lon, description, launch, landing, hazards, rules, image, "useLiveWeather", "liveStationId", "liveStationIdAlt", "siteguideUrl", "siteContact", "siteContactPhone", "navigateTo", "launchHeight", "launchHeightHigh", "launchHeight2", "landingHeight2", "hoodedPloversLink", "hoodedPloversActive", "emergencyMarker", "what3words", "weatherStationLink", "isSkyHighSite", "crossLeft", "crossRight", "overrideHideClosed", "essentialInfoImages", "essentialInfoText", "unassignedText", "siteguideVersion", "siteguideScrapedAt", "isTidal", "tideStationId", "skipBulkImport", "isXCSite", "closurePillsMax")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47)
      `, [
          id,                                                          // $1  id
          name,                                                        // $2  name
          type,                                                        // $3  type
          normalisePgRating(pgRating) || null,                        // $4  pgRating
          hgRating || null,                                           // $5  hgRating
          normaliseWindDir(windDir) || null,                          // $6  windDir
          normaliseWindSpeed(windSpeed) || null,                      // $7  windSpeed
          status,                                                      // $8  status
          hazardLevel,                                                 // $9  hazardLevel
          lat,                                                         // $10 lat
          lon,                                                         // $11 lon
          description,                                                 // $12 description
          launch,                                                      // $13 launch
          landing,                                                     // $14 landing
          JSON.stringify(hazards || []),                               // $15 hazards
          JSON.stringify(rules || []),                                 // $16 rules
          image || await getDefaultSiteImage(type),                   // $17 image
          useLiveWeather || 'false',                                   // $18 useLiveWeather
          liveStationId || null,                                       // $19 liveStationId
          liveStationIdAlt || null,                                    // $20 liveStationIdAlt
          siteguideUrl || null,                                        // $21 siteguideUrl
          siteContact || null,                                         // $22 siteContact
          siteContactPhone || null,                                    // $23 siteContactPhone
          navigateTo || null,                                          // $24 navigateTo
          launchHeight || null,                                        // $25 launchHeight
          launchHeightHigh || null,                                    // $26 launchHeightHigh
          launchHeight2 || null,                                       // $27 launchHeight2
          landingHeight2 || null,                                      // $28 landingHeight2
          hoodedPloversLink || null,                                   // $29 hoodedPloversLink
          hoodedPloversActive || 'false',                              // $30 hoodedPloversActive
          emergencyMarker || null,                                     // $31 emergencyMarker
          what3words || null,                                          // $32 what3words
          weatherStationLink || null,                                  // $33 weatherStationLink
          isSkyHighSite || 'false',                                    // $34 isSkyHighSite
          crossLeft || 'false',                                        // $35 crossLeft
          crossRight || 'false',                                       // $36 crossRight
          overrideHideClosed || 'false',                               // $37 overrideHideClosed
          essentialInfoImages ? (typeof essentialInfoImages === 'string' ? essentialInfoImages : JSON.stringify(essentialInfoImages)) : null, // $38 essentialInfoImages
          essentialInfoText || null,                                   // $39 essentialInfoText
          unassignedText || null,                                      // $40 unassignedText
          siteguideVersion || null,                                    // $41 siteguideVersion
          siteguideScrapedAt || null,                                  // $42 siteguideScrapedAt
          isTidal || 'false',                                          // $43 isTidal
          tideStationId || null,                                       // $44 tideStationId
          skipBulkImport || 'false',                                   // $45 skipBulkImport
          isXCSite || 'false',                                         // $46 isXCSite
          7,                                                           // $47 closurePillsMax
      ]);
      invalidateSearchCaches();
      invalidateSitesCache();
      res.status(201).json({ success: true });
  } catch (e: any) {
      res.status(500).json({ error: e.message });
  }
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { name, type, pgRating, hgRating, windDir, windSpeed, status, hazardLevel, lat, lon, description, launch, landing, hazards, rules, image, useLiveWeather, liveStationId, liveStationIdAlt, siteguideUrl, siteContact, siteContactPhone, navigateTo, launchHeight, launchHeightHigh, launchHeight2, landingHeight2, hoodedPloversLink, hoodedPloversActive, emergencyMarker, what3words, weatherStationLink, isSkyHighSite, crossLeft, crossRight, overrideHideClosed, essentialInfoImages, essentialInfoText, unassignedText, siteguideVersion, siteguideScrapedAt, isTidal, tideStationId, skipBulkImport, isXCSite, closurePillsMax } = req.body;
  try {
      // Parameter order for UPDATE:
      // $1=name, $2=type, $3=pgRating, $4=hgRating, $5=windDir, $6=windSpeed,
      // $7=status, $8=hazardLevel, $9=lat, $10=lon, $11=description, $12=launch,
      // $13=landing, $14=hazards, $15=rules, $16=image, $17=useLiveWeather,
      // $18=liveStationId, $19=liveStationIdAlt, $20=siteguideUrl, $21=siteContact,
      // $22=siteContactPhone, $23=navigateTo, $24=launchHeight, $25=launchHeightHigh,
      // $26=launchHeight2, $27=landingHeight2, $28=hoodedPloversLink, $29=hoodedPloversActive,
      // $30=emergencyMarker, $31=what3words, $32=weatherStationLink, $33=isSkyHighSite,
      // $34=crossLeft, $35=crossRight, $36=overrideHideClosed, $37=essentialInfoImages,
      // $38=essentialInfoText, $39=unassignedText, $40=siteguideVersion, $41=siteguideScrapedAt,
      // $42=isTidal, $43=tideStationId, $44=skipBulkImport, $45=isXCSite,
      // $46=closurePillsMax, $47=id (WHERE clause)
      await execute(`
        UPDATE sites SET
          name = $1, type = $2,
          "pgRating" = CASE WHEN $3::text != '' THEN $3 ELSE "pgRating" END,
          "hgRating" = CASE WHEN $4::text != '' THEN $4 ELSE "hgRating" END,
          "windDir" = CASE WHEN $5::text != '' THEN $5 ELSE "windDir" END,
          "windSpeed" = CASE WHEN $6::text != '' THEN $6 ELSE "windSpeed" END,
          status = $7, "hazardLevel" = $8, lat = $9, lon = $10, description = $11, launch = $12,
          landing = $13, hazards = $14, rules = $15, image = CASE WHEN $16::text != '' THEN $16 ELSE image END,
          "useLiveWeather" = $17, "liveStationId" = $18, "liveStationIdAlt" = $19,
          "siteguideUrl" = CASE WHEN $20::text != '' THEN $20 ELSE "siteguideUrl" END,
          "siteContact" = CASE WHEN $21::text != '' THEN $21 ELSE "siteContact" END,
          "siteContactPhone" = CASE WHEN $22::text != '' THEN $22 ELSE "siteContactPhone" END,
          "navigateTo" = CASE WHEN $23::text != '' THEN $23 ELSE "navigateTo" END,
          "launchHeight" = CASE WHEN $24::text != '' THEN $24 ELSE "launchHeight" END,
          "launchHeightHigh" = CASE WHEN $25::text != '' THEN $25 ELSE "launchHeightHigh" END,
          "launchHeight2" = CASE WHEN $26::text != '' THEN $26 ELSE "launchHeight2" END,
          "landingHeight2" = CASE WHEN $27::text != '' THEN $27 ELSE "landingHeight2" END,
          "hoodedPloversLink" = CASE WHEN $28::text != '' THEN $28 ELSE "hoodedPloversLink" END,
          "hoodedPloversActive" = $29,
          "emergencyMarker" = CASE WHEN $30::text != '' THEN $30 ELSE "emergencyMarker" END,
          "what3words" = CASE WHEN $31::text != '' THEN $31 ELSE "what3words" END,
          "weatherStationLink" = CASE WHEN $32::text != '' THEN $32 ELSE "weatherStationLink" END,
          "isSkyHighSite" = $33, "crossLeft" = $34, "crossRight" = $35, "overrideHideClosed" = $36,
          "unassignedText" = CASE WHEN $39::text != '' THEN $39 ELSE "unassignedText" END,
          "essentialInfoImages" = CASE WHEN $37::text != '' AND $37::text != '[]' THEN $37 ELSE "essentialInfoImages" END,
          "essentialInfoText" = CASE WHEN $38::text != '' THEN $38 ELSE "essentialInfoText" END,
          "siteguideVersion" = CASE WHEN $40::text != '' THEN $40 ELSE "siteguideVersion" END,
          "siteguideScrapedAt" = CASE WHEN $41::text != '' THEN $41 ELSE "siteguideScrapedAt" END,
          "isTidal" = $42, "tideStationId" = $43,
          "skipBulkImport" = $44, "isXCSite" = $45,
          "closurePillsMax" = $46
        WHERE id = $47
      `, [
          name,                                                        // $1  name
          type,                                                        // $2  type
          normalisePgRating(pgRating) || null,                        // $3  pgRating
          hgRating || null,                                           // $4  hgRating
          normaliseWindDir(windDir) || null,                          // $5  windDir
          normaliseWindSpeed(windSpeed) || null,                      // $6  windSpeed
          status,                                                      // $7  status
          hazardLevel,                                                 // $8  hazardLevel
          lat,                                                         // $9  lat
          lon,                                                         // $10 lon
          description,                                                 // $11 description
          launch,                                                      // $12 launch
          landing,                                                     // $13 landing
          JSON.stringify(hazards || []),                               // $14 hazards
          JSON.stringify(rules || []),                                 // $15 rules
          image,                                                       // $16 image
          useLiveWeather || 'false',                                   // $17 useLiveWeather
          liveStationId || null,                                       // $18 liveStationId
          liveStationIdAlt || null,                                    // $19 liveStationIdAlt
          siteguideUrl || null,                                        // $20 siteguideUrl
          siteContact || null,                                         // $21 siteContact
          siteContactPhone || null,                                    // $22 siteContactPhone
          navigateTo || null,                                          // $23 navigateTo
          launchHeight || null,                                        // $24 launchHeight
          launchHeightHigh || null,                                    // $25 launchHeightHigh
          launchHeight2 || null,                                       // $26 launchHeight2
          landingHeight2 || null,                                      // $27 landingHeight2
          hoodedPloversLink || null,                                   // $28 hoodedPloversLink
          hoodedPloversActive || 'false',                              // $29 hoodedPloversActive
          emergencyMarker || null,                                     // $30 emergencyMarker
          what3words || null,                                          // $31 what3words
          weatherStationLink || null,                                  // $32 weatherStationLink
          isSkyHighSite || 'false',                                    // $33 isSkyHighSite
          crossLeft || 'false',                                        // $34 crossLeft
          crossRight || 'false',                                       // $35 crossRight
          overrideHideClosed || 'false',                               // $36 overrideHideClosed
          essentialInfoImages ? (typeof essentialInfoImages === 'string' ? essentialInfoImages : JSON.stringify(essentialInfoImages)) : null, // $37 essentialInfoImages
          essentialInfoText || null,                                   // $38 essentialInfoText
          unassignedText || null,                                      // $39 unassignedText
          siteguideVersion || null,                                    // $40 siteguideVersion
          siteguideScrapedAt || null,                                  // $41 siteguideScrapedAt
          isTidal || 'false',                                          // $42 isTidal
          tideStationId || null,                                       // $43 tideStationId
          skipBulkImport || 'false',                                   // $44 skipBulkImport
          isXCSite || 'false',                                         // $45 isXCSite
          (closurePillsMax != null && !isNaN(Number(closurePillsMax))) ? Math.min(10, Math.max(1, Number(closurePillsMax))) : 7, // $46 closurePillsMax
          req.params.id,                                               // $47 id (WHERE)
      ]);
      invalidateSearchCaches();
      invalidateSitesCache();
      res.json({ success: true });
  } catch (e: any) {
      res.status(500).json({ error: e.message });
  }
}));

router.patch("/:id/image", requireAuth, asyncHandler(async (req, res) => {
  const { image } = req.body;
  if (!image && image !== "") {
    return res.status(400).json({ error: "image field is required" });
  }
  try {
    const result = await execute("UPDATE sites SET image = $1 WHERE id = $2", [image, req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Site not found" });
    }
    invalidateSitesCache();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  try {
    const result = await execute("DELETE FROM sites WHERE id = $1", [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Site not found" });
    }
    invalidateSearchCaches();
    invalidateSitesCache();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}));

router.post("/:id/temporary-closure", requireSOOrAdmin, asyncHandler(async (req, res) => {
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

    const site = await queryOne<any>("SELECT id, \"overrideHideClosed\", \"preClosureOverrideHideClosed\" FROM sites WHERE id = $1", [req.params.id]);
    if (!site) return res.status(404).json({ error: "Site not found" });

    await execute("UPDATE sites SET \"temporarilyClosed\" = 1, \"preClosureOverrideHideClosed\" = \"overrideHideClosed\", \"overrideHideClosed\" = 'true' WHERE id = $1", [req.params.id]);
    invalidateSitesCache();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}));

router.post("/:id/reopen", requireSOOrAdmin, asyncHandler(async (req, res) => {
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

    const site = await queryOne<any>("SELECT id, \"preClosureOverrideHideClosed\" FROM sites WHERE id = $1", [req.params.id]);
    if (!site) return res.status(404).json({ error: "Site not found" });

    const restoreValue = site.preClosureOverrideHideClosed || 'false';
    await execute("UPDATE sites SET \"temporarilyClosed\" = 0, \"overrideHideClosed\" = $1, \"preClosureOverrideHideClosed\" = NULL WHERE id = $2", [restoreValue, req.params.id]);
    invalidateSitesCache();
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}));

export default router;
