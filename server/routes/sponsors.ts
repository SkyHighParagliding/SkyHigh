import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

function generateId() {
  return `spo-${Math.random().toString(36).substr(2, 9)}`;
}

router.get("/", asyncHandler(async (req, res) => {
  const sponsors = await db.prepare(
    "SELECT id, name, logo, url, markdown, sort_order AS sortOrder, createdAt, updatedAt FROM sponsors ORDER BY sort_order ASC, name ASC"
  ).all();
  res.json(sponsors);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const sponsor = await db.prepare(
    "SELECT id, name, logo, url, markdown, sort_order AS sortOrder, createdAt, updatedAt FROM sponsors WHERE id = ?"
  ).get(req.params.id);
  if (!sponsor) return res.status(404).json({ error: "Sponsor not found" });
  res.json(sponsor);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { name, logo, url, markdown, sortOrder } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const id = generateId();
  const maxOrder = await db.prepare("SELECT MAX(sort_order) as maxOrder FROM sponsors").get() as any;
  const order = sortOrder !== undefined ? sortOrder : ((maxOrder?.maxOrder ?? -1) + 1);

  await db.prepare(
    `INSERT INTO sponsors (id, name, logo, url, markdown, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, name.trim(), logo || "", url || "", markdown || "", order);

  const sponsor = await db.prepare(
    "SELECT id, name, logo, url, markdown, sort_order AS sortOrder, createdAt, updatedAt FROM sponsors WHERE id = ?"
  ).get(id);
  res.status(201).json(sponsor);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { name, logo, url, markdown, sortOrder } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const params: any[] = [
    name.trim(), logo || "", url || "", markdown || "",
  ];

  let sortClause = "";
  if (sortOrder !== undefined) {
    sortClause = ", sort_order = ?";
    params.push(sortOrder);
  }

  params.push(req.params.id);

  const result = await db.prepare(
    `UPDATE sponsors SET name = ?, logo = ?, url = ?, markdown = ?${sortClause},
     updatedAt = datetime('now') WHERE id = ?`
  ).run(...params);

  if (result.changes === 0) return res.status(404).json({ error: "Sponsor not found" });

  const sponsor = await db.prepare(
    "SELECT id, name, logo, url, markdown, sort_order AS sortOrder, createdAt, updatedAt FROM sponsors WHERE id = ?"
  ).get(req.params.id);
  res.json(sponsor);
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await db.prepare("DELETE FROM sponsors WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Sponsor not found" });
  res.json({ success: true });
}));

export default router;
