import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

function generateId() {
  return `comp-${Math.random().toString(36).substr(2, 9)}`;
}

router.get("/", asyncHandler(async (_req, res) => {
  const competitions = await db.prepare(
    `SELECT id, name, description, start_date AS startDate, end_date AS endDate,
     location, pilot_rating AS pilotRating, rules_summary AS rulesSummary,
     registration_url AS registrationUrl, status, createdAt, updatedAt
     FROM competitions ORDER BY start_date DESC`
  ).all();
  res.json(competitions);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const comp = await db.prepare(
    `SELECT id, name, description, start_date AS startDate, end_date AS endDate,
     location, pilot_rating AS pilotRating, rules_summary AS rulesSummary,
     registration_url AS registrationUrl, status, createdAt, updatedAt
     FROM competitions WHERE id = ?`
  ).get(req.params.id);
  if (!comp) return res.status(404).json({ error: "Competition not found" });
  res.json(comp);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { name, description, startDate, endDate, location, pilotRating, rulesSummary, registrationUrl, status } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const id = generateId();
  await db.prepare(
    `INSERT INTO competitions (id, name, description, start_date, end_date, location, pilot_rating, rules_summary, registration_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name.trim(), description || "", startDate || "", endDate || "", location || "", pilotRating || "", rulesSummary || "", registrationUrl || "", status || "upcoming");

  const comp = await db.prepare(
    `SELECT id, name, description, start_date AS startDate, end_date AS endDate,
     location, pilot_rating AS pilotRating, rules_summary AS rulesSummary,
     registration_url AS registrationUrl, status, createdAt, updatedAt
     FROM competitions WHERE id = ?`
  ).get(id);
  res.status(201).json(comp);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { name, description, startDate, endDate, location, pilotRating, rulesSummary, registrationUrl, status } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const result = await db.prepare(
    `UPDATE competitions SET name = ?, description = ?, start_date = ?, end_date = ?,
     location = ?, pilot_rating = ?, rules_summary = ?, registration_url = ?, status = ?,
     updatedAt = datetime('now') WHERE id = ?`
  ).run(name.trim(), description || "", startDate || "", endDate || "", location || "", pilotRating || "", rulesSummary || "", registrationUrl || "", status || "upcoming", req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: "Competition not found" });

  const comp = await db.prepare(
    `SELECT id, name, description, start_date AS startDate, end_date AS endDate,
     location, pilot_rating AS pilotRating, rules_summary AS rulesSummary,
     registration_url AS registrationUrl, status, createdAt, updatedAt
     FROM competitions WHERE id = ?`
  ).get(req.params.id);
  res.json(comp);
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await db.prepare("DELETE FROM competitions WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Competition not found" });
  res.json({ success: true });
}));

export default router;
