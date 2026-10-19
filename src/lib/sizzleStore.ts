/**
 * On-device storage for the sausage sizzle till (IndexedDB, no dependencies).
 *
 * Every sale is written here the moment it is confirmed — before anything
 * touches the network — so a refresh, a dead tab or a signal drop loses
 * nothing. A sale or snapshot carries `synced: false` until the server has
 * acknowledged it (server/routes/sizzle.ts), and `syncNow` retries the outbox.
 */

import type { Qty, Sale } from "../../shared/sizzle/calc.ts";

const DB_NAME = "skyhigh-sizzle";
const DB_VERSION = 1;

export interface StoredSale extends Sale {
  deviceId: string;
  synced: boolean;
}

export interface Snapshot<T = unknown> {
  id: string;
  deviceId: string;
  kind: string;
  key: string;
  createdAt: string;
  data: T;
  synced: boolean;
}

/** Admin-editable overrides on top of data/sizzle/sizzle-2026.json. */
export interface TillSettings {
  pinHash: string | null;
  priceOverrides: Record<string, number>;
  productPrices: Record<string, number>;
  portions: Record<string, number>;
  cardShare: number | null;
  itemsPerTxn: number | null;
  onionsEnabled: boolean | null;
}

/** Stock on hand = baseline at `at`, minus BOM depletion of later sales. */
export interface StockBaseline {
  at: string;
  qty: Qty;
  reason: string;
}

export interface DayClose {
  day: number;
  closedAt: string;
  floatCounts: Record<string, number>;
  countedCounts: Record<string, number>;
  counted: number | null;
  stripeTotal: number | null;
  stockCounted: Qty;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sales")) db.createObjectStore("sales", { keyPath: "id" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "key" });
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        // Resolve only once the transaction commits, so "saved" really means durable.
        t.oncomplete = () => resolve(req ? (req.result as T) : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export function newId(prefix: string): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${rnd}`;
}

// ─── Key/value ────────────────────────────────────────────────────────────────

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await tx<{ key: string; value: T }>("kv", "readonly", (s) => s.get(key));
  return row?.value;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await tx("kv", "readwrite", (s) => s.put({ key, value }));
}

export async function deviceId(): Promise<string> {
  let id = await kvGet<string>("deviceId");
  if (!id) {
    id = newId("ipad");
    await kvSet("deviceId", id);
  }
  return id;
}

// ─── Sales ────────────────────────────────────────────────────────────────────

export async function putSale(sale: StoredSale): Promise<void> {
  await tx("sales", "readwrite", (s) => s.put(sale));
}

export async function allSales(): Promise<StoredSale[]> {
  const rows = (await tx<StoredSale[]>("sales", "readonly", (s) => s.getAll())) ?? [];
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ─── Snapshots (settings, stock baselines, day closes) ────────────────────────

export async function putSnapshot<T>(kind: string, key: string, data: T): Promise<Snapshot<T>> {
  const snap: Snapshot<T> = { id: newId(kind), deviceId: await deviceId(), kind, key, createdAt: new Date().toISOString(), data, synced: false };
  await tx("snapshots", "readwrite", (s) => s.put(snap));
  await kvSet(`latest:${kind}:${key}`, snap);
  return snap;
}

export async function latestSnapshot<T>(kind: string, key = ""): Promise<Snapshot<T> | undefined> {
  return kvGet<Snapshot<T>>(`latest:${kind}:${key}`);
}

export async function allSnapshots(): Promise<Snapshot[]> {
  return (await tx<Snapshot[]>("snapshots", "readonly", (s) => s.getAll())) ?? [];
}

// ─── Server sync ──────────────────────────────────────────────────────────────

export interface SyncResult {
  ok: boolean;
  pending: number;
  error?: string;
}

let syncing: Promise<SyncResult> | null = null;

/** Push every unsynced sale and snapshot. Safe to call often; concurrent calls share one run. */
export function syncNow(post: (body: unknown) => Promise<{ sales: string[]; snapshots: string[] }>): Promise<SyncResult> {
  if (syncing) return syncing;
  syncing = (async () => {
    const sales = (await allSales()).filter((s) => !s.synced);
    const snaps = (await allSnapshots()).filter((s) => !s.synced);
    if (!sales.length && !snaps.length) return { ok: true, pending: 0 };
    try {
      const strip = <T extends { synced: boolean }>({ synced: _s, ...rest }: T) => rest;
      const ack = await post({ sales: sales.slice(0, 400).map(strip), snapshots: snaps.slice(0, 100).map(strip) });
      const okSales = new Set(ack.sales);
      const okSnaps = new Set(ack.snapshots);
      for (const s of sales) if (okSales.has(s.id)) await putSale({ ...s, synced: true });
      for (const s of snaps) if (okSnaps.has(s.id)) await tx("snapshots", "readwrite", (st) => st.put({ ...s, synced: true }));
      const pending = sales.length + snaps.length - okSales.size - okSnaps.size;
      return { ok: true, pending };
    } catch (err) {
      return { ok: false, pending: sales.length + snaps.length, error: err instanceof Error ? err.message : String(err) };
    }
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

// ─── Export / import ──────────────────────────────────────────────────────────

export interface Backup {
  format: "skyhigh-sizzle-backup";
  version: 1;
  exportedAt: string;
  deviceId: string;
  sales: StoredSale[];
  snapshots: Snapshot[];
  kv: Record<string, unknown>;
}

export async function exportBackup(): Promise<Backup> {
  const kvRows = (await tx<{ key: string; value: unknown }[]>("kv", "readonly", (s) => s.getAll())) ?? [];
  return {
    format: "skyhigh-sizzle-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    deviceId: await deviceId(),
    sales: await allSales(),
    snapshots: await allSnapshots(),
    kv: Object.fromEntries(kvRows.filter((r) => r.key !== "deviceId").map((r) => [r.key, r.value])),
  };
}

/** Merge a backup into this device. Existing ids are overwritten by the backup copy. */
export async function importBackup(b: Backup): Promise<{ sales: number; snapshots: number }> {
  if (b?.format !== "skyhigh-sizzle-backup" || !Array.isArray(b.sales)) throw new Error("Not a sizzle till backup file");
  for (const s of b.sales) await putSale({ ...s, synced: false });
  for (const s of b.snapshots ?? []) await tx("snapshots", "readwrite", (st) => st.put({ ...s, synced: false }));
  for (const [k, v] of Object.entries(b.kv ?? {})) await kvSet(k, v);
  return { sales: b.sales.length, snapshots: (b.snapshots ?? []).length };
}

/** Restore from the server copy (GET /api/sizzle/export). */
export async function importServerExport(x: { sales: Omit<StoredSale, "synced">[]; snapshots: Omit<Snapshot, "synced">[] }): Promise<{ sales: number; snapshots: number }> {
  for (const s of x.sales) await putSale({ ...s, createdAt: new Date(s.createdAt).toISOString(), synced: true });
  for (const s of x.snapshots) {
    const snap = { ...s, createdAt: new Date(s.createdAt).toISOString(), synced: true };
    await tx("snapshots", "readwrite", (st) => st.put(snap));
    const cur = await latestSnapshot(s.kind, s.key);
    if (!cur || cur.createdAt < snap.createdAt) await kvSet(`latest:${s.kind}:${s.key}`, snap);
  }
  return { sales: x.sales.length, snapshots: x.snapshots.length };
}

export function salesCsv(sales: StoredSale[]): string {
  const head = ["id", "createdAt", "day", "method", "total", "tendered", "change", "voided", "voidedAt", "item", "qty", "unitPrice", "lineTotal", "synced"];
  const rows = sales.flatMap((s) =>
    s.lines.map((l) => [s.id, s.createdAt, s.day, s.method, s.total, s.tendered ?? "", s.change ?? "", s.voided, s.voidedAt ?? "", l.item, l.qty, l.unitPrice, l.qty * l.unitPrice, s.synced]),
  );
  return [head, ...rows].map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(",")).join("\n");
}

export function stockCsv(rows: { id: string; name: string; unit: string; onHand: number; packs: number }[]): string {
  const head = ["productId", "name", "unit", "onHand", "packsEquivalent"];
  return [head, ...rows.map((r) => [r.id, r.name, r.unit, r.onHand.toFixed(1), r.packs.toFixed(2)])]
    .map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(","))
    .join("\n");
}

export function download(filename: string, text: string, type = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
