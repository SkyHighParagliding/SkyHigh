import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2, X, Search, Handshake, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownHelpLink } from "@/components/MarkdownHelpLink";
import { useAdminSponsors, useSponsorMutation } from "@/hooks/api";
import { useAdminList } from "@/hooks/useAdminList";

interface Sponsor {
  id: string;
  name: string;
  logo: string;
  url: string;
  markdown: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const emptyForm = {
  name: "",
  logo: "",
  url: "",
  markdown: "",
};

export function AdminSponsors() {
  const { data: sponsors = [] } = useAdminSponsors();
  const { save: saveMutation, remove: removeMutation } = useSponsorMutation();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const {
    search, setSearch, filtered,
    deleteTarget, deleteError, deleting,
    confirmDelete, openDelete, setDeleteTarget,
  } = useAdminList<Sponsor>({
    items: sponsors,
    filterFn: (s, term) => s.name.toLowerCase().includes(term) || (s.url || "").toLowerCase().includes(term),
    deleteFn: async (s) => { await removeMutation.mutateAsync(s.id); },
    deleteLabel: "Sponsor",
  });

  const { hash } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (hash && hash.startsWith("#spon-") && sponsors.length > 0) {
      const id = hash.replace("#spon-", "");
      const sponsor = sponsors.find(s => s.id === id);
      if (sponsor) {
        openEdit(sponsor);
      }
    }
  }, [hash, sponsors]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const openEdit = (s: Sponsor) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      logo: s.logo || "",
      url: s.url || "",
      markdown: s.markdown || "",
    });
    setFormError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Sponsor name is required");
      return;
    }
    setSaving(true);
    try {
      await saveMutation.mutateAsync({ id: editingId ?? undefined, data: form });
      setShowModal(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save sponsor");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = confirmDelete;

  const renderInlineForm = () => (
    <div className="px-5 pb-5 pt-4 bg-amber-50/50 border-t border-amber-200/40 space-y-4">
      {formError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Sponsor Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-amber-500 focus:border-amber-500 bg-white"
            placeholder="e.g. Acme Paragliding"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Website URL</label>
          <input
            type="url"
            value={form.url}
            onChange={e => setForm(prev => ({ ...prev, url: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-amber-500 focus:border-amber-500 bg-white"
            placeholder="https://example.com"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground-label mb-1">Logo URL</label>
        <div className="flex items-center gap-3">
          <input
            type="url"
            value={form.logo}
            onChange={e => setForm(prev => ({ ...prev, logo: e.target.value }))}
            className="flex-1 p-2 border border-border rounded-md focus:ring-1 focus:ring-amber-500 focus:border-amber-500 bg-white"
            placeholder="https://example.com/logo.png"
          />
          {form.logo && (
            <div className="shrink-0 p-1.5 border rounded-md bg-white">
              <img src={form.logo} alt="Logo preview" className="h-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground-label mb-1">Description (Markdown)</label>
        <textarea
          value={form.markdown}
          onChange={e => setForm(prev => ({ ...prev, markdown: e.target.value }))}
          className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-amber-500 focus:border-amber-500 font-mono text-sm bg-white"
          placeholder="Optional markdown description..."
          rows={4}
        />
        <MarkdownHelpLink compact />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          {saving ? "Saving..." : (editingId ? "Update Sponsor" : "Add Sponsor")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-navy transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-navy mb-2 flex items-center gap-3">
                <Handshake className="w-8 h-8 text-amber-600" />
                Sponsors
              </h1>
              <p className="text-muted-foreground">Manage sponsors displayed on the Sponsors page and home card.</p>
            </div>
            <Button onClick={openAdd} className="bg-amber-600 hover:bg-amber-700 text-white">
              <Plus className="w-4 h-4 mr-2" /> Add Sponsor
            </Button>
          </div>
        </div>

        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-faint" />
            <input
              type="text"
              placeholder="Search sponsors..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
            />
          </div>
        </div>

        {showModal && !editingId && (
          <div className="mb-4 bg-card rounded-xl border-2 border-amber-400 shadow-md">
            <div className="px-5 py-3 bg-amber-100/60 border-b border-amber-200/60 flex items-center justify-between">
              <h3 className="text-lg font-bold text-navy">Add Sponsor</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-amber-200/60 rounded-lg">
                <X className="w-4 h-4 text-foreground-faint" />
              </button>
            </div>
            {renderInlineForm()}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {filtered.map(s => (
            <div key={s.id} className={`bg-card rounded-xl border ${showModal && editingId === s.id ? 'border-2 border-amber-400 shadow-md' : 'border-amber-200/60 shadow-sm hover:shadow-md'} transition-shadow`}>
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {s.logo && s.logo.trim() ? (
                    <div className="shrink-0 w-14 h-14 rounded-lg bg-white border border-amber-100 shadow-sm flex items-center justify-center overflow-hidden">
                      <img src={s.logo} alt={`${s.name} logo`} className="w-full h-full object-contain p-1.5" loading="lazy" />
                    </div>
                  ) : (
                    <div className="shrink-0 w-14 h-14 rounded-lg bg-gradient-to-br from-amber-100 to-amber-200 border border-amber-200 shadow-sm flex items-center justify-center">
                      <span className="text-xl font-extrabold text-amber-700/70">
                        {s.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-navy truncate">{s.name}</h3>
                    {s.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium mt-0.5"
                      >
                        {s.url.replace(/^https?:\/\//, '').replace(/\/$/, '')} <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
                {s.markdown && !(showModal && editingId === s.id) && (
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{s.markdown.substring(0, 120)}{s.markdown.length > 120 ? '...' : ''}</p>
                )}
                {!(showModal && editingId === s.id) && (
                  <div className="mt-3 flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                      <Pencil className="w-4 h-4 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => openDelete(s)}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  </div>
                )}
              </div>
              <div className={`h-1 bg-gradient-to-r from-amber-300 via-amber-400 to-amber-300 opacity-60 ${!(showModal && editingId === s.id) ? 'rounded-b-xl' : ''}`} />
              {showModal && editingId === s.id && renderInlineForm()}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-2 text-center py-12 text-muted-foreground">
              {search ? "No sponsors match your search." : (
                <div>
                  <Handshake className="w-12 h-12 mx-auto mb-3 text-amber-300" />
                  <p className="text-lg">No sponsors yet.</p>
                  <p className="text-sm mt-1">Click "Add Sponsor" to get started.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-navy mb-3">Delete Sponsor</h3>
            <p className="text-foreground-secondary mb-4">
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This action cannot be undone.
            </p>
            {deleteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{deleteError}</div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
