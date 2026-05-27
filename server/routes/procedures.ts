import { Router } from "express";
import { query, queryOne, execute } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { invalidateSearchCaches } from "./search.js";
import { getPaginationParams, createPaginatedResponse } from "../utils/pagination.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const { limit, offset } = getPaginationParams(req.query);
  const procedures = await query<any>(`SELECT * FROM procedures ORDER BY "sortOrder" ASC, "createdAt" ASC LIMIT $1 OFFSET $2`, [limit, offset]);
  const countResult = await queryOne<{ count: string }>("SELECT COUNT(*) as count FROM procedures");
  const parsed = procedures.map(p => {
    let steps: string[];
    try { const s = JSON.parse(p.steps || '[]'); steps = Array.isArray(s) ? s : []; } catch { steps = []; }
    return { ...p, steps };
  });
  const total = Number(countResult!.count);
  res.set('X-Total-Count', String(total));
  res.json(createPaginatedResponse(parsed, total, limit, offset));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const item = await queryOne<any>("SELECT * FROM procedures WHERE id = $1", [req.params.id]);
  if (!item) return res.status(404).json({ error: "Procedure not found" });
  try { const s = JSON.parse(item.steps || '[]'); item.steps = Array.isArray(s) ? s : []; } catch { item.steps = []; }
  res.json(item);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { id, title, icon, iconColor, description, steps, sortOrder } = req.body;
  if (!id || !title) return res.status(400).json({ error: "ID and title are required" });
  await execute(
    `INSERT INTO procedures (id, title, icon, "iconColor", description, steps, "sortOrder") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, title, icon || 'ClipboardList', iconColor || 'text-navy', description || '', JSON.stringify(steps || []), sortOrder || 0]
  );
  invalidateSearchCaches();
  res.status(201).json({ success: true });
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { title, icon, iconColor, description, steps, sortOrder } = req.body;
  const existing = await queryOne<{ id: string }>("SELECT id FROM procedures WHERE id = $1", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Procedure not found" });
  await execute(
    `UPDATE procedures SET title = $1, icon = $2, "iconColor" = $3, description = $4, steps = $5, "sortOrder" = $6, "updatedAt" = CURRENT_TIMESTAMP WHERE id = $7`,
    [title, icon, iconColor, description, JSON.stringify(steps || []), sortOrder ?? 0, req.params.id]
  );
  invalidateSearchCaches();
  res.json({ success: true });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await execute("DELETE FROM procedures WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Procedure not found" });
  invalidateSearchCaches();
  res.json({ success: true });
}));

export default router;
