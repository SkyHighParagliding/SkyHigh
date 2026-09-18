import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TimeInput, HourInput } from "@/components/ui/TimeInput";
import { ArrowLeft, Clock, Save, Loader2, Lock, Play, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminForm } from "@/hooks/useAdminForm";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";

interface ScheduleSettings {
  schedSiteguideHour: string;
  schedSiteguideMinute: string;
  schedFineGridHour: string;
  schedFineGridMinute: string;
  schedThermalGridHour: string;
  schedThermalGridMinute: string;
  schedExtendedForecastHour: string;
  schedExtendedForecastMinute: string;
  submissionNotifyHour: string;
  submissionNotifyEnabled: string;
  weatherScraperStartHour: string;
  weatherScraperEndHour: string;
  weatherScraperRunContinuously: string;
  weatherScraper_ffwx_min: string;
  weatherScraper_ffwx_max: string;
  weatherScraper_wu_min: string;
  weatherScraper_wu_max: string;
  weatherScraper_livewind_min: string;
  weatherScraper_livewind_max: string;
  weatherScraper_bom_min: string;
  weatherScraper_bom_max: string;
  weatherScraper_davis_min: string;
  weatherScraper_davis_max: string;
  schedDriveSyncHour: string;
  schedDriveSyncMinute: string;
  driveSyncEnabled: string;
  autoDownloadZoneData: string;
  autoImportEnabled: string;
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
  schedFineGridHour: "5",
  schedFineGridMinute: "0",
  schedThermalGridHour: "5",
  schedThermalGridMinute: "26",
  schedExtendedForecastHour: "5",
  schedExtendedForecastMinute: "30",
  submissionNotifyHour: "19",
  submissionNotifyEnabled: "true",
  weatherScraperStartHour: "7",
  weatherScraperEndHour: "20",
  weatherScraperRunContinuously: "false",
  weatherScraper_ffwx_min: "2",
  weatherScraper_ffwx_max: "3",
  weatherScraper_wu_min: "14",
  weatherScraper_wu_max: "15",
  weatherScraper_livewind_min: "5",
  weatherScraper_livewind_max: "10",
  weatherScraper_bom_min: "10",
  weatherScraper_bom_max: "20",
  weatherScraper_davis_min: "5",
  weatherScraper_davis_max: "10",
  schedDriveSyncHour: "4",
  schedDriveSyncMinute: "0",
  driveSyncEnabled: "false",
  autoDownloadZoneData: "true",
  autoImportEnabled: "true",
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
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link to="/admin" className="text-accent hover:underline text-sm flex items-center gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-ink flex items-center gap-2">
                <Clock className="w-8 h-8" /> Scheduled Tasks
              </h1>
              <p className="text-foreground-secondary mt-1">All times are Melbourne time (AEST/AEDT). Tasks run via an hourly check.</p>
            </div>
            <Button onClick={handleSave} disabled={saving || !hasChanges} className="bg-ink hover:bg-ink/90 text-white">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save All
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="border-t-4 border-t-accent">
            <CardHeader>
              <CardTitle className="text-ink">Site Guide Version Check & Auto-Import</CardTitle>
              <p className="text-sm text-muted-foreground">Checks if the SAFA site guide has a new version. If changed and auto-import is enabled, triggers a bulk site import for the last imported state.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground-label whitespace-nowrap">Run at:</label>
                <TimeInput
                  hour={settings.schedSiteguideHour}
                  minute={settings.schedSiteguideMinute}
                  onChange={(h, m) => { updateField("schedSiteguideHour", h); updateField("schedSiteguideMinute", m); }}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5 text-accent focus:ring-accent border-border rounded cursor-pointer"
                  checked={settings.autoImportEnabled !== "false"}
                  onChange={(e) => updateField("autoImportEnabled", e.target.checked ? "true" : "false")}
                />
                <span className="text-sm font-medium text-foreground-label">Auto-import sites on version change</span>
              </label>
              <p className="text-xs text-muted-foreground">Only runs after an admin has done at least one manual import (Admin → Sites → Siteguide Import), which sets the state to re-import.</p>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-teal-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-ink">Zone Data Auto-Download</CardTitle>
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
                  className="w-5 h-5 text-accent focus:ring-accent border-border rounded cursor-pointer"
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
              <CardTitle className="text-ink">Grid Data Fetch</CardTitle>
              <p className="text-sm text-muted-foreground">Daily download times (Melbourne) for the forecast grids that power the maps. Each is cached for the whole day. Manual "Fetch Now" buttons live on the Weather page.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {([
                { label: "Wind (fine grid)", hourKey: "schedFineGridHour", minKey: "schedFineGridMinute" },
                { label: "Thermal grid", hourKey: "schedThermalGridHour", minKey: "schedThermalGridMinute" },
                { label: "7-Day (extended)", hourKey: "schedExtendedForecastHour", minKey: "schedExtendedForecastMinute" },
              ] as const).map(row => (
                <div key={row.hourKey} className="flex items-center gap-2">
                  <label className="text-sm font-medium text-foreground-label w-36 shrink-0">{row.label}</label>
                  <span className="text-sm text-muted-foreground">Run at:</span>
                  <TimeInput
                    hour={settings[row.hourKey]}
                    minute={settings[row.minKey]}
                    onChange={(h, m) => { updateField(row.hourKey, h); updateField(row.minKey, m); }}
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Changes take effect from the next day's run (or the next server restart).</p>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-amber-500">
            <CardHeader>
              <CardTitle className="text-ink">Image Submission Email Notifications</CardTitle>
              <p className="text-sm text-muted-foreground">Sends email to Social Media committee contacts when new image submissions are pending review.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5 text-accent focus:ring-accent border-border rounded cursor-pointer"
                  checked={settings.submissionNotifyEnabled === "true"}
                  onChange={(e) => updateField("submissionNotifyEnabled", e.target.checked ? "true" : "false")}
                />
                <span className="text-sm font-medium text-foreground-label">Enabled</span>
              </label>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground-label whitespace-nowrap">Send at:</label>
                <HourInput hour={settings.submissionNotifyHour} onChange={(h) => updateField("submissionNotifyHour", h)} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-emerald-500">
            <CardHeader>
              <CardTitle className="text-ink">Live Weather Scraper</CardTitle>
              <p className="text-sm text-muted-foreground">Each data source runs on its own independent schedule. Intervals are randomised between min and max to spread load. All sources sleep outside operating hours.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-foreground-label">Source</th>
                      <th className="text-center py-2 px-3 font-medium text-foreground-label">Min (min)</th>
                      <th className="text-center py-2 px-3 font-medium text-foreground-label">Max (min)</th>
                      <th className="text-left py-2 pl-3 font-medium text-foreground-label text-xs">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="py-2 pr-4 font-medium">FreeFlightWx</td>
                      <td className="py-2 px-3"><Input type="number" min="1" max="60" className="w-20 mx-auto" value={settings.weatherScraper_ffwx_min} onChange={(e) => updateField("weatherScraper_ffwx_min", e.target.value)} /></td>
                      <td className="py-2 px-3"><Input type="number" min="1" max="60" className="w-20 mx-auto" value={settings.weatherScraper_ffwx_max} onChange={(e) => updateField("weatherScraper_ffwx_max", e.target.value)} /></td>
                      <td className="py-2 pl-3 text-xs text-muted-foreground">No API rate limit</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-medium">Weather Underground</td>
                      <td className="py-2 px-3"><Input type="number" min="1" max="120" className="w-20 mx-auto" value={settings.weatherScraper_wu_min} onChange={(e) => updateField("weatherScraper_wu_min", e.target.value)} /></td>
                      <td className="py-2 px-3"><Input type="number" min="1" max="120" className="w-20 mx-auto" value={settings.weatherScraper_wu_max} onChange={(e) => updateField("weatherScraper_wu_max", e.target.value)} /></td>
                      <td className="py-2 pl-3 text-xs text-muted-foreground">~1,500 calls/day free tier</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-medium">Live-Wind</td>
                      <td className="py-2 px-3"><Input type="number" min="1" max="60" className="w-20 mx-auto" value={settings.weatherScraper_livewind_min} onChange={(e) => updateField("weatherScraper_livewind_min", e.target.value)} /></td>
                      <td className="py-2 px-3"><Input type="number" min="1" max="60" className="w-20 mx-auto" value={settings.weatherScraper_livewind_max} onChange={(e) => updateField("weatherScraper_livewind_max", e.target.value)} /></td>
                      <td className="py-2 pl-3 text-xs text-muted-foreground"></td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-medium">BOM</td>
                      <td className="py-2 px-3"><Input type="number" min="1" max="120" className="w-20 mx-auto" value={settings.weatherScraper_bom_min} onChange={(e) => updateField("weatherScraper_bom_min", e.target.value)} /></td>
                      <td className="py-2 px-3"><Input type="number" min="1" max="120" className="w-20 mx-auto" value={settings.weatherScraper_bom_max} onChange={(e) => updateField("weatherScraper_bom_max", e.target.value)} /></td>
                      <td className="py-2 pl-3 text-xs text-muted-foreground"></td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-medium">Davis (WeatherLink)</td>
                      <td className="py-2 px-3"><Input type="number" min="1" max="60" className="w-20 mx-auto" value={settings.weatherScraper_davis_min} onChange={(e) => updateField("weatherScraper_davis_min", e.target.value)} /></td>
                      <td className="py-2 px-3"><Input type="number" min="1" max="60" className="w-20 mx-auto" value={settings.weatherScraper_davis_max} onChange={(e) => updateField("weatherScraper_davis_max", e.target.value)} /></td>
                      <td className="py-2 pl-3 text-xs text-muted-foreground">Public embeddable page, no API key</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
                <div>
                  <label className="text-sm font-medium text-foreground-label block mb-1">Operating start hour</label>
                  <HourInput hour={settings.weatherScraperStartHour} onChange={(h) => updateField("weatherScraperStartHour", h)} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground-label block mb-1">Operating end hour</label>
                  <HourInput hour={settings.weatherScraperEndHour} onChange={(h) => updateField("weatherScraperEndHour", h)} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  className="w-5 h-5 text-accent focus:ring-accent border-border rounded cursor-pointer"
                  checked={settings.weatherScraperRunContinuously === "true"}
                  onChange={(e) => updateField("weatherScraperRunContinuously", e.target.checked ? "true" : "false")}
                />
                <span className="text-sm font-medium text-foreground-label">Run continuously (ignore operating hours)</span>
              </label>
              <p className="text-xs text-muted-foreground">All scrapers sleep outside operating hours (Melbourne time) unless "run continuously" is on. Random interval between min and max prevents predictable API patterns.</p>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-violet-500">
            <CardHeader>
              <CardTitle className="text-ink">Google Drive Document Sync</CardTitle>
              <p className="text-sm text-muted-foreground">Automatically syncs and indexes documents from Google Drive via the Apps Script bridge. Requires the Drive connection to be configured.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5 text-accent focus:ring-accent border-border rounded cursor-pointer"
                  checked={settings.driveSyncEnabled === "true"}
                  onChange={(e) => updateField("driveSyncEnabled", e.target.checked ? "true" : "false")}
                />
                <span className="text-sm font-medium text-foreground-label">Enable automatic daily sync</span>
              </label>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-foreground-label whitespace-nowrap">Run at:</label>
                <TimeInput
                  hour={settings.schedDriveSyncHour}
                  minute={settings.schedDriveSyncMinute}
                  onChange={(h, m) => { updateField("schedDriveSyncHour", h); updateField("schedDriveSyncMinute", m); }}
                />
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
              <CardTitle className="text-ink flex items-center gap-2">
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
