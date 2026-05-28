import { Router } from "express";
import { query, queryOne, execute } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import createLogger from "../utils/logger.js";

const log = createLogger("business-directory");

const router = Router();

interface ListingRow {
  id: string;
  businessName: string;
  memberName: string;
  category: string;
  description: string;
  phone: string;
  email: string;
  websiteUrl: string;
  imagePath: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface SettingRow {
  value: string;
}

interface CategoryRow {
  category: string;
}

function generateId() {
  return `biz-${Math.random().toString(36).substr(2, 9)}`;
}

async function isDirectoryEnabled(): Promise<boolean> {
  const row = await queryOne<SettingRow>(
    "SELECT value FROM settings WHERE key = $1",
    ["businessDirectoryEnabled"]
  );
  return row?.value === "true";
}

async function isAuthenticated(req: any): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.split(" ")[1];
  if (!token) return false;

  const session = await queryOne<{ userId: string; createdAt: string }>(
    `SELECT admin_sessions."userId", admin_sessions."createdAt"
     FROM admin_sessions
     JOIN contacts ON admin_sessions."userId" = contacts.id
     WHERE admin_sessions.token = $1 AND contacts."isAdmin" = 1`,
    [token]
  );
  if (!session) return false;

  // Use the same configurable TTL as the auth middleware
  const ttlRow = await queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = $1",
    ["cacheAdminSessionTtl"]
  );
  const ttlMs = parseInt(ttlRow?.value || "24", 10) * 60 * 60 * 1000;
  const sessionAge = Date.now() - new Date(session.createdAt).getTime();
  if (sessionAge > ttlMs) {
    // Delete the expired session so it doesn't accumulate; fire-and-forget is fine here
    execute(`DELETE FROM admin_sessions WHERE token = $1`, [token]).catch((e) =>
      log.error(`Failed to delete expired session in businessDirectory: ${e.message}`)
    );
    return false;
  }

  return true;
}

router.get("/", asyncHandler(async (req, res) => {
  if (!await isDirectoryEnabled() && !await isAuthenticated(req)) {
    return res.json([]);
  }
  const listings = await query<ListingRow>(
    `SELECT id, business_name AS "businessName", member_name AS "memberName", category, description,
     phone, email, website_url AS "websiteUrl", image_path AS "imagePath",
     sort_order AS "sortOrder", "createdAt", "updatedAt"
     FROM business_directory ORDER BY "sortOrder" ASC, business_name ASC`
  );
  res.json(listings);
}));

router.get("/categories", asyncHandler(async (req, res) => {
  if (!await isDirectoryEnabled() && !await isAuthenticated(req)) {
    return res.json([]);
  }
  const rows = await query<CategoryRow>(
    "SELECT DISTINCT category FROM business_directory WHERE category != '' ORDER BY category ASC"
  );
  const categories = rows.map(r => r.category);
  res.json(categories);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const listing = await queryOne<ListingRow>(
    `SELECT id, business_name AS "businessName", member_name AS "memberName", category, description,
     phone, email, website_url AS "websiteUrl", image_path AS "imagePath",
     sort_order AS "sortOrder", "createdAt", "updatedAt"
     FROM business_directory WHERE id = $1`,
    [req.params.id]
  );
  if (!listing) return res.status(404).json({ error: "Listing not found" });
  res.json(listing);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { businessName, memberName, category, description, phone, email, websiteUrl, imagePath, sortOrder } = req.body;
  if (!businessName || !businessName.trim()) return res.status(400).json({ error: "Business name is required" });

  const id = generateId();
  const maxOrderRow = await queryOne<{ maxOrder: number | null }>(
    "SELECT MAX(sort_order) as \"maxOrder\" FROM business_directory"
  );
  const order = sortOrder !== undefined ? sortOrder : ((maxOrderRow?.maxOrder ?? -1) + 1);

  await execute(
    `INSERT INTO business_directory (id, business_name, member_name, category, description, phone, email, website_url, image_path, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, businessName.trim(), memberName || "", category || "Other", description || "", phone || "", email || "", websiteUrl || "", imagePath || "", order]
  );

  const listing = await queryOne<ListingRow>(
    `SELECT id, business_name AS "businessName", member_name AS "memberName", category, description,
     phone, email, website_url AS "websiteUrl", image_path AS "imagePath",
     sort_order AS "sortOrder", "createdAt", "updatedAt"
     FROM business_directory WHERE id = $1`,
    [id]
  );
  res.status(201).json(listing);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { businessName, memberName, category, description, phone, email, websiteUrl, imagePath, sortOrder } = req.body;
  if (!businessName || !businessName.trim()) return res.status(400).json({ error: "Business name is required" });

  const params: (string | number)[] = [
    businessName.trim(), memberName || "", category || "Other", description || "",
    phone || "", email || "", websiteUrl || "", imagePath || "",
  ];

  let sortClause = "";
  if (sortOrder !== undefined) {
    sortClause = ", sort_order = $9";
    params.push(sortOrder);
  }

  params.push(req.params.id);

  const paramCount = params.length;
  const idParam = `$${paramCount}`;

  const result = await execute(
    `UPDATE business_directory SET business_name = $1, member_name = $2, category = $3, description = $4,
     phone = $5, email = $6, website_url = $7, image_path = $8${sortClause},
     "updatedAt" = NOW() WHERE id = ${idParam}`,
    params
  );

  if (result.rowCount === 0) return res.status(404).json({ error: "Listing not found" });

  const listing = await queryOne<ListingRow>(
    `SELECT id, business_name AS "businessName", member_name AS "memberName", category, description,
     phone, email, website_url AS "websiteUrl", image_path AS "imagePath",
     sort_order AS "sortOrder", "createdAt", "updatedAt"
     FROM business_directory WHERE id = $1`,
    [req.params.id]
  );
  res.json(listing);
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await execute("DELETE FROM business_directory WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Listing not found" });
  res.json({ success: true });
}));

export default router;
