import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

function generateId() {
  return `biz-${Math.random().toString(36).substr(2, 9)}`;
}

async function isDirectoryEnabled(): Promise<boolean> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'businessDirectoryEnabled'").get() as { value: string } | undefined;
  return row?.value === "true";
}

async function isAuthenticated(req: any): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.split(" ")[1];
  if (!token) return false;
  const session = await db.prepare(
    "SELECT userId FROM admin_sessions WHERE token = ? AND createdAt > datetime('now', '-24 hours')"
  ).get(token);
  return !!session;
}

router.get("/", asyncHandler(async (req, res) => {
  if (!await isDirectoryEnabled() && !await isAuthenticated(req)) {
    return res.json([]);
  }
  const listings = await db.prepare(
    `SELECT id, business_name AS businessName, member_name AS memberName, category, description,
     phone, email, website_url AS websiteUrl, image_path AS imagePath,
     sort_order AS sortOrder, createdAt, updatedAt
     FROM business_directory ORDER BY sort_order ASC, business_name ASC`
  ).all();
  res.json(listings);
}));

router.get("/categories", asyncHandler(async (req, res) => {
  if (!await isDirectoryEnabled() && !await isAuthenticated(req)) {
    return res.json([]);
  }
  const rows = await db.prepare(
    "SELECT DISTINCT category FROM business_directory WHERE category != '' ORDER BY category ASC"
  ).all() as { category: string }[];
  const categories = rows.map(r => r.category);
  res.json(categories);
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const listing = await db.prepare(
    `SELECT id, business_name AS businessName, member_name AS memberName, category, description,
     phone, email, website_url AS websiteUrl, image_path AS imagePath,
     sort_order AS sortOrder, createdAt, updatedAt
     FROM business_directory WHERE id = ?`
  ).get(req.params.id);
  if (!listing) return res.status(404).json({ error: "Listing not found" });
  res.json(listing);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { businessName, memberName, category, description, phone, email, websiteUrl, imagePath, sortOrder } = req.body;
  if (!businessName || !businessName.trim()) return res.status(400).json({ error: "Business name is required" });

  const id = generateId();
  const maxOrder = await db.prepare("SELECT MAX(sort_order) as maxOrder FROM business_directory").get() as any;
  const order = sortOrder !== undefined ? sortOrder : ((maxOrder?.maxOrder ?? -1) + 1);

  await db.prepare(
    `INSERT INTO business_directory (id, business_name, member_name, category, description, phone, email, website_url, image_path, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, businessName.trim(), memberName || "", category || "Other", description || "", phone || "", email || "", websiteUrl || "", imagePath || "", order);

  const listing = await db.prepare(
    `SELECT id, business_name AS businessName, member_name AS memberName, category, description,
     phone, email, website_url AS websiteUrl, image_path AS imagePath,
     sort_order AS sortOrder, createdAt, updatedAt
     FROM business_directory WHERE id = ?`
  ).get(id);
  res.status(201).json(listing);
}));

router.put("/:id", requireAuth, asyncHandler(async (req, res) => {
  const { businessName, memberName, category, description, phone, email, websiteUrl, imagePath, sortOrder } = req.body;
  if (!businessName || !businessName.trim()) return res.status(400).json({ error: "Business name is required" });

  const params: any[] = [
    businessName.trim(), memberName || "", category || "Other", description || "",
    phone || "", email || "", websiteUrl || "", imagePath || "",
  ];

  let sortClause = "";
  if (sortOrder !== undefined) {
    sortClause = ", sort_order = ?";
    params.push(sortOrder);
  }

  params.push(req.params.id);

  const result = await db.prepare(
    `UPDATE business_directory SET business_name = ?, member_name = ?, category = ?, description = ?,
     phone = ?, email = ?, website_url = ?, image_path = ?${sortClause},
     updatedAt = datetime('now') WHERE id = ?`
  ).run(...params);

  if (result.changes === 0) return res.status(404).json({ error: "Listing not found" });

  const listing = await db.prepare(
    `SELECT id, business_name AS businessName, member_name AS memberName, category, description,
     phone, email, website_url AS websiteUrl, image_path AS imagePath,
     sort_order AS sortOrder, createdAt, updatedAt
     FROM business_directory WHERE id = ?`
  ).get(req.params.id);
  res.json(listing);
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await db.prepare("DELETE FROM business_directory WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Listing not found" });
  res.json({ success: true });
}));

export default router;
