/**
 * Centralized configuration constants for SkyHigh server
 * All hardcoded config values live here for easy maintenance and consistency
 */

// ─── Pagination ───────────────────────────────────────────────────────────
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

// ─── Session Management ────────────────────────────────────────────────────
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const SESSION_TOKEN_LENGTH = 32; // bytes
export const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// ─── CSRF Protection ──────────────────────────────────────────────────────
export const CSRF_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const CSRF_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// ─── Caching ──────────────────────────────────────────────────────────────
export const PUBLIC_SITES_CACHE_TTL = 60 * 1000; // 1 minute
export const WIND_GRID_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const WIND_GRID_CLEANUP_AGE_DAYS = 7; // Remove grids older than 7 days
export const EMERGENCY_HOSPITAL_CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
export const SITEGUIDE_VERSION_CHECK_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const GENERIC_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes (projects, shop, etc.)

// ─── Rate Limiting ────────────────────────────────────────────────────────
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const ADMIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const PILOT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const PILOT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ─── API & Data Limits ────────────────────────────────────────────────────
export const FETCH_TIMEOUT_MS = 10 * 1000; // 10 seconds
export const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MB
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_OBSERVATIONS_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

// ─── Demo Services (Flight Tracking) ───────────────────────────────────────
export const DEMO_ACTIVE_FLIGHT_TTL_MS = 60 * 1000; // 1 minute
export const DEMO_LANDED_FLIGHT_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
export const DEMO_DRIVER_POSITION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// ─── Database ─────────────────────────────────────────────────────────────
export const DB_POOL_MAX = 20;
export const DB_IDLE_TIMEOUT_MS = 60 * 1000; // 60 seconds
export const DB_CONNECTION_TIMEOUT_MS = 10 * 1000; // 10 seconds
export const DB_STATEMENT_TIMEOUT_MS = 30 * 1000; // 30 seconds
