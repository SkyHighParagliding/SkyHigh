import { Router } from "express";
import { promises as fs } from "fs";
import path from "path";
import { query, execute, transaction } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { invalidateSearchCaches } from "./search.js";
import { invalidateSitesCache } from "./sites/helpers.js";
import { fixAllStaleImages } from "../utils/fixStaleImages.js";

const router = Router();

// The Site Logic document's single source of truth is the repo file
// docs/site-logic.md. Saving from the website writes straight back to that file
// so there is no second copy to drift. This only works when running locally (the
// dev server writes the developer's actual repo file); in production the
// filesystem is ephemeral and is not the repo, so the document is read-only there.
const SITE_LOGIC_PATH = path.resolve(process.cwd(), "docs", "site-logic.md");
const isProd = process.env.NODE_ENV === "production";

router.get("/", asyncHandler(async (req, res) => {
  const settings = await query<{ key: string, value: string }>("SELECT * FROM settings");
  const result: Record<string, string> = {};
  for (const s of settings) {
    result[s.key] = s.value;
  }

  // The three *LastRun keys in the settings table record when a fetch *started*
  // and are only written once it finishes, so a long run leaves the admin panel
  // showing the previous run's time with no sign that a new one is underway.
  // Where the data table itself carries a write time, prefer it — it answers the
  // question the panel actually asks ("when did this data land?").
  const fineRow = await query<{ ts: Date | string | null }>(
    `SELECT MAX("updatedAt") as ts FROM wind_grid_data WHERE "siteId" LIKE 'fine_grid_%'`
  );
  if (fineRow?.[0]?.ts) result.fineGridLastRun = new Date(fineRow[0].ts).toISOString();

  const thermalRow = await query<{ ts: Date | string | null }>(
    `SELECT MAX("updatedAt") as ts FROM wind_grid_data WHERE "siteId" LIKE 'thermal_grid_%'`
  );
  if (thermalRow?.[0]?.ts) result.thermalGridLastRun = new Date(thermalRow[0].ts).toISOString();

  const extRow = await query<{ ts: string | null }>(
    `SELECT MAX("computedAt") as ts FROM extended_wind_grids`
  );
  if (extRow?.[0]?.ts) result.extendedForecastLastRun = extRow[0].ts;

  res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
  res.json(result);
}));

// Read the Site Logic document from the repo file. `editable` tells the client
// whether saving from the website is possible (local/dev only).
router.get("/site-logic", asyncHandler(async (_req, res) => {
  const markdown = await fs.readFile(SITE_LOGIC_PATH, "utf8").catch(() => "");
  res.set("Cache-Control", "no-store");
  res.json({ markdown, editable: !isProd });
}));

// Save edits straight back to docs/site-logic.md — local/dev only. In production
// the file is read-only (ephemeral filesystem, not the repo); edit + commit instead.
router.put("/site-logic", requireAuth, asyncHandler(async (req, res) => {
  if (isProd) {
    return res.status(403).json({ error: "The Site Logic document is read-only here. Edit docs/site-logic.md in the repo and commit." });
  }
  const markdown = req.body?.markdown;
  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    return res.status(400).json({ error: "No content provided" });
  }
  await fs.writeFile(SITE_LOGIC_PATH, markdown, "utf8");
  res.json({ success: true });
}));

// The instance catalogue: the Markdown files under docs/site-logic/. Served
// read-only so the /admin/site-logic page can browse them (useful when reviewing
// remotely). Content is a public repo file, so no auth is required.
const CATALOGUE_DIR = path.resolve(process.cwd(), "docs", "site-logic");

router.get("/site-logic/catalogue", asyncHandler(async (_req, res) => {
  const all = await fs.readdir(CATALOGUE_DIR).catch(() => [] as string[]);
  const files = all.filter((f) => f.toLowerCase().endsWith(".md")).sort();
  res.set("Cache-Control", "no-store");
  res.json({ files });
}));

router.get("/site-logic/catalogue/:name", asyncHandler(async (req, res) => {
  const name = req.params.name;
  // Strict allow-list: a bare Markdown filename, no path separators or traversal.
  if (!/^[a-z0-9][a-z0-9._-]*\.md$/i.test(name)) {
    return res.status(400).json({ error: "Invalid file name" });
  }
  const full = path.resolve(CATALOGUE_DIR, name);
  if (full !== CATALOGUE_DIR && !full.startsWith(CATALOGUE_DIR + path.sep)) {
    return res.status(400).json({ error: "Invalid path" });
  }
  const markdown = await fs.readFile(full, "utf8").catch(() => null);
  if (markdown == null) return res.status(404).json({ error: "Not found" });
  res.set("Cache-Control", "no-store");
  res.json({ markdown });
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
