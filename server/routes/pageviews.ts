import { Router } from "express";
import { query, queryOne, execute } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getPaginationParams, createPaginatedResponse } from "../utils/pagination.js";

const router = Router();

// In-memory rate limiter for page view tracking
const pageviewRateLimit = new Map<string, { count: number; resetAt: number }>();
const PAGEVIEW_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const PAGEVIEW_RATE_LIMIT_MAX = 60; // 60 per minute per IP (generous for analytics)

router.post("/track", asyncHandler(async (req, res) => {
  // Rate limiting by IP
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = pageviewRateLimit.get(ip);
  if (entry && now < entry.resetAt) {
    if (entry.count >= PAGEVIEW_RATE_LIMIT_MAX) {
      return res.status(429).json({ error: "Too many requests. Please slow down." });
    }
    entry.count++;
  } else {
    pageviewRateLimit.set(ip, { count: 1, resetAt: now + PAGEVIEW_RATE_LIMIT_WINDOW });
  }


  const { path } = req.body;
  if (!path) return res.status(400).json({ error: "path is required" });
  await execute("INSERT INTO page_views (path, views, \"lastViewed\") VALUES ($1, 1, CURRENT_TIMESTAMP) ON CONFLICT(path) DO UPDATE SET views = page_views.views + 1, \"lastViewed\" = CURRENT_TIMESTAMP", [path]);
  res.json({ success: true });
}));

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const { limit, offset } = getPaginationParams(req.query);
  const rows = await query<any>("SELECT * FROM page_views ORDER BY views DESC LIMIT $1 OFFSET $2", [limit, offset]);
  const countResult = await queryOne<{ count: string }>("SELECT COUNT(*) as count FROM page_views");
  res.set('X-Total-Count', String(Number(countResult?.count ?? 0)));
  res.json(createPaginatedResponse(rows, Number(countResult?.count ?? 0), limit, offset));
}));

router.post("/reset/:path", requireAuth, asyncHandler(async (req, res) => {
  const decodedPath = decodeURIComponent(req.params.path);
  const result = await execute("UPDATE page_views SET views = 0 WHERE path = $1", [decodedPath]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Page not found" });
  res.json({ success: true });
}));

router.post("/reset-all", requireAuth, asyncHandler(async (req, res) => {
  await execute("UPDATE page_views SET views = 0");
  res.json({ success: true });
}));

export default router;
