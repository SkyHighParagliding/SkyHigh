import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

// GET /api/search-logs?type=all|public|admin&page=1&limit=50
router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const type = (req.query.type as string) || "all";
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = (page - 1) * limit;

  let countQuery = "SELECT COUNT(*) as total FROM search_logs";
  let dataQuery = "SELECT id, search_type, query, response, created_at FROM search_logs";

  if (type !== "all") {
    countQuery += " WHERE search_type = ?";
    dataQuery += " WHERE search_type = ?";
    const countRow = await db.prepare(countQuery).get(type) as { total: number | string };
    const rows = await db.prepare(dataQuery + " ORDER BY created_at DESC LIMIT ? OFFSET ?").all(type, limit, offset);
    return res.json({
      entries: rows,
      total: parseInt(String(countRow.total)),
      page,
      limit,
      pages: Math.ceil(parseInt(String(countRow.total)) / limit),
    });
  }

  const countRow = await db.prepare(countQuery).get() as { total: number | string };
  const rows = await db.prepare(dataQuery + " ORDER BY created_at DESC LIMIT ? OFFSET ?").all(limit, offset);
  const total = parseInt(String(countRow.total));
  res.json({
    entries: rows,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  });
}));

// GET /api/search-logs/stats
router.get("/stats", requireAuth, asyncHandler(async (_req, res) => {
  const countRow = await db.prepare("SELECT COUNT(*) as total FROM search_logs").get() as { total: number | string };
  const sizeRow = await db.prepare("SELECT SUM(LENGTH(query) + LENGTH(response)) as bytes FROM search_logs").get() as { bytes: number | null };
  const oldestRow = await db.prepare("SELECT MIN(created_at) as oldest FROM search_logs").get() as { oldest: string | null };
  const enabledRow = await db.prepare("SELECT value FROM settings WHERE key = 'searchLoggingEnabled'").get() as { value: string } | undefined;
  const warningMbRow = await db.prepare("SELECT value FROM settings WHERE key = 'searchLogSizeWarningMb'").get() as { value: string } | undefined;

  const bytes = Number(sizeRow?.bytes) || 0;
  const mb = bytes / (1024 * 1024);

  res.json({
    total: parseInt(String(countRow.total)),
    sizeMb: Math.round(mb * 100) / 100,
    oldestAt: oldestRow?.oldest || null,
    enabled: enabledRow?.value === "true",
    warningMb: parseInt(warningMbRow?.value || "10"),
  });
}));

// POST /api/search-logs/toggle
router.post("/toggle", requireAuth, asyncHandler(async (req, res) => {
  const { enabled } = req.body;
  await db.prepare("INSERT INTO settings (key, value) VALUES ('searchLoggingEnabled', ?) ON CONFLICT (key) DO UPDATE SET value = ?").run(String(!!enabled), String(!!enabled));
  res.json({ ok: true, enabled: !!enabled });
}));

// DELETE /api/search-logs
router.delete("/", requireAuth, asyncHandler(async (_req, res) => {
  await db.prepare("DELETE FROM search_logs").run();
  await db.prepare("INSERT INTO settings (key, value) VALUES ('searchLogWarningSent', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'").run();
  res.json({ ok: true });
}));

export default router;
