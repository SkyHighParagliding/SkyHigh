/**
 * Simulate one lunch service through the till maths.
 *
 *   npm run sizzle:simulate                 → 75 customers, seed 1
 *   npm run sizzle:simulate -- 62 7         → 62 customers, seed 7
 *
 * Customers order from the editable lunch mix, pay by card with probability s
 * (config.card.share), and cash customers tender from the float tender mix. The
 * cash drawer starts with the recommended float and change is paid from what is
 * physically in it, so a float that runs out of $5s shows up as a shortfall.
 * Stock starts from the Day 1 initial shop and is depleted via the BOM.
 */

import fs from "node:fs";
import path from "node:path";
import {
  type Sale,
  breakdown,
  cardReconcile,
  cashUp,
  priceMap,
  recommendFloat,
  saleTotal,
  salesDepletion,
  shoppingPlan,
  subtractQty,
  summariseSales,
  type SizzleData,
} from "../../shared/sizzle/calc.ts";
import { eventReport, planningLessons } from "../../shared/sizzle/report.ts";

const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/sizzle/sizzle-2026.json"), "utf8")) as SizzleData;
const customers = Number(process.argv[2] ?? 75);
let seed = Number(process.argv[3] ?? 1);

// Deterministic PRNG (mulberry32) so a run can be repeated exactly.
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const { mix, card, float: fc } = data.config;
const prices = priceMap(data);
const floatPlan = recommendFloat(data);
const drawer: Record<number, number> = { 50: 0, ...floatPlan.counts };
const DENOMS = [50, 20, 10, 5, 2, 1];
const NOTES = [5, 10, 20, 50];

const missing: Record<number, number> = {};

/** Pay change from what is in the drawer, trying fewer large notes when greedy gets stuck. */
function payChange(amount: number): boolean {
  const solve = (left: number, i: number): Record<number, number> | null => {
    if (left === 0) return {};
    if (i >= DENOMS.length) return null;
    const d = DENOMS[i];
    for (let n = Math.min(Math.floor(left / d), drawer[d] ?? 0); n >= 0; n--) {
      const rest = solve(left - n * d, i + 1);
      if (rest) return n ? { ...rest, [d]: n } : rest;
    }
    return null;
  };
  const take = solve(amount, 0);
  if (!take) {
    // Record the smallest denomination that would have completed the change greedily.
    let left = amount;
    for (const d of DENOMS) {
      const n = Math.min(Math.floor(left / d), drawer[d] ?? 0);
      left -= n * d;
    }
    const need = [...DENOMS].reverse().find((d) => d <= left) ?? 1;
    missing[need] = (missing[need] ?? 0) + 1;
    return false;
  }
  for (const [d, n] of Object.entries(take)) drawer[Number(d)] -= n;
  return true;
}

function pickTender(total: number): number {
  let r = rand();
  for (const t of fc.tenders) {
    if ((r -= t.share) <= 0) return t.note === 0 ? total : t.note >= total ? t.note : NOTES.find((x) => x >= total) ?? 50;
  }
  return NOTES.find((x) => x >= total) ?? 50;
}

const sales: Sale[] = [];
let shortfalls = 0;
for (let c = 0; c < customers; c++) {
  const qty: Record<string, number> = {};
  const add = (id: string) => (qty[id] = (qty[id] ?? 0) + 1);
  const whole = Math.floor(mix.sausageServesPerCustomer);
  const sausages = whole + (rand() < mix.sausageServesPerCustomer - whole ? 1 : 0);
  for (let i = 0; i < sausages; i++) add(rand() < mix.vegShare ? "veg_sausage" : "sausage");
  if (rand() < mix.hotDrinksPerCustomer) add(rand() < mix.coffeeShareOfHot ? "coffee" : "tea");
  if (rand() < mix.coldDrinksPerCustomer) add(rand() < mix.waterShareOfCold ? "water" : rand() < mix.colaShareOfCans ? "cola" : "lemonade");

  const lines = Object.entries(qty).map(([item, n]) => ({ item, qty: n, unitPrice: prices[item] }));
  const total = saleTotal(lines);
  const isCard = rand() < card.share;
  let tendered: number | null = null;
  let change: number | null = null;
  if (!isCard) {
    tendered = pickTender(total);
    change = tendered - total;
    if (tendered === total) {
      // Exact money arrives as the fewest notes/coins that make the total.
      for (const [d, n] of Object.entries(breakdown(total, DENOMS))) drawer[Number(d)] = (drawer[Number(d)] ?? 0) + n;
    } else {
      drawer[tendered] = (drawer[tendered] ?? 0) + 1;
    }
    if (change > 0 && !payChange(change)) shortfalls++;
  }
  sales.push({ id: `sim-${c}`, createdAt: new Date().toISOString(), day: 1, lines, total, method: isCard ? "card" : "cash", tendered, change, voided: false });
}


const summary = summariseSales(sales);
const exactCash = 0;
const drawerValue = Object.entries(drawer).reduce((a, [d, n]) => a + Number(d) * n, 0) + exactCash;
const cash = cashUp(floatPlan.total, sales, drawerValue);
const cardRec = cardReconcile(sales, summary.cardTotal, card);

const plan = shoppingPlan(data);
const opening = plan.openingStock[0];
const used = salesDepletion(data, sales);
const after = subtractQty(opening, used);
const products = Object.fromEntries(data.products.map((p) => [p.id, p]));

console.log(`\nSimulated lunch: ${customers} customers (seed ${process.argv[3] ?? 1}), card share ${card.share * 100}%\n`);
console.log("Sales by item");
console.table(Object.fromEntries(data.menu.filter((m) => summary.byItem[m.id]).map((m) => [m.short, { qty: summary.byItem[m.id].qty, price: prices[m.id], cash: summary.byItem[m.id].cash, card: summary.byItem[m.id].card, total: summary.byItem[m.id].total }])));
console.log(`Cash sales: ${summary.cashCount} → $${summary.cashTotal.toFixed(2)}`);
console.log(`Card sales: ${summary.cardCount} → $${summary.cardTotal.toFixed(2)}  (est. Stripe fees $${cardRec.estFees.toFixed(2)})`);
console.log(`Total:      $${summary.total.toFixed(2)}`);
console.log(`\nCash drawer: float $${floatPlan.total} + cash sales $${cash.cashSales.toFixed(2)} = expected $${cash.expected.toFixed(2)}; drawer holds $${drawerValue.toFixed(2)} → variance $${(cash.variance ?? 0).toFixed(2)}`);
console.log(`Drawer at close by denomination: ${DENOMS.map((d) => `$${d}×${drawer[d] ?? 0}`).join("  ")}`);
console.log(shortfalls ? `⚠ Change shortfalls: ${shortfalls} sale(s) could not be given exact change from the drawer (short of: ${Object.entries(missing).map(([d, n]) => `$${d}×${n}`).join(", ")}).` : "✓ Every cash customer got change from the float — no shortfalls.");
console.log("\nStock (from the Day 1 initial shop)");
console.table(Object.fromEntries(Object.entries(used).map(([pid, u]) => [pid, { unit: products[pid].unit, opening: Math.round(opening[pid] ?? 0), used: Math.round(u * 10) / 10, left: Math.round((after[pid] ?? 0) * 10) / 10 }])));
const negative = Object.entries(after).filter(([, v]) => v < 0);
console.log(negative.length ? `⚠ Ran out: ${negative.map(([k]) => k).join(", ")}` : "✓ No component ran out.");

// Treasurer view of the simulated day: the initial shop as the only receipt,
// the drawer count as the close, the till's card total as Stripe's gross.
const report = eventReport(
  data,
  sales,
  { 1: { day: 1, floatCounts: floatPlan.counts, counted: drawerValue, stripeTotal: summary.cardTotal } },
  [{ id: "sim-shop", date: data.event.days[0].date, day: 0, store: "Woolworths Bright", amount: plan.initial.total + plan.initial.otherTotal, purpose: "Initial shop", paidBy: "sim", note: "planned list total" }],
  [],
  null,
  after,
);
const lessons = planningLessons(data, sales, report, after);
console.log("\nTreasurer view (Day 1 only; the initial shop is the only receipt, so 4 days of non-perishables are charged against 1 day of sales)");
console.log(`  Sales $${report.totals.sales.toFixed(2)} − purchases $${report.purchasesTotal.toFixed(2)} − est. Stripe fees $${report.stripe.feesUsed.toFixed(2)} = net $${report.profit.net.toFixed(2)}`);
console.log(`  Cash to bank $${report.cash.toBank.toFixed(2)}; leftover stock at cost $${report.closingStockValue.toFixed(2)}`);
console.log(`  Lessons: ${lessons.notes.slice(1, 3).join(" | ")}`);
