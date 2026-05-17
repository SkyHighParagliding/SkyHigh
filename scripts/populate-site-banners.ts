import db from "../server/db.js";

async function main() {
  try {
    console.log("Fetching image library...");
    const libRow = await db.prepare("SELECT value FROM settings WHERE key = 'imageLibrary'").get() as { value: string } | undefined;

    if (!libRow?.value) {
      console.error("No image library found in settings!");
      return;
    }

    const library = JSON.parse(libRow.value) as { banner: string; category?: string }[];
    console.log(`Found ${library.length} images in library`);

    // Group by category
    const coastal = library.filter(img => img.category === 'coastal' || !img.category);
    const inland = library.filter(img => img.category === 'inland' || !img.category);

    console.log(`- Coastal: ${coastal.length}`);
    console.log(`- Inland: ${inland.length}`);

    // Get all sites
    console.log("\nFetching all sites...");
    const sites = await db.prepare("SELECT id, name, type FROM sites").all() as any[];
    console.log(`Found ${sites.length} sites`);

    let updated = 0;
    let errors = 0;

    // Update each site with a random banner image
    for (const site of sites) {
      try {
        const typeStr = (site.type || '').toLowerCase();
        const isInland = typeStr.includes('inland') || typeStr.includes('mountain') || typeStr.includes('ridge') || typeStr.includes('tow');
        const pool = isInland ? inland : coastal;

        if (pool.length === 0) {
          console.warn(`⚠️  No ${isInland ? 'inland' : 'coastal'} images for ${site.name}`);
          continue;
        }

        const randomImage = pool[Math.floor(Math.random() * pool.length)];

        await db.prepare("UPDATE sites SET image = ? WHERE id = ?").run(randomImage.banner, site.id);
        updated++;
        console.log(`✓ ${site.name}: set to random banner`);
      } catch (err: any) {
        errors++;
        console.error(`✗ ${site.name}: ${err.message}`);
      }
    }

    console.log(`\n✅ Complete: ${updated} updated, ${errors} errors`);
  } catch (err: any) {
    console.error("Fatal error:", err.message);
    process.exit(1);
  }
}

main();
