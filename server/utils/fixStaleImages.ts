import { queryOne, query, execute } from "../pg.js";
import createLogger from "./logger.js";

const log = createLogger("fixStaleImages");

interface ImageLibraryEntry {
  banner?: string;
  wide?: string;
  sliderLg?: string;
  sliderSm?: string;
  sliderPortrait?: string;
  category?: string;
}

async function getRandomImageFromLibrary(siteType?: string): Promise<string | null> {
  try {
    const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'imageLibrary'");
    if (!row?.value) return null;

    const images: ImageLibraryEntry[] = JSON.parse(row.value);
    if (images.length === 0) return null;

    // Filter by category if possible
    const typeStr = (siteType || "").toLowerCase();
    const isInland = typeStr.includes("inland") || typeStr.includes("mountain") || typeStr.includes("ridge") || typeStr.includes("tow");
    const category = isInland ? "inland" : "coastal";

    const matched = images.filter((img) => img.banner && img.category === category);
    const pool = matched.length > 0 ? matched : images.filter((img) => img.banner);

    if (pool.length === 0) return null;

    return pool[Math.floor(Math.random() * pool.length)].banner || null;
  } catch (e) {
    log.error("Error getting random image from library:", e);
    return null;
  }
}

async function isStaleImage(image: string | null): Promise<boolean> {
  // Check if image is null, empty, or a fallback/placeholder
  if (!image || image.trim() === "") return true;

  // Check for broken/placeholder URLs
  const stalePhrases = [
    "site-709b3754dba7e1c8",
    "placeholder",
    "broken",
    "404",
  ];

  return stalePhrases.some((phrase) => image.toLowerCase().includes(phrase));
}

export async function fixAllStaleImages(): Promise<{ updated: number; failed: number; skipped: number }> {
  let updated = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const sites = await query<{
      id: string;
      name: string;
      type: string;
      image: string | null;
    }>("SELECT id, name, type, image FROM sites");

    log.info(`Found ${sites.length} sites to check`);

    for (const site of sites) {
      try {
        const stale = await isStaleImage(site.image);
        if (!stale) {
          skipped++;
          continue;
        }

        const newImage = await getRandomImageFromLibrary(site.type);
        if (!newImage) {
          log.warn(`No image available for site ${site.id} (${site.name})`);
          failed++;
          continue;
        }

        await execute("UPDATE sites SET image = $1 WHERE id = $2", [newImage, site.id]);
        log.info(`Updated ${site.id} (${site.name}): ${site.image} → ${newImage}`);
        updated++;
      } catch (e) {
        log.error(`Error updating site ${site.id}:`, e);
        failed++;
      }
    }

    log.info(`Fix complete. Updated: ${updated}, Failed: ${failed}, Skipped: ${skipped}`);
    return { updated, failed, skipped };
  } catch (e) {
    log.error("Error fixing stale images:", e);
    return { updated, failed, skipped };
  }
}
