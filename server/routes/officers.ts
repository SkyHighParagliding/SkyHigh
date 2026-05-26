import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { invalidateSearchCaches } from "./search.js";
import { filterByCurrentMembers } from "../utils/tidyhqMemberFilter.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const officers = await db.prepare(
    `SELECT id, name, surname, phone, email, fullNameDisplay, showTelegram, showPhone, showEmail, showAdminEmail, photoUrl, safetyOfficerType
     FROM contacts WHERE isSafetyCommittee = 1 AND displaySafety = 1
     ORDER BY name ASC`
  ).all() as { id: string; name: string; surname: string; phone: string; email: string; fullNameDisplay: number; showTelegram: number; showPhone: number; showEmail: number; showAdminEmail: number; photoUrl?: string; safetyOfficerType?: string }[];
  const filtered = await filterByCurrentMembers(officers);
  res.json(filtered.map(o => ({
    ...o,
    phone: o.showPhone ? o.phone : "",
    email: o.showEmail ? o.email : "",
  })));
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { name, phone, email } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });
  const id = `con-${Math.random().toString(36).substr(2, 9)}`;
  await db.prepare(
    "INSERT INTO contacts (id, name, phone, email, isSafetyCommittee) VALUES (?, ?, ?, ?, 1)"
  ).run(id, name, phone || "", email || "");
  invalidateSearchCaches();
  res.status(201).json({ success: true, id });
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { name, phone, email } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });
  const result = await db.prepare(
    "UPDATE contacts SET name = ?, phone = ?, email = ?, isSafetyCommittee = 1 WHERE id = ?"
  ).run(name, phone || "", email || "", req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Safety Committee member not found" });
  invalidateSearchCaches();
  res.json({ success: true });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await db.prepare("UPDATE contacts SET isSafetyCommittee = 0 WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Safety Committee member not found" });
  invalidateSearchCaches();
  res.json({ success: true });
}));

export default router;
