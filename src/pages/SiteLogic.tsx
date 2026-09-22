import { useState, useEffect, useCallback } from "react";
import { Printer, Download, Pencil, Save, X, Loader2 } from "lucide-react";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { api } from "@/lib/apiClient";
import { useAuth } from "@/contexts/AuthContext";

// The content's single source of truth is the repo file docs/site-logic.md plus
// the instance catalogue under docs/site-logic/. This page reads them from the
// server so they can be browsed remotely. The overview doc (docs/site-logic.md)
// is editable when running locally (Save writes the file); catalogue files are
// read-only here. See AGENTS.md and wiki/smart-search-weather-philosophy.md.

// "04-map-rendering.md" -> "Map rendering"; "README.md" -> "Index".
function fileLabel(name: string): string {
  if (name.toLowerCase() === "readme.md") return "Index";
  return name
    .replace(/\.md$/i, "")
    .replace(/^\d+[-_]?/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SiteLogic() {
  const { token } = useAuth();
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null); // null = overview doc
  const [markdown, setMarkdown] = useState("");
  const [draft, setDraft] = useState("");
  const [overviewEditable, setOverviewEditable] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catalogue file list (once).
  useEffect(() => {
    api.get<{ files: string[] }>("/api/settings/site-logic/catalogue")
      .then((r) => setFiles(r.files ?? []))
      .catch(() => setFiles([]));
  }, []);

  const load = useCallback(async (sel: string | null) => {
    setLoading(true);
    setError(null);
    setEditing(false);
    try {
      if (sel === null) {
        const res = await api.get<{ markdown: string; editable: boolean }>("/api/settings/site-logic");
        setMarkdown(res.markdown ?? "");
        setOverviewEditable(!!res.editable);
      } else {
        const res = await api.get<{ markdown: string }>(`/api/settings/site-logic/catalogue/${encodeURIComponent(sel)}`);
        setMarkdown(res.markdown ?? "");
      }
    } catch {
      setError("Could not load the document.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(selected); }, [load, selected]);

  const startEdit = () => { setDraft(markdown); setEditing(true); setError(null); };
  const cancel = () => { setEditing(false); setError(null); };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put("/api/settings/site-logic", { markdown: draft }, token);
      setMarkdown(draft);
      setEditing(false);
    } catch {
      setError("Save failed — your changes were not written to docs/site-logic.md.");
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selected ?? "site-logic.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const canEditThis = selected === null && overviewEditable;
  const btn = "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors";
  const navItem = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${active ? "bg-ink text-white" : "bg-background text-ink hover:bg-ink/5 border border-border-faint"}`;

  return (
    <div className="bg-card min-h-screen">
      <style>{`
        @media print {
          nav, footer, .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto px-6 py-10 print:py-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-ink/10 text-ink rounded-full text-xs font-bold uppercase tracking-widest mb-3">
              Site Logic — Admin Reference
            </div>
            <p className="text-sm text-muted-foreground max-w-xl">
              How the site makes decisions — the principles (Overview) and the full catalogue of concrete rules
              documented from the codebase. Source of truth: <code>docs/site-logic.md</code> and <code>docs/site-logic/</code>.
              The Overview is editable when running locally (Save writes the file); the catalogue files are read-only here.
            </p>
          </div>

          {!editing && (
            <div className="no-print flex flex-shrink-0 flex-wrap gap-2 justify-end">
              <button onClick={download} className={`${btn} bg-background text-ink hover:bg-ink/5 border border-border-faint`}>
                <Download className="w-4 h-4" /> Download .md
              </button>
              <button onClick={() => window.print()} className={`${btn} bg-background text-ink hover:bg-ink/5 border border-border-faint`}>
                <Printer className="w-4 h-4" /> Print
              </button>
              {canEditThis && (
                <button onClick={startEdit} disabled={loading} className={`${btn} bg-ink text-white hover:bg-ink-muted disabled:opacity-60`}>
                  <Pencil className="w-4 h-4" /> Edit
                </button>
              )}
            </div>
          )}
        </div>

        {/* Navigation: Overview + each catalogue file */}
        {!editing && (
          <div className="no-print flex flex-wrap gap-2 mb-5">
            <button onClick={() => setSelected(null)} className={navItem(selected === null)}>Overview</button>
            {files.map((f) => (
              <button key={f} onClick={() => setSelected(f)} className={navItem(selected === f)}>
                {fileLabel(f)}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 no-print">
            {error}
          </div>
        )}

        <div className="border-t border-border-faint mb-6" />

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-10">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : editing ? (
          <div className="no-print">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="w-full h-[65vh] font-mono text-[13px] leading-relaxed rounded-lg border border-border-faint bg-background p-4 text-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Markdown. Saving writes to <code>docs/site-logic.md</code> in your local repo — commit it afterwards.
            </p>
            <div className="flex gap-2 mt-4">
              <button onClick={save} disabled={saving} className={`${btn} bg-ink text-white hover:bg-ink-muted disabled:opacity-60`}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Saving…" : "Save to file"}
              </button>
              <button onClick={cancel} disabled={saving} className={`${btn} bg-background text-ink hover:bg-ink/5 border border-border-faint`}>
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none text-foreground/90 prose-headings:text-ink prose-strong:text-ink prose-a:text-accent">
            <MarkdownRenderer>{markdown}</MarkdownRenderer>
          </div>
        )}
      </div>
    </div>
  );
}
