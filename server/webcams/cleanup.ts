import { query, queryOne, execute } from "../pg.js";
import { deleteFile, publicUrl } from "../storage.js";
import createLogger from "../utils/logger.js";
import { variantKeys } from "./keys.js";
import { clampRetention, retentionCutoff } from "./retention.js";

const log = createLogger("webcams");

export const MAX_DELETE_PER_RUN = 3000;
export const RETENTION_SETTING = "webcamRetentionDays";

export async function getRetentionDays(): Promise<number> {
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", [RETENTION_SETTING]);
  return clampRetention(row?.value);
}

export interface CleanupResult {
  dryRun: boolean;
  retentionDays: number;
  cutoff: string;
  expired: number;
  expiredBytes: number;
  deleted: number;
  capped: boolean;
}

/**
 * Deletes archived images (objects first, then rows) older than the retention
 * window. The window can never be shorter than MIN_RETENTION_DAYS, so today's
 * frames are untouched whatever the setting says, and one run deletes at most
 * MAX_DELETE_PER_RUN rows. With dryRun it only reports what would go.
 */
export async function runCleanup(opts: { dryRun?: boolean; now?: Date } = {}): Promise<CleanupResult> {
  const dryRun = opts.dryRun ?? false;
  const retentionDays = await getRetentionDays();
  const cutoff = retentionCutoff(opts.now ?? new Date(), retentionDays);

  const totals = await queryOne<{ n: string; bytes: string | null }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM webcam_frames WHERE "capturedAt" < $1`,
    [cutoff.toISOString()],
  );
  const expired = Number(totals?.n ?? 0);
  const result: CleanupResult = {
    dryRun, retentionDays, cutoff: cutoff.toISOString(),
    expired, expiredBytes: Number(totals?.bytes ?? 0), deleted: 0, capped: expired > MAX_DELETE_PER_RUN,
  };
  if (dryRun || expired === 0) return result;

  const batch = await query<{ id: string; keyBase: string }>(
    `SELECT id, "keyBase" FROM webcam_frames WHERE "capturedAt" < $1 ORDER BY "capturedAt" ASC LIMIT $2`,
    [cutoff.toISOString(), MAX_DELETE_PER_RUN],
  );
  for (const row of batch) {
    const keys = variantKeys(row.keyBase);
    await Promise.all([keys.thumb, keys.medium, keys.original].map(k => deleteFile(publicUrl(k))));
  }
  await execute(`DELETE FROM webcam_frames WHERE id = ANY($1::bigint[])`, [batch.map(r => r.id)]);
  result.deleted = batch.length;
  log.info(`Webcam cleanup removed ${batch.length} frames older than ${result.cutoff}${result.capped ? " (capped, more remain)" : ""}`);
  return result;
}
