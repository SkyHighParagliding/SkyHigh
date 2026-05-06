import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getPaginationParams, createPaginatedResponse } from "../utils/pagination.js";

const router = Router();

router.post("/track", asyncHandler(async (req, res) => {
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: "path is required" });
  await db.prepare(
    `INSERT INTO page_views (path, views, lastViewed) VALUES (@path, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(path) DO UPDATE SET views = page_views.views + 1, lastViewed = CURRENT_TIMESTAMP`
  ).run({ path });
  res.json({ success: true });
}));

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const { limit, offset } = getPaginationParams(req.query);
  const rows = await db.prepare("SELECT * FROM page_views ORDER BY views DESC LIMIT ? OFFSET ?").all(limit, offset);
  const countResult = await db.prepare("SELECT COUNT(*) as count FROM page_views").get() as { count: number };
  res.set('X-Total-Count', String(countResult.count));
  res.json(createPaginatedResponse(rows, countResult.count, limit, offset));
}));

router.post("/reset/:path", requireAuth, asyncHandler(async (req, res) => {
  const decodedPath = decodeURIComponent(req.params.path);
  const result = await db.prepare("UPDATE page_views SET views = 0 WHERE path = ?").run(decodedPath);
  if (result.changes === 0) return res.status(404).json({ error: "Page not found" });
  res.json({ success: true });
}));

router.post("/reset-all", requireAuth, asyncHandler(async (req, res) => {
  await db.prepare("UPDATE page_views SET views = 0").run();
  res.json({ success: true });
}));

export default router;
