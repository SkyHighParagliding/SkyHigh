import { Router } from "express";
import db from "../../db.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { archiveSitesBeforeImport, SITES_COLUMNS, SITES_INSERT_SQL, SITES_UPDATE_SQL, pickSiteColumns } from "./helpers.js";
import { getLastDetectedVersion } from "../../utils/siteguideVersionCheck.js";

const router = Router();

router.get("/archives", requireAuth, asyncHandler(async (req, res) => {
  const archives = await db.prepare(
    "SELECT id, siteguideVersion, archivedAt, siteCount FROM site_archives ORDER BY archivedAt DESC"
  ).all();
  res.json(archives);
}));

router.get("/archives/:version/diff", requireAuth, asyncHandler(async (req, res) => {
  const { version } = req.params;
  const siteIdFilter = req.query.siteId as string | undefined;
  const archive = await db.prepare("SELECT siteData FROM site_archives WHERE siteguideVersion = ?").get(version) as any;
  if (!archive) return res.status(404).json({ error: `Archive not found for version ${version}` });

  const archivedSites = JSON.parse(archive.siteData) as any[];
  const currentSites = await db.prepare("SELECT * FROM sites").all() as any[];

  const currentMap = new Map(currentSites.map((s: any) => [s.id, s]));
  const archivedMap = new Map(archivedSites.map((s: any) => [s.id, s]));

  const skipFields = new Set(["siteguideScrapedAt", "siteguideContentHash", "weatherData", "forecastData", "createdAt", "updatedAt"]);

  const diffs: any[] = [];

  for (const [id, archived] of archivedMap) {
    if (siteIdFilter && id !== siteIdFilter) continue;
    const current = currentMap.get(id);
    if (!current) {
      diffs.push({ siteId: id, siteName: archived.name || id, status: "removed", fields: [] });
      continue;
    }
    const fieldChanges: any[] = [];
    const allKeys = new Set([...Object.keys(archived), ...Object.keys(current)]);
    for (const key of allKeys) {
      if (skipFields.has(key)) continue;
      const oldVal = archived[key] ?? null;
      const newVal = current[key] ?? null;
      const oldStr = typeof oldVal === "object" ? JSON.stringify(oldVal) : String(oldVal ?? "");
      const newStr = typeof newVal === "object" ? JSON.stringify(newVal) : String(newVal ?? "");
      if (oldStr !== newStr) {
        fieldChanges.push({ field: key, archived: oldVal, current: newVal });
      }
    }
    if (fieldChanges.length > 0) {
      diffs.push({ siteId: id, siteName: current.name || archived.name || id, status: "modified", fields: fieldChanges });
    }
  }

  for (const [id, current] of currentMap) {
    if (siteIdFilter && id !== siteIdFilter) continue;
    if (!archivedMap.has(id)) {
      diffs.push({ siteId: id, siteName: current.name || id, status: "added", fields: [] });
    }
  }

  res.json({ version, totalDiffs: diffs.length, diffs });
}));

router.post("/archives/:version/restore", requireAuth, asyncHandler(async (req, res) => {
  const { version } = req.params;
  const archive = await db.prepare("SELECT * FROM site_archives WHERE siteguideVersion = ?").get(version) as any;
  if (!archive) return res.status(404).json({ error: `Archive not found for version ${version}` });

  const sites = JSON.parse(archive.siteData);
  if (!Array.isArray(sites) || sites.length === 0) {
    return res.status(400).json({ error: "Archive contains no site data" });
  }

  const currentVersion = await getLastDetectedVersion() || "pre-restore";
  await archiveSitesBeforeImport(currentVersion + "-pre-restore-" + Date.now());

  const insertStmt = await db.prepare(SITES_INSERT_SQL);
  const restoreAll = await db.transaction(async (rows: any[]) => {
    await db.prepare("DELETE FROM sites").run();
    for (const row of rows) await insertStmt.run(pickSiteColumns(row));
  });
  await restoreAll(sites);

  res.json({ success: true, restored: sites.length, version });
}));

router.post("/archives/:version/restore/:siteId", requireAuth, asyncHandler(async (req, res) => {
  const { version, siteId } = req.params;
  const archive = await db.prepare("SELECT siteData FROM site_archives WHERE siteguideVersion = ?").get(version) as any;
  if (!archive) return res.status(404).json({ error: `Archive not found for version ${version}` });

  const sites = JSON.parse(archive.siteData) as any[];
  const archivedSite = sites.find((s: any) => s.id === siteId);
  if (!archivedSite) return res.status(404).json({ error: `Site ${siteId} not found in archive ${version}` });

  const existing = await db.prepare("SELECT * FROM sites WHERE id = ?").get(siteId) as Record<string, any> | undefined;
  if (existing) {
    const merged: Record<string, any> = {};
    for (const col of SITES_COLUMNS) {
      merged[col] = col in archivedSite ? (archivedSite[col] ?? null) : existing[col];
    }
    await db.prepare(SITES_UPDATE_SQL).run(merged);
  } else {
    await db.prepare(SITES_INSERT_SQL).run(pickSiteColumns(archivedSite));
  }

  res.json({ success: true, siteId, version });
}));

export default router;
