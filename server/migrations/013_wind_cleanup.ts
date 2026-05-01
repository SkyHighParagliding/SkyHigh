import type Database from "better-sqlite3";

export const description = "Remove legacy rating column, populate missing structured wind fields, drop orphaned check_ins table";

export function run(db: Database.Database) {
    const dirNames = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function parseDir(text: string): string[] {
    if (!text) return [];
    const norm = text.toUpperCase().trim();
    if (norm.includes(' TO ') || norm.includes('-')) {
      const parts = norm.split(/ TO |-/);
      if (parts.length >= 2) {
        const si = dirNames.indexOf(parts[0].trim());
        const ei = dirNames.indexOf(parts[1].trim());
        if (si !== -1 && ei !== -1) {
          const result: string[] = [];
          const dist = (ei - si + 16) % 16;
          const rev = (si - ei + 16) % 16;
          const steps = dist <= rev ? dist : -rev;
          const count = Math.abs(steps);
          const d = steps >= 0 ? 1 : -1;
          for (let i = 0; i <= count; i++) result.push(dirNames[(si + i * d + 16) % 16]);
          return result;
        }
      }
    }
    const parts2 = norm.split(/[\s,]+/).map((s: string) => s.trim());
    return parts2.filter((p: string) => dirNames.includes(p));
  }
  function parseSpeed(text: string): { min: number; max: number } | null {
    if (!text) return null;
    const nums = text.match(/\d+/g);
    if (!nums || nums.length === 0) return null;
    return { min: parseInt(nums[0]), max: nums.length > 1 ? parseInt(nums[1]) : parseInt(nums[0]) };
  }

  const sites = db.prepare("SELECT id, windDir, windSpeed, windDirectionsIdeal, windSpeedMinIdeal, windSpeedMaxIdeal FROM sites").all() as any[];
  for (const site of sites) {
    const idealEmpty = !site.windDirectionsIdeal || site.windDirectionsIdeal === '[]' || site.windDirectionsIdeal === '';
    if (idealEmpty && site.windDir) {
      const parsed = parseDir(site.windDir);
      if (parsed.length > 0) {
        db.prepare("UPDATE sites SET windDirectionsIdeal = ? WHERE id = ?").run(JSON.stringify(parsed), site.id);
        console.log("[INFO] [migration-v13]",`Populated windDirectionsIdeal for ${site.id}: ${parsed.join(',')}`);
      }
    }
    if (site.windSpeedMinIdeal == null && site.windSpeed) {
      const parsed = parseSpeed(site.windSpeed);
      if (parsed) {
        db.prepare("UPDATE sites SET windSpeedMinIdeal = ?, windSpeedMaxIdeal = ? WHERE id = ?").run(parsed.min, parsed.max, site.id);
        console.log("[INFO] [migration-v13]",`Populated windSpeed min/max for ${site.id}: ${parsed.min}-${parsed.max}`);
      }
    }
  }

  try { db.exec("DROP TABLE IF EXISTS check_ins"); } catch {}
  console.log("[INFO] [migration-v13]","Dropped orphaned check_ins table");
}
