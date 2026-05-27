import { Router } from "express";
import { queryOne, query, execute } from "../../pg.js";
import asyncHandler from "../../utils/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import createLogger from "../../utils/logger.js";

const log = createLogger("admin:populate-banners");
const router = Router();

router.post("/populate-banners", requireAuth, asyncHandler(async (req, res) => {
  try {
    log.info("Starting site banner population");

    // Get the image library from settings
    const libRow = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'imageLibrary'");

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
    const sites = await query<{ id: any; name: string; type: string }>("SELECT id, name, type FROM sites");
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
        await execute("UPDATE sites SET image = $1 WHERE id = $2", [randomImage.banner, site.id]);
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
