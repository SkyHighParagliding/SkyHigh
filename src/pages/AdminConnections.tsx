import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownHelpLink } from "@/components/MarkdownHelpLink";
import {
  ArrowLeft,
  Cloud,
  FileSpreadsheet,
  HardDrive,
  Cpu,
  Wind,
  Thermometer,
  Users,
  ExternalLink,
  Check,
  X,
  Loader2,
  Save,
  ChevronDown,
  ChevronUp,
  Plug,
  Info,
  Copy,
  FileCode,
  Database,
  RefreshCw,
  FolderOpen,
  Trash2,
  Download,
  MessageCircle,
  Plus,
} from "lucide-react";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { useConnectionsConfig } from "@/hooks/useConnectionsConfig";

interface ConnectionCard {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  status: "connected" | "free" | "not-configured" | "coming-soon";
  statusLabel: string;
  cost: string;
  howItConnects: string;
  managedAt?: string;
  managedAtLabel?: string;
  configurable?: boolean;
  details: string;
}

export function AdminConnections() {
  const config = useConnectionsConfig();
  const {
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
    saDisclaimer, setSaDisclaimer,
    saCommitteeLink, setSaCommitteeLink,
    saCtaMessage, setSaCtaMessage,
    saCtaFrequency, setSaCtaFrequency,
    saPrompt, setSaPrompt,
    saDefaultPrompt, saShowPrompt, setSaShowPrompt,
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
  } = config;

  const connections: ConnectionCard[] = [
    {
      id: "google-drive",
      name: "Google Drive",
      icon: <HardDrive className="w-6 h-6" />,
      color: "border-t-blue-500",
      description: "Cloud document storage for the club filing system. Enables document upload, browsing, and search across 10 category folders (01–10).",
      status: driveStatus,
      statusLabel: driveStatusLabel,
      cost: "Free (Google account required)",
      howItConnects: "Via a Google Apps Script web app deployed from your Google Drive. The script acts as a secure bridge between this website and your Drive files.",
      managedAt: "/admin/documents",
      managedAtLabel: "Documents",
      configurable: true,
      details: `The Documents section uses Google Drive as its backend storage. When connected, admins can upload files directly from the website into organised folders on Google Drive, and the Smart search can access document contents.\n\nAny Google account can be used — it doesn't need to be the club's official account. You can start with your personal Drive and switch to the club's Drive later by updating the Apps Script URL here.`,
    },
    {
      id: "google-sheets",
      name: "Google Sheets (Asset Register)",
      icon: <FileSpreadsheet className="w-6 h-6" />,
      color: "border-t-emerald-500",
      description: "Links a Google Sheet to serve as the club's physical asset register. The Smart search can query assets like radios, windsocks, and first aid kits.",
      status: sheetUrl && assetScriptUrl ? "connected" : "not-configured",
      statusLabel: sheetUrl && assetScriptUrl ? "Connected" : sheetUrl || assetScriptUrl ? "Partially Configured" : "Not Configured",
      cost: "Free (Google account required)",
      howItConnects: "A separate Apps Script is deployed on the Asset Register Google Sheet. It exposes the sheet data as a JSON API that the Smart search queries.",
      configurable: true,
      details: `The Asset Register is a Google Sheet that lists all club-owned equipment across 4 tabs: Asset Register, Loan Register, Condition Ratings, and Inspection Frequencies.\n\nWhen both the Sheet URL and the Apps Script URL are configured, the admin Smart search can answer questions like "where is the club radio?", "who has the UHF radio on loan?", or "when was the first aid kit last checked?".\n\nThis is a separate Apps Script from the Drive bridge — it must be deployed from the Asset Register Google Sheet itself.`,
    },
    {
      id: "open-meteo",
      name: "Open-Meteo (ECMWF Forecasts)",
      icon: <Cloud className="w-6 h-6" />,
      color: "border-t-sky",
      description: "Provides wind speed, direction, and weather forecasts for all flying sites. Powers the weather cards and the animated wind map.",
      status: "free",
      statusLabel: "Active — Free API",
      cost: "Free — no API key required",
      howItConnects: "Hardcoded API integration. The server fetches ECMWF forecast data automatically every 15-20 minutes for all sites based on their GPS coordinates.",
      details: `Open-Meteo provides free access to ECMWF (European Centre for Medium-Range Weather Forecasts) data — one of the world's most accurate weather models. No registration or API key is needed.\n\nThe system fetches:\n• Hourly forecasts (wind speed, direction, gusts, temperature) for each site\n• Up to 16-day extended forecasts for the 7-day outlook\n• Victoria-wide wind grid data for the animated wind map\n\nData is cached and refreshed automatically. No configuration is needed.`,
    },
    {
      id: "weather-underground",
      name: "Weather Underground (Live Stations)",
      icon: <Thermometer className="w-6 h-6" />,
      color: "border-t-amber-500",
      description: "Provides real-time wind observations from personal weather stations near flying sites. Shows actual current conditions vs forecasts.",
      status: "free",
      statusLabel: "Active — Free API",
      cost: "Free — no API key required",
      howItConnects: "Each flying site can be linked to a nearby Weather Underground station ID. The server scrapes live data every 15 minutes.",
      managedAt: "/admin/weather",
      managedAtLabel: "Weather Management",
      details: `Weather Underground aggregates data from thousands of personal weather stations worldwide. When a flying site has a station ID configured (e.g. "ISURFB3"), the system fetches real-time wind speed, direction, gusts, and temperature.\n\nStation IDs are configured per-site in the site editor. The Weather Management page shows all active stations and their scraping status.\n\nObservations older than 6 hours are automatically treated as stale and the system falls back to ECMWF forecasts.`,
    },
    {
      id: "ai-models",
      name: "AI Models (Gemini / OpenAI)",
      icon: <Cpu className="w-6 h-6" />,
      color: "border-t-purple-500",
      description: "Powers the Smart search, site generation, image enhancement, and content creation features across the admin dashboard.",
      status: "connected",
      statusLabel: "Active",
      cost: "Usage-based — billed through Google AI Studio (web@skyhighparagliding.org.au)",
      howItConnects: "Connects via a Google AI Studio API key configured in Railway environment variables. A fallback chain tries multiple models in order if one fails.",
      managedAt: "/admin/ai-models",
      managedAtLabel: "AI Models",
      details: `The AI integration supports multiple models with automatic fallback:\n\n• Text: Gemini 2.5 Flash → Gemini 2.0 Flash → GPT-4o-mini\n• Images: Gemini → DALL-E\n\nThe fallback chain is configurable in the AI Models settings page. If one model is unavailable or rate-limited, the next one is tried automatically.\n\nUsed for: Admin Smart search, public Smart assistant, site guide generation from URLs, image enhancement, and content suggestions.`,
    },
    {
      id: "tidyhq",
      name: "TidyHQ",
      icon: <Users className="w-6 h-6" />,
      color: "border-t-teal-500",
      description: "Club membership management platform. Imports contacts, syncs group memberships via webhooks, and powers the shop integration.",
      status: tidyhqStatus?.connected ? "connected" : tidyhqStatus?.hasToken || tidyhqStatus?.hasSigningKey ? "not-configured" : "not-configured",
      statusLabel: tidyhqStatus?.connected ? "Connected" : tidyhqStatus?.hasToken || tidyhqStatus?.hasSigningKey ? "Partially Configured" : "Not Configured",
      cost: "Paid — club subscription",
      howItConnects: "Connects via TidyHQ API access token for importing contacts, groups, events, and shop items. Webhooks sync group membership changes in real time.",
      configurable: true,
      details: `TidyHQ is the membership management platform used by many Australian clubs. The integration enables:\n\n• Contact import from TidyHQ into the website's contact directory\n• Real-time group membership sync via webhooks (e.g. Committee, Safety Officer roles)\n• Event import from TidyHQ calendar\n• Shop item sync from TidyHQ shop\n\nTwo environment secrets are required:\n• TIDYHQ_ACCESS_TOKEN — Your TidyHQ API access token\n• TIDYHQ_WEBHOOK_SIGNING_KEY — The signing key from TidyHQ's webhook settings\n\nUse the TidyHQ Group Sync card below to configure group → role mappings and view webhook logs.`,
    },
  ];

  const statusDot = (status: ConnectionCard["status"]) => {
    switch (status) {
      case "connected":
        return "bg-emerald-500";
      case "free":
        return "bg-emerald-500";
      case "not-configured":
        return "bg-amber-500";
      case "coming-soon":
        return "bg-foreground-ghost";
    }
  };

  const statusBg = (status: ConnectionCard["status"]) => {
    switch (status) {
      case "connected":
        return "bg-emerald-50 text-emerald-700";
      case "free":
        return "bg-emerald-50 text-emerald-700";
      case "not-configured":
        return "bg-amber-50 text-amber-700";
      case "coming-soon":
        return "bg-muted text-foreground-faint";
    }
  };

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-navy transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-navy mb-2">API Settings</h1>
          <p className="text-muted-foreground">
            All external services the {clubName} website connects to. Configure, monitor, and understand each integration from one place.
          </p>
        </div>

        <div className="mb-6 p-4 rounded-lg border border-border-subtle bg-sky/5">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-sky shrink-0 mt-0.5" />
            <div className="text-sm text-foreground-label">
              <p className="font-medium text-navy mb-1">How this page works</p>
              <p>
                Each card below represents an external service. Green means it's active, amber means it needs setup,
                and grey means it's planned for the future. Click any card to expand details, setup instructions,
                and configuration options.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {connections.map((conn) => {
            const isExpanded = expandedCards.has(conn.id);
            return (
              <Card key={conn.id} id={`conn-${conn.id}`} className={`overflow-hidden border-t-4 ${conn.color}`}>
                <button
                  onClick={() => toggleExpanded(conn.id)}
                  className="w-full text-left"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="text-navy shrink-0 mt-0.5">{conn.icon}</div>
                        <div className="min-w-0">
                          <CardTitle className="text-navy text-lg">{conn.name}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">{conn.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${statusBg(conn.status)}`}>
                          <span className={`w-2 h-2 rounded-full ${statusDot(conn.status)}`} />
                          {conn.statusLabel}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-foreground-faint" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-foreground-faint" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </button>

                {isExpanded && (
                  <CardContent className="border-t border-border-subtle pt-4 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-semibold text-navy">Cost:</span>{" "}
                        <span className="text-foreground-label">{conn.cost}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-navy">How it connects:</span>{" "}
                        <span className="text-foreground-label">{conn.howItConnects}</span>
                      </div>
                    </div>

                    <div className="text-sm text-foreground-label whitespace-pre-line bg-muted/50 rounded-lg p-4">
                      {conn.details}
                    </div>

                    {conn.managedAt && (
                      <div className="flex items-center gap-2 text-sm">
                        <Plug className="w-4 h-4 text-foreground-faint" />
                        <span className="text-foreground-label">Also referenced in:</span>
                        <Link to={conn.managedAt} className="text-sky hover:underline font-medium inline-flex items-center gap-1">
                          {conn.managedAtLabel} <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    )}

                    {conn.id === "google-drive" && (
                      <div className="border border-border-subtle rounded-lg p-4 space-y-3">
                        <h4 className="font-semibold text-navy text-sm">Google Apps Script URL</h4>
                        <p className="text-xs text-muted-foreground">
                          This URL connects the website to your Google Drive. Deploy a Google Apps Script web app from your Drive,
                          then paste its URL here.
                        </p>
                        {editingDriveScript ? (
                          <div className="space-y-2">
                            <Input
                              value={driveScriptDraft}
                              onChange={(e) => setDriveScriptDraft(e.target.value)}
                              placeholder="https://script.google.com/macros/s/.../exec"
                              className="text-sm"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={saveDriveScriptUrl}
                                disabled={savingDriveScript}
                                className="bg-navy hover:bg-navy/90 text-white"
                              >
                                {savingDriveScript ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                                Save
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingDriveScript(false)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            {driveScriptUrl ? (
                              <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate max-w-[400px]">
                                {driveScriptUrl}
                              </code>
                            ) : (
                              <span className="text-xs text-foreground-faint italic">No URL configured</span>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setDriveScriptDraft(driveScriptUrl);
                                setEditingDriveScript(true);
                              }}
                            >
                              {driveScriptUrl ? "Edit" : "Set URL"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={openDriveScript}
                              className="gap-1.5"
                            >
                              <FileCode className="w-3.5 h-3.5" />
                              Script
                            </Button>
                            {driveScriptUrl && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={testDriveConnection}
                                disabled={testingDrive}
                              >
                                {testingDrive ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                                Test Connection
                              </Button>
                            )}
                            {driveScriptSaved && (
                              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                                <Check className="w-3.5 h-3.5" /> Saved
                              </span>
                            )}
                          </div>
                        )}
                        {driveTestResult && (
                          <div className={`text-xs p-2 rounded ${driveTestResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                            {driveTestResult.ok ? <Check className="w-3.5 h-3.5 inline mr-1" /> : <X className="w-3.5 h-3.5 inline mr-1" />}
                            {driveTestResult.message}
                          </div>
                        )}

                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer font-medium text-sky hover:text-navy">
                            Setup Instructions
                          </summary>
                          <ol className="mt-2 space-y-1.5 list-decimal list-inside text-foreground-label">
                            <li>Go to <a href="https://script.google.com" target="_blank" rel="noopener noreferrer" className="text-sky hover:underline">script.google.com</a> and create a new project</li>
                            <li>Click the <strong>Script</strong> button above to view the bridge script, copy it, and paste it into the Apps Script editor (replacing any default code)</li>
                            <li>In the Apps Script editor, click <strong>+</strong> next to "Services" (left panel), find <strong>Drive API</strong>, ensure the Identifier is <strong>Drive</strong>, and click <strong>Add</strong> (v2 or v3 both work)</li>
                            <li>In the function dropdown (top toolbar), select <strong>_authoriseScopes</strong> and click <strong>Run</strong>. Accept the permissions when prompted. This grants access for PDF text extraction. (One-time step.)</li>
                            <li>Click <strong>Deploy → New deployment → Web app</strong></li>
                            <li>Set "Execute as" to <strong>Me</strong> and "Who has access" to <strong>Anyone</strong></li>
                            <li>Copy the deployment URL and paste it in the field above</li>
                            <li>Click <strong>Test Connection</strong> to verify it works</li>
                          </ol>
                        </details>

                        {driveScriptUrl && (
                          <div className="border border-border-subtle rounded-lg p-4 space-y-3 mt-3">
                            <h4 className="font-semibold text-navy text-sm flex items-center gap-2">
                              <FolderOpen className="w-4 h-4" />
                              Drive Folder Setup
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              Creates the full folder structure (01–10 plus year sub-folders and '1 Important DO NOT CHANGE FOLDER STRUCTURE' in root, 09 and 10) as defined in the Procedures Manual.
                              Includes 09_Public Reference for documents you want the public AI search to access.
                              Safe to run multiple times — only missing folders are created.
                            </p>
                            <div className="flex items-center gap-3 flex-wrap">
                              <Button
                                size="sm"
                                onClick={setupDriveFolders}
                                disabled={settingUpFolders}
                                className="bg-navy hover:bg-navy/90 text-white gap-1.5"
                              >
                                {settingUpFolders ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
                                {settingUpFolders ? "Setting up..." : "Setup Folders"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={disconnectDrive}
                                className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                              >
                                <X className="w-3.5 h-3.5" />
                                Disconnect Drive
                              </Button>
                            </div>
                            {folderSetupResult && (
                              <div className={`text-xs p-2 rounded ${folderSetupResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                                {folderSetupResult.ok ? <Check className="w-3.5 h-3.5 inline mr-1" /> : <X className="w-3.5 h-3.5 inline mr-1" />}
                                {folderSetupResult.message}
                                {folderSetupResult.ok && folderSetupRootUrl && (
                                  <a href={folderSetupRootUrl} target="_blank" rel="noopener noreferrer" className="text-sky hover:underline ml-1">
                                    Open in Drive <ExternalLink className="w-3 h-3 inline" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {driveScriptUrl && (
                          <div className="border border-border-subtle rounded-lg p-4 space-y-3 mt-3">
                            <h4 className="font-semibold text-navy text-sm flex items-center gap-2">
                              <Database className="w-4 h-4" />
                              Document Index for AI Search
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              Sync your Drive documents so the AI search can read their contents and cite them in answers.
                              All 10 category folders are indexed (01–10). The <strong>public</strong> search only sees documents in <strong>09_Public Reference</strong> — all other folders (including <strong>10_Admin Reference</strong>) are restricted to admin search only.
                              Supports PDFs, Google Docs, spreadsheets, and text files.
                            </p>
                            <div className="flex items-center gap-3 flex-wrap">
                              <Button
                                size="sm"
                                onClick={syncDocumentIndex}
                                disabled={syncing}
                                className="bg-navy hover:bg-navy/90 text-white gap-1.5"
                              >
                                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                {syncing ? "Syncing..." : "Sync Documents"}
                              </Button>
                              {indexStatus && indexStatus.totalDocuments > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={clearDocumentIndex}
                                  disabled={syncing}
                                  className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Clear Index
                                </Button>
                              )}
                              {indexStatus && (
                                <span className="text-xs text-muted-foreground">
                                  {indexStatus.totalDocuments} document{indexStatus.totalDocuments !== 1 ? "s" : ""} indexed
                                  ({indexStatus.readableDocuments} with readable text)
                                  {indexStatus.lastIndexedAt && (
                                    <> — last synced {new Date(indexStatus.lastIndexedAt + "Z").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</>
                                  )}
                                </span>
                              )}
                            </div>
                            {syncResult && (
                              <div className={`text-xs p-2 rounded ${syncResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                                {syncResult.ok ? <Check className="w-3.5 h-3.5 inline mr-1" /> : <X className="w-3.5 h-3.5 inline mr-1" />}
                                {syncResult.message}
                              </div>
                            )}
                            {indexStatus && Array.isArray(indexStatus.documents) && indexStatus.documents.length > 0 && (
                              <details className="text-xs">
                                <summary className="cursor-pointer font-medium text-sky hover:text-navy">
                                  Indexed Documents ({(Array.isArray(indexStatus?.documents) ? indexStatus!.documents : []).length})
                                </summary>
                                <div className="mt-2 space-y-1">
                                  {(Array.isArray(indexStatus?.documents) ? indexStatus!.documents : []).map((doc) => (
                                    <div key={doc.driveFileId} className="flex items-center gap-2 text-foreground-label py-0.5">
                                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${doc.readable ? "bg-emerald-500" : "bg-amber-400"}`} />
                                      <span className="truncate flex-1">{doc.name}</span>
                                      <span className="text-muted-foreground flex-shrink-0">
                                        {doc.charCount > 0
                                          ? `${(doc.charCount / 1000).toFixed(1)}k chars`
                                          : doc.mimeType === "application/pdf" && !doc.readable
                                            ? "PDF — enable Drive API"
                                            : "no text"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {conn.id === "tidyhq" && (
                      <div className="space-y-4">
                        <div className="border border-border-subtle rounded-lg p-4 space-y-3">
                          <h4 className="font-semibold text-navy text-sm">Connection Requirements</h4>
                          <p className="text-xs text-muted-foreground">
                            Two environment secrets must be configured in the Replit Secrets panel for TidyHQ to work.
                          </p>
                          <div className="space-y-2">
                            <div className="flex items-center gap-3 text-sm">
                              {tidyhqStatus?.hasToken ? (
                                <span className="flex items-center gap-1.5 text-emerald-600"><Check className="w-4 h-4" /> TIDYHQ_ACCESS_TOKEN</span>
                              ) : (
                                <span className="flex items-center gap-1.5 text-amber-600"><X className="w-4 h-4" /> TIDYHQ_ACCESS_TOKEN</span>
                              )}
                              <span className="text-xs text-muted-foreground">— API token from TidyHQ Settings → API Access Tokens</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                              {tidyhqStatus?.hasSigningKey ? (
                                <span className="flex items-center gap-1.5 text-emerald-600"><Check className="w-4 h-4" /> TIDYHQ_WEBHOOK_SIGNING_KEY</span>
                              ) : (
                                <span className="flex items-center gap-1.5 text-amber-600"><X className="w-4 h-4" /> TIDYHQ_WEBHOOK_SIGNING_KEY</span>
                              )}
                              <span className="text-xs text-muted-foreground">— Signing key from TidyHQ Settings → Webhooks</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap pt-1">
                            <Button
                              size="sm"
                              onClick={testTidyhqConnection}
                              disabled={testingTidyhq}
                              className="bg-navy hover:bg-navy/90 text-white gap-1.5"
                            >
                              {testingTidyhq ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              Test Connection
                            </Button>
                          </div>
                          {tidyhqTestResult && (
                            <div className={`text-xs p-2 rounded ${tidyhqTestResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                              {tidyhqTestResult.ok ? <Check className="w-3.5 h-3.5 inline mr-1" /> : <X className="w-3.5 h-3.5 inline mr-1" />}
                              {tidyhqTestResult.message}
                            </div>
                          )}
                        </div>

                        <div className="border border-border-subtle rounded-lg p-4 space-y-3">
                          <h4 className="font-semibold text-navy text-sm">Webhook URL</h4>
                          <p className="text-xs text-muted-foreground">
                            Configure this URL in your TidyHQ webhook settings so group membership changes sync automatically.
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate flex-1">
                              https://sky-high-website.replit.app/api/tidyhq/webhook
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 shrink-0"
                              onClick={() => {
                                navigator.clipboard.writeText("https://sky-high-website.replit.app/api/tidyhq/webhook");
                              }}
                            >
                              <Copy className="w-3.5 h-3.5" /> Copy
                            </Button>
                          </div>
                        </div>

                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer font-medium text-sky hover:text-navy">
                            Setup Instructions
                          </summary>
                          <ol className="mt-2 space-y-1.5 list-decimal list-inside text-foreground-label">
                            <li>Log into your <a href="https://www.tidyhq.com" target="_blank" rel="noopener noreferrer" className="text-sky hover:underline">TidyHQ admin portal</a></li>
                            <li>Go to <strong>Settings → Developers → API Access Tokens</strong> and create a new token</li>
                            <li>Copy the token and add it as <strong>TIDYHQ_ACCESS_TOKEN</strong> in Replit Secrets</li>
                            <li>Go to <strong>Settings → Developers → Webhooks</strong> and create a new webhook</li>
                            <li>Set the webhook URL to the URL shown above and subscribe to <strong>contact.group.added</strong> and <strong>contact.group.removed</strong> events</li>
                            <li>Copy the webhook signing key and add it as <strong>TIDYHQ_WEBHOOK_SIGNING_KEY</strong> in Replit Secrets</li>
                            <li>Click <strong>Test Connection</strong> above to verify the API token works</li>
                            <li>Use the <strong>TidyHQ Group Sync</strong> card below to set up group → role mappings</li>
                          </ol>
                        </details>
                      </div>
                    )}

                    {conn.id === "google-sheets" && (
                      <div className="space-y-4">
                        <div className="border border-border-subtle rounded-lg p-4 space-y-3">
                          <h4 className="font-semibold text-navy text-sm">Google Sheet URL</h4>
                          <p className="text-xs text-muted-foreground">
                            The URL of the Google Sheet used as the club's asset register.
                          </p>
                          {editingSheet ? (
                            <div className="space-y-2">
                              <Input
                                value={sheetDraft}
                                onChange={(e) => setSheetDraft(e.target.value)}
                                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                                className="text-sm"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={saveSheetUrl} disabled={savingSheet} className="bg-navy hover:bg-navy/90 text-white">
                                  {savingSheet ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                                  Save
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingSheet(false)}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 flex-wrap">
                              {sheetUrl ? (
                                <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-sky hover:underline font-mono truncate max-w-[400px]">
                                  {sheetUrl}
                                </a>
                              ) : (
                                <span className="text-xs text-foreground-faint italic">No sheet URL configured</span>
                              )}
                              <Button size="sm" variant="outline" onClick={() => { setSheetDraft(sheetUrl); setEditingSheet(true); setSheetTestResult(null); }}>
                                {sheetUrl ? "Edit" : "Set URL"}
                              </Button>
                              {sheetUrl && (
                                <a href={sheetUrl} target="_blank" rel="noopener noreferrer">
                                  <Button size="sm" variant="outline" className="gap-1.5">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Open Sheet
                                  </Button>
                                </a>
                              )}
                              {sheetSaved && (
                                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Saved
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="border border-border-subtle rounded-lg p-4 space-y-3">
                          <h4 className="font-semibold text-navy text-sm">Apps Script URL</h4>
                          <p className="text-xs text-muted-foreground">
                            The deployed Web app URL from the Apps Script on your Asset Register sheet. This is separate from the Drive bridge script.
                          </p>
                          {editingAssetScript ? (
                            <div className="space-y-2">
                              <Input
                                value={assetScriptDraft}
                                onChange={(e) => setAssetScriptDraft(e.target.value)}
                                placeholder="https://script.google.com/macros/s/.../exec"
                                className="text-sm"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={saveAssetScriptUrl} disabled={savingAssetScript} className="bg-navy hover:bg-navy/90 text-white">
                                  {savingAssetScript ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                                  Save
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingAssetScript(false)}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 flex-wrap">
                              {assetScriptUrl ? (
                                <span className="text-xs text-sky font-mono truncate max-w-[400px]">{assetScriptUrl}</span>
                              ) : (
                                <span className="text-xs text-foreground-faint italic">No Apps Script URL configured</span>
                              )}
                              <Button size="sm" variant="outline" onClick={() => { setAssetScriptDraft(assetScriptUrl); setEditingAssetScript(true); setSheetTestResult(null); }}>
                                {assetScriptUrl ? "Edit" : "Set URL"}
                              </Button>
                              <Button size="sm" variant="outline" onClick={openAssetScript} className="gap-1.5">
                                <FileCode className="w-3.5 h-3.5" />
                                Script
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={testSheetConnection}
                                disabled={testingSheet || !assetScriptUrl}
                                title={!assetScriptUrl ? "Set the Apps Script URL first" : ""}
                              >
                                {testingSheet ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
                                Test Connection
                              </Button>
                              {assetScriptSaved && (
                                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Saved
                                </span>
                              )}
                            </div>
                          )}
                          {sheetTestResult && (
                            <div className={`text-xs p-2 rounded ${sheetTestResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                              {sheetTestResult.ok ? <Check className="w-3.5 h-3.5 inline mr-1" /> : <X className="w-3.5 h-3.5 inline mr-1" />}
                              {sheetTestResult.message}
                            </div>
                          )}
                        </div>

                        <div className="border border-border-subtle rounded-lg p-4 space-y-3">
                          <h4 className="font-semibold text-navy text-sm">Setup Instructions</h4>
                          <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                            <li>Create a new Google Sheet (or use the tab templates below)</li>
                            <li>Set up 4 tabs: <strong className="text-foreground-label">ASSET REGISTER</strong>, <strong className="text-foreground-label">LOAN REGISTER</strong>, <strong className="text-foreground-label">CONDITION RATINGS</strong>, <strong className="text-foreground-label">INSPECTION FREQUENCIES</strong></li>
                            <li>In the Google Sheet, go to <strong className="text-foreground-label">Extensions → Apps Script</strong></li>
                            <li>Delete any existing code in the editor</li>
                            <li>Click the <strong className="text-foreground-label">Script</strong> button above, copy the code, and paste it into the Apps Script editor</li>
                            <li>Click the <strong className="text-foreground-label">disk icon</strong> (or Ctrl+S) to save</li>
                            <li>Click <strong className="text-foreground-label">Deploy → New deployment</strong></li>
                            <li>Click the gear icon next to "Select type" and choose <strong className="text-foreground-label">Web app</strong></li>
                            <li>Set "Execute as" to <strong className="text-foreground-label">Me</strong>, set "Who has access" to <strong className="text-foreground-label">Anyone</strong></li>
                            <li>Click <strong className="text-foreground-label">Deploy</strong> and authorise when prompted</li>
                            <li>Copy the <strong className="text-foreground-label">Web app URL</strong> and paste it as the Apps Script URL above</li>
                            <li>Paste the Google Sheet URL above as well</li>
                            <li>Click <strong className="text-foreground-label">Test Connection</strong> to verify everything is working</li>
                          </ol>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">Tab templates (CSV):</span>
                          <a href="/assets/template-asset-register.csv" download="ASSET REGISTER.csv" className="text-xs text-sky hover:text-navy font-medium flex items-center gap-1">
                            <Download className="w-3 h-3" /> Asset Register
                          </a>
                          <span className="text-foreground-faint">·</span>
                          <a href="/assets/template-loan-register.csv" download="LOAN REGISTER.csv" className="text-xs text-sky hover:text-navy font-medium flex items-center gap-1">
                            <Download className="w-3 h-3" /> Loan Register
                          </a>
                          <span className="text-foreground-faint">·</span>
                          <a href="/assets/template-condition-ratings.csv" download="CONDITION RATINGS.csv" className="text-xs text-sky hover:text-navy font-medium flex items-center gap-1">
                            <Download className="w-3 h-3" /> Condition Ratings
                          </a>
                          <span className="text-foreground-faint">·</span>
                          <a href="/assets/template-inspection-frequencies.csv" download="INSPECTION FREQUENCIES.csv" className="text-xs text-sky hover:text-navy font-medium flex items-center gap-1">
                            <Download className="w-3 h-3" /> Inspection Frequencies
                          </a>
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        <Card id="conn-tidyhq-group-sync" className="overflow-hidden border-t-4 border-t-teal-500 mt-4">
          <button
            onClick={handleToggleGroupSync}
            className="w-full text-left"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="text-navy shrink-0 mt-0.5"><Users className="w-6 h-6" /></div>
                  <div className="min-w-0">
                    <CardTitle className="text-navy text-lg">TidyHQ Group Sync</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Configure group-to-role mappings for automatic webhook sync and view the sync log.
                      {tidyhqStatus && (
                        <span className="ml-1 text-xs">
                          ({tidyhqStatus.mappingCount} mapping{tidyhqStatus.mappingCount !== 1 ? "s" : ""}, {tidyhqStatus.recentWebhooks} webhook{tidyhqStatus.recentWebhooks !== 1 ? "s" : ""} in 7d)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {groupSyncExpanded ? (
                    <ChevronUp className="w-5 h-5 text-foreground-faint" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-foreground-faint" />
                  )}
                </div>
              </div>
            </CardHeader>
          </button>

          {groupSyncExpanded && (
            <CardContent className="border-t border-border-subtle pt-4 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-navy">Group → Role Mappings</h3>
                  <Button onClick={openAddMappingModal} className="bg-navy hover:bg-navy-light text-white" size="sm">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Mapping
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  When a TidyHQ webhook fires for one of these groups, the matching local contact's role flag will be automatically set or cleared.
                </p>

                {groupMappings.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    No mappings configured yet. Click "Add Mapping" to get started.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-muted border-b border-border-subtle">
                          <th className="p-3 font-semibold text-navy text-sm">TidyHQ Group</th>
                          <th className="p-3 font-semibold text-navy text-sm">Local Role Flag</th>
                          <th className="p-3 font-semibold text-navy text-sm text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(groupMappings) ? groupMappings : []).map(m => (
                          <tr key={m.id} className="border-b border-border-faint hover:bg-background">
                            <td className="p-3 font-medium">{m.tidyhqGroupName}</td>
                            <td className="p-3">
                              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                {groupSyncRoleLabels[m.localRoleFlag] || m.localRoleFlag}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleDeleteMapping(m.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-navy">Webhook Sync Log</h3>
                  <Button variant="outline" size="sm" onClick={fetchWebhookLogs} className="gap-1">
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Recent webhook events processed from TidyHQ.
                </p>

                {webhookLogs.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    No webhook events received yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {(Array.isArray(webhookLogs) ? webhookLogs : []).map(entry => (
                      <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg bg-background border border-border-faint">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${groupSyncActionColors[entry.action] || "bg-gray-100 text-gray-600"}`}>
                          {entry.action}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-navy">{entry.detail || entry.eventType}</p>
                          <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                            {entry.localContactName && <span>Contact: {entry.localContactName}</span>}
                            {entry.tidyhqGroupName && <span>Group: {entry.tidyhqGroupName}</span>}
                            {entry.roleFlag && <span>Flag: {groupSyncRoleLabels[entry.roleFlag] || entry.roleFlag}</span>}
                          </div>
                        </div>
                        <span className="text-xs text-foreground-faint whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        <Card id="conn-smart-assistant" className="overflow-hidden border-t-4 border-t-sky mt-4">
          <button
            onClick={() => toggleExpanded("smart-assistant")}
            className="w-full text-left"
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="text-navy shrink-0 mt-0.5"><MessageCircle className="w-6 h-6" /></div>
                  <div className="min-w-0">
                    <CardTitle className="text-navy text-lg">Smart Assistant</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">Configure the Smart Search disclaimer, call-to-action message, committee contact link, and AI prompt for both public and admin searches.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Active
                  </span>
                  {expandedCards.has("smart-assistant") ? (
                    <ChevronUp className="w-5 h-5 text-foreground-faint" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-foreground-faint" />
                  )}
                </div>
              </div>
            </CardHeader>
          </button>

          {expandedCards.has("smart-assistant") && (
            <CardContent className="border-t border-border-subtle pt-4 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground-label">Search Disclaimer</label>
                <p className="text-xs text-muted-foreground">Appended in bold to every Smart Search reply (public and admin). Leave blank to disable.</p>
                <input
                  type="text"
                  className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky text-sm"
                  value={saDisclaimer}
                  onChange={(e) => { setSaDisclaimer(e.target.value); markDirty(); }}
                  placeholder="General information only. Consult SAFA/CASA docs and Site Rules."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground-label">Committee Contact Page Link</label>
                <input
                  type="text"
                  className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky text-sm"
                  value={saCommitteeLink}
                  onChange={(e) => { setSaCommitteeLink(e.target.value); markDirty(); }}
                  placeholder="/page/committee"
                />
                <p className="text-xs text-muted-foreground">When pilots ask about physical items (porosity meter, club gear), they'll be directed to this page.</p>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground-label">Call-to-Action Message</label>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-muted-foreground">Shown periodically in the Smart Assistant chat. Supports formatting and line breaks.</p>
                  <MarkdownHelpLink compact />
                </div>
                <textarea
                  className="w-full p-3 border border-border rounded-lg focus:ring-1 focus:ring-sky focus:border-sky text-sm leading-relaxed"
                  rows={3}
                  value={saCtaMessage}
                  onChange={(e) => { setSaCtaMessage(e.target.value); markDirty(); }}
                  placeholder="e.g. Enjoying our Smart Search? **[Join SkyHigh today!](/new-pilots)**"
                />
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-foreground-label whitespace-nowrap">Show every</label>
                  <select
                    className="p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky text-sm"
                    value={saCtaFrequency}
                    onChange={(e) => { setSaCtaFrequency(e.target.value); markDirty(); }}
                  >
                    <option value="0">Off</option>
                    <option value="1">Every response</option>
                    <option value="2">Every 2nd response</option>
                    <option value="3">Every 3rd response</option>
                    <option value="4">Every 4th response</option>
                    <option value="5">Every 5th response</option>
                  </select>
                  {saCtaFrequency === "0" && <span className="text-xs text-foreground-faint">CTA is disabled</span>}
                </div>
              </div>

              <div>
                <button
                  onClick={() => setSaShowPrompt(!saShowPrompt)}
                  className="text-xs text-sky hover:underline"
                >
                  {saShowPrompt ? "Hide Prompt" : "Edit Prompt"}
                </button>
                {saShowPrompt && (
                  <div className="space-y-2 mt-2">
                    <textarea
                      className="w-full p-3 border border-border rounded-lg focus:ring-1 focus:ring-sky focus:border-sky text-sm font-mono leading-relaxed"
                      rows={8}
                      value={saPrompt || saDefaultPrompt}
                      onChange={(e) => { setSaPrompt(e.target.value); markDirty(); }}
                      placeholder="Smart assistant behavior prompt..."
                    />
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => { setSaPrompt(""); markDirty(); }}
                        className="text-xs text-orange hover:text-orange/80 font-medium transition-colors"
                      >
                        Reset to Default
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {saSaveMsg && (
                <div className={`p-3 rounded-lg text-sm ${saSaveMsg.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                  {saSaveMsg.text}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={saveSmartAssistant} className={`px-8 transition-all duration-300 ${saJustSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : "bg-navy hover:bg-navy-light"} text-white`}>
                  {saJustSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save Smart Search Settings</>}
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {showDriveScript && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDriveScript(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="font-semibold text-navy text-base">Google Drive Bridge Script</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Copy this script and paste it into your Google Apps Script editor</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={copyDriveScript} className="gap-1.5 bg-navy hover:bg-navy/90 text-white">
                  {scriptCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {scriptCopied ? "Copied" : "Copy Script"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowDriveScript(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="overflow-auto flex-1 p-4">
              <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre text-foreground-label leading-relaxed">
                {driveScriptContent}
              </pre>
            </div>
          </div>
        </div>
      )}

      {showAssetScript && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAssetScript(false)}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="font-semibold text-navy text-base">Asset Register Apps Script</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Copy this script and paste it into your Google Apps Script editor</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={copyAssetScript} className="gap-1.5 bg-navy hover:bg-navy/90 text-white">
                  {assetScriptCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {assetScriptCopied ? "Copied" : "Copy Script"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAssetScript(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="overflow-auto flex-1 p-4">
              <pre className="text-xs font-mono bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre text-foreground-label leading-relaxed">
                {assetScriptContent}
              </pre>
            </div>
          </div>
        </div>
      )}

      {showAddMapping && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-navy">Add Group Mapping</h3>
              <button onClick={() => setShowAddMapping(false)} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>
            <div className="space-y-4">
              {addMappingError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{addMappingError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground-label mb-1">TidyHQ Group</label>
                {loadingTidyhqGroups ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky" />
                    Loading groups from TidyHQ...
                  </div>
                ) : (
                  <select
                    value={selectedGroupId}
                    onChange={e => setSelectedGroupId(e.target.value)}
                    className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                  >
                    <option value="">Select a group...</option>
                    {(Array.isArray(tidyhqGroups) ? tidyhqGroups : []).map(g => (
                      <option key={g.id} value={String(g.id)}>{g.label} ({g.size} members)</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground-label mb-1">Local Role Flag</label>
                <select
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}
                  className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                >
                  <option value="">Select a role...</option>
                  {Object.entries(groupSyncRoleLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setShowAddMapping(false)}>Cancel</Button>
                <Button
                  className="bg-navy hover:bg-navy-light text-white"
                  onClick={handleAddMapping}
                  disabled={savingMapping}
                >
                  {savingMapping ? "Saving..." : "Add Mapping"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <UnsavedChangesModal blocker={blocker} onSave={saveSmartAssistant} />
    </div>
  );
}
