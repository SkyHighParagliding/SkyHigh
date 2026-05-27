import { Router } from "express";
import { query, execute, transaction } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { invalidateSearchCaches } from "./search.js";
import { invalidateSitesCache } from "./sites/helpers.js";
import { fixAllStaleImages } from "../utils/fixStaleImages.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const settings = await query<{ key: string, value: string }>("SELECT * FROM settings");
  const result: Record<string, string> = {};
  for (const s of settings) {
    result[s.key] = s.value;
  }

  const fineRow = await query<{ ts: string | null }>(
    `SELECT MAX("updatedAt") as ts FROM wind_grid_data WHERE "siteId" LIKE 'fine_grid_%'`
  );
  if (fineRow?.[0]?.ts) result.fineGridLastRun = new Date(fineRow[0].ts + 'Z').toISOString();

  const coarseRow = await query<{ ts: string | null }>(
    `SELECT MAX("updatedAt") as ts FROM wind_grid_data WHERE "siteId" LIKE 'coarse_grid_%'`
  );
  if (coarseRow?.[0]?.ts) result.coarseGridLastRun = new Date(coarseRow[0].ts + 'Z').toISOString();

  const extRow = await query<{ ts: string | null }>(
    `SELECT MAX("computedAt") as ts FROM extended_wind_grids`
  );
  if (extRow?.[0]?.ts) result.extendedForecastLastRun = extRow[0].ts;

  res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
  res.json(result);
}));

router.put("/", requireAuth, asyncHandler(async (req, res) => {
  const settings = req.body;
  if (!settings || typeof settings !== "object" || Object.keys(settings).length === 0) {
    return res.status(400).json({ error: "No settings provided" });
  }
  await transaction(async (client) => {
    for (const [key, value] of Object.entries(settings)) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, String(value)]
      );
    }
  });
  invalidateSearchCaches();
  if ('hideClosedSites' in settings) {
    invalidateSitesCache();
  }
  res.json({ success: true });
}));

router.post("/fix-stale-images", requireAuth, asyncHandler(async (req, res) => {
  const result = await fixAllStaleImages();
  invalidateSitesCache();
  res.json(result);
}));

export default router;
