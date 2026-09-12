import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity, Wind, RefreshCw, Eye, X, ArrowLeft, Map } from "lucide-react";
import { GridBoundsSelector } from "@/components/GridBoundsSelector";

import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";

const WindMap = lazy(() => import("@/components/WindMap"));

function WindMapPreviewCard() {
  const [showPreview, setShowPreview] = useState(false);
  const [previewSite, setPreviewSite] = useState<{ id: string; name: string; lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!previewSite) {
      api.get<{ data: Array<{ id: string; name: string; lat: string; lon: string }> }>('/api/sites')
        .then((response) => {
          const site = response.data.find(s => s.lat && s.lon);
          if (site) setPreviewSite({ id: site.id, name: site.name, lat: parseFloat(site.lat), lon: parseFloat(site.lon) });
        })
        .catch(() => {});
    }
  }, [previewSite]);

  useEffect(() => {
    if (showPreview) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [showPreview]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-navy">
            <Activity className="w-5 h-5 mr-2 text-sky" />
            Wind Map
          </CardTitle>
          <CardDescription>
            Three-layer animated wind map with base map, speed colour overlay, and particle streaks. Particle settings are tuned per zoom level (Z0/Z5/Z10) with smooth interpolation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {previewSite && (
            <Button variant="outline" onClick={() => setShowPreview(true)} className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Preview Wind Map
            </Button>
          )}
        </CardContent>
      </Card>

      {showPreview && previewSite && createPortal(
        <div className="fixed inset-0 z-[10001] bg-black flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-3 py-2 bg-black/90 border-b border-white/10 shrink-0">
            <p className="text-white/80 text-xs font-semibold truncate">
              Preview — {previewSite.name}
            </p>
            <button
              onClick={() => setShowPreview(false)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white shrink-0 ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Suspense fallback={<div className="w-full h-full flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky"></div></div>}>
              <WindMap siteId={previewSite.id} siteLat={previewSite.lat} siteLon={previewSite.lon} siteName={previewSite.name} fullscreen />
            </Suspense>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function hourLabel(h: number) {
  if (h === 0) return "12:00 am (midnight)";
  if (h === 12) return "12:00 pm (noon)";
  return h < 12 ? `${h}:00 am` : `${h - 12}:00 pm`;
}

type GridType = 'fine' | 'thermal' | 'extended';
const GRID_LABELS: Record<GridType, string> = { fine: 'Wind', thermal: 'Thermal', extended: '7-Day' };

/** Mirrors server/grid/types.ts Provenance — which source supplied which points. */
interface Provenance {
  bySource: Array<{ source: string; label: string; points: number }>;
  missing: number;
  requested: number;
  mixedFamilies: boolean;
  notes: string[];
}

function parseProvenance(raw: string | undefined): Provenance | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Provenance;
    return Array.isArray(p?.bySource) ? p : null;
  } catch {
    return null;
  }
}

interface GridHealthRecord {
  severity: "ok" | "degraded" | "critical";
  summary: string;
  at: string;
}

function parseHealth(raw: string | undefined): GridHealthRecord | null {
  if (!raw) return null;
  try {
    const h = JSON.parse(raw) as GridHealthRecord;
    return h?.severity ? h : null;
  } catch {
    return null;
  }
}

/**
 * Fallback banner. Silent while the grid is served by ECMWF (tiers 1–2),
 * including when tier 1 is rate-limited — that is the normal case and flagging
 * it would train everyone to ignore this box.
 */
function GridHealthBanner({ label, raw }: { label: string; raw: string | undefined }) {
  const health = parseHealth(raw);
  if (!health || health.severity === "ok") return null;

  const critical = health.severity === "critical";
  return (
    <div
      className={`rounded-md px-3 py-2 text-xs ${
        critical
          ? "bg-red-50 border border-red-300 text-red-800"
          : "bg-amber-50 border border-amber-300 text-amber-800"
      }`}
    >
      <div className="font-semibold">
        {critical ? "⛔" : "⚠"} {label}: {critical ? "last-resort provider used" : "reduced-quality fallback"}
      </div>
      <div className="mt-0.5">{health.summary}</div>
      <div className="mt-1 opacity-75">
        {new Date(health.at).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })}
        {critical && " — admins have been emailed"}
      </div>
    </div>
  );
}

/** Per-grid source breakdown, shown under the last-run summary. */
function ProvenanceRow({ label, raw }: { label: string; raw: string | undefined }) {
  const prov = parseProvenance(raw);
  if (!prov) return null;

  const supplied = prov.requested - prov.missing;
  const pct = prov.requested > 0 ? Math.round((supplied / prov.requested) * 100) : 0;

  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-muted-foreground w-36 shrink-0">{label} sources</span>
      <div className="space-y-0.5 min-w-0">
        <div className="text-muted-foreground">
          {supplied.toLocaleString()}/{prov.requested.toLocaleString()} points ({pct}%)
          {prov.missing > 0 && <span className="text-amber-500"> — {prov.missing.toLocaleString()} missing</span>}
        </div>
        {prov.bySource.map(s => (
          <div key={s.source} className="text-muted-foreground">
            <span className="font-medium text-navy">{s.label}</span> — {s.points.toLocaleString()} points
          </div>
        ))}
        {prov.mixedFamilies && (
          <div className="text-amber-500 font-medium">
            ⚠ Mixed ECMWF + GFS — map may show a seam
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminWeather() {
  const { settings, refreshSettings, updateSettings } = useSettings();
  const { token } = useAuth();
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [showGridSelector, setShowGridSelector] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerStartRef = useRef<number>(0);
  const lastProgressRef = useRef('');
  const [lastDurationByType, setLastDurationByType] = useState<Partial<Record<GridType, number>>>({});

  const startStatusPolling = (fast = false) => {
    if (pollRef.current) clearInterval(pollRef.current);
    let ticks = 0;
    const interval = fast ? 2000 : 5000;
    const maxTicks = fast ? 300 : 12; // fast: up to 10 min; slow: 60 s
    pollRef.current = setInterval(async () => {
      await refreshSettings();
      ticks++;
      if (ticks >= maxTicks) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
      }
    }, interval);
  };

  // Timer: runs while loadingType is a grid type
  useEffect(() => {
    if (loadingType === 'thermal' || loadingType === 'fine' || loadingType === 'extended') {
      timerStartRef.current = Date.now();
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - timerStartRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loadingType]);

  // Detect fetch completion: DB progress key clears → fetch done
  useEffect(() => {
    if (!loadingType || !['fine', 'thermal', 'extended'].includes(loadingType)) return;
    const progress = (
      loadingType === 'fine' ? settings.fineGridProgress :
      loadingType === 'thermal' ? settings.thermalGridProgress :
      settings.extendedGridProgress
    ) ?? '';

    if (lastProgressRef.current && !progress) {
      // Progress just cleared → fetch complete; show result for 5s then idle
      const finishedType = loadingType as GridType;
      setLastDurationByType(prev => ({ ...prev, [finishedType]: Math.floor((Date.now() - timerStartRef.current) / 1000) }));
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      startStatusPolling();
      const t = setTimeout(() => setLoadingType(null), 5000);
      return () => clearTimeout(t);
    }
    lastProgressRef.current = progress;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingType, settings.fineGridProgress, settings.thermalGridProgress, settings.extendedGridProgress]);

  // If page is loaded/refreshed while a fetch is already running, restart fast polling
  useEffect(() => {
    const anyInProgress = settings.thermalGridProgress || settings.fineGridProgress || settings.extendedGridProgress;
    if (anyInProgress && !pollRef.current) {
      startStatusPolling(true);
    }
  }, [settings.thermalGridProgress, settings.fineGridProgress, settings.extendedGridProgress]);

  const [schedStartHour, setSchedStartHour] = useState<number>(7);
  const [schedEndHour, setSchedEndHour] = useState<number>(20);
  const [schedContinuous, setSchedContinuous] = useState(false);
  const [schedSaving, setSchedSaving] = useState(false);

  useEffect(() => {
    setSchedStartHour(parseInt(settings.weatherScraperStartHour ?? "7", 10));
    setSchedEndHour(parseInt(settings.weatherScraperEndHour ?? "20", 10));
    setSchedContinuous(settings.weatherScraperRunContinuously === "true");
  }, [settings.weatherScraperStartHour, settings.weatherScraperEndHour, settings.weatherScraperRunContinuously]);

  const handleSaveSchedule = async () => {
    setSchedSaving(true);
    try {
      await updateSettings({
        weatherScraperStartHour: String(schedStartHour),
        weatherScraperEndHour: String(schedEndHour),
        weatherScraperRunContinuously: schedContinuous ? "true" : "false",
      });
      toast.success("Scraper schedule saved");
    } catch {
      toast.error("Failed to save schedule");
    } finally {
      setSchedSaving(false);
    }
  };

  // Grid fetches: fire-and-forget — HTTP responds immediately, background fetch runs
  const handleGridFetch = async (endpoint: string, type: GridType) => {
    setLoadingType(type);
    lastProgressRef.current = '';
    startStatusPolling(true);
    try {
      await api.post(endpoint, {}, token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
      setLoadingType(null);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    // loadingType stays set — completion detected via DB progress clearing
  };

  // Live weather: synchronous, short-running — use original pattern
  const handleScrapeNow = async () => {
    setLoadingType('liveWeather');
    setMessages(prev => ({ ...prev, liveWeather: "" }));
    try {
      const data = await api.post<{ success?: boolean; message?: string }>("/api/weather/scrape-now", {}, token);
      const message = data.message || "Failed to download data";
      setMessages(prev => ({ ...prev, liveWeather: message }));
      if (data.success) {
        toast.success(message);
        setTimeout(() => setMessages(prev => ({ ...prev, liveWeather: "" })), 5000);
      } else {
        toast.error(message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setMessages(prev => ({ ...prev, liveWeather: msg }));
      toast.error(msg);
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-navy transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-navy mb-2">Weather Management</h1>
          <p className="text-muted-foreground">Manage weather data scraping and preview the wind map.</p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center text-navy">
                    <Wind className="w-5 h-5 mr-2 text-sky" />
                    Live Weather Data
                  </CardTitle>
                  <CardDescription>
                    {schedContinuous
                      ? "Live weather observations fetched automatically every 15–30 minutes, continuously (no time restriction)."
                      : `Live weather observations fetched automatically every 15–30 minutes between ${hourLabel(schedStartHour)} and ${hourLabel(schedEndHour)} Melbourne time.`
                    }
                    {settings.weatherScraperLastRun && (
                      <span className="block mt-1 text-emerald-600 font-medium">
                        Last Update: {new Date(settings.weatherScraperLastRun).toLocaleString('en-AU', { timeZone: 'Australia/Melbourne' })} (Melbourne Time)
                      </span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleScrapeNow}
                    disabled={loadingType !== null}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingType === 'liveWeather' ? 'animate-spin' : ''}`} />
                    {loadingType === 'liveWeather' ? "Fetching..." : "Fetch Now"}
                  </Button>
                  {messages.liveWeather && (
                    <span className={`text-xs font-medium ${
                      messages.liveWeather.toLowerCase().includes('failed') || messages.liveWeather.toLowerCase().includes('error') ? 'text-red-500' :
                      messages.liveWeather.toLowerCase().includes('rate limited') || messages.liveWeather.toLowerCase().includes('partial') ? 'text-amber-500' :
                      'text-emerald-500'
                    }`}>
                      {messages.liveWeather}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm font-medium text-navy mb-3">Scraper Schedule</p>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="sched-start" className="text-xs text-muted-foreground">Start time</Label>
                    <select
                      id="sched-start"
                      value={schedStartHour}
                      onChange={e => setSchedStartHour(Number(e.target.value))}
                      disabled={schedContinuous}
                      className="border border-input rounded-md px-2 py-1.5 text-sm bg-background disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-sky"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{hourLabel(i)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="sched-end" className="text-xs text-muted-foreground">End time</Label>
                    <select
                      id="sched-end"
                      value={schedEndHour}
                      onChange={e => setSchedEndHour(Number(e.target.value))}
                      disabled={schedContinuous}
                      className="border border-input rounded-md px-2 py-1.5 text-sm bg-background disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-sky"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>{hourLabel(i)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pb-1.5">
                    <input
                      type="checkbox"
                      id="sched-continuous"
                      checked={schedContinuous}
                      onChange={e => setSchedContinuous(e.target.checked)}
                      className="w-4 h-4 accent-sky cursor-pointer"
                    />
                    <Label htmlFor="sched-continuous" className="text-sm cursor-pointer">Run continuously (24 hours)</Label>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSaveSchedule}
                    disabled={schedSaving}
                    className="pb-1.5"
                  >
                    {schedSaving ? "Saving..." : "Save Schedule"}
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center text-navy">
                    <Wind className="w-5 h-5 mr-2 text-sky" />
                    Grid Data
                  </CardTitle>
                  <CardDescription>
                    Wind grid data downloaded daily at 5:00am (Wind), 5:26am (Thermal), and 5:40am (7-Day). Cached for entire day.
                  </CardDescription>
                </div>
              </div>

              {/* Fetch buttons — grey out non-active when any fetch is running */}
              {(() => {
                const activeFromDB: GridType | null =
                  settings.fineGridProgress ? 'fine' :
                  settings.thermalGridProgress ? 'thermal' :
                  settings.extendedGridProgress ? 'extended' : null;
                const activeType = (loadingType as GridType | null) ?? activeFromDB;
                const anyActive = activeType !== null;

                const activeProgress = (
                  activeType === 'fine' ? settings.fineGridProgress :
                  activeType === 'thermal' ? settings.thermalGridProgress :
                  activeType === 'extended' ? settings.extendedGridProgress : ''
                ) ?? '';

                const activeLastResult = (
                  activeType === 'fine' ? settings.fineGridLastResult :
                  activeType === 'thermal' ? settings.thermalGridLastResult :
                  activeType === 'extended' ? settings.extendedForecastLastResult : undefined
                ) as string | undefined;

                const elapsedStr = loadingType
                  ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
                  : '';

                const GRID_BTNS = [
                  { type: 'fine'     as GridType, label: 'Wind',    endpoint: '/api/weather/fine-grid/fetch-now' },
                  { type: 'thermal'  as GridType, label: 'Thermal', endpoint: '/api/weather/thermal-grid/fetch-now' },
                  { type: 'extended' as GridType, label: '7-Day',        endpoint: '/api/weather/extended-forecast/fetch-now' },
                ];

                return (
                  <>
                    <div className="grid grid-cols-3 gap-3 mt-4">
                      {GRID_BTNS.map(({ type, label, endpoint }) => {
                        const isThisActive = activeType === type;
                        const isDimmed = anyActive && !isThisActive;
                        return (
                          <Button
                            key={type}
                            variant="outline"
                            size="sm"
                            onClick={() => handleGridFetch(endpoint, type)}
                            disabled={(anyActive && !isThisActive) || loadingType === 'liveWeather'}
                            className={`flex items-center gap-2 whitespace-nowrap transition-opacity ${isDimmed ? 'opacity-40' : ''} ${isThisActive ? 'ring-2 ring-sky' : ''}`}
                          >
                            <RefreshCw className={`w-4 h-4 ${isThisActive ? 'animate-spin' : ''}`} />
                            {isThisActive ? 'Fetching…' : label}
                          </Button>
                        );
                      })}
                    </div>

                    {/* Consolidated status panel — below Wind (middle button) */}
                    {anyActive && (
                      <div className="mt-2 bg-muted/40 rounded-lg px-3 py-2 space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <RefreshCw className="w-3 h-3 animate-spin text-sky shrink-0" />
                          <span className="font-semibold text-sky shrink-0">{activeType ? GRID_LABELS[activeType] : ''}</span>
                          <span className={`flex-1 font-mono truncate ${
                            activeProgress.toLowerCase().includes('failed') ? 'text-red-500' :
                            activeProgress.toLowerCase().includes('partial') ? 'text-amber-500' :
                            'text-muted-foreground'
                          }`}>
                            {activeProgress || 'starting…'}
                          </span>
                          {elapsedStr && (
                            <span className="text-muted-foreground font-mono tabular-nums shrink-0">{elapsedStr}</span>
                          )}
                        </div>
                        {/* Show last result for 5s after completion (loadingType set, progress cleared) */}
                        {loadingType && !activeProgress && activeLastResult && (
                          <div className={`text-xs font-medium pl-5 ${
                            activeLastResult === 'ok' ? 'text-emerald-600' :
                            activeLastResult.includes('partial') ? 'text-amber-500' :
                            'text-red-500'
                          }`}>
                            {activeLastResult === 'ok' ? '✓ Completed successfully' : `✗ ${activeLastResult}`}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Last run summary */}
              <div className="mt-3 pt-3 border-t border-border space-y-1">
                {([
                  { type: 'fine' as GridType,     label: "Wind",    runKey: "fineGridLastRun",          resultKey: "fineGridLastResult" },
                  { type: 'thermal' as GridType,  label: "Thermal", runKey: "thermalGridLastRun",       resultKey: "thermalGridLastResult" },
                  { type: 'extended' as GridType, label: "7-Day",   runKey: "extendedForecastLastRun",  resultKey: "extendedForecastLastResult" },
                ]).map(({ type, label, runKey, resultKey }) => {
                  const lastRun = settings[runKey as keyof typeof settings] as string | undefined;
                  const lastResult = settings[resultKey as keyof typeof settings] as string | undefined;
                  const ok = lastResult === "ok";
                  const durationSecs = lastDurationByType[type];
                  const durationStr = durationSecs != null ? ` (took ${Math.floor(durationSecs / 60)}:${String(durationSecs % 60).padStart(2, '0')})` : '';
                  return (
                    <div key={label} className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground w-36 shrink-0">{label}</span>
                      {lastRun ? (
                        <span className={ok ? "text-emerald-600" : "text-red-500"}>
                          {ok ? "✓" : "✗"} {new Date(lastRun).toLocaleString("en-AU", { timeZone: "Australia/Melbourne", dateStyle: "short", timeStyle: "short" })}{durationStr}
                          {!ok && ` — ${lastResult}`}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">Never run</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Data provenance — which source(s) supplied the last grid */}
              {(settings.fineGridProvenance || settings.thermalGridProvenance) && (
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <GridHealthBanner label="Wind" raw={settings.fineGridHealth} />
                  <GridHealthBanner label="Thermal" raw={settings.thermalGridHealth} />
                  <ProvenanceRow label="Wind" raw={settings.fineGridProvenance} />
                  <ProvenanceRow label="Thermal" raw={settings.thermalGridProvenance} />
                </div>
              )}

              <div className="mt-3 pt-3 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGridSelector(true)}
                  className="flex items-center gap-2"
                >
                  <Map className="w-4 h-4" />
                  Configure Grid Areas
                </Button>
              </div>
            </CardHeader>
          </Card>

          <GridBoundsSelector
            isOpen={showGridSelector}
            onClose={() => setShowGridSelector(false)}
            onSaved={() => {
              setMessages(prev => ({ ...prev, fine: "", thermal: "" }));
            }}
          />

          <WindMapPreviewCard />
        </div>
      </div>
    </div>
  );
}
