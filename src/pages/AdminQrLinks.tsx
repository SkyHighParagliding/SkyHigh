import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Plus, Trash2, X, QrCode, Download, ExternalLink, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminQrLinks, useQrLinkMutation } from "@/hooks/api";
import type { QrLink } from "@/hooks/api/useAdminCrud";

/**
 * Admin → QR Links (TASK-043). Each link has a fixed printed address
 * (/go/<name>) and a destination that can be changed at any time, so banners
 * and posters never need reprinting. Off links send scanners to the home page.
 */

// Printed QR codes must carry the live address, even when made on a dev copy.
const PUBLIC_BASE = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
  ? "https://skyhighparagliding.org.au"
  : window.location.origin;

const goUrl = (slug: string) => `${PUBLIC_BASE}/go/${slug}`;

const inputClass = "w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky-500 focus:border-sky-500 bg-white";

function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function downloadSvg(slug: string, svg: SVGSVGElement | null) {
  if (!svg) return;
  download(`qr-${slug}.svg`, new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
}

/** 2000 px PNG from the on-screen SVG — big enough for any print. */
function downloadPng(slug: string, svg: SVGSVGElement | null) {
  if (!svg) return;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 2000;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, 2000, 2000);
    c.toBlob((b) => b && download(`qr-${slug}.png`, b), "image/png");
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svg));
}

function LinkCard({ link }: { link: QrLink }) {
  const { save, remove } = useQrLinkMutation();
  const [form, setForm] = useState({ title: link.title, destination: link.destination, enabled: link.enabled, note: link.note });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => setForm({ title: link.title, destination: link.destination, enabled: link.enabled, note: link.note }), [link]);
  const dirty = form.title !== link.title || form.destination !== link.destination || form.enabled !== link.enabled || form.note !== link.note;

  return (
    <div className="bg-card rounded-xl border border-sky-200/60 shadow-sm p-5">
      <div className="flex flex-col sm:flex-row gap-5">
        <div className="shrink-0 flex flex-col items-center gap-2">
          <div className={`p-2 bg-white border rounded-lg ${form.enabled ? "" : "opacity-40"}`}>
            <QRCodeSVG ref={svgRef} value={goUrl(link.slug)} size={140} level="M" marginSize={2} />
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => downloadSvg(link.slug, svgRef.current)}><Download className="w-3.5 h-3.5 mr-1" />SVG</Button>
            <Button variant="outline" size="sm" onClick={() => downloadPng(link.slug, svgRef.current)}><Download className="w-3.5 h-3.5 mr-1" />PNG</Button>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <label className="block text-sm font-medium text-foreground-label mb-1">Title</label>
            <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="text-sm">
            <span className="text-foreground-label font-medium">Printed address (fixed): </span>
            <a href={`/go/${link.slug}`} target="_blank" rel="noopener noreferrer" className="font-mono text-sky-700 hover:underline inline-flex items-center gap-1">
              {goUrl(link.slug).replace(/^https?:\/\//, "")} <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-label mb-1">Sends people to</label>
            <input className={`${inputClass} font-mono text-sm`} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="/sites/mystic or https://…" />
            <p className="text-xs text-muted-foreground mt-1">A page on this site starting with / (e.g. <code>/sites/mystic</code>, <code>/</code> for the home page) or a full https:// address.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground-label mb-1">Note</label>
            <input className={inputClass} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Where it's printed, what it's for" />
          </div>
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="w-4 h-4 accent-sky-600" />
              {form.enabled ? "On" : "Off — scans go to the home page"}
            </label>
            <span className="text-xs text-muted-foreground">
              {link.scans} scan{link.scans === 1 ? "" : "s"}{link.lastScanAt ? `, last ${new Date(link.lastScanAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}` : ""}
            </span>
          </div>
          <div className="flex gap-2 justify-end">
            {confirmDelete ? (
              <>
                <span className="text-sm text-red-700 self-center">Delete? Printed copies will go to the home page.</span>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => remove.mutate(link.slug)}>Delete</Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="w-4 h-4 mr-1" /> Delete
                </Button>
                <Button size="sm" disabled={!dirty || save.isPending} className="bg-sky-600 hover:bg-sky-700 text-white" onClick={() => save.mutate({ id: link.slug, data: form })}>
                  <Save className="w-4 h-4 mr-1" /> {save.isPending ? "Saving..." : "Save"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const emptyForm = { slug: "", title: "", destination: "/", note: "" };

export function AdminQrLinks() {
  const { data: links = [], isLoading } = useAdminQrLinks();
  const { save } = useQrLinkMutation();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const add = async () => {
    setError("");
    try {
      await save.mutateAsync({ data: { ...form, enabled: true } });
      setAdding(false);
      setForm(emptyForm);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add QR link");
    }
  };

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/admin" className="inline-flex items-center text-accent hover:text-ink transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold text-ink mb-2 flex items-center gap-3">
                <QrCode className="w-8 h-8 text-sky-600" />
                QR Links
              </h1>
              <p className="text-muted-foreground">
                QR codes for banners, posters and projects. The printed address never changes; change where it sends people here, any time, no reprint.
                Flying-site QR codes (check-in, site info, XC Maps) are set on each site's edit page.
              </p>
            </div>
            <Button onClick={() => { setAdding(true); setError(""); }} className="bg-sky-600 hover:bg-sky-700 text-white shrink-0">
              <Plus className="w-4 h-4 mr-2" /> Add QR link
            </Button>
          </div>
        </div>

        {adding && (
          <div className="mb-6 bg-card rounded-xl border-2 border-sky-400 shadow-md">
            <div className="px-5 py-3 bg-sky-100/60 border-b border-sky-200/60 flex items-center justify-between">
              <h3 className="text-lg font-bold text-ink">Add QR link</h3>
              <button onClick={() => setAdding(false)} className="p-1.5 hover:bg-sky-200/60 rounded-lg"><X className="w-4 h-4 text-foreground-faint" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">Link name (goes in the printed address)</label>
                  <input className={`${inputClass} font-mono`} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder="voyager-poster" />
                  <p className="text-xs text-muted-foreground mt-1">{goUrl(form.slug || "…").replace(/^https?:\/\//, "")} — can't be changed later.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">Title</label>
                  <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Voyager project poster" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground-label mb-1">Sends people to</label>
                <input className={`${inputClass} font-mono text-sm`} value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="/ or /sites/mystic or https://…" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground-label mb-1">Note</label>
                <input className={inputClass} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
                <Button onClick={add} disabled={save.isPending} className="bg-sky-600 hover:bg-sky-700 text-white">{save.isPending ? "Adding..." : "Add QR link"}</Button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {links.map((l) => <LinkCard key={l.slug} link={l} />)}
          {!isLoading && links.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <QrCode className="w-12 h-12 mx-auto mb-3 text-sky-300" />
              <p className="text-lg">No QR links yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
