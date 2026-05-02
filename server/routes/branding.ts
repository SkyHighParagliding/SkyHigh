import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import db from "../db.js";
import createLogger from "../utils/logger.js";
import { requireAuth } from "../middleware/auth.js";
import { saveFile, deleteFile, StorageKey } from "../storage.js";

const log = createLogger("branding");
const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const BRANDING_DIR = path.join(process.cwd(), "uploads", "branding");

function ensureBrandingDir() {
  if (!fs.existsSync(BRANDING_DIR)) {
    fs.mkdirSync(BRANDING_DIR, { recursive: true });
  }
}

interface LogoVariant {
  key: string;
  height: number;
  width?: number;
  crop?: boolean;
}

const VARIANTS: LogoVariant[] = [
  { key: "clubLogoFavicon", height: 128, width: 128, crop: true },
  { key: "clubLogoNav", height: 256 },
  { key: "clubLogoFooter", height: 256 },
  { key: "clubLogoSplash", height: 512 },
];

router.post("/logo", requireAuth, upload.single("logo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    ensureBrandingDir();
    const timestamp = Date.now();
    const results: Record<string, string> = {};

    const originalBuffer = await sharp(req.file.buffer).png().toBuffer();
    results.clubLogoOriginal = await saveFile(originalBuffer, StorageKey.branding(`logo-original-${timestamp}.png`), "image/png");

    for (const variant of VARIANTS) {
      const filename = `logo-${variant.key.replace("clubLogo", "").toLowerCase()}-${timestamp}.png`;

      let pipeline = sharp(req.file.buffer, { density: 300 });

      if (variant.crop && variant.width) {
        pipeline = pipeline.resize(variant.width, variant.height, {
          fit: "cover",
          position: "centre",
          kernel: sharp.kernel.lanczos3,
        });
      } else {
        pipeline = pipeline.resize(null, variant.height, {
          fit: "inside",
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3,
        });
      }

      const buffer = await pipeline
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
      results[variant.key] = await saveFile(buffer, StorageKey.branding(filename), "image/png");
    }

    const upsert = await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    const tx = await db.transaction(async () => {
      for (const [key, value] of Object.entries(results)) {
        await upsert.run(key, value);
      }
    });
    await tx();

    log.info(`Logo uploaded and resized: ${Object.keys(results).length} variants`);
    res.json({ success: true, paths: results });
  } catch (err: any) {
    log.error("Logo upload failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/logo-dark", requireAuth, upload.single("logo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    ensureBrandingDir();
    const timestamp = Date.now();
    const results: Record<string, string> = {};

    const originalBuffer = await sharp(req.file.buffer).png().toBuffer();
    results.clubLogoDarkOriginal = await saveFile(originalBuffer, StorageKey.branding(`logo-dark-original-${timestamp}.png`), "image/png");

    const darkVariants: LogoVariant[] = [
      { key: "clubLogoDarkFavicon", height: 128, width: 128, crop: true },
      { key: "clubLogoDarkNav", height: 256 },
      { key: "clubLogoDarkFooter", height: 256 },
      { key: "clubLogoDarkSplash", height: 512 },
    ];

    for (const variant of darkVariants) {
      const filename = `logo-dark-${variant.key.replace("clubLogoDark", "").toLowerCase()}-${timestamp}.png`;

      let pipeline = sharp(req.file.buffer, { density: 300 });

      if (variant.crop && variant.width) {
        pipeline = pipeline.resize(variant.width, variant.height, {
          fit: "cover",
          position: "centre",
          kernel: sharp.kernel.lanczos3,
        });
      } else {
        pipeline = pipeline.resize(null, variant.height, {
          fit: "inside",
          withoutEnlargement: false,
          kernel: sharp.kernel.lanczos3,
        });
      }

      const buffer = await pipeline
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer();
      results[variant.key] = await saveFile(buffer, StorageKey.branding(filename), "image/png");
    }

    const upsert = await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    const tx = await db.transaction(async () => {
      for (const [key, value] of Object.entries(results)) {
        await upsert.run(key, value);
      }
    });
    await tx();

    log.info(`Dark logo uploaded and resized: ${Object.keys(results).length} variants`);
    res.json({ success: true, paths: results });
  } catch (err: any) {
    log.error("Dark logo upload failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/logo-dark", requireAuth, async (req, res) => {
  try {
    const keys = ["clubLogoDarkOriginal", "clubLogoDarkNav", "clubLogoDarkFooter", "clubLogoDarkFavicon", "clubLogoDarkSplash"];
    const getVal = await db.prepare("SELECT value FROM settings WHERE key = ?");
    const clearVal = await db.prepare("UPDATE settings SET value = '' WHERE key = ?");

    for (const key of keys) {
      const row = await getVal.get(key) as any;
      if (row?.value) {
        await deleteFile(row.value);
      }
      await clearVal.run(key);
    }

    log.info("Dark logo reset to defaults");
    res.json({ success: true });
  } catch (err: any) {
    log.error("Dark logo delete failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/pwa-icon", requireAuth, upload.single("logo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    ensureBrandingDir();
    const timestamp = Date.now();
    const results: Record<string, string> = {};

    const sizes = [
      { key: "pwaIcon192", size: 192 },
      { key: "pwaIcon512", size: 512 },
    ];

    for (const { key, size } of sizes) {
      const filename = `pwa-icon-${size}-${timestamp}.png`;
      const buffer = await sharp(req.file.buffer, { density: 300 })
        .resize(size, size, { fit: "cover", position: "centre", kernel: sharp.kernel.lanczos3 })
        .png({ compressionLevel: 9 })
        .toBuffer();
      results[key] = await saveFile(buffer, StorageKey.branding(filename), "image/png");
    }

    const upsert = await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    const tx = await db.transaction(async () => {
      for (const [key, value] of Object.entries(results)) {
        await upsert.run(key, value);
      }
    });
    await tx();

    log.info(`PWA icon uploaded: ${Object.keys(results).length} sizes`);
    res.json({ success: true, paths: results });
  } catch (err: any) {
    log.error("PWA icon upload failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/pwa-icon", requireAuth, async (req, res) => {
  try {
    const keys = ["pwaIcon192", "pwaIcon512"];
    const getVal = await db.prepare("SELECT value FROM settings WHERE key = ?");
    const clearVal = await db.prepare("UPDATE settings SET value = '' WHERE key = ?");

    for (const key of keys) {
      const row = await getVal.get(key) as any;
      if (row?.value) {
        await deleteFile(row.value);
      }
      await clearVal.run(key);
    }

    log.info("PWA icon removed");
    res.json({ success: true });
  } catch (err: any) {
    log.error("PWA icon delete failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/logo", requireAuth, async (req, res) => {
  try {
    const keys = ["clubLogoOriginal", "clubLogoNav", "clubLogoFooter", "clubLogoFavicon", "clubLogoSplash"];
    const getVal = await db.prepare("SELECT value FROM settings WHERE key = ?");
    const clearVal = await db.prepare("UPDATE settings SET value = '' WHERE key = ?");

    for (const key of keys) {
      const row = await getVal.get(key) as any;
      if (row?.value) {
        await deleteFile(row.value);
      }
      await clearVal.run(key);
    }

    log.info("Logo reset to defaults");
    res.json({ success: true });
  } catch (err: any) {
    log.error("Logo delete failed:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
