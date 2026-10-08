import sharp from "sharp";
import { query, execute } from "../pg.js";
import { saveFile } from "../storage.js";
import createLogger from "../utils/logger.js";
import { fetchDayList, fetchImage, parseDayFrames, resolveImageUrl, type ProviderFrame } from "./airportweathercams.js";
import { frameKeyBase, variantKeys } from "./keys.js";
import { getSource } from "./sources.js";
import { shiftYmd, ymdInZone } from "./timeUtil.js";

const log = createLogger("webcams");

const BACKFILL_DAYS = 8;
const MAX_FRAMES_PER_RUN = 60;
const RUN_BUDGET_MS = 150_000;
const IMAGE_GAP_MS = 250;
const MAX_FAILURES_PER_PATH = 5;
const CONSECUTIVE_FAILURE_LIMIT = 3;

const running = new Set<number>();
const failureCounts = new Map<string, number>();

export interface IngestResult {
  sourceId: number;
  skipped?: "busy" | "disabled" | "missing";
  listed: number;
  pending: number;
  stored: number;
  failed: number;
  remaining: number;
  error?: string;
}

export function isIngestRunning(sourceId: number): boolean {
  return running.has(sourceId);
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

async function storeFrame(source: { id: number; siteId: string; baseUrl: string }, ymd: string, frame: ProviderFrame): Promise<void> {
  const original = await fetchImage(resolveImageUrl(source.baseUrl, frame.path));
  const [thumb, medium] = await Promise.all([
    sharp(original, { failOn: "none" }).resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 70, mozjpeg: true }).toBuffer(),
    sharp(original, { failOn: "none" }).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer(),
  ]);
  const keyBase = frameKeyBase(source.siteId, ymd, frame.camera, frame.localTime);
  const keys = variantKeys(keyBase);
  await saveFile(thumb, keys.thumb);
  await saveFile(medium, keys.medium);
  await saveFile(original, keys.original);
  await execute(
    `INSERT INTO webcam_frames ("sourceId", camera, "capturedAt", "localDay", "sourcePath", "keyBase", bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT ("sourceId", "sourcePath") DO NOTHING`,
    [source.id, frame.camera, frame.capturedAt.toISOString(), ymd, frame.path, keyBase, thumb.length + medium.length + original.length],
  );
}

/**
 * Pulls any images the operator lists that we have not archived yet. Safe to run
 * repeatedly: rows are keyed by the operator's file path, so a re-run (or a late
 * frame) never duplicates anything. Until the first full pass completes it also
 * backfills every day the operator still lists, newest first.
 */
export async function runIngest(sourceId: number, opts: { force?: boolean } = {}): Promise<IngestResult> {
  const result: IngestResult = { sourceId, listed: 0, pending: 0, stored: 0, failed: 0, remaining: 0 };
  if (running.has(sourceId)) return { ...result, skipped: "busy" };
  const source = await getSource(sourceId);
  if (!source) return { ...result, skipped: "missing" };
  if (!source.enabled && !opts.force) return { ...result, skipped: "disabled" };

  running.add(sourceId);
  const started = Date.now();
  try {
    await execute(`UPDATE webcam_sources SET "lastRunAt" = NOW() WHERE id = $1`, [sourceId]);

    const today = ymdInZone(new Date(), source.timezone);
    const backfilling = !source.backfilledAt;
    const days = backfilling ? Array.from({ length: BACKFILL_DAYS }, (_, i) => shiftYmd(today, -i)) : [today];

    const pending: { ymd: string; frame: ProviderFrame }[] = [];
    for (const ymd of days) {
      const list = await fetchDayList(source.baseUrl, ymd);
      if (list.status !== "ok") {
        if (ymd === today) throw new Error(list.status === "http" ? `Feed returned HTTP ${list.code}` : `Feed unreachable: ${list.message}`);
        continue;
      }
      const frames = parseDayFrames(list.json, ymd, source.timezone);
      if (frames === null) {
        if (ymd === today) throw new Error("Feed returned an unexpected format");
        continue;
      }
      const have = new Set(
        (await query<{ sourcePath: string }>(
          `SELECT "sourcePath" FROM webcam_frames WHERE "sourceId" = $1 AND "localDay" = $2`,
          [sourceId, ymd],
        )).map(r => r.sourcePath),
      );
      result.listed += frames.length;
      frames
        .filter(f => !have.has(f.path) && (failureCounts.get(f.path) ?? 0) < MAX_FAILURES_PER_PATH)
        .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())
        .forEach(frame => pending.push({ ymd, frame }));
    }
    result.pending = pending.length;

    let consecutiveFailures = 0;
    for (const { ymd, frame } of pending) {
      if (result.stored + result.failed >= MAX_FRAMES_PER_RUN || Date.now() - started > RUN_BUDGET_MS) break;
      try {
        await storeFrame(source, ymd, frame);
        result.stored++;
        consecutiveFailures = 0;
        failureCounts.delete(frame.path);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        result.failed++;
        consecutiveFailures++;
        failureCounts.set(frame.path, (failureCounts.get(frame.path) ?? 0) + 1);
        log.warn(`Frame ${frame.path} failed: ${message}`);
        if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) throw new Error(`Image download failing: ${message}`);
      }
      await sleep(IMAGE_GAP_MS);
    }
    result.remaining = pending.length - result.stored - result.failed;

    await execute(`UPDATE webcam_sources SET "lastSuccessAt" = NOW(), "lastError" = NULL WHERE id = $1`, [sourceId]);
    if (backfilling && result.remaining === 0) {
      await execute(`UPDATE webcam_sources SET "backfilledAt" = NOW() WHERE id = $1`, [sourceId]);
      log.info(`Webcam backfill complete for ${source.siteId}`);
    }
    if (result.stored > 0) log.info(`Webcam ${source.siteId}: stored ${result.stored}, failed ${result.failed}, remaining ${result.remaining}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    result.error = message;
    log.error(`Webcam ingest for source ${sourceId} failed: ${message}`);
    await execute(`UPDATE webcam_sources SET "lastError" = $2 WHERE id = $1`, [sourceId, message.slice(0, 500)]).catch(() => {});
  } finally {
    running.delete(sourceId);
  }
  return result;
}
