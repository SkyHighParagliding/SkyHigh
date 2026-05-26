import type Database from "better-sqlite3";

export const description = "Add branding and template settings (white-label system)";

export function run(db: Database.Database) {
    const brandingDefaults: Record<string, string> = {
    clubName: "SkyHigh",
    clubTagline: "",
    clubPrimaryColor: "",
    clubLogoOriginal: "",
    clubLogoNav: "",
    clubLogoFooter: "",
    clubLogoFavicon: "",
    clubLogoSplash: "",
    activeTemplate: "wonderful-white",
  };
  const upsert = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(brandingDefaults)) {
    upsert.run(key, value);
  }
  console.log("[INFO] [migration-v15]","Seeded branding/template settings");
}
