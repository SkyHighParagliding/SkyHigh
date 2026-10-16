import { execute, query } from "../pg.js";
import createLogger from "../utils/logger.js";
import { keyBaseLocalTime } from "./keys.js";
import type { WebcamSource } from "./sources.js";
import { localToUtc } from "./timeUtil.js";

const log = createLogger("webcams");
const BATCH = 1000;

export interface StampRow {
  id: string;
  camera: string;
  localDay: string;
  keyBase: string;
  capturedAt: Date;
}

/**
 * Recomputes each frame's capture instant from the camera wall-clock time kept
 * in its key base, under the source's current time zone and per-camera DST
 * setting. Returns only the rows whose stored instant is wrong.
 */
export function restampChanges(
  rows: StampRow[],
  tz: string,
  clockNoDst: Partial<Record<string, boolean>>,
): { id: string; capturedAt: Date }[] {
  const out: { id: string; capturedAt: Date }[] = [];
  for (const r of rows) {
    const hms = keyBaseLocalTime(r.keyBase);
    if (!hms) continue;
    const t = localToUtc(r.localDay, hms, tz, clockNoDst[r.camera] === true);
    if (Number.isNaN(t.getTime()) || t.getTime() === new Date(r.capturedAt).getTime()) continue;
    out.push({ id: r.id, capturedAt: t });
  }
  return out;
}

/**
 * Brings every stored frame of a source in line with its clock settings. Safe to
 * run any time: frames that are already right are left alone.
 */
export async function restampSource(source: Pick<WebcamSource, "id" | "siteId" | "timezone" | "clockNoDst">): Promise<number> {
  const rows = await query<StampRow>(
    `SELECT id::text AS id, camera, "localDay", "keyBase", "capturedAt" FROM webcam_frames WHERE "sourceId" = $1`,
    [source.id],
  );
  const changes = restampChanges(rows, source.timezone, source.clockNoDst ?? {});
  for (let i = 0; i < changes.length; i += BATCH) {
    const chunk = changes.slice(i, i + BATCH);
    await execute(
      `UPDATE webcam_frames AS f SET "capturedAt" = v.t
       FROM unnest($1::bigint[], $2::timestamptz[]) AS v(id, t)
       WHERE f.id = v.id`,
      [chunk.map(c => c.id), chunk.map(c => c.capturedAt.toISOString())],
    );
  }
  if (changes.length > 0) log.info(`Webcam ${source.siteId}: re-timed ${changes.length} images to match the camera clock settings`);
  return changes.length;
}
