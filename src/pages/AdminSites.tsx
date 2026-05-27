import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, Edit, Trash2, X, Search, RefreshCw, AlertTriangle, CheckCircle2, Clock, Loader2, Archive, RotateCcw, Eye, ChevronDown, ChevronRight, Wind } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";
import { getClosureStatus } from "@/utils/closureStatus";
import { Site } from "@/types/api";

interface VersionCheckStatus {
  currentVersion: string | null;
  changedSinceLastImport: boolean;
  lastBulkImportTime: string | null;
  lastCheck: {
    checkedAt: string;
    detectedVersion: string | null;
    previousVersion: string | null;
    changed: boolean;
    error: string | null;
  } | null;
  lastChange: {
    checkedAt: string;
    detectedVersion: string | null;
    previousVersion: string | null;
  } | null;
}

interface ArchiveEntry {
  id: number;
  siteguideVersion: string;
  archivedAt: string;
  siteCount: number;
}

function SiteguideVersionIndicator({ token, selectedState, onAutoImportTriggered }: { token: string; selectedState?: string; onAutoImportTriggered?: () => void }) {
  const [status, setStatus] = useState<VersionCheckStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  const fetchStatus = () => {
    setLoading(true);
    api.get<VersionCheckStatus>("/api/sites/siteguide-version-check/status", token)
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const { hash } = useLocation();
  const navigate = useNavigate();

  useEffect(() => { fetchStatus(); }, []);

  useEffect(() => {
    if (hash && hash.startsWith("#site-")) {
      const id = hash.replace("#site-", "");
      if (id) {
        navigate(`/admin/sites/${id}/edit`);
      }
    }
  }, [hash, navigate]);

  const handleRunCheck = async () => {
    setRunning(true);
    setCheckMessage(null);
    try {
      const data = await api.post<Record<string, unknown>>("/api/sites/siteguide-version-check/run", { state: selectedState || "" }, token);
      fetchStatus();

      if (data.autoImportTriggered) {
        setCheckMessage("Version change detected — auto-import started.");
        onAutoImportTriggered?.();
      } else if ((data.changed || data.autoImportError) && !data.autoImportTriggered) {
        const reason = data.autoImportError || "Auto-import not configured.";
        setCheckMessage(`Version change detected, but auto-import not triggered: ${reason}`);
      } else {
        setCheckMessage("No version change detected.");
      }
    } catch {
      setCheckMessage("Failed to run version check.");
    }
    setRunning(false);
  };

  if (loading) return null;

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("en-AU", { timeZone: "Australia/Melbourne", dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  const changedSinceImport = status?.changedSinceLastImport === true;
  const hasError = status?.lastCheck?.error != null;

  return (
    <div className={`mb-4 rounded-lg border p-3 text-sm ${
      hasError ? "bg-amber-50 border-amber-200" :
      changedSinceImport ? "bg-orange-50 border-orange-200" :
      "bg-emerald-50 border-emerald-200"
    }`}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {hasError ? (
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          ) : changedSinceImport ? (
            <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span className="font-medium text-navy">
            Siteguide Version: {status?.currentVersion || "Unknown"}
          </span>
          {status?.lastCheck && (
            <span className="text-foreground-faint flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Checked {formatTime(status.lastCheck.checkedAt)}
            </span>
          )}
          {hasError && (
            <span className="text-amber-700">Last check error: {status?.lastCheck?.error}</span>
          )}
          {changedSinceImport && !hasError && (
            <span className="text-orange-700 font-medium">
              Version changed since last import: {status?.lastChange?.previousVersion} → {status?.lastChange?.detectedVersion}
              {status?.lastChange?.checkedAt && ` (${formatTime(status.lastChange.checkedAt)})`}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRunCheck}
          disabled={running}
          className="shrink-0"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${running ? "animate-spin" : ""}`} />
          {running ? "Checking..." : "Check Now"}
        </Button>
      </div>
      {checkMessage && (
        <p className="mt-2 text-xs text-foreground-secondary">{checkMessage}</p>
      )}
    </div>
  );
}

interface BulkImportResult {
  error?: string;
  message?: string;
  created?: number;
  updated?: number;
  unchanged?: number;
  errors?: number;
  skipped?: number;
  results?: Array<{ name: string; status: string; error?: string }>;
}

interface DiffEntry {
  siteId: string;
  siteName: string;
  status: "modified" | "added" | "removed";
  fields: Array<{ field: string; archived: string | null; current: string | null }>;
}

interface DiffData {
  version: string;
  totalDiffs: number;
  diffs: DiffEntry[];
}

interface WtfComparison {
  siteId: string;
  siteName: string;
  wtfSiteName: string;
  currentWindSpeed: string;
  wtfWindSpeed: string;
  changed: boolean;
}

interface WtfData {
  error?: string;
  success?: boolean;
  wtfSiteCount?: number;
  matchedCount?: number;
  changedCount: number;
  comparisons: WtfComparison[];
}

interface WtfApplyResult {
  error?: string;
  success?: boolean;
  updated?: number;
  results?: Array<{ siteId: string; name: string; oldSpeed: string; newSpeed: string }>;
}

export function AdminSites() {
  const { token } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [siteToDelete, setSiteToDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [hideClosedSites, setHideClosedSites] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const [externalSites, setExternalSites] = useState<{name: string, url: string, state?: string, stateAbbr?: string, region?: string}[]>([]);
  const [selectedState, setSelectedState] = useState("");
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkImportResult, setBulkImportResult] = useState<BulkImportResult | null>(null);
  const [bulkRemaining, setBulkRemaining] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkCurrentSite, setBulkCurrentSite] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [archives, setArchives] = useState<ArchiveEntry[]>([]);
  const [selectedArchive, setSelectedArchive] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());

  const [wtfLoading, setWtfLoading] = useState(false);
  const [wtfData, setWtfData] = useState<WtfData | null>(null);
  const [wtfApplying, setWtfApplying] = useState(false);
  const [wtfApplyResult, setWtfApplyResult] = useState<WtfApplyResult | null>(null);
  const [wtfSelectedIds, setWtfSelectedIds] = useState<Set<string>>(new Set());
  const [wtfShowAll, setWtfShowAll] = useState(false);

  useEffect(() => {
    api.get<{ data: Array<Record<string, unknown>> }>('/api/sites?limit=500')
      .then(response => setSites(response.data as unknown as Site[]))
      .catch(() => {});
    api.get<Record<string, string>>('/api/settings')
      .then(data => {
        setHideClosedSites(data.hideClosedSites === "true");
        if (data.lastImportedState) {
          setSelectedState(data.lastImportedState);
        }
      })
      .catch(() => {});
    api.get<Array<Record<string, unknown>>>('/api/external-sites')
      .then(data => setExternalSites(data as {name: string, url: string, state?: string, stateAbbr?: string, region?: string}[]))
      .catch(err => console.error("Failed to fetch external sites", err));
  }, []);

  useEffect(() => {
    if (token) {
      api.get<Array<Record<string, unknown>>>("/api/sites/archives", token)
        .then(data => setArchives(data as unknown as ArchiveEntry[]))
        .catch(() => {});
    }
  }, [token]);

  const uniqueStates = [...new Set(externalSites.map(s => s.stateAbbr).filter(Boolean))].sort() as string[];
  const stateCount = selectedState ? externalSites.filter(s => s.stateAbbr === selectedState).length : 0;

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    setBulkImporting(true);
    setBulkImportResult(null);
    let consecutiveErrors = 0;
    pollRef.current = setInterval(async () => {
      try {
        const data = await api.get<Record<string, unknown>>("/api/sites/bulk-import/progress");
        consecutiveErrors = 0;
        if (!data.running && !data.done) {
          stopPolling();
          setBulkImporting(false);
          setBulkImportResult({ error: "Import process ended unexpectedly" });
          return;
        }
        setBulkRemaining(data.remaining as number);
        setBulkTotal(data.total as number);
        setBulkCurrentSite(data.currentSite ? String(data.currentSite) : "");
        if (data.done) {
          stopPolling();
          setBulkImporting(false);
          setBulkImportResult(data.summary as unknown as BulkImportResult);
          api.get<{ data: Array<Record<string, unknown>> }>('/api/sites').then(response => setSites(response.data as unknown as Site[])).catch(() => {});
          if (token) {
            api.get<Array<Record<string, unknown>>>("/api/sites/archives", token)
              .then(data => setArchives(data as unknown as ArchiveEntry[]))
              .catch(() => {});
          }
        }
      } catch {
        consecutiveErrors++;
        if (consecutiveErrors > 15) {
          stopPolling();
          setBulkImporting(false);
          setBulkImportResult({ error: "Lost connection to server during import" });
        }
      }
    }, 2000);
  };

  useEffect(() => { return () => stopPolling(); }, []);

  const handleRefreshSites = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const data = await api.post<{ success?: boolean; count?: number; error?: string }>("/api/sites/scrape-urls", {}, token);
      if (data.success) {
        setRefreshMessage({ type: "success", text: `Successfully refreshed site list. Found ${data.count} sites.` });
        api.get<Array<Record<string, unknown>>>('/api/external-sites')
          .then(data => setExternalSites(data as unknown as {name: string, url: string, state?: string, stateAbbr?: string, region?: string}[]))
          .catch(() => {});
      } else {
        setRefreshMessage({ type: "error", text: `Failed to refresh sites: ${data.error}` });
      }
    } catch (e: unknown) {
      setRefreshMessage({ type: "error", text: `Error refreshing sites: ${e instanceof Error ? e.message : "Unknown error"}` });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleManualImport = async () => {
    if (!selectedState || bulkImporting) return;
    setBulkImporting(true);
    setBulkImportResult(null);
    setBulkRemaining(stateCount);
    setBulkTotal(stateCount);
    setBulkCurrentSite("");
    try {
      const data = await api.post<Record<string, unknown>>("/api/sites/bulk-import", { state: selectedState }, token);
      if (data.message) {
        setBulkImportResult(data as unknown as BulkImportResult);
        setBulkImporting(false);
        return;
      }
      if (data.started) {
        setBulkTotal(data.total as number);
        setBulkRemaining(data.total as number);
        startPolling();
      }
    } catch (e: unknown) {
      setBulkImportResult({ error: e instanceof Error ? e.message : String(e) });
      setBulkImporting(false);
    }
  };

  const handleRestoreArchive = async () => {
    if (!selectedArchive || restoring) return;
    setShowRestoreConfirm(false);
    setRestoring(true);
    setRestoreMessage(null);
    try {
      const data = await api.post<{ restored: number; version: string }>(`/api/sites/archives/${encodeURIComponent(selectedArchive)}/restore`, {}, token);
      setRestoreMessage({ type: "success", text: `Restored ${data.restored} sites from archive version ${data.version}.` });
      api.get<{ data: Array<Record<string, unknown>> }>('/api/sites').then(response => setSites(response.data as unknown as Site[])).catch(() => {});
      api.get<Array<Record<string, unknown>>>("/api/sites/archives", token)
        .then(data => setArchives(data as unknown as ArchiveEntry[]))
        .catch(() => {});
    } catch (e: unknown) {
      setRestoreMessage({ type: "error", text: e instanceof Error ? e.message : "Restore failed" });
    } finally {
      setRestoring(false);
    }
  };

  const handleViewDiff = async () => {
    if (!selectedArchive) return;
    setDiffLoading(true);
    setDiffData(null);
    try {
      const data = await api.get<Record<string, unknown>>(`/api/sites/archives/${encodeURIComponent(selectedArchive)}/diff`, token);
      setDiffData(data as unknown as DiffData);
      setExpandedDiffs(new Set());
      setShowDiffModal(true);
    } catch (e: unknown) {
      setRestoreMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to load diff" });
    } finally {
      setDiffLoading(false);
    }
  };

  const toggleDiffExpanded = (siteId: string) => {
    setExpandedDiffs(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  };

  const handleWtfCompare = async () => {
    setWtfLoading(true);
    setWtfData(null);
    setWtfApplyResult(null);
    setWtfSelectedIds(new Set());
    try {
      const data = await api.post<Record<string, unknown>>("/api/sites/wtf-compare", {}, token);
      if (!data.success) throw new Error((data.error as string) || "Failed to fetch WTF data");
      setWtfData(data as unknown as WtfData);
      const comparisons = data.comparisons as unknown as WtfComparison[];
      const changedIds = new Set<string>(comparisons.filter(c => c.changed).map(c => c.siteId));
      setWtfSelectedIds(changedIds);
    } catch (e: unknown) {
      setWtfData({ error: e instanceof Error ? e.message : String(e) } as WtfData);
    } finally {
      setWtfLoading(false);
    }
  };

  const handleWtfApply = async () => {
    if (wtfSelectedIds.size === 0) return;
    setWtfApplying(true);
    setWtfApplyResult(null);
    try {
      const data = await api.post<Record<string, unknown>>("/api/sites/wtf-apply", { siteIds: Array.from(wtfSelectedIds) }, token);
      if (!data.success) throw new Error((data.error as string) || "Failed to apply WTF data");
      setWtfApplyResult(data);
      toast.success("WTF data applied");
      api.get<{ data: Array<Record<string, unknown>> }>('/api/sites').then(response => setSites(response.data as unknown as Site[])).catch(() => {});
      setWtfApplyResult(data as unknown as WtfApplyResult);
    } catch (e: unknown) {
      setWtfApplyResult({ error: e instanceof Error ? e.message : "Failed" });
    } finally {
      setWtfApplying(false);
    }
  };

  const toggleWtfSite = (siteId: string) => {
    setWtfSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  };

  const toggleHideClosedSites = async () => {
    const newValue = !hideClosedSites;
    setHideClosedSites(newValue);
    await api.put('/api/settings', { hideClosedSites: String(newValue) }, token);
  };

  const getVisibleSiteIds = () => {
    return sites.filter(site => site.name.toLowerCase().includes(searchQuery.toLowerCase())).map(s => s.id);
  };

  const navigateToEdit = (siteId: string) => {
    sessionStorage.setItem("adminSiteList", JSON.stringify(getVisibleSiteIds()));
    navigate(`/admin/sites/${siteId}/edit`);
  };

  const handleDelete = async (id: string) => {
    setDeleteError("");
    setSiteToDelete(id);
  };

  const confirmDelete = async () => {
    if (!siteToDelete) return;
    setDeleteError("");
    try {
      await api.delete(`/api/sites/${siteToDelete}`, token);
      setSites(sites.filter(site => site.id !== siteToDelete));
      setSiteToDelete(null);
      toast.success("Site deleted");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to delete site";
      console.error(msg);
      setDeleteError(msg);
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString("en-AU", { timeZone: "Australia/Melbourne", dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to="/admin" className="inline-flex items-center text-sky hover:text-sky-light mb-6 font-medium">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
        </Link>
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-navy mb-2">Manage Sites</h1>
            <p className="text-foreground-secondary">Add, edit, or remove flying site guides.</p>
          </div>
          <Button onClick={() => navigate('/admin/sites/new')} className="bg-sky hover:bg-sky-light text-white">
            <Plus className="w-4 h-4 mr-2" /> Add New Site
          </Button>
        </div>

        {token && <SiteguideVersionIndicator token={token} selectedState={selectedState} onAutoImportTriggered={() => startPolling()} />}

        <div className="mb-4 bg-card border border-border-subtle rounded-lg p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <select
              className="min-w-0 flex-1 p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-card"
              value={selectedState}
              onChange={(e) => {
                setSelectedState(e.target.value);
                setBulkImportResult(null);
              }}
            >
              <option value="">-- State/territory --</option>
              {uniqueStates.map(state => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
            <Button
              type="button"
              onClick={handleManualImport}
              disabled={!selectedState || bulkImporting}
              className={`sm:w-44 shrink-0 flex items-center justify-center gap-2 px-4 whitespace-nowrap ${selectedState && !bulkImporting ? 'bg-sky hover:bg-sky-light text-white' : 'bg-muted text-foreground-faint cursor-not-allowed'}`}
            >
              {bulkImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Import Sites
            </Button>
          </div>
          {selectedState && (
            <p className="text-xs text-foreground-faint">
              {stateCount} sites available in {selectedState}. Import will archive current data before overwriting.
            </p>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRefreshSites}
              disabled={isRefreshing}
              className={`p-1 transition-colors text-xs flex items-center gap-1 ${isRefreshing ? 'text-emerald-500 cursor-not-allowed' : 'text-foreground-faint hover:text-sky'}`}
              title="Refresh Site List from Siteguide.org.au"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh site list</span>
            </button>
            {refreshMessage && (
              <div className={`p-2 rounded text-xs ${refreshMessage.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {refreshMessage.text}
              </div>
            )}
          </div>
          {bulkImporting && (
            <div className="p-3 bg-sky/5 border border-sky/20 rounded-lg">
              <div className="flex items-center gap-3 text-sm text-navy font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-sky shrink-0" />
                <span className="flex-1">Importing sites{selectedState ? ` from ${selectedState}` : ''}... ({bulkTotal - bulkRemaining}/{bulkTotal})</span>
                <span className="text-2xl font-bold text-sky tabular-nums">{bulkRemaining}</span>
                <span className="text-xs text-muted-foreground">remaining</span>
              </div>
              <div className="mt-2 w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-sky h-1.5 rounded-full transition-all duration-500"
                  style={{ width: bulkTotal > 0 ? `${((bulkTotal - bulkRemaining) / bulkTotal) * 100}%` : '0%' }}
                />
              </div>
              {bulkCurrentSite && (
                <p className="text-xs text-muted-foreground mt-1 truncate">{bulkCurrentSite}</p>
              )}
            </div>
          )}
          {bulkImportResult && !bulkImportResult.error && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-2">
              <div className="text-sm font-medium text-emerald-700">
                {bulkImportResult.message || `Import complete: ${bulkImportResult.created} created, ${bulkImportResult.updated} updated${bulkImportResult.unchanged ? `, ${bulkImportResult.unchanged} unchanged` : ''}, ${bulkImportResult.errors} errors, ${bulkImportResult.skipped} skipped`}
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {bulkImportResult.results?.map((r: { name: string; status: string; error?: string }, i: number) => (
                  <div key={i} className={`text-xs px-2 py-1 rounded ${r.status === 'created' ? 'bg-emerald-100 text-emerald-700' : r.status === 'updated' ? 'bg-blue-100 text-blue-700' : r.status === 'unchanged' ? 'bg-slate-100 text-slate-500' : r.status === 'skipped' ? 'bg-muted text-muted-foreground' : 'bg-red-100 text-red-700'}`}>
                    {r.name}: {r.status}{r.error ? ` — ${r.error}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}
          {bulkImportResult?.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {bulkImportResult.error}
            </div>
          )}
        </div>

        {archives.length > 0 && (
          <div className="mb-4 bg-card border border-border-subtle rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-navy">
              <Archive className="w-4 h-4" />
              Restore from Archive
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <select
                className="min-w-0 flex-1 p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky bg-card text-sm"
                value={selectedArchive}
                onChange={(e) => {
                  setSelectedArchive(e.target.value);
                  setRestoreMessage(null);
                }}
              >
                <option value="">-- Select an archive --</option>
                {archives.map(a => (
                  <option key={a.id} value={a.siteguideVersion}>
                    Version {a.siteguideVersion} — {a.siteCount} sites — {formatTime(a.archivedAt)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                onClick={handleViewDiff}
                disabled={!selectedArchive || diffLoading}
                className={`sm:w-44 shrink-0 flex items-center justify-center gap-2 px-4 whitespace-nowrap ${selectedArchive && !diffLoading ? 'bg-sky hover:bg-sky/80 text-white' : 'bg-muted text-foreground-faint cursor-not-allowed'}`}
              >
                {diffLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                View Changes
              </Button>
              <Button
                type="button"
                onClick={() => setShowRestoreConfirm(true)}
                disabled={!selectedArchive || restoring}
                className={`sm:w-44 shrink-0 flex items-center justify-center gap-2 px-4 whitespace-nowrap ${selectedArchive && !restoring ? 'bg-navy hover:bg-navy/80 text-white' : 'bg-muted text-foreground-faint cursor-not-allowed'}`}
              >
                {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Restore
              </Button>
            </div>
            {restoreMessage && (
              <div className={`p-2 rounded text-xs ${restoreMessage.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {restoreMessage.text}
              </div>
            )}
          </div>
        )}

        <div className="mb-4 bg-card border border-border-subtle rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-navy">
              <Wind className="w-4 h-4" />
              Update WTF Wind Data
            </div>
            <Button
              type="button"
              onClick={handleWtfCompare}
              disabled={wtfLoading}
              className={`flex items-center gap-2 px-4 ${wtfLoading ? 'bg-muted text-foreground-faint cursor-not-allowed' : 'bg-sky hover:bg-sky-light text-white'}`}
            >
              {wtfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Fetch & Compare
            </Button>
          </div>
          <p className="text-xs text-foreground-faint">
            Fetches wind speed data from wheretofly.info and compares with current site values. Review differences before applying.
          </p>
          {wtfData?.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{wtfData.error}</div>
          )}
          {wtfData && !wtfData.error && (
            <div className="space-y-3">
              <div className="flex gap-3 text-xs flex-wrap">
                <span className="px-2 py-1 bg-muted rounded">WTF sites: {wtfData.wtfSiteCount}</span>
                <span className="px-2 py-1 bg-sky/10 text-sky rounded font-medium">Matched: {wtfData.matchedCount}</span>
                <span className={`px-2 py-1 rounded font-medium ${wtfData.changedCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                  {wtfData.changedCount > 0 ? `${wtfData.changedCount} differences` : 'All matched — no changes'}
                </span>
              </div>
              {wtfData.comparisons.length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wtfShowAll}
                        onChange={() => setWtfShowAll(!wtfShowAll)}
                        className="w-4 h-4 rounded border-border text-sky focus:ring-1 focus:ring-sky"
                      />
                      Show all matches (including identical)
                    </label>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto border border-border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-border">
                          <th className="p-2 w-8">
                            <input
                              type="checkbox"
                              checked={wtfData.comparisons.filter((c: WtfComparison) => c.changed).every((c: WtfComparison) => wtfSelectedIds.has(c.siteId))}
                              onChange={() => {
                                const changedIds = wtfData.comparisons.filter((c: WtfComparison) => c.changed).map((c: WtfComparison) => c.siteId);
                                const allSelected = changedIds.every((id: string) => wtfSelectedIds.has(id));
                                setWtfSelectedIds(allSelected ? new Set() : new Set(changedIds));
                              }}
                              className="w-4 h-4 rounded border-border text-sky focus:ring-1 focus:ring-sky"
                            />
                          </th>
                          <th className="text-left p-2 font-medium text-foreground-faint">Site</th>
                          <th className="text-left p-2 font-medium text-foreground-faint">WTF Match</th>
                          <th className="text-left p-2 font-medium text-foreground-faint">Current Speed</th>
                          <th className="text-left p-2 font-medium text-foreground-faint">WTF Speed</th>
                          <th className="text-left p-2 font-medium text-foreground-faint w-16">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wtfData.comparisons
                          .filter((c: WtfComparison) => wtfShowAll || c.changed)
                          .map((c: WtfComparison) => (
                            <tr key={c.siteId} className={`border-b border-border last:border-0 ${c.changed ? '' : 'opacity-60'}`}>
                              <td className="p-2">
                                {c.changed && (
                                  <input
                                    type="checkbox"
                                    checked={wtfSelectedIds.has(c.siteId)}
                                    onChange={() => toggleWtfSite(c.siteId)}
                                    className="w-4 h-4 rounded border-border text-sky focus:ring-1 focus:ring-sky"
                                  />
                                )}
                              </td>
                              <td className="p-2 font-medium">{c.siteName}</td>
                              <td className="p-2 text-foreground-faint">{c.wtfSiteName}</td>
                              <td className="p-2">{c.currentWindSpeed || <em className="text-foreground-faint">empty</em>}</td>
                              <td className="p-2 font-medium">{c.wtfWindSpeed}</td>
                              <td className="p-2">
                                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${c.changed ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                  {c.changed ? 'Different' : 'Match'}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {wtfData.changedCount > 0 && (
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        onClick={handleWtfApply}
                        disabled={wtfApplying || wtfSelectedIds.size === 0}
                        className={`flex items-center gap-2 px-4 ${!wtfApplying && wtfSelectedIds.size > 0 ? 'bg-navy hover:bg-navy/80 text-white' : 'bg-muted text-foreground-faint cursor-not-allowed'}`}
                      >
                        {wtfApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Apply {wtfSelectedIds.size} Update{wtfSelectedIds.size !== 1 ? 's' : ''}
                      </Button>
                      <span className="text-xs text-foreground-faint">Updates windSpeed field for selected sites</span>
                    </div>
                  )}
                </>
              )}
              {wtfApplyResult && !wtfApplyResult.error && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1">
                  <div className="text-sm font-medium text-emerald-700">Updated {wtfApplyResult.updated} site{wtfApplyResult.updated !== 1 ? 's' : ''}</div>
                  {wtfApplyResult.results?.map((r: { siteId: string; name: string; oldSpeed: string; newSpeed: string }) => (
                    <div key={r.siteId} className="text-xs text-emerald-600">{r.name}: {r.oldSpeed} → {r.newSpeed}</div>
                  ))}
                </div>
              )}
              {wtfApplyResult?.error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{wtfApplyResult.error}</div>
              )}
            </div>
          )}
        </div>

        <div className="mb-4 bg-card border border-border-subtle rounded-lg p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-faint" />
            <input
              type="text"
              placeholder="Search sites by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="hideClosedSites"
              checked={hideClosedSites}
              onChange={toggleHideClosedSites}
              className="w-5 h-5 rounded border-border text-sky focus:ring-1 focus:ring-sky focus:border-sky cursor-pointer"
            />
            <label htmlFor="hideClosedSites" className="text-sm font-medium text-foreground-label cursor-pointer select-none">
              Hide closed sites
            </label>
            <span className="text-xs text-foreground-faint">(closed sites will not appear on the public Sites page or maps, but remain visible here)</span>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="sm:hidden divide-y divide-border-faint">
              {sites.filter(site => site.name.toLowerCase().includes(searchQuery.toLowerCase())).map((site) => (
                <div key={site.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link to={`/sites/${site.id}`} className="font-medium text-navy hover:text-sky transition-colors hover:underline">
                        {site.name}
                      </Link>
                      <p className="text-sm text-foreground-secondary mt-0.5">{site.type}</p>
                    </div>
                    {(() => {
                      const { isClosedToday } = getClosureStatus(site);
                      if (site.status === 'restricted') return <Badge className="bg-amber-500 text-white shrink-0">Restricted</Badge>;
                      const isClosed = site.status === 'closed' || isClosedToday;
                      return isClosed
                        ? <Badge variant="destructive" className="shrink-0">Closed</Badge>
                        : <Badge variant="default" className="bg-emerald-500 shrink-0">Open</Badge>;
                    })()}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => navigateToEdit(site.id)}>
                      <Edit className="w-4 h-4 mr-1" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(site.id)}>
                      <Trash2 className="w-4 h-4 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              ))}
              {sites.filter(site => site.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  {searchQuery ? `No sites matching "${searchQuery}".` : 'No sites found. Click "Add New Site" to create one.'}
                </div>
              )}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted border-b border-border-subtle">
                    <th className="p-4 font-semibold text-navy">Site Name</th>
                    <th className="p-4 font-semibold text-navy">Type</th>
                    <th className="p-4 font-semibold text-navy">Status</th>
                    <th className="p-4 font-semibold text-navy text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.filter(site => site.name.toLowerCase().includes(searchQuery.toLowerCase())).map((site) => (
                    <tr key={site.id} className="border-b border-border-faint hover:bg-background">
                      <td className="p-4 font-medium"><Link to={`/sites/${site.id}`} className="text-navy hover:text-sky transition-colors hover:underline">{site.name}</Link></td>
                      <td className="p-4 text-foreground-secondary">{site.type}</td>
                      <td className="p-4">
                        {(() => {
                          const { isClosedToday } = getClosureStatus(site);
                          if (site.status === 'restricted') return <Badge className="bg-amber-500 text-white">Restricted</Badge>;
                          const isClosed = site.status === 'closed' || isClosedToday;
                          return isClosed
                            ? <Badge variant="destructive">Closed</Badge>
                            : <Badge variant="default" className="bg-emerald-500">Open</Badge>;
                        })()}
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => navigateToEdit(site.id)}>
                          <Edit className="w-4 h-4 mr-1" /> Edit
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(site.id)}>
                          <Trash2 className="w-4 h-4 mr-1" /> Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {sites.filter(site => site.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-muted-foreground">
                        {searchQuery ? `No sites matching "${searchQuery}".` : 'No sites found. Click "Add New Site" to create one.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {siteToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-navy">Confirm Deletion</h3>
              <button onClick={() => setSiteToDelete(null)} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>
            <p className="text-foreground-secondary mb-6">Are you sure you want to delete this site? This action cannot be undone.</p>
            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{deleteError}</div>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setSiteToDelete(null)}>Cancel</Button>
              <Button className="bg-red-500 hover:bg-red-600 text-white" onClick={confirmDelete}>Delete Site</Button>
            </div>
          </div>
        </div>
      )}

      {showRestoreConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="p-6 border-b bg-amber-500/10">
              <h3 className="text-lg font-bold text-amber-700">Restore Archive</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-lg">
                <p className="text-sm text-amber-800 font-bold uppercase text-center">
                  This will replace ALL current sites with archived data
                </p>
              </div>
              <p className="text-sm text-foreground-label">
                Restoring archive <strong>{selectedArchive}</strong> will delete all current sites and replace them with the {archives.find(a => a.siteguideVersion === selectedArchive)?.siteCount || 0} sites from this archive.
              </p>
              <p className="text-xs text-muted-foreground">
                A snapshot of the current sites will be saved before restoring.
              </p>
            </div>
            <div className="p-4 border-t bg-background flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setShowRestoreConfirm(false)}>Cancel</Button>
              <Button type="button" onClick={handleRestoreArchive} className="bg-amber-600 hover:bg-amber-700 text-white">
                <RotateCcw className="w-4 h-4 mr-2" />
                Restore Archive
              </Button>
            </div>
          </div>
        </div>
      )}

      {showDiffModal && diffData && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b bg-sky/5 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-navy">
                Changes: Archive {diffData.version} vs Current
              </h3>
              <button onClick={() => setShowDiffModal(false)} className="p-1 hover:bg-muted rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {diffData.totalDiffs === 0 ? (
                <div className="text-center py-8 text-foreground-faint">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                  <p>No differences found. The archived and current sites are identical.</p>
                </div>
              ) : (
                <>
                  <div className="flex gap-3 text-xs mb-4">
                    {diffData.diffs.filter((d: DiffEntry) => d.status === "modified").length > 0 && (
                      <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded font-medium">
                        {diffData.diffs.filter((d: DiffEntry) => d.status === "modified").length} Modified
                      </span>
                    )}
                    {diffData.diffs.filter((d: DiffEntry) => d.status === "added").length > 0 && (
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded font-medium">
                        {diffData.diffs.filter((d: DiffEntry) => d.status === "added").length} Added (new)
                      </span>
                    )}
                    {diffData.diffs.filter((d: DiffEntry) => d.status === "removed").length > 0 && (
                      <span className="px-2 py-1 bg-red-100 text-red-800 rounded font-medium">
                        {diffData.diffs.filter((d: DiffEntry) => d.status === "removed").length} Removed
                      </span>
                    )}
                  </div>
                  {diffData.diffs.map((diff: DiffEntry) => (
                    <div key={diff.siteId} className="border border-border rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => diff.status === "modified" && toggleDiffExpanded(diff.siteId)}
                      >
                        {diff.status === "modified" ? (
                          expandedDiffs.has(diff.siteId) ? <ChevronDown className="w-4 h-4 text-foreground-faint shrink-0" /> : <ChevronRight className="w-4 h-4 text-foreground-faint shrink-0" />
                        ) : (
                          <span className="w-4 h-4 shrink-0" />
                        )}
                        <span className="font-medium text-sm flex-1">{diff.siteName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          diff.status === "modified" ? "bg-amber-100 text-amber-800" :
                          diff.status === "added" ? "bg-emerald-100 text-emerald-800" :
                          "bg-red-100 text-red-800"
                        }`}>
                          {diff.status === "modified" ? `${diff.fields.length} field${diff.fields.length !== 1 ? "s" : ""} changed` : diff.status}
                        </span>
                      </button>
                      {diff.status === "modified" && expandedDiffs.has(diff.siteId) && (
                        <div className="border-t border-border bg-muted/30">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left p-2 font-medium text-foreground-faint w-[15%]">Field</th>
                                <th className="text-left p-2 font-medium text-foreground-faint w-[10%]">Change</th>
                                <th className="text-left p-2 font-medium text-red-600 w-[37.5%]">Archived</th>
                                <th className="text-left p-2 font-medium text-emerald-600 w-[37.5%]">Current</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diff.fields.map((f: { field: string; archived: string | null; current: string | null }) => {
                                const isEmpty = (v: unknown) => v === null || v === "" || v === undefined;
                                const changeType = isEmpty(f.archived) && !isEmpty(f.current) ? "Added" :
                                  !isEmpty(f.archived) && isEmpty(f.current) ? "Removed" : "Changed";
                                return (
                                  <tr key={f.field} className="border-b border-border last:border-0">
                                    <td className="p-2 font-mono text-foreground-secondary align-top">{f.field}</td>
                                    <td className="p-2 align-top">
                                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                        changeType === "Added" ? "bg-emerald-100 text-emerald-700" :
                                        changeType === "Removed" ? "bg-red-100 text-red-700" :
                                        "bg-amber-100 text-amber-700"
                                      }`}>{changeType}</span>
                                    </td>
                                    <td className={`p-2 align-top break-all ${changeType === "Added" ? "" : "bg-red-50/50"}`}>
                                      {isEmpty(f.archived) ? <em className="text-foreground-faint">empty</em> : <span className="text-red-700">{String(f.archived).substring(0, 300)}{String(f.archived).length > 300 ? "..." : ""}</span>}
                                    </td>
                                    <td className={`p-2 align-top break-all ${changeType === "Removed" ? "" : "bg-emerald-50/50"}`}>
                                      {isEmpty(f.current) ? <em className="text-foreground-faint">empty</em> : <span className="text-emerald-700">{String(f.current).substring(0, 300)}{String(f.current).length > 300 ? "..." : ""}</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="p-4 border-t bg-background flex justify-end shrink-0">
              <Button type="button" variant="outline" onClick={() => setShowDiffModal(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
