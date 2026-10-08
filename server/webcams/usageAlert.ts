import { query, queryOne, execute } from "../pg.js";
import { sendEmail } from "../utils/email.js";
import { resolveRecipients } from "../utils/gridAlerts.js";
import createLogger from "../utils/logger.js";

const log = createLogger("webcams");

const THRESHOLD_KEY = "webcamUsageAlertGb";
const SENT_KEY = "webcamUsageAlertSent";
export const DEFAULT_USAGE_ALERT_GB = 25;

async function getSetting(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", [key]);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, value],
  );
}

export async function getArchiveTotals(): Promise<{ frames: number; bytes: number }> {
  const [row] = await query<{ n: string; bytes: string | null }>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM webcam_frames`,
  );
  return { frames: Number(row?.n ?? 0), bytes: Number(row?.bytes ?? 0) };
}

/**
 * Emails the admins once if the camera archive passes the threshold (GB). With
 * 90-day retention the archive levels off near 12 GB, so crossing 25 GB means
 * the cleanup job has stopped working. Resets when usage drops back under.
 * Never throws.
 */
export async function checkWebcamStorage(): Promise<void> {
  try {
    const { bytes } = await getArchiveTotals();
    const usedGb = bytes / 1024 ** 3;
    const raw = await getSetting(THRESHOLD_KEY);
    const thresholdGb = raw && Number.isFinite(Number(raw)) ? Number(raw) : DEFAULT_USAGE_ALERT_GB;
    const outstanding = (await getSetting(SENT_KEY)) === "1";

    if (usedGb < thresholdGb) {
      if (outstanding) await setSetting(SENT_KEY, "0");
      return;
    }
    log.warn(`Webcam archive is ${usedGb.toFixed(1)} GB, over the ${thresholdGb} GB alert threshold`);
    if (outstanding) return;

    const recipients = await resolveRecipients();
    if (recipients.length === 0) return;
    const subject = `SkyHigh: camera archive is ${usedGb.toFixed(1)} GB`;
    const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
      <h2 style="margin:0 0 8px">SkyHigh camera archive is larger than expected</h2>
      <p>The archive is <strong>${usedGb.toFixed(1)} GB</strong>, past the <strong>${thresholdGb} GB</strong> warning level.
      With the current retention setting it should level off far below this, so the nightly cleanup is probably not running.
      Check Admin &rarr; Cameras. Change the warning level with the <code>${THRESHOLD_KEY}</code> setting.</p></div>`;
    const results = await Promise.all(recipients.map(async to => (await sendEmail({ to, subject, html })).success));
    if (results.some(Boolean)) await setSetting(SENT_KEY, "1");
  } catch (e) {
    log.error("Webcam storage check failed", e instanceof Error ? e.message : e);
  }
}
