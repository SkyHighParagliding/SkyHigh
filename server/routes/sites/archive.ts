import { Router } from "express";
import { query, queryOne, execute, transaction } from "../../pg.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { archiveSitesBeforeImport, SITES_COLUMNS, SITES_UPDATE_COLS, pickSiteColumns } from "./helpers.js";
import { getLastDetectedVersion } from "../../utils/siteguideVersionCheck.js";

const router = Router();

router.get("/archives", requireAuth, asyncHandler(async (req, res) => {
  const archives = await query(
    'SELECT id, "siteguideVersion", "archivedAt", "siteCount" FROM site_archives ORDER BY "archivedAt" DESC'
  );
  res.json(archives);
}));

router.get("/archives/:version/diff", requireAuth, asyncHandler(async (req, res) => {
  const { version } = req.params;
  const siteIdFilter = req.query.siteId as string | undefined;
  const archive = await queryOne<{ siteData: string }>('SELECT "siteData" FROM site_archives WHERE "siteguideVersion" = $1', [version]);
  if (!archive) return res.status(404).json({ error: `Archive not found for version ${version}` });

  let archivedSites: any[];
  try {
    archivedSites = JSON.parse(archive.siteData);
  } catch (e: any) {
    return res.status(400).json({ error: `Archive data is corrupted for version ${version}: ${e.message}` });
  }
  const currentSites = await query<any>("SELECT * FROM sites");

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
  const archive = await queryOne<any>('SELECT * FROM site_archives WHERE "siteguideVersion" = $1', [version]);
  if (!archive) return res.status(404).json({ error: `Archive not found for version ${version}` });

  let sites: any;
  try {
    sites = JSON.parse(archive.siteData);
  } catch (e: any) {
    return res.status(400).json({ error: `Archive data is corrupted for version ${version}: ${e.message}` });
  }
  if (!Array.isArray(sites) || sites.length === 0) {
    return res.status(400).json({ error: "Archive contains no site data" });
  }

  const currentVersion = await getLastDetectedVersion() || "pre-restore";
  await archiveSitesBeforeImport(currentVersion + "-pre-restore-" + Date.now());

  const quotedCols = SITES_COLUMNS.map(c => `"${c}"`).join(", ");
  const placeholders = SITES_COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
  const insertSQL = `INSERT INTO sites (${quotedCols}) VALUES (${placeholders})`;

  await transaction(async (client) => {
    await client.query("DELETE FROM sites");
    for (const row of sites) {
      const picked = pickSiteColumns(row);
      await client.query(insertSQL, SITES_COLUMNS.map(c => picked[c] ?? null));
    }
  });

  res.json({ success: true, restored: sites.length, version });
}));

router.post("/archives/:version/restore/:siteId", requireAuth, asyncHandler(async (req, res) => {
  const { version, siteId } = req.params;
  const archive = await queryOne<{ siteData: string }>('SELECT "siteData" FROM site_archives WHERE "siteguideVersion" = $1', [version]);
  if (!archive) return res.status(404).json({ error: `Archive not found for version ${version}` });

  let sites: any;
  try {
    sites = JSON.parse(archive.siteData);
  } catch (e: any) {
    return res.status(400).json({ error: `Archive data is corrupted for version ${version}: ${e.message}` });
  }
  const archivedSite = sites.find((s: any) => s.id === siteId);
  if (!archivedSite) return res.status(404).json({ error: `Site ${siteId} not found in archive ${version}` });

  const existing = await queryOne<Record<string, any>>("SELECT * FROM sites WHERE id = $1", [siteId]);
  if (existing) {
    const merged: Record<string, any> = {};
    for (const col of SITES_COLUMNS) {
      merged[col] = col in archivedSite ? (archivedSite[col] ?? null) : existing[col];
    }
    const setClauses = SITES_UPDATE_COLS.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
    const updateSQL = `UPDATE sites SET ${setClauses} WHERE id = $${SITES_UPDATE_COLS.length + 1}`;
    const values = [...SITES_UPDATE_COLS.map(c => merged[c] ?? null), merged.id];
    await execute(updateSQL, values);
  } else {
    const quotedCols = SITES_COLUMNS.map(c => `"${c}"`).join(", ");
    const placeholders = SITES_COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
    const insertSQL = `INSERT INTO sites (${quotedCols}) VALUES (${placeholders})`;
    const picked = pickSiteColumns(archivedSite);
    await execute(insertSQL, SITES_COLUMNS.map(c => picked[c] ?? null));
  }

  res.json({ success: true, siteId, version });
}));

export default router;
