import { Router } from "express";
import { query, queryOne, execute } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { invalidateSearchCaches } from "./search.js";
import { getPaginationParams, createPaginatedResponse } from "../utils/pagination.js";

interface NewsRow {
  id: string;
  title: string;
  content: string;
  date: string;
  author: string;
  heroImage: string | null;
}

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const { limit, offset } = getPaginationParams(req.query);
  const data = await query<NewsRow>(
    `SELECT * FROM news ORDER BY date DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM news`
  );
  const total = Number(countResult?.count ?? 0);
  res.set('X-Total-Count', String(total));
  res.json(createPaginatedResponse(data, total, limit, offset));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const item = await queryOne<NewsRow>(
    `SELECT * FROM news WHERE id = $1`,
    [req.params.id]
  );
  if (!item) return res.status(404).json({ error: "News not found" });
  res.json(item);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { id, title, content, date, author, heroImage } = req.body;
  await execute(
    `INSERT INTO news (id, title, content, date, author, "heroImage")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, title, content, date, author, heroImage || null]
  );
  invalidateSearchCaches();
  res.status(201).json({ success: true });
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { title, content, date, author, heroImage } = req.body;
  const result = await execute(
    `UPDATE news
     SET title = $1, content = $2, date = $3, author = $4, "heroImage" = $5
     WHERE id = $6`,
    [title, content, date, author, heroImage || null, req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "News not found" });
  invalidateSearchCaches();
  res.json({ success: true });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await execute(
    `DELETE FROM news WHERE id = $1`,
    [req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "News not found" });
  invalidateSearchCaches();
  res.json({ success: true });
}));

export default router;
