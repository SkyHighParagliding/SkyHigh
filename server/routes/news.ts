import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { invalidateSearchCaches } from "./search.js";
import { getPaginationParams, createPaginatedResponse } from "../utils/pagination.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const { limit, offset } = getPaginationParams(req.query);
  const data = await db.prepare("SELECT * FROM news ORDER BY date DESC LIMIT ? OFFSET ?").all(limit, offset) as any[];
  const countResult = await db.prepare("SELECT COUNT(*) as count FROM news").get() as { count: number };
  const total = countResult.count;
  res.set('X-Total-Count', String(total));
  res.json(createPaginatedResponse(data, total, limit, offset));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const item = await db.prepare("SELECT * FROM news WHERE id = ?").get(req.params.id);
  if (!item) return res.status(404).json({ error: "News not found" });
  res.json(item);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { id, title, content, date, author, heroImage } = req.body;
  await db.prepare("INSERT INTO news (id, title, content, date, author, heroImage) VALUES (@id, @title, @content, @date, @author, @heroImage)").run({ id, title, content, date, author, heroImage: heroImage || null });
  invalidateSearchCaches();
  res.status(201).json({ success: true });
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { title, content, date, author, heroImage } = req.body;
  await db.prepare("UPDATE news SET title = @title, content = @content, date = @date, author = @author, heroImage = @heroImage WHERE id = @id").run({ id: req.params.id, title, content, date, author, heroImage: heroImage || null });
  invalidateSearchCaches();
  res.json({ success: true });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await db.prepare("DELETE FROM news WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "News not found" });
  invalidateSearchCaches();
  res.json({ success: true });
}));

export default router;
