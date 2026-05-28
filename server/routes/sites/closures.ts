import { Router } from "express";
import { query, execute, transaction } from "../../pg.js";
import { requireAuth } from "../../middleware/auth.js";
import { invalidateSitesCache } from "./helpers.js";

const router = Router();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Public: sites whose 7-day banner window is currently active
// Must be registered before /:id routes to avoid being swallowed by the param matcher
router.get("/closure-banners", async (_req, res) => {
  try {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });

    const rows = await query<{ site_id: string; site_name: string; first_date: string; last_date: string }>(
      `SELECT scd.site_id, s.name AS site_name,
              MIN(scd.closure_date) AS first_date,
              MAX(scd.closure_date) AS last_date
       FROM site_closure_dates scd
       JOIN sites s ON scd.site_id = s.id
       WHERE scd.closure_date >= $1
         AND s.status NOT IN ('closed', 'restricted')
       GROUP BY scd.site_id, s.name`,
      [todayStr]
    );

    const active = rows.filter(r => {
      const bannerStart = new Date(r.first_date);
      bannerStart.setDate(bannerStart.getDate() - 7);
      const bannerStartStr = bannerStart.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
      return todayStr >= bannerStartStr;
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
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
    const rows = await query<{ closure_date: string }>(
      "SELECT closure_date FROM site_closure_dates WHERE site_id = $1 AND closure_date >= $2 ORDER BY closure_date ASC",
      [req.params.id, today]
    );
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

    await transaction(async (client) => {
      await client.query("DELETE FROM site_closure_dates WHERE site_id = $1", [req.params.id]);
      if (dates.length > 0) {
        // Bulk insert all dates in a single query using unnest to avoid N+1
        await client.query(
          `INSERT INTO site_closure_dates (site_id, closure_date)
           SELECT $1, unnest($2::text[])
           ON CONFLICT DO NOTHING`,
          [req.params.id, dates]
        );
      }
    });

    invalidateSitesCache();
    res.json({ success: true, count: dates.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
