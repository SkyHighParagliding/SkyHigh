/**
 * Sausage sizzle maths — pure functions, no I/O.
 *
 * Shared by the PDF generator (scripts/sizzle/build-pdfs.ts), the iPad till
 * (src/pages/AdminSizzle.tsx) and the tests (shared/sizzle/sizzle.test.mjs), so
 * a printed shopping list, the till's top-up list and the tests all agree.
 *
 * Units: every stock quantity is in the product's own base unit (sausage,
 * slice, g, ml, can …) as declared by `unitsPerPack`/`unit` in the data file.
 * Money is AUD dollars as plain numbers.
 */

export type Group = "food" | "hot" | "cold" | "fruit";
export type AllocTarget = Group | "all";

export interface Product {
  id: string;
  name: string;
  brand: string;
  packSize: string;
  unitsPerPack: number;
  unit: string;
  price: number;
  unitPrice: string;
  stockcode: string;
  url: string;
  category: string;
  aisle: string;
  perishable: boolean;
  /** false = does not survive to the next day (ice melts). Default true. */
  carryOver?: boolean;
  /** Safety stock (base units) added to par on every day except the last, for lumpy small-number demand. */
  bufferUnits?: number;
  /** Low-stock warning when this many serves or fewer are left; replaces config.lowStockServes for this product. */
  warnAt?: number;
  /** Stock to open each day with, except the last (Day 4 is sized to minimise leftovers). */
  minOnHand?: number;
  storage: string;
  ownBrand: boolean;
  confirmInStore: boolean;
  notWoolworths?: boolean;
  estimate?: boolean;
  flags: string[];
  fallback: string;
  special?: string;
}

export interface BomEntry {
  product: string;
  portion?: string;
  qty?: number;
  /** Name of a boolean config switch; the entry is skipped when it is false. */
  optional?: string;
}

export interface MenuItem {
  id: string;
  name: string;
  short: string;
  group: Group;
  colour: string;
  bom: BomEntry[];
}

export interface DailyConsumable {
  product: string;
  qtyPerDay: number;
  allocateTo: AllocTarget;
  note?: string;
}

export interface CardConfig {
  share: number;
  itemsPerTxn: number;
  pct: number;
  fixed: number;
  tapToPayFee: number;
  worstShare: number;
  worstItemsPerTxn: number;
  source: string;
  checked: string;
  checkedNote: string;
}

export interface FloatConfig {
  rushShare: number;
  tenders: { note: number; share: number }[];
  minimum: Record<string, number>;
  coinRoundTo: number;
  /** Multiplier on the expected change paid out in the rush. Default 1.5. */
  safety?: number;
  /** Multiplier for $1/$2 coins, sized on the whole day. Default 2. */
  coinSafety?: number;
  note: string;
}

export interface PowerConfig {
  kettle: { maxW: number; recommendW: number; litres: number; usableLitresPerBoil: number; cupMl: number; inletC: number; efficiency: number; reboilAllowance: number };
  elite300: { name: string; capacityWh: number; usableWh: number; maxOutputW: number; socketsSharedA: number; volts: number; inverterEfficiency: number };
  elite100: { name: string; capacityWh: number; usableWh: number };
  fridge: { name: string; volts: number; avgA: number; hotDayA: number; note: string };
  overnight: { device: string; wh: number }[];
}

export interface Mix {
  sausageServesPerCustomer: number;
  vegShare: number;
  hotDrinksPerCustomer: number;
  coffeeShareOfHot: number;
  coldDrinksPerCustomer: number;
  waterShareOfCold: number;
  colaShareOfCans: number;
  /** Whole fruit per customer, split evenly across the fruit menu items. */
  fruitPerCustomer: number;
}

export interface Config {
  customersPerDay: number[];
  customersNote: string;
  markup: number;
  priceStep: number;
  onionsEnabled: boolean;
  mix: Mix;
  portions: Record<string, number>;
  portionsNote: string;
  dailyConsumables: DailyConsumable[];
  card: CardConfig;
  float: FloatConfig;
  lowStockServes: number;
  power: PowerConfig;
  /**
   * Customers a day that fixed costs (gas, bin bags…) are spread over when pricing.
   * Defaults to Day 1's forecast; the till pins it to the plan so re-forecasting
   * customers mid-event changes quantities, not sell prices.
   */
  pricingCustomers?: number;
  /** Set on the iPad (Admin): fixed sell prices that replace the computed ones. */
  priceOverrides?: Record<string, number>;
  [key: string]: unknown;
}

export interface SizzleData {
  schemaVersion: number;
  /** `id` tags every sale and record so future events never mix with this one. */
  event: { id: string; title: string; name: string; club: string; days: { n: number; date: string; label: string }[]; service: string; sites: string; foodClass: string };
  pricesChecked: { store: string; address: string; phone: string; date: string; method: string };
  tradingHours: { checked: string; current: string; eventDays: string; confirmed: boolean };
  config: Config;
  products: Product[];
  menu: MenuItem[];
  equipment: { item: string; status: string; qty: number; estCost?: number; source?: string; notes?: string }[];
  compliance: { title: string; detail: string; link: string; due?: string }[];
}

export type Qty = Record<string, number>;

// ─── Small helpers ────────────────────────────────────────────────────────────

const EPS = 1e-9;

export function roundCents(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Round UP to the next multiple of `step`, ignoring float noise (3.0000000001 → 3). */
export function ceilTo(x: number, step = 1): number {
  return Math.ceil(x / step - EPS) * step;
}

/** Whole Woolworths packs needed to hold `qty` base units. */
export function packsFor(qty: number, product: Product): number {
  if (qty <= EPS) return 0;
  return ceilTo(qty / product.unitsPerPack);
}

export function unitCost(product: Product): number {
  return product.price / product.unitsPerPack;
}

export function productIndex(data: SizzleData): Record<string, Product> {
  return Object.fromEntries(data.products.map((p) => [p.id, p]));
}

export function addQty(into: Qty, from: Qty, factor = 1): Qty {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v * factor;
  return into;
}

// ─── Bill of materials ────────────────────────────────────────────────────────

export function bomEntryQty(entry: BomEntry, config: Config): number {
  if (entry.optional && config[entry.optional] === false) return 0;
  if (entry.portion) return config.portions[entry.portion] ?? 0;
  return entry.qty ?? 0;
}

/** Product quantities consumed by ONE serve of a menu item. */
export function itemBom(item: MenuItem, config: Config): Qty {
  const q: Qty = {};
  for (const e of item.bom) {
    const n = bomEntryQty(e, config);
    if (n > 0) q[e.product] = (q[e.product] ?? 0) + n;
  }
  return q;
}

export const FRUIT = ["apple", "orange", "banana"];

/** Serves of each menu item per customer, from the editable lunch mix. */
export function demandPerCustomer(mix: Mix): Qty {
  const cans = mix.coldDrinksPerCustomer * (1 - mix.waterShareOfCold);
  const fruit = (mix.fruitPerCustomer ?? 0) / FRUIT.length;
  return {
    ...Object.fromEntries(FRUIT.map((f) => [f, fruit])),
    sausage: mix.sausageServesPerCustomer * (1 - mix.vegShare),
    veg_sausage: mix.sausageServesPerCustomer * mix.vegShare,
    coffee: mix.hotDrinksPerCustomer * mix.coffeeShareOfHot,
    tea: mix.hotDrinksPerCustomer * (1 - mix.coffeeShareOfHot),
    water: mix.coldDrinksPerCustomer * mix.waterShareOfCold,
    cola: cans * mix.colaShareOfCans,
    lemonade: cans * (1 - mix.colaShareOfCans),
  };
}

export function servesForCustomers(config: Config, customers: number): Qty {
  const per = demandPerCustomer(config.mix);
  return Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v * customers]));
}

/** Product usage for a set of serves (BOM only — no daily consumables). */
export function depletion(data: SizzleData, serves: Qty): Qty {
  const out: Qty = {};
  for (const item of data.menu) {
    const n = serves[item.id] ?? 0;
    if (n) addQty(out, itemBom(item, data.config), n);
  }
  return out;
}

/** Everything one trading day uses: BOM for the forecast serves + daily consumables. */
export function dailyUsage(data: SizzleData, customers: number): Qty {
  const out = depletion(data, servesForCustomers(data.config, customers));
  for (const c of data.config.dailyConsumables) out[c.product] = (out[c.product] ?? 0) + c.qtyPerDay;
  return out;
}

/** Low stock means fewer serves left than this. */
export function lowStockBelow(product: Product | undefined, config: Config): number {
  return product?.warnAt !== undefined ? product.warnAt + 1 : config.lowStockServes;
}

/** Low-stock trigger for a menu item: the lowest of its components' triggers. */
export function itemLowStockBelow(item: MenuItem, data: SizzleData, products = productIndex(data)): number {
  return Math.min(...Object.keys(itemBom(item, data.config)).map((pid) => lowStockBelow(products[pid], data.config)));
}

// ─── Costing and pricing ──────────────────────────────────────────────────────

export interface CostLine { product: string; qty: number; cost: number }
export interface ItemCost { item: string; direct: number; allocated: number; total: number; lines: CostLine[] }

/**
 * Cost per serve = BOM cost + a share of the day's consumables. Each consumable
 * is spread over the serves of the group it serves (gas → food, ice → cold
 * drinks, bin bags → everything) at the planning day's customer count.
 */
export function costPerServe(data: SizzleData, customers = data.config.pricingCustomers ?? data.config.customersPerDay[0]): Record<string, ItemCost> {
  const products = productIndex(data);
  const serves = servesForCustomers(data.config, customers);
  const groupServes: Record<AllocTarget, number> = { food: 0, hot: 0, cold: 0, fruit: 0, all: 0 };
  for (const item of data.menu) {
    groupServes[item.group] += serves[item.id] ?? 0;
    groupServes.all += serves[item.id] ?? 0;
  }

  const out: Record<string, ItemCost> = {};
  for (const item of data.menu) {
    const lines: CostLine[] = [];
    let direct = 0;
    for (const [pid, qty] of Object.entries(itemBom(item, data.config))) {
      const cost = qty * unitCost(products[pid]);
      lines.push({ product: pid, qty, cost });
      direct += cost;
    }
    let allocated = 0;
    for (const c of data.config.dailyConsumables) {
      if (c.allocateTo !== "all" && c.allocateTo !== item.group) continue;
      const over = groupServes[c.allocateTo];
      if (over <= 0) continue;
      const qty = c.qtyPerDay / over;
      const cost = qty * unitCost(products[c.product]);
      lines.push({ product: c.product, qty, cost });
      allocated += cost;
    }
    out[item.id] = { item: item.id, direct, allocated, total: direct + allocated, lines };
  }
  return out;
}

/** Fixed card fee per transaction (Terminal fixed + Tap to Pay). */
export function cardFixed(card: CardConfig): number {
  return card.fixed + card.tapToPayFee;
}

/** Expected card fee per serve at sell price P: s × (fixed / n + pct × P). */
export function cardFeePerServe(price: number, card: CardConfig, share = card.share, itemsPerTxn = card.itemsPerTxn): number {
  return share * (cardFixed(card) / itemsPerTxn + card.pct * price);
}

/**
 * Sell price before rounding. Solves P = markup × (C + s·fixed/n + s·pct·P):
 *   P = markup × (C + s·fixed/n) / (1 − markup·s·pct)
 */
export function rawPrice(cost: number, config: Config, share = config.card.share, itemsPerTxn = config.card.itemsPerTxn): number {
  const { card, markup } = config;
  return (markup * (cost + (share * cardFixed(card)) / itemsPerTxn)) / (1 - markup * share * card.pct);
}

export function sellPrice(cost: number, config: Config, share?: number, itemsPerTxn?: number): number {
  return ceilTo(rawPrice(cost, config, share, itemsPerTxn), config.priceStep);
}

export interface PriceRow {
  item: string;
  name: string;
  cost: number;
  cardFee: number;
  costInclFee: number;
  raw: number;
  price: number;
  margin: number;
  worstRaw: number;
  worstPrice: number;
  worstChanges: boolean;
  overridden: boolean;
}

export function pricingTable(data: SizzleData): PriceRow[] {
  const costs = costPerServe(data);
  const { config } = data;
  const { card } = config;
  return data.menu.map((item) => {
    const cost = costs[item.id].total;
    const raw = rawPrice(cost, config);
    const computed = sellPrice(cost, config);
    const override = config.priceOverrides?.[item.id];
    const price = override ?? computed;
    const cardFee = cardFeePerServe(price, card);
    const worstRaw = rawPrice(cost, config, card.worstShare, card.worstItemsPerTxn);
    const worstPrice = ceilTo(worstRaw, config.priceStep);
    return {
      item: item.id,
      name: item.name,
      cost,
      cardFee,
      costInclFee: cost + cardFee,
      raw,
      price,
      margin: price - cost - cardFee,
      worstRaw,
      worstPrice,
      worstChanges: worstPrice !== computed,
      overridden: override !== undefined,
    };
  });
}

export function priceMap(data: SizzleData): Qty {
  return Object.fromEntries(pricingTable(data).map((r) => [r.item, r.price]));
}

export interface DayForecast {
  day: number;
  customers: number;
  serves: Qty;
  revenue: number;
  cardRevenue: number;
  cashRevenue: number;
  cardTxns: number;
  cardFees: number;
}

/** Forecast revenue and Stripe fees for each trading day. */
export function dayForecasts(data: SizzleData): DayForecast[] {
  const prices = priceMap(data);
  const { card } = data.config;
  return data.config.customersPerDay.map((customers, i) => {
    const serves = servesForCustomers(data.config, customers);
    let revenue = 0;
    let fees = 0;
    let totalServes = 0;
    for (const [id, n] of Object.entries(serves)) {
      revenue += n * prices[id];
      fees += n * cardFeePerServe(prices[id], card);
      totalServes += n;
    }
    const cardRevenue = revenue * card.share;
    return {
      day: i + 1,
      customers,
      serves,
      revenue,
      cardRevenue,
      cashRevenue: revenue - cardRevenue,
      cardTxns: (totalServes * card.share) / card.itemsPerTxn,
      cardFees: fees,
    };
  });
}

// ─── Shopping plan ────────────────────────────────────────────────────────────

export interface ShopLine {
  product: Product;
  need: number;
  packs: number;
  lineTotal: number;
}

export interface ShopList {
  key: string;
  title: string;
  subtitle: string;
  lines: ShopLine[];
  total: number;
  /** Lines bought somewhere other than Woolworths (gas) — shown separately. */
  otherLines: ShopLine[];
  otherTotal: number;
}

function buildList(data: SizzleData, key: string, title: string, subtitle: string, need: Qty): ShopList {
  const lines: ShopLine[] = [];
  const otherLines: ShopLine[] = [];
  for (const p of data.products) {
    const n = need[p.id] ?? 0;
    const packs = packsFor(n, p);
    if (packs <= 0) continue;
    const line = { product: p, need: n, packs, lineTotal: roundCents(packs * p.price) };
    (p.notWoolworths ? otherLines : lines).push(line);
  }
  const sum = (ls: ShopLine[]) => roundCents(ls.reduce((a, l) => a + l.lineTotal, 0));
  return { key, title, subtitle, lines, total: sum(lines), otherLines, otherTotal: sum(otherLines) };
}

function carries(p: Product): boolean {
  return p.carryOver !== false;
}

/**
 * Par level for `days` (indexes into customersPerDay): forecast usage, plus each
 * product's safety buffer unless the period ends on the last trading day (Day 4
 * is sized to minimise leftovers).
 */
export function parLevel(data: SizzleData, days: number[]): Qty {
  const par: Qty = {};
  for (const d of days) addQty(par, dailyUsage(data, data.config.customersPerDay[d]));
  const endsOnLastDay = days.includes(data.config.customersPerDay.length - 1);
  if (!endsOnLastDay) {
    for (const p of data.products) if (p.bufferUnits && par[p.id]) par[p.id] += p.bufferUnits;
  }
  // minOnHand: every day but the last opens with at least that much, even when
  // one shop covers two days.
  const last = data.config.customersPerDay.length - 1;
  for (const p of data.products) {
    if (!p.minOnHand) continue;
    let used = 0;
    let need = 0;
    for (const d of days) {
      if (d !== last) need = Math.max(need, used + p.minOnHand);
      used += dailyUsage(data, data.config.customersPerDay[d])[p.id] ?? 0;
    }
    par[p.id] = Math.max(need, used);
  }
  return par;
}

/**
 * Stock to buy so that `onHand` covers the usage of `days`. The till's top-up
 * list uses the same rule: par − on hand.
 */
export function topUpNeed(data: SizzleData, onHand: Qty, days: number[]): Qty {
  const products = productIndex(data);
  const need: Qty = {};
  const par = parLevel(data, days);
  for (const [pid, qty] of Object.entries(par)) {
    const have = carries(products[pid]) ? onHand[pid] ?? 0 : 0;
    need[pid] = Math.max(0, qty - have);
  }
  return need;
}

export interface ShoppingPlan {
  usage: Qty[];
  initial: ShopList;
  topUps: ShopList[];
  twoDay: ShopList[];
  /** Stock expected on hand at the START of each day if the 1-day plan is followed. */
  openingStock: Qty[];
  leftoverAfterLastDay: Qty;
}

/**
 * Initial shop = Day 1 perishables + non-perishables for every day.
 * Each later day gets a 1-day top-up (par = that day's usage) and, where a
 * following day exists, a combined 2-day top-up for when we can't reach Bright.
 */
export function shoppingPlan(data: SizzleData): ShoppingPlan {
  const days = data.config.customersPerDay.map((_, i) => i);
  const usage = days.map((d) => dailyUsage(data, data.config.customersPerDay[d]));
  const products = productIndex(data);
  const labels = data.event.days;

  const initialNeed: Qty = {};
  const day1Par = parLevel(data, [0]);
  for (const p of data.products) {
    const n = p.perishable ? day1Par[p.id] ?? 0 : days.reduce((a, d) => a + (usage[d][p.id] ?? 0), 0);
    if (n > 0) initialNeed[p.id] = n;
  }
  const initial = buildList(data, "initial", "Initial shopping list", `Before ${labels[0].label}: Day 1 perishables + non-perishables for all ${days.length} days`, initialNeed);

  const stock: Qty = {};
  for (const l of [...initial.lines, ...initial.otherLines]) stock[l.product.id] = l.packs * l.product.unitsPerPack;

  const openingStock: Qty[] = [{ ...stock }];
  const topUps: ShopList[] = [];
  const twoDay: ShopList[] = [];
  let onHand = { ...stock };

  for (const d of days) {
    if (d > 0) {
      const lbl = labels[d];
      const one = buildList(data, `topup-${d + 1}`, `Day ${d + 1} top-up`, `Buy before ${lbl.label} — covers Day ${d + 1}`, topUpNeed(data, onHand, [d]));
      topUps.push(one);
      if (d + 1 < days.length) {
        const two = buildList(data, `topup-${d + 1}-${d + 2}`, `Days ${d + 1}–${d + 2} combined top-up`, `Buy before ${lbl.label} — covers Days ${d + 1} and ${d + 2} (no shop the next day)`, topUpNeed(data, onHand, [d, d + 1]));
        twoDay.push(two);
      }
      for (const l of [...one.lines, ...one.otherLines]) onHand[l.product.id] = (onHand[l.product.id] ?? 0) + l.packs * l.product.unitsPerPack;
      openingStock.push({ ...onHand });
    }
    const next: Qty = {};
    for (const [pid, qty] of Object.entries(onHand)) {
      const left = qty - (usage[d][pid] ?? 0);
      next[pid] = carries(products[pid]) ? Math.max(0, left) : 0;
    }
    onHand = next;
  }
  return { usage, initial, topUps, twoDay, openingStock, leftoverAfterLastDay: onHand };
}

/** Shopping list from the till's counted/estimated on-hand stock. */
export function tillTopUpList(data: SizzleData, onHand: Qty, days: number[], title: string, subtitle: string): ShopList {
  return buildList(data, `till-${days.join("-")}`, title, subtitle, topUpNeed(data, onHand, days));
}

// ─── Till: change, cash-up, card reconciliation ───────────────────────────────

export const NOTES_AND_COINS = [100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05];

/** "$20", "$1", "50c". */
export function denomLabel(d: number): string {
  return d >= 1 ? `$${d}` : `${Math.round(d * 100)}c`;
}

export function changeDue(total: number, tendered: number): number | null {
  const c = roundCents(tendered - total);
  return c < 0 ? null : c;
}

/** Greedy breakdown of an amount into notes/coins, worked in cents so 50c prices don't drift. */
export function breakdown(amount: number, denoms = NOTES_AND_COINS): Record<number, number> {
  const out: Record<number, number> = {};
  let left = Math.round(amount * 100);
  for (const d of denoms) {
    const c = Math.round(d * 100);
    const n = Math.floor(left / c);
    if (n > 0) {
      out[d] = n;
      left -= n * c;
    }
  }
  return out;
}

export interface SaleLine { item: string; qty: number; unitPrice: number }
export type PayMethod = "cash" | "card";

export interface Sale {
  id: string;
  /** Event id (data.event.id). Older records without one belong to the current event. */
  event?: string;
  createdAt: string;
  day: number;
  lines: SaleLine[];
  total: number;
  method: PayMethod;
  tendered: number | null;
  change: number | null;
  voided: boolean;
  voidedAt?: string | null;
}

export function saleTotal(lines: SaleLine[]): number {
  return roundCents(lines.reduce((a, l) => a + l.qty * l.unitPrice, 0));
}

export function saleServes(lines: SaleLine[]): Qty {
  const q: Qty = {};
  for (const l of lines) q[l.item] = (q[l.item] ?? 0) + l.qty;
  return q;
}

/** Product depletion for a list of sales (voids excluded). */
export function salesDepletion(data: SizzleData, sales: Sale[]): Qty {
  const serves: Qty = {};
  for (const s of sales) if (!s.voided) addQty(serves, saleServes(s.lines));
  return depletion(data, serves);
}

export function subtractQty(a: Qty, b: Qty): Qty {
  const out: Qty = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) - v;
  return out;
}

export interface DaySummary {
  byItem: Record<string, { qty: number; cash: number; card: number; total: number }>;
  cashTotal: number;
  cardTotal: number;
  cashCount: number;
  cardCount: number;
  voidCount: number;
  total: number;
}

export function summariseSales(sales: Sale[]): DaySummary {
  const s: DaySummary = { byItem: {}, cashTotal: 0, cardTotal: 0, cashCount: 0, cardCount: 0, voidCount: 0, total: 0 };
  for (const sale of sales) {
    if (sale.voided) {
      s.voidCount++;
      continue;
    }
    if (sale.method === "card") {
      s.cardTotal += sale.total;
      s.cardCount++;
    } else {
      s.cashTotal += sale.total;
      s.cashCount++;
    }
    for (const l of sale.lines) {
      const row = (s.byItem[l.item] ??= { qty: 0, cash: 0, card: 0, total: 0 });
      const amt = l.qty * l.unitPrice;
      row.qty += l.qty;
      row.total += amt;
      if (sale.method === "card") row.card += amt;
      else row.cash += amt;
    }
  }
  s.cashTotal = roundCents(s.cashTotal);
  s.cardTotal = roundCents(s.cardTotal);
  s.total = roundCents(s.cashTotal + s.cardTotal);
  return s;
}

export function denomTotal(counts: Record<string | number, number>): number {
  return roundCents(Object.entries(counts).reduce((a, [d, n]) => a + Number(d) * (Number(n) || 0), 0));
}

/** Cash-up uses CASH sales only: expected = float + cash sales. */
export function cashUp(floatTotal: number, sales: Sale[], counted: number | null) {
  const { cashTotal } = summariseSales(sales);
  const expected = roundCents(floatTotal + cashTotal);
  return { floatTotal, cashSales: cashTotal, expected, counted, variance: counted === null ? null : roundCents(counted - expected) };
}

/** Till card total vs the Stripe Dashboard gross for the day. */
export function cardReconcile(sales: Sale[], stripeTotal: number | null, card: CardConfig) {
  const live = sales.filter((s) => !s.voided && s.method === "card");
  const tillTotal = roundCents(live.reduce((a, s) => a + s.total, 0));
  const estFees = roundCents(live.reduce((a, s) => a + cardFixed(card) + card.pct * s.total, 0));
  return { tillTotal, count: live.length, stripeTotal, variance: stripeTotal === null ? null : roundCents(stripeTotal - tillTotal), estFees };
}

// ─── Float ────────────────────────────────────────────────────────────────────

export interface FloatPlan {
  counts: Record<number, number>;
  total: number;
  cashCustomers: number;
  rushCustomers: number;
  basket: number;
  reasoning: string[];
}

/** 50c only gets a count when a price has 50c in it; otherwise it stays 0. */
export const FLOAT_DENOMS = [20, 10, 5, 2, 1, 0.5];
const TENDER_NOTES = [5, 10, 20, 50];

/**
 * Probability distribution of one customer's spend, from the lunch mix and the
 * sell prices (whole sausages; at most one hot and one cold drink each).
 */
export function basketDistribution(data: SizzleData): Map<number, number> {
  const { mix } = data.config;
  const prices = priceMap(data);
  const whole = Math.floor(mix.sausageServesPerCustomer);
  const extra = mix.sausageServesPerCustomer - whole;
  let dist = new Map<number, number>([[0, 1]]);
  const convolve = (options: [number, number][]) => {
    const next = new Map<number, number>();
    for (const [v, p] of dist) for (const [add, q] of options) if (q > 0) next.set(roundCents(v + add), (next.get(roundCents(v + add)) ?? 0) + p * q);
    dist = next;
  };
  const sausage: [number, number][] = [[prices.sausage, 1 - mix.vegShare], [prices.veg_sausage, mix.vegShare]];
  for (let i = 0; i < whole; i++) convolve(sausage);
  convolve([[0, 1 - extra], ...sausage.map(([v, q]) => [v, q * extra] as [number, number])]);
  const hot = mix.hotDrinksPerCustomer;
  convolve([[0, 1 - hot], [prices.coffee, hot * mix.coffeeShareOfHot], [prices.tea, hot * (1 - mix.coffeeShareOfHot)]]);
  const cold = mix.coldDrinksPerCustomer;
  const cans = cold * (1 - mix.waterShareOfCold);
  convolve([[0, 1 - cold], [prices.water, cold * mix.waterShareOfCold], [prices.cola, cans * mix.colaShareOfCans], [prices.lemonade, cans * (1 - mix.colaShareOfCans)]]);
  const fruit = mix.fruitPerCustomer ?? 0;
  if (fruit > 0) convolve([[0, 1 - fruit], ...FRUIT.map((f) => [prices[f], fruit / FRUIT.length] as [number, number])]);
  return dist;
}

/**
 * Float = expected change paid out to the rush of cash customers, by
 * denomination, × a safety margin. Every likely basket and tender is
 * considered (odd baskets are what eat $1 coins).
 */
export function recommendFloat(data: SizzleData, customers = data.config.customersPerDay[0]): FloatPlan {
  const { config } = data;
  const fc = config.float;
  const safety = fc.safety ?? 1.5;
  const coinSafety = fc.coinSafety ?? 2;
  const dist = basketDistribution(data);
  const spend = [...dist].reduce((a, [v, p]) => a + v * p, 0);
  const basket = Math.max(1, Math.round(spend));
  const cashCustomers = customers * (1 - config.card.share);
  const rush = Math.ceil(cashCustomers * fc.rushShare - EPS);

  const perCustomer: Record<number, number> = Object.fromEntries(FLOAT_DENOMS.map((d) => [d, 0]));
  let changeOut = 0;
  for (const [b, pb] of dist) {
    if (b <= 0) continue;
    for (const t of fc.tenders) {
      if (t.note === 0) continue;
      const note = t.note >= b ? t.note : TENDER_NOTES.find((x) => x >= b) ?? 50;
      const change = note - b;
      changeOut += pb * t.share * change;
      for (const [d, c] of Object.entries(breakdown(change, FLOAT_DENOMS))) perCustomer[Number(d)] += pb * t.share * c;
    }
  }
  const counts: Record<number, number> = {};
  // Notes come back in as customers pay, so they only need to cover the rush.
  // Coins rarely do (people pay with notes), so they cover the whole day.
  for (const d of FLOAT_DENOMS) counts[d] = Math.ceil((d <= 2 ? cashCustomers * coinSafety : rush * safety) * perCustomer[d] - EPS);
  for (const [d, min] of Object.entries(fc.minimum)) counts[Number(d)] = Math.max(counts[Number(d)] ?? 0, min);
  for (const d of [2, 1, 0.5]) counts[d] = ceilTo(counts[d], fc.coinRoundTo);

  const likely = [...dist].filter(([v]) => v > 0).sort((a, z) => z[1] - a[1]).slice(0, 4).map(([v, p]) => `$${v.toFixed(v % 1 ? 2 : 0)} (${Math.round(p * 100)}%)`).join(", ");
  const per = FLOAT_DENOMS.filter((d) => d >= 1 || perCustomer[d] > 0).map((d) => `${perCustomer[d].toFixed(2)}×${denomLabel(d)}`).join(", ");
  const reasoning = [
    `${customers} customers × ${Math.round((1 - config.card.share) * 100)}% paying cash ≈ ${cashCustomers.toFixed(0)} cash customers a day; average spend $${spend.toFixed(2)}.`,
    `Most likely baskets: ${likely}. Odd totals ($3, $5, $7…) need $1 coins in the change${perCustomer[0.5] > 0 ? "; totals ending in 50c need 50c coins" : ""}.`,
    `Tenders assumed: ${fc.tenders.map((t) => `${t.note ? `$${t.note}` : "exact"} ${Math.round(t.share * 100)}%`).join(", ")} (a note smaller than the basket is bumped to the next note up).`,
    `Average change per cash customer ≈ $${changeOut.toFixed(2)}, made of ${per}.`,
    `Notes: that × the first ${rush} cash customers (the ${Math.round(fc.rushShare * 100)}% who arrive before notes come back in). Coins: × all ${cashCustomers.toFixed(0)} cash customers, because people pay with notes and coins rarely come back. Safety margin × ${safety} on notes, × ${coinSafety} on coins (small numbers swing a lot); rounded up; coins to multiples of ${fc.coinRoundTo}.`,
  ];
  return { counts, total: denomTotal(counts), cashCustomers, rushCustomers: rush, basket, reasoning };
}

// ─── Power ────────────────────────────────────────────────────────────────────

export function powerBudget(data: SizzleData, customers = data.config.customersPerDay[0]) {
  const { power, mix } = data.config;
  const k = power.kettle;
  const e3 = power.elite300;
  const hotDrinks = customers * mix.hotDrinksPerCustomer;
  const litres = (hotDrinks * k.cupMl) / 1000;
  const boilWh = (k.usableLitresPerBoil * 4186 * (100 - k.inletC)) / k.efficiency / 3600 / e3.inverterEfficiency;
  const fullBoils = ceilTo(litres / k.usableLitresPerBoil);
  const boils = fullBoils * (1 + k.reboilAllowance);
  const kettleWh = boils * boilWh;
  const cupsPerBoil = Math.floor((k.usableLitresPerBoil * 1000) / k.cupMl);
  const amps = k.maxW / e3.volts;

  const f = power.fridge;
  const fridgeWh = f.avgA * f.volts * 24;
  const fridgeHotWh = f.hotDayA * f.volts * 24;
  const e1 = power.elite100;

  const overnightWh = power.overnight.reduce((a, o) => a + o.wh, 0);
  return {
    hotDrinks,
    litres,
    cupsPerBoil,
    boilWh,
    fullBoils,
    boils,
    kettleWh,
    kettleShare: kettleWh / e3.usableWh,
    kettleOk: k.maxW <= e3.maxOutputW && amps <= e3.socketsSharedA,
    amps,
    maxCupsOnCharge: Math.floor((e3.usableWh / (boilWh * (1 + k.reboilAllowance))) * cupsPerBoil),
    fridgeWh,
    fridgeHotWh,
    fridgeDays: e1.usableWh / fridgeWh,
    fridgeHotDays: e1.usableWh / fridgeHotWh,
    overnightWh,
  };
}
