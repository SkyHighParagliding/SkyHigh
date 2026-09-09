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

  const flaggedOnly = req.query.flagged === "true";
  const baseCount = "SELECT COUNT(*) as total FROM search_logs";
  const baseData = "SELECT id, search_type, query, response, created_at, flagged FROM search_logs";

  const conditions: string[] = [];
  const params: any[] = [];

  if (type !== "all") {
    params.push(type);
    conditions.push(`search_type = $${params.length}`);
  }
  if (flaggedOnly) {
    conditions.push("flagged = TRUE");
  }

  const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
  const countRow = await queryOne<{ total: string }>(baseCount + where, params);
  const total = parseInt(String(countRow?.total ?? 0));
  params.push(limit, offset);
  const rows = await query<any>(baseData + where + ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
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

// POST /api/search-logs/flag — no auth, public pilots flag bad answers by query text
router.post("/flag", asyncHandler(async (req, res) => {
  const { query: q } = req.body;
  if (!q || typeof q !== "string") return res.status(400).json({ error: "query required" });

  const row = await queryOne<{ id: number }>(
    "SELECT id FROM search_logs WHERE query = $1 AND search_type = 'public' ORDER BY created_at DESC LIMIT 1",
    [q.trim()]
  );
  if (!row) return res.status(404).json({ error: "log entry not found" });

  await execute("UPDATE search_logs SET flagged = TRUE WHERE id = $1", [row.id]);
  res.json({ ok: true, id: row.id });
}));

// DELETE /api/search-logs
router.delete("/", requireAuth, asyncHandler(async (_req, res) => {
  await execute("DELETE FROM search_logs");
  await execute("INSERT INTO settings (key, value) VALUES ('searchLogWarningSent', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'");
  res.json({ ok: true });
}));

export default router;
