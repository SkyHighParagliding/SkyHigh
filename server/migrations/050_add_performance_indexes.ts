import db from "../db.js";
import createLogger from "../utils/logger.js";

const log = createLogger("migration:050");

export async function up() {
  log.info("Creating performance indexes...");

  const indexes = [
    // Sites table - frequently queried and filtered
    "CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(status)",
    "CREATE INDEX IF NOT EXISTS idx_sites_type ON sites(type)",
    "CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name)",
    "CREATE INDEX IF NOT EXISTS idx_sites_useLiveWeather ON sites(useLiveWeather)",

    // Contacts table - large result sets, frequently searched
    "CREATE INDEX IF NOT EXISTS idx_contacts_organisation ON contacts(organisation)",
    "CREATE INDEX IF NOT EXISTS idx_contacts_isCommittee ON contacts(isCommittee)",
    "CREATE INDEX IF NOT EXISTS idx_contacts_displayCommittee ON contacts(displayCommittee)",
    "CREATE INDEX IF NOT EXISTS idx_contacts_name_surname ON contacts(name, surname)",

    // News table - ordered by date frequently
    "CREATE INDEX IF NOT EXISTS idx_news_date ON news(date DESC)",

    // Pages table - frequently accessed
    "CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug)",

    // Page views - analytics queries
    "CREATE INDEX IF NOT EXISTS idx_page_views_views ON page_views(views DESC)",

    // Weather data - time-based queries
    "CREATE INDEX IF NOT EXISTS idx_weather_observations_siteId ON weather_observations(siteId)",
    "CREATE INDEX IF NOT EXISTS idx_weather_observations_timestamp ON weather_observations(timestamp DESC)",

    // Site extended forecasts - lookup by site
    "CREATE INDEX IF NOT EXISTS idx_site_extended_forecasts_siteId ON site_extended_forecasts(siteId)",

    // Wind grid data - cache lookups
    "CREATE INDEX IF NOT EXISTS idx_wind_grid_data_siteId ON wind_grid_data(siteId)",

    // Emergency hospitals cache - lookup by site
    "CREATE INDEX IF NOT EXISTS idx_emergency_hospitals_cache_siteId ON emergency_hospitals_cache(siteId)",

    // Sessions - cleanup and lookup
    "CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_expiresAt ON sessions(expiresAt)",

    // Procedures - sorted queries
    "CREATE INDEX IF NOT EXISTS idx_procedures_sortOrder ON procedures(sortOrder)",

    // Search optimization
    "CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)",
    "CREATE INDEX IF NOT EXISTS idx_sites_lat_lon ON sites(lat, lon) WHERE lat IS NOT NULL AND lon IS NOT NULL",
  ];

  for (const index of indexes) {
    try {
      await db.prepare(index).run();
      log.info(`Created index: ${index.match(/ON\s+(\w+)/)?.[1]}`);
    } catch (e: any) {
      if (!e.message.includes("already exists")) {
        log.error(`Failed to create index: ${e.message}`);
        throw e;
      }
    }
  }

  log.info("Performance indexes created successfully");
}

export async function down() {
  log.info("Dropping performance indexes...");

  const indexesToDrop = [
    "idx_sites_status", "idx_sites_type", "idx_sites_name", "idx_sites_useLiveWeather",
    "idx_contacts_organisation", "idx_contacts_isCommittee", "idx_contacts_displayCommittee",
    "idx_contacts_name_surname",
    "idx_news_date",
    "idx_pages_slug",
    "idx_page_views_views",
    "idx_weather_observations_siteId", "idx_weather_observations_timestamp",
    "idx_site_extended_forecasts_siteId",
    "idx_wind_grid_data_siteId",
    "idx_emergency_hospitals_cache_siteId",
    "idx_sessions_userId", "idx_sessions_expiresAt",
    "idx_procedures_sortOrder",
    "idx_contacts_email",
    "idx_sites_lat_lon",
  ];

  for (const index of indexesToDrop) {
    try {
      await db.prepare(`DROP INDEX IF EXISTS ${index}`).run();
      log.info(`Dropped index: ${index}`);
    } catch (e: any) {
      log.warn(`Could not drop index ${index}: ${e.message}`);
    }
  }

  log.info("Performance indexes dropped");
}
