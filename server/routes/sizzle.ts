import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { execute, query, queryOne, transaction } from "../pg.js";
import { requireAuth } from "../middleware/auth.js";
import asyncHandler from "../utils/asyncHandler.js";

/**
 * Sausage sizzle till (/admin/sizzle on the iPad, /sizzle/phone on paired
 * phones). Every device writes to its own IndexedDB first and syncs here; the
 * server is the master copy that devices pull each other's changes from
 * (TASK-040, DECISION-020). No card data ever reaches here — card payments are
 * taken in the Stripe app and the till only records "card" as the method.
 *
 * Two kinds of caller:
 * - admin session (the iPad, the treasurer's computer): everything;
 * - paired phone ("till_…" token): sync its own sales for its one event, and
 *   read prices and stock. Nothing else on the site accepts these tokens.
 */
const router = Router();

const MAX_BATCH = 500;
const PAIR_MINUTES = 10;
const MAX_DEVICE_DAYS = 30;
/** Snapshot kinds a phone may read; settings go out without the PIN hash. */
const PHONE_READ_KINDS = ["settings", "stock"];
const PULL_SALES = 1000;
const PULL_SNAPSHOTS = 200;

interface SaleIn {
  id: string;
  event: string;
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
  event: string;
  deviceId: string;
  kind: string;
  key?: string;
  createdAt: string;
  data: unknown;
}

interface TillDevice { id: string; event: string; name: string }

const isId = (v: unknown) => typeof v === "string" && /^[\w-]{1,80}$/.test(v);
const isEvent = (v: unknown) => typeof v === "string" && /^[a-z0-9-]{1,40}$/.test(v);
const isNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const isIso = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));
const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const secret = (prefix: string) => `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
const tillDevice = (req: Request): TillDevice | undefined => (req as any).tillDevice;

function validSale(s: any): s is SaleIn {
  return (
    s && isId(s.id) && isEvent(s.event) && isId(s.deviceId) && Number.isInteger(s.day) && s.day >= 1 && s.day <= 31 &&
    isIso(s.createdAt) && (s.method === "cash" || s.method === "card") && isNum(s.total) &&
    (s.tendered === null || isNum(s.tendered)) && (s.change === null || isNum(s.change)) &&
    Array.isArray(s.lines) && s.lines.length > 0 && s.lines.length <= 50 &&
    s.lines.every((l: any) => l && typeof l.item === "string" && l.item.length <= 40 && Number.isInteger(l.qty) && l.qty > 0 && isNum(l.unitPrice)) &&
    typeof s.voided === "boolean"
  );
}

function validSnapshot(s: any): s is SnapshotIn {
  return s && isId(s.id) && isEvent(s.event) && isId(s.deviceId) && typeof s.kind === "string" && /^[a-z-]{1,30}$/.test(s.kind) &&
    (s.key === undefined || (typeof s.key === "string" && s.key.length <= 80)) && isIso(s.createdAt) && s.data !== undefined;
}

/** Admin session, or a paired phone's till-only token. */
async function requireTill(req: Request, res: Response, next: NextFunction) {
  const bearer = req.headers.authorization?.replace("Bearer ", "") ?? "";
  if (!bearer.startsWith("till_")) return requireAuth(req, res, next);
  const device = await queryOne<TillDevice>(
    `UPDATE sizzle_devices SET "lastSeenAt" = NOW()
     WHERE "tokenHash" = $1 AND "revokedAt" IS NULL AND "expiresAt" > NOW()
     RETURNING id, event, name`,
    [sha(bearer)],
  );
  if (!device) return res.status(401).json({ error: "This phone's till pass has expired or been cancelled — scan a new QR code on the iPad" });
  (req as any).tillDevice = device;
  next();
}

const pairLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

// Upsert a batch from a device. Returns the ids stored so the device can mark them synced.
router.post("/sync", requireTill, asyncHandler(async (req, res) => {
  const sales: unknown[] = Array.isArray(req.body?.sales) ? req.body.sales : [];
  const snapshots: unknown[] = Array.isArray(req.body?.snapshots) ? req.body.snapshots : [];
  if (sales.length + snapshots.length > MAX_BATCH) return res.status(413).json({ error: `At most ${MAX_BATCH} records per sync` });
  const badSale = sales.findIndex((s) => !validSale(s));
  const badSnap = snapshots.findIndex((s) => !validSnapshot(s));
  if (badSale >= 0 || badSnap >= 0) return res.status(400).json({ error: badSale >= 0 ? `Invalid sale at index ${badSale}` : `Invalid snapshot at index ${badSnap}` });
  const phone = tillDevice(req);
  if (phone) {
    // A phone only ever sends its own sales for its own event.
    if (snapshots.length) return res.status(403).json({ error: "Phones can't change till settings" });
    if ((sales as SaleIn[]).some((s) => s.event !== phone.event || s.deviceId !== phone.id)) return res.status(403).json({ error: "Sale from another event or device" });
  }

  await transaction(async (client) => {
    for (const s of sales as SaleIn[]) {
      // A void is final: a late re-send of the unvoided sale can't undo it. A new void gets a new change number.
      // Only the device that rang a sale up can change it (a phone can't void the iPad's sales).
      await client.query(
        `INSERT INTO sizzle_sales (id, event, "deviceId", day, "createdAt", method, total, tendered, change, lines, voided, "voidedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           voided = sizzle_sales.voided OR EXCLUDED.voided,
           "voidedAt" = COALESCE(sizzle_sales."voidedAt", EXCLUDED."voidedAt"),
           "receivedAt" = NOW(),
           seq = CASE WHEN EXCLUDED.voided AND NOT sizzle_sales.voided THEN nextval('sizzle_change_seq') ELSE sizzle_sales.seq END
         WHERE sizzle_sales."deviceId" = EXCLUDED."deviceId"`,
        [s.id, s.event, s.deviceId, s.day, s.createdAt, s.method, s.total, s.tendered, s.change, JSON.stringify(s.lines), s.voided, s.voidedAt ?? null],
      );
    }
    for (const s of snapshots as SnapshotIn[]) {
      await client.query(
        `INSERT INTO sizzle_snapshots (id, event, "deviceId", kind, key, "createdAt", data)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [s.id, s.event, s.deviceId, s.kind, s.key ?? "", s.createdAt, JSON.stringify(s.data)],
      );
    }
  });
  res.json({ sales: (sales as SaleIn[]).map((s) => s.id), snapshots: (snapshots as SnapshotIn[]).map((s) => s.id) });
}));

/**
 * Changes from every device since change number `since` (?event=&since=), so
 * each device sees the others' sales, prices and stock. Devices ask again from
 * a little before `next` (merging is idempotent), so a slow transaction that
 * commits a lower number late isn't missed. `more` = ask again straight away.
 */
router.get("/pull", requireTill, asyncHandler(async (req, res) => {
  const phone = tillDevice(req);
  const event = typeof req.query.event === "string" && isEvent(req.query.event) ? req.query.event : null;
  if (!event) return res.status(400).json({ error: "event required" });
  if (phone && phone.event !== event) return res.status(403).json({ error: "This phone is paired to another event" });
  const since = Math.max(0, Number.parseInt(String(req.query.since ?? "0"), 10) || 0);
  const sales = await query<any>(
    `SELECT id, event, "deviceId", day, "createdAt", method, total::float AS total, tendered::float AS tendered, change::float AS change, lines, voided, "voidedAt", seq::text AS seq
     FROM sizzle_sales WHERE event = $1 AND sizzle_sales.seq > $2 ORDER BY sizzle_sales.seq LIMIT $3`,
    [event, since, PULL_SALES],
  );
  // Receipt photos make snapshots big, so they come in smaller pages.
  const snapshots = await query<any>(
    `SELECT id, event, "deviceId", kind, key, "createdAt", data, seq::text AS seq
     FROM sizzle_snapshots WHERE event = $1 AND sizzle_snapshots.seq > $2 AND ($3::text[] IS NULL OR kind = ANY($3)) ORDER BY sizzle_snapshots.seq LIMIT $4`,
    [event, since, phone ? PHONE_READ_KINDS : null, PULL_SNAPSHOTS],
  );
  if (phone) for (const s of snapshots) if (s.kind === "settings" && s.data) s.data = { ...s.data, pinHash: null };
  // A full page means there may be more: advance only to the end of the shorter page so nothing is skipped.
  const ends = [
    sales.length === PULL_SALES ? Number(sales[sales.length - 1].seq) : Infinity,
    snapshots.length === PULL_SNAPSHOTS ? Number(snapshots[snapshots.length - 1].seq) : Infinity,
  ];
  const more = ends.some(Number.isFinite);
  const seqs = [...sales, ...snapshots].map((r) => Number(r.seq));
  const next = more ? Math.min(...ends) : seqs.length ? Math.max(...seqs) : since;
  const strip = ({ seq: _seq, ...r }: any) => r;
  res.setHeader("Cache-Control", "no-store");
  res.json({ sales: sales.map(strip), snapshots: snapshots.map(strip), next, more });
}));

// Everything stored for one event (?event=2026-ntvo), for restoring a device or
// reporting after the event. Without ?event, every event is returned.
router.get("/export", requireAuth, asyncHandler(async (req, res) => {
  const event = typeof req.query.event === "string" && isEvent(req.query.event) ? req.query.event : null;
  const sales = await query<any>(
    `SELECT id, event, "deviceId", day, "createdAt", method, total::float AS total, tendered::float AS tendered, change::float AS change, lines, voided, "voidedAt"
     FROM sizzle_sales WHERE ($1::text IS NULL OR event = $1) ORDER BY "createdAt"`,
    [event],
  );
  const snapshots = await query<any>(
    `SELECT DISTINCT ON (event, kind, key) id, event, "deviceId", kind, key, "createdAt", data
     FROM sizzle_snapshots WHERE ($1::text IS NULL OR event = $1) ORDER BY event, kind, key, "createdAt" DESC`,
    [event],
  );
  res.setHeader("Cache-Control", "no-store");
  res.json({ exportedAt: new Date().toISOString(), sales, snapshots });
}));

// ─── Phones ──────────────────────────────────────────────────────────────────

/** Admin: new phone slot + one-time pairing code (shown as a QR, valid 10 minutes). */
router.post("/devices", requireAuth, asyncHandler(async (req, res) => {
  const event = req.body?.event;
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 40) : "";
  if (!isEvent(event) || !name) return res.status(400).json({ error: "event and phone name required" });
  // The pass lasts until 2 days after the event's last day (`until`), never more than 30 days.
  const lastDay = isIso(req.body?.until) ? Date.parse(req.body.until) : Date.now() + 7 * 864e5;
  const expiresAt = new Date(Math.min(lastDay + 2 * 864e5, Date.now() + MAX_DEVICE_DAYS * 864e5));
  const id = `phone-${crypto.randomUUID()}`;
  const code = secret("pair_");
  const pairExpiresAt = new Date(Date.now() + PAIR_MINUTES * 60_000);
  await execute(
    `INSERT INTO sizzle_devices (id, event, name, "pairCodeHash", "pairExpiresAt", "expiresAt", "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, event, name, sha(code), pairExpiresAt, expiresAt, (req as any).user?.id ?? null],
  );
  res.status(201).json({ id, code, pairExpiresAt, expiresAt });
}));

/** Admin: the event's phones (no secrets). */
router.get("/devices", requireAuth, asyncHandler(async (req, res) => {
  const event = typeof req.query.event === "string" && isEvent(req.query.event) ? req.query.event : null;
  const devices = await query<any>(
    `SELECT id, event, name, "pairedAt", "pairExpiresAt", "expiresAt", "revokedAt", "lastSeenAt", "createdAt"
     FROM sizzle_devices WHERE ($1::text IS NULL OR event = $1) ORDER BY "createdAt"`,
    [event],
  );
  res.setHeader("Cache-Control", "no-store");
  res.json({ devices });
}));

/** Admin: cancel a phone's pass straight away. */
router.delete("/devices/:id", requireAuth, asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: "bad id" });
  const r = await execute(`UPDATE sizzle_devices SET "revokedAt" = NOW(), "pairCodeHash" = NULL WHERE id = $1 AND "revokedAt" IS NULL`, [req.params.id]);
  res.json({ revoked: r.rowCount });
}));

/** Phone: swap the one-time code from the QR for this phone's till-only token. */
router.post("/pair", pairLimiter, asyncHandler(async (req, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  if (!/^pair_[\w-]{20,80}$/.test(code)) return res.status(400).json({ error: "Not a till pairing code" });
  const token = secret("till_");
  const device = await queryOne<TillDevice & { expiresAt: string }>(
    `UPDATE sizzle_devices SET "tokenHash" = $2, "pairCodeHash" = NULL, "pairedAt" = NOW(), "lastSeenAt" = NOW()
     WHERE "pairCodeHash" = $1 AND "pairExpiresAt" > NOW() AND "revokedAt" IS NULL
     RETURNING id, event, name, "expiresAt"`,
    [sha(code), sha(token)],
  );
  if (!device) return res.status(410).json({ error: "This QR code has expired or was already used — make a new one on the iPad" });
  res.json({ token, deviceId: device.id, event: device.event, name: device.name, expiresAt: device.expiresAt });
}));

export default router;
