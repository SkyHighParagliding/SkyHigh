import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();
const SALT_ROUNDS = 10;

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const pilots = await db.prepare(
    "SELECT id, email, firstName, lastName, name, createdAt FROM pilots ORDER BY firstName ASC, lastName ASC"
  ).all();
  res.json(pilots);
}));

router.get("/search", requireAuth, asyncHandler(async (req, res) => {
  const q = req.query.q as string;
  if (!q) return res.json([]);
  const term = `%${q}%`;
  const pilots = await db.prepare(
    "SELECT id, email, firstName, lastName, name, createdAt FROM pilots WHERE firstName LIKE ? OR lastName LIKE ? OR email LIKE ? OR name LIKE ? ORDER BY firstName ASC"
  ).all(term, term, term, term);
  res.json(pilots);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });
  if (!password || password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.prepare("SELECT id FROM pilots WHERE email = ?").get(normalizedEmail);
  if (existing) return res.status(409).json({ error: "A pilot with this email already exists" });

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const fName = (firstName || "").trim();
  const lName = (lastName || "").trim();
  const fullName = [fName, lName].filter(Boolean).join(" ");

  await db.prepare(
    "INSERT INTO pilots (id, email, passwordHash, name, firstName, lastName) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, normalizedEmail, passwordHash, fullName, fName, lName);

  const pilot = await db.prepare("SELECT id, email, firstName, lastName, name, createdAt FROM pilots WHERE id = ?").get(id);
  res.status(201).json(pilot);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.prepare("SELECT id FROM pilots WHERE email = ? AND id != ?").get(normalizedEmail, req.params.id) as any;
  if (existing) return res.status(409).json({ error: "Another pilot with this email already exists" });

  const fName = (firstName || "").trim();
  const lName = (lastName || "").trim();
  const fullName = [fName, lName].filter(Boolean).join(" ");

  let passwordUpdate = "";
  const params: any[] = [fName, lName, fullName, normalizedEmail];

  if (password) {
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    passwordUpdate = ", passwordHash = ?";
    params.push(hashed);
  }

  params.push(req.params.id);

  const result = await db.prepare(
    `UPDATE pilots SET firstName = ?, lastName = ?, name = ?, email = ?${passwordUpdate} WHERE id = ?`
  ).run(...params);

  if (result.changes === 0) return res.status(404).json({ error: "Pilot not found" });

  const pilot = await db.prepare("SELECT id, email, firstName, lastName, name, createdAt FROM pilots WHERE id = ?").get(req.params.id);
  res.json(pilot);
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  await db.prepare("DELETE FROM password_reset_tokens WHERE contactId = ? AND accountType = 'pilot'").run(req.params.id);
  await db.prepare("DELETE FROM pilot_sessions WHERE pilotId = ?").run(req.params.id);
  await db.prepare("DELETE FROM breadcrumbs WHERE flightId IN (SELECT id FROM flights WHERE pilotId = ?)").run(req.params.id);
  await db.prepare("DELETE FROM flights WHERE pilotId = ?").run(req.params.id);

  const result = await db.prepare("DELETE FROM pilots WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Pilot not found" });
  res.json({ success: true });
}));

export default router;
