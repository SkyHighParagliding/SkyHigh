import { Router } from "express";
import { query, execute } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { invalidateSearchCaches } from "./search.js";
import { filterByCurrentMembers } from "../utils/tidyhqMemberFilter.js";

const router = Router();

interface OfficerRow {
  id: string;
  name: string;
  surname: string;
  phone: string;
  email: string;
  position: string | null;
  safetyOfficerType: string | null;
  showTelegram: number;
  showPhone: number;
  showEmail: number;
  showAdminEmail: number;
  photoUrl: string | null;
  photoAuthorised: number;
  fullNameDisplay: number;
}

router.get("/", asyncHandler(async (_req, res) => {
  const officers = await query<OfficerRow>(
    `SELECT id, name, surname, phone, email, position,
            "safetyOfficerType", "showTelegram", "showPhone", "showEmail",
            "showAdminEmail", "photoUrl", "photoAuthorised", "fullNameDisplay"
       FROM contacts
      WHERE "isSafetyCommittee" = 1 AND "displaySafety" = 1
      ORDER BY CASE "safetyOfficerType" WHEN 'SSO' THEN 0 WHEN 'SO' THEN 1 ELSE 2 END,
               name ASC`
  );
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
  await execute(
    `INSERT INTO contacts (id, name, phone, email, "isSafetyCommittee")
     VALUES ($1, $2, $3, $4, 1)`,
    [id, name, phone || "", email || ""]
  );
  invalidateSearchCaches();
  res.status(201).json({ success: true, id });
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { name, phone, email } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });
  const result = await execute(
    `UPDATE contacts
        SET name = $1, phone = $2, email = $3, "isSafetyCommittee" = 1
      WHERE id = $4`,
    [name, phone || "", email || "", req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "Safety Committee member not found" });
  invalidateSearchCaches();
  res.json({ success: true });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await execute(
    `UPDATE contacts SET "isSafetyCommittee" = 0 WHERE id = $1`,
    [req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "Safety Committee member not found" });
  invalidateSearchCaches();
  res.json({ success: true });
}));

export default router;
