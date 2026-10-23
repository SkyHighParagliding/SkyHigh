/**
 * Treasurer figures and lessons for the next event — pure functions over the
 * till's records. Used by the till's Report tab, its PDF/CSV exports and the
 * tests. Money maths lives in calc.ts; this file only adds up what happened.
 */

import {
  type Mix,
  type Qty,
  type Sale,
  type SizzleData,
  FRUIT,
  cardReconcile,
  dayForecasts,
  denomTotal,
  productIndex,
  roundCents,
  shoppingPlan,
  summariseSales,
  unitCost,
} from "./calc.ts";

/** A shop actually paid for (from the receipt). `day` 0 = before Day 1. */
export interface Purchase {
  id: string;
  date: string;
  day: number;
  store: string;
  amount: number;
  purpose: string;
  paidBy: string;
  note: string;
  /** Compressed JPEG data URL of the receipt, if photographed. */
  receipt?: string | null;
  deleted?: boolean;
}

/** Cash taken out of the box and banked (or handed to the treasurer). */
export interface Banking {
  id: string;
  date: string;
  day: number;
  amount: number;
  by: string;
  note: string;
  deleted?: boolean;
}

/** Figures from Stripe's payout report, entered after the event. */
export interface StripeActual {
  gross: number | null;
  fees: number | null;
  net: number | null;
  note: string;
}

/** The parts of an End-of-day close the report needs. */
export interface CloseRecord {
  day: number;
  floatCounts: Record<string, number>;
  counted: number | null;
  stripeTotal: number | null;
}

export interface DayReport {
  day: number;
  label: string;
  sales: number;
  cash: number;
  card: number;
  transactions: number;
  cashTxns: number;
  cardTxns: number;
  voids: number;
  voidValue: number;
  estFees: number;
  float: number | null;
  expectedCash: number | null;
  countedCash: number | null;
  cashVariance: number | null;
  stripeEntered: number | null;
  stripeVariance: number | null;
  plannedSales: number;
  plannedCustomers: number;
  closed: boolean;
}

export interface EventReport {
  event: SizzleData["event"];
  days: DayReport[];
  totals: { sales: number; cash: number; card: number; transactions: number; cashTxns: number; cardTxns: number; voids: number; voidValue: number; estFees: number; cashVariance: number; plannedSales: number };
  byItem: { item: string; name: string; qty: number; revenue: number; cash: number; card: number }[];
  purchases: Purchase[];
  purchasesTotal: number;
  plannedSpend: number;
  banking: Banking[];
  bankedTotal: number;
  stripe: { estFees: number; actualFees: number | null; gross: number | null; net: number | null; feesUsed: number; feesSource: "actual" | "estimate" };
  /** Leftover stock valued at shelf cost (not at sell price). */
  closingStock: { product: string; name: string; unit: string; qty: number; value: number }[];
  closingStockValue: number;
  profit: { sales: number; purchases: number; fees: number; net: number };
  /** Cash takings (sales ± counted variances) still to be banked. */
  cash: { cashSales: number; variance: number; banked: number; toBank: number };
}

/** Whole-event money summary. `sales` must already be filtered to this event. */
export function eventReport(
  data: SizzleData,
  sales: Sale[],
  closes: Record<number, CloseRecord>,
  purchasesIn: Purchase[],
  bankingIn: Banking[],
  stripe: StripeActual | null,
  onHand: Qty,
): EventReport {
  const forecasts = dayForecasts(data);
  const { card } = data.config;
  const days: DayReport[] = data.event.days.map((d, i) => {
    const ds = sales.filter((s) => s.day === d.n);
    const sum = summariseSales(ds);
    const c = closes[d.n];
    const fl = c ? denomTotal(c.floatCounts) : null;
    const expected = fl === null ? null : roundCents(fl + sum.cashTotal);
    const rec = cardReconcile(ds, c?.stripeTotal ?? null, card);
    return {
      day: d.n,
      label: d.label,
      sales: sum.total,
      cash: sum.cashTotal,
      card: sum.cardTotal,
      transactions: sum.cashCount + sum.cardCount,
      cashTxns: sum.cashCount,
      cardTxns: sum.cardCount,
      voids: sum.voidCount,
      voidValue: roundCents(ds.filter((s) => s.voided).reduce((a, s) => a + s.total, 0)),
      estFees: rec.estFees,
      float: fl,
      expectedCash: expected,
      countedCash: c?.counted ?? null,
      cashVariance: c?.counted != null && expected !== null ? roundCents(c.counted - expected) : null,
      stripeEntered: c?.stripeTotal ?? null,
      stripeVariance: rec.variance,
      plannedSales: roundCents(forecasts[i]?.revenue ?? 0),
      plannedCustomers: data.config.customersPerDay[i] ?? 0,
      closed: !!c,
    };
  });
  const t = (f: (d: DayReport) => number) => roundCents(days.reduce((a, d) => a + f(d), 0));
  const totals = {
    sales: t((d) => d.sales),
    cash: t((d) => d.cash),
    card: t((d) => d.card),
    transactions: t((d) => d.transactions),
    cashTxns: t((d) => d.cashTxns),
    cardTxns: t((d) => d.cardTxns),
    voids: t((d) => d.voids),
    voidValue: t((d) => d.voidValue),
    estFees: t((d) => d.estFees),
    cashVariance: t((d) => d.cashVariance ?? 0),
    plannedSales: t((d) => d.plannedSales),
  };

  const all = summariseSales(sales);
  const byItem = data.menu.map((m) => {
    const r = all.byItem[m.id];
    return { item: m.id, name: m.name, qty: r?.qty ?? 0, revenue: roundCents(r?.total ?? 0), cash: roundCents(r?.cash ?? 0), card: roundCents(r?.card ?? 0) };
  });

  const purchases = purchasesIn.filter((p) => !p.deleted).sort((a, b) => a.date.localeCompare(b.date));
  const purchasesTotal = roundCents(purchases.reduce((a, p) => a + p.amount, 0));
  const plan = shoppingPlan(data);
  const plannedSpend = roundCents([plan.initial, ...plan.topUps].reduce((a, l) => a + l.total + l.otherTotal, 0));
  const banking = bankingIn.filter((b) => !b.deleted).sort((a, b) => a.date.localeCompare(b.date));
  const bankedTotal = roundCents(banking.reduce((a, b) => a + b.amount, 0));

  const actualFees = stripe?.fees ?? null;
  const feesUsed = roundCents(actualFees ?? totals.estFees);

  const products = productIndex(data);
  // Ice melts, so it is never counted as leftover stock.
  const closingStock = Object.entries(onHand)
    .filter(([pid, q]) => products[pid] && products[pid].carryOver !== false && q > 0.0001)
    .map(([pid, q]) => ({ product: pid, name: products[pid].name, unit: products[pid].unit, qty: q, value: roundCents(q * unitCost(products[pid])) }))
    .sort((a, b) => b.value - a.value);
  const closingStockValue = roundCents(closingStock.reduce((a, s) => a + s.value, 0));

  return {
    event: data.event,
    days,
    totals,
    byItem,
    purchases,
    purchasesTotal,
    plannedSpend,
    banking,
    bankedTotal,
    stripe: { estFees: totals.estFees, actualFees, gross: stripe?.gross ?? null, net: stripe?.net ?? null, feesUsed, feesSource: actualFees === null ? "estimate" : "actual" },
    closingStock,
    closingStockValue,
    profit: { sales: totals.sales, purchases: purchasesTotal, fees: feesUsed, net: roundCents(totals.sales - purchasesTotal - feesUsed) },
    cash: { cashSales: totals.cash, variance: totals.cashVariance, banked: bankedTotal, toBank: roundCents(totals.cash + totals.cashVariance - bankedTotal) },
  };
}

/** One row per line for the treasurer's spreadsheet. */
export function reportCsv(r: EventReport): string {
  const rows: (string | number)[][] = [["section", "label", "value", "detail"]];
  for (const d of r.days) {
    rows.push(["day", `Day ${d.day} ${d.label}`, d.sales, `cash ${d.cash} | card ${d.card} | sales ${d.transactions} | voids ${d.voids} (${d.voidValue}) | est fees ${d.estFees} | cash variance ${d.cashVariance ?? ""} | stripe variance ${d.stripeVariance ?? ""}`]);
  }
  rows.push(["total", "Sales", r.totals.sales, `cash ${r.totals.cash} | card ${r.totals.card}`]);
  for (const i of r.byItem) rows.push(["item", i.name, i.revenue, `qty ${i.qty} | cash ${i.cash} | card ${i.card}`]);
  for (const p of r.purchases) rows.push(["purchase", `${p.date} ${p.store}`, -p.amount, `${p.purpose} | paid by ${p.paidBy} | ${p.note}${p.receipt ? " | receipt photo" : ""}`]);
  rows.push(["total", "Purchases", -r.purchasesTotal, `planned ${r.plannedSpend}`]);
  rows.push(["total", `Stripe fees (${r.stripe.feesSource})`, -r.stripe.feesUsed, `estimate ${r.stripe.estFees}`]);
  rows.push(["total", "Net result", r.profit.net, "sales − purchases − Stripe fees"]);
  for (const b of r.banking) rows.push(["banked", `${b.date} ${b.by}`, b.amount, b.note]);
  rows.push(["total", "Cash still to bank", r.cash.toBank, `cash sales ${r.cash.cashSales} + count variance ${r.cash.variance} − banked ${r.cash.banked}`]);
  rows.push(["total", "Leftover stock at cost", r.closingStockValue, "not included in the net result"]);
  return rows.map((row) => row.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(",")).join("\n");
}

// ─── Lessons for the next event ───────────────────────────────────────────────

export interface Lessons {
  event: string;
  eventId: string;
  generatedAt: string;
  basis: string;
  perDay: { day: number; label: string; customers: number; planned: number; firstSale: string | null; lastSale: string | null; busiestHalfHour: string | null; busiestCount: number }[];
  halfHours: Record<string, number>;
  actualMix: Mix;
  plannedMix: Mix;
  cardShare: { planned: number; actual: number | null };
  itemsPerCardSale: { planned: number; actual: number | null };
  averageSpend: number | null;
  leftovers: { product: string; name: string; qty: number; unit: string; packs: number }[];
  spend: { planned: number; actual: number };
  suggestedConfig: { customersPerDay: number[]; mix: Mix; card: { share: number; itemsPerTxn: number } };
  notes: string[];
}

function melbourneParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const h = (parts.find((p) => p.type === "hour")?.value ?? "00").replace(/^24$/, "00");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { h: h.padStart(2, "0"), m };
}

export function halfHourOf(iso: string): string {
  const { h, m } = melbourneParts(iso);
  return `${h}:${m < 30 ? "00" : "30"}`;
}

function timeOf(iso: string): string {
  const { h, m } = melbourneParts(iso);
  return `${h}:${String(m).padStart(2, "0")}`;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * What actually happened, in the same terms as the plan's assumptions, so the
 * next event's data file can start from real numbers. One sale = one customer.
 * `sales` must already be filtered to this event.
 */
export function planningLessons(data: SizzleData, sales: Sale[], report: EventReport, onHand: Qty): Lessons {
  const ok = sales.filter((s) => !s.voided);
  const n = ok.length;
  const qty = (id: string) => ok.reduce((a, s) => a + s.lines.filter((l) => l.item === id).reduce((b, l) => b + l.qty, 0), 0);
  const saus = qty("sausage") + qty("veg_sausage");
  const hot = qty("coffee") + qty("tea");
  const cold = qty("water") + qty("cola") + qty("lemonade");
  const cans = qty("cola") + qty("lemonade");
  const plannedMix = data.config.mix;
  const share = (a: number, b: number, fallback: number) => (b > 0 ? r3(a / b) : fallback);
  const actualMix: Mix = n
    ? {
        sausageServesPerCustomer: r3(saus / n),
        vegShare: share(qty("veg_sausage"), saus, plannedMix.vegShare),
        hotDrinksPerCustomer: r3(hot / n),
        coffeeShareOfHot: share(qty("coffee"), hot, plannedMix.coffeeShareOfHot),
        coldDrinksPerCustomer: r3(cold / n),
        waterShareOfCold: share(qty("water"), cold, plannedMix.waterShareOfCold),
        colaShareOfCans: share(qty("cola"), cans, plannedMix.colaShareOfCans),
        fruitPerCustomer: r3(FRUIT.reduce((a, f) => a + qty(f), 0) / n),
      }
    : { ...plannedMix };

  const cardSales = ok.filter((s) => s.method === "card");
  const cardItems = cardSales.reduce((a, s) => a + s.lines.reduce((b, l) => b + l.qty, 0), 0);

  const halfHours: Record<string, number> = {};
  const perDay = data.event.days.map((d, i) => {
    const ds = ok.filter((s) => s.day === d.n).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const buckets: Record<string, number> = {};
    for (const s of ds) {
      const hh = halfHourOf(s.createdAt);
      buckets[hh] = (buckets[hh] ?? 0) + 1;
      halfHours[hh] = (halfHours[hh] ?? 0) + 1;
    }
    const top = Object.entries(buckets).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return {
      day: d.n,
      label: d.label,
      customers: ds.length,
      planned: data.config.customersPerDay[i] ?? 0,
      firstSale: ds.length ? timeOf(ds[0].createdAt) : null,
      lastSale: ds.length ? timeOf(ds[ds.length - 1].createdAt) : null,
      busiestHalfHour: top ? top[0] : null,
      busiestCount: top ? top[1] : 0,
    };
  });

  const products = productIndex(data);
  const leftovers = Object.entries(onHand)
    .filter(([pid, q]) => products[pid] && !products[pid].notWoolworths && products[pid].carryOver !== false && q > 0.0001)
    .map(([pid, q]) => ({ product: pid, name: products[pid].name, qty: Math.round(q * 10) / 10, unit: products[pid].unit, packs: Math.round((q / products[pid].unitsPerPack) * 100) / 100 }))
    .sort((a, b) => b.packs - a.packs);

  const traded = perDay.filter((d) => d.customers > 0);
  const avgCustomers = traded.length ? Math.round(traded.reduce((a, d) => a + d.customers, 0) / traded.length) : null;
  const cardShareActual = n ? r3(cardSales.length / n) : null;
  const itemsActual = cardSales.length ? r3(cardItems / cardSales.length) : null;

  const notes: string[] = [];
  if (!n) {
    notes.push("No sales recorded yet — the suggested settings are the original plan.");
  } else {
    notes.push(`Customers are counted as till sales (one sale = one customer): ${n} sales over ${traded.length} trading day(s), average spend $${(report.totals.sales / n).toFixed(2)}.`);
    for (const d of perDay) {
      if (d.customers) notes.push(`${d.label}: ${d.customers} customers vs ${d.planned} planned; first sale ${d.firstSale}, last ${d.lastSale}; busiest half-hour from ${d.busiestHalfHour} (${d.busiestCount} sales).`);
    }
    notes.push(`Card share ${Math.round((cardShareActual ?? 0) * 100)}% vs ${Math.round(data.config.card.share * 100)}% planned; ${itemsActual ?? "—"} items per card sale vs ${data.config.card.itemsPerTxn} planned.`);
    const big = leftovers.filter((l) => l.packs >= 1);
    if (big.length) notes.push(`Left over (a pack or more): ${big.map((l) => `${l.name} — ${l.packs} pack${l.packs === 1 ? "" : "s"}`).join("; ")}.`);
    notes.push(`Spend: $${report.purchasesTotal.toFixed(2)} from receipts vs $${report.plannedSpend.toFixed(2)} planned.`);
  }

  return {
    event: data.event.title,
    eventId: data.event.id,
    generatedAt: new Date().toISOString(),
    basis: "Actual till sales for this event. Mix values are per customer (per sale), in the same units as config.mix in the data file — paste suggestedConfig into the next event's file as a starting point.",
    perDay,
    halfHours: Object.fromEntries(Object.entries(halfHours).sort()),
    actualMix,
    plannedMix,
    cardShare: { planned: data.config.card.share, actual: cardShareActual },
    itemsPerCardSale: { planned: data.config.card.itemsPerTxn, actual: itemsActual },
    averageSpend: n ? roundCents(report.totals.sales / n) : null,
    leftovers,
    spend: { planned: report.plannedSpend, actual: report.purchasesTotal },
    suggestedConfig: {
      customersPerDay: perDay.map((d) => (d.customers ? d.customers : avgCustomers ?? d.planned)),
      mix: actualMix,
      card: { share: cardShareActual ?? data.config.card.share, itemsPerTxn: itemsActual ?? data.config.card.itemsPerTxn },
    },
    notes,
  };
}
