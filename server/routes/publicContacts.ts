import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { query, queryOne, execute, transaction } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();
const SALT_ROUNDS = 10;

interface PilotRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  createdAt: string;
}

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const pilots = await query<PilotRow>(
    `SELECT id, email, "firstName", "lastName", name, "createdAt"
     FROM pilots
     ORDER BY "firstName" ASC, "lastName" ASC`
  );
  res.json(pilots);
}));

router.get("/search", requireAuth, asyncHandler(async (req, res) => {
  const q = req.query.q as string;
  if (!q) return res.json([]);
  const term = `%${q}%`;
  const pilots = await query<PilotRow>(
    `SELECT id, email, "firstName", "lastName", name, "createdAt"
     FROM pilots
     WHERE "firstName" ILIKE $1 OR "lastName" ILIKE $2 OR email ILIKE $3 OR name ILIKE $4
     ORDER BY "firstName" ASC`,
    [term, term, term, term]
  );
  res.json(pilots);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });
  if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await queryOne<{ id: string }>("SELECT id FROM pilots WHERE email = $1", [normalizedEmail]);
  if (existing) return res.status(409).json({ error: "A pilot with this email already exists" });

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const fName = (firstName || "").trim();
  const lName = (lastName || "").trim();
  const fullName = [fName, lName].filter(Boolean).join(" ");

  await execute(
    `INSERT INTO pilots (id, email, "passwordHash", name, "firstName", "lastName")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, normalizedEmail, passwordHash, fullName, fName, lName]
  );

  const pilot = await queryOne<PilotRow>(
    `SELECT id, email, "firstName", "lastName", name, "createdAt" FROM pilots WHERE id = $1`,
    [id]
  );
  res.status(201).json(pilot);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM pilots WHERE email = $1 AND id != $2",
    [normalizedEmail, req.params.id]
  );
  if (existing) return res.status(409).json({ error: "Another pilot with this email already exists" });

  const fName = (firstName || "").trim();
  const lName = (lastName || "").trim();
  const fullName = [fName, lName].filter(Boolean).join(" ");

  let passwordUpdate = "";
  const params: any[] = [fName, lName, fullName, normalizedEmail];

  if (password) {
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    passwordUpdate = ", \"passwordHash\" = $5";
    params.push(hashed);
  }

  params.push(req.params.id);

  const result = await execute(
    `UPDATE pilots SET "firstName" = $1, "lastName" = $2, name = $3, email = $4${passwordUpdate} WHERE id = $${params.length}`,
    params
  );

  if (result.rowCount === 0) return res.status(404).json({ error: "Pilot not found" });

  const pilot = await queryOne<PilotRow>(
    `SELECT id, email, "firstName", "lastName", name, "createdAt" FROM pilots WHERE id = $1`,
    [req.params.id]
  );
  res.json(pilot);
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const pilotId = req.params.id;
  const pilot = await queryOne<{ id: string }>("SELECT id FROM pilots WHERE id = $1", [pilotId]);
  if (!pilot) return res.status(404).json({ error: "Pilot not found" });

  await transaction(async (client) => {
    await client.query("DELETE FROM password_reset_tokens WHERE \"contactId\" = $1 AND \"accountType\" = 'pilot'", [pilotId]);
    await client.query("DELETE FROM pilot_sessions WHERE \"pilotId\" = $1", [pilotId]);
    await client.query("DELETE FROM breadcrumbs WHERE \"flightId\" IN (SELECT id FROM flights WHERE \"pilotId\" = $1)", [pilotId]);
    await client.query("DELETE FROM flights WHERE \"pilotId\" = $1", [pilotId]);
    await client.query("DELETE FROM pilots WHERE id = $1", [pilotId]);
  });

  res.json({ success: true });
}));

export default router;
