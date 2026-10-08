import { Router } from "express";
import { query, queryOne, execute } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";
import { publicUrl } from "../storage.js";
import { variantKeys } from "../webcams/keys.js";
import { pairByTime } from "../webcams/pairing.js";
import { feedStatus } from "../webcams/status.js";
import { isValidTimeZone, isValidYmd, ymdInZone } from "../webcams/timeUtil.js";
import { getSource, getSourceBySite, listSources, type WebcamSource } from "../webcams/sources.js";
import { isIngestRunning, runIngest } from "../webcams/ingest.js";
import { getRetentionDays, runCleanup } from "../webcams/cleanup.js";
import { getArchiveTotals } from "../webcams/usageAlert.js";

const router = Router();

interface FrameRow {
  camera: string;
  capturedAt: Date;
  keyBase: string;
}

const CAMERA_LABELS: Record<string, string> = { north: "North", south: "South" };

function cameraLabel(camera: string): string {
  return CAMERA_LABELS[camera] ?? camera.charAt(0).toUpperCase() + camera.slice(1);
}

function imageUrls(keyBase: string) {
  const k = variantKeys(keyBase);
  return { thumb: publicUrl(k.thumb), medium: publicUrl(k.medium), original: publicUrl(k.original) };
}

function statusFor(source: WebcamSource, newest: Date | null) {
  return feedStatus({
    newest,
    now: new Date(),
    tz: source.timezone,
    expectFromMin: source.expectFromMin,
    expectToMin: source.expectToMin,
  });
}

// ─── Public ───────────────────────────────────────────────────────────────────

router.get("/sites", asyncHandler(async (_req, res) => {
  const rows = await query<{ siteId: string; label: string; siteName: string | null }>(
    `SELECT ws."siteId", ws.label, s.name AS "siteName"
     FROM webcam_sources ws LEFT JOIN sites s ON s.id = ws."siteId"
     WHERE ws.enabled ORDER BY ws.label`,
  );
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.json(rows);
}));

router.get("/:siteId/latest", asyncHandler(async (req, res) => {
  const source = await getSourceBySite(req.params.siteId);
  if (!source || !source.enabled) return res.status(404).json({ error: "No cameras for this site" });

  const rows = await query<FrameRow>(
    `SELECT DISTINCT ON (camera) camera, "capturedAt", "keyBase"
     FROM webcam_frames WHERE "sourceId" = $1 ORDER BY camera, "capturedAt" DESC`,
    [source.id],
  );
  const newest = rows.reduce<Date | null>((acc, r) => (!acc || r.capturedAt > acc ? r.capturedAt : acc), null);

  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
  res.json({
    siteId: source.siteId,
    label: source.label,
    timezone: source.timezone,
    status: statusFor(source, newest),
    newestAt: newest,
    expectFromMin: source.expectFromMin,
    expectToMin: source.expectToMin,
    cameras: rows.map(r => ({
      camera: r.camera,
      label: cameraLabel(r.camera),
      capturedAt: r.capturedAt,
      ...imageUrls(r.keyBase),
    })),
  });
}));

router.get("/:siteId/days", asyncHandler(async (req, res) => {
  const source = await getSourceBySite(req.params.siteId);
  if (!source || !source.enabled) return res.status(404).json({ error: "No cameras for this site" });

  const rows = await query<{ day: string; camera: string; n: number; first: Date; last: Date }>(
    `SELECT "localDay" AS day, camera, COUNT(*)::int AS n, MIN("capturedAt") AS first, MAX("capturedAt") AS last
     FROM webcam_frames WHERE "sourceId" = $1 GROUP BY "localDay", camera ORDER BY "localDay" DESC`,
    [source.id],
  );
  const days = new Map<string, { day: string; frames: number; first: Date; last: Date }>();
  for (const r of rows) {
    const d = days.get(r.day);
    if (!d) days.set(r.day, { day: r.day, frames: r.n, first: r.first, last: r.last });
    else {
      d.frames = Math.max(d.frames, r.n);
      if (r.first < d.first) d.first = r.first;
      if (r.last > d.last) d.last = r.last;
    }
  }
  res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
  res.json({ timezone: source.timezone, retentionDays: await getRetentionDays(), days: [...days.values()] });
}));

router.get("/:siteId/day/:ymd", asyncHandler(async (req, res) => {
  const { ymd } = req.params;
  if (!isValidYmd(ymd)) return res.status(400).json({ error: "Day must be YYYYMMDD" });
  const source = await getSourceBySite(req.params.siteId);
  if (!source || !source.enabled) return res.status(404).json({ error: "No cameras for this site" });

  const rows = await query<FrameRow>(
    `SELECT camera, "capturedAt", "keyBase" FROM webcam_frames
     WHERE "sourceId" = $1 AND "localDay" = $2 ORDER BY "capturedAt"`,
    [source.id, ymd],
  );
  const groups = pairByTime(rows.map(r => ({ ...r, ts: r.capturedAt.getTime() })));
  const cameras = [...new Set(rows.map(r => r.camera))].sort();

  const isToday = ymd === ymdInZone(new Date(), source.timezone);
  res.set("Cache-Control", isToday ? "public, max-age=60, stale-while-revalidate=120" : "public, max-age=3600");
  res.json({
    day: ymd,
    timezone: source.timezone,
    cameras: cameras.map(c => ({ camera: c, label: cameraLabel(c) })),
    frames: groups.map(g => ({
      t: new Date(g.ts).toISOString(),
      images: Object.fromEntries(
        Object.entries(g.frames).map(([camera, r]) => [camera, { at: r.capturedAt, ...imageUrls(r.keyBase) }]),
      ),
    })),
  });
}));

// ─── Admin ────────────────────────────────────────────────────────────────────

router.get("/admin/sources", requireAuth, asyncHandler(async (_req, res) => {
  const sources = await listSources();
  const out = [];
  for (const source of sources) {
    const stats = await queryOne<{ n: number; bytes: string; oldest: Date | null; newest: Date | null }>(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(bytes), 0)::bigint AS bytes, MIN("capturedAt") AS oldest, MAX("capturedAt") AS newest
       FROM webcam_frames WHERE "sourceId" = $1`,
      [source.id],
    );
    out.push({
      ...source,
      frames: stats?.n ?? 0,
      bytes: Number(stats?.bytes ?? 0),
      oldest: stats?.oldest ?? null,
      newest: stats?.newest ?? null,
      status: statusFor(source, stats?.newest ?? null),
      running: isIngestRunning(source.id),
    });
  }
  res.set("Cache-Control", "no-store");
  res.json({ retentionDays: await getRetentionDays(), totals: await getArchiveTotals(), sources: out });
}));

function intInRange(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

router.put("/admin/sources/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const current = Number.isFinite(id) ? await getSource(id) : undefined;
  if (!current) return res.status(404).json({ error: "Source not found" });

  const b = req.body ?? {};
  const sets: string[] = [];
  const params: unknown[] = [];
  const add = (column: string, value: unknown) => { params.push(value); sets.push(`"${column}" = $${params.length}`); };

  if (b.label !== undefined) {
    if (typeof b.label !== "string" || !b.label.trim() || b.label.length > 80) return res.status(400).json({ error: "Label must be 1-80 characters" });
    add("label", b.label.trim());
  }
  if (b.baseUrl !== undefined) {
    let u: URL;
    try { u = new URL(String(b.baseUrl)); } catch { return res.status(400).json({ error: "Base URL is not a valid URL" }); }
    if (u.protocol !== "https:") return res.status(400).json({ error: "Base URL must be https" });
    add("baseUrl", u.toString());
  }
  if (b.timezone !== undefined) {
    if (typeof b.timezone !== "string" || !isValidTimeZone(b.timezone)) return res.status(400).json({ error: "Unknown time zone" });
    add("timezone", b.timezone);
  }
  if (b.enabled !== undefined) {
    if (typeof b.enabled !== "boolean") return res.status(400).json({ error: "enabled must be true or false" });
    add("enabled", b.enabled);
  }
  const pollStart = b.pollStartHour !== undefined ? intInRange(b.pollStartHour, 0, 23) : current.pollStartHour;
  const pollEnd = b.pollEndHour !== undefined ? intInRange(b.pollEndHour, 1, 24) : current.pollEndHour;
  if (pollStart === null || pollEnd === null || pollStart >= pollEnd) return res.status(400).json({ error: "Polling hours must be 0-23 start and 1-24 end, start before end" });
  if (b.pollStartHour !== undefined) add("pollStartHour", pollStart);
  if (b.pollEndHour !== undefined) add("pollEndHour", pollEnd);
  const expFrom = b.expectFromMin !== undefined ? intInRange(b.expectFromMin, 0, 1439) : current.expectFromMin;
  const expTo = b.expectToMin !== undefined ? intInRange(b.expectToMin, 1, 1440) : current.expectToMin;
  if (expFrom === null || expTo === null || expFrom >= expTo) return res.status(400).json({ error: "Expected capture window must be valid minutes, start before end" });
  if (b.expectFromMin !== undefined) add("expectFromMin", expFrom);
  if (b.expectToMin !== undefined) add("expectToMin", expTo);

  if (sets.length === 0) return res.status(400).json({ error: "Nothing to update" });
  params.push(id);
  await execute(`UPDATE webcam_sources SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
  res.json(await getSource(id));
}));

router.post("/admin/sources/:id/run", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const source = Number.isFinite(id) ? await getSource(id) : undefined;
  if (!source) return res.status(404).json({ error: "Source not found" });
  if (isIngestRunning(id)) return res.status(409).json({ error: "An ingest run is already in progress" });
  runIngest(id, { force: true }).catch(() => {});
  res.json({ started: true });
}));

router.post("/admin/cleanup", requireAuth, asyncHandler(async (req, res) => {
  const dryRun = req.body?.dryRun !== false;
  res.json(await runCleanup({ dryRun }));
}));

export default router;
