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
import { type Banking, type Purchase, type StripeActual, eventReport, planningLessons } from "../../../shared/sizzle/report.ts";
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
  latestOfKind,
  latestSnapshot,
  newId,
  pullNow,
  putSale,
  putSnapshot,
  setEvent,
  syncNow,
} from "@/lib/sizzleStore";

export const BASE = baseData as unknown as SizzleData;
const FILE_EVENT = { ...BASE.event };
/** The JSON file's own event (2026 NTVO), fixed even after applyEvent switches BASE. */
export const FILE_EVENT_ID = FILE_EVENT.id;
export const FILE_EVENT_TITLE = FILE_EVENT.title;
const FILE_CUSTOMERS = [...BASE.config.customersPerDay];

/** Every sale and record is tagged with this event (e.g. "2026-ntvo"). Live binding — changed by applyEvent. */
export let EVENT_ID = BASE.event.id;
setEvent(EVENT_ID);

/** An event started from the till (server table sizzle_events, TASK-039). */
export interface ServerEvent { id: string; title: string; days: { n: number; date: string; label: string }[]; customersPerDay: number[] }

/**
 * Point the till at an event before it mounts: its name, days and customer
 * estimates over the products and prices in the JSON file. null = the JSON
 * file's own event (2026 NTVO). See EventGate.
 */
export function applyEvent(ev: ServerEvent | null): void {
  BASE.event = ev
    ? { ...FILE_EVENT, id: ev.id, title: ev.title, name: `${ev.title} — ${FILE_EVENT.club} Sausage Sizzle`, days: ev.days }
    : { ...FILE_EVENT };
  BASE.config.customersPerDay = ev ? [...ev.customersPerDay] : [...FILE_CUSTOMERS];
  EVENT_ID = BASE.event.id;
  setEvent(EVENT_ID);
}

/** This event's sales only; records made before tagging belong to it. */
const ofThisEvent = (all: StoredSale[]) => all.filter((s) => (s.event ?? EVENT_ID) === EVENT_ID);

export const EMPTY_SETTINGS: TillSettings = {
  pinHash: null,
  priceOverrides: {},
  productPrices: {},
  portions: {},
  cardShare: null,
  itemsPerTxn: null,
  onionsEnabled: null,
  customersPerDay: {},
};

/** The JSON file with the iPad's admin edits laid over it. */
export function applySettings(base: SizzleData, s: TillSettings): SizzleData {
  const d: SizzleData = JSON.parse(JSON.stringify(base));
  for (const p of d.products) if (s.productPrices[p.id] !== undefined) p.price = s.productPrices[p.id];
  Object.assign(d.config.portions, s.portions);
  if (s.cardShare !== null) d.config.card.share = s.cardShare;
  if (s.itemsPerTxn !== null) d.config.card.itemsPerTxn = s.itemsPerTxn;
  if (s.onionsEnabled !== null) d.config.onionsEnabled = s.onionsEnabled;
  d.config.pricingCustomers = base.config.pricingCustomers ?? base.config.customersPerDay[0];
  d.config.customersPerDay = d.config.customersPerDay.map((c, i) => s.customersPerDay?.[String(i + 1)] ?? c);
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

export type SyncState = { pending: number; ok: boolean; error?: string; at?: string; unauthorised?: boolean };

/**
 * The till's state. The iPad uses the admin login; a paired phone passes its
 * till-only token and `phone: true` (it only sends its own sales and reads
 * prices/stock — TASK-040).
 */
export function useTill(opts: { token?: string | null; phone?: boolean } = {}) {
  const auth = useAuth();
  const token = opts.token !== undefined ? opts.token : auth.token;
  const phone = !!opts.phone;
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [settings, setSettings] = useState<TillSettings>(EMPTY_SETTINGS);
  const [sales, setSales] = useState<StoredSale[]>([]);
  const [baseline, setBaseline] = useState<StockBaseline | null>(null);
  const [day, setDayState] = useState(1);
  const [closes, setCloses] = useState<Record<number, DayClose>>({});
  const [floats, setFloats] = useState<Record<number, Record<string, number>>>({});
  const [sync, setSync] = useState<SyncState>({ pending: 0, ok: true });
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [banking, setBanking] = useState<Banking[]>([]);
  const [stripeActual, setStripeActual] = useState<StripeActual | null>(null);
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
    setSales(ofThisEvent(all));
    setPurchases(await latestOfKind<Purchase>("purchase"));
    setBanking(await latestOfKind<Banking>("banking"));
    setStripeActual((await latestSnapshot<StripeActual>("stripe-actual"))?.data ?? null);
    setBaseline(base?.data ?? null);
    setDayState(savedDay && savedDay <= BASE.event.days.length ? savedDay : todayEventDay(BASE));
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
  // Push this device's records, then pull every other device's (sales, prices, stock).
  const runSync = useCallback(async () => {
    const res: SyncState = await syncNow((body) => api.post<{ sales: string[]; snapshots: string[] }>("/api/sizzle/sync", body, tokenRef.current), { salesOnly: phone });
    let changed = 0;
    try {
      changed = await pullNow((since) => api.get(`/api/sizzle/pull?event=${EVENT_ID}&since=${since}`, tokenRef.current));
    } catch (err) {
      res.ok = false;
      res.error = err instanceof Error ? err.message : String(err);
      res.unauthorised = (err as { status?: number }).status === 401;
    }
    setSync({ ...res, at: new Date().toISOString() });
    if (changed) await reload();
    else if (res.ok) setSales(ofThisEvent(await allSales()));
    return res;
  }, [phone, reload]);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      runSync();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const timer = window.setInterval(() => runSync(), 15_000);
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
        event: EVENT_ID,
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

  /**
   * New customer forecasts. Until a stock count is saved, "on hand" is worked out
   * from the planned initial shop, which itself depends on the forecasts — so once
   * selling has started, pin that opening stock first so it can't shift under us.
   */
  const saveForecasts = useCallback(
    async (customersPerDay: Record<string, number>) => {
      if (!baseline && sales.length) {
        await putSnapshot("stock", "", effectiveBaseline);
        setBaseline(effectiveBaseline);
      }
      await saveSettings({ ...settings, customersPerDay });
    },
    [baseline, sales.length, effectiveBaseline, settings, saveSettings],
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

  // ─── Treasurer records ─────────────────────────────────────────────────────
  const savePurchase = useCallback(
    async (p: Purchase) => {
      await putSnapshot("purchase", p.id, p);
      setPurchases((list) => [...list.filter((x) => x.id !== p.id), p]);
      runSync();
    },
    [runSync],
  );

  const saveBanking = useCallback(
    async (b: Banking) => {
      await putSnapshot("banking", b.id, b);
      setBanking((list) => [...list.filter((x) => x.id !== b.id), b]);
      runSync();
    },
    [runSync],
  );

  const saveStripeActual = useCallback(
    async (s: StripeActual) => {
      await putSnapshot("stripe-actual", "", s);
      setStripeActual(s);
      runSync();
    },
    [runSync],
  );

  const report = useMemo(
    () => eventReport(data, sales, closes, purchases, banking, stripeActual, onHand),
    [data, sales, closes, purchases, banking, stripeActual, onHand],
  );
  const lessons = useMemo(() => planningLessons(data, sales, report, onHand), [data, sales, report, onHand]);

  return {
    ready,
    data,
    prices,
    purchases: purchases.filter((p) => !p.deleted),
    banking: banking.filter((b) => !b.deleted),
    stripeActual,
    savePurchase,
    saveBanking,
    saveStripeActual,
    report,
    lessons,
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
    saveForecasts,
    setStock,
    saveFloat,
    saveClose,
    runSync,
    reload,
  };
}

export type Till = ReturnType<typeof useTill>;
