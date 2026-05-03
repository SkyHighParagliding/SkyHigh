import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Clock, Save, Loader2, Lock, Play, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminForm } from "@/hooks/useAdminForm";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";

interface ScheduleSettings {
  schedSiteguideHour: string;
  schedSiteguideMinute: string;
  schedExtendedForecastHour: string;
  schedExtendedForecastMinute: string;
  submissionNotifyHour: string;
  submissionNotifyEnabled: string;
  weatherScraperMinInterval: string;
  weatherScraperMaxInterval: string;
  weatherScraperStartHour: string;
  weatherScraperEndHour: string;
  schedDriveSyncHour: string;
  schedDriveSyncMinute: string;
  driveSyncEnabled: string;
  autoDownloadZoneData: string;
  cacheAdminSessionTtl: string;
  cacheTidyHqMemberTtl: string;
  cacheBomTideTtl: string;
  cacheAstroTideTtl: string;
  cacheTidyHqEventsTtl: string;
  cacheSearchContextTtl: string;
  cacheAssetRegisterTtl: string;
  cacheFreeFlightWxTtl: string;
}

const DEFAULTS: ScheduleSettings = {
  schedSiteguideHour: "5",
  schedSiteguideMinute: "0",
  schedExtendedForecastHour: "5",
  schedExtendedForecastMinute: "30",
  submissionNotifyHour: "19",
  submissionNotifyEnabled: "true",
  weatherScraperMinInterval: "15",
  weatherScraperMaxInterval: "30",
  weatherScraperStartHour: "7",
  weatherScraperEndHour: "20",
  schedDriveSyncHour: "4",
  schedDriveSyncMinute: "0",
  driveSyncEnabled: "false",
  autoDownloadZoneData: "true",
  cacheAdminSessionTtl: "24",
  cacheTidyHqMemberTtl: "15",
  cacheBomTideTtl: "6",
  cacheAstroTideTtl: "30",
  cacheTidyHqEventsTtl: "5",
  cacheSearchContextTtl: "5",
  cacheAssetRegisterTtl: "10",
  cacheFreeFlightWxTtl: "30",
};

interface CacheTimer {
  key: keyof ScheduleSettings;
  label: string;
  description: string;
  unit: string;
  min: number;
  max: number;
}

const CACHE_TIMERS: CacheTimer[] = [
  { key: "cacheAdminSessionTtl", label: "Admin Session TTL", description: "How long an admin login session lasts before requiring re-authentication", unit: "hours", min: 1, max: 72 },
  { key: "cacheTidyHqMemberTtl", label: "TidyHQ Member Cache", description: "How long the TidyHQ member email list is cached before refreshing", unit: "minutes", min: 1, max: 1440 },
  { key: "cacheBomTideTtl", label: "BOM Tide Predictions Cache", description: "How long Bureau of Meteorology tide data is cached", unit: "hours", min: 1, max: 24 },
  { key: "cacheAstroTideTtl", label: "Astronomical Tide Cache", description: "How long calculated astronomical tide predictions are cached", unit: "minutes", min: 1, max: 1440 },
  { key: "cacheTidyHqEventsTtl", label: "TidyHQ Events Cache", description: "How long the TidyHQ events list is cached", unit: "minutes", min: 1, max: 1440 },
  { key: "cacheSearchContextTtl", label: "Search Context Cache", description: "How long the AI search context is cached before rebuilding", unit: "minutes", min: 1, max: 1440 },
  { key: "cacheAssetRegisterTtl", label: "Asset Register Cache", description: "How long the asset register context is cached for search", unit: "minutes", min: 1, max: 1440 },
  { key: "cacheFreeFlightWxTtl", label: "FreeFlightWx Cache", description: "How long live weather station data from FreeFlightWx is cached", unit: "seconds", min: 5, max: 3600 },
];

function formatTime(hour: string, minute: string): string {
  const h = parseInt(hour) || 0;
  const m = parseInt(minute) || 0;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function AdminScheduledTasks() {
  const { token } = useAuth();
  const [settings, setSettings] = useState<ScheduleSettings>({ ...DEFAULTS });
  const [originalSettings, setOriginalSettings] = useState<ScheduleSettings>({ ...DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<{ job: string; type: "success" | "error"; text: string } | null>(null);
  const [zoneDataVersion, setZoneDataVersion] = useState<string | null>(null);

  const { markDirty, blocker, saving, save } = useAdminForm({ successMessage: "Schedules saved" });

  useEffect(() => {
    window.scrollTo(0, 0);
    api.get<Record<string, string>>("/api/settings", token)
      .then((data) => {
        const loaded: ScheduleSettings = { ...DEFAULTS };
        for (const key of Object.keys(DEFAULTS) as (keyof ScheduleSettings)[]) {
          if (data[key] !== undefined) loaded[key] = data[key];
        }
        setSettings(loaded);
        setOriginalSettings(loaded);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    api.get<{ version: string | null }>("/api/sites/xc/zones/version", token)
      .then((data) => setZoneDataVersion(data.version))
      .catch(() => {});
  }, [token]);

  function updateField(key: keyof ScheduleSettings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    markDirty();
  }

  async function handleSave() {
    await save(async () => {
      await api.put("/api/settings", settings, token);
      setOriginalSettings({ ...settings });
    });
  }

  async function triggerJob(jobId: string, endpoint: string, method = "POST") {
    setRunningJob(jobId);
    setJobResult(null);
    try {
      const data = method === "POST"
        ? await api.post<Record<string, string>>(endpoint, {}, token)
        : await api.get<Record<string, string>>(endpoint, token);
      setJobResult({ job: jobId, type: "success", text: data.message || "Completed successfully" });
      toast.success(data.message || "Task completed");

      if (jobId === "zoneData") {
        api.get<{ version: string | null }>("/api/sites/xc/zones/version", token)
          .then((v) => setZoneDataVersion(v.version))
          .catch(() => {});
      }
    } catch (e: unknown) {
      setJobResult({ job: jobId, type: "error", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setRunningJob(null);
    }
  }

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  if (loading) {
    return (
      <div className="bg-background min-h-screen py-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-sky" />
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link to="/admin" className="text-sky hover:underline text-sm flex items-center gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-navy flex items-center gap-2">
                <Clock className="w-8 h-8" /> Scheduled Tasks
              </h1>
              <p className="text-foreground-secondary mt-1">All times are Melbourne time (AEST/AEDT). Tasks run via an hourly check.</p>
            </div>
            <Button onClick={handleSave} disabled={saving || !hasChanges} className="bg-navy hover:bg-navy/90 text-white">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save All
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="border-t-4 border-t-sky">
            <CardHeader>
              <CardTitle className="text-navy">Site Guide Version Check & Auto-Import</CardTitle>
              <p className="text-sm text-muted-foreground">Checks if the SAFA site guide has a new version. If changed and auto-import is enabled, triggers a bulk site import.</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-foreground-label whitespace-nowrap">Run at:</label>
                  <Input type="number" min="0" max="23" className="w-20" value={settings.schedSiteguideHour} onChange={(e) => updateField("schedSiteguideHour", e.target.value)} />
                  <span className="text-muted-foreground">:</span>
                  <Input type="number" min="0" max="59" step="5" className="w-20" value={settings.schedSiteguideMinute} onChange={(e) => updateField("schedSiteguideMinute", e.target.value)} />
                  <span className="text-sm text-muted-foreground ml-1">{formatTime(settings.schedSiteguideHour, settings.schedSiteguideMinute)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-teal-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-navy">Zone Data Auto-Download</CardTitle>
                {zoneDataVersion && (
                  <span className="text-xs font-medium bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">v{zoneDataVersion}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Automatically downloads Siteguide zone data (LZ, no-go, powerlines, airspace) when a version change is detected. Data includes landing zones, no-fly zones, hazards, and CASA airspace.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                  checked={settings.autoDownloadZoneData !== "false"}
                  onChange={(e) => updateField("autoDownloadZoneData", e.target.checked ? "true" : "false")}
                />
                <span className="text-sm font-medium text-foreground-label">Auto-download on version change</span>
              </label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={runningJob === "zoneData"}
                  onClick={() => triggerJob("zoneData", "/api/sites/xc/zones/refresh")}
                >
                  {runningJob === "zoneData" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                  Fetch Now
                </Button>
                {jobResult?.job === "zoneData" && (
                  <span className={`text-sm ${jobResult.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
                    {jobResult.type === "success" ? "Zone data loaded" : jobResult.text}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-indigo-500">
            <CardHeader>
              <CardTitle className="text-navy">Extended Forecast Fetch</CardTitle>
              <p className="text-sm text-muted-foreground">Downloads the 7-day extended weather forecast grid from Open-Meteo for all Victoria sites.</p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-foreground-label whitespace-nowrap">Run at:</label>
                  <Input type="number" min="0" max="23" className="w-20" value={settings.schedExtendedForecastHour} onChange={(e) => updateField("schedExtendedForecastHour", e.target.value)} />
                  <span className="text-muted-foreground">:</span>
                  <Input type="number" min="0" max="59" step="5" className="w-20" value={settings.schedExtendedForecastMinute} onChange={(e) => updateField("schedExtendedForecastMinute", e.target.value)} />
                  <span className="text-sm text-muted-foreground ml-1">{formatTime(settings.schedExtendedForecastHour, settings.schedExtendedForecastMinute)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-amber-500">
            <CardHeader>
              <CardTitle className="text-navy">Image Submission Email Notifications</CardTitle>
              <p className="text-sm text-muted-foreground">Sends email to Social Media committee contacts when new image submissions are pending review.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                  checked={settings.submissionNotifyEnabled === "true"}
                  onChange={(e) => updateField("submissionNotifyEnabled", e.target.checked ? "true" : "false")}
                />
                <span className="text-sm font-medium text-foreground-label">Enabled</span>
              </label>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground-label whitespace-nowrap">Send at hour:</label>
                <Input type="number" min="0" max="23" className="w-20" value={settings.submissionNotifyHour} onChange={(e) => updateField("submissionNotifyHour", e.target.value)} />
                <span className="text-sm text-muted-foreground ml-1">({formatTime(settings.submissionNotifyHour, "0")})</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-emerald-500">
            <CardHeader>
              <CardTitle className="text-navy">Live Weather Scraper</CardTitle>
              <p className="text-sm text-muted-foreground">Fetches live wind data from Live-Wind and Open-Meteo for sites with live weather enabled. Runs at random intervals within the configured range during operating hours.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground-label block mb-1">Min interval (minutes)</label>
                  <Input type="number" min="5" max="120" className="w-full" value={settings.weatherScraperMinInterval} onChange={(e) => updateField("weatherScraperMinInterval", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground-label block mb-1">Max interval (minutes)</label>
                  <Input type="number" min="5" max="120" className="w-full" value={settings.weatherScraperMaxInterval} onChange={(e) => updateField("weatherScraperMaxInterval", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground-label block mb-1">Operating start hour</label>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0" max="23" className="w-full" value={settings.weatherScraperStartHour} onChange={(e) => updateField("weatherScraperStartHour", e.target.value)} />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">{formatTime(settings.weatherScraperStartHour, "0")}</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground-label block mb-1">Operating end hour</label>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0" max="23" className="w-full" value={settings.weatherScraperEndHour} onChange={(e) => updateField("weatherScraperEndHour", e.target.value)} />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">{formatTime(settings.weatherScraperEndHour, "0")}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Scraper sleeps outside operating hours. Random interval between min and max prevents API rate-limiting.</p>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-violet-500">
            <CardHeader>
              <CardTitle className="text-navy">Google Drive Document Sync</CardTitle>
              <p className="text-sm text-muted-foreground">Automatically syncs and indexes documents from Google Drive via the Apps Script bridge. Requires the Drive connection to be configured.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5 text-sky focus:ring-sky border-border rounded cursor-pointer"
                  checked={settings.driveSyncEnabled === "true"}
                  onChange={(e) => updateField("driveSyncEnabled", e.target.checked ? "true" : "false")}
                />
                <span className="text-sm font-medium text-foreground-label">Enable automatic daily sync</span>
              </label>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground-label whitespace-nowrap">Run at:</label>
                <Input type="number" min="0" max="23" className="w-20" value={settings.schedDriveSyncHour} onChange={(e) => updateField("schedDriveSyncHour", e.target.value)} />
                <span className="text-muted-foreground">:</span>
                <Input type="number" min="0" max="59" step="5" className="w-20" value={settings.schedDriveSyncMinute} onChange={(e) => updateField("schedDriveSyncMinute", e.target.value)} />
                <span className="text-sm text-muted-foreground ml-1">{formatTime(settings.schedDriveSyncHour, settings.schedDriveSyncMinute)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={runningJob === "driveSync"}
                  onClick={() => triggerJob("driveSync", "/api/documents/index/sync")}
                >
                  {runningJob === "driveSync" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
                  Run Now
                </Button>
                {jobResult?.job === "driveSync" && (
                  <span className={`text-sm ${jobResult.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
                    {jobResult.text}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-gray-300">
            <CardHeader>
              <CardTitle className="text-navy flex items-center gap-2">
                <Lock className="w-5 h-5 text-muted-foreground" /> Cache Timers
              </CardTitle>
              <p className="text-sm text-muted-foreground">Configure how long various data caches are retained before refreshing.</p>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border-faint">
                {CACHE_TIMERS.map((timer) => (
                  <div key={timer.key} className="py-4 grid grid-cols-12 gap-4 items-start">
                    <div className="col-span-6">
                      <p className="text-sm font-medium text-foreground-label">{timer.label}</p>
                      <p className="text-xs text-muted-foreground">{timer.description}</p>
                    </div>
                    <div className="col-span-3 flex items-center gap-2 justify-end">
                      <Input
                        type="number"
                        min={timer.min}
                        max={timer.max}
                        className="w-24"
                        value={settings[timer.key]}
                        onChange={(e) => updateField(timer.key, e.target.value)}
                      />
                    </div>
                    <div className="col-span-3 text-sm text-muted-foreground text-right">{timer.unit}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <UnsavedChangesModal blocker={blocker} onSave={handleSave} />
    </div>
  );
}
