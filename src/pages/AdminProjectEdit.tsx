import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminForm } from "@/hooks/useAdminForm";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";
import {
  ArrowLeft,
  Trash2,
  X,
  Search,
  Upload,
  ExternalLink,
  Link2,
  FileText,
  File,
  Image,
  FileSpreadsheet,
  Presentation,
  Film,
  Music,
  Archive,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Pencil,
  User,
  Building,
  Phone,
  Mail,
  DollarSign,
  Save,
  Check,
  ChevronDown,
} from "lucide-react";
import { isValidFilename, generateCorrectedFilename, renameFile } from "@/lib/filenameValidation";

interface Contact {
  id: string;
  organisation: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  role?: string;
}

interface ProjectDocument {
  id: string;
  driveFileId: string | null;
  name: string;
  mimeType: string;
  size: number;
  category: string;
  webViewLink: string | null;
  createdAt: string;
  linked: number;
}

interface Site {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  relatedSiteId: string | null;
  relatedSiteName: string | null;
  driveFolderId: string | null;
  parksVic: number;
  pvContactId: string | null;
  pvExpectations: string;
  coordinatorContactId: string | null;
  coordinatorContact: Contact | null;
  worksRequired: string;
  contractorNotes: string;
  landownerNotes: string;
  stakeholderNotes: string;
  estimatedBudget: string;
  fundingSource: string;
  insuranceRequirements: string;
  supplierQuotes: string;
  complianceNotes: string;
  approvedBy: string;
  approvalDate: string;
  contacts: Contact[];
  documents: ProjectDocument[];
  createdAt: string;
  updatedAt: string;
}

interface DriveSearchResult {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMimeIcon(mimeType: string) {
  if (!mimeType) return <File className="w-4 h-4 text-foreground-faint" />;
  if (mimeType.startsWith("image/")) return <Image className="w-4 h-4 text-pink-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return <Presentation className="w-4 h-4 text-orange-500" />;
  if (mimeType.startsWith("video/")) return <Film className="w-4 h-4 text-purple-500" />;
  if (mimeType.startsWith("audio/")) return <Music className="w-4 h-4 text-sky" />;
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("compressed")) return <Archive className="w-4 h-4 text-amber-600" />;
  if (mimeType.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
  return <File className="w-4 h-4 text-foreground-faint" />;
}


const statusOptions = [
  { value: "active", label: "Active" },
  { value: "on-hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

function ContactPicker({
  token,
  onSelect,
  excludeIds,
}: {
  token: string | null;
  onSelect: (contact: Contact) => void;
  excludeIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchContacts = useCallback(
    (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      api.get<Contact[]>(`/api/contacts/search?q=${encodeURIComponent(q)}`, token)
        .then((data) => {
          setResults(data.filter((c) => !excludeIds.includes(c.id)));
          setShowDropdown(true);
        })
        .catch(() => setResults([]));
    },
    [token, excludeIds]
  );

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchContacts(value), 300);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-faint" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => query.trim() && results.length > 0 && setShowDropdown(true)}
          placeholder="Search contacts by name or organisation..."
          className="w-full pl-10 pr-4 py-2 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
        />
      </div>
      {showDropdown && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-card border border-border-subtle rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onSelect(c);
                setQuery("");
                setShowDropdown(false);
                setResults([]);
              }}
              className="w-full text-left px-4 py-2.5 hover:bg-background border-b border-border-faint last:border-0"
            >
              <div className="font-medium text-navy text-sm">{c.name}</div>
              {c.organisation && (
                <div className="text-xs text-muted-foreground">{c.organisation}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactCard({
  contact,
  onRemove,
  roleBadge,
}: {
  contact: Contact;
  onRemove: () => void;
  roleBadge?: string;
}) {
  return (
    <div className="flex items-start justify-between bg-background border border-border-subtle rounded-lg p-3">
      <div className="space-y-1 min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-navy text-sm">{contact.name}</span>
          {roleBadge && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-sky/10 text-sky">
              {roleBadge}
            </span>
          )}
        </div>
        {contact.organisation && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Building className="w-3 h-3" />
            {contact.organisation}
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="w-3 h-3" />
            {contact.phone}
          </div>
        )}
        {contact.email && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Mail className="w-3 h-3" />
            {contact.email}
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        className="ml-2 p-1 text-foreground-faint hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
        title="Remove contact"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function AdminProjectEdit({ id: propId, isDialog, onClose }: { id?: string; isDialog?: boolean; onClose?: () => void }) {
  const { id: routeId } = useParams<{ id: string }>();
  const id = propId || routeId;
  const navigate = useNavigate();
  const { token } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const { isDirty, markDirty, blocker, saving, justSaved, save } = useAdminForm({ successMessage: "Project saved" });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [relatedSiteId, setRelatedSiteId] = useState("");
  const [coordinator, setCoordinator] = useState<Contact | null>(null);
  const [parksVic, setParksVic] = useState(false);
  const [pvExpectations, setPvExpectations] = useState("");
  const [worksRequired, setWorksRequired] = useState("");
  const [contractorNotes, setContractorNotes] = useState("");
  const [landownerNotes, setLandownerNotes] = useState("");
  const [stakeholderNotes, setStakeholderNotes] = useState("");
  const [estimatedBudget, setEstimatedBudget] = useState("");
  const [fundingSource, setFundingSource] = useState("");
  const [insuranceRequirements, setInsuranceRequirements] = useState("");
  const [supplierQuotes, setSupplierQuotes] = useState("");
  const [complianceNotes, setComplianceNotes] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [approvalDate, setApprovalDate] = useState("");

  const [sites, setSites] = useState<Site[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [pvContact, setPvContact] = useState<Contact | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  const [showDocModal, setShowDocModal] = useState(false);
  const [docModalTab, setDocModalTab] = useState<"upload" | "link">("upload");
  const [driveConnected, setDriveConnected] = useState(false);
  const [deleteDocConfirm, setDeleteDocConfirm] = useState<string | null>(null);

  const [pvWasEverTicked, setPvWasEverTicked] = useState(false);
  const [showPvExpectationsEdit, setShowPvExpectationsEdit] = useState(false);

  const fetchProject = useCallback(async () => {
    if (!id) return;
    try {
      let data: Project;
      try {
        data = await api.get<Project>(`/api/projects/${id}`, token);
      } catch (err) {
        if (!isDialog) navigate("/admin/projects");
        onClose?.();
        return;
      }
      setProject(data);
      setName(data.name);
      setDescription(data.description || "");
      setStatus(data.status);
      setRelatedSiteId(data.relatedSiteId || "");
      setCoordinator(data.coordinatorContact || null);
      setParksVic(!!data.parksVic);
      let finalPvExpectations = data.pvExpectations || "";
      if (!finalPvExpectations) {
        try {
          const defData = await api.get<{ expectations?: string }>("/api/projects/settings/parks-vic-defaults", token);
          finalPvExpectations = defData.expectations || "";
        } catch {}
      }
      setPvExpectations(finalPvExpectations);
      setWorksRequired(data.worksRequired || "");
      setContractorNotes(data.contractorNotes || "");
      setLandownerNotes(data.landownerNotes || "");
      setStakeholderNotes(data.stakeholderNotes || "");
      setEstimatedBudget(data.estimatedBudget || "");
      setFundingSource(data.fundingSource || "");
      setInsuranceRequirements(data.insuranceRequirements || "");
      setSupplierQuotes(data.supplierQuotes || "");
      setComplianceNotes(data.complianceNotes || "");
      setApprovedBy(data.approvedBy || "");
      setApprovalDate(data.approvalDate || "");
      setContacts(data.contacts || []);

      const dbDocs: ProjectDocument[] = data.documents || [];
      try {
        const driveData = await api.get<{ files?: Array<Record<string, unknown>> }>(`/api/projects/${id}/documents/drive`, token);
        if (driveData.files && driveData.files.length > 0) {
          const dbDriveIds = new Set(dbDocs.map((d) => d.driveFileId).filter(Boolean));
          const driveDocs: ProjectDocument[] = driveData.files
            .filter((f: any) => !dbDriveIds.has(f.id))
            .map((f: any) => ({
              id: f.id,
              driveFileId: f.id,
              name: f.name,
              mimeType: f.mimeType,
              size: f.size || 0,
              category: "08",
              webViewLink: f.url,
              createdAt: f.dateCreated || new Date().toISOString(),
              linked: 0,
            }));
          setDocuments([...dbDocs, ...driveDocs]);
        } else {
          setDocuments(dbDocs);
        }
      } catch {
        setDocuments(dbDocs);
      }

      if (data.parksVic) setPvWasEverTicked(true);

      if (data.pvContactId) {
        const pvC = (data.contacts || []).find(
          (c) => c.id === data.pvContactId
        );
        setPvContact(pvC || null);
      }
    } catch {
      if (!isDialog) navigate("/admin/projects");
      onClose?.();
    } finally {
      setLoading(false);
    }
  }, [id, token, navigate]);

  const fetchSites = useCallback(async () => {
    try {
      const data = await api.get<Array<Record<string, unknown>>>("/api/sites");
      setSites(data);
    } catch {}
  }, []);

  const fetchDriveStatus = useCallback(async () => {
    try {
      const data = await api.get<{ connected: boolean }>("/api/documents/status", token);
      setDriveConnected(data.connected);
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchProject();
    fetchSites();
    fetchDriveStatus();
  }, [fetchProject, fetchSites, fetchDriveStatus]);

  const loadedRef = useRef(false);
  useEffect(() => {
    if (!loading && project) {
      if (loadedRef.current) {
        markDirty();
      } else {
        loadedRef.current = true;
      }
    }
  }, [name, description, status, relatedSiteId, coordinator, parksVic, pvContact, pvExpectations, worksRequired, contractorNotes, landownerNotes, stakeholderNotes, estimatedBudget, fundingSource, insuranceRequirements, supplierQuotes, complianceNotes, approvedBy, approvalDate]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    await save(async () => {
      await api.put(`/api/projects/${id}`, {
        name: name.trim(),
        description,
        status,
        relatedSiteId: relatedSiteId || null,
        coordinatorContactId: coordinator?.id || null,
        parksVic,
        pvContactId: pvContact?.id || null,
        pvExpectations,
        worksRequired,
        contractorNotes,
        landownerNotes,
        stakeholderNotes,
        estimatedBudget,
        fundingSource,
        insuranceRequirements,
        supplierQuotes,
        complianceNotes,
        approvedBy,
        approvalDate,
      }, token);
    });
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/api/projects/${id}`, token);
      toast.success("Project deleted");
      if (isDialog) {
        onClose?.();
      } else {
        navigate("/admin/projects");
      }
    } catch {}
  };

  const handlePvToggle = async (checked: boolean) => {
    setParksVic(checked);
    if (checked && !pvWasEverTicked) {
      setPvWasEverTicked(true);
      try {
        const data = await api.get<{ expectations?: string }>("/api/projects/settings/parks-vic-defaults", token);
        if (data.expectations && !pvExpectations) {
          setPvExpectations(data.expectations);
        }
      } catch {}
    }
  };

  const handleSavePvDefaults = async () => {
    try {
      await api.put("/api/projects/settings/parks-vic-defaults", { expectations: pvExpectations }, token);
      toast.success("PV defaults updated");
    } catch {}
  };

  const handleLinkContact = async (contact: Contact, role: string) => {
    try {
      await api.post(`/api/projects/${id}/contacts`, { contactId: contact.id, role }, token);
      setContacts((prev) => {
        if (prev.find((c) => c.id === contact.id)) return prev;
        return [...prev, { ...contact, role }];
      });
    } catch {}
  };

  const handleUnlinkContact = async (contactId: string) => {
    try {
      await api.delete(`/api/projects/${id}/contacts/${contactId}`, token);
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
      if (pvContact?.id === contactId) setPvContact(null);
    } catch {}
  };

  const handleRemoveDocument = async (doc: ProjectDocument) => {
    try {
      try {
        await api.delete(`/api/projects/${id}/documents/${doc.id}`, token);
      } catch {
        if (doc.driveFileId) {
          await api.delete(`/api/documents/${doc.driveFileId}`, token);
        }
      }
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setDeleteDocConfirm(null);
    } catch {}
  };

  const handleSelectPvContact = (contact: Contact) => {
    setPvContact(contact);
    handleLinkContact(contact, "parks_vic");
  };

  if (loading) {
    return (
      <div className="bg-background min-h-screen py-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-muted-foreground py-20">
          Loading project...
        </div>
      </div>
    );
  }

  if (!project) return null;

  const linkedContactIds = contacts.map((c) => c.id);

  return (
    <div className={`bg-background ${isDialog ? "" : "min-h-screen py-12"}`}>
      <div className={`${isDialog ? "max-w-full" : "max-w-4xl mx-auto px-4 sm:px-6 lg:px-8"}`}>
        <div className="mb-8">
        {!isDialog && (
          <Link
            to="/admin/projects"
            className="inline-flex items-center text-sky hover:text-navy transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Projects
          </Link>
        )}

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-3xl font-extrabold text-navy bg-transparent border-none outline-none w-full focus:ring-0 p-0 placeholder-gray-300"
                placeholder="Project Name"
              />
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {isDialog && (
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              )}
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="border border-border rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-sky focus:border-sky"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end mb-6">
          <Button
            onClick={handleSave}
            disabled={saving}
            className={`px-8 transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : "bg-navy hover:bg-navy-light"} text-white`}
          >
            {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save Project</>}
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-navy text-lg">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground-label mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Project description..."
                className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-label mb-1">
                Related Site
              </label>
              <select
                value={relatedSiteId}
                onChange={(e) => setRelatedSiteId(e.target.value)}
                className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
              >
                <option value="">No site selected</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground-label mb-1">
                Project Coordinator
              </label>
              {coordinator ? (
                <ContactCard
                  contact={coordinator}
                  onRemove={() => setCoordinator(null)}
                  roleBadge="Coordinator"
                />
              ) : (
                <ContactPicker
                  token={token}
                  onSelect={(contact) => setCoordinator(contact)}
                  excludeIds={[]}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="cursor-pointer select-none" onClick={() => toggleSection('parksVic')}>
            <CardTitle className="text-navy text-lg flex items-center justify-between">
              Parks Victoria
              <ChevronDown className={`w-5 h-5 text-foreground-faint transition-transform duration-200 ${expandedSections.parksVic ? 'rotate-180' : ''}`} />
            </CardTitle>
          </CardHeader>
          {expandedSections.parksVic && <CardContent>
            <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">
                    PV Contact
                  </label>
                  {pvContact ? (
                    <ContactCard
                      contact={pvContact}
                      onRemove={() => {
                        handleUnlinkContact(pvContact.id);
                        setPvContact(null);
                      }}
                      roleBadge="Parks Vic"
                    />
                  ) : (
                    <ContactPicker
                      token={token}
                      onSelect={handleSelectPvContact}
                      excludeIds={[]}
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">
                    PV Expectations
                  </label>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 whitespace-pre-line">
                    {pvExpectations || "No expectations set."}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPvExpectationsEdit(!showPvExpectationsEdit)}
                    className="text-xs text-sky hover:underline mt-1"
                  >
                    {showPvExpectationsEdit ? "Hide Editor" : "Edit Expectations"}
                  </button>
                  {showPvExpectationsEdit && (
                    <div className="space-y-2 mt-2">
                      <textarea
                        value={pvExpectations}
                        onChange={(e) => setPvExpectations(e.target.value)}
                        rows={4}
                        className="w-full p-3 border border-border rounded-lg text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                        placeholder="Parks Victoria expectations..."
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Changes here apply to this project only.</span>
                        <button
                          type="button"
                          onClick={handleSavePvDefaults}
                          className="px-3 py-1 bg-sky text-white rounded text-xs font-medium hover:bg-sky-light"
                        >
                          Save as default for new projects
                        </button>
                      </div>
                    </div>
                  )}
                </div>
            </div>
          </CardContent>}
        </Card>

        <Card className="mb-6">
          <CardHeader className="cursor-pointer select-none" onClick={() => toggleSection('stakeholder')}>
            <CardTitle className="text-navy text-lg flex items-center justify-between">
              Stakeholder Notes
              <ChevronDown className={`w-5 h-5 text-foreground-faint transition-transform duration-200 ${expandedSections.stakeholder ? 'rotate-180' : ''}`} />
            </CardTitle>
          </CardHeader>
          {expandedSections.stakeholder && <CardContent className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-foreground-label mb-1">
                Works Required
              </label>
              <textarea
                value={worksRequired}
                onChange={(e) => setWorksRequired(e.target.value)}
                rows={3}
                placeholder="Describe works required..."
                className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-label mb-1">
                Contractor Notes
              </label>
              <textarea
                value={contractorNotes}
                onChange={(e) => setContractorNotes(e.target.value)}
                rows={3}
                placeholder="Contractor notes..."
                className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
              />
              <div className="mt-2">
                <ContactPicker
                  token={token}
                  onSelect={(c) => handleLinkContact(c, "contractor")}
                  excludeIds={linkedContactIds}
                />
              </div>
              {contacts
                .filter((c) => c.role === "contractor")
                .map((c) => (
                  <div key={c.id} className="mt-2">
                    <ContactCard
                      contact={c}
                      onRemove={() => handleUnlinkContact(c.id)}
                      roleBadge="Contractor"
                    />
                  </div>
                ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-label mb-1">
                Landowner Notes
              </label>
              <textarea
                value={landownerNotes}
                onChange={(e) => setLandownerNotes(e.target.value)}
                rows={3}
                placeholder="Landowner notes..."
                className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
              />
              <div className="mt-2">
                <ContactPicker
                  token={token}
                  onSelect={(c) => handleLinkContact(c, "landowner")}
                  excludeIds={linkedContactIds}
                />
              </div>
              {contacts
                .filter((c) => c.role === "landowner")
                .map((c) => (
                  <div key={c.id} className="mt-2">
                    <ContactCard
                      contact={c}
                      onRemove={() => handleUnlinkContact(c.id)}
                      roleBadge="Landowner"
                    />
                  </div>
                ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground-label mb-1">
                Other Stakeholders
              </label>
              <textarea
                value={stakeholderNotes}
                onChange={(e) => setStakeholderNotes(e.target.value)}
                rows={3}
                placeholder="Other stakeholder notes..."
                className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
              />
              <div className="mt-2">
                <ContactPicker
                  token={token}
                  onSelect={(c) => handleLinkContact(c, "stakeholder")}
                  excludeIds={linkedContactIds}
                />
              </div>
              {contacts
                .filter((c) => c.role === "stakeholder")
                .map((c) => (
                  <div key={c.id} className="mt-2">
                    <ContactCard
                      contact={c}
                      onRemove={() => handleUnlinkContact(c.id)}
                      roleBadge="Stakeholder"
                    />
                  </div>
                ))}
            </div>
          </CardContent>}
        </Card>

        <Card className="mb-6">
          <CardHeader className="cursor-pointer select-none" onClick={() => toggleSection('costing')}>
            <CardTitle className="text-navy text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Costing Approval
              </span>
              <ChevronDown className={`w-5 h-5 text-foreground-faint transition-transform duration-200 ${expandedSections.costing ? 'rotate-180' : ''}`} />
            </CardTitle>
          </CardHeader>
          {expandedSections.costing && <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground-label mb-1">
                  Estimated Budget
                </label>
                <input
                  type="text"
                  value={estimatedBudget}
                  onChange={(e) => setEstimatedBudget(e.target.value)}
                  className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                  placeholder="e.g. $5,000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground-label mb-1">
                  Funding Source
                </label>
                <input
                  type="text"
                  value={fundingSource}
                  onChange={(e) => setFundingSource(e.target.value)}
                  className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                  placeholder="e.g. Club funds, Parks Vic grant, etc."
                />
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              Upload all before and after photos, Contracts, Insurance certificates, Quotes from contractors or suppliers and any compliance documents or certificates to the project folder using the documents box below.
            </div>

            <div className="border-t border-border-faint pt-4">
              <h4 className="text-sm font-semibold text-navy mb-3">Financial Approval</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">
                    Approved By
                  </label>
                  <input
                    type="text"
                    value={approvedBy}
                    onChange={(e) => setApprovedBy(e.target.value)}
                    className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                    placeholder="Name of person who approved"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">
                    Approval Date
                  </label>
                  <input
                    type="date"
                    value={approvalDate}
                    onChange={(e) => setApprovalDate(e.target.value)}
                    className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                  />
                </div>
              </div>
            </div>
          </CardContent>}
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-navy text-lg">Documents</CardTitle>
              <Button
                size="sm"
                onClick={() => {
                  setDocModalTab("upload");
                  setShowDocModal(true);
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Document
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">
                No documents attached yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-muted border-b border-border-subtle">
                      <th className="p-3 font-semibold text-navy text-sm">
                        Name
                      </th>
                      <th className="p-3 font-semibold text-navy text-sm">
                        Source
                      </th>
                      <th className="p-3 font-semibold text-navy text-sm text-right">
                        Size
                      </th>
                      <th className="p-3 font-semibold text-navy text-sm text-right">
                        Date
                      </th>
                      <th className="p-3 font-semibold text-navy text-sm text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr
                        key={doc.id}
                        className="border-b border-border-faint hover:bg-background"
                      >
                        <td className="p-3 text-sm">
                          <div className="flex items-center gap-2">
                            {getMimeIcon(doc.mimeType)}
                            {doc.webViewLink ? (
                              <a
                                href={doc.webViewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sky hover:text-navy font-medium flex items-center gap-1"
                              >
                                {doc.name}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="font-medium text-navy">
                                {doc.name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-sm">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium ${
                              doc.linked
                                ? "bg-muted text-foreground-secondary"
                                : "bg-sky/10 text-sky"
                            }`}
                          >
                            {doc.linked ? "linked" : "uploaded"}
                          </span>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground text-right">
                          {formatFileSize(doc.size)}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground text-right">
                          {new Date(doc.createdAt).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="p-3 text-right">
                          {deleteDocConfirm === doc.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-red-600">
                                {doc.linked
                                  ? "Unlink?"
                                  : "Delete from Drive?"}
                              </span>
                              <button
                                onClick={() => handleRemoveDocument(doc)}
                                className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded"
                              >
                                Yes
                              </button>
                              <button
                                onClick={() => setDeleteDocConfirm(null)}
                                className="text-xs text-muted-foreground hover:text-foreground-label px-2 py-1 rounded border"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteDocConfirm(doc.id)}
                              className="text-foreground-faint hover:text-red-500 transition-colors"
                              title="Remove document"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className={`px-8 transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : "bg-navy hover:bg-navy-light"} text-white`}
          >
            {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save Project</>}
          </Button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-navy mb-2">Delete Project</h3>
            <p className="text-foreground-secondary mb-6">
              Are you sure you want to delete <strong>{name}</strong>? This will
              remove the project and all its links. Documents in Google Drive
              will not be deleted.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={handleDelete}
              >
                Delete Project
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDocModal && (
        <DocumentModal
          projectId={id!}
          token={token}
          connected={driveConnected}
          tab={docModalTab}
          setTab={setDocModalTab}
          onClose={() => setShowDocModal(false)}
          onDocumentAdded={(doc) => {
            setDocuments((prev) => [doc, ...prev]);
            setShowDocModal(false);
          }}
          onDocumentLinked={(doc) => {
            setDocuments((prev) => {
              if (prev.find((d) => d.id === doc.id)) return prev;
              return [doc, ...prev];
            });
            setShowDocModal(false);
          }}
        />
      )}
      <UnsavedChangesModal blocker={blocker} onSave={handleSave} />
    </div>
  );
}

function DocumentModal({
  projectId,
  token,
  connected,
  tab,
  setTab,
  onClose,
  onDocumentAdded,
  onDocumentLinked,
}: {
  projectId: string;
  token: string | null;
  connected: boolean;
  tab: "upload" | "link";
  setTab: (t: "upload" | "link") => void;
  onClose: () => void;
  onDocumentAdded: (doc: ProjectDocument) => void;
  onDocumentLinked: (doc: ProjectDocument) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<globalThis.File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [correctedName, setCorrectedName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [nameApproved, setNameApproved] = useState(false);

  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<DriveSearchResult[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linking, setLinking] = useState(false);

  const filenameValid = selectedFile ? isValidFilename(selectedFile.name) : false;

  const onFileSelected = (file: globalThis.File) => {
    setSelectedFile(file);
    setNameApproved(false);
    setEditingName(false);
    setEditName("");
    if (!isValidFilename(file.name)) {
      setCorrectedName(generateCorrectedFilename(file.name));
    } else {
      setCorrectedName("");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !token) return;
    setUploading(true);
    setUploadError("");
    try {
      let fileToUpload = selectedFile;
      if (!filenameValid && nameApproved && correctedName) {
        fileToUpload = renameFile(selectedFile, correctedName);
      }
      const formData = new FormData();
      formData.append("file", fileToUpload);
      const res = await fetch(`/api/projects/${projectId}/documents/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
      const doc = await res.json();
      onDocumentAdded({ ...doc, linked: 0 });
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const canUpload = selectedFile && (filenameValid || nameApproved);

  const handleLinkSearch = useCallback(async () => {
    if (!linkQuery.trim() || !token) return;
    setLinkSearching(true);
    try {
      const data = await api.get<DriveSearchResult[]>(
        `/api/documents/drive-search?q=${encodeURIComponent(linkQuery)}`,
        token
      );
      setLinkResults(data);
    } catch {
      setLinkResults([]);
    } finally {
      setLinkSearching(false);
    }
  }, [linkQuery, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (linkQuery.trim()) handleLinkSearch();
      else setLinkResults([]);
    }, 400);
    return () => clearTimeout(timer);
  }, [linkQuery]);

  const handleLinkDocument = async (file: DriveSearchResult) => {
    if (!token) return;
    setLinking(true);
    try {
      const data = await api.post<{ documentId: string }>(`/api/projects/${projectId}/documents/link`, {
        driveFileId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
      }, token);
      onDocumentLinked({
        id: data.documentId,
        driveFileId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: 0,
        category: "08",
        webViewLink: file.webViewLink,
        createdAt: new Date().toISOString(),
        linked: 1,
      });
    } catch {
    } finally {
      setLinking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-lg shadow-xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold text-navy">Add Document</h3>
          <button
            onClick={onClose}
            className="text-foreground-faint hover:text-foreground-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b">
          <button
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors ${
              tab === "upload"
                ? "border-sky text-sky"
                : "border-transparent text-muted-foreground hover:text-foreground-label"
            }`}
            onClick={() => setTab("upload")}
          >
            <Upload className="w-4 h-4 inline mr-1.5" />
            Upload
          </button>
          <button
            className={`flex-1 py-2.5 text-sm font-medium text-center border-b-2 transition-colors ${
              tab === "link"
                ? "border-sky text-sky"
                : "border-transparent text-muted-foreground hover:text-foreground-label"
            }`}
            onClick={() => setTab("link")}
          >
            <Link2 className="w-4 h-4 inline mr-1.5" />
            Link Existing
          </button>
        </div>

        <div className="p-4">
          {tab === "upload" && (
            <>
              {!connected ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                  <p className="text-amber-700 font-medium">
                    Google Drive Not Connected
                  </p>
                  <p className="text-amber-600 text-sm mt-1">
                    Connect Google Drive in admin settings to enable file
                    uploads.
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                      dragOver ? "border-sky bg-sky/5" : "border-border"
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                  >
                    {selectedFile ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-center gap-2">
                          {getMimeIcon(selectedFile.type)}
                          <span className="font-medium text-navy">
                            {selectedFile.name}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(selectedFile.size)}
                        </p>
                        <button
                          onClick={() => { setSelectedFile(null); setCorrectedName(""); setNameApproved(false); setEditingName(false); }}
                          className="text-xs text-sky hover:text-navy"
                        >
                          Choose different file
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Upload className="w-8 h-8 text-foreground-faint mx-auto" />
                        <p className="text-foreground-secondary">
                          Drag and drop a file here, or
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Choose File
                        </Button>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onFileSelected(file);
                      }}
                    />
                  </div>

                  {selectedFile && filenameValid && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span>Name OK — follows the YYYY-MM-DD_Name convention</span>
                    </div>
                  )}

                  {selectedFile && !filenameValid && !nameApproved && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm space-y-3">
                      <div className="flex items-start gap-2 text-amber-700">
                        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>Filename doesn't follow the YYYY-MM-DD_Name convention</span>
                      </div>
                      <div className="text-xs space-y-1">
                        <p className="text-amber-600">Original: <span className="font-mono">{selectedFile.name}</span></p>
                        <p className="text-amber-800 font-medium">
                          Suggested: {editingName ? (
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && editName.trim()) {
                                  const sanitized = isValidFilename(editName.trim()) ? editName.trim() : generateCorrectedFilename(editName.trim());
                                  setCorrectedName(sanitized);
                                  setEditingName(false);
                                }
                              }}
                              className="inline-block font-mono px-1.5 py-0.5 border border-amber-300 rounded text-sm bg-white w-full mt-1"
                              autoFocus
                            />
                          ) : (
                            <span className="font-mono">{correctedName}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => { setNameApproved(true); }}
                        >
                          Use suggested name
                        </Button>
                        {!editingName ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => { setEditName(correctedName); setEditingName(true); }}
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => {
                              if (editName.trim()) {
                                const sanitized = isValidFilename(editName.trim()) ? editName.trim() : generateCorrectedFilename(editName.trim());
                                setCorrectedName(sanitized);
                              }
                              setEditingName(false);
                            }}
                          >
                            Confirm edit
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => { setCorrectedName(""); setNameApproved(true); }}
                        >
                          Keep original
                        </Button>
                      </div>
                    </div>
                  )}

                  {selectedFile && !filenameValid && nameApproved && correctedName && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      <span>Will upload as: <span className="font-mono font-medium">{correctedName}</span></span>
                    </div>
                  )}

                  {!selectedFile && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Files should follow the naming convention: <span className="font-mono text-foreground-secondary">YYYY-MM-DD_Document_Name</span>
                    </p>
                  )}

                  {uploadError && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {uploadError}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {tab === "link" && (
            <>
              {!connected ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                  <p className="text-amber-700 font-medium">
                    Google Drive Not Connected
                  </p>
                  <p className="text-amber-600 text-sm mt-1">
                    Connect Google Drive to search and link existing files.
                  </p>
                </div>
              ) : (
                <>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-faint" />
                    <input
                      type="text"
                      value={linkQuery}
                      onChange={(e) => setLinkQuery(e.target.value)}
                      placeholder="Search Google Drive..."
                      className="w-full pl-10 pr-4 py-2 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                    />
                  </div>
                  {linkSearching && (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky mx-auto" />
                    </div>
                  )}
                  {!linkSearching && linkResults.length > 0 && (
                    <div className="max-h-60 overflow-y-auto border border-border-subtle rounded-lg">
                      {linkResults.map((file) => (
                        <button
                          key={file.id}
                          onClick={() => handleLinkDocument(file)}
                          disabled={linking}
                          className="w-full text-left px-4 py-3 hover:bg-background border-b border-border-faint last:border-0 flex items-center gap-2"
                        >
                          {getMimeIcon(file.mimeType)}
                          <span className="text-sm font-medium text-navy truncate">
                            {file.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!linkSearching &&
                    linkQuery.trim() &&
                    linkResults.length === 0 && (
                      <p className="text-muted-foreground text-sm text-center py-4">
                        No files found
                      </p>
                    )}
                </>
              )}
            </>
          )}
        </div>

        {tab === "upload" && connected && (
          <div className="flex justify-end gap-3 p-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={uploading}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!canUpload || uploading}
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
