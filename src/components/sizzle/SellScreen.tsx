import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CreditCard, Minus, Plus, RotateCcw, Banknote, X } from "lucide-react";
import { changeDue, breakdown, saleTotal, type SaleLine } from "../../../shared/sizzle/calc.ts";
import type { StoredSale } from "@/lib/sizzleStore";
import { shortName, type Till } from "./useTill";

const money = (n: number) => `$${n.toFixed(n % 1 ? 2 : 0)}`;
const QUICK_TENDERS = [5, 10, 20, 50];

type Pay = null | { mode: "cash"; tendered: number | null; custom: string } | { mode: "card" };

export function SellScreen({ till }: { till: Till }) {
  const { data, prices, servesLeft, lowStock } = till;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pay, setPay] = useState<Pay>(null);
  const [busy, setBusy] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const lines: SaleLine[] = useMemo(
    () => data.menu.filter((m) => cart[m.id]).map((m) => ({ item: m.id, qty: cart[m.id], unitPrice: prices[m.id] })),
    [cart, data.menu, prices],
  );
  const total = saleTotal(lines);
  const add = (id: string, n = 1) => setCart((c) => {
    const q = Math.max(0, (c[id] ?? 0) + n);
    const next = { ...c, [id]: q };
    if (!q) delete next[id];
    return next;
  });

  async function confirm(method: "cash" | "card", tendered: number | null) {
    if (busy || !lines.length) return;
    setBusy(true);
    try {
      const sale = await till.recordSale(lines, method, tendered);
      setCart({});
      setPay(null);
      toast.success(method === "card" ? `Card sale saved — ${money(sale.total)}` : `Cash sale saved — change ${money(sale.change ?? 0)}`);
    } catch (err) {
      toast.error(`NOT SAVED — ${err instanceof Error ? err.message : err}. Try again.`);
    } finally {
      setBusy(false);
    }
  }

  const lastSale = [...till.daySales].reverse().find((s) => !s.voided);

  return (
    <div className="flex h-full gap-3 p-3">
      {/* Item tiles */}
      <div className="flex-[3] flex flex-col gap-3 min-w-0">
        {lowStock.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-100 border-2 border-amber-400 px-3 py-2 text-amber-900 text-base">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <div><b>Low stock:</b> {lowStock.map((l) => `${shortName(l.name)} (${l.serves} serves left)`).join(" · ")}</div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3 flex-1 auto-rows-fr">
          {data.menu.map((m) => {
            const left = servesLeft[m.id];
            const low = left < data.config.lowStockServes;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => add(m.id)}
                className="relative rounded-2xl text-white shadow-md active:scale-[0.97] transition-transform flex flex-col items-center justify-center p-3 select-none min-h-[110px]"
                style={{ background: m.colour }}
              >
                <span className="text-[26px] font-bold leading-tight text-center">{m.short}</span>
                <span className="text-[34px] font-extrabold">{money(prices[m.id])}</span>
                {cart[m.id] ? <span className="absolute top-2 right-2 rounded-full bg-white text-black text-xl font-bold min-w-10 h-10 px-2 flex items-center justify-center">{cart[m.id]}</span> : null}
                <span className={`absolute bottom-2 left-3 text-sm ${low ? "bg-white text-red-700 font-bold rounded px-1.5" : "opacity-80"}`}>{left <= 0 ? "SOLD OUT?" : `${left} left`}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => lastSale ? setVoidOpen(true) : toast.info("No sale to undo today")}
            className="rounded-2xl border-2 border-dashed border-stone-400 text-stone-700 flex flex-col items-center justify-center gap-1 text-xl font-semibold min-h-[110px] active:bg-stone-100"
          >
            <RotateCcw className="w-8 h-8" />
            Undo / void last sale
          </button>
        </div>
      </div>

      {/* Cart */}
      <div className="flex-[2] flex flex-col rounded-2xl bg-white shadow-md p-3 min-w-[300px]">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold">Order</h2>
          {lines.length > 0 && <button type="button" onClick={() => setCart({})} className="text-lg text-stone-600 px-3 py-2 rounded-lg active:bg-stone-100">Clear</button>}
        </div>
        <div className="flex-1 overflow-auto divide-y">
          {lines.length === 0 && <p className="text-stone-400 text-xl mt-8 text-center">Tap items to add them</p>}
          {lines.map((l) => {
            const m = data.menu.find((x) => x.id === l.item)!;
            return (
              <div key={l.item} className="flex items-center gap-2 py-2">
                <span className="flex-1 text-xl">{m.short}</span>
                <button type="button" aria-label={`One less ${m.short}`} onClick={() => add(l.item, -1)} className="w-14 h-14 rounded-xl bg-stone-100 flex items-center justify-center active:bg-stone-200"><Minus className="w-7 h-7" /></button>
                <span className="w-10 text-center text-2xl font-bold">{l.qty}</span>
                <button type="button" aria-label={`One more ${m.short}`} onClick={() => add(l.item, 1)} className="w-14 h-14 rounded-xl bg-stone-100 flex items-center justify-center active:bg-stone-200"><Plus className="w-7 h-7" /></button>
                <span className="w-20 text-right text-xl">{money(l.qty * l.unitPrice)}</span>
              </div>
            );
          })}
        </div>
        <div className="border-t pt-3 mt-2">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-2xl">Total</span>
            <span className="text-5xl font-extrabold">{money(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" disabled={!lines.length} onClick={() => setPay({ mode: "cash", tendered: null, custom: "" })} className="h-20 rounded-2xl bg-emerald-600 text-white text-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-30 active:bg-emerald-700">
              <Banknote className="w-8 h-8" /> Cash
            </button>
            <button type="button" disabled={!lines.length} onClick={() => setPay({ mode: "card" })} className="h-20 rounded-2xl bg-blue-700 text-white text-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-30 active:bg-blue-800">
              <CreditCard className="w-8 h-8" /> Card
            </button>
          </div>
        </div>
      </div>

      {pay?.mode === "cash" && (
        <Modal onClose={() => setPay(null)}>
          <CashPay
            total={total}
            pay={pay}
            setPay={(p) => setPay(p)}
            busy={busy}
            onConfirm={(t) => confirm("cash", t)}
          />
        </Modal>
      )}
      {pay?.mode === "card" && (
        <Modal onClose={() => setPay(null)}>
          <div className="text-center">
            <p className="text-3xl text-stone-600">Key this amount into Stripe</p>
            <p className="text-[120px] leading-none font-extrabold my-6 tracking-tight">{money(total)}</p>
            <p className="text-xl text-stone-600 mb-8">Enter exactly this total on the Stripe device, then wait for approved or declined.</p>
            <div className="grid grid-cols-2 gap-4">
              <button type="button" disabled={busy} onClick={() => { setPay(null); toast.info("Declined — offer cash"); }} className="h-24 rounded-2xl bg-stone-200 text-2xl font-bold active:bg-stone-300">Declined — back</button>
              <button type="button" disabled={busy} onClick={() => confirm("card", null)} className="h-24 rounded-2xl bg-blue-700 text-white text-3xl font-bold active:bg-blue-800">Card approved</button>
            </div>
          </div>
        </Modal>
      )}
      {voidOpen && lastSale && (
        <Modal onClose={() => setVoidOpen(false)}>
          <VoidLast sale={lastSale} data={data} onCancel={() => setVoidOpen(false)} onVoid={async () => { await till.voidSale(lastSale); setVoidOpen(false); toast.success("Sale voided — stock returned"); }} />
        </Modal>
      )}
    </div>
  );
}

function CashPay({ total, pay, setPay, busy, onConfirm }: {
  total: number;
  pay: { mode: "cash"; tendered: number | null; custom: string };
  setPay: (p: { mode: "cash"; tendered: number | null; custom: string }) => void;
  busy: boolean;
  onConfirm: (tendered: number) => void;
}) {
  const change = pay.tendered === null ? null : changeDue(total, pay.tendered);
  if (pay.tendered !== null && change !== null) {
    const parts = Object.entries(breakdown(change)).sort((a, b) => Number(b[0]) - Number(a[0])).map(([d, n]) => `${n} × $${d}`).join(" + ");
    return (
      <div className="text-center">
        <p className="text-2xl text-stone-600">Total {money(total)} · Given {money(pay.tendered)}</p>
        <p className="text-4xl font-bold mt-4">CHANGE</p>
        <p className="text-[140px] leading-none font-extrabold text-emerald-700 my-2">{money(change)}</p>
        <p className="text-xl text-stone-600 mb-8 min-h-7">{change > 0 ? parts : "No change"}</p>
        <div className="grid grid-cols-2 gap-4">
          <button type="button" disabled={busy} onClick={() => setPay({ ...pay, tendered: null })} className="h-24 rounded-2xl bg-stone-200 text-2xl font-bold active:bg-stone-300">Back</button>
          <button type="button" disabled={busy} onClick={() => onConfirm(pay.tendered!)} className="h-24 rounded-2xl bg-emerald-600 text-white text-3xl font-bold active:bg-emerald-700">Change given — done</button>
        </div>
      </div>
    );
  }
  const custom = Number(pay.custom);
  return (
    <div>
      <p className="text-center text-2xl text-stone-600">Cash — total</p>
      <p className="text-center text-8xl font-extrabold mb-6">{money(total)}</p>
      <p className="text-xl mb-2">Customer gives:</p>
      <div className="grid grid-cols-3 gap-3">
        {QUICK_TENDERS.map((t) => (
          <button key={t} type="button" disabled={t < total} onClick={() => setPay({ ...pay, tendered: t })} className="h-24 rounded-2xl bg-emerald-50 border-2 border-emerald-600 text-4xl font-extrabold text-emerald-800 disabled:opacity-25 active:bg-emerald-100">${t}</button>
        ))}
        <button type="button" onClick={() => setPay({ ...pay, tendered: total })} className="h-24 rounded-2xl bg-stone-100 border-2 border-stone-400 text-3xl font-bold active:bg-stone-200">Exact</button>
        <div className="h-24 rounded-2xl border-2 border-stone-400 flex items-center gap-2 px-3">
          <span className="text-3xl">$</span>
          <input
            inputMode="decimal"
            aria-label="Custom amount given"
            placeholder="Other"
            value={pay.custom}
            onChange={(e) => setPay({ ...pay, custom: e.target.value.replace(/[^\d.]/g, "") })}
            className="w-full text-3xl font-bold outline-none bg-transparent"
          />
          <button type="button" disabled={!(custom >= total)} onClick={() => setPay({ ...pay, tendered: custom })} className="h-16 px-4 rounded-xl bg-emerald-600 text-white text-xl font-bold disabled:opacity-25">OK</button>
        </div>
      </div>
    </div>
  );
}

function VoidLast({ sale, data, onCancel, onVoid }: { sale: StoredSale; data: Till["data"]; onCancel: () => void; onVoid: () => void }) {
  const names = Object.fromEntries(data.menu.map((m) => [m.id, m.short]));
  const time = new Date(sale.createdAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  return (
    <div>
      <h2 className="text-3xl font-bold mb-4">Void the last sale?</h2>
      <div className="rounded-xl bg-stone-100 p-4 text-xl mb-4">
        <p>{time} · <b>{sale.method === "card" ? "CARD" : "CASH"}</b> · {money(sale.total)}</p>
        <p className="mt-1">{sale.lines.map((l) => `${l.qty} × ${names[l.item] ?? l.item}`).join(", ")}</p>
      </div>
      <p className="text-lg mb-6">
        {sale.method === "cash"
          ? <>Give the customer back <b>{money(sale.total)}</b> from the cash box.</>
          : <>This removes it from the till only. <b>Card refunds are done by the organiser in Stripe</b> — take the customer's name and number.</>}
      </p>
      <div className="grid grid-cols-2 gap-4">
        <button type="button" onClick={onCancel} className="h-20 rounded-2xl bg-stone-200 text-2xl font-bold">Keep it</button>
        <button type="button" onClick={onVoid} className="h-20 rounded-2xl bg-red-600 text-white text-2xl font-bold">Void sale</button>
      </div>
    </div>
  );
}

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-auto p-6">
        <button type="button" aria-label="Close" onClick={onClose} className="absolute top-3 right-3 w-12 h-12 rounded-full flex items-center justify-center text-stone-500 active:bg-stone-100"><X className="w-7 h-7" /></button>
        {children}
      </div>
    </div>
  );
}
