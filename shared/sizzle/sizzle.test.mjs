/**
 * Sausage sizzle maths tests — no network, no database.
 *
 * Run with:  node --import tsx/esm shared/sizzle/sizzle.test.mjs
 *
 * Expected values are worked out by hand in the comments, not by calling the
 * function under test a second way.
 */

import fs from "node:fs";
import {
  breakdown,
  cardFeePerServe,
  cardReconcile,
  cashUp,
  ceilTo,
  changeDue,
  depletion,
  itemLowStockBelow,
  lowStockBelow,
  packsFor,
  powerBudget,
  productIndex,
  pricingTable,
  rawPrice,
  recommendFloat,
  salesDepletion,
  sellPrice,
  shoppingPlan,
  summariseSales,
  topUpNeed,
} from "./calc.ts";

const real = JSON.parse(fs.readFileSync(new URL("../../data/sizzle/sizzle-2026.json", import.meta.url), "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ─── Rounding ──────────────────────────────────────────────────────────────
console.log("\nRounding");
const sausage = real.products.find((p) => p.id === "sausage"); // 26 per pack
assert(packsFor(26, sausage) === 1, "26 sausages → 1 pack of 26");
assert(packsFor(27, sausage) === 2, "27 sausages → 2 packs");
assert(packsFor(0, sausage) === 0, "0 needed → 0 packs");
assert(packsFor(26.000000000004, sausage) === 1, "float noise above a whole pack does not add a pack");
assert(ceilTo(1.01) === 2 && ceilTo(1) === 1 && ceilTo(0.2, 0.5) === 0.5, "ceilTo rounds up to the step");

// ─── Change ────────────────────────────────────────────────────────────────
console.log("\nChange");
assert(changeDue(7, 20) === 13, "$20 for $7 → $13 change");
assert(changeDue(9, 9) === 0, "exact money → $0");
assert(changeDue(9, 5) === null, "short tender → null (not allowed)");
assert(changeDue(9.99, 10) === 0.01, "cents don't drift: $10 − $9.99 = $0.01");
const b13 = breakdown(13);
assert(b13[10] === 1 && b13[2] === 1 && b13[1] === 1 && Object.keys(b13).length === 3, "$13 = $10 + $2 + $1");
const b45 = breakdown(45);
assert(b45[20] === 2 && b45[5] === 1, "$45 = 2×$20 + $5");
const b165 = breakdown(changeDue(3.5, 20));
assert(b165[10] === 1 && b165[5] === 1 && b165[1] === 1 && b165[0.5] === 1 && Object.keys(b165).length === 4, "$20 for a $3.50 sausage → $10 + $5 + $1 + 50c (not rounded to $17)");
const b07 = breakdown(0.7);
assert(b07[0.5] === 1 && b07[0.2] === 1 && Object.keys(b07).length === 2, "70c = 50c + 20c");

// ─── Depletion via the bill of materials ───────────────────────────────────
console.log("\nDepletion");
const p = real.config.portions;
const d1 = depletion(real, { sausage: 2, coffee: 1 });
assert(d1.sausage === 2 && d1.bread === 2, "2 sausages → 2 sausages + 2 slices");
assert(d1.onion === 2 * p.onionG, `onion = 2 × ${p.onionG} g`);
assert(d1.tomato_sauce === 2 * p.tomatoSauceMl, "tomato sauce scales with serves");
assert(d1.coffee === p.coffeeGPerCup && d1.hot_cups === 1 && d1.milk === p.milkMlPerCup, "1 coffee → coffee g, 1 cup, milk ml");
assert(d1.serviettes === 2, "1 serviette per food serve");
assert(d1.veg_sausage === undefined, "meat sale does not touch veg sausages");
const noOnion = clone(real);
noOnion.config.onionsEnabled = false;
assert(depletion(noOnion, { sausage: 3 }).onion === undefined, "onionsEnabled=false → no onion depletion");
const sales = [
  { id: "a", createdAt: "", day: 1, lines: [{ item: "sausage", qty: 2, unitPrice: 2 }], total: 4, method: "cash", tendered: 5, change: 1, voided: false },
  { id: "b", createdAt: "", day: 1, lines: [{ item: "sausage", qty: 5, unitPrice: 2 }], total: 10, method: "card", tendered: null, change: null, voided: true },
  { id: "c", createdAt: "", day: 1, lines: [{ item: "water", qty: 1, unitPrice: 1 }, { item: "veg_sausage", qty: 1, unitPrice: 2 }], total: 3, method: "card", tendered: null, change: null, voided: false },
];
const sd = salesDepletion(real, sales);
assert(sd.sausage === 2 && sd.veg_sausage === 1 && sd.water === 1 && sd.bread === 3, "voided sale is not depleted");

// ─── Card fee and pricing formula ──────────────────────────────────────────
console.log("\nCard fee + pricing");
const cfg = clone(real.config);
cfg.markup = 1.1;
cfg.priceStep = 1;
Object.assign(cfg.card, { share: 0.7, itemsPerTxn: 2, pct: 0.0165, fixed: 0.1, tapToPayFee: 0.15, worstShare: 1, worstItemsPerTxn: 1 });
// C = 1.00: P = 1.1 × (1 + 0.7×0.25/2) / (1 − 1.1×0.7×0.0165) = 1.19625 / 0.987295 = 1.211644…
assert(near(rawPrice(1, cfg), 1.19625 / 0.987295), "raw price matches the hand-worked formula");
assert(sellPrice(1, cfg) === 2, "…and rounds UP to $2");
// Fixed point: P = 1.1 × (C + fee(P))
const raw = rawPrice(1.37, cfg);
assert(near(raw, 1.1 * (1.37 + cardFeePerServe(raw, cfg.card))), "raw price satisfies P = markup × (C + card fee at P)");
// Worst case s=1, n=1: P = 1.1 × 1.25 / (1 − 0.01815) = 1.40042… → $2
assert(near(rawPrice(1, cfg, 1, 1), 1.375 / 0.98185), "worst case (s=100%, n=1) formula");
// C = 0.85: normal raw = 1.1×0.9375/0.987295 = 1.0445 → $2; worst = 1.1×1.10/0.98185 = 1.2323 → $2 (no change)
// C = 0.80: normal raw = 1.1×0.8875/0.987295 = 0.98880 → $1; worst = 1.1×1.05/0.98185 = 1.1763 → $2 (CHANGES)
const tiny = clone(real);
tiny.config = cfg;
tiny.menu = [{ id: "x", name: "X", short: "X", group: "cold", colour: "#000", bom: [{ product: "fixture", qty: 1 }] }];
tiny.products = [{ ...real.products[0], id: "fixture", unitsPerPack: 1, price: 0.8 }];
tiny.config.dailyConsumables = [];
const row = pricingTable(tiny)[0];
assert(row.price === 1 && row.worstPrice === 2 && row.worstChanges === true, "worst-case flag set when the rounded price would change (C=$0.80: $1 → $2)");
tiny.products[0].price = 0.85;
const row2 = pricingTable(tiny)[0];
assert(row2.price === 2 && row2.worstChanges === false, "no flag when both cases round to the same $ (C=$0.85)");
assert(near(row2.cardFee, 0.7 * (0.25 / 2 + 0.0165 * 2)), "card fee/serve at P=$2 = 0.7 × (0.125 + 0.033) = $0.1106");
tiny.config.priceOverrides = { x: 3 };
assert(pricingTable(tiny)[0].price === 3 && pricingTable(tiny)[0].overridden, "admin price override wins");

// ─── Cash-up and card reconciliation ───────────────────────────────────────
console.log("\nCash-up + card reconciliation");
const cu = cashUp(165, sales, 170);
assert(cu.cashSales === 4 && cu.expected === 169 && cu.variance === 1, "expected cash = float + CASH sales only ($165 + $4); $170 counted → +$1");
const rec = cardReconcile(sales, 3, cfg.card);
assert(rec.tillTotal === 3 && rec.count === 1 && rec.variance === 0, "card total excludes voided card sale; Stripe $3 → variance 0");
assert(near(rec.estFees, 0.25 + 0.0165 * 3, 0.006), "estimated fee = $0.25 + 1.65% per card sale");
assert(cardReconcile(sales, 2.5, cfg.card).variance === -0.5, "Stripe short by $0.50 → −$0.50");
const sum = summariseSales(sales);
assert(sum.cashTotal === 4 && sum.cardTotal === 3 && sum.voidCount === 1 && sum.byItem.sausage.qty === 2, "summary splits cash/card and skips voids");

// ─── Top-up maths ──────────────────────────────────────────────────────────
console.log("\nTop-ups");
const usage75 = topUpNeed(real, {}, [0]);
const need = topUpNeed(real, { sausage: 50, ice: 100 }, [0]);
assert(near(need.sausage, usage75.sausage - 50), "top-up = par − on hand");
assert(near(need.ice, usage75.ice), "ice never carries over (melts) — on-hand ignored");
assert(topUpNeed(real, { sausage: 9999 }, [0]).sausage === 0, "on hand above par → buy nothing (never negative)");
// Buffer is added once per period, and not at all when the period includes the last day.
const buf = sausage.bufferUnits ?? 0;
const day = usage75.sausage - buf;
const two = topUpNeed(real, { sausage: 10 }, [1, 2]);
assert(near(two.sausage, 2 * day + buf - 10), "2-day top-up = two days' usage + buffer − on hand");
const last = topUpNeed(real, { sausage: 10 }, [3]);
assert(last.sausage < topUpNeed(real, { sausage: 10 }, [2]).sausage, "Day 4 par has no safety buffer (minimise leftovers)");

const plan = shoppingPlan(real);
const init = Object.fromEntries(plan.initial.lines.map((l) => [l.product.id, l.packs]));
assert(init.sausage === Math.ceil(usage75.sausage / 26), "initial shop: perishables for Day 1 only");
const cupsAll = plan.usage.reduce((a, u) => a + (u.hot_cups ?? 0), 0);
assert(init.hot_cups === Math.ceil(cupsAll / 16 - 1e-9), "initial shop: non-perishables for all 4 days");
assert(plan.initial.lines.every((l) => Number.isInteger(l.packs) && l.packs * l.product.unitsPerPack >= l.need - 1e-9), "every line is whole packs and covers the need");
assert(near(plan.initial.total, plan.initial.lines.reduce((a, l) => a + l.lineTotal, 0), 0.001), "list total = sum of line totals");
assert(plan.topUps.length === 3 && plan.twoDay.length === 2, "Day 2/3/4 top-ups + Days 2–3 and 3–4 combined");
assert(plan.leftoverAfterLastDay.sausage < 26, "Day 4 sized to leave less than one pack of sausages over");
for (const [i, t] of plan.twoDay.entries()) {
  const one = plan.topUps[i];
  const ok = one.lines.every((l) => (t.lines.find((x) => x.product.id === l.product.id)?.packs ?? 0) >= l.packs);
  assert(ok, `${t.title} buys at least as much as the 1-day list`);
}

// ─── Float ─────────────────────────────────────────────────────────────────
console.log("\nFloat");
const f = recommendFloat(real);
const tot = Object.entries(f.counts).reduce((a, [d, n]) => a + Number(d) * n, 0);
assert(f.total === tot, `float total $${f.total} = sum of denominations`);
assert(f.counts[1] % 5 === 0 && f.counts[2] % 5 === 0, "coins rounded to multiples of 5");
assert(f.cashCustomers < real.config.customersPerDay[0], "float sized on cash customers only (1 − card share)");
const lessCash = clone(real);
lessCash.config.card.share = 0.9;
assert(recommendFloat(lessCash).total <= f.total, "higher card share → float no bigger");
assert(!f.counts[0.5], "whole-dollar prices → no 50c coins in the float");
const halves = clone(real);
halves.config.priceOverrides = { ...halves.config.priceOverrides, sausage: 3.5, veg_sausage: 3.5 };
const fh = recommendFloat(halves);
const totH = Object.entries(fh.counts).reduce((a, [d, n]) => a + Number(d) * n, 0);
assert(fh.counts[0.5] > 0 && fh.counts[0.5] % 5 === 0, `$3.50 sausages → ${fh.counts[0.5]} × 50c in the float (multiple of 5)`);
assert(Math.abs(fh.total - totH) < 0.005, `50c float total $${fh.total} = sum of denominations`);

// ─── Treasurer report + lessons ────────────────────────────────────────────
console.log("\nTreasurer report");
const { eventReport, planningLessons, reportCsv, halfHourOf } = await import("./report.ts");
// 12:05 and 12:40 AEDT on Sat 31 Oct 2026 (UTC+11) → 01:05Z / 01:40Z
const rs = [
  { id: "r1", createdAt: "2026-10-31T01:05:00.000Z", day: 1, lines: [{ item: "sausage", qty: 2, unitPrice: 2 }, { item: "coffee", qty: 1, unitPrice: 2 }], total: 6, method: "cash", tendered: 10, change: 4, voided: false },
  { id: "r2", createdAt: "2026-10-31T01:40:00.000Z", day: 1, lines: [{ item: "veg_sausage", qty: 1, unitPrice: 2 }, { item: "water", qty: 1, unitPrice: 1 }], total: 3, method: "card", tendered: null, change: null, voided: false },
  { id: "r3", createdAt: "2026-10-31T01:45:00.000Z", day: 1, lines: [{ item: "cola", qty: 1, unitPrice: 2 }], total: 2, method: "card", tendered: null, change: null, voided: true },
  { id: "r4", createdAt: "2026-11-01T01:10:00.000Z", day: 2, lines: [{ item: "lemonade", qty: 2, unitPrice: 2 }], total: 4, method: "cash", tendered: 5, change: 1, voided: false },
];
const closes = { 1: { day: 1, floatCounts: { 20: 1, 10: 0, 5: 0, 2: 0, 1: 0 }, counted: 25, stripeTotal: 3 } };
const purchases = [
  { id: "p1", date: "2026-10-30", day: 0, store: "Woolworths Bright", amount: 100, purpose: "Initial shop", paidBy: "Jon", note: "" },
  { id: "p2", date: "2026-10-31", day: 1, store: "Servo", amount: 12.5, purpose: "Ice", paidBy: "Sam", note: "", deleted: true },
];
const banking = [{ id: "b1", date: "2026-10-31", day: 1, amount: 5, by: "Jon", note: "" }];
const rep = eventReport(real, rs, closes, purchases, banking, null, { sausage: 26, ice: 5 });
assert(rep.totals.sales === 13 && rep.totals.cash === 10 && rep.totals.card === 3, "event totals: $13 = $10 cash + $3 card (void excluded)");
assert(rep.totals.transactions === 3 && rep.totals.voids === 1 && rep.totals.voidValue === 2, "3 sales, 1 void worth $2");
assert(rep.days[0].expectedCash === 26 && rep.days[0].cashVariance === -1, "Day 1: float $20 + cash $6 = $26 expected; $25 counted → −$1");
assert(rep.days[0].stripeVariance === 0 && rep.days[1].closed === false, "Day 1 Stripe matches; Day 2 not closed");
assert(rep.purchasesTotal === 100 && rep.purchases.length === 1, "deleted purchase excluded from the total");
assert(rep.stripe.feesSource === "estimate" && near(rep.stripe.feesUsed, rep.stripe.estFees, 0.001), "fees fall back to the estimate until actuals are entered");
assert(near(rep.profit.net, 13 - 100 - rep.stripe.feesUsed, 0.001), "net = sales − purchases − fees");
assert(rep.cash.toBank === 10 - 1 - 5, "cash to bank = cash sales $10 − $1 short − $5 banked = $4");
assert(near(rep.closingStockValue, 10.5, 0.01), "leftover stock valued at cost: 1 pack of sausages $10.50; leftover ice is not counted (it melts)");
const repActual = eventReport(real, rs, closes, purchases, banking, { gross: 3, fees: 0.3, net: 2.7, note: "" }, {});
assert(repActual.stripe.feesSource === "actual" && repActual.profit.fees === 0.3, "actual Stripe fees replace the estimate");
const csv = reportCsv(rep);
assert(csv.split("\n").length > 10 && csv.includes("Net result") && csv.includes("Initial shop"), "report CSV has days, items, purchases and net result");

console.log("\nLessons for next time");
assert(halfHourOf("2026-10-31T01:05:00.000Z") === "12:00" && halfHourOf("2026-10-31T01:40:00.000Z") === "12:30", "half-hours bucketed in Melbourne time");
const les = planningLessons(real, rs, rep, { sausage: 30, bread: 5, ice: 10 });
// live sales r1, r2, r4: 3 customers. Sausages 2+1 = 3 → 1.0/customer; veg 1/3; hot 1/3; cold (water 1 + lemonade 2) = 1.0
assert(les.actualMix.sausageServesPerCustomer === 1 && les.actualMix.vegShare === 0.333, "actual sausages per customer and veg share");
assert(les.actualMix.hotDrinksPerCustomer === 0.333 && les.actualMix.coldDrinksPerCustomer === 1, "actual hot/cold drinks per customer");
assert(les.actualMix.waterShareOfCold === 0.333 && les.actualMix.colaShareOfCans === 0, "water share of cold; cola share of cans (voided cola ignored)");
assert(les.cardShare.actual === 0.333 && les.itemsPerCardSale.actual === 2, "card share 1 of 3 sales; 2 items per card sale");
assert(les.perDay[0].customers === 2 && les.perDay[0].busiestHalfHour === "12:00" && les.perDay[0].firstSale === "12:05", "per-day customers, first sale and busiest half-hour");
assert(les.suggestedConfig.customersPerDay[0] === 2 && les.suggestedConfig.customersPerDay[2] === 2, "untraded days suggested at the average of traded days");
assert(les.leftovers.some((l) => l.product === "sausage") && !les.leftovers.some((l) => l.product === "ice"), "leftovers list skips ice (doesn't carry over)");

console.log("\nFruit");
{
  const products = productIndex(real);
  const menu = (id) => real.menu.find((m) => m.id === id);
  const plan = shoppingPlan(real);
  const fruit = ["apple", "orange", "banana"];
  assert(plan.initial.lines.filter((l) => fruit.includes(l.product.id)).every((l) => l.packs * l.product.unitsPerPack === 10), "initial shop buys 10 of each fruit");
  assert(fruit.every((f) => plan.openingStock.slice(0, -1).every((s) => s[f] >= 10)), "every day but the last opens with at least 10 of each fruit");
  const onHand = { apple: 3 };
  assert(topUpNeed(real, onHand, [2, 3]).apple >= topUpNeed(real, onHand, [2]).apple, "Days 3–4 combined buys at least the Day 3 fruit");
  assert(lowStockBelow(products.apple, real.config) === 6 && itemLowStockBelow(menu("apple"), real) === 6, "fruit warns at 5 left");
  assert(lowStockBelow(products.bread, real.config) === real.config.lowStockServes && itemLowStockBelow(menu("sausage"), real) === real.config.lowStockServes, "everything else still warns under lowStockServes");
}

console.log("\nHot water urn");
{
  const pw = powerBudget(real);
  assert(pw.urnOk && pw.amps < real.config.power.elite300.socketsSharedA, "urn is within the Elite 300's output and socket limit");
  assert(pw.heatedLitres >= real.config.power.urn.litres, "the urn is heated full each morning even on a quiet day");
  assert(pw.urnWh < real.config.power.elite300.usableWh, "a day's urn use fits one Elite 300 charge");
  assert(!real.equipment.some((e) => /kettle|thermos|air pot/i.test(e.item)), "kettle and thermos are off the equipment list");
  assert(real.equipment.some((e) => /urn/i.test(e.item) && e.status === "own"), "the urn is on the list as club-owned");
}

console.log("\nCustomer re-forecasts");
{
  // Day 2 forecast 75 → 150, with prices pinned to the plan's Day 1 (75 customers).
  const busy = JSON.parse(JSON.stringify(real));
  busy.config.customersPerDay[1] = 150;
  busy.config.pricingCustomers = real.config.customersPerDay[0];
  const before = pricingTable(real).map((r) => r.price).join(",");
  const after = pricingTable(busy).map((r) => r.price).join(",");
  assert(before === after, "a bigger Day 2 forecast leaves sell prices alone (pricingCustomers pinned)");
  // Topping up Day 2 from the same stock needs more sausages when twice the customers are expected.
  const stock = shoppingPlan(real).openingStock[1];
  const need = (d) => topUpNeed(d, stock, [1]).sausage ?? 0;
  assert(need(busy) > need(real), "doubling Day 2 customers raises the Day 2 sausage top-up");
  // Unpinned, the Day 1 forecast feeds pricing: 10 customers spreads gas over far fewer serves.
  const quiet = JSON.parse(JSON.stringify(real));
  quiet.config.customersPerDay[0] = 10;
  const sausage = (d) => pricingTable(d).find((r) => r.item === "sausage").price;
  assert(sausage(quiet) > sausage(real), "unpinned, a tiny Day 1 forecast raises the sausage price (gas spread over fewer serves)");
}

// Phone pairing codes: typed into the home-screen icon, so forgiving about case, spaces and the dash.
{
  const { normalizePairCode, formatPairCode } = await import("./pairCode.ts");
  assert(normalizePairCode("k7qm-3xrp") === "K7QM3XRP", "pair code: lower case with a dash is accepted");
  assert(normalizePairCode(" K7QM 3XRP ") === "K7QM3XRP", "pair code: spaces are ignored");
  assert(normalizePairCode("K7QM3XR") === null, "pair code: 7 characters is refused");
  assert(normalizePairCode("K7QM3XR0") === null, "pair code: 0 isn't in the alphabet (no 0/O mix-ups)");
  assert(normalizePairCode("pair_abcdefghijklmnopqrstuvwxyz") === null, "pair code: the old long QR format is refused");
  assert(formatPairCode("K7QM3XRP") === "K7QM-3XRP", "pair code: shown as 4-4");
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
