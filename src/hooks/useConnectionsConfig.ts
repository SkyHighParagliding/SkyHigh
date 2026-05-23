import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useAdminForm } from "@/hooks/useAdminForm";

export function useConnectionsConfig() {
  const { token } = useAuth();
  const { settings, refreshSettings } = useSettings();
  const location = useLocation();
  const clubName = settings.clubName || "SkyHigh";

  const [driveScriptUrl, setDriveScriptUrl] = useState("");
  const [driveScriptDraft, setDriveScriptDraft] = useState("");
  const [editingDriveScript, setEditingDriveScript] = useState(false);
  const [savingDriveScript, setSavingDriveScript] = useState(false);
  const [driveScriptSaved, setDriveScriptSaved] = useState(false);
  const [testingDrive, setTestingDrive] = useState(false);
  const [driveTestResult, setDriveTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetDraft, setSheetDraft] = useState("");
  const [editingSheet, setEditingSheet] = useState(false);
  const [savingSheet, setSavingSheet] = useState(false);
  const [sheetSaved, setSheetSaved] = useState(false);
  const [assetScriptUrl, setAssetScriptUrl] = useState("");
  const [assetScriptDraft, setAssetScriptDraft] = useState("");
  const [editingAssetScript, setEditingAssetScript] = useState(false);
  const [savingAssetScript, setSavingAssetScript] = useState(false);
  const [assetScriptSaved, setAssetScriptSaved] = useState(false);
  const [testingSheet, setTestingSheet] = useState(false);
  const [sheetTestResult, setSheetTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [driveConnected, setDriveConnected] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [showDriveScript, setShowDriveScript] = useState(false);
  const [driveScriptContent, setDriveScriptContent] = useState("");
  const [scriptCopied, setScriptCopied] = useState(false);
  const [showAssetScript, setShowAssetScript] = useState(false);
  const [assetScriptContent, setAssetScriptContent] = useState("");
  const [assetScriptCopied, setAssetScriptCopied] = useState(false);

  const [settingUpFolders, setSettingUpFolders] = useState(false);
  const [folderSetupResult, setFolderSetupResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [folderSetupRootUrl, setFolderSetupRootUrl] = useState<string | null>(null);

  const [indexStatus, setIndexStatus] = useState<{
    totalDocuments: number;
    readableDocuments: number;
    lastIndexedAt: string | null;
    documents: { driveFileId: string; name: string; category: string; mimeType: string; charCount: number; readable: number; indexedAt: string }[];
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [tidyhqStatus, setTidyhqStatus] = useState<{ hasToken: boolean; hasSigningKey: boolean; mappingCount: number; recentWebhooks: number; connected: boolean } | null>(null);
  const [testingTidyhq, setTestingTidyhq] = useState(false);
  const [tidyhqTestResult, setTidyhqTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [groupSyncExpanded, setGroupSyncExpanded] = useState(false);
  const [groupMappings, setGroupMappings] = useState<{ id: number; tidyhqGroupId: string; tidyhqGroupName: string; localRoleFlag: string; createdAt: string }[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<{ id: number; eventType: string; tidyhqContactId: string; tidyhqGroupId: string; tidyhqGroupName: string; localContactId: string; localContactName: string; roleFlag: string; action: string; detail: string; createdAt: string }[]>([]);
  const [tidyhqGroups, setTidyhqGroups] = useState<{ id: string; label: string; size: number; description: string }[]>([]);
  const [loadingTidyhqGroups, setLoadingTidyhqGroups] = useState(false);
  const [showAddMapping, setShowAddMapping] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [addMappingError, setAddMappingError] = useState("");
  const [savingMapping, setSavingMapping] = useState(false);

  const [bulkUploadLimit, setBulkUploadLimit] = useState(20);
  const [bulkUploadLimitDraft, setBulkUploadLimitDraft] = useState(20);
  const [savingBulkLimit, setSavingBulkLimit] = useState(false);
  const [bulkLimitSaved, setBulkLimitSaved] = useState(false);

  const [saDisclaimer, setSaDisclaimer] = useState("General information only. Consult SAFA/CASA docs and Site Rules.");
  const [saCommitteeLink, setSaCommitteeLink] = useState("");
  const [saCtaMessage, setSaCtaMessage] = useState("");
  const [saCtaFrequency, setSaCtaFrequency] = useState("2");
  const [saPrompt, setSaPrompt] = useState("");
  const [saDefaultPrompt, setSaDefaultPrompt] = useState("");
  const [saShowPrompt, setSaShowPrompt] = useState(false);
  const [saEligibilityRules, setSaEligibilityRules] = useState("");
  const [saDefaultEligibilityRules, setSaDefaultEligibilityRules] = useState("");
  const [saShowEligibilityRules, setSaShowEligibilityRules] = useState(false);
  const [saSaveMsg, setSaSaveMsg] = useState<{ type: string; text: string } | null>(null);
  const { markDirty, blocker, justSaved: saJustSaved, save: adminSave } = useAdminForm({ successMessage: "Settings saved" });

  const [searchLogEnabled, setSearchLogEnabled] = useState(false);
  const [searchLogStats, setSearchLogStats] = useState<{ total: number; sizeMb: number; oldestAt: string | null; warningMb: number } | null>(null);
  const [showSearchLogs, setShowSearchLogs] = useState(false);
  const [searchLogEntries, setSearchLogEntries] = useState<{ id: number; search_type: string; query: string; response: string; created_at: string }[]>([]);
  const [searchLogPage, setSearchLogPage] = useState(1);
  const [searchLogTotal, setSearchLogTotal] = useState(0);
  const [searchLogPages, setSearchLogPages] = useState(1);
  const [searchLogType, setSearchLogType] = useState<"all" | "public" | "admin">("all");
  const [loadingSearchLogs, setLoadingSearchLogs] = useState(false);
  const [clearingSearchLogs, setClearingSearchLogs] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.drive_appscript_url) setDriveScriptUrl(data.drive_appscript_url);
        if (data.asset_sheet_url) setSheetUrl(data.asset_sheet_url);
        if (data.asset_appscript_url) setAssetScriptUrl(data.asset_appscript_url);
        const parsedLimit = parseInt(data.bulkUploadLimit || "20");
        const validLimit = isNaN(parsedLimit) ? 20 : Math.min(999, Math.max(1, parsedLimit));
        setBulkUploadLimit(validLimit);
        setBulkUploadLimitDraft(validLimit);
        setSaDisclaimer(data.publicSearchDisclaimer ?? "General information only. Consult SAFA/CASA docs and Site Rules.");
        setSaCommitteeLink(data.publicSearchCommitteeLink || "");
        setSaCtaMessage(data.publicSearchCtaMessage || "");
        setSaCtaFrequency(data.publicSearchCtaFrequency || "2");
        setSaPrompt(data.publicSearchPrompt || "");
        setSaEligibilityRules(data.publicSearchEligibilityRules || "");
      })
      .catch(() => {});

    fetch("/api/documents/status", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => { if (data.connected) setDriveConnected(true); })
      .catch(() => {});

    fetch("/api/search/public/default-prompt")
      .then(r => r.json())
      .then(d => setSaDefaultPrompt(d.prompt || ""))
      .catch(() => {});

    fetch("/api/search/public/default-eligibility-rules")
      .then(r => r.json())
      .then(d => setSaDefaultEligibilityRules(d.rules || ""))
      .catch(() => {});

    fetch("/api/tidyhq/status", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setTidyhqStatus(data))
      .catch(() => {});
  }, [token]);

  const fetchGroupMappings = () => {
    fetch("/api/tidyhq/group-mappings", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setGroupMappings(data); })
      .catch(() => {});
  };

  const fetchWebhookLogs = () => {
    fetch("/api/tidyhq/webhook-log?limit=50", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setWebhookLogs(data); })
      .catch(() => {});
  };

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace("#", "");
      setExpandedCards((prev) => new Set(prev).add(id));
      if (id === "tidyhq-group-sync") {
        setGroupSyncExpanded(true);
        fetchGroupMappings();
        fetchWebhookLogs();
      }
      setTimeout(() => {
        document.getElementById(`conn-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [location.hash]);

  const toggleExpanded = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (id === "smart-assistant") loadSearchLogStats();
      }
      return next;
    });
  };

  const saveSmartAssistant = async () => {
    setSaSaveMsg(null);
    await adminSave(async () => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          publicSearchDisclaimer: saDisclaimer,
          publicSearchCommitteeLink: saCommitteeLink,
          publicSearchPrompt: saPrompt,
          publicSearchEligibilityRules: saEligibilityRules,
          publicSearchCtaMessage: saCtaMessage,
          publicSearchCtaFrequency: saCtaFrequency,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
    });
  };

  const saveBulkUploadLimit = async () => {
    const clamped = Math.min(999, Math.max(1, bulkUploadLimitDraft || 20));
    setSavingBulkLimit(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bulkUploadLimit: String(clamped) }),
      });
      if (res.ok) {
        setBulkUploadLimit(clamped);
        setBulkUploadLimitDraft(clamped);
        setBulkLimitSaved(true);
        setTimeout(() => setBulkLimitSaved(false), 3000);
        refreshSettings();
      }
    } catch {}
    setSavingBulkLimit(false);
  };

  const saveDriveScriptUrl = async () => {
    setSavingDriveScript(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ drive_appscript_url: driveScriptDraft }),
      });
      if (res.ok) {
        setDriveScriptUrl(driveScriptDraft);
        setEditingDriveScript(false);
        setDriveScriptSaved(true);
        setTimeout(() => setDriveScriptSaved(false), 3000);
      }
    } catch {}
    setSavingDriveScript(false);
  };

  const testDriveConnection = async () => {
    setTestingDrive(true);
    setDriveTestResult(null);
    try {
      const url = driveScriptUrl || driveScriptDraft;
      if (!url) {
        setDriveTestResult({ ok: false, message: "No Apps Script URL configured" });
        setTestingDrive(false);
        return;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${url}?action=status`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        setDriveTestResult({ ok: true, message: "Connection successful — Apps Script responded" });
        setDriveConnected(true);
      } else {
        setDriveTestResult({ ok: false, message: `Apps Script returned status ${res.status}` });
      }
    } catch (e: unknown) {
      setDriveTestResult({
        ok: false,
        message: e.name === "AbortError" ? "Connection timed out (10s)" : `Connection failed: ${e.message}`,
      });
    }
    setTestingDrive(false);
  };

  const saveSheetUrl = async () => {
    setSavingSheet(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ asset_sheet_url: sheetDraft }),
      });
      if (res.ok) {
        setSheetUrl(sheetDraft);
        setEditingSheet(false);
        setSheetSaved(true);
        setTimeout(() => setSheetSaved(false), 3000);
      }
    } catch {}
    setSavingSheet(false);
  };

  const saveAssetScriptUrl = async () => {
    setSavingAssetScript(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ asset_appscript_url: assetScriptDraft }),
      });
      if (res.ok) {
        setAssetScriptUrl(assetScriptDraft);
        setEditingAssetScript(false);
        setAssetScriptSaved(true);
        setSheetTestResult(null);
        setTimeout(() => setAssetScriptSaved(false), 3000);
      }
    } catch {}
    setSavingAssetScript(false);
  };

  const testSheetConnection = async () => {
    setTestingSheet(true);
    setSheetTestResult(null);
    try {
      if (!assetScriptUrl) {
        setSheetTestResult({ ok: false, message: "No Asset Register Apps Script URL configured — set it in the Apps Script URL section above" });
        setTestingSheet(false);
        return;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${assetScriptUrl}?q=`, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.results)) {
          const tabs = new Set(data.results.map((r: Record<string, unknown>) => r._sheet).filter(Boolean));
          setSheetTestResult({
            ok: true,
            message: `Connected — ${data.results.length} rows found across ${tabs.size} tab${tabs.size !== 1 ? "s" : ""} (${[...tabs].join(", ")})`,
          });
        } else if (data.connected) {
          setSheetTestResult({ ok: false, message: "URL points to the Drive bridge script, not the Asset Register script. Deploy the Asset Register script separately on the Google Sheet." });
        } else {
          setSheetTestResult({ ok: false, message: `Script responded but returned no data (success: ${data.success})` });
        }
      } else {
        setSheetTestResult({ ok: false, message: `Script returned status ${res.status}` });
      }
    } catch (e: unknown) {
      setSheetTestResult({
        ok: false,
        message: e.name === "AbortError" ? "Connection timed out (10s)" : `Connection failed: ${e.message}`,
      });
    }
    setTestingSheet(false);
  };

  const loadIndexStatus = async () => {
    try {
      const res = await fetch("/api/documents/index/status", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setIndexStatus(data);
      }
    } catch {}
  };

  const syncDocumentIndex = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/documents/index/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const hasWarning = data.pdfErrors && data.pdfErrors.length > 0;
        setSyncResult({ ok: !hasWarning, message: data.message });
        loadIndexStatus();
      } else {
        setSyncResult({ ok: false, message: data.error || "Sync failed" });
      }
    } catch (e: unknown) {
      setSyncResult({ ok: false, message: e instanceof Error ? e.message : "Sync failed" });
    }
    setSyncing(false);
  };

  const clearDocumentIndex = async () => {
    if (!confirm("Clear document index?\n\nThis removes all indexed document text from the website database. Your Google Drive files are not affected.\n\nYou will need to click 'Sync Documents' again to re-index.")) return;
    try {
      const res = await fetch("/api/documents/index/clear", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSyncResult({ ok: true, message: "Document index cleared. Click 'Sync Documents' to re-index." });
        loadIndexStatus();
      } else {
        setSyncResult({ ok: false, message: "Failed to clear document index." });
      }
    } catch (e: unknown) {
      setSyncResult({ ok: false, message: e instanceof Error ? e.message : "Failed to clear index" });
    }
  };

  const setupDriveFolders = async () => {
    if (!driveScriptUrl) return;
    setSettingUpFolders(true);
    setFolderSetupResult(null);
    try {
      const res = await fetch(driveScriptUrl + "?action=setup");
      const data = await res.json();
      if (data.success) {
        setFolderSetupResult({
          ok: true,
          message: data.message + (data.rootFolderUrl ? ` — Root folder: ` : ""),
        });
        setFolderSetupRootUrl(data.rootFolderUrl || null);
      } else {
        setFolderSetupResult({ ok: false, message: data.error || "Setup failed" });
      }
    } catch (e: unknown) {
      setFolderSetupResult({ ok: false, message: e instanceof Error ? e.message : "Setup failed" });
    }
    setSettingUpFolders(false);
  };

  const disconnectDrive = async () => {
    if (!confirm("Disconnect Google Drive?\n\nThis will:\n• Clear the Drive bridge URL\n• Clear the document index\n\nYour Drive files are NOT deleted — only the connection is removed.")) return;
    try {
      const clearRes = await fetch("/api/documents/index/clear", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!clearRes.ok) { alert("Failed to clear document index. Please try again."); return; }
      const settingsRes = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ drive_appscript_url: "" }),
      });
      if (!settingsRes.ok) { alert("Failed to clear Drive URL. Please try again."); return; }
      setDriveScriptUrl("");
      setDriveScriptDraft("");
      setDriveConnected(false);
      setDriveTestResult(null);
      setIndexStatus(null);
      setSyncResult(null);
      setFolderSetupResult(null);
      setFolderSetupRootUrl(null);
      setEditingDriveScript(false);
    } catch (e: unknown) {
      alert("Disconnect failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  useEffect(() => {
    if (token && driveScriptUrl) loadIndexStatus();
  }, [token, driveScriptUrl]);

  const openDriveScript = async () => {
    try {
      if (!driveScriptContent) {
        const res = await fetch("/assets/drive-bridge-appscript.gs");
        const text = await res.text();
        setDriveScriptContent(text);
      }
      setScriptCopied(false);
      setShowDriveScript(true);
    } catch {}
  };

  const copyDriveScript = async () => {
    try {
      await navigator.clipboard.writeText(driveScriptContent);
      setScriptCopied(true);
      setTimeout(() => setScriptCopied(false), 3000);
    } catch {}
  };

  const openAssetScript = async () => {
    try {
      if (!assetScriptContent) {
        const res = await fetch("/assets/asset-register-appscript.gs");
        const text = await res.text();
        setAssetScriptContent(text);
      }
      setAssetScriptCopied(false);
      setShowAssetScript(true);
    } catch {}
  };

  const copyAssetScript = async () => {
    try {
      await navigator.clipboard.writeText(assetScriptContent);
      setAssetScriptCopied(true);
      setTimeout(() => setAssetScriptCopied(false), 3000);
    } catch {}
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showDriveScript) setShowDriveScript(false);
        if (showAssetScript) setShowAssetScript(false);
      }
    };
    if (showDriveScript || showAssetScript) {
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [showDriveScript, showAssetScript]);

  const testTidyhqConnection = async () => {
    setTestingTidyhq(true);
    setTidyhqTestResult(null);
    try {
      const res = await fetch("/api/tidyhq/test-connection", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTidyhqTestResult(data);
      if (data.ok) {
        fetch("/api/tidyhq/status", { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.json())
          .then(d => setTidyhqStatus(d))
          .catch(() => {});
      }
    } catch (e: unknown) {
      setTidyhqTestResult({ ok: false, message: e instanceof Error ? e.message : "Connection test failed" });
    }
    setTestingTidyhq(false);
  };

  const groupSyncRoleLabels: Record<string, string> = {
    isCommittee: "Committee",
    isSafetyCommittee: "Safety Committee",
    isContractor: "Contractor",
    isParksVic: "Parks Vic",
    isPosition: "Position Title",
  };

  const groupSyncActionColors: Record<string, string> = {
    role_added: "bg-green-100 text-green-700",
    role_removed: "bg-red-100 text-red-700",
    skipped: "bg-gray-100 text-gray-600",
    ignored: "bg-gray-100 text-gray-500",
  };

  const fetchTidyhqGroups = async () => {
    setLoadingTidyhqGroups(true);
    try {
      const res = await fetch("/api/contacts/tidyhq-groups", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTidyhqGroups(data);
    } catch {
      setTidyhqGroups([]);
    } finally {
      setLoadingTidyhqGroups(false);
    }
  };

  const openAddMappingModal = () => {
    setShowAddMapping(true);
    setSelectedGroupId("");
    setSelectedRole("");
    setAddMappingError("");
    if (tidyhqGroups.length === 0) fetchTidyhqGroups();
  };

  const handleAddMapping = async () => {
    if (!selectedGroupId || !selectedRole) {
      setAddMappingError("Select both a group and a role");
      return;
    }
    const group = tidyhqGroups.find(g => String(g.id) === selectedGroupId);
    if (!group) { setAddMappingError("Invalid group selected"); return; }
    setSavingMapping(true);
    setAddMappingError("");
    try {
      const res = await fetch("/api/tidyhq/group-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tidyhqGroupId: String(group.id),
          tidyhqGroupName: group.label,
          localRoleFlag: selectedRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add mapping");
      setShowAddMapping(false);
      fetchGroupMappings();
      fetch("/api/tidyhq/status", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setTidyhqStatus(d))
        .catch(() => {});
    } catch (e: unknown) {
      setAddMappingError(e instanceof Error ? e.message : "Error");
    } finally {
      setSavingMapping(false);
    }
  };

  const handleDeleteMapping = async (id: number) => {
    try {
      await fetch(`/api/tidyhq/group-mappings/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchGroupMappings();
      fetch("/api/tidyhq/status", { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => setTidyhqStatus(d))
        .catch(() => {});
    } catch {}
  };

  const handleToggleGroupSync = () => {
    if (!groupSyncExpanded) {
      fetchGroupMappings();
      fetchWebhookLogs();
    }
    setGroupSyncExpanded(!groupSyncExpanded);
  };

  const loadSearchLogStats = async () => {
    try {
      const res = await fetch("/api/search-logs/stats", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSearchLogStats(data);
        setSearchLogEnabled(data.enabled);
      }
    } catch {}
  };

  const fetchSearchLogs = async (page = 1, type: "all" | "public" | "admin" = "all") => {
    setLoadingSearchLogs(true);
    setSearchLogType(type);
    setSearchLogPage(page);
    try {
      const res = await fetch(`/api/search-logs?type=${type}&page=${page}&limit=50`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSearchLogEntries(data.entries || []);
        setSearchLogTotal(data.total || 0);
        setSearchLogPages(data.pages || 1);
      }
    } catch {}
    setLoadingSearchLogs(false);
  };

  const toggleSearchLogging = async (enabled: boolean) => {
    setSearchLogEnabled(enabled);
    try {
      await fetch("/api/search-logs/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled }),
      });
      setSearchLogStats(prev => prev ? { ...prev, enabled } : null);
    } catch {}
  };

  const clearSearchLogs = async () => {
    setClearingSearchLogs(true);
    try {
      const res = await fetch("/api/search-logs", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSearchLogStats(prev => prev ? { ...prev, total: 0, sizeMb: 0, oldestAt: null } : null);
        setSearchLogEntries([]);
        setSearchLogTotal(0);
        setSearchLogPages(1);
      }
    } catch {}
    setClearingSearchLogs(false);
  };

  const driveStatus: "connected" | "not-configured" = driveConnected ? "connected" : "not-configured";
  const driveStatusLabel = driveConnected
    ? "Connected"
    : driveScriptUrl
      ? "URL Set — Not Verified"
      : "Not Configured";

  return {
    token, settings, location, clubName,
    driveScriptUrl, setDriveScriptUrl, driveScriptDraft, setDriveScriptDraft,
    editingDriveScript, setEditingDriveScript, savingDriveScript, driveScriptSaved,
    testingDrive, driveTestResult,
    sheetUrl, setSheetUrl, sheetDraft, setSheetDraft,
    editingSheet, setEditingSheet, savingSheet, sheetSaved,
    assetScriptUrl, setAssetScriptUrl, assetScriptDraft, setAssetScriptDraft,
    editingAssetScript, setEditingAssetScript, savingAssetScript, assetScriptSaved,
    testingSheet, sheetTestResult, setSheetTestResult,
    driveConnected, expandedCards, toggleExpanded,
    showDriveScript, setShowDriveScript, driveScriptContent, scriptCopied,
    showAssetScript, setShowAssetScript, assetScriptContent, assetScriptCopied,
    settingUpFolders, folderSetupResult, folderSetupRootUrl,
    indexStatus, syncing, syncResult,
    tidyhqStatus, testingTidyhq, tidyhqTestResult,
    groupSyncExpanded, groupMappings, webhookLogs,
    tidyhqGroups, loadingTidyhqGroups,
    showAddMapping, setShowAddMapping,
    selectedGroupId, setSelectedGroupId,
    selectedRole, setSelectedRole,
    addMappingError, savingMapping,
    bulkUploadLimit, bulkUploadLimitDraft, setBulkUploadLimitDraft,
    savingBulkLimit, bulkLimitSaved, saveBulkUploadLimit,
    saDisclaimer, setSaDisclaimer,
    saCommitteeLink, setSaCommitteeLink,
    saCtaMessage, setSaCtaMessage,
    saCtaFrequency, setSaCtaFrequency,
    saPrompt, setSaPrompt,
    saDefaultPrompt, saShowPrompt, setSaShowPrompt,
    saEligibilityRules, setSaEligibilityRules,
    saDefaultEligibilityRules, saShowEligibilityRules, setSaShowEligibilityRules,
    saSaveMsg, markDirty, blocker, saJustSaved,
    driveStatus, driveStatusLabel,
    saveSmartAssistant, saveDriveScriptUrl, testDriveConnection,
    saveSheetUrl, saveAssetScriptUrl, testSheetConnection,
    loadIndexStatus, syncDocumentIndex, clearDocumentIndex,
    setupDriveFolders, disconnectDrive,
    openDriveScript, copyDriveScript, openAssetScript, copyAssetScript,
    testTidyhqConnection, groupSyncRoleLabels, groupSyncActionColors,
    openAddMappingModal, handleAddMapping, handleDeleteMapping,
    handleToggleGroupSync, fetchGroupMappings, fetchWebhookLogs,
    searchLogEnabled, searchLogStats, showSearchLogs, setShowSearchLogs,
    searchLogEntries, searchLogPage, searchLogTotal, searchLogPages,
    searchLogType, loadingSearchLogs, clearingSearchLogs,
    expandedLogId, setExpandedLogId,
    loadSearchLogStats, fetchSearchLogs, toggleSearchLogging, clearSearchLogs,
  };
}
