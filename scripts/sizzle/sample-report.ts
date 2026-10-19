/**
 * Render the treasurer's report from a simulated 4-day event, to check its
 * layout without a till: npm run sizzle:sample-report → output/sizzle/sample-treasurer-report.pdf
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { type Sale, priceMap, salesDepletion, shoppingPlan, subtractQty, type SizzleData } from "../../shared/sizzle/calc.ts";
import { eventReport, planningLessons } from "../../shared/sizzle/report.ts";
import { eventReportBody } from "../../shared/sizzle/reportTemplate.ts";
import { page } from "../../shared/sizzle/templates.ts";

const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/sizzle/sizzle-2026.json"), "utf8")) as SizzleData;
const prices = priceMap(data);
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

// Sales between 11:30 and 14:00 Melbourne (AEDT, UTC+11) each day.
const sales: Sale[] = [];
for (const [i, d] of data.event.days.entries()) {
  const n = Math.round(data.config.customersPerDay[i] * (0.8 + rand() * 0.2));
  for (let c = 0; c < n; c++) {
    const minutes = 30 + Math.floor(Math.pow(rand(), 1.6) * 150);
    const at = new Date(`${d.date}T00:00:00.000Z`);
    at.setUTCMinutes(minutes);
    const lines = [{ item: rand() < 0.12 ? "veg_sausage" : "sausage", qty: rand() < 0.3 ? 2 : 1, unitPrice: 0 }];
    if (rand() < 0.5) lines.push({ item: rand() < 0.6 ? "coffee" : "tea", qty: 1, unitPrice: 0 });
    if (rand() < 0.6) lines.push({ item: rand() < 0.4 ? "water" : rand() < 0.6 ? "cola" : "lemonade", qty: 1, unitPrice: 0 });
    for (const l of lines) l.unitPrice = prices[l.item];
    const total = lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);
    const card = rand() < 0.7;
    sales.push({ id: `s${i}-${c}`, event: data.event.id, createdAt: at.toISOString(), day: d.n, lines, total, method: card ? "card" : "cash", tendered: card ? null : 20, change: card ? null : 20 - total, voided: rand() < 0.01 });
  }
}
const plan = shoppingPlan(data);
const bought = plan.openingStock[0];
for (const t of plan.topUps) for (const l of t.lines) bought[l.product.id] = (bought[l.product.id] ?? 0) + l.packs * l.product.unitsPerPack;
const onHand = subtractQty(bought, salesDepletion(data, sales));
const cashBy = (n: number) => sales.filter((s) => s.day === n && !s.voided && s.method === "cash").reduce((a, s) => a + s.total, 0);
const cardBy = (n: number) => sales.filter((s) => s.day === n && !s.voided && s.method === "card").reduce((a, s) => a + s.total, 0);
const float = { 20: 4, 10: 9, 5: 10, 2: 35, 1: 25 };
const closes = Object.fromEntries(data.event.days.map((d) => [d.n, { day: d.n, floatCounts: float, counted: 315 + cashBy(d.n) - (d.n === 2 ? 2 : 0), stripeTotal: cardBy(d.n) }]));
const purchases = [
  { id: "p0", date: "2026-10-30", day: 0, store: "Woolworths Bright", amount: 468.9, purpose: "Initial shop", paidBy: "Organiser", note: "receipt in envelope", receipt: "x" },
  { id: "p1", date: "2026-10-30", day: 0, store: "Bright servo", amount: 36, purpose: "Gas", paidBy: "Organiser", note: "9 kg swap" },
  ...plan.topUps.map((t, i) => ({ id: `t${i}`, date: data.event.days[i + 1].date, day: i + 2, store: "Woolworths Bright", amount: t.total, purpose: "Top-up shop", paidBy: "Volunteer", note: "" })),
];
const banking = data.event.days.map((d) => ({ id: `b${d.n}`, date: d.date, day: d.n, amount: Math.round(cashBy(d.n) * 100) / 100, by: "Treasurer", note: "" }));
const report = eventReport(data, sales, closes, purchases, banking, null, onHand);
const lessons = planningLessons(data, sales, report, onHand);
const html = page("Sample treasurer's report", "portrait", eventReportBody(data, report, lessons, "sample data"));

const out = path.join(process.cwd(), "output/sizzle/sample-treasurer-report.pdf");
fs.mkdirSync(path.dirname(out), { recursive: true });
const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch({ channel: "chrome" }));
const p = await browser.newPage();
await p.setContent(html, { waitUntil: "load" });
await p.pdf({ path: out, format: "A4", preferCSSPageSize: true, printBackground: true });
await browser.close();
console.log(out);
console.log(`sales ${report.totals.sales} purchases ${report.purchasesTotal} fees ${report.stripe.feesUsed} net ${report.profit.net} toBank ${report.cash.toBank}`);
