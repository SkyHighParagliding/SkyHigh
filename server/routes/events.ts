import { Router } from "express";
import { queryOne } from "../pg.js";
import asyncHandler from "../utils/asyncHandler.js";
import createLogger from "../utils/logger.js";

const log = createLogger("events");
const router = Router();

let cachedEvents: any[] | null = null;
let cacheTimestamp = 0;

async function getCacheTtl(): Promise<number> {
  const row = await queryOne<{ value: string }>(
    "SELECT value FROM settings WHERE key = $1",
    ["cacheTidyHqEventsTtl"]
  );
  const minutes = parseInt(row?.value ?? "5", 10);
  return minutes * 60 * 1000;
}

async function fetchTidyHQEvents(): Promise<any[]> {
  const now = Date.now();
  const cacheTtl = await getCacheTtl();
  if (cachedEvents && (now - cacheTimestamp) < cacheTtl) {
    return cachedEvents;
  }

  const response = await fetch('https://skyhigh.tidyhq.com/api/v1/events');
  if (!response.ok) {
    throw new Error(`TidyHQ API responded with status: ${response.status}`);
  }
  const data = await response.json();
  cachedEvents = data;
  cacheTimestamp = now;
  return data;
}

fetchTidyHQEvents().catch(e => log.warn("Initial events fetch failed", e?.message));

router.get("/", asyncHandler(async (req, res) => {
  try {
    const data = await fetchTidyHQEvents();
    res.json(data);
  } catch (e: any) {
    log.error("Failed to fetch events from TidyHQ", e?.message);
    if (cachedEvents) {
      res.json(cachedEvents);
    } else {
      res.status(500).json({ error: "Failed to fetch events" });
    }
  }
}));

function parseTidyHQDate(dateStr: string): Date {
  const normalized = dateStr.replace(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{2})(\d{2})$/,
    '$1T$2$3:$4'
  );
  return new Date(normalized);
}

function normalizeEventDates(event: any) {
  return {
    ...event,
    start_at_iso: event.start_at ? parseTidyHQDate(event.start_at).toISOString() : null,
    end_at_iso: event.end_at ? parseTidyHQDate(event.end_at).toISOString() : null,
  };
}

router.get("/upcoming", asyncHandler(async (req, res) => {
  const data = await fetchTidyHQEvents();
  const now = new Date();
  const upcoming = data
    .filter(e => parseTidyHQDate(e.end_at) > now)
    .sort((a, b) => parseTidyHQDate(a.start_at).getTime() - parseTidyHQDate(b.start_at).getTime())
    .slice(0, 3)
    .map(normalizeEventDates);
  res.json(upcoming);
}));

export default router;
