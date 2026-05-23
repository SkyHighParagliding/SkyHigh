import { Router } from "express";
import db from "../../db.js";
import { requireAuth } from "../../middleware/auth.js";
import { invalidateSitesCache } from "./helpers.js";

const router = Router();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Public: sites whose 7-day banner window is currently active
// Must be registered before /:id routes to avoid being swallowed by the param matcher
router.get("/closure-banners", async (_req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const rows = await db.prepare(`
      SELECT scd.site_id, s.name AS site_name,
             MIN(scd.closure_date) AS first_date,
             MAX(scd.closure_date) AS last_date
      FROM site_closure_dates scd
      JOIN sites s ON scd.site_id = s.id
      WHERE scd.closure_date >= ?
        AND s.status NOT IN ('closed', 'restricted')
      GROUP BY scd.site_id, s.name
    `).all(today) as { site_id: string; site_name: string; first_date: string; last_date: string }[];

    const active = rows.filter(r => {
      const first = new Date(r.first_date + 'T12:00:00');
      const bannerStart = new Date(first);
      bannerStart.setDate(first.getDate() - 7);
      return new Date(today + 'T12:00:00') >= bannerStart;
    });

    res.json(active.map(r => ({
      siteId: r.site_id,
      siteName: r.site_name,
      firstDate: r.first_date,
      lastDate: r.last_date,
    })));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Public: get all current+future closure dates for a site (next 60 days)
router.get("/:id/closure-dates", async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const rows = await db.prepare(
      "SELECT closure_date FROM site_closure_dates WHERE site_id = ? AND closure_date >= ? ORDER BY closure_date ASC"
    ).all(req.params.id, today) as { closure_date: string }[];
    res.json(rows.map(r => r.closure_date));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: replace all closure dates for a site
router.put("/:id/closure-dates", requireAuth, async (req, res) => {
  try {
    const { dates } = req.body as { dates: string[] };
    if (!Array.isArray(dates)) return res.status(400).json({ error: "dates must be an array" });
    if (dates.some(d => !ISO_DATE.test(d))) return res.status(400).json({ error: "All dates must be YYYY-MM-DD format" });

    await db.prepare("DELETE FROM site_closure_dates WHERE site_id = ?").run(req.params.id);
    for (const date of dates) {
      await db.prepare(
        "INSERT INTO site_closure_dates (site_id, closure_date) VALUES (?, ?) ON CONFLICT DO NOTHING"
      ).run(req.params.id, date);
    }

    invalidateSitesCache();
    res.json({ success: true, count: dates.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
