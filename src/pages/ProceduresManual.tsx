import { Link, useLocation } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardList,
  ShieldCheck,
  Mountain,
  Users,
  UserCheck,
  Wrench,
  CalendarCheck,
  AlertTriangle,
  Phone,
  Crown,
  DollarSign,
  MessageSquare,
  ListChecks,
  Handshake,
  FolderOpen,
  TreePine,
  Pencil,
  Trash2,
  Plus,
  X,
  Save,
  Check,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Printer,
  ExternalLink,
  Search,
  Loader2,
  Sparkles,
  FileText,
  MapPin,
  KeyRound,
  Plug
} from "lucide-react";

const ICON_MAP: Record<string, any> = {
  ShieldCheck, Mountain, Users, UserCheck, Wrench, CalendarCheck,
  ClipboardList, Crown, DollarSign, MessageSquare, ListChecks,
  Handshake, FolderOpen, TreePine, AlertTriangle, Phone, KeyRound
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

const COLOR_OPTIONS = [
  { value: "text-navy", label: "Navy" },
  { value: "text-red-500", label: "Red" },
  { value: "text-sky", label: "Sky Blue" },
  { value: "text-emerald-500", label: "Green" },
  { value: "text-emerald-600", label: "Dark Green" },
  { value: "text-orange", label: "Orange" },
  { value: "text-amber-600", label: "Amber" },
  { value: "text-purple-500", label: "Purple" },
  { value: "text-violet-600", label: "Violet" },
  { value: "text-indigo-600", label: "Indigo" },
  { value: "text-blue-500", label: "Blue" },
  { value: "text-green-700", label: "Forest Green" },
];

interface Procedure {
  id: string;
  title: string;
  icon: string;
  iconColor: string;
  description: string;
  steps: string[];
  sortOrder: number;
}

function getIcon(name: string, className: string) {
  const IconComponent = ICON_MAP[name];
  if (!IconComponent) return <ClipboardList className={className} />;
  return <IconComponent className={className} />;
}

function generateId(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
}

export function ProceduresManual() {
  const location = useLocation();
  const { token } = useAuth();
  const { settings } = useSettings();
  const clubName = settings.clubName || 'SkyHigh';
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [editForm, setEditForm] = useState<Procedure>({
    id: "", title: "", icon: "ClipboardList", iconColor: "text-navy",
    description: "", steps: [], sortOrder: 0
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    fetchProcedures();
  }, []);

  useEffect(() => {
    if (location.hash && !loading) {
      const id = location.hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [location, loading]);

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || searching) return;
    setSearching(true);
    setSearchError("");
    setSearchResults(null);
    try {
      const data = await api.post<Record<string, unknown>>("/api/search", { query: searchQuery.trim() });
      setSearchResults(data);
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function getSearchResultLink(result: any): string {
    if (result.type === "site") return `/sites/${result.sectionId}`;
    if (result.type === "asset") return "#asset-register";
    return `#${result.sectionId}`;
  }

  function getSearchResultIcon(type: string) {
    switch (type) {
      case "site": return <MapPin className="w-4 h-4 text-emerald-500" />;
      case "asset": return <ClipboardList className="w-4 h-4 text-sky" />;
      case "procedure": return <FileText className="w-4 h-4 text-navy" />;
      case "step": return <ListChecks className="w-4 h-4 text-purple-500" />;
      default: return <FileText className="w-4 h-4 text-foreground-faint" />;
    }
  }

  async function fetchProcedures() {
    try {
      const data = await api.get<Procedure[]>("/api/procedures");
      setProcedures(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load procedures");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(proc: Procedure) {
    setEditForm({ ...proc, steps: [...proc.steps] });
    setEditingId(proc.id);
    setShowAdd(false);
    setDeleteConfirm(null);
  }

  function startAdd() {
    const maxSort = procedures.length > 0 ? Math.max(...procedures.map(p => p.sortOrder)) : 0;
    setEditForm({
      id: "", title: "", icon: "ClipboardList", iconColor: "text-navy",
      description: "", steps: [""], sortOrder: maxSort + 1
    });
    setShowAdd(true);
    setEditingId(null);
    setDeleteConfirm(null);
    setTimeout(() => {
      document.getElementById('procedure-editor')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  function cancelEdit() {
    setEditingId(null);
    setShowAdd(false);
    setError("");
  }

  function addStep() {
    setEditForm(prev => ({ ...prev, steps: [...prev.steps, ""] }));
  }

  function removeStep(index: number) {
    setEditForm(prev => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index)
    }));
  }

  function updateStep(index: number, value: string) {
    setEditForm(prev => ({
      ...prev,
      steps: prev.steps.map((s, i) => i === index ? value : s)
    }));
  }

  function moveStep(index: number, direction: 'up' | 'down') {
    const newSteps = [...editForm.steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSteps.length) return;
    [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
    setEditForm(prev => ({ ...prev, steps: newSteps }));
  }

  async function handleSave() {
    if (!editForm.title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const filteredSteps = editForm.steps.filter(s => s.trim());
      if (showAdd) {
        const id = generateId(editForm.title);
        await api.post("/api/procedures", { ...editForm, id, steps: filteredSteps }, token);
        setSaveSuccess(id);
        toast.success("Procedure created");
      } else if (editingId) {
        await api.put(`/api/procedures/${editingId}`, { ...editForm, steps: filteredSteps }, token);
        setSaveSuccess(editingId);
        toast.success("Procedure updated");
      }
      await fetchProcedures();
      setTimeout(() => {
        setSaveSuccess(null);
        setEditingId(null);
        setShowAdd(false);
      }, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save procedure");
    } finally {
      setSaving(false);
    }
  }

  function handlePrint(proc: Procedure) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const stepsHtml = proc.steps.map((step, i) =>
      `<li style="margin-bottom:12px;line-height:1.6;color:#374151"><span style="display:inline-block;width:24px;height:24px;border-radius:50%;border:1px solid #e5e7eb;text-align:center;line-height:24px;font-size:12px;font-weight:bold;color:#1e3a5f;margin-right:10px;flex-shrink:0">${i + 1}</span> ${step}</li>`
    ).join('');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${proc.title} — ${clubName} Procedures</title><style>
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#1f2937}
      h1{color:#1e3a5f;font-size:24px;margin-bottom:8px}
      .desc{color:#6b7280;font-size:14px;margin-bottom:24px;line-height:1.5}
      .header{border-bottom:2px solid #1e3a5f;padding-bottom:16px;margin-bottom:24px}
      .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;text-align:center}
      ul{list-style:none;padding:0}
      @media print{body{margin:20px}}
    </style></head><body>
      <div class="header"><h1>${proc.title}</h1><p class="desc">${proc.description}</p></div>
      <ul>${stepsHtml}</ul>
      <div class="footer">${clubName} — Internal Procedures Document — Printed ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
    </body></html>`);
    printWindow.document.close();
    printWindow.print();
  }

  async function handleDelete(id: string) {
    setSaving(true);
    setError("");
    try {
      await api.delete(`/api/procedures/${id}`, token);
      setDeleteConfirm(null);
      await fetchProcedures();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-background min-h-screen py-12 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-sky border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-sky-light font-medium">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2 text-navy font-bold">
            <ClipboardList className="w-5 h-5" />
            <span>Procedures Manual v2.0</span>
          </div>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-navy mb-4">Club Procedures Manual</h1>
          <p className="text-lg text-foreground-secondary max-w-3xl mx-auto">
            Standard operating procedures for {clubName}. This manual covers safety protocols, site operations, governance, financial management, membership, equipment, events, stakeholder relations, and digital filing.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-orange/10 text-orange rounded-full text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            Internal document — for committee and authorised personnel only
          </div>
        </div>

        <div className="mb-10 p-6 bg-card rounded-2xl border border-sky/20 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-sky" />
            <h2 className="text-sm font-bold text-foreground-faint uppercase tracking-widest">Smart Search</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Search across procedures, flying sites, and the asset register using natural language. Try "wind meter", "PG2 friendly sites", or "who handles insurance".
          </p>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-faint" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ask anything about the club..."
                className="pl-10"
                disabled={searching}
              />
            </div>
            <VoiceMicButton
              onTranscript={(text) => setSearchQuery((prev) => (prev ? prev + " " + text : text))}
              disabled={searching}
            />
            <Button
              type="submit"
              disabled={searching || !searchQuery.trim()}
              className="bg-navy hover:bg-navy/90 text-white"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span className="ml-2 hidden sm:inline">{searching ? "Searching..." : "Search"}</span>
            </Button>
          </form>

          {searchError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{searchError}</div>
          )}

          {searchResults && (
            <div className="mt-6">
              {searchResults.summary && (
                <div className="mb-4 p-4 bg-sky/5 border border-sky/20 rounded-xl">
                  <p className="text-sm text-navy font-medium">{searchResults.summary}</p>
                </div>
              )}
              {searchResults.results?.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.results.map((result: any, idx: number) => {
                    const link = getSearchResultLink(result);
                    const isExternal = link.startsWith("/");
                    const Tag = isExternal ? Link : "a";
                    const linkProps = isExternal ? { to: link } : { href: link };

                    return (
                      <Tag
                        key={idx}
                        {...(linkProps as any)}
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-background border border-border-faint transition-colors group cursor-pointer"
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {getSearchResultIcon(result.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-navy text-sm group-hover:text-sky transition-colors">
                              {result.title}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                              {result.type}
                            </span>
                            {result.stepNumber && (
                              <span className="text-xs text-foreground-faint">Step {result.stepNumber}</span>
                            )}
                          </div>
                          <p className="text-xs text-foreground-secondary mt-1 line-clamp-2">{result.excerpt}</p>
                          {result.relevance && (
                            <p className="text-xs text-foreground-faint mt-1 italic">{result.relevance}</p>
                          )}
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-foreground-ghost group-hover:text-sky flex-shrink-0 mt-1" />
                      </Tag>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No results found. Try rephrasing your question.</p>
              )}
            </div>
          )}
        </div>

        {token && (
          <div className="mb-8 flex justify-end">
            <Button onClick={startAdd} className="bg-navy hover:bg-navy/90 text-white">
              <Plus className="w-4 h-4 mr-2" /> Add New Section
            </Button>
          </div>
        )}

        {error && !editingId && !showAdd && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
        )}

        <div id="quick-nav" className="mb-10 p-6 bg-card rounded-2xl border border-sky/20 shadow-sm scroll-mt-24">
          <h2 className="text-sm font-bold text-foreground-faint uppercase tracking-widest mb-4">Quick Navigation</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {procedures.map((proc) => (
              <a
                key={proc.id}
                href={`#${proc.id}`}
                className="flex items-center gap-2 p-3 rounded-lg hover:bg-sky/5 transition-colors text-sm text-foreground-label hover:text-navy font-medium"
              >
                {getIcon(proc.icon, `w-5 h-5 ${proc.iconColor}`)}
                {proc.title}
              </a>
            ))}
          </div>
        </div>

        {showAdd && (
          <div id="procedure-editor" className="mb-12 scroll-mt-24">
            <ProcedureEditor
              form={editForm}
              setForm={setEditForm}
              onSave={handleSave}
              onCancel={cancelEdit}
              saving={saving}
              error={error}
              isNew={true}
              saveSuccess={saveSuccess !== null}
              addStep={addStep}
              removeStep={removeStep}
              updateStep={updateStep}
              moveStep={moveStep}
            />
          </div>
        )}

        <div className="space-y-12">
          {procedures.map((proc) => (
            <div key={proc.id}>
              {editingId === proc.id ? (
                <div id="procedure-editor" className="scroll-mt-24">
                  <ProcedureEditor
                    form={editForm}
                    setForm={setEditForm}
                    onSave={handleSave}
                    onCancel={cancelEdit}
                    saving={saving}
                    error={error}
                    isNew={false}
                    saveSuccess={saveSuccess === proc.id}
                    addStep={addStep}
                    removeStep={removeStep}
                    updateStep={updateStep}
                    moveStep={moveStep}
                  />
                </div>
              ) : (
                <Card id={proc.id} className="overflow-hidden border-none shadow-lg scroll-mt-24">
                  <div className="flex flex-col md:flex-row">
                    <div className="md:w-1/3 bg-card p-8 border-r border-border-faint">
                      <div className="mb-4">{getIcon(proc.icon, `w-6 h-6 ${proc.iconColor}`)}</div>
                      <h2 className="text-2xl font-bold text-navy mb-4">{proc.title}</h2>
                      <p className="text-foreground-secondary text-sm mb-6 leading-relaxed">{proc.description}</p>
                      {token && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEdit(proc)}
                            className="text-sky border-sky hover:bg-sky/5"
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePrint(proc)}
                            className="text-navy border-navy/30 hover:bg-navy/5"
                          >
                            <Printer className="w-3.5 h-3.5 mr-1" /> Print
                          </Button>
                          {deleteConfirm === proc.id ? (
                            <div className="flex gap-1">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleDelete(proc.id)}
                                disabled={saving}
                              >
                                {saving ? "..." : "Confirm"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeleteConfirm(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDeleteConfirm(proc.id)}
                              className="text-red-500 border-red-200 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="md:w-2/3 bg-background/50 p-8">
                      <h3 className="text-sm font-bold text-foreground-faint uppercase tracking-widest mb-6">Procedures</h3>
                      <ul className="space-y-4">
                        {proc.steps.map((step, sIdx) => (
                          <li key={sIdx} className="flex gap-3">
                            <div className="flex-shrink-0 w-6 h-6 bg-card rounded-full border border-border-subtle flex items-center justify-center text-xs font-bold text-navy shadow-sm">
                              {sIdx + 1}
                            </div>
                            <div>
                              <span className="text-foreground-label">{step}</span>
                              {step.toLowerCase().includes("see the dedicated asset register section") && (
                                <a
                                  href="#asset-register"
                                  className="ml-2 inline-flex items-center gap-1 text-sm text-sky hover:text-navy font-medium transition-colors"
                                >
                                  → To Asset Register
                                </a>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                      {proc.id === "asset-register" && token && (
                        <div className="mt-6 pt-4 border-t border-border-subtle">
                          <Link
                            to="/admin/connections#google-sheets"
                            className="inline-flex items-center gap-1.5 text-sm text-sky hover:text-navy font-medium transition-colors"
                          >
                            <Plug className="w-4 h-4" />
                            Manage Asset Register connection settings in API Settings →
                          </Link>
                        </div>
                      )}
                      <div className="mt-6 pt-4 border-t border-border-subtle">
                        <a
                          href="#quick-nav"
                          className="inline-flex items-center gap-1.5 text-sm text-sky hover:text-navy font-medium transition-colors"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                          Back to Quick Navigation
                        </a>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          ))}

          <Card className="bg-navy text-white p-8 border-none shadow-xl">
            <CardHeader className="p-0 mb-6">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Phone className="w-6 h-6 text-sky" />
                Emergency Contacts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white/5 p-5 rounded-xl border border-white/10">
                <h4 className="font-bold mb-2 text-sky">Emergency Services</h4>
                <p className="text-2xl font-black">000</p>
                <p className="text-sm text-foreground-faint mt-1">Police, Fire, Ambulance</p>
              </div>
              <div className="bg-white/5 p-5 rounded-xl border border-white/10">
                <h4 className="font-bold mb-2 text-sky">SAFA</h4>
                <p className="text-lg font-bold">(03) 9336 7155</p>
                <p className="text-sm text-foreground-faint mt-1">Sports Aviation Federation of Australia</p>
              </div>
              <div className="bg-white/5 p-5 rounded-xl border border-white/10">
                <h4 className="font-bold mb-2 text-sky">Club Safety Officer</h4>
                <p className="text-sm text-gray-300">Refer to the Safety & Rules page for current contact details</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-16 text-center text-foreground-faint text-sm">
          &copy; {new Date().getFullYear()} {clubName}. Internal Procedures Document.
        </div>
      </div>
    </div>
  );
}

interface ProcedureEditorProps {
  form: Procedure;
  setForm: React.Dispatch<React.SetStateAction<Procedure>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string;
  isNew: boolean;
  saveSuccess: boolean;
  addStep: () => void;
  removeStep: (index: number) => void;
  updateStep: (index: number, value: string) => void;
  moveStep: (index: number, direction: 'up' | 'down') => void;
}

function ProcedureEditor({ form, setForm, onSave, onCancel, saving, error, isNew, saveSuccess, addStep, removeStep, updateStep, moveStep }: ProcedureEditorProps) {
  return (
    <Card className="border-2 border-sky shadow-xl overflow-hidden">
      <CardHeader className="bg-navy text-white p-6">
        <CardTitle className="flex items-center gap-2 text-xl">
          {isNew ? <Plus className="w-5 h-5" /> : <Pencil className="w-5 h-5" />}
          {isNew ? "Add New Section" : `Editing: ${form.title}`}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium text-foreground-label">Section Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. Safety Procedures"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium text-foreground-label">Icon</Label>
              <select
                value={form.icon}
                onChange={(e) => setForm(prev => ({ ...prev, icon: e.target.value }))}
                className="mt-1 w-full rounded-md border border-border-subtle px-3 py-2 text-sm"
              >
                {ICON_OPTIONS.map(icon => (
                  <option key={icon} value={icon}>{icon}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium text-foreground-label">Icon Colour</Label>
              <select
                value={form.iconColor}
                onChange={(e) => setForm(prev => ({ ...prev, iconColor: e.target.value }))}
                className="mt-1 w-full rounded-md border border-border-subtle px-3 py-2 text-sm"
              >
                {COLOR_OPTIONS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium text-foreground-label">Description</Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Brief description of this section..."
            className="mt-1"
            rows={3}
          />
        </div>

        <div>
          <Label className="text-sm font-medium text-foreground-label">Sort Order</Label>
          <Input
            type="number"
            value={form.sortOrder}
            onChange={(e) => setForm(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
            className="mt-1 w-32"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-medium text-foreground-label">Procedure Steps</Label>
            <Button variant="outline" size="sm" onClick={addStep} className="text-sky border-sky">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Step
            </Button>
          </div>
          <div className="space-y-3">
            {form.steps.map((step, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <div className="flex flex-col gap-0.5 pt-2">
                  <button
                    onClick={() => moveStep(idx, 'up')}
                    disabled={idx === 0}
                    className="text-foreground-faint hover:text-navy disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveStep(idx, 'down')}
                    disabled={idx === form.steps.length - 1}
                    className="text-foreground-faint hover:text-navy disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="flex-shrink-0 w-6 h-6 bg-muted rounded-full flex items-center justify-center text-xs font-bold text-muted-foreground mt-2">
                  {idx + 1}
                </span>
                <Textarea
                  value={step}
                  onChange={(e) => updateStep(idx, e.target.value)}
                  placeholder="Enter procedure step..."
                  className="flex-1"
                  rows={2}
                />
                <button
                  onClick={() => removeStep(idx)}
                  className="text-red-400 hover:text-red-600 mt-2 flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <Button
            onClick={onSave}
            disabled={saving}
            className={saveSuccess ? "bg-emerald-600 hover:bg-emerald-600" : "bg-navy hover:bg-navy/90"}
          >
            {saveSuccess ? (
              <><Check className="w-4 h-4 mr-2" /> Saved</>
            ) : saving ? (
              "Saving..."
            ) : (
              <><Save className="w-4 h-4 mr-2" /> {isNew ? "Create Section" : "Save Changes"}</>
            )}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
