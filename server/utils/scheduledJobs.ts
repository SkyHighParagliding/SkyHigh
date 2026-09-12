import cron from "node-cron";
import createLogger from "./logger.js";
import { runVersionCheck } from "./siteguideVersionCheck.js";
import { sendEmail } from "./email.js";
import { query, queryOne, execute } from "../pg.js";
import { cleanExpiredSessions } from "../middleware/auth.js";

const log = createLogger("scheduled-jobs");

async function getSetting(key: string, fallback: string): Promise<string> {
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", [key]);
  return row?.value || fallback;
}

async function getSettingInt(key: string, fallback: number): Promise<number> {
  const val = parseInt(await getSetting(key, String(fallback)), 10);
  return Number.isFinite(val) ? val : fallback;
}

async function checkAndNotifySubmissions() {
  try {
    const jobStart = new Date().toISOString();
    const lastNotified = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'lastSubmissionNotification'");
    const since = lastNotified?.value || "2000-01-01T00:00:00";

    const pendingRow = await queryOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM image_submissions WHERE status = 'pending' AND \"submittedAt\" > $1 AND \"submittedAt\" <= $2",
      [since, jobStart]
    );
    const pending = { count: parseInt(pendingRow?.count ?? "0", 10) };

    if (pending.count === 0) {
      log.info("No new submissions since last notification — skipping email");
      return;
    }

    const socialMediaContacts = await query<{ name: string; surname: string; email: string }>(
      "SELECT name, surname, email FROM contacts WHERE \"isSocialMedia\" = 1 AND email != '' AND email IS NOT NULL"
    );

    if (socialMediaContacts.length === 0) {
      log.info("No Social Media contacts configured — skipping submission notification");
      return;
    }

    const totalPendingRow = await queryOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM image_submissions WHERE status = 'pending'"
    );
    const totalPending = { count: parseInt(totalPendingRow?.count ?? "0", 10) };

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e3a5f;">New Image Submissions</h2>
        <p>There are <strong>${pending.count}</strong> new image submission${pending.count !== 1 ? "s" : ""} awaiting review.</p>
        <p>Total pending submissions: <strong>${totalPending.count}</strong></p>
        <p>Please log in to the admin panel to review, approve, or reject these submissions.</p>
        <p style="color: #666; font-size: 12px; margin-top: 24px;">
          You are receiving this email because you are flagged as a Social Media committee member.
        </p>
      </div>
    `;

    let anySent = false;
    for (const contact of socialMediaContacts) {
      const result = await sendEmail({
        to: contact.email,
        subject: `${pending.count} New Image Submission${pending.count !== 1 ? "s" : ""} Awaiting Review`,
        html,
      });
      if (result.success) {
        anySent = true;
        log.info(`Submission notification sent to ${contact.email}`);
      } else {
        log.error(`Failed to send submission notification to ${contact.email}: ${result.error}`);
      }
    }

    if (anySent) {
      await execute(
        "INSERT INTO settings (key, value) VALUES ('lastSubmissionNotification', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [jobStart]
      );
      log.info(`Submission notification sent to ${socialMediaContacts.length} Social Media contact(s)`);
    } else {
      log.error("All submission notification emails failed — watermark not advanced");
    }
  } catch (e: any) {
    log.error(`Submission notification job failed: ${e.message}`);
  }
}

async function runDriveSync() {
  const enabled = await getSetting("driveSyncEnabled", "false");
  if (enabled !== "true") return;

  log.info("Running scheduled Google Drive document sync...");
  try {
    const { runDocumentIndexSync } = await import("../routes/documents.js");
    const result = await runDocumentIndexSync();
    if (result.success) {
      log.info(`Scheduled Drive sync complete: ${result.message}`);
      await execute(
        "INSERT INTO settings (key, value) VALUES ('driveSyncLastRun', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        [new Date().toISOString()]
      );
    } else {
      log.error(`Scheduled Drive sync failed: ${result.error}`);
    }
  } catch (e: any) {
    log.error(`Scheduled Drive sync error: ${e.message}`);
  }
}

async function fetchFineGridDaily() {
  const ts = new Date().toISOString();
  try {
    const { fetchFineGrid } = await import("../grid/fineGrid.js");
    await fetchFineGrid(true);
    await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["fineGridLastRun", ts]);
    await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["fineGridLastResult", "ok"]);
    log.info("Fine grid daily fetch completed");
  } catch (e: any) {
    await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["fineGridLastRun", ts]);
    await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["fineGridLastResult", e.message || "Unknown error"]);
    log.error(`Fine grid daily fetch failed: ${e.message}`);
  }
}

// Delays between retry rounds: 30min, 1h, 2h, 4h — spaced to avoid free-tier rate limit resets
const THERMAL_RETRY_DELAYS_MS = [30 * 60_000, 60 * 60_000, 120 * 60_000, 240 * 60_000];

/**
 * Number of requested points no provider could supply on the last thermal
 * fetch. Written after every run so the admin panel and the startup check have
 * a single, always-current signal.
 *
 * This replaces the old list of failed tiles: the orchestrator now gap-fills
 * across providers, so a tile that failed at tier 1 is usually filled at tier 2
 * and is not a gap at all. Only points missing from the merged result warrant
 * a retry.
 */
const THERMAL_GAP_KEY = "thermalGridMissingPoints";

async function setThermalGapCount(count: number): Promise<void> {
  await execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [THERMAL_GAP_KEY, String(count)],
  );
}

export async function getThermalGapCount(): Promise<number> {
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", [THERMAL_GAP_KEY]);
  const n = parseInt(row?.value ?? "0", 10);
  return Number.isFinite(n) ? n : 0;
}

async function fetchThermalGridDaily(retryRound = 0) {
  const ts = new Date().toISOString();
  const roundLabel = retryRound > 0 ? ` (retry ${retryRound}/${THERMAL_RETRY_DELAYS_MS.length})` : '';
  try {
    const { fetchThermalGrid, THERMAL_GRID_CACHE_KEY } = await import("../grid/thermalGrid.js");
    const { wasLastFetchFresh } = await import("../grid/pipeline.js");
    const grid = await fetchThermalGrid(true);
    const isFresh = wasLastFetchFresh(THERMAL_GRID_CACHE_KEY);

    const missing = grid.provenance?.missing ?? 0;
    await setThermalGapCount(missing);

    if (missing > 0 && retryRound < THERMAL_RETRY_DELAYS_MS.length) {
      const delayMs = THERMAL_RETRY_DELAYS_MS[retryRound];
      const delayMin = Math.round(delayMs / 60_000);
      const resultMsg = `partial — ${missing} points, retry ${retryRound + 1}/${THERMAL_RETRY_DELAYS_MS.length} in ${delayMin}min`;
      await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["thermalGridLastRun", ts]);
      await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["thermalGridLastResult", resultMsg]);
      log.info(`Thermal grid${roundLabel}: ${missing} points missing — retry ${retryRound + 1} scheduled in ${delayMin}min`);
      setTimeout(() => fetchThermalGridDaily(retryRound + 1), delayMs);
    } else if (missing > 0) {
      const resultMsg = `partial — ${missing} points unresolved after ${THERMAL_RETRY_DELAYS_MS.length} retries`;
      await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["thermalGridLastRun", ts]);
      await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["thermalGridLastResult", resultMsg]);
      log.warn(`Thermal grid: ${missing} points still missing after ${THERMAL_RETRY_DELAYS_MS.length} retries — 7:30am cron is the final backstop`);
    } else {
      const resultMsg = isFresh ? "ok" : "ok (rate limited — showing cached data)";
      await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["thermalGridLastRun", ts]);
      await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["thermalGridLastResult", resultMsg]);
      log.info(`Thermal grid${roundLabel} completed (${isFresh ? "fresh data" : "fallback to cache"})`);
    }
  } catch (e: any) {
    if (retryRound < THERMAL_RETRY_DELAYS_MS.length) {
      const delayMs = THERMAL_RETRY_DELAYS_MS[retryRound];
      const delayMin = Math.round(delayMs / 60_000);
      await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["thermalGridLastRun", ts]);
      await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["thermalGridLastResult", `error — retry ${retryRound + 1} in ${delayMin}min`]);
      log.warn(`Thermal grid${roundLabel} threw error — retry ${retryRound + 1} in ${delayMin}min: ${e.message}`);
      setTimeout(() => fetchThermalGridDaily(retryRound + 1), delayMs);
    } else {
      await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["thermalGridLastRun", ts]);
      await execute("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", ["thermalGridLastResult", e.message || "Unknown error"]);
      log.error(`Thermal grid: all retries exhausted. Last error: ${e.message}`);
    }
  }
}

// Exported so the manual fetch route uses the same retry chain
export { fetchThermalGridDaily as runThermalGridFetch };

/** 7:30am backstop — runs only if the auto-retry chain left gaps behind. */
async function retryThermalGaps() {
  const missing = await getThermalGapCount();
  if (missing === 0) return;
  log.info(`Thermal grid 7:30am backstop: ${missing} points still missing — re-running fetch`);
  await fetchThermalGridDaily(0);
}

async function startupGridCheck() {
  const todayMelb = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });

  // Fine grid: check if today's DB row exists — a failed run still updates fineGridLastRun,
  // so a timestamp check alone can mistake a failed run for "recently fetched".
  const fineGridToday = await queryOne<{ siteId: string }>(
    `SELECT "siteId" FROM wind_grid_data WHERE "siteId" = $1`,
    [`fine_grid_${todayMelb}`]
  );
  if (!fineGridToday) {
    const vicLastRun = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'fineGridLastRun'");
    const hoursAgo = vicLastRun?.value ? Math.round((Date.now() - new Date(vicLastRun.value).getTime()) / 3600000) : null;
    log.info(`Fine grid: no data for today (${todayMelb})${hoursAgo !== null ? `, last attempt ${hoursAgo}h ago` : ''} — fetching in 60s...`);
    setTimeout(() => fetchFineGridDaily(), 60_000);
  } else {
    log.info(`Fine grid: today's data already cached (${todayMelb}) — skipping startup fetch`);
  }

  // Thermal grid: same today-row check, plus any gaps left by a previous run
  const pendingGaps = await getThermalGapCount();
  const thermalGridToday = await queryOne<{ siteId: string }>(
    `SELECT "siteId" FROM wind_grid_data WHERE "siteId" = $1`,
    [`thermal_grid_${todayMelb}`]
  );
  if (pendingGaps > 0) {
    log.info(`Thermal grid startup fetch triggered (${pendingGaps} points missing) — running in 3min...`);
    setTimeout(() => fetchThermalGridDaily(0), 3 * 60_000);
  } else if (!thermalGridToday) {
    const thermalLastRun = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'thermalGridLastRun'");
    const hoursAgo = thermalLastRun?.value ? Math.round((Date.now() - new Date(thermalLastRun.value).getTime()) / 3600000) : null;
    log.info(`Thermal grid: no data for today (${todayMelb})${hoursAgo !== null ? `, last attempt ${hoursAgo}h ago` : ''} — fetching in 3min...`);
    setTimeout(() => fetchThermalGridDaily(0), 3 * 60_000);
  } else {
    log.info(`Thermal grid: today's data already cached (${todayMelb}) — skipping startup fetch`);
  }
}

export async function startScheduledJobs() {
  // On startup: catch up if grid data is stale (server started after scheduled window)
  await startupGridCheck();

  // Daily wind grid pre-fetches: Fine at 5:00am, Thermal at 5:26am, Extended at 5:40am (Melbourne time)
  cron.schedule("0 5 * * *", fetchFineGridDaily, { timezone: "Australia/Melbourne" });
  log.info("Fine grid daily fetch scheduled: 5:00am Melbourne time");

  // Wrapped, not passed directly: node-cron invokes tasks with a TaskContext
  // argument, which would arrive as `retryRound` and silently disable the
  // retry chain on the cron path (an object is never < the delay count).
  cron.schedule("26 5 * * *", () => fetchThermalGridDaily(0), { timezone: "Australia/Melbourne" });
  log.info("Thermal grid daily fetch scheduled: 5:26am Melbourne time");

  cron.schedule("30 7 * * *", () => retryThermalGaps(), { timezone: "Australia/Melbourne" });
  log.info("Thermal grid retry scheduled: 7:30am Melbourne time (runs only if points are missing)");

  cron.schedule("0 * * * *", async () => {
    const melbourneNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Australia/Melbourne" }));
    const currentHour = melbourneNow.getHours();
    const currentMinute = melbourneNow.getMinutes();

    const versionCheckHour = await getSettingInt("schedSiteguideHour", 5);
    const versionCheckMinute = await getSettingInt("schedSiteguideMinute", 0);
    if (currentHour === versionCheckHour && currentMinute === versionCheckMinute) {
      log.info("Running scheduled siteguide version check...");
      try {
        const result = await runVersionCheck();
        if (result.error) {
          log.error(`Scheduled version check encountered error: ${result.error}`);
        } else if (result.changed) {
          log.info(`Scheduled version check: version CHANGED from ${result.previousVersion} to ${result.detectedVersion}`);

          const autoZoneDownload = await getSetting("autoDownloadZoneData", "true");
          if (autoZoneDownload !== "false") {
            log.info("Auto-downloading zone data on version change...");
            try {
              const { downloadAllZoneData, setZoneDataVersion } = await import("./siteguideZoneData.js");
              const zoneResult = await downloadAllZoneData();
              if (result.detectedVersion) {
                await setZoneDataVersion(result.detectedVersion);
              }
              log.info(`Zone data updated: ${zoneResult.zones} zones, ${zoneResult.airspace} airspace features`);
            } catch (e: any) {
              log.error(`Zone data download error: ${e.message}`);
            }
          } else {
            log.info("Auto-download of zone data is disabled. Skipping.");
          }

          const autoEnabled = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'autoImportEnabled'");
          const lastState = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'lastImportedState'");

          if (autoEnabled?.value === "false") {
            log.info("Auto-import is disabled. Skipping automatic bulk import.");
          } else if (!lastState?.value) {
            log.info("No lastImportedState set. Skipping automatic bulk import. An admin must run a manual import first.");
          } else {
            log.info(`Auto-importing sites for state: ${lastState.value}`);
            try {
              const { triggerBulkImport } = await import("../routes/sites/bulkImport.js");
              const importResult = await triggerBulkImport(lastState.value);
              if (importResult.started) {
                log.info(`Auto bulk import started for ${lastState.value}`);
              } else {
                log.error(`Auto bulk import failed to start: ${importResult.error}`);
              }
            } catch (e: any) {
              log.error(`Auto bulk import error: ${e.message}`);
            }
          }
        } else {
          log.info(`Scheduled version check: no change (${result.detectedVersion})`);
        }
      } catch (e: any) {
        log.error(`Scheduled version check failed unexpectedly: ${e.message}`);
      }
    }

    const submissionEnabled = await getSetting("submissionNotifyEnabled", "true");
    if (submissionEnabled !== "false") {
      const targetHour = await getSettingInt("submissionNotifyHour", 19);
      if (currentHour === targetHour) {
        log.info("Running scheduled submission notification check...");
        await checkAndNotifySubmissions();
      }
    }

    const driveSyncHour = await getSettingInt("schedDriveSyncHour", 4);
    const driveSyncMinute = await getSettingInt("schedDriveSyncMinute", 0);
    if (currentHour === driveSyncHour && currentMinute === driveSyncMinute) {
      await runDriveSync();
    }
  }, {
    timezone: "Australia/Melbourne",
  });

  // Expired admin session cleanup: runs daily at 3:00am Melbourne time.
  // This sweeps rows that were never explicitly logged out and whose TTL has
  // elapsed, preventing unbounded table growth.
  cron.schedule("0 3 * * *", async () => {
    try {
      await cleanExpiredSessions();
      log.info("Expired admin session cleanup completed");
    } catch (e: any) {
      log.error(`Expired admin session cleanup failed: ${e.message}`);
    }
  }, { timezone: "Australia/Melbourne" });
  log.info("Admin session cleanup scheduled: 3:00am Melbourne time");

  log.info("Scheduled jobs started: hourly cron checks all configurable task times (Melbourne time)");
}
