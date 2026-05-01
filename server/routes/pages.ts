import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import db from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { invalidateSearchCaches } from "./search.js";
import { saveFile, deleteFile, readFile, fileExists } from "../storage.js";

const router = Router();

const attachmentsDir = path.join(process.cwd(), "uploads", "attachments");
if (!fs.existsSync(attachmentsDir)) {
  fs.mkdirSync(attachmentsDir, { recursive: true });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.get("/", asyncHandler(async (req, res) => {
  const pages = await db.prepare("SELECT slug, title, lastUpdated FROM pages").all();
  res.json(pages);
}));

router.get("/:slug", asyncHandler(async (req, res) => {
  const page = await db.prepare("SELECT * FROM pages WHERE slug = ?").get(req.params.slug);
  if (!page) return res.status(404).json({ error: "Page not found" });
  res.json(page);
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { slug, title, content, heroImage } = req.body;
  await db.prepare("INSERT INTO pages (slug, title, content, heroImage, lastUpdated) VALUES (@slug, @title, @content, @heroImage, CURRENT_TIMESTAMP)").run({ slug, title, content, heroImage: heroImage || null });
  invalidateSearchCaches();
  res.status(201).json({ success: true });
}));

router.put("/:slug", requireAuth, asyncHandler(async (req, res) => {
  const { title, content, heroImage } = req.body;
  await db.prepare("UPDATE pages SET title = @title, content = @content, heroImage = @heroImage, lastUpdated = CURRENT_TIMESTAMP WHERE slug = @slug").run({ slug: req.params.slug, title, content, heroImage: heroImage || null });
  invalidateSearchCaches();
  res.json({ success: true });
}));

router.delete("/:slug", requireAuth, asyncHandler(async (req, res) => {
  const result = await db.prepare("DELETE FROM pages WHERE slug = ?").run(req.params.slug);
  if (result.changes === 0) return res.status(404).json({ error: "Page not found" });
  const attachments = await db.prepare("SELECT * FROM page_attachments WHERE pageSlug = ?").all(req.params.slug) as any[];
  for (const att of attachments) {
    const filePath = path.join(attachmentsDir, att.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  await db.prepare("DELETE FROM page_attachments WHERE pageSlug = ?").run(req.params.slug);
  invalidateSearchCaches();
  res.json({ success: true });
}));

router.get("/:slug/attachments", asyncHandler(async (req, res) => {
  const attachments = await db.prepare("SELECT id, pageSlug, originalFilename, fileSize, mimeType, downloadCount, uploadedAt FROM page_attachments WHERE pageSlug = ?").all(req.params.slug);
  res.json(attachments);
}));

router.post("/:slug/attachments", requireAuth, upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const page = await db.prepare("SELECT slug FROM pages WHERE slug = ?").get(req.params.slug);
  if (!page) return res.status(404).json({ error: "Page not found" });

  const id = `att-${crypto.randomBytes(8).toString("hex")}`;
  const ext = path.extname(req.file.originalname) || "";
  const filename = `${id}${ext}`;

  const storedUrl = await saveFile(req.file.buffer, `attachments/${filename}`, req.file.mimetype);

  await db.prepare(
    "INSERT INTO page_attachments (id, pageSlug, filename, originalFilename, fileSize, mimeType) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, req.params.slug, storedUrl, req.file.originalname, req.file.size, req.file.mimetype);

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
  const attachment = await db.prepare("SELECT * FROM page_attachments WHERE id = ? AND pageSlug = ?").get(req.params.id, req.params.slug) as any;
  if (!attachment) return res.status(404).json({ error: "Attachment not found" });

  await db.prepare("UPDATE page_attachments SET downloadCount = downloadCount + 1 WHERE id = ?").run(req.params.id);

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
  const attachment = await db.prepare("SELECT * FROM page_attachments WHERE id = ? AND pageSlug = ?").get(req.params.id, req.params.slug) as any;
  if (!attachment) return res.status(404).json({ error: "Attachment not found" });

  await deleteFile(attachment.filename);
  await db.prepare("DELETE FROM page_attachments WHERE id = ?").run(req.params.id);
  res.json({ success: true });
}));

export default router;
