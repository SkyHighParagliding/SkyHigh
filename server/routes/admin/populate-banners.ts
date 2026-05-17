import { Router } from "express";
import db from "../../db.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import createLogger from "../../utils/logger.js";

const log = createLogger("admin:populate-banners");
const router = Router();

router.post("/populate-banners", asyncHandler(async (req, res) => {
  // For development, allow without auth. For production, require auth or admin token.
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  const user = (req as any).user;
  const adminToken = req.headers['x-admin-token'];
  const expectedToken = process.env.ADMIN_BANNER_TOKEN || 'dev-token';

  const isAuthorized = isLocalhost || user || (adminToken === expectedToken);

  if (!isAuthorized) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    log.info("Starting site banner population");

    // Get the image library from settings
    const libRow = await db.prepare("SELECT value FROM settings WHERE key = 'imageLibrary'").get() as { value: string } | undefined;

    if (!libRow?.value) {
      log.error("No image library found in settings");
      return res.status(400).json({ error: "No image library found in settings" });
    }

    const library = JSON.parse(libRow.value) as { banner: string; category?: string }[];
    log.info(`Found ${library.length} images in library`);

    // Group by category
    const coastal = library.filter(img => img.category === 'coastal' || !img.category);
    const inland = library.filter(img => img.category === 'inland' || !img.category);

    log.info(`Coastal: ${coastal.length}, Inland: ${inland.length}`);

    // Get all sites
    const sites = await db.prepare("SELECT id, name, type FROM sites").all() as any[];
    log.info(`Found ${sites.length} sites to update`);

    let updated = 0;
    let errors = 0;
    const results = [];

    // Update each site with a random banner image
    for (const site of sites) {
      try {
        const typeStr = (site.type || '').toLowerCase();
        const isInland = typeStr.includes('inland') || typeStr.includes('mountain') || typeStr.includes('ridge') || typeStr.includes('tow');
        const pool = isInland ? inland : coastal;

        if (pool.length === 0) {
          const msg = `⚠️ No ${isInland ? 'inland' : 'coastal'} images for ${site.name}`;
          log.warn(msg);
          results.push({ site: site.name, status: "skipped", reason: "no images for category" });
          continue;
        }

        const randomImage = pool[Math.floor(Math.random() * pool.length)];
        await db.prepare("UPDATE sites SET image = ? WHERE id = ?").run(randomImage.banner, site.id);
        updated++;
        results.push({ site: site.name, status: "updated", image: randomImage.banner });
        log.info(`✓ ${site.name}: set banner`);
      } catch (err: any) {
        errors++;
        const msg = `✗ Error updating ${site.name}: ${err.message}`;
        log.error(msg);
        results.push({ site: site.name, status: "error", error: err.message });
      }
    }

    const summary = `Updated ${updated} sites, ${errors} errors out of ${sites.length} total`;
    log.info(`✓ Complete: ${summary}`);

    res.json({
      success: true,
      summary: {
        total: sites.length,
        updated,
        errors,
        skipped: sites.length - updated - errors,
      },
      results: results.slice(0, 20), // Return first 20 for summary
      message: summary,
    });
  } catch (err: any) {
    log.error(`Fatal error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
}));

export default router;
