/**
 * Treasurer's event report as an A4 document (same page shell and styles as
 * the other sizzle documents — see templates.ts).
 */

import type { SizzleData } from "./calc.ts";
import type { EventReport, Lessons } from "./report.ts";
import { esc, header, money } from "./templates.ts";

const m = (n: number | null | undefined) => (n === null || n === undefined ? "—" : money(n));

export function eventReportBody(data: SizzleData, r: EventReport, lessons: Lessons, generatedAt: string): string {
  const net = r.profit.net;
  const summary = `<table class="avoid" style="font-size:13pt"><tbody>
<tr><td style="width:62%">Sales (all days)</td><td class="num"><b>${m(r.totals.sales)}</b></td></tr>
<tr><td style="padding-left:24px">Cash</td><td class="num">${m(r.totals.cash)}</td></tr>
<tr><td style="padding-left:24px">Card (Stripe)</td><td class="num">${m(r.totals.card)}</td></tr>
<tr><td>Less purchases (from receipts, ${r.purchases.length})</td><td class="num">−${m(r.purchasesTotal)}</td></tr>
<tr><td>Less Stripe fees (${r.stripe.feesSource === "actual" ? "actual, from Stripe" : "estimated — enter the actual figure from Stripe"})</td><td class="num">−${m(r.stripe.feesUsed)}</td></tr>
<tr class="total"><td>Net result</td><td class="num" style="color:${net >= 0 ? "#065f46" : "#991b1b"}">${m(net)}</td></tr>
<tr><td>Cash still to bank (cash sales ${m(r.cash.cashSales)} ${r.cash.variance >= 0 ? "+" : "−"} count variance ${m(Math.abs(r.cash.variance))} − banked ${m(r.cash.banked)})</td><td class="num">${m(r.cash.toBank)}</td></tr>
<tr><td>Leftover stock at cost (not in the net result)</td><td class="num">${m(r.closingStockValue)}</td></tr>
</tbody></table>`;

  const dayRows = r.days.map((d) => `<tr><td>Day ${d.day} · ${esc(d.label)}${d.closed ? "" : ` <span class="tag red">NOT CLOSED</span>`}</td><td class="num">${d.transactions}</td><td class="num">${m(d.cash)}</td><td class="num">${m(d.card)}</td><td class="num"><b>${m(d.sales)}</b></td><td class="num">${d.voids ? `${d.voids} (${m(d.voidValue)})` : "—"}</td><td class="num">${m(d.cashVariance)}</td><td class="num">${m(d.stripeVariance)}</td><td class="num">${m(d.estFees)}</td></tr>`).join("");
  const items = r.byItem.map((i) => `<tr><td>${esc(i.name)}</td><td class="num">${i.qty}</td><td class="num">${m(i.cash)}</td><td class="num">${m(i.card)}</td><td class="num">${m(i.revenue)}</td></tr>`).join("");
  const purchases = r.purchases.length
    ? r.purchases.map((p) => `<tr><td>${esc(p.date)}</td><td>${esc(p.store)}</td><td>${esc(p.purpose)}</td><td>${esc(p.paidBy)}</td><td>${esc(p.note)}</td><td class="c">${p.receipt ? "yes" : "—"}</td><td class="num">${m(p.amount)}</td></tr>`).join("")
    : `<tr><td colspan="7">No purchases entered yet.</td></tr>`;
  const banking = r.banking.length
    ? r.banking.map((b) => `<tr><td>${esc(b.date)}</td><td>${b.day ? `Day ${b.day}` : "—"}</td><td>${esc(b.by)}</td><td>${esc(b.note)}</td><td class="num">${m(b.amount)}</td></tr>`).join("")
    : `<tr><td colspan="5">No banking entered yet.</td></tr>`;
  const stock = r.closingStock.slice(0, 14).map((s) => `<tr><td>${esc(s.name)}</td><td class="num">${Math.round(s.qty * 10) / 10} ${esc(s.unit)}</td><td class="num">${m(s.value)}</td></tr>`).join("");
  const mixRow = (label: string, key: keyof Lessons["actualMix"]) => `<tr><td>${label}</td><td class="num">${lessons.plannedMix[key]}</td><td class="num">${lessons.actualMix[key]}</td></tr>`;
  const busiest = Math.max(1, ...Object.values(lessons.halfHours));
  const peak = Object.entries(lessons.halfHours).map(([h, c]) => `<tr><td>${esc(h)}</td><td class="num">${c}</td><td style="width:50%"><span style="display:inline-block;height:10px;background:#b45309;width:${Math.round((c / busiest) * 100)}%"></span></td></tr>`).join("");

  return `${header(data, `Treasurer's report — ${data.event.title}`, `Generated on the till ${generatedAt}. Card figures are what the till recorded; Stripe's own report is the final word on card takings and fees.`)}
<h2>Summary</h2>
${summary}
<h2 class="avoid">By day</h2>
<table><thead><tr><th>Day</th><th class="num">Sales #</th><th class="num">Cash</th><th class="num">Card</th><th class="num">Total</th><th class="num">Voided</th><th class="num">Cash variance</th><th class="num">Stripe variance</th><th class="num">Est. fees</th></tr></thead><tbody>${dayRows}
<tr class="total"><td>Total</td><td class="num">${r.totals.transactions}</td><td class="num">${m(r.totals.cash)}</td><td class="num">${m(r.totals.card)}</td><td class="num">${m(r.totals.sales)}</td><td class="num">${r.totals.voids ? `${r.totals.voids} (${m(r.totals.voidValue)})` : "—"}</td><td class="num">${m(r.totals.cashVariance)}</td><td></td><td class="num">${m(r.totals.estFees)}</td></tr></tbody></table>
<p class="note">Cash variance = counted − (float + cash sales) at each close. Stripe variance = Stripe gross entered at close − till card total.</p>
<h2 class="avoid">Sales by item</h2>
<table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Cash</th><th class="num">Card</th><th class="num">Total</th></tr></thead><tbody>${items}</tbody></table>
<h2 class="avoid">Purchases (receipts)</h2>
<table><thead><tr><th>Date</th><th>Store</th><th>For</th><th>Paid by</th><th>Note</th><th class="c">Receipt photo</th><th class="num">Amount</th></tr></thead><tbody>${purchases}
<tr class="total"><td colspan="6">Total (planned ${m(r.plannedSpend)})</td><td class="num">${m(r.purchasesTotal)}</td></tr></tbody></table>
<p class="note">Reimburse whoever paid ("Paid by") from the takings or the club account, per the club's usual process.</p>
<h2 class="avoid">Cash banked</h2>
<table><thead><tr><th>Date</th><th>Day</th><th>By</th><th>Note</th><th class="num">Amount</th></tr></thead><tbody>${banking}
<tr class="total"><td colspan="4">Total banked</td><td class="num">${m(r.bankedTotal)}</td></tr></tbody></table>
<h2 class="avoid">Stripe</h2>
<table class="avoid"><tbody>
<tr><td style="width:62%">Card sales recorded on the till</td><td class="num">${m(r.totals.card)} (${r.totals.cardTxns} sales)</td></tr>
<tr><td>Stripe gross (from the Stripe payout report)</td><td class="num">${m(r.stripe.gross)}</td></tr>
<tr><td>Stripe fees — estimated by the till</td><td class="num">${m(r.stripe.estFees)}</td></tr>
<tr><td>Stripe fees — actual (from Stripe)</td><td class="num">${m(r.stripe.actualFees)}</td></tr>
<tr><td>Stripe net paid to the club account</td><td class="num">${m(r.stripe.net)}</td></tr>
</tbody></table>
<h2 class="avoid">Leftover stock (at cost)</h2>
<table><thead><tr><th>Product</th><th class="num">On hand</th><th class="num">Value at cost</th></tr></thead><tbody>${stock || `<tr><td colspan="3">None recorded.</td></tr>`}
<tr class="total"><td colspan="2">Total</td><td class="num">${m(r.closingStockValue)}</td></tr></tbody></table>
<h2 class="avoid">For next time</h2>
<ul>${lessons.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
<div class="cols avoid">
<div><h3>Buying per customer</h3><table><thead><tr><th>Per customer</th><th class="num">Planned</th><th class="num">Actual</th></tr></thead><tbody>
${mixRow("Sausages (incl. veg)", "sausageServesPerCustomer")}${mixRow("Veg share of sausages", "vegShare")}${mixRow("Hot drinks", "hotDrinksPerCustomer")}${mixRow("Coffee share of hot", "coffeeShareOfHot")}${mixRow("Cold drinks", "coldDrinksPerCustomer")}${mixRow("Water share of cold", "waterShareOfCold")}${mixRow("Cola share of cans", "colaShareOfCans")}${mixRow("Fruit", "fruitPerCustomer")}
<tr><td>Card share of sales</td><td class="num">${lessons.cardShare.planned}</td><td class="num">${lessons.cardShare.actual ?? "—"}</td></tr>
<tr><td>Items per card sale</td><td class="num">${lessons.itemsPerCardSale.planned}</td><td class="num">${lessons.itemsPerCardSale.actual ?? "—"}</td></tr>
</tbody></table></div>
<div><h3>Sales by half-hour (all days)</h3><table><thead><tr><th>From</th><th class="num">Sales</th><th></th></tr></thead><tbody>${peak || `<tr><td colspan="3">No sales yet.</td></tr>`}</tbody></table></div>
</div>
<div class="sig"><div>Prepared by (name &amp; signature)</div><div>Treasurer (name &amp; signature)</div><div>Date</div></div>`;
}
