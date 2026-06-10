import { useEffect, useState } from "react";
import { useToggleSelection } from "@/hooks/useToggleSelection";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Plus, Pencil, Trash2, X, Search, Download, Users, CheckSquare, Camera } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { PhotoUploadDialog } from "@/components/PhotoUploadDialog";

interface TidyHQGroup {
  id: string;
  label: string;
  size: number;
  description: string;
}

interface Contact {
  id: string;
  organisation: string;
  name: string;
  surname: string;
  phone: string;
  email: string;
  notes: string;
  position: string;
  isAdmin: number;
  isCommittee: number;
  isContractor: number;
  isParksVic: number;
  isSafetyCommittee: number;
  isSocialMedia: number;
  safetyOfficerType: string | null;
  soAuthorised: number;
  displayCommittee: number;
  displaySafety: number;
  fullNameDisplay: number;
  showTelegram: number;
  showPhone: number;
  showEmail: number;
  showAdminEmail: number;
  photoUrl: string | null;
  photoAuthorised: number;
  createdAt: string;
  updatedAt: string;
}

interface TidyHQContact {
  tidyhqId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  organisation: string;
}

const roleLabels: Record<string, string> = {
  isAdmin: "Admin",
  isCommittee: "Committee",
  isSafetyCommittee: "Safety Committee",
  isSocialMedia: "Social Media",
  isContractor: "Contractor",
  isParksVic: "Parks Vic",
};

const roleBadgeColors: Record<string, string> = {
  isAdmin: "bg-red-100 text-red-700",
  isCommittee: "bg-blue-100 text-blue-700",
  isSafetyCommittee: "bg-orange-100 text-orange-700",
  isSocialMedia: "bg-pink-100 text-pink-700",
  isContractor: "bg-purple-100 text-purple-700",
  isParksVic: "bg-green-100 text-green-700",
};

const emptyForm = {
  organisation: "", name: "", surname: "", phone: "", email: "", notes: "",
  isAdmin: false, isCommittee: false, isContractor: false, isParksVic: false, isSafetyCommittee: false,
  isSocialMedia: false, safetyOfficerType: null, soAuthorised: false, displayCommittee: true, displaySafety: true, fullNameDisplay: true,
  showTelegram: false, showPhone: false, showEmail: false, showAdminEmail: false, photoAuthorised: false,
  password: "",
};

type RoleKey = "isAdmin" | "isCommittee" | "isContractor" | "isParksVic" | "isSafetyCommittee" | "isSocialMedia";
const roleKeys: RoleKey[] = ["isAdmin", "isCommittee", "isSafetyCommittee", "isSocialMedia", "isContractor", "isParksVic"];

export function AdminContacts() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [showPhotoUploadDialog, setShowPhotoUploadDialog] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<{ projects: string[] } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const { selectedIds: bulkSelectedIds, setSelectedIds: setBulkSelectedIds, toggleId: toggleBulkSelect, toggleSelectAll: _toggleBulkSelectAll } = useToggleSelection<string>();
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [resetStatus, setResetStatus] = useState<{ sending: boolean; message: string; error: boolean }>({ sending: false, message: "", error: false });
  const [showTidyHQ, setShowTidyHQ] = useState(false);
  const [tidySearch, setTidySearch] = useState("");
  const [tidyResults, setTidyResults] = useState<TidyHQContact[]>([]);
  const [tidySearching, setTidySearching] = useState(false);
  const [tidyError, setTidyError] = useState("");
  const [showGroupImport, setShowGroupImport] = useState(false);
  const [showQuickImport, setShowQuickImport] = useState(false);
  const [quickImporting, setQuickImporting] = useState<string | null>(null);
  const [quickImportResult, setQuickImportResult] = useState<{ groupName: string; created: number; updated: number; skipped: number; imagesSynced: number; total: number } | null>(null);
  const [quickImportError, setQuickImportError] = useState("");
  const [tidyGroups, setTidyGroups] = useState<TidyHQGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [groupContacts, setGroupContacts] = useState<TidyHQContact[]>([]);
  const [loadingGroupContacts, setLoadingGroupContacts] = useState(false);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [contactGroupMap, setContactGroupMap] = useState<Record<string, string[]>>({});
  const { selectedIds: selectedContactIds, setSelectedIds: setSelectedContactIds, toggleId: toggleContactSelection, toggleSelectAll: _toggleContactSelectAll } = useToggleSelection<string>();
  const [importRoles, setImportRoles] = useState<Record<string, boolean>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number; total: number } | null>(null);
  const [groupError, setGroupError] = useState("");

  const fetchContacts = () => {
    api.get<{ data: Contact[] }>("/api/contacts", token)
      .then(response => { if (Array.isArray(response.data)) setContacts(response.data); })
      .catch(() => {});
  };

  const { hash } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchContacts();
  }, []);

  useEffect(() => {
    if (hash && hash.startsWith("#cont-") && contacts.length > 0) {
      const id = hash.replace("#cont-", "");
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        openEdit(contact);
      }
    }
  }, [hash, contacts]);

  const filtered = contacts.filter(c => {
    if (roleFilter !== "all") {
      if (!(c as any)[roleFilter]) return false;
    }
    if (!search) return true;
    const term = search.toLowerCase();
    return c.name.toLowerCase().includes(term) ||
      (c.surname || "").toLowerCase().includes(term) ||
      (c.organisation || "").toLowerCase().includes(term);
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const openEdit = (c: Contact) => {
    setEditingId(c.id);
    setPhotoUrl(c.photoUrl);
    setForm({
      organisation: c.organisation || "",
      name: c.name,
      surname: c.surname || "",
      phone: c.phone || "",
      email: c.email || "",
      notes: c.notes || "",
      isAdmin: !!c.isAdmin,
      isCommittee: !!c.isCommittee,
      isContractor: !!c.isContractor,
      isParksVic: !!c.isParksVic,
      isSafetyCommittee: !!c.isSafetyCommittee,
      isSocialMedia: !!c.isSocialMedia,
      safetyOfficerType: c.safetyOfficerType,
      soAuthorised: !!c.soAuthorised,
      displayCommittee: c.displayCommittee !== 0,
      displaySafety: c.displaySafety !== 0,
      fullNameDisplay: c.fullNameDisplay !== 0,
      showTelegram: !!c.showTelegram,
      showPhone: !!c.showPhone,
      showEmail: !!c.showEmail,
      showAdminEmail: !!c.showAdminEmail,
      photoAuthorised: !!c.photoAuthorised,
      password: "",
    });
    setFormError("");
    setResetStatus({ sending: false, message: "", error: false });
    setShowModal(true);
  };

  const handleSendReset = async (contactId: string) => {
    setResetStatus({ sending: true, message: "", error: false });
    try {
      const data = await api.post<{ success?: boolean; message?: string; error?: string }>("/api/auth/send-password-reset", { contactId }, token);
      if (data.success) {
        setResetStatus({ sending: false, message: data.message || "Reset email sent", error: false });
      } else {
        setResetStatus({ sending: false, message: data.error || "Failed to send", error: true });
      }
    } catch {
      setResetStatus({ sending: false, message: "Failed to send reset email", error: true });
    }
  };

  const handleSave = async () => {
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }
    if (form.isAdmin && (!form.surname.trim() || !form.phone.trim() || !form.email.trim())) {
      setFormError("Admin contacts require surname, phone, and email");
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/contacts/${editingId}` : "/api/contacts";
      const method = editingId ? "PUT" : "POST";
      const body: any = { ...form };
      if (!body.password) delete body.password;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save contact");
      setShowModal(false);
      fetchContacts();
      // Invalidate public query caches so About/Safety pages see updated data
      queryClient.invalidateQueries({ queryKey: ['contacts', 'public', 'committee'] });
      queryClient.invalidateQueries({ queryKey: ['officers'] });
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (force = false) => {
    if (!deleteTarget) return;
    setDeleteError("");
    try {
      const url = `/api/contacts/${deleteTarget.id}${force ? "?force=true" : ""}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.status === 409 && !force) {
        setDeleteWarning({ projects: data.projects });
        return;
      }
      if (!res.ok) throw new Error(data.error || "Failed to delete contact");
      setDeleteTarget(null);
      setDeleteWarning(null);
      fetchContacts();
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    }
  };

  const handlePhotoUpload = async (imageBuffer: string) => {
    if (!editingId) return;
    setPhotoLoading(true);
    try {
      const res = await fetch(`/api/contacts/${editingId}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBuffer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setPhotoUrl(data.photoUrl);
      setShowPhotoUploadDialog(false);
      toast.success("Photo uploaded successfully!");
      // Invalidate public query caches
      queryClient.invalidateQueries({ queryKey: ['contacts', 'public', 'committee'] });
      queryClient.invalidateQueries({ queryKey: ['officers'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleDeletePhoto = async () => {
    if (!editingId) return;
    setPhotoLoading(true);
    try {
      const res = await fetch(`/api/contacts/${editingId}/photo`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setPhotoUrl(null);
      toast.success("Photo deleted successfully!");
      // Invalidate public query caches
      queryClient.invalidateQueries({ queryKey: ['contacts', 'public', 'committee'] });
      queryClient.invalidateQueries({ queryKey: ['officers'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPhotoLoading(false);
    }
  };

  const searchTidyHQ = async () => {
    if (!tidySearch.trim()) return;
    setTidySearching(true);
    setTidyError("");
    setTidyResults([]);
    try {
      const data = await api.get<any[]>(`/api/contacts/tidyhq-search?q=${encodeURIComponent(tidySearch)}`, token);
      setTidyResults(data);
    } catch (e: unknown) {
      setTidyError(e instanceof Error ? e.message : String(e));
    } finally {
      setTidySearching(false);
    }
  };

  const handleQuickImport = async (groupId: string, groupName: string) => {
    setQuickImporting(groupId);
    setQuickImportError("");
    setQuickImportResult(null);
    try {
      const result = await api.post<{ created: number; updated: number; skipped: number; imagesSynced: number; total: number }>(
        "/api/contacts/tidyhq-smart-import", { groupId }, token
      );
      setQuickImportResult({ groupName, ...result });
      fetchContacts();
      queryClient.invalidateQueries({ queryKey: ['contacts', 'public', 'committee'] });
      queryClient.invalidateQueries({ queryKey: ['officers'] });
    } catch (e: unknown) {
      setQuickImportError(e instanceof Error ? e.message : `Failed to import ${groupName}`);
    } finally {
      setQuickImporting(null);
    }
  };

  const openGroupImport = async () => {
    setShowGroupImport(true);
    setSelectedGroupIds(new Set());
    setGroupContacts([]);
    setSelectedContactIds(new Set());
    setImportRoles({});
    setImportResult(null);
    setGroupError("");
    setContactsLoaded(false);
    setLoadingGroups(true);
    try {
      const data = await api.get<TidyHQGroup[]>("/api/contacts/tidyhq-groups", token);
      setTidyGroups(data);
    } catch (e: unknown) {
      setGroupError(e instanceof Error ? e.message : "Failed to load groups");
    } finally {
      setLoadingGroups(false);
    }
  };

  const toggleGroupSelection = (groupId: string | number) => {
    const gid = String(groupId);
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  };

  const loadSelectedGroupContacts = async () => {
    if (selectedGroupIds.size === 0) {
      setGroupError("Select at least one group");
      return;
    }
    setGroupContacts([]);
    setSelectedContactIds(new Set());
    setImportResult(null);
    setGroupError("");
    setLoadingGroupContacts(true);
    try {
      const allContacts: TidyHQContact[] = [];
      const seen = new Set<string>();
      const cgMap: Record<string, string[]> = {};
      for (const gid of selectedGroupIds) {
        const group = tidyGroups.find(g => String(g.id) === gid);
        const groupLabel = group?.label || gid;
        const data = await api.get<any[]>(`/api/contacts/tidyhq-groups/${gid}/contacts`, token);
        for (const c of data) {
          if (!seen.has(c.tidyhqId)) {
            seen.add(c.tidyhqId);
            allContacts.push(c);
            cgMap[c.tidyhqId] = [groupLabel];
          } else {
            cgMap[c.tidyhqId].push(groupLabel);
          }
        }
      }
      allContacts.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
      setGroupContacts(allContacts);
      setSelectedContactIds(new Set(allContacts.map(c => c.tidyhqId)));
      setContactGroupMap(cgMap);
      setContactsLoaded(true);
    } catch (e: unknown) {
      setGroupError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingGroupContacts(false);
    }
  };

  const toggleSelectAll = () => _toggleContactSelectAll(groupContacts.map(c => c.tidyhqId));

  const handleGroupImport = async () => {
    const selected = groupContacts.filter(c => selectedContactIds.has(c.tidyhqId));
    if (selected.length === 0) {
      setGroupError("No contacts selected");
      return;
    }
    setImporting(true);
    setGroupError("");
    try {
      const selectedGroups = tidyGroups.filter(g => selectedGroupIds.has(String(g.id)));
      let totalCreated = 0, totalUpdated = 0, totalSkipped = 0;

      if (selectedGroups.length <= 1) {
        const groupName = selectedGroups[0]?.label || "";
        const data = await api.post<{ created: number; updated: number; skipped: number }>("/api/contacts/tidyhq-import-group", { contacts: selected, roles: importRoles, groupName }, token);
        totalCreated = data.created;
        totalUpdated = data.updated;
        totalSkipped = data.skipped;
      } else {
        for (const group of selectedGroups) {
          const groupContactTids = new Set(
            Object.entries(contactGroupMap)
              .filter(([, labels]) => labels.includes(group.label))
              .map(([tid]) => tid)
          );
          const groupSelected = selected.filter(c => groupContactTids.has(String(c.tidyhqId)));
          if (groupSelected.length === 0) continue;
          const data = await api.post<{ created: number; updated: number; skipped: number }>("/api/contacts/tidyhq-import-group", { contacts: groupSelected, roles: importRoles, groupName: group.label }, token);
          totalCreated += data.created;
          totalUpdated += data.updated;
          totalSkipped += data.skipped;
        }
      }

      setImportResult({ created: totalCreated, updated: totalUpdated, skipped: totalSkipped, total: selected.length });
      toast.success("Contacts imported");
      fetchContacts();
    } catch (e: unknown) {
      setGroupError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const toggleBulkSelectAll = () => _toggleBulkSelectAll(filtered.map(c => c.id));

  const handleBulkDelete = async () => {
    if (bulkSelectedIds.size === 0) return;

    // Safety check: prevent deleting if selecting too many contacts
    const deleteCount = bulkSelectedIds.size;
    const totalContacts = contacts.length;
    const deletePercentage = (deleteCount / totalContacts) * 100;

    // Block deletion of 75%+ of all contacts or all contacts
    if (deletePercentage >= 75) {
      setDeleteError(`Cannot delete ${deleteCount} of ${totalContacts} contacts (${Math.round(deletePercentage)}%). This would remove most/all contacts. Check your filter before deleting.`);
      setShowBulkConfirm(false);
      return;
    }

    setBulkDeleting(true);
    try {
      await api.post("/api/contacts/bulk-delete", { ids: Array.from(bulkSelectedIds) }, token);
      setBulkSelectedIds(new Set());
      setBulkSelectMode(false);
      setShowBulkConfirm(false);
      toast.success(`Deleted ${deleteCount} contacts`);
      fetchContacts();
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
      setShowBulkConfirm(false);
    } finally {
      setBulkDeleting(false);
    }
  };

  const importTidyContact = (tc: TidyHQContact) => {
    setShowTidyHQ(false);
    setEditingId(null);
    setForm({
      ...emptyForm,
      name: tc.firstName,
      surname: tc.lastName,
      email: tc.email,
      phone: tc.phone,
      organisation: tc.organisation || "",
    });
    setFormError("");
    setShowModal(true);
  };

  const getContactRoles = (c: Contact): RoleKey[] => {
    return roleKeys.filter(key => (c as any)[key]);
  };

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-navy transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-navy mb-2">Admin Contacts</h1>
              <p className="text-muted-foreground">Manage contacts, admin users, safety officers, and stakeholders in one place.</p>
            </div>
            <div className="flex gap-2">
              {bulkSelectMode ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => { setBulkSelectMode(false); setBulkSelectedIds(new Set()); }}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white"
                    disabled={bulkSelectedIds.size === 0}
                    onClick={() => setShowBulkConfirm(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete {bulkSelectedIds.size > 0 ? `${bulkSelectedIds.size} Selected` : "Selected"}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => { setBulkSelectMode(true); setBulkSelectedIds(new Set()); }}>
                    <CheckSquare className="w-4 h-4 mr-2" /> Bulk Select
                  </Button>
                  <Button variant="outline" onClick={() => { setShowQuickImport(true); setQuickImportResult(null); setQuickImportError(""); }}>
                    <Users className="w-4 h-4 mr-2" /> Imp Committees
                  </Button>
                  <Button variant="outline" onClick={openGroupImport}>
                    <Users className="w-4 h-4 mr-2" /> Imp THQ Group
                  </Button>
                  <Button variant="outline" onClick={() => { setShowTidyHQ(true); setTidySearch(""); setTidyResults([]); setTidyError(""); }}>
                    <Download className="w-4 h-4 mr-2" /> Imp from THQ
                  </Button>
                  <Button onClick={openAdd} className="bg-navy hover:bg-navy-light text-white">
                    <Plus className="w-4 h-4 mr-2" /> Contact
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-faint" />
            <input
              type="text"
              placeholder="Search by name or organisation..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
            />
          </div>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="border border-border rounded-md px-3 py-2 focus:ring-1 focus:ring-sky focus:border-sky text-sm"
          >
            <option value="all">All Contacts</option>
            {roleKeys.map(key => (
              <option key={key} value={key}>{roleLabels[key]}</option>
            ))}
          </select>
        </div>

        <div className="bg-card rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted border-b border-border-subtle">
                  {bulkSelectMode && (
                    <th className="p-3 w-10">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && bulkSelectedIds.size === filtered.length}
                        onChange={toggleBulkSelectAll}
                        className="rounded border-border text-sky focus:ring-sky"
                      />
                    </th>
                  )}
                  <th className="p-3 font-semibold text-navy text-sm w-[15%]">Name</th>
                  <th className="p-3 font-semibold text-navy text-sm w-[14%]">Organisation</th>
                  <th className="p-3 font-semibold text-navy text-sm w-[14%]">Phone</th>
                  <th className="p-3 font-semibold text-navy text-sm w-[20%]">Email</th>
                  <th className="p-3 font-semibold text-navy text-sm w-[12%]">Roles</th>
                  {!bulkSelectMode && <th className="p-3 font-semibold text-navy text-sm text-right w-[15%]">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className={`border-b border-border-faint hover:bg-background ${bulkSelectMode && bulkSelectedIds.has(c.id) ? "bg-red-50" : ""}`}>
                    {bulkSelectMode && (
                      <td className="p-3 w-10">
                        <input
                          type="checkbox"
                          checked={bulkSelectedIds.has(c.id)}
                          onChange={() => toggleBulkSelect(c.id)}
                          className="rounded border-border text-sky focus:ring-sky"
                        />
                      </td>
                    )}
                    <td className="p-3">
                      <div className="font-medium text-navy">{c.name}{c.surname ? ` ${c.surname}` : ""}</div>
                      {c.position && <div className="text-xs text-muted-foreground">{c.position}</div>}
                    </td>
                    <td className="p-3 text-foreground-label text-sm">{c.organisation || "—"}</td>
                    <td className="p-3 text-foreground-secondary text-sm whitespace-nowrap">{c.phone || "—"}</td>
                    <td className="p-3 text-foreground-secondary text-sm">{c.email || "—"}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {getContactRoles(c).map(role => (
                          <span key={role} className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${roleBadgeColors[role]}`}>
                            {roleLabels[role]}
                          </span>
                        ))}
                      </div>
                    </td>
                    {!bulkSelectMode && (
                      <td className="p-3 text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                          <Pencil className="w-4 h-4 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => { setDeleteTarget(c); setDeleteWarning(null); setDeleteError(""); }}
                        >
                          <Trash2 className="w-4 h-4 mr-1" /> Delete
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      {search || roleFilter !== "all" ? "No contacts match your filters." : "No contacts yet. Click \"Add Contact\" to get started."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-navy">{editingId ? "Edit Contact" : "Add Contact"}</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>
            <div className="space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">First Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                    placeholder="First name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">
                    Surname *
                  </label>
                  <input
                    type="text"
                    value={form.surname}
                    onChange={e => setForm(prev => ({ ...prev, surname: e.target.value }))}
                    className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                    placeholder="Surname"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground-label mb-1">Organisation</label>
                <input
                  type="text"
                  value={form.organisation}
                  onChange={e => setForm(prev => ({ ...prev, organisation: e.target.value }))}
                  className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                  placeholder="Organisation name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">
                    Phone *
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                    placeholder="Phone number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                    placeholder="email@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground-label mb-2">Roles</label>
                <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                  {roleKeys.map(key => {
                    const hasDisplay = key === "isCommittee" || key === "isSafetyCommittee";
                    const displayKey = key === "isCommittee" ? "displayCommittee" : "displaySafety";
                    const isChecked = (form as any)[key];
                    return (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={key === "isAdmin" && form.isCommittee}
                            onChange={e => {
                              const checked = e.target.checked;
                              if (key === "isCommittee") {
                                setForm(prev => ({ ...prev, isCommittee: checked, ...(checked ? { isAdmin: true, photoAuthorised: true } : {}) }));
                              } else if (key === "isSafetyCommittee") {
                                setForm(prev => ({ ...prev, isSafetyCommittee: checked, ...(checked ? { photoAuthorised: true } : {}) }));
                              } else {
                                setForm(prev => ({ ...prev, [key]: checked }));
                              }
                            }}
                            className="rounded border-border text-sky focus:ring-sky"
                          />
                          {roleLabels[key]}
                        </label>
                        {hasDisplay && isChecked && (
                          <label className="flex items-center gap-1 cursor-pointer text-xs text-muted-foreground ml-1" title="Show on public pages">
                            <input
                              type="checkbox"
                              checked={(form as any)[displayKey]}
                              onChange={e => setForm(prev => ({ ...prev, [displayKey]: e.target.checked }))}
                              className="rounded border-border text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                            />
                            Display
                          </label>
                        )}
                      </div>
                    );
                  })}
                  {(form.isCommittee || form.isSafetyCommittee) && (
                    <div className="col-span-3 mt-2 pt-2 border-t border-border-faint">
                      <p className="text-xs text-muted-foreground mb-1">Reveal Contact options (shown when someone clicks "Reveal Contact")</p>
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-1 cursor-pointer text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={form.fullNameDisplay}
                            onChange={e => setForm(prev => ({ ...prev, fullNameDisplay: e.target.checked }))}
                            className="rounded border-border text-sky focus:ring-sky h-3.5 w-3.5"
                          />
                          Full Name Disp
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={form.photoAuthorised}
                            onChange={e => setForm(prev => ({ ...prev, photoAuthorised: e.target.checked }))}
                            className="rounded border-border text-sky focus:ring-sky h-3.5 w-3.5"
                          />
                          Allow self-upload photo
                        </label>
                        <div className="flex gap-4">
                          {([["showTelegram", "Show Telegram"], ["showPhone", "Show Phone"], ["showEmail", "Show Personal Email"], ["showAdminEmail", "Via Admin Email"]] as const).map(([field, label]) => (
                            <label key={field} className="flex items-center gap-1 cursor-pointer text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={form[field]}
                                onChange={e => setForm(prev => ({ ...prev, [field]: e.target.checked }))}
                                className="rounded border-border text-sky focus:ring-sky h-3.5 w-3.5"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {form.isSafetyCommittee && (
                    <div className="col-span-3 mt-2 pt-2 border-t border-border-faint space-y-2">
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={form.soAuthorised}
                            onChange={e => setForm(prev => ({ ...prev, soAuthorised: e.target.checked }))}
                            className="rounded border-border text-amber-600 focus:ring-amber-500"
                          />
                          <span className="text-amber-800">SO Site Access</span>
                        </label>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground-label mb-1">Officer Type</label>
                        <select
                          value={form.safetyOfficerType || ""}
                          onChange={e => setForm(prev => ({ ...prev, safetyOfficerType: e.target.value || null }))}
                          className="w-full p-2 text-sm border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                        >
                          <option value="">Select Type...</option>
                          <option value="SSO">Senior Safety Officer (SSO)</option>
                          <option value="SO">Safety Officer (SO)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {(form.isAdmin || (form.isSafetyCommittee && form.soAuthorised)) && (
                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">
                    {editingId ? "New Password (leave blank to keep current)" : "Password *"}
                  </label>
                  <input
                    type="text"
                    value={form.password}
                    onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                    placeholder={editingId ? "Leave blank to keep current password" : "Optional — set password or use password reset later"}
                    autoComplete="new-password"
                  />
                </div>
              )}

              {editingId && form.email && (form.isAdmin || form.isCommittee || form.isSafetyCommittee) && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-sky-800">Password Reset</p>
                      <p className="text-xs text-sky-600 mt-0.5">Send a reset link to {form.email}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-sky-300 text-sky-700 hover:bg-sky-100"
                      disabled={resetStatus.sending}
                      onClick={() => handleSendReset(editingId)}
                    >
                      {resetStatus.sending ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-700" />
                      ) : (
                        "Send Reset Email"
                      )}
                    </Button>
                  </div>
                  {resetStatus.message && (
                    <p className={`text-xs mt-2 ${resetStatus.error ? "text-red-600" : "text-green-600"}`}>
                      {resetStatus.message}
                    </p>
                  )}
                </div>
              )}

              {editingId && (form.isCommittee || form.isSafetyCommittee) && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Camera className="w-5 h-5 text-purple-600" />
                      <h4 className="text-sm font-medium text-purple-800">Photo</h4>
                    </div>
                    {photoUrl && (
                      <img
                        src={photoUrl}
                        alt={form.name}
                        className="w-12 h-12 rounded-lg object-cover border border-border"
                      />
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!photoUrl ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={photoLoading}
                        onClick={() => setShowPhotoUploadDialog(true)}
                      >
                        <Camera className="w-4 h-4 mr-2" /> Upload Photo
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={photoLoading}
                          onClick={() => setShowPhotoUploadDialog(true)}
                        >
                          <Camera className="w-4 h-4 mr-2" /> Replace
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={photoLoading}
                          onClick={handleDeletePhoto}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground-label mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                  rows={3}
                  placeholder="Any additional notes..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button
                  className="bg-navy hover:bg-navy-light text-white"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Add Contact"}
                </Button>
              </div>
            </div>
          </div>

          <PhotoUploadDialog
            isOpen={showPhotoUploadDialog}
            onClose={() => setShowPhotoUploadDialog(false)}
            onUpload={handlePhotoUpload}
            isLoading={photoLoading}
            contactName={form.name}
          />
        </div>
      )}

      {showTidyHQ && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-navy">Import from TidyHQ</h3>
              <button onClick={() => setShowTidyHQ(false)} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Search TidyHQ contacts by name to pre-fill a new contact.</p>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={tidySearch}
                onChange={e => setTidySearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && searchTidyHQ()}
                className="flex-1 p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                placeholder="Search by name..."
              />
              <Button onClick={searchTidyHQ} disabled={tidySearching} className="bg-navy hover:bg-navy-light text-white">
                {tidySearching ? "Searching..." : "Search"}
              </Button>
            </div>
            {tidyError && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm mb-4">{tidyError}</div>
            )}
            {tidyResults.length > 0 && (
              <div className="space-y-2">
                {tidyResults.map(tc => (
                  <div
                    key={tc.tidyhqId}
                    className="p-3 border border-border-subtle rounded-lg hover:bg-sky-50 cursor-pointer transition-colors"
                    onClick={() => importTidyContact(tc)}
                  >
                    <div className="font-medium text-navy">{tc.displayName}</div>
                    <div className="text-sm text-muted-foreground">
                      {tc.email && <span className="mr-4">{tc.email}</span>}
                      {tc.phone && <span>{tc.phone}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!tidySearching && tidyResults.length === 0 && tidySearch && !tidyError && (
              <p className="text-sm text-foreground-faint text-center py-4">No results. Try a different name.</p>
            )}
          </div>
        </div>
      )}

      {showQuickImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-navy">Quick Import from TidyHQ</h3>
              <button onClick={() => setShowQuickImport(false)} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>

            {quickImportError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{quickImportError}</div>
            )}

            {quickImportResult ? (
              <div>
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                  <p className="text-green-800 font-semibold mb-2">{quickImportResult.groupName} imported</p>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div><div className="text-2xl font-bold text-green-700">{quickImportResult.created}</div><div className="text-sm text-green-600">Created</div></div>
                    <div><div className="text-2xl font-bold text-blue-700">{quickImportResult.updated}</div><div className="text-sm text-blue-600">Updated</div></div>
                    <div><div className="text-2xl font-bold text-gray-500">{quickImportResult.skipped}</div><div className="text-sm text-gray-500">Skipped</div></div>
                    <div><div className="text-2xl font-bold text-purple-700">{quickImportResult.imagesSynced}</div><div className="text-sm text-purple-600">Photos Synced</div></div>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setQuickImportResult(null)}>Import Another</Button>
                  <Button onClick={() => setShowQuickImport(false)} className="bg-navy hover:bg-navy-light text-white">Done</Button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Fetches contacts directly from TidyHQ, auto-detects all roles from embedded group memberships, and syncs profile photos.
                </p>
                <div className="flex flex-col gap-3">
                  <Button
                    className="bg-navy hover:bg-navy-light text-white justify-start"
                    disabled={!!quickImporting}
                    onClick={() => handleQuickImport("143877", "Safety Committee")}
                  >
                    {quickImporting === "143877" ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" /> Importing Safety Committee...</>
                    ) : (
                      <><Users className="w-4 h-4 mr-2" /> Import Safety Committee</>
                    )}
                  </Button>
                  <Button
                    className="bg-navy hover:bg-navy-light text-white justify-start"
                    disabled={!!quickImporting}
                    onClick={() => handleQuickImport("139632", "Skyhigh Committee")}
                  >
                    {quickImporting === "139632" ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" /> Importing Skyhigh Committee...</>
                    ) : (
                      <><Users className="w-4 h-4 mr-2" /> Import Skyhigh Committee</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showGroupImport && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-navy">
                {importResult ? "Import Complete" : contactsLoaded ? `${groupContacts.length} Contacts from ${selectedGroupIds.size} Group${selectedGroupIds.size !== 1 ? "s" : ""}` : "Import from TidyHQ Group"}
              </h3>
              <button onClick={() => setShowGroupImport(false)} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>

            {groupError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">{groupError}</div>
            )}

            {importResult ? (
              <div>
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                  <p className="text-green-800 font-semibold text-lg mb-2">
                    {importResult.total} contacts imported
                  </p>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-green-700">{importResult.created}</div>
                      <div className="text-sm text-green-600">Created</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-700">{importResult.updated}</div>
                      <div className="text-sm text-blue-600">Updated</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-500">{importResult.skipped}</div>
                      <div className="text-sm text-gray-500">Skipped</div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => setShowGroupImport(false)} className="bg-navy hover:bg-navy-light text-white">
                    Done
                  </Button>
                </div>
              </div>
            ) : !contactsLoaded ? (
              <div>
                <p className="text-sm text-muted-foreground mb-4">Select one or more TidyHQ groups to import contacts from.</p>
                {loadingGroups ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky" />
                  </div>
                ) : loadingGroupContacts ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky" />
                    <p className="text-sm text-muted-foreground">Loading contacts from {selectedGroupIds.size} group{selectedGroupIds.size !== 1 ? "s" : ""}...</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 mb-4">
                      {tidyGroups.map(group => (
                        <label
                          key={group.id}
                          className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${selectedGroupIds.has(String(group.id)) ? "border-sky bg-sky-50" : "border-border-subtle hover:bg-sky-50"}`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedGroupIds.has(String(group.id))}
                            onChange={() => toggleGroupSelection(group.id)}
                            className="rounded border-border text-sky focus:ring-sky"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-navy">{group.label}</div>
                            {group.description && <div className="text-xs text-muted-foreground">{group.description}</div>}
                          </div>
                          <span className="text-sm text-muted-foreground">{group.size} members</span>
                        </label>
                      ))}
                      {tidyGroups.length === 0 && !groupError && (
                        <p className="text-center text-muted-foreground py-4">No groups found.</p>
                      )}
                    </div>
                    {tidyGroups.length > 0 && (
                      <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setShowGroupImport(false)}>Cancel</Button>
                        <Button
                          className="bg-navy hover:bg-navy-light text-white"
                          onClick={loadSelectedGroupContacts}
                          disabled={selectedGroupIds.size === 0}
                        >
                          Load {selectedGroupIds.size > 0 ? `${selectedGroupIds.size} Group${selectedGroupIds.size !== 1 ? "s" : ""}` : "Contacts"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div>
                <Button variant="outline" size="sm" className="mb-4" onClick={() => { setContactsLoaded(false); setGroupContacts([]); }}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back to Groups
                </Button>

                {loadingGroupContacts ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky" />
                  </div>
                ) : (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-foreground-label mb-2">Apply role flags to imported contacts:</label>
                      <div className="flex flex-wrap gap-3">
                        {roleKeys.filter(k => k !== "isAdmin").map(key => (
                          <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!importRoles[key]}
                              onChange={e => setImportRoles(prev => ({ ...prev, [key]: e.target.checked }))}
                              className="rounded border-border text-sky focus:ring-sky"
                            />
                            {roleLabels[key]}
                          </label>
                        ))}
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!importRoles["isPosition"]}
                            onChange={e => setImportRoles(prev => ({ ...prev, isPosition: e.target.checked }))}
                            className="rounded border-border text-sky focus:ring-sky"
                          />
                          Position Title
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedContactIds.size === groupContacts.length && groupContacts.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-border text-sky focus:ring-sky"
                        />
                        Select All ({selectedContactIds.size}/{groupContacts.length})
                      </label>
                    </div>

                    <div className="border border-border rounded-lg max-h-[300px] overflow-y-auto mb-4">
                      {groupContacts.map(tc => (
                        <label
                          key={tc.tidyhqId}
                          className="flex items-center gap-3 p-3 border-b border-border-faint last:border-0 hover:bg-sky-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedContactIds.has(tc.tidyhqId)}
                            onChange={() => toggleContactSelection(tc.tidyhqId)}
                            className="rounded border-border text-sky focus:ring-sky"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-navy text-sm">{tc.displayName}</div>
                            <div className="text-xs text-muted-foreground">
                              {tc.email && <span className="mr-3">{tc.email}</span>}
                              {tc.phone && <span>{tc.phone}</span>}
                            </div>
                            {selectedGroupIds.size > 1 && contactGroupMap[tc.tidyhqId] && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {contactGroupMap[tc.tidyhqId].map(g => (
                                  <span key={g} className="inline-block px-1.5 py-0.5 bg-sky-100 text-sky-700 text-[10px] rounded">{g}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </label>
                      ))}
                      {groupContacts.length === 0 && (
                        <p className="p-4 text-center text-muted-foreground text-sm">No contacts in this group.</p>
                      )}
                    </div>

                    <div className="flex justify-end gap-3">
                      <Button variant="outline" onClick={() => setShowGroupImport(false)}>Cancel</Button>
                      <Button
                        className="bg-navy hover:bg-navy-light text-white"
                        onClick={handleGroupImport}
                        disabled={importing || selectedContactIds.size === 0}
                      >
                        {importing ? "Importing..." : `Import ${selectedContactIds.size} Contact${selectedContactIds.size !== 1 ? "s" : ""}`}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-navy">Delete Contact</h3>
              <button onClick={() => { setDeleteTarget(null); setDeleteWarning(null); }} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>
            {deleteWarning ? (
              <>
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                  <p className="font-semibold mb-1">This contact is linked to {deleteWarning.projects.length} project(s):</p>
                  <ul className="list-disc list-inside">
                    {deleteWarning.projects.map((name, i) => (
                      <li key={i}>{name}</li>
                    ))}
                  </ul>
                  <p className="mt-2">Deleting will also remove the contact from these projects.</p>
                </div>
                {deleteError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{deleteError}</div>
                )}
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteWarning(null); }}>Cancel</Button>
                  <Button
                    className="bg-red-500 hover:bg-red-600 text-white"
                    onClick={() => handleDelete(true)}
                  >
                    Delete Anyway
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-foreground-secondary mb-6">Are you sure you want to delete <strong>{deleteTarget.name}{deleteTarget.surname ? ` ${deleteTarget.surname}` : ""}</strong>? This action cannot be undone.</p>
                {deleteError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{deleteError}</div>
                )}
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                  <Button
                    className="bg-red-500 hover:bg-red-600 text-white"
                    onClick={() => handleDelete(false)}
                  >
                    Delete Contact
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showBulkConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-navy">Delete {bulkSelectedIds.size} Contacts</h3>
              <button onClick={() => setShowBulkConfirm(false)} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>
            <p className="text-foreground-secondary mb-2">
              Are you sure you want to delete <strong>{bulkSelectedIds.size} contact{bulkSelectedIds.size !== 1 ? "s" : ""}</strong>? This action cannot be undone.
            </p>
            {bulkSelectedIds.size > 10 && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
                ⚠️ You are deleting {bulkSelectedIds.size} contacts ({Math.round((bulkSelectedIds.size / contacts.length) * 100)}% of all contacts). Please verify the list below is correct.
              </div>
            )}
            <div className="mb-4 max-h-[200px] overflow-y-auto border border-border rounded-lg">
              {filtered.filter(c => bulkSelectedIds.has(c.id)).map(c => (
                <div key={c.id} className="px-3 py-2 border-b border-border-faint last:border-0 text-sm">
                  <span className="font-medium text-navy">{c.name}{c.surname ? ` ${c.surname}` : ""}</span>
                  {c.email && <span className="text-muted-foreground ml-2">({c.email})</span>}
                </div>
              ))}
            </div>
            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{deleteError}</div>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowBulkConfirm(false)}>Cancel</Button>
              <Button
                className="bg-red-500 hover:bg-red-600 text-white"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? "Deleting..." : `Delete ${bulkSelectedIds.size} Contact${bulkSelectedIds.size !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
