import db from "../db.js";
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
  const row = await db.prepare(
    "SELECT * FROM siteguide_version_checks ORDER BY id DESC LIMIT 1"
  ).get() as VersionCheckResult | undefined;
  return row ?? null;
}

export async function getLastDetectedVersion(): string | null {
  const row = await db.prepare(
    "SELECT detectedVersion FROM siteguide_version_checks WHERE detectedVersion IS NOT NULL ORDER BY id DESC LIMIT 1"
  ).get() as { detectedVersion: string } | undefined;
  return row?.detectedVersion ?? null;
}

export async function getLastChangedCheck(): Promise<VersionCheckResult | null> {
  const row = await db.prepare(
    "SELECT * FROM siteguide_version_checks WHERE changed = 1 ORDER BY id DESC LIMIT 1"
  ).get() as VersionCheckResult | undefined;
  return row ?? null;
}

export async function getLastBulkImportTime(): string | null {
  const row = await db.prepare(
    "SELECT MAX(siteguideScrapedAt) as lastImport FROM sites WHERE siteguideScrapedAt IS NOT NULL AND siteguideScrapedAt != ''"
  ).get() as { lastImport: string | null } | undefined;
  return row?.lastImport ?? null;
}

export async function getVersionBeforeLastChange(): string | null {
  const row = await db.prepare(
    "SELECT previousVersion FROM siteguide_version_checks WHERE changed = 1 ORDER BY id DESC LIMIT 1"
  ).get() as { previousVersion: string } | undefined;
  return row?.previousVersion ?? null;
}

export async function getChangedSinceLastImport(): boolean {
  const lastImportTime = await getLastBulkImportTime();
  if (!lastImportTime) return false;

  const row = await db.prepare(
    "SELECT id FROM siteguide_version_checks WHERE changed = 1 AND checkedAt > ? LIMIT 1"
  ).get(lastImportTime) as { id: number } | undefined;
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
  const stmt = await db.prepare(
    "INSERT INTO siteguide_version_checks (checkedAt, detectedVersion, previousVersion, changed, error) VALUES (?, ?, ?, ?, ?)"
  );
  const result = await stmt.run(
    checkedAt,
    detectedVersion,
    previousVersion,
    changed ? 1 : 0,
    error
  );

  if (changed) {
    log.info(`Siteguide version CHANGED: ${previousVersion} → ${detectedVersion}`);
  } else if (detectedVersion) {
    log.info(`Siteguide version unchanged: ${detectedVersion}`);
  }

  return {
    id: result.lastInsertRowid as number,
    checkedAt,
    detectedVersion,
    previousVersion,
    changed,
    error,
  };
}
