import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock, PackagePlus, Save } from "lucide-react";
import { pricingTable, type Qty } from "../../../shared/sizzle/calc.ts";
import { sha256, type TillSettings } from "@/lib/sizzleStore";
import { useAuth } from "@/contexts/AuthContext";
import { BASE, shortName, type Till } from "./useTill";

const UNLOCK_MS = 10 * 60 * 1000;
let unlockedUntil = 0;

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="flex items-center gap-2 py-1 border-b text-lg">
      <span className="flex-1">{label}{hint && <span className="block text-sm text-stone-500">{hint}</span>}</span>
      <input inputMode="decimal" aria-label={label} value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))} className="w-28 h-12 rounded-lg border-2 border-stone-300 px-2 text-xl text-right focus:border-amber-600 outline-none" />
    </label>
  );
}

/**
 * Forgotten PIN: prove you're the logged-in admin with your website password.
 * Volunteers share the iPad's admin session but don't know its password. The
 * check creates a throwaway session, which is logged out straight away.
 */
function PinReset({ till, onDone }: { till: Till; onDone: () => void }) {
  const { user, token } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function reset() {
    setBusy(true);
    try {
      if (token !== "dev-bypass") {
        const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user?.email, password }) });
        if (!r.ok) {
          toast.error(r.status === 401 ? "Wrong password" : "Couldn't check the password — are you online?");
          return;
        }
        const { token: tmp } = await r.json();
        if (tmp) fetch("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${tmp}` } }).catch(() => {});
      }
      await till.saveSettings({ ...till.settings, pinHash: null });
      toast.success("PIN cleared — choose a new one");
      onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 text-left">
      <p className="text-stone-600">Enter the website password for <b>{user?.email}</b> (the admin logged in on this iPad). Needs signal.</p>
      <input type="password" autoComplete="current-password" aria-label="Admin website password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && reset()} className="w-full h-14 rounded-xl border-2 border-stone-300 px-3 text-xl" />
      <button type="button" disabled={busy || !password} onClick={reset} className="w-full h-14 rounded-2xl bg-stone-800 text-white text-xl font-bold disabled:opacity-40">Reset PIN</button>
    </div>
  );
}

function PinGate({ till, onUnlock }: { till: Till; onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [forgot, setForgot] = useState(false);
  const setting = !till.settings.pinHash;
  async function submit() {
    if (!/^\d{4,8}$/.test(pin)) return toast.error("PIN must be 4–8 digits");
    if (setting) {
      if (pin !== pin2) return toast.error("PINs don't match");
      await till.saveSettings({ ...till.settings, pinHash: await sha256(`sizzle:${pin}`) });
      toast.success("Admin PIN set");
      onUnlock();
    } else if ((await sha256(`sizzle:${pin}`)) === till.settings.pinHash) {
      onUnlock();
    } else {
      toast.error("Wrong PIN");
      setPin("");
    }
  }
  return (
    <div className="h-full flex items-center justify-center">
      <div className="bg-white rounded-3xl shadow p-8 w-[420px] text-center space-y-4">
        <Lock className="w-12 h-12 mx-auto text-amber-700" />
        <h2 className="text-3xl font-bold">{setting ? "Set an admin PIN" : "Admin PIN"}</h2>
        {setting && <p className="text-stone-600">Choose a PIN for prices, stock and portions. Keep it from volunteers.</p>}
        <input type="password" inputMode="numeric" autoComplete="off" aria-label="PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} className="w-full h-16 rounded-xl border-2 border-stone-300 text-center text-4xl tracking-[0.5em]" />
        {setting && <input type="password" inputMode="numeric" autoComplete="off" aria-label="Repeat PIN" placeholder="repeat" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} className="w-full h-16 rounded-xl border-2 border-stone-300 text-center text-4xl tracking-[0.5em]" />}
        <button type="button" onClick={submit} className="w-full h-16 rounded-2xl bg-amber-700 text-white text-2xl font-bold">{setting ? "Set PIN" : "Unlock"}</button>
        {!setting && !forgot && <button type="button" onClick={() => setForgot(true)} className="text-stone-600 underline text-lg">Forgot PIN?</button>}
        {!setting && forgot && <PinReset till={till} onDone={() => setForgot(false)} />}
      </div>
    </div>
  );
}

export function AdminScreen({ till }: { till: Till }) {
  const [unlocked, setUnlocked] = useState(Date.now() < unlockedUntil);
  useEffect(() => {
    if (!unlocked) return;
    const t = window.setTimeout(() => setUnlocked(false), Math.max(0, unlockedUntil - Date.now()));
    return () => window.clearTimeout(t);
  }, [unlocked]);
  if (!unlocked) return <PinGate till={till} onUnlock={() => { unlockedUntil = Date.now() + UNLOCK_MS; setUnlocked(true); }} />;
  return <AdminForm till={till} />;
}

function AdminForm({ till }: { till: Till }) {
  const { data, settings, onHand, products } = till;
  const rows = useMemo(() => pricingTable(data), [data]);
  const toStr = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]));
  const [sell, setSell] = useState<Record<string, string>>(toStr(settings.priceOverrides));
  const [shelf, setShelf] = useState<Record<string, string>>(toStr(settings.productPrices));
  const [portions, setPortions] = useState<Record<string, string>>(toStr(settings.portions));
  const [share, setShare] = useState(settings.cardShare === null ? "" : String(Math.round(settings.cardShare * 100)));
  const [items, setItems] = useState(settings.itemsPerTxn === null ? "" : String(settings.itemsPerTxn));
  const [onions, setOnions] = useState<boolean>(settings.onionsEnabled ?? data.config.onionsEnabled);
  const [stockSet, setStockSet] = useState<Record<string, string>>({});
  const [delivery, setDelivery] = useState<Record<string, string>>({});

  const nums = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== "" && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]));

  async function saveAll() {
    const next: TillSettings = {
      ...settings,
      priceOverrides: nums(sell),
      productPrices: nums(shelf),
      portions: nums(portions),
      cardShare: share === "" ? null : Math.min(1, Math.max(0, Number(share) / 100)),
      itemsPerTxn: items === "" ? null : Math.max(1, Number(items)),
      onionsEnabled: onions === BASE.config.onionsEnabled ? null : onions,
    };
    await till.saveSettings(next);
    toast.success("Settings saved on this iPad");
  }

  async function applyStock(mode: "set" | "delivery") {
    const next: Qty = { ...onHand };
    if (mode === "set") {
      for (const [k, v] of Object.entries(nums(stockSet))) next[k] = v;
    } else {
      for (const [k, packs] of Object.entries(nums(delivery))) next[k] = (next[k] ?? 0) + packs * products[k].unitsPerPack;
    }
    await till.setStock(next, mode === "set" ? "Set by admin" : "Delivery added by admin");
    setStockSet({});
    setDelivery({});
    toast.success(mode === "set" ? "Stock on hand updated" : "Delivery added to stock");
  }

  const short = shortName;

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-3xl font-bold flex-1">Admin</h2>
        <button type="button" onClick={saveAll} className="h-14 px-6 rounded-2xl bg-amber-700 text-white text-xl font-bold flex items-center gap-2"><Save className="w-6 h-6" /> Save prices &amp; settings</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <section className="rounded-2xl bg-white shadow p-4">
          <h3 className="text-2xl font-bold">Sell prices</h3>
          <p className="text-stone-500 mb-2">Blank = calculated price (cost incl. card fee × {data.config.markup}, rounded up).</p>
          {rows.map((r) => <Field key={r.item} label={r.name} hint={`calculated $${(r.overridden ? Math.ceil(r.raw) : r.price).toFixed(0)} · cost $${r.cost.toFixed(2)}`} value={sell[r.item] ?? ""} onChange={(v) => setSell((s) => ({ ...s, [r.item]: v }))} />)}
          <h3 className="text-2xl font-bold mt-4">Card assumptions</h3>
          <Field label="Card share of sales (%)" hint={`file: ${Math.round(BASE.config.card.share * 100)}%`} value={share} onChange={setShare} />
          <Field label="Items per card sale" hint={`file: ${BASE.config.card.itemsPerTxn}`} value={items} onChange={setItems} />
          <label className="flex items-center gap-3 py-3 text-lg">
            <input type="checkbox" checked={onions} onChange={(e) => setOnions(e.target.checked)} className="w-7 h-7" />
            Serve onions (pre-cut only — untick if the store has none)
          </label>
        </section>

        <section className="rounded-2xl bg-white shadow p-4">
          <h3 className="text-2xl font-bold">Portions per serve</h3>
          <p className="text-stone-500 mb-2">{data.config.portionsNote}</p>
          {Object.entries(BASE.config.portions).map(([k, v]) => <Field key={k} label={k} hint={`file: ${v}`} value={portions[k] ?? ""} onChange={(x) => setPortions((p) => ({ ...p, [k]: x }))} />)}
        </section>
      </div>

      <section className="rounded-2xl bg-white shadow p-4">
        <h3 className="text-2xl font-bold">Shelf prices (what Woolworths charged)</h3>
        <p className="text-stone-500 mb-2">Blank = price in the data file. Changes flow into costing and the calculated sell prices.</p>
        <div className="grid grid-cols-2 gap-x-8">
          {data.products.map((p) => <Field key={p.id} label={short(p.name)} hint={`file $${BASE.products.find((b) => b.id === p.id)!.price.toFixed(2)} · ${p.packSize}`} value={shelf[p.id] ?? ""} onChange={(v) => setShelf((s) => ({ ...s, [p.id]: v }))} />)}
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow p-4">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h3 className="text-2xl font-bold flex-1">Stock on hand</h3>
          <button type="button" onClick={() => applyStock("delivery")} className="h-12 px-4 rounded-xl bg-emerald-700 text-white text-lg font-semibold flex items-center gap-2"><PackagePlus className="w-5 h-5" /> Add delivery (packs)</button>
          <button type="button" onClick={() => applyStock("set")} className="h-12 px-4 rounded-xl bg-stone-800 text-white text-lg font-semibold">Set on-hand (units)</button>
        </div>
        <p className="text-stone-500 mb-2">After a top-up shop, enter the <b>packs</b> bought and tap Add delivery. To correct a count, enter <b>units</b> and tap Set on-hand. Current baseline: {till.baseline.reason}.</p>
        <table className="w-full text-lg">
          <thead><tr className="text-left text-stone-500"><th>Product</th><th className="text-right">On hand</th><th className="text-right">Packs bought</th><th className="text-right">Set units</th></tr></thead>
          <tbody>
            {data.products.filter((p) => !p.notWoolworths).map((p) => (
              <tr key={p.id} className="border-t">
                <td className="py-1">{short(p.name)}</td>
                <td className={`text-right ${(onHand[p.id] ?? 0) < 0 ? "text-red-700 font-bold" : ""}`}>{Math.round((onHand[p.id] ?? 0) * 10) / 10} {p.unit}</td>
                <td className="text-right"><input inputMode="numeric" aria-label={`Packs of ${p.name} delivered`} value={delivery[p.id] ?? ""} onChange={(e) => setDelivery((d) => ({ ...d, [p.id]: e.target.value.replace(/\D/g, "") }))} className="w-20 h-11 rounded-lg border-2 border-stone-300 px-2 text-xl text-right" /></td>
                <td className="text-right"><input inputMode="decimal" aria-label={`Set ${p.name} units`} value={stockSet[p.id] ?? ""} onChange={(e) => setStockSet((d) => ({ ...d, [p.id]: e.target.value.replace(/[^\d.]/g, "") }))} className="w-24 h-11 rounded-lg border-2 border-stone-300 px-2 text-xl text-right" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
