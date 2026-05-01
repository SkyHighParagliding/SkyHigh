import type Database from "better-sqlite3";

export const description = "Add legacy columns to sites if missing (from pre-migration era)";

export function run(db: Database.Database) {
  const alterColumns = [
    "lat REAL", "lon REAL", "windSpeedMinIdeal INTEGER", "windSpeedMaxIdeal INTEGER",
    "windDirectionsIdeal TEXT", "useLiveWeather TEXT DEFAULT 'false'", "liveStationId TEXT",
    "siteguideUrl TEXT", "siteContact TEXT", "siteContactPhone TEXT", "navigateTo TEXT",
    "launchHeight TEXT", "hoodedPloversLink TEXT", "emergencyMarker TEXT", "what3words TEXT",
    "weatherStationLink TEXT", "isSkyHighSite TEXT DEFAULT 'false'", "pgRating TEXT",
    "hgRating TEXT", "crossLeft TEXT DEFAULT 'false'", "crossRight TEXT DEFAULT 'false'",
    "overrideHideClosed TEXT DEFAULT 'false'",
  ];
  for (const col of alterColumns) {
    try { db.exec(`ALTER TABLE sites ADD COLUMN ${col}`); } catch {}
  }
  try { db.exec("ALTER TABLE external_site_listings ADD COLUMN region TEXT"); } catch {}
  try { db.exec("ALTER TABLE weather_forecasts ADD COLUMN forecasts TEXT"); } catch {}
}
