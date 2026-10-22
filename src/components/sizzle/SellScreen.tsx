import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, CreditCard, Minus, Plus, RotateCcw, Banknote, X } from "lucide-react";
import { changeDue, breakdown, denomLabel, saleTotal, type SaleLine } from "../../../shared/sizzle/calc.ts";
import type { StoredSale } from "@/lib/sizzleStore";
import { shortName, type Till } from "./useTill";

const money = (n: number) => `$${n.toFixed(n % 1 ? 2 : 0)}`;
const QUICK_TENDERS = [5, 10, 20, 50];

type Pay = null | { mode: "cash"; tendered: number | null; custom: string } | { mode: "card" };

/**
 * Ring up sales. `compact` is the phone layout (TASK-041): items on top, the
 * order underneath, total + Cash/Card pinned to the bottom, no other screens.
 */
export function SellScreen({ till, compact = false }: { till: Till; compact?: boolean }) {
  const { data, prices, servesLeft, lowStock } = till;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pay, setPay] = useState<Pay>(null);
  const [busy, setBusy] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [copied, setCopied] = useState<Promise<boolean> | null>(null);

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

  // Each device can only undo its own last sale — never one rung up on another phone.
  const lastSale = [...till.daySales].reverse().find((s) => !s.voided && s.deviceId === till.deviceId);
  const c = compact;

  return (
    <div className={c ? "flex flex-col h-full gap-2 p-2" : "flex h-full gap-3 p-3"}>
      {/* Item tiles */}
      <div className={c ? "flex flex-col gap-2 min-w-0 shrink-0" : "flex-[3] flex flex-col gap-3 min-w-0"}>
        {lowStock.length > 0 && (
          <div className={`flex items-start gap-2 rounded-xl bg-amber-100 border-2 border-amber-400 px-3 text-amber-900 ${c ? "py-1 text-sm" : "py-2 text-base"}`}>
            <AlertTriangle className={`${c ? "w-5 h-5" : "w-6 h-6"} shrink-0`} />
            <div><b>Low stock:</b> {lowStock.map((l) => `${shortName(l.name)} (${l.serves} serves left)`).join(" · ")}</div>
          </div>
        )}
        <div className={c ? "grid grid-cols-2 gap-2 auto-rows-[76px]" : "grid grid-cols-3 gap-3 flex-1 auto-rows-fr"}>
          {data.menu.map((m) => {
            const left = servesLeft[m.id];
            const low = left < data.config.lowStockServes;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => add(m.id)}
                className={`relative rounded-2xl text-white shadow-md active:scale-[0.97] transition-transform flex flex-col items-center justify-center select-none ${c ? "p-1" : "p-3 min-h-[110px]"}`}
                style={{ background: m.colour }}
              >
                <span className={`${c ? "text-lg" : "text-[26px]"} font-bold leading-tight text-center`}>{m.short}</span>
                <span className={`${c ? "text-2xl" : "text-[34px]"} font-extrabold`}>{money(prices[m.id])}</span>
                {cart[m.id] ? <span className={`absolute rounded-full bg-white text-black font-bold flex items-center justify-center ${c ? "top-1 right-1 text-base min-w-8 h-8 px-1.5" : "top-2 right-2 text-xl min-w-10 h-10 px-2"}`}>{cart[m.id]}</span> : null}
                <span className={`absolute ${c ? "bottom-1 left-2 text-xs" : "bottom-2 left-3 text-sm"} ${low ? "bg-white text-red-700 font-bold rounded px-1.5" : "opacity-80"}`}>{left <= 0 ? "SOLD OUT?" : `${left} left`}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => lastSale ? setVoidOpen(true) : toast.info("No sale to undo today")}
            className={`rounded-2xl border-2 border-dashed border-stone-400 text-stone-700 flex items-center justify-center gap-1 font-semibold active:bg-stone-100 ${c ? "text-base" : "flex-col text-xl min-h-[110px]"}`}
          >
            <RotateCcw className={c ? "w-5 h-5" : "w-8 h-8"} />
            {c ? "Void last sale" : "Undo / void last sale"}
          </button>
        </div>
      </div>

      {/* Cart */}
      <div className={c ? "flex-1 min-h-0 flex flex-col rounded-2xl bg-white shadow-md p-2" : "flex-[2] flex flex-col rounded-2xl bg-white shadow-md p-3 min-w-[300px]"}>
        <div className="flex items-center justify-between mb-1">
          <h2 className={c ? "text-lg font-bold" : "text-2xl font-bold"}>Order</h2>
          {lines.length > 0 && <button type="button" onClick={() => setCart({})} className="text-lg text-stone-600 px-3 py-1 rounded-lg active:bg-stone-100">Clear</button>}
        </div>
        <div className="flex-1 overflow-auto divide-y">
          {lines.length === 0 && <p className={`text-stone-400 text-center ${c ? "text-base mt-2" : "text-xl mt-8"}`}>Tap items to add them</p>}
          {lines.map((l) => {
            const m = data.menu.find((x) => x.id === l.item)!;
            return (
              <div key={l.item} className={`flex items-center gap-2 ${c ? "py-1" : "py-2"}`}>
                <span className={`flex-1 ${c ? "text-base" : "text-xl"}`}>{m.short}</span>
                <button type="button" aria-label={`One less ${m.short}`} onClick={() => add(l.item, -1)} className={`${c ? "w-11 h-11" : "w-14 h-14"} rounded-xl bg-stone-100 flex items-center justify-center active:bg-stone-200`}><Minus className={c ? "w-5 h-5" : "w-7 h-7"} /></button>
                <span className={`w-8 text-center font-bold ${c ? "text-xl" : "text-2xl"}`}>{l.qty}</span>
                <button type="button" aria-label={`One more ${m.short}`} onClick={() => add(l.item, 1)} className={`${c ? "w-11 h-11" : "w-14 h-14"} rounded-xl bg-stone-100 flex items-center justify-center active:bg-stone-200`}><Plus className={c ? "w-5 h-5" : "w-7 h-7"} /></button>
                <span className={`w-16 text-right ${c ? "text-base" : "text-xl"}`}>{money(l.qty * l.unitPrice)}</span>
              </div>
            );
          })}
        </div>
        <div className={c ? "border-t pt-2 mt-1" : "border-t pt-3 mt-2"}>
          <div className={`flex items-baseline justify-between ${c ? "mb-2" : "mb-3"}`}>
            <span className={c ? "text-xl" : "text-2xl"}>Total</span>
            <span className={`${c ? "text-4xl" : "text-5xl"} font-extrabold`}>{money(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" disabled={!lines.length} onClick={() => setPay({ mode: "cash", tendered: null, custom: "" })} className={`${c ? "h-16" : "h-20"} rounded-2xl bg-emerald-600 text-white text-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-30 active:bg-emerald-700`}>
              <Banknote className="w-8 h-8" /> Cash
            </button>
            <button type="button" disabled={!lines.length} onClick={() => { setCopied(c ? copyAmount(total) : null); setPay({ mode: "card" }); }} className={`${c ? "h-16" : "h-20"} rounded-2xl bg-blue-700 text-white text-2xl font-bold flex items-center justify-center gap-2 disabled:opacity-30 active:bg-blue-800`}>
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
          <CardPay total={total} busy={busy} canCopy={c} copied={copied} onCopy={() => setCopied(copyAmount(total))} onDeclined={() => { setPay(null); toast.info("Declined — offer cash"); }} onApproved={() => confirm("card", null)} />
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

/**
 * Put "12.00" on the clipboard for pasting into the Stripe app. Must run inside
 * the tap itself — iPhone Safari refuses clipboard writes made any later.
 */
function copyAmount(total: number): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return Promise.resolve(false);
  return navigator.clipboard.writeText(total.toFixed(2)).then(() => true, () => false);
}

/**
 * Card: show the amount big. On a phone (`canCopy`) Stripe is on the same device, so
 * show the copy result from the Card tap and a button to copy again. The iPad has no
 * Stripe (no NFC), so the amount is typed into the Stripe phone by hand.
 */
function CardPay({ total, busy, canCopy, copied, onCopy, onDeclined, onApproved }: { total: number; busy: boolean; canCopy: boolean; copied: Promise<boolean> | null; onCopy: () => void; onDeclined: () => void; onApproved: () => void }) {
  const amount = total.toFixed(2);
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    setOk(false);
    copied?.then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, [copied]);
  return (
    <div className="text-center">
      <p className="text-xl sm:text-3xl text-stone-600">{canCopy ? "Key this amount into Stripe" : "Type this amount into the Stripe phone"}</p>
      <p className="text-[72px] sm:text-[120px] leading-none font-extrabold my-4 sm:my-6 tracking-tight">{money(total)}</p>
      {canCopy && (
        <button type="button" onClick={onCopy} className="mx-auto mb-3 h-12 px-4 rounded-xl border-2 border-blue-700 text-blue-800 text-lg font-semibold flex items-center gap-2">
          {ok ? <><Check className="w-5 h-5" /> {amount} copied — paste it in Stripe</> : <><Copy className="w-5 h-5" /> Copy {amount}</>}
        </button>
      )}
      <p className="text-base sm:text-xl text-stone-600 mb-6 sm:mb-8">{canCopy ? "Enter exactly this total in the Stripe app, then wait for approved or declined." : "Type exactly this total into the Stripe app on the Stripe phone, then wait for approved or declined."}</p>
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <button type="button" disabled={busy} onClick={onDeclined} className="h-20 sm:h-24 rounded-2xl bg-stone-200 text-xl sm:text-2xl font-bold active:bg-stone-300">Declined — back</button>
        <button type="button" disabled={busy} onClick={onApproved} className="h-20 sm:h-24 rounded-2xl bg-blue-700 text-white text-2xl sm:text-3xl font-bold active:bg-blue-800">Card approved</button>
      </div>
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
    const parts = Object.entries(breakdown(change)).sort((a, b) => Number(b[0]) - Number(a[0])).map(([d, n]) => `${n} × ${denomLabel(Number(d))}`).join(" + ");
    return (
      <div className="text-center">
        <p className="text-lg sm:text-2xl text-stone-600">Total {money(total)} · Given {money(pay.tendered)}</p>
        <p className="text-3xl sm:text-4xl font-bold mt-4">CHANGE</p>
        <p className="text-[84px] sm:text-[140px] leading-none font-extrabold text-emerald-700 my-2">{money(change)}</p>
        <p className="text-base sm:text-xl text-stone-600 mb-6 sm:mb-8 min-h-7">{change > 0 ? parts : "No change"}</p>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <button type="button" disabled={busy} onClick={() => setPay({ ...pay, tendered: null })} className="h-20 sm:h-24 rounded-2xl bg-stone-200 text-xl sm:text-2xl font-bold active:bg-stone-300">Back</button>
          <button type="button" disabled={busy} onClick={() => onConfirm(pay.tendered!)} className="h-20 sm:h-24 rounded-2xl bg-emerald-600 text-white text-xl sm:text-3xl font-bold active:bg-emerald-700">Change given — done</button>
        </div>
      </div>
    );
  }
  const custom = Number(pay.custom);
  return (
    <div>
      <p className="text-center text-lg sm:text-2xl text-stone-600">Cash — total</p>
      <p className="text-center text-6xl sm:text-8xl font-extrabold mb-4 sm:mb-6">{money(total)}</p>
      <p className="text-lg sm:text-xl mb-2">Customer gives:</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {QUICK_TENDERS.map((t) => (
          <button key={t} type="button" disabled={t < total} onClick={() => setPay({ ...pay, tendered: t })} className="h-20 sm:h-24 rounded-2xl bg-emerald-50 border-2 border-emerald-600 text-3xl sm:text-4xl font-extrabold text-emerald-800 disabled:opacity-25 active:bg-emerald-100">${t}</button>
        ))}
        <button type="button" onClick={() => setPay({ ...pay, tendered: total })} className="h-20 sm:h-24 rounded-2xl bg-stone-100 border-2 border-stone-400 text-2xl sm:text-3xl font-bold active:bg-stone-200">Exact</button>
        <div className="h-20 sm:h-24 rounded-2xl border-2 border-stone-400 flex items-center gap-2 px-3 col-span-2 sm:col-span-1">
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
      <h2 className="text-2xl sm:text-3xl font-bold mb-4">Void the last sale?</h2>
      <div className="rounded-xl bg-stone-100 p-4 text-lg sm:text-xl mb-4">
        <p>{time} · <b>{sale.method === "card" ? "CARD" : "CASH"}</b> · {money(sale.total)}</p>
        <p className="mt-1">{sale.lines.map((l) => `${l.qty} × ${names[l.item] ?? l.item}`).join(", ")}</p>
      </div>
      <p className="text-base sm:text-lg mb-6">
        {sale.method === "cash"
          ? <>Give the customer back <b>{money(sale.total)}</b> from the cash box.</>
          : <>This removes it from the till only. <b>Card refunds are done by the organiser in Stripe</b> — take the customer's name and number.</>}
      </p>
      <div className="grid grid-cols-2 gap-4">
        <button type="button" onClick={onCancel} className="h-20 rounded-2xl bg-stone-200 text-xl sm:text-2xl font-bold">Keep it</button>
        <button type="button" onClick={onVoid} className="h-20 rounded-2xl bg-red-600 text-white text-xl sm:text-2xl font-bold">Void sale</button>
      </div>
    </div>
  );
}

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true">
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[95vh] overflow-auto p-4 sm:p-6">
        <button type="button" aria-label="Close" onClick={onClose} className="absolute top-3 right-3 w-12 h-12 rounded-full flex items-center justify-center text-stone-500 active:bg-stone-100"><X className="w-7 h-7" /></button>
        {children}
      </div>
    </div>
  );
}
