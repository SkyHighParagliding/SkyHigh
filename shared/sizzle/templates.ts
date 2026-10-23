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
  FLOAT_DENOMS,
  cardFixed,
  costPerServe,
  dayForecasts,
  denomLabel,
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
  // Fruit at one price shares a line ("Fruit — apple, orange or banana").
  const fruit = rows.filter((r) => data.menu.find((m) => m.id === r.item)?.group === "fruit");
  let board: { name: string; price: number }[] = rows.map((r) => ({ name: names[r.item], price: r.price }));
  if (fruit.length > 1 && fruit.every((r) => r.price === fruit[0].price)) {
    const list = fruit.map((r) => names[r.item].toLowerCase());
    const line = { name: `Fruit — ${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`, price: fruit[0].price };
    board = rows.flatMap((r) => (r === fruit[0] ? [line] : fruit.includes(r) ? [] : [{ name: names[r.item], price: r.price }]));
  }
  // The landscape page holds 7 lines at full size; shrink to fit more.
  const k = Math.min(1, 7 / board.length);
  const items = board.map((r) => `<tr><td style="font-size:${(24 * k).toFixed(1)}pt;padding:2px 14px;border:0;border-bottom:2px solid #e7e5e4">${esc(r.name)}</td><td style="font-size:${(32 * k).toFixed(1)}pt;font-weight:700;text-align:right;padding:2px 14px;border:0;border-bottom:2px solid #e7e5e4">$${r.price.toFixed(0)}</td></tr>`).join("");
  const onion = data.config.onionsEnabled ? "with fried onion, " : "";
  return `<div class="note" style="display:flex;justify-content:space-between;border-bottom:1px solid #ddd;margin-bottom:4px"><span>${esc(data.event.name)} · ${esc(dateRange(data))}</span><span>Prices checked at Woolworths Bright on ${esc(longDate(data.pricesChecked.date))}</span></div><div style="text-align:center;margin:0 0 4px"><div style="font-size:16pt;color:#555">${esc(data.event.club)}</div><div style="font-size:34pt;font-weight:700;color:#7c2d12;line-height:1.05">SAUSAGE SIZZLE</div></div>
<table style="border:0;margin:0 auto;width:92%">${items}</table>
<div style="text-align:center;font-size:15pt;margin-top:6px">Sausages served in bread ${esc(onion)}tomato sauce, BBQ sauce or American mustard.</div>
<div style="text-align:center;font-size:24pt;font-weight:700;margin-top:6px;color:#1d4ed8">Cash or card — tap &amp; pay, no minimum</div>`;
}

// ─── 6. Float & cash-up sheet ─────────────────────────────────────────────────

const SHEET_DENOMS = [100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05];

export function floatSheetBody(data: SizzleData, plan: FloatPlan = recommendFloat(data)): string {
  const cash = (n: number) => money(n, n % 1 ? 2 : 0);
  const floatRows = FLOAT_DENOMS.filter((d) => d >= 1 || plan.counts[d]).map((d) => `<tr class="tight"><td>${denomLabel(d)}</td><td class="c" style="font-size:15pt;font-weight:700">${plan.counts[d] ?? 0}</td><td class="num">${cash((plan.counts[d] ?? 0) * d)}</td><td class="c">${box}</td></tr>`).join("");
  const countRows = SHEET_DENOMS.map((d) => `<tr class="tight"><td>${denomLabel(d)}</td><td class="c"><span class="blank" style="min-width:60px"></span></td><td class="num"><span class="blank"></span></td></tr>`).join("");
  const day = data.event.days.map((d) => d.label).join(" ☐  ");
  return `${header(data, "Float & cash-up sheet", "One sheet per trading day. Cash only in this section — card sales are reconciled separately below.")}
<p style="font-size:13pt">Day: ☐ ${esc(day)}</p>
<div class="cols">
<div class="avoid"><h2>Starting float</h2>
<table><thead><tr><th>Denomination</th><th class="c">Count</th><th class="num">Value</th><th class="c">✓</th></tr></thead><tbody>${floatRows}<tr class="total"><td>Total float</td><td></td><td class="num">${cash(plan.total)}</td><td></td></tr></tbody></table>
<div class="note small"><b>Why this float:</b><ul style="margin:2px 0;padding-left:18px">${plan.reasoning.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>
</div>
<div class="avoid"><h2>End-of-day cash count</h2>
<table><thead><tr><th>Denomination</th><th class="c">Count</th><th class="num">Value</th></tr></thead><tbody>${countRows}<tr class="total"><td>Counted cash</td><td></td><td class="num"><span class="blank"></span></td></tr></tbody></table>
</div></div>
<div class="cols avoid">
<div><h2>Cash reconciliation</h2>
<table><tbody>
<tr><td>A. Starting float</td><td class="num">${cash(plan.total)}</td></tr>
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
<li>Ring up the order on the till (iPad or phone) as normal, then tap <b>[Card]</b>.</li>
<li><b>On a phone</b> (with the Stripe app on it): the till shows the amount in big numbers and copies it — <b>"12.50 copied — paste it in Stripe"</b>. Open the Stripe app, press and hold the amount box → <b>Paste</b>.</li>
<li><b>On the iPad</b> (no Stripe — iPads can't take tap payments): the till shows <b>"Type this amount into the Stripe phone"</b>. Whoever has the Stripe phone types <b>exactly that amount</b> into the Stripe app.</li>
<li>Check the Stripe amount matches the till, then start the payment.</li>
<li>Customer taps their card or phone.</li>
<li>Stripe says <b>approved</b> → tap <b>[Card approved]</b> on the till. Only now is the sale recorded.</li>
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

// ─── 9. Shop assistant how-to ─────────────────────────────────────────────────

/** Phone set-up steps, shared by the shop assistant and admin how-tos. */
const PHONE_SETUP = `<ol class="steps">
<li>Organiser: on the iPad, <b>Admin</b> → <b>Phones</b> → type the volunteer's name → <b>Add phone</b>.</li>
<li>Point the phone's camera at the QR code. Tap the link.</li>
<li><b>iPhone:</b> tap <b>Share</b> → <b>Add to Home Screen</b> → <b>Add</b>.<br><b>Android:</b> tap <b>⋮</b> (top right) → <b>Add to Home screen</b> or <b>Install app</b>.</li>
<li>Open the new <b>Sizzle Phone</b> icon. It sets itself up. If it asks for a code, type the code from the page you just left.</li>
<li>The top bar says <b>Synced</b>. Ready to sell.</li>
</ol>
<ul class="note">
<li>Camera won't scan? Open the icon and type the code shown on the iPad.</li>
<li>Code wrong, expired or used? On the iPad tap <b>New code</b> next to that phone. Codes work once, for 10 minutes.</li>
<li>No icon wanted? Tap <b>Use in Safari instead</b> (Android: <b>Use in the browser instead</b>).</li>
</ul>`;

export function shopAssistantGuideBody(data: SizzleData): string {
  return `${header(data, "Shop assistant how-to", "Selling on the till — iPad or phone, the buttons are the same.")}
<p style="font-size:13pt">Organiser on duty: <span class="blank" style="min-width:200px"></span> &nbsp; Phone: <span class="blank" style="min-width:150px"></span></p>
<h2>Selling on your own phone? Set it up once</h2>
${PHONE_SETUP}
<h2>1. Take the order</h2>
<ol class="steps">
<li>Tap an item card once for each one the customer wants. The white bubble on the card shows how many.</li>
<li>Check the <b>Order</b> list. Wrong number? Use <b>−</b> and <b>+</b> on that line. <b>Clear</b> starts again. Nothing is recorded until the customer has paid.</li>
<li>Tell the customer the <b>Total</b>, then tap <b>Cash</b> or <b>Card</b>.</li>
</ol>
<h2>2. Cash</h2>
<ol class="steps">
<li>Tap the note they hand you ($5, $10, $20, $50), <b>Exact</b>, or type another amount in <b>Other</b> and tap <b>OK</b>.</li>
<li>The till shows <b>CHANGE</b> in big green numbers and which notes and coins to give.</li>
<li>Give the change, then tap <b>Change given — done</b>. (<b>Back</b> if you tapped the wrong note.)</li>
<li>All cash goes in the <b>one cash box</b>, whichever device you sold on.</li>
</ol>
<h2>3. Card (Stripe)</h2>
<ol class="steps">
<li>Tap <b>Card</b>. The till shows the amount in big numbers.</li>
<li><b>On a phone with Stripe:</b> the till has already copied it (<b>"… copied — paste it in Stripe"</b>). Open the Stripe app, press and hold the amount → <b>Paste</b>.</li>
<li><b>On the iPad:</b> there's no copy — the iPad can't run Stripe. Read the amount to whoever has the Stripe phone, and they type it in. <b>Always the till total — never from memory.</b></li>
<li>The customer taps their card or phone on the Stripe phone.</li>
<li><b>Approved</b> → tap <b>Card approved</b>. Only now is the sale recorded.</li>
<li><b>Declined</b> or no signal on Stripe → tap <b>Declined — back</b> and offer cash. Don't keep retrying.</li>
</ol>
<h2 class="avoid">4. Fixing a mistake</h2>
<ul class="avoid">
<li><b>Before they pay:</b> fix it in the Order list with − and +.</li>
<li><b>Just after a sale:</b> tap <b>Void last sale</b> (the dashed card). It shows your most recent sale — check it, then tap <b>Void sale</b>. It only voids a sale made on <b>your</b> device. Cash: give the money back from the cash box. Card: you can't refund at the stall — take the customer's name and phone number for the organiser.</li>
<li><b>An older sale was wrong:</b> leave it and tell the organiser, so it can be noted on the cash-up sheet.</li>
</ul>
<h2 class="avoid">5. Stock and signal</h2>
<ul class="avoid">
<li>Each card shows how many are left. It turns red under ${data.config.lowStockServes}, and an amber <b>Low stock</b> bar names what's running out — tell the organiser. <b>SOLD OUT?</b> means the till thinks it's gone: check the esky and boxes first.</li>
<li><b>No signal? Keep selling.</b> Every sale is saved on your device first and uploads by itself later. The bar at the top of the phone says <b>Synced</b> or how many sales are waiting.</li>
<li>Don't close the till by deleting its home-screen icon or clearing Safari data — unsent sales live there.</li>
</ul>
<h2 class="avoid">Golden rules</h2>
<ul class="avoid" style="font-size:13.5pt">
<li>Same price cash or card. No minimum, no surcharge.</li>
<li><b>Gluten free?</b> Beef sausage only (the vegie sausages contain gluten), on bread from the sealed gluten-free loaf, using the gluten-free tongs and fresh gloves. Ring it up as a normal <b>Sausage</b>.</li>
<li><b>Plant milk, decaf and peppermint tea</b> are there if asked. Same price: ring up decaf as <b>Coffee</b>, peppermint as <b>Tea</b>.</li>
<li>Never hand the Stripe phone to a customer to type an amount.</li>
<li>Card money never goes in the cash box; the cash count is cash only.</li>
<li>Prices and stock are changed by the organiser only (they're PIN-locked).</li>
<li>Gloves on for handling food; wash hands after cash. Anything odd — ask the organiser.</li>
</ul>`;
}

// ─── 10. Admin how-to ─────────────────────────────────────────────────────────

export function adminGuideBody(data: SizzleData): string {
  return `${header(data, "Admin how-to", "For the organiser and treasurer. Everything below is on the iPad till unless it says otherwise.")}
<h2>Before the event (once)</h2>
<ol class="steps">
<li><b>iPad icon:</b> in Safari open <b>skyhighparagliding.org.au/admin/sizzle</b>, log in with an admin account, then Share → <b>Add to Home Screen</b>. Always use the <b>Sizzle Till</b> icon: it keeps its own login and its own sales, separate from Safari. Never give volunteers the password.</li>
<li><b>PIN:</b> Admin tab → choose a 4–8 digit PIN. It locks prices, stock and the Money tab (unlocked for 10 minutes at a time). Forgot it? <b>Forgot PIN?</b> and the website password.</li>
<li><b>Event and customers:</b> Admin → <b>Event</b> shows the current event. Admin → <b>Customers per day</b>: enter the estimate for each day → <b>Save customer numbers</b>. Quantities follow these; sell prices don't.</li>
<li><b>Shopping:</b> Docs tab → <b>Initial shopping list</b> → View / Print or Save to Drive. After the shop, fix any shelf price that differed (Admin → Shelf prices) and set the real stock if you bought differently (Admin → Stock on hand → <b>Set on-hand (units)</b>).</li>
<li><b>Phones:</b> iPhone or Android. Follow <b>Setting up a phone</b> below. Needs signal. The phone gets a till-only pass — no password on volunteers' phones.</li>
<li><b>Stripe:</b> Tap to Pay needs an iPhone XS or newer, or an Android phone with NFC — not the iPad. Install the <b>Stripe Dashboard</b> app, log in with a volunteer-level team login (never the admin login), check the time zone is Melbourne, and do a $1 test payment and refund. Set the Stripe phone up as a till too: card sales are quickest on that phone (copy → paste).</li>
<li><b>Paperwork:</b> follow the Compliance checklist (council notifications, Statements of Trade, EHO). Print the Price board, Float & cash-up sheet and the Shop assistant how-to.</li>
</ol>
<h2 class="avoid">Setting up a phone</h2>
${PHONE_SETUP}
<h2 class="avoid">Each morning</h2>
<ul class="avoid">
<li>Open the iPad icon and log in again (the login lasts 24 hours). Check the day buttons (D1–D${data.event.days.length}) show today.</li>
<li>End of day tab → <b>Starting float</b>: enter what is actually in the cash box.</li>
<li>Open the till on each phone; its top bar should say <b>Synced</b>. Charge the Stripe phone and power bank overnight.</li>
</ul>
<h2 class="avoid">During trading</h2>
<ul class="avoid">
<li><b>Backup badge</b> (iPad top right): <b>Backed up</b> = everything is on the website. Amber <b>N to upload</b> = safe on the device, waiting for signal. Tap it to try now.</li>
<li><b>Top-up arrived:</b> Admin → Stock on hand → type the <b>packs</b> bought → <b>Add delivery (packs)</b>.</li>
<li><b>Change a price:</b> Admin → Sell prices → <b>Save prices &amp; settings</b>. Phones pick it up within about 15 seconds.</li>
<li><b>Lost phone or volunteer gone home:</b> Admin → Phones → <b>Cancel</b>. It stops working at once; its uploaded sales are kept.</li>
<li>Each device can void only its own last sale. Card refunds are done by the organiser in Stripe, never at the stall.</li>
</ul>
<h2 class="avoid">End of day (iPad, after the last sale on every device)</h2>
<ol class="steps avoid">
<li>Check every phone says <b>Synced</b>, and the day buttons show the day you're closing.</li>
<li><b>Card:</b> Stripe Dashboard → Payments → today → type the <b>gross</b> total into <b>Stripe Dashboard — gross today</b>. Variance should be $0.00.</li>
<li><b>Cash:</b> count the cash box by note and coin into <b>Counted at close</b>. Green = balanced, amber = over, red = short.</li>
<li><b>Stock:</b> count what's left in the units shown. Blank keeps the till's estimate.</li>
<li><b>Customers:</b> the till shows how many you served today. Type your estimate for each later day → <b>Save estimates</b>. The top-up list changes as you type.</li>
<li>Tap <b>Save count &amp; close</b>. The end-of-day summary and tomorrow's top-up list are saved to the club Drive automatically. Use <b>2 days</b> for a two-day list if you can't get to Bright tomorrow.</li>
<li>Fill in and sign the paper Float &amp; cash-up sheet (two people). Bank the takings, leaving the float.</li>
</ol>
<h2 class="avoid">Money tab (treasurer, PIN)</h2>
<ul class="avoid">
<li><b>Purchases:</b> enter every shop the same day from its receipt — store, total, what for, who paid — and tap <b>Photo</b> for the receipt. The photo is saved to the club Drive.</li>
<li><b>Cash banked:</b> record each time takings leave the cash box. <b>Cash still to bank</b> should end at $0.00.</li>
<li><b>After the event:</b> enter Stripe's actual gross, fees and payout, then <b>Report to Drive</b>. Data tab → Transactions CSV for the spreadsheet; Money → next-event planning file.</li>
</ul>
<h2 class="avoid">Documents and Google Drive</h2>
<ul class="avoid">
<li>Docs tab: every document, built from the till's current numbers. <b>View / Print</b> on the device, or <b>Save to Drive</b>. Re-save after changing customers, prices or stock so Drive has the latest.</li>
<li>Filing: planning documents → <b>08_Projects / Sizzle ${esc(data.event.title)}</b>; money records (end-of-day summaries, receipts, treasurer's report) → <b>03_Financial Records / Sizzle ${esc(data.event.title)}</b>. Names start with the date and time, so nothing is overwritten.</li>
<li>Works from any logged-in device — the iPad or a computer at home.</li>
</ul>
<h2 class="avoid">Next event</h2>
<p class="avoid">Admin → Event → <b>Start a new event…</b>: name, first day, number of days, customers per day. Every device switches within a minute; phones need a new QR. Old events and their records are kept, and <b>Switch to …</b> goes back. Ask for a Woolworths Bright price check first — products and prices carry over from the data file.</p>
<h2 class="avoid">If something goes wrong</h2>
<table class="avoid"><thead><tr><th style="width:38%">What you see</th><th>What to do</th></tr></thead><tbody>
<tr><td>Amber "N to upload" that won't clear</td><td>No signal. Keep selling; it retries by itself. Tap the badge when you have signal.</td></tr>
<tr><td>Till asks for a login mid-service</td><td>The 24-hour login expired. Log in on the icon; sales already rung up are safe.</td></tr>
<tr><td>Phone says "Till pass cancelled" or "set up for a different event"</td><td>Its pass was cancelled or expired, or a new event was started. Add the phone again (Admin → Phones) and scan the new QR. Sales already on the phone are kept.</td></tr>
<tr><td>"SOLD OUT?" but there's stock</td><td>Admin → Stock on hand → <b>Set on-hand (units)</b> with the real count.</td></tr>
<tr><td>Save to Drive didn't work</td><td>Usually no signal. Nothing is lost — save again later from the Docs tab.</td></tr>
<tr><td>Card variance not $0.00</td><td>A payment approved in Stripe without <b>Card approved</b> tapped (or the reverse). Note it on the cash-up sheet.</td></tr>
<tr><td>Replacement iPad</td><td>Log in on the new iPad, open the till, Data → <b>Restore from server</b>.</td></tr>
</tbody></table>
<p class="note">The full manual is on the website: Admin → Admin Manual → Events — Sausage Sizzle. Each Admin and Money screen also has a blue <b>Help</b> button.</p>`;
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
  add("09-shop-assistant-how-to.pdf", "Shop assistant how-to", "portrait", shopAssistantGuideBody(data));
  add("10-admin-how-to.pdf", "Admin how-to", "portrait", adminGuideBody(data));
  return docs;
}
