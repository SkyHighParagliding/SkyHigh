/**
 * Centralized configuration constants for SkyHigh server
 * All hardcoded config values live here for easy maintenance and consistency
 */

// ─── Pagination ───────────────────────────────────────────────────────────
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

// ─── CSRF Protection ──────────────────────────────────────────────────────
export const CSRF_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
export const CSRF_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// ─── Caching ──────────────────────────────────────────────────────────────
export const PUBLIC_SITES_CACHE_TTL = 60 * 1000; // 1 minute
export const WIND_GRID_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const SITEGUIDE_VERSION_CHECK_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Rate Limiting ────────────────────────────────────────────────────────
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const PILOT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const PILOT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ─── API & Data Limits ────────────────────────────────────────────────────
export const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MB
export const MAX_MESSAGE_LENGTH = 500;

