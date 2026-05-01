CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "soSiteId" TEXT
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT,
  type TEXT,
  "windDir" TEXT,
  "windSpeed" TEXT,
  status TEXT,
  "hazardLevel" TEXT,
  lat REAL,
  lon REAL,
  description TEXT,
  launch TEXT,
  landing TEXT,
  hazards TEXT,
  rules TEXT,
  image TEXT,
  "useLiveWeather" TEXT DEFAULT 'false',
  "liveStationId" TEXT,
  "liveStationIdAlt" TEXT,
  "siteguideUrl" TEXT,
  "siteContact" TEXT,
  "siteContactPhone" TEXT,
  "navigateTo" TEXT,
  "launchHeight" TEXT,
  "launchHeightHigh" TEXT,
  "hoodedPloversLink" TEXT,
  "hoodedPloversActive" TEXT DEFAULT 'false',
  "emergencyMarker" TEXT,
  what3words TEXT,
  "weatherStationLink" TEXT,
  "weatherGaugeUrl" TEXT,
  "crossLeft" TEXT DEFAULT 'false',
  "crossRight" TEXT DEFAULT 'false',
  "isSkyHighSite" TEXT DEFAULT 'false',
  "pgRating" TEXT,
  "hgRating" TEXT,
  "overrideHideClosed" TEXT DEFAULT 'false',
  "essentialInfoImages" TEXT DEFAULT '[]',
  "essentialInfoText" TEXT DEFAULT '',
  "unassignedText" TEXT DEFAULT '',
  "siteguideVersion" TEXT,
  "siteguideScrapedAt" TEXT,
  "contentHash" TEXT,
  "temporarilyClosed" INTEGER DEFAULT 0,
  "preClosureOverrideHideClosed" TEXT,
  "isTidal" TEXT DEFAULT 'false',
  "tideStationId" TEXT,
  "skipBulkImport" TEXT DEFAULT 'false',
  "isXCSite" TEXT DEFAULT 'false'
);

CREATE TABLE IF NOT EXISTS external_site_listings (
  id SERIAL PRIMARY KEY,
  name TEXT,
  url TEXT,
  state TEXT,
  region TEXT,
  "lastScraped" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  "lastUpdated" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "heroImage" TEXT
);

CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  date TEXT,
  author TEXT,
  "heroImage" TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS checkins (
  id SERIAL PRIMARY KEY,
  "siteId" TEXT,
  "pilotName" TEXT,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weather_observations (
  "siteId" TEXT PRIMARY KEY,
  "windSpeed" INTEGER,
  "windGust" INTEGER,
  direction TEXT,
  "stationName" TEXT,
  "stationLat" REAL,
  "stationLon" REAL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weather_forecasts (
  "siteId" TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ,
  temperature REAL,
  "windSpeed" INTEGER,
  "windGust" INTEGER,
  "windDirection" TEXT,
  icon TEXT,
  summary TEXT,
  forecasts TEXT
);

CREATE TABLE IF NOT EXISTS safety_officers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS wind_grid_data (
  "siteId" TEXT PRIMARY KEY,
  "gridData" TEXT,
  "gridSize" INTEGER DEFAULT 5,
  "gridSpacing" REAL DEFAULT 0.05,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS page_views (
  path TEXT PRIMARY KEY,
  views INTEGER DEFAULT 0,
  "lastViewed" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS procedures (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  icon TEXT DEFAULT 'ClipboardList',
  "iconColor" TEXT DEFAULT 'text-navy',
  description TEXT,
  steps TEXT DEFAULT '[]',
  "sortOrder" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  organisation TEXT,
  name TEXT NOT NULL,
  surname TEXT DEFAULT '',
  phone TEXT,
  email TEXT,
  notes TEXT,
  "isAdmin" INTEGER DEFAULT 0,
  "isCommittee" INTEGER DEFAULT 0,
  "isContractor" INTEGER DEFAULT 0,
  "isParksVic" INTEGER DEFAULT 0,
  "isSO" INTEGER DEFAULT 0,
  "isSSO" INTEGER DEFAULT 0,
  "isSafetyCommittee" INTEGER DEFAULT 0,
  "isSocialMedia" INTEGER DEFAULT 0,
  "soAuthorised" INTEGER DEFAULT 0,
  password TEXT DEFAULT '',
  position TEXT DEFAULT NULL,
  "displayCommittee" INTEGER DEFAULT 1,
  "displaySafety" INTEGER DEFAULT 1,
  "showTelegram" INTEGER DEFAULT 0,
  "showPhone" INTEGER DEFAULT 0,
  "showEmail" INTEGER DEFAULT 0,
  "showAdminEmail" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  "relatedSiteId" TEXT,
  "driveFolderId" TEXT,
  "driveFolderName" TEXT,
  "parksVic" INTEGER DEFAULT 0,
  "pvContactId" TEXT,
  "pvExpectations" TEXT,
  "worksRequired" TEXT,
  "contractorNotes" TEXT,
  "landownerNotes" TEXT,
  "stakeholderNotes" TEXT,
  "projectCoordinator" TEXT DEFAULT '',
  "coordinatorContactId" TEXT,
  "estimatedBudget" TEXT DEFAULT '',
  "fundingSource" TEXT DEFAULT '',
  "insuranceRequirements" TEXT DEFAULT '',
  "supplierQuotes" TEXT DEFAULT '',
  "complianceNotes" TEXT DEFAULT '',
  "approvedBy" TEXT DEFAULT '',
  "approvalDate" TEXT DEFAULT '',
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_contacts (
  "projectId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  role TEXT,
  PRIMARY KEY ("projectId", "contactId")
);

CREATE TABLE IF NOT EXISTS project_documents (
  "projectId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  PRIMARY KEY ("projectId", "documentId")
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  "driveFileId" TEXT,
  name TEXT NOT NULL,
  "mimeType" TEXT,
  size INTEGER,
  category TEXT,
  "driveFolderId" TEXT,
  "webViewLink" TEXT,
  "uploadedBy" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS siteguide_version_checks (
  id SERIAL PRIMARY KEY,
  "checkedAt" TEXT NOT NULL,
  "detectedVersion" TEXT,
  "previousVersion" TEXT,
  changed INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS extended_forecasts (
  id TEXT PRIMARY KEY DEFAULT 'extended_grid',
  "gridData" TEXT,
  "fetchedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_extended_forecasts (
  "siteId" TEXT PRIMARY KEY,
  "forecastData" TEXT,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_index (
  "driveFileId" TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  "mimeType" TEXT,
  "driveUrl" TEXT,
  "textContent" TEXT,
  "charCount" INTEGER DEFAULT 0,
  readable INTEGER DEFAULT 0,
  "indexedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "lastModified" TEXT
);

CREATE TABLE IF NOT EXISTS site_archives (
  id SERIAL PRIMARY KEY,
  "siteguideVersion" TEXT NOT NULL,
  "archivedAt" TEXT NOT NULL,
  "siteCount" INTEGER NOT NULL DEFAULT 0,
  "siteData" TEXT NOT NULL DEFAULT '[]'
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_archives_version ON site_archives("siteguideVersion");

CREATE TABLE IF NOT EXISTS tidyhq_group_mappings (
  id SERIAL PRIMARY KEY,
  "tidyhqGroupId" TEXT NOT NULL,
  "tidyhqGroupName" TEXT NOT NULL,
  "localRoleFlag" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("tidyhqGroupId", "localRoleFlag")
);

CREATE TABLE IF NOT EXISTS tidyhq_webhook_log (
  id SERIAL PRIMARY KEY,
  "eventType" TEXT NOT NULL,
  "tidyhqContactId" TEXT,
  "tidyhqGroupId" TEXT,
  "tidyhqGroupName" TEXT,
  "localContactId" TEXT,
  "localContactName" TEXT,
  "roleFlag" TEXT,
  action TEXT,
  detail TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  "contactId" TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  "expiresAt" TEXT NOT NULL,
  "usedAt" TEXT,
  "createdAt" TEXT DEFAULT (NOW()::TEXT),
  "accountType" TEXT NOT NULL DEFAULT 'contact'
);

CREATE TABLE IF NOT EXISTS emergency_hospitals_cache (
  "siteId" TEXT PRIMARY KEY,
  hospitals TEXT NOT NULL DEFAULT '[]',
  "cachedAt" TEXT NOT NULL DEFAULT (NOW()::TEXT)
);

CREATE TABLE IF NOT EXISTS image_submissions (
  id TEXT PRIMARY KEY,
  "originalFilename" TEXT NOT NULL,
  "storedFilename" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  "moderationFlag" TEXT,
  "moderationNote" TEXT,
  "submitterIp" TEXT,
  "submittedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMPTZ,
  "reviewedBy" TEXT
);

CREATE TABLE IF NOT EXISTS banned_ips (
  id SERIAL PRIMARY KEY,
  ip TEXT NOT NULL UNIQUE,
  reason TEXT,
  "bannedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "bannedBy" TEXT
);

CREATE TABLE IF NOT EXISTS sponsors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo TEXT DEFAULT '',
  url TEXT DEFAULT '',
  markdown TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

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
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ground_handling_sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL,
  lon REAL,
  "windDirections" TEXT DEFAULT '',
  description TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS page_attachments (
  id TEXT PRIMARY KEY,
  "pageSlug" TEXT NOT NULL,
  filename TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "downloadCount" INTEGER DEFAULT 0,
  "uploadedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_attachments_slug ON page_attachments("pageSlug");

CREATE TABLE IF NOT EXISTS competitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  location TEXT DEFAULT '',
  pilot_rating TEXT DEFAULT '',
  rules_summary TEXT DEFAULT '',
  registration_url TEXT DEFAULT '',
  status TEXT DEFAULT 'upcoming',
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pilots (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  "firstName" TEXT NOT NULL DEFAULT '',
  "lastName" TEXT NOT NULL DEFAULT '',
  "garminMapshare" TEXT DEFAULT NULL,
  "spotFeedId" TEXT DEFAULT NULL,
  "zoleoImei" TEXT DEFAULT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pilot_sessions (
  token TEXT PRIMARY KEY,
  "pilotId" TEXT NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pilot_sessions_pilotid ON pilot_sessions ("pilotId");

CREATE TABLE IF NOT EXISTS flights (
  id TEXT PRIMARY KEY,
  "pilotId" TEXT,
  "sessionToken" TEXT,
  "siteId" TEXT,
  "siteName" TEXT DEFAULT '',
  "startedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMPTZ,
  status TEXT DEFAULT 'recording',
  "maxAltitude" REAL DEFAULT 0,
  "maxSpeed" REAL DEFAULT 0,
  "totalDistance" REAL DEFAULT 0,
  "altitudeGain" REAL DEFAULT 0,
  "altitudeLoss" REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_flights_pilot ON flights("pilotId");
CREATE INDEX IF NOT EXISTS idx_flights_session ON flights("sessionToken");

CREATE TABLE IF NOT EXISTS breadcrumbs (
  id SERIAL PRIMARY KEY,
  "flightId" TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  altitude REAL DEFAULT 0,
  speed REAL DEFAULT 0,
  heading REAL DEFAULT 0,
  synced INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_breadcrumbs_flight ON breadcrumbs("flightId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_breadcrumbs_flight_ts ON breadcrumbs("flightId", timestamp);

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);
CREATE INDEX IF NOT EXISTS idx_checkins_site ON checkins("siteId");
CREATE INDEX IF NOT EXISTS idx_weather_obs_site ON weather_observations("siteId");
CREATE INDEX IF NOT EXISTS idx_weather_forecast_site ON weather_forecasts("siteId");
CREATE INDEX IF NOT EXISTS idx_image_submissions_status ON image_submissions(status);

CREATE TABLE IF NOT EXISTS retrievals (
  id TEXT PRIMARY KEY,
  "pilotId" TEXT NOT NULL,
  "pilotName" TEXT NOT NULL DEFAULT '',
  "pilotLat" REAL,
  "pilotLon" REAL,
  "pilotUpdatedAt" INTEGER,
  "driverId" TEXT,
  "driverName" TEXT,
  "driverLat" REAL,
  "driverLon" REAL,
  "driverUpdatedAt" INTEGER,
  status TEXT NOT NULL DEFAULT 'awaiting',
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ,
  "flightId" TEXT,
  "etaMinutes" INTEGER,
  "positionSource" TEXT DEFAULT 'phone'
);
CREATE INDEX IF NOT EXISTS idx_retrievals_pilot ON retrievals("pilotId");
CREATE INDEX IF NOT EXISTS idx_retrievals_status ON retrievals(status);
CREATE INDEX IF NOT EXISTS idx_retrievals_created ON retrievals("createdAt");
CREATE INDEX IF NOT EXISTS idx_retrievals_driver_status ON retrievals("driverId", status, "createdAt");

CREATE TABLE IF NOT EXISTS map_messages (
  id SERIAL PRIMARY KEY,
  "senderPilotId" TEXT NOT NULL,
  "senderName" TEXT NOT NULL,
  "recipientPilotId" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  message TEXT NOT NULL,
  "thumbsUp" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMPTZ DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_map_messages_recipient ON map_messages ("recipientPilotId", "deliveredAt");
CREATE INDEX IF NOT EXISTS idx_map_messages_sender ON map_messages ("senderPilotId");
CREATE INDEX IF NOT EXISTS idx_map_messages_created ON map_messages ("createdAt");

CREATE TABLE IF NOT EXISTS safety_sections (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "sectionType" TEXT NOT NULL DEFAULT 'custom',
  enabled INTEGER NOT NULL DEFAULT 1,
  "linkUrl" TEXT,
  "linkLabel" TEXT,
  "lastUpdated" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
