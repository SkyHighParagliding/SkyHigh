import { useState } from "react";
import { toast } from "sonner";
import { Camera, CloudUpload, Download, FileDown, Plus, Receipt, Save, Trash2 } from "lucide-react";
import type { Banking, Purchase } from "../../../shared/sizzle/report.ts";
import { reportCsv } from "../../../shared/sizzle/report.ts";
import { page } from "../../../shared/sizzle/templates.ts";
import { eventReportBody } from "../../../shared/sizzle/reportTemplate.ts";
import { download, newId } from "@/lib/sizzleStore";
import { openPrintView } from "./printView";
import { PinProtected } from "./AdminScreen";
import { Modal } from "./SellScreen";
import { EVENT_ID, type Till } from "./useTill";
import { saveDocToDrive, saveImageToDrive, saveQuietly } from "./driveSave";
import { useAuth } from "@/contexts/AuthContext";
import { HelpButton } from "./HelpPopup";

function MoneyHelp() {
  return (
    <>
      <p>This tab is the treasurer's record of the event. The sales figures fill in by themselves from the till — you only enter <b>money that went out</b> (purchases), <b>money that left the cash box</b> (banking) and, after the event, <b>Stripe's real figures</b>.</p>

      <h3>The six boxes at the top</h3>
      <ul>
        <li><b>Sales</b> — everything rung up (voided sales left out), split cash / card.</li>
        <li><b>Purchases</b> — the receipts entered below, against the planned shopping spend.</li>
        <li><b>Stripe fees</b> — an estimate until you enter the actual fees at the bottom.</li>
        <li><b>Net result</b> — sales − purchases − fees.</li>
        <li><b>Cash still to bank</b> — cash taken minus cash banked. It should be $0 at the end (the float is not counted).</li>
        <li><b>Leftover stock at cost</b> — what's left on the shelf, valued at what we paid.</li>
      </ul>
      <p>"By day" shows each day's sales and whether End of day was done ("not closed" means it wasn't).</p>

      <h3>Purchases (receipts) — every shop</h3>
      <ol>
        <li>Tap <b>Photo</b> and photograph the receipt (optional, but it's the record).</li>
        <li>Type the <b>receipt total</b>, who paid (so they can be paid back), and what it was for.</li>
        <li>Tap <b>Add</b>. Wrong one? Tap the bin icon on its row.</li>
      </ol>
      <p>If a pack cost more or less than planned, you can also put the pack price in Admin → Shelf prices so costings match.</p>

      <h3>Cash banked</h3>
      <p>Each time takings leave the cash box — banked, or handed to the treasurer — add the amount here. Leave the float in the box; don't record it.</p>

      <h3>Stripe — actual figures (after the event)</h3>
      <p>In the Stripe Dashboard → Balances / Payouts (or Reports) for 31 Oct – 3 Nov, copy the <b>gross</b> card payments, total <b>fees</b> and <b>net</b> paid to the club, then Save. The line underneath compares Stripe's gross with the till's card total — a difference usually means a card sale was rung up as cash, or a declined card was kept.</p>

      <h3>Reports</h3>
      <ul>
        <li><b>Treasurer's report PDF</b> — opens a print view; tap Print → Save to Files for a PDF.</li>
        <li><b>CSV</b> — the same figures for a spreadsheet.</li>
        <li><b>Next-event planning file</b> — real customer numbers, buying mix and card share to plan the next sizzle from.</li>
      </ul>
      <p>Everything here is saved on this iPad and backed up to the website when there's signal.</p>
    </>
  );
}

const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n).toFixed(2)}`);
const todayYmd = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Melbourne" }).format(new Date());
const input = "w-full min-w-0 h-12 rounded-lg border-2 border-stone-300 px-2 text-lg focus:border-amber-600 outline-none";

/** Shrink a camera photo to a ~150 KB JPEG data URL so it can sync with the record. */
async function compressPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't read the photo"));
      i.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.6);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function MoneyScreen({ till }: { till: Till }) {
  return <PinProtected till={till}><Money till={till} /></PinProtected>;
}

function Money({ till }: { till: Till }) {
  const { token } = useAuth();
  const { data, report: r, lessons } = till;
  const [viewReceipt, setViewReceipt] = useState<string | null>(null);
  const stamp = () => new Date().toISOString().slice(0, 10);

  const reportHtml = () => page(`Treasurer's report ${data.event.title}`, "portrait", eventReportBody(data, r, lessons, new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })));
  function printReport() {
    openPrintView(reportHtml(), `${data.event.title} sizzle treasurer report`);
  }
  function reportToDrive() {
    saveQuietly("Treasurer's report", () => saveDocToDrive(token, { html: reportHtml(), docTitle: `Treasurer's report ${data.event.title}`, folder: "money", landscape: false }));
  }

  const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="rounded-2xl bg-white shadow p-4"><p className="text-stone-500 text-base">{label}</p><p className={`text-3xl font-extrabold ${tone ?? ""}`}>{value}</p></div>
  );

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-3xl font-bold flex-1">Money — {data.event.title}</h2>
        <HelpButton title="Money tab — what to do"><MoneyHelp /></HelpButton>
        <button type="button" onClick={printReport} className="h-14 px-5 rounded-xl bg-stone-800 text-white text-lg font-semibold flex items-center gap-2"><FileDown className="w-6 h-6" /> Treasurer's report PDF</button>
        <button type="button" onClick={reportToDrive} className="h-14 px-5 rounded-xl bg-white border-2 border-stone-800 text-lg font-semibold flex items-center gap-2"><CloudUpload className="w-6 h-6" /> Report to Drive</button>
        <button type="button" onClick={() => download(`${EVENT_ID}-treasurer-report-${stamp()}.csv`, reportCsv(r), "text/csv")} className="h-14 px-5 rounded-xl bg-white border-2 border-stone-800 text-lg font-semibold flex items-center gap-2"><Download className="w-6 h-6" /> Report CSV</button>
        <button type="button" onClick={() => download(`${EVENT_ID}-lessons-for-next-event-${stamp()}.json`, JSON.stringify(lessons, null, 2), "application/json")} className="h-14 px-5 rounded-xl bg-white border-2 border-amber-700 text-lg font-semibold flex items-center gap-2"><Download className="w-6 h-6" /> Next-event planning file</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label={`Sales (${money(r.totals.cash)} cash · ${money(r.totals.card)} card)`} value={money(r.totals.sales)} />
        <Stat label={`Purchases (${r.purchases.length} receipts · planned ${money(r.plannedSpend)})`} value={money(r.purchasesTotal)} />
        <Stat label={`Stripe fees (${r.stripe.feesSource === "actual" ? "actual" : "estimated"})`} value={money(r.stripe.feesUsed)} />
        <Stat label="Net result (sales − purchases − fees)" value={money(r.profit.net)} tone={r.profit.net >= 0 ? "text-emerald-700" : "text-red-700"} />
        <Stat label={`Cash still to bank (banked ${money(r.cash.banked)})`} value={money(r.cash.toBank)} />
        <Stat label="Leftover stock at cost" value={money(r.closingStockValue)} />
      </div>

      <section className="rounded-2xl bg-white shadow p-4">
        <h3 className="text-2xl font-bold mb-2">By day</h3>
        <table className="w-full text-lg">
          <thead><tr className="text-left text-stone-500"><th>Day</th><th className="text-right">Sales #</th><th className="text-right">Cash</th><th className="text-right">Card</th><th className="text-right">Total</th><th className="text-right">Planned</th><th className="text-right">Cash var.</th><th className="text-right">Stripe var.</th></tr></thead>
          <tbody>{r.days.map((d) => (
            <tr key={d.day} className="border-t"><td className="py-1">D{d.day} · {d.label}{!d.closed && <span className="ml-2 text-sm text-red-700">not closed</span>}</td><td className="text-right">{d.transactions}</td><td className="text-right">{money(d.cash)}</td><td className="text-right">{money(d.card)}</td><td className="text-right font-semibold">{money(d.sales)}</td><td className="text-right text-stone-500">{money(d.plannedSales)}</td><td className="text-right">{money(d.cashVariance)}</td><td className="text-right">{money(d.stripeVariance)}</td></tr>
          ))}</tbody>
        </table>
      </section>

      <Purchases till={till} onView={setViewReceipt} />
      <BankingSection till={till} />
      <StripeSection till={till} />

      <section className="rounded-2xl bg-white shadow p-4">
        <h3 className="text-2xl font-bold mb-2">For next time</h3>
        <ul className="list-disc pl-6 space-y-1 text-lg">{lessons.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        <p className="text-stone-500 mt-2">"Next-event planning file" saves these figures, plus suggested customers per day, buying mix and card share, as a starting point for the next event's plan.</p>
      </section>

      {viewReceipt && (
        <Modal onClose={() => setViewReceipt(null)}>
          <img src={viewReceipt} alt="Receipt" className="max-w-full mx-auto" />
        </Modal>
      )}
    </div>
  );
}

function Purchases({ till, onView }: { till: Till; onView: (src: string) => void }) {
  const { token } = useAuth();
  const days = till.data.event.days;
  const blank = (): Purchase => ({ id: newId("purchase"), date: todayYmd(), day: till.day, store: "Woolworths Bright", amount: 0, purpose: "Top-up shop", paidBy: "", note: "", receipt: null });
  const [form, setForm] = useState<Purchase>(blank);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const a = Number(amount);
    if (!(a > 0)) return toast.error("Enter the receipt total");
    if (!form.paidBy.trim()) return toast.error("Who paid? (for reimbursement)");
    await till.savePurchase({ ...form, amount: Math.round(a * 100) / 100 });
    toast.success("Purchase saved");
    // The receipt photo also goes to the club Drive (03_Financial Records) for the treasurer.
    if (form.receipt) {
      const receipt = form.receipt;
      const docTitle = `Receipt ${form.date} ${form.store} ${a.toFixed(2)} paid by ${form.paidBy.trim()}`;
      saveQuietly("Receipt photo", () => saveImageToDrive(token, { dataUrl: receipt, docTitle }));
    }
    setForm(blank());
    setAmount("");
  }

  async function photo(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      setForm((f) => ({ ...f, receipt: null }));
      const receipt = await compressPhoto(file);
      setForm((f) => ({ ...f, receipt }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white shadow p-4">
      <h3 className="text-2xl font-bold mb-1">Purchases (receipts)</h3>
      <p className="text-stone-500 mb-3">Enter every shop from its receipt — the actual cost the treasurer reimburses. Take a photo of the receipt as a record.</p>
      <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2 items-end mb-2">
        <label className="flex flex-col text-base">Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} /></label>
        <label className="flex flex-col text-base">For day
          <select value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) })} className={input}>
            <option value={0}>Before Day 1</option>
            {days.map((d) => <option key={d.n} value={d.n}>Day {d.n} · {d.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-base">Store<input value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })} className={input} /></label>
        <label className="flex flex-col text-base">Receipt total $<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className={`${input} text-right`} /></label>
        <label className="flex flex-col text-base">What for
          <select value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className={input}>
            {["Initial shop", "Top-up shop", "Ice", "Gas", "Equipment", "Other"].map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-base">Paid by<input value={form.paidBy} placeholder="name" onChange={(e) => setForm({ ...form, paidBy: e.target.value })} className={input} /></label>
        <label className="flex flex-col text-base">Note<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={input} /></label>
        <div className="flex gap-2">
          <label className={`h-12 px-3 rounded-lg border-2 border-stone-400 flex items-center gap-2 text-base cursor-pointer ${form.receipt ? "bg-emerald-50 border-emerald-600" : ""}`}>
            <Camera className="w-5 h-5" /> {busy ? "…" : form.receipt ? "Photo ✓" : "Photo"}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { photo(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <button type="button" onClick={save} className="h-12 px-4 rounded-lg bg-amber-700 text-white text-lg font-bold flex items-center gap-1"><Plus className="w-5 h-5" /> Add</button>
        </div>
      </div>
      <table className="w-full text-lg">
        <thead><tr className="text-left text-stone-500"><th>Date</th><th>Store</th><th>For</th><th>Paid by</th><th>Note</th><th /><th className="text-right">Amount</th><th /></tr></thead>
        <tbody>
          {till.purchases.sort((a, b) => a.date.localeCompare(b.date)).map((p) => (
            <tr key={p.id} className="border-t">
              <td className="py-1">{p.date}</td><td>{p.store}</td><td>{p.purpose}{p.day ? ` (D${p.day})` : ""}</td><td>{p.paidBy}</td><td className="text-stone-600">{p.note}</td>
              <td>{p.receipt && <button type="button" aria-label="View receipt" onClick={() => onView(p.receipt!)} className="p-2"><Receipt className="w-6 h-6 text-emerald-700" /></button>}</td>
              <td className="text-right font-semibold">{money(p.amount)}</td>
              <td className="text-right"><button type="button" aria-label="Delete purchase" onClick={async () => { await till.savePurchase({ ...p, deleted: true }); toast.success("Purchase removed"); }} className="p-2 text-stone-500"><Trash2 className="w-5 h-5" /></button></td>
            </tr>
          ))}
          <tr className="border-t-2 font-bold"><td colSpan={6}>Total</td><td className="text-right">{money(till.report.purchasesTotal)}</td><td /></tr>
        </tbody>
      </table>
    </section>
  );
}

function BankingSection({ till }: { till: Till }) {
  const blank = (): Banking => ({ id: newId("banking"), date: todayYmd(), day: till.day, amount: 0, by: "", note: "" });
  const [form, setForm] = useState<Banking>(blank);
  const [amount, setAmount] = useState("");
  async function save() {
    const a = Number(amount);
    if (!(a > 0)) return toast.error("Enter the amount banked");
    if (!form.by.trim()) return toast.error("Who banked it / took it?");
    await till.saveBanking({ ...form, amount: Math.round(a * 100) / 100 });
    toast.success("Banking saved");
    setForm(blank());
    setAmount("");
  }
  return (
    <section className="rounded-2xl bg-white shadow p-4">
      <h3 className="text-2xl font-bold mb-1">Cash banked</h3>
      <p className="text-stone-500 mb-3">Each time cash takings leave the cash box (banked, or handed to the treasurer), record it here. Leave the float in the box. "Cash still to bank" above should reach $0 at the end.</p>
      <div className="grid grid-cols-[repeat(5,minmax(0,1fr))] gap-2 items-end mb-2">
        <label className="flex flex-col text-base">Date<input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} /></label>
        <label className="flex flex-col text-base">Takings from
          <select value={form.day} onChange={(e) => setForm({ ...form, day: Number(e.target.value) })} className={input}>
            {till.data.event.days.map((d) => <option key={d.n} value={d.n}>Day {d.n}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-base">Amount $<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className={`${input} text-right`} /></label>
        <label className="flex flex-col text-base">By<input value={form.by} placeholder="name" onChange={(e) => setForm({ ...form, by: e.target.value })} className={input} /></label>
        <div className="flex gap-2 items-end">
          <label className="flex flex-col text-base flex-1">Note<input value={form.note} placeholder="deposit ref" onChange={(e) => setForm({ ...form, note: e.target.value })} className={input} /></label>
          <button type="button" onClick={save} className="h-12 px-4 rounded-lg bg-amber-700 text-white text-lg font-bold flex items-center gap-1"><Plus className="w-5 h-5" /> Add</button>
        </div>
      </div>
      <table className="w-full text-lg">
        <tbody>
          {till.banking.sort((a, b) => a.date.localeCompare(b.date)).map((b) => (
            <tr key={b.id} className="border-t">
              <td className="py-1">{b.date}</td><td>Day {b.day}</td><td>{b.by}</td><td className="text-stone-600">{b.note}</td><td className="text-right font-semibold">{money(b.amount)}</td>
              <td className="text-right"><button type="button" aria-label="Delete banking" onClick={async () => { await till.saveBanking({ ...b, deleted: true }); toast.success("Entry removed"); }} className="p-2 text-stone-500"><Trash2 className="w-5 h-5" /></button></td>
            </tr>
          ))}
          <tr className="border-t-2 font-bold"><td colSpan={4}>Total banked</td><td className="text-right">{money(till.report.bankedTotal)}</td><td /></tr>
        </tbody>
      </table>
    </section>
  );
}

function StripeSection({ till }: { till: Till }) {
  const s = till.stripeActual;
  const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  const [gross, setGross] = useState(str(s?.gross));
  const [fees, setFees] = useState(str(s?.fees));
  const [net, setNet] = useState(str(s?.net));
  const [note, setNote] = useState(s?.note ?? "");
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <section className="rounded-2xl bg-white shadow p-4">
      <h3 className="text-2xl font-bold mb-1">Stripe — actual figures</h3>
      <p className="text-stone-500 mb-3">After the event, open the Stripe Dashboard → Balances / Payouts (or Reports) for 31 Oct – 3 Nov and enter the gross card payments, the total fees and the net amount paid to the club. Until fees are entered, the report uses the till's estimate ({money(till.report.stripe.estFees)}).</p>
      <div className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-2 items-end">
        <label className="flex flex-col text-base">Gross $<input inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value.replace(/[^\d.]/g, ""))} className={`${input} text-right`} /></label>
        <label className="flex flex-col text-base">Fees $<input inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value.replace(/[^\d.]/g, ""))} className={`${input} text-right`} /></label>
        <label className="flex flex-col text-base">Net paid out $<input inputMode="decimal" value={net} onChange={(e) => setNet(e.target.value.replace(/[^\d.]/g, ""))} className={`${input} text-right`} /></label>
        <label className="flex flex-col text-base">Note<input value={note} placeholder="payout ref" onChange={(e) => setNote(e.target.value)} className={input} /></label>
        <button type="button" onClick={async () => { await till.saveStripeActual({ gross: num(gross), fees: num(fees), net: num(net), note }); toast.success("Stripe figures saved"); }} className="h-12 px-4 rounded-lg bg-amber-700 text-white text-lg font-bold flex items-center gap-1"><Save className="w-5 h-5" /> Save</button>
      </div>
      <p className="text-stone-600 mt-2">Till card total {money(till.report.totals.card)} ({till.report.totals.cardTxns} sales){s?.gross != null ? ` · Stripe gross − till = ${money(Math.round((s.gross - till.report.totals.card) * 100) / 100)}` : ""}</p>
    </section>
  );
}
