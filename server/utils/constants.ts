// Application-wide constants to replace magic numbers

// Rate Limiting (in milliseconds)
export const RATE_LIMITS = {
  LOGIN_WINDOW_MS: 15 * 60 * 1000,      // 15 minutes
  LOGIN_MAX_ATTEMPTS: 10,

  SEARCH_WINDOW_MS: 60 * 1000,           // 1 minute
  SEARCH_MAX_REQUESTS: 20,

  SUBMISSION_WINDOW_MS: 60 * 60 * 1000,  // 1 hour
  SUBMISSION_DEFAULT_LIMIT: 20,
  SUBMISSION_MAX_LIMIT: 100,

  STATE_CHANGE_WINDOW_MS: 60 * 60 * 1000, // 1 hour
  STATE_CHANGE_MAX_REQUESTS: 100,

  BULK_OP_WINDOW_MS: 60 * 60 * 1000,     // 1 hour
  BULK_OP_MAX_REQUESTS: 20,

  REGISTRATION_WINDOW_MS: 60 * 60 * 1000, // 1 hour
  REGISTRATION_MAX_ATTEMPTS: 3,

  PASSWORD_RESET_WINDOW_MS: 60 * 60 * 1000, // 1 hour
  PASSWORD_RESET_MAX_ATTEMPTS: 5,
};

// Database Connection Pool Settings
export const DB_POOL_CONFIG = {
  DEFAULT_MAX: 20,
  DEFAULT_IDLE_TIMEOUT_MS: 60000,        // 60 seconds
  DEFAULT_CONNECTION_TIMEOUT_MS: 10000,  // 10 seconds
  DEFAULT_STATEMENT_TIMEOUT_MS: 30000,   // 30 seconds
  POOL_EXHAUSTION_THRESHOLD: 0.8,        // 80% capacity
};

// Cache Settings
export const CACHE_CONFIG = {
  PUBLIC_SITES_TTL_MS: 30000,             // 30 seconds
  WEATHER_GRID_CACHE_EXPIRY_MS: 30 * 60 * 1000, // 30 minutes
  EXTENDED_FORECAST_TTL_MS: 3600000,      // 1 hour
  EMERGENCY_HOSPITALS_CACHE_TTL_MS: 7 * 24 * 3600 * 1000, // 7 days
};

// CSRF Token Settings
export const CSRF_CONFIG = {
  TOKEN_LENGTH: 32,                       // bytes
  EXPIRY_TIME_MS: 24 * 60 * 60 * 1000,   // 24 hours
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000,   // 1 hour
};

// File Upload Settings
export const FILE_CONFIG = {
  MAX_UPLOAD_SIZE: 20 * 1024 * 1024,      // 20 MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  MAX_FILENAME_LENGTH: 255,
};

// Pagination Settings
export const PAGINATION_CONFIG = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 500,
};

// API Settings
export const API_CONFIG = {
  DEFAULT_TIMEOUT_MS: 10000,              // 10 seconds
  FETCH_TIMEOUT_MS: 8000,                 // 8 seconds
  MAX_RETRIES: 3,
  INITIAL_BACKOFF_MS: 1000,               // 1 second
};

// Application Settings
// NOTE: LOG_LEVEL config lives in logger.ts — do not duplicate here
export const APP_CONFIG = {
  PASSWORD_SALT_ROUNDS: 10,
  SESSION_CLEANUP_INTERVAL_MS: 60 * 60 * 1000, // 1 hour
};

// Weather Scraper Settings
export const WEATHER_CONFIG = {
  MIN_INTERVAL_MINUTES: 15,
  MAX_INTERVAL_MINUTES: 30,
  START_HOUR: 7,
  END_HOUR: 20,
  LIVE_WIND_TIMEOUT_MS: 8000,
  OVERPASS_TIMEOUT_MS: 25000,
};

// Pagination and Grid Settings
export const GRID_CONFIG = {
  VICTORIA_DELTA: 0.025,
  WIDE_DELTA: 0.1,
  MAX_POINTS_PER_TILE: 90,
};
