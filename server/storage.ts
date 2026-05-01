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
    });
  }
  return _client;
}

const localUploadsDir = path.join(process.cwd(), "uploads");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Save a file buffer to R2 (if configured) or local filesystem.
 * @param buffer   File data
 * @param key      Storage key, e.g. "hero-abc.jpg" or "branding/logo-abc.png"
 * @param contentType  MIME type (default image/jpeg)
 * @returns Publicly accessible URL: https://... (R2) or /uploads/... (local)
 */
export async function saveFile(
  buffer: Buffer,
  key: string,
  contentType = "image/jpeg",
): Promise<string> {
  if (isR2Configured()) {
    await getClient().send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=604800, immutable",
      }),
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
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`Failed to fetch ${urlOrPath}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
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
    try {
      const key = new URL(urlOrPath).pathname.slice(1);
      await getClient().send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME!, Key: key }));
    } catch {
      // best-effort
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
