CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  userId INTEGER NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES admin_users(id)
);
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT,
  type TEXT,
  windDir TEXT,
  windSpeed TEXT,
  status TEXT,
  hazardLevel TEXT,
  lat REAL,
  lon REAL,
  description TEXT,
  launch TEXT,
  landing TEXT,
  hazards TEXT,
  rules TEXT,
  image TEXT,
  useLiveWeather TEXT DEFAULT 'false',
  liveStationId TEXT,
  siteguideUrl TEXT,
  siteContact TEXT,
  siteContactPhone TEXT,
  navigateTo TEXT,
  launchHeight TEXT,
  hoodedPloversLink TEXT,
  hoodedPloversActive TEXT DEFAULT 'false',
  emergencyMarker TEXT,
  what3words TEXT,
  weatherStationLink TEXT,
  crossLeft TEXT DEFAULT 'false',
  crossRight TEXT DEFAULT 'false',
  isSkyHighSite TEXT DEFAULT 'false',
  pgRating TEXT,
  hgRating TEXT,
  overrideHideClosed TEXT DEFAULT 'false'
);
CREATE TABLE IF NOT EXISTS external_site_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  url TEXT,
  state TEXT,
  region TEXT,
  lastScraped DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS check_ins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siteId TEXT,
  pilotName TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS pages (
  slug TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,
  date TEXT,
  author TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siteId TEXT,
  pilotName TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS weather_observations (
  siteId TEXT PRIMARY KEY,
  windSpeed INTEGER,
  windGust INTEGER,
  direction TEXT,
  stationName TEXT,
  stationLat REAL,
  stationLon REAL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS weather_forecasts (
  siteId TEXT PRIMARY KEY,
  timestamp DATETIME,
  temperature REAL,
  windSpeed INTEGER,
  windGust INTEGER,
  windDirection TEXT,
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
  siteId TEXT PRIMARY KEY,
  gridData TEXT,
  gridSize INTEGER DEFAULT 5,
  gridSpacing REAL DEFAULT 0.05,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS page_views (
  path TEXT PRIMARY KEY,
  views INTEGER DEFAULT 0,
  lastViewed DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS procedures (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  icon TEXT DEFAULT 'ClipboardList',
  iconColor TEXT DEFAULT 'text-navy',
  description TEXT,
  steps TEXT DEFAULT '[]',
  sortOrder INTEGER DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
