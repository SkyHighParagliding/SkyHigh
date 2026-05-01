import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2, X, Search, Store, Phone, Mail, Globe, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminBusinessDirectory, useBusinessDirectoryMutation } from "@/hooks/api";

interface BusinessListing {
  id: string;
  businessName: string;
  memberName: string;
  category: string;
  description: string;
  phone: string;
  email: string;
  websiteUrl: string;
  imagePath: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_CATEGORIES = ["Medical", "Trades", "Aviation", "Professional Services", "Other"];

const emptyForm = {
  businessName: "",
  memberName: "",
  category: "Other",
  description: "",
  phone: "",
  email: "",
  websiteUrl: "",
  imagePath: "",
};

export function AdminBusinessDirectory() {
  const { data: listings = [] } = useAdminBusinessDirectory();
  const { save: saveMutation, remove: removeMutation } = useBusinessDirectoryMutation();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BusinessListing | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [flyoutOpen, setFlyoutOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const allCategories = Array.from(new Set([
    ...DEFAULT_CATEGORIES,
    ...listings.map(l => l.category).filter(Boolean),
  ])).sort();

  const filtered = listings.filter(s => {
    if (!search) return true;
    const term = search.toLowerCase();
    return s.businessName.toLowerCase().includes(term) ||
      s.memberName.toLowerCase().includes(term) ||
      s.category.toLowerCase().includes(term);
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setFlyoutOpen(true);
  };

  const openEdit = (l: BusinessListing) => {
    setEditingId(l.id);
    setForm({
      businessName: l.businessName,
      memberName: l.memberName || "",
      category: l.category || "Other",
      description: l.description || "",
      phone: l.phone || "",
      email: l.email || "",
      websiteUrl: l.websiteUrl || "",
      imagePath: l.imagePath || "",
    });
    setFormError("");
    setFlyoutOpen(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
  };

  const closeFlyout = () => {
    setFlyoutOpen(false);
    setForm(emptyForm);
    setFormError("");
  };

  const handleSave = async () => {
    setFormError("");
    if (!form.businessName.trim()) {
      setFormError("Business name is required");
      return;
    }
    setSaving(true);
    try {
      await saveMutation.mutateAsync({ id: editingId ?? undefined, data: form });
      if (editingId) {
        cancelEdit();
      } else {
        closeFlyout();
      }
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save listing");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError("");
    try {
      await removeMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete listing");
    }
  };

  const renderFormFields = () => (
    <div className="space-y-4">
      {formError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Business Name *</label>
          <input
            type="text"
            value={form.businessName}
            onChange={e => setForm(prev => ({ ...prev, businessName: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
            placeholder="e.g. Smith Aviation Services"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Member Name</label>
          <input
            type="text"
            value={form.memberName}
            onChange={e => setForm(prev => ({ ...prev, memberName: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
            placeholder="e.g. John Smith"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Category</label>
          <select
            value={form.category}
            onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
          >
            {allCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
            placeholder="e.g. 0400 123 456"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
            placeholder="e.g. john@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Website URL</label>
          <input
            type="url"
            value={form.websiteUrl}
            onChange={e => setForm(prev => ({ ...prev, websiteUrl: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
            placeholder="https://example.com"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground-label mb-1">Logo / Image URL</label>
        <div className="flex items-center gap-3">
          <input
            type="url"
            value={form.imagePath}
            onChange={e => setForm(prev => ({ ...prev, imagePath: e.target.value }))}
            className="flex-1 p-2 border border-border rounded-md focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
            placeholder="https://example.com/logo.png"
          />
          {form.imagePath && (
            <div className="shrink-0 p-1.5 border rounded-md bg-white">
              <img src={form.imagePath} alt="Preview" className="h-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground-label mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
          className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 bg-white text-sm"
          placeholder="Brief description of the business..."
          rows={3}
        />
      </div>
    </div>
  );

  return (
    <div className={`bg-background min-h-screen py-12 ${flyoutOpen ? 'pb-[420px]' : ''}`}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-navy transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-navy mb-2 flex items-center gap-3">
                <Store className="w-8 h-8 text-emerald-600" />
                Business Directory
              </h1>
              <p className="text-muted-foreground">Manage member business listings displayed in the public directory.</p>
            </div>
            <Button onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="w-4 h-4 mr-2" /> Add Listing
            </Button>
          </div>
        </div>

        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-faint" />
            <input
              type="text"
              placeholder="Search listings..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {filtered.map(l => (
            <div key={l.id} className={`bg-card rounded-xl border ${editingId === l.id ? 'border-2 border-emerald-400 shadow-md' : 'border-emerald-200/60 shadow-sm hover:shadow-md'} transition-shadow`}>
              <div className="p-5">
                <div className="flex items-start gap-4">
                  {l.imagePath && l.imagePath.trim() ? (
                    <div className="shrink-0 w-14 h-14 rounded-lg bg-white border border-emerald-100 shadow-sm flex items-center justify-center overflow-hidden">
                      <img src={l.imagePath} alt={`${l.businessName} logo`} className="w-full h-full object-contain p-1.5" loading="lazy" />
                    </div>
                  ) : (
                    <div className="shrink-0 w-14 h-14 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-200 border border-emerald-200 shadow-sm flex items-center justify-center">
                      <span className="text-xl font-extrabold text-emerald-700/70">
                        {l.businessName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-navy truncate">{l.businessName}</h3>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                        {l.category}
                      </span>
                    </div>
                    {l.memberName && (
                      <p className="text-sm text-muted-foreground mt-0.5">{l.memberName}</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-1">
                      {l.phone && (
                        <span className="inline-flex items-center gap-1 text-xs text-foreground-secondary">
                          <Phone className="w-3 h-3" /> {l.phone}
                        </span>
                      )}
                      {l.email && (
                        <span className="inline-flex items-center gap-1 text-xs text-foreground-secondary">
                          <Mail className="w-3 h-3" /> {l.email}
                        </span>
                      )}
                      {l.websiteUrl && (
                        <a
                          href={l.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                        >
                          <Globe className="w-3 h-3" /> {l.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                {l.description && editingId !== l.id && (
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{l.description.substring(0, 150)}{l.description.length > 150 ? '...' : ''}</p>
                )}
                {editingId !== l.id && (
                  <div className="mt-3 flex gap-2 justify-end">
                    <Button variant="outline" size="sm" onClick={() => openEdit(l)}>
                      <Pencil className="w-4 h-4 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => { setDeleteTarget(l); setDeleteError(""); }}
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  </div>
                )}
              </div>
              <div className={`h-1 bg-gradient-to-r from-emerald-300 via-emerald-400 to-emerald-300 opacity-60 ${editingId !== l.id ? 'rounded-b-xl' : ''}`} />
              {editingId === l.id && (
                <div className="px-5 pb-5 pt-4 bg-emerald-50/50 border-t border-emerald-200/40">
                  {renderFormFields()}
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
                    <Button
                      onClick={handleSave}
                      disabled={saving}
                      className={`text-white transition-all ${saving ? 'bg-emerald-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    >
                      {saving ? "Saving..." : "Update Listing"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-2 text-center py-12 text-muted-foreground">
              {search ? "No listings match your search." : (
                <div>
                  <Store className="w-12 h-12 mx-auto mb-3 text-emerald-300" />
                  <p className="text-lg">No business listings yet.</p>
                  <p className="text-sm mt-1">Click "Add Listing" to get started.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {flyoutOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t-2 border-emerald-400 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transform transition-transform duration-300 ease-out">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="py-3 flex items-center justify-between border-b border-emerald-200/40">
              <h3 className="text-lg font-bold text-navy flex items-center gap-2">
                <ChevronUp className="w-4 h-4 text-emerald-500" />
                Add Business Listing
              </h3>
              <button onClick={closeFlyout} className="p-1.5 hover:bg-emerald-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-foreground-faint" />
              </button>
            </div>
            <div className="py-4 max-h-[60vh] overflow-y-auto">
              {renderFormFields()}
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={closeFlyout}>Cancel</Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className={`text-white transition-all ${saving ? 'bg-emerald-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {saving ? "Saving..." : "Add Listing"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-navy mb-3">Delete Listing</h3>
            <p className="text-foreground-secondary mb-4">
              Are you sure you want to delete <strong>{deleteTarget.businessName}</strong>? This action cannot be undone.
            </p>
            {deleteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{deleteError}</div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
