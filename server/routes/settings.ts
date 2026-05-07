import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { invalidateSearchCaches } from "./search.js";
import { invalidateSitesCache } from "./sites/helpers.js";
import { fixAllStaleImages } from "../utils/fixStaleImages.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const settings = await db.prepare("SELECT * FROM settings").all() as { key: string, value: string }[];
  const result: Record<string, string> = {};
  for (const s of settings) {
    result[s.key] = s.value;
  }

  // Derive grid last-run timestamps from the actual data tables — settings keys can lag
  // when manual fetches are triggered. wind_grid_data.updatedAt is the source of truth.
  const fineRow = db.prepare("SELECT MAX(updatedAt) as ts FROM wind_grid_data WHERE siteId LIKE 'fine_grid_%'").get() as { ts: string | null };
  if (fineRow?.ts) result.fineGridLastRun = new Date(fineRow.ts + 'Z').toISOString();

  const coarseRow = db.prepare("SELECT MAX(updatedAt) as ts FROM wind_grid_data WHERE siteId LIKE 'coarse_grid_%'").get() as { ts: string | null };
  if (coarseRow?.ts) result.coarseGridLastRun = new Date(coarseRow.ts + 'Z').toISOString();

  const extRow = db.prepare("SELECT MAX(computedAt) as ts FROM extended_wind_grids").get() as { ts: string | null };
  if (extRow?.ts) result.extendedForecastLastRun = extRow.ts;

  res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
  res.json(result);
}));

router.put("/", requireAuth, asyncHandler(async (req, res) => {
  const settings = req.body;
  if (!settings || typeof settings !== "object" || Object.keys(settings).length === 0) {
    return res.status(400).json({ error: "No settings provided" });
  }
  const update = await db.prepare("INSERT INTO settings (key, value) VALUES (@key, @value) ON CONFLICT(key) DO UPDATE SET value = @value");
  await db.transaction(async () => {
    for (const [key, value] of Object.entries(settings)) {
      await update.run({ key, value: String(value) });
    }
  })();
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
