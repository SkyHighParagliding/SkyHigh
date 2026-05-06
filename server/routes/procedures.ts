import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { invalidateSearchCaches } from "./search.js";
import { getPaginationParams, createPaginatedResponse } from "../utils/pagination.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const { limit, offset } = getPaginationParams(req.query);
  const procedures = await db.prepare("SELECT * FROM procedures ORDER BY sortOrder ASC, createdAt ASC LIMIT ? OFFSET ?").all(limit, offset) as any[];
  const countResult = await db.prepare("SELECT COUNT(*) as count FROM procedures").get() as { count: number };
  const parsed = procedures.map(p => {
    let steps: string[];
    try { const s = JSON.parse(p.steps || '[]'); steps = Array.isArray(s) ? s : []; } catch { steps = []; }
    return { ...p, steps };
  });
  res.set('X-Total-Count', String(countResult.count));
  res.json(createPaginatedResponse(parsed, countResult.count, limit, offset));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const item = await db.prepare("SELECT * FROM procedures WHERE id = ?").get(req.params.id) as any;
  if (!item) return res.status(404).json({ error: "Procedure not found" });
  try { const s = JSON.parse(item.steps || '[]'); item.steps = Array.isArray(s) ? s : []; } catch { item.steps = []; }
  res.json(item);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { id, title, icon, iconColor, description, steps, sortOrder } = req.body;
  if (!id || !title) return res.status(400).json({ error: "ID and title are required" });
  await db.prepare(`
    INSERT INTO procedures (id, title, icon, iconColor, description, steps, sortOrder)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, icon || 'ClipboardList', iconColor || 'text-navy', description || '', JSON.stringify(steps || []), sortOrder || 0);
  invalidateSearchCaches();
  res.status(201).json({ success: true });
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { title, icon, iconColor, description, steps, sortOrder } = req.body;
  const existing = await db.prepare("SELECT id FROM procedures WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Procedure not found" });
  await db.prepare(`
    UPDATE procedures SET title = ?, icon = ?, iconColor = ?, description = ?, steps = ?, sortOrder = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, icon, iconColor, description, JSON.stringify(steps || []), sortOrder ?? 0, req.params.id);
  invalidateSearchCaches();
  res.json({ success: true });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await db.prepare("DELETE FROM procedures WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Procedure not found" });
  invalidateSearchCaches();
  res.json({ success: true });
}));

export default router;
