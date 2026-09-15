import { query, queryOne, execute } from "../pg.js";
import createLogger from "./logger.js";
import { sendEmail } from "./email.js";

const log = createLogger("siteguide-version-check");

// Notification recipients: current admins plus a configurable comma-separated
// extra list (mirrors the gridAlerts pattern, kept independently configurable
// so whoever curates the site data still gets these if they stop being admin).
const ALERT_RECIPIENTS_KEY = "siteguideAlertRecipients";
const DEFAULT_ALERT_RECIPIENTS = "jonpamment@gmail.com";

async function resolveAlertRecipients(): Promise<string[]> {
  const admins = await query<{ email: string }>(
    `SELECT email FROM contacts WHERE "isAdmin" = 1 AND email IS NOT NULL AND email != ''`
  );
  const extraRow = await queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = $1",
    [ALERT_RECIPIENTS_KEY]
  );
  const extra = (extraRow?.value ?? DEFAULT_ALERT_RECIPIENTS)
    .split(",").map(e => e.trim()).filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of [...admins.map(a => a.email), ...extra]) {
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

/**
 * Email admins when siteguide.org.au publishes a new version. Called from the
 * daily scheduled version check on the change branch, alongside the automatic
 * zone-data download and re-import. Best-effort: a send failure is logged, never
 * thrown, so it cannot block the import pipeline.
 */
export async function notifySiteguideVersionChange(
  previousVersion: string | null,
  detectedVersion: string | null
): Promise<void> {
  try {
    const recipients = await resolveAlertRecipients();
    if (recipients.length === 0) {
      log.error("Siteguide version changed but no alert recipients are configured");
      return;
    }

    const subject = `Siteguide updated: ${previousVersion ?? "?"} → ${detectedVersion ?? "?"}`;
    const html = `
      <div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
        <h2 style="margin:0 0 8px">Siteguide has a new version</h2>
        <p style="margin:0 0 16px;color:#444">
          The site guide at <a href="https://siteguide.org.au/About">siteguide.org.au</a>
          changed from <strong>${previousVersion ?? "unknown"}</strong> to
          <strong>${detectedVersion ?? "unknown"}</strong>.
        </p>
        <p style="margin:0 0 4px"><strong>What happens automatically</strong></p>
        <p style="margin:0 0 16px;color:#444">
          If enabled, SkyHigh downloads the refreshed airspace/zone data and re-imports
          sites for the last imported state. Review the results in
          Admin → Sites → Siteguide Import, and check the version-check status panel.
        </p>
        <p style="margin:0;color:#888;font-size:12px">
          Automated notification from the daily siteguide version check.
        </p>
      </div>`;

    const results = await Promise.all(
      recipients.map(async to => {
        const res = await sendEmail({ to, subject, html });
        if (!res.success) log.error(`Siteguide change alert to ${to} failed — ${res.error}`);
        return res.success;
      })
    );
    log.info(`Siteguide change alert emailed to ${results.filter(Boolean).length}/${recipients.length} recipients`);
  } catch (err: any) {
    log.error(`Siteguide change notification failed: ${err.message}`);
  }
}

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
    [checkedAt, detectedVersion, previousVersion, changed ? 1 : 0, error]
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
