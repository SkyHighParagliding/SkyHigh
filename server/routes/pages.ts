import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { query, queryOne, execute, transaction } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { invalidateSearchCaches } from "./search.js";
import { saveFile, deleteFile, readFile, fileExists, StorageKey } from "../storage.js";

const router = Router();

const attachmentsDir = path.join(process.cwd(), "uploads", "attachments");
if (!fs.existsSync(attachmentsDir)) {
  fs.mkdirSync(attachmentsDir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

interface PageRow {
  slug: string;
  title: string;
  content: string;
  heroImage: string | null;
  lastUpdated: string;
}

interface PageAttachmentRow {
  id: string;
  pageSlug: string;
  filename: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  downloadCount: number;
  uploadedAt: string;
}

router.get("/", asyncHandler(async (req, res) => {
  const pages = await query<PageRow>(`SELECT slug, title, "lastUpdated" FROM pages`);
  res.json(pages);
}));

router.get("/:slug", asyncHandler(async (req, res) => {
  const page = await queryOne<PageRow>(`SELECT * FROM pages WHERE slug = $1`, [req.params.slug]);
  if (!page) return res.status(404).json({ error: "Page not found" });
  res.json(page);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { slug, title, content, heroImage } = req.body;
  await execute(
    `INSERT INTO pages (slug, title, content, "heroImage", "lastUpdated") VALUES ($1, $2, $3, $4, NOW())`,
    [slug, title, content, heroImage || null]
  );
  invalidateSearchCaches();
  res.status(201).json({ success: true });
}));

router.put("/:slug", requireAuth, asyncHandler(async (req, res) => {
  const { title, content, heroImage } = req.body;
  const result = await execute(
    `UPDATE pages SET title = $1, content = $2, "heroImage" = $3, "lastUpdated" = NOW() WHERE slug = $4`,
    [title, content, heroImage || null, req.params.slug]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "Page not found" });
  invalidateSearchCaches();
  res.json({ success: true });
}));

router.delete("/:slug", requireAuth, asyncHandler(async (req, res) => {
  const attachments = await query<PageAttachmentRow>(`SELECT * FROM page_attachments WHERE "pageSlug" = $1`, [req.params.slug]);
  let deleted = false;
  await transaction(async (client) => {
    const result = await client.query(`DELETE FROM pages WHERE slug = $1`, [req.params.slug]);
    if (result.rowCount === 0) return;
    await client.query(`DELETE FROM page_attachments WHERE "pageSlug" = $1`, [req.params.slug]);
    deleted = true;
  });
  if (!deleted) return res.status(404).json({ error: "Page not found" });
  // Delete backing files via storage helper — handles both local and R2 paths.
  for (const att of attachments) {
    await deleteFile(att.filename);
  }
  invalidateSearchCaches();
  res.json({ success: true });
}));

router.get("/:slug/attachments", asyncHandler(async (req, res) => {
  const attachments = await query<PageAttachmentRow>(
    `SELECT id, "pageSlug", "originalFilename", "fileSize", "mimeType", "downloadCount", "uploadedAt" FROM page_attachments WHERE "pageSlug" = $1`,
    [req.params.slug]
  );
  res.json(attachments);
}));

router.post("/:slug/attachments", requireAuth, upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const page = await queryOne<{ slug: string }>(`SELECT slug FROM pages WHERE slug = $1`, [req.params.slug]);
  if (!page) return res.status(404).json({ error: "Page not found" });

  const id = `att-${crypto.randomBytes(8).toString("hex")}`;
  const ext = path.extname(req.file.originalname) || "";
  const filename = `${id}${ext}`;

  const storedUrl = await saveFile(req.file.buffer, StorageKey.attachment(filename), req.file.mimetype);

  await execute(
    `INSERT INTO page_attachments (id, "pageSlug", filename, "originalFilename", "fileSize", "mimeType") VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, req.params.slug, storedUrl, req.file.originalname, req.file.size, req.file.mimetype]
  );

  res.status(201).json({
    id,
    pageSlug: req.params.slug,
    originalFilename: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    downloadCount: 0,
  });
}));

router.get("/:slug/attachments/:id/download", asyncHandler(async (req, res) => {
  const attachment = await queryOne<PageAttachmentRow>(
    `SELECT * FROM page_attachments WHERE id = $1 AND "pageSlug" = $2`,
    [req.params.id, req.params.slug]
  );
  if (!attachment) return res.status(404).json({ error: "Attachment not found" });

  await execute(
    `UPDATE page_attachments SET "downloadCount" = "downloadCount" + 1 WHERE id = $1`,
    [req.params.id]
  );

  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(attachment.originalFilename)}"`);
  res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");

  const storedRef = attachment.filename;
  if (storedRef.startsWith("http://") || storedRef.startsWith("https://")) {
    return res.redirect(storedRef);
  }

  const localPath = storedRef.startsWith("/")
    ? path.join(process.cwd(), storedRef.slice(1))
    : path.join(attachmentsDir, storedRef);
  if (!fs.existsSync(localPath)) return res.status(404).json({ error: "File not found" });
  res.sendFile(localPath);
}));

router.delete("/:slug/attachments/:id", requireAuth, asyncHandler(async (req, res) => {
  const attachment = await queryOne<PageAttachmentRow>(
    `SELECT * FROM page_attachments WHERE id = $1 AND "pageSlug" = $2`,
    [req.params.id, req.params.slug]
  );
  if (!attachment) return res.status(404).json({ error: "Attachment not found" });

  await deleteFile(attachment.filename);
  await execute(`DELETE FROM page_attachments WHERE id = $1`, [req.params.id]);
  res.json({ success: true });
}));

export default router;
