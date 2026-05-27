import { query, queryOne, execute } from "../pg.js";
import createLogger from "./logger.js";

const log = createLogger("siteguide-version-check");

export interface VersionCheckResult {
  id: number;
  checkedAt: string;
  detectedVersion: string | null;
  previousVersion: string | null;
  changed: boolean;
  error: string | null;
}

export async function fetchSiteguideVersion(): Promise<string> {
  const aboutRes = await fetch("https://siteguide.org.au/About", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  if (!aboutRes.ok) throw new Error(`HTTP ${aboutRes.status}`);
  const html = await aboutRes.text();
  const vMatch = html.match(/v(\d+)\s*\(/);
  if (!vMatch) throw new Error("Version not found in About page");
  return `v${vMatch[1]}`;
}

export async function getLastVersionCheck(): Promise<VersionCheckResult | null> {
  const row = await queryOne<VersionCheckResult>(
    "SELECT * FROM siteguide_version_checks ORDER BY id DESC LIMIT 1"
  );
  return row ?? null;
}

export async function getLastDetectedVersion(): Promise<string | null> {
  const row = await queryOne<{ detectedVersion: string }>(
    `SELECT "detectedVersion" FROM siteguide_version_checks WHERE "detectedVersion" IS NOT NULL ORDER BY id DESC LIMIT 1`
  );
  return row?.detectedVersion ?? null;
}

export async function getLastChangedCheck(): Promise<VersionCheckResult | null> {
  const row = await queryOne<VersionCheckResult>(
    "SELECT * FROM siteguide_version_checks WHERE changed = 1 ORDER BY id DESC LIMIT 1"
  );
  return row ?? null;
}

export async function getLastBulkImportTime(): Promise<string | null> {
  const row = await queryOne<{ lastImport: string | null }>(
    `SELECT MAX("siteguideScrapedAt") as "lastImport" FROM sites WHERE "siteguideScrapedAt" IS NOT NULL AND "siteguideScrapedAt" != ''`
  );
  return row?.lastImport ?? null;
}

export async function getVersionBeforeLastChange(): Promise<string | null> {
  const row = await queryOne<{ previousVersion: string }>(
    `SELECT "previousVersion" FROM siteguide_version_checks WHERE changed = 1 ORDER BY id DESC LIMIT 1`
  );
  return row?.previousVersion ?? null;
}

export async function getChangedSinceLastImport(): Promise<boolean> {
  const lastImportTime = await getLastBulkImportTime();
  if (!lastImportTime) return false;

  const row = await queryOne<{ id: number }>(
    `SELECT id FROM siteguide_version_checks WHERE changed = 1 AND "checkedAt" > $1 LIMIT 1`,
    [lastImportTime]
  );
  return row != null;
}

export async function runVersionCheck(): Promise<VersionCheckResult> {
  const previousVersion = await getLastDetectedVersion();
  let detectedVersion: string | null = null;
  let error: string | null = null;

  try {
    detectedVersion = await fetchSiteguideVersion();
  } catch (e: any) {
    error = e.message || "Unknown error fetching version";
    log.error(`Version check failed: ${error}`);
  }

  const changed = detectedVersion !== null && previousVersion !== null && detectedVersion !== previousVersion;

  const checkedAt = new Date().toISOString();
  const rows = await query<{ id: number }>(
    `INSERT INTO siteguide_version_checks ("checkedAt", "detectedVersion", "previousVersion", changed, error)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [checkedAt, detectedVersion, previousVersion, changed, error]
  );

  const newId = rows[0]?.id;

  if (changed) {
    log.info(`Siteguide version CHANGED: ${previousVersion} → ${detectedVersion}`);
  } else if (detectedVersion) {
    log.info(`Siteguide version unchanged: ${detectedVersion}`);
  }

  return {
    id: newId as number,
    checkedAt,
    detectedVersion,
    previousVersion,
    changed,
    error,
  };
}
