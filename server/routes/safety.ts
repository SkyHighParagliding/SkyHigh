import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import crypto from "crypto";

const router = Router();

router.get("/", asyncHandler(async (_req, res) => {
  const sections = await db.prepare(
    "SELECT * FROM safety_sections WHERE enabled = 1 ORDER BY sortOrder ASC"
  ).all();
  res.json(sections);
}));

router.get("/all", requireAuth, asyncHandler(async (_req, res) => {
  const sections = await db.prepare(
    "SELECT * FROM safety_sections ORDER BY sortOrder ASC"
  ).all();
  res.json(sections);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const section = await db.prepare("SELECT * FROM safety_sections WHERE id = ?").get(req.params.id);
  if (!section) return res.status(404).json({ error: "Section not found" });
  res.json(section);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { title, content, sortOrder, sectionType, enabled, linkUrl, linkLabel } = req.body;
  const id = `safety-${crypto.randomBytes(6).toString("hex")}`;
  await db.prepare(
    `INSERT INTO safety_sections (id, title, content, sortOrder, sectionType, enabled, linkUrl, linkLabel, lastUpdated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  ).run(id, title, content || "", sortOrder ?? 99, sectionType || "custom", enabled ?? 1, linkUrl || null, linkLabel || null);
  res.status(201).json({ id, success: true });
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { title, content, sortOrder, sectionType, enabled, linkUrl, linkLabel } = req.body;
  const existing = await db.prepare("SELECT id FROM safety_sections WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Section not found" });
  await db.prepare(
    `UPDATE safety_sections SET title = ?, content = ?, sortOrder = ?, sectionType = ?, enabled = ?, linkUrl = ?, linkLabel = ?, lastUpdated = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(title, content || "", sortOrder ?? 0, sectionType || "custom", enabled ?? 1, linkUrl || null, linkLabel || null, req.params.id);
  res.json({ success: true });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await db.prepare("DELETE FROM safety_sections WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Section not found" });
  res.json({ success: true });
}));

router.put("/reorder/batch", requireAuth, asyncHandler(async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: "items array required" });
  const stmt = await db.prepare("UPDATE safety_sections SET sortOrder = ? WHERE id = ?");
  await db.transaction(async () => {
    for (const item of items) {
      await stmt.run(item.sortOrder, item.id);
    }
  })();
  res.json({ success: true });
}));

export default router;
