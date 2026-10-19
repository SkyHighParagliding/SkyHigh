/**
 * Printable A4 documents for the sausage sizzle, as complete HTML strings.
 *
 * One set of templates, two printers: scripts/sizzle/build-pdfs.ts prints them
 * to PDF with Playwright (adds page numbers in the footer), and the iPad till
 * opens them in a new tab for the iOS print/share sheet. Keep them free of
 * browser- or Node-only APIs.
 */

import {
  type DaySummary,
  type FloatPlan,
  type PriceRow,
  type ShopList,
  type SizzleData,
  cardFixed,
  costPerServe,
  dayForecasts,
  powerBudget,
  pricingTable,
  productIndex,
  recommendFloat,
} from "./calc.ts";

export type Orientation = "portrait" | "landscape";

export interface Doc {
  file: string;
  title: string;
  orientation: Orientation;
  html: string;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function money(n: number, dp = 2): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toFixed(dp)}`;
}

function qtyText(n: number, unit: string): string {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(n < 10 ? 1 : 0);
  return `${v} ${unit}${unit.endsWith("s") || unit === "g" || unit === "ml" || unit === "kg" || unit === "m" ? "" : n === 1 ? "" : "s"}`;
}

function dateRange(data: SizzleData): string {
  const d = data.event.days;
  return `${d[0].label} – ${d[d.length - 1].label.replace(/ \(.*\)$/, "")} 2026`;
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

const box = `<span class="box"></span>`;

// ─── Page shell ───────────────────────────────────────────────────────────────

const CSS = `
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:"Segoe UI",-apple-system,Helvetica,Arial,sans-serif;font-size:12.5pt;color:#111;line-height:1.35;background:#fff}
.page{padding:0}
header.doc{border-bottom:3px solid #b45309;padding-bottom:6px;margin-bottom:10px}
header.doc .ev{font-size:11pt;color:#444;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
header.doc h1{font-size:20pt;margin:2px 0 0;color:#7c2d12}
header.doc .sub{font-size:12pt;color:#333;margin-top:2px}
h2{font-size:14.5pt;margin:14px 0 6px;color:#7c2d12;break-after:avoid}
h3{font-size:12.5pt;margin:10px 0 4px;break-after:avoid}
table{width:100%;border-collapse:collapse;margin:4px 0 10px}
th,td{border:1px solid #999;padding:4px 6px;vertical-align:top;text-align:left}
th{background:#fdebd3;font-size:11pt}
tr{break-inside:avoid}
tbody.keep{break-inside:avoid}
thead{display:table-header-group}
td.num,th.num{text-align:right;white-space:nowrap}
td.c,th.c{text-align:center}
.box{display:inline-block;width:18px;height:18px;border:2px solid #111;border-radius:3px;vertical-align:middle}
.note{font-size:10pt;color:#444}
.flag{font-size:10pt;color:#9a3412}
.tag{display:inline-block;font-size:9.5pt;font-weight:700;padding:0 5px;border-radius:3px;background:#fde68a;color:#78350f;margin-right:4px}
.tag.red{background:#fecaca;color:#7f1d1d}
.total td{font-weight:700;background:#f5f5f4}
.grand{font-size:15pt;font-weight:700;text-align:right;margin:8px 0}
.blank{display:inline-block;min-width:110px;border-bottom:1.5px solid #111;height:1.2em}
.sig{margin-top:16px;display:flex;gap:30px;flex-wrap:wrap}
.sig div{flex:1;min-width:140px;border-top:1.5px solid #111;padding-top:3px;font-size:10.5pt}
.small{font-size:9.5pt}
tr.tight td{padding:1px 6px}
tr.tight .blank{height:1em}
a{color:#1d4ed8}
.cols{display:flex;gap:16px}
.cols>div{flex:1}
ol.steps li{margin:4px 0}
.avoid{break-inside:avoid}
.printbar{position:sticky;top:0;background:#7c2d12;color:#fff;padding:10px 14px;display:flex;gap:12px;align-items:center;font-size:14pt;z-index:5}
.printbar button{font-size:15pt;padding:10px 18px;border-radius:10px;border:0;background:#fff;color:#7c2d12;font-weight:700}
.screenpad{padding:14px}
@media print{.printbar{display:none}.screenpad{padding:0}}
`;

export function header(data: SizzleData, title: string, sub?: string): string {
  return `<header class="doc">
  <div class="ev"><span><b>${esc(data.event.name)}</b> · ${esc(dateRange(data))}</span><span>Prices checked at Woolworths Bright on ${esc(longDate(data.pricesChecked.date))}</span></div>
  <h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
</header>`;
}

/**
 * Wrap a body in a full A4 document. `printBar` adds an on-screen "Print / Save
 * as PDF" bar (hidden when printing) for the iPad.
 */
export function page(title: string, orientation: Orientation, body: string, opts: { printBar?: boolean } = {}): string {
  const bar = opts.printBar
    ? `<div class="printbar"><button onclick="window.print()">Print / Save as PDF</button><span>Tap, then Share → Save to Files, or Print.</span></div>`
    : "";
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>@page{size:A4 ${orientation};margin:12mm 11mm 14mm}${CSS}</style></head><body>${bar}<div class="screenpad"><div class="page">${body}</div></div></body></html>`;
}

// ─── 1–2. Shopping lists ──────────────────────────────────────────────────────

function lineNotes(p: ShopList["lines"][number]["product"]): string {
  const bits: string[] = [];
  if (p.confirmInStore) bits.push(`<span class="tag red">CONFIRM IN STORE</span>`);
  if (p.estimate) bits.push(`<span class="tag red">ESTIMATE</span>`);
  if (!p.ownBrand && !p.notWoolworths) bits.push(`<span class="tag">NOT OWN BRAND</span>`);
  const flags = p.flags.map((f) => `<div class="flag">${esc(f)}</div>`).join("");
  const special = p.special ? `<div class="note">Special: ${esc(p.special)}</div>` : "";
  return `${bits.join("")}${flags}<div class="note"><b>Fallback:</b> ${esc(p.fallback)}</div>${special}`;
}

function shopTable(lines: ShopList["lines"], groupByAisle = true): string {
  const byAisle = new Map<string, ShopList["lines"]>();
  for (const l of lines) {
    const a = groupByAisle ? l.product.aisle : "";
    if (!byAisle.has(a)) byAisle.set(a, []);
    byAisle.get(a)!.push(l);
  }
  let rows = "";
  for (const [aisle, ls] of byAisle) {
    // The aisle heading shares a non-breaking <tbody> with its first item so
    // it can never be stranded at the foot of a page.
    if (aisle) rows += `<tbody class="keep"><tr><td colspan="9" style="background:#e7e5e4;font-weight:700">${esc(aisle)}</td></tr>`;
    else rows += `<tbody>`;
    ls.forEach((l, i) => {
      const p = l.product;
      if (i === 1) rows += `</tbody><tbody>`;
      rows += `<tr>
<td class="c">${box}</td>
<td><b>${esc(p.name)}</b><div class="note">${esc(p.unitPrice)} · need ${esc(qtyText(Math.round(l.need * 10) / 10, p.unit))}</div></td>
<td>${esc(p.brand)}</td>
<td>${esc(p.packSize)}</td>
<td class="num" style="font-size:15pt;font-weight:700">${l.packs}</td>
<td class="num">${money(p.price)}</td>
<td class="num">${money(l.lineTotal)}</td>
<td>${p.stockcode ? `<a href="${esc(p.url)}">${esc(p.stockcode)}</a>` : "—"}</td>
<td>${lineNotes(p)}</td></tr>`;
    });
    rows += `</tbody>`;
  }
  return `<table><thead><tr><th class="c" style="width:34px">✓</th><th style="width:25%">Exact shelf name</th><th>Brand</th><th>Pack size</th><th class="num">Qty</th><th class="num">Est. price</th><th class="num">Line total</th><th>Stockcode</th><th style="width:27%">Notes / fallback</th></tr></thead>${rows}</table>`;
}

export function shoppingListBody(data: SizzleData, list: ShopList): string {
  const otherRows = list.otherLines.length
    ? `<div class="avoid"><h2>Not at Woolworths</h2>${shopTable(list.otherLines, false)}<div class="grand" style="font-size:12.5pt">Not at Woolworths (estimate): ${money(list.otherTotal)}</div></div>`
    : "";
  const empty = list.lines.length === 0 ? `<p><b>Nothing to buy</b> — stock on hand covers this period.</p>` : "";
  return `${header(data, list.title, list.subtitle)}
<p class="note">Woolworths Bright, ${esc(data.pricesChecked.address)} · ${esc(data.pricesChecked.phone)} · Regular shelf prices (specials noted, not used). Quantities are whole packs. Grouped by area of the store.</p>
${empty}${list.lines.length ? shopTable(list.lines) : ""}
<div class="grand">Woolworths total: ${money(list.total)}</div>
${otherRows}
<p class="note">Storage: sausages, veg sausages, onions and opened milk in the Dometic at ≤5 °C (veg in its own container). Today's drinks in the esky with ice.</p>`;
}

// ─── 3. Equipment ─────────────────────────────────────────────────────────────

export function equipmentBody(data: SizzleData): string {
  const rows = data.equipment.map((e) => {
    const status = e.status === "own" ? "OWN" : e.status === "buy" ? "BUY" : "";
    const cost = e.status === "own" ? "—" : e.estCost !== undefined ? money(e.estCost) : e.status === "buy" ? "on list" : "TBC";
    return `<tr><td class="c">${box}</td><td><b>${esc(e.item)}</b>${e.notes ? `<div class="note">${esc(e.notes)}</div>` : ""}${e.source ? `<div class="note">Est. from: ${esc(e.source)}</div>` : ""}</td><td class="c">${e.qty}</td>
<td class="c small">${status ? `<b>${status}</b>` : `☐ own<br>☐ borrow<br>☐ buy`}</td><td></td><td class="num">${cost}</td></tr>`;
  }).join("");
  const p = data.config.power;
  return `${header(data, "Equipment checklist", "Tick when packed. Write who is bringing each item.")}
<table><thead><tr><th class="c" style="width:34px">✓</th><th style="width:40%">Item</th><th class="c">Qty</th><th class="c" style="width:14%">Own / borrow / buy</th><th style="width:18%">Who's bringing it</th><th class="num">Est. cost if bought</th></tr></thead><tbody>${rows}</tbody></table>
<p class="note">Est. costs are Woolworths Bright prices where Woolworths sells the item; "TBC" = not sold there, price not guessed.</p>
<h2 class="avoid">Overnight charging plan</h2>
<ul>
<li><b>${esc(p.elite300.name)}</b>: recharge to 100% every night from mains. While it charges, also top up the Stripe device, the power bank and the iPad from it (≈${p.overnight.reduce((a, o) => a + o.wh, 0)} Wh — small).</li>
<li><b>${esc(p.elite100.name)}</b>: recharge every night (it runs the Dometic 24 h). If there is mains power overnight, run the Dometic from its own AC lead overnight and save the battery.</li>
<li><b>Stripe device + power bank</b>: fully charged each morning; power bank in the cash box.</li>
</ul>`;
}

// ─── 4. Compliance ────────────────────────────────────────────────────────────

export function complianceBody(data: SizzleData): string {
  const rows = data.compliance.map((c) => `<tr><td class="c">${box}</td><td><b>${esc(c.title)}</b><div>${esc(c.detail)}</div><div class="small"><a href="${esc(c.link)}">${esc(c.link)}</a></div></td><td class="c" style="white-space:nowrap">${esc(c.due ?? "")}</td><td style="width:18%"></td></tr>`).join("");
  const days = data.event.days.map((d) => `<tr><td>${esc(d.label)}</td><td class="c">${box} FDP? ${box} TFB?</td><td class="c">${box} Gas BBQ OK</td><td></td></tr>`).join("");
  return `${header(data, "Compliance checklist", "Victorian Class 4 sausage sizzle — tick each item when done.")}
<table><thead><tr><th class="c" style="width:34px">✓</th><th style="width:62%">Task</th><th class="c">Due</th><th style="width:17%">Done by / date</th></tr></thead><tbody>${rows}</tbody></table>
<h2 class="avoid">Fire danger check — each morning before lighting the BBQ</h2>
<table class="avoid"><thead><tr><th>Day</th><th class="c">Fire Danger Period / Total Fire Ban</th><th class="c">Decision</th><th>Checked by</th></tr></thead><tbody>${days}</tbody></table>
<h2 class="avoid">Food safety reminders</h2>
<ul class="avoid">
<li>${box} Raw sausages, onions and opened milk at <b>≤5 °C</b> in the Dometic — check the display each morning.</li>
<li>${box} <b>Gloves</b> on for bread and cooked food; change after handling money or raw sausages.</li>
<li>${box} <b>Separate VEG zone</b> on the hotplate and <b>separate VEG tongs</b> (marked).</li>
<li>${box} Cook sausages <b>right through</b> — probe the thickest one with the food thermometer (≥75 °C, no pink).</li>
<li>${box} Handwash station (water with tap, soap, paper towel, waste bucket) set up <b>before</b> cooking starts.</li>
<li>${box} <b>Throw out cooked leftovers</b> at the end of each day (raw stock goes back in the Dometic).</li>
<li>${box} Only Class 4 items on the stall: sausages, onion, sauce, bread, tea, coffee, bottled water, soft drinks.</li>
</ul>`;
}

// ─── 5. Price board ───────────────────────────────────────────────────────────

export function priceBoardBody(data: SizzleData, rows: PriceRow[] = pricingTable(data)): string {
  const names: Record<string, string> = Object.fromEntries(data.menu.map((m) => [m.id, m.name]));
  const items = rows.map((r) => `<tr><td style="font-size:24pt;padding:2px 14px;border:0;border-bottom:2px solid #e7e5e4">${esc(names[r.item])}</td><td style="font-size:32pt;font-weight:700;text-align:right;padding:2px 14px;border:0;border-bottom:2px solid #e7e5e4">$${r.price.toFixed(0)}</td></tr>`).join("");
  const onion = data.config.onionsEnabled ? "with fried onion, " : "";
  return `<div class="note" style="display:flex;justify-content:space-between;border-bottom:1px solid #ddd;margin-bottom:4px"><span>${esc(data.event.name)} · ${esc(dateRange(data))}</span><span>Prices checked at Woolworths Bright on ${esc(longDate(data.pricesChecked.date))}</span></div><div style="text-align:center;margin:0 0 4px"><div style="font-size:16pt;color:#555">${esc(data.event.club)}</div><div style="font-size:34pt;font-weight:700;color:#7c2d12;line-height:1.05">SAUSAGE SIZZLE</div></div>
<table style="border:0;margin:0 auto;width:92%">${items}</table>
<div style="text-align:center;font-size:15pt;margin-top:6px">Sausages served in bread ${esc(onion)}tomato sauce, BBQ sauce or American mustard.</div>
<div style="text-align:center;font-size:24pt;font-weight:700;margin-top:6px;color:#1d4ed8">Cash or card — tap &amp; pay, no minimum</div>`;
}

// ─── 6. Float & cash-up sheet ─────────────────────────────────────────────────

const SHEET_DENOMS = [100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05];

export function floatSheetBody(data: SizzleData, plan: FloatPlan = recommendFloat(data)): string {
  const floatRows = [20, 10, 5, 2, 1].map((d) => `<tr class="tight"><td>$${d}</td><td class="c" style="font-size:15pt;font-weight:700">${plan.counts[d] ?? 0}</td><td class="num">${money((plan.counts[d] ?? 0) * d, 0)}</td><td class="c">${box}</td></tr>`).join("");
  const countRows = SHEET_DENOMS.map((d) => `<tr class="tight"><td>${d >= 1 ? `$${d}` : `${Math.round(d * 100)}c`}</td><td class="c"><span class="blank" style="min-width:60px"></span></td><td class="num"><span class="blank"></span></td></tr>`).join("");
  const day = data.event.days.map((d) => d.label).join(" ☐  ");
  return `${header(data, "Float & cash-up sheet", "One sheet per trading day. Cash only in this section — card sales are reconciled separately below.")}
<p style="font-size:13pt">Day: ☐ ${esc(day)}</p>
<div class="cols">
<div class="avoid"><h2>Starting float</h2>
<table><thead><tr><th>Denomination</th><th class="c">Count</th><th class="num">Value</th><th class="c">✓</th></tr></thead><tbody>${floatRows}<tr class="total"><td>Total float</td><td></td><td class="num">${money(plan.total, 0)}</td><td></td></tr></tbody></table>
<div class="note small"><b>Why this float:</b><ul style="margin:2px 0;padding-left:18px">${plan.reasoning.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>
</div>
<div class="avoid"><h2>End-of-day cash count</h2>
<table><thead><tr><th>Denomination</th><th class="c">Count</th><th class="num">Value</th></tr></thead><tbody>${countRows}<tr class="total"><td>Counted cash</td><td></td><td class="num"><span class="blank"></span></td></tr></tbody></table>
</div></div>
<div class="cols avoid">
<div><h2>Cash reconciliation</h2>
<table><tbody>
<tr><td>A. Starting float</td><td class="num">${money(plan.total, 0)}</td></tr>
<tr><td>B. Cash sales (till end-of-day — CASH only)</td><td class="num"><span class="blank" style="min-width:80px"></span></td></tr>
<tr class="total"><td>C. Expected cash = A + B</td><td class="num"><span class="blank" style="min-width:80px"></span></td></tr>
<tr><td>D. Counted cash (count above)</td><td class="num"><span class="blank" style="min-width:80px"></span></td></tr>
<tr class="total"><td>Variance = D − C (over + / short −)</td><td class="num"><span class="blank" style="min-width:80px"></span></td></tr>
</tbody></table></div>
<div><h2>Card reconciliation (Stripe)</h2>
<table><tbody>
<tr><td>E. Till card total (till end-of-day)</td><td class="num"><span class="blank" style="min-width:80px"></span></td></tr>
<tr><td>Number of card sales</td><td class="num"><span class="blank" style="min-width:80px"></span></td></tr>
<tr><td>F. Stripe Dashboard — <b>gross payments</b> for the day, not payouts</td><td class="num"><span class="blank" style="min-width:80px"></span></td></tr>
<tr class="total"><td>Variance = F − E</td><td class="num"><span class="blank" style="min-width:80px"></span></td></tr>
</tbody></table>
<p class="note small">Stripe groups payments by the account's time zone — check it is Melbourne, or day totals won't match.</p></div></div>
<div class="sig"><div>Counted by (name &amp; signature)</div><div>Checked by (name &amp; signature)</div><div>Date / time</div></div>`;
}

// ─── 7. Costing & power summary ───────────────────────────────────────────────

export function costingBody(data: SizzleData): string {
  const rows = pricingTable(data);
  const costs = costPerServe(data);
  const products = productIndex(data);
  const { config } = data;
  const card = config.card;
  const fixed = cardFixed(card);
  const table = rows.map((r) => `<tr><td>${esc(r.name)}${r.overridden ? ` <span class="tag">OVERRIDE</span>` : ""}</td><td class="num">${money(r.cost, 3)}</td><td class="num">${money(r.cardFee, 3)}</td><td class="num">${money(r.costInclFee, 3)}</td><td class="num">${money(r.raw)}</td><td class="num" style="font-weight:700">${money(r.price, 0)}</td><td class="num">${money(r.margin)}</td><td class="num">${money(r.worstPrice, 0)}${r.worstChanges ? ` <span class="tag red">CHANGES</span>` : ""}</td></tr>`).join("");
  const bom = data.menu.map((m) => {
    const c = costs[m.id];
    const lines = c.lines.map((l) => `<b>${esc(l.product.replace(/_/g, " "))}</b> ${l.qty < 1 ? l.qty.toFixed(3) : l.qty.toFixed(l.qty % 1 ? 1 : 0)} ${esc(products[l.product].unit)} = ${money(l.cost, 3)}`).join("; ");
    return `<tr><td><b>${esc(m.short)}</b></td><td class="small">${lines}</td><td class="num">${money(c.direct, 3)}</td><td class="num">${money(c.allocated, 3)}</td></tr>`;
  }).join("");
  const days = dayForecasts(data);
  const dayRows = days.map((d) => `<tr><td>Day ${d.day} · ${esc(data.event.days[d.day - 1].label)}</td><td class="c">${d.customers}</td><td class="num">${money(d.revenue)}</td><td class="num">${money(d.cashRevenue)}</td><td class="num">${money(d.cardRevenue)}</td><td class="c">${d.cardTxns.toFixed(0)}</td><td class="num">${money(d.cardFees)}</td></tr>`).join("");
  const sum = (f: (d: (typeof days)[number]) => number) => days.reduce((a, d) => a + f(d), 0);
  const pw = powerBudget(data);
  const p = config.power;
  const portions = Object.entries(config.portions).map(([k, v]) => `${esc(k)} = ${v}`).join(" · ");
  const mix = Object.entries(config.mix).map(([k, v]) => `${esc(k)} = ${v}`).join(" · ");

  return `${header(data, "Costing & power summary", "For committee records. All figures regenerate from data/sizzle/sizzle-2026.json.")}
<h2>Cost per serve and sell price</h2>
<p class="note">Sell price = (food + allocated consumables + card fee) × ${config.markup.toFixed(2)}, rounded UP to the nearest $${config.priceStep}. Card fee per serve = s × ($${fixed.toFixed(2)} / n + ${(card.pct * 100).toFixed(2)}% × P), with s = ${(card.share * 100).toFixed(0)}% card share and n = ${card.itemsPerTxn} items per card sale. So P = ${config.markup.toFixed(2)} × (C + s × ${fixed.toFixed(2)}/n) / (1 − ${config.markup.toFixed(2)} × s × ${card.pct}).</p>
<table><thead><tr><th>Item</th><th class="num">Cost/serve (C)</th><th class="num">Card fee/serve</th><th class="num">Cost incl. card fee</th><th class="num">× ${config.markup.toFixed(2)} (unrounded P)</th><th class="num">Sell price</th><th class="num">Margin</th><th class="num">Worst case (s=100%, n=1)</th></tr></thead><tbody>${table}</tbody></table>
<p class="note">Items marked CHANGES would need the next $1 up if every sale were a single-item card sale. Margin = sell price − cost − card fee.</p>
<h2 class="avoid">Bill of materials (per serve, Day 1 allocation at ${config.customersPerDay[0]} customers)</h2>
<table><thead><tr><th>Item</th><th>Components and cost</th><th class="num">Direct</th><th class="num">Allocated consumables</th></tr></thead><tbody>${bom}</tbody></table>
<p class="note"><b>Portions (editable):</b> ${portions}. ${esc(config.portionsNote)}</p>
<p class="note"><b>Lunch mix per customer (editable):</b> ${mix}. ${esc(config.customersNote)}</p>
<h2 class="avoid">Forecast sales and card fees</h2>
<table class="avoid"><thead><tr><th>Day</th><th class="c">Customers</th><th class="num">Sales</th><th class="num">Cash</th><th class="num">Card</th><th class="c">Card sales</th><th class="num">Est. Stripe fees</th></tr></thead><tbody>${dayRows}
<tr class="total"><td>Total</td><td class="c">${sum((d) => d.customers)}</td><td class="num">${money(sum((d) => d.revenue))}</td><td class="num">${money(sum((d) => d.cashRevenue))}</td><td class="num">${money(sum((d) => d.cardRevenue))}</td><td class="c">${sum((d) => d.cardTxns).toFixed(0)}</td><td class="num">${money(sum((d) => d.cardFees))}</td></tr></tbody></table>
<p class="note">Stripe AU fees checked ${esc(longDate(card.checked))} at <a href="${esc(card.source)}">${esc(card.source)}</a>: ${esc(card.checkedNote)}</p>
<h2 class="avoid">Power budget</h2>
<div class="cols avoid">
<div><h3>${esc(p.elite300.name)} — kettle only</h3>
<ul>
<li>Kettle: <b>${p.kettle.litres} L, ${p.kettle.recommendW} W recommended</b> (must be ≤ ${p.kettle.maxW} W). ${p.kettle.maxW} W ÷ ${p.elite300.volts} V = ${pw.amps.toFixed(1)} A — under the ${p.elite300.socketsSharedA} A shared by the two AC sockets, so ${pw.kettleOk ? "OK" : "NOT OK"}. Plug nothing else into the Elite 300 while boiling.</li>
<li>${pw.hotDrinks.toFixed(0)} hot drinks/day × ${p.kettle.cupMl} mL = ${pw.litres.toFixed(1)} L → ${pw.fullBoils} boils of ${p.kettle.usableLitresPerBoil} L (${pw.cupsPerBoil} cups each), +${Math.round(p.kettle.reboilAllowance * 100)}% re-boils = ${pw.boils.toFixed(1)} boils.</li>
<li>Each boil ≈ ${pw.boilWh.toFixed(0)} Wh from the battery (${p.kettle.inletC} °C water, ${Math.round(p.kettle.efficiency * 100)}% kettle, ${Math.round(p.elite300.inverterEfficiency * 100)}% inverter).</li>
<li><b>≈ ${(pw.kettleWh / 1000).toFixed(2)} kWh/day of ${(p.elite300.usableWh / 1000).toFixed(1)} kWh usable (${Math.round(pw.kettleShare * 100)}%).</b> One full charge covers about ${pw.maxCupsOnCharge} hot drinks.</li>
</ul></div>
<div><h3>${esc(p.elite100.name)} — Dometic only (12 V socket)</h3>
<ul>
<li>Average ${p.fridge.avgA} A × ${p.fridge.volts} V × 24 h ≈ <b>${(pw.fridgeWh / 1000).toFixed(2)} kWh/day</b> → ${pw.fridgeDays.toFixed(1)} days on ${(p.elite100.usableWh / 1000).toFixed(1)} kWh usable.</li>
<li>Hot day (${p.fridge.hotDayA} A) ≈ ${(pw.fridgeHotWh / 1000).toFixed(2)} kWh/day → ${pw.fridgeHotDays.toFixed(1)} days.</li>
<li>${esc(p.fridge.note)}</li>
</ul></div></div>
<h3 class="avoid">Overnight recharge plan</h3>
<ul class="avoid">
<li><b>Elite 300:</b> recharge to 100% from mains every night — a day's kettle use takes ~${Math.round(pw.kettleShare * 100)}% of it. Also charge the Stripe device, power bank and iPad from it (≈${pw.overnightWh} Wh).</li>
<li><b>Elite 100:</b> recharge every night. It could stretch ${Math.floor(pw.fridgeHotDays)} days on a hot run, but don't rely on it. If there's mains overnight, run the Dometic from its AC lead and keep the battery full.</li>
<li>If hot drinks exceed ~${pw.maxCupsOnCharge} in a day, keep boiled water in an air pot / thermos between rushes rather than re-boiling.</li>
</ul>`;
}

// ─── 8. Card quick guide ──────────────────────────────────────────────────────

export function cardGuideBody(data: SizzleData): string {
  return `${header(data, "Card payments — volunteer quick guide", "Cash or card, same price, no minimum, no surcharge.")}
<h2>Taking a card payment</h2>
<ol class="steps" style="font-size:14pt">
<li>Ring up the order on the <b>iPad till</b> as normal, then tap <b>[Card]</b>.</li>
<li>The iPad shows <b>"Key $X into Stripe"</b> in big numbers.</li>
<li>On the Stripe device, enter <b>exactly that amount</b> and start the payment.</li>
<li>Customer taps their card or phone.</li>
<li>Stripe says <b>approved</b> → tap <b>[Card approved]</b> on the iPad. Only now is the sale recorded.</li>
<li>Stripe says <b>declined</b> → tap <b>[Declined — back]</b> and offer cash.</li>
</ol>
<h2>Golden rules</h2>
<ul style="font-size:13.5pt">
<li><b>Always key the exact till total.</b> Never type an amount from memory.</li>
<li><b>Declined, or no signal on the Stripe device?</b> Offer cash. Don't retry over and over.</li>
<li><b>No refunds at the stall.</b> Only the organiser can do refunds — take the customer's name and number.</li>
<li>Never hand the Stripe device to a customer to type in an amount.</li>
<li>Card sales don't go in the cash box — the cash-up counts cash only.</li>
</ul>
<h2 class="avoid">End of day</h2>
<p>The till shows the card total and count. Open the Stripe Dashboard → Payments for today and write the <b>gross</b> total on the cash-up sheet. They should match.</p>
<h2 class="avoid">Organiser setup (before the event)</h2>
<ul class="avoid note" style="font-size:11.5pt">
<li>Give volunteers a <b>Stripe team login with the lowest role that can take payments</b> (or the payment app's charges-only mode). <b>Never</b> share the admin login.</li>
<li>Check the Stripe account's time zone is Melbourne so daily totals line up with the till.</li>
<li>Test a $1 payment and refund it yourself before Day 1.</li>
</ul>`;
}

// ─── Till: end-of-day summary ─────────────────────────────────────────────────

export interface EndOfDayInput {
  dayLabel: string;
  summary: DaySummary;
  floatTotal: number;
  counted: number | null;
  countedBreakdown?: Record<string, number>;
  stripeTotal: number | null;
  estFees: number;
  stockRows: { name: string; unit: string; estimated: number; counted: number | null }[];
  generatedAt: string;
}

export function endOfDayBody(data: SizzleData, e: EndOfDayInput): string {
  const names: Record<string, string> = Object.fromEntries(data.menu.map((m) => [m.id, m.name]));
  const items = data.menu.filter((m) => e.summary.byItem[m.id]).map((m) => {
    const r = e.summary.byItem[m.id];
    return `<tr><td>${esc(names[m.id])}</td><td class="c">${r.qty}</td><td class="num">${money(r.cash)}</td><td class="num">${money(r.card)}</td><td class="num">${money(r.total)}</td></tr>`;
  }).join("");
  const expected = e.floatTotal + e.summary.cashTotal;
  const variance = e.counted === null ? null : e.counted - expected;
  const cardVar = e.stripeTotal === null ? null : e.stripeTotal - e.summary.cardTotal;
  const stock = e.stockRows.map((s) => `<tr><td>${esc(s.name)}</td><td class="num">${esc(qtyText(Math.round(s.estimated * 10) / 10, s.unit))}</td><td class="num">${s.counted === null ? "—" : esc(qtyText(s.counted, s.unit))}</td></tr>`).join("");
  const counted = e.countedBreakdown ? Object.entries(e.countedBreakdown).filter(([, n]) => n).map(([d, n]) => `${n}×${Number(d) >= 1 ? "$" + d : Math.round(Number(d) * 100) + "c"}`).join(", ") : "";
  return `${header(data, `End of day — ${e.dayLabel}`, `Generated on the till ${e.generatedAt}`)}
<h2>Sales by item</h2>
<table><thead><tr><th>Item</th><th class="c">Qty</th><th class="num">Cash</th><th class="num">Card</th><th class="num">Total</th></tr></thead><tbody>${items}
<tr class="total"><td>Total (${e.summary.cashCount} cash + ${e.summary.cardCount} card sales; ${e.summary.voidCount} voided)</td><td></td><td class="num">${money(e.summary.cashTotal)}</td><td class="num">${money(e.summary.cardTotal)}</td><td class="num">${money(e.summary.total)}</td></tr></tbody></table>
<div class="cols avoid"><div><h2>Cash-up (cash only)</h2>
<table><tbody><tr><td>Starting float</td><td class="num">${money(e.floatTotal)}</td></tr><tr><td>Cash sales</td><td class="num">${money(e.summary.cashTotal)}</td></tr>
<tr class="total"><td>Expected cash</td><td class="num">${money(expected)}</td></tr><tr><td>Counted cash${counted ? `<div class="note">${esc(counted)}</div>` : ""}</td><td class="num">${e.counted === null ? "—" : money(e.counted)}</td></tr>
<tr class="total"><td>Variance (over + / short −)</td><td class="num">${variance === null ? "—" : money(variance)}</td></tr></tbody></table></div>
<div><h2>Card (Stripe)</h2>
<table><tbody><tr><td>Till card total (${e.summary.cardCount} sales)</td><td class="num">${money(e.summary.cardTotal)}</td></tr><tr><td>Stripe Dashboard gross</td><td class="num">${e.stripeTotal === null ? "—" : money(e.stripeTotal)}</td></tr>
<tr class="total"><td>Variance</td><td class="num">${cardVar === null ? "—" : money(cardVar)}</td></tr><tr><td>Estimated card fees</td><td class="num">${money(e.estFees)}</td></tr></tbody></table></div></div>
${stock ? `<h2 class="avoid">Stock at close</h2><table><thead><tr><th>Product</th><th class="num">Estimated (till)</th><th class="num">Counted</th></tr></thead><tbody>${stock}</tbody></table>` : ""}
<div class="sig"><div>Counted by</div><div>Checked by</div></div>`;
}

// ─── Assemble the full printed set ────────────────────────────────────────────

export function allDocs(data: SizzleData, lists: { initial: ShopList; topUps: ShopList[]; twoDay: ShopList[] }): Doc[] {
  const docs: Doc[] = [];
  const add = (file: string, title: string, orientation: Orientation, body: string) => docs.push({ file, title, orientation, html: page(title, orientation, body) });
  add("01-initial-shopping-list.pdf", "Initial shopping list", "landscape", shoppingListBody(data, lists.initial));
  lists.topUps.forEach((l) => add(`02-${l.key}.pdf`, l.title, "landscape", shoppingListBody(data, l)));
  lists.twoDay.forEach((l) => add(`02-${l.key}-combined.pdf`, l.title, "landscape", shoppingListBody(data, l)));
  add("03-equipment-checklist.pdf", "Equipment checklist", "portrait", equipmentBody(data));
  add("04-compliance-checklist.pdf", "Compliance checklist", "portrait", complianceBody(data));
  add("05-price-board.pdf", "Price board", "landscape", priceBoardBody(data));
  add("06-float-and-cash-up.pdf", "Float & cash-up sheet", "portrait", floatSheetBody(data));
  add("07-costing-and-power.pdf", "Costing & power summary", "landscape", costingBody(data));
  add("08-card-payments-guide.pdf", "Card payments — volunteer quick guide", "portrait", cardGuideBody(data));
  return docs;
}
