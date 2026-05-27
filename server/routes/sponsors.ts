import { Router } from "express";
import { query, queryOne, execute } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

interface SponsorRow {
  id: string;
  name: string;
  logo: string;
  url: string;
  markdown: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

function generateId() {
  return `spo-${Math.random().toString(36).substr(2, 9)}`;
}

router.get("/", asyncHandler(async (req, res) => {
  const sponsors = await query<SponsorRow>(
    `SELECT id, name, logo, url, markdown, "sort_order" AS "sortOrder",
            "createdAt", "updatedAt"
       FROM sponsors
      ORDER BY "sort_order" ASC, name ASC`
  );
  res.json(sponsors);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const sponsor = await queryOne<SponsorRow>(
    `SELECT id, name, logo, url, markdown, "sort_order" AS "sortOrder",
            "createdAt", "updatedAt"
       FROM sponsors
      WHERE id = $1`,
    [req.params.id]
  );
  if (!sponsor) return res.status(404).json({ error: "Sponsor not found" });
  res.json(sponsor);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { name, logo, url, markdown, sortOrder } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const id = generateId();
  const maxOrder = await queryOne<{ maxOrder: number | null }>(
    `SELECT MAX("sort_order") as "maxOrder" FROM sponsors`
  );
  const order = sortOrder !== undefined ? sortOrder : ((maxOrder?.maxOrder ?? -1) + 1);

  await execute(
    `INSERT INTO sponsors (id, name, logo, url, markdown, "sort_order")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, name.trim(), logo || "", url || "", markdown || "", order]
  );

  const sponsor = await queryOne<SponsorRow>(
    `SELECT id, name, logo, url, markdown, "sort_order" AS "sortOrder",
            "createdAt", "updatedAt"
       FROM sponsors
      WHERE id = $1`,
    [id]
  );
  res.status(201).json(sponsor);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { name, logo, url, markdown, sortOrder } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });

  const params: any[] = [
    name.trim(), logo || "", url || "", markdown || "",
  ];

  let sortClause = "";
  let paramIndex = 5;
  if (sortOrder !== undefined) {
    sortClause = `, "sort_order" = $${paramIndex}`;
    params.push(sortOrder);
    paramIndex++;
  }

  params.push(req.params.id);

  const result = await execute(
    `UPDATE sponsors
        SET name = $1, logo = $2, url = $3, markdown = $4${sortClause},
            "updatedAt" = NOW()
      WHERE id = $${paramIndex}`,
    params
  );

  if (result.rowCount === 0) return res.status(404).json({ error: "Sponsor not found" });

  const sponsor = await queryOne<SponsorRow>(
    `SELECT id, name, logo, url, markdown, "sort_order" AS "sortOrder",
            "createdAt", "updatedAt"
       FROM sponsors
      WHERE id = $1`,
    [req.params.id]
  );
  res.json(sponsor);
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await execute(
    `DELETE FROM sponsors WHERE id = $1`,
    [req.params.id]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "Sponsor not found" });
  res.json({ success: true });
}));

export default router;
