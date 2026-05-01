import type Database from "better-sqlite3";

export const description = "Create competitions table";

export const sql = `
CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  location TEXT DEFAULT '',
  pilot_rating TEXT DEFAULT '',
  rules_summary TEXT DEFAULT '',
  registration_url TEXT DEFAULT '',
  status TEXT DEFAULT 'upcoming',
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

export function run(db: Database.Database) {
    const sampleComps = [
    {
      id: "comp-summer2026", name: "Summer XC Series 2026",
      description: "The club's premier seasonal cross-country competition. Fly as many XC tasks as you can over the summer months. Open to all club members with a PG3 rating or above.",
      start_date: "2026-01-10", end_date: "2026-03-28", location: "Various club sites, Victoria",
      pilot_rating: "PG3+", rules_summary: "GAP scoring. Best 5 of unlimited flights count. Minimum 10km open distance to qualify a task. Submit via XContest.",
      registration_url: "https://example.com/summer-xc-2026", status: "active",
    },
    {
      id: "comp-ntvo2026", name: "NTVO — New To Victorian Outdoors",
      description: "A beginner-friendly cross-country event designed for pilots new to XC flying. Mentors assigned to each participant. No pressure, just learning and fun!",
      start_date: "2026-04-18", end_date: "2026-04-20", location: "Bright, Victoria",
      pilot_rating: "All Levels", rules_summary: "Participation-based scoring. Bonus points for first XC milestones (first 10km, first turnpoint, first triangle).",
      registration_url: "https://example.com/ntvo-2026", status: "upcoming",
    },
    {
      id: "comp-wow2026", name: "Wings Out West 2026",
      description: "Annual westward XC safari. Four days of big-air cross-country flying across western Victoria's flatlands and rolling hills.",
      start_date: "2026-05-15", end_date: "2026-05-18", location: "Ararat, Western Victoria",
      pilot_rating: "PG4+ / Advanced HG", rules_summary: "Race to goal and open distance tasks. GAP scoring with leading points. Minimum 3 pilots per task for validity.",
      registration_url: "https://example.com/wow-2026", status: "upcoming",
    },
    {
      id: "comp-winter2025", name: "Winter Coastal Challenge 2025",
      description: "Off-season coastal soaring competition along the Great Ocean Road sites. Focus on technical ridge flying and short XC legs.",
      start_date: "2025-07-05", end_date: "2025-08-30", location: "Great Ocean Road, Victoria",
      pilot_rating: "PG3+", rules_summary: "Open distance along the coast. Best 3 flights count. Bonus multiplier for flights on challenging days.",
      registration_url: "", status: "completed",
    },
    {
      id: "comp-autumn2025", name: "Autumn XC Cup 2025",
      description: "End-of-season cross-country competition to wrap up the flying year. Relaxed format with emphasis on fun and camaraderie.",
      start_date: "2025-03-15", end_date: "2025-05-10", location: "Various club sites, Victoria",
      pilot_rating: "PG2+", rules_summary: "Simple distance scoring. Any declared XC flight over 5km counts. Photo at landing required for validation.",
      registration_url: "", status: "completed",
    },
  ];
  const insert = db.prepare(
    "INSERT OR IGNORE INTO competitions (id, name, description, start_date, end_date, location, pilot_rating, rules_summary, registration_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  for (const c of sampleComps) {
    insert.run(c.id, c.name, c.description, c.start_date, c.end_date, c.location, c.pilot_rating, c.rules_summary, c.registration_url, c.status);
  }
  console.log("[INFO] [migration-v39]",`Seeded ${sampleComps.length} sample competitions`);
}
