import { Router } from "express";
import { query, transaction } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

/**
 * Sausage sizzle till backup (/admin/sizzle). The iPad is the source of truth;
 * this is a write-through copy so sales survive a lost or reset device. No
 * card data ever reaches here — card payments are taken on a separate Stripe
 * device and the till only records "card" as the method.
 */
const router = Router();

const MAX_BATCH = 500;

interface SaleIn {
  id: string;
  deviceId: string;
  day: number;
  createdAt: string;
  method: "cash" | "card";
  total: number;
  tendered: number | null;
  change: number | null;
  lines: { item: string; qty: number; unitPrice: number }[];
  voided: boolean;
  voidedAt?: string | null;
}

interface SnapshotIn {
  id: string;
  deviceId: string;
  kind: string;
  key?: string;
  createdAt: string;
  data: unknown;
}

const isId = (v: unknown) => typeof v === "string" && /^[\w-]{1,80}$/.test(v);
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const isIso = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));

function validSale(s: any): s is SaleIn {
  return (
    s && isId(s.id) && isId(s.deviceId) && Number.isInteger(s.day) && s.day >= 1 && s.day <= 31 &&
    isIso(s.createdAt) && (s.method === "cash" || s.method === "card") && isNum(s.total) &&
    (s.tendered === null || isNum(s.tendered)) && (s.change === null || isNum(s.change)) &&
    Array.isArray(s.lines) && s.lines.length > 0 && s.lines.length <= 50 &&
    s.lines.every((l: any) => l && typeof l.item === "string" && l.item.length <= 40 && Number.isInteger(l.qty) && l.qty > 0 && isNum(l.unitPrice)) &&
    typeof s.voided === "boolean"
  );
}

function validSnapshot(s: any): s is SnapshotIn {
  return s && isId(s.id) && isId(s.deviceId) && typeof s.kind === "string" && /^[a-z-]{1,30}$/.test(s.kind) &&
    (s.key === undefined || (typeof s.key === "string" && s.key.length <= 80)) && isIso(s.createdAt) && s.data !== undefined;
}

// Upsert a batch from the till. Returns the ids stored so the device can mark them synced.
router.post("/sync", requireAuth, asyncHandler(async (req, res) => {
  const sales: unknown[] = Array.isArray(req.body?.sales) ? req.body.sales : [];
  const snapshots: unknown[] = Array.isArray(req.body?.snapshots) ? req.body.snapshots : [];
  if (sales.length + snapshots.length > MAX_BATCH) return res.status(413).json({ error: `At most ${MAX_BATCH} records per sync` });
  const badSale = sales.findIndex((s) => !validSale(s));
  const badSnap = snapshots.findIndex((s) => !validSnapshot(s));
  if (badSale >= 0 || badSnap >= 0) return res.status(400).json({ error: badSale >= 0 ? `Invalid sale at index ${badSale}` : `Invalid snapshot at index ${badSnap}` });

  await transaction(async (client) => {
    for (const s of sales as SaleIn[]) {
      await client.query(
        `INSERT INTO sizzle_sales (id, "deviceId", day, "createdAt", method, total, tendered, change, lines, voided, "voidedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET voided = EXCLUDED.voided, "voidedAt" = EXCLUDED."voidedAt", "receivedAt" = NOW()`,
        [s.id, s.deviceId, s.day, s.createdAt, s.method, s.total, s.tendered, s.change, JSON.stringify(s.lines), s.voided, s.voidedAt ?? null],
      );
    }
    for (const s of snapshots as SnapshotIn[]) {
      await client.query(
        `INSERT INTO sizzle_snapshots (id, "deviceId", kind, key, "createdAt", data)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.deviceId, s.kind, s.key ?? "", s.createdAt, JSON.stringify(s.data)],
      );
    }
  });
  res.json({ sales: (sales as SaleIn[]).map((s) => s.id), snapshots: (snapshots as SnapshotIn[]).map((s) => s.id) });
}));

// Everything stored, for restoring a device or reconciling after the event.
router.get("/export", requireAuth, asyncHandler(async (_req, res) => {
  const sales = await query<any>(
    `SELECT id, "deviceId", day, "createdAt", method, total::float AS total, tendered::float AS tendered, change::float AS change, lines, voided, "voidedAt"
     FROM sizzle_sales ORDER BY "createdAt"`,
  );
  const snapshots = await query<any>(
    `SELECT DISTINCT ON (kind, key) id, "deviceId", kind, key, "createdAt", data
     FROM sizzle_snapshots ORDER BY kind, key, "createdAt" DESC`,
  );
  res.setHeader("Cache-Control", "no-store");
  res.json({ exportedAt: new Date().toISOString(), sales, snapshots });
}));

export default router;
