import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2, X, Search, Trophy, ExternalLink, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminCompetitions, useCompetitionMutation } from "@/hooks/api";

interface Competition {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string;
  pilotRating: string;
  rulesSummary: string;
  registrationUrl: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const emptyForm = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  location: "",
  pilotRating: "",
  rulesSummary: "",
  registrationUrl: "",
  status: "upcoming",
};

export function AdminCompetitions() {
  const { data: competitions = [] } = useAdminCompetitions();
  const { save: saveMutation, remove: removeMutation } = useCompetitionMutation();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Competition | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const filtered = competitions.filter(c => {
    if (!search) return true;
    const term = search.toLowerCase();
    return c.name.toLowerCase().includes(term) ||
      (c.location || "").toLowerCase().includes(term) ||
      (c.status || "").toLowerCase().includes(term);
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
    setPreviewId(null);
  };

  const openEdit = (c: Competition) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      description: c.description || "",
      startDate: c.startDate || "",
      endDate: c.endDate || "",
      location: c.location || "",
      pilotRating: c.pilotRating || "",
      rulesSummary: c.rulesSummary || "",
      registrationUrl: c.registrationUrl || "",
      status: c.status || "upcoming",
    });
    setFormError("");
    setShowForm(true);
    setPreviewId(null);
  };

  const handleSave = async () => {
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Competition name is required");
      return;
    }
    setSaving(true);
    try {
      await saveMutation.mutateAsync({ id: editingId ?? undefined, data: form });
      setShowForm(false);
      setEditingId(null);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save competition");
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
      setDeleteError(e instanceof Error ? e.message : "Failed to delete competition");
    }
  };

  const formatDate = (d: string) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      upcoming: "bg-blue-100 text-blue-800",
      active: "bg-green-100 text-green-800",
      completed: "bg-gray-100 text-gray-600",
    };
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.upcoming}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const renderForm = () => (
    <div className="px-5 pb-5 pt-4 bg-sky-50/50 border-t border-sky-200/40 space-y-4">
      {formError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Competition Name *</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
            placeholder="e.g. Summer XC Series"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Location</label>
          <input
            type="text"
            value={form.location}
            onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
            placeholder="e.g. Bright, Victoria"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Start Date</label>
          <input
            type="date"
            value={form.startDate}
            onChange={e => setForm(prev => ({ ...prev, startDate: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">End Date</label>
          <input
            type="date"
            value={form.endDate}
            onChange={e => setForm(prev => ({ ...prev, endDate: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Status</label>
          <select
            value={form.status}
            onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
          >
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Pilot Rating Requirement</label>
          <input
            type="text"
            value={form.pilotRating}
            onChange={e => setForm(prev => ({ ...prev, pilotRating: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
            placeholder="e.g. PG3+ or All Levels"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground-label mb-1">Registration URL</label>
          <input
            type="url"
            value={form.registrationUrl}
            onChange={e => setForm(prev => ({ ...prev, registrationUrl: e.target.value }))}
            className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-white"
            placeholder="https://example.com/register"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground-label mb-1">Description</label>
        <textarea
          value={form.description}
          onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
          className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky font-mono text-sm bg-white"
          placeholder="Describe the competition..."
          rows={3}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground-label mb-1">Rules / Scoring Summary</label>
        <textarea
          value={form.rulesSummary}
          onChange={e => setForm(prev => ({ ...prev, rulesSummary: e.target.value }))}
          className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky font-mono text-sm bg-white"
          placeholder="e.g. GAP scoring, 3 valid tasks required..."
          rows={2}
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-sky hover:bg-sky-light text-white"
        >
          {saving ? "Saving..." : (editingId ? "Update Competition" : "Add Competition")}
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
                <Trophy className="w-8 h-8 text-sky" />
                XC Competitions
              </h1>
              <p className="text-muted-foreground">Manage cross-country competitions and events.</p>
            </div>
            <Button onClick={openAdd} className="bg-sky hover:bg-sky-light text-white">
              <Plus className="w-4 h-4 mr-2" /> Add Competition
            </Button>
          </div>
        </div>

        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-faint" />
            <input
              type="text"
              placeholder="Search competitions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
            />
          </div>
        </div>

        {showForm && !editingId && (
          <div className="mb-4 bg-card rounded-xl border-2 border-sky shadow-md">
            <div className="px-5 py-3 bg-sky-100/60 border-b border-sky-200/60 flex items-center justify-between">
              <h3 className="text-lg font-bold text-navy">Add Competition</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-sky-200/60 rounded-lg">
                <X className="w-4 h-4 text-foreground-faint" />
              </button>
            </div>
            {renderForm()}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {filtered.map(c => (
            <div key={c.id} className={`bg-card rounded-xl border ${showForm && editingId === c.id ? 'border-2 border-sky shadow-md' : 'border-sky-200/60 shadow-sm hover:shadow-md'} transition-shadow`}>
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-navy truncate">{c.name}</h3>
                      {statusBadge(c.status)}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-secondary mt-1">
                      {c.location && <span>{c.location}</span>}
                      <span>{formatDate(c.startDate)}{c.endDate ? ` — ${formatDate(c.endDate)}` : ""}</span>
                      {c.pilotRating && <span>Rating: {c.pilotRating}</span>}
                    </div>
                    {c.registrationUrl && !(showForm && editingId === c.id) && (
                      <a
                        href={c.registrationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-sky hover:text-navy font-medium mt-1"
                      >
                        Registration <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {!(showForm && editingId === c.id) && (
                  <>
                    <button
                      onClick={() => setPreviewId(previewId === c.id ? null : c.id)}
                      className="mt-2 text-xs text-sky hover:text-navy font-medium inline-flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" />
                      {previewId === c.id ? "Hide Details" : "Quick View"}
                      {previewId === c.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    {previewId === c.id && (
                      <div className="mt-3 p-4 bg-sky-50/50 border border-sky-100 rounded-lg space-y-2 text-sm">
                        {c.description && (
                          <div><span className="font-medium text-navy">Description:</span> <span className="text-foreground-secondary">{c.description}</span></div>
                        )}
                        {c.rulesSummary && (
                          <div><span className="font-medium text-navy">Rules/Scoring:</span> <span className="text-foreground-secondary">{c.rulesSummary}</span></div>
                        )}
                        {c.registrationUrl && (
                          <div>
                            <span className="font-medium text-navy">Registration:</span>{" "}
                            <a href={c.registrationUrl} target="_blank" rel="noopener noreferrer" className="text-sky hover:text-navy underline">
                              {c.registrationUrl}
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                        <Pencil className="w-4 h-4 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => { setDeleteTarget(c); setDeleteError(""); }}
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Delete
                      </Button>
                    </div>
                  </>
                )}
              </div>
              <div className={`h-1 bg-gradient-to-r from-sky via-sky-light to-sky opacity-60 ${!(showForm && editingId === c.id) ? 'rounded-b-xl' : ''}`} />
              {showForm && editingId === c.id && renderForm()}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-2 text-center py-12 text-muted-foreground">
              {search ? "No competitions match your search." : (
                <div>
                  <Trophy className="w-12 h-12 mx-auto mb-3 text-sky/40" />
                  <p className="text-lg">No competitions yet.</p>
                  <p className="text-sm mt-1">Click "Add Competition" to get started.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-navy mb-3">Delete Competition</h3>
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
