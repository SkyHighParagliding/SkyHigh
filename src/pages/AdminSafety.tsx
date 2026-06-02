import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Plus, Trash2, GripVertical, Eye, EyeOff, ChevronUp, ChevronDown, Check, ExternalLink } from "lucide-react";
import { MarkdownHelpLink } from "@/components/MarkdownHelpLink";
import { ContentImageToolbar } from "@/components/ContentImageToolbar";
import { GoogleDocsPaste } from "@/components/GoogleDocsPaste";
import { useAdminForm } from "@/hooks/useAdminForm";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { insertMarkdownAtCursor } from "@/hooks/useMarkdownInsert";
import { toast } from "sonner";

interface SafetySection {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  sectionType: string;
  enabled: number;
  linkUrl: string | null;
  linkLabel: string | null;
  lastUpdated: string;
}

export function AdminSafety() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const { isDirty, markDirty, blocker, justSaved, save } = useAdminForm({ successMessage: "Safety page saved" });

  const [sections, setSections] = useState<SafetySection[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newSection, setNewSection] = useState(false);
  const [newForm, setNewForm] = useState({ title: "", content: "", sectionType: "custom", linkUrl: "", linkLabel: "" });
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const { data: fetchedSections } = useQuery({
    queryKey: ['safety-sections-admin'],
    queryFn: () => api.get<SafetySection[]>('/api/safety-sections/all', token),
  });

  useEffect(() => {
    if (fetchedSections) setSections(fetchedSections);
  }, [fetchedSections]);

  const savingRef = useRef(false);

  const saveSection = useCallback(async (section: SafetySection) => {
    if (savingRef.current) return; // prevent concurrent saves
    savingRef.current = true;
    try {
      await save(async () => {
        await api.put(`/api/safety-sections/${section.id}`, section, token);
        qc.invalidateQueries({ queryKey: ['safety-sections-admin'] });
      });
    } finally {
      savingRef.current = false;
    }
  }, [save, token, qc]);

  const updateField = (id: string, field: string, value: string | number) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    markDirty();
  };

  const toggleEnabled = async (section: SafetySection) => {
    const updated = { ...section, enabled: section.enabled ? 0 : 1 };
    try {
      await api.put(`/api/safety-sections/${section.id}`, updated, token);
      setSections(prev => prev.map(s => s.id === section.id ? updated : s));
      qc.invalidateQueries({ queryKey: ['safety-sections-admin'] });
      toast.success(updated.enabled ? "Section enabled" : "Section disabled");
    } catch {
      toast.error("Failed to update section");
    }
  };

  const moveSection = async (id: string, direction: "up" | "down") => {
    const idx = sections.findIndex(s => s.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;

    const updated = [...sections];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    const items = updated.map((s, i) => ({ id: s.id, sortOrder: i }));
    updated.forEach((s, i) => s.sortOrder = i);
    setSections(updated);

    try {
      await api.put("/api/safety-sections/reorder/batch", { items }, token);
      qc.invalidateQueries({ queryKey: ['safety-sections-admin'] });
    } catch {
      toast.error("Failed to reorder");
    }
  };

  const addSection = async () => {
    if (!newForm.title.trim()) {
      toast.error("Title is required");
      return;
    }
    try {
      const result = await api.post<{ id: string }>("/api/safety-sections", {
        ...newForm,
        sortOrder: sections.length,
        enabled: 1,
      }, token);
      qc.invalidateQueries({ queryKey: ['safety-sections-admin'] });
      setNewSection(false);
      setNewForm({ title: "", content: "", sectionType: "custom", linkUrl: "", linkLabel: "" });
      toast.success("Section added");
    } catch {
      toast.error("Failed to add section");
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/api/safety-sections/${deleteId}`, token);
      setSections(prev => prev.filter(s => s.id !== deleteId));
      qc.invalidateQueries({ queryKey: ['safety-sections-admin'] });
      setDeleteId(null);
      toast.success("Section deleted");
    } catch {
      toast.error("Failed to delete section");
    }
  };

  const handleInsertMarkdown = (sectionId: string, markdown: string) => {
    const ref = textareaRefs.current[sectionId];
    if (!ref) return;
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;
    const newContent = insertMarkdownAtCursor({ current: ref }, section.content, markdown);
    updateField(sectionId, "content", newContent);
  };

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-4 mb-6">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-sky-light font-medium">
            <ArrowLeft className="w-4 h-4 mr-2" /> Admin Dashboard
          </Link>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-navy">Safety & Rules Page</h1>
            <p className="text-foreground-secondary mt-1">Manage the content sections shown on the public Safety & Rules page.</p>
          </div>
          <Link to="/safety" target="_blank" className="inline-flex items-center gap-1 text-sm text-sky hover:text-sky-light">
            View Page <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-4">
          {sections.map((section, idx) => (
            <Card key={section.id} className={`border-l-4 ${section.enabled ? "border-l-sky" : "border-l-gray-300"} ${!section.enabled ? "opacity-60" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <GripVertical className="w-5 h-5 text-foreground-ghost flex-shrink-0" />
                    {editingId === section.id ? (
                      <input
                        type="text"
                        value={section.title}
                        onChange={e => updateField(section.id, "title", e.target.value)}
                        className="text-lg font-bold text-navy bg-transparent border-b-2 border-sky focus:outline-none flex-1"
                      />
                    ) : (
                      <CardTitle className="text-lg text-navy truncate">{section.title}</CardTitle>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => moveSection(section.id, "up")} disabled={idx === 0} className="h-8 w-8 p-0">
                      <ChevronUp className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => moveSection(section.id, "down")} disabled={idx === sections.length - 1} className="h-8 w-8 p-0">
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleEnabled(section)} className="h-8 w-8 p-0">
                      {section.enabled ? <Eye className="w-4 h-4 text-sky" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(editingId === section.id ? null : section.id)}
                      className={`h-8 px-3 text-xs ${editingId === section.id ? "bg-sky/10 text-sky" : ""}`}
                    >
                      {editingId === section.id ? "Collapse" : "Edit"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(section.id)} className="h-8 w-8 p-0 text-red-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1 ml-8">
                  <span className="text-xs text-foreground-ghost bg-gray-100 px-2 py-0.5 rounded">{section.sectionType}</span>
                  {section.linkUrl && (
                    <span className="text-xs text-sky">Links to: {section.linkUrl}</span>
                  )}
                </div>
              </CardHeader>
              {editingId === section.id && (
                <CardContent className="pt-0 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground-secondary mb-1">Section Type</label>
                    <select
                      value={section.sectionType}
                      onChange={e => updateField(section.id, "sectionType", e.target.value)}
                      className="w-full sm:w-48 px-3 py-2 border border-border rounded-lg text-sm bg-background"
                    >
                      <option value="emergency">Emergency</option>
                      <option value="rules">Rules</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-medium text-foreground-secondary">Content (Markdown)</label>
                      <div className="flex items-center gap-2">
                        <ContentImageToolbar onInsertMarkdown={(md) => handleInsertMarkdown(section.id, md)} />
                        <GoogleDocsPaste onInsert={(md) => handleInsertMarkdown(section.id, md)} />
                        <MarkdownHelpLink />
                      </div>
                    </div>
                    <textarea
                      ref={el => { textareaRefs.current[section.id] = el; }}
                      value={section.content}
                      onChange={e => updateField(section.id, "content", e.target.value)}
                      rows={12}
                      className="w-full px-4 py-3 border border-border rounded-lg font-mono text-sm bg-background resize-y focus:ring-2 focus:ring-sky/30 focus:border-sky"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground-secondary mb-1">Link URL (optional)</label>
                      <input
                        type="text"
                        value={section.linkUrl || ""}
                        onChange={e => updateField(section.id, "linkUrl", e.target.value)}
                        placeholder="/page/code-of-conduct"
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground-secondary mb-1">Link Label (optional)</label>
                      <input
                        type="text"
                        value={section.linkLabel || ""}
                        onChange={e => updateField(section.id, "linkLabel", e.target.value)}
                        placeholder="View Code of Conduct"
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => saveSection(section)}
                      className={`px-6 transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : "bg-navy hover:bg-navy-light"} text-white`}
                    >
                      {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved</> : <><Save className="w-4 h-4 mr-2" /> Save Section</>}
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {!newSection ? (
          <Button onClick={() => setNewSection(true)} className="mt-6 bg-sky hover:bg-sky-light text-white">
            <Plus className="w-4 h-4 mr-2" /> Add Section
          </Button>
        ) : (
          <Card className="mt-6 border-l-4 border-l-emerald-500">
            <CardHeader>
              <CardTitle className="text-lg text-navy">New Section</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1">Title</label>
                <input
                  type="text"
                  value={newForm.title}
                  onChange={e => setNewForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Section Title"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground-secondary mb-1">Section Type</label>
                <select
                  value={newForm.sectionType}
                  onChange={e => setNewForm(prev => ({ ...prev, sectionType: e.target.value }))}
                  className="w-full sm:w-48 px-3 py-2 border border-border rounded-lg text-sm bg-background"
                >
                  <option value="custom">Custom</option>
                  <option value="emergency">Emergency</option>
                  <option value="rules">Rules</option>
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-foreground-secondary">Content (Markdown)</label>
                  <div className="flex items-center gap-2">
                    <GoogleDocsPaste onInsert={(md) => setNewForm(prev => ({ ...prev, content: prev.content + (prev.content ? "\n" : "") + md }))} />
                    <MarkdownHelpLink />
                  </div>
                </div>
                <textarea
                  value={newForm.content}
                  onChange={e => setNewForm(prev => ({ ...prev, content: e.target.value }))}
                  rows={8}
                  className="w-full px-4 py-3 border border-border rounded-lg font-mono text-sm bg-background resize-y"
                  placeholder="Write your section content in Markdown..."
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground-secondary mb-1">Link URL (optional)</label>
                  <input
                    type="text"
                    value={newForm.linkUrl}
                    onChange={e => setNewForm(prev => ({ ...prev, linkUrl: e.target.value }))}
                    placeholder="/page/code-of-conduct"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground-secondary mb-1">Link Label (optional)</label>
                  <input
                    type="text"
                    value={newForm.linkLabel}
                    onChange={e => setNewForm(prev => ({ ...prev, linkLabel: e.target.value }))}
                    placeholder="View Code of Conduct"
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => { setNewSection(false); setNewForm({ title: "", content: "", sectionType: "custom", linkUrl: "", linkLabel: "" }); }}>
                  Cancel
                </Button>
                <Button onClick={addSection} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                  <Plus className="w-4 h-4 mr-2" /> Add Section
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-100 text-sm text-blue-700">
          <strong>Tip:</strong> The Safety Officer Directory is managed separately from the{" "}
          <Link to="/admin/contacts" className="underline hover:text-blue-900">Admin Contacts</Link> page.
          Add link sections here to point to your Code of Conduct and Complaints & Disciplinary pages.
        </div>

        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6">
              <h3 className="text-lg font-bold text-navy mb-2">Delete Section?</h3>
              <p className="text-sm text-foreground-secondary mb-4">
                This will permanently remove this section from the Safety & Rules page.
              </p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
                <Button onClick={confirmDelete} className="bg-red-500 hover:bg-red-600 text-white">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </Button>
              </div>
            </div>
          </div>
        )}

        <UnsavedChangesModal blocker={blocker} onSave={async () => {
          const first = sections[0];
          if (first) await saveSection(first);
        }} />
      </div>
    </div>
  );
}
