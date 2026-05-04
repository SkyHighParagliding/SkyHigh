import cron from "node-cron";
import createLogger from "./logger.js";
import { runVersionCheck } from "./siteguideVersionCheck.js";
import { sendEmail } from "./email.js";
import db from "../db.js";

const log = createLogger("scheduled-jobs");

async function getSetting(key: string, fallback: string): Promise<string> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value || fallback;
}

async function getSettingInt(key: string, fallback: number): Promise<number> {
  const val = parseInt(await getSetting(key, String(fallback)), 10);
  return Number.isFinite(val) ? val : fallback;
}

async function checkAndNotifySubmissions() {
  try {
    const jobStart = new Date().toISOString();
    const lastNotified = await db.prepare("SELECT value FROM settings WHERE key = 'lastSubmissionNotification'").get() as { value: string } | undefined;
    const since = lastNotified?.value || "2000-01-01T00:00:00";

    const pending = await db.prepare(
      "SELECT COUNT(*) as count FROM image_submissions WHERE status = 'pending' AND submittedAt > ? AND submittedAt <= ?"
    ).get(since, jobStart) as { count: number };

    if (pending.count === 0) {
      log.info("No new submissions since last notification — skipping email");
      return;
    }

    const socialMediaContacts = await db.prepare(
      "SELECT name, surname, email FROM contacts WHERE isSocialMedia = 1 AND email != '' AND email IS NOT NULL"
    ).all() as { name: string; surname: string; email: string }[];

    if (socialMediaContacts.length === 0) {
      log.info("No Social Media contacts configured — skipping submission notification");
      return;
    }

    const totalPending = await db.prepare(
      "SELECT COUNT(*) as count FROM image_submissions WHERE status = 'pending'"
    ).get() as { count: number };

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
      await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('lastSubmissionNotification', ?)").run(jobStart);
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
      await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('driveSyncLastRun', ?)").run(new Date().toISOString());
    } else {
      log.error(`Scheduled Drive sync failed: ${result.error}`);
    }
  } catch (e: any) {
    log.error(`Scheduled Drive sync error: ${e.message}`);
  }
}

async function fetchVictoriaGridDaily() {
  const ts = new Date().toISOString();
  try {
    const { fetchVictoriaGrid } = await import("../victoriaGrid.js");
    await fetchVictoriaGrid(true);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("victoriaGridLastRun", ts);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("victoriaGridLastResult", "ok");
    log.info("Victoria grid daily fetch completed");
  } catch (e: any) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("victoriaGridLastRun", ts);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("victoriaGridLastResult", e.message || "Unknown error");
    log.error(`Victoria grid daily fetch failed: ${e.message}`);
  }
}

async function fetchWideGridDaily() {
  const ts = new Date().toISOString();
  try {
    const { fetchWideGrid } = await import("../victoriaGrid.js");
    await fetchWideGrid(true);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("wideGridLastRun", ts);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("wideGridLastResult", "ok");
    log.info("Wide grid daily fetch completed");
  } catch (e: any) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("wideGridLastRun", ts);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("wideGridLastResult", e.message || "Unknown error");
    log.error(`Wide grid daily fetch failed: ${e.message}`);
  }
}

export async function startScheduledJobs() {
  // Daily wind grid pre-fetches: Victoria at 5:00am, Wide at 5:13am (Melbourne time)
  cron.schedule("0 5 * * *", fetchVictoriaGridDaily, { timezone: "Australia/Melbourne" });
  log.info("Victoria grid daily fetch scheduled: 5:00am Melbourne time");

  cron.schedule("13 5 * * *", fetchWideGridDaily, { timezone: "Australia/Melbourne" });
  log.info("Wide grid daily fetch scheduled: 5:13am Melbourne time");

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

          const autoEnabled = await db.prepare("SELECT value FROM settings WHERE key = 'autoImportEnabled'").get() as { value: string } | undefined;
          const lastState = await db.prepare("SELECT value FROM settings WHERE key = 'lastImportedState'").get() as { value: string } | undefined;

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

  log.info("Scheduled jobs started: hourly cron checks all configurable task times (Melbourne time)");
}
