import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileDown, Save } from "lucide-react";
import { FLOAT_DENOMS as FLOAT_DENOM_VALUES, cardReconcile, denomTotal, summariseSales, tillTopUpList, type Qty, type SizzleData } from "../../../shared/sizzle/calc.ts";
import { endOfDayBody, page, shoppingListBody } from "../../../shared/sizzle/templates.ts";
import { openPrintView } from "./printView";
import { shortName, type Till } from "./useTill";
import { ForecastRows, customersServed, forecastDraft, forecastOverrides } from "./Forecasts";
import { saveDocToDrive, saveQuietly } from "./driveSave";
import { useAuth } from "@/contexts/AuthContext";

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`;
const FLOAT_DENOMS = FLOAT_DENOM_VALUES.map(String);
const COUNT_DENOMS = ["100", "50", "20", "10", "5", "2", "1", "0.5", "0.2", "0.1", "0.05"];
const denomLabel = (d: string) => (Number(d) >= 1 ? `$${d}` : `${Math.round(Number(d) * 100)}c`);

function NumIn({ value, onChange, label, wide }: { value: string; onChange: (v: string) => void; label: string; wide?: boolean }) {
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
      className={`${wide ? "w-32" : "w-20"} h-12 rounded-lg border-2 border-stone-300 px-2 text-xl text-right focus:border-amber-600 outline-none`}
    />
  );
}

export function EndOfDayScreen({ till }: { till: Till }) {
  const { token } = useAuth();
  const { data, day, daySales, products, onHand, closes } = till;
  const dayInfo = data.event.days.find((d) => d.n === day)!;
  const summary = useMemo(() => summariseSales(daySales), [daySales]);
  const close = closes[day];

  const [floatCounts, setFloatCounts] = useState<Record<string, string>>({});
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [stripe, setStripe] = useState("");
  const [stock, setStock] = useState<Record<string, string>>({});
  const [twoDay, setTwoDay] = useState(false);

  // Reload the form whenever the day changes.
  useEffect(() => {
    const f = till.floatFor(day);
    setFloatCounts(Object.fromEntries(FLOAT_DENOMS.map((d) => [d, String(f[d] ?? 0)])));
    setCounted(Object.fromEntries(COUNT_DENOMS.map((d) => [d, close?.countedCounts[d] ? String(close.countedCounts[d]) : ""])));
    setStripe(close?.stripeTotal != null ? String(close.stripeTotal) : "");
    setStock(close ? Object.fromEntries(Object.entries(close.stockCounted).map(([k, v]) => [k, String(v)])) : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, close?.closedAt]);

  const floatNums = Object.fromEntries(FLOAT_DENOMS.map((d) => [d, Number(floatCounts[d]) || 0]));
  const floatTotal = denomTotal(floatNums);
  const countedNums = Object.fromEntries(COUNT_DENOMS.map((d) => [d, Number(counted[d]) || 0]));
  const anyCounted = COUNT_DENOMS.some((d) => counted[d] !== "" && counted[d] !== undefined);
  const countedTotal = anyCounted ? denomTotal(countedNums) : null;
  const expected = floatTotal + summary.cashTotal;
  const variance = countedTotal === null ? null : countedTotal - expected;
  const stripeTotal = stripe === "" ? null : Number(stripe);
  const card = cardReconcile(daySales, stripeTotal, data.config.card);

  // Daily consumables aren't depleted by sales — estimate one day's use for the count.
  const daily: Qty = Object.fromEntries(data.config.dailyConsumables.map((c) => [c.product, c.qtyPerDay]));
  const estimated: Qty = useMemo(() => {
    const e: Qty = {};
    for (const p of data.products) e[p.id] = Math.max(0, (onHand[p.id] ?? 0) - (close ? 0 : daily[p.id] ?? 0));
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, onHand, close]);
  const counts: Qty = Object.fromEntries(data.products.map((p) => [p.id, stock[p.id] !== undefined && stock[p.id] !== "" ? Number(stock[p.id]) : estimated[p.id]]));

  // Tomorrow's (and later) customer estimates, edited here; the top-up follows them as you type.
  const [forecast, setForecast] = useState<Record<string, string>>(() => forecastDraft(data.config.customersPerDay));
  const planData: SizzleData = useMemo(() => ({
    ...data,
    config: { ...data.config, customersPerDay: data.config.customersPerDay.map((c, i) => (forecast[String(i + 1)] ? Number(forecast[String(i + 1)]) : c)) },
  }), [data, forecast]);
  const forecastChanged = JSON.stringify(forecastOverrides(forecast)) !== JSON.stringify(till.settings.customersPerDay ?? {});
  async function saveForecast() {
    await till.saveForecasts(forecastOverrides(forecast));
    toast.success("Customer estimates saved");
  }

  const nextIdx = day; // customersPerDay index of tomorrow (day is 1-based)
  const hasNext = nextIdx < data.config.customersPerDay.length;
  const hasTwo = nextIdx + 1 < data.config.customersPerDay.length;
  const topUpDays = twoDay && hasTwo ? [nextIdx, nextIdx + 1] : [nextIdx];
  const nextLabel = hasNext ? data.event.days[nextIdx].label : "";
  const topUp = hasNext
    ? tillTopUpList(
        planData,
        counts,
        topUpDays,
        topUpDays.length === 2 ? `Days ${nextIdx + 1}–${nextIdx + 2} top-up (from the till)` : `Day ${nextIdx + 1} top-up (from the till)`,
        `Par level − stock counted at close of ${dayInfo.label}. Buy before ${nextLabel}${topUpDays.length === 2 ? ` — covers Days ${nextIdx + 1} and ${nextIdx + 2}` : ""}.`,
      )
    : null;

  async function save() {
    await till.saveFloat(day, floatNums);
    const stockCounted: Qty = {};
    for (const [k, v] of Object.entries(stock)) if (v !== "") stockCounted[k] = Number(v);
    await till.saveClose({ day, closedAt: new Date().toISOString(), floatCounts: floatNums, countedCounts: countedNums, counted: countedTotal, stripeTotal, stockCounted });
    await till.setStock(counts, `Counted at close of Day ${day}`);
    toast.success(`Day ${day} closed and saved — stock set from the count`);
    // File the day's records in the club Drive too (money → 03, tomorrow's shopping → 08).
    saveQuietly(`Day ${day} end-of-day summary`, () => saveDocToDrive(token, { html: summaryHtml(), docTitle: `Day ${day} end of day`, folder: "money", landscape: false }));
    if (topUp) saveQuietly(topUp.title, () => saveDocToDrive(token, { html: topUpHtml(), docTitle: topUp.title, folder: "planning", landscape: true }));
  }

  function summaryHtml() {
    const body = endOfDayBody(data, {
      dayLabel: `Day ${day} · ${dayInfo.label}`,
      summary,
      floatTotal,
      counted: countedTotal,
      countedBreakdown: countedNums,
      stripeTotal,
      estFees: card.estFees,
      stockRows: data.products.filter((p) => !p.notWoolworths).map((p) => ({ name: p.name, unit: p.unit, estimated: estimated[p.id], counted: stock[p.id] ? Number(stock[p.id]) : null })),
      generatedAt: new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne" }),
    });
    return page(`End of day ${day}`, "portrait", body);
  }

  function printSummary() {
    openPrintView(summaryHtml(), `Sizzle end of day ${day}`);
  }

  const topUpHtml = () => page(topUp!.title, "landscape", shoppingListBody(planData, topUp!));

  function printTopUp() {
    if (!topUp) return;
    if (forecastChanged) saveForecast();
    openPrintView(topUpHtml(), `Sizzle ${topUp.title}`);
  }

  const names = Object.fromEntries(data.menu.map((m) => [m.id, m.name]));
  const varClass = (v: number | null) => (v === null ? "" : Math.abs(v) < 0.005 ? "text-emerald-700" : v > 0 ? "text-amber-700" : "text-red-700");

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-3xl font-bold flex-1">End of day — Day {day} · {dayInfo.label}</h2>
        {close && <span className="rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-lg">Closed {new Date(close.closedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</span>}
        <button type="button" onClick={printSummary} className="h-14 px-5 rounded-xl bg-stone-800 text-white text-lg font-semibold flex items-center gap-2"><FileDown className="w-6 h-6" /> End-of-day PDF</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section className="rounded-2xl bg-white shadow p-4">
          <h3 className="text-2xl font-bold mb-2">Sales by item</h3>
          <table className="w-full text-lg">
            <thead><tr className="text-left text-stone-500"><th>Item</th><th className="text-right">Qty</th><th className="text-right">Cash</th><th className="text-right">Card</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {data.menu.map((m) => {
                const r = summary.byItem[m.id];
                return <tr key={m.id} className="border-t"><td className="py-1">{names[m.id]}</td><td className="text-right">{r?.qty ?? 0}</td><td className="text-right">{money(r?.cash ?? 0)}</td><td className="text-right">{money(r?.card ?? 0)}</td><td className="text-right font-semibold">{money(r?.total ?? 0)}</td></tr>;
              })}
              <tr className="border-t-2 font-bold"><td className="py-1">Total</td><td /><td className="text-right">{money(summary.cashTotal)}</td><td className="text-right">{money(summary.cardTotal)}</td><td className="text-right">{money(summary.total)}</td></tr>
            </tbody>
          </table>
          <p className="text-stone-600 mt-2">{summary.cashCount} cash sales · {summary.cardCount} card sales · {summary.voidCount} voided</p>
        </section>

        <section className="rounded-2xl bg-white shadow p-4">
          <h3 className="text-2xl font-bold mb-2">Card (Stripe)</h3>
          <div className="space-y-2 text-xl">
            <div className="flex justify-between"><span>Till card total ({card.count} sales)</span><b>{money(card.tillTotal)}</b></div>
            <div className="flex justify-between items-center"><span>Stripe Dashboard — gross today</span><span className="flex items-center gap-1">$<NumIn label="Stripe Dashboard total" value={stripe} onChange={setStripe} wide /></span></div>
            <div className="flex justify-between"><span>Variance (Stripe − till)</span><b className={varClass(card.variance)}>{card.variance === null ? "—" : money(card.variance)}</b></div>
            <div className="flex justify-between text-stone-600"><span>Estimated card fees</span><span>{money(card.estFees)}</span></div>
          </div>
          <p className="text-base text-stone-500 mt-3">Use Stripe's <b>gross payments</b> for today, not payouts. The account time zone must be Melbourne.</p>
        </section>
      </div>

      <section className="rounded-2xl bg-white shadow p-4">
        <h3 className="text-2xl font-bold mb-3">Cash-up (cash only)</h3>
        <div className="grid grid-cols-[1fr_2fr_1fr] gap-6">
          <div>
            <p className="text-lg font-semibold mb-1">Starting float</p>
            {FLOAT_DENOMS.map((d) => (
              <div key={d} className="flex items-center justify-between py-0.5 text-lg"><span>{denomLabel(d)} ×</span><NumIn label={`Float ${denomLabel(d)}`} value={floatCounts[d] ?? ""} onChange={(v) => setFloatCounts((f) => ({ ...f, [d]: v }))} /></div>
            ))}
            <p className="text-xl font-bold mt-1">= {money(floatTotal)}</p>
          </div>
          <div>
            <p className="text-lg font-semibold mb-1">Counted at close</p>
            <div className="grid grid-cols-2 gap-x-6">
              {COUNT_DENOMS.map((d) => (
                <div key={d} className="flex items-center justify-between py-0.5 text-lg"><span>{denomLabel(d)} ×</span><NumIn label={`Counted ${denomLabel(d)}`} value={counted[d] ?? ""} onChange={(v) => setCounted((c) => ({ ...c, [d]: v }))} /></div>
              ))}
            </div>
          </div>
          <div className="space-y-2 text-xl">
            <div className="flex justify-between"><span>Float</span><span>{money(floatTotal)}</span></div>
            <div className="flex justify-between"><span>+ Cash sales</span><span>{money(summary.cashTotal)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1"><span>Expected</span><span>{money(expected)}</span></div>
            <div className="flex justify-between"><span>Counted</span><span>{countedTotal === null ? "—" : money(countedTotal)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1 text-2xl"><span>Variance</span><span className={varClass(variance)}>{variance === null ? "—" : money(variance)}</span></div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow p-4">
        <h3 className="text-2xl font-bold mb-1">Stock count</h3>
        <p className="text-stone-600 mb-2">Count what's left and type it in (base units). Blank = keep the till's estimate. Saving sets stock on hand to these numbers.</p>
        <div className="grid grid-cols-2 gap-x-8">
          {data.products.filter((p) => !p.notWoolworths).map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1 border-b text-lg">
              <span className="flex-1 truncate" title={p.name}>{shortName(p.name)}</span>
              <span className="text-stone-500 w-32 text-right">est. {Math.round(estimated[p.id] * 10) / 10} {p.unit}</span>
              <NumIn label={`Counted ${p.name}`} value={stock[p.id] ?? ""} onChange={(v) => setStock((s) => ({ ...s, [p.id]: v }))} />
            </div>
          ))}
        </div>
        <button type="button" onClick={save} className="mt-4 h-16 px-8 rounded-2xl bg-amber-700 text-white text-2xl font-bold flex items-center gap-2"><Save className="w-7 h-7" /> Save count &amp; close Day {day}</button>
      </section>

      {topUp && (
        <section className="rounded-2xl bg-white shadow p-4">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h3 className="text-2xl font-bold flex-1">{topUp.title}</h3>
            {hasTwo && (
              <div className="flex rounded-xl border-2 border-stone-300 overflow-hidden text-lg">
                <button type="button" onClick={() => setTwoDay(false)} className={`px-4 h-12 ${!twoDay ? "bg-stone-800 text-white" : ""}`}>1 day</button>
                <button type="button" onClick={() => setTwoDay(true)} className={`px-4 h-12 ${twoDay ? "bg-stone-800 text-white" : ""}`}>2 days</button>
              </div>
            )}
            <button type="button" onClick={printTopUp} className="h-14 px-5 rounded-xl bg-stone-800 text-white text-lg font-semibold flex items-center gap-2"><FileDown className="w-6 h-6" /> Top-up PDF</button>
          </div>
          <p className="text-stone-600 mb-2">{topUp.subtitle}</p>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-3">
            <p className="text-lg mb-1">Today (Day {day}) you served <b>{customersServed(till.sales, day)}</b> customers (completed sales). How many do you expect next?</p>
            <div className="grid grid-cols-2 gap-x-8">
              <ForecastRows days={data.event.days} only={data.event.days.filter((d) => d.n > day).map((d) => d.n)} draft={forecast} onChange={(n, v) => setForecast((f) => ({ ...f, [String(n)]: v }))} sales={till.sales} />
            </div>
            <div className="flex items-center gap-3 mt-2">
              <button type="button" disabled={!forecastChanged} onClick={saveForecast} className="h-12 px-4 rounded-xl bg-amber-700 text-white text-lg font-semibold flex items-center gap-2 disabled:opacity-40"><Save className="w-5 h-5" /> Save estimates</button>
              <span className="text-stone-600">{forecastChanged ? "The list below already uses these numbers — save so the other screens use them too." : "The list below uses these numbers."}</span>
            </div>
          </div>
          {topUp.lines.length === 0 ? <p className="text-xl">Nothing to buy — stock covers it.</p> : (
            <table className="w-full text-lg">
              <thead><tr className="text-left text-stone-500"><th>Product</th><th>Pack</th><th className="text-right">Qty</th><th className="text-right">Line total</th></tr></thead>
              <tbody>{topUp.lines.map((l) => <tr key={l.product.id} className="border-t"><td className="py-1">{l.product.name}</td><td>{l.product.packSize}</td><td className="text-right font-bold">{l.packs}</td><td className="text-right">{money(l.lineTotal)}</td></tr>)}</tbody>
              <tfoot><tr className="border-t-2 font-bold"><td colSpan={3}>Woolworths total</td><td className="text-right">{money(topUp.total)}</td></tr></tfoot>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
