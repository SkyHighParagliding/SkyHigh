import { Router } from "express";
import { query, queryOne, execute } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

// GET /api/search-logs?type=all|public|admin&page=1&limit=50
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const type = (req.query.type as string) || "all";
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = (page - 1) * limit;

  const baseCount = "SELECT COUNT(*) as total FROM search_logs";
  const baseData = "SELECT id, search_type, query, response, created_at FROM search_logs";

  if (type !== "all") {
    const countRow = await queryOne<{ total: string }>(baseCount + " WHERE search_type = $1", [type]);
    const rows = await query<any>(baseData + " WHERE search_type = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", [type, limit, offset]);
    const total = parseInt(String(countRow?.total ?? 0));
    return res.json({ entries: rows, total, page, limit, pages: Math.ceil(total / limit) });
  }

  const countRow = await queryOne<{ total: string }>(baseCount);
  const rows = await query<any>(baseData + " ORDER BY created_at DESC LIMIT $1 OFFSET $2", [limit, offset]);
  const total = parseInt(String(countRow?.total ?? 0));
  res.json({ entries: rows, total, page, limit, pages: Math.ceil(total / limit) });
}));

// GET /api/search-logs/stats
router.get("/stats", requireAuth, asyncHandler(async (_req, res) => {
  const countRow = await queryOne<{ total: string }>("SELECT COUNT(*) as total FROM search_logs");
  const sizeRow = await queryOne<{ bytes: string | null }>("SELECT SUM(LENGTH(query) + LENGTH(response)) as bytes FROM search_logs");
  const oldestRow = await queryOne<{ oldest: string | null }>("SELECT MIN(created_at) as oldest FROM search_logs");
  const enabledRow = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'searchLoggingEnabled'");
  const warningMbRow = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'searchLogSizeWarningMb'");

  const bytes = Number(sizeRow?.bytes) || 0;
  const mb = bytes / (1024 * 1024);

  res.json({
    total: parseInt(String(countRow?.total ?? 0)),
    sizeMb: Math.round(mb * 100) / 100,
    oldestAt: oldestRow?.oldest || null,
    enabled: enabledRow?.value === "true",
    warningMb: parseInt(warningMbRow?.value || "10"),
  });
}));

// POST /api/search-logs/toggle
router.post("/toggle", requireAuth, asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  const val = String(!!enabled);
  await execute("INSERT INTO settings (key, value) VALUES ('searchLoggingEnabled', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [val]);
  res.json({ ok: true, enabled: !!enabled });
}));

// DELETE /api/search-logs
router.delete("/", requireAuth, asyncHandler(async (_req, res) => {
  await execute("DELETE FROM search_logs");
  await execute("INSERT INTO settings (key, value) VALUES ('searchLogWarningSent', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'");
  res.json({ ok: true });
}));

export default router;
