import { useRef, useState } from "react";
import { toast } from "sonner";
import { CloudDownload, Download, RefreshCw, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/apiClient";
import { download, exportBackup, importBackup, importServerExport, salesCsv, stockCsv, type Backup } from "@/lib/sizzleStore";
import type { Till } from "./useTill";

export function DataScreen({ till }: { till: Till }) {
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const unsynced = till.sales.filter((s) => !s.synced).length;

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast.error(`${label} failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      setBusy(false);
    }
  }

  const btn = "h-16 px-6 rounded-2xl text-xl font-semibold flex items-center gap-2 disabled:opacity-40";

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <h2 className="text-3xl font-bold">Data &amp; backup</h2>

      <section className="rounded-2xl bg-white shadow p-4 space-y-3">
        <h3 className="text-2xl font-bold">Server backup</h3>
        <p className="text-lg">
          Every sale is saved on this iPad first. When there's signal it's copied to the club website.
          {" "}<b>{unsynced === 0 ? "All sales are backed up." : `${unsynced} sale(s) waiting to upload.`}</b>
          {till.sync.error && <span className="block text-red-700">Last attempt: {till.sync.error}{/401|session|auth/i.test(till.sync.error) ? " — log in again to resume uploads (sales stay safe here)." : ""}</span>}
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => run("Sync", async () => { const r = await till.runSync(); toast[r.ok ? "success" : "error"](r.ok ? `Synced — ${r.pending} pending` : `Not synced: ${r.error}`); })} className={`${btn} bg-stone-800 text-white`}><RefreshCw className="w-6 h-6" /> Sync now</button>
          <button type="button" disabled={busy} onClick={() => run("Restore", async () => {
            const x = await api.get<{ sales: never[]; snapshots: never[] }>("/api/sizzle/export", token);
            const r = await importServerExport(x);
            await till.reload();
            toast.success(`Restored ${r.sales} sales and ${r.snapshots} records from the server`);
          })} className={`${btn} bg-white border-2 border-stone-800`}><CloudDownload className="w-6 h-6" /> Restore from server</button>
        </div>
        <p className="text-stone-500">Restore merges the server copy into this iPad (use it on a replacement iPad). Nothing is deleted.</p>
      </section>

      <section className="rounded-2xl bg-white shadow p-4 space-y-3">
        <h3 className="text-2xl font-bold">Export</h3>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy} onClick={() => run("Export", async () => download(`sizzle-backup-${stamp()}.json`, JSON.stringify(await exportBackup(), null, 2), "application/json"))} className={`${btn} bg-amber-700 text-white`}><Download className="w-6 h-6" /> Full backup (JSON)</button>
          <button type="button" disabled={busy} onClick={() => download(`sizzle-transactions-${stamp()}.csv`, salesCsv(till.sales), "text/csv")} className={`${btn} bg-white border-2 border-amber-700`}><Download className="w-6 h-6" /> Transactions (CSV)</button>
          <button type="button" disabled={busy} onClick={() => download(`sizzle-stock-${stamp()}.csv`, stockCsv(till.data.products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, onHand: till.onHand[p.id] ?? 0, packs: (till.onHand[p.id] ?? 0) / p.unitsPerPack }))), "text/csv")} className={`${btn} bg-white border-2 border-amber-700`}><Download className="w-6 h-6" /> Stock (CSV)</button>
        </div>
        <p className="text-stone-500">The CSV has one row per item per sale, with the payment method (cash/card) and whether it was voided.</p>
      </section>

      <section className="rounded-2xl bg-white shadow p-4 space-y-3">
        <h3 className="text-2xl font-bold">Import</h3>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          run("Import", async () => {
            const r = await importBackup(JSON.parse(await f.text()) as Backup);
            await till.reload();
            toast.success(`Imported ${r.sales} sales and ${r.snapshots} records`);
          });
        }} />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={`${btn} bg-white border-2 border-stone-800`}><Upload className="w-6 h-6" /> Import a JSON backup</button>
        <p className="text-stone-500">Merges a backup file made with "Full backup" into this iPad. Sales with the same id are replaced by the file's copy.</p>
      </section>

      <p className="text-stone-400">Device id {till.deviceId} · {till.sales.length} sales stored on this iPad</p>
    </div>
  );
}
