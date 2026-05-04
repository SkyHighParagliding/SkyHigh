import { Request, Response, NextFunction } from "express";
import { validateCSRFToken, getOrCreateCSRFToken } from "../utils/csrf.js";
import createLogger from "../utils/logger.js";

const log = createLogger("csrf");

/**
 * CSRF token provider middleware
 * Attaches CSRF token to response headers for authenticated users
 */
export function csrfTokenProvider(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (user && user.id) {
    const token = getOrCreateCSRFToken(user.id);
    // Return token in response header so frontend can capture it
    res.setHeader("X-CSRF-Token", token);
    // Also attach to request for potential use in response body
    (req as any).csrfToken = token;
  }
  next();
}

/**
 * CSRF token validator middleware
 * Validates CSRF token on state-changing requests (POST, PUT, DELETE, PATCH)
 * Skips validation for:
 * - GET/HEAD/OPTIONS requests (safe methods)
 * - Unauthenticated requests
 * - Excluded routes (login, webhooks, etc.)
 */
export function csrfTokenValidator(req: Request, res: Response, next: NextFunction) {
  // Skip validation for safe HTTP methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  const user = (req as any).user;

  // Unauthenticated requests don't need CSRF validation (handled by requireAuth)
  if (!user || !user.id) {
    return next();
  }

  // Get CSRF token from request (try multiple locations)
  const tokenFromHeader = req.headers["x-csrf-token"] as string;
  const tokenFromBody = (req.body as any)?.csrfToken as string;
  const token = tokenFromHeader || tokenFromBody;

  if (!token) {
    log.warn(`Missing CSRF token from ${user.id} on ${req.method} ${req.path}`);
    return res.status(403).json({ error: "CSRF token required" });
  }

  if (!validateCSRFToken(user.id, token)) {
    log.warn(`Invalid CSRF token from ${user.id} on ${req.method} ${req.path}`);
    return res.status(403).json({ error: "Invalid CSRF token" });
  }

  next();
}

/**
 * Special endpoint to get CSRF token without making a state-changing request
 * Useful for initializing frontend with a token before making API calls
 */
export function getCSRFTokenRoute(req: Request, res: Response) {
  const user = (req as any).user;
  const userId = user?.id || "anonymous";
  const token = getOrCreateCSRFToken(userId);
  res.json({ csrfToken: token });
}
