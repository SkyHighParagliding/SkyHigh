import { Router } from "express";
import { query, queryOne, execute } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

interface CompetitionRow {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string;
  pilotRating: string;
  rulesSummary: string;
  registrationUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function generateId() {
  return `comp-${Math.random().toString(36).substr(2, 9)}`;
}

router.get("/", asyncHandler(async (_req, res) => {
  const rows = await query<CompetitionRow>(
    `SELECT id, name, description, "start_date" AS "startDate", "end_date" AS "endDate",
     location, "pilot_rating" AS "pilotRating", "rules_summary" AS "rulesSummary",
     "registration_url" AS "registrationUrl", status, "createdAt", "updatedAt"
     FROM competitions ORDER BY "start_date" DESC`
  );
  res.json(rows);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const comp = await queryOne<CompetitionRow>(
    `SELECT id, name, description, "start_date" AS "startDate", "end_date" AS "endDate",
     location, "pilot_rating" AS "pilotRating", "rules_summary" AS "rulesSummary",
     "registration_url" AS "registrationUrl", status, "createdAt", "updatedAt"
     FROM competitions WHERE id = $1`,
    [req.params.id]
  );
  if (!comp) return res.status(404).json({ error: "Competition not found" });
  res.json(comp);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { name, description, startDate, endDate, location, pilotRating, rulesSummary, registrationUrl, status } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const id = generateId();
  await execute(
    `INSERT INTO competitions (id, name, description, "start_date", "end_date", location, "pilot_rating", "rules_summary", "registration_url", status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, name.trim(), description || "", startDate || "", endDate || "", location || "", pilotRating || "", rulesSummary || "", registrationUrl || "", status || "upcoming"]
  );

  const comp = await queryOne<CompetitionRow>(
    `SELECT id, name, description, "start_date" AS "startDate", "end_date" AS "endDate",
     location, "pilot_rating" AS "pilotRating", "rules_summary" AS "rulesSummary",
     "registration_url" AS "registrationUrl", status, "createdAt", "updatedAt"
     FROM competitions WHERE id = $1`,
    [id]
  );
  res.status(201).json(comp);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { name, description, startDate, endDate, location, pilotRating, rulesSummary, registrationUrl, status } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const result = await execute(
    `UPDATE competitions SET name = $1, description = $2, "start_date" = $3, "end_date" = $4,
     location = $5, "pilot_rating" = $6, "rules_summary" = $7, "registration_url" = $8, status = $9,
     "updatedAt" = NOW() WHERE id = $10`,
    [name.trim(), description || "", startDate || "", endDate || "", location || "", pilotRating || "", rulesSummary || "", registrationUrl || "", status || "upcoming", req.params.id]
  );

  if (result.rowCount === 0) return res.status(404).json({ error: "Competition not found" });

  const comp = await queryOne<CompetitionRow>(
    `SELECT id, name, description, "start_date" AS "startDate", "end_date" AS "endDate",
     location, "pilot_rating" AS "pilotRating", "rules_summary" AS "rulesSummary",
     "registration_url" AS "registrationUrl", status, "createdAt", "updatedAt"
     FROM competitions WHERE id = $1`,
    [req.params.id]
  );
  res.json(comp);
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await execute("DELETE FROM competitions WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Competition not found" });
  res.json({ success: true });
}));

export default router;
