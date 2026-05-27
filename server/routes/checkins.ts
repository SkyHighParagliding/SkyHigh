import { Router } from "express";
import { query, queryOne, execute } from "../pg.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

interface CheckinRow {
  id: string;
  siteId: string;
  timestamp: string;
  siteName: string | null;
}

interface StatsRow {
  siteName: string | null;
  count: number;
}

interface CountRow {
  count: number;
}

const checkinRateLimit = new Map<string, { count: number; resetAt: number }>();
const CHECKIN_RATE_LIMIT_WINDOW = 60 * 1000;
const CHECKIN_RATE_LIMIT_MAX = 5;

router.get("/", asyncHandler(async (req, res) => {
  const checkins = await query<CheckinRow>(
    `SELECT c.id, c."siteId", c.timestamp, s.name as "siteName"
       FROM checkins c
       LEFT JOIN sites s ON c."siteId" = s.id
       ORDER BY c.timestamp DESC
       LIMIT 100`
  );
  res.json(checkins);
}));

router.get("/stats", asyncHandler(async (req, res) => {
  const stats = await query<StatsRow>(
    `SELECT s.name as "siteName", COUNT(c.id)::int as count
       FROM checkins c
       LEFT JOIN sites s ON c."siteId" = s.id
       GROUP BY c."siteId", s.name
       ORDER BY count DESC`
  );
  const totalRow = await queryOne<CountRow>(
    `SELECT COUNT(*)::int as count FROM checkins`
  );
  const todayRow = await queryOne<CountRow>(
    `SELECT COUNT(*)::int as count FROM checkins WHERE DATE(timestamp) = CURRENT_DATE`
  );
  res.json({
    total: totalRow?.count ?? 0,
    today: todayRow?.count ?? 0,
    bySite: stats
  });
}));

router.post("/", asyncHandler(async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const entry = checkinRateLimit.get(ip);
  if (entry && now < entry.resetAt) {
    if (entry.count >= CHECKIN_RATE_LIMIT_MAX) {
      return res.status(429).json({ error: "Too many check-ins. Please wait before submitting another." });
    }
    entry.count++;
  } else {
    checkinRateLimit.set(ip, { count: 1, resetAt: now + CHECKIN_RATE_LIMIT_WINDOW });
  }

  const { siteId } = req.body;
  if (!siteId) return res.status(400).json({ error: "siteId is required" });
  const id = "FL-" + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  await execute(
    `INSERT INTO checkins (id, "siteId") VALUES ($1, $2)`,
    [id, siteId]
  );
  const checkin = await queryOne<CheckinRow>(
    `SELECT id, "siteId" as "siteId", timestamp FROM checkins WHERE id = $1`,
    [id]
  );
  res.status(201).json({ success: true, checkin });
}));

export default router;
