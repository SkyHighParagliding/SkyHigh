import type Database from "better-sqlite3";

export const description = "Create business_directory and ground_handling_sites tables, add XC site support";

export const sql = `
CREATE TABLE IF NOT EXISTS business_directory (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  member_name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Other',
  description TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  website_url TEXT DEFAULT '',
  image_path TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ground_handling_sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL,
  lon REAL,
  windDirections TEXT DEFAULT '',
  description TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

export function run(db: Database.Database) {
    try { db.exec("ALTER TABLE sites ADD COLUMN isXCSite TEXT DEFAULT 'false'"); } catch {}
  try {
    const sites = db.prepare("SELECT id, type FROM sites WHERE lat IS NOT NULL AND lon IS NOT NULL ORDER BY name ASC LIMIT 3").all() as any[];
    for (const site of sites) {
      db.prepare("UPDATE sites SET isXCSite = 'true' WHERE id = ?").run(site.id);
      console.log("[INFO] [migration-v37]",`Marked site '${site.id}' as XC-capable`);
    }
  } catch {}
  try {
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('xcMapsEnabled', 'true')").run();
  } catch {}
  const sampleListings = [
    { name: "Peninsula Paragliding Repairs", member: "Mike Harrison", cat: "Aviation", desc: "Expert paraglider and hang glider repairs, inspections, and line replacements. 20+ years experience with all major brands.", phone: "0412 345 678", email: "mike@peninsulapara.com.au", url: "https://peninsulaparagliding.com.au" },
    { name: "SkyHigh Physiotherapy", member: "Dr Sarah Chen", cat: "Medical", desc: "Sports physiotherapy specialising in paragliding and hang gliding injuries. Rehabilitation programs for pilots returning to flight.", phone: "03 9876 5432", email: "sarah@skyhighphysio.com.au", url: "https://skyhighphysio.com.au" },
    { name: "Coastal Electrical Services", member: "Dave Thompson", cat: "Trades", desc: "Licensed electrician covering the Mornington Peninsula and surrounding areas. Domestic, commercial, and solar installations.", phone: "0438 765 432", email: "dave@coastalelectrical.com.au", url: "" },
    { name: "AeroFit Training", member: "Lisa Park", cat: "Aviation", desc: "Fitness programs designed specifically for free-flight pilots. Core strength, flexibility, and endurance training to improve your flying.", phone: "0401 234 567", email: "lisa@aerofittraining.com", url: "https://aerofittraining.com" },
    { name: "Peninsula Plumbing Co", member: "Rob Williams", cat: "Trades", desc: "Full-service plumbing for residential and commercial properties. Emergency call-outs available 24/7.", phone: "0422 111 222", email: "rob@penplumbing.com.au", url: "" },
  ];
  const insert = db.prepare(
    "INSERT OR IGNORE INTO business_directory (id, business_name, member_name, category, description, phone, email, website_url, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  sampleListings.forEach((s, i) => {
    const id = `biz-demo${i + 1}`;
    insert.run(id, s.name, s.member, s.cat, s.desc, s.phone, s.email, s.url, i);
  });
  console.log("[INFO] [migration-v37]",`Seeded ${sampleListings.length} sample business directory listings`);
}
