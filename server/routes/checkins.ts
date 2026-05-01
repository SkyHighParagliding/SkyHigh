import { Router } from "express";
import db from "../db.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const checkins = await db.prepare(`
    SELECT c.id, c.siteId, c.timestamp, s.name as siteName 
    FROM checkins c
    LEFT JOIN sites s ON c.siteId = s.id
    ORDER BY c.timestamp DESC
    LIMIT 100
  `).all();
  res.json(checkins);
}));

router.get("/stats", asyncHandler(async (req, res) => {
  const stats = await db.prepare(`
    SELECT s.name as siteName, COUNT(c.id) as count
    FROM checkins c
    LEFT JOIN sites s ON c.siteId = s.id
    GROUP BY c.siteId
    ORDER BY count DESC
  `).all();
  const total = await db.prepare("SELECT COUNT(*) as count FROM checkins").get() as { count: number };
  const today = await db.prepare("SELECT COUNT(*) as count FROM checkins WHERE timestamp::date = CURRENT_DATE").get() as { count: number };
  res.json({ total: total.count, today: today.count, bySite: stats });
}));

router.post("/", asyncHandler(async (req, res) => {
  const { siteId } = req.body;
  if (!siteId) return res.status(400).json({ error: "siteId is required" });
  const id = "FL-" + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  await db.prepare("INSERT INTO checkins (id, siteId) VALUES (@id, @siteId)").run({ id, siteId });
  const checkin = await db.prepare("SELECT * FROM checkins WHERE id = ?").get(id);
  res.status(201).json({ success: true, checkin });
}));

export default router;
