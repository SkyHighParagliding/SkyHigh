import { Router } from "express";
import { query, queryOne, execute } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import crypto from "crypto";

const router = Router();

interface SafetySection {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  sectionType: string;
  enabled: number;
  linkUrl: string | null;
  linkLabel: string | null;
  lastUpdated: string;
}

router.get("/", asyncHandler(async (_req, res) => {
  const sections = await query<SafetySection>(
    `SELECT * FROM safety_sections WHERE enabled = 1 ORDER BY "sortOrder" ASC`
  );
  res.json(sections);
}));

router.get("/all", requireAuth, asyncHandler(async (_req, res) => {
  const sections = await query<SafetySection>(
    `SELECT * FROM safety_sections ORDER BY "sortOrder" ASC`
  );
  res.json(sections);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const section = await queryOne<SafetySection>(
    "SELECT * FROM safety_sections WHERE id = $1",
    [req.params.id]
  );
  if (!section) return res.status(404).json({ error: "Section not found" });
  res.json(section);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { title, content, sortOrder, sectionType, enabled, linkUrl, linkLabel } = req.body;
  const id = `safety-${crypto.randomBytes(6).toString("hex")}`;
  await execute(
    `INSERT INTO safety_sections (id, title, content, "sortOrder", "sectionType", enabled, "linkUrl", "linkLabel", "lastUpdated")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [id, title, content || "", sortOrder ?? 99, sectionType || "custom", enabled ?? 1, linkUrl || null, linkLabel || null]
  );
  res.status(201).json({ id, success: true });
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { title, content, sortOrder, sectionType, enabled, linkUrl, linkLabel } = req.body;
  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM safety_sections WHERE id = $1",
    [req.params.id]
  );
  if (!existing) return res.status(404).json({ error: "Section not found" });
  await execute(
    `UPDATE safety_sections SET title = $1, content = $2, "sortOrder" = $3, "sectionType" = $4, enabled = $5, "linkUrl" = $6, "linkLabel" = $7, "lastUpdated" = NOW()
     WHERE id = $8`,
    [title, content || "", sortOrder ?? 0, sectionType || "custom", enabled ?? 1, linkUrl || null, linkLabel || null, req.params.id]
  );
  res.json({ success: true });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await execute(
    "DELETE FROM safety_sections WHERE id = $1",
    [req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "Section not found" });
  res.json({ success: true });
}));

router.put("/reorder/batch", requireAuth, asyncHandler(async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: "items array required" });
  const { transaction } = await import("../pg.js");
  await transaction(async (client: any) => {
    for (const item of items) {
      await client.query(
        `UPDATE safety_sections SET "sortOrder" = $1 WHERE id = $2`,
        [item.sortOrder, item.id]
      );
    }
  });
  res.json({ success: true });
}));

export default router;
