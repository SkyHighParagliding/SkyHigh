import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");

export function isR2Configured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_PUBLIC_URL);
}

let _client: S3Client | null = null;
function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
      requestHandler: {
        requestTimeout: 15000,
        connectionTimeout: 10000,
      },
    });
  }
  return _client;
}

/** Retry wrapper for R2 S3 operations (transient failures: 5xx, network errors). */
async function withRetryR2<T>(fn: () => Promise<T>, context: string, retries = 3): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === retries - 1) throw err;
      // Don't retry 4xx errors (except 429 which S3 doesn't typically return)
      if (err?.$metadata?.httpStatusCode && err.$metadata.httpStatusCode < 500 && err.$metadata.httpStatusCode !== 429) throw err;
      const wait = 1000 * Math.pow(2, attempt);
      console.warn(`R2 ${context} failed (attempt ${attempt + 1}/${retries}), retrying in ${wait}ms: ${err.message}`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw new Error(`R2 ${context} exhausted retries`);
}

const localUploadsDir = path.join(process.cwd(), "uploads");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Folder structure ──────────────────────────────────────────────────────────
// Consistent key namespace used identically in both R2 and local /uploads/:
//
//   images/hero/          hero & site photos (1920x1080)
//   images/sites/         site banner images (1920x600)
//   images/sliders/       slider images (600x400, 450x300, 267x400)
//   images/content/       rich-text embedded images (1200x800)
//   images/screenshots/   screenshot captures
//   images/ai/            AI-enhanced output & watermarked images
//   images/essential/     scraped siteguide map images
//   branding/             logo variants, pwa icons
//   attachments/          page/doc file attachments
//   submissions/          social media image submissions

/**
 * Save a file buffer to R2 (if configured) or local filesystem.
 *
 * @param buffer       File data
 * @param key          Storage key with folder prefix, e.g. "images/hero/abc.jpg"
 *                     Legacy flat keys like "hero-abc.jpg" are also accepted.
 * @param contentType  MIME type (default "image/jpeg")
 * @returns            Publicly accessible URL:
 *                       R2:    https://<R2_PUBLIC_URL>/<key>
 *                       Local: /uploads/<key>
 */
export async function saveFile(
  buffer: Buffer,
  key: string,
  contentType = "image/jpeg",
): Promise<string> {
  if (isR2Configured()) {
    await withRetryR2(
      () => getClient().send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME!,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: "public, max-age=604800, immutable",
        }),
      ),
      `saveFile(${key})`,
    );
    return `${R2_PUBLIC_URL}/${key}`;
  }
  const localPath = path.join(localUploadsDir, key);
  ensureDir(path.dirname(localPath));
  fs.writeFileSync(localPath, buffer);
  return `/uploads/${key}`;
}

/**
 * Read a file as a Buffer.
 * Accepts a full https:// URL (R2) or a /uploads/... local path.
 */
export async function readFile(urlOrPath: string): Promise<Buffer> {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(urlOrPath, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`Failed to fetch ${urlOrPath}: ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      } catch (err: any) {
        if (attempt === 2) throw err;
        const wait = 1000 * Math.pow(2, attempt);
        console.warn(`readFile HTTP retry ${attempt + 1}/3 for ${urlOrPath}: ${err.message}`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  const abs = urlOrPath.startsWith("/")
    ? path.join(process.cwd(), urlOrPath.slice(1))
    : path.join(process.cwd(), urlOrPath);
  return fs.readFileSync(abs);
}

/**
 * Delete a file from R2 or local filesystem.
 */
export async function deleteFile(urlOrPath: string): Promise<void> {
  if (!urlOrPath) return;
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    if (!isR2Configured()) return;
    const key = new URL(urlOrPath).pathname.slice(1);
    try {
      await withRetryR2(
        () => getClient().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME!, Key: key })),
        `deleteFile(${key})`,
      );
    } catch (err: any) {
      console.warn(`Failed to delete R2 object ${key}: ${err.message}`);
    }
  } else {
    const abs = urlOrPath.startsWith("/")
      ? path.join(process.cwd(), urlOrPath.slice(1))
      : path.join(process.cwd(), urlOrPath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  }
}

/**
 * Check whether a given path/URL is accessible.
 * Returns true for http(s) URLs (assumed reachable) and for existing local files.
 */
export function fileExists(urlOrPath: string): boolean {
  if (!urlOrPath) return false;
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) return true;
  const abs = urlOrPath.startsWith("/")
    ? path.join(process.cwd(), urlOrPath.slice(1))
    : path.join(process.cwd(), urlOrPath);
  return fs.existsSync(abs);
}

/**
 * Derive a storage key for overwriting an existing file (R2 or local).
 * For R2 URLs: extracts the key from the URL path.
 * For local /uploads/... paths: strips the leading /uploads/ to get the key.
 */
export function keyFromUrl(urlOrPath: string): string {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    return new URL(urlOrPath).pathname.slice(1);
  }
  return urlOrPath.replace(/^\/uploads\//, "");
}

// ─── Key helpers ───────────────────────────────────────────────────────────────
// Use these in upload routes to generate correctly-namespaced keys.

export const StorageKey = {
  hero: (filename: string) => `images/hero/${filename}`,
  site: (filename: string) => `images/sites/${filename}`,
  banner: (filename: string) => `images/sites/${filename}`,
  slider: (filename: string) => `images/sliders/${filename}`,
  content: (filename: string) => `images/content/${filename}`,
  screenshot: (filename: string) => `images/screenshots/${filename}`,
  ai: (filename: string) => `images/ai/${filename}`,
  essential: (filename: string) => `images/essential/${filename}`,
  branding: (filename: string) => `branding/${filename}`,
  attachment: (filename: string) => `attachments/${filename}`,
  submission: (filename: string) => `submissions/${filename}`,
  contactPhoto: (filename: string) => `contacts/photos/${filename}`,
};
