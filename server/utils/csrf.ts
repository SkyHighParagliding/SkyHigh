import crypto from "crypto";

/**
 * CSRF Protection using token-based validation.
 * Tokens are generated per user session and must be included in state-changing requests.
 */

interface CSRFToken {
  token: string;
  expiresAt: number;
}

// In-memory store: userId -> { token, expiresAt }
// In production, consider using Redis or database
const tokenStore = new Map<string, CSRFToken>();
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Clean expired tokens every hour

/**
 * Generate a new CSRF token for a user (identified by sessionId or userId)
 */
export function generateCSRFToken(userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  tokenStore.set(userId, {
    token,
    expiresAt: Date.now() + TOKEN_EXPIRY_MS,
  });
  return token;
}

/**
 * Validate a CSRF token for a user
 */
export function validateCSRFToken(userId: string, token: string): boolean {
  const stored = tokenStore.get(userId);
  if (!stored) return false;
  if (Date.now() > stored.expiresAt) {
    tokenStore.delete(userId);
    return false;
  }
  // Token is valid, but don't delete it - it can be reused until expiry
  return crypto.timingSafeEqual(Buffer.from(stored.token), Buffer.from(token));
}

/**
 * Get the current CSRF token for a user (generates new one if expired or missing)
 */
export function getOrCreateCSRFToken(userId: string): string {
  const stored = tokenStore.get(userId);
  if (stored && Date.now() <= stored.expiresAt) {
    return stored.token;
  }
  return generateCSRFToken(userId);
}

/**
 * Cleanup expired tokens (run periodically)
 */
function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [userId, token] of tokenStore.entries()) {
    if (now > token.expiresAt) {
      tokenStore.delete(userId);
    }
  }
}

// Start cleanup interval
setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL_MS);
