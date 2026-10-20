import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CloudUpload, ExternalLink, Eye, Loader2 } from "lucide-react";
import { allDocs, page } from "../../../shared/sizzle/templates.ts";
import { eventReportBody } from "../../../shared/sizzle/reportTemplate.ts";
import { useAuth } from "@/contexts/AuthContext";
import { openPrintView } from "./printView";
import { driveErrorText, driveStatus, saveDocToDrive, type DriveFolder, type DriveSaved, type DriveStatus } from "./driveSave";
import type { Till } from "./useTill";

interface DocRow { key: string; title: string; html: string; landscape: boolean; folder: DriveFolder }

/**
 * Docs tab (TASK-039): every printed document for this event, built from the
 * till's current figures (customer estimates, prices, stock plan). View/Print
 * works anywhere; Save to Drive files a PDF in the club Google Drive.
 */
export function DocsScreen({ till }: { till: Till }) {
  const { token } = useAuth();
  const { data, plan } = till;
  const [status, setStatus] = useState<DriveStatus | null | "offline">(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, DriveSaved>>({});

  useEffect(() => {
    driveStatus(token).then(setStatus, () => setStatus("offline"));
  }, [token]);

  const docs: DocRow[] = useMemo(() => {
    const at = new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne" });
    const planning = allDocs(data, plan).map((d) => ({ key: d.file, title: d.title, html: d.html, landscape: d.orientation === "landscape", folder: "planning" as const }));
    const report = { key: "treasurer-report", title: `Treasurer's report ${data.event.title}`, html: page(`Treasurer's report ${data.event.title}`, "portrait", eventReportBody(data, till.report, till.lessons, at)), landscape: false, folder: "money" as const };
    return [...planning, report];
  }, [data, plan, till.report, till.lessons]);

  const canSave = typeof status === "object" && status !== null && status.drive && status.pdf;

  async function save(d: DocRow) {
    setBusy((b) => ({ ...b, [d.key]: true }));
    try {
      const s = await saveDocToDrive(token, { html: d.html, docTitle: d.title, folder: d.folder, landscape: d.landscape });
      setSaved((x) => ({ ...x, [d.key]: s }));
      return true;
    } catch (err) {
      toast.error(`${d.title}: ${driveErrorText(err)}`);
      return false;
    } finally {
      setBusy((b) => ({ ...b, [d.key]: false }));
    }
  }

  async function saveAllPlanning() {
    let n = 0;
    for (const d of docs.filter((x) => x.folder === "planning")) if (await save(d)) n++;
    toast.success(`${n} planning documents saved to Drive`);
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-3xl font-bold flex-1">Documents — {data.event.title}</h2>
        <button type="button" disabled={!canSave} onClick={saveAllPlanning} className="h-14 px-5 rounded-xl bg-amber-700 text-white text-lg font-semibold flex items-center gap-2 disabled:opacity-40"><CloudUpload className="w-6 h-6" /> Save all planning docs to Drive</button>
      </div>
      <p className="text-stone-600 text-lg">
        Built from the till's current numbers (customers per day, prices, stock plan), so they always match what's in the Admin tab. <b>View / Print</b> works anywhere; <b>Save to Drive</b> files a PDF in the club Google Drive — shopping lists and checklists in <i>08_Projects</i>, money records in <i>03_Financial Records</i>, each in a "Sizzle {data.event.title}" folder with the date and time in the name.
      </p>
      {status === null && <p className="text-stone-500 flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Checking Google Drive…</p>}
      {status === "offline" && <p className="rounded-xl bg-amber-100 p-3 text-lg">No signal — saving to Drive needs the website. View / Print still works.</p>}
      {typeof status === "object" && status && !status.drive && <p className="rounded-xl bg-amber-100 p-3 text-lg">Google Drive isn't connected to the website (Admin → Connections). View / Print still works.</p>}
      {typeof status === "object" && status && status.drive && !status.pdf && <p className="rounded-xl bg-amber-100 p-3 text-lg">The website can't make PDFs yet, so Save to Drive is off. Use View / Print, then Share → Save to Files or Google Drive on the iPad.</p>}

      <section className="rounded-2xl bg-white shadow divide-y">
        {docs.map((d) => (
          <div key={d.key} className="flex flex-wrap items-center gap-3 p-3">
            <span className="flex-1 min-w-0 text-lg font-semibold">{d.title}<span className="block text-sm font-normal text-stone-500">{d.folder === "money" ? "Money record" : "Planning"} · {d.landscape ? "landscape" : "portrait"}</span></span>
            {saved[d.key] && <a href={saved[d.key].url} target="_blank" rel="noreferrer" className="text-emerald-700 font-semibold flex items-center gap-1">Saved <ExternalLink className="w-4 h-4" /></a>}
            <button type="button" onClick={() => openPrintView(d.html, `Sizzle ${d.title}`)} className="h-12 px-4 rounded-xl border-2 border-stone-800 text-lg font-semibold flex items-center gap-2"><Eye className="w-5 h-5" /> View / Print</button>
            <button type="button" disabled={!canSave || busy[d.key]} onClick={() => save(d)} className="h-12 px-4 rounded-xl bg-stone-800 text-white text-lg font-semibold flex items-center gap-2 disabled:opacity-40">
              {busy[d.key] ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudUpload className="w-5 h-5" />} Save to Drive
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
