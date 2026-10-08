import cron from "node-cron";
import createLogger from "../utils/logger.js";
import { runCleanup } from "./cleanup.js";
import { runIngest } from "./ingest.js";
import { listSources, type WebcamSource } from "./sources.js";
import { minutesOfDayInZone } from "./timeUtil.js";
import { checkWebcamStorage } from "./usageAlert.js";

const log = createLogger("webcams");

/** True when the source should be polled right now (inside its window, or still backfilling). */
export function shouldPoll(source: WebcamSource, now: Date): boolean {
  if (!source.enabled) return false;
  if (!source.backfilledAt) return true;
  const hour = Math.floor(minutesOfDayInZone(now, source.timezone) / 60);
  return hour >= source.pollStartHour && hour < source.pollEndHour;
}

async function pollAll() {
  const now = new Date();
  for (const source of await listSources()) {
    if (shouldPoll(source, now)) await runIngest(source.id);
  }
}

/**
 * Camera ingest every 3 minutes and a nightly cleanup. Only active in production
 * (or with WEBCAM_INGEST=1) so developer machines do not poll the operator or fill
 * their local uploads folder; the admin "Run now" button works anywhere.
 */
export function startWebcamJobs() {
  if (process.env.NODE_ENV !== "production" && process.env.WEBCAM_INGEST !== "1") {
    log.info("Webcam jobs not started (not production; set WEBCAM_INGEST=1 to enable)");
    return;
  }

  cron.schedule("*/3 * * * *", () => { pollAll().catch(e => log.error(`Webcam poll failed: ${e.message}`)); }, { timezone: "Australia/Melbourne" });
  cron.schedule("30 3 * * *", async () => {
    try {
      await runCleanup();
      await checkWebcamStorage();
    } catch (e: any) {
      log.error(`Webcam cleanup failed: ${e.message}`);
    }
  }, { timezone: "Australia/Melbourne" });
  setTimeout(() => { pollAll().catch(e => log.error(`Webcam startup poll failed: ${e.message}`)); }, 45_000);
  log.info("Webcam jobs scheduled: ingest every 3 min, cleanup 3:30am Melbourne time");
}
