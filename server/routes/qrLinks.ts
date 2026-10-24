import { Router, type Request, type Response } from "express";
import { query, queryOne, execute } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

/**
 * QR Links (TASK-043): named, redirectable QR codes. The printed QR encodes
 * /go/<slug>; the slug never changes once created, the destination can.
 * Admin CRUD lives under /api/qr-links; the public redirect is goRedirect,
 * mounted at /go/:slug in server.ts.
 */

const router = Router();

interface QrLinkRow {
  slug: string;
  title: string;
  destination: string;
  enabled: boolean;
  note: string;
  scans: number;
  lastScanAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS = `slug, title, destination, enabled, note, scans, "lastScanAt", "createdAt", "updatedAt"`;

/** Lower-case letters, digits and dashes: short and safe to print in a QR. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** An in-site path ("/sites/mystic") or a full http(s) address. */
function validDestination(d: unknown): d is string {
  if (typeof d !== "string") return false;
  const s = d.trim();
  if (s.startsWith("/")) return !s.startsWith("//") && !s.includes("\\");
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

router.get("/", requireAuth, asyncHandler(async (_req, res) => {
  res.json(await query<QrLinkRow>(`SELECT ${COLUMNS} FROM qr_links ORDER BY slug`));
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const { slug, title, destination, enabled, note } = req.body ?? {};
  const s = typeof slug === "string" ? slug.trim().toLowerCase() : "";
  if (!SLUG_RE.test(s)) return res.status(400).json({ error: "Link name: lower-case letters, numbers and dashes only (e.g. voyager-poster)" });
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required" });
  if (!validDestination(destination)) return res.status(400).json({ error: "Destination must start with / (a page on this site) or https://" });
  if (await queryOne(`SELECT slug FROM qr_links WHERE slug = $1`, [s])) return res.status(409).json({ error: `A link called "${s}" already exists` });
  await execute(
    `INSERT INTO qr_links (slug, title, destination, enabled, note) VALUES ($1, $2, $3, $4, $5)`,
    [s, String(title).trim(), destination.trim(), enabled !== false, String(note ?? "").trim()],
  );
  res.status(201).json(await queryOne<QrLinkRow>(`SELECT ${COLUMNS} FROM qr_links WHERE slug = $1`, [s]));
}));

// The slug is printed in the QR, so it can't be edited; only what it points at.
router.put("/:slug", requireAuth, asyncHandler(async (req, res) => {
  const { title, destination, enabled, note } = req.body ?? {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Title is required" });
  if (!validDestination(destination)) return res.status(400).json({ error: "Destination must start with / (a page on this site) or https://" });
  const row = await queryOne<QrLinkRow>(
    `UPDATE qr_links SET title = $2, destination = $3, enabled = $4, note = $5, "updatedAt" = NOW()
      WHERE slug = $1 RETURNING ${COLUMNS}`,
    [req.params.slug, String(title).trim(), destination.trim(), enabled !== false, String(note ?? "").trim()],
  );
  if (!row) return res.status(404).json({ error: "QR link not found" });
  res.json(row);
}));

router.delete("/:slug", requireAuth, asyncHandler(async (req, res) => {
  await execute(`DELETE FROM qr_links WHERE slug = $1`, [req.params.slug]);
  res.json({ success: true });
}));

/** GET /go/:slug — send the scanner on. Off or unknown links go to the home page. */
export const goRedirect = asyncHandler(async (req: Request, res: Response) => {
  const slug = String(req.params.slug || "").toLowerCase();
  const row = await queryOne<{ destination: string }>(
    `UPDATE qr_links SET scans = scans + 1, "lastScanAt" = NOW()
      WHERE slug = $1 AND enabled RETURNING destination`,
    [slug],
  );
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, row && validDestination(row.destination) ? row.destination.trim() : "/");
});

export default router;
