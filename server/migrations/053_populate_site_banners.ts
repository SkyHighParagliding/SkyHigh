import type Database from "better-sqlite3";

export const description = "Populate site banner images with random selections from image library";

export function run(db: Database.Database) {
  try {
    // Get the image library from settings
    const libRow = db.prepare("SELECT value FROM settings WHERE key = 'imageLibrary'").get() as { value: string } | undefined;

    if (!libRow?.value) {
      console.log("[Migration 053] No image library found, skipping");
      return;
    }

    const library = JSON.parse(libRow.value) as { banner: string; category?: string }[];
    console.log(`[Migration 053] Found ${library.length} images in library`);

    // Group by category
    const coastal = library.filter(img => img.category === 'coastal' || !img.category);
    const inland = library.filter(img => img.category === 'inland' || !img.category);

    // Get all sites and update each with a random banner
    const sites = db.prepare("SELECT id, name, type FROM sites").all() as any[];
    let updated = 0;

    for (const site of sites) {
      try {
        const typeStr = (site.type || '').toLowerCase();
        const isInland = typeStr.includes('inland') || typeStr.includes('mountain') || typeStr.includes('ridge') || typeStr.includes('tow');
        const pool = isInland ? inland : coastal;

        if (pool.length === 0) {
          console.log(`[Migration 053] No ${isInland ? 'inland' : 'coastal'} images for ${site.name}`);
          continue;
        }

        const randomImage = pool[Math.floor(Math.random() * pool.length)];
        db.prepare("UPDATE sites SET image = ? WHERE id = ?").run(randomImage.banner, site.id);
        updated++;
      } catch (err: any) {
        console.error(`[Migration 053] Error updating ${site.name}: ${err.message}`);
      }
    }

    console.log(`[Migration 053] Updated ${updated} sites with random banner images`);
  } catch (err: any) {
    console.error("[Migration 053] Fatal error:", err.message);
  }
}
