import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import baseData from "../../../data/sizzle/sizzle-2026.json";
import {
  type Qty,
  type SaleLine,
  type SizzleData,
  type PayMethod,
  itemBom,
  priceMap,
  productIndex,
  recommendFloat,
  saleTotal,
  salesDepletion,
  shoppingPlan,
  subtractQty,
} from "../../../shared/sizzle/calc.ts";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/apiClient";
import {
  type DayClose,
  type StockBaseline,
  type StoredSale,
  type TillSettings,
  allSales,
  deviceId as getDeviceId,
  kvGet,
  kvSet,
  latestSnapshot,
  newId,
  putSale,
  putSnapshot,
  syncNow,
} from "@/lib/sizzleStore";

export const BASE = baseData as unknown as SizzleData;

export const EMPTY_SETTINGS: TillSettings = {
  pinHash: null,
  priceOverrides: {},
  productPrices: {},
  portions: {},
  cardShare: null,
  itemsPerTxn: null,
  onionsEnabled: null,
};

/** The JSON file with the iPad's admin edits laid over it. */
export function applySettings(base: SizzleData, s: TillSettings): SizzleData {
  const d: SizzleData = JSON.parse(JSON.stringify(base));
  for (const p of d.products) if (s.productPrices[p.id] !== undefined) p.price = s.productPrices[p.id];
  Object.assign(d.config.portions, s.portions);
  if (s.cardShare !== null) d.config.card.share = s.cardShare;
  if (s.itemsPerTxn !== null) d.config.card.itemsPerTxn = s.itemsPerTxn;
  if (s.onionsEnabled !== null) d.config.onionsEnabled = s.onionsEnabled;
  d.config.priceOverrides = { ...s.priceOverrides };
  return d;
}

/** Shelf name without the trailing pack size ("… Sausages 1.8kg" → "… Sausages"). */
export function shortName(name: string): string {
  return name
    .replace(/\s+(each|\d[\d.]*\s*(kg|g|ml|l|m)(\s*x\s*\d+\s*pack)?|\d+\s*pack|\d+\s*x\s*\d+\s*pack)$/i, "")
    .trim();
}

/** Event day for today's date in Melbourne, else Day 1. */
function todayEventDay(data: SizzleData): number {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());
  return data.event.days.find((d) => d.date === ymd)?.n ?? 1;
}

export type SyncState = { pending: number; ok: boolean; error?: string; at?: string };

export function useTill() {
  const { token } = useAuth();
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [settings, setSettings] = useState<TillSettings>(EMPTY_SETTINGS);
  const [sales, setSales] = useState<StoredSale[]>([]);
  const [baseline, setBaseline] = useState<StockBaseline | null>(null);
  const [day, setDayState] = useState(1);
  const [closes, setCloses] = useState<Record<number, DayClose>>({});
  const [floats, setFloats] = useState<Record<number, Record<string, number>>>({});
  const [sync, setSync] = useState<SyncState>({ pending: 0, ok: true });
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  const data = useMemo(() => applySettings(BASE, settings), [settings]);
  const prices = useMemo(() => priceMap(data), [data]);
  const products = useMemo(() => productIndex(data), [data]);
  const plan = useMemo(() => shoppingPlan(data), [data]);
  const recommended = useMemo(() => recommendFloat(data), [data]);

  // ─── Load everything from IndexedDB ────────────────────────────────────────
  const reload = useCallback(async () => {
    const [id, s, all, base, savedDay] = await Promise.all([
      getDeviceId(),
      latestSnapshot<TillSettings>("settings"),
      allSales(),
      latestSnapshot<StockBaseline>("stock"),
      kvGet<number>("day"),
    ]);
    setDeviceId(id);
    setSettings({ ...EMPTY_SETTINGS, ...(s?.data ?? {}) });
    setSales(all);
    setBaseline(base?.data ?? null);
    setDayState(savedDay ?? todayEventDay(BASE));
    const c: Record<number, DayClose> = {};
    const f: Record<number, Record<string, number>> = {};
    for (const d of BASE.event.days) {
      const close = await latestSnapshot<DayClose>("close", `day-${d.n}`);
      if (close) c[d.n] = close.data;
      const fl = await latestSnapshot<Record<string, number>>("float", `day-${d.n}`);
      if (fl) f[d.n] = fl.data;
    }
    setCloses(c);
    setFloats(f);
    setReady(true);
  }, []);

  useEffect(() => {
    reload().catch((err) => console.error("[sizzle] load failed", err));
  }, [reload]);

  // ─── Sync to the server ────────────────────────────────────────────────────
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const runSync = useCallback(async () => {
    const res = await syncNow((body) => api.post<{ sales: string[]; snapshots: string[] }>("/api/sizzle/sync", body, tokenRef.current));
    setSync({ ...res, at: new Date().toISOString() });
    if (res.ok) setSales(await allSales());
    return res;
  }, []);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      runSync();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const timer = window.setInterval(() => runSync(), 30_000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.clearInterval(timer);
    };
  }, [runSync]);

  useEffect(() => {
    if (ready) runSync();
  }, [ready, runSync]);

  // ─── Stock ─────────────────────────────────────────────────────────────────
  const effectiveBaseline: StockBaseline = useMemo(
    () => baseline ?? { at: "1970-01-01T00:00:00.000Z", qty: plan.openingStock[0], reason: "Initial shop (plan)" },
    [baseline, plan],
  );
  const onHand: Qty = useMemo(() => {
    const after = sales.filter((s) => s.createdAt > effectiveBaseline.at);
    return subtractQty(effectiveBaseline.qty, salesDepletion(data, after));
  }, [sales, effectiveBaseline, data]);

  /** Serves left of each menu item before its scarcest component runs out. */
  const servesLeft: Record<string, number> = useMemo(() => {
    const out: Record<string, number> = {};
    for (const item of data.menu) {
      let min = Infinity;
      for (const [pid, q] of Object.entries(itemBom(item, data.config))) min = Math.min(min, Math.floor((onHand[pid] ?? 0) / q));
      out[item.id] = Math.max(0, min === Infinity ? 0 : min);
    }
    return out;
  }, [data, onHand]);

  const lowStock = useMemo(() => {
    const threshold = data.config.lowStockServes;
    const warn: { product: string; name: string; left: number; unit: string; serves: number }[] = [];
    for (const p of data.products) {
      if (p.notWoolworths) continue;
      const uses = data.menu.map((m) => itemBom(m, data.config)[p.id]).filter((q): q is number => !!q);
      if (!uses.length) continue;
      const serves = Math.floor((onHand[p.id] ?? 0) / Math.max(...uses));
      if (serves < threshold) warn.push({ product: p.id, name: p.name, left: onHand[p.id] ?? 0, unit: p.unit, serves });
    }
    return warn;
  }, [data, onHand]);

  // ─── Actions ───────────────────────────────────────────────────────────────
  const setDay = useCallback(async (n: number) => {
    setDayState(n);
    await kvSet("day", n);
  }, []);

  const recordSale = useCallback(
    async (lines: SaleLine[], method: PayMethod, tendered: number | null) => {
      const total = saleTotal(lines);
      const sale: StoredSale = {
        id: newId("sale"),
        deviceId,
        createdAt: new Date().toISOString(),
        day,
        lines,
        total,
        method,
        tendered: method === "cash" ? tendered : null,
        change: method === "cash" && tendered !== null ? Math.round((tendered - total) * 100) / 100 : null,
        voided: false,
        voidedAt: null,
        synced: false,
      };
      await putSale(sale); // durable before the UI moves on
      setSales((s) => [...s, sale]);
      runSync();
      return sale;
    },
    [day, deviceId, runSync],
  );

  const voidSale = useCallback(
    async (sale: StoredSale) => {
      const v = { ...sale, voided: true, voidedAt: new Date().toISOString(), synced: false };
      await putSale(v);
      setSales((s) => s.map((x) => (x.id === v.id ? v : x)));
      runSync();
    },
    [runSync],
  );

  const saveSettings = useCallback(
    async (next: TillSettings) => {
      await putSnapshot("settings", "", next);
      setSettings(next);
      runSync();
    },
    [runSync],
  );

  const setStock = useCallback(
    async (qty: Qty, reason: string) => {
      const b: StockBaseline = { at: new Date().toISOString(), qty, reason };
      await putSnapshot("stock", "", b);
      setBaseline(b);
      runSync();
    },
    [runSync],
  );

  const saveFloat = useCallback(
    async (n: number, counts: Record<string, number>) => {
      await putSnapshot("float", `day-${n}`, counts);
      setFloats((f) => ({ ...f, [n]: counts }));
      runSync();
    },
    [runSync],
  );

  const saveClose = useCallback(
    async (close: DayClose) => {
      await putSnapshot("close", `day-${close.day}`, close);
      setCloses((c) => ({ ...c, [close.day]: close }));
      runSync();
    },
    [runSync],
  );

  const floatFor = useCallback(
    (n: number): Record<string, number> => floats[n] ?? Object.fromEntries(Object.entries(recommended.counts).map(([d, c]) => [d, c])),
    [floats, recommended],
  );

  return {
    ready,
    data,
    prices,
    products,
    plan,
    settings,
    sales,
    daySales: sales.filter((s) => s.day === day),
    day,
    setDay,
    onHand,
    baseline: effectiveBaseline,
    servesLeft,
    lowStock,
    closes,
    floatFor,
    recommendedFloat: recommended,
    sync,
    online,
    deviceId,
    recordSale,
    voidSale,
    saveSettings,
    setStock,
    saveFloat,
    saveClose,
    runSync,
    reload,
  };
}

export type Till = ReturnType<typeof useTill>;
