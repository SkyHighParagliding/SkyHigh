/**
 * migrate-r2-bucket.ts
 *
 * One-shot script: copy all files from the OLD Cloudflare R2 bucket to the NEW bucket,
 * then rewrite every database reference from the OLD public domain to the NEW domain.
 *
 * Usage (run locally against production DB):
 *   DATABASE_URL=<railway-postgres-url> \
 *   R2_ACCOUNT_ID=<id> \
 *   R2_ACCESS_KEY_ID=<key> \
 *   R2_SECRET_ACCESS_KEY=<secret> \
 *   R2_BUCKET_NAME=skyhigh-media \
 *   R2_PUBLIC_URL=https://pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev \
 *   npx tsx scripts/migrate-r2-bucket.ts
 *
 * The script is idempotent: files already in the NEW bucket are skipped (HEAD check),
 * and DB rewrites are no-ops when no OLD domain references remain.
 */

import "dotenv/config";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Pool } from "pg";

// ─── Config ──────────────────────────────────────────────────────────────────

const OLD_DOMAIN = "pub-d31362da23d54f83bb50efb9194c6b87.r2.dev";
const NEW_DOMAIN = process.env.R2_PUBLIC_URL?.replace(/^https?:\/\//, "").replace(/\/$/, "");

if (!NEW_DOMAIN) {
  console.error("R2_PUBLIC_URL env var is required");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL env var is required");
  process.exit(1);
}

const REQUIRED_R2 = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
for (const v of REQUIRED_R2) {
  if (!process.env[v]) {
    console.error(`${v} env var is required`);
    process.exit(1);
  }
}

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractKey(url: string): string {
  // https://pub-xxx.r2.dev/images/hero/foo.jpg  →  images/hero/foo.jpg
  return new URL(url).pathname.slice(1);
}

async function fileExistsInNew(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function copyFile(oldUrl: string): Promise<{ key: string; skipped: boolean }> {
  const key = extractKey(oldUrl);
  if (await fileExistsInNew(key)) {
    return { key, skipped: true };
  }
  const res = await fetch(oldUrl);
  if (!res.ok) throw new Error(`Fetch failed for ${oldUrl}: HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buffer = Buffer.from(await res.arrayBuffer());
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=604800, immutable",
  }));
  return { key, skipped: false };
}

// ─── Phase 1: Inventory ───────────────────────────────────────────────────────

async function inventoryUrls(): Promise<Set<string>> {
  const client = await pool.connect();
  const urls = new Set<string>();

  try {
    // sites.image (single URL column)
    const siteImages = await client.query<{ image: string }>(
      `SELECT image FROM sites WHERE image LIKE $1`,
      [`%${OLD_DOMAIN}%`]
    );
    for (const row of siteImages.rows) urls.add(row.image);

    // sites.essentialInfoImages (JSON array of objects with "url" fields)
    const essentialRows = await client.query<{ id: number; essentialInfoImages: string }>(
      `SELECT id, "essentialInfoImages" FROM sites WHERE "essentialInfoImages"::text LIKE $1`,
      [`%${OLD_DOMAIN}%`]
    );
    for (const row of essentialRows.rows) {
      try {
        const arr: Array<{ url?: string }> = JSON.parse(row.essentialInfoImages ?? "[]");
        for (const item of arr) {
          if (item.url?.includes(OLD_DOMAIN)) urls.add(item.url);
        }
      } catch {
        // not valid JSON, skip
      }
    }

    // settings: scan all TEXT/JSONB values for OLD_DOMAIN references
    const settingRows = await client.query<{ key: string; value: string }>(
      `SELECT key, value::text AS value FROM settings WHERE value::text LIKE $1`,
      [`%${OLD_DOMAIN}%`]
    );
    for (const row of settingRows.rows) {
      // Extract all https://OLD_DOMAIN/... occurrences
      const matches = row.value.matchAll(new RegExp(`https?://${OLD_DOMAIN.replace(/\./g, "\\.")}/[^"\\s,>]+`, "g"));
      for (const [match] of matches) urls.add(match);
    }
  } finally {
    client.release();
  }

  return urls;
}

// ─── Phase 2: Copy files ─────────────────────────────────────────────────────

async function copyAllFiles(urls: Set<string>): Promise<{ copied: number; skipped: number; failed: string[] }> {
  let copied = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const url of urls) {
    try {
      const result = await copyFile(url);
      if (result.skipped) {
        skipped++;
        console.log(`  SKIP  ${result.key}`);
      } else {
        copied++;
        console.log(`  COPY  ${result.key}`);
      }
    } catch (err: any) {
      failed.push(url);
      console.error(`  FAIL  ${url} — ${err.message}`);
    }
  }

  return { copied, skipped, failed };
}

// ─── Phase 3: Rewrite DB references ─────────────────────────────────────────

async function rewriteDb(): Promise<{ tablesUpdated: Record<string, number> }> {
  const client = await pool.connect();
  const tablesUpdated: Record<string, number> = {};

  try {
    await client.query("BEGIN");

    // sites.image
    const r1 = await client.query(
      `UPDATE sites SET image = REPLACE(image, $1, $2) WHERE image LIKE $3`,
      [`https://${OLD_DOMAIN}`, `https://${NEW_DOMAIN}`, `%${OLD_DOMAIN}%`]
    );
    tablesUpdated["sites.image"] = r1.rowCount ?? 0;

    // sites.essentialInfoImages (cast to text, replace, cast back)
    const r2 = await client.query(
      `UPDATE sites
       SET "essentialInfoImages" = REPLACE("essentialInfoImages"::text, $1, $2)::jsonb
       WHERE "essentialInfoImages"::text LIKE $3`,
      [`https://${OLD_DOMAIN}`, `https://${NEW_DOMAIN}`, `%${OLD_DOMAIN}%`]
    );
    tablesUpdated["sites.essentialInfoImages"] = r2.rowCount ?? 0;

    // settings: rewrite all values that contain OLD_DOMAIN
    const settingRows = await client.query<{ key: string }>(
      `SELECT key FROM settings WHERE value::text LIKE $1`,
      [`%${OLD_DOMAIN}%`]
    );
    for (const row of settingRows.rows) {
      const r = await client.query(
        `UPDATE settings SET value = REPLACE(value::text, $1, $2)::jsonb
         WHERE key = $3`,
        [`https://${OLD_DOMAIN}`, `https://${NEW_DOMAIN}`, row.key]
      );
      tablesUpdated[`settings[${row.key}]`] = r.rowCount ?? 0;
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { tablesUpdated };
}

// ─── Phase 4: Verify ─────────────────────────────────────────────────────────

async function verify(): Promise<{ remaining: number }> {
  const client = await pool.connect();
  try {
    const r1 = await client.query(`SELECT COUNT(*) FROM sites WHERE image LIKE $1`, [`%${OLD_DOMAIN}%`]);
    const r2 = await client.query(`SELECT COUNT(*) FROM sites WHERE "essentialInfoImages"::text LIKE $1`, [`%${OLD_DOMAIN}%`]);
    const r3 = await client.query(`SELECT COUNT(*) FROM settings WHERE value::text LIKE $1`, [`%${OLD_DOMAIN}%`]);
    const remaining = parseInt(r1.rows[0].count) + parseInt(r2.rows[0].count) + parseInt(r3.rows[0].count);
    return { remaining };
  } finally {
    client.release();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== R2 Bucket Migration ===");
  console.log(`  OLD: https://${OLD_DOMAIN}`);
  console.log(`  NEW: https://${NEW_DOMAIN}`);
  console.log();

  console.log("Phase 1: Inventorying OLD bucket URLs in database...");
  const urls = await inventoryUrls();
  console.log(`  Found ${urls.size} unique file URL(s) referencing OLD bucket`);
  console.log();

  if (urls.size === 0) {
    console.log("No OLD bucket URLs found — nothing to migrate.");
  } else {
    console.log("Phase 2: Copying files to NEW bucket...");
    const { copied, skipped, failed } = await copyAllFiles(urls);
    console.log();
    console.log(`  Copied:  ${copied}`);
    console.log(`  Skipped: ${skipped} (already in NEW bucket)`);
    console.log(`  Failed:  ${failed.length}`);
    if (failed.length > 0) {
      console.log("  Failed URLs:");
      failed.forEach(u => console.log(`    ${u}`));
      console.log();
      console.log("WARNING: Some files failed to copy. DB rewrite will be skipped to avoid broken references.");
      await pool.end();
      process.exit(1);
    }
    console.log();

    console.log("Phase 3: Rewriting database references...");
    const { tablesUpdated } = await rewriteDb();
    for (const [table, count] of Object.entries(tablesUpdated)) {
      if (count > 0) console.log(`  ${table}: ${count} row(s) updated`);
    }
    console.log();
  }

  console.log("Phase 4: Verifying no OLD domain references remain...");
  const { remaining } = await verify();
  if (remaining === 0) {
    console.log("  ✓ Zero OLD domain references remaining in database.");
  } else {
    console.log(`  ✗ WARNING: ${remaining} OLD domain reference(s) still in database.`);
    await pool.end();
    process.exit(1);
  }

  console.log();
  console.log("Migration complete.");
  await pool.end();
}

main().catch(err => {
  console.error("Fatal:", err);
  pool.end();
  process.exit(1);
});
