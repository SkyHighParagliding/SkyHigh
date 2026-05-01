import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import db from "../db.js";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import asyncHandler from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import createLogger from "../utils/logger.js";

const log = createLogger("submissions");
const router = Router();

const submissionsDir = path.join(process.cwd(), "uploads", "submissions");
if (!fs.existsSync(submissionsDir)) {
  fs.mkdirSync(submissionsDir, { recursive: true });
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_FILE_SIZE = 15 * 1024 * 1024;

const MAGIC_BYTES: Record<string, { bytes: number[]; offset?: number }[]> = {
  "image/jpeg": [{ bytes: [0xFF, 0xD8, 0xFF] }],
  "image/png": [{ bytes: [0x89, 0x50, 0x4E, 0x47] }],
  "image/webp": [{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }],
  "image/heic": [{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }],
  "image/heif": [{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }],
};

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

function detectImageType(buffer: Buffer): string | null {
  for (const [mime, signatures] of Object.entries(MAGIC_BYTES)) {
    for (const sig of signatures) {
      const offset = sig.offset || 0;
      if (buffer.length < offset + sig.bytes.length) continue;
      const match = sig.bytes.every((b, i) => buffer[offset + i] === b);
      if (match) return mime;
    }
  }
  return null;
}

const MAX_IMAGE_BYTES = 1024 * 1024;

async function compressImage(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer; ext: string }> {
  const metadata = await sharp(buffer).metadata();
  const maxDim = 3840;
  const needsResize = (metadata.width && metadata.width > maxDim) || (metadata.height && metadata.height > maxDim);

  if (buffer.length <= MAX_IMAGE_BYTES && !needsResize) {
    const ext = MIME_TO_EXT[mimeType] || ".jpg";
    return { buffer, ext };
  }

  let pipeline = sharp(buffer);
  if (needsResize) {
    pipeline = pipeline.resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true });
  }

  let quality = 85;
  let result = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();

  while (result.length > MAX_IMAGE_BYTES && quality > 30) {
    quality -= 10;
    result = await sharp(buffer)
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  return { buffer: result, ext: '.jpg' };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed. Accepted: JPEG, PNG, WebP, HEIC.`));
    }
  },
});

async function checkContentSafety(imageBuffer: Buffer, mimeType: string): Promise<{ safe: boolean; flag?: string; note?: string }> {
  const apiKey = process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    log.warn("No Gemini API key configured — quarantining for manual review");
    return { safe: false, flag: "review", note: "No API key — held for manual review" };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const base64 = imageBuffer.toString("base64");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: base64 } },
            {
              text: `You are a content moderation assistant. Analyse this image and determine if it is safe for a public community website for a paragliding/hang gliding club. 

Flag the image as UNSAFE if it contains:
- Nudity or sexually explicit content
- Extreme violence or gore
- Hate symbols or offensive imagery
- Drug use imagery
- Any content inappropriate for a family-friendly community site

Respond with ONLY valid JSON:
{ "safe": true } or { "safe": false, "reason": "brief explanation" }`,
            },
          ],
        },
      ],
    });

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.safe === false) {
        return { safe: false, flag: "nsfw", note: parsed.reason || "Flagged by content safety check" };
      }
    }
    return { safe: true };
  } catch (e: any) {
    log.error(`Content safety check failed: ${e.message}`);
    return { safe: false, flag: "review", note: "Safety check unavailable — held for manual review" };
  }
}

router.post("/", upload.array("images", 10), asyncHandler(async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No images uploaded" });
  }

  const submitterIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";

  const banned = await db.prepare("SELECT id FROM banned_ips WHERE ip = ?").get(submitterIp);
  if (banned) {
    log.warn(`Blocked submission from banned IP: ${submitterIp}`);
    return res.status(403).json({ error: "Submissions are not available from this network." });
  }

  const photographerCredit = (req.body.photographerCredit as string || "").trim();

  const results: { id: string; filename: string; status: string }[] = [];

  for (const file of files) {
    const detectedType = detectImageType(file.buffer);
    if (!detectedType || !ALLOWED_TYPES.includes(detectedType)) {
      log.warn(`Rejected upload "${file.originalname}": magic bytes don't match an allowed image type`);
      results.push({ id: "", filename: file.originalname, status: "rejected" });
      continue;
    }

    const id = `sub-${crypto.randomBytes(8).toString("hex")}`;

    const safety = await checkContentSafety(file.buffer, detectedType);

    const compressed = await compressImage(file.buffer, detectedType);
    const storedFilename = `${id}${compressed.ext}`;
    const storedMimeType = compressed.ext === '.jpg' ? 'image/jpeg' : detectedType;
    const filePath = path.join(submissionsDir, storedFilename);

    if (!safety.safe) {
      const quarantineDir = path.join(submissionsDir, "quarantine");
      if (!fs.existsSync(quarantineDir)) {
        fs.mkdirSync(quarantineDir, { recursive: true });
      }
      const quarantinePath = path.join(quarantineDir, storedFilename);
      fs.writeFileSync(quarantinePath, compressed.buffer);

      await db.prepare(
        `INSERT INTO image_submissions (id, "originalFilename", "storedFilename", "filePath", "fileSize", "mimeType", status, "moderationFlag", "moderationNote", "submitterIp", "photographerCredit")
         VALUES (?, ?, ?, ?, ?, ?, 'quarantined', ?, ?, ?, ?)`
      ).run(id, file.originalname, storedFilename, `uploads/submissions/quarantine/${storedFilename}`, compressed.buffer.length, storedMimeType, safety.flag || "nsfw", safety.note || "", submitterIp, photographerCredit || null);

      log.warn(`Submission ${id} quarantined: ${safety.note}`);
      results.push({ id, filename: file.originalname, status: "quarantined" });
      continue;
    }

    fs.writeFileSync(filePath, compressed.buffer);

    const savedSize = compressed.buffer.length;
    const originalSize = file.buffer.length;
    await db.prepare(
      `INSERT INTO image_submissions (id, "originalFilename", "storedFilename", "filePath", "fileSize", "mimeType", status, "moderationNote", "submitterIp", "photographerCredit")
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    ).run(id, file.originalname, storedFilename, `uploads/submissions/${storedFilename}`, savedSize, storedMimeType, safety.note || null, submitterIp, photographerCredit || null);

    log.info(`Submission ${id} stored: ${file.originalname} (${(originalSize / 1024).toFixed(0)}KB → ${(savedSize / 1024).toFixed(0)}KB)`);
    results.push({ id, filename: file.originalname, status: "pending" });
  }

  res.json({ success: true, count: results.length, submissions: results });
}));

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const status = (req.query.status as string) || "pending";
  const submissions = await db.prepare(
    "SELECT * FROM image_submissions WHERE status = ? ORDER BY submittedAt DESC"
  ).all(status);
  res.json(submissions);
}));

router.get("/all", requireAuth, asyncHandler(async (req, res) => {
  const submissions = await db.prepare(
    "SELECT * FROM image_submissions ORDER BY submittedAt DESC"
  ).all();
  res.json(submissions);
}));

function resolveSubmissionPath(filePath: string): string {
  const cleaned = filePath.replace(/^\/+/, "");
  return path.join(process.cwd(), cleaned);
}

router.get("/banned-ips", requireAuth, asyncHandler(async (_req, res) => {
  const ips = await db.prepare("SELECT * FROM banned_ips ORDER BY bannedAt DESC").all();
  res.json(ips);
}));

router.post("/banned-ips", requireAuth, asyncHandler(async (req, res) => {
  const { ip, reason } = req.body;
  if (!ip || typeof ip !== "string" || !ip.trim()) {
    return res.status(400).json({ error: "IP address is required" });
  }
  const trimmedIp = ip.trim();
  const existing = await db.prepare("SELECT id FROM banned_ips WHERE ip = ?").get(trimmedIp);
  if (existing) return res.status(409).json({ error: "IP already banned" });

  await db.prepare("INSERT INTO banned_ips (ip, reason) VALUES (?, ?)").run(trimmedIp, reason || null);
  log.info(`IP banned: ${trimmedIp} — ${reason || "No reason"}`);
  res.json({ success: true });
}));

router.delete("/banned-ips/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await db.prepare("DELETE FROM banned_ips WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Banned IP not found" });
  res.json({ success: true });
}));

router.delete("/:id", requireAuth, asyncHandler(async (req, res) => {
  const submission = await db.prepare("SELECT * FROM image_submissions WHERE id = ?").get(req.params.id) as any;
  if (!submission) return res.status(404).json({ error: "Submission not found" });

  const fullPath = resolveSubmissionPath(submission.filePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }

  await db.prepare("UPDATE image_submissions SET status = 'rejected', reviewedAt = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ success: true });
}));

router.get("/:id/image", requireAuth, asyncHandler(async (req, res) => {
  const submission = await db.prepare("SELECT * FROM image_submissions WHERE id = ?").get(req.params.id) as any;
  if (!submission) return res.status(404).json({ error: "Submission not found" });

  const fullPath = resolveSubmissionPath(submission.filePath);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: "Image file not found" });
  }

  res.sendFile(fullPath);
}));

router.post("/:id/process", requireAuth, asyncHandler(async (req, res) => {
  const submission = await db.prepare("SELECT * FROM image_submissions WHERE id = ?").get(req.params.id) as any;
  if (!submission) return res.status(404).json({ error: "Submission not found" });
  if (submission.status !== "pending" && submission.status !== "quarantined") return res.status(400).json({ error: `Cannot process submission with status '${submission.status}'` });

  const fullPath = resolveSubmissionPath(submission.filePath);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: "Image file not found" });
  }

  const imageBuffer = fs.readFileSync(fullPath);
  const base64 = imageBuffer.toString("base64");

  res.json({
    success: true,
    imageData: base64,
    mimeType: submission.mimeType,
    originalFilename: submission.originalFilename,
    submissionId: submission.id,
    photographerCredit: submission.photographerCredit || "",
  });
}));

router.post("/:id/approve", requireAuth, asyncHandler(async (req, res) => {
  const submission = await db.prepare("SELECT * FROM image_submissions WHERE id = ?").get(req.params.id) as any;
  if (!submission) return res.status(404).json({ error: "Submission not found" });

  const result = await db.prepare("UPDATE image_submissions SET status = 'approved', reviewedAt = datetime('now') WHERE id = ?").run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: "Submission not found" });
  res.json({ success: true });
}));

router.post("/:id/ban-ip", requireAuth, asyncHandler(async (req, res) => {
  const submission = await db.prepare("SELECT * FROM image_submissions WHERE id = ?").get(req.params.id) as any;
  if (!submission) return res.status(404).json({ error: "Submission not found" });
  if (!submission.submitterIp || submission.submitterIp === "unknown") {
    return res.status(400).json({ error: "No IP address recorded for this submission" });
  }

  const existing = await db.prepare("SELECT id FROM banned_ips WHERE ip = ?").get(submission.submitterIp);
  if (!existing) {
    await db.prepare("INSERT INTO banned_ips (ip, reason) VALUES (?, ?)").run(
      submission.submitterIp,
      `Banned from submission ${submission.id}`
    );
  }

  const fullPath = resolveSubmissionPath(submission.filePath);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  await db.prepare("UPDATE image_submissions SET status = 'rejected', reviewedAt = datetime('now') WHERE id = ?").run(req.params.id);

  log.info(`IP ${submission.submitterIp} banned from submission ${submission.id}`);
  res.json({ success: true, bannedIp: submission.submitterIp });
}));

export default router;
